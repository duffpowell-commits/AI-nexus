# Nexus Agent Development Rules

Read README.md, PROTOCOL.md (the studio-wide AI protocol), docs/harness/HANDOFF.md, and, for the
planned PWA, docs/PRODUCT.md and docs/ARCHITECTURE.md before changes.

Commands: `python3 -m unittest discover -s tests -v` (-> OK) and `python3 tools/nexus.py validate`
(-> NEXUS VALID) before every push. Both run in CI (`harness` workflow).

1. Inspect the actual repository and existing conventions before adding dependencies or files.
2. Work on a dedicated feature branch; do not commit directly to main.
3. Prefer small, reviewable pull requests and minimal changes.
4. Never invent test results, API capabilities, file paths, or provider permissions.
5. Do not expose API keys, tokens, personal information, or confidential repository contents.
6. Keep provider adapters independent from the UI and workflow engine.
7. Use explicit user approval for destructive operations, merges, deployments, and paid or high-cost workflows.
8. All multi-provider data sharing must be visible and controllable by the user.
9. Theme and avatar packages must be declarative, validated, and non-executable.
10. Preserve accessibility: reduced motion, keyboard/screen-reader support, contrast, and scalable text.
11. For each task report: status, branch, files changed, tests run and results, blockers, and PR link.
12. If a required capability is unavailable, report it rather than silently substituting a mock.
13. Never copy anything from a private repo into this public one (studio_audit.py skips private repos by default).
14. Ledger files are append-only: add rows, never edit or delete old ones.
