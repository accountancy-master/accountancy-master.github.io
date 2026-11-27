'use client';

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useMemo, useReducer, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { useStore } from '@/app-state/StoreProvider';
import { useCourse } from '@/app-state/useCourse';
import { useProgress } from '@/app-state/useProgress';
import { feedbackTitle } from '@/components/play/FeedbackPanel';
import { Frame, LoadError, Loading, NOTICE } from '@/components/play/PlayFrame';
import { useShellTrail } from '@/components/shell/ShellContext';
import { QuestionStage } from '@/components/play/QuestionStage';
import { Button, buttonClasses } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { TopicsGate } from '@/components/ui/TopicsGate';
import { loadedPacks } from '@/content/loaded';
import { findConceptTitle } from '@/content/outline';
import type { Question } from '@/content/types';
import { MARATHON_ALL, marathonPool, marathonSeed, type MarathonDifficulty } from '@/learning/marathon';
import {
  ANSWER_KIND_LABEL,
  DEFAULT_MIX_KINDS,
  LEGACY_MIX_KINDS,
  MARATHON_MIX,
  MIX_KIND_LABEL,
  accuracyBy,
  answerKindOf,
  casesOfTopics,
  mixBatch,
  mixIsEmpty,
  narrowByTopic,
  recordScope,
  setupFromQuery,
  withKinds,
  type AnswerKind,
  type MarathonSetup,
  type MixKind,
  type MixPool,
} from '@/learning/marathonMix';
import { chosenSubtopics, marathonSubtopics, narrowPool } from '@/learning/marathonSubtopics';
import { everythingIn, openMistakeIds } from '@/learning/practice';
import type { Progress } from '@/learning/progress';
import { topicTitle } from '@/learning/recommend';
import type { SessionItem } from '@/learning/sessionBuilder';
import { activeTopicIds } from '@/learning/topics';
import { newId } from '@/lib/ids';
import { casePosition, isCaseOpen, toggleCase, type CaseView } from '@/play/caseStudy';
import {
  accuracyByConcept,
  accuracyOf,
  formatElapsed,
  marathonResult,
  marathonResultId,
  newBests,
  personalBests,
  tallyOf,
  weakestConcept,
  type MarathonBest,
  type Tally,
} from '@/play/marathonRun';
import { describeWrong } from '@/play/mistakeText';
import { practicePlayCount } from '@/play/seed';
import { attemptXp, currentItem, sessionReducer, startSession, type AttemptDraft } from '@/play/session';
import type { AttemptEvent, Profile } from '@/storage/types';
import { subtopicCoverage } from './subtopicText';

const LOADING = 'Getting your marathon ready…';
const PICKER_HREF = '/practice/marathon';
const PRACTICE_HREF = '/practice';

const DIFFICULTY_NAME: Record<MarathonDifficulty, string> = { mixed: 'Mixed', easy: 'Easy', medium: 'Medium', complex: 'Complex' };

const asItem = (question: Question): SessionItem => ({ kind: 'question', question });

export const marathonTitle = (scope: string): string => (scope === MARATHON_ALL ? 'All topics I have played' : topicTitle(scope));

/** What a run over chosen topics is called: its topic when it has one, else how many. */
const mixTitle = (topicIds: readonly string[]): string => (topicIds.length === 1 ? topicTitle(topicIds[0]) : `${topicIds.length} topics`);

/** "3 of 8 subtopics: Posting, Balancing, Opening balances", for a run that keeps to some of its topic's subtopics. */
const coveredText = (covered: Covered): string => `${subtopicCoverage(covered.titles.length, covered.of)}: ${covered.titles.join(', ')}`;

/**
 * A marathon, `/practice/marathon/<topicId>` or `/practice/marathon/all`, with `?level=` for one difficulty and, for a
 * topic, `?subtopics=` for a run that keeps to some of its subtopics: questions until the learner stops. A run over
 * chosen topics is `/practice/marathon/mix?topics=a,b&kinds=quick,long,cases` (see learning/marathonMix.ts). A fresh
 * run, with seeds of its own, is started for every play.
 */
