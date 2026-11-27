import { expect, test, type Page } from '@playwright/test';
import { createProfile, fillJournal, fillJournalSet, packOf, playSession, readStoredEvents, seedPassedLevels, setEntry, swapSides, JE, levelOf, type EntryLine } from './helpers';

test.beforeEach(async ({ page }) => {
  await createProfile(page, 'Varun');
});

const SWAPPED = 'The debit and credit sides are swapped.';

async function reverseAnswer(page: Page) {
  const expected = JSON.parse((await page.getByTestId('question').getAttribute('data-expected'))!);
  await fillJournal(
    page,
    expected.lines.map((l: { side: 'Dr' | 'Cr' }) => ({ ...l, side: l.side === 'Dr' ? 'Cr' : 'Dr' })),
  );
  await page.getByTestId('check').click();
}

/** Answers the first two questions of level 4 with the sides swapped, then leaves the level. Returns their ids. */
async function missTwoInLevelFour(page: Page): Promise<string[]> {
  await seedPassedLevels(page, 3);
  await page.goto(`/play/${levelOf(JE, 4)}`);
  const q = page.getByTestId('question');
  const ids: string[] = [];
  for (let i = 0; i < 2; i++) {
    await expect(q).toBeVisible();
    ids.push((await q.getAttribute('data-question-id'))!);
    await reverseAnswer(page);
    await expect(page.getByTestId('feedback')).toHaveAttribute('data-correct', 'false');
    await page.getByTestId('continue').click();
  }
  await page.getByTestId('player-close').click();
  await page.getByTestId('player-leave').click();
  await expect(page).toHaveURL(new RegExp(`/topics/${JE}$`));
  return ids;
}

test('a new learner sees that no mistakes are waiting', async ({ page }) => {
  await page.goto('/mistakes');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Mistakes');
  await expect(page.getByTestId('mistakes-empty')).toHaveText('No mistakes waiting. Nicely done.');
  await expect(page.getByTestId('mistake-item')).toHaveCount(0);
  await expect(page.getByTestId('mistakes-review')).toHaveCount(0);
  await expect(page.getByTestId('mistakes-corrected')).toHaveText('Corrected so far: 0');
});

test('two wrong answers are listed in words, then cleared by answering them right in a later session', async ({ page }) => {
  const ids = await missTwoInLevelFour(page);

  await page.goto('/mistakes');
  const items = page.getByTestId('mistake-item');
  await expect(items).toHaveCount(2);
  await expect(page.getByTestId('mistakes-empty')).toHaveCount(0);
  for (const item of await items.all()) {
    await expect(item.getByTestId('mistake-what')).toHaveText(SWAPPED);
    await expect(item.getByTestId('mistake-attempts')).toHaveText('Attempted 1 time');
    await expect(item.getByTestId('mistake-concept')).not.toBeEmpty();
    await expect(item.getByTestId('mistake-prompt')).not.toBeEmpty();
  }
  const listed = await Promise.all((await items.all()).map((i) => i.getAttribute('data-question-id')));
  expect(new Set(listed)).toEqual(new Set(ids));
  await expect(page.getByTestId('mistakes-note')).toContainText('answering it correctly in a later session');
  await expect(page.getByTestId('mistakes-corrected')).toHaveText('Corrected so far: 0');

  // A journal question can show its correct entry.
  const first = items.first();
  await expect(first.getByTestId('solution')).toBeHidden();
  await first.getByTestId('mistake-show-entry').click();
  await expect(first.getByTestId('solution')).toBeVisible();

  await expect(page.getByTestId('mistakes-review')).toHaveAttribute('href', '/practice/mistakes');
  await page.getByTestId('mistakes-review').click();
  await expect(page).toHaveURL(/\/practice\/mistakes$/);
  expect(await playSession(page)).toBe(2);
  await expect(page.getByTestId('results-score')).toHaveText('2 of 2 correct');

  await page.goto('/mistakes');
  await expect(page.getByTestId('mistakes-empty')).toBeVisible();
  await expect(page.getByTestId('mistake-item')).toHaveCount(0);
  await expect(page.getByTestId('mistakes-corrected')).toHaveText('Corrected so far: 2');
});

