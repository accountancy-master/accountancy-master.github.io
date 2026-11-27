import { expect, type Locator, type Page } from '@playwright/test';
import { topicShown } from '../src/content/courseOptions';
import { getTopicPack, packsOf } from '../src/content/registry';
import { CASE_STAGES } from '../src/generators';
import type { TopicPack } from '../src/content/types';
import { CONFIG } from '../src/learning/config';

// Nothing here assumes how many topics, levels, cards or generators there are, or in which order the catalogue lists
// them: a test names the topic it is about by id, and everything else is read from the packs.

/** The course a learner made by `createProfile` is on: the one a new learner joins. */
export const CLASS11 = 'cbse-11-accountancy';
export const CLASS12 = 'cbse-12-accountancy';

/**
 * The playable topics of Class 11, in course order, and its stages of case studies: what a learner of these tests can
 * meet. The topics and stages of Class 12 are another course's, however many of them have content.
 */
export const CLASS11_PACKS: TopicPack[] = packsOf(CLASS11);
/**
 * The playable topics of Class 12 as its files stand, in course order, that a learner on the default choice of Part B
 * meets (Analysis of Financial Statements: src/content/courseOptions.ts). None until a Class 12 topic has a level.
 */
export const CLASS12_PACKS: TopicPack[] = packsOf(CLASS12).filter((p) => topicShown(p.topicId, {}));
/** The same for a learner who takes Computerised Accounting as Part B. */
export const CLASS12_CAS_PACKS: TopicPack[] = packsOf(CLASS12).filter((p) => topicShown(p.topicId, { class12PartB: 'computerised' }));
/** True once Class 12 has a topic that can be played: from then on a learner is offered the choice of a course. */
export const CLASS12_LIVE = CLASS12_PACKS.length > 0;

/** The sample topic of Class 12 that the test build can switch on (src/testing/e2eCourse.ts), and the key that does it. */
export const SAMPLE_TOPIC = 'class-12-sample';
const SAMPLE_KEY = 'am.e2e.class12';

/**
 * Switches the sample topic of Class 12 on for every page this page loads from now on, so that Class 12 is a course
 * with something to play whatever its real topics hold. Call it before the first `goto`.
 */
export async function withClass12Sample(page: Page) {
  await page.addInitScript((key) => {
    try {
      localStorage.setItem(key, '1');
    } catch {
      // No storage in this page: nothing to set.
    }
  }, SAMPLE_KEY);
}
export const CLASS11_STAGES = CASE_STAGES.filter((s) => CLASS11_PACKS.some((p) => p.topicId === s.topicId));

/** The topic the Journal Entries tests are about. Its ladder is walked end to end by the walkthrough. */
export const JE = 'journal-entries';

/** The pack of a topic, which must exist and have levels (a playable topic). */
export function packOf(topicId: string): TopicPack {
  const pack = getTopicPack(topicId);
  if (!pack) throw new Error(`no playable topic ${topicId}`);
  return pack;
}

/** The id of a level of a topic by its order. */
export const levelOf = (topicId: string, order: number): string => {
  const level = packOf(topicId).levels.find((l) => l.order === order);
  if (!level) throw new Error(`${topicId} has no level ${order}`);
  return level.id;
};

/** The first playable topic in course order: where a brand-new learner starts. */
export const FIRST_TOPIC: TopicPack = CLASS11_PACKS[0];

/** The cards of Journal Entries' rule-card revision level (level 1), read from the pack. */
export const JE_LEVEL_CARDS: number = packOf(JE).levels.find((l) => l.order === 1)?.cardIds?.length ?? 0;

/** Questions in one smart-practice session, and in one fresh-questions session. */
export const SMART_COUNT: number = CONFIG.practice.smart.weak + CONFIG.practice.smart.due + CONFIG.practice.smart.fresh;
export const FRESH_COUNT: number = CONFIG.practice.freshCount;

/** Cards in one card session. */
export const CARDS_PER_SESSION = CONFIG.practice.cardsPerSession;

/**
 * The number of steps a card session has when `newCards` cards are waiting and none is due: new cards are offered
 * from the learner's active topics only (the first topic for a new learner), up to a session's worth.
 */
