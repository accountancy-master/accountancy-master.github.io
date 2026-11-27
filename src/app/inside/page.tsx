'use client';

import Link from 'next/link';
import { useState } from 'react';
import type { ReactNode } from 'react';
import { useProgress } from '@/app-state/useProgress';
import { useStore } from '@/app-state/StoreProvider';
import { answeredByTopic, courseSummary } from '@/components/progress/summaries';
import { courseName } from '@/components/settings/CoursePicker';
import { shortCourseName } from '@/components/shell/CourseSwitch';
import { playgroundHref } from '@/components/shell/navigation';
import { topicStanding } from '@/components/topics/topicFilters';
import { Pills } from '@/components/ui/Pills';
import { ProgressBar } from '@/components/ui/ProgressBar';
import { Shell } from '@/components/ui/Shell';
import { StatTile } from '@/components/ui/StatTile';
import { choiceOf } from '@/content/courseOptions';
import { courseCounts, DIFFICULTIES, PATTERN_GROUP_LABEL, PATTERN_GROUPS, type ContentCounts } from '@/content/contentCounts';
import { findCourse, findOutline, outlinesOf, playableCourses } from '@/content/outline';
import type { Difficulty } from '@/content/types';

const DIFFICULTY_LABEL: Record<Difficulty, string> = { easy: 'Easy', medium: 'Medium', complex: 'Hard' };
const GROUP_SHORT: Record<(typeof PATTERN_GROUPS)[number], string> = { entries: 'Entries', sets: 'Sets', formats: 'Formats', choice: 'Choice', figures: 'Calculations' };

export default function InsidePage() {
  return (
    <Shell width="wide">
      <Inside />
    </Shell>
  );
}

/** One column of the matrix: its heading, the number it shows of a topic's counts, and where that is played. */
interface Column {
  key: string;
  label: string;
  /** Said in full to a screen reader and as a tooltip. */
  title: string;
  value(c: ContentCounts): number;
  href(topicId: string): string;
  prefetch?: false;
}

const COLUMNS: Column[] = [
  { key: 'levels', label: 'Levels', title: 'Levels on the ladder', value: (c) => c.levels, href: (t) => `/topics/${t}` },
  { key: 'lessons', label: 'Lessons', title: 'Lessons that teach', value: (c) => c.lessons, href: (t) => `/topics/${t}` },
  { key: 'cards', label: 'Cards', title: 'Rule cards', value: (c) => c.cards, href: (t) => `/sheet/${t}` },
  { key: 'questions', label: 'Questions', title: 'Questions written by hand', value: (c) => c.questions, href: (t) => `/topics/${t}` },
  ...PATTERN_GROUPS.map((g): Column => ({ key: g, label: GROUP_SHORT[g], title: `Question types: ${PATTERN_GROUP_LABEL[g]}`, value: (c) => c.byGroup[g], href: (t) => playgroundHref(t), prefetch: false })),
  ...DIFFICULTIES.map((d): Column => ({ key: d, label: DIFFICULTY_LABEL[d], title: `Question types: ${DIFFICULTY_LABEL[d].toLowerCase()}`, value: (c) => c.byDifficulty[d], href: (t) => playgroundHref(t), prefetch: false })),
  { key: 'cases', label: 'Cases', title: 'Case studies', value: (c) => c.cases, href: () => '/cases' },
];

/** Where the pattern columns start and end, for the group heading above them. */
const PATTERN_SPAN = PATTERN_GROUPS.length + DIFFICULTIES.length;

