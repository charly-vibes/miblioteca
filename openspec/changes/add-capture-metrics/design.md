## Context
Quality feedback requires two separate concerns: (1) per-frame image sharpness and exposure,
and (2) spatial displacement between shots for downstream stitching. Both are partially
implemented but have bugs or gaps.

## Goals / Non-Goals
- Goals: fix GC jank from 600KB allocation, tighten exposure thresholds, add displacement estimate
- Non-Goals: GPU acceleration (pure JS sufficient at 320×240), full Kalman filter, magnetometer fusion

## Decisions

### Blur algorithm: Laplacian Variance (keep, fix allocation)
Tenengrad/Sobel MSE offers 2% AUC gain (0.87 vs 0.85) but requires rewriting the scorer.
The allocation bug in `laplacianVariance()` is the real problem — the algorithm is sound.
Fixing the accumulator (zero-allocation, match `CaptureView.laplacianVarianceOf()` pattern)
is 10 lines and eliminates 5–20 ms GC pauses.

Tenengrad is documented as a known upgrade path if calibration data shows 2% matters for
book-spine text detection.

### Sensor fusion for displacement: quaternion + GravitySensor (no Kalman)
Three approaches evaluated:

| Approach | Lines | Accuracy (1–2 s intervals) | Verdict |
|---|---|---|---|
| Pure accel double integration | ~20 | Dangerously noisy without gravity sub | Rejected |
| **Quaternion rotation + GravitySensor** (chosen) | **~60** | **2–15 cm** | **Best trade-off** |
| Complementary filter (accel+gyro) | ~50 | Similar | Equivalent; quat approach uses already-recorded fields |
| EKF | 300+ | Marginal gain | ZUPT hard-reset eliminates main EKF benefit |

Using `qx/qy/qz/qw` from `AbsoluteOrientationSensor` and `grx/gry/grz` from `GravitySensor`
— both already in `imuTrace` — avoids any new sensor setup.

### Field rename: `stepCountSincePrev` → `displacementMeters`
`stepCountSincePrev` was a placeholder from an earlier stride-based PDR design that was
never implemented. Rename inline as part of this change (no migration needed — field has
never been populated with meaningful data).

## Risks / Trade-offs
- Expected accuracy is 2–5 cm best case, 5–15 cm typical. At sparse capture (<3/m), this
  is not actionable for shelf ordering. Useful as supplementary metadata, not as primary
  spatial anchor.
- `AbsoluteOrientationSensor` uses magnetometer — metal shelving may bias heading.
  Mitigation: use only horizontal displacement magnitude `sqrt(px²+py²)`, not directional,
  so heading bias does not affect the scalar estimate.

## Open Questions
- Should `displacementMeters` be surfaced in the UI? Deferred — store it in the record,
  surface display in a future "capture stats" view.
