'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { JournalQuestion } from '@/content/types';
import type { LineStatus } from '@/engine/compare';
import { accountOptions } from '@/play/accounts';
import { formatINR } from '@/engine/money';
import { checkEntry, emptyRow, isBlank, rowsToLines, type JournalRow } from '@/play/journalRows';
import { JournalRows } from './JournalRows';
import type { AnswerInputProps } from './inputProps';

export function JournalEntryInput({
  question,
  checked: disabled,
  result: checkResult,
  onAnswer,
  registerSubmit,
  onFilledChange,
  draft,
  onDraft,
}: AnswerInputProps<JournalQuestion>) {
  const [rows, setRows] = useState<JournalRow[]>(() => draft?.rows ?? [emptyRow(), emptyRow()]);
  // For each line of the check, the row of the form it was made from (rows left blank are not sent).
  const [rowIndex, setRowIndex] = useState<number[]>(() => {
    // An entry shown again already checked (a marked mock paper) never passes through `submit`.
    const read = draft ? rowsToLines(draft.rows) : null;
    return read?.ok ? read.rowIndex : [];
  });
  const [error, setError] = useState<{ text: string; warning: boolean } | null>(null);
  // True once the student has been told that the entry does not balance: the next Check goes ahead.
  const [warned, setWarned] = useState(false);
  const errorRef = useRef<HTMLParagraphElement>(null);

  // One status per form row, in the order of the student's rows, and the amount a row should have where it is wrong.
  let rowStatuses: (LineStatus | undefined)[] | null = null;
  let rowAmounts: (number | undefined)[] | null = null;
  if (checkResult?.journal) {
    const statuses: (LineStatus | undefined)[] = [];
    const amounts: (number | undefined)[] = [];
    checkResult.journal.lines.forEach((l, i) => {
      statuses[rowIndex[i] ?? i] = l.status;
      amounts[rowIndex[i] ?? i] = l.expectedAmount;
    });
    rowStatuses = statuses;
    rowAmounts = amounts;
  }

  const options = useMemo(() => accountOptions(question.accountChoices), [question.accountChoices]);

  const filled = rows.some((r) => !isBlank(r));
  useEffect(() => {
    onFilledChange(filled);
  }, [filled, onFilledChange]);

  const submit = useCallback(() => {
    const next = checkEntry(rows, warned, formatINR);
    if ('problem' in next) {
      setError({ text: next.problem, warning: false });
      return;
    }
    if ('confirm' in next) {
      setWarned(true);
      setError({ text: next.confirm, warning: true });
      return;
    }
    setError(null);
    setRowIndex(next.rowIndex);
    onAnswer({ type: 'journal_entry', lines: next.submit });
  }, [rows, warned, onAnswer]);
  useEffect(() => {
    registerSubmit(submit);
  }, [registerSubmit, submit]);

  useEffect(() => {
    if (error) errorRef.current?.scrollIntoView({ block: 'nearest' });
  }, [error]);

  const update = (next: JournalRow[]) => {
    setError(null);
    setWarned(false);
    setRows(next);
    onDraft?.({ type: 'journal_entry', rows: next });
  };

  return (
    <JournalRows rows={rows} onChange={update} options={options} disabled={disabled} statuses={rowStatuses} expectedAmounts={rowAmounts} onEnterAtEnd={submit}>
      {error ? (
        <p
          ref={errorRef}
          role="alert"
          data-testid={error.warning ? 'je-confirm' : 'je-error'}
          className={`scroll-mb-28 rounded-control border-2 px-3 py-2 text-base font-bold ${
            error.warning ? 'border-accent bg-accent-soft text-accent-ink' : 'border-danger bg-danger-soft text-danger-deep'
          }`}
        >
          {error.text}
        </p>
      ) : null}
    </JournalRows>
  );
}
