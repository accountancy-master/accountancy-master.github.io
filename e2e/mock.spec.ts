import { expect, test, type Page } from '@playwright/test';
import { buildPaper, paperSteps } from '../src/learning/mockPaper';
import { BLUEPRINTS, questionCount } from '../src/learning/paperBlueprints';
import { createProfile, enterAnswer, readStoredEvents, wrongMcqOption } from './helpers';

// A topic test is sat here, never a full paper: the generator and the marking of every kind are unit-tested. The paper
// is a pure function of its kind, topic and number, so the test knows every question it will be asked.
const TOPIC = 'ledger';
const KEY = `topic.${TOPIC}.1`;
const PAPER = buildPaper({ kind: 'topic', topicId: TOPIC, number: 1 });
const STEPS = paperSteps(PAPER);
const COUNT = STEPS.length;
/** The first question that is typed, not chosen: a 3-mark one. */
const TYPED = STEPS.findIndex((s) => s.question.type === 'numeric');

const noSidewaysScroll = (page: Page) => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);
const question = (page: Page) => page.getByTestId('question');

/** Chooses a wrong answer to the choice question on screen. */
async function enterWrongChoice(page: Page) {
  const q = question(page);
  if ((await q.getAttribute('data-question-type')) === 'mcq') {
    await page.getByTestId(`mcq-option-${await wrongMcqOption(page)}`).click();
  } else {
    const expected = JSON.parse((await q.getAttribute('data-expected'))!);
    await page.getByTestId(expected ? 'tf-false' : 'tf-true').click();
  }
}

/** The learner's mock papers as the device holds them. */
async function storedPapers(page: Page): Promise<{ paper: string; answers: Record<string, unknown>; flagged: string[]; submittedAt?: number }[]> {
  return page.evaluate(
    () =>
      new Promise((resolve, reject) => {
        const open = indexedDB.open('accountancy-master');
        open.onerror = () => reject(open.error);
        open.onsuccess = () => {
          const db = open.result;
          const req = db.transaction('mockPapers', 'readonly').objectStore('mockPapers').getAll();
          req.onsuccess = () => {
            db.close();
            resolve(req.result);
          };
          req.onerror = () => reject(req.error);
        };
      }),
  );
}

test.beforeEach(async ({ page }) => {
  await createProfile(page, 'Varun');
});

test('the Practice screen and Home lead to Mock papers, which offers the three kinds of paper', async ({ page }) => {
  await expect(page.getByTestId('quick-mock')).toHaveAttribute('href', '/mock');
  await page.goto('/practice');
  await page.getByTestId('hub-mock').click();
  await expect(page).toHaveURL(/\/mock$/);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Mock papers');
  await expect(page.getByTestId('mock-kind-full-meta')).toHaveText(`80 marks · 3 hours · ${questionCount(BLUEPRINTS.full)} questions`);
  await expect(page.getByTestId('mock-kind-half-meta')).toHaveText('40 marks · 1 hour 30 minutes · 18 questions');
  await expect(page.getByTestId('mock-kind-topic-meta')).toHaveText('20 marks · 40 minutes · 10 questions');
  await expect(page.getByTestId('mock-new-full')).toHaveAttribute('href', '/mock/paper?paper=full.1');
  await expect(page.getByTestId('mock-new-half')).toHaveAttribute('href', '/mock/paper?paper=half.1');
  await expect(page.getByTestId('mock-history-empty')).toBeVisible();
  await expect(page.getByTestId('mock-running')).toHaveCount(0);
  await page.setViewportSize({ width: 360, height: 740 });
  expect(await noSidewaysScroll(page)).toBe(true);

  // A paper that does not exist, or is not the next one, cannot be opened by its address.
  await page.goto('/mock/paper?paper=full.7');
  await expect(page.getByTestId('mock-closed')).toBeVisible();
  await page.goto('/mock/paper?paper=nonsense');
  await expect(page.getByTestId('mock-unknown')).toBeVisible();
});

