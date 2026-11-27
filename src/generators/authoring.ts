/**
 * What a template author needs: a constructor for each kind of generated question and a few small helpers.
 * A template is one call in `src/generators/templates/<topic>.ts`; nothing else has to change. The templates in
 * `accounting-equation.ts` are worked examples of an `mcq` and a `numeric` one, `journal-entries.ts` of `journal`,
 * and the formats at the end of `ledger.ts` and `trial-balance.ts` of `account` and `statement`.
 *
 * Every template: draw values from `rng` inside `generate`, return null for a combination you do not want, and make
 * every wrong answer a named, real mistake. `npm test` runs your template over 300 seeds and says which seed fails.
 */
import { isAssertionReason } from './ids';
import type { AccountQuestion, Difficulty, JournalQuestion, JournalSetQuestion, McqQuestion, NumericQuestion, NumericUnit, RatioQuestion, StatementQuestion } from '@/content/types';
import { BALANCE_BD, BALANCE_CD, accountOf, type AccountView, type CashBookRow, type CashBookView, type ColumnarRow, type ColumnarView, type DatedEntry, type OpeningBalance } from '@/engine/books';
import type { JournalLine } from '@/engine/journal';
import { formatINR, percentOf, rupees, type Paise } from '@/engine/money';
import type { Rng } from '@/engine/rng';
import { casePartId, setDateOrder } from './engine';
import {
  isFormatKind,
  type AccountParts,
  type AccountSideParts,
  type AccountTemplate,
  type AnyParts,
  type CaseAccountParts,
  type CaseSetParts,
  type CaseStatementParts,
  type CaseTemplate,
  type FormatRowParts,
  type JournalParts,
  type JournalSetParts,
  type JournalSetTemplate,
  type JournalTemplate,
  type McqParts,
  type McqTemplate,
  type NumericParts,
  type NumericTemplate,
  type RatioParts,
  type RatioTemplate,
  type StatementParts,
  type StatementTemplate,
  type Template,
} from './types';

export { formatINR, percentOf, rupees };
export type { Paise };

/** The fields every template has. `version` starts at 1; raise it when a change would alter the question a seed makes. */
interface Common {
  /** Unique across every topic; start it with a short topic prefix ("ae-", "je-"). */
  id: string;
  topicId: string;
  /** A concept of the topic's pack: practice picks questions by concept. */
  conceptId: string;
  difficulty: Difficulty;
  version?: number;
  /**
   * One line saying why the template teaches beyond the syllabus of its course (see `TemplateBase`). Such a template
   * is kept off every level and out of mock papers.
   */
  beyondSyllabus?: string;
}

/**
 * A journal-entry question. Return the prompt and the `Transaction` it describes; the engine builds the entry,
 * the account choices and the explanation.
 *
 * @example
 * journalTemplate({
 *   id: 'je-capital', topicId: 'journal-entries', conceptId: 'je-capital-drawings', difficulty: 'easy',
 *   generate: (rng) => {
 *     const a = amount(rng, 50000, 500000, 10000);
 *     return { prompt: `The owner started business with cash of ${formatINR(a)}.`, tx: { kind: 'capitalIntroduced', amount: a, mode: 'cash' } };
 *   },
 * });
 */
export function journalTemplate(
  def: Common & {
    /** True when the student must work the amount out: the harness then does not require the prompt to show one. */
    computed?: boolean;
    generate(rng: Rng): JournalParts | null;
    verify?(question: JournalQuestion): boolean;
  },
): JournalTemplate {
  return { kind: 'journal', ...def, version: def.version ?? 1 };
}

/**
 * A set of journal entries ("Journalise the following transactions"): one business, several dated transactions, one
 * entry for each. Return the opening line (the business, the period and every convention the entries rely on) and
 * the transactions in date order, each with its date ("5 April"), its text, its entry as `lines` and the steps that
 * explain it. The set must read as one story: the same parties throughout, a creditor paid after the purchase from
 * that creditor, a return after its sale, amounts that fit together. Vary which transactions occur and in what order
 * across seeds, not only the amounts.
 *
 * The difficulty decides the length, because a mock paper gives a set marks by it: easy 3 or 4 transactions (3 marks),
 * medium 4 or 5 (4 marks), complex 6 to 8 (6 marks). The student is right only when every entry is right, and is
 * told which were.
 *
 * Two things for sets that are not a journal of dated transactions. `task` replaces the first line of the prompt
 * ("Journalise the following transactions.") with the set's own: "Pass the rectifying entries.". And an item that has
 * no date gives a `label` in place of `date` ("Error 1", "(a)"): it is shown wherever the date would be, and only
 * real dates are checked for being in order.
 *
 * @example
 * journalSetTemplate({
 *   id: 'je-set-first-week', topicId: 'journal-entries', conceptId: 'je-sets', difficulty: 'easy',
 *   generate: (rng) => {
 *     const capital = amount(rng, 100000, 500000, 50000), goods = amount(rng, 20000, 60000, 5000), rent = amount(rng, 3000, 9000, 500);
 *     const [d1, d2, d3] = setDays(rng, 3, 1, 7);
 *     return {
 *       opening: 'Asha opened a bookshop in Pune in April. All dealings in the first week were in cash.',
 *       transactions: [
 *         { date: `${d1} April`, text: `Asha started the business with cash of ${formatINR(capital)}.`,
 *           lines: [{ accountId: 'cash', side: 'Dr', amount: capital }, { accountId: 'capital', side: 'Cr', amount: capital }],
 *           explanation: ['Cash comes in, so Cash A/c is debited.', 'It is capital, so Capital A/c is credited.'] },
 *         { date: `${d2} April`, text: `Bought books for resale for ${formatINR(goods)}.`, lines: [...], explanation: [...] },
 *         { date: `${d3} April`, text: `Paid the shop rent for April, ${formatINR(rent)}.`, lines: [...], explanation: [...] },
 *       ],
 *     };
 *   },
 * });
 */
