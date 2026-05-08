import { initialGhostState, feedGhostGyro, computeShiftPx } from './ghostOverlay'
import type { GhostOverlayState, GyroSample } from './ghostOverlay'
import { debugLogger } from '../debug/logger'

export type GyroLike = {
  onreading: (() => void) | null
  onerror: ((e: Event) => void) | null
  x: number | null
  y: number | null
  z: number | null
  timestamp: DOMHighResTimeStamp | null
  start(): void
  stop(): void
}

export type GhostOverlayCanvasDeps = {
  gyro: GyroLike | null
  requestAnimationFrame?: (cb: FrameRequestCallback) => number
  cancelAnimationFrame?: (id: number) => void
  now?: () => DOMHighResTimeStamp
}

const MOTION_GATE_RAD_S = 0.5

export class GhostOverlayCanvas {
  private readonly canvas: HTMLCanvasElement
  private readonly ctx: CanvasRenderingContext2D
  private state: GhostOverlayState = initialGhostState()
  private rafId = 0
  private currentShiftPx = 0
  private hasSnapshot = false
  private destroyed = false
  private firstRafFired = false
  private lastOrientationLogMs = 0
  private readonly deps: Required<GhostOverlayCanvasDeps>

  constructor(viewfinder: HTMLElement, deps: GhostOverlayCanvasDeps) {
    this.deps = {
      gyro: deps.gyro,
      requestAnimationFrame: deps.requestAnimationFrame ?? ((cb) => window.requestAnimationFrame(cb)),
      cancelAnimationFrame: deps.cancelAnimationFrame ?? ((id) => window.cancelAnimationFrame(id)),
      now: deps.now ?? (() => performance.now()),
    }

    this.canvas = document.createElement('canvas')
    this.canvas.className = 'ghost-overlay'
    this.canvas.hidden = true
    this.canvas.setAttribute('aria-hidden', 'true')
    viewfinder.append(this.canvas)

    const ctx = this.canvas.getContext('2d')
    if (!ctx) throw new Error('Canvas 2D context unavailable')
    this.ctx = ctx

    if (this.deps.gyro) {
      this.deps.gyro.onreading = () => this.onGyroReading()
      this.deps.gyro.onerror = null
      this.deps.gyro.start()
    }

    this.rafId = this.deps.requestAnimationFrame(this.rafLoop)
    debugLogger.log('ghost:created', {})
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
    this.state = feedGhostGyro(this.state, sample)
    const sinceLastLog = now - this.lastOrientationLogMs
    if (this.lastOrientationLogMs === 0 || sinceLastLog >= 2000) {
      debugLogger.log('sensor:orientation-sample', { gx: sample.gx, gy: sample.gy, gz: sample.gz })
      this.lastOrientationLogMs = now
    }
  }

  private rafLoop: FrameRequestCallback = () => {
    if (this.destroyed) return
    this.rafId = this.deps.requestAnimationFrame(this.rafLoop)
    if (!this.firstRafFired) {
      this.firstRafFired = true
      debugLogger.log('ghost:render-tick', {})
    }

    const shouldShow = this.hasSnapshot && this.state.omegaMag <= MOTION_GATE_RAD_S
    if (this.canvas.hidden !== !shouldShow) {
      this.canvas.hidden = !shouldShow
    }
    if (this.canvas.hidden) return

    const shiftPx = computeShiftPx(this.state.yawIntegral, this.canvas.width)
    if (shiftPx !== this.currentShiftPx) {
      this.canvas.style.transform = `translate3d(${shiftPx}px, 0, 0)`
      this.currentShiftPx = shiftPx
    }
  }

  // Call after each capture to draw the thumbnail and reset yaw accumulation.
  // Pass null when grabFrame() fails — previous snapshot is retained unchanged.
  setSnapshot(imageBitmap: ImageBitmap | null) {
    debugLogger.log('ghost:reference-frame-set', { hasImageData: imageBitmap != null })
    if (imageBitmap == null) return
    this.canvas.width = imageBitmap.width
    this.canvas.height = imageBitmap.height
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height)
    this.ctx.drawImage(imageBitmap, 0, 0)
    this.state = initialGhostState()
    this.currentShiftPx = 0
    this.canvas.style.transform = 'translate3d(0, 0, 0)'
    this.hasSnapshot = true
    this.canvas.hidden = false
  }

  // Call when the camera session ends or the view unmounts.
  destroy() {
    this.destroyed = true
    this.deps.cancelAnimationFrame(this.rafId)
    this.deps.gyro?.stop()
    this.canvas.remove()
    debugLogger.log('ghost:destroyed', {})
  }
}
