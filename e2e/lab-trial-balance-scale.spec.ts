import { expect, test, type Page } from '@playwright/test';
import { gapOf, suspenseOf } from '../src/simulator/trial-balance-scale/scale';
import { makeScaleQuestion } from '../src/simulator/trial-balance-scale/tryit';
import { createProfile } from './helpers';

// The lab "trial-balance-scale" of the simulator (/simulator?lab=trial-balance-scale): errors tip the scale of the
// trial balance or leave it level, Suspense levels it, the rectifying entry puts it right.
test.use({ reducedMotion: 'reduce' });

const SEED = 9;
const S = 'lab-trial-balance-scale';
const noSidewaysScroll = (page: Page) => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);

test('watch: a partial omission tips the scale, Suspense levels it, the rectifying entry clears it', async ({ page }) => {
  await createProfile(page, 'Varun', { keepDeviceDefaults: true });
  await page.goto('/simulator?lab=trial-balance-scale');
  await expect(page.getByTestId(`${S}-scale`)).toHaveAttribute('data-tilt', 'level');
  await expect(page.getByTestId(`${S}-debit-total`)).toHaveText('₹2,80,000');
  await page.getByTestId(`${S}-step`).click();
  await expect(page.getByTestId(`${S}-scale`)).toHaveAttribute('data-tilt', 'Cr');
  await expect(page.getByTestId(`${S}-debit-total`)).toHaveText('₹2,72,000');
  await expect(page.getByTestId(`${S}-verdict`)).toContainText('the credit side is heavier by ₹8,000');
  await expect(page.getByTestId(`${S}-weight-debtor:Mohan`)).toContainText('Mohan A/c ₹17,000');
  await page.getByTestId(`${S}-step`).click();
  await expect(page.getByTestId(`${S}-scale`)).toHaveAttribute('data-tilt', 'level');
  await expect(page.getByTestId(`${S}-suspense`)).toContainText('₹8,000');
  await expect(page.getByTestId(`${S}-tb-suspense`)).toContainText('8,000');
  await page.getByTestId(`${S}-play`).click();
  await expect(page.getByTestId(`${S}-stage`)).toHaveAttribute('data-status', 'done', { timeout: 30_000 });
  await expect(page.getByTestId(`${S}-suspense`)).toHaveCount(0);
  await expect(page.getByTestId(`${S}-debit-total`)).toHaveText('₹2,80,000');
  await expect(page.getByTestId(`${S}-suspense-account`)).toContainText('To Difference in Trial Balance');
  await expect(page.getByTestId(`${S}-suspense-account`)).toContainText('By Mohan A/c');
  await expect(page.getByTestId(`${S}-entry-after`)).toContainText('Mohan A/c Dr.');
  await expect(page.getByTestId(`${S}-entry-after`)).toContainText('To Suspense A/c');
  await expect(page.getByTestId(`${S}-before`)).toContainText('Debit Mohan A/c with ₹8,000');
  await expect(page.getByTestId(`${S}-announce`)).toContainText('Step 3 of 3');
  // A two-sided error never tips it.
  await page.getByTestId(`${S}-example`).selectOption('principle');
  await page.getByTestId(`${S}-step`).click();
  await expect(page.getByTestId(`${S}-scale`)).toHaveAttribute('data-tilt', 'level');
  await expect(page.getByTestId(`${S}-entry-after`)).toContainText('To Purchases A/c');
});

test('play: changing the wrong figure moves the scale and the Suspense it needs', async ({ page }) => {
  await createProfile(page, 'Varun', { keepDeviceDefaults: true });
  await page.goto('/simulator?lab=trial-balance-scale');
  await page.getByTestId(`${S}-mode-play`).click();
  await page.getByTestId(`${S}-play-card-wrong-amount`).click();
  await expect(page.getByTestId(`${S}-play-amount`)).toHaveValue('7,200');
  await expect(page.getByTestId(`${S}-play-wrong`)).toHaveValue('2,700');
  await expect(page.getByTestId(`${S}-credit-total`)).toHaveText('₹2,75,500');
  await page.getByTestId(`${S}-play-wrong`).fill('3,700');
  await expect(page.getByTestId(`${S}-credit-total`)).toHaveText('₹2,76,500');
  await expect(page.getByTestId(`${S}-scale`)).toHaveAttribute('data-tilt', 'Dr');
  await page.getByTestId(`${S}-play-frame-2`).click();
  await expect(page.getByTestId(`${S}-suspense`)).toContainText('₹3,500');
  await expect(page.getByTestId(`${S}-scale`)).toHaveAttribute('data-tilt', 'level');
  await page.getByTestId(`${S}-play-when-before`).click();
  await expect(page.getByTestId(`${S}-suspense`)).toHaveCount(0);
  await expect(page.getByTestId(`${S}-before`)).toContainText('Credit Rao & Co. A/c with ₹3,500');
  await page.getByTestId(`${S}-play-wrong`).fill('7,200');
  await expect(page.getByTestId(`${S}-play-problem`)).toContainText('no error');
});

test('try it: will it tip, right and wrong, and no sideways scroll at 360 px', async ({ page }) => {
  await createProfile(page, 'Varun', { keepDeviceDefaults: true });
  await page.setViewportSize({ width: 360, height: 740 });
  await page.goto(`/simulator?lab=trial-balance-scale&seed=${SEED}`);
  await page.getByTestId(`${S}-mode-try`).click();
  await expect(page.getByTestId(`${S}-try`)).toHaveAttribute('data-kind', 'tip');
  const tip = makeScaleQuestion(SEED, 'tip');
  const g = gapOf(tip.error);
  await page.getByTestId(`${S}-try-tip-${g === 0 ? 'level' : g > 0 ? 'Dr' : 'Cr'}`).click();
  await expect(page.getByTestId(`${S}-try-feedback`)).toHaveAttribute('data-correct', 'true');
  expect(await noSidewaysScroll(page)).toBe(true);

  await page.getByTestId(`${S}-try-next`).click();
  await expect(page.getByTestId(`${S}-try`)).toHaveAttribute('data-kind', 'suspense');
  const s = suspenseOf(makeScaleQuestion(SEED + 1, 'suspense').error)!;
  // Suspense on the heavier pan: wrong.
  await page.getByTestId(`${S}-try-pan-${s.side === 'Dr' ? 'Cr' : 'Dr'}`).click();
  await page.getByTestId(`${S}-try-amount`).fill(String(s.amount / 100));
  await page.getByTestId(`${S}-try-check`).click();
  await expect(page.getByTestId(`${S}-try-feedback`)).toHaveAttribute('data-correct', 'false');
  await expect(page.getByTestId(`${S}-try-feedback`)).toContainText('lighter pan');
  expect(await noSidewaysScroll(page)).toBe(true);
});
