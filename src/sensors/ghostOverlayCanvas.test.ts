import { beforeEach, describe, expect, it, vi } from 'vitest'
import { GhostOverlayCanvas } from './ghostOverlayCanvas'
import type { GyroLike, MotionLike } from './ghostOverlayCanvas'

function makeCanvas() {
  const mockCtx = {
    clearRect: vi.fn(),
    drawImage: vi.fn(),
  }
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(mockCtx as unknown as CanvasRenderingContext2D)
  return mockCtx
}

function makeBitmap(width = 100, height = 50): ImageBitmap {
  return { width, height } as unknown as ImageBitmap
}

function makeOverlay() {
  const viewfinder = document.createElement('div')
  document.body.appendChild(viewfinder)
  const canvas = new GhostOverlayCanvas(viewfinder, {
    gyro: null,
    requestAnimationFrame: () => 0,
    cancelAnimationFrame: () => {},
    now: () => 0,
  })
  return { canvas, viewfinder }
}

function makeGyro(x = 0, y = 0, z = 0): GyroLike & { fire(): void } {
  return {
    onreading: null,
    onerror: null,
    x, y, z,
    timestamp: 100 as DOMHighResTimeStamp | null,
    start: vi.fn(),
    stop: vi.fn(),
    fire() { this.onreading?.() },
  }
}

function makeMotion(x = 0, y = 0): MotionLike & { fire(): void } {
  return {
    onreading: null,
    x, y,
    interval: 16,
    gravitySubtracted: true,
    start: vi.fn(),
    stop: vi.fn(),
    fire() { this.onreading?.() },
  }
}

function makeFullOverlay(opts: {
  gyro?: GyroLike & { fire(): void }
  motion?: MotionLike & { fire(): void }
  getBeta?: () => number
} = {}) {
  let now = 0
  let rafCallback: FrameRequestCallback | null = null
  const viewfinder = document.createElement('div')
  document.body.appendChild(viewfinder)
  makeCanvas()
  const overlay = new GhostOverlayCanvas(viewfinder, {
    gyro: opts.gyro ?? null,
    motion: opts.motion,
    getBeta: opts.getBeta,
    requestAnimationFrame: (cb) => { rafCallback = cb; return 1 },
    cancelAnimationFrame: vi.fn(),
    now: () => now,
  })
  const tick = () => rafCallback?.(0)
  const setTime = (ms: number) => { now = ms }
  const el = viewfinder.querySelector('canvas')!
  return { overlay, viewfinder, tick, setTime, el }
}

describe('GhostOverlayCanvas.setSnapshot', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it('WHEN setSnapshot called with a valid bitmap THEN canvas becomes visible', () => {
    makeCanvas()
    const { canvas, viewfinder } = makeOverlay()
    const el = viewfinder.querySelector('canvas')!
    expect(el.hidden).toBe(true)
    canvas.setSnapshot(makeBitmap())
    expect(el.hidden).toBe(false)
    viewfinder.remove()
  })

  it('WHEN grabFrame returns null on first capture THEN ghost canvas remains hidden', () => {
    makeCanvas()
    const { canvas, viewfinder } = makeOverlay()
    const el = viewfinder.querySelector('canvas')!
    expect(el.hidden).toBe(true)
    canvas.setSnapshot(null)
    expect(el.hidden).toBe(true)
    viewfinder.remove()
  })

  it('WHEN grabFrame returns null after a prior capture THEN previous snapshot is retained (canvas stays visible)', () => {
    const ctx = makeCanvas()
    const { canvas, viewfinder } = makeOverlay()
    const el = viewfinder.querySelector('canvas')!
    canvas.setSnapshot(makeBitmap())
    expect(el.hidden).toBe(false)
    const drawCallsBefore = ctx.drawImage.mock.calls.length
    canvas.setSnapshot(null)
    expect(el.hidden).toBe(false)
    expect(ctx.drawImage.mock.calls.length).toBe(drawCallsBefore)
    viewfinder.remove()
  })
})

