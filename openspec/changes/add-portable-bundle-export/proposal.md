# Change: Add portable scan bundle export

## Description
Shift the capture MVP from backend-first upload semantics to a bundle-first local artifact flow. The PWA SHALL capture and persist scan artifacts on-device, then export a complete portable bundle that can be shared through user-chosen channels such as Google Drive, WhatsApp-as-document, email when size permits, USB, or other file transfer tools.

## Why
A real backend adds hosting, authentication, upload retry, operations, and privacy complexity before the project has proven that the capture artifacts are useful. A portable bundle lets the MVP validate the capture pipeline in offline field conditions while preserving a future backend as an optional ingest target for the same artifact format.

## What Changes
- Add a `portable-bundle-export` capability defining the canonical MVP delivery artifact: one self-contained scan bundle containing images, thumbnails, sidecar metadata, session records, traces when present, and a manifest
- Replace the near-term requirement for real or mock upload success with local export validation and user-initiated sharing
- Preserve a delivery adapter boundary so backend upload can later ingest the same bundle format without changing the capture data model
- Defer multi-user live collaboration, server clock anchoring, account/auth systems, automatic backup, and centralized processing to post-MVP backend work
- Require explicit user warnings for bundle size, browser sharing limitations, and local storage/export risk

## Impact
- Affected specs: `portable-bundle-export`
- Related active changes: `add-tracer-bullet` should be revised or superseded so its first vertical slice exports a bundle instead of exercising `POST /api/upload` mock semantics
- Related baseline references: `openspec/specs/api-contracts.md`, `openspec/specs/data-model.md`
- Affected code: capture persistence, export packaging, manifest generation, Web Share/download/Drive handoff UI, validation checks, manual verification docs
