#!/usr/bin/env python3
"""nexus.py: the studio harness CLI. Python 3.9+ standard library only, no installs.

One central task queue (studio/tasks.json), a capability registry (studio/agents.json), a repo
manifest with dependencies (studio/repos.json), atomic task leases stored as Git refs on this
repo's remote (refs/heads/lock/<task-id>), and append-only ledgers for usage/cost and outcomes.
Any AI that can run git can use it. An AI with only the GitHub API can do the same lease steps
by hand (PROTOCOL.md, "Leases without a shell").

Commands (run from the AI-nexus clone; `python3 tools/nexus.py <cmd> -h` for flags):
  validate                     check every studio/ and ledger/ file against its schema
  next --agent A               the best task A can take now (unblocked, unleased, capable)
  claim TASK --agent A         take the lease (atomic; fails if someone else holds it)
  heartbeat TASK --agent A     extend your lease (fails if you lost it)
  release TASK --agent A       drop your lease (only if it is still yours)
  locks                        every lease, live or expired
  stale                        expired leases: work another AI can resume
  takeover TASK --agent A      take an expired lease (compare-and-swap; never a live one)
  status                       completion per project and milestone
  deps [REPO]                  what a repo depends on and what depends on it
  recommend TASK               which agents fit a task, best first
  handoff --repo PATH          a handoff block from a repo's real git state
  usage add|report             token / cost ledger
  outcome add                  record how a finished task went
  bench                        per-agent performance from the outcome + usage ledgers
"""
import argparse
import datetime as dt
import json
import os
import re
import subprocess
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
LOCK_PREFIX = "refs/heads/lock/"
DEFAULT_LEASE_MIN = 120
TASK_ID = re.compile(r"^T-\d{3,}$")
STATUSES = ("todo", "doing", "blocked", "review", "done", "cut")
PRIORITIES = ("P0", "P1", "P2", "P3")


class NexusError(Exception):
    pass


# ---------------------------------------------------------------- files

def path(*parts):
    return os.path.join(os.environ.get("NEXUS_ROOT", ROOT), *parts)


def load_json(rel):
    with open(path(rel), encoding="utf-8") as f:
        return json.load(f)


def load_jsonl(rel):
    p = path(rel)
    if not os.path.exists(p):
        return []
    rows = []
    with open(p, encoding="utf-8") as f:
        for n, line in enumerate(f, 1):
            line = line.strip()
            if not line or line.startswith("//"):
                continue
            try:
                rows.append(json.loads(line))
            except json.JSONDecodeError as e:
                raise NexusError(f"{rel}:{n}: bad JSON ({e.msg})")
    return rows


def append_jsonl(rel, row):
    with open(path(rel), "a", encoding="utf-8") as f:
        f.write(json.dumps(row, sort_keys=True) + "\n")


OUTCOME_RESULTS = ("pass", "fail", "abandoned", "reverted")


def now():
    return dt.datetime.now(dt.timezone.utc).replace(microsecond=0)


def iso(t):
    return t.strftime("%Y-%m-%dT%H:%M:%SZ")


def parse_iso(s):
    return dt.datetime.strptime(s, "%Y-%m-%dT%H:%M:%SZ").replace(tzinfo=dt.timezone.utc)


# ---------------------------------------------------------------- validation

