import { Fragment } from 'react';
import type { ReactNode } from 'react';
import type { AccountQuestion, FormatRow, StatementLine, StatementQuestion } from '@/content/types';
import { columnTotals, kindOf, showFigure } from '@/engine/formats';
import { JOURNAL_HEADS, keyParticulars, ledgerLayout, statementLayout, type KeyJournalLine } from '@/learning/worksheetLayout';

// The ruled tables of a worksheet, black on white as a printed paper rules them: the journal, a ledger account of two
// sides, a statement. Each is drawn blank for the sheet (rows to write in) or filled in for the answer key. A table
// never makes the page wider than the screen: a wide one scrolls inside its own box, and on paper it fits the A4 width.

const TABLE = 'ws-table w-full table-fixed border-collapse border border-black text-left text-[12px] leading-snug sm:text-[13px]';
const CELL = 'border border-black px-1 py-0.5 align-top [overflow-wrap:anywhere] sm:px-1.5';
const HEAD = `${CELL} bg-neutral-100 text-center font-bold`;
const FIGURE = `${CELL} text-right tabular-nums`;
/** The height of a ruled row to write in by hand. */
const WRITE = 'h-7';

/** A box a wide table scrolls in, on a narrow screen; on paper the table has the whole width. */
function Wide({ children, min }: { children: ReactNode; min?: string }) {
  return (
    <div className="ws-wide max-w-full overflow-x-auto">
      <div className={min}>{children}</div>
    </div>
  );
}

const blankCells = (n: number, className = CELL) => Array.from({ length: n }, (_, i) => <td key={i} className={className} />);

// ---------------------------------------------------------------------------------------------------------------
// The journal.
// ---------------------------------------------------------------------------------------------------------------

/**
 * A ruled journal: `rows` blank rows for the sheet, or the lines of the entries for the key, one entry after another
 * (the date of a set's transaction on the first line of its entry). On a phone it scrolls inside its own box.
 */
export function JournalTable(props: { rows?: number; entries?: KeyJournalLine[][]; testId?: string }) {
  return (
    <Wide min="min-w-[23rem]">
      <Journal {...props} />
    </Wide>
  );
}

