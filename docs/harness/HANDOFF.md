# HANDOFF: studio harness (AI-nexus)

For any AI or person picking up the harness. Update this file in every PR here. Protocol: PROTOCOL.md.

## Current state (2026-11-26)
- Branch `claude/harness-foundation` adds the H1 foundation: `tools/nexus.py` (queue, leases, registry
  matching, status, deps, handoff, usage, outcomes, bench), `tools/studio_audit.py` (drift, gates, security),
  `studio/*.json`, `ledger/*.jsonl`, 17 unit tests, CI (`harness`) and the weekly `studio-audit` workflow,
  PROTOCOL.md and the audit pack in `docs/harness/`.
- Maturity: 20/60 measured before; 32/60 projected once merged and green (AUDIT.md section 1).
- **Stranded app work found:** Nexus app Milestones 1-3 (PWA + API, 4 provider adapters, usage budgets;
  PRs #2-#4) were merged into `foundation/nexus-specs` after that branch had already merged to main, so main
  never got them. Verified on that branch 2026-11-26: typecheck, lint, 19 vitest tests, build and smoke all pass.
  Rescue PR: `foundation/nexus-specs` -> main (T-018). The harness branch is rebased on top of it, so merge the rescue first.
- Studio focus: Rush (Duff, Nov 26, "Pause all of them we'll continue on rush"). Other games are paused in
  repos.json; their own docs don't say so yet (T-013).

## Waiting on Duff
- Merge OK for the rescue PR (T-018) and then the harness PR (T-001) (AGENTS.md rule 7).
- Archive `nexus` + `Foxboard-forge` (T-008), separate GitHub identities per AI (T-010), Rush verdict Dec 1 (T-016),
  chaos jam: unpause or cut before Dec 28 (T-014).
- `duff-ok` on the rule PRs once T-002 / T-003 / T-004 are opened.

## Next steps, in order
1. After merge: run `studio-audit` once by hand (Actions tab -> studio-audit -> Run workflow) and check its summary.
2. T-002 Rush rule lock, T-003 pre-push in duffquest + lethemoor (each its own PR, `duff-ok`).
3. T-013 write the pause into the paused repos; T-006 / T-017 workflow hardening.
4. Start logging usage + outcomes on every task (PROTOCOL.md section 4) so `bench` has data by mid-December.

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
- 2026-11-26 23:25 UTC Claude: #6 and #7 merged on Duff's OK; harness + Nexus CI green on main; first studio-audit run succeeded (all public repos cloned). T-001, T-009, T-018 marked done.
- 2026-11-26 Claude: audit of all studio repos + H1 foundation branch (this file).
