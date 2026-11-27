import { expect, test, type Page } from '@playwright/test';
import fs from 'node:fs';
import { JE, createProfile, seedPassedLevels } from './helpers';

test('backup round-trips into another browser profile', async ({ page, browser }) => {
  await createProfile(page, 'Varun');
  await seedPassedLevels(page, 2);
  await page.goto('/progress');
  await expect(page.getByTestId('progress-xp')).toContainText('60');
  await expect(page.getByTestId('rank')).toHaveText('Beginner');

  await page.goto('/settings');
  const [download] = await Promise.all([page.waitForEvent('download'), page.getByTestId('backup-export').click()]);
  expect(download.suggestedFilename()).toMatch(/^accountancy-master-Varun-\d{4}-\d{2}-\d{2}\.json$/);
  const file = await download.path();
  expect(JSON.parse(fs.readFileSync(file, 'utf8')).format).toBe('accountancy-master-backup');

  const other = await browser.newContext();
  const page2 = await other.newPage();
  await createProfile(page2, 'Temp');
  await page2.goto('/settings');
  await page2.getByTestId('backup-import').setInputFiles(file);
  await expect(page2.getByTestId('backup-message')).toHaveText(
    'Backup restored for Varun. Existing progress was kept and new progress was added.',
  );
  // The restored learner is selected right away, without switching by hand.
  await expect(page2.getByTestId('profile-name')).toHaveText('Varun');
  await expect(page2.getByTestId('xp-total')).toContainText('60');
  await page2.goto('/progress');
  await expect(page2.getByTestId('progress-xp')).toContainText('60');
  await other.close();
});

test('a bad file is refused', async ({ page }, testInfo) => {
  await createProfile(page, 'Varun');
  await page.goto('/settings');
  const bad = testInfo.outputPath('bad.json');
  fs.writeFileSync(bad, '{"hello":"world"}');
  await page.getByTestId('backup-import').setInputFiles(bad);
  await expect(page.getByTestId('backup-message')).toHaveText('That file is not a valid backup.');
});

async function exportBackupFile(page: Page): Promise<string> {
  await page.goto('/settings');
  const [download] = await Promise.all([page.waitForEvent('download'), page.getByTestId('backup-export').click()]);
  return download.path();
}

test('a backup for a course this version does not know is refused', async ({ page }, testInfo) => {
  await createProfile(page, 'Varun');
  await seedPassedLevels(page, 1);
  const backup = JSON.parse(fs.readFileSync(await exportBackupFile(page), 'utf8'));
  expect(backup.levelResults.length).toBeGreaterThan(0);
  backup.profile = { ...backup.profile, id: 'ghost-profile-id', name: 'Ghost', courseId: 'cbse-99-unknown' };
  for (const row of [...backup.attempts, ...backup.levelResults]) row.profileId = 'ghost-profile-id';
  for (const row of backup.attempts) row.courseId = 'cbse-99-unknown';
  const unknown = testInfo.outputPath('unknown-course.json');
  fs.writeFileSync(unknown, JSON.stringify(backup));

  await page.getByTestId('backup-import').setInputFiles(unknown);
  await expect(page.getByTestId('backup-message')).toHaveText(
    "This backup is for a course this version of the app doesn't have.",
  );
  await page.getByTestId('switch-profile').click();
  await expect(page.getByTestId('profile-pick-Varun')).toBeVisible();
  await expect(page.getByTestId('profile-pick-Ghost')).toHaveCount(0);
});

