'use client';

import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { buttonClasses } from '@/components/ui/Button';
import { ProgressGate } from '@/components/ui/ProgressGate';
import { useCourse } from '@/app-state/useCourse';
import { EQUATION_LAB, findLab, shelfGroups, type LabInfo, type ShelfGroup } from '@/simulator/labs';
import { findScene } from '@/simulator/scenes';
import { FreePlayMode } from './FreePlayMode';
import { LAB_SCREENS } from './labs';
import { MistakeMode } from './MistakeMode';
import { PredictMode } from './PredictMode';
import type { Speed } from './SimStage';
import { useRecorder } from './useRecorder';
import { WatchMode } from './WatchMode';

export const MODES = [
  { id: 'watch', label: 'Watch', detail: 'See a transaction move through the books, step by step, and why.' },
  { id: 'predict', label: 'Predict', detail: 'Say which way each side will move, then watch the truth. Earns XP.' },
  { id: 'free', label: 'Free play', detail: 'Make your own transactions, start a business, or play a story.' },
  { id: 'mistakes', label: 'Find the mistake', detail: 'A transaction recorded wrongly: name the error and put it right. Earns XP.' },
] as const;
export type ModeId = (typeof MODES)[number]['id'];

const isMode = (v: string | null): v is ModeId => MODES.some((m) => m.id === v);

/**
 * The simulator: a shelf of labs (`?lab=depreciation`), each a picture of one part of the course. The first, the
 * accounting equation, has four modes; which one is in the address (`?mode=predict`).
 */
export function Simulator() {
  return (
    <ProgressGate id="simulator" loading="Getting the simulator ready…">
      {() => <Body />}
    </ProgressGate>
  );
}

function Body() {
  const params = useSearchParams();
  // `?seed=` starts a run where it says, so that a class can play the same transactions (and the tests know them).
  const seedText = params.get('seed');
  const seed = seedText && /^\d{1,9}$/.test(seedText) && Number(seedText) > 0 ? Number(seedText) : undefined;
  const lab = findLab(params.get('lab')) ?? findLab(EQUATION_LAB)!;
  const course = useCourse();
  const shelf = shelfGroups(course.has);
  const Screen = lab.id === EQUATION_LAB ? null : LAB_SCREENS[lab.id];

  return (
    <div className="flex flex-col gap-5">
      <header className="flex flex-col gap-1">
        <h1 className="text-3xl font-extrabold tracking-tight">Simulator</h1>
        <p className="text-base text-muted">See the books move. Pick a lab: each one is a picture of one part of the course that you can play with.</p>
      </header>
      {shelf.reduce((n, g) => n + g.labs.length, 0) > 1 ? <LabShelf groups={shelf} current={lab.id} /> : null}
      {Screen ? (
        <section aria-label={lab.title} data-testid={`lab-${lab.id}`} className="flex flex-col gap-4">
          <LabHeading lab={lab} />
          <Screen seed={seed} />
        </section>
      ) : (
        <EquationLab lab={lab} seed={seed} />
      )}
    </div>
  );
}

/**
 * The labs, in a row for each class (the learner's own course first, then the other choice of Part B of that class,
 * then the other class), each a row of buttons that scrolls sideways on a phone; the open one is pressed and brought
 * into view.
 */
