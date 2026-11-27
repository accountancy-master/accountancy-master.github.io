'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { Button } from '@/components/ui/Button';
import { RECTIFYING, openingBalances, play, postLines, sameBooks, totalsOf } from '@/simulator/engine';
import { containerChangeWords, equationLine } from '@/simulator/explain';
import { endlessCase } from '@/simulator/plans';
import { mistakeQuestion } from '@/simulator/questions';
import type { MistakeCase, Scene } from '@/simulator/scenes';
import type { Played } from '@/simulator/types';
import { errorPhrase } from '@/simulator/errors';
import { JournalTable } from './Explanation';
import type { SimAnswer } from './record';
import { SimStage, type Speed } from './SimStage';

type Phase = 'wrong' | 'ask' | 'answered' | 'correcting' | 'restored';

/**
 * Find the mistake: a transaction recorded wrongly is played (a misplaced band, or a one-sided posting that tips the
 * equation and opens Suspense), the student names the error, and the correcting entry is played until the books are
 * as they should be.
 */
export function MistakeMode({
  scene,
  speed,
  onSpeed,
  record,
  plan,
  onResult,
  onFinished,
  seed,
}: {
  scene: Scene;
  speed: Speed;
  onSpeed(s: Speed): void;
  record(answer: SimAnswer): number;
  /** Where an endless run starts; drawn for the visit when left out. */
  seed?: number;
  plan?: readonly MistakeCase[];
  onResult?(r: { caseId: string; correct: boolean }): void;
  onFinished?(): void;
}) {
  const [start] = useState(() => seed ?? 1 + Math.floor(Math.random() * 900_000));
  const [n, setN] = useState(0);
  const current = useMemo(() => (plan ? plan[n] : endlessCase(scene, start, n)), [plan, scene, start, n]);
  const question = useMemo(() => mistakeQuestion(scene, current), [scene, current]);
  const before = useMemo(() => postLines(openingBalances(scene.opening.lines), current.setup ?? []), [scene, current]);
  const wrong = useMemo(() => play(scene, before, { id: `${current.id}-wrong`, text: current.recorded, lines: current.wrong }, { withSuspense: true }), [scene, before, current]);
  const right = useMemo(() => play(scene, before, { id: `${current.id}-right`, text: current.happened, lines: current.right }), [scene, before, current]);
  const corrected = useMemo(
    () => play(scene, wrong.after, { id: `${current.id}-correction`, kind: RECTIFYING, text: 'The rectifying entry is passed.', lines: current.correction, narration: current.narration }),
    [scene, wrong, current],
  );
  const [phase, setPhase] = useState<Phase>('wrong');
  const [picked, setPicked] = useState<string | null>(null);
  const [xp, setXp] = useState(0);
  const startedAt = useRef(0);
  useEffect(() => {
    startedAt.current = Date.now();
  }, [current]);
  const restored = sameBooks(corrected.after, right.after);
  const stagePlayed: Played = phase === 'correcting' || phase === 'restored' ? corrected : wrong;
  const right_ = picked === current.correct;
  const last = plan !== undefined && n >= plan.length - 1;

  const answer = () => {
    if (!picked) return;
    const correct = picked === current.correct;
    setXp(record({ question, correct, difficulty: 'complex', optionId: correct ? null : picked, timeMs: Date.now() - startedAt.current }));
    onResult?.({ caseId: current.id, correct });
    setPhase('answered');
  };
  const nextCase = () => {
    if (last) {
      onFinished?.();
      return;
    }
    setN(n + 1);
    setPhase('wrong');
    setPicked(null);
  };

  return (
    <div className="flex flex-col gap-4">
      <section aria-labelledby="mistake-case" className="flex flex-col gap-3 rounded-card border-2 border-accent bg-surface p-4 shadow-card">
        <h3 id="mistake-case" className="text-sm font-extrabold uppercase tracking-wide text-accent-ink">
          {plan ? `Mistake ${n + 1} of ${plan.length}` : 'Find the mistake'}
        </h3>
        <div className="grid gap-3 md:grid-cols-2">
          <div className="flex flex-col gap-1">
            <p className="text-sm font-bold text-muted">What happened</p>
            <p data-testid="mistake-happened" className="text-lg font-extrabold">
              {current.happened}
            </p>
          </div>
          <div className="flex flex-col gap-1">
            <p className="text-sm font-bold text-muted">How it was recorded</p>
            <p data-testid="mistake-recorded" className="text-base">
              {current.recorded}
            </p>
            {current.wrong.length > 0 ? <JournalTable lines={current.wrong} testId="mistake-wrong-entry" caption="What was posted" /> : <p className="text-sm italic text-muted">Nothing was posted.</p>}
          </div>
        </div>
      </section>

      <SimStage
        scene={scene}
        played={stagePlayed}
        speed={speed}
        onSpeed={onSpeed}
        onDone={() => {
          if (phase === 'wrong') setPhase('ask');
          if (phase === 'correcting') setPhase('restored');
        }}
        caption={
          <p data-testid="mistake-stage-caption" className="text-base font-extrabold">
            {phase === 'correcting' || phase === 'restored' ? 'The rectifying entry' : 'The entry as it was recorded'}
          </p>
        }
      />

      {phase !== 'wrong' ? (
        <section aria-labelledby="mistake-compare" className="grid gap-3 rounded-card border border-edge bg-surface p-4 shadow-card md:grid-cols-2">
          <h3 id="mistake-compare" className="sr-only">
            What the books show, and what they should show
          </h3>
          <div data-testid="mistake-as-recorded">
            <p className="text-sm font-extrabold uppercase tracking-wide text-danger-deep">As recorded</p>
            <ul className="text-sm">
              {[...scene.equation.left, ...scene.equation.right].map((id) => (
                <li key={id}>{containerChangeWords(scene, wrong, id)}</li>
              ))}
              {totalsOf(scene, wrong.after).suspense ? <li className="font-bold">Suspense A/c holds the difference.</li> : null}
            </ul>
          </div>
          <div data-testid="mistake-should-be">
            <p className="text-sm font-extrabold uppercase tracking-wide text-primary-ink">As it should be</p>
            <ul className="text-sm">
              {[...scene.equation.left, ...scene.equation.right].map((id) => (
                <li key={id}>{containerChangeWords(scene, right, id)}</li>
              ))}
            </ul>
          </div>
        </section>
      ) : null}

      {phase === 'ask' || phase === 'answered' || phase === 'correcting' || phase === 'restored' ? (
        <fieldset data-testid="mistake-question" className="flex flex-col gap-2 rounded-card border border-edge bg-surface p-4 shadow-card">
          <legend className="px-1 text-lg font-extrabold">{current.question}</legend>
          {current.options.map((o) => {
            const show = phase !== 'ask';
            const tone = show && o.id === current.correct ? 'border-primary bg-primary-soft' : show && o.id === picked ? 'border-danger bg-danger-soft' : 'border-edge-deep bg-surface';
            return (
              <label key={o.id} className={`flex cursor-pointer items-start gap-3 rounded-control border-2 p-3 ${tone}`}>
                <input type="radio" name="mistake-option" value={o.id} checked={picked === o.id} disabled={phase !== 'ask'} onChange={() => setPicked(o.id)} data-testid={`mistake-option-${o.id}`} className="mt-1 h-4 w-4" />
                <span className="text-base">
                  {o.text}
                  {show && o.id === picked && o.why ? <span className="mt-1 block text-sm font-bold text-danger-deep">{o.why}</span> : null}
                </span>
              </label>
            );
          })}
          {phase === 'ask' ? (
            <Button data-testid="mistake-check" disabled={!picked} onClick={answer} className="self-start">
              Check
            </Button>
          ) : (
            <div role="status" data-testid="mistake-feedback" data-correct={right_ ? 'true' : 'false'} className={`flex flex-col gap-1 rounded-control p-3 ${right_ ? 'bg-primary-soft text-primary-ink' : 'bg-danger-soft text-danger-deep'}`}>
              <p className="text-lg font-extrabold">{right_ ? `Right! +${xp} XP` : `Not quite: it is ${errorPhrase(current)}.`}</p>
              {current.explanation.map((line) => (
                <p key={line} className="text-base text-ink">
                  {line}
                </p>
              ))}
              {!right_ ? <p className="text-sm">This one is waiting in Mistakes, to try again later.</p> : null}
            </div>
          )}
        </fieldset>
      ) : null}

      {phase === 'answered' ? (
        <div className="flex flex-col gap-2 rounded-card border border-edge bg-surface p-4 shadow-card">
          <p className="text-sm font-extrabold uppercase tracking-wide text-primary-ink">The rectifying entry</p>
          <JournalTable lines={current.correction} narration={current.narration} testId="mistake-correction" caption="The rectifying entry" />
          <Button data-testid="mistake-correct" onClick={() => setPhase('correcting')} className="self-start">
            Put it right
          </Button>
        </div>
      ) : null}

      {phase === 'restored' ? (
        <div data-testid="mistake-restored" data-restored={restored ? 'true' : 'false'} className="flex flex-col gap-2 rounded-card bg-primary-soft p-4 text-primary-ink">
          <p className="text-lg font-extrabold">{restored ? '✓ The books are restored: they now hold exactly what the right entry would have made.' : 'The books still differ from what they should be.'}</p>
          <p className="text-sm font-bold">{equationLine(scene, totalsOf(scene, corrected.after))}</p>
          <Button data-testid="mistake-next" size="lg" onClick={nextCase} className="self-start">
            {plan && last ? 'See how you did' : 'Next mistake'}
          </Button>
        </div>
      ) : null}
    </div>
  );
}
