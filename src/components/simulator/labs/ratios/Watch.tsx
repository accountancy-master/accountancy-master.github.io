'use client';

import { useMemo } from 'react';
import { WATCH_EXAMPLE } from '@/simulator/ratios/examples';
import { RATIOS, type RatioId } from '@/simulator/ratios/model';
import { watchSteps } from '@/simulator/ratios/steps';
import { Intro } from '../kit/LabShell';
import { PlaybackBar, Stage, StepNow } from '../kit/Playback';
import { usePlayback } from '../kit/usePlayback';
import { Dials, FocusPanel } from './Dials';
import { Statements } from './Statements';

/** Watch: every dial worked out in turn on a ready company, then three transactions moving the needles. */
export function Watch({ prefix }: { prefix: string }) {
  const steps = useMemo(() => watchSteps(WATCH_EXAMPLE.figures), []);
  const play = usePlayback(steps.length, { story: steps, stepMs: 4000 });
  const now = play.shown > 0 ? steps[play.shown - 1] : null;
  const figures = now?.figures ?? WATCH_EXAMPLE.figures;
  const lit = new Set<RatioId>(now && now.before ? RATIOS.map((r) => r.id) : RATIOS.slice(0, Math.max(0, play.shown - 1)).map((r) => r.id));

  return (
    <div className="flex flex-col gap-4">
      <Intro prefix={prefix}>
        {WATCH_EXAMPLE.figures.company}: {WATCH_EXAMPLE.point}
      </Intro>
      <PlaybackBar playback={play} prefix={prefix} announce={now ? `${now.headline}. ${now.text}` : ''} />
      <StepNow
        prefix={prefix}
        at={play.shown}
        count={steps.length}
        idle="Press Play: each dial is worked out in turn from the statements, its terms marked TOP and BOTTOM, and then three transactions move the needles."
      >
        {now ? (
          <>
            <p className="font-extrabold" data-testid={`${prefix}-step-headline`}>
              {now.headline}
            </p>
            <p>{now.text}</p>
          </>
        ) : null}
      </StepNow>
      <Stage prefix={prefix} label="The statements and the dials" playback={play} className="flex flex-col gap-4">
        {now?.focus ? <FocusPanel id={now.focus} figures={figures} before={now.before ?? null} prefix={prefix} /> : null}
        <div className="grid gap-4 xl:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] xl:items-start">
          <Statements figures={figures} before={now?.before ?? null} focus={now?.focus ?? null} prefix={prefix} />
          <Dials figures={figures} before={now?.before ?? null} focus={now?.focus ?? null} lit={lit} prefix={prefix} />
        </div>
      </Stage>
    </div>
  );
}
