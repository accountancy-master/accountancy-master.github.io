'use client';

import { useMemo, useState } from 'react';
import { Button } from '@/components/ui/Button';
import { useReducedMotion } from '@/components/simulator/useReducedMotion';
import { formatINR, type Paise } from '@/engine/money';
import { createRng } from '@/engine/rng';
import { parseRupees } from '@/lib/money-input';
import { booksFromSeed, ERRORS, findError, framesOf, KIRAN, problemOf, WATCH_INPUTS, type ErrorId, type ErrorInput, type ScaleBooks, type When } from '@/simulator/trial-balance-scale/scale';
import { Rectification, SuspenseAccount, TrialBalanceAt } from './Board';
import { S, ScalePicture } from './Scale';
import { Toggle } from '../kit/LabControls';
import { Stage, StepNow } from '../kit/Playback';
import { BeforeTheError, ErrorCard, WhenSwitch } from './ScaleWatch';

const text = (p: Paise | undefined) => (p === undefined ? '' : formatINR(p).slice(1));

/** Play: choose the error card and its figures, when it is found, and step through what happens to the scale. */
export function ScalePlay({ seed }: { seed?: number }) {
  const reduced = useReducedMotion();
  const [books, setBooks] = useState<ScaleBooks>(KIRAN);
  const [nextSeed, setNextSeed] = useState(seed ?? 1);
  const [id, setId] = useState<ErrorId>('wrong-side');
  const [input, setInput] = useState<ErrorInput>(WATCH_INPUTS['wrong-side']);
  const [amountText, setAmountText] = useState(text(input.amount));
  const [wrongText, setWrongText] = useState(text(input.wrongAs));
  const [problem, setProblem] = useState<string | null>(null);
  const [when, setWhen] = useState<When>('after');
  const [at, setAt] = useState(1);
  const spec = findError(id)!;
  const error = useMemo(() => spec.make(books, input), [spec, books, input]);
  const frames = useMemo(() => framesOf(books, error, when), [books, error, when]);
  const frame = frames[at];

  const choose = (b: ScaleBooks, e: ErrorId, figures: ErrorInput) => {
    setBooks(b);
    setId(e);
    setInput(figures);
    setAmountText(text(figures.amount));
    setWrongText(text(figures.wrongAs));
    setProblem(null);
    setAt(1);
  };
  const figuresFor = (b: ScaleBooks, e: ErrorId, s: number): ErrorInput => {
    if (b === KIRAN) return WATCH_INPUTS[e];
    const rng = createRng(s);
    for (;;) {
      const f = findError(e)!.sample(rng, b);
      if (problemOf(b, findError(e)!.make(b, f), f) === null) return f;
    }
  };
  const typed = (amountT: string, wrongT: string) => {
    setAmountText(amountT);
    setWrongText(wrongT);
    const amount = parseRupees(amountT);
    const wrongAs = spec.wrongAsLabel ? parseRupees(wrongT) : undefined;
    if (amount === null || amount % 100 !== 0 || (spec.wrongAsLabel && (wrongAs === null || wrongAs! % 100 !== 0))) {
      setProblem('Type each figure in whole rupees, such as 4,500.');
      return;
    }
    const next: ErrorInput = spec.wrongAsLabel ? { amount, wrongAs: wrongAs! } : { amount };
    const wrong = problemOf(books, spec.make(books, next), next);
    setProblem(wrong);
    if (!wrong) setInput(next);
  };

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-2 rounded-card border border-edge bg-surface p-3 shadow-card">
        <div className="flex flex-wrap items-center gap-2">
          <p className="text-sm font-extrabold">Books of {books.business}</p>
          <Button variant="secondary" data-testid={`${S}-play-kiran`} onClick={() => choose(KIRAN, id, WATCH_INPUTS[id])}>
            Kiran Traders
          </Button>
          <Button
            variant="secondary"
            data-testid={`${S}-play-new`}
            onClick={() => {
              const b = booksFromSeed(nextSeed);
              choose(b, id, figuresFor(b, id, nextSeed));
              setNextSeed(nextSeed + 1);
            }}
          >
            New figures
          </Button>
        </div>
        <fieldset className="flex flex-col gap-1">
          <legend className="text-sm font-extrabold">Error card</legend>
          <div className="flex flex-wrap gap-2">
            {ERRORS.map((e) => (
              <button
                key={e.id}
                type="button"
                aria-pressed={id === e.id}
                data-testid={`${S}-play-card-${e.id}`}
                onClick={() => choose(books, e.id, figuresFor(books, e.id, nextSeed))}
                className={`min-h-11 rounded-control border-2 px-3 text-sm font-bold ${id === e.id ? 'border-accent-deep bg-accent-soft text-accent-ink' : 'border-edge-deep bg-surface text-ink hover:bg-sunken'}`}
              >
                {e.title}
              </button>
            ))}
          </div>
        </fieldset>
        <div className="flex flex-wrap gap-3">
          <label className="flex w-44 flex-col gap-1 text-sm font-bold">
            {spec.amountLabel}
            <input
              value={amountText}
              onChange={(e) => typed(e.target.value, wrongText)}
              inputMode="numeric"
              data-testid={`${S}-play-amount`}
              className="min-h-11 rounded-control border-2 border-edge-deep bg-surface px-2 text-base tabular-nums"
            />
          </label>
          {spec.wrongAsLabel ? (
            <label className="flex w-52 flex-col gap-1 text-sm font-bold">
              {spec.wrongAsLabel}
              <input
                value={wrongText}
                onChange={(e) => typed(amountText, e.target.value)}
                inputMode="numeric"
                data-testid={`${S}-play-wrong`}
                className="min-h-11 rounded-control border-2 border-edge-deep bg-surface px-2 text-base tabular-nums"
              />
            </label>
          ) : null}
        </div>
        {problem ? (
          <p role="alert" data-testid={`${S}-play-problem`} className="rounded-control bg-danger-soft px-3 py-2 text-sm font-bold text-danger-deep">
            {problem} The picture keeps the last figures that fit.
          </p>
        ) : null}
        <WhenSwitch when={when} onWhen={setWhen} prefix={`${S}-play`} />
      </div>

      <ErrorCard error={error} />

      <Toggle
        options={frames.map((fr, i) => ({ value: String(i), label: `${i}. ${fr.label}` }))}
        value={String(at)}
        onChange={(v) => setAt(Number(v))}
        label="Stage"
        prefix={`${S}-play-frame`}
        small
      />
      <StepNow prefix={`${S}-play`} at={at} count={frames.length - 1} title={frame.label} idle={<BeforeTheError text={frame.text} />} live>
        {frame.text}
      </StepNow>
      <Stage prefix={S} label="The scale" shown={at}>
        <ScalePicture frame={frame} prev={at > 0 ? frames[at - 1] : null} reduced={reduced} />
      </Stage>
      <div className="grid gap-3 lg:grid-cols-2">
        <TrialBalanceAt books={books} frame={frame} />
        {when === 'after' && at >= 2 ? <SuspenseAccount error={error} closed={at >= 3} /> : null}
      </div>
      <Rectification error={error} highlight={when} />
    </div>
  );
}
