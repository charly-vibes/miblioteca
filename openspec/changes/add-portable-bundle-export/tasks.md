## 1. Proposal Alignment
- [x] 1.1 Review and approve the bundle-first MVP decision with stakeholders
- [x] 1.2 Revise or supersede `add-tracer-bullet` so the first vertical slice exports a one-record bundle instead of requiring mock upload success
- [ ] 1.3 Update baseline backend/API notes to mark per-record upload as post-MVP optional ingest, not an MVP prerequisite
- [ ] 1.4 Decide before backend work whether future ingest accepts whole `.mbibundle.zip` files, unpacked artifacts, or both

## 2. Bundle Contract
- [x] 2.1 Define TypeScript types for `BundleManifest`, file entries, `sha256` checksums, validation warnings, export status, and transfer guidance
- [x] 2.2 Add bundle export/session delivery state separate from `CaptureRecord.uploadState`
- [x] 2.3 Implement deterministic bundle filename and path generation for scans, sessions, records, images, thumbnails, traces, and preview frames
- [x] 2.4 Add tests that verify a persisted one-record session maps to the expected bundle manifest and file paths

## 3. Tracer Acceptance Slice
- [ ] 3.1 Produce a one-record `.mbibundle.zip` from Android Chrome using the existing local capture/persistence path
- [ ] 3.2 Manually inspect the one-record bundle contents on another device or desktop
- [ ] 3.3 Verify the one-record manifest counts, byte totals, and `sha256` checksums match the files in the archive

## 4. Export Implementation
- [x] 4.1 Select and document the browser archive generation approach
- [x] 4.2 Implement bundle assembly from IndexedDB without deleting source artifacts
- [x] 4.3 Validate every manifest entry has a corresponding file payload before export succeeds
- [x] 4.4 Add generated-archive validation for file counts, byte totals, and checksums before marking export successful
- [x] 4.5 Add checksum generation and total-size accounting
- [x] 4.6 Add failure handling for quota, missing blobs, aborted export, corrupted generated archive, and unsupported sharing APIs

## 5. User-Initiated Sharing
- [x] 5.1 Add UI to export/download the `.mbibundle.zip` from a saved session
- [x] 5.2 Add Web Share support only from a user gesture when supported by the browser
- [ ] 5.3 Show guidance for large files and warn that media-sharing channels may recompress images unless sent as a document/file
- [x] 5.4 Warn above 100 MB, recommend Drive/USB-style transfer above 500 MB, and block export when estimated storage headroom is less than archive size plus 20% safety margin
- [x] 5.5 Keep visible local/export status so users know whether data is only on-device, currently exporting, exported, failed, or aborted

## 6. Validation
- [x] 6.1 Add unit tests for manifest generation, filename/path mapping, export state transitions, and export validation
- [x] 6.2 Add integration tests for IndexedDB-to-bundle assembly with real IDB
- [ ] 6.3 Document manual Android Chrome verification for capture, persistence, export, aborted export retry, generated bundle validation, and at least one successful transfer path
- [ ] 6.4 Create follow-on issues for backend ingest, multi-device merge, collaboration, and automatic backup after MVP validation
