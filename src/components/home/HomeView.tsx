'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { useDeviceSettings } from '@/app-state/DeviceSettings';
import { useCourse } from '@/app-state/useCourse';
import { useProgress } from '@/app-state/useProgress';
import { useStore } from '@/app-state/StoreProvider';
import { answeredByTopic, courseSummary, unitBars } from '@/components/progress/summaries';
import { courseName } from '@/components/settings/CoursePicker';
import { shortCourseName } from '@/components/shell/CourseSwitch';
import { playgroundHref } from '@/components/shell/navigation';
import { MapIcon } from '@/components/maps/MapIcon';
import { buttonClasses } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Chip } from '@/components/ui/Chip';
import { GroupLabel, SectionHeader } from '@/components/ui/GroupLabel';
import { BoltIcon, CardsIcon, CaseIcon, ChartIcon, ChecklistIcon, ClockIcon, FlameIcon, LoopIcon, PlayIcon, ProjectIcon, RetryIcon, SheetIcon, SparkIcon, TargetIcon, TickIcon } from '@/components/ui/icons';
import { ProgressBar } from '@/components/ui/ProgressBar';
import { ProgressGate } from '@/components/ui/ProgressGate';
import { ProgressRing } from '@/components/ui/ProgressRing';
import { StatTile } from '@/components/ui/StatTile';
import { Tile, TileBody } from '@/components/ui/Tile';
import { courseCounts } from '@/content/contentCounts';
import { choiceOf, type CourseChoice } from '@/content/courseOptions';
import { courseFor, outlinesOf, playableCourses } from '@/content/outline';
import type { Course } from '@/content/types';
import { CONFIG } from '@/learning/config';
import { currentStreak } from '@/learning/gamification';
import { openMistakeIds, practiceCounts } from '@/learning/practice';
import { goalMet, xpToday, type Progress } from '@/learning/progress';
import { nextStep, recommendNext, topicTitle, type Recommendation } from '@/learning/recommend';
import { activeTopicIds, deriveTopicActivity, mostRecentTopicId } from '@/learning/topics';
import { planPracticeSession } from '@/play/practiceSession';
import { examDateOf, type Profile } from '@/storage/types';
import { recentActivity, whenText } from './activity';
import { homeStatus } from './status';
import { ExamCountdownCard } from './ExamCountdownCard';
import { GoalRing } from './GoalRing';
import { describeMission, previewMission } from './mission';
import { masteryNote, nextStepText } from './nextStep';
import { WeekChart } from './WeekChart';
import { weekDays } from './week';

const MISSION_LOCKED = "Pass your first level to unlock today's mission.";
const CHALLENGE_LOCKED = "Pass your first level to unlock today's challenge.";

const RECOMMEND_ACTION: Record<Recommendation['kind'], string> = {
  mistakes: 'Fix mistakes',
  cards: 'Revise cards',
  level: 'Go to level',
  smart: 'Practise',
};

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/** "Good morning" by the clock of the device. */
function greeting(hour: number): string {
  if (hour < 5) return 'Good evening';
  if (hour < 12) return 'Good morning';
  if (hour < 17) return 'Good afternoon';
  return 'Good evening';
}

/**
 * Home, a dashboard. First what to do now: the greeting, then one card with the next step and why it is the next one,
 * beside today's goal, mission and challenge. Then the learner's numbers (once there is something to count), the exam
 * countdown, quick actions, the courses, the week, what was done last, and what the course holds.
 */
export function HomeView() {
  return (
    <ProgressGate id="home" loading="Loading your day…">
      {({ profile, today }) => <Dashboard profile={profile} today={today} />}
    </ProgressGate>
  );
}

