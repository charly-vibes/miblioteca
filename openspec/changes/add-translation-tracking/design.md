## Context

The ghost overlay currently tracks only rotation (gyroscope via `DeviceOrientation`).
Adding translation tracking requires a gravity-subtracted linear acceleration source
at 60 Hz. Two browser APIs can provide this: `DeviceMotion` (legacy, universal) and
`LinearAccelerationSensor` from the Generic Sensor API (modern, restricted).

> **Working distance (`workingDistanceM`):** The translation-to-pixel conversion
> (`shiftPx = -(dx_m / workingDistanceM) * focalLength`) requires an accurate working
> distance. This change ships with a 0.6 m fixed default. The calibration UI that
> populates this value at runtime is specified in
> `openspec/changes/add-distance-config/proposal.md`.

## Goals / Non-Goals

- Goals: receive gravity-subtracted acceleration reliably on Android Chrome; integrate
  without adding permission prompts; stay consistent with the existing `DeviceOrientation` subscription
- Non-Goals: high-precision dead reckoning over long distances; iOS support

## Decisions

### Use `DeviceMotion` instead of `LinearAccelerationSensor`

`DeviceMotion` (`window.addEventListener('devicemotion', ...)`) is used rather than
the Generic Sensor API's `LinearAccelerationSensor`.

Reasons:
- **No permission required** — `DeviceMotion` fires without a `requestPermission()` call on Android Chrome; `LinearAccelerationSensor` requires the `accelerometer` permission string, adding a prompt and a failure path
- **Universal support** — `DeviceMotion` is available in all Android Chrome versions we target; `LinearAccelerationSensor` requires Chrome 67+ with the Generic Sensor flag enabled and has been behind an origin trial
- **Gravity-subtracted by spec** — `event.acceleration` (not `accelerationIncludingGravity`) is already gravity-subtracted by the platform, equivalent to `LinearAccelerationSensor`
- **Consistency** — the existing `DeviceOrientation` subscription uses the same legacy event model; mixing APIs would add complexity for no gain

Alternatives considered:
- `LinearAccelerationSensor`: correct gravity subtraction, typed API — rejected due to permission overhead and reduced browser support
- `Accelerometer` + manual gravity subtraction: avoids the permission issue but requires a complementary filter (complexity) — rejected

### Trapezoidal integration for velocity / displacement

Velocity is accumulated with trapezoidal rule (`velX += 0.5*(prevAx + ax)*dt`) rather
than simple Euler (`velX += ax*dt`). Trapezoidal is second-order accurate for smoothly
varying signals, halving integration error for the same sample rate. The added cost is
storing one previous acceleration value per axis — negligible.

### ZUPT bounds drift to inter-shot intervals

Zero-velocity update (ZUPT): clamp velocity to zero when the steadiness gate closes
(device moving too fast to be useful for overlay alignment anyway). This doesn't
eliminate drift but caps it to within each inter-shot interval. Full dead-reckoning
accuracy is not a goal — useful overlay shift over ≤2 s intervals is sufficient.

## Risks / Trade-offs

- `DeviceMotion.acceleration` can be null on some devices (sensor absent or not yet
  populated) → implementation must null-check and skip those samples
- `event.interval` is 0 on the first event → skip samples with `dt ≤ 0`
- Gravity subtraction quality varies by device; residual bias will cause slow drift →
  mitigated by ZUPT and per-shot accumulator reset

## Open Questions

- Should working distance eventually come from `add-distance-config` calibration rather
  than a URL param? **Resolved — yes.** Working distance is provided by `add-distance-config`
  (`DistanceCalibrationOverlay`). This change ships with 0.6 m fixed default; see
  `openspec/changes/add-distance-config/proposal.md` for the calibration UI.
