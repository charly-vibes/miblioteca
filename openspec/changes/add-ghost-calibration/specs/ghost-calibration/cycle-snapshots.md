## ADDED Requirements

### Requirement: Cycle Snapshots (startSnapshot / endSnapshot)
At the start of RECORDING and at the transition to REPOSITIONING, the page SHALL
capture a JPEG snapshot of the live camera feed and store it in the cycle as
`startSnapshot` and `endSnapshot` respectively, so that exported data includes
visual context for each measurement cycle.

#### Scenario: startSnapshot captured on recording start
- **WHEN** the page transitions from IDLE to RECORDING
- **THEN** `captureSnapshot(videoEl)` is called and its return value is stored as
  `currentCycle.startSnapshot` (a data-URL string or `null` if capture failed)

#### Scenario: startSnapshot used as ghost overlay image
- **WHEN** `captureSnapshot` returns a non-null string at recording start
- **THEN** the ghost overlay `<img>` element's `src` is set to that data-URL and the
  overlay is made visible; if `captureSnapshot` returns `null` the overlay stays hidden

#### Scenario: endSnapshot captured on recording stop
- **WHEN** the page transitions from RECORDING to REPOSITIONING
- **THEN** `captureSnapshot(videoEl)` is called and its return value is stored as
  `currentCycle.endSnapshot`

#### Scenario: snapshot fields included in CalibrationCycle export
- **WHEN** a cycle is exported in the JSON download
- **THEN** `startSnapshot` and `endSnapshot` appear as optional fields on
  `CalibrationCycle`; both may be `null` or `undefined` when the camera is unavailable
  or the canvas context cannot be obtained

#### Scenario: default captureSnapshot draws to a canvas at video resolution
- **WHEN** no `captureSnapshot` dep is supplied
- **THEN** the built-in implementation creates a `<canvas>` sized to
  `videoEl.videoWidth × videoEl.clientWidth` (falling back to 375 × 667) and returns
  `canvas.toDataURL('image/jpeg', 0.8)`; if `drawImage` throws (e.g. cross-origin),
  `null` is returned

#### Scenario: Next Cycle clears ghost overlay src
- **WHEN** the user taps "Next Cycle" and the page returns to IDLE
- **THEN** `ghostOverlayEl.src` is set to `''` and the overlay's `display` is set to
  `'none'`, so no stale snapshot from the previous cycle is shown
