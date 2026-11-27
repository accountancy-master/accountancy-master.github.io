import { expect, test } from '@playwright/test';
import { createProfile } from './helpers';

// An address with a slash at the end is the page without it; an address the site does not have says so.

test('an address with a slash at the end opens the page it means, keeping its query', async ({ page }) => {
  await createProfile(page, 'Varun');
  await page.goto('/practice/marathon/?topics=ledger');
  await expect(page).toHaveURL(/\/practice\/marathon\?topics=ledger$/);
  await expect(page.getByRole('heading', { name: 'Marathon', level: 1 })).toBeVisible();
});

test('an address the site does not have says so and offers the way home', async ({ page }) => {
  await createProfile(page, 'Varun');
  await page.goto('/no-such-page');
  await expect(page.getByRole('heading', { name: 'This page does not exist' })).toBeVisible();
  await page.getByRole('link', { name: 'Go to Home' }).click();
  await expect(page).toHaveURL(/\/home$/);
});