def validate():
    """Return a list of problems (empty = valid)."""
    errs = []
    try:
        repos = load_json("studio/repos.json")
        agents = load_json("studio/agents.json")
        tasks = load_json("studio/tasks.json")
    except (OSError, json.JSONDecodeError) as e:
        return [f"cannot read studio files: {e}"]

    repo_names = set()
    for r in repos.get("repos", []):
        n = r.get("name")
        if not n:
            errs.append("repos.json: a repo has no name")
            continue
        if n in repo_names:
            errs.append(f"repos.json: duplicate repo {n}")
        repo_names.add(n)
        for k in ("role", "visibility", "state"):
            if k not in r:
                errs.append(f"repos.json: {n} missing {k}")
        if r.get("visibility") not in ("public", "private"):
            errs.append(f"repos.json: {n} visibility must be public or private")
    for r in repos.get("repos", []):
        for d in r.get("depends_on", []):
            if d.get("repo") not in repo_names:
                errs.append(f"repos.json: {r.get('name')} depends on unknown repo {d.get('repo')}")
    if _cycle(repos.get("repos", [])):
        errs.append("repos.json: dependency cycle: " + " -> ".join(_cycle(repos.get("repos", []))))

    caps = set(agents.get("capabilities", {}))
    agent_ids = set()
    for a in agents.get("agents", []):
        aid = a.get("id")
        if not aid or not re.match(r"^[a-z][a-z0-9-]*$", aid):
            errs.append(f"agents.json: bad agent id {aid!r}")
            continue
        agent_ids.add(aid)
        for c in a.get("capabilities", []):
            if c not in caps:
                errs.append(f"agents.json: {aid} has undefined capability {c}")

    ids = set()
    for t in tasks.get("tasks", []):
        tid = t.get("id", "")
        where = f"tasks.json: {tid or '(no id)'}"
        if not TASK_ID.match(tid):
            errs.append(f"{where}: id must look like T-001")
        if tid in ids:
            errs.append(f"{where}: duplicate id")
        ids.add(tid)
        for k in ("title", "repo", "priority", "status", "needs", "done_when"):
            if k not in t:
                errs.append(f"{where}: missing {k}")
        if t.get("owner") and t["owner"] not in agent_ids:
            errs.append(f"{where}: unknown owner {t['owner']}")
        if t.get("repo") not in repo_names:
            errs.append(f"{where}: unknown repo {t.get('repo')}")
        if t.get("priority") not in PRIORITIES:
            errs.append(f"{where}: priority must be one of {PRIORITIES}")
        if t.get("status") not in STATUSES:
            errs.append(f"{where}: status must be one of {STATUSES}")
        for c in t.get("needs", []):
            if c not in caps:
                errs.append(f"{where}: needs undefined capability {c}")
        if not t.get("done_when"):
            errs.append(f"{where}: done_when must list at least one checkable condition")
        if t.get("status") == "done" and not t.get("evidence"):
            errs.append(f"{where}: done without evidence (a merged PR, run or release link)")
        if t.get("approval") and t.get("status") == "done" and not t.get("approved_by"):
            errs.append(f"{where}: needs human approval ({t['approval']}) but has no approved_by")
    for t in tasks.get("tasks", []):
        for d in t.get("depends_on", []):
            if d not in ids:
                errs.append(f"tasks.json: {t.get('id')} depends on unknown task {d}")

    for rel, need in (("ledger/usage.jsonl", ("ts", "agent", "source")),
                      ("ledger/outcomes.jsonl", ("ts", "agent", "task", "result"))):
        try:
            for i, row in enumerate(load_jsonl(rel), 1):
                for k in need:
                    if k not in row:
                        errs.append(f"{rel} row {i}: missing {k}")
                if row.get("agent") and row["agent"] not in agent_ids:
                    errs.append(f"{rel} row {i}: unknown agent {row['agent']}")
                if rel.endswith("outcomes.jsonl"):
                    if "result" in row and row["result"] not in OUTCOME_RESULTS:
                        errs.append(f"{rel} row {i}: result must be one of {', '.join(OUTCOME_RESULTS)}")
                    if "ci_first_try" in row and not isinstance(row["ci_first_try"], bool):
                        errs.append(f"{rel} row {i}: ci_first_try must be true or false")
                    rb = row.get("review_blockers")
                    if "review_blockers" in row and (isinstance(rb, bool) or not isinstance(rb, int) or rb < 0):
                        errs.append(f"{rel} row {i}: review_blockers must be a whole number >= 0")
        except NexusError as e:
            errs.append(str(e))
    return errs


def _cycle(repos):
    graph = {r.get("name"): [d.get("repo") for d in r.get("depends_on", [])] for r in repos}
    state = {}

    def visit(n, trail):
        state[n] = 1
        for m in graph.get(n, []):
            if state.get(m) == 1:
                return trail + [n, m]
            if m in graph and not state.get(m):
                c = visit(m, trail + [n])
                if c:
                    return c
        state[n] = 2
        return None

    for n in graph:
        if not state.get(n):
            c = visit(n, [])
            if c:
                return c
    return None


# ---------------------------------------------------------------- git leases

