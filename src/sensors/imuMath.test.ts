import { describe, it, expect } from 'vitest'
import { rotateVec } from './imuMath'

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
