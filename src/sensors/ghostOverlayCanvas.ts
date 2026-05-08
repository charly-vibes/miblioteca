import { initialGhostState, feedGhostGyro, computeShiftPx, computeShiftPy } from './ghostOverlay'
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
  private readonly viewfinder: HTMLElement
  private state: GhostOverlayState = initialGhostState()
  private rafId = 0
  private currentShiftPx = 0
  private currentShiftPy = 0
  private hasSnapshot = false
  private destroyed = false
  private firstRafFired = false
  private lastOrientationLogMs = 0
  private lastShiftLogMs = 0
  private readonly deps: Required<GhostOverlayCanvasDeps>

  constructor(viewfinder: HTMLElement, deps: GhostOverlayCanvasDeps) {
    this.viewfinder = viewfinder
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
    const orientationType = (typeof screen !== 'undefined' && screen.orientation?.type) || 'portrait-primary'
    const scanAxis: 'x' | 'y' = orientationType.startsWith('landscape') ? 'x' : 'y'
    this.state = feedGhostGyro(this.state, sample, scanAxis)
    const sinceLastLog = now - this.lastOrientationLogMs
    if (this.lastOrientationLogMs === 0 || sinceLastLog >= 500) {
      debugLogger.log('sensor:orientation-sample', { gx: sample.gx, gy: sample.gy, gz: sample.gz, scanAxis, omegaMag: this.state.omegaMag })
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
      debugLogger.log('ghost:visibility-changed', { visible: shouldShow, omegaMag: this.state.omegaMag, yawIntegral: this.state.yawIntegral })
    }
    if (this.canvas.hidden) return

    // Use CSS display dimensions so shifts are in CSS pixels, not bitmap pixels.
    const displayWidth = this.viewfinder.clientWidth || this.canvas.width
    const displayHeight = this.viewfinder.clientHeight || this.canvas.height
    const shiftPx = computeShiftPx(this.state.yawIntegral, displayWidth)
    const shiftPy = computeShiftPy(this.state.pitchIntegral, displayWidth, displayHeight)
    if (shiftPx !== this.currentShiftPx || shiftPy !== this.currentShiftPy) {
      this.canvas.style.transform = `translate3d(${shiftPx}px, ${shiftPy}px, 0)`
      this.currentShiftPx = shiftPx
      this.currentShiftPy = shiftPy
    }

    const now = this.deps.now()
    if (now - this.lastShiftLogMs >= 500) {
      debugLogger.log('ghost:shift', { shiftPx, shiftPy, yawIntegral: this.state.yawIntegral, pitchIntegral: this.state.pitchIntegral, displayWidth, displayHeight })
      this.lastShiftLogMs = now
    }
  }

  // Call after each capture to draw the thumbnail and reset yaw/pitch accumulation.
  // Pass null when grabFrame() fails — previous snapshot is retained unchanged.
  setSnapshot(imageBitmap: ImageBitmap | null) {
    debugLogger.log('ghost:reference-frame-set', { hasImageData: imageBitmap != null })
    if (imageBitmap == null) return

    // Size canvas to the viewfinder CSS dimensions so the ghost exactly overlaps the live video.
    // Fall back to bitmap dimensions in test environments where clientWidth is 0.
    const w = this.viewfinder.clientWidth  || imageBitmap.width
    const h = this.viewfinder.clientHeight || imageBitmap.height
    this.canvas.width  = w
    this.canvas.height = h

    // Draw with object-fit:cover semantics: scale to fill, center-crop any overflow.
    // (object-fit CSS has no effect on <canvas> elements, so we do this in 2D context.)
    const bw = imageBitmap.width, bh = imageBitmap.height
    const scale = Math.max(w / bw, h / bh)
    const sw = w / scale, sh = h / scale
    const sx = (bw - sw) / 2,  sy = (bh - sh) / 2
    this.ctx.clearRect(0, 0, w, h)
    this.ctx.drawImage(imageBitmap, sx, sy, sw, sh, 0, 0, w, h)

    this.state = initialGhostState()
    this.currentShiftPx = 0
    this.currentShiftPy = 0
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
