# GET routes in the installed GAIA 0.25.0: which are safe to call (2026-11-12)

**Update (2026-11-12, later):** Rich's install is a development install ("this is all for development so it
doesn't matter if things/data get destroyed"), so this allowlist is no longer a hard limit. Audits and
acceptance runs may exercise his app fully, coordinated with Release, who owns it. The tables below still say
what each GET does, which helps when a run should leave his state alone.

Parity's sweep for the read-only screenshot audit of Rich's installed app (Design captures it). The
machine-readable allowlist is `installed-0.25.0-get-allowlist.txt` next to this file.

**Method.** Every GET route in `~/.gaia/venv/lib/python3.12/site-packages/gaia/ui` (81 routes in 19
routers plus `server.py`, and the `/api/files/uploads` static mount). An AST pass collected each
handler's calls, following helpers in the same module and `Depends(...)` targets, and flagged
names that start, write, scan, load or infer. Each flagged route was then read by hand. Only three
routers carry a prefix (`/api/connectors`, `/v1/connections`, `/v1/email`); `include_router` adds
none. Routes reached only through another module's helper were spot-checked, not exhaustively
traced, which is why the browser should fail closed on anything not on the allowlist.

## Side effects: block these

| GET | What it does |
| --- | --- |
| `/api/memory/stream-discovery` | Scans the PC: git identity, installed apps, macOS app usage, browser history. |
| `/api/memory/stream-inference` | Runs LLM inference on Rich's Lemonade (contends with the resident chat model); with `include_browser=true`, also reads browser history. |
| `/api/mcp/servers/{name}/tools` | Opens a transient connection to a configured MCP server; a stdio server is started as a process. |
| `/v1/email/health`, `/v1/email/init`, `/v1/email/version`, `/v1/email/calendar/events` | Each acquires the email sidecar from the daemon, which can spawn it. `calendar/events` also reads his calendar. |
| `/api/setup/check?load=true` | With `load`, verifies that the models load, so it loads them. Without it, it runs a short `gaia init --check --json` subprocess, which is allowed but is not quite a pure read (see Conditional repairs; corrected 2026-11-12 after Design caught it). |
| `/api/files/search` | Read-only, but walks Documents, Downloads, Desktop and deeper on worker threads. |
| `/api/agents/catalog` | Fetches the agent catalog from the hub and caches it on disk. |
| `/api/connectors/_debug` | Creates a directory; debug only. |

## Conditional repairs: recommended allow

Each writes only when state is already inconsistent, and Rich's own app makes the same call
whenever it shows that screen.

| GET | When it writes |
| --- | --- |
| `/api/providers` | Hands a stored cloud key back to Lemonade if Lemonade lost it. |
| `/api/providers/active` | Once per backend run, applies his `last_model`. His app did that at launch, so now it returns the cached result. |
| `/api/memory/settings` | Rewrites the discovery-consent flag only when the database and `~/.gaia/memory_settings.json` disagree. |
| `/api/mcp/servers` | Creates the MCP config directory if it is missing. |
| `/api/setup/check` (no `load`) | When setup answers ready, `check()` rewrites the setup-initialized marker (`mark_initialized()`; in 0.25.4 through its default `mark=True`). It is idempotent, and his app does it at every launch. Design allows it. |

## Pure reads

Everything else in the allowlist. Notable ones: connector listings use `peek_connection`, which is
documented side-effect free (it never refreshes or clears a token); `/api/system/status` reads
Lemonade's health and resolves the start hint without loading anything; `/api/onboarding/preflight`
probes Lemonade's device info, RAM and disk; `/v1/connections/{provider}` returns metadata only.

## Not covered

- The frontend's four `EventSource` streams are GETs: `/api/sessions/events` and
  `/api/connectors/events` are plain event feeds (allowed); the two memory streams are blocked above.
- Upstream 0.26.0 (the repo) may add GETs. Re-run the sweep before capturing a newer installed build:
  `python3 -I /Users/rapuckett/Projects/gaia/.local/dev/parity-get-sweep.py ~/.gaia/venv/lib/python3.12/site-packages/gaia/ui`
  prints every GET with its full path; `FLAG` rows need reading by hand.

## 0.25.4 delta (Rich updated at 15:09 on 2026-11-12)

Re-swept with the same method: 107 GET routes (26 new, none removed; the SPA catch-all is now
`/{full_path:spa_path}`). The allowlist is `installed-0.25.4-get-allowlist.txt`; use it from now on.

| Change | GET | Why |
| --- | --- | --- |
| new, deny | `/api/sessions/{session_id}/changes/git` | Runs `git status` and repository-state commands in the repositories the chat changed files in; `git status` can rewrite a repository's index. |
| new, deny | `/api/setup/report/{name}` | Downloads a troubleshooting bundle with every GAIA log and a system snapshot. |
| now deny | `/api/providers` | Can now register a cloud provider in Lemonade (`_register_on_gaias_server`) and hand it a stored or environment key, not only re-send a key. |
| now deny, unless local | `/api/providers/active` | The once-per-run restore can register the last model's cloud provider the same way, and it re-runs while its last result asks to retry. **Safe while `last_model` in `~/.gaia/config.json` is a local model** (Design, verified by Parity in 0.25.4's `restore_last_model` and `_check_model_available`): registration and keys happen only when the provider isn't local, and a local restore's one write (`custom_model` = the last model) happens once per backend run and is then cached. Without this route 0.25.4 opens on Setup. Check `last_model` at the start of each capture and deny the route for the whole run when it's `fireworks.` or `amd.`. |
| conditional (both versions) | `/api/setup/check` | Writes the setup-initialized marker whenever the check answers ready (see Conditional repairs). In 0.25.4 that's the default `mark=True`. |
| new, conditional | `/api/onboarding/start` | New-chat cards. Asks whether the flagship takes folders, which can start it if it runs as a sidecar; his app calls it whenever New chat opens. |
| new, allow | 23 others | Reads: chat context, follow-up and performance; session changes, diffs, totals, environment, outputs, capabilities and search; document files and generated media; GPU memory; local provider status and context; setup plan and model needs; skill preferences; spending and prices; work in progress; undo settings. |
