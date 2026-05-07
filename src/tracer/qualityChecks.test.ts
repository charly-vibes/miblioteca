import { describe, it, expect } from 'vitest'
import { runQualityChecks, qualityWarnings, THRESHOLDS } from './qualityChecks.js'

function makeImageData(
  width: number,
  height: number,
  fill: (i: number) => [number, number, number, number]
): ImageData {
  const data = new Uint8ClampedArray(width * height * 4)
  for (let i = 0; i < width * height; i++) {
    const [r, g, b, a] = fill(i)
    data[i * 4] = r
    data[i * 4 + 1] = g
    data[i * 4 + 2] = b
    data[i * 4 + 3] = a
  }
  return { data, width, height, colorSpace: 'srgb' } as unknown as ImageData
}

const steadySensor = { steady: true, tiltDegrees: 0 }

describe('runQualityChecks', () => {
  it('returns zero laplacianVariance for a uniform image', () => {
    const img = makeImageData(10, 10, () => [128, 128, 128, 255])
    expect(runQualityChecks(img, steadySensor).laplacianVariance).toBe(0)
  })

  it('returns positive laplacianVariance for a high-contrast (checkerboard) image', () => {
    // Alternating black/white pixels produce high Laplacian response
    const img = makeImageData(10, 10, (i) => {
      const x = i % 10
      const y = Math.floor(i / 10)
      return (x + y) % 2 === 0 ? [255, 255, 255, 255] : [0, 0, 0, 255]
    })
    expect(runQualityChecks(img, steadySensor).laplacianVariance).toBeGreaterThan(THRESHOLDS.blurry)
  })

  it('passes steady and tiltDegrees through from sensor', () => {
    const img = makeImageData(10, 10, () => [128, 128, 128, 255])
    const result = runQualityChecks(img, { steady: false, tiltDegrees: 20 })
    expect(result.steadyAtCapture).toBe(false)
    expect(result.tiltDegrees).toBe(20)
  })

  it('measures overexposed fraction (luma > 250)', () => {
    // first 10 of 100 pixels are fully white → 10%
    const img = makeImageData(10, 10, (i) => (i < 10 ? [255, 255, 255, 255] : [128, 128, 128, 255]))
    expect(runQualityChecks(img, steadySensor).overexposedFraction).toBeCloseTo(0.1)
  })

  it('measures underexposed fraction (luma < 5)', () => {
    // first 20 of 100 pixels are fully black → 20%
    const img = makeImageData(10, 10, (i) => (i < 20 ? [0, 0, 0, 255] : [128, 128, 128, 255]))
    expect(runQualityChecks(img, steadySensor).underexposedFraction).toBeCloseTo(0.2)
  })

  it('returns zero fractions for empty image data', () => {
    const img = { data: new Uint8ClampedArray(0), width: 0, height: 0 } as unknown as ImageData
    const result = runQualityChecks(img, steadySensor)
    expect(result.overexposedFraction).toBe(0)
    expect(result.underexposedFraction).toBe(0)
  })
})

