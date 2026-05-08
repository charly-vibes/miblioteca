import {
  initialGhostState,
  feedGhostGyro,
  feedGhostAccel,
  zeroVelocity,
  computeShiftPx,
  computeShiftPy,
  computeTranslationShiftPx,
  computeTranslationShiftPy,
} from './ghostOverlay'
import type { GhostOverlayState, GyroSample, AccelSample } from './ghostOverlay'
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

export type MotionLike = {
  onreading: (() => void) | null
  x: number | null    // DeviceMotionEvent.acceleration.x (m/s², gravity subtracted)
  y: number | null    // DeviceMotionEvent.acceleration.y (m/s², gravity subtracted)
  interval: number    // DeviceMotionEvent.interval (ms)
  start(): void
  stop(): void
}

export type GhostOverlayCanvasDeps = {
  gyro: GyroLike | null
  motion?: MotionLike | null
  getBeta?: () => number   // returns current DeviceOrientationEvent.beta; default 90 (phone upright)
  requestAnimationFrame?: (cb: FrameRequestCallback) => number
  cancelAnimationFrame?: (id: number) => void
  now?: () => DOMHighResTimeStamp
}

// Hysteresis prevents rapid toggling when hand tremor hovers near the threshold.
// Show the ghost when movement drops below SHOW, hide it when it rises above HIDE.
const MOTION_GATE_SHOW_RAD_S = 0.40
const MOTION_GATE_HIDE_RAD_S = 0.55

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
  private lastMotionLogMs = 0
  private workingDistanceCm = 60
  private readonly deps: Required<Omit<GhostOverlayCanvasDeps, 'motion' | 'getBeta'>> & Pick<GhostOverlayCanvasDeps, 'motion' | 'getBeta'>

  constructor(viewfinder: HTMLElement, deps: GhostOverlayCanvasDeps) {
    this.viewfinder = viewfinder
    this.deps = {
      gyro: deps.gyro,
      motion: deps.motion,
      getBeta: deps.getBeta,
      requestAnimationFrame: deps.requestAnimationFrame ?? ((cb) => window.requestAnimationFrame(cb)),
      cancelAnimationFrame: deps.cancelAnimationFrame ?? ((id) => window.cancelAnimationFrame(id)),
      now: deps.now ?? (() => performance.now()),
    }

    // Parse working distance from ?distance=<cm> URL param (clamp to [20, 150] cm).
    const distParam = typeof location !== 'undefined' ? new URLSearchParams(location.search).get('distance') : null
    const parsed = distParam ? Number(distParam) : NaN
    this.workingDistanceCm = Number.isFinite(parsed) && parsed >= 20 && parsed <= 150 ? parsed : 60

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

    if (this.deps.motion) {
      this.deps.motion.onreading = () => this.onMotionReading()
      this.deps.motion.start()
    }

    this.rafId = this.deps.requestAnimationFrame(this.rafLoop)
    debugLogger.log('ghost:created', { workingDistanceCm: this.workingDistanceCm })
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

  private onMotionReading() {
    const motion = this.deps.motion!
    // Defense in depth: adapter already guards against null, but belt-and-suspenders.
    // Stale non-zero velocity with ax=0 would silently accumulate displacement.
    if (motion.x === null || motion.y === null) return
    const betaDeg = this.deps.getBeta?.() ?? 90
    const now = this.deps.now()
    const sample: AccelSample = {
      ax: motion.x,
      ay: motion.y,
      interval_ms: motion.interval || 16,  // some browsers report 0; MotionLike types it as number but 0 is possible
      betaDeg,
      t: now,
    }
    this.state = feedGhostAccel(this.state, sample)
    if (now - this.lastMotionLogMs >= 500) {
      debugLogger.log('ghost:motion-sample', {
        ax: motion.x, ay: motion.y,
        usingRawAccel: (motion as { usingRawAccel?: boolean }).usingRawAccel ?? false,
        betaDeg, interval_ms: motion.interval,
        dx_cm: this.state.dx_m * 100, dy_cm: this.state.dy_m * 100,
        velX: this.state.velX, velY: this.state.velY,
      })
      this.lastMotionLogMs = now
    }
  }

  private rafLoop: FrameRequestCallback = () => {
    if (this.destroyed) return
    this.rafId = this.deps.requestAnimationFrame(this.rafLoop)
    if (!this.firstRafFired) {
      this.firstRafFired = true
      debugLogger.log('ghost:render-tick', {})
    }

    const currentlyHidden = this.canvas.hidden
    const shouldShow = this.hasSnapshot && (
      currentlyHidden
        ? this.state.omegaMag <= MOTION_GATE_SHOW_RAD_S
        : this.state.omegaMag <= MOTION_GATE_HIDE_RAD_S
    )
    if (this.canvas.hidden !== !shouldShow) {
      this.canvas.hidden = !shouldShow
      // Secondary ZUPT: zero velocity when gate closes so drift doesn't accumulate during still periods.
      if (!shouldShow) this.state = zeroVelocity(this.state)
      debugLogger.log('ghost:visibility-changed', { visible: shouldShow, omegaMag: this.state.omegaMag, yawIntegral: this.state.yawIntegral })
    }
    if (this.canvas.hidden) return

    // Use CSS display dimensions so shifts are in CSS pixels, not bitmap pixels.
    // readDisplayDims() caps clientWidth/Height at the viewport to guard against a Firefox
    // Android quirk where setting canvas.width > viewport inflates the parent's clientWidth.
    const { w: rw, h: rh } = this.readDisplayDims()
    const dw = rw || this.canvas.width
    const dh = rh || this.canvas.height
    const workingDistanceM = this.workingDistanceCm / 100

    // Rotation component (each internally clamped to display bounds)
    const rotShiftPx = computeShiftPx(this.state.yawIntegral, dw)
    const rotShiftPy = computeShiftPy(this.state.pitchIntegral, dw, dh)
    // Translation component (unclamped; combined clamp applied below)
    const transShiftPx = computeTranslationShiftPx(this.state.dx_m, workingDistanceM, dw)
    const transShiftPy = computeTranslationShiftPy(this.state.dy_m, workingDistanceM, dw)
    // Combined shift, clamped to display boundaries
    const halfW = dw / 2
    const halfH = dh / 2
    const shiftPx = Math.max(-halfW, Math.min(halfW, rotShiftPx + transShiftPx))
    const shiftPy = Math.max(-halfH, Math.min(halfH, rotShiftPy + transShiftPy))

    if (shiftPx !== this.currentShiftPx || shiftPy !== this.currentShiftPy) {
      this.canvas.style.transform = `translate3d(${shiftPx}px, ${shiftPy}px, 0)`
      this.currentShiftPx = shiftPx
      this.currentShiftPy = shiftPy
    }

    const now = this.deps.now()
    if (now - this.lastShiftLogMs >= 500) {
      debugLogger.log('ghost:shift', {
        shiftPx, shiftPy,
        yawIntegral: this.state.yawIntegral, pitchIntegral: this.state.pitchIntegral,
        dx_cm: this.state.dx_m * 100, dy_cm: this.state.dy_m * 100,
        velX: this.state.velX, velY: this.state.velY,
        workingDistanceCm: this.workingDistanceCm,
        displayWidth: dw, displayHeight: dh,
      })
      this.lastShiftLogMs = now
    }
  }

  // Returns viewfinder CSS dimensions capped at the visual viewport.
  // On Firefox Android, setting canvas.width > viewport can cause the parent's clientWidth to
  // report the inflated bitmap width instead of the CSS layout width. Capping at window.innerWidth
  // breaks that feedback loop.
  // The `window === undefined` guard handles SSR/Node; the `maxW > 0` check handles jsdom (innerWidth=0).
  // Both paths return uncapped clientWidth, which callers fall back with || canvas.width.
  private readDisplayDims(): { w: number; h: number } {
    const vw = this.viewfinder.clientWidth
    const vh = this.viewfinder.clientHeight
    if (typeof window === 'undefined') return { w: vw, h: vh }
    const maxW = window.innerWidth
    const maxH = window.innerHeight
    return {
      w: maxW > 0 ? Math.min(vw, maxW) : vw,
      h: maxH > 0 ? Math.min(vh, maxH) : vh,
    }
  }

  // Call after each capture to draw the thumbnail and reset yaw/pitch/translation accumulators.
  // Pass null when grabFrame() fails — previous snapshot is retained unchanged.
  setSnapshot(imageBitmap: ImageBitmap | null) {
    debugLogger.log('ghost:reference-frame-set', { hasImageData: imageBitmap != null })
    if (imageBitmap == null) return

    // Size canvas to CSS dimensions; readDisplayDims() caps at viewport (Firefox Android workaround).
    const { w: vw, h: vh } = this.readDisplayDims()
    const w = vw || imageBitmap.width
    const h = vh || imageBitmap.height
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

    // Primary ZUPT: reset all accumulators including velocity and displacement.
    this.state = initialGhostState()
    this.currentShiftPx = 0
    this.currentShiftPy = 0
    this.canvas.style.transform = 'translate3d(0, 0, 0)'
    this.hasSnapshot = true
    this.canvas.hidden = false
  }

  // Returns a snapshot of the current ghost state for debug logging at shutter time.
  // Shift values are computed fresh from current integrals (not cached RAF values)
  // so they reflect the true overlay position at the exact moment of capture.
  getDebugState(): {
    shiftPx: number; shiftPy: number
    rotShiftPx: number; rotShiftPy: number
    transShiftPx: number; transShiftPy: number
    yawIntegral: number; pitchIntegral: number
    dx_cm: number; dy_cm: number
    velX: number; velY: number
    visible: boolean
    displayWidth: number; displayHeight: number
    workingDistanceCm: number
  } {
    const { w: dw, h: dh } = this.readDisplayDims()
    const displayWidth = dw || this.canvas.width
    const displayHeight = dh || this.canvas.height
    const workingDistanceM = this.workingDistanceCm / 100
    const rotShiftPx = computeShiftPx(this.state.yawIntegral, displayWidth)
    const rotShiftPy = computeShiftPy(this.state.pitchIntegral, displayWidth, displayHeight)
    const transShiftPx = computeTranslationShiftPx(this.state.dx_m, workingDistanceM, displayWidth)
    const transShiftPy = computeTranslationShiftPy(this.state.dy_m, workingDistanceM, displayWidth)
    const halfW = displayWidth / 2
    const halfH = displayHeight / 2
    const shiftPx = Math.max(-halfW, Math.min(halfW, rotShiftPx + transShiftPx))
    const shiftPy = Math.max(-halfH, Math.min(halfH, rotShiftPy + transShiftPy))
    return {
      shiftPx,
      shiftPy,
      rotShiftPx,
      rotShiftPy,
      transShiftPx,
      transShiftPy,
      yawIntegral: this.state.yawIntegral,
      pitchIntegral: this.state.pitchIntegral,
      dx_cm: this.state.dx_m * 100,
      dy_cm: this.state.dy_m * 100,
      velX: this.state.velX,
      velY: this.state.velY,
      visible: !this.canvas.hidden,
      displayWidth,
      displayHeight,
      workingDistanceCm: this.workingDistanceCm,
    }
  }

  // Call when the camera session ends or the view unmounts.
  destroy() {
    this.destroyed = true
    this.deps.cancelAnimationFrame(this.rafId)
    this.deps.gyro?.stop()
    this.deps.motion?.stop()
    this.canvas.remove()
    debugLogger.log('ghost:destroyed', {})
  }
}
