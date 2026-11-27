import { expect, test, type Locator, type Page } from '@playwright/test';
import { CLASS11_STAGES as CASE_STAGES } from './helpers';
import { buildPaper, creditMarks, paperSteps } from '../src/learning/mockPaper';
import { chainedRuleText, formatMarks } from '../src/play/mockSitting';
import { answerCurrentQuestion, createProfile, enterAnswer, fillAccount, foldData, packOf, readStoredEvents, showSide, type FormatRowE2e } from './helpers';

// A chained case: the Trading Account, the Profit and Loss Account and the Balance Sheet from one trial balance. The
// case text is the data of all three, in one panel.

const CASE_ID = 'case-fa-chain-trading-pl-bs';
const stage = CASE_STAGES.find((s) => s.cases.some((c) => c.id === CASE_ID))!;
/** Where the chained case stands among the cases of its stage: they take turns, play after play. */
const TURN = stage.cases.findIndex((c) => c.id === CASE_ID);
const level = packOf(stage.topicId).levels.find((l) => l.cases?.caseIds.includes(CASE_ID))!;
const PARTS = 3;

type AccountRows = { sides: FormatRowE2e[][]; below: FormatRowE2e[][] };

const noSidewaysScroll = (page: Page) => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);
const question = (page: Page) => page.getByTestId('question');
const partId = (part: number) => new RegExp(`^gen:${CASE_ID}~${part}:\\d+:\\d+$`);
const rowsOf = (expected: AccountRows) => expected.sides.flat().length + expected.below.flat().length;

/** The rows of the account on screen, from what the test build exposes. */
async function expectedOf(page: Page): Promise<AccountRows> {
  await expect(question(page)).toHaveAttribute('data-question-type', 'account');
  return JSON.parse((await question(page).getAttribute('data-expected'))!);
}

/** Puts rows straight into the app's own database, for the learner of this page. The next page load reads them. */
async function store(page: Page, table: 'levelResults' | 'mockPapers', rows: Record<string, unknown>[]) {
  await page.evaluate(
    ({ table, rows }) =>
      new Promise<void>((resolve, reject) => {
        const profileId = localStorage.getItem('am.profileId');
        const open = indexedDB.open('accountancy-master');
        open.onerror = () => reject(open.error);
        open.onsuccess = () => {
          const db = open.result;
          const tx = db.transaction([table], 'readwrite');
          for (const row of rows) tx.objectStore(table).put({ ...row, profileId });
          tx.oncomplete = () => {
            db.close();
            resolve();
          };
          tx.onerror = () => reject(tx.error);
        };
      }),
    { table, rows },
  );
}

/** The case of a chained case as the screen shows it while a part is answered: one panel, kept at the top. */
async function expectOnePanel(q: Locator, part: number, note = `Question ${part} of ${PARTS} in this case`) {
  const panel = q.getByTestId('case');
  await expect(panel).toHaveCount(1);
  await expect(panel).toHaveAttribute('data-sticky', 'true');
  await expect(panel.getByTestId('case-note')).toHaveText(note);
  await expect(panel.getByTestId('case-toggle')).toContainText('Case');
  // The case text is the data: there is no second panel headed "Data".
  await expect(q.getByTestId('data')).toHaveCount(0);
}

