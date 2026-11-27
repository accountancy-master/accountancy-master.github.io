'use client';

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import { useStore } from '@/app-state/StoreProvider';
import { useCourse } from '@/app-state/useCourse';
import { useProgress } from '@/app-state/useProgress';
import { Frame, LoadError, Loading } from '@/components/play/PlayFrame';
import { useShellTrail } from '@/components/shell/ShellContext';
import { PracticeResults } from '@/components/play/PracticeResults';
import { SessionRunner, type SessionSummary } from '@/components/play/SessionRunner';
import { buttonClasses } from '@/components/ui/Button';
import { TopicsGate } from '@/components/ui/TopicsGate';
import type { StageOutline } from '@/content/outline';
import type { CaseOutline } from '@/generators/types';
import { MIXED_CASES, buildCaseSession, casePlays, caseSeed, nextCase, nextMixedCase } from '@/learning/caseStudies';
import type { Progress } from '@/learning/progress';
import type { SessionItem } from '@/learning/sessionBuilder';
import { newId } from '@/lib/ids';
import { sessionResultDay } from '@/play/practiceModes';
import { practicePlayCount } from '@/play/seed';
import type { Profile, ProgressStore, SessionResult } from '@/storage/types';

/** Where leaving a case, and its results, go. */
const EXIT_HREF = '/cases';

const LOADING = 'Getting your case ready…';

/**
 * Plays one whole case from the Case studies screen: with a stage id, that stage's next case (or the one named by
 * `?case=`); with `mixed`, a case from any open stage. A fresh case, with a new seed, is built for every play.
 */
export function CasePlayer({ stageId }: { stageId: string }) {
  const { profile } = useStore();
  const router = useRouter();
  const wanted = useSearchParams().get('case');
  const { progress, status, reload } = useProgress();
  const [run, setRun] = useState(0);

  useEffect(() => {
    if (!profile) router.replace('/');
  }, [profile, router]);

  if (!profile) return <div aria-busy="true" data-testid="player-redirecting" className="min-h-dvh" />;
  if (status === 'error') return <LoadError onRetry={() => void reload()} />;
  if (status !== 'ready' || progress === null) return <Loading>{LOADING}</Loading>;

  return (
    <CaseRun
      key={`${stageId}:${wanted ?? ''}:${run}`}
      stageId={stageId}
      wanted={wanted}
      profile={profile}
      progress={progress}
      onAgain={() => setRun((n) => n + 1)}
    />
  );
}

/** The case to play (the stage and the case are known in outline before the stage's topic is loaded); null when there is none. */
type Chosen = { stage: StageOutline; template: CaseOutline } | null;

interface RunProps {
  stageId: string;
  wanted: string | null;
  profile: Profile;
  progress: Progress;
  onAgain(): void;
}

function CaseRun(props: RunProps) {
  const { stageId, wanted } = props;
  const { attempts, sessionResults } = useProgress();
  // The stages of the learner's course: a stage of another course is no stage here. Every one of them can be played,
  // whatever the learner has passed: a case study is play, and the ladder's locks are for its levels alone.
  const { stages } = useCourse();

  // Chosen exactly once for this run: later re-renders (and the progress reload at the end) never choose again.
  const [boot] = useState(() => {
    const startedAt = Date.now();
    const plays = casePlays(attempts);
    let chosen: Chosen = null;
    if (stageId === MIXED_CASES) {
      chosen = nextMixedCase(stages, plays) ?? null;
    } else {
      const stage = stages.find((s) => s.id === stageId);
      const template = stage ? (stage.cases.find((c) => c.id === wanted) ?? nextCase(stage, plays)) : undefined;
      if (stage && template) chosen = { stage, template };
    }
    // Plays that were abandoned count too, so a case never comes with figures the learner has already seen.
    const seed = caseSeed(practicePlayCount('case', attempts, sessionResults));
    return { startedAt, sessionId: newId(), resultId: newId(), chosen, seed };
  });
  // Where the learner is: Case studies, then the case.
  useShellTrail([{ label: 'Case studies', href: EXIT_HREF }, { label: boot.chosen ? boot.chosen.template.title : 'Case study' }]);

  // Nothing to play writes nothing: the runner is never mounted for it.
  if (!boot.chosen) {
    return (
      <Frame>
        <div data-testid="case-empty" className="flex flex-col items-start gap-4 rounded-card border-2 border-dashed border-edge-deep bg-canvas p-5">
          <h1 className="text-2xl font-extrabold">No case to play yet</h1>
          <p className="text-base">Your course has no case studies yet.</p>
          <Link href={EXIT_HREF} className={buttonClasses('primary')}>
            Back to case studies
          </Link>
        </div>
      </Frame>
    );
  }
  const { stage, template } = boot.chosen;

  // The cases of a stage come with the stage's topic.
  return (
    <TopicsGate page topicIds={[stage.topicId]} loading={LOADING}>
      {() => <CaseSession {...props} template={template} boot={boot} />}
    </TopicsGate>
  );
}

function CaseSession({
  profile,
  onAgain,
  template,
  boot,
}: RunProps & { template: CaseOutline; boot: { startedAt: number; sessionId: string; resultId: string; seed: number } }) {
  // Built exactly once for this run.
  const [items] = useState((): SessionItem[] => buildCaseSession(template.id, boot.seed));

  const saveResult = async (store: ProgressStore, summary: SessionSummary) => {
    const now = Date.now();
    const result: SessionResult = {
      id: boot.resultId,
      profileId: profile.id,
      courseId: profile.courseId,
      kind: 'case',
      sessionId: boot.sessionId,
      day: sessionResultDay('case', boot.startedAt, now),
      correct: summary.correct,
      total: summary.total,
      at: now,
    };
    await store.appendSessionResult(result);
  };

  return (
    <SessionRunner
      profile={profile}
      kind="case"
      items={items}
      sessionId={boot.sessionId}
      title={`Case study: ${template.title}`}
      noun="session"
      exitHref={EXIT_HREF}
      saveResult={saveResult}
      renderResults={({ summary, xpBefore }) => (
        <PracticeResults
          mode="case"
          correct={summary.correct}
          total={summary.total}
          cardsRated={0}
          xpBefore={xpBefore}
          resultId={boot.resultId}
          bonusDaysBefore={[]}
          backTo={{ href: EXIT_HREF, label: 'Back to case studies', testId: 'results-cases' }}
          againLabel="New case"
          onAgain={onAgain}
        />
      )}
    />
  );
}
