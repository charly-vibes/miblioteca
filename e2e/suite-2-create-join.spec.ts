import { test, expect } from '@playwright/test'

test.describe('Suite 2: Create / Join scan', () => {
  test('2.1 create scan with name shows Continue to camera button', async ({ page }) => {
    await page.goto('/#/new')
    await page.getByLabel('Scan name').fill('West wall')
    await page.getByRole('button', { name: 'Create scan' }).click()
    await expect(page.getByRole('button', { name: 'Continue to camera' })).toBeVisible()
  })

  test('2.2 create scan shows success confirmation', async ({ page }) => {
    await page.goto('/#/new')
    await page.getByLabel('Scan name').fill('East wing')
    await page.getByRole('button', { name: 'Create scan' }).click()
    await expect(page.locator('.scan-form-success')).toContainText('Scan created')
  })

  test('2.3 Continue to camera navigates to session view', async ({ page }) => {
    await page.goto('/#/new')
    await page.getByLabel('Scan name').fill('Archive room')
    await page.getByRole('button', { name: 'Create scan' }).click()
    await page.getByRole('button', { name: 'Continue to camera' }).click()
    await expect(page).toHaveURL(/#\/session\//)
  })

  test('2.4 create scan with empty name does not proceed (browser required validation)', async ({ page }) => {
    await page.goto('/#/new')
    await page.getByRole('button', { name: 'Create scan' }).click()
    // The input is required — browser blocks submission, JS never fires, so no "Continue" button
    await expect(page.getByRole('button', { name: 'Continue to camera' })).not.toBeVisible()
    // Stays on /#/new
    await expect(page).toHaveURL(/#\/new/)
    // The input reports invalid via browser constraint API
    const valid = await page.locator('input[name="scanName"]').evaluate(
      (el) => (el as HTMLInputElement).validity.valid
    )
    expect(valid).toBe(false)
  })

  test('2.5 join scan with all fields navigates to session view', async ({ page }) => {
    await page.goto('/#/new')
    await page.getByLabel('Short code').fill('BARN-7K9')
    await page.getByLabel('Invite token').fill('join-token-123')
    await page.getByLabel('Your name').fill('Alice')
    await page.getByRole('button', { name: 'Join scan' }).click()
    await expect(page).toHaveURL(/#\/session\//, { timeout: 5000 })
  })

  test('2.6 join scan with empty fields does not proceed (browser required validation)', async ({ page }) => {
    await page.goto('/#/new')
    await page.getByRole('button', { name: 'Join scan' }).click()
    // Inputs are required — browser blocks submission, no navigation occurs
    await expect(page).toHaveURL(/#\/new/)
    const valid = await page.locator('input[name="shortCode"]').evaluate(
      (el) => (el as HTMLInputElement).validity.valid
    )
    expect(valid).toBe(false)
  })
})
