'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import { useProgress } from '@/app-state/useProgress';
import { useStore } from '@/app-state/StoreProvider';
import { personalBests } from '@/components/progress/bests';
import { answeredByTopic, courseSummary, unitBars, weakestIdeas } from '@/components/progress/summaries';
import { courseName } from '@/components/settings/CoursePicker';
import { shortCourseName } from '@/components/shell/CourseSwitch';
import { playgroundHref } from '@/components/shell/navigation';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Chip } from '@/components/ui/Chip';
import { CourseUnavailable } from '@/components/ui/CourseUnavailable';
import { SectionHeader } from '@/components/ui/GroupLabel';
import { BoltIcon, ChartIcon, FlameIcon, TargetIcon, TickIcon } from '@/components/ui/icons';
import { masteryWord } from '@/components/ui/MasteryRing';
import { Pills } from '@/components/ui/Pills';
import { ProgressBar } from '@/components/ui/ProgressBar';
import { ProgressRing } from '@/components/ui/ProgressRing';
import { Shell } from '@/components/ui/Shell';
import { StatTile } from '@/components/ui/StatTile';
import { choiceOf, partBOf } from '@/content/courseOptions';
import { courseFor, outlinesOf, playableCourses, templatesForConcept, topicTitle } from '@/content/outline';
import type { Course } from '@/content/types';
import { currentStreak, dayKey, rankFor } from '@/learning/gamification';
import { openMistakeIds } from '@/learning/practice';
import { type Progress } from '@/learning/progress';

export default function ProgressPage() {
  return (
    <Shell width="wide">
      <ProgressView />
    </Shell>
  );
}

// Rendered by Shell only once a profile is selected.
function ProgressView() {
  const { profile } = useStore();
  const { progress, status, reload } = useProgress();
  if (!profile) return null;
  const course = courseFor(profile.courseId, choiceOf(profile));

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-3xl font-extrabold tracking-tight">Progress</h1>
      {!course ? (
        <CourseUnavailable />
      ) : status === 'error' ? (
        <div role="alert" className="flex flex-col items-start gap-3 rounded-card border-2 border-danger bg-surface p-5">
          <p className="text-base font-bold">We couldn&apos;t load your progress.</p>
          <Button variant="secondary" data-testid="progress-retry" onClick={() => void reload()}>
            Try again
          </Button>
        </div>
      ) : progress === null ? (
        <p role="status" aria-busy="true" className="text-base text-muted">
          Loading your progress…
        </p>
      ) : (
        <Loaded progress={progress} course={course} />
      )}
    </div>
  );
}

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

