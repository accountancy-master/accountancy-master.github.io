'use client';

import { Fragment } from 'react';
import type { ReactNode } from 'react';
import { DataPanel } from '@/components/ui/CasePanel';
import { KEEP_LINES } from '@/components/ui/Prompt';
import type { AccountQuestion, AccountSide, ColumnKind, FormatRow, StatementLine, StatementQuestion } from '@/content/types';
import { columnTotals, kindOf, showFigure, type RowStatus, type RowVerdict } from '@/engine/formats';
import { expectedRows, extraRowsText, formatScoreText, type FormatQuestion, type FormatVerdicts } from '@/exercises/logic';
import { ownData } from '@/play/caseStudy';
import { listName } from '@/play/formatRows';
import { columnName, totalText } from './FormatRows';
import { CheckIcon, CrossIcon } from './JournalRows';

const LABEL = 'text-sm font-extrabold uppercase tracking-wide';

// One grid for the heads, every row and the totals of a list, so that the amount columns line up. From 640 px every
// amount column has room for a figure of eleven characters and more ("12,34,56,789") on one line; where the
// particulars and the columns together are wider than the card, the table scrolls sideways inside it (see `Scroller`).
const GRID: Record<number, string> = {
  1: 'grid-cols-[minmax(0,1fr)_6.5rem] sm:grid-cols-[minmax(0,1fr)_8.5rem]',
  2: 'grid-cols-[minmax(0,1fr)_4.75rem_4.75rem] sm:grid-cols-[minmax(0,1fr)_7.75rem_7.75rem]',
  // Three or four columns: on a phone the particulars have a line to themselves, over the amounts.
  3: 'grid-cols-3 sm:grid-cols-[minmax(0,1fr)_7.75rem_7.75rem_7.75rem]',
  4: 'grid-cols-4 sm:grid-cols-[minmax(0,1fr)_7.75rem_7.75rem_7.75rem_7.75rem]',
};
// With a column of note numbers between the particulars and one or two amount columns (a balance sheet in the
// Schedule III form). With more amount columns the note stands with the particulars instead.
const GRID_NOTED: Record<number, string> = {
  1: 'grid-cols-[minmax(0,1fr)_3.25rem_6.5rem] sm:grid-cols-[minmax(0,1fr)_3.25rem_8.5rem]',
  2: 'grid-cols-[minmax(0,1fr)_2.5rem_4.75rem_4.75rem] sm:grid-cols-[minmax(0,1fr)_3rem_7.75rem_7.75rem]',
};
/** The least width (rem) the particulars keep from 640 px before the table scrolls sideways. */
const PARTICULARS_REM = 9;
/** The width (rem) of an amount column, and of a column of note numbers, from 640 px. */
const AMOUNT_REM = 7.75;
const NOTE_REM = 3;

/**
 * The frame of a table of a solution: from 640 px the table is at least as wide as its particulars and its columns
 * need, and scrolls sideways inside its card where the card is narrower, so no figure is cut or runs into the next.
 * A frame that scrolls can be scrolled from the keyboard.
 */
function Scroller({ columns, noted = false, sideBySide = false, label, children }: { columns: number; noted?: boolean; sideBySide?: boolean; label: string; children: ReactNode }) {
  const least = PARTICULARS_REM + columns * AMOUNT_REM + (noted ? NOTE_REM : 0);
  // The two sides of an account stand side by side from 768 px: each needs the room of one.
  const style = { ['--least' as string]: `${least}rem`, ['--least-md' as string]: `${sideBySide ? 2 * least : least}rem` };
  return (
    <div data-testid="solution-scroll" tabIndex={0} role="region" aria-label={label} className="overflow-x-auto rounded-control border-2 border-edge-deep bg-surface">
      <div style={style} className="sm:min-w-[var(--least)] md:min-w-[var(--least-md)]">
        {children}
      </div>
    </div>
  );
}
/** The grid of a list: with a column for the note numbers where there is one and it has room. */
const gridOf = (columns: number, noted: boolean) => (noted && columns <= 2 ? GRID_NOTED[columns] : GRID[columns]);
/** The cell of the particulars: the whole first line where the amounts stand under it. */
const first = (columns: number) => (columns > 2 ? 'col-span-full sm:col-span-1' : '');
const CELL = 'px-1.5 py-1.5 sm:px-2';
const AMOUNT = `${CELL} border-l-2 border-edge text-right font-bold tabular-nums sm:whitespace-nowrap`;
/** Four amounts to a line of a phone are set a size smaller, so that a figure of seven digits keeps to its column. */
const amountOf = (columns: number) => (columns > 3 ? `${AMOUNT} text-xs sm:text-base` : AMOUNT);

