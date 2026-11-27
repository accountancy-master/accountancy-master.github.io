'use client';

import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useCourse } from '@/app-state/useCourse';
import { useProgress } from '@/app-state/useProgress';
import { useStore } from '@/app-state/StoreProvider';
import { useShellTrail } from '@/components/shell/ShellContext';
import { OtherCourse } from '@/components/topic/OtherCourse';
import { Button, buttonClasses } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Chip } from '@/components/ui/Chip';
import { ProgressGate } from '@/components/ui/ProgressGate';
import { COURSES, courseOfTopic } from '@/content/outline';
import type { WrittenQuestion } from '@/content/written';
import { suggestedPoints } from '@/content/written/keywords';
import {
  WRITTEN_REWRITE,
  filterFromParams,
  filterWritten,
  formatMarks,
  isFullMarks,
  writtenMarks,
  writtenQueue,
  writtenStatus,
} from '@/content/written/practice';
import { newId } from '@/lib/ids';
import { WRITTEN_ANSWER_MAX, type WrittenResult } from '@/storage/types';
import { Marks, ModelAnswer, QuestionFacts, TopicTag } from './WrittenParts';
import { useWrittenBank } from './useWrittenBank';

// A practice of written answers, `/written/<topicId>` (that topic's questions) or `/written/rewrite` (every question
// still to rewrite): one question at a time, as the board sets it. The learner writes (typed, or on paper), sees the
// model answer beside their own, ticks the points they wrote (those whose key words are in a typed answer come
// ticked, marked as suggested) and confirms: the marks follow the points. `?form=` and `?marks=` narrow the questions,
// and `?q=` starts on one of them (from Mistakes).

const LOADING = 'Loading your answers…';

export function WrittenPractice({ scope }: { scope: string }) {
  const course = useCourse();
  const rewrite = scope === WRITTEN_REWRITE;
  const topic = rewrite ? undefined : COURSES.flatMap((c) => c.topics).find((t) => t.id === scope);
  useShellTrail([{ label: 'Written answers', href: '/written' }, { label: rewrite ? 'To rewrite' : (topic?.title ?? 'Topic') }]);
  if (!rewrite && course.courseId !== '' && !course.has(scope)) {
    return topic ? <OtherCourse topic={topic} testId="written-other-course" /> : <NoQuestions />;
  }
  return (
    <ProgressGate id="written" loading={LOADING}>
      {() => <Practice scope={scope} rewrite={rewrite} />}
    </ProgressGate>
  );
}

function NoQuestions({ rewrite = false }: { rewrite?: boolean }) {
  return (
    <div data-testid="written-empty" className="flex flex-col items-start gap-4 rounded-card border border-dashed border-edge-deep bg-sunken p-5">
      <p className="text-base font-bold">{rewrite ? 'Nothing to rewrite: every answer you wrote has full marks.' : 'There are no written questions to practise here.'}</p>
      <Link href="/written" className={buttonClasses('secondary')}>
        Back to written answers
      </Link>
    </div>
  );
}

interface Run {
  ids: string[];
  at: number;
  results: { questionId: string; marks: number; maxMarks: number }[];
}

function Practice({ scope, rewrite }: { scope: string; rewrite: boolean }) {
  const params = useSearchParams();
  const filter = useMemo(() => filterFromParams(params), [params]);
  const startOn = params.get('q');
  const { questions, failed, retry, latest } = useWrittenBank();
  const [run, setRun] = useState<Run | null>(null);

  const pool = useMemo(() => {
    if (!questions) return null;
    const own = questions.filter((q) => (rewrite ? writtenStatus(latest.get(q.id)) === 'rewrite' : q.topicId === scope));
    return filterWritten(own, filter);
  }, [questions, rewrite, scope, latest, filter]);

  // The questions of a run are fixed when it starts: a result written on the way must not reorder the rest.
  const start = (first: string | null) => {
    if (!pool) return;
    const ids = writtenQueue(pool, latest).map((q) => q.id);
    if (ids.length === 0) {
      setRun(null);
      return;
    }
    const asked = first !== null ? ids.indexOf(first) : -1;
    if (asked > 0) ids.unshift(...ids.splice(asked, 1));
    setRun({ ids, at: 0, results: [] });
  };
  if (run === null && pool !== null && pool.length > 0) start(startOn);

  if (failed) {
    return (
      <div role="alert" className="flex flex-col items-start gap-3 rounded-card border-2 border-danger bg-surface p-5">
        <p className="text-base font-bold">The questions could not be loaded.</p>
        <Button variant="secondary" data-testid="written-retry" onClick={retry}>
          Try again
        </Button>
      </div>
    );
  }
  if (!questions || !pool) {
    return (
      <p role="status" aria-busy="true" data-testid="written-bank-loading" className="text-base text-muted">
        Loading the questions…
      </p>
    );
  }
  if (!run) return <NoQuestions rewrite={rewrite} />;

  const byId = new Map(questions.map((q) => [q.id, q]));
  const q = byId.get(run.ids[run.at]);
  if (!q) return <Summary run={run} byId={byId} onAgain={() => start(null)} />;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p data-testid="written-progress" className="text-sm font-bold text-muted">
          Question {run.at + 1} of {run.ids.length}
        </p>
        <Link href="/written" data-testid="written-stop" className="inline-flex min-h-11 items-center px-2 text-sm font-bold text-primary-ink underline">
          Stop
        </Link>
      </div>
      <Step
        key={`${run.at}-${q.id}`}
        q={q}
        showTopic={rewrite}
        last={run.at + 1 === run.ids.length}
        before={latest.get(q.id)}
        onNext={(r) => setRun({ ...run, at: run.at + 1, results: [...run.results, r] })}
      />
    </div>
  );
}

