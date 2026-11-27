import { expect, test } from '@playwright/test';
import { createProfile, JE } from './helpers';

// Profiles can only get an unknown course from storage written by another version, so the test writes one directly.
test('screens for a learner whose course is unknown stay usable', async ({ page }) => {
  await createProfile(page, 'Varun');
  await page.evaluate(
    () =>
      new Promise<void>((resolve, reject) => {
        const req = indexedDB.open('accountancy-master');
        req.onerror = () => reject(req.error);
        req.onsuccess = () => {
          const db = req.result;
          const tx = db.transaction('profiles', 'readwrite');
          const st = tx.objectStore('profiles');
          const g = st.getAll();
          g.onsuccess = () => {
            for (const p of g.result) st.put({ ...p, courseId: 'cbse-99-unknown' });
          };
          tx.oncomplete = () => resolve();
        };
      }),
  );
  for (const path of ['/topics', '/progress']) {
    await page.goto(path);
    await expect(page.getByTestId('course-unavailable')).toBeVisible();
    await expect(page.getByTestId('profile-name')).toHaveText('Varun');
  }
  await page.getByTestId('course-unavailable-switch').click();
  await expect(page.getByTestId('profile-pick-Varun')).toBeVisible();
  await page.getByTestId('profile-pick-Varun').click();
  for (const path of ['/settings', `/topics/${JE}`]) {
    await page.goto(path);
    await expect(page.getByTestId('profile-name')).toHaveText('Varun');
  }
});
