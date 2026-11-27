import { expect, test, type Locator, type Page } from '@playwright/test';
import { topicShown } from '../src/content/courseOptions';
import { COURSES } from '../src/content/registry';
import {
  CLASS11,
  CLASS11_PACKS,
  CLASS12,
  CLASS12_LIVE,
  CLASS12_PACKS,
  JE,
  SAMPLE_TOPIC,
  createProfile,
  fillAccount,
  fillStatement,
  foldData,
  headerXp,
  packOf,
  playSession,
  seedPassedLevels,
  typedFigure,
  withClass12Sample,
  type ColumnKindE2e,
  type FormatRowE2e,
} from './helpers';

// The second course. The real Class 12 topics hold whatever their authors have written by now, so nothing here counts
// on them: a test that needs a Class 12 topic switches the sample topic of the test build on (it is the last topic of
// Class 12 then, in a unit of its own), and the one test about a build with no Class 12 at all runs only while there
// is none.

/** The levels of the sample topic, in order: a lesson, cards, two authored questions, two practice levels, two of formats. */
const SAMPLE_LEVELS = 7;
const level = (n: number) => `${SAMPLE_TOPIC}-level-${n}`;
const class11 = COURSES[0];
const class12 = COURSES[1];
/** How many topics a Class 12 learner can play with the sample on. */
const CLASS12_TOPICS = CLASS12_PACKS.length + 1;
const topics = (n: number) => `${n} ${n === 1 ? 'topic' : 'topics'}`;

const noSidewaysScroll = (page: Page) => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);
/** Nothing scrolls sideways, and nothing of a sample is wider than the screen. */
async function fits(page: Page, sample: Locator) {
  expect(await noSidewaysScroll(page)).toBe(true);
  expect(await sample.evaluate((root) => [...root.querySelectorAll('*')].filter((el) => !el.closest('.sr-only') && el.getBoundingClientRect().width > 1 && el.getBoundingClientRect().right > window.innerWidth + 1).length)).toBe(0);
}

async function chooseCourse(page: Page, courseId: string) {
  await page.goto('/settings');
  await page.getByTestId(`course-${courseId}`).click();
  await expect(page.getByTestId(`course-${courseId}`)).toHaveAttribute('aria-pressed', 'true');
}

test('while Class 12 has nothing to play, a new learner is offered no course and meets nothing of Class 12', async ({ page }) => {
  test.skip(CLASS12_LIVE, 'Class 12 has topics that can be played: a learner is offered the choice now');
  await page.goto('/start');
  await expect(page.getByTestId('app-tagline')).toHaveText('Learn Class 11 Accountancy by practising it.');
  await expect(page.getByTestId('profile-course')).toHaveCount(0);
  await createProfile(page, 'Varun');

  // The topics of Class 11, and Class 12 as the preview it always was.
  await page.goto('/topics');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(class11.title);
  await expect(page.getByTestId('preview-card')).toHaveCount(class11.previews.length);
  await expect(page.getByTestId('other-courses')).toHaveCount(0);
  for (const topic of class12.topics) await expect(page.getByTestId(`topic-card-${topic.id}`)).toHaveCount(0);

  // No course to choose in Settings, and everything else is Class 11's.
  await page.goto('/settings');
  await expect(page.getByTestId('settings-profile-name')).toHaveText('Varun');
  await expect(page.getByTestId('course-section')).toHaveCount(0);
  await page.goto('/practice');
  await expect(page.getByTestId('hub-topic-count')).toHaveText(topics(CLASS11_PACKS.length));
  await page.goto('/mock');
  await expect(page.getByTestId('mock-kind-full-meta')).toContainText('80 marks');
  await expect(page.getByTestId('mock-new-full')).toBeVisible();
  await expect(page.getByTestId('mock-topic-select').locator('option')).toHaveCount(CLASS11_PACKS.length);

  // The learner on the opening screen again: still nothing about courses.
  await page.goto('/settings');
  await page.getByTestId('switch-profile').click();
  await expect(page.getByTestId('profile-pick-Varun')).toBeVisible();
  await expect(page.getByTestId('profile-course-Varun')).toHaveCount(0);
});

