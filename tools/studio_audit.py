#!/usr/bin/env python3
"""studio_audit.py: rule drift + security scan across every studio repo clone. Stdlib only.

  python3 tools/studio_audit.py --root DIR [--out report.md]

Private repos (visibility "private" in the manifest) are left out unless --include-private, so a
report can be published from this public repo without leaking anything about them.
DIR holds one clone per repo, named as in studio/repos.json (case-insensitive). Repos that are
missing from DIR are listed as "not scanned", never silently skipped. Prints a Markdown report and
exits 0; --strict exits 1 when any HIGH finding exists (for CI gates later).

Checks
  drift     each synced file / dir in a game repo vs the template (same | differs | MISSING)
  gates     which repos have: fresh-eyes, rule-lock, pre-push hook, gitleaks, a handoff, a queue
  security  workflows: no top-level permissions, pull_request_target, untrusted ${{ }} in run:,
            third-party actions not pinned to a commit SHA; tracked files: secret-looking strings,
            committed secret files (.env, keystores that are not .enc)
"""
import argparse
import fnmatch
import hashlib
import json
import os
import re
import subprocess
import sys

HERE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

SECRET_PATTERNS = [
    ("GitHub token", re.compile(r"\b(gh[pousr]_[A-Za-z0-9]{36,}|github_pat_[A-Za-z0-9_]{60,})\b")),
    ("Anthropic key", re.compile(r"\bsk-ant-[A-Za-z0-9_-]{30,}")),
    ("OpenAI key", re.compile(r"\bsk-(proj-)?[A-Za-z0-9_-]{40,}")),
    ("AWS access key", re.compile(r"\bAKIA[0-9A-Z]{16}\b")),
    ("Slack token", re.compile(r"\bxox[baprs]-[A-Za-z0-9-]{10,}")),
    ("Private key", re.compile(r"-----BEGIN (RSA |EC |OPENSSH |DSA )?PRIVATE KEY-----")),
    ("Hugging Face token", re.compile(r"\bhf_[A-Za-z0-9]{34,}\b")),
    ("Google API key", re.compile(r"\bAIza[0-9A-Za-z_-]{35}\b")),
]
# Base64 image payloads (Foxboard results/jobs) produce random matches; skip them by content shape.
SKIP_FILE = re.compile(r"\.(png|jpg|jpeg|webp|gif|ogg|wav|mp3|mp4|glb|gltf|fbx|blend|import|ttf|otf|"
                       r"zip|apk|aab|keystore\.enc|b64|uid|res|scn|tres|pck)$", re.I)
SECRET_FILES = ["*.env", ".env", ".env.*", "*.keystore", "*.jks", "secrets.*", "*.pem", "id_rsa*"]
UNTRUSTED_EXPR = re.compile(r"\$\{\{\s*github\.(event\.(pull_request\.(title|body|head\.ref)|issue\.(title|body)|"
                            r"comment\.body|review\.body|head_commit\.message|commits)|head_ref)")
USES = re.compile(r"^\s*-?\s*uses:\s*([^\s#]+)", re.M)
FIRST_PARTY = ("actions/", "github/")


def git_files(repo):
    p = subprocess.run(["git", "-C", repo, "ls-files", "-z"], capture_output=True)
    if p.returncode != 0:
        return [os.path.relpath(os.path.join(d, f), repo) for d, _, fs in os.walk(repo)
                if "/.git" not in d for f in fs]
    return [f for f in p.stdout.decode("utf-8", "replace").split("\0") if f]


def digest(p):
    if os.path.isdir(p):
        h = hashlib.sha256()
        for d, _, fs in sorted(os.walk(p)):
            for f in sorted(fs):
                fp = os.path.join(d, f)
                h.update(os.path.relpath(fp, p).encode())
                with open(fp, "rb") as fh:
                    h.update(fh.read())
        return h.hexdigest()
    with open(p, "rb") as fh:
        return hashlib.sha256(fh.read()).hexdigest()


def find_clone(root, name):
    for d in os.listdir(root):
        if d.lower() == name.lower() and os.path.isdir(os.path.join(root, d)):
            return os.path.join(root, d)
    return None


