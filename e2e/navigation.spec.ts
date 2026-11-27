import { expect, test, type Page } from '@playwright/test';
import { TEMPLATES } from '../src/generators';
import { CLASS11_STAGES, JE, answerCurrentQuestion, createProfile, levelOf, packOf, readLesson, seedPassedLevels } from './helpers';

// Every route of the app, with the item of the sidebar it comes under and the title of its top bar. A title of
// null is not checked (it is the name of something chosen as the page opens, a case for instance).
const PATTERN = TEMPLATES.find((t) => t.topicId === JE)!;
const STAGE = CLASS11_STAGES[0];
const JE_TITLE = 'Journal Entries';
const LEVEL = packOf(JE).levels.find((l) => l.order === 2)!;

const ROUTES: { path: string; nav: string; title: string | null; play?: true }[] = [
  { path: '/home', nav: 'nav-home', title: 'Home' },
  { path: '/topics', nav: 'nav-topics', title: 'Topics' },
  { path: `/topics/${JE}`, nav: 'nav-topics', title: JE_TITLE },
  { path: `/play/${LEVEL.id}`, nav: 'nav-topics', title: LEVEL.title, play: true },
  { path: '/practice/cards', nav: 'nav-cards', title: 'Revise rule cards', play: true },
  { path: '/sheets', nav: 'nav-sheets', title: 'Quick sheets' },
  { path: `/sheet/${JE}`, nav: 'nav-sheets', title: JE_TITLE },
  { path: '/glossary', nav: 'nav-glossary', title: 'Glossary' },
  { path: '/inside', nav: 'nav-inside', title: "What's inside" },
  { path: '/practice', nav: 'nav-practice', title: 'Practice' },
  { path: '/practice/smart', nav: 'nav-practice', title: 'Smart practice', play: true },
  { path: '/practice/topic', nav: 'nav-practice', title: 'Practice' },
  { path: `/practice/topic/${JE}`, nav: 'nav-practice', title: `Practise ${JE_TITLE}`, play: true },
  { path: '/playground', nav: 'nav-playground', title: 'Playground' },
  { path: `/playground?topic=${JE}&pattern=${PATTERN.id}`, nav: 'nav-playground', title: null, play: true },
  { path: '/practice/marathon', nav: 'nav-marathon', title: 'Marathon' },
  { path: `/practice/marathon/${JE}`, nav: 'nav-marathon', title: JE_TITLE, play: true },
  { path: '/cases', nav: 'nav-cases', title: 'Case studies' },
  { path: `/cases/play/${STAGE.id}`, nav: 'nav-cases', title: null, play: true },
  { path: '/exam', nav: 'nav-exam', title: 'Before the exam' },
  { path: '/mock', nav: 'nav-mock', title: 'Mock papers' },
  { path: '/mock/paper?paper=full.1', nav: 'nav-mock', title: 'Full paper 1', play: true },
  { path: '/mistakes', nav: 'nav-mistakes', title: 'Mistakes' },
  { path: '/practice/mistakes', nav: 'nav-mistakes', title: 'Fix your mistakes', play: true },
  { path: '/progress', nav: 'nav-progress', title: 'Progress' },
  { path: '/settings', nav: 'nav-settings', title: 'Settings' },
];

/** A learner who has played a little: a few levels passed, so practice, cards and mistakes have something to offer. */
async function learner(page: Page) {
  await createProfile(page, 'Varun', { unlockAll: true });
  await seedPassedLevels(page, 4, JE);
}

