import { expect, test, type Locator, type Page } from '@playwright/test';
import { buildPaper, caseMarks, paperSteps } from '../src/learning/mockPaper';
import { formatMarks } from '../src/play/mockSitting';
import { createProfile, fillAccount, fillFormatRows, fillStatement, foldData, packOf, readStoredEvents, seedPassedLevels, showSide, type FormatRowE2e } from './helpers';

// Formats the student prepares: a two-sided account (the Ledger) and a statement (the Trial Balance).

const LEDGER = 'ledger';
const TRIAL_BALANCE = 'trial-balance';
/** The first level of formats of each topic: its id does not follow its position. */
const ACCOUNT_LEVEL = packOf(LEDGER).levels.find((l) => l.type === 'format_practice')!;
const STATEMENT_LEVEL = packOf(TRIAL_BALANCE).levels.find((l) => l.type === 'format_practice')!;

type AccountRows = { sides: FormatRowE2e[][]; below: FormatRowE2e[][] };
type StatementRows = { rows: FormatRowE2e[]; final: number | null };

const noSidewaysScroll = (page: Page) => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);
const question = (page: Page) => page.getByTestId('question');
const rupees = (paise: number) => `₹${(paise / 100).toLocaleString('en-IN')}`;
const total = (rows: FormatRowE2e[], column = 0) => rows.reduce((sum, r) => sum + r.amounts[column], 0);

/** The rows of the format on screen, from what the test build exposes. */
async function expectedOf<T>(page: Page, type: 'account' | 'statement'): Promise<T> {
  await expect(question(page)).toHaveAttribute('data-question-type', type);
  return JSON.parse((await question(page).getAttribute('data-expected'))!);
}

test.beforeEach(async ({ page }) => {
  await createProfile(page, 'Varun');
});

test('a level of accounts is played to the end with every row right', async ({ page }) => {
  test.setTimeout(180_000);
  expect(ACCOUNT_LEVEL.id).toBe(`${LEDGER}-formats-1`);
  await seedPassedLevels(page, 'all', LEDGER);
  await page.goto(`/play/${ACCOUNT_LEVEL.id}`);

  for (let n = 0; n < ACCOUNT_LEVEL.generate!.count; n++) {
    const expected = await expectedOf<AccountRows>(page, 'account');
    const count = expected.sides.flat().length + expected.below.flat().length;
    const q = question(page);

    if (n === 0) {
      // The task is the prompt; what to work from is in its own panel, open, and can be folded away and brought back.
      await expect(q.getByTestId('prompt-head')).toContainText('Prepare');
      await expect(q.getByTestId('prompt-lines')).toHaveCount(0);
      await expect(q.getByTestId('data')).toHaveAttribute('data-open', 'true');
      await expect(q.getByTestId('data-text')).toContainText('₹');
      await q.getByTestId('data-toggle').click();
      await expect(q.getByTestId('data-text')).toBeHidden();
      await q.getByTestId('data-toggle').click();
      await expect(q.getByTestId('data-text')).toBeVisible();
      // Nothing is entered: nothing can be checked, and the format says only what the two sides must do.
      await expect(page.getByTestId('check')).toBeDisabled();
      await expect(q.getByTestId('fmt-agree')).toHaveText('Enter the rows of both sides. The two sides must come to the same total.');

      // The keyboard works as in the journal: Enter on the particulars opens the picker with the search box in focus,
      // Escape gives the focus back, and Enter in an amount goes on to the next row.
      await foldData(q);
      await showSide(q, 0);
      await q.getByTestId('fmt-s0-label-0').focus();
      await page.keyboard.press('Enter');
      await expect(page.getByTestId('picker')).toBeVisible();
      await expect(page.getByTestId('picker-search')).toBeFocused();
      await page.keyboard.press('Escape');
      await expect(page.getByTestId('picker')).toHaveCount(0);
      await expect(q.getByTestId('fmt-s0-label-0')).toBeFocused();
      // The first row of the left side alone: the two sides do not agree, and the format says so and no more.
      await fillFormatRows(page, q, 'fmt-s0', expected.sides[0].slice(0, 1));
      await expect(q.getByTestId('fmt-agree')).toHaveText('The two sides do not agree yet.');
      await expect(q.getByTestId('fmt-agree')).toHaveAttribute('data-ruled', 'false');
      await expect(q.getByTestId('fmt-total-0')).toContainText(rupees(expected.sides[0][0].amounts[0]));
      await expect(page.getByTestId('check')).toBeEnabled();
      await q.getByTestId('fmt-s0-amount-0-0').press('Enter');
      await expect(q.getByTestId('fmt-s0-label-1')).toBeFocused();
      // Enter in the amount of the last row adds a row. Rows can be removed again.
      await fillFormatRows(page, q, 'fmt-s0', [{ label: expected.sides[0][0].label, amounts: [100] }], 1);
      await q.getByTestId('fmt-s0-amount-1-0').press('Enter');
      await expect(q.getByTestId('fmt-s0-label-2')).toBeFocused();
      await q.getByTestId('fmt-s0-remove-2').click();
      await q.getByTestId('fmt-s0-remove-1').click();
      await expect(q.getByTestId('fmt-s0-label-1')).toHaveCount(0);
      await expect(q.getByTestId('fmt-total-0')).toContainText(rupees(expected.sides[0][0].amounts[0]));
    }
    await fillAccount(page, expected);

    // Both sides agree: the totals are ruled off, which says nothing about the rows being right.
    await expect(q.getByTestId('fmt-agree')).toHaveText(`Both sides total ${rupees(total(expected.sides[0]))}.`);
    await expect(q.getByTestId('fmt-agree')).toHaveAttribute('data-ruled', 'true');

    await page.getByTestId('check').click();
    await expect(page.getByTestId('feedback')).toHaveAttribute('data-correct', 'true');
    await expect(page.getByTestId('format-score')).toHaveText(`${count} of ${count} rows right`);
    // Every row right: the review is the correct account, set out as on paper, with the working.
    await expect(q.getByTestId('fmt-yours')).toHaveCount(0);
    await expect(q.getByTestId('format-solution')).toBeVisible();
    await expect(q.getByTestId('solution-side-0').getByTestId('solution-total-0')).toHaveText(await q.getByTestId('solution-side-1').getByTestId('solution-total-0').innerText());
    await expect(q.getByTestId('format-working').locator('li')).not.toHaveCount(0);
    await page.getByTestId('continue').click();
    await expect(page.getByTestId('feedback')).toHaveCount(0);
  }
  await expect(page.getByTestId('results-passed')).toHaveText('Passed');
});

