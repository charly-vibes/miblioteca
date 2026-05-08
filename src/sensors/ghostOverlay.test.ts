import { describe, it, expect } from 'vitest'
import {
  initialGhostState,
  feedGhostGyro,
  computeShiftPx,
  computeShiftPy,
} from './ghostOverlay'

describe('initialGhostState', () => {
  it('starts with zero yaw and pitch integrals and no prior sample', () => {
    const state = initialGhostState()
    expect(state.yawIntegral).toBe(0)
    expect(state.pitchIntegral).toBe(0)
    expect(state.lastT).toBe(-Infinity)
  })

  it('starts with omegaMag of 0', () => {
    expect(initialGhostState().omegaMag).toBe(0)
  })
})

describe('feedGhostGyro', () => {
  it('records first sample time without integrating (no dt known yet)', () => {
    const state = initialGhostState()
    const next = feedGhostGyro(state, { t: 100, gx: 0, gy: -1.0, gz: 0 })
    expect(next.lastT).toBe(100)
    expect(next.yawIntegral).toBe(0)
  })

  it('integrates -gy * dt on subsequent samples (portrait pan uses device-y axis)', () => {
    const s0 = initialGhostState()
    const s1 = feedGhostGyro(s0, { t: 0, gx: 0, gy: 0, gz: 0 })          // first sample
    const s2 = feedGhostGyro(s1, { t: 200, gx: 0, gy: -5.0, gz: 0 })     // gy=-5.0 rad/s → -(-5)*0.2 = +1.0 rad
    expect(s2.yawIntegral).toBeCloseTo(1.0)
    expect(s2.lastT).toBe(200)
  })

  it('clamps dt to 500ms so stale lastT does not cause a large yaw spike', () => {
    const s0 = initialGhostState()
    const s1 = feedGhostGyro(s0, { t: 0, gx: 0, gy: 0, gz: 0 })
    // 10 second gap (e.g. gyro resumed after pause): dt clamped to 0.5s, not 10s
    const s2 = feedGhostGyro(s1, { t: 10000, gx: 0, gy: -2.0, gz: 0 })
    expect(s2.yawIntegral).toBeCloseTo(1.0)    // -(-2.0) * 0.5 = 1.0, not 20.0
  })

  it('accumulates across multiple samples', () => {
    let s = initialGhostState()
    s = feedGhostGyro(s, { t: 0, gx: 0, gy: 0, gz: 0 })
    s = feedGhostGyro(s, { t: 500, gx: 0, gy: -2.0, gz: 0 }) // -(-2)*0.5 = +1.0 rad
    s = feedGhostGyro(s, { t: 1000, gx: 0, gy: 1.0, gz: 0 }) // -(1)*0.5  = -0.5 rad
    expect(s.yawIntegral).toBeCloseTo(0.5)
  })

  it('drops out-of-order samples', () => {
    let s = initialGhostState()
    s = feedGhostGyro(s, { t: 1000, gx: 0, gy: 0, gz: 0 })
    s = feedGhostGyro(s, { t: 2000, gx: 0, gy: -1.0, gz: 0 })
    const before = s
    const next = feedGhostGyro(s, { t: 500, gx: 0, gy: 99, gz: 0 })  // stale
    expect(next).toBe(before)
  })

  it('ignores non-finite gy values', () => {
    let s = initialGhostState()
    s = feedGhostGyro(s, { t: 0, gx: 0, gy: 0, gz: 0 })
    const before = s
    const next = feedGhostGyro(s, { t: 1000, gx: 0, gy: NaN, gz: 0 })
    expect(next).toBe(before)
  })

  it('ignores non-finite t values', () => {
    const s = initialGhostState()
    const next = feedGhostGyro(s, { t: NaN, gx: 0, gy: -1, gz: 0 })
    expect(next).toBe(s)
  })

  it('handles equal timestamps without dividing by zero', () => {
    let s = initialGhostState()
    s = feedGhostGyro(s, { t: 100, gx: 0, gy: 0, gz: 0 })
    const before = s
    const next = feedGhostGyro(s, { t: 100, gx: 0, gy: -999, gz: 0 })  // dt = 0 → integral unchanged
    expect(next.yawIntegral).toBe(before.yawIntegral)
    expect(next.lastT).toBe(100)
  })

  it('tracks omegaMag from all three axes', () => {
    // gx=0.3, gy=0.4, gz=0 → |ω| = sqrt(0.09+0.16) = 0.5
    const s = feedGhostGyro(initialGhostState(), { t: 100, gx: 0.3, gy: 0.4, gz: 0 })
    expect(s.omegaMag).toBeCloseTo(0.5)
  })

  it('updates omegaMag even on first sample', () => {
    const s = feedGhostGyro(initialGhostState(), { t: 100, gx: 0, gy: -1.0, gz: 0 })
    expect(s.omegaMag).toBeCloseTo(1.0)
  })

  it('integrates gx instead of gy when scanAxis is "x" (landscape orientation)', () => {
    const s0 = initialGhostState()
    const s1 = feedGhostGyro(s0, { t: 0, gx: 0, gy: 0, gz: 0 }, 'x')
    const s2 = feedGhostGyro(s1, { t: 200, gx: -5.0, gy: 0, gz: 0 }, 'x') // gx=-5.0 → -(-5)*0.2 = +1.0 rad
    expect(s2.yawIntegral).toBeCloseTo(1.0)
  })

  it('accumulates pitchIntegral from gx in portrait mode (tilt up = positive pitch)', () => {
    const s0 = initialGhostState()
    const s1 = feedGhostGyro(s0, { t: 0, gx: 0, gy: 0, gz: 0 })           // first sample
    const s2 = feedGhostGyro(s1, { t: 200, gx: 3.0, gy: 0, gz: 0 })       // gx=3.0 → +3.0*0.2 = +0.6 rad
    expect(s2.pitchIntegral).toBeCloseTo(0.6)
    expect(s2.yawIntegral).toBeCloseTo(0)                                   // gy=0, no horizontal movement
  })

  it('accumulates pitchIntegral from gy in landscape mode', () => {
    const s0 = initialGhostState()
    const s1 = feedGhostGyro(s0, { t: 0, gx: 0, gy: 0, gz: 0 }, 'x')
    const s2 = feedGhostGyro(s1, { t: 200, gx: 0, gy: 3.0, gz: 0 }, 'x') // gy=3.0 → pitch axis in landscape
    expect(s2.pitchIntegral).toBeCloseTo(0.6)
    expect(s2.yawIntegral).toBeCloseTo(0)
  })

  it('produces a plausible pixel shift at a realistic scanning rate (debug log baseline)', () => {
    // Debug log shows gy ≈ −0.35 rad/s during real scanning; verify the result is on-screen-visible
    const s0 = initialGhostState()
    const s1 = feedGhostGyro(s0, { t: 0, gx: 0, gy: 0, gz: 0 })
    const s2 = feedGhostGyro(s1, { t: 200, gx: 0, gy: -0.35, gz: 0 }) // yawIntegral ≈ 0.07 rad
    expect(s2.yawIntegral).toBeCloseTo(0.07)
    // At 1920px, 65° hFOV: shift ≈ −106px — clearly visible and not clamped
    const shift = computeShiftPx(s2.yawIntegral, 1920)
    expect(Math.abs(shift)).toBeGreaterThan(50)
    expect(Math.abs(shift)).toBeLessThan(200)
  })
})

