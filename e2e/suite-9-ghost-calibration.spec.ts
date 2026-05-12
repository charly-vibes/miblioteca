import { test, expect } from '@playwright/test'
import { mockCamera, mockCameraPermissionDenied } from './helpers/mock-camera'
import { mockGyro } from './helpers/mock-gyro'

// mockGyro must be called before page.goto() so addInitScript installs the mock at page load.

async function navigateToGhost(page: Parameters<typeof mockCamera>[0]) {
  await page.goto('/ghost.html')
  await expect(page.locator('[data-testid="center-dot"]')).toBeVisible({ timeout: 5000 })
}

async function completeOneCycle(page: Parameters<typeof mockCamera>[0]) {
  // force: true bypasses stability check — center-dot has a looping CSS pulse animation
  await page.locator('[data-testid="center-dot"]').click({ force: true })
  await expect(page.locator('[data-testid="stop-btn"]')).toBeVisible({ timeout: 3000 })
  await page.locator('[data-testid="stop-btn"]').click()
  await expect(page.locator('[data-testid="confirm-btn"]')).toBeVisible({ timeout: 3000 })
  await page.locator('[data-testid="confirm-btn"]').click()
  await expect(page.locator('[data-testid="summary-panel"]')).toBeVisible({ timeout: 3000 })
}

