import {
  computeShiftPx,
  computeShiftPy,
  computeTranslationShiftPx,
  computeTranslationShiftPy,
  capToViewport,
} from './ghostOverlay'
import type { GyroLike, MotionLike, GhostFrame } from './ghostOverlay'
import { createGhostPipelineDeps } from './createGhostPipelineDeps'
import type { CreatedGhostPipelineDeps, GhostPipelineWindow } from './createGhostPipelineDeps'
import { GhostMotionPipeline } from './GhostMotionPipeline'
import { debugLogger } from '../debug/logger'

export type { GyroLike, MotionLike, GhostFrame }

// Working distance bounds: 20 cm = minimum arm-reach / macro distance;
// 150 cm = maximum practical shelf depth from phone.
// Default 60 cm ≈ typical arm-length distance for shelf scanning.
export const WORKING_DISTANCE_MIN_CM = 20
export const WORKING_DISTANCE_MAX_CM = 150
export const WORKING_DISTANCE_DEFAULT_CM = 60

export type GhostOverlayCanvasDeps = {
  /**
   * Gyroscope event source. Pass `null` when no gyroscope is available —
   * the overlay will not be rendered (ghost stays hidden).
   */
  gyro: GyroLike | null
  motion?: MotionLike | null
  /**
   * @deprecated Orientation is now wired by createGhostPipelineDeps(). Kept for
   * compatibility while callers migrate to the shared factory path.
   */
  getBeta?: () => number | null
  /**
   * @deprecated Orientation is now wired by createGhostPipelineDeps(). Kept for
   * compatibility while callers migrate to the shared factory path.
   */
  getOrientation?: () => { alpha: number; beta: number; gamma: number } | null
  distanceCm?: number      // working distance to subject in cm; clamped to [WORKING_DISTANCE_MIN_CM, WORKING_DISTANCE_MAX_CM]; default WORKING_DISTANCE_DEFAULT_CM
  onFrame?: (frame: GhostFrame) => void  // fired each RAF tick after shift is computed
  /**
   * Schedules an animation-frame callback. Defaults to `window.requestAnimationFrame`.
   * Override in tests to drive frames synchronously without a real browser animation loop.
   */
  requestAnimationFrame?: (cb: FrameRequestCallback) => number
  /**
   * Cancels a scheduled animation-frame callback. Defaults to `window.cancelAnimationFrame`.
   * Override in tests alongside `requestAnimationFrame` to avoid leaking fake timers.
   */
  cancelAnimationFrame?: (id: number) => void
  /**
   * Returns the current high-resolution timestamp in milliseconds.
   * Defaults to `performance.now()`. Override in tests to control time deterministically.
   */
  now?: () => DOMHighResTimeStamp
  canvasClassName?: string          // CSS class for the overlay canvas; default 'ghost-overlay'
  /**
   * Logging sink for structured ghost events. Defaults to `debugLogger` (no-op in production).
   * Override in tests to capture or assert on emitted log entries.
   */
  logger?: { log(...args: unknown[]): void }
  /**
   * Returns the current screen orientation type (equivalent to `screen.orientation.type`).
   * Defaults to reading `screen.orientation` directly.
   * Override in tests to simulate portrait/landscape without a real screen object.
   */
  getScreenOrientation?: () => string
  /** Window-like object used by the shared sensor factory; defaults to global window. */
  win?: GhostPipelineWindow
}

/**
 * Creates a `<canvas>` element, appends it to the given viewfinder element, and
 * drives a ghost-overlay animation loop that shifts the canvas in response to
 * device rotation and translation.
 *
 * The canvas starts **hidden** (`canvas.hidden = true`) and becomes visible only
 * after the first successful call to `setSnapshot()`.
 *
 * Callers **must** call `destroy()` when the camera session ends or the view
 * unmounts, to cancel the animation-frame loop and remove the canvas from the DOM.
 */
export class GhostOverlayCanvas {
  private readonly canvas: HTMLCanvasElement
  private readonly ctx: CanvasRenderingContext2D
  private readonly viewfinder: HTMLElement
  private readonly pipeline: GhostMotionPipeline
  private readonly pipelineDeps: CreatedGhostPipelineDeps
  private lastYawRad = 0
  private lastPitchRad = 0
  private currentShiftPx = 0
  private currentShiftPy = 0
  private hasSnapshot = false
  private firstFrameFired = false
  private lastShiftLogMs = 0
  private workingDistanceCm = WORKING_DISTANCE_DEFAULT_CM
  private tiltDeviationStartMs: number | null = null
  private tiltWarningActive = false
  private readonly deps: Required<Omit<GhostOverlayCanvasDeps, 'motion' | 'getBeta' | 'getOrientation' | 'distanceCm' | 'onFrame' | 'canvasClassName' | 'win'>> & Pick<GhostOverlayCanvasDeps, 'onFrame'>

