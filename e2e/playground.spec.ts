import { expect, test, type Page } from '@playwright/test';
import '../src/content/registry';
import { NO_FILTERS, coursePatterns, filterPatterns, scaleLine } from '../src/learning/patterns';
import { PLAYGROUND_SEED_BASE } from '../src/learning/playground';
import { CLASS11, answerCurrentQuestion, createProfile, readStoredEvents } from './helpers';

// The Playground: every pattern of the course and every case study, filtered, and played at once with nothing to
// unlock. The learner of these tests has the levels locked and has passed none: the Playground plays anything anyway.

const ALL = coursePatterns(CLASS11);
// A topic with patterns of every quick kind and of journal entries.
const TOPIC = 'journal-entries';
const OTHER = 'cash-book';
const ofTopic = (topicId: string) => ALL.filter((p) => p.topicId === topicId);
/** The first quick question (a choice or a figure) of a topic, which is quick to answer. */
const quickOf = (topicId: string) => ofTopic(topicId).find((p) => p.kind === 'quick')!;

const noSidewaysScroll = (page: Page) => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);
const isWide = (page: Page) => (page.viewportSize()?.width ?? 0) >= 1024;
const templateOf = (questionId: string) => questionId.split(':')[1];
const seedOf = (questionId: string) => Number(questionId.split(':').at(-1));

/** Ticks a filter box: in the column beside the patterns on a laptop, in the sheet of filters on a phone. */
async function tickFilter(page: Page, testId: string) {
  if (isWide(page)) {
    await page.getByTestId(testId).check();
    return;
  }
  await page.getByTestId('playground-filters-open').click();
  const sheet = page.getByTestId('playground-filters-sheet');
  await expect(sheet).toBeVisible();
  await sheet.getByTestId(testId).check();
  await sheet.getByTestId('playground-filters-done').click();
  await expect(sheet).toHaveCount(0);
}

const showing = (n: number) => `Showing ${n.toLocaleString('en-IN')} of ${ALL.length.toLocaleString('en-IN')} question types`;

test.beforeEach(async ({ page }) => {
  await createProfile(page, 'Varun');
});

test('the Playground shows the scale, filters its patterns by topic, kind and words, and keeps the filters in the address', async ({ page }) => {
  test.setTimeout(120_000);
  await page.goto('/practice');
  await expect(page.getByTestId('hub-playground')).toHaveAttribute('href', '/playground');
  await page.getByTestId('hub-playground').click();
  await expect(page).toHaveURL(/\/playground$/);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Playground');
  await expect(page.getByTestId('playground-scale')).toHaveText(scaleLine(ALL.length));
  await expect(page.getByTestId('playground-count')).toHaveText(showing(ALL.length));

  // Every card has its title, its kind and difficulty, a line about it and a sample of what it asks.
  const first = ALL[0];
  const card = page.getByTestId(`pattern-${first.id}`);
  await expect(card).toContainText(first.title);
  await expect(page.getByTestId(`pattern-${first.id}-sample`)).toHaveText(/^“.+”$/, { timeout: 60_000 });
  await expect(page.getByTestId(`pattern-${first.id}-play`)).toHaveAttribute('href', `/playground?pattern=${first.id}`);

  // A topic.
  await tickFilter(page, `filter-topic-${TOPIC}`);
  await expect(page).toHaveURL(new RegExp(`/playground\\?topics=${TOPIC}$`));
  const ledger = ofTopic(TOPIC);
  await expect(page.getByTestId('playground-count')).toHaveText(showing(ledger.length));
  await expect(page.getByTestId(`pattern-${ledger[0].id}`)).toBeVisible();
  await expect(page.getByTestId(`pattern-${first.id}`)).toHaveCount(0);

  // And a kind.
  await tickFilter(page, 'filter-kind-journal');
  await expect(page).toHaveURL(new RegExp(`topics=${TOPIC}&kinds=journal$`));
  const journals = filterPatterns(ALL, { ...NO_FILTERS, topics: [TOPIC], kinds: ['journal'] });
  expect(journals.length).toBeGreaterThan(0);
  await expect(page.getByTestId('playground-count')).toHaveText(showing(journals.length));
  for (const p of journals.slice(0, 5)) await expect(page.getByTestId(`pattern-${p.id}`)).toContainText('Journal entry');

  // "/" goes to the search field from anywhere on the page; words narrow the list, Escape clears them.
  await page.locator('h1').click();
  await page.keyboard.press('/');
  const search = page.getByTestId('playground-search');
  await expect(search).toBeFocused();
  const word = /[A-Za-z]+/.exec(journals[0].title)![0];
  await page.keyboard.type(word);
  await expect(page).toHaveURL(new RegExp(`q=${encodeURIComponent(word)}`));
  // (The samples are searched too, so a word may find more than the titles alone.)
  const found = filterPatterns(ALL, { q: word, topics: [TOPIC], kinds: ['journal'], difficulties: [] });
  expect(found.length).toBeGreaterThan(0);
  await expect(page.getByTestId(`pattern-${found[0].id}`)).toBeVisible();
  const shownNow = Number((await page.getByTestId('playground-count').innerText()).match(/Showing (\d+)/)![1]);
  expect(shownNow).toBeGreaterThanOrEqual(found.length);
  expect(shownNow).toBeLessThanOrEqual(journals.length);
  await page.keyboard.press('Escape');
  await expect(search).toHaveValue('');
  await page.keyboard.type('zzzz-nothing');
  await expect(page.getByTestId('playground-empty')).toBeVisible();
  await page.keyboard.press('Escape');

  // The address brings the same view back.
  await page.reload();
  await expect(page.getByTestId('playground-count')).toHaveText(showing(journals.length));
  expect(await noSidewaysScroll(page)).toBe(true);
});

