import { expect, test, type Page } from '@playwright/test';
import { CATALOGUE_CASE_STAGES, CATALOGUE_TOPICS } from '../src/content/catalogue.generated';
import { findQuestion } from '../src/content/registry';
import { CLASS11_PACKS as PACKS } from './helpers';
import type { TopicPack } from '../src/content/types';
import { CONFIG } from '../src/learning/config';
import { contentChunks } from './contentChunks';
import { JE, SMART_COUNT, answerCurrentQuestion, createProfile, fillJournal, playSession, readStoredEvents, seedPassedLevels, showAnswer } from './helpers';

test('the manifest is served', async ({ request }) => {
  const res = await request.get('/manifest.webmanifest');
  expect(res.ok()).toBe(true);
  const manifest = await res.json();
  expect(manifest.short_name).toBe('Accountancy');
  expect(manifest.display).toBe('standalone');
  // An installed app opens on the first screen of the app, not on the landing page.
  expect(manifest.start_url).toBe('/start');
  expect(manifest.icons.length).toBeGreaterThanOrEqual(3);
  for (const icon of manifest.icons) expect((await request.get(icon.src)).ok()).toBe(true);
});

test('after one visit the app works with no network', async ({ page, context }) => {
  await createProfile(page, 'Varun');
  await seedPassedLevels(page, 3);
  await page.waitForFunction(() => (window as unknown as { __offlineReady?: boolean }).__offlineReady === true, null, {
    timeout: 60_000,
  });

  await context.setOffline(true);

  await page.reload();
  await expect(page.getByTestId('profile-name')).toHaveText('Varun');

  // The landing page and the first screen are stored too.
  await page.goto('/');
  await expect(page.getByTestId('landing-title')).toBeVisible();
  await expect(page.getByTestId('landing-continue-hero')).toContainText('Varun');
  await page.goto('/start');
  await expect(page.getByTestId('profile-pick-Varun')).toBeVisible();

  await page.goto('/topics');
  await page.getByTestId(`topic-card-${JE}`).click();
  await expect(page.getByTestId('level-4')).toHaveAttribute('data-state', 'unlocked');

  // Two entries right: one alone is too little to show in the mastery of a topic with many ideas.
  await page.getByTestId('level-start-4').click();
  for (let n = 0; n < 2; n++) {
    const raw = await page.getByTestId('question').getAttribute('data-expected');
    await fillJournal(page, JSON.parse(raw!).lines);
    await page.getByTestId('check').click();
    await expect(page.getByTestId('feedback')).toHaveAttribute('data-correct', 'true');
    await page.getByTestId('continue').click();
    await expect(page.getByTestId('feedback')).toHaveCount(0);
  }

  await page.goto(`/topics/${JE}`);
  await expect(page.getByTestId('topic-mastery')).not.toContainText(/^0%?$/);
});

type OfflineWindow = Window & { __offlineReady?: boolean };

async function waitUntilReady(page: Page) {
  await page.waitForFunction(() => (window as OfflineWindow).__offlineReady === true, null, { timeout: 60_000 });
}

/** Every cache name with the paths (plus query strings) of its entries. */
async function cacheContents(page: Page): Promise<Record<string, string[]>> {
  return page.evaluate(async () => {
    const out: Record<string, string[]> = {};
    for (const name of await caches.keys()) {
      const cache = await caches.open(name);
      out[name] = (await cache.keys()).map((r) => {
        const u = new URL(r.url);
        return u.pathname + u.search;
      });
    }
    return out;
  });
}

