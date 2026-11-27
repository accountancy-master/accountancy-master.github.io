import { mkdirSync } from 'node:fs';
import { expect, test, type Locator, type Page } from '@playwright/test';
import type { Question } from '../src/content/types';
import { showFigure } from '../src/engine/formats';
import { SHEET_KINDS, buildWorksheet, parseWorksheetCode, sheetQuestions, worksheetCode, type SheetSpec, type Worksheet } from '../src/learning/worksheet';
import { journalRows, ledgerLayout, setRows, shortAnswer } from '../src/learning/worksheetLayout';
import { CLASS11, CLASS12, createProfile } from './helpers';

// Worksheets: the builder, a sheet made from its code, every kind of question laid out for paper, the answer key, the
// print (no navigation) and the sheet on a phone. What a code must make is worked out here from the same code the app
// reads, so the page is held to exactly the questions the code names.

const TWO_TOPICS = ['ledger', 'trial-balance'];

/**
 * A sheet of two Class 12 topics, ten questions, every kind, that has a ledger account, a statement that prints
 * figures, a set of entries, a case study, a choice and a figure: the first seed that gives all of them.
 */
function sampleSheet(): Worksheet {
  for (let seed = 1; seed < 400; seed++) {
    const spec: SheetSpec = { courseId: CLASS12, mode: 'topics', topicIds: ['dissolution-of-partnership', 'financial-statement-analysis'], kinds: [...SHEET_KINDS], difficulty: 'mixed', count: 10, seed };
    const sheet = buildWorksheet(spec);
    const qs = sheetQuestions(sheet);
    const has = (test: (q: Question) => boolean) => qs.some(test);
    if (
      has((q) => q.type === 'account') &&
      has((q) => q.type === 'statement' && q.givenColumns !== undefined) &&
      has((q) => q.type === 'journal_set') &&
      has((q) => q.type === 'mcq') &&
      has((q) => q.type === 'numeric') &&
      sheet.items.some((i) => i.kind === 'case')
    )
      return sheet;
  }
  throw new Error('no sample sheet with every kind');
}
const SAMPLE = sampleSheet();
const href = (code: string) => `/worksheets/sheet?code=${code}`;

/** The ids of the questions of every numbered item on the page, in order. */
async function pageIds(page: Page): Promise<string[]> {
  return page.locator('[data-testid="ws-sheet"] [data-ids]').evaluateAll((els) => els.flatMap((e) => (e.getAttribute('data-ids') ?? '').split(' ')));
}

async function noSidewaysScroll(page: Page, what: string) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), what).toBe(true);
  // Nothing sticks out of the main column either: a wide table scrolls inside its own box.
  expect(await page.locator('#main').evaluate((e) => e.scrollWidth <= e.clientWidth), what).toBe(true);
}

