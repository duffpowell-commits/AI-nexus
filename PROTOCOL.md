# 3 Eyed Fox Studios: shared AI operating protocol

For every AI that works on the studio's repos: Claude, Codex, ChatGPT, Grok, Gemini, Copilot, and
anyone else. Version 1, 2026-11-26. Owner: Duff.

**Precedence.** A repo's own `CLAUDE.md` / `AGENTS.md` / `QUEUE.md` beat this file for that repo.
This file covers what no single repo can: who works on what, how two AIs avoid the same task, and
where memory, cost and outcomes are recorded. It does not replace any repo's rules, guards or gates.

## 1. Where things live

| What | Where | Notes |
|---|---|---|
| Studio task queue | `AI-nexus/studio/tasks.json` | Studio-level and cross-repo tasks. In-game work stays in each repo's `QUEUE.md` (NOW only). |
| Who can do what | `AI-nexus/studio/agents.json` | Capabilities per AI. A task's `needs` must be a subset. |
| Repos + dependencies + finish order | `AI-nexus/studio/repos.json` | `rank` 1 = finish first. Duff owns the order. |
| Task leases (locks) | Git refs `lock/T-xxx` on the AI-nexus remote | Shows up as a branch in the GitHub app. |
| Cost + usage | `AI-nexus/ledger/usage.jsonl` | Append-only. |
| How each task went | `AI-nexus/ledger/outcomes.jsonl` | Append-only; feeds `bench`. |
| Rules for game code | `godot-game-starter` AGENTS.md + `standards/` | Master copy; synced into game repos. |
| Art + creative assets | `Foxboard` (library, style bible, Forge) | Game repos receive art through Foxboard's outbox/Forge, not by hand. |
| Per-repo memory | each repo's handoff (`docs/HANDOFF.md`, `STATUS.md`, or the file its CLAUDE.md names) + `docs/DECISIONS.md` | Updated in every PR. |

## 2. Start of every session (any AI)

1. Read the target repo's `CLAUDE.md` / `AGENTS.md`, then its handoff and `QUEUE.md`. Do what they say first
   (for example `git config core.hooksPath .githooks` in the game repos).
2. `git fetch` and branch from a fresh `origin/main`. One task = one branch. PRs target `main`: never stack a PR
   on another feature branch (AI-nexus lost three merged milestones that way on Nov 23, AUDIT.md I1).
3. Pick work: `python3 tools/nexus.py next --agent <you>` in an AI-nexus clone, or the repo's `QUEUE.md` NOW item.
   Don't start anything that isn't in one of those two places. New ideas go under IDEAS with a date.
4. **Take the lease before the first edit:** `python3 tools/nexus.py claim T-xxx --agent <you> --branch <your-branch>`.
   If it says "already leased", pick something else. Never work on a leased task.
5. If `nexus.py stale` lists an expired lease, that work was interrupted: see section 5.

## 3. While working

- `heartbeat` your lease at least every 2 hours (default lease = 120 min):
  `python3 tools/nexus.py heartbeat T-xxx --agent <you> --note "what's done so far"`.
