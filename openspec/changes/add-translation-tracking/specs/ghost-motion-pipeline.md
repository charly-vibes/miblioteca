## Overview

`GhostMotionPipeline` is the single class that owns the animation frame loop,
gyroscope subscription, optional linear-acceleration subscription, and motion gate
for the ghost overlay feature.  Callers provide sensor handles and display
dimensions at construction time; the pipeline emits a `GhostFrame` on every RAF
tick via an `onFrame` callback.

---

## Behavior

### Class responsibility

The pipeline:
1. Subscribes to a `GyroLike` sensor on construction, feeding samples into
   `feedGhostGyro` to accumulate `yawIntegral` / `pitchIntegral`.
2. Optionally subscribes to a `MotionLike` sensor, feeding samples into
   `feedGhostAccel` to accumulate `dx_m` / `dy_m`.
3. Starts a `requestAnimationFrame` loop that reads the accumulated state,
   applies the motion gate, and dispatches a `GhostFrame` to `onFrame`.
4. Never mutates DOM; callers handle rendering.

### RAF loop

Each tick:
1. If `destroyed` is `true`, return without re-scheduling.
2. Re-schedule itself unconditionally (`this.rafId = raf(this.rafLoop)`).
3. Early-exit when no gyro is attached **and** `enableMotionGate` is `true` and the
   gate is currently closed (nothing to render).
4. Apply the motion gate (when `enableMotionGate: true`).
5. Clamp `yawIntegral` to `clampYawToViewport`.
6. Call `onFrame` with the computed `GhostFrame`.

### Two-threshold motion gate

The gate uses separate thresholds for opening and closing to prevent flicker near
the boundary:

| Direction | Threshold | Source constant |
|---|---|---|
| Hide (gate closes) | `omegaMag > 0.55 rad/s` | `MOTION_GATE_HIDE_RAD_S` |
| Show (gate opens) | `omegaMag ≤ 0.40 rad/s` | `MOTION_GATE_SHOW_RAD_S` |

`motionGateVisible(omegaMag, currentlyHidden, showThreshold, hideThreshold)` encodes
this: when hidden, it requires `omegaMag ≤ showThreshold`; when visible, it allows
movement up to `hideThreshold` before closing.

On gate close:
- `gateVisible` is set to `false`.
- `zeroVelocity` is called (ZUPT: velocity zeroed, position `dx_m`/`dy_m` retained).
- `onFrame` is called once with `{ gateOpen: false, yawRad: 0, pitchRad: 0,
  shiftPx: 0, pitchShiftPx: 0, dx_m: 0, dy_m: 0 }` — a blank frame to hide the
  ghost.
- `yawIntegral` and `pitchIntegral` are **not** reset; the sensor continues
  integrating while the gate is closed so that the ghost shows the correct position
  when the gate re-opens.

### enableMotionGate flag behavior

| Value | Effect |
|---|---|
| `true` (default) | Gate is active; ghost hides when `omegaMag > 0.55 rad/s` |
| `false` | Gate is bypassed entirely; `onFrame` fires every tick with `gateOpen: true` always |

`GhostCalibrationPage` passes `enableMotionGate: false` to ensure continuous
rendering during calibration.

### onFrame callback — GhostFrame fields

`GhostFrame` is dispatched each RAF tick when the gate is open (or disabled):

```ts
type GhostFrame = {
  t: DOMHighResTimeStamp   // performance.now() at emit time
  yawRad: number           // accumulated yaw since last reset (rad)
  pitchRad: number         // accumulated pitch since last reset (rad)
  shiftPx: number          // CSS pixel horizontal shift (rotation-derived)
  pitchShiftPx: number     // CSS pixel vertical shift (rotation-derived)
  dx_m: number             // lateral displacement since last reset (m)
  dy_m: number             // vertical displacement since last reset (m)
  gateOpen: boolean        // false only on the single "close" frame
}
```

When `gateOpen: false`, all numeric fields except `t` are zero — callers should
hide the ghost rather than apply a zero transform.

### Orientation-aware scanAxis selection

Inside `onGyroReading`, the pipeline calls `deps.getOrientation()` on every gyro
sample to select the scan axis:

```
orientationType.startsWith('landscape') → scanAxis = 'x'
otherwise (portrait-*)                  → scanAxis = 'y'
```

`feedGhostGyro` maps `scanAxis = 'y'` to `gy` for yaw and `gx` for pitch
(portrait default), and `scanAxis = 'x'` to `gx` for yaw and `gy` for pitch
(landscape).

Orientation logging is throttled to one event per 500 ms to avoid log spam.

---

## Contract / Interface

```ts
new GhostMotionPipeline({
  gyro: GyroLike | null
  motion?: MotionLike | null           // optional translation sensor
  getBeta?: () => number | null        // DeviceOrientationEvent.beta for accel guard
  displayWidth: () => number           // CSS pixel width (called each RAF tick)
  displayHeight: () => number          // CSS pixel height (called each RAF tick)
  getOrientation?: () => string        // defaults to screen.orientation.type
  onFrame?: (frame: GhostFrame) => void
  enableMotionGate?: boolean           // default true
  requestAnimationFrame?: ...          // injectable for tests
  cancelAnimationFrame?: ...
  now?: () => DOMHighResTimeStamp      // injectable for tests
})

pipeline.getState(): { yawRad: number; pitchRad: number }
pipeline.getTranslationState(): { dx_m: number; dy_m: number; velX: number; velY: number }
pipeline.reset()    // resets GhostOverlayState and closes gate
pipeline.openGate() // forces gateVisible = true (used in tests)
pipeline.destroy()  // cancels RAF, stops sensors, sets destroyed = true
```

---

## Acceptance Criteria

#### Scenario: onFrame called every tick when gate disabled
- **WHEN** `enableMotionGate: false` and a gyro sample arrives
- **THEN** `onFrame` is called on the next RAF tick with `gateOpen: true`

#### Scenario: Gate closes when omegaMag exceeds hide threshold
- **WHEN** `enableMotionGate: true` and `omegaMag > 0.55 rad/s`
- **THEN** `onFrame` receives a frame with `gateOpen: false` and all offsets zero

#### Scenario: Gate reopens when omegaMag drops below show threshold
- **WHEN** the gate is closed and `omegaMag ≤ 0.40 rad/s`
- **THEN** `onFrame` resumes receiving frames with `gateOpen: true`

#### Scenario: yawIntegral preserved across gate close/open cycle
- **GIVEN** the phone has accumulated 0.3 rad of yaw and the gate closes
- **WHEN** the gate reopens
- **THEN** `frame.yawRad ≈ 0.3` (integration was not reset during closure)

#### Scenario: Landscape orientation selects x scan axis
- **WHEN** `getOrientation()` returns `'landscape-primary'`
- **THEN** `feedGhostGyro` is called with `scanAxis = 'x'`

#### Scenario: destroy stops RAF and sensors
- **WHEN** `pipeline.destroy()` is called
- **THEN** `cancelAnimationFrame` is called, `gyro.stop()` is called, and no further
  `onFrame` invocations occur
