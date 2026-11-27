import { expect, test, type Page } from '@playwright/test';
import { findQuestion } from '../src/content/registry';
import { CONFIG } from '../src/learning/config';
import { rankFor } from '../src/learning/gamification';
import { lessonSteps } from '../src/play/lessonSteps';
import { answerCurrentQuestion, createProfile, headerXp, playSession, readLesson, readStoredEvents, JE, levelOf, packOf } from './helpers';

// Plays levels 0 to 6 of Journal Entries through the real screens, in order, on a fresh profile, then completes
// today's mission and today's challenge from the Dashboard.
// Each entry is one level: what to do first, then how many questions follow.
// The cards of level 1 (the rule-card revision level), read from the pack.
const LEVEL_CARDS = packOf(JE).levels.find((l) => l.order === 1)!.cardIds!.length;

const PLAN: { order: number; lessonSteps?: number; cards?: number; questions: number }[] = [
  { order: 0, lessonSteps: lessonSteps(packOf(JE).levels[0].lesson!).length, questions: 1 },
  { order: 1, cards: LEVEL_CARDS, questions: 0 },
  { order: 2, questions: 5 },
  { order: 3, questions: 4 },
  { order: 4, questions: 8 },
  { order: 5, questions: 6 },
  { order: 6, questions: 6 },
];

const LEVEL_QUESTIONS = PLAN.reduce((n, step) => n + step.questions, 0);

// XP: 1 easy question (10) + 5 easy (50) + 4 easy (40) + 8 easy (80) + 6 medium (120) + 6 medium (120),
// plus the 20 XP pass bonus for each of the 7 levels (140). Level 1 is cards only and scores nothing.
const EXPECTED_XP = 10 + 50 + 40 + 80 + 120 + 120 + 7 * 20;

async function playLevel(page: Page, step: (typeof PLAN)[number], questionIds: string[]) {
  if (step.lessonSteps) expect(await readLesson(page)).toBe(step.lessonSteps);
  for (let i = 0; i < (step.cards ?? 0); i++) {
    await page.getByTestId('card-flip').click();
    await page.getByTestId('card-got-it').click();
  }
  for (let i = 0; i < step.questions; i++) {
    questionIds.push((await page.getByTestId('question').getAttribute('data-question-id'))!);
    await answerCurrentQuestion(page);
    await expect(page.getByTestId('feedback')).toHaveAttribute('data-correct', 'true');
    await page.getByTestId('continue').click();
  }
  await expect(page.getByTestId('results-passed')).toHaveText('Passed');
}