test('a pattern is played at once, question after question, with Another one, the working and Next, and every answer recorded', async ({ page }) => {
  test.setTimeout(120_000);
  const pattern = quickOf(TOPIC);
  // The address a search result links to.
  await page.goto(`/playground?topic=${TOPIC}&pattern=${pattern.id}`);
  const question = page.getByTestId('question');
  await expect(question).toBeVisible({ timeout: 60_000 });
  await expect(page.getByTestId('playground-title')).toHaveText(pattern.title);
  const ids: string[] = [(await question.getAttribute('data-question-id'))!];
  expect(templateOf(ids[0])).toBe(pattern.id);
  expect(seedOf(ids[0])).toBeGreaterThanOrEqual(PLAYGROUND_SEED_BASE);

  // Right: the usual feedback, then Continue brings a new question of the same pattern.
  await answerCurrentQuestion(page);
  await expect(page.getByTestId('feedback')).toHaveAttribute('data-correct', 'true');
  await expect(page.getByTestId('pg-answered')).toHaveText('1');
  await expect(page.getByTestId('pg-correct')).toHaveText('1');
  await expect(page.getByTestId('pg-streak')).toHaveText('1');
  await page.getByTestId('continue').click();
  await expect(question).not.toHaveAttribute('data-question-id', ids[0]);
  ids.push((await question.getAttribute('data-question-id'))!);

  // Another one: a new question, nothing recorded.
  await page.getByTestId('pg-another').click();
  await expect(question).not.toHaveAttribute('data-question-id', ids[1]);
  ids.push((await question.getAttribute('data-question-id'))!);
  await expect(page.getByTestId('pg-answered')).toHaveText('1');

  // The hints, then Show the working: a miss, with the working shown.
  await page.getByTestId('hint').click();
  await expect(page.getByTestId('hint-text')).toBeVisible();
  await page.getByTestId('pg-working').click();
  await expect(page.getByTestId('feedback')).toHaveAttribute('data-correct', 'false');
  await expect(page.getByTestId('pg-answered')).toHaveText('2');
  await expect(page.getByTestId('pg-streak')).toHaveText('0');
  await page.getByTestId('continue').click();
  await expect(question).not.toHaveAttribute('data-question-id', ids[2]);
  ids.push((await question.getAttribute('data-question-id'))!);

  // Every question is of the pattern, each a new seed of this play's block.
  for (const id of ids) expect(templateOf(id)).toBe(pattern.id);
  expect(new Set(ids.map(seedOf)).size).toBe(ids.length);
  expect(ids.map(seedOf)).toEqual(ids.map((_, i) => seedOf(ids[0]) + i));
  expect(await noSidewaysScroll(page)).toBe(true);

  // Back to the patterns of the topic the link came from.
  await page.getByTestId('playground-back').click();
  await expect(page).toHaveURL(new RegExp(`/playground\\?topics=${TOPIC}$`));
  await expect(page.getByTestId('playground-count')).toHaveText(showing(ofTopic(TOPIC).length));

  // Two answers, recorded as ordinary practice: one right, one a miss now on the Mistakes list.
  await expect
    .poll(async () => (await readStoredEvents(page)).attempts.length, { timeout: 10_000 })
    .toBe(2);
  const stored = (await readStoredEvents(page)).attempts as { questionId: string; topicId: string; sessionKind?: string; correct?: boolean }[];
  expect(stored.every((a) => a.topicId === TOPIC && a.sessionKind === 'fresh')).toBe(true);
  expect(stored.map((a) => a.questionId).sort()).toEqual([ids[0], ids[2]].sort());
  expect(stored.find((a) => a.questionId === ids[0])?.correct).toBe(true);
  expect(stored.find((a) => a.questionId === ids[2])?.correct).toBe(false);
  // The miss waits on the Mistakes screen, counted on the Practice screen.
  await page.goto('/practice');
  await expect(page.getByTestId('hub-mistakes-count')).toHaveText('1 waiting');
});

