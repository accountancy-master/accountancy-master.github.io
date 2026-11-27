import { expect, test, type Page } from '@playwright/test';
import { TEMPLATES } from '../src/generators';
import { CLASS11_STAGES, JE, createProfile, packOf, seedPassedLevels } from './helpers';

// Screenshots of the revamped screens for docs/screenshots/ui-revamp, at 1440 x 900 and at 360 x 740. Not part of the
// normal run: `SHOTS=1 npx playwright test e2e/screenshots-revamp.spec.ts --project=laptop`.
test.skip(process.env.SHOTS !== '1', 'screenshots are only taken when SHOTS=1');

const SIZES = [
  { name: 'desktop', width: 1440, height: 900 },
  { name: 'phone', width: 360, height: 740 },
] as const;

async function shot(page: Page, name: string, size: (typeof SIZES)[number]) {
  await page.evaluate(() => document.fonts.ready);
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({ path: `docs/screenshots/ui-revamp/${name}-${size.name}.png`, animations: 'disabled' });
}

test('Home at the other widths of a laptop and a desktop', async ({ page }, info) => {
  test.skip(info.project.name !== 'laptop', 'taken once, at the sizes given');
  await createProfile(page, 'Varun');
  await seedPassedLevels(page, 3, JE);
  for (const width of [1024, 1280, 1920]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto('/home');
    await expect(page.getByTestId('exam-countdown')).toBeVisible();
    await page.evaluate(() => document.fonts.ready);
    await page.screenshot({ path: `docs/screenshots/ui-revamp/home-${width}.png`, animations: 'disabled' });
  }
});

for (const size of SIZES) {
  test(`revamp screenshots at ${size.width} x ${size.height}`, async ({ page }, info) => {
    test.skip(info.project.name !== 'laptop', 'taken once, at the sizes given');
    test.setTimeout(4 * 60_000);
    await page.setViewportSize({ width: size.width, height: size.height });
    await createProfile(page, 'Varun');
    // Something done, so the numbers are not all zero: a few levels of two topics, and an exam date.
    await seedPassedLevels(page, 3, JE);
    await seedPassedLevels(page, 1, 'ledger');
    await page.goto('/settings');
    await page.getByTestId('exam-date-cbse-11-accountancy').fill('2027-03-01');
    await expect(page.getByTestId('exam-saved-cbse-11-accountancy')).toContainText('2027');

    await page.goto('/home');
    await expect(page.getByTestId('exam-countdown')).toBeVisible();
    await shot(page, 'home', size);
    await page.goto('/topics');
    await expect(page.getByTestId(`topic-card-${JE}`)).toBeVisible();
    await shot(page, 'topics', size);
    await page.goto(`/topics/${JE}`);
    await expect(page.getByTestId('level-0')).toBeVisible();
    await shot(page, 'topic', size);
    await page.goto('/inside');
    await expect(page.getByTestId('inside-matrix')).toBeVisible();
    await shot(page, 'inside', size);
    await page.goto('/progress');
    await expect(page.getByTestId('rank')).toBeVisible();
    await shot(page, 'progress', size);
    await page.goto('/home');
    await expect(page.getByTestId('exam-countdown')).toBeVisible();
    if (size.name === 'phone') await page.getByTestId('goto-open').click();
    else await page.keyboard.press('Control+k');
    await page.getByTestId('goto-input').fill('depreciation');
    await expect(page.getByTestId('goto-result').first()).toBeVisible();
    await shot(page, 'goto', size);
  });
}

test('play screens at 1440 x 900, with the sidebar', async ({ page }, info) => {
  test.skip(info.project.name !== 'laptop', 'taken once');
  test.setTimeout(3 * 60_000);
  await page.setViewportSize({ width: 1440, height: 900 });
  await createProfile(page, 'Varun', { unlockAll: true });
  await seedPassedLevels(page, 4, JE);
  const snap = async (name: string) => {
    await page.evaluate(() => document.fonts.ready);
    await page.screenshot({ path: `docs/screenshots/ui-revamp/play-${name}-desktop.png`, animations: 'disabled' });
  };
  const level = packOf(JE).levels.find((l) => l.order === 5)!;
  await page.goto(`/play/${level.id}`);
  await expect(page.getByTestId('player-close')).toBeVisible();
  await snap('level');
  await page.goto('/practice/cards');
  await expect(page.getByTestId('player-close')).toBeVisible();
  await snap('cards');
  const stage = CLASS11_STAGES[0];
  await page.goto(`/cases/play/${stage.id}`);
  await expect(page.getByTestId('question')).toBeVisible();
  await snap('case');
  await page.goto(`/practice/marathon/${JE}`);
  await expect(page.getByTestId('marathon-stop')).toBeVisible();
  await snap('marathon');
  await page.goto('/mock/paper?paper=topic.journal-entries.1');
  await page.getByTestId('mock-start').click();
  await expect(page.getByTestId('exam')).toBeVisible();
  await snap('mock');
  const pattern = TEMPLATES.find((t) => t.topicId === JE && t.kind === 'journal')!;
  await page.goto(`/playground?topic=${JE}&pattern=${pattern.id}`);
  await expect(page.getByTestId('question')).toBeVisible();
  await snap('playground');
});
