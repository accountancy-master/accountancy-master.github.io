import { expect, test, type Page } from '@playwright/test';
import { CASE_STAGES } from '../src/generators';
import { contentChunks } from './contentChunks';
import { FIRST_TOPIC, JE, createProfile, packOf } from './helpers';

// The content of a topic (its templates, its pack, the cases of its stage) is fetched when something needs it, and
// only then. Which scripts hold which topic's content is read off the build itself (see contentChunks.ts).

/** Records the scripts the page asks for, by address, with how often each was asked for. */
function watchScripts(page: Page): Map<string, number> {
  const asked = new Map<string, number>();
  page.on('request', (request) => {
    const { pathname } = new URL(request.url());
    if (pathname.startsWith('/_next/static/') && pathname.endsWith('.js')) asked.set(pathname, (asked.get(pathname) ?? 0) + 1);
  });
  return asked;
}

/** A topic whose stage of case studies is made from its own templates alone, so opening it needs no other topic's. */
const STAGE_TOPIC = 'depreciation';

test('the build keeps the content of every topic in scripts of its own', async ({ request }) => {
  const chunks = await contentChunks(request);
  for (const [topicId, scripts] of chunks.byTopic) {
    // Its templates and its pack, and the cases of each stage it closes.
    const stages = CASE_STAGES.filter((s) => s.topicId === topicId && s.cases.length > 0).length;
    expect(scripts.length, topicId).toBe(2 + stages);
  }
  // Together they are most of the build: what every page loads is small beside them.
  expect(chunks.content.size).toBe([...chunks.byTopic.values()].flat().length);
});

test('the screens that list things ask for no topic content', async ({ page, request }) => {
  const chunks = await contentChunks(request);
  const asked = watchScripts(page);
  await createProfile(page, 'Varun');
  await expect(page.getByTestId('continue-card')).toBeVisible();

  for (const [path, testId] of [
    ['/topics', `topic-card-${JE}`],
    ['/practice', 'hub-smart'],
    ['/practice/topic', `pick-topic-${JE}`],
    ['/practice/marathon', `marathon-${JE}`],
    ['/progress', `progress-topic-${JE}`],
    ['/cases', 'cases-mixed-card'],
    ['/mock', 'mock-kind-full'],
    ['/mistakes', 'mistakes-empty'],
    ['/home', 'mission-card'],
  ]) {
    await page.goto(path);
    await expect(page.getByTestId(testId), path).toBeVisible();
  }
  // What Home says about today comes from the outline: the first level to continue with, and what the mission holds.
  await expect(page.getByTestId('continue-card')).toContainText(FIRST_TOPIC.levels[0].title);

  expect(asked.size).toBeGreaterThan(5);
  expect([...asked.keys()].filter((url) => chunks.content.has(url))).toEqual([]);
});

for (const topicId of [FIRST_TOPIC.topicId, STAGE_TOPIC]) {
  test(`opening ${topicId} asks for that topic's content and no other's, once`, async ({ page, request }) => {
    const chunks = await contentChunks(request);
    const own = chunks.byTopic.get(topicId)!;
    const asked = watchScripts(page);
    const contentAsked = () => [...asked.keys()].filter((url) => chunks.content.has(url));
    await createProfile(page, 'Varun', { unlockAll: true });
    expect(contentAsked()).toEqual([]);

    // The topic page: its levels are listed from its pack.
    await page.getByTestId('nav-topics').click();
    await page.getByTestId(`topic-card-${topicId}`).click();
    await expect(page.getByTestId('level-0')).toBeVisible();
    const afterTopic = contentAsked();
    expect(afterTopic.map((url) => chunks.topicOf(url))).toEqual(afterTopic.map(() => topicId));
    expect([...afterTopic].sort()).toEqual([...own].sort());

    // A level of it, its quick sheet and practice of it need nothing more: the topic is there while the app stays open.
    const level = packOf(topicId).levels.find((l) => l.generate)!;
    await page.getByTestId(`level-start-${level.order}`).click();
    await expect(page.getByTestId('question')).toBeVisible();
    await page.goBack();
    await expect(page.getByTestId('level-0')).toBeVisible();
    await page.getByTestId('topic-sheet').click();
    await expect(page.getByTestId('sheet-card').first()).toBeVisible();
    await page.goBack();
    await page.getByTestId('topic-practise').click();
    await expect(page.getByTestId('question')).toBeVisible();
    expect(contentAsked().sort()).toEqual([...afterTopic].sort());
    // Nothing was fetched twice: neither the content nor any other script.
    expect([...asked].filter(([, times]) => times > 1)).toEqual([]);
  });
}

test('a level opened by its address asks for the content of its topic alone', async ({ page, request }) => {
  const chunks = await contentChunks(request);
  await createProfile(page, 'Varun', { unlockAll: true });
  const asked = watchScripts(page);
  const level = packOf(JE).levels.find((l) => l.generate)!;
  await page.goto(`/play/${level.id}`);
  await expect(page.getByTestId('question')).toBeVisible();
  const content = [...asked.keys()].filter((url) => chunks.content.has(url));
  expect(content.length).toBeGreaterThan(0);
  expect(content.map((url) => chunks.topicOf(url))).toEqual(content.map(() => JE));
});

test('a topic that cannot be fetched says so, and is loaded when it is tried again', async ({ page, request }) => {
  const chunks = await contentChunks(request);
  await createProfile(page, 'Varun');
  // No network for the content of topics (and it is not stored: these tests run without the service worker).
  let cut = true;
  await page.route('**/_next/static/chunks/*.js', (route) => (cut && chunks.content.has(new URL(route.request().url()).pathname) ? route.abort() : route.continue()));

  await page.getByTestId('nav-topics').click();
  await page.getByTestId(`topic-card-${JE}`).click();
  await expect(page.getByTestId('topics-loading').or(page.getByTestId('topics-error'))).toBeVisible();
  await expect(page.getByTestId('topics-error')).toBeVisible({ timeout: 15_000 });
  await expect(page.getByTestId('level-0')).toHaveCount(0);
  // Trying again while it still cannot be fetched says so again.
  await page.getByTestId('topics-retry').click();
  await expect(page.getByTestId('topics-error')).toBeVisible({ timeout: 15_000 });
  // The screens that list things are not touched by it.
  await page.getByTestId('nav-home').click();
  await expect(page.getByTestId('continue-card')).toBeVisible();
  await page.goBack();
  await expect(page.getByTestId('topics-error')).toBeVisible({ timeout: 15_000 });

  cut = false;
  await page.getByTestId('topics-retry').click();
  await expect(page.getByTestId('level-0')).toBeVisible();
});
