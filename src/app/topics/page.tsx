'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import { useDeviceSettings } from '@/app-state/DeviceSettings';
import { useProgress } from '@/app-state/useProgress';
import { useStore } from '@/app-state/StoreProvider';
import { courseName } from '@/components/settings/CoursePicker';
import { playgroundHref } from '@/components/shell/navigation';
import { describeTopicSize } from '@/components/topic/size';
import { TOPIC_FILTERS, TOPIC_FILTER_LABEL, matchesFilter, matchesQuery, topicStanding, type TopicFilter, type TopicStanding } from '@/components/topics/topicFilters';
import { buttonClasses } from '@/components/ui/Button';
import { Chip } from '@/components/ui/Chip';
import { CourseUnavailable } from '@/components/ui/CourseUnavailable';
import { masteryWord } from '@/components/ui/MasteryRing';
import { Pills } from '@/components/ui/Pills';
import { ProgressRing } from '@/components/ui/ProgressRing';
import { SearchField } from '@/components/ui/SearchField';
import { Shell } from '@/components/ui/Shell';
import { courseCounts, type ContentCounts } from '@/content/contentCounts';
import { choiceKey, choiceOf, type CourseChoice } from '@/content/courseOptions';
import { courseFor, findOutline, playableCourses, topicSize } from '@/content/outline';
import type { Course, TopicMeta, TopicOutline, TopicStatus } from '@/content/types';
import { unitMarksOf } from '@/learning/paperBlueprints';
import { levelUnlocked, type Progress } from '@/learning/progress';

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

const STATUS_CHIP: Record<TopicStatus, string | null> = {
  available: null,
  comingSoon: 'Coming soon',
  planned: 'Planned',
};

/**
 * Places of the catalogue that are not topics with a ladder but pages of their own, already there: the catalogue
 * lists them at the end of Class 11 (mixed case studies, the mock papers). Their cards open the page; they are
 * never shown as "Planned".
 */
const LIVE_ELSEWHERE: Readonly<Record<string, { href: string; action: string; note: string }>> = {
  'mixed-case-studies': { href: '/cases', action: 'Open case studies', note: 'Ready now: one business and linked questions, a new case every play.' },
  'mock-exams': { href: '/mock', action: 'Open mock papers', note: 'Ready now: full and half papers against the clock, marked at the end.' },
};

/** Topics grouped by unit, units in the order they first appear in the catalogue. */
function groupByUnit<T extends { topic: TopicMeta }>(rows: T[]): { unit: string; rows: T[] }[] {
  const groups: { unit: string; rows: T[] }[] = [];
  for (const row of rows) {
    const group = groups.find((g) => g.unit === row.topic.unit);
    if (group) group.rows.push(row);
    else groups.push({ unit: row.topic.unit, rows: [row] });
  }
  return groups;
}

export default function TopicsPage() {
  return (
    <Shell width="wide">
      <Roadmap />
    </Shell>
  );
}

// Rendered by Shell only once a profile is selected.
function Roadmap() {
  const { profile } = useStore();
  if (!profile) return null;
  // The course as the learner has it: without the topics of the choice of Part B (Class 12) not made.
  const choice = choiceOf(profile);
  const course = courseFor(profile.courseId, choice);
  return course ? <CourseRoadmap key={`${course.id}|${choiceKey(choice)}`} course={course} choice={choice} /> : <CourseUnavailable />;
}

interface Row {
  topic: TopicMeta;
  outline: TopicOutline | undefined;
  counts: ContentCounts | undefined;
  standing: TopicStanding | null;
}