describe('computeShiftPx', () => {
  it('returns 0 when yaw integral is 0', () => {
    expect(computeShiftPx(0, 1920)).toBeCloseTo(0)
  })

  it('returns negative shift for positive yawIntegral (camera swept right, overlay shifts left)', () => {
    // Camera sweeps right → gy < 0 → yawIntegral > 0 → negative shift (ghost moves left, appears fixed in space)
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

describe('computeShiftPy', () => {
  it('returns 0 when pitch integral is 0', () => {
    expect(computeShiftPy(0, 1920, 1080)).toBeCloseTo(0)
  })

  it('returns positive shift for positive pitchIntegral (tilt up → ghost moves down)', () => {
    expect(computeShiftPy(0.1, 1920, 1080)).toBeGreaterThan(0)
  })

  it('uses the same focal length as computeShiftPx', () => {
    // focal = (displayWidth/2) / tan(hFov/2); shiftY = focal * pitchIntegral
    const hFovRad = (65 * Math.PI) / 180
    const focal = (1920 / 2) / Math.tan(hFovRad / 2)
    expect(computeShiftPy(0.1, 1920, 1080)).toBeCloseTo(focal * 0.1)
  })

  it('clamps to +displayHeight/2 when pitch is very large positive', () => {
    expect(computeShiftPy(100, 1920, 1080)).toBe(540)
  })

  it('clamps to -displayHeight/2 when pitch is very large negative', () => {
    expect(computeShiftPy(-100, 1920, 1080)).toBe(-540)
  })
})