function Heads({ heading, columns, noteHeading }: { heading: string; columns: string[]; noteHeading?: string }) {
  const n = columns.length;
  const noted = noteHeading !== undefined && n <= 2;
  return (
    <div className={`grid bg-canvas font-bold text-muted ${n > 3 ? 'text-xs sm:text-sm' : 'text-sm'} ${gridOf(n, noted)}`}>
      <span className={`${CELL} ${first(n)} [overflow-wrap:anywhere]`}>{heading}</span>
      {noted ? <span className={`${CELL} border-l-2 border-edge text-center [overflow-wrap:anywhere]`}>{noteHeading}</span> : null}
      {columns.map((c) => (
        <span key={c} className={`${CELL} border-l-2 border-edge text-right [overflow-wrap:anywhere]`}>
          {c}
        </span>
      ))}
    </div>
  );
}

/**
 * A row as an examiner expects it: its date (and what it refers to in the data) over the particulars, "To" or "By",
 * "(C)" for a contra entry, then its detail lines. A negative figure stands in brackets, and a row of a statement
 * with a "Note No." column shows the number of its note.
 */
function SolutionRow({ row, prefix, columns, kinds, noteHeading }: { row: FormatRow; prefix?: string; columns: number; kinds?: readonly ColumnKind[]; noteHeading?: string }) {
  const over = [row.date, row.ref].filter(Boolean).join(' · ');
  const noted = noteHeading !== undefined && columns <= 2;
  return (
    <div data-closing={row.closing ? 'true' : undefined} className={`grid border-t-2 border-edge ${gridOf(columns, noted)}`}>
      <div className={`${CELL} ${first(columns)} min-w-0 [overflow-wrap:anywhere]`}>
        {over ? <span className="block text-xs font-bold text-muted">{over}</span> : null}
        <span className="font-semibold">
          {prefix ? `${prefix} ` : ''}
          {row.label}
          {row.contra ? ' (C)' : ''}
        </span>
        {/* With three or four amount columns there is no room for a column of notes: the note stands here. */}
        {noteHeading !== undefined && !noted && row.note ? <span className="ml-2 text-xs font-bold text-muted">Note {row.note}</span> : null}
        {row.details?.map((line, i) => (
          <span key={i} className="block pl-3 text-sm text-muted">
            {line}
          </span>
        ))}
      </div>
      {noted ? (
        <span data-testid="solution-note" className={`${CELL} border-l-2 border-edge text-center font-bold tabular-nums text-muted`}>
          {row.note ?? ''}
        </span>
      ) : null}
      {row.amounts.map((a, c) => (
        <span key={c} className={amountOf(columns)}>
          {showFigure(a, kindOf(kinds, c))}
        </span>
      ))}
    </div>
  );
}

/**
 * The totals of a list, ruled off as on paper: a line above and a double line below. A column whose figures do not
 * add up (a percentage change) has none.
 */
function Totals({ totals, columns, label = 'Total', kinds, noted = false }: { totals: number[]; columns: number; label?: string; kinds?: readonly ColumnKind[]; noted?: boolean }) {
  return (
    <div className={`grid border-y-2 border-b-4 border-double border-ink bg-canvas ${gridOf(columns, noted)}`}>
      <span className={`${CELL} ${first(columns)} text-right font-extrabold`}>{label}</span>
      {noted ? <span className={`${CELL} border-l-2 border-edge`} /> : null}
      {totals.map((t, c) => (
        <span key={c} data-testid={`solution-total-${c}`} className={`${amountOf(columns)} font-extrabold`}>
          {kindOf(kinds, c).adds ? showFigure(t, kindOf(kinds, c)) : ''}
        </span>
      ))}
    </div>
  );
}

