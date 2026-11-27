'use client';

import { useEffect, useRef, useState } from 'react';
import type { KeyboardEvent } from 'react';
import { Button } from '@/components/ui/Button';
import { RUPEE_COLUMN, kindOf, sayFigure, type ColumnKind } from '@/engine/formats';
import type { PrintedOf } from '@/exercises/logic';
import { MAX_LIST_ROWS, emptyFormatRow, isBlankFormatRow, withoutPrinted, type FormatRowDraft } from '@/play/formatRows';
import { AccountPicker, type AccountOption } from './AccountPicker';

/** "Cash (₹)" as the amount inputs name it: "Cash". A column of percentages loses its "(%)" in the same way. */
export const columnName = (column: string): string => column.replace(/\s*\((?:₹|%)\)\s*$/, '');

/** A total as it is said: "₹12,500", and in a column of another kind "12.5%", "40", a negative one in brackets. */
export const totalText = sayFigure;

/**
 * The running total of every amount column: the figure alone for one column, a named figure to a line for more. A
 * column whose figures do not add up (a percentage change) has no total and is left out.
 */
export function TotalFigures({ columns, totals, align = 'end', kinds }: { columns: string[]; totals: number[]; align?: 'start' | 'end'; kinds?: readonly ColumnKind[] }) {
  if (columns.length === 1) return <>{totalText(totals[0], kindOf(kinds, 0))}</>;
  return (
    <span className={`flex flex-col ${align === 'end' ? 'items-end' : 'items-start'}`}>
      {columns.map((c, k) =>
        kindOf(kinds, k).adds ? (
          <span key={c} className="whitespace-nowrap">
            {columnName(c)} {totalText(totals[k], kindOf(kinds, k))}
          </span>
        ) : null,
      )}
    </span>
  );
}

// How a row is laid out. On a phone the particulars take the whole width and the amounts stand under them. A row
// with one amount column is a single line from 640 px; a row with two is a single line only where the list has the
// whole width of the page (a statement on a laptop), and stays in two lines on a side of an account. Every amount box
// is wide enough for a figure of eleven characters and more in Indian grouping ("12,34,56,789"); one that takes a
// negative figure is wider still, by the button that changes its sign.
const GRID_ONE = 'grid-cols-[minmax(0,1fr)_2.75rem] sm:grid-cols-[minmax(0,1fr)_9rem_2.75rem] md:grid-cols-[minmax(0,1fr)_9rem_2.25rem]';
const GRID_ONE_SIGNED = 'grid-cols-[minmax(0,1fr)_2.75rem] sm:grid-cols-[minmax(0,1fr)_11.5rem_2.75rem] md:grid-cols-[minmax(0,1fr)_11.5rem_2.25rem]';
const GRID_TWO_NARROW = 'grid-cols-[minmax(0,1fr)_minmax(0,1fr)_2.75rem]';
const GRID_TWO_WIDE = `${GRID_TWO_NARROW} md:grid-cols-[minmax(0,1fr)_9rem_9rem_2.75rem]`;
const GRID_TWO_WIDE_SIGNED = `${GRID_TWO_NARROW} md:grid-cols-[minmax(0,1fr)_11.5rem_11.5rem_2.75rem]`;

// Three or four amount columns (a statement, or partners' accounts in columns, whose sides are then shown one at a
// time at every width): the particulars and the button that removes the row on one line, and the amounts together
// under them, each under the name of its column; four stand two to a line on a phone. From 768 px everything is on
// one line.
const GRID_MANY = 'grid-cols-[minmax(0,1fr)_2.75rem] md:grid-cols-[minmax(0,1fr)_auto_2.25rem]';
const AMOUNTS_MANY: Record<number, string> = { 3: 'grid-cols-3', 4: 'grid-cols-2 sm:grid-cols-4' };

const gridOf = (columns: number, wide: boolean, signed = false) =>
  columns > 2 ? GRID_MANY : columns === 1 ? (signed ? GRID_ONE_SIGNED : GRID_ONE) : wide ? (signed ? GRID_TWO_WIDE_SIGNED : GRID_TWO_WIDE) : GRID_TWO_NARROW;
const labelSpan = (columns: number, wide: boolean) => (columns > 2 ? '' : columns === 1 ? 'col-span-full sm:col-span-1' : wide ? 'col-span-full md:col-span-1' : 'col-span-full');
/** True where a column of the list takes negative figures: its boxes carry the button that changes the sign. */
const anySigned = (columns: number, kinds?: readonly ColumnKind[]) => Array.from({ length: columns }, (_, c) => kindOf(kinds, c).signed).some(Boolean);

