## Context
The project is pre-implementation. Baseline docs currently assume backend API contracts for scan creation, join, clock anchoring, and record upload, while the first active tracer-bullet proposal uses development mock endpoints to preserve those backend-shaped boundaries.

The product question for the MVP is narrower: can a phone capture useful bookshelf-spine artifacts under field conditions and hand them to a downstream processing workflow? That does not require a live backend. It requires a complete, portable artifact that survives offline use and can be moved with common phone sharing tools.

## Goals / Non-Goals
- Goals:
  - Make the canonical MVP output a self-contained scan bundle stored/generated on-device
  - Support user-initiated export and sharing without a production backend
  - Keep all metadata needed for future stitching/cataloguing in the bundle
  - Preserve a clean adapter seam so a backend can later ingest the same bundle format
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

- Decision: use user-initiated export/share instead of background upload.
  - Why: Web Share requires a user gesture, large uploads are fragile in service workers, and field devices may be offline.
  - Alternatives considered:
    - Automatic Drive/API upload: rejected for MVP because it introduces provider auth and integration scope.
    - Email-only export: rejected because bundle sizes may exceed email limits.

- Decision: model backend as a future consumer of the bundle, not a prerequisite for capture.
  - Why: the same artifact can support manual processing now and server ingest later.
  - Alternatives considered:
    - Keep per-record upload contracts as canonical: rejected for MVP because it couples capture success to network availability and server behavior.

## Bundle Shape
Recommended archive extension: `.mbibundle.zip`.

Minimum structure:

```text
<scanId>.mbibundle.zip
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

`manifest.json` should include bundle format version, app version, scan/session IDs, created/exported timestamps, artifact counts, total bytes, per-file checksums, and warnings produced during export validation.

## Risks / Trade-offs
- Large bundles may exceed WhatsApp/email limits or fail on low-storage devices.
  - Mitigation: estimate size before export, warn early, recommend Drive/USB/download for large files, and avoid media-gallery sharing that recompresses photos.
- Manual sharing can be forgotten, causing data to remain only on the phone.
  - Mitigation: make export status visible and warn before clearing local data.
- Cross-device ordering is weaker without server time anchoring.
  - Mitigation: for MVP, treat each bundle/session as locally ordered by `capturedAtMonotonic`; require fiducial/tie shots or later backend ingest for multi-device merge.
- Archive creation may temporarily duplicate storage usage.
  - Mitigation: check `navigator.storage.estimate()` before export and fail safely without deleting source IndexedDB blobs.

## Migration Plan
1. Revise the tracer-bullet change so its end-to-end success criterion is bundle export/share readiness rather than mock upload acknowledgement.
2. Add bundle manifest and archive packaging code after local persistence is working.
3. Add validation that every manifest entry maps to a stored blob/record before export succeeds.
4. Add user-initiated download/share UI with clear channel guidance.
5. Defer backend API implementation until after bundle artifacts have been validated against downstream processing needs.

## Open Questions
- What is the preferred archive library for browser-side ZIP generation, and what size should trigger recommending Drive/USB over WhatsApp/email?
- Should a future backend ingest the whole `.mbibundle.zip` as one upload, or unpack and upload individual artifacts client-side?
