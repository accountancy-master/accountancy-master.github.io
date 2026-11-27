'use client';

import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useMemo, useState } from 'react';
import { useCourse } from '@/app-state/useCourse';
import { useProgress } from '@/app-state/useProgress';
import { PatternCard } from '@/components/playground/PatternCard';
import { useSamples } from '@/components/playground/useSamples';
import { BackToPractice } from '@/components/practice/TopicPicker';
import { buttonClasses } from '@/components/ui/Button';
import { Chip } from '@/components/ui/Chip';
import { GroupLabel } from '@/components/ui/GroupLabel';
import { Pills } from '@/components/ui/Pills';
import { CaseIcon } from '@/components/ui/icons';
import { ProgressGate } from '@/components/ui/ProgressGate';
import { Tile } from '@/components/ui/Tile';
import type { StageOutline } from '@/content/outline';
import { courseFor } from '@/content/outline';
import { MIXED_CASES, casePlays, stageRecord, stagesWithCases, type StageRecord } from '@/learning/caseStudies';
import { caseTopicIds, stageTopicIds, topicsLabel } from '@/learning/caseTopics';
import { NO_FILTERS, findPattern, playgroundHref } from '@/learning/patterns';
import { topicTitle } from '@/learning/recommend';

const percent = (fraction: number) => `${Math.round(fraction * 100)}%`;

/** Case studies: every stage that has cases, each case a card to play, with what the learner has done in it. */
export function CasesView() {
  return (
    <ProgressGate id="cases" loading="Loading the case studies…">
      {() => <Stages />}
    </ProgressGate>
  );
}

function Stages() {
  const { attempts } = useProgress();
  const plays = useMemo(() => casePlays(attempts), [attempts]);
  const samples = useSamples();
  // The stages of the learner's course that have cases. Every one of them can be played at once: a case study is
  // play, and nothing the learner has passed or not passed closes it.
  const course = useCourse();
  const order = useMemo(() => courseFor(course.courseId, course.choice)?.topics.map((t) => t.id) ?? [], [course.courseId, course.choice]);
  const all = stagesWithCases(course.stages);
  // The topics the cases are about (display only: learning/caseTopics.ts), to find the cases of one topic.
  const topics = useMemo(() => [...new Set(all.flatMap((s) => stageTopicIds(s, order)))].sort((a, b) => order.indexOf(a) - order.indexOf(b)), [all, order]);
  const asked = useSearchParams().get('topic');
  const [topic, setTopic] = useState(asked && topics.includes(asked) ? asked : 'all');
  const chooseTopic = (next: string) => {
    setTopic(next);
    window.history.replaceState(null, '', next !== 'all' ? `/cases?topic=${encodeURIComponent(next)}` : '/cases');
  };
  const stages = topic === 'all' ? all : all.map((s) => ({ ...s, cases: s.cases.filter((c) => caseTopicIds(c.id, s.topicId).includes(topic)) })).filter((s) => s.cases.length > 0);
  const caseCount = all.reduce((n, s) => n + s.cases.length, 0);
  // Endless: case after case from every stage, in the Playground.
  const endless = all.length > 0 ? playgroundHref(NO_FILTERS, { kind: 'mix', ids: all.flatMap((s) => s.cases.map((c) => c.id)) }) : undefined;

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-1">
        <BackToPractice />
        <h1 className="text-3xl font-extrabold tracking-tight">Case studies</h1>
        {caseCount > 0 ? (
          <p data-testid="cases-scale" className="text-lg font-extrabold text-primary-ink">
            {caseCount} case {caseCount === 1 ? 'study' : 'studies'} · a new case every play
          </p>
        ) : null}
        <p className="text-base text-muted">One business and several questions on it, asked in order. Every play has new figures.</p>
      </header>

      {all.length === 0 ? (
        <p data-testid="cases-empty" className="rounded-card border border-dashed border-edge-deep bg-sunken p-5 text-base font-bold text-muted">
          There are no case studies yet.
        </p>
      ) : (
        <>
          <Tile hue="teal" data-testid="cases-mixed-card" className="flex flex-col gap-3 bg-primary-soft! sm:flex-row sm:items-center sm:justify-between">
            <div className="flex min-w-0 items-start gap-3">
              <span aria-hidden="true" className="flex h-10 w-10 shrink-0 items-center justify-center rounded-control bg-hue-teal-soft text-hue-teal [&_svg]:h-5 [&_svg]:w-5">
                <CaseIcon />
              </span>
              <div className="flex min-w-0 flex-col gap-1">
                <h2 className="text-lg font-extrabold leading-tight">Mixed cases</h2>
                <p className="text-base">Cases from every stage, the stages taking turns: a new case after every one.</p>
              </div>
            </div>
            <div className="flex shrink-0 flex-col gap-2 sm:flex-row">
              <Link href={`/cases/play/${MIXED_CASES}`} data-testid="cases-mixed" className={buttonClasses('primary', 'lg', 'w-full sm:w-auto')}>
                Mixed cases
              </Link>
              {endless ? (
                <Link href={endless} data-testid="cases-endless" className={buttonClasses('secondary', 'lg', 'w-full sm:w-auto')}>
                  Endless mix
                </Link>
              ) : null}
            </div>
          </Tile>

          {topics.length > 1 ? (
            <div className="flex flex-col gap-2">
              <p id="cases-topic-label" className="text-sm font-bold text-muted">
                Show the case studies about
              </p>
              <Pills<string>
                options={[{ value: 'all', label: 'Every topic' }, ...topics.map((id) => ({ value: id, label: topicTitle(id) }))]}
                value={topic}
                onChange={chooseTopic}
                label="Show the case studies about"
                testIdPrefix="cases-topic"
              />
            </div>
          ) : null}

          {stages.map((stage) => (
            <StageSection key={stage.id} stage={stage} order={order} record={stageRecord(stage, plays)} samples={samples} />
          ))}
        </>
      )}
    </div>
  );
}

