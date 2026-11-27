import { expect, test, type Page } from '@playwright/test';
import { LANDING_COURSES, LANDING_TOTALS } from '../src/content/landing.generated';
import { LABS, labHref } from '../src/simulator/labs';
import { createProfile } from './helpers';

// The landing page (/): what it says there is, the ways in from it, that it fits every screen, and that it keeps still
// for a visitor who asked for reduced motion.

const REPO = 'https://github.com/accountancy-master/accountancy-master.github.io';
const grouped = (n: number) => new Intl.NumberFormat('en-IN').format(n);
const READY_LABS = LABS.filter((l) => l.ready);
const PARTS = ['landing-follow-section', 'landing-books', 'landing-labs', 'landing-exam', 'landing-how', 'landing-open', 'landing-close'];

/** What reaches past the right edge of the window: nothing, on a page that fits. */
async function overflow(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const out: string[] = [];
    const root = document.documentElement;
    if (root.scrollWidth > window.innerWidth) out.push(`page ${root.scrollWidth} > ${window.innerWidth}`);
    // The parts a visitor reads; the strip of labs scrolls sideways on purpose.
    const parts = document.querySelectorAll<HTMLElement>('.lp-wrap > *, .ft-card, .lp-scale, .ft-board, .lp-page, .lp-answer, .lp-folder, .lp-ticket, .lp-memo, .lp-slip, .lp-bar a, .lp-bar button');
    for (const el of parts) {
      const r = el.getBoundingClientRect();
      if (r.width > 0 && r.right > window.innerWidth + 1) out.push(`${el.className} ends at ${Math.round(r.right)}`);
    }
    return out;
  });
}

test('the landing page has every part, with the counts of the content', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByTestId('landing-title')).toHaveText('See the accounts balance themselves');
  await expect(page).toHaveTitle(/Accountancy Master/);
  for (const id of PARTS) await expect(page.getByTestId(id)).toBeAttached();
  const counts: Record<string, number> = {
    topics: LANDING_TOTALS.topics,
    patterns: LANDING_TOTALS.patterns,
    labs: READY_LABS.length,
    written: LANDING_TOTALS.written,
    cases: LANDING_TOTALS.cases,
    papers: LANDING_TOTALS.paperKinds,
  };
  for (const [id, n] of Object.entries(counts)) await expect(page.getByTestId(`landing-count-${id}`)).toContainText(grouped(n));
  // Every playable topic of both classes is in the index of its book.
  for (const course of LANDING_COURSES) {
    await expect(page.getByTestId(`landing-book-${course.id}`).locator('a[href^="/topics/"]')).toHaveCount(course.topics.length);
  }
  // Every lab is on the desk once for the keyboard (the second set is a copy for the drift, out of reach).
  await expect(page.locator('[data-testid^="landing-lab-"]')).toHaveCount(READY_LABS.length);
  // The card the page makes when it is shared.
  await expect(page.locator('meta[property="og:image"]')).toHaveAttribute('content', /opengraph-image/);
  await expect(page.locator('meta[property="og:title"]')).toHaveAttribute('content', /balance themselves/);
});

test('"Follow a transaction" goes down to the story, and Start learning opens the first screen', async ({ page }) => {
  await page.goto('/');
  await page.getByTestId('landing-follow').click();
  await expect(page.locator('#follow-title')).toBeInViewport();
  await expect(page.getByTestId('landing-title')).not.toBeInViewport();
  await page.goto('/');
  await page.getByTestId('landing-start-hero').click();
  await expect(page).toHaveURL(/\/start$/);
  await expect(page.getByTestId('profile-name-input')).toBeVisible();
});

test('a returning learner continues as themselves, or chooses another learner', async ({ page }) => {
  await createProfile(page, 'Varun');
  await page.goto('/');
  await expect(page.getByTestId('landing-continue-hero')).toHaveText(/Continue as Varun/);
  await expect(page.getByTestId('landing-start-hero')).toHaveCount(0);
  await expect(page.getByTestId('landing-choose-hero')).toHaveAttribute('href', '/start');
  await page.getByTestId('landing-continue-hero').click();
  await expect(page).toHaveURL(/\/home$/);
  await expect(page.getByTestId('profile-name')).toHaveText('Varun');
});

