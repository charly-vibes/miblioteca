import type { GhostFrame, GyroLike } from '../sensors/ghostOverlay'
import { computeShiftPx, computeShiftPy, focalLengthPx, DEFAULT_HFOV_DEG } from '../sensors/ghostOverlay'
import { GhostMotionPipeline } from '../sensors/GhostMotionPipeline'
import type { Phase, SensorFrame, CalibrationCycle, CalibrationExport } from './types'

declare const __GIT_COMMIT__: string

const DOT_PX = 24
const DOT_COLOR = '#FF3B30'
const RECT_W_RATIO = 0.6
const RECT_H_RATIO = 0.4
const H_FOV_DEG = DEFAULT_HFOV_DEG
const FALLBACK_VW = 375
const FALLBACK_VH = 667

export type WindowLike = {
  addEventListener: (type: string, cb: EventListenerOrEventListenerObject) => void
  removeEventListener: (type: string, cb: EventListenerOrEventListenerObject) => void
  innerWidth: number
  innerHeight: number
  devicePixelRatio?: number
  navigator?: { userAgent: string }
}

export type CalibrationPageDeps = {
  getUserMedia?: (constraints: MediaStreamConstraints) => Promise<MediaStream>
  win?: WindowLike
  gyro?: GyroLike | null
  requestAnimationFrame?: (cb: FrameRequestCallback) => number
  cancelAnimationFrame?: (id: number) => void
  now?: () => number
  triggerDownload?: (filename: string, json: string) => void
  distanceCm?: number
  getOrientation?: () => string
  captureSnapshot?: (video: HTMLVideoElement) => string | null
}

function injectPulseStyle(doc: Document): void {
  if (doc.getElementById('ghost-cal-styles')) return
  const style = doc.createElement('style')
  style.id = 'ghost-cal-styles'
  style.textContent = [
    '@keyframes ghost-pulse {',
    '  0%,100% { transform:translate(-50%,-50%) scale(1); opacity:1; }',
    '  50%     { transform:translate(-50%,-50%) scale(1.3); opacity:0.6; }',
    '}',
    '.ghost-center-dot { animation: ghost-pulse 1.2s ease-in-out infinite; }',
  ].join('\n')
  doc.head.appendChild(style)
}

function makeDot(doc: Document, isPulse = false): HTMLElement {
  const el = doc.createElement('div')
  el.setAttribute('role', 'button')
  Object.assign(el.style, {
    position: 'absolute',
    width: `${DOT_PX}px`,
    height: `${DOT_PX}px`,
    borderRadius: '50%',
    background: DOT_COLOR,
    cursor: 'pointer',
    touchAction: 'none',
    transform: 'translate(-50%,-50%)',
  })
  if (isPulse) el.classList.add('ghost-center-dot')
  return el
}

function fmt(n: number): string {
  return n.toFixed(3).padStart(8)
}