export function journalSetTemplate(
  def: Common & { generate(rng: Rng): JournalSetParts | null; verify?(question: JournalSetQuestion): boolean },
): JournalSetTemplate {
  return { kind: 'journal_set', ...def, version: def.version ?? 1 };
}

/**
 * A two-sided account the student prepares: a ledger account, a cash book, an asset or provision account, a Trading
 * and Profit and Loss Account, a Balance Sheet. Return the `task` (the one line that is the prompt), the `data` the
 * student works from (the business and the period, then one transaction or balance to a line), the `title` of the
 * account, its `left` and `right` sides and the `distractors` (labels a student might wrongly pick), with the
 * working as `explanation`. A side has its title ("Dr"), the prefix it writes before every row ("To") and its rows:
 * `drSide(rows)` and `crSide(rows)` make the two sides of a ledger account, and `ledgerSides(accountOf(...))` makes
 * both from journal entries, balanced. A row is `{ date, label, amount }`; the closing row (`closing: true`) is a
 * row like any other, which the student enters. The student is right only when every row is there with its amount
 * on its side and there is no other row; the order of the rows of a side is not marked, and dates are not typed.
 *
 * Three optional things. `later` (with `ledgerPeriods`) keeps the account over several periods, each balanced and
 * brought down into the next: "Prepare Machinery A/c for three years". `broughtDown: true` says the task asks for the
 * balance to be brought down, so the place for it is shown even when no balance is left. And a row may carry a `ref`
 * ("(a)"), shown beside it in the solution.
 *
 * @example
 * accountTemplate({
 *   id: 'led-fmt-supplier', topicId: 'ledger', conceptId: 'led-formats', difficulty: 'easy',
 *   generate: (rng) => {
 *     const bought = amount(rng, 20000, 60000, 1000), paid = amount(rng, 5000, 15000, 1000);
 *     const rao = creditor('Rao & Co.');
 *     const entries = [
 *       { date: '4 April', lines: [{ accountId: 'purchases', side: 'Dr', amount: bought }, { accountId: rao, side: 'Cr', amount: bought }] },
 *       { date: '18 April', lines: [{ accountId: rao, side: 'Dr', amount: paid }, { accountId: 'cash', side: 'Cr', amount: paid }] },
 *     ];
 *     return {
 *       task: "Prepare Rao & Co.'s account in the books of Asha Traders for April and balance it.",
 *       data: `Asha Traders buys from Rao & Co. on credit.\n4 April: Bought goods for ${formatINR(bought)}.\n18 April: Paid ${formatINR(paid)} in cash.`,
 *       title: 'Rao & Co. A/c',
 *       ...ledgerSides(accountOf(entries, rao), { closeOn: '30 April' }),
 *       distractors: ['Rao & Co. A/c', 'Balance b/d', 'Bank A/c'],
 *       explanation: ['The purchase is credited: Rao & Co. is owed more.', 'The payment is debited.', 'The credit side is larger, so the balance is carried down on the debit side.'],
 *     };
 *   },
 * });
 */
export function accountTemplate(
  def: Common & { generate(rng: Rng): AccountParts | null; verify?(question: AccountQuestion): boolean },
): AccountTemplate {
  return { kind: 'account', ...def, version: def.version ?? 1 };
}

/**
 * A statement the student prepares: one list of rows with one or two named amount columns and their totals. Return
 * the `task`, the `data`, the `title`, the `columns` (left out for one column), the `rows` and the `distractors`,
 * with the working as `explanation`. A row of a statement with two columns gives `amounts`, one for each column and
 * 0 where the column is blank. `totalsAgree: true` is for a Trial Balance (the engine refuses columns that do not
 * agree); `final` is the figure a statement ends on, which the student works out and types
 * (`{ label: 'Balance as per Pass Book', amount }`); with `final.alternatives` the student also picks what the figure
 * is called. A statement may have up to four amount columns (a Purchases Book with value, taxes and total).
 *
 * @example
 * statementTemplate({
 *   id: 'tb-fmt-balances', topicId: 'trial-balance', conceptId: 'tb-formats', difficulty: 'easy',
 *   generate: (rng) => {
 *     const cash = amount(rng, 5000, 30000, 1000), rent = amount(rng, 2000, 9000, 500);
 *     return {
 *       task: 'Prepare the Trial Balance of Ravi Textiles as on 31 March 2026.',
 *       data: `These balances were taken from the ledger of Ravi Textiles:\nCash in hand: ${formatINR(cash)}\nRent paid: ${formatINR(rent)}\nCapital: ${formatINR(cash + rent)}`,
 *       title: 'Trial Balance of Ravi Textiles as on 31 March 2026', heading: 'Name of account',
 *       columns: ['Debit (₹)', 'Credit (₹)'], totalsAgree: true,
 *       rows: [
 *         { label: 'Cash in hand', amounts: [cash, 0] }, { label: 'Rent paid', amounts: [rent, 0] }, { label: 'Capital', amounts: [0, cash + rent] },
 *       ],
 *       distractors: ['Closing stock', 'Suspense A/c'],
 *       explanation: ['Cash is an asset and rent an expense: both are debit balances.', 'Capital is a credit balance.'],
 *     };
 *   },
 * });
 */
