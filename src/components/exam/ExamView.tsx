'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { tipId, useExamTicks } from '@/app-state/examTicks';
import { useCourse } from '@/app-state/useCourse';
import { useProgress } from '@/app-state/useProgress';
import { courseName } from '@/components/settings/CoursePicker';
import { buttonClasses } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Chip } from '@/components/ui/Chip';
import { GroupLabel, SectionHeader } from '@/components/ui/GroupLabel';
import { ProgressBar } from '@/components/ui/ProgressBar';
import { ProgressGate } from '@/components/ui/ProgressGate';
import { WIDE_QUERY, useMediaQuery } from '@/components/ui/useMediaQuery';
import type { CourseChoice } from '@/content/courseOptions';
import { loadTips, tipsFor, type ExamTips } from '@/content/glossary';
import { courseFor, findConceptTitle, topicTitle } from '@/content/outline';
import type { Course } from '@/content/types';
import { MISTAKE_TEXT } from '@/exercises/logic';
import { countdownText, daysToExam, formatDay } from '@/learning/examCountdown';
import { examPlan, frequentMistakes, notStartedTopics, paperPattern, unitWeights, weakestConcepts, type PlanDay, type PlanKind } from '@/learning/examPack';
import { MARK_VALUES, blueprintsOf } from '@/learning/paperBlueprints';
import { openMistakeIds } from '@/learning/practice';
import type { Progress } from '@/learning/progress';
import { examDateOf, type Profile } from '@/storage/types';

/** Below this mastery a topic the learner has started is one to strengthen in the plan. */
const WEAK_TOPIC = 60;
/** The days of the plan shown before "Show all". */
const PLAN_SHOWN = 14;

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
/** "Mon 3 Feb", written out by hand so a prerendered page and the browser agree. */
function shortDay(day: string): string {
  const [y, m, d] = day.split('-').map(Number);
  return `${WEEKDAYS[new Date(Date.UTC(y, m - 1, d)).getUTCDay()]} ${d} ${MONTHS[m - 1]}`;
}
const hoursText = (minutes: number) => (minutes % 60 === 0 ? plural(minutes / 60, 'hour', 'hours') : `${Math.floor(minutes / 60)} h ${minutes % 60} min`);

const PLAN_LABEL: Record<PlanKind, string> = {
  new: 'New topic',
  weak: 'Strengthen',
  mock: 'Mock paper',
  practice: 'Practice',
  mistakes: 'Mistakes',
  cards: 'Cards',
  sheets: 'Quick sheets',
};
const PLAN_TONE: Record<PlanKind, 'primary' | 'accent' | 'danger' | 'neutral'> = {
  new: 'primary',
  weak: 'accent',
  mock: 'danger',
  practice: 'neutral',
  mistakes: 'accent',
  cards: 'neutral',
  sheets: 'neutral',
};

/**
 * Before the exam: the countdown, the paper's pattern with a time for each section, where the marks are with the
 * learner's mastery, their weakest ideas and the topics not started, their most frequent mistakes, the exam tips of the
 * course as checklists (ticks kept on the device) and a simple plan to the exam day.
 */
export function ExamView() {
  return (
    <ProgressGate id="exam" loading="Getting your exam pack ready…">
      {({ profile, progress, today }) => <ExamPack profile={profile} progress={progress} today={today} />}
    </ProgressGate>
  );
}

