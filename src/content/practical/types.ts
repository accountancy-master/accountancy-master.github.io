import type { Difficulty } from '@/content/types';

// Project work and its viva voce (CBSE 2025-26, Part C of the paper: 20 marks; Class 12 splits them into a project file of 12 and a viva of 8, Class 11 leaves the split to the school):
// plain data, written by hand (cbse11.ts, cbse12.ts and their viva banks viva11.ts, viva12.ts) and checked by
// validate.ts (run by `npm run validate-content` and a unit test). The figures of every worked outline are checked by
// figures.test.ts: the trial balance agrees, the balance sheet balances, the bank reconciliation reconciles, every
// ratio and percentage is what its inputs give. The "Project and viva" page (/practical) imports them only when it is
// opened. Amounts are whole rupees (not paise, as in the question bank), except in a company's statements, which are
// in ₹ lakh as the outline says.

/** The project work of a course: the options a student may choose from, and the viva bank. */
export interface PracticalCourse {
  courseId: string;
  /** What the syllabus asks for, in a sentence or two. */
  intro: string;
  /** How the 20 marks of Part C are split (project file, viva voce): the same for every option of the course. */
  marks: MarkPart[];
  options: ProjectOption[];
  viva: VivaQuestion[];
}

/** A share of the marks: "Project file", 12. */
export interface MarkPart {
  part: string;
  marks: number;
  /** What earns these marks. */
  what: string;
}

/**
 * One project a student may choose.
 *
 * - `id`: kebab-case, unique within the course; the anchor of its guide (`/practical#option-<id>`).
 * - `number`: as the syllabus lists it ("Option 1").
 * - `fileSections`: what the project file holds, in the order it is bound.
 * - `plan`: the steps, each with when to do it (a suggested timeline).
 * - `mistakes`: what loses marks, each one sentence or two, written as the mistake.
 * - `topicIds`: the topics of the course it draws on.
 * - `worked`: a worked outline with sample figures, all internally consistent.
 */
export interface ProjectOption {
  id: string;
  number: number;
  title: string;
  /** A short name for a filter or a chip: "BRS", "Comprehensive". */
  short: string;
  summary: string;
  /** When in the year it is best done, and who it suits. */
  when: string;
  /** Businesses (or companies) a student might choose for it. */
  ideas?: string[];
  /** The parts a student chooses among, where the syllabus offers a choice (Class 12: any two of four). */
  aspects?: { title: string; what: string }[];
  fileSections: FileSection[];
  plan: PlanStep[];
  mistakes: string[];
  topicIds: string[];
  worked: WorkedOutline;
}

export interface FileSection {
  title: string;
  what: string;
}

export interface PlanStep {
  /** "Week 1", "Weeks 2 and 3". */
  when: string;
  task: string;
}

/** The business (or company) of a worked outline. */
export interface Business {
  name: string;
  owner: string;
  place: string;
  trade: string;
  /** The period the outline covers: "April 2025". */
  period: string;
  about: string;
}

// ---------------------------------------------------------------------------------------------------------------
// Worked outlines, one kind for each kind of project.
// ---------------------------------------------------------------------------------------------------------------

export type WorkedOutline = SoleProprietorWorked | BankReconciliationWorked | VouchersWorked | CompanyAnalysisWorked | SpreadsheetWorked;

/** One line of a journal entry or a voucher: an account and its debit or its credit, in rupees. */
export interface JournalLine {
  account: string;
  dr?: number;
  cr?: number;
}

/** A journal entry. `date` is an ISO day ("2025-04-01"). */
export interface JournalEntry {
  date: string;
  lines: JournalLine[];
  narration: string;
}

/**
 * A line of a statement. `account` names the ledger account (or accounts, added) whose balance it is, so the figures
 * can be checked against the books; `parts` are the figures it is worked from ("Sales 3,00,000 less Returns 5,000"),
 * each added or, with `less`, taken away.
 */
export interface StatementLine {
  label: string;
  amount: number;
  accounts?: string[];
  parts?: { label: string; amount: number; less?: boolean; accounts?: string[] }[];
}

export interface TwoSided {
  debit: StatementLine[];
  credit: StatementLine[];
}