test('a sheet of two topics and ten questions is made by the builder, and its code makes it again exactly', async ({ page }) => {
  await createProfile(page, 'Asha');
  await page.goto('/worksheets');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Worksheets');
  await page.getByTestId('ws-topics-none').click();
  await expect(page.getByTestId('ws-make')).toBeDisabled();
  await expect(page.getByTestId('ws-make-why')).toHaveText('Tick at least one topic.');
  for (const id of TWO_TOPICS) await page.getByTestId(`ws-topic-${id}`).check();
  await page.getByTestId('ws-count-10').click();
  await page.getByTestId('ws-make').click();

  await expect(page).toHaveURL(/\/worksheets\/sheet\?code=W11-/);
  const code = new URL(page.url()).searchParams.get('code')!;
  const parsed = parseWorksheetCode(code);
  expect(parsed.ok).toBe(true);
  if (!parsed.ok) return;
  expect(parsed.spec).toMatchObject({ courseId: CLASS11, mode: 'topics', topicIds: TWO_TOPICS, count: 10 });
  const expected = buildWorksheet(parsed.spec);

  await expect(page.getByTestId('ws-sheet').locator('section[data-ids]')).toHaveCount(10);
  await expect(page.getByTestId('ws-code')).toHaveText(code);
  await expect(page.getByTestId('ws-sheet-code')).toHaveText(code);
  await expect(page.getByTestId('ws-marks-box')).toHaveText(`/ ${expected.marks}`);
  const first = await pageIds(page);
  expect(first).toEqual(sheetQuestions(expected).map((q) => q.id));

  // The same address in a new visit: the same questions, in the same order.
  await page.goto('/home');
  await page.goto(href(code));
  await expect(page.getByTestId('ws-sheet').locator('section[data-ids]')).toHaveCount(10);
  expect(await pageIds(page)).toEqual(first);

  // "New sheet" draws another seed: the same choices, other questions.
  await page.getByTestId('ws-new').click();
  await expect(page).not.toHaveURL(new RegExp(code));
  const other = parseWorksheetCode(new URL(page.url()).searchParams.get('code')!);
  expect(other.ok && other.spec.mode === 'topics' && other.spec.topicIds).toEqual(TWO_TOPICS);
  await expect(page.getByTestId('ws-sheet').locator('section[data-ids]')).toHaveCount(10);
  expect(await pageIds(page)).not.toEqual(first);

  // "Change the choices" goes back to the builder with these choices made.
  await page.getByTestId('ws-change').click();
  await expect(page).toHaveURL(/\/worksheets\?code=/);
  await expect(page.getByTestId('ws-topic-ledger')).toBeChecked();
  await expect(page.getByTestId('ws-topic-journal-entries')).not.toBeChecked();
  await expect(page.getByTestId('ws-count-10')).toHaveAttribute('aria-pressed', 'true');
});

test('every kind of question is laid out for paper, and the answer key answers each one', async ({ page }) => {
  test.setTimeout(90_000);
  await createProfile(page, 'Asha', { courseId: CLASS12 });
  await page.goto(href(SAMPLE.code));
  const sheet = page.getByTestId('ws-sheet');
  const key = page.getByTestId('ws-key');
  await expect(sheet.locator('section[data-ids]')).toHaveCount(SAMPLE.items.length);
  expect(await pageIds(page)).toEqual(sheetQuestions(SAMPLE).map((q) => q.id));
  await expect(page.getByTestId('ws-title')).toHaveText(SAMPLE.title);

  for (const item of SAMPLE.items) {
    const block = sheet.getByTestId(`ws-q-${item.number}`);
    await expect(block.getByTestId('ws-marks').first(), `marks of ${item.number}`).toHaveText(`[${item.marks} ${item.marks === 1 ? 'mark' : 'marks'}]`);
    await expect(block).toHaveAttribute('data-kind', item.kind);
    const answer = key.getByTestId(`ws-key-${item.number}`);
    await expect(answer).toHaveAttribute('data-ids', item.questions.map((q) => q.id).join(' '));
    if (item.kind === 'case') {
      // The case once, then its parts.
      await expect(block.getByTestId('ws-case-text')).toHaveCount(1);
      await expect(block.getByTestId('ws-case-text')).toContainText(item.questions[0].context!.split('\n')[0]);
      for (const [i, q] of item.questions.entries()) {
        const label = `${item.number}(${String.fromCharCode(97 + i)})`;
        await expect(block.getByTestId(`ws-part-${label}`)).toHaveAttribute('data-type', q.type);
        await checkBody(block.getByTestId(`ws-part-${label}`), answer.getByTestId(`ws-key-part-${label}`), q);
      }
    } else {
      await checkBody(block, answer, item.questions[0]);
    }
  }
});

