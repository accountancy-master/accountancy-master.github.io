import { expect, test } from '@playwright/test';
import { CLASS12, CLASS12_CAS_PACKS, createProfile, seedPassedLevels } from './helpers';

test('a learner creates a profile and lands on Home', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByTestId('app-title')).toHaveText('Accountancy Master');
  await page.getByTestId('profile-create').click();
  await expect(page.getByTestId('profile-error')).toHaveText('Enter a name');
  await createProfile(page, 'Varun');
  await expect(page.getByTestId('profile-name')).toHaveText('Varun');
  await expect(page.getByTestId('xp-total')).toContainText('0');
  await expect(page.getByTestId('storage-warning')).toHaveCount(0);
});

test('the profile is remembered and can be picked again', async ({ page }) => {
  await createProfile(page, 'Varun');
  await page.reload();
  await expect(page.getByTestId('profile-name')).toHaveText('Varun');
  await page.goto('/');
  await page.getByTestId('profile-pick-Varun').click();
  await expect(page).toHaveURL(/\/home$/);
});

test('pages need a profile', async ({ page }) => {
  await page.goto('/topics');
  await expect(page).toHaveURL(/\/$/);
});

test('navigation is reachable and nothing scrolls sideways', async ({ page }) => {
  await createProfile(page, 'Varun');
  for (const id of ['nav-topics', 'nav-progress', 'nav-settings']) {
    await expect(page.getByTestId(id)).toBeVisible();
  }
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
  expect(overflow).toBe(false);
});

test("a new learner never shows the previous learner's XP", async ({ page }) => {
  await createProfile(page, 'Asha');
  await seedPassedLevels(page, 2);
  await expect(page.getByTestId('xp-total')).toContainText('60');

  // Switch through the app (no page reload), so the shared progress provider stays mounted.
  await page.getByTestId('switch-profile').click();
  await expect(page).toHaveURL(/\/$/);
  // Records every XP text the header ever shows from here on, however briefly.
  await page.evaluate(() => {
    const seen: string[] = [];
    (window as unknown as { __xpSeen: string[] }).__xpSeen = seen;
    const record = () => {
      const text = document.querySelector('[data-testid="xp-total"]')?.textContent;
      if (text) seen.push(text);
    };
    new MutationObserver(record).observe(document.body, { subtree: true, childList: true, characterData: true });
  });
  await page.getByTestId('profile-name-input').fill('Bala');
  await page.getByTestId('profile-create').click();
  await expect(page).toHaveURL(/\/home$/);

  await expect(page.getByTestId('profile-name')).toHaveText('Bala');
  await expect(page.getByTestId('xp-total')).toContainText('0');
  // Sample for about a second: the previous learner's XP never reappears.
  for (let i = 0; i < 10; i++) {
    await expect(page.getByTestId('xp-total')).not.toContainText('60');
    await page.waitForTimeout(100);
  }
  const seen = await page.evaluate(() => (window as unknown as { __xpSeen: string[] }).__xpSeen);
  expect(seen.filter((text) => text.includes('60'))).toEqual([]);
});

test('the first screen makes starting the main action: no account needed, and restoring a backup comes after', async ({ page }) => {
  await page.goto('/');
  const start = page.getByTestId('profile-create');
  await expect(start).toHaveText('Start learning');
  await expect(page.getByTestId('profile-no-account')).toHaveText('No account needed. Your progress stays on this device.');
  // Restoring a backup is folded away below the form.
  const restore = page.getByTestId('gate-backup');
  await expect(restore).not.toHaveAttribute('open', '');
  await expect(page.getByTestId('gate-backup-import')).toBeHidden();
  expect((await restore.boundingBox())!.y).toBeGreaterThan((await start.boundingBox())!.y);
  await restore.locator('summary').click();
  await expect(page.getByTestId('gate-backup-import')).toBeVisible();
});

test('a Class 12 learner is asked which Part B the school teaches, and the choice is kept', async ({ page }) => {
  await page.goto('/');
  test.skip((await page.getByTestId(`course-${CLASS12}`).count()) === 0 || CLASS12_CAS_PACKS.length === 0, 'needs Class 12 with both choices of Part B');
  // Not asked for Class 11.
  await expect(page.getByTestId('gate-part-b')).toHaveCount(0);
  await page.getByTestId(`course-${CLASS12}`).click();
  await expect(page.getByTestId('gate-part-b')).toBeVisible();
  await expect(page.getByTestId('gate-part-b-analysis')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByTestId('gate-part-b-later')).toContainText('choose later in Settings');
  await page.getByTestId('gate-part-b-computerised').click();
  await expect(page.getByTestId('gate-part-b-computerised')).toHaveAttribute('aria-pressed', 'true');
  await page.getByTestId('profile-name-input').fill('Kavya');
  await page.getByTestId('profile-create').click();
  await expect(page).toHaveURL(/\/home$/);
  await page.goto('/settings');
  await expect(page.getByTestId('part-b-computerised')).toHaveAttribute('aria-pressed', 'true');
  await page.goto('/topics');
  for (const p of CLASS12_CAS_PACKS) await expect(page.getByTestId(`topic-card-${p.topicId}`)).toBeVisible();
});

test('"Not sure" keeps the usual Part B, to be chosen later in Settings', async ({ page }) => {
  await page.goto('/');
  test.skip((await page.getByTestId(`course-${CLASS12}`).count()) === 0, 'needs Class 12');
  await page.getByTestId(`course-${CLASS12}`).click();
  test.skip((await page.getByTestId('gate-part-b').count()) === 0, 'needs both choices of Part B');
  await page.getByTestId('gate-part-b-later').click();
  await page.getByTestId('profile-name-input').fill('Ravi');
  await page.getByTestId('profile-create').click();
  await expect(page).toHaveURL(/\/home$/);
  await page.goto('/settings');
  await expect(page.getByTestId('part-b-analysis')).toHaveAttribute('aria-pressed', 'true');
});
