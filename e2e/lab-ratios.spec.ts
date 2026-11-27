import { expect, test, type Page } from '@playwright/test';
import { createRng } from '../src/engine/rng';
import { decimal } from '../src/simulator/ratios/model';
import { nextQuestion, trySeed } from '../src/simulator/ratios/tryit';
import { createProfile } from './helpers';

// The lab "Ratios on the dials" (src/simulator/ratios, components/simulator/labs/ratios).
test.use({ reducedMotion: 'reduce' });

const SEED = 11;
const P = 'lab-ratios';
const noSidewaysScroll = (page: Page) => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);

test('watch: every dial in turn, then transactions moving the needles', async ({ page }) => {
  test.setTimeout(90_000);
  await createProfile(page, 'Varun', { keepDeviceDefaults: true });
  await page.goto(`/simulator?lab=ratios&seed=${SEED}`);
  await expect(page.getByTestId(`${P}-value-current`)).toHaveText('2 : 1');
  await page.getByTestId(`${P}-play`).click();
  await expect(page.getByTestId(`${P}-progress`)).toHaveText('Step 1 of 19', { timeout: 10_000 });
  await page.getByTestId(`${P}-pause`).click();
  await page.getByTestId(`${P}-step`).click();
  await expect(page.getByTestId(`${P}-step-headline`)).toHaveText('Current ratio: 2 : 1');
  await expect(page.getByTestId(`${P}-focus-value`)).toHaveText('2 : 1');
  // Its terms are marked in the balance sheet.
  await expect(page.getByTestId(`${P}-line-inventories`)).toHaveAttribute('data-tag', 'top');
  await expect(page.getByTestId(`${P}-line-tradePayables`)).toHaveAttribute('data-tag', 'bottom');
  await page.getByTestId(`${P}-step`).click();
  await expect(page.getByTestId(`${P}-step-headline`)).toHaveText('Quick ratio: 1.13 : 1');
  await expect(page.getByTestId(`${P}-line-inventories`)).not.toHaveAttribute('data-tag', 'top');
  while ((await page.getByTestId(`${P}-progress`).textContent()) !== 'Step 17 of 19') await page.getByTestId(`${P}-step`).click();
  await expect(page.getByTestId(`${P}-step-headline`)).toHaveText('The company paid ₹60,000 to its trade payables by cheque: the current ratio is now 2.25 : 1');
  await expect(page.getByTestId(`${P}-change-current`)).toHaveText('▲ up from 2 : 1');
  await expect(page.getByTestId(`${P}-delta-cash`)).toHaveText('▼ −₹60,000');
  await page.getByTestId(`${P}-step`).click();
  await page.getByTestId(`${P}-step`).click();
  await expect(page.getByTestId(`${P}-value-current`)).toHaveText('2.39 : 1');
  await expect(page.getByTestId(`${P}-value-debtEquity`)).toHaveText('0.7 : 1');
  await expect(page.getByTestId(`${P}-change-debtEquity`)).toHaveText('▲ up from 0.5 : 1');
  await expect(page.getByTestId(`${P}-play`)).toContainText('Play again');
});