export function MarathonPlayer({ scope }: { scope: string }) {
  const { profile } = useStore();
  const router = useRouter();
  const key = useSearchParams().toString();
  // A run at a topic's own address mixes every kind of question it has, as it always has; a run over chosen topics
  // mixes quick questions unless its address says otherwise.
  const setup = useMemo(() => setupFromQuery(new URLSearchParams(key), scope === MARATHON_MIX ? DEFAULT_MIX_KINDS : LEGACY_MIX_KINDS), [key, scope]);
  const { progress, status, reload } = useProgress();
  const [run, setRun] = useState(0);

  useEffect(() => {
    if (!profile) router.replace('/');
  }, [profile, router]);

  if (!profile) return <div aria-busy="true" data-testid="player-redirecting" className="min-h-dvh" />;
  if (status === 'error') return <LoadError onRetry={() => void reload()} />;
  if (status !== 'ready' || progress === null) return <Loading>{LOADING}</Loading>;

  return <MarathonTopics key={`${scope}:${key}:${run}`} scope={scope} setup={setup} profile={profile} progress={progress} onAgain={() => setRun((n) => n + 1)} />;
}

/** What a run is made from, fixed when it starts. */
interface Boot {
  startedAt: number;
  sessionId: string;
  pool: MixPool;
  seed: number;
  mastery: Record<string, number>;
  items: SessionItem[];
  xpBefore: number;
  answeredRight: Set<string>;
  /** Every question answered before the run, right or not: partial XP is for the first answer to a question only. */
  seen: Set<string>;
  /** The scope the run is recorded under: a topic, or all the topics. */
  recordAs: string;
  /** What the run is called on its screen. */
  title: string;
  /** The bests of that scope before the run. */
  bestBefore: MarathonBest | undefined;
  /** Set for a run that keeps to some of its topic's subtopics. */
  covered: Covered | null;
  /** For a run over chosen topics: the topics and the kinds it mixes. */
  mix: { topicIds: string[]; kinds: MixKind[] } | null;
}

/** The subtopics a run keeps to, when they are not all of its topic's. */
interface Covered {
  /** Their titles, in the order of the topic. */
  titles: string[];
  /** How many subtopics the topic has. */
  of: number;
}

interface RunProps {
  scope: string;
  setup: MarathonSetup;
  profile: Profile;
  progress: Progress;
  onAgain(): void;
}

/** Says which topics the run is over (one topic, every topic played, or those chosen), and waits for them. */
function MarathonTopics(props: RunProps) {
  const { activity } = useProgress();
  // The playable topics of the learner's course: a topic of another course is no topic to run on.
  const { packs } = useCourse();
  // Fixed when the run starts: the first answer of a new learner must not change what the run is over.
  const [topicIds] = useState(() => {
    if (props.scope === MARATHON_ALL) return activeTopicIds(packs, activity);
    if (props.scope === MARATHON_MIX) {
      const chosen = props.setup.topics;
      if (chosen === null || chosen.includes('all')) return packs.map((o) => o.topicId);
      return packs.filter((o) => chosen.includes(o.topicId)).map((o) => o.topicId);
    }
    return packs.filter((o) => o.topicId === props.scope).map((o) => o.topicId);
  });
  return (
    <TopicsGate page topicIds={topicIds} loading={LOADING}>
      {() => <MarathonRun {...props} topicIds={topicIds} />}
    </TopicsGate>
  );
}

