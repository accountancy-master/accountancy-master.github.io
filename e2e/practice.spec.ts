import { expect, test, type Page } from '@playwright/test';
import { findQuestion } from '../src/content/registry';
import { CONFIG } from '../src/learning/config';
import {
  FRESH_COUNT,
  JE,
  JE_LEVEL_CARDS,
  SMART_COUNT,
  answerCurrentQuestion,
  cardSteps,
  createProfile,
  fillJournal,
  headerXp,
  levelOf,
  packOf,
  playSession,
  readStoredEvents,
  seedPassedLevels,
  xpOf,
} from './helpers';

// Journal Entries is the topic these tests play, so it is the learner's active topic: its cards are the new ones.
const JE_CARDS = packOf(JE).cards.length;

test.beforeEach(async ({ page }) => {
  await createProfile(page, 'Varun');
});

async function reverseAnswer(page: Page) {
  const expected = JSON.parse((await page.getByTestId('question').getAttribute('data-expected'))!);
  await fillJournal(
    page,
    expected.lines.map((l: { side: 'Dr' | 'Cr' }) => ({ ...l, side: l.side === 'Dr' ? 'Cr' : 'Dr' })),
  );
  await page.getByTestId('check').click();
}

test('smart practice serves ten questions and the header XP rises by the session XP', async ({ page }) => {
  await seedPassedLevels(page, 4);
  await page.goto('/topics');
  await expect(page.getByTestId('xp-total')).not.toContainText('–');
  const before = await headerXp(page);

  await page.goto('/practice/smart');
  await expect(page.getByTestId('question')).toBeVisible();
  await expect(page.getByTestId('player-progress')).toHaveAttribute('aria-label', new RegExp(`0 of ${SMART_COUNT} steps done`));
  expect(await playSession(page)).toBe(SMART_COUNT);
  await expect(page.getByTestId('results-score')).toHaveText(`${SMART_COUNT} of ${SMART_COUNT} correct`);
  const gained = await xpOf(page, 'results-xp');
  expect(gained).toBeGreaterThan(0);

  await page.getByTestId('results-home').click();
  await expect(page).toHaveURL(/\/home$/);
  await expect(page.getByTestId('xp-total')).toContainText(String(before + gained));
});

test('a missed question comes back in mistake review and closes when answered right', async ({ page }) => {
  await seedPassedLevels(page, 3);
  await page.goto(`/play/${levelOf(JE, 4)}`);
  const q = page.getByTestId('question');
  await expect(q).toBeVisible();
  const missedId = await q.getAttribute('data-question-id');
  await reverseAnswer(page);
  await expect(page.getByTestId('feedback')).toHaveAttribute('data-correct', 'false');
  await page.getByTestId('player-close').click();
  await page.getByTestId('player-leave').click();
  await expect(page).toHaveURL(new RegExp(`/topics/${JE}$`));

  await page.goto('/practice/mistakes');
  await expect(q).toBeVisible();
  await expect(q).toHaveAttribute('data-question-id', missedId!);
  await expect(page.getByTestId('player-progress')).toHaveAttribute('aria-label', /0 of 1 steps done/);
  await expect(page.getByTestId('try-similar')).toHaveCount(0);
  expect(await playSession(page)).toBe(1);
  await expect(page.getByTestId('results-score')).toHaveText('1 of 1 correct');

  await page.goto('/practice/mistakes');
  await expect(page.getByTestId('practice-empty')).toBeVisible();
  await expect(q).toHaveCount(0);
});

test('cards: a card marked Need to revise is served again first, cards marked Got it are not', async ({ page }) => {
  await seedPassedLevels(page, 0);
  await page.goto('/practice/cards');
  const card = page.getByTestId('card');
  await expect(card).toBeVisible();
  const first = cardSteps(JE_CARDS);
  await expect(page.getByTestId('player-progress')).toHaveAttribute('aria-label', new RegExp(`0 of ${first} steps done`));

  const revise = (await card.getAttribute('data-card-id'))!;
  const known: string[] = [];
  for (let i = 0; i < first; i++) {
    const id = (await card.getAttribute('data-card-id'))!;
    await page.getByTestId('card-flip').click();
    if (i === 0) {
      await page.getByTestId('card-again').click();
    } else {
      known.push(id);
      await page.getByTestId('card-got-it').click();
    }
    if (i < first - 1) await expect(card).not.toHaveAttribute('data-card-id', id);
  }
  await expect(page.getByTestId('results')).toBeVisible();

  await page.goto('/practice/cards');
  await expect(card).toBeVisible();
  await expect(card).toHaveAttribute('data-card-id', revise);
  // Only the card to revise and the cards never seen are due.
  const served = [revise];
  const total = Number(/of (\d+) steps done/.exec((await page.getByTestId('player-progress').getAttribute('aria-label'))!)![1]);
  // The card to revise, and the cards of the topic the first session did not reach, up to a session's worth.
  expect(total).toBe(cardSteps(Math.max(0, JE_CARDS - first), 1));
  for (let i = 1; i < total; i++) {
    await page.getByTestId('card-flip').click();
    await page.getByTestId('card-got-it').click();
    await expect(card).not.toHaveAttribute('data-card-id', served[i - 1]);
    served.push((await card.getAttribute('data-card-id'))!);
  }
  for (const id of known) expect(served).not.toContain(id);
});

