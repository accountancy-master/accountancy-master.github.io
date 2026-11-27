'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { DataPanel } from '@/components/ui/CasePanel';
import type { AccountQuestion } from '@/content/types';
import { formatINR } from '@/engine/money';
import { accountLists, expectedRows, periodCount, periodTitle, readFormatCode, type AccountList, type CheckResult, type FormatQuestion, type FormatVerdicts } from '@/exercises/logic';
import { ownData } from '@/play/caseStudy';
import {
  accountDisagreement,
  checkFormat,
  draftList,
  isBlankFormatRow,
  listName,
  periodAgreement,
  readAccount,
  ruledOff,
  runningTotals,
  startAccount,
  usesOtherWording,
  withDraftList,
  type AccountDraftRows,
  type FormatRowDraft,
} from '@/play/formatRows';
import type { AccountOption } from './AccountPicker';
import { ColumnHeads, FormatRows, TotalFigures, columnName } from './FormatRows';
import { FormatReview, MarkedRows, type MarkedRow } from './FormatSolution';
import type { AnswerInputProps } from './inputProps';

/** The notice under a format: a row that cannot be read (an error), or totals that do not agree yet (a warning). */
export function FormatNotice({ notice }: { notice: { text: string; warning: boolean } | null }) {
  const ref = useRef<HTMLParagraphElement>(null);
  useEffect(() => {
    if (notice) ref.current?.scrollIntoView({ block: 'nearest' });
  }, [notice]);
  if (!notice) return null;
  return (
    <p
      ref={ref}
      role="alert"
      data-testid={notice.warning ? 'fmt-confirm' : 'fmt-error'}
      className={`scroll-mb-28 rounded-control border-2 px-3 py-2 text-base font-bold ${
        notice.warning ? 'border-accent bg-accent-soft text-accent-ink' : 'border-danger bg-danger-soft text-danger-deep'
      }`}
    >
      {notice.text}
    </p>
  );
}

/** What a checked format says about each expected row: all right, what the stored code tells, or nothing when it was only shown. */
export function verdictsOf(question: FormatQuestion, result: CheckResult | null): FormatVerdicts | null {
  if (!result) return null;
  return result.correct ? { rows: expectedRows(question).map(() => 'ok'), extras: [] } : readFormatCode(question, result.mistakeCode);
}

/** The rows of a list as the review marks them: the blank ones left out, each row that was read with what the check found. */
export function markedRows(rows: readonly FormatRowDraft[], rowIndex: readonly number[], statuses: readonly MarkedRow['status'][] | undefined): MarkedRow[] {
  return rows.flatMap((row, i): MarkedRow[] => {
    if (isBlankFormatRow(row)) return [];
    const at = rowIndex.indexOf(i);
    return [{ label: row.label, amounts: row.amounts, ...(at >= 0 && statuses?.[at] ? { status: statuses[at] } : {}) }];
  });
}

/** The test ids of the first period are the plain ones ("fmt-s0", "fmt-agree"); a later period puts its number in ("fmt-p1-s0"). */
const idOf = (period: number, name: string) => (period === 0 ? `fmt-${name}` : `fmt-p${period}-${name}`);

/**
 * One period of an account: its two sides, side by side from 768 px with their totals level, and one at a time on a
 * phone, where the two buttons that switch between them carry each side's running total. Under it, whether its two
 * sides agree. The last period of an account that is continued has a second list on each side, below its totals.
 * An account in three or four columns (partners' capital accounts) shows one side at a time at every width: half a
 * page has no room for a row of four amounts.
 */
