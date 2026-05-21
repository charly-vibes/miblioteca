## 1. Shift Clamping
- [x] 1.1 Extend `computeShiftPx()` in `src/sensors/ghostOverlay.ts` to clamp the return value to ±(videoWidth/2) pixels
- [x] 1.2 Write unit tests: large yaw angle (e.g. π/2 rad) is clamped to ±videoWidth/2; small yaw produces an unclamped result

## 2. Motion Gating
- [x] 2.1 Extend `GhostOverlayState` in `src/sensors/ghostOverlay.ts` to track the latest angular velocity magnitude across all three axes (gx, gy, gz); extend `feedGhostGyro()` signature to accept all three axes from `GyroLike.x/y/z`
- [x] 2.2 In `GhostOverlayCanvas.rafLoop()` (`src/sensors/ghostOverlayCanvas.ts`), hide the canvas when stored `|ω| > 0.5 rad/s` on any axis; restore when ≤ 0.5 rad/s and at least one snapshot has been drawn
- [x] 2.3 Write tests: canvas hidden when any angular velocity axis exceeds 0.5 rad/s; visible when all axes are below threshold and a snapshot exists

## 3. Null Frame Guard
- [x] 3.1 In `CaptureView.takePhoto()` (`src/tracer/CaptureView.ts`), guard the `ghostOverlay.setSnapshot()` call — if `grabFrame()` returns null, do not call `setSnapshot()` and retain previous ghost content
- [x] 3.2 Write test: after a failed grabFrame, the ghost canvas retains its previous snapshot and the yaw accumulator is not reset

## 4. Manual Test
- [ ] 4.1 Manual test on real Android device during a shelf scan. Acceptance criteria: (a) overlay is invisible before first capture; (b) after first capture the ghost appears at correct position; (c) a 30° yaw rotation shifts the overlay approximately ±half-screen (~240 px at 65° hFOV on a 480 px-wide view); (d) overlay hides during rapid repositioning between shelves; (e) no jitter when device is stationary
