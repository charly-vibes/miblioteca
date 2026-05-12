import { test, expect } from '@playwright/test'
import { mockCamera } from './helpers/mock-camera'

async function navigateToCaptureScreen(page: Parameters<typeof mockCamera>[0]) {
  await page.goto('/#/new')
  await page.getByLabel('Scan name').fill('Test library')
  await page.getByRole('button', { name: 'Create scan' }).click()
  await expect(page.getByRole('button', { name: 'Continue to camera' })).toBeVisible()
  await page.getByRole('button', { name: 'Continue to camera' }).click()
  await expect(page).toHaveURL(/#\/session\//)
}

// Inject a synthetic ImageData via window.__miblioteca_test_quality_frame.
// App.ts reads this hook and passes it to CaptureView as getQualityFrame.
async function injectQualityFrame(
  page: Parameters<typeof mockCamera>[0],
  kind: 'blurry' | 'overexposed' | 'underexposed',
) {
  await page.addInitScript((frameKind) => {
    const W = 64, H = 64
    const buf = new Uint8ClampedArray(W * H * 4)

    if (frameKind === 'blurry') {
      // Uniform gray — all pixels identical, Laplacian variance = 0 (< threshold 80)
      buf.fill(128)
    } else if (frameKind === 'overexposed') {
      // All-white — 100% of pixels above luma threshold (> 5%)
      buf.fill(255)
    } else {
      // All-black — 100% of pixels below luma threshold (> 5%)
      buf.fill(0)
      // Set alpha channel to 255 (required for valid ImageData)
      for (let i = 3; i < buf.length; i += 4) buf[i] = 255
    }

    const frame = new ImageData(buf, W, H)
    ;(window as unknown as { __miblioteca_test_quality_frame: () => ImageData }).__miblioteca_test_quality_frame = () => frame
  }, kind)
}

test.describe('Suite 4: Quality warning overlays', () => {
  test('4.1 blur badge appears when frame has near-zero Laplacian variance', async ({ page }) => {
    await injectQualityFrame(page, 'blurry')
    await mockCamera(page)
    await navigateToCaptureScreen(page)
    await page.getByRole('button', { name: 'Open camera' }).click()
    await expect(page.locator('[data-warning="blurry"]')).toBeVisible({ timeout: 3000 })
  })

  test('4.2 overexposed badge appears when >5% pixels are blown-out white', async ({ page }) => {
    await injectQualityFrame(page, 'overexposed')
    await mockCamera(page)
    await navigateToCaptureScreen(page)
    await page.getByRole('button', { name: 'Open camera' }).click()
    await expect(page.locator('[data-warning="overexposed"]')).toBeVisible({ timeout: 3000 })
  })

  test('4.3 underexposed badge appears when >5% pixels are near-black', async ({ page }) => {
    await injectQualityFrame(page, 'underexposed')
    await mockCamera(page)
    await navigateToCaptureScreen(page)
    await page.getByRole('button', { name: 'Open camera' }).click()
    await expect(page.locator('[data-warning="underexposed"]')).toBeVisible({ timeout: 3000 })
  })
})
