import { expect, test, type Page } from '@playwright/test';
import { findQuestion } from '../src/content/registry';
import { CLASS11_PACKS as PACKS } from './helpers';
import {
  FIRST_TOPIC,
  JE,
  answerCurrentQuestion,
  createProfile,
  headerXp,
  levelOf,
  packOf,
  playSession,
  readLesson,
  seedPassedLevels,
  xpOf,
} from './helpers';

// A device that has never chosen has the ladder in order (the default). The tests of the open ladder store the choice
// ('Unlock all levels' on) before the app loads, as a learner who turned the switch on would have.
const NOTE = 'All levels are unlocked. You can turn level locking back on in Settings.';

/** Client-side navigation (no page load) to the topic page. */
async function openTopicInApp(page: Page) {
  await page.getByTestId('nav-topics').click();
  await page.getByTestId(`topic-card-${JE}`).click();
  await expect(page).toHaveURL(new RegExp(`/topics/${JE}$`));
}

async function expectLevels(page: Page, order: number[], state: 'locked' | 'open') {
  for (const i of order) {
    const row = page.getByTestId(`level-${i}`);
    if (state === 'locked') {
      await expect(row, `level ${i}`).toHaveAttribute('data-state', 'locked');
      await expect(page.getByTestId(`level-start-${i}`)).toHaveCount(0);
    } else {
      await expect(row, `level ${i}`).not.toHaveAttribute('data-state', 'locked');
      await expect(page.getByTestId(`level-start-${i}`), `level ${i}`).toBeVisible();
    }
  }
}

const LEVELS = packOf(JE).levels.length;
const range = (from: number, to: number) => Array.from({ length: to - from + 1 }, (_, i) => from + i);

test('a fresh device sees the ladder locked: the first level open, every other locked, and the switch off', async ({ page }) => {
  await createProfile(page, 'Varun', { keepDeviceDefaults: true });
  expect(await page.evaluate(() => localStorage.getItem('am.unlockAll'))).toBeNull();
  await expect(page.getByTestId('mission-locked')).toBeVisible();
  await page.goto(`/topics/${JE}`);
  await expect(page.getByTestId('level-0')).toHaveAttribute('data-state', 'unlocked');
  await expectLevels(page, range(1, LEVELS - 1), 'locked');
  await expect(page.getByTestId('unlock-all-note')).toHaveCount(0);
  await page.goto(`/play/${levelOf(JE, 9)}`);
  await expect(page.getByTestId('level-locked')).toBeVisible();
  await page.goto('/settings');
  await expect(page.getByTestId('unlock-all-toggle')).toHaveAttribute('aria-checked', 'false');
  // Looking at the switch stores nothing: the device has still not chosen.
  expect(await page.evaluate(() => localStorage.getItem('am.unlockAll'))).toBeNull();
});

test('with every level unlocked any level can be played, and the mission and challenge are offered', async ({ page }) => {
  await createProfile(page, 'Varun', { unlockAll: true });
  // A brand-new learner: the Dashboard already offers both.
  await expect(page.getByTestId('mission-start')).toHaveAttribute('href', '/practice/mission');
  await expect(page.getByTestId('challenge-start')).toHaveAttribute('href', '/practice/daily');
  await expect(page.getByTestId('mission-locked')).toHaveCount(0);
  await expect(page.getByTestId('challenge-locked')).toHaveCount(0);

  await page.goto(`/topics/${JE}`);
  await expect(page.getByTestId('level-0')).toBeVisible();
  await expect(page.getByTestId('unlock-all-note')).toHaveText(NOTE);
  await expectLevels(page, range(0, LEVELS - 1), 'open');
  await expect(page.locator('[data-state="locked"]')).toHaveCount(0);
  // The next step is still the first level that has not been passed.
  await expect(page.getByTestId('level-0')).toHaveAttribute('data-next', 'true');
  await expect(page.locator('[data-next="true"]')).toHaveCount(1);

  await page.goto(`/play/${levelOf(JE, 9)}`);
  await expect(page.getByTestId('level-locked')).toHaveCount(0);
  await expect(page.getByTestId('question')).toBeVisible();
  await answerCurrentQuestion(page);
  await expect(page.getByTestId('feedback')).toBeVisible();

  await page.goto('/practice');
  // The first topic in course order is the learner's topic, and it has something to serve.
  await expect(page.getByTestId('hub-smart-count')).toHaveText(/^\d+ questions$/);
  await expect(page.getByTestId('hub-fresh-count')).toHaveText(/^\d+ questions$/);
});

test('with every level unlocked a new learner is still served the first topic only', async ({ page }) => {
  test.setTimeout(120_000);
  await createProfile(page, 'Varun', { unlockAll: true });
  for (const mode of ['smart', 'daily'] as const) {
    await page.goto(`/practice/${mode}`);
    const served: string[] = [];
    await playSession(page, { onQuestion: (id) => served.push(id) });
    expect(served.length, mode).toBeGreaterThan(0);
    for (const id of served) expect(findQuestion(id)?.topicId, `${mode} ${id}`).toBe(FIRST_TOPIC.topicId);
  }
  // The topic is not the one played first by accident: after playing another topic, that one is the learner's.
  const other = PACKS.find((p) => p.topicId !== FIRST_TOPIC.topicId && p.questions.length + p.levels.length > 0);
  if (other) {
    await seedPassedLevels(page, 0, other.topicId);
    await page.goto('/practice/smart');
    const served: string[] = [];
    await playSession(page, { onQuestion: (id) => served.push(id) });
    for (const id of served) expect([FIRST_TOPIC.topicId, other.topicId], id).toContain(findQuestion(id)?.topicId);
  }
});

