'use client';

import { useState } from 'react';
import { createRng, type Rng } from '@/engine/rng';
import { statementOf } from '@/simulator/cash-flow/model';
import { hiddenRows, markFigure, nextQuestion, trySeed, type ChoiceQuestion, type FigureQuestion, type TryKind } from '@/simulator/cash-flow/tryit';
import { useVisitSeed } from '../kit/format';
import { Toggle } from '../kit/LabControls';
import { AnswerField, ChoiceButton, ChoiceGroup, TryCard, useScore } from '../kit/TryIt';
import { StatementView } from './StatementView';
import { YEAR_END } from './Watch';

const KINDS: { value: TryKind; label: string }[] = [
  { value: 'activity', label: 'Which activity?' },
  { value: 'direction', label: 'Add or deduct?' },
  { value: 'figure', label: 'Work out a figure' },
];

/** The look of each answer, so that the choice reads like the picture: the three pipes, and the way the cash moves. */
const LOOK: Record<string, { label: string; accent: string }> = {
  operating: { label: 'Operating pipe', accent: 'border-l-8 border-l-hue-teal' },
  investing: { label: 'Investing pipe', accent: 'border-l-8 border-l-hue-violet' },
  financing: { label: 'Financing pipe', accent: 'border-l-8 border-l-hue-amber' },
  none: { label: '✕ Not a cash flow', accent: 'border-dashed' },
  add: { label: '▲ Add', accent: 'border-l-8 border-l-hue-green' },
  deduct: { label: '▼ Deduct', accent: 'border-l-8 border-l-danger' },
};

/** In a question on direction, "none" is "Not adjusted here", not "Not a cash flow". */
const lookOf = (kind: ChoiceQuestion['kind'], id: string, label: string) =>
  kind === 'direction' && id === 'none' ? { label, accent: 'border-dashed' } : (LOOK[id] ?? { label, accent: '' });

interface Run {
  rng: Rng;
  question: ChoiceQuestion | FigureQuestion;
}

const startRun = (seed: number, kind: TryKind): Run => {
  const rng = createRng(trySeed(seed, kind));
  return { rng, question: nextQuestion(kind, rng) };
};

/** Try it: a question of the chosen kind, answered on the picture, then the reason. Nothing is recorded. */
export function TryIt({ seed, prefix }: { seed?: number; prefix: string }) {
  const start = useVisitSeed(seed);
  const [kind, setKind] = useState<TryKind>('activity');
  const [run, setRun] = useState<Run>(() => startRun(start, 'activity'));
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
    const question = nextQuestion(kind, run.rng);
    setRun({ rng: run.rng, question });
    reset();
  };
  const choose = (id: string) => {
    if (q.kind === 'figure' || chosen !== null) return;
    setChosen(id);
    count(id === q.answer);
  };
  const check = () => {
    if (q.kind !== 'figure' || mark) return;
    const m = markFigure(q, typed);
    if (m.read === null) return;
    setMark(m);
    count(m.right);
  };
  const unreadable = q.kind === 'figure' && typed.trim() !== '' && markFigure(q, typed).read === null;
  const verdict = q.kind === 'figure' ? (mark ? { right: mark.right, reason: mark.why } : null) : chosen !== null ? { right: chosen === q.answer, reason: q.why } : null;

  return (
    <div className="flex flex-col gap-4">
      <Toggle options={KINDS} value={kind} onChange={switchKind} label="Kind of question" prefix={`${prefix}-kind`} small />
      <TryCard
        prefix={prefix}
        kind={q.kind}
        title={KINDS.find((k) => k.value === kind)!.label}
        score={score}
        prompt={q.prompt}
        item={q.kind !== 'figure' ? q.item : undefined}
        verdict={verdict}
        onCheck={q.kind === 'figure' ? check : undefined}
        canCheck={typed.trim() !== '' && !unreadable}
        onNext={next}
        skippable
      >
        {q.kind !== 'figure' ? (
          <ChoiceGroup label="Answers" className={q.kind === 'activity' ? 'grid grid-cols-2 gap-2 sm:grid-cols-4' : 'grid gap-2 sm:grid-cols-3'}>
            {q.options.map((o) => {
              const look = lookOf(q.kind, o.id, o.label);
              return (
                <ChoiceButton
                  key={o.id}
                  testId={`${prefix}-try-option-${o.id}`}
                  chosen={chosen === o.id}
                  mark={chosen === null ? null : o.id === q.answer ? 'right' : chosen === o.id ? 'wrong' : null}
                  disabled={chosen !== null}
                  onClick={() => choose(o.id)}
                  className={look.accent}
                >
                  {look.label}
                </ChoiceButton>
              );
            })}
          </ChoiceGroup>
        ) : (
          <AnswerField
            unit="rupee"
            value={typed}
            onChange={setTyped}
            testId={`${prefix}-try-answer`}
            disabled={mark !== null}
            onEnter={check}
            placeholder="e.g. 2,45,000"
            problem={unreadable ? 'Type the figure in rupees, for example 2,45,000, with a minus sign for a figure below nil.' : null}
          />
        )}
      </TryCard>

      {q.kind === 'figure' ? <FigurePicture q={q} answered={mark !== null} prefix={prefix} /> : null}
    </div>
  );
}

function FigurePicture({ q, answered, prefix }: { q: FigureQuestion; answered: boolean; prefix: string }) {
  const statement = statementOf(q.year);
  return (
    <StatementView
      statement={statement}
      title={`Cash Flow Statement of ${q.year.company} for the year ended ${YEAR_END}`}
      masked={answered ? new Set() : hiddenRows(q)}
      highlight={answered ? q.target : null}
      prefix={prefix}
    />
  );
}
