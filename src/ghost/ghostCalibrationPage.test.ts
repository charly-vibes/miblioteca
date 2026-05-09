import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { GhostCalibrationPage } from './GhostCalibrationPage'
import type { WindowLike } from './GhostCalibrationPage'
import type { GyroLike } from '../sensors/ghostOverlayCanvas'

function makeWin(innerWidth = 800, innerHeight = 600): WindowLike & {
  dispatch(type: string, event: unknown): void
} {
  const listeners = new Map<string, EventListenerOrEventListenerObject[]>()
  return {
    innerWidth,
    innerHeight,
    addEventListener: vi.fn((type, cb) => {
      listeners.set(type, [...(listeners.get(type) ?? []), cb])
    }),
    removeEventListener: vi.fn((type, cb) => {
      listeners.set(type, (listeners.get(type) ?? []).filter(l => l !== cb))
    }),
    dispatch(type: string, event: unknown) {
      for (const cb of listeners.get(type) ?? []) {
        if (typeof cb === 'function') cb(event as Event)
        else cb.handleEvent(event as Event)
      }
    },
  }
}

function makeFakeStream(): MediaStream {
  const track = { stop: vi.fn(), getSettings: () => ({ facingMode: 'environment' }) } as unknown as MediaStreamTrack
  return { getTracks: () => [track], getVideoTracks: () => [track] } as unknown as MediaStream
}

let container: HTMLDivElement
let win: ReturnType<typeof makeWin>

beforeEach(() => {
  container = document.createElement('div')
  document.body.appendChild(container)
  win = makeWin()
})

afterEach(() => {
  container.remove()
})

describe('GhostCalibrationPage — IDLE phase', () => {
  it('renders required elements in initial IDLE state', () => {
    new GhostCalibrationPage(container, { win })

    expect(container.querySelector('[data-testid="calibration-rectangle"]')).not.toBeNull()
    expect(container.querySelector('[data-testid="center-dot"]')).not.toBeNull()
    expect(container.querySelector('[data-testid="telemetry"]')).not.toBeNull()
    expect(container.querySelector('[data-testid="hint-text"]')?.textContent).toBe('TAP CENTER TO START')
  })

  it('starts in idle phase', () => {
    const page = new GhostCalibrationPage(container, { win })
    expect(page.getPhase()).toBe('idle')
  })

  it('renders 4 corner dots and 1 center dot', () => {
    new GhostCalibrationPage(container, { win })
    const rect = container.querySelector('[data-testid="calibration-rectangle"]')!
    const dots = rect.querySelectorAll('[role="button"]')
    expect(dots).toHaveLength(5)
  })

  it('center dot has ghost-center-dot class for pulse animation', () => {
    new GhostCalibrationPage(container, { win })
    const center = container.querySelector('[data-testid="center-dot"]')!
    expect(center.classList.contains('ghost-center-dot')).toBe(true)
  })

  it('rectangle is centered at 60% × 40% viewport', () => {
    const w = makeWin(800, 600)
    new GhostCalibrationPage(container, { win: w })
    const rect = container.querySelector<HTMLElement>('[data-testid="calibration-rectangle"]')!
    expect(rect.style.width).toBe('480px')   // 800 * 0.6
    expect(rect.style.height).toBe('240px')  // 600 * 0.4
    expect(rect.style.left).toBe('160px')    // (800 - 480) / 2
    expect(rect.style.top).toBe('180px')     // (600 - 240) / 2
  })
})

describe('GhostCalibrationPage — camera', () => {
  it('sets video srcObject when getUserMedia resolves', async () => {
    const stream = makeFakeStream()
    const getUserMedia = vi.fn().mockResolvedValue(stream)
    new GhostCalibrationPage(container, { win, getUserMedia })
    await vi.waitFor(() => {
      const video = container.querySelector<HTMLVideoElement>('video')!
      expect(video.srcObject).toBe(stream)
    })
  })

  it('shows warning banner when getUserMedia rejects', async () => {
    const getUserMedia = vi.fn().mockRejectedValue(new Error('denied'))
    new GhostCalibrationPage(container, { win, getUserMedia })
    await vi.waitFor(() => {
      const banner = container.querySelector<HTMLElement>('[data-testid="camera-warning"]')!
      expect(banner.style.display).toBe('block')
    })
  })

  it('shows warning banner when getUserMedia is unavailable', async () => {
    const original = navigator.mediaDevices
    Object.defineProperty(navigator, 'mediaDevices', { value: undefined, configurable: true })
    try {
      new GhostCalibrationPage(container, { win })
      await vi.waitFor(() => {
        const banner = container.querySelector<HTMLElement>('[data-testid="camera-warning"]')!
        expect(banner.style.display).toBe('block')
      })
    } finally {
      Object.defineProperty(navigator, 'mediaDevices', { value: original, configurable: true })
    }
  })
})

