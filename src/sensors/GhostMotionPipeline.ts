import {
  initialGhostState,
  feedGhostGyro,
  feedGhostAccel,
  computeShiftPx,
  computeShiftPy,
  clampYawToViewport,
  motionGateVisible,
  zeroVelocity,
  initialOrientationState,
  computeOrientationDelta,
  MOTION_GATE_SHOW_RAD_S,
  MOTION_GATE_HIDE_RAD_S,
} from './ghostOverlay'
import type { GhostOverlayState, GyroSample, GyroLike, MotionLike, OrientationLike, OrientationTrackingState, GhostFrame } from './ghostOverlay'

type DeviceOrientationSample = { alpha: number; beta: number; gamma: number }
import { debugLogger } from '../debug/logger'

export type GhostMotionPipelineDeps = {
  gyro: GyroLike | null
  motion?: MotionLike | null
  orientation?: OrientationLike | null
  /** Returns current DeviceOrientationEvent.beta (tilt angle 0=flat, 90=upright). Used by feedGhostAccel. */
  getBeta?: () => number | null
  displayWidth: () => number
  displayHeight: () => number
  /** Returns the latest absolute device orientation sample from DeviceOrientationEvent. */
  getOrientation?: () => DeviceOrientationSample | null
  /** Returns the current screen orientation type (portrait-primary, landscape-primary, ...). */
  getScreenOrientation?: () => string
  onFrame?: (frame: GhostFrame) => void
  /** Called after each gyro reading with current yaw/pitch. Use instead of monkey-patching gyro.onreading. */
  onGyroSample?: (state: { yawRad: number; pitchRad: number }) => void
  /** false = always render (calibration page); true = apply visibility gate (shows when still, hides when moving too fast) */
  enableMotionGate?: boolean
  requestAnimationFrame?: (cb: FrameRequestCallback) => number
  cancelAnimationFrame?: (id: number) => void
  now?: () => DOMHighResTimeStamp
  logger?: { log(...args: unknown[]): void }
}