test('the daily challenge earns its bonus once a day and cannot be practised again from the results', async ({ page }) => {
  await seedPassedLevels(page, 4);
  await page.goto('/topics');
  await expect(page.getByTestId('xp-total')).not.toContainText('–');
  const start = await headerXp(page);

  await page.goto('/practice/daily');
  await expect(page.getByTestId('question')).toBeVisible();
  await expect(page.getByTestId('try-similar')).toHaveCount(0);
  await playSession(page);
  const first = await xpOf(page, 'results-xp');
  await expect(page.getByTestId('results-bonus')).toContainText('Daily challenge bonus');
  await expect(page.getByTestId('results-bonus')).toContainText('30');
  await expect(page.getByTestId('results-retry')).toHaveCount(0);
  await page.getByTestId('results-home').click();
  await expect(page.getByTestId('xp-total')).toContainText(String(start + first));

  await page.goto('/practice/daily');
  const served: string[] = [];
  await playSession(page, { onQuestion: (id) => served.push(id) });
  const second = await xpOf(page, 'results-xp');
  await expect(page.getByTestId('results-bonus-done')).toHaveText('Bonus already earned today');
  await expect(page.getByTestId('results-bonus')).toHaveCount(0);
  // The same generated questions are served again, so each earns only the repeat amount, and no bonus.
  expect(served).toHaveLength(CONFIG.practice.dailyChallengeCount);
  const repeatXp = served.reduce((sum, id) => {
    const question = findQuestion(id);
    expect(question, `${id} can be looked up`).toBeDefined();
    return sum + Math.max(1, Math.round(CONFIG.xp.perCorrect[question!.difficulty] * CONFIG.xp.repeatFactor));
  }, 0);
  expect(second).toBe(repeatXp);
  expect(second).toBeLessThan(first - CONFIG.xp.dailyChallengeBonus);
  await page.getByTestId('results-home').click();
  await expect(page.getByTestId('xp-total')).toContainText(String(start + first + second));
});

test('a daily challenge with fewer than half right earns no bonus and can be tried again', async ({ page }) => {
  await seedPassedLevels(page, 4);
  await page.goto('/practice/daily');
  await expect(page.getByTestId('question')).toBeVisible();
  await playSession(page, { wrongFirst: CONFIG.practice.dailyChallengeCount });
  await expect(page.getByTestId('results-score')).toHaveText('0 of 5 correct');
  await expect(page.getByTestId('results-bonus-missed')).toHaveText('Get at least half right to earn the bonus');
  await expect(page.getByTestId('results-bonus')).toHaveCount(0);
  await expect(page.getByTestId('results-bonus-done')).toHaveCount(0);
  await expect(page.getByTestId('results-xp')).toHaveText('+0 XP');

  // The day stays open: the Dashboard still offers the challenge, and playing it properly earns the bonus.
  await page.getByTestId('results-home').click();
  await expect(page.getByTestId('challenge-start')).toBeVisible();
  await page.getByTestId('challenge-start').click();
  await playSession(page);
  await expect(page.getByTestId('results-bonus')).toContainText('Daily challenge bonus');
  await expect(page.getByTestId('results-bonus')).toContainText('30');
  await page.getByTestId('results-home').click();
  await expect(page.getByTestId('challenge-card')).toContainText('Done for today');
});

test('the daily mission starts with cards and earns its bonus', async ({ page }) => {
  test.setTimeout(90_000); // Cards, eight practice questions and two challenge questions through the real screens.
  await seedPassedLevels(page, 4);
  await page.goto('/practice/mission');
  await expect(page.getByTestId('card')).toBeVisible();
  await playSession(page);
  await expect(page.getByTestId('results-bonus')).toContainText('Daily mission bonus');
  await expect(page.getByTestId('results-bonus')).toContainText('50');
});

