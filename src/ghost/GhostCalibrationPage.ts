import type { GhostFrame } from '../sensors/ghostOverlayCanvas'
import type { Phase } from './types'

const DOT_PX = 24
const DOT_COLOR = '#FF3B30'
const RECT_W_RATIO = 0.6
const RECT_H_RATIO = 0.4

export type WindowLike = {
  addEventListener: (type: string, cb: EventListenerOrEventListenerObject) => void
  removeEventListener: (type: string, cb: EventListenerOrEventListenerObject) => void
  innerWidth: number
  innerHeight: number
}

export type CalibrationPageDeps = {
  getUserMedia?: (constraints: MediaStreamConstraints) => Promise<MediaStream>
  win?: WindowLike
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

export class GhostCalibrationPage {
  private readonly videoEl: HTMLVideoElement
  private readonly warnBannerEl: HTMLElement
  private readonly telemetryEl: HTMLElement
  private readonly rectangleEl: HTMLElement
  private readonly centerDotEl: HTMLElement
  private readonly hintEl: HTMLElement

  private phase: Phase = 'idle'
  private latestFrame: GhostFrame | null = null
  private stream: MediaStream | null = null
  private destroyed = false

  private sensorVals = { gx: 0, gy: 0, gz: 0, ax: 0, ay: 0, az: 0 }
  private readonly motionHandler: EventListenerOrEventListenerObject
  private readonly win: WindowLike

  constructor(
    private readonly root: HTMLElement,
    deps: CalibrationPageDeps = {}
  ) {
    this.win = deps.win ?? (typeof window !== 'undefined'
      ? window
      : { addEventListener: () => {}, removeEventListener: () => {}, innerWidth: 375, innerHeight: 667 })

    const doc = root.ownerDocument ?? document
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

    this.rectangleEl = doc.createElement('div')
    this.rectangleEl.setAttribute('data-testid', 'calibration-rectangle')
    Object.assign(this.rectangleEl.style, {
      position: 'absolute',
      left: `${rx}px`, top: `${ry}px`,
      width: `${rw}px`, height: `${rh}px`,
      border: `2px solid ${DOT_COLOR}`,
      boxSizing: 'border-box',
    })

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

    const overlay = doc.createElement('div')
    Object.assign(overlay.style, { position: 'fixed', inset: '0', zIndex: '2' })
    overlay.appendChild(this.rectangleEl)
    overlay.appendChild(this.hintEl)

    root.appendChild(this.videoEl)
    root.appendChild(this.warnBannerEl)
    root.appendChild(this.telemetryEl)
    root.appendChild(overlay)

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

    void this.startCamera(deps.getUserMedia)
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
    const yawDeg = f ? (f.yawRad * 180 / Math.PI).toFixed(1) : '0.0'
    const pitchDeg = f ? (f.pitchRad * 180 / Math.PI).toFixed(1) : '0.0'
    const shiftPx = f ? f.shiftPx.toFixed(0) : '0'
    const gateStr = f?.gateOpen ? 'OPEN' : 'CLOSED'
    this.telemetryEl.textContent = [
      `gx ${fmt(gx)}  gy ${fmt(gy)}  gz ${fmt(gz)} rad/s`,
      `ax ${fmt(ax)}  ay ${fmt(ay)}  az ${fmt(az)} m/s²`,
      `Motion gate: ${gateStr}  |ω|: ${omegaMag.toFixed(3)} rad/s`,
      `Yaw: ${yawDeg}°  Pitch: ${pitchDeg}°  Shift: ${shiftPx} px`,
    ].join('\n')
  }

  private onCenterTap(): void {
    if (this.phase === 'idle') this.transitionToRecording()
  }

  private onDotTap(): void {
    if (this.phase !== 'recording') return
    this.transitionToRepositioning()
  }

  private transitionToRecording(): void {
    this.phase = 'recording'
    this.hintEl.textContent = 'RECORDING — tap any dot to stop'
    this.centerDotEl.classList.remove('ghost-center-dot')
  }

  private transitionToRepositioning(): void {
    this.phase = 'repositioning'
    this.hintEl.textContent = 'DRAG rectangle to its true position, then tap Confirm'
  }

  getPhase(): Phase { return this.phase }
  getCenterDot(): HTMLElement { return this.centerDotEl }
  getTelemetryEl(): HTMLElement { return this.telemetryEl }

  destroy(): void {
    this.destroyed = true
    this.win.removeEventListener('devicemotion', this.motionHandler)
    this.stream?.getTracks().forEach(t => t.stop())
    this.root.replaceChildren()
  }
}
