# Change: Add ghost overlay for photo-to-photo alignment

## Why
Without visual alignment feedback, users can't tell if consecutive captures overlap correctly.
A ghost overlay showing the previous capture faintly behind the live view makes alignment
intuitive — no backend required.

## What Changes
`GhostOverlayCanvas` (`src/sensors/ghostOverlayCanvas.ts`) already creates the canvas,
drives the RAF loop, integrates gyro yaw via `feedGhostGyro`, exposes `setSnapshot()` with
yaw reset, and has `destroy()` for cleanup. What is missing:

- **Motion gating**: extend `GhostOverlayState` and `feedGhostGyro()` to track all-axis
  angular velocity (gx, gy, gz); in the RAF loop hide the canvas when `|ω| > 0.5 rad/s`
  on any axis, restore when ≤ 0.5 rad/s and at least one snapshot has been set
- **Shift clamping**: extend `computeShiftPx()` (`src/sensors/ghostOverlay.ts`) to clamp
  the returned shift to ±(videoWidth/2) pixels, preventing the ghost from flying off-screen
- **Null frame guard**: in `CaptureView.takePhoto()` (`src/tracer/CaptureView.ts`), guard
  the `ghostOverlay.setSnapshot()` call — if `grabFrame()` returns null, skip the update
  and retain previous ghost content

## Impact
- Affected specs: `ghost-overlay` (new capability)
- Affected code: `src/sensors/ghostOverlay.ts`, `src/sensors/ghostOverlayCanvas.ts`,
  `src/tracer/CaptureView.ts`
