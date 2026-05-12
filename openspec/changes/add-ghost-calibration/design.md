## Context

The ghost overlay shifts a frozen camera frame using gyro integration to simulate
a spatially-anchored anchor point. To improve the algorithm we need ground-truth
data: sensor streams paired with human-corrected screen positions.

The `/ghost` page is a calibration tool that records a sensor burst while the user
moves the phone, then captures where the algorithm predicted a reference rectangle
would land vs. where the user drags it to correct the error. Each cycle produces one
labeled training sample.

---

## Goals / Non-Goals

- **Goals**: collect labeled (prediction, ground-truth) pairs for algorithm tuning;
  display live sensor telemetry; reuse pure functions from `ghostOverlay.ts` for
  rectangle positioning; extend `GhostOverlayCanvasDeps` with an `onFrame` callback
  so the page can read each RAF tick's state without accessing private fields.
- **Non-Goals**: replace the capture flow; persist data to a server (JSON download
  is sufficient for MVP); sub-pixel accuracy; vertical pitch correction (yaw-only
  for MVP — `pitchShiftPx` is always 0); multi-user sync.

---

## State Machine

```
                          camera denied
                         ┌─────────────────────────────────────┐
                         ▼                                       │
IDLE ──[tap center]──► RECORDING ──[tap any dot / Stop btn]──► REPOSITIONING ──[Confirm]──► CAPTURED
  ▲                                                                                             │
  └────────────────────────────────── [Next Cycle] ◄──────────────────────────────────────────┘
                                      [Export JSON] (can be tapped at any CAPTURED visit)

Additional transitions:
  Any state ──[tab hidden]──► sensor pause  ──[tab visible]──► resume same state
  IDLE       ──[getUserMedia denied]──► IDLE with warning banner (solid dark background)
```

The page maintains one `CalibrationCycle` object per cycle and a session-level
`cycles[]` array that accumulates across all cycles until Export.

---

## Route & Scaffolding

- New file: `public/ghost.html` — same structure as `public/debug-replay.html`
- New entry point: `src/ghost/GhostCalibrationPage.ts`
- No router change needed; the page is accessed directly at `/ghost.html`
- Service worker scope already covers `public/`; no SW change required
- Build: add `ghost.html` to the Vite entry map in `vite.config.ts` (same pattern as `debug-replay.html`)

---

## Phase 0 — IDLE

**Entry condition:** page load, or "Next Cycle" from CAPTURED.

**What the user sees:**

```
┌─────────────────────────────────────────┐
│  gx  0.002  gy −0.001  gz  0.000 rad/s │  ← live gyro
│  ax  0.01   ay −9.81   az  0.00  m/s²  │  ← live accel
│  Motion gate: CLOSED  |ω|: 0.031 rad/s │
│  Yaw:  0.0°    Pitch:  0.0°            │
│  Shift: 0 px   ZUPT: ON               │
├─────────────────────────────────────────┤
│                                         │
│                                         │
│        ●─────────────────●              │  ← corner dots (red, 24 dp)
│        │                 │              │
│        │        ●        │              │  ← center dot (red, pulsing)
│        │                 │              │
│        ●─────────────────●              │
│                                         │
│           TAP CENTER TO START           │  ← hint text
│                                         │
└─────────────────────────────────────────┘
```

**Telemetry panel** (always visible, top strip):

| Field | Source | Unit |
|---|---|---|
| `gx / gy / gz` | `Gyroscope` sensor | rad/s |
| `ax / ay / az` | `LinearAccelerationSensor` | m/s² |
| Motion gate | `onFrame` callback `gateOpen` field | OPEN / CLOSED |
| `|ω|` | `sqrt(gx²+gy²+gz²)` | rad/s |
| Yaw | `onFrame` callback `yawRad` in degrees | ° |
| Pitch | `onFrame` callback `pitchRad` in degrees | ° |
| Shift | `onFrame` callback `shiftPx` | px |
| ZUPT | velocity-ZUPT active flag (from sensor pipeline) | ON / OFF |