test('the Settings switch locks and unlocks the levels at once, without a reload', async ({ page }) => {
  await createProfile(page, 'Varun', { unlockAll: true });
  await page.getByTestId('nav-settings').click();
  const toggle = page.getByRole('switch', { name: 'Unlock all levels' });
  await expect(toggle).toHaveAttribute('data-testid', 'unlock-all-toggle');
  await expect(toggle).toHaveAttribute('aria-checked', 'true');
  await expect(toggle).toContainText('On');
  await expect(page.getByText('Open every level and all practice without passing the earlier levels.')).toBeVisible();
  const box = await toggle.boundingBox();
  expect(box!.height).toBeGreaterThanOrEqual(44);
  expect(box!.width).toBeGreaterThanOrEqual(44);

  // Proves later that no page load happened between the changes and what they show.
  await page.evaluate(() => ((window as unknown as { __kept: boolean }).__kept = true));
  await toggle.click();
  await expect(toggle).toHaveAttribute('aria-checked', 'false');
  await expect(toggle).toContainText('Off');

  await openTopicInApp(page);
  await expect(page.getByTestId('level-0')).toHaveAttribute('data-state', 'unlocked');
  await expectLevels(page, range(1, LEVELS - 1), 'locked');
  await expect(page.getByTestId('unlock-all-note')).toHaveCount(0);

  // Practice has nothing to serve yet in normal mode.
  await page.getByTestId('nav-practice').click();
  await expect(page.getByTestId('hub-mission-count')).toHaveText("Pass your first level to unlock today's mission");

  await page.getByTestId('nav-settings').click();
  await toggle.click();
  await expect(toggle).toHaveAttribute('aria-checked', 'true');
  await openTopicInApp(page);
  await expectLevels(page, range(1, LEVELS - 1), 'open');
  await expect(page.getByTestId('unlock-all-note')).toBeVisible();
  expect(await page.evaluate(() => (window as unknown as { __kept?: boolean }).__kept)).toBe(true);
});

test('the setting is kept across a reload, on and off', async ({ page }) => {
  // Nothing stored by the test: what is kept is what the switch stored.
  await createProfile(page, 'Varun', { keepDeviceDefaults: true });
  await page.goto('/settings');
  const toggle = page.getByTestId('unlock-all-toggle');
  await expect(toggle).toHaveAttribute('aria-checked', 'false');
  await toggle.click();
  await expect(toggle).toHaveAttribute('aria-checked', 'true');
  await page.reload();
  await expect(page.getByTestId('unlock-all-toggle')).toHaveAttribute('aria-checked', 'true');
  expect(await page.evaluate(() => localStorage.getItem('am.unlockAll'))).toBe('1');
  await page.goto(`/topics/${JE}`);
  await expectLevels(page, range(1, LEVELS - 1), 'open');

  // Turned off again, the choice is kept too: the device does not go back to "never chosen".
  await page.goto('/settings');
  await page.getByTestId('unlock-all-toggle').click();
  await expect(page.getByTestId('unlock-all-toggle')).toHaveAttribute('aria-checked', 'false');
  await page.reload();
  await expect(page.getByTestId('unlock-all-toggle')).toHaveAttribute('aria-checked', 'false');
  expect(await page.evaluate(() => localStorage.getItem('am.unlockAll'))).toBe('0');
  await page.goto(`/topics/${JE}`);
  await expectLevels(page, range(1, LEVELS - 1), 'locked');
  await expect(page.getByTestId('unlock-all-note')).toHaveCount(0);
  await page.goto(`/play/${levelOf(JE, 9)}`);
  await expect(page.getByTestId('level-locked')).toBeVisible();
});

test('with every level unlocked, passing a level is still recorded and still earns XP', async ({ page }) => {
  await createProfile(page, 'Varun', { unlockAll: true });
  await page.goto(`/play/${levelOf(JE, 0)}`);
  await readLesson(page);
  await answerCurrentQuestion(page);
  await page.getByTestId('continue').click();
  await expect(page.getByTestId('results-passed')).toHaveText('Passed');
  // One easy question (10) and the pass bonus (20).
  expect(await xpOf(page, 'results-xp')).toBe(30);

  await page.getByTestId('results-topic').click();
  await expect(page.getByTestId('level-0')).toHaveAttribute('data-state', 'passed');
  await expect(page.getByTestId('stat-levels')).toHaveText(`1 of ${LEVELS}`);
  await expect(page.getByTestId('level-1')).not.toHaveAttribute('data-state', 'locked');
  // The next step moves on to the first level that has not been passed.
  await expect(page.getByTestId('level-1')).toHaveAttribute('data-next', 'true');
  expect(await headerXp(page)).toBe(30);
});
