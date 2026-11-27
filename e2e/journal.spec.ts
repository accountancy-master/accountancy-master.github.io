import { expect, test } from '@playwright/test';
import { createProfile, fillJournal, seedPassedLevels, JE, levelOf } from './helpers';

type Line = { accountId: string; side: 'Dr' | 'Cr'; amount: number };

async function expectedLines(page: import('@playwright/test').Page): Promise<Line[]> {
  const raw = await page.getByTestId('question').getAttribute('data-expected');
  return JSON.parse(raw!).lines;
}

test.beforeEach(async ({ page }) => {
  await createProfile(page, 'Varun');
  await seedPassedLevels(page, 3);
  await page.goto(`/play/${levelOf(JE, 4)}`);
});

test('a correct entry is accepted row by row', async ({ page }) => {
  const lines = await expectedLines(page);
  await fillJournal(page, lines);
  await expect(page.getByTestId('je-balance')).toHaveText('Debits and credits match');
  await page.getByTestId('check').click();
  await expect(page.getByTestId('feedback')).toHaveAttribute('data-correct', 'true');
  for (let i = 0; i < lines.length; i++) {
    await expect(page.getByTestId(`je-row-status-${i}`)).toHaveText('Correct');
  }
});

test('reversed sides are diagnosed and the solution is shown', async ({ page }) => {
  const lines = await expectedLines(page);
  await fillJournal(page, lines.map((l) => ({ ...l, side: l.side === 'Dr' ? 'Cr' : 'Dr' })));
  await page.getByTestId('check').click();
  await expect(page.getByTestId('feedback')).toHaveAttribute('data-correct', 'false');
  await expect(page.getByTestId('feedback')).toContainText('The debit and credit sides are swapped.');
  await expect(page.getByTestId('je-row-status-0')).toHaveText('Wrong side');
  await expect(page.getByTestId('solution')).toBeVisible();
});

test('an incomplete line is caught before checking', async ({ page }) => {
  const [first] = await expectedLines(page);
  await page.getByTestId('je-account-0').click();
  await page.getByTestId(`picker-option-${first.accountId}`).click();
  await page.getByTestId('je-amount-0').fill('500');
  await page.getByTestId('check').click();
  await expect(page.getByTestId('je-error')).toHaveText('Line 1: choose Dr or Cr.');
  await expect(page.getByTestId('feedback')).toHaveCount(0);
});

test('the picker searches and Indian-format amounts are accepted', async ({ page }) => {
  const lines = await expectedLines(page);
  await page.getByTestId('je-account-0').click();
  await page.getByTestId('picker-search').fill('zzzz');
  await expect(page.locator('[data-testid^="picker-option-"]')).toHaveCount(0);
  await page.getByTestId('picker-search').fill('');
  await page.getByTestId(`picker-option-${lines[0].accountId}`).click();
  await page.getByTestId(`je-side-0-${lines[0].side}`).click();
  await page.getByTestId('je-amount-0').fill((lines[0].amount / 100).toLocaleString('en-IN'));
  await page.getByTestId('je-account-1').click();
  await page.getByTestId(`picker-option-${lines[1].accountId}`).click();
  await page.getByTestId(`je-side-1-${lines[1].side}`).click();
  await page.getByTestId('je-amount-1').fill(String(lines[1].amount / 100));
  await page.getByTestId('check').click();
  await expect(page.getByTestId('feedback')).toHaveAttribute('data-correct', 'true');
});

test('a whole practice level can be completed', async ({ page }) => {
  for (let n = 0; n < 8; n++) {
    await fillJournal(page, await expectedLines(page));
    await page.getByTestId('check').click();
    await expect(page.getByTestId('feedback')).toHaveAttribute('data-correct', 'true');
    await page.getByTestId('continue').click();
  }
  await expect(page.getByTestId('results-passed')).toHaveText('Passed');
  await expect(page.getByTestId('results-xp')).toContainText('100');
});

test('the picker keeps keyboard control after a click on non-interactive dialog content', async ({ page }) => {
  const [first] = await expectedLines(page);
  const insideDialog = () => page.evaluate(() => !!document.activeElement?.closest('[role="dialog"]'));

  await page.getByTestId('je-account-0').click();
  await expect(page.getByTestId('picker')).toBeVisible();
  await page.locator('[role="dialog"] h2').click();
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('picker')).toHaveCount(0);
  await expect(page.getByTestId('je-account-0')).toBeFocused();

  await page.getByTestId('je-account-0').click();
  await expect(page.getByTestId('picker')).toBeVisible();
  await page.locator('[role="dialog"] h2').click();
  for (let i = 0; i < 6; i++) {
    await page.keyboard.press('Tab');
    expect(await insideDialog()).toBe(true);
  }
  await page.locator('[role="dialog"] h2').click();
  await page.keyboard.press('Shift+Tab');
  expect(await insideDialog()).toBe(true);

  const label = (await page.getByTestId(`picker-option-${first.accountId}`).innerText()).split('\n')[0].trim();
  await page.getByTestId('picker-search').fill(label);
  await expect(page.locator('[data-testid^="picker-option-"]')).toHaveCount(1);
  await page.getByTestId('picker-search').press('Enter');
  await expect(page.getByTestId('picker')).toHaveCount(0);
  await expect(page.getByTestId('je-account-0')).toContainText(label);
});
