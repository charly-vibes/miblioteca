import {
  initialGhostState,
  feedGhostAccel,
  zeroVelocity,
  computeShiftPx,
  computeShiftPy,
  computeTranslationShiftPx,
  computeTranslationShiftPy,
  capToViewport,
} from './ghostOverlay'
import type { GhostOverlayState, AccelSample, GyroLike, MotionLike, GhostFrame } from './ghostOverlay'
import { GhostMotionPipeline } from './GhostMotionPipeline'
import { debugLogger } from '../debug/logger'

export type { GyroLike, MotionLike, GhostFrame }

export type GhostOverlayCanvasDeps = {
  gyro: GyroLike | null
  motion?: MotionLike | null
  getBeta?: () => number | null   // returns current DeviceOrientationEvent.beta; null when unavailable (e.g. Firefox Android)
  distanceCm?: number      // working distance to subject in cm; clamped to [20, 150]; default 60
  onFrame?: (frame: GhostFrame) => void  // fired each RAF tick after shift is computed
  requestAnimationFrame?: (cb: FrameRequestCallback) => number
  cancelAnimationFrame?: (id: number) => void
  now?: () => DOMHighResTimeStamp
  canvasClassName?: string          // CSS class for the overlay canvas; default 'ghost-overlay'
  logger?: { log(...args: unknown[]): void }  // default: debugLogger
  getOrientation?: () => string     // returns screen.orientation.type equivalent; default reads screen.orientation
}

export class GhostOverlayCanvas {
  private readonly canvas: HTMLCanvasElement
  private readonly ctx: CanvasRenderingContext2D
  private readonly viewfinder: HTMLElement
  private readonly pipeline: GhostMotionPipeline
  private accelState: GhostOverlayState = initialGhostState()
  private lastYawRad = 0
  private lastPitchRad = 0
  private currentShiftPx = 0
  private currentShiftPy = 0
  private hasSnapshot = false
  private firstFrameFired = false
  private lastShiftLogMs = 0
  private lastMotionLogMs = 0
  private workingDistanceCm = 60
  private readonly deps: Required<Omit<GhostOverlayCanvasDeps, 'motion' | 'getBeta' | 'distanceCm' | 'onFrame' | 'canvasClassName'>> & Pick<GhostOverlayCanvasDeps, 'motion' | 'getBeta' | 'onFrame'>

  constructor(viewfinder: HTMLElement, deps: GhostOverlayCanvasDeps) {
    this.viewfinder = viewfinder
    this.deps = {
      gyro: deps.gyro,
      motion: deps.motion,
      getBeta: deps.getBeta,
      onFrame: deps.onFrame,
      requestAnimationFrame: deps.requestAnimationFrame ?? ((cb) => window.requestAnimationFrame(cb)),
      cancelAnimationFrame: deps.cancelAnimationFrame ?? ((id) => window.cancelAnimationFrame(id)),
      now: deps.now ?? (() => performance.now()),
      logger: deps.logger ?? debugLogger,
      getOrientation: deps.getOrientation ?? (() => (typeof screen !== 'undefined' && screen.orientation?.type) || 'portrait-primary'),
    }

    const d = deps.distanceCm ?? 60
    this.workingDistanceCm = Number.isFinite(d) && d >= 20 && d <= 150 ? d : 60

    this.canvas = document.createElement('canvas')
    this.canvas.className = deps.canvasClassName ?? 'ghost-overlay'
    this.canvas.hidden = true
    this.canvas.setAttribute('aria-hidden', 'true')
    viewfinder.append(this.canvas)

    const ctx = this.canvas.getContext('2d')
    if (!ctx) throw new Error('Canvas 2D context unavailable')
    this.ctx = ctx

    this.pipeline = new GhostMotionPipeline({
      gyro: deps.gyro,
      displayWidth: () => this.readDisplayDims().w || this.canvas.width,
      displayHeight: () => this.readDisplayDims().h || this.canvas.height,
      getOrientation: this.deps.getOrientation,
      onFrame: (frame) => this.onPipelineFrame(frame),
      enableMotionGate: true,
      requestAnimationFrame: this.deps.requestAnimationFrame,
      cancelAnimationFrame: this.deps.cancelAnimationFrame,
      now: this.deps.now,
      logger: this.deps.logger,
    })

    if (this.deps.motion) {
      this.deps.motion.onreading = () => this.onMotionReading()
      this.deps.motion.start()
    }

    this.deps.logger.log('ghost:created', { workingDistanceCm: this.workingDistanceCm })
  }

