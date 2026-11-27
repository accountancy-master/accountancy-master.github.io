import { expect, test, type Page } from '@playwright/test';
import { JE, JE_LEVEL_CARDS, answerCurrentQuestion, createProfile, levelOf, readLesson, readStoredEvents, seedPassedLevels } from './helpers';

test.beforeEach(async ({ page }) => {
  await createProfile(page, 'Varun');
});

test('plays the concept level and unlocks the next', async ({ page }) => {
  await page.goto(`/play/${levelOf(JE, 0)}`);
  await expect(page.getByText('Two sides to every transaction')).toBeVisible();
  await readLesson(page);
  await expect(page.getByTestId('check')).toBeDisabled();
  await answerCurrentQuestion(page);
  await expect(page.getByTestId('feedback')).toHaveAttribute('data-correct', 'true');
  await page.getByTestId('continue').click();
  await expect(page.getByTestId('results-passed')).toHaveText('Passed');
  await expect(page.getByTestId('results-xp')).toContainText('30');
  await page.getByTestId('results-topic').click();
  await expect(page.getByTestId('level-0')).toHaveAttribute('data-state', 'passed');
  await expect(page.getByTestId('level-1')).toHaveAttribute('data-state', 'unlocked');
  await expect(page.getByTestId('xp-total')).toContainText('30');
});

test('a card level passes with nothing scored', async ({ page }) => {
  await page.goto(`/play/${levelOf(JE, 0)}`);
  await readLesson(page);
  await answerCurrentQuestion(page);
  await page.getByTestId('continue').click();
  await page.getByTestId('results-next').click();
  await expect(page).toHaveURL(new RegExp(`${levelOf(JE, 1)}$`));
  for (let i = 0; i < JE_LEVEL_CARDS; i++) {
    await page.getByTestId('card-flip').click();
    await page.getByTestId('card-got-it').click();
  }
  await expect(page.getByTestId('results-passed')).toHaveText('Passed');
});

test('a wrong answer explains itself, hints cost XP, and a revealed answer earns none', async ({ page }) => {
  // Reach level 2 quickly: pass levels 0 and 1.
  await page.goto(`/play/${levelOf(JE, 0)}`);
  await readLesson(page);
  await answerCurrentQuestion(page);
  await page.getByTestId('continue').click();
  await page.getByTestId('results-next').click();
  for (let i = 0; i < JE_LEVEL_CARDS; i++) {
    await page.getByTestId('card-flip').click();
    await page.getByTestId('card-got-it').click();
  }
  await page.getByTestId('results-next').click();
  await expect(page).toHaveURL(new RegExp(`${levelOf(JE, 2)}$`));

  // Question 1: wrong.
  const q = page.getByTestId('question');
  const expected = JSON.parse((await q.getAttribute('data-expected'))!);
  const wrong = ['a', 'b', 'c', 'd'].find((id) => id !== expected)!;
  await page.getByTestId(`mcq-option-${wrong}`).click();
  await page.getByTestId('check').click();
  await expect(page.getByTestId('feedback')).toHaveAttribute('data-correct', 'false');
  await expect(page.getByTestId('feedback')).toContainText('Not quite');
  await page.getByTestId('continue').click();

  // Question 2: one hint, then correct.
  await page.getByTestId('hint').click();
  await expect(page.getByTestId('hint-text')).toBeVisible();
  await answerCurrentQuestion(page);
  await expect(page.getByTestId('feedback')).toContainText('8');
  await page.getByTestId('continue').click();

  // Question 3: all hints, then reveal.
  await page.getByTestId('hint').click();
  await page.getByTestId('hint').click();
  await page.getByTestId('reveal').click();
  await expect(page.getByTestId('feedback')).toHaveAttribute('data-correct', 'false');
  await page.getByTestId('continue').click();

  // Questions 4 and 5: correct. 3 of 5 is below the 70% pass mark.
  await answerCurrentQuestion(page);
  await page.getByTestId('continue').click();
  await answerCurrentQuestion(page);
  await page.getByTestId('continue').click();
  await expect(page.getByTestId('results-passed')).toHaveText('Try again');
  await expect(page.getByTestId('results-next')).toHaveCount(0);
});

test('a locked level cannot be played by typing its address', async ({ page }) => {
  await page.goto(`/play/${levelOf(JE, 5)}`);
  await expect(page.getByTestId('level-locked')).toBeVisible();
});

test('progress survives a reload', async ({ page }) => {
  await page.goto(`/play/${levelOf(JE, 0)}`);
  await readLesson(page);
  await answerCurrentQuestion(page);
  await page.getByTestId('continue').click();
  await expect(page.getByTestId('results-passed')).toHaveText('Passed');
  await page.goto(`/topics/${JE}`);
  await page.reload();
  await expect(page.getByTestId('level-0')).toHaveAttribute('data-state', 'passed');
});

async function openLevel2(page: Page) {
  await seedPassedLevels(page, 1);
  await page.goto(`/play/${levelOf(JE, 2)}`);
  await expect(page.getByTestId('question')).toBeVisible();
}

test('after the last hint the hint button is disabled and Show answer sits apart from it', async ({ page }) => {
  await openLevel2(page);
  const hint = page.getByTestId('hint');
  const reveal = page.getByTestId('reveal');
  await expect(reveal).toHaveCount(0);
  await hint.click();
  await hint.click();
  await expect(hint).toBeDisabled();
  await expect(hint).toHaveText('No more hints');
  await expect(reveal).toBeVisible();
  const a = (await hint.boundingBox())!;
  const b = (await reveal.boundingBox())!;
  const overlap = a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;
  expect(overlap).toBe(false);
});

