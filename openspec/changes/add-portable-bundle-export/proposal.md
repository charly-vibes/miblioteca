# Change: Add portable scan bundle export

## Description
Shift the capture MVP from backend-first upload semantics to a bundle-first local artifact flow. The PWA SHALL capture and persist scan artifacts on-device, then generate a complete portable bundle locally. Bundle transfer can then happen through user-chosen document-preserving channels such as Google Drive, WhatsApp sent as a document, email when size permits, USB, or other file transfer tools.

## Why
A real backend adds hosting, authentication, upload retry, operations, and privacy complexity before the project has proven that the capture artifacts are useful. A portable bundle lets the MVP validate the capture pipeline in offline field conditions while preserving a future backend as an optional ingest target for the same artifact format.

## What Changes
- Add a `portable-bundle-export` capability defining the canonical MVP delivery artifact: one self-contained scan bundle containing images, thumbnails, sidecar metadata, session records, traces when present, and a manifest
- Replace the near-term requirement for real or mock upload success with local export validation and user-initiated transfer readiness
- Add export/session delivery state separate from server `uploadState`, so bundle export does not pretend records were uploaded
- Preserve a delivery adapter boundary so backend upload can later ingest the same bundle format without changing capture metadata semantics
- Defer multi-user live collaboration, server clock anchoring, account/auth systems, automatic backup, and centralized processing to post-MVP backend work
- Require explicit user warnings for bundle size, browser sharing limitations, aborted exports, generated-bundle validation failures, and local storage/export risk

## Coordination With `add-tracer-bullet`
This change supersedes the upload-boundary portion of `add-tracer-bullet`. `add-tracer-bullet` was marked superseded on 2026-05-07: the first vertical slice succeeds by producing and validating a one-record `.mbibundle.zip` instead of requiring development mock `POST /api/upload` acknowledgement. The local capture and IndexedDB persistence portions of `add-tracer-bullet` were implemented prerequisites and remain in the codebase.

## Impact
- Affected specs: `portable-bundle-export`
- Related active changes: `add-tracer-bullet` must be revised or superseded before implementation so there is only one first-slice success criterion
- Related baseline references: `openspec/specs/api-contracts.md`, `openspec/specs/data-model.md`
- Affected data model: add bundle export/session delivery status separate from `CaptureRecord.uploadState`
- Affected code: capture persistence, export packaging, manifest generation, Web Share/download/Drive handoff UI, validation checks, manual verification docs
