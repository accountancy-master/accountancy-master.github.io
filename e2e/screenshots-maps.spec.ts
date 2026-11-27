import { expect, test, type Page } from '@playwright/test';
import { createProfile, levelOf, packOf, playSession } from './helpers';

// Screenshots of the mind maps for docs/screenshots/revision, at 1440 x 900 and at 360 x 740. Not part of the normal
// run: `SHOTS=1 npx playwright test e2e/screenshots-maps.spec.ts --project=laptop`.
test.skip(process.env.SHOTS !== '1', 'screenshots are only taken when SHOTS=1');

const SIZES = [
  { name: 'desktop', width: 1440, height: 900 },
  { name: 'phone', width: 360, height: 740 },
] as const;

const TOPIC = 'ledger';

async function shot(page: Page, name: string, size: (typeof SIZES)[number]) {
  await page.evaluate(() => document.fonts.ready);
  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur?.());
  // On a phone the page is scrolled to the map (under the sticky header), as a learner would to look at it.
  if (size.name === 'phone') await page.getByTestId('mind-map').evaluate((el) => window.scrollTo(0, el.getBoundingClientRect().top + window.scrollY - 64));
  else await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({ path: `docs/screenshots/revision/${name}-${size.name}.png`, animations: 'disabled' });
}

for (const size of SIZES) {
  test(`mind map screenshots at ${size.width} x ${size.height}`, async ({ page }, info) => {
    test.skip(info.project.name !== 'laptop', 'taken once, at the sizes given');
    test.setTimeout(5 * 60_000);
    await createProfile(page, 'Varun', { keepDeviceDefaults: true });
    // Something learnt, so the rings are not all grey: a few levels of Journal Entries and of the Ledger.
    for (const [topic, order] of [
      ['journal-entries', 2],
      ['journal-entries', 3],
      [TOPIC, 2],
      [TOPIC, 3],
    ] as const) {
      await page.goto(`/play/${levelOf(topic, order)}`);
      await playSession(page);
    }
    await page.setViewportSize({ width: size.width, height: size.height });

    await page.goto('/maps');
    await expect(page.getByTestId(`map-node-topic:${TOPIC}`)).toBeVisible();
    await shot(page, 'mind-map-course', size);

    await page.goto(`/maps/${TOPIC}`);
    const concepts = packOf(TOPIC).concepts;
    await expect(page.getByTestId(`map-node-concept:${concepts[0].id}`)).toBeVisible();
    // The first concept open, with its rule cards and its quick questions.
    const first = concepts[0].id;
    await page.getByTestId(`map-node-concept:${first}`).focus();
    await page.getByTestId(`map-toggle-concept:${first}`).click();
    for (const group of ['cards', 'quick']) {
      const id = `group:${first}:${group}`;
      if ((await page.getByTestId(`map-node-${id}`).count()) === 0) continue;
      await page.getByTestId(`map-node-${id}`).focus();
      await page.getByTestId(`map-toggle-${id}`).click();
    }
    if (size.name === 'desktop') await page.getByTestId('map-fit').click();
    else {
      // Dragged so that the topic is at the top of the map, as a finger would.
      await page.getByTestId('mind-map').evaluate((el) => window.scrollTo(0, el.getBoundingClientRect().top + window.scrollY - 64));
      const box = (await page.getByTestId('map-viewport').boundingBox())!;
      const root = (await page.getByTestId(`map-node-topic:${TOPIC}`).boundingBox())!;
      const x = box.x + box.width - 12;
      const y = box.y + box.height / 2;
      await page.mouse.move(x, y);
      await page.mouse.down();
      await page.mouse.move(x + (box.x + 12 - root.x), y + (box.y + 12 - root.y), { steps: 8 });
      await page.mouse.up();
    }
    await page.waitForTimeout(400);
    await shot(page, 'mind-map-topic', size);
  });
}
