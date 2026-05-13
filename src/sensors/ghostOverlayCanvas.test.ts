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

function makeFullOverlay(opts: {
  gyro?: GyroLike & { fire(): void }
  getScreenOrientation?: () => string
} = {}) {
  let now = 0
  let rafCallback: FrameRequestCallback | null = null
  const viewfinder = document.createElement('div')
  document.body.appendChild(viewfinder)
  makeCanvas()
  const overlay = new GhostOverlayCanvas(viewfinder, {
    gyro: opts.gyro ?? null,
    getScreenOrientation: opts.getScreenOrientation,
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

  it('uses shared pipeline factory orientation listener wiring', () => {
    makeCanvas()
    const addSpy = vi.spyOn(window, 'addEventListener')
    const removeSpy = vi.spyOn(window, 'removeEventListener')
    const { canvas, viewfinder } = makeOverlay()
    const handler = addSpy.mock.calls.find(([type]) => type === 'deviceorientation')?.[1]

    expect(handler).toBeDefined()

    canvas.destroy()

    expect(removeSpy).toHaveBeenCalledWith('deviceorientation', handler)
    viewfinder.remove()
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

  it('canvas is sized to bitmap when viewfinder has no CSS dimensions', () => {
    makeCanvas()
    const { canvas, viewfinder } = makeOverlay()
    const el = viewfinder.querySelector('canvas')!
    // clientWidth/clientHeight are 0 in JSDOM → fallback to bitmap dims
    canvas.setSnapshot(makeBitmap(320, 240))
    expect(el.width).toBe(320)
    expect(el.height).toBe(240)
    viewfinder.remove()
  })

  it('cover-crop: landscape bitmap onto portrait canvas crops left/right edges', () => {
    const ctx = makeCanvas()
    const { canvas, viewfinder } = makeOverlay()
    // Mock viewfinder to have portrait CSS dims so readDisplayDims() returns them
    Object.defineProperty(viewfinder, 'clientWidth', { value: 375, configurable: true })
    Object.defineProperty(viewfinder, 'clientHeight', { value: 667, configurable: true })
    canvas.setSnapshot(makeBitmap(640, 480))

    // scale = max(375/640, 667/480) = 667/480 ≈ 1.3896
    // sw = 375/scale ≈ 269.8  sh = 667/scale ≈ 479.9
    // sx = (640-sw)/2 ≈ 185.1  sy = (480-sh)/2 ≈ 0.05
    const [, sx, sy, sw, sh, dx, dy, dw, dh] = ctx.drawImage.mock.calls.at(-1)!
    const scale = Math.max(375 / 640, 667 / 480)
    expect(sw).toBeCloseTo(375 / scale, 0)
    expect(sh).toBeCloseTo(667 / scale, 0)
    expect(sx).toBeCloseTo((640 - sw) / 2, 0)
    expect(sy).toBeCloseTo((480 - sh) / 2, 0)
    expect(dx).toBe(0); expect(dy).toBe(0)
    expect(dw).toBe(375); expect(dh).toBe(667)
    viewfinder.remove()
  })

  it('cover-crop: portrait bitmap onto landscape canvas crops top/bottom edges', () => {
    const ctx = makeCanvas()
    const { canvas, viewfinder } = makeOverlay()
    Object.defineProperty(viewfinder, 'clientWidth', { value: 640, configurable: true })
    Object.defineProperty(viewfinder, 'clientHeight', { value: 360, configurable: true })
    canvas.setSnapshot(makeBitmap(480, 480))

    // scale = max(640/480, 360/480) = 640/480 ≈ 1.333
    // sw = 480  sh = 360/scale = 270
    // sx = 0    sy = (480-270)/2 = 105
    const [, sx, sy, sw, sh] = ctx.drawImage.mock.calls.at(-1)!
    const scale = Math.max(640 / 480, 360 / 480)
    expect(sw).toBeCloseTo(640 / scale, 0)
    expect(sh).toBeCloseTo(360 / scale, 0)
    expect(sx).toBeCloseTo((480 - sw) / 2, 0)
    expect(sy).toBeCloseTo((480 - sh) / 2, 0)
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

describe('GhostOverlayCanvas pitch via pitchIntegral', () => {
  beforeEach(() => vi.restoreAllMocks())

  it('GIVEN gyro gx accumulates pitch THEN shiftPy reflects pitchIntegral', () => {
    const gyro = makeGyro()
    const { overlay, viewfinder, tick, el, setTime } = makeFullOverlay({ gyro })
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
    expect(state.rotShiftPy).not.toBe(0)

    const match = el.style.transform.match(/translate3d\(([-\d.]+)px,\s*([-\d.]+)px/)
    const shiftPy = Number(match![2])
    expect(shiftPy).not.toBe(0)
    viewfinder.remove()
  })

  it('GIVEN no gyro pitch THEN shiftPy is 0', () => {
    const gyro = makeGyro()
    const { overlay, viewfinder, tick, setTime } = makeFullOverlay({ gyro })
    overlay.setSnapshot(makeBitmap(640, 480))

    setTime(0)
    gyro.timestamp = 0; gyro.x = 0; gyro.y = 0; gyro.z = 0
    gyro.fire()
    setTime(200)
    gyro.timestamp = 200; gyro.x = 0; gyro.y = 0; gyro.z = 0
    gyro.fire()
    tick()

    const state = overlay.getDebugState()
    expect(state.pitchIntegral).toBe(0)
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
    viewfinder.remove()
  })

  it('GIVEN pitch accumulated WHEN setSnapshot called THEN pitchIntegral resets to 0', () => {
    const gyro = makeGyro()
    const { overlay, viewfinder, tick, setTime } = makeFullOverlay({ gyro })
    overlay.setSnapshot(makeBitmap(640, 480))

    setTime(0)
    gyro.timestamp = 0; gyro.x = 0.3; gyro.y = 0; gyro.z = 0
    gyro.fire()
    setTime(200)
    gyro.timestamp = 200; gyro.x = 0.3; gyro.y = 0; gyro.z = 0
    gyro.fire()
    tick()

    expect(overlay.getDebugState().pitchIntegral).not.toBe(0)

    overlay.setSnapshot(makeBitmap(640, 480))
    expect(overlay.getDebugState().pitchIntegral).toBe(0)
    expect(overlay.getDebugState().rotShiftPy).toBe(0)
    viewfinder.remove()
  })

  it('WHEN setSnapshot called THEN canvas.style.transform resets to translate3d(0, 0, 0)', () => {
    const gyro = makeGyro()
    const { overlay, viewfinder, setTime, el } = makeFullOverlay({ gyro })
    overlay.setSnapshot(makeBitmap(640, 480))

    // Accumulate yaw so transform is non-zero
    setTime(0); gyro.timestamp = 0; gyro.y = 0; gyro.fire()
    setTime(200); gyro.timestamp = 200; gyro.y = -0.3; gyro.fire()

    // Second setSnapshot must reset the transform immediately (no RAF tick needed)
    overlay.setSnapshot(makeBitmap(640, 480))
    expect(el.style.transform.replace(/0px/g, '0')).toBe('translate3d(0, 0, 0)')
    viewfinder.remove()
  })

  it('WHEN setSnapshot called THEN openGate is invoked so overlay renders on next tick', () => {
    const gyro = makeGyro()
    const { overlay, viewfinder, tick, setTime, el } = makeFullOverlay({ gyro })
    overlay.setSnapshot(makeBitmap(640, 480))

    // Close the gate via a high-omegaMag reading (enableMotionGate is always true)
    setTime(0); gyro.timestamp = 0; gyro.y = 0; gyro.fire(); tick()
    setTime(100); gyro.timestamp = 100; gyro.z = 2.0; gyro.fire(); tick()
    expect(el.hidden).toBe(true)

    // setSnapshot must call openGate() so canvas becomes visible on next low-omegaMag tick
    overlay.setSnapshot(makeBitmap(640, 480))
    setTime(200); gyro.timestamp = 200; gyro.z = 0; gyro.y = 0.1; gyro.fire(); tick()
    expect(el.hidden).toBe(false)
    viewfinder.remove()
  })
})


describe('GhostOverlayCanvas gate-close preserves yawIntegral (2yu)', () => {
  beforeEach(() => vi.restoreAllMocks())

  it('GIVEN yaw accumulated WHEN gate closes THEN canvas is hidden but yawIntegral is preserved', () => {
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
    // yawIntegral must NOT be zeroed — sensor keeps integrating while gate is closed
    // so ghost reopens at the correct position relative to the last capture
    expect(after.yawIntegral).not.toBe(0)
    // pitchIntegral is 0 because no pitch (gx) was applied in this test
    expect(after.pitchIntegral).toBe(0)
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
    const maxYaw = Math.tan((40 * Math.PI / 180) / 2)
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

describe('GhostOverlayCanvas onFrame callback', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it('GIVEN no onFrame in deps WHEN tick fires THEN no crash', () => {
    const { overlay, tick } = makeFullOverlay()
    overlay.setSnapshot(makeBitmap())
    expect(() => tick()).not.toThrow()
    overlay.destroy()
  })

  it('GIVEN onFrame provided WHEN tick fires with gate open THEN callback receives correct fields', () => {
    const frames: import('./ghostOverlayCanvas').GhostFrame[] = []
    let now = 0
    const raf = { cb: null as FrameRequestCallback | null }
    const viewfinder = document.createElement('div')
    document.body.appendChild(viewfinder)
    makeCanvas()
    const overlay = new GhostOverlayCanvas(viewfinder, {
      gyro: null,
      onFrame: (f) => frames.push(f),
      requestAnimationFrame: (cb) => { raf.cb = cb; return 1 },
      cancelAnimationFrame: vi.fn(),
      now: () => now,
    })
    overlay.setSnapshot(makeBitmap(400, 800))
    now = 42
    raf.cb?.(0)

    expect(frames).toHaveLength(1)
    expect(frames[0].t).toBe(42)
    expect(frames[0].gateOpen).toBe(true)
    expect(frames[0].pitchShiftPx).toBe(0)
    expect(typeof frames[0].shiftPx).toBe('number')
    expect(typeof frames[0].yawRad).toBe('number')
    expect(typeof frames[0].pitchRad).toBe('number')
    overlay.destroy()
    viewfinder.remove()
  })

  it('GIVEN onFrame provided WHEN no snapshot has been set THEN callback is not fired', () => {
    const frames: import('./ghostOverlayCanvas').GhostFrame[] = []
    const raf = { cb: null as FrameRequestCallback | null }
    const viewfinder = document.createElement('div')
    document.body.appendChild(viewfinder)
    makeCanvas()
    const overlay = new GhostOverlayCanvas(viewfinder, {
      gyro: null,
      onFrame: (f) => frames.push(f),
      requestAnimationFrame: (cb) => { raf.cb = cb; return 1 },
      cancelAnimationFrame: vi.fn(),
      now: () => 0,
    })
    // no setSnapshot → gate stays closed (hasSnapshot=false)
    raf.cb?.(0)
    expect(frames).toHaveLength(0)
    overlay.destroy()
    viewfinder.remove()
  })
})

function makeMotion(x = 0, y = 0, interval = 16): MotionLike & { fire(): void } {
  const m: MotionLike & { fire(): void } = {
    onreading: null,
    x, y,
    interval,
    gravitySubtracted: true,
    start: vi.fn(),
    stop: vi.fn(),
    fire() { this.onreading?.() },
  }
  return m
}

describe('GhostOverlayCanvas translation shift (spec: add-translation-tracking)', () => {
  beforeEach(() => vi.restoreAllMocks())

  it('GIVEN motion laterally WHEN accel fires THEN translate3d includes translation component', () => {
    // 60cm working distance, lateral accel 1 m/s² for 200ms → dx_m ≈ 0.02m
    // translationShiftPx = -(0.02 / 0.60) * focalLengthPx(800, 40) ≈ some non-zero value
    const gyro = makeGyro()
    const motion = makeMotion(1.0, 0)  // ax=1.0 m/s²
    let now = 0
    const raf = { cb: null as FrameRequestCallback | null }
    const viewfinder = document.createElement('div')
    document.body.appendChild(viewfinder)
    makeCanvas()
    Object.defineProperty(viewfinder, 'clientWidth', { get: () => 800 })
    Object.defineProperty(viewfinder, 'clientHeight', { get: () => 600 })
    const overlay = new GhostOverlayCanvas(viewfinder, {
      gyro,
      motion,
      distanceCm: 60,
      requestAnimationFrame: (cb) => { raf.cb = cb; return 1 },
      cancelAnimationFrame: vi.fn(),
      now: () => now,
    })
    overlay.setSnapshot(makeBitmap(800, 600))

    // Fire gyro at t=0 (baseline)
    gyro.timestamp = 0; gyro.x = 0; gyro.y = 0; gyro.z = 0
    gyro.fire()

    // Fire motion at t=0 and t=200ms to build velocity
    motion.x = 1.0; motion.y = 0
    motion.fire()   // t=0 baseline
    now = 200
    motion.fire()   // dt=200ms, ax=1.0 → velX≈0.2, dx_m≈0.02

    // RAF tick at t=200ms
    raf.cb?.(200)

    const el = viewfinder.querySelector('canvas')!
    const match = el.style.transform.match(/translate3d\(([-\d.]+)px,\s*([-\d.]+)px/)
    expect(match).not.toBeNull()
    const totalShiftPx = Number(match![1])
    // Without translation, pure gyro gives shiftPx ≈ 0 (gyro at 0 rad/s)
    // With translation, shiftPx should be non-zero (negative: camera moved right)
    expect(totalShiftPx).not.toBe(0)

    overlay.destroy()
    viewfinder.remove()
  })

  it('WHEN ghost:shift log fires THEN payload includes dx_cm, dy_cm, velX, velY', () => {
    const gyro = makeGyro()
    const motion = makeMotion(0.5, 0)
    const logCalls: unknown[] = []
    let now = 0
    const raf = { cb: null as FrameRequestCallback | null }
    const viewfinder = document.createElement('div')
    document.body.appendChild(viewfinder)
    makeCanvas()
    const overlay = new GhostOverlayCanvas(viewfinder, {
      gyro,
      motion,
      distanceCm: 60,
      logger: { log: (_k: unknown, payload: unknown) => logCalls.push({ _k, payload }) },
      requestAnimationFrame: (cb) => { raf.cb = cb; return 1 },
      cancelAnimationFrame: vi.fn(),
      now: () => now,
    })
    overlay.setSnapshot(makeBitmap(800, 600))

    gyro.timestamp = 0; gyro.x = 0; gyro.y = 0; gyro.z = 0; gyro.fire()
    motion.x = 0.5; motion.y = 0; motion.fire()
    now = 600  // ≥500ms so shift log fires
    motion.fire()
    raf.cb?.(600)

    const shiftLog = logCalls.find((c: unknown) => (c as { _k: string })._k === 'ghost:shift')
    expect(shiftLog).not.toBeUndefined()
    const payload = (shiftLog as { payload: Record<string, unknown> }).payload
    expect(typeof payload['dx_cm']).toBe('number')
    expect(typeof payload['dy_cm']).toBe('number')
    expect(typeof payload['velX']).toBe('number')
    expect(typeof payload['velY']).toBe('number')

    overlay.destroy()
    viewfinder.remove()
  })

  it('getDebugState includes workingDistanceCm, dx_cm, dy_cm, velX, velY', () => {
    const gyro = makeGyro()
    const motion = makeMotion(0.5, 0)
    const viewfinder = document.createElement('div')
    document.body.appendChild(viewfinder)
    makeCanvas()
    const overlay = new GhostOverlayCanvas(viewfinder, {
      gyro,
      motion,
      distanceCm: 80,
      requestAnimationFrame: () => 1,
      cancelAnimationFrame: vi.fn(),
      now: () => 0,
    })

    const state = overlay.getDebugState()
    expect(state.workingDistanceCm).toBe(80)
    expect(typeof state.dx_cm).toBe('number')
    expect(typeof state.dy_cm).toBe('number')
    expect(typeof state.velX).toBe('number')
    expect(typeof state.velY).toBe('number')

    overlay.destroy()
    viewfinder.remove()
  })
})


describe('GhostOverlayCanvas distanceCm out-of-range clamping (spec: add-distance-config)', () => {
  beforeEach(() => vi.restoreAllMocks())

  it('GIVEN distanceCm=10 (below min 20) THEN clamped to 20 and console.warn emitted', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    makeCanvas()
    const viewfinder = document.createElement('div')
    document.body.appendChild(viewfinder)
    const overlay = new GhostOverlayCanvas(viewfinder, {
      gyro: null,
      distanceCm: 10,
      requestAnimationFrame: () => 1,
      cancelAnimationFrame: vi.fn(),
      now: () => 0,
    })
    const state = overlay.getDebugState()
    expect(state.workingDistanceCm).toBe(20)
    expect(warnSpy).toHaveBeenCalled()
    overlay.destroy()
    viewfinder.remove()
  })

  it('GIVEN distanceCm=200 (above max 150) THEN clamped to 150 and console.warn emitted', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    makeCanvas()
    const viewfinder = document.createElement('div')
    document.body.appendChild(viewfinder)
    const overlay = new GhostOverlayCanvas(viewfinder, {
      gyro: null,
      distanceCm: 200,
      requestAnimationFrame: () => 1,
      cancelAnimationFrame: vi.fn(),
      now: () => 0,
    })
    const state = overlay.getDebugState()
    expect(state.workingDistanceCm).toBe(150)
    expect(warnSpy).toHaveBeenCalled()
    overlay.destroy()
    viewfinder.remove()
  })

  it('GIVEN distanceCm=80 (valid) THEN no console.warn emitted', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    makeCanvas()
    const viewfinder = document.createElement('div')
    document.body.appendChild(viewfinder)
    const overlay = new GhostOverlayCanvas(viewfinder, {
      gyro: null,
      distanceCm: 80,
      requestAnimationFrame: () => 1,
      cancelAnimationFrame: vi.fn(),
      now: () => 0,
    })
    expect(warnSpy).not.toHaveBeenCalled()
    overlay.destroy()
    viewfinder.remove()
  })
})

describe('GhostOverlayCanvas — tilt warning', () => {
  beforeEach(() => { vi.restoreAllMocks() })

  function makeOverlayWithBeta(getBeta: () => number | null) {
    let now = 0
    const logger = { log: vi.fn() }
    const viewfinder = document.createElement('div')
    document.body.appendChild(viewfinder)
    makeCanvas()
    const overlay = new GhostOverlayCanvas(viewfinder, {
      gyro: null,
      getBeta,
      logger,
      requestAnimationFrame: () => 1,
      cancelAnimationFrame: vi.fn(),
      now: () => now,
    })
    const setTime = (ms: number) => { now = ms }
    return { overlay, viewfinder, logger, setTime }
  }

  it('does not emit ghost:tilt-warning when beta is within 30° of 90°', () => {
    let beta = 80  // |80 - 90| = 10° — within range
    const { overlay, viewfinder, logger, setTime } = makeOverlayWithBeta(() => beta)
    overlay.feedBeta(beta, 0)
    setTime(2000)
    overlay.feedBeta(beta, 2000)
    expect(logger.log).not.toHaveBeenCalledWith('ghost:tilt-warning', expect.anything())
    overlay.destroy()
    viewfinder.remove()
  })

  it('does not emit ghost:tilt-warning when deviation >30° but duration <1s', () => {
    let beta = 30  // |30 - 90| = 60° > 30°
    const { overlay, viewfinder, logger, setTime } = makeOverlayWithBeta(() => beta)
    overlay.feedBeta(beta, 0)
    setTime(500)
    overlay.feedBeta(beta, 500)
    expect(logger.log).not.toHaveBeenCalledWith('ghost:tilt-warning', expect.anything())
    overlay.destroy()
    viewfinder.remove()
  })

  it('emits ghost:tilt-warning when deviation >30° for >1s', () => {
    let beta = 30  // |30 - 90| = 60° > 30°
    const { overlay, viewfinder, logger } = makeOverlayWithBeta(() => beta)
    overlay.feedBeta(beta, 0)
    overlay.feedBeta(beta, 1100)
    expect(logger.log).toHaveBeenCalledWith('ghost:tilt-warning', { visible: true, beta: 30 })
    overlay.destroy()
    viewfinder.remove()
  })

  it('clears ghost:tilt-warning immediately when beta returns to safe range', () => {
    let beta = 30
    const { overlay, viewfinder, logger } = makeOverlayWithBeta(() => beta)
    overlay.feedBeta(beta, 0)
    overlay.feedBeta(beta, 1100)  // warning fires
    beta = 80  // back in range
    overlay.feedBeta(beta, 1200)
    const calls = logger.log.mock.calls.filter(c => c[0] === 'ghost:tilt-warning')
    const lastCall = calls[calls.length - 1]
    expect(lastCall[1]).toMatchObject({ visible: false })
    overlay.destroy()
    viewfinder.remove()
  })
})
