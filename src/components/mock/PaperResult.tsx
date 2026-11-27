'use client';

import Link from 'next/link';
import { useEffect, useMemo, useRef } from 'react';
import { useProgress } from '@/app-state/useProgress';
import { FeedbackDetails } from '@/components/play/FeedbackPanel';
import { buttonClasses } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { FoldedCase } from '@/components/ui/CasePanel';
import { ProgressBar } from '@/components/ui/ProgressBar';
import { Prompt } from '@/components/ui/Prompt';
import { extraRowsText } from '@/exercises/logic';
import { exerciseFor } from '@/exercises/registry';
import { bankOfPaper, type MockPaper } from '@/learning/mockPaper';
import { mockPaperBonus } from '@/learning/progress';
import {
  chainedRuleText,
  deadline,
  formatDuration,
  formatMarks,
  hasLongPart,
  markPaper,
  marksByPart,
  marksByTopic,
  marksByUnit,
  partCreditText,
  percentOf,
  timeTakenMs,
  weakestTopics,
  type MarkedEntry,
  type MarkedStep,
  type Marking,
  type Share,
} from '@/play/mockSitting';
import type { MockPaperRecord } from '@/storage/types';

const nothing = () => {};

/**
 * A submitted paper: the marks, where they were earned and lost, what to work on next, and the marked script (every
 * question with the learner's answer, the right one, the working and the marks). Rebuilt from the paper's number and
 * the stored answers, so it reads the same the day after as the minute after.
 */
export function PaperResult({
  paper,
  record,
  justNow,
}: {
  paper: MockPaper;
  record: MockPaperRecord;
  /** Set when the paper was handed in on this visit: the XP before it, and whether the clock handed it in. */
  justNow?: { xpBefore: number; byClock: boolean };
}) {
  const { progress, sessionResults } = useProgress();
  const headingRef = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    headingRef.current?.focus();
  }, []);

  const marking = useMemo(() => markPaper(paper, record.answers), [paper, record.answers]);
  const bank = bankOfPaper(record.courseId, paper.ref);
  const byPart = marksByPart(marking);
  const byUnit = marksByUnit(marking, bank);
  const byTopic = marksByTopic(marking, bank);
  const weakest = weakestTopics(byTopic);
  // The marks stored when the paper was handed in are the marks it got. If the bank has changed since, the script
  // below is marked as it stands now and may not add up to them.
  const marks = record.marks ?? marking.marks;
  const maxMarks = record.maxMarks ?? marking.maxMarks;
  const changedSince = record.marks !== undefined && record.marks !== marking.marks;
  const taken = timeTakenMs(record);
  const ranOut = justNow?.byClock ?? (record.submittedAt !== undefined && record.submittedAt >= deadline(record));
  const bonus = mockPaperBonus({ correct: Math.floor(marks), total: maxMarks });
  // Only a total that already includes this paper is shown; never a guess in between.
  const saved = progress !== null && sessionResults.some((r) => r.sessionId === record.sessionId);

  return (
    <section data-testid="mock-result" aria-labelledby="mock-result-heading" className="flex flex-col gap-6">
      <div className="flex flex-col items-center gap-3 rounded-card border-2 border-b-4 border-primary bg-primary-soft p-6 text-center">
        <h1 id="mock-result-heading" ref={headingRef} tabIndex={-1} className="text-2xl font-extrabold tracking-tight text-primary-ink outline-none sm:text-3xl">
          {paper.title}
        </h1>
        <p data-testid="mock-marks" className="text-4xl font-extrabold tabular-nums">
          {formatMarks(marks)} <span className="text-2xl text-muted">/ {maxMarks}</span>
        </p>
        <p data-testid="mock-percent" className="text-xl font-bold">
          {percentOf(marks, maxMarks)}%
        </p>
        {ranOut ? (
          <p data-testid="mock-ran-out" className="text-base font-bold text-accent-ink">
            Time ran out, so the paper was submitted as it stood.
          </p>
        ) : null}
        {bonus > 0 ? (
          <p data-testid="mock-bonus" className="inline-flex min-h-8 items-center rounded-full bg-accent px-4 text-base font-extrabold text-on-accent">
            Paper bonus +{bonus} XP
          </p>
        ) : (
          <p data-testid="mock-bonus-missed" className="text-base font-bold text-muted">
            Half the marks or more earns the paper bonus.
          </p>
        )}
      </div>

      <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="Time taken" testId="mock-time" value={taken === null ? '–' : formatDuration(taken)} />
        <Stat label="Answered" testId="mock-answered" value={`${marking.answered} of ${marking.asked}`} />
        <Stat label="Right" testId="mock-right" value={`${marking.right} of ${marking.asked}`} />
        <Stat label="XP gained" testId="mock-xp" value={justNow && saved ? `+${progress.xp - justNow.xpBefore} XP` : justNow ? '–' : `+${bonus} bonus`} />
      </dl>

      {weakest.length > 0 ? (
        <Card data-testid="mock-weakest" className="flex flex-col gap-3">
          <h2 className="text-lg font-extrabold text-primary-ink">Work on these next</h2>
          <ul className="flex flex-col gap-3">
            {weakest.map((share) => (
              <li key={share.key} className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <p className="min-w-0 text-base font-bold">
                  {share.label}{' '}
                  <span className="font-bold text-muted">
                    ({formatMarks(share.marks)} of {share.max} marks)
                  </span>
                </p>
                <Link href={`/practice/topic/${share.key}`} data-testid={`mock-practise-${share.key}`} className={buttonClasses('secondary', 'md', 'w-full sm:w-auto sm:shrink-0')}>
                  Practise this topic
                </Link>
              </li>
            ))}
          </ul>
        </Card>
      ) : null}

      {byPart.length > 0 ? <Breakdown id="part" title="Marks by part" shares={byPart} /> : null}
      <Breakdown id="unit" title="Marks by unit" shares={byUnit} />
      <Breakdown id="topic" title="Marks by topic" shares={byTopic} weak={new Set(weakest.map((s) => s.key))} />

      <section aria-labelledby="mock-script-heading" className="flex flex-col gap-3">
        <h2 id="mock-script-heading" className="text-lg font-extrabold text-primary-ink">
          Your marked paper
        </h2>
        {changedSince ? (
          <p data-testid="mock-changed" className="rounded-card bg-accent-soft p-4 text-base font-bold text-accent-ink">
            Some questions of this paper have changed since you sat it, so the answers below may not add up to your marks.
          </p>
        ) : null}
        <MarkedScript marking={marking} />
      </section>

      <Link href="/mock" data-testid="mock-back" className={buttonClasses('primary', 'lg', 'w-full sm:w-auto sm:self-start')}>
        Back to mock papers
      </Link>
    </section>
  );
}