test.describe('the chained case of the final accounts', () => {
  test.skip(!stage || !level, 'the chained case is not in a stage');

  test('is played in its Case study level from the Trading Account to the Balance Sheet, all three right', async ({ page }) => {
    test.setTimeout(240_000);
    await createProfile(page, 'Varun', { unlockAll: true });
    // The cases of a level take turns: after as many plays as there are cases before it, it is the chained one's turn.
    await store(page, 'levelResults', Array.from({ length: TURN }, (_, i) => ({ id: `e2e-play-${i}`, topicId: stage.topicId, levelId: level.id, score: 1, passed: true, at: 1000 + i })));
    await page.setViewportSize({ width: 360, height: 740 });
    await page.goto(`/play/${level.id}`);

    const q = question(page);
    const panel = q.getByTestId('case');
    const feedback = page.getByTestId('feedback');
    await expect(q).toHaveAttribute('data-question-id', partId(1));
    await expect(page.getByTestId('player-progress')).toHaveAttribute('aria-label', new RegExp(`: 0 of ${PARTS} steps done$`));
    await expect(panel).toHaveAttribute('data-open', 'true');
    const caseText = await panel.getByTestId('case-text').innerText();
    expect(caseText).toContain('The trial balance on that date:');
    expect(caseText).toContain('There is no other adjustment.');
    // Neither profit is given: each is what the part before ends on.
    expect(caseText).not.toMatch(/gross profit|net profit/i);

    const TASKS = [/^Prepare the Trading Account of /, /^Prepare the Profit and Loss Account of .*, starting from the gross profit of the Trading Account\.$/, /^Prepare the Balance Sheet of /];
    const closing: string[] = [];
    for (let part = 1; part <= PARTS; part++) {
      await expect(q).toHaveAttribute('data-question-id', partId(part));
      await expectOnePanel(q, part);
      await expect(q.getByTestId('prompt-head')).toHaveText(TASKS[part - 1]);
      const expected = await expectedOf(page);
      const count = rowsOf(expected);
      expect(await noSidewaysScroll(page)).toBe(true);
      await answerCurrentQuestion(page);
      await expect(feedback).toHaveAttribute('data-correct', 'true');
      // The review of a format that stands alone: the score, and the correct account as an examiner expects it.
      await expect(q.getByTestId('format-score')).toHaveText(`${count} of ${count} rows right`);
      await expect(q.getByTestId('format-solution')).toBeVisible();
      await expect(q.getByTestId('format-working').locator('li').first()).toBeVisible();
      // The case is still above it, as it was left (folded to type the rows), and it no longer follows the page.
      await expect(panel).toHaveCount(1);
      await expect(panel).not.toHaveAttribute('data-sticky', 'true');
      await expect(q.getByTestId('data')).toHaveCount(0);
      await expect(page.getByTestId('try-similar')).toHaveCount(0);
      // The Trading Account and the Profit and Loss Account end on a closing row; the Balance Sheet has none.
      if (part < PARTS) closing.push(await q.getByTestId('format-solution').locator('[data-closing="true"]').innerText());
      expect(await noSidewaysScroll(page)).toBe(true);
      await page.getByTestId('continue').click();
      await expect(feedback).toHaveCount(0);
    }
    // What the student has just seen confirmed is what the next part starts from.
    expect(closing[0]).toContain('Gross Profit c/d');
    expect(closing[1]).toContain('Net Profit transferred to Capital A/c');

    await expect(page.getByTestId('results-score')).toHaveText(`${PARTS} of ${PARTS} correct`);
    await expect(page.getByTestId('results-passed')).toHaveText('Passed');
    const stored = await readStoredEvents(page);
    expect(stored.attempts.map((a) => a.questionId).sort()).toEqual(expect.arrayContaining([expect.stringMatching(partId(1)), expect.stringMatching(partId(2)), expect.stringMatching(partId(3))]));
    expect(stored.attempts).toHaveLength(PARTS);
    for (const a of stored.attempts) expect({ levelId: a.levelId, topicId: a.topicId }).toEqual({ levelId: level.id, topicId: stage.topicId });
  });

  test('with the Profit and Loss Account wrong shows its review and the right net profit, and then asks for the Balance Sheet', async ({ page }) => {
    test.setTimeout(240_000);
    await createProfile(page, 'Varun', { unlockAll: true });
    await page.goto(`/cases/play/${stage.id}?case=${CASE_ID}`);
    const q = question(page);
    const panel = q.getByTestId('case');
    const feedback = page.getByTestId('feedback');

    await expect(q).toHaveAttribute('data-question-id', partId(1));
    const trading = await expectedOf(page);
    const gross = trading.sides[0].find((r) => r.label === 'Gross Profit c/d')!;
    await answerCurrentQuestion(page);
    await expect(feedback).toHaveAttribute('data-correct', 'true');
    await page.getByTestId('continue').click();

    // The Profit and Loss Account, the gross profit brought down ₹1,000 too high and the net profit to match.
    await expect(q).toHaveAttribute('data-question-id', partId(2));
    await expectOnePanel(q, 2);
    const id = (await q.getAttribute('data-question-id'))!;
    const expected = await expectedOf(page);
    const count = rowsOf(expected);
    expect(expected.sides[1][0]).toEqual({ label: 'Gross Profit b/d', amounts: gross.amounts });
    const net = expected.sides[0].find((r) => r.label === 'Net Profit transferred to Capital A/c')!;
    const over = (row: FormatRowE2e): FormatRowE2e => (row === net || row === expected.sides[1][0] ? { ...row, amounts: [row.amounts[0] + 100000] } : row);
    await fillAccount(page, { sides: expected.sides.map((side) => side.map(over)), below: expected.below });
    // The two sides agree, so nothing warns: agreeing is arithmetic, not a sign that the rows are right.
    await expect(q.getByTestId('fmt-agree')).toHaveAttribute('data-ruled', 'true');
    await page.getByTestId('check').click();

    await expect(feedback).toHaveAttribute('data-correct', 'false');
    const score = `${count - 2} of ${count} rows right`;
    await expect(feedback.getByTestId('feedback-mistake')).toHaveText(`${score}.`);
    await expect(q.getByTestId('format-score')).toHaveText(score);
    await expect(q.getByTestId('fmt-yours')).toBeVisible();
    const wrong = q.getByTestId('format-wrong');
    await expect(wrong.locator('li')).toHaveCount(2);
    await expect(wrong.locator('[data-verdict="amount"]').filter({ hasText: 'Gross Profit b/d' })).toHaveCount(1);
    await expect(wrong.locator('[data-verdict="amount"]').filter({ hasText: 'Net Profit transferred to Capital A/c' })).toHaveCount(1);
    // The correct account is set out under it, so the student goes on knowing the net profit.
    const solution = q.getByTestId('format-solution');
    await expect(solution).toBeVisible();
    await expect(solution.locator('[data-closing="true"]')).toContainText('Net Profit transferred to Capital A/c');
    await expect(solution.locator('[data-closing="true"]')).toContainText((net.amounts[0] / 100).toLocaleString('en-IN'));
    // Still one panel, the case, with the place of the part in it; a part of a case has no similar question.
    await expect(panel).toHaveCount(1);
    await expect(panel.getByTestId('case-note')).toHaveText(`Question 2 of ${PARTS} in this case`);
    await expect(q.getByTestId('data')).toHaveCount(0);
    await expect(page.getByTestId('try-similar')).toHaveCount(0);
    await page.setViewportSize({ width: 360, height: 740 });
    expect(await noSidewaysScroll(page)).toBe(true);

    // On to the Balance Sheet, whose capital takes the net profit just shown.
    await page.getByTestId('continue').click();
    await expect(q).toHaveAttribute('data-question-id', partId(3));
    await expect(q.getByTestId('prompt-head')).toHaveText(/^Prepare the Balance Sheet of /);
    await expectOnePanel(q, 3);
    await answerCurrentQuestion(page);
    await expect(feedback).toHaveAttribute('data-correct', 'true');
    await expect(q.getByTestId('format-solution')).toContainText(`Add: Net Profit ₹${(net.amounts[0] / 100).toLocaleString('en-IN')}`);
    await page.getByTestId('continue').click();
    await expect(page.getByTestId('results-score')).toHaveText(`2 of ${PARTS} correct`);

    // The Mistakes screen lists the part with its case, folded, and its review has no Data panel of its own.
    await page.goto('/mistakes');
    const item = page.locator(`[data-testid="mistake-item"][data-question-id="${id}"]`);
    await expect(item.getByTestId('mistake-what')).toHaveText(`${score}.`);
    await expect(item.getByTestId('case')).toHaveAttribute('data-open', 'false');
    await item.getByTestId('mistake-show-entry').click();
    await expect(item.getByTestId('format-score')).toHaveText(score);
    await expect(item.getByTestId('format-solution')).toBeVisible();
    await expect(item.getByTestId('case')).toHaveCount(1);
    await expect(item.getByTestId('data')).toHaveCount(0);
    await item.getByTestId('case-toggle').click();
    await expect(item.getByTestId('case-text')).toContainText('The trial balance on that date:');
    expect(await noSidewaysScroll(page)).toBe(true);
  });

  test('keeps the case within reach while an account is filled in, on a phone 360 px wide and on a laptop', async ({ page }) => {
    test.setTimeout(180_000);
    await createProfile(page, 'Varun', { unlockAll: true });
    await page.setViewportSize({ width: 360, height: 740 });
    await page.goto(`/cases/play/${stage.id}?case=${CASE_ID}`);
    const q = question(page);
    const panel = q.getByTestId('case');
    const text = panel.getByTestId('case-text');
    await expect(q).toHaveAttribute('data-question-id', partId(1));
    await expectOnePanel(q, 1);
    const expected = await expectedOf(page);
    const lines = (await text.innerText()).split('\n');
    expect(lines.length).toBeGreaterThanOrEqual(15);

    /** Under the bar of the player and wholly on screen, however far the page has been scrolled. */
    const inReach = async () => {
      const bar = (await page.getByTestId('player-close').boundingBox())!;
      const box = (await panel.boundingBox())!;
      const height = page.viewportSize()!.height;
      expect(box.y).toBeGreaterThanOrEqual(bar.y + bar.height - 1);
      // On a laptop the app's top bar stands above the player while the page is at its top (it scrolls away after).
      const topBar = await page.evaluate(() => Math.max(0, document.querySelector('[data-testid="topbar-title"]')?.closest('header')?.getBoundingClientRect().bottom ?? 0));
      expect(box.y).toBeLessThan(120 + topBar);
      expect(box.y + box.height).toBeLessThanOrEqual(height * 0.55);
      await expect(panel.getByTestId('case-toggle')).toBeInViewport();
    };

    // On a phone: open at the top, and a long trial balance scrolls inside the panel, not the page sideways.
    await inReach();
    expect(await text.evaluate((e) => e.scrollHeight > e.clientHeight)).toBe(true);
    expect(await text.evaluate((e) => e.scrollWidth <= e.clientWidth)).toBe(true);
    expect(await noSidewaysScroll(page)).toBe(true);
    // The rows are entered with the case open above them: one row of each side, the page scrolled to the last control.
    for (const side of [0, 1] as const) {
      await showSide(q, side);
      await q.getByTestId(`fmt-s${side}-label-0`).click();
      await page.getByTestId(`picker-option-${expected.sides[side][0].label}`).click();
      await q.getByTestId(`fmt-s${side}-amount-0-0`).fill(String(expected.sides[side][0].amounts[0] / 100));
      if (side === 0) {
        // The first figure typed folds the case away on a phone, so the rows have the screen; opened again, it stays.
        await expect(panel).toHaveAttribute('data-open', 'false');
        await inReach();
        await panel.getByTestId('case-toggle').click();
      }
      await q.getByTestId(`fmt-s${side}-add`).scrollIntoViewIfNeeded();
      await inReach();
      await expect(text).toBeVisible();
    }
    await q.getByTestId('fmt-agree').scrollIntoViewIfNeeded();
    await inReach();
    // The last line of the case can be read without leaving the row: the text scrolls inside its panel.
    await text.evaluate((e) => e.scrollTo(0, e.scrollHeight));
    expect((await text.innerText()).split('\n').at(-1)).toContain('No capital was brought in during the year.');
    expect(await text.evaluate((e) => e.scrollTop > 0 && e.scrollTop + e.clientHeight >= e.scrollHeight - 1)).toBe(true);
    await inReach();
    // Folded, it is one line at the top and is opened again from there.
    await panel.getByTestId('case-toggle').click();
    await expect(text).toBeHidden();
    await inReach();
    await panel.getByTestId('case-toggle').click();
    await expect(text).toBeVisible();
    expect(await noSidewaysScroll(page)).toBe(true);

    // On a laptop the two sides stand side by side under the same panel, which follows the page in the same way.
    await page.setViewportSize({ width: 1280, height: 800 });
    await expect(q.getByTestId('fmt-side-0')).toBeVisible();
    await expect(q.getByTestId('fmt-side-1')).toBeVisible();
    await expect(q.getByTestId('fmt-s0-amount-0-0')).toHaveValue(String(expected.sides[0][0].amounts[0] / 100));
    await expectOnePanel(q, 1);
    await page.evaluate(() => window.scrollTo(0, 0));
    await inReach();
    await q.getByTestId('fmt-agree').scrollIntoViewIfNeeded();
    await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
    await inReach();
    await expect(text).toBeVisible();
    expect(await noSidewaysScroll(page)).toBe(true);
    // Folding it for the rest of the account is the same one click as in the helper the other tests use.
    await foldData(q);
    await expect(panel).toHaveAttribute('data-open', 'false');
  });

  test('as the 6-mark question of a mock paper survives a reload and is marked with a credit for each part', async ({ page }) => {
    test.setTimeout(300_000);
    // The first full paper that sets the chained case. A paper is a pure function of its number, so the test knows it.
    const number = Array.from({ length: 40 }, (_, i) => i + 1).find((n) => buildPaper({ kind: 'full', number: n }).entries.some((e) => e.caseId === CASE_ID))!;
    expect(number).toBeDefined();
    const paper = buildPaper({ kind: 'full', number });
    const entry = paper.entries.find((e) => e.caseId === CASE_ID)!;
    const steps = paperSteps(paper).filter((s) => s.entry === entry);
    expect(steps.map((s) => s.question.type)).toEqual(['account', 'account', 'account']);
    const [trading, profitAndLoss] = steps.map((s) => s.question);
    if (trading.type !== 'account' || profitAndLoss.type !== 'account') throw new Error('not accounts');
    const count = (q: typeof trading) => q.sides.flatMap((s) => [...s.rows, ...s.below]).length;

    await createProfile(page, 'Varun');
    // Only the next paper of a kind can be opened: the one before it is on the device, handed in.
    if (number > 1) {
      await store(page, 'mockPapers', [
        { id: 'e2e-paper', courseId: 'cbse-11-accountancy', paper: `full.${number - 1}`, sessionId: 'e2e-session', startedAt: 1000, allowedMs: 60_000, answers: {}, flagged: [], timeMs: {}, current: 0, submittedAt: 2000, marks: 0, maxMarks: 80, recorded: true },
      ]);
    }
    await page.setViewportSize({ width: 360, height: 740 });
    await page.goto(`/mock/paper?paper=${paper.key}`);
    await expect(page.getByTestId('mock-rule-chained')).toContainText('earns its share for the rows or entries that are right');
    await page.getByTestId('mock-start').click();
    await expect(page.getByTestId('exam')).toBeVisible();

    const q = question(page);
    const jump = async (label: string) => {
      await page.getByTestId('exam-list-toggle').click();
      await page.getByTestId(`exam-jump-${label}`).click();
    };
    // Part (a), the Trading Account: every row right.
    await jump(steps[0].label);
    await expect(q).toHaveAttribute('data-question-id', trading.id);
    await expect(page.getByTestId('exam-position')).toContainText(`${entry.marks} marks shared by ${PARTS} parts`);
    await expectOnePanel(q, 1, `Part 1 of ${PARTS} of this case`);
    for (const testId of ['check', 'hint', 'feedback']) await expect(page.getByTestId(testId)).toHaveCount(0);
    await enterAnswer(page);
    expect(await noSidewaysScroll(page)).toBe(true);

    // Part (b), the Profit and Loss Account: every row but the net profit, which is left out.
    await page.getByTestId('exam-next').click();
    await expect(q).toHaveAttribute('data-question-id', profitAndLoss.id);
    await expectOnePanel(q, 2, `Part 2 of ${PARTS} of this case`);
    const expected = await expectedOf(page);
    const kept = expected.sides[0].filter((r) => r.label !== 'Net Profit transferred to Capital A/c');
    expect(kept).toHaveLength(expected.sides[0].length - 1);
    await fillAccount(page, { sides: [kept, expected.sides[1]], below: expected.below });
    await expect(q.getByTestId('fmt-agree')).toHaveText('The two sides do not agree yet.');

    // After a reload the paper opens on the part it was left on, with its rows, and part (a) is still answered.
    await page.reload();
    await expect(page.getByTestId('exam')).toBeVisible();
    await expect(q).toHaveAttribute('data-question-id', profitAndLoss.id);
    await expectOnePanel(q, 2, `Part 2 of ${PARTS} of this case`);
    await showSide(q, 0);
    for (const [i, row] of kept.entries()) {
      await expect(q.getByTestId(`fmt-s0-label-${i}`)).toContainText(row.label);
      await expect(q.getByTestId(`fmt-s0-amount-${i}-0`)).toHaveValue(String(row.amounts[0] / 100));
    }
    await showSide(q, 1);
    await expect(q.getByTestId('fmt-s1-label-0')).toContainText('Gross Profit b/d');
    await page.getByTestId('exam-list-toggle').click();
    await expect(page.getByTestId(`exam-jump-${steps[0].label}`)).toHaveAttribute('data-answered', 'true');
    await expect(page.getByTestId(`exam-jump-${steps[1].label}`)).toHaveAttribute('data-answered', 'true');
    await expect(page.getByTestId(`exam-jump-${steps[2].label}`)).toHaveAttribute('data-answered', 'false');
    await page.getByTestId('exam-list-toggle').click();

    // Part (c), the Balance Sheet, is left out. The paper is handed in.
    await page.getByTestId('exam-submit').click();
    await page.getByTestId('exam-confirm-yes').click();
    await expect(page.getByTestId('mock-result')).toBeVisible();

    // 6 x (1 + all but one row of the second account + 0) / 3, to the nearest half mark; nothing else was answered.
    const rows = count(profitAndLoss);
    const earned = creditMarks(6, [{ right: 1, total: 1 }, { right: rows - 1, total: rows }, { right: 0, total: 1 }]);
    // More than the 2 marks one part right of three used to earn, and less than the 6 of a case wholly right.
    expect(earned).toBeGreaterThan(2);
    expect(earned).toBeLessThanOrEqual(4);
    await expect(page.getByTestId('mock-marks')).toHaveText(`${formatMarks(earned)} / 80`);
    const script = page.getByTestId(`script-entry-${entry.number}`);
    await expect(page.getByTestId(`script-marks-${entry.number}`)).toHaveText(`${formatMarks(earned)} / 6 marks`);
    // The rule is stated under the case, and each long part says what it earned of its share.
    await expect(page.getByTestId(`script-shared-${entry.number}`)).toHaveText(chainedRuleText(6, PARTS));
    await expect(page.getByTestId(`script-credit-${steps[0].label}`)).toHaveText(`${count(trading)} of ${count(trading)} rows right: all of this part's 2 marks.`);
    await expect(page.getByTestId(`script-credit-${steps[1].label}`)).toHaveText(`${rows - 1} of ${rows} rows right: ${rows - 1}/${rows} of this part's 2 marks.`);
    await expect(page.getByTestId(`script-credit-${steps[2].label}`)).toHaveCount(0);
    await expect(page.getByTestId(`script-verdict-${steps[0].label}`)).toHaveText('Correct');
    await expect(page.getByTestId(`script-verdict-${steps[1].label}`)).toHaveText('Not right');
    await expect(page.getByTestId(`script-verdict-${steps[2].label}`)).toHaveText('Not answered');
    // The case stands once over its three parts, folded, and no part has a Data panel of its own.
    await expect(script.getByTestId('case')).toHaveCount(1);
    await expect(script.getByTestId('case')).toHaveAttribute('data-open', 'false');
    await expect(script.getByTestId('data')).toHaveCount(0);
    const second = script.getByTestId(`script-step-${steps[1].label}`);
    await expect(second.getByTestId('format-score')).toHaveText(`${rows - 1} of ${rows} rows right`);
    await expect(second.getByTestId('format-wrong').locator('[data-verdict="missing"]')).toContainText('Net Profit transferred to Capital A/c');
    await expect(second.getByTestId('format-solution')).toBeVisible();
    // The part that was not answered still shows the account an examiner expects.
    await expect(script.getByTestId(`script-step-${steps[2].label}`).getByTestId('format-solution')).toBeVisible();
    expect(await noSidewaysScroll(page)).toBe(true);
    // One attempt for each part that was answered, as for any other question.
    const attempts = (await readStoredEvents(page)).attempts.map((a) => a.questionId);
    expect(attempts.filter((id) => id === trading.id || id === profitAndLoss.id)).toHaveLength(2);
    expect(attempts).toHaveLength(2);
  });
});