/** The names of the amount columns above the rows of a list, on the lines the amounts stand on. */
export function ColumnHeads({ columns, heading, wide = false, kinds }: { columns: string[]; heading: string; wide?: boolean; kinds?: readonly ColumnKind[] }) {
  const n = columns.length;
  // With three or four columns every amount box carries the name of its column itself.
  if (n > 2) return null;
  // On the narrow layouts the particulars have a line to themselves, so only the amount columns are named.
  const headingCell = n === 1 ? 'hidden sm:block' : wide ? 'hidden md:block' : 'hidden';
  return (
    <div aria-hidden="true" className={`grid items-end gap-2 px-2 text-sm font-extrabold text-muted md:gap-1.5 ${gridOf(n, wide, anySigned(n, kinds))} ${n === 1 ? 'hidden sm:grid' : ''}`}>
      <span className={headingCell}>{heading}</span>
      {columns.map((c) => (
        <span key={c} className="text-right">
          {c}
        </span>
      ))}
      <span />
    </div>
  );
}

/** What an empty amount box shows, and how a screen reader names the unit, for a column of each kind. */
const UNIT_MARK: Record<ColumnKind['unit'], string> = { rupees: '₹', percent: '%', number: '' };
const UNIT_WORDS: Record<ColumnKind['unit'], string> = { rupees: ' in rupees', percent: ' in percent', number: '' };

/** What is typed with its sign changed: a minus sign put before it, or the one it has (or its brackets) taken away. */
export const flipSign = (typed: string): string => {
  const text = typed.trim();
  const bracketed = /^\((.*)\)$/.exec(text);
  if (bracketed) return bracketed[1].trim();
  return /^[-−–]/.test(text) ? text.slice(1).trim() : `-${text}`;
};
const isNegative = (typed: string): boolean => /^(?:[-−–]|\(.*\)$)/.test(typed.trim());

/**
 * The box of one figure of a format. With `named` it stands under the name of its column (three or four columns).
 * In a column that takes negative figures it has a button that changes the sign, because the number pad of a phone
 * has no minus key; a minus sign typed on a keyboard does the same.
 */
export function AmountBox({
  testId,
  label,
  column,
  kind = RUPEE_COLUMN,
  named,
  value,
  onChange,
  onKeyDown,
}: {
  testId: string;
  /** What the figure is, for a screen reader: "Statement, row 2". The name of the column and its unit are added. */
  label: string;
  column: string;
  kind?: ColumnKind;
  named: boolean;
  value: string;
  onChange(value: string): void;
  onKeyDown?(e: KeyboardEvent<HTMLInputElement>): void;
}) {
  const mark = UNIT_MARK[kind.unit];
  const negative = isNegative(value);
  return (
    <div className={`flex min-w-0 flex-col gap-0.5 ${named ? (kind.signed ? 'md:w-[11rem]' : 'md:w-[8.5rem]') : ''}`}>
      {named ? (
        <span aria-hidden="true" className="truncate text-xs font-bold text-muted">
          {columnName(column)}
        </span>
      ) : null}
      <div className="flex min-w-0 items-stretch gap-1">
        {kind.signed ? (
          <button
            type="button"
            data-testid={`${testId}-sign`}
            aria-pressed={negative}
            aria-label={`${label}, ${columnName(column)}: ${negative ? 'make it a positive figure' : 'make it a negative figure'}`}
            onClick={() => onChange(flipSign(value))}
            className={`flex min-h-11 w-9 shrink-0 items-center justify-center rounded-control border-2 text-lg font-extrabold ${
              negative ? 'border-danger bg-danger-soft text-danger-deep' : 'border-edge-deep bg-surface text-muted'
            }`}
          >
            −
          </button>
        ) : null}
        <input
          type="text"
          inputMode="decimal"
          autoComplete="off"
          data-testid={testId}
          aria-label={`${label}, ${columnName(column)}${UNIT_WORDS[kind.unit]}`}
          placeholder={named ? mark : `${columnName(column)} ${mark}`.trim()}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={onKeyDown}
          className="min-h-11 w-full min-w-0 rounded-control border-2 border-edge-deep bg-surface px-2 text-right text-base font-bold tabular-nums"
        />
      </div>
    </div>
  );
}

/**
 * A figure the statement prints, in the place its box would have: the figure in the unit of its column, as plain
 * text with no box round it, so that it is not taken for something to type in. A screen reader reads it as given,
 * and the keyboard passes it by. A column the row leaves blank is printed as a dash.
 */