function Stat({ label, value, testId }: { label: string; value: string; testId: string }) {
  return (
    <div className="flex flex-col-reverse rounded-card border-2 border-b-4 border-edge bg-surface p-3 text-center">
      <dt className="text-sm font-bold text-muted">{label}</dt>
      <dd data-testid={testId} className="text-xl font-extrabold">
        {value}
      </dd>
    </div>
  );
}

function Breakdown({ id, title, shares, weak }: { id: string; title: string; shares: Share[]; weak?: ReadonlySet<string> }) {
  return (
    <Card data-testid={`mock-by-${id}`} className="flex flex-col gap-3 p-4!">
      <h2 className="text-lg font-extrabold text-primary-ink">{title}</h2>
      <ul className="flex flex-col gap-3">
        {shares.map((share) => (
          <li key={share.key} data-testid={`mock-by-${id}-${share.key}`} className="flex flex-col gap-1">
            <p className="flex items-baseline justify-between gap-3 text-base font-bold">
              <span className="min-w-0">
                {share.label}
                {weak?.has(share.key) ? <span className="ml-2 text-sm font-extrabold text-danger-deep">Weakest</span> : null}
              </span>
              <span className="shrink-0 tabular-nums">
                {formatMarks(share.marks)} / {share.max}
              </span>
            </p>
            <ProgressBar value={share.max > 0 ? share.marks / share.max : 0} label={`${share.label}: ${formatMarks(share.marks)} of ${share.max} marks`} className="h-2!" />
          </li>
        ))}
      </ul>
    </Card>
  );
}

/** Every question of the paper, marked. A case study is one block: its case once, then its parts. */
export function MarkedScript({ marking }: { marking: Marking }) {
  return (
    <ol data-testid="mock-script" className="flex flex-col gap-4">
      {marking.entries.map((marked) => (
        <li key={marked.entry.number}>
          <ScriptEntry marked={marked} />
        </li>
      ))}
    </ol>
  );
}

