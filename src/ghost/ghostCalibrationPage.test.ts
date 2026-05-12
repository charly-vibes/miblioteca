import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { GhostCalibrationPage } from './GhostCalibrationPage'
import { focalLengthPx } from '../sensors/ghostOverlay'
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

  it('SensorFrame.betaDeg is set from deviceorientation event fired before gyro reading', () => {
    const gyro = makeGyro(0.1, 0.2, 0.3)
    const page = new GhostCalibrationPage(container, { win, gyro })
    page.getCenterDot().click()

    // Fire a deviceorientation event with beta=72
    const ev = { beta: 72 }
    win.dispatch('deviceorientation', ev)

    // Now trigger a gyro reading — the frame should capture the last betaDeg
    gyro.trigger()
    const frame = page.getCurrentCycle()?.frames?.[0]!
    expect(frame.betaDeg).toBe(72)
  })

  it('SensorFrame.betaDeg is null when no deviceorientation event has fired', () => {
    const gyro = makeGyro(0.1, 0.2, 0.3)
    const page = new GhostCalibrationPage(container, { win, gyro })
    page.getCenterDot().click()
    // No deviceorientation dispatched
    gyro.trigger()
    const frame = page.getCurrentCycle()?.frames?.[0]!
    expect(frame.betaDeg).toBeNull()
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

describe('GhostCalibrationPage — REPOSITIONING phase', () => {
  function enterRepositioning(w = makeWin(800, 600)) {
    const page = new GhostCalibrationPage(container, { win: w })
    page.getCenterDot().click()
    ;(container.querySelector<HTMLElement>('[data-testid="stop-btn"]'))!.click()
    return page
  }

  it('confirm button is hidden in IDLE and shown in REPOSITIONING', () => {
    const page = new GhostCalibrationPage(container, { win })
    expect(page.getConfirmBtn().hidden).toBe(true)
    page.getCenterDot().click()
    ;(container.querySelector<HTMLElement>('[data-testid="stop-btn"]'))!.click()
    expect(page.getConfirmBtn().hidden).toBe(false)
  })

  it('rectangle background changes to semi-transparent on REPOSITIONING', () => {
    enterRepositioning()
    const rect = container.querySelector<HTMLElement>('[data-testid="calibration-rectangle"]')!
    expect(rect.style.background).toContain('rgba')
  })

  it('telemetry shows PAUSED for motion values in REPOSITIONING', () => {
    const page = enterRepositioning()
    expect(page.getTelemetryEl().textContent).toContain('PAUSED')
  })

  it('drag moves rectangle and can go past right edge', () => {
    const w = makeWin(800, 600)
    enterRepositioning(w)
    const rect = container.querySelector<HTMLElement>('[data-testid="calibration-rectangle"]')!
    // rw=480, vw=800; initial left=160; drag 500px right → 660 (no clamp)
    rect.dispatchEvent(new MouseEvent('mousedown', { clientX: 400, clientY: 300, bubbles: true }))
    document.dispatchEvent(new MouseEvent('mousemove', { clientX: 900, clientY: 300, bubbles: true }))
    expect(parseInt(rect.style.left, 10)).toBe(660)
  })

  it('drag can go off left edge (negative left)', () => {
    const w = makeWin(800, 600)
    enterRepositioning(w)
    const rect = container.querySelector<HTMLElement>('[data-testid="calibration-rectangle"]')!
    // initial left=160; drag 300px left → -140 (no clamp)
    rect.dispatchEvent(new MouseEvent('mousedown', { clientX: 400, clientY: 300, bubbles: true }))
    document.dispatchEvent(new MouseEvent('mousemove', { clientX: 100, clientY: 300, bubbles: true }))
    expect(parseInt(rect.style.left, 10)).toBe(-140)
  })

  it('moveDrag is a no-op in idle phase (non-repositioning)', () => {
    const page = new GhostCalibrationPage(container, { win: makeWin(800, 600) })
    const rect = container.querySelector<HTMLElement>('[data-testid="calibration-rectangle"]')!
    const initialLeft = parseInt(rect.style.left, 10)
    // Simulate mousedown + mousemove while in idle phase
    rect.dispatchEvent(new MouseEvent('mousedown', { clientX: 400, clientY: 300, bubbles: true }))
    document.dispatchEvent(new MouseEvent('mousemove', { clientX: 700, clientY: 300, bubbles: true }))
    expect(parseInt(rect.style.left, 10)).toBe(initialLeft)
    expect(page.getPhase()).toBe('idle')
  })

  it('stopDrag (mouseup) nullifies drag state so subsequent mousemoves are no-ops', () => {
    enterRepositioning()
    const rect = container.querySelector<HTMLElement>('[data-testid="calibration-rectangle"]')!
    rect.dispatchEvent(new MouseEvent('mousedown', { clientX: 400, clientY: 300, bubbles: true }))
    // Move while dragging: rect should move
    document.dispatchEvent(new MouseEvent('mousemove', { clientX: 500, clientY: 300, bubbles: true }))
    const leftAfterDrag = parseInt(rect.style.left, 10)
    // Release drag
    document.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }))
    // Move again after release: rect must not move
    document.dispatchEvent(new MouseEvent('mousemove', { clientX: 900, clientY: 300, bubbles: true }))
    expect(parseInt(rect.style.left, 10)).toBe(leftAfterDrag)
  })

  it('Confirm records groundTruthPosition, deltaPixels, and transitions to CAPTURED', () => {
    const page = enterRepositioning()
    page.getConfirmBtn().click()
    expect(page.getPhase()).toBe('captured')
    expect(page.getCycles()).toHaveLength(1)
    const cycle = page.getCycles()[0]
    expect(cycle.groundTruthPosition).toBeDefined()
    expect(cycle.deltaPixels).toBeDefined()
    expect(typeof cycle.returnYawRad).toBe('number')
    expect(typeof cycle.returnPitchRad).toBe('number')
  })

  it('confirm button is hidden after CAPTURED transition', () => {
    const page = enterRepositioning()
    page.getConfirmBtn().click()
    expect(page.getConfirmBtn().hidden).toBe(true)
  })
})

