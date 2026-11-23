# Nexus

Nexus is an Android-first multi-AI workspace. Milestone 1 runs locally as a mobile-first web app with GPT, Claude, Grok, and Gemini mock adapters. All replies are simulated.

## Run locally

Use Node.js 22.12 or newer and npm.

```sh
npm ci
npm run dev
```

Open http://127.0.0.1:5173. Vite proxies API requests to the Node server on port 3000. For the production build and PWA service worker, run:

```sh
npm run build
npm start
```

Open http://127.0.0.1:3000. The app serves the API and production web files from the same origin. A service worker requires localhost or HTTPS. On an Android device use a trusted HTTPS origin to try installation.

## Try the prototype

- Choose a sample project and an AI identity, then send a prompt.
- Open **Compare**, choose at least two identities, enter a prompt and check the approval box. Replies appear with the name of each selected identity.
- Change between Obsidian and Parchment in **Settings**. Theme selection persists in the browser. Projects and chat views keep separate in-memory transcripts for the life of the page.

## Repository layout

- `apps/web` contains the React dashboard, Vite configuration, and PWA assets.
- `apps/api` contains the Express server and provider adapter registry.
- `packages/contracts` contains shared provider IDs, request validation, and response types.
- `tests` and `scripts/smoke.mjs` cover input validation, HTTP contracts, and startup from built files.

## Verify

```sh
npm run typecheck
npm run lint
npm test
npm run build
npm run smoke
```

## Configuration and limitations

The server defaults to loopback on port 3000. Set `NEXUS_HOST` and `NEXUS_PORT` in the server process environment to override the production listener. The development proxy expects port 3000. This is a local prototype without authentication, tenant isolation, or rate limits. Keep it on a trusted machine. Future live credentials must come from server-side environment configuration or an encrypted secrets store. Keep secrets out of source control, browser storage, and any `VITE_*` variables.

All four adapters return canned responses with no network calls, streaming, or usage estimates. Each prompt is independent. Projects are fixed examples, and conversations reset on reload. The PWA offers an offline notice and requires a connection to use the workspace. Android installation and native APK builds require separate verification. The hydra and owner avatar use placeholders pending approved artwork.

The prototype has no GitHub or deployment tools. Future tool writes and deployments require explicit user approval. Future multi-provider workflows must keep recipient selection and per-run consent visible.
