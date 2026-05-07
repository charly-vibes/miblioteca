## ADDED Requirements

### Requirement: Inter-Shot Displacement Estimation
The system SHALL estimate the horizontal displacement (in meters) traveled between consecutive
captures by integrating linear acceleration from `imuTrace` samples between the two capture
timestamps, using quaternion rotation from device frame to world frame with gravity subtracted
using `GravitySensor` readings (`grx/gry/grz`). The result SHALL be stored in
`CaptureRecord.qualityChecks.displacementMeters` and capped at 5 m to guard against runaway
values from misaligned gravity vectors (e.g. severe device tilt).

#### Scenario: First capture in a session has zero displacement
- **WHEN** a capture is the first record in a session
- **THEN** `qualityChecks.displacementMeters` is `0`

#### Scenario: Stationary capture produces near-zero displacement
- **WHEN** the device does not move between two captures (only ZUPT-compliant stillness at both ends)
- **THEN** `qualityChecks.displacementMeters` is ≤ 0.02 m (within sensor noise floor;
  derived from 2 cm best-case accuracy per research 2026-05-07-dead-reckoning-shelf-position)

#### Scenario: Displacement stored for each subsequent capture
- **WHEN** a capture is taken after at least one prior capture
- **THEN** `qualityChecks.displacementMeters` contains the estimated meters traveled since the
  previous capture, derived from the `imuTrace` slice between the two `capturedAtMonotonic` timestamps

#### Scenario: No IMU samples between captures
- **WHEN** `imuTrace` has no samples in the window between two captures (e.g. sensor permission
  denied mid-session or captures taken faster than the IMU sampling rate)
- **THEN** `qualityChecks.displacementMeters` is `0`

#### Scenario: Non-monotonic IMU timestamps
- **WHEN** the `imuTrace` slice contains samples whose timestamps are not monotonically increasing
  (e.g. clock skew or OEM monotonic timer reset)
- **THEN** `estimateDisplacement` caps the time delta per sample to a maximum of 50 ms and
  returns a capped estimate rather than erroring

### Requirement: IMU Displacement Math Utilities
The system SHALL provide pure functions `rotateVec(v: Vec3, q: Quat): Vec3` and
`estimateDisplacement(samples: ImuSample[]): number` in `src/sensors/imuMath.ts` for
quaternion-based linear acceleration integration.

#### Scenario: Identity quaternion leaves vector unchanged
- **WHEN** `rotateVec` is called with a unit quaternion `{x:0, y:0, z:0, w:1}`
- **THEN** the returned vector equals the input vector

#### Scenario: Empty sample array returns zero displacement
- **WHEN** `estimateDisplacement` is called with an empty array or single-element array
- **THEN** it returns `0`
