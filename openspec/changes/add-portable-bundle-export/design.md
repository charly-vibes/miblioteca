## Context
The project is pre-implementation. Baseline docs currently assume backend API contracts for scan creation, join, clock anchoring, and record upload, while the first active tracer-bullet proposal uses development mock endpoints to preserve those backend-shaped boundaries.

The product question for the MVP is narrower: can a phone capture useful bookshelf-spine artifacts under field conditions and hand them to a downstream processing workflow? That does not require a live backend. It requires a complete, portable artifact that survives offline use and can be moved with common phone sharing tools.

## Goals / Non-Goals
- Goals:
  - Make the canonical MVP output a self-contained scan bundle stored/generated on-device
  - Support user-initiated export and transfer readiness without a production backend
  - Keep all metadata needed for future stitching/cataloguing in the bundle
  - Track bundle export state separately from server upload state
  - Preserve a clean adapter seam so a backend can later ingest the same capture record format via per-record upload
  - Reduce MVP operational risk by avoiding auth, hosting, retry queues, and live collaboration
- Non-Goals:
  - Real-time multi-user collaboration
  - Server-hosted scan state
  - Server clock anchoring as an MVP dependency
  - Automatic cloud backup
  - Backend stitching, OCR, cataloguing, or review dashboards
  - Guaranteed compatibility with every share target; file export plus at least one manual transfer path is sufficient

## Decisions
- Decision: define the bundle as the MVP delivery contract.
  - Why: it validates capture quality and downstream data completeness before server infrastructure exists.
  - Alternatives considered:
    - Real backend first: rejected because it adds operational and security burden before data usefulness is proven.
    - Mock backend first: rejected as the canonical MVP path because it exercises an implementation seam rather than delivering a user-transferable artifact.

- Decision: package artifacts as a single archive with a manifest.
  - Why: users need one thing to share, and downstream tooling needs deterministic paths, checksums, versions, and counts.
  - Alternatives considered:
    - Loose files in a directory: rejected because mobile share flows handle a single file more reliably.
    - Only JSON plus image references: rejected because referenced IndexedDB blobs are not portable outside the browser profile.

- Decision: generate `.mbibundle.zip` archives in-browser with JSZip.
  - Why: JSZip runs in the PWA without native dependencies, supports Blob output, and lets tests inspect generated archives deterministically.
  - Alternatives considered:
    - StreamSaver/OPFS streaming ZIP: deferred until field data proves memory pressure is a problem.
    - Custom ZIP writer: rejected because checksum and archive correctness are higher risk than using a maintained library.

- Decision: use `sha256` checksums for manifest entries.
  - Why: SHA-256 is widely supported by browser cryptography APIs and downstream tooling.
  - Alternatives considered:
    - Unspecified checksum: rejected because it would make validators incompatible.
    - MD5/SHA-1: rejected because they are weaker and not worth standardizing for a new format.

- Decision: track export state separately from server upload state.
  - Why: `CaptureRecord.uploadState` describes server upload lifecycle; a valid bundle export must not falsely mark records as uploaded.
  - Alternatives considered:
    - Reuse `uploadState: "uploaded"`: rejected because it conflates local file export with backend acknowledgement.
    - No persisted export state: rejected because users need to know whether data is only on-device or has been exported.

- Decision: use user-initiated export/share instead of background upload.
  - Why: Web Share requires a user gesture, large uploads are fragile in service workers, and field devices may be offline.
  - Alternatives considered:
    - Automatic Drive/API upload: rejected for MVP because it introduces provider auth and integration scope.
    - Email-only export: rejected because bundle sizes may exceed email limits.

- Decision: model backend as a future consumer of the same capture record format, not a prerequisite for capture. Backend ingest uses individual artifact upload (per-record POST /api/upload); the bundle is not a server ingest format.
  - Why: the capture record format is stable across both delivery modes (bundle export and per-record upload). The bundle is a local transfer artifact and MVP stopgap; once a backend exists, records upload individually with granular retry semantics suited to field connectivity conditions.
  - Alternatives considered:
    - Backend ingests the whole `.mbibundle.zip`: rejected because it couples the server to the bundle packaging format and loses per-record retry granularity. The per-record upload API is already designed and the client already tracks `uploadState` per record.
    - Keep per-record upload contracts as canonical for MVP: rejected because it couples MVP success to network availability and server behavior before capture quality is validated.

