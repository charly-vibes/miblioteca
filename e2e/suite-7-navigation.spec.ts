import { test, expect } from '@playwright/test'

test.describe('Suite 7: Navigation and routing', () => {
  test('7.1 direct load to /#/new renders the scan management view', async ({ page }) => {
    await page.goto('/#/new')
    await expect(page.locator('.scan-management')).toBeVisible()
    await expect(page.getByRole('button', { name: 'Create scan' })).toBeVisible()
  })

  test('7.2 direct load to /#/session/nonexistent falls back to home', async ({ page }) => {
    await page.goto('/#/session/does-not-exist')
    // App detects missing session and navigates home — sessions list should appear
    await expect(page.locator('.sessions-list')).toBeVisible({ timeout: 5000 })
  })

  test('7.3 browser back after navigating forward shows correct view', async ({ page }) => {
    await page.goto('/')
    await page.locator('.sessions-new-btn').click()
    await expect(page.locator('.scan-management')).toBeVisible()
    await page.goBack()
    await expect(page.locator('.sessions-list')).toBeVisible({ timeout: 3000 })
  })

  test('7.4 back button on scan management returns to sessions list', async ({ page }) => {
    await page.goto('/#/new')
    await expect(page.locator('.scan-management')).toBeVisible()
    await page.locator('.scan-back-btn').click()
    await expect(page.locator('.sessions-list')).toBeVisible({ timeout: 3000 })
  })
})
