import { expect, test } from '@playwright/test';
import { DISCLAIMER, MOCK_PAPER_NOTE } from '../src/content/disclaimer';
import { JE, createProfile } from './helpers';

// The disclaimer: in full on /about (which needs no learner), and in short, with a link to it, on the landing page,
// in Settings and before a mock paper.

test('the About page shows the whole disclaimer to anyone, with the ways to report or fix a mistake', async ({ page }) => {
  await page.goto('/about');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('About and disclaimer');
  for (const part of DISCLAIMER) await expect(page.getByRole('heading', { name: part.heading })).toBeVisible();
  await expect(page.getByTestId('about-report')).toHaveAttribute('href', /\/issues\/new\/choose$/);
  await expect(page.getByTestId('about-contributing')).toHaveAttribute('href', /CONTRIBUTING\.md$/);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});

test('the landing page, Settings and a mock paper say it in short and link to it', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByTestId('landing-disclaimer')).toContainText('not affiliated with CBSE or NCERT');
  await page.getByTestId('landing-about').click();
  await expect(page).toHaveURL(/\/about$/);

  await createProfile(page, 'Varun');
  await page.goto('/settings');
  await expect(page.getByTestId('settings-disclaimer')).toContainText('not affiliated with CBSE or NCERT');
  await expect(page.getByTestId('settings-about')).toHaveAttribute('href', '/about');

  await page.goto(`/mock/paper?paper=topic.${JE}.1`);
  await expect(page.getByTestId('mock-disclaimer')).toContainText(MOCK_PAPER_NOTE);
});
