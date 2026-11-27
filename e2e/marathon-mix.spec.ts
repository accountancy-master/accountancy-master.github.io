import { expect, test, type Page } from '@playwright/test';
import { STAGES } from '../src/content/outline';
import '../src/content/registry';
import { CONFIG } from '../src/learning/config';
import { casesOfTopics } from '../src/learning/marathonMix';
import { FIRST_TOPIC, answerCurrentQuestion, createProfile, readStoredEvents } from './helpers';

// A marathon of chosen topics, mixed, with case studies: the topics are ticked on the Marathon screen, the kinds of
// question are switched on, and the setup is in the address.

const A = 'ledger';
/** A topic whose stage of case studies is among the cases of the run. */
const B = 'trial-balance';
const CASES = casesOfTopics(STAGES, [A, B]);
const EVERY = CONFIG.marathon.caseEvery;

const noSidewaysScroll = (page: Page) => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);
const caseOf = (questionId: string): string | undefined => /^gen:(.+)~\d+:\d+:\d+$/.exec(questionId)?.[1];

test.beforeEach(async ({ page }) => {
  await createProfile(page, 'Varun');
});

test('a marathon of two topics with case studies mixes them, asks a whole case every few questions, and sums up by topic and kind', async ({ page }) => {
  test.setTimeout(240_000);
  expect(CASES.length).toBeGreaterThan(0);
  // A new learner: nothing passed, the levels locked. A marathon needs nothing unlocked.
  await page.goto('/practice/marathon');
  await expect(page).toHaveURL(/\/practice\/marathon$/);
  // A learner who has played nothing starts with the first topic of the course ticked, ready to start.
  await expect(page.getByTestId(`marathon-pick-${FIRST_TOPIC.topicId}`)).toBeChecked();
  await expect(page.getByTestId('marathon-summary-line')).toHaveText(/^1 topic · [1-9]\d* question types?$/);
  await expect(page.getByTestId('marathon-start')).toHaveAttribute('href', `/practice/marathon/mix?topics=${FIRST_TOPIC.topicId}`);
  await expect(page.getByText('Pass a level here first')).toHaveCount(0);

  // None, then the two topics; quick questions are on and the rest off to begin with.
  await page.getByTestId('marathon-topics-none').click();
  await expect(page.getByTestId('marathon-summary-line')).toHaveText('No topic chosen');
  await expect(page.getByTestId('marathon-start')).toBeDisabled();
  await page.getByTestId(`marathon-pick-${A}`).check();
  await page.getByTestId(`marathon-pick-${B}`).check();
  await expect(page.getByTestId('marathon-kind-quick')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByTestId('marathon-kind-long')).toHaveAttribute('aria-pressed', 'false');
  await expect(page.getByTestId('marathon-kind-cases')).toHaveAttribute('aria-pressed', 'false');
  await expect(page.getByTestId('marathon-summary-line')).toHaveText(/^2 topics · \d+ question types$/);
  await page.getByTestId('marathon-kind-cases').click();
  await expect(page.getByTestId('marathon-kind-cases')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByTestId('marathon-summary-line')).toHaveText(new RegExp(`^2 topics · \\d+ question types · ${CASES.length} case stud(y|ies)$`));

  // The setup is in the address, so it can be bookmarked; the run has an address of its own.
  const setup = `topics=${A},${B}&kinds=quick,cases`;
  await expect(page).toHaveURL(new RegExp(`/practice/marathon\\?${setup}$`));
  await expect(page.getByTestId('marathon-start')).toHaveAttribute('href', `/practice/marathon/mix?${setup}`);
  expect(await noSidewaysScroll(page)).toBe(true);
  await page.reload();
  await expect(page.getByTestId(`marathon-pick-${A}`)).toBeChecked();
  await expect(page.getByTestId(`marathon-pick-${B}`)).toBeChecked();
  await expect(page.getByTestId('marathon-kind-cases')).toHaveAttribute('aria-pressed', 'true');

  await page.getByTestId('marathon-start').click();
  await expect(page).toHaveURL(new RegExp(`/practice/marathon/mix\\?${setup}$`));
  const question = page.getByTestId('question');
  await expect(question).toBeVisible({ timeout: 60_000 });
  await expect(page.getByTestId('marathon-stop')).toBeVisible();

  // Answer until a whole case has been asked and answered.
  const ids: string[] = [];
  let caseDone = false;
  for (let i = 0; i < EVERY + 12 && !caseDone; i++) {
    await expect(question).toBeVisible();
    const id = (await question.getAttribute('data-question-id'))!;
    ids.push(id);
    await answerCurrentQuestion(page);
    await expect(page.getByTestId('tally-answered')).toHaveText(String(i + 1));
    await page.getByTestId('continue').click();
    await expect(question).not.toHaveAttribute('data-question-id', id);
    const next = (await question.getAttribute('data-question-id'))!;
    caseDone = caseOf(id) !== undefined && caseOf(next) !== caseOf(id);
  }
  // The first questions are of the two topics; then comes a case of their stages, every question of it in order.
  const at = ids.findIndex((id) => caseOf(id) !== undefined);
  expect(at).toBe(EVERY);
  const caseId = caseOf(ids[at])!;
  const theCase = CASES.find((c) => c.id === caseId)!;
  expect(theCase).toBeDefined();
  expect(ids.slice(at)).toEqual(theCase.parts.map((_, k) => expect.stringMatching(new RegExp(`^gen:${caseId}~${k + 1}:`))));
  const stored = await readStoredEvents(page);
  const topics = new Set(stored.attempts.filter((a) => !caseOf(a.questionId)).map((a) => a.topicId));
  expect([...topics].every((t) => t === A || t === B)).toBe(true);
  await expect(page.getByTestId('tally-accuracy')).toContainText('100% right');
  expect(await noSidewaysScroll(page)).toBe(true);

  // Stop: the summary by topic and by kind, and the run recorded over all the topics.
  await page.getByTestId('marathon-stop').click();
  await expect(page.getByTestId('marathon-summary')).toBeVisible();
  await expect(page.getByTestId('marathon-by-kind').getByTestId('marathon-bykind-quick')).toContainText(`${EVERY} of ${EVERY}`);
  await expect(page.getByTestId('marathon-by-kind').getByTestId('marathon-bykind-case')).toContainText(`${theCase.parts.length} of ${theCase.parts.length}`);
  await expect(page.getByTestId('marathon-by-topic').getByRole('listitem')).not.toHaveCount(0);
  expect(await noSidewaysScroll(page)).toBe(true);
  const runs = (await readStoredEvents(page)).sessionResults.filter((r) => r.kind === 'marathon') as { scope?: string; total?: number }[];
  expect(runs).toHaveLength(1);
  expect(runs[0]).toMatchObject({ scope: 'all', total: ids.length });
});

