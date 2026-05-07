## 1. Proposal Alignment
- [ ] 1.1 Review and approve the bundle-first MVP decision with stakeholders
- [ ] 1.2 Revise or supersede `add-tracer-bullet` so the first vertical slice exports a bundle instead of requiring mock upload success
- [ ] 1.3 Update baseline backend/API notes to mark per-record upload as post-MVP optional ingest, not an MVP prerequisite

## 2. Bundle Contract
- [ ] 2.1 Define TypeScript types for `BundleManifest`, file entries, checksums, validation warnings, and export status
- [ ] 2.2 Implement deterministic bundle path generation for scans, sessions, records, images, thumbnails, traces, and preview frames
- [ ] 2.3 Add tests that verify a persisted one-record session maps to the expected bundle manifest and file paths

## 3. Export Implementation
- [ ] 3.1 Select and document the browser archive generation approach
- [ ] 3.2 Implement bundle assembly from IndexedDB without deleting source artifacts
- [ ] 3.3 Validate every manifest entry has a corresponding file payload before export succeeds
- [ ] 3.4 Add checksum generation and total-size accounting
- [ ] 3.5 Add failure handling for quota, missing blobs, aborted export, and unsupported sharing APIs

## 4. User-Initiated Sharing
- [ ] 4.1 Add UI to export/download the `.mbibundle.zip` from a saved session
- [ ] 4.2 Add Web Share support only from a user gesture when supported by the browser
- [ ] 4.3 Show guidance for large files and warn that WhatsApp media sharing may recompress images unless sent as a document
- [ ] 4.4 Keep visible local/export status so users know whether data is only on-device or has been exported

## 5. Validation
- [ ] 5.1 Add unit tests for manifest generation, path mapping, and export validation
- [ ] 5.2 Add integration tests for IndexedDB-to-bundle assembly with real IDB
- [ ] 5.3 Document manual Android Chrome verification for capture, persistence, export, and at least one successful transfer path
- [ ] 5.4 Create follow-on issues for backend ingest, multi-device merge, collaboration, and automatic backup after MVP validation