test('a topic test is sat from the instructions to the marked script, across a reload, and is kept in the history', async ({ page }) => {
  test.setTimeout(120_000);
  await page.setViewportSize({ width: 360, height: 740 });
  await page.goto('/mock');
  await page.getByTestId('mock-topic-select').selectOption(TOPIC);
  await expect(page.getByTestId('mock-new-topic')).toHaveAttribute('href', `/mock/paper?paper=${KEY}`);
  await page.getByTestId('mock-new-topic').click();

  // The instructions: marks, time, questions and the rules. Nothing is on the clock yet.
  const instructions = page.getByTestId('mock-instructions');
  await expect(instructions.getByRole('heading', { level: 1 })).toHaveText(PAPER.title);
  await expect(page.getByTestId('mock-instructions-summary')).toHaveText(`20 marks · 40 minutes · ${PAPER.entries.length} questions`);
  await expect(page.getByTestId('mock-rules')).toContainText('cannot be paused');
  await expect(page.getByTestId('mock-rules')).toContainText('no hints');
  expect(await noSidewaysScroll(page)).toBe(true);
  expect(await storedPapers(page)).toEqual([]);

  await page.getByTestId('mock-start').click();
  await expect(page.getByTestId('exam')).toBeVisible();
  const clock = page.getByTestId('exam-clock');
  await expect(clock).toHaveText(/^(39:5\d|40:00)$/);
  await expect(clock).toBeInViewport();
  // Nothing that could give an answer away: no hint, no check, no answer shown, no feedback.
  for (const id of ['hint', 'check', 'reveal', 'feedback', 'try-similar']) await expect(page.getByTestId(id)).toHaveCount(0);

  // Question 1: a wrong answer for now. Nothing says so.
  await expect(question(page)).toHaveAttribute('data-question-id', STEPS[0].question.id);
  await expect(page.getByTestId('exam-position')).toContainText(`Question 1 of ${PAPER.entries.length}`);
  await enterWrongChoice(page);
  await expect(page.getByTestId('feedback')).toHaveCount(0);
  await page.getByTestId('exam-next').click();

  // Question 2: wrong, and left that way.
  await expect(question(page)).toHaveAttribute('data-question-id', STEPS[1].question.id);
  await enterWrongChoice(page);
  await page.getByTestId('exam-next').click();

  // Question 3: marked for review, not answered.
  await expect(question(page)).toHaveAttribute('data-question-id', STEPS[2].question.id);
  await expect(page.getByTestId('exam-flag')).toHaveAttribute('aria-pressed', 'false');
  await page.getByTestId('exam-flag').click();
  await expect(page.getByTestId('exam-flag')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByTestId('exam-flagged')).toBeVisible();

  // The question list shows what is answered and what is marked, fits the phone, and jumps anywhere.
  await page.getByTestId('exam-list-toggle').click();
  await expect(page.getByTestId('exam-list-summary')).toHaveText(`2 answered · ${COUNT - 2} not answered · 1 marked for review`);
  await expect(page.locator('[data-testid^="exam-jump-"]')).toHaveCount(COUNT);
  await expect(page.getByTestId('exam-jump-1')).toHaveAttribute('data-answered', 'true');
  await expect(page.getByTestId('exam-jump-3')).toHaveAttribute('data-answered', 'false');
  await expect(page.getByTestId('exam-jump-3')).toHaveAttribute('data-flagged', 'true');
  await expect(page.getByTestId('exam-jump-3')).toHaveAttribute('aria-current', 'step');
  await expect(page.getByTestId('exam-jump-3')).toHaveAccessibleName('Question 3, not answered, marked for review');
  expect(await noSidewaysScroll(page)).toBe(true);
  await expect(clock).toBeInViewport();
  const jump = STEPS[TYPED].label;
  await page.getByTestId(`exam-jump-${jump}`).click();
  await expect(page.getByTestId('exam-list')).toHaveCount(0);
  await expect(question(page)).toHaveAttribute('data-question-id', STEPS[TYPED].question.id);
  await expect(page.getByTestId('exam-position')).toContainText(`Question ${jump} of`);
  await expect(page.getByTestId('exam-position')).toContainText('3 marks');
  await enterAnswer(page);
  const typed = await page.getByTestId('numeric-input').inputValue();
  expect(typed).not.toBe('');
  expect(await noSidewaysScroll(page)).toBe(true);

  // Everything is on the device as it was entered.
  await expect.poll(async () => Object.keys((await storedPapers(page))[0].answers).length).toBe(3);
  expect((await storedPapers(page))[0]).toMatchObject({ paper: KEY, flagged: [STEPS[2].question.id] });
  expect((await readStoredEvents(page)).attempts).toEqual([]);

  // A reload comes back to the same question of the same paper, with its answer, and the clock has not stopped.
  await page.reload();
  await expect(page.getByTestId('exam')).toBeVisible();
  await expect(question(page)).toHaveAttribute('data-question-id', STEPS[TYPED].question.id);
  await expect(page.getByTestId('numeric-input')).toHaveValue(typed);
  await expect(clock).toHaveText(/^39:\d\d$/);

  // The Mock papers screen offers to resume, and no other paper can be started meanwhile.
  await page.goto('/mock');
  await expect(page.getByTestId('mock-running')).toContainText(PAPER.title);
  await expect(page.getByTestId('mock-running-left')).toContainText(/Time left: 3\d:\d\d/);
  await expect(page.getByTestId('mock-new-full')).toHaveCount(0);
  await expect(page.getByTestId('mock-new-full-blocked')).toBeVisible();
  await page.goto('/mock/paper?paper=full.1');
  await expect(page.getByTestId('mock-busy')).toBeVisible();
  await page.getByTestId('mock-busy-resume').click();
  await expect(page.getByTestId('exam')).toBeVisible();

  // An answer can be changed until the paper is submitted: question 1 is put right.
  await page.getByTestId('exam-list-toggle').click();
  await expect(page.getByTestId('exam-list-summary')).toHaveText(`3 answered · ${COUNT - 3} not answered · 1 marked for review`);
  await page.getByTestId('exam-jump-1').click();
  await expect(question(page)).toHaveAttribute('data-question-id', STEPS[0].question.id);
  await expect(question(page).locator('[aria-pressed="true"]')).toHaveCount(1);
  await enterAnswer(page);
  // Previous and Next move one question at a time.
  await expect(page.getByTestId('exam-previous')).toBeDisabled();
  await page.getByTestId('exam-next').click();
  await expect(question(page)).toHaveAttribute('data-question-id', STEPS[1].question.id);
  await page.getByTestId('exam-previous').click();
  await expect(question(page)).toHaveAttribute('data-question-id', STEPS[0].question.id);

  // Submitting asks first, and says how much is unanswered.
  await page.getByTestId('exam-submit').click();
  await expect(page.getByTestId('exam-confirm-text')).toContainText(`${COUNT - 3} of ${COUNT} questions are not answered`);
  await page.getByTestId('exam-confirm-no').click();
  await expect(page.getByTestId('exam-confirm')).toHaveCount(0);
  await page.getByTestId('exam-submit').click();
  await page.getByTestId('exam-confirm-yes').click();

  // The result: question 1 (1 mark) and the typed question (3 marks) are right, question 2 is wrong.
  const result = page.getByTestId('mock-result');
  await expect(result).toBeVisible();
  await expect(result.getByRole('heading', { level: 1 })).toHaveText(PAPER.title);
  await expect(page.getByTestId('mock-marks')).toHaveText('4 / 20');
  await expect(page.getByTestId('mock-percent')).toHaveText('20%');
  await expect(page.getByTestId('mock-answered')).toHaveText(`3 of ${COUNT}`);
  await expect(page.getByTestId('mock-right')).toHaveText(`2 of ${COUNT}`);
  await expect(page.getByTestId('mock-time')).toHaveText(/minute/);
  await expect(page.getByTestId('mock-xp')).toHaveText(/^\+\d+ XP$/);
  await expect(page.getByTestId('mock-bonus-missed')).toBeVisible();
  await expect(page.getByTestId('mock-ran-out')).toHaveCount(0);
  await expect(page.getByTestId(`mock-by-topic-${TOPIC}`)).toContainText('4 / 20');
  await expect(page.getByTestId('mock-by-unit')).toContainText('4 / 20');
  await expect(page.getByTestId('mock-by-part')).toHaveCount(0);
  await expect(page.getByTestId(`mock-practise-${TOPIC}`)).toHaveAttribute('href', `/practice/topic/${TOPIC}`);
  expect(await noSidewaysScroll(page)).toBe(true);

  // The marked script: every question with the learner's answer, the right one, the working and the marks.
  await expect(page.locator('[data-testid^="script-entry-"]')).toHaveCount(PAPER.entries.length);
  await expect(page.getByTestId('script-step-1')).toHaveAttribute('data-correct', 'true');
  await expect(page.getByTestId('script-marks-1')).toHaveText('1 / 1 mark');
  await expect(page.getByTestId('script-step-2')).toHaveAttribute('data-correct', 'false');
  await expect(page.getByTestId('script-step-2')).toHaveAttribute('data-answered', 'true');
  await expect(page.getByTestId('script-verdict-2')).toHaveText('Not right');
  await expect(page.getByTestId('script-step-2')).toContainText('Right answer:');
  await expect(page.getByTestId('script-step-2')).toContainText(STEPS[1].question.explanation);
  await expect(page.getByTestId('script-marks-2')).toHaveText('0 / 1 mark');
  await expect(page.getByTestId('script-step-3')).toHaveAttribute('data-answered', 'false');
  await expect(page.getByTestId('script-verdict-3')).toHaveText('Not answered');
  await expect(page.getByTestId(`script-marks-${jump}`)).toHaveText('3 / 3 marks');
  await expect(page.getByTestId(`script-step-${jump}`).getByTestId('numeric-input')).toHaveValue(typed);
  await expect(page.getByTestId(`script-step-${jump}`).getByTestId('working')).toBeVisible();

  // Recorded like any other answers: three attempts (the unanswered questions leave none) and one session result.
  const stored = await readStoredEvents(page);
  expect(stored.attempts.map((a) => a.questionId).sort()).toEqual([STEPS[0].question.id, STEPS[1].question.id, STEPS[TYPED].question.id].sort());
  expect(stored.sessionResults.map((r) => r.kind)).toEqual(['mock']);
  expect((await storedPapers(page))[0].submittedAt).toBeGreaterThan(0);

  // The history has the paper, and opens its marked script again; the next topic test is paper 2.
  await page.getByTestId('mock-back').click();
  await expect(page).toHaveURL(/\/mock$/);
  await expect(page.getByTestId('mock-running')).toHaveCount(0);
  await expect(page.getByTestId(`mock-history-${KEY}`)).toContainText(PAPER.title);
  await expect(page.getByTestId(`mock-history-${KEY}-marks`)).toHaveText('4 / 20 · 20%');
  await page.getByTestId('mock-topic-select').selectOption(TOPIC);
  await expect(page.getByTestId('mock-new-topic')).toHaveAttribute('href', `/mock/paper?paper=topic.${TOPIC}.2`);
  await page.getByTestId(`mock-history-${KEY}`).click();
  await expect(page.getByTestId('mock-marks')).toHaveText('4 / 20');
  await expect(page.getByTestId('script-verdict-2')).toHaveText('Not right');
  await expect(page.getByTestId('exam')).toHaveCount(0);

  // The wrong answer is a mistake to review; the questions left out are not.
  await page.goto('/mistakes');
  await expect(page.getByTestId('mistake-item')).toHaveCount(1);
  await expect(page.getByTestId('mistake-item')).toHaveAttribute('data-question-id', STEPS[1].question.id);
});

