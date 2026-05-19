import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { IMUSteadinessMonitor } from './IMUSteadinessMonitor'
import type { AccelerometerLike } from './imuRecorder'

function makeFakeAccel(): AccelerometerLike & {
  triggerReading(x: number, y: number, z: number, t: number): void
} {
  const sensor = {
    x: 0 as number | null,
    y: 0 as number | null,
    z: 0 as number | null,
    timestamp: 0 as DOMHighResTimeStamp | null,
    onreading: null as ((ev: Event) => void) | null,
    onerror: null as ((ev: { error: DOMException }) => void) | null,
    start: vi.fn(),
    stop: vi.fn(),
    triggerReading(x: number, y: number, z: number, t: number) {
      sensor.x = x; sensor.y = y; sensor.z = z; sensor.timestamp = t
      sensor.onreading?.(new Event('reading'))
    },
  }
  return sensor
}

function fireDeviceOrientation(alpha: number | null, beta: number | null, gamma: number | null) {
  const ev = new Event('deviceorientation')
  Object.defineProperty(ev, 'alpha', { value: alpha })
  Object.defineProperty(ev, 'beta', { value: beta })
  Object.defineProperty(ev, 'gamma', { value: gamma })
  window.dispatchEvent(ev)
}

describe('IMUSteadinessMonitor — steadiness', () => {
  let container: HTMLDivElement

  beforeEach(() => {
    container = document.createElement('div')
    document.body.appendChild(container)
  })

  afterEach(() => {
    container.remove()
  })

  it('is steady by default (no accel)', () => {
    const monitor = new IMUSteadinessMonitor({ container })
    expect(monitor.steady).toBe(true)
  })

  it('becomes unsteady after shaky accel readings', () => {
    const accel = makeFakeAccel()
    const monitor = new IMUSteadinessMonitor({ accel, container })
    monitor.start()

    accel.triggerReading(0, 0, 3, 0)
    accel.triggerReading(0, 0, -3, 100)
    accel.triggerReading(0, 0, 3, 200)

    expect(monitor.steady).toBe(false)
  })

  it('stays steady with near-constant accel readings', () => {
    const accel = makeFakeAccel()
    const monitor = new IMUSteadinessMonitor({ accel, container })
    monitor.start()

    for (let i = 0; i <= 200; i += 50) {
      accel.triggerReading(0.05, 0.05, 0.05, i)
    }

    expect(monitor.steady).toBe(true)
  })

  it('calls onUpdate on every reading', () => {
    const accel = makeFakeAccel()
    const onUpdate = vi.fn()
    const monitor = new IMUSteadinessMonitor({ accel, container, onUpdate })
    monitor.start()

    accel.triggerReading(0, 0, 1, 0)
    expect(onUpdate).toHaveBeenCalledTimes(1)
  })

  it('resets to steady after stop()', () => {
    const accel = makeFakeAccel()
    const monitor = new IMUSteadinessMonitor({ accel, container })
    monitor.start()

    accel.triggerReading(0, 0, 3, 0)
    accel.triggerReading(0, 0, -3, 100)
    accel.triggerReading(0, 0, 3, 200)
    expect(monitor.steady).toBe(false)

    monitor.stop()
    expect(monitor.steady).toBe(true)
  })

  it('does not call onUpdate after stop()', () => {
    const accel = makeFakeAccel()
    const onUpdate = vi.fn()
    const monitor = new IMUSteadinessMonitor({ accel, container, onUpdate })
    monitor.start()
    monitor.stop()

    accel.triggerReading(0, 0, 1, 0)
    expect(onUpdate).not.toHaveBeenCalled()
  })
})

describe('IMUSteadinessMonitor — tiltDeg', () => {
  let container: HTMLDivElement

  beforeEach(() => {
    container = document.createElement('div')
    document.body.appendChild(container)
  })

  afterEach(() => {
    container.remove()
  })

  it('returns 0 when no readings', () => {
    const monitor = new IMUSteadinessMonitor({ container })
    expect(monitor.tiltDeg).toBe(0)
  })

  it('computes tilt from accel window', () => {
    const accel = makeFakeAccel()
    const monitor = new IMUSteadinessMonitor({ accel, container })
    monitor.start()

    // ax=1, ay=1, az=0 → atan2(1, sqrt(1²+0²)) = atan2(1,1) = 45°
    for (let i = 0; i <= 200; i += 50) {
      accel.triggerReading(1, 1, 0, i)
    }

    expect(monitor.tiltDeg).toBeCloseTo(45, 0)
  })
})

