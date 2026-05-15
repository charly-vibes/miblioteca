# Change: Add hybrid gyro + absolute orientation mode to ghost overlay

## Why
The ghost overlay currently forces operators to choose between `gyro` and `absolute` orientation models. Pure gyro responds quickly but drifts over longer sweeps; pure absolute resists drift but can feel noisy or laggy. A hybrid mode that consumes both sensors in the same pipeline should preserve fast motion response while correcting long-run drift.

## What Changes
- Add a third ghost orientation model: `hybrid`
- Update `GhostMotionPipeline` so hybrid mode consumes gyroscope samples and absolute orientation samples together for orientation tracking
- Define fallback behavior when one of the two sensor inputs is unavailable or temporarily stale
- Extend the tuning panel model selector and persisted tuning config to support the hybrid mode
- Add debug/logging expectations so calibration exports and live debugging can distinguish which orientation source drove the frame

## Impact
- Affected specs: `ghost-motion-pipeline`, `ghost-tuning-panel`
- Affected code: `src/sensors/GhostMotionPipeline.ts`, `src/ghost/tuningConfig.ts`, `src/ghost/TuningPanel.ts`, related tests