export function statementTemplate(
  def: Common & { generate(rng: Rng): StatementParts | null; verify?(question: StatementQuestion): boolean },
): StatementTemplate {
  return { kind: 'statement', ...def, version: def.version ?? 1 };
}

/**
 * A multiple-choice question. Return the prompt, the right option's text, at least three distractors and an
 * explanation. Each distractor is `{ text, why }` where `why` names the mistake that leads to it ("added the tax
 * instead of deducting it"); it is shown when the learner picks it. The engine shuffles the options from the seed.
 * Distractors that repeat the answer or each other are dropped, so list more than three when values may collide.
 *
 * @example
 * mcqTemplate({
 *   id: 'ae-effect', topicId: 'accounting-equation', conceptId: 'ae-effects', difficulty: 'easy',
 *   generate: (rng) => {
 *     const x = formatINR(amount(rng, 10000, 90000, 5000));
 *     return {
 *       prompt: `The owner withdraws ${x} in cash for personal use. What happens to the accounting equation?`,
 *       correct: `Assets and capital both decrease by ${x}`,
 *       distractors: [
 *         { text: `Assets and liabilities both decrease by ${x}`, why: 'Treated the withdrawal as repaying a debt.' },
 *         { text: `Assets and capital both increase by ${x}`, why: 'Read the withdrawal as money coming in.' },
 *         { text: `One asset increases and another decreases by ${x}`, why: 'Thought only the form of the assets changes.' },
 *       ],
 *       explanation: 'Drawings reduce capital, and cash, an asset, goes out: assets and capital fall together.',
 *     };
 *   },
 * });
 */
export function mcqTemplate(
  def: Common & { generate(rng: Rng): McqParts | null; verify?(question: McqQuestion): boolean },
): McqTemplate {
  return { kind: 'mcq', ...def, version: def.version ?? 1 };
}

/**
 * A multiple-choice question drawn from a bank of facts: each seed asks one of `facts`, each a whole question (the
 * prompt, the right option, three or more named mistakes and the explanation). For the theory a syllabus names in a
 * line ("the features of depreciation", "the kinds of voucher"), written as scenarios and statements. It comes with
 * its `verify`: the question served is found again in the bank by its prompt, and its right option and every wrong
 * one (with its mistake) must be the bank's. Throws at once for a bank with a prompt twice, or a fact with fewer than
 * three distractors or one that repeats the right option.
 *
 * @example
 * factsTemplate({
 *   id: 'dep-feature', topicId: 'depreciation', conceptId: 'dep-meaning', difficulty: 'easy',
 *   facts: [{ prompt: 'Which of these is a feature of depreciation?', correct: 'It is a non-cash expense', distractors: [...], explanation: '...' }],
 * });
 */
export function factsTemplate(def: Common & { facts: readonly McqParts[] }): McqTemplate {
  const { facts, ...common } = def;
  const prompts = new Set<string>();
  for (const f of facts) {
    if (prompts.has(f.prompt)) throw new Error(`${def.id}: the prompt "${f.prompt}" is in the bank twice`);
    prompts.add(f.prompt);
    if (f.distractors.length < 3) throw new Error(`${def.id}: "${f.prompt}" needs at least three distractors`);
    if (f.distractors.some((d) => d.text === f.correct)) throw new Error(`${def.id}: "${f.prompt}" has a distractor that is its right option`);
  }
  return mcqTemplate({
    ...common,
    // A level of Assertion-Reason asks one template several times: consecutive seeds serve different items, so that no
    // item comes twice in a session the size of the bank.
    generate: isAssertionReason(def.id) ? (_rng, seed = 0) => facts[seed % facts.length] : (rng) => rng.pick(facts),
    verify: (q) => {
      const fact = facts.find((f) => f.prompt === q.prompt);
      if (!fact) return false;
      const right = q.options.find((o) => o.id === q.correct);
      const wrong = q.options.filter((o) => o.id !== q.correct);
      return right?.text === fact.correct && wrong.every((o) => fact.distractors.some((d) => d.text === o.text && d.why === o.why));
    },
  });
}

/** The four options of an Assertion-Reason question, as a board paper words them. */
export const ASSERTION_REASON_OPTIONS = {
  both: 'Both Assertion (A) and Reason (R) are true, and R is the correct explanation of A.',
  bothNot: 'Both A and R are true, but R is not the correct explanation of A.',
  aOnly: 'A is true, but R is false.',
  rOnly: 'A is false, but R is true.',
} as const;

export type AssertionReasonAnswer = keyof typeof ASSERTION_REASON_OPTIONS;

/** One Assertion-Reason question of a bank (see `assertionReasonFacts`). */
export interface AssertionReasonItem {
  assertion: string;
  reason: string;
  answer: AssertionReasonAnswer;
  /** Why A is true or false: what a learner reads who judged it wrongly. */
  a: string;
  /** Why R is true or false. */
  r: string;
  /** With both true, whether R explains A and why. With one false the explanation says so by itself: leave it out. */
  link?: string;
}

const AR_HINTS = ['Judge A by itself, then R by itself: true or false?', 'If both are true, read them as "A, because R". Is that the real reason?'];

