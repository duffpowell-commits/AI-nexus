# Nexus Roadmap

## Milestone 0: Foundation
- [x] Product specification
- [x] Architecture proposal
- [x] Agent rules
- [x] Review and merge foundation PR

## Milestone 1: Executable skeleton
- [x] React/TypeScript/Vite PWA scaffold and offline notice
- [x] Node/TypeScript API scaffold with four mock provider adapters
- [x] Shared contracts and local development instructions
- [x] Lint, typecheck, unit and integration tests, production smoke test, CI
- [x] Mobile navigation, theme settings, and accessible artwork placeholders
- [x] Project-scoped session chat and opt-in mock comparison
- [ ] Verify PWA installation on Android hardware

## Milestone 2: Secure, persistent streaming chat
- [x] Account provisioning, server-side sessions and CSRF protection
- [x] Owner-scoped server-side OpenAI configuration and streaming adapter
- [x] Persistent projects, conversation history and message attribution
- [x] Stop generation, partial reply handling and retry
- [x] Request limits and a persistent live request budget
- [ ] Verify live GPT with authorized OpenAI credentials
- [ ] Verify installation on an Android device over HTTPS

## Milestone 3: Multi-AI and projects
- [ ] Four live provider adapters
- [ ] Compare/council mode with attribution
- [ ] Project-scoped memory
- [ ] Workflow approvals, logs, cancellation

## Milestone 4: Identity and customization
- [ ] Theme token engine and layout presets
- [ ] Fox avatar and hydra assets prepared for runtime use
- [ ] Head-specific hydra status and animations
- [ ] Accessible theme export/import

## Milestone 5: Development workspace
- [ ] GitHub scoped integration and PR workflow
- [ ] Remote Godot build and APK artifact pipeline
- [ ] Testing and build dashboards
