import { expect, test, type Page } from '@playwright/test';
import { askRng, disAsk } from '../src/simulator/dissolution/tryit';
import { createProfile } from './helpers';

// The dissolution lab of the simulator (src/simulator/dissolution, components/simulator/labs/DissolutionLab.tsx).
// With reduced motion every step fades, so a walk-through plays quickly.
test.use({ reducedMotion: 'reduce' });

const LAB = '/simulator?lab=dissolution';
const SEED = 7;
const noSidewaysScroll = (page: Page) => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);

test('watch: the books of the firm close step by step, and the bank ends at nil', async ({ page }) => {
  test.setTimeout(90_000);
  await createProfile(page, 'Varun', { keepDeviceDefaults: true });
  await page.goto(LAB);
  await expect(page.getByTestId('lab-dissolution')).toBeVisible();
  await expect(page.getByTestId('lab-dissolution-about')).toContainText('Asha and Bharat');
  await expect(page.getByTestId('lab-dissolution-bank-balance')).toHaveText('₹20,000');
  await page.getByTestId('lab-dissolution-play').click();
  await expect(page.getByTestId('lab-dissolution-stage')).toHaveAttribute('data-status', 'done', { timeout: 60_000 });
  await expect(page.locator('[data-testid="lab-dissolution-step-text"][data-played="true"]')).toHaveCount(10);
  await expect(page.getByTestId('lab-dissolution-result')).toContainText('Loss on realisation ₹60,000');
  await expect(page.getByTestId('lab-dissolution-bank-balance')).toHaveText('nil');
  await expect(page.getByTestId('lab-dissolution-announce')).toContainText('Asha ₹85,000 and Bharat ₹96,000');
  await expect(page.getByTestId('lab-dissolution-ledger-realisation')).toContainText("By Asha's Capital A/c (stock)");
  await page.getByTestId('lab-dissolution-account-capitals').click();
  await expect(page.getByTestId('lab-dissolution-capital-dr')).toContainText('To Realisation A/c (loss)');
  await page.getByTestId('lab-dissolution-account-bank').click();
  await expect(page.getByTestId('lab-dissolution-ledger-bank')).toContainText("By Bharat's Loan A/c");
  // Back to the step where the assets went in: only the debit side of Realisation A/c is written.
  for (let i = 0; i < 9; i++) await page.getByTestId('lab-dissolution-back').click();
  await expect(page.getByTestId('lab-dissolution-real-dr')).toHaveText('₹4,10,000');
  await expect(page.getByTestId('lab-dissolution-real-cr')).toHaveText('₹0');
});

test('play: a better price and a partner who bears the expenses shrink the loss', async ({ page }) => {
  await createProfile(page, 'Varun', { keepDeviceDefaults: true });
  await page.goto(LAB);
  await page.getByTestId('lab-dissolution-mode-play').click();
  await expect(page.getByTestId('lab-dissolution-result')).toContainText('Loss on realisation ₹60,000');
  await page.getByTestId('lab-dissolution-in-asset-amount-2').fill('191000');
  await expect(page.getByTestId('lab-dissolution-result')).toContainText('Loss on realisation ₹40,000');
  await page.getByTestId('lab-dissolution-in-expenses-form').selectOption('bornePersonal');
  await expect(page.getByTestId('lab-dissolution-result')).toContainText('Loss on realisation ₹36,000');
  await expect(page.getByTestId('lab-dissolution-bank-balance')).toHaveText('nil');
});

test('try it: a wrong side is told why, a right side and a right figure are marked right', async ({ page }) => {
  await createProfile(page, 'Varun', { keepDeviceDefaults: true });
  await page.goto(`${LAB}&seed=${SEED}`);
  await page.getByTestId('lab-dissolution-mode-try').click();
  const first = disAsk('side', askRng(SEED, 'side', 0));
  if (first.answer.type !== 'choice') throw new Error('a choice was expected');
  await expect(page.getByTestId('lab-dissolution-try-prompt')).toHaveText(first.prompt);
  const correct = first.answer.correct;
  const wrong = first.answer.options.find((o) => o.id !== correct)!;
  await page.getByTestId(`lab-dissolution-try-option-${wrong.id}`).click();
  await page.getByTestId('lab-dissolution-try-check').click();
  await expect(page.getByTestId('lab-dissolution-try-feedback')).toHaveAttribute('data-correct', 'false');
  await expect(page.getByTestId('lab-dissolution-try-feedback')).toContainText(wrong.why!);
  await page.getByTestId('lab-dissolution-try-next').click();
  const second = disAsk('side', askRng(SEED, 'side', 1));
  if (second.answer.type !== 'choice') throw new Error('a choice was expected');
  await page.getByTestId(`lab-dissolution-try-option-${second.answer.correct}`).click();
  await page.getByTestId('lab-dissolution-try-check').click();
  await expect(page.getByTestId('lab-dissolution-try-feedback')).toHaveAttribute('data-correct', 'true');
  await page.getByTestId('lab-dissolution-kind-result').click();
  const result = disAsk('result', askRng(SEED, 'result', 0));
  if (result.answer.type !== 'number' || !result.answer.tag) throw new Error('a figure with a word was expected');
  await page.getByTestId('lab-dissolution-try-answer').fill(String(result.answer.value / 100));
  await page.getByTestId(`lab-dissolution-try-tag-${result.answer.tag.correct}`).click();
  await page.getByTestId('lab-dissolution-try-check').click();
  await expect(page.getByTestId('lab-dissolution-try-feedback')).toHaveAttribute('data-correct', 'true');
  await expect(page.getByTestId('lab-dissolution-result')).toContainText(result.answer.tag.correct === 'profit' ? 'Profit on realisation' : 'Loss on realisation');
});

test('at 360 px no mode of the lab scrolls sideways', async ({ page }) => {
  test.setTimeout(60_000);
  await page.setViewportSize({ width: 360, height: 740 });
  await createProfile(page, 'Varun', { keepDeviceDefaults: true });
  await page.goto(LAB);
  for (let i = 0; i < 10; i++) await page.getByTestId('lab-dissolution-step').click();
  await expect(page.getByTestId('lab-dissolution-stage')).toHaveAttribute('data-shown', '10');
  for (const account of ['realisation', 'capitals', 'bank']) {
    await page.getByTestId(`lab-dissolution-account-${account}`).click();
    expect(await noSidewaysScroll(page), account).toBe(true);
  }
  for (const mode of ['play', 'try']) {
    await page.getByTestId(`lab-dissolution-mode-${mode}`).click();
    await expect(page.getByTestId(`lab-dissolution-panel-${mode}`)).toBeVisible();
    expect(await noSidewaysScroll(page), mode).toBe(true);
  }
});
