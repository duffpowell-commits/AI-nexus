# Nexus

Nexus is an Android-first multi-AI workspace with signed-in projects, persistent conversations, and streaming replies. GPT can use OpenAI from the server when enabled for a provisioned owner. Every account can use the four mock adapters without API credentials.

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
- In **Compare**, select at least two providers, enter a prompt, and approve that submission before sending it. The choices show which recipients are live. Compare shares the current prompt only. Live GPT individual chat can use recent completed live GPT turns from the same conversation.
- Use **Stop generation** to cancel a stream. Nexus keeps any partial text it received and labels it as stopped or incomplete. You can retry by resubmitting the prompt. Navigating away from a conversation cancels its active connection.
- **Settings** contains Obsidian and Parchment and the sign-out action. Only the theme preference is saved to browser storage.

## HTTPS and trust boundary

Nexus targets one server process on a trusted host. The API binds to `127.0.0.1`. For HTTPS operation, run it behind a trusted reverse proxy on the same host. Set `NODE_ENV=production`, a path in `NEXUS_DB_PATH`, an exact HTTPS origin in `NEXUS_ORIGIN`, and a stable random `NEXUS_SESSION_SECRET` of at least 32 bytes. Generate the signing secret with a cryptographic generator such as `openssl rand -hex 32` and put it directly in your service's secret configuration. Configure the proxy to overwrite forwarded protocol and client IP headers, disable response buffering for SSE, and allow at least 40 seconds for the streaming request. Use the HTTPS origin to try PWA installation on Android.

Passwords are hashed using bcrypt. Session IDs are signed, sent in HttpOnly, SameSite=Strict cookies, and expire after eight hours. HTTPS uses the Secure, host-only cookie prefix. Mutation requests require an exact allowed Origin and a Nexus request header. Login is throttled by IP, chat by authenticated user, and only one stream may run per user in the server process. All project and history access checks authenticated ownership. API responses and chat streams set `Cache-Control: no-store`. The service worker serves an offline notice and leaves API traffic to the network.

## Optional live GPT

Set these variables in the API process using a server-side secret manager or protected service configuration. Browser-exposed variables use the `NEXUS_PUBLIC_` prefix and must contain public values only.

| Variable | Value |
|---|---|
| `OPENAI_API_KEY` | A scoped OpenAI API key for this deployment |
| `NEXUS_LIVE_OWNER` | An existing Nexus username authorized to use the key |
| `NEXUS_LIVE_REQUEST_CAP` | An explicit lifetime cap of 1–1000 upstream requests, stored in SQLite |
| `NEXUS_OPENAI_MODEL` | Optional allowlisted model, `gpt-4.1-mini` (default) or `gpt-4.1-nano` |

The official OpenAI SDK streams Chat Completions from the server. SDK retries and logging are disabled. Each accepted live generation reserves a request before contacting OpenAI. Failures and cancellations consume the reservation, and the server refuses requests when the cap is reached. Requests are bounded to 32 KiB of JSON, a 4,000-character prompt, 12,000 UTF-8 bytes of prior context, 512 completion tokens, and a 30-second stream deadline. These safeguards bound use by this app. Use a dedicated restricted OpenAI project and review its spending and rate controls separately. The app sends `store: false`; OpenAI's service policies still govern data processing and retention. Claude, Grok, and Gemini remain mock adapters. The legacy authenticated `/api/chat` JSON route remains mock-only.

## Storage and backups

SQLite defaults to `.nexus/nexus.sqlite` in the repository root. Relative paths in `NEXUS_DB_PATH` resolve from that root for both provisioning and startup. Keep the database outside frontend directories. Use a private, persistent volume with filesystem encryption for deployed data. The database contains password hashes, active session records, conversations, and budget reservations. Keep database files and backups private. The OpenAI API key lives in server environment configuration.

Startup applies ordered, transactional migrations using SQLite's schema version. Use SQLite's online backup facility or stop the server and checkpoint/close SQLite before copying the database. Copying only the main file while WAL writes are active can omit committed data. Back up before upgrades, test restoring to a separate path, and reconcile the live request cap before resuming service from an older snapshot. Rotate the session signing secret on restore if active sessions should be invalidated.

## Verify

```sh
npm run typecheck
npm run lint
npm test
npm run build
npm run smoke
```

CI exercises authentication, ownership, consent, persistence, cancellation, safe errors, throttling, production startup, and PWA asset delivery without live credentials. The OpenAI SDK test uses a deterministic fake transport. Live OpenAI verification requires an authorized key. Android installation and native APKs require separate device checks.

## Current limits

Auth is local account provisioning for a single trusted host. Self-service registration, password resets, MFA, centralized identity, multi-instance coordination, conversation deletion and export, and per-user key storage are future work. Each account can create up to 30 projects and store up to 1,000 turns per conversation. A process crash can leave a prompt without its in-flight reply. The PWA needs a connection for chat, and the hydra and fox artwork remain placeholders. GitHub writes and deployment tools remain outside this milestone.
