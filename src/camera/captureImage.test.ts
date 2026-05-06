import { describe, it, expect, vi } from 'vitest'
import { captureImage, type CaptureImageDeps } from './captureImage'

function makeBlob(content = 'data'): Blob {
  return new Blob([content], { type: 'image/jpeg' })
}

function makeBitmapFactory(dimensionMap: Map<Blob, { width: number; height: number }>) {
  return async (blob: Blob) => {
    const dims = dimensionMap.get(blob) ?? { width: 1920, height: 1080 }
    return { ...dims, close: vi.fn() }
  }
}

const canvasBlob = makeBlob('canvas')
const canvasSnapshot = vi.fn(async () => ({ blob: canvasBlob, width: 1920, height: 1080 }))

const BASE_DEPS: Omit<CaptureImageDeps, 'createImageBitmap'> = {
  videoWidth: 1920,
  videoHeight: 1080,
  canvasSnapshot,
}

describe('captureImage', () => {
  it('uses canvas when no imageCapture provided', async () => {
    const result = await captureImage({ ...BASE_DEPS, canvasSnapshot })
    expect(result.sourceApi).toBe('CanvasSnapshot')
    expect(result.blob).toBe(canvasBlob)
  })

  it('returns ImageCapture sourceApi when takePhoto returns high-res blob', async () => {
    const photoBlob = makeBlob('photo-hires')
    const dimensionMap = new Map([[photoBlob, { width: 4032, height: 3024 }]])
    const imageCapture = { takePhoto: vi.fn(async () => photoBlob) }

    const result = await captureImage({
      ...BASE_DEPS,
      imageCapture,
      createImageBitmap: makeBitmapFactory(dimensionMap),
    })

    expect(result.sourceApi).toBe('ImageCapture')
    expect(result.blob).toBe(photoBlob)
    expect(result.width).toBe(4032)
    expect(result.height).toBe(3024)
  })

  it('falls back to canvas when takePhoto returns video-resolution blob', async () => {
    const photoBlob = makeBlob('photo-lowres')
    // Same as video resolution — Chromium re-encoded a video frame
    const dimensionMap = new Map([[photoBlob, { width: 1920, height: 1080 }]])
    const imageCapture = { takePhoto: vi.fn(async () => photoBlob) }

    const result = await captureImage({
      ...BASE_DEPS,
      imageCapture,
      createImageBitmap: makeBitmapFactory(dimensionMap),
    })

    expect(result.sourceApi).toBe('CanvasSnapshot')
    expect(result.blob).toBe(canvasBlob)
  })

  it('falls back to canvas when takePhoto throws', async () => {
    const imageCapture = { takePhoto: vi.fn(async () => { throw new DOMException('NotSupportedError') }) }

    const result = await captureImage({
      ...BASE_DEPS,
      imageCapture,
      createImageBitmap: makeBitmapFactory(new Map()),
    })

    expect(result.sourceApi).toBe('CanvasSnapshot')
    expect(result.blob).toBe(canvasBlob)
  })

  it('canvas dimensions come from canvasSnapshot result', async () => {
    const snapshot = vi.fn(async () => ({ blob: makeBlob('cv'), width: 1280, height: 720 }))

    const result = await captureImage({ ...BASE_DEPS, videoWidth: 1280, videoHeight: 720, canvasSnapshot: snapshot })

    expect(result.width).toBe(1280)
    expect(result.height).toBe(720)
  })

  it('accepts marginally-larger-than-1.5x blob as ImageCapture (width axis)', async () => {
    const photoBlob = makeBlob('photo-wide')
    // 1920 * 1.5 = 2880 — just above threshold
    const dimensionMap = new Map([[photoBlob, { width: 2881, height: 1080 }]])
    const imageCapture = { takePhoto: vi.fn(async () => photoBlob) }

    const result = await captureImage({
      ...BASE_DEPS,
      imageCapture,
      createImageBitmap: makeBitmapFactory(dimensionMap),
    })

    expect(result.sourceApi).toBe('ImageCapture')
  })

  it('calls close() on the ImageBitmap after reading dimensions', async () => {
    const photoBlob = makeBlob('photo-hires2')
    const closeFn = vi.fn()
    const imageCapture = { takePhoto: vi.fn(async () => photoBlob) }
    const createImageBitmap = async (blob: Blob) => {
      if (blob === photoBlob) return { width: 4032, height: 3024, close: closeFn }
      return { width: 1920, height: 1080, close: vi.fn() }
    }

    await captureImage({ ...BASE_DEPS, imageCapture, createImageBitmap })

    expect(closeFn).toHaveBeenCalledOnce()
  })
})
