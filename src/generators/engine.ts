import type {
  AccountQuestion,
  AccountSide,
  ColumnKind,
  FormatRow,
  JournalQuestion,
  JournalSetQuestion,
  McqQuestion,
  NumericQuestion,
  Question,
  RatioQuestion,
  StatementLine,
  StatementQuestion,
} from '@/content/types';
import { accountGroupOf } from '@/content/courses';
import { CORE_ACCOUNTS, fillerAccounts, resolveAccount } from '@/engine/accounts';
import { explainEntry } from '@/engine/explain';
import {
  MAX_ACCOUNT_PERIODS,
  MAX_FORMAT_COLUMNS,
  MAX_FORMAT_ROWS,
  MAX_PERIODS_ROWS,
  MAX_STATEMENT_COLUMNS,
  MIN_FORMAT_ROWS,
  RUPEE_COLUMN,
  acceptedLabels,
  columnTotals,
  figureProblem,
  givenProblem,
  isPlainColumn,
  kindOf,
  offeredLabels,
  rowsProblem,
} from '@/engine/formats';
import { isBalanced, toJournal, type JournalLine } from '@/engine/journal';
import { isRatio, numericKey } from '@/exercises/numeric';
import { createRng } from '@/engine/rng';
import { casePartId, genId, isValidSeed, parseCasePartId, parseGenId } from './ids';
import {
  isFormatKind,
  isLongKind,
  type AccountParts,
  type AccountSideParts,
  type AccountTemplate,
  type AnyParts,
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
  type StatementColumnParts,
  type StatementLineParts,
  type StatementParts,
  type StatementTemplate,
  type Template,
} from './types';

const DISTRACTOR_COUNT = 6;
const MCQ_DISTRACTORS = 3;
const MIN_COMMON_ERRORS = 2;
/** How many times a template may reject a seed (or fail a check) before generation for that seed fails. */
export const MAX_ATTEMPTS = 40;
const RETRY_SALT = 0x9e3779b1;
// Separate streams, so adding a distractor or an option never changes the scenario a seed draws.
const JOURNAL_DISTRACTOR_SALT = 0x9e3779b9;
const MCQ_OPTION_SALT = 0x2545f491;

export const DEFAULT_JOURNAL_HINTS = [
  'Which accounts are affected, and what type is each one?',
  'Assets and expenses increase on the debit side. Liabilities, capital and incomes increase on the credit side.',
];
export const DEFAULT_SET_HINTS = [
  'Take the transactions one at a time. For each one: which accounts change, and what type is each?',
  DEFAULT_JOURNAL_HINTS[1],
];
export const DEFAULT_ACCOUNT_HINTS = [
  'Take the items one at a time. Does the item belong in this account at all? If it does, on which side?',
  'Total both sides. The difference goes on the shorter side as the closing row, and then both sides show the same total.',
];
export const DEFAULT_STATEMENT_HINTS = [
  'Take the items one at a time and decide the column of each before you add anything.',
  'Enter each item once, in its own column, then compare the totals.',
];
const DEFAULT_MCQ_HINTS = [
  'Work out the answer yourself before you look at the options.',
  'Each wrong option is a common slip. Which idea is it mixing up?',
];
const DEFAULT_NUMERIC_HINTS = [
  'Write down what is given and what is asked.',
  'Work through the steps one at a time, then check the amount.',
];

// The ids of generated questions are read and written in ./ids, which the screens that only list things can import
// without the rest of this file.
export { casePartId, genId, isValidSeed, parseCasePartId, parseGenId };

/**
 * The outcome of building one instance from one seed. `rejected` is the template declining the seed, which is
 * normal. `invalid` is an instance the engine refused (the reason says why): the template drew values it should
 * have rejected itself, so the harness fails on it, while at runtime the engine just moves on to the next seed.
 */
export type Built = { question: Question } | { rejected: true } | { invalid: string };