def drift(root, manifest):
    tpl = find_clone(root, manifest["template"])
    games = [r["name"] for r in manifest["repos"] if r["role"] in ("game", "creative")]
    items = manifest["sync_files"] + [d + "/" for d in manifest.get("sync_dirs", [])]
    rows = []
    for item in items:
        ref = os.path.join(tpl, item.rstrip("/")) if tpl else None
        ref_d = digest(ref) if ref and os.path.exists(ref) else None
        row = {"item": item, "cells": {}}
        for g in games:
            c = find_clone(root, g)
            if not c:
                row["cells"][g] = "not scanned"
                continue
            p = os.path.join(c, item.rstrip("/"))
            if not os.path.exists(p):
                row["cells"][g] = "MISSING"
            elif ref_d is None:
                row["cells"][g] = "no template copy"
            else:
                row["cells"][g] = "same" if digest(p) == ref_d else "differs"
        rows.append(row)
    return games, rows


GATES = [
    ("fresh-eyes", lambda files: ".github/workflows/fresh_eyes.yml" in files),
    ("rule-lock", lambda files: ".github/workflows/rule_lock.yml" in files),
    ("pre-push", lambda files: ".githooks/pre-push" in files),
    ("duff-ok guard", None),  # content check below
    ("gitleaks", lambda files: any("gitleaks" in f.lower() for f in files if f.startswith(".github/workflows/"))),
    ("handoff", lambda files: any(re.search(r"(^|/)HANDOFF[^/]*\.md$", f) or f == "STATUS.md" for f in files)),
    ("queue", lambda files: "QUEUE.md" in files),
]


def gates(root, manifest):
    out = {}
    for r in manifest["repos"]:
        if r["state"] == "empty":
            continue
        c = find_clone(root, r["name"])
        if not c:
            out[r["name"]] = None
            continue
        files = set(git_files(c))
        row = {}
        for name, fn in GATES:
            if fn is None:
                g = os.path.join(c, ".claude/hooks/guard.py")
                row[name] = os.path.exists(g) and "check_label" in open(g, encoding="utf-8", errors="replace").read()
            else:
                row[name] = fn(files)
        out[r["name"]] = row
    return out


def security(root, manifest):
    findings = []  # (severity, repo, where, what)
    for r in manifest["repos"]:
        c = find_clone(root, r["name"])
        if not c or r["state"] == "empty":
            continue
        files = git_files(c)
        for f in files:
            base = os.path.basename(f)
            if any(fnmatch.fnmatch(base, pat) for pat in SECRET_FILES) and not f.endswith(".enc"):
                findings.append(("HIGH", r["name"], f, "secret-type file is committed"))
            if f.startswith(".github/workflows/") and f.endswith((".yml", ".yaml")):
                findings += scan_workflow(r["name"], c, f)
            if SKIP_FILE.search(f):
                continue
            fp = os.path.join(c, f)
            try:
                if os.path.getsize(fp) > 2_000_000:
                    continue
                with open(fp, encoding="utf-8", errors="ignore") as fh:
                    for n, line in enumerate(fh, 1):
                        if len(line) > 5000:  # minified/base64 blobs
                            continue
                        for label, pat in SECRET_PATTERNS:
                            if pat.search(line):
                                findings.append(("HIGH", r["name"], f"{f}:{n}", f"looks like a {label} (value not shown)"))
            except OSError:
                pass
    return findings


def scan_workflow(repo, clone, f):
    out = []
    text = open(os.path.join(clone, f), encoding="utf-8", errors="replace").read()
    if not re.search(r"^permissions:", text, re.M):
        bare = [j for j, body in jobs(text) if not re.search(r"^    permissions:", body, re.M)]
        if bare:
            out.append(("MEDIUM", repo, f, "no permissions: block at top level or on job(s) "
                        + ", ".join(bare) + " (token gets the repo default, often write-all)"))
    if re.search(r"^\s*pull_request_target\s*:", text, re.M) or re.search(r"on:\s*\[?[^\n]*pull_request_target", text):
        out.append(("HIGH", repo, f, "pull_request_target: runs fork code with secrets if it checks out the PR"))
    for n, line in enumerate(text.splitlines(), 1):
        if UNTRUSTED_EXPR.search(line) and not re.match(r"\s*group:", line):
            out.append(("HIGH", repo, f"{f}:{n}", "untrusted github.event text expanded inline (script injection)"))
    for m in USES.finditer(text):
        ref = m.group(1)
        if ref.startswith(("./", "docker://")) or ref.startswith(FIRST_PARTY):
            continue
        if not re.search(r"@[0-9a-f]{40}$", ref):
            out.append(("LOW", repo, f, f"third-party action {ref} is pinned to a tag, not a commit SHA"))
    return out


