## 1. onFrame Callback
- [x] 1.1 Add `onFrame?: (frame: GhostFrame) => void` to `GhostOverlayCanvasDeps` in `src/sensors/ghostOverlayCanvas.ts`
- [x] 1.2 Call `deps.onFrame?.(frame)` each RAF tick after computing shift, before painting canvas
- [x] 1.3 Write tests: callback receives correct `yawRad`/`shiftPx`/`gateOpen` values each tick; absent callback causes no error

## 2. State Machine
- [x] 2.1 Implement IDLE → RECORDING transition on center-dot tap; set `cycle.startedAt`, start sensor recording
- [x] 2.2 Implement RECORDING → REPOSITIONING transition on dot/Stop tap; freeze frames, capture `algorithmPosition`
- [x] 2.3 Implement REPOSITIONING → CAPTURED transition on Confirm; compute `deltaPixels`, record return drift
- [x] 2.4 Implement CAPTURED → IDLE transition on Next Cycle; retain `cycles[]`, reset rectangle to center
- [x] 2.5 Write tests for each transition: phase value, field assignments, UI element visibility

## 3. Rectangle Layout and Tracking
- [x] 3.1 Initialize rectangle at 60% vw × 40% vh, centered
- [x] 3.2 During RECORDING: update `rectLeft = startPosition.x + latestFrame.shiftPx` each RAF tick
- [x] 3.3 During REPOSITIONING: enable drag via `mousedown`/`mousemove`/`mouseup` and touch events
- [x] 3.4 Write tests: rectangle dimensions, shiftPx tracking in RECORDING, drag delta in REPOSITIONING

## 4. Sensor and Ghost Frame Collection
- [x] 4.1 Append `SensorFrame` on each Gyroscope event: `{ t, gx, gy, gz, ax, ay, az }`
- [x] 4.2 Append `GhostFrame` from `onFrame` callback each tick: `{ t, yawRad, pitchRad, shiftPx, pitchShiftPx: 0, gateOpen }`
- [x] 4.3 Write tests: frame count matches event count, `pitchShiftPx` is always 0

## 5. deltaPixels and Return Drift
- [x] 5.1 Compute `deltaPixels = { x: groundTruth.x − algorithm.x, y: groundTruth.y − algorithm.y }` on Confirm
- [x] 5.2 Record `returnYawRad` / `returnPitchRad` from live sensor at Confirm moment
- [x] 5.3 Write tests: deltaPixels values for known position pair, return drift values match live sensor snapshot

## 6. Export JSON
- [x] 6.1 Implement "Export JSON" download with filename `ghost-calibration-YYYY-MM-DD-HH-mm-ss.json`
- [x] 6.2 Serialize full `CalibrationExport` schema: `exportedAt`, `deviceInfo`, `hFovDeg`, `focalLengthPx`, `cycles[]`
- [x] 6.3 Write tests: exported JSON parses correctly; filename matches date pattern; multi-cycle session includes all cycles

## 7. Tab Visibility Pause/Resume
- [x] 7.1 On `visibilitychange` to hidden: stop RAF, pause sensor sampling, freeze timer
- [x] 7.2 On `visibilitychange` to visible: restart RAF, resume sensor sampling, continue timer
- [x] 7.3 Write tests: `visibilitychange` hidden pauses frame accumulation; visible resumes it

## 8. Camera Fallback
- [x] 8.1 If `getUserMedia` is denied: show warning banner, apply solid dark background, allow calibration to continue
- [x] 8.2 Write test: denied camera shows banner; phase remains `idle`; center-dot tap still transitions to RECORDING

## 9. Manual Verification
- [ ] 9.1 Manual test on real Android device. Acceptance criteria:
  (a) IDLE phase shows live camera, pulsing center dot, and telemetry panel
  (b) Tap center → RECORDING: rectangle tracks ghost shift, timer increments
  (c) Tap any dot → REPOSITIONING: rectangle is draggable, Confirm button visible
  (d) Confirm → CAPTURED: summary shows Δx/Δy, effective yaw error, return drift
  (e) Export JSON: downloaded file parses, all frames present, schema valid
  (f) Next Cycle: rectangle resets, previous cycle retained; second export includes both cycles
