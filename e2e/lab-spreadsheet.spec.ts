import { expect, test, type Page } from '@playwright/test';
import { askRng, sheetAsk } from '../src/simulator/spreadsheet/tryit';
import { CLASS12, createProfile } from './helpers';

// The lab "Accounts in a spreadsheet" (src/simulator/spreadsheet, components/simulator/labs/SpreadsheetLab.tsx).
// With reduced motion nothing flies, so a walk-through plays quickly.
test.use({ reducedMotion: 'reduce' });

const LAB = '/simulator?lab=spreadsheet';
const SEED = 7;
const P = 'lab-spreadsheet';
const noSidewaysScroll = (page: Page) => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);
const cell = (page: Page, addr: string) => page.getByTestId(`${P}-cell-${addr}`);

/** Types into a cell through the formula bar, and keeps it with Enter. */
async function enter(page: Page, addr: string, text: string) {
  await cell(page, addr).click();
  await page.getByTestId(`${P}-formula`).fill(text);
  await page.getByTestId(`${P}-formula`).press('Enter');
}

test('watch: the bank reconciliation statement and the straight line schedule are built formula by formula', async ({ page }) => {
  test.setTimeout(90_000);
  await createProfile(page, 'Varun', { keepDeviceDefaults: true });
  await page.goto(LAB);
  await expect(page.getByTestId(`${P}-about`)).toContainText('debit balance of ₹48,000');
  await page.getByTestId(`${P}-play`).click();
  await expect(page.getByTestId(`${P}-stage`)).toHaveAttribute('data-status', 'done', { timeout: 40_000 });
  await expect(cell(page, 'B8')).toHaveAttribute('data-shown', '₹43,600');
  await expect(cell(page, 'C7')).toHaveAttribute('data-formula', '=SUM(C2:C6)');
  await expect(cell(page, 'B9')).toHaveAttribute('data-shown', 'Credit balance');
  await expect(page.getByTestId(`${P}-announce`)).toContainText('B9 shows "Credit balance"');

  // The straight line schedule: the SLN formula copied down stays the same, every reference being absolute.
  await page.getByTestId(`${P}-workbook`).selectOption('sln');
  await page.getByTestId(`${P}-step`).click();
  await expect(cell(page, 'B6')).toHaveAttribute('data-shown', '₹37,500');
  await expect(page.getByTestId(`${P}-reading`)).toContainText('gives ₹37,500');
  await page.getByTestId(`${P}-step`).click();
  await expect(cell(page, 'B9')).toHaveAttribute('data-formula', '=SLN($B$1,$B$2,$B$3)');
  await expect(page.getByTestId(`${P}-copycard`)).toContainText('$B$1 stays');
  await page.getByTestId(`${P}-step`).click();
  await page.getByTestId(`${P}-step`).click();
  // The running total: its first end fixed, its last end moving.
  await expect(cell(page, 'C9')).toHaveAttribute('data-formula', '=SUM($B$6:B9)');
  await expect(page.getByTestId(`${P}-copycard`)).toContainText('$B$6:B6 → $B$6:B7');
  await page.getByTestId(`${P}-step`).click();
  await page.getByTestId(`${P}-step`).click();
  await expect(cell(page, 'D9')).toHaveAttribute('data-shown', '₹10,000');
  await expect(page.getByTestId(`${P}-now`)).toContainText('the book value is ₹10,000, the salvage value');
  // Back a step: the book values are not there yet.
  await page.getByTestId(`${P}-back`).click();
  await expect(cell(page, 'D9')).toHaveAttribute('data-shown', '');
  // The formulas, shown in their cells.
  await page.getByTestId(`${P}-show-formulas`).click();
  await expect(cell(page, 'C7')).toContainText('=SUM($B$6:B7)');
  // The grid is walked with the arrow keys, and the formula bar reads the cell.
  await cell(page, 'C7').click();
  await page.keyboard.press('ArrowDown');
  await expect(page.getByTestId(`${P}-name`)).toHaveText('C8');
  await expect(page.getByTestId(`${P}-formula`)).toHaveValue('=SUM($B$6:B8)');
});

