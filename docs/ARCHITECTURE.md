# Nexus Architecture Proposal

The components below describe the target architecture. Milestone 2 runs the PWA and API on one host, with SQLite for users, sessions, projects, conversations, messages, and live request reservations. The OpenAI key is supplied through server environment configuration. PostgreSQL, a job worker, and managed per-user secret storage are future components.

## Components
- **Web client:** React + TypeScript + Vite, mobile-first installable PWA.
- **API:** Node.js + TypeScript, with server-side provider adapters and auth.
- **Data:** PostgreSQL for users, projects, conversations, workflow history, and theme preferences; encrypted secrets store for provider credentials.
- **Jobs:** Background queue/worker for multi-step workflows and remote build integration.
- **Assets:** Versioned object storage for approved avatar/theme assets.

## Boundaries
- Provider adapter interface: listModels, sendMessage/stream, estimateUsage, normalizeErrors, capability flags.
- Orchestrator: workflows, budget caps, retries, approvals, attribution, cancellation, audit events.
- Memory service: project-scoped retrieval, source provenance, editable summaries, deletion/export.
- Theme engine: declarative design tokens, layouts, avatar manifests; no arbitrary scripts in theme packages.
- Tool gateway: per-user authorization, scoped GitHub permissions, dry-run and approval for writes.

## Security and privacy
- Never ship provider API keys in client bundles or Android APKs.
- Encrypt secrets at rest; use TLS in transit and redact logs.
- Explicit opt-in for sending project content to multiple providers.
- Treat retrieved documents and model outputs as untrusted input.
- Rate limits, request budgets, and cancellation controls.
- Users can export and delete conversations and project memory.
- Least-privilege GitHub tokens; branch + PR by default, no automatic merge.
- Separate user data by tenant, enforce access control server-side.

## Quality gates
- Typecheck, lint, unit tests, API contract tests, and basic end-to-end PWA smoke test.
- Provider adapters use mocks in CI; live API tests require explicitly provisioned credentials.
- Android installability verified separately from Android-native APK builds.
- Report exactly what was and was not tested.
