# Change: Add working-distance calibration for ghost overlay

## Why
The translation-tracking formula (`shiftPx = -(dx_m / distance_m) * focalLength`)
requires knowing how far the phone is from the shelf. The default of 0.6 m works at
arm's length but is wrong by 2–3× at desk distance (~25 cm) or across-the-room
scanning (~100 cm). A wrong working distance makes the ghost either sluggish (too far)
or jittery (too close), both of which destroy the alignment cue.

Users need a one-tap way to tell the app how far they're standing — without typing
numbers or going into settings.

## What Changes
- **Ruler calibration overlay**: a single-tap calibration flow accessible from the
  camera UI. The user taps a "Calibrate distance" button, a resizable bracket appears
  in the viewfinder. The user selects a reference object (credit card: 8.56 cm;
  standard paperback: 13 cm) and drags the bracket to match it. Tapping "Done"
  computes the working distance from the pinhole formula:
  ```
  distance_m = (focalLength * referenceWidth_m) / bracketWidth_px
  ```
  Result is stored in `localStorage` and used for all subsequent shots.
- **Beta-angle warning**: if `DeviceOrientation.beta` deviates more than 30° from 90°
  (phone not approximately perpendicular to the shelf), show a non-blocking overlay
  banner "Hold phone upright for best results"; auto-dismisses when beta recovers.
  Capture is not blocked.
- **URL param passthrough**: `?distance=<cm>` sets working distance for the session
  and does not update `localStorage` (useful for test sessions).
- **Debug log field**: `workingDistanceCm` added to every `ghost:at-shutter` event.

## Impact
- Affected specs: `ghost-overlay` (new calibration flow)
- Affected code: `src/sensors/ghostOverlay.ts` (accept `workingDistanceCm`),
  `src/sensors/ghostOverlayCanvas.ts` (expose setter),
  `src/tracer/CaptureView.ts` (calibration button + localStorage)
- **Depends on**: `add-translation-tracking`
