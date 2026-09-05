# Project — Web controller for a laser cutter (OctoPrint-like, but for a laser)

## Goal

Local application to drive an Atomstack laser cutter (GRBL firmware) over USB: sending
G-code, real-time tracking, SVG → G-code import with material presets. The equivalent of
OctoPrint, but for a laser cutter instead of a 3D printer.

## Tech stack

- **Monorepo**: Nx
- **Backend**: NestJS (chosen because the dev already knows it, over .NET)
- **Frontend**: Angular + Optimus UI
- **Serial communication**: `serialport` (Node) — the equivalent of `pyserial` on the OctoPrint side
- **Storage**: SQLite via **TypeORM** — nothing more is needed, this is local single-user usage.
  Prisma was tried and then dropped (repeated friction with Prisma 7); see the memory
  `project_prisma_materials_backend`.
- **Real-time**: WebSocket via `@nestjs/websockets` + `@nestjs/platform-ws` (the raw `ws`
  lib, not socket.io), broadcasting GRBL status and raw serial traffic to the UI

NOTE: NEVER use pnpm, only npm.

## Target hardware

- **Atomstack** cutter, **GRBL 1.1** firmware, board clone
- **USB serial** connection
- Safety is already handled at the hardware level by the machine itself:
  - automatic cutoff on overheating
  - automatic cutoff when the door is opened
  - **Physically confirmed**: on this machine, opening the door does report a `Door`
    state (e.g. `<Door:1|...>`) in status reports (`?`) — parsing already handles this
    case (see `grbl-status.parser.ts`). ⚠️ Only the _display_ of the "Door open" status
    is implemented; no automatic blocking logic has been built on top of it yet.
  - **Confirmed quirk of this board**: after a hardware alarm (e.g. `ALARM:1`, hard
    limit reached), the board can silently reset itself and start reporting `Idle`
    again without `$H`/`$X` ever having been sent — so the last `?` status alone can
    never be trusted to tell whether the machine is actually safe. The software
    maintains its own software-side lock (see `GrblConnection.alarmed` in
    `grbl-connection.ts`): once an `ALARM:` is received, every command other than
    `$H`/`$X` is rejected before it's even sent over the serial port, until one of
    those two succeeds (an `ok` response) — even if the machine reports "Idle" in the
    meantime. The same lock also engages after a software emergency stop
    (`GrblConnection.abort()`, see below): GRBL can come back to "Idle" after a
    real-time reset without having actually re-homed.
  - **`$H` (homing)**: is **no longer** injected into the generated/downloaded G-code
    (`WorkspaceGcodeGeneratorService.generate()`) — some external G-code viewers reject
    it as an invalid command. It's now `JobService.start()` that sends `$H` exactly
    once, right before streaming the file to the cutter (see below). The generated
    program ends with `M30` (not `M5`): GRBL's own end-of-program command, which cuts
    everything (laser, motors, exhaust fan, etc.), not just the laser.

## Deployment constraints

- **Local use only**
- **No authentication**, no multi-user management
- No need for advanced application-level security (not exposed on the network)
- A physical dev environment may be running in parallel to yours (shared container,
  `--device=/dev/ttyUSB0` in `.devcontainer/devcontainer.json`) with the real machine
  plugged in: never kill a process on ports 3000/4200 without first checking
  (`sudo lsof -i:PORT`) that it isn't that other session, and never click
  Connect/Disconnect/jog or send an arbitrary command without explicit authorization
  if a real machine could be plugged in.
  - **`ALLOW_PHYSICAL_CONNECTION` safeguard**: `AutoConnectService` (see below) only
    opens the serial port on its own (polling every second as soon as the configured
    port becomes accessible) if the `ALLOW_PHYSICAL_CONNECTION=true` environment
    variable is present when the backend starts — otherwise it does strictly nothing
    (just a warning at boot). The dev's own `npm run serve` script (real physical
    setup) is expected to set it itself; **a Claude Code session must NEVER set it**
    when launching/testing the backend (`nx serve backend`, `nx build backend`, etc.)
    — without it, starting the backend is safe even if `/dev/ttyUSB0` exists in the
    container. This safeguard only covers *automatic* connection: manual actions
    (Connect button, jog, raw command) remain forbidden without explicit authorization,
    as above.
  - **Isolating your own test runs**: even when no process is listening on 3000/4200,
    prefer not to reuse them for your own ad hoc backend boots — a `nx serve backend`
    invocation gets coalesced by the Nx daemon with any other already-running
    `backend:serve` task (from a parallel session), which can make you wait on/attach
    to somebody else's process instead of getting your own. Instead, `nx build backend`
    then run the built artifact directly with `node dist/apps/backend/main.js`
    (bypasses Nx's task dedup entirely), with `PORT=<some other port>` (backend already
    reads `process.env.PORT`, see `main.ts`) and `DATABASE_PATH=<a throwaway file, e.g.
    under /tmp>` (backend reads `process.env.DATABASE_PATH`, falling back to `dev.db`,
    see `app.module.ts`) so your test run never touches the real dev database or binds
    a port someone else might be using.

