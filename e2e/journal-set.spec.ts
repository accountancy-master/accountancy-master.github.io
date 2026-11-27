import { expect, test, type Page } from '@playwright/test';
import { buildPaper, caseMarks, paperSteps } from '../src/learning/mockPaper';
import { formatMarks } from '../src/play/mockSitting';
import { createProfile, fillJournal, fillJournalSet, packOf, readStoredEvents, seedPassedLevels, setEntry, swapSides, JE, type EntryLine } from './helpers';

// "Journalise the following transactions": several dated transactions, one entry for each, in one journal.

/** The first level of sets of Journal Entries: its id does not follow its position. */
const LEVEL = packOf(JE).levels.find((l) => l.type === 'set_practice')!;
const SWAPPED = 'The debit and credit sides are swapped.';

const noSidewaysScroll = (page: Page) => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);
const question = (page: Page) => page.getByTestId('question');
const blocks = (page: Page) => page.locator('[data-testid^="set-entry-"]');

/** The entries of the set on screen, from what the test build exposes. */
async function expectedEntries(page: Page): Promise<EntryLine[][]> {
  await expect(question(page)).toHaveAttribute('data-question-type', 'journal_set');
  return JSON.parse((await question(page).getAttribute('data-expected'))!).entries;
}

test.beforeEach(async ({ page }) => {
  await createProfile(page, 'Varun');
});

test('a level of sets is played to the end with every entry right', async ({ page }) => {
  test.setTimeout(180_000);
  expect(LEVEL.id).toBe(`${JE}-journal-sets-1`);
  await seedPassedLevels(page, 'all', JE);
  await page.goto(`/play/${LEVEL.id}`);

  for (let n = 0; n < LEVEL.generate!.count; n++) {
    const entries = await expectedEntries(page);
    const count = entries.length;
    await expect(question(page).getByTestId('prompt-head')).toHaveText('Journalise the following transactions.');
    await expect(blocks(page)).toHaveCount(count);

    if (n === 0) {
      // Every block shows its own date and transaction, and starts empty. Nothing can be checked yet.
      for (let k = 0; k < count; k++) {
        await expect(page.getByTestId(`set-state-${k}`)).toHaveText('Empty');
        await expect(page.getByTestId(`set-text-${k}`)).not.toBeEmpty();
      }
      await expect(page.getByTestId('check')).toBeDisabled();
      // The entries can be written in any order: the last one first.
      const last = setEntry(page, count - 1);
      await last.getByTestId('je-account-0').click();
      await page.getByTestId(`picker-option-${entries[count - 1][0].accountId}`).click();
      await expect(page.getByTestId(`set-state-${count - 1}`)).toHaveText('In progress');
      await fillJournal(page, entries[count - 1], last);
      await expect(page.getByTestId(`set-state-${count - 1}`)).toHaveText('Balanced');
      await expect(last.getByTestId('je-balance')).toHaveText('Debits and credits match');
      await expect(page.getByTestId('set-progress')).toHaveText(`1 of ${count} entries balanced. ${count - 1} entries are still empty.`);
      await expect(page.getByTestId('check')).toBeEnabled();
      await fillJournalSet(page, entries.slice(0, count - 1));
    } else {
      await fillJournalSet(page, entries);
    }
    await expect(page.getByTestId('set-progress')).toHaveText(`${count} of ${count} entries balanced.`);

    await page.getByTestId('check').click();
    await expect(page.getByTestId('feedback')).toHaveAttribute('data-correct', 'true');
    await expect(page.getByTestId('set-score')).toHaveText(`${count} of ${count} entries right`);
    // Every entry right: each is one line, and no correct entry needs showing.
    await expect(page.locator('[data-testid^="set-entry-"][data-correct="true"]')).toHaveCount(count);
    await expect(page.locator('[data-testid^="set-solution-"]')).toHaveCount(0);
    await page.getByTestId('continue').click();
    await expect(page.getByTestId('feedback')).toHaveCount(0);
  }
  await expect(page.getByTestId('results-passed')).toHaveText('Passed');
});

