import type { ColumnKind, FormatRow } from '@/engine/formats';
import type { JournalLine } from '@/engine/journal';

export type { ColumnKind, FormatRow };

export type TopicStatus = 'available' | 'comingSoon' | 'planned';
export type Difficulty = 'easy' | 'medium' | 'complex';

export interface TopicMeta {
  id: string;
  courseId: string;
  title: string;
  unit: string;
  kind: 'practical' | 'theory';
  status: TopicStatus;
  description: string;
  whyItMatters: string;
}

/** A topic from a later course, shown greyed out and never openable. */
export interface TopicPreview {
  title: string;
  label: string;
}

export interface Course {
  id: string;
  title: string;
  topics: TopicMeta[];
  previews: TopicPreview[];
}

export interface Concept {
  id: string;
  topicId: string;
  title: string;
}

export interface Card {
  id: string;
  topicId: string;
  conceptId: string;
  kind: 'rule' | 'formula' | 'format' | 'shortcut';
  prompt: string;
  answer: string;
  explanation: string;
  example: string;
  commonMistake: string;
  /**
   * Of a card that teaches more than the syllabus of its course asks: one line saying why (the reasons of
   * `content/beyondSyllabus.ts`). It is shown with a "Beyond the syllabus" chip wherever the card is read; such a card
   * stands on no revision level and is never handed out for revision.
   */
  beyondSyllabus?: string;
}

export type LessonBlock =
  | { type: 'text'; heading: string; body: string }
  | { type: 'example'; title: string; lines: JournalLine[]; note: string }
  /**
   * A worked example that is not a journal entry: a valuation, a ratio worked out, an amount found step by step. Its
   * working is shown one step to a line under its title, with a closing remark where one is given.
   */
  | { type: 'working'; title: string; lines: string[]; note?: string }
  /**
   * A small table in a lesson: a statement in short, or figures set beside what they are. Each row is a label and the
   * figure beside it, written as it is to be read ("₹1,20,000", "(40,000)", "12.5%"). A row with no figure is a
   * sub-heading; a `total` row is ruled off and bold.
   */
  | { type: 'table'; title: string; rows: { label: string; amount?: string; total?: true }[]; note?: string }
  | { type: 'check'; questionId: string };

export type LevelType =
  | 'concept'
  | 'card_revision'
  | 'rule_recognition'
  | 'method_recognition'
  | 'easy_practice'
  | 'guided_practice'
  | 'medium_practice'
  | 'complex_practice'
  | 'mixed_practice'
  | 'challenge'
  | 'set_practice'
  | 'format_practice'
  | 'look_back'
  | 'case_study'
  | 'simulation';

/** The templates one earlier topic gives a look-back level. */
export interface LookBackTopic {
  topicId: string;
  templateIds: string[];
}

export interface Level {
  id: string;
  topicId: string;
  order: number;
  type: LevelType;
  title: string;
  description: string;
  /** Fraction correct needed to pass; defaults to CONFIG.level.defaultPassMark. */
  passMark?: number;
  lesson?: LessonBlock[];
  cardIds?: string[];
  questionIds?: string[];
  generate?: { templateIds: string[]; count: number };
  /**
   * A look-back level: the templates of its own topic, and those of each topic before it in the course. How many
   * questions of each it asks is in CONFIG.lookBack. They are kept out of `generate` on purpose: what a level
   * generates becomes available to practice once the level is passed, and a look-back must open nothing.
   */
  lookBack?: { templateIds: string[]; earlier: LookBackTopic[] };
  /** A case-study level: the cases it can serve. Each play serves one whole case, the next play the next case. */
  cases?: { caseIds: string[] };
  /**
   * A simulation level: a scene of the simulator (src/simulator/scenes.ts) played in one of its modes. 'predict' shows
   * `watch` transactions played through first, then asks for `count` predictions; 'mistakes' asks the student to find
   * the error in `count` wrongly recorded transactions. It is passed, as any level, by the share of them right.
   */
  simulation?: SimulationSpec;
  timerSecondsPerQuestion?: number;
}