describe('focalLengthPx', () => {
  it('derives focalLengthPx from viewport width and default 40° hFov', () => {
    // vw=800: fl = 400 / tan(20°) = 400 / 0.3640 ≈ 1099
    const fl = focalLengthPx(800)
    expect(fl).toBeCloseTo(1099, 0)
  })

  it('is symmetric: focalLengthPx(vw) * tan(hFov/2) === vw/2', () => {
    const vw = 1080
    const hFov = 40
    const fl = focalLengthPx(vw, hFov)
    expect(fl * Math.tan((hFov / 2) * Math.PI / 180)).toBeCloseTo(vw / 2, 5)
  })
})

describe('GhostCalibrationPage — CAPTURED phase', () => {
  function enterCaptured(w = makeWin(800, 600)) {
    const page = new GhostCalibrationPage(container, { win: w })
    page.getCenterDot().click()           // → recording
    ;(container.querySelector<HTMLElement>('[data-testid="stop-btn"]'))!.click()  // → repositioning
    page.getConfirmBtn().click()          // → captured
    return page
  }

  it('summary panel is hidden in IDLE and shown in CAPTURED', () => {
    const page = new GhostCalibrationPage(container, { win })
    expect(page.getSummaryPanel().hidden).toBe(true)
    page.getCenterDot().click()
    ;(container.querySelector<HTMLElement>('[data-testid="stop-btn"]'))!.click()
    page.getConfirmBtn().click()
    expect(page.getSummaryPanel().hidden).toBe(false)
  })

  it('summary text contains cycle number and Δx/Δy', () => {
    enterCaptured()
    const text = container.querySelector('[data-testid="summary-text"]')!.textContent ?? ''
    expect(text).toContain('Cycle 1 complete')
    expect(text).toContain('Δx:')
    expect(text).toContain('Effective yaw error')
    expect(text).toContain('Return drift')
  })

  it('effectiveYawErrDeg is a finite number using the correct focal-length formula', () => {
    enterCaptured()
    const text = container.querySelector('[data-testid="summary-text"]')!.textContent ?? ''
    const match = text.match(/Effective yaw error:\s*([-\d.]+)°/)
    expect(match).not.toBeNull()
    const deg = parseFloat(match![1])
    expect(Number.isFinite(deg)).toBe(true)
    expect(Math.abs(deg)).toBeLessThan(180)
  })

  it('deltaPixels formula: groundTruth minus algorithmPosition', () => {
    const page = enterCaptured()
    const cycle = page.getCycles()[0]
    const gt = cycle.groundTruthPosition
    const alg = cycle.algorithmPosition
    expect(cycle.deltaPixels.x).toBeCloseTo(gt.x - alg.x, 5)
    expect(cycle.deltaPixels.y).toBeCloseTo(gt.y - alg.y, 5)
  })

  it('deltaPixels is zero when rectangle is not dragged (GT === algorithm position)', () => {
    // No drag → GT position is same as rectangle position when stop was tapped
    const page = new GhostCalibrationPage(container, { win: makeWin(800, 600) })
    page.getCenterDot().click()
    ;(container.querySelector<HTMLElement>('[data-testid="stop-btn"]'))!.click()
    page.getConfirmBtn().click()
    const cycle = page.getCycles()[0]
    expect(cycle.deltaPixels.x).toBeCloseTo(0, 5)
    expect(cycle.deltaPixels.y).toBeCloseTo(0, 5)
  })

  it('missing algorithmPosition causes early return: cycle not pushed, phase stays repositioning', () => {
    const page = new GhostCalibrationPage(container, { win: makeWin(800, 600) })
    page.getCenterDot().click()
    ;(container.querySelector<HTMLElement>('[data-testid="stop-btn"]'))!.click()

    const partial = page.getCurrentCycle()!
    delete partial.algorithmPosition  // simulate missing algorithm position

    page.getConfirmBtn().click()

    // Cycle must not be pushed when algorithmPosition is absent
    expect(page.getCycles()).toHaveLength(0)
    expect(page.getPhase()).toBe('repositioning')
  })

  it('Next Cycle resets to IDLE, retains prior cycles, and restores rectangle', () => {
    const page = enterCaptured()
    expect(page.getCycles()).toHaveLength(1)
    page.getNextCycleBtn().click()
    expect(page.getPhase()).toBe('idle')
    expect(page.getCycles()).toHaveLength(1)  // prior cycle retained
    expect(page.getCurrentCycle()).toBeNull()
    const rect = container.querySelector<HTMLElement>('[data-testid="calibration-rectangle"]')!
    expect(rect.style.left).toBe('160px')  // (800-480)/2
    expect(rect.style.top).toBe('180px')   // (600-240)/2
  })

  it('rectangle persists at GT position after Next Cycle when user dragged it', () => {
    const w = makeWin(800, 600)
    const page = new GhostCalibrationPage(container, { win: w })
    page.getCenterDot().click()
    ;(container.querySelector<HTMLElement>('[data-testid="stop-btn"]'))!.click()

    const rect = container.querySelector<HTMLElement>('[data-testid="calibration-rectangle"]')!
    // Drag rectangle 200px right, 100px down
    rect.dispatchEvent(new MouseEvent('mousedown', { clientX: 400, clientY: 300, bubbles: true }))
    document.dispatchEvent(new MouseEvent('mousemove', { clientX: 600, clientY: 400, bubbles: true }))
    const draggedLeft = parseInt(rect.style.left, 10)   // 160+200 = 360
    const draggedTop  = parseInt(rect.style.top,  10)   // 180+100 = 280

    page.getConfirmBtn().click()
    page.getNextCycleBtn().click()

    expect(parseInt(rect.style.left, 10)).toBe(draggedLeft)
    expect(parseInt(rect.style.top,  10)).toBe(draggedTop)
  })

  it('startPosition on second cycle uses GT position from first cycle', () => {
    const w = makeWin(800, 600)
    const page = new GhostCalibrationPage(container, { win: w })
    page.getCenterDot().click()
    ;(container.querySelector<HTMLElement>('[data-testid="stop-btn"]'))!.click()

    const rect = container.querySelector<HTMLElement>('[data-testid="calibration-rectangle"]')!
    rect.dispatchEvent(new MouseEvent('mousedown', { clientX: 400, clientY: 300, bubbles: true }))
    document.dispatchEvent(new MouseEvent('mousemove', { clientX: 600, clientY: 400, bubbles: true }))
    const draggedLeft = parseInt(rect.style.left, 10)  // 360
    const draggedTop  = parseInt(rect.style.top,  10)  // 280

    page.getConfirmBtn().click()
    page.getNextCycleBtn().click()
    page.getCenterDot().click()  // start second recording

    const cycle2 = page.getCurrentCycle()!
    // rectW=480, rectH=240: center = left+240, top+120
    expect(cycle2.startPosition?.x).toBeCloseTo(draggedLeft + 480 / 2, 0)
    expect(cycle2.startPosition?.y).toBeCloseTo(draggedTop  + 240 / 2, 0)
  })

  it('transitionToIdle keeps previous rectInitTop when style.top is empty (NaN guard)', () => {
    const w = makeWin(800, 600)
    const page = new GhostCalibrationPage(container, { win: w })
    page.getCenterDot().click()
    ;(container.querySelector<HTMLElement>('[data-testid="stop-btn"]'))!.click()

    const rect = container.querySelector<HTMLElement>('[data-testid="calibration-rectangle"]')!
    // rectInitTop = Math.round((600 - 240) / 2) = 180
    const originalTop = rect.style.top  // '180px'

    rect.style.top = ''  // force parseInt to return NaN

    page.getConfirmBtn().click()
    page.getNextCycleBtn().click()

    // NaN guard must have kept rectInitTop at 180; transitionToIdle resets rect to that
    expect(rect.style.top).toBe(originalTop)
  })

  it('Next Cycle allows starting a second recording', () => {
    const page = enterCaptured()
    page.getNextCycleBtn().click()
    page.getCenterDot().click()
    expect(page.getPhase()).toBe('recording')
    ;(container.querySelector<HTMLElement>('[data-testid="stop-btn"]'))!.click()
    page.getConfirmBtn().click()
    expect(page.getCycles()).toHaveLength(2)
  })

  it('summary panel is hidden after Next Cycle', () => {
    const page = enterCaptured()
    page.getNextCycleBtn().click()
    expect(page.getSummaryPanel().hidden).toBe(true)
  })
})

