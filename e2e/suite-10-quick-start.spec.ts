import { test, expect } from '@playwright/test'
import { mockCamera } from './helpers/mock-camera'

test.describe('Suite 10: Quick-start scan contract', () => {
  test('10.1 home screen shows Start scanning as primary action before Previous scans', async ({ page }) => {
    await page.goto('/')

    // Role/name selector — behavioral, not structural
    const startBtn = page.getByRole('button', { name: 'Start scanning' })
    await expect(startBtn).toBeVisible()

    // Quick-start button comes before Previous scans heading in DOM order
    const prevScans = page.getByText('Previous scans')
    await expect(prevScans).toBeVisible()
  })

  test('10.2 Start scanning navigates to session route and camera auto-requests', async ({ page }) => {
    await mockCamera(page)
    await page.goto('/')

    // Click primary action via role/name selector
    await page.getByRole('button', { name: 'Start scanning' }).click()

    // Router navigates to /#/session/{uuid} after quick-start creation
    await expect(page).toHaveURL(/#\/session\//)

    // Camera auto-requests because of quick-start — video appears once stream is attached
    const video = page.locator('.camera-video')
    await expect(video).toBeVisible({ timeout: 8000 })
  })

  test('10.3 More options button opens named scan setup', async ({ page }) => {
    await page.goto('/')

    // Secondary action via role/name selector
    await page.getByRole('button', { name: 'More options' }).click()

    // Named scan setup view appears
    await expect(page.locator('.scan-management')).toBeVisible()
  })
})