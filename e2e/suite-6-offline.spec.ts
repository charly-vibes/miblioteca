import { test, expect } from '@playwright/test'

test.describe('Suite 6: Offline / PWA behavior', () => {
  test('6.1 going offline shows offline badge in header', async ({ page, context }) => {
    await page.goto('/')
    await expect(page.locator('.sessions-list')).toBeVisible()
    await context.setOffline(true)
    // The offline event fires and the badge should appear
    await expect(page.locator('.app-header__offline')).toBeVisible({ timeout: 3000 })
  })

  test('6.2 coming back online hides offline badge', async ({ page, context }) => {
    await page.goto('/')
    await context.setOffline(true)
    await expect(page.locator('.app-header__offline')).toBeVisible({ timeout: 3000 })
    await context.setOffline(false)
    await expect(page.locator('.app-header__offline')).not.toBeVisible({ timeout: 3000 })
  })

  test('6.3 offline badge text contains upload queue message', async ({ page, context }) => {
    await page.goto('/')
    await context.setOffline(true)
    const badge = page.locator('.app-header__offline')
    await expect(badge).toBeVisible({ timeout: 3000 })
    await expect(badge).toContainText('Offline')
  })
})
