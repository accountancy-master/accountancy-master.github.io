import { expect, test } from '@playwright/test';
import { BEYOND_INTEREST_ON_DRAWINGS } from '../src/content/beyondSyllabus';
import '../src/content/registry';
import { coursePatterns, scaleLine } from '../src/learning/patterns';
import { CLASS11, createProfile } from './helpers';

// Practice beyond the 2025-26 syllabus (interest on drawings of a proprietor, the IGST cross set-off) stands on no
// level and in no mock paper. The Playground lists it with a chip that says why, and a Marathon takes it in only when
// the learner turns it on. A rule card that teaches only such a thing carries the chip wherever it is read.

const ALL = coursePatterns(CLASS11);
const BEYOND = ALL.filter((p) => p.beyondSyllabus !== undefined);
const TOPIC = 'final-accounts-adjustments';

test.beforeEach(async ({ page }) => {
  await createProfile(page, 'Varun');
});

test('the Playground lists the patterns beyond the syllabus with a chip and the reason, and the question shows it too', async ({ page }) => {
  test.setTimeout(120_000);
  expect(BEYOND.length).toBe(7);
  await page.goto('/playground?q=beyond%20the%20syllabus');
  await expect(page.getByTestId('playground-scale')).toHaveText(scaleLine(ALL.length));
  await expect(page.getByTestId('playground-count')).toHaveText(`Showing ${BEYOND.length} of ${ALL.length.toLocaleString('en-IN')} question types`);
  const chip = page.getByTestId('pattern-faa-int-drawings-beyond');
  await expect(chip).toContainText('Beyond the syllabus');
  await expect(page.getByTestId('pattern-faa-int-drawings-beyond-reason')).toHaveText(BEYOND_INTEREST_ON_DRAWINGS);
  // A pattern within the syllabus has no chip (the Playground shows the first patterns only until searched).
  await page.goto('/playground?q=interest%20on%20capital');
  await expect(page.getByTestId('pattern-faa-int-capital')).toBeVisible();
  await expect(page.getByTestId('pattern-faa-int-capital-beyond')).toHaveCount(0);

  // Played, its question carries the chip above the prompt.
  await page.goto('/playground?pattern=faa-int-drawings');
  await expect(page.getByTestId('question')).toBeVisible({ timeout: 60_000 });
  await expect(page.getByTestId('beyond-syllabus')).toContainText('Beyond the syllabus');
  await expect(page.getByTestId('beyond-syllabus-reason')).toHaveText(BEYOND_INTEREST_ON_DRAWINGS);
});

test('a rule card beyond the syllabus carries the chip on the topic page and the quick sheet; the others do not', async ({ page }) => {
  test.setTimeout(120_000);
  // Linked as Go to and the mind maps link a card: the list opens on it.
  await page.goto(`/topics/${TOPIC}#card-faa-card-13`);
  await expect(page.getByTestId('rule-card-faa-card-13')).toHaveAttribute('data-target', 'true', { timeout: 60_000 });
  await expect(page.getByTestId('rule-card-faa-card-13-beyond')).toContainText('Beyond the syllabus');
  await expect(page.getByTestId('rule-card-faa-card-13-beyond-reason')).toHaveText(BEYOND_INTEREST_ON_DRAWINGS);
  await expect(page.getByTestId('rule-card-faa-card-14-beyond')).toBeVisible();
  await expect(page.getByTestId('rule-card-faa-card-12')).toBeVisible();
  await expect(page.getByTestId('rule-card-faa-card-12-beyond')).toHaveCount(0);
  await expect(page.getByTestId('rule-card-faa-card-18')).toContainText('What does interest on capital do to the closing capital?');
  await expect(page.getByTestId('rule-card-faa-card-18-beyond')).toHaveCount(0);

  await page.goto(`/sheet/${TOPIC}`);
  await expect(page.getByTestId('sheet-card-faa-card-13-beyond-reason')).toHaveText(BEYOND_INTEREST_ON_DRAWINGS, { timeout: 60_000 });
  await expect(page.getByTestId('sheet-card-faa-card-14-beyond')).toBeVisible();
  await expect(page.locator('[data-testid$="-beyond"]')).toHaveCount(2);
});

test('a Marathon takes in practice beyond the syllabus only when the learner turns it on', async ({ page }) => {
  test.setTimeout(120_000);
  await page.goto(`/practice/marathon?topics=${TOPIC}`);
  const toggle = page.getByTestId('marathon-beyond');
  await expect(toggle).toHaveAttribute('aria-pressed', 'false');
  const line = page.getByTestId('marathon-summary-line');
  await expect(line).toHaveText(/^1 topic · \d+ question types$/);
  const off = Number(/· (\d+) question types/.exec((await line.textContent()) ?? '')![1]);
  await expect(page.getByTestId('marathon-start')).toHaveAttribute('href', `/practice/marathon/mix?topics=${TOPIC}`);

  await toggle.click();
  await expect(toggle).toHaveAttribute('aria-pressed', 'true');
  const on = BEYOND.filter((p) => p.topicId === TOPIC).length;
  await expect(line).toHaveText(`1 topic · ${off + on} question types`);
  await expect(page.getByTestId('marathon-start')).toHaveAttribute('href', `/practice/marathon/mix?topics=${TOPIC}&beyond=1`);
  await expect(page).toHaveURL(/beyond=1/);
  await expect(page.getByTestId(`marathon-${TOPIC}`)).toHaveAttribute('href', /beyond=1/);

  // Turned off again, the run is as it was.
  await toggle.click();
  await expect(line).toHaveText(`1 topic · ${off} question types`);
  await expect(page.getByTestId('marathon-start')).toHaveAttribute('href', `/practice/marathon/mix?topics=${TOPIC}`);
});
