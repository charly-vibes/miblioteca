import type { ImuSample } from './imuTrace.js'

export type Vec3 = { x: number; y: number; z: number }
export type Quat = { x: number; y: number; z: number; w: number }

/**
 * Rotates a vector from device frame into world frame using the quaternion
 * sandwich product `q * v * q⁻¹`.
 *
 * @param q - Unit quaternion representing the device orientation in the world
 *   frame (e.g. from `DeviceOrientationEvent` / `AbsoluteOrientationSensor`).
 *   Must be normalised; behaviour is undefined for non-unit quaternions.
 * @param v - Vector expressed in the **device** frame (e.g. raw accelerometer
 *   output whose axes are fixed to the phone body).
 * @returns The same vector expressed in the **world** frame (gravity-aligned,
 *   north-east-up or sensor-convention depending on the orientation source).
 */
export function rotateVec(v: Vec3, q: Quat): Vec3 {
  const { x: qx, y: qy, z: qz, w: qw } = q
  const { x: vx, y: vy, z: vz } = v

  // t = 2 * cross(q.xyz, v)
  const tx = 2 * (qy * vz - qz * vy)
  const ty = 2 * (qz * vx - qx * vz)
  const tz = 2 * (qx * vy - qy * vx)

  return {
    x: vx + qw * tx + qy * tz - qz * ty,
    y: vy + qw * ty + qz * tx - qx * tz,
    z: vz + qw * tz + qx * ty - qy * tx,
  }
}

// `MAX_DT_S = 0.05`: caps the per-sample integration interval at 50 ms.
// When the sensor drops frames or the clock jumps, an uncapped dt would cause
// velocity and position to accumulate a runaway error proportional to the gap
// duration. 50 ms (20 Hz) is the lowest practical gyroscope rate; anything
// larger is treated as a gap and clamped.
const MAX_DT_S = 0.05

// `MAX_DISP_M = 5`: clamps the returned horizontal displacement to 5 m.
// Any single-call result exceeding this is the product of a pathological sensor
// spike rather than real motion — 5 m in 50 ms would require ~100 m/s², which
// is physically impossible for a handheld device. The clamp prevents a single
// bad sample from corrupting downstream consumers.
const MAX_DISP_M = 5

/**
 * Estimates horizontal displacement (metres) from a slice of IMU samples
 * using double-integration of gravity-subtracted acceleration (dead reckoning).
 *
 * Algorithm:
 * 1. For each consecutive sample pair, compute `dt` (seconds).
 * 2. Rotate the raw accelerometer reading into the world frame via `rotateVec`
 *    and subtract the gravity vector (`grx`/`gry`/`grz`) to obtain linear
 *    acceleration.
 * 3. Integrate acceleration → velocity, then velocity → position.
 * 4. Return the **horizontal** magnitude `sqrt(px² + py²)` only — the vertical
 *    (z) component is excluded because gravity residuals from sensor noise cause
 *    unbounded vertical drift that makes the z estimate unreliable.
 *
 * @param samples - Ordered array of IMU samples. Each sample must carry:
 *   - `t` — timestamp in milliseconds
 *   - `ax`, `ay`, `az` — raw accelerometer reading in device frame (m/s²)
 *   - `qx`, `qy`, `qz`, `qw` — device orientation as a unit quaternion
 *   - `grx`, `gry`, `grz` — gravity vector in world frame (m/s²)
 *
 * @returns Horizontal displacement magnitude in metres, clamped to `MAX_DISP_M`
 *   (5 m). Returns `0` when fewer than two samples are provided.
 */
export function estimateDisplacement(samples: ImuSample[]): number {
  if (samples.length < 2) return 0

  let vx = 0, vy = 0
  let px = 0, py = 0

  for (let i = 1; i < samples.length; i++) {
    const curr = samples[i]
    const dt = Math.min((curr.t - samples[i - 1].t) / 1000, MAX_DT_S)
    if (dt <= 0) continue

    const worldAccel = rotateVec(
      { x: curr.ax, y: curr.ay, z: curr.az },
      { x: curr.qx, y: curr.qy, z: curr.qz, w: curr.qw },
    )
    const world = { x: worldAccel.x - curr.grx, y: worldAccel.y - curr.gry, z: worldAccel.z - curr.grz }

    vx += world.x * dt
    vy += world.y * dt
    px += vx * dt
    py += vy * dt
  }

  const disp = Math.sqrt(px * px + py * py)
  return Math.min(isFinite(disp) ? disp : 0, MAX_DISP_M)
}
