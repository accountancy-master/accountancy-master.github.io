import { expect, test } from '@playwright/test';
import { COURSES } from '../src/content/registry';
import { CLASS11_PACKS as PACKS, CLASS12_LIVE } from './helpers';
import { topicSize } from '../src/content/registry';
import { JE, createProfile, packOf, seedPassedLevels } from './helpers';
import { unitMarksOf } from '../src/learning/paperBlueprints';

const course = COURSES[0];
const available = course.topics.filter((t) => t.status === 'available');

test.beforeEach(async ({ page }) => {
  await createProfile(page, 'Varun');
  await page.goto('/topics');
});

test('shows available, upcoming and Class 12 topics, in the order of the catalogue', async ({ page }) => {
  // Every topic of the catalogue has a card, available exactly when its pack has a level.
  for (const topic of course.topics) {
    const playable = PACKS.some((p) => p.topicId === topic.id);
    await expect(page.getByTestId(`topic-card-${topic.id}`), topic.id).toHaveAttribute(
      'data-status',
      playable ? 'available' : topic.status,
    );
  }
  await expect(page.getByTestId(`topic-levels-${JE}`)).toHaveText(`0 of ${packOf(JE).levels.length} levels passed`);
  // Class 12 is previewed here until it has a topic that can be played; from then on it is a course of its own.
  if (CLASS12_LIVE) {
    await expect(page.getByTestId('preview-card')).toHaveCount(0);
    await expect(page.getByTestId('other-courses')).toContainText('Class 12 Accountancy is a course of its own.');
  } else {
    await expect(page.getByTestId('preview-card')).toHaveCount(course.previews.length);
    await expect(page.getByText('Class 12 – coming later').first()).toBeVisible();
  }

  // Cards follow the catalogue, and each unit heading appears once, in order.
  const ids = await page.locator('[data-testid^="topic-card-"]').evaluateAll((els) => els.map((e) => e.getAttribute('data-testid')!.replace('topic-card-', '')));
  expect(ids).toEqual(course.topics.map((t) => t.id));
  const units = [...new Set(course.topics.map((t) => t.unit))];
  await expect(page.getByRole('heading', { level: 2 }).filter({ hasText: new RegExp(`^(${units.join('|')})$`) })).toHaveText(units);
});

test('each available topic shows its levels passed, questions answered and the size of its bank', async ({ page }) => {
  for (const topic of available) {
    const pack = packOf(topic.id);
    const size = topicSize(topic.id);
    const card = page.getByTestId(`topic-card-${topic.id}`);
    // The ring counts levels passed, which is what a learner counts; mastery is said in words beside it.
    await expect(card.getByRole('img', { name: `${topic.title}: 0 of ${pack.levels.length} levels passed` })).toBeVisible();
    await expect(page.getByTestId(`topic-mastery-word-${topic.id}`)).toHaveText('Not started · mastery 0%');
    await expect(page.getByTestId(`topic-levels-${topic.id}`)).toHaveText(`0 of ${pack.levels.length} levels passed`);
    await expect(page.getByTestId(`topic-answered-${topic.id}`)).toHaveText('0 questions answered');
    const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;
    // In a learner's words: question types (never "generators"), and case studies for the topics that end with some.
    const parts = [
      plural(size.generators, 'question type', 'question types'),
      ...(size.cases > 0 ? [plural(size.cases, 'case study', 'case studies')] : []),
      plural(size.questions, 'set question', 'set questions'),
      plural(size.cards, 'rule card', 'rule cards'),
    ];
    await expect(page.getByTestId(`topic-size-${topic.id}`)).toHaveText(parts.join(' · '));
  }
});

test('only available topics can be opened, and the case studies and mock papers of the catalogue open their pages', async ({ page }) => {
  // Mixed case studies and the mock papers are live pages, never shown as "Planned".
  for (const [id, href] of [
    ['mixed-case-studies', '/cases'],
    ['mock-exams', '/mock'],
  ] as const) {
    if (!course.topics.some((t) => t.id === id) || PACKS.some((p) => p.topicId === id)) continue;
    const card = page.getByTestId(`topic-card-${id}`);
    await expect(card).not.toContainText('Planned');
    await expect(page.getByTestId(`topic-live-${id}`)).toHaveAttribute('href', href);
  }
  await expect(page.getByTestId('topics-summary')).not.toContainText('pattern');
  await expect(page.locator('body')).not.toContainText(/generators?/);
  const planned = course.topics.find((t) => !PACKS.some((p) => p.topicId === t.id) && !['mixed-case-studies', 'mock-exams'].includes(t.id));
  if (planned) {
    await page.getByTestId(`topic-card-${planned.id}`).click({ force: true });
    await expect(page).toHaveURL(/\/topics$/);
  }
  // A planned topic has no link to open; an available one opens from its title.
  if (planned) await expect(page.getByTestId(`topic-card-${planned.id}`).getByRole('link')).toHaveCount(0);
  await page.getByTestId(`topic-open-${JE}`).click();
  await expect(page).toHaveURL(new RegExp(`/topics/${JE}$`));
});

