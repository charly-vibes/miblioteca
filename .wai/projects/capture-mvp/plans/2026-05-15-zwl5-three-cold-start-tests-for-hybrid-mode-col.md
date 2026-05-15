---
tags: [pipeline-run:tdd-ro5-2026-05-15-zwl5-first-frame, pipeline-step:plan]
---

zwl5: three cold-start tests for hybrid mode.

Cold-start scenarios:
1. absolute fresh + no gyro samples yet → emit absolute yaw/pitch directly (no integration). Current code: rafLoop only runs when gyro is present OR motion-gate is open. With gyro=null, the early return (line 159) skips rafLoop entirely. To support this: rafLoop must run hybrid branch even when no gyro reading has arrived.
2. gyro fresh + no absolute yet → behave as 'gyro' (integrate normally). Currently: 'hybrid' branch only emits via the absolute correction; if getOrientation returns null, the if(ori) gates correction. State.yawIntegral is updated by onGyroReading, so the rafLoop should still emit a frame.
3. neither → no-op. The motion gate early-return at line 159 (no gyro + gate not open) suppresses emission. Could keep this; verify no NaN.

Test strategy:
- 3 tests, each constructs the pipeline, fires ONE source of data, asserts the first onFrame's yawRad/pitchRad are finite and match expectations.

Implementation likely needed:
- For scenario 1 (absolute-only): may need to remove the gyro-null early-return when model is hybrid, OR move the absolute-only path higher in rafLoop.

Affected files: src/sensors/GhostMotionPipeline.ts + GhostMotionPipeline.test.ts.
