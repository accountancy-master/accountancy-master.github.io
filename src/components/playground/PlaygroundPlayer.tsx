'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useReducer, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { useStore } from '@/app-state/StoreProvider';
import { useProgress } from '@/app-state/useProgress';
import { feedbackTitle } from '@/components/play/FeedbackPanel';
import { Frame, LoadError, Loading } from '@/components/play/PlayFrame';
import { useShellTrail } from '@/components/shell/ShellContext';
import { QuestionStage } from '@/components/play/QuestionStage';
import { Button, buttonClasses } from '@/components/ui/Button';
import { Chip } from '@/components/ui/Chip';
import { ArrowLeftIcon } from '@/components/ui/icons';
import { TopicsGate } from '@/components/ui/TopicsGate';
import { outlinesOf } from '@/content/outline';
import type { Question } from '@/content/types';
import { choiceOf, type CourseChoice } from '@/content/courseOptions';
import { DIFFICULTY_LABEL, TEMPLATE_KIND_LABEL, coursePatterns, filterPatterns, type Pattern, type PatternFilters, type PlaygroundPlay } from '@/learning/patterns';
import { MAX_PLAYGROUND_PLAYS, SEEDS_PER_PLAY, pickPattern, playgroundPlayCount, playgroundSeed, playgroundUnit } from '@/learning/playground';
import { newId } from '@/lib/ids';
import { casePosition, isCaseOpen, toggleCase, type CaseView } from '@/play/caseStudy';
import { describeWrong } from '@/play/mistakeText';
import { attemptXp, currentItem, sessionReducer, startSession, type AttemptDraft } from '@/play/session';
import { tallyOf, accuracyOf } from '@/play/marathonRun';
import type { AttemptEvent, Profile } from '@/storage/types';
import { partsLine } from './PatternCard';

const LOADING = 'Getting your questions ready…';

/** The patterns a play is over, of the learner's course only, and of the topics they meet (Part B of Class 12 as chosen). */
function patternsOf(play: PlaygroundPlay, filters: PatternFilters, courseId: string, choice: CourseChoice): Pattern[] {
  const all = coursePatterns(courseId, choice);
  if (play.kind === 'pattern') return all.filter((p) => p.id === play.id);
  if (play.kind === 'shown') return filterPatterns(all, filters);
  const ids = new Set(play.ids);
  return all.filter((p) => ids.has(p.id));
}

/**
 * A play of the Playground: one pattern (`?pattern=<id>`), or a mix of patterns (`?mix=<ids>`, or `?mix=shown` for
 * every pattern the filters in the address show), question after question until the learner goes back. Every answer
 * is recorded as an ordinary practice answer.
 */
export function PlaygroundPlayer({ play, filters, backHref }: { play: PlaygroundPlay; filters: PatternFilters; backHref: string }) {
  const { profile } = useStore();
  const router = useRouter();
  const { progress, status, reload } = useProgress();

  useEffect(() => {
    if (!profile) router.replace('/start');
  }, [profile, router]);

  const patterns = useMemo(() => (profile ? patternsOf(play, filters, profile.courseId, choiceOf(profile)) : []), [play, filters, profile]);

  if (!profile) return <div aria-busy="true" data-testid="player-redirecting" className="min-h-dvh" />;
  if (status === 'error') return <LoadError onRetry={() => void reload()} />;
  if (status !== 'ready' || progress === null) return <Loading>{LOADING}</Loading>;

  if (patterns.length === 0) {
    return (
      <Frame>
        <div data-testid="playground-missing" className="flex flex-col items-start gap-4 rounded-card border border-dashed border-edge-deep bg-sunken p-5">
          <h1 className="text-2xl font-extrabold">Nothing to play here</h1>
          <p className="text-base">This question type is not one of your course, or none matches what was chosen.</p>
          <Link href={backHref} className={buttonClasses('primary')}>
            Back to the Playground
          </Link>
        </div>
      </Frame>
    );
  }

  // The topics of the patterns, in course order: their content is fetched now, and only theirs.
  const wanted = new Set(patterns.map((p) => p.topicId));
  const topicIds = outlinesOf(profile.courseId, choiceOf(profile)).map((o) => o.topicId).filter((id) => wanted.has(id));
  return (
    <TopicsGate page topicIds={topicIds} loading={LOADING}>
      {() => <Run profile={profile} patterns={patterns} backHref={backHref} />}
    </TopicsGate>
  );
}

interface Tally {
  answered: number;
  correct: number;
  streak: number;
}

