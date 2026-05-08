import { test, expect } from '@playwright/test'
import { mockCamera } from './helpers/mock-camera'

async function navigateToCaptureScreen(page: Parameters<typeof mockCamera>[0]) {
  await page.goto('/#/new')
  await page.getByLabel('Scan name').fill('Bundle test')
  await page.getByRole('button', { name: 'Create scan' }).click()
  await page.getByRole('button', { name: 'Continue to camera' }).click()
  await expect(page).toHaveURL(/#\/session\//)
}

test.describe('Suite 5: Bundle export panel', () => {
  test('5.1 Export bundle button is visible on the capture screen', async ({ page }) => {
    await mockCamera(page)
    await navigateToCaptureScreen(page)
    await expect(page.locator('.bundle-export-panel')).toBeVisible({ timeout: 5000 })
    await expect(page.getByRole('button', { name: 'Export bundle' })).toBeVisible()
  })

  test('5.2 Export bundle with no captures completes to Exported state', async ({ page }) => {
    await mockCamera(page)
    await navigateToCaptureScreen(page)
    await expect(page.getByRole('button', { name: 'Export bundle' })).toBeVisible({ timeout: 5000 })
    await page.getByRole('button', { name: 'Export bundle' }).click()
    // Bundle assembles even with 0 captures — lands in 'exported' state
    await expect(page.locator('.bundle-export-status')).toContainText('Exported', { timeout: 10000 })
  })

  test('5.3 Export bundle with captures proceeds through export state', async ({ page }) => {
    await mockCamera(page)
    await navigateToCaptureScreen(page)
    // Take a photo first
    await page.getByRole('button', { name: 'Open camera' }).click()
    await page.waitForFunction(() => {
      const v = document.querySelector('.camera-video') as HTMLVideoElement | null
      return v && v.videoWidth > 0
    }, undefined, { timeout: 8000 })
    await page.locator('.shutter-btn').click()
    await expect(page.locator('.camera-gallery-thumb')).toHaveCount(1, { timeout: 5000 })
    // Now export
    await expect(page.getByRole('button', { name: 'Export bundle' })).toBeVisible({ timeout: 5000 })
    await page.getByRole('button', { name: 'Export bundle' }).click()
    // Should show either exporting state or the Share/Download button
    await expect(
      page.getByRole('button', { name: /Share|Download/ })
    ).toBeVisible({ timeout: 10000 })
  })

  test('5.4 exported state shows Share or Download button and status', async ({ page }) => {
    await mockCamera(page)
    await navigateToCaptureScreen(page)
    await page.getByRole('button', { name: 'Open camera' }).click()
    await page.waitForFunction(() => {
      const v = document.querySelector('.camera-video') as HTMLVideoElement | null
      return v && v.videoWidth > 0
    }, undefined, { timeout: 8000 })
    await page.locator('.shutter-btn').click()
    await expect(page.locator('.camera-gallery-thumb')).toHaveCount(1, { timeout: 5000 })
    await expect(page.getByRole('button', { name: 'Export bundle' })).toBeVisible({ timeout: 5000 })
    await page.getByRole('button', { name: 'Export bundle' }).click()
    await expect(page.locator('.bundle-export-status')).toContainText('Exported', { timeout: 10000 })
    await expect(page.getByRole('button', { name: /Share|Download/ })).toBeVisible()
    // Export button is hidden in the exported state
    await expect(page.getByRole('button', { name: 'Export bundle' })).not.toBeVisible()
  })
})
