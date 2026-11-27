'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { useMockPapers } from '@/app-state/mockPapers';
import { useCourse } from '@/app-state/useCourse';
import { useProgress } from '@/app-state/useProgress';
import { BackToPractice } from '@/components/practice/TopicPicker';
import { Button, buttonClasses } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { ProgressGate } from '@/components/ui/ProgressGate';
import { bankOf, bankOfPaper, paperAvailable, paperKey, paperTitle, parsePaperKey, refOfBank, sectionTopics, type PaperBank, type PaperRef } from '@/learning/mockPaper';
import { PAPER_KINDS, needsTopic, questionCount, type PaperKind } from '@/learning/paperBlueprints';
import { mostRecentTopicId } from '@/learning/topics';
import {
  formatClock,
  formatDay,
  formatDuration,
  formatMarks,
  nextPaperNumber,
  paperInProgress,
  percentOf,
  submittedPapers,
  timeLeftMs,
  timeTakenMs,
} from '@/play/mockSitting';
import type { MockPaperRecord } from '@/storage/types';

const paperHref = (key: string) => `/mock/paper?paper=${encodeURIComponent(key)}`;

const titleOf = (record: Pick<MockPaperRecord, 'paper' | 'courseId'>): string => {
  const ref = parsePaperKey(record.paper);
  try {
    return ref ? paperTitle(ref, bankOfPaper(record.courseId, ref)) : record.paper;
  } catch {
    return record.paper;
  }
};

/** What a kind of paper covers, in a line. */
function describe(kind: PaperKind, bank: PaperBank): string {
  const [section] = bank.blueprints[kind].sections;
  if (kind === 'full') return 'The whole course in the pattern of the examination: Part A and Part B.';
  if ('first' in section.topics) {
    const topics = sectionTopics(section, bank, {});
    return `The first ${topics.length} topics, up to ${topics.at(-1)?.title ?? 'the last'}.`;
  }
  // A paper on one unit of the course (the half-yearly paper of Class 12 is on partnership firms).
  if ('unit' in section.topics) {
    const topics = sectionTopics(section, bank, {});
    return `${section.topics.unit}: ${topics.length} ${topics.length === 1 ? 'topic' : 'topics'}.`;
  }
  return 'A short test on one topic you choose.';
}

/** Mock papers: start a new paper of each kind, go back to one in progress, and open the marked papers again. */
export function MockHub() {
  return (
    <ProgressGate id="mock" loading="Loading your papers…">
      {() => <Hub />}
    </ProgressGate>
  );
}

