import { expect, test } from '@playwright/test';
import { answerCurrentQuestion, createProfile, playSession, wrongMcqOption } from './helpers';

const NOT_RIGHT_AMOUNT = "That's not the right amount.";

// The Accounting Equation level is practice made of one numeric and one multiple-choice template, served in turn:
// numeric, multiple choice, numeric, ... The device has every level open.
test('numeric and multiple-choice generated questions: right answers, named mistakes, the Mistakes screen', async ({ page }) => {
  await createProfile(page, 'Varun', { unlockAll: true });
  await page.getByTestId('nav-topics').click();
  await expect(page.getByTestId('topic-card-accounting-equation')).toHaveAttribute('data-status', 'available');
  await page.getByTestId('topic-card-accounting-equation').click();
  await expect(page).toHaveURL(/\/topics\/accounting-equation$/);
  await expect(page.getByTestId('level-start-0')).toBeVisible();
  // The lesson and the two simulation levels come first.
  await page.getByTestId('level-start-4').click();
  await expect(page).toHaveURL(/\/play\/accounting-equation-level-2$/);

  const question = page.getByTestId('question');
  const feedback = page.getByTestId('feedback');
  const mistake = page.getByTestId('feedback-mistake');

  // 1. Numeric, answered right. Check waits for something to be typed, and an amount that cannot be read is not sent.
  await expect(question).toHaveAttribute('data-question-type', 'numeric');
  await expect(page.getByTestId('numeric-input')).toHaveAttribute('inputmode', 'decimal');
  await expect(page.getByText('Your answer in rupees (₹)')).toBeVisible();
  await expect(page.getByTestId('check')).toBeDisabled();
  await page.getByTestId('numeric-input').fill('lots');
  await expect(page.getByTestId('check')).toBeEnabled();
  await page.getByTestId('check').click();
  await expect(page.getByTestId('numeric-error')).toBeVisible();
  await expect(feedback).toHaveCount(0);
  await page.getByTestId('numeric-input').fill('');
  await answerCurrentQuestion(page);
  await expect(feedback).toHaveAttribute('data-correct', 'true');
  await expect(mistake).toHaveCount(0);
  await expect(page.getByTestId('working').locator('li').first()).toBeVisible();
  await page.getByTestId('continue').click();

  // 2. Multiple choice, answered wrong: the feedback names the mistake behind the option that was chosen.
  await expect(question).toHaveAttribute('data-question-type', 'mcq');
  await page.getByTestId(`mcq-option-${await wrongMcqOption(page)}`).click();
  await page.getByTestId('check').click();
  await expect(feedback).toHaveAttribute('data-correct', 'false');
  await expect(mistake).not.toBeEmpty();
  const why = (await mistake.innerText()).trim();
  expect(why).not.toBe(NOT_RIGHT_AMOUNT);
  await expect(feedback).toContainText('Right answer:');
  await page.getByTestId('continue').click();

  // 3. Numeric, answered with an amount that is no known mistake.
  await expect(question).toHaveAttribute('data-question-type', 'numeric');
  await page.getByTestId('numeric-input').fill('7');
  await page.getByTestId('check').click();
  await expect(feedback).toHaveAttribute('data-correct', 'false');
  await expect(mistake).toHaveText(NOT_RIGHT_AMOUNT);
  await expect(feedback).toContainText(/Right answer: ₹[\d,]+/);
  expect(await page.getByTestId('working').locator('li').count()).toBeGreaterThanOrEqual(2);
  await page.getByTestId('continue').click();

  // The rest of the level, answered right, then the two misses on the Mistakes screen, worded as in the feedback.
  await playSession(page);
  await page.goto('/mistakes');
  const items = page.getByTestId('mistake-item');
  await expect(items).toHaveCount(2);
  const words = await page.getByTestId('mistake-what').allInnerTexts();
  expect(words.sort()).toEqual([NOT_RIGHT_AMOUNT, why].sort());
  const numeric = items.filter({ hasText: NOT_RIGHT_AMOUNT });
  await numeric.getByTestId('mistake-show-entry').click();
  await expect(numeric.getByTestId('working').locator('li').first()).toBeVisible();
  await expect(numeric).toContainText(/Right answer: ₹[\d,]+/);
});