/** One question on the sheet, and its answer in the key. */
async function checkBody(sheet: Locator, key: Locator, q: Question) {
  await expect(sheet).toContainText(q.prompt.split('\n')[0]);
  const short = shortAnswer(q);
  if (short !== null) await expect(key.getByTestId('ws-key-answer')).toHaveText(short);
  switch (q.type) {
    case 'mcq':
      await expect(sheet.getByTestId('ws-options').locator('li')).toHaveText(q.options.map((o) => `(${o.id}) ${o.text}`));
      break;
    case 'true_false':
      await expect(sheet.getByTestId('ws-tf-box')).toBeVisible();
      break;
    case 'numeric':
      await expect(sheet.getByTestId('ws-answer-line')).toBeVisible();
      if (q.unit === 'rupees') await expect(sheet.getByTestId('ws-answer-line')).toContainText('₹');
      if (q.unit === 'percent') await expect(sheet.getByTestId('ws-answer-line')).toContainText('%');
      if (q.unit === 'times') await expect(sheet.getByTestId('ws-answer-line')).toContainText('times');
      break;
    case 'journal_entry': {
      await expect(sheet.getByTestId('ws-journal').getByTestId('ws-write-row')).toHaveCount(journalRows(q.expected.length));
      await expect(sheet.getByTestId('ws-journal').locator('th')).toHaveText(['Date', 'Particulars', 'L.F.', 'Debit (₹)', 'Credit (₹)']);
      const rows = key.getByTestId('ws-key-journal').locator('tbody tr');
      await expect(rows).toHaveCount(q.expected.length);
      await expect(rows.filter({ hasText: 'Dr.' })).toHaveCount(q.expected.filter((l) => l.side === 'Dr').length);
      break;
    }
    case 'journal_set': {
      await expect(sheet.getByTestId('ws-set-items').locator('li')).toHaveCount(q.entries.length);
      await expect(sheet.getByTestId('ws-set-journal').getByTestId('ws-write-row')).toHaveCount(setRows(q));
      await expect(key.getByTestId('ws-key-journal').locator('tbody tr')).toHaveCount(q.entries.reduce((n, e) => n + e.expected.length, 0));
      break;
    }
    case 'account': {
      const layout = ledgerLayout(q);
      const table = sheet.getByTestId('ws-ledger');
      await expect(table).toContainText(q.title);
      await expect(table.locator('thead tr').nth(1)).toContainText(layout.sideTitles[0]);
      await expect(table.locator('thead tr').nth(2).locator('th')).toHaveText([...layout.heads, ...layout.heads]);
      await expect(table.getByTestId('ws-write-row')).toHaveCount(layout.periods.reduce((n, p) => n + p.rows, 0) + layout.below);
      // The key: the account completed, with the totals of each side.
      const filled = key.getByTestId('ws-key-ledger');
      for (const row of [...q.sides[0].rows, ...q.sides[1].rows]) await expect(filled).toContainText(row.label);
      const total = q.sides[0].rows.reduce((s, r) => s + r.amounts[0], 0);
      await expect(filled.getByTestId('ws-ledger-total').first()).toContainText(showFigure(total));
      break;
    }
    case 'statement': {
      const table = sheet.getByTestId('ws-statement');
      await expect(table).toContainText(q.title);
      if (q.givenColumns) {
        // The figures the statement gives are printed in their cells, as the question gives them.
        const printed = q.rows.filter((r) => r.given !== false);
        await expect(table.getByTestId('ws-printed-row')).toHaveCount(printed.length);
        const firstRow = printed[0];
        const c = q.givenColumns.findIndex(Boolean);
        await expect(table.getByTestId('ws-printed-row').first()).toContainText(firstRow.label);
        await expect(table.getByTestId('ws-printed-row').first().locator('td[data-printed="true"]').first()).toHaveText(showFigure(firstRow.amounts[c], q.columnKinds?.[c]));
      }
      const filled = key.getByTestId('ws-key-statement');
      for (const row of q.rows) await expect(filled).toContainText(row.label);
      break;
    }
  }
  if (q.type === 'account' || q.type === 'statement' || q.type === 'numeric') await expect(key.getByTestId('ws-key-working').first()).toContainText(q.working[0].slice(0, 30));
}

