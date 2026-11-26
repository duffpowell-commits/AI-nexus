# Nexus

Nexus is an Android-first multi-AI workspace with signed-in projects, persistent conversations, and streaming replies. GPT, Claude, Grok, and Gemini can stream through their official APIs when enabled for a provisioned owner. Without credentials, Nexus labels development responses as mock.

## Studio harness (start here if you are an AI working on any studio repo)

AI-nexus also runs the 3 Eyed Fox Studios harness: studio task queue, task leases (locks), AI capability
registry, usage/cost and outcome ledgers, and a weekly studio-wide audit. Python standard library only.
**Every AI starts at [PROTOCOL.md](PROTOCOL.md).**

| Read | For |
|---|---|
| [PROTOCOL.md](PROTOCOL.md) | how any AI picks, locks, hands off and records work across the studio |
| [docs/harness/AUDIT.md](docs/harness/AUDIT.md) | maturity score (20/60 on 2026-11-26), findings |
| [docs/harness/ARCHITECTURE_MAP.md](docs/harness/ARCHITECTURE_MAP.md) | which repo owns what, dependency edges |
| [docs/harness/BACKLOG.md](docs/harness/BACKLOG.md) | milestones H1-H4 with definitions of done |
| [docs/harness/SECURITY.md](docs/harness/SECURITY.md) | dependency + security audit |
| [docs/harness/HANDOFF.md](docs/harness/HANDOFF.md) | where the harness work stands, next steps |
| `studio/`, `ledger/` | queue, capabilities, repos + finish order; usage and outcome ledgers |
| `tools/nexus.py`, `tools/studio_audit.py` | the CLI and the studio scanner |

Harness tests: `python3 -m unittest discover -s tests -v` -> `OK` (CI workflow `harness`). The app's own
checks below (`npm test` etc.) are separate.

## Run locally

Use Node.js 22.13 or newer and npm. Run these commands from the repository root in Bash. The account password is read from stdin, and the prompt keeps it out of shell history.

```sh
npm ci
read -rsp 'New Nexus password: ' nexus_password; printf '\n'
printf '%s\n' "$nexus_password" | npm run user:add -- owner
unset nexus_password
npm run dev
```

Use a unique passphrase with at least 12 characters and at most 72 UTF-8 bytes. Usernames must be 3–40 characters, start with a lowercase letter or digit, and use lowercase letters, digits, hyphens, or underscores. Provision another account by rerunning the command with a different username. Each account starts with a private **Personal** project.

Open http://127.0.0.1:5173 and sign in. Vite proxies API requests to the loopback API on port 3000. To run the production build locally with the PWA service worker, use:

```sh
npm run build
npm start
```

Open http://127.0.0.1:3000. This serves the production bundle and API from one origin. If port 3000 changes, set both `NEXUS_PORT` and `NEXUS_ORIGIN` for the built server. The development proxy expects port 3000 and Vite uses port 5173.

## Chat

- Select or create a project, choose one of the four identities, and enter a prompt. Each project has a separate conversation per identity and a separate Compare history. The dashboard loads the last 30 turns and can load earlier turns on demand.
- In **Compare**, select at least two providers, enter a prompt, and approve that submission before sending it. The choices show which recipients are live. Compare shares the current prompt only. Live individual chat can use recent completed turns from the same provider and project. Each comparison reply has its own progress and stop control.
- Use **Stop generation** to cancel a stream. Nexus keeps any partial text it received and labels it as stopped or incomplete. You can retry by resubmitting the prompt. Navigating away from a conversation cancels its active connection.
- **Settings** contains Obsidian and Parchment and the sign-out action. Only the theme preference is saved to browser storage.

## HTTPS and trust boundary

Nexus targets one server process on a trusted host. The API binds to `127.0.0.1`. For HTTPS operation, run it behind a trusted reverse proxy on the same host. Set `NODE_ENV=production`, a path in `NEXUS_DB_PATH`, an exact HTTPS origin in `NEXUS_ORIGIN`, and a stable random `NEXUS_SESSION_SECRET` of at least 32 bytes. Generate the signing secret with a cryptographic generator such as `openssl rand -hex 32` and put it directly in your service's secret configuration. Configure the proxy to overwrite forwarded protocol and client IP headers, disable response buffering for SSE, and allow at least 40 seconds for the streaming request. Use the HTTPS origin to try PWA installation on Android.

