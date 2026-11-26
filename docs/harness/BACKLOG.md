# Harness backlog + milestones (2026-11-26)

Order: finish the products Duff already has before building new harness parts. Task details and
`done_when` lists live in `studio/tasks.json`; this file groups them into milestones with a measurable
definition of done. A milestone is done only when every line below is true **on main** and checked.

## H1 Foundation (this PR)
Builds: central queue (1), capability assignment (2), leases (4), handoff generator (12), usage ledger (9),
outcome ledger + bench (8), completion status (13), stale-lease recovery (15), weekly studio audit (6, 11), PROTOCOL.md.

Done when:
- [ ] PR merged to AI-nexus main (Duff's OK, AGENTS.md rule 7). (T-001)
- [ ] Rescue PR (stranded app Milestones 1-3) merged first, its `Nexus CI` green on main. (T-018)
- [ ] `harness` CI job green on main; `python3 -m unittest discover -s tests` prints `OK` (17 tests).
- [ ] `python3 tools/nexus.py validate` prints `NEXUS VALID` on main.
- [ ] A real lease round-trip on the GitHub remote: claim, second claim refused, release.
- [ ] `studio-audit` workflow has one real run whose summary shows the drift + security tables. (T-009)
- [ ] Studio focus recorded: repos.json rank 1 = Duff's pick (Rush, per his Nov 26 message). (T-013 propagates it)

## H2 Close the gaps the audit found (P0/P1)
| Task | What | Measured by |
|---|---|---|
| T-002 | Rush gets rule lock + `duff-ok` guard | audit: Rush rule-lock + duff-ok guard = yes; `RULE LOCK PASS` in Rush CI |
| T-003 | pre-push hook in duffquest + lethemoor | audit: pre-push = yes for both; `PUSH GUARD PASS` |
| T-013 | Duff's "pause all, continue on Rush" written into the other game repos | each paused repo's NOW opens with the pause line |
| T-004 | re-sync standards/ + GROK_STANDARDS.md | audit drift cells for those two rows: 0, or a dated reason |
| T-005 | gitleaks in every public repo | audit: gitleaks = yes in all 9 |
| T-006 | least-privilege permissions on the 8 bare jobs | audit: MEDIUM = 0; builds still green |
| T-007 | one handoff in duffquest | 1 file claims "current"; others are pointers |
| T-008 | archive empty `nexus` + `Foxboard-forge` (Duff taps) | both show Archived |

Done when: every row's measure holds in the latest weekly audit, and the audit's drift count is under 10
(from 31) with each remaining cell explained in repos.json.

## H3 Make it measurable (P1/P2)
| Task | What | Measured by |
|---|---|---|
| T-010 | one GitHub identity per AI; fresh-eyes rejects the author's own PASS; duff-ok only from Duff's login | a test PR where the author's PASS is ignored |
| T-011 | visual regression on autoplay screenshots | CI table of changed screens; seen failing once on a deliberate change |
| T-012 | CI failure triage from real logs | unit tests on real failed logs; unknowns say "no known cause" |
| T-015 | two weeks of real usage rows | 14 days, 2+ agents; `bench` shows usd_per_pass |

Done when: `bench` ranks at least 2 AIs on 3+ outcomes each, and `recommend` uses those numbers.

## H4 Later (not scheduled)
- Re-sync bot: a starter workflow that opens the rule re-sync PRs itself (still `duff-ok` gated).
- Installed-APK smoke test, save-migration test, APK SHA-256 in a build manifest (starter QUEUE IDEAS, Nov 22).
- Nexus PWA (docs/PRODUCT.md) reads `studio/` + ledgers + leases for a phone dashboard. Only after H2 + H3:
  the data has to exist before a screen for it is worth building.

## Ground rules for every milestone
- No paid dependencies or services without Duff's OK. Everything here is stdlib Python + free GitHub Actions.
- Never mark a task done without `evidence`; never claim a run that didn't happen.
- Rule changes in rule-locked repos go in their own PR and wait for Duff's `duff-ok`.
