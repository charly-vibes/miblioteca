## Overview

The ghost overlay uses `DEFAULT_HFOV_DEG = 40` as the effective horizontal field of
view for all focal-length and shift calculations.  This value differs from the
nominal camera FOV (typically ~65° on a smartphone rear camera) to account for the
projection loss caused by the natural forward tilt of a hand-held phone.

---

## Behavior

### Why 40° instead of the nominal ~65°

When a person holds a phone to take a picture of a shelf, the phone is typically
tilted forward by roughly 55° from vertical (i.e., `DeviceOrientationEvent.beta`
≈ 55°).  The device is not parallel to the scene; it is angled toward it.

The camera sensor captures the full nominal FOV of the lens, but the component of
that FOV that aligns with the horizontal scan axis is reduced by `cos(tilt)`:

```
effectiveFov = 2 * arctan(cos(tilt) * tan(nominalFov / 2))
```

With `tilt = 55°` and `nominalFov = 65°`:

```
cos(55°) ≈ 0.574
tan(32.5°) ≈ 0.637
effectiveFov = 2 * arctan(0.574 * 0.637)
             = 2 * arctan(0.366)
             ≈ 2 * 20.1°
             ≈ 40°
```

Using 40° as the effective FOV means the focal-length-in-pixels value produced by
`focalLengthPx(displayWidth, hFovDeg)` correctly maps one radian of yaw rotation
to the number of screen pixels the ghost image should shift for it to appear
spatially fixed at the typical shooting distance.

Using the nominal 65° would under-estimate the focal length, producing a ghost that
moves too little per degree of rotation and drifts visibly away from its reference
position during a slow pan.

### Where the constant is used

`DEFAULT_HFOV_DEG = 40` is the default argument to:

- `focalLengthPx(displayWidth, hFovDeg)` — converts viewport width to focal length
  in CSS pixels
- `computeShiftPx(yawIntegral, displayWidth, hFovDeg)` — horizontal ghost offset
- `computeShiftPy(pitchIntegral, displayWidth, displayHeight, hFovDeg)` — vertical
  ghost offset
- `clampYawToViewport(yawIntegral, hFovDeg)` — maximum yaw before clamping
- `computeTranslationShiftPx` / `computeTranslationShiftPy` — translation shifts

`GhostCalibrationPage` imports `DEFAULT_HFOV_DEG` and aliases it as `H_FOV_DEG`
to include in the JSON export (`hFovDeg` field of `CalibrationExport`).

---

## Contract / Interface

```ts
export const DEFAULT_HFOV_DEG = 40   // src/sensors/ghostOverlay.ts

export function focalLengthPx(displayWidth: number, hFovDeg = DEFAULT_HFOV_DEG): number {
  return (displayWidth / 2) / Math.tan((hFovDeg * Math.PI) / 180 / 2)
}
```

For a 375 px wide display:
- `focalLengthPx(375, 40) ≈ 375 / (2 * tan(20°)) ≈ 515 px`
- Compare: `focalLengthPx(375, 65) ≈ 375 / (2 * tan(32.5°)) ≈ 295 px`

The 40° value produces a ~75% longer focal length, meaning ghost shifts are
proportionally larger per radian of rotation, compensating for the tilt projection
loss.

---

## Acceptance Criteria

#### Scenario: DEFAULT_HFOV_DEG is 40
- **WHEN** `ghostOverlay.ts` is imported
- **THEN** `DEFAULT_HFOV_DEG === 40`

#### Scenario: focalLengthPx uses 40° default
- **WHEN** `focalLengthPx(375)` is called without an explicit `hFovDeg`
- **THEN** the returned value equals `(375 / 2) / tan(20° in radians)` ≈ 515

#### Scenario: Calibration export records the effective FOV
- **WHEN** the user exports a calibration JSON
- **THEN** the `hFovDeg` field equals `DEFAULT_HFOV_DEG` (40)

#### Scenario: Ghost stays approximately fixed at natural shooting tilt
- **GIVEN** a phone held at ~55° forward tilt sweeping horizontally
- **WHEN** the ghost overlay is rendered with `hFovDeg = 40`
- **THEN** the ghost image visually tracks the scene with less drift than it would
  with `hFovDeg = 65`
