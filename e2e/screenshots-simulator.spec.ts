import fs from 'node:fs';
import path from 'node:path';
import { expect, test, type Page } from '@playwright/test';
import { effectOfLines } from '../src/simulator/engine';
import { directionOf, SIDES } from '../src/simulator/predict';
import { endlessCase, starterOrder } from '../src/simulator/plans';
import { findScene } from '../src/simulator/scenes';
import { createProfile } from './helpers';
import '../src/content/registry';

// Screenshots of every mode of the simulator for docs/screenshots/simulator, at 1440 x 900 and at 360 x 740, and a
// short recording of one transaction moving. Not part of the normal run:
// `SHOTS=1 npx playwright test e2e/screenshots-simulator.spec.ts --project=laptop` (PowerShell: $env:SHOTS=1; ...).
test.skip(process.env.SHOTS !== '1', 'screenshots are only taken when SHOTS=1');

const OUT = 'docs/screenshots/simulator';
const scene = findScene('ae')!;
const SEED = 11;
const SIZES = [
  { name: 'desktop', width: 1440, height: 900 },
  { name: 'phone', width: 360, height: 740 },
] as const;

const played = (page: Page) => expect(page.getByTestId('sim-stage')).toHaveAttribute('data-status', 'done', { timeout: 30_000 });

async function shot(page: Page, name: string, size: (typeof SIZES)[number], at?: string) {
  await page.evaluate(() => document.fonts.ready);
  if (at) await page.getByTestId(at).scrollIntoViewIfNeeded();
  else await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({ path: `${OUT}/${name}-${size.name}.png`, animations: 'disabled' });
}

for (const size of SIZES) {
  test(`simulator screenshots at ${size.width} x ${size.height}`, async ({ page }, info) => {
    test.skip(info.project.name !== 'laptop', 'taken once, at the sizes given');
    test.setTimeout(4 * 60_000);
    await page.setViewportSize({ width: size.width, height: size.height });
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await createProfile(page, 'Varun', { keepDeviceDefaults: true });

    // Watch: a credit purchase of a machine, played through, then a sale that shows the cost of the goods.
    await page.goto('/simulator');
    await shot(page, 'watch-start', size);
    await page.getByTestId('watch-pick').selectOption('s.sale-credit');
    await played(page);
    await shot(page, 'watch-tanks', size, 'sim-stage');
    await shot(page, 'watch-explanation', size, 'sim-explanation');

    // Predict: the form filled in, then the marks after the truth has played.
    const tx = starterOrder(scene, SEED)[0];
    const e = effectOfLines(scene, tx.lines, tx.costOfSale ?? 0);
    await page.goto(`/simulator?mode=predict&seed=${SEED}`);
    for (const side of SIDES) await page.getByTestId(`predict-${side}`).locator(`label:has([data-testid="predict-${side}-${directionOf(e[side])}"])`).click();
    await shot(page, 'predict-form', size, 'predict-check');
    await page.getByTestId('predict-check').click();
    await played(page);
    await shot(page, 'predict-marked', size, 'predict-feedback');

    // Free play: a new business, with capital brought in, then a story under way.
    await page.goto('/simulator?mode=free');
    await page.getByTestId('free-new').click();
    await page.getByTestId('free-play').click();
    await played(page);
    await shot(page, 'free-play', size);
    await page.getByTestId('free-story-stationery-month').click();
    await expect(page.getByTestId('free-story-bar')).toContainText('transaction 4 of 11', { timeout: 60_000 });
    await page.getByTestId('free-story-auto').click();
    await played(page);
    await shot(page, 'free-story', size, 'sim-stage');

    // Find the mistake: a one-sided error, with Suspense open, then the books restored.
    let seed = 1;
    while (endlessCase(scene, seed, 0).scenarioId !== 'credit-not-posted') seed++;
    const c = endlessCase(scene, seed, 0);
    await page.goto(`/simulator?mode=mistakes&seed=${seed}`);
    await played(page);
    await shot(page, 'mistake-suspense', size, 'sim-stage');
    await page.getByTestId(`mistake-option-${c.correct}`).check();
    await page.getByTestId('mistake-check').click();
    await shot(page, 'mistake-answer', size, 'mistake-feedback');
    await page.getByTestId('mistake-correct').click();
    await expect(page.getByTestId('mistake-restored')).toHaveAttribute('data-restored', 'true', { timeout: 30_000 });
    await shot(page, 'mistake-restored', size, 'sim-stage');

    // The two levels on the topic's ladder.
    await page.goto('/topics/accounting-equation');
    await shot(page, 'topic-levels', size, 'level-1');
  });
}

// Every test of this file is recorded (a video can only be asked for the whole file); only this one is kept.
test.use({ video: { mode: 'on', size: { width: 1280, height: 800 } } });

test.describe('a recording', () => {
  test('one transaction moving, at full motion', async ({ page }, info) => {
    test.skip(info.project.name !== 'laptop', 'recorded once');
    test.setTimeout(2 * 60_000);
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    await createProfile(page, 'Varun', { keepDeviceDefaults: true });
    await page.goto('/simulator');
    await page.getByTestId('sim-stage').scrollIntoViewIfNeeded();
    await page.getByTestId('sim-speed-0.5').click();
    await page.getByTestId('watch-pick').selectOption('s.sale-cash');
    await played(page);
    await page.waitForTimeout(800);
    await page.getByTestId('watch-pick').selectOption('s.expense-outstanding');
    await played(page);
    await page.waitForTimeout(1200);
    const video = page.video();
    await page.close();
    if (video) {
      fs.mkdirSync(OUT, { recursive: true });
      await video.saveAs(path.join(OUT, 'simulator-watch.webm'));
    }
  });
});