describe('GhostCalibrationPage — telemetry', () => {
  it('updates telemetry text when devicemotion fires', () => {
    new GhostCalibrationPage(container, { win })
    win.dispatch('devicemotion', {
      rotationRate: { alpha: 10, beta: 20, gamma: 30 },  // deg/s → rad/s
      acceleration: { x: 0.5, y: -9.8, z: 0.1 },
    })
    const telemetry = container.querySelector('[data-testid="telemetry"]')!
    expect(telemetry.textContent).toContain('rad/s')
    expect(telemetry.textContent).toContain('m/s²')
    // gx = 10 * π/180 ≈ 0.175 rad/s
    expect(telemetry.textContent).toContain('0.175')
  })

  it('registers and deregisters devicemotion listener', () => {
    const page = new GhostCalibrationPage(container, { win })
    expect(win.addEventListener).toHaveBeenCalledWith('devicemotion', expect.any(Function))
    page.destroy()
    expect(win.removeEventListener).toHaveBeenCalledWith('devicemotion', expect.any(Function))
  })
})

describe('GhostCalibrationPage — state transitions', () => {
  it('IDLE + tap center → recording phase', () => {
    const page = new GhostCalibrationPage(container, { win })
    page.getCenterDot().click()
    expect(page.getPhase()).toBe('recording')
  })

  it('recording phase: hint text changes on center tap', () => {
    const page = new GhostCalibrationPage(container, { win })
    page.getCenterDot().click()
    const hint = container.querySelector('[data-testid="hint-text"]')!
    expect(hint.textContent).toContain('RECORDING')
  })

  it('recording phase: center dot loses pulse class', () => {
    const page = new GhostCalibrationPage(container, { win })
    page.getCenterDot().click()
    expect(page.getCenterDot().classList.contains('ghost-center-dot')).toBe(false)
  })

  it('recording phase: corner dot tap → repositioning', () => {
    const page = new GhostCalibrationPage(container, { win })
    page.getCenterDot().click()
    const rect = container.querySelector('[data-testid="calibration-rectangle"]')!
    const corners = [...rect.querySelectorAll('[role="button"]')].filter(d => d !== page.getCenterDot())
    ;(corners[0] as HTMLElement).click()
    expect(page.getPhase()).toBe('repositioning')
  })

  it('stop button tap → repositioning', () => {
    const page = new GhostCalibrationPage(container, { win })
    page.getCenterDot().click()
    const stopBtn = container.querySelector<HTMLElement>('[data-testid="stop-btn"]')!
    stopBtn.click()
    expect(page.getPhase()).toBe('repositioning')
  })
})

function makeGyro(x = 0, y = 0.1, z = 0): GyroLike & { trigger(): void } {
  const g: GyroLike & { trigger(): void } = {
    onreading: null,
    onerror: null,
    x, y, z,
    timestamp: 0,
    start: vi.fn(),
    stop: vi.fn(),
    trigger() { g.onreading?.() },
  }
  return g
}

