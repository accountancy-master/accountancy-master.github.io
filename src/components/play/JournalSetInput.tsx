'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { KEEP_LINES } from '@/components/ui/Prompt';
import type { JournalSetQuestion, SetEntry } from '@/content/types';
import type { LineStatus } from '@/engine/compare';
import { MISTAKE_TEXT, SET_ENTRY_EMPTY, SET_ENTRY_RIGHT, readSetCode, setEntryHeading, setScoreText } from '@/exercises/logic';
import { accountOptions } from '@/play/accounts';
import { isBlank, type JournalRow } from '@/play/journalRows';
import { ENTRY_STATE_TEXT, checkSet, emptyNote, entryState, readSetRows, startRows, type EntryState } from '@/play/journalSet';
import { CheckIcon, CrossIcon, JournalRows } from './JournalRows';
import { SolutionEntry } from './SolutionEntry';
import type { AnswerInputProps } from './inputProps';

const ENTRY_EMPTY_TEXT = 'This entry was empty or not complete.';

const STATE_TONE: Record<EntryState, string> = {
  empty: 'border-edge bg-surface text-muted',
  progress: 'border-edge-deep bg-surface text-ink',
  balanced: 'border-primary bg-primary-soft text-primary-ink',
};

const LABEL = 'text-sm font-extrabold uppercase tracking-wide';

/** A transaction as every block of the journal heads it: the date (or the label of an item without one), then what happened. */
function Dated({ entry }: { entry: SetEntry }) {
  return (
    <>
      <span className="font-extrabold">{setEntryHeading(entry)}:</span> {entry.text}
    </>
  );
}

/**
 * A set of entries after it has been checked or shown: how many entries were right, then every transaction. One that
 * was right is a single line. One that was not shows what went wrong, the student's own entry (`yours`, where it is
 * known), the correct entry in journal form and the steps that explain it. Without `verdicts` (the answer was shown,
 * or nothing was entered) every transaction shows its correct entry. The player and a marked mock paper show it in
 * place of the journal, and so does the Mistakes screen for an attempt that kept its answer; for one that did not, it
 * shows it from the stored mistake code.
 */
export function SetReview({
  question,
  verdicts,
  yours,
}: {
  question: JournalSetQuestion;
  /** For each entry what the check found (see `readSetCode`), or null when the set was not checked. */
  verdicts: string[] | null;
  /** The student's own entry for a transaction, as rows; nothing when it was left empty or is not known. */
  yours?(entry: number): ReactNode;
}) {
  const right = verdicts?.filter((v) => v === SET_ENTRY_RIGHT).length ?? 0;
  return (
    <div data-testid="set-review" className="flex flex-col gap-3">
      {verdicts ? (
        <p data-testid="set-score" className="text-lg font-extrabold">
          {setScoreText(right, verdicts.length)}
        </p>
      ) : null}
      <ol className="flex flex-col gap-3">
        {question.entries.map((entry, k) => {
          const verdict = verdicts?.[k];
          if (verdict === SET_ENTRY_RIGHT) {
            return (
              <li
                key={k}
                data-testid={`set-entry-${k}`}
                data-correct="true"
                className="flex items-start gap-2 rounded-card border-2 border-primary bg-primary-soft px-3 py-2 text-base font-bold text-primary-ink"
              >
                <CheckIcon />
                <p className="min-w-0 break-words">
                  <span className="sr-only">Right. </span>
                  <Dated entry={entry} />
                </p>
              </li>
            );
          }
          const mine = yours?.(k);
          // On a phone a rule above it, which leaves the entry tables the whole width; a card from there up.
          return (
            <li
              key={k}
              data-testid={`set-entry-${k}`}
              data-correct={verdict ? 'false' : undefined}
              className={`flex flex-col gap-3 border-t-2 pt-3 sm:rounded-card sm:border-2 sm:bg-surface sm:p-3 ${verdict ? 'border-danger' : 'border-edge-deep'}`}
            >
              <div className={`flex items-start gap-2 text-base font-bold ${verdict ? 'text-danger-deep' : ''}`}>
                {verdict ? <CrossIcon /> : null}
                <p className="min-w-0 break-words">
                  {verdict ? <span className="sr-only">Not right. </span> : null}
                  <Dated entry={entry} />
                </p>
              </div>
              {verdict ? (
                <p data-testid={`set-mistake-${k}`} className="text-base font-bold">
                  {verdict === SET_ENTRY_EMPTY ? ENTRY_EMPTY_TEXT : (MISTAKE_TEXT[verdict] ?? 'This entry is not right.')}
                </p>
              ) : null}
              {mine ? (
                <>
                  <p className={LABEL}>Your entry</p>
                  {mine}
                </>
              ) : null}
              <p className={LABEL}>Correct entry</p>
              <SolutionEntry lines={entry.expected} narration={entry.narration ?? true} transaction={entry.text} data-testid={`set-solution-${k}`} />
              <ul data-testid={`set-steps-${k}`} className="flex list-disc flex-col gap-1 pl-5 text-base">
                {entry.explanation.map((line, i) => (
                  <li key={i} className={KEEP_LINES}>
                    {line}
                  </li>
                ))}
              </ul>
            </li>
          );
        })}
      </ol>
    </div>
  );
}

/**
 * The journal of a set: one block for every transaction, with its date (or label) and text above the rows of its entry, which
 * are entered exactly as a single entry is. The blocks can be filled in any order; each says whether it is empty, in
 * progress or balanced, never whether it is right. Once checked, the journal becomes the review of the set.
 */