export interface SimulationSpec {
  sceneId: string;
  mode: 'predict' | 'mistakes';
  count: number;
  /** In 'predict' mode: transactions shown played through before the predictions begin. */
  watch?: number;
}

interface QuestionBase {
  id: string;
  topicId: string;
  conceptId: string;
  difficulty: Difficulty;
  /**
   * For a question of a case study: the case itself (the business, its transactions or balances), shown above the
   * prompt. Every question of one case carries the same text.
   */
  context?: string;
  prompt: string;
  hints: string[];
  explanation: string;
  /**
   * Of an authored question that teaches more than the syllabus of its course asks: one line saying why. It is shown
   * with a "Beyond the syllabus" chip; such a question stands on no level and is never set in a mock paper, and a
   * Marathon asks it only when the learner turns beyond-syllabus practice on. A generated question never carries it:
   * its template does (see `beyondSyllabusOf` in outline.ts).
   */
  beyondSyllabus?: string;
}

export interface McqOption {
  id: string;
  text: string;
  /** For a wrong option: the named mistake that leads to it, shown in feedback when it is chosen. */
  why?: string;
}

export interface McqQuestion extends QuestionBase {
  type: 'mcq';
  options: McqOption[];
  correct: string;
}

export interface TrueFalseQuestion extends QuestionBase {
  type: 'true_false';
  correct: boolean;
}

export interface JournalQuestion extends QuestionBase {
  type: 'journal_entry';
  expected: JournalLine[];
  /** Account ids offered in the picker: the expected ones plus distractors. */
  accountChoices: string[];
  /**
   * The narration of the correct entry, shown under it ("Being goods purchased on credit from Ravi"). Left out, it is
   * worked out from the entry (see `narrationFor` in engine/narration.ts).
   */
  narration?: string;
}

/**
 * One item of a set: what happened, the entry it calls for and the reasoning, a step per line. A dated transaction
 * has its `date` ("5 April"); an item that is not one (an error to rectify, an adjustment) has a `label` instead
 * ("Error 1", "(a)"), shown wherever the date would be. Every item has one of the two, never both.
 */
export interface SetEntry {
  date?: string;
  label?: string;
  text: string;
  expected: JournalLine[];
  explanation: string[];
  /** The narration of the correct entry; left out, it is worked out from the entry (see `narrationFor`). */
  narration?: string;
}

/**
 * "Journalise the following transactions": several dated transactions of one business, in date order (or labelled
 * items: errors to rectify, adjustments to pass), and one entry for each. The prompt is the task and the opening
 * line (the business, the period, the conventions); the transactions themselves are in `entries`, and the journal
 * shows each beside the entry it asks for.
 */
export interface JournalSetQuestion extends QuestionBase {
  type: 'journal_set';
  entries: SetEntry[];
  /** Account ids offered in the picker of every entry: the expected ones of the whole set plus distractors. */
  accountChoices: string[];
}

/**
 * What a numeric answer of one figure is counted in: paise for 'rupees', a plain integer for 'number', hundredths of
 * a percent for 'percent' (1250 is 12.50%), and hundredths for 'times' (250 is 2.5: a current ratio of 2.5 : 1, a
 * turnover of 2.5 times). It is exact: nothing near the answer is right.
 */
export type NumericUnit = 'rupees' | 'number' | 'percent' | 'times';

/** A question answered with one figure. */
export interface NumericQuestion extends QuestionBase {
  type: 'numeric';
  unit: NumericUnit;
  /** A positive integer in the unit above. */
  answer: number;
  /** Known wrong answers and the mistake behind each; feedback names the mistake when one is entered. */
  commonErrors: { value: number; why: string }[];
  /** The working, one step per line. `explanation` is the same text joined into a paragraph. */
  working: string[];
}

/**
 * A ratio between two to four parties, in the order the question names them: [5, 3, 2] is 5:3:2. Whole numbers above
 * zero with no common factor, so that two ratios are the same answer exactly when their terms are. It is held as its
 * terms and never as one number.
 */
export type Ratio = number[];