test('the print leaves out the navigation and the buttons, and prints the sheet, the key or both', async ({ page }, info) => {
  await createProfile(page, 'Asha');
  const code = worksheetCode({ courseId: CLASS11, mode: 'topics', topicIds: TWO_TOPICS, kinds: [...SHEET_KINDS], difficulty: 'mixed', count: 10, seed: 7 });
  await page.goto(href(code));
  await expect(page.getByTestId('ws-sheet')).toBeVisible();
  const laptop = info.project.name === 'laptop';
  if (laptop) await expect(page.getByRole('complementary', { name: 'Sidebar' })).toBeVisible();
  await page.emulateMedia({ media: 'print' });
  await expect(page.getByRole('complementary', { name: 'Sidebar' })).toBeHidden();
  await expect(page.getByRole('navigation', { name: 'Main' })).toBeHidden();
  await expect(page.getByTestId('topbar-title')).toBeHidden();
  await expect(page.getByTestId('ws-toolbar')).toBeHidden();
  await expect(page.getByTestId('ws-sheet')).toBeVisible();
  await expect(page.getByTestId('ws-key')).toBeVisible();
  // Black on white, the key on a page of its own.
  const look = await page.evaluate(() => {
    const sheet = document.querySelector('[data-testid="ws-sheet"]')!;
    const key = document.querySelector('[data-testid="ws-key"]')!;
    return { color: getComputedStyle(sheet).color, background: getComputedStyle(sheet).backgroundColor, breakBefore: getComputedStyle(key).breakBefore };
  });
  expect(look).toEqual({ color: 'rgb(0, 0, 0)', background: 'rgb(255, 255, 255)', breakBefore: 'page' });

  await page.emulateMedia({ media: 'screen' });
  await page.getByTestId('ws-print-key').click();
  await page.emulateMedia({ media: 'print' });
  await expect(page.getByTestId('ws-sheet')).toBeHidden();
  await expect(page.getByTestId('ws-key')).toBeVisible();
  await page.emulateMedia({ media: 'screen' });
  await page.getByTestId('ws-print-sheet').click();
  await page.emulateMedia({ media: 'print' });
  await expect(page.getByTestId('ws-sheet')).toBeVisible();
  await expect(page.getByTestId('ws-key')).toBeHidden();
});

test('on a laptop the sidebar has Worksheets marked, on the builder and on a sheet', async ({ page }, info) => {
  test.skip(info.project.name !== 'laptop', 'the sidebar is on the laptop');
  await createProfile(page, 'Asha');
  const code = worksheetCode({ courseId: CLASS11, mode: 'paper', paper: 'half', seed: 3 });
  for (const path of ['/worksheets', href(code)]) {
    await page.goto(path);
    const sidebar = page.getByRole('complementary', { name: 'Sidebar' });
    await expect(sidebar, path).toBeVisible();
    await expect(sidebar.getByTestId('nav-worksheets'), path).toHaveAttribute('aria-current', 'page');
    await expect(sidebar.locator('[aria-current="page"]')).toHaveCount(1);
  }
  await expect(page.getByTestId('topbar-title')).toHaveText(code);
  // A paper in the board's pattern: its parts, its marks and its time.
  await expect(page.getByTestId('ws-title')).toHaveText('Half-yearly paper 3');
  await expect(page.getByTestId('ws-marks-box')).toHaveText('/ 40');
});

test('at 360 px the builder and a sheet with every kind fit the width', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 780 });
  await createProfile(page, 'Asha', { courseId: CLASS12 });
  await page.goto('/worksheets');
  await expect(page.getByTestId('ws-make')).toBeVisible();
  await noSidewaysScroll(page, 'builder');
  await page.goto(href(SAMPLE.code));
  await expect(page.getByTestId('ws-key').locator('section[data-ids]')).toHaveCount(SAMPLE.items.length);
  await noSidewaysScroll(page, 'sheet');
});

test('a code typed wrong, or one that names nothing, is refused with a reason', async ({ page }) => {
  await createProfile(page, 'Asha');
  const code = worksheetCode({ courseId: CLASS11, mode: 'topics', topicIds: TWO_TOPICS, kinds: ['quick'], difficulty: 'easy', count: 20, seed: 99 });
  // Two characters swapped: the first two side by side that differ.
  const at = [...code].findIndex((ch, i) => i >= 4 && /\w/.test(ch) && /\w/.test(code[i + 1] ?? '') && code[i + 1] !== ch);
  const swapped = `${code.slice(0, at)}${code[at + 1]}${code[at]}${code.slice(at + 2)}`;
  await page.goto(href(swapped));
  await expect(page.getByTestId('ws-bad-code')).toContainText('mistake');
  await page.goto('/worksheets');
  await page.getByTestId('ws-open-code').fill('not a code');
  await page.getByTestId('ws-open').click();
  await expect(page.getByTestId('ws-open-problem')).toContainText('W11-');
  await page.getByTestId('ws-open-code').fill(code.toLowerCase());
  await page.getByTestId('ws-open').click();
  await expect(page).toHaveURL(new RegExp(`code=${code}`));
  await expect(page.getByTestId('ws-sheet').locator('section[data-ids]')).toHaveCount(20);
});