function Run({ profile, patterns, backHref }: { profile: Profile; patterns: Pattern[]; backHref: string }) {
  const { store, persistent } = useStore();
  const { attempts, reload } = useProgress();
  const ids = useMemo(() => patterns.map((p) => p.id), [patterns]);

  // Fixed for the play: its session, its block of seeds and what had been answered right before it.
  const [boot] = useState(() => ({
    sessionId: newId(),
    seed: playgroundSeed(playgroundPlayCount(attempts) % MAX_PLAYGROUND_PLAYS),
    answeredRight: new Set(attempts.filter((a) => a.correct).map((a) => a.questionId)),
    // Every question answered before, right or not: partial XP is for the first answer to a question only.
    seen: new Set(attempts.map((a) => a.questionId)),
  }));
  const [at, setAt] = useState(() => ({ position: 0, patternId: pickPattern(ids, boot.seed, 0) }));
  const pattern = patterns.find((p) => p.id === at.patternId)!;
  const unit = useMemo(() => playgroundUnit(pattern, boot.seed + (at.position % SEEDS_PER_PLAY)), [pattern, boot.seed, at.position]);
  const [answers, setAnswers] = useState<{ correct: boolean }[]>([]);
  const [saveFailed, setSaveFailed] = useState(false);
  const tally: Tally = useMemo(() => {
    const t = tallyOf(answers);
    return { answered: t.answered, correct: t.correct, streak: t.streak };
  }, [answers]);

  const next = () =>
    setAt((now) => {
      const position = now.position + 1;
      return { position, patternId: pickPattern(ids, boot.seed, position, now.patternId) };
    });

  // Each answer is written as it is given, one after another.
  const queue = useRef<Promise<void>>(Promise.resolve());
  const record = (draft: AttemptDraft, question: Question) => {
    if (draft.correct) boot.answeredRight.add(draft.questionId);
    boot.seen.add(draft.questionId);
    setAnswers((list) => [...list, { correct: draft.correct }]);
    const event: AttemptEvent = {
      ...draft,
      id: newId(),
      profileId: profile.id,
      courseId: profile.courseId,
      topicId: question.topicId,
      sessionId: boot.sessionId,
      sessionKind: 'fresh',
      at: Date.now(),
    };
    queue.current = queue.current.then(() => store.appendAttempt(event)).catch(() => setSaveFailed(true));
  };

  // Leaving the play: once its answers are stored, every screen is shown them.
  const latestReload = useRef(reload);
  useEffect(() => {
    latestReload.current = reload;
  }, [reload]);
  useEffect(() => {
    const saved = { queue, latestReload };
    return () => {
      void saved.queue.current.then(() => saved.latestReload.current());
    };
  }, []);

  const single = patterns.length === 1;
  const title = single ? pattern.title : `A mix of ${patterns.length.toLocaleString('en-IN')} question types`;
  // Where the learner is: the Playground (as it was filtered), then what is being played.
  useShellTrail([{ label: 'Playground', href: backHref }, { label: title }]);

  return (
    <div className="flex min-h-dvh flex-col">
      <header data-player-bar className="sticky top-0 z-10 border-b border-edge bg-surface">
        <div className="mx-auto flex w-full max-w-4xl items-center gap-3 px-4 py-2">
          <Link href={backHref} data-testid="playground-back" aria-label="Back to the Playground" className={buttonClasses('ghost', 'md', 'shrink-0 px-2!')}>
            <ArrowLeftIcon />
            <span className="hidden sm:inline">Playground</span>
          </Link>
          <p data-testid="playground-title" className="min-w-0 flex-1 truncate text-base font-extrabold">
            {title}
          </p>
          <dl aria-label="This play so far" className="grid shrink-0 grid-cols-3 gap-2 text-center">
            <TallyCell label="Done" name="Answered" value={tally.answered} testId="pg-answered" />
            <TallyCell label="Right" name="Correct" value={tally.correct} testId="pg-correct" />
            <TallyCell label="Streak" name="Correct in a row" value={tally.streak} testId="pg-streak" />
          </dl>
        </div>
        <div className="mx-auto flex w-full max-w-4xl flex-wrap items-center gap-1.5 px-4 pb-2">
          {!single ? (
            <span data-testid="playground-now" className="min-w-0 truncate text-sm font-bold text-muted">
              Now: {pattern.title}
            </span>
          ) : null}
          <Chip tone={pattern.kind === 'case' ? 'accent' : 'primary'} className="min-h-7! px-2.5! text-xs!">
            {pattern.kind === 'case' ? `Case study · ${partsLine(pattern)}` : TEMPLATE_KIND_LABEL[pattern.parts[0]]}
          </Chip>
          <Chip className="min-h-7! px-2.5! text-xs!">{DIFFICULTY_LABEL[pattern.difficulty]}</Chip>
          {tally.answered > 0 ? (
            <span data-testid="pg-accuracy" className="text-sm font-bold text-muted">
              {accuracyOf(tally.correct, tally.answered)}% right
            </span>
          ) : null}
        </div>
      </header>

      {!persistent || saveFailed ? (
        <p role="status" data-testid="player-save-warning" className="border-b-2 border-accent bg-accent-soft px-4 py-3 text-base font-semibold text-accent-ink">
          {saveFailed ? "Some of your progress couldn't be saved." : "Progress can't be saved on this device right now."}
        </p>
      ) : null}

      <UnitStage key={at.position} questions={unit} answeredBefore={boot.answeredRight} seenBefore={boot.seen} onAnswer={record} onDone={next} anotherLabel={pattern.kind === 'case' ? 'Another case' : 'Another one'} />
    </div>
  );
}