test('one wrong entry is pointed out with the correct entry, and the set is listed on the Mistakes screen', async ({ page }) => {
  test.setTimeout(180_000);
  await seedPassedLevels(page, 'all', JE);
  await page.goto(`/play/${LEVEL.id}`);
  const entries = await expectedEntries(page);
  const count = entries.length;
  const id = (await question(page).getAttribute('data-question-id'))!;
  const [first, second] = [setEntry(page, 0), setEntry(page, 1)];

  // Only the first entry is written: Check says how many are still empty before it checks anything.
  await fillJournal(page, entries[0], first);
  await page.getByTestId('check').click();
  await expect(page.getByTestId('set-confirm')).toHaveText(`${count - 1} entries are still empty. Press Check again to check the journal as it is.`);
  await expect(page.getByTestId('feedback')).toHaveCount(0);

  // The keyboard works as in a single entry: Enter in the last amount of an entry goes on to the next entry, and
  // Escape in the account picker gives the focus back to the row that opened it.
  await first.getByTestId(`je-amount-${entries[0].length - 1}`).press('Enter');
  await expect(second.getByTestId('je-account-0')).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page.getByTestId('picker')).toBeVisible();
  await expect(page.getByTestId('picker-search')).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('picker')).toHaveCount(0);
  await expect(second.getByTestId('je-account-0')).toBeFocused();

  // A line that is begun and not finished is caught before checking, with its entry and its line.
  await second.getByTestId('je-account-0').click();
  await page.getByTestId(`picker-option-${entries[1][0].accountId}`).click();
  await page.getByTestId('check').click();
  await expect(page.getByTestId('je-error')).toHaveText('Entry 2, line 1: choose Dr or Cr.');
  await expect(page.getByTestId('feedback')).toHaveCount(0);

  // The second entry with its sides the wrong way round (it still balances, and nothing says it is wrong), the rest right.
  await fillJournal(page, swapSides(entries[1]), second);
  await expect(page.getByTestId('set-state-1')).toHaveText('Balanced');
  await fillJournalSet(page, entries.map((lines, k) => (k < 2 ? [] : lines)));
  await page.getByTestId('check').click();

  const feedback = page.getByTestId('feedback');
  await expect(feedback).toHaveAttribute('data-correct', 'false');
  await expect(feedback.getByTestId('feedback-mistake')).toHaveText(`${count - 1} of ${count} entries right.`);
  await expect(page.getByTestId('set-score')).toHaveText(`${count - 1} of ${count} entries right`);
  // Which one: the second, with the student's own entry, the correct entry and the reasons. The others are one line each.
  await expect(page.locator('[data-testid^="set-entry-"][data-correct="true"]')).toHaveCount(count - 1);
  await expect(second).toHaveAttribute('data-correct', 'false');
  await expect(page.getByTestId('set-mistake-1')).toHaveText(SWAPPED);
  await expect(second.getByTestId('je-row-status-0')).toHaveText('Wrong side');
  await expect(second.getByTestId('je-account-0')).toBeDisabled();
  await expect(page.getByTestId('set-solution-1')).toBeVisible();
  await expect(page.getByTestId('set-steps-1').locator('li')).not.toHaveCount(0);
  await expect(page.locator('[data-testid^="set-solution-"]')).toHaveCount(1);
  await expect(page.getByTestId('try-similar')).toBeVisible();

  // Leave the level: the set waits on the Mistakes screen, saying how many entries were right and which was not.
  await page.getByTestId('continue').click();
  await page.getByTestId('player-close').click();
  await page.getByTestId('player-leave').click();
  await page.goto('/mistakes');
  const item = page.locator(`[data-testid="mistake-item"][data-question-id="${id}"]`);
  await expect(item.getByTestId('mistake-what')).toHaveText(`${count - 1} of ${count} entries right.`);
  await expect(item.getByTestId('prompt-head')).toHaveText('Journalise the following transactions.');
  await item.getByTestId('mistake-show-entry').click();
  await expect(item.getByTestId('set-entry-0')).toHaveAttribute('data-correct', 'true');
  await expect(item.getByTestId('set-entry-1')).toHaveAttribute('data-correct', 'false');
  await expect(item.getByTestId('set-mistake-1')).toHaveText(SWAPPED);
  await expect(item.getByTestId('set-solution-1')).toBeVisible();
  await expect(item.locator('[data-testid^="set-solution-"]')).toHaveCount(1);
});