function ExamPack({ profile, progress, today }: { profile: Profile; progress: Progress; today: string }) {
  const { courseId, packs, choice } = useCourse();
  const { attempts } = useProgress();
  // The course and its paper as the learner has them (Part B of Class 12 as chosen: content/courseOptions.ts).
  const course = courseFor(courseId, choice)!;
  const examDay = examDateOf(profile, courseId);
  const full = blueprintsOf(courseId, choice).full;
  const pattern = useMemo(() => paperPattern(full), [full]);
  const units = useMemo(() => unitWeights(full, course.topics, packs, progress), [full, course.topics, packs, progress]);
  const weakConcepts = useMemo(() => weakestConcepts(packs, progress, 6), [packs, progress]);
  const notStarted = useMemo(() => notStartedTopics(course.topics, packs, progress), [course.topics, packs, progress]);
  const mistakes = useMemo(() => frequentMistakes(attempts, progress, { topicIds: packs.map((p) => p.topicId), topics: 4, perTopic: 3 }), [attempts, progress, packs]);
  const open = useMemo(() => openMistakeIds(progress).length, [progress]);
  const weakTopics = useMemo(
    () =>
      units
        .flatMap((u) => u.topics)
        .filter((t) => t.started && t.mastery < WEAK_TOPIC)
        .sort((a, b) => a.mastery - b.mastery)
        .map((t) => ({ id: t.topicId, title: t.title })),
    [units],
  );
  const plan = useMemo(
    () => (examDay ? examPlan({ today, examDay, notStarted: notStarted.map((t) => ({ id: t.topicId, title: t.title })), weak: weakTopics, openMistakes: open }) : []),
    [examDay, today, notStarted, weakTopics, open],
  );

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h1 className="text-3xl font-extrabold tracking-tight">Before the exam</h1>
        <p className="text-base text-muted">Everything for the last stretch of {courseName(course)}: the paper, where the marks are, your weak spots, tips and a plan.</p>
      </div>

      <Countdown course={course} examDay={examDay} today={today} />

      <Pattern pattern={pattern} />

      <Card data-testid="exam-practical" className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-base">
          <span className="font-extrabold">Project work: 20 more marks.</span> The project file and the viva voce are marked apart from the paper. Read the guide of your project, and practise the viva
          questions until you can answer them aloud.
        </p>
        <Link href="/practical" data-testid="exam-practical-link" className={buttonClasses('secondary', 'md', 'shrink-0')}>
          Project and viva
        </Link>
      </Card>

      <Fold id="weights" testId="exam-weights" title="Where the marks are" summary={plural(units.length, 'unit', 'units')}>
        <ul className="grid grid-cols-1 gap-3 lg:grid-cols-2">
          {units.map((u) => (
            <li key={u.unit} className="min-w-0">
              <Card className="flex h-full flex-col gap-3">
                <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                  <h3 className="text-base font-extrabold">{u.unit}</h3>
                  <Chip tone="primary" data-testid="exam-unit-marks">
                    {u.marks} marks · {Math.round(u.share * 100)}%
                  </Chip>
                </div>
                <ul className="flex flex-col gap-2">
                  {u.topics.map((t) => (
                    <li key={t.topicId} data-testid={`exam-weight-${t.topicId}`} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1">
                      <span className="min-w-0 truncate text-sm font-bold">{t.title}</span>
                      <Link href={`/practice/topic/${t.topicId}`} aria-label={`Practise ${t.title}`} className="inline-flex min-h-11 min-w-11 items-center justify-end text-sm font-bold text-primary-ink underline">
                        Practise
                      </Link>
                      <span className="col-span-2 flex items-center gap-2">
                        <ProgressBar value={t.mastery / 100} thin label={`Mastery of ${t.title}`} />
                        <span className="w-24 shrink-0 text-right text-xs font-bold text-muted">{t.started ? `${t.mastery}% mastery` : 'Not started'}</span>
                      </span>
                    </li>
                  ))}
                </ul>
              </Card>
            </li>
          ))}
        </ul>
      </Fold>

      <Fold
        id="weak"
        testId="exam-weak-spots"
        title="Your weak spots"
        summary={`${plural(weakConcepts.length, 'weak idea', 'weak ideas')} · ${plural(notStarted.length, 'topic', 'topics')} not started`}
      >
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card data-testid="exam-weakest" className="flex flex-col gap-3">
          <h3 className="text-lg font-extrabold">Your weakest ideas</h3>
          {weakConcepts.length === 0 ? (
            <p className="text-sm text-muted">Nothing practised yet. Your weakest ideas show here once you have answered some questions.</p>
          ) : (
            <ul className="flex flex-col gap-2">
              {weakConcepts.map((c) => (
                <li key={c.conceptId} data-testid={`exam-weak-${c.conceptId}`} className="flex items-center justify-between gap-3">
                  <span className="flex min-w-0 flex-col">
                    <span className="font-bold">{c.title}</span>
                    <span className="text-xs font-bold text-muted">
                      {topicTitle(c.topicId)} · {c.mastery}% mastery
                    </span>
                  </span>
                  <Link href={c.href} prefetch={false} className={buttonClasses('secondary', 'md', 'shrink-0 px-3 text-sm')}>
                    Practise
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Card>
        <Card data-testid="exam-not-started" className="flex flex-col gap-3">
          <h3 className="text-lg font-extrabold">Topics not started</h3>
          {notStarted.length === 0 ? (
            <p className="text-sm text-muted">You have started every topic. Well done.</p>
          ) : (
            <ul className="flex flex-col gap-2">
              {notStarted.map((t) => (
                <li key={t.topicId} data-testid={`exam-new-${t.topicId}`} className="flex items-center justify-between gap-3">
                  <span className="min-w-0 font-bold">{t.title}</span>
                  <Link href={t.href} className={buttonClasses('secondary', 'md', 'shrink-0 px-3 text-sm')}>
                    Start
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Card>
        </div>
      </Fold>

      <Fold id="mistakes" testId="exam-mistakes" title="Your most frequent mistakes" summary={mistakes.length === 0 ? 'None yet' : plural(mistakes.length, 'topic', 'topics')}>
        <Link href="/mistakes" className="inline-flex min-h-11 items-center self-start text-sm font-bold text-primary-ink underline">
          All mistakes
        </Link>
        {mistakes.length === 0 ? (
          <p className="rounded-card border border-dashed border-edge-deep bg-sunken px-5 py-4 text-sm font-bold text-muted">No mistakes yet. The ones you make will be counted here, by topic.</p>
        ) : (
          <ul className="grid grid-cols-1 gap-3 lg:grid-cols-2">
            {mistakes.map((g) => (
              <li key={g.topicId} className="min-w-0">
                <Card data-testid={`exam-mistakes-${g.topicId}`} className="flex h-full flex-col gap-2">
                  <div className="flex flex-wrap items-baseline justify-between gap-x-3">
                    <h3 className="text-base font-extrabold">{topicTitle(g.topicId)}</h3>
                    <span className="text-sm font-bold text-muted">{plural(g.count, 'miss', 'misses')}</span>
                  </div>
                  <ul className="flex flex-col gap-2">
                    {g.mistakes.map((m) => (
                      <li key={`${m.conceptId}|${m.mistakeCode ?? ''}`} className="flex items-center justify-between gap-3 border-t border-edge pt-2">
                        <span className="flex min-w-0 flex-col">
                          <span className="font-bold">{findConceptTitle(m.conceptId) ?? topicTitle(g.topicId)}</span>
                          <span className="text-sm text-danger-deep">{m.mistakeCode && Object.hasOwn(MISTAKE_TEXT, m.mistakeCode) ? MISTAKE_TEXT[m.mistakeCode] : 'Wrong answers'}</span>
                          <span className="text-xs font-bold text-muted">
                            {m.count === 1 ? 'Once' : `${m.count} times`}
                            {m.open > 0 ? ` · ${m.open} still open` : ''}
                          </span>
                        </span>
                        <Link href={m.href} prefetch={false} data-testid="exam-try-similar" className={buttonClasses('secondary', 'md', 'shrink-0 px-3 text-sm')}>
                          Try a similar one
                        </Link>
                      </li>
                    ))}
                  </ul>
                </Card>
              </li>
            ))}
          </ul>
        )}
      </Fold>

      <Tips courseId={courseId} choice={choice} />

      <Plan plan={plan} examDay={examDay} today={today} />
    </div>
  );
}

function Countdown({ course, examDay, today }: { course: Course; examDay: string | null; today: string }) {
  if (!examDay) {
    return (
      <Card data-testid="exam-pack-countdown" data-state="unset" className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-base font-bold">Set the date of your {courseName(course)} exam to count down to it and get a plan to the day.</p>
        <Link href="/settings#exam-dates" data-testid="exam-pack-set-date" className={buttonClasses('primary', 'md', 'shrink-0')}>
          Set your exam date
        </Link>
      </Card>
    );
  }
  const days = daysToExam(today, examDay);
  return (
    <Card data-testid="exam-pack-countdown" className="flex flex-col gap-3 border-t-[3px] border-t-hue-blue sm:flex-row sm:items-center sm:gap-6">
      <div className="flex items-baseline gap-2 sm:flex-col sm:items-center sm:gap-0">
        <span data-testid="exam-pack-days" className="text-5xl font-extrabold tabular-nums leading-none text-hue-blue">
          {Math.max(0, days)}
        </span>
        <span className="text-sm font-extrabold uppercase tracking-wide text-muted">{days === 1 ? 'day' : 'days'} left</span>
      </div>
      <div className="flex min-w-0 flex-col gap-1">
        <p className="text-xl font-extrabold">{countdownText(days, courseName(course))}</p>
        <p data-testid="exam-pack-date" className="text-sm font-bold text-muted">
          {formatDay(examDay)} ·{' '}
          <Link href="/settings#exam-dates" className="text-primary-ink underline">
            Change the date
          </Link>
        </p>
      </div>
    </Card>
  );
}

function Pattern({ pattern }: { pattern: ReturnType<typeof paperPattern> }) {
  const byMark = MARK_VALUES.filter((v) => pattern.byMark[v] > 0);
  return (
    <section aria-labelledby="pattern-heading" data-testid="exam-pattern" className="flex flex-col gap-3">
      <SectionHeader id="pattern-heading" title="The paper" />
      <Card className="flex flex-col gap-4">
        <p data-testid="exam-pattern-summary" className="text-base font-bold">
          {pattern.marks} marks in {hoursText(pattern.minutes)}, {pattern.questions} questions, with {pattern.readingMinutes} minutes to read the paper first.
        </p>
        <ul aria-label="Questions by marks" className="flex flex-wrap gap-2">
          {byMark.map((v) => (
            <li key={v}>
              <Chip tone="neutral" data-testid={`exam-pattern-marks-${v}`}>
                {plural(pattern.byMark[v], `question of ${v} ${v === 1 ? 'mark' : 'marks'}`, `questions of ${v} ${v === 1 ? 'mark' : 'marks'}`)}
              </Chip>
            </li>
          ))}
        </ul>
        {/* The time line: reading, then each section in proportion to its marks. */}
        <div aria-hidden="true" className="flex h-3 w-full overflow-hidden rounded-full bg-edge">
          {pattern.sections.map((s, i) => (
            <div key={s.title} className={['h-full', ['bg-hue-blue', 'bg-hue-green', 'bg-hue-amber', 'bg-hue-violet', 'bg-hue-rose'][i % 5]].join(' ')} style={{ width: `${(s.minutes / pattern.minutes) * 100}%` }} />
          ))}
        </div>
        <ol className="flex flex-col gap-2">
          <li className="flex flex-wrap items-baseline justify-between gap-x-3 rounded-control bg-sunken px-3 py-2">
            <span className="font-bold">Reading time</span>
            <span className="text-sm font-bold text-muted">{pattern.readingMinutes} minutes, before the clock starts</span>
          </li>
          {pattern.sections.map((s, i) => (
            <li key={s.title} data-testid={`exam-section-${i}`} className="grid grid-cols-1 gap-1 rounded-control border border-edge px-3 py-2 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center sm:gap-x-4">
              <span className="flex min-w-0 flex-col">
                <span className="font-extrabold">
                  {s.part ? <span className="text-muted">Part {s.part} · </span> : null}
                  {s.title}
                </span>
                <span className="text-sm text-muted">
                  {s.marks} marks ·{' '}
                  {MARK_VALUES.filter((v) => s.questions[v] > 0)
                    .map((v) => `${s.questions[v]} × ${v} ${v === 1 ? 'mark' : 'marks'}`)
                    .join(', ')}
                </span>
              </span>
              <span data-testid={`exam-section-time-${i}`} className="text-sm font-extrabold text-primary-ink sm:text-right">
                About {s.minutes} minutes
              </span>
            </li>
          ))}
        </ol>
        <p className="text-sm text-muted">The times share the {pattern.minutes} minutes in proportion to the marks: about {Math.round((pattern.minutes / pattern.marks) * 10) / 10} minutes a mark. Keep the last few minutes of each section to check your work.</p>
      </Card>
    </section>
  );
}

function Tips({ courseId, choice }: { courseId: string; choice: CourseChoice }) {
  const [tips, setTips] = useState<ExamTips | null | undefined>(undefined);
  const { ticked, toggle } = useExamTicks(courseId);
  useEffect(() => {
    let current = true;
    loadTips(courseId).then(
      (t) => current && setTips(t ?? null),
      () => current && setTips(null),
    );
    return () => {
      current = false;
    };
  }, [courseId]);

  if (tips === undefined) {
    return (
      <p role="status" aria-busy="true" data-testid="exam-tips-loading" className="text-base text-muted">
        Loading the exam tips…
      </p>
    );
  }
  if (tips === null) return null;
  // Only what the learner's paper has: the sections of their full paper, and the mistakes of the topics they meet.
  const shown = tipsFor(tips, courseId, choice);
  const byTopic = new Map<string, string[]>();
  for (const m of shown.mistakes) byTopic.set(m.topicId, [...(byTopic.get(m.topicId) ?? []), m.text]);
  const all = [...shown.general, ...shown.sections.flatMap((s) => s.tips), ...shown.mistakes.map((m) => m.text)];
  const done = all.filter((t) => ticked.has(tipId(t))).length;

  return (
    <Fold
      id="tips"
      testId="exam-tips"
      title="Exam tips"
      summary={
        <span data-testid="exam-tips-count">
          {done} of {all.length} ticked
        </span>
      }
    >
      <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
        <Checklist title="In the exam hall" items={shown.general} ticked={ticked} toggle={toggle} />
        {shown.sections.map((s) => (
          <Checklist key={s.title} title={s.title} items={s.tips} ticked={ticked} toggle={toggle} />
        ))}
        {[...byTopic.entries()].map(([topicId, items]) => (
          <Checklist
            key={topicId}
            title={`Common mistakes: ${topicTitle(topicId)}`}
            items={items}
            ticked={ticked}
            toggle={toggle}
            action={
              <Link href={`/practice/topic/${topicId}`} aria-label={`Practise ${topicTitle(topicId)}`} className="inline-flex min-h-11 items-center text-sm font-bold text-primary-ink underline">
                Practise
              </Link>
            }
          />
        ))}
      </div>
    </Fold>
  );
}

function Checklist({ title, items, ticked, toggle, action }: { title: string; items: readonly string[]; ticked: ReadonlySet<string>; toggle(id: string): void; action?: ReactNode }) {
  if (items.length === 0) return null;
  return (
    <Card className="flex flex-col gap-2">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3">
        <GroupLabel as="h3">{title}</GroupLabel>
        {action}
      </div>
      <ul className="flex flex-col gap-1">
        {items.map((text) => {
          const id = tipId(text);
          const on = ticked.has(id);
          return (
            <li key={id}>
              <label className="flex min-h-11 cursor-pointer items-start gap-3 rounded-control px-1 py-2 hover:bg-sunken">
                <input type="checkbox" checked={on} onChange={() => toggle(id)} data-testid={`tip-${id}`} className="mt-0.5 h-6 w-6 shrink-0 accent-primary" />
                <span className={['text-base', on ? 'text-muted line-through' : ''].join(' ')}>{text}</span>
              </label>
            </li>
          );
        })}
      </ul>
    </Card>
  );
}

function Plan({ plan, examDay, today }: { plan: PlanDay[]; examDay: string | null; today: string }) {
  const [all, setAll] = useState(false);
  const days = examDay ? daysToExam(today, examDay) : null;
  const shown = all ? plan : plan.slice(0, PLAN_SHOWN);
  return (
    <Fold id="plan" testId="exam-plan" title="A plan to the exam day" summary={plan.length > 0 ? plural(plan.length, 'day', 'days') : 'Set your exam date'}>
      {days === null ? (
        <p className="rounded-card border border-dashed border-edge-deep bg-sunken px-5 py-4 text-base">
          Set your exam date in{' '}
          <Link href="/settings#exam-dates" className="font-bold text-primary-ink underline">
            Settings
          </Link>{' '}
          and a day-by-day plan appears here.
        </p>
      ) : plan.length === 0 ? (
        <p className="rounded-card border border-dashed border-edge-deep bg-sunken px-5 py-4 text-base">
          {days === 0 ? 'The exam is today: read each question twice, show your working and watch the clock. All the best!' : 'Your exam date has gone by. Set the date of your next exam to plan for it.'}
        </p>
      ) : (
        <Card className="flex flex-col gap-3">
          <p className="text-sm text-muted">
            A suggestion, not a timetable: the topics you have not started first, then your weakest, a mock paper every few days, and the last days for the quick sheets and your mistakes. It changes as you
            make progress.
          </p>
          <ol data-testid="exam-plan-days" className="flex flex-col">
            {shown.map((d) => (
              <li key={d.date} data-testid="exam-plan-day" data-kind={d.kind} className="grid grid-cols-[5.5rem_minmax(0,1fr)] items-center gap-3 border-t border-edge py-2 first:border-t-0">
                <span className="text-sm font-bold text-muted">{d.date === today ? 'Today' : shortDay(d.date)}</span>
                <span className="flex min-w-0 flex-wrap items-center gap-2">
                  <Chip tone={PLAN_TONE[d.kind]}>{PLAN_LABEL[d.kind]}</Chip>
                  <Link href={d.href} className="min-w-0 font-bold text-primary-ink underline">
                    {d.title}
                  </Link>
                </span>
              </li>
            ))}
          </ol>
          {plan.length > PLAN_SHOWN ? (
            <button type="button" data-testid="exam-plan-all" onClick={() => setAll((v) => !v)} className={buttonClasses('secondary', 'md', 'self-start')}>
              {all ? 'Show fewer days' : `Show all ${plan.length} days`}
            </button>
          ) : null}
        </Card>
      )}
    </Fold>
  );
}

/**
 * A part of the page that folds, so that the page is short on a phone: its heading is a button (at least 44 px tall)
 * that says what is inside in a few words and opens it. Open from the start where there is room (1024 px and wider),
 * closed on a phone; the learner's choice holds after that. The content stays on the page while folded (hidden), so a
 * search of the page still finds it, and an address that names it (`/exam#plan`) opens it.
 */
function Fold({ id, testId, title, summary, children }: { id: string; testId: string; title: string; summary: ReactNode; children: ReactNode }) {
  const wide = useMediaQuery(WIDE_QUERY);
  // Rendered in the browser only (after the learner's progress has loaded), so the address can be read at once.
  const [chosen, setChosen] = useState<boolean | null>(() => (typeof window !== 'undefined' && decodeURIComponent(window.location.hash.slice(1)) === id ? true : null));
  // A link to the part from this page (`#plan`) opens it too.
  useEffect(() => {
    const onHash = () => {
      if (decodeURIComponent(window.location.hash.slice(1)) === id) setChosen(true);
    };
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, [id]);
  const open = chosen ?? wide;
  return (
    <section id={id} aria-labelledby={`${id}-heading`} data-testid={testId} data-open={open ? 'true' : 'false'} className="flex scroll-mt-24 flex-col gap-3">
      <h2 id={`${id}-heading`} className="text-lg font-extrabold">
        <button
          type="button"
          data-testid={`${testId}-toggle`}
          aria-expanded={open}
          aria-controls={`${id}-body`}
          onClick={() => setChosen(!open)}
          className="flex min-h-12 w-full items-center justify-between gap-3 rounded-card border border-edge bg-surface px-4 py-2 text-left shadow-card hover:bg-sunken"
        >
          <span className="flex min-w-0 flex-col">
            <span>{title}</span>
            <span className="text-sm font-bold text-muted">{summary}</span>
          </span>
          <span aria-hidden="true" className={`shrink-0 text-xl transition-transform ${open ? 'rotate-180' : ''}`}>
            ▾
          </span>
        </button>
      </h2>
      <div id={`${id}-body`} hidden={!open} className="flex flex-col gap-3">
        {children}
      </div>
    </section>
  );
}
