## ADDED Requirements

### Requirement: Yaw Integral Persistence Across Motion Gate Close
When `enableMotionGate` is `true`, closing the motion gate SHALL NOT reset the yaw or
pitch integrals; the pipeline continues accumulating rotation so that when the gate
reopens the ghost appears at the correct position relative to the last snapshot, not
relative to the gate-close moment.  Velocity accumulators (`velX`, `velY`) SHALL be
hard-zeroed on gate close as a secondary ZUPT to prevent phantom translation drift.

#### Scenario: Yaw and pitch integrals survive gate close
- **WHEN** the motion gate transitions from open to closed (omegaMag falls below
  `MOTION_GATE_HIDE_RAD_S`)
- **THEN** `state.yawIntegral` and `state.pitchIntegral` are unchanged; the pipeline
  continues integrating subsequent gyro events into those same accumulators

#### Scenario: Velocity is zeroed on gate close
- **WHEN** the motion gate transitions from open to closed
- **THEN** `zeroVelocity` is called on the current state, setting `velX = 0` and
  `velY = 0`; position accumulators `dx_m` and `dy_m` are not modified

#### Scenario: onFrame emits gateOpen:false with zeroed shift on gate close
- **WHEN** the gate is closed and the RAF loop fires
- **THEN** `onFrame` is called exactly once (at the moment of closing) with
  `{ yawRad: 0, pitchRad: 0, shiftPx: 0, pitchShiftPx: 0, gateOpen: false }`;
  subsequent RAF ticks while the gate remains closed do not call `onFrame`

#### Scenario: Ghost canvas hides on gate close, shows on gate open
- **WHEN** `GhostOverlayCanvas.onPipelineFrame` receives a frame with `gateOpen: false`
- **THEN** the canvas is hidden (`canvas.hidden = true`); `lastYawRad` and
  `lastPitchRad` are NOT updated so `getDebugState()` continues to reflect the last
  valid accumulated yaw/pitch

#### Scenario: Ghost repositions correctly when gate reopens
- **WHEN** the motion gate transitions from closed to open (omegaMag exceeds
  `MOTION_GATE_SHOW_RAD_S`)
- **THEN** the next `onFrame` carries the accumulated `yawRad` / `pitchRad` built up
  since the last snapshot reset, and `shiftPx` reflects that full integral rather than
  a fresh zero

#### Scenario: Calibration page uses enableMotionGate:false — gate logic inactive
- **WHEN** `GhostCalibrationPage` constructs its `GhostMotionPipeline`
- **THEN** `enableMotionGate` is `false`, meaning the motion gate is never applied and
  `onFrame` fires every RAF tick regardless of `omegaMag`; yaw and pitch accumulate
  continuously for the duration of RECORDING
