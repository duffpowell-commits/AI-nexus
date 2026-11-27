# HANDOFF: studio harness (AI-nexus)

For any AI or person picking up the harness. Update this file in every PR here. Protocol: PROTOCOL.md.

## Current state (2026-11-27)
- On main: H1 foundation (T-001), the Nexus app rescue (T-018), the weekly studio audit (T-009), and the
  improvement loop from PR #10 (T-019): `docs/harness/IMPROVEMENTS.md`, `tools/improvement_report.py`,
  invoice-only `bench` cost, and `validate` type checks on outcome rows. 23 tests.
- Both ledgers are still empty, so every scorecard number is unknown. That's expected and isn't a pass.
- Studio focus: **Rush** (Duff, Nov 26: "Pause all of them we'll continue on rush"). The other games are paused in
  repos.json; their own docs don't say so yet (T-013).

## Waiting on Duff
- T-016 Rush M1 verdict by Dec 1: play one service on the APK, then keep or park it (kill criteria in Rush docs/PITCH.md).
- `duff-ok` on T-002 (Rush rule lock) once its PR is open.
- Archive `nexus` + `Foxboard-forge` (T-008), separate GitHub identities per AI (T-010), chaos jam: unpause or cut before Dec 28 (T-014).

## Next steps, in order
1. **Codex or ChatGPT: T-002 in Rush.** Copy the `duff-ok` label guard + `rule_lock` from godot-game-starter
   into duffpowell-commits/Rush on a new branch, open a PR to Rush `main`, and show the lock failing once on
   a test edit to a locked file before you call it working. No gameplay or art changes. Claim the lease first.
2. T-019 stays `doing` until the first Sunday audit (Nov 29) writes a weekly report with its cutoff and
   explicit unknowns, using `improvement_report.py --as-of`. After that, mark it done with that report as evidence.
3. Log a usage row and an outcome row at the end of every task (T-015, PROTOCOL.md section 4).
4. Then T-003 (pre-push in duffquest + lethemoor) and T-013 (pause notes), each as its own PR.
5. Review follow-ups from #10 (not urgent): `usage report` still prints one USD total across sources; fold
   `improvement_report.py` into `bench --as-of`; give scorecard rows 2-7 a measurement method or drop them.

## Gotchas
- Lease refs live on this repo's remote as branches `lock/T-xxx`. Don't delete one you don't hold.
- `release` marks the lease released (a fast-forward commit), then tries to delete the ref. Claude cloud
  sessions' git proxy refuses ref deletes (HTTP 403), so released refs can stay; they count as free.
  Verified on GitHub 2026-11-26: claim, second claim refused, heartbeat, wrong-agent release refused,
  release, re-claim by another agent, release. `lock/T-001` was left behind by that test (released, harmless).
- `nexus.py` pushes lease refs with `--no-verify` (no code in them). The game repos' push guard is not involved.
- `studio_audit.py` skips private repos unless `--include-private`; never commit a report made with that flag.
- Game repos' Claude guard blocks force pushes; `takeover`/`release` use `--force-with-lease` on lease refs here only.

## Log (newest first)
- 2026-11-27 Claude (independent review of #10, T-019): harness + Nexus CI green on head 8d46dc2; 21 tests OK and NEXUS VALID re-run here. Mutation-tested the 4 new tests: they catch window edges, the n>=3 rule, unknown blockers and source mixing, but not abandoned/reverted counted as passes (test added). Fixed two measurement bugs the loop depends on: `bench` usd_per_pass summed estimates with invoices (now invoice-only, so it stays `-` until invoice rows exist), and `validate` let hand-written outcome rows through with a bad `result`, string `ci_first_try` or negative `review_blockers` (now rejected). 23 tests OK. Follow-ups, not blockers: `usage report` still prints one USD total across sources; improvement_report.py repeats bench logic (fold into `bench --as-of` later); scorecard rows 2-7 have no automated measure yet. Merge waits on Duff's OK (AGENTS.md rule 7).
- 2026-11-27 ChatGPT: T-019, branch `chatgpt/harness-improvement-loop`. Added IMPROVEMENTS.md, read-only weekly scorecard and four focused unit tests (all passed locally); the 17 existing harness tests also passed, 21 total `OK`, and `nexus.py validate` printed `NEXUS VALID` against the fetched branch files. Both ledger files were comment-only: performance baseline unknown. Next: independent Claude review, full harness CI, Duff's merge approval if required; keep Rush as studio focus. Sunday ChatGPT audit is scheduled separately, recommendation-only. No game changes or live provider calls.
- 2026-11-26 23:25 UTC Claude: #6 and #7 merged on Duff's OK; harness + Nexus CI green on main; first studio-audit run succeeded (all public repos cloned). T-001, T-009, T-018 marked done.
- 2026-11-26 Claude: audit of all studio repos + H1 foundation branch (this file).