test('a row on the wrong side and a row left out are pointed out, and the account is listed on the Mistakes screen', async ({ page }) => {
  test.setTimeout(180_000);
  await seedPassedLevels(page, 'all', LEDGER);
  await page.goto(`/play/${ACCOUNT_LEVEL.id}`);
  const expected = await expectedOf<AccountRows>(page, 'account');
  const q = question(page);
  const id = (await q.getAttribute('data-question-id'))!;
  const count = expected.sides.flat().length + expected.below.flat().length;

  // A row that is begun and not finished is caught before checking, with its side and its row.
  await foldData(q);
  await showSide(q, 0);
  await q.getByTestId('fmt-s0-label-0').click();
  await page.getByTestId(`picker-option-${expected.sides[0][0].label}`).click();
  await page.getByTestId('check').click();
  await expect(page.getByTestId('fmt-error')).toHaveText('Dr side, row 1: enter an amount.');
  await expect(page.getByTestId('feedback')).toHaveCount(0);

  // The last row of the left side is left out, and the first row of the right side is entered on the left side.
  const moved = expected.sides[1][0];
  const kept = expected.sides[0].slice(0, -1);
  const missing = expected.sides[0].at(-1)!;
  await fillAccount(page, { sides: [[...kept, moved], expected.sides[1].slice(1)], below: expected.below });
  // The sides do not agree, so Check says so once before it checks anything.
  await page.getByTestId('check').click();
  await expect(page.getByTestId('fmt-confirm')).toHaveText('The two sides do not agree yet. Press Check again to check it as it is.');
  await expect(page.getByTestId('feedback')).toHaveCount(0);
  await page.getByTestId('check').click();

  const feedback = page.getByTestId('feedback');
  await expect(feedback).toHaveAttribute('data-correct', 'false');
  const score = `${count - 2} of ${count} rows right`;
  await expect(feedback.getByTestId('feedback-mistake')).toHaveText(`${score}.`);
  await expect(q.getByTestId('format-score')).toHaveText(score);
  // The student's own rows, each ticked or crossed: the row that was moved says "Wrong side".
  const mine = q.getByTestId('fmt-yours-0');
  await expect(mine.locator('[data-status="correct"]')).toHaveCount(kept.length);
  await expect(mine.getByTestId(`fmt-yours-0-status-${kept.length}`)).toHaveText('Wrong side');
  await expect(q.getByTestId('fmt-yours-1').locator('[data-status="correct"]')).toHaveCount(expected.sides[1].length - 1);
  // Which rows to put right: the one left out and the one on the wrong side. Then the correct account.
  const wrong = q.getByTestId('format-wrong').locator('li');
  await expect(wrong).toHaveCount(2);
  await expect(q.getByTestId('format-wrong').locator('[data-verdict="missing"]')).toContainText(missing.label);
  await expect(q.getByTestId('format-wrong').locator('[data-verdict="side"]')).toContainText(moved.label);
  await expect(q.getByTestId('format-extras')).toHaveCount(0);
  await expect(q.getByTestId('format-solution')).toBeVisible();
  await expect(q.getByTestId('solution-side-0').locator('[data-closing="true"]').or(q.getByTestId('solution-side-1').locator('[data-closing="true"]'))).toHaveCount(1);
  await expect(page.getByTestId('try-similar')).toBeVisible();
  expect(await noSidewaysScroll(page)).toBe(true);

  // Leave the level: the account waits on the Mistakes screen, saying how many rows were right and which were not.
  await page.getByTestId('continue').click();
  await page.getByTestId('player-close').click();
  await page.getByTestId('player-leave').click();
  await page.goto('/mistakes');
  const item = page.locator(`[data-testid="mistake-item"][data-question-id="${id}"]`);
  await expect(item.getByTestId('mistake-what')).toHaveText(`${score}.`);
  await item.getByTestId('mistake-show-entry').click();
  await expect(item.getByTestId('format-score')).toHaveText(score);
  await expect(item.getByTestId('format-wrong').locator('li')).toHaveCount(2);
  await expect(item.getByTestId('format-wrong').locator('[data-verdict="side"]')).toContainText(moved.label);
  await expect(item.getByTestId('format-solution')).toBeVisible();
  // The data the account was prepared from is there too, folded.
  await expect(item.getByTestId('data')).toHaveAttribute('data-open', 'false');
  // The attempt kept the answer, so the student's own rows are there as the review marked them.
  await expect(item.getByTestId('fmt-yours-0').locator('[data-status="correct"]')).toHaveCount(kept.length);
  await expect(item.getByTestId(`fmt-yours-0-row-${kept.length}`)).toContainText(moved.label);
  await expect(item.getByTestId(`fmt-yours-0-status-${kept.length}`)).toHaveText('Wrong side');
  await expect(item.getByTestId('fmt-yours-1').locator('[data-status="correct"]')).toHaveCount(expected.sides[1].length - 1);
  expect(await noSidewaysScroll(page)).toBe(true);
});

