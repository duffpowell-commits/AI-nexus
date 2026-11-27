# Harness improvement loop (v1.1 candidate)

Owner: Duff. Nexus is the studio coordination source of truth; game rules remain in godot-game-starter.
Do not create another queue, rulebook, memory store or cost ledger. Follow [PROTOCOL.md](../../PROTOCOL.md) and each
repo's own approval gates. This is a proposal until independently reviewed and merged.

## Seven mechanisms and their existing homes

| Mechanism | Canonical location / operation |
|---|---|
| Persistent memory | Per-repo handoff and decisions; studio/tasks.json and studio/repos.json; this improvement register for cross-repo lessons |
| Self-audit | Weekly studio-audit Actions report (mechanical checks); Sunday ChatGPT audit (reasoning, evidence, recommendations) |
| Learn from corrections | Register a verified root cause, proposed prevention, owner, test and rollback below; keep corrections at their narrowest applicable scope |
| Cross-AI review | Fresh-eyes gate where applicable; otherwise independent reader gets the diff, repo rules and evidence, not the author's conclusions |
| Research | Monday AI Game Dev Brief; bring only relevant verified discoveries into this register, with source/date/Android suitability |
| Benchmark | Existing outcome and usage ledgers; nexus.py bench; tools/improvement_report.py for weekly comparisons |
| Versioned instructions | GitHub PRs to the canonical rule owner; review, test, approval where required and revert if the experiment fails |

## Weekly cycle

1. Collect actual outcomes, usage rows, handoffs, user corrections, PR and CI evidence. Do not copy
   private data, secrets, raw personal chats or confidential prompts into public repositories.
2. Run `python3 tools/nexus.py validate`, `python3 tools/nexus.py bench`, and
   `python3 tools/improvement_report.py`. Compare the latest seven days with the preceding seven
   days (UTC, exclusive cutoff); record the cutoff so the comparison is reproducible.
3. Compare with the most recent studio-audit report and active tasks. Separate an observed
   failure from a hypothesis; do not duplicate tasks. Missing data stays unknown.
4. Choose at most seven proposals, ranked by impact, evidence, effort and fit with Duff's
   current studio focus (Rush first). Research only when there is a concrete unresolved question.
5. For each chosen proposal record a baseline, a measurable acceptance test, review method,
   owner, trial period and rollback. Route through the existing task queue and lease protocol.
6. Make a small branch/PR, with focused tests, then obtain independent review and required
   approval. Do not auto-edit rules, expand permissions or spend money. Retain proven guards.
7. At the following audit compare evidence. Record keep / revise / revert / insufficient data.
   Adopt only when benefits are demonstrated; revert using a normal PR, never rewriting history.

### Scorecard

Targets below are aspirational, not measured results. Label numerator/denominator; unknown evidence
cannot count as a pass. Compare like tasks, and show sample sizes. Use the existing 3-outcome minimum
for initial agent comparisons, not as proof of superiority. A week with zero entries has no baseline.

| Metric | Target | Evidence |
|---|---|---|
| First-pass task success | 90%+ | independently verified outcome and first CI pass; report separately |
| Context retention | 95%+ | independent review of required handoff facts on resumed tasks |
| Approved art preservation | 100% | approved asset reference + before/after renders for applicable visual tasks |
| Build verification | 100% | verified build/CI and runtime evidence for applicable tasks |
| Handoff completeness | 100% | branch, commit, PR, tests, blockers and next action checked at session end |
| Unauthorized spending | 0 | actual invoice/approval comparison; estimates separately labeled |
| Repeated preventable failures | 0 | confirmed recurrence of a previously documented and adopted prevention |

Automated report measures existing outcome entries, pass rate when sample >= 3, recorded first-CI
pass count, review blocker count, and source-separated usage. The remaining metrics need evidence
review. Do not treat unlogged work or unavailable data as success. Outcome entries may include
multiple attempts of one task. Never sum overlapping estimates, meters and invoice rows; only
invoice data establishes real billed cost.

### Weekly report template

- Date/cutoff; scope and inaccessible evidence
- Baseline and comparison with last week (sample sizes, unknowns)
- Repeat failures and candidate preventions (links, not private content)
- Up to seven proposed changes; existing task IDs, suggested owner and priority
- Review of past trials: verdict, evidence, next action
- What Duff needs to decide; one mobile-friendly next step

## Improvement register (append dated entries; preserve history)

| ID | Date | Observed failure / opportunity | Prevention / experiment | Evidence and verification | State |
|---|---|---|---|---|---|
| IMP-001 | 2026-11-27 | Stacked PRs stranded Nexus milestones 1–3 on a merged base | Keep fresh-main and main-targeting rule; verify by inspecting next 3 Nexus PR bases and merge results | [Audit I1](AUDIT.md), [rescue PR 6](https://github.com/duffpowell-commits/AI-nexus/pull/6); rule in PROTOCOL.md | Existing rule; regression check pending |
| IMP-002 | 2026-11-27 | Multiple competing Duff Quest handoffs | Existing T-007; check one authoritative handoff and working pointers | [Audit D3](AUDIT.md); verify actual files in T-007 PR | Queued, not implemented here |
| IMP-003 | 2026-11-27 | Empty outcome and usage ledgers prevent real routing comparisons | Existing T-015; collect 14 days of real rows, use weekly report with unknowns | ledger files on main were comment-only when inspected; report tests cover empty/small samples | Trial, baseline unknown |
| IMP-004 | 2026-11-27 | Research and mechanical drift audit may overlap | Separate Sunday audit (improvement decisions) from Monday research and CI drift scan | Compare first two Sunday reports to existing tasks and briefs; avoid duplicates | Trial, pending first run |
| IMP-005 | 2026-11-27 | Rules can accumulate without evidence of benefit | Time-bound, versioned experiments with rollback and independent review | This PR, four scorecard regression tests; trial audit should record before/after outcomes | Candidate |

For a new experiment append a row and a detail block: ID, observation + evidence link, proposed
change, existing task or new queue ID, baseline, acceptance test, owner, trial cutoff, review
evidence, rollback and verdict. Corrections supersede earlier entries by reference, not silent edits.
Do not claim an experiment succeeded merely because the documentation merged.

## Monthly maintenance

Compare like work across agents after the data exists. Retire stale guesses and redundant rules by
reviewed PR; do not overwrite approved art, release gates, studio priorities or historical logs.
A future Nexus phone dashboard may surface this register and read-only scorecard; do not build an
additional backend until there is useful ledger data and H2/H3 are satisfied.