test('offline readiness is never claimed for a cache that was emptied', async ({ page }) => {
  await createProfile(page, 'Varun');
  await page.goto('/settings');
  await waitUntilReady(page);
  await expect(page.getByTestId('offline-ready')).toBeVisible();
  await expect(page.getByTestId('offline-ready')).toHaveAttribute('role', 'status');

  // Eviction: the browser (or the user) drops every cache while the session flag is still set.
  await page.evaluate(async () => {
    for (const name of await caches.keys()) await caches.delete(name);
  });
  await page.reload();

  // Ready may only come back after a fresh warm-up has refilled the cache with the whole app.
  await waitUntilReady(page);
  const contents = await cacheContents(page);
  const names = Object.keys(contents);
  expect(names).toHaveLength(1);
  const paths = contents[names[0]];
  expect(paths).toContain('/');
  expect(paths).toContain('/topics');
  expect(paths).toContain('/progress');
  expect(paths.some((p) => p.startsWith('/_next/static/'))).toBe(true);
  await expect(page.getByTestId('offline-ready')).toBeVisible();
});

test('the worker is versioned per build and owns exactly one current cache', async ({ page }) => {
  await createProfile(page, 'Varun');
  await waitUntilReady(page);
  const scriptUrl = await page.evaluate(async () => {
    const registration = await navigator.serviceWorker.getRegistration();
    return registration?.active?.scriptURL ?? '';
  });
  const version = new URL(scriptUrl).searchParams.get('v');
  expect(version).toBeTruthy();
  const names = Object.keys(await cacheContents(page));
  expect(names.filter((n) => n.endsWith(version!))).toHaveLength(1);
  expect(names).toHaveLength(1);
});

test('only allow-listed same-origin requests are stored', async ({ page }) => {
  await createProfile(page, 'Varun');
  await waitUntilReady(page);
  const statuses = await page.evaluate(async () => {
    const out: number[] = [];
    // A page fetched as data (not a navigation), a file that does not exist, and a made-up path.
    for (const path of ['/progress?probe=1', '/robots.txt?probe=1', '/no-such-path-xyz?probe=1']) {
      out.push((await fetch(path)).status);
    }
    return out;
  });
  expect(statuses[0]).toBe(200);
  expect(statuses[1]).toBe(404);
  const contents = await cacheContents(page);
  const all = Object.values(contents).flat();
  expect(all.filter((p) => p.includes('probe'))).toEqual([]);
  expect(all).toContain('/');
});

test('the daily-practice screens, their sheets and a smart-practice session work with no network', async ({ page, context }) => {
  await createProfile(page, 'Varun');
  await seedPassedLevels(page, 3);
  await waitUntilReady(page);
  await context.setOffline(true);

  await page.goto('/home');
  await expect(page.getByTestId('continue-card')).toBeVisible();

  await page.goto('/practice');
  await expect(page.getByTestId('hub-smart')).toBeVisible();

  await page.goto('/mistakes');
  await expect(page.getByTestId('mistakes-empty').or(page.getByTestId('mistakes-list'))).toBeVisible();

  await page.goto(`/sheet/${JE}`);
  await expect(page.getByTestId('sheet-card').first()).toBeVisible();

  await page.goto('/practice/smart');
  await expect(page.getByTestId('question')).toBeVisible();
  expect(await playSession(page)).toBe(SMART_COUNT);
  await expect(page.getByTestId('results-score')).toHaveText(`${SMART_COUNT} of ${SMART_COUNT} correct`);
});

test('a page that was never saved gets the offline page, not the home screen', async ({ page, context }) => {
  await createProfile(page, 'Varun');
  await waitUntilReady(page);
  await context.setOffline(true);

  const response = await page.goto('/no-such-page');
  expect(response?.status()).toBe(200);
  await expect(page).toHaveURL(/\/no-such-page$/);
  await expect(page.getByTestId('offline-page')).toBeVisible();
  await expect(page.getByTestId('offline-page')).toContainText("You're offline and this page hasn't been saved yet");
  await expect(page.getByTestId('profile-name')).toHaveCount(0);

  await page.getByTestId('offline-home').click();
  await expect(page).toHaveURL(/\/home$/);
  await expect(page.getByTestId('continue-card')).toBeVisible();
});

