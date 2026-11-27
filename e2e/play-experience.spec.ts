import { expect, test, type Page } from '@playwright/test';
import { narrationFor } from '../src/engine/narration';
import { generateQuestion, parseGenId } from '../src/generators';
import { lessonSteps } from '../src/play/lessonSteps';
import {
  CLASS12,
  CLASS12_LIVE,
  JE,
  answerCurrentQuestion,
  createProfile,
  fillJournal,
  fillStatement,
  foldData,
  levelOf,
  packOf,
  readStoredEvents,
  seedPassedLevels,
  showAnswer,
  wrongMcqOption,
  type EntryLine,
  type FormatRowE2e,
} from './helpers';

// How a level plays: a lesson read a step at a time, a lesson check that may be tried again, replays in a new order,
// partial XP for a statement that is mostly right, journal entries that say their totals and their wrong amounts and
// show a narration, amounts and columns that fit on a laptop, and a data panel that gives a phone its screen.

const noSidewaysScroll = (page: Page) => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);
const question = (page: Page) => page.getByTestId('question');
const LEVEL0 = packOf(JE).levels.find((l) => l.order === 0)!;

test('a lesson is read a step at a time, and a missed check can be tried again without failing the lesson', async ({ page }) => {
  await createProfile(page, 'Varun');
  await page.goto(`/play/${LEVEL0.id}`);
  const steps = lessonSteps(LEVEL0.lesson!).length;
  expect(steps).toBeGreaterThan(1);
  const lesson = page.getByTestId('lesson');
  await expect(lesson).toHaveAttribute('data-steps', String(steps));
  await expect(page.getByTestId('lesson-progress')).toHaveText(`Step 1 of ${steps}`);
  await expect(page.getByText('Two sides to every transaction')).toBeVisible();
  // One step at a time: the second step's heading is not on screen yet, and there is no way back from the first.
  await expect(page.getByText('Five kinds of accounts')).toHaveCount(0);
  await expect(page.getByTestId('lesson-back')).toHaveCount(0);
  await page.getByTestId('lesson-next').click();
  await expect(page.getByTestId('lesson-progress')).toHaveText(`Step 2 of ${steps}`);
  // Focus goes to the new step, which opens at the top of the page.
  await expect(page.getByTestId('lesson-step')).toBeFocused();
  expect(await page.evaluate(() => window.scrollY)).toBe(0);
  await page.getByTestId('lesson-back').click();
  await expect(page.getByText('Two sides to every transaction')).toBeVisible();
  for (let i = 1; i < steps; i++) await page.getByTestId('lesson-next').click();
  // The worked example keeps its journal layout.
  await expect(page.getByTestId('lesson-example')).toBeVisible();
  await expect(page.getByTestId('continue')).toHaveText('Continue to the check');
  await page.getByTestId('continue').click();

  // The check, answered wrong: the explanation, and "Try it again".
  await page.getByTestId(`mcq-option-${await wrongMcqOption(page)}`).click();
  await page.getByTestId('check').click();
  await expect(page.getByTestId('feedback')).toHaveAttribute('data-correct', 'false');
  await expect(page.getByTestId('retry-note')).toBeVisible();
  await expect(page.getByTestId('retry-check')).toBeFocused();
  const id = await question(page).getAttribute('data-question-id');
  await page.getByTestId('retry-check').click();
  await expect(page.getByTestId('feedback')).toHaveCount(0);
  await expect(question(page)).toHaveAttribute('data-question-id', id!);
  await answerCurrentQuestion(page);
  await expect(page.getByTestId('feedback')).toHaveAttribute('data-correct', 'true');
  await expect(page.getByTestId('retry-check')).toHaveCount(0);
  await page.getByTestId('continue').click();

  // The lesson is passed by working through it; the score says the check was not right first time.
  await expect(page.getByRole('heading', { name: 'Lesson complete' })).toBeVisible();
  await expect(page.getByTestId('results-passed')).toHaveText('Passed');
  await expect(page.getByTestId('results-score')).toHaveText('0 of 1 check right first time');
  await expect(page.getByTestId('results-next')).toBeVisible();
  // Both answers are stored once each, in order, and the one result is a pass.
  await expect.poll(async () => (await readStoredEvents(page)).levelResults.length).toBe(1);
  const stored = await readStoredEvents(page);
  expect(stored.attempts.map((a) => a.questionId)).toEqual([id, id]);
  expect(stored.levelResults[0]).toMatchObject({ levelId: LEVEL0.id, passed: true, score: 0 });
});

