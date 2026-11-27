import { expect, test } from '@playwright/test';
import { findCourse } from '../src/content/outline';
import '../src/content/registry';
import { CONFIG } from '../src/learning/config';
import { coursePatterns } from '../src/learning/patterns';
import { CLASS11, FIRST_TOPIC, createProfile, playSession, seedPassedLevels } from './helpers';

// New cards are offered from the learner's active topics only; a learner who has played nothing is on the first topic.
const NEW_CARDS = FIRST_TOPIC.cards.length;
const SMART = CONFIG.practice.smart.weak + CONFIG.practice.smart.due + CONFIG.practice.smart.fresh;

test.beforeEach(async ({ page }) => {
  await createProfile(page, 'Varun');
});

test('a new learner sees every activity, with nothing due, every card new and no mistakes', async ({ page }) => {
  await page.getByTestId('nav-practice').click();
  await expect(page).toHaveURL(/\/practice$/);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Practice');
  await expect(page.getByTestId('nav-practice')).toHaveAttribute('aria-current', 'page');

  await expect(page.getByTestId('hub-cards-count')).toHaveText(`0 due · ${NEW_CARDS} new`);
  await expect(page.getByTestId('hub-mistakes-count')).toHaveText('Nothing to review');
  for (const id of ['smart', 'fresh', 'cards', 'mistakes', 'daily', 'mission']) {
    await expect(page.getByTestId(`hub-${id}`)).toBeVisible();
  }
  // No level is passed yet, so there is nothing to practise and no mission to offer.
  await expect(page.getByTestId('hub-fresh-count')).toHaveText('Nothing to practise yet');
  await expect(page.getByTestId('hub-mission-count')).toHaveText("Pass your first level to unlock today's mission");

  // An empty tile still opens its mode, which explains itself.
  await page.getByTestId('hub-fresh').click();
  await expect(page).toHaveURL(/\/practice\/fresh$/);
  await expect(page.getByTestId('practice-empty')).toBeVisible();
});

test('one card marked Need to revise is counted as due and no longer as new', async ({ page }) => {
  await page.goto('/practice/cards');
  await expect(page.getByTestId('card')).toBeVisible();
  await page.getByTestId('card-flip').click();
  await page.getByTestId('card-again').click();
  await expect(page.getByTestId('card-answer')).toHaveCount(0);
  await page.getByTestId('player-close').click();
  await expect(page).toHaveURL(/\/home$/);

  await page.getByTestId('nav-practice').click();
  await expect(page.getByTestId('hub-cards-count')).toHaveText(`1 due · ${NEW_CARDS - 1} new`);
});

test('each tile opens its practice mode', async ({ page }) => {
  await seedPassedLevels(page, 4);
  const tiles = [
    ['smart', '/practice/smart'],
    ['fresh', '/practice/fresh'],
    ['cards', '/practice/cards'],
    ['mistakes', '/mistakes'],
    ['daily', '/practice/daily'],
    ['mission', '/practice/mission'],
  ] as const;
  for (const [id, href] of tiles) {
    await page.goto('/practice');
    await expect(page.getByTestId(`hub-${id}`)).toHaveAttribute('href', href);
    await page.getByTestId(`hub-${id}`).click();
    await expect(page).toHaveURL(new RegExp(`${href}$`));
  }
  await page.goto('/practice');
  await expect(page.getByTestId('hub-smart-count')).toHaveText(`${SMART} questions`);
  await expect(page.getByTestId('hub-fresh-count')).toHaveText(`${CONFIG.practice.freshCount} questions`);
  await expect(page.getByTestId('hub-daily-count')).toHaveText(`${CONFIG.practice.dailyChallengeCount} questions`);
});

test("today's challenge says it is done once it has been played", async ({ page }) => {
  await seedPassedLevels(page, 4);
  await page.goto('/practice');
  await expect(page.getByTestId('hub-daily')).not.toContainText('Done for today');
  await page.getByTestId('hub-daily').click();
  await playSession(page);
  await page.getByTestId('results-home').click();

  await page.getByTestId('nav-practice').click();
  await expect(page.getByTestId('hub-daily-count')).toHaveText('Done for today');
  await expect(page.getByTestId('hub-daily')).toHaveAttribute('href', '/practice/daily');
});

/** Every tile of the hub, in its order, with where it leads for a learner who has passed a level. */
const TILES = [
  ['playground', '/playground'],
  ['simulator', '/simulator'],
  ['marathon', '/practice/marathon'],
  ['topic', '/practice/topic'],
  ['smart', '/practice/smart'],
  ['fresh', '/practice/fresh'],
  ['mistakes', '/mistakes'],
  ['cards', '/practice/cards'],
  ['mission', '/practice/mission'],
  ['daily', '/practice/daily'],
  ['cases', '/cases'],
  ['mock', '/mock'],
] as const;

test('the hub is a grid of tiles, each with an icon, a title, a line about it and what is waiting, under the course in focus', async ({ page }) => {
  await seedPassedLevels(page, 4);
  await page.goto('/practice');
  await expect(page.getByTestId('hub-focus')).toContainText('Focus on');
  await expect(page.getByTestId('hub-focus')).toContainText(findCourse(CLASS11)!.title);
  const tiles = page.getByTestId('hub-tiles').getByRole('listitem');
  await expect(tiles).toHaveCount(TILES.length);
  for (const [i, [id, href]] of TILES.entries()) {
    const tile = page.getByTestId(`hub-${id}`);
    await expect(tiles.nth(i).getByTestId(`hub-${id}`)).toBeVisible();
    await expect(tile).toHaveAttribute('href', href);
    await expect(page.getByTestId(`hub-${id}-count`)).not.toBeEmpty();
    // Its coloured top edge.
    expect(await tile.evaluate((el) => parseFloat(getComputedStyle(el).borderTopWidth))).toBeGreaterThanOrEqual(2);
  }
  await expect(page.getByTestId('hub-playground-count')).toHaveText(`${coursePatterns(CLASS11).length.toLocaleString('en-IN')} patterns to play`);
  // Three or four to a row on a laptop, one or two on a phone.
  const tops = await Promise.all(TILES.slice(0, 4).map(async ([id]) => (await page.getByTestId(`hub-${id}`).boundingBox())!.y));
  const firstRow = tops.filter((y) => Math.abs(y - tops[0]) < 2).length;
  if ((page.viewportSize()?.width ?? 0) >= 1024) expect(firstRow).toBeGreaterThanOrEqual(3);
  else expect(firstRow).toBeLessThanOrEqual(2);
  await page.getByTestId('hub-playground').click();
  await expect(page).toHaveURL(/\/playground$/);
});

test('the hub fits a 360 px phone without sideways scrolling', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 740 });
  await page.goto('/practice');
  await expect(page.getByTestId('hub-smart')).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth)).toBe(false);
  for (const [id] of TILES) {
    const box = await page.getByTestId(`hub-${id}`).boundingBox();
    expect(box!.height).toBeGreaterThanOrEqual(44);
  }
});
