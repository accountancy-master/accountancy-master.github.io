'use client';

import { useMemo, useState, type ReactNode } from 'react';
import { useReducedMotion } from '@/components/simulator/useReducedMotion';
import type { Side } from '@/engine/accounts';
import { parseRupees } from '@/lib/money-input';
import { entryText, framesOf, gapOf, suspenseOf, type ErrorClass, type Tilt } from '@/simulator/trial-balance-scale/scale';
import { checkClass, checkEntry, checkSuspense, checkTip, makeScaleQuestion, SCALE_TRY_KINDS, type Feedback, type ScaleQuestion } from '@/simulator/trial-balance-scale/tryit';
import { Stage } from '../kit/Playback';
import { AnswerField, ChoiceButton, ChoiceGroup, TryCard, useScore, type Score } from '../kit/TryIt';
import { EntryTable } from './Board';
import { S, ScalePicture } from './Scale';
import { ErrorCard } from './ScaleWatch';

const TITLES: Record<ScaleQuestion['kind'], string> = {
  tip: 'Will it tip the scale?',
  suspense: 'Where does Suspense go?',
  entry: 'The rectifying entry',
  class: 'Which class of error?',
};

const PROMPTS: Record<ScaleQuestion['kind'], string> = {
  tip: 'The trial balance below agrees. This error is in the books: what does it do to the scale?',
  suspense: 'The error has tipped the scale, and the trial balance does not agree. On which pan does Suspense A/c go, and for how much?',
  entry: 'The error is found after the trial balance was prepared (Suspense A/c, if any, is on the scale). Which entry rectifies it?',
  class: 'Which class of error is it?',
};

/** Try it: four kinds of question in turn, answered on the scale. Nothing is recorded. */
export function ScaleTry({ seed }: { seed?: number }) {
  const [n, setN] = useState(0);
  const [score, count] = useScore();
  const base = seed ?? 1;
  const kind = SCALE_TRY_KINDS[n % SCALE_TRY_KINDS.length];
  const q = useMemo(() => makeScaleQuestion(base + n, kind), [base, n, kind]);
  return <Question key={n} q={q} n={n} score={score} onMarked={count} onNext={() => setN(n + 1)} />;
}

