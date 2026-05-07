import { laplacianVariance } from './imageProcessing.js'
import type { CaptureRecord } from './capture.js'

export type QualityChecks = CaptureRecord['qualityChecks']

export type QualitySensorState = {
  steady: boolean
  tiltDegrees: number
}

export type QualityWarning = 'blurry' | 'overexposed' | 'underexposed' | 'tilted'

export const THRESHOLDS = {
  blurry: 80,
  overexposed: 0.05,
  underexposed: 0.05,
  tilt: 15,
  lumaOverexposed: 240,
  lumaUnderexposed: 15,
  darkMeanLuma: 50,
} as const

export function runQualityChecks(imageData: ImageData, sensor: QualitySensorState): QualityChecks {
  const lv = laplacianVariance(imageData)
  const { overexposed, underexposed, meanLuma } = exposureFractions(imageData)
  return {
    laplacianVariance: lv,
    overexposedFraction: overexposed,
    underexposedFraction: underexposed,
    steadyAtCapture: sensor.steady,
    tiltDegrees: sensor.tiltDegrees,
    blurry: lv < THRESHOLDS.blurry,
    overexposed: overexposed > THRESHOLDS.overexposed,
    underexposed: underexposed > THRESHOLDS.underexposed,
    dark: meanLuma < THRESHOLDS.darkMeanLuma,
  }
}

export function qualityWarnings(checks: QualityChecks): QualityWarning[] {
  const warnings: QualityWarning[] = []
  if (checks.laplacianVariance < THRESHOLDS.blurry) warnings.push('blurry')
  if (checks.overexposedFraction > THRESHOLDS.overexposed) warnings.push('overexposed')
  if (checks.underexposedFraction > THRESHOLDS.underexposed) warnings.push('underexposed')
  if (checks.tiltDegrees > THRESHOLDS.tilt) warnings.push('tilted')
  return warnings
}

function exposureFractions(imageData: ImageData): { overexposed: number; underexposed: number; meanLuma: number } {
  const { data } = imageData
  const total = data.length / 4
  if (total === 0) return { overexposed: 0, underexposed: 0, meanLuma: 0 }
  let over = 0
  let under = 0
  let lumaSum = 0
  for (let i = 0; i < data.length; i += 4) {
    const luma = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2]
    lumaSum += luma
    if (luma > THRESHOLDS.lumaOverexposed) over++
    if (luma < THRESHOLDS.lumaUnderexposed) under++
  }
  return { overexposed: over / total, underexposed: under / total, meanLuma: lumaSum / total }
}
