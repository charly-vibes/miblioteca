export type CaptureImageResult = {
  blob: Blob
  width: number
  height: number
  sourceApi: 'ImageCapture' | 'CanvasSnapshot'
}

export type CaptureImageDeps = {
  imageCapture?: { takePhoto(): Promise<Blob> }
  videoWidth: number
  videoHeight: number
  canvasSnapshot: () => Promise<{ blob: Blob; width: number; height: number }>
  createImageBitmap?: (blob: Blob) => Promise<{ width: number; height: number; close(): void }>
  /** Called with the caught error whenever the ImageCapture path degrades to canvas. */
  onDegradation?: (reason: unknown) => void
}

export async function captureImage(deps: CaptureImageDeps): Promise<CaptureImageResult> {
  if (deps.imageCapture) {
    try {
      const blob = await deps.imageCapture.takePhoto()
      const createBitmap = deps.createImageBitmap ?? globalThis.createImageBitmap?.bind(globalThis)
      if (!createBitmap) throw new TypeError('createImageBitmap unavailable')
      const bmp = await createBitmap(blob)
      const { width, height } = bmp
      bmp.close()
      // Chromium re-encodes a video frame when takePhoto is bound to a live preview stream,
      // returning the same resolution as the video track. Only keep the ImageCapture result
      // if at least one dimension is meaningfully larger (1.5×) — the re-encode case fails
      // both axes, and a single axis exceeding the threshold confirms native higher resolution.
      // Guard against inactive track (videoWidth/Height = 0) which makes the threshold trivially true.
      if (
        deps.videoWidth > 0 && deps.videoHeight > 0 &&
        (width > deps.videoWidth * 1.5 || height > deps.videoHeight * 1.5)
      ) {
        return { blob, width, height, sourceApi: 'ImageCapture' }
      }
    } catch (err) {
      // ImageCapture path failed — degrade to canvas
      deps.onDegradation?.(err)
    }
  }

  // canvasSnapshot failures propagate uncaught — there is no further fallback.
  const { blob, width, height } = await deps.canvasSnapshot()
  return { blob, width, height, sourceApi: 'CanvasSnapshot' }
}