export function GivenFigure({ testId, label, column, kind = RUPEE_COLUMN, named, value }: { testId: string; label: string; column: string; kind?: ColumnKind; named: boolean; value: number }) {
  return (
    // As wide as the box of its column, so that the columns of a row with printed figures and of one without line up.
    <div className={`flex min-w-0 flex-col gap-0.5 ${named ? (kind.signed ? 'md:w-[11rem]' : 'md:w-[8.5rem]') : ''}`}>
      {named ? (
        <span aria-hidden="true" className="truncate text-xs font-bold text-muted">
          {columnName(column)}
        </span>
      ) : null}
      <span data-testid={testId} data-given="true" className={`flex min-h-11 min-w-0 items-center justify-end text-right font-bold tabular-nums [overflow-wrap:anywhere] ${named ? 'text-base md:text-sm' : 'text-base'}`}>
        <span className="sr-only">
          {label}, {columnName(column)}, given:{' '}
        </span>
        {value === 0 ? (
          <>
            <span aria-hidden="true">–</span>
            <span className="sr-only">nil</span>
          </>
        ) : (
          sayFigure(value, kind)
        )}
      </span>
    </div>
  );
}

/**
 * The rows of one list of a format and everything that edits them: the picker of the particulars (the side's "To" or
 * "By" is written by the format), an amount for every amount column, adding and removing a row. A side of an account
 * shows one, the rows below its totals another, a statement one for each of its parts. The rows themselves are kept
 * by whoever shows it.
 */