function Hub() {
  const { records, failed, refresh } = useMockPapers();
  const { activity } = useProgress();
  // The papers of the learner's course, set from its own topics.
  const course = useCourse();
  const bank = bankOf(course.courseId, course.choice);
  // The topic test starts on the topic played most recently (the first topic for a new learner).
  const [topicId, setTopicId] = useState(() => mostRecentTopicId(course.packs, activity) ?? bank.topics[0]?.id ?? '');

  if (failed) {
    return (
      <div role="alert" className="flex flex-col items-start gap-3 rounded-card border-2 border-danger bg-surface p-5">
        <p className="text-base font-bold">We couldn&apos;t load your papers.</p>
        <Button variant="secondary" data-testid="mock-retry" onClick={() => void refresh()}>
          Try again
        </Button>
      </div>
    );
  }
  if (records === null) {
    return (
      <p role="status" aria-busy="true" data-testid="mock-loading" className="text-base text-muted">
        Loading your papers…
      </p>
    );
  }

  const running = paperInProgress(records);
  const history = submittedPapers(records);
  // A new paper is set from the learner's bank, and its reference says which (Part B of Class 12).
  const refOf = (kind: PaperKind): PaperRef =>
    refOfBank(bank, {
      kind,
      ...(needsTopic(bank.blueprints[kind]) ? { topicId } : {}),
      number: nextPaperNumber(kind, records),
    });

  return (
    <div className="flex flex-col gap-5">
      <header className="flex flex-col gap-1">
        <BackToPractice />
        <h1 className="text-3xl font-extrabold tracking-tight">Mock papers</h1>
        <p className="text-base">Timed papers in the pattern of the examination. No hints, and the answers come only at the end.</p>
      </header>

      {running ? (
        <Card data-testid="mock-running" className="flex flex-col gap-3 border-primary! bg-primary-soft!">
          <h2 className="text-sm font-extrabold uppercase tracking-wide text-primary-ink">Paper in progress</h2>
          <p className="text-xl font-extrabold">{titleOf(running)}</p>
          <TimeLeft record={running} onUp={() => void refresh()} />
          <Link href={paperHref(running.paper)} data-testid="mock-resume" className={buttonClasses('primary', 'lg', 'w-full sm:w-auto sm:self-start')}>
            Resume the paper
          </Link>
        </Card>
      ) : null}

      <ul className="flex flex-col gap-4">
        {PAPER_KINDS.map((kind) => {
          const blueprint = bank.blueprints[kind];
          const ref = refOf(kind);
          const pickTopic = needsTopic(blueprint);
          // A paper that draws on a unit none of whose topics can be played yet cannot be set.
          const ready = paperAvailable(kind, bank);
          return (
            <li key={kind}>
              <Card data-testid={`mock-kind-${kind}`} className="flex flex-col gap-3">
                <div className="flex flex-col gap-1">
                  <h2 className="text-lg font-extrabold leading-tight">{blueprint.title}</h2>
                  <p data-testid={`mock-kind-${kind}-meta`} className="text-sm font-bold text-primary-ink">
                    {blueprint.marks} marks · {formatDuration(blueprint.minutes * 60_000)} · {questionCount(blueprint)} questions
                  </p>
                  <p className="text-base">{describe(kind, bank)}</p>
                </div>
                {pickTopic ? (
                  <label className="flex flex-col gap-1 text-base font-bold">
                    Topic
                    <select
                      data-testid="mock-topic-select"
                      value={topicId}
                      onChange={(e) => setTopicId(e.target.value)}
                      className="min-h-11 w-full rounded-control border-2 border-edge-deep bg-surface px-3 text-base font-normal sm:max-w-md"
                    >
                      {[...new Set(bank.topics.map((t) => t.unit))].map((unit) => (
                        <optgroup key={unit} label={unit}>
                          {bank.topics
                            .filter((t) => t.unit === unit)
                            .map((t) => (
                              <option key={t.id} value={t.id}>
                                {t.title}
                              </option>
                            ))}
                        </optgroup>
                      ))}
                    </select>
                  </label>
                ) : null}
                {!ready ? (
                  <p data-testid={`mock-new-${kind}-waiting`} className="text-base font-bold text-muted">
                    This paper opens when every part of it has a topic you can play.
                  </p>
                ) : running ? (
                  <p data-testid={`mock-new-${kind}-blocked`} className="text-base font-bold text-muted">
                    Finish the paper in progress first.
                  </p>
                ) : (
                  <Link href={paperHref(paperKey(ref))} data-testid={`mock-new-${kind}`} className={buttonClasses('primary', 'md', 'w-full sm:w-auto sm:self-start')}>
                    New paper
                  </Link>
                )}
              </Card>
            </li>
          );
        })}
      </ul>

      <section aria-labelledby="mock-history-heading" className="flex flex-col gap-3">
        <h2 id="mock-history-heading" className="text-lg font-extrabold text-primary-ink">
          Your papers
        </h2>
        {history.length === 0 ? (
          <p data-testid="mock-history-empty" className="rounded-card border-2 border-dashed border-edge-deep bg-canvas p-5 text-base font-bold text-muted">
            No paper submitted yet. A marked paper stays here, so you can read it again.
          </p>
        ) : (
          <ul data-testid="mock-history" className="flex flex-col gap-3">
            {history.map((record) => (
              <li key={record.id}>
                <HistoryRow record={record} />
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function HistoryRow({ record }: { record: MockPaperRecord }) {
  const taken = timeTakenMs(record);
  const marked = record.marks !== undefined && record.maxMarks !== undefined;
  return (
    <Card href={paperHref(record.paper)} data-testid={`mock-history-${record.paper}`} className="flex flex-col gap-1 p-4! sm:flex-row sm:items-center sm:justify-between sm:gap-4">
      <span className="flex min-w-0 flex-col gap-0.5">
        <span className="text-base font-extrabold leading-snug">{titleOf(record)}</span>
        <span className="text-sm font-bold text-muted">
          {record.submittedAt === undefined ? '' : formatDay(record.submittedAt)}
          {taken === null ? '' : ` · ${formatDuration(taken)}`}
        </span>
      </span>
      <span data-testid={`mock-history-${record.paper}-marks`} className="shrink-0 text-lg font-extrabold tabular-nums text-primary-ink">
        {marked ? `${formatMarks(record.marks!)} / ${record.maxMarks} · ${percentOf(record.marks!, record.maxMarks!)}%` : 'Not marked'}
      </span>
    </Card>
  );
}

/** The time a paper in progress has left, counted by itself once a second. At zero the screen reads the papers again. */
function TimeLeft({ record, onUp }: { record: MockPaperRecord; onUp(): void }) {
  const [left, setLeft] = useState(() => timeLeftMs(record, Date.now()));
  const { startedAt, allowedMs } = record;
  const latestUp = useRef(onUp);
  useEffect(() => {
    latestUp.current = onUp;
  }, [onUp]);
  useEffect(() => {
    let told = false;
    const tick = () => {
      const now = timeLeftMs({ startedAt, allowedMs }, Date.now());
      setLeft(now);
      if (now <= 0 && !told) {
        told = true;
        latestUp.current();
      }
    };
    const timer = setInterval(tick, 1000);
    return () => clearInterval(timer);
  }, [startedAt, allowedMs]);
  return (
    <p data-testid="mock-running-left" className="text-base font-bold tabular-nums">
      Time left: {formatClock(left)}. The clock does not stop.
    </p>
  );
}
