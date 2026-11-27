'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { Button } from '@/components/ui/Button';
import { Pills } from '@/components/ui/Pills';
import { openingBalances } from '@/simulator/engine';
import { describeEffect } from '@/simulator/explain';
import { LEVEL_DIFFICULTY, PREDICT_LEVELS, accountChoices, isComplete, markPrediction, markWords, type Marked, type PredictLevel, type Prediction, type SideKey } from '@/simulator/predict';
import { predictionQuestion } from '@/simulator/questions';
import type { Scene } from '@/simulator/scenes';
import type { Played, SimTransaction } from '@/simulator/types';
import { Explanation } from './Explanation';
import { PredictForm, amountsFrom } from './PredictForm';
import type { SimAnswer } from './record';
import { SimStage, type Speed } from './SimStage';
import { SOURCE_LABEL, useSource, type SourceId } from './useSource';
import { FRESH_NOTE, atRest, playOn } from './WatchMode';

type Phase = 'predict' | 'playing' | 'marked';

export interface PredictResult {
  transactionId: string;
  correct: boolean;
}

/**
 * Predict: the transaction is shown, the student says what it will do to each side of the equation, then the
 * animation shows the truth and the prediction is marked and recorded. Endless on the simulator's page; a fixed
 * list (`plan`) in a level, which is told of each result.
 */
