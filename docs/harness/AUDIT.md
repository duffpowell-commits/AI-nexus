# Studio harness audit (2026-11-26)

By Claude (cloud session), acting as systems architect + independent QA. Read-only on every repo
except AI-nexus. Evidence: shallow clones of each repo's `main` on 2026-11-26 22:10 UTC, open PRs
from GitHub search, and `tools/studio_audit.py` (raw output: `studio-audit-2026-11-26.md`).
The private market repo was read for process only; nothing from it is reproduced here.

## 1. Maturity score: 19 / 60 (32%)

Rubric per capability: **0** none · **1** written rule or manual habit · **2** built in some repos or
partly · **3** built, enforced and tested · **4** enforced studio-wide with metrics. Each score cites
what was checked.

| # | Capability | Before | Evidence | After this PR (if merged + CI green) |
|---|---|---|---|---|
| 1 | Central task queue | 1 | one `QUEUE.md` per repo, no studio view; 7 games touched in 30 days | 3 `studio/tasks.json` + `next`, validated in CI |
| 2 | Capability-based assignment | 1 | ad hoc (Grok art, Gemini art, Codex pilot idea in starter QUEUE IDEAS) | 2 registry + `next`/`recommend` match on needs ⊆ capabilities |
| 3 | Persistent cross-AI memory | 2 | strong per-repo handoffs + DECISIONS.md; 3 handoff files in duffquest, 3 log files in lethemoor, no studio memory | 2 (studio files added; per-repo cleanup is T-007) |
| 4 | Task locking | 1 | "one AI session per repo" is a written rule only (`standards/00-core.md`) | 3 atomic Git-ref leases, race-tested |
| 5 | Code + visual regression | 2 | `tools/test.sh`, autoplay PASS lines, Eyes, CI build; screenshots saved but never diffed | 2 (visual diff is T-011) |
| 6 | Cross-repo dependency tracking | 1 | "copy rules into the game repos" by hand; **31 drifted/missing cells** measured | 2 manifest + `deps` + weekly drift report |
| 7 | Failed-build diagnosis | 1 | `tasks/lessons.md`, gotchas in handoffs; nothing reads CI logs | 1 (T-012) |
| 8 | AI performance benchmarking | 0 | none | 1 ledger + `bench` (no data yet) |
| 9 | Token / usage / cost tracking | 0 | none; Hunter notes "Actions minutes are tight" | 1 ledger + report, real vs estimate labeled |
| 10 | Release quality gates | 3 | build CI, push guard needs a passing test tree, engine pinned to 4.7, fresh-eyes status, rule lock | 3 |
| 11 | Studio-wide security auditing | 1 | guard.py blocks secret files per repo; gitleaks in 2 of 9 repos; no cross-repo scan | 2 weekly scan in CI |
| 12 | Automatic handoff generation | 1 | handoff template, written by hand | 2 `handoff` builds the factual block from git |
| 13 | Prioritization + completion | 1 | per-repo milestones; studio focus contradicts across repos (finding C1) | 2 ranked manifest + `status` |
| 14 | Human approval checkpoints | 3 | `duff-ok` rule lock in CI + guard.py, art OK cards, fresh-eyes | 3 (S1 limits it: same GitHub identity) |
| 15 | Recovery from interrupted sessions | 1 | "push after every chunk", handoffs | 2 lease expiry + `stale` + `takeover` keeps the branch |
| | **Total** | **19 / 60** | | **31 / 60 projected** (counts only once merged and green) |

No eval set exists in any repo (searched for `eval set` / `evals/`): the harness tests in `tests/`
are the first one for harness work.

## 2. Implemented vs planned

**Implemented and working (seen in code + CI files):**
- godot-game-starter: Godot 4.7.2 template, `tools/test.sh` + autoplay, Eyes runtime driver, push guard
  (`guard.py` + `.githooks/pre-push`), rule lock (`duff-ok`), fresh-eyes gate, keystone signing, web export,
  audio intake (built, unproven on a real phone upload), Buffer draft workflow, `standards/` rulebook.
- Foxboard: single-file app (live as a Claude artifact + Vercel loader), Forge (free FLUX on Actions runners),
  outbox sweep into game repos (verified Nov 18/20), auto-send to games (`GAME_PUSH_TOKEN`), tests.
- Games: duffquest (2D live on itch + Pages; 3D remake in `spike_full3d/`), lethemoor (build 199 live),
  hunter (M0-M4 built, Pages live), chaos (build 62 live), Rush (M1 slice), pocket-fight/Wildmade (parked).

