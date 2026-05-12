## ADDED Requirements

### Requirement: Ghost Overlay Canvas
The capture view SHALL display a semi-transparent `<canvas>` element absolutely positioned
over the live `<video>` element, showing a frozen copy of the most recent capture frame.
The canvas is managed by `GhostOverlayCanvas` (`src/sensors/ghostOverlayCanvas.ts`) which
already handles canvas creation, RAF loop, yaw integration, `setSnapshot()`, and `destroy()`.

#### Scenario: Overlay hidden before first capture
- **WHEN** the capture session has no captures yet
- **THEN** the ghost canvas is not visible (`canvas.hidden = true`)

#### Scenario: Overlay appears after first capture
- **WHEN** the user takes the first capture
- **THEN** the ghost canvas becomes visible (`canvas.hidden = false`) with the captured frame as its content

#### Scenario: Overlay updates on each subsequent capture
- **WHEN** the user takes a new capture
- **THEN** the ghost canvas is updated with the new frame and the yaw accumulator is reset to zero

#### Scenario: grabFrame returns null
- **WHEN** `grabFrame()` returns null during a capture (e.g. video track ended or canvas context lost)
- **THEN** `ghostOverlay.setSnapshot()` is NOT called, the previous ghost frame is retained,
  and the yaw accumulator is NOT reset

### Requirement: Gyro-Driven Horizontal Shift
The ghost canvas SHALL be shifted horizontally via CSS `transform: translate3d` driven by
accumulated gyro yaw since the most recent shutter event, following the formula
`shiftX = -(videoWidth/2) / tan(hFOV_rad/2) * yawIntegral`, with default hFOV of 40°
(empirically matched to a phone held at ~55° natural tilt: cos(55°)≈0.57 projection loss
makes the effective angular capture per pixel equivalent to ~40° FOV).
The shift SHALL be clamped to ±(videoWidth/2) pixels.

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
The ghost canvas SHALL be hidden (`canvas.hidden = true`) when the device angular velocity
exceeds the steadiness gate threshold (`|ω| > 0.5 rad/s` on any axis, derived from
`GyroLike.x/y/z` fields in `src/sensors/imuRecorder.ts`), to avoid visual noise while
the user repositions between shelves.

#### Scenario: Overlay hidden during rapid motion
- **WHEN** angular velocity on any axis exceeds 0.5 rad/s
- **THEN** the ghost canvas is not visible (`canvas.hidden = true`)

#### Scenario: Overlay shown when device is stationary with a prior capture
- **WHEN** angular velocity is ≤ 0.5 rad/s on all axes AND at least one capture exists
- **THEN** the ghost canvas is visible (`canvas.hidden = false`)
