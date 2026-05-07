## 1. Setup
- [ ] 1.1 Add `hFovToShiftScale(videoWidth: number, hFovDeg: number): number` pure function to `src/tracer/imuMath.ts`
- [ ] 1.2 Write unit tests for `hFovToShiftScale` (identity at 0 yaw, known angle → pixel calculation)

## 2. DOM Layer
- [ ] 2.1 Add `ghostCanvas: HTMLCanvasElement` element to `CaptureView`, absolutely positioned over `<video>`, initially hidden
- [ ] 2.2 Write test: ghost canvas is hidden before first capture

## 3. Shutter Integration
- [ ] 3.1 On shutter event, draw current `grabFrame()` result into `ghostCanvas` and reset yaw accumulator to zero
- [ ] 3.2 Write test: ghost canvas becomes visible after first capture

## 4. Gyro-Driven Shift
- [ ] 4.1 In `requestAnimationFrame` loop, accumulate gyro yaw delta since last shutter
- [ ] 4.2 Apply `transform: translate3d(shiftX, 0, 0)` to `ghostCanvas` using the shift formula
- [ ] 4.3 Write unit tests for yaw accumulator: resets on shutter, accumulates correctly between shutters

## 5. Motion Gating
- [ ] 5.1 Hide ghost canvas (opacity 0) when `|ω| > 0.5 rad/s` on any axis; show when below threshold
- [ ] 5.2 Write test: overlay hidden during rapid motion, shown when stationary

## 6. Manual Test
- [ ] 6.1 Manual test: ghost overlay shifts correctly left/right on real device during shelf scan