function Period({
  question,
  period,
  rows,
  onChange,
  options,
  below,
}: {
  question: AccountQuestion;
  period: number;
  rows: AccountDraftRows;
  onChange(list: AccountList, rows: FormatRowDraft[]): void;
  options: AccountOption[];
  /** True for the period under whose totals the place for a balance brought down is shown. */
  below: boolean;
}) {
  const n = question.columns.length;
  // Three or four amount columns: one side at a time, the way a phone shows every account.
  const stacked = n > 2;
  const [tab, setTab] = useState<0 | 1>(0);
  const several = periodCount(question) > 1;
  const totals = ([0, 1] as const).map((side) => runningTotals(draftList(rows, { side, period }), n));
  const states = periodAgreement(question, rows, period);
  const ruled = ruledOff(states);
  const agreeText = states.every((s) => s === 'empty')
    ? 'Enter the rows of both sides. The two sides must come to the same total.'
    : n === 1
      ? states[0] === 'agree'
        ? `Both sides total ${formatINR(totals[0][0])}.`
        : 'The two sides do not agree yet.'
      : question.columns
          .flatMap((c, k) => (states[k] === 'empty' ? [] : [`${columnName(c)}: ${states[k] === 'agree' ? `both sides total ${formatINR(totals[0][k])}` : 'the two sides do not agree yet'}.`]))
          .join(' ');

  return (
    <div data-testid={several ? `fmt-period-${period}` : undefined} className="flex min-w-0 flex-col gap-3">
      {several ? (
        <p data-testid={idOf(period, 'period-title')} className="text-sm font-extrabold uppercase tracking-wide text-muted">
          {periodTitle(question, period)}
        </p>
      ) : null}

      {/* On a phone: one side at a time, and both running totals on the buttons that switch between them. */}
      <div
        role="group"
        aria-label={several ? `Sides of the account, ${periodTitle(question, period)}` : 'Sides of the account'}
        className={`grid grid-cols-2 gap-2 ${stacked ? '' : 'md:hidden'}`}
      >
        {question.sides.map((side, k) => {
          const s = k as 0 | 1;
          return (
            <button
              key={s}
              type="button"
              data-testid={idOf(period, `tab-${s}`)}
              aria-pressed={tab === s}
              onClick={() => setTab(s)}
              className={`flex min-h-12 min-w-0 flex-col items-start justify-center rounded-control border-2 px-3 py-1 text-left ${
                tab === s ? 'border-primary-deep bg-primary text-white' : 'border-edge-deep bg-surface'
              }`}
            >
              <span className="text-sm font-extrabold">{side.title} side</span>
              <span data-testid={idOf(period, `tab-total-${s}`)} className="text-sm font-bold tabular-nums">
                <TotalFigures columns={question.columns} totals={totals[s]} align="start" />
              </span>
            </button>
          );
        })}
      </div>

      <div className={stacked ? '' : 'md:grid md:grid-cols-2 md:grid-rows-[auto_1fr_auto_auto] md:overflow-hidden md:rounded-card md:border-2 md:border-edge-deep md:bg-canvas'}>
        {question.sides.map((side, k) => {
          const s = k as 0 | 1;
          const name = listName(question, s, false, period);
          const under = listName(question, s, true);
          return (
            <section
              key={s}
              data-testid={idOf(period, `side-${s}`)}
              aria-label={name}
              className={`${tab === s ? 'flex' : 'hidden'} min-w-0 flex-col gap-2 ${
                stacked ? '' : `md:grid md:row-span-4 md:grid-rows-subgrid md:gap-0 ${s === 1 ? 'md:border-l-2 md:border-edge-deep' : ''}`
              }`}
            >
              <div className={stacked ? 'hidden' : 'hidden md:block md:border-b-2 md:border-edge-deep md:px-2 md:py-2'}>
                <p className={`text-base font-extrabold ${s === 1 ? 'text-right' : ''}`}>{side.title}</p>
              </div>
              <div className={`flex flex-col gap-2 ${stacked ? '' : 'md:p-2'}`}>
                <ColumnHeads columns={question.columns} heading="Particulars" />
                <FormatRows
                  id={idOf(period, `s${s}`)}
                  rows={draftList(rows, { side: s, period })}
                  onChange={(list) => onChange({ side: s, period }, list)}
                  columns={question.columns}
                  prefix={side.prefix}
                  options={options}
                  label={name}
                  pickerTitle={(row) => `Choose the particulars of row ${row}, ${name}`}
                  wide={stacked}
                />
              </div>
              <p
                data-testid={idOf(period, `total-${s}`)}
                data-ruled={ruled ? 'true' : 'false'}
                className={`flex items-baseline justify-between gap-3 bg-canvas px-3 py-2 md:bg-surface ${ruled ? 'border-y-2 border-b-4 border-double border-ink' : 'border-y-2 border-edge-deep'}`}
              >
                <span className="text-sm font-bold text-muted">Total</span>
                <span className="text-lg font-extrabold tabular-nums">
                  <TotalFigures columns={question.columns} totals={totals[s]} />
                </span>
              </p>
              {below ? (
                <div className={`flex flex-col gap-2 ${stacked ? '' : 'md:p-2'}`}>
                  <p className="text-sm font-extrabold text-muted">Below the totals</p>
                  <FormatRows
                    id={`fmt-b${s}`}
                    rows={draftList(rows, { side: s, below: true })}
                    onChange={(list) => onChange({ side: s, below: true }, list)}
                    columns={question.columns}
                    prefix={side.prefix}
                    options={options}
                    label={under}
                    pickerTitle={(row) => `Choose the particulars of row ${row}, ${under}`}
                    addLabel="+ Add row below the totals"
                    wide={stacked}
                  />
                </div>
              ) : (
                <div className="hidden md:block" />
              )}
            </section>
          );
        })}
      </div>

      <p data-testid={idOf(period, 'agree')} data-ruled={ruled ? 'true' : 'false'} className={`text-base font-bold ${ruled ? 'text-primary-ink' : 'text-muted'}`}>
        {agreeText}
      </p>
    </div>
  );
}

