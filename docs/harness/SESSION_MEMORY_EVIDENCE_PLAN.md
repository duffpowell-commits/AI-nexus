# Studio harness: evidence and durable memory plan

Status: approved direction for planning, 2026-11-27. Implementation pending; this document does not override repository rules, merge gates, permissions or approvals. Use the existing Nexus CLI, leases, task queue, ledgers, game-starter Eyes pipeline and per-repo handoffs. No new service or spend.

## Seven additions, mapped to existing infrastructure

1. Evidence receipt: extend current handoff and outcome schema with task ID, repo, branch, exact tested SHA, commands/results, CI run URLs, visual artifact links, explicit unverified checks and next action. A claimed PASS without evidence is incomplete. Keep receipts compact; link full logs rather than copying.
2. Task isolation: extend existing leases to declare intended files/modules and warn of overlapping active scopes. Agents use isolated branches/worktrees, never concurrent edits to the same scope. Reviewers report independently. Never take a live lease.
3. Checkpoints: extend handoff generator to emit machine-readable continuation snapshots at meaningful milestones, before compaction and before stopping, including partial work, next step, references and unresolved questions.
4. Gameplay replay: evaluate existing Eyes capabilities against godot-qa (https://github.com/youichi-uda/godot-qa) in a small isolated test project first; no third-party workflow injection until review. Extend existing T-011 for deterministic visual regression; report screenshot differences separately from subjective quality.
5. Mobile performance: add optional local-only diagnostics to game-starter and one pilot game; FPS, frame-time spikes, draw calls, memory where supported. Capture actual handset evidence without private identifiers. Reference https://docs.godotengine.org/en/stable/classes/class_performance.html.
6. Modular 3D art: keep existing asset library; shared materials, reusable props, consistent scale and import checks. Pilot with existing Fork diner assets before generating anything. No Foxboard feature development or paid generation.
7. Stop conditions: use task done_when, scope, budget and approval constraints. Fail closed on missing evidence and stop when accepted checks pass; document remaining uncertainties rather than extending scope. No automated release or publishing based on a test result.

## Cross-session memory

Use Git and approved project files, not one vendor's chat logs. Keep the existing repository handoff canonical and avoid duplicated status files.

- **Stable rules:** existing AGENTS/CLAUDE files contain invariants and pointers only, not changing task status.
- **Decisions:** extend existing docs/DECISIONS.md records with date, decision, rationale, rejected alternatives, source link, scope and supersedes field. Archive rather than erase superseded decisions.
- **Working state:** handoff checkpoint references exact SHA, task ID, approvals, changed paths, how to reproduce checks, what failed, what remains and next safe action. Do not claim unrun tests.
- **Failed attempts:** record only reusable failure signatures and verified lessons, link the incident. Search before repeating a failed approach.
- **Startup retrieval:** generate a short task packet from fresh repo status, active lease, canonical handoff, relevant decisions and latest evidence. Reject stale checkpoint where SHA or task mismatches; refresh from git and CI rather than guessing. Load detailed history on demand.
- **Write-back:** checkpoint after verified milestones and before session stop. If unexpectedly interrupted, reconcile remote branch, CI and lease on resume. Keep the latest snapshot small and archive complete history by commit.
- **Privacy:** no raw personal chats, credentials, private-project artifacts or user photos in public repositories. Separate per-project memory; no cross-provider sharing of private material without consent.
- **Evaluation:** simulate a cold start after interruption and a second agent handoff. Can the new agent name the correct branch, latest decision, known failed attempt, next action and exact unverified checks? Track startup tokens/time, replayed mistakes and false PASS claims.

## Implementation sequence

A. Nexus: extend existing handoff generator and receipt validation; test missing/stale receipts, conflicting scope and interrupted transfer. Update current queue priority only when owner confirms it; don't propagate stale Rush-only directive.
B. Starter: extend T-011 using existing Eyes; deterministic fixtures and a deliberate visual failure. Add opt-in diagnostic overlay and artifact evidence.
C. Pilot Rush (touch and save persistence), then Fork (mobile graphics and reusable asset kit). Avoid touching unrelated gameplay.
D. Review results on a phone, then propagate small compatible improvements to other game repos using their existing approval rules.

## References

- OpenAI, Harness engineering: https://openai.com/index/harness-engineering/
- Anthropic, Effective harnesses for long-running agents: https://www.anthropic.com/research/effective-harnesses-for-long-running-agents
- OpenAI, Building Reliable Agents with Memory and Compaction: https://developers.openai.com/cookbook/examples/agents_sdk/building_reliable_agents_memory_compaction
- Community discussion (anecdotal): https://www.reddit.com/r/ClaudeCode/comments/1xnee5q/how_are_you_handling_crosssession_memory_in_large/

## Cold-start acceptance fixture: Fork

Use the existing Fork repository as a read-only fixture: root `HANDOFF.md` is explicitly stale, and `STATUS.md` points to `spike_full3d/HANDOFF.md`. A fresh agent must independently select the current 3D handoff, distinguish the live 2D edition, identify the current tested SHA versus latest documentation commit, preserve the porch acceptance gate and design-only kitchen scope, and separate measured handset evidence from cloud runtime. It must recommend exactly one in-scope next action without user re-briefing. No automatic publication or gameplay changes in the exercise. Evaluate against fresh source files and repo rules, not this summary alone.
