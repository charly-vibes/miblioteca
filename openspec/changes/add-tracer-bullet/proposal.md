# Change: Add a tracer-bullet vertical slice

## Description
A minimum end-to-end vertical slice that proves the app can boot as an HTTPS PWA on Android Chrome, acquire camera permission, capture one photo into a typed `CaptureRecord`, persist the record and blobs atomically in IndexedDB, and complete a stub upload against a development mock — without requiring a real backend. The slice establishes the data path, state machine boundaries, and manual verification baseline for all subsequent feature work.

## Why
The project has research notes and baseline contracts, but no documented first slice that proves the app can boot, capture a record, persist it locally, and exercise the upload boundary. A tracer bullet reduces sequencing risk by validating the end-to-end shape before feature work branches into camera quality, collaboration, and sensor-heavy flows.

## What Changes
- Add a `tracer-bullet` capability that defines the minimum end-to-end happy path for the first implementation slice
- Scope the slice to a single-device flow: call a development-served mock `POST /api/scan` handshake, enter capture mode, save one capture record and thumbnail in IndexedDB, and submit one direct stub upload attempt
- Require a development-safe API adapter that preserves the documented upload payload shape while acknowledging requests without a production backend
- Define explicit non-goals so collaboration, IMU quality gates, upload queueing/background sync, and production backend integration remain out of scope for this slice

## Impact
- Affected specs: `tracer-bullet`
- Related baseline references: `openspec/specs/api-contracts.md`, `openspec/specs/data-model.md`
- Affected code: app scaffold, mock scan bootstrap endpoint, capture flow shell, record factory, IndexedDB persistence module, upload adapter boundary, and manual verification docs
