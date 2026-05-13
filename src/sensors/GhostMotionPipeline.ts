import {
  initialGhostState,
  feedGhostGyro,
  feedGhostAccel,
  computeShiftPx,
  computeShiftPy,
  clampYawToViewport,
  motionGateVisible,
  zeroVelocity,
  computeOrientationDelta,
  initialOrientationState,
} from './ghostOverlay'
import type {
  GhostOverlayState, GyroSample, GyroLike, MotionLike, OrientationLike,
  GhostFrame, OrientationTrackingState,
} from './ghostOverlay'
import type { TuningConfig } from '../ghost/tuningConfig'

type DeviceOrientationSample = { alpha: number; beta: number; gamma: number }
import { debugLogger } from '../debug/logger'

export type GhostMotionPipelineDeps = {
  gyro: GyroLike | null
  motion?: MotionLike | null
  orientation?: OrientationLike | null
  getBeta?: () => number | null
  displayWidth: () => number
  displayHeight: () => number
  getOrientation?: () => DeviceOrientationSample | null
  getScreenOrientation?: () => string
  onFrame?: (frame: GhostFrame) => void
  onGyroSample?: (state: { yawRad: number; pitchRad: number }) => void
  enableMotionGate?: boolean
  requestAnimationFrame?: (cb: FrameRequestCallback) => number
  cancelAnimationFrame?: (id: number) => void
  now?: () => DOMHighResTimeStamp
  logger?: { log(...args: unknown[]): void }
  tuning?: TuningConfig
}

export class GhostMotionPipeline {
  private state: GhostOverlayState = initialGhostState()
  private rafId = 0
  private destroyed = false
  private gateVisible = false
  private orientationState: OrientationTrackingState | null = null
  private activeModel: 'gyro' | 'absolute' = 'gyro'

  private readonly deps: Required<GhostMotionPipelineDeps>
  private lastOrientationLogMs = 0

  constructor(deps: GhostMotionPipelineDeps) {
    this.deps = {
      gyro: deps.gyro,
      motion: deps.motion ?? null,
      orientation: deps.orientation ?? null,
      getBeta: deps.getBeta ?? (() => null),
      displayWidth: deps.displayWidth,
      displayHeight: deps.displayHeight,
      getOrientation: deps.getOrientation ?? (() => null),
      getScreenOrientation: deps.getScreenOrientation ?? (() =>
        (typeof screen !== 'undefined' && screen.orientation?.type) || 'portrait-primary'),
      onFrame: deps.onFrame ?? (() => {}),
      onGyroSample: deps.onGyroSample ?? ((_s) => {}),
      enableMotionGate: deps.enableMotionGate ?? true,
      requestAnimationFrame: deps.requestAnimationFrame ?? ((cb) => window.requestAnimationFrame(cb)),
      cancelAnimationFrame: deps.cancelAnimationFrame ?? ((id) => window.cancelAnimationFrame(id)),
      now: deps.now ?? (() => performance.now()),
      logger: deps.logger ?? debugLogger,
      tuning: deps.tuning ?? undefined as unknown as TuningConfig,
    }

    this.activeModel = this.deps.tuning?.orientationModel ?? 'gyro'

    if (this.deps.gyro) {
      this.deps.gyro.onreading = () => this.onGyroReading()
      this.deps.gyro.onerror = (e: Event) => {
        this.deps.logger.log('ghost:gyro-error', { message: (e as ErrorEvent).message ?? 'sensor error' })
      }
      this.deps.gyro.start()
    }

    if (this.deps.motion) {
      this.deps.motion.onreading = () => this.onMotionReading()
      this.deps.motion.start()
    }

    this.rafId = this.deps.requestAnimationFrame(this.rafLoop)
  }

  private get tuning(): TuningConfig | undefined {
    return this.deps.tuning || undefined
  }

  private onGyroReading() {
    const gyro = this.deps.gyro!
    const now = this.deps.now()
    const sample: GyroSample = {
      t: gyro.timestamp ?? now,
      gx: gyro.x ?? 0,
      gy: gyro.y ?? 0,
      gz: gyro.z ?? 0,
    }

    const model = this.tuning?.orientationModel ?? 'gyro'

    if (model === 'gyro') {
      const orientationType = this.deps.getScreenOrientation()
      const scanAxis: 'x' | 'y' = orientationType.startsWith('landscape') ? 'x' : 'y'
      this.state = feedGhostGyro(this.state, sample, scanAxis)
      const hFov = this.tuning?.hFovDeg
      const clamped = clampYawToViewport(this.state.yawIntegral, hFov)
      if (clamped !== this.state.yawIntegral) {
        this.state = { ...this.state, yawIntegral: clamped }
      }
    } else {
      const omegaMag = Math.sqrt(sample.gx ** 2 + sample.gy ** 2 + sample.gz ** 2)
      this.state = { ...this.state, omegaMag, lastT: sample.t }
    }

    const sinceLastLog = now - this.lastOrientationLogMs
    if (this.lastOrientationLogMs === 0 || sinceLastLog >= 500) {
      this.deps.logger.log('sensor:orientation-sample', {
        gx: sample.gx, gy: sample.gy, gz: sample.gz, omegaMag: this.state.omegaMag,
      })
      this.lastOrientationLogMs = now
    }
    this.deps.onGyroSample(this.getState())
  }