test('a backup file larger than 5 MB is refused', async ({ page }, testInfo) => {
  await createProfile(page, 'Varun');
  await seedPassedLevels(page, 1);
  const real = fs.readFileSync(await exportBackupFile(page), 'utf8');
  const backup = JSON.parse(real);
  backup.profile = { ...backup.profile, id: 'big-profile-id', name: 'Bigfile' };
  for (const row of [...backup.attempts, ...backup.levelResults]) row.profileId = 'big-profile-id';
  // Otherwise a perfectly good backup, padded with trailing whitespace past the limit.
  const big = testInfo.outputPath('too-big.json');
  fs.writeFileSync(big, JSON.stringify(backup) + ' '.repeat(5 * 1024 * 1024 + 1));

  await page.getByTestId('backup-import').setInputFiles(big);
  await expect(page.getByTestId('backup-message')).toHaveText('That file is too large to be a backup.');
  await page.getByTestId('switch-profile').click();
  await expect(page.getByTestId('profile-pick-Varun')).toBeVisible();
  await expect(page.getByTestId('profile-pick-Bigfile')).toHaveCount(0);
});

test('a backup can be restored from the profile gate in a fresh browser', async ({ page, browser }) => {
  await createProfile(page, 'Varun');
  await seedPassedLevels(page, 2);
  const file = await exportBackupFile(page);

  const fresh = await browser.newContext();
  const gate = await fresh.newPage();
  await gate.goto('/start');
  await gate.getByTestId('gate-backup-import').setInputFiles(file);
  await expect(gate).toHaveURL(/\/home$/);
  await expect(gate.getByTestId('profile-name')).toHaveText('Varun');
  await expect(gate.getByTestId('xp-total')).toContainText('60');
  await fresh.close();
});

test('the profile gate refuses a bad backup with the same messages as Settings', async ({ page }, testInfo) => {
  await page.goto('/start');
  const bad = testInfo.outputPath('bad-gate.json');
  fs.writeFileSync(bad, '{"hello":"world"}');
  await page.getByTestId('gate-backup-import').setInputFiles(bad);
  await expect(page.getByTestId('gate-backup-message')).toHaveText('That file is not a valid backup.');
  await expect(page).toHaveURL(/\/$/);
});

test('the header XP updates on Settings itself after the test panel marks levels passed', async ({ page }) => {
  await createProfile(page, 'Varun');
  await page.goto('/settings');
  await expect(page.getByTestId('xp-total')).toContainText('0');
  await expect(page.getByTestId('xp-total')).not.toContainText('60');
  await page.getByTestId('e2e-pass-topic').fill(JE);
  await page.getByTestId('e2e-pass-levels').fill('2');
  await page.getByTestId('e2e-pass-levels-apply').click();
  await expect(page.getByTestId('e2e-pass-levels-done')).toBeVisible();
  await expect(page.getByTestId('xp-total')).toContainText('60');
});

test('the daily goal can be changed and the Dashboard ring uses it, also after a reload', async ({ page }) => {
  await createProfile(page, 'Varun');
  await page.goto('/settings');
  // A learner with no saved goal sees the default marked.
  await expect(page.getByTestId('goal-50')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByTestId('goal-20')).toHaveAttribute('aria-pressed', 'false');
  await page.getByTestId('goal-20').click();
  await expect(page.getByTestId('goal-20')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByTestId('goal-50')).toHaveAttribute('aria-pressed', 'false');

  await page.getByTestId('nav-home').click();
  await expect(page.getByTestId('goal-ring')).toHaveText('0 / 20 XP');
  await page.reload();
  await expect(page.getByTestId('goal-ring')).toHaveText('0 / 20 XP');
  await page.goto('/settings');
  await expect(page.getByTestId('goal-20')).toHaveAttribute('aria-pressed', 'true');
});

test('a learner can be renamed; the header and the gate show the new name', async ({ page }) => {
  await createProfile(page, 'Varun');
  await page.goto('/settings');
  const input = page.getByTestId('rename-input');
  await expect(input).toHaveValue('Varun');
  await expect(input).toHaveAttribute('maxlength', '24');

  // Empty and blank names are refused; nothing changes.
  await input.fill('   ');
  await page.getByTestId('rename-save').click();
  await expect(page.getByTestId('rename-error')).toHaveText('Enter a name');
  await expect(page.getByTestId('profile-name')).toHaveText('Varun');

  await input.fill('Varun K');
  await expect(page.getByTestId('rename-error')).toHaveCount(0);
  await page.getByTestId('rename-save').click();
  await expect(page.getByTestId('profile-name')).toHaveText('Varun K');
  await expect(page.getByTestId('settings-profile-name')).toHaveText('Varun K');

  await page.goto('/start');
  await expect(page.getByTestId('profile-pick-Varun K')).toBeVisible();
  await expect(page.getByTestId('profile-pick-Varun')).toHaveCount(0);
});

