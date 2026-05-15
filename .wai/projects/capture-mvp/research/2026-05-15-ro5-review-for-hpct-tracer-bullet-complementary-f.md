---
tags: [pipeline-run:tdd-ro5-2026-05-15-hpct-hybrid-filter, pipeline-step:review]
---

RO5 review for hpct (tracer-bullet complementary filter)

Diff scope:
- src/sensors/ghostOverlay.ts: +shortestAngle(delta), +rawOrientationYawPitch(qRef, alpha, beta, gamma) — pure helpers
- src/sensors/GhostMotionPipeline.ts: imports new helpers/constants; onGyroReading now integrates on gyro AND hybrid; rafLoop new else-if branch reads orientation, lazily seeds qRef, applies complementary filter yaw_out = yaw_gyro + α * shortestAngle(yaw_abs - yaw_gyro), stillness gating from gyro omegaMag
- src/sensors/GhostMotionPipeline.test.ts: +1 hybrid blending test

Pass 1 Accuracy: shortestAngle math verified for boundaries (-π/+π flip, 2π wrap, small deltas). rawOrientationYawPitch is a faithful extraction of the quat-delta math from computeOrientationDelta. Hybrid integration: gyro integrates on every gyro tick (state.yawIntegral grows); rafLoop pulls toward absolute target at 60 Hz with α stillness gating. First-frame behavior is benign (correction = α*0 on entry).

Pass 2 Completeness: Only 1 hybrid test (yaw blending). Missing — pitch blending test (mirror of yaw), direct unit tests for shortestAngle wrap behavior, null-orientation skip test. shortestAngle wrap is non-obvious enough that a unit test deserves to land near the helper. rawOrientationYawPitch is covered transitively via the hybrid integration test but a focused unit would help future tickets.

Pass 3 Clarity: ~20-line inline hybrid block in rafLoop is dense but readable. Terse constant names (st/ema/sg/mg/sgt) match the convention from computeOrientationDelta. No comment links the block to design.md formula.

Pass 4 Actionability:
- MEDIUM [test-pitch]: add a hybrid pitch-blending test to mirror the yaw test. Quick (10 lines).
- LOW [test-shortestAngle]: add direct unit tests for shortestAngle (boundary wrap is non-obvious).
- LOW [doc-link]: add a 2-line comment pointing to design.md formula.
- LOW [extract-helper]: defer applyHybridCorrection() extraction until 5okt/jtbh add more state/knobs.

Pass 5 Integration: helpers colocated with existing quat math; rafLoop branch parallels 'absolute' branch; orientationState reused for stillness EMA + qRef.

Score: 0 critical / 0 high / 1 medium / 3 low. Fix step: apply MEDIUM + 2 quick LOWs (shortestAngle unit test, doc comment). Defer helper extraction.
