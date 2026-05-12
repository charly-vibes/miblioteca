## ADDED Requirements

### Requirement: State Machine
`GhostCalibrationPage` SHALL implement a 4-phase state machine: IDLE → RECORDING →
REPOSITIONING → CAPTURED, with "Next Cycle" returning to IDLE and "Export JSON"
available from CAPTURED at any point in the session.

#### Scenario: Initial phase is IDLE
- **WHEN** the page is constructed
- **THEN** the phase is `idle` and the hint text "TAP CENTER TO START" is visible

#### Scenario: Tap center dot transitions to RECORDING
- **WHEN** the user taps the center dot in IDLE
- **THEN** the phase becomes `recording`, `cycle.startedAt` is set, sensor recording begins,
  and the recording indicator (red circle + timer) appears

#### Scenario: Tap any dot or Stop button transitions to REPOSITIONING
- **WHEN** the user taps any of the 5 dots or the Stop button during RECORDING
- **THEN** the phase becomes `repositioning`, sensor recording freezes, `cycle.endedAt`
  and `cycle.algorithmPosition` are captured, and the Confirm button appears

#### Scenario: Confirm transitions to CAPTURED
- **WHEN** the user taps Confirm in REPOSITIONING
- **THEN** the phase becomes `captured`, `cycle.groundTruthPosition`, `cycle.deltaPixels`,
  `cycle.returnYawRad`, and `cycle.returnPitchRad` are recorded, and the summary panel appears

#### Scenario: Next Cycle returns to IDLE
- **WHEN** the user taps "Next Cycle" in CAPTURED
- **THEN** the phase returns to `idle`, the rectangle resets to center, and previously
  collected cycles are retained in `cycles[]`

#### Scenario: Camera denied shows warning banner
- **WHEN** `getUserMedia` is denied
- **THEN** a warning banner "Camera unavailable — calibration data still valid" is shown
  and the phase remains IDLE; calibration can still proceed

---

### Requirement: Rectangle and Dot Layout
The calibration page SHALL render a draggable rectangle with 4 corner dots and 1 center dot.

#### Scenario: Rectangle dimensions
- **WHEN** the page is constructed
- **THEN** the rectangle is 60% of viewport width by 40% of viewport height, initially centered

#### Scenario: Center dot pulses in IDLE
- **WHEN** the phase is `idle`
- **THEN** the center dot has a CSS pulse animation applied

#### Scenario: Rectangle tracks shiftPx during RECORDING
- **WHEN** the phase is `recording` and the ghost RAF fires a new frame with `shiftPx = S`
- **THEN** the rectangle's CSS `left` is updated to `startPosition.x + S`

#### Scenario: Rectangle is freely draggable in REPOSITIONING
- **WHEN** the phase is `repositioning` and the user drags the rectangle
- **THEN** the rectangle follows the pointer/touch in real time with no position constraints

---

### Requirement: Sensor and Ghost Frame Collection
During RECORDING the page SHALL append one `SensorFrame` per `Gyroscope` event and
one `GhostFrame` per RAF tick via the `onFrame` callback.

#### Scenario: SensorFrame schema
- **WHEN** a Gyroscope event fires during RECORDING
- **THEN** `{ t, gx, gy, gz, ax, ay, az }` is appended to `cycle.frames`
  where `t` is ms since `cycle.startedAt`

#### Scenario: GhostFrame schema
- **WHEN** the ghost RAF fires during RECORDING
- **THEN** `{ t, yawRad, pitchRad, shiftPx, pitchShiftPx: 0, gateOpen }` is appended
  to `cycle.ghostFrames`

#### Scenario: pitchShiftPx is always 0 (MVP)
- **WHEN** any GhostFrame is recorded
- **THEN** `pitchShiftPx` is 0 (vertical correction deferred to post-MVP)

---

### Requirement: deltaPixels and Return Drift
At Confirm, the page SHALL compute the signed pixel error between algorithm prediction
and user correction, plus record live orientation for drift quality filtering.

#### Scenario: deltaPixels computed on Confirm
- **WHEN** the user taps Confirm with the rectangle at position G and the algorithm left
  it at position A
- **THEN** `cycle.deltaPixels = { x: G.x − A.x, y: G.y − A.y }`

#### Scenario: Return drift recorded on Confirm
- **WHEN** the user taps Confirm
- **THEN** `cycle.returnYawRad` and `cycle.returnPitchRad` reflect the live sensor
  values at the moment Confirm was tapped

---

### Requirement: Export JSON
The page SHALL offer a browser download of all cycles collected in the current session.

#### Scenario: Export JSON triggers download
- **WHEN** the user taps "Export JSON" in CAPTURED
- **THEN** a JSON file is downloaded with name `ghost-calibration-YYYY-MM-DD-HH-mm-ss.json`

#### Scenario: CalibrationExport schema
- **WHEN** a JSON export is produced
- **THEN** it matches the `CalibrationExport` interface:
  `{ exportedAt, deviceInfo: { viewportWidth, viewportHeight, devicePixelRatio, userAgent },
     hFovDeg, focalLengthPx, cycles: CalibrationCycle[] }`

#### Scenario: CalibrationCycle schema
- **WHEN** a `CalibrationCycle` appears in the export
- **THEN** it contains: `id`, `startedAt`, `endedAt`, `rectangleSize`, `startPosition`,
  `algorithmPosition`, `groundTruthPosition`, `deltaPixels`, `returnYawRad`,
  `returnPitchRad`, `frames`, `ghostFrames`

---

### Requirement: Tab Visibility Sensor Pause
Sensors and the RAF loop SHALL pause when the tab goes to background and resume when visible.

#### Scenario: Sensors pause on tab hidden
- **WHEN** the tab visibility changes to hidden during RECORDING or REPOSITIONING
- **THEN** sensor sampling pauses and the RAF stops; the timer freezes

#### Scenario: Sensors resume on tab visible
- **WHEN** the tab becomes visible again
- **THEN** sensor sampling resumes and the RAF restarts; the timer continues from its paused value

---

### Requirement: onFrame Callback on GhostOverlayCanvas
`GhostOverlayCanvas` SHALL accept an optional `onFrame` callback in its deps and call it
each RAF tick with the current computed state.

#### Scenario: onFrame called each tick with current state
- **WHEN** `deps.onFrame` is provided and the RAF loop fires
- **THEN** `deps.onFrame({ t, yawRad, pitchRad, shiftPx, pitchShiftPx: 0, gateOpen })`
  is called before the canvas is painted

#### Scenario: onFrame absent causes no error
- **WHEN** `deps.onFrame` is not provided
- **THEN** the RAF loop runs normally without errors