describe('GhostCalibrationPage — RECORDING phase', () => {
  it('accumulates SensorFrames on gyro readings during RECORDING', () => {
    const gyro = makeGyro(0.05, 0.1, 0.02)
    const page = new GhostCalibrationPage(container, { win, gyro })
    expect(gyro.start).toHaveBeenCalled()

    page.getCenterDot().click()  // → recording
    expect(page.getCurrentCycle()?.frames).toHaveLength(0)

    gyro.trigger()
    gyro.trigger()
    gyro.trigger()
    expect(page.getCurrentCycle()?.frames).toHaveLength(3)
  })

  it('SensorFrame contains correct gx/gy/gz from gyro', () => {
    const gyro = makeGyro(0.1, 0.2, 0.3)
    const page = new GhostCalibrationPage(container, { win, gyro })
    page.getCenterDot().click()
    gyro.trigger()
    const frame = page.getCurrentCycle()?.frames?.[0]!
    expect(frame.gx).toBeCloseTo(0.1)
    expect(frame.gy).toBeCloseTo(0.2)
    expect(frame.gz).toBeCloseTo(0.3)
  })

  it('does NOT accumulate SensorFrames before RECORDING starts', () => {
    const gyro = makeGyro()
    const page = new GhostCalibrationPage(container, { win, gyro })
    gyro.trigger()
    gyro.trigger()
    expect(page.getCurrentCycle()).toBeNull()
  })

  it('does NOT accumulate SensorFrames after RECORDING ends', () => {
    const gyro = makeGyro()
    const caf = vi.fn()
    const page = new GhostCalibrationPage(container, { win, gyro, cancelAnimationFrame: caf })
    page.getCenterDot().click()
    gyro.trigger()
    ;(container.querySelector<HTMLElement>('[data-testid="stop-btn"]'))!.click()
    const countAtStop = page.getCurrentCycle()?.frames?.length ?? 0
    gyro.trigger()
    expect(page.getCurrentCycle()?.frames?.length).toBe(countAtStop)
  })

  it('RAF tick updates rectangle left position by shiftPx', () => {
    // feedGhostGyro needs 2 readings: first sets lastT, second integrates yaw
    const gyro = makeGyro(0, 0.5, 0)  // gy = 0.5 rad/s
    let rafCb: FrameRequestCallback | null = null
    const raf = vi.fn((cb: FrameRequestCallback) => { rafCb = cb; return 1 })
    const page = new GhostCalibrationPage(container, { win: makeWin(800, 600), gyro, requestAnimationFrame: raf, cancelAnimationFrame: vi.fn() })
    const rect = container.querySelector<HTMLElement>('[data-testid="calibration-rectangle"]')!
    const initialLeft = parseInt(rect.style.left, 10)

    page.getCenterDot().click()
    gyro.timestamp = 0
    gyro.trigger()          // first reading: sets lastT = 0
    gyro.timestamp = 100    // 100 ms later → dt = 0.1 s → yaw += 0.5 * 0.1 = 0.05 rad
    gyro.trigger()          // second reading: integrates yaw → shiftPx becomes non-zero
    rafCb!(0)               // RAF tick → updates rectangle left

    const newLeft = parseInt(rect.style.left, 10)
    expect(newLeft).not.toBe(initialLeft)
  })

  it('RAF tick accumulates GhostFrames', () => {
    const gyro = makeGyro()
    let rafCb: FrameRequestCallback | null = null
    const raf = vi.fn((cb: FrameRequestCallback) => { rafCb = cb; return 1 })
    const page = new GhostCalibrationPage(container, { win, gyro, requestAnimationFrame: raf, cancelAnimationFrame: vi.fn() })
    page.getCenterDot().click()
    rafCb!(0)
    rafCb!(0)
    expect(page.getCurrentCycle()?.ghostFrames?.length).toBeGreaterThanOrEqual(2)
  })

  it('recording indicator is shown during RECORDING and hidden on stop', () => {
    const page = new GhostCalibrationPage(container, { win })
    const indicator = container.querySelector<HTMLElement>('[data-testid="recording-indicator"]')!
    expect(indicator.hidden).toBe(true)
    page.getCenterDot().click()
    expect(indicator.hidden).toBe(false)
    ;(container.querySelector<HTMLElement>('[data-testid="stop-btn"]'))!.click()
    expect(indicator.hidden).toBe(true)
  })

  it('telemetry updates yaw/shift after gyro readings during RECORDING', () => {
    const gyro = makeGyro(0, 0.5, 0)
    const page = new GhostCalibrationPage(container, { win: makeWin(800, 600), gyro })
    page.getCenterDot().click()
    gyro.timestamp = 0; gyro.trigger()         // sets lastT
    gyro.timestamp = 100; gyro.trigger()       // integrates yaw → shiftPx non-zero
    const telemetry = page.getTelemetryEl()
    expect(telemetry.textContent).not.toContain('Yaw: 0.0°')
  })

  it('transitionToRepositioning captures algorithmPosition from rectangle', () => {
    const gyro = makeGyro(0, 0.5, 0)
    let rafCb: FrameRequestCallback | null = null
    const raf = vi.fn((cb: FrameRequestCallback) => { rafCb = cb; return 1 })
    const page = new GhostCalibrationPage(container, { win: makeWin(800, 600), gyro, requestAnimationFrame: raf, cancelAnimationFrame: vi.fn() })
    page.getCenterDot().click()
    gyro.trigger()
    rafCb!(0)  // rectangle moves
    ;(container.querySelector<HTMLElement>('[data-testid="stop-btn"]'))!.click()
    const pos = page.getCurrentCycle()?.algorithmPosition
    expect(pos).toBeDefined()
    expect(typeof pos!.x).toBe('number')
    expect(typeof pos!.y).toBe('number')
  })
})
