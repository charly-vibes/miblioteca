## 1. Design and sequencing
- [ ] 1.1 Confirm whether the tracer bullet should bootstrap a local-only `Scan` or use a dev-served mock API endpoint
- [ ] 1.2 Split the tracer bullet into implementation tickets that each map to a red → green → refactor cycle

## 2. Vertical slice implementation
- [ ] 2.1 Scaffold the HTTPS PWA shell and a minimal route for the tracer-bullet capture flow
- [ ] 2.2 Add tests for local scan/session bootstrap and implement the bootstrap path
- [ ] 2.3 Add tests for creating a minimal valid `CaptureRecord` and implement the record factory
- [ ] 2.4 Add tests for IndexedDB persistence of record, image blob, and thumbnail blob, then implement persistence
- [ ] 2.5 Add tests for the upload adapter request shape and implement a development stub adapter
- [ ] 2.6 Wire the UI happy path: start scan, capture once, persist locally, enqueue stub upload, and show status

## 3. Validation
- [ ] 3.1 Run unit and integration tests for the tracer-bullet slice
- [ ] 3.2 Execute and document a manual Android Chrome verification checklist over HTTPS
- [ ] 3.3 Capture follow-on issues for collaboration, IMU gating, and real backend integration
