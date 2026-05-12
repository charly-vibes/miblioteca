/**
 * Blur score: variance of the 3×3 Laplacian response on the luma channel.
 * Higher = sharper. Near-zero = blurry.
 */
export function laplacianVariance(imageData: ImageData): number {
  const { data, width, height } = imageData
  if (width < 3 || height < 3) return 0

  // Welford's online algorithm — accumulates variance without allocating responses[].
  let n = 0
  let mean = 0
  let m2 = 0

  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      const luma = (px: number, py: number) => {
        const i = (py * width + px) * 4
        return 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2]
      }
      const lap =
        luma(x, y - 1) +
        luma(x - 1, y) - 4 * luma(x, y) +
        luma(x + 1, y) +
        luma(x, y + 1)
      n++
      const delta = lap - mean
      mean += delta / n
      m2 += delta * (lap - mean)
    }
  }

  return n === 0 ? 0 : m2 / n
}

export function downscaleImageData(src: ImageData, dstW: number, dstH: number): ImageData {
  if (src.width <= dstW && src.height <= dstH) return src
  const { data: s, width: sw, height: sh } = src
  const out = new Uint8ClampedArray(dstW * dstH * 4)
  const xRatio = sw / dstW
  const yRatio = sh / dstH
  for (let dy = 0; dy < dstH; dy++) {
    const sy = Math.floor(dy * yRatio)
    for (let dx = 0; dx < dstW; dx++) {
      const sx = Math.floor(dx * xRatio)
      const si = (sy * sw + sx) * 4
      const di = (dy * dstW + dx) * 4
      out[di] = s[si]
      out[di + 1] = s[si + 1]
      out[di + 2] = s[si + 2]
      out[di + 3] = s[si + 3]
    }
  }
  return { data: out, width: dstW, height: dstH, colorSpace: src.colorSpace } as ImageData
}

export type MakeThumbnailDeps = {
  createImageBitmap?: (blob: Blob) => Promise<{ width: number; height: number; close(): void }>
  createOffscreenCanvas?: (w: number, h: number) => {
    getContext(type: '2d'): { drawImage(src: unknown, dx: number, dy: number, dw: number, dh: number): void } | null
    convertToBlob(options?: { type?: string; quality?: number }): Promise<Blob>
  }
}

export async function makeThumbnail(
  blob: Blob,
  maxEdgePx = 640,
  deps: MakeThumbnailDeps = {}
): Promise<Blob> {
  const createBitmap = deps.createImageBitmap ?? globalThis.createImageBitmap.bind(globalThis)
  const makeCanvas =
    deps.createOffscreenCanvas ??
    ((w: number, h: number) => new OffscreenCanvas(w, h) as unknown as ReturnType<NonNullable<MakeThumbnailDeps['createOffscreenCanvas']>>)

  const img = await createBitmap(blob)
  const scale = Math.min(maxEdgePx / img.width, maxEdgePx / img.height, 1)
  const w = Math.max(1, Math.round(img.width * scale))
  const h = Math.max(1, Math.round(img.height * scale))

  const canvas = makeCanvas(w, h)
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('makeThumbnail: could not get 2d context')
  ctx.drawImage(img, 0, 0, w, h)
  img.close()

  return canvas.convertToBlob({ type: 'image/jpeg', quality: 0.85 })
}
