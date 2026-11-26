# Studio audit

Scanned: AI-nexus, godot-game-starter, Foxboard, chaosisthemotheroforder, duffquest, lethemoor, hunter, Rush, pocket-fight, 3-eyed-fox, nexus, Foxboard-forge
Not scanned (no clone): none

## Rule drift vs godot-game-starter

| synced item | Foxboard | chaosisthemotheroforder | duffquest | lethemoor | hunter | Rush | pocket-fight |
|---|---|---|---|---|---|---|---|
| `GROK_STANDARDS.md` | MISSING | same | MISSING | MISSING | differs | same | same |
| `.claude/hooks/guard.py` | MISSING | same | differs | differs | same | differs | same |
| `.githooks/pre-push` | differs | same | MISSING | MISSING | same | same | same |
| `tools/rule_lock.py` | same | same | same | same | same | MISSING | same |
| `tools/test_rule_lock.sh` | differs | same | differs | differs | differs | MISSING | differs |
| `.github/workflows/fresh_eyes.yml` | same | same | same | same | same | same | same |
| `.github/workflows/rule_lock.yml` | differs | same | differs | differs | differs | MISSING | differs |
| `standards/` | MISSING | differs | MISSING | MISSING | differs | differs | differs |

Drifted or missing cells: **31**

## Gates per repo

| repo | fresh-eyes | rule-lock | pre-push | duff-ok guard | gitleaks | handoff | queue |
|---|---|---|---|---|---|---|---|
| AI-nexus | **no** | **no** | **no** | **no** | **no** | **no** | **no** |
| godot-game-starter | yes | yes | yes | yes | **no** | yes | yes |
| Foxboard | yes | yes | yes | **no** | **no** | yes | **no** |
| chaosisthemotheroforder | yes | yes | yes | yes | **no** | yes | yes |
| duffquest | yes | yes | **no** | yes | yes | yes | yes |
| lethemoor | yes | yes | **no** | yes | yes | yes | **no** |
| hunter | yes | yes | yes | yes | **no** | yes | yes |
| Rush | yes | **no** | yes | **no** | **no** | yes | yes |
| pocket-fight | yes | yes | yes | yes | **no** | yes | yes |
| 3-eyed-fox | **no** | **no** | **no** | **no** | **no** | **no** | **no** |

## Security

HIGH 0 / MEDIUM 8 / LOW 2

| sev | repo | where | finding |
|---|---|---|---|
| MEDIUM | Rush | `.github/workflows/buffer_drafts.yml` | no permissions: block at top level or on job(s) drafts (token gets the repo default, often write-all) |
| MEDIUM | chaosisthemotheroforder | `.github/workflows/build.yml` | no permissions: block at top level or on job(s) test (token gets the repo default, often write-all) |
| MEDIUM | duffquest | `.github/workflows/build.yml` | no permissions: block at top level or on job(s) test (token gets the repo default, often write-all) |
| MEDIUM | duffquest | `.github/workflows/mirror_gitlab.yml` | no permissions: block at top level or on job(s) mirror (token gets the repo default, often write-all) |
| MEDIUM | godot-game-starter | `.github/workflows/buffer_drafts.yml` | no permissions: block at top level or on job(s) drafts (token gets the repo default, often write-all) |
| MEDIUM | hunter | `.github/workflows/buffer_drafts.yml` | no permissions: block at top level or on job(s) drafts (token gets the repo default, often write-all) |
| MEDIUM | lethemoor | `.github/workflows/build.yml` | no permissions: block at top level or on job(s) test (token gets the repo default, often write-all) |
| MEDIUM | pocket-fight | `.github/workflows/buffer_drafts.yml` | no permissions: block at top level or on job(s) drafts (token gets the repo default, often write-all) |
| LOW | duffquest | `.github/workflows/web_template.yml` | third-party action mymindstorm/setup-emsdk@v14 is pinned to a tag, not a commit SHA |
| LOW | duffquest | `.github/workflows/web_template_3d.yml` | third-party action mymindstorm/setup-emsdk@v14 is pinned to a tag, not a commit SHA |
