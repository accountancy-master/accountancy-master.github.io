import { expect, test, type Page } from '@playwright/test';
import { askRng, boeAsk } from '../src/simulator/books-of-entry/tryit';
import { createProfile } from './helpers';

// The books-of-entry lab of the simulator (src/simulator/books-of-entry, components/simulator/labs/BooksOfEntryLab.tsx).
// With reduced motion every step fades, so the month plays quickly.
test.use({ reducedMotion: 'reduce' });

const LAB = '/simulator?lab=books-of-entry';
const T = 'lab-books-of-entry';
const SEED = 7;
const noSidewaysScroll = (page: Page) => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);

test('watch: the month is sorted into its books, the Cash Book balanced and every book posted', async ({ page }) => {
  test.setTimeout(120_000);
  await createProfile(page, 'Varun', { keepDeviceDefaults: true });
  await page.goto(LAB);
  await expect(page.getByTestId(`lab-books-of-entry`)).toBeVisible();
  await expect(page.getByTestId(`${T}-about`)).toContainText('Navya Electricals');
  // The first document: the imprest, into the Cash Book and the Petty Cash Book.
  await page.getByTestId(`${T}-step`).click();
  await expect(page.getByTestId(`${T}-went`)).toContainText('Cash Book');
  await expect(page.getByTestId(`${T}-book-petty`)).toHaveAttribute('data-lit', 'true');
  await page.getByTestId(`${T}-play`).click();
  await expect(page.getByTestId(`${T}-stage`)).toHaveAttribute('data-status', 'done', { timeout: 90_000 });
  await expect(page.getByTestId(`${T}-announce`)).toContainText('Journal Proper');
  await page.getByTestId(`${T}-open-cash`).click();
  await expect(page.getByTestId(`${T}-cash-balances`)).toContainText('cash in hand ₹19,500');
  await expect(page.getByTestId(`${T}-cash-balances`)).toContainText('balance ₹49,500');
  await expect(page.getByTestId(`${T}-cash-dr`)).toContainText('To Balance b/d');
  await page.getByTestId(`${T}-open-purchases`).click();
  await expect(page.getByTestId(`${T}-total-purchases`)).toContainText('Purchases A/c Dr.');
  await expect(page.getByTestId(`${T}-total-purchases`)).toContainText('36,000');
  // The last step posts the Journal Proper: discount allowed, among others, reaches its account.
  await expect(page.getByTestId(`${T}-posting`)).toHaveAttribute('data-book', 'journal');
  await expect(page.getByTestId(`${T}-ledger`)).toContainText('Discount Allowed A/c');
});

test('play: a wrong book is told why, GST changes the books, and the month end posts them', async ({ page }) => {
  test.setTimeout(90_000);
  await createProfile(page, 'Varun', { keepDeviceDefaults: true });
  await page.goto(LAB);
  await page.getByTestId(`${T}-mode-play`).click();
  // The imprest is not a Journal Proper entry; it is in the Cash Book and the Petty Cash Book.
  await page.getByTestId(`${T}-pick-journal`).click();
  await expect(page.getByTestId(`${T}-feedback`)).toHaveAttribute('data-correct', 'false');
  await page.getByTestId(`${T}-pick-cash`).click();
  await page.getByTestId(`${T}-pick-petty`).click();
  await expect(page.getByTestId(`${T}-feedback`)).toHaveAttribute('data-correct', 'true');
  await expect(page.getByTestId(`${T}-sorted`)).toHaveText('Sorted 1 of 18');
  // The purchase on credit goes to the Purchases Book.
  await page.getByTestId(`${T}-pick-purchases`).click();
  await expect(page.getByTestId(`${T}-sorted`)).toHaveText('Sorted 2 of 18');
  // GST within the state at 18%: ₹36,000 + CGST ₹3,240 + SGST ₹3,240 = ₹42,480.
  await page.getByTestId(`${T}-gst-intra`).click();
  await expect(page.getByTestId(`${T}-problem`)).toHaveCount(0);
  await page.getByTestId(`${T}-open-purchases`).click();
  await expect(page.getByTestId(`${T}-table-purchases`)).toContainText('42,480');
  await expect(page.getByTestId(`${T}-table-purchases`)).toContainText('Input CGST');
  await page.getByTestId(`${T}-sort-all`).click();
  await page.getByTestId(`${T}-end-step`).click();
  await expect(page.getByTestId(`${T}-end-now`)).toContainText('Cash Book balanced');
  await page.getByTestId(`${T}-end-step`).click();
  await expect(page.getByTestId(`${T}-posting`)).toContainText('Input CGST A/c');
  // More cash paid out than is in hand is refused.
  await page.getByTestId(`${T}-add-kind`).selectOption('expense');
  await page.getByTestId(`${T}-add-amount`).fill('900000');
  await page.getByTestId(`${T}-add-mode-cash`).click();
  await page.getByTestId(`${T}-add`).click();
  await expect(page.getByTestId(`${T}-problem`)).toContainText('cash in hand can never fall below nil');
});