**Planned only (docs, no code):**
- AI-nexus before this PR: product spec, architecture (React PWA + Node API + PostgreSQL), roadmap. Zero runtime.
- `nexus` and `Foxboard-forge` repos: empty.
- Wildmade: only a draft PR (pocket-fight #2).
- Starter QUEUE IDEAS: installed-APK smoke test, bug-report replay, save migration test, APK hash manifest.

## 3. Findings

### Duplicated systems
- **D1** `nexus` and `Foxboard-forge` are empty duplicates of `AI-nexus` and `Foxboard/forge` (T-008).
- **D2** Rule copies: each game carries its own copy of guard/standards; they drifted (31 cells, section 4).
- **D3** Handoff sprawl: duffquest has `CLAUDE.md` + `STATUS.md` + `HANDOFF.md` (stale) + `docs/HANDOFF.md` (stale)
  + `HANDOFF_CHATGPT.md` + `spike_full3d/HANDOFF.md` + `docs/HANDOFF_LOG.md`; lethemoor has `STATUS.md` +
  `docs/HANDOFF_LOG.md` + `docs/BUILD_LOG.md` and no `docs/HANDOFF.md` (the template's name).
- **D4** AI-nexus's planned server (Postgres, job queue) would duplicate what GitHub already gives for free
  (history, branches, Actions). This PR builds the harness on GitHub instead; the PWA can read the same files later.

### Conflicting instructions
- **C1 Studio focus.** Duff, Nov 26 (Rush `docs/HANDOFF.md`): "Pause all of them we'll continue on rush".
  But chaos `CLAUDE.md` says "this is the one active game" with a Dec 28 jam, hunter QUEUE NOW says "Next is
  Milestone 5", duffquest says "current work is the 3D remake". An AI landing in any of those builds there (T-013).
- **C2 Merge rule.** Game repos: green + fresh-eyes merges itself. AI-nexus AGENTS.md rule 7: merges need Duff's
  explicit approval. Both are valid per repo; PROTOCOL.md section 8 states which applies where.
- **C3** duffquest's public-repo rule "never commit AI prompts, bot instructions" sits next to committed
  `CLAUDE.md`, `AGENTS.md`-style files and `grok_art/requests/`. Read as "no private prompts or personas"; worth a one-line clarification by Duff.
- **C4** duffquest QUEUE NOW holds 4 items, two dated Nov 9, against "work only on NOW" (one item).

### Incomplete work
- 14 open PRs studio-wide (8 drafts); 10 are more than 3 days old. Oldest outside the market repo: chaos #9 and
  duffsengine #1 (Nov 15), Foxboard #1 (Nov 19), lethemoor #31 (Nov 20), hunter #12 (Nov 21), lethemoor #36 (Nov 22).
  The market repo holds 5 of them (oldest Nov 11).
- Eyes copied to lethemoor + Rush only (starter HANDOFF next step 2).
- Audio intake unproven on a real upload. Keystone secret + "Template repository" tick still waiting on Duff.

### Security (detail: SECURITY.md)
- **S1 One GitHub identity for every AI and for Duff.** Every commit, review and label is `duffpowell-commits`.
  So the fresh-eyes gate can't tell a fresh reviewer from the author, and rule lock can't tell Duff's `duff-ok`
  tap from an agent's (guard.py blocks Claude, but Grok/Codex have no such hook). Fix: free machine-user
  accounts or a GitHub App per AI (T-010).
- **S2** Rush has no rule lock and its guard lacks the `duff-ok` check (T-002). duffquest + lethemoor have no
  pre-push hook, so non-Claude agents there skip the push guard (T-003).
- **S3** 8 workflow jobs run with the repo-default token permissions (T-006). gitleaks runs in 2 of 9 repos (T-005).
- No plaintext secrets found in any tracked file at HEAD (scanner + manual grep; base64 image payloads excluded).
  Keystores are committed only encrypted (`.enc`). No `pull_request_target`, no untrusted `${{ }}` in `run:`.

### Architectural weaknesses
- **A1** Rules are copied, not referenced, so every fix needs N PRs and drifts. Short term: weekly drift report
  (this PR). Longer term: a sync workflow in the starter that opens the re-sync PRs itself (still gated by `duff-ok`).
- **A2** No shared definition of a task across repos (now `studio/tasks.json` + `done_when` + `evidence`).
- **A3** Nothing records cost or outcome per AI, so "which AI for which task" is opinion (ledgers + `bench`).
- **A4** Too many concurrent products for one person: 7 games moved in the last 30 days (chaos 115 commits,
  hunter 75, duffquest 38, lethemoor 35, Rush 32, pocket-fight 20). The queue ranks by Duff's focus first.

## 4. Rule drift (from `studio-audit-2026-11-26.md`)

| synced item | Foxboard | chaos | duffquest | lethemoor | hunter | Rush | pocket-fight |
|---|---|---|---|---|---|---|---|
| `GROK_STANDARDS.md` | MISSING | same | MISSING | MISSING | differs | same | same |
| `.claude/hooks/guard.py` | MISSING | same | differs | differs | same | differs | same |
| `.githooks/pre-push` | differs | same | MISSING | MISSING | same | same | same |
| `tools/rule_lock.py` | same | same | same | same | same | MISSING | same |
| `.github/workflows/rule_lock.yml` | differs | same | differs | differs | differs | MISSING | differs |
| `standards/` | MISSING | differs | MISSING | MISSING | differs | differs | differs |

Some "differs" are deliberate (Foxboard is not a Godot game; rule_lock.yml in four repos adds a self-test
step). The report shows drift; a human or the re-sync task decides which drift is intended.