test('a Suspense A/c whose opening row is entered as "Balance b/d" is marked right', async ({ page }) => {
  test.setTimeout(240_000);
  const ROE = 'rectification-of-errors';
  const level = packOf(ROE).levels.find((l) => l.type === 'format_practice')!;
  const DIFFERENCE = 'Difference in trial balance';
  const OTHER = 'Balance b/d';
  await seedPassedLevels(page, 'all', ROE);
  await page.goto(`/play/${level.id}`);

  const served: string[] = [];
  for (let n = 0; n < level.generate!.count; n++) {
    const expected = await expectedOf<AccountRows>(page, 'account');
    const q = question(page);
    served.push((await q.getAttribute('data-question-id'))!);
    await expect(q.getByTestId('fmt-title')).toHaveText('Suspense A/c');
    // The test build gives the name the correct account shows. The student writes the other wording instead.
    const side = expected.sides.findIndex((rows) => rows.some((r) => r.label === DIFFERENCE));
    const at = expected.sides[side].findIndex((r) => r.label === DIFFERENCE);
    expect(at).toBeGreaterThanOrEqual(0);
    const sides = expected.sides.map((rows) => rows.map((r) => (r.label === DIFFERENCE ? { ...r, label: OTHER } : r)));
    const count = expected.sides.flat().length + expected.below.flat().length;
    await fillAccount(page, { sides, below: expected.below });
    await expect(q.getByTestId(`fmt-s${side}-label-${at}`)).toContainText(OTHER);
    await expect(q.getByTestId('fmt-agree')).toHaveAttribute('data-ruled', 'true');

    await page.getByTestId('check').click();
    await expect(page.getByTestId('feedback')).toHaveAttribute('data-correct', 'true');
    await expect(q.getByTestId('format-score')).toHaveText(`${count} of ${count} rows right`);
    await expect(q.getByTestId('format-wrong')).toHaveCount(0);
    // The review ticks the row under the name the student chose, and every other row with it; the correct account
    // shows the row under its own name.
    const mine = q.getByTestId(`fmt-yours-${side}`);
    await expect(mine.getByTestId(`fmt-yours-${side}-row-${at}`)).toHaveAttribute('data-status', 'correct');
    await expect(mine.getByTestId(`fmt-yours-${side}-row-${at}`)).toContainText(`${side === 0 ? 'To' : 'By'} ${OTHER}`);
    await expect(q.getByTestId('fmt-yours').locator('[data-status="correct"]')).toHaveCount(count);
    await expect(q.getByTestId('fmt-yours').locator('[data-status]:not([data-status="correct"])')).toHaveCount(0);
    await expect(q.getByTestId(`solution-side-${side}`)).toContainText(`${side === 0 ? 'To' : 'By'} ${DIFFERENCE}`);
    expect(await noSidewaysScroll(page)).toBe(true);
    await page.getByTestId('continue').click();
    await expect(page.getByTestId('feedback')).toHaveCount(0);
  }
  // Both Suspense formats were asked: the one that gives the difference and the one that leaves it to be found.
  expect(served.some((id) => id.startsWith('gen:roe-fmt-suspense:'))).toBe(true);
  expect(served.some((id) => id.startsWith('gen:roe-fmt-suspense-find:'))).toBe(true);
  await expect(page.getByTestId('results-passed')).toHaveText('Passed');
  await page.goto('/mistakes');
  await expect(page.getByTestId('mistakes-empty')).toBeVisible();
});