test('play: typing, copying with relative and absolute references, errors with their reasons, and a chart', async ({ page }) => {
  test.setTimeout(90_000);
  await createProfile(page, 'Varun', { keepDeviceDefaults: true });
  await page.goto(LAB);
  await page.getByTestId(`${P}-mode-play`).click();
  await page.getByTestId(`${P}-workbook`).selectOption('wdv');
  await expect(cell(page, 'C5')).toHaveAttribute('data-shown', '₹1,00,000');

  // From the keyboard: the rate typed into B2, and every year worked out again.
  await cell(page, 'B2').click();
  await page.keyboard.type('20%', { delay: 60 });
  await page.keyboard.press('Enter');
  await expect(cell(page, 'B2')).toHaveAttribute('data-shown', '20%');
  await expect(cell(page, 'C5')).toHaveAttribute('data-shown', '₹80,000');
  await expect(cell(page, 'C7')).toHaveAttribute('data-shown', '₹51,200');
  await expect(page.getByTestId(`${P}-name`)).toHaveText('B3');

  // The rate left relative: copied down, it moves to B3 and B4, and the depreciation is nil.
  await enter(page, 'C5', '=b5*b2');
  await expect(cell(page, 'C5')).toHaveAttribute('data-formula', '=B5*B2');
  await cell(page, 'C5').click();
  await page.getByTestId(`${P}-copy`).click();
  await cell(page, 'C6').click();
  await cell(page, 'C7').click({ modifiers: ['Shift'] });
  await expect(page.getByTestId(`${P}-name`)).toHaveText('C6:C7');
  await page.getByTestId(`${P}-paste`).click();
  await expect(cell(page, 'C6')).toHaveAttribute('data-formula', '=B6*B3');
  await expect(cell(page, 'C6')).toHaveAttribute('data-shown', '₹0');
  await expect(page.getByTestId(`${P}-copycard`)).toContainText('B2 → B3');
  await page.getByTestId(`${P}-undo`).click();
  await page.getByTestId(`${P}-undo`).click();
  await expect(cell(page, 'C6')).toHaveAttribute('data-formula', '=B6*$B$2');
  await expect(cell(page, 'C6')).toHaveAttribute('data-shown', '₹64,000');

  // Errors, each with its reason; a formula that cannot be read is refused.
  await page.getByTestId(`${P}-workbook`).selectOption('blank');
  await enter(page, 'A1', '100');
  await enter(page, 'A2', '=A1/B1');
  await expect(cell(page, 'A2')).toHaveAttribute('data-shown', '#DIV/0!');
  await cell(page, 'A2').click();
  await expect(page.getByTestId(`${P}-reading`)).toContainText('B1 is nil');
  await enter(page, 'A3', '=SUMM(A1)');
  await expect(cell(page, 'A3')).toHaveAttribute('data-shown', '#NAME?');
  await cell(page, 'A3').click();
  await expect(page.getByTestId(`${P}-reading`)).toContainText('did you mean SUM?');
  await enter(page, 'A4', '=(A1+2');
  await expect(page.getByTestId(`${P}-problem`)).toContainText('not closed');
  await page.getByTestId(`${P}-formula`).press('Escape');
  await expect(cell(page, 'A4')).toHaveAttribute('data-shown', '');
  // Copied up off the sheet: #REF!.
  await enter(page, 'B2', '=A1*2');
  await cell(page, 'B2').click();
  await page.keyboard.press('Control+c');
  await cell(page, 'B1').click();
  await page.keyboard.press('Control+v');
  await expect(cell(page, 'B1')).toHaveAttribute('data-formula', '=#REF!*2');
  await expect(cell(page, 'B1')).toHaveAttribute('data-shown', '#REF!');

  // A chart of a range follows the figures.
  await page.getByTestId(`${P}-workbook`).selectOption('chart');
  await expect(page.getByTestId(`${P}-chart`)).toHaveAttribute('data-kind', 'pie');
  await enter(page, 'B3', '126000');
  await expect(page.getByTestId(`${P}-chart-key`)).toContainText('Rent ₹1,26,000');
  await expect(cell(page, 'D3')).toHaveAttribute('data-shown', '105');
  await page.getByTestId(`${P}-chart-bar`).click();
  await expect(page.getByTestId(`${P}-chart`)).toHaveAttribute('data-kind', 'bar');
});