test('a replay asks the authored questions of a level in a new order', async ({ page }) => {
  await createProfile(page, 'Varun');
  await seedPassedLevels(page, 2);
  const level = packOf(JE).levels.find((l) => l.order === 3)!;
  expect(level.questionIds!.length).toBeGreaterThan(1);
  await page.goto(`/play/${levelOf(JE, 3)}`);
  const served = async () => {
    const ids: string[] = [];
    for (let i = 0; i < level.questionIds!.length; i++) {
      ids.push((await question(page).getAttribute('data-question-id'))!);
      await answerCurrentQuestion(page);
      await page.getByTestId('continue').click();
    }
    await expect(page.getByTestId('results')).toBeVisible();
    return ids;
  };
  expect(await served()).toEqual(level.questionIds);
  await page.getByTestId('results-retry').click();
  const again = await served();
  expect([...again].sort()).toEqual([...level.questionIds!].sort());
  expect(again).not.toEqual(level.questionIds);
});

test('a journal entry says its totals, asks once before checking an unbalanced entry, marks a wrong amount and shows the narration', async ({ page }) => {
  await createProfile(page, 'Varun');
  await seedPassedLevels(page, 3);
  await page.goto(`/play/${levelOf(JE, 4)}`);
  const q = question(page);
  await expect(q).toHaveAttribute('data-question-type', 'journal_entry');
  const { lines } = JSON.parse((await q.getAttribute('data-expected'))!) as { lines: EntryLine[] };
  expect(lines).toHaveLength(2);
  // The sides swapped, and the credit a tenth of what it should be: the entry does not balance.
  const [dr, cr] = [lines.find((l) => l.side === 'Dr')!, lines.find((l) => l.side === 'Cr')!];
  const short = Math.round(cr.amount / 1000) * 100;
  await fillJournal(page, [
    { ...dr, side: 'Cr', amount: short },
    { ...cr, side: 'Dr' },
  ]);
  await expect(page.getByTestId('je-total-dr')).toContainText((cr.amount / 100).toLocaleString('en-IN'));
  await expect(page.getByTestId('je-balance')).toHaveAttribute('data-balanced', 'false');
  await expect(page.getByTestId('je-balance')).toContainText('Debits and credits differ by');
  await page.getByTestId('check').click();
  await expect(page.getByTestId('je-confirm')).toContainText('Press Check again to check the entry as it is.');
  await expect(page.getByTestId('feedback')).toHaveCount(0);
  await page.getByTestId('check').click();

  const feedback = page.getByTestId('feedback');
  await expect(feedback).toHaveAttribute('data-correct', 'false');
  await expect(feedback.getByTestId('feedback-mistake')).toHaveText('The debit and credit sides are swapped.');
  await expect(feedback.getByTestId('feedback-also')).toHaveText('Also: An amount is not right.');
  await expect(page.getByTestId('je-row-status-0')).toHaveText('Wrong side');
  await expect(page.getByTestId('je-row-amount-0')).toContainText(`· amount should be ₹${(dr.amount / 100).toLocaleString('en-IN')}`);
  await expect(page.getByTestId('je-row-amount-1')).toHaveCount(0);
  // The correct entry has its narration under it, read from the entry and the words of the question.
  const questionId = (await q.getAttribute('data-question-id'))!;
  const gen = parseGenId(questionId);
  const prompt = gen ? generateQuestion(gen.templateId, gen.seed).prompt : packOf(JE).questions.find((x) => x.id === questionId)!.prompt;
  await expect(feedback.getByTestId('narration-solution')).toHaveText(`(${narrationFor(lines, undefined, prompt)})`);
  // The feedback is in view after Check, under the bar of the player.
  await expect(feedback.getByTestId('feedback-title')).toBeInViewport();
  const bar = (await page.locator('[data-player-bar]').boundingBox())!;
  expect((await feedback.getByTestId('feedback-title').boundingBox())!.y).toBeGreaterThanOrEqual(bar.y + bar.height - 1);

  // The next question opens at its top.
  await page.getByTestId('continue').click();
  await expect(page.getByTestId('feedback')).toHaveCount(0);
  expect(await page.evaluate(() => window.scrollY)).toBe(0);
});