test('a double click on Continue moves on one question and touches nothing on the next', async ({ page }) => {
  await openLevel2(page);
  const q = page.getByTestId('question');
  const firstId = await q.getAttribute('data-question-id');
  await answerCurrentQuestion(page);
  await expect(page.getByTestId('feedback')).toBeVisible();
  await page.getByTestId('continue').dblclick();
  await expect(q).not.toHaveAttribute('data-question-id', firstId!);
  await expect(page.getByTestId('hint-text')).toHaveCount(0);
  await expect(page.getByTestId('feedback')).toHaveCount(0);
  await expect(page.getByTestId('hint')).toHaveText(/^Hint \(2 left\)$/);
});

test('the result is saved as soon as the last question is answered, without pressing Continue', async ({ page }) => {
  await page.goto(`/play/${levelOf(JE, 0)}`);
  await readLesson(page);
  await answerCurrentQuestion(page);
  await expect(page.getByTestId('feedback')).toHaveAttribute('data-correct', 'true');
  // Not pressing Continue: the learner just leaves, the moment the answer is on the device. The result is stored in
  // the same write, so it is there as well. (Storing takes the device a moment, and a page that is gone before its
  // storage has answered loses that write whatever the app does: leaving earlier than this would test the browser.)
  await expect.poll(async () => (await readStoredEvents(page)).attempts.length, { message: 'the last answer is on the device' }).toBe(1);
  await page.goto(`/topics/${JE}`);
  await expect(page.getByTestId('level-0')).toHaveAttribute('data-state', 'passed');
  await expect(page.getByTestId('level-1')).toHaveAttribute('data-state', 'unlocked');
});

test('the result goes in with the last answer: it is not lost by leaving while the device is slow to store', async ({ page }) => {
  // A slow device, as the page sees it: the app hears that something has been stored a second and a half after it
  // was. A result that is only written once the last answer is known to be stored would never be written here,
  // because the learner has left by then (this is how the result of a level was once lost on a slow machine).
  await page.addInitScript(() => {
    const own = Object.getOwnPropertyDescriptor(IDBTransaction.prototype, 'oncomplete')!;
    const w = window as unknown as { __answersStored?: number };
    Object.defineProperty(IDBTransaction.prototype, 'oncomplete', {
      configurable: true,
      get() {
        return own.get!.call(this);
      },
      set(this: IDBTransaction, handler: unknown) {
        const late = (event: Event) => {
          const told = () => (handler as (e: Event) => void).call(this, event);
          if (this.mode !== 'readwrite') return told();
          // The write that holds the answer is on the device now; the app is told later.
          if (this.objectStoreNames.contains('attempts')) w.__answersStored = (w.__answersStored ?? 0) + 1;
          setTimeout(told, 1500);
        };
        own.set!.call(this, typeof handler === 'function' ? late : handler);
      },
    });
  });
  await page.goto(`/play/${levelOf(JE, 0)}`);
  await readLesson(page);
  await answerCurrentQuestion(page);
  await expect(page.getByTestId('feedback')).toHaveAttribute('data-correct', 'true');
  // The learner leaves once the answer is on the device, and before the app has been told that it is.
  await expect
    .poll(() => page.evaluate(() => (window as unknown as { __answersStored?: number }).__answersStored ?? 0), { message: 'the write of the last answer is done' })
    .toBe(1);
  await page.goto(`/topics/${JE}`);
  const stored = await readStoredEvents(page);
  expect(stored.attempts).toHaveLength(1);
  expect(stored.levelResults).toHaveLength(1);
  await expect(page.getByTestId('level-0')).toHaveAttribute('data-state', 'passed');
  await expect(page.getByTestId('level-1')).toHaveAttribute('data-state', 'unlocked');
});

test('the results screen still shows the XP gained after an early save, and Practise again works', async ({ page }) => {
  await page.goto(`/play/${levelOf(JE, 0)}`);
  await readLesson(page);
  await answerCurrentQuestion(page);
  await page.getByTestId('continue').click();
  await expect(page.getByTestId('results-xp')).toContainText('30');
  await page.getByTestId('results-retry').click();
  await expect(page.getByTestId('lesson')).toBeVisible();
  await readLesson(page);
  await answerCurrentQuestion(page);
  await page.getByTestId('continue').click();
  await expect(page.getByTestId('results-passed')).toHaveText('Passed');
  await page.goto(`/topics/${JE}`);
  // Two finished plays: the second one is not a first pass, but every answer counts.
  await expect(page.getByTestId('stat-answered')).toHaveText('2');
});

test('quitting a level and starting it again gives different questions', async ({ page }) => {
  await seedPassedLevels(page, 3);
  await page.goto(`/play/${levelOf(JE, 4)}`);
  const q = page.getByTestId('question');
  await expect(q).toBeVisible();
  const firstId = await q.getAttribute('data-question-id');
  await answerCurrentQuestion(page);
  await expect(page.getByTestId('feedback')).toBeVisible();
  await page.getByTestId('player-close').click();
  await page.getByTestId('player-leave').click();
  await expect(page).toHaveURL(new RegExp(`/topics/${JE}$`));

  await page.getByTestId('level-start-4').click();
  await expect(q).toBeVisible();
  expect(await q.getAttribute('data-question-id')).not.toBe(firstId);
});

test('a card offers Got it and Need to revise', async ({ page }) => {
  await seedPassedLevels(page, 0);
  await page.goto(`/play/${levelOf(JE, 1)}`);
  await page.getByTestId('card-flip').click();
  await expect(page.getByTestId('card-got-it')).toHaveText('Got it');
  await expect(page.getByTestId('card-again')).toHaveText('Need to revise');
});
