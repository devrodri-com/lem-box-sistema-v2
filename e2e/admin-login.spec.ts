import { test, expect } from '@playwright/test';

test('admin accede al panel', async ({ page }) => {
  await page.goto('/acceder');
  await page.getByLabel('Email').fill('admin@lem-box.com');
  await page.getByLabel('Password').fill('password-demo');
  await page.getByRole('button', { name: /acceder/i }).click();

  await page.goto('/admin/preparado');
  await expect(page.getByRole('heading', { name: /preparado/i })).toBeVisible();
});