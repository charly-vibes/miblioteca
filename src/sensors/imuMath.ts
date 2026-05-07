import type { ImuSample } from './imuTrace.js'

export type Vec3 = { x: number; y: number; z: number }
export type Quat = { x: number; y: number; z: number; w: number }

// Rotate vector v by unit quaternion q using the sandwich product q * v * q⁻¹.
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

const MAX_DT_S = 0.05
const MAX_DISP_M = 5

// Estimate horizontal displacement (m) from a slice of IMU samples using dead reckoning.
// Subtracts gravity via the gravity sensor fields (grx/gry/grz), rotates linear accel to
// world frame with the orientation quaternion, then double-integrates over the slice.
// dt is capped at 50ms per sample to guard against non-monotonic clocks or gaps.
// Returns horizontal magnitude sqrt(px² + py²), clamped to 5m.
export function estimateDisplacement(samples: ImuSample[]): number {
  if (samples.length < 2) return 0

  let vx = 0, vy = 0
  let px = 0, py = 0

  for (let i = 1; i < samples.length; i++) {
    const curr = samples[i]
    const dt = Math.min((curr.t - samples[i - 1].t) / 1000, MAX_DT_S)
    if (dt <= 0) continue

    const world = rotateVec(
      { x: curr.ax - curr.grx, y: curr.ay - curr.gry, z: curr.az - curr.grz },
      { x: curr.qx, y: curr.qy, z: curr.qz, w: curr.qw },
    )

    vx += world.x * dt
    vy += world.y * dt
    px += vx * dt
    py += vy * dt
  }

  const disp = Math.sqrt(px * px + py * py)
  return Math.min(isFinite(disp) ? disp : 0, MAX_DISP_M)
}
