'use client';

import { useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { useDeviceSettings } from '@/app-state/DeviceSettings';
import { useCourse } from '@/app-state/useCourse';
import { useProgress } from '@/app-state/useProgress';
import { Chip } from '@/components/ui/Chip';
import { HUE_ICON, type Hue } from '@/components/ui/hues';
import { CardsIcon, CaseIcon, ClockIcon, FlagIcon, ListIcon, LoopIcon, PlayIcon, QuestionIcon, RetryIcon, ScaleIcon, SparkIcon, TargetIcon, TrophyIcon } from '@/components/ui/icons';
import { ProgressGate } from '@/components/ui/ProgressGate';
import { Tile } from '@/components/ui/Tile';
import { describeMission, previewMission } from '@/components/home/mission';
import { findCourse, playableCourses } from '@/content/outline';
import { coursePatterns } from '@/learning/patterns';
import { practiceCounts } from '@/learning/practice';
import type { Progress } from '@/learning/progress';
import { activeTopicIds, mostRecentTopicId } from '@/learning/topics';
import { planPracticeSession } from '@/play/practiceSession';
import type { Profile } from '@/storage/types';

const NOTHING_TO_REVIEW = 'Nothing to review';
const NOTHING_TO_PRACTISE = 'Nothing to practise yet';
const MISSION_LOCKED = "Pass your first level to unlock today's mission";
const CHALLENGE_LOCKED = "Pass your first level to unlock today's challenge";

const questions = (n: number) => (n === 0 ? NOTHING_TO_PRACTISE : `${n} ${n === 1 ? 'question' : 'questions'}`);
const plural = (n: number, one: string, many: string) => `${n.toLocaleString('en-IN')} ${n === 1 ? one : many}`;

/** Practice: a tile for every way to practise, each with what is waiting. */
export function PracticeHub() {
  return (
    <ProgressGate id="hub" loading="Loading your practice…">
      {({ profile, progress, today }) => <Tiles profile={profile} progress={progress} today={today} />}
    </ProgressGate>
  );
}

interface TileSpec {
  id: string;
  href: string;
  title: string;
  description: string;
  count: string;
  icon: ReactNode;
  hue: Hue;
  /** Something is waiting that is worth starting with today. */
  highlight?: boolean;
}

function Tiles({ profile, progress, today }: { profile: Profile; progress: Progress; today: string }) {
  const { attempts, sessionResults, cardStates, activity } = useProgress();
  const { unlockAll } = useDeviceSettings();
  // The playable topics and the case stages of the learner's course.
  const { packs, stages } = useCourse();
  // Read once per visit: what is due is counted as of opening the screen.
  const [now] = useState(() => Date.now());
  const missionDone = progress.missionDoneDays.includes(today);
  const challengeDone = progress.challengeDoneDays.includes(today);

  // The sessions as they would be played right now. They are only counted here, never started.
  const sizes = useMemo(() => {
    const input = { packs, progress, attempts, sessionResults, cardStates, activity, now, unlockAll };
    return {
      smart: planPracticeSession('smart', input).length,
      fresh: planPracticeSession('fresh', input).length,
      daily: challengeDone ? 0 : planPracticeSession('daily', input).length,
      mission: missionDone ? null : previewMission(input),
    };
  }, [packs, progress, attempts, sessionResults, cardStates, activity, now, challengeDone, missionDone, unlockAll]);
  const { due, fresh, mistakes } = useMemo(
    () => practiceCounts(packs, progress, cardStates, now, activeTopicIds(packs, activity)),
    [packs, progress, cardStates, activity, now],
  );
  // Nothing to build a mission or challenge from until a level is passed: those tiles then point at the topic the
  // learner is on (the first topic for a new learner).
  const recentTopicId = mostRecentTopicId(packs, activity);
  const topicHref = recentTopicId ? `/topics/${recentTopicId}` : '/topics';
  const missionLocked = !missionDone && sizes.mission === null;
  const challengeLocked = !challengeDone && sizes.daily === 0;
  const caseCount = stages.reduce((n, s) => n + s.cases.length, 0);
  const mockCount = sessionResults.filter((r) => r.kind === 'mock').length;
  const longestRun = sessionResults.reduce((top, r) => (r.kind === 'marathon' ? Math.max(top, r.total) : top), 0);
  const patternCount = coursePatterns(profile.courseId).length;

  const tiles: TileSpec[] = [
    {
      id: 'playground',
      href: '/playground',
      title: 'Playground',
      description: 'Play any question type of the course at once, as often as you like.',
      count: patternCount === 0 ? NOTHING_TO_PRACTISE : `${plural(patternCount, 'pattern', 'patterns')} to play`,
      icon: <PlayIcon />,
      hue: 'green',
    },
    {
      id: 'simulator',
      href: '/simulator',
      title: 'Simulator',
      description: 'Watch the accounting equation move, predict each transaction, and find the mistake.',
      count: 'Watch, predict, free play',
      icon: <ScaleIcon />,
      hue: 'sky',
    },
    {
      id: 'marathon',
      href: '/practice/marathon',
      title: 'Marathon',
      description: 'Choose topics and kinds of question, and keep going until you stop.',
      count: longestRun === 0 ? 'No run yet' : `Longest run: ${longestRun} ${longestRun === 1 ? 'question' : 'questions'}`,
      icon: <LoopIcon />,
      hue: 'orange',
    },
    {
      id: 'topic',
      href: '/practice/topic',
      title: 'Topic practice',
      description: 'Choose any topic and get fresh questions from it alone.',
      count: plural(packs.length, 'topic', 'topics'),
      icon: <ListIcon />,
      hue: 'teal',
    },
    {
      id: 'smart',
      href: '/practice/smart',
      title: 'Smart practice',
      description: 'A mix of your weakest ideas, ones due for review and new ground.',
      count: questions(sizes.smart),
      icon: <SparkIcon />,
      hue: 'violet',
    },
    {
      id: 'fresh',
      href: '/practice/fresh',
      title: 'Fresh questions',
      description: 'Newly made questions, leaning towards what you know least.',
      count: questions(sizes.fresh),
      icon: <QuestionIcon />,
      hue: 'blue',
    },
    {
      id: 'mistakes',
      href: '/mistakes',
      title: 'Review mistakes',
      description: 'Answer again what you got wrong, until it sticks.',
      count: mistakes > 0 ? `${mistakes} waiting` : NOTHING_TO_REVIEW,
      icon: <RetryIcon />,
      hue: 'rose',
    },
    {
      id: 'cards',
      href: '/practice/cards',
      title: 'Revise cards',
      description: 'Flip through the rules and formats, due ones first.',
      count: due + fresh > 0 ? `${due} due · ${fresh} new` : NOTHING_TO_REVIEW,
      icon: <CardsIcon />,
      hue: 'amber',
    },
    {
      id: 'mission',
      href: missionLocked ? topicHref : '/practice/mission',
      title: "Today's mission",
      description: 'Cards and questions picked for today, with a bonus when you finish.',
      count: missionDone ? 'Mission complete' : sizes.mission ? describeMission(sizes.mission) : MISSION_LOCKED,
      icon: <FlagIcon />,
      hue: 'sky',
      highlight: !missionDone && sizes.mission !== null,
    },
    {
      id: 'daily',
      href: challengeLocked ? topicHref : '/practice/daily',
      title: "Today's challenge",
      description: 'Harder questions, the same for everyone today.',
      count: challengeDone ? 'Done for today' : challengeLocked ? CHALLENGE_LOCKED : questions(sizes.daily),
      icon: <TrophyIcon />,
      hue: 'amber',
    },
    {
      id: 'cases',
      href: '/cases',
      title: 'Case studies',
      description: 'One business, several linked questions, from entry to final figure.',
      count: caseCount === 0 ? NOTHING_TO_PRACTISE : `${caseCount} ${caseCount === 1 ? 'case study' : 'case studies'}`,
      icon: <CaseIcon />,
      hue: 'teal',
    },
    {
      id: 'mock',
      href: '/mock',
      title: 'Mock papers',
      description: 'Timed papers in the pattern of the examination, marked at the end.',
      count: mockCount === 0 ? 'Full, half-yearly and topic tests' : `${mockCount} ${mockCount === 1 ? 'paper' : 'papers'} submitted`,
      icon: <ClockIcon />,
      hue: 'violet',
    },
  ];

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div className="flex min-w-0 flex-col gap-1">
          <h1 className="text-3xl font-extrabold tracking-tight">Practice</h1>
          <p className="text-base text-muted">Pick a way to practise. What is waiting for you is shown on each tile.</p>
        </div>
        <FocusPill courseId={profile.courseId} />
      </header>
      <ul data-testid="hub-tiles" className="grid grid-cols-1 gap-4 min-[480px]:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
        {tiles.map((t) => (
          <li key={t.id} className="min-w-0">
            <HubTile tile={t} />
          </li>
        ))}
      </ul>
    </div>
  );
}