test('a learner chooses Class 12 when they are made, and sees its topics and no others', async ({ page }) => {
  await withClass12Sample(page);
  await page.goto('/start');
  // Class 12 has something to play, so the course is a choice: Class 11 unless the learner says otherwise.
  await expect(page.getByTestId('profile-course')).toBeVisible();
  await expect(page.getByTestId(`course-${CLASS11}`)).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByTestId(`course-${CLASS12}`)).toHaveAttribute('aria-pressed', 'false');
  await expect(page.getByTestId(`course-${CLASS12}`)).toContainText('Class 12 Accountancy');
  await createProfile(page, 'Meera', { courseId: CLASS12 });

  await page.goto('/topics');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(class12.title);
  await expect(page.getByTestId(`topic-card-${SAMPLE_TOPIC}`)).toHaveAttribute('data-status', 'available');
  await expect(page.getByTestId(`topic-levels-${SAMPLE_TOPIC}`)).toHaveText(`0 of ${SAMPLE_LEVELS} levels passed`);
  // Every topic of the course as a learner on the default choice of Part B has it (Computerised Accounting is the other).
  for (const topic of class12.topics.filter((t) => topicShown(t.id, {}))) await expect(page.getByTestId(`topic-card-${topic.id}`)).toBeVisible();
  await expect(page.getByTestId(`topic-card-${JE}`)).toHaveCount(0);
  await expect(page.getByTestId('preview-card')).toHaveCount(0);
  await expect(page.getByTestId('other-courses')).toContainText('Class 11 Accountancy is a course of its own.');

  // Practice, the mock papers and the Progress screen are Class 12's.
  await page.goto('/practice');
  await expect(page.getByTestId('hub-topic-count')).toHaveText(topics(CLASS12_TOPICS));
  await page.goto('/practice/topic');
  await expect(page.getByTestId(`pick-topic-${SAMPLE_TOPIC}`)).toBeVisible();
  await expect(page.getByTestId(`pick-topic-${JE}`)).toHaveCount(0);
  await page.goto('/mock');
  await expect(page.getByTestId('mock-topic-select').locator('option')).toHaveCount(CLASS12_TOPICS);
  await expect(page.getByTestId('mock-topic-select').locator(`option[value="${SAMPLE_TOPIC}"]`)).toHaveCount(1);
  await expect(page.getByTestId('mock-kind-full-meta')).toContainText('80 marks');
  await page.goto('/progress');
  await expect(page.getByTestId(`progress-topic-${SAMPLE_TOPIC}`)).toBeVisible();
  await expect(page.getByTestId(`progress-topic-${JE}`)).toHaveCount(0);

  // The course is the learner's: it is still theirs after a reload, and the opening screen says which they are on.
  await page.reload();
  await expect(page.getByTestId(`progress-topic-${SAMPLE_TOPIC}`)).toBeVisible();
  await page.goto('/settings');
  await expect(page.getByTestId(`course-${CLASS12}`)).toHaveAttribute('aria-pressed', 'true');
  await page.getByTestId('switch-profile').click();
  await expect(page.getByTestId('profile-course-Meera')).toHaveText('Class 12 Accountancy');
});

test('changing course in Settings shows the other course at once, and changing back loses nothing', async ({ page }) => {
  test.setTimeout(180_000);
  await withClass12Sample(page);
  await createProfile(page, 'Varun');
  // Some progress in Class 11: the first two levels of Journal Entries passed.
  await seedPassedLevels(page, 1);
  await page.goto('/topics');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(class11.title);
  const jeLevels = packOf(JE).levels.length;
  await expect(page.getByTestId(`topic-levels-${JE}`)).toHaveText(`2 of ${jeLevels} levels passed`);
  await expect(page.getByTestId('other-courses')).toContainText('Class 12 Accountancy is a course of its own.');
  const xp11 = await headerXp(page);
  expect(xp11).toBeGreaterThan(0);

  // Over to Class 12: its topics at once, nothing done in it yet, and the XP the learner has.
  await chooseCourse(page, CLASS12);
  await page.goto('/topics');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(class12.title);
  await expect(page.getByTestId(`topic-levels-${SAMPLE_TOPIC}`)).toHaveText(`0 of ${SAMPLE_LEVELS} levels passed`);
  await expect(page.getByTestId(`topic-card-${JE}`)).toHaveCount(0);
  expect(await headerXp(page)).toBe(xp11);

  // The first level of the Class 12 topic: its lesson, with a worked example that is no journal entry, and its check.
  await page.goto(`/topics/${SAMPLE_TOPIC}`);
  await expect(page.getByTestId('level-0')).toBeVisible();
  await page.goto(`/play/${level(0)}`);
  // The lesson is read a step at a time: the worked example and the table each come in their own step.
  await nextLessonStepWith(page, 'lesson-working');
  await expect(page.getByTestId('lesson-working').locator('li')).toHaveCount(3);
  await nextLessonStepWith(page, 'lesson-table');
  await expect(page.getByTestId('lesson-table').getByRole('row')).toHaveCount(4);
  await expect(page.getByTestId('lesson-table').getByRole('row').last()).toHaveText('Profit shared₹90,000');
  expect(await playSession(page)).toBe(1);
  await page.goto('/topics');
  await expect(page.getByTestId(`topic-levels-${SAMPLE_TOPIC}`)).toHaveText(`1 of ${SAMPLE_LEVELS} levels passed`);
  await expect(page.getByTestId(`topic-answered-${SAMPLE_TOPIC}`)).toHaveText('1 question answered');
  const xpBoth = await headerXp(page);
  expect(xpBoth).toBeGreaterThan(xp11);

  // Back to Class 11: what was done there is as it was, and the XP is the learner's whole.
  await chooseCourse(page, CLASS11);
  await page.goto('/topics');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(class11.title);
  await expect(page.getByTestId(`topic-levels-${JE}`)).toHaveText(`2 of ${jeLevels} levels passed`);
  await expect(page.getByTestId(`topic-card-${SAMPLE_TOPIC}`)).toHaveCount(0);
  expect(await headerXp(page)).toBe(xpBoth);
  await page.goto('/progress');
  await expect(page.getByTestId('progress-answered')).toHaveText('0');
  await expect(page.getByTestId(`progress-topic-${JE}`)).toContainText(`2 of ${jeLevels} levels passed`);

  // And Class 12 again, after a reload: the level passed there is still passed.
  await chooseCourse(page, CLASS12);
  await page.reload();
  await page.goto('/progress');
  await expect(page.getByTestId('progress-answered')).toHaveText('1');
  await expect(page.getByTestId(`progress-topic-${SAMPLE_TOPIC}`)).toContainText(`1 of ${SAMPLE_LEVELS} levels passed`);
});