test('each topic card has Continue (or Start), Play in the playground and its quick sheet', async ({ page }) => {
  const first = packOf(JE).levels.find((l) => l.order === 0)!;
  await expect(page.getByTestId(`topic-continue-${JE}`)).toHaveText('Start');
  await expect(page.getByTestId(`topic-continue-${JE}`)).toHaveAttribute('href', `/play/${first.id}`);
  await expect(page.getByTestId(`topic-play-${JE}`)).toHaveAttribute('href', `/playground?topic=${JE}`);
  await expect(page.getByTestId(`topic-sheet-${JE}`)).toHaveAttribute('href', `/sheet/${JE}`);
});

test('the search narrows the topics by title, unit or concept, and "/" focuses it', async ({ page }) => {
  const showing = page.getByTestId('topics-showing');
  await expect(showing).toHaveText(`Showing ${course.topics.length} of ${course.topics.length} topics`);
  await page.locator('body').click({ position: { x: 5, y: 300 } });
  await page.keyboard.press('/');
  await expect(page.getByTestId('topics-search')).toBeFocused();
  await page.keyboard.type('journal entr');
  await expect(page.getByTestId(`topic-card-${JE}`)).toBeVisible();
  const shown = await page.locator('[data-testid^="topic-card-"]').count();
  expect(shown).toBeLessThan(course.topics.length);
  await expect(showing).toHaveText(`Showing ${shown} of ${course.topics.length} topics`);
  // A concept of a topic finds it too.
  const concept = packOf('depreciation').concepts[0].title;
  await page.getByTestId('topics-search').fill(concept);
  await expect(page.getByTestId('topic-card-depreciation')).toBeVisible();
  await page.getByTestId('topics-search').fill('zzzz nothing');
  await expect(page.getByTestId('topics-none')).toBeVisible();
  await expect(showing).toHaveText(`Showing 0 of ${course.topics.length} topics`);
  // Escape clears it.
  await page.getByTestId('topics-search').press('Escape');
  await expect(showing).toHaveText(`Showing ${course.topics.length} of ${course.topics.length} topics`);
});

test('the filters show topics not started, in progress, weak and done', async ({ page }) => {
  await expect(page.getByTestId('topics-filter-all')).toHaveAttribute('aria-pressed', 'true');
  await page.getByTestId('topics-filter-in-progress').click();
  await expect(page.getByTestId('topics-filter-in-progress')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByTestId('topics-showing')).toHaveText(`Showing 0 of ${course.topics.length} topics`);
  await page.getByTestId('topics-filter-not-started').click();
  await expect(page.locator('[data-testid^="topic-card-"]')).toHaveCount(available.length);

  // Pass every level of Journal Entries: it is done, and no longer "not started".
  await seedPassedLevels(page, 'all', JE);
  await page.goto('/topics');
  await page.getByTestId('topics-filter-done').click();
  await expect(page.locator('[data-testid^="topic-card-"]')).toHaveCount(1);
  await expect(page.getByTestId(`topic-card-${JE}`)).toBeVisible();
  await expect(page.getByTestId(`topic-levels-${JE}`)).toHaveText(`${packOf(JE).levels.length} of ${packOf(JE).levels.length} levels passed`);
  await page.getByTestId('topics-filter-not-started').click();
  await expect(page.getByTestId(`topic-card-${JE}`)).toHaveCount(0);
});

test('each unit says the marks it carries in the board paper', async ({ page }) => {
  const marks = unitMarksOf(course.id);
  const units = [...new Set(course.topics.map((t) => t.unit))];
  for (const [i, unit] of units.entries()) {
    if (marks[unit]) await expect(page.getByTestId(`unit-marks-${i}`)).toHaveText(`${marks[unit]} marks in the board paper`);
  }
});

test('the topics fit a 360 px phone without sideways scrolling', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 740 });
  await page.goto('/topics');
  await expect(page.getByTestId(`topic-card-${JE}`)).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth)).toBe(false);
  await page.goto(`/topics/${JE}`);
  await expect(page.getByTestId('level-0')).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth)).toBe(false);
});
