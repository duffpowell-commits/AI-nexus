# AI-nexus

Central orchestration for 3 Eyed Fox Studios: the studio task queue, task leases (locks), the AI
capability registry, usage/cost and outcome ledgers, and a weekly studio-wide audit. Built on GitHub
and Python's standard library: nothing to install, nothing paid, works from any cloud AI session.

**Every AI starts at [PROTOCOL.md](PROTOCOL.md).** Then this repo's [AGENTS.md](AGENTS.md).

| Read | For |
|---|---|
| [PROTOCOL.md](PROTOCOL.md) | how any AI picks, locks, hands off and records work across the studio |
| [docs/harness/AUDIT.md](docs/harness/AUDIT.md) | maturity score (19/60 on 2026-11-26), findings |
| [docs/harness/ARCHITECTURE_MAP.md](docs/harness/ARCHITECTURE_MAP.md) | which repo owns what, dependency edges |
| [docs/harness/BACKLOG.md](docs/harness/BACKLOG.md) | milestones H1-H4 with definitions of done |
| [docs/harness/SECURITY.md](docs/harness/SECURITY.md) | dependency + security audit |
| [docs/harness/HANDOFF.md](docs/harness/HANDOFF.md) | where the harness work stands, next steps |
| `studio/` | `tasks.json` queue, `agents.json` capabilities, `repos.json` repos + dependencies + finish order |
| `ledger/` | `usage.jsonl` cost/tokens, `outcomes.jsonl` task results |
| `tools/nexus.py` | the CLI (`python3 tools/nexus.py -h`) |
| `tools/studio_audit.py` | drift + gates + security scan across repo clones |

Tests: `python3 -m unittest discover -s tests -v` -> `OK`. CI runs them on every PR (`nexus` workflow).

The phone/PWA product in `docs/PRODUCT.md` is still planned; it will read the same `studio/` and `ledger/` files.
