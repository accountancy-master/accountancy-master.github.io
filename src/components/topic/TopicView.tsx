'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { useDeviceSettings } from '@/app-state/DeviceSettings';
import { useCourse } from '@/app-state/useCourse';
import { useProgress } from '@/app-state/useProgress';
import { MapPreview } from '@/components/maps/MapPreview';
import { playgroundHref } from '@/components/shell/navigation';
import { useShellTrail } from '@/components/shell/ShellContext';
import { BeyondSyllabus } from '@/components/ui/BeyondSyllabus';
import { Button, buttonClasses } from '@/components/ui/Button';
import { GroupLabel } from '@/components/ui/GroupLabel';
import { CaseIcon, LoopIcon, PenIcon, PlayIcon, ScaleIcon, SheetIcon, TargetIcon } from '@/components/ui/icons';
import { MasteryRing, masteryWord } from '@/components/ui/MasteryRing';
import { ProgressBar } from '@/components/ui/ProgressBar';
import { Shell } from '@/components/ui/Shell';
import { TopicsGate } from '@/components/ui/TopicsGate';
import { useWrittenBank } from '@/components/written/useWrittenBank';
import { OtherCourse } from './OtherCourse';
import { getTopicPack } from '@/content/loaded';
import { COURSES, findOutline } from '@/content/outline';
import type { Card, Concept, Level, LevelType, TopicMeta, TopicPack } from '@/content/types';
import { levelUnlocked, topicMastery, type Progress } from '@/learning/progress';
import { caseTopicIds } from '@/learning/caseTopics';
import { lookBackSize } from '@/learning/sessionBuilder';
import type { AttemptEvent } from '@/storage/types';
import { labHref, labsOfTopic } from '@/simulator/labs';

const LEVEL_TYPE_LABEL: Record<LevelType, string> = {
  concept: 'Concept',
  card_revision: 'Rules revision',
  rule_recognition: 'Recognition',
  method_recognition: 'Recognition',
  easy_practice: 'Easy practice',
  guided_practice: 'Guided practice',
  medium_practice: 'Medium practice',
  complex_practice: 'Complex practice',
  mixed_practice: 'Mixed practice',
  set_practice: 'Set of entries',
  format_practice: 'Format',
  challenge: 'Challenge',
  look_back: 'Look back',
  case_study: 'Case study',
  simulation: 'Simulation',
};

type LevelState = 'passed' | 'unlocked' | 'locked';

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

function levelSize(level: Level): string {
  if (level.cardIds) return plural(level.cardIds.length, 'card', 'cards');
  if (level.questionIds) return plural(level.questionIds.length, 'question', 'questions');
  if (level.generate) return plural(level.generate.count, 'question', 'questions');
  if (level.lookBack) {
    const { own, earlier } = lookBackSize(level.lookBack);
    return plural(own + earlier, 'question', 'questions');
  }
  // One whole case is played each time; how many questions it has depends on the case.
  if (level.cases) return level.cases.caseIds.length === 1 ? '1 case' : `${level.cases.caseIds.length} cases, one each time`;
  if (level.lesson) return plural(level.lesson.length, 'lesson step', 'lesson steps');
  if (level.simulation) {
    const { mode, count } = level.simulation;
    return mode === 'predict' ? plural(count, 'prediction', 'predictions') : plural(count, 'mistake to find', 'mistakes to find');
  }
  return '';
}

export function TopicView({ topicId }: { topicId: string }) {
  return (
    <Shell width="wide">
      <OwnTopic topicId={topicId} />
    </Shell>
  );
}

/** The topic, when it is one of the learner's course: a topic of another course is not theirs to open. */
function OwnTopic({ topicId }: { topicId: string }) {
  const course = useCourse();
  const topic = COURSES.flatMap((c) => c.topics).find((t) => t.id === topicId);
  useShellTrail([{ label: 'Topics', href: '/topics' }, { label: topic?.title ?? 'Topic' }]);
  if (!topic || !findOutline(topicId)) return null;
  if (!course.has(topicId)) return <OtherCourse topic={topic} />;
  return <TopicsGate topicIds={[topicId]}>{() => <TopicContent topic={topic} pack={getTopicPack(topicId)!} />}</TopicsGate>;
}

