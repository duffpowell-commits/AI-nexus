"""Tests for tools/nexus.py and tools/studio_audit.py. Stdlib unittest; no network.

Leases run against a throwaway local bare repo, never GitHub.
Run: python3 -m unittest discover -s tests -v   (prints OK at the end)
"""
import contextlib
import io
import json
import os
import shutil
import subprocess
import sys
import tempfile
import threading
import unittest

HERE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(HERE, "tools"))
import nexus  # noqa: E402
import studio_audit  # noqa: E402


def sh(*args, cwd):
    subprocess.run(args, cwd=cwd, check=True, capture_output=True)


def write(p, body):
    with open(p, "w") as fh:
        fh.write(body)


class Sandbox:
    """A copy of studio/ + ledger/ in a git repo whose origin is a local bare repo."""

    def __init__(self):
        self.dir = tempfile.mkdtemp(prefix="nexus-test-")
        self.bare = os.path.join(self.dir, "remote.git")
        self.root = os.path.join(self.dir, "work")
        sh("git", "init", "--quiet", "--bare", self.bare, cwd=self.dir)
        os.makedirs(self.root)
        for d in ("studio", "ledger"):
            shutil.copytree(os.path.join(HERE, d), os.path.join(self.root, d))
        sh("git", "init", "--quiet", cwd=self.root)
        sh("git", "remote", "add", "origin", self.bare, cwd=self.root)
        self.old = os.environ.get("NEXUS_ROOT")
        os.environ["NEXUS_ROOT"] = self.root

    def clone(self):
        """A second agent's checkout of the same remote."""
        other = tempfile.mkdtemp(prefix="nexus-other-", dir=self.dir)
        for d in ("studio", "ledger"):
            shutil.copytree(os.path.join(HERE, d), os.path.join(other, d))
        sh("git", "init", "--quiet", cwd=other)
        sh("git", "remote", "add", "origin", self.bare, cwd=other)
        return other

    def tasks(self, tasks):
        with open(os.path.join(self.root, "studio", "tasks.json"), "w") as f:
            json.dump({"tasks": tasks}, f)

    def close(self):
        if self.old is None:
            os.environ.pop("NEXUS_ROOT", None)
        else:
            os.environ["NEXUS_ROOT"] = self.old
        shutil.rmtree(self.dir, ignore_errors=True)


def task(tid, **kw):
    t = {"id": tid, "title": tid, "repo": "AI-nexus", "priority": "P1", "status": "todo",
         "needs": ["shell"], "done_when": ["x"]}
    t.update(kw)
    return t


class RealFiles(unittest.TestCase):
    def test_committed_studio_files_are_valid(self):
        os.environ.pop("NEXUS_ROOT", None)
        self.assertEqual(nexus.validate(), [])


class Validation(unittest.TestCase):
    def setUp(self):
        self.sb = Sandbox()

    def tearDown(self):
        self.sb.close()

    def test_catches_bad_tasks(self):
        self.sb.tasks([
            task("T-001", status="done"),                       # done without evidence
            task("T-002", needs=["teleport"]),                  # unknown capability
            task("T-003", depends_on=["T-999"]),                # unknown dependency
            task("T-003"),                                      # duplicate id
            task("X-1"),                                        # bad id
            task("T-004", done_when=[]),                        # nothing checkable
            task("T-005", status="done", evidence="pr", approval="duff-ok"),  # approval missing
            task("T-006", repo="nowhere", owner="nobody"),
        ])
        errs = "\n".join(nexus.validate())
        for needle in ("T-001: done without evidence", "undefined capability teleport",
                       "unknown task T-999", "T-003: duplicate id", "id must look like T-001",
                       "T-004: done_when", "T-005: needs human approval", "unknown repo nowhere",
                       "unknown owner nobody"):
            self.assertIn(needle, errs)

    def test_catches_bad_ledger_rows(self):
        with open(os.path.join(self.sb.root, "ledger", "usage.jsonl"), "a") as f:
            f.write('{"ts": "2026-11-26T00:00:00Z", "agent": "hal", "source": "estimate"}\n{oops\n')
        errs = "\n".join(nexus.validate())
        self.assertIn("bad JSON", errs)


