import { expect, test, type Page } from '@playwright/test';
import { MEERA } from '../src/simulator/final-accounts/examples';
import { SPOTS } from '../src/simulator/final-accounts/model';
import { tryRound } from '../src/simulator/final-accounts/tryit';
import { createProfile } from './helpers';

// The lab "From trial balance to final accounts" (src/simulator/final-accounts, components/simulator/labs). With
// reduced motion every arrival fades in place, so the steps can be played quickly.
test.use({ reducedMotion: 'reduce' });

const T = 'lab-final-accounts';
const SEED = 7;
const noSidewaysScroll = (page: Page) => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);

async function open(page: Page, query = '') {
  await createProfile(page, 'Meena', { keepDeviceDefaults: true });
  await page.goto(`/simulator?lab=final-accounts${query}`);
  await expect(page.getByTestId(`lab-final-accounts`)).toBeVisible();
}

/** Steps the walk-through to its last step. */
async function stepToEnd(page: Page) {
  const now = page.getByTestId(`${T}-now`);
  const step = page.getByTestId(`${T}-step`);
  while (await step.isEnabled()) {
    const at = Number(await now.getAttribute('data-step'));
    await step.click();
    await expect(now).not.toHaveAttribute('data-step', String(at));
  }
}

test('watch: the trial balance goes to the three statements, then the adjustments land where they belong', async ({ page }) => {
  await open(page);
  await expect(page.getByTestId(`${T}-now`)).toContainText('₹5,98,000');
  await expect(page.getByTestId(`${T}-sum-gross`)).toContainText('not found yet');
  // Play moves on by itself; Pause stops it.
  await page.getByTestId(`${T}-play`).click();
  await expect(page.getByTestId(`${T}-now`)).toHaveAttribute('data-step', '1', { timeout: 15_000 });
  await page.getByTestId(`${T}-pause`).click();
  await expect(page.getByTestId(`${T}-tb-purchases`)).toHaveAttribute('data-placed', 'true');
  await expect(page.getByTestId(`${T}-row-tr-purchases`)).toContainText('Less: Purchases Return');
  await stepToEnd(page);
  await expect(page.getByTestId(`${T}-sum-gross`)).toContainText('Gross profit ₹1,00,000');
  await expect(page.getByTestId(`${T}-sum-net`)).toContainText('Net profit ₹52,000');
  await expect(page.getByTestId(`${T}-sum-bs`)).toHaveAttribute('data-agrees', 'true');
  await expect(page.getByTestId(`${T}-sum-bs`)).toContainText('₹2,73,000 = ₹2,73,000');
  await expect(page.getByTestId(`${T}-row-tr-gp`)).toContainText('To Gross Profit c/d');
  await expect(page.getByTestId(`${T}-row-bs-capital`)).toContainText('Add: Net Profit');
  await expect(page.getByTestId(`${T}-announce`)).toContainText('net profit of ₹52,000');

  // Part two: one adjustment a step, and the Balance Sheet agrees after each.
  await page.getByTestId(`${T}-watch-part-two`).click();
  await page.getByTestId(`${T}-step`).click();
  await expect(page.getByTestId(`${T}-step-effects`)).toContainText('Outstanding Salaries ₹4,000, a current liability');
  await expect(page.getByTestId(`${T}-row-pl-salaries`)).toContainText('Add: Outstanding');
  await expect(page.getByTestId(`${T}-row-bs-outstanding-salaries`)).toContainText('Outstanding Salaries');
  await expect(page.getByTestId(`${T}-sum-net`)).toContainText('Net profit ₹48,000');
  await expect(page.getByTestId(`${T}-sum-bs`)).toHaveAttribute('data-agrees', 'true');
  await stepToEnd(page);
  await expect(page.getByTestId(`${T}-sum-gross`)).toContainText('Gross profit ₹1,09,000');
  await expect(page.getByTestId(`${T}-sum-net`)).toContainText('Net profit ₹31,500');
  await expect(page.getByTestId(`${T}-sum-bs`)).toContainText('₹2,71,650 = ₹2,71,650');
  await expect(page.getByTestId(`${T}-row-pl-commission`)).toContainText("To Manager's Commission");
  await expect(page.getByTestId(`${T}-row-bs-claim`)).toContainText('Insurance Claim Receivable');
  // Replay starts again from the first step.
  await page.getByTestId(`${T}-replay`).click();
  await page.getByTestId(`${T}-pause`).click();
  expect(Number(await page.getByTestId(`${T}-now`).getAttribute('data-step'))).toBeLessThan(2);
});