describe('GhostCalibrationPage — JSON export', () => {
  function enterCapturedWithExport() {
    const downloads: { filename: string; json: string }[] = []
    const page = new GhostCalibrationPage(container, {
      win: { ...makeWin(800, 600), devicePixelRatio: 2, navigator: { userAgent: 'test-ua' } },
      now: () => 1000,
      triggerDownload: (filename, json) => downloads.push({ filename, json }),
    })
    page.getCenterDot().click()
    ;(container.querySelector<HTMLElement>('[data-testid="stop-btn"]'))!.click()
    page.getConfirmBtn().click()
    return { page, downloads }
  }

  it('export button is disabled before CAPTURED phase', () => {
    new GhostCalibrationPage(container, { win })
    const btn = container.querySelector<HTMLButtonElement>('[data-testid="export-btn"]')!
    expect(btn.disabled).toBe(true)
  })

  it('export button is enabled after entering CAPTURED phase', () => {
    enterCapturedWithExport()
    const btn = container.querySelector<HTMLButtonElement>('[data-testid="export-btn"]')!
    expect(btn.disabled).toBe(false)
  })

  it('clicking export triggers download with valid CalibrationExport schema', () => {
    const { downloads } = enterCapturedWithExport()
    const btn = container.querySelector<HTMLButtonElement>('[data-testid="export-btn"]')!
    btn.click()
    expect(downloads).toHaveLength(1)
    const parsed = JSON.parse(downloads[0].json)
    expect(parsed).toMatchObject({
      exportedAt: expect.stringMatching(/^\d{4}-\d{2}-\d{2}T/),
      deviceInfo: { viewportWidth: 800, viewportHeight: 600, devicePixelRatio: 2, userAgent: 'test-ua' },
      hFovDeg: 40,
      focalLengthPx: expect.any(Number),
      cycles: expect.arrayContaining([
        expect.objectContaining({ id: expect.any(String), frames: expect.any(Array) }),
      ]),
    })
  })

  it('filename matches ghost-calibration-YYYY-MM-DD-HH-mm-ss.json format', () => {
    const { downloads } = enterCapturedWithExport()
    const btn = container.querySelector<HTMLButtonElement>('[data-testid="export-btn"]')!
    btn.click()
    expect(downloads[0].filename).toMatch(/^ghost-calibration-\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}\.json$/)
  })

  it('export accumulates all cycles from multiple Next Cycle resets', () => {
    const { page, downloads } = enterCapturedWithExport()
    page.getNextCycleBtn().click()
    page.getCenterDot().click()
    ;(container.querySelector<HTMLElement>('[data-testid="stop-btn"]'))!.click()
    page.getConfirmBtn().click()
    const btn = container.querySelector<HTMLButtonElement>('[data-testid="export-btn"]')!
    btn.click()
    const parsed = JSON.parse(downloads[0].json)
    expect(parsed.cycles).toHaveLength(2)
  })
})