function MarathonRun(props: RunProps & { topicIds: readonly string[] }) {
  const { scope, setup, progress, topicIds } = props;
  const { difficulty } = setup;
  const { attempts, sessionResults } = useProgress();
  const { stages } = useCourse();

  // Built exactly once for this run: later re-renders (and the progress reload at the end) never rebuild it.
  const [boot] = useState((): Boot => {
    const packs = loadedPacks(topicIds);
    // Every pattern of the run's topics, whatever the learner has passed: a marathon unlocks nothing and needs nothing
    // unlocked. The difficulty and the adaptive mix do the pacing.
    const available = everythingIn(packs);
    const mixed = scope === MARATHON_MIX;
    const kinds = setup.kinds;
    // Practice beyond the syllabus stands on no level: it comes in only when the learner turned it on.
    const whole = withKinds(marathonPool(packs, available, setup.beyond === true), kinds);
    let pool = whole;
    let covered: Covered | null = null;
    if (mixed) {
      // A run over chosen topics keeps each topic to the subtopics the address names of it, if it names any.
      pool = narrowByTopic(whole, setup.subtopics, packs);
    } else if (scope !== MARATHON_ALL) {
      // A run over one topic may keep to some of its subtopics. With all of them (no choice, or one that names nothing
      // this learner can be served) the pool is the whole topic's, and the run is the one it has always been.
      const offered = packs.flatMap((p) => marathonSubtopics(p, available));
      const chosen = chosenSubtopics(offered, setup.subtopics);
      pool = narrowPool(whole, chosen);
      if (chosen !== null) covered = { titles: offered.filter((s) => chosen.includes(s.id)).map((s) => s.title), of: offered.length };
    }
    // Case studies of every stage whose topic is among those of the run, when they are asked for.
    const cases = kinds.includes('cases') ? casesOfTopics(stages, topicIds) : [];
    const mixPool: MixPool = { ...pool, cases };
    // Runs that were left without stopping count too, so a run never gets the seeds of an earlier one.
    const seed = marathonSeed(practicePlayCount('marathon', attempts, sessionResults));
    const mastery = Object.fromEntries(Object.entries(progress.concepts).map(([id, c]) => [id, c.mastery]));
    const first = mixIsEmpty(mixPool, difficulty) ? [] : mixBatch({ pool: mixPool, seed, difficulty, mastery, served: [], answers: [] });
    const recordAs = mixed ? recordScope(topicIds) : scope;
    return {
      startedAt: Date.now(),
      sessionId: newId(),
      pool: mixPool,
      seed,
      mastery,
      items: first.map(asItem),
      xpBefore: progress.xp,
      answeredRight: new Set(attempts.filter((a) => a.correct).map((a) => a.questionId)),
      seen: new Set(attempts.map((a) => a.questionId)),
      recordAs,
      title: mixed ? mixTitle(topicIds) : marathonTitle(scope),
      bestBefore: personalBests(sessionResults)[recordAs],
      covered,
      mix: mixed ? { topicIds: [...topicIds], kinds } : null,
    };
  });
  // Where the learner is: Marathon, then what the run is on.
  useShellTrail([{ label: 'Marathon', href: PICKER_HREF }, { label: boot.title }]);

  // Nothing to ask writes nothing: the runner is never mounted for it.
  if (boot.items.length === 0) {
    return (
      <Frame>
        <div data-testid="marathon-empty" className="flex flex-col items-start gap-4 rounded-card border-2 border-dashed border-edge-deep bg-canvas p-5">
          <h1 className="text-2xl font-extrabold">Nothing to practise yet</h1>
          <p className="text-base">
            {boot.mix
              ? boot.mix.topicIds.length === 0 || boot.mix.kinds.length === 0
                ? 'Choose at least one topic and one kind of question, then start again.'
                : 'There is nothing of that kind in the topics you chose yet. Choose more topics or kinds, or choose Mixed.'
              : difficulty === 'mixed'
                ? 'This topic has no questions yet.'
                : boot.covered
                  ? `There is nothing ${DIFFICULTY_NAME[difficulty].toLowerCase()} in the subtopics you ticked. Tick more subtopics, or choose Mixed.`
                  : `There is nothing ${DIFFICULTY_NAME[difficulty].toLowerCase()} here. Choose Mixed.`}
          </p>
          <Link href={PICKER_HREF} className={buttonClasses('primary')}>
            Back to Marathon
          </Link>
        </div>
      </Frame>
    );
  }
  return <Runner {...props} difficulty={difficulty} boot={boot} />;
}

