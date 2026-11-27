import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { EQUATION_LAB, LABS } from '../src/simulator/labs';
import WRITTEN_11 from '../src/content/written/cbse11';
import { CLASS11_PACKS, createProfile } from './helpers';

// Accessibility, checked by axe-core (WCAG 2.2 A and AA rules) on every page a learner reaches from the navigation,
// a topic, a lesson, a played question, and every lab of the simulator in each of its modes. A violation of serious
// or critical impact fails the test, with the rule, the elements and how to fix it in the message. Each is checked in
// the light theme and in the dark one: the app follows the system's theme unless the learner chose one, so the dark
// theme is reached by asking for it as the system would (prefers-color-scheme: dark).
test.use({ reducedMotion: 'reduce' });

const SCHEMES = ['light', 'dark'] as const;

// The labs in three groups, so the groups run at once.
const LAB_GROUPS = [0, 1, 2].map((g) => LABS.filter((l) => l.ready && l.id !== EQUATION_LAB).filter((_, i) => i % 3 === g));

const PAGES = ['/home', '/topics', '/practice', '/practice/cards', '/sheets', '/glossary', '/inside', '/maps', '/playground', '/practice/marathon', '/cases', '/exam', '/mock', '/worksheets', '/mistakes', '/progress', '/settings', '/simulator', '/written'];

async function scan(page: Page, where: string): Promise<string[]> {
  const result = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa']).analyze();
  return result.violations
    .filter((v) => v.impact === 'serious' || v.impact === 'critical')
    .map((v) => `${where} · ${v.id} (${v.impact}): ${v.help}\n    ${v.nodes.slice(0, 4).map((n) => `${n.target.join(' ')}  ${n.html.slice(0, 160)}  ${n.any[0]?.message ?? ''}`).join('\n    ')}`);
}

// The pages in groups of five, so the groups run at once (one long test holds one worker).
const PAGE_GROUPS = Array.from({ length: Math.ceil(PAGES.length / 5) }, (_, g) => PAGES.slice(g * 5, g * 5 + 5));

for (const scheme of SCHEMES) {
  for (const pages of PAGE_GROUPS) {
    test(`the pages of the navigation have no serious accessibility violation: ${pages.join(', ')} (${scheme} theme)`, async ({ page }) => {
      test.setTimeout(3 * 60_000);
      await page.emulateMedia({ colorScheme: scheme });
      await createProfile(page, 'Varun', { unlockAll: true });
      const found: string[] = [];
      for (const path of pages) {
        await page.goto(path);
        await page.waitForLoadState('networkidle');
        found.push(...(await scan(page, `${scheme} ${path}`)));
      }
      expect(found, found.join('\n')).toEqual([]);
    });
  }

  test(`a topic, a lesson, a question and a written answer have no serious accessibility violation (${scheme} theme)`, async ({ page }) => {
    test.setTimeout(3 * 60_000);
    await page.emulateMedia({ colorScheme: scheme });
    await createProfile(page, 'Varun', { unlockAll: true });
    const found: string[] = [];
    const topic = CLASS11_PACKS[1];
    await page.goto(`/topics/${topic.topicId}`);
    await page.waitForLoadState('networkidle');
    found.push(...(await scan(page, `${scheme} /topics/${topic.topicId}`)));
    // A lesson, then a question being answered.
    await page.goto(`/play/${topic.levels[0].id}`);
    await page.waitForLoadState('networkidle');
    found.push(...(await scan(page, `${scheme} /play/${topic.levels[0].id}`)));
    const practice = topic.levels.find((l) => l.generate);
    if (practice) {
      await page.goto(`/play/${practice.id}`);
      await expect(page.getByTestId('question')).toBeVisible({ timeout: 60_000 });
      found.push(...(await scan(page, `${scheme} /play/${practice.id}`)));
    }
    // A written answer: the question as set, then the model answer beside the learner's own with the points to tick,
    // then the marks, and the question waiting in Mistakes.
    const written = WRITTEN_11.find((q) => q.table) ?? WRITTEN_11[0];
    if (written) {
      const where = `/written/${written.topicId}?q=${written.id}`;
      await page.goto(where);
      await expect(page.getByTestId('written-step')).toBeVisible({ timeout: 60_000 });
      await page.getByTestId('written-hint').click();
      found.push(...(await scan(page, `${scheme} ${where} (writing)`)));
      await page.getByTestId('written-text').fill(written.points.map((p) => p.keywords[0]).join('. '));
      await page.getByTestId('written-check').click();
      found.push(...(await scan(page, `${scheme} ${where} (marking)`)));
      // Nothing ticked: below full marks, so it waits in Mistakes.
      for (const [i] of written.points.entries()) await page.getByTestId(`written-tick-${i}`).uncheck();
      await page.getByTestId('written-confirm').click();
      await expect(page.getByTestId('written-result')).toBeVisible();
      found.push(...(await scan(page, `${scheme} ${where} (marked)`)));
      await page.goto('/mistakes');
      await expect(page.getByTestId('mistakes-written-item').first()).toBeVisible();
      found.push(...(await scan(page, `${scheme} /mistakes (to rewrite)`)));
    }
    expect(found, found.join('\n')).toEqual([]);
  });

  for (const [g, labs] of LAB_GROUPS.entries()) {
    test(`every lab of the simulator, in each mode, has no serious accessibility violation (group ${g + 1} of ${LAB_GROUPS.length}, ${scheme} theme)`, async ({ page }, info) => {
      test.skip(info.project.name !== 'laptop', 'once is enough for the labs');
      test.setTimeout(4 * 60_000);
      await page.emulateMedia({ colorScheme: scheme });
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
          found.push(...(await scan(page, `${scheme} ${lab.id} ${mode}`)));
        }
      }
      expect(found, found.join('\n')).toEqual([]);
    });
  }
}