test('a new learner plays levels 0 to 6 and ends up a Bookkeeper', async ({ page }) => {
  // About 30 answered questions and 11 cards for the levels, then a mission (cards, practice and challenge
  // questions) and a daily challenge of 5 more questions through the real screens: legitimately long.
  test.setTimeout(8 * 60_000);

  const consoleErrors: string[] = [];
  page.on('console', (msg) => {
    if (msg.type() === 'error') consoleErrors.push(`console.error: ${msg.text()}`);
  });
  page.on('pageerror', (err) => consoleErrors.push(`pageerror: ${err.message}`));

  const levelQuestions: string[] = [];
  await createProfile(page, 'Varun');
  await page.goto(`/topics/${JE}`);
  await page.getByTestId('level-start-0').click();

  for (const [i, step] of PLAN.entries()) {
    await expect(page).toHaveURL(new RegExp(`/play/${levelOf(JE, step.order)}$`));
    await playLevel(page, step, levelQuestions);
    if (i < PLAN.length - 1) await page.getByTestId('results-next').click();
  }

  await page.getByTestId('results-topic').click();
  await expect(page).toHaveURL(new RegExp(`/topics/${JE}$`));
  for (let n = 0; n <= 6; n++) await expect(page.getByTestId(`level-${n}`)).toHaveAttribute('data-state', 'passed');
  await expect(page.getByTestId('level-7')).toHaveAttribute('data-state', 'unlocked');
  await expect(page.getByTestId('level-8')).toHaveAttribute('data-state', 'locked');
  await expect(page.getByTestId('stat-answered')).toHaveText(String(LEVEL_QUESTIONS));

  // At least one concept has moved off "Not started".
  const concepts = page.getByTestId('mastery-map').locator('li');
  const total = await concepts.count();
  expect(total).toBeGreaterThan(0);
  await expect(concepts.filter({ hasText: 'Not started' })).not.toHaveCount(total);

  await page.goto('/progress');
  await expect(page.getByTestId('progress-xp')).toHaveText(`${EXPECTED_XP} XP`);
  await expect(page.getByTestId('rank')).toHaveText('Bookkeeper');

  // The daily loop. Every question served is noted by id, so the expected XP is worked out from what was
  // actually served: its difficulty comes from the same registry the app uses, and XP per answer from CONFIG.
  // A question that was already answered right earlier (in a level, or earlier in the loop) earns the reduced
  // repeat share instead of full XP, whether authored or generated; the mission can serve such questions.
  const missionCards: string[] = [];
  const missionQuestions: string[] = [];
  const challengeQuestions: string[] = [];
  const answeredRight = new Set(levelQuestions);
  const xpFor = (ids: string[]) =>
    ids.reduce((sum, id) => {
      const question = findQuestion(id);
      expect(question, `${id} can be looked up`).toBeDefined();
      const full = CONFIG.xp.perCorrect[question!.difficulty];
      const repeat = answeredRight.has(id);
      answeredRight.add(id);
      return sum + (repeat ? Math.max(1, Math.round(full * CONFIG.xp.repeatFactor)) : full);
    }, 0);

  await page.getByTestId('nav-home').click();
  await expect(page).toHaveURL(/\/home$/);
  await page.getByTestId('mission-start').click();
  await expect(page).toHaveURL(/\/practice\/mission$/);
  await playSession(page, { onQuestion: (id) => missionQuestions.push(id), onCard: (id) => missionCards.push(id) });
  await expect(page.getByTestId('results-bonus')).toContainText('Daily mission bonus');
  await page.getByTestId('results-home').click();
  await expect(page).toHaveURL(/\/home$/);
  await expect(page.getByTestId('mission-card')).toContainText('Mission complete');
  await expect(page.getByTestId('mission-start')).toHaveCount(0);

  await page.getByTestId('challenge-start').click();
  await expect(page).toHaveURL(/\/practice\/daily$/);
  await playSession(page, { onQuestion: (id) => challengeQuestions.push(id) });
  await expect(page.getByTestId('results-bonus')).toContainText('Daily challenge bonus');
  await page.getByTestId('results-home').click();
  await expect(page).toHaveURL(/\/home$/);
  await expect(page.getByTestId('challenge-card')).toContainText('Done for today');
  await expect(page.getByTestId('challenge-start')).toHaveCount(0);

  // All the level's cards were rated Got it earlier today, so none is due and the mission may hold no cards at all.
  expect(missionQuestions.length).toBeGreaterThan(0);
  expect(challengeQuestions.length).toBe(CONFIG.practice.dailyChallengeCount);

  const served = [...missionQuestions, ...challengeQuestions];
  const finalXp = EXPECTED_XP + xpFor(served) + CONFIG.xp.dailyMissionBonus + CONFIG.xp.dailyChallengeBonus;
  await expect(page.getByTestId('goal-met')).toHaveText('Goal met');
  await expect(page.getByTestId('xp-total')).toContainText(String(finalXp));
  expect(await headerXp(page)).toBe(finalXp);

  await page.goto('/progress');
  await expect(page.getByTestId('progress-xp')).toHaveText(`${finalXp} XP`);
  await expect(page.getByTestId('rank')).toHaveText(rankFor(finalXp).name);

  // Everything was answered correctly, so nothing is waiting in the mistakes list.
  await page.goto('/mistakes');
  await expect(page.getByTestId('mistakes-empty')).toBeVisible();
  await expect(page.getByTestId('mistake-item')).toHaveCount(0);

  // Exactly once: every answer, card rating, level result and session result is stored one time, no more.
  const stored = await readStoredEvents(page);
  const attemptIds = stored.attempts.map((a) => a.id);
  expect(new Set(attemptIds).size).toBe(attemptIds.length);
  expect(attemptIds).toHaveLength(LEVEL_QUESTIONS + served.length);
  expect(stored.levelResults).toHaveLength(PLAN.length);
  expect(stored.sessionResults.filter((r) => r.kind === 'daily_mission')).toHaveLength(1);
  expect(stored.sessionResults.filter((r) => r.kind === 'daily_challenge')).toHaveLength(1);
  expect(stored.cardReviews).toHaveLength(LEVEL_CARDS + missionCards.length);
  expect(new Set(stored.cardReviews.map((r) => r.id)).size).toBe(stored.cardReviews.length);

  expect(consoleErrors).toEqual([]);
});
