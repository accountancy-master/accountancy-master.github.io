import { expect, test, type Page } from '@playwright/test';
import { describeSubtopic } from '../src/components/marathon/subtopicText';
import { findQuestion } from '../src/content/registry';
import { CONFIG } from '../src/learning/config';
import { MARATHON_SEED_BASE, SEEDS_PER_RUN } from '../src/learning/marathon';
import { marathonSubtopics } from '../src/learning/marathonSubtopics';
import { everythingIn } from '../src/learning/practice';
import { answerCurrentQuestion, createProfile, packOf, seedPassedLevels, showAnswer } from './helpers';

const TOPIC = 'ledger';
const BATCH = CONFIG.marathon.batch;
/** The topic of the subtopic test, and the last level (by order) the test passes of it. */
const SUBTOPIC_TOPIC = 'accounting-equation';
const SUBTOPIC_LEVELS = 7;

const noSidewaysScroll = (page: Page) => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);
const tally = async (page: Page) => ({
  answered: await page.getByTestId('tally-answered').innerText(),
  correct: await page.getByTestId('tally-correct').innerText(),
  streak: await page.getByTestId('tally-streak').innerText(),
  best: await page.getByTestId('tally-best').innerText(),
});

/** The marathon results as the device holds them. */
async function storedRuns(page: Page): Promise<{ kind: string; scope?: string; correct: number; total: number; bestStreak?: number }[]> {
  return page.evaluate(
    () =>
      new Promise((resolve, reject) => {
        const open = indexedDB.open('accountancy-master');
        open.onerror = () => reject(open.error);
        open.onsuccess = () => {
          const db = open.result;
          const req = db.transaction('sessionResults', 'readonly').objectStore('sessionResults').getAll();
          req.onsuccess = () => {
            db.close();
            resolve(req.result);
          };
          req.onerror = () => reject(req.error);
        };
      }),
  );
}

test.beforeEach(async ({ page }) => {
  await createProfile(page, 'Varun');
});