/**
 * A bank of Assertion-Reason questions for `factsTemplate`: the prompt, the four options, the mistake behind each wrong
 * option and an explanation that says why A and R are true or false and whether R explains A. Give the template the id
 * `<prefix>-assertion-reason`, which keeps it off mock papers and Look back levels (`isAssertionReason` in `ids.ts`).
 * Throws at once for a bank of fewer than ten, a bank without one of the four answers, or a `link` where it does not
 * belong.
 */
export function assertionReasonFacts(items: readonly AssertionReasonItem[]): McqParts[] {
  if (items.length < 10) throw new Error(`An Assertion-Reason bank needs at least 10 items, not ${items.length}`);
  const keys = Object.keys(ASSERTION_REASON_OPTIONS) as AssertionReasonAnswer[];
  const aHolds = (k: AssertionReasonAnswer) => k !== 'rOnly';
  const rHolds = (k: AssertionReasonAnswer) => k !== 'aOnly';
  const word = (holds: boolean) => (holds ? 'true' : 'false');
  for (const k of keys) if (!items.some((i) => i.answer === k)) throw new Error(`An Assertion-Reason bank has no item with the answer ${k}`);
  // Each answer spaced evenly through the bank, so that a run of seeds meets all four.
  const spaced = keys
    .flatMap((k) => items.filter((i) => i.answer === k).map((item, n, group) => ({ item, at: (n + 0.5) / group.length })))
    .sort((x, y) => x.at - y.at)
    .map((x) => x.item);
  return spaced.map((item) => {
    const { assertion, reason, answer, a, r, link } = item;
    const bothHold = aHolds(answer) && rHolds(answer);
    if (bothHold !== (link !== undefined)) throw new Error(`"${assertion}": a link is what explains an item with A and R both true, and only such an item`);
    const why = (option: AssertionReasonAnswer): string => {
      const aSlip = aHolds(option) !== aHolds(answer);
      const rSlip = rHolds(option) !== rHolds(answer);
      if (aSlip && rSlip) return `Took A for ${word(!aHolds(answer))} and R for ${word(!rHolds(answer))}: it is the other way round. ${a} ${r}`;
      if (aSlip) return `Took A for ${word(!aHolds(answer))}. ${a}`;
      if (rSlip) return `Took R for ${word(!rHolds(answer))}. ${r}`;
      return `${answer === 'both' ? 'Missed the link.' : 'Took R for the reason of A.'} ${link}`;
    };
    const ending = link ?? (rHolds(answer) ? 'A is false, so there is nothing for R to explain.' : 'R is false, so it cannot explain A.');
    return {
      prompt: `Assertion (A): ${assertion}
Reason (R): ${reason}
Choose the correct option.`,
      correct: ASSERTION_REASON_OPTIONS[answer],
      distractors: keys.filter((k) => k !== answer).map((k) => ({ text: ASSERTION_REASON_OPTIONS[k], why: why(k) })),
      optionOrder: keys.map((k) => ASSERTION_REASON_OPTIONS[k]),
      explanation: `A is ${word(aHolds(answer))}: ${a} R is ${word(rHolds(answer))}: ${r} ${ending}`,
      hints: AR_HINTS,
    };
  });
}

/**
 * A question with one numeric answer. `unit` says what the integer counts: 'rupees' (paise, so ₹12,500 is
 * 1250000), 'number' (a plain integer), 'percent' (hundredths, so 12.5% is 1250) or 'times' (hundredths too: a
 * current ratio of 2.5 : 1 or a turnover of 2.5 times is 250). Return the prompt, the answer,
 * at least two `commonErrors` ({ value, why }: a known wrong answer and the mistake behind it) and the working as
 * an array of lines. A learner who types a common error is told its `why`. Values that equal the answer or each
 * other are dropped. Return null to reject a seed whose answer is not clean.
 *
 * With `unit: 'ratio'` the answer is a ratio and so is every common error: its terms in the order the prompt names
 * the partners, in lowest terms (`answer: [5, 3, 2]`, `commonErrors: [{ value: [3, 5, 2], why: '...' }]`). The
 * student types 5:3:2, and 10:6:4 is as right. `lowestTerms([20, 12, 8])` reduces a ratio.
 *
 * @example
 * numericTemplate({
 *   id: 'ae-capital', topicId: 'accounting-equation', conceptId: 'ae-equation', difficulty: 'easy', unit: 'rupees',
 *   generate: (rng) => {
 *     const assets = amount(rng, 200000, 900000, 10000);
 *     const liabilities = amount(rng, 50000, 150000, 10000);
 *     return {
 *       prompt: `Assets are ${formatINR(assets)} and liabilities are ${formatINR(liabilities)}. What is the capital?`,
 *       answer: assets - liabilities,
 *       commonErrors: [
 *         { value: assets + liabilities, why: 'Added the liabilities instead of deducting them.' },
 *         { value: assets, why: 'Forgot to deduct the liabilities.' },
 *       ],
 *       explanation: ['Capital = Assets - Liabilities.', `${formatINR(assets)} - ${formatINR(liabilities)} = ${formatINR(assets - liabilities)}.`],
 *     };
 *   },
 * });
 */
