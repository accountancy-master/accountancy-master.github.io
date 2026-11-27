import { expect, test, type Page } from '@playwright/test';
import { askRng, brsAsk } from '../src/simulator/bank-reconciliation/tryit';
import { createProfile } from './helpers';

// The bank reconciliation lab of the simulator (src/simulator/bank-reconciliation,
// components/simulator/labs/BankReconciliationLab.tsx). With reduced motion every step fades, so a walk-through
// plays quickly.
test.use({ reducedMotion: 'reduce' });

const LAB = '/simulator?lab=bank-reconciliation';
const SEED = 7;
const noSidewaysScroll = (page: Page) => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);

test('watch: every difference is carried in until the statement reaches the pass book balance', async ({ page }) => {
  test.setTimeout(90_000);
  await createProfile(page, 'Varun', { keepDeviceDefaults: true });
  await page.goto(LAB);
  await expect(page.getByTestId('lab-bank-reconciliation')).toBeVisible();
  await expect(page.getByTestId('lab-bank-reconciliation-cb-balance')).toHaveText('₹43,500 (favourable)');
  await expect(page.getByTestId('lab-bank-reconciliation-pb-balance')).toHaveText('₹50,250 (favourable)');
  await page.getByTestId('lab-bank-reconciliation-play').click();
  await expect(page.getByTestId('lab-bank-reconciliation-stage')).toHaveAttribute('data-status', 'done', { timeout: 40_000 });
  await expect(page.locator('[data-testid="lab-bank-reconciliation-step-text"][data-played="true"]')).toHaveCount(8);
  await expect(page.getByTestId('lab-bank-reconciliation-statement')).toHaveAttribute('data-complete', 'true');
  await expect(page.getByTestId('lab-bank-reconciliation-statement-end-label')).toHaveText('Balance as per Pass Book');
  await expect(page.getByTestId('lab-bank-reconciliation-statement-end')).toHaveText('50,250');
  await expect(page.getByTestId('lab-bank-reconciliation-statement-add')).toHaveCount(3);
  await expect(page.getByTestId('lab-bank-reconciliation-statement-less')).toHaveCount(3);
  await expect(page.getByTestId('lab-bank-reconciliation-running')).toHaveText('₹50,250 (favourable)');
  await expect(page.getByTestId('lab-bank-reconciliation-announce')).toContainText('Balance as per Pass Book, ₹50,250');
  // The same statement in the Plus and Minus layout.
  await page.getByTestId('lab-bank-reconciliation-layout-plusminus').click();
  await expect(page.getByTestId('lab-bank-reconciliation-statement-plus')).toHaveCount(3);
  await expect(page.getByTestId('lab-bank-reconciliation-statement-end')).toHaveText('50,250');
  // The overdraft example, from the pass book.
  await page.getByTestId('lab-bank-reconciliation-example-overdraft-pb').click();
  await expect(page.getByTestId('lab-bank-reconciliation-pb-balance')).toHaveText('₹14,950 (overdraft)');
});

test('play: a card carried the wrong way is told why; changed figures and the other book redraw the statement', async ({ page }) => {
  await createProfile(page, 'Varun', { keepDeviceDefaults: true });
  await page.goto(LAB);
  await page.getByTestId('lab-bank-reconciliation-mode-play').click();
  // Card c is the cheque issued to Patel Traders and not yet presented: from a favourable cash book balance, Add.
  await page.getByTestId('lab-bank-reconciliation-card-c-less').click();
  await expect(page.getByTestId('lab-bank-reconciliation-card-c-wrong')).toContainText('Not Less');
  await page.getByTestId('lab-bank-reconciliation-card-c-add').click();
  await expect(page.getByTestId('lab-bank-reconciliation-card-c-status')).toHaveText('✓ In the statement: Add');
  await expect(page.getByTestId('lab-bank-reconciliation-running')).toHaveText('₹56,000 (favourable)');
  // The cheque was for ₹10,000, not ₹12,500: the cash book balance changes, and the statement starts again.
  await page.getByTestId('lab-bank-reconciliation-in-item-c').fill('10000');
  await expect(page.getByTestId('lab-bank-reconciliation-cb-balance')).toHaveText('₹46,000 (favourable)');
  await page.getByTestId('lab-bank-reconciliation-carry-rest').click();
  await expect(page.getByTestId('lab-bank-reconciliation-statement-end-label')).toHaveText('Balance as per Pass Book');
  await expect(page.getByTestId('lab-bank-reconciliation-statement-end')).toHaveText('50,250');
  await page.getByTestId('lab-bank-reconciliation-from-pb').click();
  await page.getByTestId('lab-bank-reconciliation-carry-rest').click();
  await expect(page.getByTestId('lab-bank-reconciliation-statement-end-label')).toHaveText('Balance as per Cash Book');
  await expect(page.getByTestId('lab-bank-reconciliation-statement-end')).toHaveText('46,000');
  // Amended first: only the cheques not yet presented or cleared are left to carry.
  await page.getByTestId('lab-bank-reconciliation-amend-yes').click();
  await expect(page.getByTestId('lab-bank-reconciliation-amended-balance')).toHaveText('₹48,250 (favourable)');
  await page.getByTestId('lab-bank-reconciliation-carry-rest').click();
  await expect(page.getByTestId('lab-bank-reconciliation-statement-end')).toHaveText('48,250');
});

