import { describe, it, expect } from 'vitest'
import { laplacianVariance, makeThumbnail } from './imageProcessing'

// jsdom lacks ImageData constructor without the 'canvas' package; create a compatible POJO
function makeImageData(width: number, height: number, fillRgba: [number, number, number, number]): ImageData {
  const data = new Uint8ClampedArray(width * height * 4)
  for (let i = 0; i < data.length; i += 4) {
    data[i] = fillRgba[0]
    data[i + 1] = fillRgba[1]
    data[i + 2] = fillRgba[2]
    data[i + 3] = fillRgba[3]
  }
  return { data, width, height, colorSpace: 'srgb' } as ImageData
}

describe('laplacianVariance', () => {
  it('returns 0 for a uniform image (no edges)', () => {
    const img = makeImageData(10, 10, [128, 128, 128, 255])
    expect(laplacianVariance(img)).toBe(0)
  })

  it('returns 0 for images smaller than 3x3', () => {
    expect(laplacianVariance(makeImageData(2, 2, [255, 0, 0, 255]))).toBe(0)
    expect(laplacianVariance(makeImageData(1, 1, [255, 0, 0, 255]))).toBe(0)
  })

  it('returns a positive value for an image with sharp edges', () => {
    // Checkerboard: alternating black and white pixels
    const size = 10
    const data = new Uint8ClampedArray(size * size * 4)
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const v = (x + y) % 2 === 0 ? 255 : 0
        const i = (y * size + x) * 4
        data[i] = v
        data[i + 1] = v
        data[i + 2] = v
        data[i + 3] = 255
      }
    }
    const img = { data, width: size, height: size, colorSpace: 'srgb' } as ImageData
    expect(laplacianVariance(img)).toBeGreaterThan(0)
  })

  it('returns a higher value for a sharper image', () => {
    const sharp = (() => {
      const size = 10
      const data = new Uint8ClampedArray(size * size * 4)
      for (let y = 0; y < size; y++) {
        for (let x = 0; x < size; x++) {
          const v = (x + y) % 2 === 0 ? 255 : 0
          const i = (y * size + x) * 4
          data[i] = data[i + 1] = data[i + 2] = v
          data[i + 3] = 255
        }
      }
      return { data, width: size, height: size, colorSpace: 'srgb' } as ImageData
    })()

    const blurry = makeImageData(10, 10, [200, 200, 200, 255])

    expect(laplacianVariance(sharp)).toBeGreaterThan(laplacianVariance(blurry))
  })
})

describe('makeThumbnail', () => {
  function makeMockDeps(imgW: number, imgH: number) {
    const resultBlob = new Blob(['thumb'], { type: 'image/jpeg' })
    let drawnAt: { dw: number; dh: number } = { dw: 0, dh: 0 }

    const mockCtx = {
      drawImage(_src: unknown, _dx: number, _dy: number, dw: number, dh: number) {
        drawnAt = { dw, dh }
      },
    }
    const mockCanvas = {
      getContext: (_type: '2d') => mockCtx,
      convertToBlob: async (_opts?: unknown) => resultBlob,
    }

    const deps = {
      createImageBitmap: async (_blob: Blob) => ({
        width: imgW,
        height: imgH,
        close: () => {},
      }),
      createOffscreenCanvas: (_w: number, _h: number) => mockCanvas,
    }

    return { deps, getDrawnDimensions: () => drawnAt, resultBlob }
  }

  it('returns the blob from convertToBlob', async () => {
    const { deps, resultBlob } = makeMockDeps(1280, 720)
    const out = await makeThumbnail(new Blob(['img']), 640, deps)
    expect(out).toBe(resultBlob)
  })

  it('scales down an image that exceeds maxEdgePx', async () => {
    const { deps, getDrawnDimensions } = makeMockDeps(1280, 720)
    await makeThumbnail(new Blob(['img']), 640, deps)
    const { dw, dh } = getDrawnDimensions()
    expect(dw).toBe(640)
    expect(dh).toBe(360)
  })

  it('does not scale up an image smaller than maxEdgePx', async () => {
    const { deps, getDrawnDimensions } = makeMockDeps(320, 240)
    await makeThumbnail(new Blob(['img']), 640, deps)
    const { dw, dh } = getDrawnDimensions()
    expect(dw).toBe(320)
    expect(dh).toBe(240)
  })

  it('uses the long edge when height > width', async () => {
    const { deps, getDrawnDimensions } = makeMockDeps(480, 1280)
    await makeThumbnail(new Blob(['img']), 640, deps)
    const { dw, dh } = getDrawnDimensions()
    expect(dh).toBe(640)
    expect(dw).toBe(240)
  })

  it('throws if the canvas context is unavailable', async () => {
    const { deps } = makeMockDeps(100, 100)
    const brokenDeps = {
      ...deps,
      createOffscreenCanvas: (_w: number, _h: number) => ({
        getContext: (_type: '2d') => null as unknown as ReturnType<typeof deps.createOffscreenCanvas>['getContext'],
        convertToBlob: async () => new Blob(),
      }),
    }
    await expect(makeThumbnail(new Blob(['img']), 640, brokenDeps)).rejects.toThrow(
      'could not get 2d context'
    )
  })
})