class Queue(unittest.TestCase):
    def setUp(self):
        self.sb = Sandbox()

    def tearDown(self):
        self.sb.close()

    def test_priority_then_project_rank_then_id(self):
        self.sb.tasks([task("T-001", priority="P2"), task("T-002", repo="Rush"),
                       task("T-003", repo="chaosisthemotheroforder"), task("T-004", priority="P0", repo="hunter")])
        order = [t["id"] for t in nexus.ready_tasks()]
        self.assertEqual(order, ["T-004", "T-002", "T-003", "T-001"])  # P0 first; then Rush (rank 1) before chaos (rank 2)

    def test_dependencies_capabilities_owner_and_leases(self):
        self.sb.tasks([task("T-001", status="review"),
                       task("T-002", depends_on=["T-001"], priority="P0"),
                       task("T-003", needs=["godot-headless"]),
                       task("T-004", owner="duff", needs=["github-api"], priority="P0"),
                       task("T-005", priority="P3")])
        self.assertEqual(nexus.next_task("claude")["id"], "T-003")    # T-002 blocked, T-004 Duff's
        self.assertEqual(nexus.next_task("grok"), None)               # no shell
        self.assertEqual(nexus.next_task("duff")["id"], "T-004")
        self.assertEqual(nexus.next_task("claude", leased=["T-003"])["id"], "T-005")

    def test_recommend_only_capable_agents(self):
        self.sb.tasks([task("T-001", needs=["godot-headless", "git-push"])])
        ids = [a for a, _ in nexus.recommend("T-001")]
        self.assertEqual(set(ids), {"claude", "codex"})

    def test_status_percent(self):
        self.sb.tasks([task("T-001", status="done", evidence="pr#1"), task("T-002"), task("T-003", status="cut")])
        (repo, ms, counts, pct), = nexus.status_rows()
        self.assertEqual((repo, counts["done"], counts["todo"], pct), ("AI-nexus", 1, 1, 50))


class Leases(unittest.TestCase):
    def setUp(self):
        self.sb = Sandbox()
        self.sb.tasks([task("T-001"), task("T-002")])

    def tearDown(self):
        self.sb.close()

    def test_claim_blocks_a_second_agent(self):
        nexus.claim("T-001", "claude", branch="claude/t-001")
        with self.assertRaisesRegex(nexus.NexusError, "already leased by claude"):
            nexus.claim("T-001", "codex")
        ls = nexus.all_leases()
        self.assertEqual([(l["task"], l["agent"], l["live"], l["branch"]) for l in ls],
                         [("T-001", "claude", True, "claude/t-001")])

    def test_unknown_task_cannot_be_claimed(self):
        with self.assertRaisesRegex(nexus.NexusError, "unknown task"):
            nexus.claim("T-404", "claude")

    def test_only_the_holder_heartbeats_or_releases(self):
        nexus.claim("T-001", "claude")
        with self.assertRaisesRegex(nexus.NexusError, "not codex"):
            nexus.heartbeat("T-001", "codex")
        with self.assertRaisesRegex(nexus.NexusError, "not releasing"):
            nexus.release("T-001", "codex")
        nexus.heartbeat("T-001", "claude", minutes=30, note="halfway")
        self.assertEqual(nexus.all_leases()[0]["note"], "halfway")
        self.assertTrue(nexus.release("T-001", "claude"))
        self.assertEqual(nexus.all_leases(), [])
        nexus.claim("T-001", "codex")  # free again

    def test_takeover_only_when_expired(self):
        nexus.claim("T-001", "claude", minutes=60)
        with self.assertRaisesRegex(nexus.NexusError, "is live"):
            nexus.takeover("T-001", "codex")
        nexus.claim("T-002", "claude", minutes=-5, branch="claude/t-002", note="tests half done")
        stale = [l for l in nexus.all_leases() if not l["live"]]
        self.assertEqual([l["task"] for l in stale], ["T-002"])
        sha, prev = nexus.takeover("T-002", "codex")
        self.assertEqual(prev["agent"], "claude")
        lease = [l for l in nexus.all_leases() if l["task"] == "T-002"][0]
        self.assertEqual((lease["agent"], lease["branch"], lease["live"]), ("codex", "claude/t-002", True))
        with self.assertRaisesRegex(nexus.NexusError, "not claude"):
            nexus.heartbeat("T-002", "claude")  # the old holder lost it

    def test_parallel_claims_exactly_one_wins(self):
        other = self.sb.clone()
        results = []
        barrier = threading.Barrier(2)

        def run(root, agent):
            env = dict(os.environ, NEXUS_ROOT=root)
            barrier.wait()
            p = subprocess.run([sys.executable, os.path.join(HERE, "tools", "nexus.py"), "claim", "T-001",
                                "--agent", agent], env=env, capture_output=True, text=True)
            results.append((agent, p.returncode, p.stdout + p.stderr))

        ts = [threading.Thread(target=run, args=(self.sb.root, "claude")),
              threading.Thread(target=run, args=(other, "codex"))]
        for t in ts:
            t.start()
        for t in ts:
            t.join()
        wins = [r for r in results if r[1] == 0]
        self.assertEqual(len(wins), 1, results)
        self.assertEqual(nexus.all_leases()[0]["agent"], wins[0][0])


