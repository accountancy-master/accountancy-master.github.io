import { expect, test, type Page } from '@playwright/test';
import GLOSSARY_11 from '../src/content/glossary/cbse11';
import TIPS_11 from '../src/content/glossary/tips11';
import { filterGlossary, letterOf, sortGlossary } from '../src/content/glossary/search';
import { findCourse } from '../src/content/outline';
import { paperPattern } from '../src/learning/examPack';
import { blueprintsOf } from '../src/learning/paperBlueprints';
import { dayKey } from '../src/learning/gamification';
import { CLASS11, JE, createProfile, levelOf, showAnswer } from './helpers';

// The glossary (/glossary) and "Before the exam" (/exam), read from the data files as they stand: the tests hold for
// however many terms and tips the files have.

const COURSE = findCourse(CLASS11)!;
const unitOf = (topicId: string) => COURSE.topics.find((t) => t.id === topicId)?.unit;
const ENTRIES = sortGlossary(GLOSSARY_11);
const plusDays = (n: number) => dayKey(Date.now() + n * 86_400_000);
/** Opens a folded part of "Before the exam" (folded on a phone, open on a laptop). */
async function unfold(page: Page, testId: string) {
  const toggle = page.getByTestId(`${testId}-toggle`);
  if ((await toggle.getAttribute('aria-expanded')) === 'false') await toggle.click();
  await expect(toggle).toHaveAttribute('aria-expanded', 'true');
}
const noSidewaysScroll = (page: Page) => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);

async function openGoTo(page: Page, phone: boolean) {
  if (phone) await page.getByTestId('goto-open').click();
  // Ctrl K works once the page has hydrated: press it until Go to opens.
  else await expect(async () => { await page.keyboard.press('Control+k'); await expect(page.getByTestId('goto-input')).toBeVisible({ timeout: 1000 }); }).toPass();
  await expect(page.getByTestId('goto-input')).toBeFocused();
}

test('the glossary shows one letter at a time (or every letter, a page at a time), finds terms by search, and moves by letter', async ({ page }) => {
  await createProfile(page, 'Varun');
  await page.goto('/glossary');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Glossary');
  // The first letter only, so that a phone is not a wall of hundreds of terms.
  const first = letterOf(ENTRIES[0].term);
  const ofFirst = ENTRIES.filter((e) => letterOf(e.term) === first);
  await expect(page.getByTestId(`glossary-letter-${first}`)).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByTestId('glossary-showing')).toHaveText(`Showing ${ofFirst.length} of ${ENTRIES.length} terms · the letter ${first}`);
  const ids = () => page.locator('article[data-testid^="term-"]').evaluateAll((els) => els.map((el) => el.id));
  expect(await ids()).toEqual(ofFirst.slice(0, 30).map((e) => e.id));
  // A to Z: every term, in the order of the sorted data, a page at a time.
  await page.getByTestId('glossary-letter-all').click();
  await expect(page.getByTestId('glossary-showing')).toHaveText(`Showing ${ENTRIES.length} of ${ENTRIES.length} terms`);
  expect((await ids()).length).toBeLessThanOrEqual(30);
  while ((await page.getByTestId('glossary-more').count()) > 0) await page.getByTestId('glossary-more').click();
  expect(await ids()).toEqual(ENTRIES.map((e) => e.id));
  // The letters are buttons a finger can hit.
  const box = (await page.getByTestId(`glossary-letter-${first}`).boundingBox())!;
  expect(box.height).toBeGreaterThanOrEqual(44);
  expect(box.width).toBeGreaterThanOrEqual(44);

  // "/" focuses the search; a term is found by its name, by another name and by its definition.
  await page.locator('body').click({ position: { x: 5, y: 5 } });
  await page.keyboard.press('/');
  await expect(page.getByTestId('glossary-search')).toBeFocused();
  const target = ENTRIES.find((e) => e.also?.length) ?? ENTRIES[0];
  for (const query of [target.term, ...(target.also ?? []).slice(0, 1)]) {
    await page.getByTestId('glossary-search').fill(query);
    const expected = filterGlossary(ENTRIES, { query, unit: '', topicId: '' }, unitOf);
    await expect(page.getByTestId('glossary-showing')).toHaveText(`Showing ${expected.length} of ${ENTRIES.length} terms`);
    await expect(page.getByTestId(`term-${target.id}`)).toBeVisible();
  }
  await page.getByTestId('glossary-search').fill('zzzz no such term');
  await expect(page.getByTestId('glossary-none')).toBeVisible();
  await page.getByTestId('glossary-search').fill(target.term);

  // A term shows its definition, its other names, its topic (linked) and where to practise its concept.
  const card = page.getByTestId(`term-${target.id}`);
  await expect(card.getByTestId('term-definition')).toHaveText(target.definition);
  if (target.also?.length) await expect(card.getByTestId('term-also')).toContainText(target.also[0]);
  await expect(card.getByTestId('term-topic')).toHaveAttribute('href', `/topics/${target.topicId}`);
  if (target.conceptId) await expect(card.getByTestId('term-practise')).toHaveAttribute('href', /^\/playground\?topic=|^\/practice\/topic\//);

  // The filter by topic.
  await page.getByTestId('glossary-search').fill('');
  await page.getByTestId('glossary-topic').selectOption(target.topicId);
  const ofTopic = filterGlossary(ENTRIES, { query: '', unit: '', topicId: target.topicId }, unitOf);
  await expect(page.getByTestId('glossary-showing')).toHaveText(`Showing ${ofTopic.length} of ${ENTRIES.length} terms`);
  await page.getByTestId('glossary-topic').selectOption('');

  // The letter index: the last letter that has terms shows its terms, its heading in view.
  const last = letterOf(ENTRIES[ENTRIES.length - 1].term);
  await page.getByTestId(`glossary-letter-${last}`).click();
  await expect(page.getByTestId(`glossary-letter-${last}`)).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByTestId(`glossary-heading-${last}`)).toBeInViewport();
  await expect(page.getByTestId(`term-${ENTRIES.find((e) => letterOf(e.term) === last)!.id}`)).toBeAttached();
});