describe('GhostOverlayCanvas motion gating', () => {
  beforeEach(() => vi.restoreAllMocks())

  it('hides canvas on rafLoop tick when omegaMag > 0.5 (after snapshot set)', () => {
    const gyro = makeGyro(0, 0, 1.0)
    const { overlay, viewfinder, tick, el } = makeFullOverlay({ gyro })
    overlay.setSnapshot(makeBitmap())
    expect(el.hidden).toBe(false)
    gyro.z = 1.0
    gyro.fire()
    tick()
    expect(el.hidden).toBe(true)
    viewfinder.remove()
  })

  it('shows canvas on rafLoop tick when omegaMag ≤ 0.5 and snapshot exists', () => {
    const gyro = makeGyro(0, 0, 0.0)
    const { overlay, viewfinder, tick, el } = makeFullOverlay({ gyro })
    overlay.setSnapshot(makeBitmap())
    gyro.z = 0.0
    gyro.fire()
    tick()
    expect(el.hidden).toBe(false)
    viewfinder.remove()
  })

  it('stays hidden when omegaMag ≤ 0.5 but no snapshot has been set', () => {
    const gyro = makeGyro(0, 0, 0.0)
    const { viewfinder, tick, el } = makeFullOverlay({ gyro })
    expect(el.hidden).toBe(true)
    gyro.z = 0.0
    gyro.fire()
    tick()
    expect(el.hidden).toBe(true)
    viewfinder.remove()
  })

  it('does not reschedule the RAF loop after destroy()', () => {
    const scheduleRaf = vi.fn((cb: FrameRequestCallback) => { void cb; return 42 })
    const cancelRaf = vi.fn()
    const raf = { callback: null as FrameRequestCallback | null }
    const viewfinder = document.createElement('div')
    document.body.appendChild(viewfinder)
    makeCanvas()
    const overlay = new GhostOverlayCanvas(viewfinder, {
      gyro: null,
      requestAnimationFrame: (cb) => { raf.callback = cb; return scheduleRaf(cb) },
      cancelAnimationFrame: cancelRaf,
      now: () => 0,
    })
    overlay.destroy()
    scheduleRaf.mockClear()
    raf.callback?.(0)
    expect(scheduleRaf).not.toHaveBeenCalled()
    viewfinder.remove()
  })
})

describe('GhostOverlayCanvas portrait pan shift', () => {
  beforeEach(() => vi.restoreAllMocks())

  it('GIVEN portrait pan right WHEN gyro fires with gy < 0 THEN shiftPx < 0 (ghost moves left)', () => {
    const gyro = makeGyro()
    const { overlay, viewfinder, tick, setTime } = makeFullOverlay({ gyro })
    overlay.setSnapshot(makeBitmap(640, 480))

    setTime(0)
    gyro.timestamp = 0
    gyro.x = 0; gyro.y = 0; gyro.z = 0
    gyro.fire()

    // gy=-0.3 → omegaMag=0.3 (below 0.55 hide threshold)
    setTime(200)
    gyro.timestamp = 200
    gyro.y = -0.3
    gyro.fire()
    tick()

    const state = overlay.getDebugState()
    expect(state.shiftPx).toBeLessThan(0)
    viewfinder.remove()
  })

  it('GIVEN portrait pan left WHEN gyro fires with gy > 0 THEN shiftPx > 0 (ghost moves right)', () => {
    const gyro = makeGyro()
    const { overlay, viewfinder, tick, setTime } = makeFullOverlay({ gyro })
    overlay.setSnapshot(makeBitmap(640, 480))

    setTime(0)
    gyro.timestamp = 0
    gyro.x = 0; gyro.y = 0; gyro.z = 0
    gyro.fire()

    setTime(200)
    gyro.timestamp = 200
    gyro.y = 0.3
    gyro.fire()
    tick()

    const state = overlay.getDebugState()
    expect(state.shiftPx).toBeGreaterThan(0)
    viewfinder.remove()
  })
})