function TallyCell({ label, name, value, testId }: { label: string; name: string; value: number; testId: string }) {
  return (
    <div className="flex min-w-10 flex-col-reverse">
      <dt className="text-[11px] font-bold leading-tight text-muted">
        <span aria-hidden="true">{label}</span>
        <span className="sr-only">{name}</span>
      </dt>
      <dd data-testid={testId} className="text-base font-extrabold leading-tight tabular-nums">
        {value}
      </dd>
    </div>
  );
}

/** One question of a template, or the questions of one case in order: answered, checked, and on to the next. */
function UnitStage({
  questions,
  answeredBefore,
  seenBefore,
  onAnswer,
  onDone,
  anotherLabel,
}: {
  questions: Question[];
  answeredBefore: ReadonlySet<string>;
  seenBefore: ReadonlySet<string>;
  onAnswer(draft: AttemptDraft, question: Question): void;
  onDone(): void;
  anotherLabel: string;
}) {
  const [state, dispatch] = useReducer(sessionReducer, questions, (list) => startSession(list.map((question) => ({ kind: 'question' as const, question })), Date.now()));
  // What had been answered right when the unit began: the XP of an answer is worked out against it.
  const [before] = useState(() => new Set(answeredBefore));
  const [seen] = useState(() => new Set(seenBefore));

  const reported = useRef(0);
  useEffect(() => {
    while (reported.current < state.attempts.length) {
      const draft = state.attempts[reported.current++];
      const question = questions.find((q) => q.id === draft.questionId);
      if (question) onAnswer(draft, question);
    }
  }, [state.attempts, questions, onAnswer]);

  // Keyboard and screen-reader focus go to each new question.
  const mainRef = useRef<HTMLElement>(null);
  const shown = useRef(state.index);
  useEffect(() => {
    if (shown.current === state.index) return;
    shown.current = state.index;
    mainRef.current?.focus({ preventScroll: true });
    window.scrollTo({ top: 0, behavior: 'instant' });
  }, [state.index]);

  const [caseView, setCaseView] = useState<CaseView | null>(null);
  const item = currentItem(state);
  const lastIndex = state.attempts.length - 1;
  const lastAttempt = state.attempts[lastIndex];
  const xp = lastAttempt ? attemptXp(state.attempts, lastIndex, before, seen) : 0;
  const next = () => (state.index >= state.items.length - 1 ? onDone() : dispatch({ type: 'next', now: Date.now() }));

  let body: ReactNode = null;
  if (item?.kind === 'question') {
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

  const announcement =
    state.phase === 'feedback' && item?.kind === 'question' && lastAttempt
      ? [feedbackTitle(lastAttempt.correct, state.revealed) + '.', `${xp} XP.`, describeWrong(item.question, lastAttempt.mistakeCode) ?? ''].join(' ')
      : '';

  return (
    <>
      <main ref={mainRef} tabIndex={-1} className="mx-auto flex w-full max-w-4xl flex-1 flex-col gap-4 px-4 pb-8 pt-4 outline-none">
        <div className="flex flex-wrap items-center justify-end gap-2">
          {state.phase === 'playing' ? (
            <Button variant="ghost" data-testid="pg-working" onClick={() => dispatch({ type: 'reveal', now: Date.now() })}>
              Show the working
            </Button>
          ) : null}
          <Button variant="secondary" data-testid="pg-another" onClick={onDone}>
            {anotherLabel}
          </Button>
        </div>
        {body}
      </main>
      <p role="status" className="sr-only">
        {announcement}
      </p>
    </>
  );
}
