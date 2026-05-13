import type { TuningConfig } from '../ghost/tuningConfig'
import { DeviceMotionGyroAdapter } from './deviceMotionAdapter'
import type { GhostMotionPipelineDeps } from './GhostMotionPipeline'
import type { GhostFrame, GyroLike, MotionLike } from './ghostOverlay'

type DeviceOrientationSample = { alpha: number; beta: number; gamma: number }

type GyroscopeConstructor = new (options: { frequency: number }) => GyroLike

export type GhostPipelineWindow = {
  addEventListener: (type: string, cb: EventListenerOrEventListenerObject) => void
  removeEventListener: (type: string, cb: EventListenerOrEventListenerObject) => void
  Gyroscope?: GyroscopeConstructor
  DeviceMotionEvent?: typeof DeviceMotionEvent
}

export type GhostPipelineOptions = {
  win: GhostPipelineWindow
  gyro?: GyroLike | null
  motion?: MotionLike | null
  getDisplayWidth: () => number
  getDisplayHeight: () => number
  getScreenOrientation?: () => string
  enableMotionGate?: boolean
  tuning?: TuningConfig
  onFrame?: (frame: GhostFrame) => void
  onGyroSample?: (state: { yawRad: number; pitchRad: number }) => void
  requestAnimationFrame?: (cb: FrameRequestCallback) => number
  cancelAnimationFrame?: (id: number) => void
  now?: () => DOMHighResTimeStamp
  logger?: { log(...args: unknown[]): void }
}

export type CreatedGhostPipelineDeps = GhostMotionPipelineDeps & {
  dispose: () => void
}

export function createGhostPipelineDeps(options: GhostPipelineOptions): CreatedGhostPipelineDeps {
  let betaDeg: number | null = null
  let latestOrientation: DeviceOrientationSample | null = null

  const orientationHandler = (ev: Event) => {
    const e = ev as DeviceOrientationEvent
    betaDeg = e.beta
    if (e.alpha != null && e.beta != null && e.gamma != null) {
      latestOrientation = { alpha: e.alpha, beta: e.beta, gamma: e.gamma }
    }
  }
  options.win.addEventListener('deviceorientation', orientationHandler)

  return {
    gyro: options.gyro === undefined ? createGyro(options.win) : options.gyro,
    motion: options.motion ?? null,
    getBeta: () => betaDeg,
    displayWidth: options.getDisplayWidth,
    displayHeight: options.getDisplayHeight,
    getOrientation: () => latestOrientation,
    getScreenOrientation: options.getScreenOrientation,
    onFrame: options.onFrame,
    onGyroSample: options.onGyroSample,
    enableMotionGate: options.enableMotionGate ?? true,
    requestAnimationFrame: options.requestAnimationFrame,
    cancelAnimationFrame: options.cancelAnimationFrame,
    now: options.now,
    logger: options.logger,
    tuning: options.tuning,
    dispose: () => {
      options.win.removeEventListener('deviceorientation', orientationHandler)
    },
  }
}

function createGyro(win: GhostPipelineWindow): GyroLike | null {
  if (typeof win.Gyroscope === 'function') {
    try {
      return new win.Gyroscope({ frequency: 60 })
    } catch {
      // Fall through to DeviceMotionEvent adapter when permission or construction fails.
    }
  }

  if (typeof win.DeviceMotionEvent !== 'undefined') {
    return new DeviceMotionGyroAdapter(win as unknown as Window)
  }

  return null
}