test('the offline page is stored during the warm-up', async ({ page }) => {
  await createProfile(page, 'Varun');
  await waitUntilReady(page);
  const all = Object.values(await cacheContents(page)).flat();
  expect(all).toContain('/offline.html');
  for (const path of ['/home', '/practice', '/mistakes', '/practice/smart', '/practice/mission', `/sheet/${JE}`]) {
    expect(all).toContain(path);
  }
});

const SLOW_MS = 7_000;

test('a slow network falls back to the saved page after about four seconds', async ({ page, context }) => {
  await createProfile(page, 'Varun');
  await waitUntilReady(page);

  let held = 0;
  let finished = 0;
  await context.route('**/topics', async (route) => {
    // In a static export the router first asks for the page with HEAD (to follow redirects) before it prefetches;
    // that is not a page load and the worker does not handle it.
    if (route.request().method() !== 'GET') return route.continue();
    // The worker's own fetch for the page is what gets held (Playwright reports it as a `fetch`).
    held++;
    await new Promise((resolve) => setTimeout(resolve, SLOW_MS));
    await route.continue().catch(() => {});
    finished++;
  });

  const started = Date.now();
  await page.goto('/topics', { waitUntil: 'commit' });
  await expect(page.getByTestId(`topic-card-${JE}`)).toBeVisible({ timeout: 10_000 });
  const elapsed = Date.now() - started;
  expect(held).toBe(1);
  expect(finished).toBe(0);
  expect(elapsed).toBeGreaterThan(3_500);
  expect(elapsed).toBeLessThan(5_500);

  // The held request is not abandoned: it completes in the background.
  await expect.poll(() => finished, { timeout: 10_000 }).toBe(1);
});

test('without a saved copy a slow network is still waited for', async ({ page, context }) => {
  await createProfile(page, 'Varun');
  await waitUntilReady(page);

  await context.route('**/no-such-page', async (route) => {
    await new Promise((resolve) => setTimeout(resolve, SLOW_MS));
    await route.continue();
  });

  const started = Date.now();
  const response = await page.goto('/no-such-page');
  expect(Date.now() - started).toBeGreaterThan(SLOW_MS - 500);
  expect(response?.status()).toBe(404);
  await expect(page.getByTestId('offline-page')).toHaveCount(0);
});

test('the warm-up stores every page of every topic, from the generated catalogue', async ({ page }) => {
  test.setTimeout(120_000);
  await createProfile(page, 'Varun');
  await waitUntilReady(page);
  const all = new Set(Object.values(await cacheContents(page)).flat());
  const expected = [
    '/',
    '/start',
    '/topics',
    '/practice',
    '/practice/topic',
    '/practice/marathon',
    '/practice/marathon/all',
    '/cases',
    '/cases/play/mixed',
    ...CATALOGUE_CASE_STAGES.map((id) => `/cases/play/${id}`),
    '/mock',
    '/mock/paper',
    ...CATALOGUE_TOPICS.flatMap((t) => [
      `/topics/${t.id}`,
      `/sheet/${t.id}`,
      `/practice/topic/${t.id}`,
      `/practice/marathon/${t.id}`,
      ...t.levelIds.map((id) => `/play/${id}`),
    ]),
  ];
  expect(expected.filter((path) => !all.has(path))).toEqual([]);
});

/** The questions marked for review in the mock papers the device holds, read straight from its storage. */
async function storedFlags(page: Page): Promise<string[]> {
  return page.evaluate(
    () =>
      new Promise<string[]>((resolve, reject) => {
        const open = indexedDB.open('accountancy-master');
        open.onerror = () => reject(open.error);
        open.onsuccess = () => {
          const db = open.result;
          const req = db.transaction('mockPapers', 'readonly').objectStore('mockPapers').getAll();
          req.onsuccess = () => {
            db.close();
            resolve(req.result.flatMap((paper: { flagged: string[] }) => paper.flagged));
          };
          req.onerror = () => reject(req.error);
        };
      }),
  );
}

