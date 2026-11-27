import { expect, test, type Page } from '@playwright/test';
import { effectOfLines } from '../src/simulator/engine';
import { directionOf, SIDES, type Direction } from '../src/simulator/predict';
import { endlessCase, mistakesPlan, predictPlan, starterOrder } from '../src/simulator/plans';
import { findScene } from '../src/simulator/scenes';
import type { SimTransaction } from '../src/simulator/types';
import { levelSeed } from '../src/play/seed';
import { createProfile, headerXp, readStoredEvents } from './helpers';
import '../src/content/registry';

// The simulator of the accounting equation (src/simulator, components/simulator, /simulator). Most tests run with
// reduced motion, which plays every step as a fade and so quickly; one runs with full motion and sees the coins fly.
test.use({ reducedMotion: 'reduce' });

const scene = findScene('ae')!;
const AE = 'accounting-equation';
const SEED = 11;

/** Waits until the stage has played everything it has. */
const played = (page: Page) => expect(page.getByTestId('sim-stage')).toHaveAttribute('data-status', 'done', { timeout: 30_000 });
const noSidewaysScroll = (page: Page) => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);

/** Gives a prediction of the directions of a transaction: the right ones, or wrong ones for assets. */
async function predict(page: Page, tx: SimTransaction, right: boolean) {
  const e = effectOfLines(scene, tx.lines, tx.costOfSale ?? 0);
  for (const side of SIDES) {
    let d: Direction = directionOf(e[side]);
    if (!right && side === 'assets') d = d === 'up' ? 'down' : 'up';
    await page.getByTestId(`predict-${side}`).locator(`label:has([data-testid="predict-${side}-${d}"])`).click();
  }
}

test('watch: a transaction plays through, and the totals, the steps and the entry follow it', async ({ page }) => {
  await createProfile(page, 'Varun', { keepDeviceDefaults: true });
  await page.goto('/simulator');
  await expect(page.getByTestId('tank-assets-total')).toHaveText('₹2,85,000');
  await expect(page.getByTestId('sim-equation-line')).toHaveText('Assets ₹2,85,000 = Liabilities ₹85,000 + Capital ₹2,00,000');
  await page.getByTestId('watch-pick').selectOption('s.capital-cash');
  await played(page);
  await expect(page.getByTestId('tank-assets-total')).toHaveText('₹4,35,000');
  await expect(page.getByTestId('tank-capital-total')).toHaveText('₹3,50,000');
  await expect(page.getByTestId('band-cash-delta')).toContainText('+₹1,50,000');
  await expect(page.getByTestId('sim-balance')).toContainText('Balanced');
  await expect(page.getByTestId('sim-step-text')).toHaveCount(1);
  await expect(page.getByTestId('sim-entry')).toContainText('Cash A/c Dr.');
  await expect(page.getByTestId('sim-entry')).toContainText('To Capital A/c');
  await expect(page.getByTestId('sim-entry')).toContainText('1,50,000');
  await expect(page.getByTestId('sim-ledger')).toContainText('Cash A/c is an asset. It increases, so it is debited with ₹1,50,000.');
  await expect(page.getByTestId('sim-announce')).toContainText('Assets ₹4,35,000 = Liabilities ₹85,000 + Capital ₹3,50,000');
  // The next one carries on from these books; a sale shows the goods leaving stock at cost.
  await page.getByTestId('watch-pick').selectOption('s.sale-cash');
  await played(page);
  await expect(page.getByTestId('sim-step-text')).toHaveCount(2);
  await expect(page.getByTestId('tank-assets-total')).toHaveText('₹4,38,000');
  await expect(page.getByTestId('sim-explanation')).toContainText('profit of ₹3,000');
  expect(await noSidewaysScroll(page)).toBe(true);
});

