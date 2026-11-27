import type { AccountQuestion, Difficulty, JournalQuestion, JournalSetQuestion, McqQuestion, NumericQuestion, NumericUnit, Ratio, RatioQuestion, StatementQuestion } from '@/content/types';
import type { JournalLine, Transaction } from '@/engine/journal';
import type { Rng } from '@/engine/rng';

/** What every template says about itself. `id` is unique across all topics; changing what a template makes means a new `version`. */
interface TemplateBase {
  id: string;
  version: number;
  topicId: string;
  conceptId: string;
  difficulty: Difficulty;
  /**
   * Set on a template that teaches more than the syllabus of its course asks (interest on drawings of a sole
   * proprietor in Class 11, the order of using IGST credit across heads): one line saying why, shown with a "Beyond the
   * syllabus" chip wherever the pattern or a question of it is shown. Such a template stands on no level and is never
   * set in a mock paper; the Playground lists it, and a Marathon serves it only when the learner asks for it.
   */
  beyondSyllabus?: string;
}

/**
 * A wrong answer and the mistake that leads to it. `why` is shown to the learner who picks it, so it names the
 * mistake ("added the tax instead of deducting it"), not the correction.
 */
export interface Distractor {
  text: string;
  why: string;
}

interface JournalPartsBase {
  prompt: string;
  /** Set by the engine for a question of a case study; a template never writes it. */
  context?: string;
  /** Two hints, the nudge and then the rule; the default pair is used when left out. */
  hints?: string[];
  /** Direct lines only: accounts a student might wrongly pick, offered as choices beside the entry's own. */
  distractorAccounts?: string[];
}

/**
 * Either a `tx`, which the engine turns into the entry (and explains), or the entry written directly as `lines`
 * with the `explanation` steps the author wrote. The engine rejects direct lines that do not balance, name an
 * unknown account or have an amount that is not a positive integer.
 */
export type JournalParts = JournalPartsBase &
  (
    | { tx: Transaction; lines?: undefined; explanation?: undefined }
    | { lines: JournalLine[]; explanation: string[]; tx?: undefined }
  );

/**
 * One item of a set, with its entry stated directly and the steps that explain it. A dated transaction gives its
 * `date`; an item that is not one (an error to rectify, a year-end adjustment) gives a `label` instead, and never both.
 */
export type SetTransaction = {
  /** What happened, as the journal shows it beside the entry: "Bought goods for ₹12,000 from Kiran on credit." */
  text: string;
  lines: JournalLine[];
  /** One step per line. */
  explanation: string[];
} & (
  | {
      /** The day and the month, with the year when the set runs past December: "5 April", "28 January 2026". */
      date: string;
      label?: undefined;
    }
  | {
      /** What an item without a date is called, shown wherever a date would be: "Error 1", "(a)". */
      label: string;
      date?: undefined;
    }
);

/**
 * A set of journal entries: one business, three to eight items (dated transactions in date order, or labelled items
 * such as errors to rectify), one entry for each. The engine refuses a set whose dates go backwards, that tells the
 * same transaction twice, in which a name is both a debtor and a creditor, or in which any entry does not balance,
 * names an unknown account or has an amount that is not a positive integer.
 */
export interface JournalSetParts {
  /**
   * What the student is asked to do, the first line of the prompt. Left out, it is "Journalise the following
   * transactions."; a set of another kind says its own: "Pass the rectifying entries.", "Pass the closing entries."
   */
  task?: string;
  /**
   * The business and the period, and every convention the entries rely on ("All dealings are in cash.", "Cheques
   * received are banked the same day."). Shown under the task, above the journal.
   */
  opening: string;
  /** Set by the engine for a set that is one question of a case study; a template never writes it. */
  context?: string;
  transactions: SetTransaction[];
  hints?: string[];
  /** Accounts a student might wrongly pick, offered as choices beside those of the entries. */
  distractorAccounts?: string[];
}

/**
 * One row of a format as an examiner expects it. Give `amount` for a format with one amount column, `amounts` (one
 * for each column, 0 or null where the row leaves the column blank) for one with two.
 */
