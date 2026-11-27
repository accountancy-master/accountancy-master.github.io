'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { lazy, Suspense, useEffect, useState } from 'react';
import { useDeviceSettings } from '@/app-state/DeviceSettings';
import { useStore } from '@/app-state/StoreProvider';
import { useCourse } from '@/app-state/useCourse';
import { useProgress } from '@/app-state/useProgress';
import { buttonClasses } from '@/components/ui/Button';
import { TopicsGate } from '@/components/ui/TopicsGate';
import { getTopicPack } from '@/content/loaded';
import { useShellTrail } from '@/components/shell/ShellContext';
import { findOutline, topicOfLevel, topicTitle } from '@/content/outline';
import type { Level, TopicPack } from '@/content/types';
import { rankFor } from '@/learning/gamification';
import { levelUnlocked, weakestTopics, type Progress } from '@/learning/progress';
import { buildLevelSession, earlierTopicsOf, type LevelSessionOptions } from '@/learning/sessionBuilder';
import { newId } from '@/lib/ids';
import { levelClock } from '@/play/questionClock';
import { levelSeed, playCount, seedOrder } from '@/play/seed';
import { challengeTimerOn, type LevelResult, type Profile, type ProgressStore } from '@/storage/types';
import { LevelOfOtherCourse } from '@/components/topic/LevelOfOtherCourse';
import { e2eQuestionSeconds } from './e2eClock';
import { Frame, LoadError, Loading, NOTICE } from './PlayFrame';
import { ResultsView } from './ResultsView';
import { SessionRunner, type SessionSummary } from './SessionRunner';

const LOADING = 'Getting your level ready…';

// A simulation level plays the simulator, which is fetched only for such a level.
const SimulationLevel = lazy(() => import('@/components/simulator/SimulationLevel'));
/** Shown on a timed level played without its clock, so that "against the clock" in its description is not left unexplained. */
const TIMER_OFF = 'The challenge timer is off in Settings, so this level is not timed.';

/**
 * Loads the profile's progress and the level's topic, checks the level is open, then plays it. A fresh run is
 * mounted for every play.
 */
export function Player({ levelId }: { levelId: string }) {
  const { profile } = useStore();
  const router = useRouter();
  const { progress, status, reload } = useProgress();
  const course = useCourse();
  // A level of another course is no level of this learner's: its topic is not one they can meet.
  const ofLevel = topicOfLevel(levelId);
  const topicId = profile && ofLevel !== undefined && !course.has(ofLevel) ? undefined : ofLevel;

  // Where the learner is, for the top bar: Topics, the topic, the level.
  const levelTitle = topicId ? findOutline(topicId)?.levels.find((l) => l.id === levelId)?.title : undefined;
  useShellTrail(
    topicId && levelTitle
      ? [{ label: 'Topics', href: '/topics' }, { label: topicTitle(topicId), href: `/topics/${topicId}` }, { label: levelTitle }]
      : null,
  );

  useEffect(() => {
    if (!profile) router.replace('/');
  }, [profile, router]);

  if (!profile) return <div aria-busy="true" data-testid="player-redirecting" className="min-h-dvh" />;

  // A level of the other course (a link shared by a teacher or a classmate): offer the switch, then it opens here.
  if (topicId === undefined) return ofLevel !== undefined ? <LevelOfOtherCourse levelId={levelId} topicId={ofLevel} /> : <NoSuchLevel />;

  if (status === 'error') return <LoadError onRetry={() => void reload()} />;
  if (status !== 'ready' || progress === null) return <Loading>{LOADING}</Loading>;

  return (
    <TopicsGate page topicIds={[topicId]} loading={LOADING}>
      {() => <OpenLevel levelId={levelId} pack={getTopicPack(topicId)!} profile={profile} progress={progress} />}
    </TopicsGate>
  );
}

/** A level this learner cannot play (none by that id, or one of another course), with the way back to the topics. */
function NoSuchLevel() {
  return (
    <Frame>
      <div data-testid="level-missing" className={`flex flex-col items-start gap-4 ${NOTICE}`}>
        <p>This level does not exist in your course.</p>
        <Link href="/topics" className={buttonClasses('primary')}>
          Back to topics
        </Link>
      </div>
    </Frame>
  );
}

/** The level, once its topic is loaded: locked, or played. */
function OpenLevel({ levelId, pack, profile, progress }: { levelId: string; pack: TopicPack; profile: Profile; progress: Progress }) {
  const { unlockAll } = useDeviceSettings();
  const [run, setRun] = useState(0);
  const level = pack.levels.find((l) => l.id === levelId);

  if (!level) return <NoSuchLevel />;

  if (!levelUnlocked(level, pack.levels, progress.passedLevelIds, unlockAll)) {
    return (
      <Frame>
        <div
          data-testid="level-locked"
          className="flex flex-col items-start gap-4 rounded-card border-2 border-dashed border-edge-deep bg-canvas p-5"
        >
          <h1 className="text-2xl font-extrabold">This level is locked</h1>
          <p className="text-base">Pass the level above it first, then come back.</p>
          <Link href={`/topics/${level.topicId}`} className={buttonClasses('primary')}>
            Back to topic
          </Link>
        </div>
      </Frame>
    );
  }

  if (level.type === 'simulation') {
    return (
      <Suspense fallback={<Loading>{LOADING}</Loading>}>
        <SimulationLevel key={`${level.id}:${run}`} level={level} pack={pack} profile={profile} onAgain={() => setRun((n) => n + 1)} />
      </Suspense>
    );
  }

  return (
    <LevelRun
      key={`${level.id}:${run}`}
      profile={profile}
      progress={progress}
      level={level}
      pack={pack}
      onAgain={() => setRun((n) => n + 1)}
    />
  );
}