export class GhostMotionPipeline {
  private state: GhostOverlayState = initialGhostState()
  private orientationState: OrientationTrackingState | null = null
  private currentOrientation: DeviceOrientationSample | null = null
  private rafId = 0
  private destroyed = false
  private gateVisible = false

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
    }

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

    if (this.deps.orientation) {
      this.deps.orientation.onreading = () => this.onOrientationReading()
      this.deps.orientation.start()
    }

    this.rafId = this.deps.requestAnimationFrame(this.rafLoop)
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

    const hasAbsoluteOrientation = this.orientationState !== null || this.deps.getOrientation() !== null || this.currentOrientation !== null
    if (hasAbsoluteOrientation) {
      // Absolute orientation active: gyro only updates omegaMag for motion gate / stillness detection
      const omegaMag = Math.sqrt(sample.gx ** 2 + sample.gy ** 2 + sample.gz ** 2)
      this.state = { ...this.state, omegaMag, lastT: sample.t }
    } else {
      // Fallback: full gyro integration (v1)
      const orientationType = this.deps.getScreenOrientation()
      const scanAxis: 'x' | 'y' = orientationType.startsWith('landscape') ? 'x' : 'y'
      this.state = feedGhostGyro(this.state, sample, scanAxis)
      const clamped = clampYawToViewport(this.state.yawIntegral)
      if (clamped !== this.state.yawIntegral) {
        this.state = { ...this.state, yawIntegral: clamped }
      }
    }

    const sinceLastLog = now - this.lastOrientationLogMs
    if (this.lastOrientationLogMs === 0 || sinceLastLog >= 500) {
      this.deps.logger.log('sensor:orientation-sample', { gx: sample.gx, gy: sample.gy, gz: sample.gz, omegaMag: this.state.omegaMag })
      this.lastOrientationLogMs = now
    }
    this.deps.onGyroSample(this.getState())
  }

  private onOrientationReading() {
    const ori = this.deps.orientation!
    const alpha = ori.alpha
    const beta = ori.beta
    const gamma = ori.gamma
    if (alpha == null || beta == null || gamma == null) return
    this.currentOrientation = { alpha, beta, gamma }

    if (!this.orientationState) {
      this.orientationState = initialOrientationState(alpha, beta, gamma, this.deps.now())
      return
    }

    const { yaw, pitch, state } = computeOrientationDelta(this.orientationState, {
      alphaDeg: alpha,
      betaDeg: beta,
      gammaDeg: gamma,
      gyroMag: this.state.omegaMag,
      nowMs: this.deps.now(),
    })
    this.orientationState = state
    this.state = { ...this.state, yawIntegral: yaw, pitchIntegral: pitch }

    const clamped = clampYawToViewport(this.state.yawIntegral)
    if (clamped !== this.state.yawIntegral) {
      this.state = { ...this.state, yawIntegral: clamped }
    }
  }

  private refreshAbsoluteOrientation() {
    const sample = this.deps.getOrientation() ?? this.currentOrientation
    if (!sample) return

    this.currentOrientation = sample
    if (!this.orientationState) {
      this.orientationState = initialOrientationState(sample.alpha, sample.beta, sample.gamma, this.deps.now())
      return
    }

    const { yaw, pitch, state } = computeOrientationDelta(this.orientationState, {
      alphaDeg: sample.alpha,
      betaDeg: sample.beta,
      gammaDeg: sample.gamma,
      gyroMag: this.state.omegaMag,
      nowMs: this.deps.now(),
    })
    this.orientationState = state
    this.state = { ...this.state, yawIntegral: yaw, pitchIntegral: pitch }

    const clamped = clampYawToViewport(this.state.yawIntegral)
    if (clamped !== this.state.yawIntegral) {
      this.state = { ...this.state, yawIntegral: clamped }
    }
  }

  private onMotionReading() {
    const motion = this.deps.motion!
    const now = this.deps.now()
    const betaDeg = this.deps.getBeta() ?? 90
    const { state } = feedGhostAccel(this.state, {
      ax: motion.x ?? 0,
      ay: motion.y ?? 0,
      betaDeg,
      interval_ms: motion.interval,
      t: now,
      gravitySubtracted: motion.gravitySubtracted,
    })
    this.state = state
  }

  private rafLoop: FrameRequestCallback = () => {
    if (this.destroyed) return
    this.rafId = this.deps.requestAnimationFrame(this.rafLoop)

    // No sensor attached and gate hasn't been manually opened — nothing useful to emit
    if (!this.deps.gyro && this.deps.enableMotionGate && !this.gateVisible) return

    const dw = this.deps.displayWidth()
    const dh = this.deps.displayHeight()
    const now = this.deps.now()

    this.refreshAbsoluteOrientation()

    if (this.deps.enableMotionGate) {
      const shouldShow = motionGateVisible(this.state.omegaMag, !this.gateVisible, MOTION_GATE_SHOW_RAD_S, MOTION_GATE_HIDE_RAD_S)
      if (!shouldShow) {
        if (this.gateVisible) {
          this.gateVisible = false
          // Do NOT reset yawIntegral/pitchIntegral here — the sensor keeps integrating
          // while the gate is closed so that when it reopens the ghost shows the correct
          // position relative to the last capture, not relative to the gate-close moment.
          // But velX/velY SHALL be hard-zeroed (spec: ZUPT on gate close).
          this.state = zeroVelocity(this.state)
          this.deps.onFrame({ t: now, yawRad: 0, pitchRad: 0, shiftPx: 0, pitchShiftPx: 0, dx_m: 0, dy_m: 0, gateOpen: false })
        }
        return
      }
      this.gateVisible = true
    }

    const clampedYaw = clampYawToViewport(this.state.yawIntegral)
    if (clampedYaw !== this.state.yawIntegral) {
      this.state = { ...this.state, yawIntegral: clampedYaw }
    }

    const shiftPx = computeShiftPx(this.state.yawIntegral, dw)
    const shiftPy = computeShiftPy(this.state.pitchIntegral, dw, dh)

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
    this.currentOrientation = this.deps.getOrientation() ?? this.currentOrientation
    this.orientationState = this.currentOrientation
      ? initialOrientationState(this.currentOrientation.alpha, this.currentOrientation.beta, this.currentOrientation.gamma, this.deps.now())
      : null
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
    if (this.deps.orientation) {
      this.deps.orientation.onreading = null
      this.deps.orientation.stop()
    }
  }
}