function Loaded({ progress, course }: { progress: Progress; course: Course }) {
  const { attempts, sessionResults, courseProgress } = useProgress();
  // The topics the learner meets (Part B of Class 12 as chosen: content/courseOptions.ts).
  const { profile } = useStore();
  const choice = choiceOf(profile);
  // Read once per mount; this component only renders on the client.
  const [today] = useState(() => dayKey(Date.now()));
  const [unitCourse, setUnitCourse] = useState(course.id);
  const rank = rankFor(progress.xp);
  const streak = currentStreak(progress.streak, today);
  const mistakes = openMistakeIds(progress).length;
  const accuracy = progress.answered > 0 ? Math.round((progress.correct / progress.answered) * 100) : null;
  const outlines = outlinesOf(course.id, choice);
  const answered = useMemo(() => answeredByTopic(attempts), [attempts]);
  const summary = courseSummary(outlines, progress, answered);
  const partB = partBOf(profile);
  const weak = useMemo(() => weakestIdeas(outlinesOf(course.id, { class12PartB: partB }), progress, 8), [course.id, partB, progress]);
  const bests = useMemo(() => personalBests(sessionResults, progress.xpByDay), [sessionResults, progress.xpByDay]);
  const courses = playableCourses();

  // By unit: the course chosen above the bars, the learner's own unless they pick the other.
  const shown = courseFor(unitCourse, choice) ?? course;
  const shownProgress = courseProgress(shown.id);
  const bars = shownProgress ? unitBars(shown.topics, outlinesOf(shown.id, choice), shownProgress.progress, answeredByTopic(shownProgress.events.attempts)) : [];

  return (
    <>
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[22rem_minmax(0,1fr)]">
        <Card className="flex flex-col gap-3">
          <p className="text-xs font-extrabold uppercase tracking-wide text-muted">Your rank</p>
          <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
            <p data-testid="rank" className="text-2xl font-extrabold text-primary-ink">
              {rank.name}
            </p>
            <p data-testid="progress-xp" className="text-lg font-extrabold">
              {progress.xp} XP
            </p>
          </div>
          {rank.next && (
            <>
              <ProgressBar value={(progress.xp - rank.xp) / (rank.next.xp - rank.xp)} label={`Progress towards ${rank.next.name}`} data-testid="rank-progress" />
              <p data-testid="rank-next" className="text-base font-bold">
                {rank.next.xp - progress.xp} XP to {rank.next.name}
              </p>
            </>
          )}
        </Card>
        <ul aria-label="Your numbers" className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <StatTile as="li" label="Day streak" testId="progress-streak" value={String(streak)} unit={streak === 1 ? 'day' : 'days'} icon={<FlameIcon />} hue="orange" />
          <StatTile as="li" label="Questions answered" testId="progress-answered" value={String(progress.answered)} icon={<TargetIcon />} hue="blue" />
          <StatTile as="li" label="Accuracy" testId="progress-accuracy" value={accuracy === null ? '–' : `${accuracy}%`} icon={<TickIcon />} hue="green" />
          <StatTile as="li" label="Avg mastery" testId="progress-mastery" value={`${summary.mastery}%`} icon={<ChartIcon />} hue="violet" />
        </ul>
      </div>

      <Card href="/mistakes" data-testid="progress-mistakes" className="p-4! text-base font-extrabold text-primary-ink">
        {mistakes} {mistakes === 1 ? 'mistake' : 'mistakes'} waiting
      </Card>

      <section aria-labelledby="courses-heading" className="flex flex-col gap-3">
        <SectionHeader id="courses-heading" title="Your courses" />
        <ul className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {courses.map((c) => {
            const cp = courseProgress(c.id);
            const s = cp ? courseSummary(outlinesOf(c.id, choice), cp.progress, answeredByTopic(cp.events.attempts)) : null;
            return (
              <li key={c.id}>
                <Card data-testid={`progress-course-${c.id}`} className="flex items-center gap-4">
                  <ProgressRing value={s?.mastery ?? 0} size={72} label={`${courseName(c)} mastery`} />
                  <div className="flex min-w-0 flex-col gap-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="text-lg font-extrabold">{courseName(c)}</h3>
                      {c.id === course.id ? <Chip tone="primary">Current</Chip> : null}
                    </div>
                    <p className="text-sm font-bold">{s ? `${s.started} of ${s.topics} topics started` : '–'}</p>
                    <p className="text-sm text-muted">{s ? `${s.levelsPassed} of ${s.levels} levels passed · ${s.done} topics done` : ''}</p>
                  </div>
                </Card>
              </li>
            );
          })}
        </ul>
      </section>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <section aria-labelledby="units-heading" className="flex min-w-0 flex-col gap-3">
          <SectionHeader
            id="units-heading"
            title="By unit"
            action={
              courses.length > 1 ? (
                <Pills options={courses.map((c) => ({ value: c.id, label: shortCourseName(c.title) }))} value={shown.id} onChange={setUnitCourse} label="Course" testIdPrefix="progress-units-course" />
              ) : undefined
            }
          />
          <div className="flex flex-col gap-4">
            {bars.map((u) => (
              <Card key={u.unit} data-testid="progress-unit" className="flex flex-col gap-3 p-4!">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <h3 className="text-base font-extrabold">{u.unit}</h3>
                  <p className="text-sm font-bold text-muted">
                    {u.levelsPassed} of {u.levels} levels · {u.mastery}% mastery
                  </p>
                </div>
                <ProgressBar value={u.mastery / 100} label={`${u.unit} mastery`} />
                <ul className="flex flex-col gap-2">
                  {u.topics.map(({ topic, standing }) => (
                    <li key={topic.id} data-testid={`progress-topic-${topic.id}`} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1 text-sm">
                      <Link href={`/topics/${topic.id}`} className="min-w-0 truncate font-bold hover:underline">
                        {topic.title}
                      </Link>
                      <span className="text-xs font-bold text-muted">
                        {standing.passed} of {standing.total} levels passed · {masteryWord(standing.mastery)}
                      </span>
                      <ProgressBar thin value={standing.mastery / 100} label={`${topic.title} mastery`} className="col-span-2" />
                    </li>
                  ))}
                </ul>
              </Card>
            ))}
          </div>
        </section>

        <div className="flex min-w-0 flex-col gap-6">
          <section aria-labelledby="weak-heading" className="flex flex-col gap-3">
            <SectionHeader id="weak-heading" title="Weakest ideas" />
            <Card className="flex flex-col gap-2 p-4!">
              {weak.length === 0 ? (
                <p data-testid="weak-none" className="text-sm font-bold text-muted">
                  Answer some questions and the ideas you find hardest show up here, each a click from practice.
                </p>
              ) : (
                <ul data-testid="weak-ideas" className="flex flex-col divide-y divide-edge">
                  {weak.map((w) => {
                    const pattern = templatesForConcept(w.conceptId)[0];
                    return (
                      <li key={w.conceptId} className="flex items-center gap-3 py-2">
                        <ProgressRing value={w.mastery} size={40} stroke={5} tone={w.mastery < 40 ? 'rose' : 'amber'} label={`${w.title} mastery`} />
                        <span className="flex min-w-0 flex-1 flex-col">
                          <span className="text-sm font-bold">{w.title}</span>
                          <span className="truncate text-xs text-muted">{topicTitle(w.topicId)}</span>
                        </span>
                        <Link
                          href={pattern ? playgroundHref(w.topicId, pattern.id) : `/practice/topic/${w.topicId}`}
                          prefetch={false}
                          data-testid={`weak-idea-${w.conceptId}`}
                          aria-label={`Play ${w.title}`}
                          className="shrink-0 rounded-full bg-primary-soft px-3 py-1 text-sm font-extrabold text-primary-ink hover:brightness-95"
                        >
                          Play
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              )}
            </Card>
          </section>

          <section aria-labelledby="bests-heading" className="flex flex-col gap-3">
            <SectionHeader id="bests-heading" title="Personal bests" />
            <ul className="grid grid-cols-2 gap-3">
              <StatTile as="li" label="Best day" value={bests.bestDayXp} unit="XP" testId="best-day" icon={<BoltIcon />} hue="amber" />
              <StatTile as="li" label="Marathon row" value={bests.marathonStreak} unit={bests.marathonStreak === 1 ? 'answer' : 'answers'} testId="best-marathon" hue="orange" />
              <StatTile as="li" label="Best mock paper" value={bests.mock ? `${bests.mock.correct}/${bests.mock.total}` : '–'} testId="best-mock" hue="blue" />
              <StatTile as="li" label="Best case study" value={bests.caseStudy ? `${bests.caseStudy.correct}/${bests.caseStudy.total}` : '–'} testId="best-case" hue="teal" />
            </ul>
            <p className="text-sm text-muted">{plural(summary.done, 'topic', 'topics')} done in {courseName(course)}.</p>
          </section>
        </div>
      </div>
    </>
  );
}