export function JournalSetInput({
  question,
  checked,
  result,
  onAnswer,
  registerSubmit,
  onFilledChange,
  draft,
  onDraft,
}: AnswerInputProps<JournalSetQuestion>) {
  const count = question.entries.length;
  const [blocks, setBlocks] = useState<JournalRow[][]>(() => startRows(draft?.entries, count));
  // For each entry, the row of its block every line of the check came from (rows left blank are not sent). A set
  // shown again already checked (a marked mock paper) never passes through `submit`, so it is read from the draft.
  const [rowIndex, setRowIndex] = useState<number[][]>(() => readSetRows(startRows(draft?.entries, count), count).rowIndex);
  const [notice, setNotice] = useState<{ text: string; warning: boolean } | null>(null);
  // True once the student has been told how many entries are empty: the next Check goes ahead.
  const [warned, setWarned] = useState(false);
  const blockRefs = useRef<(HTMLLIElement | null)[]>([]);
  const noticeRef = useRef<HTMLParagraphElement>(null);

  const options = useMemo(() => accountOptions(question.accountChoices), [question.accountChoices]);
  const states = blocks.map(entryState);
  const filled = states.some((s) => s !== 'empty');
  useEffect(() => {
    onFilledChange(filled);
  }, [filled, onFilledChange]);

  const submit = useCallback(() => {
    const next = checkSet(blocks, count, warned);
    if ('problem' in next) {
      setNotice({ text: next.problem, warning: false });
    } else if ('confirm' in next) {
      setWarned(true);
      setNotice({ text: next.confirm, warning: true });
    } else {
      setNotice(null);
      setRowIndex(next.rowIndex);
      onAnswer({ type: 'journal_set', entries: next.submit });
    }
  }, [blocks, count, warned, onAnswer]);
  useEffect(() => {
    registerSubmit(submit);
  }, [registerSubmit, submit]);

  useEffect(() => {
    if (notice) noticeRef.current?.scrollIntoView({ block: 'nearest' });
  }, [notice]);

  const update = (k: number, rows: JournalRow[]) => {
    const next = blocks.map((b, i) => (i === k ? rows : b));
    setNotice(null);
    setWarned(false);
    setBlocks(next);
    onDraft?.({ type: 'journal_set', entries: next });
  };

  // Enter in the last amount of an entry goes on to the next entry; in the last entry it checks the journal.
  const onEnterAtEnd = (k: number) => {
    if (k >= count - 1) submit();
    else blockRefs.current[k + 1]?.querySelector<HTMLButtonElement>('[data-testid="je-account-0"]')?.focus();
  };

  if (checked) {
    const verdicts = result ? (result.correct ? blocks.map(() => SET_ENTRY_RIGHT) : readSetCode(result.mistakeCode, count)) : null;
    const yours = (k: number) => {
      if (blocks[k].every(isBlank)) return null;
      // One status per row of the block, in the order of the student's rows.
      const statuses: (LineStatus | undefined)[] = [];
      result?.set?.[k]?.lines.forEach((l, i) => {
        statuses[rowIndex[k]?.[i] ?? i] = l.status;
      });
      return (
        <JournalRows
          rows={blocks[k]}
          onChange={() => {}}
          options={options}
          disabled
          statuses={result?.set ? statuses : null}
          label={`Your entry for ${setEntryHeading(question.entries[k])}`}
          onEnterAtEnd={() => {}}
          compact
        />
      );
    };
    return <SetReview question={question} verdicts={verdicts} yours={yours} />;
  }

  const balanced = states.filter((s) => s === 'balanced').length;
  const stillEmpty = emptyNote(states.filter((s) => s === 'empty').length);

  return (
    <div data-testid="journal-set" className="flex flex-col gap-4">
      <ol aria-label="Journal" className="flex flex-col gap-4">
        {question.entries.map((entry, k) => (
          <li
            key={k}
            ref={(el) => {
              blockRefs.current[k] = el;
            }}
            data-testid={`set-entry-${k}`}
            data-state={states[k]}
            className="flex flex-col gap-3 rounded-card border-2 border-edge-deep bg-canvas p-3"
          >
            <div className="flex items-center justify-between gap-3">
              <p data-testid={`set-date-${k}`} className={`${LABEL} text-muted`}>
                {setEntryHeading(entry)}
              </p>
              <span
                data-testid={`set-state-${k}`}
                className={`inline-flex min-h-7 shrink-0 items-center rounded-full border-2 px-3 text-sm font-extrabold ${STATE_TONE[states[k]]}`}
              >
                {ENTRY_STATE_TEXT[states[k]]}
              </span>
            </div>
            <p data-testid={`set-text-${k}`} className="break-words text-base font-bold">
              {entry.text}
            </p>
            <JournalRows
              rows={blocks[k]}
              onChange={(rows) => update(k, rows)}
              options={options}
              disabled={false}
              statuses={null}
              label={`Entry ${k + 1}, ${setEntryHeading(entry)}`}
              pickerTitle={(line) => `Choose the account for line ${line} of entry ${k + 1}`}
              onEnterAtEnd={() => onEnterAtEnd(k)}
              compact
            />
          </li>
        ))}
      </ol>

      <p data-testid="set-progress" className={`text-base font-bold ${balanced === count ? 'text-primary-ink' : 'text-muted'}`}>
        {balanced} of {count} entries balanced.{stillEmpty ? ` ${stillEmpty}` : ''}
      </p>

      {notice ? (
        <p
          ref={noticeRef}
          role="alert"
          data-testid={notice.warning ? 'set-confirm' : 'je-error'}
          className={`scroll-mb-28 rounded-control border-2 px-3 py-2 text-base font-bold ${
            notice.warning ? 'border-accent bg-accent-soft text-accent-ink' : 'border-danger bg-danger-soft text-danger-deep'
          }`}
        >
          {notice.text}
        </p>
      ) : null}
    </div>
  );
}