test("a topic of Class 12 has its page and its levels, and a topic of another course is not the learner's to open", async ({ page }) => {
  test.setTimeout(180_000);
  await withClass12Sample(page);
  // Every level open on this device.
  await createProfile(page, 'Meera', { unlockAll: true, courseId: CLASS12 });
  await page.goto(`/topics/${SAMPLE_TOPIC}`);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Sample of Class 12');
  await expect(page.locator('[data-testid^="level-start-"]')).toHaveCount(SAMPLE_LEVELS);

  // The two authored questions: a ratio, typed a box to a number, and a number of times.
  await page.goto(`/play/${level(2)}`);
  const question = page.getByTestId('question');
  for (let n = 0; n < 2; n++) {
    await expect(question).toHaveAttribute('data-question-type', 'numeric');
    const id = (await question.getAttribute('data-question-id'))!;
    if (id === 's12-q-002') {
      // Asha 1/2, Bimal 1/3, Chitra the rest: three boxes, and the colons are the screen's.
      await expect(question.getByTestId('ratio-input').locator('input')).toHaveCount(3);
      await expect(page.getByTestId('numeric-input')).toHaveAttribute('inputmode', 'numeric');
      // One box left empty is not an answer yet.
      await page.getByTestId('numeric-input').fill('3');
      await page.getByTestId('ratio-term-1').fill('2');
      await page.getByTestId('check').click();
      await expect(page.getByTestId('numeric-error')).toHaveText('Enter the ratio as whole numbers above zero, one in every box, for example 5:3:2.');
      // A known wrong ratio is told as the mistake it is, and the right one is shown as a ratio.
      await page.getByTestId('numeric-input').fill('2');
      await page.getByTestId('ratio-term-1').fill('3');
      await page.getByTestId('ratio-term-2').fill('1');
      await page.getByTestId('check').click();
      await expect(page.getByTestId('feedback')).toHaveAttribute('data-correct', 'false');
      await expect(page.getByTestId('feedback-mistake')).toHaveText('Took the bottoms of the two fractions as the shares.');
      await expect(page.getByTestId('feedback')).toContainText('Right answer: 3:2:1');
      await expect(page.getByTestId('ratio-term-1')).toHaveValue('3');
    } else {
      expect(id).toBe('s12-q-003');
      await expect(page.getByTestId('numeric-input')).toHaveAttribute('inputmode', 'decimal');
      await page.getByTestId('numeric-input').fill('4.805');
      await page.getByTestId('check').click();
      await expect(page.getByTestId('numeric-error')).toHaveText('Enter a number with up to two decimal places, for example 2.5.');
      await page.getByTestId('numeric-input').fill('4.8 times');
      await page.getByTestId('check').click();
      await expect(page.getByTestId('feedback')).toHaveAttribute('data-correct', 'true');
    }
    await page.getByTestId('continue').click();
    await expect(page.getByTestId('feedback')).toHaveCount(0);
  }
  await expect(page.getByTestId('results')).toBeVisible();
  // The wrong ratio is among the mistakes of this course, with the ratio to give.
  await page.goto('/mistakes');
  await expect(page.getByTestId('mistake-item')).toHaveCount(1);
  await expect(page.getByTestId('mistake-item')).toContainText('Took the bottoms of the two fractions as the shares.');

  // A topic and a level of Class 11 are not this learner's.
  await page.goto(`/topics/${JE}`);
  await expect(page.getByTestId('topic-other-course')).toBeVisible();
  // A shared link to a level of Class 11 says where the level is and offers the switch, never a dead end.
  await page.goto(`/play/${packOf(JE).levels[0].id}`);
  await expect(page.getByTestId('level-missing')).toHaveCount(0);
  await expect(page.getByTestId('level-other-course')).toContainText('This level is in Class 11 Accountancy');
  await expect(page.getByTestId('level-other-course')).toContainText(packOf(JE).levels[0].title);
  await expect(page.getByTestId('level-other-course').getByRole('link', { name: 'Back to topics' })).toHaveAttribute('href', '/topics');

  // On Class 11 the mistake of Class 12 is not shown, and the Class 12 topic is not theirs to open.
  await chooseCourse(page, CLASS11);
  await page.goto('/mistakes');
  await expect(page.getByTestId('mistake-item')).toHaveCount(0);
  await page.goto(`/topics/${SAMPLE_TOPIC}`);
  await expect(page.getByTestId('topic-other-course')).toBeVisible();
  await page.goto(`/topics/${JE}`);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(class11.topics.find((t) => t.id === JE)!.title);

  // A link to a level of Class 12, opened on Class 11: one press switches the course and opens the level there.
  await page.goto('/play/class-12-sample-level-0');
  await page.getByTestId('level-other-course').getByTestId('topic-switch-course').click();
  await expect(page.getByTestId('level-other-course')).toHaveCount(0);
  await expect(page).toHaveURL(/\/play\/class-12-sample-level-0$/);
  // Level 0 is a lesson: it opens on its first step.
  await expect(page.locator('[data-testid="question"], [data-testid="continue"], [data-testid="lesson-step"]').first()).toBeVisible();
  await page.goto('/settings');
  await expect(page.getByTestId(`course-${CLASS12}`)).toHaveAttribute('aria-pressed', 'true');
});