export const cardSteps = (newCards: number, dueCards = 0): number => Math.min(CARDS_PER_SESSION, dueCards + newCards);

/**
 * Creates a learner through the profile gate and lands on the Dashboard.
 *
 * A device that has never chosen has the ladder in order (the "Unlock all levels" device setting is off by default).
 * This stores that choice explicitly ('0') before the app loads, or, with `unlockAll`, the opposite ('1': every level
 * open, as a test that plays a later level at once needs). The init script runs for every page load of this page, so
 * call it for each page (also one in a second browser context) that needs it. Pass `keepDeviceDefaults` to leave the
 * device as a new one would be, with nothing stored. The learner joins Class 11, the course a new learner is offered
 * first, unless `courseId` names another (which the gate offers only once that course has something to play).
 */
export async function createProfile(page: Page, name: string, opts: { keepDeviceDefaults?: boolean; unlockAll?: boolean; courseId?: string } = {}) {
  if (!opts.keepDeviceDefaults) {
    await page.addInitScript((value) => {
      try {
        localStorage.setItem('am.unlockAll', value);
      } catch {
        // No storage in this page: nothing to set.
      }
    }, opts.unlockAll ? '1' : '0');
  }
  await page.goto('/start');
  await page.getByTestId('profile-name-input').fill(name);
  if (opts.courseId) await page.getByTestId(`course-${opts.courseId}`).click();
  await page.getByTestId('profile-create').click();
  await expect(page).toHaveURL(/\/home$/);
}

export type EntryLine = { accountId: string; side: 'Dr' | 'Cr'; amount: number };

/**
 * Types one entry, row by row. `within` is where its rows are: the question on screen for a single entry, the block
 * of one transaction in the journal of a set (the account picker always opens over the whole page).
 */
export async function fillJournal(page: Page, lines: EntryLine[], within: Page | Locator = page.getByTestId('question')) {
  for (const [i, line] of lines.entries()) {
    // A block starts with two rows; rows already added (an entry being typed again) are used as they are.
    if (i >= 2 && (await within.getByTestId(`je-account-${i}`).count()) === 0) await within.getByTestId('je-add-row').click();
    await within.getByTestId(`je-account-${i}`).click();
    await page.getByTestId(`picker-option-${line.accountId}`).click();
    await within.getByTestId(`je-side-${i}-${line.side}`).click();
    await within.getByTestId(`je-amount-${i}`).fill(String(line.amount / 100));
  }
}

/** The block of one transaction (counted from 0) in the journal of a set. */
export const setEntry = (within: Page | Locator, index: number): Locator => within.getByTestId(`set-entry-${index}`);

/**
 * Types every entry of a set, each in the block of its transaction: those of the question on screen, unless `within`
 * says where the journal is. An entry given no lines is left empty.
 */
export async function fillJournalSet(page: Page, entries: EntryLine[][], within: Page | Locator = page.getByTestId('question')) {
  for (const [k, lines] of entries.entries()) await fillJournal(page, lines, setEntry(within, k));
}

/**
 * A row of a format as the test build exposes it: its particulars and an amount in paise for every column (0 = blank).
 * Of a statement that prints figures, `printed` says which of them it prints: those are not typed.
 */
export type FormatRowE2e = { label: string; amounts: number[]; printed?: boolean[] };

/** The kind of a column of a statement that declares them, as the test build exposes it. */
export type ColumnKindE2e = { unit: 'rupees' | 'percent' | 'number'; signed?: true; adds: boolean };

/**
 * A figure as a test types it: rupees and percentages are held in hundredths and typed as the number they are, a
 * plain number as it is, and a negative figure with a minus sign.
 */
export const typedFigure = (amount: number, kind?: ColumnKindE2e): string => {
  const size = Math.abs(amount);
  return `${amount < 0 ? '-' : ''}${kind?.unit === 'number' ? size : size / 100}`;
};

/**
 * Types the rows of one list of a format (`id` is what its test ids start with: "fmt-s0" for the left side of an
 * account, "fmt-b1" for the rows below the totals of the right side, "fmt-rows" for a statement), from row `from` on.
 */
