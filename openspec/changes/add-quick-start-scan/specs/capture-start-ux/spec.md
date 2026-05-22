## ADDED Requirements

### Requirement: Home quick-start primary action
The system SHALL present **Start scanning** as the primary action on the home screen, before previous sessions or secondary setup actions.

#### Scenario: Fresh app open shows quick start
- **WHEN** the user opens the application at the home route
- **THEN** the system shows a button with role `button` and accessible name **Start scanning**
- **AND** the button appears in DOM order before the **Previous scans** heading and session rows
- **AND** previous sessions remain available below the primary action under **Previous scans** when any exist

#### Scenario: Named setup remains secondary
- **WHEN** the user wants to create a named or collaborative scan
- **THEN** the system provides a secondary button with accessible name **More options** to open the named/collaborative setup
- **AND** the secondary setup preserves scan naming, QR invite sharing, join-token entry, and **Continue to camera** behavior

### Requirement: Quick-start scan creation
The system SHALL let the user start solo capture without entering a scan name.

#### Scenario: Quick start creates and opens camera session
- **WHEN** the user clicks **Start scanning** from the home screen
- **THEN** the system creates a new scan and capture session without requiring `scanName`
- **AND** the scan identity is its UUID
- **AND** the system navigates to the camera session route after creation succeeds

#### Scenario: Generated label for unnamed scans
- **WHEN** an unnamed scan is shown in lists, export screens, or user-facing summaries
- **THEN** the system displays a timestamp label generated from the scan/session `startedAt` timestamp with the prefix **Scan**, for example **Scan May 21, 14:30**
- **AND** tests use an injected clock or formatter helper rather than depending on the host machine locale
- **AND** the system hides the UUID from default home, capture, and export-summary UI while preserving it in details, debug views, and export metadata

### Requirement: Quick-start pending and retry behavior
The system SHALL provide observable pending and failure states for quick-start creation and SHALL avoid duplicate create mutations.

#### Scenario: Creation pending
- **WHEN** the user clicks **Start scanning**
- **THEN** the system keeps the user on the home screen while creation is in progress
- **AND** the primary button changes to **Starting camera…**
- **AND** the primary button is disabled until creation succeeds or fails

#### Scenario: Creation failure
- **WHEN** quick-start scan creation fails before the camera route opens
- **THEN** the system stays on the home screen
- **AND** it shows **Couldn’t start scan. Check connection/storage and try again.**
- **AND** it restores an enabled **Start scanning** action

#### Scenario: Remote create succeeds but local persistence fails
- **WHEN** the scan API returns a successful create response but IndexedDB persistence fails before a session is stored
- **THEN** the system stays on the home screen
- **AND** it shows **Couldn’t start scan. Check connection/storage and try again.**
- **AND** retry may issue a new create-scan mutation because no local session exists to navigate to

#### Scenario: Retry after ambiguous failure
- **WHEN** the user retries after a quick-start failure
- **THEN** the mounted home view checks whether the prior attempt already produced an in-memory `CreateScanResult` with a `session.id` before issuing another create-scan mutation
- **AND** after remount, the system checks for a persisted IndexedDB session before issuing another create-scan mutation
- **AND** it does not create duplicate scans solely because the user retried after an interrupted success

### Requirement: Camera permission preparation
The system SHALL prepare the user for camera access before or during camera initialization from the quick-start flow.

#### Scenario: Camera permission is needed
- **WHEN** the quick-start scan/session has been created and `CaptureView` is about to request the first camera stream for that session
- **THEN** `CaptureView` shows **Allow camera access to photograph shelf spines.** before the camera stream request settles
- **AND** the browser permission request is triggered as part of the user-initiated start flow

#### Scenario: Camera permission denied
- **WHEN** the user denies camera permission or the camera is unavailable
- **THEN** `CaptureView` shows an error message explaining that camera access is required
- **AND** the Back control returns home to an enabled **Start scanning** action
- **AND** the home screen does not hide the previously created pending session from **Previous scans**

### Requirement: Capture return preserves export status
The system SHALL preserve previous-session visibility and export status when the user returns home from a capture session.

#### Scenario: Exported scan is visible on home after return
- **WHEN** the user completes bundle export for a capture session and returns home with the Back control
- **THEN** the system shows the session under **Previous scans** with status **Exported**

#### Scenario: Backed-out scan remains pending
- **WHEN** the user uses the Back control before export completes
- **THEN** the system navigates to the home screen
- **AND** it shows the session under **Previous scans** with status **Pending**