  private onPipelineFrame(frame: GhostFrame) {
    if (!frame.gateOpen) {
      if (!this.canvas.hidden) {
        this.canvas.hidden = true
        this.accelState = zeroVelocity(this.accelState)
        this.deps.logger.log('ghost:visibility-changed', { visible: false, yawIntegral: 0 })
      }
      this.lastYawRad = 0
      this.lastPitchRad = 0
      this.deps.onFrame?.({ t: this.deps.now(), yawRad: 0, pitchRad: 0, shiftPx: 0, pitchShiftPx: 0, gateOpen: false })
      return
    }

    this.lastYawRad = frame.yawRad
    this.lastPitchRad = frame.pitchRad

    if (!this.hasSnapshot) return

    if (!this.firstFrameFired) {
      this.firstFrameFired = true
      this.deps.logger.log('ghost:render-tick', {})
    }

    if (this.canvas.hidden) {
      this.canvas.hidden = false
      this.deps.logger.log('ghost:visibility-changed', { visible: true, yawIntegral: frame.yawRad })
    }

    const { w: rw, h: rh } = this.readDisplayDims()
    const dw = rw || this.canvas.width
    const dh = rh || this.canvas.height
    const workingDistanceM = this.workingDistanceCm / 100

    const rotShiftPx = computeShiftPx(frame.yawRad, dw)
    const rotShiftPy = computeShiftPy(frame.pitchRad, dw, dh)
    const transShiftPx = computeTranslationShiftPx(this.accelState.dx_m, workingDistanceM, dw)
    const transShiftPy = computeTranslationShiftPy(this.accelState.dy_m, workingDistanceM, dw)
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
      this.deps.logger.log('ghost:shift', {
        shiftPx, shiftPy,
        yawIntegral: frame.yawRad,
        pitchIntegral: frame.pitchRad,
        dx_cm: this.accelState.dx_m * 100, dy_cm: this.accelState.dy_m * 100,
        velX: this.accelState.velX, velY: this.accelState.velY,
        workingDistanceCm: this.workingDistanceCm,
        displayWidth: dw, displayHeight: dh,
      })
      this.lastShiftLogMs = now
    }

    this.deps.onFrame?.({
      t: now,
      yawRad: frame.yawRad,
      pitchRad: frame.pitchRad,
      shiftPx,
      pitchShiftPx: shiftPy,
      gateOpen: true,
    })
  }

  private onMotionReading() {
    const motion = this.deps.motion!
    if (motion.x === null || motion.y === null) return
    const betaDeg = this.deps.getBeta?.() ?? null
    if (betaDeg === null) {
      // beta unavailable (e.g. Firefox Android returns null): tilt guard is inoperable.
      // Zero velocity to prevent bias drift accumulation; skip integration.
      this.accelState = zeroVelocity(this.accelState)
      return
    }
    const now = this.deps.now()
    const gravitySubtracted = motion.gravitySubtracted ?? false
    const orientationType = this.deps.getOrientation()
    const isLandscape = orientationType.startsWith('landscape')
    const ax = isLandscape ? motion.y : motion.x
    const ay = isLandscape ? -motion.x : motion.y
    const sample: AccelSample = {
      ax,
      ay,
      interval_ms: motion.interval || 16,
      betaDeg,
      t: now,
      gravitySubtracted,
    }
    this.accelState = feedGhostAccel(this.accelState, sample).state
    if (now - this.lastMotionLogMs >= 500) {
      this.deps.logger.log('ghost:motion-sample', {
        ax, ay,
        usingRawAccel: !gravitySubtracted,
        betaDeg, interval_ms: motion.interval,
        dx_cm: this.accelState.dx_m * 100, dy_cm: this.accelState.dy_m * 100,
        velX: this.accelState.velX, velY: this.accelState.velY,
      })
      this.lastMotionLogMs = now
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
    return {
      w: capToViewport(vw, window.innerWidth),
      h: capToViewport(vh, window.innerHeight),
    }
  }

  // Call after each capture to draw the thumbnail and reset yaw/pitch/translation accumulators.
  // Pass null when grabFrame() fails — previous snapshot is retained unchanged.
  setSnapshot(imageBitmap: ImageBitmap | null) {
    this.deps.logger.log('ghost:reference-frame-set', { hasImageData: imageBitmap != null })
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
    this.pipeline.reset()
    this.pipeline.openGate()  // allow gate-close on next tick when omegaMag is high
    this.accelState = initialGhostState()
    this.lastYawRad = 0
    this.lastPitchRad = 0
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
    const rotShiftPx = computeShiftPx(this.lastYawRad, displayWidth)
    const rotShiftPy = computeShiftPy(this.lastPitchRad, displayWidth, displayHeight)
    const transShiftPx = computeTranslationShiftPx(this.accelState.dx_m, workingDistanceM, displayWidth)
    const transShiftPy = computeTranslationShiftPy(this.accelState.dy_m, workingDistanceM, displayWidth)
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
      yawIntegral: this.lastYawRad,
      pitchIntegral: this.lastPitchRad,
      dx_cm: this.accelState.dx_m * 100,
      dy_cm: this.accelState.dy_m * 100,
      velX: this.accelState.velX,
      velY: this.accelState.velY,
      visible: !this.canvas.hidden,
      displayWidth,
      displayHeight,
      workingDistanceCm: this.workingDistanceCm,
    }
  }

  // Call when the camera session ends or the view unmounts.
  destroy() {
    this.pipeline.destroy()
    this.deps.motion?.stop()
    this.canvas.remove()
    this.deps.logger.log('ghost:destroyed', {})
  }
}
