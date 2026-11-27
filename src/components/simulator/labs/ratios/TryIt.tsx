'use client';

import { useState } from 'react';
import { createRng, type Rng } from '@/engine/rng';
import { ratioDef } from '@/simulator/ratios/model';
import { markCompute, nextQuestion, parseRatio, trySeed, type RatioQuestion, type TryKind } from '@/simulator/ratios/tryit';
import { useVisitSeed } from '../kit/format';
import { Toggle } from '../kit/LabControls';
import { AnswerField, ChoiceButton, ChoiceGroup, TryCard, useScore } from '../kit/TryIt';
import { Dials, FocusPanel } from './Dials';
import { Statements } from './Statements';

const KINDS: { value: TryKind; label: string }[] = [
  { value: 'effect', label: 'Up, down or no change?' },
  { value: 'compute', label: 'Work out a ratio' },
  { value: 'term', label: 'Which term?' },
];

const LOOK: Record<string, string> = { up: '▲ Increase', down: '▼ Decrease', same: '= No change' };

interface Run {
  rng: Rng;
  question: RatioQuestion;
}
const startRun = (seed: number, kind: TryKind): Run => {
  const rng = createRng(trySeed(seed, kind));
  return { rng, question: nextQuestion(kind, rng) };
};

/** Try it: a question on the statements and dials on screen, the answer shown on them at once. Nothing is recorded. */
export function TryIt({ seed, prefix }: { seed?: number; prefix: string }) {
  const start = useVisitSeed(seed);
  const [kind, setKind] = useState<TryKind>('effect');
  const [run, setRun] = useState<Run>(() => startRun(start, 'effect'));
  const [chosen, setChosen] = useState<string | null>(null);
  const [typed, setTyped] = useState('');
  const [mark, setMark] = useState<{ right: boolean; why: string } | null>(null);
  const [score, count] = useScore();
  const q = run.question;

  const reset = () => {
    setChosen(null);
    setTyped('');
    setMark(null);
  };
  const switchKind = (k: TryKind) => {
    setKind(k);
    setRun(startRun(start, k));
    reset();
  };
  const next = () => {
    setRun({ rng: run.rng, question: nextQuestion(kind, run.rng) });
    reset();
  };
  const choose = (id: string) => {
    if (q.kind === 'compute' || chosen !== null) return;
    setChosen(id);
    count(id === q.answer);
  };
  const check = () => {
    if (q.kind !== 'compute' || mark || parseRatio(typed) === null) return;
    const m = markCompute(q, typed);
    setMark(m);
    count(m.right);
  };
  const unreadable = typed.trim() !== '' && parseRatio(typed) === null;

  // What the picture shows: the figures asked on; after an answer on a transaction, the figures after it.
  const showAfter = q.kind === 'effect' && chosen !== null;
  const figures = showAfter ? q.after : q.figures;
  const focus = q.kind === 'effect' ? q.ratio : q.kind === 'compute' && mark ? q.ratio : null;
  const unit = q.kind === 'compute' ? ratioDef(q.ratio).unit : null;
  const verdict =
    q.kind === 'compute'
      ? mark
        ? { right: mark.right, reason: mark.why }
        : null
      : chosen !== null
        ? { right: chosen === q.answer, reason: q.why, note: q.kind === 'effect' ? 'The statements and the dials below now show the figures after the transaction.' : null }
        : null;

  return (
    <div className="flex flex-col gap-4">
      <Toggle options={KINDS} value={kind} onChange={switchKind} label="Kind of question" prefix={`${prefix}-kind`} small />
      <TryCard
        prefix={prefix}
        kind={q.kind}
        title={KINDS.find((k) => k.value === kind)!.label}
        score={score}
        prompt={q.prompt}
        item={q.kind === 'term' ? q.item : undefined}
        verdict={verdict}
        onCheck={q.kind === 'compute' ? check : undefined}
        canCheck={typed.trim() !== '' && !unreadable}
        onNext={next}
        skippable
      >
        {q.kind !== 'compute' ? (
          <ChoiceGroup label="Answers" className={q.kind === 'effect' ? 'grid gap-2 sm:grid-cols-3' : 'grid gap-2 sm:grid-cols-2 lg:grid-cols-3'}>
            {q.options.map((o) => (
              <ChoiceButton
                key={o.id}
                testId={`${prefix}-try-option-${o.id}`}
                chosen={chosen === o.id}
                mark={chosen === null ? null : o.id === q.answer ? 'right' : chosen === o.id ? 'wrong' : null}
                disabled={chosen !== null}
                onClick={() => choose(o.id)}
              >
                {LOOK[o.id] ?? o.label}
              </ChoiceButton>
            ))}
          </ChoiceGroup>
        ) : (
          <AnswerField
            unit={unit === 'ratio' ? 'to-one' : unit === 'times' ? 'times' : 'percent'}
            value={typed}
            onChange={setTyped}
            testId={`${prefix}-try-answer`}
            disabled={mark !== null}
            onEnter={check}
            placeholder="e.g. 1.25"
            problem={unreadable ? 'Type a number, such as 1.25.' : null}
          />
        )}
      </TryCard>

      {q.kind !== 'term' ? (
        <>
          {focus ? <FocusPanel id={focus} figures={figures} before={showAfter ? q.figures : null} prefix={prefix} /> : null}
          <div className="grid gap-4 xl:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] xl:items-start">
            <Statements figures={figures} before={showAfter ? q.figures : null} focus={q.kind === 'compute' && !mark ? null : focus} prefix={prefix} />
            <Dials figures={figures} before={showAfter ? q.figures : null} focus={focus} masked={q.kind === 'compute' && !mark ? q.ratio : null} prefix={prefix} />
          </div>
        </>
      ) : (
        <Statements figures={q.figures} focus={null} prefix={prefix} />
      )}
    </div>
  );
}