test('a ratio and a number of times are answered right and wrong, and so are capital accounts in columns and a comparative statement', async ({ page }) => {
  test.setTimeout(240_000);
  await createProfile(page, 'Varun');
  await page.goto('/settings');
  await page.getByTestId('e2e-class12-play').click();
  const player = page.getByTestId('e2e-class12-player');
  const question = player.getByTestId('question');

  // 1. The new ratio of three partners, typed whole into the first box: it is shared out among the boxes.
  await expect(question).toHaveAttribute('data-question-type', 'numeric');
  const ratio: string = JSON.parse((await question.getAttribute('data-expected'))!);
  expect(ratio.split(':')).toHaveLength(3);
  const doubled = ratio.split(':').map((n) => Number(n) * 2);
  await player.getByTestId('numeric-input').fill(doubled.join(':'));
  await expect(player.getByTestId('ratio-term-1')).toHaveValue(String(doubled[1]));
  await expect(player.getByTestId('ratio-term-2')).toHaveValue(String(doubled[2]));
  // Twice every number is the same ratio: it is right.
  await player.getByTestId('check').click();
  await expect(player.getByTestId('feedback')).toHaveAttribute('data-correct', 'true');
  await player.getByTestId('continue').click();
  await expect(player.getByTestId('feedback')).toHaveCount(0);

  // 2. The current ratio, in times: its inverse is a known mistake, told as such.
  const times: string = JSON.parse((await question.getAttribute('data-expected'))!);
  await player.getByTestId('numeric-input').fill(String(1 / Number(times)));
  await player.getByTestId('check').click();
  await expect(player.getByTestId('feedback')).toHaveAttribute('data-correct', 'false');
  await expect(player.getByTestId('feedback-mistake')).toHaveText('Divided the current liabilities by the current assets.');
  await expect(player.getByTestId('feedback')).toContainText(`Right answer: ${times}`);
  await player.getByTestId('continue').click();
  await expect(player.getByTestId('feedback')).toHaveCount(0);

  // 3. The partners' capital accounts, four partners: every row right.
  await expect(question).toHaveAttribute('data-question-type', 'account');
  const account: { sides: FormatRowE2e[][]; below: FormatRowE2e[][] } = JSON.parse((await question.getAttribute('data-expected'))!);
  expect(account.sides[0][0].amounts).toHaveLength(4);
  await fillAccount(page, account, question);
  await expect(question.getByTestId('fmt-agree')).toHaveAttribute('data-ruled', 'true');
  await player.getByTestId('check').click();
  await expect(player.getByTestId('feedback')).toHaveAttribute('data-correct', 'true');
  const rows = account.sides.flat().length + account.below.flat().length;
  await expect(question.getByTestId('format-score')).toHaveText(`${rows} of ${rows} rows right`);
  await player.getByTestId('continue').click();
  await expect(player.getByTestId('feedback')).toHaveCount(0);

  // 4. The comparative statement, with a fall typed as a rise: that row is wrong, and the rest is right.
  await expect(question).toHaveAttribute('data-question-type', 'statement');
  const statement: { rows: FormatRowE2e[]; final: null; more: FormatRowE2e[][]; subtotals: number[][]; kinds: ColumnKindE2e[] } = JSON.parse((await question.getAttribute('data-expected'))!);
  expect(statement.kinds.map((k) => k.unit)).toEqual(['rupees', 'rupees', 'rupees', 'percent']);
  const fall = statement.rows[1];
  expect(fall.amounts[2]).toBeLessThan(0);
  const wrong = { ...statement, rows: [statement.rows[0], { ...fall, amounts: fall.amounts.map((a) => Math.abs(a)) }] };
  await fillStatement(page, wrong, question);
  await player.getByTestId('check').click();
  await expect(player.getByTestId('feedback')).toHaveAttribute('data-correct', 'false');
  const parts = statement.rows.length + statement.more.flat().length + statement.subtotals.length;
  await expect(question.getByTestId('format-score')).toHaveText(`${parts - 1} of ${parts} rows right`);
  await expect(question.getByTestId('fmt-yours-0').locator('[data-status="wrongAmount"]')).toHaveCount(1);
  // The correct statement prints the fall in brackets, in the change and in the percentage.
  const solution = question.getByTestId('format-solution');
  await expect(solution).toContainText(`(${(Math.abs(fall.amounts[2]) / 100).toLocaleString('en-IN')})`);
  await expect(solution).toContainText(`(${Math.abs(fall.amounts[3]) / 100})`);
  await expect(solution.getByTestId('solution-heading')).toHaveText('Expenses');
  await expect(solution.getByTestId('solution-subtotal-0')).toContainText('Total revenue');
  await player.getByTestId('continue').click();
  await expect(player.getByTestId('feedback')).toHaveCount(0);
  await expect(page.getByTestId('e2e-class12-done')).toHaveText('2 of 4 right');
});

