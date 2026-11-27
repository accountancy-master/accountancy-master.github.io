import { expect, test, type Page } from '@playwright/test';
import { askRng, irAsk } from '../src/simulator/incomplete-records/tryit';
import { createProfile } from './helpers';

// The incomplete-records lab of the simulator (src/simulator/incomplete-records,
// components/simulator/labs/IncompleteRecordsLab.tsx). With reduced motion every step fades.
test.use({ reducedMotion: 'reduce' });

const LAB = '/simulator?lab=incomplete-records';
const T = 'lab-incomplete-records';
const SEED = 7;
const noSidewaysScroll = (page: Page) => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);

test('watch: both statements of affairs, the capital ladder and the adjustments to the net profit', async ({ page }) => {
  test.setTimeout(90_000);
  await createProfile(page, 'Varun', { keepDeviceDefaults: true });
  await page.goto(LAB);
  await expect(page.getByTestId(T)).toBeVisible();
  await expect(page.getByTestId(`${T}-about`)).toContainText('Menon Hardware');
  for (let i = 0; i < 3; i++) await page.getByTestId(`${T}-step`).click();
  await expect(page.getByTestId(`${T}-capital-open`)).toHaveText('₹2,45,000');
  await page.getByTestId(`${T}-play`).click();
  await expect(page.getByTestId(`${T}-stage`)).toHaveAttribute('data-status', 'done', { timeout: 60_000 });
  await expect(page.getByTestId(`${T}-capital-close`)).toHaveText('₹2,85,000');
  await expect(page.getByTestId(`${T}-privates`)).toContainText('residential flat');
  await expect(page.getByTestId(`${T}-before`)).toContainText('Profit ₹64,000');
  await expect(page.getByTestId(`${T}-net`)).toContainText('Net profit ₹40,800');
  await expect(page.getByTestId(`${T}-profit-statement`)).toContainText('Less: Interest on capital');
  await expect(page.getByTestId(`${T}-announce`)).toContainText('a profit of ₹40,800');
  // The loss example.
  await page.getByTestId(`${T}-example-sheikh`).click();
  await page.getByTestId(`${T}-play`).click();
  await expect(page.getByTestId(`${T}-stage`)).toHaveAttribute('data-status', 'done', { timeout: 60_000 });
  await expect(page.getByTestId(`${T}-net`)).toContainText('Net loss ₹18,500');
});

test('play: a changed figure moves the capital and the profit', async ({ page }) => {
  await createProfile(page, 'Varun', { keepDeviceDefaults: true });
  await page.goto(LAB);
  await page.getByTestId(`${T}-mode-play`).click();
  await expect(page.getByTestId(`${T}-net`)).toContainText('₹40,800');
  // Closing stock ₹1,60,000 → ₹2,00,000: the closing capital and the profit rise by ₹40,000.
  await page.getByTestId(`${T}-in-stock-close`).fill('200000');
  await expect(page.getByTestId(`${T}-capital-close`)).toHaveText('₹3,25,000');
  await expect(page.getByTestId(`${T}-summary`)).toContainText('a profit of ₹1,04,000');
  await expect(page.getByTestId(`${T}-net`)).toContainText('₹80,800');
  // Liabilities beyond the assets: refused, the picture keeps the last figures.
  await page.getByTestId(`${T}-in-creditors-open`).fill('900000');
  await expect(page.getByTestId(`${T}-problem`)).toContainText('no capital to begin with');
  await expect(page.getByTestId(`${T}-capital-open`)).toHaveText('₹2,45,000');
});

test('try it: a wrong capital is told why, a right one and a right place are marked right', async ({ page }) => {
  await createProfile(page, 'Varun', { keepDeviceDefaults: true });
  await page.goto(`${LAB}&seed=${SEED}`);
  await page.getByTestId(`${T}-mode-try`).click();
  const first = irAsk('capital', askRng(SEED, 'capital', 0));
  await expect(page.getByTestId(`${T}-try-prompt`)).toHaveText(first.prompt);
  await page.getByTestId(`${T}-try-answer`).fill('1');
  await page.getByTestId(`${T}-try-check`).click();
  await expect(page.getByTestId(`${T}-try-feedback`)).toHaveAttribute('data-correct', 'false');
  await expect(page.getByTestId(`${T}-try-feedback`)).toContainText(first.reason);
  await page.getByTestId(`${T}-try-next`).click();
  const second = irAsk('capital', askRng(SEED, 'capital', 1));
  if (second.answer.type !== 'number') throw new Error('a figure was expected');
  await page.getByTestId(`${T}-try-answer`).fill(String(second.answer.value / 100));
  await page.getByTestId(`${T}-try-check`).click();
  await expect(page.getByTestId(`${T}-try-feedback`)).toHaveAttribute('data-correct', 'true');
  await page.getByTestId(`${T}-kind-where`).click();
  const where = irAsk('where', askRng(SEED, 'where', 0));
  if (where.answer.type !== 'choice') throw new Error('a choice was expected');
  await page.getByTestId(`${T}-try-option-${where.answer.correct}`).click();
  await page.getByTestId(`${T}-try-check`).click();
  await expect(page.getByTestId(`${T}-try-feedback`)).toHaveAttribute('data-correct', 'true');
});

test('at 360 px no mode of the lab scrolls sideways', async ({ page }) => {
  test.setTimeout(60_000);
  await page.setViewportSize({ width: 360, height: 740 });
  await createProfile(page, 'Varun', { keepDeviceDefaults: true });
  await page.goto(LAB);
  for (let i = 0; i < 15; i++) await page.getByTestId(`${T}-step`).click();
  await expect(page.getByTestId(`${T}-stage`)).toHaveAttribute('data-shown', '15');
  expect(await noSidewaysScroll(page)).toBe(true);
  for (const mode of ['play', 'try']) {
    await page.getByTestId(`${T}-mode-${mode}`).click();
    await expect(page.getByTestId(`${T}-panel-${mode}`)).toBeVisible();
    expect(await noSidewaysScroll(page), mode).toBe(true);
  }
});
