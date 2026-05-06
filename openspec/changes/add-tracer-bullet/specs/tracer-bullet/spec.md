## ADDED Requirements
### Requirement: Single-device tracer-bullet flow
The system SHALL provide a first vertical slice that lets one user complete a single-device happy path by creating a scan via a development-served mock `POST /api/scan` handshake, entering capture mode, taking one photo, and continuing without production backend services.

#### Scenario: Start a fresh tracer-bullet session
- **WHEN** the user opens the tracer-bullet flow in a supported secure context
- **THEN** the system creates a fresh `Scan` and `CaptureSession` from a development-served mock `POST /api/scan` response
- **AND** the resulting `CaptureSession` includes `clockOffsetMs` derived from the mock `serverTimeMs`
- **AND** the user can proceed to capture without joining a multi-user session

#### Scenario: Reload resumes the latest incomplete tracer-bullet session
- **WHEN** the user reloads the tracer-bullet flow after a mock scan has already been created locally and the session is still incomplete
- **THEN** the system resumes the latest local `Scan` and `CaptureSession`
- **AND** it does not create duplicate scan or session records solely because of the reload

#### Scenario: Unsupported runtime blocks the slice
- **WHEN** the app is not running in a secure context or camera access is unavailable
- **THEN** the system prevents capture
- **AND** it shows an actionable message explaining the missing prerequisite

#### Scenario: Camera permission is denied
- **WHEN** the app is running in a supported secure context but the user denies camera permission
- **THEN** the system does not enter the capture-ready state
- **AND** it shows a recoverable message explaining how to grant permission and retry

### Requirement: Persist one valid capture record
The system SHALL turn the first successful shot in the tracer-bullet flow into a minimally valid `CaptureRecord` with `zupt: true` and associated image and thumbnail blobs stored in IndexedDB.

#### Scenario: Capture succeeds with available source
- **WHEN** the user takes a photo and the browser can provide an image through `ImageCapture.takePhoto()` or the canvas snapshot fallback
- **THEN** the system stores one `CaptureRecord` that includes required identity, timestamp, `zupt: true`, image, and `qualityChecks` fields
- **AND** it stores the full image blob and thumbnail blob under the corresponding IDB keys
- **AND** the record starts with `uploadState: "pending"`

#### Scenario: Capture fails before persistence
- **WHEN** image acquisition fails before a valid blob is produced
- **THEN** the system does not create a partial `CaptureRecord`
- **AND** it surfaces a recoverable error to the user

#### Scenario: Persistence fails after a partial write
- **WHEN** persistence fails after one or more blobs or records have already been written for the shot
- **THEN** the system removes orphaned partial writes before returning control to the user
- **AND** it does not leave a partially persisted `CaptureRecord` in IndexedDB

### Requirement: Exercise the upload boundary with a development adapter
The system SHALL submit the captured record through a direct development upload adapter that preserves the documented `POST /api/upload` request shape.

#### Scenario: Stub upload accepts the record
- **WHEN** a persisted tracer-bullet record is submitted to the development adapter
- **THEN** the adapter receives a multipart-equivalent payload containing `record`, `image`, and `thumbnail`
- **AND** the serialized `record` omits `blobRef`, `thumbnailBlobRef`, and `uploadState`
- **AND** the request includes `Idempotency-Key: <recordId>`
- **AND** the system records a successful acknowledgement without requiring a production server
- **AND** the record transitions from `uploadState: "pending"` to `uploadState: "uploaded"`

#### Scenario: Stub upload failure remains retryable
- **WHEN** the development adapter reports a transient failure
- **THEN** the system transitions the record from `uploadState: "pending"` to `uploadState: "failed"`
- **AND** the record remains eligible for a later retry
- **AND** the UI shows that the capture was saved locally even though upload did not complete

### Requirement: Explicitly defer advanced capture concerns
The tracer-bullet slice SHALL defer collaboration and advanced sensor behavior so the first implementation stays narrow and testable.

#### Scenario: User expects out-of-scope features
- **WHEN** the user enters the tracer-bullet flow
- **THEN** the flow does not require multi-user join, continuous IMU trace recording, upload queueing/background sync, or production background services
- **AND** those omissions are documented as follow-on work rather than silent gaps