test("partners' capital accounts in four columns are filled in on a phone 360 px wide", async ({ page }) => {
  test.setTimeout(180_000);
  await page.setViewportSize({ width: 360, height: 740 });
  await createProfile(page, 'Varun');
  await page.goto('/settings');
  const sample = page.getByTestId('e2e-capitals');
  const open = page.getByTestId('e2e-capitals-open');
  const account: { sides: FormatRowE2e[][]; below: FormatRowE2e[][] } = JSON.parse((await sample.getAttribute('data-expected'))!);
  expect(account.sides[0][0].amounts).toHaveLength(4);

  // One side at a time, and the four amounts of a row under its particulars, two to a line, each under a partner's name.
  await expect(open.getByTestId('fmt-tab-0')).toBeVisible();
  const boxes = await Promise.all([0, 1, 2, 3].map(async (c) => (await open.getByTestId(`fmt-s0-amount-0-${c}`).boundingBox())!));
  expect(Math.abs(boxes[0].y - boxes[1].y)).toBeLessThanOrEqual(1);
  expect(boxes[2].y).toBeGreaterThan(boxes[0].y + boxes[0].height - 1);
  expect(Math.abs(boxes[2].y - boxes[3].y)).toBeLessThanOrEqual(1);
  for (const box of boxes) {
    expect(box.width).toBeGreaterThanOrEqual(110);
    expect(box.x + box.width).toBeLessThanOrEqual(360);
  }
  await fits(page, open);

  await fillAccount(page, account, open);
  // Every column agrees on its own, and the format says so for each partner.
  await expect(open.getByTestId('fmt-agree')).toHaveAttribute('data-ruled', 'true');
  const says = await open.getByTestId('fmt-agree').innerText();
  expect(says.match(/both sides total/g)).toHaveLength(4);
  // Both running totals are on the buttons that switch sides, a figure for each partner.
  await expect(open.getByTestId('fmt-tab-total-0')).toContainText('₹');
  expect(await open.getByTestId('fmt-tab-total-0').innerText()).toBe(await open.getByTestId('fmt-tab-total-1').innerText());
  await fits(page, open);

  // Marked: the student's rows name the column of every figure, and the correct account stands one side over the other.
  const marked = page.getByTestId('e2e-capitals-marked');
  await expect(marked.getByTestId('format-score')).toBeVisible();
  await expect(marked.getByTestId('fmt-yours-0').locator('li').first()).toContainText(/ \d/);
  const [left, right] = [await marked.getByTestId('solution-side-0').boundingBox(), await marked.getByTestId('solution-side-1').boundingBox()];
  expect(right!.y).toBeGreaterThanOrEqual(left!.y + left!.height - 1);
  await fits(page, marked);
  await page.getByTestId('e2e-capitals-kept').getByTestId('mistake-show-entry').click();
  await expect(page.getByTestId('e2e-capitals-kept').getByTestId('format-solution')).toBeVisible();
  await fits(page, sample);

  // On a laptop the sides are still shown one at a time: half a page has no room for four amounts.
  await page.setViewportSize({ width: 1280, height: 800 });
  await expect(open.getByTestId('fmt-tab-0')).toBeVisible();
  await open.getByTestId('fmt-tab-0').click();
  const [label, amount] = [await open.getByTestId('fmt-s0-label-0').boundingBox(), await open.getByTestId('fmt-s0-amount-0-0').boundingBox()];
  expect(label!.x + label!.width).toBeLessThanOrEqual(amount!.x);
  await fits(page, sample);
});

