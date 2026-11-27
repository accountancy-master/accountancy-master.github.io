'use client';

import { useEffect, useRef, useState } from 'react';
import type { KeyboardEvent, ReactNode } from 'react';
import { Button } from '@/components/ui/Button';
import type { LineStatus } from '@/engine/compare';
import { formatINR } from '@/engine/money';
import { emptyRow, type JournalRow } from '@/play/journalRows';
import { rowTotals } from '@/play/journalSet';
import { AccountPicker, type AccountOption } from './AccountPicker';

const MAX_ROWS = 8;

const STATUS_TEXT: Record<LineStatus, string> = {
  correct: 'Correct',
  sidesReversed: 'Wrong side',
  wrongAmount: 'Wrong amount',
  wrongAccount: 'Wrong account',
  extraLine: 'Not needed',
};

// One grid shape for the heading, every row and the totals, so the ruled columns line up on wide screens.
const COLUMNS = 'md:grid-cols-[minmax(0,1fr)_7.5rem_9.5rem_9.5rem]';
const RULE = 'md:border-l-2 md:border-edge-deep';

/**
 * The rows of one journal entry and everything that edits them: the account picker, Dr/Cr, the amount, adding and
 * removing a line, the totals and the note that says whether the entry balances. The single-entry input shows one;
 * the journal of a set shows one for every transaction. The rows themselves are kept by whoever shows it.
 */