def git(*args, cwd=None, env=None, check=True, input=None):
    e = dict(os.environ)
    e.setdefault("GIT_AUTHOR_NAME", "nexus-lease")
    e.setdefault("GIT_AUTHOR_EMAIL", "nexus-lease@users.noreply.github.com")
    e.setdefault("GIT_COMMITTER_NAME", e["GIT_AUTHOR_NAME"])
    e.setdefault("GIT_COMMITTER_EMAIL", e["GIT_AUTHOR_EMAIL"])
    if env:
        e.update(env)
    p = subprocess.run(["git", *args], cwd=cwd or path(), env=e, input=input,
                       capture_output=True, text=True)
    if check and p.returncode != 0:
        raise NexusError(f"git {' '.join(args)} failed: {p.stderr.strip() or p.stdout.strip()}")
    return p


def remote():
    return os.environ.get("NEXUS_REMOTE", "origin")


def remote_locks():
    """{task_id: sha} for every lease ref on the remote."""
    out = git("ls-remote", remote(), LOCK_PREFIX + "*").stdout
    locks = {}
    for line in out.splitlines():
        sha, ref = line.split("\t")
        locks[ref[len(LOCK_PREFIX):]] = sha
    return locks


def read_lease(task, sha):
    git("fetch", "--quiet", "--no-tags", remote(), f"+{LOCK_PREFIX}{task}:refs/nexus/{task}")
    body = git("show", f"{sha}:lease.json").stdout
    return json.loads(body)


def _lease_commit(lease, parent=None):
    blob = git("hash-object", "-w", "--stdin", input=json.dumps(lease, indent=2) + "\n").stdout.strip()
    tree = git("mktree", input=f"100644 blob {blob}\tlease.json\n").stdout.strip()
    args = ["commit-tree", tree, "-m", f"lease {lease['task']} {lease['agent']} until {lease['expires_at']}"]
    if parent:
        args[2:2] = ["-p", parent]
    return git(*args).stdout.strip()


def _push(spec, lease_expect=None):
    args = ["push", "--quiet", "--no-verify"]
    # --no-verify: a lease ref is not code; the game repos' pre-push guard is for branches with code.
    if lease_expect:
        ref, sha = lease_expect
        args.append(f"--force-with-lease={ref}:{sha}")
    args += [remote(), spec]
    return git(*args, check=False)


def make_lease(task, agent, minutes, branch=None, session=None, note=None):
    t = now()
    return {"task": task, "agent": agent, "session": session or "", "branch": branch or "",
            "note": note or "", "claimed_at": iso(t),
            "expires_at": iso(t + dt.timedelta(minutes=minutes))}


def claim(task, agent, minutes=DEFAULT_LEASE_MIN, branch=None, session=None, note=None):
    _known_task(task)
    sha = _lease_commit(make_lease(task, agent, minutes, branch, session, note))
    p = _push(f"{sha}:{LOCK_PREFIX}{task}")
    if p.returncode != 0:
        held = remote_locks().get(task)
        who = read_lease(task, held) if held else {}
        if who.get("expires_at") and parse_iso(who["expires_at"]) <= now():
            # Released or expired lease still on the remote: take it with compare-and-swap.
            return takeover(task, agent, minutes, session=session, branch=branch, note=note)[0]
        raise NexusError(f"{task} is already leased by {who.get('agent', '?')} until "
                         f"{who.get('expires_at', '?')} (push refused: {p.stderr.strip()[:120]})")
    return sha


def heartbeat(task, agent, minutes=DEFAULT_LEASE_MIN, note=None):
    held = remote_locks().get(task)
    if not held:
        raise NexusError(f"{task} has no lease; claim it first")
    cur = read_lease(task, held)
    if cur.get("agent") != agent:
        raise NexusError(f"{task} is leased by {cur.get('agent')}, not {agent}")
    new = dict(cur, expires_at=iso(now() + dt.timedelta(minutes=minutes)))
    if note is not None:
        new["note"] = note
    sha = _lease_commit(new, parent=held)
    p = _push(f"{sha}:{LOCK_PREFIX}{task}")  # fast-forward only: fails if it changed hands
    if p.returncode != 0:
        raise NexusError(f"heartbeat refused, the lease changed: {p.stderr.strip()[:160]}")
    return sha