function TopicContent({ topic, pack }: { topic: TopicMeta; pack: TopicPack }) {
  const { progress, attempts, status, reload } = useProgress();
  const ready = status === 'ready' && progress !== null ? progress : null;
  const topicAttempts = attempts.filter((a) => a.topicId === topic.id);

  return (
    <div className="flex flex-col gap-6">
      <Header topic={topic} pack={pack} progress={ready} attempts={topicAttempts} />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_22rem] xl:grid-cols-[minmax(0,1fr)_24rem]">
        <section aria-labelledby="ladder-heading" className="flex min-w-0 flex-col gap-3">
          <h2 id="ladder-heading" className="text-lg font-extrabold text-primary-ink">
            Levels
          </h2>
          {ready ? (
            <Ladder pack={pack} progress={ready} />
          ) : status === 'error' ? (
            <div role="alert" className="flex flex-col items-start gap-3 rounded-card border-2 border-danger bg-danger-soft p-5">
              <p className="font-bold text-danger-deep">Your progress could not be loaded.</p>
              <Button variant="secondary" onClick={() => void reload()}>
                Try again
              </Button>
            </div>
          ) : (
            <p aria-busy="true" data-testid="ladder-loading" className="rounded-card border border-dashed border-edge-deep bg-sunken p-5 font-bold text-muted">
              Loading your levels…
            </p>
          )}
        </section>

        <aside aria-label="About this topic" className="flex min-w-0 flex-col gap-4 lg:sticky lg:top-20 lg:self-start">
          <PlayPanel topicId={topic.id} />
          <MapPreview title={topic.title} pack={pack} progress={ready} />
          <section aria-labelledby="map-heading" className="flex flex-col gap-3 rounded-card border border-edge bg-surface p-4 shadow-card">
            <h2 id="map-heading" className="text-base font-extrabold text-primary-ink">
              Mastery map
            </h2>
            <ul data-testid="mastery-map" className="flex flex-col gap-3">
              {pack.concepts.map((concept) => {
                const percent = Math.round(ready?.concepts[concept.id]?.mastery ?? 0);
                return (
                  <li key={concept.id} className="flex flex-col gap-1">
                    <div className="flex items-baseline justify-between gap-3">
                      <p className="min-w-0 text-sm font-bold">{concept.title}</p>
                      <p className="shrink-0 text-xs font-bold text-muted">{ready ? `${masteryWord(percent)} · ${percent}%` : '–'}</p>
                    </div>
                    <ProgressBar value={percent / 100} thin label={`${concept.title} mastery`} />
                  </li>
                );
              })}
            </ul>
          </section>
          <RulesAndFormats topicId={topic.id} cards={pack.cards} concepts={pack.concepts} />
        </aside>
      </div>
    </div>
  );
}