test('a level of statements is played to the end with every row right', async ({ page }) => {
  test.setTimeout(180_000);
  expect(STATEMENT_LEVEL.id).toBe(`${TRIAL_BALANCE}-formats-1`);
  await seedPassedLevels(page, 'all', TRIAL_BALANCE);
  await page.goto(`/play/${STATEMENT_LEVEL.id}`);

  for (let n = 0; n < STATEMENT_LEVEL.generate!.count; n++) {
    const expected = await expectedOf<StatementRows>(page, 'statement');
    const count = expected.rows.length;
    const q = question(page);
    if (n === 0) {
      await expect(page.getByTestId('check')).toBeDisabled();
      // One balance in the wrong column: the columns do not agree, and Check warns once.
      const [first, ...rest] = expected.rows;
      await fillStatement(page, { rows: [{ ...first, amounts: [...first.amounts].reverse() }, ...rest], final: null });
      await expect(q.getByTestId('fmt-agree')).toHaveText('The two columns do not agree yet.');
      await page.getByTestId('check').click();
      await expect(page.getByTestId('fmt-confirm')).toHaveText('The two columns do not agree yet. Press Check again to check it as it is.');
      // Put right: the amount is moved to its own column.
      for (const [c, amount] of first.amounts.entries()) await q.getByTestId(`fmt-rows-amount-0-${c}`).fill(amount > 0 ? String(amount / 100) : '');
      await expect(page.getByTestId('fmt-confirm')).toHaveCount(0);
    } else {
      await fillStatement(page, expected);
    }
    await expect(q.getByTestId('fmt-agree')).toHaveText(`Both columns total ${rupees(total(expected.rows, 0))}.`);
    await expect(q.getByTestId('fmt-total')).toHaveAttribute('data-ruled', 'true');
    await page.getByTestId('check').click();
    await expect(page.getByTestId('feedback')).toHaveAttribute('data-correct', 'true');
    await expect(page.getByTestId('format-score')).toHaveText(`${count} of ${count} rows right`);
    await expect(q.getByTestId('format-solution')).toBeVisible();
    await page.getByTestId('continue').click();
    await expect(page.getByTestId('feedback')).toHaveCount(0);
  }
  await expect(page.getByTestId('results-passed')).toHaveText('Passed');
});