def release(task, agent):
    held = remote_locks().get(task)
    if not held:
        return False
    cur = read_lease(task, held)
    if cur.get("agent") != agent:
        raise NexusError(f"{task} is leased by {cur.get('agent')}, not {agent}; not releasing")
    # Release = expire now, as a fast-forward commit (works where ref deletion is not allowed,
    # e.g. some sandbox git proxies). The ref stays; claim/takeover treat it as free.
    done = dict(cur, expires_at=iso(now()), released=True, note=cur.get("note", ""))
    sha = _lease_commit(done, parent=held)
    p = _push(f"{sha}:{LOCK_PREFIX}{task}")
    if p.returncode != 0:
        raise NexusError(f"release refused, the lease changed: {p.stderr.strip()[:160]}")
    # Tidy up: delete the ref if allowed (compare-and-swap on our own release commit). Best effort.
    _push(f":{LOCK_PREFIX}{task}", lease_expect=(LOCK_PREFIX + task, sha))
    return True


def takeover(task, agent, minutes=DEFAULT_LEASE_MIN, session=None, branch=None, note=None):
    held = remote_locks().get(task)
    if not held:
        return claim(task, agent, minutes, session=session, branch=branch, note=note)
    cur = read_lease(task, held)
    if parse_iso(cur["expires_at"]) > now():
        raise NexusError(f"{task} is live: {cur['agent']} holds it until {cur['expires_at']}")
    how = "released" if cur.get("released") else f"expired {cur['expires_at']}"
    inherited = None if cur.get("released") else cur.get("branch")  # resume their branch, unless they finished
    new = make_lease(task, agent, minutes, branch=branch or inherited, session=session,
                     note=note or f"resumed from {cur['agent']} ({how}); their last note: {cur.get('note', '')}")
    sha = _lease_commit(new, parent=held)
    # Compare-and-swap: only replaces the exact expired lease we read.
    p = _push(f"{sha}:{LOCK_PREFIX}{task}", lease_expect=(LOCK_PREFIX + task, held))
    if p.returncode != 0:
        raise NexusError(f"takeover lost a race: {p.stderr.strip()[:160]}")
    return sha, cur


def all_leases():
    out = []
    for task, sha in sorted(remote_locks().items()):
        try:
            lease = read_lease(task, sha)
        except (NexusError, json.JSONDecodeError):
            lease = {"task": task, "agent": "?", "expires_at": "1970-01-01T00:00:00Z"}
        lease["live"] = parse_iso(lease["expires_at"]) > now()
        if lease.get("released"):
            continue  # released leases are free; nothing to resume
        out.append(lease)
    return out


# ---------------------------------------------------------------- queue

def _known_task(task):
    if not any(t["id"] == task for t in load_json("studio/tasks.json")["tasks"]):
        raise NexusError(f"unknown task {task} (add it to studio/tasks.json first)")


def agent_caps(agent):
    for a in load_json("studio/agents.json")["agents"]:
        if a["id"] == agent:
            return set(a["capabilities"])
    raise NexusError(f"unknown agent {agent} (see studio/agents.json)")


def project_rank():
    return {r["name"]: r.get("rank", 99) for r in load_json("studio/repos.json")["repos"]}


def ready_tasks(leased=None):
    tasks = load_json("studio/tasks.json")["tasks"]
    done = {t["id"] for t in tasks if t["status"] in ("done", "cut")}
    leased = set(leased or ())
    rank = project_rank()
    ready = [t for t in tasks if t["status"] == "todo" and t["id"] not in leased
             and all(d in done for d in t.get("depends_on", []))]
    return sorted(ready, key=lambda t: (PRIORITIES.index(t["priority"]), rank.get(t["repo"], 99), t["id"]))


def next_task(agent, leased=None):
    caps = agent_caps(agent)
    for t in ready_tasks(leased):
        if t.get("owner") and t["owner"] != agent:
            continue  # e.g. owner "duff": only Duff can do it (an approval or a GitHub setting)
        if set(t["needs"]) <= caps:
            return t
    return None


def recommend(task_id):
    t = next(t for t in load_json("studio/tasks.json")["tasks"] if t["id"] == task_id)
    need = set(t["needs"])
    stats = bench_rows()
    out = []
    for a in load_json("studio/agents.json")["agents"]:
        caps = set(a["capabilities"])
        if not need <= caps:
            continue
        s = stats.get(a["id"], {})
        pass_rate = s.get("pass_rate")
        out.append((-(pass_rate if pass_rate is not None else 0.5), len(caps - need), a["id"],
                    a.get("strengths", "")))
    out.sort()
    return [(aid, strengths) for _, _, aid, strengths in out]


