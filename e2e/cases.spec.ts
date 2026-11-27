import { expect, test } from '@playwright/test';
import { CLASS11_STAGES as CASE_STAGES } from './helpers';
import { CLASS12, CLASS12_LIVE, createProfile, playSession, readStoredEvents } from './helpers';

// The Case studies screen, on the first stage that has cases (whichever that is). With no such stage there is
// nothing to play, and only the empty screen is checked.
const STAGES = CASE_STAGES.filter((s) => s.cases.length > 0);
const stage = STAGES[0];

const noSidewaysScroll = () => document.documentElement.scrollWidth <= window.innerWidth;

test.beforeEach(async ({ page }) => {
  await createProfile(page, 'Varun');
});

test('the Practice screen and Home lead to the Case studies screen, which lists every stage that has cases', async ({ page }) => {
  await expect(page.getByTestId('quick-cases')).toHaveAttribute('href', '/cases');
  await page.goto('/practice');
  await page.getByTestId('hub-cases').click();
  await expect(page).toHaveURL(/\/cases$/);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Case studies');
  if (STAGES.length === 0) {
    await expect(page.getByTestId('cases-empty')).toBeVisible();
    return;
  }
  for (const s of STAGES) {
    const card = page.getByTestId(`stage-${s.id}`);
    await expect(card).toContainText(s.title);
    await expect(page.getByTestId(`stage-${s.id}-meta`)).toContainText(`${s.cases.length} case stud`);
    // Levels are locked for this learner and nothing is passed, and still every stage and every case can be played.
    await expect(card).toHaveAttribute('data-open', 'true');
    await expect(page.getByTestId(`stage-${s.id}-new`)).toHaveAttribute('href', `/cases/play/${s.id}`);
    await expect(page.getByTestId(`case-${s.cases[0].id}-play`)).toBeVisible();
  }
  await expect(page.getByText('Finish first')).toHaveCount(0);
  await expect(page.getByTestId('cases-mixed')).toBeVisible();
  await page.setViewportSize({ width: 360, height: 740 });
  expect(await page.evaluate(noSidewaysScroll)).toBe(true);

  // A stage plays by its address too, from the first day.
  await page.goto(`/cases/play/${stage.id}`);
  await expect(page.getByTestId('question')).toBeVisible({ timeout: 60_000 });
});

test('a new case is played whole, in order and scored, then counted on the stage', async ({ page }) => {
  test.skip(STAGES.length === 0, 'no stage has a case yet');
  test.setTimeout(120_000);
  await page.goto('/cases');
  await expect(page.getByTestId(`stage-${stage.id}`)).toHaveAttribute('data-open', 'true');
  await expect(page.getByTestId(`stage-${stage.id}-meta`)).toContainText('none played yet');

  await page.getByTestId(`stage-${stage.id}-new`).click();
  await expect(page).toHaveURL(new RegExp(`/cases/play/${stage.id}$`));
  const first = stage.cases[0];
  const ids: string[] = [];
  const question = page.getByTestId('question');
  await expect(question).toBeVisible();
  // The case is above the question, and there is no "similar question" in a case.
  await expect(question.getByTestId('case')).toHaveAttribute('data-open', 'true');
  const answered = await playSession(page, { onQuestion: (id) => ids.push(id) });
  expect(answered).toBe(first.parts.length);
  // Every question of the one case, in its own order, all from one seed outside the range of the levels.
  const seed = Number(ids[0].split(':').at(-1));
  expect(seed).toBeGreaterThanOrEqual(1_000_000_000);
  expect(ids).toEqual(first.parts.map((_, i) => `gen:${first.id}~${i + 1}:${first.version}:${seed}`));
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Case study complete');
  await expect(page.getByTestId('results-score')).toHaveText(`${answered} of ${answered} correct`);
  await expect(page.getByTestId('results-retry')).toHaveText('New case');

  const stored = await readStoredEvents(page);
  expect(stored.sessionResults.map((r) => r.kind)).toEqual(['case']);
  // (The store hands the attempts back by id, not by time.)
  expect(stored.attempts.map((a) => a.questionId).sort()).toEqual([...ids].sort());
  expect(stored.attempts.every((a) => a.topicId === stage.topicId)).toBe(true);

  await page.getByTestId('results-cases').click();
  await expect(page).toHaveURL(/\/cases$/);
  await expect(page.getByTestId(`stage-${stage.id}-meta`)).toContainText('1 played · best score 100%');

  // A particular case can be chosen by its card, which shows its title, the kinds of its questions and the opening of
  // a sample case; it comes with new figures.
  const chosen = stage.cases.at(-1)!;
  const card = page.getByTestId(`case-${chosen.id}`);
  await expect(card).toContainText(chosen.title);
  await expect(card).toContainText('Case study');
  await expect(page.getByTestId(`case-${chosen.id}-sample`)).toHaveText(/^“.+”$/, { timeout: 30_000 });
  await expect(page.getByTestId(`case-${stage.cases[0].id}-best`)).toHaveText('Best 100%');
  await page.getByTestId(`case-${chosen.id}-play`).click();
  await expect(question).toBeVisible();
  const again = (await question.getAttribute('data-question-id'))!;
  expect(again.startsWith(`gen:${chosen.id}~1:`)).toBe(true);
  expect(Number(again.split(':').at(-1))).toBeGreaterThan(seed);
  await page.setViewportSize({ width: 360, height: 740 });
  expect(await page.evaluate(noSidewaysScroll)).toBe(true);
});

