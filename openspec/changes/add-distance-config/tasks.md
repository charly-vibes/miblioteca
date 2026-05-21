## 1. Ruler calibration UI
- [x] 1.1 Add "Calibrate distance" button to `CaptureView` (always visible in `?debug`, behind a ⚙ icon in normal mode)
- [x] 1.2 On tap: show a fullscreen overlay with a resizable bracket and two reference presets (credit card 8.56 cm, paperback 13 cm)
- [x] 1.3 Implement drag-to-resize bracket; show live cm readout as user drags
- [x] 1.4 On "Done": compute `distance_m = (focalLength * referenceWidth_m) / bracketWidth_px`; write result to `localStorage` key `miblioteca.workingDistanceCm`
- [x] 1.5 Pass calibrated distance to `GhostOverlayCanvas.setWorkingDistance(cm)` immediately

## 2. Persistence and URL param
- [x] 2.1 On `CaptureView` init, read `localStorage` value; fall back to `?distance=<cm>` URL param, then 60 cm default
- [x] 2.2 URL param does NOT persist to `localStorage` (session-only override)
- [x] 2.3 Clamp all distance inputs to [20, 150] cm; treat non-numeric URL param as default 60 cm

## 3. Tilt sanity warning
- [x] 3.1 In `GhostOverlayCanvas.onOrientation()`, track `beta` and compute `|beta - 90|`
- [x] 3.2 Debounce: only flag if deviation > 30° for > 1 s; clear immediately when back in range
- [x] 3.3 Emit a new `ghost:tilt-warning` debug event (`{ visible: boolean, beta: number }`)
- [x] 3.4 Wire a DOM overlay element in `CaptureView` that shows/hides based on this signal

## 4. movement.html integration
- [ ] 4.1 Add a "Copy camera link" button in debug mode that builds `<app-origin>/?debug&distance=<calibrated-value>` and writes it to clipboard

## 5. Debug log
- [x] 5.1 Ensure `workingDistanceCm` appears in `ghost:at-shutter` (validate against `add-translation-tracking` task 6.2)

## 6. Tests
- [x] 6.1 Unit test: `localStorage` round-trip (write, read, apply)
- [x] 6.2 Unit test: tilt warning debounce logic (> 30°, < 1 s → no warning; > 30°, > 1 s → warning)
- [x] 6.3 Unit test: distance formula — known bracket width + reference → expected distance
- [x] 6.4 Unit test: URL param session-only (does not update `localStorage`)