**Rectangle:**
- Fixed size: 60% of viewport width × 40% of viewport height
- Initially centered on screen
- 4 corner dots at corners; 1 center dot at geometric center
- All dots 24 dp diameter, `#FF3B30` (iOS red)
- Center dot pulses (CSS `animation: pulse 1.2s ease-in-out infinite`)
- Corner dots visible; no tap affordance yet

**Background:**
- Live `<video>` viewfinder (`getUserMedia({ video: { facingMode: 'environment' } }}`)
  fills the viewport behind the rectangle and ghost canvas.
- If `getUserMedia` is denied: solid dark background (`#111`) + warning banner
  "Camera unavailable — calibration data still valid".
- `GhostOverlayCanvas` is mounted on top (transparent background). Ghost canvas
  stays hidden (normal visibility logic applies — no snapshot taken yet).

**Interaction:** tap the center dot → transition to RECORDING.

**Tab visibility:** if the tab goes to background in IDLE, sensors pause immediately
and resume when the tab becomes visible again. No state change.

**Data initialized:**

```typescript
cycle.id = crypto.randomUUID()
cycle.startedAt = undefined          // set on RECORDING entry
cycle.rectangleSize = { width, height }
cycle.startPosition = centerOfScreen
```

---

## Phase 1 — RECORDING

**Entry condition:** tap on center dot from IDLE.

**What changes:**

1. `cycle.startedAt = performance.now()`
2. Sensor sampling begins; each sample appended to `cycle.frames[]`
3. Ghost overlay RAF fires each tick; the `onFrame` callback (see Reuse Boundaries)
   appends the current frame state to `cycle.ghostFrames[]`
4. `cycle.startPosition` snapped to rectangle's current center (viewport px)
5. Recording indicator: red circle + elapsed timer (MM:SS) in top-right corner
6. Center dot loses pulse; all 5 dots gain a glow ring ("tap any dot to stop")
7. Hint text: "RECORDING — tap any dot to stop"

**Rectangle behavior ("locked to space"):**

The rectangle tracks the ghost overlay's computed horizontal shift each RAF tick.
`shiftPx` is read from the `onFrame` callback (not from a private field):

```
rectX = startPosition.x + latestFrame.shiftPx
rectY = startPosition.y                         // pitch is yaw-only MVP (always 0)
```

The corner dots and center dot ride with the rectangle.

`focalLengthPx` (used internally by `computeShiftPx`) is derived as:

```
focalLengthPx = (viewportWidth / 2) / tan(hFovDeg / 2 × π/180)
```

`hFovDeg` defaults to 40 (empirically matched to phone held at ~55° natural tilt; see `DEFAULT_HFOV_DEG` in `ghostOverlay.ts`). This value is
included in the export so offline analysis can reproduce the formula.

**Sensor stream schema (per frame):**

```typescript
interface SensorFrame {
  t: number;   // ms since cycle.startedAt
  gx: number; gy: number; gz: number;  // rad/s
  ax: number; ay: number; az: number;  // m/s²
}
```

Sampling rate: one frame per `Gyroscope` event (typically 100 Hz on Android Chrome).
No decimation; raw stream retained.

**Ghost frame schema (per RAF tick):**

```typescript
interface GhostFrame {
  t: number;           // ms since cycle.startedAt
  yawRad: number;      // yawIntegral at this tick
  pitchRad: number;    // pitchIntegral at this tick (logged; not used for rect position in MVP)
  shiftPx: number;     // CSS translateX applied to ghost canvas (= rectX offset)
  pitchShiftPx: 0;     // always 0 in MVP; reserved for future vertical correction
  gateOpen: boolean;   // ghost canvas visibility
}
```