def status_rows():
    tasks = load_json("studio/tasks.json")["tasks"]
    rows = {}
    for t in tasks:
        key = (t["repo"], t.get("milestone", "-"))
        r = rows.setdefault(key, {s: 0 for s in STATUSES})
        r[t["status"]] += 1
    out = []
    for (repo, ms), r in sorted(rows.items(), key=lambda kv: (project_rank().get(kv[0][0], 99), kv[0])):
        live = sum(v for k, v in r.items() if k != "cut")
        pct = round(100 * r["done"] / live) if live else 100
        out.append((repo, ms, r, pct))
    return out


def deps(repo=None):
    repos = load_json("studio/repos.json")["repos"]
    out = {}
    for r in repos:
        if repo and r["name"] != repo and not any(d["repo"] == repo for d in r.get("depends_on", [])):
            continue
        out[r["name"]] = {"depends_on": r.get("depends_on", []),
                          "used_by": [x["name"] for x in repos
                                      if any(d["repo"] == r["name"] for d in x.get("depends_on", []))]}
    return out


# ---------------------------------------------------------------- handoff

def handoff(repo_path, task=None, next_step=None, agent=None):
    def g(*a):
        p = git(*a, cwd=repo_path, check=False)
        return p.stdout.strip() if p.returncode == 0 else ""

    branch = g("branch", "--show-current") or "(detached)"
    head = g("rev-parse", "--short", "HEAD")
    upstream = g("rev-parse", "--abbrev-ref", "@{upstream}")
    ahead_behind = g("rev-list", "--left-right", "--count", "@{upstream}...HEAD") if upstream else ""
    dirty = g("status", "--porcelain")
    log = g("log", "-5", "--format=- %h %ad %s", "--date=short")
    url = g("config", "--get", "remote.origin.url")
    lines = [f"## Handoff {iso(now())}" + (f" ({agent})" if agent else ""), ""]
    if task:
        lines.append(f"- Task: {task}")
    lines += [f"- Repo: {url or repo_path}", f"- Branch: `{branch}` at `{head}`"]
    if upstream:
        behind, ahead = (ahead_behind.split() + ["?", "?"])[:2]
        lines.append(f"- Upstream `{upstream}`: {ahead} ahead, {behind} behind")
    else:
        lines.append("- Upstream: none (branch never pushed: push it before you stop)")
    if dirty:
        files = dirty.splitlines()
        lines.append(f"- Uncommitted: {len(files)} file(s) (commit and push before you stop):")
        lines += [f"  - `{f[3:]}`" for f in files[:15]]
    else:
        lines.append("- Uncommitted: none")
    lines += ["- Last commits:", *["  " + x for x in log.splitlines()]]
    lines.append(f"- Next step: {next_step or 'FILL IN: the one next action, and how to check it'}")
    return "\n".join(lines) + "\n"


# ---------------------------------------------------------------- ledgers

def usage_add(agent, source, task=None, tokens_in=None, tokens_out=None, usd=None,
              minutes=None, note=None):
    agent_caps(agent)
    row = {"ts": iso(now()), "agent": agent, "source": source}
    for k, v in (("task", task), ("tokens_in", tokens_in), ("tokens_out", tokens_out),
                 ("usd", usd), ("actions_minutes", minutes), ("note", note)):
        if v is not None:
            row[k] = v
    append_jsonl("ledger/usage.jsonl", row)
    return row


def usage_report():
    rows = load_jsonl("ledger/usage.jsonl")
    out = {}
    for r in rows:
        key = (r["ts"][:7], r["agent"])
        a = out.setdefault(key, {"tokens_in": 0, "tokens_out": 0, "usd": 0.0, "actions_minutes": 0,
                                 "rows": 0, "estimated_rows": 0})
        a["rows"] += 1
        if r.get("source") != "invoice":
            a["estimated_rows"] += 1
        for k in ("tokens_in", "tokens_out", "actions_minutes"):
            a[k] += int(r.get(k) or 0)
        a["usd"] += float(r.get("usd") or 0)
    return out


