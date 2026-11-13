# How Parity accepts matrix rows (2026-11-12)

A row of `parity-matrix.md` becomes `done` only after the phone app is compared with the reference, screen
by screen, in English and Arabic. The reference is main's Agent UI as the matrix quotes it. Rich's installed
app is supporting evidence only. Acceptance sub-agents (sonnet) do the comparison and write a report;
Parity reviews it and marks the rows. Sub-agents never edit the matrix.

## Inputs for one acceptance task (`<epic>-accept`)

- **The rows:** `node /Users/rapuckett/Projects/gaia/.local/dev/parity-accept-check.mjs --task <epic>-accept --app <app src>`
  lists every row in the epic and checks mechanically that the app uses the catalog keys, labels (matched
  by their English text) and routes each row quotes. Use the landed app,
  `/Users/rapuckett/Projects/gaia/src/gaia/apps/mobile` on `integration/rapuckett`, unless the brief names a
  worktree.
- **The app's scenes:** the web export's visual scenes for the epic (`qa-visual`, through `fnd-web-harness`)
  at 320, 390 and 768 wide, in English and Arabic, plus device shots from the native checkpoints where the
  row is native (photo picker, share sheet, push). The brief names their folder.
- **The reference scenes:** main's web UI fixture scenes (Design's `test:visual` output for the same
  fixtures), at 390 and 1280, in English and Arabic. The brief names their folder.

## Checklist for every row

1. **Pre-check:** every key, label and route the pre-check finds missing is a gap, unless the app gets that
   text from the backend at runtime or the row's Notes allow a substitute. Say which.
2. **Labels:** the same catalog keys, through `useT`, in both languages, with no new English literal (Rich's
   reuse rule).
3. **Order:** items appear in the reference's order, top to bottom and start to end.
4. **States:** every state in the row's States column can be reached and looks right: empty, loading,
   running, error, long content, disabled, offline.
5. **Behavior:** the same API calls with the same effects.
   - A PC-only row (R1–R4) shows the catalog's refusal text, or the state read-only (Design's call).
   - A `different` row matches the agreed behavior. D2 means preview or share on the phone, never open
     anything on the PC.
6. **Phone idioms:** a hover-only or keyboard-only action has a touch substitute, or the row's Notes say
   none is needed.
7. **Arabic:** the layout mirrors, numbers with units stay left-to-right, and no English is left.

## Output

- **`/Users/rapuckett/Projects/gaia/.local/audit/acceptance/<epic>-accept/report.md`:** one table,
  `| ID | Verdict | Evidence | Gap |`. The verdict is `accept` or `gap`. Evidence names the scene files
  compared. A gap gives the exact difference, the scene, and the lane that owns the fix.
- Shots go in the same folder. Never include a shot of Rich's real data.
- **The final report:** the common brief's format. Outcome gives the counts accepted and with gaps.

## Rules

- Read-only: no app or web UI edits, no matrix edits, no commits.
- Scenes are produced headless, through the gate (`/Users/rapuckett/Projects/gaia/.local/dev/heavy.sh`),
  on the team's ports, from a dev backend with its own `GAIA_HOME`, so runs repeat and don't collide.
- **Rich's installed GAIA is a development install** (Rich, 2026-11-12: "this is all for development so it
  doesn't matter if things/data get destroyed"). An acceptance run may exercise it fully when it needs the
  real app, but only after telling Release (gaia-92), who owns it and records what changed. Skip what loads a
  model unless the run is about one (`/api/setup/check?load=true`, `/api/memory/stream-inference`,
  `/v1/email/*`): a load competes with the gate and evicts his resident model. Skip the PC memory scans and
  anything that opens a window. **Never start the tunnel** (`POST /api/tunnel/start`, which fires as soon as
  the Mobile access dialog opens). It can expose his PC to the internet, and the dev-install rule covers
  data, not security. Stop processes only by a recorded PID. Shots of his real data still stay out
  of git and out of any shared page.

## Parity's side, after the report

- Read the report and open the shots for at least every row with a gap, plus a sample of the accepted ones.
- Mark accepted rows: `node .local/dev/parity-matrix-set.mjs status done <IDs> --note "accepted <date>, <report path>"`
  and `evidence main <IDs>`.
- Send each gap to the building lane as one message per epic.
- Record the run: `node .local/dev/estimate.mjs actual <sprint est id> --agent <agentId>`.
