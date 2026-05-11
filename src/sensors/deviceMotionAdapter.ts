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
      // Firefox Android (non-standard axis assignment vs W3C spec):
      //   alpha → vertical tilt (X device axis) → maps to x (pitch axis in feedGhostGyro)
      //   beta  → horizontal pan (Y device axis) → maps to y (yaw axis in feedGhostGyro)
      //   gamma → in-plane rotation             → maps to z (unused)
      this.x = r?.alpha != null ? r.alpha * DEG_TO_RAD : null
      this.y = r?.beta != null ? r.beta * DEG_TO_RAD : null
      this.z = r?.gamma != null ? r.gamma * DEG_TO_RAD : null
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

// Wraps DeviceMotionEvent linear acceleration as MotionLike for translation tracking.
// Prefers gravity-subtracted `acceleration`; falls back to `accelerationIncludingGravity` when
// the device doesn't support hardware gravity subtraction (common on Firefox Android).
// The betaDeg guard in feedGhostAccel handles gravity leakage when the phone tilts.
export class DeviceMotionLinearAccelAdapter implements MotionLike {
  onreading: (() => void) | null = null
  x: number | null = null
  y: number | null = null
  interval = 16  // default ~60 Hz until first event
  /** True when falling back to accelerationIncludingGravity (gravity not subtracted by hardware). */
  usingRawAccel = false
  get gravitySubtracted(): boolean { return !this.usingRawAccel }

  private readonly win: Window
  private readonly handler: (e: DeviceMotionEvent) => void

  constructor(win: Window) {
    this.win = win
    this.handler = (e: DeviceMotionEvent) => {
      // Prefer hardware gravity-subtracted; fall back to raw (betaDeg guard handles gravity leakage).
      const a = e.acceleration ?? e.accelerationIncludingGravity
      this.usingRawAccel = !e.acceleration
      if (!a) {
        this.x = null
        this.y = null
        return
      }
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