test('the links of the landing page lead where they say', async ({ page }) => {
  await createProfile(page, 'Varun');
  await page.goto('/');
  const labs = ['books-of-entry', 'equation', 'posting', 'trial-balance-scale', 'final-accounts'];
  for (const [i, lab] of labs.entries()) await expect(page.getByTestId(`follow-lab-${i + 1}`)).toHaveAttribute('href', labHref(lab));
  await expect(page.getByTestId('landing-report')).toHaveAttribute('href', `${REPO}/issues/new/choose`);
  await expect(page.getByTestId('landing-discussions')).toHaveAttribute('href', `${REPO}/discussions`);
  await expect(page.getByTestId('landing-source')).toHaveAttribute('href', REPO);
  await expect(page.getByTestId('landing-github')).toHaveAttribute('href', REPO);
  // A topic of the index opens its page.
  const topic = LANDING_COURSES[0].topics[3];
  await page.getByTestId(`landing-topic-${topic.id}`).click();
  await expect(page).toHaveURL(new RegExp(`/topics/${topic.id}$`));
  // A lab on the desk opens the lab, from the keyboard too.
  await page.goto('/');
  const card = page.getByTestId('landing-lab-depreciation');
  await expect(card).toHaveAttribute('href', labHref('depreciation'));
  await card.focus();
  await expect(card).toBeInViewport();
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(/\/simulator\?lab=depreciation$/);
  // And the folders of the exam part open theirs.
  await page.goto('/');
  await page.getByTestId('landing-exam-mock').click();
  await expect(page).toHaveURL(/\/mock$/);
});

test('nothing reaches past the edge of the screen at 360, 768 and 1280 px', async ({ page }) => {
  for (const width of [360, 768, 1280]) {
    await page.setViewportSize({ width, height: 800 });
    await page.goto('/');
    await expect(page.getByTestId('landing-title')).toBeVisible();
    // Down through the page, so that every part has been drawn in.
    for (const id of PARTS) await page.getByTestId(id).scrollIntoViewIfNeeded();
    expect(await overflow(page), `${width} px`).toEqual([]);
  }
});

test.describe('with reduced motion', () => {
  test.use({ reducedMotion: 'reduce' });

  test('every part shows its finished state and nothing moves', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByTestId('landing-title')).toBeVisible();
    expect(await page.locator('html').getAttribute('data-lp-motion')).toBeNull();
    // The balance: the books after the last transaction, level, with nothing to pause.
    await expect(page.getByTestId('hero-assets')).toHaveText('₹6,25,000');
    await expect(page.getByTestId('hero-liabilities')).toHaveText('₹1,15,000');
    await expect(page.getByTestId('hero-capital')).toHaveText('₹5,10,000');
    await expect(page.getByTestId('hero-equation')).toHaveAttribute('data-level', 'true');
    await expect(page.getByTestId('hero-pause')).toHaveCount(0);
    // The story: the board shows the scene of the step being read, finished: the trial balance, agreed.
    await page.getByTestId('follow-step-4').evaluate((el) => window.scrollBy(0, el.getBoundingClientRect().top + el.getBoundingClientRect().height * 0.2 - window.innerHeight * 0.5));
    await expect(page.locator('.ft-stage')).toHaveAttribute('data-step', '3');
    await expect(page.locator('[data-count][data-scene="3"]').first()).toHaveText('1,73,100');
    // The labs do not drift, and there is nothing to stop.
    await expect(page.getByTestId('labs-pause')).toHaveCount(0);
    expect(await page.locator('.lp-track').evaluate((el) => getComputedStyle(el).animationName)).toBe('none');
    // The answer is marked, and the slip at the end is stamped.
    await expect(page.getByTestId('landing-answer-score')).toHaveText('2½ / 3');
    await page.getByTestId('landing-close').scrollIntoViewIfNeeded();
    await expect(page.getByTestId('landing-slip-total')).toBeVisible();
    expect(await page.getByTestId('landing-stamp').evaluate((el) => getComputedStyle(el).opacity)).toBe('1');
  });
});
