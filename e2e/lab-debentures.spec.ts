import { expect, test, type Page } from '@playwright/test';
import { formatINR } from '../src/engine/money';
import { EXAMPLES } from '../src/simulator/debentures/examples';
import { figures } from '../src/simulator/debentures/issue';
import { askRng, debAsk } from '../src/simulator/debentures/tryit';
import { createProfile } from './helpers';

// The lab "Borrowing through debentures" (/simulator?lab=debentures): the walk-through of an issue at a discount
// redeemable at a premium, a case changed in the sandbox, Try-it questions answered wrong and right, and the page at
// 360 px. With reduced motion, so that every step is a fade.
test.use({ reducedMotion: 'reduce' });

const LAB = '/simulator?lab=debentures';
const SEED = 7;
const D = 'lab-debentures';
const noSidewaysScroll = (page: Page) => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);

test('watch: the issue plays from its terms to the balance sheet', async ({ page }) => {
  test.setTimeout(90_000);
  await createProfile(page, 'Ishita', { keepDeviceDefaults: true });
  await page.goto(LAB);
  await expect(page.getByTestId(D)).toBeVisible();
  await expect(page.getByTestId(`${D}-about`)).toContainText('Sagar Mills Ltd.');
  await page.getByTestId(`${D}-play`).click();
  await expect(page.getByTestId(`${D}-stage`)).toHaveAttribute('data-status', 'done', { timeout: 40_000 });
  await expect(page.locator(`[data-testid="${D}-step-text"][data-played="true"]`)).toHaveCount(8);
  await expect(page.getByTestId(`${D}-pot-debentures-amount`)).toHaveText('₹10,00,000 Cr');
  await expect(page.getByTestId(`${D}-pot-premRed-amount`)).toHaveText('₹50,000 Cr');
  await expect(page.getByTestId(`${D}-pot-sp-amount`)).toHaveText('nil');
  await expect(page.getByTestId(`${D}-pot-spl-amount`)).toHaveText('₹1,27,500 Dr');
  await expect(page.getByTestId(`${D}-sheet-face`)).toContainText('Other long-term liabilities');
  await expect(page.getByTestId(`${D}-sheet-notes`)).toContainText('Loss on issue of debentures written off');
  await expect(page.getByTestId(`${D}-announce`)).toContainText('Finance costs');
  // A step back: the loss is not yet written off, and Securities Premium still holds its balance.
  await page.getByTestId(`${D}-back`).click();
  await page.getByTestId(`${D}-back`).click();
  await page.getByTestId(`${D}-back`).click();
  await expect(page.getByTestId(`${D}-pot-loss-amount`)).toHaveText('₹1,00,000 Dr');
  await expect(page.getByTestId(`${D}-pot-sp-amount`)).toHaveText('₹40,000 Cr');
});

test('play: changing the case redraws the loss and the finance costs', async ({ page }) => {
  await createProfile(page, 'Ishita', { keepDeviceDefaults: true });
  await page.goto(LAB);
  await page.getByTestId(`${D}-mode-play`).click();
  await expect(page.getByTestId(`${D}-pot-spl-amount`)).toHaveText('₹1,27,500 Dr');
  // Issued at par, redeemable at a premium: the loss is the premium on redemption alone.
  await page.getByTestId(`${D}-in-case-par-premium`).click();
  const f = figures({ ...EXAMPLES[0].input, issueAt: 'par', issuePct: 0 });
  await expect(page.getByTestId(`${D}-per-loss`)).toContainText('premium on redemption ₹5 = ₹5');
  await expect(page.getByTestId(`${D}-pot-spl-amount`)).toHaveText(`${formatINR(f.financeCosts)} Dr`);
  // A vendor: the number of debentures follows from the price; a price that is not a whole number is refused.
  await page.getByTestId(`${D}-in-route-vendor`).click();
  await page.getByTestId(`${D}-in-price`).fill('1000050');
  await expect(page.getByTestId(`${D}-problem`)).toContainText('whole number of debentures');
  await page.getByTestId(`${D}-in-price`).fill('500000');
  await expect(page.getByTestId(`${D}-problem`)).toHaveCount(0);
  await expect(page.getByTestId(`${D}-pot-debentures-amount`)).toHaveText('₹5,00,000 Cr');
});

test('try it: a wrong figure is told why, a right figure and a right entry are marked right', async ({ page }) => {
  await createProfile(page, 'Ishita', { keepDeviceDefaults: true });
  await page.goto(`${LAB}&seed=${SEED}`);
  await page.getByTestId(`${D}-mode-try`).click();
  const first = debAsk('loss', askRng(SEED, 'loss', 0));
  await expect(page.getByTestId(`${D}-try-prompt`)).toHaveText(first.prompt);
  await page.getByTestId(`${D}-try-answer`).fill('1');
  await page.getByTestId(`${D}-try-check`).click();
  await expect(page.getByTestId(`${D}-try-feedback`)).toHaveAttribute('data-correct', 'false');
  await expect(page.getByTestId(`${D}-try-feedback`)).toContainText(first.reason);
  await page.getByTestId(`${D}-try-next`).click();
  const second = debAsk('loss', askRng(SEED, 'loss', 1));
  if (second.answer.type !== 'number') throw new Error('a figure was expected');
  await page.getByTestId(`${D}-try-answer`).fill(String(second.answer.value / 100));
  await page.getByTestId(`${D}-try-check`).click();
  await expect(page.getByTestId(`${D}-try-feedback`)).toHaveAttribute('data-correct', 'true');
  await page.getByTestId(`${D}-kind-entry`).click();
  const entry = debAsk('entry', askRng(SEED, 'entry', 0));
  if (entry.answer.type !== 'choice') throw new Error('a choice was expected');
  await page.getByTestId(`${D}-try-option-${entry.answer.correct}`).click();
  await page.getByTestId(`${D}-try-check`).click();
  await expect(page.getByTestId(`${D}-try-feedback`)).toHaveAttribute('data-correct', 'true');
  await expect(page.getByTestId(`${D}-journal-now`)).toBeVisible();
});

test('at 360 px no mode of the lab scrolls sideways', async ({ page }) => {
  test.setTimeout(60_000);
  await page.setViewportSize({ width: 360, height: 740 });
  await createProfile(page, 'Ishita', { keepDeviceDefaults: true });
  await page.goto(LAB);
  for (let i = 0; i < 8; i++) await page.getByTestId(`${D}-step`).click();
  await expect(page.getByTestId(`${D}-stage`)).toHaveAttribute('data-shown', '8');
  expect(await noSidewaysScroll(page)).toBe(true);
  for (const mode of ['play', 'try']) {
    await page.getByTestId(`${D}-mode-${mode}`).click();
    await expect(page.getByTestId(`${D}-panel-${mode}`)).toBeVisible();
    expect(await noSidewaysScroll(page), mode).toBe(true);
  }
});
