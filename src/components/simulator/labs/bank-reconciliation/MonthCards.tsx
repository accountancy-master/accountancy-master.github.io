'use client';

import { formatINR } from '@/engine/money';
import { CAUSE_TEXT, factsOf, recordedOf, type Item, type Scenario } from '@/simulator/bank-reconciliation/books';
import { Arrive } from '../kit/Arrive';
import type { Marks } from './Books';

// The month as a timeline of cards, one for each item that is in one book and not the other: its day, what it is,
// which book has it, and why. In Play each card has Add and Less, to carry it into the statement.

const inr = formatINR;

export interface CardState {
  /** "In the statement: Add" / "Entered in the cash book". */
  status?: string;
  /** Feedback on a wrong carry. */
  wrong?: string;
}

export function MonthCards({
  s,
  items,
  marks,
  states,
  onCarry,
  showWhy,
  causes = true,
  reduced,
}: {
  s: Scenario;
  items: readonly Item[];
  marks: Marks;
  states?: Record<string, CardState>;
  /** Given in Play: the learner carries a card with Add or Less. */
  onCarry?: (id: string, how: 'add' | 'less') => void;
  /** Which cards show their reason: all, the lit ones, or none. */
  showWhy: 'all' | 'lit' | 'done' | 'none';
  /** Show what kind of difference each card is (not while a question asks it). */
  causes?: boolean;
  reduced: boolean;
}) {
  const sorted = [...items].sort((a, b) => a.day - b.day);
  return (
    <section aria-labelledby="brs-month-title" data-testid="lab-bank-reconciliation-month" className="flex flex-col gap-2 rounded-card border border-edge bg-surface p-3 shadow-card">
      <h3 id="brs-month-title" className="text-base font-extrabold">
        What happened in {s.month} that the two books do not show alike
      </h3>
      <ol className="relative flex flex-col gap-2 border-l-2 border-edge-deep pl-4">
        {sorted.map((i) => {
          const f = factsOf(i, s);
          const lit = marks.lit.has(i.id);
          const done = marks.done.has(i.id);
          const state = states?.[i.id];
          const why = showWhy === 'all' || (showWhy === 'lit' && lit) || (showWhy === 'done' && (done || !!state?.wrong || !!state?.status));
          const inCb = f.inCb ? (i.kind === 'cbError' ? inr(recordedOf(i)) : '✓') : i.kind === 'bankError' ? '✗ no entry (the bank is wrong)' : '✗ not yet';
          const inPb = f.inPb ? (i.kind === 'cbError' ? inr(i.paid ?? 0) : '✓') : '✗ not yet';
          return (
            <li key={i.id} data-testid={`lab-bank-reconciliation-card-${i.id}`} data-done={done ? 'true' : 'false'} className="relative">
              <span aria-hidden="true" className={`absolute -left-[1.4rem] top-3 h-3 w-3 rounded-full border-2 border-surface ${done ? 'bg-primary' : lit ? 'bg-accent' : 'bg-edge-deep'}`} />
              <Arrive
                key={done ? 'done' : 'open'}
                reduced={reduced}
                from={done ? 'translateX(-0.75rem)' : 'none'}
                className={`flex flex-col gap-1.5 rounded-control border-2 p-2.5 text-sm ${lit ? 'border-accent bg-accent-soft' : done ? 'border-edge bg-sunken' : 'border-edge bg-surface'}`}
              >
                <span className="flex flex-wrap items-baseline justify-between gap-x-2">
                  <span className="font-extrabold">
                    <span className="mr-1.5 inline-block rounded bg-surface px-1 text-xs ring-1 ring-edge-deep">{marks.letter.get(i.id)}</span>
                    {i.day} {s.month.slice(0, 3)} · {f.title}
                  </span>
                  <span className="font-extrabold tabular-nums">{inr(i.amount)}</span>
                </span>
                <span className="flex flex-wrap gap-1.5 text-xs font-bold">
                  <span className={`rounded-full px-2 py-0.5 ${f.inCb ? 'bg-hue-blue-soft text-hue-blue' : 'bg-sunken text-muted ring-1 ring-edge'}`}>Cash Book {inCb}</span>
                  <span className={`rounded-full px-2 py-0.5 ${f.inPb ? 'bg-hue-violet-soft text-hue-violet' : 'bg-sunken text-muted ring-1 ring-edge'}`}>Pass Book {inPb}</span>
                  {causes ? <span className="rounded-full bg-sunken px-2 py-0.5 text-muted ring-1 ring-edge">{CAUSE_TEXT[f.cause]}</span> : null}
                </span>
                {why ? <span className="text-muted">{f.why}</span> : null}
                {state?.status ? (
                  <span data-testid={`lab-bank-reconciliation-card-${i.id}-status`} className="font-extrabold text-primary-ink">
                    ✓ {state.status}
                  </span>
                ) : null}
                {onCarry && !done && !state?.status ? (
                  <span className="flex flex-wrap items-center gap-2">
                    <span className="text-xs font-bold text-muted">Carry it into the statement:</span>
                    {(['add', 'less'] as const).map((how) => (
                      <button
                        key={how}
                        type="button"
                        data-testid={`lab-bank-reconciliation-card-${i.id}-${how}`}
                        onClick={() => onCarry(i.id, how)}
                        className="min-h-11 rounded-control border-2 border-b-4 border-edge-deep bg-surface px-4 text-base font-extrabold hover:bg-canvas active:translate-y-0.5 active:border-b-2"
                      >
                        {how === 'add' ? 'Add' : 'Less'}
                      </button>
                    ))}
                  </span>
                ) : null}
                {state?.wrong ? (
                  <span role="alert" data-testid={`lab-bank-reconciliation-card-${i.id}-wrong`} className="rounded bg-danger-soft px-2 py-1 font-semibold text-danger-deep">
                    ✗ {state.wrong}
                  </span>
                ) : null}
              </Arrive>
            </li>
          );
        })}
      </ol>
    </section>
  );
}