/**
 * A question answered with a ratio ("3:2", "5:3:2"), typed in the order the question names the parties. It is a
 * numeric question in every other way: one answer, known wrong answers with the mistake behind each, and working.
 */
export interface RatioQuestion extends QuestionBase {
  type: 'numeric';
  unit: 'ratio';
  /** The ratio in its lowest terms. How many terms it has says how many numbers the student types. */
  answer: Ratio;
  /** Known wrong ratios (each of as many terms, in lowest terms) and the mistake behind each. */
  commonErrors: { value: Ratio; why: string }[];
  working: string[];
}

/** A numeric answer as it is held: one integer in the question's unit, or the terms of a ratio. */
export type NumericValue = number | Ratio;

/** Either kind of question that is answered by typing a figure: one number, or a ratio. */
export type TypedQuestion = NumericQuestion | RatioQuestion;

/** What every format (an account or a statement) has besides its rows. */
interface FormatBase extends QuestionBase {
  /**
   * What the student works from: the business and the period, then its transactions, balances or adjustments, one to
   * a line. Shown in a panel that stays within reach while the rows are entered. The prompt is the task alone.
   */
  data: string;
  /** What heads the format: "Rao & Co. A/c", "Trial Balance of Ravi Textiles as on 31 March 2026". */
  title: string;
  /**
   * The amount columns, one to four, by name: ["Amount (₹)"], ["Cash (₹)", "Bank (₹)"], ["Debit (₹)", "Credit (₹)"],
   * and for partners' capital accounts written in columns one for each partner: ["Asha (₹)", "Bimal (₹)", "Chitra (₹)"].
   */
  columns: string[];
  /** The particulars offered in the picker of every row: those of the expected rows and the distractors, sorted. */
  labels: string[];
  /** The working, one step per line. `explanation` is the same text joined into a paragraph. */
  working: string[];
}

/** One side of a two-sided account. */
export interface AccountSide {
  /** What heads the side: "Dr" and "Cr", or "Liabilities" and "Assets". */
  title: string;
  /** What the side writes before the particulars of every row ("To", "By"); left out by a side that writes nothing. */
  prefix?: string;
  /** The rows above the totals, closing rows (balance c/d) among them. */
  rows: FormatRow[];
  /** The rows below the totals of an account that is continued: the balance brought down. Empty otherwise. */
  below: FormatRow[];
}

/**
 * A two-sided account the student prepares: a ledger account, a cash book, a Trading and Profit and Loss Account, a
 * Balance Sheet. The student enters the rows of each side (picking the particulars, typing the amounts), the closing
 * rows like any other. The rows above the totals agree side with side, column by column.
 */
export interface AccountQuestion extends FormatBase {
  type: 'account';
  /** The left side and the right side. Of an account kept over several periods: the rows of its first period. */
  sides: [AccountSide, AccountSide];
  /**
   * For an account kept over several periods (Machinery A/c for three years): the rows of each period after the
   * first, left side and right side, the balance brought down among them as a row the student enters. Every period
   * is balanced and totalled on its own, and its rows are matched on their own, so the same row may stand in two
   * periods. The `below` rows of the sides then stand below the totals of the last period.
   */
  later?: [FormatRow[], FormatRow[]][];
  /** With `later`: what each period is called, the first included: "Year ended 31 March 2025". */
  periodTitles?: string[];
  /**
   * Set when the task asks for the balance to be brought down: the place for it is then shown below the totals
   * whether or not the answer has a balance, so the screen does not say if one is left (a Suspense account).
   */
  continued?: true;
}

/**
 * A statement the student prepares: one list of rows with one or two amount columns and their totals. A Trial
 * Balance (debit and credit columns that agree), a Bank Reconciliation Statement (plus and minus columns and the
 * balance they end on), a Purchases Book (one column and its total).
 */
/**
 * A line of a statement that stands between its rows and is not one of them: a sub-heading ("A. Cash flows from
 * operating activities"), or a sub-total, which is printed with its name and which the student works out and types
 * ("Total revenue", "Net cash from operating activities"). `at` says where: above the row of that number, counted
 * from 0, and after the last row when it is the number of rows.
 */