type Phase = 'write' | 'mark' | 'done';

/** The result of an answer, to store: what was typed is kept (trimmed, and no longer than storage keeps). */
function writtenResult(
  profile: { id: string; courseId: string },
  q: WrittenQuestion,
  a: { marks: number; ticked: ReadonlySet<number>; onPaper: boolean; text: string; startedAt: number },
): WrittenResult {
  const typed = a.onPaper ? '' : a.text.trim().slice(0, WRITTEN_ANSWER_MAX);
  const now = Date.now();
  return {
    id: newId(),
    profileId: profile.id,
    // The topic belongs to a course: the result is that course's, whichever the learner is on.
    courseId: courseOfTopic(q.topicId) ?? profile.courseId,
    topicId: q.topicId,
    questionId: q.id,
    marks: a.marks,
    maxMarks: q.marks,
    ticked: [...a.ticked].sort((x, y) => x - y),
    onPaper: a.onPaper,
    ...(typed ? { answer: typed } : {}),
    timeMs: Math.max(0, now - a.startedAt),
    at: now,
  };
}

function Step({
  q,
  showTopic,
  last,
  before,
  onNext,
}: {
  q: WrittenQuestion;
  showTopic: boolean;
  last: boolean;
  before: WrittenResult | undefined;
  onNext(r: { questionId: string; marks: number; maxMarks: number }): void;
}) {
  const { store, profile } = useStore();
  const { reload } = useProgress();
  const [phase, setPhase] = useState<Phase>('write');
  const [text, setText] = useState('');
  const [onPaper, setOnPaper] = useState(false);
  const [hints, setHints] = useState(0);
  const [suggested, setSuggested] = useState<ReadonlySet<number>>(new Set());
  const [ticked, setTicked] = useState<ReadonlySet<number>>(new Set());
  const [saveFailed, setSaveFailed] = useState(false);
  const [startedAt] = useState(() => Date.now());
  // The result before this answer: the one stored on confirming must not take its place on screen.
  const [prior] = useState(before);
  const markHeading = useRef<HTMLHeadingElement>(null);
  const resultHeading = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    if (phase === 'mark') markHeading.current?.focus();
    if (phase === 'done') resultHeading.current?.focus();
  }, [phase]);

  const reveal = (paper: boolean) => {
    setOnPaper(paper);
    // Nothing is suggested for an answer written on paper: the app cannot read it.
    const found = new Set(paper ? [] : suggestedPoints(q, text));
    setSuggested(found);
    setTicked(found);
    setPhase('mark');
  };

  const toggle = (i: number) => {
    const next = new Set(ticked);
    if (next.has(i)) next.delete(i);
    else next.add(i);
    setTicked(next);
  };

  const marks = writtenMarks(q, ticked.size);
  const each = q.marks / q.pointsNeeded;

  const confirm = () => {
    if (!profile) return;
    const result = writtenResult(profile, q, { marks, ticked, onPaper, text, startedAt });
    setPhase('done');
    store
      .appendWrittenResult(result)
      .then(() => reload())
      .catch(() => setSaveFailed(true));
  };

  const missed = q.points.flatMap((p, i) => (ticked.has(i) ? [] : [p.text]));
  const full = isFullMarks({ marks, maxMarks: q.marks });

  return (
    <div data-testid="written-step" data-question={q.id} data-phase={phase} className="flex flex-col gap-4">
      <Card className="flex flex-col gap-3">
        <QuestionFacts q={q} topic={showTopic} />
        {prior ? (
          <p data-testid="written-before" className="text-sm font-bold text-muted">
            Last time: <Marks marks={prior.marks} maxMarks={prior.maxMarks} />
          </p>
        ) : null}
        <h1 data-testid="written-prompt" className="text-xl font-extrabold">
          {q.prompt}
        </h1>
        {phase === 'write' ? (
          <>
            {hints > 0 ? (
              <ol data-testid="written-hints" className="flex flex-col gap-2">
                {q.hints.slice(0, hints).map((h, i) => (
                  <li key={i} data-testid={`written-hint-${i + 1}`} className="rounded-control bg-accent-soft px-3 py-2 text-base text-accent-ink">
                    <span className="font-extrabold">{i === 0 ? 'Hint: ' : 'Stronger hint: '}</span>
                    {h}
                  </li>
                ))}
              </ol>
            ) : null}
            {hints < 2 ? (
              <Button variant="ghost" data-testid="written-hint" onClick={() => setHints(hints + 1)} className="self-start px-3 text-sm">
                {hints === 0 ? 'Show a hint' : 'Show a stronger hint'}
              </Button>
            ) : null}
            <label htmlFor="written-text" className="text-base font-bold">
              Your answer
            </label>
            <textarea
              id="written-text"
              data-testid="written-text"
              value={text}
              maxLength={WRITTEN_ANSWER_MAX}
              rows={8}
              onChange={(e) => setText(e.target.value)}
              placeholder={q.form === 'distinguish' ? 'Basis: … · first term … · second term …' : '1. …\n2. …\n3. …'}
              className="w-full min-w-0 rounded-control border-2 border-edge-deep bg-surface px-3 py-2 text-base"
            />
            <div className="flex flex-wrap gap-2">
              <Button data-testid="written-check" disabled={text.trim() === ''} onClick={() => reveal(false)}>
                Check my answer
              </Button>
              <Button variant="secondary" data-testid="written-paper" onClick={() => reveal(true)}>
                I wrote it on paper
              </Button>
            </div>
          </>
        ) : null}
      </Card>

      {phase !== 'write' ? (
        <>
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <section aria-labelledby="written-yours-heading" data-testid="written-yours" className="flex min-w-0 flex-col gap-2 rounded-card border border-edge bg-surface p-4 shadow-card">
              <h2 id="written-yours-heading" className="text-base font-extrabold text-primary-ink">
                Your answer
              </h2>
              {onPaper ? (
                <p className="text-base text-muted">Written on paper. Keep it beside you to compare.</p>
              ) : (
                <p data-testid="written-yours-text" className="whitespace-pre-wrap text-base [overflow-wrap:anywhere]">
                  {text}
                </p>
              )}
            </section>
            <section aria-labelledby="written-model-heading" data-testid="written-model" className="flex min-w-0 flex-col gap-2 rounded-card border border-edge bg-surface p-4 shadow-card">
              <h2 id="written-model-heading" className="text-base font-extrabold text-primary-ink">
                Model answer
              </h2>
              <ModelAnswer q={q} />
            </section>
          </div>

          <Card className="flex flex-col gap-3">
            <h2 ref={markHeading} tabIndex={-1} className="text-lg font-extrabold outline-none">
              Tick the points you wrote
            </h2>
            <p className="text-sm text-muted">
              Each point is worth {formatMarks(each)} {each > 1 ? 'marks' : 'mark'}; any {q.pointsNeeded} {q.pointsNeeded === 1 ? 'counts' : 'count'} for full marks.
              {!onPaper && suggested.size > 0 ? ' The points whose key words are in your answer are ticked for you: untick any you did not really make.' : ''}
            </p>
            <fieldset disabled={phase === 'done'} className="flex min-w-0 flex-col gap-2">
              <legend className="sr-only">The points of the marking scheme</legend>
              {q.points.map((p, i) => (
                <label
                  key={i}
                  data-testid={`written-point-${i}`}
                  data-suggested={suggested.has(i) ? 'true' : undefined}
                  className="flex min-h-11 cursor-pointer items-start gap-3 rounded-control border border-edge px-3 py-2 has-[:checked]:border-primary has-[:checked]:bg-primary-soft"
                >
                  <input type="checkbox" data-testid={`written-tick-${i}`} checked={ticked.has(i)} onChange={() => toggle(i)} className="mt-1 h-5 w-5 shrink-0 accent-primary" />
                  <span className="flex min-w-0 flex-col gap-1">
                    <span className="text-base">{p.text}</span>
                    {suggested.has(i) ? (
                      <span data-testid="written-suggested" className="text-xs font-extrabold text-primary-ink">
                        Suggested from your answer
                      </span>
                    ) : null}
                  </span>
                </label>
              ))}
            </fieldset>
            <p data-testid="written-tally" className="text-base font-bold">
              Ticked {ticked.size}: <Marks marks={marks} maxMarks={q.marks} />
            </p>
            {phase === 'mark' ? (
              <Button data-testid="written-confirm" onClick={confirm} className="self-start">
                Confirm my marks
              </Button>
            ) : null}
          </Card>
        </>
      ) : null}

      {phase === 'done' ? (
        <Card data-testid="written-result" className={['flex flex-col gap-3 border-2', full ? 'border-primary' : 'border-accent'].join(' ')}>
          <h2 ref={resultHeading} tabIndex={-1} className="flex flex-wrap items-baseline gap-x-3 text-lg font-extrabold outline-none">
            Your marks
            <Marks marks={marks} maxMarks={q.marks} testId="written-result-marks" className="text-3xl font-extrabold text-primary-ink" />
          </h2>
          <p data-testid="written-tip" className="text-base">
            <span className="font-extrabold">How the marks are given: </span>
            {q.markingTip}
          </p>
          {!full && missed.length > 0 ? (
            <div data-testid="written-missed" className="flex flex-col gap-1">
              <p className="text-base font-extrabold">Add these next time:</p>
              <ul className="list-disc pl-6 text-base">
                {missed.map((m) => (
                  <li key={m}>{m}</li>
                ))}
              </ul>
            </div>
          ) : null}
          <p data-testid="written-status" className="text-sm font-bold text-muted">
            {full ? 'Full marks.' : 'On your list to rewrite (in Mistakes): it comes first next time.'}
          </p>
          {saveFailed ? (
            <p role="alert" data-testid="written-save-failed" className="text-sm font-bold text-danger-deep">
              Your marks could not be saved on this device.
            </p>
          ) : null}
          <Button data-testid="written-next" onClick={() => onNext({ questionId: q.id, marks, maxMarks: q.marks })} className="self-start">
            {last ? 'See how you did' : 'Next question'}
          </Button>
        </Card>
      ) : null}
    </div>
  );
}

