## ADDED Requirements

### Requirement: Ghost Overlay Canvas
The capture view SHALL display a semi-transparent `<canvas>` element absolutely positioned
over the live `<video>` element, showing a frozen copy of the most recent capture frame.

#### Scenario: Overlay hidden before first capture
- **WHEN** the capture session has no captures yet
- **THEN** the ghost canvas is not visible

#### Scenario: Overlay appears after first capture
- **WHEN** the user takes the first capture
- **THEN** the ghost canvas becomes visible with the captured frame as its content

#### Scenario: Overlay updates on each subsequent capture
- **WHEN** the user takes a new capture
- **THEN** the ghost canvas is updated with the new frame and the yaw accumulator is reset to zero

### Requirement: Gyro-Driven Horizontal Shift
The ghost canvas SHALL be shifted horizontally via CSS `transform: translate3d` driven by
accumulated gyro yaw since the most recent shutter event, following the formula
`shiftX = -(videoWidth/2) / tan(hFOV_rad/2) * yawIntegral`, with default hFOV of 65°.
The shift SHALL be clamped to ±videoWidth/2 pixels.

#### Scenario: Rightward device rotation shifts overlay left
- **WHEN** the device rotates rightward (positive yaw) by angle θ radians
- **THEN** the ghost canvas shifts left by `(videoWidth/2) / tan(hFOV_rad/2) * θ` pixels (clamped)

#### Scenario: No shift at zero yaw accumulation
- **WHEN** yaw accumulator is zero (device stationary or immediately after shutter)
- **THEN** ghost canvas `translateX` is 0

#### Scenario: Yaw accumulator resets on shutter
- **WHEN** a new capture is taken
- **THEN** the yaw accumulator is set to zero

### Requirement: Overlay Visibility During Motion
The ghost canvas SHALL be hidden when the device angular velocity exceeds the steadiness
gate threshold (`|ω| > 0.5 rad/s` on any axis), to avoid visual noise while the user
repositions between shelves.

#### Scenario: Overlay hidden during rapid motion
- **WHEN** angular velocity exceeds 0.5 rad/s on any axis
- **THEN** the ghost canvas is not visible (opacity 0 or display none)

#### Scenario: Overlay shown when device is stationary with a prior capture
- **WHEN** angular velocity is ≤ 0.5 rad/s on all axes AND at least one capture exists
- **THEN** the ghost canvas is visible
