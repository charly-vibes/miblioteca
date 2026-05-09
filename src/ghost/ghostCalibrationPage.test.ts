import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { GhostCalibrationPage } from './GhostCalibrationPage'
import type { WindowLike } from './GhostCalibrationPage'

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
})