const BAD_TEXT = /\b(?:NaN|undefined|Infinity|null)\b|\[object/;
const isBlank = (s: unknown) => typeof s !== 'string' || s.trim() === '';

/** A text that is missing is a mistake in the template, not in the seed: it throws, naming the template and seed. */
function need(t: Template, seed: number, what: string, value: unknown): void {
  if (isBlank(value)) throw new Error(`${t.id} seed ${seed}: ${what} is empty`);
}

/** Why direct lines cannot be an entry, or null when they can. */
function badLines(lines: JournalLine[], extraAccounts: string[]): string | null {
  if (!isBalanced(lines)) return 'the lines do not balance';
  for (const l of lines) {
    if (!Number.isSafeInteger(l.amount) || l.amount <= 0) return `line for ${l.accountId} has amount ${l.amount}, not a positive integer`;
  }
  for (const id of [...lines.map((l) => l.accountId), ...extraAccounts]) {
    try {
      resolveAccount(id);
    } catch {
      return `unknown account ${id}`;
    }
  }
  return null;
}

/** The case text of a question that belongs to a case study; nothing for any other question. */
const contextOf = (parts: { context?: string }) => (parts.context ? { context: parts.context } : {});

function journalQuestion(t: JournalTemplate, seed: number, parts: JournalParts): JournalQuestion | string {
  const direct = parts.lines !== undefined;
  let expected: JournalLine[];
  let explanation: string;
  if (direct) {
    if (parts.tx !== undefined) throw new Error(`${t.id} seed ${seed}: give either tx or lines, not both`);
    if (!parts.explanation?.length) throw new Error(`${t.id} seed ${seed}: lines need an explanation, one step per line`);
    for (const line of parts.explanation) need(t, seed, 'a line of the explanation', line);
    const bad = badLines(parts.lines, parts.distractorAccounts ?? []);
    if (bad) return bad;
    expected = parts.lines;
    explanation = parts.explanation.join(' ');
  } else {
    expected = toJournal(parts.tx);
    if (!isBalanced(expected)) throw new Error(`Unbalanced entry from ${t.id} seed ${seed}`);
    explanation = explainEntry(expected).join(' ');
  }

  const expectedIds = expected.map((l) => l.accountId);
  const rng = createRng(seed ^ JOURNAL_DISTRACTOR_SALT);
  let choices: string[];
  if (!direct) {
    // Transactions keep the original pool and count, so the questions of existing seeds do not change.
    const others = CORE_ACCOUNTS.map((a) => a.id).filter((id) => !expectedIds.includes(id));
    choices = [...expectedIds, ...rng.shuffle(others).slice(0, DISTRACTOR_COUNT)];
  } else {
    // The author's distractors, then cash and bank when neither the entry nor those include them, then others of
    // the chart the topic uses: a Class 11 entry is never offered an account of Class 12.
    const taken = new Set(expectedIds);
    const extras: string[] = [];
    for (const id of [...(parts.distractorAccounts ?? []), 'cash', 'bank']) if (!taken.has(id) && taken.add(id)) extras.push(id);
    const others = fillerAccounts(accountGroupOf(t.topicId)).map((a) => a.id).filter((id) => !taken.has(id));
    choices = [...expectedIds, ...extras, ...rng.shuffle(others).slice(0, Math.max(0, DISTRACTOR_COUNT - extras.length))];
  }
  return {
    id: genId(t, seed),
    type: 'journal_entry',
    topicId: t.topicId,
    conceptId: t.conceptId,
    difficulty: t.difficulty,
    ...contextOf(parts),
    prompt: parts.prompt,
    hints: parts.hints ?? DEFAULT_JOURNAL_HINTS,
    explanation,
    expected,
    accountChoices: [...new Set(choices)].sort(),
  };
}

// ---------------------------------------------------------------------------------------------------------------
// Sets of journal entries: several dated transactions of one business, one entry for each.
// ---------------------------------------------------------------------------------------------------------------

/** A set has at least this many transactions and at most `MAX_SET_ENTRIES`. */
export const MIN_SET_ENTRIES = 3;
export const MAX_SET_ENTRIES = 8;
/**
 * How many transactions a set of each difficulty has. A mock paper gives an easy set 3 marks, a medium one 4 and a
 * complex one 6 (see `MARK_SOURCES`), so the length of a set follows from its difficulty.
 */
export const SET_ENTRIES: Record<JournalSetTemplate['difficulty'], readonly [number, number]> = {
  easy: [3, 4],
  medium: [4, 5],
  complex: [6, 8],
};
/** The first line of a set's prompt unless the set gives a `task` of its own; the opening line of the set follows it. */
export const SET_TASK = 'Journalise the following transactions.';

const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

/**
 * Where a date of a set ("5 April", "28 January 2026") stands in time, as a number that grows with the date, or null
 * when it is not written that way. A date without a year is taken to be in the same year as the others.
 */
export function setDateOrder(date: string): number | null {
  const m = /^([1-9]|[12]\d|3[01]) ([A-Z][a-z]+)(?: (\d{4}))?$/.exec(date);
  const month = m ? MONTH_NAMES.indexOf(m[2]) : -1;
  return m && month >= 0 ? (Number(m[3] ?? 0) * 12 + month) * 31 + Number(m[1]) : null;
}

function journalSetQuestion(t: JournalSetTemplate, seed: number, parts: Omit<JournalSetParts, 'opening'> & { opening?: string }): JournalSetQuestion | string {
  const count = parts.transactions.length;
  if (count < MIN_SET_ENTRIES || count > MAX_SET_ENTRIES) return `${count} transactions, not ${MIN_SET_ENTRIES} to ${MAX_SET_ENTRIES}`;
  if (parts.task !== undefined) need(t, seed, 'the task', parts.task);
  let before = -Infinity;
  const texts = new Set<string>();
  for (const [i, tx] of parts.transactions.entries()) {
    const at = `transaction ${i + 1}`;
    if (tx.date !== undefined && tx.label !== undefined) throw new Error(`${t.id} seed ${seed}: ${at} has a date and a label; give one of them`);
    need(t, seed, `the ${tx.label !== undefined ? 'label' : 'date'} of ${at}`, tx.label ?? tx.date);
    need(t, seed, `the text of ${at}`, tx.text);
    if (!tx.explanation?.length) throw new Error(`${t.id} seed ${seed}: ${at} needs an explanation, one step per line`);
    for (const line of tx.explanation) need(t, seed, `a line of the explanation of ${at}`, line);
    // Only real dates are read as dates and kept in order; an item with a label stands where its author put it.
    if (tx.date !== undefined) {
      const order = setDateOrder(tx.date);
      if (order === null) return `${at}: "${tx.date}" is not a date like "5 April"`;
      if (order < before) return `${at}: ${tx.date} comes before the transaction above it`;
      before = order;
    }
    if (texts.has(tx.text)) return `${at} repeats the text of another transaction`;
    texts.add(tx.text);
    // The author's distractors are checked once, with the first entry.
    const bad = badLines(tx.lines, i === 0 ? (parts.distractorAccounts ?? []) : []);
    if (bad) return `${at}: ${bad}`;
  }

  // One list of choices for the whole set, built as for a single direct entry: the accounts of every entry, the
  // author's distractors, cash and bank, then others.
  const expectedIds = [...new Set(parts.transactions.flatMap((tx) => tx.lines.map((l) => l.accountId)))];
  const taken = new Set(expectedIds);
  const extras: string[] = [];
  for (const id of [...(parts.distractorAccounts ?? []), 'cash', 'bank']) if (!taken.has(id) && taken.add(id)) extras.push(id);
  const others = fillerAccounts(accountGroupOf(t.topicId)).map((a) => a.id).filter((id) => !taken.has(id));
  const rng = createRng(seed ^ JOURNAL_DISTRACTOR_SALT);
  const choices = [...expectedIds, ...extras, ...rng.shuffle(others).slice(0, Math.max(0, DISTRACTOR_COUNT - extras.length))];
  // The picker shows a party by name alone, so one name on both sides would be two choices that look the same.
  const names = choices.map((id) => resolveAccount(id).name);
  const twice = names.find((name, i) => names.indexOf(name) !== i);
  if (twice) return `${twice} is the name of two accounts of the set`;

  const entries = parts.transactions.map((tx) =>
    tx.date !== undefined
      ? { date: tx.date, text: tx.text, expected: tx.lines, explanation: tx.explanation }
      : { label: tx.label, text: tx.text, expected: tx.lines, explanation: tx.explanation },
  );
  return {
    id: genId(t, seed),
    type: 'journal_set',
    topicId: t.topicId,
    conceptId: t.conceptId,
    difficulty: t.difficulty,
    ...contextOf(parts),
    // A set of a case may leave the opening line out: the case text has the business and its conventions.
    prompt: parts.opening === undefined ? (parts.task ?? SET_TASK) : `${parts.task ?? SET_TASK}\n${parts.opening}`,
    hints: parts.hints ?? DEFAULT_SET_HINTS,
    explanation: entries.map((e) => `${e.date ?? e.label}: ${e.explanation.join(' ')}`).join('\n'),
    entries,
    accountChoices: choices.sort(),
  };
}

// ---------------------------------------------------------------------------------------------------------------
// Formats: a two-sided account and a statement, which the student prepares row by row.
// ---------------------------------------------------------------------------------------------------------------

/** The one amount column of a format that names none. */
export const DEFAULT_FORMAT_COLUMN = 'Amount (₹)';
export const DEFAULT_STATEMENT_HEADING = 'Particulars';
/** A format offers at least this many labels that none of its rows uses. */
export const MIN_FORMAT_DISTRACTORS = 2;

/** The amount columns a format names (`most` at most), or why they cannot be its columns. */
function formatColumns(parts: { columns?: (string | StatementColumnParts)[] }, most: number): string[] | string {
  const columns = (parts.columns ?? [DEFAULT_FORMAT_COLUMN]).map((c) => (typeof c === 'string' ? c : c.name));
  if (columns.length < 1 || columns.length > most) return `${columns.length} amount columns, not 1 to ${most}`;
  if (columns.some(isBlank)) return 'an amount column has no name';
  return new Set(columns).size === columns.length ? columns : 'two amount columns have the same name';
}

/** A row as its author wrote it, with one amount for every column. A row that gives none keeps none, and is refused. */
function formatRow(row: FormatRowParts, columns: number): FormatRow {
  const amounts = row.amounts !== undefined ? row.amounts.map((a) => a ?? 0) : row.amount !== undefined && columns === 1 ? [row.amount] : [];
  return {
    ...(row.date === undefined ? {} : { date: row.date }),
    label: row.label,
    amounts,
    ...(row.details?.length ? { details: row.details } : {}),
    ...(row.closing ? { closing: true as const } : {}),
    ...(row.contra ? { contra: true as const } : {}),
    ...(row.ref === undefined ? {} : { ref: row.ref }),
    ...(row.also?.length ? { also: row.also } : {}),
    ...(row.note === undefined ? {} : { note: row.note }),
    // Only a row that is worked out says so: a row prints its figure in a given column by default.
    ...(row.given === false ? { given: false as const } : {}),
  };
}

/**
 * The kind of every column of a statement, from what it declares: a name alone is a plain rupee column, and a percent
 * does not add up unless it says so. Undefined when every column is a plain rupee column that adds up, which is what
 * every statement was before columns had kinds: such a statement is built exactly as it was.
 */
function columnKinds(columns: readonly (string | StatementColumnParts)[] | undefined): ColumnKind[] | undefined {
  const kinds = (columns ?? []).map((c): ColumnKind => {
    if (typeof c === 'string') return RUPEE_COLUMN;
    const unit = c.unit ?? 'rupees';
    return { unit, ...(c.signed ? { signed: true as const } : {}), adds: c.adds ?? unit !== 'percent' };
  });
  return kinds.every((k) => isPlainColumn(k) && k.adds) ? undefined : kinds;
}

/**
 * Of every column of a statement, whether its figures are given (printed, not typed). Undefined when no column is,
 * which is what every statement was before a column could be given.
 */
function givenColumns(columns: readonly (string | StatementColumnParts)[] | undefined): boolean[] | undefined {
  const given = (columns ?? []).map((c) => typeof c !== 'string' && c.given === true);
  return given.some(Boolean) ? given : undefined;
}

const isLine = (row: FormatRowParts | StatementLineParts): row is StatementLineParts => 'heading' in row || 'subtotal' in row;

/**
 * What every format shares, checked: the texts it must have, how many rows it has and the labels it offers (those of
 * its rows, their other wordings and the distractors). A string says why it is refused.
 */
function formatBase(t: AccountTemplate | StatementTemplate, seed: number, parts: Omit<AccountParts, 'columns'> | Omit<StatementParts, 'columns' | 'rows'>, rows: FormatRow[]) {
  need(t, seed, 'the data', parts.data);
  need(t, seed, 'the title', parts.title);
  if (!parts.explanation?.length) throw new Error(`${t.id} seed ${seed}: a format needs an explanation, one step per line`);
  for (const line of parts.explanation) need(t, seed, 'a line of the explanation', line);
  for (const label of parts.distractors) need(t, seed, 'a distractor label', label);
  // A label a row is also right under is no wrong label: two that no row accepts are still needed.
  const used = new Set(rows.flatMap(acceptedLabels));
  const spare = new Set(parts.distractors.filter((d) => !used.has(d)));
  if (spare.size < MIN_FORMAT_DISTRACTORS) return `only ${spare.size} labels on offer that no row uses`;
  if (rows.length < MIN_FORMAT_ROWS || rows.length > MAX_FORMAT_ROWS) return `${rows.length} rows, not ${MIN_FORMAT_ROWS} to ${MAX_FORMAT_ROWS}`;
  return {
    id: genId(t, seed),
    topicId: t.topicId,
    conceptId: t.conceptId,
    difficulty: t.difficulty,
    ...contextOf(parts),
    prompt: parts.task,
    explanation: parts.explanation.join(' '),
    data: parts.data,
    title: parts.title,
    labels: offeredLabels(rows, parts.distractors),
    working: parts.explanation,
  };
}

function accountQuestion(t: AccountTemplate, seed: number, parts: AccountParts): AccountQuestion | string {
  const columns = formatColumns(parts, MAX_FORMAT_COLUMNS);
  if (typeof columns === 'string') return columns;
  // An account is entered side by side and every figure of it is the student's: no column of it is given.
  if (givenColumns(parts.columns)) return 'an account gives no column: only a statement prints figures';
  const spoken = [parts.left, parts.right].flatMap((s) => [...s.rows, ...(s.below ?? [])]).concat((parts.later ?? []).flatMap((p) => [...p.left, ...p.right])).find((r) => r.given !== undefined);
  if (spoken) return `"${spoken.label}" speaks of given figures: only a row of a statement does`;
  const side = (s: AccountSideParts, which: string): AccountSide => {
    need(t, seed, `the title of the ${which} side`, s.title);
    if (s.prefix !== undefined) need(t, seed, `the prefix of the ${which} side`, s.prefix);
    return {
      title: s.title,
      ...(s.prefix === undefined ? {} : { prefix: s.prefix }),
      rows: s.rows.map((r) => formatRow(r, columns.length)),
      below: (s.below ?? []).map((r) => formatRow(r, columns.length)),
    };
  };
  const sides: [AccountSide, AccountSide] = [side(parts.left, 'left'), side(parts.right, 'right')];
  if (sides[0].title === sides[1].title) return 'the two sides have the same title';
  // An account kept over several periods: the first period is the rows of the two sides, the others follow.
  const later = (parts.later ?? []).map((p): [FormatRow[], FormatRow[]] => [p.left.map((r) => formatRow(r, columns.length)), p.right.map((r) => formatRow(r, columns.length))]);
  const periods: [FormatRow[], FormatRow[]][] = [[sides[0].rows, sides[1].rows], ...later];
  const titles = periods.map((_, i) => (i === 0 ? parts.periodTitle : parts.later![i - 1].title) ?? `Period ${i + 1}`);
  const several = later.length > 0;
  if (periods.length > MAX_ACCOUNT_PERIODS) return `${periods.length} periods, not ${MAX_ACCOUNT_PERIODS} at most`;
  if (several) for (const title of titles) need(t, seed, 'the title of a period', title);
  if (new Set(titles).size !== titles.length) return 'two periods have the same title';
  const all = [...periods.flat(2), ...sides.flatMap((s) => s.below)];
  if (several && all.length > MAX_PERIODS_ROWS) return `${all.length} rows over ${periods.length} periods, not ${MAX_PERIODS_ROWS} at most`;
  const base = formatBase(t, seed, parts, all);
  if (typeof base === 'string') return base;
  for (const [i, rows] of periods.entries()) {
    const where = several ? `${titles[i]}, ` : '';
    for (const [s, list] of rows.entries()) {
      if (list.length === 0) return `${where}the ${sides[s].title} side has no rows`;
      // The rows of a side are matched as a collection, period by period: each list on its own.
      const bad = rowsProblem(list, columns.length, base.labels);
      if (bad) return `${where}${sides[s].title} side: ${bad}`;
    }
    const [left, right] = rows.map((list) => columnTotals(list, columns.length));
    const off = columns.findIndex((_, c) => left[c] !== right[c]);
    if (off >= 0) return `${where}the two sides do not agree${columns.length > 1 ? ` in the column ${columns[off]}` : ''}: ${left[off]} against ${right[off]}`;
  }
  for (const s of sides) {
    // So are the rows below the totals of each side.
    const bad = rowsProblem(s.below, columns.length, base.labels);
    if (bad) return `${s.title} side: ${bad}`;
  }
  return {
    ...base,
    type: 'account',
    hints: parts.hints ?? DEFAULT_ACCOUNT_HINTS,
    columns,
    sides,
    ...(several ? { later, periodTitles: titles } : {}),
    ...(parts.broughtDown ? { continued: true as const } : {}),
  };
}

function statementQuestion(t: StatementTemplate, seed: number, parts: StatementParts): StatementQuestion | string {
  const columns = formatColumns(parts, MAX_STATEMENT_COLUMNS);
  if (typeof columns === 'string') return columns;
  if (parts.heading !== undefined) need(t, seed, 'the heading of the particulars', parts.heading);
  if (parts.noteHeading !== undefined) need(t, seed, 'the heading of the note numbers', parts.noteHeading);
  if (parts.final) need(t, seed, 'the label of the final figure', parts.final.label);
  const n = columns.length;
  const kinds = columnKinds(parts.columns);
  const given = givenColumns(parts.columns);
  // The rows the student enters, and between them the sub-headings and sub-totals, each above the row it stands before.
  const rows: FormatRow[] = [];
  const lines: StatementLine[] = [];
  for (const row of parts.rows) {
    // A line may say whether it is given only where a column is: otherwise its author forgot to say which.
    if (!given && 'given' in row && row.given !== undefined) {
      return `${'subtotal' in row ? `the sub-total "${row.subtotal}" is said to be ${row.given ? 'given' : 'typed'}` : `"${row.label}" says its figures are ${row.given ? 'given' : 'not given'}`}, and the statement gives no column`;
    }
    if (!isLine(row)) rows.push(formatRow(row, n));
    else if ('heading' in row) {
      need(t, seed, 'a sub-heading', row.heading);
      lines.push({ at: rows.length, heading: row.heading });
    } else {
      need(t, seed, 'the name of a sub-total', row.subtotal);
      const amounts = row.amounts !== undefined ? row.amounts.map((a) => a ?? 0) : row.amount !== undefined && n === 1 ? [row.amount] : [];
      if (amounts.length !== n) return `the sub-total "${row.subtotal}" has ${amounts.length} figures for ${n} amount columns`;
      for (const [c, a] of amounts.entries()) {
        const wrong = figureProblem(a, kindOf(kinds, c));
        if (wrong) return `the sub-total "${row.subtotal}" has a figure ${a} that ${wrong}`;
      }
      if (amounts.every((a) => a === 0)) return `the sub-total "${row.subtotal}" has no figure`;
      // What it says it adds up, in every column that adds up: the rows above it back to the last sub-heading, to
      // the last sub-total, or to the top.
      if (row.sum) {
        const stop = (line: StatementLine) => (row.sum === 'section' ? 'heading' in line : 'subtotal' in line);
        const from = row.sum === 'all' ? 0 : (lines.findLast(stop)?.at ?? 0);
        const sums = columnTotals(rows.slice(from), n);
        const off = amounts.findIndex((a, c) => kindOf(kinds, c).adds && a !== sums[c]);
        if (off >= 0) return `the sub-total "${row.subtotal}" is ${amounts[off]}${n > 1 ? ` in the column ${columns[off]}` : ''}, not the ${sums[off]} its rows add up to`;
      }
      lines.push({ at: rows.length, subtotal: row.subtotal, amounts, ...(row.note === undefined ? {} : { note: row.note }), ...(row.given ? { given: true as const } : {}) });
    }
  }
  const subtotals = lines.some((line) => 'subtotal' in line);
  // The figures the statement prints: the same under one name wherever it stands, and not all there is.
  const ungiven = givenProblem(given, n, rows, lines.flatMap((line) => ('subtotal' in line ? [line] : [])));
  if (ungiven) return ungiven;
  if (rows.some((r) => r.note !== undefined) && parts.noteHeading === undefined) return 'a row has a note number, and the statement has no heading for the notes';
  const base = formatBase(t, seed, parts, rows);
  if (typeof base === 'string') return base;
  // The rows between two lines are entered together and matched as a collection: each such list on its own.
  const cuts = [...new Set(lines.map((line) => line.at).filter((at) => at > 0 && at < rows.length))];
  for (const [k, from] of [0, ...cuts].entries()) {
    const bad = rowsProblem(rows.slice(from, cuts[k] ?? rows.length), n, base.labels, kinds);
    if (bad) return bad;
  }
  const totals = columnTotals(rows, n);
  if (parts.totalsAgree) {
    if (n !== 2) return 'only a statement with two amount columns can have totals that agree';
    if (kinds || subtotals) return 'only a statement of two plain rupee columns, with no sub-total, can have totals that agree';
    if (parts.final) return 'a statement whose totals agree ends on no final figure';
    if (totals[0] !== totals[1]) return `the two columns do not agree: ${totals[0]} against ${totals[1]}`;
  }
  if (parts.final) {
    const { amount } = parts.final;
    // The figure a statement ends on is in the unit of its first column, and negative only where that column may be.
    const first = kindOf(kinds, 0);
    if (isPlainColumn(first)) {
      if (!Number.isSafeInteger(amount) || amount <= 0 || amount % 100 !== 0) return `the final figure ${amount} is not a positive whole number of rupees`;
    } else if (amount === 0 || figureProblem(amount, first)) return `the final figure ${amount} ${figureProblem(amount, first) ?? 'is nil'}`;
    // With two columns the statement ends on what one column leaves of the other.
    if (n === 2 && !kinds && !subtotals && amount !== Math.abs(totals[0] - totals[1])) return `the final figure ${amount} is not the difference of the two columns`;
    for (const label of parts.final.alternatives ?? []) need(t, seed, 'an alternative label of the final figure', label);
    if (parts.final.alternatives && !parts.final.alternatives.some((label) => label !== parts.final!.label)) return 'the final figure has no alternative label that differs from its own';
  }
  // Where the student must also say what the statement ends on: the right label among the alternatives, sorted.
  const options = parts.final?.alternatives ? offeredLabels([{ label: parts.final.label }], parts.final.alternatives) : undefined;
  return {
    ...base,
    type: 'statement',
    hints: parts.hints ?? DEFAULT_STATEMENT_HINTS,
    columns,
    heading: parts.heading ?? DEFAULT_STATEMENT_HEADING,
    rows,
    ...(kinds ? { columnKinds: kinds } : {}),
    ...(given ? { givenColumns: given } : {}),
    ...(lines.length > 0 ? { lines } : {}),
    ...(parts.noteHeading === undefined ? {} : { noteHeading: parts.noteHeading }),
    ...(parts.totalsAgree ? { totalsAgree: true as const } : {}),
    ...(parts.final ? { final: { label: parts.final.label, amount: parts.final.amount, ...(options ? { options } : {}) } } : {}),
  };
}

function mcqQuestion(t: McqTemplate, seed: number, parts: McqParts): McqQuestion | string {
  need(t, seed, 'the correct option', parts.correct);
  need(t, seed, 'the explanation', parts.explanation);
  for (const d of parts.distractors) {
    need(t, seed, 'a distractor text', d.text);
    need(t, seed, `the "why" of distractor "${d.text}"`, d.why);
  }
  // Which options remain can depend on the numbers drawn, so a repeat or a copy of the answer is dropped here.
  const seen = new Set([parts.correct]);
  const wrong = parts.distractors.filter((d) => !seen.has(d.text) && seen.add(d.text));
  if (wrong.length < MCQ_DISTRACTORS) return `only ${wrong.length} distinct distractors`;

  const rng = createRng(seed ^ MCQ_OPTION_SALT);
  const chosen = rng.shuffle(wrong).slice(0, MCQ_DISTRACTORS);
  const shuffled = rng.shuffle([{ text: parts.correct, why: undefined as string | undefined }, ...chosen]);
  const { optionOrder } = parts;
  if (optionOrder) shuffled.sort((x, y) => optionOrder.indexOf(x.text) - optionOrder.indexOf(y.text));
  const options = shuffled.map((o, i) => ({ id: 'abcdefgh'[i], text: o.text, ...(o.why === undefined ? {} : { why: o.why }) }));
  return {
    id: genId(t, seed),
    type: 'mcq',
    topicId: t.topicId,
    conceptId: t.conceptId,
    difficulty: t.difficulty,
    ...contextOf(parts),
    prompt: parts.prompt,
    hints: parts.hints ?? DEFAULT_MCQ_HINTS,
    explanation: parts.explanation,
    options,
    correct: options.find((o) => o.text === parts.correct)!.id,
  };
}

function numericQuestion(t: NumericTemplate | RatioTemplate, seed: number, parts: NumericParts | RatioParts): NumericQuestion | RatioQuestion | string {
  const ratio = t.unit === 'ratio';
  // An answer is one positive integer, or for a ratio its terms in lowest terms; a common error is the same kind of thing.
  const usable = (value: unknown): boolean => (ratio ? isRatio(value) : Number.isSafeInteger(value) && (value as number) > 0);
  if (!usable(parts.answer)) {
    return ratio ? `answer ${JSON.stringify(parts.answer)} is not a ratio of two to four whole numbers in lowest terms` : `answer ${parts.answer} is not a positive integer`;
  }
  if (!parts.explanation?.length) throw new Error(`${t.id} seed ${seed}: the explanation has no lines`);
  for (const line of parts.explanation) need(t, seed, 'a line of the explanation', line);
  for (const e of parts.commonErrors) need(t, seed, `the "why" of common error ${e.value}`, e.why);
  // As with options, a common error that equals the answer (or another error) for these numbers is dropped. A wrong
  // ratio has as many terms as the right one: the student is asked for that many numbers.
  const terms = ratio ? (parts.answer as number[]).length : 0;
  const seen = new Set([numericKey(parts.answer)]);
  const commonErrors = (parts.commonErrors as { value: number | number[]; why: string }[]).filter((e) => {
    if (!usable(e.value) || (ratio && (e.value as number[]).length !== terms)) return false;
    const key = numericKey(e.value);
    return !seen.has(key) && seen.add(key);
  });
  if (commonErrors.length < MIN_COMMON_ERRORS) return `only ${commonErrors.length} usable common errors`;
  return {
    id: genId(t, seed),
    type: 'numeric',
    topicId: t.topicId,
    conceptId: t.conceptId,
    difficulty: t.difficulty,
    ...contextOf(parts),
    prompt: parts.prompt,
    hints: parts.hints ?? DEFAULT_NUMERIC_HINTS,
    explanation: parts.explanation.join(' '),
    unit: t.unit,
    answer: parts.answer,
    commonErrors,
    working: parts.explanation,
  } as NumericQuestion | RatioQuestion;
}

/**
 * The random stream of one attempt at a seed. Attempt 0 is exactly `createRng(seed)`, so what a template made
 * before retries existed is unchanged; attempt k is a salted stream of its own.
 */
export const attemptRng = (seed: number, attempt: number) =>
  createRng(attempt === 0 ? seed : (seed >>> 0) ^ Math.imul(attempt, RETRY_SALT));

/**
 * One instance of a template for this seed and attempt (0 unless retrying). Anything that fails a check (a prompt
 * with "undefined" or "NaN" in it, a failed `verify`, too few distinct distractors) is reported, never returned.
 */
export function buildInstance(t: Template, seed: number, attempt = 0): Built {
  const parts = t.generate(attemptRng(seed, attempt), seed);
  return parts === null ? { rejected: true } : finish(t, seed, parts);
}

/** The question a template's parts make, checked: `parts` are what this template's own `generate` returns. */
function finish(t: Template, seed: number, parts: AnyParts): Built {
  let made: Question | string;
  switch (t.kind) {
    case 'journal':
      need(t, seed, 'the prompt', (parts as JournalParts).prompt);
      made = journalQuestion(t, seed, parts as JournalParts);
      break;
    case 'journal_set': {
      const set = parts as Omit<JournalSetParts, 'opening'> & { opening?: string };
      // Only a set of a case (the engine gave it the case text) may be without its opening line.
      if (set.context === undefined || set.opening !== undefined) need(t, seed, 'the prompt', set.opening);
      made = journalSetQuestion(t, seed, set);
      break;
    }
    case 'account':
      need(t, seed, 'the prompt', (parts as AccountParts).task);
      made = accountQuestion(t, seed, parts as AccountParts);
      break;
    case 'statement':
      need(t, seed, 'the prompt', (parts as StatementParts).task);
      made = statementQuestion(t, seed, parts as StatementParts);
      break;
    case 'mcq':
      need(t, seed, 'the prompt', (parts as McqParts).prompt);
      made = mcqQuestion(t, seed, parts as McqParts);
      break;
    case 'numeric':
      need(t, seed, 'the prompt', (parts as NumericParts).prompt);
      made = numericQuestion(t, seed, parts as NumericParts | RatioParts);
      break;
  }
  const verify = t.verify as ((q: Question) => boolean) | undefined;
  if (typeof made === 'string') return { invalid: made };
  if (BAD_TEXT.test(JSON.stringify(made))) return { invalid: 'the question text contains undefined, NaN or null' };
  return verify && !verify(made) ? { invalid: 'independent verification failed' } : { question: made };
}

/**
 * The question a template makes for a seed. When the template rejects the seed, or an instance fails a check, it is
 * tried again with the next random stream of the same seed, so the id always names the seed that was asked for and
 * regenerates the same question. Generation for the seed fails only when every attempt does.
 */
export function generateFrom(t: Template, seed: number): Question {
  if (!isValidSeed(seed)) throw new Error(`Invalid seed: ${seed}`);
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    const built = buildInstance(t, seed, attempt);
    if ('question' in built) return built.question;
  }
  throw new Error(`Template ${t.id} gave no valid question for seed ${seed} in ${MAX_ATTEMPTS} attempts`);
}

