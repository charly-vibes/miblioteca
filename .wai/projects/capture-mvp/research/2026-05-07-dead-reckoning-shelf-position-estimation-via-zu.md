# Dead Reckoning: Shelf-Position Estimation via ZUPT-Anchored Accelerometer Integration

## Realistic Accuracy on Phone-Grade MEMS (Snapdragon 680 class)

Dominant error source is gravity subtraction error from tilt uncertainty, not accelerometer noise.

| Tilt error | Position error per 1 s interval |
|---|---|
| 0.1° (good orientation) | ~1 cm |
| 0.5° (typical hand-held) | ~4 cm |
| 1.0° (rapid motion) | ~8 cm |

With ZUPT anchors resetting velocity at each capture, error accumulates only within each inter-shot interval (0.3–2 s), not as an unbounded random walk.

Published figures: Foxlin (2005, IEEE VR) ~0.3% distance error with shoe-mounted ZUPT; phone-held systems 0.5–2% with ideal ZUPT.

## Sensor Fusion Options

| Approach | Complexity | JS lines | Verdict |
|---|---|---|---|
| Pure accel double integration | Low | ~20 | Dangerously noisy without good gravity subtraction |
| **Complementary filter (accel+gyro)** | Low-medium | ~50 | **Best trade-off for 0.5–2 s intervals** |
| Madgwick/Mahony filter | Medium | ~100 (or `ahrs` npm) | Overkill for 1–2 s; use if magnetometer needed for heading |
| EKF | High | 300+ | Not justified; ZUPT hard-reset eliminates main EKF benefit |

**Recommendation: complementary filter — but even simpler: use `GravitySensor` directly + `AbsoluteOrientationSensor` quaternion rotation, both of which are already recorded in `imuTrace`.**

## Coordinate Frame

The project already records:
- `grx/gry/grz` — `GravitySensor` (gravity component in device frame)
- `ax/ay/az` — raw accelerometer
- `qx/qy/qz/qw` — `AbsoluteOrientationSensor` quaternion

Linear acceleration in device frame: `la = rawAccel - gravityVector`
Rotate to world frame using quaternion sandwich product.
Integrate horizontal components (X+Y magnitude) — no need to know which axis is the shelf.

## Displacement Integrator (TypeScript)

```typescript
type Vec3 = { x: number; y: number; z: number }
type Quat = { x: number; y: number; z: number; w: number }

function rotateVec(v: Vec3, q: Quat): Vec3 {
  const { x: qx, y: qy, z: qz, w: qw } = q
  const { x: vx, y: vy, z: vz } = v
  const tx = 2 * (qy * vz - qz * vy)
  const ty = 2 * (qz * vx - qx * vz)
  const tz = 2 * (qx * vy - qy * vx)
  return {
    x: vx + qw * tx + (qy * tz - qz * ty),
    y: vy + qw * ty + (qz * tx - qx * tz),
    z: vz + qw * tz + (qx * ty - qy * tx),
  }
}

function estimateDisplacement(samples: ImuSample[]): number {
  if (samples.length < 2) return 0
  let vx = 0, vy = 0, px = 0, py = 0
  let prevLax = 0, prevLay = 0
  let prevT = samples[0].t

  for (let i = 1; i < samples.length; i++) {
    const s = samples[i]
    const dt = (s.t - prevT) / 1000
    if (dt <= 0 || dt > 0.1) { prevT = s.t; continue }

    const laWorld = rotateVec(
      { x: s.ax - s.grx, y: s.ay - s.gry, z: s.az - s.grz },
      { x: s.qx, y: s.qy, z: s.qz, w: s.qw }
    )
    vx += 0.5 * (prevLax + laWorld.x) * dt
    vy += 0.5 * (prevLay + laWorld.y) * dt
    px += vx * dt
    py += vy * dt
    prevLax = laWorld.x; prevLay = laWorld.y; prevT = s.t
  }
  return Math.sqrt(px * px + py * py)
}
```

## Viability at 10 cm Resolution

- **Best case** (slow walk, dense captures ~5+/m, good orientation): 2–5 cm/interval — viable.
- **Typical case**: 5–15 cm/interval — marginally useful for approximate shelf ordering.
- **Worst case** (rapid movement): 20–50 cm/interval — not actionable.

The ZUPT anchor design is already the correct architectural choice. The `motionWindow` (±100 ms) is useful for per-capture context; the full `imuTrace` slice between captures is needed for displacement.

`qualityChecks.stepCountSincePrev` already exists as a placeholder — stride-based PDR is a viable alternative that avoids double integration entirely.

## Web Sensor API Gotchas (Android Chrome)

- Android Chrome caps Generic Sensor at ~100 Hz regardless of requested frequency.
- `AbsoluteOrientationSensor` internally uses magnetometer — metal shelving can distort heading. For gravity subtraction only, use `RelativeOrientationSensor` (no magnetometer dependency).
- Sensor timestamps are `DOMHighResTimeStamp` aligned with `performance.now()` — compatible with `capturedAtMonotonic` directly.
- No runtime user permission prompt on Android (unlike iOS Safari). HTTPS required.
- Sensor callbacks pause when page is hidden — `pauseGaps` in `imuRecorder.ts` already handles this.

## JS Libraries

No library needed. Hand-roll ~60 lines using existing `imuTrace` fields. `ahrs` npm (MIT, 3.8 KB) implements Madgwick/Mahony if magnetometer integration is later needed for heading.