test('play: a figure changed on its slider, and a transaction played on the figures', async ({ page }) => {
  await createProfile(page, 'Varun', { keepDeviceDefaults: true });
  await page.goto(`/simulator?lab=ratios&seed=${SEED}`);
  await page.getByTestId(`${P}-mode-play`).click();
  await page.getByTestId(`${P}-group-assets`).locator('summary').click();
  // ₹60,000 more of inventories, paid out of cash: the current ratio stays, the quick ratio falls.
  await page.getByTestId(`${P}-fig-inventories`).fill(String(300000 * 100));
  await expect(page.getByTestId(`${P}-fig-inventories-value`)).toHaveText('₹3,00,000');
  await expect(page.getByTestId(`${P}-value-current`)).toHaveText('2 : 1');
  await expect(page.getByTestId(`${P}-value-quick`)).toHaveText('0.93 : 1');
  // Only ₹30,000 of cash is left, so ₹50,000 cannot be paid to the trade payables.
  await expect(page.getByTestId(`${P}-deal-play`)).toBeDisabled();
  await page.getByTestId(`${P}-deal`).selectOption('issueShares');
  await page.getByTestId(`${P}-deal-play`).click();
  await expect(page.getByTestId(`${P}-value-current`)).toHaveText('2.17 : 1');
  await expect(page.getByTestId(`${P}-change-current`)).toHaveText('▲ up from 2 : 1');
  await expect(page.getByTestId(`${P}-value-debtEquity`)).toHaveText('0.48 : 1');
  await expect(page.getByTestId(`${P}-deal-result`)).toContainText('issued equity shares for ₹50,000');
  await page.getByTestId(`${P}-undo`).click();
  await expect(page.getByTestId(`${P}-value-current`)).toHaveText('2 : 1');
  // A dial pressed is shown large, with its terms.
  await page.getByTestId(`${P}-dial-roi`).click();
  await expect(page.getByTestId(`${P}-focus`)).toContainText('Return on investment');
  await expect(page.getByTestId(`${P}-focus-value`)).toHaveText('17.33%');
});

test('try it: an effect answered right and then wrong, and a ratio worked out', async ({ page }) => {
  await createProfile(page, 'Varun', { keepDeviceDefaults: true });
  await page.goto(`/simulator?lab=ratios&seed=${SEED}`);
  await page.getByTestId(`${P}-mode-try`).click();
  const rng = createRng(trySeed(SEED, 'effect'));
  const first = nextQuestion('effect', rng);
  const second = nextQuestion('effect', rng);
  if (first.kind !== 'effect' || second.kind !== 'effect') throw new Error('expected effect questions');
  await expect(page.getByTestId(`${P}-try-prompt`)).toHaveText(first.prompt);
  await page.getByTestId(`${P}-try-option-${first.answer}`).click();
  await expect(page.getByTestId(`${P}-try-feedback`)).toHaveAttribute('data-correct', 'true');
  await expect(page.getByTestId(`${P}-focus`)).toBeVisible();
  await page.getByTestId(`${P}-try-next`).click();
  await expect(page.getByTestId(`${P}-try-prompt`)).toHaveText(second.prompt);
  const wrong = second.options.find((o) => o.id !== second.answer)!.id;
  await page.getByTestId(`${P}-try-option-${wrong}`).click();
  await expect(page.getByTestId(`${P}-try-feedback`)).toHaveAttribute('data-correct', 'false');
  await expect(page.getByTestId(`${P}-try-score`)).toHaveText('1 right of 2 (not recorded)');

  await page.getByTestId(`${P}-kind-compute`).click();
  const compute = nextQuestion('compute', createRng(trySeed(SEED, 'compute')));
  if (compute.kind !== 'compute') throw new Error('expected a compute question');
  await expect(page.getByTestId(`${P}-value-${compute.ratio}`)).toHaveText('?');
  await page.getByTestId(`${P}-try-answer`).fill(decimal(compute.hundredths).replace('−', '-'));
  await page.getByTestId(`${P}-try-check`).click();
  await expect(page.getByTestId(`${P}-try-feedback`)).toHaveAttribute('data-correct', 'true');
  await expect(page.getByTestId(`${P}-value-${compute.ratio}`)).not.toHaveText('?');
});

test('at 360 px no mode scrolls sideways', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 740 });
  await createProfile(page, 'Varun', { keepDeviceDefaults: true });
  await page.goto(`/simulator?lab=ratios&seed=${SEED}`);
  await page.getByTestId(`${P}-step`).click();
  await page.getByTestId(`${P}-step`).click();
  expect(await noSidewaysScroll(page)).toBe(true);
  for (const mode of ['play', 'try']) {
    await page.getByTestId(`${P}-mode-${mode}`).click();
    await expect(page.getByTestId(`${P}-panel-${mode}`)).toBeVisible();
    expect(await noSidewaysScroll(page), mode).toBe(true);
  }
  await page.getByTestId(`${P}-kind-term`).click();
  expect(await noSidewaysScroll(page)).toBe(true);
});
