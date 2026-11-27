import { expect, test } from '@playwright/test';
import { findQuestion } from '../src/content/registry';
import { CONFIG } from '../src/learning/config';
import { JE, createProfile, levelOf, packOf, playSession, readStoredEvents } from './helpers';

test('the ladder starts with only the first level unlocked', async ({ page }) => {
  await createProfile(page, 'Varun');
  await page.goto(`/topics/${JE}`);
  await expect(page.getByRole('heading', { name: 'Journal Entries' })).toBeVisible();
  await expect(page.getByTestId('level-0')).toHaveAttribute('data-state', 'unlocked');
  for (let i = 1; i < packOf(JE).levels.length; i++) {
    await expect(page.getByTestId(`level-${i}`)).toHaveAttribute('data-state', 'locked');
  }
  await expect(page.getByTestId('level-start-1')).toHaveCount(0);
  await expect(page.getByTestId('topic-mastery')).toContainText('0');
  await expect(page.getByTestId('mastery-map')).toContainText('Rules of debit and credit');
  await page.getByTestId('level-start-0').click();
  await expect(page).toHaveURL(new RegExp(`/play/${levelOf(JE, 0)}$`));
});

test('an unknown topic is a 404', async ({ page }) => {
  const res = await page.goto('/topics/nope');
  expect(res?.status()).toBe(404);
});

test('each Start link says which level it opens', async ({ page }) => {
  await createProfile(page, 'Varun');
  await page.goto(`/topics/${JE}`);
  await expect(page.getByTestId('level-start-0')).toHaveAccessibleName(/^Start: level 0, .+/);
  await expect(page.getByRole('link', { name: /^Start: level 0, / })).toHaveCount(1);
});

test('"Practise this topic" starts fresh questions from that topic only', async ({ page }) => {
  await createProfile(page, 'Varun', { unlockAll: true });
  await page.goto(`/topics/${JE}`);
  const practise = page.getByTestId('topic-practise');
  await expect(practise).toHaveText('Practise this topic');
  await expect(practise).toHaveAttribute('href', `/practice/topic/${JE}`);
  await practise.click();
  await expect(page).toHaveURL(new RegExp(`/practice/topic/${JE}$`));
  await expect(page.getByTestId('question')).toBeVisible();
  const served: string[] = [];
  await playSession(page, { onQuestion: (id) => served.push(id) });
  expect(served).toHaveLength(CONFIG.practice.freshCount);
  // Every question served is one of this topic's, and a new one (generated), not an authored question.
  for (const id of served) {
    expect(id).toMatch(/^gen:/);
    expect(findQuestion(id)?.topicId, id).toBe(JE);
  }
  // It ends back at the topic, and is recorded as a fresh-questions session.
  await expect(page.getByTestId('results-topic')).toHaveAttribute('href', `/topics/${JE}`);
  expect((await readStoredEvents(page)).sessionResults.map((r) => r.kind)).toEqual(['fresh']);
});

test('practice of a topic that does not exist is a 404', async ({ page }) => {
  const res = await page.goto('/practice/topic/nope');
  expect(res?.status()).toBe(404);
});