test('a marathon runs past the first batch until it is stopped, keeps its tally, and counts in the personal best', async ({ page }) => {
  test.setTimeout(150_000);
  await seedPassedLevels(page, 'all', TOPIC);
  await page.setViewportSize({ width: 360, height: 740 });

  // The picker: next to "Practise a topic" on the Practice screen, with a difficulty and no best yet.
  await page.goto('/practice');
  await expect(page.getByTestId('hub-marathon-count')).toHaveText('No run yet');
  await page.getByTestId('hub-marathon').click();
  await expect(page).toHaveURL(/\/practice\/marathon$/);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Marathon');
  await expect(page.getByTestId(`marathon-${TOPIC}-best`)).toHaveText('No run yet');
  await expect(page.getByTestId('marathon-all')).toHaveAttribute('href', '/practice/marathon/all');
  await expect(page.getByTestId('marathon-level-mixed')).toHaveAttribute('aria-pressed', 'true');
  await page.getByTestId('marathon-level-complex').click();
  await expect(page.getByTestId(`marathon-${TOPIC}`)).toHaveAttribute('href', `/practice/marathon/${TOPIC}?level=complex`);
  await page.getByTestId('marathon-level-mixed').click();
  await expect(page.getByTestId(`marathon-${TOPIC}`)).toHaveAttribute('href', `/practice/marathon/${TOPIC}`);
  expect(await noSidewaysScroll(page)).toBe(true);

  await page.getByTestId(`marathon-${TOPIC}`).click();
  await expect(page).toHaveURL(new RegExp(`/practice/marathon/${TOPIC}$`));
  const question = page.getByTestId('question');
  await expect(question).toBeVisible();
  await expect(page.getByTestId('marathon-stop')).toBeVisible();
  expect(await tally(page)).toEqual({ answered: '0', correct: '0', streak: '0', best: '0' });
  await expect(page.getByTestId('tally-time')).toHaveText(/^\d+:\d\d$/);
  expect(await noSidewaysScroll(page)).toBe(true);

  // Seven questions, two more than a batch holds: three right, one given up, three right.
  const TOTAL = BATCH + 2;
  const MISS = 3;
  const ids: string[] = [];
  for (let i = 0; i < TOTAL; i++) {
    await expect(question).toBeVisible();
    ids.push((await question.getAttribute('data-question-id'))!);
    if (i === MISS) await showAnswer(page);
    else await answerCurrentQuestion(page);
    // The usual feedback after each, with the working or the reason; no similar question, the next one comes anyway.
    const feedback = page.getByTestId('feedback');
    await expect(feedback).toHaveAttribute('data-correct', i === MISS ? 'false' : 'true');
    await expect(page.getByTestId('try-similar')).toHaveCount(0);
    await expect(page.getByTestId('tally-answered')).toHaveText(String(i + 1));
    await expect(page.getByTestId('marathon-stop')).toBeInViewport();
    await page.getByTestId('continue').click();
    await expect(feedback).toHaveCount(0);
  }
  // The run did not end with the first batch: an eighth question is waiting.
  await expect(question).toBeVisible();
  ids.push((await question.getAttribute('data-question-id'))!);
  expect(new Set(ids).size).toBe(ids.length);
  // Generated questions carry the seeds of this run's block, one for each position.
  for (const [position, id] of ids.entries()) {
    if (!id.startsWith('gen:')) continue;
    expect(Number(id.split(':').at(-1)), id).toBe(MARATHON_SEED_BASE + position);
  }
  expect(await tally(page)).toEqual({ answered: String(TOTAL), correct: String(TOTAL - 1), streak: '3', best: '3' });
  expect(await noSidewaysScroll(page)).toBe(true);

  // Stop: the summary.
  await page.getByTestId('marathon-stop').click();
  const summary = page.getByTestId('marathon-summary');
  await expect(summary).toBeVisible();
  await expect(page.getByTestId('marathon-score')).toHaveText(`${TOTAL - 1} of ${TOTAL} correct`);
  await expect(page.getByTestId('marathon-answered')).toHaveText(String(TOTAL));
  await expect(page.getByTestId('marathon-correct')).toHaveText(String(TOTAL - 1));
  await expect(page.getByTestId('marathon-accuracy')).toHaveText(`${Math.round(((TOTAL - 1) / TOTAL) * 100)}%`);
  await expect(page.getByTestId('marathon-streak')).toHaveText('3');
  await expect(page.getByTestId('marathon-time')).toHaveText(/^\d+:\d\d$/);
  await expect(page.getByTestId('marathon-xp')).toHaveText(/^\+\d+ XP$/);
  await expect(page.getByTestId('marathon-new-best')).toHaveText('New best! Most answered and Longest streak');
  await expect(page.getByTestId('marathon-best')).toContainText(`${TOTAL} answered in one run · longest streak 3`);
  await expect(page.getByTestId('marathon-concepts')).toContainText('Weakest');
  await expect(page.getByTestId('marathon-mistakes')).toContainText('1 question from this run is on your Mistakes list');
  await expect(page.getByTestId('marathon-review')).toHaveAttribute('href', '/mistakes');
  expect(await noSidewaysScroll(page)).toBe(true);

  // Recorded as it went: an attempt for every answer, and one session result for the run.
  const runs = (await storedRuns(page)).filter((r) => r.kind === 'marathon');
  expect(runs).toHaveLength(1);
  expect(runs[0]).toMatchObject({ scope: TOPIC, correct: TOTAL - 1, total: TOTAL, bestStreak: 3 });

  // "Run again" is a new run, with seeds of its own.
  await page.getByTestId('marathon-again').click();
  await expect(question).toBeVisible();
  expect(await tally(page)).toEqual({ answered: '0', correct: '0', streak: '0', best: '0' });
  const again = (await question.getAttribute('data-question-id'))!;
  expect(Number(again.split(':').at(-1))).toBe(MARATHON_SEED_BASE + SEEDS_PER_RUN);
  // Stopped with nothing answered, it leaves no record and beats nothing.
  await page.getByTestId('marathon-stop').click();
  await expect(page.getByTestId('marathon-score')).toHaveText('0 of 0 correct');
  await expect(page.getByTestId('marathon-new-best')).toHaveCount(0);
  await expect(page.getByTestId('marathon-best')).toContainText(`${TOTAL} answered in one run`);
  expect((await storedRuns(page)).filter((r) => r.kind === 'marathon')).toHaveLength(1);

  // The personal best is on the Practice screen and on the picker.
  await page.getByTestId('marathon-back').click();
  await expect(page).toHaveURL(/\/practice$/);
  await expect(page.getByTestId('hub-marathon-count')).toHaveText(`Longest run: ${TOTAL} questions`);
  await page.getByTestId('hub-marathon').click();
  await expect(page.getByTestId(`marathon-${TOPIC}-best`)).toHaveText(`Best: ${TOTAL} answered · streak 3`);
  await expect(page.getByTestId('marathon-all-best')).toHaveText('No run yet');
});