describe('GhostCalibrationPage — devicemotion-only frame production', () => {
  it('accumulates SensorFrames via devicemotion when Gyroscope API is not available', () => {
    const page = new GhostCalibrationPage(container, { win, gyro: null })
    page.getCenterDot().click()
    expect(page.getCurrentCycle()?.frames).toHaveLength(0)

    win.dispatch('devicemotion', {
      rotationRate: { alpha: 10, beta: 20, gamma: 30 },
      acceleration: { x: 0.5, y: -0.3, z: 0.1 },
    })
    win.dispatch('devicemotion', {
      rotationRate: { alpha: 12, beta: 22, gamma: 28 },
      acceleration: { x: 0.4, y: -0.2, z: 0.15 },
    })

    expect(page.getCurrentCycle()?.frames?.length).toBe(2)
    const frame = page.getCurrentCycle()?.frames?.[0]!
    expect(frame.gx).toBeCloseTo(10 * Math.PI / 180)
    expect(frame.ax).toBeCloseTo(0.5)
  })
})

describe('GhostCalibrationPage — double integration prevention', () => {
  it('devicemotion does not re-integrate gyro when Gyroscope API is active', () => {
    const gyro = makeGyro(0, 0.5, 0)  // gy = 0.5 rad/s
    let rafCb: FrameRequestCallback | null = null
    const raf = vi.fn((cb: FrameRequestCallback) => { rafCb = cb; return 1 })
    const now = vi.fn().mockReturnValue(0)
    const w = makeWin(800, 600)
    const page = new GhostCalibrationPage(container, {
      win: w, gyro,
      requestAnimationFrame: raf, cancelAnimationFrame: vi.fn(), now,
    })
    page.getCenterDot().click()

    gyro.timestamp = 0; gyro.trigger()
    gyro.timestamp = 100; now.mockReturnValue(100); gyro.trigger()  // yawIntegral = -0.05

    rafCb!(0)
    const rect = container.querySelector<HTMLElement>('[data-testid="calibration-rectangle"]')!
    const leftAfterGyroOnly = parseInt(rect.style.left, 10)

    now.mockReturnValue(200)
    w.dispatch('devicemotion', {
      rotationRate: { alpha: 0, beta: 0.5 * (180 / Math.PI), gamma: 0 },
      acceleration: null,
      interval: 16,
    })
    rafCb!(0)
    const leftAfterDeviceMotion = parseInt(rect.style.left, 10)

    expect(leftAfterDeviceMotion).toBe(leftAfterGyroOnly)
  })

  it('does not push duplicate SensorFrames when both gyro and devicemotion fire', () => {
    const gyro = makeGyro(0, 0.5, 0)
    const page = new GhostCalibrationPage(container, { win, gyro })
    page.getCenterDot().click()

    gyro.trigger()

    win.dispatch('devicemotion', {
      rotationRate: { alpha: 0, beta: 20, gamma: 0 },
      acceleration: null,
      interval: 16,
    })

    expect(page.getCurrentCycle()?.frames).toHaveLength(1)
  })
})