export async function fillFormatRows(page: Page, within: Page | Locator, id: string, rows: FormatRowE2e[], from = 0, kinds?: ColumnKindE2e[]) {
  for (const [k, row] of rows.entries()) {
    const i = from + k;
    if ((await within.getByTestId(`${id}-label-${i}`).count()) === 0) await within.getByTestId(`${id}-add`).click();
    await within.getByTestId(`${id}-label-${i}`).click();
    await page.getByTestId(`picker-option-${row.label}`).click();
    for (const [c, amount] of row.amounts.entries()) if (amount !== 0 && !row.printed?.[c]) await within.getByTestId(`${id}-amount-${i}-${c}`).fill(typedFigure(amount, kinds?.[c]));
  }
}

/** Shows one side of an account: on a phone the sides are switched between, on a laptop both are always there. */
export async function showSide(within: Page | Locator, side: 0 | 1, period = 0) {
  const tab = within.getByTestId(period === 0 ? `fmt-tab-${side}` : `fmt-p${period}-tab-${side}`);
  if (await tab.isVisible()) await tab.click();
}

/**
 * Folds away the data a format is prepared from, if it is open. The panel stays at the top of the screen while the
 * rows are typed, over whatever has been scrolled under it; folded, it is one line and nothing is under it. The data
 * of a format of a case study is its case, which stays there in the same way.
 */
export async function foldData(within: Page | Locator) {
  const data = within.locator('[data-testid="data"][data-open="true"]').first();
  if ((await data.count()) > 0) await data.getByTestId('data-toggle').click();
  const ofCase = within.locator('[data-testid="case"][data-open="true"][data-sticky="true"]').first();
  if ((await ofCase.count()) > 0) await ofCase.getByTestId('case-toggle').click();
}

/**
 * Types an account: the rows of each side, period by period where it is kept over several (`later`), and the rows
 * below the last totals where it has any.
 */
export async function fillAccount(
  page: Page,
  expected: { sides: FormatRowE2e[][]; below: FormatRowE2e[][]; later?: FormatRowE2e[][][] },
  within: Page | Locator = page.getByTestId('question'),
) {
  await foldData(within);
  const periods = [expected.sides, ...(expected.later ?? [])];
  for (const [p, rows] of periods.entries()) {
    for (const side of [0, 1] as const) {
      await showSide(within, side, p);
      await fillFormatRows(page, within, p === 0 ? `fmt-s${side}` : `fmt-p${p}-s${side}`, rows[side]);
      if (p === periods.length - 1) await fillFormatRows(page, within, `fmt-b${side}`, expected.below[side]);
    }
  }
}

/**
 * Types a statement: its rows, and its final figure where it has one (with its name, where that is left to be chosen).
 * Of a statement in parts: the rows of every list after the first (`more`) under their sub-headings, and the figures
 * of every sub-total; `kinds` are the kinds of its columns, where it declares them. A figure the statement prints
 * (`printed` of a row, `printedSubtotals`) is not typed.
 */
export async function fillStatement(
  page: Page,
  expected: { rows: FormatRowE2e[]; final: number | null; finalLabel?: string; more?: FormatRowE2e[][]; subtotals?: number[][]; kinds?: ColumnKindE2e[]; printedSubtotals?: boolean[][] },
  within: Page | Locator = page.getByTestId('question'),
) {
  await foldData(within);
  const { kinds } = expected;
  await fillFormatRows(page, within, 'fmt-rows', expected.rows, 0, kinds);
  for (const [k, rows] of (expected.more ?? []).entries()) await fillFormatRows(page, within, `fmt-l${k + 1}`, rows, 0, kinds);
  for (const [i, figures] of (expected.subtotals ?? []).entries()) {
    for (const [c, figure] of figures.entries()) if (figure !== 0 && !expected.printedSubtotals?.[i]?.[c]) await within.getByTestId(`fmt-sub-${i}-${c}`).fill(typedFigure(figure, kinds?.[c]));
  }
  if (expected.finalLabel !== undefined) {
    await within.getByTestId('fmt-final-label').click();
    await page.getByTestId(`picker-option-${expected.finalLabel}`).click();
  }
  if (expected.final !== null) await within.getByTestId('fmt-final').fill(typedFigure(expected.final, kinds?.[0]));
}

