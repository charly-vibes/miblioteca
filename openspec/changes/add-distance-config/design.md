## Focal Length at Runtime

The pinhole formula requires a focal length in pixels:

```
focalLength = (viewfinderWidthPx / 2) / tan(hFovDeg / 2)
```

`DEFAULT_HFOV_DEG = 40` is used as a fixed constant. `getPhotoCapabilities()` is NOT
used to obtain FOV because it is unavailable on `MediaStream` tracks in Android Chrome
— it only applies to `ImageCapture`, and even there it does not expose FOV. The 40°
value is empirically derived; see `add-ghost-overlay/fov-correction-40deg.md` for the
measurement methodology.

## Sensitivity Analysis

The working-distance formula is hyperbolic:

```
distance_m = (focalLength * referenceWidth_m) / bracketWidth_px
```

Error in `bracketWidth_px` propagates non-linearly. For a 47 px bracket at 60 cm:
- ±5 px bracket error → ±6 cm distance error (~10%)

At 30 cm the same 47 px bracket is roughly half the frame width, so:
- ±5 px bracket error → ±13 cm distance error (~43%)

Users should be warned to calibrate at arm's length, not close-up. The calibration UI
should surface this guidance prominently.

## Reference Object Choices

Two presets are offered:

| Object | Width |
|---|---|
| Credit card (ISO 7810 ID-1) | 8.56 cm |
| Standard paperback | 13 cm |

Both are universally available, have unambiguous edges, and are flat enough to align
with the viewfinder plane. These two presets cover >90% of use cases and avoid the
complexity of a free-entry numeric field. User-supplied reference widths are deferred.

## Out-of-Range Handling

- Values from the URL param (`?distance=<cm>`) or `localStorage` are clamped to
  [20, 150] cm.
- Non-numeric or missing URL params fall back to the 60 cm default.
- The URL param is session-only — it does not update `localStorage`.
- Invalid values are silently clamped; no error is surfaced to the user.

## Why Working Distance Matters

Working distance feeds `computeTranslationShiftPx` and `computeTranslationShiftPy`:

```
shiftPx = -(dx_m / workingDistanceM) * focalLength
shiftPy = -(dy_m / workingDistanceM) * focalLength
```

Error in `workingDistanceM` propagates linearly to both shift components. A working
distance that is 2× too large halves the ghost's translation response; one that is 2×
too small doubles it. Both cases degrade overlay alignment accuracy and defeat the
purpose of the ghost cue.