test('an account in a mock paper survives a reload and is marked with shared marks', async ({ page }) => {
  test.setTimeout(240_000);
  // The first topic test on the Ledger that asks for an account. A paper is a pure function of its number, so the
  // test knows it; the papers before it are started and handed in empty, because only the next paper can be opened.
  const number = Array.from({ length: 12 }, (_, i) => i + 1).find((n) =>
    buildPaper({ kind: 'topic', topicId: LEDGER, number: n }).entries.some((e) => e.questions[0].type === 'account'),
  )!;
  expect(number).toBeDefined();
  const paper = buildPaper({ kind: 'topic', topicId: LEDGER, number });
  const step = paperSteps(paper).find((s) => s.question.type === 'account')!;
  const account = step.question;
  if (account.type !== 'account') throw new Error('not an account');
  const count = account.sides.flatMap((s) => [...s.rows, ...s.below]).length;
  const marks = step.entry.marks;
  const earned = formatMarks(caseMarks(marks, count - 1, count));

  await page.setViewportSize({ width: 360, height: 740 });
  for (let n = 1; n < number; n++) {
    await page.goto(`/mock/paper?paper=topic.${LEDGER}.${n}`);
    await page.getByTestId('mock-start').click();
    await page.getByTestId('exam-submit').click();
    await page.getByTestId('exam-confirm-yes').click();
    await expect(page.getByTestId('mock-result')).toBeVisible();
  }
  await page.goto(`/mock/paper?paper=${paper.key}`);
  await page.getByTestId('mock-start').click();
  await expect(page.getByTestId('exam')).toBeVisible();
  await page.getByTestId('exam-list-toggle').click();
  await page.getByTestId(`exam-jump-${step.label}`).click();
  const q = question(page);
  await expect(q).toHaveAttribute('data-question-id', account.id);
  await expect(page.getByTestId('exam-position')).toContainText(`${marks} marks shared by ${count} rows`);
  // Nothing in a paper checks an answer.
  for (const testId of ['check', 'hint', 'feedback']) await expect(page.getByTestId(testId)).toHaveCount(0);

  // Every row right but the last row of the left side, which is left out.
  const expected = await expectedOf<AccountRows>(page, 'account');
  const kept = expected.sides[0].slice(0, -1);
  await fillAccount(page, { sides: [kept, expected.sides[1]], below: expected.below });
  await expect(q.getByTestId('fmt-agree')).toHaveText('The two sides do not agree yet.');
  // On a phone one side is shown at a time, and both running totals stay on the buttons that switch between them.
  await expect(q.getByTestId('fmt-tab-total-0')).toHaveText(rupees(total(kept)));
  await expect(q.getByTestId('fmt-tab-total-1')).toHaveText(rupees(total(expected.sides[1])));
  await expect(q.getByTestId('fmt-side-0')).toBeHidden();
  await expect(q.getByTestId('fmt-side-1')).toBeVisible();
  expect(await noSidewaysScroll(page)).toBe(true);

  // After a reload the account is as it was left: every row on its side.
  await page.reload();
  await expect(page.getByTestId('exam')).toBeVisible();
  await expect(q).toHaveAttribute('data-question-id', account.id);
  await expect(q.getByTestId('fmt-tab-total-0')).toHaveText(rupees(total(kept)));
  await expect(q.getByTestId('fmt-tab-total-1')).toHaveText(rupees(total(expected.sides[1])));
  await showSide(q, 0);
  await expect(q.locator('[data-testid^="fmt-s0-row-"]')).toHaveCount(Math.max(2, kept.length));
  for (const [i, row] of kept.entries()) {
    await expect(q.getByTestId(`fmt-s0-label-${i}`)).toContainText(row.label);
    await expect(q.getByTestId(`fmt-s0-amount-${i}-0`)).toHaveValue(String(row.amounts[0] / 100));
  }
  await showSide(q, 1);
  await expect(q.getByTestId('fmt-s1-label-0')).toContainText(expected.sides[1][0].label);
  await page.getByTestId('exam-list-toggle').click();
  await expect(page.getByTestId(`exam-jump-${step.label}`)).toHaveAttribute('data-answered', 'true');
  await page.getByTestId('exam-list-toggle').click();

  await page.getByTestId('exam-submit').click();
  await page.getByTestId('exam-confirm-yes').click();
  await expect(page.getByTestId('mock-result')).toBeVisible();

  // The marks of the account are shared among its rows: all but one right, to the nearest half mark.
  await expect(page.getByTestId('mock-marks')).toHaveText(`${earned} / 20`);
  const script = page.getByTestId(`script-entry-${step.entry.number}`);
  await expect(page.getByTestId(`script-marks-${step.entry.number}`)).toHaveText(`${earned} / ${marks} marks`);
  await expect(page.getByTestId(`script-shared-${step.entry.number}`)).toHaveText(`The marks are shared by its ${count} rows: ${count - 1} right.`);
  await expect(script.getByTestId('format-score')).toHaveText(`${count - 1} of ${count} rows right`);
  await expect(script.getByTestId('fmt-yours-0').locator('[data-status="correct"]')).toHaveCount(kept.length);
  await expect(script.getByTestId('format-wrong').locator('[data-verdict="missing"]')).toContainText(expected.sides[0].at(-1)!.label);
  await expect(script.getByTestId('format-solution')).toBeVisible();
  expect(await noSidewaysScroll(page)).toBe(true);
  // One attempt for the account, as for any other question that was answered.
  const attempts = (await readStoredEvents(page)).attempts.filter((a) => a.questionId === account.id);
  expect(attempts).toHaveLength(1);
});

