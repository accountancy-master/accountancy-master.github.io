'use client';

import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { useStore } from '@/app-state/StoreProvider';
import { useCourse } from '@/app-state/useCourse';
import { useProgress } from '@/app-state/useProgress';
import { BackToPractice, groupTopicsByUnit, usePickableTopics, type PickableTopic } from '@/components/practice/TopicPicker';
import { Button, buttonClasses } from '@/components/ui/Button';
import { GROUP_LABEL } from '@/components/ui/GroupLabel';
import { MasteryRing, masteryWord } from '@/components/ui/MasteryRing';
import { ProgressGate } from '@/components/ui/ProgressGate';
import { MARATHON_ALL, MARATHON_DIFFICULTIES, marathonPool, type MarathonDifficulty } from '@/learning/marathon';
import { BEYOND_PARAM, MIX_KINDS, MIX_KIND_LABEL, casesOfTopics, mixHref, mixSummaryLine, narrowByTopic, setupFromQuery, setupToQuery, withKinds, type MixKind } from '@/learning/marathonMix';
import { SUBTOPICS_PARAM, marathonSubtopics, subtopicsOff, subtopicsToQuery, tickedSubtopics, type MarathonSubtopic } from '@/learning/marathonSubtopics';
import { everythingIn } from '@/learning/practice';
import type { Progress } from '@/learning/progress';
import { activeTopicIds } from '@/learning/topics';
import { personalBests, unrecordedMarathons, type MarathonBest } from '@/play/marathonRun';
import type { Profile } from '@/storage/types';
import { SubtopicChooser } from './SubtopicChooser';
import { useSubtopicChoices } from './useSubtopicChoices';

const DIFFICULTY_NAME: Record<MarathonDifficulty, string> = { mixed: 'Mixed', easy: 'Easy', medium: 'Medium', complex: 'Complex' };

const KIND_DETAIL: Record<MixKind, string> = {
  quick: 'Choices, figures and single journal entries.',
  long: 'Sets of entries, accounts and statements to prepare.',
  cases: 'One business and several linked questions, a new case every time.',
};

const PICKER = '/practice/marathon';

/**
 * The address of a run of one topic (or all the topics played), as the Marathon has always had them; `beyond` adds
 * the practice beyond the syllabus.
 */
const hrefFor = (scope: string, difficulty: MarathonDifficulty, subtopics: string | null = null, beyond = false) => {
  const query = [difficulty === 'mixed' ? '' : `level=${difficulty}`, subtopics === null ? '' : `${SUBTOPICS_PARAM}=${subtopics}`, beyond ? `${BEYOND_PARAM}=1` : ''].filter(Boolean);
  return `/practice/marathon/${scope}${query.length > 0 ? `?${query.join('&')}` : ''}`;
};

/**
 * Marathon: choose topics across the course (whole units, all or none, and the subtopics of a topic), the kinds of
 * question to mix and a difficulty, and start a run that mixes them. Each topic can still be run alone, and the
 * personal bests are shown. The choice is in the address, so a setup can be bookmarked.
 */
export function MarathonPicker() {
  return (
    <ProgressGate id="marathon" loading="Loading your topics…">
      {({ profile, progress }) => <Picker profile={profile} progress={progress} />}
    </ProgressGate>
  );
}

function BestLine({ best, testId }: { best: MarathonBest | undefined; testId: string }) {
  return (
    <span data-testid={testId} className={`text-sm font-bold ${best ? 'text-primary-ink' : 'text-muted'}`}>
      {best ? `Best: ${best.answered} answered · streak ${best.streak}` : 'No run yet'}
    </span>
  );
}