describe('GhostCalibrationPage — scan axis', () => {
  it('landscape orientation uses gx for horizontal scan', () => {
    const gyro = makeGyro(0.5, 0, 0)  // gx=0.5 rad/s, gy=0
    const getScreenOrientation = vi.fn().mockReturnValue('landscape-primary')
    const page = new GhostCalibrationPage(container, { win: makeWin(800, 600), gyro, getScreenOrientation })

    gyro.timestamp = 0; gyro.trigger()
    gyro.timestamp = 100; gyro.trigger()  // dt=0.1s, gx drives yaw in landscape

    const telemetry = page.getTelemetryEl()
    expect(telemetry.textContent).not.toContain('Yaw: 0.0°')
  })
})

describe('GhostCalibrationPage — yaw clamping', () => {
  it('clamps yawIntegral in RAF loop so counter-rotation moves the rectangle immediately', () => {
    const gyro = makeGyro(0, 100, 0)  // huge gy
    let rafCb: FrameRequestCallback | null = null
    const raf = vi.fn((cb: FrameRequestCallback) => { rafCb = cb; return 1 })
    const page = new GhostCalibrationPage(container, {
      win: makeWin(800, 600), gyro,
      requestAnimationFrame: raf, cancelAnimationFrame: vi.fn(),
    })
    page.getCenterDot().click()

    gyro.timestamp = 0; gyro.trigger()
    gyro.timestamp = 1000; gyro.trigger()  // dt clamped to 0.5s → yaw ≈ -50 rad

    rafCb!(0)  // should clamp yawIntegral to maxYaw

    const rect = container.querySelector<HTMLElement>('[data-testid="calibration-rectangle"]')!
    const leftBeforeCounter = parseInt(rect.style.left, 10)

    gyro.y = -0.1  // small counter-rotation
    gyro.timestamp = 1100; gyro.trigger()  // dt=0.1s → small yaw change from clamped state

    rafCb!(0)
    const leftAfterCounter = parseInt(rect.style.left, 10)

    // With clamp: yawIntegral was reset to maxYaw, counter moves it into range → rect shifts
    // Without clamp: yawIntegral still -50, counter barely changes it → rect stays at edge
    expect(leftAfterCounter).not.toBe(leftBeforeCounter)
  })

  it('gyro path: onGyroReading clamps yawIntegral so counter-rotation responds immediately', () => {
    const gyro = makeGyro(0, 100, 0)  // huge gy in portrait
    let rafCb: FrameRequestCallback | null = null
    const raf = vi.fn((cb: FrameRequestCallback) => { rafCb = cb; return 1 })
    const page = new GhostCalibrationPage(container, {
      win: makeWin(800, 600), gyro,
      requestAnimationFrame: raf, cancelAnimationFrame: vi.fn(),
    })
    page.getCenterDot().click()

    gyro.timestamp = 0; gyro.trigger()
    gyro.timestamp = 1000; gyro.trigger()  // dt clamped to 0.5s → massive yaw without clamp

    rafCb!(0)
    const rect = container.querySelector<HTMLElement>('[data-testid="calibration-rectangle"]')!
    const leftAtEdge = parseInt(rect.style.left, 10)

    gyro.y = -0.1  // small counter-rotation
    gyro.timestamp = 1100; gyro.trigger()  // dt=0.1s → small yaw from clamped state

    rafCb!(0)
    const leftAfterCounter = parseInt(rect.style.left, 10)

    // Clamp in onGyroReading resets integral to boundary, so counter-rotation takes effect immediately
    expect(leftAfterCounter).not.toBe(leftAtEdge)
  })
})