test('a statement with negative figures and a percentage column is filled in on a phone, and so are statements in parts', async ({ page }) => {
  test.setTimeout(240_000);
  await page.setViewportSize({ width: 360, height: 740 });
  await createProfile(page, 'Varun');
  await page.goto('/settings');

  // The comparative statement: two rupee columns, a change that may be a fall, and a percentage.
  const sample = page.getByTestId('e2e-comparative');
  const open = page.getByTestId('e2e-comparative-open');
  const statement: { rows: FormatRowE2e[]; final: null; more: FormatRowE2e[][]; subtotals: number[][]; kinds: ColumnKindE2e[] } = JSON.parse((await sample.getAttribute('data-expected'))!);
  await expect(open.getByTestId('fmt-heading')).toHaveText('Expenses');
  await expect(open.getByTestId('fmt-sub-0')).toContainText('Total revenue');
  // A statement with sub-totals has no total of the whole, and a column of percentages would have none anyway.
  await expect(open.getByTestId('fmt-total')).toHaveCount(0);
  // The two columns that may be negative have a button for the sign: the number pad of a phone has no minus key.
  await expect(open.getByTestId('fmt-rows-amount-0-0-sign')).toHaveCount(0);
  await expect(open.getByTestId('fmt-rows-amount-0-2-sign')).toBeVisible();
  await expect(open.getByTestId('fmt-rows-amount-0-3-sign')).toBeVisible();
  await open.getByTestId('fmt-rows-label-0').click();
  await page.getByTestId(`picker-option-${statement.rows[1].label}`).click();
  const change = open.getByTestId('fmt-rows-amount-0-2');
  await change.fill(typedFigure(Math.abs(statement.rows[1].amounts[2])));
  await open.getByTestId('fmt-rows-amount-0-2-sign').click();
  await expect(change).toHaveValue(typedFigure(statement.rows[1].amounts[2]));
  await expect(open.getByTestId('fmt-rows-amount-0-2-sign')).toHaveAttribute('aria-pressed', 'true');
  await open.getByTestId('fmt-rows-amount-0-2-sign').click();
  await expect(change).toHaveValue(typedFigure(Math.abs(statement.rows[1].amounts[2])));
  await open.getByTestId('fmt-rows-remove-0').click();
  await fits(page, open);

  await fillStatement(page, statement, open);
  await expect(open.getByTestId('fmt-rows-amount-1-2')).toHaveValue(typedFigure(statement.rows[1].amounts[2]));
  await expect(open.getByTestId('fmt-rows-amount-1-3')).toHaveValue(typedFigure(statement.rows[1].amounts[3]));
  await expect(open.getByTestId('fmt-sub-2-3')).toHaveValue(typedFigure(statement.subtotals[2][3]));
  await fits(page, open);

  // Marked, with a sign left out and a sub-total left empty: both are pointed out, and the solution uses brackets.
  const marked = page.getByTestId('e2e-comparative-marked');
  const all = statement.rows.length + statement.more.flat().length + statement.subtotals.length;
  await expect(marked.getByTestId('format-score')).toHaveText(`${all - 2} of ${all} rows right`);
  await expect(marked.getByTestId('format-wrong').locator('li')).toHaveCount(2);
  await expect(marked.getByTestId('format-solution')).toContainText('(');
  await expect(marked.getByTestId('fmt-yours-1')).toContainText('Your rows: Expenses');
  await fits(page, marked);
  await page.getByTestId('e2e-comparative-kept').getByTestId('mistake-show-entry').click();
  await expect(page.getByTestId('e2e-comparative-kept').getByTestId('format-score')).toHaveText(`${all - 2} of ${all} rows right`);
  await fits(page, sample);

  // A cash flow statement: one column of inflows and outflows, three parts, and the cash it ends on.
  const cash = page.getByTestId('e2e-cash-flow-open');
  await expect(cash.getByTestId('fmt-heading')).toHaveCount(3);
  await expect(cash.locator('input[data-testid^="fmt-sub-"]')).toHaveCount(6);
  await expect(cash.getByTestId('fmt-final')).toBeVisible();
  const flows: { rows: FormatRowE2e[]; final: number; more: FormatRowE2e[][]; subtotals: number[][]; kinds: ColumnKindE2e[] } = JSON.parse((await page.getByTestId('e2e-cash-flow').getAttribute('data-expected'))!);
  await fillStatement(page, flows, cash);
  await fits(page, cash);
  await fits(page, page.getByTestId('e2e-cash-flow-marked'));

  // A balance sheet in the form of Schedule III: the note numbers are shown in the solution and typed nowhere.
  const sheet = page.getByTestId('e2e-balance-sheet');
  await expect(page.getByTestId('e2e-balance-sheet-open').locator('input[aria-label*="Note"]')).toHaveCount(0);
  const solved = page.getByTestId('e2e-balance-sheet-marked').getByTestId('format-solution');
  await expect(solved).toContainText('Note No.');
  await expect(solved.getByTestId('solution-note').first()).toHaveText('1');
  await expect(solved.getByTestId('solution-heading').first()).toHaveText('I. EQUITY AND LIABILITIES');
  await expect(solved.getByTestId('solution-subtotal-0')).toContainText('Total');
  await fits(page, sheet);

  // On a laptop the four amounts of a row of the comparative statement stand on the line of its particulars.
  await page.setViewportSize({ width: 1280, height: 800 });
  const [label, amount] = [await open.getByTestId('fmt-rows-label-0').boundingBox(), await open.getByTestId('fmt-rows-amount-0-3').boundingBox()];
  expect(label!.x + label!.width).toBeLessThanOrEqual(amount!.x);
  await fits(page, sample);
});