**Tab visibility:** if the tab goes to background during RECORDING, sensor sampling
pauses and the RAF stops. The timer freezes. On return, sampling resumes and the
timer continues from where it paused. A brief "⏸ paused" indicator appears.

**Interaction:** tap any of the 5 dots, or the "Stop" button below the rectangle →
transition to REPOSITIONING.

**Data updated on exit:**

```typescript
cycle.endedAt = performance.now()
cycle.algorithmPosition = currentRectCenter  // where the math left it
```

---

## Phase 2 — REPOSITIONING

**Entry condition:** tap on any dot (or "Stop" button) from RECORDING.

**What happens:**

1. Sensor recording stops. `cycle.frames` and `cycle.ghostFrames` are frozen.
2. Ghost overlay RAF is paused (canvas retains last painted frame).
3. Telemetry panel continues showing live gyro/accel values (sensors still running),
   but Yaw/Pitch/Shift show "PAUSED" — they reflect the frozen state.
4. The rectangle is now "free" — it no longer tracks ghost overlay math.
5. Drag affordance: dots gain a move cursor, rectangle background becomes
   semi-transparent white (`rgba(255,255,255,0.15)`).
6. Hint text: "DRAG rectangle to its true position, then tap Confirm"
7. "Confirm" button appears below the rectangle.

**Drag mechanics:**

- Entire rectangle body is draggable (not just dots)
- Touch events: `touchstart`, `touchmove`, `touchend` on the rectangle element
- Position unconstrained within viewport
- Real-time `left/top` CSS updates; corner and center dots ride with the rectangle

**What the user is asked to do:**

The phone is stationary (back at roughly the starting orientation, or wherever
the user ended up). The rectangle shows where the algorithm *predicted* the
reference point would land. The user drags it to where the reference point
*actually* appears relative to the current view. This is the ground-truth correction.

**Return orientation capture:** the live yaw/pitch at the moment "Confirm" is tapped
is recorded as `returnYawRad` / `returnPitchRad`. Offline analysis can use this to
discard cycles where the user returned to a very different orientation (large return
drift → ambiguous ground truth). No UI indicator is required in MVP.

**Tab visibility:** same sensor-pause behavior as RECORDING.

**Confirm interaction:** tap "Confirm" (or tap center dot) → transition to CAPTURED.

**Data updated on exit:**

```typescript
cycle.groundTruthPosition = currentRectCenter  // where user dragged it
cycle.returnYawRad = latestLiveYaw             // live yaw at moment of Confirm
cycle.returnPitchRad = latestLivePitch         // live pitch at moment of Confirm
cycle.deltaPixels = {
  x: groundTruthPosition.x - algorithmPosition.x,
  y: groundTruthPosition.y - algorithmPosition.y,
}
```

---

## Phase 3 — CAPTURED

**Entry condition:** "Confirm" from REPOSITIONING.

**What the user sees:**

```
┌─────────────────────────────────────────┐
│  CYCLE 1 COMPLETE                       │
│                                         │
│  Duration:    4.2 s   Frames: 417      │
│  Δx:  +23 px          Δy:  −8 px       │
│  Algorithm yaw at end:  3.1°            │
│  Effective yaw error:  ~1.4°            │
│  Return drift:  0.3° yaw  0.1° pitch   │
│                                         │
│  [  Export JSON  ]   [  Next Cycle  ]   │
│                                         │
│  Collected cycles: 1                    │
└─────────────────────────────────────────┘
```

**Summary fields:**

| Field | Derivation |
|---|---|
| Duration | `endedAt − startedAt` ms |
| Frames | `cycle.frames.length` |
| Δx / Δy | `cycle.deltaPixels` |
| Algorithm yaw at end | `cycle.ghostFrames.at(-1).yawRad` in degrees |
| Effective yaw error | `atan(Δx / focalLengthPx)` in degrees, where `focalLengthPx = (viewportWidth/2) / tan(hFovDeg/2 × π/180)` |
| Return drift | `returnYawRad` and `returnPitchRad` in degrees (shows how far user rotated back) |

