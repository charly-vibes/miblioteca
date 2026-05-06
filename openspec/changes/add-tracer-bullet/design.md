## Context
The codebase is pre-implementation, but the target architecture already assumes several risky browser integrations: HTTPS-only PWA boot, camera access, IndexedDB sidecar storage, and upload retry plumbing. Implementing these concerns independently would delay feedback on whether the chosen boundaries compose cleanly in the browser.

A tracer bullet should therefore prove one narrow vertical slice instead of chasing completeness. Because the real backend is explicitly out of scope for the capture client at this stage, the slice needs an adapter that exercises the upload boundary without depending on production services.

## Goals / Non-Goals
- Goals:
  - Prove the app can boot as an HTTPS PWA shell on Android Chrome
  - Prove one capture can become a valid `CaptureRecord` plus thumbnail and be written to IndexedDB
  - Prove the client can construct the expected upload payload and hand it to an adapter boundary
  - Define a manual test path that future work can extend
- Non-Goals:
  - Multi-user join flows
  - Continuous IMU capture or steadiness gating
  - Background Sync reliability work
  - Stitching-quality image analysis beyond a placeholder quality payload
  - Production backend integration

## Decisions
- Decision: target a single-device happy path first.
  - Why: it exercises the app shell, capture shell, persistence, and upload boundary with the fewest moving parts.
  - Alternatives considered:
    - Start with collaboration setup: rejected because it adds backend and invite complexity before local capture is proven.
    - Start with isolated scaffold only: rejected because it does not validate the data path.

- Decision: use a development API adapter that acknowledges requests without a real server.
  - Why: backend endpoints are documented but out of scope; the tracer bullet must still exercise payload construction and state transitions.
  - Alternatives considered:
    - Require a live backend: rejected because it blocks frontend sequencing.
    - Skip upload entirely: rejected because it leaves a key boundary untested.

- Decision: permit a degraded image source for the first slice (`ImageCapture` when available, otherwise canvas snapshot).
  - Why: the project already assumes a degradation ladder, and the tracer bullet should prove the shell honors it.

## Risks / Trade-offs
- Stub upload success may hide integration issues with the real backend.
  - Mitigation: keep the adapter boundary explicit and require payloads to match the documented API contract.
- A minimal quality payload may drift from later calibrated thresholds.
  - Mitigation: treat placeholder quality values as shape validation only, not product policy.
- The slice may be too thin to surface sensor-specific risks.
  - Mitigation: state IMU work as a deliberate follow-on, not an accidental omission.

## Migration Plan
1. Build the app scaffold and HTTPS dev environment.
2. Add the local scan/session bootstrap needed for one-device operation.
3. Implement one capture path that produces a valid `CaptureRecord` and thumbnail.
4. Persist the record and blobs in IndexedDB.
5. Hand the upload payload to the development adapter and mark the result in local state.
6. Record the manual verification checklist and use it as the acceptance gate.

## Open Questions
- Should the tracer bullet create a synthetic `Scan` locally, or call a mock `POST /api/scan` endpoint served by the dev environment?
- Should the first slice expose thumbnail review UI, or only a success confirmation after persistence?
