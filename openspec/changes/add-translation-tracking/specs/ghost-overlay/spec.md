## MODIFIED Requirements

### Requirement: Gyro-Driven Horizontal Shift
The ghost canvas SHALL be shifted in both axes via CSS `transform: translate3d`
driven by the **sum** of a rotation component and a translation component.
Both yaw and pitch are integrated from the same `DeviceOrientation` event
(`alpha` for yaw, `beta` for pitch); no additional sensor subscription is required
for the rotation component.

**Rotation component** (unchanged): accumulated gyro yaw/pitch since last shutter
```
rotShiftX = -(displayWidth/2) / tan(hFOV_rad/2) * yawIntegral
rotShiftY = -(displayHeight/2) / tan(vFOV_rad/2) * pitchIntegral
```

**Translation component** (new): double-integrated linear acceleration since last shutter
```
transShiftX = -(dx_m / workingDistance_m) * focalLengthX
transShiftY = -(dy_m / workingDistance_m) * focalLengthY
```

**Combined**:
```
totalShiftX = rotShiftX + transShiftX
totalShiftY = rotShiftY + transShiftY
```

Default working distance: **0.6 m**. Override via URL param `?distance=<cm>`.
Total shift SHALL be clamped to ±(displayWidth/2) and ±(displayHeight/2) respectively.

#### Scenario: Rightward device rotation shifts overlay left
- **WHEN** the device rotates rightward (positive yaw) by angle θ radians
- **THEN** the ghost canvas shifts left by `focalLengthX * θ` pixels (clamped)

#### Scenario: Lateral translation shifts overlay opposite to movement direction
- **WHEN** the device is physically moved rightward along a shelf by `d` metres
- **THEN** the ghost canvas shifts left by `(d / workingDistance_m) * focalLengthX` pixels

#### Scenario: Combined rotation and translation produce additive shift
- **WHEN** the device both pans right AND slides right simultaneously
- **THEN** `totalShiftX = rotShiftX + transShiftX` (both negative, overlay moves further left)

#### Scenario: No shift at zero yaw and zero displacement
- **WHEN** both accumulators are zero (device stationary or immediately after shutter)
- **THEN** ghost canvas `translateX` and `translateY` are both 0

#### Scenario: Accumulators reset on shutter
- **WHEN** a new capture is taken
- **THEN** yaw, pitch, velocity, and displacement accumulators are all set to zero

#### Scenario: Combined shift clamped at display boundary
- **WHEN** `totalShiftX` exceeds +(displayWidth/2) pixels (e.g. large translation rightward)
- **THEN** the applied `translateX` is clamped to +(displayWidth/2) and does not move the overlay off-screen

### Requirement: Overlay Visibility During Motion
The ghost canvas SHALL be hidden (`canvas.hidden = true`) when the device angular velocity
exceeds the hide threshold (`|ω| > 0.55 rad/s` on any axis) and SHALL remain hidden until
angular velocity drops below the show threshold (`|ω| ≤ 0.40 rad/s` on all axes).
This two-threshold hysteresis prevents rapid show/hide flickering during
slow movement between shots.

#### Scenario: Overlay hidden when angular velocity exceeds hide threshold
- **WHEN** angular velocity on any axis rises above 0.55 rad/s
- **THEN** the ghost canvas is hidden (`canvas.hidden = true`)

#### Scenario: Overlay not shown until below show threshold
- **WHEN** angular velocity was above 0.55 rad/s and then drops to between 0.40 and 0.55 rad/s
- **THEN** the ghost canvas remains hidden

#### Scenario: Overlay shown when angular velocity drops below show threshold
- **WHEN** angular velocity drops to ≤ 0.40 rad/s on all axes AND at least one capture exists
- **THEN** the ghost canvas becomes visible (`canvas.hidden = false`)

## ADDED Requirements

### Requirement: ZUPT Drift Correction
The translation velocity accumulators (`velX`, `velY`) SHALL be clamped to zero whenever
the steadiness gate closes (device angular velocity exceeds hide threshold on any axis).
This limits displacement drift to within each inter-shot interval.

#### Scenario: Velocity clamped when gate closes
- **WHEN** `|ω|` rises above the hide threshold (0.55 rad/s)
- **THEN** `velX` and `velY` are set to 0

#### Scenario: Integration resumes after gate reopens
- **WHEN** `|ω|` drops below the show threshold (0.40 rad/s)
- **THEN** linear acceleration integration resumes from `velX = velY = 0`

#### Scenario: Displacement not reset on gate close (only velocity)
- **WHEN** the gate closes
- **THEN** `dx_m` and `dy_m` retain their current values; only velocity is zeroed

### Requirement: Working Distance Configuration
The system SHALL read a `distance` URL parameter (in centimetres) and use it as the
working distance for the translation shift formula. If absent, the default is **60 cm**.
The value SHALL be clamped to the range [20, 150] cm before use.

#### Scenario: URL param sets working distance
- **WHEN** the URL contains `?distance=80`
- **THEN** `workingDistanceCm` is set to 80 and the translation shift is scaled accordingly

#### Scenario: URL param clamped at minimum
- **WHEN** the URL contains `?distance=10` (below minimum)
- **THEN** `workingDistanceCm` is clamped to 20

#### Scenario: URL param clamped at maximum
- **WHEN** the URL contains `?distance=200` (above maximum)
- **THEN** `workingDistanceCm` is clamped to 150

#### Scenario: Missing URL param uses default
- **WHEN** no `distance` param is present in the URL
- **THEN** `workingDistanceCm` is 60

#### Scenario: Non-numeric URL param uses default
- **WHEN** the URL contains `?distance=abc` or any non-numeric value
- **THEN** `workingDistanceCm` falls back to 60

### Requirement: Translation Debug Events
The `ghost:shift` and `ghost:at-shutter` debug log events SHALL include translation
state fields alongside the existing rotation fields.

#### Scenario: ghost:shift includes translation state
- **WHEN** a `ghost:shift` event fires (every 500 ms while overlay is visible)
- **THEN** the event payload includes `dx_cm`, `dy_cm`, `velX`, `velY` numeric fields

#### Scenario: ghost:at-shutter includes translation state
- **WHEN** a capture is taken and the `capture:shutter` debug event fires
- **THEN** the nested `ghost` object includes `dx_cm`, `dy_cm`, `velX`, `velY` and
  `workingDistanceCm` fields
