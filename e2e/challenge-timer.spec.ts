import { expect, test, type Page } from '@playwright/test';
import { JE, answerCurrentQuestion, createProfile, packOf, readStoredEvents } from './helpers';

// A level that gives its questions a time (a challenge level), whichever one Journal Entries has first.
const TIMED = packOf(JE).levels.find((l) => l.timerSecondsPerQuestion !== undefined)!;
const SECONDS = TIMED.timerSecondsPerQuestion!;
/** What the test build shortens the clock to: long enough to see it run, short enough to wait for. */
const SHORT = 3;

const secondsLeft = async (page: Page): Promise<number> => Number(await page.getByTestId('question-clock').getAttribute('data-seconds-left'));

test('a challenge level is played against the clock, a question that runs out of time is a miss, and the clock can be switched off', async ({ page }) => {
  test.setTimeout(90_000);
  // Every level open on this device, so the challenge level can be played at once.
  await createProfile(page, 'Varun', { unlockAll: true });
  const clock = page.getByTestId('question-clock');
  const feedback = page.getByTestId('feedback');

  // The level's own time, for a learner who has changed nothing. An answer stops the clock.
  await page.goto(`/play/${TIMED.id}`);
  await expect(clock).toBeVisible();
  await expect(clock).toHaveAttribute('data-warning', 'false');
  await expect(clock).toHaveAttribute('aria-label', /^Time left for this question: \d+:\d\d$/);
  expect(await secondsLeft(page)).toBeGreaterThan(SECONDS - 15);
  await expect(page.getByTestId('player-note')).toHaveCount(0);
  await answerCurrentQuestion(page);
  await expect(feedback).toHaveAttribute('data-correct', 'true');
  const stoppedAt = await secondsLeft(page);
  await page.waitForTimeout(1500);
  expect(await secondsLeft(page)).toBe(stoppedAt);

  // The test build can shorten the clock of the levels played from now on.
  await page.goto('/settings');
  await expect(page.getByTestId('challenge-timer-toggle')).toHaveAttribute('aria-checked', 'true');
  await page.getByTestId('e2e-question-seconds').fill(String(SHORT));
  await page.getByTestId('e2e-question-seconds-apply').click();
  await expect(page.getByTestId('e2e-question-seconds-done')).toBeVisible();

  // Nobody answers: the time runs out, and the question is closed as a wrong answer is.
  await page.goto(`/play/${TIMED.id}`);
  const question = page.getByTestId('question');
  await expect(clock).toHaveAttribute('data-warning', 'true');
  const missed = (await question.getAttribute('data-question-id'))!;
  await expect(feedback).toBeVisible({ timeout: 15_000 });
  await expect(feedback).toHaveAttribute('data-correct', 'false');
  await expect(page.getByTestId('feedback-title')).toHaveText("Time's up");
  // The right answer, as the feedback of its type of question shows it.
  await expect(feedback.getByText(/Right answer:|Correct entry/).first()).toBeVisible();
  await expect(clock).toHaveText('0:00');
  await expect(page.getByTestId('check')).toHaveCount(0);
  const stored = (await readStoredEvents(page)).attempts as unknown as { questionId: string; correct: boolean; levelId?: string }[];
  expect(stored.filter((a) => a.questionId === missed).map((a) => [a.correct, a.levelId])).toEqual([[false, TIMED.id]]);

  // The usual button moves on, and the next question has the whole time again.
  await page.getByTestId('continue').click();
  await expect(feedback).toHaveCount(0);
  await expect(question).not.toHaveAttribute('data-question-id', missed);
  await expect(clock).toHaveAttribute('data-seconds-left', /^[1-9]\d*$/);

  // Switched off in Settings, and still off after a reload: the level is played without a clock, and says why.
  await page.goto('/settings');
  await page.getByTestId('challenge-timer-toggle').click();
  await expect(page.getByTestId('challenge-timer-toggle')).toHaveAttribute('aria-checked', 'false');
  await page.reload();
  await expect(page.getByTestId('challenge-timer-state')).toHaveText('Off');
  await page.goto(`/play/${TIMED.id}`);
  await expect(question).toBeVisible();
  await expect(clock).toHaveCount(0);
  await expect(page.getByTestId('player-note')).toHaveText('The challenge timer is off in Settings, so this level is not timed.');
  // Longer than the shortened clock would have given: nothing closes the question.
  await page.waitForTimeout((SHORT + 1) * 1000);
  await expect(feedback).toHaveCount(0);
  await answerCurrentQuestion(page);
  await expect(feedback).toHaveAttribute('data-correct', 'true');
});
