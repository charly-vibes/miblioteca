## 1. Blur Scoring Fix
- [ ] 1.1 Rewrite `laplacianVariance()` in `src/tracer/imageProcessing.ts` to accumulate `sum` and `sumSq` without allocating `responses[]` array
- [ ] 1.2 Write unit tests confirming the fixed function produces identical results to the original for the same input

## 2. Exposure Threshold Improvements
- [ ] 2.1 Update `exposureFractions()` in `src/tracer/qualityChecks.ts`: raise overexposed clip to 240, underexposed floor to 15, add `meanLuma` accumulation
- [ ] 2.2 Update callers to propagate `dark: meanLuma < 50` flag into `QualityChecks`
- [ ] 2.3 Write unit tests for each threshold: near-blown (luma 241), crushed-shadow (luma 14), dim-room (mean < 50), normal range

## 3. IMU Displacement Estimator
- [ ] 3.1 Add `rotateVec(v: Vec3, q: Quat): Vec3` pure helper to `src/tracer/imuMath.ts`
- [ ] 3.2 Write unit tests for `rotateVec`: identity quaternion, 90° yaw/pitch/roll rotations
- [ ] 3.3 Implement `estimateDisplacement(samples: ImuSample[]): number` in `src/tracer/imuMath.ts` using trapezoidal integration with gravity subtraction via `grx/gry/grz` and quaternion rotation via `qx/qy/qz/qw`
- [ ] 3.4 Write unit tests for `estimateDisplacement`: empty array → 0, stationary (zero accel after gravity sub) → near 0, known constant acceleration → expected displacement
- [ ] 3.5 Wire `estimateDisplacement` into `src/tracer/shutter.ts` — slice `imuTrace` between previous and current capture timestamps, call estimator, store result in `qualityChecks.displacementMeters`
- [ ] 3.6 Write integration test: `displacementMeters` is 0 for first capture in a session