def outcome_add(agent, task, result, ci_first_try=None, review_blockers=None, minutes=None,
                pr=None, note=None):
    agent_caps(agent)
    if result not in OUTCOME_RESULTS:
        raise NexusError("result must be pass, fail, abandoned or reverted")
    row = {"ts": iso(now()), "agent": agent, "task": task, "result": result}
    for k, v in (("ci_first_try", ci_first_try), ("review_blockers", review_blockers),
                 ("minutes", minutes), ("pr", pr), ("note", note)):
        if v is not None:
            row[k] = v
    append_jsonl("ledger/outcomes.jsonl", row)
    return row


def bench_rows():
    outcomes = load_jsonl("ledger/outcomes.jsonl")
    usage = load_jsonl("ledger/usage.jsonl")
    out = {}
    for r in outcomes:
        a = out.setdefault(r["agent"], {"tasks": 0, "pass": 0, "ci_first": 0, "ci_known": 0,
                                        "blockers": 0, "usd": 0.0})
        a["tasks"] += 1
        a["pass"] += r["result"] == "pass"
        if "ci_first_try" in r:
            a["ci_known"] += 1
            a["ci_first"] += bool(r["ci_first_try"])
        a["blockers"] += int(r.get("review_blockers") or 0)
    for r in usage:  # invoice rows only: estimates/meters overlap invoices and are not real cost
        if r["agent"] in out and r.get("source") == "invoice":
            out[r["agent"]]["usd"] += float(r.get("usd") or 0)
    for a in out.values():
        a["pass_rate"] = a["pass"] / a["tasks"] if a["tasks"] >= 3 else None  # <3 = too few to rank
        a["usd_per_pass"] = round(a["usd"] / a["pass"], 2) if a["pass"] and a["usd"] else None
    return out


# ---------------------------------------------------------------- CLI

