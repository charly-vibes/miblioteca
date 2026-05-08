import type { Page } from '@playwright/test'

export async function mockCamera(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const canvas = document.createElement('canvas')
    canvas.width = 640
    canvas.height = 480
    const ctx = canvas.getContext('2d')!
    ctx.fillStyle = '#336699'
    ctx.fillRect(0, 0, 640, 480)
    // Animate so the video element gets videoWidth/videoHeight populated
    setInterval(() => {
      ctx.fillStyle = `hsl(${Date.now() % 360}, 50%, 40%)`
      ctx.fillRect(0, 0, 640, 480)
    }, 100)
    const stream = canvas.captureStream(10)
    navigator.mediaDevices.getUserMedia = async () => stream
  })
}

export async function mockCameraPermissionDenied(page: Page): Promise<void> {
  await page.addInitScript(() => {
    navigator.mediaDevices.getUserMedia = async () => {
      const err = new DOMException('Permission denied', 'NotAllowedError')
      throw err
    }
  })
}
