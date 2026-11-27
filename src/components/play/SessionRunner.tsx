'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useReducer, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { useStore } from '@/app-state/StoreProvider';
import { useProgress } from '@/app-state/useProgress';
import { Button } from '@/components/ui/Button';
import { useLeaveGuard, type LeaveTarget } from '@/components/shell/ShellContext';
import { ProgressBar } from '@/components/ui/ProgressBar';
import { countScored, type SessionItem } from '@/learning/sessionBuilder';
import { newId } from '@/lib/ids';
import { casePosition, isCaseOpen, toggleCase, type CaseView } from '@/play/caseStudy';
import { allowsSimilar } from '@/play/practiceModes';
import {
  attemptXp,
  canInsertSimilar,
  canRetryCheck,
  currentItem,
  scoredAttempts,
  sessionReducer,
  startSession,
  summarize,
} from '@/play/session';
import { describeWrong } from '@/play/mistakeText';
import { similarTo } from '@/play/similar';
import type { AttemptEvent, CardReviewEvent, Profile, ProgressStore, SessionKind } from '@/storage/types';
import { CardView } from './CardView';
import { feedbackTitle, isAlmost } from './FeedbackPanel';
import { LessonView } from './LessonView';
import { NOTICE } from './PlayFrame';
import { QuestionClock } from './QuestionClock';
import { QuestionStage } from './QuestionStage';

export type SessionSummary = ReturnType<typeof summarize>;

export interface SessionRunnerProps {
  profile: Profile;
  kind: SessionKind;
  items: SessionItem[];
  sessionId: string;
  /** Set for level sessions; stored on each attempt. */
  levelId?: string;
  /**
   * Set for level sessions: the level's topic, stored on each attempt. A look-back level asks questions of earlier
   * topics too, and answering them is still play of this topic. Elsewhere an attempt belongs to its question's topic.
   */
  topicId?: string;
  passMark?: number;
  /** Names the session in the progress bar's label. */
  title: string;
  /** What the close button and the leave warning call this session. */
  noun: 'level' | 'session';
  /** Where closing goes. */
  exitHref: string;
  /**
   * Set for a level played against the clock: the seconds each of its questions allows. Every question then has a
   * countdown of its own, and one that runs out is closed as a wrong answer.
   */
  secondsPerQuestion?: number;
  /** One quiet line over every step, for what this session leaves out (the clock of a timed level, switched off). */
  note?: string;
  /**
   * Stores the finished session's record (a level result, or a session result). Called once, after every answer
   * and card rating has been stored, as soon as the last scored question is answered (or the session is done).
   * Extra questions (inserted similar ones) are not part of the summary.
   */
  saveResult(store: ProgressStore, summary: SessionSummary): Promise<void>;
  /** The results screen. Shown once the record has been stored and the shared progress reloaded. */
  renderResults(r: { summary: SessionSummary; xpBefore: number; cardsRated: number }): ReactNode;
}

/**
 * Plays one session: shows each item, collects answers, stores every attempt and card rating exactly once in order,
 * then the session's own record. Level and practice screens are thin wrappers that build the items and the results.
 */
