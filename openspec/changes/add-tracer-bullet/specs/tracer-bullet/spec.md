## ADDED Requirements
### Requirement: Single-device tracer-bullet flow
The system SHALL provide a first vertical slice that lets one user create a local scan context, enter capture mode, take one photo, and complete the local happy path without depending on production backend services.

#### Scenario: Start a local tracer-bullet session
- **WHEN** the user opens the tracer-bullet flow in a supported secure context
- **THEN** the system creates or resumes a local `Scan` and `CaptureSession`
- **AND** the user can proceed to capture without joining a multi-user session

#### Scenario: Unsupported runtime blocks the slice
- **WHEN** the app is not running in a secure context or camera access is unavailable
- **THEN** the system prevents capture
- **AND** it shows an actionable message explaining the missing prerequisite

### Requirement: Persist one valid capture record
The system SHALL turn the first successful shot in the tracer-bullet flow into a minimally valid `CaptureRecord` with associated image and thumbnail blobs stored in IndexedDB.

#### Scenario: Capture succeeds with available source
- **WHEN** the user takes a photo and the browser can provide an image through `ImageCapture.takePhoto()` or the canvas snapshot fallback
- **THEN** the system stores one `CaptureRecord` that includes required identity, timestamp, image, and `qualityChecks` fields
- **AND** it stores the full image blob and thumbnail blob under the corresponding IDB keys
- **AND** the record starts with `uploadState: "pending"`

#### Scenario: Capture fails before persistence
- **WHEN** image acquisition fails before a valid blob is produced
- **THEN** the system does not create a partial `CaptureRecord`
- **AND** it surfaces a recoverable error to the user

### Requirement: Exercise the upload boundary with a development adapter
The system SHALL construct the documented upload payload for the captured record and hand it to a development-safe adapter that simulates backend acknowledgement.

#### Scenario: Stub upload accepts the record
- **WHEN** a persisted tracer-bullet record is submitted to the development adapter
- **THEN** the adapter receives the same logical payload shape required by `POST /api/upload`
- **AND** the system records a successful acknowledgement without requiring a production server

#### Scenario: Stub upload failure remains retryable
- **WHEN** the development adapter reports a transient failure
- **THEN** the system keeps the record in a retryable local state
- **AND** the UI shows that the capture was saved locally even though upload did not complete

### Requirement: Explicitly defer advanced capture concerns
The tracer-bullet slice SHALL defer collaboration and advanced sensor behavior so the first implementation stays narrow and testable.

#### Scenario: User expects out-of-scope features
- **WHEN** the user enters the tracer-bullet flow
- **THEN** the flow does not require multi-user join, continuous IMU trace recording, or production background sync
- **AND** those omissions are documented as follow-on work rather than silent gaps