function Picker({ profile, progress }: { profile: Profile; progress: Progress }) {
  const { store } = useStore();
  const { attempts, sessionResults, activity, reload } = useProgress();
  const { packs, stages } = useCourse();
  const topics = usePickableTopics(profile, progress);
  const query = useSearchParams();
  const { choices, setOff } = useSubtopicChoices();
  /** The topic whose list of subtopics is open; one at a time. */
  const [openTopic, setOpenTopic] = useState<string | null>(null);

  // The setup as the address gives it, else the topics the learner has played and quick questions; a learner who has
  // played nothing yet starts with the first topic of the course ticked (`activeTopicIds`), and can tick any others.
  const [setup, setSetup] = useState(() => {
    const read = setupFromQuery(query);
    const known = new Set(topics.map((t) => t.topic.id));
    const chosen =
      read.topics === null
        ? activeTopicIds(packs, activity).filter((id) => known.has(id))
        : read.topics.includes('all')
          ? topics.map((t) => t.topic.id)
          : read.topics.filter((id) => known.has(id));
    return { topics: chosen, kinds: read.kinds, difficulty: read.difficulty, beyond: read.beyond === true };
  });
  // A change of the setup is written into the address (not on arrival: the address is then the one the learner came by).
  const changed = useRef(false);
  const update = (next: Partial<typeof setup>) => {
    changed.current = true;
    setSetup((now) => ({ ...now, ...next }));
  };
  useEffect(() => {
    if (!changed.current) return;
    const q = setupToQuery({ topics: setup.topics, kinds: setup.kinds, difficulty: setup.difficulty, subtopics: null, beyond: setup.beyond });
    window.history.replaceState(null, '', q ? `${PICKER}?${q}` : PICKER);
  }, [setup]);

  // A marathon unlocks nothing and needs nothing unlocked: every pattern of the chosen topics is in it, as in the
  // Playground. The difficulty and the adaptive mix do the pacing.
  const available = useMemo(() => everythingIn(packs), [packs]);
  const subtopics = useMemo(() => new Map(topics.map((t) => [t.topic.id, marathonSubtopics(t.pack, available)])), [topics, available]);
  const bests = useMemo(() => personalBests(sessionResults), [sessionResults]);

  // The subtopics a run over the chosen topics keeps to: those ticked of each topic where not all of them are; a
  // topic with every subtopic unticked is left out of the run.
  const run = useMemo(() => {
    const kept: string[] = [];
    const named: string[] = [];
    for (const id of setup.topics) {
      const list = subtopics.get(id) ?? [];
      const ticked = tickedSubtopics(list, subtopicsOff(choices, id));
      const ready = list.filter((s) => s.ready);
      if (ready.length > 0 && ticked.length === 0) continue;
      kept.push(id);
      if (subtopicsToQuery(list, ticked) !== null) named.push(...ticked);
    }
    const chosenPacks = packs.filter((p) => kept.includes(p.topicId));
    const pool = narrowByTopic(withKinds(marathonPool(chosenPacks, available, setup.beyond), setup.kinds), named.length > 0 ? named : null, chosenPacks);
    const cases = setup.kinds.includes('cases') ? casesOfTopics(stages, kept) : [];
    const patterns = setup.kinds.some((k) => k !== 'cases') ? pool.templates.length : 0;
    const playable = patterns + pool.questions.length + cases.length > 0;
    return {
      topics: kept,
      patterns,
      cases: cases.length,
      playable,
      href: mixHref({ topics: kept, kinds: setup.kinds, difficulty: setup.difficulty, subtopics: named.length > 0 ? named : null, beyond: setup.beyond }),
    };
  }, [setup, subtopics, choices, packs, available, stages]);

  // A run the app was closed on was never stopped: its answers are stored, and its record is written here from them.
  const tried = useRef(new Set<string>());
  useEffect(() => {
    // Each record is tried once per visit, so a device that refuses to store it is not asked again and again.
    const lost = unrecordedMarathons(attempts, sessionResults).filter((r) => !tried.current.has(r.id));
    if (lost.length === 0) return;
    for (const record of lost) tried.current.add(record.id);
    void (async () => {
      try {
        for (const record of lost) await store.appendSessionResult(record);
      } finally {
        await reload();
      }
    })().catch(() => undefined);
  }, [attempts, sessionResults, store, reload]);

  const chosen = new Set(setup.topics);
  const setTopics = (ids: Iterable<string>) => {
    const keep = new Set(ids);
    update({ topics: topics.map((t) => t.topic.id).filter((id) => keep.has(id)) });
  };
  const toggleTopic = (id: string, on: boolean) => setTopics(on ? [...setup.topics, id] : setup.topics.filter((x) => x !== id));
  const toggleKind = (kind: MixKind) => update({ kinds: setup.kinds.includes(kind) ? setup.kinds.filter((k) => k !== kind) : MIX_KINDS.filter((k) => k === kind || setup.kinds.includes(k)) });
  const summary = mixSummaryLine({ topics: run.topics.length, patterns: run.patterns, cases: run.cases });
  const canStart = run.topics.length > 0 && setup.kinds.length > 0 && run.playable;

  const settings = (
    <div className="flex flex-col gap-5 rounded-card border border-edge bg-surface p-4 shadow-card">
      <div role="group" aria-labelledby="marathon-kinds-label" className="flex flex-col gap-2">
        <p id="marathon-kinds-label" className={GROUP_LABEL}>
          What to mix
        </p>
        {MIX_KINDS.map((k) => {
          const on = setup.kinds.includes(k);
          return (
            <button
              key={k}
              type="button"
              data-testid={`marathon-kind-${k}`}
              aria-pressed={on}
              onClick={() => toggleKind(k)}
              className={`flex min-h-12 items-center gap-3 rounded-control border px-3 py-2 text-left ${on ? 'border-primary bg-primary-soft' : 'border-edge-deep bg-surface hover:bg-sunken'}`}
            >
              <span aria-hidden="true" className={`relative inline-flex h-6 w-10 shrink-0 rounded-full transition-colors ${on ? 'bg-primary' : 'bg-edge-deep'}`}>
                <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-surface shadow transition-[left] ${on ? 'left-[1.125rem]' : 'left-0.5'}`} />
              </span>
              <span className="flex min-w-0 flex-col">
                <span className="text-base font-extrabold leading-tight">{MIX_KIND_LABEL[k]}</span>
                <span className="text-sm text-muted">{KIND_DETAIL[k]}</span>
              </span>
            </button>
          );
        })}
      </div>

      <div role="group" aria-labelledby="marathon-difficulty-label" className="flex flex-col gap-2">
        <p id="marathon-difficulty-label" className={GROUP_LABEL}>
          Difficulty
        </p>
        <div className="grid grid-cols-4 gap-2">
          {MARATHON_DIFFICULTIES.map((d) => {
            const on = setup.difficulty === d;
            return (
              <button
                key={d}
                type="button"
                data-testid={`marathon-level-${d}`}
                aria-pressed={on}
                onClick={() => update({ difficulty: d })}
                className={`min-h-11 rounded-control border px-1 text-sm font-extrabold ${on ? 'border-primary-deep bg-primary text-white' : 'border-edge-deep bg-surface hover:bg-sunken'}`}
              >
                {DIFFICULTY_NAME[d]}
              </button>
            );
          })}
        </div>
        <p className="text-sm font-semibold text-muted">
          {setup.difficulty === 'mixed' ? 'Starts easy, gets harder as you get answers right and eases off after a miss.' : 'Every question is of this difficulty.'}
        </p>
      </div>

      <div role="group" aria-labelledby="marathon-beyond-label" className="flex flex-col gap-2">
        <p id="marathon-beyond-label" className={GROUP_LABEL}>
          Beyond the syllabus
        </p>
        <button
          type="button"
          data-testid="marathon-beyond"
          aria-pressed={setup.beyond}
          onClick={() => update({ beyond: !setup.beyond })}
          className={`flex min-h-12 items-center gap-3 rounded-control border px-3 py-2 text-left ${setup.beyond ? 'border-primary bg-primary-soft' : 'border-edge-deep bg-surface hover:bg-sunken'}`}
        >
          <span aria-hidden="true" className={`relative inline-flex h-6 w-10 shrink-0 rounded-full transition-colors ${setup.beyond ? 'bg-primary' : 'bg-edge-deep'}`}>
            <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-surface shadow transition-[left] ${setup.beyond ? 'left-[1.125rem]' : 'left-0.5'}`} />
          </span>
          <span className="flex min-w-0 flex-col">
            <span className="text-base font-extrabold leading-tight">Include beyond-syllabus practice</span>
            <span className="text-sm text-muted">A few question types go further than this year&apos;s syllabus asks. They are on no level and in no mock paper.</span>
          </span>
        </button>
      </div>

      <div className="flex flex-col gap-3 border-t border-edge pt-4">
        <p data-testid="marathon-summary-line" aria-live="polite" className="text-base font-extrabold">
          {summary}
        </p>
        <p className="text-sm text-muted">Questions keep coming until you press Stop, mixed across the topics and leaning towards your weaker ideas. Every answer counts as usual.</p>
        {canStart ? (
          <Link href={run.href} data-testid="marathon-start" className={buttonClasses('primary', 'lg', 'w-full')}>
            Start the marathon
          </Link>
        ) : (
          <>
            <Button size="lg" disabled data-testid="marathon-start" className="w-full">
              Start the marathon
            </Button>
            <p role="status" data-testid="marathon-start-why" className="text-sm font-bold text-accent-ink">
              {run.topics.length === 0
                ? 'Tick at least one topic.'
                : setup.kinds.length === 0
                  ? 'Turn on at least one kind of question.'
                  : 'These topics have no questions of that kind. Turn on another kind, or tick more topics.'}
            </p>
          </>
        )}
      </div>
    </div>
  );

  return (
    <div className="flex flex-col gap-5">
      <header className="flex flex-col gap-1">
        <BackToPractice />
        <h1 className="text-3xl font-extrabold tracking-tight">Marathon</h1>
        <p className="text-base text-muted">Tick the topics to mix and what kind of questions, then keep going for as long as you like.</p>
      </header>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="min-w-0 lg:order-2">
          <div className="lg:sticky lg:top-20">{settings}</div>
        </div>

        <div className="flex min-w-0 flex-col gap-5 lg:order-1">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className={GROUP_LABEL}>Topics · {setup.topics.length} of {topics.length} chosen</p>
            <div className="flex gap-2">
              <Button variant="secondary" data-testid="marathon-topics-all" onClick={() => setTopics(topics.map((t) => t.topic.id))}>
                All
              </Button>
              <Button variant="secondary" data-testid="marathon-topics-none" onClick={() => setTopics([])}>
                None
              </Button>
            </div>
          </div>

          {groupTopicsByUnit(topics).map((group, i) => {
            const ids = group.topics.map((t) => t.topic.id);
            const on = ids.filter((id) => chosen.has(id)).length;
            const openAt = group.topics.findIndex((t) => t.topic.id === openTopic);
            return (
              <section key={group.unit} aria-labelledby={`marathon-unit-${i}`} className="flex flex-col gap-3">
                <div className="flex min-h-10 items-center gap-3">
                  <UnitBox
                    testId={`marathon-unit-${i}-box`}
                    labelledBy={`marathon-unit-${i}`}
                    checked={on === ids.length}
                    mixed={on > 0 && on < ids.length}
                    onChange={(checked) => setTopics(checked ? [...setup.topics, ...ids] : setup.topics.filter((id) => !ids.includes(id)))}
                  />
                  <h2 id={`marathon-unit-${i}`} className="text-lg font-extrabold text-primary-ink">
                    {group.unit}
                  </h2>
                </div>
                <ul className="grid gap-3 md:grid-cols-2">
                  {group.topics.map((t, at) => (
                    // Two to a row from the `md` width up: the topic beside an open list keeps its own height.
                    <li key={t.topic.id} className={`flex min-w-0 flex-col gap-2 ${openAt !== -1 && (at ^ 1) === openAt ? 'md:self-start' : ''}`}>
                      <TopicRow
                        topic={t}
                        chosen={chosen.has(t.topic.id)}
                        onChoose={(on) => toggleTopic(t.topic.id, on)}
                        subtopics={subtopics.get(t.topic.id) ?? []}
                        off={subtopicsOff(choices, t.topic.id)}
                        difficulty={setup.difficulty}
                        beyond={setup.beyond}
                        best={bests[t.topic.id]}
                        open={openTopic === t.topic.id}
                        onToggle={() => setOpenTopic((now) => (now === t.topic.id ? null : t.topic.id))}
                        onOff={(off) => setOff(t.topic.id, off)}
                      />
                    </li>
                  ))}
                </ul>
              </section>
            );
          })}

          <section aria-labelledby="marathon-quick" className="flex flex-col gap-3 border-t border-edge pt-4">
            <h2 id="marathon-quick" className={GROUP_LABEL}>
              Quick start
            </h2>
            <Link
              href={hrefFor(MARATHON_ALL, setup.difficulty, null, setup.beyond)}
              data-testid={`marathon-${MARATHON_ALL}`}
              className="flex flex-col gap-0.5 rounded-card border border-edge bg-surface p-4 shadow-card hover:shadow-card-hover"
            >
              <span className="text-base font-extrabold leading-snug">All topics I have played</span>
              <span className="text-sm font-bold text-muted">Every kind of question from every topic you have started.</span>
              <BestLine best={bests[MARATHON_ALL]} testId={`marathon-${MARATHON_ALL}-best`} />
            </Link>
          </section>
        </div>
      </div>
    </div>
  );
}

/** A tick box that can also show "some of them". */
function UnitBox({ checked, mixed, onChange, testId, labelledBy }: { checked: boolean; mixed: boolean; onChange(on: boolean): void; testId: string; labelledBy: string }) {
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (ref.current) ref.current.indeterminate = mixed;
  }, [mixed]);
  return (
    <span className="-m-2.5 flex h-11 w-11 shrink-0 items-center justify-center">
      <input
        ref={ref}
        type="checkbox"
        data-testid={testId}
        aria-labelledby={labelledBy}
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="h-6 w-6 accent-primary"
      />
    </span>
  );
}

/**
 * One topic: a box that adds it to the run, its mastery and best, a link that runs it alone, and under it the
 * subtopics it keeps to.
 */
function TopicRow({
  topic: t,
  chosen,
  onChoose,
  subtopics,
  off,
  difficulty,
  beyond,
  best,
  open,
  onToggle,
  onOff,
}: {
  topic: PickableTopic;
  chosen: boolean;
  onChoose(on: boolean): void;
  subtopics: readonly MarathonSubtopic[];
  /** The subtopics the learner has left out (see `SubtopicChoices`). */
  off: readonly string[];
  difficulty: MarathonDifficulty;
  /** Whether a run includes practice beyond the syllabus. */
  beyond: boolean;
  best: MarathonBest | undefined;
  open: boolean;
  onToggle(): void;
  onOff(off: string[]): void;
}) {
  const id = t.topic.id;
  const ticked = tickedSubtopics(subtopics, off);
  const ready = subtopics.filter((s) => s.ready);
  // With every subtopic ticked the address is the one a marathon has always had. With none ticked there is no run to
  // start; a topic with nothing open at all keeps its link, and the run's own screen says what to do.
  const startHref = ticked.length > 0 ? hrefFor(id, difficulty, subtopicsToQuery(subtopics, ticked), beyond) : undefined;
  const aloneHref = ready.length === 0 ? hrefFor(id, difficulty, null, beyond) : startHref;
  const hint = aloneHref === undefined ? 'Tick a subtopic to start' : t.ready ? masteryWord(t.mastery) : 'No questions yet';

  let alone: ReactNode;
  if (aloneHref !== undefined) {
    alone = (
      <Link href={aloneHref} data-testid={`marathon-${id}`} className="inline-flex min-h-11 shrink-0 items-center rounded-control px-2 py-1 text-sm font-extrabold text-primary-ink underline-offset-4 hover:bg-sunken hover:underline">
        Run alone<span className="sr-only">: {t.topic.title}</span>
      </Link>
    );
  } else {
    alone = (
      <span data-testid={`marathon-${id}`} aria-disabled="true" className="shrink-0 px-2 py-1 text-sm font-bold text-muted">
        Run alone
      </span>
    );
  }

  return (
    <>
      <div className={`flex items-center gap-3 rounded-card border bg-surface p-3 shadow-card ${chosen ? 'border-primary' : 'border-edge'}`}>
        {/* The box in a 44 px target. */}
        <label className="-m-2.5 flex h-11 w-11 shrink-0 cursor-pointer items-center justify-center rounded-control hover:bg-sunken">
          <input
            type="checkbox"
            data-testid={`marathon-pick-${id}`}
            checked={chosen}
            onChange={(e) => onChoose(e.target.checked)}
            aria-label={`Mix in ${t.topic.title}`}
            className="h-5 w-5 accent-primary"
          />
        </label>
        <MasteryRing value={t.mastery} size={44} label={`${t.topic.title} mastery`} />
        <span className="flex min-w-0 flex-1 flex-col gap-0.5">
          <span className="text-base font-extrabold leading-snug [overflow-wrap:anywhere]">{t.topic.title}</span>
          <span data-testid={`marathon-${id}-hint`} className="text-sm font-bold text-muted">
            {hint}
          </span>
          <BestLine best={best} testId={`marathon-${id}-best`} />
        </span>
        {alone}
      </div>
      {subtopics.length > 0 ? (
        <SubtopicChooser
          topicId={id}
          topicTitle={t.topic.title}
          subtopics={subtopics}
          ticked={ticked}
          open={open}
          startHref={startHref}
          onToggle={onToggle}
          // What is kept is what was left out: the subtopics that can be ticked and are not, and whatever was left
          // out before and cannot be ticked now. With everything ticked that can be, nothing is left out.
          onChange={(now) => {
            const unticked = ready.filter((s) => !now.includes(s.id)).map((s) => s.id);
            onOff(unticked.length === 0 ? [] : [...unticked, ...off.filter((x) => !ready.some((s) => s.id === x))]);
          }}
        />
      ) : null}
    </>
  );
}