/**
 * A two-sided account to prepare. From 768 px the two sides stand side by side, as on paper, with their totals level;
 * on a phone one side is shown at a time and the two buttons that switch between them carry each side's running
 * total, so both are in view whichever side is open. A row is its particulars, picked from the labels on offer (the
 * side writes "To" or "By" itself), and its amount; the closing row is entered like any other. Each side shows its
 * running total, and the format says whether the two sides agree: that is arithmetic, never a sign that a row is
 * right. An account kept over several periods shows them one under another, each with its own totals. Where the task
 * asks for the balance to be brought down there is a second list on each side, below the last totals, whether or not
 * a balance is left. Partners' accounts written in columns have an amount column for each partner: a row has an
 * amount in some columns and none in the others, every column agrees on its own, and the balance of each is carried
 * down in its own column. Once checked, the account becomes its review.
 */
export function AccountInput({ question, checked, result, onAnswer, registerSubmit, onFilledChange, draft, onDraft }: AnswerInputProps<AccountQuestion>) {
  const n = question.columns.length;
  const periods = periodCount(question);
  const [rows, setRows] = useState<AccountDraftRows>(() => startAccount(draft, n, periods));
  const [notice, setNotice] = useState<{ text: string; warning: boolean } | null>(null);
  // True once the student has been told that the sides do not agree: the next Check goes ahead.
  const [warned, setWarned] = useState(false);

  const options = useMemo(() => question.labels.map((label) => ({ id: label, label })), [question.labels]);
  const lists = accountLists(question);
  // The task says whether the balance is brought down, never the answer: no balance left is then for the student to see.
  const continued = question.continued === true || question.sides.some((s) => s.below.length > 0);
  const filled = lists.some((list) => draftList(rows, list).some((r) => !isBlankFormatRow(r)));
  useEffect(() => {
    onFilledChange(filled);
  }, [filled, onFilledChange]);

  const submit = useCallback(() => {
    const next = checkFormat(readAccount(question, rows), accountDisagreement(question, rows), warned);
    if ('problem' in next) {
      setNotice({ text: next.problem, warning: false });
    } else if ('confirm' in next) {
      setWarned(true);
      setNotice({ text: next.confirm, warning: true });
    } else {
      setNotice(null);
      onAnswer(next.submit);
    }
  }, [question, rows, warned, onAnswer]);
  useEffect(() => {
    registerSubmit(submit);
  }, [registerSubmit, submit]);

  if (checked) {
    const read = readAccount(question, rows);
    const entered = lists.map((list) => draftList(rows, list));
    // Every row right needs no second showing: the correct account below is the student's own, unless a row was
    // entered under other wording that is just as right, which the correct account does not show.
    const yours =
      result?.format && (!result.correct || usesOtherWording(question, entered)) ? (
        <div data-testid="fmt-yours" className="grid gap-3 md:grid-cols-2">
          {lists.map((list, k) => (
            <MarkedRows
              key={k}
              id={`fmt-yours-${k}`}
              title={`Your ${listName(question, list.side, list.below === true, list.period)}`}
              prefix={question.sides[list.side].prefix}
              rows={markedRows(entered[k], read.rowIndex[k], result.format?.entered[k])}
              columns={n > 2 ? question.columns : undefined}
            />
          ))}
        </div>
      ) : null;
    return <FormatReview question={question} verdicts={verdictsOf(question, result)} yours={yours} />;
  }

  const change = (list: AccountList, next: FormatRowDraft[]) => {
    const all = withDraftList(rows, list, next);
    setNotice(null);
    setWarned(false);
    setRows(all);
    onDraft?.({ type: 'account', sides: all.sides, below: all.below, ...(all.later?.length ? { later: all.later } : {}) });
  };

  // The data of an account of a case study is the case, which is on screen above the task.
  const data = ownData(question);
  return (
    <div data-testid="account" data-continued={continued ? 'true' : undefined} className="flex min-w-0 flex-col gap-3">
      {data === null ? null : <DataPanel text={data} sticky />}
      <p data-testid="fmt-title" className="text-center text-lg font-extrabold [overflow-wrap:anywhere]">
        {question.title}
      </p>
      {Array.from({ length: periods }, (_, period) => (
        <Period key={period} question={question} period={period} rows={rows} onChange={change} options={options} below={continued && period === periods - 1} />
      ))}
      <FormatNotice notice={notice} />
    </div>
  );
}
