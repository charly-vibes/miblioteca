## Overview

`DeviceMotionGyroAdapter` wraps the browser `DeviceMotionEvent` API to produce a
`GyroLike` interface compatible with `GhostMotionPipeline`.  It exists specifically
to handle Firefox Android, which assigns `DeviceMotionEvent.rotationRate` axes
differently from the W3C specification and from the `Gyroscope` API.

The file also exports `DeviceMotionAccelAdapter` (implements `AccelerometerLike`)
and `DeviceMotionLinearAccelAdapter` (implements `MotionLike`) for translation
tracking.

---

## Behavior

### DeviceMotionGyroAdapter — axis mapping

Firefox Android (non-standard) assigns `rotationRate` as follows:

| `rotationRate` field | Physical axis | Maps to `GyroLike` field | Used by |
|---|---|---|---|
| `alpha` | Vertical tilt (X device axis, pitch) | `x` | `feedGhostGyro` pitch |
| `beta` | Horizontal pan (Y device axis, yaw) | `y` | `feedGhostGyro` yaw |
| `gamma` | In-plane rotation (Z device axis, roll) | `z` | unused |

This is the reverse of the W3C `Gyroscope` API where `x`/`y`/`z` map to pitch/yaw/roll
by device geometry.  The adapter re-labels the axes so that `feedGhostGyro` can treat
`(x, y, z)` uniformly: portrait mode picks `gy` (y) as the yaw scan axis and `gx` (x)
as the pitch axis.

### DEG_TO_RAD conversion

`rotationRate` values are in degrees per second in the `DeviceMotionEvent` API.
`GyroLike` and `feedGhostGyro` expect radians per second.

The adapter applies `DEG_TO_RAD = Math.PI / 180` to each axis on every event:

```ts
this.x = r?.alpha != null ? r.alpha * DEG_TO_RAD : null
this.y = r?.beta  != null ? r.beta  * DEG_TO_RAD : null
this.z = r?.gamma != null ? r.gamma * DEG_TO_RAD : null
```

If a field is `null` (sensor not supported), the corresponding `GyroLike` property
remains `null`.  `feedGhostGyro` treats null as `0` via `gyro.x ?? 0`.

### start / stop lifecycle

```ts
adapter.start()  // registers 'devicemotion' listener on window
adapter.stop()   // removes the same listener
```

`GhostMotionPipeline` calls `gyro.start()` inside its constructor immediately after
assigning `onreading` and `onerror`.  It calls `gyro.stop()` inside `destroy()`.
The adapter does not auto-start; callers are responsible for the lifecycle.

`timestamp` is set to `DeviceMotionEvent.timeStamp` (a `DOMHighResTimeStamp`) on
every event, making it compatible with the `t: gyro.timestamp ?? now` pattern in
`GhostMotionPipeline.onGyroReading`.

---

## DeviceMotionAccelAdapter

`DeviceMotionAccelAdapter` implements `AccelerometerLike` (used by `imuRecorder`).
It reads `DeviceMotionEvent.accelerationIncludingGravity` — always including gravity
— and exposes `x`, `y`, `z` in m/s².

This adapter is a fallback recording tool, not used in the live ghost overlay path.

---

## DeviceMotionLinearAccelAdapter

`DeviceMotionLinearAccelAdapter` implements `MotionLike` for translation tracking
in `GhostMotionPipeline`.

**Gravity subtraction strategy:**
1. Prefer `DeviceMotionEvent.acceleration` (hardware gravity-subtracted).
2. Fall back to `DeviceMotionEvent.accelerationIncludingGravity` when
   `acceleration` is `null` (common on Firefox Android).

```ts
const a = e.acceleration ?? e.accelerationIncludingGravity
this.usingRawAccel = !e.acceleration
```

The `gravitySubtracted` getter returns `!this.usingRawAccel`.  `feedGhostAccel`
reads this to choose the beta-tilt guard: 45° for hardware-subtracted, 30° for raw.

`interval` is set from `DeviceMotionEvent.interval` on each event; if the browser
reports `0` (unknown), it defaults to `16` ms (~60 Hz).

---

## Contract / Interface

```ts
class DeviceMotionGyroAdapter implements GyroLike {
  onreading: (() => void) | null
  onerror:   ((e: Event) => void) | null
  x: number | null        // pitch rate, rad/s (alpha * DEG_TO_RAD)
  y: number | null        // yaw rate,   rad/s (beta  * DEG_TO_RAD)
  z: number | null        // roll rate,  rad/s (gamma * DEG_TO_RAD) — unused
  timestamp: DOMHighResTimeStamp | null
  start(): void
  stop(): void
}

class DeviceMotionLinearAccelAdapter implements MotionLike {
  onreading: (() => void) | null
  x: number | null          // lateral acceleration, m/s²
  y: number | null          // vertical acceleration, m/s²
  interval: number          // ms between events (default 16)
  usingRawAccel: boolean    // true when falling back to accelerationIncludingGravity
  get gravitySubtracted(): boolean   // = !usingRawAccel
  start(): void
  stop(): void
}
```

---

## Acceptance Criteria

#### Scenario: Alpha maps to x (pitch) in rad/s
- **WHEN** `DeviceMotionEvent.rotationRate.alpha = 180` (deg/s)
- **THEN** `adapter.x === Math.PI` (rad/s)

#### Scenario: Beta maps to y (yaw) in rad/s
- **WHEN** `DeviceMotionEvent.rotationRate.beta = 90` (deg/s)
- **THEN** `adapter.y === Math.PI / 2` (rad/s)

#### Scenario: Null rotationRate field produces null on adapter
- **WHEN** `DeviceMotionEvent.rotationRate.alpha` is `null`
- **THEN** `adapter.x === null`

#### Scenario: start registers listener, stop removes it
- **WHEN** `adapter.start()` is called and then `adapter.stop()`
- **THEN** `onreading` fires only during the interval between calls

#### Scenario: LinearAccelAdapter prefers gravity-subtracted acceleration
- **WHEN** `DeviceMotionEvent.acceleration` is non-null
- **THEN** `adapter.usingRawAccel === false` and `gravitySubtracted === true`

#### Scenario: LinearAccelAdapter falls back to accelerationIncludingGravity
- **WHEN** `DeviceMotionEvent.acceleration` is `null`
- **THEN** `adapter.usingRawAccel === true` and `gravitySubtracted === false`

#### Scenario: LinearAccelAdapter interval defaults to 16 when browser reports 0
- **WHEN** `DeviceMotionEvent.interval === 0`
- **THEN** `adapter.interval === 16`
