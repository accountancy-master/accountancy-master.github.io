import fs from 'node:fs';
import { expect, test } from '@playwright/test';
import { EQUATION_LAB, LABS } from '../src/simulator/labs';
import { createProfile } from './helpers';

// Screenshots of every lab of the simulator for docs/screenshots/labs, at 1440 x 900 and at 360 x 740: the lab as it
// opens (its walk-through ready to play). Not part of the normal run:
// `SHOTS=1 npx playwright test e2e/screenshots-labs.spec.ts --project=laptop` (PowerShell: $env:SHOTS=1; ...).
test.skip(process.env.SHOTS !== '1', 'screenshots are only taken when SHOTS=1');

const OUT = 'docs/screenshots/labs';
const SIZES = [
  { name: 'laptop', width: 1440, height: 900 },
  { name: 'phone', width: 360, height: 740 },
] as const;

for (const size of SIZES) {
  test(`lab screenshots at ${size.width} x ${size.height}`, async ({ page }, info) => {
    test.skip(info.project.name !== 'laptop', 'taken once, at the sizes given');
    test.setTimeout(6 * 60_000);
    fs.mkdirSync(OUT, { recursive: true });
    await page.setViewportSize({ width: size.width, height: size.height });
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await createProfile(page, 'Varun', { keepDeviceDefaults: true });
    for (const lab of LABS.filter((l) => l.ready && l.id !== EQUATION_LAB)) {
      await page.goto(`/simulator?lab=${lab.id}`);
      await expect(page.getByTestId(`lab-${lab.id}`)).toBeVisible({ timeout: 60_000 });
      await expect(page.getByTestId('lab-loading')).toHaveCount(0, { timeout: 60_000 });
      await page.evaluate(() => document.fonts.ready);
      // The lab's own heading at the top, below the shelf.
      await page.getByTestId(`lab-${lab.id}`).evaluate((el) => window.scrollTo(0, el.getBoundingClientRect().top + window.scrollY - 72));
      await page.screenshot({ path: `${OUT}/${lab.id}-${size.name}.png`, animations: 'disabled' });
    }
  });
}
