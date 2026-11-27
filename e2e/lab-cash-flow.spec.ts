import { expect, test, type Page } from '@playwright/test';
import { createRng } from '../src/engine/rng';
import { statementAmount } from '../src/simulator/cash-flow/model';
import { nextQuestion, trySeed, type FigureQuestion } from '../src/simulator/cash-flow/tryit';
import { createProfile } from './helpers';

// The lab "Where the cash came from and went" (src/simulator/cash-flow, components/simulator/labs/cash-flow).
test.use({ reducedMotion: 'reduce' });

const SEED = 11;
const P = 'lab-cash-flow';
const noSidewaysScroll = (page: Page) => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);

test('watch: the year is written into the statement step by step, and the reservoir ends at the closing cash', async ({ page }) => {
  test.setTimeout(90_000);
  await createProfile(page, 'Varun', { keepDeviceDefaults: true });
  await page.goto(`/simulator?lab=cash-flow&seed=${SEED}`);
  await expect(page.getByTestId('lab-cash-flow')).toBeVisible();
  await expect(page.getByTestId(`${P}-cash`)).toHaveText('₹63,000');
  await expect(page.getByTestId(`${P}-pipe-operating`)).toHaveAttribute('data-state', 'waiting');
  // Play writes the first figure by itself; then pause and step through the rest.
  await page.getByTestId(`${P}-play`).click();
  await expect(page.getByTestId(`${P}-progress`)).toHaveText('Step 1 of 27', { timeout: 10_000 });
  await expect(page.getByTestId(`${P}-step-headline`)).toHaveText('Net profit before tax and extraordinary items: ₹3,20,000');
  await page.getByTestId(`${P}-pause`).click();
  await expect(page.getByTestId(`${P}-pipe-operating`)).toHaveAttribute('data-state', 'working');
  await page.getByTestId(`${P}-step`).click();
  await expect(page.getByTestId(`${P}-step-headline`)).toHaveText('Add: Depreciation on machinery, ₹60,000');
  await expect(page.getByTestId(`${P}-row-depreciation`)).toHaveAttribute('data-shown', 'true');
  await expect(page.getByTestId(`${P}-row-closing`)).toHaveAttribute('data-shown', 'false');
  while ((await page.getByTestId(`${P}-progress`).textContent()) !== 'Step 27 of 27') await page.getByTestId(`${P}-step`).click();
  await expect(page.getByTestId(`${P}-amount-net-operating`)).toHaveText('3,32,000');
  await expect(page.getByTestId(`${P}-amount-net-investing`)).toHaveText('(3,55,000)');
  await expect(page.getByTestId(`${P}-amount-net-financing`)).toHaveText('60,000');
  await expect(page.getByTestId(`${P}-amount-closing`)).toHaveText('1,00,000');
  await expect(page.getByTestId(`${P}-cash`)).toHaveText('₹1,00,000');
  await expect(page.getByTestId(`${P}-pipe-investing-text`)).toHaveText('−₹3,55,000 flows out');
  await expect(page.getByTestId(`${P}-play`)).toContainText('Play again');
});

