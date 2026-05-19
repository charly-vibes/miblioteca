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
  rawOrientationYawPitch,
  shortestAngle,
  STILL_THRESHOLD,
  STILL_EMA_ALPHA,
  STILL_GAIN,
  MOVING_GAIN,
  STILLNESS_GATE_THRESHOLD,
  ABSOLUTE_FRESHNESS_MS,
  MAX_SHIFT_RATE_RAD_S,
} from './ghostOverlay'
import type {
  GhostOverlayState, GyroSample, GyroLike, MotionLike, OrientationLike,
  GhostFrame, OrientationTrackingState, OrientationSource,
} from './ghostOverlay'
import type { OrientationModel, TuningConfig } from '../shared/tuningConfig'

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
  private activeModel: OrientationModel = 'gyro'
  private lastAbsoluteFreshMs = -Infinity

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

    if (model === 'gyro' || model === 'hybrid') {
      const orientationType = this.deps.getScreenOrientation()
      const scanAxis: 'x' | 'y' = orientationType.startsWith('landscape') ? 'x' : 'y'
      const gyroCfg = this.tuning ? { gyroSensitivity: this.tuning.gyroSensitivity } : undefined
      this.state = feedGhostGyro(this.state, sample, scanAxis, gyroCfg)
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
      ? {
          zuptThresholdMs2: this.tuning.zuptThresholdMs2,
          zuptTauS: this.tuning.zuptTauS,
          tiltMaxDeg: this.tuning.tiltMaxDeg,
          translationSensitivity: this.tuning.translationSensitivity,
        }
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
      this.lastAbsoluteFreshMs = -Infinity
      // Reset orientation integrals but preserve translation state.
      this.state = {
        ...initialGhostState(),
        velX: this.state.velX,
        velY: this.state.velY,
        dx_m: this.state.dx_m,
        dy_m: this.state.dy_m,
        lastAccelT: this.state.lastAccelT,
      }
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
          this.deps.onFrame({ t: now, yawRad: 0, pitchRad: 0, shiftPx: 0, pitchShiftPx: 0, dx_m: 0, dy_m: 0, gateOpen: false, orientationSource: this.resolveOrientationSource() })
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
    } else if (model === 'hybrid') {
      // Complementary filter: yaw_out = yaw_gyro + α · shortestAngle(yaw_abs − yaw_gyro).
      // See openspec/changes/add-hybrid-ghost-orientation/design.md (Fusion formula).
      const ori = this.deps.getOrientation()
      if (ori) {
        const isStaleReturn = now - this.lastAbsoluteFreshMs > ABSOLUTE_FRESHNESS_MS
        if (!this.orientationState || isStaleReturn) {
          // First fresh sample or absolute resumed after a >300 ms gap: re-seed
          // the reference quaternion so we never correct against stale geometry.
          this.orientationState = initialOrientationState(ori.alpha, ori.beta, ori.gamma, now)
          this.lastAbsoluteFreshMs = now
        } else {
          const { yaw: yawAbs, pitch: pitchAbs } = rawOrientationYawPitch(
            this.orientationState.qRef, ori.alpha, ori.beta, ori.gamma,
          )
          const st = this.tuning?.stillThreshold ?? STILL_THRESHOLD
          const ema = this.tuning?.stillEmaAlpha ?? STILL_EMA_ALPHA
          const sg = this.tuning?.stillGain ?? STILL_GAIN
          const mg = this.tuning?.movingGain ?? MOVING_GAIN
          const sgt = this.tuning?.stillnessGateThreshold ?? STILLNESS_GATE_THRESHOLD
          const isStill = this.state.omegaMag < st ? 1 : 0
          const stillness = ema * this.orientationState.stillness + (1 - ema) * isStill
          const alpha = stillness > sgt ? sg : mg
          const msr = this.tuning?.maxShiftRateRadS ?? MAX_SHIFT_RATE_RAD_S
          const dt = Math.min(Math.max((now - this.orientationState.lastT) / 1000, 0), 0.1)
          const maxStep = msr * dt
          const yawDelta = alpha * shortestAngle(yawAbs - this.state.yawIntegral)
          const pitchDelta = alpha * shortestAngle(pitchAbs - this.state.pitchIntegral)
          const yaw = this.state.yawIntegral + Math.max(-maxStep, Math.min(maxStep, yawDelta))
          const pitch = this.state.pitchIntegral + Math.max(-maxStep, Math.min(maxStep, pitchDelta))
          this.orientationState = { ...this.orientationState, stillness, prevYaw: yaw, prevPitch: pitch, lastT: now }
          this.state = { ...this.state, yawIntegral: yaw, pitchIntegral: pitch }
          this.lastAbsoluteFreshMs = now
        }
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
      orientationSource: this.resolveOrientationSource(),
    })
  }

  private resolveOrientationSource(): OrientationSource {
    const model = this.tuning?.orientationModel ?? 'gyro'
    if (model === 'gyro') return 'gyro'
    if (model === 'absolute') return 'absolute'
    // hybrid: classify by which input is currently available
    if (!this.deps.gyro) return 'hybrid-fallback-absolute'
    if (this.lastAbsoluteFreshMs < 0) return 'hybrid-fallback-gyro'
    return 'hybrid'
  }

  getState(): { yawRad: number; pitchRad: number } {
    return { yawRad: this.state.yawIntegral, pitchRad: this.state.pitchIntegral }
  }

  /** Current gyro angular-rate magnitude (rad/s); 0 when no gyro source is wired. */
  getOmegaMag(): number {
    return this.state.omegaMag
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
