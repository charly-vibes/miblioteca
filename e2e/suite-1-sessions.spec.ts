import { test, expect } from '@playwright/test'

test.describe('Suite 1: Sessions list', () => {
  test('1.1 empty state shown when no sessions exist', async ({ page }) => {
    await page.goto('/')
    await expect(page.locator('.sessions-empty')).toBeVisible()
    await expect(page.locator('.sessions-empty')).toContainText('No sessions yet')
  })

  test('1.2 New scan button is present', async ({ page }) => {
    await page.goto('/')
    await expect(page.locator('.sessions-new-btn')).toBeVisible()
  })

  test('1.3 clicking Start scanning triggers quick scan and navigates to session', async ({ page }) => {
    await page.goto('/')
    await page.locator('.sessions-new-btn').click()
    await expect(page).toHaveURL(/#\/session\//, { timeout: 10000 })
  })

  test('1.4 session row appears after creating a scan and returning home', async ({ page }) => {
    await page.goto('/#/new')
    await page.getByLabel('Scan name').fill('Main library')
    await page.getByRole('button', { name: 'Create scan' }).click()
    // Wait for create flow to complete before navigating away
    await expect(page.getByRole('button', { name: 'Continue to camera' })).toBeVisible()
    await page.goto('/')
    // Exactly one row should exist — guards against pre-existing rows from parallel tests
    await expect(page.locator('.session-row')).toHaveCount(1)
    await expect(page.locator('.session-row')).toBeVisible()
  })

  test('1.5 clicking a session row opens the capture view for that session', async ({ page }) => {
    await page.goto('/#/new')
    await page.getByLabel('Scan name').fill('Click target')
    await page.getByRole('button', { name: 'Create scan' }).click()
    await expect(page.getByRole('button', { name: 'Continue to camera' })).toBeVisible()

    // Navigate to session to capture its id from the URL
    await page.getByRole('button', { name: 'Continue to camera' }).click()
    await expect(page).toHaveURL(/#\/session\//)
    const sessionId = page.url().match(/#\/session\/(.+)$/)?.[1] ?? ''

    await page.goto('/')
    await expect(page.locator('.session-row')).toHaveCount(1)

    await page.locator('.session-row').click()
    await expect(page).toHaveURL(new RegExp(`#/session/${sessionId}`))

    // Capture view must render — camera-onboarding is present before camera is opened
    await expect(page.locator('.camera-onboarding')).toBeVisible({ timeout: 5000 })
  })
})