export function SessionRunner({
  profile,
  kind,
  items,
  sessionId,
  levelId,
  topicId,
  passMark,
  title,
  noun,
  exitHref,
  secondsPerQuestion,
  note,
  saveResult,
  renderResults,
}: SessionRunnerProps) {
  const { store, persistent } = useStore();
  const router = useRouter();
  const { progress, attempts, reload } = useProgress();

  // Read once for this run: later re-renders (and the progress reload at the end) never change them.
  const [boot] = useState(() => ({
    xpBefore: progress?.xp ?? 0,
    // Questions (authored or generated) the learner has already answered correctly, which earn only the replay amount again.
    answeredRight: new Set(attempts.filter((a) => a.correct).map((a) => a.questionId)),
    // Every question answered before, right or not: partial XP is for the first answer to a question only.
    seen: new Set(attempts.map((a) => a.questionId)),
  }));
  const [state, dispatch] = useReducer(sessionReducer, items, (list) => startSession(list, Date.now()));

  // How many answers and ratings the shared progress was last reloaded with; null until the first reload.
  const [settledTotal, setSettledTotal] = useState<number | null>(null);
  const [saveFailed, setSaveFailed] = useState(false);
  // Where the learner asked to go while answers of an unfinished run would be left behind: asked once before going.
  const [leaving, setLeaving] = useState<LeaveTarget | null>(null);

  // Each attempt and each card rating (by its index), then the session's record, are written once, in order,
  // one after another.
  const writtenAttempts = useRef(0);
  const writtenRatings = useRef(0);
  const resultWritten = useRef(false);
  // The answers and ratings (counted together) that the newest queued reload of the shared progress includes.
  const reloadedTotal = useRef(0);
  const queue = useRef<Promise<void>>(Promise.resolve());
  const latestSave = useRef(saveResult);
  useEffect(() => {
    latestSave.current = saveResult;
  }, [saveResult]);
  useEffect(() => {
    const enqueue = (job: () => Promise<void>) => {
      queue.current = queue.current.then(job).catch(() => setSaveFailed(true));
    };
    // The answers and ratings that are new in this pass, each as the write that stores it.
    const fresh: (() => Promise<void>)[] = [];
    while (writtenAttempts.current < state.attempts.length) {
      const draft = state.attempts[writtenAttempts.current++];
      const asked = state.items.find((i) => i.kind === 'question' && i.question.id === draft.questionId);
      const event: AttemptEvent = {
        ...draft,
        id: newId(),
        profileId: profile.id,
        courseId: profile.courseId,
        topicId: topicId ?? (asked?.kind === 'question' ? asked.question.topicId : ''),
        sessionId,
        ...(levelId ? { levelId } : {}),
        sessionKind: kind,
        at: Date.now(),
      };
      fresh.push(() => store.appendAttempt(event));
    }
    while (writtenRatings.current < state.cardRatings.length) {
      const rating = state.cardRatings[writtenRatings.current++];
      const event: CardReviewEvent = {
        id: newId(),
        profileId: profile.id,
        courseId: profile.courseId,
        topicId: rating.topicId,
        cardId: rating.cardId,
        conceptId: rating.conceptId,
        known: rating.known,
        at: Date.now(),
        sessionId,
      };
      fresh.push(() => store.appendCardReview(event));
    }
    // The record is saved as soon as the last scored question has been answered (or its answer shown), so it never
    // depends on the learner pressing Continue. Sessions with nothing to score save when they are done.
    // Extra questions are not scored: a similar question taken after the last one is played after the save, and
    // the progress is reloaded once more when the session is done so that its XP shows in the results.
    const scored = countScored(state.items);
    const lastScoredAnswered = scored > 0 && scoredAttempts(state) >= scored;
    const written = state.attempts.length + state.cardRatings.length;
    const recordDue = (lastScoredAnswered || state.phase === 'done') && !resultWritten.current;
    // The record goes in with the answer that completes it, as one write (`appendTogether`). It must not wait until
    // that answer is known to be stored: a learner who leaves the app right after the last answer, on a device that
    // is slow to store, would have the answer and never the record. Now it is both or, at worst, neither.
    if (!recordDue) for (const write of fresh) enqueue(write);
    if (recordDue) {
      resultWritten.current = true;
      reloadedTotal.current = written;
      const summary = summarize(state, { passMark });
      enqueue(async () => {
        try {
          await store.appendTogether(() => Promise.all([...fresh.map((write) => write()), latestSave.current(store, summary)]));
          await reload();
        } finally {
          setSettledTotal(written);
        }
      });
    } else if (state.phase === 'done' && resultWritten.current && written > reloadedTotal.current) {
      reloadedTotal.current = written;
      enqueue(async () => {
        try {
          await reload();
        } finally {
          setSettledTotal(written);
        }
      });
    }
  }, [state, store, profile.id, profile.courseId, sessionId, levelId, topicId, kind, passMark, reload]);

  // Leaving a run with answers or ratings that no reload has included yet (part-way, or during an extra question
  // after the record was saved). Reload once the saves have finished, so every screen (and a replay) sees them.
  const latestReload = useRef(reload);
  useEffect(() => {
    latestReload.current = reload;
  }, [reload]);
  useEffect(() => {
    const saved = { writtenAttempts, writtenRatings, reloadedTotal, queue };
    return () => {
      if (saved.writtenAttempts.current + saved.writtenRatings.current > saved.reloadedTotal.current) {
        void saved.queue.current.then(() => latestReload.current());
      }
    };
  }, []);

  // Move keyboard and screen-reader focus to the new step, and open it at its top, just under the bar of the player.
  const mainRef = useRef<HTMLElement>(null);
  const shownIndex = useRef(state.index);
  useEffect(() => {
    if (shownIndex.current === state.index) return;
    shownIndex.current = state.index;
    mainRef.current?.focus({ preventScroll: true });
    window.scrollTo({ top: 0, behavior: 'instant' });
  }, [state.index]);

  const item = currentItem(state);
  const done = state.phase === 'done';
  const scored = countScored(state.items);
  const finished = done || (scored > 0 && scoredAttempts(state) >= scored);
  const settled = settledTotal !== null && settledTotal >= state.attempts.length + state.cardRatings.length;
  const unfinished = state.attempts.length > 0 && !finished;
  const close = () => (unfinished ? setLeaving({ href: exitHref }) : router.push(exitHref));
  const leave = (target: LeaveTarget) => {
    setLeaving(null);
    void Promise.resolve(target.before?.()).then(() => router.push(target.href));
  };
  // Leaving by the sidebar, the top bar or "Go to" asks the same question as the close button.
  useLeaveGuard(
    unfinished
      ? (target) => {
          setLeaving(target);
          return true;
        }
      : null,
  );
  const next = () => dispatch({ type: 'next', now: Date.now() });

  const lastIndex = state.attempts.length - 1;
  const lastAttempt = state.attempts[lastIndex];
  const xp = lastAttempt ? attemptXp(state.attempts, lastIndex, boot.answeredRight, boot.seen) : 0;
  const announcement =
    state.phase === 'feedback' && item?.kind === 'question' && lastAttempt
      ? [
          feedbackTitle(lastAttempt.correct, state.revealed, state.timedOut, !state.revealed && !state.timedOut && isAlmost(lastAttempt)) + '.',
          `${xp} XP.`,
          describeWrong(item.question, lastAttempt.mistakeCode) ?? '',
        ].join(' ')
      : '';

  // A similar question is an extra, so it may be offered on any question, the last one included: it is recorded
  // as an attempt but never changes the score that was (or will be) saved.
  const similar =
    item?.kind === 'question' && allowsSimilar(kind) && canInsertSimilar(state)
      ? similarTo(item.question, state.items)
      : null;
  const trySimilar = similar
    ? () => {
        dispatch({ type: 'insertNext', item: { kind: 'question', question: similar } });
        next();
      }
    : undefined;

  // A lesson's check that was missed may be tried again, straight away, as an extra question.
  const retry = canRetryCheck(state)
    ? () => {
        dispatch({ type: 'retryCheck' });
        next();
      }
    : undefined;

  // The case of a case study stays as the learner left it (open or folded) from one question of the case to the next.
  const [caseView, setCaseView] = useState<CaseView | null>(null);
  const context = item?.kind === 'question' ? item.question.context : undefined;
  const position = item?.kind === 'question' && context ? casePosition(item.question) : null;
  const shownCase = context
    ? {
        open: isCaseOpen(caseView, context),
        onToggle: () => setCaseView((view) => toggleCase(view, context)),
        note: position ? `Question ${position.number} of ${position.of} in this case` : undefined,
      }
    : undefined;

  let body: ReactNode = null;
  if (done) {
    body = settled ? (
      renderResults({ summary: summarize(state, { passMark }), xpBefore: boot.xpBefore, cardsRated: state.cardRatings.length })
    ) : (
      <p aria-busy="true" data-testid="results-saving" className={NOTICE}>
        Saving your result…
      </p>
    );
  } else if (item?.kind === 'lesson') {
    body = <LessonView key={state.index} blocks={item.blocks} onContinue={next} />;
  } else if (item?.kind === 'card') {
    body = (
      <CardView
        key={state.index}
        card={item.card}
        onRate={(known) => dispatch({ type: 'rateCard', known, now: Date.now() })}
      />
    );
  } else if (item?.kind === 'question') {
    body = (
      <QuestionStage
        key={state.index}
        question={item.question}
        state={state}
        dispatch={dispatch}
        xp={xp}
        onNext={next}
        onSimilar={trySimilar}
        onRetry={retry}
        caseView={shownCase}
      />
    );
  }

  const total = state.items.length;
  const stepsDone = done ? total : state.index;
  // A set of entries, an account or a statement has room to spread on a wide screen; everything else reads in a column.
  const roomy = item?.kind === 'question' && (item.question.type === 'journal_set' || item.question.type === 'account' || item.question.type === 'statement');
  const column = roomy ? 'max-w-3xl lg:max-w-6xl' : 'max-w-3xl';

  return (
    <div className="flex min-h-dvh flex-col">
      <header data-player-bar className="sticky top-0 z-10 border-b-2 border-edge bg-surface">
        <div className={`mx-auto flex w-full ${column} items-center gap-3 px-4 py-2`}>
          <button
            type="button"
            data-testid="player-close"
            aria-label={`Close this ${noun}`}
            onClick={close}
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-control text-muted hover:bg-canvas"
          >
            <svg
              width="24"
              height="24"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.6"
              strokeLinecap="round"
              aria-hidden="true"
            >
              <path d="M6 6l12 12M18 6 6 18" />
            </svg>
          </button>
          <ProgressBar
            value={total === 0 ? 1 : stepsDone / total}
            label={`${title}: ${stepsDone} of ${total} steps done`}
            data-testid="player-progress"
          />
          {/* The clock of the question on screen. It stays, stopped, while the feedback is read. */}
          {secondsPerQuestion !== undefined && item?.kind === 'question' ? (
            <QuestionClock
              key={state.index}
              seconds={secondsPerQuestion}
              stopped={state.phase !== 'playing'}
              onUp={() => dispatch({ type: 'timeUp', now: Date.now() })}
            />
          ) : null}
        </div>
      </header>

      {leaving ? (
        <div
          role="alertdialog"
          aria-labelledby="leave-title"
          data-testid="player-leave-confirm"
          className="border-b-2 border-accent bg-accent-soft"
        >
          <div className="mx-auto flex w-full max-w-3xl flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center">
            <p id="leave-title" className="flex-1 text-base font-bold text-accent-ink">
              Leave this {noun}? The answers you gave are saved, but the {noun} will not be finished.
            </p>
            <div className="flex gap-3">
              <Button variant="secondary" data-testid="player-stay" onClick={() => setLeaving(null)}>
                Keep playing
              </Button>
              <Button variant="danger" data-testid="player-leave" onClick={() => leave(leaving)}>
                Leave
              </Button>
            </div>
          </div>
        </div>
      ) : null}

      {!persistent || saveFailed ? (
        <p
          role="status"
          data-testid="player-save-warning"
          className="border-b-2 border-accent bg-accent-soft px-4 py-3 text-base font-semibold text-accent-ink"
        >
          {saveFailed ? "Some of your progress couldn't be saved." : "Progress can't be saved on this device right now."}
        </p>
      ) : null}

      <main ref={mainRef} tabIndex={-1} className={`mx-auto w-full ${column} flex-1 px-4 pb-8 pt-6 outline-none`}>
        {note && !done ? (
          <p data-testid="player-note" className="mb-4 text-sm font-bold text-muted">
            {note}
          </p>
        ) : null}
        {body}
      </main>

      <p role="status" className="sr-only">
        {announcement}
      </p>
    </div>
  );
}