test('a paper that runs out of time is submitted as it stands', async ({ page }) => {
  test.setTimeout(60_000);
  // The test build can shorten the clock of the next paper.
  await page.goto('/settings');
  await page.getByTestId('e2e-mock-seconds').fill('8');
  await page.getByTestId('e2e-mock-seconds-apply').click();
  await expect(page.getByTestId('e2e-mock-seconds-done')).toBeVisible();

  await page.goto(`/mock/paper?paper=${KEY}`);
  // The instructions still say what the real paper allows.
  await expect(page.getByTestId('mock-instructions-summary')).toContainText('40 minutes');
  await page.getByTestId('mock-start').click();
  await expect(page.getByTestId('exam-clock')).toHaveText(/^0:0\d$/);
  await expect(question(page)).toHaveAttribute('data-question-id', STEPS[0].question.id);
  await enterAnswer(page);
  // Nobody presses Submit.
  const result = page.getByTestId('mock-result');
  await expect(result).toBeVisible({ timeout: 20_000 });
  await expect(page.getByTestId('mock-ran-out')).toBeVisible();
  await expect(page.getByTestId('mock-marks')).toHaveText('1 / 20');
  await expect(page.getByTestId('script-step-1')).toHaveAttribute('data-correct', 'true');
  expect((await readStoredEvents(page)).attempts.map((a) => a.questionId)).toEqual([STEPS[0].question.id]);
  await page.goto('/mock');
  await expect(page.getByTestId(`mock-history-${KEY}-marks`)).toHaveText('1 / 20 · 5%');
});