test('at 1280 px every route has the sidebar with its own item marked, and the top bar names where the learner is', async ({ page }, info) => {
  test.skip(info.project.name !== 'laptop', 'the laptop layout');
  test.setTimeout(180_000);
  await learner(page);
  for (const route of ROUTES) {
    await page.goto(route.path);
    const sidebar = page.getByRole('complementary', { name: 'Sidebar' });
    await expect(sidebar, route.path).toBeVisible();
    await expect(sidebar.locator('[aria-current="page"]'), route.path).toHaveCount(1);
    await expect(sidebar.getByTestId(route.nav), route.path).toHaveAttribute('aria-current', 'page');
    const title = page.getByTestId('topbar-title');
    if (route.title !== null) await expect(title, route.path).toHaveText(route.title);
    else await expect(title, route.path).not.toHaveText('');
    await expect(page.getByTestId('topbar-crumbs'), route.path).toContainText('Class 11 Accountancy');
    // The learner menu and the course switch are on every page.
    await expect(page.getByTestId('learner-menu'), route.path).toBeVisible();
    await expect(page.getByTestId('sidebar-course-cbse-11-accountancy'), route.path).toBeVisible();
  }
});

test('the breadcrumb of a level names its topic, and leads back to it', async ({ page }, info) => {
  test.skip(info.project.name !== 'laptop', 'the laptop layout');
  await learner(page);
  await page.goto(`/play/${LEVEL.id}`);
  await expect(page.getByTestId('topbar-crumbs')).toHaveText(/Class 11 Accountancy\s*·\s*Topics\s*·\s*Journal Entries/);
  await page.getByTestId('topbar-crumbs').getByRole('link', { name: JE_TITLE }).click();
  await expect(page).toHaveURL(new RegExp(`/topics/${JE}$`));
});

test('leaving a level part-way by the sidebar asks once; staying keeps the level, leaving keeps the answers', async ({ page }, info) => {
  test.skip(info.project.name !== 'laptop', 'the sidebar is on the laptop');
  await createProfile(page, 'Varun', { unlockAll: true });
  // A level of questions from its first step.
  const level = LEVEL;
  await page.goto(`/play/${level.id}`);
  await expect(page.getByTestId('question')).toBeVisible();
  // Before anything is answered, nothing is asked.
  await page.getByTestId('nav-progress').click();
  await expect(page).toHaveURL(/\/progress$/);
  await page.goBack();
  await expect(page.getByTestId('question')).toBeVisible();

  await answerOne(page);
  await page.getByTestId('nav-progress').click();
  await expect(page.getByTestId('player-leave-confirm')).toContainText('The answers you gave are saved');
  await expect(page).toHaveURL(new RegExp(`/play/${level.id}$`));
  await page.getByTestId('player-stay').click();
  await expect(page.getByTestId('player-leave-confirm')).toHaveCount(0);
  await expect(page.getByTestId('question')).toBeVisible();

  // "Go to" asks too, and leaving goes where it was asked to.
  await page.keyboard.press('Control+k');
  await page.getByTestId('goto-input').fill('settings');
  await page.keyboard.press('Enter');
  await expect(page.getByTestId('player-leave-confirm')).toBeVisible();
  await page.getByTestId('player-leave').click();
  await expect(page).toHaveURL(/\/settings$/);
  await page.getByTestId('nav-progress').click();
  await expect(page.getByTestId('progress-answered')).toHaveText('1');
});

/** Answers the question on screen (rightly or not) and moves on. */
async function answerOne(page: Page) {
  const q = page.getByTestId('question');
  const choice = q.locator('[data-testid^="mcq-option-"]').first();
  if (await choice.count()) await choice.click();
  else await q.getByTestId('tf-true').click();
  await page.getByTestId('check').click();
  await expect(page.getByTestId('feedback')).toBeVisible();
}

test('leaving a mock paper says the clock runs on, keeps the answers, and the paper can be carried on', async ({ page }, info) => {
  test.skip(info.project.name !== 'laptop', 'once is enough');
  await createProfile(page, 'Varun', { unlockAll: true });
  await page.goto('/mock/paper?paper=topic.journal-entries.1');
  await page.getByTestId('mock-start').click();
  await expect(page.getByTestId('exam')).toBeVisible();
  await page.getByTestId('nav-home').click();
  await expect(page.getByTestId('exam-leave-confirm')).toContainText('the clock keeps running');
  await page.getByTestId('exam-leave-yes').click();
  await expect(page).toHaveURL(/\/home$/);
  await page.goto('/mock/paper?paper=topic.journal-entries.1');
  await expect(page.getByTestId('exam')).toBeVisible();
  // The leave button of the paper itself, as on a phone.
  await page.getByTestId('exam-leave').click();
  await page.getByTestId('exam-leave-yes').click();
  await expect(page).toHaveURL(/\/mock$/);
});

