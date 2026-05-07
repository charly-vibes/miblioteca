# Change: Add capture quality metrics and IMU displacement estimation

## Why
The app already computes blur and exposure scores, but `laplacianVariance()` in
`imageProcessing.ts` allocates ~600 KB per call causing GC jank on Android, and the
exposure thresholds miss near-blown highlights and dim rooms. IMU displacement between
captures is not computed anywhere, despite all required sensor fields (`grx/gry/grz`,
`qx/qy/qz/qw`) already being recorded in `imuTrace`.

## What Changes
- Rewrite `laplacianVariance()` to accumulate in-place (zero-allocation, ~600 KB GC eliminated)
- Tighten exposure thresholds: overexposed clip 250 → 240, underexposed floor 5 → 15,
  add global-darkness flag when mean luma < 50
- Add `estimateDisplacement(samples: ImuSample[]): number` (~60 lines) using quaternion-rotated
  linear acceleration integration with ZUPT reset per capture
- Populate `qualityChecks.displacementMeters` with the estimated displacement since previous capture

## Impact
- Affected specs: `image-quality` (new), `imu-displacement` (new)
- Affected code: `src/tracer/imageProcessing.ts`, `src/tracer/qualityChecks.ts`,
  `src/tracer/imuRecorder.ts`, `src/tracer/shutter.ts`
