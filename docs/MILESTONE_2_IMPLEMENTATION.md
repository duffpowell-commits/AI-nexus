# Milestone 2: Secure, persistent, streaming chat

Status: implementation brief. This document is not evidence that the features are built or tested.

## Baseline
Milestone 1 merged as PR #2 into `foundation/nexus-specs`. React/Vite PWA, Express API, shared contracts, four mock adapters, consent-gated comparison, two themes, and CI exist. Do not replace them wholesale.

## Outcome
An authenticated owner can use GPT with server-side credentials, stream replies, reload without losing conversations, and see errors and budget limits. Other providers remain clearly labeled mocks until explicitly configured and verified.

## Implementation order
1. Threat model and configuration: document deployment target and trust boundaries; keep local development mock mode functional; reject unsafe production startup configuration.
2. Authentication: use maintained server-side session/auth solution; HttpOnly, Secure in HTTPS, SameSite cookies; CSRF protection for mutations, session expiry and logout; protected chat/history endpoints; no secrets in localStorage. Do not implement custom password cryptography. Choose a production-appropriate auth provider/library and document setup.
3. Storage: introduce migrations and persistent users/projects/conversations/messages, with every read/write scoped to authenticated user. Replace fixed sample projects only after persistence is ready. Store theme preferences only if useful; preserve existing browser theme behavior.
4. Credential management: support server environment secret `OPENAI_API_KEY` for single-owner deployment first. Never return keys to clients or logs. Do not claim encrypted per-user key vault exists unless implemented with managed KMS/secret storage and key rotation.
5. Streaming: extend adapter contract without breaking existing mock `sendMessage`; implement one GPT streaming adapter using official supported API/client, server-side only. Stream structured SSE events (start/delta/complete/error), with provider/model/mode attribution and stable message IDs. Handle abort/disconnect, timeouts, upstream errors, and partial responses. Avoid proxy buffering.
6. UX: accessible streaming indicator, stop generation, retry on failure, persistent transcript, distinct live/mock badges, and opt-in multi-provider comparison retained.
7. Abuse/cost controls: authenticated per-user request throttling, input/output bounds, concurrency limits, configured model allowlist, conservative usage cap or fail-closed budget controls. Never treat client estimates as authoritative.
8. Deployment and Android: HTTPS origin, secure cookies, PWA install checks on real Android hardware; document what is unverified.

## Non-negotiable security tests
- Anonymous chat/history requests denied; session invalidation and CSRF cases tested.
- User A cannot access or mutate user B's project/conversation, including guessed IDs.
- Provider API key never included in HTML, JS bundles, API payloads, SSE events, or logs.
- Multi-provider comparison rejects missing consent, including direct API requests.
- Rate limiting and request-size validation cover both ordinary and streaming routes.
- SSE cancellation closes upstream stream; network failure produces safe, attributed error.
- Persistence survives server restart and reload.
- Mock mode continues to pass all Milestone 1 tests.
- CI runs lint, typecheck, tests, builds, and production smoke test.

## Decisions / constraints
- Preserve Obsidian as default, Parchment option, mobile-first UI, four provider identities, and hydra/fox placeholders until approved art exists.
- No live Claude, Grok, or Gemini credentials in this milestone.
- No GitHub write tools, autonomous deployments, or provider fan-out without explicit consent.
- No Android APK claims until built and tested on device.
- Avoid storing prompts in telemetry; redact request bodies and authorization headers.
- Document database backup, migrations, and restore expectations.
- Do not commit .env, tokens, keys, generated secrets, or production user data.

## Acceptance
Document actual commands and results, attach CI status, and open a PR against `foundation/nexus-specs`. Do not merge without review. If credentials or deployment access are unavailable, provide a deterministic fake-stream integration test and mark live-provider verification blocked rather than pretending it passed.