test('a missed generated question can be followed by a similar one from the same template', async ({ page }) => {
  await seedPassedLevels(page, 4);
  await page.goto('/practice/fresh');
  const q = page.getByTestId('question');
  await expect(q).toBeVisible();
  const progress = page.getByTestId('player-progress');
  await expect(progress).toHaveAttribute('aria-label', new RegExp(`0 of ${FRESH_COUNT} steps done`));
  const firstId = (await q.getAttribute('data-question-id'))!;

  // Getting it right offers no similar question.
  await answerCurrentQuestion(page);
  await expect(page.getByTestId('feedback')).toHaveAttribute('data-correct', 'true');
  await expect(page.getByTestId('try-similar')).toHaveCount(0);
  await page.getByTestId('continue').click();

  const secondId = (await q.getAttribute('data-question-id'))!;
  await reverseAnswer(page);
  await expect(page.getByTestId('feedback')).toHaveAttribute('data-correct', 'false');
  await page.getByTestId('try-similar').click();

  await expect(page.getByTestId('feedback')).toHaveCount(0);
  const similarId = (await q.getAttribute('data-question-id'))!;
  expect(similarId).not.toBe(secondId);
  expect(similarId).not.toBe(firstId);
  const template = (id: string) => id.split(':').slice(0, 3).join(':');
  expect(template(similarId)).toBe(template(secondId));
  await expect(progress).toHaveAttribute('aria-label', new RegExp(`2 of ${FRESH_COUNT + 1} steps done`));

  // The similar question is a real attempt that earns XP, and it can be missed in turn (once per question).
  await answerCurrentQuestion(page);
  await expect(page.getByTestId('feedback')).toHaveAttribute('data-correct', 'true');
  await expect(page.getByTestId('feedback-xp')).not.toHaveText('+0 XP');
});

const LEVEL_4 = levelOf(JE, 4);

test('a similar question in a level is an extra: missing it does not change the score or the pass', async ({ page }) => {
  await seedPassedLevels(page, 3);
  await page.goto(`/play/${levelOf(JE, 4)}`);
  const q = page.getByTestId('question');
  await expect(q).toBeVisible();
  const progress = page.getByTestId('player-progress');
  await expect(progress).toHaveAttribute('aria-label', /0 of 8 steps done/);
  const firstId = (await q.getAttribute('data-question-id'))!;

  await reverseAnswer(page);
  await expect(page.getByTestId('feedback')).toHaveAttribute('data-correct', 'false');
  await page.getByTestId('try-similar').click();
  await expect(q).not.toHaveAttribute('data-question-id', firstId);
  await expect(progress).toHaveAttribute('aria-label', /1 of 9 steps done/);

  // The similar question is missed too, then the seven other questions are answered right.
  await reverseAnswer(page);
  await expect(page.getByTestId('feedback')).toHaveAttribute('data-correct', 'false');
  await page.getByTestId('continue').click();
  await playSession(page);

  await expect(page.getByTestId('results-score')).toHaveText('7 of 8 correct');
  await expect(page.getByTestId('results-passed')).toHaveText('Passed');
  const stored = await readStoredEvents(page);
  const results = stored.levelResults.filter((r) => r.levelId === LEVEL_4);
  expect(results).toHaveLength(1);
  expect(results[0]).toMatchObject({ score: 7 / 8, passed: true });
  expect(stored.attempts).toHaveLength(9);
});

