import { describe, it, expect } from 'vitest'
import { CaptureQualityGate } from './CaptureQualityGate'

function makeImageData(width: number, height: number, fill: number): ImageData {
  const data = new Uint8ClampedArray(width * height * 4).fill(fill)
  return { data, width, height, colorSpace: 'srgb' } as ImageData
}

const steadySensorState = () => ({ steady: true, tiltDegrees: 0 })

describe('CaptureQualityGate', () => {
  it('returns blurry warning for uniform gray frame', () => {
    const gate = new CaptureQualityGate(steadySensorState)
    const frame = makeImageData(4, 4, 128)
    const result = gate.assess(frame)
    expect(result.warnings).toContain('blurry')
    expect(result.checks.blurry).toBe(true)
  })

  it('returns overexposed warning for all-white frame', () => {
    const gate = new CaptureQualityGate(steadySensorState)
    const frame = makeImageData(4, 4, 255)
    const result = gate.assess(frame)
    expect(result.warnings).toContain('overexposed')
    expect(result.checks.overexposed).toBe(true)
  })

  it('returns tilted warning when tilt exceeds threshold', () => {
    const gate = new CaptureQualityGate(() => ({ steady: true, tiltDegrees: 20 }))
    const frame = makeImageData(4, 4, 128)
    const result = gate.assess(frame)
    expect(result.warnings).toContain('tilted')
  })

  it('records sensor steady state in checks', () => {
    const gate = new CaptureQualityGate(() => ({ steady: false, tiltDegrees: 0 }))
    const frame = makeImageData(4, 4, 128)
    const result = gate.assess(frame)
    expect(result.checks.steadyAtCapture).toBe(false)
  })

  it('checks and warnings are consistent', () => {
    const gate = new CaptureQualityGate(steadySensorState)
    const frame = makeImageData(4, 4, 128)
    const result = gate.assess(frame)
    for (const w of result.warnings) {
      if (w === 'blurry') expect(result.checks.blurry).toBe(true)
      if (w === 'overexposed') expect(result.checks.overexposed).toBe(true)
      if (w === 'underexposed') expect(result.checks.underexposed).toBe(true)
    }
  })
})
