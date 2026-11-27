import { expect, test, type Page } from '@playwright/test';
import { formatINR, rupees } from '../src/engine/money';
import { ISSUE_EXAMPLES } from '../src/simulator/shares/examples';
import { issueShares } from '../src/simulator/shares/issue';
import { sharesQuestions } from '../src/simulator/shares/questions';
import { createProfile } from './helpers';

// The lab "A share from application to forfeiture" (/simulator?lab=shares): the walk-through of an issue at a
// premium, a reissue price changed in the sandbox, a Try-it question answered wrong and then right, and the page at
// 360 px. With reduced motion, so that every step is a fade.
test.use({ reducedMotion: 'reduce' });

const SEED = 5;
const S = 'lab-shares';
const noSidewaysScroll = (page: Page) => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);

test('shares lab: watch, play, try it, and a phone', async ({ page }) => {
  test.setTimeout(90_000);
  await createProfile(page, 'Zoya');
  await page.goto(`/simulator?lab=shares&seed=${SEED}`);
  await expect(page.getByTestId(S)).toBeVisible();

  // Watch: the issue at a premium plays through at double speed.
  await page.getByTestId(`${S}-speed-2`).click();
  await page.getByTestId(`${S}-play`).click();
  await expect(page.getByTestId(`${S}-stage`)).toHaveAttribute('data-status', 'done', { timeout: 40_000 });
  await expect(page.getByTestId(`${S}-pot-bank-amount`)).toHaveText('₹5,98,700 Dr');
  await expect(page.getByTestId(`${S}-pot-forfeited-amount`)).toHaveText('₹300 Cr');
  await expect(page.getByTestId(`${S}-pot-reserve-amount`)).toHaveText('₹400 Cr');
  await expect(page.getByTestId(`${S}-share-capital`)).toHaveText('₹4,99,300');
  await expect(page.getByTestId(`${S}-note`)).toContainText('Add: Forfeited Shares A/c');
  await expect(page.getByTestId(`${S}-journal`)).toContainText('To Capital Reserve A/c');
  await expect(page.getByTestId(`${S}-journal-entry`)).toHaveCount(issueShares(ISSUE_EXAMPLES[0].input).steps.length);
  await expect(page.getByTestId(`${S}-announce`)).toContainText('Capital Reserve');

  // Play: a higher reissue price means a smaller discount and a larger capital reserve.
  await page.getByTestId(`${S}-mode-play`).click();
  await page.getByTestId(`${S}-re-price`).fill('9');
  const reserve = issueShares({ ...ISSUE_EXAMPLES[0].input, reissue: { shares: 400, price: rupees(9) } }).figures.capitalReserve;
  await expect(page.getByTestId(`${S}-pot-reserve-amount`)).toHaveText(`${formatINR(reserve)} Cr`);

  // Try it: the first question answered wrong, the next one right.
  const qs = sharesQuestions(SEED);
  await page.getByTestId(`${S}-mode-try`).click();
  const first = qs[0].answer;
  if (first.type !== 'amount') throw new Error('The first question asks for an amount.');
  await page.getByTestId(`${S}-try-answer`).fill(String(first.value / 100 + 500));
  await page.getByTestId(`${S}-try-check`).click();
  await expect(page.getByTestId(`${S}-try-feedback`)).toHaveAttribute('data-correct', 'false');
  await page.getByTestId(`${S}-try-next`).click();
  const second = qs[1].answer;
  if (second.type !== 'amount') throw new Error('The second question asks for an amount.');
  await page.getByTestId(`${S}-try-answer`).fill(String(second.value / 100));
  await page.getByTestId(`${S}-try-check`).click();
  await expect(page.getByTestId(`${S}-try-feedback`)).toHaveAttribute('data-correct', 'true');

  // A phone 360 px wide: nothing scrolls sideways, in any mode.
  await page.setViewportSize({ width: 360, height: 740 });
  expect(await noSidewaysScroll(page)).toBe(true);
  await page.getByTestId(`${S}-mode-play`).click();
  expect(await noSidewaysScroll(page)).toBe(true);
  await page.getByTestId(`${S}-mode-watch`).click();
  await expect(page.getByTestId(`${S}-stage`)).toBeVisible();
  expect(await noSidewaysScroll(page)).toBe(true);
});