/** Ways to play this topic other than the ladder: the playground, a marathon, practice, and its quick sheet. */
function PlayPanel({ topicId }: { topicId: string }) {
  const row = 'flex min-h-11 items-center gap-3 rounded-control px-3 font-bold hover:bg-sunken [&_svg]:h-5 [&_svg]:w-5';
  // The case studies about this topic, wherever their stage is (learning/caseTopics.ts).
  const { stages } = useCourse();
  const cases = stages.reduce((n, s) => n + s.cases.filter((c) => caseTopicIds(c.id, s.topicId).includes(topicId)).length, 0);
  // The board-style written questions of this topic, fetched with the page (they are in no page's code).
  const written = useWrittenBank().questions?.filter((q) => q.topicId === topicId).length ?? 0;
  return (
    <nav aria-label="Play this topic" className="flex flex-col gap-1 rounded-card border border-edge bg-surface p-3 shadow-card">
      <GroupLabel className="px-3 pb-1 pt-1">Play this topic</GroupLabel>
      <Link href={playgroundHref(topicId)} prefetch={false} data-testid="topic-play" className={row}>
        <span className="text-hue-violet">
          <PlayIcon />
        </span>
        Playground: any question type, endlessly
      </Link>
      <Link href={`/practice/marathon/${topicId}`} data-testid="topic-marathon" className={row}>
        <span className="text-hue-orange">
          <LoopIcon />
        </span>
        Marathon on this topic
      </Link>
      <Link href={`/practice/topic/${topicId}`} data-testid="topic-practise" className={row}>
        <span className="text-hue-green">
          <TargetIcon />
        </span>
        Practise this topic
      </Link>
      {written > 0 ? (
        <Link href={`/written/${topicId}`} data-testid="topic-written" className={row}>
          <span className="text-hue-blue">
            <PenIcon />
          </span>
          Write it as the board asks ({written})
        </Link>
      ) : null}
      <Link href={`/sheet/${topicId}`} data-testid="topic-sheet" className={row}>
        <span className="text-hue-blue">
          <SheetIcon />
        </span>
        Quick sheet
      </Link>
      {cases > 0 ? (
        <Link href={`/cases?topic=${topicId}`} data-testid="topic-cases" className={row}>
          <span className="text-hue-amber">
            <CaseIcon />
          </span>
          Case studies about this topic ({cases})
        </Link>
      ) : null}
      <Link href={`/worksheets?topic=${topicId}`} data-testid="topic-worksheet" className={row}>
        <span className="text-hue-teal">
          <SheetIcon />
        </span>
        Print a worksheet of this topic
      </Link>
      {labsOfTopic(topicId).map((lab) => (
        <Link key={lab.id} href={labHref(lab.id)} data-testid={`topic-lab-${lab.id}`} className={row}>
          <span className="text-hue-amber">
            <ScaleIcon />
          </span>
          See it move: {lab.title}
        </Link>
      ))}
    </nav>
  );
}

function Header({
  topic,
  pack,
  progress,
  attempts,
}: {
  topic: TopicMeta;
  pack: TopicPack;
  progress: Progress | null;
  attempts: AttemptEvent[];
}) {
  const done = progress ? pack.levels.filter((l) => progress.passedLevelIds.includes(l.id)).length : null;
  const correct = attempts.filter((a) => a.correct).length;
  const accuracy = attempts.length === 0 ? '—' : `${Math.round((correct / attempts.length) * 100)}%`;

  return (
    <header className="flex flex-col gap-4 rounded-panel border border-edge bg-surface p-5 shadow-card lg:flex-row lg:items-center lg:gap-6 lg:p-6">
      <div className="flex min-w-0 flex-1 items-start gap-4">
        <div className="flex min-w-0 flex-1 flex-col gap-2">
          <GroupLabel>{topic.unit}</GroupLabel>
          <h1 className="text-3xl font-extrabold tracking-tight">{topic.title}</h1>
          <p className="text-base">{topic.description}</p>
          <p className="rounded-control bg-primary-soft p-3 text-sm text-primary-ink">
            <span className="font-extrabold">Why this matters: </span>
            {topic.whyItMatters}
          </p>
        </div>
        {progress ? (
          <MasteryRing value={topicMastery(pack, progress)} size={84} label={`${topic.title} mastery`} data-testid="topic-mastery" />
        ) : (
          <div aria-hidden="true" className="h-[84px] w-[84px] shrink-0 rounded-full border-[10px] border-edge" />
        )}
      </div>
      <dl className="grid grid-cols-3 gap-3 lg:w-[26rem] lg:shrink-0">
        <HeaderStat label="Levels passed" value={done === null ? '–' : `${done} of ${pack.levels.length}`} testId="stat-levels" />
        <HeaderStat label="Answered" value={progress ? String(attempts.length) : '–'} testId="stat-answered" />
        <HeaderStat label="Accuracy" value={progress ? accuracy : '–'} testId="stat-accuracy" />
      </dl>
    </header>
  );
}