/** The course the hub is about. With more than one course to choose from, it leads to where the course is changed. */
function FocusPill({ courseId }: { courseId: string }) {
  const title = findCourse(courseId)?.title ?? courseId;
  const choice = playableCourses().length > 1;
  return (
    <Chip
      tone="outline"
      icon={<TargetIcon />}
      href={choice ? '/settings' : undefined}
      data-testid="hub-focus"
      title={choice ? 'Change the course in Settings' : undefined}
      className="max-w-full self-start sm:self-auto"
    >
      <span className="font-bold text-muted">Focus on</span>
      <span className="truncate">{title}</span>
    </Chip>
  );
}

function HubTile({ tile }: { tile: TileSpec }) {
  const empty = [NOTHING_TO_REVIEW, NOTHING_TO_PRACTISE, MISSION_LOCKED, CHALLENGE_LOCKED].includes(tile.count);
  return (
    <Tile
      hue={tile.hue}
      href={tile.href}
      data-testid={`hub-${tile.id}`}
      className={`flex h-full min-h-40 flex-col gap-2 ${tile.highlight ? 'bg-primary-soft!' : ''}`}
    >
      <span aria-hidden="true" className={`flex h-10 w-10 items-center justify-center rounded-control ${HUE_ICON[tile.hue]} [&_svg]:h-5 [&_svg]:w-5`}>
        {tile.icon}
      </span>
      <span className="text-lg font-extrabold leading-tight">{tile.title}</span>
      <span className="text-sm text-muted">{tile.description}</span>
      <span data-testid={`hub-${tile.id}-count`} className={`mt-auto pt-1 text-sm font-extrabold ${empty ? 'text-muted' : 'text-primary-ink'}`}>
        {tile.count}
      </span>
    </Tile>
  );
}