function Inside() {
  const { profile } = useStore();
  const { courseProgress } = useProgress();
  const courses = playableCourses();
  const [chosen, setChosen] = useState(profile?.courseId ?? courses[0]?.id ?? '');
  const course = findCourse(chosen) ?? courses[0];
  if (!profile || !course) return null;
  // Counted from the outline, which is in memory: cheap enough to count on every render.
  // The topics the learner meets: a learner who takes Computerised Accounting as Part B of Class 12 sees it in place
  // of Analysis of Financial Statements (content/courseOptions.ts).
  const choice = choiceOf(profile);
  const counts = courseCounts(course.id, choice);
  const cp = courseProgress(course.id);
  const answered = answeredByTopic(cp?.events.attempts ?? []);
  const outlines = outlinesOf(course.id, choice);
  const summary = cp ? courseSummary(outlines, cp.progress, answered) : null;
  const t = counts.total;

  // Topics by unit, in catalogue order, with their counts.
  const units: { unit: string; rows: { id: string; title: string; counts: ContentCounts }[] }[] = [];
  for (const topic of course.topics) {
    const row = counts.topics.find((x) => x.topicId === topic.id);
    if (!row) continue;
    let unit = units.find((u) => u.unit === topic.unit);
    if (!unit) units.push((unit = { unit: topic.unit, rows: [] }));
    unit.rows.push({ id: topic.id, title: topic.title, counts: row.counts });
  }

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-4 rounded-panel border border-edge bg-surface p-5 shadow-card lg:flex-row lg:items-end lg:justify-between lg:p-6">
        <div className="flex flex-col gap-1">
          <h1 className="text-3xl font-extrabold tracking-tight">What&apos;s inside</h1>
          <p className="text-base text-muted">
            Everything {courseName(course)} holds, topic by topic, and how much of it you have done. Every number opens where it is played.
          </p>
          <Link href="/maps" data-testid="inside-maps" className="self-start text-sm font-bold text-primary-ink underline">
            See the course as a mind map
          </Link>
        </div>
        {courses.length > 1 ? (
          <Pills options={courses.map((c) => ({ value: c.id, label: shortCourseName(c.title) }))} value={course.id} onChange={setChosen} label="Course" testIdPrefix="inside-course" className="shrink-0 flex-nowrap" />
        ) : null}
      </header>

      <ul aria-label="In all" data-testid="inside-totals" className="grid grid-cols-2 gap-3 sm:grid-cols-4 xl:grid-cols-8">
        <StatTile as="li" label="Topics" value={counts.topics.length} testId="inside-total-topics" hue="green" />
        <StatTile as="li" label="Levels" value={t.levels} testId="inside-total-levels" hue="teal" />
        <StatTile as="li" label="Question types" value={t.patterns} testId="inside-total-patterns" hue="violet" />
        <StatTile as="li" label="Questions" value={t.questions} testId="inside-total-questions" hue="blue" />
        <StatTile as="li" label="Cards" value={t.cards} testId="inside-total-cards" hue="sky" />
        <StatTile as="li" label="Sets" value={t.byGroup.sets} testId="inside-total-sets" hue="orange" />
        <StatTile as="li" label="Formats" value={t.byGroup.formats} testId="inside-total-formats" hue="rose" />
        <StatTile as="li" label="Case studies" value={t.cases} testId="inside-total-cases" hue="amber" />
      </ul>

      {summary ? (
        <p data-testid="inside-progress" className="text-base font-bold">
          You have started {summary.started} of {summary.topics} topics and passed {summary.levelsPassed} of {summary.levels} levels.
        </p>
      ) : null}

      <div className="overflow-x-auto rounded-card border border-edge bg-surface shadow-card" tabIndex={0} role="region" aria-label={`What ${courseName(course)} holds, by topic`}>
        <table data-testid="inside-matrix" className="w-full min-w-[60rem] border-collapse text-sm">
          <caption className="sr-only">
            {courseName(course)}: what each topic holds, and your progress in it
          </caption>
          <thead>
            <tr className="bg-sunken text-xs uppercase tracking-wide text-muted">
              <th scope="col" rowSpan={2} className="sticky left-0 z-[1] bg-sunken px-3 py-2 text-left">
                Topic
              </th>
              <th scope="colgroup" colSpan={4} className="px-2 pt-2 text-center">
                Learn
              </th>
              <th scope="colgroup" colSpan={PATTERN_SPAN} className="border-l border-edge px-2 pt-2 text-center">
                Question types, by kind and by difficulty
              </th>
              <th scope="col" rowSpan={2} className="border-l border-edge px-2 py-2 text-right" title="Case studies">
                Cases
              </th>
              <th scope="col" rowSpan={2} className="border-l border-edge px-3 py-2 text-left">
                Your progress
              </th>
            </tr>
            <tr className="bg-sunken text-xs text-muted">
              {COLUMNS.filter((c) => c.key !== 'cases').map((c, i) => (
                <th key={c.key} scope="col" title={c.title} className={['px-2 pb-2 text-right font-bold', i === 4 || i === 4 + PATTERN_GROUPS.length ? 'border-l border-edge' : ''].join(' ')}>
                  <abbr title={c.title} className="no-underline">
                    {c.label}
                  </abbr>
                </th>
              ))}
            </tr>
          </thead>
          {units.map((u) => (
            <tbody key={u.unit}>
              <tr>
                <th scope="rowgroup" colSpan={COLUMNS.length + 2} className="border-t border-edge bg-primary-soft/40 px-3 py-1.5 text-left text-xs font-extrabold uppercase tracking-wide text-primary-ink">
                  {u.unit}
                </th>
              </tr>
              {u.rows.map((row) => {
                const outline = findOutline(row.id);
                const standing = outline && cp ? topicStanding(outline, cp.progress, answered.get(row.id) ?? 0) : null;
                return (
                  <tr key={row.id} data-testid={`inside-row-${row.id}`} className="border-t border-edge hover:bg-sunken/60">
                    <th scope="row" className="sticky left-0 z-[1] bg-surface px-3 py-2 text-left font-bold">
                      <Link href={`/topics/${row.id}`} className="hover:text-primary-ink hover:underline">
                        {row.title}
                      </Link>
                    </th>
                    {COLUMNS.map((c, i) => (
                      <Cell key={c.key} n={c.value(row.counts)} href={c.href(row.id)} prefetch={c.prefetch} title={`${row.title}: ${c.title}`} testId={`inside-${row.id}-${c.key}`} edge={i === 4 || i === 4 + PATTERN_GROUPS.length || c.key === 'cases'} />
                    ))}
                    <td className="min-w-44 border-l border-edge px-3 py-2">
                      {standing ? (
                        <div data-testid={`inside-${row.id}-progress`} className="flex flex-col gap-1">
                          <span className="text-xs font-bold">
                            {standing.passed}/{standing.total} levels · {standing.mastery}%
                          </span>
                          <ProgressBar thin value={standing.total ? standing.passed / standing.total : 0} label={`${row.title}: ${standing.passed} of ${standing.total} levels passed`} />
                        </div>
                      ) : (
                        '–'
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          ))}
          <tfoot>
            <tr className="border-t-2 border-edge-deep bg-sunken font-extrabold">
              <th scope="row" className="sticky left-0 z-[1] bg-sunken px-3 py-2 text-left">
                In all
              </th>
              {COLUMNS.map((c, i) => (
                <td key={c.key} data-testid={`inside-sum-${c.key}`} className={['px-2 py-2 text-right tabular-nums', i === 4 || i === 4 + PATTERN_GROUPS.length || c.key === 'cases' ? 'border-l border-edge' : ''].join(' ')}>
                  {c.value(t)}
                </td>
              ))}
              <td className="border-l border-edge px-3 py-2 text-xs">{summary ? `${summary.levelsPassed}/${summary.levels} levels · ${summary.mastery}%` : '–'}</td>
            </tr>
          </tfoot>
        </table>
      </div>
      <Legend />
    </div>
  );
}

function Cell({ n, href, prefetch, title, testId, edge }: { n: number; href: string; prefetch?: false; title: string; testId: string; edge: boolean }): ReactNode {
  return (
    <td className={['px-2 py-2 text-right tabular-nums', edge ? 'border-l border-edge' : ''].join(' ')}>
      {n > 0 ? (
        <Link href={href} prefetch={prefetch} data-testid={testId} aria-label={`${n} ${title}`} className="inline-flex min-h-7 min-w-7 items-center justify-end rounded px-1 font-bold text-primary-ink hover:bg-primary-soft hover:underline">
          {n}
        </Link>
      ) : (
        <span aria-label={`No ${title}`} className="text-muted">
          –
        </span>
      )}
    </td>
  );
}

function Legend() {
  return (
    <p className="text-sm text-muted">
      Levels and lessons open the topic&apos;s ladder; cards open its quick sheet; the question types open the playground, where each makes a new question every time; case studies open the case studies.
    </p>
  );
}