test('the longest account and the longest statement fit a phone 360 px wide, and an account stands side by side on a laptop', async ({ page }) => {
  test.setTimeout(180_000);
  await page.setViewportSize({ width: 360, height: 740 });
  await page.goto('/settings');
  const formats = page.getByTestId('e2e-formats');
  await expect(formats).toBeVisible({ timeout: 60_000 });

  /** Nothing scrolls sideways, and nothing sticks out of the sample or off the screen. */
  const fits = async (sample: Locator) => {
    expect(await noSidewaysScroll(page)).toBe(true);
    const out = await sample.evaluate((root) => {
      const found: string[] = [];
      const box = root.getBoundingClientRect();
      for (const el of root.querySelectorAll('*')) {
        const r = el.getBoundingClientRect();
        // Text for screen readers only is a one-pixel box that is not drawn; a hidden side has no box at all.
        if (r.width <= 1 || el.closest('.sr-only')) continue;
        if (r.left < box.left - 1 || r.right > box.right + 1 || r.right > window.innerWidth) {
          found.push(`<${el.tagName.toLowerCase()}> ${el.getAttribute('data-testid') ?? el.textContent?.slice(0, 30)}`);
        }
      }
      return found;
    });
    expect(out).toEqual([]);
  };

  // The account: every row of the longest one typed in, on a phone.
  const account = page.getByTestId('e2e-account');
  const open = page.getByTestId('e2e-account-open');
  const rows: AccountRows = JSON.parse((await account.getAttribute('data-expected'))!);
  expect(Number(await account.getAttribute('data-rows'))).toBeGreaterThanOrEqual(8);
  await fillAccount(page, rows, open);
  await expect(open.getByTestId('fmt-agree')).toHaveAttribute('data-ruled', 'true');
  // One side at a time, with both totals on the two buttons.
  await expect(open.getByTestId('fmt-tab-0')).toBeVisible();
  await expect(open.getByTestId('fmt-side-0')).toBeHidden();
  // Read as text content on both sides: a cash book has two totals on each button, one under the other.
  await expect(open.getByTestId('fmt-tab-total-0')).toHaveText((await open.getByTestId('fmt-tab-total-1').textContent())!);
  await fits(account);
  await showSide(open, 0);
  await fits(account);

  // Marked: a row on the wrong side, a row left out (the closing row, where there is one), and a row that should not be there.
  const marked = page.getByTestId('e2e-account-marked');
  const all = Number(await account.getAttribute('data-rows'));
  await expect(marked.getByTestId('format-score')).toHaveText(`${all - 2} of ${all} rows right`);
  await expect(marked.locator('[data-status="wrongSide"]')).toHaveCount(1);
  await expect(marked.locator('[data-status="extraRow"]')).toHaveCount(1);
  await expect(marked.getByTestId('format-wrong').locator('[data-verdict="missing"]')).toHaveCount(1);
  await expect(marked.getByTestId('format-extras')).toContainText('1 row should not be there.');
  await expect(marked.getByTestId('format-solution')).toBeVisible();
  // The Mistakes card says the same from the stored code alone.
  const mistake = page.getByTestId('e2e-account-mistake');
  await expect(mistake.getByTestId('mistake-what')).toHaveText(`${all - 2} of ${all} rows right. 1 row should not be there.`);
  await mistake.getByTestId('mistake-show-entry').click();
  await expect(mistake.getByTestId('format-wrong').locator('li')).toHaveCount(2);
  await expect(mistake.getByTestId('format-extras')).toBeVisible();
  // That was an attempt made before answers were kept: it has no rows of the student's to show.
  await expect(mistake.getByTestId('fmt-yours')).toHaveCount(0);
  await fits(account);
  // The card of an attempt that kept its answer shows the student's own rows too, marked as the review marks them.
  const keptCard = page.getByTestId('e2e-account-kept');
  await expect(keptCard.getByTestId('mistake-what')).toHaveText(`${all - 2} of ${all} rows right. 1 row should not be there.`);
  await keptCard.getByTestId('mistake-show-entry').click();
  await expect(keptCard.getByTestId('format-score')).toHaveText(`${all - 2} of ${all} rows right`);
  await expect(keptCard.getByTestId('fmt-yours').locator('[data-status="correct"]')).toHaveCount(all - 2);
  await expect(keptCard.locator('[data-status="wrongSide"]')).toHaveCount(1);
  await expect(keptCard.locator('[data-status="extraRow"]')).toHaveCount(1);
  await expect(keptCard.getByTestId('format-wrong').locator('li')).toHaveCount(2);
  await expect(keptCard.getByTestId('format-solution')).toBeVisible();
  await fits(account);

  // The statement: every row of the longest one, on a phone.
  const statement = page.getByTestId('e2e-statement');
  const sheet = page.getByTestId('e2e-statement-open');
  const lines: StatementRows = JSON.parse((await statement.getAttribute('data-expected'))!);
  expect(lines.rows.length).toBeGreaterThanOrEqual(10);
  await fillStatement(page, lines, sheet);
  await expect(sheet.getByTestId('fmt-total')).toHaveAttribute('data-ruled', 'true');
  const marks = page.getByTestId('e2e-statement-marked');
  await expect(marks.getByTestId('format-score')).toHaveText(`${lines.rows.length - 2} of ${lines.rows.length} rows right`);
  await expect(marks.locator('[data-status="wrongColumn"]')).toHaveCount(1);
  await page.getByTestId('e2e-statement-mistake').getByTestId('mistake-show-entry').click();
  const keptSheet = page.getByTestId('e2e-statement-kept');
  await keptSheet.getByTestId('mistake-show-entry').click();
  await expect(keptSheet.locator('[data-status="wrongColumn"]')).toHaveCount(1);
  await expect(keptSheet.getByTestId('fmt-yours').locator('[data-status="correct"]')).toHaveCount(lines.rows.length - 2);
  await expect(keptSheet.getByTestId('format-solution')).toBeVisible();
  await fits(statement);

  // On a laptop the two sides of the account stand side by side, as on paper, with their totals level; so does the
  // correct account of the review. A statement has its amounts on the line of the particulars.
  await page.setViewportSize({ width: 1280, height: 800 });
  await expect(open.getByTestId('fmt-tab-0')).toBeHidden();
  const [left, right] = [await open.getByTestId('fmt-side-0').boundingBox(), await open.getByTestId('fmt-side-1').boundingBox()];
  expect(left!.x + left!.width).toBeLessThanOrEqual(right!.x + 1);
  expect(Math.abs(left!.y - right!.y)).toBeLessThanOrEqual(1);
  const [leftTotal, rightTotal] = [await open.getByTestId('fmt-total-0').boundingBox(), await open.getByTestId('fmt-total-1').boundingBox()];
  expect(Math.abs(leftTotal!.y - rightTotal!.y)).toBeLessThanOrEqual(1);
  const [solutionLeft, solutionRight] = [await marked.getByTestId('solution-side-0').boundingBox(), await marked.getByTestId('solution-side-1').boundingBox()];
  expect(solutionLeft!.x + solutionLeft!.width).toBeLessThanOrEqual(solutionRight!.x + 1);
  const [label, amount] = [await sheet.getByTestId('fmt-rows-label-0').boundingBox(), await sheet.getByTestId('fmt-rows-amount-0-0').boundingBox()];
  expect(label!.x + label!.width).toBeLessThanOrEqual(amount!.x);
  expect(Math.abs(label!.y + label!.height / 2 - (amount!.y + amount!.height / 2))).toBeLessThanOrEqual(2);
  await fits(account);
  await fits(statement);
});