test('try it: a wrong book is told why, a right one and a right balance are marked right', async ({ page }) => {
  await createProfile(page, 'Varun', { keepDeviceDefaults: true });
  await page.goto(`${LAB}&seed=${SEED}`);
  await page.getByTestId(`${T}-mode-try`).click();
  const first = boeAsk('which-book', askRng(SEED, 'which-book', 0));
  if (first.answer.type !== 'choice') throw new Error('a choice was expected');
  await expect(page.getByTestId(`${T}-try-prompt`)).toHaveText(first.prompt);
  const wrong = first.answer.options.find((o) => o.id !== (first.answer as { correct: string }).correct)!;
  await page.getByTestId(`${T}-try-option-${wrong.id}`).click();
  await page.getByTestId(`${T}-try-check`).click();
  await expect(page.getByTestId(`${T}-try-feedback`)).toHaveAttribute('data-correct', 'false');
  await expect(page.getByTestId(`${T}-try-feedback`)).toContainText(first.reason);
  await page.getByTestId(`${T}-try-next`).click();
  const second = boeAsk('which-book', askRng(SEED, 'which-book', 1));
  if (second.answer.type !== 'choice') throw new Error('a choice was expected');
  await page.getByTestId(`${T}-try-option-${second.answer.correct}`).click();
  await page.getByTestId(`${T}-try-check`).click();
  await expect(page.getByTestId(`${T}-try-feedback`)).toHaveAttribute('data-correct', 'true');
  await page.getByTestId(`${T}-kind-cash-balance`).click();
  const bal = boeAsk('cash-balance', askRng(SEED, 'cash-balance', 0));
  if (bal.answer.type !== 'number') throw new Error('a figure was expected');
  await page.getByTestId(`${T}-try-answer`).fill(String(bal.answer.value / 100));
  if (bal.answer.tag) await page.getByTestId(`${T}-try-tag-${bal.answer.tag.correct}`).click();
  await page.getByTestId(`${T}-try-check`).click();
  await expect(page.getByTestId(`${T}-try-feedback`)).toHaveAttribute('data-correct', 'true');
  await expect(page.getByTestId(`${T}-cash-balances`)).toBeVisible();
});

test('at 360 px no mode of the lab scrolls sideways', async ({ page }) => {
  test.setTimeout(60_000);
  await page.setViewportSize({ width: 360, height: 740 });
  await createProfile(page, 'Varun', { keepDeviceDefaults: true });
  await page.goto(LAB);
  for (let i = 0; i < 20; i++) await page.getByTestId(`${T}-step`).click();
  await expect(page.getByTestId(`${T}-stage`)).toHaveAttribute('data-shown', '20');
  expect(await noSidewaysScroll(page)).toBe(true);
  for (const mode of ['play', 'try']) {
    await page.getByTestId(`${T}-mode-${mode}`).click();
    await expect(page.getByTestId(`${T}-panel-${mode}`)).toBeVisible();
    expect(await noSidewaysScroll(page), mode).toBe(true);
  }
});