export function numericTemplate(def: Common & { unit: 'ratio'; generate(rng: Rng): RatioParts | null; verify?(question: RatioQuestion): boolean }): RatioTemplate;
export function numericTemplate(def: Common & { unit: NumericUnit; generate(rng: Rng): NumericParts | null; verify?(question: NumericQuestion): boolean }): NumericTemplate;
export function numericTemplate(def: Common & (Pick<NumericTemplate, 'unit' | 'generate' | 'verify'> | Pick<RatioTemplate, 'unit' | 'generate' | 'verify'>)): NumericTemplate | RatioTemplate {
  return { kind: 'numeric', ...def, version: def.version ?? 1 };
}

export { isRatio, lowestTerms } from '@/exercises/numeric';

/**
 * The template, marked as teaching beyond the syllabus of its course, for `reason` (one line): it then stands on no
 * level and in no mock paper, and is shown with a "Beyond the syllabus" chip. What it makes is unchanged.
 */
export const beyondSyllabus = <T extends Template>(template: T, reason: string): T => ({ ...template, beyondSyllabus: reason });

/**
 * One question of a case: its kind and how it is made from the scenario the case set up. `make` returns what the
 * `generate` of a template of that kind returns, with two differences for the long kinds: an account or a statement
 * gives no `data` (the case text is its data, shown once), and a set of entries may leave its `opening` line out.
 */
export type CasePart<S> =
  | { kind: 'numeric'; unit: NumericUnit; make(scenario: S): NumericParts | null; verify?(question: NumericQuestion): boolean }
  | { kind: 'numeric'; unit: 'ratio'; make(scenario: S): RatioParts | null; verify?(question: RatioQuestion): boolean }
  | { kind: 'mcq'; make(scenario: S): McqParts | null; verify?(question: McqQuestion): boolean }
  | { kind: 'journal'; make(scenario: S): JournalParts | null; verify?(question: JournalQuestion): boolean }
  | { kind: 'journal_set'; make(scenario: S): CaseSetParts | null; verify?(question: JournalSetQuestion): boolean }
  | { kind: 'account'; make(scenario: S): CaseAccountParts | null; verify?(question: AccountQuestion): boolean }
  | { kind: 'statement'; make(scenario: S): CaseStatementParts | null; verify?(question: StatementQuestion): boolean };

/**
 * A case study: one scenario and four to eight questions on it, asked in order (see `docs/authoring-cases.md`).
 * `setup` draws the whole scenario from `rng` (return null for a combination you do not want); `context` writes it
 * out for the student (the business, then its transactions or balances, one per line); each part makes one question
 * from the same scenario. A part never draws random values: everything random is in the scenario.
 *
 * A chained case has a long question among its parts (`journal_set`, `account`, `statement`: the Trading Account,
 * then the Profit and Loss Account, then the Balance Sheet of one trial balance) and so has two to five parts. The
 * case text is what a format is prepared from: the part gives its `task`, `title`, rows, `distractors` and
 * `explanation` and no `data`, and the question the engine builds has the case text as both its `data` and `context`.
 *
 *   caseTemplate({
 *     id: 'case-cycle-shop-month', topicId: 'trial-balance', conceptId: 'tb-case', difficulty: 'medium',
 *     title: 'A month at a stationery shop',
 *     setup: (rng) => ({ capital: amount(rng, 200000, 500000, 50000), ... }),
 *     context: (s) => `Meena started a stationery shop on 1 April.\n1 April: Started business with cash ${formatINR(s.capital)}.\n...`,
 *     parts: [
 *       { kind: 'journal', make: (s) => ({ prompt: 'Pass the entry for the transaction of 5 April.', lines: [...], explanation: [...] }) },
 *       { kind: 'numeric', unit: 'rupees', make: (s) => ({ prompt: 'What is the balance of Cash A/c on 30 April?', answer: ..., commonErrors: [...], explanation: [...] }) },
 *     ],
 *   });
 */
export function caseTemplate<S>(
  def: Common & {
    title: string;
    setup(rng: Rng): S | null;
    context(scenario: S): string;
    parts: CasePart<S>[];
  },
): CaseTemplate {
  const base = { version: def.version ?? 1, topicId: def.topicId, conceptId: def.conceptId, difficulty: def.difficulty };
  /** What a part made, with the case text: as its context and, for a format, as the data it is prepared from. */
  const inCase = <P extends object>(kind: Template['kind'], made: P, context: string): P & { context: string } => {
    if (!isFormatKind(kind)) return { ...made, context };
    // The case text is shown where a format shows its data, so data of its own would say the same thing twice.
    if ((made as { data?: unknown }).data !== undefined) throw new Error(`${def.id}: a format of a case gives no data of its own; the case text is its data`);
    return { ...made, data: context, context };
  };
  // Every part sets the scenario up again from the same random stream, so the parts of one seed agree.
  const from =
    <P extends object>(kind: Template['kind'], make: (scenario: S) => P | null) =>
    (rng: Rng): (P & { context: string }) | null => {
      const scenario = def.setup(rng);
      if (scenario === null) return null;
      const made = make(scenario);
      return made === null ? null : inCase(kind, made, def.context(scenario));
    };
  const parts = def.parts.map((p, i): Template => {
    const id = casePartId(def.id, i);
    switch (p.kind) {
      case 'numeric':
        // A ratio part and a part of one figure are told apart by their unit, as the templates are.
        return p.unit === 'ratio'
          ? { kind: 'numeric', id, ...base, unit: p.unit, generate: from(p.kind, p.make), verify: p.verify }
          : { kind: 'numeric', id, ...base, unit: p.unit, generate: from(p.kind, p.make), verify: p.verify };
      case 'mcq':
        return { kind: 'mcq', id, ...base, generate: from(p.kind, p.make), verify: p.verify };
      case 'journal':
        // The figures are in the case, not in the question, so the prompt need not show an amount of the entry.
        return { kind: 'journal', id, ...base, computed: true, generate: from(p.kind, p.make), verify: p.verify };
      // The long kinds. What `inCase` adds makes each what a template of its kind returns, so the engine builds and
      // checks the question exactly as it does a set or a format that stands alone.
      case 'journal_set':
        return { kind: 'journal_set', id, ...base, generate: from(p.kind, p.make) as (rng: Rng) => JournalSetParts | null, verify: p.verify };
      case 'account':
        return { kind: 'account', id, ...base, generate: from(p.kind, p.make) as (rng: Rng) => AccountParts | null, verify: p.verify };
      case 'statement':
        return { kind: 'statement', id, ...base, generate: from(p.kind, p.make) as (rng: Rng) => StatementParts | null, verify: p.verify };
    }
  });
  const makeAll = (rng: Rng) => {
    const scenario = def.setup(rng);
    if (scenario === null) return null;
    const context = def.context(scenario);
    const all: AnyParts[] = [];
    for (const p of def.parts) {
      const made = p.make(scenario);
      if (made === null) return null;
      all.push(inCase(p.kind, made, context) as AnyParts);
    }
    return all;
  };
  return { id: def.id, title: def.title, ...base, parts, makeAll };
}

