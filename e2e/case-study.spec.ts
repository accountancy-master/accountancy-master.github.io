import { expect, test, type Locator, type Page } from '@playwright/test';
import { CLASS11_STAGES as CASE_STAGES } from './helpers';
import { generateCase } from '../src/generators/engine';
import { SAMPLE_CASE } from '../src/testing/sampleCase';
import { answerCurrentQuestion, createProfile, packOf, readStoredEvents, seedPassedLevels, showAnswer } from './helpers';

const whiteSpace = (el: Locator) => el.evaluate((e) => getComputedStyle(e).whiteSpace);
const figures = (el: Locator) => el.evaluate((e) => getComputedStyle(e).fontVariantNumeric);
const fits = (el: Locator) => el.evaluate((e) => e.scrollWidth <= e.clientWidth);
const noSidewaysScroll = (page: Page) => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);
const escaped = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// ---------------------------------------------------------------------------------------------------------------
// The sample case. The Settings page of the test build has the sample case study (fourteen lines, the first one
// long) on the real Mistakes card and in the real player, so how a case is shown and played is tested whatever
// cases the stages hold.
// ---------------------------------------------------------------------------------------------------------------

test.describe('the sample case', () => {
  const QUESTIONS = generateCase(SAMPLE_CASE, 7);
  const LINES = QUESTIONS[0].context!.split('\n');

  test.beforeEach(async ({ page }) => {
    await createProfile(page, 'Varun');
    await page.setViewportSize({ width: 360, height: 740 });
    await page.goto('/settings');
    await expect(page.getByTestId('e2e-case')).toBeVisible();
  });

  test('the Mistakes card has the case above the prompt, folded until it is opened', async ({ page }) => {
    const card = page.getByTestId('e2e-case-mistake');
    const panel = card.getByTestId('case');
    const text = panel.getByTestId('case-text');
    await expect(panel).toHaveAttribute('data-open', 'false');
    await expect(panel.getByTestId('case-toggle')).toHaveAttribute('aria-expanded', 'false');
    await expect(panel.getByTestId('case-toggle')).toContainText('Case');
    await expect(text).toBeHidden();
    await expect(card.getByTestId('prompt-head')).toHaveText(QUESTIONS[1].prompt);
    // The panel comes before the question it belongs to.
    const top = async (el: Locator) => (await el.boundingBox())!.y;
    expect(await top(panel)).toBeLessThan(await top(card.getByTestId('mistake-prompt')));

    await panel.getByTestId('case-toggle').click();
    await expect(panel).toHaveAttribute('data-open', 'true');
    await expect(text).toBeVisible();
    expect(LINES).toHaveLength(14);
    // innerText follows the rendering: the fourteen lines of the case are fourteen lines on screen.
    expect((await text.innerText()).split('\n')).toEqual(LINES);
    expect(await whiteSpace(text)).toBe('pre-line');
    expect(await figures(text)).toContain('tabular-nums');
    // At 360 px a long line wraps: nothing scrolls sideways, in the panel or on the page.
    expect(await fits(text)).toBe(true);
    expect(await noSidewaysScroll(page)).toBe(true);
    expect(parseFloat(await text.evaluate((e) => getComputedStyle(e).fontSize))).toBeGreaterThanOrEqual(14);

    await panel.getByTestId('case-toggle').click();
    await expect(text).toBeHidden();
  });

  test('a case is played whole and in order, its case above every question and folded or open as it was left', async ({ page }) => {
    test.setTimeout(60_000);
    await page.getByTestId('e2e-case-play').click();
    const player = page.getByTestId('e2e-case-player');
    const q = player.getByTestId('question');
    const panel = q.getByTestId('case');
    const text = panel.getByTestId('case-text');
    const feedback = player.getByTestId('feedback');
    const next = async () => {
      await player.getByTestId('continue').click();
      await expect(feedback).toHaveCount(0);
    };

    // Question 1: the case is open, complete, inside the question and above its prompt.
    await expect(q).toHaveAttribute('data-question-id', QUESTIONS[0].id);
    await expect(panel).toHaveAttribute('data-open', 'true');
    await expect(panel.getByTestId('case-toggle')).toHaveAttribute('aria-expanded', 'true');
    expect((await text.innerText()).split('\n')).toEqual(LINES);
    expect(await whiteSpace(text)).toBe('pre-line');
    expect(await figures(text)).toContain('tabular-nums');
    expect(await fits(text)).toBe(true);
    expect(await noSidewaysScroll(page)).toBe(true);
    expect((await panel.boundingBox())!.y).toBeLessThan((await q.getByTestId('prompt-head').boundingBox())!.y);
    await expect(q.getByTestId('prompt-head')).toHaveText(QUESTIONS[0].prompt);

    // Folded, it stays folded: through the feedback of this question and on the next question of the case.
    await panel.getByTestId('case-toggle').click();
    await expect(text).toBeHidden();
    await answerCurrentQuestion(page);
    await expect(feedback).toHaveAttribute('data-correct', 'true');
    await expect(panel).toHaveAttribute('data-open', 'false');
    await next();
    await expect(q).toHaveAttribute('data-question-id', QUESTIONS[1].id);
    await expect(panel).toHaveAttribute('data-open', 'false');
    await expect(text).toBeHidden();

    // Opened again, it stays open. A missed question of a case offers no similar question.
    await panel.getByTestId('case-toggle').click();
    await expect(text).toBeVisible();
    await showAnswer(page);
    await expect(feedback).toHaveAttribute('data-correct', 'false');
    await expect(player.getByTestId('try-similar')).toHaveCount(0);
    await expect(text).toBeVisible();
    expect(await noSidewaysScroll(page)).toBe(true);
    await next();

    // The rest of the case, in its order, each question with the same case.
    for (const question of QUESTIONS.slice(2)) {
      await expect(q).toHaveAttribute('data-question-id', question.id);
      await expect(panel).toHaveAttribute('data-open', 'true');
      expect((await text.innerText()).split('\n')).toEqual(LINES);
      await answerCurrentQuestion(page);
      await expect(feedback).toHaveAttribute('data-correct', 'true');
      await next();
    }
    // Every question was scored: four right of the five.
    await expect(page.getByTestId('e2e-case-done')).toHaveText(`${QUESTIONS.length - 1} of ${QUESTIONS.length} right`);
    const { attempts } = await readStoredEvents(page);
    expect(attempts.map((a) => a.questionId).sort()).toEqual(QUESTIONS.map((x) => x.id).sort());
  });
});