test('a marathon keeps to the subtopics that are ticked, and the choice is remembered', async ({ page }) => {
  test.setTimeout(150_000);
  // A topic with nine subtopics, played a little: a marathon offers every one of them, whatever has been passed.
  const pack = packOf(SUBTOPIC_TOPIC);
  const subtopics = marathonSubtopics(pack, everythingIn([pack]));
  const ready = subtopics.filter((s) => s.ready);
  const one = ready.find((s) => s.generators.open >= 2 && s.questions.open >= 1)!;
  expect(subtopics.length).toBeGreaterThanOrEqual(9);
  expect(ready).toEqual(subtopics);
  expect(one).toBeDefined();
  const id = `marathon-${SUBTOPIC_TOPIC}`;
  const box = (subtopicId: string) => page.getByTestId(`${id}-subtopic-${subtopicId}`);
  const all = `${subtopics.length} subtopics`;

  await seedPassedLevels(page, SUBTOPIC_LEVELS, SUBTOPIC_TOPIC);
  await page.setViewportSize({ width: 360, height: 740 });
  await page.goto('/practice/marathon');

  // Every subtopic is ticked, and the run is the usual one. The list opens from the keyboard.
  const count = page.getByTestId(`${id}-subtopics-count`);
  const card = page.getByTestId(id);
  await expect(count).toHaveText(`All ${all}`);
  await expect(card).toHaveAttribute('href', `/practice/marathon/${SUBTOPIC_TOPIC}`);
  await expect(page.getByTestId('marathon-all-subtopics')).toHaveCount(0);
  const toggle = page.getByTestId(`${id}-subtopics`);
  await expect(toggle).toHaveAttribute('aria-expanded', 'false');
  await toggle.focus();
  await page.keyboard.press('Enter');
  await expect(toggle).toHaveAttribute('aria-expanded', 'true');
  const list = page.getByTestId(`${id}-subtopic-list`);
  await expect(list.getByRole('checkbox')).toHaveCount(subtopics.length);
  for (const s of subtopics) {
    await expect(list.getByText(s.title, { exact: true })).toBeVisible();
    await expect(page.getByTestId(`${id}-subtopic-${s.id}-detail`)).toHaveText(describeSubtopic(s));
  }
  // None is locked: every one can be ticked, and is.
  for (const s of ready) {
    await expect(box(s.id)).toBeChecked();
    await expect(box(s.id)).toBeEnabled();
  }
  await expect(list).not.toContainText('Locked');
  expect(await noSidewaysScroll(page)).toBe(true);

  // Clear, by keyboard: with nothing ticked there is no run to start.
  await page.keyboard.press('Tab');
  await expect(page.getByTestId(`${id}-subtopics-all`)).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(page.getByTestId(`${id}-subtopics-clear`)).toBeFocused();
  await page.keyboard.press('Enter');
  for (const s of ready) await expect(box(s.id)).not.toBeChecked();
  await expect(count).toHaveText(`0 of ${all}`);
  await expect(page.getByTestId(`${id}-subtopics-none`)).toHaveText('Tick at least one subtopic to start.');
  await expect(page.getByTestId(`${id}-start`)).toBeDisabled();
  await expect(card).not.toHaveAttribute('href');
  await expect(page.getByTestId(`${id}-hint`)).toHaveText('Tick a subtopic to start');
  // Tab goes on to the first tick box; Space ticks it. Then Select all brings everything back.
  await page.keyboard.press('Tab');
  await expect(box(ready[0].id)).toBeFocused();
  await page.keyboard.press('Space');
  await expect(box(ready[0].id)).toBeChecked();
  await expect(count).toHaveText(`1 of ${all}`);
  await page.getByTestId(`${id}-subtopics-all`).click();
  for (const s of ready) await expect(box(s.id)).toBeChecked();
  await expect(card).toHaveAttribute('href', `/practice/marathon/${SUBTOPIC_TOPIC}`);

  // Untick all but one, and start with a difficulty: the address names the subtopic.
  for (const s of ready) if (s.id !== one.id) await box(s.id).uncheck();
  await expect(count).toHaveText(`1 of ${all}`);
  await page.getByTestId('marathon-level-easy').click();
  await expect(card).toHaveAttribute('href', `/practice/marathon/${SUBTOPIC_TOPIC}?level=easy&subtopics=${one.id}`);
  await page.getByTestId('marathon-level-mixed').click();
  expect(await noSidewaysScroll(page)).toBe(true);
  await page.getByTestId(`${id}-start`).click();
  await expect(page).toHaveURL(new RegExp(`/practice/marathon/${SUBTOPIC_TOPIC}\\?subtopics=${one.id}$`));

  // Every question is of that subtopic, past the first batch, generated and authored alike; the run says what it covers.
  const question = page.getByTestId('question');
  const covered = `1 of ${all}: ${one.title}`;
  const TOTAL = BATCH + 2;
  const ids: string[] = [];
  for (let i = 0; i < TOTAL; i++) {
    await expect(question).toBeVisible();
    await expect(page.getByTestId('marathon-covered')).toHaveText(covered);
    const questionId = (await question.getAttribute('data-question-id'))!;
    ids.push(questionId);
    expect(findQuestion(questionId)?.conceptId, questionId).toBe(one.id);
    await answerCurrentQuestion(page);
    await expect(page.getByTestId('feedback')).toHaveAttribute('data-correct', 'true');
    await expect(page.getByTestId('marathon-stop')).toBeInViewport();
    await page.getByTestId('continue').click();
    await expect(page.getByTestId('feedback')).toHaveCount(0);
  }
  await expect(question).toBeVisible();
  expect(new Set(ids).size).toBe(TOTAL);
  expect(ids.some((q) => q.startsWith('gen:'))).toBe(true);
  expect(ids.some((q) => !q.startsWith('gen:'))).toBe(true);
  expect(await noSidewaysScroll(page)).toBe(true);

  // Stop: the summary names the subtopic, lists no other, and the run counts towards the topic's best.
  await page.getByTestId('marathon-stop').click();
  await expect(page.getByTestId('marathon-summary')).toBeVisible();
  await expect(page.getByTestId('marathon-summary-covered')).toHaveText(covered);
  await expect(page.getByTestId('marathon-score')).toHaveText(`${TOTAL} of ${TOTAL} correct`);
  await expect(page.getByTestId('marathon-concepts').getByRole('listitem')).toHaveCount(1);
  await expect(page.getByTestId(`marathon-concept-${one.id}`)).toBeVisible();
  await expect(page.getByTestId('marathon-new-best')).toBeVisible();
  expect(await noSidewaysScroll(page)).toBe(true);
  const runs = (await storedRuns(page)).filter((r) => r.kind === 'marathon');
  expect(runs).toHaveLength(1);
  expect(runs[0]).toMatchObject({ scope: SUBTOPIC_TOPIC, correct: TOTAL, total: TOTAL });

  // Back on the Marathon screen the choice is as it was left, also after the app is loaded afresh.
  await page.getByTestId('marathon-back').click();
  await page.getByTestId('hub-marathon').click();
  for (const reloaded of [false, true]) {
    if (reloaded) await page.reload();
    await expect(count).toHaveText(`1 of ${all}`);
    await expect(page.getByTestId(`${id}-best`)).toHaveText(`Best: ${TOTAL} answered · streak ${TOTAL}`);
    await expect(card).toHaveAttribute('href', `/practice/marathon/${SUBTOPIC_TOPIC}?subtopics=${one.id}`);
    await toggle.click();
    for (const s of ready) await expect(box(s.id)).toBeChecked({ checked: s.id === one.id });
  }
  // It is the choice of that topic alone.
  await expect(page.getByTestId(`marathon-${TOPIC}`)).toHaveAttribute('href', `/practice/marathon/${TOPIC}`);
});

test('a new learner, with nothing passed and the levels locked, can run a marathon of any topic at once', async ({ page }) => {
  await page.goto(`/practice/marathon/${TOPIC}`);
  await expect(page.getByTestId('question')).toBeVisible({ timeout: 60_000 });
  await expect(page.getByTestId('marathon-empty')).toHaveCount(0);
  await expect(page.getByTestId('marathon-stop')).toBeVisible();
  expect(findQuestion((await page.getByTestId('question').getAttribute('data-question-id'))!)?.topicId).toBe(TOPIC);
  const res = await page.goto('/practice/marathon/no-such-topic');
  expect(res?.status()).toBe(404);
});
