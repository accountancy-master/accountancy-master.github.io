import { expect, test, type Page } from '@playwright/test';
import { createProfile } from './helpers';

type Counting = Window & { __persistCalls?: number };

/** Replaces the browser's storage manager with a stand-in that counts persist() calls and reports `persisted`. */
async function fakeStorage(page: Page, persisted: boolean) {
  await page.addInitScript((answer) => {
    const w = window as Counting;
    w.__persistCalls = 0;
    Object.defineProperty(navigator, 'storage', {
      configurable: true,
      value: {
        persist: async () => {
          w.__persistCalls = (w.__persistCalls ?? 0) + 1;
          return answer;
        },
        persisted: async () => answer,
      },
    });
  }, persisted);
}

const calls = (page: Page) => page.evaluate(() => (window as Counting).__persistCalls ?? 0);

test('the browser is asked to keep the data once a profile exists, and Settings says what it answered', async ({ page }) => {
  await fakeStorage(page, true);
  await page.goto('/start');
  // No profile yet, nothing worth keeping.
  await expect(page.getByTestId('profile-name-input')).toBeVisible();
  expect(await calls(page)).toBe(0);

  await createProfile(page, 'Varun');
  await expect.poll(() => calls(page)).toBeGreaterThan(0);

  await page.goto('/settings');
  await expect(page.getByTestId('storage-persisted')).toHaveText('Your progress is kept safely on this device: the browser will not clear it to make space.');
});

test('a page load with an existing profile asks the browser again', async ({ page }) => {
  await fakeStorage(page, false);
  await createProfile(page, 'Varun');
  await page.goto('/settings');
  await expect.poll(() => calls(page)).toBeGreaterThan(0);
  await expect(page.getByTestId('storage-persisted')).toHaveText(
    'This browser may clear your progress if space runs low. Download a backup now and then.',
  );
});

test('without a storage API Settings shows the cautious line and nothing throws', async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'storage', { configurable: true, value: undefined });
  });
  const errors: string[] = [];
  page.on('pageerror', (err) => errors.push(err.message));
  await createProfile(page, 'Varun');
  await page.goto('/settings');
  await expect(page.getByTestId('storage-persisted')).toHaveText(
    'This browser may clear your progress if space runs low. Download a backup now and then.',
  );
  expect(errors).toEqual([]);
});