function Question({ q, n, score, onMarked, onNext }: { q: ScaleQuestion; n: number; score: Score; onMarked(right: boolean): void; onNext(): void }) {
  const reduced = useReducedMotion();
  const frames = useMemo(() => framesOf(q.books, q.error, 'after'), [q]);
  const [fb, setFb] = useState<Feedback | null>(null);
  const [tip, setTip] = useState<Tilt | null>(null);
  const [pan, setPan] = useState<Side | null>(null);
  const [amount, setAmount] = useState('');
  const [entry, setEntry] = useState<number | null>(null);
  const [cls, setCls] = useState<ErrorClass | null>(null);
  // The scale before the answer, and what it shows once answered.
  const shownAt = { tip: fb ? 1 : 0, suspense: fb ? 2 : 1, entry: fb ? 3 : 2, class: 1 }[q.kind];
  const frame = frames[shownAt];
  const g = gapOf(q.error);
  const settle = (f: Feedback) => {
    setFb(f);
    onMarked(f.right);
  };
  const marked = <T,>(id: T, right: T, chosen: T | null) => (fb ? (id === right ? 'right' : chosen === id ? 'wrong' : null) : null);

  let ask: ReactNode = null;
  let check: (() => void) | undefined;
  let ready = false;
  if (q.kind === 'tip') {
    const truth: Tilt = g === 0 ? 'level' : g > 0 ? 'Dr' : 'Cr';
    const opts: { id: Tilt; text: string }[] = [
      { id: 'level', text: 'It stays level' },
      { id: 'Dr', text: 'The debit pan goes down' },
      { id: 'Cr', text: 'The credit pan goes down' },
    ];
    ask = (
      <ChoiceGroup label="Your answer" className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
        {opts.map((o) => (
          <ChoiceButton
            key={o.id}
            testId={`${S}-try-tip-${o.id}`}
            chosen={tip === o.id}
            mark={marked(o.id, truth, tip)}
            disabled={fb !== null}
            onClick={() => {
              setTip(o.id);
              settle(checkTip(q, o.id));
            }}
          >
            {o.text}
          </ChoiceButton>
        ))}
      </ChoiceGroup>
    );
  } else if (q.kind === 'suspense') {
    const s = suspenseOf(q.error)!;
    ready = pan !== null && amount.trim() !== '';
    check = () => {
      if (pan && !fb) settle(checkSuspense(q, pan, parseRupees(amount)));
    };
    ask = (
      <div className="flex flex-col gap-2">
        <ChoiceGroup label="The pan for Suspense" className="flex flex-col gap-2 sm:flex-row">
          {(['Dr', 'Cr'] as const).map((p) => (
            <ChoiceButton key={p} testId={`${S}-try-pan-${p}`} chosen={pan === p} mark={marked(p, s.side, pan)} disabled={fb !== null} onClick={() => setPan(p)}>
              On the {p === 'Dr' ? 'debit' : 'credit'} pan
            </ChoiceButton>
          ))}
        </ChoiceGroup>
        <AnswerField unit="rupee" label="Suspense A/c" value={amount} onChange={setAmount} disabled={fb !== null} testId={`${S}-try-amount`} onEnter={() => ready && check?.()} />
      </div>
    );
  } else if (q.kind === 'entry') {
    ready = entry !== null;
    check = () => {
      if (entry !== null && !fb) settle(checkEntry(q, entry));
    };
    ask = (
      <ChoiceGroup label="Rectifying entries" className="grid gap-2 md:grid-cols-2">
        {q.entries.map((c, i) => (
          <ChoiceButton
            key={entryText(c.lines)}
            testId={`${S}-try-entry-${i}`}
            chosen={entry === i}
            mark={fb ? (c.why === null ? 'right' : entry === i ? 'wrong' : null) : null}
            disabled={fb !== null}
            onClick={() => setEntry(i)}
            className="font-normal"
          >
            <span className="sr-only">{entryText(c.lines)}</span>
            <span aria-hidden="true">
              <EntryTable lines={c.lines} narration={q.error.narration} testId={`${S}-try-entry-table-${i}`} />
            </span>
          </ChoiceButton>
        ))}
      </ChoiceGroup>
    );
  } else {
    const opts: { id: ErrorClass; text: string }[] = [
      { id: 'omission', text: 'Omission' },
      { id: 'commission', text: 'Commission' },
      { id: 'principle', text: 'Principle' },
      { id: 'compensating', text: 'Compensating' },
    ];
    ask = (
      <ChoiceGroup label="The class of error" className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {opts.map((o) => (
          <ChoiceButton
            key={o.id}
            testId={`${S}-try-class-${o.id}`}
            chosen={cls === o.id}
            mark={marked(o.id, q.error.cls, cls)}
            disabled={fb !== null}
            onClick={() => {
              setCls(o.id);
              settle(checkClass(q, o.id));
            }}
            className="text-center"
          >
            {o.text}
          </ChoiceButton>
        ))}
      </ChoiceGroup>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <TryCard
        prefix={S}
        kind={q.kind}
        title={TITLES[q.kind]}
        progress={`Question ${n + 1}`}
        score={score}
        prompt={PROMPTS[q.kind]}
        verdict={fb ? { right: fb.right, reason: fb.message } : null}
        onCheck={check}
        canCheck={ready}
        onNext={onNext}
        skippable
      >
        <ErrorCard error={q.error} hide={!fb && (q.kind === 'tip' || q.kind === 'class')} />
        {ask}
      </TryCard>
      <Stage prefix={S} label={`${q.books.business}: ${frame.label.toLowerCase()}`} shown={shownAt}>
        <p className="mb-1 text-center text-xs font-bold text-muted">
          {q.books.business}: {frame.label.toLowerCase()}
        </p>
        <ScalePicture frame={frame} prev={shownAt > 0 ? frames[shownAt - 1] : null} reduced={reduced} />
      </Stage>
    </div>
  );
}