test("a term has its own address, and a see-also link moves to the term it names", async ({ page }) => {
  await createProfile(page, 'Varun');
  const term = ENTRIES.find((e) => e.seeAlso?.length) ?? ENTRIES[ENTRIES.length - 1];
  await page.goto(`/glossary#${term.id}`);
  const card = page.getByTestId(`term-${term.id}`);
  await expect(card).toHaveAttribute('data-target', 'true');
  await expect(card).toBeInViewport();
  if (term.seeAlso?.length) {
    const other = ENTRIES.find((e) => e.id === term.seeAlso![0])!;
    await card.getByTestId('term-see-also').getByRole('link', { name: other.term }).click();
    await expect(page).toHaveURL(new RegExp(`/glossary#${other.id}$`));
    await expect(page.getByTestId(`term-${other.id}`)).toHaveAttribute('data-target', 'true');
  }
});

test('Go to finds a term of the glossary and opens it', async ({ page }, info) => {
  const phone = info.project.name === 'phone';
  await createProfile(page, 'Varun');
  const term = ENTRIES[0];
  await openGoTo(page, phone);
  await page.getByTestId('goto-input').fill(term.term);
  const result = page.getByTestId('goto-result').filter({ hasText: `${term.term} (glossary)` });
  await expect(result.first()).toBeVisible();
  await result.first().click();
  await expect(page).toHaveURL(new RegExp(`/glossary#${term.id}$`));
  await expect(page.getByTestId(`term-${term.id}`)).toHaveAttribute('data-target', 'true');

  // From the glossary itself, another term: the page moves to it.
  const other = ENTRIES[ENTRIES.length - 1];
  await openGoTo(page, phone);
  await page.getByTestId('goto-input').fill(other.term);
  await page.getByTestId('goto-result').filter({ hasText: `${other.term} (glossary)` }).first().click();
  await expect(page).toHaveURL(new RegExp(`/glossary#${other.id}$`));
  await expect(page.getByTestId(`term-${other.id}`)).toHaveAttribute('data-target', 'true');
});