export function FormatRows({
  id,
  rows,
  onChange,
  columns,
  prefix,
  options,
  label,
  pickerTitle,
  wide = false,
  addLabel = '+ Add row',
  kinds,
  printed,
}: {
  /** What the test ids of the list start with: "fmt-s0" gives "fmt-s0-label-2", "fmt-s0-amount-2-0", "fmt-s0-add". */
  id: string;
  rows: FormatRowDraft[];
  onChange(rows: FormatRowDraft[]): void;
  /** The names of the amount columns. */
  columns: string[];
  /** What the list writes before the particulars of every row: "To", "By". */
  prefix?: string;
  /** The particulars on offer, already sorted. */
  options: AccountOption[];
  /** What the list is called for a screen reader, and in the name of every control: "Dr side". */
  label: string;
  /** The heading of the picker for a row (counted from 1). */
  pickerTitle(row: number): string;
  /** True where the list has the whole width of the page (a statement): two amounts then fit the line of the particulars. */
  wide?: boolean;
  addLabel?: string;
  /** The kinds of the columns, where a statement declares them: a percentage, a figure that may be negative. */
  kinds?: readonly ColumnKind[];
  /**
   * The figures a statement prints, by the particulars of a row: once a row has its particulars, the figures they
   * print stand in their cells and only the others are typed. Until then the row shows no figure at all.
   */
  printed?: PrintedOf;
}) {
  const n = columns.length;
  const [pickerRow, setPickerRow] = useState<number | null>(null);
  const labelButtons = useRef<(HTMLButtonElement | null)[]>([]);
  const focusAfterRender = useRef<number | null>(null);

  // Moves focus to a row's particulars once the rows have rendered (after adding or removing a row).
  useEffect(() => {
    if (focusAfterRender.current === null) return;
    labelButtons.current[focusAfterRender.current]?.focus();
    focusAfterRender.current = null;
  }, [rows.length]);

  const change = (i: number, patch: Partial<FormatRowDraft>) => onChange(rows.map((r, k) => (k === i ? { ...r, ...patch } : r)));
  const addRow = () => {
    if (rows.length >= MAX_LIST_ROWS) return;
    focusAfterRender.current = rows.length;
    onChange([...rows, emptyFormatRow(n)]);
  };
  const removeRow = (i: number) => {
    focusAfterRender.current = Math.max(0, i - 1);
    onChange(rows.filter((_, k) => k !== i));
  };

  /** What the row prints: the figures of the particulars chosen, and nothing while none is. */
  const printedIn = (row: FormatRowDraft) => (row.label === '' ? undefined : printed?.(row.label));

  // Enter in an amount goes on: to the next amount of the row that is typed (a printed figure is passed by), then to
  // the particulars of the next row. In the last row it adds a row, so a list can be typed without leaving the
  // keyboard. It never checks the format.
  const onAmountKey = (e: KeyboardEvent<HTMLInputElement>, i: number, c: number) => {
    if (e.key !== 'Enter') return;
    e.preventDefault();
    const figures = printedIn(rows[i]);
    const next = Array.from({ length: n - c - 1 }, (_, k) => c + 1 + k).find((k) => figures?.[k] == null);
    if (next !== undefined) e.currentTarget.closest('[data-row]')?.querySelector<HTMLInputElement>(`[data-testid="${id}-amount-${i}-${next}"]`)?.focus();
    else if (i < rows.length - 1) labelButtons.current[i + 1]?.focus();
    else if (!isBlankFormatRow(rows[i])) addRow();
  };

  const many = n > 2;
  /** The box of one amount, or the figure the statement prints there; with three or four columns it stands under the name of its column. */
  const amountBox = (row: FormatRowDraft, i: number, column: string, c: number, named: boolean) => {
    const given = printedIn(row)?.[c];
    if (given != null) return <GivenFigure key={c} testId={`${id}-given-${i}-${c}`} label={`${label}, row ${i + 1}`} column={column} kind={kindOf(kinds, c)} named={named} value={given} />;
    return (
      <AmountBox
        key={c}
        testId={`${id}-amount-${i}-${c}`}
        label={`${label}, row ${i + 1}`}
        column={column}
        kind={kindOf(kinds, c)}
        named={named}
        value={row.amounts[c] ?? ''}
        onChange={(value) => change(i, { amounts: row.amounts.map((a, k) => (k === c ? value : a)) })}
        onKeyDown={(e) => onAmountKey(e, i, c)}
      />
    );
  };

  return (
    <div className="flex flex-col gap-2">
      <div role="group" aria-label={label} className="flex flex-col gap-2">
        {rows.map((row, i) => (
          <div key={i} data-row data-testid={`${id}-row-${i}`} className={`grid gap-2 rounded-control border-2 border-edge bg-surface p-2 md:gap-1.5 md:p-1.5 ${many ? 'items-end' : 'items-center'} ${gridOf(n, wide, anySigned(n, kinds))}`}>
            <button
              type="button"
              ref={(el) => {
                labelButtons.current[i] = el;
              }}
              data-testid={`${id}-label-${i}`}
              aria-haspopup="dialog"
              onClick={() => setPickerRow(i)}
              className={`flex min-h-11 min-w-0 items-center justify-between gap-2 rounded-control border-2 border-edge-deep bg-surface px-3 py-1 text-left text-base font-bold ${labelSpan(n, wide)}`}
            >
              <span className="min-w-0 [overflow-wrap:anywhere]">
                <span className="sr-only">
                  {label}, row {i + 1}, particulars:{' '}
                </span>
                {prefix ? <span className="font-extrabold text-muted">{prefix} </span> : null}
                <span className={row.label ? '' : 'text-muted'}>{row.label || 'Choose particulars'}</span>
              </span>
              <Chevron />
            </button>
            {many ? (
              <div className={`order-3 col-span-full grid gap-2 md:order-2 md:col-span-1 ${AMOUNTS_MANY[n]}`}>{columns.map((column, c) => amountBox(row, i, column, c, true))}</div>
            ) : (
              columns.map((column, c) => amountBox(row, i, column, c, false))
            )}
            <button
              type="button"
              data-testid={`${id}-remove-${i}`}
              aria-label={`Remove row ${i + 1} of the ${label}`}
              onClick={() => removeRow(i)}
              className={`flex h-11 w-11 shrink-0 items-center justify-center justify-self-end rounded-control text-muted hover:bg-canvas md:w-9 ${many ? 'order-2 md:order-3' : ''}`}
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" aria-hidden="true">
                <path d="M6 6l12 12M18 6 6 18" />
              </svg>
            </button>
          </div>
        ))}
      </div>

      <Button variant="secondary" data-testid={`${id}-add`} disabled={rows.length >= MAX_LIST_ROWS} onClick={addRow} className="self-start">
        {addLabel}
      </Button>

      {pickerRow !== null ? (
        <AccountPicker
          options={options}
          selectedId={rows[pickerRow]?.label ?? ''}
          title={pickerTitle(pickerRow + 1)}
          what="particulars"
          returnFocusTo={() => labelButtons.current[pickerRow] ?? null}
          onChoose={(chosen) => {
            // What was typed where the new particulars print a figure is the student's no longer: it is taken away.
            change(pickerRow, withoutPrinted({ label: chosen, amounts: rows[pickerRow].amounts }, printed));
            setPickerRow(null);
          }}
          onClose={() => setPickerRow(null)}
        />
      ) : null}
    </div>
  );
}

function Chevron() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="shrink-0 text-muted">
      <path d="m6 9 6 6 6-6" />
    </svg>
  );
}
