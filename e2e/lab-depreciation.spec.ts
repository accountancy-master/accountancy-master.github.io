import { expect, test, type Page } from '@playwright/test';
import { formatINR } from '../src/engine/money';
import { EXAMPLES } from '../src/simulator/depreciation/examples';
import { schedule } from '../src/simulator/depreciation/schedule';
import { askRng, depAsk } from '../src/simulator/depreciation/tryit';
import { createProfile } from './helpers';

// The depreciation lab of the simulator (src/simulator/depreciation, components/simulator/labs/DepreciationLab.tsx).
// With reduced motion every step fades, so a walk-through plays quickly.
test.use({ reducedMotion: 'reduce' });

const LAB = '/simulator?lab=depreciation';
const SEED = 7;
const noSidewaysScroll = (page: Page) => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);
const figure = (p: number) => String(p / 100);

test('watch: the example plays from the purchase to the sale, and the accounts follow it', async ({ page }) => {
  test.setTimeout(90_000);
  await createProfile(page, 'Varun', { keepDeviceDefaults: true });
  await page.goto(LAB);
  await expect(page.getByTestId('lab-depreciation')).toBeVisible();
  await expect(page.getByTestId('lab-depreciation-about')).toContainText('cost ₹2,00,000');
  await page.getByTestId('lab-depreciation-play').click();
  await expect(page.getByTestId('lab-depreciation-stage')).toHaveAttribute('data-status', 'done', { timeout: 40_000 });
  await expect(page.locator('[data-testid="lab-depreciation-step-text"][data-played="true"]')).toHaveCount(6);
  await expect(page.getByTestId('lab-depreciation-sale-result')).toContainText('Loss on sale ₹8,000');
  await expect(page.getByTestId('lab-depreciation-schedule')).toContainText('₹27,000');
  await expect(page.getByTestId('lab-depreciation-announce')).toContainText('a loss of ₹8,000');
  await page.getByTestId('lab-depreciation-account-disposal').click();
  await expect(page.getByTestId('lab-depreciation-ledger-disposal')).toContainText('By Loss on Sale of Asset A/c');
  await expect(page.getByTestId('lab-depreciation-journal')).toContainText('Asset Disposal A/c');
  // A step back: the asset stands again at the last year end before the sale.
  await page.getByTestId('lab-depreciation-back').click();
  await page.getByTestId('lab-depreciation-back').click();
  await expect(page.getByTestId('lab-depreciation-book-value')).toHaveText('₹1,10,000');
  await expect(page.getByTestId('lab-depreciation-written')).toHaveText('₹90,000');
});

test('play: changing the method and the rate redraws the figures', async ({ page }) => {
  await createProfile(page, 'Varun', { keepDeviceDefaults: true });
  await page.goto(LAB);
  await page.getByTestId('lab-depreciation-mode-play').click();
  await expect(page.getByTestId('lab-depreciation-sale-result')).toContainText('Loss on sale ₹8,000');
  await page.getByTestId('lab-depreciation-in-method-wdv').click();
  const wdv = schedule({ ...EXAMPLES[0].inputs, method: 'wdv' }).sale!;
  await expect(page.getByTestId('lab-depreciation-sale-result')).toContainText(`Loss on sale ${formatINR(-wdv.result)}`);
  await page.getByTestId('lab-depreciation-in-rate-number').fill('10');
  const ten = schedule({ ...EXAMPLES[0].inputs, method: 'wdv', rate: 10 });
  await expect(page.getByTestId('lab-depreciation-schedule-row').first()).toContainText(formatINR(ten.rows[0].charge));
  await expect(page.getByTestId('lab-depreciation-sale-result')).toContainText(formatINR(Math.abs(ten.sale!.result)));
  // Keeping the asset instead: no sale, and the provision stays on the books.
  await page.getByTestId('lab-depreciation-in-sale-keep').click();
  await expect(page.getByTestId('lab-depreciation-sale-result')).toHaveCount(0);
  await expect(page.getByTestId('lab-depreciation-account-balance')).toHaveText('₹2,00,000');
});

test('try it: a wrong figure is told why, a right one and a right choice are marked right', async ({ page }) => {
  await createProfile(page, 'Varun', { keepDeviceDefaults: true });
  await page.goto(`${LAB}&seed=${SEED}`);
  await page.getByTestId('lab-depreciation-mode-try').click();
  const first = depAsk('next-charge', askRng(SEED, 'next-charge', 0));
  await expect(page.getByTestId('lab-depreciation-try-prompt')).toHaveText(first.prompt);
  await page.getByTestId('lab-depreciation-try-answer').fill('1');
  await page.getByTestId('lab-depreciation-try-check').click();
  await expect(page.getByTestId('lab-depreciation-try-feedback')).toHaveAttribute('data-correct', 'false');
  await expect(page.getByTestId('lab-depreciation-try-feedback')).toContainText(first.reason);
  await page.getByTestId('lab-depreciation-try-next').click();
  const second = depAsk('next-charge', askRng(SEED, 'next-charge', 1));
  if (second.answer.type !== 'number') throw new Error('a figure was expected');
  await expect(page.getByTestId('lab-depreciation-try-prompt')).toHaveText(second.prompt);
  await page.getByTestId('lab-depreciation-try-answer').fill(figure(second.answer.value));
  await page.getByTestId('lab-depreciation-try-check').click();
  await expect(page.getByTestId('lab-depreciation-try-feedback')).toHaveAttribute('data-correct', 'true');
  await page.getByTestId('lab-depreciation-kind-which-account').click();
  const which = depAsk('which-account', askRng(SEED, 'which-account', 0));
  if (which.answer.type !== 'choice') throw new Error('a choice was expected');
  await page.getByTestId(`lab-depreciation-try-option-${which.answer.correct}`).click();
  await page.getByTestId('lab-depreciation-try-check').click();
  await expect(page.getByTestId('lab-depreciation-try-feedback')).toHaveAttribute('data-correct', 'true');
});

test('at 360 px no mode of the lab scrolls sideways', async ({ page }) => {
  test.setTimeout(60_000);
  await page.setViewportSize({ width: 360, height: 740 });
  await createProfile(page, 'Varun', { keepDeviceDefaults: true });
  await page.goto(LAB);
  for (let i = 0; i < 6; i++) await page.getByTestId('lab-depreciation-step').click();
  await expect(page.getByTestId('lab-depreciation-stage')).toHaveAttribute('data-shown', '6');
  expect(await noSidewaysScroll(page)).toBe(true);
  for (const mode of ['play', 'try']) {
    await page.getByTestId(`lab-depreciation-mode-${mode}`).click();
    await expect(page.getByTestId(`lab-depreciation-panel-${mode}`)).toBeVisible();
    expect(await noSidewaysScroll(page), mode).toBe(true);
  }
});