function HeaderStat({ label, value, testId }: { label: string; value: string; testId: string }) {
  return (
    <div className="flex flex-col-reverse rounded-card border border-edge bg-sunken p-3 text-center">
      <dt className="text-xs font-bold uppercase tracking-wide text-muted">{label}</dt>
      <dd data-testid={testId} className="text-xl font-extrabold">
        {value}
      </dd>
    </div>
  );
}

function Ladder({ pack, progress }: { pack: TopicPack; progress: Progress }) {
  const { unlockAll } = useDeviceSettings();
  const levels = [...pack.levels].sort((a, b) => a.order - b.order);
  const stateOf = (level: Level): LevelState =>
    progress.passedLevelIds.includes(level.id)
      ? 'passed'
      : levelUnlocked(level, levels, progress.passedLevelIds, unlockAll)
        ? 'unlocked'
        : 'locked';
  const nextId = levels.find((l) => stateOf(l) === 'unlocked')?.id;

  return (
    <>
      {unlockAll && (
        <p
          data-testid="unlock-all-note"
          className="rounded-card bg-primary-soft p-4 text-base font-bold text-primary-ink"
        >
          All levels are unlocked. You can turn level locking back on in Settings.
        </p>
      )}
      <ol className="flex flex-col gap-3">
        {levels.map((level) => (
          <LevelRow key={level.id} level={level} state={stateOf(level)} isNext={level.id === nextId} />
        ))}
      </ol>
    </>
  );
}

