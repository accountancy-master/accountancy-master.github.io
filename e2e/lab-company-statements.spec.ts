import { expect, test, type Page } from '@playwright/test';
import { pcText } from '../src/simulator/company-statements/sheet';
import { askRng, csAsk } from '../src/simulator/company-statements/tryit';
import { createProfile } from './helpers';

// The lab "A company's statements, read" (/simulator?lab=company-statements): the balance sheet sorted in the
// walk-through, a comparative statement played, tiles placed (wrongly, then rightly) and a figure changed in the
// sandbox, Try-it questions answered wrong and right, and the page at 360 px. With reduced motion.
test.use({ reducedMotion: 'reduce' });

const LAB = '/simulator?lab=company-statements';
const SEED = 3;
const C = 'lab-company-statements';
const noSidewaysScroll = (page: Page) => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);

test('watch: the balances are sorted onto the Schedule III balance sheet, then a statement is compared', async ({ page }) => {
  test.setTimeout(90_000);
  await createProfile(page, 'Rohan', { keepDeviceDefaults: true });
  await page.goto(LAB);
  await expect(page.getByTestId(C)).toBeVisible();
  await page.getByTestId(`${C}-play`).click();
  await expect(page.getByTestId(`${C}-stage`)).toHaveAttribute('data-status', 'done', { timeout: 40_000 });
  await expect(page.locator(`[data-testid="${C}-step-text"][data-played="true"]`)).toHaveCount(16);
  await expect(page.getByTestId(`${C}-slot-shareCapital-amount`)).toHaveText('₹21,80,000');
  await expect(page.getByTestId(`${C}-agree`)).toContainText('The two totals agree: ₹40,00,000');
  await expect(page.getByTestId(`${C}-note-shareCapital`)).toContainText('Less: Calls in arrears');
  await expect(page.getByTestId(`${C}-face-ppe`)).toContainText('24,00,000');
  // The comparative Statement of Profit and Loss, three lines worked.
  await page.getByTestId(`${C}-example-comparative`).click();
  for (let i = 0; i < 3; i++) await page.getByTestId(`${C}-step`).click();
  await expect(page.getByTestId(`${C}-bar-income-change`)).toHaveText('▲ ₹10,50,000 · 25.61%');
  await expect(page.getByTestId(`${C}-bar-exp0`)).toHaveAttribute('data-worked', 'false');
  await expect(page.getByTestId(`${C}-row-income`)).toContainText('25.61');
});

test('play: a wrong place is refused with the reason, a right one builds the balance sheet; a changed figure moves the percentages', async ({ page }) => {
  await createProfile(page, 'Rohan', { keepDeviceDefaults: true });
  await page.goto(LAB);
  await page.getByTestId(`${C}-mode-play`).click();
  await page.getByTestId(`${C}-tile-overdraft`).click();
  await page.getByTestId(`${C}-place-cash`).click();
  await expect(page.getByTestId(`${C}-said`)).toContainText('A liability is not deducted from an asset');
  await expect(page.getByTestId(`${C}-slot-cash`)).toHaveAttribute('data-count', '0');
  await page.getByTestId(`${C}-place-stb`).click();
  await expect(page.getByTestId(`${C}-slot-stb`)).toHaveAttribute('data-count', '1');
  await expect(page.getByTestId(`${C}-face-stb`)).toContainText('60,000');
  await page.getByTestId(`${C}-show-me`).click();
  await expect(page.getByTestId(`${C}-score`)).toContainText('Placed 2 of 21');
  // Compare two years: revenue of 2025-26 raised to ₹60,00,000 is a rise of 50% on ₹40,00,000.
  await page.getByTestId(`${C}-play-part-analysis`).click();
  await page.getByTestId(`${C}-in-rev-1`).fill('6000000');
  await expect(page.getByTestId(`${C}-bar-rev-change`)).toHaveText('▲ ₹20,00,000 · 50%');
  await page.getByTestId(`${C}-tool-common`).click();
  await expect(page.getByTestId(`${C}-row-exp0`)).toContainText('46.67');
});

test('try it: a head and sub-head, and a percentage change, marked at once', async ({ page }) => {
  await createProfile(page, 'Rohan', { keepDeviceDefaults: true });
  await page.goto(`${LAB}&seed=${SEED}`);
  await page.getByTestId(`${C}-mode-try`).click();
  const place = csAsk('place', askRng(SEED, 'place', 0));
  if (place.answer.type !== 'choice') throw new Error('a choice was expected');
  await expect(page.getByTestId(`${C}-try-prompt`)).toHaveText(place.prompt);
  const wrong = place.answer.options.find((o) => o.id !== (place.answer as { correct: string }).correct)!;
  await page.getByTestId(`${C}-try-option-${wrong.id}`).click();
  await page.getByTestId(`${C}-try-check`).click();
  await expect(page.getByTestId(`${C}-try-feedback`)).toHaveAttribute('data-correct', 'false');
  await expect(page.getByTestId(`${C}-try-feedback`)).toContainText(wrong.why!);
  await expect(page.getByTestId(`${C}-stage`)).toHaveAttribute('data-answered', 'true');
  await page.getByTestId(`${C}-kind-change`).click();
  const change = csAsk('change', askRng(SEED, 'change', 0));
  if (change.answer.type !== 'percent') throw new Error('a percentage was expected');
  await expect(page.getByTestId(`${C}-try-prompt`)).toHaveText(change.prompt);
  await page.getByTestId(`${C}-try-answer`).fill(pcText(change.answer.value));
  await page.getByTestId(`${C}-try-tag-${change.answer.tag!.correct}`).click();
  await page.getByTestId(`${C}-try-check`).click();
  await expect(page.getByTestId(`${C}-try-feedback`)).toHaveAttribute('data-correct', 'true');
});

test('at 360 px no mode of the lab scrolls sideways', async ({ page }) => {
  test.setTimeout(60_000);
  await page.setViewportSize({ width: 360, height: 740 });
  await createProfile(page, 'Rohan', { keepDeviceDefaults: true });
  await page.goto(LAB);
  for (let i = 0; i < 6; i++) await page.getByTestId(`${C}-step`).click();
  await expect(page.getByTestId(`${C}-stage`)).toHaveAttribute('data-shown', '6');
  expect(await noSidewaysScroll(page)).toBe(true);
  await page.getByTestId(`${C}-example-common`).click();
  expect(await noSidewaysScroll(page), 'common size').toBe(true);
  for (const mode of ['play', 'try']) {
    await page.getByTestId(`${C}-mode-${mode}`).click();
    await expect(page.getByTestId(`${C}-panel-${mode}`)).toBeVisible();
    expect(await noSidewaysScroll(page), mode).toBe(true);
  }
});