Passwords are hashed using bcrypt. Session IDs are signed, sent in HttpOnly, SameSite=Strict cookies, and expire after eight hours. HTTPS uses the Secure, host-only cookie prefix. Mutation requests require an exact allowed Origin and a Nexus request header. Login is throttled by IP, chat by authenticated user, and only one stream may run per user in the server process. All project and history access checks authenticated ownership. API responses and chat streams set `Cache-Control: no-store`. The service worker serves an offline notice and leaves API traffic to the network.

## Optional live providers

Configure these credentials in the API service’s secret configuration. Variables starting with `NEXUS_PUBLIC_` are for public frontend values only. A provider without a credential uses its labeled mock adapter. A configured provider that fails returns an attributed error.

| Server variable | Allowlisted model |
|---|---|
| `OPENAI_API_KEY` | `gpt-4.1-mini` by default, or `gpt-4.1-nano` via `NEXUS_OPENAI_MODEL` |
| `ANTHROPIC_API_KEY` | `claude-haiku-4-5-20251001` |
| `XAI_API_KEY` | `grok-4.3` |
| `GEMINI_API_KEY` | `gemini-3.5-flash-lite` |

To enable any live provider, set `NEXUS_LIVE_OWNER` to a provisioned username, `NEXUS_LIVE_REQUEST_CAP` to a lifetime count from 1 to 1000, and `NEXUS_LIVE_BUDGET_MICROS` to a lifetime estimated budget from 1 to 1,000,000,000 USD millionths. For example, 1,000,000 represents $1. Set `NEXUS_CHAT_REQUESTS_PER_MINUTE` to configure the per-user limit (default 20). The persistent request count includes prior Milestone 2 live requests. Estimated spending and detailed usage begin with the Milestone 3 migration.

Nexus reserves every live participant’s estimated cost and request count in one SQLite transaction before submitting a prompt. A comparison is refused in full if the available budget cannot cover the selected providers. Nexus reconciles successful requests when the provider reports token counts and keeps reservations for failed, cancelled, interrupted, or unmetered requests. Usage shows the 50 most recent requests for the signed-in account. Costs use model-specific rates and estimates and can differ from the provider invoice. Configure spending and rate controls on the provider accounts as well. See the [OpenAI](https://openai.com/api/pricing/), [Anthropic](https://platform.claude.com/docs/en/about-claude/pricing), [xAI](https://docs.x.ai/developers/models/grok-4.3), and [Google](https://ai.google.dev/gemini-api/docs/pricing) rates.

Chat accepts 32 KiB of JSON, a 4,000-character prompt, and up to 12,000 UTF-8 bytes of local conversation history. Each live request asks for at most 512 generated tokens and has a 30-second deadline. Nexus retries one explicit upstream HTTP 429 after an abortable delay when the request cap permits another attempt. Provider error details stay on the server side of the response boundary. Individual chat sends only the matching provider’s project-scoped history. Compare sends only the approved prompt. Provider data processing and retention policies still apply.

## Storage and backups

SQLite defaults to `.nexus/nexus.sqlite` in the repository root. Relative paths in `NEXUS_DB_PATH` resolve from that root for both provisioning and startup. Keep the database outside frontend directories. Use a private, persistent volume with filesystem encryption for deployed data. The database contains password hashes, active session records, conversations, and budget reservations. Keep database files and backups private. The OpenAI API key lives in server environment configuration.

Startup applies ordered, transactional migrations using SQLite's schema version. Use SQLite's online backup facility or stop the server and checkpoint/close SQLite before copying the database. Copying only the main file while WAL writes are active can omit committed data. Back up before upgrades, test restoring to a separate path, and reconcile live request and spend counters before resuming service from an older snapshot. Rotate the session signing secret on restore if active sessions should be invalidated.

## Verify

```sh
npm run typecheck
npm run lint
npm test
npm run build
npm run smoke
```

CI exercises authentication, ownership, consent, persistence, cancellation, safe errors, throttling, production startup, and PWA asset delivery without live credentials. The OpenAI SDK test uses a deterministic fake transport. Live verification requires an authorized key for each provider. Android installation and native APKs require separate device checks.

## Current limits

Auth is local account provisioning for a single trusted host. Self-service registration, password resets, MFA, centralized identity, multi-instance coordination, conversation deletion and export, and per-user key storage are future work. Each account can create up to 30 projects and store up to 1,000 turns per conversation. A process crash can leave a prompt without its in-flight reply. The PWA needs a connection for chat, and the hydra and fox artwork remain placeholders. GitHub writes and deployment tools remain outside this milestone.