// ---------------------------------------------------------------------------------------------------------------
// Small helpers. Amounts are paise everywhere (a ₹ amount times 100); `formatINR` writes them with Indian grouping.
// ---------------------------------------------------------------------------------------------------------------

/**
 * A round amount between two rupee values, in steps of `step` rupees ("amount(rng, 5000, 80000, 1000)" is a whole
 * thousand from ₹5,000 to ₹80,000). Pick the step so that every amount derived from it comes out clean.
 */
export const amount = (rng: Rng, min: number, max: number, step: number): Paise => rupees(rng.step(min, max, step));

/**
 * `count` different days of a month from `first` to `last`, in order: the dates of the transactions of a set
 * ("setDays(rng, 5, 1, 28)" might give 2, 9, 14, 20 and 27).
 */
export function setDays(rng: Rng, count: number, first = 1, last = 28): number[] {
  const all = Array.from({ length: last - first + 1 }, (_, i) => first + i);
  return rng
    .shuffle(all)
    .slice(0, count)
    .sort((a, b) => a - b);
}

/**
 * Several threads of one story merged into a single list, for a set: the order inside a thread is kept (a payment
 * stays after its purchase, a return after its sale); which thread gives the next transaction is drawn, each as
 * likely as it has transactions left.
 */
export function interleave<T>(rng: Rng, threads: readonly (readonly T[])[]): T[] {
  const left = threads.map((t) => [...t]).filter((t) => t.length > 0);
  const out: T[] = [];
  while (left.length > 0) {
    let at = rng.int(0, left.reduce((n, t) => n + t.length, 0) - 1);
    const i = left.findIndex((t) => (at -= t.length) < 0);
    out.push(left[i].shift()!);
    if (left[i].length === 0) left.splice(i, 1);
  }
  return out;
}

/**
 * True when the entries of a set, taken in order, tell a story that can happen: no creditor is paid, and no debtor
 * pays or is given credit for, more than is owed at that point, and (when `funds` says what cash and bank the
 * business starts the set with, in paise) cash and bank never run out. Leave `funds` out for a business that was
 * already running, whose balances the set does not give.
 */
export function storyHolds(entries: readonly { lines: JournalLine[] }[], funds?: { cash: number; bank: number }): boolean {
  const balance = new Map<string, number>(funds ? Object.entries(funds) : []);
  for (const { lines } of entries) {
    for (const l of lines) {
      const party = l.accountId.startsWith('debtor:') || l.accountId.startsWith('creditor:');
      if (!party && !(funds && (l.accountId === 'cash' || l.accountId === 'bank'))) continue;
      // A creditor's balance is a credit one; cash, bank and debtors have debit balances.
      const up = l.accountId.startsWith('creditor:') ? 'Cr' : 'Dr';
      balance.set(l.accountId, (balance.get(l.accountId) ?? 0) + (l.side === up ? l.amount : -l.amount));
    }
    for (const b of balance.values()) if (b < 0) return false;
  }
  return true;
}

/** `storyHolds` as the `verify` of a set template: the story is walked again on the finished question. */
export const setHolds =
  (funds?: { cash: number; bank: number }) =>
  (question: JournalSetQuestion): boolean =>
    storyHolds(question.entries.map((e) => ({ lines: e.expected })), funds);

// ---------------------------------------------------------------------------------------------------------------
// Formats: the sides of an account, written by hand or made from the books.
// ---------------------------------------------------------------------------------------------------------------

/** The debit side of an account, with "To" before every row. `below` are the rows under the totals (a balance brought down). */
export const drSide = (rows: FormatRowParts[], below?: FormatRowParts[]): AccountSideParts => ({
  title: 'Dr',
  prefix: 'To',
  rows,
  ...(below?.length ? { below } : {}),
});
/** The credit side of an account, with "By" before every row. */
export const crSide = (rows: FormatRowParts[], below?: FormatRowParts[]): AccountSideParts => ({
  title: 'Cr',
  prefix: 'By',
  rows,
  ...(below?.length ? { below } : {}),
});