export type StatementLine =
  | { at: number; heading: string }
  | {
      at: number;
      subtotal: string;
      /** One figure for every amount column, in the unit of the column; 0 where the sub-total has none. */
      amounts: number[];
      /** The number of the note it refers to, shown in the "Note No." column of the solution. */
      note?: string;
      /**
       * Set for a sub-total that is printed in the columns the statement gives (see `givenColumns`). Left out, the
       * student adds it up and types it in every column.
       */
      given?: true;
    };

export interface StatementQuestion extends FormatBase {
  type: 'statement';
  /** What heads the particulars column: "Particulars", "Name of account". */
  heading: string;
  /** The rows the student enters, in the order the solution shows them. */
  rows: FormatRow[];
  /**
   * The kind of every amount column, where one of them is not whole rupees that are never negative and add up: a
   * percentage change (`unit: 'percent'`, `signed`), an absolute change or a cash flow that may be negative
   * (`signed`). Left out by a statement all of whose columns are plain rupee columns.
   */
  columnKinds?: ColumnKind[];
  /**
   * For every amount column, whether the statement gives its figures: the two years of a comparative statement,
   * which the data states. A row prints its figure in a given column once its particulars are chosen (unless it
   * says `given: false`), and a sub-total that says `given: true` prints it too; the student types the rest. A
   * printed figure is not typed, cannot be wrong and earns nothing. Left out by a statement that gives no column.
   */
  givenColumns?: boolean[];
  /**
   * The sub-headings and sub-totals of a statement in parts, in order. They split the rows into the lists the student
   * fills in: a row is entered under its own sub-heading and matched with the rows that stand there, and each
   * sub-total is a figure of its own. A statement that has a sub-total shows no total of its columns.
   */
  lines?: StatementLine[];
  /** What heads the column of note numbers, where the rows have them: "Note No.". It is shown, never typed. */
  noteHeading?: string;
  /** Set for a statement whose two columns must total the same (a Trial Balance). */
  totalsAgree?: true;
  /**
   * The figure the statement ends on, which the student works out and types: "Balance as per Pass Book". With
   * `options` (the right label among others, sorted) the student also picks what the figure is called, and the pick
   * is checked: whether a Bank Reconciliation Statement ends on a balance or on an overdraft is part of the answer.
   */
  final?: { label: string; amount: number; options?: string[] };
}

export type Question =
  | McqQuestion
  | TrueFalseQuestion
  | JournalQuestion
  | NumericQuestion
  | RatioQuestion
  | JournalSetQuestion
  | AccountQuestion
  | StatementQuestion;

export interface TopicPack {
  topicId: string;
  concepts: Concept[];
  cards: Card[];
  levels: Level[];
  questions: Question[];
}

// ---------------------------------------------------------------------------------------------------------------
// Outlines: what the screens that list things (Home, Topics, Progress, Practice) need of a pack. The packs
// themselves, with their lessons, cards and questions, are loaded topic by topic when something is played (see
// loadTopics.ts); the outlines of all of them are generated (outline.generated.ts) and always there.
// ---------------------------------------------------------------------------------------------------------------

export type CardOutline = Pick<Card, 'id' | 'topicId' | 'conceptId' | 'beyondSyllabus'>;

export type QuestionOutline = Pick<Question, 'id' | 'topicId' | 'conceptId' | 'difficulty' | 'type' | 'context' | 'beyondSyllabus'>;

/**
 * A level as it is listed: where it stands and what it lists (the questions it asks, the templates it generates
 * from, its cases). Of a lesson only the checks are kept, and a look-back level is without the templates it draws on.
 */
export type LevelOutline = Pick<Level, 'id' | 'topicId' | 'order' | 'type' | 'title' | 'lesson' | 'questionIds' | 'generate' | 'cases'>;

/** A pack as it is listed. Every `TopicPack` is one, so what works on outlines works on packs. */
export interface TopicOutline {
  topicId: string;
  concepts: Concept[];
  cards: CardOutline[];
  levels: LevelOutline[];
  questions: QuestionOutline[];
}