describe('GhostCalibrationPage — ghost overlay', () => {
  it('default snapshot capture returns null when canvas 2d is unavailable', () => {
    const page = new GhostCalibrationPage(container, { win }) as unknown as { captureSnapshotFn: (video: HTMLVideoElement) => string | null; videoEl: HTMLVideoElement }
    expect(page.captureSnapshotFn(page.videoEl)).toBeNull()
  })

  it('ghost overlay element is hidden in idle phase', () => {
    new GhostCalibrationPage(container, { win })
    const overlay = container.querySelector<HTMLElement>('[data-testid="ghost-overlay"]')
    expect(overlay).not.toBeNull()
    expect(overlay!.style.display).toBe('none')
  })

  it('ghost overlay becomes visible when recording starts', () => {
    const captureSnapshot = vi.fn().mockReturnValue('data:image/jpeg;base64,FAKE')
    const page = new GhostCalibrationPage(container, { win, captureSnapshot })
    page.getCenterDot().click()
    const overlay = container.querySelector<HTMLElement>('[data-testid="ghost-overlay"]')!
    expect(overlay.style.display).not.toBe('none')
    expect(captureSnapshot).toHaveBeenCalled()
  })

  it('ghost overlay src is set to captured snapshot', () => {
    const captureSnapshot = vi.fn().mockReturnValue('data:image/jpeg;base64,TESTIMG')
    const page = new GhostCalibrationPage(container, { win, captureSnapshot })
    page.getCenterDot().click()
    const overlay = container.querySelector<HTMLImageElement>('[data-testid="ghost-overlay"]')!
    expect(overlay.src).toContain('TESTIMG')
  })

  it('ghost overlay is hidden after cycle ends', () => {
    const captureSnapshot = vi.fn().mockReturnValue('data:image/jpeg;base64,FAKE')
    const page = new GhostCalibrationPage(container, { win, captureSnapshot })
    page.getCenterDot().click()
    // tap dot to stop recording
    const rect = container.querySelector('[data-testid="calibration-rectangle"]')!
    rect.querySelector<HTMLElement>('[role="button"]')!.click()
    const overlay = container.querySelector<HTMLElement>('[data-testid="ghost-overlay"]')!
    expect(overlay.style.display).toBe('none')
  })

  it('ghost overlay transform tracks pipeline shift during recording', () => {
    const captureSnapshot = vi.fn().mockReturnValue('data:image/jpeg;base64,FAKE')
    const gyro = makeGyro(0, 0.5, 0)  // gy=0.5 drives yaw
    let rafCb: FrameRequestCallback | null = null
    const raf = vi.fn((cb: FrameRequestCallback) => { rafCb = cb; return 1 })
    const page = new GhostCalibrationPage(container, {
      win: makeWin(800, 600), gyro, captureSnapshot,
      requestAnimationFrame: raf, cancelAnimationFrame: vi.fn(),
    })
    page.getCenterDot().click()
    gyro.timestamp = 0; gyro.trigger()
    gyro.timestamp = 200; gyro.trigger()
    rafCb!(0)
    const overlay = container.querySelector<HTMLElement>('[data-testid="ghost-overlay"]')!
    expect(overlay.style.transform).toMatch(/translate3d\(-?\d+(\.\d+)?px, -?\d+(\.\d+)?px, 0\)/)
    expect(overlay.style.transform).not.toBe('translate3d(0px, 0px, 0)')
  })
})