test('the case studies, a mock paper and a marathon open with no network', async ({ page, context }) => {
  test.setTimeout(120_000);
  // Every level open on this device, so there is something to play everywhere.
  await createProfile(page, 'Varun', { unlockAll: true });
  await waitUntilReady(page);
  await context.setOffline(true);

  await page.goto('/cases');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Case studies');
  if (CATALOGUE_CASE_STAGES.length > 0) {
    await page.goto(`/cases/play/${CATALOGUE_CASE_STAGES[0]}`);
    await expect(page.getByTestId('question').getByTestId('case')).toBeVisible();
  }

  // One page serves every paper: the paper named in the query string is built on the device.
  await page.goto(`/mock/paper?paper=topic.${JE}.1`);
  await expect(page.getByTestId('mock-instructions')).toBeVisible();
  await page.getByTestId('mock-start').click();
  await expect(page.getByTestId('exam-clock')).toBeVisible();
  await page.getByTestId('exam-flag').click();
  // Every change to a paper is stored as it is made, which takes the device a moment, and a page that is reloaded
  // before its storage has answered loses that last write whatever the app does. So the reload waits for the mark to
  // be on the device (not for a length of time), and each step after it says what it found missing.
  await expect.poll(() => storedFlags(page), { message: 'the mark for review is on the device before the reload' }).toHaveLength(1);
  await page.reload();
  await expect(page.getByTestId('exam'), 'the paper in progress comes back after a reload with no network').toBeVisible();
  await expect(page.getByTestId('exam-flagged'), 'the mark made before the reload is shown again').toBeVisible();
  await page.getByTestId('exam-submit').click();
  await page.getByTestId('exam-confirm-yes').click();
  await expect(page.getByTestId('mock-result')).toBeVisible();

  await page.goto(`/practice/marathon/${JE}?level=easy`);
  await expect(page.getByTestId('question')).toBeVisible();
  await expect(page.getByTestId('marathon-stop')).toBeVisible();
});

// ---------------------------------------------------------------------------------------------------------------
// The content of a topic is fetched when something needs it, so no page names it: the warm-up takes it from the
// build's list of assets (scripts/list-assets.mjs). These tests open nothing of a topic while there is a network.
// ---------------------------------------------------------------------------------------------------------------

/** A topic late in the course, and one in the middle: neither is where a new learner starts. */
const LATE = PACKS[PACKS.length - 1];
const MIDDLE = PACKS[Math.floor(PACKS.length / 2)];
const generatedLevel = (pack: TopicPack) => pack.levels.find((l) => l.generate)!;

test('the warm-up stores the content of every topic, though the pages a learner has opened asked for none', async ({ page }) => {
  test.setTimeout(120_000);
  const chunks = await contentChunks(page.request);
  const asked = new Set<string>();
  page.on('request', (request) => {
    // What the worker fetches for its store is not something the page asked for.
    if (!request.serviceWorker()) asked.add(new URL(request.url()).pathname);
  });
  await createProfile(page, 'Varun');
  await waitUntilReady(page);

  expect(chunks.content.size).toBeGreaterThanOrEqual(2 * PACKS.length);
  expect([...chunks.content].filter((url) => asked.has(url))).toEqual([]);
  const stored = new Set(Object.values(await cacheContents(page)).flat());
  expect([...chunks.content].filter((url) => !stored.has(url))).toEqual([]);
  // And every other script of the build with them.
  expect(chunks.all.filter((url) => !stored.has(url))).toEqual([]);
});