## Key technical points to keep in mind

- **GRBL protocol**: rather than OctoPrint-style character counting (filling GRBL's
  128-byte RX buffer by counting in-flight bytes), the current implementation
  (`GrblConnection`) sends commands **one at a time** and waits for the matching
  `ok`/`error:N` before sending the next one (an internal FIFO queue). Simpler and
  safer, at the cost of lower command throughput — plenty for manual jog/driving and
  line-by-line program streaming. Only worth revisiting if throughput becomes an
  actual problem (e.g. engraving with lots of tiny segments).
  - Alongside this `ok`/`error` queue, three GRBL **real-time** bytes are sent directly
    on the port, outside the queue, without waiting for a response: `!` (feed hold,
    `GrblConnection.pause()`), `~` (cycle start/resume, `GrblConnection.resume()`), and
    `Ctrl-X`/`0x18` (soft reset, `GrblConnection.abort()` — the emergency stop, see
    `JobService` below). `abort()` also engages the software alarm lock (like a real
    `ALARM:` would), `pause()`/`resume()` don't — nothing is considered faulted by a
    plain feed hold.
- **SVG → G-code** import: the current pipeline is limited to straight line segments
  (M/L) — curves/arcs aren't supported (`UNSUPPORTED_PATH_COMMAND` in
  `WorkspaceCheckService`). Flattening SVG → mm sub-paths happens entirely on the
  frontend (`SvgFlattenerService`); the backend only validates an already-flattened,
  annotated "workspace SVG" (see `docs/workspace-svg-format.md`) before generating
  G-code.
- Material preset library (`Material` → several `Profile`s: LINE/FILL mode, power %,
  speed in **mm/min**, passes, hatch spacing) stored in the database and editable from
  the Configuration page. Every speed in the app (profiles, machine, test pattern
  generator) is in mm/min — the native unit of G-code's feed rate (`F`), matching the
  convention of other software (LightBurn, etc.) rather than mm/s.
- A profile's power is a **percentage**, converted to the G-code `S` value by scaling
  it against GRBL's `$30` (max spindle/laser), stored on `Machine` (`sMax`).
- **Machine origin offset** (`Machine.offsetXMm`/`offsetYMm`): a fixed gap between the
  origin GRBL actually homes to (physical limit switches) and the machine's "logical
  zero" — added to every X/Y coordinate emitted in G-code
  (`WorkspaceGcodeGeneratorService.toMachinePoint()`), so `G0 X0 Y0` doesn't
  necessarily land at the corner of the surface. Shown on the Gcode page as a blue dot
  separate from the usual axes (`SvgToGcodePage.homePoint()`, distinct from
  `originPoint()`, which stays anchored to the chosen corner/origin and never moves
  with the offset — so the axis arrows and grid legend stay aligned with the edge of
  the surface, which itself never moves). G-code coordinates can now be negative (with
  a negative offset): intentional, GRBL handles it just fine.
