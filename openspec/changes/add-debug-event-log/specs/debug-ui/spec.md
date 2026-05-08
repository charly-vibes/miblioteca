## ADDED Requirements

### Requirement: Debug Export Button Visibility
A floating "Export logs" button SHALL be rendered in the DOM only when `debugLogger.enabled`
is `true`. When debug mode is inactive the button MUST NOT be added to the DOM.

#### Scenario: debug mode inactive
- **GIVEN** `debugLogger.enabled` is `false`
- **WHEN** `CaptureView` is mounted
- **THEN** no element with accessible label "Export logs" is added to the DOM

#### Scenario: debug mode active
- **GIVEN** `debugLogger.enabled` is `true`
- **WHEN** `CaptureView` is mounted
- **THEN** a button with `aria-label="Export logs"` is present in the DOM

### Requirement: Log Download on Click
Clicking "Export logs" SHALL trigger a browser file download of the ring buffer
contents serialised as JSON, using `debugLogger.export()` as the file body.
The filename SHALL match `miblioteca-debug-<ISO-8601-timestamp>.json`.

#### Scenario: download on click
- **GIVEN** debug mode is active and the "Export logs" button is visible
- **WHEN** the user clicks "Export logs"
- **THEN** the browser initiates a file download with MIME type `application/json` and a filename matching the pattern `miblioteca-debug-<ISO-8601-timestamp>.json`

### Requirement: Non-Obstructing Button Placement
The "Export logs" button SHALL be styled as a fixed-position overlay positioned at the
bottom-right corner of the viewport with a `z-index` above all other UI elements, and
MUST NOT overlap the shutter button region in the default layout.

#### Scenario: button does not cover shutter
- **GIVEN** debug mode is active and `CaptureView` is mounted
- **WHEN** the UI renders in its default layout
- **THEN** the "Export logs" button is in the bottom-right quadrant and the shutter button (centred at the bottom) remains fully accessible