function CourseRoadmap({ course, choice }: { course: Course; choice: CourseChoice }) {
  // The other courses a learner can be on. Once there is one, it is a course of its own and not a preview of this one.
  const others = playableCourses().filter((c) => c.id !== course.id);
  const { progress, attempts, status } = useProgress();
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<TopicFilter>('all');
  // Numbers appear only once progress has loaded, so a returning learner never sees a flash of zeros.
  const loaded = status === 'ready' ? progress : null;
  const counts = useMemo(() => courseCounts(course.id, choice), [course.id, choice]);
  const marks = useMemo(() => unitMarksOf(course.id, choice), [course.id, choice]);
  // Questions answered per topic, counted once per load of the attempts, not once per card per render.
  const answered = useMemo(() => {
    const byTopic = new Map<string, number>();
    for (const a of attempts) byTopic.set(a.topicId, (byTopic.get(a.topicId) ?? 0) + 1);
    return byTopic;
  }, [attempts]);

  const rows: Row[] = useMemo(
    () =>
      course.topics.map((topic) => {
        const outline = topic.status === 'available' ? findOutline(topic.id) : undefined;
        return {
          topic,
          outline,
          counts: counts.topics.find((t) => t.topicId === topic.id)?.counts,
          standing: outline && loaded ? topicStanding(outline, loaded, answered.get(topic.id) ?? 0) : null,
        };
      }),
    [course.topics, counts, loaded, answered],
  );
  const available = rows.filter((r) => r.outline);
  const elsewhere = rows.filter((r) => !r.outline && LIVE_ELSEWHERE[r.topic.id]).length;
  const countOf = (f: TopicFilter) => (f === 'all' ? rows.length : available.filter((r) => r.standing && matchesFilter(r.standing, f)).length);
  const shown = rows.filter((r) => {
    if (!matchesQuery(query, [r.topic.title, r.topic.unit, r.topic.description, ...(r.outline?.concepts.map((c) => c.title) ?? [])])) return false;
    if (filter === 'all') return true;
    return r.standing !== null && matchesFilter(r.standing, filter);
  });
  const started = available.filter((r) => r.standing?.started).length;

  return (
    <div className="flex flex-col gap-6">
      <header data-testid="topics-header" className="flex flex-col gap-4 rounded-panel border border-edge bg-surface p-5 shadow-card lg:p-6">
        <div className="flex flex-col gap-1">
          <h1 className="text-3xl font-extrabold tracking-tight">{course.title}</h1>
          <p data-testid="topics-summary" className="text-base font-semibold text-muted">
            {plural(course.topics.length - elsewhere, 'topic', 'topics')} · {available.length} ready to learn · {plural(counts.total.levels, 'level', 'levels')} ·{' '}
            {plural(counts.total.patterns, 'question type', 'question types')}
            {loaded ? ` · ${started} started` : ''}
          </p>
          <p data-testid="topics-buttons-help" className="text-sm text-muted">
            On each topic: <span className="font-bold">Start</span> (or Continue) plays the next level of its ladder, <span className="font-bold">Practise</span> is free practice with nothing to unlock, and{' '}
            <span className="font-bold">Rules</span> is its rule sheet.
          </p>
        </div>
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
          <SearchField value={query} onChange={setQuery} label="Search topics" testId="topics-search" className="lg:w-80" />
          <Pills<TopicFilter>
            options={TOPIC_FILTERS.map((f) => ({ value: f, label: TOPIC_FILTER_LABEL[f], ...(loaded || f === 'all' ? { count: countOf(f) } : {}) }))}
            value={filter}
            onChange={setFilter}
            label="Show topics"
            testIdPrefix="topics-filter"
          />
        </div>
      </header>

      <p role="status" data-testid="topics-showing" className="-mb-2 text-sm font-bold text-muted">
        Showing {shown.length} of {rows.length} topics
      </p>

      {groupByUnit(shown).map((group, i) => (
        <section key={group.unit} aria-labelledby={`unit-${i}`} className="flex flex-col gap-3">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <h2 id={`unit-${i}`} className="text-lg font-extrabold text-primary-ink">
              {group.unit}
            </h2>
            {marks[group.unit] ? (
              <Chip tone="neutral" data-testid={`unit-marks-${i}`}>
                {marks[group.unit]} marks in the board paper
              </Chip>
            ) : null}
          </div>
          <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
            {group.rows.map((row) => (
              <li key={row.topic.id} className="min-w-0">
                <TopicCard row={row} progress={loaded} />
              </li>
            ))}
          </ul>
        </section>
      ))}

      {shown.length === 0 ? (
        <p data-testid="topics-none" className="rounded-card border border-dashed border-edge-deep bg-sunken px-5 py-6 text-center font-bold text-muted">
          No topic matches. Try another word or show all topics.
        </p>
      ) : null}

      {others.length > 0 ? (
        <p data-testid="other-courses" className="rounded-card border border-dashed border-edge-deep bg-sunken px-5 py-4 text-base">
          {others.map((c) => courseName(c)).join(' and ')} is a course of its own. You can change course in{' '}
          <Link href="/settings" data-testid="other-courses-settings" className="font-extrabold text-primary-ink underline">
            Settings
          </Link>
          . What you have done here is kept.
        </p>
      ) : course.previews.length > 0 ? (
        <section aria-labelledby="class-12-heading" className="flex flex-col gap-3">
          <h2 id="class-12-heading" className="text-lg font-extrabold text-muted">
            Class 12 – coming later
          </h2>
          <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {course.previews.map((preview) => (
              <li key={preview.title}>
                <div data-testid="preview-card" className="flex flex-col items-start gap-2 rounded-card border border-dashed border-edge-deep bg-sunken px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
                  <p className="min-w-0 font-bold text-muted">{preview.title}</p>
                  <Chip>{preview.label}</Chip>
                </div>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}

function TopicCard({ row, progress }: { row: Row; progress: Progress | null }) {
  const { topic, outline, counts, standing } = row;
  const { unlockAll } = useDeviceSettings();
  const live = LIVE_ELSEWHERE[topic.id];
  if ((!outline || !counts) && live) {
    return (
      <article data-testid={`topic-card-${topic.id}`} data-status={topic.status} data-live="true" className="flex h-full flex-col gap-3 rounded-card border border-edge bg-surface p-4 shadow-card">
        <h3 className="text-lg font-extrabold leading-snug">{topic.title}</h3>
        <p className="text-sm text-muted">{topic.description}</p>
        <p className="text-sm font-bold text-primary-ink">{live.note}</p>
        <Link href={live.href} data-testid={`topic-live-${topic.id}`} className={buttonClasses('primary', 'md', 'mt-auto self-start')}>
          {live.action}
        </Link>
      </article>
    );
  }
  if (!outline || !counts) {
    const chip = STATUS_CHIP[topic.status];
    return (
      <div data-testid={`topic-card-${topic.id}`} data-status={topic.status} className="flex h-full flex-col gap-2 rounded-card border border-dashed border-edge-deep bg-sunken p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="min-w-0 text-lg font-extrabold text-muted">{topic.title}</h3>
          {chip && <Chip>{chip}</Chip>}
        </div>
        <p className="text-sm text-muted">{topic.description}</p>
      </div>
    );
  }
  const levels = [...outline.levels].sort((a, b) => a.order - b.order);
  const next = progress ? levels.find((l) => !progress.passedLevelIds.includes(l.id) && levelUnlocked(l, levels, progress.passedLevelIds, unlockAll)) : undefined;
  const size = topicSize(topic.id);
  return (
    <article
      data-testid={`topic-card-${topic.id}`}
      data-status={topic.status}
      className="relative flex h-full flex-col gap-3 rounded-card border border-edge bg-surface p-4 shadow-card transition-shadow hover:shadow-card-hover"
    >
      <div className="flex items-start gap-3">
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <h3 className="text-lg font-extrabold leading-snug">
            {/* The whole card opens the topic (the link's area covers it); its three buttons sit above that. */}
            <Link href={`/topics/${topic.id}`} data-testid={`topic-open-${topic.id}`} className="after:absolute after:inset-0 after:rounded-card after:content-[''] hover:text-primary-ink hover:underline">
              {topic.title}
            </Link>
          </h3>
          <p className="line-clamp-2 text-sm text-muted">{topic.description}</p>
        </div>
        {/* Levels passed is what a learner counts; mastery (how well they answer) is in words beside it. */}
        {standing ? (
          <ProgressRing value={standing.total ? (standing.passed / standing.total) * 100 : 0} size={56} label={`${topic.title}: ${standing.passed} of ${standing.total} levels passed`} />
        ) : (
          <div role="img" aria-label={`${topic.title}: levels passed`} className="h-14 w-14 shrink-0 rounded-full border-[7px] border-edge" />
        )}
      </div>
      <dl className="grid grid-cols-2 gap-x-3 gap-y-1 text-sm">
        <dt className="sr-only">Levels</dt>
        <dd data-testid={`topic-levels-${topic.id}`} className="font-bold text-primary-ink">
          {standing ? standing.passed : '–'} of {levels.length} levels passed
        </dd>
        <dt className="sr-only">Mastery</dt>
        <dd data-testid={`topic-mastery-word-${topic.id}`} className="text-right font-bold text-muted">
          {standing ? `${standing.mastery > 0 || !standing.started ? masteryWord(standing.mastery) : 'Mastery'} · mastery ${standing.mastery}%` : '–'}
        </dd>
        <dt className="sr-only">Answered</dt>
        <dd data-testid={`topic-answered-${topic.id}`} className="col-span-2 font-semibold">
          {standing ? plural(standing.answered, 'question', 'questions') : '–'} answered
        </dd>
        <dt className="sr-only">Content</dt>
        <dd data-testid={`topic-size-${topic.id}`} className="col-span-2 text-xs font-bold tabular-nums text-muted">
          {describeTopicSize(size)}
        </dd>
      </dl>
      <div className="relative z-[1] mt-auto grid grid-cols-3 gap-2">
        <Link
          href={next ? `/play/${next.id}` : `/topics/${topic.id}`}
          data-testid={`topic-continue-${topic.id}`}
          aria-label={next ? `Continue ${topic.title}: level ${next.order}, ${next.title}` : `Open ${topic.title}`}
          className={buttonClasses('primary', 'md', 'min-h-11! px-2! text-sm')}
        >
          {standing?.started ? 'Continue' : 'Start'}
        </Link>
        <Link
          href={playgroundHref(topic.id)}
          prefetch={false}
          data-testid={`topic-play-${topic.id}`}
          aria-label={`Free practice in ${topic.title}: any question type, nothing to unlock`}
          title="Free practice: any question type, nothing to unlock"
          className={buttonClasses('secondary', 'md', 'min-h-11! px-2! text-sm')}
        >
          Practise
        </Link>
        <Link href={`/sheet/${topic.id}`} data-testid={`topic-sheet-${topic.id}`} aria-label={`Rule sheet of ${topic.title}: every rule and format on one page`} title="Rule sheet: every rule and format on one page" className={buttonClasses('secondary', 'md', 'min-h-11! px-2! text-sm')}>
          Rules
        </Link>
      </div>
    </article>
  );
}