export interface FormatRowParts {
  /** The day the row is entered against, shown in the solution: "5 April". The student does not type dates. */
  date?: string;
  /** The particulars, without the side's "To" or "By": "Sales A/c", "Balance c/d", "Sundry debtors". */
  label: string;
  /** The amount, in paise, of a row of a format with one amount column. */
  amount?: number;
  /** One amount for each column, in paise, 0 or null where the column is left blank. */
  amounts?: (number | null)[];
  /**
   * Lines of working shown under the particulars in the solution: "Purchases ₹50,000", "Less: Returns ₹2,000". The
   * student enters the net figure only, and the task must say so ("Show purchases net of returns.").
   */
  details?: string[];
  /** True for a closing row: balance c/d, gross profit c/d, net profit transferred to Capital A/c. */
  closing?: boolean;
  /** True for a contra entry of a cash book: the solution marks it "C". */
  contra?: boolean;
  /**
   * What the row refers to in the data, shown beside it in the solution and never typed by the student: "(a)" for a
   * row of a Suspense account that puts error (a) right. Keep `date` for dates.
   */
  ref?: string;
  /**
   * Other wordings of the particulars that an examiner accepts as well: `also: ['Balance b/d']` on the "Difference in
   * trial balance" a Suspense A/c opens with. They are offered with the labels, and the row is right under any of
   * them; the solution shows `label`. Only for wording that is merely different: never a label that is a mistake
   * in the same list, nor the label (or another wording) of a row of that list with the same amounts.
   */
  also?: string[];
  /** Of a row of a statement with a "Note No." column (`noteHeading`): the number of its note, "1". Shown, never typed. */
  note?: string;
  /**
   * Of a row of a statement with a column that is `given`: false when the student must work the figures of this row
   * out all the same (the tax, a total, a line the data gives only indirectly). They are then typed in every
   * column. Left out, the row prints its figure in every given column.
   */
  given?: boolean;
}

/** One period, after the first, of an account kept over several: its rows on each side, the balance brought down first. */
export interface AccountPeriodParts {
  /** What the period is called on the screen: "Year ended 31 March 2026". Left out, it is "Period 2", "Period 3", ... */
  title?: string;
  left: FormatRowParts[];
  right: FormatRowParts[];
}

/** One side of a two-sided account. `drSide` and `crSide` (in `authoring.ts`) make the two sides of a ledger account. */
export interface AccountSideParts {
  /** What heads the side: "Dr", "Cr"; "Liabilities", "Assets". */
  title: string;
  /** What the side writes before the particulars of every row: "To", "By". Left out for a side that writes nothing. */
  prefix?: string;
  /** The rows above the totals, in the order the solution shows them, the closing row among them. */
  rows: FormatRowParts[];
  /** For an account that is continued: the rows below the totals (the balance brought down on this side). */
  below?: FormatRowParts[];
}

/** What every format gives besides its rows. */
interface FormatPartsBase {
  /**
   * What the student is asked to do, one line, which is the prompt: "Prepare Rao & Co.'s account for April and
   * balance it." Say here whatever the rows rely on ("Show purchases net of returns.").
   */
  task: string;
  /**
   * What the student works from: the business and the period, then the transactions, balances or adjustments, one
   * to a line. It is shown in a panel beside the format, not in the prompt.
   */
  data: string;
  /**
   * Set by the engine for a format that is one question of a case study, whose data is then the case text itself; a
   * template never writes it.
   */
  context?: string;
  /** What heads the format: "Rao & Co. A/c", "Trial Balance of Ravi Textiles as on 31 March 2026". */
  title: string;
  /**
   * The names of the amount columns, up to four: a cash book has two, partners' capital accounts one for each
   * partner (`partnerColumns(['Asha', 'Bimal'])`), a Sales Book four (taxable value, CGST, SGST and total). Left out,
   * the format has one column, "Amount (₹)".
   */
  columns?: string[];
  /**
   * Particulars a student might wrongly pick, offered beside those of the rows: at least two that no row uses. The
   * usual slips: the account itself, "Balance b/d" where c/d is meant, an account of a transaction that does not belong.
   */
  distractors: string[];
  /** The working, one step per line, shown under the solution. */
  explanation: string[];
  hints?: string[];
}

/**
 * A two-sided account: the left side and the right side, each with its rows. The rows above the totals must agree
 * side with side in every amount column, so the closing row (the balance c/d) is one of the rows. The engine refuses
 * an account whose sides do not agree, a row without particulars, an amount that is not a positive whole number of
 * rupees, two rows of one side with the same particulars and amounts, and fewer than two usable distractors.
 */
