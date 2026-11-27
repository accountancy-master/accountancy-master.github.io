import { expect, test } from '@playwright/test';
import { courseCounts } from '../src/content/contentCounts';
import { CLASS11, CLASS12, CLASS12_LIVE, JE, createProfile, packOf, seedPassedLevels } from './helpers';

test("What's inside shows every topic against every kind of content, with totals, links and the learner's progress", async ({ page }) => {
  await createProfile(page, 'Varun');
  await seedPassedLevels(page, 1, JE);
  await page.goto('/inside');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText("What's inside");
  const { topics, total } = courseCounts(CLASS11);
  await expect(page.getByTestId('inside-matrix').locator('[data-testid^="inside-row-"]')).toHaveCount(topics.length);
  await expect(page.getByTestId('inside-total-topics')).toHaveText(String(topics.length));
  await expect(page.getByTestId('inside-total-patterns')).toHaveText(String(total.patterns));
  await expect(page.getByTestId('inside-total-levels')).toHaveText(String(total.levels));
  await expect(page.getByTestId('inside-sum-entries')).toHaveText(String(total.byGroup.entries));

  const je = topics.find((t) => t.topicId === JE)!.counts;
  await expect(page.getByTestId(`inside-${JE}-levels`)).toHaveText(String(je.levels));
  await expect(page.getByTestId(`inside-${JE}-levels`)).toHaveAttribute('href', `/topics/${JE}`);
  await expect(page.getByTestId(`inside-${JE}-cards`)).toHaveAttribute('href', `/sheet/${JE}`);
  await expect(page.getByTestId(`inside-${JE}-entries`)).toHaveAttribute('href', `/playground?topic=${JE}`);
  await expect(page.getByTestId(`inside-${JE}-progress`)).toContainText(`2/${packOf(JE).levels.length} levels`);

  await page.getByTestId(`inside-${JE}-levels`).click();
  await expect(page).toHaveURL(new RegExp(`/topics/${JE}$`));
});

test("What's inside shows the other course too", async ({ page }) => {
  test.skip(!CLASS12_LIVE, 'needs a second course');
  await createProfile(page, 'Varun');
  await page.goto('/inside');
  await page.getByTestId(`inside-course-${CLASS12}`).click();
  // A new learner has made no choice of Part B, so Class 12 shows the Analysis of Financial Statements topics.
  const { topics } = courseCounts(CLASS12, {});
  await expect(page.getByTestId('inside-matrix').locator('[data-testid^="inside-row-"]')).toHaveCount(topics.length);
  await expect(page.getByTestId('inside-total-topics')).toHaveText(String(topics.length));
});

test('Home shows the big picture of the course and links to the full page', async ({ page }) => {
  await createProfile(page, 'Varun');
  await expect(page.getByTestId('home-inside')).toBeVisible();
  await expect(page.getByTestId(`inside-topic-${JE}`)).toBeVisible();
  await page.getByTestId('inside-link').click();
  await expect(page).toHaveURL(/\/inside$/);
});
