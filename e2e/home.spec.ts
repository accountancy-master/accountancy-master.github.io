import { expect, test, type Page } from '@playwright/test';
import { CLASS11_PACKS as PACKS } from './helpers';
import { nextLevel, topicTitle } from '../src/learning/recommend';
import {
  FIRST_TOPIC,
  JE,
  answerCurrentQuestion,
  createProfile,
  levelOf,
  playSession,
  readLesson,
  seedPassedLevels,
  xpOf,
} from './helpers';

/** The first number in the goal ring's "N / G XP". */
async function ringXp(page: Page): Promise<number> {
  const text = (await page.getByTestId('goal-ring').textContent()) ?? '';
  return Number(/^\s*(\d+)\s*\//.exec(text)![1]);
}

// A brand-new learner is on the first playable topic in course order, whichever topic that is.
const FIRST_LEVEL = levelOf(FIRST_TOPIC.topicId, 0);

test('a new learner lands on the dashboard with a first level to continue with and an empty week', async ({ page }) => {
  await createProfile(page, 'Varun');
  await expect(page).toHaveURL(/\/home$/);
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Varun');
  await expect(page.getByTestId('goal-ring')).toHaveText('0 / 50 XP');
  await expect(page.getByTestId('goal-met')).toHaveCount(0);

  await expect(page.getByTestId('mission-card')).toBeVisible();

  // One card says what to do now and why; it is the only way to the first level (no second button for it).
  await expect(page.getByTestId('continue-card')).toHaveAttribute('data-why', 'start');
  await expect(page.getByTestId('continue-card')).toContainText('Start here');
  await expect(page.getByTestId('continue-card')).toContainText(topicTitle(FIRST_TOPIC.topicId));
  await expect(page.getByTestId('continue-why')).toContainText(`The course starts with ${topicTitle(FIRST_TOPIC.topicId)}.`);
  await expect(page.getByTestId('continue-start')).toHaveAttribute('href', `/play/${FIRST_LEVEL}`);
  await expect(page.locator(`main a[href="/play/${FIRST_LEVEL}"]`)).toHaveCount(1);
  await expect(page.getByTestId('recommend-card')).toHaveCount(0);
  // No tiles of zeros for a learner with nothing to count yet.
  await expect(page.getByRole('list', { name: 'Your numbers' })).toHaveCount(0);
  // The card is on the first screen, even on a phone.
  const card = (await page.getByTestId('continue-start').boundingBox())!;
  expect(card.y + card.height).toBeLessThanOrEqual(page.viewportSize()!.height);
  await expect(page.getByTestId('quick-cards')).toHaveAttribute('href', '/practice/cards');
  await expect(page.getByTestId('quick-mistakes')).toHaveAttribute('href', '/mistakes');
  await expect(page.getByTestId('quick-sheet')).toHaveAttribute('href', `/sheet/${FIRST_TOPIC.topicId}`);
  await expect(page.getByTestId('quick-smart')).toHaveAttribute('href', '/practice/smart');

  const bars = page.getByTestId('week-chart').getByTestId('week-bar');
  await expect(bars).toHaveCount(7);
  await expect(bars.first()).toHaveAttribute('aria-label', /^Mon: /);
  await expect(bars.last()).toHaveAttribute('aria-label', /^Sun: /);
  await expect(page.getByTestId('week-chart').locator('[data-today="true"]')).toHaveCount(1);
});

test('before any level is passed the mission and the challenge are locked, and passing level 0 offers them', async ({ page }) => {
  await createProfile(page, 'Varun');
  await expect(page.getByTestId('mission-card')).toContainText("Pass your first level to unlock today's mission");
  await expect(page.getByTestId('challenge-card')).toContainText("Pass your first level to unlock today's challenge");
  await expect(page.getByTestId('mission-start')).toHaveCount(0);
  await expect(page.getByTestId('challenge-start')).toHaveCount(0);

  // The hub says the same, the tiles open the topic, and the practice pages explain themselves.
  await page.getByTestId('nav-practice').click();
  await expect(page.getByTestId('hub-mission-count')).toHaveText("Pass your first level to unlock today's mission");
  await expect(page.getByTestId('hub-daily-count')).toHaveText("Pass your first level to unlock today's challenge");
  await expect(page.getByTestId('hub-mission')).toHaveAttribute('href', `/topics/${FIRST_TOPIC.topicId}`);
  await expect(page.getByTestId('hub-daily')).toHaveAttribute('href', `/topics/${FIRST_TOPIC.topicId}`);
  for (const [mode, text] of [
    ['mission', "Pass your first level to unlock today's mission"],
    ['daily', "Pass your first level to unlock today's challenge"],
    ['smart', 'Pass a level to unlock practice'],
    ['fresh', 'Pass a level to unlock practice'],
  ] as const) {
    await page.goto(`/practice/${mode}`);
    await expect(page.getByTestId('practice-empty')).toContainText(text);
    await expect(page.getByTestId('question')).toHaveCount(0);
  }

  // Playing Journal Entries makes it the learner's topic: the mission and the challenge then draw from it.
  await page.goto(`/play/${levelOf(JE, 0)}`);
  await readLesson(page);
  await answerCurrentQuestion(page);
  await page.getByTestId('continue').click();
  await expect(page.getByTestId('results-passed')).toHaveText('Passed');
  await page.getByTestId('results-topic').click();
  await page.getByTestId('nav-home').click();
  await expect(page.getByTestId('mission-start')).toHaveAttribute('href', '/practice/mission');
  await expect(page.getByTestId('mission-card')).toContainText('1 question');
  await expect(page.getByTestId('challenge-start')).toHaveAttribute('href', '/practice/daily');
  await expect(page.getByTestId('mission-locked')).toHaveCount(0);
  await expect(page.getByTestId('challenge-locked')).toHaveCount(0);
});

test('passing a level moves the goal ring, the continue card and today\'s bar', async ({ page }) => {
  await createProfile(page, 'Varun');
  await page.goto(`/play/${levelOf(JE, 0)}`);
  await readLesson(page);
  await answerCurrentQuestion(page);
  await page.getByTestId('continue').click();
  await expect(page.getByTestId('results-passed')).toHaveText('Passed');

  await page.getByTestId('results-topic').click();
  await page.getByTestId('nav-home').click();
  await expect(page).toHaveURL(/\/home$/);
  await expect(page.getByTestId('goal-ring')).toHaveText('30 / 50 XP');
  await expect(page.getByTestId('continue-start')).toHaveAttribute('href', `/play/${levelOf(JE, 1)}`);
  await expect(page.getByTestId('continue-card')).toHaveAttribute('data-why', 'continue');
  await expect(page.getByTestId('continue-why')).toHaveText(`You are part-way through ${topicTitle(JE)}: 1 of ${PACKS.find((p) => p.topicId === JE)!.levels.length} levels passed. This is the next one.`);
  // Now there is something to count: the tiles appear, levels passed among them.
  await expect(page.getByTestId('home-levels')).toHaveText('1');
  const today = page.getByTestId('week-chart').locator('[data-today="true"]');
  await expect(today).toHaveAttribute('aria-label', /^\w{3}: 30 XP/);
});

test('reaching the daily goal says so', async ({ page }) => {
  await createProfile(page, 'Varun');
  await seedPassedLevels(page, 2);
  await page.getByTestId('nav-home').click();
  await expect(page.getByTestId('goal-ring')).toHaveText('60 / 50 XP');
  await expect(page.getByTestId('goal-met')).toHaveText('Goal met');
});

test('finishing the mission turns its card to complete and adds the bonus to the ring', async ({ page }) => {
  test.setTimeout(90_000); // Cards, practice and challenge questions through the real screens.
  await createProfile(page, 'Varun');
  await seedPassedLevels(page, 4);
  await page.getByTestId('nav-home').click();
  await expect(page.getByTestId('mission-card')).toContainText('questions');
  await expect(page.getByTestId('mission-card')).toContainText('50 XP');
  const before = await ringXp(page);

  await page.getByTestId('mission-start').click();
  await expect(page).toHaveURL(/\/practice\/mission$/);
  await playSession(page);
  await expect(page.getByTestId('results-bonus')).toContainText('50');
  const gained = await xpOf(page, 'results-xp');
  await page.getByTestId('results-home').click();

  await expect(page).toHaveURL(/\/home$/);
  await expect(page.getByTestId('mission-card')).toContainText('Mission complete');
  await expect(page.getByTestId('mission-start')).toHaveCount(0);
  await expect(page.getByTestId('goal-ring')).toContainText(`${before + gained} /`);
});

test('the daily challenge shows done for today once played, and a finished ladder says so', async ({ page }) => {
  // With every level passed the challenge of the day may hold a set of up to eight journal entries, typed row by row.
  test.setTimeout(120_000);
  await createProfile(page, 'Varun');
  // Every level of every topic, so the test does not depend on which topics have content.
  await seedPassedLevels(page, 'all');
  await page.getByTestId('nav-home').click();
  await expect(page.getByTestId('continue-card')).toContainText('All levels passed');
  await expect(page.getByTestId('continue-start')).toHaveCount(0);
  await expect(page.getByTestId('recommend-start')).toHaveAttribute('href', /^\/practice\//);

  await page.getByTestId('challenge-start').click();
  await playSession(page);
  await page.getByTestId('results-home').click();
  await expect(page.getByTestId('challenge-card')).toContainText('Done for today');
  await expect(page.getByTestId('challenge-start')).toHaveCount(0);
});

test('five navigation items fit with readable labels and nothing scrolls sideways', async ({ page }) => {
  await createProfile(page, 'Varun');
  const ids = ['nav-home', 'nav-topics', 'nav-practice', 'nav-progress', 'nav-settings'];
  const labels = ['Home', 'Topics', 'Practice', 'Progress', 'Settings'];
  for (const [i, id] of ids.entries()) {
    const item = page.getByTestId(id);
    await expect(item).toBeVisible();
    await expect(item).toHaveText(labels[i]);
  }
  await expect(page.getByTestId('nav-home')).toHaveAttribute('aria-current', 'page');
  await expect(page.getByTestId('nav-practice')).toHaveAttribute('href', '/practice');

  // The narrowest phone the app supports: every item keeps a 44 px target and its whole label.
  await page.setViewportSize({ width: 360, height: 740 });
  // The phone's bottom bar replaces the sidebar once the app sees the new width: measure after that, not before.
  await expect(page.locator('nav[aria-label="Main"] a')).toHaveCount(5);
  const fits = await page.evaluate(() => {
    const items = [...document.querySelectorAll<HTMLElement>('nav[aria-label="Main"] a')];
    return items.map((a) => {
      const box = a.getBoundingClientRect();
      return { width: box.width, height: box.height, clipped: a.scrollWidth > a.clientWidth };
    });
  });
  expect(fits).toHaveLength(5);
  for (const f of fits) {
    expect(f.height).toBeGreaterThanOrEqual(44);
    expect(f.width).toBeGreaterThanOrEqual(44);
    expect(f.clipped).toBe(false);
  }
  expect(await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth)).toBe(false);
});

test('the next step stays with the topic part-way through, whatever else is practised, and the quick sheet follows the topic played last', async ({ page }) => {
  const other = PACKS.find((p) => p.topicId !== JE);
  test.skip(!other, 'needs a second playable topic');
  const second = other!;
  await createProfile(page, 'Varun');
  // Played Journal Entries last (the other topic first), though the other may come earlier in the course.
  await seedPassedLevels(page, 0, second.topicId);
  await seedPassedLevels(page, 0, JE);
  await page.getByTestId('nav-home').click();
  await expect(page.getByTestId('continue-start')).toHaveAttribute('href', `/play/${levelOf(JE, 1)}`);
  await expect(page.getByTestId('quick-sheet')).toHaveAttribute('href', `/sheet/${JE}`);

  // Now the other topic is played last, and every one of its levels is passed: the next topic in course order
  // with a level left comes next. What that is follows from the packs and the order of play.
  await seedPassedLevels(page, 'all', second.topicId);
  await page.getByTestId('nav-home').click();
  await expect(page.getByTestId('quick-sheet')).toHaveAttribute('href', `/sheet/${second.topicId}`);
  const passedIds = [levelOf(JE, 0), ...second.levels.map((l) => l.id)];
  const expected = nextLevel(PACKS, passedIds, false, { [JE]: 1, [second.topicId]: 2 });
  if (expected) await expect(page.getByTestId('continue-start')).toHaveAttribute('href', `/play/${expected.level.id}`);
  else await expect(page.getByTestId('continue-card')).toContainText('All levels passed');
  // The other topic finished, Journal Entries is the one part-way through: it is the next step.
  await expect(page.getByTestId('continue-start')).toHaveAttribute('href', `/play/${levelOf(JE, 1)}`);
});

test('practising another topic (not its ladder) does not move the next step there', async ({ page }) => {
  const other = PACKS.find((p) => p.topicId !== JE);
  test.skip(!other, 'needs a second playable topic');
  await createProfile(page, 'Varun');
  await seedPassedLevels(page, 0, JE);
  await page.getByTestId('nav-home').click();
  await expect(page.getByTestId('continue-start')).toHaveAttribute('href', `/play/${levelOf(JE, 1)}`);
  // A practice question in the other topic is played after it.
  await page.goto(`/practice/topic/${other!.topicId}`);
  await answerCurrentQuestion(page);
  await expect(page.getByTestId('feedback')).toBeVisible();
  await page.goto('/home');
  await expect(page.getByTestId('continue-start')).toHaveAttribute('href', `/play/${levelOf(JE, 1)}`);
  await expect(page.getByTestId('continue-card')).toContainText(topicTitle(JE));
  // It was played, though: the quick sheet follows the topic played last.
  await expect(page.getByTestId('quick-sheet')).toHaveAttribute('href', `/sheet/${other!.topicId}`);
});

test('the greeting is never squeezed and the stat tiles stay compact, from 1024 to 1920 px and at 360 px', async ({ page }, info) => {
  test.skip(info.project.name !== 'laptop', 'the sizes are set here');
  await createProfile(page, 'Varunkumar');
  // Levels passed without a question answered: the goal is met, and there is no streak yet.
  await seedPassedLevels(page, 3);
  for (const width of [1024, 1280, 1440, 1920, 360]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto('/home');
    const h1 = page.getByRole('heading', { level: 1 });
    await expect(h1).toContainText('Varunkumar');
    // The name is never broken; on a laptop the greeting is one line, on a phone at most two.
    expect(await page.getByTestId('home-name').evaluate((el) => el.getClientRects().length), `${width} px`).toBe(1);
    const lines = await h1.evaluate((el) => Math.round(el.getBoundingClientRect().height / parseFloat(getComputedStyle(el).lineHeight)));
    expect(lines, `${width} px`).toBeLessThanOrEqual(width < 1024 ? 2 : 1);
    await expect(page.getByTestId('home-status')).toHaveText("Today's goal is met. Answer a question or rate a card to start a streak.");
    const tiles = await page.getByRole('list', { name: 'Your numbers' }).getByRole('listitem').all();
    expect(tiles).toHaveLength(5);
    for (const tile of tiles) {
      expect((await tile.boundingBox())!.height, `${width} px`).toBeLessThan(140);
      // Nothing in a tile runs over its edge.
      expect(await tile.evaluate((el) => el.scrollWidth <= el.clientWidth + 1), `${width} px`).toBe(true);
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth), `${width} px`).toBe(false);
  }
});