- **G-code optimization in FILL mode** (hatching): historically, every hatch segment
  cut the laser (`M5`/`G0`/`M4`) even between two very close segments (e.g. small
  curves in a text character), producing a dotted-looking cut and needlessly jerking
  the motors around. Now, a single `M4` is emitted at the start of each pass (power
  stays constant for the whole pass), and a `G0` between two segments natively cuts the
  laser (GRBL's dynamic laser mode) without an explicit `M5`. Below
  `MIN_TRAVEL_DISTANCE_MM` (a constant in `workspace-gcode-generator.service.ts`)
  between the end of one segment and the start of the next, the move is done via a
  plain `G1` (at the machine's travel feed rate) instead of a `G0`, keeping the laser
  on continuously across the gap. Value tuned after real tests on the machine — don't
  change it without an explicit request.

## Backend architecture (NestJS)

- `apps/backend/src/app/cutter/` — `CutterController` (REST: `/cutter/ports`,
  `/connect`, `/disconnect`, `/status`, `/command`) and `CutterGateway` (real-time
  WebSocket, see below). Both call `CutterCommunicationService`.
  - `JobService` — streams the currently uploaded G-code file to the cutter, one line
    at a time (the same send/ok-error primitive as `CheckService`/`FramingService`),
    tracking `currentLine`/`totalLines` for progress. Sends `$H` once before starting.
    Supports pause (`pause()`, GRBL feed hold `!`, the send loop waits on a resume
    signal without sending the next line), resume (`resume()`, `~`), and emergency stop
    (`stop()`, `GrblConnection.abort()` — a real-time reset, doesn't go through the
    normal `ok`/`error` path, see above). Emits `changed` on every
    start/pause/resume/progress/end. Also opens/finalizes a `HistoryEntry` around each
    run (see the "Job history" section below).
  - `AutoConnectService` — polls every second (`OnModuleInit`): if there's no active
    connection and the configured serial port (`Machine.serialPortPath`) is accessible
    (`fs.access`), attempts to connect automatically (the same options as the manual
    "Connect" button, via the shared `machine-connection-options.ts`). Does nothing if
    the machine is off/unplugged (the port just doesn't exist). A `connecting` flag in
    `GrblConnection` keeps a manual attempt and an automatic one from opening the port
    at the same time. **The poll itself only starts if `ALLOW_PHYSICAL_CONNECTION=true`**
    (see "Deployment constraints" above) — otherwise `onModuleInit` just logs a warning
    and schedules no poll.
- `libs/cutter-communication` — shared lib, independent of NestJS:
  - `GrblConnection` — low-level serial connection (`serialport`), ok/error command
    queue, real-time status requests (`?`), software alarm lock (see above), real-time
    `pause`/`resume`/`abort` commands (see above). Emits `sent`/`received` (raw
    traffic, for the terminal), `status`, `alarm`, `data`, `error`, `disconnected`.
  - `grbl-status.parser.ts` — parses a `<State|MPos:...|WPos:...>` report, including
    the `Door:n`/`Hold:n` sub-states.
  - `CutterCommunicationService` — Nest-injectable wrapper around `GrblConnection`.
- `apps/backend/src/app/machine/` — CRUD (TypeORM/SQLite) for machine settings: name,
  bed dimensions, serial port, baud/dataBits/stopBits/parity, X/Y mirroring, origin,
  origin offset (`offsetXMm`/`offsetYMm`, see above), max accelerations, work speed
  (`maxSpeedXMmPerMin`/`YMmPerMin`, used for laser-on `G1`s) and travel speed
  (`travelSpeedXMmPerMin`/`YMmPerMin`, used for `G0`s), `sMax`.
  `machine-connection-options.ts` centralizes the `Machine` → serial connection options
  conversion, shared between `CutterGateway` (manual connection) and
  `AutoConnectService`.
- `apps/backend/src/app/materials/` — CRUD for materials + cutting/engraving profiles.
- `apps/backend/src/app/gcode/` — CRUD for custom G-code blocks injected at the start
  (`start`) / end (`end`) of a program, with an execution order (`order`).
- `apps/backend/src/app/workspace-check/` — parses and validates a "workspace SVG"
  exported by the frontend (missing/unknown profiles, no material selected, path
  outside the bed, crossing paths, unsupported path commands) before G-code generation.
- `apps/backend/src/app/workspace/workspace-gcode-generator.service.ts` — generates the
  final G-code from a validated workspace (see `docs/workspace-svg-format.md` for the
  program's exact structure).
- `apps/backend/src/app/history/` — job history, see the "Job history" section below.
- Not yet built: a job queue (only one active job at a time, `JobService` has no queue
  concept).

### Job history (`HistoryModule`)

- `history_entry` table (TypeORM, `HistoryEntry` entity in
  `history/entities/history-entry.entity.ts`): GUID primary key, nullable
  `machine`/`machineId` FK to `Machine` with `ON DELETE SET NULL` (**not** `CASCADE`,
  unlike `Profile.material`) — a history entry must outlive the machine it ran on, e.g.
  the machine being replaced by a new one; the frontend shows "<Unknown machine>" once
  `machineName` comes back `null`. Also stores `fileName`, `fileSizeBytes`,
  `commandCount`, a `thumbnailBase64` (64x64 PNG, base64-encoded, no `data:` prefix),
  `startDatetime`, and a nullable `endDatetime`/`result` (`HistoryResult`:
  `success`/`error`/`aborted`, stored as varchar — SQLite has no native enum column).
- Lifecycle lives entirely inside `JobService.start()` (not a separate REST call from
  the frontend): a `HistoryEntry` is created (best-effort, wrapped in try/catch — a
  history-write failure must never block the actual cut) right after the job's
  `fileName`/`totalLines` are known, with `endDatetime`/`result` left `NULL`; it's
  finalized in the same method's `finally` block once the run actually ends. The
  three-way outcome is derived from state `JobService` already tracks: the existing
  `stopRequested` flag (set only by the emergency-stop path, `stop()`) means
  `ABORTED`; otherwise a non-null `lastError` means `ERROR`; otherwise `SUCCESS`. No
  separate abort/error flag was needed.
- `machineId`, `fileName`, `fileSizeBytes`, `commandCount` are all deduced backend-side
  (from `MachineService.get()` and the already-uploaded `GcodeFileService.get()`) —
  only the thumbnail travels over the wire, as `{ thumbnailBase64 }` in the `startJob`
  WebSocket message (see below).
- `GET /api/history/summary` → `{ success, error, aborted }` counts. `GET /api/history?
from=<ISO>&to=<ISO>` → the list of **finished** entries only (`endDatetime IS NOT
  NULL`, which always implies `result` is set too), optionally narrowed to a
  `startDatetime` range, most recent first. Both live in `HistoryController`/
  `HistoryService`; `JobService` calls `HistoryService.create()`/`.finish()` directly,
  not over REST.
- Frontend thumbnail (`renderGcodeThumbnail()`, in
  `apps/frontend/src/app/features/operation/gcode-viewer/gcode-thumbnail.ts`): rendered
  from the G-code file's own toolpath (reusing `parseGcodeProgram()`), *not* a literal
  DOM/SVG screenshot of the Viewer tab — the Operation page's three tabs share one
  `<router-outlet>`, so the Viewer might not even be mounted when "Start" is clicked
  (the button lives in the always-visible `GcodeFileCard` sidebar). Only `G1` (cut)
  segments are drawn, scaled/centered onto an offscreen 64×64 canvas.

### WebSocket (`CutterGateway`, `@nestjs/websockets` + `@nestjs/platform-ws`)

- A single gateway, path `/api/ws/cutter`, `WsAdapter` (raw `ws` lib, not socket.io)
  registered in `main.ts`. Message convention: `{ event, data }`.
- The connection to the cutter isn't only opened by a `connect` message — see
  `AutoConnectService` above, which opens it on its own as soon as the configured
  serial port becomes accessible again.
- Client → server: `connect`, `disconnect`, `sendCommand({ command })`,
  `deleteGcodeFile`, `startFrame`, `stopFrame`, `startCheck`, `startJob({
thumbnailBase64 })`, `stopJob`, `pauseJob`, `resumeJob`.
- Server → client:
  - `status` (`MachineStatusPayload { connected, grbl }`) — polled every 1s while
    connected + broadcast immediately on any alarm change, deduplicated otherwise.
  - `serial` (`SerialMessagePayload { direction: 'sent'|'received', timestampMs,
dataBase64 }`) — replays live absolutely everything that goes over the serial port
    (feeds the Terminal tab). The payload is base64-encoded to stay "binary-safe" even
    if GRBL ever sends back non-ASCII bytes.
  - `gcodeFile` (the currently uploaded G-code file), `checkResult` (state of a `$C`
    run), `jobStatus` (`JobStatusPayload { running, paused, fileName, currentLine,
totalLines, error }` — progress of a running job, see `JobService` above; surfaced
    both by the menubar flashcard and the "Gcode file" card on the Operation page).
- The status sent back applies the software alarm lock (`applyAlarmLatch`): as long as
  `CutterCommunicationService.isAlarmed()` is true, the state sent to the client is
  forced to `Alarm`, whatever GRBL itself actually reports.

## Frontend (Angular + Optimus UI)

- **Shell** (`apps/frontend/src/app/shell/`) — menubar common to every page, with a
  `MachineStatusFlashcard` on the right (the menubar's `ng-template pTemplate="end"`):
  visible from any page, shows the machine's name, GRBL status as a colored tag
  (colors/labels shared with `MachineStatusCard` via `GRBL_STATE_LABELS`/
  `GRBL_STATE_SEVERITIES` in `machine-status.model.ts`), the loaded file's name, and —
  if a job is running — a progress bar + an emergency stop button (solid red octagon
  icon, no confirmation: a real emergency stop button doesn't wait for an "are you
  sure").
- **"Gcode" page** (`/gcode`, `SvgToGcodePage`) — multi-document SVG import, a
  layer/group tree, shape selection/move/rotate (drag + rotation handle), canvas
  pan/zoom (wheel + middle-click drag), undo/redo, "explode" a group into independent
  entities, laser offset (kerf compensation, via `polygon-offset`, accounting for
  sub-path nesting to tell an outer contour from a hole), assigning material profiles
  by drag-click, exporting/checking a "workspace SVG" (see
  `docs/workspace-svg-format.md`). State persisted in `sessionStorage`
  (`webcutter.svg-to-gcode.workspace`): SVG sources are re-flattened on load rather
  than deserialized as-is, to stay consistent with the parsing code.
  - Viewer: grid + legend + axis arrows always anchored to the chosen corner/origin
    (`originPoint()`), unaffected by the machine offset — a separate blue dot
    (`homePoint()`) shows where `G0 X0 Y0` actually lands given the offset (see
    above).
  - "Test pattern" generator (`TestPatternGeneratorService`): a grid of shapes with
    profiles interpolating power/speed, optional legends. The legend/material-label
    profile is fixed at 50% power and 6000 mm/min, independent of the range being
    tested. The "mm/min" unit (which takes up a lot of room) is no longer repeated on
    every line: a single label at the top-left of the grid, above the largest value.
  - "Save workspace SVG"/"Download G-code" buttons: open a popover
    (`FilenamePopover`, `app-filename-popover`) asking for a file name before
    downloading, instead of always naming it "workspace.svg"/"workspace.gcode" (which
    created duplicates in the downloads folder). ⚠️ A `<form>` with a field bound via a
    plain `[formControl]` (without a `[formGroup]` on the `<form>` itself) doesn't
    block native submission: `(ngSubmit)` never fires and the browser reloads the page
    — always wrap it in a real `FormGroup` + `[formGroup]` on the `<form>`, never a bare
    `FormControl` with `(ngSubmit)`.
- **"Operation" page** (`/operation`, `OperationPage`) — toolbar + `p-splitter` 25/75:
  - Left sidebar: `MachineStatusCard` (machine name in the header, connection/GRBL
    status as a colored tag, Connect/Disconnect buttons — disabled while a job is
    running, confirmation before disconnecting) and `PositionCard` (X/Y position from
    `WPos` — relative to the cutting surface's origin, so negative if the head is to
    the left/below the origin — falling back to `MPos` if the board's `$10` report
    mask doesn't include `WPos`, a jog D-pad with a central `$H` button, adjustable
    step in mm; jog disabled while a job is running).
  - `GcodeFileCard` — info about the loaded file, Start/Frame/Check buttons when
    nothing is running; while a job is running: progress bar + Pause/Resume (GRBL feed
    hold/resume) and Abort (emergency stop, `JobService.stop()`, no confirmation)
    buttons. Shows the last failed job's error (abnormal stop). `startJob()` renders a
    thumbnail from the file's own toolpath (see `renderGcodeThumbnail()`, "Job history"
    above) before sending `startJob` over the socket.
  - Right panel: routed tabs (`/operation/gcode` by default,
    `/operation/terminal`):
    - `GcodeViewerPanel` — **implemented** (no longer a placeholder): previews the path
      of the currently uploaded G-code file, rendered as SVG `<line>`s in the same
      grid/camera component as the Gcode page (`gcode-program-parser.ts` parses the
      G-code — modal X/Y/mode/F/S state, one segment per `G0`/`G1`, `G2`/`G3` arcs not
      drawn but tracked for position — and `gcodeToBedPoint()` inverts the backend
      generator's bed→machine conversion, including the origin offset). Toggleable
      G0/G1 filters, plain/speed/power color mode (gradient across the whole file's
      range), a slider limiting how many segments are drawn (useful on a large file).
    - `TerminalPanel` — full history of frames exchanged with the machine (direction
      icon, HH:MM:SS.mmm timestamp, ASCII or hex content if not printable), rendered
      via `p-scroller` (virtual scrolling, fixed 22px row height — so long text is
      truncated with an ellipsis rather than wrapping) to stay performant with a large
      history. An "Autoscroll" toggle (on by default, turned off by any manual scroll
      detected in pixels, not by index — the virtual scroller's tolerance buffer makes
      index-based detection unreliable on a short list), "Clear" (wipes the in-memory
      history) and "Export" (downloads `terminal.log`, one line per message:
      `[ISO 8601 timestamp] -> or <- content`) buttons, and an input field to send a
      raw command.
  - `CutterSocketService` — single WebSocket client (`providedIn: 'root'`),
    status/file/check/job (`jobStatus`) signals + a `Subject` of serial messages,
    automatic reconnection.
- **"Configuration" page** (`/configuration`) — machine settings (a "Machine" card
  organized into an accordion by category: General, Coordinates, Laser, Speeds,
  Connection — see the new machine fields above), material/profile library (speed in
  mm/min), custom G-code blocks (start/end). Labels are entirely in English (the app's
  official language).
- **"History" page** (`/history`, `HistoryPage`) — past jobs: thumbnails, results,
  dates. Two cards:
  - `HistorySummaryCard` — a `MeterGroup` (`@openng/optimus-ui/metergroup`) showing the
    proportion of success/error/aborted among every finished job, from `GET
/api/history/summary` (`HistoryApiService`). Colors/labels for each `HistoryResult`
    live in `history-result.model.ts` (`HISTORY_RESULT_LABELS`/
    `HISTORY_RESULT_SEVERITIES`/`HISTORY_RESULT_COLORS`), the same pattern as
    `GRBL_STATE_LABELS`/`GRBL_STATE_SEVERITIES`.
  - `HistoryJobsCard` — from/to date filters (empty by default, narrowing
    `startDatetime`), a `SelectButton` toggling between a `DataView` (default: list of
    thumbnail + file info + result `Tag`) and a `Timeline` (start date on the left/
    opposite side, the same content as a card on the right). Both are first uses of
    their respective Optimus UI components in this codebase — check
    `node_modules/@openng/optimus-ui/types/` for the exact API if extending them
    (they match vanilla PrimeNG's v20 API, since Optimus UI is the org's own
    wrapper/rebrand around it).
- Icons: a "hand-rolled" Tabler system (`tabler-icon-paths.ts`), SVG paths copied
  directly from the `@tabler/icons` package rather than a dedicated dependency (see the
  memory `project_frontend_stack_choices`).

## Not yet done

- Job queue (only one active job at a time).
- Automatic blocking logic based on the `Door` state (only the display exists).
- Applying X/Y mirroring and the origin (`Machine.origin`, other than the implicit
  bottom-left corner) in actual backend G-code generation — these settings exist and
  are shown in the viewer, but `WorkspaceGcodeGeneratorService` doesn't apply them
  itself yet (only the `offsetXMm`/`offsetYMm` offset is).

<!-- nx configuration start-->
<!-- Leave the start & end comments to automatically receive updates. -->

## General Guidelines for working with Nx

- For navigating/exploring the workspace, invoke the `nx-workspace` skill first - it has patterns for querying projects, targets, and dependencies
- When running tasks (for example build, lint, test, e2e, etc.), always prefer running the task through `nx` (i.e. `nx run`, `nx run-many`, `nx affected`) instead of using the underlying tooling directly
- Prefix nx commands with the workspace's package manager (e.g., `pnpm nx build`, `npm exec nx test`) - avoids using globally installed CLI
- You have access to the Nx MCP server and its tools, use them to help the user
- For Nx plugin best practices, check `node_modules/@nx/<plugin>/PLUGIN.md`. Not all plugins have this file - proceed without it if unavailable.
- NEVER guess CLI flags - always check nx_docs or `--help` first when unsure

## Scaffolding & Generators

- For scaffolding tasks (creating apps, libs, project structure, setup), ALWAYS invoke the `nx-generate` skill FIRST before exploring or calling MCP tools

## When to use nx_docs

- USE for: advanced config options, unfamiliar flags, migration guides, plugin configuration, edge cases
- DON'T USE for: basic generator syntax (`nx g @nx/react:app`), standard commands, things you already know
- The `nx-generate` skill handles generator discovery internally - don't call nx_docs just to look up generator syntax

<!-- nx configuration end-->
