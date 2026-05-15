---
tags: [pipeline-run:tdd-ro5-2026-05-15-jtbh-correction-clamp, pipeline-step:plan]
---

jtbh: clamp the hybrid complementary-filter correction to ±maxShiftRateRadS * dt per axis.

Goal: a sudden absolute jump (e.g. browser fusion reset) is smoothed across multiple RAF frames instead of snapping yaw/pitch in one tick.

Behavior:
- After computing yaw_new = state.yawIntegral + α * shortestAngle(yawAbs - state.yawIntegral) in the hybrid branch, clamp the *correction* term (i.e. yaw_new - state.yawIntegral) to ±msr*dt, where msr = tuning.maxShiftRateRadS and dt = (now - orientationState.lastT) / 1000 with the same clamp (0, 0.1) used by computeOrientationDelta.
- Same for pitch.
- The clamp applies ONLY to the absolute-correction term, NOT to the gyro integration (gyro path is unaffected).

Test strategy:
- Tuning: hybrid; tuning.maxShiftRateRadS at the default (0.4 rad/s); ema set so we land in the moving-gain branch (gyro moving).
- Drive an absolute jump: orientation suddenly returns alpha jumped by, say, 30° while gyro yaw stays small.
- Assert: a single frame's correction is bounded by msr * dt; not the full alpha gain * 30° step.

Implementation: small inline clamp using Math.max/min. No new state field.

Affected file: src/sensors/GhostMotionPipeline.ts.
