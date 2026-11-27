'use client';

import { useMemo, useRef, useState } from 'react';
import { useReducedMotion } from '@/components/simulator/useReducedMotion';
import { ledgerOf, postingSteps } from '@/simulator/posting/ledger';
import { findReady, READY } from '@/simulator/posting/story';
import { SelectField } from '../kit/LabControls';
import { Intro } from '../kit/LabShell';
import { PlaybackBar, Stage, StepNow } from '../kit/Playback';
import { usePlayback } from '../kit/usePlayback';
import { P } from './parts';
import { BoardFormat, pictureOf, PostingStage, runPostingStep } from './Stage';

const KIND_TITLE = { post: 'posting', balance: 'balancing', tb: 'the trial balance', agree: 'the trial balance' } as const;

/** Watch: a ready month played line by line into the ledger, balanced, and taken to the trial balance. */
export function PostingWatch() {
  const [storyId, setStoryId] = useState(READY[0].id);
  const reduced = useReducedMotion();
  const story = findReady(storyId)!;
  const ledger = useMemo(() => ledgerOf(story), [story]);
  const steps = useMemo(() => postingSteps(story), [story]);
  const root = useRef<HTMLDivElement>(null);
  const pb = usePlayback(steps.length, {
    story,
    stepMs: reduced ? 700 : 500,
    run: (i, speed) => runPostingStep(root.current, steps, ledger, i, reduced ? 0 : 1000 / speed),
  });
  const pic = pictureOf(steps, pb.shown, pb.moving);
  const at = pb.moving ?? (pb.shown > 0 ? pb.shown - 1 : null);
  const s = at === null ? null : steps[at];
  const last = pb.shown > 0 ? steps[pb.shown - 1] : null;

  return (
    <div className="flex flex-col gap-3">
      <SelectField label="Example" value={storyId} onChange={setStoryId} options={READY.map((r) => ({ id: r.id, label: r.title }))} testId={`${P}-example`} className="max-w-md" />
      <Intro prefix={P}>{story.about} The month is April 2026; the accounts are balanced on 30 April and the trial balance is prepared that day.</Intro>
      <PlaybackBar playback={pb} prefix={P} announce={last ? `Step ${pb.shown} of ${steps.length}. ${last.text}` : ''} />
      <StepNow
        prefix={P}
        at={at === null ? 0 : at + 1}
        count={steps.length}
        title={s ? KIND_TITLE[s.kind] : undefined}
        idle={
          <>
            Press Play. Each line of the journal flies to its account: a debit to the debit side with &quot;To&quot;, a credit to the credit side with &quot;By&quot;, each naming the other account of the entry.
            Then every account is balanced, and the balances make the trial balance.
          </>
        }
      >
        {s ? (
          <>
            <p>{s.text}</p>
            {s.kind === 'post' ? (
              <p className="mt-1 text-sm">
                <span className="font-extrabold">Why: </span>
                {s.reason}
              </p>
            ) : null}
          </>
        ) : null}
      </StepNow>
      <Stage prefix={P} label="The books" playback={pb}>
        <PostingStage ref={root} story={story} ledger={ledger} pic={pic} />
      </Stage>
      <BoardFormat key={story.id} ledger={ledger} />
    </div>
  );
}