/** One side of one period of an account: its heads (in the first period), its rows, its totals, and what stands below them. */
function SolutionSide({
  side,
  index,
  columns,
  rows,
  below,
  heads,
  testId,
  stacked,
}: {
  side: AccountSide;
  index: 0 | 1;
  columns: string[];
  rows: FormatRow[];
  below: FormatRow[];
  heads: boolean;
  testId: string;
  /** True for an account in three or four columns, whose sides stand one above the other at every width. */
  stacked: boolean;
}) {
  const n = columns.length;
  return (
    <section
      data-testid={testId}
      aria-label={`${side.title} side`}
      className={`grid border-edge-deep ${stacked ? '' : 'md:row-span-4 md:grid-rows-subgrid'} ${index === 1 ? (stacked ? 'border-t-2' : 'border-t-2 md:border-l-2 md:border-t-0') : ''}`}
    >
      <div>
        {/* A later period goes on under the totals of the one before, as on paper; on a phone, where the sides are
            stacked, each still says which side it is. */}
        <p className={`${CELL} bg-canvas text-base font-extrabold ${index === 1 && !stacked ? 'md:text-right' : ''} ${heads || stacked ? '' : 'md:hidden'}`}>{side.title}</p>
        {heads || stacked ? <Heads heading="Particulars" columns={columns} /> : null}
      </div>
      <div>
        {rows.map((row, i) => (
          <SolutionRow key={i} row={row} prefix={side.prefix} columns={n} />
        ))}
      </div>
      <Totals totals={columnTotals(rows, n)} columns={n} />
      <div>
        {below.map((row, i) => (
          <SolutionRow key={i} row={row} prefix={side.prefix} columns={n} />
        ))}
      </div>
    </section>
  );
}

/**
 * An account as an examiner expects it: its title, the two sides with their dates, "To" and "By", detail lines and
 * closing rows, the totals level with each other, and the balance brought down below them. An account kept over
 * several periods goes on under each totals line with the next period. Side by side from 768 px, as on paper; on a
 * phone the left side stands above the right one, and so it does at every width for an account in three or four
 * columns (partners' capital accounts). It never grows wider than the place it is put in.
 */
export function AccountSolution({ question }: { question: AccountQuestion }) {
  const periods: [FormatRow[], FormatRow[]][] = [[question.sides[0].rows, question.sides[1].rows], ...(question.later ?? [])];
  const stacked = question.columns.length > 2;
  return (
    <div data-testid="format-solution" className="flex min-w-0 flex-col gap-2 text-sm sm:text-base">
      <p className="text-center text-base font-extrabold [overflow-wrap:anywhere]">{question.title}</p>
      <Scroller columns={question.columns.length} sideBySide={!stacked} label={question.title}>
        {periods.map((rows, p) => (
          <div key={p} data-testid={periods.length > 1 ? `solution-period-${p}` : undefined} className={`grid ${stacked ? '' : 'md:grid-cols-2 md:grid-rows-[auto_1fr_auto_auto]'}`}>
            {([0, 1] as const).map((s) => (
              <SolutionSide
                key={s}
                side={question.sides[s]}
                index={s}
                columns={question.columns}
                rows={rows[s]}
                below={p === periods.length - 1 ? question.sides[s].below : []}
                heads={p === 0}
                testId={p === 0 ? `solution-side-${s}` : `solution-p${p}-side-${s}`}
                stacked={stacked}
              />
            ))}
          </div>
        ))}
      </Scroller>
    </div>
  );
}

/** A line of a statement that is not a row: a sub-heading over the rows that follow it, or a sub-total, ruled off above. */
function SolutionLine({ line, index, columns, kinds, noteHeading }: { line: StatementLine; index: number; columns: number; kinds?: readonly ColumnKind[]; noteHeading?: string }) {
  if ('heading' in line) {
    return (
      <p data-testid="solution-heading" className={`${CELL} border-t-2 border-edge bg-canvas font-extrabold [overflow-wrap:anywhere]`}>
        {line.heading}
      </p>
    );
  }
  const noted = noteHeading !== undefined && columns <= 2;
  return (
    <div data-testid={`solution-subtotal-${index}`} className={`grid border-t-2 border-ink bg-canvas ${gridOf(columns, noted)}`}>
      <span className={`${CELL} ${first(columns)} min-w-0 font-extrabold [overflow-wrap:anywhere]`}>
        {line.subtotal}
        {noteHeading !== undefined && !noted && line.note ? <span className="ml-2 text-xs font-bold text-muted">Note {line.note}</span> : null}
      </span>
      {noted ? <span className={`${CELL} border-l-2 border-edge text-center font-bold tabular-nums text-muted`}>{line.note ?? ''}</span> : null}
      {line.amounts.map((a, c) => (
        <span key={c} className={`${amountOf(columns)} font-extrabold`}>
          {showFigure(a, kindOf(kinds, c))}
        </span>
      ))}
    </div>
  );
}

/**
 * A statement as an examiner expects it: its title, its rows with their detail lines, the totals, and the figure it
 * ends on. A statement in parts has its sub-headings over their rows and its sub-totals where they fall, and no total
 * of the whole; negative figures stand in brackets, and a column of note numbers is shown where the rows have them.
 */