function StageSection({ stage, order, record, samples }: { stage: StageOutline; order: readonly string[]; record: StageRecord; samples: Readonly<Record<string, string>> | null }) {
  const count = stage.cases.length;
  const played = record.playedCaseIds.length;
  const meta = [
    `${count} ${count === 1 ? 'case study' : 'case studies'}`,
    played === 0 ? 'none played yet' : `${played} played`,
    ...(record.best === null ? [] : [`best score ${percent(record.best)}`]),
  ].join(' · ');

  return (
    <section data-testid={`stage-${stage.id}`} data-open="true" aria-labelledby={`stage-${stage.id}-title`} className="flex flex-col gap-3">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div className="flex min-w-0 flex-col gap-1">
          {/* The topics its cases are about, not only the topic after which the stage opens (Admission cases are in a stage that opens after Retirement). */}
          <GroupLabel>
            <span data-testid={`stage-${stage.id}-topics`}>{topicsLabel(stageTopicIds(stage, order).map(topicTitle))}</span>
          </GroupLabel>
          <h2 id={`stage-${stage.id}-title`} className="text-xl font-extrabold leading-tight">
            {stage.title}
          </h2>
          <p className="text-base text-muted">{stage.description}</p>
          <p data-testid={`stage-${stage.id}-meta`} className="text-sm font-bold text-primary-ink">
            {meta}
          </p>
        </div>
        <Link href={`/cases/play/${stage.id}`} data-testid={`stage-${stage.id}-new`} className={buttonClasses('primary', 'md', 'w-full shrink-0 sm:w-auto')}>
          New case
        </Link>
      </div>
      <ul className="grid grid-cols-1 gap-4 md:grid-cols-2 2xl:grid-cols-3">
        {stage.cases.map((c) => {
          const pattern = findPattern(c.id);
          if (!pattern) return null;
          const best = record.bestByCase[c.id];
          return (
            <li key={c.id} className="min-w-0">
              <PatternCard
                pattern={pattern}
                testId={`case-${c.id}`}
                sample={samples ? (samples[c.id] ?? '') : undefined}
                playHref={`/cases/play/${stage.id}?case=${encodeURIComponent(c.id)}`}
                footer={
                  <>
                    <ul aria-label="Topics" data-testid={`case-${c.id}-topics`} className="flex flex-wrap gap-1.5">
                      {caseTopicIds(c.id, stage.topicId).map((id) => (
                        <li key={id}>
                          <Chip tone="outline" className="min-h-7! px-2.5! text-xs!">
                            {topicTitle(id)}
                          </Chip>
                        </li>
                      ))}
                    </ul>
                    <p data-testid={`case-${c.id}-best`} className={`text-sm font-bold ${best === undefined ? 'text-muted' : 'text-primary-ink'}`}>
                      {best === undefined ? 'Not played' : `Best ${percent(best)}`}
                    </p>
                  </>
                }
              />
            </li>
          );
        })}
      </ul>
    </section>
  );
}
