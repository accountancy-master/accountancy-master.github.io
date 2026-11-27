'use client';

import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { recordSitting } from '@/app-state/mockPapers';
import { useLeaveGuard, type LeaveTarget } from '@/components/shell/ShellContext';
import { useStore } from '@/app-state/StoreProvider';
import { useProgress } from '@/app-state/useProgress';
import { NOTICE } from '@/components/play/PlayFrame';
import { Button } from '@/components/ui/Button';
import { CasePanel } from '@/components/ui/CasePanel';
import { Prompt } from '@/components/ui/Prompt';
import type { Question } from '@/content/types';
import { exerciseFor } from '@/exercises/registry';
import { logicFor } from '@/exercises/logic';
import { paperSteps, type MockPaper } from '@/learning/mockPaper';
import { caseStaysInReach, isCaseOpen, toggleCase, type CaseView } from '@/play/caseStudy';
import { asDraft, type Draft } from '@/play/drafts';
import {
  formatClock,
  resumeStep,
  stepStates,
  timeLeftMs,
  withAnswer,
  withFlag,
  withTimeOn,
  type StepState,
} from '@/play/mockSitting';
import type { MockPaperRecord, ProgressStore } from '@/storage/types';

const E2E = process.env.NEXT_PUBLIC_E2E === '1';

/** How often the clock looks at the time. The time left is always worked out from the start, never counted down. */
const TICK_MS = 250;
/** The clock turns to the warning colour for the last part of the paper. */
const LAST_MINUTES_MS = 5 * 60_000;

const nothing = () => {};

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/**
 * Stores the paper as it stands, at once, one write at a time: while a write is on its way only the newest state
 * waits behind it, so typing never queues up a write per key and the device always ends with the latest answers.
 */
function useRecordWriter(store: ProgressStore) {
  const waiting = useRef<MockPaperRecord | null>(null);
  const writing = useRef<Promise<void> | null>(null);
  const [failed, setFailed] = useState(false);
  const save = useCallback(
    (record: MockPaperRecord): Promise<void> => {
      waiting.current = record;
      writing.current ??= (async () => {
        while (waiting.current) {
          const next = waiting.current;
          waiting.current = null;
          try {
            await store.putMockPaper(next);
          } catch {
            setFailed(true);
          }
        }
        writing.current = null;
      })();
      return writing.current;
    },
    [store],
  );
  return { save, failed };
}

/**
 * A mock paper being sat. Nothing here says whether an answer is right: no hints, no check, no feedback. The learner
 * moves freely (next, previous, the question list), changes any answer, marks questions to come back to, and hands
 * the paper in; at zero the clock hands it in as it stands. Every change is stored on the device as it is made.
 */
