import { estimateDisplacement } from './imuMath'
import type { ImuSample } from './imuTrace'
import type { AccelerometerLike } from './imuRecorder'
import { feedAccel, initialSteadinessState } from './steadiness'
import type { SteadinessState } from './steadiness'

export type { AccelerometerLike, ImuSample }

export type IMUSteadinessMonitorOptions = {
  accel?: AccelerometerLike | null
  container: HTMLElement
  /** Called whenever steadiness or orientation state changes */
  onUpdate?: () => void
  /** Returns true when the tilt warning should be suppressed */
  shouldSuppressTiltWarning?: () => boolean
  /** Returns IMU samples between two monotonic timestamps (ms) */
  getImuSlice?: (from: number, to: number) => ImuSample[]
}

export class IMUSteadinessMonitor {
  private steadinessState: SteadinessState = initialSteadinessState()
  private latestOrientation_: { alpha: number; beta: number; gamma: number } | null = null
  private onDeviceOrientation: ((ev: Event) => void) | null = null
  private tiltWarnTimer: ReturnType<typeof setTimeout> | null = null
  private tiltWarnEl: HTMLDivElement | null = null

  constructor(private readonly opts: IMUSteadinessMonitorOptions) {}

  get steady(): boolean {
    return this.steadinessState.steady
  }

  get tiltDeg(): number {
    const { window } = this.steadinessState
    if (window.length === 0) return 0
    const n = window.length
    const meanAx = window.reduce((s, p) => s + p.ax, 0) / n
    const meanAy = window.reduce((s, p) => s + p.ay, 0) / n
    const meanAz = window.reduce((s, p) => s + p.az, 0) / n
    return Math.abs(Math.atan2(meanAx, Math.sqrt(meanAy ** 2 + meanAz ** 2)) * (180 / Math.PI))
  }

  get latestOrientation(): { alpha: number; beta: number; gamma: number } | null {
    return this.latestOrientation_
  }

  estimateDisplacementBetween(from: number, to: number): number | undefined {
    const { getImuSlice } = this.opts
    if (!getImuSlice) return undefined
    return estimateDisplacement(getImuSlice(from, to))
  }

  start(): void {
    this.startAccel()
    this.startTiltWarning()
  }

  stop(): void {
    this.stopAccel()
    this.stopTiltWarning()
  }

  private startAccel(): void {
    const accel = this.opts.accel
    if (!accel) return
    this.steadinessState = initialSteadinessState()
    accel.onreading = () => {
      this.steadinessState = feedAccel(this.steadinessState, {
        t: accel.timestamp ?? performance.now(),
        ax: accel.x ?? 0,
        ay: accel.y ?? 0,
        az: accel.z ?? 0,
      })
      this.opts.onUpdate?.()
    }
    accel.onerror = null
    accel.start()
  }

  private stopAccel(): void {
    const accel = this.opts.accel
    if (!accel) return
    accel.onreading = null
    accel.stop()
    this.steadinessState = initialSteadinessState()
  }

  private startTiltWarning(): void {
    this.onDeviceOrientation = (ev: Event) => {
      const alpha = (ev as DeviceOrientationEvent).alpha
      const beta = (ev as DeviceOrientationEvent).beta
      const gamma = (ev as DeviceOrientationEvent).gamma
      this.latestOrientation_ =
        alpha !== null && beta !== null && gamma !== null
          ? { alpha, beta, gamma }
          : null
      const tiltedOff = beta !== null && Math.abs(beta - 90) > 30
      if (tiltedOff) {
        if (!this.tiltWarnTimer) {
          this.tiltWarnTimer = setTimeout(() => {
            if (this.opts.shouldSuppressTiltWarning?.()) return
            if (!this.tiltWarnEl) {
              this.tiltWarnEl = document.createElement('div')
              this.tiltWarnEl.className = 'camera-tilt-warning'
              this.tiltWarnEl.dataset.tiltWarning = 'true'
              this.tiltWarnEl.textContent = 'Hold phone upright for best alignment'
              this.opts.container.append(this.tiltWarnEl)
            }
          }, 1000)
        }
      } else {
        if (this.tiltWarnTimer) { clearTimeout(this.tiltWarnTimer); this.tiltWarnTimer = null }
        this.tiltWarnEl?.remove()
        this.tiltWarnEl = null
      }
    }
    window.addEventListener('deviceorientation', this.onDeviceOrientation)
  }

  private stopTiltWarning(): void {
    if (this.onDeviceOrientation) {
      window.removeEventListener('deviceorientation', this.onDeviceOrientation)
      this.onDeviceOrientation = null
    }
    this.latestOrientation_ = null
    if (this.tiltWarnTimer) { clearTimeout(this.tiltWarnTimer); this.tiltWarnTimer = null }
    this.tiltWarnEl?.remove()
    this.tiltWarnEl = null
  }
}
