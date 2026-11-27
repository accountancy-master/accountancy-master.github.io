'use client';

import { useState } from 'react';
import type { TrueFalseQuestion } from '@/content/types';
import { ChoiceButton, type ChoiceMark } from './ChoiceButton';
import { useAnswerChannel, type AnswerInputProps } from './inputProps';

export function TrueFalseView({
  question,
  selected,
  onSelect,
  disabled,
  checked,
}: {
  question: TrueFalseQuestion;
  selected: boolean | null;
  onSelect(value: boolean): void;
  disabled: boolean;
  checked: boolean;
}) {
  const markOf = (value: boolean): ChoiceMark =>
    !checked ? null : value === question.correct ? 'right' : value === selected ? 'wrong' : null;

  return (
    <div role="group" aria-label="True or false" className="grid gap-3 sm:grid-cols-2">
      <ChoiceButton
        badge="T"
        selected={selected === true}
        mark={markOf(true)}
        disabled={disabled}
        onClick={() => onSelect(true)}
        data-testid="tf-true"
      >
        True
      </ChoiceButton>
      <ChoiceButton
        badge="F"
        selected={selected === false}
        mark={markOf(false)}
        disabled={disabled}
        onClick={() => onSelect(false)}
        data-testid="tf-false"
      >
        False
      </ChoiceButton>
    </div>
  );
}

/** The true/false answer input: choosing a side is the answer. */
export function TrueFalseInput({ question, checked, draft, onDraft, ...channel }: AnswerInputProps<TrueFalseQuestion>) {
  const [selected, setSelected] = useState<boolean | null>(draft?.value ?? null);
  useAnswerChannel(selected === null ? null : { type: 'true_false', value: selected }, channel);
  const select = (value: boolean) => {
    setSelected(value);
    onDraft?.({ type: 'true_false', value });
  };
  return <TrueFalseView question={question} selected={selected} onSelect={select} disabled={checked} checked={checked} />;
}