export function MockSitting({
  paper,
  initial,
  onSubmitted,
}: {
  paper: MockPaper;
  /** The paper as stored: just started, or resumed. */
  initial: MockPaperRecord;
  /** Called with the paper once it has been handed in and recorded. `byClock` is true when the time ran out. */
  onSubmitted(record: MockPaperRecord, byClock: boolean): void;
}) {
  const { store, persistent } = useStore();
  const { reload } = useProgress();
  const steps = useMemo(() => paperSteps(paper), [paper]);
  const { save, failed } = useRecordWriter(store);

  const [record, setRecord] = useState(initial);
  // The newest state, for handlers that run between renders (two changes in a row, the clock running out).
  const latest = useRef(initial);
  const [index, setIndex] = useState(() => resumeStep(initial, steps.length));
  const shownAt = useRef(0);
  useEffect(() => {
    shownAt.current = Date.now();
  }, [index]);
  const [listOpen, setListOpen] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  // Leaving the sitting before it is handed in: asked once. The answers are on the device already; the clock runs on.
  const [leaving, setLeaving] = useState<LeaveTarget | null>(null);
  const router = useRouter();
  useLeaveGuard(
    submitting
      ? null
      : (target) => {
          setConfirming(false);
          setLeaving(target);
          return true;
        },
  );
  const leave = async (target: LeaveTarget) => {
    setLeaving(null);
    await save(latest.current);
    await target.before?.();
    router.push(target.href);
  };
  // Counts the times the answer on screen was cleared: the input is mounted again, empty.
  const [cleared, setCleared] = useState(0);
  const [caseView, setCaseView] = useState<CaseView | null>(null);

  const step = steps[index];
  const question = step.question;
  // A question answered in several parts (the entries of a set) shares its marks among them.
  const shared = logicFor(question).parts?.(question);

  const change = useCallback(
    (make: (record: MockPaperRecord) => MockPaperRecord) => {
      const next = make(latest.current);
      latest.current = next;
      setRecord(next);
      void save(next);
    },
    [save],
  );

  /** The time on the question on screen so far is added to its total. */
  const bankTime = useCallback(
    (r: MockPaperRecord): MockPaperRecord => {
      const now = Date.now();
      const spent = now - shownAt.current;
      shownAt.current = now;
      return withTimeOn(r, steps[index].question.id, spent);
    },
    [steps, index],
  );

  const goTo = (to: number) => {
    if (to < 0 || to >= steps.length || submitting) return;
    change((r) => ({ ...bankTime(r), current: to }));
    setIndex(to);
    setListOpen(false);
    setConfirming(false);
  };

  const submittedOnce = useRef(false);
  const submit = useCallback(
    async (byClock: boolean) => {
      if (submittedOnce.current) return;
      submittedOnce.current = true;
      setSubmitting(true);
      setConfirming(false);
      setListOpen(false);
      const final = bankTime(latest.current);
      latest.current = final;
      // The last change is on the device before the paper is marked from it.
      await save(final);
      const done = await recordSitting(store, final, Date.now());
      await reload();
      onSubmitted(done, byClock);
    },
    [bankTime, save, store, reload, onSubmitted],
  );

  // A new question starts at its top (also the first one, after the instructions), with keyboard and screen-reader
  // focus on it.
  const mainRef = useRef<HTMLElement>(null);
  const shownIndex = useRef<number | null>(null);
  useEffect(() => {
    const first = shownIndex.current === null;
    if (shownIndex.current === index) return;
    shownIndex.current = index;
    window.scrollTo(0, 0);
    if (!first) mainRef.current?.focus({ preventScroll: true });
  }, [index]);

  const states = useMemo(() => stepStates(paper, record), [paper, record]);
  const state = states[index];
  const unanswered = states.filter((s) => !s.answered).length;
  const incomplete = states.filter((s) => s.problem !== undefined && !s.answered).length;
  // A set of entries is marked entry by entry, and a format row by row: what cannot be read is left out, the rest is marked.
  const partlyOf = (format: boolean) =>
    states.filter((s) => s.problem !== undefined && s.answered && (s.step.question.type === 'account' || s.step.question.type === 'statement') === format).length;
  const partly = partlyOf(false);
  const partlyFormats = partlyOf(true);
  const draft = asDraft(question, record.answers[question.id]);
  // A case study is one question with several parts, and each part is answered on its own.
  const things = steps.length > paper.entries.length ? 'questions and parts' : 'questions';

  const context = question.context;
  const shownCase = context
    ? {
        open: isCaseOpen(caseView, context),
        onToggle: () => setCaseView((view) => toggleCase(view, context)),
        note: step.part === undefined ? undefined : `Part ${step.part + 1} of ${step.entry.questions.length} of this case`,
      }
    : undefined;

  return (
    <div data-testid="exam" className="flex min-h-dvh flex-col">
      {/* The bar and what opens under it (the question list, the question before submitting) stay at the top of the
          screen together, so they are in view wherever a long question has been scrolled to. */}
      <div className="sticky top-0 z-10">
        <header className="border-b-2 border-edge bg-surface">
          <div className="mx-auto flex w-full max-w-3xl items-center gap-2 px-4 py-2">
            <Clock record={record} onUp={() => void submit(true)} />
            <p className="hidden min-w-0 flex-1 truncate text-base font-bold text-muted sm:block">{paper.title}</p>
            <div className="ml-auto flex shrink-0 gap-2">
              <Button
                variant="secondary"
                data-testid="exam-list-toggle"
                aria-expanded={listOpen}
                aria-controls="exam-list"
                disabled={submitting}
                onClick={() => setListOpen((was) => !was)}
                className="px-3!"
              >
                Questions
              </Button>
              <Button data-testid="exam-submit" disabled={submitting} onClick={() => setConfirming(true)} className="px-4!">
                Submit
              </Button>
            </div>
          </div>
        </header>

        {confirming ? (
          <div role="alertdialog" aria-labelledby="exam-confirm-title" data-testid="exam-confirm" className="border-b-2 border-accent bg-accent-soft">
            <div className="mx-auto flex w-full max-w-3xl flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center">
              <p id="exam-confirm-title" data-testid="exam-confirm-text" className="flex-1 text-base font-bold text-accent-ink">
                Submit the paper?{' '}
                {unanswered === 0 ? 'Everything is answered.' : `${unanswered} of ${states.length} ${things} ${unanswered === 1 ? 'is' : 'are'} not answered.`}
                {incomplete > 0 ? ` ${plural(incomplete, 'answer is', 'answers are')} not complete and will not be marked.` : ''}
                {partly > 0 ? ` ${plural(partly, 'set of entries has', 'sets of entries have')} an entry that is not complete, which will not be marked.` : ''}
                {partlyFormats > 0 ? ` ${plural(partlyFormats, 'format has', 'formats have')} a row that is not complete, which will not be marked.` : ''} You
                cannot change anything afterwards.
              </p>
              <div className="flex gap-3">
                <Button variant="secondary" data-testid="exam-confirm-no" onClick={() => setConfirming(false)}>
                  Keep working
                </Button>
                <Button data-testid="exam-confirm-yes" onClick={() => void submit(false)}>
                  Submit
                </Button>
              </div>
            </div>
          </div>
        ) : null}

        {leaving ? (
          <div role="alertdialog" aria-labelledby="exam-leave-title" data-testid="exam-leave-confirm" className="border-b-2 border-accent bg-accent-soft">
            <div className="mx-auto flex w-full max-w-3xl flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center">
              <p id="exam-leave-title" className="flex-1 text-base font-bold text-accent-ink">
                Leave the paper for now? Your answers are saved and the clock keeps running: carry on from Mock papers before the time is up, or the
                paper is handed in as it stands.
              </p>
              <div className="flex gap-3">
                <Button variant="secondary" data-testid="exam-leave-no" onClick={() => setLeaving(null)}>
                  Keep working
                </Button>
                <Button variant="danger" data-testid="exam-leave-yes" onClick={() => void leave(leaving)}>
                  Leave
                </Button>
              </div>
            </div>
          </div>
        ) : null}

        {listOpen ? <QuestionList states={states} current={index} onPick={goTo} /> : null}

        {!persistent || failed ? (
          <p role="status" data-testid="exam-save-warning" className="border-b-2 border-accent bg-accent-soft px-4 py-3 text-base font-semibold text-accent-ink">
            {failed ? "Some of your answers couldn't be saved." : "This paper can't be saved on this device right now. Do not close the app."}
          </p>
        ) : null}
      </div>

      <main ref={mainRef} tabIndex={-1} className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-5 px-4 pb-8 pt-5 outline-none">
        {submitting ? (
          <p aria-busy="true" data-testid="exam-submitting" className={NOTICE}>
            Marking your paper…
          </p>
        ) : (
          <>
            {/* The way out of the paper for now, beside where the learner is: the bar above is full on a phone. */}
            <div className="flex items-start gap-3">
              <p data-testid="exam-position" className="flex min-w-0 flex-1 flex-wrap items-center gap-x-2 gap-y-1 text-sm font-bold text-muted">
                <span>
                  Question {step.label} of {paper.entries.length}
                </span>
                <span aria-hidden="true">·</span>
                <span>
                  {step.part !== undefined
                    ? `${step.entry.marks} marks shared by ${step.entry.questions.length} parts`
                    : shared
                      ? `${step.entry.marks} marks shared by ${shared.count} ${shared.name}`
                      : plural(step.entry.marks, 'mark', 'marks')}
                </span>
                {step.entry.part !== undefined ? (
                  <>
                    <span aria-hidden="true">·</span>
                    <span>Part {step.entry.part}</span>
                  </>
                ) : null}
                {state.flagged ? (
                  <span data-testid="exam-flagged" className="inline-flex min-h-6 items-center rounded-full bg-accent-soft px-3 text-sm font-extrabold text-accent-ink">
                    Marked for review
                  </span>
                ) : null}
              </p>
              <button type="button" data-testid="exam-leave" disabled={submitting} onClick={() => setLeaving({ href: '/mock' })} className="-mt-1 shrink-0 rounded-control px-2 py-1 text-sm font-extrabold text-primary-ink underline hover:bg-primary-soft">
                Leave for now
              </button>
            </div>

            <ExamQuestion
              key={`${question.id}:${cleared}`}
              question={question}
              draft={draft}
              onDraft={(next) => change((r) => withAnswer(r, question.id, next))}
              caseView={shownCase}
            />

            {state.problem ? (
              <p data-testid="exam-incomplete" className="text-sm font-bold text-muted">
                Not complete yet, so it would not be marked: {state.problem}
              </p>
            ) : null}

            <div className="flex flex-wrap gap-3">
              <Button
                variant="secondary"
                data-testid="exam-flag"
                aria-pressed={state.flagged}
                onClick={() => change((r) => withFlag(r, question.id, !state.flagged))}
                className={state.flagged ? 'border-accent-deep! bg-accent-soft! text-accent-ink!' : ''}
              >
                {state.flagged ? 'Marked for review' : 'Mark for review'}
              </Button>
              <Button
                variant="ghost"
                data-testid="exam-clear"
                disabled={draft === undefined}
                onClick={() => {
                  change((r) => withAnswer(r, question.id, undefined));
                  setCleared((n) => n + 1);
                }}
              >
                Clear answer
              </Button>
            </div>
          </>
        )}
      </main>

      <footer className="sticky bottom-0 border-t-2 border-edge bg-surface">
        <div className="mx-auto flex w-full max-w-3xl gap-3 px-4 py-3">
          <Button
            size="lg"
            variant="secondary"
            data-testid="exam-previous"
            disabled={index === 0 || submitting}
            onClick={() => goTo(index - 1)}
            className="flex-1 sm:flex-none"
          >
            Previous
          </Button>
          <Button
            size="lg"
            data-testid="exam-next"
            disabled={index >= steps.length - 1 || submitting}
            onClick={() => goTo(index + 1)}
            className="flex-1 sm:ml-auto sm:flex-none"
          >
            Next
          </Button>
        </div>
      </footer>
    </div>
  );
}

