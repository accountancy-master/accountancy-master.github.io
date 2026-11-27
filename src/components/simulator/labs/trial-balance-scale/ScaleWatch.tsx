'use client';

import { useMemo, useState } from 'react';
import { formatINR } from '@/engine/money';
import { useReducedMotion } from '@/components/simulator/useReducedMotion';
import { ERRORS, findError, framesOf, isOneSided, KIRAN, WATCH_INPUTS, type ErrorCase, type ErrorId, type When } from '@/simulator/trial-balance-scale/scale';
import { SelectField, Toggle } from '../kit/LabControls';
import { PlaybackBar, Stage, StepNow } from '../kit/Playback';
import { usePlayback } from '../kit/usePlayback';
import { Rectification, SuspenseAccount, TrialBalanceAt } from './Board';
import { S, ScalePicture } from './Scale';

const CLASS_LABEL: Record<ErrorCase['cls'], string> = {
  omission: 'Error of omission',
  commission: 'Error of commission',
  principle: 'Error of principle',
  compensating: 'Compensating errors',
};

/** The error as a card: its title, its class, whether it is one-sided, and what happened. */
export function ErrorCard({ error, hide = false }: { error: ErrorCase; /** Keeps the class and the effect back, for a question about them. */ hide?: boolean }) {
  return (
    <div data-testid={`${S}-card`} className="flex flex-col gap-1 rounded-card border-2 border-dashed border-accent-deep bg-accent-soft px-4 py-3">
      <p className="flex flex-wrap items-center gap-2 text-xs font-extrabold uppercase tracking-wide text-accent-ink">
        {hide ? (
          <span>Error card</span>
        ) : (
          <>
            <span>{error.title}</span>
            <span aria-hidden="true">·</span>
            <span>{CLASS_LABEL[error.cls]}</span>
            <span aria-hidden="true">·</span>
            <span>{isOneSided(error) ? 'One-sided' : error.cls === 'compensating' ? 'Two errors that cancel' : 'Two-sided'}</span>
          </>
        )}
      </p>
      <p className="text-base text-ink">{error.text}</p>
    </div>
  );
}

/** "Found after the trial balance" or "before". Test ids `<prefix>-when-after` and `-before`. */
export function WhenSwitch({ when, onWhen, prefix }: { when: When; onWhen(w: When): void; prefix: string }) {
  return <Toggle options={(['after', 'before'] as const).map((w) => ({ value: w, label: `Found ${w} the trial balance` }))} value={when} onChange={onWhen} label="When the error is found" prefix={`${prefix}-when`} small />;
}

/** Before the error: the frame the scale starts from. */
export function BeforeTheError({ text }: { text: string }) {
  return (
    <>
      <p className="text-xs font-extrabold uppercase tracking-wide text-primary-ink">Before the error</p>
      <p className="text-ink">{text}</p>
    </>
  );
}

/** Watch: an error card on the books of Kiran Traders, played in three steps. */
export function ScaleWatch() {
  const [id, setId] = useState<ErrorId>('partial-omission');
  const [when, setWhen] = useState<When>('after');
  const reduced = useReducedMotion();
  const error = useMemo(() => findError(id)!.make(KIRAN, WATCH_INPUTS[id]), [id]);
  const frames = useMemo(() => framesOf(KIRAN, error, when), [error, when]);
  const story = useMemo(() => ({ id, when }), [id, when]);
  const count = frames.length - 1;
  const pb = usePlayback(count, {
    story,
    stepMs: reduced ? 1200 : 1400,
    run: (_, speed) => new Promise<void>((done) => window.setTimeout(done, reduced ? 0 : 800 / speed)),
  });
  // The frame on the scale: the one being moved to (so its transition plays), or the last one played.
  const at = pb.moving !== null ? pb.moving + 1 : pb.shown;
  const frame = frames[at];
  const last = frames[pb.shown];

  return (
    <div className="flex flex-col gap-3">
      <SelectField label="Error card" value={id} onChange={setId} options={ERRORS.map((e) => ({ id: e.id, label: e.title }))} testId={`${S}-example`} className="max-w-md" />
      <WhenSwitch when={when} onWhen={setWhen} prefix={S} />
      <ErrorCard error={error} />
      <PlaybackBar
        playback={pb}
        prefix={S}
        announce={pb.shown > 0 ? `Step ${pb.shown} of ${count}, ${last.label}. ${last.text} Debit ${formatINR(last.debit)}, credit ${formatINR(last.credit)}.` : ''}
      />
      <StepNow prefix={S} at={at} count={count} title={frame.label} idle={<BeforeTheError text={frames[0].text} />}>
        {frame.text}
      </StepNow>
      <Stage prefix={S} label="The scale" playback={pb}>
        <ScalePicture frame={frame} prev={at > 0 ? frames[at - 1] : null} reduced={reduced} />
      </Stage>
      <div className="grid gap-3 lg:grid-cols-2">
        <TrialBalanceAt books={KIRAN} frame={frame} />
        {when === 'after' && at >= 2 ? <SuspenseAccount error={error} closed={at >= 3} /> : null}
      </div>
      <Rectification error={error} highlight={when} />
    </div>
  );
}