describe('IMUSteadinessMonitor — orientation', () => {
  let container: HTMLDivElement

  beforeEach(() => {
    container = document.createElement('div')
    document.body.appendChild(container)
  })

  afterEach(() => {
    container.remove()
  })

  it('latestOrientation is null before start()', () => {
    const monitor = new IMUSteadinessMonitor({ container })
    expect(monitor.latestOrientation).toBeNull()
  })

  it('captures deviceorientation after start()', () => {
    const monitor = new IMUSteadinessMonitor({ container })
    monitor.start()

    fireDeviceOrientation(10, 80, 5)

    expect(monitor.latestOrientation).toEqual({ alpha: 10, beta: 80, gamma: 5 })
  })

  it('stores null when orientation event has null components', () => {
    const monitor = new IMUSteadinessMonitor({ container })
    monitor.start()

    fireDeviceOrientation(null, null, null)

    expect(monitor.latestOrientation).toBeNull()
  })

  it('latestOrientation is null after stop()', () => {
    const monitor = new IMUSteadinessMonitor({ container })
    monitor.start()
    fireDeviceOrientation(10, 80, 5)
    monitor.stop()
    expect(monitor.latestOrientation).toBeNull()
  })
})

describe('IMUSteadinessMonitor — tilt warning', () => {
  let container: HTMLDivElement

  beforeEach(() => {
    vi.useFakeTimers()
    container = document.createElement('div')
    document.body.appendChild(container)
  })

  afterEach(() => {
    vi.useRealTimers()
    container.remove()
  })

  it('shows tilt warning after 1s when tilted >30° off vertical', () => {
    const monitor = new IMUSteadinessMonitor({
      container,
      shouldSuppressTiltWarning: () => false,
    })
    monitor.start()

    fireDeviceOrientation(0, 50, 0)  // |50-90| = 40° > 30°
    expect(container.querySelector('[data-tilt-warning]')).toBeNull()

    vi.advanceTimersByTime(1000)
    expect(container.querySelector('[data-tilt-warning]')).not.toBeNull()
  })

  it('does not show tilt warning before 1s', () => {
    const monitor = new IMUSteadinessMonitor({
      container,
      shouldSuppressTiltWarning: () => false,
    })
    monitor.start()

    fireDeviceOrientation(0, 50, 0)
    vi.advanceTimersByTime(999)
    expect(container.querySelector('[data-tilt-warning]')).toBeNull()
  })

  it('suppresses tilt warning when shouldSuppressTiltWarning returns true', () => {
    const monitor = new IMUSteadinessMonitor({
      container,
      shouldSuppressTiltWarning: () => true,
    })
    monitor.start()

    fireDeviceOrientation(0, 50, 0)
    vi.advanceTimersByTime(1000)
    expect(container.querySelector('[data-tilt-warning]')).toBeNull()
  })

  it('hides tilt warning when phone returns upright', () => {
    const monitor = new IMUSteadinessMonitor({
      container,
      shouldSuppressTiltWarning: () => false,
    })
    monitor.start()

    fireDeviceOrientation(0, 50, 0)
    vi.advanceTimersByTime(1000)
    expect(container.querySelector('[data-tilt-warning]')).not.toBeNull()

    fireDeviceOrientation(0, 90, 0)
    expect(container.querySelector('[data-tilt-warning]')).toBeNull()
  })

  it('removes tilt warning on stop()', () => {
    const monitor = new IMUSteadinessMonitor({
      container,
      shouldSuppressTiltWarning: () => false,
    })
    monitor.start()

    fireDeviceOrientation(0, 50, 0)
    vi.advanceTimersByTime(1000)
    expect(container.querySelector('[data-tilt-warning]')).not.toBeNull()

    monitor.stop()
    expect(container.querySelector('[data-tilt-warning]')).toBeNull()
  })
})

describe('IMUSteadinessMonitor — estimateDisplacementBetween', () => {
  let container: HTMLDivElement

  beforeEach(() => {
    container = document.createElement('div')
    document.body.appendChild(container)
  })

  afterEach(() => {
    container.remove()
  })

  it('returns undefined when no getImuSlice provided', () => {
    const monitor = new IMUSteadinessMonitor({ container })
    expect(monitor.estimateDisplacementBetween(0, 100)).toBeUndefined()
  })

  it('delegates to getImuSlice and estimateDisplacement', () => {
    const getImuSlice = vi.fn().mockReturnValue([])
    const monitor = new IMUSteadinessMonitor({ container, getImuSlice })
    const result = monitor.estimateDisplacementBetween(100, 200)
    expect(getImuSlice).toHaveBeenCalledWith(100, 200)
    expect(typeof result).toBe('number')
  })
})
