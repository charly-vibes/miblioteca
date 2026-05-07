import { beforeEach, describe, expect, it, vi } from 'vitest'
import { GhostOverlayCanvas } from './ghostOverlayCanvas'
import type { GyroLike } from './ghostOverlayCanvas'

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
  function makeGyro(x = 0, y = 0, z = 0): GyroLike & { fire(): void } {
    const gyro = {
      onreading: null as (() => void) | null,
      onerror: null as ((e: Event) => void) | null,
      x, y, z, timestamp: 100 as DOMHighResTimeStamp | null,
      start: vi.fn(),
      stop: vi.fn(),
      fire() { this.onreading?.() },
    }
    return gyro
  }

  function makeTickableOverlay(gyro: GyroLike | null = null) {
    let rafCallback: FrameRequestCallback | null = null
    const raf = vi.fn((cb: FrameRequestCallback) => { rafCallback = cb; return 1 })
    const viewfinder = document.createElement('div')
    document.body.appendChild(viewfinder)
    makeCanvas()
    const overlay = new GhostOverlayCanvas(viewfinder, {
      gyro,
      requestAnimationFrame: raf,
      cancelAnimationFrame: vi.fn(),
      now: () => 100,
    })
    const tick = () => rafCallback?.(0)
    return { overlay, viewfinder, tick }
  }

  beforeEach(() => vi.restoreAllMocks())

  it('hides canvas on rafLoop tick when omegaMag > 0.5 (after snapshot set)', () => {
    const gyro = makeGyro(0, 0, 1.0)  // gz = 1.0 rad/s > 0.5 threshold
    const { overlay, viewfinder, tick } = makeTickableOverlay(gyro)
    const el = viewfinder.querySelector('canvas')!
    overlay.setSnapshot(makeBitmap())  // hasSnapshot=true, omegaMag reset to 0
    expect(el.hidden).toBe(false)
    gyro.z = 1.0
    gyro.fire()                        // onGyroReading → omegaMag = 1.0
    tick()                             // rafLoop → shouldShow = false → hidden
    expect(el.hidden).toBe(true)
    viewfinder.remove()
  })

  it('shows canvas on rafLoop tick when omegaMag ≤ 0.5 and snapshot exists', () => {
    const gyro = makeGyro(0, 0, 0.0)
    const { overlay, viewfinder, tick } = makeTickableOverlay(gyro)
    const el = viewfinder.querySelector('canvas')!
    overlay.setSnapshot(makeBitmap())  // hasSnapshot=true, omegaMag=0
    gyro.z = 0.0
    gyro.fire()                        // omegaMag = 0 ≤ 0.5
    tick()                             // rafLoop → shouldShow = true
    expect(el.hidden).toBe(false)
    viewfinder.remove()
  })

  it('stays hidden when omegaMag ≤ 0.5 but no snapshot has been set', () => {
    const gyro = makeGyro(0, 0, 0.0)
    const { overlay, viewfinder, tick } = makeTickableOverlay(gyro)
    const el = viewfinder.querySelector('canvas')!
    expect(el.hidden).toBe(true)
    gyro.z = 0.0
    gyro.fire()                        // omegaMag = 0 ≤ 0.5, but hasSnapshot=false
    tick()                             // rafLoop → shouldShow = false → stays hidden
    expect(el.hidden).toBe(true)
    viewfinder.remove()
  })

  it('cancels the RAF loop on the tick immediately after destroy()', () => {
    const cancelRaf = vi.fn()
    let rafCallback: FrameRequestCallback | null = null
    const viewfinder = document.createElement('div')
    document.body.appendChild(viewfinder)
    makeCanvas()
    const overlay = new GhostOverlayCanvas(viewfinder, {
      gyro: null,
      requestAnimationFrame: (cb) => { rafCallback = cb; return 42 },
      cancelAnimationFrame: cancelRaf,
      now: () => 0,
    })
    overlay.destroy()                 // sets destroyed=true, cancels current rafId
    cancelRaf.mockClear()
    rafCallback?.(0)                  // simulate the already-scheduled callback firing post-destroy
    expect(cancelRaf).toHaveBeenCalled()  // the loop self-cancels its newly scheduled id
    viewfinder.remove()
  })
})