function LevelRow({ level, state, isNext }: { level: Level; state: LevelState; isNext: boolean }) {
  const locked = state === 'locked';
  // The visible text is the same on every row, so the name says which level the link opens.
  const startLabel =
    state === 'passed'
      ? `Practise again: level ${level.order}, ${level.title}`
      : `Start: level ${level.order}, ${level.title}`;
  const box = locked
    ? 'border border-dashed border-edge-deep bg-sunken'
    : isNext
      ? 'border-2 border-primary bg-primary-soft shadow-card'
      : 'border border-edge bg-surface shadow-card';
  const badge = locked
    ? 'bg-edge text-muted'
    : state === 'passed' || isNext
      ? 'bg-primary text-white'
      : 'bg-primary-soft text-primary-ink';

  return (
    <li
      data-testid={`level-${level.order}`}
      data-state={state}
      data-next={isNext ? 'true' : undefined}
      aria-current={isNext ? 'step' : undefined}
      className={`flex flex-col gap-3 rounded-card p-4 sm:flex-row sm:items-center sm:gap-4 ${box}`}
    >
      <div className="flex min-w-0 flex-1 items-start gap-3">
        <span
          aria-hidden="true"
          className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-lg font-extrabold ${badge}`}
        >
          {locked ? <LockIcon /> : state === 'passed' ? <TickIcon /> : level.order}
        </span>
        <div className="flex min-w-0 flex-col gap-1">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <span className="text-sm font-bold text-muted">Level {level.order}</span>
            {isNext && (
              <span className="inline-flex min-h-6 items-center rounded-full bg-primary px-3 text-sm font-extrabold text-white">
                Next step
              </span>
            )}
            {state === 'passed' && (
              <span className="inline-flex min-h-6 items-center rounded-full bg-primary-soft px-3 text-sm font-extrabold text-primary-ink">
                Passed
              </span>
            )}
          </div>
          <h3 className={`text-lg font-extrabold ${locked ? 'text-muted' : ''}`}>{level.title}</h3>
          <p className={`text-base ${locked ? 'text-muted' : ''}`}>{level.description}</p>
          <p className="text-sm font-bold text-muted">
            {LEVEL_TYPE_LABEL[level.type]} · {levelSize(level)}
          </p>
        </div>
      </div>
      {locked ? (
        <p className="text-sm font-bold text-muted sm:max-w-40 sm:text-right">Finish the level above to unlock</p>
      ) : (
        <Link
          href={`/play/${level.id}`}
          data-testid={`level-start-${level.order}`}
          aria-label={startLabel}
          className={buttonClasses(state === 'passed' ? 'secondary' : 'primary', 'md', 'w-full sm:w-auto sm:shrink-0')}
        >
          {state === 'passed' ? 'Practise again' : 'Start'}
        </Link>
      )}
    </li>
  );
}

function RulesAndFormats({ topicId, cards, concepts }: { topicId: string; cards: Card[]; concepts: Concept[] }) {
  const details = useRef<HTMLDetailsElement>(null);
  // A card found by "Go to" is `/topics/<topic>#card-<id>`: the list opens and the card is shown, marked.
  const [target, setTarget] = useState<string | null>(null);
  useEffect(() => {
    const show = () => {
      const hash = decodeURIComponent(window.location.hash.slice(1));
      if (!hash.startsWith('card-')) return;
      const el = document.getElementById(hash);
      if (!el || !details.current) return;
      details.current.open = true;
      setTarget(hash);
      el.scrollIntoView({ block: 'center' });
      el.focus({ preventScroll: true });
    };
    show();
    window.addEventListener('hashchange', show);
    return () => window.removeEventListener('hashchange', show);
  }, []);

  return (
    <section aria-labelledby="rules-heading" className="flex flex-col gap-3">
      <h2 id="rules-heading" className="text-base font-extrabold text-primary-ink">
        Rules and formats
      </h2>
      <details ref={details} data-testid="rules-and-formats" className="group rounded-card border border-edge bg-surface shadow-card">
        <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 font-bold [&::-webkit-details-marker]:hidden">
          <span>Read all {cards.length} rules and formats</span>
          <span aria-hidden="true" className="text-primary-ink transition-transform group-open:rotate-180">
            ▾
          </span>
        </summary>
        <ul className="flex max-h-[70vh] flex-col gap-4 overflow-y-auto border-t border-edge p-4">
          {cards.map((card) => (
            <li
              key={card.id}
              id={`card-${card.id}`}
              tabIndex={-1}
              data-testid={`rule-card-${card.id}`}
              data-target={target === `card-${card.id}` ? 'true' : undefined}
              className={['flex scroll-mt-24 flex-col gap-1 rounded-control p-2 outline-none', target === `card-${card.id}` ? 'bg-accent-soft ring-2 ring-accent' : ''].join(' ')}
            >
              <p className="text-xs font-bold text-muted">{concepts.find((c) => c.id === card.conceptId)?.title ?? ''}</p>
              <h3 className="text-base font-extrabold">{card.prompt}</h3>
              {card.beyondSyllabus !== undefined ? <BeyondSyllabus reason={card.beyondSyllabus} testId={`rule-card-${card.id}-beyond`} /> : null}
              <p className="text-sm">{card.answer}</p>
              <Detail label="Example">{card.example}</Detail>
              <Detail label="Common mistake">{card.commonMistake}</Detail>
            </li>
          ))}
        </ul>
      </details>
      <p className="text-sm text-muted">
        All of them on one printable page:{' '}
        <Link href={`/sheet/${topicId}`} className="font-bold text-primary-ink underline">
          the quick sheet
        </Link>
        .
      </p>
    </section>
  );
}

function Detail({ label, children }: { label: string; children: ReactNode }) {
  return (
    <p className="text-sm">
      <span className="font-extrabold text-primary-ink">{label}: </span>
      {children}
    </p>
  );
}

function LockIcon() {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.4"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <rect x="5" y="11" width="14" height="10" rx="2" />
      <path d="M8 11V8a4 4 0 0 1 8 0v3" />
    </svg>
  );
}

function TickIcon() {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="3"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="m5 12 5 5 9-10" />
    </svg>
  );
}

/** Kept for the pages that import it from here (the map and the quick sheet of a topic). */
export { OtherCourse };