def jobs(text):
    """[(job_id, body)] for a workflow's top-level jobs: block (2-space indented job ids)."""
    m = re.search(r"^jobs:\s*$", text, re.M)
    if not m:
        return []
    out, cur, buf = [], None, []
    for line in text[m.end():].splitlines():
        if re.match(r"^\S", line):  # next top-level key ends jobs:
            break
        jm = re.match(r"^  ([A-Za-z0-9_-]+):\s*$", line)
        if jm:
            if cur:
                out.append((cur, "\n".join(buf)))
            cur, buf = jm.group(1), []
        elif cur:
            buf.append(line)
    if cur:
        out.append((cur, "\n".join(buf)))
    return out


def render(root, manifest):
    lines = ["# Studio audit", ""]
    scanned = [r["name"] for r in manifest["repos"] if find_clone(root, r["name"])]
    missing = [r["name"] for r in manifest["repos"] if not find_clone(root, r["name"])]
    lines.append(f"Scanned: {', '.join(scanned) or 'none'}")
    lines.append(f"Not scanned (no clone): {', '.join(missing) or 'none'}")
    lines += ["", f"## Rule drift vs {manifest['template']}", ""]
    games, rows = drift(root, manifest)
    lines.append("| synced item | " + " | ".join(games) + " |")
    lines.append("|---|" + "---|" * len(games))
    for row in rows:
        lines.append(f"| `{row['item']}` | " + " | ".join(row["cells"][g] for g in games) + " |")
    n_drift = sum(1 for row in rows for v in row["cells"].values() if v in ("differs", "MISSING"))
    lines += ["", f"Drifted or missing cells: **{n_drift}**", "", "## Gates per repo", ""]
    g = gates(root, manifest)
    names = [n for n, _ in GATES]
    lines.append("| repo | " + " | ".join(names) + " |")
    lines.append("|---|" + "---|" * len(names))
    for repo, row in g.items():
        if row is None:
            lines.append(f"| {repo} | " + " | ".join("?" for _ in names) + " |")
        else:
            lines.append(f"| {repo} | " + " | ".join("yes" if row[n] else "**no**" for n in names) + " |")
    f = security(root, manifest)
    order = {"HIGH": 0, "MEDIUM": 1, "LOW": 2}
    f.sort(key=lambda x: (order[x[0]], x[1], x[2]))
    counts = {s: sum(1 for x in f if x[0] == s) for s in order}
    lines += ["", "## Security", "",
              f"HIGH {counts['HIGH']} / MEDIUM {counts['MEDIUM']} / LOW {counts['LOW']}", ""]
    if f:
        lines += ["| sev | repo | where | finding |", "|---|---|---|---|"]
        lines += [f"| {s} | {r} | `{w}` | {what} |" for s, r, w, what in f]
    else:
        lines.append("No findings.")
    return "\n".join(lines) + "\n", counts, n_drift


def main(argv=None):
    ap = argparse.ArgumentParser()
    ap.add_argument("--root", required=True, help="directory with one clone per repo")
    ap.add_argument("--manifest", default=os.path.join(HERE, "studio", "repos.json"))
    ap.add_argument("--out")
    ap.add_argument("--strict", action="store_true")
    ap.add_argument("--include-private", action="store_true",
                    help="also scan private repos (never publish that report in a public repo)")
    a = ap.parse_args(argv)
    with open(a.manifest, encoding="utf-8") as fh:
        manifest = json.load(fh)
    if not a.include_private:
        manifest = dict(manifest, repos=[r for r in manifest["repos"] if r.get("visibility") != "private"])
    report, counts, n_drift = render(a.root, manifest)
    if a.out:
        with open(a.out, "w", encoding="utf-8") as fh:
            fh.write(report)
    sys.stdout.write(report)
    print(f"STUDIO AUDIT DONE high={counts['HIGH']} medium={counts['MEDIUM']} low={counts['LOW']} drift={n_drift}")
    return 1 if a.strict and counts["HIGH"] else 0


if __name__ == "__main__":
    sys.exit(main())
