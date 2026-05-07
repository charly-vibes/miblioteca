import { describe, it, expect } from 'vitest'
import {
  initialGhostState,
  feedGhostGyro,
  computeShiftPx,
} from './ghostOverlay'

describe('initialGhostState', () => {
  it('starts with zero yaw integral and no prior sample', () => {
    const state = initialGhostState()
    expect(state.yawIntegral).toBe(0)
    expect(state.lastT).toBe(-Infinity)
  })
})

describe('feedGhostGyro', () => {
  it('records first sample time without integrating (no dt known yet)', () => {
    const state = initialGhostState()
    const next = feedGhostGyro(state, { t: 100, gz: 1.0 })
    expect(next.lastT).toBe(100)
    expect(next.yawIntegral).toBe(0)
  })

  it('integrates gz * dt on subsequent samples', () => {
    const s0 = initialGhostState()
    const s1 = feedGhostGyro(s0, { t: 0, gz: 0 })          // first sample
    const s2 = feedGhostGyro(s1, { t: 1000, gz: 1.0 })     // +1.0 rad/s * 1s = +1.0 rad
    expect(s2.yawIntegral).toBeCloseTo(1.0)
    expect(s2.lastT).toBe(1000)
  })

  it('accumulates across multiple samples', () => {
    let s = initialGhostState()
    s = feedGhostGyro(s, { t: 0, gz: 0 })
    s = feedGhostGyro(s, { t: 500, gz: 2.0 })   // 2 rad/s * 0.5s = 1.0 rad
    s = feedGhostGyro(s, { t: 1000, gz: -1.0 }) // -1 rad/s * 0.5s = -0.5 rad
    expect(s.yawIntegral).toBeCloseTo(0.5)
  })

  it('drops out-of-order samples', () => {
    let s = initialGhostState()
    s = feedGhostGyro(s, { t: 1000, gz: 0 })
    s = feedGhostGyro(s, { t: 2000, gz: 1.0 })
    const before = s
    const next = feedGhostGyro(s, { t: 500, gz: 99 })  // stale
    expect(next).toBe(before)
  })

  it('ignores non-finite gz values', () => {
    let s = initialGhostState()
    s = feedGhostGyro(s, { t: 0, gz: 0 })
    const before = s
    const next = feedGhostGyro(s, { t: 1000, gz: NaN })
    expect(next).toBe(before)
  })

  it('ignores non-finite t values', () => {
    const s = initialGhostState()
    const next = feedGhostGyro(s, { t: NaN, gz: 1 })
    expect(next).toBe(s)
  })

  it('handles equal timestamps without dividing by zero', () => {
    let s = initialGhostState()
    s = feedGhostGyro(s, { t: 100, gz: 0 })
    const before = s
    const next = feedGhostGyro(s, { t: 100, gz: 999 })  // dt = 0 → integral unchanged
    expect(next.yawIntegral).toBe(before.yawIntegral)
    expect(next.lastT).toBe(100)
  })
})

describe('computeShiftPx', () => {
  it('returns 0 when yaw integral is 0', () => {
    expect(computeShiftPx(0, 1920)).toBeCloseTo(0)
  })

  it('returns negative shift for positive yaw (camera rotates right, overlay shifts left)', () => {
    // Positive yaw (gz > 0) = device rotates counterclockwise from user POV (camera swings right)
    // overlay should shift left (negative x) to show where previous shot was
    expect(computeShiftPx(0.1, 1920)).toBeLessThan(0)
  })

  it('is proportional to yaw integral', () => {
    const shift1 = computeShiftPx(0.1, 1920)
    const shift2 = computeShiftPx(0.2, 1920)
    expect(shift2).toBeCloseTo(shift1 * 2)
  })

  it('is proportional to video width', () => {
    const shiftNarrow = computeShiftPx(0.1, 960)
    const shiftWide = computeShiftPx(0.1, 1920)
    expect(shiftWide).toBeCloseTo(shiftNarrow * 2)
  })

  it('matches the expected formula at known values (65° hFOV)', () => {
    // shiftX = -(videoWidth/2) / tan(hFov/2) * yawIntegral
    const hFovRad = (65 * Math.PI) / 180
    const expected = -(1920 / 2) / Math.tan(hFovRad / 2) * 0.1
    expect(computeShiftPx(0.1, 1920)).toBeCloseTo(expected)
  })

  it('accepts a custom hFOV', () => {
    const shift65 = computeShiftPx(0.1, 1920, 65)
    const shift90 = computeShiftPx(0.1, 1920, 90)
    // Wider FOV → smaller focal length → smaller pixel shift per radian
    expect(Math.abs(shift90)).toBeLessThan(Math.abs(shift65))
  })

  it('clamps to +videoWidth/2 when yaw is very large positive', () => {
    expect(computeShiftPx(-100, 1920)).toBe(960)
  })

  it('clamps to -videoWidth/2 when yaw is very large negative', () => {
    expect(computeShiftPx(100, 1920)).toBe(-960)
  })

  it('does not clamp a small unclamped shift', () => {
    const shift = computeShiftPx(0.1, 1920)
    expect(Math.abs(shift)).toBeLessThan(960)
    expect(shift).toBeCloseTo(computeShiftPx(0.1, 1920))
  })
})
