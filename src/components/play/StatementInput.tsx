'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { DataPanel } from '@/components/ui/CasePanel';
import type { StatementLine, StatementQuestion } from '@/content/types';
import { kindOf } from '@/engine/formats';
import { printedOf, statementCuts, subtotalPrints, subtotalsOf, type Subtotal } from '@/exercises/logic';
import { ownData } from '@/play/caseStudy';
import {
  checkFormat,
  isBlankFormatRow,
  readStatement,
  runningTotals,
  startStatement,
  statementDisagreement,
  statementDraftLists,
  statementListName,
  usesOtherWording,
  type FormatRowDraft,
  type StatementDraftRows,
} from '@/play/formatRows';
import { FormatNotice, markedRows, verdictsOf } from './AccountInput';
import { AccountPicker } from './AccountPicker';
import { AmountBox, ColumnHeads, FormatRows, GivenFigure, TotalFigures, totalText } from './FormatRows';
import { FormatReview, MarkedRows } from './FormatSolution';
import type { AnswerInputProps } from './inputProps';

/** A sub-heading of a statement in parts, over the rows the student enters under it. */
const SubHeading = ({ text }: { text: string }) => (
  <p data-testid="fmt-heading" className="rounded-control bg-primary-soft px-3 py-2 text-base font-extrabold text-primary-ink [overflow-wrap:anywhere]">
    {text}
  </p>
);

/**
 * A sub-total of a statement in parts: its name, which the statement prints, and a box for its figure in every
 * column. The student works the figure out; nothing here says what it should be. Where the statement gives a figure
 * of the sub-total, that figure is printed in the place of its box.
 */
function SubtotalLine({ question, line, index, typed, onChange }: { question: StatementQuestion; line: Subtotal; index: number; typed: string[]; onChange(typed: string[]): void }) {
  const n = question.columns.length;
  const prints = subtotalPrints(question, line);
  return (
    <div data-testid={`fmt-sub-${index}`} className="flex flex-col gap-2 rounded-control border-2 border-edge-deep bg-canvas p-2 md:flex-row md:items-end md:justify-between md:gap-3">
      <span className="min-w-0 text-base font-extrabold [overflow-wrap:anywhere]">{line.subtotal}</span>
      <div className={`grid shrink-0 gap-2 ${n === 1 ? 'grid-cols-1 md:w-[11.5rem]' : n === 2 ? 'grid-cols-2' : n === 3 ? 'grid-cols-3' : 'grid-cols-2 sm:grid-cols-4'}`}>
        {question.columns.map((column, c) => {
          const given = prints[c];
          return given === null ? (
            <AmountBox
              key={c}
              testId={`fmt-sub-${index}-${c}`}
              label={line.subtotal}
              column={column}
              kind={kindOf(question.columnKinds, c)}
              named={n > 1}
              value={typed[c] ?? ''}
              onChange={(value) => onChange(typed.map((t, k) => (k === c ? value : t)))}
            />
          ) : (
            <GivenFigure key={c} testId={`fmt-sub-given-${index}-${c}`} label={line.subtotal} column={column} kind={kindOf(question.columnKinds, c)} named={n > 1} value={given} />
          );
        })}
      </div>
    </div>
  );
}

/**
 * A statement to prepare: one list of rows, each its particulars (picked from the labels on offer) and its amount in
 * the column it belongs in, with the running total of every column under the list. A Trial Balance says whether its
 * two columns agree, which is arithmetic and never a sign that a row is right; a statement that ends on a figure (a
 * Bank Reconciliation Statement) has a box for it, which the student works out. A statement in parts (a cash flow
 * statement, a comparative statement, a balance sheet in the Schedule III form) prints its sub-headings and the names
 * of its sub-totals: the student enters the rows under each sub-heading and works every sub-total out. A statement
 * that gives some of its columns (the two years of a comparative statement) prints their figures in a row as soon as
 * its particulars are chosen, as text and not in a box: only what is worked out is typed. Once checked, it becomes
 * its review.
 */
