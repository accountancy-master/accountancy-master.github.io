import { expect, test, type Page } from '@playwright/test';
import { caseFromSeed } from '../src/simulator/trial-balance-fix/cases';
import { buildCase, errorsWhen, findError, totalsOf } from '../src/simulator/trial-balance-fix/model';
import { ASHA } from '../src/simulator/trial-balance-fix/cases';
import { narrationChoices } from '../src/simulator/trial-balance-fix/marking';
import { askRng, tfAsk } from '../src/simulator/trial-balance-fix/tryit';
import { createProfile } from './helpers';

// The lab "trial-balance-fix" of the simulator (/simulator?lab=trial-balance-fix): a month's books with errors in
// them, the ledger as rough work, a trial balance that will not agree, Suspense A/c, the rectifying entries and the
// corrected trial balance. With reduced motion every step fades.
test.use({ reducedMotion: 'reduce' });

const LAB = '/simulator?lab=trial-balance-fix';
const T = 'lab-trial-balance-fix';
const SEED = 7;
const noSidewaysScroll = (page: Page) => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);
const figure = (p: number) => (p / 100).toLocaleString('en-IN');

test('watch: Asha Stationers from the books to a corrected trial balance and profit', async ({ page }) => {
  test.setTimeout(90_000);
  await createProfile(page, 'Varun', { keepDeviceDefaults: true });
  await page.goto(LAB);
  await expect(page.getByTestId(`${T}-about`)).toContainText('Asha Stationers');
  for (let i = 0; i < 4; i++) await page.getByTestId(`${T}-step`).click();
  await expect(page.getByTestId(`${T}-stage`)).toHaveAttribute('data-shown', '4');
  await expect(page.getByTestId(`${T}-tb-total-dr`)).toHaveText('1,46,400');
  await expect(page.getByTestId(`${T}-tb-total-cr`)).toHaveText('1,58,000');
  await expect(page.getByTestId(`${T}-tb-verdict`)).toContainText('the debit column is short by ₹11,600');
  await page.getByTestId(`${T}-step`).click();
  await expect(page.getByTestId(`${T}-tb-suspense`)).toContainText('11,600');
  await expect(page.getByTestId(`${T}-suspense`)).toContainText('To Difference in Trial Balance');
  await page.getByTestId(`${T}-step`).click();
  await expect(page.getByTestId(`${T}-error`)).toContainText('Furniture A/c Dr.');
  await expect(page.getByTestId(`${T}-error-before`)).toContainText('same entry between the accounts');
  await page.getByTestId(`${T}-play`).click();
  await expect(page.getByTestId(`${T}-stage`)).toHaveAttribute('data-status', 'done', { timeout: 60_000 });
  await expect(page.getByTestId(`${T}-suspense`)).toContainText('By Mohan A/c');
  await expect(page.getByTestId(`${T}-suspense-left`)).toContainText('Suspense A/c is closed');
  await expect(page.getByTestId(`${T}-tb-corrected-total-dr`)).toHaveText('1,58,000');
  await expect(page.getByTestId(`${T}-tb-corrected-total-cr`)).toHaveText('1,58,000');
  await expect(page.getByTestId(`${T}-profit`)).toContainText('15,500');
  await expect(page.getByTestId(`${T}-announce`)).toContainText('Effect on the profit');
});

