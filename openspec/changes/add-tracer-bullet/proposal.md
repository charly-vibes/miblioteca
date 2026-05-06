# Change: Add a tracer-bullet vertical slice

## Why
The project has research notes and baseline contracts, but no documented first slice that proves the app can boot, capture a record, persist it locally, and exercise the upload boundary. A tracer bullet reduces sequencing risk by validating the end-to-end shape before feature work branches into camera quality, collaboration, and sensor-heavy flows.

## What Changes
- Add a `tracer-bullet` capability that defines the minimum end-to-end happy path for the first implementation slice
- Scope the slice to a single-device flow: start a local scan, enter capture mode, save one capture record and thumbnail in IndexedDB, and enqueue a stub upload attempt
- Require a development-safe API adapter so the slice can run before the real backend exists
- Define explicit non-goals so collaboration, IMU quality gates, and background sync remain out of scope for this slice

## Impact
- Affected specs: `tracer-bullet`
- Related baseline references: `openspec/specs/api-contracts.md`, `openspec/specs/data-model.md`
- Affected code: future app scaffold, local persistence layer, capture flow shell, API adapter boundary, and manual verification docs