- Push your branch after every chunk of work (the repo's push guard may require tests first).
- Commit trailer on every commit: `AI-Agent: <id>` (all AIs share Duff's GitHub account today, so this
  is the only way to tell who did what; see AUDIT finding S1).
- Never claim a test passed that you didn't run. Paste the real last line (`TESTS PASS`, `AUTOPLAY PASS`, `OK`).
- Never put secrets, tokens, personal or family info in a repo, commit, log, issue or chat. Duff adds secrets.
- Nothing from a private repo (today: the market repo) goes into a public repo, issue, PR or prompt.

## 4. End of every session

1. Push the branch. Open a PR (draft is fine) and fill in the repo's PR template if it has one.
2. Update the repo's handoff file. Generate the factual part:
   `python3 tools/nexus.py handoff --repo <path> --task T-xxx --agent <you> --next "<one next action>"`
   and paste it into the handoff log (newest first) or the PR body. Fill in the next step yourself.
3. Record the outcome when a task ends:
   `python3 tools/nexus.py outcome add --agent <you> --task T-xxx --result pass|fail|abandoned --ci-first-try yes|no --review-blockers N --pr <url>`.
4. Record usage you can see: `python3 tools/nexus.py usage add --agent <you> --source <invoice|api-response|app-meter|estimate> ...`.
   Only `invoice` rows are real money; reports count the rest as estimates. Never guess a number and label it real.
5. `release` your lease if you're done, or leave a heartbeat note if someone should resume.

## 5. Recovering an interrupted session

- `python3 tools/nexus.py stale` lists expired leases with the branch and last note.
- `python3 tools/nexus.py takeover T-xxx --agent <you>` takes it, only if it is still expired (compare-and-swap:
  two AIs racing for it can't both win). Then check out the recorded branch, run `handoff` on it, and continue.
- Never take over a live lease. Ask Duff if a live one looks abandoned.

## 6. Leases without a shell (ChatGPT, Gemini, Grok with only a GitHub connector)

A lease is just a branch named `lock/T-xxx` in AI-nexus. Creating a branch that already exists fails, so:
- **Claim:** create branch `lock/T-xxx` from `main` with the GitHub API ("create a reference"). If GitHub says
  "Reference already exists", someone holds it: stop. Then add a file `lease.json` on that branch with
  `{"task","agent","branch","claimed_at","expires_at"}` (UTC, `YYYY-MM-DDTHH:MM:SSZ`).
- **Release:** delete the branch `lock/T-xxx`, only if `lease.json` there names you (or commit a new `lease.json`
  on it with `"released": true` and `expires_at` = now, if you can't delete branches).
- **Claim over a released/expired lease:** update `lease.json` on that branch only if it is still the version you read
  (the contents API's `sha` check makes that a compare-and-swap).
- If you can't do either, ask Duff to run the task through an AI that can (Claude or Codex).

## 7. Who gets which task (starting guesses, replaced by data)

`python3 tools/nexus.py recommend T-xxx` lists the capable AIs. Until `bench` has 3+ outcomes per AI:

| Work | First choice | Why |
|---|---|---|
| Godot code, tests, autoplay, CI, audits | Claude or Codex | needs a shell + headless Godot; both are phone-launchable |
| Fresh-eyes review of a PR | a different AI from the author | the gate only works with a fresh context |
| Game art | Foxboard Forge (free FLUX) via Claude's art-director; Grok/Gemini/ChatGPT image runs | free first; follow `docs/ART_GENERATION_GUIDE.md` in the game repo |
| Store pages, posts, copy | ChatGPT, Claude, Grok | writing; marketing goes through Foxboard + Buffer drafts |
| Research, long documents | Gemini or Claude | long context + web |
| Approvals, playtests, merges where required | Duff | only Duff |

## 8. Human approval checkpoints (Duff's taps)

Agents ask once, with tappable choices, and only for:
- anything that costs money, can't be undone, or where a wrong guess is expensive;
- rule changes: the `duff-ok` label (rule-lock repos). **Agents never add that label or ask a tool to add it**;
- art approvals (fox mascot, character likeness) on a card before building;
- merges in repos that need Duff (AI-nexus: AGENTS.md rule 7; the market repo; anything with `approval` in tasks.json).
Game repos keep their own rule: green CI + fresh-eyes PASS merges itself.

## 9. Done means

On `main` (merged), CI green, the repo's PASS lines present, screenshots in `docs/renders/` if visual, the
handoff updated, and the build in `dev` / live. In `tasks.json` a task is `done` only with an `evidence` link,
and with `approved_by` if it has an `approval`. `nexus.py validate` (run in CI) rejects anything else.

## 10. Commands

```sh
python3 tools/nexus.py validate                      # schema check, also runs in CI
python3 tools/nexus.py next --agent claude           # best ready task for you
python3 tools/nexus.py claim|heartbeat|release T-001 --agent claude
python3 tools/nexus.py locks | stale | takeover T-001 --agent codex
python3 tools/nexus.py status                        # completion per project + milestone
python3 tools/nexus.py deps duffquest                # what it depends on / what depends on it
python3 tools/nexus.py handoff --repo ../duffquest --task T-007 --agent claude --next "..."
python3 tools/nexus.py usage add|report ; outcome add ; bench
python3 tools/studio_audit.py --root <dir with clones>   # drift + gates + security
python3 -m unittest discover -s tests -v                  # harness tests (OK)
```