test('deleting a learner needs their exact name and keeps other learners\' progress', async ({ page }) => {
  await createProfile(page, 'Asha');
  await seedPassedLevels(page, 2);
  await createProfile(page, 'Bina');
  await page.goto('/settings');

  const opener = page.getByTestId('delete-learner');
  await opener.click();
  const dialog = page.getByRole('alertdialog');
  await expect(dialog).toBeVisible();
  await expect(dialog).toContainText('Bina');
  await expect(page.getByTestId('delete-confirm-input')).toBeFocused();
  await expect(page.getByTestId('delete-confirm')).toBeDisabled();

  // Escape closes and gives focus back; so does Cancel.
  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
  await expect(opener).toBeFocused();
  await opener.click();
  await page.getByTestId('delete-cancel').click();
  await expect(dialog).toHaveCount(0);
  await expect(opener).toBeFocused();

  // Only the exact name (case-sensitive) enables the button.
  await opener.click();
  const typed = page.getByTestId('delete-confirm-input');
  await typed.fill('bina');
  await expect(page.getByTestId('delete-confirm')).toBeDisabled();
  await typed.fill('Bin');
  await expect(page.getByTestId('delete-confirm')).toBeDisabled();
  await typed.fill('Bina');
  await expect(page.getByTestId('delete-confirm')).toBeEnabled();
  await page.getByTestId('delete-confirm').click();

  // Back at the gate, Bina is gone (also after a reload) and Asha still has her progress.
  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByTestId('profile-pick-Asha')).toBeVisible();
  await expect(page.getByTestId('profile-pick-Bina')).toHaveCount(0);
  await page.reload();
  await expect(page.getByTestId('profile-pick-Asha')).toBeVisible();
  await expect(page.getByTestId('profile-pick-Bina')).toHaveCount(0);
  await page.getByTestId('profile-pick-Asha').click();
  await expect(page).toHaveURL(/\/home$/);
  await page.goto('/progress');
  await expect(page.getByTestId('progress-xp')).toContainText('60');
});

test('deleting the only learner returns to an empty gate', async ({ page }) => {
  await createProfile(page, 'Varun');
  await page.goto('/settings');
  await page.getByTestId('delete-learner').click();
  await page.getByTestId('delete-confirm-input').fill('Varun');
  await page.getByTestId('delete-confirm').click();
  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByTestId('profile-pick-Varun')).toHaveCount(0);
  await expect(page.getByTestId('profile-name-input')).toBeVisible();
});

test('a failed deletion says so, keeps the dialog open and the learner in place', async ({ page }) => {
  await createProfile(page, 'Varun');
  await page.goto('/settings');
  await page.getByTestId('delete-learner').click();
  await page.getByTestId('delete-confirm-input').fill('Varun');
  // Make the next delete in the browser database fail.
  await page.evaluate(() => {
    IDBObjectStore.prototype.delete = () => {
      throw new Error('disk full');
    };
  });
  await page.getByTestId('delete-confirm').click();
  await expect(page.getByTestId('delete-error')).toHaveText("Couldn't delete this learner. Try again.");
  await expect(page.getByRole('alertdialog')).toBeVisible();
  await expect(page.getByTestId('delete-confirm')).toBeEnabled();
  await expect(page.getByTestId('delete-confirm-input')).toBeFocused();
  await page.getByTestId('delete-cancel').click();
  await expect(page).toHaveURL(/\/settings$/);
  await expect(page.getByTestId('profile-name')).toHaveText('Varun');
});
