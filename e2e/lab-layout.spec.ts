import { expect, test, type Page } from '@playwright/test';
import { EQUATION_LAB, LABS } from '../src/simulator/labs';
import { createProfile } from './helpers';

// Every lab of the simulator, in each of its modes, at every width from a phone to a wide screen: nothing makes the
// page scroll sideways, and no figure or word spills out of its cell of a table (as when the two sides of a ledger
// account are squeezed side by side into a narrow column, and the date runs into the amount). Each walk-through is
// stepped to its end, so that what fills in as it plays is measured too.
test.use({ reducedMotion: 'reduce' });

const WIDTHS = [360, 768, 1024, 1280, 1536, 1920] as const;
const LABS_SHOWN = LABS.filter((l) => l.ready && l.id !== EQUATION_LAB);

/** What overflows: the page sideways, and every table cell whose content is wider than the cell. */
async function overflow(page: Page) {
  return page.evaluate(() => {
    const out: string[] = [];
    if (document.documentElement.scrollWidth > window.innerWidth + 1) out.push(`page ${document.documentElement.scrollWidth} > ${window.innerWidth}`);
    for (const cell of document.querySelectorAll<HTMLElement>('main td, main th')) {
      if (cell.offsetParent === null || cell.closest('[aria-hidden="true"], .sr-only')) continue;
      if (cell.scrollWidth > cell.clientWidth + 1) {
        const where = cell.closest('[data-testid]')?.getAttribute('data-testid') ?? '';
        out.push(`${where}: "${(cell.textContent ?? '').trim().slice(0, 40)}" ${cell.scrollWidth} > ${cell.clientWidth}`);
      }
    }
    return out;
  });
}

/** Steps a walk-through to its end, if the screen has one. */
async function stepToEnd(page: Page, prefix: string) {
  const step = page.getByTestId(`${prefix}-step`);
  for (let i = 0; i < 80 && (await step.count()) > 0 && (await step.first().isEnabled()); i++) await step.first().click();
}

// The labs in three groups, so the groups of each width run at once (one long test holds one worker).
const GROUPS = [0, 1, 2].map((g) => LABS_SHOWN.filter((_, i) => i % 3 === g));

for (const width of WIDTHS) for (const [g, labs] of GROUPS.entries()) {
  test(`no lab overflows at ${width} px, in any mode (group ${g + 1} of 3: ${labs.map((l) => l.id).join(', ')})`, async ({ page }, info) => {
    test.skip(info.project.name !== 'laptop', 'the widths are set here, once');
    test.setTimeout(8 * 60_000);
    await page.setViewportSize({ width, height: 900 });
    await createProfile(page, 'Varun', { keepDeviceDefaults: true });
    const found: string[] = [];
    for (const lab of labs) {
      const prefix = `lab-${lab.id}`;
      await page.goto(`/simulator?lab=${lab.id}`);
      await expect(page.getByTestId(prefix)).toBeVisible({ timeout: 60_000 });
      await expect(page.getByTestId('lab-loading')).toHaveCount(0, { timeout: 60_000 });
      for (const mode of ['watch', 'play', 'try'] as const) {
        const pick = page.getByTestId(`${prefix}-mode-${mode}`);
        if ((await pick.count()) === 0) continue;
        await pick.click();
        if (mode === 'watch') await stepToEnd(page, prefix);
        for (const o of await overflow(page)) found.push(`${lab.id} ${mode}: ${o}`);
      }
    }
    expect(found, found.join('\n')).toEqual([]);
  });
}