test('a set with one entry wrong shows that entry as the student wrote it, also after a reload', async ({ page }) => {
  test.setTimeout(180_000);
  const level = packOf(JE).levels.find((l) => l.type === 'set_practice')!;
  await seedPassedLevels(page, 'all', JE);
  await page.goto(`/play/${level.id}`);
  const q = page.getByTestId('question');
  await expect(q).toHaveAttribute('data-question-type', 'journal_set');
  const id = (await q.getAttribute('data-question-id'))!;
  const entries: EntryLine[][] = JSON.parse((await q.getAttribute('data-expected'))!).entries;
  const count = entries.length;
  const written = swapSides(entries[1]);

  // Every entry right but the second, which is written with its sides the wrong way round.
  await fillJournalSet(page, entries.map((lines, k) => (k === 1 ? written : lines)));
  await page.getByTestId('check').click();
  await expect(page.getByTestId('feedback')).toHaveAttribute('data-correct', 'false');
  // What the review shows of the student's entry: its accounts by name, to compare with the Mistakes screen.
  const names = await Promise.all(written.map((_, i) => setEntry(page, 1).getByTestId(`je-account-${i}`).innerText()));
  await page.getByTestId('continue').click();
  await page.getByTestId('player-close').click();
  await page.getByTestId('player-leave').click();

  // The attempt holds the answer as it was checked, and nothing else in the log holds one.
  const stored = (await readStoredEvents(page)).attempts as { questionId: string; answer?: { type: string; entries: EntryLine[][] } }[];
  expect(stored.filter((a) => a.answer !== undefined).map((a) => a.questionId)).toEqual([id]);
  expect(stored.find((a) => a.questionId === id)!.answer).toEqual({ type: 'journal_set', entries: entries.map((lines, k) => (k === 1 ? written : lines)) });

  await page.setViewportSize({ width: 360, height: 740 });
  await page.goto('/mistakes');
  const item = page.locator(`[data-testid="mistake-item"][data-question-id="${id}"]`);
  const shown = async () => {
    await expect(item.getByTestId('mistake-what')).toHaveText(`${count - 1} of ${count} entries right.`);
    // Folded until it is asked for.
    await expect(item.getByTestId('set-review')).toBeHidden();
    await item.getByTestId('mistake-show-entry').click();
    await expect(item.getByTestId('set-score')).toHaveText(`${count - 1} of ${count} entries right`);
    // The entries that were right are one line each. The second is the student's own entry, row by row, marked.
    await expect(item.locator('[data-testid^="set-entry-"][data-correct="true"]')).toHaveCount(count - 1);
    const wrong = setEntry(item, 1);
    await expect(wrong).toHaveAttribute('data-correct', 'false');
    await expect(wrong.getByTestId('set-mistake-1')).toHaveText(SWAPPED);
    await expect(wrong.locator('[data-testid^="je-row-status-"]')).toHaveCount(written.length);
    for (const [i, line] of written.entries()) {
      await expect(wrong.getByTestId(`je-account-${i}`)).toHaveText(names[i]);
      await expect(wrong.getByTestId(`je-account-${i}`)).toBeDisabled();
      await expect(wrong.getByTestId(`je-side-${i}-${line.side}`)).toHaveAttribute('aria-pressed', 'true');
      await expect(wrong.getByTestId(`je-amount-${i}`)).toHaveValue((line.amount / 100).toLocaleString('en-IN'));
      await expect(wrong.getByTestId(`je-row-status-${i}`)).toHaveText('Wrong side');
    }
    // Then the correct entry and the reasons for it, as before.
    await expect(wrong.getByTestId('set-solution-1')).toBeVisible();
    await expect(wrong.getByTestId('set-steps-1').locator('li')).not.toHaveCount(0);
    await expect(item.locator('[data-testid^="set-solution-"]')).toHaveCount(1);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  };
  await shown();
  // It comes from what is stored, not from the page that was open: the same after a reload.
  await page.reload();
  await shown();
});

test('a revealed answer is worded as such, and a wrong choice has a plain line', async ({ page }) => {
  await seedPassedLevels(page, 1);
  await page.goto(`/play/${levelOf(JE, 2)}`);
  const q = page.getByTestId('question');
  await expect(q).toBeVisible();

  // Question 1: a wrong option.
  const expected = JSON.parse((await q.getAttribute('data-expected'))!);
  await page.getByTestId(`mcq-option-${['a', 'b', 'c', 'd'].find((id) => id !== expected)}`).click();
  await page.getByTestId('check').click();
  await expect(page.getByTestId('feedback')).toHaveAttribute('data-correct', 'false');
  await page.getByTestId('continue').click();

  // Question 2: both hints, then the answer is shown.
  await page.getByTestId('hint').click();
  await page.getByTestId('hint').click();
  await page.getByTestId('reveal').click();
  await expect(page.getByTestId('feedback')).toHaveAttribute('data-correct', 'false');
  await page.getByTestId('player-close').click();
  await page.getByTestId('player-leave').click();

  await page.goto('/mistakes');
  await expect(page.getByTestId('mistake-item')).toHaveCount(2);
  await expect(page.getByTestId('mistake-what').filter({ hasText: 'Answer was shown' })).toHaveCount(1);
  await expect(page.getByTestId('mistake-what').filter({ hasText: 'The answer was not right.' })).toHaveCount(1);
  // Only journal entries have an entry to show.
  await expect(page.getByTestId('mistake-show-entry')).toHaveCount(0);
});

test('the Dashboard, the Practice hub and Progress all lead here', async ({ page }) => {
  await missTwoInLevelFour(page);

  await page.goto('/home');
  await expect(page.getByTestId('quick-mistakes')).toHaveAttribute('href', '/mistakes');
  await expect(page.getByTestId('quick-mistakes')).toContainText('2 waiting');

  await page.goto('/practice');
  await expect(page.getByTestId('hub-mistakes')).toHaveAttribute('href', '/mistakes');
  await expect(page.getByTestId('hub-mistakes-count')).toHaveText('2 waiting');

  await page.goto('/progress');
  await expect(page.getByTestId('progress-mistakes')).toHaveText('2 mistakes waiting');
  await page.getByTestId('progress-mistakes').click();
  await expect(page).toHaveURL(/\/mistakes$/);
  await expect(page.getByTestId('mistake-item')).toHaveCount(2);
});

test('the feedback panel and the list use the same wording', async ({ page }) => {
  await seedPassedLevels(page, 3);
  await page.goto(`/play/${levelOf(JE, 4)}`);
  await expect(page.getByTestId('question')).toBeVisible();
  await reverseAnswer(page);
  await expect(page.getByTestId('feedback')).toContainText(SWAPPED);
  await page.getByTestId('player-close').click();
  await page.getByTestId('player-leave').click();
  await page.goto('/mistakes');
  await expect(page.getByTestId('mistake-what')).toHaveText(SWAPPED);
});