test('topics that were never opened online are played with no network: a level, a Look back and a full mock paper', async ({ page, context }) => {
  test.setTimeout(180_000);
  // Every level open on this device, so any level can be played at once.
  await createProfile(page, 'Varun', { unlockAll: true });
  await waitUntilReady(page);
  await context.setOffline(true);

  // A level of the last topic of the course: its pack and its generators come from what the warm-up stored.
  await page.goto(`/play/${generatedLevel(LATE).id}`);
  await expect(page.getByTestId('question')).toBeVisible();
  await answerCurrentQuestion(page);
  await expect(page.getByTestId('feedback')).toHaveAttribute('data-correct', 'true');

  // A Look back level asks about its own topic and four earlier ones, none of them opened before.
  const lookBack = MIDDLE.levels.find((l) => l.type === 'look_back')!;
  const served: string[] = [];
  await page.goto(`/play/${lookBack.id}`);
  expect(await playSession(page, { onQuestion: (id) => served.push(id) })).toBe(CONFIG.lookBack.own + CONFIG.lookBack.earlier);
  const topics = new Set(served.map((id) => findQuestion(id)!.topicId));
  expect(topics.has(MIDDLE.topicId)).toBe(true);
  expect(topics.size).toBe(1 + CONFIG.lookBack.earlier);

  // A full paper draws on every topic of the course.
  await page.goto('/mock/paper?paper=full.1');
  await expect(page.getByTestId('mock-instructions')).toBeVisible();
  await expect(page.getByTestId('mock-instructions-summary')).toContainText('80 marks');
  await page.getByTestId('mock-start').click();
  await expect(page.getByTestId('exam-clock')).toBeVisible();
  await expect(page.getByTestId('question')).toBeVisible();
});

test('the Mistakes screen shows a mistake of a topic that was not opened in this visit, with no network', async ({ page, context }) => {
  test.setTimeout(120_000);
  await createProfile(page, 'Varun', { unlockAll: true });
  await waitUntilReady(page);
  await context.setOffline(true);

  // One question of a topic in the middle of the course is given up on, and the level is left.
  await page.goto(`/play/${generatedLevel(MIDDLE).id}`);
  const question = page.getByTestId('question');
  await expect(question).toBeVisible();
  const missed = (await question.getAttribute('data-question-id'))!;
  await showAnswer(page);
  await expect(page.getByTestId('feedback')).toBeVisible();
  await expect.poll(async () => (await readStoredEvents(page)).attempts.map((a) => a.questionId)).toEqual([missed]);

  // Every page load starts with no topic in memory. Home counts the mistake from the outline alone ...
  await page.goto('/home');
  await expect(page.getByTestId('quick-mistakes')).toContainText('1 waiting');

  // ... and the Mistakes screen loads the topic of the mistake to show its question, from what is stored.
  await page.goto('/mistakes');
  await expect(page.getByTestId('mistake-item')).toHaveCount(1);
  await expect(page.getByTestId('mistake-item')).toHaveAttribute('data-question-id', missed);
  expect(findQuestion(missed)!.topicId).toBe(MIDDLE.topicId);

  // The review serves that exact question again.
  await page.getByTestId('mistakes-review').click();
  await expect(page.getByTestId('question')).toHaveAttribute('data-question-id', missed);
});

// GitHub Pages lets a browser keep any file ten minutes (scripts/serve-export.mjs sends the same headers). The worker
// asks the server whether a page changed before it answers, so a page changed by a deploy shows on the next load,
// not ten minutes later. The page here is made for this test alone and removed after it.
test('a page changed on the server shows on the next load, though the browser may keep it ten minutes', async ({ page }, info) => {
  test.skip(process.env.PW_EXPORT !== '1', 'the static export is what GitHub Pages serves');
  const fs = await import('node:fs');
  const path = await import('node:path');
  const name = `fresh-${info.project.name}-${Date.now()}.html`;
  const file = path.join('out-e2e', name);
  const version = (n: number) => `<!doctype html><html><head><title>v${n}</title></head><body><p id="v">version ${n}</p></body></html>`;
  try {
    await createProfile(page, 'Varun');
    await waitUntilReady(page);
    fs.writeFileSync(file, version(1));
    await page.goto(`/${name}`);
    await expect(page.locator('#v')).toHaveText('version 1');
    // A deploy: the same address, new content (a new size and time, so a new ETag).
    fs.writeFileSync(file, version(22));
    await page.goto(`/${name}`);
    await expect(page.locator('#v')).toHaveText('version 22');
  } finally {
    fs.rmSync(file, { force: true });
  }
});