test('play: an adjustment switched on and a figure changed move the profit, and the Balance Sheet still agrees', async ({ page }) => {
  await open(page, `&seed=${SEED}`);
  await page.getByTestId(`${T}-mode-play`).click();
  await expect(page.getByTestId(`${T}-sum-net`)).toContainText('Net profit ₹52,000');
  await page.getByTestId(`${T}-toggle-outstanding-salaries`).check();
  await expect(page.getByTestId(`${T}-sum-net`)).toContainText('Net profit ₹48,000');
  await expect(page.getByTestId(`${T}-play-said`)).toContainText('Net profit falls from ₹52,000 to ₹48,000');
  await page.getByTestId(`${T}-input-closingStock-amount`).fill('60000');
  await expect(page.getByTestId(`${T}-sum-gross`)).toContainText('Gross profit ₹1,10,000');
  await expect(page.getByTestId(`${T}-sum-bs`)).toContainText('₹2,83,000 = ₹2,83,000');
  // A hard year: the closing rows stand on the other side.
  await page.getByTestId(`${T}-play-example-kabir`).click();
  await expect(page.getByTestId(`${T}-sum-gross`)).toContainText('Gross loss ₹5,000');
  await expect(page.getByTestId(`${T}-row-tr-gl`)).toContainText('By Gross Loss c/d');
  await page.getByTestId(`${T}-play-new`).click();
  await expect(page.getByTestId(`${T}-sum-bs`)).toHaveAttribute('data-agrees', 'true');
});

test('try it: answered right and wrong, each with its reason, and the picture shows the answer', async ({ page }) => {
  const round = tryRound(MEERA, SEED);
  await open(page, `&seed=${SEED}`);
  await page.getByTestId(`${T}-mode-try`).click();
  const card = page.getByTestId(`${T}-try`);
  const feedback = page.getByTestId(`${T}-try-feedback`);

  for (const [i, q] of round.slice(0, 4).entries()) {
    await expect(card).toHaveAttribute('data-question', q.id);
    const right = i % 2 === 1;
    if (q.kind === 'where') {
      await expect(page.getByTestId(`${T}-tb-${q.item}`)).toHaveAttribute('data-placed', 'false');
      const spot = right ? q.answer : SPOTS.find((s) => s !== q.answer)!;
      await page.getByTestId(`${T}-try-spot-${spot}`).click();
      await expect(page.getByTestId(`${T}-tb-${q.item}`)).toHaveAttribute('data-placed', 'true');
    } else if (q.kind === 'effects') {
      const rights = q.options.filter((o) => o.right).map((o) => o.id);
      const ids = right ? rights : [...rights.slice(1), q.options.find((o) => !o.right)!.id];
      for (const id of ids) await page.getByTestId(`${T}-try-option-${id}`).click();
      await page.getByTestId(`${T}-try-check`).click();
    } else {
      await expect(page.getByTestId(`${T}-sum-${q.level}`)).toContainText('not found yet');
      await page.getByTestId(`${T}-try-answer`).fill(String((right ? q.answer : q.mistakes[0].value) / 100));
      await page.getByTestId(`${T}-try-check`).click();
      await expect(page.getByTestId(`${T}-sum-${q.level}`)).not.toContainText('not found yet');
    }
    await expect(feedback).toHaveAttribute('data-correct', right ? 'true' : 'false');
    await expect(feedback).not.toBeEmpty();
    if (!right && q.kind === 'figure') await expect(feedback).toContainText(q.mistakes[0].why);
    await page.getByTestId(`${T}-try-next`).click();
  }
  await expect(page.getByTestId(`${T}-try-score`)).toContainText('2 right of 4');
});

test('no sideways scroll at 360 px in any mode', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 760 });
  await open(page);
  await page.getByTestId(`${T}-step`).click();
  expect(await noSidewaysScroll(page)).toBe(true);
  await page.getByTestId(`${T}-watch-part-two`).click();
  await stepToEnd(page);
  expect(await noSidewaysScroll(page)).toBe(true);
  await page.getByTestId(`${T}-mode-play`).click();
  await page.getByTestId(`${T}-play-all`).click();
  expect(await noSidewaysScroll(page)).toBe(true);
  await page.getByTestId(`${T}-mode-try`).click();
  expect(await noSidewaysScroll(page)).toBe(true);
});