test('a trial balance with one row wrong earns partial XP, says how many rows were right, and still counts as wrong', async ({ page }, info) => {
  test.setTimeout(120_000);
  await createProfile(page, 'Varun', { unlockAll: true });
  await page.goto('/play/trial-balance-formats-1');
  const q = question(page);
  await expect(q).toHaveAttribute('data-question-type', 'statement');
  const expected = JSON.parse((await q.getAttribute('data-expected'))!) as { rows: FormatRowE2e[]; final: number | null };
  const data = q.getByTestId('data');
  await expect(data).toHaveAttribute('data-open', 'true');
  await expect(data.getByTestId('data-toggle')).toContainText('Hide data');

  if (info.project.name === 'phone') {
    // On a phone the data folds itself away once the learner starts typing, and "Show data" brings all of it back.
    await q.getByTestId('fmt-rows-label-0').click();
    await page.getByTestId(`picker-option-${expected.rows[0].label}`).click();
    await q.getByTestId('fmt-rows-amount-0-0').fill('1');
    await expect(data).toHaveAttribute('data-open', 'false');
    await expect(data.getByTestId('data-toggle')).toContainText('Show data');
    await data.getByTestId('data-toggle').click();
    const text = data.getByTestId('data-text');
    await expect(text).toBeVisible();
    // Where the data scrolls inside the panel, it says there is more below, and the last line can be reached.
    if (await text.evaluate((e) => e.scrollHeight > e.clientHeight + 2)) {
      await expect(data.getByTestId('data-more')).toBeVisible();
      await text.evaluate((e) => e.scrollTo(0, e.scrollHeight));
      await expect(data.getByTestId('data-more')).toHaveCount(0);
    }
    // Opened again by the learner, it stays open while they type.
    await q.getByTestId('fmt-rows-amount-0-0').fill('');
    await expect(data).toHaveAttribute('data-open', 'true');
  }

  // Every row right but the last, whose amount is put in the other column.
  const rows = expected.rows.map((r, i) => (i === expected.rows.length - 1 ? { ...r, amounts: [...r.amounts].reverse() } : r));
  await fillStatement(page, { ...expected, rows });
  await foldData(q);
  await page.getByTestId('check').click();
  if ((await page.getByTestId('fmt-confirm').count()) > 0) await page.getByTestId('check').click();
  const feedback = page.getByTestId('feedback');
  const count = expected.rows.length + (expected.final === null ? 0 : 1);
  await expect(feedback).toHaveAttribute('data-correct', 'false');
  await expect(feedback).toHaveAttribute('data-almost', 'true');
  await expect(feedback.getByTestId('feedback-title')).toHaveText('Almost');
  await expect(feedback.getByTestId('feedback-mistake')).toHaveText(`${count - 1} of ${count} rows right.`);
  await expect(feedback.getByTestId('feedback-partial')).toBeVisible();
  const xp = Number(/\d+/.exec(await feedback.getByTestId('feedback-xp').innerText())![0]);
  expect(xp).toBeGreaterThan(0);
  await expect(feedback.getByTestId('feedback-title')).toBeInViewport();
  // The XP the feedback said is the XP the learner has.
  await expect.poll(async () => (await readStoredEvents(page)).attempts.length).toBe(1);
  await page.goto(`/topics/${JE}`);
  await expect(page.getByTestId('xp-total')).toContainText(String(xp));
});

test.describe('Class 12 formats on a laptop', () => {
  test.skip(!CLASS12_LIVE, 'Class 12 is not live');

  test('the amount box of a cash flow statement row fits a figure of eleven characters and more', async ({ page }) => {
    await createProfile(page, 'Varun', { unlockAll: true, courseId: CLASS12 });
    await page.goto('/play/cash-flow-statement-formats-3');
    const q = question(page);
    await expect(q).toHaveAttribute('data-question-type', 'statement');
    const expected = JSON.parse((await q.getAttribute('data-expected'))!) as { rows: FormatRowE2e[] };
    await foldData(q);
    await q.getByTestId('fmt-rows-label-0').click();
    await page.getByTestId(`picker-option-${expected.rows[0].label}`).click();
    const box = q.getByTestId('fmt-rows-amount-0-0');
    await box.fill('12,34,56,789');
    expect(await box.evaluate((e: HTMLInputElement) => e.scrollWidth <= e.clientWidth)).toBe(true);
    expect((await box.boundingBox())!.width).toBeGreaterThanOrEqual(110);
    expect(await noSidewaysScroll(page)).toBe(true);
  });

  test("the partners' capital accounts solution keeps every figure in its column", async ({ page }) => {
    await createProfile(page, 'Varun', { unlockAll: true, courseId: CLASS12 });
    await page.goto('/play/admission-of-a-partner-formats-2');
    const q = question(page);
    await expect(q).toHaveAttribute('data-question-type', 'account');
    await showAnswer(page);
    const solution = q.getByTestId('format-solution');
    await expect(solution).toBeVisible();
    // No figure runs out of its cell, the table scrolls (if at all) inside its card, and never the page.
    const overflowing = await solution.evaluate((root) =>
      [...root.querySelectorAll('span')].filter((e) => /tabular-nums/.test(e.className) && /border-l-2/.test(e.className) && e.scrollWidth > e.clientWidth + 1).map((e) => e.textContent),
    );
    expect(overflowing).toEqual([]);
    expect(await noSidewaysScroll(page)).toBe(true);
    const scroller = solution.getByTestId('solution-scroll');
    const inner = await scroller.evaluate((e) => ({ scroll: e.scrollWidth, client: e.clientWidth }));
    // The last column is reachable: scrolled to its end, the right edge of the table is in the card.
    await scroller.evaluate((e) => e.scrollTo({ left: e.scrollWidth }));
    expect(inner.scroll).toBeGreaterThanOrEqual(inner.client);
  });
});
