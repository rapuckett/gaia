---
name: gaia-sre-start-up
description: "SRE lane facts for the gaia fork - nightly slot, verify load hot spots, venv Python, Central monitoring"
metadata:
  node_type: memory
  type: project
  originSessionId: 02deb33f-fd8e-4685-9c7e-8dd828369be6
  modified: 2026-11-13T03:56:50.143Z
---

Facts the gaia SRE lane needs, set or found on 2026-11-12:
- **Nightly at 03:45**, set in `.claude/dev-kit.json` (`dk-nightly --install` once verify.sh is green). agent-host's nightly holds the one gate slot from 03:00 to about 03:21, and diffusitron's runs at 04:30. The Mac wakes at 02:55 and doesn't sleep.
- **The unit suite sets gaia's pace at the gate:** about 41k tests, 53 min serial, 15 min with `-n 4` (measured 2026-11-12). verify.sh runs `-n $workers --dist=worksteal`, as upstream CI does, and `--fast` picks tests with upstream's `util/select_tests.py` from the coverage map the full run writes to `.local/test_map.json`. The map expires after 3 days, and without one every test runs. `util/lint.py --all` fans out to every core (pylint jobs=0, flake8 auto) and is gated too. dk-heavy is re-entrant through `AGENT_HOST_HEAVY_HELD`.
- **dk-heavy runs jobs with SIGINT ignored** (a background child of a non-interactive bash). Ctrl-C can't stop a gated job, and gaia's Ctrl-C tests fail under it (4 tests, 221 s of timeouts, against 4 s with SIGINT restored). verify.sh resets it with a perl wrapper until dk-heavy launches `( trap - INT QUIT; exec "$@" ) <&0 &`.
- **The venv must be Python 3.12**, GAIA's `pyproject.toml [tool.mypy] python_version`, which upstream CI and the shipped app also use. On 3.14, pylint failed with 23 FAISS and Pillow errors. Without uv, lint.py runs the venv's isort and mypy, so those must match `TOOL_VERSIONS`. `.local/dev/setup-venv.sh` and `lint-pins.py` handle both.
- **The web UI lockfile was rewritten by unit tests** (three worktrees, 2026-11-12). A test reaching `gaia.ui.build.ensure_webui_built()` unmocked (through cli `_launch_agent_ui`) runs a real `npm install`, then `npm run build`, in any worktree with no web UI node_modules. Any npm 10 re-save drops all 6 `libc` entries, which upstream's npm 11 writes. verify.sh exports `GAIA_SKIP_WEBUI_BUILD=1` for pytest, and `verify --fast` refuses a lockfile change without its package.json. Signature: node_modules, .package-lock.json, package-lock.json and dist all stamped within about 5 s.
- **`npx playwright install` deletes other projects' browsers.** Its garbage collection removes every cached revision that no registered install (`~/Library/Caches/ms-playwright/.links`) references. On 2026-11-12 a gaia builder's install for Playwright 1.65 removed chromium 1243, which agent-host's 1.63 needs. The rule is in the overlay: never run it, use the cached shells, and if a download is ever needed set `PLAYWRIGHT_SKIP_BROWSER_GC=1`.
- **Install .local/dev scripts by atomic rename** (`cp new x.new && mv -f x.new x`), never by editing in place: bash reads a running script as it goes, so an in-place edit can break a landing's integrate.sh or verify.sh mid-run. Swap integrate.sh only while `integrate.sh --status` says free.
- **Central monitors only the repos in diffie-central's `mods/central/hooks/lib/repos.js` (REPOS).** Plugin 0.34.0 added gaia, and a session needs a reload before its lane claim works.
- The fork's GitHub Actions are disabled, with 0 workflows, runs and runners (checked 2026-11-12).
- **Panics first at every start-up:** `~/.claude/dev-kit/bin/dk-load-report --panics`. The last known one is 2026-11-10 11:14:59 (cpu 9). Rich resumed gaia's native builds on 2026-11-12, frugally, and the Lead's order is: on any new cpu-9 panic, stop native builds and tell the Lead and @Rich. Until a dev-kit panic alert exists, nothing reports one after the reboot.
- Rich's installed GAIA (`~/.gaia` and the app) is a development install since 2026-11-12 (Rich: "it doesn't matter if things/data get destroyed"). The team may test against it, restart it or reset it. Release owns it, repeatable tests still use their own `GAIA_HOME`, and load and disk policy still apply, so evals on its Lemonade run one at a time through the gate. `~/.gaia-backup-*` is reclaimable disk; tell Release before removing it. Its backend and daemon ports change at each launch (60756 and 60785 after the 0.25.4 update on 2026-11-12), so read them from `ps` and `lsof` or the overlay's Shared facts. Lemonade stays on 56984 and 9000, and llama-server on 8001.

**Why:** these took a start-up's digging to establish and aren't in the repo.

**How to apply:** start here on a new SRE session, then check that each still holds. See [[gaia-disk-floors]] and [[gaia-gate-node-and-landing]].
