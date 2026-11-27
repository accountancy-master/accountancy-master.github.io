import { expect, test } from '@playwright/test';
import { findQuestion } from '../src/content/registry';
import { CLASS11_PACKS as PACKS } from './helpers';
import { CONFIG } from '../src/learning/config';
import { createProfile, playSession, readStoredEvents, seedPassedLevels, showAnswer, FIRST_TOPIC, SMART_COUNT } from './helpers';

// A topic with enough topics before it for every question from an earlier topic to come from a different one.
const { own: OWN, earlier: EARLIER } = CONFIG.lookBack;
const AT = PACKS.findIndex((_, i) => i >= EARLIER);
const pack = PACKS[AT];
const TOPIC = pack.topicId;
const BEFORE = PACKS.slice(0, AT).map((p) => p.topicId);
const level = pack.levels.find((l) => l.type === 'look_back')!;
const TOTAL = OWN + EARLIER;

const templateOf = (id: string) => id.split(':')[1];

test('the Look back level ends a topic, mixes it with earlier topics and is played like any level', async ({ page }) => {
  test.setTimeout(120_000); // A level of ten questions and a practice session of ten more, through the real screens.
  await createProfile(page, 'Varun');
  await seedPassedLevels(page, level.order - 1, TOPIC);

  // The first topic of the course has nothing to look back on.
  await page.goto(`/topics/${FIRST_TOPIC.topicId}`);
  await expect(page.getByTestId('level-0')).toBeVisible();
  await expect(page.getByRole('heading', { level: 3, name: 'Look back', exact: true })).toHaveCount(0);

  await page.goto(`/topics/${TOPIC}`);
  const row = page.getByTestId(`level-${level.order}`);
  await expect(row).toHaveAttribute('data-state', 'unlocked');
  await expect(row).toHaveAttribute('data-next', 'true');
  await expect(row.getByRole('heading', { level: 3 })).toHaveText('Look back');
  await expect(row).toContainText('topics before it');
  await expect(row).toContainText(`Look back · ${TOTAL} questions`);
  // It is the last level of the topic (a case study, where a topic has one, comes after it).
  expect(pack.levels.filter((l) => l.order > level.order).every((l) => l.type === 'case_study')).toBe(true);

  await page.getByTestId(`level-start-${level.order}`).click();
  await expect(page).toHaveURL(new RegExp(`/play/${level.id}$`));
  await expect(page.getByTestId('player-progress')).toHaveAttribute('aria-label', `Look back: 0 of ${TOTAL} steps done`);

  const served: string[] = [];
  expect(await playSession(page, { onQuestion: (id) => served.push(id) })).toBe(TOTAL);
  await expect(page.getByTestId('results-score')).toHaveText(`${TOTAL} of ${TOTAL} correct`);
  await expect(page.getByTestId('results-passed')).toHaveText('Passed');

  // Six questions of the topic itself and four of earlier topics, each from a different one, none of them a case.
  expect(new Set(served).size).toBe(TOTAL);
  const topics = served.map((id) => findQuestion(id)!.topicId);
  expect(topics.filter((t) => t === TOPIC)).toHaveLength(OWN);
  const earlier = topics.filter((t) => t !== TOPIC);
  expect(earlier).toHaveLength(EARLIER);
  expect(new Set(earlier).size).toBe(EARLIER);
  for (const t of earlier) expect(BEFORE).toContain(t);
  for (const id of served) expect(findQuestion(id)!.context, id).toBeUndefined();

  // Every answer is stored once, as play of this level and of this topic, and the level is passed once.
  const stored = await readStoredEvents(page);
  expect(stored.attempts.map((a) => a.questionId).sort()).toEqual([...served].sort());
  for (const a of stored.attempts) expect({ levelId: a.levelId, topicId: a.topicId }).toEqual({ levelId: level.id, topicId: TOPIC });
  const results = stored.levelResults.filter((r) => r.levelId === level.id);
  expect(results).toHaveLength(1);
  expect(results[0]).toMatchObject({ score: 1, passed: true });

  await page.getByTestId('results-topic').click();
  await expect(page).toHaveURL(new RegExp(`/topics/${TOPIC}$`));
  await expect(page.getByTestId(`level-${level.order}`)).toHaveAttribute('data-state', 'passed');
  await expect(page.getByTestId('stat-answered')).toHaveText(String(TOTAL));

  // Passing it opened nothing of an earlier topic: smart practice still asks only about this topic.
  await page.goto('/practice/smart');
  const practised: string[] = [];
  expect(await playSession(page, { onQuestion: (id) => practised.push(id) })).toBe(SMART_COUNT);
  for (const id of practised) expect(findQuestion(id)!.topicId, id).toBe(TOPIC);
});

test('a question missed in a Look back level offers a similar one, and the next play asks new questions', async ({ page }) => {
  await createProfile(page, 'Varun', { unlockAll: true });
  await page.goto(`/play/${level.id}`);
  const q = page.getByTestId('question');
  await expect(q).toBeVisible();
  const firstId = (await q.getAttribute('data-question-id'))!;

  await showAnswer(page);
  await expect(page.getByTestId('feedback')).toHaveAttribute('data-correct', 'false');
  await page.getByTestId('try-similar').click();
  await expect(q).not.toHaveAttribute('data-question-id', firstId);
  const similarId = (await q.getAttribute('data-question-id'))!;
  expect(templateOf(similarId)).toBe(templateOf(firstId));
  // The similar question is an extra step; the level still scores its ten.
  await expect(page.getByTestId('player-progress')).toHaveAttribute('aria-label', `Look back: 1 of ${TOTAL + 1} steps done`);

  await page.getByTestId('player-close').click();
  await page.getByTestId('player-leave').click();
  await expect(page).toHaveURL(new RegExp(`/topics/${TOPIC}$`));

  // A play that was left counts: the next one has other questions.
  await page.goto(`/play/${level.id}`);
  await expect(q).toBeVisible();
  const again = (await q.getAttribute('data-question-id'))!;
  expect([firstId, similarId]).not.toContain(again);
});
