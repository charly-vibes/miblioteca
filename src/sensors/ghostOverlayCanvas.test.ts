import { beforeEach, describe, expect, it, vi } from 'vitest'
import { GhostOverlayCanvas } from './ghostOverlayCanvas'

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