describe('GhostOverlayCanvas pitch via absolute beta', () => {
  beforeEach(() => vi.restoreAllMocks())

  it('GIVEN getBeta returns 80 at snapshot and 90 now THEN shiftPy reflects the 10° delta', () => {
    let beta = 80
    const gyro = makeGyro()
    const { overlay, viewfinder, tick, el, setTime } = makeFullOverlay({
      gyro,
      getBeta: () => beta,
    })
    overlay.setSnapshot(makeBitmap(640, 480))

    // Fire gyro so omegaMag stays below gate
    setTime(0)
    gyro.timestamp = 0; gyro.x = 0; gyro.y = 0; gyro.z = 0
    gyro.fire()

    // Now beta changes to 90 (10° tilt from snapshot)
    beta = 90
    setTime(100)
    gyro.timestamp = 100; gyro.x = 0; gyro.y = 0; gyro.z = 0
    gyro.fire()
    tick()

    const match = el.style.transform.match(/translate3d\(([-\d.]+)px,\s*([-\d.]+)px/)
    const shiftPy = Number(match![2])
    // 10° positive pitch → positive shift (ghost moves down)
    expect(shiftPy).toBeGreaterThan(0)
    viewfinder.remove()
  })

  it('GIVEN getBeta unavailable THEN shiftPy is 0 (no vertical drift)', () => {
    const gyro = makeGyro()
    const { overlay, viewfinder, tick, setTime } = makeFullOverlay({ gyro })
    overlay.setSnapshot(makeBitmap(640, 480))

    // Pump gx to accumulate pitchIntegral (keep omegaMag below gate)
    setTime(0)
    gyro.timestamp = 0; gyro.x = 0.2; gyro.y = 0; gyro.z = 0
    gyro.fire()

    setTime(200)
    gyro.timestamp = 200; gyro.x = 0.2; gyro.y = 0; gyro.z = 0
    gyro.fire()
    tick()

    const state = overlay.getDebugState()
    // pitchIntegral is non-zero (gyro did accumulate) but rotShiftPy is 0 (no getBeta → no delta)
    expect(state.pitchIntegral).not.toBe(0)
    expect(state.rotShiftPy).toBe(0)
    viewfinder.remove()
  })

  it('GIVEN gyro pitchIntegral accumulated WHEN getBeta is stable THEN pitch is 0 (gyro integral ignored)', () => {
    let beta = 85
    const gyro = makeGyro()
    const { overlay, viewfinder, tick, setTime } = makeFullOverlay({
      gyro,
      getBeta: () => beta,
    })
    overlay.setSnapshot(makeBitmap(640, 480))

    setTime(0)
    gyro.timestamp = 0; gyro.x = 0; gyro.y = 0; gyro.z = 0
    gyro.fire()

    // Pump gx to accumulate pitchIntegral (keep omegaMag below gate)
    setTime(200)
    gyro.timestamp = 200; gyro.x = 0.3; gyro.y = 0; gyro.z = 0
    gyro.fire()
    tick()

    const state = overlay.getDebugState()
    expect(state.pitchIntegral).not.toBe(0)
    expect(state.rotShiftPy).toBe(0)
    viewfinder.remove()
  })
})

describe('GhostOverlayCanvas setSnapshot reset', () => {
  beforeEach(() => vi.restoreAllMocks())

  it('GIVEN accumulated shift WHEN setSnapshot called THEN all accumulators reset to 0', () => {
    const gyro = makeGyro()
    const { overlay, viewfinder, tick, setTime } = makeFullOverlay({ gyro })
    overlay.setSnapshot(makeBitmap(640, 480))

    // Accumulate yaw (keep omegaMag below gate)
    setTime(0)
    gyro.timestamp = 0; gyro.x = 0; gyro.y = 0; gyro.z = 0
    gyro.fire()
    setTime(200)
    gyro.timestamp = 200; gyro.y = -0.3; gyro.x = 0; gyro.z = 0
    gyro.fire()
    tick()

    const before = overlay.getDebugState()
    expect(before.shiftPx).not.toBe(0)

    // Second snapshot resets everything
    overlay.setSnapshot(makeBitmap(640, 480))
    const after = overlay.getDebugState()
    expect(after.yawIntegral).toBe(0)
    expect(after.pitchIntegral).toBe(0)
    expect(after.dx_cm).toBe(0)
    expect(after.dy_cm).toBe(0)
    expect(after.velX).toBe(0)
    expect(after.velY).toBe(0)
    viewfinder.remove()
  })

  it('GIVEN getBeta returns 75 WHEN setSnapshot called THEN snapshotBeta captured as 75', () => {
    let beta = 75
    const gyro = makeGyro()
    const { overlay, viewfinder, tick, setTime } = makeFullOverlay({
      gyro,
      getBeta: () => beta,
    })
    overlay.setSnapshot(makeBitmap(640, 480))

    // Beta stays at 75 → delta is 0 → no vertical shift
    setTime(0)
    gyro.timestamp = 0; gyro.x = 0; gyro.y = 0; gyro.z = 0
    gyro.fire()
    setTime(100)
    gyro.timestamp = 100; gyro.x = 0; gyro.y = 0; gyro.z = 0
    gyro.fire()
    tick()

    const state1 = overlay.getDebugState()
    expect(state1.rotShiftPy).toBe(0)

    // Now beta changes to 85 → delta = 10°
    beta = 85
    setTime(200)
    gyro.timestamp = 200; gyro.x = 0; gyro.y = 0; gyro.z = 0
    gyro.fire()
    tick()

    const state2 = overlay.getDebugState()
    expect(state2.rotShiftPy).toBeGreaterThan(0)
    viewfinder.remove()
  })
})

describe('GhostOverlayCanvas gate-close ZUPT', () => {
  beforeEach(() => vi.restoreAllMocks())

  it('GIVEN motion data accumulated WHEN gate closes THEN velX zeroed but dx_m retained', () => {
    const gyro = makeGyro()
    const motion = makeMotion()
    const { overlay, viewfinder, tick, setTime } = makeFullOverlay({ gyro, motion })
    overlay.setSnapshot(makeBitmap(640, 480))

    // Feed motion to accumulate displacement
    setTime(0)
    gyro.timestamp = 0; gyro.x = 0; gyro.y = 0; gyro.z = 0
    gyro.fire()
    motion.x = 1.0; motion.y = 0
    motion.fire()

    setTime(100)
    gyro.timestamp = 100; gyro.x = 0; gyro.y = 0; gyro.z = 0
    gyro.fire()
    motion.fire()
    tick()

    // Get debug state — dx_cm should be non-zero
    const before = overlay.getDebugState()
    expect(before.dx_cm).not.toBe(0)

    // Spike omegaMag above hide threshold to close the gate
    setTime(200)
    gyro.timestamp = 200; gyro.x = 0; gyro.y = 0; gyro.z = 2.0
    gyro.fire()
    tick()

    const after = overlay.getDebugState()
    // Velocity zeroed by ZUPT
    expect(after.velX).toBe(0)
    expect(after.velY).toBe(0)
    // Displacement retained
    expect(after.dx_cm).toBe(before.dx_cm)
    viewfinder.remove()
  })
})

describe('GhostOverlayCanvas rotation + translation additive', () => {
  beforeEach(() => vi.restoreAllMocks())

  it('GIVEN yaw rotation AND lateral translation THEN total shift = rotation + translation', () => {
    const gyro = makeGyro()
    const motion = makeMotion()
    const { overlay, viewfinder, tick, setTime } = makeFullOverlay({ gyro, motion })
    overlay.setSnapshot(makeBitmap(640, 480))

    // First gyro (baseline)
    setTime(0)
    gyro.timestamp = 0; gyro.x = 0; gyro.y = 0; gyro.z = 0
    gyro.fire()
    motion.x = 0; motion.y = 0
    motion.fire()

    // Slow pan right (gy < 0, below hide threshold) + translate right (ax > 0)
    setTime(200)
    gyro.timestamp = 200; gyro.y = -0.3; gyro.x = 0; gyro.z = 0
    gyro.fire()
    motion.x = 0.5
    motion.fire()
    tick()

    const state = overlay.getDebugState()
    // Both rotation and translation produce negative shift (leftward) for rightward motion
    expect(state.rotShiftPx).toBeLessThan(0)
    expect(state.transShiftPx).toBeLessThan(0)
    // Combined shift is more negative than either component alone
    expect(state.shiftPx).toBeLessThan(state.rotShiftPx)
    expect(state.shiftPx).toBeLessThan(state.transShiftPx)
    viewfinder.remove()
  })
})

describe('GhostOverlayCanvas gate-close yaw reset (2yu)', () => {
  beforeEach(() => vi.restoreAllMocks())

  it('GIVEN yaw accumulated WHEN gate closes THEN yawIntegral and pitchIntegral reset to 0', () => {
    const gyro = makeGyro()
    const { overlay, viewfinder, tick, setTime } = makeFullOverlay({ gyro })
    overlay.setSnapshot(makeBitmap(640, 480))

    // Slow pan — omegaMag=0.3 < 0.40 show threshold, gate stays open
    setTime(0)
    gyro.timestamp = 0; gyro.x = 0; gyro.y = 0; gyro.z = 0
    gyro.fire()
    tick()

    setTime(200)
    gyro.timestamp = 200; gyro.y = -0.3; gyro.x = 0; gyro.z = 0
    gyro.fire()
    tick()

    const before = overlay.getDebugState()
    expect(before.yawIntegral).not.toBe(0)

    // Spike omegaMag above hide threshold to close the gate
    setTime(300)
    gyro.timestamp = 300; gyro.x = 0; gyro.y = 0; gyro.z = 2.0
    gyro.fire()
    tick()

    const after = overlay.getDebugState()
    expect(after.yawIntegral).toBe(0)
    expect(after.pitchIntegral).toBe(0)
    // Velocity also zeroed; displacement retained
    expect(after.velX).toBe(0)
    viewfinder.remove()
  })
})

describe('GhostOverlayCanvas yaw viewport clamp (3cg)', () => {
  beforeEach(() => vi.restoreAllMocks())

  it('GIVEN sustained pan past display edge THEN yawIntegral is clamped to tan(hFov/2) after render tick', () => {
    const gyro = makeGyro()
    const { overlay, viewfinder, tick, setTime } = makeFullOverlay({ gyro })
    overlay.setSnapshot(makeBitmap(640, 480))

    // First gyro sample
    setTime(0)
    gyro.timestamp = 0; gyro.x = 0; gyro.y = 0; gyro.z = 0
    gyro.fire()
    tick()

    // Very fast sustained pan — builds up yaw far beyond display boundary
    setTime(5000)
    gyro.timestamp = 5000; gyro.y = -10.0; gyro.x = 0; gyro.z = 0
    gyro.fire()
    tick()

    const state = overlay.getDebugState()
    const maxYaw = Math.tan((65 * Math.PI / 180) / 2)
    // yawIntegral must not exceed the viewport boundary
    expect(Math.abs(state.yawIntegral)).toBeLessThanOrEqual(maxYaw + 0.001)
    viewfinder.remove()
  })
})

describe('GhostOverlayCanvas viewport cap', () => {
  beforeEach(() => vi.restoreAllMocks())

  it('GIVEN clientWidth=875 innerWidth=414 THEN displayWidth=414 in debug state', () => {
    const gyro = makeGyro()
    const { overlay, viewfinder } = makeFullOverlay({ gyro })

    // jsdom clientWidth/innerWidth are 0 by default; override them
    Object.defineProperty(viewfinder, 'clientWidth', { value: 875, configurable: true })
    Object.defineProperty(viewfinder, 'clientHeight', { value: 361, configurable: true })
    Object.defineProperty(window, 'innerWidth', { value: 414, configurable: true })
    Object.defineProperty(window, 'innerHeight', { value: 896, configurable: true })

    overlay.setSnapshot(makeBitmap(875, 361))
    const state = overlay.getDebugState()
    expect(state.displayWidth).toBe(414)
    expect(state.displayHeight).toBe(361)

    // Cleanup
    Object.defineProperty(window, 'innerWidth', { value: 0, configurable: true })
    Object.defineProperty(window, 'innerHeight', { value: 0, configurable: true })
    viewfinder.remove()
  })
})