/** An entry with its debits and credits the wrong way round: a wrong answer that still balances. */
export const swapSides = (lines: EntryLine[]): EntryLine[] => lines.map((l) => ({ ...l, side: l.side === 'Dr' ? 'Cr' : 'Dr' }));

export async function seedPassedLevels(page: Page, upToOrder: number | 'all', topicId?: string) {
  // Marks the levels 0..upToOrder of a topic (Journal Entries by default) as passed; with 'all' and no topic, every
  // level of every topic; with 'all' and a topic, every level of that topic. Marked for the current profile, so a test can start at a later level without playing the earlier ones.
  // A topic with a passed level has been played, so it is then one of the learner's active topics.
  await page.goto('/settings');
  const topic = topicId ?? (upToOrder === 'all' ? '' : JE);
  await page.getByTestId('e2e-pass-topic').fill(topic);
  await page.getByTestId('e2e-pass-levels').fill(String(upToOrder));
  await page.getByTestId('e2e-pass-levels-apply').click();
  await expect(page.getByTestId('e2e-pass-levels-done')).toBeVisible();
}

/**
 * How to enter the correct answer of each question type, from the value the production build exposes for tests
 * (data-expected). A new question type adds one entry here, next to its entry in the app's exercise registry.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- each answerer reads its own shape of expected value
const ANSWERERS: Record<string, (page: Page, expected: any) => Promise<void>> = {
  mcq: (page, optionId) => page.getByTestId(`mcq-option-${optionId}`).click(),
  true_false: (page, value) => page.getByTestId(value ? 'tf-true' : 'tf-false').click(),
  journal_entry: (page, { lines }) => fillJournal(page, lines),
  journal_set: (page, { entries }) => fillJournalSet(page, entries),
  account: (page, expected) => fillAccount(page, expected),
  statement: (page, expected) => fillStatement(page, expected),
  numeric: (page, typed) => page.getByTestId('numeric-input').fill(typed),
};

/** The id of the option to click for a wrong answer to the multiple-choice question on screen. */
export async function wrongMcqOption(page: Page): Promise<string> {
  const expected = JSON.parse((await page.getByTestId('question').getAttribute('data-expected'))!);
  const ids = await page.locator('[data-testid^="mcq-option-"]').evaluateAll((els) =>
    els.map((el) => el.getAttribute('data-testid')!.replace('mcq-option-', '')),
  );
  return ids.find((id) => id !== expected)!;
}

/**
 * Enters the correct answer to whatever question is on screen, from the expected answer the test build exposes
 * (data-expected), and presses nothing: a mock paper has no Check.
 */
export async function enterAnswer(page: Page) {
  const q = page.getByTestId('question');
  const type = (await q.getAttribute('data-question-type'))!;
  const answer = ANSWERERS[type];
  if (!answer) throw new Error(`unsupported question type: ${type}`);
  await answer(page, JSON.parse((await q.getAttribute('data-expected'))!));
}

export async function answerCurrentQuestion(page: Page) {
  // Answers whatever question is on screen correctly, using the expected answer the production build exposes
  // for tests (data-expected), then presses Check.
  await enterAnswer(page);
  await page.getByTestId('check').click();
}

/**
 * Gives up on the question on screen: takes every hint it has, then presses "Show answer". It counts as a miss, and
 * works for every type of question.
 */
export async function showAnswer(page: Page) {
  const hint = page.getByTestId('hint');
  // The button counts the hints down ("Hint (2 left)") and says so when there is none left.
  for (let text = await hint.innerText(); /left/.test(text); text = await hint.innerText()) {
    await hint.click();
    await expect(hint).not.toHaveText(text);
  }
  await page.getByTestId('reveal').click();
}

/**
 * Reads the lesson on screen to its end, a step at a time from the one on screen (Next, until the last step's Continue),
 * and goes on past it. Returns how many steps the lesson has.
 */
