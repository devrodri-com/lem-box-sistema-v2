import { test, expect } from '@playwright/test';

test('cliente puede ver su historial', async ({ page }) => {
  await page.goto('/mi');
  await page.getByLabel('Email').fill('cliente@lem-box.com');
  await page.getByLabel('Password').fill('password-demo');
  await page.getByRole('button', { name: /acceder/i }).click();

  await page.getByRole('tab', { name: /historial/i }).click();
  await expect(page.getByText(/tracking/i)).toBeVisible();
});