test('predict: a right prediction earns XP, a wrong one is recorded and waits in Mistakes', async ({ page }) => {
  test.setTimeout(90_000);
  await createProfile(page, 'Varun', { keepDeviceDefaults: true });
  const [first, second] = starterOrder(scene, SEED);
  await page.goto(`/simulator?mode=predict&seed=${SEED}`);
  await expect(page.getByTestId('predict-transaction')).toHaveText(first.text);
  await expect(page.getByTestId('predict-check')).toBeDisabled();
  await predict(page, first, true);
  await page.getByTestId('predict-check').click();
  await played(page);
  await expect(page.getByTestId('predict-feedback')).toHaveAttribute('data-correct', 'true');
  await expect(page.getByTestId('predict-feedback')).toContainText('+10 XP');
  await expect.poll(() => headerXp(page)).toBe(10);
  await expect(page.getByTestId('sim-explanation')).toBeVisible();

  await page.getByTestId('predict-next').click();
  await expect(page.getByTestId('predict-transaction')).toHaveText(second.text);
  await predict(page, second, false);
  await page.getByTestId('predict-check').click();
  await played(page);
  await expect(page.getByTestId('predict-feedback')).toHaveAttribute('data-correct', 'false');
  await expect(page.getByTestId('predict-assets-mark')).toContainText('✗');
  await expect(page.getByTestId('predict-answered')).toHaveText('2');
  await expect(page.getByTestId('predict-right')).toHaveText('1');

  await expect.poll(async () => (await readStoredEvents(page)).attempts.length).toBe(2);
  const { attempts } = await readStoredEvents(page);
  // Stored by id, which says nothing of the order they were made in.
  expect(attempts.map((a) => `${a.questionId} ${a.topicId}`).sort()).toEqual([`sim:ae:${first.id} ${AE}`, `sim:ae:${second.id} ${AE}`].sort());
  await page.goto('/mistakes');
  await expect(page.getByTestId('mistake-item')).toHaveCount(1);
  await expect(page.getByTestId('mistake-item')).toHaveAttribute('data-question-id', `sim:ae:${second.id}`);
  await expect(page.getByTestId('mistake-prompt')).toContainText(second.text);
});

test('free play: a new business, a transaction of its own, one the books cannot take, and a story', async ({ page }) => {
  test.setTimeout(90_000);
  await createProfile(page, 'Varun', { keepDeviceDefaults: true });
  await page.goto('/simulator?mode=free');
  await page.getByTestId('free-new').click();
  await expect(page.getByTestId('tank-assets-total')).toHaveText('₹0');
  await page.getByTestId('free-event').selectOption('capital');
  await page.getByTestId('free-amount-amount').fill('75000');
  await expect(page.getByTestId('free-entry')).toContainText('75,000');
  await page.getByTestId('free-play').click();
  await played(page);
  await expect(page.getByTestId('tank-assets-total')).toHaveText('₹75,000');
  await expect(page.getByTestId('tank-capital-total')).toHaveText('₹75,000');
  await expect(page.getByTestId('sim-entry')).toContainText('To Capital A/c');
  // More rent than there is cash: refused, with the reason.
  await page.getByTestId('free-event').selectOption('pay-expense');
  await page.getByTestId('free-amount-amount').fill('90000');
  await expect(page.getByTestId('free-problem')).toContainText('Cash holds only ₹75,000');
  await expect(page.getByTestId('free-play')).toBeDisabled();
  // A story plays one transaction after another by itself.
  await page.getByTestId('free-story-stationery-month').click();
  await expect(page.getByTestId('free-story-bar')).toContainText('transaction 2 of 11', { timeout: 30_000 });
  await page.getByTestId('free-story-auto').click();
  await played(page);
  await expect(page.getByTestId('sim-balance')).toContainText('Balanced');
});