**Export JSON:** browser download of all cycles in the session.
File name: `ghost-calibration-YYYY-MM-DD-HH-mm-ss.json`.

**Next Cycle:** clears current cycle, resets rectangle to center, transitions to IDLE.
Previously collected cycles are retained in memory.

**Tab visibility:** no sensors running; tab background has no effect on this phase.

---

## Exported Data Schema

```typescript
interface CalibrationExport {
  exportedAt: string;       // ISO 8601
  deviceInfo: {
    viewportWidth: number;
    viewportHeight: number;
    devicePixelRatio: number;
    userAgent: string;
  };
  hFovDeg: number;          // ghost overlay hFOV used (default 40 = DEFAULT_HFOV_DEG)
  focalLengthPx: number;    // derived: (viewportWidth/2) / tan(hFovDeg/2 × π/180)
  cycles: CalibrationCycle[];
}

interface CalibrationCycle {
  id: string;
  startedAt: number;        // ms (performance.now())
  endedAt: number;
  rectangleSize: { width: number; height: number };
  startPosition: { x: number; y: number };       // center, viewport px
  algorithmPosition: { x: number; y: number };   // where ghost math predicted
  groundTruthPosition: { x: number; y: number }; // where user corrected to
  deltaPixels: { x: number; y: number };
  returnYawRad: number;     // live yaw at Confirm (for drift quality filter)
  returnPitchRad: number;   // live pitch at Confirm
  frames: SensorFrame[];
  ghostFrames: GhostFrame[];
}
```

---

## Reuse Boundaries

| Module | Status | Change required |
|---|---|---|
| `ghostOverlay.ts` (pure functions) | Reused as-is | None |
| `GhostOverlayCanvas` | Extended | Add `onFrame?: (frame: GhostFrame) => void` to `GhostOverlayCanvasDeps`; called each RAF tick before paint |
| `imuRecorder.ts` sensor types | Reused as-is | None |
| `CaptureView.ts` | Not used | `/ghost` is a standalone route |

### `onFrame` callback design

`GhostOverlayCanvas` fires `deps.onFrame(frame)` each RAF tick with the current
computed state. This gives the `/ghost` page read access to yaw, pitch, shiftPx,
and gateOpen without accessing private fields:

```typescript
// GhostOverlayCanvasDeps (addition)
onFrame?: (frame: GhostFrame) => void;

// Inside GhostOverlayCanvas RAF loop (addition, after computing shift):
deps.onFrame?.({
  t: performance.now() - cycleStartMs,
  yawRad: yawIntegral,
  pitchRad: pitchIntegral,
  shiftPx: currentShiftPx,
  pitchShiftPx: 0,
  gateOpen: isVisible,
});
```

The `/ghost` page stores `latestFrame` from the callback and uses `latestFrame.shiftPx`
to position the rectangle each RAF tick. No duplication of ghost math.

---

## Decisions

### Background (OQ-1) — **Live camera feed**

Live `<video>` viewfinder behind the rectangle and ghost canvas. If `getUserMedia`
is denied, fallback to solid dark (`#111`) with a warning banner. Data is still
valid in fallback mode.

### Data persistence (OQ-2) — **Download JSON**

"Export JSON" triggers a browser download containing all cycles in the session.
Same format as `debug-replay`. No backend required.

### Cycles per session (OQ-3) — **Unlimited**

Tap "Next Cycle" from CAPTURED to collect another. All cycles accumulate in memory;
Export downloads the full session at once.

### Pitch correction (MVP scope) — **Yaw-only**

`pitchShiftPx` is always 0 in MVP. The field is included in the schema and logged
in `GhostFrame` so vertical data is available for future analysis, but the rectangle
only tracks horizontal shift. Vertical pitch correction is deferred.
