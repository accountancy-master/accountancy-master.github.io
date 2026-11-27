'use client';

import { useState, type ReactNode } from 'react';
import { answerText as defaultAnswerText, figureProblem, judge as defaultJudge, readyToMark, type Given, type AnyAnswer, type CardAsk, type KitTag, type Verdict } from './answers';
import { AnswerField, ChoiceButton, ChoiceGroup, TryCard, useScore, type AnswerUnit } from './TryIt';

// A quick question asked on a lab's picture, answered at once with the reason: an amount in rupees, a percentage or
// a ratio (with the word that goes with it, where one is asked), one option, or every option that applies. Nothing
// is recorded. A lab whose marking is its own passes `judge` (and `answerText`). Test ids `<prefix>-try-...`.

const UNIT: Record<'number' | 'percent' | 'ratio', AnswerUnit> = { number: 'rupee', percent: 'percent', ratio: 'ratio' };

export function TryItCard({
  ask,
  prefix,
  onAnswered,
  onNext,
  title,
  judge = defaultJudge,
  answerText = defaultAnswerText,
}: {
  ask: CardAsk;
  prefix: string;
  onAnswered?(v: Verdict): void;
  onNext(): void;
  /** The kind of question, shown above it. */
  title?: ReactNode;
  judge?: (answer: AnyAnswer, given: Given) => Verdict;
  answerText?: (answer: AnyAnswer) => string;
}) {
  const [typed, setTyped] = useState('');
  const [tag, setTag] = useState<string | null>(null);
  const [choice, setChoice] = useState<string | null>(null);
  const [picked, setPicked] = useState<string[]>([]);
  const [verdict, setVerdict] = useState<Verdict | null>(null);
  const [score, count] = useScore();
  const [current, setCurrent] = useState(ask);
  if (current !== ask) {
    setCurrent(ask);
    setTyped('');
    setTag(null);
    setChoice(null);
    setPicked([]);
    setVerdict(null);
  }
  const a = ask.answer;
  const given: Given = { typed, tag, choice, picked };
  const ready = readyToMark(a, given);
  const locked = verdict !== null;
  const check = () => {
    if (!ready || locked) return;
    const v = judge(a, given);
    setVerdict(v);
    count(v.right);
    onAnswered?.(v);
  };
  const markOf = (right: boolean, on: boolean) => (!locked ? null : right ? 'right' : on ? 'wrong' : null);

  let answer: ReactNode;
  if (a.type === 'choice' || a.type === 'multi') {
    const many = a.type === 'multi';
    answer = (
      <ChoiceGroup label={many ? 'Pick every one that applies' : 'Pick one'} className="flex flex-wrap gap-2">
        {a.options.map((o) => {
          const on = many ? picked.includes(o.id) : choice === o.id;
          const right = many ? a.correct.includes(o.id) : a.correct === o.id;
          return (
            <ChoiceButton
              key={o.id}
              testId={`${prefix}-try-option-${o.id}`}
              chosen={on}
              mark={markOf(right, on)}
              disabled={locked}
              onClick={() => (many ? setPicked(on ? picked.filter((x) => x !== o.id) : [...picked, o.id]) : setChoice(o.id))}
            >
              {o.text}
            </ChoiceButton>
          );
        })}
      </ChoiceGroup>
    );
  } else {
    const t: KitTag | undefined = a.type === 'ratio' ? undefined : a.tag;
    answer = (
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
        <AnswerField unit={UNIT[a.type]} value={typed} onChange={setTyped} testId={`${prefix}-try-answer`} disabled={locked} onEnter={check} problem={locked ? null : figureProblem(a, typed)} />
        {t ? (
          <ChoiceGroup label={t.label}>
            {t.options.map((o) => (
              <ChoiceButton key={o.id} testId={`${prefix}-try-tag-${o.id}`} chosen={tag === o.id} mark={markOf(o.id === t.correct, tag === o.id)} disabled={locked} onClick={() => setTag(o.id)}>
                {o.text}
              </ChoiceButton>
            ))}
          </ChoiceGroup>
        ) : null}
      </div>
    );
  }

  return (
    <TryCard
      prefix={prefix}
      title={title}
      score={score}
      prompt={ask.prompt}
      verdict={verdict ? { right: verdict.right, answer: verdict.right ? null : `The answer is ${answerText(a)}.`, slip: verdict.why, reason: ask.reason } : null}
      onCheck={check}
      canCheck={ready}
      onNext={onNext}
    >
      {answer}
    </TryCard>
  );
}
