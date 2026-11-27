import { readFileSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';
import { COURSES } from '../src/content/registry';
import { TEMPLATES } from '../src/generators';
import { CLASS11, CLASS11_PACKS, createProfile, packOf } from './helpers';

// The mind maps: the course map (every unit and topic, the links between topics), a topic's map (folding, opening a
// card and a pattern from it), the outline, the keyboard, saving an image, and the page at a phone's and a laptop's
// width. Nothing here assumes how many topics, concepts or cards there are: they are read from the packs.

const TOPIC = 'ledger';
const LEDGER = packOf(TOPIC);
const TOPIC_TITLE = COURSES.flatMap((c) => c.topics).find((t) => t.id === TOPIC)!.title;
// A concept of the topic with rule cards and with patterns.
const CONCEPT = LEDGER.concepts.find((c) => LEDGER.cards.some((k) => k.conceptId === c.id) && TEMPLATES.some((t) => t.conceptId === c.id && (t.kind === 'mcq' || t.kind === 'numeric')))!;
const CARD = LEDGER.cards.find((c) => c.conceptId === CONCEPT.id)!;
const PATTERN = TEMPLATES.find((t) => t.conceptId === CONCEPT.id && (t.kind === 'mcq' || t.kind === 'numeric'))!;
const node = (page: Page, id: string) => page.getByTestId(`map-node-${id}`);
/** Focusing a node brings it into view on the map (as Tab does); then it is pressed like a finger would. */
async function tap(page: Page, id: string) {
  await node(page, id).focus();
  await node(page, id).click();
}
/** The same for a node's fold button. */
async function fold(page: Page, id: string) {
  await node(page, id).focus();
  await page.getByTestId(`map-toggle-${id}`).click();
}

test('the course map shows every unit and every topic, and a topic opens its own map', async ({ page }) => {
  await createProfile(page, 'Varun');
  await page.goto('/maps');
  await expect(page.getByTestId('mind-map')).toBeVisible();
  const course = COURSES.find((c) => c.id === CLASS11)!;
  const topics = course.topics.filter((t) => CLASS11_PACKS.some((p) => p.topicId === t.id));
  const units = [...new Set(topics.map((t) => t.unit))];
  await expect(page.locator('[data-kind="unit"]')).toHaveCount(units.length);
  for (const unit of units) await expect(page.locator(`[data-kind="unit"][aria-label="Unit: ${unit}, ${topics.filter((t) => t.unit === unit).length === 1 ? '1 topic' : `${topics.filter((t) => t.unit === unit).length} topics`}"]`)).toHaveCount(1);
  await expect(page.locator('[data-kind="topic"]')).toHaveCount(topics.length);
  for (const t of topics) await expect(node(page, `topic:${t.id}`)).toHaveAttribute('aria-label', new RegExp(`^Topic: ${t.title.replace(/[()]/g, '.')}, mastery 0%`));

  // The links between topics: listed in words, and drawn (on a phone once asked for).
  const listed = await page.getByTestId('map-links-list').locator('li').count();
  expect(listed).toBeGreaterThan(5);
  await expect(page.getByTestId('map-links-list')).toContainText('Ledger Posting and Balancing');
  if ((await page.getByTestId('map-show-links').getAttribute('aria-pressed')) !== 'true') await page.getByTestId('map-show-links').click();
  await expect(page.getByTestId('map-links').locator('[data-testid^="map-link-"]')).toHaveCount(listed);
  await page.getByTestId('map-show-links').click();
  await expect(page.getByTestId('map-links')).toHaveCount(0);

  await tap(page, `topic:${TOPIC}`);
  await expect(page).toHaveURL(new RegExp(`/maps/${TOPIC}$`));
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(`Mind map: ${TOPIC_TITLE}`);
});

test('a topic map folds and unfolds a concept, and opens a rule card on the topic page', async ({ page }) => {
  await createProfile(page, 'Varun');
  await page.goto(`/maps/${TOPIC}`);
  const concept = node(page, `concept:${CONCEPT.id}`);
  // Every concept is there, folded, with its mastery in its name.
  await expect(page.locator('[data-kind="concept"]')).toHaveCount(LEDGER.concepts.length);
  await expect(concept).toHaveAttribute('aria-expanded', 'false');
  await expect(concept).toHaveAttribute('aria-label', `Concept: ${CONCEPT.title}, mastery 0%, not started`);
  await expect(node(page, `group:${CONCEPT.id}:cards`)).toHaveCount(0);

  await fold(page, `concept:${CONCEPT.id}`);
  await expect(concept).toHaveAttribute('aria-expanded', 'true');
  await expect(node(page, `group:${CONCEPT.id}:cards`)).toHaveCount(1);
  await expect(node(page, `group:${CONCEPT.id}:quick`)).toHaveCount(1);
  // Folded again, what was under it goes.
  await fold(page, `concept:${CONCEPT.id}`);
  await expect(concept).toHaveAttribute('aria-expanded', 'false');
  await expect(node(page, `group:${CONCEPT.id}:cards`)).toHaveCount(0);

  // A group has nowhere to go: tapping it unfolds it. A card opens on the topic page, shown and marked.
  await fold(page, `concept:${CONCEPT.id}`);
  await tap(page, `group:${CONCEPT.id}:cards`);
  await tap(page, `card:${CARD.id}`);
  await expect(page).toHaveURL(new RegExp(`/topics/${TOPIC}#card-${CARD.id}$`));
  await expect(page.getByTestId(`rule-card-${CARD.id}`)).toHaveAttribute('data-target', 'true');
});

test('a pattern on a topic map opens in the Playground', async ({ page }) => {
  await createProfile(page, 'Varun');
  await page.goto(`/maps/${TOPIC}`);
  await fold(page, `concept:${CONCEPT.id}`);
  await fold(page, `group:${CONCEPT.id}:quick`);
  await tap(page, `pattern:${PATTERN.id}`);
  await expect(page).toHaveURL(new RegExp(`/playground\\?topic=${TOPIC}&pattern=${PATTERN.id}$`));
  await expect(page.getByTestId('question')).toBeVisible();
});

test('the outline view is the same map as lists, with the same folding', async ({ page }) => {
  await createProfile(page, 'Varun');
  await page.goto(`/maps/${TOPIC}`);
  await page.getByTestId('map-show-outline').click();
  await expect(page.getByTestId('map-viewport')).toHaveCount(0);
  const outline = page.getByTestId('map-outline');
  await expect(outline).toBeVisible();
  await expect(outline.getByRole('link', { name: `Concept: ${CONCEPT.title}, mastery 0%, not started` })).toBeVisible();
  await expect(page.getByTestId(`outline-node-group:${CONCEPT.id}:cards`)).toHaveCount(0);
  await outline.getByRole('button', { name: `Unfold ${CONCEPT.title}` }).click();
  await expect(page.getByTestId(`outline-node-group:${CONCEPT.id}:cards`)).toBeVisible();
  // Back to the map: the concept is unfolded there too.
  await page.getByTestId('map-show-map').click();
  await expect(node(page, `concept:${CONCEPT.id}`)).toHaveAttribute('aria-expanded', 'true');
  // The outline's links go where the map's nodes go.
  await page.getByTestId('map-show-outline').click();
  await page.getByTestId(`outline-toggle-group:${CONCEPT.id}:cards`).click();
  await page.getByTestId(`outline-node-card:${CARD.id}`).getByRole('link').click();
  await expect(page).toHaveURL(new RegExp(`/topics/${TOPIC}#card-${CARD.id}$`));
});

test('the keyboard moves between nodes with the arrows, Space folds and Enter opens', async ({ page }) => {
  await createProfile(page, 'Varun');
  await page.goto(`/maps/${TOPIC}`);
  const root = node(page, `topic:${TOPIC}`);
  await expect(root).toHaveAttribute('tabindex', '0');
  await root.focus();
  const focused = () => page.evaluate(() => document.activeElement?.getAttribute('data-node-id') ?? null);
  await page.keyboard.press('ArrowRight');
  await expect.poll(focused).toMatch(/^concept:/);
  const first = (await focused())!;
  // Only one node is reached by Tab: the one the arrows moved to.
  await expect(page.locator('[role="treeitem"][tabindex="0"]')).toHaveCount(1);
  await expect(node(page, first)).toHaveAttribute('tabindex', '0');
  await page.keyboard.press(' ');
  await expect(node(page, first)).toHaveAttribute('aria-expanded', 'true');
  await page.keyboard.press(' ');
  await expect(node(page, first)).toHaveAttribute('aria-expanded', 'false');
  // Towards a folded node's children unfolds it; again goes into them; back goes to the parent.
  await page.keyboard.press('ArrowRight');
  await expect(node(page, first)).toHaveAttribute('aria-expanded', 'true');
  await page.keyboard.press('ArrowRight');
  await expect.poll(focused).toMatch(/^group:/);
  await page.keyboard.press('ArrowLeft');
  await expect.poll(focused).toBe(first);
  await page.keyboard.press('ArrowDown');
  await expect.poll(focused).not.toBe(first);
  await page.keyboard.press('Home');
  await expect.poll(focused).toBe(`topic:${TOPIC}`);
  // Enter opens: the topic opens its page.
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(new RegExp(`/topics/${TOPIC}$`));
});

test('the map is saved as an SVG image made in the browser, with the theme’s colours written in', async ({ page }, info) => {
  test.skip(info.project.name !== 'laptop', 'once is enough');
  await createProfile(page, 'Varun');
  await page.goto(`/maps/${TOPIC}`);
  await expect(node(page, `topic:${TOPIC}`)).toBeVisible();
  const [svg] = await Promise.all([page.waitForEvent('download'), page.getByTestId('map-save-svg').click()]);
  expect(svg.suggestedFilename()).toBe('mind-map-ledger-posting-and-balancing.svg');
  const text = readFileSync((await svg.path())!, 'utf8');
  expect(text).toContain('<svg');
  // Labels are wrapped into lines: the first word of the concept is there.
  expect(text).toContain(CONCEPT.title.split(' ')[0]);
  expect(text).toContain('<tspan');
  expect(text).not.toContain('var(--');
  const [png] = await Promise.all([page.waitForEvent('download'), page.getByTestId('map-save-png').click()]);
  expect(png.suggestedFilename()).toBe('mind-map-ledger-posting-and-balancing.png');
  expect(readFileSync((await png.path())!).subarray(1, 4).toString()).toBe('PNG');
});

test('a topic page has a preview of its map, and Go to finds a topic’s map', async ({ page }) => {
  await createProfile(page, 'Varun');
  await page.goto(`/topics/${TOPIC}`);
  await expect(page.getByTestId('topic-map-preview')).toBeVisible();
  await page.getByTestId('topic-map-link').click();
  await expect(page).toHaveURL(new RegExp(`/maps/${TOPIC}$`));
  await page.goto('/home');
  await expect(page.getByTestId('quick-maps')).toBeVisible();
  await page.getByTestId('goto-open').click();
  await page.getByTestId('goto-input').fill('mind map ledger');
  await expect(page.getByTestId('goto-dialog')).toContainText(`Mind map: ${TOPIC_TITLE}`);
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(new RegExp(`/maps/${TOPIC}$`));
});

test('at 360 px the maps keep to the screen: no sideways scroll, and labels at full size', async ({ page }, info) => {
  test.skip(info.project.name !== 'phone', 'the phone layout');
  await page.setViewportSize({ width: 360, height: 740 });
  await createProfile(page, 'Varun');
  for (const path of ['/maps', `/maps/${TOPIC}`]) {
    await page.goto(path);
    await expect(page.getByTestId('mind-map')).toHaveAttribute('data-mode', 'indented');
    if (path !== '/maps') await page.getByTestId('map-unfold-all').click();
    const width = await page.evaluate(() => document.documentElement.scrollWidth);
    expect(width, path).toBeLessThanOrEqual(360);
    const box = await page.getByTestId('map-viewport').boundingBox();
    expect(box!.x).toBeGreaterThanOrEqual(0);
    expect(box!.x + box!.width).toBeLessThanOrEqual(360);
  }
  // Unfolded, the topic map is read at full size, from its top.
  await expect(page.getByTestId('map-pan')).toHaveAttribute('style', /scale\(1\)/);
});

test('at 1280 px the sidebar is there with Mind maps marked, on the course map and on a topic map', async ({ page }, info) => {
  test.skip(info.project.name !== 'laptop', 'the laptop layout');
  await createProfile(page, 'Varun');
  for (const [path, title] of [
    ['/maps', 'Mind maps'],
    [`/maps/${TOPIC}`, TOPIC_TITLE],
  ]) {
    await page.goto(path);
    const sidebar = page.getByRole('complementary', { name: 'Sidebar' });
    await expect(sidebar).toBeVisible();
    await expect(sidebar.getByTestId('nav-maps')).toHaveAttribute('aria-current', 'page');
    await expect(sidebar.locator('[aria-current="page"]')).toHaveCount(1);
    await expect(page.getByTestId('topbar-title')).toHaveText(title);
  }
  // A topic's map has the topic in the middle, its concepts on both sides.
  await expect(page.getByTestId('mind-map')).toHaveAttribute('data-mode', 'mindmap');
});
