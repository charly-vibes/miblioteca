## ADDED Requirements

### Requirement: Working Distance Configuration
The ghost overlay SHALL accept a configurable working distance (phone-to-shelf distance
in cm) that scales the translation component of the ghost shift. The value SHALL be
persisted in `localStorage` under key `miblioteca.workingDistanceCm` and default to 60
when no stored value or URL param is present.

#### Scenario: URL param overrides stored value
- **WHEN** the capture app URL contains `?distance=<cm>` (integer 20–150)
- **THEN** the working distance is set to that value for the session, overriding
  any stored preference

#### Scenario: Slider updates working distance live
- **WHEN** the user adjusts the working distance slider in the settings panel
- **THEN** the ghost overlay working distance updates immediately (no page reload)
  and the new value is persisted to `localStorage`

#### Scenario: Out-of-range URL param is rejected
- **WHEN** `?distance=<x>` where x < 20 or x > 150
- **THEN** the value is clamped to the nearest bound (20 or 150) and a console warning
  is emitted

### Requirement: Tilt Sanity Warning
The capture view SHALL display a brief overlay warning when `DeviceOrientation.beta`
deviates more than 30° from 90° (phone is not approximately perpendicular to the shelf),
because the horizontal-translation model assumes an upright-held phone.

#### Scenario: Warning shown when phone is not upright
- **WHEN** `|beta - 90|` exceeds 30° for more than 1 second
- **THEN** a non-blocking overlay message "Hold phone upright for best alignment"
  is displayed over the viewfinder

#### Scenario: Warning clears when phone returns to upright range
- **WHEN** `|beta - 90|` drops below 30°
- **THEN** the warning is dismissed automatically

#### Scenario: Warning not shown before first capture
- **WHEN** no captures exist in the session yet
- **THEN** the tilt warning is suppressed (overlay not active; tilt is irrelevant)

### Requirement: Working Distance in Debug Log
The `ghost:at-shutter` event payload SHALL include `workingDistanceCm` so that exported
debug sessions carry the distance configuration that was active during capture.

#### Scenario: workingDistanceCm present in ghost:at-shutter
- **WHEN** a capture is taken
- **THEN** the `ghost` object in `capture:shutter` debug event includes
  `workingDistanceCm` as a number (integer, cm)