describe('GhostCalibrationPage — drag off-screen', () => {
  it('drag can position rectangle with negative left (off left edge)', () => {
    const page = new GhostCalibrationPage(container, { win: makeWin(800, 600) })
    page.getCenterDot().click()
    // tap dot to stop
    const rect = container.querySelector<HTMLElement>('[data-testid="calibration-rectangle"]')!
    rect.querySelector<HTMLElement>('[role="button"]')!.click()
    // now in repositioning — drag far left
    const touch = new Event('touchstart') as TouchEvent
    Object.defineProperty(touch, 'touches', { value: [{ clientX: 400, clientY: 300 }] })
    rect.dispatchEvent(touch)
    const move = new Event('touchmove')
    Object.defineProperty(move, 'touches', { value: [{ clientX: -200, clientY: 300 }] })
    ;(container.ownerDocument as Document).dispatchEvent(move)
    const left = parseInt(rect.style.left, 10)
    expect(left).toBeLessThan(0)
  })

  it('drag can position rectangle past right edge', () => {
    const page = new GhostCalibrationPage(container, { win: makeWin(800, 600) })
    page.getCenterDot().click()
    const rect = container.querySelector<HTMLElement>('[data-testid="calibration-rectangle"]')!
    rect.querySelector<HTMLElement>('[role="button"]')!.click()
    const touch = new Event('touchstart') as TouchEvent
    Object.defineProperty(touch, 'touches', { value: [{ clientX: 400, clientY: 300 }] })
    rect.dispatchEvent(touch)
    const move = new Event('touchmove')
    Object.defineProperty(move, 'touches', { value: [{ clientX: 900, clientY: 300 }] })
    ;(container.ownerDocument as Document).dispatchEvent(move)
    const left = parseInt(rect.style.left, 10)
    // 800 - 480 = 320 is the old max — should now exceed it
    expect(left).toBeGreaterThan(320)
  })
})

describe('GhostCalibrationPage — cycle snapshots', () => {
  it('startSnapshot is set at recording start', () => {
    const captureSnapshot = vi.fn().mockReturnValue('data:image/jpeg;base64,START')
    const page = new GhostCalibrationPage(container, { win, captureSnapshot })
    page.getCenterDot().click()
    const cycle = page.getCurrentCycle()!
    expect((cycle as { startSnapshot?: string }).startSnapshot).toBe('data:image/jpeg;base64,START')
  })

  it('endSnapshot is set when recording ends', () => {
    let call = 0
    const captureSnapshot = vi.fn().mockImplementation(() =>
      call++ === 0 ? 'data:image/jpeg;base64,START' : 'data:image/jpeg;base64,END'
    )
    const page = new GhostCalibrationPage(container, { win, captureSnapshot })
    page.getCenterDot().click()
    const rect = container.querySelector('[data-testid="calibration-rectangle"]')!
    rect.querySelector<HTMLElement>('[role="button"]')!.click()
    const cycle = page.getCurrentCycle()!
    expect((cycle as { endSnapshot?: string }).endSnapshot).toBe('data:image/jpeg;base64,END')
  })

  it('snapshots included in exported JSON', () => {
    let downloads: Array<{ filename: string; json: string }> = []
    const triggerDownload = vi.fn((filename: string, json: string) => { downloads.push({ filename, json }) })
    let call = 0
    const captureSnapshot = vi.fn().mockImplementation(() =>
      call++ === 0 ? 'data:image/jpeg;base64,START' : 'data:image/jpeg;base64,END'
    )
    const page = new GhostCalibrationPage(container, { win, captureSnapshot, triggerDownload })
    page.getCenterDot().click()
    const rect = container.querySelector<HTMLElement>('[data-testid="calibration-rectangle"]')!
    rect.querySelector<HTMLElement>('[role="button"]')!.click()
    page.getConfirmBtn().click()
    page.getExportBtn().click()
    const payload = JSON.parse(downloads[0].json)
    expect(payload.cycles[0].startSnapshot).toBe('data:image/jpeg;base64,START')
    expect(payload.cycles[0].endSnapshot).toBe('data:image/jpeg;base64,END')
  })
})

// RED: helper method extraction tests — these fail until constructor is refactored
describe('GhostCalibrationPage — builder helper methods', () => {
  it('buildBaseElements creates video, warnBanner, and telemetry elements', () => {
    const page = new GhostCalibrationPage(container, { win }) as unknown as Record<string, unknown>
    expect(typeof page['buildBaseElements']).toBe('function')
  })

  it('buildRectangle creates rectangle and center dot elements', () => {
    const page = new GhostCalibrationPage(container, { win }) as unknown as Record<string, unknown>
    expect(typeof page['buildRectangle']).toBe('function')
  })

  it('buildRecordingUI creates hint, indicator, stop and confirm buttons', () => {
    const page = new GhostCalibrationPage(container, { win }) as unknown as Record<string, unknown>
    expect(typeof page['buildRecordingUI']).toBe('function')
  })

  it('buildSummaryUI creates summary panel, export and next-cycle buttons', () => {
    const page = new GhostCalibrationPage(container, { win }) as unknown as Record<string, unknown>
    expect(typeof page['buildSummaryUI']).toBe('function')
  })

  it('buildOverlayLayer creates the fixed overlay container div', () => {
    const page = new GhostCalibrationPage(container, { win }) as unknown as Record<string, unknown>
    expect(typeof page['buildOverlayLayer']).toBe('function')
  })

  it('wireDragEvents attaches mousemove/mouseup/touchmove/touchend to document', () => {
    const page = new GhostCalibrationPage(container, { win }) as unknown as Record<string, unknown>
    expect(typeof page['wireDragEvents']).toBe('function')
  })

  it('wireSensors attaches deviceorientation and devicemotion to win', () => {
    const page = new GhostCalibrationPage(container, { win }) as unknown as Record<string, unknown>
    expect(typeof page['wireSensors']).toBe('function')
  })

  it('wirePipeline creates the GhostMotionPipeline and returns it', () => {
    const page = new GhostCalibrationPage(container, { win }) as unknown as Record<string, unknown>
    expect(typeof page['wirePipeline']).toBe('function')
  })
})