function Journal({ rows = 0, entries, testId }: { rows?: number; entries?: KeyJournalLine[][]; testId?: string }) {
  return (
    <table data-testid={testId} className={TABLE}>
      <colgroup>
        <col className="w-[15%]" />
        <col className="w-[47%]" />
        <col className="w-[8%]" />
        <col className="w-[15%]" />
        <col className="w-[15%]" />
      </colgroup>
      <thead>
        <tr>
          {JOURNAL_HEADS.map((h) => (
            <th key={h} scope="col" className={HEAD}>
              {h}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {entries
          ? entries.map((lines, e) => (
              <Fragment key={e}>
                {lines.map((l, i) => (
                  <tr key={i} data-side={l.side}>
                    <td className={CELL}>{l.date}</td>
                    <td className={`${CELL} ${l.side === 'Cr' ? 'pl-6 sm:pl-8' : ''}`}>{l.particulars}</td>
                    <td className={CELL} />
                    <td className={FIGURE}>{l.debit}</td>
                    <td className={FIGURE}>{l.credit}</td>
                  </tr>
                ))}
              </Fragment>
            ))
          : Array.from({ length: rows }, (_, i) => (
              <tr key={i} data-testid="ws-write-row" className={WRITE}>
                {blankCells(5)}
              </tr>
            ))}
      </tbody>
    </table>
  );
}

// ---------------------------------------------------------------------------------------------------------------
// A ledger account: two sides side by side, each with its heads.
// ---------------------------------------------------------------------------------------------------------------

/** The widths of one side's columns, in percent of the whole table. */
function sideWidths(dated: boolean, columns: number): number[] {
  const amount = columns === 1 ? 12 : columns === 2 ? 9 : 8;
  const [date, folio] = [10, 5];
  const particulars = 50 - (dated ? date + folio : 0) - amount * columns;
  return dated ? [date, particulars, folio, ...Array(columns).fill(amount)] : [particulars, ...Array(columns).fill(amount)];
}

/** One row of a side in the key: its date, its particulars and detail lines, its figures. */
function filledSide(row: FormatRow | undefined, prefix: string | undefined, dated: boolean, columns: number, bold = false) {
  const figure = `${FIGURE} ${bold ? 'font-bold' : ''}`;
  if (!row) return [...blankCells(dated ? 3 : 1), ...blankCells(columns, FIGURE)];
  return [
    ...(dated ? [<td key="d" className={CELL}>{row.date ?? ''}</td>] : []),
    <td key="p" className={CELL}>
      {keyParticulars(row, prefix)}
      {row.details?.map((line, i) => (
        <span key={i} className="block pl-2 text-[11px] sm:text-[12px]">
          {line}
        </span>
      ))}
    </td>,
    ...(dated ? [<td key="j" className={CELL} />] : []),
    ...row.amounts.map((a, c) => (
      <td key={`a${c}`} className={figure}>
        {showFigure(a)}
      </td>
    )),
  ];
}

/** A totals row of both sides: ruled above and twice below; blank on the sheet. */
function TotalsRow({ dated, totals, columns }: { dated: boolean; totals: [number[], number[]] | null; columns: number }) {
  const cells = (side: 0 | 1) => [
    ...blankCells(dated ? 3 : 1),
    ...Array.from({ length: columns }, (_, c) => (
      <td key={`t${side}${c}`} className={`${FIGURE} border-b-[3px] border-b-black [border-bottom-style:double] font-bold`}>
        {totals ? showFigure(totals[side][c]) : ''}
      </td>
    )),
  ];
  return (
    <tr data-testid="ws-ledger-total" className={WRITE}>
      {cells(0)}
      {cells(1)}
    </tr>
  );
}

/** A ledger account, blank (the sheet) or filled in (`filled`, the key). */
export function LedgerTable({ q, filled = false }: { q: AccountQuestion; filled?: boolean }) {
  const layout = ledgerLayout(q);
  const n = q.columns.length;
  const widths = sideWidths(layout.dated, n);
  const span = layout.heads.length;
  const periods: [FormatRow[], FormatRow[]][] = [[q.sides[0].rows, q.sides[1].rows], ...(q.later ?? [])];
  const below = [q.sides[0].below, q.sides[1].below];
  return (
    <Wide min={n > 2 || filled ? 'min-w-[34rem]' : 'min-w-[28rem]'}>
      <table data-testid={filled ? 'ws-key-ledger' : 'ws-ledger'} className={TABLE}>
        <colgroup>
          {[...widths, ...widths].map((w, i) => (
            <col key={i} style={{ width: `${w}%` }} />
          ))}
        </colgroup>
        <thead>
          <tr>
            <th colSpan={span * 2} scope="colgroup" className={`${CELL} text-center text-[13px] font-bold sm:text-[14px]`}>
              {q.title}
            </th>
          </tr>
          <tr>
            <th colSpan={span} scope="colgroup" className={`${CELL} text-left font-bold`}>
              {layout.sideTitles[0]}
            </th>
            <th colSpan={span} scope="colgroup" className={`${CELL} text-right font-bold`}>
              {layout.sideTitles[1]}
            </th>
          </tr>
          <tr>
            {[...layout.heads, ...layout.heads].map((h, i) => (
              <th key={i} scope="col" className={HEAD}>
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {layout.periods.map((period, p) => {
            const [left, right] = periods[p];
            const count = filled ? Math.max(left.length, right.length) : period.rows;
            return (
              <Fragment key={p}>
                {period.title ? (
                  <tr>
                    <td colSpan={span * 2} className={`${CELL} bg-neutral-100 font-bold`}>
                      {period.title}
                    </td>
                  </tr>
                ) : null}
                {Array.from({ length: count }, (_, i) =>
                  filled ? (
                    <tr key={i}>
                      {filledSide(left[i], q.sides[0].prefix, layout.dated, n)}
                      {filledSide(right[i], q.sides[1].prefix, layout.dated, n)}
                    </tr>
                  ) : (
                    <tr key={i} data-testid="ws-write-row" className={WRITE}>
                      {blankCells(span * 2)}
                    </tr>
                  ),
                )}
                <TotalsRow dated={layout.dated} columns={n} totals={filled ? [columnTotals(left, n), columnTotals(right, n)] : null} />
              </Fragment>
            );
          })}
          {Array.from({ length: filled ? Math.max(below[0].length, below[1].length) : layout.below }, (_, i) =>
            filled ? (
              <tr key={`b${i}`}>
                {filledSide(below[0][i], q.sides[0].prefix, layout.dated, n)}
                {filledSide(below[1][i], q.sides[1].prefix, layout.dated, n)}
              </tr>
            ) : (
              <tr key={`b${i}`} data-testid="ws-write-row" className={WRITE}>
                {blankCells(span * 2)}
              </tr>
            ),
          )}
        </tbody>
      </table>
    </Wide>
  );
}

// ---------------------------------------------------------------------------------------------------------------
// A statement: one list of rows with its amount columns.
// ---------------------------------------------------------------------------------------------------------------

function statementWidths(heads: number, noted: boolean, columns: number): number[] {
  const amount = columns === 1 ? 22 : columns === 2 ? 18 : columns === 3 ? 15 : 13;
  const note = noted ? 8 : 0;
  const particulars = 100 - note - amount * columns;
  const out = [particulars, ...(noted ? [note] : []), ...Array(columns).fill(amount)];
  return out.length === heads ? out : Array(heads).fill(100 / heads);
}

/** The line a statement ends on, written out: its name (or the choice of names) and its figure. */
function FinalRow({ span, label, options, figure }: { span: number; label: string | null; options?: string[]; figure: string }) {
  return (
    <tr data-testid="ws-statement-final" className={WRITE}>
      <td colSpan={span} className={`${CELL} font-bold`}>
        {label ?? (
          <>
            <span className="inline-block min-w-[50%] border-b border-dotted border-black">&nbsp;</span>
            {options ? <span className="block text-[11px] font-normal">(Write one of: {options.join('; ')})</span> : null}
          </>
        )}
      </td>
      <td className={`${FIGURE} font-bold`}>{figure}</td>
    </tr>
  );
}

/** A statement, blank with the figures it prints (the sheet), or filled in (`filled`, the key). */
export function StatementTable({ q, filled = false }: { q: StatementQuestion; filled?: boolean }) {
  const layout = statementLayout(q);
  const n = q.columns.length;
  const kinds = q.columnKinds;
  const span = layout.heads.length;
  const widths = statementWidths(span, layout.noted, n);
  const lead = layout.noted ? 2 : 1;
  const row = (r: FormatRow, i: number) => (
    <tr key={`r${i}`}>
      <td className={CELL}>
        {r.ref ? `${r.ref} ` : ''}
        {r.label}
        {r.details?.map((line, k) => (
          <span key={k} className="block pl-2 text-[11px] sm:text-[12px]">
            {line}
          </span>
        ))}
      </td>
      {layout.noted ? <td className={`${CELL} text-center`}>{r.note ?? ''}</td> : null}
      {r.amounts.map((a, c) => (
        <td key={c} className={FIGURE}>
          {showFigure(a, kindOf(kinds, c))}
        </td>
      ))}
    </tr>
  );
  const line = (l: StatementLine, i: number) =>
    'heading' in l ? (
      <tr key={`h${i}`}>
        <td colSpan={span} className={`${CELL} font-bold`}>
          {l.heading}
        </td>
      </tr>
    ) : (
      <tr key={`s${i}`}>
        <td className={`${CELL} font-bold`}>{l.subtotal}</td>
        {layout.noted ? <td className={`${CELL} text-center`}>{l.note ?? ''}</td> : null}
        {l.amounts.map((a, c) => (
          <td key={c} className={`${FIGURE} border-t-2 border-t-black font-bold`}>
            {showFigure(a, kindOf(kinds, c))}
          </td>
        ))}
      </tr>
    );
  const totals = columnTotals(q.rows, n);
  const lines = q.lines ?? [];
  const totalled = !lines.some((l) => 'subtotal' in l) && q.columns.some((_, c) => kindOf(kinds, c).adds);
  return (
    <Wide min={n > 2 ? 'min-w-[34rem]' : undefined}>
      <table data-testid={filled ? 'ws-key-statement' : 'ws-statement'} className={TABLE}>
        <colgroup>
          {widths.map((w, i) => (
            <col key={i} style={{ width: `${w}%` }} />
          ))}
        </colgroup>
        <thead>
          <tr>
            <th colSpan={span} scope="colgroup" className={`${CELL} text-center text-[13px] font-bold sm:text-[14px]`}>
              {q.title}
            </th>
          </tr>
          <tr>
            {layout.heads.map((h, i) => (
              <th key={i} scope="col" className={HEAD}>
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {filled ? (
            <>
              {q.rows.map((r, i) => (
                <Fragment key={i}>
                  {lines.filter((l) => l.at === i).map(line)}
                  {row(r, i)}
                </Fragment>
              ))}
              {lines.filter((l) => l.at === q.rows.length).map(line)}
              {totalled ? (
                <tr>
                  <td colSpan={lead} className={`${CELL} text-right font-bold`}>
                    Total
                  </td>
                  {totals.map((t, c) => (
                    <td key={c} className={`${FIGURE} border-b-[3px] border-b-black [border-bottom-style:double] font-bold`}>
                      {kindOf(kinds, c).adds ? showFigure(t, kindOf(kinds, c)) : ''}
                    </td>
                  ))}
                </tr>
              ) : null}
              {q.final ? <FinalRow span={span - 1} label={q.final.label} figure={showFigure(q.final.amount, kindOf(kinds, 0)) || '0'} /> : null}
            </>
          ) : (
            layout.lines.map((l, i) => {
              if (l.type === 'heading')
                return (
                  <tr key={i}>
                    <td colSpan={span} className={`${CELL} font-bold`}>
                      {l.text}
                    </td>
                  </tr>
                );
              if (l.type === 'final') return <FinalRow key={i} span={span - 1} label={l.label} options={l.options} figure="" />;
              if (l.type === 'total')
                return (
                  <tr key={i} data-testid="ws-statement-total" className={WRITE}>
                    <td colSpan={lead} className={`${CELL} text-right font-bold`}>
                      Total
                    </td>
                    {blankCells(n, `${FIGURE} border-b-[3px] border-b-black [border-bottom-style:double]`)}
                  </tr>
                );
              const printed = l.cells.some((c) => c !== null);
              return (
                <tr key={i} data-testid={l.type === 'row' ? (printed ? 'ws-printed-row' : 'ws-write-row') : 'ws-statement-subtotal'} className={WRITE}>
                  <td className={`${CELL} ${l.type === 'subtotal' ? 'font-bold' : ''}`}>{l.label ?? ''}</td>
                  {layout.noted ? <td className={CELL} /> : null}
                  {l.cells.map((c, k) => (
                    <td key={k} data-printed={c !== null ? 'true' : undefined} className={`${FIGURE} ${l.type === 'subtotal' ? 'border-t-2 border-t-black font-bold' : ''}`}>
                      {c ?? ''}
                    </td>
                  ))}
                </tr>
              );
            })
          )}
        </tbody>
      </table>
    </Wide>
  );
}

/** Ruled lines to write working or an answer on. */
export function WritingLines({ count }: { count: number }) {
  return (
    <div aria-hidden="true" className="flex flex-col">
      {Array.from({ length: count }, (_, i) => (
        <span key={i} className="block h-7 border-b border-dotted border-black" />
      ))}
    </div>
  );
}
