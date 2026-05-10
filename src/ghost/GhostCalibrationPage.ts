import type { GhostFrame, GyroLike } from '../sensors/ghostOverlayCanvas'
import { initialGhostState, feedGhostGyro, computeShiftPx } from '../sensors/ghostOverlay'
import type { GhostOverlayState } from '../sensors/ghostOverlay'
import type { Phase, SensorFrame, CalibrationCycle, CalibrationExport } from './types'

const DOT_PX = 24
const DOT_COLOR = '#FF3B30'
const RECT_W_RATIO = 0.6
const RECT_H_RATIO = 0.4
const H_FOV_DEG = 65

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
}

export function focalLengthPx(viewportWidth: number, hFovDeg = H_FOV_DEG): number {
  return (viewportWidth / 2) / Math.tan((hFovDeg / 2) * Math.PI / 180)
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
  private readonly win: WindowLike

  private readonly doc: Document
  private readonly gyro: GyroLike | null
  private readonly raf: (cb: FrameRequestCallback) => number
  private readonly caf: (id: number) => void
  private readonly nowFn: () => number
  private readonly triggerDownload: (filename: string, json: string) => void

  private cycles: CalibrationCycle[] = []
  private currentCycle: Partial<CalibrationCycle> | null = null
  private ghostState: GhostOverlayState = initialGhostState()
  private latestShiftPx = 0
  private recordingStartedAt = 0
  private recordingRafId = 0

  private dragStartTouch: { clientX: number; clientY: number } | null = null
  private dragStartRect = { left: 0, top: 0 }

  private readonly onDocMouseMove: (e: MouseEvent) => void
  private readonly onDocMouseUp: () => void
  private readonly onDocTouchMove: (e: Event) => void
  private readonly onDocTouchEnd: () => void

  private readonly rectInitLeft: number
  private readonly rectInitTop: number
  private readonly rectW: number
  private readonly rectH: number

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

    const vw = this.win.innerWidth || 375
    const vh = this.win.innerHeight || 667
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
      position: 'fixed', inset: '0',
      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
      background: 'rgba(0,0,0,0.85)',
      color: '#fff', fontFamily: 'monospace', fontSize: '0.9rem',
      lineHeight: '1.8', textAlign: 'center', zIndex: '8',
      padding: '2rem',
    })

    this.exportBtnEl = doc.createElement('button')
    this.exportBtnEl.textContent = 'Export JSON'
    this.exportBtnEl.setAttribute('data-testid', 'export-btn')
    this.exportBtnEl.disabled = true
    Object.assign(this.exportBtnEl.style, {
      marginTop: '1.5rem',
      padding: '0.6rem 2rem', background: '#06f', color: '#fff',
      border: 'none', borderRadius: '0.4rem',
      fontFamily: 'sans-serif', fontSize: '1rem', cursor: 'pointer',
    })

    this.nextCycleBtnEl = doc.createElement('button')
    this.nextCycleBtnEl.textContent = 'Next Cycle'
    this.nextCycleBtnEl.setAttribute('data-testid', 'next-cycle-btn')
    Object.assign(this.nextCycleBtnEl.style, {
      marginTop: '0.75rem',
      padding: '0.6rem 2rem', background: '#555', color: '#fff',
      border: 'none', borderRadius: '0.4rem',
      fontFamily: 'sans-serif', fontSize: '1rem', cursor: 'pointer',
    })
    this.nextCycleBtnEl.addEventListener('click', () => this.transitionToIdle())
    this.exportBtnEl.addEventListener('click', () => this.exportJson())

    this.summaryPanelEl.appendChild(this.exportBtnEl)
    this.summaryPanelEl.appendChild(this.nextCycleBtnEl)

    const overlay = doc.createElement('div')
    Object.assign(overlay.style, { position: 'fixed', inset: '0', zIndex: '2' })
    overlay.appendChild(this.rectangleEl)
    overlay.appendChild(this.hintEl)

    root.appendChild(this.videoEl)
    root.appendChild(this.warnBannerEl)
    root.appendChild(this.telemetryEl)
    root.appendChild(overlay)
    root.appendChild(this.recordingIndicatorEl)
    root.appendChild(this.stopBtnEl)
    root.appendChild(this.confirmBtnEl)
    root.appendChild(this.summaryPanelEl)

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
      this.renderTelemetry()
    }
    this.win.addEventListener('devicemotion', this.motionHandler)

    if (this.gyro) {
      this.gyro.onreading = () => this.onGyroReading()
      this.gyro.onerror = null
      this.gyro.start()
    }

    void this.startCamera(deps.getUserMedia)
  }

  private onGyroReading(): void {
    const g = this.gyro!
    const t = g.timestamp ?? this.nowFn()
    const gx = g.x ?? 0
    const gy = g.y ?? 0
    const gz = g.z ?? 0

    this.ghostState = feedGhostGyro(this.ghostState, { t, gx, gy, gz }, 'y')
    this.latestShiftPx = computeShiftPx(this.ghostState.yawIntegral, this.win.innerWidth || 375)

    this.latestFrame = {
      t: this.nowFn(),
      yawRad: this.ghostState.yawIntegral,
      pitchRad: this.ghostState.pitchIntegral,
      shiftPx: this.latestShiftPx,
      pitchShiftPx: 0,
      gateOpen: true,
    }
    this.renderTelemetry()

    if (this.phase === 'recording' && this.currentCycle?.frames) {
      const frame: SensorFrame = {
        t: this.nowFn() - this.recordingStartedAt,
        gx, gy, gz,
        ax: this.sensorVals.ax,
        ay: this.sensorVals.ay,
        az: this.sensorVals.az,
      }
      this.currentCycle.frames.push(frame)
    }
  }

  private readonly recordingRafLoop: FrameRequestCallback = () => {
    if (this.phase !== 'recording' || this.destroyed) return
    this.recordingRafId = this.raf(this.recordingRafLoop)

    const shiftPx = this.latestShiftPx
    this.rectangleEl.style.left = `${this.rectInitLeft + Math.round(shiftPx)}px`

    const elapsed = this.nowFn() - this.recordingStartedAt
    this.timerSpanEl.textContent = msToMMSS(elapsed)

    if (this.currentCycle?.ghostFrames) {
      const ghostFrame: GhostFrame = {
        t: elapsed,
        yawRad: this.ghostState.yawIntegral,
        pitchRad: this.ghostState.pitchIntegral,
        shiftPx,
        pitchShiftPx: 0,
        gateOpen: true,
      }
      this.currentCycle.ghostFrames.push(ghostFrame)
    }
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

    const vw = this.win.innerWidth || 375
    const vh = this.win.innerHeight || 667
    this.recordingStartedAt = this.nowFn()
    this.ghostState = initialGhostState()
    this.latestShiftPx = 0

    this.currentCycle = {
      id: crypto.randomUUID(),
      startedAt: this.recordingStartedAt,
      rectangleSize: { width: this.rectW, height: this.rectH },
      startPosition: { x: Math.round(vw / 2), y: Math.round(vh / 2) },
      frames: [],
      ghostFrames: [],
    }

    this.recordingIndicatorEl.hidden = false
    this.stopBtnEl.hidden = false
    this.recordingRafId = this.raf(this.recordingRafLoop)
  }

  private transitionToRepositioning(): void {
    this.phase = 'repositioning'
    this.caf(this.recordingRafId)
    this.recordingRafId = 0

    const endedAt = this.nowFn()
    if (this.currentCycle) {
      this.currentCycle.endedAt = endedAt
      const left = parseInt(this.rectangleEl.style.left, 10)
      const top = parseInt(this.rectangleEl.style.top, 10)
      this.currentCycle.algorithmPosition = {
        x: left + this.rectW / 2,
        y: top + this.rectH / 2,
      }
    }

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
      left: parseInt(this.rectangleEl.style.left, 10),
      top: parseInt(this.rectangleEl.style.top, 10),
    }
  }

  private moveDrag(clientX: number, clientY: number): void {
    if (this.phase !== 'repositioning' || !this.dragStartTouch) return
    const dx = clientX - this.dragStartTouch.clientX
    const dy = clientY - this.dragStartTouch.clientY
    const vw = this.win.innerWidth || 375
    const vh = this.win.innerHeight || 667
    const newLeft = Math.max(0, Math.min(vw - this.rectW, this.dragStartRect.left + dx))
    const newTop = Math.max(0, Math.min(vh - this.rectH, this.dragStartRect.top + dy))
    this.rectangleEl.style.left = `${Math.round(newLeft)}px`
    this.rectangleEl.style.top = `${Math.round(newTop)}px`
  }

  private stopDrag(): void {
    this.dragStartTouch = null
  }

  private onConfirm(): void {
    if (this.phase !== 'repositioning' || !this.currentCycle) return
    const left = parseInt(this.rectangleEl.style.left, 10)
    const top = parseInt(this.rectangleEl.style.top, 10)
    const gtX = left + this.rectW / 2
    const gtY = top + this.rectH / 2
    this.currentCycle.groundTruthPosition = { x: gtX, y: gtY }
    this.currentCycle.returnYawRad = this.ghostState.yawIntegral
    this.currentCycle.returnPitchRad = this.ghostState.pitchIntegral
    const alg = this.currentCycle.algorithmPosition
    if (!alg) return
    this.currentCycle.deltaPixels = { x: gtX - alg.x, y: gtY - alg.y }
    this.cycles.push(this.currentCycle as CalibrationCycle)
    this.transitionToCaptured()
  }

  private transitionToCaptured(): void {
    this.phase = 'captured'
    this.confirmBtnEl.hidden = true
    this.rectangleEl.style.background = ''

    const cycle = this.cycles.at(-1)
    if (!cycle) return

    const vw = this.win.innerWidth || 375
    const fl = focalLengthPx(vw)
    const durationMs = (cycle.endedAt ?? cycle.startedAt) - cycle.startedAt
    const lastGhostYawDeg = (cycle.ghostFrames.at(-1)?.yawRad ?? 0) * 180 / Math.PI
    const effectiveYawErrDeg = Math.atan(cycle.deltaPixels.x / fl) * 180 / Math.PI
    const returnYawDeg = (cycle.returnYawRad ?? 0) * 180 / Math.PI
    const returnPitchDeg = (cycle.returnPitchRad ?? 0) * 180 / Math.PI

    // Clear previous text content before the buttons
    while (this.summaryPanelEl.firstChild !== this.exportBtnEl) {
      this.summaryPanelEl.removeChild(this.summaryPanelEl.firstChild!)
    }
    const pre = this.doc.createElement('pre')
    pre.setAttribute('data-testid', 'summary-text')
    pre.style.cssText = 'margin:0 0 1rem; white-space:pre; text-align:left;'
    pre.appendChild(this.doc.createTextNode([
      `Cycle ${this.cycles.length} complete`,
      `Duration: ${durationMs.toFixed(0)} ms`,
      `Frames: ${cycle.frames.length} sensor  /  ${cycle.ghostFrames.length} ghost`,
      `Δx: ${cycle.deltaPixels.x.toFixed(1)} px   Δy: ${cycle.deltaPixels.y.toFixed(1)} px`,
      `Algorithm yaw at end: ${lastGhostYawDeg.toFixed(2)}°`,
      `Effective yaw error: ${effectiveYawErrDeg.toFixed(2)}°`,
      `Return drift — yaw: ${returnYawDeg.toFixed(2)}°  pitch: ${returnPitchDeg.toFixed(2)}°`,
    ].join('\n')))
    this.summaryPanelEl.insertBefore(pre, this.exportBtnEl)

    this.exportBtnEl.disabled = false
    this.summaryPanelEl.hidden = false
    this.renderTelemetry()
  }

  private exportJson(): void {
    const vw = this.win.innerWidth || 375
    const now = new Date()
    const payload: CalibrationExport = {
      exportedAt: now.toISOString(),
      deviceInfo: {
        viewportWidth: vw,
        viewportHeight: this.win.innerHeight || 667,
        devicePixelRatio: this.win.devicePixelRatio ?? 1,
        userAgent: this.win.navigator?.userAgent ?? '',
      },
      hFovDeg: H_FOV_DEG,
      focalLengthPx: focalLengthPx(vw),
      cycles: this.cycles,
    }
    const ts = now.toISOString().replace(/[:.]/g, '-').slice(0, 19)
    this.triggerDownload(`ghost-calibration-${ts}.json`, JSON.stringify(payload, null, 2))
  }

  private transitionToIdle(): void {
    this.phase = 'idle'
    this.currentCycle = null
    this.ghostState = initialGhostState()
    this.latestShiftPx = 0
    this.latestFrame = null
    this.dragStartTouch = null

    this.summaryPanelEl.hidden = true
    this.hintEl.textContent = 'TAP CENTER TO START'
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
  getNextCycleBtn(): HTMLButtonElement { return this.nextCycleBtnEl }
  getSummaryPanel(): HTMLElement { return this.summaryPanelEl }
  getTelemetryEl(): HTMLElement { return this.telemetryEl }
  getCurrentCycle(): Partial<CalibrationCycle> | null { return this.currentCycle }
  getCycles(): CalibrationCycle[] { return this.cycles }

  destroy(): void {
    this.destroyed = true
    this.caf(this.recordingRafId)
    if (this.gyro) this.gyro.onreading = null
    this.win.removeEventListener('devicemotion', this.motionHandler)
    this.doc.removeEventListener('mousemove', this.onDocMouseMove)
    this.doc.removeEventListener('mouseup', this.onDocMouseUp)
    this.doc.removeEventListener('touchmove', this.onDocTouchMove)
    this.doc.removeEventListener('touchend', this.onDocTouchEnd)
    this.gyro?.stop()
    this.stream?.getTracks().forEach(t => t.stop())
    this.root.replaceChildren()
  }
}