test('Before the exam: the countdown, the pattern of the paper, the tips, a weak topic after wrong answers, and a plan', async ({ page }) => {
  test.setTimeout(120_000);
  await createProfile(page, 'Varun');
  const day = plusDays(20);
  await page.goto('/settings');
  await page.getByTestId(`exam-date-${CLASS11}`).fill(day);
  await expect(page.getByTestId(`exam-saved-${CLASS11}`)).toContainText('Set for');

  // Reached from Home: the countdown card and the quick actions.
  await page.getByTestId('nav-home').click();
  await expect(page.getByTestId('quick-exam')).toHaveAttribute('href', '/exam');
  await page.getByTestId('exam-countdown').getByTestId('exam-pack-link').click();
  await expect(page).toHaveURL(/\/exam$/);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Before the exam');
  await expect(page.getByTestId('exam-pack-days')).toHaveText('20');

  // The pattern, from the blueprint of the full paper.
  const pattern = paperPattern(blueprintsOf(CLASS11).full);
  await expect(page.getByTestId('exam-pattern-summary')).toContainText(`${pattern.marks} marks`);
  await expect(page.getByTestId('exam-pattern-summary')).toContainText(`${pattern.questions} questions`);
  await expect(page.getByTestId('exam-pattern-summary')).toContainText('15 minutes to read');
  for (const [i, s] of pattern.sections.entries()) await expect(page.getByTestId(`exam-section-time-${i}`)).toHaveText(`About ${s.minutes} minutes`);

  // The tips of the course.
  await expect(page.getByTestId('exam-tips')).toContainText(TIPS_11.general[0]);
  // Nothing done yet: every topic is still to start, and the plan begins with the first.
  await unfold(page, 'exam-weak-spots');
  await expect(page.getByTestId(`exam-new-${JE}`)).toBeVisible();
  await expect(page.getByTestId('exam-plan-day')).toHaveCount(14);
  await expect(page.getByTestId('exam-plan-day').first()).toHaveAttribute('data-kind', 'new');
  await unfold(page, 'exam-plan');
  await page.getByTestId('exam-plan-all').click();
  await expect(page.getByTestId('exam-plan-day')).toHaveCount(20);
  await expect(page.getByTestId('exam-plan-day').last()).toHaveAttribute('data-kind', 'sheets');

  // Two questions of Journal Entries given up on: the topic is now weak, and its mistakes are counted.
  await page.goto(`/practice/topic/${JE}`);
  for (let n = 0; n < 2; n++) {
    await expect(page.getByTestId('question')).toBeVisible();
    await showAnswer(page);
    await expect(page.getByTestId('feedback')).toHaveAttribute('data-correct', 'false');
    await page.getByTestId('continue').click();
  }
  await page.goto('/exam');
  await unfold(page, 'exam-weak-spots');
  await expect(page.locator(`[data-testid^="exam-weak-je-"]`).first()).toBeVisible();
  await expect(page.getByTestId(`exam-new-${JE}`)).toHaveCount(0);
  await expect(page.getByTestId(`exam-weight-${JE}`)).toContainText('0% mastery');
  const mistakes = page.getByTestId(`exam-mistakes-${JE}`);
  await expect(mistakes).toContainText('2 misses');
  await expect(mistakes.getByTestId('exam-try-similar').first()).toHaveAttribute('href', /^\/playground\?topic=journal-entries&pattern=|^\/practice\/topic\/journal-entries$/);
});

test('the ticks of the exam tips are kept on the device after a reload', async ({ page }) => {
  await createProfile(page, 'Varun');
  await page.goto('/exam');
  const total = TIPS_11.general.length + TIPS_11.sections.reduce((n, s) => n + s.tips.length, 0) + TIPS_11.mistakes.length;
  await expect(page.getByTestId('exam-tips-count')).toHaveText(`0 of ${total} ticked`);
  await unfold(page, 'exam-tips');
  const first = page.getByTestId('exam-tips').getByRole('checkbox').first();
  await first.check();
  await expect(page.getByTestId('exam-tips-count')).toHaveText(`1 of ${total} ticked`);
  await page.reload();
  await unfold(page, 'exam-tips');
  await expect(page.getByTestId('exam-tips').getByRole('checkbox').first()).toBeChecked();
  await expect(page.getByTestId('exam-tips-count')).toHaveText(`1 of ${total} ticked`);
  await page.getByTestId('exam-tips').getByRole('checkbox').first().uncheck();
  await expect(page.getByTestId('exam-tips-count')).toHaveText(`0 of ${total} ticked`);
});

test('at 1280 px both pages have the sidebar with their own item marked', async ({ page }, info) => {
  test.skip(info.project.name !== 'laptop', 'the laptop layout');
  await createProfile(page, 'Varun');
  for (const [path, nav, title] of [
    ['/glossary', 'nav-glossary', 'Glossary'],
    ['/exam', 'nav-exam', 'Before the exam'],
  ] as const) {
    await page.goto(path);
    const sidebar = page.getByRole('complementary', { name: 'Sidebar' });
    await expect(sidebar).toBeVisible();
    await expect(sidebar.locator('[aria-current="page"]')).toHaveCount(1);
    await expect(sidebar.getByTestId(nav)).toHaveAttribute('aria-current', 'page');
    await expect(page.getByTestId('topbar-title')).toHaveText(title);
  }
});

test('at 360 px neither page scrolls sideways', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 740 });
  await createProfile(page, 'Varun');
  await page.goto('/settings');
  await page.getByTestId(`exam-date-${CLASS11}`).fill(plusDays(30));
  await expect(page.getByTestId(`exam-saved-${CLASS11}`)).toContainText('Set for');
  await page.goto('/glossary');
  await expect(page.getByTestId('glossary-showing')).toBeVisible();
  expect(await noSidewaysScroll(page)).toBe(true);
  await page.goto('/exam');
  await unfold(page, 'exam-plan');
  await expect(page.getByTestId('exam-plan-days')).toBeVisible();
  await expect(page.getByTestId('exam-tips')).toBeVisible();
  expect(await noSidewaysScroll(page)).toBe(true);
});

