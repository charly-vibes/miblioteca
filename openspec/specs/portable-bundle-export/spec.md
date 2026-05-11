# portable-bundle-export Specification

## Purpose
TBD - created by archiving change add-portable-bundle-export. Update Purpose after archive.
## Requirements
### Requirement: Portable scan bundle as MVP delivery artifact
The system SHALL support exporting a saved scan session as a self-contained portable bundle without requiring a real backend, mock backend, account, or network connection for bundle generation.

#### Scenario: Export one saved session
- **WHEN** the user has a saved scan session with at least one persisted `CaptureRecord`, image blob, and thumbnail blob
- **THEN** the system can produce one `.mbibundle.zip` file containing a manifest, scan metadata, session metadata, record sidecars, images, and thumbnails
- **AND** the exported bundle contains enough information for downstream processing without reading from IndexedDB or contacting a backend

#### Scenario: Export while offline
- **WHEN** the browser is offline and the required artifacts are present in local storage
- **THEN** the system can still create the portable bundle
- **AND** it does not block bundle generation on upload queue state, server health, authentication, or network availability
- **AND** any later transfer through Drive, WhatsApp, email, or another channel may still depend on that channel's connectivity requirements

### Requirement: Bundle manifest and deterministic layout
The system SHALL include a machine-readable `manifest.json` that identifies the bundle format and enumerates every artifact in deterministic paths.

#### Scenario: Manifest describes bundle contents
- **WHEN** a bundle export succeeds
- **THEN** `manifest.json` includes the bundle format version, app version, scan ID, session IDs, export timestamp, artifact counts, total byte count, and per-file entries
- **AND** each file entry includes its relative path, media type or logical type, size in bytes, and `sha256` checksum

#### Scenario: Bundle filename is user-recognizable
- **WHEN** the system names a generated bundle file
- **THEN** the filename includes a filesystem-safe scan name or fallback label, export date, short scan identifier, and `.mbibundle.zip` extension
- **AND** the filename avoids raw UUID-only naming unless no scan label is available

#### Scenario: Optional artifacts are included when present
- **WHEN** the scan session includes a motion trace or preview frames
- **THEN** the manifest includes those files under deterministic trace and preview paths
- **AND** the bundle remains valid when those optional artifacts are absent

### Requirement: Export status separate from upload status
The system SHALL track bundle export status independently from server upload state.

#### Scenario: Bundle export succeeds without server upload
- **WHEN** a valid bundle is generated for a session whose records have `uploadState: "pending"`
- **THEN** the system records bundle export status as exported with filename, timestamp, size, and bundle checksum
- **AND** it does not change any record to `uploadState: "uploaded"` solely because the bundle was exported

#### Scenario: Bundle export fails
- **WHEN** bundle generation fails before a valid archive is produced
- **THEN** the system records export status as failed or aborted with a recoverable error
- **AND** source records, image blobs, thumbnails, traces, and preview artifacts remain available for retry

### Requirement: Export validation before sharing
The system SHALL validate bundle completeness before presenting the file as shareable.

#### Scenario: Required blob is missing
- **WHEN** a `CaptureRecord` references an image or thumbnail blob that cannot be read from local storage
- **THEN** the export fails before producing a shareable bundle
- **AND** the user sees a recoverable error identifying that local artifacts are incomplete

#### Scenario: Generated archive fails validation
- **WHEN** archive generation completes but the generated archive has missing files, unexpected byte counts, or checksum mismatches against the manifest
- **THEN** the system does not mark export status as exported
- **AND** it does not present the bundle as shareable
- **AND** it preserves source artifacts so the user can retry export

#### Scenario: Storage is insufficient for archive creation
- **WHEN** available browser storage is less than the estimated archive size plus a 20% safety margin
- **THEN** the system blocks export before archive generation starts
- **AND** it does not delete source IndexedDB artifacts
- **AND** it explains that the user must free space or export a smaller scan

#### Scenario: Export is aborted
- **WHEN** the user cancels export, closes the share sheet, backgrounds the app during export, or the browser aborts archive generation
- **THEN** the system records export status as aborted or failed without marking the bundle exported
- **AND** it keeps source artifacts intact and allows the user to retry

### Requirement: User-initiated share and download
The system SHALL let the user explicitly download or share the bundle through browser-supported file transfer mechanisms.

#### Scenario: Browser supports file sharing
- **WHEN** the user taps a share action and the browser supports sharing the generated bundle file
- **THEN** the system invokes the native share sheet from that user gesture
- **AND** it shares the bundle as a document/file rather than as gallery media

#### Scenario: Browser does not support file sharing
- **WHEN** the browser cannot share files through the Web Share API
- **THEN** the system provides a download fallback for the generated `.mbibundle.zip`
- **AND** it tells the user to transfer the downloaded bundle through Drive, USB, email when size permits, or another document-preserving channel

#### Scenario: Bundle may exceed common channel limits
- **WHEN** the estimated or generated bundle size exceeds 100 MB
- **THEN** the system warns the user that some channels, especially email, may fail or be slow
- **AND** when the bundle exceeds 500 MB, it recommends a document-preserving transfer path such as Drive or USB instead of email or chat apps

### Requirement: Backend remains optional post-MVP ingest
The system SHALL treat backend upload as an optional future delivery adapter that consumes the same portable bundle contract, not as a prerequisite for MVP capture success.

#### Scenario: Capture MVP completes without backend
- **WHEN** the user captures, persists, exports, and transfers a valid bundle
- **THEN** the MVP flow is considered successful even if no backend API exists
- **AND** no record is required to transition to `uploadState: "uploaded"` for the bundle export to be valid

#### Scenario: Future backend ingest is added
- **WHEN** a backend ingest feature is implemented after the MVP
- **THEN** it accepts either the portable bundle or artifacts derived from the portable bundle contract
- **AND** capture-side metadata semantics remain compatible with manually exported bundles

### Requirement: Explicit deferral of live collaboration semantics
The bundle-first MVP SHALL defer server-mediated collaboration semantics that require shared backend state.

#### Scenario: Multiple devices capture the same library
- **WHEN** multiple devices independently export bundles for the same physical library
- **THEN** the MVP treats those bundles as separate portable artifacts for later manual or backend-assisted merge
- **AND** it does not require server-issued join tokens, server clock anchoring, or live participant tracking to complete capture