test('a set in a mock paper survives a reload and is marked with shared marks', async ({ page }) => {
  test.setTimeout(240_000);
  // The first topic test on Journal Entries that asks a set. A paper is a pure function of its number, so the test
  // knows it; the papers before it are started and handed in empty, because only the next paper can be opened.
  const number = Array.from({ length: 12 }, (_, i) => i + 1).find((n) =>
    buildPaper({ kind: 'topic', topicId: JE, number: n }).entries.some((e) => e.questions[0].type === 'journal_set'),
  )!;
  expect(number).toBeDefined();
  const paper = buildPaper({ kind: 'topic', topicId: JE, number });
  const step = paperSteps(paper).find((s) => s.question.type === 'journal_set')!;
  const set = step.question;
  if (set.type !== 'journal_set') throw new Error('not a set');
  const count = set.entries.length;
  const marks = step.entry.marks;
  const earned = formatMarks(caseMarks(marks, count - 1, count));

  await page.setViewportSize({ width: 360, height: 740 });
  for (let n = 1; n < number; n++) {
    await page.goto(`/mock/paper?paper=topic.${JE}.${n}`);
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
  await expect(question(page)).toHaveAttribute('data-question-id', set.id);
  await expect(page.getByTestId('exam-position')).toContainText(`${marks} marks shared by ${count} entries`);
  // Nothing in a paper checks an answer.
  for (const testId of ['check', 'hint', 'feedback']) await expect(page.getByTestId(testId)).toHaveCount(0);

  // Every entry right but the second, which has its sides the wrong way round.
  const entries = await expectedEntries(page);
  await fillJournalSet(page, entries.map((lines, k) => (k === 1 ? swapSides(lines) : lines)));
  await expect(page.getByTestId('set-progress')).toHaveText(`${count} of ${count} entries balanced.`);
  expect(await noSidewaysScroll(page)).toBe(true);

  // After a reload the journal is as it was left: every block with its rows.
  await page.reload();
  await expect(page.getByTestId('exam')).toBeVisible();
  await expect(question(page)).toHaveAttribute('data-question-id', set.id);
  await expect(blocks(page)).toHaveCount(count);
  for (let k = 0; k < count; k++) {
    await expect(page.getByTestId(`set-state-${k}`)).toHaveText('Balanced');
    await expect(setEntry(page, k).getByTestId('je-amount-0')).toHaveValue(String(entries[k][0].amount / 100));
  }
  await expect(setEntry(page, 1).getByTestId(`je-side-0-${entries[1][0].side === 'Dr' ? 'Cr' : 'Dr'}`)).toHaveAttribute('aria-pressed', 'true');
  await page.getByTestId('exam-list-toggle').click();
  await expect(page.getByTestId(`exam-jump-${step.label}`)).toHaveAttribute('data-answered', 'true');
  await page.getByTestId('exam-list-toggle').click();

  await page.getByTestId('exam-submit').click();
  await page.getByTestId('exam-confirm-yes').click();
  await expect(page.getByTestId('mock-result')).toBeVisible();

  // The marks of the set are shared among its entries: all but one right, to the nearest half mark.
  await expect(page.getByTestId('mock-marks')).toHaveText(`${earned} / 20`);
  const script = page.getByTestId(`script-entry-${step.entry.number}`);
  await expect(page.getByTestId(`script-marks-${step.entry.number}`)).toHaveText(`${earned} / ${marks} marks`);
  await expect(page.getByTestId(`script-shared-${step.entry.number}`)).toHaveText(`The marks are shared by its ${count} entries: ${count - 1} right.`);
  await expect(script.getByTestId('set-score')).toHaveText(`${count - 1} of ${count} entries right`);
  await expect(script.locator('[data-testid^="set-entry-"][data-correct="true"]')).toHaveCount(count - 1);
  await expect(script.getByTestId('set-entry-1')).toHaveAttribute('data-correct', 'false');
  await expect(script.getByTestId('set-mistake-1')).toHaveText(SWAPPED);
  await expect(script.getByTestId('set-entry-1').getByTestId('je-row-status-0')).toHaveText('Wrong side');
  await expect(script.getByTestId('set-solution-1')).toBeVisible();
  expect(await noSidewaysScroll(page)).toBe(true);
  // One attempt for the set, as for any other question that was answered.
  const attempts = (await readStoredEvents(page)).attempts.filter((a) => a.questionId === set.id);
  expect(attempts).toHaveLength(1);
});

test('the journal of the longest set fits a phone 360 px wide, as it is filled in and as it is marked, and a laptop', async ({ page }) => {
  test.setTimeout(120_000);
  await page.setViewportSize({ width: 360, height: 740 });
  await page.goto('/settings');
  const sample = page.getByTestId('e2e-set');
  await expect(sample).toHaveAttribute('data-entries', '8');
  const entries: EntryLine[][] = JSON.parse((await sample.getAttribute('data-expected'))!).entries;
  const open = page.getByTestId('e2e-set-open');
  const marked = page.getByTestId('e2e-set-marked');
  await expect(open.locator('[data-testid^="set-entry-"]')).toHaveCount(8);

  /** Nothing scrolls sideways, and nothing sticks out of the block of its transaction or off the screen. */
  const fits = async () => {
    expect(await noSidewaysScroll(page)).toBe(true);
    const out = await sample.evaluate((root) => {
      const found: string[] = [];
      for (const block of root.querySelectorAll('[data-testid^="set-entry-"]')) {
        const box = block.getBoundingClientRect();
        for (const el of block.querySelectorAll('*')) {
          const r = el.getBoundingClientRect();
          // Text for screen readers only is a one-pixel box that is not drawn.
          if (r.width <= 1 || el.closest('.sr-only')) continue;
          if (r.left < box.left - 1 || r.right > box.right + 1 || r.right > window.innerWidth) {
            found.push(`${block.getAttribute('data-testid')}: <${el.tagName.toLowerCase()}> ${el.getAttribute('data-testid') ?? el.textContent?.slice(0, 30)}`);
          }
        }
      }
      return found;
    });
    expect(out).toEqual([]);
  };

  // The longest entry there is, an opening entry of seven lines, and the last entry of the set.
  expect(entries[0].length).toBe(7);
  await fillJournal(page, entries[0], setEntry(open, 0));
  await fillJournal(page, entries[7], setEntry(open, 7));
  await expect(open.getByTestId('set-state-0')).toHaveText('Balanced');
  await expect(open.getByTestId('set-state-7')).toHaveText('Balanced');
  await expect(open.getByTestId('set-state-3')).toHaveText('Empty');
  await expect(open.getByTestId('set-progress')).toHaveText('2 of 8 entries balanced. 6 entries are still empty.');
  // On a phone each block keeps the note that says whether it balances; the two totals are left out.
  await expect(setEntry(open, 0).getByTestId('je-balance')).toHaveText('Debits and credits match');
  await expect(setEntry(open, 0).getByTestId('je-total-dr')).toBeHidden();
  await fits();

  // Marked: the second entry had its sides the wrong way round and the third was left empty.
  await expect(marked.getByTestId('set-score')).toHaveText('6 of 8 entries right');
  await expect(marked.locator('[data-testid^="set-entry-"][data-correct="true"]')).toHaveCount(6);
  await expect(marked.getByTestId('set-mistake-1')).toHaveText(SWAPPED);
  await expect(marked.getByTestId('set-mistake-2')).toHaveText('This entry was empty or not complete.');
  await expect(marked.getByTestId('set-solution-1')).toBeVisible();
  await expect(marked.getByTestId('set-solution-2')).toBeVisible();
  // The entry left empty has no entry of the student's to show.
  await expect(setEntry(marked, 2).locator('[data-testid^="je-row-"]')).toHaveCount(0);
  await expect(setEntry(marked, 1).getByTestId('je-row-status-0')).toHaveText('Wrong side');

  // The Mistakes card says the same from the stored code alone.
  const mistake = page.getByTestId('e2e-set-mistake');
  await expect(mistake.getByTestId('mistake-what')).toHaveText('6 of 8 entries right.');
  await mistake.getByTestId('mistake-show-entry').click();
  await expect(mistake.locator('[data-testid^="set-entry-"][data-correct="false"]')).toHaveCount(2);
  // That was an attempt made before answers were kept: it has no entry of the student's to show.
  await expect(mistake.locator('[data-testid^="je-row-"]')).toHaveCount(0);
  await fits();
  // The card of an attempt that kept its answer shows the student's own entry too, marked as the review marks it.
  const kept = page.getByTestId('e2e-set-kept');
  await expect(kept.getByTestId('mistake-what')).toHaveText('6 of 8 entries right.');
  await kept.getByTestId('mistake-show-entry').click();
  await expect(kept.getByTestId('set-score')).toHaveText('6 of 8 entries right');
  await expect(kept.locator('[data-testid^="set-entry-"][data-correct="true"]')).toHaveCount(6);
  await expect(setEntry(kept, 1).getByTestId('je-row-status-0')).toHaveText('Wrong side');
  await expect(setEntry(kept, 1).getByTestId('je-account-0')).toBeDisabled();
  await expect(setEntry(kept, 1).getByTestId('je-amount-0')).toHaveValue((entries[1][0].amount / 100).toLocaleString('en-IN'));
  await expect(setEntry(kept, 2).locator('[data-testid^="je-row-"]')).toHaveCount(0);
  await expect(kept.getByTestId('set-solution-1')).toBeVisible();
  await expect(kept.getByTestId('set-solution-2')).toBeVisible();
  await fits();

  // On a laptop the rows of an entry are a ruled table with its totals, and it still fits.
  await page.setViewportSize({ width: 1280, height: 800 });
  await expect(setEntry(open, 0).getByTestId('je-total-dr')).toBeVisible();
  await expect(setEntry(open, 0).getByTestId('je-total-dr')).toHaveText(await setEntry(open, 0).getByTestId('je-total-cr').innerText());
  await fits();
});
