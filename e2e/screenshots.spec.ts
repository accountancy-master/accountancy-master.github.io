import { expect, test, type Page, type TestInfo } from '@playwright/test';
import { JOURNAL_ENTRIES } from '../src/content/cbse11/journalEntries';
import { JE, JE_LEVEL_CARDS, answerCurrentQuestion, createProfile, fillJournal, levelOf, playSession, readLesson } from './helpers';

// Hand-over screenshots for docs/screenshots. Not part of the normal run: `SHOTS=1 npx playwright test e2e/screenshots.spec.ts`.
test.skip(process.env.SHOTS !== '1', 'screenshots are only taken when SHOTS=1');

async function shot(page: Page, testInfo: TestInfo, name: string, options: { fullPage?: boolean } = {}) {
  await page.evaluate(() => document.fonts.ready);
  // A full-page capture of a scrolled page draws sticky bars part-way down; start from the top.
  if (options.fullPage) await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({
    path: `docs/screenshots/${name}-${testInfo.project.name}.png`,
    animations: 'disabled',
    fullPage: options.fullPage ?? false,
  });
}

async function expectedLines(page: Page) {
  return JSON.parse((await page.getByTestId('question').getAttribute('data-expected'))!).lines as {
    accountId: string;
    side: 'Dr' | 'Cr';
    amount: number;
  }[];
}

async function answerAndContinue(page: Page, count: number) {
  for (let i = 0; i < count; i++) {
    await answerCurrentQuestion(page);
    await expect(page.getByTestId('feedback')).toHaveAttribute('data-correct', 'true');
    await page.getByTestId('continue').click();
  }
}

