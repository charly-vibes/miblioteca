import { describe, it, expect } from 'vitest'
import { rotateVec, estimateDisplacement } from './imuMath'
import type { ImuSample } from './imuTrace'

describe('rotateVec', () => {
  const identity = { x: 0, y: 0, z: 0, w: 1 }

  it('identity quaternion returns the same vector', () => {
    const v = rotateVec({ x: 1, y: 2, z: 3 }, identity)
    expect(v.x).toBeCloseTo(1)
    expect(v.y).toBeCloseTo(2)
    expect(v.z).toBeCloseTo(3)
  })

  it('90° yaw (z-axis CCW) maps +X to +Y', () => {
    // q = (0, 0, sin(π/4), cos(π/4))
    const s = Math.SQRT1_2
    const q = { x: 0, y: 0, z: s, w: s }
    const v = rotateVec({ x: 1, y: 0, z: 0 }, q)
    expect(v.x).toBeCloseTo(0)
    expect(v.y).toBeCloseTo(1)
    expect(v.z).toBeCloseTo(0)
  })

  it('90° pitch (x-axis) maps +Y to +Z', () => {
    const s = Math.SQRT1_2
    const q = { x: s, y: 0, z: 0, w: s }
    const v = rotateVec({ x: 0, y: 1, z: 0 }, q)
    expect(v.x).toBeCloseTo(0)
    expect(v.y).toBeCloseTo(0)
    expect(v.z).toBeCloseTo(1)
  })

  it('90° roll (y-axis) maps +Z to +X', () => {
    const s = Math.SQRT1_2
    const q = { x: 0, y: s, z: 0, w: s }
    const v = rotateVec({ x: 0, y: 0, z: 1 }, q)
    expect(v.x).toBeCloseTo(1)
    expect(v.y).toBeCloseTo(0)
    expect(v.z).toBeCloseTo(0)
  })

  it('180° yaw maps +X to -X', () => {
    const q = { x: 0, y: 0, z: 1, w: 0 }
    const v = rotateVec({ x: 1, y: 0, z: 0 }, q)
    expect(v.x).toBeCloseTo(-1)
    expect(v.y).toBeCloseTo(0)
    expect(v.z).toBeCloseTo(0)
  })

  it('zero vector stays zero under any rotation', () => {
    const s = Math.SQRT1_2
    const q = { x: s, y: 0, z: 0, w: s }
    const v = rotateVec({ x: 0, y: 0, z: 0 }, q)
    expect(v.x).toBeCloseTo(0)
    expect(v.y).toBeCloseTo(0)
    expect(v.z).toBeCloseTo(0)
  })
})

describe('estimateDisplacement', () => {
  const identity: Pick<ImuSample, 'qx'|'qy'|'qz'|'qw'|'gx'|'gy'|'gz'> = { qx: 0, qy: 0, qz: 0, qw: 1, gx: 0, gy: 0, gz: 0 }
  const noGravity: Pick<ImuSample, 'grx'|'gry'|'grz'> = { grx: 0, gry: 0, grz: 0 }

  function s(t: number, ax: number, ay: number, az = 0, grz = 0): ImuSample {
    return { t, ax, ay, az, ...identity, ...noGravity, grz }
  }

  it('returns 0 for empty array', () => {
    expect(estimateDisplacement([])).toBe(0)
  })

  it('returns 0 for single sample', () => {
    expect(estimateDisplacement([s(0, 0, 0)])).toBe(0)
  })

  it('returns near 0 for stationary (gravity fully subtracted)', () => {
    // Total accel = gravity; gravity sensor = same → linear accel ≈ 0
    const stationary: ImuSample[] = [
      { t: 0,   ax: 0, ay: 0, az: 9.81, ...identity, grx: 0, gry: 0, grz: 9.81 },
      { t: 100, ax: 0, ay: 0, az: 9.81, ...identity, grx: 0, gry: 0, grz: 9.81 },
      { t: 200, ax: 0, ay: 0, az: 9.81, ...identity, grx: 0, gry: 0, grz: 9.81 },
    ]
    expect(estimateDisplacement(stationary)).toBeCloseTo(0, 5)
  })

  it('caps dt at 50ms for large timestamp gaps', () => {
    // 10-second gap between samples — without cap would produce huge displacement
    const samples = [s(0, 2, 0), s(10000, 2, 0)]
    const result = estimateDisplacement(samples)
    // With 50ms dt cap: v = 2*0.05 = 0.1 m/s, x = 0.1*0.05 = 0.005 m
    expect(result).toBeLessThan(0.01)
  })

  it('skips samples with non-positive dt (out-of-order or duplicate timestamps)', () => {
    const samples = [s(100, 5, 0), s(50, 5, 0)]  // reversed order
    expect(estimateDisplacement(samples)).toBe(0)
  })

  it('caps total displacement at 5 m to guard against runaway from tilt', () => {
    const samples = Array.from({ length: 200 }, (_, i) => s(i * 100, 100, 0))
    expect(estimateDisplacement(samples)).toBe(5)
  })

  it('constant 1 m/s² horizontal acceleration for 1 s → ≈ 0.5 m', () => {
    // 101 samples × 10ms steps = 1 second total
    const samples = Array.from({ length: 101 }, (_, i) => s(i * 10, 1, 0))
    expect(estimateDisplacement(samples)).toBeCloseTo(0.5, 1)
  })

  it('stationary device at 90° pitch subtracts world-frame gravity correctly → ≈ 0 m', () => {
    // Device tilted 90° pitch (front pointing up): gravity appears along device +Y axis.
    // GravitySensor gives gravity in world frame: grz = 9.81 (gravity is -Z in world).
    // Correct fix: rotate ax/ay/az to world frame first, then subtract grx/gry/grz.
    // Bug: subtracts world-frame grz from device-frame az (wrong frame) → huge spurious accel.
    const s90 = Math.SQRT1_2
    const q90pitch = { qx: s90, qy: 0, qz: 0, qw: s90 }
    const stationary90: ImuSample[] = Array.from({ length: 21 }, (_, i) => ({
      t: i * 10,
      ax: 0, ay: 9.81, az: 0,
      gx: 0, gy: 0, gz: 0,
      ...q90pitch,
      grx: 0, gry: 0, grz: 9.81,
    }))
    expect(estimateDisplacement(stationary90)).toBeCloseTo(0, 2)
  })
})