export function StatementSolution({ question }: { question: StatementQuestion }) {
  const n = question.columns.length;
  const kinds = question.columnKinds;
  const lines = question.lines ?? [];
  // Every sub-total by its place among the sub-totals, which is how its test id and the check name it.
  const subtotalIndex = new Map<StatementLine, number>(lines.filter((line) => 'subtotal' in line).map((line, i) => [line, i]));
  const linesAt = (at: number) =>
    lines.filter((line) => line.at === at).map((line, i) => <SolutionLine key={`${at}-${i}`} line={line} index={subtotalIndex.get(line) ?? 0} columns={n} kinds={kinds} noteHeading={question.noteHeading} />);
  const totalled = subtotalIndex.size === 0 && question.columns.some((_, c) => kindOf(kinds, c).adds);
  return (
    <div data-testid="format-solution" className="flex min-w-0 flex-col gap-2 text-sm sm:text-base">
      <p className="text-center text-base font-extrabold [overflow-wrap:anywhere]">{question.title}</p>
      <Scroller columns={n} noted={question.noteHeading !== undefined && n <= 2} label={question.title}>
        <Heads heading={question.heading} columns={question.columns} noteHeading={question.noteHeading} />
        {question.rows.map((row, i) => (
          <Fragment key={i}>
            {linesAt(i)}
            <SolutionRow row={row} columns={n} kinds={kinds} noteHeading={question.noteHeading} />
          </Fragment>
        ))}
        {linesAt(question.rows.length)}
        {totalled ? <Totals totals={columnTotals(question.rows, n)} columns={n} kinds={kinds} noted={question.noteHeading !== undefined && n <= 2} /> : null}
        {question.final ? (
          <p data-testid="solution-final" className={`flex items-baseline justify-between gap-3 px-2 py-2 font-extrabold ${totalled ? '' : 'border-t-2 border-ink'}`}>
            <span className="min-w-0 [overflow-wrap:anywhere]">{question.final.label}</span>
            <span className="shrink-0 tabular-nums">{totalText(question.final.amount, kindOf(kinds, 0))}</span>
          </p>
        ) : null}
      </Scroller>
    </div>
  );
}

export const ROW_STATUS_TEXT: Record<RowStatus, string> = {
  correct: 'Right',
  wrongAmount: 'Wrong amount',
  wrongColumn: 'Wrong column',
  wrongSide: 'Wrong side',
  wrongPlace: 'Wrong side of the totals',
  extraRow: 'Not needed',
};
/** A row of a statement in parts that was entered under another sub-heading than its own. */
export const WRONG_PART = 'Wrong part of the statement';

const VERDICT_TEXT: Record<Exclude<RowVerdict, 'ok'>, string> = {
  missing: 'missing',
  amount: 'wrong amount',
  column: 'amount in the wrong column',
  side: 'entered on the wrong side',
  place: 'entered on the wrong side of the totals',
  label: 'called by the wrong name',
};

/** A row the student entered, as the review shows it. */
export interface MarkedRow {
  label: string;
  /** What was typed in each amount column. */
  amounts: string[];
  /** What the check found; left out for a row that could not be read, which was not marked. */
  status?: RowStatus;
}

/**
 * The rows a student entered in one list, each ticked or crossed with what is wrong with it. With \`columns\` (an
 * account in columns, a statement with columns of several kinds) every amount is shown with the name of its column,
 * since a row has an amount in some columns and none in others.
 */