/** When an account made from the books is closed, and when (if at all) its balance is brought down. */
export interface Closing {
  /** The date of the closing row, the last day of the period: "30 April". */
  closeOn: string;
  /** Given for an account that is continued: the day the balance is brought down below the totals, "1 May". */
  reopenOn?: string;
}

/**
 * The two sides of a ledger account from `accountOf` (in `@/engine/books`): its postings as rows, the balance
 * carried down on the shorter side as the closing row and, when `reopenOn` is given, brought down below the totals.
 * Spread it into what an account template returns:
 * `...ledgerSides(accountOf(entries, 'cash', opening), { closeOn: '30 April', reopenOn: '1 May' })`.
 */
export function ledgerSides(view: AccountView, closing: Closing): Pick<AccountParts, 'left' | 'right' | 'broughtDown'> {
  const rows = (side: 'Dr' | 'Cr'): FormatRowParts[] => [
    ...(side === 'Dr' ? view.debit : view.credit).map((p) => ({ date: p.date, label: p.label, amount: p.amount })),
    ...(view.balance && view.balance.side !== side ? [{ date: closing.closeOn, label: BALANCE_CD, amount: view.balance.amount, closing: true }] : []),
  ];
  const below = (side: 'Dr' | 'Cr'): FormatRowParts[] =>
    view.balance && view.balance.side === side && closing.reopenOn ? [{ date: closing.reopenOn, label: BALANCE_BD, amount: view.balance.amount }] : [];
  // With `reopenOn` the task asks for the balance to be brought down, so its place is shown even when none is left.
  return { left: drSide(rows('Dr'), below('Dr')), right: crSide(rows('Cr'), below('Cr')), ...(closing.reopenOn ? { broughtDown: true } : {}) };
}

/** When one period of an account kept over several is closed, when the next opens, and what the period is called. */
export interface PeriodClosing {
  /** The balancing date of the period, with its year: "31 March 2025". */
  closeOn: string;
  /** The day the balance is brought down, the first day of the next period: "1 April 2025". Needed for every period but the last. */
  reopenOn?: string;
  /** What the period is called on the screen. Left out, it is "Period ending <closeOn>". */
  title?: string;
}

/**
 * An account kept over several periods ("Prepare Machinery A/c for the first three years") from dated entries and
 * the balancing dates, in order. Every entry goes to the first period that closes on or after its date (dates are
 * written with their year: "1 October 2024"); each period is written up with `accountOf`, balanced, and its balance
 * brought down as the first row of the next. Give the last closing a `reopenOn` to bring the last balance down below
 * the totals too. Spread it into what an account template returns:
 * `...ledgerPeriods(entries, 'machinery', [{ closeOn: '31 March 2025', reopenOn: '1 April 2025' }, { closeOn: '31 March 2026' }])`.
 */
export function ledgerPeriods(
  entries: readonly DatedEntry[],
  accountId: string,
  closings: readonly PeriodClosing[],
  opening?: OpeningBalance | null,
  labelOf?: (accountId: string) => string,
): Pick<AccountParts, 'left' | 'right' | 'later' | 'periodTitle' | 'broughtDown'> {
  const when = (date: string): number => {
    const order = setDateOrder(date);
    if (order === null) throw new Error(`ledgerPeriods: "${date}" is not a date like "31 March 2025"`);
    return order;
  };
  if (closings.length === 0) throw new Error('ledgerPeriods: an account needs at least one balancing date');
  const ends = closings.map((c) => when(c.closeOn));
  const periods: { title: string; left: FormatRowParts[]; right: FormatRowParts[]; below: Pick<AccountParts, 'left' | 'right'> }[] = [];
  let carried = opening ?? null;
  for (const [k, closing] of closings.entries()) {
    const mine = entries.filter((e) => when(e.date) <= ends[k] && (k === 0 || when(e.date) > ends[k - 1]));
    const view = accountOf(mine, accountId, carried, labelOf);
    const last = k === closings.length - 1;
    if (!last && closing.reopenOn === undefined) throw new Error(`ledgerPeriods: the period closed on ${closing.closeOn} needs the day the next one opens`);
    const sides = ledgerSides(view, { closeOn: closing.closeOn, ...(last && closing.reopenOn ? { reopenOn: closing.reopenOn } : {}) });
    periods.push({ title: closing.title ?? `Period ending ${closing.closeOn}`, left: sides.left.rows, right: sides.right.rows, below: sides });
    carried = view.balance && closing.reopenOn ? { date: closing.reopenOn, ...view.balance } : null;
  }
  const [first, ...later] = periods;
  const end = periods[periods.length - 1].below;
  return {
    left: drSide(first.left, end.left.below),
    right: crSide(first.right, end.right.below),
    ...(later.length > 0 ? { later: later.map(({ title, left, right }) => ({ title, left, right })), periodTitle: first.title } : {}),
    ...(closings[closings.length - 1].reopenOn ? { broughtDown: true } : {}),
  };
}

/** The names of the two amount columns of a cash book with cash and bank columns. */
export const CASH_BOOK_COLUMNS = ['Cash (₹)', 'Bank (₹)'];

/**
 * The two sides of a cash book with cash and bank columns from `cashBook` (in `@/engine/books`), each column
 * balanced and carried down (an overdraft is carried down on the debit side) and, with `reopenOn`, brought down.
 * Give the template `columns: CASH_BOOK_COLUMNS` with it.
 */
