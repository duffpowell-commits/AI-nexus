# Nexus Product Specification

Nexus is an Android-first, multi-provider AI workspace with a customizable interface.

## Approved visual direction
- A single four-headed hydra represents GPT, Claude, Grok, and Gemini. Obsidian scales, gold armor, four individually identifiable heads, expressive but intimidating appearance.
- The owner's personal avatar is a mischievous, fang-bearing three-eyed fox, black-and-gold with a glowing blue third eye.
- These are visual references, not yet integrated production assets.
- Other users can choose their own avatar and theme packages.

## Core user journeys
1. Select a provider and chat individually.
2. Ask multiple providers independently, compare responses, and inspect attribution.
3. Run a supervised, auditable multi-model workflow with explicit approval gates.
4. Create project workspaces with versioned instructions, notes, and source links.
5. Customize colors, typography, layout, animations, avatars, and accessibility settings.
6. Connect GitHub to inspect repositories and propose changes using branches and pull requests.

## Initial release scope
- Responsive mobile-first PWA, installable on Android.
- Provider abstraction and at least one working provider integration, followed by GPT, Claude, Grok, and Gemini.
- Secure server-side credential handling and per-provider cost/usage indicators.
- Individual chats, saved conversations, and basic compare mode.
- Project-specific memory and manual context controls.
- Theme tokens and accessible layout presets.
- Clear task state: planned, running, waiting for approval, succeeded, failed.

## Later milestones
- Animated interactive hydra with head-specific activity states.
- User-generated theme and avatar packages.
- Council, debate, supervisor, and assembly-line workflows.
- GitHub PR workflows, remote Godot builds, APK delivery, and asset studio.
- Cross-device sync, optional voice, marketplace after security review.

## Non-goals for initial release
- Claiming official-app subscriptions grant API access.
- Replicating proprietary ChatGPT/Claude/Grok/Gemini app features unavailable via APIs.
- Unsupervised repository merges or production deployments.
- A public marketplace before package sandboxing and moderation.
