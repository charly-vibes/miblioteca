## ADDED Requirements

### Requirement: AccelSample betaDeg and gravitySubtracted Fields
`SensorFrame` SHALL carry `betaDeg` (the DeviceOrientationEvent.beta at the time of
sampling) and the `AccelSample` type used by the motion pipeline SHALL carry a
`gravitySubtracted` flag that widens the tilt guard when the hardware has already
removed gravity from the signal.

#### Scenario: betaDeg appended to every SensorFrame during RECORDING
- **WHEN** a `devicemotion` event fires during RECORDING (DeviceMotion path)
- **THEN** the emitted `SensorFrame` includes `betaDeg` set to the most-recently-received
  `DeviceOrientationEvent.beta` value (may be `null` if no orientation event has fired yet)

#### Scenario: betaDeg appended via Gyroscope API path
- **WHEN** a Gyroscope `onreading` fires during RECORDING (Gyroscope API path)
- **THEN** the emitted `SensorFrame` includes `betaDeg` set to the class-level `betaDeg`
  field (updated by `deviceorientation` events independently of `devicemotion`)

#### Scenario: betaDeg is optional — absent on non-motion frames
- **WHEN** a `SensorFrame` is serialised in the export
- **THEN** `betaDeg` is present only on frames produced by the motion/gyro handler; the
  field MAY be `null` when no orientation event has fired before the first frame

#### Scenario: gravitySubtracted widens the accel tilt guard
- **WHEN** `AccelSample.gravitySubtracted` is `true`
- **THEN** `feedGhostAccel` uses a 45° tilt guard (`|betaDeg − 90| > 45`)
  instead of the default 30° guard, allowing integration at camera-typical tilt angles

#### Scenario: gravitySubtracted absent defaults to strict guard
- **WHEN** `AccelSample.gravitySubtracted` is `undefined` or `false`
- **THEN** `feedGhostAccel` applies the 30° tilt guard, rejecting samples when
  `|betaDeg − 90| > 30` to prevent gravity-leak contamination

#### Scenario: gate label 'tilt' on rejected samples
- **WHEN** `feedGhostAccel` rejects a sample due to the tilt guard
- **THEN** the returned `AccelFeedResult.gate` is `'tilt'` and velocity is zeroed
  (but position accumulators are retained)