def main(argv=None):
    ap = argparse.ArgumentParser(prog="nexus.py", description=__doc__.split("\n")[0])
    sub = ap.add_subparsers(dest="cmd", required=True)
    sub.add_parser("validate")
    p = sub.add_parser("next"); p.add_argument("--agent", required=True)
    p.add_argument("--offline", action="store_true", help="ignore leases (no network)")
    for name in ("claim", "heartbeat", "takeover"):
        p = sub.add_parser(name); p.add_argument("task"); p.add_argument("--agent", required=True)
        p.add_argument("--minutes", type=int, default=DEFAULT_LEASE_MIN)
        p.add_argument("--branch"); p.add_argument("--session"); p.add_argument("--note")
    p = sub.add_parser("release"); p.add_argument("task"); p.add_argument("--agent", required=True)
    sub.add_parser("locks"); sub.add_parser("stale"); sub.add_parser("status")
    p = sub.add_parser("deps"); p.add_argument("repo", nargs="?")
    p = sub.add_parser("recommend"); p.add_argument("task")
    p = sub.add_parser("handoff"); p.add_argument("--repo", default=".")
    p.add_argument("--task"); p.add_argument("--next"); p.add_argument("--agent")
    p = sub.add_parser("usage"); us = p.add_subparsers(dest="ucmd", required=True)
    u = us.add_parser("add"); u.add_argument("--agent", required=True)
    u.add_argument("--source", required=True, choices=["invoice", "api-response", "app-meter", "estimate"])
    u.add_argument("--task"); u.add_argument("--tokens-in", type=int); u.add_argument("--tokens-out", type=int)
    u.add_argument("--usd", type=float); u.add_argument("--actions-minutes", type=int)
    u.add_argument("--note")
    us.add_parser("report")
    p = sub.add_parser("outcome"); os_ = p.add_subparsers(dest="ocmd", required=True)
    o = os_.add_parser("add"); o.add_argument("--agent", required=True); o.add_argument("--task", required=True)
    o.add_argument("--result", required=True); o.add_argument("--ci-first-try", choices=["yes", "no"])
    o.add_argument("--review-blockers", type=int); o.add_argument("--minutes", type=int)
    o.add_argument("--pr"); o.add_argument("--note")
    sub.add_parser("bench")
    a = ap.parse_args(argv)

    try:
        if a.cmd == "validate":
            errs = validate()
            for e in errs:
                print("FAIL", e)
            print("NEXUS VALID" if not errs else f"NEXUS INVALID ({len(errs)} problems)")
            return 1 if errs else 0
        if a.cmd == "next":
            leased = [] if a.offline else [l["task"] for l in all_leases() if l["live"]]
            t = next_task(a.agent, leased)
            if not t:
                print(f"nothing ready for {a.agent}")
                return 0
            print(f"{t['id']} [{t['priority']}] {t['repo']}: {t['title']}")
            print("  done when: " + "; ".join(t["done_when"]))
            if t.get("approval"):
                print(f"  needs Duff's approval: {t['approval']}")
            return 0
        if a.cmd == "claim":
            sha = claim(a.task, a.agent, a.minutes, a.branch, a.session, a.note)
            print(f"CLAIMED {a.task} for {a.agent} ({a.minutes} min) lease {sha[:8]}")
            return 0
        if a.cmd == "heartbeat":
            heartbeat(a.task, a.agent, a.minutes, a.note)
            print(f"EXTENDED {a.task} {a.minutes} min")
            return 0
        if a.cmd == "release":
            print(f"RELEASED {a.task}" if release(a.task, a.agent) else f"{a.task} had no lease")
            return 0
        if a.cmd == "takeover":
            r = takeover(a.task, a.agent, a.minutes, a.session, a.branch, a.note)
            if isinstance(r, tuple):
                prev = r[1]
                print(f"TOOK OVER {a.task} from {prev['agent']}; resume branch: {prev.get('branch') or '(none recorded)'}")
                if prev.get("note"):
                    print(f"  their last note: {prev['note']}")
            else:
                print(f"CLAIMED {a.task} (it had no lease)")
            return 0
        if a.cmd in ("locks", "stale"):
            ls = all_leases()
            if a.cmd == "stale":
                ls = [l for l in ls if not l["live"]]
            if not ls:
                print("no leases" if a.cmd == "locks" else "no stale leases")
            for l in ls:
                print(f"{l['task']} {l['agent']} {'LIVE' if l['live'] else 'EXPIRED'} until {l['expires_at']}"
                      f" branch={l.get('branch') or '-'} {l.get('note') or ''}".rstrip())
            return 0
        if a.cmd == "status":
            print(f"{'repo':28} {'milestone':12} todo doing blocked review done  %")
            for repo, ms, r, pct in status_rows():
                print(f"{repo:28} {ms:12} {r['todo']:4} {r['doing']:5} {r['blocked']:7} {r['review']:6} {r['done']:4} {pct:3}")
            return 0
        if a.cmd == "deps":
            print(json.dumps(deps(a.repo), indent=2))
            return 0
        if a.cmd == "recommend":
            recs = recommend(a.task)
            if not recs:
                print("no registered agent has every capability this task needs")
            for aid, s in recs:
                print(f"{aid}: {s}")
            return 0
        if a.cmd == "handoff":
            sys.stdout.write(handoff(a.repo, a.task, a.next, a.agent))
            return 0
        if a.cmd == "usage" and a.ucmd == "add":
            print(json.dumps(usage_add(a.agent, a.source, a.task, a.tokens_in, a.tokens_out, a.usd,
                                       a.actions_minutes, a.note)))
            return 0
        if a.cmd == "usage" and a.ucmd == "report":
            rep = usage_report()
            if not rep:
                print("usage ledger is empty")
            for (month, agent), v in sorted(rep.items()):
                print(f"{month} {agent:10} in={v['tokens_in']} out={v['tokens_out']} usd={v['usd']:.2f} "
                      f"actions_min={v['actions_minutes']} rows={v['rows']} (estimated: {v['estimated_rows']})")
            return 0
        if a.cmd == "outcome":
            cft = None if a.ci_first_try is None else a.ci_first_try == "yes"
            print(json.dumps(outcome_add(a.agent, a.task, a.result, cft, a.review_blockers,
                                         a.minutes, a.pr, a.note)))
            return 0
        if a.cmd == "bench":
            b = bench_rows()
            if not b:
                print("no outcomes recorded yet")
            for agent, v in sorted(b.items()):
                pr = "n<3" if v["pass_rate"] is None else f"{v['pass_rate']:.0%}"
                ci = f"{v['ci_first']}/{v['ci_known']}" if v["ci_known"] else "-"
                print(f"{agent:10} tasks={v['tasks']} pass={v['pass']} pass_rate={pr} ci_first_try={ci} "
                      f"review_blockers={v['blockers']} usd_per_pass={v['usd_per_pass'] or '-'}")
            return 0
    except NexusError as e:
        print(f"ERROR {e}", file=sys.stderr)
        return 2
    return 1


if __name__ == "__main__":
    sys.exit(main())
