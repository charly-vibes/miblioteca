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