test('play: the student opens Suspense, rectifies each error and closes it; a new case and the detective', async ({ page }) => {
  test.setTimeout(90_000);
  await createProfile(page, 'Varun', { keepDeviceDefaults: true });
  await page.goto(`${LAB}&seed=${SEED}`);
  await page.getByTestId(`${T}-mode-play`).click();
  await page.getByTestId(`${T}-next`).click();
  await page.getByTestId(`${T}-next`).click();
  // The difference: a wrong amount, then the right one in the wrong column, then right.
  await page.getByTestId(`${T}-suspense-amount`).fill('11000');
  await page.getByTestId(`${T}-suspense-side-Dr`).click();
  await page.getByTestId(`${T}-suspense-check`).click();
  await expect(page.getByTestId(`${T}-suspense-try-feedback`)).toHaveAttribute('data-correct', 'false');
  await page.getByTestId(`${T}-suspense-amount`).fill('11,600');
  await page.getByTestId(`${T}-suspense-check`).click();
  await expect(page.getByTestId(`${T}-suspense-try-feedback`)).toHaveAttribute('data-correct', 'true');
  await expect(page.getByTestId(`${T}-tb-total-dr`)).toHaveText('1,58,000');
  await page.getByTestId(`${T}-next`).click();
  await expect(page.getByTestId(`${T}-told`)).toContainText('debited to Purchases A/c');
  await page.getByTestId(`${T}-next`).click();
  // Error (a): through Suspense first (a slip), then right.
  const c = buildCase(ASHA);
  const a = findError(c, 'a');
  await page.getByTestId(`${T}-entry-dr`).selectOption('furniture');
  await page.getByTestId(`${T}-entry-cr`).selectOption('suspense');
  await page.getByTestId(`${T}-entry-amount`).fill('12000');
  await page.getByTestId(`${T}-entry-narration-${narrationChoices(c, a).indexOf(a.narration)}`).click();
  await page.getByTestId(`${T}-entry-check`).click();
  await expect(page.getByTestId(`${T}-entry-try-feedback`)).toHaveAttribute('data-correct', 'false');
  await expect(page.getByTestId(`${T}-entry-try-feedback`)).toContainText('none of the difference in Suspense A/c is due to it');
  await page.getByTestId(`${T}-entry-cr`).selectOption('purchases');
  await page.getByTestId(`${T}-entry-check`).click();
  await expect(page.getByTestId(`${T}-entry-try-feedback`)).toHaveAttribute('data-correct', 'true');
  await expect(page.getByTestId(`${T}-rectify-entries`)).toContainText('To Purchases A/c');
  for (let i = 0; i < 2; i++) {
    await page.getByTestId(`${T}-entry-next`).click();
    await page.getByTestId(`${T}-entry-show`).click();
  }
  await page.getByTestId(`${T}-next`).click();
  await expect(page.getByTestId(`${T}-suspense-left`)).toContainText('Suspense A/c is closed');
  await expect(page.getByTestId(`${T}-tb-corrected-total-dr`)).toHaveText('1,58,000');

  // A new case from the seed: its trial balance as the student draws it up.
  await page.getByTestId(`${T}-new`).click();
  const fresh = buildCase(caseFromSeed(SEED));
  await expect(page.getByTestId(`${T}-about`)).toContainText(fresh.data.business);
  await page.getByTestId(`${T}-next`).click();
  await page.getByTestId(`${T}-next`).click();
  const drawn = errorsWhen(fresh, 'tb').length ? fresh.tbDraft : fresh.tbChecked;
  await expect(page.getByTestId(`${T}-tb-total-dr`)).toHaveText(figure(totalsOf(drawn).debit));

  // The detective: ticking the ledger against the books uncovers five of Farhan's six errors.
  await page.getByTestId(`${T}-case-farhan`).click();
  await page.getByTestId(`${T}-next`).click();
  await page.getByTestId(`${T}-next`).click();
  await page.getByTestId(`${T}-check-tb`).isVisible().then((v) => (v ? page.getByTestId(`${T}-check-tb`).click() : null));
  await page.getByTestId(`${T}-suspense-show`).click();
  await page.getByTestId(`${T}-next`).click();
  await page.getByTestId(`${T}-check-0-ok`).click();
  await expect(page.getByTestId(`${T}-check-0`)).toHaveAttribute('data-answer', 'ok');
  await page.getByTestId(`${T}-tick-rest`).click();
  await expect(page.getByTestId(`${T}-found-count`)).toContainText('5 of 5');
  await expect(page.getByTestId(`${T}-next`)).toBeEnabled();
});

test('try it: a wrong answer is told why, a right one is marked right', async ({ page }) => {
  await createProfile(page, 'Varun', { keepDeviceDefaults: true });
  await page.goto(`${LAB}&seed=${SEED}`);
  await page.getByTestId(`${T}-mode-try`).click();
  const first = tfAsk('affects', askRng(SEED, 'affects', 0));
  if (first.answer.type !== 'choice') throw new Error('a choice was expected');
  await expect(page.getByTestId(`${T}-try-prompt`)).toHaveText(first.prompt);
  const wrong = first.answer.options.find((o) => o.id !== (first.answer as { correct: string }).correct)!;
  await page.getByTestId(`${T}-try-option-${wrong.id}`).click();
  await page.getByTestId(`${T}-try-check`).click();
  await expect(page.getByTestId(`${T}-try-feedback`)).toHaveAttribute('data-correct', 'false');
  await expect(page.getByTestId(`${T}-try-feedback`)).toContainText(wrong.why!);
  await page.getByTestId(`${T}-try-next`).click();
  const second = tfAsk('affects', askRng(SEED, 'affects', 1));
  if (second.answer.type !== 'choice') throw new Error('a choice was expected');
  await page.getByTestId(`${T}-try-option-${second.answer.correct}`).click();
  await page.getByTestId(`${T}-try-check`).click();
  await expect(page.getByTestId(`${T}-try-feedback`)).toHaveAttribute('data-correct', 'true');
  await page.getByTestId(`${T}-kind-suspense`).click();
  const s = tfAsk('suspense', askRng(SEED, 'suspense', 0));
  if (s.answer.type !== 'number') throw new Error('a figure was expected');
  await page.getByTestId(`${T}-try-answer`).fill(String(s.answer.value / 100));
  await page.getByTestId(`${T}-try-tag-${s.answer.tag!.correct}`).click();
  await page.getByTestId(`${T}-try-check`).click();
  await expect(page.getByTestId(`${T}-try-feedback`)).toHaveAttribute('data-correct', 'true');
  await expect(page.getByTestId(`${T}-tb-suspense`)).toContainText(figure(s.answer.value));
});

test('at 360 px no mode of the lab scrolls sideways', async ({ page }) => {
  test.setTimeout(60_000);
  await page.setViewportSize({ width: 360, height: 740 });
  await createProfile(page, 'Varun', { keepDeviceDefaults: true });
  await page.goto(LAB);
  await page.getByTestId(`${T}-example-meera`).click();
  await page.getByTestId(`${T}-step-text`).last().locator('button').click();
  await expect(page.getByTestId(`${T}-profit`)).toBeVisible();
  expect(await noSidewaysScroll(page)).toBe(true);
  for (const mode of ['play', 'try']) {
    await page.getByTestId(`${T}-mode-${mode}`).click();
    await expect(page.getByTestId(`${T}-panel-${mode}`)).toBeVisible();
    expect(await noSidewaysScroll(page), mode).toBe(true);
  }
});