function Runner({ difficulty, profile, onAgain, boot }: Omit<RunProps, 'setup'> & { difficulty: MarathonDifficulty; boot: Boot }) {
  const { store, persistent } = useStore();
  const { reload } = useProgress();
  const [state, dispatch] = useReducer(sessionReducer, boot.items, (list) => startSession(list, Date.now()));
  /** When the run ended (the learner pressed Stop, or nothing was left to ask); null while it is on. */
  const [stoppedAt, setStoppedAt] = useState<number | null>(null);
  const [settled, setSettled] = useState(false);
  const [saveFailed, setSaveFailed] = useState(false);
  const scope = boot.recordAs;

  const tally = tallyOf(state.attempts);
  const over = stoppedAt !== null;

  // Each answer is written as it is given, one after another, so closing the app loses nothing; the record of the
  // run follows when it is stopped (or the scope has nothing more to ask).
  const written = useRef(0);
  const resultWritten = useRef(false);
  const queue = useRef<Promise<void>>(Promise.resolve());
  // What a run that is left without Stop is recorded from: its answers so far, and when the last one was given.
  const latest = useRef({ attempts: state.attempts, at: boot.startedAt });
  useEffect(() => {
    const enqueue = (job: () => Promise<void>) => {
      queue.current = queue.current.then(job).catch(() => setSaveFailed(true));
    };
    while (written.current < state.attempts.length) {
      const draft = state.attempts[written.current++];
      const asked = state.items.find((i) => i.kind === 'question' && i.question.id === draft.questionId);
      const event: AttemptEvent = {
        ...draft,
        id: newId(),
        profileId: profile.id,
        courseId: profile.courseId,
        topicId: asked?.kind === 'question' ? asked.question.topicId : '',
        sessionId: boot.sessionId,
        sessionKind: 'marathon',
        at: Date.now(),
      };
      latest.current = { attempts: state.attempts, at: event.at };
      enqueue(() => store.appendAttempt(event));
    }
    if (stoppedAt !== null && !resultWritten.current) {
      resultWritten.current = true;
      const at = stoppedAt;
      const record = marathonResult({ profile, sessionId: boot.sessionId, scope, tally: tallyOf(state.attempts), timeMs: at - boot.startedAt, at });
      enqueue(async () => {
        try {
          // A run with no answer leaves no record: there is nothing to count.
          if (record.total > 0) await store.appendSessionResult(record);
          await reload();
        } finally {
          setSettled(true);
        }
      });
    }
  }, [state.attempts, state.items, stoppedAt, store, profile, boot, scope, reload]);

  // Leaving without Stop (the back button, a link): the run ends with its last answer and is recorded as it stands.
  const latestReload = useRef(reload);
  const env = useRef({ store, profile, scope });
  useEffect(() => {
    latestReload.current = reload;
    env.current = { store, profile, scope };
  }, [reload, store, profile, scope]);
  const mounted = useRef(false);
  useEffect(() => {
    const saved = { mounted, resultWritten, queue, latest, env, latestReload };
    saved.mounted.current = true;
    return () => {
      saved.mounted.current = false;
      // In development React mounts every component twice: only a run that stays unmounted has been left.
      setTimeout(() => {
        if (saved.mounted.current || saved.resultWritten.current) return;
        saved.resultWritten.current = true;
        const { attempts, at } = saved.latest.current;
        const record = marathonResult({
          profile: saved.env.current.profile,
          sessionId: boot.sessionId,
          scope: saved.env.current.scope,
          tally: tallyOf(attempts),
          timeMs: at - boot.startedAt,
          at,
        });
        void saved.queue.current
          .then(async () => {
            if (record.total > 0) await saved.env.current.store.appendSessionResult(record);
          })
          .catch(() => undefined)
          .then(() => saved.latestReload.current());
      }, 0);
    };
  }, [boot]);

  // Move keyboard and screen-reader focus to the new question.
  const mainRef = useRef<HTMLElement>(null);
  const shownIndex = useRef(state.index);
  useEffect(() => {
    if (shownIndex.current === state.index) return;
    shownIndex.current = state.index;
    mainRef.current?.focus({ preventScroll: true });
    window.scrollTo({ top: 0, behavior: 'instant' });
  }, [state.index]);

  // The case of a case study stays as the learner left it (open or folded) from one question of the case to the next.
  const [caseView, setCaseView] = useState<CaseView | null>(null);

  const item = currentItem(state);
  const lastIndex = state.attempts.length - 1;
  const lastAttempt = state.attempts[lastIndex];
  const xp = lastAttempt ? attemptXp(state.attempts, lastIndex, boot.answeredRight, boot.seen) : 0;

  // The learner has reached the last question made so far: the next few are made now, from what has been answered.
  const next = () => {
    if (state.index >= state.items.length - 1) {
      const served = state.items.flatMap((i) => (i.kind === 'question' ? [i.question] : []));
      const batch = mixBatch({ pool: boot.pool, seed: boot.seed, difficulty, mastery: boot.mastery, served, answers: state.attempts });
      if (batch.length > 0) dispatch({ type: 'append', items: batch.map(asItem) });
      // Nothing left to ask (a small topic at one difficulty): the run is over, as if it had been stopped.
      else setStoppedAt(Date.now());
    }
    dispatch({ type: 'next', now: Date.now() });
  };

  const announcement =
    state.phase === 'feedback' && item?.kind === 'question' && lastAttempt
      ? [feedbackTitle(lastAttempt.correct, state.revealed) + '.', `${xp} XP.`, describeWrong(item.question, lastAttempt.mistakeCode) ?? ''].join(' ')
      : '';

  let body: ReactNode = null;
  if (stoppedAt !== null) {
    body = settled ? (
      <MarathonSummary
        boot={boot}
        difficulty={difficulty}
        attempts={state.attempts}
        items={state.items}
        tally={tally}
        timeMs={stoppedAt - boot.startedAt}
        onAgain={onAgain}
      />
    ) : (
      <p aria-busy="true" data-testid="marathon-saving" className={NOTICE}>
        Saving your run…
      </p>
    );
  } else if (item?.kind === 'question') {
    const context = item.question.context;
    const position = context ? casePosition(item.question) : null;
    body = (
      <QuestionStage
        key={state.index}
        question={item.question}
        state={state}
        dispatch={dispatch}
        xp={xp}
        onNext={next}
        caseView={
          context
            ? {
                open: isCaseOpen(caseView, context),
                onToggle: () => setCaseView((view) => toggleCase(view, context)),
                note: position ? `Question ${position.number} of ${position.of} in this case` : undefined,
              }
            : undefined
        }
      />
    );
  }

  const subline = [
    boot.mix ? `${boot.title} · ${boot.mix.kinds.map((k) => MIX_KIND_LABEL[k].toLowerCase()).join(', ')}` : '',
    tally.answered > 0 ? `${accuracyOf(tally.correct, tally.answered)}% right` : '',
  ].filter(Boolean);

  return (
    <div className="flex min-h-dvh flex-col">
      <header data-player-bar className="sticky top-0 z-10 border-b border-edge bg-surface">
        <div className="mx-auto flex w-full max-w-4xl items-center gap-3 px-4 py-2">
          {over ? (
            <p className="min-w-0 flex-1 truncate py-2 text-base font-extrabold">Marathon: {boot.title}</p>
          ) : (
            <>
              <Button variant="secondary" data-testid="marathon-stop" onClick={() => setStoppedAt(Date.now())} className="shrink-0 px-4!">
                Stop
              </Button>
              <dl data-testid="marathon-tally" aria-label={`Marathon: ${boot.title}`} className="grid min-w-0 flex-1 grid-cols-5 gap-1 text-center">
                <TallyCell label="Done" name="Answered" value={tally.answered} testId="tally-answered" />
                <TallyCell label="Right" name="Correct" value={tally.correct} testId="tally-correct" />
                <TallyCell label="Streak" name="Current streak" value={tally.streak} testId="tally-streak" />
                <TallyCell label="Best" name="Best streak of this run" value={tally.bestStreak} testId="tally-best" />
                <Elapsed since={boot.startedAt} />
              </dl>
            </>
          )}
        </div>
        {!over && subline.length > 0 ? (
          <p data-testid="tally-accuracy" className="mx-auto w-full max-w-4xl truncate px-4 pb-1 text-sm font-bold text-muted">
            {subline.join(' · ')}
          </p>
        ) : null}
        {boot.covered && !over ? (
          <p data-testid="marathon-covered" className="mx-auto w-full max-w-4xl truncate px-4 pb-2 text-sm font-bold text-muted">
            {coveredText(boot.covered)}
          </p>
        ) : null}
      </header>

      {!persistent || saveFailed ? (
        <p role="status" data-testid="player-save-warning" className="border-b-2 border-accent bg-accent-soft px-4 py-3 text-base font-semibold text-accent-ink">
          {saveFailed ? "Some of your progress couldn't be saved." : "Progress can't be saved on this device right now."}
        </p>
      ) : null}

      <main ref={mainRef} tabIndex={-1} className="mx-auto w-full max-w-4xl flex-1 px-4 pb-8 pt-6 outline-none">
        {body}
      </main>

      <p role="status" className="sr-only">
        {announcement}
      </p>
    </div>
  );
}

