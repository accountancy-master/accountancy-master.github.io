import { expect, test } from '@playwright/test';
import { COURSES } from '../src/content/registry';
import { CLASS11_PACKS as PACKS } from './helpers';
import { JE, createProfile, seedPassedLevels } from './helpers';

const noSidewaysScroll = () => document.documentElement.scrollWidth <= window.innerWidth;

test.beforeEach(async ({ page }) => {
  await createProfile(page, 'Varun');
});

test('Practise a topic lists every playable topic in course order and starts practice of the one picked', async ({ page }) => {
  await seedPassedLevels(page, 4);
  await page.goto('/practice');
  await expect(page.getByTestId('hub-topic-count')).toHaveText(`${PACKS.length} topics`);
  await page.getByTestId('hub-topic').click();
  await expect(page).toHaveURL(/\/practice\/topic$/);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Practise a topic');

  const playable = COURSES[0].topics.filter((t) => PACKS.some((p) => p.topicId === t.id));
  const rows = page.locator('a[data-testid^="pick-topic-"]');
  await expect(rows).toHaveCount(playable.length);
  expect(await rows.evaluateAll((els) => els.map((el) => el.getAttribute('data-testid')))).toEqual(
    playable.map((t) => `pick-topic-${t.id}`),
  );
  // The units are the headings, in the order the course lists them.
  await expect(page.getByRole('heading', { level: 2 })).toHaveText([...new Set(playable.map((t) => t.unit))]);
  // Every topic can be practised, whatever has been passed: choosing a topic unlocks nothing and needs nothing unlocked.
  await expect(page.getByTestId(`pick-topic-${JE}-hint`)).not.toHaveText('Pass a level here first');
  const other = playable.find((t) => t.id !== JE)!;
  await expect(page.getByTestId(`pick-topic-${other.id}-hint`)).toHaveText('Not started');
  expect(await page.evaluate(noSidewaysScroll)).toBe(true);

  await page.getByTestId(`pick-topic-${JE}`).click();
  await expect(page).toHaveURL(new RegExp(`/practice/topic/${JE}$`));
  const question = page.getByTestId('question');
  await expect(question).toBeVisible();
  expect(await question.getAttribute('data-question-id')).toMatch(/^gen:/);
});

test('a new learner can practise any topic at once, with nothing passed and the levels locked', async ({ page }) => {
  const last = PACKS.at(-1)!;
  await page.goto('/practice/topic');
  await expect(page.getByTestId(`pick-topic-${last.topicId}-hint`)).toHaveText('Not started');
  await page.getByTestId(`pick-topic-${last.topicId}`).click();
  const question = page.getByTestId('question');
  await expect(question).toBeVisible({ timeout: 60_000 });
  await expect(page.getByTestId('practice-empty')).toHaveCount(0);
});
