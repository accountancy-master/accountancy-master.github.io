import { expect, test, type Page } from '@playwright/test';
import { formatINR } from '../src/engine/money';
import { partnershipQuestions } from '../src/simulator/partnership/questions';
import { createProfile } from './helpers';

// The lab "Sharing among partners" (/simulator?lab=partnership): the walk-through of a year's profit, a figure
// changed in the sandbox, a Try-it question answered wrong and then right, and the page at 360 px. With reduced
// motion, so that every step is a fade.
test.use({ reducedMotion: 'reduce' });

const SEED = 5;
const P = 'lab-partnership';
const noSidewaysScroll = (page: Page) => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);

test('partnership lab: watch, play, try it, and a phone', async ({ page }) => {
  test.setTimeout(90_000);
  await createProfile(page, 'Ishaan');
  await page.goto(`/simulator?lab=partnership&seed=${SEED}`);
  await expect(page.getByTestId(P)).toBeVisible();

  // Watch: the first example plays through at double speed.
  await page.getByTestId(`${P}-speed-2`).click();
  await page.getByTestId(`${P}-play`).click();
  await expect(page.getByTestId(`${P}-stage`)).toHaveAttribute('data-status', 'done', { timeout: 40_000 });
  await expect(page.getByTestId(`${P}-pool`)).toHaveText('To share ₹0');
  await expect(page.getByTestId(`${P}-partner-0-net`)).toHaveText('₹1,42,060');
  await expect(page.getByTestId(`${P}-partner-1-net`)).toHaveText('₹1,57,940');
  await expect(page.getByTestId(`${P}-account-dr`)).toContainText('3,02,100');
  await expect(page.getByTestId(`${P}-current-dr`)).toContainText('1,02,060');
  await expect(page.getByTestId(`${P}-announce`)).toContainText('current accounts');

  // A change in the partners: the circle turns and goodwill is credited to the sacrificing partners.
  await page.getByTestId(`${P}-example`).selectOption('recon:admit-old');
  await page.getByTestId(`${P}-play`).click();
  await expect(page.getByTestId(`${P}-stage`)).toHaveAttribute('data-status', 'done', { timeout: 40_000 });
  await expect(page.getByTestId(`${P}-pie`)).toHaveAttribute('data-phase', 'new');
  await expect(page.getByTestId(`${P}-ratios`)).toContainText('New ratio 12:8:5');
  await expect(page.getByTestId(`${P}-goodwill-0`)).toContainText('Cr ₹12,000');
  await expect(page.getByTestId(`${P}-journal`)).toContainText('To Premium for Goodwill A/c');

  // Play: no salary for Bimal leaves more to share in 3:2.
  await page.getByTestId(`${P}-mode-play`).click();
  await page.getByTestId(`${P}-salary-1`).fill('0');
  await expect(page.getByTestId(`${P}-partner-0-net`)).toHaveText('₹1,78,060');
  await expect(page.getByTestId(`${P}-stage`)).toHaveAttribute('data-status', 'done');

  // Try it: the first question answered wrong, the next one right.
  const qs = partnershipQuestions(SEED);
  await page.getByTestId(`${P}-mode-try`).click();
  const first = qs[0].answer;
  if (first.type !== 'amount') throw new Error('The first question asks for an amount.');
  await expect(page.getByTestId(`${P}-try-prompt`)).toHaveText(qs[0].prompt);
  await page.getByTestId(`${P}-try-answer`).fill(String(first.value / 100 + 1000));
  await page.getByTestId(`${P}-try-check`).click();
  await expect(page.getByTestId(`${P}-try-feedback`)).toHaveAttribute('data-correct', 'false');
  await expect(page.getByTestId(`${P}-try-feedback`)).toContainText(formatINR(first.value));
  await page.getByTestId(`${P}-try-next`).click();
  const second = qs[1].answer;
  if (second.type !== 'ratio') throw new Error('The second question asks for a ratio.');
  await page.getByTestId(`${P}-try-answer`).fill(second.terms.join(':'));
  await page.getByTestId(`${P}-try-check`).click();
  await expect(page.getByTestId(`${P}-try-feedback`)).toHaveAttribute('data-correct', 'true');

  // A phone 360 px wide: nothing scrolls sideways, in any mode.
  await page.setViewportSize({ width: 360, height: 740 });
  expect(await noSidewaysScroll(page)).toBe(true);
  await page.getByTestId(`${P}-mode-play`).click();
  expect(await noSidewaysScroll(page)).toBe(true);
  await page.getByTestId(`${P}-mode-watch`).click();
  await expect(page.getByTestId(`${P}-stage`)).toBeVisible();
  expect(await noSidewaysScroll(page)).toBe(true);
});
