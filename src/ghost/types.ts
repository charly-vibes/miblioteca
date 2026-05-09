import type { GhostFrame } from '../sensors/ghostOverlayCanvas'

export type Phase = 'idle' | 'recording' | 'repositioning' | 'captured'

export interface SensorFrame {
  t: number
  gx: number; gy: number; gz: number
  ax: number; ay: number; az: number
}

export interface CalibrationCycle {
  id: string
  startedAt: number
  endedAt?: number
  rectangleSize: { width: number; height: number }
  startPosition: { x: number; y: number }
  algorithmPosition: { x: number; y: number }
  groundTruthPosition: { x: number; y: number }
  deltaPixels: { x: number; y: number }
  returnYawRad: number
  returnPitchRad: number
  frames: SensorFrame[]
  ghostFrames: GhostFrame[]
}

export interface CalibrationExport {
  exportedAt: string
  deviceInfo: {
    viewportWidth: number
    viewportHeight: number
    devicePixelRatio: number
    userAgent: string
  }
  hFovDeg: number
  focalLengthPx: number
  cycles: CalibrationCycle[]
}
