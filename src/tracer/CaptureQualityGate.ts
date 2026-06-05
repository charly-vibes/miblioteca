import { runQualityChecks, qualityWarnings } from './qualityChecks'
import type { QualityChecks, QualityWarning, QualitySensorState } from './qualityChecks'

export type QualityResult = {
  checks: QualityChecks
  warnings: QualityWarning[]
}

export class CaptureQualityGate {
  constructor(private readonly getSensorState: () => QualitySensorState) {}

  assess(frame: ImageData): QualityResult {
    const checks = runQualityChecks(frame, this.getSensorState())
    return { checks, warnings: qualityWarnings(checks) }
  }
}