// ---------------------------------------------------------------------------------------------------------------
// A real Case study level: of the first stage that has cases. While no stage has any there is no such level, and
// this skips itself.
// ---------------------------------------------------------------------------------------------------------------

test.describe('the Case study level of the first stage that has cases', () => {
  const stage = CASE_STAGES.find((s) => s.cases.length > 0);
  test.skip(!stage, 'no stage has a case study yet');

  test('ends its topic and serves one whole case, then another on the next play', async ({ page }) => {
    test.setTimeout(180_000); // Two cases of up to eight questions through the real screens.
    const pack = packOf(stage!.topicId);
    // Its own level: a topic that closes several stages has one for each.
    const level = pack.levels.find((l) => l.id === `${stage!.topicId}-case-study-${stage!.id}`)!;
    expect(level.type).toBe('case_study');
    const partsOf = (caseId: string) => stage!.cases.find((c) => c.id === caseId)!.parts.length;

    await createProfile(page, 'Varun');
    await seedPassedLevels(page, level.order - 1, stage!.topicId);
    await page.goto(`/topics/${stage!.topicId}`);
    const row = page.getByTestId(`level-${level.order}`);
    await expect(row).toHaveAttribute('data-state', 'unlocked');
    await expect(row.getByRole('heading', { level: 3 })).toHaveText(`Case study: ${stage!.title}`);
    await expect(row).toContainText(stage!.description);
    const count = stage!.cases.length;
    await expect(row).toContainText(`Case study · ${count === 1 ? '1 case' : `${count} cases, one each time`}`);
    await expect(page.getByTestId('mastery-map')).toContainText(`Case study: ${stage!.title}`);
    // Nothing comes after it but the Case study levels of the topic's later stages, where it closes several.
    expect(pack.levels.slice(level.order + 1).every((l) => l.type === 'case_study')).toBe(true);
    await expect(page.getByTestId(`level-${pack.levels.length}`)).toHaveCount(0);

    const q = page.getByTestId('question');
    const panel = q.getByTestId('case');
    const text = panel.getByTestId('case-text');
    const feedback = page.getByTestId('feedback');

    /** Plays the case on screen to the results; the question at `missAt` (from 0) is given up on. Returns what was served. */
    const playCase = async (missAt: number) => {
      await expect(q).toBeVisible();
      const first = /^gen:(.+)~1:\d+:(\d+)$/.exec((await q.getAttribute('data-question-id'))!)!;
      const [caseId, seed] = [first[1], first[2]];
      const parts = partsOf(caseId);
      await expect(page.getByTestId('player-progress')).toHaveAttribute('aria-label', new RegExp(`: 0 of ${parts} steps done$`));
      const caseText = await text.innerText();
      const ids: string[] = [];
      for (let i = 0; i < parts; i++) {
        // Every question of the case, in order, from the one seed, with the same case above it.
        await expect(q).toHaveAttribute('data-question-id', new RegExp(`^gen:${escaped(caseId)}~${i + 1}:\\d+:${seed}$`));
        ids.push((await q.getAttribute('data-question-id'))!);
        await expect(panel.getByTestId('case-note')).toHaveText(`Question ${i + 1} of ${parts} in this case`);
        // Open on the first question; folded after the second, it stays folded.
        await expect(panel).toHaveAttribute('data-open', i < 2 ? 'true' : 'false');
        if (i < 2) expect(await text.innerText()).toBe(caseText);
        if (i === 1) await panel.getByTestId('case-toggle').click();
        if (i === missAt) {
          await showAnswer(page);
          await expect(feedback).toHaveAttribute('data-correct', 'false');
          await expect(page.getByTestId('try-similar')).toHaveCount(0);
        } else {
          await answerCurrentQuestion(page);
          await expect(feedback).toHaveAttribute('data-correct', 'true');
        }
        await page.getByTestId('continue').click();
        await expect(feedback).toHaveCount(0);
      }
      await expect(page.getByTestId('results-score')).toHaveText(`${parts - (missAt < parts ? 1 : 0)} of ${parts} correct`);
      return { caseId, seed, ids, caseText };
    };

    await page.getByTestId(`level-start-${level.order}`).click();
    await expect(page).toHaveURL(new RegExp(`/play/${level.id}$`));
    await page.setViewportSize({ width: 360, height: 740 });
    await expect(text).toBeVisible();
    expect(await whiteSpace(text)).toBe('pre-line');
    expect(await fits(text)).toBe(true);
    expect(await noSidewaysScroll(page)).toBe(true);
    const first = await playCase(0);

    // Every answer of the case is stored, as play of this level, and the level has its one result.
    const stored = await readStoredEvents(page);
    expect(stored.attempts.map((a) => a.questionId).sort()).toEqual([...first.ids].sort());
    for (const a of stored.attempts) expect({ levelId: a.levelId, topicId: a.topicId }).toEqual({ levelId: level.id, topicId: stage!.topicId });
    expect(stored.levelResults.filter((r) => r.levelId === level.id)).toHaveLength(1);

    // The question given up on is on the Mistakes screen with its case, folded until it is opened.
    await page.goto('/mistakes');
    const item = page.getByTestId('mistake-item');
    await expect(item).toHaveCount(1);
    await expect(item).toHaveAttribute('data-question-id', first.ids[0]);
    await expect(item.getByTestId('mistake-concept')).toHaveText(`Case study: ${stage!.title}`);
    await expect(item.getByTestId('case')).toHaveAttribute('data-open', 'false');
    await expect(item.getByTestId('case-text')).toBeHidden();
    await item.getByTestId('case-toggle').click();
    expect(await item.getByTestId('case-text').innerText()).toBe(first.caseText);
    expect(await noSidewaysScroll(page)).toBe(true);

    // Mistake review asks that exact question again, with its case open above it.
    await page.goto('/practice/mistakes');
    await expect(q).toHaveAttribute('data-question-id', first.ids[0]);
    await expect(panel).toHaveAttribute('data-open', 'true');
    expect(await text.innerText()).toBe(first.caseText);

    // The next play is another case: the next one of the stage where it has several, and never the same figures.
    await page.goto(`/play/${level.id}`);
    const second = await playCase(99);
    expect(second.seed).not.toBe(first.seed);
    if (stage!.cases.length > 1) {
      const turn = (caseId: string) => stage!.cases.findIndex((c) => c.id === caseId);
      expect(turn(second.caseId)).toBe((turn(first.caseId) + 1) % stage!.cases.length);
    }
    for (const id of second.ids) expect(first.ids).not.toContain(id);
    await expect(page.getByTestId('results-passed')).toHaveText('Passed');
  });
});