export interface AccountParts extends FormatPartsBase {
  left: AccountSideParts;
  right: AccountSideParts;
  /**
   * For an account kept over several periods ("Prepare Machinery A/c for the first three years"): the periods after
   * the first, in order. `left` and `right` are then the first period; every period has its own closing row and must
   * agree side with side on its own, and a later period opens with the balance brought down as an ordinary row
   * (the student enters it). Rows are matched within their period, so two years may each have "By Depreciation
   * A/c" for the same amount. The `below` rows of `left` and `right` stand under the totals of the last period.
   * At most 4 periods and 24 rows in all. `ledgerPeriods` (in `authoring.ts`) builds all of it from dated entries.
   */
  later?: AccountPeriodParts[];
  /** With `later`: what the first period is called. Left out, it is "Period 1". */
  periodTitle?: string;
  /**
   * True when the task asks for the balance to be brought down. The place for it is then shown below the totals
   * whether or not a balance is left, so the screen does not give away that there is none. (An account with
   * `below` rows shows the place anyway.)
   */
  broughtDown?: boolean;
}

/**
 * A statement: one list of rows with one to four amount columns, totalled. `totalsAgree` says the two columns must
 * come to the same total (a Trial Balance); `final` is a figure the student works out and types under the totals
 * (the balance a Bank Reconciliation Statement ends on), which with two columns must be their difference. A
 * statement in parts (a cash flow statement, a comparative statement, a balance sheet in the Schedule III form) has
 * sub-headings and sub-totals among its rows, and columns of other kinds than rupees.
 */
export interface StatementParts extends Omit<FormatPartsBase, 'columns'> {
  /** What heads the particulars column. Left out, it is "Particulars". */
  heading?: string;
  /**
   * The amount columns, up to four. A name alone is a column of whole rupees that are never negative and add up to a
   * total, as every column of an account is. Give `{ name, ... }` for a column of another kind (see
   * `StatementColumnParts`): a percentage, or figures that may be negative.
   */
  columns?: (string | StatementColumnParts)[];
  /**
   * The rows in the order the solution shows them. Between them a statement in parts may have sub-headings
   * (`{ heading: 'Expenses' }`) and sub-totals (`{ subtotal: 'Total expenses', amount }`): see `StatementLineParts`.
   */
  rows: (FormatRowParts | StatementLineParts)[];
  /**
   * What heads a column of note numbers between the particulars and the amounts: "Note No.". Give the rows (and
   * sub-totals) their `note` with it. The column is shown in the solution and is never typed.
   */
  noteHeading?: string;
  totalsAgree?: boolean;
  /**
   * `alternatives` are other names the final figure might have ("Overdraft as per Pass Book" beside "Balance as per
   * Pass Book"). When they are given the label is not shown: the student picks it among them as well as typing the
   * amount, and the pick is checked.
   */
  final?: { label: string; amount: number; alternatives?: string[] };
}

/** A column of a statement that is not a plain rupee column. */
export interface StatementColumnParts {
  /** What heads the column: "Absolute change (₹)", "Percentage change (%)", "Number of shares". */
  name: string;
  /**
   * What its figures count. 'rupees' (the default): paise, in whole rupees. 'percent': hundredths of a percent, so
   * 12.5% is 1250; choose figures that come out exact to two decimal places, or say "to two decimal places" in the
   * task and round. 'number': a plain whole number.
   */
  unit?: 'rupees' | 'percent' | 'number';
  /** True where a figure may be negative (a decrease, an outflow of cash): the student types a minus sign and the solution shows brackets. */
  signed?: boolean;
  /**
   * Whether the figures of the column add up to a total. Left out: yes for rupees and numbers, no for a percent. A
   * column that does not add up has no total, and no sub-total is checked in it.
   */
  adds?: boolean;
  /**
   * True for a column whose figures the question gives: the two years of a comparative statement, which the data
   * states. A row prints its figure there as soon as its particulars are chosen, and the student types only what is
   * worked out. A row that says `given: false` is typed all the same, and so is every sub-total unless it says
   * `given: true`. A printed figure earns nothing; something must be left to work out.
   */
  given?: boolean;
}