## Bundle Shape
Recommended archive extension: `.mbibundle.zip`.

Recommended filename format: `<safe-scan-name>-<YYYY-MM-DD>-<shortScanId>.mbibundle.zip`, where `safe-scan-name` is filesystem-safe and `shortScanId` is enough of the scan ID to disambiguate exports.

Minimum structure:

```text
<safe-scan-name>-<YYYY-MM-DD>-<shortScanId>.mbibundle.zip
  manifest.json
  scans/scan.json
  sessions/<sessionId>.json
  records/<recordId>.json
  images/<recordId>.<jpg|png|webp>
  thumbnails/<recordId>.jpg
  traces/<sessionId>.bin                # present when motion trace is enabled
  preview-frames/<frameId>.json         # present when preview frames are enabled
  preview-images/<frameId>.jpg          # present when preview frames are enabled
```

`manifest.json` should include bundle format version, app version, scan/session IDs, created/exported timestamps, artifact counts, total bytes, per-file `sha256` checksums, and warnings produced during export validation.

## Export State
Bundle export state should be session-level unless implementation discovers a stronger reason to track it per scan:

```ts
type BundleExportState =
  | "not_exported"
  | "exporting"
  | "exported"
  | "failed"
  | "aborted";

interface BundleExportStatus {
  state: BundleExportState;
  lastAttemptedAt?: string;
  lastExportedAt?: string;
  fileName?: string;
  sizeBytes?: number;
  sha256?: string;
  error?: string;
}
```

This state is independent of `CaptureRecord.uploadState`. A bundle can be valid and exported while all records remain `uploadState: "pending"` for any future backend delivery adapter.

## Size and Storage Thresholds
Initial thresholds for implementation calibration:

- Warn above 100 MB: many email paths will fail or be slow.
- Recommend Drive/USB or similar document-preserving transfer above 500 MB.
- Block export when `navigator.storage.estimate()` indicates available headroom is less than the estimated archive size plus 20% safety margin.

These are MVP defaults to validate manually on Android Chrome and may be revised with field data.

## Risks / Trade-offs
- Large bundles may exceed WhatsApp/email limits or fail on low-storage devices.
  - Mitigation: estimate size before export, warn early, recommend Drive/USB/download for large files, and avoid media-gallery sharing that recompresses photos.
- Manual sharing can be forgotten, causing data to remain only on the phone.
  - Mitigation: make export status visible and warn before clearing local data.
- Cross-device ordering is weaker without server time anchoring.
  - Mitigation: for MVP, treat each bundle/session as locally ordered by `capturedAtMonotonic`; require fiducial/tie shots or later backend ingest for multi-device merge.
- Archive creation may temporarily duplicate storage usage.
  - Mitigation: check `navigator.storage.estimate()` before export and fail safely without deleting source IndexedDB blobs.
- Mobile browsers may abort export work when the tab is backgrounded or the share sheet is dismissed.
  - Mitigation: keep source artifacts intact, return to a retryable export state, and require successful generated-bundle validation before showing completion.

## Migration Plan
1. Revise the tracer-bullet change so its end-to-end success criterion is one-record bundle export/share readiness rather than mock upload acknowledgement.
2. Add bundle manifest, export status, and archive packaging code after local persistence is working.
3. Add validation that every manifest entry maps to a stored blob/record before export succeeds.
4. Add generated-bundle validation for counts, byte totals, and `sha256` checksums before presenting the file as shareable.
5. Add user-initiated download/share UI with clear channel guidance.
6. Defer backend API implementation until after bundle artifacts have been validated against downstream processing needs.

## Resolved Decisions

- **Backend ingest format** (resolved 2026-05-08): the backend accepts individual artifacts via per-record upload (`POST /api/upload`). The client unpacks and uploads records individually. The bundle is not a server ingest format. Granular per-record retry is better suited to field connectivity conditions, and the per-record API is already designed.