test('a similar question can follow the last question; the result is saved once and the score stays that of the originals', async ({
  page,
}) => {
  await seedPassedLevels(page, 3);
  await page.goto(`/play/${levelOf(JE, 4)}`);
  const q = page.getByTestId('question');
  await expect(q).toBeVisible();
  for (let i = 0; i < 7; i++) {
    await answerCurrentQuestion(page);
    await page.getByTestId('continue').click();
  }
  const lastId = (await q.getAttribute('data-question-id'))!;
  await reverseAnswer(page);
  await expect(page.getByTestId('feedback')).toHaveAttribute('data-correct', 'false');

  // The last original has been answered, so the result is already stored, before the learner decides anything.
  const level4Results = async () => (await readStoredEvents(page)).levelResults.filter((r) => r.levelId === LEVEL_4);
  await expect.poll(async () => (await level4Results()).length).toBe(1);
  await page.getByTestId('try-similar').click();
  await expect(q).not.toHaveAttribute('data-question-id', lastId);
  await expect(page.getByTestId('player-progress')).toHaveAttribute('aria-label', /8 of 9 steps done/);
  await expect(page.getByTestId('results')).toHaveCount(0);

  await answerCurrentQuestion(page);
  await expect(page.getByTestId('feedback-xp')).toHaveText('+10 XP');
  await page.getByTestId('continue').click();

  await expect(page.getByTestId('results-score')).toHaveText('7 of 8 correct');
  await expect(page.getByTestId('results-passed')).toHaveText('Passed');
  // Seven right (70) and the right similar answer (10) plus the pass bonus (20): the extra's XP is included.
  await expect(page.getByTestId('results-xp')).toHaveText('+100 XP');
  const results = await level4Results();
  expect(results).toHaveLength(1);
  expect(results[0]).toMatchObject({ score: 7 / 8, passed: true });
  const { attempts } = await readStoredEvents(page);
  expect(attempts).toHaveLength(9);
  expect(new Set(attempts.map((a) => a.id)).size).toBe(9);
});

test('the daily challenge and mistake review offer no similar question', async ({ page }) => {
  await seedPassedLevels(page, 4);
  await page.goto('/practice/daily');
  await expect(page.getByTestId('question')).toBeVisible();
  await reverseAnswer(page);
  await expect(page.getByTestId('feedback')).toHaveAttribute('data-correct', 'false');
  await expect(page.getByTestId('try-similar')).toHaveCount(0);
});

test('an unknown mode is a 404, and an empty mistake review says so without writing anything', async ({ page }) => {
  const res = await page.goto('/practice/nope');
  expect(res?.status()).toBe(404);

  await page.goto('/practice/mistakes');
  await expect(page.getByTestId('practice-empty')).toBeVisible();
  await expect(page.getByTestId('practice-empty').getByRole('link')).toHaveAttribute('href', '/home');
  await expect(page.getByTestId('results')).toHaveCount(0);

  await page.goto('/topics');
  await expect(page.getByTestId('xp-total')).not.toContainText('–');
  expect(await headerXp(page)).toBe(0);
});

test('replaying an authored question shows the reduced XP that the total uses', async ({ page }) => {
  await seedPassedLevels(page, 1);
  await page.goto(`/play/${levelOf(JE, 2)}`);
  await expect(page.getByTestId('question')).toBeVisible();
  for (let i = 0; i < 5; i++) {
    await answerCurrentQuestion(page);
    // First time round: a full easy answer.
    await expect(page.getByTestId('feedback-xp')).toHaveText('+10 XP');
    await page.getByTestId('continue').click();
  }
  await expect(page.getByTestId('results-passed')).toHaveText('Passed');

  await page.goto(`/play/${levelOf(JE, 2)}`);
  await expect(page.getByTestId('question')).toBeVisible();
  await answerCurrentQuestion(page);
  await expect(page.getByTestId('feedback-xp')).toHaveText('+2 XP');
  await page.getByTestId('continue').click();
  for (let i = 1; i < 5; i++) {
    await answerCurrentQuestion(page);
    await page.getByTestId('continue').click();
  }
  // Five replayed answers at 2 XP each; the level was already passed, so no second pass bonus.
  await expect(page.getByTestId('results-xp')).toHaveText('+10 XP');
});

test('marking a level card Need to revise is recorded and the level still finishes', async ({ page }) => {
  await seedPassedLevels(page, 0);
  await page.goto(`/play/${levelOf(JE, 1)}`);
  const card = page.getByTestId('card');
  const revise = (await card.getAttribute('data-card-id'))!;
  await page.getByTestId('card-flip').click();
  await page.getByTestId('card-again').click();
  for (let i = 1; i < JE_LEVEL_CARDS; i++) {
    await page.getByTestId('card-flip').click();
    await page.getByTestId('card-got-it').click();
  }
  await expect(page.getByTestId('results-passed')).toHaveText('Passed');
  // Every Journal Entries card of the level has been seen and all but one were known, so only the card marked Need
  // to revise is due; new cards come from the active topics (Journal Entries), which has none left.
  await page.goto('/practice/cards');
  await expect(card).toHaveAttribute('data-card-id', revise);
  const due = cardSteps(Math.max(0, JE_CARDS - JE_LEVEL_CARDS), 1);
  await expect(page.getByTestId('player-progress')).toHaveAttribute('aria-label', new RegExp(`0 of ${due} steps done`));
});
