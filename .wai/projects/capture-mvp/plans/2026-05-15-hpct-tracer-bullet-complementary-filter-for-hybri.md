---
tags: [pipeline-run:tdd-ro5-2026-05-15-hpct-hybrid-filter, pipeline-step:plan]
---

hpct: tracer-bullet complementary filter for hybrid mode.

Scope (minimal):
- In onGyroReading: treat 'hybrid' identically to 'gyro' (run feedGhostGyro to integrate yaw_gyro/pitch_gyro into state.yawIntegral/state.pitchIntegral).
- In rafLoop, when model === 'hybrid':
    1. Pull absolute orientation via deps.getOrientation()
    2. Initialize orientationState (qRef) on first reading (re-use initialOrientationState)
    3. Compute raw absolute yaw/pitch from quaternion delta (factor out from computeOrientationDelta or inline)
    4. α = stillness gate selection (stillGain when stillness > STILLNESS_GATE_THRESHOLD else movingGain), reusing existing stillness EMA
    5. yaw_out = state.yawIntegral + α * shortestAngle(absYaw - state.yawIntegral)
    6. pitch_out = state.pitchIntegral + α * shortestAngle(absPitch - state.pitchIntegral)
    7. Store back to state.yawIntegral / state.pitchIntegral
- If getOrientation() returns null: skip correction this frame (gyro continues integrating). Out of strict scope per ticket (no freshness gate), but pragmatic to avoid crashes.

NOT in scope (deferred to siblings):
- 5okt: 300ms freshness gate
- jtbh: per-frame clamp at maxShiftRateRadS * dt
- pkxx: mode-switch seeding from absolute
- ikv9: orientationSource debug field
- zwl5: cold-start handling
- g02q: omegaMag sourcing nuances

Test strategy (vitest):
- TEST: 'hybrid mode blends gyro toward absolute orientation target'
  - tuning.orientationModel = 'hybrid'
  - absolute orientation constant at alpha=180,beta=90,gamma=0
  - gyro fires (0, 0.5, 0, 1000) then (0, 0.5, 0, 1100)
  - Pure gyro would produce yaw=-0.05; absolute target produces yaw=0
  - Assertion: -0.05 < frame.yawRad < 0 (pulled toward 0 but not all the way)

Helper needed:
- shortestAngle(delta: number): number — wraps to (-π, π]. Will live in ghostOverlay.ts as a small pure utility.

Affected tests (must keep green):
- All existing GhostMotionPipeline.test.ts gyro + absolute tests (modes are still independent)
- tuningConfig.test.ts (no change)

Acceptance:
- New test fails before the hybrid branch is added
- After: 833+1 tests green
- No tsc errors

Implementation file: src/sensors/GhostMotionPipeline.ts (+ shortestAngle helper in ghostOverlay.ts)