test('try it: add or less, and the balance after, marked at once', async ({ page }) => {
  await createProfile(page, 'Varun', { keepDeviceDefaults: true });
  await page.goto(`${LAB}&seed=${SEED}`);
  await page.getByTestId('lab-bank-reconciliation-mode-try').click();
  const first = brsAsk('add-or-less', askRng(SEED, 'add-or-less', 0));
  if (first.answer.type !== 'choice') throw new Error('a choice was expected');
  await expect(page.getByTestId('lab-bank-reconciliation-try-prompt')).toHaveText(first.prompt);
  const wrong = first.answer.correct === 'add' ? 'less' : 'add';
  await page.getByTestId(`lab-bank-reconciliation-try-option-${wrong}`).click();
  await page.getByTestId('lab-bank-reconciliation-try-check').click();
  await expect(page.getByTestId('lab-bank-reconciliation-try-feedback')).toHaveAttribute('data-correct', 'false');
  await page.getByTestId('lab-bank-reconciliation-try-next').click();
  const second = brsAsk('add-or-less', askRng(SEED, 'add-or-less', 1));
  if (second.answer.type !== 'choice') throw new Error('a choice was expected');
  await page.getByTestId(`lab-bank-reconciliation-try-option-${second.answer.correct}`).click();
  await page.getByTestId('lab-bank-reconciliation-try-check').click();
  await expect(page.getByTestId('lab-bank-reconciliation-try-feedback')).toHaveAttribute('data-correct', 'true');
  await expect(page.getByTestId('lab-bank-reconciliation-statement-add').or(page.getByTestId('lab-bank-reconciliation-statement-less'))).toHaveCount(1);
  await page.getByTestId('lab-bank-reconciliation-kind-balance-after').click();
  const after = brsAsk('balance-after', askRng(SEED, 'balance-after', 0));
  if (after.answer.type !== 'number' || !after.answer.tag) throw new Error('a figure and its word were expected');
  await page.getByTestId('lab-bank-reconciliation-try-answer').fill(String(after.answer.value / 100));
  await page.getByTestId(`lab-bank-reconciliation-try-tag-${after.answer.tag.correct}`).click();
  await page.getByTestId('lab-bank-reconciliation-try-check').click();
  await expect(page.getByTestId('lab-bank-reconciliation-try-feedback')).toHaveAttribute('data-correct', 'true');
  await page.getByTestId('lab-bank-reconciliation-kind-which-book').click();
  const which = brsAsk('which-book', askRng(SEED, 'which-book', 0));
  if (which.answer.type !== 'choice') throw new Error('a choice was expected');
  await page.getByTestId(`lab-bank-reconciliation-try-option-${which.answer.correct}`).click();
  await page.getByTestId('lab-bank-reconciliation-try-check').click();
  await expect(page.getByTestId('lab-bank-reconciliation-try-feedback')).toHaveAttribute('data-correct', 'true');
});

test('at 360 px no mode of the lab scrolls sideways', async ({ page }) => {
  test.setTimeout(60_000);
  await page.setViewportSize({ width: 360, height: 740 });
  await createProfile(page, 'Varun', { keepDeviceDefaults: true });
  await page.goto(LAB);
  for (let i = 0; i < 8; i++) await page.getByTestId('lab-bank-reconciliation-step').click();
  await expect(page.getByTestId('lab-bank-reconciliation-stage')).toHaveAttribute('data-shown', '8');
  expect(await noSidewaysScroll(page)).toBe(true);
  for (const mode of ['play', 'try']) {
    await page.getByTestId(`lab-bank-reconciliation-mode-${mode}`).click();
    await expect(page.getByTestId(`lab-bank-reconciliation-panel-${mode}`)).toBeVisible();
    expect(await noSidewaysScroll(page), mode).toBe(true);
  }
});
