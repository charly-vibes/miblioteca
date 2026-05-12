import { test, expect } from '@playwright/test'
import { mockCamera } from './helpers/mock-camera'
import { mockGyro, triggerGyroReading, triggerGyroReadingAxes } from './helpers/mock-gyro'

// Important: mockGyro must be called before page.goto() so addInitScript runs at page load.
// The app checks typeof window.Gyroscope === 'function' at boot to decide whether to
// create a Gyroscope instance. Registering the mock mid-test would miss this check.

async function navigateToCaptureWithCamera(page: Parameters<typeof mockCamera>[0]) {
  await page.goto('/#/new')
  await page.getByLabel('Scan name').fill('Gyro test')
  await page.getByRole('button', { name: 'Create scan' }).click()
  await page.getByRole('button', { name: 'Continue to camera' }).click()
  await expect(page).toHaveURL(/#\/session\//)
  await page.getByRole('button', { name: 'Open camera' }).click()
  await page.waitForFunction(() => {
    const v = document.querySelector('.camera-video') as HTMLVideoElement | null
    return v && v.videoWidth > 0
  }, undefined, { timeout: 8000 })
}

test.describe('Suite 8: Ghost overlay', () => {
  test('8.1 ghost overlay canvas is present and initially hidden', async ({ page }) => {
    await mockCamera(page)
    await mockGyro(page)
    await navigateToCaptureWithCamera(page)
    const canvas = page.locator('.ghost-overlay')
    await expect(canvas).toBeAttached()
    await expect(canvas).toBeHidden()
  })

  test('8.2 overlay becomes visible after first capture', async ({ page }) => {
    await mockCamera(page)
    await mockGyro(page)
    await navigateToCaptureWithCamera(page)
    // Take a photo to set the snapshot
    await page.locator('.shutter-btn').click()
    await expect(page.locator('.camera-gallery-thumb')).toHaveCount(1, { timeout: 5000 })
    // Keep gyro below motion gate so overlay stays visible
    await triggerGyroReading(page, 0.1)
    const canvas = page.locator('.ghost-overlay')
    await expect(canvas).toBeVisible({ timeout: 2000 })
  })

  test('8.3 high gyro rate (motion gate) hides the overlay', async ({ page }) => {
    await mockCamera(page)
    await mockGyro(page)
    await navigateToCaptureWithCamera(page)
    await page.locator('.shutter-btn').click()
    await expect(page.locator('.camera-gallery-thumb')).toHaveCount(1, { timeout: 5000 })
    // First make it visible with low rate
    await triggerGyroReading(page, 0.1)
    await expect(page.locator('.ghost-overlay')).toBeVisible({ timeout: 2000 })
    // Now trigger high rotation (> 0.5 rad/s threshold)
    await triggerGyroReading(page, 2.0)
    await expect(page.locator('.ghost-overlay')).toBeHidden({ timeout: 2000 })
  })

  test('8.4 low gyro rate (below motion gate) keeps overlay visible', async ({ page }) => {
    await mockCamera(page)
    await mockGyro(page)
    await navigateToCaptureWithCamera(page)
    await page.locator('.shutter-btn').click()
    await expect(page.locator('.camera-gallery-thumb')).toHaveCount(1, { timeout: 5000 })
    await triggerGyroReading(page, 0.1)
    await expect(page.locator('.ghost-overlay')).toBeVisible({ timeout: 2000 })
  })

  test('8.5 yaw accumulation pans overlay — direction and magnitude validated', async ({ page }) => {
    await mockCamera(page)
    await mockGyro(page)
    await navigateToCaptureWithCamera(page)
    await page.locator('.shutter-btn').click()
    await expect(page.locator('.camera-gallery-thumb')).toHaveCount(1, { timeout: 5000 })
    // Inject readings with positive gy rate: yawOmega = gy > 0
    // → yawIntegral decreases (yawIntegral -= yawOmega * dt < 0)
    // → shiftPx = -focalLength × negative = positive → translateX > 0
    for (let i = 0; i < 10; i++) {
      await triggerGyroReading(page, 0.3)
    }
    const { transform, canvasWidth } = await page.locator('.ghost-overlay').evaluate((el) => ({
      transform: (el as HTMLElement).style.transform,
      canvasWidth: (el as HTMLCanvasElement).width || el.clientWidth || 375,
    }))
    expect(transform).toMatch(/translate3d\(-?\d+(\.\d+)?px, 0px?, 0px?\)/)
    const match = /translate3d\((-?\d+(?:\.\d+)?)px/.exec(transform)
    expect(match).not.toBeNull()
    const translateX = parseFloat(match![1])
    // Direction: positive gy → translateX > 0 (ghost pans right as device sweeps left)
    expect(translateX).toBeGreaterThan(0)
    // Magnitude: non-trivial shift, but clamped to viewport half-width
    expect(translateX).toBeLessThanOrEqual(canvasWidth / 2 + 1)
  })

  test('8.6 pitch accumulation pans overlay vertically — non-zero translateY', async ({ page }) => {
    await mockCamera(page)
    await mockGyro(page)
    await navigateToCaptureWithCamera(page)
    await page.locator('.shutter-btn').click()
    await expect(page.locator('.camera-gallery-thumb')).toHaveCount(1, { timeout: 5000 })
    // Portrait pitch axis is gx (x-axis). Inject multiple readings with gx > 0.
    for (let i = 0; i < 10; i++) {
      await triggerGyroReadingAxes(page, { x: 0.3, y: 0.05, z: 0.05 })
    }
    const transform = await page.locator('.ghost-overlay').evaluate(
      (el) => (el as HTMLElement).style.transform
    )
    const match = /translate3d\((-?\d+(?:\.\d+)?)px,\s*(-?\d+(?:\.\d+)?)px/.exec(transform)
    expect(match).not.toBeNull()
    const translateY = parseFloat(match![2])
    // pitch accumulation should produce a non-zero vertical shift
    expect(Math.abs(translateY)).toBeGreaterThan(0)
  })

  test('8.7 yaw resets to zero after a second capture', async ({ page }) => {
    await mockCamera(page)
    await mockGyro(page)
    await navigateToCaptureWithCamera(page)
    await page.locator('.shutter-btn').click()
    await expect(page.locator('.camera-gallery-thumb')).toHaveCount(1, { timeout: 5000 })
    // Accumulate yaw
    for (let i = 0; i < 10; i++) {
      await triggerGyroReading(page, 0.3)
    }
    // Take second photo — setSnapshot resets yaw
    await page.locator('.shutter-btn').click()
    await expect(page.locator('.camera-gallery-thumb')).toHaveCount(2, { timeout: 5000 })
    // Wait one frame for RAF to apply the reset
    await page.evaluate(() => new Promise<void>((resolve) => requestAnimationFrame(() => resolve())))
    const transform = await page.locator('.ghost-overlay').evaluate(
      (el) => (el as HTMLElement).style.transform
    )
    // Browser normalizes translate3d(0,0,0) to translate3d(0px,0px,0px)
    expect(transform.replace(/0px/g, '0')).toBe('translate3d(0, 0, 0)')
  })

  test('8.8 overlay translateX is clamped at large yaw accumulation', async ({ page }) => {
    await mockCamera(page)
    await mockGyro(page)
    await navigateToCaptureWithCamera(page)
    await page.locator('.shutter-btn').click()
    await expect(page.locator('.camera-gallery-thumb')).toHaveCount(1, { timeout: 5000 })
    // Inject many readings to overflow the clamp
    for (let i = 0; i < 200; i++) {
      await triggerGyroReading(page, 0.3)
    }
    const canvasWidth = await page.locator('.ghost-overlay').evaluate((el) => (el as HTMLCanvasElement).width)
    const transform = await page.locator('.ghost-overlay').evaluate(
      (el) => (el as HTMLElement).style.transform
    )
    const match = /translate3d\((-?\d+(?:\.\d+)?)px/.exec(transform)
    if (match && canvasWidth > 0) {
      const shift = parseFloat(match[1])
      expect(Math.abs(shift)).toBeLessThanOrEqual(canvasWidth / 2 + 1)
    }
  })

  test('8.9 ghost overlay canvas hidden permanently when gyro unavailable', async ({ page }) => {
    // Explicitly delete Gyroscope (Chromium ships it natively; remove it so the app
    // sees hasGyroscope=false, which is the "no sensor" branch we want to test).
    await page.addInitScript(() => {
      delete (window as Record<string, unknown>)['Gyroscope']
    })
    await mockCamera(page)
    await navigateToCaptureWithCamera(page)
    // Without a gyro, GhostOverlayCanvas is never constructed, so no canvas in DOM
    await expect(page.locator('.ghost-overlay')).not.toBeAttached()
  })

  test('8.10 sensor permission denied: ghost overlay absent but shutter and gallery still work', async ({ page }) => {
    // Simulate motion sensor permission denied by making Gyroscope constructor throw
    await page.addInitScript(() => {
      ;(window as Record<string, unknown>)['Gyroscope'] = class {
        constructor() { throw new DOMException('Permission denied', 'NotAllowedError') }
      }
    })
    await mockCamera(page)
    await navigateToCaptureWithCamera(page)

    // Ghost overlay canvas must be absent (no sensor = no canvas constructed)
    await expect(page.locator('.ghost-overlay')).not.toBeAttached()

    // Core capture flow must still function
    await page.locator('.shutter-btn').click()
    await expect(page.locator('.camera-gallery-thumb')).toHaveCount(1, { timeout: 5000 })
  })
})
