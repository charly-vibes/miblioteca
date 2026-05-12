## Overview

"Translation drift" in the calibration context refers to the lateral and vertical
displacement accumulated by `feedGhostAccel` via double-integration of
`DeviceMotionEvent.acceleration`.  Because the calibration page measures how
accurately the gyro-driven ghost tracks a real-world reference point, any
translation-induced shift would corrupt the comparison: the ghost image would move
not only in response to rotation but also in response to hand tremor or small steps,
making it impossible to isolate the rotational error.

Calibration mode therefore suppresses the motion gate entirely by passing
`enableMotionGate: false` to `GhostMotionPipeline`, which has a specific
implication for the rendering path described below.

---

## Behavior

### What "translation drift" means here

`GhostOverlayState` carries `dx_m` / `dy_m` (meters of accumulated lateral and
vertical displacement) alongside `yawIntegral` / `pitchIntegral`.  In the normal
capture path these feed `computeTranslationShiftPx` / `computeTranslationShiftPy`
to shift the ghost image by the estimated physical movement of the phone.

During a calibration recording the same `GhostFrame` fields `dx_m` and `dy_m` are
still emitted by the pipeline, but `GhostCalibrationPage.onPipelineFrame` never
applies them to the ghost image position: it reads only `shiftPx` and
`pitchShiftPx` from the frame, both of which are pure rotation-derived values
computed by `computeShiftPx` / `computeShiftPy`.

### Why translation is suppressed in calibration

Calibration measures the angular error between algorithm prediction and user ground
truth in pixel space.  The reference frame is a static snapshot of the scene at
`transitionToRecording` time.  A translation shift would superimpose on the
rotation shift, causing `cycle.deltaPixels` to absorb translational error alongside
(or instead of) rotational error.  The resulting dataset could not be used to tune
the FOV or focal-length parameters — the purpose of calibration.

### enableMotionGate=false in calibration vs. capture

The `enableMotionGate` flag in `GhostMotionPipelineDeps` controls whether the
pipeline applies the two-threshold hysteretic visibility gate.

| Setting | Behavior |
|---|---|
| `enableMotionGate: true` (capture default) | RAF emits `gateOpen: false` and zeroes velocity when `omegaMag > 0.55 rad/s`; resumes when `omegaMag < 0.40 rad/s` |
| `enableMotionGate: false` (calibration) | RAF always emits frames regardless of `omegaMag`; `gateOpen` is always `true` in the frame |

With the gate disabled the early-return guard inside the RAF loop
(`if (!this.deps.gyro && this.deps.enableMotionGate && !this.gateVisible) return`)
is also skipped.  The pipeline emits a frame on every animation tick with no
suppression, giving the calibration page a continuous stream of rotation angles
even during rapid movement.

### Rendering path with enableMotionGate=false

Because `gateVisible` is never consulted, `zeroVelocity` is never called as a
side-effect of the gate closing.  Translation accumulators `dx_m` / `dy_m` continue
to accumulate in `GhostOverlayState` normally.  The calibration page simply ignores
them: `onPipelineFrame` destructures only `shiftPx` and `pitchShiftPx` from the
incoming `GhostFrame` and uses those to position the rectangle and transform the
ghost image.

---

## Contract / Interface

```
GhostMotionPipeline({
  enableMotionGate: false,   // required for calibration page
  onFrame: (frame: GhostFrame) => void,
  // frame.gateOpen is always true when enableMotionGate=false
  // frame.dx_m / frame.dy_m are populated but ignored by the calibration page
})
```

`GhostCalibrationPage.onPipelineFrame(frame)` applies:
- `rectangleEl.style.left = rectInitLeft + Math.round(frame.shiftPx)`
- `ghostOverlayEl.style.transform = translate3d(frame.shiftPx, frame.pitchShiftPx, 0)`

Translation fields `frame.dx_m` and `frame.dy_m` are stored in `latestFrame` for
telemetry and export but are **not** used to compute any DOM position.

---

## Acceptance Criteria

#### Scenario: Pipeline constructed with enableMotionGate=false
- **WHEN** `GhostCalibrationPage` is constructed
- **THEN** it creates a `GhostMotionPipeline` with `enableMotionGate: false`

#### Scenario: Frame always emitted during rapid rotation
- **WHEN** `omegaMag` exceeds `MOTION_GATE_HIDE_RAD_S` (0.55 rad/s)
- **THEN** `onFrame` is still called each RAF tick and `frame.gateOpen` is `true`

#### Scenario: Ghost image position tracks rotation only
- **WHEN** the pipeline emits a frame with `shiftPx = S` and non-zero `dx_m`
- **THEN** the ghost overlay `transform` is `translate3d(S, pitchShiftPx, 0)`;
  `dx_m` has no effect on the rendered position

#### Scenario: deltaPixels reflects rotation error only
- **WHEN** the user confirms at the end of a cycle
- **THEN** `cycle.deltaPixels` measures the difference between
  `algorithmPosition` (rotation-only ghost tracking) and the user-dragged
  `groundTruthPosition`, with no translation component applied
