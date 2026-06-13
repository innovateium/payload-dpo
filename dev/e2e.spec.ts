import { expect, test } from '@playwright/test'

test.describe('Admin panel', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/admin')
    await page.fill('#field-email', 'dev@payloadcms.com')
    await page.fill('#field-password', 'test')
    await page.click('.form-submit button')
    await page.waitForURL(/\/admin$/)
  })

  test('shows dashboard after login', async ({ page }) => {
    await expect(page).toHaveTitle(/Dashboard/)
  })

  test('navigates to DPO transactions collection', async ({ page }) => {
    await page.goto('/admin/collections/dpo-transactions')
    await page.waitForSelector('text=DPO Payments', { timeout: 10000 })
    await expect(page.locator('text=DPO Payments').first()).toBeVisible()
  })

  test('dpo-transactions list view renders', async ({ page }) => {
    await page.goto('/admin/collections/dpo-transactions')
    await page.waitForLoadState('networkidle')
    const table = page.locator('table')
    await expect(table).toBeVisible()
  })
})

test.describe('Test payment page', () => {
  test('renders test payment form', async ({ page }) => {
    await page.goto('/test-payment')
    await expect(page.locator('text=Test Payment')).toBeVisible()
    await expect(page.locator('text=Pay Now')).toBeVisible()
  })

  test('shows email input field', async ({ page }) => {
    await page.goto('/test-payment')
    const emailInput = page.locator('#email')
    await expect(emailInput).toBeVisible()
    await expect(emailInput).toHaveValue('test@example.com')
  })

  test('shows currency selector with options', async ({ page }) => {
    await page.goto('/test-payment')
    const currencySelect = page.locator('#currency')
    await expect(currencySelect).toBeVisible()
    await expect(currencySelect).toContainText('ZAR')
    await expect(currencySelect).toContainText('BWP')
    await expect(currencySelect).toContainText('USD')
  })

  test('shows amount input field', async ({ page }) => {
    await page.goto('/test-payment')
    const amountInput = page.locator('#amount')
    await expect(amountInput).toBeVisible()
    await expect(amountInput).toHaveValue('9.99')
  })

  test('shows status link', async ({ page }) => {
    await page.goto('/test-payment')
    await expect(page.locator('a[href="/api/dpo/status"]')).toBeVisible()
  })
})

test.describe('Payment result page', () => {
  test('shows error when no PAY_REQUEST_ID', async ({ page }) => {
    await page.goto('/payment-result')
    await expect(page.locator('text=Invalid Request')).toBeVisible()
  })

  test('shows status check with valid PAY_REQUEST_ID', async ({ page }) => {
    await page.goto('/payment-result?PAY_REQUEST_ID=test-id-123')
    await expect(page.locator('text=Checking Status')).toBeVisible()
  })
})
