import { expect, test, type Page } from '@playwright/test';
import { askRng, gwAsk } from '../src/simulator/goodwill/tryit';
import { createProfile } from './helpers';

// The goodwill lab of the simulator (src/simulator/goodwill, components/simulator/labs/GoodwillLab.tsx). With
// reduced motion every step fades, so a walk-through plays quickly.
test.use({ reducedMotion: 'reduce' });

const LAB = '/simulator?lab=goodwill';
const SEED = 7;
const noSidewaysScroll = (page: Page) => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);
const figure = (p: number) => String(p / 100);

test('watch: the profits are corrected, averaged and valued by the super profit method', async ({ page }) => {
  test.setTimeout(90_000);
  await createProfile(page, 'Varun', { keepDeviceDefaults: true });
  await page.goto(LAB);
  await expect(page.getByTestId('lab-goodwill')).toBeVisible();
  await expect(page.getByTestId('lab-goodwill-about')).toContainText('Mehra & Kapoor');
  await page.getByTestId('lab-goodwill-play').click();
  await expect(page.getByTestId('lab-goodwill-stage')).toHaveAttribute('data-status', 'done', { timeout: 60_000 });
  await expect(page.locator('[data-testid="lab-goodwill-step-text"][data-played="true"]')).toHaveCount(10);
  await expect(page.getByTestId('lab-goodwill-average')).toHaveText('₹1,40,000');
  await expect(page.getByTestId('lab-goodwill-normal')).toHaveText('₹80,000');
  await expect(page.getByTestId('lab-goodwill-super')).toHaveText('₹60,000');
  await expect(page.getByTestId('lab-goodwill-capital-employed')).toHaveText('₹8,00,000');
  await expect(page.getByTestId('lab-goodwill-goodwill-value')).toHaveText('₹1,80,000');
  await expect(page.getByTestId('lab-goodwill-methods')).toContainText('₹6,00,000');
  await expect(page.getByTestId('lab-goodwill-announce')).toContainText("x 3 years' purchase = ₹1,80,000");
  await expect(page.getByTestId('lab-goodwill-working')).toContainText('Capital employed = assets used in the business ₹10,80,000');
  // A step back: the goodwill is not worked out yet.
  await page.getByTestId('lab-goodwill-back').click();
  await expect(page.getByTestId('lab-goodwill-goodwill-value')).toHaveCount(0);
  await expect(page.getByTestId('lab-goodwill-progress')).toHaveText('Step 9 of 10');
});

test('play: a new rate and a new method value the goodwill again', async ({ page }) => {
  await createProfile(page, 'Varun', { keepDeviceDefaults: true });
  await page.goto(LAB);
  await page.getByTestId('lab-goodwill-mode-play').click();
  await expect(page.getByTestId('lab-goodwill-goodwill-value')).toHaveText('₹1,80,000');
  // At 12% the normal profit is ₹96,000 and the super profit ₹44,000: 3 years' purchase is ₹1,32,000.
  await page.getByTestId('lab-goodwill-in-rate-number').fill('12');
  await expect(page.getByTestId('lab-goodwill-normal')).toHaveText('₹96,000');
  await expect(page.getByTestId('lab-goodwill-goodwill-value')).toHaveText('₹1,32,000');
  // Capitalised at 12%, the super profit is ₹3,66,666.67: shown to the paisa.
  await page.getByTestId('lab-goodwill-in-method-capSuper').click();
  await expect(page.getByTestId('lab-goodwill-goodwill-value')).toHaveText('₹3,66,666.67');
  // No capital employed: refused, with the reason.
  await page.getByTestId('lab-goodwill-in-outside').fill('1500000');
  await page.getByTestId('lab-goodwill-in-trade').fill('100000');
  await expect(page.getByTestId('lab-goodwill-problem')).toContainText('capital employed');
});

test('try it: a wrong figure is told why, a right figure and a right choice are marked right', async ({ page }) => {
  await createProfile(page, 'Varun', { keepDeviceDefaults: true });
  await page.goto(`${LAB}&seed=${SEED}`);
  await page.getByTestId('lab-goodwill-mode-try').click();
  const first = gwAsk('average', askRng(SEED, 'average', 0));
  await expect(page.getByTestId('lab-goodwill-try-prompt')).toHaveText(first.prompt);
  await page.getByTestId('lab-goodwill-try-answer').fill('1');
  await page.getByTestId('lab-goodwill-try-check').click();
  await expect(page.getByTestId('lab-goodwill-try-feedback')).toHaveAttribute('data-correct', 'false');
  await expect(page.getByTestId('lab-goodwill-try-feedback')).toContainText(first.reason);
  await expect(page.getByTestId('lab-goodwill-average')).toBeVisible();
  await page.getByTestId('lab-goodwill-try-next').click();
  const second = gwAsk('average', askRng(SEED, 'average', 1));
  if (second.answer.type !== 'number') throw new Error('a figure was expected');
  await expect(page.getByTestId('lab-goodwill-try-prompt')).toHaveText(second.prompt);
  await page.getByTestId('lab-goodwill-try-answer').fill(figure(second.answer.value));
  await page.getByTestId('lab-goodwill-try-check').click();
  await expect(page.getByTestId('lab-goodwill-try-feedback')).toHaveAttribute('data-correct', 'true');
  await page.getByTestId('lab-goodwill-kind-adjust').click();
  const adjust = gwAsk('adjust', askRng(SEED, 'adjust', 0));
  if (adjust.answer.type !== 'choice') throw new Error('a choice was expected');
  await page.getByTestId(`lab-goodwill-try-option-${adjust.answer.correct}`).click();
  await page.getByTestId('lab-goodwill-try-check').click();
  await expect(page.getByTestId('lab-goodwill-try-feedback')).toHaveAttribute('data-correct', 'true');
});

test('at 360 px no mode of the lab scrolls sideways', async ({ page }) => {
  test.setTimeout(60_000);
  await page.setViewportSize({ width: 360, height: 740 });
  await createProfile(page, 'Varun', { keepDeviceDefaults: true });
  await page.goto(LAB);
  for (let i = 0; i < 10; i++) await page.getByTestId('lab-goodwill-step').click();
  await expect(page.getByTestId('lab-goodwill-stage')).toHaveAttribute('data-shown', '10');
  expect(await noSidewaysScroll(page)).toBe(true);
  for (const mode of ['play', 'try']) {
    await page.getByTestId(`lab-goodwill-mode-${mode}`).click();
    await expect(page.getByTestId(`lab-goodwill-panel-${mode}`)).toBeVisible();
    expect(await noSidewaysScroll(page), mode).toBe(true);
  }
});
