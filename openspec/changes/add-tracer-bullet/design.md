## Context
The codebase is pre-implementation, but the target architecture already assumes several risky browser integrations: HTTPS-only PWA boot, camera access, IndexedDB sidecar storage, and upload retry plumbing. Implementing these concerns independently would delay feedback on whether the chosen boundaries compose cleanly in the browser.

A tracer bullet should therefore prove one narrow vertical slice instead of chasing completeness. Because the real backend is explicitly out of scope for the capture client at this stage, the slice needs development-served mock endpoints that exercise the documented API boundaries without depending on production services.

## Goals / Non-Goals
- Goals:
  - Prove the app can boot as an HTTPS PWA shell on Android Chrome
  - Prove one capture can become a valid `CaptureRecord` plus thumbnail and be written to IndexedDB
  - Prove the client can complete the documented `POST /api/scan` handshake and `POST /api/upload` payload construction against development mocks
  - Define a manual test path that future work can extend
- Non-Goals:
  - Multi-user join flows
  - Continuous IMU capture or steadiness gating
  - Background Sync reliability work
  - Upload queueing beyond a direct stub upload attempt
  - Stitching-quality image analysis beyond a placeholder quality payload
  - Production backend integration
  - Thumbnail review UI beyond a simple persisted/saved confirmation

## Decisions
- Decision: target a single-device happy path first.
  - Why: it exercises the app shell, capture shell, persistence, and upload boundary with the fewest moving parts.
  - Alternatives considered:
    - Start with collaboration setup: rejected because it adds backend and invite complexity before local capture is proven.
    - Start with isolated scaffold only: rejected because it does not validate the data path.

- Decision: use development-served mock API endpoints for `POST /api/scan` and `POST /api/upload`.
  - Why: baseline contracts define `Scan` creation and `clockOffsetMs` around server responses, so the tracer bullet should preserve that shape even before the real backend exists.
  - Alternatives considered:
    - Require a live backend: rejected because it blocks frontend sequencing.
    - Create a synthetic local `Scan`: rejected because it would invent special-case semantics for `clockOffsetMs` and drift from the baseline contract.

- Decision: perform a direct stub upload attempt, not a queued/background upload flow.
  - Why: the tracer bullet should validate payload construction and state transitions while minimizing moving parts.
  - Alternatives considered:
    - Include queueing now: rejected because it expands scope into retry orchestration and service worker behavior.
    - Skip upload entirely: rejected because it leaves a key boundary untested.

- Decision: permit a degraded image source for the first slice (`ImageCapture` when available, otherwise canvas snapshot).
  - Why: the project already assumes a degradation ladder, and the tracer bullet should prove the shell honors it.

## Risks / Trade-offs
- Mock endpoint success may hide integration issues with the real backend.
  - Mitigation: keep the adapter boundary explicit and require requests to match the documented API contract, including multipart parts and headers.
- A minimal quality payload may drift from later calibrated thresholds.
  - Mitigation: treat placeholder quality values as shape validation only, not product policy.
- The slice may be too thin to surface sensor-specific risks.
  - Mitigation: state IMU work as a deliberate follow-on, not an accidental omission.

## Migration Plan
1. Build the app scaffold and HTTPS dev environment.
2. Add development mock handlers for `POST /api/scan` and `POST /api/upload`.
3. Implement one capture path that produces a valid `CaptureRecord` with `zupt: true` and a thumbnail.
4. Persist the record and blobs in IndexedDB atomically, or clean up partial writes on failure.
5. Submit the upload payload directly to the mock adapter and update local upload state from the result.
6. Record the manual verification checklist and use it as the acceptance gate.

## Open Questions
None.
