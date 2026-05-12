import { describe, it, expect } from 'vitest'
import {
  initialGhostState,
  feedGhostGyro,
  feedGhostAccel,
  zeroVelocity,
  computeShiftPx,
  computeShiftPy,
  computeTranslationShiftPx,
  computeTranslationShiftPy,
  clampYawToViewport,
  motionGateVisible,
  capToViewport,
  ZUPT_TAU_S,
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

  it('matches the expected formula at known values (40° hFOV)', () => {
    // shiftX = -(videoWidth/2) / tan(hFov/2) * yawIntegral
    const hFovRad = (40 * Math.PI) / 180
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
    const hFovRad = (40 * Math.PI) / 180
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

describe('initialGhostState translation fields', () => {
  it('starts with zero velocity and displacement', () => {
    const s = initialGhostState()
    expect(s.velX).toBe(0)
    expect(s.velY).toBe(0)
    expect(s.dx_m).toBe(0)
    expect(s.dy_m).toBe(0)
  })
})

describe('feedGhostAccel', () => {
  const base = () => initialGhostState()
  const sample = (overrides: Partial<{ ax: number; ay: number; interval_ms: number; betaDeg: number; t: number; gravitySubtracted: boolean }> = {}) => ({
    ax: 0, ay: 0, interval_ms: 100, betaDeg: 90, t: 0, ...overrides,
  })

  it('integrates lateral acceleration into velocity and displacement', () => {
    const s = feedGhostAccel(base(), sample({ ax: 1.0, interval_ms: 100, t: 0 })).state
    // First sample: lastAccelT=-Infinity → dt = min(interval_ms/1000, 0.1) = 0.1s
    // velX = 0 + 1.0*0.1 = 0.1; dx_m = (0+0.1)/2 * 0.1 = 0.005
    expect(s.velX).toBeCloseTo(0.1)
    expect(s.dx_m).toBeCloseTo(0.005)
  })

  it('integrates vertical acceleration into velocity and displacement', () => {
    const s = feedGhostAccel(base(), sample({ ay: 2.0, interval_ms: 100, t: 0 })).state
    // dt = 0.1s; velY = 2.0*0.1 = 0.2; dy_m = (0+0.2)/2 * 0.1 = 0.01
    expect(s.velY).toBeCloseTo(0.2)
    expect(s.dy_m).toBeCloseTo(0.01)
  })

  it('uses trapezoidal integration (averages old and new velocity for position)', () => {
    // Two samples 100ms apart; second sample uses wallclock elapsed time
    const s1 = feedGhostAccel(base(), sample({ ax: 1.0, interval_ms: 100, t: 0 })).state
    const s2 = feedGhostAccel(s1, sample({ ax: 1.0, interval_ms: 100, t: 100 })).state
    // After s1: velX=0.1, dx=0.005
    // After s2: dt = (100-0)/1000 = 0.1s; velX=0.2, dx = 0.005 + (0.1+0.2)/2 * 0.1 = 0.02
    expect(s2.velX).toBeCloseTo(0.2)
    expect(s2.dx_m).toBeCloseTo(0.02)
  })

  it('caps first-sample dt at 100ms to guard against bogus interval_ms values', () => {
    const s = feedGhostAccel(base(), sample({ ax: 1.0, interval_ms: 5000, t: 0 })).state
    expect(s.velX).toBeCloseTo(0.1)  // first sample: dt = min(5000/1000, 0.1) = 0.1s
  })

  it('uses wallclock elapsed time for subsequent samples, not device-reported interval_ms', () => {
    const s1 = feedGhostAccel(base(), sample({ ax: 0, interval_ms: 16, t: 0 })).state
    // Second sample: wallclock says 200ms elapsed, device reports 16ms
    const s2 = feedGhostAccel(s1, sample({ ax: 1.0, interval_ms: 16, t: 200 })).state
    // dt = min((200-0)/1000, 0.5) = 0.2s — wallclock wins over 16ms interval
    expect(s2.velX).toBeCloseTo(1.0 * 0.2)
  })

  it('caps wallclock elapsed dt at 500ms to guard against phantom drift after backgrounding', () => {
    const s1 = feedGhostAccel(base(), sample({ ax: 0, t: 0 })).state
    const s2 = feedGhostAccel(s1, sample({ ax: 1.0, t: 10000 })).state  // 10s gap (app backgrounded)
    expect(s2.velX).toBeCloseTo(1.0 * 0.5)  // capped at 0.5s, not 10s
  })

  it('records lastAccelT from sample.t', () => {
    const s = feedGhostAccel(base(), sample({ t: 999 })).state
    expect(s.lastAccelT).toBe(999)
  })

  it('returns state unchanged for non-finite ax', () => {
    const s = base()
    expect(feedGhostAccel(s, sample({ ax: NaN })).state).toBe(s)
  })

  it('returns state unchanged for non-finite t', () => {
    const s = base()
    expect(feedGhostAccel(s, sample({ t: Infinity })).state).toBe(s)
  })

  it('returns state unchanged for non-finite betaDeg', () => {
    const s = base()
    expect(feedGhostAccel(s, sample({ betaDeg: Infinity })).state).toBe(s)
  })

  it('zeros velocity and skips position update when phone is near-horizontal (|beta-90| > 30)', () => {
    const sMoving = feedGhostAccel(base(), sample({ ax: 1.0, interval_ms: 100, betaDeg: 90, t: 0 })).state
    // Phone goes flat (beta=0) — gravity leaks into ax
    const sFlat = feedGhostAccel(sMoving, sample({ ax: 9.8, interval_ms: 100, betaDeg: 0, t: 100 })).state
    expect(sFlat.velX).toBe(0)
    expect(sFlat.velY).toBe(0)
    // dx_m is retained (not zeroed by the guard)
    expect(sFlat.dx_m).toBeCloseTo(sMoving.dx_m)
  })

  it('accepts beta=90 (phone upright) without zeroing', () => {
    const s = feedGhostAccel(base(), sample({ ax: 1.0, interval_ms: 100, betaDeg: 90, t: 0 })).state
    expect(s.velX).toBeGreaterThan(0)
  })

  it('accepts beta=70 (|70-90|=20 < 30) without zeroing', () => {
    const s = feedGhostAccel(base(), sample({ ax: 1.0, interval_ms: 100, betaDeg: 70, t: 0 })).state
    expect(s.velX).toBeGreaterThan(0)
  })

  it('zeros velocity but returns same state ref when velocity is already zero on horizontal guard', () => {
    const s = base()  // velX=velY=0
    const next = feedGhostAccel(s, sample({ ax: 1.0, interval_ms: 100, betaDeg: 0, t: 0 }))
    expect(next.state).toBe(s)  // same state reference since nothing changed
    expect(next.gate).toBe('tilt')
  })

  it('uses wider 45° guard for hardware-subtracted accel (betaDeg=55 passes)', () => {
    const s = feedGhostAccel(base(), sample({ ax: 1.0, interval_ms: 100, betaDeg: 55, gravitySubtracted: true, t: 0 })).state
    // |55-90|=35 > 30 (raw threshold) but ≤ 45 (hardware-subtracted threshold) → should integrate
    expect(s.velX).toBeGreaterThan(0)
  })

  it('still rejects betaDeg=44 even for hardware-subtracted accel (|44-90|=46 > 45)', () => {
    const sMoving = feedGhostAccel(base(), sample({ ax: 1.0, interval_ms: 100, betaDeg: 90, t: 0 })).state
    const s = feedGhostAccel(sMoving, sample({ ax: 1.0, interval_ms: 100, betaDeg: 44, gravitySubtracted: true, t: 100 })).state
    expect(s.velX).toBe(0)
  })

  it('keeps 30° guard for raw accel (betaDeg=55 still zeroes without gravitySubtracted)', () => {
    const sMoving = feedGhostAccel(base(), sample({ ax: 1.0, interval_ms: 100, betaDeg: 90, t: 0 })).state
    const s = feedGhostAccel(sMoving, sample({ ax: 1.0, interval_ms: 100, betaDeg: 55, t: 100 })).state
    // |55-90|=35 > 30 → raw accel threshold fires
    expect(s.velX).toBe(0)
  })

  it('preserves gyro fields (yawIntegral, omegaMag) when updating accel state', () => {
    const gyroState = { ...base(), yawIntegral: 1.5, omegaMag: 0.3 }
    const s = feedGhostAccel(gyroState, sample({ ax: 0.5, interval_ms: 100, t: 0 })).state
    expect(s.yawIntegral).toBe(1.5)
    expect(s.omegaMag).toBe(0.3)
  })

  it('skips integration when accel L2 norm is below ZUPT threshold (sensor bias guard)', () => {
    const s = feedGhostAccel(base(), sample({ ax: 0.04, ay: -0.03, interval_ms: 100, betaDeg: 90, t: 0 })).state
    expect(s.velX).toBe(0)
    expect(s.velY).toBe(0)
    expect(s.dx_m).toBe(0)
  })

  it('updates lastAccelT in dead zone so next sample computes accurate dt', () => {
    const s = base()
    const next = feedGhostAccel(s, sample({ ax: 0.04, ay: -0.03, interval_ms: 100, betaDeg: 90, t: 42 })).state
    expect(next.lastAccelT).toBe(42)
  })

  it('decays velocity (not hard-zeros) when entering ZUPT from a moving state', () => {
    const sMoving = feedGhostAccel(base(), sample({ ax: 1.0, interval_ms: 100, betaDeg: 90, t: 0 })).state
    expect(sMoving.velX).toBeGreaterThan(0)
    const sDead = feedGhostAccel(sMoving, sample({ ax: 0.01, ay: 0.01, interval_ms: 100, betaDeg: 90, t: 100 })).state
    // Velocity decays toward 0 (exponential, not hard reset) — strictly between 0 and prior value
    expect(sDead.velX).toBeGreaterThan(0)
    expect(sDead.velX).toBeLessThan(sMoving.velX)
  })

  it('integrates normally when accel L2 norm exceeds ZUPT threshold (0.11 > 0.10)', () => {
    const s = feedGhostAccel(base(), sample({ ax: 0.11, ay: 0, interval_ms: 100, betaDeg: 90, t: 0 })).state
    expect(s.velX).toBeGreaterThan(0)
  })

  it('returns gate: "pass" when integrating', () => {
    const { gate } = feedGhostAccel(base(), sample({ ax: 1.0, interval_ms: 100, t: 0 }))
    expect(gate).toBe('pass')
  })

  it('returns gate: "zupt" when accel L2 norm is below threshold', () => {
    const { gate } = feedGhostAccel(base(), sample({ ax: 0.04, ay: -0.03, betaDeg: 90, t: 0 }))
    expect(gate).toBe('zupt')
  })

  it('returns gate: "tilt" when phone is near-horizontal', () => {
    const { gate } = feedGhostAccel(base(), sample({ ax: 9.8, betaDeg: 0, t: 0 }))
    expect(gate).toBe('tilt')
  })

  it('ZUPT decay constant: after dt=tau velocity ≈ initial × exp(-1)', () => {
    // Give a large accel to build up velocity, then switch to near-zero (ZUPT)
    const sMoving = feedGhostAccel(base(), sample({ ax: 1.0, interval_ms: 100, betaDeg: 90, t: 0 })).state
    const v0 = sMoving.velX
    // tau = ZUPT_TAU_S; set dt = tau so decay = exp(-1)
    const tauMs = ZUPT_TAU_S * 1000
    const sDead = feedGhostAccel(sMoving, sample({ ax: 0.01, ay: 0.01, interval_ms: tauMs, betaDeg: 90, t: tauMs })).state
    const expected = v0 * Math.exp(-1)
    expect(sDead.velX).toBeCloseTo(expected, 5)
  })

  it('ZUPT decay never hard-zeros over 20 ticks (asymptotic, always > 0)', () => {
    const sMoving = feedGhostAccel(base(), sample({ ax: 1.0, interval_ms: 100, betaDeg: 90, t: 0 })).state
    let s = sMoving
    // Apply 20 ZUPT ticks at 20ms each; velocity should shrink but never reach 0
    for (let i = 1; i <= 20; i++) {
      const result = feedGhostAccel(s, sample({ ax: 0, ay: 0, interval_ms: 20, betaDeg: 90, t: i * 20 }))
      s = result.state
      expect(s.velX).toBeGreaterThan(0)
    }
  })
})

describe('zeroVelocity', () => {
  it('zeros velX and velY', () => {
    const s = feedGhostAccel(initialGhostState(), { ax: 1.0, ay: 2.0, interval_ms: 100, betaDeg: 90, t: 0 }).state
    const z = zeroVelocity(s)
    expect(z.velX).toBe(0)
    expect(z.velY).toBe(0)
  })

  it('retains dx_m and dy_m (position not reset on gate-close ZUPT)', () => {
    const s = feedGhostAccel(initialGhostState(), { ax: 1.0, ay: 2.0, interval_ms: 100, betaDeg: 90, t: 0 }).state
    const z = zeroVelocity(s)
    expect(z.dx_m).toBe(s.dx_m)
    expect(z.dy_m).toBe(s.dy_m)
  })

  it('returns same reference when velocity is already zero', () => {
    const s = initialGhostState()
    expect(zeroVelocity(s)).toBe(s)
  })
})

describe('computeTranslationShiftPx', () => {
  it('returns 0 when dx_m is 0', () => {
    expect(computeTranslationShiftPx(0, 0.6, 390)).toBeCloseTo(0)
  })

  it('returns negative shift when camera moves right (dx_m > 0)', () => {
    // Phone moves right → ghost moves left = negative shiftPx
    expect(computeTranslationShiftPx(0.05, 0.6, 390)).toBeLessThan(0)
  })

  it('returns positive shift when camera moves left (dx_m < 0)', () => {
    expect(computeTranslationShiftPx(-0.05, 0.6, 390)).toBeGreaterThan(0)
  })

  it('is proportional to dx_m', () => {
    const s1 = computeTranslationShiftPx(0.05, 0.6, 390)
    const s2 = computeTranslationShiftPx(0.10, 0.6, 390)
    expect(s2).toBeCloseTo(s1 * 2)
  })

  it('is inversely proportional to working distance', () => {
    const sClose = computeTranslationShiftPx(0.05, 0.3, 390)
    const sFar   = computeTranslationShiftPx(0.05, 0.6, 390)
    // Closer distance → larger apparent shift
    expect(Math.abs(sClose)).toBeGreaterThan(Math.abs(sFar))
  })

  it('returns 0 when workingDistanceM is 0 or negative (guard against divide-by-zero)', () => {
    expect(computeTranslationShiftPx(0.05, 0, 390)).toBe(0)
    expect(computeTranslationShiftPx(0.05, -1, 390)).toBe(0)
  })

  it('produces a plausible pixel shift for a realistic bookcase scan (5cm lateral, 60cm distance)', () => {
    // 5cm at 60cm = 8.3% of FOV → at 390px display: ~(390/2)/tan(32.5°) * atan(0.05/0.6) ≈ 32px
    const shift = computeTranslationShiftPx(0.05, 0.6, 390)
    expect(Math.abs(shift)).toBeGreaterThan(10)
    expect(Math.abs(shift)).toBeLessThan(100)
  })
})

describe('computeTranslationShiftPy', () => {
  it('returns 0 when dy_m is 0', () => {
    expect(computeTranslationShiftPy(0, 0.6, 390)).toBeCloseTo(0)
  })

  it('returns positive shift when camera moves up (dy_m > 0)', () => {
    // Phone moves up → shelf appears to shift down → ghost moves down = positive shiftPy
    expect(computeTranslationShiftPy(0.05, 0.6, 390)).toBeGreaterThan(0)
  })

  it('returns 0 when workingDistanceM is 0', () => {
    expect(computeTranslationShiftPy(0.05, 0, 390)).toBe(0)
  })

  it('uses the same focal length as computeTranslationShiftPx', () => {
    const px = Math.abs(computeTranslationShiftPx(0.05, 0.6, 390))
    const py = Math.abs(computeTranslationShiftPy(0.05, 0.6, 390))
    expect(px).toBeCloseTo(py)
  })
})

describe('motionGateVisible', () => {
  it('GIVEN hidden ghost and omegaMag below show threshold THEN returns true (show)', () => {
    expect(motionGateVisible(0.30, true, 0.40, 0.55)).toBe(true)
  })

  it('GIVEN hidden ghost and omegaMag above show threshold THEN returns false (stay hidden)', () => {
    expect(motionGateVisible(0.50, true, 0.40, 0.55)).toBe(false)
  })

  it('GIVEN visible ghost and omegaMag below hide threshold THEN returns true (stay visible)', () => {
    expect(motionGateVisible(0.50, false, 0.40, 0.55)).toBe(true)
  })

  it('GIVEN visible ghost and omegaMag above hide threshold THEN returns false (hide)', () => {
    expect(motionGateVisible(0.60, false, 0.40, 0.55)).toBe(false)
  })

  it('GIVEN omegaMag in hysteresis band (0.40 < omega < 0.55) THEN hidden stays hidden, visible stays visible', () => {
    const omega = 0.45
    expect(motionGateVisible(omega, true, 0.40, 0.55)).toBe(false)
    expect(motionGateVisible(omega, false, 0.40, 0.55)).toBe(true)
  })

  it('GIVEN omegaMag exactly at show threshold THEN shows (<=)', () => {
    expect(motionGateVisible(0.40, true, 0.40, 0.55)).toBe(true)
  })

  it('GIVEN omegaMag exactly at hide threshold THEN stays visible (<=)', () => {
    expect(motionGateVisible(0.55, false, 0.40, 0.55)).toBe(true)
  })
})

describe('capToViewport', () => {
  it('GIVEN clientWidth > viewport THEN returns viewport (Firefox Android workaround)', () => {
    expect(capToViewport(875, 414)).toBe(414)
  })

  it('GIVEN clientWidth <= viewport THEN returns clientWidth unchanged', () => {
    expect(capToViewport(414, 414)).toBe(414)
    expect(capToViewport(300, 414)).toBe(300)
  })

  it('GIVEN viewport is 0 (jsdom) THEN returns clientWidth uncapped', () => {
    expect(capToViewport(875, 0)).toBe(875)
  })

  it('GIVEN viewport is negative THEN returns clientWidth uncapped', () => {
    expect(capToViewport(500, -1)).toBe(500)
  })
})

describe('clampYawToViewport', () => {
  it('GIVEN yaw within bounds THEN returns unchanged', () => {
    const maxYaw = Math.tan((40 * Math.PI / 180) / 2)
    expect(clampYawToViewport(0.1)).toBe(0.1)
    expect(clampYawToViewport(maxYaw - 0.001)).toBeCloseTo(maxYaw - 0.001)
  })

  it('GIVEN yaw exceeds +tan(hFov/2) THEN clamps to maximum', () => {
    const maxYaw = Math.tan((40 * Math.PI / 180) / 2)
    expect(clampYawToViewport(100)).toBeCloseTo(maxYaw)
  })

  it('GIVEN yaw below -tan(hFov/2) THEN clamps to minimum', () => {
    const maxYaw = Math.tan((40 * Math.PI / 180) / 2)
    expect(clampYawToViewport(-100)).toBeCloseTo(-maxYaw)
  })

  it('GIVEN yaw at clamp boundary THEN computeShiftPx produces exactly ±displayWidth/2', () => {
    const displayWidth = 1920
    expect(computeShiftPx(clampYawToViewport(100), displayWidth)).toBeCloseTo(-displayWidth / 2)
    expect(computeShiftPx(clampYawToViewport(-100), displayWidth)).toBeCloseTo(displayWidth / 2)
  })

  it('GIVEN custom hFovDeg THEN clamp uses that FOV', () => {
    const maxYaw90 = Math.tan((90 * Math.PI / 180) / 2)
    const maxYaw65 = Math.tan((65 * Math.PI / 180) / 2)
    expect(clampYawToViewport(100, 90)).toBeCloseTo(maxYaw90)
    expect(clampYawToViewport(100, 65)).toBeCloseTo(maxYaw65)
    expect(maxYaw90).toBeGreaterThan(maxYaw65)
  })
})
