# Change: Add quick-start scan flow

## Why
Starting capture currently requires opening the app, choosing New Scan, entering a name, creating the scan, and then continuing to camera. This delays the core user goal: photographing shelf spines.

## What Changes
- Add a home-screen primary action, **Start scanning**, that creates a scan/session and navigates directly to camera after creation succeeds.
- Make scan naming optional; scans remain identified by UUID, while user-facing lists use a generated timestamp label when no reference name exists.
- Demote named/collaborative setup to a secondary path that preserves the existing QR invite and join flows.
- Add clear loading, `CaptureView` permission-prep, and failure states for quick start without creating more than one scan for one tap/retry cycle when success evidence exists.
- Ensure exported and backed-out sessions are shown under previous scans with the correct export status after the user returns home.

## Impact
- Affected specs: capture-start-ux (new)
- Affected code: `src/scan/SessionsListView.ts`, `src/scan/ScanManagementView.ts`, `src/scan/createScan.ts`, `src/App.ts`, capture/export navigation wiring, related unit and e2e tests