function LevelRun({
  profile,
  progress,
  level,
  pack,
  onAgain,
}: {
  profile: Profile;
  progress: Progress;
  level: Level;
  pack: TopicPack;
  onAgain(): void;
}) {
  const { attempts, levelResults } = useProgress();
  // The playable topics of the learner's course, in its order: a look-back draws on the ones before this topic.
  const { packs } = useCourse();

  // Chosen exactly once for this run: later re-renders (and the progress reload at the end) never choose again.
  const [boot] = useState(() => {
    const topicIndex = Math.max(0, packs.findIndex((o) => o.topicId === pack.topicId));
    // Plays that were abandoned count too, so a replay never gets the questions the learner already saw.
    const seed = levelSeed(seedOrder(level, topicIndex), playCount(level.id, attempts, levelResults));
    // A look-back level leans towards the earlier topics the learner is weakest in, as their progress stands now.
    const options: LevelSessionOptions = { weakestTopicIds: weakestTopics(packs.slice(0, topicIndex), progress) };
    // It asks questions of some earlier topics: those are loaded before the session is built.
    return { sessionId: newId(), resultId: newId(), seed, options, earlierTopicIds: earlierTopicsOf(level, seed, options) };
  });

  return (
    <TopicsGate page topicIds={boot.earlierTopicIds} loading={LOADING}>
      {() => <LevelSession profile={profile} level={level} pack={pack} boot={boot} onAgain={onAgain} />}
    </TopicsGate>
  );
}

function LevelSession({
  profile,
  level,
  pack,
  boot,
  onAgain,
}: {
  profile: Profile;
  level: Level;
  pack: TopicPack;
  boot: { sessionId: string; resultId: string; seed: number; options: LevelSessionOptions };
  onAgain(): void;
}) {
  // Built exactly once for this run.
  const [items] = useState(() => buildLevelSession(level, pack, boot.seed, boot.options));
  // Settled once for this run too: a setting changed meanwhile (in Settings, in another tab) leaves a level in play alone.
  const [clock] = useState(() => levelClock(level, challengeTimerOn(profile), e2eQuestionSeconds()));

  const nextLevel = [...pack.levels].sort((a, b) => a.order - b.order).find((l) => l.order > level.order) ?? null;

  const saveResult = async (store: ProgressStore, summary: SessionSummary) => {
    const result: LevelResult = {
      id: boot.resultId,
      profileId: profile.id,
      topicId: level.topicId,
      levelId: level.id,
      score: summary.score,
      passed: summary.passed,
      at: Date.now(),
    };
    await store.appendLevelResult(result);
  };

  return (
    <SessionRunner
      profile={profile}
      kind="level"
      items={items}
      sessionId={boot.sessionId}
      levelId={level.id}
      topicId={level.topicId}
      passMark={level.passMark}
      title={level.title}
      noun="level"
      exitHref={`/topics/${level.topicId}`}
      secondsPerQuestion={clock.seconds}
      note={clock.switchedOff ? TIMER_OFF : undefined}
      saveResult={saveResult}
      renderResults={({ summary, xpBefore }) => (
        <LevelResults
          summary={summary}
          xpBefore={xpBefore}
          resultId={boot.resultId}
          topicId={level.topicId}
          nextLevelId={summary.passed && nextLevel ? nextLevel.id : null}
          onAgain={onAgain}
          passMark={level.passMark}
        />
      )}
    />
  );
}

function LevelResults({
  summary,
  xpBefore,
  resultId,
  topicId,
  nextLevelId,
  onAgain,
  passMark,
}: {
  summary: SessionSummary;
  xpBefore: number;
  resultId: string;
  topicId: string;
  nextLevelId: string | null;
  onAgain(): void;
  passMark?: number;
}) {
  const { progress, levelResults } = useProgress();
  // Only a total that already includes this session's result is shown; never a guess in between.
  const saved = progress !== null && levelResults.some((r) => r.id === resultId);
  return (
    <ResultsView
      passed={summary.passed}
      correct={summary.correct}
      total={summary.total}
      xpGained={saved ? progress.xp - xpBefore : null}
      rankName={saved ? rankFor(progress.xp).name : null}
      topicId={topicId}
      nextLevelId={nextLevelId}
      onAgain={onAgain}
      lesson={summary.lesson}
      passMark={passMark}
    />
  );
}