export function MarkedRows({ id, title, prefix, rows, columns, statement = false }: { id: string; title?: string; prefix?: string; rows: MarkedRow[]; columns?: string[]; statement?: boolean }) {
  if (rows.length === 0) return null;
  return (
    <div data-testid={id} className="flex min-w-0 flex-col gap-1.5">
      {title ? <p className="text-sm font-extrabold text-muted">{title}</p> : null}
      <ul className="flex flex-col gap-1.5">
        {rows.map((row, i) => {
          const right = row.status === 'correct';
          const many = row.amounts.length > 2;
          const amounts = row.amounts.flatMap((a, c) => (a.trim() === '' ? [] : [columns ? `${columnName(columns[c] ?? '')} ${a.trim()}` : a])).join(' · ');
          const tone = row.status === undefined ? 'border-edge bg-surface' : right ? 'border-primary bg-primary-soft text-primary-ink' : 'border-danger bg-danger-soft text-danger-deep';
          return (
            <li key={i} data-testid={`${id}-row-${i}`} data-status={row.status} className={`flex items-start gap-2 rounded-control border-2 px-2 py-1.5 text-base font-bold ${tone}`}>
              {row.status === undefined ? null : right ? <CheckIcon /> : <CrossIcon />}
              <span className="min-w-0 flex-1 [overflow-wrap:anywhere]">
                {prefix ? `${prefix} ` : ''}
                {row.label || 'No particulars'}
                {/* Three or four amounts have a line of their own, under the particulars. */}
                {many ? <span className="block tabular-nums">{amounts}</span> : null}
                {row.status === undefined ? (
                  <span className="block text-sm">Not complete, so not marked</span>
                ) : right ? (
                  <span className="sr-only"> {ROW_STATUS_TEXT.correct}</span>
                ) : (
                  <span data-testid={`${id}-status-${i}`} className="block text-sm font-extrabold">
                    {statement && row.status === 'wrongPlace' ? WRONG_PART : ROW_STATUS_TEXT[row.status]}
                  </span>
                )}
              </span>
              {many ? null : <span className="shrink-0 text-right tabular-nums">{amounts}</span>}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

/** Where an expected row stands, in words: "Dr side", "Cr side, below the totals". Nothing for a row of a statement. */
function whereOf(question: FormatQuestion, at: { side?: 0 | 1; below?: true; period?: number }): string {
  if (question.type !== 'account' || at.side === undefined) return '';
  return `${listName(question, at.side, at.below === true, at.period)}: `;
}

/**
 * A format after it has been checked or shown: how many rows were right, the student's own rows marked (`yours`,
 * where they are known), the expected rows that are missing or not right, the rows that should not be there, and then
 * the correct format laid out as an examiner expects it, with the working. Without `verdicts` (the answer was shown,
 * or nothing was entered) it is the correct format alone. The player and a marked mock paper show it in place of the
 * format, and so does the Mistakes screen for an attempt that kept its answer; for one that did not, it shows it from
 * the stored mistake code.
 */
export function FormatReview({ question, verdicts, yours }: { question: FormatQuestion; verdicts: FormatVerdicts | null; yours?: ReactNode }) {
  const expected = expectedRows(question);
  const right = verdicts?.rows.filter((v) => v === 'ok').length ?? 0;
  const wrong = verdicts ? expected.flatMap((e, i) => (verdicts.rows[i] === 'ok' ? [] : [{ ...e, verdict: verdicts.rows[i] as Exclude<RowVerdict, 'ok'> }])) : [];
  const extra = extraRowsText(verdicts?.extras.length ?? 0);
  const prefixOf = (side?: 0 | 1) => (question.type === 'account' && side !== undefined ? question.sides[side].prefix : undefined);
  // A row of a statement that stands in another list than its own is under the wrong sub-heading.
  const verdictText = (verdict: Exclude<RowVerdict, 'ok'>) => (question.type === 'statement' && verdict === 'place' ? 'entered in the wrong part of the statement' : VERDICT_TEXT[verdict]);
  // A format of a case study is shown with its case, which is its data: no panel of its own.
  const data = ownData(question);
  return (
    <div data-testid="format-review" className="flex min-w-0 flex-col gap-3">
      {data === null ? null : <DataPanel text={data} />}
      {verdicts ? (
        <p data-testid="format-score" className="text-lg font-extrabold">
          {formatScoreText(right, expected.length)}
        </p>
      ) : null}
      {yours}
      {wrong.length > 0 ? (
        <div className="flex flex-col gap-1.5">
          <p className={LABEL}>Rows to put right</p>
          <ul data-testid="format-wrong" className="flex list-disc flex-col gap-1 pl-5 text-base">
            {wrong.map((w, i) => (
              <li key={i} data-verdict={w.verdict} className="[overflow-wrap:anywhere]">
                {whereOf(question, w)}
                <span className="font-bold">
                  {prefixOf(w.side) ? `${prefixOf(w.side)} ` : ''}
                  {w.row.label}
                </span>{' '}
                ({verdictText(w.verdict)})
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      {verdicts && extra ? (
        <p data-testid="format-extras" className="text-base [overflow-wrap:anywhere]">
          <span className="font-bold">{extra}</span> {verdicts.extras.join(', ')}
        </p>
      ) : null}
      <p className={LABEL}>{question.type === 'account' ? 'Correct account' : 'Correct statement'}</p>
      {question.type === 'account' ? <AccountSolution question={question} /> : <StatementSolution question={question} />}
      <ul data-testid="format-working" className="flex list-disc flex-col gap-1 pl-5 text-base">
        {question.working.map((line, i) => (
          <li key={i} className={KEEP_LINES}>
            {line}
          </li>
        ))}
      </ul>
    </div>
  );
}