function Summary({ run, byId, onAgain }: { run: Run; byId: ReadonlyMap<string, WrittenQuestion>; onAgain(): void }) {
  const got = run.results.reduce((n, r) => n + r.marks, 0);
  const of = run.results.reduce((n, r) => n + r.maxMarks, 0);
  const toRewrite = run.results.filter((r) => !isFullMarks(r)).length;
  return (
    <Card data-testid="written-done" className="flex flex-col gap-4">
      <h1 className="text-2xl font-extrabold">Practice done</h1>
      <p className="text-base">
        You wrote {run.results.length} {run.results.length === 1 ? 'answer' : 'answers'}: <Marks marks={got} maxMarks={of} testId="written-done-marks" className="font-extrabold" />.{' '}
        {toRewrite > 0 ? `${toRewrite} ${toRewrite === 1 ? 'is' : 'are'} on your list to rewrite.` : 'Every one at full marks.'}
      </p>
      <ul className="flex flex-col gap-2">
        {run.results.map((r, i) => {
          const q = byId.get(r.questionId);
          return (
            <li key={i} className="flex min-w-0 flex-col gap-1 rounded-control border border-edge px-3 py-2 sm:flex-row sm:items-center sm:justify-between sm:gap-3">
              <span className="flex min-w-0 flex-col gap-1">
                {q ? <TopicTag topicId={q.topicId} /> : null}
                <span className="text-base">{q?.prompt ?? r.questionId}</span>
              </span>
              <Chip tone={isFullMarks(r) ? 'primary' : 'accent'}>
                <Marks marks={r.marks} maxMarks={r.maxMarks} />
              </Chip>
            </li>
          );
        })}
      </ul>
      <div className="flex flex-wrap gap-2">
        <Button data-testid="written-again" onClick={onAgain}>
          Practise again
        </Button>
        <Link href="/written" className={buttonClasses('secondary')}>
          Back to written answers
        </Link>
      </div>
    </Card>
  );
}