export function cashBookSides(view: CashBookView, closing: Closing): Pick<AccountParts, 'left' | 'right' | 'broughtDown'> {
  const row = (r: CashBookRow): FormatRowParts => ({ date: r.date, label: r.label, amounts: [r.cash, r.bank], ...(r.contra ? { contra: true } : {}) });
  // A balance is carried down on the side opposite to its own, and brought down on its own side.
  const balances = (side: 'Dr' | 'Cr', own: boolean): number[] => [view.cash, view.bank].map((b) => (b && (b.side === side) === own ? b.amount : 0));
  const closingRow = (side: 'Dr' | 'Cr'): FormatRowParts[] => {
    const amounts = balances(side, false);
    return amounts.some((a) => a > 0) ? [{ date: closing.closeOn, label: BALANCE_CD, amounts, closing: true }] : [];
  };
  const below = (side: 'Dr' | 'Cr'): FormatRowParts[] => {
    const amounts = balances(side, true);
    return closing.reopenOn && amounts.some((a) => a > 0) ? [{ date: closing.reopenOn, label: BALANCE_BD, amounts }] : [];
  };
  return {
    left: drSide([...view.debit.map(row), ...closingRow('Dr')], below('Dr')),
    right: crSide([...view.credit.map(row), ...closingRow('Cr')], below('Cr')),
    ...(closing.reopenOn ? { broughtDown: true } : {}),
  };
}

/** The names of the amount columns of partners' accounts written in columns, one for each partner: "Asha (₹)". */
export const partnerColumns = (names: readonly string[]): string[] => names.map((name) => `${name} (₹)`);

/**
 * The two sides of partners' accounts written in columns from `columnarAccount` (in `@/engine/books`): a row for
 * every posting with its amount in each partner's column, and every column balanced on its own. A balance is carried
 * down ("Balance c/d") on the side opposite to its own, in its own column, so one closing row usually carries the
 * balances of all the partners, and a partner whose account has a debit balance gets a closing row on the other
 * side. With `reopenOn` the balances are brought down below the totals. Give the template
 * `columns: partnerColumns(names)` with it:
 * `...columnarSides(columnarAccount(entries, names.map(partnerCapital), opening), { closeOn: '31 March 2026' })`.
 */
export function columnarSides(view: ColumnarView, closing: Closing): Pick<AccountParts, 'left' | 'right' | 'broughtDown'> {
  const row = (r: ColumnarRow): FormatRowParts => ({ date: r.date, label: r.label, amounts: r.amounts });
  // A balance is carried down on the side opposite to its own, and brought down on its own side.
  const balances = (side: 'Dr' | 'Cr', own: boolean): number[] => view.balances.map((b) => (b && (b.side === side) === own ? b.amount : 0));
  const closingRow = (side: 'Dr' | 'Cr'): FormatRowParts[] => {
    const amounts = balances(side, false);
    return amounts.some((a) => a > 0) ? [{ date: closing.closeOn, label: BALANCE_CD, amounts, closing: true }] : [];
  };
  const below = (side: 'Dr' | 'Cr'): FormatRowParts[] => {
    const amounts = balances(side, true);
    return closing.reopenOn && amounts.some((a) => a > 0) ? [{ date: closing.reopenOn, label: BALANCE_BD, amounts }] : [];
  };
  return {
    left: drSide([...view.debit.map(row), ...closingRow('Dr')], below('Dr')),
    right: crSide([...view.credit.map(row), ...closingRow('Cr')], below('Cr')),
    ...(closing.reopenOn ? { broughtDown: true } : {}),
  };
}

/**
 * Keeps what a format was made from (its journal entries, say) for the template's `verify`. The engine verifies every
 * question straight after making it, so `verify` can read back what `generate` kept: in `generate`,
 * `kept.keep(data, entries)`; in `verify`, `const entries = kept.of(question.data)`, which is undefined for any
 * other question (and `verify` must then fail). `verify` then works the format out again another way, for example
 * with `post` and `trialBalance`, where `generate` used `accountOf`.
 */
export function keepFor<S>(): { keep(data: string, scenario: S): void; of(data: string): S | undefined } {
  let last: { data: string; scenario: S } | undefined;
  return {
    keep: (data, scenario) => {
      last = { data, scenario };
    },
    of: (data) => (last?.data === data ? last.scenario : undefined),
  };
}

/** Names of parties (customers and suppliers) to use in prompts. */
export const PARTIES = ['Mohan', 'Rao & Co.', 'Anita Traders', 'Kiran', 'Sharma Bros', 'Lakshmi Stores'];
export const party = (rng: Rng): string => rng.pick(PARTIES);

/**
 * GST rates used in Class 11 questions, in percent: the two general rates in force. The 12% and 28% slabs were
 * withdrawn from 22 September 2025.
 */
export const GST_RATES = [5, 18];
export const gstRate = (rng: Rng): number => rng.pick(GST_RATES);

/** True when an amount is a whole number of rupees (no paise). */
export const isWholeRupees = (p: Paise): boolean => p % 100 === 0;

/** `amount` plus `rate` percent of it, in paise ("addPercent(p, 18)" is the amount with 18% GST added). */
export const addPercent = (p: Paise, rate: number): Paise => p + percentOf(p, rate);

/** `amount` less `rate` percent of it, in paise ("lessPercent(p, 10)" is the amount after a 10% discount). */
export const lessPercent = (p: Paise, rate: number): Paise => p - percentOf(p, rate);