test('play: a ready year, and a figure changed on its slider', async ({ page }) => {
  await createProfile(page, 'Varun', { keepDeviceDefaults: true });
  await page.goto(`/simulator?lab=cash-flow&seed=${SEED}`);
  await page.getByTestId(`${P}-mode-play`).click();
  await page.getByTestId(`${P}-example-loss`).click();
  await expect(page.getByTestId(`${P}-amount-npbt`)).toHaveText('(40,000)');
  await expect(page.getByTestId(`${P}-amount-net-operating`)).toHaveText('84,000');
  await expect(page.getByTestId(`${P}-amount-closing`)).toHaveText('40,000');
  // Trade receivables end at ₹1,70,000 instead of ₹1,10,000: a rise of ₹20,000 from ₹1,50,000 where there was a fall of ₹40,000.
  await page.getByTestId(`${P}-fig-wc-tradeReceivables-close`).fill(String(170000 * 100));
  await expect(page.getByTestId(`${P}-fig-wc-tradeReceivables-close-value`)).toHaveText('₹1,70,000');
  await expect(page.getByTestId(`${P}-row-wc-tradeReceivables`)).toContainText('Increase in trade receivables');
  await expect(page.getByTestId(`${P}-amount-wc-tradeReceivables`)).toHaveText('(20,000)');
  await expect(page.getByTestId(`${P}-amount-cgo`)).toHaveText('34,000');
  await expect(page.getByTestId(`${P}-amount-net-operating`)).toHaveText('24,000');
  // The cash would fall below nil: said in words.
  await expect(page.getByTestId(`${P}-amount-closing`)).toHaveText('(20,000)');
  await expect(page.getByTestId(`${P}-short`)).toBeVisible();
  await page.getByTestId(`${P}-new`).click();
  await expect(page.getByTestId(`${P}-example-loss`)).toHaveAttribute('aria-pressed', 'false');
});

test('try it: an activity answered right and then wrong, and a figure worked out', async ({ page }) => {
  await createProfile(page, 'Varun', { keepDeviceDefaults: true });
  await page.goto(`/simulator?lab=cash-flow&seed=${SEED}`);
  await page.getByTestId(`${P}-mode-try`).click();
  const rng = createRng(trySeed(SEED, 'activity'));
  const first = nextQuestion('activity', rng);
  const second = nextQuestion('activity', rng);
  if (first.kind === 'figure' || second.kind === 'figure') throw new Error('expected choice questions');
  await expect(page.getByTestId(`${P}-try-item`)).toHaveText(first.item);
  await page.getByTestId(`${P}-try-option-${first.answer}`).click();
  await expect(page.getByTestId(`${P}-try-feedback`)).toHaveAttribute('data-correct', 'true');
  await expect(page.getByTestId(`${P}-try-feedback`)).toContainText(first.why);
  await page.getByTestId(`${P}-try-next`).click();
  await expect(page.getByTestId(`${P}-try-item`)).toHaveText(second.item);
  const wrong = second.options.find((o) => o.id !== second.answer)!.id;
  await page.getByTestId(`${P}-try-option-${wrong}`).click();
  await expect(page.getByTestId(`${P}-try-feedback`)).toHaveAttribute('data-correct', 'false');
  await expect(page.getByTestId(`${P}-try-option-${second.answer}`)).toHaveAttribute('data-mark', 'right');
  await expect(page.getByTestId(`${P}-try-score`)).toHaveText('1 right of 2 (not recorded)');

  await page.getByTestId(`${P}-kind-figure`).click();
  const figure = nextQuestion('figure', createRng(trySeed(SEED, 'figure'))) as FigureQuestion;
  await expect(page.getByTestId(`${P}-amount-${figure.target}`)).toHaveText('?');
  await page.getByTestId(`${P}-try-answer`).fill(statementAmount(figure.answer));
  await page.getByTestId(`${P}-try-check`).click();
  await expect(page.getByTestId(`${P}-try-feedback`)).toHaveAttribute('data-correct', 'true');
  await expect(page.getByTestId(`${P}-amount-${figure.target}`)).toHaveText(statementAmount(figure.answer));
});

test('at 360 px no mode scrolls sideways', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 740 });
  await createProfile(page, 'Varun', { keepDeviceDefaults: true });
  await page.goto(`/simulator?lab=cash-flow&seed=${SEED}`);
  await page.getByTestId(`${P}-step`).click();
  expect(await noSidewaysScroll(page)).toBe(true);
  for (const mode of ['play', 'try']) {
    await page.getByTestId(`${P}-mode-${mode}`).click();
    await expect(page.getByTestId(`${P}-panel-${mode}`)).toBeVisible();
    expect(await noSidewaysScroll(page), mode).toBe(true);
  }
  await page.getByTestId(`${P}-kind-figure`).click();
  expect(await noSidewaysScroll(page)).toBe(true);
});
