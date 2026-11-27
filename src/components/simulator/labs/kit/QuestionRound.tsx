'use client';

import { useState } from 'react';
import { mark, type Marked, type TryQuestion } from '@/simulator/tryit';
import { AnswerField, ChoiceButton, ChoiceGroup, TryCard, useScore } from './TryIt';

// A round of quick questions of the kind src/simulator/tryit.ts marks (an amount, a ratio, one option or every one
// that applies), one at a time on the kit's card, each marked at once with the working. When the round is over,
// `onMore` asks for another. Nothing is recorded.

/** The marker's note after the card's own "Right." or "Not quite.": "Not quite: the answer is ..." reads "The answer is ...". */
const tidy = (note: string) => note.replace(/^(?:Right|Not quite)[:,]\s*(.)/, (_, c: string) => c.toUpperCase());

export function QuestionRound({ prefix, questions, onMore }: { prefix: string; questions: readonly TryQuestion[]; onMore(): void }) {
  const [index, setIndex] = useState(0);
  const [text, setText] = useState('');
  const [picked, setPicked] = useState<number[]>([]);
  const [result, setResult] = useState<Marked | null>(null);
  const [score, count] = useScore();
  const [set, setSet] = useState(questions);
  if (set !== questions) {
    setSet(questions);
    setIndex(0);
    setText('');
    setPicked([]);
    setResult(null);
  }
  const q = questions[Math.min(index, questions.length - 1)];
  if (!q) return null;
  const a = q.answer;
  const answered = result !== null && !result.empty;

  const check = () => {
    if (answered) return;
    const m = mark(q, a.type === 'pick' ? { picked } : { text });
    setResult(m);
    if (!m.empty) count(m.right);
  };
  const next = () => {
    setText('');
    setPicked([]);
    setResult(null);
    if (index + 1 >= questions.length) {
      setIndex(0);
      onMore();
    } else setIndex(index + 1);
  };

  return (
    <TryCard
      prefix={prefix}
      kind={q.kind}
      title={q.label}
      progress={`Question ${index + 1} of ${questions.length}`}
      score={score}
      facts={q.facts}
      prompt={q.prompt}
      verdict={answered ? { right: result.right, answer: tidy(result.note), reason: q.why.map((w, i) => <p key={i}>{w}</p>) } : null}
      onCheck={check}
      canCheck={a.type === 'pick' ? picked.length > 0 : text.trim() !== ''}
      onNext={next}
    >
      {a.type === 'pick' ? (
        <ChoiceGroup label={a.many ? 'Pick every one that applies' : 'Pick one'}>
          {a.options.map((o, i) => {
            const on = picked.includes(i);
            const right = a.correct.includes(i);
            return (
              <ChoiceButton
                key={o}
                testId={`${prefix}-try-option-${i}`}
                chosen={on}
                mark={answered ? (right ? 'right' : on ? 'wrong' : null) : null}
                disabled={answered}
                onClick={() => setPicked((p) => (a.many ? (on ? p.filter((x) => x !== i) : [...p, i]) : [i]))}
              >
                {o}
              </ChoiceButton>
            );
          })}
        </ChoiceGroup>
      ) : (
        <AnswerField
          unit={a.type === 'amount' ? 'rupee' : 'ratio'}
          label={a.type === 'amount' ? 'Your answer' : `Your answer (${a.of.join(' : ')})`}
          placeholder={a.type === 'amount' ? undefined : a.terms.map((_, i) => i + 1).join(':')}
          value={text}
          onChange={(v) => {
            setText(v);
            if (result?.empty) setResult(null);
          }}
          testId={`${prefix}-try-answer`}
          disabled={answered}
          onEnter={check}
          problem={result?.empty ? result.note : null}
        />
      )}
    </TryCard>
  );
}