test('try it: a figure wrong and right, a copied formula, the wrong reference and which formula', async ({ page }) => {
  await createProfile(page, 'Varun', { keepDeviceDefaults: true });
  await page.goto(`${LAB}&seed=${SEED}`);
  await page.getByTestId(`${P}-mode-try`).click();
  const first = sheetAsk('value', askRng(SEED, 'value', 0));
  await expect(page.getByTestId(`${P}-try-prompt`)).toHaveText(first.prompt);
  await expect(page.getByTestId(`${P}-try-cell-C2`)).toHaveAttribute('data-shown', '?');
  await page.getByTestId(`${P}-try-answer`).fill('1');
  await page.getByTestId(`${P}-try-check`).click();
  await expect(page.getByTestId(`${P}-try-feedback`)).toHaveAttribute('data-correct', 'false');
  await expect(page.getByTestId(`${P}-try-feedback`)).toContainText(first.reason);
  await expect(page.getByTestId(`${P}-try-cell-C2`)).not.toHaveAttribute('data-shown', '?');
  await page.getByTestId(`${P}-try-next`).click();
  const second = sheetAsk('value', askRng(SEED, 'value', 1));
  if (second.answer.type !== 'figure') throw new Error('a figure was expected');
  await expect(page.getByTestId(`${P}-try-prompt`)).toHaveText(second.prompt);
  await page.getByTestId(`${P}-try-answer`).fill(String(second.answer.value));
  await page.getByTestId(`${P}-try-check`).click();
  await expect(page.getByTestId(`${P}-try-feedback`)).toHaveAttribute('data-correct', 'true');

  await page.getByTestId(`${P}-kind-copy`).click();
  const copy = sheetAsk('copy', askRng(SEED, 'copy', 0));
  if (copy.answer.type !== 'choice') throw new Error('a choice was expected');
  await page.getByTestId(`${P}-try-option-${copy.answer.correct}`).click();
  await page.getByTestId(`${P}-try-check`).click();
  await expect(page.getByTestId(`${P}-try-feedback`)).toHaveAttribute('data-correct', 'true');
  await expect(page.getByTestId(`${P}-try-cell-${copy.focus}`)).toHaveAttribute('data-formula', copy.after!.cells[copy.focus].input);

  await page.getByTestId(`${P}-kind-wrong-ref`).click();
  const wrong = sheetAsk('wrong-ref', askRng(SEED, 'wrong-ref', 0));
  if (wrong.answer.type !== 'token') throw new Error('a reference was expected');
  await page.getByTestId(`${P}-try-ref-${wrong.answer.correct}`).click();
  await page.getByTestId(`${P}-try-check`).click();
  await expect(page.getByTestId(`${P}-try-feedback`)).toHaveAttribute('data-correct', 'true');

  await page.getByTestId(`${P}-kind-which`).click();
  const which = sheetAsk('which', askRng(SEED, 'which', 0));
  if (which.answer.type !== 'choice') throw new Error('a choice was expected');
  const bad = which.answer.options.find((o) => o.id !== (which.answer as { correct: string }).correct)!;
  await page.getByTestId(`${P}-try-option-${bad.id}`).click();
  await page.getByTestId(`${P}-try-check`).click();
  await expect(page.getByTestId(`${P}-try-feedback`)).toHaveAttribute('data-correct', 'false');
  await expect(page.getByTestId(`${P}-try-feedback`)).toContainText('It would give');
  await expect(page.getByTestId(`${P}-try-score`)).toHaveText('3 right of 5 (not recorded)');
});

test('the shelf follows the choice of Part B', async ({ page }) => {
  await createProfile(page, 'Meera', { courseId: CLASS12 });
  await page.goto('/simulator');
  await expect(page.getByTestId('lab-shelf-12-option')).toContainText('Computerised Accounting option');
  await expect(page.getByTestId('lab-shelf-12-option').getByTestId('lab-pick-spreadsheet')).toBeVisible();
  await expect(page.getByTestId('lab-shelf-12-mine').getByTestId('lab-pick-spreadsheet')).toHaveCount(0);
  await page.goto('/settings');
  await page.getByTestId('part-b-computerised').click();
  await expect(page.getByTestId('part-b-computerised')).toHaveAttribute('aria-pressed', 'true');
  await page.goto('/simulator');
  await expect(page.getByTestId('lab-shelf-12-mine').getByTestId('lab-pick-spreadsheet')).toBeVisible();
  await expect(page.getByTestId('lab-shelf-12-option')).toContainText('Analysis of Financial Statements option');
  await expect(page.getByTestId('lab-shelf-12-option').getByTestId('lab-pick-ratios')).toBeVisible();
});

test('at 360 px no mode of the lab scrolls sideways: the grid scrolls inside its card', async ({ page }) => {
  test.setTimeout(60_000);
  await page.setViewportSize({ width: 360, height: 740 });
  await createProfile(page, 'Varun', { keepDeviceDefaults: true });
  await page.goto(LAB);
  await page.getByTestId(`${P}-workbook`).selectOption('loan');
  for (let i = 0; i < 10; i++) await page.getByTestId(`${P}-step`).click();
  await expect(page.getByTestId(`${P}-stage`)).toHaveAttribute('data-shown', '10');
  expect(await noSidewaysScroll(page)).toBe(true);
  for (const mode of ['play', 'try']) {
    await page.getByTestId(`${P}-mode-${mode}`).click();
    await expect(page.getByTestId(`${P}-panel-${mode}`)).toBeVisible();
    expect(await noSidewaysScroll(page), mode).toBe(true);
  }
});