test('hand-over screenshots', async ({ page }, testInfo) => {
  test.setTimeout(6 * 60_000);

  await page.goto('/');
  await expect(page.getByTestId('profile-name-input')).toBeVisible();
  await shot(page, testInfo, 'profile-gate');

  await createProfile(page, 'Varun');
  await expect(page.getByTestId('goal-ring')).toBeVisible();
  await expect(page.getByTestId('mission-card')).toBeVisible();
  await shot(page, testInfo, 'dashboard-new');

  await page.goto('/topics');
  await shot(page, testInfo, 'topics');

  // Levels 0 to 3 are played for real so the topic and progress screens show honest numbers.
  await page.goto(`/play/${levelOf(JE, 0)}`);
  await expect(page.getByTestId('lesson')).toBeVisible();
  await shot(page, testInfo, 'lesson', { fullPage: true });
  await readLesson(page);
  await answerCurrentQuestion(page);
  await expect(page.getByTestId('feedback')).toBeVisible();
  await expect(page.getByTestId('continue')).toBeEnabled();
  await shot(page, testInfo, 'mcq-feedback');
  await page.getByTestId('continue').click();
  await expect(page.getByTestId('results-passed')).toBeVisible();
  await shot(page, testInfo, 'results');
  await page.getByTestId('results-next').click();

  for (let i = 0; i < JE_LEVEL_CARDS; i++) {
    await page.getByTestId('card-flip').click();
    await expect(page.getByTestId('card-got-it')).toBeVisible();
    if (i === 0) await shot(page, testInfo, 'card');
    await page.getByTestId('card-got-it').click();
  }
  await page.getByTestId('results-next').click();
  await answerAndContinue(page, 5);
  await page.getByTestId('results-next').click();
  await answerAndContinue(page, 4);
  await page.getByTestId('results-next').click();

  // Journal entry (level 4): empty, wrong, filled, right.
  await expect(page).toHaveURL(new RegExp(`${levelOf(JE, 4)}$`));
  await expect(page.getByTestId('question')).toBeVisible();
  await expect(page.getByTestId('hint')).toBeEnabled(); // wait out the short settle period
  await shot(page, testInfo, 'journal-empty');

  const lines = await expectedLines(page);
  await fillJournal(page, lines.map((l) => ({ ...l, side: l.side === 'Dr' ? 'Cr' : 'Dr' })));
  await page.getByTestId('check').click();
  await expect(page.getByTestId('feedback')).toHaveAttribute('data-correct', 'false');
  await shot(page, testInfo, 'journal-wrong', { fullPage: true });

  await page.goto(`/play/${levelOf(JE, 4)}`);
  await fillJournal(page, await expectedLines(page));
  await expect(page.getByTestId('check')).toBeEnabled();
  await shot(page, testInfo, 'journal-filled');
  await page.getByTestId('check').click();
  await expect(page.getByTestId('feedback')).toHaveAttribute('data-correct', 'true');
  await shot(page, testInfo, 'journal-right', { fullPage: true });

  await page.goto(`/topics/${JE}`);
  await expect(page.getByTestId('level-3')).toHaveAttribute('data-state', 'passed');
  await shot(page, testInfo, 'topic');

  await page.goto('/progress');
  await expect(page.getByTestId('progress-xp')).toBeVisible();
  await shot(page, testInfo, 'progress');

  await page.goto('/settings');
  await expect(page.getByTestId('backup-export')).toBeVisible();
  // The test server also renders a "Test tools" panel; the real app does not, so keep it out of the picture.
  await page.evaluate(() => {
    const panel = document.querySelector('[data-testid="e2e-pass-levels"]')?.closest('section');
    if (panel) (panel as HTMLElement).style.display = 'none';
  });
  await shot(page, testInfo, 'settings');

  // Three level-4 questions answered with the sides swapped, so the Mistakes screen has entries to show.
  await page.goto(`/play/${levelOf(JE, 4)}`);
  for (let i = 0; i < 3; i++) {
    await expect(page.getByTestId('question')).toBeVisible();
    await expect(page.getByTestId('hint')).toBeEnabled();
    const wrong = (await expectedLines(page)).map((l) => ({ ...l, side: l.side === 'Dr' ? ('Cr' as const) : ('Dr' as const) }));
    await fillJournal(page, wrong);
    await page.getByTestId('check').click();
    await expect(page.getByTestId('feedback')).toHaveAttribute('data-correct', 'false');
    await page.getByTestId('continue').click();
  }
  await page.getByTestId('player-close').click();
  await page.getByTestId('player-leave').click();
  await expect(page).toHaveURL(new RegExp(`/topics/${JE}$`));

  await page.goto('/mistakes');
  // The three just made, plus the question missed earlier for the "wrong" picture if it was a different one.
  await expect(page.getByTestId('mistake-item').first()).toBeVisible();
  const waiting = await page.getByTestId('mistake-item').count();
  expect(waiting).toBeGreaterThanOrEqual(3);
  await shot(page, testInfo, 'mistakes');

  await page.goto('/home');
  await expect(page.getByTestId('mission-start')).toBeVisible();
  await expect(page.getByTestId('quick-mistakes')).toContainText(`${waiting} waiting`);
  await shot(page, testInfo, 'dashboard');

  await page.goto('/practice');
  await expect(page.getByTestId('hub-mistakes-count')).toHaveText(`${waiting} waiting`);
  await shot(page, testInfo, 'practice-hub');

  await page.goto('/practice/smart');
  await expect(page.getByTestId('question')).toBeVisible();
  await expect(page.getByTestId('hint')).toBeEnabled();
  await shot(page, testInfo, 'practice-question');

  // The daily challenge, played through, ends on a results screen that shows the bonus.
  await page.goto('/practice/daily');
  await expect(page.getByTestId('question')).toBeVisible();
  await playSession(page);
  await expect(page.getByTestId('results-bonus')).toContainText('Daily challenge bonus');
  await shot(page, testInfo, 'practice-results');

  await page.goto(`/sheet/${JE}`);
  await expect(page.getByTestId('sheet-card')).toHaveCount(JOURNAL_ENTRIES.cards.length);
  await shot(page, testInfo, 'sheet');
});
