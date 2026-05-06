## 1. Design and sequencing
- [ ] 1.1 Create beads implementation tickets for scaffold, mock API handshake, record factory, persistence, upload adapter, UI flow, and validation
- [ ] 1.2 Ensure each implementation ticket maps to a red → green → refactor cycle

## 2. Vertical slice implementation
- [ ] 2.1 Scaffold the HTTPS PWA shell and a minimal route for the tracer-bullet capture flow
- [ ] 2.2 Add tests for development `POST /api/scan` handshake semantics and implement mock scan bootstrap
- [ ] 2.3 Add tests for creating a minimal valid `CaptureRecord` including `zupt: true`, then implement the record factory
- [ ] 2.4 Add tests for atomic IndexedDB persistence of record, image blob, and thumbnail blob; implement persistence with cleanup on partial failure
- [ ] 2.5 Add tests for the direct upload adapter request shape (`record`, `image`, `thumbnail`, `Idempotency-Key`) and implement the development stub adapter
- [ ] 2.6 Wire the UI happy path: start scan, request camera permission, capture once, persist locally, submit one direct stub upload attempt, and show saved/upload status

## 3. Validation
- [ ] 3.1 Run unit and integration tests for the tracer-bullet slice
- [ ] 3.2 Execute and document a manual Android Chrome verification checklist over HTTPS, including permission-denied behavior
- [ ] 3.3 Capture follow-on issues for collaboration, IMU gating, upload queueing/background sync, and real backend integration