export function StatementInput({ question, checked, result, onAnswer, registerSubmit, onFilledChange, draft, onDraft }: AnswerInputProps<StatementQuestion>) {
  const n = question.columns.length;
  const kinds = question.columnKinds;
  const [state, setState] = useState<StatementDraftRows>(() => startStatement(question, draft));
  const { rows, more, subtotals, final, finalLabel } = state;
  const [pickingFinal, setPickingFinal] = useState(false);
  const finalButton = useRef<HTMLButtonElement>(null);
  const [notice, setNotice] = useState<{ text: string; warning: boolean } | null>(null);
  // True once the student has been told that the columns do not agree: the next Check goes ahead.
  const [warned, setWarned] = useState(false);

  const options = useMemo(() => question.labels.map((label) => ({ id: label, label })), [question.labels]);
  // The figures the statement prints (none, unless it gives a column): they stand in a row once it has its particulars.
  const printed = useMemo(() => printedOf(question), [question]);
  const finalOptions = useMemo(() => question.final?.options?.map((label) => ({ id: label, label })), [question.final]);
  const cuts = statementCuts(question);
  const inParts = cuts.length > 1;
  const subLines = subtotalsOf(question);
  const lists = statementDraftLists(state);
  const filled = final.trim() !== '' || finalLabel !== '' || lists.some((list) => list.some((r) => !isBlankFormatRow(r))) || subtotals.some((s) => s.some((t) => t.trim() !== ''));
  useEffect(() => {
    onFilledChange(filled);
  }, [filled, onFilledChange]);

  const submit = useCallback(() => {
    const next = checkFormat(readStatement(question, rows, final, finalLabel, more, subtotals), statementDisagreement(question, rows), warned);
    if ('problem' in next) {
      setNotice({ text: next.problem, warning: false });
    } else if ('confirm' in next) {
      setWarned(true);
      setNotice({ text: next.confirm, warning: true });
    } else {
      setNotice(null);
      onAnswer(next.submit);
    }
  }, [question, rows, final, finalLabel, more, subtotals, warned, onAnswer]);
  useEffect(() => {
    registerSubmit(submit);
  }, [registerSubmit, submit]);

  if (checked) {
    const read = readStatement(question, rows, final, finalLabel, more, subtotals);
    const yours =
      result?.format && (!result.correct || usesOtherWording(question, lists)) ? (
        <div data-testid="fmt-yours" className="flex flex-col gap-3">
          {lists.map((list, k) => (
            <MarkedRows
              key={k}
              id={`fmt-yours-${k}`}
              title={inParts ? `Your rows: ${statementListName(question, k)}` : 'Your rows'}
              rows={markedRows(list, read.rowIndex[k], result.format?.entered[k])}
              // Where a figure is printed, a row shows what was typed of it: each figure says which column it is in.
              columns={kinds || question.givenColumns ? question.columns : undefined}
              statement
            />
          ))}
          {subLines.map((line, i) => {
            const typed = subtotals[i].map((t) => t.trim()).filter((t) => t !== '');
            const verdict = result.format?.subtotals?.[i];
            return typed.length === 0 ? null : (
              <p key={i} data-testid={`fmt-yours-sub-${i}`} data-status={verdict} className="text-base font-bold [overflow-wrap:anywhere]">
                Your {line.subtotal}: {typed.join(' · ')} ({verdict === 'ok' ? 'right' : 'not right'})
              </p>
            );
          })}
          {question.final && (final.trim() !== '' || finalLabel !== '') ? (
            <p data-testid="fmt-yours-final" data-status={result.format.final} className="text-base font-bold [overflow-wrap:anywhere]">
              Your {question.final.options ? finalLabel || 'final figure' : question.final.label}: {final.trim() || 'no amount'} (
              {result.format.final === 'ok' ? 'right' : result.format.final === 'label' ? 'the wrong name for it' : 'not right'})
            </p>
          ) : null}
        </div>
      ) : null;
    return <FormatReview question={question} verdicts={verdictsOf(question, result)} yours={yours} />;
  }

  const update = (patch: Partial<StatementDraftRows>) => {
    const next = { ...state, ...patch };
    setNotice(null);
    setWarned(false);
    setState(next);
    // A statement that is one list keeps the draft it always had; the lists and sub-totals of one in parts are added.
    onDraft?.({
      type: 'statement',
      rows: next.rows,
      final: next.final,
      ...(next.finalLabel !== '' ? { finalLabel: next.finalLabel } : {}),
      ...(next.more.length > 0 ? { more: next.more } : {}),
      ...(next.subtotals.length > 0 ? { subtotals: next.subtotals } : {}),
    });
  };
  const setList = (k: number, list: FormatRowDraft[]) => (k === 0 ? update({ rows: list }) : update({ more: more.map((was, i) => (i === k - 1 ? list : was)) }));

  // The total of every column is shown for a statement that is totalled: one with no sub-total of its own.
  const totalled = subLines.length === 0 && question.columns.some((_, c) => kindOf(kinds, c).adds);
  const totals = runningTotals(rows, n, kinds, printed);
  const entered = totals.some((t) => t !== 0);
  const agree = question.totalsAgree === true && entered && totals[0] === totals[1];
  // The data of a statement of a case study is the case, which is on screen above the task.
  const data = ownData(question);
  /** The sub-headings and sub-totals that stand above the row of this number (after the last row, for the number of rows). */
  const linesAt = (at: number) =>
    (question.lines ?? [])
      .filter((line: StatementLine) => line.at === at)
      .map((line, i) => {
        if ('heading' in line) return <SubHeading key={`h-${at}-${i}`} text={line.heading} />;
        const index = subLines.indexOf(line);
        return <SubtotalLine key={`s-${index}`} question={question} line={line} index={index} typed={subtotals[index]} onChange={(typed) => update({ subtotals: subtotals.map((was, k) => (k === index ? typed : was)) })} />;
      });

  return (
    <div data-testid="statement" data-parts={inParts ? cuts.length : undefined} className="flex min-w-0 flex-col gap-3">
      {data === null ? null : <DataPanel text={data} sticky />}
      <p data-testid="fmt-title" className="text-center text-lg font-extrabold [overflow-wrap:anywhere]">
        {question.title}
      </p>

      <div className="flex flex-col gap-2 md:rounded-card md:border-2 md:border-edge-deep md:bg-canvas md:p-2">
        <ColumnHeads columns={question.columns} heading={question.heading} wide kinds={question.columnKinds} />
        {cuts.map((from, k) => {
          const name = inParts ? statementListName(question, k) : 'Statement';
          return (
            <div key={k} data-testid={inParts ? `fmt-part-${k}` : undefined} className="flex flex-col gap-2">
              {linesAt(from)}
              <FormatRows
                id={k === 0 ? 'fmt-rows' : `fmt-l${k}`}
                rows={lists[k]}
                onChange={(list) => setList(k, list)}
                columns={question.columns}
                options={options}
                label={name}
                pickerTitle={(row) => (inParts ? `Choose the particulars of row ${row}, ${name}` : `Choose the particulars of row ${row}`)}
                wide
                kinds={kinds}
                printed={printed}
              />
            </div>
          );
        })}
        {linesAt(question.rows.length)}
        {totalled ? (
          <p
            data-testid="fmt-total"
            data-ruled={agree ? 'true' : 'false'}
            className={`flex items-baseline justify-between gap-3 bg-canvas px-3 py-2 md:bg-surface ${
              agree ? 'border-y-2 border-b-4 border-double border-ink' : 'border-y-2 border-edge-deep'
            }`}
          >
            <span className="text-sm font-bold text-muted">Total</span>
            <span className="text-lg font-extrabold tabular-nums">
              <TotalFigures columns={question.columns} totals={totals} kinds={kinds} />
            </span>
          </p>
        ) : null}
        {question.final ? (
          <div className="flex flex-col gap-1 px-1 sm:flex-row sm:items-center sm:justify-between sm:gap-3">
            {finalOptions ? (
              // What the statement ends on is part of the answer: the student says which, as well as how much.
              <button
                type="button"
                ref={finalButton}
                data-testid="fmt-final-label"
                aria-haspopup="dialog"
                onClick={() => setPickingFinal(true)}
                className="flex min-h-11 min-w-0 flex-1 items-center justify-between gap-2 rounded-control border-2 border-edge-deep bg-surface px-3 py-1 text-left text-base font-bold"
              >
                <span className={`min-w-0 [overflow-wrap:anywhere] ${finalLabel ? '' : 'text-muted'}`}>
                  <span className="sr-only">The final figure is: </span>
                  {finalLabel || 'Choose what the statement ends on'}
                </span>
                <span aria-hidden="true" className="shrink-0 text-muted">
                  ▾
                </span>
              </button>
            ) : (
              <span id="fmt-final-name" className="min-w-0 text-base font-extrabold [overflow-wrap:anywhere]">
                {question.final.label}
              </span>
            )}
            {kindOf(kinds, 0).signed ? (
              // A figure that may be negative (a net decrease in cash): the box with the button that changes its sign.
              <div className="w-full sm:w-48">
                <AmountBox testId="fmt-final" label={finalOptions ? finalLabel || 'The final figure' : question.final.label} column={question.columns[0]} kind={kindOf(kinds, 0)} named={false} value={final} onChange={(value) => update({ final: value })} />
              </div>
            ) : (
              <input
                type="text"
                inputMode="decimal"
                autoComplete="off"
                data-testid="fmt-final"
                aria-label={`${finalOptions ? finalLabel || 'The final figure' : question.final.label} in rupees`}
                placeholder="Amount ₹"
                value={final}
                onChange={(e) => update({ final: e.target.value })}
                className="min-h-11 w-full rounded-control border-2 border-edge-deep bg-surface px-3 text-right text-base font-bold tabular-nums sm:w-40"
              />
            )}
          </div>
        ) : null}
        {pickingFinal && finalOptions ? (
          <AccountPicker
            options={finalOptions}
            selectedId={finalLabel}
            title="What does the statement end on?"
            what="names"
            returnFocusTo={() => finalButton.current}
            onChoose={(chosen) => {
              update({ finalLabel: chosen });
              setPickingFinal(false);
            }}
            onClose={() => setPickingFinal(false)}
          />
        ) : null}
      </div>

      {question.totalsAgree ? (
        <p data-testid="fmt-agree" data-ruled={agree ? 'true' : 'false'} className={`text-base font-bold ${agree ? 'text-primary-ink' : 'text-muted'}`}>
          {!entered ? 'Enter every balance in its column. The two columns must come to the same total.' : agree ? `Both columns total ${totalText(totals[0])}.` : 'The two columns do not agree yet.'}
        </p>
      ) : null}

      <FormatNotice notice={notice} />
    </div>
  );
}