/** A pie chart or a bar diagram: what each part is, in rupees. The parts are listed largest first. */
export interface Chart {
  title: string;
  kind: 'pie' | 'bar';
  parts: { label: string; amount: number }[];
  /** What the chart shows, in a sentence: a student writes one under every chart. */
  reading: string;
}

/** The comprehensive project of a sole proprietor: a month of books from the journal to the balance sheet. */
export interface SoleProprietorWorked {
  kind: 'sole-proprietor';
  business: Business;
  conventions: string[];
  journal: JournalEntry[];
  /** The ledger balances on the last day, before the adjustments. */
  trialBalance: { account: string; debit?: number; credit?: number }[];
  /** What is known at the end of the period and is brought in only in the final accounts. */
  adjustments: string[];
  closingStock: number;
  /** Depreciation for the period, by asset account. */
  depreciation: { account: string; amount: number; working: string }[];
  trading: TwoSided;
  profitAndLoss: TwoSided;
  balanceSheet: { liabilities: StatementLine[]; assets: StatementLine[] };
  charts: Chart[];
  /** The figures an examiner looks for first. */
  keyFigures: { grossProfit: number; netProfit: number; balanceSheetTotal: number };
}

/** One row of the bank column of a cash book, or of a pass book. `ref` ties a row to its row in the other book. */
export interface BankRow {
  date: string;
  particulars: string;
  /** The same transaction in both books has the same ref; 'opening' is the balance brought down. */
  ref: string;
  chequeNo?: string;
  /** Cash book: the debit (receipts, money into the bank). Pass book: the deposits (credits). */
  deposit?: number;
  /** Cash book: the credit (payments). Pass book: the withdrawals (debits). */
  withdrawal?: number;
}

/** An item of a bank reconciliation statement: what it is, how much, and the ref(s) of the rows it comes from. */
export interface BrsItem {
  label: string;
  amount: number;
  refs: string[];
}

/** A balance and which side it is on: 'Dr' (in the bank's favour of the business: money at the bank) or 'Cr'. */
export interface BankBalance {
  label: string;
  amount: number;
  /** Cash book: 'Dr' is a favourable balance. Pass book: 'Cr' is a favourable balance. */
  side: 'Dr' | 'Cr';
}

/** The bank reconciliation project: a month's cash book (bank column) and pass book, and the statement. */
export interface BankReconciliationWorked {
  kind: 'bank-reconciliation';
  business: Business;
  conventions: string[];
  /** The rows of each book in date order; the first is the opening balance (ref 'opening'). */
  cashBook: BankRow[];
  passBook: BankRow[];
  /** Starting from the cash book balance. */
  statement: { asAt: string; start: BankBalance; add: BrsItem[]; less: BrsItem[]; result: BankBalance };
  /** The second method: the cash book amended for the items the business has not recorded, then the statement. */
  amended: { add: BrsItem[]; less: BrsItem[]; balance: BankBalance; add2: BrsItem[]; less2: BrsItem[]; result: BankBalance };
}

/** A source document: what it is, who issues it, and what it proves. */
export interface SourceDocument {
  name: string;
  issuedBy: string;
  what: string;
}

/**
 * A voucher. `type`: 'debit' (cash paid: Cash is credited), 'credit' (cash received: Cash is debited), 'transfer' (no
 * cash), 'journal' (several debits and several credits). Its form (simple, compound, complex) follows from its lines.
 */
export interface Voucher {
  no: string;
  type: 'debit' | 'credit' | 'transfer' | 'journal';
  date: string;
  transaction: string;
  /** The source document behind it. */
  source: string;
  lines: JournalLine[];
  narration: string;
}

/** The source-documents project: the documents collected, the vouchers made from them, and the books written up. */
export interface VouchersWorked {
  kind: 'vouchers';
  business: Business;
  conventions: string[];
  documents: SourceDocument[];
  vouchers: Voucher[];
}

/** One line of a company's statement, for two years: this year (`cy`) and last year (`py`). */
export interface TwoYearLine {
  id: string;
  label: string;
  cy: number;
  py: number;
}

