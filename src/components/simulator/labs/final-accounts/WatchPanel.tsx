'use client';

import { useMemo, useState } from 'react';
import { MEERA } from '@/simulator/final-accounts/examples';
import { adjKey, finalAccounts } from '@/simulator/final-accounts/model';
import { ORDINALS, partOne, partTwo, stepWords, type WalkStep } from '@/simulator/final-accounts/walk';
import { Toggle } from '../kit/LabControls';
import { PlaybackBar, Stage, StepList, StepNow } from '../kit/Playback';
import { usePlayback } from '../kit/usePlayback';
import { Board, T } from './Board';

// ---------------------------------------------------------------------------------------------------------------
// Watch: the ready example played step by step. Part one sorts the trial balance into the three statements; part
// two makes the adjustments one at a time. The first step of each part is where it starts (the trial balance, or
// the accounts before the adjustments); each step after it is told in words and announced, and what it changes
// flies in.
// ---------------------------------------------------------------------------------------------------------------

const PARTS = [
  { value: 'one', label: 'Part 1: trial balance to final accounts' },
  { value: 'two', label: 'Part 2: the adjustments and their effects' },
] as const;
type PartId = (typeof PARTS)[number]['value'];

/** What a step says: its words, the effects of an adjustment, and what it comes to. */
function Told({ step }: { step: WalkStep }) {
  return (
    <>
      <p>{step.text}</p>
      {step.effects ? (
        <ol data-testid={`${T}-step-effects`} className="mt-2 flex flex-col gap-1 text-sm">
          {step.effects.map((e, i) => (
            <li key={i}>
              <span className="font-extrabold">
                {['①', '②', '③', '④'][i]} {ORDINALS[i]} effect.
              </span>{' '}
              {e}
            </li>
          ))}
        </ol>
      ) : null}
      {step.result ? <p className="mt-2 text-sm font-semibold">{step.result}</p> : null}
    </>
  );
}

export function WatchPanel({ reduced }: { reduced: boolean }) {
  const business = MEERA;
  const [part, setPart] = useState<PartId>('one');
  const steps = useMemo(() => (part === 'one' ? partOne(business) : partTwo(business)), [business, part]);
  const statements = useMemo(() => steps.map((s) => finalAccounts(business, s.state)), [business, steps]);
  // The first step is where the part starts; the walk-through plays the ones after it, each given time to be read.
  const playback = usePlayback(steps.length - 1, { story: steps, stepMs: (at) => Math.max(2600, stepWords(steps[at]).length * 30) });
  const at = playback.shown;
  const step = steps[at];
  // The step the picture came from: what is new since then flies in. Null after a jump: nothing moves.
  const from = playback.advanced !== null && playback.advanced === at - 1 ? at - 1 : null;

  const made = new Set(step.state.adjustments.map(adjKey));
  const cards = business.adjustments.filter((a) => part === 'two' || a.type === 'closingStock').map((a) => ({ adjustment: a, made: made.has(adjKey(a)) }));

  return (
    <div className="flex flex-col gap-3">
      <Toggle options={PARTS} value={part} onChange={setPart} label="Part of the walk-through" prefix={`${T}-watch-part`} small />
      <PlaybackBar playback={playback} prefix={T} announce={at > 0 ? `Step ${at} of ${steps.length - 1}: ${step.title}. ${stepWords(step)}` : ''} />
      <StepNow
        prefix={T}
        at={at}
        count={steps.length - 1}
        title={step.title}
        idle={
          <div className="text-ink">
            <p className="text-xs font-extrabold uppercase tracking-wide text-primary-ink">{steps[0].title}</p>
            <Told step={steps[0]} />
          </div>
        }
      >
        <Told step={step} />
      </StepNow>
      <Stage prefix={T} label="The picture" playback={playback}>
        <Board business={business} state={step.state} statements={statements[at]} before={from === null ? null : statements[from]} cards={cards} reduced={reduced} speed={playback.speed} />
      </Stage>
      <StepList steps={steps.slice(1).map((s) => ({ title: s.title }))} shown={at} prefix={T} onPick={(i) => playback.seek(i + 1)} />
    </div>
  );
}