  private onMotionReading() {
    const motion = this.deps.motion!
    const now = this.deps.now()
    const betaDeg = this.deps.getBeta() ?? 90
    const accelCfg = this.tuning
      ? { zuptThresholdMs2: this.tuning.zuptThresholdMs2, zuptTauS: this.tuning.zuptTauS }
      : undefined
    const { state } = feedGhostAccel(this.state, {
      ax: motion.x ?? 0,
      ay: motion.y ?? 0,
      betaDeg,
      interval_ms: motion.interval,
      t: now,
      gravitySubtracted: motion.gravitySubtracted,
    }, accelCfg)
    this.state = state
  }

  private rafLoop: FrameRequestCallback = () => {
    if (this.destroyed) return
    this.rafId = this.deps.requestAnimationFrame(this.rafLoop)

    if (!this.deps.gyro && this.deps.enableMotionGate && !this.gateVisible) return

    const model = this.tuning?.orientationModel ?? 'gyro'
    if (model !== this.activeModel) {
      this.activeModel = model
      this.orientationState = null
      this.state = initialGhostState()
    }

    const dw = this.deps.displayWidth()
    const dh = this.deps.displayHeight()
    const now = this.deps.now()
    const hFov = this.tuning?.hFovDeg

    if (this.deps.enableMotionGate) {
      const showT = this.tuning?.motionGateShowRadS
      const hideT = this.tuning?.motionGateHideRadS
      const shouldShow = motionGateVisible(this.state.omegaMag, !this.gateVisible, showT, hideT)
      if (!shouldShow) {
        if (this.gateVisible) {
          this.gateVisible = false
          this.state = zeroVelocity(this.state)
          this.deps.onFrame({ t: now, yawRad: 0, pitchRad: 0, shiftPx: 0, pitchShiftPx: 0, dx_m: 0, dy_m: 0, gateOpen: false })
        }
        return
      }
      this.gateVisible = true
    }

    if (model === 'absolute') {
      const ori = this.deps.getOrientation()
      if (ori) {
        if (!this.orientationState) {
          this.orientationState = initialOrientationState(ori.alpha, ori.beta, ori.gamma, now)
        }
        const result = computeOrientationDelta(this.orientationState, {
          alphaDeg: ori.alpha, betaDeg: ori.beta, gammaDeg: ori.gamma,
          gyroMag: this.state.omegaMag, nowMs: now,
        }, this.tuning)
        this.orientationState = result.state
        this.state = { ...this.state, yawIntegral: result.yaw, pitchIntegral: result.pitch }
      }
    }

    const clampedYaw = clampYawToViewport(this.state.yawIntegral, hFov)
    if (clampedYaw !== this.state.yawIntegral) {
      this.state = { ...this.state, yawIntegral: clampedYaw }
    }

    const shiftPx = computeShiftPx(this.state.yawIntegral, dw, hFov)
    const shiftPy = computeShiftPy(this.state.pitchIntegral, dw, dh, hFov)

    this.deps.onFrame({
      t: now,
      yawRad: this.state.yawIntegral,
      pitchRad: this.state.pitchIntegral,
      shiftPx,
      pitchShiftPx: shiftPy,
      dx_m: this.state.dx_m,
      dy_m: this.state.dy_m,
      gateOpen: true,
    })
  }

  getState(): { yawRad: number; pitchRad: number } {
    return { yawRad: this.state.yawIntegral, pitchRad: this.state.pitchIntegral }
  }

  getTranslationState(): { dx_m: number; dy_m: number; velX: number; velY: number } {
    return { dx_m: this.state.dx_m, dy_m: this.state.dy_m, velX: this.state.velX, velY: this.state.velY }
  }

  reset() {
    this.state = initialGhostState()
    this.orientationState = null
    this.gateVisible = false
  }

  openGate() {
    this.gateVisible = true
  }

  destroy() {
    this.destroyed = true
    this.deps.cancelAnimationFrame(this.rafId)
    if (this.deps.gyro) {
      this.deps.gyro.onreading = null
      this.deps.gyro.stop()
    }
    if (this.deps.motion) {
      this.deps.motion.onreading = null
      this.deps.motion.stop()
    }
  }
}