export function PredictMode({
  scene,
  speed,
  onSpeed,
  record,
  plan,
  fixedLevel,
  onResult,
  onFinished,
  seed,
}: {
  /** Where an endless run starts; drawn for the visit when left out. */
  seed?: number;
  scene: Scene;
  speed: Speed;
  onSpeed(s: Speed): void;
  /** Records an answer and says the XP it earned. */
  record(answer: SimAnswer): number;
  plan?: readonly SimTransaction[];
  fixedLevel?: PredictLevel;
  onResult?(r: PredictResult): void;
  /** With a plan: called after the last one has been marked and the student goes on. */
  onFinished?(): void;
}) {
  const [level, setLevel] = useState<PredictLevel>(fixedLevel ?? 'directions');
  const [source, setSource] = useState<SourceId>('starter');
  const { next, loading } = useSource(scene, seed);
  const [index, setIndex] = useState(0);
  const [tx, setTx] = useState<SimTransaction | null>(plan?.[0] ?? null);
  const [books, setBooks] = useState(() => openingBalances(scene.opening.lines));
  const [played, setPlayed] = useState<Played | null>(null);
  const [fresh, setFresh] = useState(false);
  const [phase, setPhase] = useState<Phase>('predict');
  const [prediction, setPrediction] = useState<Prediction>({ directions: {} });
  const [amountsText, setAmountsText] = useState<Partial<Record<SideKey, string>>>({});
  const [marked, setMarked] = useState<Marked | null>(null);
  const [xp, setXp] = useState(0);
  const [tally, setTally] = useState({ answered: 0, right: 0, streak: 0 });
  const startedAt = useRef(0);

  // The first transaction of an endless run.
  useEffect(() => {
    if (plan || tx) return;
    let live = true;
    void next('starter').then((t) => {
      if (live) setTx(t);
    });
    return () => {
      live = false;
    };
  }, [plan, tx, next]);

  useEffect(() => {
    startedAt.current = Date.now();
  }, [tx]);

  const choices = useMemo(() => (tx ? accountChoices(tx) : []), [tx]);
  const rest = useMemo(() => atRest(books), [books]);
  const full: Prediction = { ...prediction, amounts: amountsFrom(amountsText) };
  const ready = tx !== null && isComplete(full, level);

  const check = () => {
    if (!tx || !ready) return;
    const out = playOn(scene, books, tx);
    const m = markPrediction(tx, out.played.effect, full, level);
    const question = predictionQuestion(scene, tx);
    const trapText = m.trap !== null ? describeEffect(tx.traps![m.trap].effect) : null;
    const optionId = trapText ? (question.options.find((o) => o.text === trapText)?.id ?? null) : null;
    setXp(record({ question, correct: m.correct, difficulty: LEVEL_DIFFICULTY[level], optionId, timeMs: Date.now() - startedAt.current }));
    setMarked(m);
    setPlayed(out.played);
    setFresh(out.fresh);
    setPhase('playing');
    setTally((t) => ({ answered: t.answered + 1, right: t.right + (m.correct ? 1 : 0), streak: m.correct ? t.streak + 1 : 0 }));
    onResult?.({ transactionId: tx.id, correct: m.correct });
  };

  const last = plan !== undefined && index >= plan.length - 1;
  const goOn = async () => {
    if (played) setBooks(played.after);
    setPlayed(null);
    setMarked(null);
    setPrediction({ directions: {} });
    setAmountsText({});
    setPhase('predict');
    if (plan) {
      if (last) {
        onFinished?.();
        return;
      }
      setTx(plan[index + 1]);
      setIndex(index + 1);
    } else {
      setTx(await next(source));
    }
  };

  if (!tx) return <p className="text-base text-muted">Getting a transaction ready…</p>;

  return (
    <div className="flex flex-col gap-4">
      {!plan ? (
        <div className="flex flex-col gap-3 rounded-card border border-edge bg-surface p-4 shadow-card">
          <div className="flex flex-col gap-1">
            <span className="text-sm font-bold text-muted">How much to predict</span>
            <Pills<PredictLevel> options={PREDICT_LEVELS.map((l) => ({ value: l.id, label: l.label }))} value={level} onChange={setLevel} label="How much to predict" testIdPrefix="predict-level" />
          </div>
          <div className="flex flex-col gap-1">
            <span className="text-sm font-bold text-muted">Transactions from</span>
            <Pills options={SOURCE_LABEL(scene)} value={source} onChange={setSource} label="Where transactions come from" testIdPrefix="predict-source" />
          </div>
          <dl aria-label="This run so far" className="flex gap-4 text-sm">
            <div>
              <dt className="inline font-bold text-muted">Answered </dt>
              <dd data-testid="predict-answered" className="inline font-extrabold">
                {tally.answered}
              </dd>
            </div>
            <div>
              <dt className="inline font-bold text-muted">Right </dt>
              <dd data-testid="predict-right" className="inline font-extrabold">
                {tally.right}
              </dd>
            </div>
            <div>
              <dt className="inline font-bold text-muted">In a row </dt>
              <dd className="inline font-extrabold">{tally.streak}</dd>
            </div>
          </dl>
        </div>
      ) : null}

      <section aria-labelledby="predict-q" className="flex flex-col gap-3 rounded-card border-2 border-primary bg-surface p-4 shadow-card">
        <h3 id="predict-q" className="text-sm font-extrabold uppercase tracking-wide text-primary-ink">
          {plan ? `Prediction ${index + 1} of ${plan.length}` : 'Predict'}
        </h3>
        <p data-testid="predict-transaction" className="text-lg font-extrabold">
          {tx.text}
        </p>
        <p className="text-sm text-muted">What will it do to each side of the equation? {level === 'directions' ? '' : level === 'amounts' ? 'Give the amount of each change too.' : 'Give the amounts, and the accounts debited and credited.'}</p>
        <PredictForm level={level} value={prediction} onChange={setPrediction} accounts={choices} marked={phase === 'marked' ? marked : null} amountsText={amountsText} onAmountText={(s, t) => setAmountsText((a) => ({ ...a, [s]: t }))} />
        {phase === 'predict' ? (
          <Button data-testid="predict-check" disabled={!ready} onClick={check} className="self-start">
            Check, and watch it happen
          </Button>
        ) : null}
        {phase === 'marked' && marked ? (
          <div role="status" data-testid="predict-feedback" data-correct={marked.correct ? 'true' : 'false'} className={`flex flex-col gap-1 rounded-control p-3 ${marked.correct ? 'bg-primary-soft text-primary-ink' : 'bg-danger-soft text-danger-deep'}`}>
            <p className="text-lg font-extrabold">{marked.correct ? `Right! +${xp} XP` : 'Not quite.'}</p>
            {marked.mistake ? <p className="text-base">{marked.mistake}</p> : null}
            {markWords(marked).map((w) => (
              <p key={w} className="text-base">
                {w}
              </p>
            ))}
            {!marked.correct ? <p className="text-sm">This one is waiting in Mistakes, to try again later.</p> : null}
          </div>
        ) : null}
      </section>

      <SimStage
        scene={scene}
        played={played ?? rest}
        speed={speed}
        onSpeed={onSpeed}
        onDone={() => {
          if (phase === 'playing') setPhase('marked');
        }}
        caption={fresh && played ? <p className="text-sm text-muted">{FRESH_NOTE}</p> : undefined}
      />

      {phase === 'marked' && played ? (
        <>
          <Explanation scene={scene} played={played} />
          <Button data-testid="predict-next" size="lg" onClick={() => void goOn()} disabled={loading} className="self-start">
            {plan && last ? 'See how you did' : 'Next transaction'}
          </Button>
        </>
      ) : null}
    </div>
  );
}