test('find the mistake: a one-sided error tips the equation into Suspense, and the correction clears it', async ({ page }) => {
  test.setTimeout(90_000);
  await createProfile(page, 'Varun', { keepDeviceDefaults: true });
  let seed = 1;
  while (!endlessCase(scene, seed, 0).oneSided) seed++;
  const c = endlessCase(scene, seed, 0);
  await page.goto(`/simulator?mode=mistakes&seed=${seed}`);
  await expect(page.getByTestId('mistake-happened')).toHaveText(c.happened);
  await expect(page.getByTestId('tank-suspense')).toHaveCount(0);
  await played(page);
  await expect(page.getByTestId('tank-suspense')).toBeVisible();
  await expect(page.getByTestId('sim-equation-line')).toContainText('Suspense');
  await expect(page.getByTestId('sim-balance')).toContainText('only with Suspense A/c');
  // The step before Suspense was put in: the equation did not hold.
  await expect(page.getByTestId('sim-step-text').filter({ hasText: 'The equation no longer holds' }).first()).toBeVisible();
  await page.getByTestId(`mistake-option-${c.correct}`).check();
  await page.getByTestId('mistake-check').click();
  await expect(page.getByTestId('mistake-feedback')).toHaveAttribute('data-correct', 'true');
  await expect(page.getByTestId('mistake-correction')).toContainText('Suspense A/c');
  await page.getByTestId('mistake-correct').click();
  await expect(page.getByTestId('mistake-restored')).toHaveAttribute('data-restored', 'true', { timeout: 30_000 });
  await expect(page.getByTestId('tank-suspense')).toHaveCount(0);
  await expect(page.getByTestId('sim-balance')).toHaveText('✓ Balanced.');
  await expect.poll(async () => (await readStoredEvents(page)).attempts.map((a) => a.questionId)).toEqual([`sim:ae:${c.id}`]);
});

test('with full motion coins fly between the tanks; with reduced motion nothing flies and the books still change', async ({ page }) => {
  await createProfile(page, 'Varun', { keepDeviceDefaults: true });
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.goto('/simulator');
  await page.getByTestId('watch-pick').selectOption('s.asset-credit');
  await expect.poll(() => page.locator('.sim-coin').count()).toBeGreaterThan(0);
  await played(page);
  await expect(page.locator('.sim-coin')).toHaveCount(0);
  await expect(page.getByTestId('tank-liabilities-total')).toHaveText('₹1,30,000');

  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.reload();
  // Each step is counted: no coin is ever drawn while it plays.
  await page.evaluate(() => {
    (window as unknown as { coins: number }).coins = 0;
    new MutationObserver((list) => {
      for (const m of list) for (const n of m.addedNodes) if (n instanceof HTMLElement && n.classList.contains('sim-coin')) (window as unknown as { coins: number }).coins++;
    }).observe(document.body, { childList: true, subtree: true });
  });
  await page.getByTestId('watch-pick').selectOption('s.asset-credit');
  await played(page);
  await expect(page.getByTestId('tank-liabilities-total')).toHaveText('₹1,30,000');
  expect(await page.evaluate(() => (window as unknown as { coins: number }).coins)).toBe(0);
});

test('keyboard only: a prediction is made and checked, and the stage replays from its keys', async ({ page }) => {
  test.setTimeout(60_000);
  await createProfile(page, 'Varun', { keepDeviceDefaults: true });
  const [first] = starterOrder(scene, SEED);
  const e = effectOfLines(scene, first.lines, first.costOfSale ?? 0);
  await page.goto(`/simulator?mode=predict&seed=${SEED}`);
  await expect(page.getByTestId('predict-transaction')).toHaveText(first.text);
  const order: Direction[] = ['up', 'down', 'same'];
  await page.getByTestId('predict-assets-up').focus();
  for (const side of SIDES) {
    // Space picks the radio button in focus; the arrow keys move along the group and pick as they go.
    await page.keyboard.press('Space');
    for (let i = 0; i < order.indexOf(directionOf(e[side])); i++) await page.keyboard.press('ArrowRight');
    await expect(page.getByTestId(`predict-${side}-${directionOf(e[side])}`)).toBeChecked();
    await page.keyboard.press('Tab');
  }
  await expect(page.getByTestId('predict-check')).toBeFocused();
  await page.keyboard.press('Enter');
  await played(page);
  await expect(page.getByTestId('predict-feedback')).toHaveAttribute('data-correct', 'true');
  await page.getByTestId('sim-stage').focus();
  await page.keyboard.press('r');
  await expect(page.getByTestId('sim-stage')).not.toHaveAttribute('data-status', 'done');
  await played(page);
  // Play and Step are off once everything has played: the next stop is Replay.
  await page.keyboard.press('Tab');
  await expect(page.getByTestId('sim-replay')).toBeFocused();
});