test('the topic page and the quick sheet lead to a worksheet of their topic, and Go to finds Worksheets', async ({ page }, info) => {
  await createProfile(page, 'Asha');
  await page.goto('/topics/ledger');
  await page.getByTestId('topic-worksheet').click();
  await expect(page).toHaveURL(/\/worksheets\?topic=ledger$/);
  await expect(page.getByTestId('ws-topic-ledger')).toBeChecked();
  await expect(page.getByTestId('ws-topic-journal-entries')).not.toBeChecked();
  await page.goto('/sheet/trial-balance');
  await page.getByTestId('sheet-worksheet').click();
  await expect(page).toHaveURL(/\/worksheets\?topic=trial-balance$/);
  await expect(page.getByTestId('ws-topic-trial-balance')).toBeChecked();

  await page.goto('/home');
  if (info.project.name === 'phone') await page.getByTestId('goto-open').click();
  // Ctrl K works once the page has hydrated: press it until Go to opens.
  else await expect(async () => { await page.keyboard.press('Control+k'); await expect(page.getByTestId('goto-input')).toBeVisible({ timeout: 1000 }); }).toPass();
  await page.getByTestId('goto-input').fill('worksheets');
  await expect(page.getByTestId('goto-result').first()).toHaveAttribute('data-href', '/worksheets');
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(/\/worksheets$/);
});

// Samples for docs/screenshots/revision: the builder and a sheet at 1440 x 900, and a PDF of the sheet and its key.
// Not part of the normal run: `SHOTS=1 npx playwright test e2e/worksheets.spec.ts --project=laptop`.
test('samples: screenshots of the builder and a sheet, and a PDF of a sheet with its key', async ({ page }, info) => {
  test.skip(process.env.SHOTS !== '1' || info.project.name !== 'laptop', 'samples are only made when SHOTS=1, once');
  test.setTimeout(120_000);
  mkdirSync('docs/screenshots/revision', { recursive: true });
  await page.setViewportSize({ width: 1440, height: 900 });
  await createProfile(page, 'Asha', { courseId: CLASS12 });
  await page.goto('/worksheets');
  await page.getByTestId('ws-topics-none').click();
  for (const id of ['dissolution-of-partnership', 'financial-statement-analysis']) await page.getByTestId(`ws-topic-${id}`).check();
  await page.getByTestId('ws-count-10').click();
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({ path: 'docs/screenshots/revision/worksheets-builder-desktop.png', animations: 'disabled' });
  await page.goto(href(SAMPLE.code));
  await expect(page.getByTestId('ws-key').locator('section[data-ids]')).toHaveCount(SAMPLE.items.length);
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({ path: 'docs/screenshots/revision/worksheet-sheet-desktop.png', animations: 'disabled' });
  await page.getByTestId('ws-key').scrollIntoViewIfNeeded();
  await page.screenshot({ path: 'docs/screenshots/revision/worksheet-key-desktop.png', animations: 'disabled' });
  await page.emulateMedia({ media: 'print' });
  await page.pdf({ path: 'docs/screenshots/revision/worksheet-sample.pdf', format: 'A4', preferCSSPageSize: true, printBackground: false });
  // And on a phone.
  await page.emulateMedia({ media: 'screen' });
  await page.setViewportSize({ width: 360, height: 740 });
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.locator('[data-testid="ws-q-5"]').scrollIntoViewIfNeeded();
  await page.screenshot({ path: 'docs/screenshots/revision/worksheet-sheet-phone.png', animations: 'disabled' });
});
