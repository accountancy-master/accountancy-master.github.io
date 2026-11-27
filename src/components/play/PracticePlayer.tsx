'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { useDeviceSettings } from '@/app-state/DeviceSettings';
import { useStore } from '@/app-state/StoreProvider';
import { useCourse } from '@/app-state/useCourse';
import { useProgress } from '@/app-state/useProgress';
import { useShellTrail } from '@/components/shell/ShellContext';
import { buttonClasses } from '@/components/ui/Button';
import { TopicsGate } from '@/components/ui/TopicsGate';
import type { Progress } from '@/learning/progress';
import { topicTitle } from '@/learning/recommend';
import { newId } from '@/lib/ids';
import { MODE_TITLE, kindForMode, sessionResultDay, type PracticeMode } from '@/play/practiceModes';
import { preparePracticeSession, type PracticePlan } from '@/play/practiceSession';
import type { Profile, ProgressStore, SessionResult } from '@/storage/types';
import { Frame, LoadError, Loading } from './PlayFrame';
import { PracticeResults } from './PracticeResults';
import { SessionRunner, type SessionSummary } from './SessionRunner';

/** Where leaving a practice session goes. */
const EXIT_HREF = '/home';

const LOADING = 'Getting your practice ready…';

const NOTHING_YET = 'Pass a level to unlock practice.';
const EMPTY: Record<PracticeMode, { title: string; text: string }> = {
  mistakes: {
    title: 'No mistakes to fix',
    text: 'Nothing you answered wrongly is waiting to be reviewed. Keep practising and come back later.',
  },
  cards: { title: 'No cards to revise', text: 'Every rule card is up to date for now. Come back when some are due.' },
  smart: { title: 'Nothing to practise yet', text: NOTHING_YET },
  fresh: { title: 'Nothing to practise yet', text: NOTHING_YET },
  daily: { title: 'Nothing to practise yet', text: "Pass your first level to unlock today's challenge." },
  mission: { title: 'Nothing to practise yet', text: "Pass your first level to unlock today's mission." },
};

/**
 * Loads the profile's progress, then plays one practice session of the given mode. A fresh one is built per play.
 * With `topicId` (mode `fresh` only) the questions all come from that topic.
 */
export function PracticePlayer({ mode, topicId }: { mode: PracticeMode; topicId?: string }) {
  const { profile } = useStore();
  const router = useRouter();
  const { progress, status, reload } = useProgress();
  const [run, setRun] = useState(0);
  // Where the learner is: a topic's practice under Practice; cards under Cards, mistakes under Mistakes; the rest under Practice.
  useShellTrail(
    topicId
      ? [{ label: 'Practice', href: '/practice' }, { label: `Practise ${topicTitle(topicId)}` }]
      : mode === 'cards'
        ? [{ label: 'Learn' }, { label: MODE_TITLE[mode] }]
        : mode === 'mistakes'
          ? [{ label: 'Mistakes', href: '/mistakes' }, { label: MODE_TITLE[mode] }]
          : [{ label: 'Practice', href: '/practice' }, { label: MODE_TITLE[mode] }],
  );

  useEffect(() => {
    if (!profile) router.replace('/');
  }, [profile, router]);

  if (!profile) return <div aria-busy="true" data-testid="player-redirecting" className="min-h-dvh" />;
  if (status === 'error') return <LoadError onRetry={() => void reload()} />;
  if (status !== 'ready' || progress === null) return <Loading>{LOADING}</Loading>;

  return (
    <PracticeRun
      key={`${mode}:${topicId ?? ''}:${run}`}
      mode={mode}
      topicId={topicId}
      profile={profile}
      progress={progress}
      onAgain={() => setRun((n) => n + 1)}
    />
  );
}

interface RunProps {
  mode: PracticeMode;
  topicId?: string;
  profile: Profile;
  progress: Progress;
  onAgain(): void;
}