function LabShelf({ groups, current }: { groups: ShelfGroup[]; current: string }) {
  const pathname = usePathname();
  const open = useRef<HTMLAnchorElement>(null);
  useEffect(() => {
    // Only the row scrolls: `nearest` leaves the page where it is.
    open.current?.scrollIntoView({ block: 'nearest', inline: 'center' });
  }, [current]);
  return (
    <nav aria-label="Labs" className="flex flex-col gap-2">
      {groups.map((g) => (
        <div key={`${g.classLevel}-${g.mine}-${g.option ?? ''}`} data-testid={`lab-shelf-${g.classLevel}${g.mine ? '-mine' : g.option ? '-option' : ''}`} className="flex flex-col gap-1">
          <p className="text-xs font-extrabold uppercase tracking-wide text-muted">
            Class {g.classLevel}
            {g.mine ? ' · your course' : g.option ? ` · ${g.option} option` : ''}
          </p>
          <ul className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 sm:mx-0 sm:flex-wrap sm:px-0">
            {g.labs.map((l) => (
              <li key={l.id} className="shrink-0">
                <Link
                  ref={l.id === current ? open : undefined}
                  href={l.id === EQUATION_LAB ? pathname : `${pathname}?lab=${l.id}`}
                  scroll={false}
                  aria-current={l.id === current ? 'page' : undefined}
                  data-testid={`lab-pick-${l.id}`}
                  className={`flex min-h-11 items-center rounded-full border px-4 text-base font-extrabold transition-colors ${l.id === current ? 'border-primary bg-primary text-white' : 'border-edge-deep bg-surface text-ink hover:bg-sunken'}`}
                >
                  {l.title}
                </Link>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </nav>
  );
}

function LabHeading({ lab }: { lab: LabInfo }) {
  return (
    <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
      <div className="flex min-w-0 flex-col gap-1">
        <h2 className="text-2xl font-extrabold tracking-tight">{lab.title}</h2>
        <p className="text-base text-muted">{lab.blurb}</p>
      </div>
      <Link href={`/topics/${lab.topicIds[0]}`} className={buttonClasses('ghost', 'md', 'shrink-0 self-start whitespace-nowrap lg:self-auto')}>
        The topic
      </Link>
    </div>
  );
}

/** The accounting equation as tanks, in four modes. */
function EquationLab({ lab, seed }: { lab: LabInfo; seed: number | undefined }) {
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const asked = params.get('mode');
  const mode: ModeId = isMode(asked) ? asked : 'watch';
  const [speed, setSpeed] = useState<Speed>(1);
  const scene = findScene('ae')!;
  const recorder = useRecorder('fresh');
  const current = MODES.find((m) => m.id === mode)!;

  return (
    <div className="flex flex-col gap-5">
      <header className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div className="flex min-w-0 flex-col gap-1">
          <h2 className="text-2xl font-extrabold tracking-tight">{lab.title}</h2>
          <p className="text-base text-muted">
            Every transaction moves value between what the business owns, what it owes and what the proprietor has in it, and the two sides always stay equal.
          </p>
        </div>
        <Link href={`/topics/${scene.topicId}`} className={buttonClasses('ghost', 'md', 'self-start lg:self-auto')}>
          The topic: Accounting Equation
        </Link>
      </header>

      <nav aria-label="Simulator modes" className="flex flex-col gap-2">
        <div role="group" aria-label="Mode" className="flex flex-wrap gap-2">
          {MODES.map((m) => (
            <button
              key={m.id}
              type="button"
              aria-pressed={m.id === mode}
              data-testid={`sim-mode-${m.id}`}
              onClick={() => router.replace(`${pathname}?mode=${m.id}${seed ? `&seed=${seed}` : ''}`, { scroll: false })}
              className={`min-h-11 rounded-full border px-4 text-base font-extrabold transition-colors ${m.id === mode ? 'border-primary bg-primary text-white' : 'border-edge-deep bg-surface text-ink hover:bg-sunken'}`}
            >
              {m.label}
            </button>
          ))}
        </div>
        <p data-testid="sim-mode-detail" className="text-sm text-muted">
          {current.detail}
        </p>
      </nav>

      {recorder.failed ? (
        <p role="status" className="rounded-card bg-accent-soft px-4 py-3 text-base font-semibold text-accent-ink">
          Some of your answers could not be saved.
        </p>
      ) : null}

      <section aria-label={current.label} data-testid={`sim-panel-${mode}`}>
        {mode === 'watch' ? <WatchMode scene={scene} speed={speed} onSpeed={setSpeed} seed={seed} /> : null}
        {mode === 'predict' ? <PredictMode scene={scene} speed={speed} onSpeed={setSpeed} record={recorder.record} seed={seed} /> : null}
        {mode === 'free' ? <FreePlayMode scene={scene} speed={speed} onSpeed={setSpeed} /> : null}
        {mode === 'mistakes' ? <MistakeMode scene={scene} speed={speed} onSpeed={setSpeed} record={recorder.record} seed={seed} /> : null}
      </section>
    </div>
  );
}