describe('runQualityChecks boolean flags', () => {
  function makeCheckerboard(size = 10) {
    return makeImageData(size, size, (i) => {
      const x = i % size; const y = Math.floor(i / size)
      return (x + y) % 2 === 0 ? [255, 255, 255, 255] : [0, 0, 0, 255]
    })
  }

  it('sets blurry: true for a uniform image', () => {
    const img = makeImageData(10, 10, () => [128, 128, 128, 255])
    expect(runQualityChecks(img, steadySensor).blurry).toBe(true)
  })

  it('sets blurry: false for a high-contrast image', () => {
    expect(runQualityChecks(makeCheckerboard(), steadySensor).blurry).toBe(false)
  })

  it('sets overexposed: true when >5% pixels have luma > 250', () => {
    // 10 of 100 pixels fully white → 10%
    const img = makeImageData(10, 10, (i) => i < 10 ? [255, 255, 255, 255] : [128, 128, 128, 255])
    expect(runQualityChecks(img, steadySensor).overexposed).toBe(true)
  })

  it('sets overexposed: false for a normal image', () => {
    const img = makeImageData(10, 10, () => [128, 128, 128, 255])
    expect(runQualityChecks(img, steadySensor).overexposed).toBe(false)
  })

  it('sets underexposed: true when >5% pixels have luma < 5', () => {
    const img = makeImageData(10, 10, (i) => i < 10 ? [0, 0, 0, 255] : [128, 128, 128, 255])
    expect(runQualityChecks(img, steadySensor).underexposed).toBe(true)
  })

  it('sets underexposed: false for a normal image', () => {
    const img = makeImageData(10, 10, () => [128, 128, 128, 255])
    expect(runQualityChecks(img, steadySensor).underexposed).toBe(false)
  })

  it('sets dark: true when mean luma < 50', () => {
    // luma(20,20,20) ≈ 20 < 50
    const img = makeImageData(10, 10, () => [20, 20, 20, 255])
    expect(runQualityChecks(img, steadySensor).dark).toBe(true)
  })

  it('sets dark: false for a mid-bright image', () => {
    const img = makeImageData(10, 10, () => [128, 128, 128, 255])
    expect(runQualityChecks(img, steadySensor).dark).toBe(false)
  })

  it('detects near-blown pixel (luma 241) as overexposed at new threshold', () => {
    // R=G=B=241 → luma = 241; > 240 (new clip) but ≤ 250 (old clip)
    const img = makeImageData(10, 10, () => [241, 241, 241, 255])
    expect(runQualityChecks(img, steadySensor).overexposed).toBe(true)
  })

  it('detects crushed-shadow pixel (luma 14) as underexposed at new threshold', () => {
    // R=G=B=14 → luma = 14; < 15 (new floor) but ≥ 5 (old floor)
    const img = makeImageData(10, 10, () => [14, 14, 14, 255])
    expect(runQualityChecks(img, steadySensor).underexposed).toBe(true)
  })
})

describe('qualityWarnings', () => {
  const base = {
    laplacianVariance: THRESHOLDS.blurry,
    overexposedFraction: 0,
    underexposedFraction: 0,
    steadyAtCapture: true,
    tiltDegrees: 0,
    blurry: false,
    overexposed: false,
    underexposed: false,
    dark: false,
  }

  it('returns empty for a good shot', () => {
    expect(qualityWarnings(base)).toEqual([])
  })

  it('warns blurry when laplacianVariance < threshold', () => {
    expect(qualityWarnings({ ...base, laplacianVariance: THRESHOLDS.blurry - 1 })).toContain('blurry')
  })

  it('does not warn blurry at exactly the threshold', () => {
    expect(qualityWarnings({ ...base, laplacianVariance: THRESHOLDS.blurry })).not.toContain('blurry')
  })

  it('warns overexposed when fraction > threshold', () => {
    expect(qualityWarnings({ ...base, overexposedFraction: THRESHOLDS.overexposed + 0.01 })).toContain('overexposed')
  })

  it('does not warn overexposed at exactly the threshold', () => {
    expect(qualityWarnings({ ...base, overexposedFraction: THRESHOLDS.overexposed })).not.toContain('overexposed')
  })

  it('warns underexposed when fraction > threshold', () => {
    expect(qualityWarnings({ ...base, underexposedFraction: THRESHOLDS.underexposed + 0.01 })).toContain('underexposed')
  })

  it('does not warn underexposed at exactly the threshold', () => {
    expect(qualityWarnings({ ...base, underexposedFraction: THRESHOLDS.underexposed })).not.toContain('underexposed')
  })

  it('warns tilted when tiltDegrees > threshold', () => {
    expect(qualityWarnings({ ...base, tiltDegrees: THRESHOLDS.tilt + 1 })).toContain('tilted')
  })

  it('does not warn tilted at exactly the threshold', () => {
    expect(qualityWarnings({ ...base, tiltDegrees: THRESHOLDS.tilt })).not.toContain('tilted')
  })

  it('can return multiple warnings simultaneously', () => {
    const w = qualityWarnings({
      ...base,
      laplacianVariance: 0,
      overexposedFraction: 0.1,
      tiltDegrees: 20,
    })
    expect(w).toContain('blurry')
    expect(w).toContain('overexposed')
    expect(w).toContain('tilted')
  })
})