function Dashboard({ profile, today }: { profile: Profile; today: string }) {
  const { progress, attempts, sessionResults, levelResults, cardStates, activity } = useProgress();
  const { unlockAll } = useDeviceSettings();
  // The playable topics of the learner's course: everything below is about them and no others.
  const { packs, courseId, choice } = useCourse();
  // The course as the learner has it (Part B of Class 12 as chosen: content/courseOptions.ts).
  const course = courseFor(courseId, choice)!;
  // Read once per visit: what is due is counted as of opening the screen.
  const [now] = useState(() => Date.now());
  // HomeView renders this only once progress is present.
  const p = progress!;
  // When a level of each topic was last played: the next step follows the ladders, never a case or practice elsewhere.
  const levelActivity = useMemo(() => deriveTopicActivity([], levelResults), [levelResults]);

  const goal = profile.dailyGoalXp ?? CONFIG.dailyGoal.default;
  const xp = xpToday(p, today);
  const met = goalMet(p, today, goal);
  const missionDone = p.missionDoneDays.includes(today);
  const challengeDone = p.challengeDoneDays.includes(today);
  const streak = currentStreak(p.streak, today);

  // The mission as it would be played right now. It is only counted here, never started.
  const mission = useMemo(
    () => (missionDone ? null : previewMission({ packs, progress: p, attempts, sessionResults, cardStates, activity, now, unlockAll })),
    [missionDone, packs, p, attempts, sessionResults, cardStates, activity, now, unlockAll],
  );
  // The challenge as it would be played right now: only counted, to know whether there is anything to offer.
  const challengeAvailable = useMemo(
    () => (challengeDone ? false : planPracticeSession('daily', { packs, progress: p, attempts, sessionResults, cardStates, activity, now, unlockAll }).length > 0),
    [challengeDone, packs, p, attempts, sessionResults, cardStates, activity, now, unlockAll],
  );
  // These look through every pack, card and open mistake, so they are worked out when the data changes, not on each render.
  const next = useMemo(() => nextStep(packs, p.passedLevelIds, unlockAll, levelActivity), [packs, p, unlockAll, levelActivity]);
  const recommendation = useMemo(() => recommendNext({ packs, progress: p, states: cardStates, levelActivity, now, unlockAll }), [packs, p, cardStates, levelActivity, now, unlockAll]);
  const { due, fresh, mistakes } = useMemo(() => practiceCounts(packs, p, cardStates, now, activeTopicIds(packs, activity)), [packs, p, cardStates, activity, now]);
  const answered = useMemo(() => answeredByTopic(attempts), [attempts]);
  const summary = useMemo(() => courseSummary(packs, p, answered), [packs, p, answered]);
  const units = useMemo(() => unitBars(course.topics, packs, p, answered), [course.topics, packs, p, answered]);
  const weakTopics = useMemo(
    () =>
      units
        .flatMap((u) => u.topics)
        .filter((t) => t.standing.started && !t.standing.done)
        .sort((a, b) => a.standing.mastery - b.standing.mastery)
        .map((t) => ({ id: t.topic.id, title: t.topic.title })),
    [units],
  );
  const sheetTopicId = mostRecentTopicId(packs, activity);
  const days = useMemo(() => weekDays(today, p.xpByDay), [today, p.xpByDay]);
  const weekXp = days.reduce((sum, d) => sum + d.xp, 0);
  const accuracy = p.answered > 0 ? `${Math.round((p.correct / p.answered) * 100)}%` : '–';
  const [hour] = useState(() => new Date().getHours());
  // The tiles of numbers wait until there is something to count: a new learner sees what to do, not five zeros.
  const anyNumbers = p.xp > 0 || p.answered > 0 || summary.levelsPassed > 0;
  const text = next ? nextStepText(next, topicTitle(next.pack.topicId)) : null;

  return (
    <div className="flex flex-col gap-6">
      <section className="flex flex-col justify-center gap-1 rounded-panel border border-edge bg-gradient-to-br from-primary-soft to-surface px-5 py-4 shadow-card">
        <h1 className="text-xl font-extrabold leading-tight tracking-tight sm:text-3xl">
          {greeting(hour)}, <span data-testid="home-name" className="whitespace-nowrap">{profile.name}</span>
        </h1>
        <p data-testid="home-status" className="text-base font-semibold text-muted">
          {homeStatus({ xp, goal, streak, mistakes })}
        </p>
      </section>

      {/* What to do now, first: the next step and why, beside today. */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <Card data-testid="continue-card" data-why={next?.why ?? 'done'} className="flex flex-col gap-4 border-2 border-primary">
          {next && text ? (
            <>
              <div className="flex flex-col gap-1">
                <GroupLabel as="h2">{text.heading}</GroupLabel>
                <p className="text-sm font-bold text-muted">
                  {topicTitle(next.pack.topicId)} · Level {next.level.order}
                </p>
                <p className="text-2xl font-extrabold leading-tight">{next.level.title}</p>
              </div>
              <p data-testid="continue-why" className="text-base">
                {text.reason}
              </p>
              {next.passed > 0 ? (
                <div className="flex items-center gap-3">
                  <ProgressBar value={next.passed / next.total} label={`${topicTitle(next.pack.topicId)}: ${next.passed} of ${next.total} levels passed`} />
                  <span className="shrink-0 text-sm font-bold tabular-nums text-muted">
                    {next.passed}/{next.total}
                  </span>
                </div>
              ) : null}
              <Link
                href={`/play/${next.level.id}`}
                data-testid="continue-start"
                aria-label={`${text.action}: ${topicTitle(next.pack.topicId)}, level ${next.level.order}, ${next.level.title}`}
                className={buttonClasses('primary', 'lg', 'w-full')}
              >
                {text.action}
              </Link>
            </>
          ) : (
            <>
              <GroupLabel as="h2">Next step</GroupLabel>
              <p className="text-lg font-bold">All levels passed — keep sharp with practice</p>
            </>
          )}
          {/* Something else worth doing (mistakes, cards due, practice); never the same level a second time. */}
          {recommendation.kind !== 'level' ? (
            <div data-testid="recommend-card" className="mt-auto flex flex-col gap-2 rounded-control border border-edge bg-sunken p-3 sm:flex-row sm:items-center">
              <p className="min-w-0 flex-1 text-sm">
                <span className="font-extrabold">{next ? 'Also worth doing: ' : 'Recommended: '}</span>
                {recommendation.reason}
              </p>
              <Link href={recommendation.href} data-testid="recommend-start" className={buttonClasses('secondary', 'md', 'shrink-0')}>
                {RECOMMEND_ACTION[recommendation.kind]}
              </Link>
            </div>
          ) : null}
        </Card>

        <Card className="flex flex-col gap-4">
          <GroupLabel as="h2">Today</GroupLabel>
          <div className="flex items-center gap-4">
            <GoalRing xp={xp} goal={goal} met={met} />
            <div className="flex min-w-0 flex-col gap-1">
              {met ? (
                <p data-testid="goal-met" className="inline-flex min-h-8 items-center gap-1.5 self-start rounded-full bg-primary px-3 text-base font-extrabold text-white">
                  <TickIcon />
                  Goal met
                </p>
              ) : (
                <p className="text-base font-bold">{goal - xp} more XP reaches today&apos;s goal.</p>
              )}
              <Link href="/settings" className="inline-flex min-h-11 items-center self-start text-sm font-bold text-muted underline">
                Goal: {goal} XP a day
              </Link>
            </div>
          </div>

          <div data-testid="mission-card" className={`flex flex-col gap-2 rounded-control border p-3 ${missionDone || !mission ? 'border-edge' : 'border-primary bg-primary-soft'}`}>
            <h3 className="text-sm font-extrabold uppercase tracking-wide text-muted">Today&apos;s mission</h3>
            {missionDone ? (
              <>
                <p className="flex items-center gap-2 text-lg font-extrabold text-primary-ink">
                  <TickIcon />
                  Mission complete
                </p>
                <p className="text-sm">Bonus earned. A new mission is waiting tomorrow.</p>
              </>
            ) : mission ? (
              <>
                <p data-testid="mission-contents" className="text-base font-extrabold">
                  {describeMission(mission)}
                </p>
                <p>
                  <Bonus>+{CONFIG.xp.dailyMissionBonus} XP bonus when you finish</Bonus>
                </p>
                <Link href="/practice/mission" data-testid="mission-start" className={buttonClasses('primary', 'md', 'w-full')}>
                  Start mission
                </Link>
              </>
            ) : (
              <p data-testid="mission-locked" className="text-sm font-bold">
                {MISSION_LOCKED}
              </p>
            )}
          </div>

          <div data-testid="challenge-card" className="flex flex-col gap-2 rounded-control border border-edge p-3">
            <h3 className="text-sm font-extrabold uppercase tracking-wide text-muted">Today&apos;s challenge</h3>
            {challengeDone ? (
              <p className="flex items-center gap-2 text-lg font-extrabold text-primary-ink">
                <TickIcon />
                Done for today
              </p>
            ) : !challengeAvailable ? (
              <p data-testid="challenge-locked" className="text-sm font-bold">
                {CHALLENGE_LOCKED}
              </p>
            ) : (
              <div className="flex flex-wrap items-center gap-2">
                <p className="min-w-0 flex-1 text-sm">Harder questions, the same for everyone today.</p>
                <Bonus>+{CONFIG.xp.dailyChallengeBonus} XP</Bonus>
                <Link href="/practice/daily" data-testid="challenge-start" className={buttonClasses('secondary', 'md', 'w-full')}>
                  Start challenge
                </Link>
              </div>
            )}
          </div>
        </Card>
      </div>

      {anyNumbers ? (
        <section aria-labelledby="numbers-heading" className="flex flex-col gap-3">
          <SectionHeader id="numbers-heading" title="Your numbers" />
          <ul aria-label="Your numbers" className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-5">
            <StatTile as="li" label="XP" value={p.xp} testId="home-xp" icon={<BoltIcon />} hue="amber" />
            <StatTile as="li" label="Day streak" value={streak} unit={streak === 1 ? 'day' : 'days'} testId="home-streak" icon={<FlameIcon />} hue="orange" />
            <StatTile as="li" label="Questions" value={p.answered} testId="home-answered" icon={<TargetIcon />} hue="blue" />
            <StatTile as="li" label="Accuracy" value={accuracy} testId="home-accuracy" icon={<TickIcon />} hue="green" />
            <StatTile as="li" label="Levels passed" value={summary.levelsPassed} unit={`of ${summary.levels}`} testId="home-levels" icon={<ChartIcon />} hue="violet" className="col-span-2 sm:col-span-1" />
          </ul>
        </section>
      ) : null}

      <ExamCountdownCard course={course} examDay={examDateOf(profile, courseId)} today={today} weakTopics={weakTopics} />

      <section aria-labelledby="quick-heading" className="flex flex-col gap-3">
        <SectionHeader id="quick-heading" title="Quick actions" />
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          <QuickAction href={playgroundHref()} prefetch={false} testId="quick-playground" hue="violet" icon={<PlayIcon />} title="Playground" detail="Any question type, endlessly" />
          <QuickAction href="/practice/marathon" testId="quick-marathon" hue="orange" icon={<LoopIcon />} title="Marathon" detail="Until you stop" />
          <QuickAction href="/practice/smart" testId="quick-smart" hue="green" icon={<SparkIcon />} title="Smart practice" detail="A mix for you" />
          <QuickAction href="/mistakes" testId="quick-mistakes" hue="rose" icon={<RetryIcon />} title="Review mistakes" detail={mistakes > 0 ? `${mistakes} waiting` : 'None waiting'} />
          <QuickAction href="/practice/cards" testId="quick-cards" hue="teal" icon={<CardsIcon />} title="Revise cards" detail={due > 0 ? `${due} due` : fresh > 0 ? `${fresh} new` : 'All up to date'} />
          <QuickAction href="/exam" testId="quick-exam" hue="teal" icon={<ChecklistIcon />} title="Before the exam" detail="The paper, tips and a plan" />
          <QuickAction href="/practical" testId="quick-practical" hue="violet" icon={<ProjectIcon />} title="Project and viva" detail="Guides and viva practice" />
          <QuickAction href="/mock" testId="quick-mock" hue="blue" icon={<ClockIcon />} title="Mock paper" detail="Timed, marked at the end" />
          <QuickAction href="/cases" testId="quick-cases" hue="amber" icon={<CaseIcon />} title="Case studies" detail="One business, linked questions" />
          {/* The sheet of the topic played most recently (the first topic for a new learner). */}
          <QuickAction href={sheetTopicId ? `/sheet/${sheetTopicId}` : '/sheets'} testId="quick-sheet" hue="sky" icon={<SheetIcon />} title="Quick sheets" detail={sheetTopicId ? topicTitle(sheetTopicId) : 'Rules and formats'} />
          <QuickAction href="/maps" testId="quick-maps" hue="green" icon={<MapIcon />} title="Mind maps" detail="Your course at a glance" />
        </ul>
      </section>

      <CourseCards current={course} today={today} />

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card className="flex flex-col gap-4">
          <div className="flex flex-wrap items-baseline justify-between gap-x-3">
            <h2 className="text-lg font-extrabold">This week</h2>
            <p data-testid="week-total" className="text-base font-bold text-accent-ink">
              {weekXp} XP
            </p>
          </div>
          <WeekChart days={days} />
          <table data-testid="week-table" className="sr-only">
            <caption>XP earned each day this week</caption>
            <thead>
              <tr>
                <th scope="col">Day</th>
                <th scope="col">XP</th>
              </tr>
            </thead>
            <tbody>
              {days.map((d) => (
                <tr key={d.day}>
                  <th scope="row">
                    {d.label}
                    {d.state === 'today' ? ' (today)' : ''}
                  </th>
                  <td>{d.state === 'future' ? 'not yet' : d.xp}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {weekXp === 0 && <p className="text-center text-sm font-bold text-muted">Earn some XP and this week&apos;s first bar appears here.</p>}
        </Card>

        <RecentActivity levelResults={levelResults} sessionResults={sessionResults} today={today} />
      </div>

      <WhatsInside course={course} choice={choice} progress={p} units={units} />
    </div>
  );
}

function Bonus({ children }: { children: ReactNode }) {
  return (
    <span className="inline-flex min-h-7 items-center gap-1 rounded-full bg-accent-soft px-3 text-sm font-extrabold text-accent-ink">
      <BoltIcon />
      {children}
    </span>
  );
}

function QuickAction({ href, prefetch, testId, hue, icon, title, detail }: { href: string; prefetch?: boolean; testId: string; hue: Parameters<typeof Tile>[0]['hue']; icon: ReactNode; title: string; detail: string }) {
  return (
    <li className="min-w-0">
      <Tile href={href} prefetch={prefetch} hue={hue} data-testid={testId} className="h-full min-h-28">
        <TileBody hue={hue} icon={icon} title={title} detail={detail} />
      </Tile>
    </li>
  );
}

/**
 * A card for each course: where the learner stands in it (levels passed, which is what a learner counts, with mastery
 * said in words), what is waiting, and the way in. The current course's next step is the first card of Home, so its
 * card does not offer it a second time.
 */
function CourseCards({ current, today }: { current: Course; today: string }) {
  const { profile, updateProfile } = useStore();
  const { courseProgress } = useProgress();
  const courses = playableCourses();
  const [failed, setFailed] = useState(false);
  if (!profile) return null;
  return (
    <section aria-labelledby="courses-heading" className="flex flex-col gap-3">
      <SectionHeader
        id="courses-heading"
        title="Your courses"
        action={
          <Link href="/settings#exam-dates" className="inline-flex min-h-11 items-center text-sm font-bold text-primary-ink underline">
            Set your exam dates
          </Link>
        }
      />
      <ul className="grid grid-cols-1 gap-4 md:grid-cols-2">
        {courses.map((c) => {
          const mine = c.id === current.id;
          const outlines = outlinesOf(c.id, choiceOf(profile));
          const cp = courseProgress(c.id);
          const answered = answeredByTopic(cp?.events.attempts ?? []);
          const s = cp ? courseSummary(outlines, cp.progress, answered) : null;
          const waiting = cp ? openMistakeIds(cp.progress).length : 0;
          const exam = examDateOf(profile, c.id);
          const switchTo = () => void updateProfile({ courseId: c.id }).catch(() => setFailed(true));
          return (
            <li key={c.id} className="min-w-0">
              <article data-testid={`course-card-${c.id}`} data-current={mine ? 'true' : undefined} className={`flex h-full flex-col gap-3 rounded-card border bg-surface p-4 shadow-card ${mine ? 'border-primary' : 'border-edge'}`}>
                <div className="flex items-start gap-4">
                  <ProgressRing
                    value={s && s.levels > 0 ? (s.levelsPassed / s.levels) * 100 : 0}
                    size={64}
                    label={`${courseName(c)}: ${s ? `${s.levelsPassed} of ${s.levels}` : 'no'} levels passed`}
                  />
                  <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="text-lg font-extrabold">{courseName(c)}</h3>
                      {mine ? <Chip tone="primary">Current course</Chip> : null}
                    </div>
                    <p data-testid={`course-topics-${c.id}`} className="text-sm font-bold">
                      {s ? `${s.levelsPassed} of ${s.levels} levels passed · ${s.started} of ${s.topics} topics started` : '–'}
                    </p>
                    {s && s.started > 0 ? (
                      <p data-testid={`course-mastery-${c.id}`} className="text-sm">
                        {masteryNote(s.mastery)}
                      </p>
                    ) : null}
                    <p className="text-sm text-muted">
                      {waiting > 0 ? `${plural(waiting, 'mistake', 'mistakes')} waiting` : 'Nothing waiting'}
                      {exam ? ` · exam ${exam === today ? 'today' : `on ${exam.split('-').reverse().join('/')}`}` : ''}
                    </p>
                  </div>
                </div>
                <div className="mt-auto flex flex-wrap gap-2">
                  {mine ? (
                    <>
                      <Link href="/topics" data-testid={`course-topics-link-${c.id}`} className={buttonClasses('secondary', 'md')}>
                        All topics
                      </Link>
                      <Link href="/progress" data-testid={`course-progress-link-${c.id}`} className={buttonClasses('secondary', 'md')}>
                        Progress
                      </Link>
                    </>
                  ) : (
                    <button type="button" data-testid={`course-switch-${c.id}`} onClick={switchTo} className={buttonClasses('secondary', 'md')}>
                      Switch to {shortCourseName(c.title)}
                    </button>
                  )}
                </div>
              </article>
            </li>
          );
        })}
      </ul>
      {failed ? (
        <p role="alert" className="font-bold text-danger-ink">
          Couldn&apos;t change the course. Try again.
        </p>
      ) : null}
    </section>
  );
}

function RecentActivity({ levelResults, sessionResults, today }: { levelResults: Parameters<typeof recentActivity>[0]; sessionResults: Parameters<typeof recentActivity>[1]; today: string }) {
  const items = useMemo(() => recentActivity(levelResults, sessionResults), [levelResults, sessionResults]);
  return (
    <Card className="flex flex-col gap-3">
      <h2 className="text-lg font-extrabold">Recent activity</h2>
      {items.length === 0 ? (
        <p data-testid="activity-empty" className="text-sm font-bold text-muted">
          Nothing yet. What you play shows up here.
        </p>
      ) : (
        <ul data-testid="activity-list" className="flex flex-col divide-y divide-edge">
          {items.map((item) => (
            <li key={item.id} className="flex items-center gap-3 py-2">
              <span aria-hidden="true" className={`h-2.5 w-2.5 shrink-0 rounded-full ${item.good ? 'bg-primary' : 'bg-accent'}`} />
              <Link href={item.href} className="flex min-w-0 flex-1 flex-col hover:underline">
                <span className="truncate text-sm font-bold">{item.title}</span>
                <span className="truncate text-xs text-muted">{item.detail}</span>
              </Link>
              <span className="shrink-0 text-xs font-bold text-muted">{whenText(item.at, today)}</span>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

/** The big picture of the course: what it holds in all, and every topic by unit with the learner's progress. */
function WhatsInside({ course, choice, progress, units }: { course: Course; choice: CourseChoice; progress: Progress; units: ReturnType<typeof unitBars> }) {
  const counts = useMemo(() => courseCounts(course.id, choice), [course.id, choice]);
  const t = counts.total;
  // In words a learner knows: a question type makes a new question every time it is played.
  const totals: [string, number][] = [
    ['Topics', counts.topics.length],
    ['Levels', t.levels],
    ['Question types', t.patterns],
    ['Set questions', t.questions],
    ['Rule cards', t.cards],
    ['Case studies', t.cases],
  ];
  return (
    <section aria-labelledby="inside-heading" data-testid="home-inside" className="flex flex-col gap-3">
      <SectionHeader
        id="inside-heading"
        title={`What's inside ${courseName(course)}`}
        action={
          <Link href="/inside" data-testid="inside-link" className="inline-flex min-h-11 items-center text-sm font-bold text-primary-ink underline">
            See everything
          </Link>
        }
      />
      <Card className="flex flex-col gap-4">
        <dl className="grid grid-cols-2 gap-x-4 gap-y-2 sm:grid-cols-3 lg:grid-cols-6">
          {totals.map(([label, n]) => (
            <div key={label} className="flex flex-col">
              <dt className="text-xs font-bold uppercase tracking-wide text-muted">{label}</dt>
              <dd className="text-xl font-extrabold tabular-nums">{n}</dd>
            </div>
          ))}
        </dl>
        <p className="text-sm text-muted">
          A question type makes a new question, with new figures, every time you play it; set questions stay the same.
          {progress.answered === 0 ? ' Every bar below fills as you pass levels.' : ''}
        </p>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {units.map((u) => (
            <div key={u.unit} className="flex min-w-0 flex-col gap-2">
              <GroupLabel as="h3">{u.unit}</GroupLabel>
              <ul className="flex flex-col gap-1.5">
                {u.topics.map(({ topic, standing }) => {
                  const c = counts.topics.find((x) => x.topicId === topic.id)?.counts;
                  return (
                    <li key={topic.id}>
                      <Link href={`/topics/${topic.id}`} data-testid={`inside-topic-${topic.id}`} className="flex min-h-11 flex-col justify-center gap-1 rounded-control px-2 py-1 hover:bg-sunken">
                        <span className="flex items-baseline justify-between gap-2 text-sm">
                          <span className="min-w-0 truncate font-bold">{topic.title}</span>
                          <span className="shrink-0 text-xs font-bold tabular-nums text-muted">
                            {standing.passed}/{standing.total} levels{c ? ` · ${c.patterns} question types` : ''}
                          </span>
                        </span>
                        <ProgressBar thin value={standing.total ? standing.passed / standing.total : 0} label={`${topic.title}: ${standing.passed} of ${standing.total} levels passed`} />
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </div>
      </Card>
    </section>
  );
}