  /**
   * @throws {Error} `'Canvas 2D context unavailable'` — thrown when the browser
   * cannot provide a 2D rendering context for the created canvas (e.g. hardware
   * acceleration is disabled or the context limit has been exceeded).
   */
  constructor(viewfinder: HTMLElement, deps: GhostOverlayCanvasDeps) {
    this.viewfinder = viewfinder
    this.deps = {
      gyro: deps.gyro,
      onFrame: deps.onFrame,
      requestAnimationFrame: deps.requestAnimationFrame ?? ((cb) => window.requestAnimationFrame(cb)),
      cancelAnimationFrame: deps.cancelAnimationFrame ?? ((id) => window.cancelAnimationFrame(id)),
      now: deps.now ?? (() => performance.now()),
      logger: deps.logger ?? debugLogger,
      getScreenOrientation: deps.getScreenOrientation ?? (() => (typeof screen !== 'undefined' && screen.orientation?.type) || 'portrait-primary'),
    }

    const d = deps.distanceCm ?? WORKING_DISTANCE_DEFAULT_CM
    if (!Number.isFinite(d)) {
      this.workingDistanceCm = WORKING_DISTANCE_DEFAULT_CM
    } else if (d < WORKING_DISTANCE_MIN_CM) {
      console.warn(`GhostOverlayCanvas: distanceCm ${d} is below minimum ${WORKING_DISTANCE_MIN_CM}, clamping to ${WORKING_DISTANCE_MIN_CM}`)
      this.workingDistanceCm = WORKING_DISTANCE_MIN_CM
    } else if (d > WORKING_DISTANCE_MAX_CM) {
      console.warn(`GhostOverlayCanvas: distanceCm ${d} exceeds maximum ${WORKING_DISTANCE_MAX_CM}, clamping to ${WORKING_DISTANCE_MAX_CM}`)
      this.workingDistanceCm = WORKING_DISTANCE_MAX_CM
    } else {
      this.workingDistanceCm = d
    }

    this.canvas = document.createElement('canvas')
    this.canvas.className = deps.canvasClassName ?? 'ghost-overlay'
    this.canvas.hidden = true
    this.canvas.setAttribute('aria-hidden', 'true')
    viewfinder.append(this.canvas)

    const ctx = this.canvas.getContext('2d')
    if (!ctx) throw new Error('Canvas 2D context unavailable')
    this.ctx = ctx

    this.pipelineDeps = createGhostPipelineDeps({
      win: deps.win ?? window,
      gyro: deps.gyro,
      motion: deps.motion ?? null,
      getDisplayWidth: () => this.readDisplayDims().w || this.canvas.width,
      getDisplayHeight: () => this.readDisplayDims().h || this.canvas.height,
      getScreenOrientation: this.deps.getScreenOrientation,
      onFrame: (frame) => this.onPipelineFrame(frame),
      enableMotionGate: true,
      requestAnimationFrame: this.deps.requestAnimationFrame,
      cancelAnimationFrame: this.deps.cancelAnimationFrame,
      now: this.deps.now,
      logger: this.deps.logger,
    })
    this.pipeline = new GhostMotionPipeline(this.pipelineDeps)

    this.deps.logger.log('ghost:created', { workingDistanceCm: this.workingDistanceCm })
  }