/** The countdown. It ticks by itself, so the question under it is not drawn again four times a second. */
function Clock({ record, onUp }: { record: Pick<MockPaperRecord, 'startedAt' | 'allowedMs'>; onUp(): void }) {
  const [left, setLeft] = useState(() => timeLeftMs(record, Date.now()));
  const latestUp = useRef(onUp);
  useEffect(() => {
    latestUp.current = onUp;
  }, [onUp]);
  const { startedAt, allowedMs } = record;
  useEffect(() => {
    const tick = () => {
      const now = timeLeftMs({ startedAt, allowedMs }, Date.now());
      setLeft(now);
      if (now <= 0) latestUp.current();
    };
    tick();
    const timer = setInterval(tick, TICK_MS);
    return () => clearInterval(timer);
  }, [startedAt, allowedMs]);
  const last = left <= LAST_MINUTES_MS;
  return (
    <p
      role="timer"
      aria-label={`Time left: ${formatClock(left)}`}
      data-testid="exam-clock"
      data-left-ms={E2E ? left : undefined}
      className={`inline-flex min-h-11 shrink-0 items-center gap-1.5 rounded-control border-2 px-3 text-lg font-extrabold tabular-nums ${
        last ? 'border-danger bg-danger-soft text-danger-deep' : 'border-edge-deep bg-canvas text-ink'
      }`}
    >
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" aria-hidden="true" className="shrink-0">
        <circle cx="12" cy="13" r="8" />
        <path d="M12 9v4l2.5 2M9 2h6" />
      </svg>
      <span aria-hidden="true">{formatClock(left)}</span>
    </p>
  );
}

