'use client';

import { useCallback, useEffect, useId, useRef, useState } from 'react';
import type { KeyboardEvent } from 'react';
import type { TypedQuestion } from '@/content/types';
import { RATIO_SEPARATOR, numericWords, readNumeric } from '@/exercises/numeric';
import type { AnswerInputProps } from './inputProps';

const tone = (result: AnswerInputProps<TypedQuestion>['result']) =>
  result === null ? 'border-edge-deep bg-surface' : result.correct ? 'border-primary bg-primary-soft' : 'border-danger bg-danger-soft';

/** What the boxes of a ratio hold, from the text they are kept as ("5::2" is 5, nothing, 2). */
const termsOf = (text: string, count: number): string[] => {
  const parts = text.split(':');
  return Array.from({ length: count }, (_, i) => parts[i] ?? '');
};

/**
 * The boxes of a ratio: one for each number, with the colons between them written by the screen, so that a phone's
 * number pad is all it takes. A colon (or a space, a dot or a comma) typed in a box moves on to the next, and a whole
 * ratio typed or pasted into a box ("5:3:2") is shared out from that box on.
 */
function RatioBoxes({
  id,
  count,
  text,
  disabled,
  className,
  onText,
  onEnter,
}: {
  id: string;
  count: number;
  text: string;
  disabled: boolean;
  className: string;
  onText(text: string): void;
  onEnter(): void;
}) {
  const boxes = useRef<(HTMLInputElement | null)[]>([]);
  const terms = termsOf(text, count);

  const change = (i: number, typed: string) => {
    const next = [...terms];
    // More than one number, or a number and what separates it from the next: shared out from this box on.
    const pieces = typed.split(RATIO_SEPARATOR);
    if (pieces.length > 1) {
      const numbers = pieces.filter((p) => p !== '');
      numbers.slice(0, count - i).forEach((p, k) => {
        next[i + k] = p.replace(/\D/g, '');
      });
      // On to the box after the last one filled (a colon typed after a number goes to the next box).
      boxes.current[Math.min(count - 1, i + Math.max(1, numbers.length) - (numbers.length > 1 ? 1 : 0))]?.focus();
    } else {
      next[i] = typed.replace(/\D/g, '');
    }
    onText(next.join(':'));
  };

  const onKey = (e: KeyboardEvent<HTMLInputElement>, i: number) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      onEnter();
    } else if (e.key === 'Backspace' && terms[i] === '' && i > 0) {
      // Backspace in an empty box goes back to the one before it.
      e.preventDefault();
      boxes.current[i - 1]?.focus();
    }
  };

  return (
    <div data-testid="ratio-input" data-value={text} role="group" aria-labelledby={`${id}-label`} className="flex flex-wrap items-center gap-2">
      {terms.map((term, i) => (
        <span key={i} className="flex items-center gap-2">
          {i > 0 ? (
            <span aria-hidden="true" className="text-2xl font-extrabold text-muted">
              :
            </span>
          ) : null}
          <input
            ref={(el) => {
              boxes.current[i] = el;
            }}
            type="text"
            inputMode="numeric"
            autoComplete="off"
            // The first box answers to the name every numeric answer has, so whatever fills one can fill a ratio.
            data-testid={i === 0 ? 'numeric-input' : `ratio-term-${i}`}
            aria-label={`Number ${i + 1} of ${count} of the ratio`}
            value={term}
            disabled={disabled}
            onChange={(e) => change(i, e.target.value)}
            onKeyDown={(e) => onKey(e, i)}
            className={`min-h-12 w-16 rounded-control border-2 px-1 text-center text-xl font-bold tabular-nums ${className}`}
          />
        </span>
      ))}
    </div>
  );
}

/**
 * The field of a numeric answer; the unit is in the label and decides how what is typed is read. A ratio has a box for
 * each of its numbers instead (the question names the parties, so how many there are is no part of the answer).
 */
export function NumericInput({
  question,
  checked,
  result,
  onFilledChange,
  registerSubmit,
  onAnswer,
  draft,
  onDraft,
}: AnswerInputProps<TypedQuestion>) {
  const id = useId();
  const [text, setText] = useState(draft?.text ?? '');
  const [error, setError] = useState<string | null>(null);
  const errorRef = useRef<HTMLParagraphElement>(null);
  const words = numericWords(question);
  const ratio = question.unit === 'ratio';

  const filled = text.replace(/:/g, '').trim() !== '';
  useEffect(() => {
    onFilledChange(filled);
  }, [filled, onFilledChange]);

  const submit = useCallback(() => {
    const value = readNumeric(question, text);
    if (value === null) {
      setError(numericWords(question).problem);
      return;
    }
    setError(null);
    onAnswer({ type: 'numeric', value });
  }, [text, question, onAnswer]);
  useEffect(() => {
    registerSubmit(submit);
  }, [registerSubmit, submit]);

  useEffect(() => {
    if (error) errorRef.current?.scrollIntoView({ block: 'nearest' });
  }, [error]);

  const type = (next: string) => {
    setError(null);
    setText(next);
    onDraft?.({ type: 'numeric', text: next });
  };

  return (
    <div className="flex flex-col gap-2">
      <label id={`${id}-label`} htmlFor={ratio ? undefined : id} className="text-base font-extrabold">
        {words.label}
      </label>
      {ratio ? (
        <>
          <RatioBoxes id={id} count={question.answer.length} text={text} disabled={checked} className={tone(result)} onText={type} onEnter={submit} />
          {checked ? null : (
            <p data-testid="ratio-help" className="text-sm font-bold text-muted">
              In the order the question names them. No need to type the colons.
            </p>
          )}
        </>
      ) : (
        <input
          id={id}
          type="text"
          inputMode="decimal"
          autoComplete="off"
          data-testid="numeric-input"
          placeholder={words.placeholder}
          value={text}
          disabled={checked}
          onChange={(e) => type(e.target.value)}
          onKeyDown={(e) => {
            if (e.key !== 'Enter') return;
            e.preventDefault();
            submit();
          }}
          className={`min-h-12 w-full rounded-control border-2 px-3 text-xl font-bold tabular-nums sm:max-w-xs ${tone(result)}`}
        />
      )}
      {error ? (
        <p
          ref={errorRef}
          role="alert"
          data-testid="numeric-error"
          className="scroll-mb-28 rounded-control border-2 border-danger bg-danger-soft px-3 py-2 text-base font-bold text-danger-deep"
        >
          {error}
        </p>
      ) : null}
    </div>
  );
}
