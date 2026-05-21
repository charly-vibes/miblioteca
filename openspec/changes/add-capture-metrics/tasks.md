## 0. Type Foundations
- [x] 0.1 Add `blurry: boolean`, `overexposed: boolean`, `underexposed: boolean`, `dark: boolean` to `qualityChecks` in `CaptureRecord` and `CaptureRecordInput` in `src/tracer/capture.ts`
- [x] 0.2 Audit `src/tracer/shutter.ts` and `src/tracer/qualityChecks.ts` for any assignment to `stepCountSincePrev`; confirm the field has never been populated with meaningful data before renaming
- [x] 0.3 Rename `stepCountSincePrev` → `displacementMeters` in `CaptureRecord.qualityChecks` and `CaptureRecordInput` in `src/tracer/capture.ts`; update all callsites in `src/tracer/shutter.ts` and `src/tracer/qualityChecks.ts`

## 1. Blur Scoring Fix
- [x] 1.1 Rewrite `laplacianVariance()` in `src/tracer/imageProcessing.ts` to accumulate `sum` and `sumSq` without allocating `responses[]` array
- [x] 1.2 Write unit tests confirming the fixed function produces identical results to the original for the same input
- [ ] 1.3 Verify GC improvement: using Chrome DevTools Memory timeline, capture 10 frames and confirm no GC events during the `laplacianVariance` span

## 2. Exposure Threshold Improvements
- [ ] 2.1 Update `exposureFractions()` in `src/tracer/qualityChecks.ts`: raise overexposed clip to 240, underexposed floor to 15, add `meanLuma` accumulation; return `{ overexposed: boolean; underexposed: boolean; dark: boolean }` instead of raw fractions
- [x] 2.2 Update `runQualityChecks()` in `src/tracer/qualityChecks.ts` to propagate `blurry`, `overexposed`, `underexposed`, `dark` boolean flags into the returned `QualityChecks`; wire through to `src/tracer/shutter.ts`
- [x] 2.3 Write unit tests for each threshold: near-blown (luma 241), crushed-shadow (luma 14), dim-room (mean < 50), normal range

## 3. IMU Displacement Estimator
- [x] 3.1 Create `src/sensors/imuMath.ts` and implement `rotateVec(v: Vec3, q: Quat): Vec3` pure helper
- [x] 3.2 Write unit tests for `rotateVec`: identity quaternion, 90° yaw/pitch/roll rotations
- [x] 3.3 Implement `estimateDisplacement(samples: ImuSample[]): number` in `src/sensors/imuMath.ts` using trapezoidal integration with gravity subtraction via `grx/gry/grz` and quaternion rotation via `qx/qy/qz/qw`; clamp result to 5 m maximum to guard against runaway values from misaligned gravity vectors (e.g. tilt > 45°)
- [x] 3.4 Write unit tests for `estimateDisplacement`: empty array → 0, single-element array → 0, out-of-order timestamps → uses per-sample dt capped at 50 ms, stationary (zero accel after gravity sub) → near 0, known constant acceleration → expected displacement
- [x] 3.5 Wire `estimateDisplacement` into `src/tracer/shutter.ts` — slice `imuTrace` between previous and current `capturedAtMonotonic` timestamps, call estimator, store result in `qualityChecks.displacementMeters`
- [ ] 3.6 Write integration test: `displacementMeters` is 0 for the first capture in a session