class Ledgers(unittest.TestCase):
    def setUp(self):
        self.sb = Sandbox()

    def tearDown(self):
        self.sb.close()

    def test_usage_and_bench(self):
        nexus.usage_add("claude", "invoice", task="T-001", usd=3.0, tokens_in=1000)
        nexus.usage_add("claude", "estimate", usd=1.0)
        for r in ("pass", "pass", "fail"):
            nexus.outcome_add("claude", "T-001", r, ci_first_try=(r == "pass"), review_blockers=1)
        nexus.outcome_add("codex", "T-002", "pass")
        rep = nexus.usage_report()
        (month, agent), v = next(iter(rep.items()))
        self.assertEqual((agent, v["usd"], v["rows"], v["estimated_rows"]), ("claude", 4.0, 2, 1))
        b = nexus.bench_rows()
        self.assertAlmostEqual(b["claude"]["pass_rate"], 2 / 3)
        self.assertEqual(b["claude"]["usd_per_pass"], 2.0)
        self.assertEqual((b["claude"]["ci_first"], b["claude"]["ci_known"]), (2, 3))
        self.assertIsNone(b["codex"]["pass_rate"])  # 1 task is too few to rank
        self.assertEqual(nexus.validate(), [])

    def test_rejects_unknown_agent_and_result(self):
        with self.assertRaises(nexus.NexusError):
            nexus.usage_add("hal", "estimate")
        with self.assertRaises(nexus.NexusError):
            nexus.outcome_add("claude", "T-001", "great")


class Handoff(unittest.TestCase):
    def test_reports_real_git_state(self):
        d = tempfile.mkdtemp()
        try:
            sh("git", "init", "--quiet", "-b", "feat/x", cwd=d)
            write(os.path.join(d, "a.txt"), "a")
            sh("git", "add", "a.txt", cwd=d)
            sh("git", "-c", "user.name=t", "-c", "user.email=t@t", "commit", "-qm", "first", cwd=d)
            write(os.path.join(d, "b.txt"), "b")
            out = nexus.handoff(d, task="T-001", next_step="run tests", agent="claude")
            self.assertIn("Branch: `feat/x`", out)
            self.assertIn("never pushed", out)
            self.assertIn("`b.txt`", out)
            self.assertIn("first", out)
            self.assertIn("Next step: run tests", out)
        finally:
            shutil.rmtree(d, ignore_errors=True)