function TallyCell({ label, name, value, testId }: { label: string; name: string; value: number | string; testId: string }) {
  return (
    <div className="flex min-w-0 flex-col-reverse">
      <dt className="truncate text-[11px] font-bold leading-tight text-muted">
        <span aria-hidden="true">{label}</span>
        <span className="sr-only">{name}</span>
      </dt>
      <dd data-testid={testId} className="text-base font-extrabold leading-tight tabular-nums">
        {value}
      </dd>
    </div>
  );
}

/** The time since the run began, counting up by itself once a second. */
function Elapsed({ since }: { since: number }) {
  const [now, setNow] = useState(since);
  useEffect(() => {
    const tick = () => setNow(Date.now());
    const timer = setInterval(tick, 1000);
    return () => clearInterval(timer);
  }, []);
  return <TallyCell label="Time" name="Time so far" value={formatElapsed(now - since)} testId="tally-time" />;
}

/** One line of a table of accuracy: a name, "3 of 4 · 75%". */
function AccuracyRow({ name, answered, correct, testId, note }: { name: string; answered: number; correct: number; testId: string; note?: ReactNode }) {
  return (
    <li data-testid={testId} className="flex items-baseline justify-between gap-3 text-base font-bold">
      <span className="min-w-0">
        {name}
        {note}
      </span>
      <span className="shrink-0 tabular-nums">
        {correct} of {answered} · {accuracyOf(correct, answered)}%
      </span>
    </li>
  );
}

