import type { GyroLike } from './ghostOverlayCanvas'
import type { AccelerometerLike } from './imuRecorder'

const DEG_TO_RAD = Math.PI / 180

export class DeviceMotionGyroAdapter implements GyroLike {
  onreading: (() => void) | null = null
  onerror: ((e: Event) => void) | null = null
  x: number | null = null
  y: number | null = null
  z: number | null = null
  timestamp: DOMHighResTimeStamp | null = null

  private readonly win: Window
  private readonly handler: (e: DeviceMotionEvent) => void

  constructor(win: Window) {
    this.win = win
    this.handler = (e: DeviceMotionEvent) => {
      const r = e.rotationRate
      this.x = r?.beta != null ? r.beta * DEG_TO_RAD : null
      this.y = r?.gamma != null ? r.gamma * DEG_TO_RAD : null
      this.z = r?.alpha != null ? r.alpha * DEG_TO_RAD : null
      this.timestamp = e.timeStamp
      this.onreading?.()
    }
  }

  start() {
    this.win.addEventListener('devicemotion', this.handler)
  }

  stop() {
    this.win.removeEventListener('devicemotion', this.handler)
  }
}

export class DeviceMotionAccelAdapter implements AccelerometerLike {
  onreading: ((ev: Event) => void) | null = null
  onerror: ((ev: { error: DOMException }) => void) | null = null
  x: number | null = null
  y: number | null = null
  z: number | null = null
  timestamp: DOMHighResTimeStamp | null = null

  private readonly win: Window
  private readonly handler: (e: DeviceMotionEvent) => void

  constructor(win: Window) {
    this.win = win
    this.handler = (e: DeviceMotionEvent) => {
      const a = e.accelerationIncludingGravity
      this.x = a?.x ?? null
      this.y = a?.y ?? null
      this.z = a?.z ?? null
      this.timestamp = e.timeStamp
      this.onreading?.({} as Event)
    }
  }

  start() {
    this.win.addEventListener('devicemotion', this.handler)
  }

  stop() {
    this.win.removeEventListener('devicemotion', this.handler)
  }
}