test('on a phone, "Before the exam" folds its long parts: a short page with a 44 px heading to open each', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 760 });
  await createProfile(page, 'Varun');
  await page.goto('/exam');
  await expect(page.getByTestId('exam-pattern-summary')).toBeVisible();
  for (const id of ['exam-weights', 'exam-weak-spots', 'exam-mistakes', 'exam-tips', 'exam-plan']) {
    await expect(page.getByTestId(id)).toHaveAttribute('data-open', 'false');
    expect((await page.getByTestId(`${id}-toggle`).boundingBox())!.height).toBeGreaterThanOrEqual(44);
  }
  expect(await page.evaluate(() => document.documentElement.scrollHeight)).toBeLessThan(6000);
  await page.getByTestId('exam-tips-toggle').click();
  await expect(page.getByTestId('exam-tips')).toHaveAttribute('data-open', 'true');
  await expect(page.getByTestId('exam-tips').getByRole('checkbox').first()).toBeVisible();
  // An address that names a part opens it.
  await page.goto('/exam#plan');
  await expect(page.getByTestId('exam-plan')).toHaveAttribute('data-open', 'true');
});

test('on a phone the glossary is one letter at a time and the playground a page at a time', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 760 });
  await createProfile(page, 'Varun');
  await page.goto('/glossary');
  await expect(page.getByTestId('glossary-showing')).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollHeight)).toBeLessThan(30000);
  await page.goto('/playground');
  await expect(page.getByTestId('playground-count')).toBeVisible();
  await expect(page.locator('article[data-testid^="pattern-"]').first()).toBeVisible();
  expect(await page.locator('article[data-testid^="pattern-"]').count()).toBeLessThanOrEqual(12);
  expect(await page.evaluate(() => document.documentElement.scrollHeight)).toBeLessThan(9000);
  // Every tick box of the cards is a 44 px target.
  const select = page.locator('[data-testid$="-select-target"]').first();
  const box = (await select.boundingBox())!;
  expect(box.height).toBeGreaterThanOrEqual(44);
  expect(box.width).toBeGreaterThanOrEqual(44);
});

test('a fresh device has the ladder in order: the first level open, the rest locked', async ({ page }) => {
  await createProfile(page, 'Varun', { keepDeviceDefaults: true });
  await page.goto(`/topics/${JE}`);
  await expect(page.getByTestId('level-0')).toHaveAttribute('data-state', 'unlocked');
  await expect(page.getByTestId('level-1')).toHaveAttribute('data-state', 'locked');
  await page.goto(`/play/${levelOf(JE, 3)}`);
  await expect(page.getByTestId('level-locked')).toBeVisible();
});

// Screenshots for docs/screenshots/revision, at 1440 x 900. Taken only with SHOTS=1:
// `SHOTS=1 npx playwright test e2e/glossary-exam.spec.ts --project=laptop -g screenshots`.
test('screenshots of the glossary and the exam page', async ({ page }, info) => {
  test.skip(process.env.SHOTS !== '1' || info.project.name !== 'laptop', 'screenshots are only taken when SHOTS=1, at laptop size');
  test.setTimeout(120_000);
  await page.setViewportSize({ width: 1440, height: 900 });
  await createProfile(page, 'Varun');
  await page.goto('/settings');
  await page.getByTestId(`exam-date-${CLASS11}`).fill(plusDays(24));
  await expect(page.getByTestId(`exam-saved-${CLASS11}`)).toContainText('Set for');
  await page.goto(`/practice/topic/${JE}`);
  for (let n = 0; n < 3; n++) {
    await expect(page.getByTestId('question')).toBeVisible();
    await showAnswer(page);
    await page.getByTestId('continue').click();
  }
  const shot = async (name: string, fullPage = false) => {
    await page.evaluate(() => document.fonts.ready);
    await page.screenshot({ path: `docs/screenshots/revision/${name}.png`, animations: 'disabled', fullPage });
  };
  await page.goto('/glossary');
  await expect(page.getByTestId('glossary-showing')).toBeVisible();
  await shot('glossary-desktop');
  await page.goto(`/glossary#${ENTRIES[Math.min(2, ENTRIES.length - 1)].id}`);
  await expect(page.locator('[data-target="true"]')).toBeVisible();
  await shot('glossary-term-desktop');
  await page.goto('/exam');
  await expect(page.getByTestId('exam-plan-days')).toBeVisible();
  await unfold(page, 'exam-tips');
  await page.getByTestId('exam-tips').getByRole('checkbox').first().check();
  await page.evaluate(() => window.scrollTo(0, 0));
  await shot('exam-desktop');
  await shot('exam-full-desktop', true);
});