test('Mixed cases plays a case from any stage, for a learner who has passed nothing', async ({ page }) => {
  test.skip(STAGES.length === 0, 'no stage has a case yet');
  await page.goto('/cases');
  await page.getByTestId('cases-mixed').click();
  await expect(page).toHaveURL(/\/cases\/play\/mixed$/);
  const id = (await page.getByTestId('question').getAttribute('data-question-id'))!;
  // No stage has been played from here, so the stages begin with the first, and the stage with its first case.
  expect(id.startsWith(`gen:${stage.cases[0].id}~1:`)).toBe(true);
});

test('the endless mix of cases plays case after case of every stage, in the Playground', async ({ page }) => {
  test.skip(STAGES.length === 0, 'no stage has a case yet');
  test.setTimeout(120_000);
  const allCases = STAGES.flatMap((s) => s.cases.map((c) => c.id));
  await page.goto('/cases');
  await page.getByTestId('cases-endless').click();
  await expect(page).toHaveURL(/\/playground\?mix=/);
  const question = page.getByTestId('question');
  await expect(question).toBeVisible({ timeout: 60_000 });
  const firstCase = (await question.getAttribute('data-question-id'))!.split(':')[1].split('~')[0];
  expect(allCases).toContain(firstCase);
  // "Another case" leaves this one for a new case, with a new seed.
  await page.getByTestId('pg-another').click();
  await expect(question).not.toHaveAttribute('data-question-id', new RegExp(`^gen:${firstCase}~`));
  const next = (await question.getAttribute('data-question-id'))!;
  expect(next).toMatch(/~1:/);
  expect(allCases.some((c) => next.startsWith(`gen:${c}~1:`))).toBe(true);
});

test('Admission cases are found under Admission: the stages name the topics of their cases, and one topic can be shown', async ({ page }) => {
  test.skip(!CLASS12_LIVE, 'needs Class 12');
  await page.goto('/settings');
  await page.getByTestId(`course-${CLASS12}`).click();
  await expect(page.getByTestId(`course-${CLASS12}`)).toHaveAttribute('aria-pressed', 'true');
  await page.goto('/topics/admission-of-a-partner');
  await expect(page.getByTestId('topic-cases')).toHaveAttribute('href', '/cases?topic=admission-of-a-partner');
  await page.getByTestId('topic-cases').click();
  await expect(page).toHaveURL(/\/cases\?topic=admission-of-a-partner$/);
  await expect(page.getByTestId('cases-topic-admission-of-a-partner')).toHaveAttribute('aria-pressed', 'true');
  // Every case shown is tagged Admission; the one about admission in "A firm that changes its partners" is there,
  // and the stage is labelled by its cases' topics, not only by Retirement (the topic after which it opens).
  const tags = page.locator('[data-testid$="-topics"][data-testid^="case-"]');
  await expect(tags.first()).toBeVisible();
  for (const tag of await tags.all()) await expect(tag).toContainText('Admission of a Partner');
  await expect(page.getByTestId('case-case-recon-chain-admission')).toBeVisible();
  await expect(page.getByTestId('case-case-recon-retirement-due')).toHaveCount(0);
  await expect(page.getByTestId('stage-reconstitution-topics')).not.toHaveText('Retirement and Death of a Partner');
  // Every topic again.
  await page.getByTestId('cases-topic-all').click();
  await expect(page).toHaveURL(/\/cases$/);
  await expect(page.getByTestId('case-case-recon-retirement-due')).toBeVisible();
});
