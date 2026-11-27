import { expect, test } from '@playwright/test';
import { EXAM_DATE_SUGGESTIONS, countdownText, daysToExam, formatDay } from '../src/learning/examCountdown';
import { dayKey } from '../src/learning/gamification';
import { CLASS11, createProfile } from './helpers';

const plusDays = (n: number) => dayKey(Date.now() + n * 86_400_000);

test('without a date Home offers to set one; set in Settings, Home and the top bar count down to it', async ({ page }, info) => {
  await createProfile(page, 'Varun');
  const card = page.getByTestId('exam-countdown');
  await expect(card).toHaveAttribute('data-state', 'unset');
  await page.getByTestId('exam-set').click();
  await expect(page).toHaveURL(/\/settings#exam-dates$/);
  await expect(page.getByTestId(`exam-saved-${CLASS11}`)).toHaveText('No date set.');

  // 45 days away: "30 to 90 days", time for mock papers.
  const day = plusDays(45);
  await page.getByTestId(`exam-date-${CLASS11}`).fill(day);
  await expect(page.getByTestId(`exam-saved-${CLASS11}`)).toHaveText(`Set for ${formatDay(day)}.`);
  await page.getByTestId('nav-home').click();
  const days = daysToExam(dayKey(Date.now()), day);
  await expect(card).toHaveAttribute('data-state', 'months');
  await expect(page.getByTestId('exam-days')).toHaveText(String(days));
  await expect(page.getByTestId('exam-text')).toHaveText(countdownText(days, 'Class 11 Accountancy'));
  await expect(page.getByTestId('exam-date')).toContainText(formatDay(day));
  await expect(page.getByTestId('exam-action')).toHaveAttribute('href', '/mock');
  if (info.project.name === 'laptop') await expect(page.getByTestId('topbar-exam')).toHaveText(`${days} days`);

  // Five days away: the last days, revise.
  await page.goto('/settings');
  await page.getByTestId(`exam-date-${CLASS11}`).fill(plusDays(5));
  await expect(page.getByTestId(`exam-saved-${CLASS11}`)).toHaveText(`Set for ${formatDay(plusDays(5))}.`);
  await page.getByTestId('nav-home').click();
  await expect(card).toHaveAttribute('data-state', 'final');
  await expect(page.getByTestId('exam-text')).toHaveText(countdownText(5, 'Class 11 Accountancy'));

  // Cleared, the learner has none again.
  await page.goto('/settings');
  await page.getByTestId(`exam-clear-${CLASS11}`).click();
  await expect(page.getByTestId(`exam-saved-${CLASS11}`)).toHaveText('No date set.');
});

test('the suggested date can be taken in one click, with where to check it', async ({ page }) => {
  const suggestion = EXAM_DATE_SUGGESTIONS[CLASS11];
  test.skip(suggestion.date <= dayKey(Date.now()), 'the suggestion has gone by: update EXAM_DATE_SUGGESTIONS');
  await createProfile(page, 'Varun');
  await page.goto('/settings');
  await expect(page.getByTestId(`exam-row-${CLASS11}`)).toContainText(suggestion.note);
  await page.getByTestId(`exam-suggest-${CLASS11}`).click();
  await expect(page.getByTestId(`exam-saved-${CLASS11}`)).toHaveText(`Set for ${formatDay(suggestion.date)}.`);
  await expect(page.getByTestId(`exam-suggest-${CLASS11}`)).toHaveCount(0);
});
