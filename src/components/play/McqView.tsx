'use client';

import { useState } from 'react';
import type { McqQuestion } from '@/content/types';
import { ChoiceButton, type ChoiceMark } from './ChoiceButton';
import { useAnswerChannel, type AnswerInputProps } from './inputProps';

export function McqView({
  question,
  selected,
  onSelect,
  disabled,
  checked,
}: {
  question: McqQuestion;
  selected: string | null;
  onSelect(optionId: string): void;
  disabled: boolean;
  /** True once the answer has been checked or revealed: the right option and a wrong pick are marked. */
  checked: boolean;
}) {
  const markOf = (id: string): ChoiceMark =>
    !checked ? null : id === question.correct ? 'right' : id === selected ? 'wrong' : null;

  return (
    <div role="group" aria-label="Answer options" className="flex flex-col gap-3">
      {question.options.map((option, i) => (
        <ChoiceButton
          key={option.id}
          badge={'ABCD'[i] ?? String(i + 1)}
          selected={selected === option.id}
          mark={markOf(option.id)}
          disabled={disabled}
          onClick={() => onSelect(option.id)}
          data-testid={`mcq-option-${option.id}`}
        >
          {option.text}
        </ChoiceButton>
      ))}
    </div>
  );
}

/** The multiple-choice answer input: choosing an option is the answer. */
export function McqInput({ question, checked, draft, onDraft, ...channel }: AnswerInputProps<McqQuestion>) {
  const [selected, setSelected] = useState<string | null>(draft?.optionId ?? null);
  useAnswerChannel(selected === null ? null : { type: 'mcq', optionId: selected }, channel);
  const select = (optionId: string) => {
    setSelected(optionId);
    onDraft?.({ type: 'mcq', optionId });
  };
  return <McqView question={question} selected={selected} onSelect={select} disabled={checked} checked={checked} />;
}
