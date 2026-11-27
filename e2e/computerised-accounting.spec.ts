import { expect, test, type Page } from '@playwright/test';
import { PART_B_TOPICS } from '../src/content/courseOptions';
import { CLASS11, CLASS12, CLASS12_CAS_PACKS, CLASS12_PACKS, createProfile, playSession } from './helpers';

// Part B of Class 12 as a school teaches it: Analysis of Financial Statements, or Computerised Accounting in its place.
// The choice is the learner's, in Settings; with the default nothing of Computerised Accounting is seen anywhere.

const CAS = 'computerised-accounting';
const ANALYSIS = PART_B_TOPICS.analysis;
const topics = (n: number) => `${n} ${n === 1 ? 'topic' : 'topics'}`;

async function choosePartB(page: Page, partB: 'analysis' | 'computerised') {
  await page.goto('/settings');
  await page.getByTestId(`part-b-${partB}`).click();
  await expect(page.getByTestId(`part-b-${partB}`)).toHaveAttribute('aria-pressed', 'true');
}

/** The Topics screen shows the topics of one choice of Part B and none of the other. */
async function topicsOf(page: Page, partB: 'analysis' | 'computerised') {
  await page.goto('/topics');
  await expect(page.getByTestId('topic-card-goodwill')).toBeVisible();
  for (const id of ANALYSIS) await expect(page.getByTestId(`topic-card-${id}`)).toHaveCount(partB === 'analysis' ? 1 : 0);
  await expect(page.getByTestId(`topic-card-${CAS}`)).toHaveCount(partB === 'computerised' ? 1 : 0);
}

test('a Class 12 learner chooses Computerised Accounting as Part B, plays it, and goes back to the usual Part B', async ({ page }) => {
  test.skip(CLASS12_CAS_PACKS.length === 0 || !CLASS12_CAS_PACKS.some((p) => p.topicId === CAS), 'needs Computerised Accounting');
  await createProfile(page, 'Meera', { courseId: CLASS12 });

  // The default: Analysis of Financial Statements, and Computerised Accounting nowhere.
  await page.goto('/settings');
  await expect(page.getByTestId('part-b-section')).toBeVisible();
  await expect(page.getByTestId('part-b-analysis')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByTestId('part-b-computerised')).toHaveAttribute('aria-pressed', 'false');
  await topicsOf(page, 'analysis');
  await page.goto('/practice');
  await expect(page.getByTestId('hub-topic-count')).toHaveText(topics(CLASS12_PACKS.length));
  await page.goto('/mock');
  await expect(page.getByTestId('mock-topic-select').locator(`option[value="${CAS}"]`)).toHaveCount(0);
  await expect(page.getByTestId('mock-new-full')).toHaveAttribute('href', `/mock/paper?paper=${encodeURIComponent('full.1')}`);
  await page.goto('/inside');
  await expect(page.getByTestId('inside-total-topics')).toContainText(String(CLASS12_PACKS.length));
  // Its page says where it belongs and offers the choice.
  await page.goto(`/topics/${CAS}`);
  await expect(page.getByTestId('topic-other-part-b')).toBeVisible();

  // Computerised Accounting: it stands in Topics in place of the four topics of the analysis.
  await choosePartB(page, 'computerised');
  await topicsOf(page, 'computerised');
  await page.goto('/practice');
  await expect(page.getByTestId('hub-topic-count')).toHaveText(topics(CLASS12_CAS_PACKS.length));
  await page.goto('/mock');
  await expect(page.getByTestId('mock-topic-select').locator(`option[value="${CAS}"]`)).toHaveCount(1);
  await expect(page.getByTestId('mock-topic-select').locator('option[value="accounting-ratios"]')).toHaveCount(0);
  // The full paper is the paper of this choice: its Part B is Computerised Accounting.
  await expect(page.getByTestId('mock-new-full')).toHaveAttribute('href', `/mock/paper?paper=${encodeURIComponent('cas.full.1')}`);
  await page.goto('/inside');
  await expect(page.getByTestId('inside-total-topics')).toContainText(String(CLASS12_CAS_PACKS.length));

  // Its lesson plays, and the level is passed.
  await page.goto(`/topics/${CAS}`);
  await expect(page.getByTestId('level-0')).toBeVisible();
  await page.goto(`/play/${CAS}-level-0`);
  await playSession(page);
  await expect(page.getByTestId('results')).toBeVisible();
  await page.goto('/topics');
  await expect(page.getByTestId(`topic-levels-${CAS}`)).toContainText('1 of');

  // A topic of the analysis now says it belongs to the other choice.
  await page.goto('/topics/accounting-ratios');
  await expect(page.getByTestId('topic-other-part-b')).toBeVisible();

  // Back to the usual Part B: the four topics are back, Computerised Accounting is gone, and nothing is lost.
  await choosePartB(page, 'analysis');
  await topicsOf(page, 'analysis');
  await page.goto('/practice');
  await expect(page.getByTestId('hub-topic-count')).toHaveText(topics(CLASS12_PACKS.length));
  await choosePartB(page, 'computerised');
  await page.goto('/topics');
  await expect(page.getByTestId(`topic-levels-${CAS}`)).toContainText('1 of');
});

test('the choice of Part B is offered to a Class 12 learner only', async ({ page }) => {
  await createProfile(page, 'Varun', { courseId: CLASS11 });
  await page.goto('/settings');
  await expect(page.getByTestId('settings-profile-name')).toHaveText('Varun');
  await expect(page.getByTestId('part-b-section')).toHaveCount(0);
});
