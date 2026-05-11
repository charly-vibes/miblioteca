import {
  initialGhostState,
  feedGhostGyro,
  computeShiftPx,
  computeShiftPy,
  clampYawToViewport,
  motionGateVisible,
} from './ghostOverlay'
import type { GhostOverlayState, GyroSample, GyroLike, GhostFrame } from './ghostOverlay'

const MOTION_GATE_SHOW_RAD_S = 0.40
const MOTION_GATE_HIDE_RAD_S = 0.55

export type GhostMotionPipelineDeps = {
  gyro: GyroLike | null
  displayWidth: () => number
  displayHeight: () => number
  getOrientation?: () => string
  onFrame?: (frame: GhostFrame) => void
  /** false = always render (calibration page); true = apply visibility gate (shows when still, hides when moving too fast) */
  enableMotionGate?: boolean
  requestAnimationFrame?: (cb: FrameRequestCallback) => number
  cancelAnimationFrame?: (id: number) => void
  now?: () => DOMHighResTimeStamp
}

export class GhostMotionPipeline {
  private state: GhostOverlayState = initialGhostState()
  private rafId = 0
  private destroyed = false
  private gateVisible = false

  private readonly deps: Required<GhostMotionPipelineDeps>

  constructor(deps: GhostMotionPipelineDeps) {
    this.deps = {
      gyro: deps.gyro,
      displayWidth: deps.displayWidth,
      displayHeight: deps.displayHeight,
      getOrientation: deps.getOrientation ?? (() =>
        (typeof screen !== 'undefined' && screen.orientation?.type) || 'portrait-primary'),
      onFrame: deps.onFrame ?? (() => {}),
      enableMotionGate: deps.enableMotionGate ?? true,
      requestAnimationFrame: deps.requestAnimationFrame ?? ((cb) => window.requestAnimationFrame(cb)),
      cancelAnimationFrame: deps.cancelAnimationFrame ?? ((id) => window.cancelAnimationFrame(id)),
      now: deps.now ?? (() => performance.now()),
    }

    if (this.deps.gyro) {
      this.deps.gyro.onreading = () => this.onGyroReading()
      this.deps.gyro.onerror = null
      this.deps.gyro.start()
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
    const scanAxis: 'x' | 'y' = this.deps.getOrientation().startsWith('landscape') ? 'x' : 'y'
    this.state = feedGhostGyro(this.state, sample, scanAxis)
    // Clamp yaw immediately to prevent over-accumulation between RAF ticks at high gyro rates
    const clamped = clampYawToViewport(this.state.yawIntegral)
    if (clamped !== this.state.yawIntegral) {
      this.state = { ...this.state, yawIntegral: clamped }
    }
  }

  private rafLoop: FrameRequestCallback = () => {
    if (this.destroyed) return
    this.rafId = this.deps.requestAnimationFrame(this.rafLoop)

    const dw = this.deps.displayWidth()
    const dh = this.deps.displayHeight()
    const now = this.deps.now()

    if (this.deps.enableMotionGate) {
      const shouldShow = motionGateVisible(this.state.omegaMag, !this.gateVisible, MOTION_GATE_SHOW_RAD_S, MOTION_GATE_HIDE_RAD_S)
      if (!shouldShow) {
        if (this.gateVisible) {
          this.gateVisible = false
          this.state = { ...this.state, yawIntegral: 0, pitchIntegral: 0 }
          this.deps.onFrame({ t: now, yawRad: 0, pitchRad: 0, shiftPx: 0, pitchShiftPx: 0, gateOpen: false })
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
      gateOpen: true,
    })
  }

  reset() {
    this.state = initialGhostState()
    this.gateVisible = false
  }

  destroy() {
    this.destroyed = true
    this.deps.cancelAnimationFrame(this.rafId)
    if (this.deps.gyro) {
      this.deps.gyro.onreading = null
      this.deps.gyro.stop()
    }
  }
}