// ---------------------------------------------------------------------------------------------------------------
// Case studies: one scenario, several questions.
// ---------------------------------------------------------------------------------------------------------------

/** A case of short questions has this many of them. */
export const CASE_PARTS: readonly [number, number] = [4, 8];
/** A chained case, one with a set of entries or a format among its questions, has fewer: each of those is long. */
export const CHAINED_CASE_PARTS: readonly [number, number] = [2, 5];

/**
 * Why these kinds of question, in this number, cannot be the questions of one case; null when they can. A case asks
 * 4 to 8 questions, or 2 to 5 when at least one of them is long (a set of entries, an account or a statement), and
 * it asks questions of at least two kinds, except that a case may consist of formats alone: the Trading Account, the
 * Profit and Loss Account and the Balance Sheet of one trial balance are three accounts.
 */
export function casePartsProblem(kinds: readonly Template['kind'][]): string | null {
  const chained = kinds.some(isLongKind);
  const [fewest, most] = chained ? CHAINED_CASE_PARTS : CASE_PARTS;
  if (kinds.length < fewest || kinds.length > most) {
    return `${kinds.length} questions, not ${fewest} to ${most}${chained ? ' for a case with a set of entries or a format' : ''}`;
  }
  if (new Set(kinds).size < 2 && !kinds.every(isFormatKind)) return 'every question is of one kind: use at least two (only formats may stand alone)';
  return null;
}