/** A line of a comparative statement: the two years, the change and the change in per cent (two decimals). */
export interface ComparativeLine {
  label: string;
  cy: number;
  py: number;
  change: number;
  percent: number;
  strong?: boolean;
}

/** A line of a common size statement: the two years and each as a per cent of the base (two decimals). */
export interface CommonSizeLine {
  label: string;
  cy: number;
  py: number;
  cyPercent: number;
  pyPercent: number;
  strong?: boolean;
}

/** A ratio worked for both years. */
export interface RatioWorked {
  id: RatioId;
  name: string;
  group: 'Liquidity' | 'Solvency' | 'Activity' | 'Profitability';
  formula: string;
  /** 'ratio' is shown as "2.25 : 1", 'times' as "7.5 times", 'percent' as "46%"; all to two decimals. */
  unit: 'ratio' | 'times' | 'percent';
  cy: number;
  py: number;
  working: { cy: string; py: string };
  reading: string;
}

export type RatioId =
  | 'current'
  | 'quick'
  | 'debt-equity'
  | 'total-assets-to-debt'
  | 'proprietary'
  | 'interest-coverage'
  | 'inventory-turnover'
  | 'receivables-turnover'
  | 'working-capital-turnover'
  | 'gross-profit'
  | 'operating'
  | 'operating-profit'
  | 'net-profit'
  | 'return-on-investment';

/** The financial statement analysis of a company: its statements for two years and two aspects worked. */
export interface CompanyAnalysisWorked {
  kind: 'company-analysis';
  company: { name: string; about: string; years: [string, string]; unit: string };
  conventions: string[];
  /** The balance sheet lines by id (see figures.ts for the ids the checks read). */
  balanceSheet: { equityAndLiabilities: { head: string; lines: TwoYearLine[] }[]; assets: { head: string; lines: TwoYearLine[] }[] };
  profitAndLoss: { income: TwoYearLine[]; expenses: TwoYearLine[]; tax: TwoYearLine };
  /** Figures from the notes and the year before, which some ratios need. */
  notes: TwoYearLine[];
  comparative: { title: string; lines: ComparativeLine[]; reading: string[] };
  commonSize: { title: string; base: string; lines: CommonSizeLine[]; reading: string[] };
  ratios: RatioWorked[];
  conclusion: string[];
}

/** A sheet of a spreadsheet: what it is for, and the formulas that make it (its rows are the data beside it). */
export interface Sheet {
  title: string;
  purpose: string;
  formulas: { cell: string; formula: string; meaning: string }[];
}

/** The practical file of the Computerised Accounting option: the sheets and the work in an accounting package. */
export interface SpreadsheetWorked {
  kind: 'spreadsheet';
  business: Business;
  conventions: string[];
  /** A payroll: basic pay, allowances, deductions and net pay, for each employee. */
  payroll: { name: string; basic: number; daPercent: number; hraPercent: number; pfPercent: number; da: number; hra: number; gross: number; pf: number; net: number }[];
  /** A depreciation schedule by the straight line method. */
  depreciation: { cost: number; scrap: number; life: number; rows: { year: number; opening: number; charge: number; closing: number }[] };
  sheets: Sheet[];
  /** The steps in an accounting package, in order. */
  packageSteps: string[];
}

// ---------------------------------------------------------------------------------------------------------------
// The viva bank.
// ---------------------------------------------------------------------------------------------------------------

/** The topic of a viva question about the project itself, not a topic of the course. */
export const PROJECT_TOPIC = 'project';

/**
 * One question an examiner may ask at the viva voce, with a short model answer.
 *
 * - `id`: 'v11-001' (Class 11) or 'v12-001' (Class 12), unique; its place on the page is `/practical#viva-<id>`.
 * - `question`: ends with a question mark.
 * - `answer`: one to three sentences, each ending with a full stop, as a student would say it.
 * - `topicId`: the topic of the course it belongs to, or 'project' for a question about the project work itself.
 * - `options`: the ids of the project options it suits (at least one).
 * - `difficulty`: 'easy', 'medium' or 'complex' (shown as hard).
 */
export interface VivaQuestion {
  id: string;
  question: string;
  answer: string;
  topicId: string;
  options: string[];
  difficulty: Difficulty;
}