/** What the test build exposes of a statement that prints figures: the rows say which figures they print. */
type GivenStatementE2e = { rows: FormatRowE2e[]; final: null; more: FormatRowE2e[][]; subtotals: number[][]; kinds: ColumnKindE2e[]; printedSubtotals: boolean[][] };

test('a comparative statement prints the figures of its two years once a row is chosen, and only what is worked out is typed and marked', async ({ page }) => {
  test.setTimeout(240_000);
  await page.setViewportSize({ width: 360, height: 740 });
  await createProfile(page, 'Varun');
  await page.goto('/settings');
  // The panels of the test build take a while to appear.
  const sample = page.getByTestId('e2e-comparative-given');
  await expect(sample).toBeVisible({ timeout: 60_000 });
  const open = page.getByTestId('e2e-comparative-given-open');
  const statement: GivenStatementE2e = JSON.parse((await sample.getAttribute('data-expected'))!);
  const [revenue] = statement.rows;
  expect(revenue.printed).toEqual([true, true, false, false]);
  // The tax is worked out in every column, and every sub-total is added up.
  expect(statement.more[1][0].label).toBe('Tax');
  expect(statement.more[1][0].printed).toBeUndefined();
  expect(statement.printedSubtotals.flat().every((p) => !p)).toBe(true);

  // Before its particulars are chosen a row prints nothing: four boxes, and no figure anywhere.
  await foldData(open);
  await expect(open.locator('[data-given]')).toHaveCount(0);
  await expect(open.getByTestId('fmt-rows-amount-0-0')).toBeVisible();
  await open.getByTestId('fmt-rows-label-0').click();
  await page.getByTestId(`picker-option-${revenue.label}`).click();
  // Then the two years stand in their places as text, in rupees, read as given; they are no boxes to type in.
  for (const c of [0, 1]) {
    const given = open.getByTestId(`fmt-rows-given-0-${c}`);
    await expect(given).toBeVisible();
    await expect(given).toContainText(`₹${(revenue.amounts[c] / 100).toLocaleString('en-IN')}`);
    await expect(given.locator('.sr-only')).toContainText('given:');
    expect(await given.evaluate((el) => el.tagName)).toBe('SPAN');
    await expect(given.locator('input, button, [tabindex]')).toHaveCount(0);
    await expect(open.getByTestId(`fmt-rows-amount-0-${c}`)).toHaveCount(0);
  }
  // The change and its percentage are typed; Enter in the change goes on to the percentage.
  await expect(open.getByTestId('fmt-rows-amount-0-2')).toBeVisible();
  await open.getByTestId('fmt-rows-amount-0-2').fill(typedFigure(revenue.amounts[2], statement.kinds[2]));
  await open.getByTestId('fmt-rows-amount-0-2').press('Enter');
  await expect(open.getByTestId('fmt-rows-amount-0-3')).toBeFocused();
  await fits(page, open);
  await fits(page, sample);

  // In the player: the first statement with only its typed figures filled in is wholly right.
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.getByTestId('e2e-class12-given-play').click();
  const player = page.getByTestId('e2e-class12-given-player');
  await expect(player).toBeVisible({ timeout: 60_000 });
  const question = player.getByTestId('question');
  await expect(question).toHaveAttribute('data-question-type', 'statement');
  const first: GivenStatementE2e = JSON.parse((await question.getAttribute('data-expected'))!);
  const rows = first.rows.length + first.more.flat().length + first.subtotals.length;
  await fillStatement(page, first, question);
  await expect(question.locator('[data-given]')).toHaveCount(2 * (first.rows.length + first.more.flat().length - 1));
  await player.getByTestId('check').click();
  await expect(player.getByTestId('feedback')).toHaveAttribute('data-correct', 'true');
  await expect(question.getByTestId('format-score')).toHaveText(`${rows} of ${rows} rows right`);
  await player.getByTestId('continue').click();
  await expect(player.getByTestId('feedback')).toHaveCount(0);

  // The second with one typed figure wrong, the change of its first row: that row is caught, the rest is right.
  await expect(question).toHaveAttribute('data-question-type', 'statement');
  const second: GivenStatementE2e = JSON.parse((await question.getAttribute('data-expected'))!);
  const slipped = second.rows[0];
  const wrong = { ...second, rows: [{ ...slipped, amounts: slipped.amounts.map((a, c) => (c === 2 ? a + 100000 : a)) }, ...second.rows.slice(1)] };
  await fillStatement(page, wrong, question);
  await player.getByTestId('check').click();
  await expect(player.getByTestId('feedback')).toHaveAttribute('data-correct', 'false');
  await expect(question.getByTestId('format-score')).toHaveText(`${rows - 1} of ${rows} rows right`);
  await expect(question.getByTestId('fmt-yours-0').locator('[data-status="wrongAmount"]')).toHaveCount(1);
  await expect(question.getByTestId('fmt-yours-0').locator('[data-status="wrongAmount"]')).toContainText(slipped.label);
  await player.getByTestId('continue').click();
  await expect(player.getByTestId('feedback')).toHaveCount(0);
  await expect(page.getByTestId('e2e-class12-given-done')).toHaveText('1 of 2 right');
});