/**
 * A line of a statement that is not a row: a sub-heading, which is printed above the rows that follow it, or a
 * sub-total, which is printed with its name and which the student works out and types (it counts as a row in the
 * marks). The rows between two such lines are entered together and matched as a collection, as the rows of a side of
 * an account are, so a row entered under the wrong sub-heading is not right.
 */
export type StatementLineParts =
  | { heading: string }
  | {
      /** What the sub-total is called: "Total revenue", "Net cash from operating activities". */
      subtotal: string;
      /** The figure, of a statement with one amount column. */
      amount?: number;
      /** One figure for each column, 0 or null where the sub-total has none. */
      amounts?: (number | null)[];
      note?: string;
      /**
       * True for a sub-total that is printed in the columns that are `given`. Left out, the student adds it up and
       * types it in every column.
       */
      given?: boolean;
      /**
       * What the sub-total adds up, which the engine then checks in every column that adds up: 'section' for the rows
       * above it back to the last sub-heading (a running total of a part: "Cash generated from operations"), 'block'
       * for the rows above it back to the last sub-total, whatever sub-headings stand between (the "Total" of each half
       * of a balance sheet), 'all' for every row above it ("Net increase in cash"). Left out, it is not checked: a
       * sub-total that is a difference ("Profit before tax") is for `verify` to work out.
       */
      sum?: 'section' | 'block' | 'all';
    };

export interface McqParts {
  prompt: string;
  /** Set by the engine for a question of a case study; a template never writes it. */
  context?: string;
  /** The text of the right option. */
  correct: string;
  /** At least three wrong options, each a named common mistake; the engine picks three and shuffles. */
  distractors: Distractor[];
  /** The options in the order to show them, by their text, where that order is fixed (the board's Assertion-Reason). */
  optionOrder?: readonly string[];
  explanation: string;
  hints?: string[];
}

export interface NumericParts {
  prompt: string;
  /** Set by the engine for a question of a case study; a template never writes it. */
  context?: string;
  /**
   * A positive integer in the template's unit: paise for rupees, the number itself, hundredths for percent and for
   * times (a current ratio of 2.5 : 1 is 250).
   */
  answer: number;
  /** At least two known wrong answers, each with the mistake behind it. */
  commonErrors: { value: number; why: string }[];
  /** The working, one step per line. */
  explanation: string[];
  hints?: string[];
}

/** What a template whose answer is a ratio returns: as `NumericParts`, with ratios where those have figures. */
export interface RatioParts extends Omit<NumericParts, 'answer' | 'commonErrors'> {
  /**
   * The ratio as its terms, in the order the prompt names the partners, in lowest terms: [5, 3, 2] for 5:3:2. Two to
   * four whole numbers above zero. `lowestTerms` (in `authoring.ts`) reduces a ratio.
   */
  answer: Ratio;
  /** At least two known wrong ratios of as many terms, each in lowest terms, with the mistake behind it. */
  commonErrors: { value: Ratio; why: string }[];
}

/**
 * `generate` draws everything it needs from `rng` and may return null to reject the seed (an awkward combination
 * of values): the engine then tries the next seed. `verify` is an independent check of the finished question: it
 * must recompute or re-read the answer another way, and a question that fails it is never served.
 */
export interface JournalTemplate extends TemplateBase {
  kind: 'journal';
  /**
   * The student has to work the amount out (a depreciation charge, a provision, an adjustment), so the prompt need
   * not show any amount of the entry itself. The test harness then does not require the prompt to state one.
   */
  computed?: boolean;
  generate(rng: Rng): JournalParts | null;
  verify?(question: JournalQuestion): boolean;
}

export interface JournalSetTemplate extends TemplateBase {
  kind: 'journal_set';
  generate(rng: Rng): JournalSetParts | null;
  verify?(question: JournalSetQuestion): boolean;
}

export interface AccountTemplate extends TemplateBase {
  kind: 'account';
  generate(rng: Rng): AccountParts | null;
  verify?(question: AccountQuestion): boolean;
}

export interface StatementTemplate extends TemplateBase {
  kind: 'statement';
  generate(rng: Rng): StatementParts | null;
  verify?(question: StatementQuestion): boolean;
}