export async function readLesson(page: Page): Promise<number> {
  const lesson = page.getByTestId('lesson');
  await expect(lesson).toBeVisible();
  const steps = Number(await lesson.getAttribute('data-steps'));
  // From the step on screen (a test may have read some of the lesson already) to the last.
  const from = Number(await page.getByTestId('lesson-step').getAttribute('data-step'));
  for (let i = from + 1; i < steps; i++) {
    await page.getByTestId('lesson-next').click();
    await expect(page.getByTestId('lesson-step')).toHaveAttribute('data-step', String(i));
  }
  await page.getByTestId('continue').click();
  await expect(lesson).toHaveCount(0);
  return steps;
}

/**
 * Plays the session on screen to its end through the UI, until the results are visible: lessons are continued,
 * cards flipped and marked "Got it", questions answered from `data-expected` (the first `wrongFirst` journal
 * questions with their sides reversed). Returns how many questions were answered. `onQuestion` and `onCard`
 * are told the id of each question and card served, for tests that need to know what a session contained.
 */
export async function playSession(
  page: Page,
  opts: { wrongFirst?: number; onQuestion?: (id: string) => void; onCard?: (id: string) => void } = {},
): Promise<number> {
  let wrongLeft = opts.wrongFirst ?? 0;
  let answered = 0;
  const results = page.getByTestId('results');
  const card = page.getByTestId('card-flip');
  const lesson = page.getByTestId('lesson');
  const question = page.getByTestId('question');
  const feedback = page.getByTestId('feedback');
  for (;;) {
    await expect(results.or(card).or(lesson).or(question)).toBeVisible();
    if (await results.isVisible()) return answered;
    if (await card.isVisible()) {
      opts.onCard?.((await page.getByTestId('card').getAttribute('data-card-id'))!);
      await card.click();
      await page.getByTestId('card-got-it').click();
      await expect(page.getByTestId('card-answer')).toHaveCount(0);
    } else if (await lesson.isVisible()) {
      await readLesson(page);
    } else {
      opts.onQuestion?.((await question.getAttribute('data-question-id'))!);
      if (wrongLeft > 0 && (await question.getAttribute('data-question-type')) === 'journal_entry') {
        wrongLeft--;
        const expected = JSON.parse((await question.getAttribute('data-expected'))!);
        await fillJournal(
          page,
          expected.lines.map((l: { side: 'Dr' | 'Cr' }) => ({ ...l, side: l.side === 'Dr' ? 'Cr' : 'Dr' })),
        );
        await page.getByTestId('check').click();
      } else {
        await answerCurrentQuestion(page);
      }
      answered++;
      await page.getByTestId('continue').click();
      await expect(feedback).toHaveCount(0);
    }
  }
}

/** The XP number in the header (Shell), on a page that has one. */
export async function headerXp(page: Page): Promise<number> {
  const text = await page.getByTestId('xp-total').innerText();
  return Number(/\d+/.exec(text)![0]);
}

/** The number in a "+N XP" element. */
export async function xpOf(page: Page, testId: string): Promise<number> {
  return Number(/\d+/.exec(await page.getByTestId(testId).innerText())![0]);
}

export interface StoredEvents {
  attempts: { id: string; questionId: string; topicId: string; levelId?: string }[];
  levelResults: { id: string; levelId: string; score: number; passed: boolean }[];
  cardReviews: { id: string; cardId: string }[];
  sessionResults: { id: string; kind: string; day: string }[];
}

/** Reads the learner's stored events straight from IndexedDB (the app's own database), for exactly-once checks. */
export async function readStoredEvents(page: Page): Promise<StoredEvents> {
  return page.evaluate(
    () =>
      new Promise<StoredEvents>((resolve, reject) => {
        const open = indexedDB.open('accountancy-master');
        open.onerror = () => reject(open.error);
        open.onsuccess = () => {
          const db = open.result;
          const names = ['attempts', 'levelResults', 'cardReviews', 'sessionResults'] as const;
          const tx = db.transaction([...names], 'readonly');
          const out: Record<string, unknown[]> = {};
          for (const name of names) {
            const req = tx.objectStore(name).getAll();
            req.onsuccess = () => {
              out[name] = req.result;
            };
          }
          tx.oncomplete = () => {
            db.close();
            resolve(out as unknown as StoredEvents);
          };
          tx.onerror = () => reject(tx.error);
        };
      }),
  );
}