function ScriptEntry({ marked }: { marked: MarkedEntry }) {
  const { entry, steps, marks } = marked;
  const full = marks >= entry.marks;
  const parts = steps.length === 1 ? steps[0].result?.parts : undefined;
  // A format counts its right rows less its extra rows (see `rowsCounted`), so both are told.
  const format = steps.length === 1 ? steps[0].result?.format : undefined;
  const extra = extraRowsText(format?.extra ?? 0);
  const context = steps[0]?.step.question.context;
  // A chained case: each part has an equal share of the marks, and a long part earns its share row by row.
  const chained = hasLongPart(entry);
  return (
    <Card data-testid={`script-entry-${entry.number}`} className="flex flex-col gap-4 p-4!">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-base font-extrabold">
          Question {entry.number}
          {entry.caseTitle ? <span className="font-bold text-muted"> · {entry.caseTitle}</span> : null}
        </h3>
        <span
          data-testid={`script-marks-${entry.number}`}
          className={`inline-flex min-h-7 shrink-0 items-center rounded-full px-3 text-sm font-extrabold tabular-nums ${
            full ? 'bg-primary text-white' : marks > 0 ? 'bg-accent-soft text-accent-ink' : 'bg-danger-soft text-danger-deep'
          }`}
        >
          {formatMarks(marks)} / {entry.marks} {entry.marks === 1 ? 'mark' : 'marks'}
        </span>
      </div>
      {parts && parts.right < parts.total ? (
        <p data-testid={`script-shared-${entry.number}`} className="text-sm font-bold text-muted">
          {format
            ? `The marks are shared by its ${parts.total} rows: ${format.right} right.${extra ? ` ${extra} Each takes one right row away.` : ''}`
            : `The marks are shared by its ${parts.total} entries: ${parts.right} right.`}
        </p>
      ) : null}
      {chained ? (
        <p data-testid={`script-shared-${entry.number}`} className="text-sm font-bold text-muted">
          {chainedRuleText(entry.marks, steps.length)}
        </p>
      ) : null}
      {entry.caseId !== undefined && context ? <FoldedCase text={context} /> : null}
      {steps.map((s) => (
        <ScriptStep key={s.step.index} marked={s} share={chained ? entry.marks / steps.length : undefined} />
      ))}
    </Card>
  );
}

function ScriptStep({
  marked,
  share,
}: {
  marked: MarkedStep;
  /** For a part of a chained case: the marks of the part, its equal share of the marks of the case. */
  share?: number;
}) {
  const { step, draft, response, result, correct } = marked;
  const credit = share === undefined ? null : partCreditText(result, share);
  const question = step.question;
  const { Input, inputShowsSolution } = exerciseFor(question);
  const answered = response !== null;
  const choice = question.type === 'mcq' || question.type === 'true_false';
  const tone = correct ? 'border-primary bg-primary-soft' : answered ? 'border-danger bg-danger-soft' : 'border-accent bg-accent-soft';
  return (
    <div
      data-testid={`script-step-${step.label}`}
      data-answered={answered ? 'true' : 'false'}
      data-correct={correct ? 'true' : 'false'}
      className="flex flex-col gap-3 border-t-2 border-edge pt-4 first:border-t-0 first:pt-0"
    >
      {step.part !== undefined ? <p className="text-sm font-extrabold text-muted">Part ({String.fromCharCode(97 + step.part)})</p> : null}
      {credit ? (
        <p data-testid={`script-credit-${step.label}`} className="text-sm font-bold text-muted">
          {credit}
        </p>
      ) : null}
      <Prompt text={question.prompt} size="md" />
      {/* The learner's own answer, in the input it was given in, marked as the player marks it. A choice question
          shows its options even when none was chosen, so the right one can be seen among them, and so does an input
          that shows the solution itself (the journal of a set). */}
      {draft !== undefined || choice || inputShowsSolution ? (
        <Input question={question} checked result={result} draft={draft} onFilledChange={nothing} registerSubmit={nothing} onAnswer={nothing} />
      ) : null}
      <div className={`flex flex-col gap-2 rounded-card border-2 p-3 ${tone}`}>
        <p data-testid={`script-verdict-${step.label}`} className="text-base font-extrabold">
          {correct ? 'Correct' : answered ? 'Not right' : draft !== undefined ? 'Not marked: the answer was not complete' : 'Not answered'}
        </p>
        <FeedbackDetails question={question} correct={correct} mistakeCode={result?.mistakeCode} />
      </div>
    </div>
  );
}
