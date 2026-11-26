# Dependency + security audit (2026-11-26)

Scope: every public studio repo at `main` HEAD (shallow clones, 2026-11-26 22:10 UTC). The private market
repo was scanned locally for secrets and gates only; per its own rules nothing about its contents is listed here.
Automated part: `tools/studio_audit.py` (full output: `studio-audit-2026-11-26.md`, re-run weekly by
`.github/workflows/studio_audit.yml`). Manual part: reading workflows and dependency manifests.

## Result

| Severity | Count | What |
|---|---|---|
| HIGH | 0 | no plaintext secrets at HEAD, no committed secret files, no `pull_request_target`, no untrusted `${{ }}` in `run:` |
| MEDIUM | 8 + 2 manual | 8 workflow jobs with no `permissions:` (S3); S1 shared identity; S4 unpinned binary next to a write token |
| LOW | 2 + 1 manual | `mymindstorm/setup-emsdk@v14` pinned by tag (duffquest, 2 workflows); S5 matrix value inline in Forge |

Limits: HEAD only, not full history (clones are shallow; gitleaks with full history is T-005). Secret patterns
cover GitHub, Anthropic, OpenAI, AWS, Slack, Hugging Face, Google keys and PEM private keys.

## Findings

**S1 (MEDIUM, architectural). One GitHub identity for everyone.** All AIs and Duff act as `duffpowell-commits`.
The fresh-eyes gate counts any review containing the PASS line, including one posted by the authoring session;
rule lock accepts `duff-ok` from that same account. Claude is stopped by guard.py; other AIs are stopped only by
written rules. Fix (free): a machine-user account or GitHub App per AI; then `fresh_eyes.yml` ignores reviews by
the PR author and `rule_lock.yml` checks the label event's actor. Task T-010 (needs Duff to create the accounts).

**S2 (MEDIUM). Missing guards.** Rush: no rule lock workflow, no `tools/rule_lock.py`, guard.py without the
`duff-ok` check (T-002). duffquest + lethemoor: no `.githooks/pre-push`, so agents other than Claude Code push
unguarded there (T-003). gitleaks only in duffquest + lethemoor (T-005).

**S3 (MEDIUM). Default token permissions.** Jobs with no `permissions:` get the repository default:
`build.yml` test job in chaos, duffquest, lethemoor; `buffer_drafts.yml` in godot-game-starter, hunter, Rush,
pocket-fight; duffquest `mirror_gitlab.yml`. If the repo default is "read and write", a compromised step in those
jobs can push. Fix: `permissions: contents: read` on each (T-006).

**S4 (MEDIUM, manual). Foxboard Forge runs an unpinned binary in a job that holds write access.**
`forge.yml` downloads `leejet/stable-diffusion.cpp` `releases/latest` and runs `pip install` without versions,
in a job with `contents: write` that later gets `GAME_PUSH_TOKEN` (write to the game repos). A bad upstream
release could push to Foxboard and the games. Fix: pin the release tag + SHA-256 of the zip, pin pip versions,
and move the send-to-game step into its own job that only downloads the finished PNGs (T-017).

**S5 (LOW, manual).** `forge.yml` expands `${{ matrix.item.job }}` inline in `run:`. The value is a job file name,
and only accounts with write access can add one, so it is low risk; passing it through `env:` removes it (T-017).

**S6 (LOW).** `mymindstorm/setup-emsdk@v14` is the only third-party action; pin it to a commit SHA (T-006).

**Good practice already in place** (keep it): keystores committed only encrypted (`signing/*.enc`); guard.py
blocks committing secret files and generating keys; secrets only in Actions secrets; rule lock + `duff-ok`;
the market repo's isolation rule is restated in each public game repo; Eyes npm deps pinned exactly
(`godot-mcp-runtime 4.0.1`, `@modelcontextprotocol/client 2.4.0`), `npm audit` on its lockfile: 0 vulnerabilities.

## Dependencies (free / paid)

| Dependency | Where | License / cost | Pinned |
|---|---|---|---|
| Godot 4.7.2-stable | all games | MIT, free | yes (CI fails off 4.7) |
| godot-mcp-runtime 4.0.1, @modelcontextprotocol/client 2.4.0 | Eyes (starter, lethemoor, Rush) | free | yes, exact |
| stable-diffusion.cpp | Foxboard Forge | MIT, free | **no** (`releases/latest`) |
| FLUX.1-schnell, FLUX.2 klein 4B | Foxboard Forge | Apache-2.0, free | by repo name |
| RealESRGAN anime 6B v0.2.2.4 | Foxboard Forge | BSD-3, free | yes (tag) |
| huggingface_hub, hf_transfer, pillow | Foxboard Forge | free | **no** |
| butler (itch), Buffer API, ntfy | games, marketing | free tiers; keys in Actions secrets | n/a |
| GitHub Actions (public repos) | everywhere | free standard runners | first-party actions by major tag |
| AI-nexus harness | this repo | Python stdlib only, free | n/a |

No paid dependency was added by this work.
