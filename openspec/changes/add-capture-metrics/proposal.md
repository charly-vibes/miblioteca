# Change: Add capture quality metrics and IMU displacement estimation

## Why
The app already computes blur and exposure scores, but `laplacianVariance()` in
`imageProcessing.ts` allocates ~600 KB per call causing GC jank on Android, and the
exposure thresholds miss near-blown highlights and dim rooms. IMU displacement between
captures is not computed anywhere, despite all required sensor fields (`grx/gry/grz`,
`qx/qy/qz/qw`) already being recorded in `imuTrace`. The `QualityChecks` type also lacks
boolean summary flags used in downstream quality reporting.

## What Changes
- Add `blurry: boolean`, `overexposed: boolean`, `underexposed: boolean`, `dark: boolean`
  to `QualityChecks` in `CaptureRecord` and `CaptureRecordInput` (`src/tracer/capture.ts`)
- Rename `stepCountSincePrev` → `displacementMeters` in `CaptureRecord.qualityChecks`
  and `CaptureRecordInput`; sweep all callsites (field was never populated with meaningful data)
- Rewrite `laplacianVariance()` to accumulate in-place (zero-allocation, ~600 KB GC eliminated)
- Tighten exposure thresholds: overexposed clip 250 → 240, underexposed floor 5 → 15,
  add global-darkness flag when mean luma < 50; propagate boolean flags through
  `exposureFractions()` → `runQualityChecks()` → `src/tracer/shutter.ts`
- Create `src/sensors/imuMath.ts` with `rotateVec(v: Vec3, q: Quat): Vec3` and
  `estimateDisplacement(samples: ImuSample[]): number` using quaternion-rotated linear
  acceleration integration with gravity subtraction
- Wire `estimateDisplacement` into `src/tracer/shutter.ts` — slice `imuTrace` between
  previous and current capture timestamps, store result in `qualityChecks.displacementMeters`

## Impact
- Affected specs: `image-quality` (new), `imu-displacement` (new)
- Affected code: `src/tracer/capture.ts`, `src/tracer/imageProcessing.ts`,
  `src/tracer/qualityChecks.ts`, `src/tracer/shutter.ts`, `src/sensors/imuRecorder.ts`
  (new: `src/sensors/imuMath.ts`)
