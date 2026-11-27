import { expect, test, type Page } from '@playwright/test';
import { makeQuestion, type BalanceQuestion, type SideQuestion } from '../src/simulator/posting/tryit';
import { createProfile } from './helpers';

// The lab "posting" of the simulator (/simulator?lab=posting): the journal posted into T-accounts, the accounts
// balanced and the trial balance prepared. With reduced motion every step is a fade, so a walk-through plays quickly.
test.use({ reducedMotion: 'reduce' });

const SEED = 5;
const P = 'lab-posting';
const noSidewaysScroll = (page: Page) => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);

test('watch: the first month is posted, balanced and agrees in the trial balance', async ({ page }) => {
  test.setTimeout(90_000);
  await createProfile(page, 'Varun', { keepDeviceDefaults: true });
  await page.goto('/simulator?lab=posting');
  await expect(page.getByTestId(`${P}-mode-watch`)).toHaveAttribute('aria-pressed', 'true');
  // One step: the first line lands on the debit side of Cash A/c, and its L.F. is filled in.
  await page.getByTestId(`${P}-step`).click();
  await expect(page.getByTestId(`${P}-progress`)).toHaveText('Step 1 of 23');
  await expect(page.getByTestId(`${P}-lf-0.0`)).toHaveText('1');
  await expect(page.getByTestId(`${P}-now`)).toContainText('"To Capital A/c" ₹1,00,000');
  await expect(page.getByTestId(`${P}-now`)).toContainText('Cash A/c is an asset. It increases');
  await expect(page.getByTestId(`${P}-acc-cash`)).toContainText('To Capital A/c');
  await page.getByTestId(`${P}-speed-2`).click();
  await page.getByTestId(`${P}-play`).click();
  await expect(page.getByTestId(`${P}-stage`)).toHaveAttribute('data-status', 'done', { timeout: 60_000 });
  await expect(page.getByTestId(`${P}-acc-cash-cd`)).toContainText('By Balance c/d');
  await expect(page.getByTestId(`${P}-acc-cash-cd`)).toContainText('1,01,000');
  await expect(page.getByTestId(`${P}-acc-cash-bd`)).toContainText('To Balance b/d');
  await expect(page.getByTestId(`${P}-acc-creditor-rao-co-bd`)).toContainText('By Balance b/d');
  await expect(page.getByTestId(`${P}-tb-debit-total`)).toHaveText('1,37,000');
  await expect(page.getByTestId(`${P}-tb-credit-total`)).toHaveText('1,37,000');
  await expect(page.getByTestId(`${P}-tb-verdict`)).toContainText('The totals agree');
  await expect(page.getByTestId(`${P}-announce`)).toContainText('Step 23 of 23');
  expect(await noSidewaysScroll(page)).toBe(true);
});

test('play: a transaction added to the journal moves the trial balance; one that cannot happen is refused', async ({ page }) => {
  await createProfile(page, 'Varun', { keepDeviceDefaults: true });
  await page.goto('/simulator?lab=posting');
  await page.getByTestId(`${P}-mode-play`).click();
  await expect(page.getByTestId(`${P}-tb-debit-total`)).toHaveText('1,37,000');
  await page.getByTestId(`${P}-play-kind`).selectOption('cash-sale');
  await page.getByTestId(`${P}-play-amount`).fill('10,000');
  await page.getByTestId(`${P}-play-add`).click();
  await expect(page.getByTestId(`${P}-play-last`)).toContainText('Sold goods for cash, ₹10,000.');
  await expect(page.getByTestId(`${P}-tb-debit-total`)).toHaveText('1,47,000');
  await expect(page.getByTestId(`${P}-tb-credit-total`)).toHaveText('1,47,000');
  await expect(page.getByTestId(`${P}-acc-sales`)).toContainText('35,000');
  await page.getByTestId(`${P}-play-kind`).selectOption('rent');
  await page.getByTestId(`${P}-play-amount`).fill('5,00,000');
  await page.getByTestId(`${P}-play-add`).click();
  await expect(page.getByTestId(`${P}-play-problem`)).toContainText('not enough cash in hand');
  await expect(page.getByTestId(`${P}-tb-debit-total`)).toHaveText('1,47,000');
  // A supplier paid in full has no balance and is left out.
  await page.getByTestId(`${P}-play-ready-supplier-cleared`).click();
  await expect(page.getByTestId(`${P}-tb-row-creditor-rao-co`)).toHaveCount(0);
  await expect(page.getByTestId(`${P}-tb-debit-total`)).toHaveText('1,09,000');
});

test('try it: a line posted on the right side, a balance on the wrong side, and no sideways scroll at 360 px', async ({ page }) => {
  await createProfile(page, 'Varun', { keepDeviceDefaults: true });
  await page.setViewportSize({ width: 360, height: 740 });
  await page.goto(`/simulator?lab=posting&seed=${SEED}`);
  await page.getByTestId(`${P}-mode-try`).click();
  await expect(page.getByTestId(`${P}-try`)).toHaveAttribute('data-kind', 'side');

  const side = makeQuestion(SEED, 'side') as SideQuestion;
  await page.getByTestId(`${P}-try-side-${side.accounts.indexOf(side.answer.accountId)}-${side.answer.side}`).click();
  await page.getByTestId(`${P}-try-part-${side.particulars.indexOf(side.answer.particulars)}`).click();
  await page.getByTestId(`${P}-try-check`).click();
  await expect(page.getByTestId(`${P}-try-feedback`)).toHaveAttribute('data-correct', 'true');
  expect(await noSidewaysScroll(page)).toBe(true);

  await page.getByTestId(`${P}-try-next`).click();
  await expect(page.getByTestId(`${P}-try`)).toHaveAttribute('data-kind', 'balance');
  const bal = makeQuestion(SEED + 1, 'balance') as BalanceQuestion;
  const a = bal.account;
  // Balance c/d on the larger side (or a balance where there is none): wrong.
  await page.getByTestId(`${P}-try-written-${a.balance ? a.balance.side : 'Dr'}`).click();
  await page.getByTestId(`${P}-try-amount`).fill(String((a.balance?.amount ?? a.total) / 100));
  await page.getByTestId(`${P}-try-check`).click();
  await expect(page.getByTestId(`${P}-try-feedback`)).toHaveAttribute('data-correct', 'false');
  await expect(page.getByTestId(`${P}-try-feedback`)).toContainText(a.balance ? 'shorter side' : 'equal');

  await page.getByTestId(`${P}-try-next`).click();
  await expect(page.getByTestId(`${P}-try`)).toHaveAttribute('data-kind', 'column');
  expect(await noSidewaysScroll(page)).toBe(true);
});
