# HANDOFF: studio harness (AI-nexus)

For any AI or person picking up the harness. Update this file in every PR here. Protocol: PROTOCOL.md.

## Current state (2026-11-26)
- Branch `claude/harness-foundation` adds the H1 foundation: `tools/nexus.py` (queue, leases, registry
  matching, status, deps, handoff, usage, outcomes, bench), `tools/studio_audit.py` (drift, gates, security),
  `studio/*.json`, `ledger/*.jsonl`, 16 unit tests, CI (`nexus`) and the weekly `studio-audit` workflow,
  PROTOCOL.md and the audit pack in `docs/harness/`.
- Maturity: 19/60 measured before; 31/60 projected once merged and green (AUDIT.md section 1).
- Studio focus: Rush (Duff, Nov 26, "Pause all of them we'll continue on rush"). Other games are paused in
  repos.json; their own docs don't say so yet (T-013).

## Waiting on Duff
- Merge OK for the foundation PR (AGENTS.md rule 7). (T-001)
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
- `nexus.py` pushes lease refs with `--no-verify` (no code in them). The game repos' push guard is not involved.
- `studio_audit.py` skips private repos unless `--include-private`; never commit a report made with that flag.
- Game repos' Claude guard blocks force pushes; `takeover`/`release` use `--force-with-lease` on lease refs here only.

## Log (newest first)
- 2026-11-26 Claude: audit of all studio repos + H1 foundation branch (this file).