export function JournalRows({
  rows,
  onChange,
  options,
  disabled,
  statuses,
  expectedAmounts = null,
  label = 'Journal entry',
  pickerTitle = (line) => `Choose the account for line ${line}`,
  onEnterAtEnd,
  compact = false,
  children,
}: {
  rows: JournalRow[];
  onChange(rows: JournalRow[]): void;
  /** The accounts on offer, already sorted. */
  options: AccountOption[];
  /** True once the entry has been checked or revealed: nothing can be changed. */
  disabled: boolean;
  /** After checking: what the check found for each row, in the order of the rows; null before. */
  statuses: (LineStatus | undefined)[] | null;
  /** After checking: for each row whose account is in the entry with another amount, the amount it should have (paise). */
  expectedAmounts?: (number | undefined)[] | null;
  /** What the group of rows is called for a screen reader. */
  label?: string;
  /** The heading of the account picker for a line (counted from 1). */
  pickerTitle?(line: number): string;
  /** Enter in the amount of the last row: check the entry, or go on to the next entry of a set. */
  onEnterAtEnd(): void;
  /**
   * For an entry of a set: on a phone the two totals are left out (the note under the rows still says whether the
   * entry balances), and a checked entry shows its rows alone.
   */
  compact?: boolean;
  /** Shown between the balance note and "Add line": the single entry puts its error there. */
  children?: ReactNode;
}) {
  const [pickerRow, setPickerRow] = useState<number | null>(null);
  const accountButtons = useRef<(HTMLButtonElement | null)[]>([]);
  const focusAfterRender = useRef<number | null>(null);

  const labelOf = (id: string) => options.find((o) => o.id === id)?.label ?? id;

  // Moves focus to a row's account button once the rows have rendered (after adding or removing a line).
  useEffect(() => {
    if (focusAfterRender.current === null) return;
    accountButtons.current[focusAfterRender.current]?.focus();
    focusAfterRender.current = null;
  }, [rows.length]);

  const change = (i: number, patch: Partial<JournalRow>) => onChange(rows.map((r, k) => (k === i ? { ...r, ...patch } : r)));
  const addRow = () => {
    focusAfterRender.current = rows.length;
    onChange(rows.length >= MAX_ROWS ? rows : [...rows, emptyRow()]);
  };
  const removeRow = (i: number) => {
    focusAfterRender.current = i - 1;
    onChange(rows.filter((_, k) => k !== i));
  };

  const onAmountKey = (e: KeyboardEvent<HTMLInputElement>, i: number) => {
    if (e.key !== 'Enter') return;
    e.preventDefault();
    if (i < rows.length - 1) accountButtons.current[i + 1]?.focus();
    else onEnterAtEnd();
  };

  // Rows without a valid amount or a chosen side are left out of the totals.
  const { debit, credit } = rowTotals(rows);
  const balanceNote =
    debit === 0 && credit === 0
      ? 'Enter amounts to compare debits and credits'
      : debit === credit
        ? 'Debits and credits match'
        : `Debits and credits differ by ${formatINR(Math.abs(debit - credit))}`;
  const balanced = debit === credit && debit !== 0;
  const rowsOnly = compact && disabled;

  return (
    <div className="flex flex-col gap-3">
      <div
        role="group"
        aria-label={label}
        className="flex flex-col gap-3 md:gap-0 md:overflow-hidden md:rounded-control md:border-2 md:border-edge-deep md:bg-surface"
      >
        <div aria-hidden="true" className={`hidden bg-canvas text-sm font-extrabold text-muted md:grid ${COLUMNS}`}>
          <span className="px-3 py-2">Particulars</span>
          <span className={`px-2 py-2 text-center ${RULE}`}>Dr/Cr</span>
          <span className={`px-3 py-2 text-right ${RULE}`}>Debit ₹</span>
          <span className={`px-3 py-2 text-right ${RULE}`}>Credit ₹</span>
        </div>

        {rows.map((row, i) => {
          const status = statuses?.[i];
          const tone =
            status === undefined
              ? 'border-edge bg-surface'
              : status === 'correct'
                ? 'border-primary bg-primary-soft'
                : 'border-danger bg-danger-soft';
          const amountColumn = row.side === 'Cr' ? 'md:col-start-4' : 'md:col-start-3';
          return (
            <div
              key={i}
              data-testid={`je-row-${i}`}
              data-status={status}
              className={`grid grid-cols-[auto_minmax(0,1fr)] items-center gap-2 rounded-card border-2 p-3 md:items-stretch md:gap-0 md:rounded-none md:border-0 md:border-t-2 md:p-0 ${COLUMNS} ${tone}`}
            >
              <div
                className={`col-span-2 flex items-center gap-2 md:col-span-1 md:col-start-1 md:row-start-1 md:p-1.5 ${
                  row.side === 'Cr' ? 'md:pl-8' : ''
                }`}
              >
                <button
                  type="button"
                  ref={(el) => {
                    accountButtons.current[i] = el;
                  }}
                  data-testid={`je-account-${i}`}
                  aria-haspopup="dialog"
                  disabled={disabled}
                  onClick={() => setPickerRow(i)}
                  className="flex min-h-11 min-w-0 flex-1 items-center justify-between gap-2 rounded-control border-2 border-edge-deep bg-surface px-3 py-1 text-left text-base font-bold disabled:cursor-default"
                >
                  <span className={`min-w-0 ${row.accountId ? '' : 'text-muted'}`}>
                    <span className="sr-only">Line {i + 1} account: </span>
                    {row.accountId ? labelOf(row.accountId) : 'Choose account'}
                  </span>
                  {disabled ? null : <Chevron />}
                </button>
                {i >= 2 && !disabled ? (
                  <button
                    type="button"
                    data-testid={`je-remove-${i}`}
                    aria-label={`Remove line ${i + 1}`}
                    onClick={() => removeRow(i)}
                    className="flex h-11 w-11 shrink-0 items-center justify-center rounded-control text-muted hover:bg-canvas"
                  >
                    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" aria-hidden="true">
                      <path d="M6 6l12 12M18 6 6 18" />
                    </svg>
                  </button>
                ) : null}
              </div>

              <div
                role="group"
                aria-label={`Line ${i + 1}: debit or credit`}
                className={`flex gap-1.5 md:col-start-2 md:row-start-1 md:items-center md:justify-center md:px-1 ${RULE}`}
              >
                {(['Dr', 'Cr'] as const).map((side) => {
                  const on = row.side === side;
                  return (
                    <button
                      key={side}
                      type="button"
                      data-testid={`je-side-${i}-${side}`}
                      aria-pressed={on}
                      disabled={disabled}
                      onClick={() => change(i, { side })}
                      className={`min-h-11 min-w-12 rounded-control border-2 px-3 text-base font-extrabold disabled:cursor-default ${
                        on ? 'border-primary-deep bg-primary text-white' : 'border-edge-deep bg-surface hover:bg-canvas'
                      }`}
                    >
                      {side}
                    </button>
                  );
                })}
              </div>

              <span aria-hidden="true" className={`hidden md:col-start-3 md:row-start-1 md:block ${RULE}`} />
              <span aria-hidden="true" className={`hidden md:col-start-4 md:row-start-1 md:block ${RULE}`} />
              <div className={`min-w-0 md:row-start-1 md:flex md:items-center md:p-1.5 ${amountColumn}`}>
                <input
                  type="text"
                  inputMode="decimal"
                  autoComplete="off"
                  data-testid={`je-amount-${i}`}
                  aria-label={`Line ${i + 1} amount in rupees`}
                  placeholder="Amount ₹"
                  value={row.amount}
                  disabled={disabled}
                  onChange={(e) => change(i, { amount: e.target.value })}
                  onKeyDown={(e) => onAmountKey(e, i)}
                  className="min-h-11 w-full rounded-control border-2 border-edge-deep bg-surface px-3 text-base font-bold tabular-nums md:text-right"
                />
              </div>

              {status ? (
                <p
                  className={`col-span-2 flex items-center gap-2 text-base font-extrabold md:col-span-4 md:row-start-2 md:px-3 md:pb-2 ${
                    status === 'correct' ? 'text-primary-ink' : 'text-danger-deep'
                  }`}
                >
                  {status === 'correct' ? <CheckIcon /> : <CrossIcon />}
                  <span className="min-w-0">
                    <span data-testid={`je-row-status-${i}`}>{STATUS_TEXT[status]}</span>
                    {status !== 'correct' && expectedAmounts?.[i] !== undefined ? (
                      // A wrong amount, or a line on the wrong side whose amount is wrong as well: the amount it should have.
                      <span data-testid={`je-row-amount-${i}`} className="font-bold">
                        {' '}
                        · {status === 'wrongAmount' ? 'should be' : 'amount should be'} {formatINR(expectedAmounts[i]!)}
                      </span>
                    ) : null}
                  </span>
                </p>
              ) : null}
            </div>
          );
        })}

        {rowsOnly ? null : (
          <div className={`grid-cols-2 gap-3 md:gap-0 md:border-t-2 md:border-edge-deep md:bg-canvas ${compact ? 'hidden md:grid' : 'grid'} ${COLUMNS}`}>
            <p className="hidden px-3 py-2 text-right text-base font-extrabold md:col-span-2 md:block">Total</p>
            <Total label="Total debit" testId="je-total-dr">
              {formatINR(debit)}
            </Total>
            <Total label="Total credit" testId="je-total-cr">
              {formatINR(credit)}
            </Total>
          </div>
        )}
      </div>

      {rowsOnly ? null : (
        <div className="flex flex-col gap-1">
          {compact ? (
            // The entry of a set leaves its totals out on a phone: they are said in one line here instead.
            <p data-testid="je-totals-line" className="text-sm font-bold tabular-nums text-muted md:hidden">
              Dr {formatINR(debit)} · Cr {formatINR(credit)}
            </p>
          ) : null}
          <p
            data-testid="je-balance"
            data-balanced={balanced ? 'true' : 'false'}
            className={`flex items-center gap-2 text-base font-bold ${balanced ? 'text-primary-ink' : debit === 0 && credit === 0 ? 'text-muted' : 'text-accent-ink'}`}
          >
            {balanced ? <CheckIcon /> : debit === 0 && credit === 0 ? null : <span aria-hidden="true" className="w-5 shrink-0 text-center text-lg leading-none">≠</span>}
            <span>{balanceNote}</span>
          </p>
        </div>
      )}

      {children}

      {disabled ? null : (
        <Button
          variant="secondary"
          data-testid="je-add-row"
          disabled={rows.length >= MAX_ROWS}
          onClick={addRow}
          className="self-start"
        >
          + Add line
        </Button>
      )}

      {/* A picker that is open when the entry is closed (the clock of the question ran out) goes with it. */}
      {pickerRow !== null && !disabled ? (
        <AccountPicker
          options={options}
          selectedId={rows[pickerRow]?.accountId ?? ''}
          title={pickerTitle(pickerRow + 1)}
          returnFocusTo={() => accountButtons.current[pickerRow] ?? null}
          onChoose={(id) => {
            change(pickerRow, { accountId: id });
            setPickerRow(null);
          }}
          onClose={() => setPickerRow(null)}
        />
      ) : null}
    </div>
  );
}

function Total({ label, testId, children }: { label: string; testId: string; children: ReactNode }) {
  return (
    <p className={`flex flex-col rounded-control bg-canvas px-3 py-2 md:rounded-none md:bg-transparent md:text-right ${RULE}`}>
      <span className="text-sm font-bold text-muted md:sr-only">{label}</span>
      <span data-testid={testId} className="text-lg font-extrabold tabular-nums">
        {children}
      </span>
    </p>
  );
}

function Chevron() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="shrink-0 text-muted">
      <path d="m6 9 6 6 6-6" />
    </svg>
  );
}

export function CheckIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="shrink-0">
      <path d="m5 12 5 5L20 7" />
    </svg>
  );
}

export function CrossIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" aria-hidden="true" className="shrink-0">
      <path d="M6 6l12 12M18 6 6 18" />
    </svg>
  );
}
