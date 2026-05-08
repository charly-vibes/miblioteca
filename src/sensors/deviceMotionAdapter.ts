import type { GyroLike, MotionLike } from './ghostOverlayCanvas'
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
      // beta=X (front-back tilt), gamma=Y (left-right tilt), alpha=Z (compass yaw) — matches Generic Sensor API axis convention
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
      this.onreading?.(e as unknown as Event)
    }
  }

  start() {
    this.win.addEventListener('devicemotion', this.handler)
  }

  stop() {
    this.win.removeEventListener('devicemotion', this.handler)
  }
}

// Wraps DeviceMotionEvent.acceleration (gravity-subtracted) as MotionLike for translation tracking.
export class DeviceMotionLinearAccelAdapter implements MotionLike {
  onreading: (() => void) | null = null
  x: number | null = null
  y: number | null = null
  interval = 16  // default ~60 Hz until first event

  private readonly win: Window
  private readonly handler: (e: DeviceMotionEvent) => void

  constructor(win: Window) {
    this.win = win
    this.handler = (e: DeviceMotionEvent) => {
      const a = e.acceleration  // gravity-subtracted; null if unavailable or hardware doesn't support it.
                                 // Some Android devices return non-null but non-zero at rest (no hw subtraction).
      if (!a) return             // skip when gravity-subtracted data is unavailable; stale velocity must not accumulate
      this.x = a.x ?? null
      this.y = a.y ?? null
      this.interval = e.interval || 16  // some browsers report interval=0 when unknown; 16ms (~60Hz) is a safe fallback
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