/**
 * The question list (the palette): every question as a button that jumps to it. Answered is filled, not answered is
 * outlined, marked for review carries a flag; each also says so in its name, never by colour alone.
 */
function QuestionList({ states, current, onPick }: { states: StepState[]; current: number; onPick(index: number): void }) {
  const answered = states.filter((s) => s.answered).length;
  const flagged = states.filter((s) => s.flagged).length;
  return (
    <section id="exam-list" data-testid="exam-list" aria-label="Questions" className="border-b-2 border-edge bg-canvas">
      <div className="mx-auto flex max-h-[60dvh] w-full max-w-3xl flex-col gap-3 overflow-y-auto px-4 py-3">
        <p data-testid="exam-list-summary" className="text-sm font-bold">
          {answered} answered · {states.length - answered} not answered · {flagged} marked for review
        </p>
        <ul className="grid grid-cols-6 gap-2 sm:grid-cols-10">
          {states.map((s) => (
            <li key={s.step.index}>
              <button
                type="button"
                data-testid={`exam-jump-${s.step.label}`}
                data-answered={s.answered ? 'true' : 'false'}
                data-flagged={s.flagged ? 'true' : 'false'}
                aria-current={s.step.index === current ? 'step' : undefined}
                aria-label={`Question ${s.step.label}, ${s.answered ? 'answered' : 'not answered'}${s.flagged ? ', marked for review' : ''}`}
                onClick={() => onPick(s.step.index)}
                className={`relative flex min-h-11 w-full items-center justify-center rounded-control border-2 px-0.5 text-sm font-extrabold tabular-nums ${
                  s.answered ? 'border-primary-deep bg-primary text-white' : 'border-edge-deep bg-surface text-ink'
                } ${s.step.index === current ? 'outline-3 outline-offset-2 outline-focus' : ''}`}
              >
                {s.step.label}
                {s.flagged ? (
                  <span aria-hidden="true" className="absolute -right-1 -top-1 flex h-4 w-4 items-center justify-center rounded-full border-2 border-surface bg-accent text-[10px] leading-none text-on-accent">
                    ?
                  </span>
                ) : null}
              </button>
            </li>
          ))}
        </ul>
        <ul aria-hidden="true" className="flex flex-wrap gap-x-4 gap-y-1 text-sm font-bold text-muted">
          <li className="flex items-center gap-1.5">
            <span className="h-4 w-4 rounded border-2 border-primary-deep bg-primary" />
            Answered
          </li>
          <li className="flex items-center gap-1.5">
            <span className="h-4 w-4 rounded border-2 border-edge-deep bg-surface" />
            Not answered
          </li>
          <li className="flex items-center gap-1.5">
            <span className="flex h-4 w-4 items-center justify-center rounded-full bg-accent text-[10px] leading-none text-on-accent">?</span>
            Marked for review
          </li>
        </ul>
      </div>
    </section>
  );
}

/** One question of a paper: its case, its prompt and the answer input of its type, starting from what was entered before. */
function ExamQuestion({
  question,
  draft,
  onDraft,
  caseView,
}: {
  question: Question;
  draft: Draft | undefined;
  onDraft(draft: Draft): void;
  caseView?: { open: boolean; onToggle(): void; note?: string };
}) {
  const { Input, e2eExpected } = exerciseFor(question);
  const expectedAttr = E2E ? { 'data-expected': JSON.stringify(e2eExpected(question)) } : {};
  return (
    <div data-testid="question" data-question-id={question.id} data-question-type={question.type} {...expectedAttr} className="flex flex-col gap-6">
      {question.context && caseView ? <CasePanel text={question.context} {...caseView} sticky={caseStaysInReach(question, false)} /> : null}
      <Prompt text={question.prompt} />
      <Input
        question={question}
        checked={false}
        result={null}
        draft={draft}
        onDraft={onDraft}
        onFilledChange={nothing}
        registerSubmit={nothing}
        onAnswer={nothing}
      />
    </div>
  );
}