export type BuiltCase = { questions: Question[] } | { rejected: true } | { invalid: string };

/**
 * Every question of a case for one seed and attempt. The questions share the scenario, so they stand or fall
 * together: when the set-up rejects the seed, or any one question is refused, there is no case for this attempt.
 */
export function buildCase(c: CaseTemplate, seed: number, attempt = 0): BuiltCase {
  // The scenario is set up once and every question is made from it, instead of once per question.
  const all = c.makeAll?.(attemptRng(seed, attempt));
  if (all === null) return { rejected: true };
  const questions: Question[] = [];
  for (const [i, part] of c.parts.entries()) {
    const built = all ? finish(part, seed, all[i]) : buildInstance(part, seed, attempt);
    if ('rejected' in built) return { rejected: true };
    if ('invalid' in built) return { invalid: `question ${i + 1}: ${built.invalid}` };
    questions.push(built.question);
  }
  return { questions };
}

/**
 * The questions of a case for a seed, in order. As with a single template, a rejected or refused attempt moves on
 * to the next random stream of the same seed, and every question comes from the same attempt.
 */
export function generateCase(c: CaseTemplate, seed: number): Question[] {
  if (!isValidSeed(seed)) throw new Error(`Invalid seed: ${seed}`);
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    const built = buildCase(c, seed, attempt);
    if ('questions' in built) return built.questions;
  }
  throw new Error(`Case ${c.id} gave no valid questions for seed ${seed} in ${MAX_ATTEMPTS} attempts`);
}
