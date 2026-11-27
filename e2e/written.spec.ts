import { expect, test, type Page } from '@playwright/test';
import WRITTEN_11 from '../src/content/written/cbse11';
import WRITTEN_12 from '../src/content/written/cbse12';
import { suggestedPoints } from '../src/content/written/keywords';
import { FORM_LABEL, filterWritten, marksOutOf, pointsAsked, writtenMarks } from '../src/content/written/practice';
import type { WrittenQuestion } from '../src/content/written/types';
import { CLASS12, createProfile } from './helpers';

// Written answers (/written, /written/<topic>, /written/rewrite), read from the question files as they stand: each test
// takes the first question of a topic that has one (Provisions and Reserves in Class 11, Goodwill in Class 12, or else
// the first topic with any), and is skipped while a class has none.

const firstOf = (bank: readonly WrittenQuestion[], topicId: string): WrittenQuestion | undefined => bank.find((q) => q.topicId === topicId) ?? bank[0];
const Q11 = firstOf(WRITTEN_11, 'provisions-and-reserves');
const Q12 = firstOf(WRITTEN_12, 'goodwill');

const noSidewaysScroll = (page: Page) => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);

/** An answer that names one key word of each of the points given, and nothing of the others. */
const answerWith = (q: WrittenQuestion, points: number[]) => points.map((i) => `This answer says ${q.points[i].keywords[0]}.`).join('\n');

test('a Class 11 learner writes an answer, sees the model answer, ticks the points and gets the marks; below full marks it waits in Mistakes', async ({ page }) => {
  test.skip(!Q11, 'Class 11 has no written questions yet');
  const q = Q11!;
  const topicQuestions = WRITTEN_11.filter((x) => x.topicId === q.topicId);
  await createProfile(page, 'Varun');

  // The course-wide page lists the topic with its count.
  await page.goto('/written');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Written answers');
  await expect(page.getByTestId(`written-topic-${q.topicId}`)).toContainText(`${topicQuestions.length} ${topicQuestions.length === 1 ? 'question' : 'questions'}`);
  await expect(page.getByTestId('written-count-new')).toHaveText(`Not written yet: ${WRITTEN_11.length}`);
  await page.getByTestId(`written-start-${q.topicId}`).click();

  // The question as the board sets it, and hints in two steps.
  const step = page.getByTestId('written-step');
  await expect(step).toHaveAttribute('data-question', topicQuestions[0].id);
  await expect(page.getByTestId('written-prompt')).toHaveText(q.prompt);
  await expect(page.getByTestId('written-form')).toHaveText(FORM_LABEL[q.form]);
  await expect(page.getByTestId('written-any')).toHaveText(pointsAsked(q));
  await page.getByTestId('written-hint').click();
  await expect(page.getByTestId('written-hint-1')).toContainText(q.hints[0]);
  await page.getByTestId('written-hint').click();
  await expect(page.getByTestId('written-hint-2')).toContainText(q.hints[1]);
  await expect(page.getByTestId('written-hint')).toHaveCount(0);

  // An answer that makes the first point only: that point comes ticked, marked as suggested.
  await expect(page.getByTestId('written-check')).toBeDisabled();
  const typed = answerWith(q, [0]);
  await page.getByTestId('written-text').fill(typed);
  await page.getByTestId('written-check').click();
  const suggested = suggestedPoints(q, typed);
  expect(suggested).toContain(0);
  await expect(page.getByTestId('written-yours-text')).toHaveText(typed);
  if (q.table) await expect(page.getByTestId('written-table').locator('tbody tr')).toHaveCount(q.table.rows.length);
  else await expect(page.getByTestId('written-answer')).toBeVisible();
  for (const [i] of q.points.entries()) {
    await expect(page.getByTestId(`written-tick-${i}`)).toBeChecked({ checked: suggested.includes(i) });
  }
  await expect(page.getByTestId('written-point-0').getByTestId('written-suggested')).toHaveText('Suggested from your answer');
  // Unticked and ticked again; then only the first point counts.
  await page.getByTestId('written-tick-0').uncheck();
  await expect(page.getByTestId('written-tally')).toContainText(`Ticked ${suggested.length - 1}`);
  await page.getByTestId('written-tick-0').check();
  for (const i of suggested.filter((i) => i !== 0)) await page.getByTestId(`written-tick-${i}`).uncheck();
  await page.getByTestId('written-confirm').click();

  const marks = writtenMarks(q, 1);
  await expect(page.getByTestId('written-result-marks')).toContainText(marksOutOf(marks, q.marks));
  await expect(page.getByTestId('written-tip')).toContainText(q.markingTip);
  if (marks < q.marks) {
    await expect(page.getByTestId('written-missed')).toContainText(q.points[1].text);
    await expect(page.getByTestId('written-status')).toContainText('rewrite');

    // Kept on the device: after a reload the question waits in Mistakes, and its link opens it first.
    await page.goto('/mistakes');
    await page.reload();
    const item = page.getByTestId('mistakes-written-item');
    await expect(item).toHaveCount(1);
    await expect(item).toContainText(q.prompt);
    await expect(item).toContainText(marksOutOf(marks, q.marks));
    await item.getByTestId('mistakes-written-rewrite').click();
    await expect(step).toHaveAttribute('data-question', q.id);
    await expect(page.getByTestId('written-before')).toContainText(marksOutOf(marks, q.marks));

    // Written on paper this time: nothing is suggested; every point ticked is full marks, which clears it.
    await page.getByTestId('written-paper').click();
    await expect(page.getByTestId('written-suggested')).toHaveCount(0);
    for (const [i] of q.points.entries()) await expect(page.getByTestId(`written-tick-${i}`)).not.toBeChecked();
    for (let i = 0; i < q.pointsNeeded; i++) await page.getByTestId(`written-tick-${i}`).check();
    await page.getByTestId('written-confirm').click();
    await expect(page.getByTestId('written-result-marks')).toContainText(marksOutOf(q.marks, q.marks));
    // "Last time" stays the time before, not the answer just marked.
    await expect(page.getByTestId('written-before')).toContainText(marksOutOf(marks, q.marks));
    await expect(page.getByTestId('written-missed')).toHaveCount(0);
    await page.goto('/mistakes');
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Mistakes');
    await expect(page.getByTestId('mistakes-written')).toHaveCount(0);
    await page.goto('/written');
    await expect(page.getByTestId('written-count-full')).toHaveText('Full marks: 1');
  }
});