test('the mock papers of a Class 12 learner are those of Class 12', async ({ page }) => {
  await withClass12Sample(page);
  await createProfile(page, 'Meera', { courseId: CLASS12 });
  await page.goto('/mock');
  // The full paper of Class 12 needs a topic in every unit: until the course has them it waits, and says so.
  const units = new Set(CLASS12_PACKS.map((p) => class12.topics.find((t) => t.id === p.topicId)!.unit));
  const whole = new Set(class12.topics.filter((t) => topicShown(t.id, {})).map((t) => t.unit)).size === units.size;
  await expect(page.getByTestId(whole ? 'mock-new-full' : 'mock-new-full-waiting')).toBeVisible();
  await expect(page.getByTestId('mock-new-topic')).toBeVisible();
  await page.getByTestId('mock-topic-select').selectOption(SAMPLE_TOPIC);
  await expect(page.getByTestId('mock-new-topic')).toHaveAttribute('href', `/mock/paper?paper=${encodeURIComponent(`topic.${SAMPLE_TOPIC}.1`)}`);
  await expect(page.getByTestId('mock-history-empty')).toBeVisible();
});

/** Goes on through the lesson on screen, a step at a time, until the step shows the block with this test id. */
async function nextLessonStepWith(page: Page, testId: string) {
  // The step on screen first: looked for before the lesson is drawn, the block would be missed and its step skipped.
  await expect(page.getByTestId('lesson-step')).toBeVisible();
  for (let i = 0; i < 30 && (await page.getByTestId(testId).count()) === 0; i++) {
    const at = await page.getByTestId('lesson-step').getAttribute('data-step');
    await page.getByTestId('lesson-next').click();
    await expect(page.getByTestId('lesson-step')).not.toHaveAttribute('data-step', at!);
  }
  await expect(page.getByTestId(testId)).toBeVisible();
}