/** After a run: what was done, how it compares with the learner's best, where it went wrong, and what to do next. */
function MarathonSummary({
  boot,
  difficulty,
  attempts,
  items,
  tally,
  timeMs,
  onAgain,
}: {
  boot: Boot;
  difficulty: MarathonDifficulty;
  attempts: readonly AttemptDraft[];
  items: readonly SessionItem[];
  tally: Tally;
  timeMs: number;
  onAgain(): void;
}) {
  const { progress, sessionResults } = useProgress();
  const headingRef = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    headingRef.current?.focus();
  }, []);
  const { covered, bestBefore, xpBefore, sessionId } = boot;

  // Only a total that already includes this run is shown; never a guess in between. A run with no answer has no record.
  const saved = progress !== null && (tally.answered === 0 || sessionResults.some((r) => r.id === marathonResultId(sessionId)));
  const beaten = tally.answered > 0 ? newBests(bestBefore, tally) : { answered: false, streak: false };
  const best = { answered: Math.max(bestBefore?.answered ?? 0, tally.answered), streak: Math.max(bestBefore?.streak ?? 0, tally.bestStreak) };
  const concepts = accuracyByConcept(attempts);
  const weakest = weakestConcept(concepts);
  // The questions missed in this run that are still waiting on the Mistakes list.
  const missed = new Set(attempts.filter((a) => !a.correct).map((a) => a.questionId));
  const open = progress ? openMistakeIds(progress) : [];
  const waiting = open.filter((questionId) => missed.has(questionId)).length;
  // By topic and by kind, from the questions the run served.
  const byId = new Map(items.flatMap((i) => (i.kind === 'question' ? [[i.question.id, i.question] as const] : [])));
  const byTopic = accuracyBy(attempts, (id) => byId.get(id)?.topicId);
  const byKind = accuracyBy(attempts, (id) => {
    const q = byId.get(id);
    return q ? answerKindOf(q) : undefined;
  });

  return (
    <section data-testid="marathon-summary" aria-labelledby="marathon-summary-heading" className="flex flex-col gap-6">
      <div className="flex flex-col items-center gap-3 rounded-card border border-primary bg-primary-soft p-6 text-center shadow-card">
        <h1 id="marathon-summary-heading" ref={headingRef} tabIndex={-1} className="text-3xl font-extrabold tracking-tight text-primary-ink outline-none">
          Marathon stopped
        </h1>
        <p className="text-base font-bold">
          {boot.title} · {DIFFICULTY_NAME[difficulty]}
        </p>
        {covered ? (
          <p data-testid="marathon-summary-covered" className="text-base font-bold">
            {coveredText(covered)}
          </p>
        ) : null}
        <p data-testid="marathon-score" className="text-xl font-bold">
          {tally.correct} of {tally.answered} correct
        </p>
        {beaten.answered || beaten.streak ? (
          <p data-testid="marathon-new-best" className="inline-flex min-h-8 items-center rounded-full bg-accent px-4 text-base font-extrabold text-on-accent">
            New best! {[beaten.answered ? 'Most answered' : '', beaten.streak ? 'Longest streak' : ''].filter(Boolean).join(' and ')}
          </p>
        ) : null}
      </div>

      <dl className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <Stat label="Answered" testId="marathon-answered" value={String(tally.answered)} />
        <Stat label="Correct" testId="marathon-correct" value={String(tally.correct)} />
        <Stat label="Accuracy" testId="marathon-accuracy" value={tally.answered === 0 ? '–' : `${accuracyOf(tally.correct, tally.answered)}%`} />
        <Stat label="Best streak" testId="marathon-streak" value={String(tally.bestStreak)} />
        <Stat label="Time" testId="marathon-time" value={formatElapsed(timeMs)} />
        <Stat label="XP earned" testId="marathon-xp" value={saved ? `+${progress.xp - xpBefore} XP` : '–'} accent />
      </dl>

      {best.answered > 0 ? (
        <p data-testid="marathon-best" className="text-base font-bold text-muted">
          Your best here: {best.answered} answered in one run · longest streak {best.streak}
        </p>
      ) : null}

      {byTopic.length > 0 ? (
        <div className="grid gap-4 md:grid-cols-2">
          <Card data-testid="marathon-by-topic" className="flex flex-col gap-3 p-4!">
            <h2 className="text-lg font-extrabold text-primary-ink">By topic</h2>
            <ul className="flex flex-col gap-2">
              {byTopic.map((r) => (
                <AccuracyRow key={r.key} name={topicTitle(r.key)} answered={r.answered} correct={r.correct} testId={`marathon-topic-${r.key}`} />
              ))}
            </ul>
          </Card>
          <Card data-testid="marathon-by-kind" className="flex flex-col gap-3 p-4!">
            <h2 className="text-lg font-extrabold text-primary-ink">By kind</h2>
            <ul className="flex flex-col gap-2">
              {byKind.map((r) => (
                <AccuracyRow key={r.key} name={ANSWER_KIND_LABEL[r.key as AnswerKind]} answered={r.answered} correct={r.correct} testId={`marathon-bykind-${r.key}`} />
              ))}
            </ul>
          </Card>
        </div>
      ) : null}

      {concepts.length > 0 ? (
        <Card data-testid="marathon-concepts" className="flex flex-col gap-3 p-4!">
          <h2 className="text-lg font-extrabold text-primary-ink">Accuracy by idea</h2>
          <ul className="flex flex-col gap-2">
            {concepts.map((c) => (
              <AccuracyRow
                key={c.conceptId}
                name={findConceptTitle(c.conceptId) ?? c.conceptId}
                answered={c.answered}
                correct={c.correct}
                testId={`marathon-concept-${c.conceptId}`}
                note={weakest?.conceptId === c.conceptId ? <span className="ml-2 text-sm font-extrabold text-danger-deep">Weakest</span> : null}
              />
            ))}
          </ul>
        </Card>
      ) : null}

      <Card data-testid="marathon-mistakes" className="flex flex-col gap-3 p-4!">
        <h2 className="text-lg font-extrabold text-primary-ink">Mistakes</h2>
        {open.length === 0 ? (
          <p className="text-base font-bold">No mistakes waiting. Nicely done.</p>
        ) : (
          <>
            <p className="text-base">
              {waiting > 0
                ? `${waiting} ${waiting === 1 ? 'question' : 'questions'} from this run ${waiting === 1 ? 'is' : 'are'} on your Mistakes list (${open.length} in all).`
                : `${open.length} ${open.length === 1 ? 'mistake is' : 'mistakes are'} waiting on your Mistakes list.`}
            </p>
            <Link href="/mistakes" data-testid="marathon-review" className={buttonClasses('secondary', 'md', 'w-full sm:w-auto sm:self-start')}>
              Review mistakes
            </Link>
          </>
        )}
      </Card>

      <div className="flex flex-col gap-3 sm:flex-row-reverse">
        <Button size="lg" data-testid="marathon-again" onClick={onAgain} className="w-full sm:flex-1">
          Run again
        </Button>
        <Link href={PRACTICE_HREF} data-testid="marathon-back" className={buttonClasses('secondary', 'lg', 'w-full sm:flex-1')}>
          Back to Practice
        </Link>
      </div>
    </section>
  );
}

function Stat({ label, value, testId, accent = false }: { label: string; value: string; testId: string; accent?: boolean }) {
  return (
    <div className="flex flex-col-reverse rounded-card border border-edge bg-surface p-3 text-center shadow-card">
      <dt className="text-sm font-bold text-muted">{label}</dt>
      <dd data-testid={testId} className={`text-2xl font-extrabold tabular-nums ${accent ? 'text-accent-ink' : ''}`}>
        {value}
      </dd>
    </div>
  );
}