// RED: onPipelineFrame should consume frame.shiftPx directly, not recompute via computeShiftPx
describe('GhostCalibrationPage — onPipelineFrame uses frame.shiftPx directly', () => {
  it('uses frame.shiftPx for rectangle position, not computeShiftPx(frame.yawRad)', () => {
    const raf = vi.fn(() => 1)
    const page = new GhostCalibrationPage(container, {
      win: makeWin(800, 600),
      requestAnimationFrame: raf,
      cancelAnimationFrame: vi.fn(),
    }) as unknown as Record<string, unknown>

    // Set up RECORDING phase state
    ;(page as unknown as { phase: string }).phase = 'recording'
    const p = page as Record<string, unknown>
    p['rectInitLeft'] = 0
    p['rectInitTop'] = 0
    p['recordingStartedAt'] = 0
    p['currentCycle'] = { frames: [], ghostFrames: [] }

    const rect = container.querySelector<HTMLElement>('[data-testid="calibration-rectangle"]')!

    // sentinel shiftPx = 42 px; computeShiftPx(0.1, 800) ≈ -110 px — clearly different
    const frame = { t: 100, yawRad: 0.1, pitchRad: 0, shiftPx: 42, pitchShiftPx: 0, dx_m: 0, dy_m: 0, gateOpen: true }
    ;(p['onPipelineFrame'] as (f: typeof frame) => void)(frame)

    // If frame.shiftPx is used: left = 0 + round(42) = 42px
    // If computeShiftPx is used: left = 0 + round(-110) = -110px
    expect(rect.style.left).toBe('42px')
  })
})

describe('GhostCalibrationPage — renderTelemetry throttle', () => {
  let container: HTMLDivElement

  beforeEach(() => {
    container = document.createElement('div')
    document.body.appendChild(container)
  })

  afterEach(() => {
    container.remove()
    vi.restoreAllMocks()
  })

  function makeTestPage() {
    const gyro = makeGyro(0.01, 0, 0)
    const p = new GhostCalibrationPage(container, { win, gyro })
    // Spy on renderTelemetry
    const spy = vi.spyOn(p as unknown as { renderTelemetry(): void }, 'renderTelemetry')
    return { p, spy, gyro }
  }

  it('renderTelemetry is NOT called by onPipelineFrame in repositioning phase', () => {
    const { p, spy } = makeTestPage()
    // Enter repositioning phase (tap center to start recording, then confirm)
    p.getCenterDot().click()
    // Now phase='recording'; advance to repositioning via stop-btn
    const stopBtn = container.querySelector<HTMLButtonElement>('[data-testid="stop-btn"]')!
    stopBtn.click()
    expect(p.getPhase()).toBe('repositioning')

    spy.mockClear()
    const frame = { t: 200, yawRad: 0, pitchRad: 0, shiftPx: 0, pitchShiftPx: 0, dx_m: 0, dy_m: 0, gateOpen: true }
    ;(p as unknown as { onPipelineFrame(f: typeof frame): void }).onPipelineFrame(frame)
    expect(spy).not.toHaveBeenCalled()
  })

  it('renderTelemetry IS called by onPipelineFrame in recording phase', () => {
    const { p, spy } = makeTestPage()
    p.getCenterDot().click()
    expect(p.getPhase()).toBe('recording')

    spy.mockClear()
    const frame = { t: 200, yawRad: 0, pitchRad: 0, shiftPx: 0, pitchShiftPx: 0, dx_m: 0, dy_m: 0, gateOpen: true }
    ;(p as unknown as { onPipelineFrame(f: typeof frame): void }).onPipelineFrame(frame)
    expect(spy).toHaveBeenCalledOnce()
  })
})