test('at 1280 px the sidebar has Simulator marked, and Practice and the Playground lead to it', async ({ page }, info) => {
  test.skip(info.project.name !== 'laptop', 'the laptop layout');
  await createProfile(page, 'Varun', { keepDeviceDefaults: true });
  await page.goto('/simulator');
  const sidebar = page.getByRole('complementary', { name: 'Sidebar' });
  await expect(sidebar.getByTestId('nav-simulator')).toHaveAttribute('aria-current', 'page');
  await expect(sidebar.locator('[aria-current="page"]')).toHaveCount(1);
  await expect(page.getByTestId('topbar-title')).toHaveText('Simulator');
  await page.goto('/practice');
  await page.getByTestId('hub-simulator').click();
  await expect(page).toHaveURL(/\/simulator$/);
  await page.goto('/playground');
  await page.getByTestId('playground-simulator').click();
  await expect(page).toHaveURL(/\/simulator$/);
});

test('at 360 px no mode scrolls sideways', async ({ page }) => {
  test.setTimeout(90_000);
  await page.setViewportSize({ width: 360, height: 740 });
  await createProfile(page, 'Varun', { keepDeviceDefaults: true });
  await page.goto('/simulator');
  await page.getByTestId('watch-pick').selectOption('s.discount-received');
  await played(page);
  expect(await noSidewaysScroll(page)).toBe(true);
  for (const mode of ['predict', 'free', 'mistakes']) {
    await page.goto(`/simulator?mode=${mode}&seed=${SEED}`);
    await expect(page.getByTestId(`sim-panel-${mode}`)).toBeVisible();
    await played(page);
    expect(await noSidewaysScroll(page), mode).toBe(true);
  }
});

test('the accounting equation has its two simulation levels after the lesson, and "Find the mistake" is played and passed', async ({ page }) => {
  test.setTimeout(150_000);
  // Every level open, so that "Find the mistake" can be started before "See the Equation Move" is passed.
  await createProfile(page, 'Varun', { unlockAll: true });
  await page.goto(`/topics/${AE}`);
  await expect(page.getByTestId('level-1')).toContainText('See the Equation Move');
  await expect(page.getByTestId('level-1')).toContainText('Simulation · 6 predictions');
  await expect(page.getByTestId('level-2')).toContainText('Find the Mistake');
  await expect(page.getByTestId('level-2')).toContainText('4 mistakes to find');
  await expect(page.getByTestId('level-3')).toContainText('The Equation and Its Rule');

  const cases = mistakesPlan(scene, levelSeed(902, 0), 4);
  await page.getByTestId('level-start-2').click();
  await expect(page).toHaveURL(new RegExp(`/play/${AE}-simulation-2$`));
  for (const [i, c] of cases.entries()) {
    await expect(page.getByTestId('mistake-happened')).toHaveText(c.happened);
    await played(page);
    await page.getByTestId(`mistake-option-${c.correct}`).check();
    await page.getByTestId('mistake-check').click();
    await page.getByTestId('mistake-correct').click();
    await expect(page.getByTestId('mistake-restored')).toHaveAttribute('data-restored', 'true', { timeout: 30_000 });
    await expect(page.getByTestId('sim-level-score')).toHaveText(`${i + 1}/4`);
    await page.getByTestId('mistake-next').click();
  }
  await expect(page.getByTestId('results')).toBeVisible();
  await expect.poll(async () => (await readStoredEvents(page)).levelResults.map((r) => [r.levelId, r.passed])).toEqual([[`${AE}-simulation-2`, true]]);
  const { attempts } = await readStoredEvents(page);
  expect(attempts.map((a) => a.levelId)).toEqual(Array(4).fill(`${AE}-simulation-2`));

  // "See the equation move" begins with transactions to watch, drawn from the seed of its first play.
  const { watch } = predictPlan(scene, levelSeed(901, 0), 2, 6);
  await page.goto(`/play/${AE}-simulation-1`);
  await expect(page.getByTestId('watch-transaction')).toHaveText(watch[0].text);
  await played(page);
  await page.getByTestId('sim-level-next').click();
  await expect(page.getByTestId('watch-transaction')).toHaveText(watch[1].text);
});