test.describe('Suite 9: Ghost calibration', () => {
  test('9.1 tap center dot starts recording phase', async ({ page }) => {
    await mockCamera(page)
    await mockGyro(page)
    await navigateToGhost(page)

    await page.locator('[data-testid="center-dot"]').click({ force: true })

    await expect(page.locator('[data-testid="recording-indicator"]')).toBeVisible({ timeout: 3000 })
    await expect(page.locator('[data-testid="stop-btn"]')).toBeVisible()
    await expect(page.locator('[data-testid="hint-text"]')).toContainText('RECORDING')
  })

  test('9.2 stop recording transitions to repositioning phase', async ({ page }) => {
    await mockCamera(page)
    await mockGyro(page)
    await navigateToGhost(page)

    await page.locator('[data-testid="center-dot"]').click({ force: true })
    await expect(page.locator('[data-testid="stop-btn"]')).toBeVisible({ timeout: 3000 })
    await page.locator('[data-testid="stop-btn"]').click()

    // recording-indicator uses display:flex inline style; hidden attr is set by hidden=true
    // In Chromium, inline display wins over UA hidden; check the DOM attribute directly
    await expect(page.locator('[data-testid="recording-indicator"]')).toHaveAttribute('hidden', '')
    await expect(page.locator('[data-testid="stop-btn"]')).toHaveAttribute('hidden', '')
    await expect(page.locator('[data-testid="ghost-overlay"]')).toBeHidden()
    await expect(page.locator('[data-testid="confirm-btn"]')).toBeVisible({ timeout: 3000 })
    await expect(page.locator('[data-testid="hint-text"]')).toContainText('DRAG')
  })

  test('9.3 drag rectangle and Confirm shows summary with Δx/Δy', async ({ page }) => {
    await mockCamera(page)
    await mockGyro(page)
    await navigateToGhost(page)

    await page.locator('[data-testid="center-dot"]').click({ force: true })
    await expect(page.locator('[data-testid="stop-btn"]')).toBeVisible({ timeout: 3000 })
    await page.locator('[data-testid="stop-btn"]').click()
    await expect(page.locator('[data-testid="confirm-btn"]')).toBeVisible({ timeout: 3000 })

    // Drag rectangle 80px right. Click at top-left quadrant to avoid center-dot
    // (center-dot is at rectangle center and triggers onCenterTap → onConfirm on click)
    const rect = page.locator('[data-testid="calibration-rectangle"]')
    const box = await rect.boundingBox()
    if (box) {
      const px = box.x + 50  // 50px from left edge, away from corner dot and center dot
      const py = box.y + 50
      await page.mouse.move(px, py)
      await page.mouse.down()
      await page.mouse.move(px + 80, py + 30)
      await page.mouse.up()
    }

    await page.locator('[data-testid="confirm-btn"]').click()

    await expect(page.locator('[data-testid="summary-panel"]')).toBeVisible({ timeout: 3000 })
    await expect(page.locator('[data-testid="summary-text"]')).toContainText('Cycle 1 complete')
    await expect(page.locator('[data-testid="summary-text"]')).toContainText('Δx')
    await expect(page.locator('[data-testid="export-btn"]')).toBeVisible()
    await expect(page.locator('[data-testid="export-btn"]')).toBeEnabled()
    await expect(page.locator('[data-testid="next-cycle-btn"]')).toBeVisible()
  })

  test('9.4 Next Cycle resets to idle and persists rectangle position', async ({ page }) => {
    await mockCamera(page)
    await mockGyro(page)
    await navigateToGhost(page)

    // First cycle: drag rectangle then confirm
    await page.locator('[data-testid="center-dot"]').click({ force: true })
    await expect(page.locator('[data-testid="stop-btn"]')).toBeVisible({ timeout: 3000 })
    await page.locator('[data-testid="stop-btn"]').click()
    await expect(page.locator('[data-testid="confirm-btn"]')).toBeVisible({ timeout: 3000 })

    const rect = page.locator('[data-testid="calibration-rectangle"]')
    const box = await rect.boundingBox()
    if (box) {
      const px = box.x + 50
      const py = box.y + 50
      await page.mouse.move(px, py)
      await page.mouse.down()
      await page.mouse.move(px + 60, py + 20)
      await page.mouse.up()
    }

    const draggedBox = await rect.boundingBox()
    await page.locator('[data-testid="confirm-btn"]').click()
    await expect(page.locator('[data-testid="next-cycle-btn"]')).toBeVisible({ timeout: 3000 })

    await page.locator('[data-testid="next-cycle-btn"]').click()

    await expect(page.locator('[data-testid="hint-text"]')).toContainText('TAP CENTER TO START')
    await expect(page.locator('[data-testid="summary-panel"]')).toBeHidden()
    await expect(page.locator('[data-testid="next-cycle-btn"]')).toBeHidden()

    // Rectangle should be at or near the GT position from first cycle
    if (draggedBox) {
      const newBox = await rect.boundingBox()
      expect(newBox?.x).toBeCloseTo(draggedBox.x, -1)
      expect(newBox?.y).toBeCloseTo(draggedBox.y, -1)
    }
  })

  test('9.5 Export JSON triggers download with correct payload shape', async ({ page }) => {
    await mockCamera(page)
    await mockGyro(page)
    await navigateToGhost(page)
    await completeOneCycle(page)

    const [download] = await Promise.all([
      page.waitForEvent('download'),
      page.locator('[data-testid="export-btn"]').click(),
    ])

    const stream = await download.createReadStream()
    const chunks: Buffer[] = []
    for await (const chunk of stream) chunks.push(Buffer.from(chunk))
    const json = JSON.parse(Buffer.concat(chunks).toString('utf-8'))

    expect(download.suggestedFilename()).toMatch(/^ghost-calibration-.+\.json$/)
    expect(typeof json.exportedAt).toBe('string')
    expect(() => new Date(json.exportedAt)).not.toThrow()
    expect(json.hFovDeg).toBe(40)
    expect(Array.isArray(json.cycles)).toBe(true)
    expect(json.cycles.length).toBeGreaterThanOrEqual(1)
    expect(Array.isArray(json.cycles[0].frames)).toBe(true)
    expect(typeof json.cycles[0].deltaPixels?.x).toBe('number')
  })

  test('9.6 camera denied shows warning banner', async ({ page }) => {
    await mockCameraPermissionDenied(page)
    await mockGyro(page)
    await navigateToGhost(page)

    await expect(page.locator('[data-testid="camera-warning"]')).toBeVisible({ timeout: 5000 })
  })
})
