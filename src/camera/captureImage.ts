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
}

export async function captureImage(deps: CaptureImageDeps): Promise<CaptureImageResult> {
  if (deps.imageCapture) {
    try {
      const blob = await deps.imageCapture.takePhoto()
      const bitmapFactory = deps.createImageBitmap ?? globalThis.createImageBitmap.bind(globalThis)
      const bmp = await bitmapFactory(blob)
      const { width, height } = bmp
      bmp.close()
      // Chromium re-encodes a video frame when takePhoto is bound to a live preview stream,
      // returning the same resolution as the video track. Only keep the ImageCapture result
      // if it is meaningfully larger (1.5×) than the live video resolution.
      if (width > deps.videoWidth * 1.5 || height > deps.videoHeight * 1.5) {
        return { blob, width, height, sourceApi: 'ImageCapture' }
      }
    } catch {
      // takePhoto() not supported on this device/browser — degrade to canvas
    }
  }

  const { blob, width, height } = await deps.canvasSnapshot()
  return { blob, width, height, sourceApi: 'CanvasSnapshot' }
}