  private onPipelineFrame(frame: GhostFrame) {
    if (!frame.gateOpen) {
      if (!this.canvas.hidden) {
        this.canvas.hidden = true
        this.deps.logger.log('ghost:visibility-changed', { visible: false, yawIntegral: 0 })
      }
      // Keep lastYawRad/lastPitchRad — pipeline continues integrating while gate is closed,
      // so getDebugState() reflects actual accumulated state rather than a stale 0.
      this.deps.onFrame?.({ t: this.deps.now(), yawRad: 0, pitchRad: 0, shiftPx: 0, pitchShiftPx: 0, dx_m: 0, dy_m: 0, gateOpen: false })
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
    const transShiftPx = computeTranslationShiftPx(frame.dx_m, workingDistanceM, dw)
    const transShiftPy = computeTranslationShiftPy(frame.dy_m, workingDistanceM, dw)
    const shiftPx = rotShiftPx + transShiftPx
    const shiftPy = rotShiftPy + transShiftPy

    if (shiftPx !== this.currentShiftPx || shiftPy !== this.currentShiftPy) {
      this.canvas.style.transform = `translate3d(${shiftPx}px, ${shiftPy}px, 0)`
      this.currentShiftPx = shiftPx
      this.currentShiftPy = shiftPy
    }

    const now = this.deps.now()
    const { dx_m, dy_m } = frame
    const trans = this.pipeline.getTranslationState()
    if (now - this.lastShiftLogMs >= 500) {
      this.deps.logger.log('ghost:shift', {
        shiftPx, shiftPy,
        rotShiftPx, rotShiftPy,
        transShiftPx, transShiftPy,
        yawIntegral: frame.yawRad,
        pitchIntegral: frame.pitchRad,
        dx_cm: dx_m * 100,
        dy_cm: dy_m * 100,
        velX: trans.velX,
        velY: trans.velY,
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
      dx_m,
      dy_m,
      gateOpen: true,
    })
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

    // Reset all rotation accumulators.
    this.pipeline.reset()
    this.pipeline.openGate()  // allow gate-close on next tick when omegaMag is high
    this.lastYawRad = 0
    this.lastPitchRad = 0
    this.currentShiftPx = 0
    this.currentShiftPy = 0
    this.canvas.style.transform = 'translate3d(0, 0, 0)'
    this.hasSnapshot = true
    this.canvas.hidden = false
  }

  // Returns a snapshot of the current ghost state for debug logging at shutter time.
  getDebugState(): {
    shiftPx: number; shiftPy: number
    rotShiftPx: number; rotShiftPy: number
    transShiftPx: number; transShiftPy: number
    yawIntegral: number; pitchIntegral: number
    dx_cm: number; dy_cm: number
    velX: number; velY: number
    workingDistanceCm: number
    visible: boolean
    displayWidth: number; displayHeight: number
  } {
    const { w: dw, h: dh } = this.readDisplayDims()
    const displayWidth = dw || this.canvas.width
    const displayHeight = dh || this.canvas.height
    const workingDistanceM = this.workingDistanceCm / 100
    const rotShiftPx = computeShiftPx(this.lastYawRad, displayWidth)
    const rotShiftPy = computeShiftPy(this.lastPitchRad, displayWidth, displayHeight)
    const trans = this.pipeline.getTranslationState()
    const transShiftPx = computeTranslationShiftPx(trans.dx_m, workingDistanceM, displayWidth)
    const transShiftPy = computeTranslationShiftPy(trans.dy_m, workingDistanceM, displayWidth)
    return {
      shiftPx: rotShiftPx + transShiftPx,
      shiftPy: rotShiftPy + transShiftPy,
      rotShiftPx,
      rotShiftPy,
      transShiftPx,
      transShiftPy,
      yawIntegral: this.lastYawRad,
      pitchIntegral: this.lastPitchRad,
      dx_cm: trans.dx_m * 100,
      dy_cm: trans.dy_m * 100,
      velX: trans.velX,
      velY: trans.velY,
      workingDistanceCm: this.workingDistanceCm,
      visible: !this.canvas.hidden,
      displayWidth,
      displayHeight,
    }
  }

  /** Feed beta from DeviceOrientationEvent. Debounces tilt warning: fires after >30° deviation from 90° for >1 s. */
  feedBeta(beta: number, nowMs: number) {
    const deviation = Math.abs(beta - 90)
    if (deviation > 30) {
      if (this.tiltDeviationStartMs === null) {
        this.tiltDeviationStartMs = nowMs
      } else if (!this.tiltWarningActive && nowMs - this.tiltDeviationStartMs > 1000) {
        this.tiltWarningActive = true
        this.deps.logger.log('ghost:tilt-warning', { visible: true, beta })
      }
    } else {
      if (this.tiltWarningActive) {
        this.tiltWarningActive = false
        this.deps.logger.log('ghost:tilt-warning', { visible: false, beta })
      }
      this.tiltDeviationStartMs = null
    }
  }

  setWorkingDistance(cm: number) {
    if (!Number.isFinite(cm)) return
    this.workingDistanceCm = Math.max(WORKING_DISTANCE_MIN_CM, Math.min(WORKING_DISTANCE_MAX_CM, cm))
    this.deps.logger.log('ghost:working-distance-updated', { workingDistanceCm: this.workingDistanceCm })
  }

  // Call when the camera session ends or the view unmounts.
  destroy() {
    this.pipeline.destroy()
    this.pipelineDeps.dispose()
    this.canvas.remove()
    this.deps.logger.log('ghost:destroyed', {})
  }
}
