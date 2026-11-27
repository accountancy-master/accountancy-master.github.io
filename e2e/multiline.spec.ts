import { expect, test, type Locator } from '@playwright/test';
import { MULTILINE_MCQ, MULTILINE_SAMPLE } from '../src/components/settings/multilineSample';
import { createProfile } from './helpers';

// A prompt can hold a list (a dated list of transactions, "Name: ₹amount" per line). The Settings page of the test
// build shows the real prompt, feedback and Mistakes components with such a question, with one very long line.
const NL = String.fromCharCode(10);
const [HEAD, ...LINES] = MULTILINE_SAMPLE.prompt.split('\n');

const whiteSpace = (el: Locator) => el.evaluate((e) => getComputedStyle(e).whiteSpace);
const figures = (el: Locator) => el.evaluate((e) => getComputedStyle(e).fontVariantNumeric);

test.beforeEach(async ({ page }) => {
  await createProfile(page, 'Varun');
  await page.setViewportSize({ width: 360, height: 740 });
  await page.goto('/settings');
  await expect(page.getByTestId('e2e-multiline')).toBeVisible();
});

test('a prompt with a list shows the question first and the list one item to a line', async ({ page }) => {
  const question = page.getByTestId('e2e-multiline-question');
  await expect(question.getByTestId('prompt-head')).toHaveText(HEAD);
  const lines = question.getByTestId('prompt-lines');
  expect(await whiteSpace(lines)).toBe('pre-line');
  expect(await figures(lines)).toContain('tabular-nums');
  // innerText follows the rendering: the line breaks of the prompt are line breaks on screen.
  expect(((await lines.innerText()) ?? '').split('\n')).toEqual(LINES);
  // The heading is the prominent one: larger than the list.
  const sizes = await question.evaluate((e) => [
    parseFloat(getComputedStyle(e.querySelector('[data-testid="prompt-head"]')!).fontSize),
    parseFloat(getComputedStyle(e.querySelector('[data-testid="prompt-lines"]')!).fontSize),
  ]);
  expect(sizes[0]).toBeGreaterThan(sizes[1]);
});

test('the feedback keeps the line breaks of the explanation and of the working', async ({ page }) => {
  const explanation = page.getByTestId('e2e-multiline-explained').locator('p', { hasText: 'Add every balance.' });
  expect(await whiteSpace(explanation)).toBe('pre-line');
  expect((await explanation.innerText()).split(NL)).toEqual(MULTILINE_MCQ.explanation.split(NL));
  const first = page.getByTestId('e2e-multiline-working').getByTestId('working').locator('li').first();
  expect(await whiteSpace(first)).toBe('pre-line');
  expect((await first.innerText()).split(NL)).toEqual(MULTILINE_SAMPLE.working[0].split(NL));
});

test('the Mistakes list shows the list too', async ({ page }) => {
  const prompt = page.getByTestId('e2e-multiline-mistake').getByTestId('mistake-prompt');
  await expect(prompt.getByTestId('prompt-head')).toHaveText(HEAD);
  expect((await prompt.getByTestId('prompt-lines').innerText()).split('\n')).toEqual(LINES);
});

test('at 360 px nothing scrolls sideways, however long a line is', async ({ page }) => {
  expect(await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth)).toBe(false);
  for (const lines of await page.getByTestId('prompt-lines').all()) {
    expect(await lines.evaluate((e) => e.scrollWidth <= e.clientWidth)).toBe(true);
  }
});
