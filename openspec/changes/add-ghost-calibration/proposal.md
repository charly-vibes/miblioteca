# Change: Add ghost calibration page

## Why
Algorithm tuning requires ground-truth data: sensor streams paired with human-corrected
screen positions. Without labeled (prediction, ground-truth) pairs we cannot measure or
improve the ghost overlay's shift accuracy. A dedicated calibration tool collects this data
with zero backend infrastructure.

## What Changes
A new standalone page at `/ghost.html` implemented in `src/ghost/GhostCalibrationPage.ts`
with a 4-phase state machine (IDLE → RECORDING → REPOSITIONING → CAPTURED) that:

- **RECORDING**: streams `Gyroscope` / `LinearAccelerationSensor` samples and ghost RAF
  frames into `cycle.frames[]` / `cycle.ghostFrames[]` while a rectangle tracks the
  ghost overlay's `shiftPx` output in real time
- **REPOSITIONING**: freezes the sensor stream; user drags the rectangle to its true
  position (ground-truth correction); live yaw/pitch recorded at Confirm for drift filtering
- **CAPTURED**: displays per-cycle summary (duration, frames, Δx/Δy, effective yaw error,
  return drift); offers "Export JSON" (browser download) and "Next Cycle"

Supporting modules changed:
- `GhostOverlayCanvas` (`src/sensors/ghostOverlayCanvas.ts`): add `onFrame?` callback to
  `GhostOverlayCanvasDeps` so the calibration page can read each RAF tick's state
  (yawRad, pitchRad, shiftPx, gateOpen) without accessing private fields
- New entry point wired into `vite.config.ts` and `public/ghost.html`

## Impact
- Affected specs: `ghost-calibration` (new capability)
- Affected code: `src/ghost/GhostCalibrationPage.ts` (new), `src/ghost/main.ts` (new),
  `src/ghost/types.ts` (new), `src/sensors/ghostOverlayCanvas.ts` (onFrame addition),
  `public/ghost.html` (new), `vite.config.ts` (entry point)