test('at 360 px a play screen has the whole screen, with no bottom bar and a way out', async ({ page }, info) => {
  test.skip(info.project.name !== 'phone', 'the phone layout');
  test.setTimeout(120_000);
  await page.setViewportSize({ width: 360, height: 740 });
  await learner(page);
  const wayOut = page.locator(
    '[data-testid="player-close"], [data-testid="marathon-stop"], [data-testid="playground-back"], [data-testid="exam-leave"], [data-testid="mock-not-now"], [data-testid="practice-empty"] a',
  );
  for (const route of ROUTES) {
    await page.goto(route.path);
    if (route.play) {
      await expect(wayOut.first(), route.path).toBeVisible();
      await expect(page.getByRole('navigation', { name: 'Main' }), route.path).toHaveCount(0);
    } else {
      await expect(page.getByRole('navigation', { name: 'Main' }), route.path).toBeVisible();
      await expect(page.getByTestId('goto-open'), route.path).toBeVisible();
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth), route.path).toBe(false);
  }
});

test('the bottom bar marks the item a page comes under', async ({ page }, info) => {
  test.skip(info.project.name !== 'phone', 'the phone layout');
  await learner(page);
  for (const [path, nav] of [
    [`/sheet/${JE}`, 'nav-topics'],
    ['/inside', 'nav-topics'],
    ['/cases', 'nav-practice'],
    ['/mistakes', 'nav-practice'],
    ['/mock', 'nav-practice'],
  ] as const) {
    await page.goto(path);
    await expect(page.getByTestId(nav), path).toHaveAttribute('aria-current', 'page');
  }
});

test('after a level, Next level replaces it: Back goes to the topic, not into the finished level', async ({ page }) => {
  await createProfile(page, 'Varun');
  await page.goto(`/topics/${JE}`);
  await page.getByTestId('level-start-0').click();
  await expect(page).toHaveURL(new RegExp(`/play/${levelOf(JE, 0)}$`));
  await readLesson(page);
  await answerCurrentQuestion(page);
  await page.getByTestId('continue').click();
  await expect(page.getByTestId('results-passed')).toHaveText('Passed');
  await page.getByTestId('results-next').click();
  await expect(page).toHaveURL(new RegExp(`/play/${levelOf(JE, 1)}$`));
  await page.goBack();
  await expect(page).toHaveURL(new RegExp(`/topics/${JE}$`));
});

test('deep links open from a cold start: a card, a pattern, a case and a mock paper', async ({ page, context }) => {
  await createProfile(page, 'Varun', { unlockAll: true });
  const card = packOf(JE).cards[0];
  const fresh = await context.newPage();
  await fresh.goto(`/topics/${JE}#card-${card.id}`);
  await expect(fresh.getByTestId(`rule-card-${card.id}`)).toHaveAttribute('data-target', 'true');
  await fresh.goto(`/playground?topic=${JE}&pattern=${PATTERN.id}`);
  await expect(fresh.getByTestId('playground-back')).toBeVisible();
  await expect(fresh.getByTestId('question')).toBeVisible();
  const caseId = STAGE.cases[0].id;
  await fresh.goto(`/cases/play/${STAGE.id}?case=${caseId}`);
  await expect(fresh.getByTestId('question')).toBeVisible();
  await fresh.goto('/mock/paper?paper=full.1');
  await expect(fresh.getByTestId('mock-start')).toBeVisible();
});
