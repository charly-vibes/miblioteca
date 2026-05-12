import { describe, expect, it } from 'vitest'
import { countSignFlips, evaluateGhostCapture, hasOscillation } from './ghostCaptureGate'

describe('ghostCaptureGate', () => {
  it('allows the first capture even when the ghost is not yet visible', () => {
    const decision = evaluateGhostCapture({
      captureIndex: 0,
      ghost: { shiftPx: 34, shiftPy: -4, visible: false, workingDistanceCm: 60 },
      recentShiftXs: [],
    })
    expect(decision.allowed).toBe(true)
  })

  it('blocks later captures when the ghost is hidden', () => {
    const decision = evaluateGhostCapture({
      captureIndex: 1,
      ghost: { shiftPx: 4, shiftPy: 2, visible: false, workingDistanceCm: 60 },
      recentShiftXs: [3],
    })
    expect(decision).toMatchObject({ allowed: false, reason: 'hidden' })
  })

  it('blocks later captures when horizontal error is too large', () => {
    const decision = evaluateGhostCapture({
      captureIndex: 1,
      ghost: { shiftPx: 26, shiftPy: 1, visible: true, workingDistanceCm: 60 },
      recentShiftXs: [4],
    })
    expect(decision).toMatchObject({ allowed: false, reason: 'large-horizontal-error' })
  })

  it('blocks later captures when recent shifts oscillate left-right-left-right', () => {
    const decision = evaluateGhostCapture({
      captureIndex: 4,
      ghost: { shiftPx: -30, shiftPy: 1, visible: true, workingDistanceCm: 60 },
      recentShiftXs: [35, -38, 33],
    })
    expect(decision).toMatchObject({ allowed: false, reason: 'oscillation' })
    expect(decision.recentSignFlips).toBe(3)
  })

  it('allows centered captures that continue in the same direction', () => {
    const decision = evaluateGhostCapture({
      captureIndex: 3,
      ghost: { shiftPx: 6, shiftPy: -2, visible: true, workingDistanceCm: 60 },
      recentShiftXs: [18, 12, 8],
    })
    expect(decision).toMatchObject({ allowed: true, reason: null })
  })

  it('counts sign flips while ignoring zeros', () => {
    expect(countSignFlips([30, 0, -31, 0, 29, -28])).toBe(3)
  })

  it('requires large alternating values before flagging oscillation', () => {
    expect(hasOscillation([10, -12, 11, -13])).toBe(false)
    expect(hasOscillation([30, -32, 31, -29])).toBe(true)
  })
})
