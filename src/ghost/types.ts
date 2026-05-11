import type { GhostFrame } from '../sensors/ghostOverlayCanvas'

export type Phase = 'idle' | 'recording' | 'repositioning' | 'captured'

export interface SensorFrame {
  t: number
  gx: number; gy: number; gz: number
  ax: number; ay: number; az: number
  // accel pipeline state — only present on motion frames
  betaDeg?: number | null
  gate?: 'pass' | 'zupt' | 'tilt' | 'beta-null'
  velX?: number
  velY?: number
  dx_cm?: number
  dy_cm?: number
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
  startSnapshot?: string | null
  endSnapshot?: string | null
}

export interface CalibrationExport {
  exportedAt: string
  deviceInfo: {
    viewportWidth: number
    viewportHeight: number
    devicePixelRatio: number
    userAgent: string
  }
  orientation?: string
  hFovDeg: number
  focalLengthPx: number
  cycles: CalibrationCycle[]
}
