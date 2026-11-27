'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { useStore } from '@/app-state/StoreProvider';
import { useCourse } from '@/app-state/useCourse';
import { useProgress } from '@/app-state/useProgress';
import { ResultsView } from '@/components/play/ResultsView';
import { Button } from '@/components/ui/Button';
import { ProgressBar } from '@/components/ui/ProgressBar';
import type { Level, TopicPack } from '@/content/types';
import { rankFor } from '@/learning/gamification';
import { scoreLevel } from '@/learning/progress';
import { newId } from '@/lib/ids';
import { levelSeed, playCount, seedOrder } from '@/play/seed';
import { openingBalances } from '@/simulator/engine';
import { mistakesPlan, predictPlan } from '@/simulator/plans';
import { findScene, type Scene } from '@/simulator/scenes';
import type { SimTransaction } from '@/simulator/types';
import type { LevelResult, Profile } from '@/storage/types';
import { Explanation } from './Explanation';
import { MistakeMode } from './MistakeMode';
import { PredictMode } from './PredictMode';
import { SimStage, type Speed } from './SimStage';
import { useRecorder } from './useRecorder';
import { playOn } from './WatchMode';

/** A simulation level, played: watch then predict, or find the mistakes; passed like any level, by the share right. */
export default function SimulationLevel({ level, pack, profile, onAgain }: { level: Level; pack: TopicPack; profile: Profile; onAgain(): void }) {
  const spec = level.simulation!;
  const scene = findScene(spec.sceneId);
  const { attempts, levelResults, progress, reload } = useProgress();
  const { store } = useStore();
  const { packs } = useCourse();
  const recorder = useRecorder('level', level.id);
  const [boot] = useState(() => {
    const topicIndex = Math.max(0, packs.findIndex((o) => o.topicId === pack.topicId));
    return { seed: levelSeed(seedOrder(level, topicIndex), playCount(level.id, attempts, levelResults)), resultId: newId(), xpBefore: progress?.xp ?? 0 };
  });
  const plan = useMemo(() => {
    if (!scene) return null;
    return spec.mode === 'predict' ? { kind: 'predict' as const, ...predictPlan(scene, boot.seed, spec.watch ?? 0, spec.count) } : { kind: 'mistakes' as const, cases: mistakesPlan(scene, boot.seed, spec.count) };
  }, [scene, spec, boot.seed]);
  const [speed, setSpeed] = useState<Speed>(1);
  const [watched, setWatched] = useState(0);
  const [results, setResults] = useState<boolean[]>([]);
  const [finished, setFinished] = useState(false);
  const [saved, setSaved] = useState(false);
  const total = spec.count;
  const watching = plan?.kind === 'predict' && watched < plan.watch.length;

  // At the end: once every answer is stored, the level's result, and then the progress with it.
  useEffect(() => {
    if (!finished) return;
    const correct = results.filter(Boolean).length;
    const { score, passed } = scoreLevel(correct, total, level);
    const result: LevelResult = { id: boot.resultId, profileId: profile.id, topicId: level.topicId, levelId: level.id, score, passed, at: Date.now() };
    void recorder
      .settled()
      .then(() => store.appendLevelResult(result))
      .then(() => reload())
      .then(() => setSaved(true));
  }, [finished]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!scene || !plan) return <p className="p-4 text-base">This level cannot be played in this version.</p>;

  const done = results.length;
  const nextLevel = [...pack.levels].sort((a, b) => a.order - b.order).find((l) => l.order > level.order) ?? null;

  if (finished) {
    const correct = results.filter(Boolean).length;
    const { passed } = scoreLevel(correct, total, level);
    return (
      <main className="mx-auto w-full max-w-3xl px-4 py-6">
        <ResultsView
          passed={passed}
          correct={correct}
          total={total}
          xpGained={saved && progress ? progress.xp - boot.xpBefore : null}
          rankName={saved && progress ? rankFor(progress.xp).name : null}
          topicId={level.topicId}
          nextLevelId={passed && nextLevel ? nextLevel.id : null}
          onAgain={onAgain}
          passMark={level.passMark}
        />
      </main>
    );
  }

  return (
    <div className="flex min-h-dvh flex-col">
      <header className="sticky top-0 z-10 border-b-2 border-edge bg-surface">
        <div className="mx-auto flex w-full max-w-6xl items-center gap-3 px-4 py-2">
          <Link href={`/topics/${level.topicId}`} data-testid="player-close" aria-label="Close this level" className="flex h-11 w-11 shrink-0 items-center justify-center rounded-control text-muted hover:bg-canvas">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" aria-hidden="true">
              <path d="M6 6l12 12M18 6 6 18" />
            </svg>
          </Link>
          <ProgressBar value={done / total} label={`${level.title}: ${done} of ${total} done`} data-testid="player-progress" />
          <span data-testid="sim-level-score" className="shrink-0 text-sm font-extrabold tabular-nums">
            {results.filter(Boolean).length}/{total}
          </span>
        </div>
      </header>
      <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-4 px-4 pb-8 pt-4">
        <h1 className="text-2xl font-extrabold">{level.title}</h1>
        {watching ? (
          <WatchStep key={watched} scene={scene} tx={plan.watch[watched]} index={watched} of={plan.watch.length} speed={speed} onSpeed={setSpeed} onNext={() => setWatched(watched + 1)} />
        ) : plan.kind === 'predict' ? (
          <PredictMode
            scene={scene}
            speed={speed}
            onSpeed={setSpeed}
            record={recorder.record}
            plan={plan.predict}
            fixedLevel="directions"
            onResult={(r) => setResults((list) => [...list, r.correct])}
            onFinished={() => setFinished(true)}
          />
        ) : (
          <MistakeMode scene={scene} speed={speed} onSpeed={setSpeed} record={recorder.record} plan={plan.cases} onResult={(r) => setResults((list) => [...list, r.correct])} onFinished={() => setFinished(true)} />
        )}
      </main>
    </div>
  );
}

/** One transaction to watch before the predictions: played through, explained, then on. */
function WatchStep({ scene, tx, index, of, speed, onSpeed, onNext }: { scene: Scene; tx: SimTransaction; index: number; of: number; speed: Speed; onSpeed(s: Speed): void; onNext(): void }) {
  const [played] = useState(() => playOn(scene, openingBalances(scene.opening.lines), tx).played);
  const [done, setDone] = useState(false);
  return (
    <div className="flex flex-col gap-4">
      <section className="flex flex-col gap-1 rounded-card border-2 border-primary bg-surface p-4 shadow-card">
        <p className="text-sm font-extrabold uppercase tracking-wide text-primary-ink">
          Watch {index + 1} of {of}, then predict
        </p>
        <p data-testid="watch-transaction" className="text-lg font-extrabold">
          {tx.text}
        </p>
      </section>
      <SimStage scene={scene} played={played} speed={speed} onSpeed={onSpeed} onDone={() => setDone(true)} />
      {done ? (
        <>
          <Explanation scene={scene} played={played} />
          <Button data-testid="sim-level-next" size="lg" onClick={onNext} className="self-start">
            {index + 1 < of ? 'Watch the next one' : 'Start predicting'}
          </Button>
        </>
      ) : null}
    </div>
  );
}