/** What a run is made from, fixed when it starts. */
interface Boot {
  startedAt: number;
  sessionId: string;
  resultId: string;
  plan: PracticePlan;
  bonusDaysBefore: string[];
}

function PracticeRun(props: RunProps) {
  const { mode, topicId, progress } = props;
  const { attempts, sessionResults, cardStates, activity } = useProgress();
  const { unlockAll } = useDeviceSettings();
  // The playable topics of the learner's course: practice draws on them and on no others.
  const { packs } = useCourse();

  // Chosen exactly once for this run: later re-renders (and the progress reload at the end) never choose again.
  const [boot] = useState((): Boot => {
    const startedAt = Date.now();
    return {
      startedAt,
      sessionId: newId(),
      resultId: newId(),
      // The session is chosen from the outlines of the packs; it says which topics it asks about.
      plan: preparePracticeSession(mode, {
        packs,
        progress,
        attempts,
        sessionResults,
        cardStates,
        activity,
        now: startedAt,
        unlockAll,
        topicId,
      }),
      // Days on which the bonus of this kind was already earned, to tell whether this session earned it.
      bonusDaysBefore: [
        ...(mode === 'mission' ? progress.missionDoneDays : mode === 'daily' ? progress.challengeDoneDays : []),
      ],
    };
  });

  return (
    <TopicsGate page topicIds={boot.plan.topicIds} loading={LOADING}>
      {() => <PracticeSession {...props} boot={boot} />}
    </TopicsGate>
  );
}

function PracticeSession({ mode, topicId, profile, onAgain, boot }: RunProps & { boot: Boot }) {
  const kind = kindForMode(mode);
  // Practice of one topic leaves, and ends, at that topic's page.
  const exitHref = topicId ? `/topics/${topicId}` : EXIT_HREF;
  const title = topicId ? `Practise ${topicTitle(topicId)}` : MODE_TITLE[mode];
  // Built exactly once for this run.
  const [items] = useState(() => boot.plan.make());

  // An empty session writes nothing: the runner is never mounted for it.
  if (items.length === 0) {
    const empty = topicId ? { title: 'Nothing to practise yet', text: 'This topic has no questions yet.' } : EMPTY[mode];
    return (
      <Frame>
        <div
          data-testid="practice-empty"
          className="flex flex-col items-start gap-4 rounded-card border-2 border-dashed border-edge-deep bg-canvas p-5"
        >
          <h1 className="text-2xl font-extrabold">{empty.title}</h1>
          <p className="text-base">{empty.text}</p>
          <Link href={exitHref} className={buttonClasses('primary')}>
            {topicId ? 'Back to topic' : 'Back to home'}
          </Link>
        </div>
      </Frame>
    );
  }

  const saveResult = async (store: ProgressStore, summary: SessionSummary) => {
    const now = Date.now();
    const result: SessionResult = {
      id: boot.resultId,
      profileId: profile.id,
      courseId: profile.courseId,
      kind,
      sessionId: boot.sessionId,
      day: sessionResultDay(kind, boot.startedAt, now),
      correct: summary.correct,
      total: summary.total,
      at: now,
    };
    await store.appendSessionResult(result);
  };

  return (
    <SessionRunner
      profile={profile}
      kind={kind}
      items={items}
      sessionId={boot.sessionId}
      title={title}
      noun="session"
      exitHref={exitHref}
      saveResult={saveResult}
      renderResults={({ summary, xpBefore, cardsRated }) => (
        <PracticeResults
          mode={mode}
          correct={summary.correct}
          total={summary.total}
          cardsRated={cardsRated}
          xpBefore={xpBefore}
          resultId={boot.resultId}
          bonusDaysBefore={boot.bonusDaysBefore}
          backTo={topicId ? { href: exitHref, label: 'Back to topic', testId: 'results-topic' } : undefined}
          onAgain={onAgain}
        />
      )}
    />
  );
}