function msToMMSS(ms: number): string {
  const s = Math.floor(ms / 1000)
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`
}

export class GhostCalibrationPage {
  private readonly videoEl: HTMLVideoElement
  private readonly warnBannerEl: HTMLElement
  private readonly telemetryEl: HTMLElement
  private readonly rectangleEl: HTMLElement
  private readonly centerDotEl: HTMLElement
  private readonly hintEl: HTMLElement
  private readonly recordingIndicatorEl: HTMLElement
  private readonly timerSpanEl: HTMLSpanElement
  private readonly stopBtnEl: HTMLButtonElement
  private readonly confirmBtnEl: HTMLButtonElement
  private readonly summaryPanelEl: HTMLElement
  private readonly exportBtnEl: HTMLButtonElement
  private readonly nextCycleBtnEl: HTMLButtonElement

  private phase: Phase = 'idle'
  private latestFrame: GhostFrame | null = null
  private stream: MediaStream | null = null
  private destroyed = false

  private sensorVals = { gx: 0, gy: 0, gz: 0, ax: 0, ay: 0, az: 0 }
  private readonly motionHandler: EventListenerOrEventListenerObject
  private readonly orientationHandler: EventListenerOrEventListenerObject
  private readonly win: WindowLike

  private readonly doc: Document
  private readonly gyro: GyroLike | null
  private readonly raf: (cb: FrameRequestCallback) => number
  private readonly caf: (id: number) => void
  private readonly nowFn: () => number
  private readonly triggerDownload: (filename: string, json: string) => void

  private readonly getOrientation: () => string
  private betaDeg: number | null = null

  private cycles: CalibrationCycle[] = []
  private currentCycle: Partial<CalibrationCycle> | null = null
  private readonly pipeline: GhostMotionPipeline
  private lastYawRad = 0
  private lastPitchRad = 0
  private recordingStartedAt = 0

  private dragStartTouch: { clientX: number; clientY: number } | null = null
  private dragStartRect = { left: 0, top: 0 }

  private readonly onDocMouseMove: (e: MouseEvent) => void
  private readonly onDocMouseUp: () => void
  private readonly onDocTouchMove: (e: Event) => void
  private readonly onDocTouchEnd: () => void

  private rectInitLeft: number
  private rectInitTop: number
  private readonly rectW: number
  private readonly rectH: number

  private readonly ghostOverlayEl: HTMLImageElement
  private readonly captureSnapshotFn: (video: HTMLVideoElement) => string | null

  constructor(
    private readonly root: HTMLElement,
    deps: CalibrationPageDeps = {}
  ) {
    this.win = deps.win ?? (typeof window !== 'undefined'
      ? window
      : { addEventListener: () => {}, removeEventListener: () => {}, innerWidth: 375, innerHeight: 667 })

    this.gyro = deps.gyro ?? null
    this.raf = deps.requestAnimationFrame ?? (cb => (typeof window !== 'undefined' ? window.requestAnimationFrame(cb) : 0))
    this.caf = deps.cancelAnimationFrame ?? (id => { if (typeof window !== 'undefined') window.cancelAnimationFrame(id) })
    this.nowFn = deps.now ?? (() => (typeof performance !== 'undefined' ? performance.now() : 0))
    this.triggerDownload = deps.triggerDownload ?? ((filename, json) => {
      const a = document.createElement('a')
      a.href = URL.createObjectURL(new Blob([json], { type: 'application/json' }))
      a.download = filename
      a.click()
      URL.revokeObjectURL(a.href)
    })

    this.getOrientation = deps.getOrientation ?? (() => (typeof screen !== 'undefined' && screen.orientation?.type) || 'portrait-primary')

    this.captureSnapshotFn = deps.captureSnapshot ?? ((video) => {
      try {
        const c = document.createElement('canvas')
        c.width = video.videoWidth || video.clientWidth || FALLBACK_VW
        c.height = video.videoHeight || video.clientHeight || FALLBACK_VH
        c.getContext('2d')?.drawImage(video, 0, 0, c.width, c.height)
        return c.toDataURL('image/jpeg', 0.8)
      } catch { return null }
    })

    const doc = root.ownerDocument ?? document
    this.doc = doc
    injectPulseStyle(doc)

    this.videoEl = doc.createElement('video')
    this.videoEl.setAttribute('playsinline', '')
    this.videoEl.setAttribute('autoplay', '')
    this.videoEl.setAttribute('muted', '')
    Object.assign(this.videoEl.style, {
      position: 'fixed', inset: '0',
      width: '100%', height: '100%',
      objectFit: 'cover', background: '#111', zIndex: '0',
    })

    this.warnBannerEl = doc.createElement('div')
    this.warnBannerEl.setAttribute('role', 'alert')
    this.warnBannerEl.setAttribute('data-testid', 'camera-warning')
    this.warnBannerEl.textContent = 'Camera unavailable — calibration data still valid'
    Object.assign(this.warnBannerEl.style, {
      display: 'none', position: 'fixed',
      top: '0', left: '0', right: '0',
      padding: '0.5rem', background: '#c00', color: '#fff',
      fontSize: '0.8rem', textAlign: 'center', zIndex: '10',
    })

    this.telemetryEl = doc.createElement('div')
    this.telemetryEl.setAttribute('aria-label', 'Sensor telemetry')
    this.telemetryEl.setAttribute('data-testid', 'telemetry')
    Object.assign(this.telemetryEl.style, {
      position: 'fixed', top: '0', left: '0', right: '0',
      padding: '0.5rem', background: 'rgba(0,0,0,0.7)',
      color: '#0f0', fontFamily: 'monospace', fontSize: '0.7rem',
      lineHeight: '1.4', whiteSpace: 'pre', zIndex: '5',
    })
    this.renderTelemetry()

    const vw = this.win.innerWidth || FALLBACK_VW
    const vh = this.win.innerHeight || FALLBACK_VH
    const rw = Math.round(vw * RECT_W_RATIO)
    const rh = Math.round(vh * RECT_H_RATIO)
    const rx = Math.round((vw - rw) / 2)
    const ry = Math.round((vh - rh) / 2)

    this.rectInitLeft = rx
    this.rectInitTop = ry
    this.rectW = rw
    this.rectH = rh

    this.rectangleEl = doc.createElement('div')
    this.rectangleEl.setAttribute('data-testid', 'calibration-rectangle')
    Object.assign(this.rectangleEl.style, {
      position: 'absolute',
      left: `${rx}px`, top: `${ry}px`,
      width: `${rw}px`, height: `${rh}px`,
      border: `2px solid ${DOT_COLOR}`,
      boxSizing: 'border-box',
      touchAction: 'none',
    })
    this.rectangleEl.addEventListener('mousedown', (e: MouseEvent) => this.startDrag(e.clientX, e.clientY))
    this.rectangleEl.addEventListener('touchstart', (e: Event) => {
      const t = (e as TouchEvent).touches[0]
      if (t) { e.preventDefault(); this.startDrag(t.clientX, t.clientY) }
    }, { passive: false })

    const corners: [number, number][] = [[0, 0], [rw, 0], [0, rh], [rw, rh]]
    for (const [x, y] of corners) {
      const dot = makeDot(doc)
      dot.style.left = `${x}px`
      dot.style.top = `${y}px`
      dot.addEventListener('click', () => this.onDotTap())
      dot.addEventListener('touchend', (e) => { e.preventDefault(); this.onDotTap() })
      this.rectangleEl.appendChild(dot)
    }

    this.centerDotEl = makeDot(doc, true)
    this.centerDotEl.setAttribute('data-testid', 'center-dot')
    this.centerDotEl.style.left = `${rw / 2}px`
    this.centerDotEl.style.top = `${rh / 2}px`
    this.centerDotEl.addEventListener('click', () => this.onCenterTap())
    this.centerDotEl.addEventListener('touchend', (e) => { e.preventDefault(); this.onCenterTap() })
    this.rectangleEl.appendChild(this.centerDotEl)

    this.hintEl = doc.createElement('div')
    this.hintEl.setAttribute('data-testid', 'hint-text')
    this.hintEl.textContent = 'TAP CENTER TO START'
    Object.assign(this.hintEl.style, {
      position: 'absolute', left: '50%',
      bottom: `${Math.round(vh * 0.2)}px`,
      transform: 'translateX(-50%)', color: '#fff',
      fontFamily: 'sans-serif', fontSize: '0.9rem',
      letterSpacing: '0.1em', textShadow: '0 1px 4px rgba(0,0,0,0.8)',
      whiteSpace: 'nowrap',
    })

    this.recordingIndicatorEl = doc.createElement('div')
    this.recordingIndicatorEl.setAttribute('data-testid', 'recording-indicator')
    Object.assign(this.recordingIndicatorEl.style, {
      position: 'fixed', top: '0.5rem', right: '0.5rem',
      display: 'flex', alignItems: 'center', gap: '0.4rem',
      color: '#fff', fontFamily: 'monospace', fontSize: '0.9rem', zIndex: '6',
    })
    this.recordingIndicatorEl.hidden = true
    const redDot = doc.createElement('span')
    Object.assign(redDot.style, {
      width: '10px', height: '10px', borderRadius: '50%',
      background: DOT_COLOR, display: 'inline-block',
    })
    this.timerSpanEl = doc.createElement('span')
    this.timerSpanEl.textContent = '00:00'
    this.recordingIndicatorEl.appendChild(redDot)
    this.recordingIndicatorEl.appendChild(this.timerSpanEl)

    this.stopBtnEl = doc.createElement('button')
    this.stopBtnEl.textContent = 'Stop'
    this.stopBtnEl.setAttribute('data-testid', 'stop-btn')
    this.stopBtnEl.hidden = true
    Object.assign(this.stopBtnEl.style, {
      position: 'fixed', bottom: `${Math.round(vh * 0.12)}px`, left: '50%',
      transform: 'translateX(-50%)',
      padding: '0.6rem 2rem', background: '#c00', color: '#fff',
      border: 'none', borderRadius: '0.4rem',
      fontFamily: 'sans-serif', fontSize: '1rem', cursor: 'pointer', zIndex: '6',
    })
    this.stopBtnEl.addEventListener('click', () => this.onDotTap())

    this.confirmBtnEl = doc.createElement('button')
    this.confirmBtnEl.textContent = 'Confirm'
    this.confirmBtnEl.setAttribute('data-testid', 'confirm-btn')
    this.confirmBtnEl.hidden = true
    Object.assign(this.confirmBtnEl.style, {
      position: 'fixed', bottom: `${Math.round(vh * 0.08)}px`, left: '50%',
      transform: 'translateX(-50%)',
      padding: '0.6rem 2rem', background: '#0c0', color: '#fff',
      border: 'none', borderRadius: '0.4rem',
      fontFamily: 'sans-serif', fontSize: '1rem', cursor: 'pointer', zIndex: '6',
    })
    this.confirmBtnEl.addEventListener('click', () => this.onConfirm())

    this.summaryPanelEl = doc.createElement('div')
    this.summaryPanelEl.setAttribute('data-testid', 'summary-panel')
    this.summaryPanelEl.hidden = true
    Object.assign(this.summaryPanelEl.style, {
      position: 'fixed', top: '4.5rem', left: '0.75rem', right: '0.75rem',
      background: 'rgba(0,0,0,0.65)',
      color: '#fff', fontFamily: 'monospace', fontSize: '0.75rem',
      lineHeight: '1.5', zIndex: '8',
      padding: '0.6rem 0.75rem',
      borderRadius: '0.4rem',
    })

    this.exportBtnEl = doc.createElement('button')
    this.exportBtnEl.textContent = 'Export JSON'
    this.exportBtnEl.setAttribute('data-testid', 'export-btn')
    this.exportBtnEl.disabled = true
    this.exportBtnEl.hidden = true
    Object.assign(this.exportBtnEl.style, {
      position: 'fixed', bottom: '1.5rem', right: '1rem',
      padding: '0.5rem 0.75rem', background: '#06f', color: '#fff',
      border: 'none', borderRadius: '0.4rem',
      fontFamily: 'sans-serif', fontSize: '0.85rem', cursor: 'pointer', zIndex: '8',
    })

    this.nextCycleBtnEl = doc.createElement('button')
    this.nextCycleBtnEl.textContent = 'Next Cycle'
    this.nextCycleBtnEl.setAttribute('data-testid', 'next-cycle-btn')
    this.nextCycleBtnEl.hidden = true
    Object.assign(this.nextCycleBtnEl.style, {
      position: 'fixed', bottom: '1.5rem', left: '1rem',
      padding: '0.5rem 0.75rem', background: '#555', color: '#fff',
      border: 'none', borderRadius: '0.4rem',
      fontFamily: 'sans-serif', fontSize: '0.85rem', cursor: 'pointer', zIndex: '8',
    })
    this.nextCycleBtnEl.addEventListener('click', () => this.transitionToIdle())
    this.exportBtnEl.addEventListener('click', () => this.exportJson())

    this.ghostOverlayEl = doc.createElement('img')
    this.ghostOverlayEl.setAttribute('data-testid', 'ghost-overlay')
    this.ghostOverlayEl.alt = ''
    Object.assign(this.ghostOverlayEl.style, {
      position: 'fixed', inset: '0',
      width: '100%', height: '100%',
      objectFit: 'cover',
      opacity: '0.5',
      pointerEvents: 'none',
      display: 'none',
      zIndex: '1',
      willChange: 'transform',
    })

    const overlay = doc.createElement('div')
    Object.assign(overlay.style, { position: 'fixed', inset: '0', zIndex: '2' })
    overlay.appendChild(this.rectangleEl)
    overlay.appendChild(this.hintEl)

    const commitBadge = doc.createElement('div')
    commitBadge.textContent = `v ${__GIT_COMMIT__}`
    Object.assign(commitBadge.style, {
      position: 'fixed', top: '0', left: '0', right: '0',
      textAlign: 'center', fontSize: '11px', color: 'rgba(255,255,255,0.5)',
      zIndex: '10', pointerEvents: 'none', padding: '2px 0',
    })

    root.appendChild(this.videoEl)
    root.appendChild(this.ghostOverlayEl)
    root.appendChild(this.warnBannerEl)
    root.appendChild(commitBadge)
    root.appendChild(this.telemetryEl)
    root.appendChild(overlay)
    root.appendChild(this.recordingIndicatorEl)
    root.appendChild(this.stopBtnEl)
    root.appendChild(this.confirmBtnEl)
    root.appendChild(this.summaryPanelEl)
    root.appendChild(this.exportBtnEl)
    root.appendChild(this.nextCycleBtnEl)

    this.onDocMouseMove = (e: MouseEvent) => this.moveDrag(e.clientX, e.clientY)
    this.onDocMouseUp = () => this.stopDrag()
    this.onDocTouchMove = (e: Event) => {
      if (!this.dragStartTouch) return
      const t = (e as TouchEvent).touches[0]
      if (t) { e.preventDefault(); this.moveDrag(t.clientX, t.clientY) }
    }
    this.onDocTouchEnd = () => this.stopDrag()

    doc.addEventListener('mousemove', this.onDocMouseMove)
    doc.addEventListener('mouseup', this.onDocMouseUp)
    doc.addEventListener('touchmove', this.onDocTouchMove, { passive: false })
    doc.addEventListener('touchend', this.onDocTouchEnd)

    this.orientationHandler = (ev: Event) => {
      const e = ev as DeviceOrientationEvent
      this.betaDeg = e.beta
    }
    this.win.addEventListener('deviceorientation', this.orientationHandler)

    this.motionHandler = (ev: Event) => {
      const e = ev as DeviceMotionEvent
      const rr = e.rotationRate
      const ac = e.acceleration
      if (rr) {
        this.sensorVals.gx = (rr.alpha ?? 0) * (Math.PI / 180)
        this.sensorVals.gy = (rr.beta ?? 0) * (Math.PI / 180)
        this.sensorVals.gz = (rr.gamma ?? 0) * (Math.PI / 180)
      }
      if (ac) {
        this.sensorVals.ax = ac.x ?? 0
        this.sensorVals.ay = ac.y ?? 0
        this.sensorVals.az = ac.z ?? 0
      }

      // Gyro API path records its own SensorFrames in the wrapped onreading — skip here to avoid duplicates.
      if (!this.gyro && this.phase === 'recording' && this.currentCycle?.frames) {
        const frame: SensorFrame = {
          t: this.nowFn() - this.recordingStartedAt,
          gx: this.sensorVals.gx,
          gy: this.sensorVals.gy,
          gz: this.sensorVals.gz,
          ax: this.sensorVals.ax,
          ay: this.sensorVals.ay,
          az: this.sensorVals.az,
          betaDeg: this.betaDeg,
        }
        this.currentCycle.frames.push(frame)
      }

      this.renderTelemetry()
    }
    this.win.addEventListener('devicemotion', this.motionHandler)

    // Pipeline handles gyro integration and RAF-driven rendering (enableMotionGate: false for continuous recording).
    this.pipeline = new GhostMotionPipeline({
      gyro: this.gyro,
      displayWidth: () => this.win.innerWidth || FALLBACK_VW,
      displayHeight: () => this.win.innerHeight || FALLBACK_VH,
      getOrientation: this.getOrientation,
      onFrame: (frame) => this.onPipelineFrame(frame),
      enableMotionGate: false,
      requestAnimationFrame: this.raf,
      cancelAnimationFrame: this.caf,
      now: this.nowFn,
    })

    // Wrap gyro.onreading (set by pipeline constructor) to also record SensorFrames and update telemetry.
    if (this.gyro) {
      const pipelineOnReading = this.gyro.onreading
      this.gyro.onreading = () => {
        pipelineOnReading?.()
        const g = this.gyro!
        const gx = g.x ?? 0, gy = g.y ?? 0, gz = g.z ?? 0
        const pState = this.pipeline.getState()
        const w = this.win.innerWidth || FALLBACK_VW
        const h = this.win.innerHeight || FALLBACK_VH
        const shiftPx = computeShiftPx(pState.yawRad, w)
        const shiftPy = computeShiftPy(pState.pitchRad, w, h)
        this.lastYawRad = pState.yawRad
        this.lastPitchRad = pState.pitchRad
        this.latestFrame = {
          t: this.nowFn(), yawRad: pState.yawRad, pitchRad: pState.pitchRad,
          shiftPx, pitchShiftPx: shiftPy, dx_m: 0, dy_m: 0, gateOpen: true,
        }
        if (this.phase === 'recording' && this.currentCycle?.frames) {
          this.currentCycle.frames.push({
            t: this.nowFn() - this.recordingStartedAt,
            gx, gy, gz,
            ax: this.sensorVals.ax, ay: this.sensorVals.ay, az: this.sensorVals.az,
          })
        }
        this.renderTelemetry()
      }
    }

    void this.startCamera(deps.getUserMedia)
  }

  private onPipelineFrame(frame: GhostFrame): void {
    this.lastYawRad = frame.yawRad
    this.lastPitchRad = frame.pitchRad
    const vw = this.win.innerWidth || FALLBACK_VW
    const vh = this.win.innerHeight || FALLBACK_VH
    const shiftPx = computeShiftPx(frame.yawRad, vw)
    const shiftPy = computeShiftPy(frame.pitchRad, vw, vh)
    this.latestFrame = {
      t: frame.t, yawRad: frame.yawRad, pitchRad: frame.pitchRad,
      shiftPx, pitchShiftPx: shiftPy, dx_m: frame.dx_m, dy_m: frame.dy_m, gateOpen: true,
    }

    if (this.phase === 'recording') {
      this.rectangleEl.style.left = `${this.rectInitLeft + Math.round(shiftPx)}px`
      this.rectangleEl.style.top = `${this.rectInitTop + Math.round(shiftPy)}px`
      this.ghostOverlayEl.style.transform = `translate3d(${shiftPx.toFixed(2)}px, ${shiftPy.toFixed(2)}px, 0)`
      const elapsed = frame.t - this.recordingStartedAt
      this.timerSpanEl.textContent = msToMMSS(elapsed)
      if (this.currentCycle?.ghostFrames) {
        this.currentCycle.ghostFrames.push({
          t: elapsed, yawRad: frame.yawRad, pitchRad: frame.pitchRad,
          shiftPx, pitchShiftPx: shiftPy, dx_m: frame.dx_m, dy_m: frame.dy_m, gateOpen: true,
        })
      }
    }

    this.renderTelemetry()
  }

  private async startCamera(getUserMedia?: CalibrationPageDeps['getUserMedia']): Promise<void> {
    const gum = getUserMedia ?? navigator.mediaDevices?.getUserMedia?.bind(navigator.mediaDevices)
    if (!gum) { this.showCameraWarning(); return }
    try {
      const stream = await gum({ video: { facingMode: 'environment' } })
      if (this.destroyed) { stream.getTracks().forEach(t => t.stop()); return }
      this.stream = stream
      this.videoEl.srcObject = stream
    } catch {
      this.showCameraWarning()
    }
  }

  private showCameraWarning(): void {
    this.warnBannerEl.style.display = 'block'
  }

  private renderTelemetry(): void {
    const { gx, gy, gz, ax, ay, az } = this.sensorVals
    const omegaMag = Math.sqrt(gx * gx + gy * gy + gz * gz)
    const f = this.latestFrame
    const paused = this.phase === 'repositioning' || this.phase === 'captured'
    const yawDeg = paused ? 'PAUSED' : (f ? (f.yawRad * 180 / Math.PI).toFixed(1) : '0.0')
    const pitchDeg = paused ? 'PAUSED' : (f ? (f.pitchRad * 180 / Math.PI).toFixed(1) : '0.0')
    const shiftPx = paused ? 'PAUSED' : (f ? f.shiftPx.toFixed(0) : '0')
    const gateStr = paused ? 'PAUSED' : (f?.gateOpen ? 'OPEN' : 'CLOSED')
    this.telemetryEl.textContent = [
      `gx ${fmt(gx)}  gy ${fmt(gy)}  gz ${fmt(gz)} rad/s`,
      `ax ${fmt(ax)}  ay ${fmt(ay)}  az ${fmt(az)} m/s²`,
      `Motion gate: ${gateStr}  |ω|: ${omegaMag.toFixed(3)} rad/s`,
      `Yaw: ${yawDeg}°  Pitch: ${pitchDeg}°  Shift: ${shiftPx} px`,
    ].join('\n')
  }

  private onCenterTap(): void {
    if (this.phase === 'idle') this.transitionToRecording()
    else if (this.phase === 'repositioning') this.onConfirm()
  }

  private onDotTap(): void {
    if (this.phase !== 'recording') return
    this.transitionToRepositioning()
  }

  private transitionToRecording(): void {
    this.phase = 'recording'
    this.hintEl.textContent = 'RECORDING — tap any dot to stop'
    this.centerDotEl.classList.remove('ghost-center-dot')

    this.recordingStartedAt = this.nowFn()
    this.pipeline.reset()
    this.lastYawRad = 0
    this.lastPitchRad = 0

    const startSnapshot = this.captureSnapshotFn(this.videoEl)
    if (startSnapshot) {
      this.ghostOverlayEl.src = startSnapshot
      this.ghostOverlayEl.style.display = ''
      this.ghostOverlayEl.style.transform = 'translate3d(0px, 0px, 0)'
    }

    this.currentCycle = {
      id: crypto.randomUUID(),
      startedAt: this.recordingStartedAt,
      rectangleSize: { width: this.rectW, height: this.rectH },
      startPosition: { x: Math.round(this.rectInitLeft + this.rectW / 2), y: Math.round(this.rectInitTop + this.rectH / 2) },
      frames: [],
      ghostFrames: [],
      startSnapshot,
    }

    this.recordingIndicatorEl.hidden = false
    this.stopBtnEl.hidden = false
  }

  private transitionToRepositioning(): void {
    this.phase = 'repositioning'

    const endedAt = this.nowFn()
    if (this.currentCycle) {
      this.currentCycle.endedAt = endedAt
      this.currentCycle.endSnapshot = this.captureSnapshotFn(this.videoEl)
      const left = (parseInt(this.rectangleEl.style.left, 10) || 0)
      const top = (parseInt(this.rectangleEl.style.top, 10) || 0)
      this.currentCycle.algorithmPosition = {
        x: left + this.rectW / 2,
        y: top + this.rectH / 2,
      }
    }

    this.ghostOverlayEl.style.display = 'none'
    this.recordingIndicatorEl.hidden = true
    this.stopBtnEl.hidden = true
    this.hintEl.textContent = 'DRAG rectangle to its true position, then tap Confirm'
    this.rectangleEl.style.background = 'rgba(255,255,255,0.15)'
    this.confirmBtnEl.hidden = false
    this.renderTelemetry()
  }

  private startDrag(clientX: number, clientY: number): void {
    if (this.phase !== 'repositioning') return
    this.dragStartTouch = { clientX, clientY }
    this.dragStartRect = {
      left: (parseInt(this.rectangleEl.style.left, 10) || 0) || 0,
      top: (parseInt(this.rectangleEl.style.top, 10) || 0) || 0,
    }
  }

  private moveDrag(clientX: number, clientY: number): void {
    if (this.phase !== 'repositioning' || !this.dragStartTouch) return
    const dx = clientX - this.dragStartTouch.clientX
    const dy = clientY - this.dragStartTouch.clientY
    this.rectangleEl.style.left = `${Math.round(this.dragStartRect.left + dx)}px`
    this.rectangleEl.style.top = `${Math.round(this.dragStartRect.top + dy)}px`
  }

  private stopDrag(): void {
    this.dragStartTouch = null
  }

  private onConfirm(): void {
    if (this.phase !== 'repositioning' || !this.currentCycle) return
    const left = (parseInt(this.rectangleEl.style.left, 10) || 0)
    const top = (parseInt(this.rectangleEl.style.top, 10) || 0)
    const gtX = left + this.rectW / 2
    const gtY = top + this.rectH / 2
    this.currentCycle.groundTruthPosition = { x: gtX, y: gtY }
    this.currentCycle.returnYawRad = this.lastYawRad
    this.currentCycle.returnPitchRad = this.lastPitchRad
    const alg = this.currentCycle.algorithmPosition
    if (!alg) return
    this.currentCycle.deltaPixels = { x: gtX - alg.x, y: gtY - alg.y }
    this.cycles.push(this.currentCycle as CalibrationCycle)
    this.transitionToCaptured()
  }

  private transitionToCaptured(): void {
    this.phase = 'captured'
    this.confirmBtnEl.hidden = true
    this.hintEl.hidden = true
    this.rectangleEl.style.background = ''

    const cycle = this.cycles.at(-1)
    if (!cycle) return

    const vw = this.win.innerWidth || FALLBACK_VW
    const fl = focalLengthPx(vw)
    const durationMs = (cycle.endedAt ?? cycle.startedAt) - cycle.startedAt
    const lastGhostYawDeg = (cycle.ghostFrames.at(-1)?.yawRad ?? 0) * 180 / Math.PI
    const effectiveYawErrDeg = Math.atan(cycle.deltaPixels.x / fl) * 180 / Math.PI
    const returnYawDeg = (cycle.returnYawRad ?? 0) * 180 / Math.PI
    const returnPitchDeg = (cycle.returnPitchRad ?? 0) * 180 / Math.PI

    this.summaryPanelEl.replaceChildren()
    const pre = this.doc.createElement('pre')
    pre.setAttribute('data-testid', 'summary-text')
    pre.style.cssText = 'margin:0; white-space:pre;'
    pre.appendChild(this.doc.createTextNode([
      `Cycle ${this.cycles.length} complete`,
      `Duration: ${durationMs.toFixed(0)} ms`,
      `Frames: ${cycle.frames.length} sensor  /  ${cycle.ghostFrames.length} ghost`,
      `Δx: ${cycle.deltaPixels.x.toFixed(1)} px   Δy: ${cycle.deltaPixels.y.toFixed(1)} px`,
      `Algorithm yaw at end: ${lastGhostYawDeg.toFixed(2)}°`,
      `Effective yaw error: ${effectiveYawErrDeg.toFixed(2)}°`,
      `Return drift — yaw: ${returnYawDeg.toFixed(2)}°  pitch: ${returnPitchDeg.toFixed(2)}°`,
    ].join('\n')))
    this.summaryPanelEl.appendChild(pre)

    this.exportBtnEl.disabled = false
    this.exportBtnEl.hidden = false
    this.nextCycleBtnEl.hidden = false
    this.summaryPanelEl.hidden = false
    this.renderTelemetry()
  }

  private exportJson(): void {
    const vw = this.win.innerWidth || FALLBACK_VW
    const now = new Date()
    const payload: CalibrationExport = {
      exportedAt: now.toISOString(),
      deviceInfo: {
        viewportWidth: vw,
        viewportHeight: this.win.innerHeight || FALLBACK_VH,
        devicePixelRatio: this.win.devicePixelRatio ?? 1,
        userAgent: this.win.navigator?.userAgent ?? '',
      },
      orientation: this.getOrientation(),
      hFovDeg: H_FOV_DEG,
      focalLengthPx: focalLengthPx(vw),
      cycles: this.cycles,
    }
    const ts = now.toISOString().replace(/[:.]/g, '-').slice(0, 19)
    this.triggerDownload(`ghost-calibration-${ts}.json`, JSON.stringify(payload, null, 2))
  }

  private transitionToIdle(): void {
    // Persist the current GT rectangle position as the starting reference for the next cycle.
    const curLeft = (parseInt(this.rectangleEl.style.left, 10) || 0)
    const curTop  = parseInt(this.rectangleEl.style.top,  10)
    if (!isNaN(curLeft)) this.rectInitLeft = curLeft
    if (!isNaN(curTop))  this.rectInitTop  = curTop

    this.phase = 'idle'
    this.currentCycle = null
    this.pipeline.reset()
    this.lastYawRad = 0
    this.lastPitchRad = 0
    this.latestFrame = null
    this.dragStartTouch = null

    this.ghostOverlayEl.style.display = 'none'
    this.ghostOverlayEl.src = ''
    this.summaryPanelEl.hidden = true
    this.exportBtnEl.hidden = true
    this.nextCycleBtnEl.hidden = true
    this.hintEl.textContent = 'TAP CENTER TO START'
    this.hintEl.hidden = false
    this.centerDotEl.classList.add('ghost-center-dot')

    // Reset rectangle to initial centered position
    this.rectangleEl.style.left = `${this.rectInitLeft}px`
    this.rectangleEl.style.top = `${this.rectInitTop}px`
    this.rectangleEl.style.background = ''

    this.renderTelemetry()
  }

  getPhase(): Phase { return this.phase }
  getCenterDot(): HTMLElement { return this.centerDotEl }
  getConfirmBtn(): HTMLButtonElement { return this.confirmBtnEl }
  getExportBtn(): HTMLButtonElement { return this.exportBtnEl }
  getNextCycleBtn(): HTMLButtonElement { return this.nextCycleBtnEl }
  getSummaryPanel(): HTMLElement { return this.summaryPanelEl }
  getTelemetryEl(): HTMLElement { return this.telemetryEl }
  getCurrentCycle(): Partial<CalibrationCycle> | null { return this.currentCycle }
  getCycles(): CalibrationCycle[] { return this.cycles }

  destroy(): void {
    this.destroyed = true
    this.pipeline.destroy()
    this.win.removeEventListener('devicemotion', this.motionHandler)
    this.win.removeEventListener('deviceorientation', this.orientationHandler)
    this.doc.removeEventListener('mousemove', this.onDocMouseMove)
    this.doc.removeEventListener('mouseup', this.onDocMouseUp)
    this.doc.removeEventListener('touchmove', this.onDocTouchMove)
    this.doc.removeEventListener('touchend', this.onDocTouchEnd)
    this.stream?.getTracks().forEach(t => t.stop())
    this.root.replaceChildren()
  }
}