test('an account over three years, an account with no balance left, a statement that names its own ending and a book with four columns', async ({ page }) => {
  test.setTimeout(180_000);
  await page.setViewportSize({ width: 360, height: 740 });
  await page.goto('/settings');
  await expect(page.getByTestId('e2e-formats')).toBeVisible({ timeout: 60_000 });
  /** Nothing scrolls sideways, and nothing of a sample is wider than the screen. */
  const fits = async (sample: Locator) => {
    expect(await noSidewaysScroll(page)).toBe(true);
    expect(await sample.evaluate((root) => [...root.querySelectorAll('*')].filter((el) => !el.closest('.sr-only') && el.getBoundingClientRect().width > 1 && el.getBoundingClientRect().right > window.innerWidth + 1).length)).toBe(0);
  };

  // Machinery A/c for three years: the periods stand one under another, each with its own sides, totals and agreement.
  const periods = page.getByTestId('e2e-periods');
  const open = page.getByTestId('e2e-periods-open');
  const rows: AccountRows & { later: FormatRowE2e[][][] } = JSON.parse((await periods.getAttribute('data-expected'))!);
  expect(rows.later).toHaveLength(2);
  await expect(open.locator('section[data-testid$="side-0"]')).toHaveCount(3);
  await expect(open.getByTestId('fmt-p1-period-title')).toHaveText('Year ended 31 March 2025');
  // The first year alone: it agrees and is ruled off; the years not yet entered say nothing about it.
  await fillAccount(page, { sides: rows.sides, below: [[], []] }, open);
  await expect(open.getByTestId('fmt-agree')).toHaveAttribute('data-ruled', 'true');
  await expect(open.getByTestId('fmt-p1-agree')).toHaveText('Enter the rows of both sides. The two sides must come to the same total.');
  // The balance brought down opens the second year as a row the student enters; the same depreciation is its own row there.
  await fillAccount(page, rows, open);
  for (const id of ['fmt-agree', 'fmt-p1-agree', 'fmt-p2-agree']) await expect(open.getByTestId(id)).toHaveAttribute('data-ruled', 'true');
  await expect(open.getByTestId('fmt-p1-tab-total-0')).toHaveText(rupees(total(rows.later[0][0])));
  await expect(open.getByTestId('fmt-p2-tab-total-1')).toHaveText(rupees(total(rows.later[1][1])));
  // The place for the balance brought down is under the last totals only.
  await expect(open.locator('[data-testid="fmt-b0-add"]')).toHaveCount(1);
  await showSide(open, 0, 2);
  await expect(open.getByTestId('fmt-period-2').getByTestId('fmt-b0-add')).toBeVisible();
  await fits(periods);
  // Marked with the closing row of the second year left out: the review names the period, and the correct account
  // goes on under each totals line.
  const marked = page.getByTestId('e2e-periods-marked');
  await expect(marked.getByTestId('format-score')).toHaveText('10 of 11 rows right');
  await expect(marked.getByTestId('format-wrong').locator('li')).toHaveText(['Cr side, Year ended 31 March 2025: By Balance c/d (missing)']);
  await expect(marked.locator('[data-testid^="solution-period-"]')).toHaveCount(3);
  await expect(marked.getByTestId('solution-p1-side-0')).toContainText('To Balance b/d');
  await expect(page.getByTestId('e2e-periods-mistake').getByTestId('mistake-what')).toHaveText('10 of 11 rows right.');
  // On the card of an attempt that kept its answer every period has the student's rows, each list under its name.
  const keptYears = page.getByTestId('e2e-periods-kept');
  await keptYears.getByTestId('mistake-show-entry').click();
  await expect(keptYears.getByTestId('fmt-yours').locator('[data-status="correct"]')).toHaveCount(10);
  await expect(keptYears.getByTestId('fmt-yours-3')).toContainText('Your Cr side, Year ended 31 March 2025');
  await expect(keptYears.getByTestId('format-wrong').locator('li')).toHaveText(['Cr side, Year ended 31 March 2025: By Balance c/d (missing)']);

  // An account whose task asks for the balance to be brought down, and which has none left: the place is offered all the same.
  const none = page.getByTestId('e2e-nothing-left-open');
  await expect(none.getByTestId('account')).toHaveAttribute('data-continued', 'true');
  await showSide(none, 0);
  await expect(none.getByTestId('fmt-b0-add')).toBeVisible();
  await expect(none.locator('[data-testid^="fmt-b0-row-"]')).toHaveCount(0);
  await expect(page.getByTestId('e2e-nothing-left-marked').getByTestId('format-score')).toHaveText('5 of 5 rows right');

  // A statement that leaves what it ends on to the student: the name is picked, and the amount typed.
  const choice = page.getByTestId('e2e-choice');
  const sheet = page.getByTestId('e2e-choice-open');
  const lines: StatementRows & { finalLabel: string } = JSON.parse((await choice.getAttribute('data-expected'))!);
  await expect(sheet.getByTestId('fmt-final-label')).toContainText('Choose what the statement ends on');
  await expect(sheet).not.toContainText(lines.finalLabel);
  await fillStatement(page, lines, sheet);
  await expect(sheet.getByTestId('fmt-final-label')).toContainText(lines.finalLabel);
  await expect(sheet.getByTestId('fmt-final')).toHaveValue(String(lines.final! / 100));
  // Marked with the right amount under the wrong name.
  const named = page.getByTestId('e2e-choice-marked');
  await expect(named.getByTestId('format-score')).toHaveText('3 of 4 rows right');
  await expect(named.getByTestId('fmt-yours-final')).toContainText('the wrong name for it');
  await expect(named.getByTestId('format-wrong').locator('[data-verdict="label"]')).toContainText(lines.finalLabel);
  await expect(named.getByTestId('solution-final')).toContainText(lines.finalLabel);
  // The card of that attempt says the same of the final figure, from the answer it kept.
  const keptChoice = page.getByTestId('e2e-choice-kept');
  await keptChoice.getByTestId('mistake-show-entry').click();
  await expect(keptChoice.getByTestId('fmt-yours-final')).toContainText('the wrong name for it');
  await fits(choice);

  // A book with four amount columns: on a phone the amounts stand under the particulars, each under its name.
  const book = page.getByTestId('e2e-book');
  const pages = page.getByTestId('e2e-book-open');
  const invoices: StatementRows = JSON.parse((await book.getAttribute('data-expected'))!);
  expect(invoices.rows[0].amounts).toHaveLength(4);
  await fillStatement(page, invoices, pages);
  await expect(pages.getByTestId('fmt-total')).toContainText(`Total ${rupees(total(invoices.rows, 3))}`);
  const [name, amount] = [await pages.getByTestId('fmt-rows-label-0').boundingBox(), await pages.getByTestId('fmt-rows-amount-0-0').boundingBox()];
  expect(amount!.y).toBeGreaterThanOrEqual(name!.y + name!.height);
  await expect(page.getByTestId('e2e-book-marked').locator('[data-status="wrongColumn"]')).toHaveCount(1);
  await fits(book);

  // On a laptop every period has its two sides side by side, and the four amounts are on the line of the particulars.
  await page.setViewportSize({ width: 1280, height: 800 });
  for (const p of ['fmt', 'fmt-p1', 'fmt-p2']) {
    const [left, right] = [await open.getByTestId(`${p}-side-0`).boundingBox(), await open.getByTestId(`${p}-side-1`).boundingBox()];
    expect(left!.x + left!.width).toBeLessThanOrEqual(right!.x + 1);
    expect(Math.abs(left!.y - right!.y)).toBeLessThanOrEqual(1);
  }
  const [wideName, wideAmount] = [await pages.getByTestId('fmt-rows-label-0').boundingBox(), await pages.getByTestId('fmt-rows-amount-0-3').boundingBox()];
  expect(wideName!.x + wideName!.width).toBeLessThanOrEqual(wideAmount!.x);
  expect(wideAmount!.y).toBeLessThan(wideName!.y + wideName!.height);
  for (const sample of [periods, choice, book]) await fits(sample);
});