class Audit(unittest.TestCase):
    def setUp(self):
        self.root = tempfile.mkdtemp()

    def tearDown(self):
        shutil.rmtree(self.root, ignore_errors=True)

    def repo(self, name, files):
        d = os.path.join(self.root, name)
        for rel, body in files.items():
            p = os.path.join(d, rel)
            os.makedirs(os.path.dirname(p), exist_ok=True)
            write(p, body)
        sh("git", "init", "--quiet", cwd=d)
        sh("git", "add", "-A", cwd=d)
        return d

    def test_drift_gates_and_security(self):
        fake_token = "gh" + "p_" + "A" * 36  # built at runtime so this file holds no token-shaped string
        self.repo("tpl", {"GROK_STANDARDS.md": "v2", "standards/00.md": "core",
                          ".github/workflows/ok.yml": "on: push\npermissions:\n  contents: read\n",
                          ".github/workflows/jobs.yml": "on: push\njobs:\n  a:\n    permissions:\n      contents: write\n"
                                                        "    steps: []\n  b:\n    runs-on: x\n    permissions: {}\n"})
        self.repo("same", {"GROK_STANDARDS.md": "v2", "standards/00.md": "core", "QUEUE.md": "q"})
        self.repo("old", {"GROK_STANDARDS.md": "v1", "notes.txt": f"token={fake_token}\n",
                          ".env": "X=1",
                          ".github/workflows/bad.yml":
                              "on: pull_request_target\njobs:\n  a:\n    steps:\n"
                              "      - uses: someone/thing@v1\n"
                              "      - run: echo \"${{ github.event.pull_request.title }}\"\n"})
        self.repo("privmarket", {"x.txt": fake_token})
        manifest = {"template": "tpl", "sync_files": ["GROK_STANDARDS.md"], "sync_dirs": ["standards"],
                    "repos": [{"name": "tpl", "role": "standards", "state": "active", "visibility": "public"},
                              {"name": "same", "role": "game", "state": "active", "visibility": "public"},
                              {"name": "old", "role": "game", "state": "active", "visibility": "public"},
                              {"name": "gone", "role": "game", "state": "active", "visibility": "public"}]}
        games, rows = studio_audit.drift(self.root, manifest)
        cells = {r["item"]: r["cells"] for r in rows}
        self.assertEqual(cells["GROK_STANDARDS.md"], {"same": "same", "old": "differs", "gone": "not scanned"})
        self.assertEqual(cells["standards/"]["old"], "MISSING")
        g = studio_audit.gates(self.root, manifest)
        self.assertTrue(g["same"]["queue"])
        self.assertFalse(g["old"]["queue"])
        self.assertIsNone(g["gone"])
        f = studio_audit.security(self.root, manifest)
        what = "\n".join(f"{s} {r} {w} {x}" for s, r, w, x in f)
        self.assertIn("HIGH old notes.txt:1 looks like a GitHub token", what)
        self.assertNotIn(fake_token, what)  # never echo the value
        self.assertIn("HIGH old .env secret-type file", what)
        self.assertIn("pull_request_target", what)
        self.assertIn("script injection", what)
        self.assertIn("LOW old .github/workflows/bad.yml third-party action someone/thing@v1", what)
        self.assertIn("MEDIUM old .github/workflows/bad.yml no permissions: block", what)
        self.assertNotIn("ok.yml", what)
        self.assertNotIn("jobs.yml", what)  # job-level permissions on every job is fine
        self.assertIn("on job(s) a ", what)  # bad.yml's only job has none
        # private repos are left out of the published report by default
        manifest["repos"].append({"name": "privmarket", "role": "market", "state": "active", "visibility": "private"})
        out = os.path.join(self.root, "r.md")
        with contextlib.redirect_stdout(io.StringIO()):
            studio_audit.main(["--root", self.root, "--manifest", self._write(manifest), "--out", out])
        with open(out) as fh:
            self.assertNotIn("privmarket", fh.read())

    def _write(self, manifest):
        p = os.path.join(self.root, "m.json")
        write(p, json.dumps(manifest))
        return p


if __name__ == "__main__":
    unittest.main()
