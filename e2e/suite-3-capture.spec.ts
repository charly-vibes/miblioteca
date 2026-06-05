import { test, expect } from '@playwright/test'
import { mockCamera, mockCameraPermissionDenied } from './helpers/mock-camera'

async function navigateToCaptureScreen(page: Parameters<typeof mockCamera>[0]) {
  await page.goto('/#/new')
  await page.getByLabel('Scan name').fill('Test library')
  await page.getByRole('button', { name: 'Create scan' }).click()
  await expect(page.getByRole('button', { name: 'Continue to camera' })).toBeVisible()
  await page.getByRole('button', { name: 'Continue to camera' }).click()
  await expect(page).toHaveURL(/#\/session\//)
}

test.describe('Suite 3: Capture screen', () => {
  test('3.1 capture screen shows onboarding and Open camera button', async ({ page }) => {
    await mockCamera(page)
    await navigateToCaptureScreen(page)
    await expect(page.locator('.camera-onboarding')).toBeVisible()
    await expect(page.getByRole('button', { name: 'Open camera' })).toBeVisible()
  })

  test('3.2 clicking Open camera activates video and shows shutter button', async ({ page }) => {
    await mockCamera(page)
    await navigateToCaptureScreen(page)
    await page.getByRole('button', { name: 'Open camera' }).click()
    // Wait for video element to appear and stream to be attached
    const video = page.locator('.camera-video')
    await expect(video).toBeVisible({ timeout: 5000 })
    // Shutter button should appear
    await expect(page.locator('.shutter-btn')).toBeVisible()
  })

  test('3.3 camera permission denied shows error message', async ({ page }) => {
    await mockCameraPermissionDenied(page)
    await navigateToCaptureScreen(page)
    await page.getByRole('button', { name: 'Open camera' }).click()
    await expect(page.locator('.camera-status')).toContainText('Camera access is required', { timeout: 3000 })
  })

  test('3.4 taking a photo shows thumbnail in gallery', async ({ page }) => {
    await mockCamera(page)
    await navigateToCaptureScreen(page)
    await page.getByRole('button', { name: 'Open camera' }).click()
    // Wait for video to be ready
    await page.waitForFunction(() => {
      const v = document.querySelector('.camera-video') as HTMLVideoElement | null
      return v && v.videoWidth > 0
    }, undefined, { timeout: 8000 })
    await page.locator('.shutter-btn').click()
    // Gallery should appear with a thumbnail
    await expect(page.locator('.camera-gallery')).toBeVisible({ timeout: 5000 })
    await expect(page.locator('.camera-gallery-thumb')).toHaveCount(1, { timeout: 5000 })
  })

  test('3.5 taking multiple photos shows all thumbnails', async ({ page }) => {
    await mockCamera(page)
    await navigateToCaptureScreen(page)
    await page.getByRole('button', { name: 'Open camera' }).click()
    await page.waitForFunction(() => {
      const v = document.querySelector('.camera-video') as HTMLVideoElement | null
      return v && v.videoWidth > 0
    }, undefined, { timeout: 8000 })
    await page.locator('.shutter-btn').click()
    await expect(page.locator('.camera-gallery-thumb')).toHaveCount(1, { timeout: 5000 })
    await page.locator('.shutter-btn').click()
    await expect(page.locator('.camera-gallery-thumb')).toHaveCount(2, { timeout: 5000 })
  })

  test('3.6 back button navigates to sessions list', async ({ page }) => {
    await mockCamera(page)
    await navigateToCaptureScreen(page)
    await page.locator('.camera-back-btn').click()
    await expect(page).toHaveURL(/\/$|#\/$|#\/[^s]/)
    await expect(page.locator('.sessions-list')).toBeVisible()
  })
})