export interface McqTemplate extends TemplateBase {
  kind: 'mcq';
  /** The engine also passes the seed asked for, for a bank that walks through its items (`assertionReasonTemplate`). */
  generate(rng: Rng, seed?: number): McqParts | null;
  verify?(question: McqQuestion): boolean;
}

/** A numeric template of one figure: rupees, a number, a percent, or "times". */
export interface NumericTemplate extends TemplateBase {
  kind: 'numeric';
  unit: NumericUnit;
  generate(rng: Rng): NumericParts | null;
  verify?(question: NumericQuestion): boolean;
}

/** A numeric template whose answer is a ratio: a template of kind 'numeric' in every other way. */
export interface RatioTemplate extends TemplateBase {
  kind: 'numeric';
  unit: 'ratio';
  generate(rng: Rng): RatioParts | null;
  verify?(question: RatioQuestion): boolean;
}

export type Template = JournalTemplate | JournalSetTemplate | AccountTemplate | StatementTemplate | McqTemplate | NumericTemplate | RatioTemplate;

/** The kinds of template that make a format (an account or a statement): long questions, kept on levels of their own. */
export const FORMAT_KINDS = ['account', 'statement'] as const;
export const isFormatKind = (kind: Template['kind']): kind is (typeof FORMAT_KINDS)[number] =>
  (FORMAT_KINDS as readonly string[]).includes(kind);

/**
 * The kinds that make a long question, answered in several parts and over several minutes: a set of entries and the
 * two formats. A case study that asks one is a chained case, with fewer questions than a case of short ones.
 */
export const LONG_KINDS = ['journal_set', ...FORMAT_KINDS] as const;
export const isLongKind = (kind: Template['kind']): kind is (typeof LONG_KINDS)[number] => (LONG_KINDS as readonly string[]).includes(kind);

/** What a set of entries gives as one question of a case: the case text has the business and its conventions, so the opening line may be left out. */
export type CaseSetParts = Omit<JournalSetParts, 'opening' | 'context'> & { opening?: string };
/**
 * What a format gives as one question of a case: everything a format gives but its `data`, because the case text is
 * what the student works from, and it is shown once.
 */
export type CaseAccountParts = Omit<AccountParts, 'data' | 'context'> & { data?: never };
export type CaseStatementParts = Omit<StatementParts, 'data' | 'context'> & { data?: never };

/** What any one kind of template returns from `generate`, and so what one question of a case is made from. */
export type AnyParts = JournalParts | JournalSetParts | AccountParts | StatementParts | McqParts | NumericParts | RatioParts;

/**
 * A case study: one scenario (a business, its transactions or its balances) and several questions on it, asked in
 * order. `parts` are ordinary templates, one per question, with ids `<caseId>~1`, `<caseId>~2`, ...: each sets the
 * same scenario up from the seed and makes its own question from it, so a question of a case is regenerated from
 * its id like any other. They are never served on their own by practice; a case is played whole. A part may be of
 * any kind: a chained case asks for a set of entries, an account or a statement on the one scenario.
 */
export interface CaseTemplate {
  id: string;
  version: number;
  topicId: string;
  conceptId: string;
  difficulty: Difficulty;
  /** A short name for the case, shown where cases are listed ("A month at a stationery shop"). */
  title: string;
  parts: Template[];
  /**
   * What every question of the case is made from, in order, with the scenario set up once; null when the set-up or
   * any question rejects the seed. The engine builds a case from this, so a case costs one set-up, not one per question.
   * `caseTemplate` always provides it; without it each part sets the scenario up for itself.
   */
  makeAll?(rng: Rng): AnyParts[] | null;
}

/**
 * What can be known of a template without loading its topic: enough to list it, count it and choose it, not to make
 * a question from it. Every `Template` is one.
 */
export type TemplateOutline = Pick<Template, 'id' | 'version' | 'topicId' | 'conceptId' | 'difficulty' | 'kind' | 'beyondSyllabus'>;

/** The same for a case study: its name, and the kind of each of its questions. Every `CaseTemplate` is one. */
export type CaseOutline = Pick<CaseTemplate, 'id' | 'version' | 'topicId' | 'conceptId' | 'difficulty' | 'title'> & {
  parts: Pick<Template, 'kind'>[];
};
