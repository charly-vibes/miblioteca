## 1. State model
- [x] 1.1 Add `velX`, `velY`, `dx`, `dy` (metres) to `GhostOverlayState` in `src/sensors/ghostOverlay.ts`
- [ ] 1.2 Add `workingDistanceCm` (number, default 60) to `GhostOverlayState`
- [ ] 1.3 Update `computeShiftPx` / `computeShiftPy` to accept displacement args and add translation component; clamp combined shift to ±(displayWidth/2) and ±(displayHeight/2)

## 2. Sensor subscription
- [x] 2.1 Add `DeviceMotion` event listener in `GhostOverlayCanvas.constructor`
- [x] 2.2 Extract dt from `event.interval` (ms → s); skip samples with dt ≤ 0 or dt > 0.1
- [x] 2.3 Accumulate `velX += 0.5*(prevAx + ax)*dt`, `dx += velX*dt` (trapezoidal, device frame x-axis)
- [x] 2.4 Same for y-axis

## 3. Motion gate and ZUPT correction
- [x] 3.1 Update motion gate thresholds: hide at `|ω| > 0.55 rad/s`, show at `|ω| ≤ 0.40 rad/s` (two-threshold hysteresis)
- [x] 3.2 In the motion-gate close handler, zero `velX` and `velY` (but NOT `dx`, `dy`)

## 4. Reset on shutter
- [x] 4.1 In `setSnapshot()`, reset `velX`, `velY`, `dx`, `dy` to 0 alongside existing integral reset

## 5. Working distance from URL param
- [x] 5.1 In `CaptureView.ts`, parse `?distance=<cm>` at construction; treat non-numeric as default 60 cm; clamp numeric values to [20, 150]
- [x] 5.2 Pass `workingDistanceCm` to `GhostOverlayCanvas` constructor

## 6. Debug events
- [ ] 6.1 Add `dx_cm`, `dy_cm`, `velX`, `velY`, `workingDistanceCm` to `ghost:shift` payload
- [x] 6.2 Add same fields to `ghost` object in `capture:shutter` event

## 7. Tests
- [ ] 7.1 Unit tests for updated `computeShiftPx` with translation args
- [x] 7.2 Unit test: ZUPT zeroes velocity but not displacement
- [x] 7.3 Unit test: `setSnapshot()` resets velocity and displacement
- [x] 7.4 Unit test: URL param clamping (19 → 20, 200 → 150) and non-numeric fallback (abc → 60)
- [ ] 7.5 Unit test: combined shift clamped at display boundary