test('All, None and a whole unit choose topics; the subtopics of a topic narrow the run', async ({ page }) => {
  await page.goto('/practice/marathon');
  await page.getByTestId('marathon-topics-all').click();
  await expect(page.getByTestId('marathon-summary-line')).toHaveText(/^\d+ topics · \d+ question types/);
  await page.getByTestId('marathon-topics-none').click();
  await expect(page.getByTestId('marathon-summary-line')).toHaveText('No topic chosen');
  // A unit's box ticks all its topics.
  await page.getByTestId('marathon-unit-0-box').check();
  await expect(page.getByTestId('marathon-summary-line')).toHaveText(/^\d+ topics? · /);
  await expect(page).toHaveURL(/\/practice\/marathon\?topics=[^&]+/);
  // Every kind off: nothing to start.
  await page.getByTestId('marathon-kind-quick').click();
  await expect(page.getByTestId('marathon-start')).toBeDisabled();
  await expect(page.getByTestId('marathon-start-why')).toHaveText('Turn on at least one kind of question.');
});

test('a run with no topic named is over every topic of the course, and one with no kind says what to choose', async ({ page }) => {
  test.setTimeout(120_000);
  await page.goto('/practice/marathon/mix');
  // A new learner, with nothing passed, gets questions at once.
  await expect(page.getByTestId('question')).toBeVisible({ timeout: 90_000 });
  await expect(page.getByTestId('marathon-empty')).toHaveCount(0);
  await page.goto(`/practice/marathon/mix?topics=${A}&kinds=`);
  await expect(page.getByTestId('marathon-empty')).toContainText('Choose at least one topic and one kind of question');
});
