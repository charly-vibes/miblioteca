## 1. Red: specify quick-start behavior

- [ ] 1.1 Add unit/integration tests for home primary **Start scanning** action appearing before previous sessions.
- [ ] 1.2 Add test that clicking **Start scanning** creates a scan without requiring `scanName` and navigates to the session camera route on success.
- [ ] 1.3 Add test that the quick-start button shows **Starting camera…**, is disabled during creation, and prevents duplicate submissions.
- [ ] 1.4 Add test that creation failure restores **Start scanning** and shows the inline recovery error.
- [ ] 1.5 Add test for partial create failure where the API succeeds but IndexedDB persistence fails before a session is stored.
- [ ] 1.6 Add test that named/collaborative creation remains reachable through a secondary **More options** button.
- [ ] 1.7 Add test that `CaptureView` shows **Allow camera access to photograph shelf spines.** before the first camera request settles.
- [ ] 1.8 Add e2e coverage for `Open app -> Start scanning -> camera visible` using role/name selectors and observable waits.

## 2. Green: implement quick start

- [ ] 2.1 Update the home/session list view to render **Start scanning** as the primary action and **Previous scans** below it.
- [ ] 2.2 Wire quick-start creation through existing `createScan` with no required reference name.
- [ ] 2.3 Keep the app on home during creation, then navigate to `/#/session/<sessionId>` only after scan/session creation succeeds.
- [ ] 2.4 Add loading, standard error, and partial-persistence-failure UI states with accessible text matching the specification.
- [ ] 2.5 Demote the existing named/collaborative flow behind a secondary **More options** action while preserving QR invite and join behavior.
- [ ] 2.6 Add the camera permission prep message inside `CaptureView` before its first camera stream request settles.
- [ ] 2.7 Ensure home renders existing exported sessions as **Exported** and backed-out non-exported sessions as **Pending** after the user returns home.

## 3. Refactor and verify

- [ ] 3.1 Extract any duplicated scan-start state handling into a small typed helper if tests reveal repeated state transitions.
- [ ] 3.2 Verify selector policy: role/name first, no CSS/XPath behavioral selectors in new tests.
- [ ] 3.3 Verify observable waits: no sleeps in new e2e tests.
- [ ] 3.4 Run unit tests and targeted e2e tests for scan start/navigation.
- [ ] 3.5 Run `openspec validate add-quick-start-scan --strict`.
