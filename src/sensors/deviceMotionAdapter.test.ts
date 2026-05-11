import { describe, it, expect, vi, beforeEach } from 'vitest'
import { DeviceMotionGyroAdapter, DeviceMotionAccelAdapter, DeviceMotionLinearAccelAdapter } from './deviceMotionAdapter'

const DEG_TO_RAD = Math.PI / 180

function makeWindow() {
  const listeners = new Map<string, EventListener[]>()
  return {
    addEventListener: vi.fn((type: string, cb: EventListener) => {
      listeners.set(type, [...(listeners.get(type) ?? []), cb])
    }),
    removeEventListener: vi.fn((type: string, cb: EventListener) => {
      listeners.set(type, (listeners.get(type) ?? []).filter((l) => l !== cb))
    }),
    dispatch(type: string, event: unknown) {
      for (const cb of listeners.get(type) ?? []) cb(event as Event)
    },
  }
}

describe('DeviceMotionGyroAdapter', () => {
  let win: ReturnType<typeof makeWindow>
  let adapter: DeviceMotionGyroAdapter

  beforeEach(() => {
    win = makeWindow()
    adapter = new DeviceMotionGyroAdapter(win as unknown as Window)
  })

  it('registers listener on start and removes on stop', () => {
    adapter.start()
    expect(win.addEventListener).toHaveBeenCalledWith('devicemotion', expect.any(Function))
    adapter.stop()
    expect(win.removeEventListener).toHaveBeenCalledWith('devicemotion', expect.any(Function))
  })

  it('converts rotationRate from deg/s to rad/s', () => {
    adapter.start()
    win.dispatch('devicemotion', {
      rotationRate: { beta: 180, gamma: 90, alpha: 45 },
      timeStamp: 1000,
    })
    expect(adapter.x).toBeCloseTo(90 * DEG_TO_RAD)
    expect(adapter.y).toBeCloseTo(180 * DEG_TO_RAD)
    expect(adapter.z).toBeCloseTo(45 * DEG_TO_RAD)
  })

  it('maps alpha→z, beta→y, gamma→x (Firefox Android convention)', () => {
    adapter.start()
    win.dispatch('devicemotion', {
      rotationRate: { beta: 10, gamma: 20, alpha: 30 },
      timeStamp: 2000,
    })
    expect(adapter.x).toBeCloseTo(20 * DEG_TO_RAD)
    expect(adapter.y).toBeCloseTo(10 * DEG_TO_RAD)
    expect(adapter.z).toBeCloseTo(30 * DEG_TO_RAD)
  })

  it('sets timestamp from event', () => {
    adapter.start()
    win.dispatch('devicemotion', {
      rotationRate: { beta: 0, gamma: 0, alpha: 0 },
      timeStamp: 9999,
    })
    expect(adapter.timestamp).toBe(9999)
  })

  it('fires onreading callback', () => {
    const cb = vi.fn()
    adapter.onreading = cb
    adapter.start()
    win.dispatch('devicemotion', {
      rotationRate: { beta: 1, gamma: 2, alpha: 3 },
      timeStamp: 100,
    })
    expect(cb).toHaveBeenCalledOnce()
  })

  it('handles null rotationRate safely', () => {
    adapter.start()
    win.dispatch('devicemotion', { rotationRate: null, timeStamp: 500 })
    expect(adapter.x).toBeNull()
    expect(adapter.y).toBeNull()
    expect(adapter.z).toBeNull()
  })
})

describe('DeviceMotionAccelAdapter', () => {
  let win: ReturnType<typeof makeWindow>
  let adapter: DeviceMotionAccelAdapter

  beforeEach(() => {
    win = makeWindow()
    adapter = new DeviceMotionAccelAdapter(win as unknown as Window)
  })

  it('registers listener on start and removes on stop', () => {
    adapter.start()
    expect(win.addEventListener).toHaveBeenCalledWith('devicemotion', expect.any(Function))
    adapter.stop()
    expect(win.removeEventListener).toHaveBeenCalledWith('devicemotion', expect.any(Function))
  })

  it('reads accelerationIncludingGravity values directly', () => {
    adapter.start()
    win.dispatch('devicemotion', {
      accelerationIncludingGravity: { x: 1.5, y: -9.8, z: 0.3 },
      timeStamp: 300,
    })
    expect(adapter.x).toBe(1.5)
    expect(adapter.y).toBe(-9.8)
    expect(adapter.z).toBe(0.3)
    expect(adapter.timestamp).toBe(300)
  })

  it('fires onreading callback with real event', () => {
    const cb = vi.fn()
    adapter.onreading = cb
    adapter.start()
    win.dispatch('devicemotion', {
      accelerationIncludingGravity: { x: 0, y: 0, z: 9.8 },
      timeStamp: 100,
    })
    expect(cb).toHaveBeenCalledOnce()
    expect((cb.mock.calls[0][0] as Event).timeStamp).toBe(100)
  })

  it('handles null accelerationIncludingGravity safely', () => {
    adapter.start()
    win.dispatch('devicemotion', { accelerationIncludingGravity: null, timeStamp: 400 })
    expect(adapter.x).toBeNull()
    expect(adapter.y).toBeNull()
    expect(adapter.z).toBeNull()
  })
})

describe('DeviceMotionLinearAccelAdapter', () => {
  let win: ReturnType<typeof makeWindow>
  let adapter: DeviceMotionLinearAccelAdapter

  beforeEach(() => {
    win = makeWindow()
    adapter = new DeviceMotionLinearAccelAdapter(win as unknown as Window)
  })

  it('registers listener on start and removes on stop', () => {
    adapter.start()
    expect(win.addEventListener).toHaveBeenCalledWith('devicemotion', expect.any(Function))
    adapter.stop()
    expect(win.removeEventListener).toHaveBeenCalledWith('devicemotion', expect.any(Function))
  })

  it('propagates gravity-subtracted x/y from e.acceleration', () => {
    adapter.start()
    win.dispatch('devicemotion', {
      acceleration: { x: 0.5, y: -0.3 },
      interval: 16.7,
    })
    expect(adapter.x).toBe(0.5)
    expect(adapter.y).toBe(-0.3)
    expect(adapter.interval).toBeCloseTo(16.7)
  })

  it('fires onreading when e.acceleration is non-null', () => {
    const cb = vi.fn()
    adapter.onreading = cb
    adapter.start()
    win.dispatch('devicemotion', { acceleration: { x: 1, y: 2 }, interval: 16 })
    expect(cb).toHaveBeenCalledOnce()
  })

  it('does NOT fire onreading when e.acceleration is null', () => {
    const cb = vi.fn()
    adapter.onreading = cb
    adapter.start()
    win.dispatch('devicemotion', { acceleration: null, interval: 16 })
    expect(cb).not.toHaveBeenCalled()
  })

  it('leaves x/y as null and skips onreading when e.acceleration is null', () => {
    adapter.start()
    win.dispatch('devicemotion', { acceleration: null, interval: 16 })
    expect(adapter.x).toBeNull()
    expect(adapter.y).toBeNull()
  })

  it('falls back to 16ms interval when e.interval is 0', () => {
    adapter.start()
    win.dispatch('devicemotion', { acceleration: { x: 0, y: 0 }, interval: 0 })
    expect(adapter.interval).toBe(16)
  })

  it('uses actual interval when provided', () => {
    adapter.start()
    win.dispatch('devicemotion', { acceleration: { x: 0, y: 0 }, interval: 33 })
    expect(adapter.interval).toBe(33)
  })
})