test('a Class 12 learner opens the written answers from a topic page, and a practice ends with a summary', async ({ page }) => {
  test.skip(!Q12, 'Class 12 has no written questions yet');
  const q = Q12!;
  const topicQuestions = WRITTEN_12.filter((x) => x.topicId === q.topicId);
  await createProfile(page, 'Meera', { courseId: CLASS12 });
  await page.goto(`/topics/${q.topicId}`);
  await expect(page.getByTestId('topic-written')).toContainText(`(${topicQuestions.length})`);
  await page.getByTestId('topic-written').click();
  await expect(page).toHaveURL(new RegExp(`/written/${q.topicId}$`));

  // Every question on paper, nothing ticked: no marks, and every one is to rewrite.
  for (const [i, x] of topicQuestions.entries()) {
    await expect(page.getByTestId('written-progress')).toHaveText(`Question ${i + 1} of ${topicQuestions.length}`);
    await expect(page.getByTestId('written-step')).toHaveAttribute('data-question', x.id);
    await page.getByTestId('written-paper').click();
    await page.getByTestId('written-confirm').click();
    await expect(page.getByTestId('written-result-marks')).toContainText(marksOutOf(0, x.marks));
    await page.getByTestId('written-next').click();
  }
  const total = topicQuestions.reduce((n, x) => n + x.marks, 0);
  await expect(page.getByTestId('written-done')).toBeVisible();
  await expect(page.getByTestId('written-done-marks')).toContainText(marksOutOf(0, total));

  // The rewrite list takes them all.
  await page.goto('/written');
  await expect(page.getByTestId('written-count-rewrite')).toHaveText(`To rewrite: ${topicQuestions.length}`);
  await page.getByTestId('written-rewrite-all').click();
  await expect(page).toHaveURL(/\/written\/rewrite$/);
  await expect(page.getByTestId('written-progress')).toHaveText(`Question 1 of ${topicQuestions.length}`);
});

test('the list narrows by form and marks', async ({ page }) => {
  test.skip(WRITTEN_11.length === 0, 'Class 11 has no written questions yet');
  await createProfile(page, 'Varun');
  await page.goto('/written');
  const form = WRITTEN_11[0].form;
  await page.getByTestId(`written-form-filter-${form}`).click();
  await expect(page.getByTestId('written-showing')).toHaveText(`${filterWritten(WRITTEN_11, { form, marks: 0 }).length} of ${WRITTEN_11.length} questions`);
  const marks = WRITTEN_11[0].marks;
  await page.getByTestId(`written-marks-filter-${marks}`).click();
  const both = filterWritten(WRITTEN_11, { form, marks });
  await expect(page.getByTestId('written-showing')).toHaveText(`${both.length} of ${WRITTEN_11.length} questions`);
  // A practice from there takes the filter with it.
  const topic = both[0].topicId;
  await page.getByTestId(`written-start-${topic}`).click();
  await expect(page).toHaveURL(new RegExp(`/written/${topic}\\?form=${form}&marks=${marks}$`));
  await expect(page.getByTestId('written-progress')).toHaveText(`Question 1 of ${both.filter((q) => q.topicId === topic).length}`);
});

test('the written answer screens fit a 360 px phone', async ({ page }) => {
  test.skip(!Q11, 'Class 11 has no written questions yet');
  const q = WRITTEN_11.find((x) => x.table) ?? Q11!;
  await page.setViewportSize({ width: 360, height: 740 });
  await createProfile(page, 'Varun');
  await page.goto('/written');
  await expect(page.getByTestId('written-topics')).toBeVisible();
  expect(await noSidewaysScroll(page)).toBe(true);
  await page.goto(`/written/${q.topicId}?q=${q.id}`);
  await expect(page.getByTestId('written-step')).toHaveAttribute('data-question', q.id);
  expect(await noSidewaysScroll(page)).toBe(true);
  await page.getByTestId('written-text').fill(`${answerWith(q, [0])} Averyveryverylongwordthatdoesnotbreakanywhereatallinthisanswer`);
  await page.getByTestId('written-check').click();
  await expect(page.getByTestId('written-model')).toBeVisible();
  expect(await noSidewaysScroll(page)).toBe(true);
  // Nothing ticked: no marks, so the question waits in Mistakes.
  for (const [i] of q.points.entries()) await page.getByTestId(`written-tick-${i}`).uncheck();
  await page.getByTestId('written-confirm').click();
  await expect(page.getByTestId('written-result')).toBeVisible();
  expect(await noSidewaysScroll(page)).toBe(true);
  await page.goto('/mistakes');
  await expect(page.getByTestId('mistakes-written')).toBeVisible();
  expect(await noSidewaysScroll(page)).toBe(true);
});