test('Play selected mixes the patterns chosen from two topics', async ({ page }) => {
  test.setTimeout(120_000);
  const a = quickOf(TOPIC);
  const b = quickOf(OTHER);
  // A bookmarked view: one topic's quick questions.
  await page.goto(`/playground?topics=${TOPIC}&kinds=quick`);
  await page.getByTestId(`pattern-${a.id}-select`).check();
  await expect(page.getByTestId('playground-count')).toContainText('1 chosen');
  // The choice stays while the filters change.
  if (isWide(page)) {
    await page.getByTestId(`filter-topic-${TOPIC}`).uncheck();
    await page.getByTestId(`filter-topic-${OTHER}`).check();
  } else {
    await page.getByTestId('playground-filters-open').click();
    const sheet = page.getByTestId('playground-filters-sheet');
    await sheet.getByTestId(`filter-topic-${TOPIC}`).uncheck();
    await sheet.getByTestId(`filter-topic-${OTHER}`).check();
    await sheet.getByTestId('playground-filters-done').click();
  }
  await expect(page).toHaveURL(new RegExp(`topics=${OTHER}&kinds=quick$`));
  await page.getByTestId(`pattern-${b.id}-select`).check();
  const play = page.getByTestId('playground-play-selected');
  await expect(play).toHaveText('Play selected (2)');
  await expect(play).toHaveAttribute('href', `/playground?topics=${OTHER}&kinds=quick&mix=${a.id},${b.id}`);
  await play.click();

  const question = page.getByTestId('question');
  await expect(question).toBeVisible({ timeout: 60_000 });
  await expect(page.getByTestId('playground-title')).toHaveText('A mix of 2 question types');
  const templates: string[] = [];
  for (let i = 0; i < 4; i++) {
    const id = (await question.getAttribute('data-question-id'))!;
    templates.push(templateOf(id));
    await answerCurrentQuestion(page);
    await expect(page.getByTestId('pg-answered')).toHaveText(String(i + 1));
    await page.getByTestId('continue').click();
    await expect(question).not.toHaveAttribute('data-question-id', id);
  }
  // Both patterns, taking turns, and nothing else.
  expect(new Set(templates)).toEqual(new Set([a.id, b.id]));
  for (let i = 1; i < templates.length; i++) expect(templates[i]).not.toBe(templates[i - 1]);
  const stored = (await readStoredEvents(page)).attempts;
  expect(new Set(stored.map((x) => x.topicId))).toEqual(new Set([TOPIC, OTHER]));
});

test('"Play all shown" plays every pattern a whole topic shows', async ({ page }) => {
  await page.goto(`/playground?topics=${TOPIC}`);
  const play = page.getByTestId('playground-play-selected');
  await expect(play).toHaveText(`Play all shown (${ofTopic(TOPIC).length})`);
  await play.click();
  await expect(page).toHaveURL(new RegExp(`/playground\\?topics=${TOPIC}&mix=shown$`));
  const question = page.getByTestId('question');
  await expect(question).toBeVisible({ timeout: 60_000 });
  expect(ofTopic(TOPIC).map((p) => p.id)).toContain(templateOf((await question.getAttribute('data-question-id'))!));
});

test('nothing scrolls sideways at 360 px: the Playground, its sheet of filters, a play, the Marathon and the Case studies', async ({ page }) => {
  test.setTimeout(120_000);
  await page.setViewportSize({ width: 360, height: 740 });
  await page.goto('/playground');
  await expect(page.getByTestId('playground-count')).toBeVisible();
  await expect(page.getByTestId(`pattern-${ALL[0].id}-sample`)).toHaveText(/^“/, { timeout: 60_000 });
  expect(await noSidewaysScroll(page)).toBe(true);
  await page.getByTestId('playground-filters-open').click();
  await expect(page.getByTestId('playground-filters-sheet')).toBeVisible();
  expect(await noSidewaysScroll(page)).toBe(true);
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('playground-filters-sheet')).toHaveCount(0);

  const longOne = ALL.find((p) => p.kind === 'format')!;
  await page.goto(`/playground?pattern=${longOne.id}`);
  await expect(page.getByTestId('question')).toBeVisible({ timeout: 60_000 });
  expect(await noSidewaysScroll(page)).toBe(true);

  for (const [path, testId] of [
    ['/practice', 'hub-tiles'],
    ['/practice/marathon', 'marathon-summary-line'],
    ['/cases', 'cases-mixed-card'],
  ]) {
    await page.goto(path);
    await expect(page.getByTestId(testId), path).toBeVisible();
    expect(await noSidewaysScroll(page), path).toBe(true);
  }
});
