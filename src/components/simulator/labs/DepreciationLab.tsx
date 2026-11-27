'use client';

import { useMemo, useState } from 'react';
import { Button } from '@/components/ui/Button';
import { createRng } from '@/engine/rng';
import { EXAMPLES, randomInputs, randomSale, WATCH_EXAMPLES } from '@/simulator/depreciation/examples';
import { problemOf, schedule, type DepInputs, type Schedule } from '@/simulator/depreciation/schedule';
import { describe, eventsOf } from '@/simulator/depreciation/story';
import { askRng, DEP_ASK_KINDS, DEP_ASK_LABEL, depAsk, type DepAskKind } from '@/simulator/depreciation/tryit';
import { useReducedMotion } from '../useReducedMotion';
import { AccountsPanel } from './depreciation/AccountsPanel';
import { AssetPicture } from './depreciation/AssetPicture';
import { InputsPanel } from './depreciation/InputsPanel';
import { ScheduleTable } from './depreciation/ScheduleTable';
import { Toggle, type LabMode } from './kit/LabControls';
import { Intro, LabShell } from './kit/LabShell';
import { PlaybackBar, Stage, StepList, StepNow } from './kit/Playback';
import { TryItCard } from './kit/TryItCard';
import { usePlayback } from './kit/usePlayback';
import type { LabProps } from './types';

// ---------------------------------------------------------------------------------------------------------------
// The lab "depreciation" (src/simulator/labs.ts): the life of a fixed asset, year by year. The picture is the asset
// account as a bar whose book value is cut a slice each year (into a provision laid over it, or off the account
// itself), the slices gathering in Profit and Loss, and the book value as a line over the years beside the other
// method's. The figures and words all come from src/simulator/depreciation.
// ---------------------------------------------------------------------------------------------------------------

const P = 'lab-depreciation';

const CONVENTIONS = [
  "The accounting year ends on 31 March. An asset is bought, and sold, on the first day of a month.",
  "Depreciation is charged for the whole months of use: from the date of purchase, and up to the date of sale.",
  "Cost = purchase price + what is spent to make the asset ready for use (carriage, installation).",
  "Straight line: (cost - scrap value) / life, or a rate on the original cost, the same every full year and never below the scrap value; written down value: a rate on the opening book value of each year.",
  "Figures in ₹, each charge to the nearest rupee. Under the straight line method the rounded charge is the same every full year, and the last year of the life takes what is left, so the book value ends at the scrap value.",
  "A sale is received by cheque. Without a provision, the price is credited to the asset account and the profit or loss transferred from it; with a provision, the sale goes through Asset Disposal A/c.",
];

export default function DepreciationLab({ seed }: LabProps) {
  const [mode, setMode] = useState<LabMode>('watch');
  const reduced = useReducedMotion();
  return (
    <LabShell prefix={P} mode={mode} onMode={setMode} conventions={CONVENTIONS}>
      {mode === 'watch' ? <Watch reduced={reduced} /> : null}
      {mode === 'play' ? <Play reduced={reduced} seed={seed} /> : null}
      {mode === 'try' ? <TryIt reduced={reduced} seed={seed} /> : null}
    </LabShell>
  );
}

/** The picture with its playback and keys. */
function Walk({ s, reduced, start, stepMs, showSteps }: { s: Schedule; reduced: boolean; start: number; stepMs: number; showSteps: boolean }) {
  const events = useMemo(() => eventsOf(s), [s]);
  const playback = usePlayback(events.length, { story: s, stepMs, start });
  const { shown } = playback;
  const now = shown > 0 ? events[shown - 1] : null;
  return (
    <div className="flex flex-col gap-3">
      <PlaybackBar playback={playback} prefix={P} announce={now ? `${now.title}. ${now.text}` : ''} />
      <StepNow prefix={P} at={shown} count={events.length} title={now?.title} idle="Press Play, or Step, to follow the asset from the day it is bought.">
        {now?.text}
      </StepNow>
      <Stage prefix={P} label="The asset" playback={playback}>
        <AssetPicture s={s} shown={shown} reduced={reduced} />
      </Stage>
      <div className="grid items-start gap-3 lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
        <ScheduleTable s={s} shown={shown} />
        <AccountsPanel s={s} shown={shown} />
      </div>
      {showSteps ? <StepList steps={events} shown={shown} prefix={P} onPick={(i) => playback.seek(i + 1)} /> : null}
    </div>
  );
}

function Watch({ reduced }: { reduced: boolean }) {
  const [id, setId] = useState(WATCH_EXAMPLES[0].id);
  const example = WATCH_EXAMPLES.find((e) => e.id === id)!;
  const s = useMemo(() => schedule(example.inputs), [example]);
  return (
    <div className="flex flex-col gap-3">
      <Toggle options={WATCH_EXAMPLES.map((e) => ({ value: e.id, label: e.title }))} value={id} onChange={setId} label="Example" prefix={`${P}-example`} small />
      <Intro prefix={P}>
        {describe(s)}
      </Intro>
      <Walk s={s} reduced={reduced} start={0} stepMs={reduced ? 1500 : 3400} showSteps />
    </div>
  );
}

function Play({ reduced, seed }: { reduced: boolean; seed?: number }) {
  const [inputs, setInputs] = useState<DepInputs>(EXAMPLES[0].inputs);
  const [good, setGood] = useState<DepInputs>(EXAMPLES[0].inputs);
  const [preset, setPreset] = useState<string>(EXAMPLES[0].id);
  const [draw, setDraw] = useState(seed ?? 1);
  const problem = problemOf(inputs);
  const s = useMemo(() => schedule(good), [good]);
  const change = (next: DepInputs) => {
    setInputs(next);
    setPreset('');
    if (!problemOf(next)) setGood(next);
  };
  const load = (next: DepInputs, id: string) => {
    setInputs(next);
    setGood(next);
    setPreset(id);
  };
  const fresh = () => {
    // With a seed, a class (and the tests) get the same run of figures; without one, any.
    const n = seed ? draw + 1 : Date.now() % 1_000_000_007;
    setDraw(n);
    const rng = createRng(n);
    const base = randomInputs(rng);
    load(rng.int(0, 1) === 0 ? base : randomSale(rng, base), '');
  };
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
        <Toggle options={EXAMPLES.map((e) => ({ value: e.id, label: e.title }))} value={preset} onChange={(v) => load(EXAMPLES.find((e) => e.id === v)!.inputs, v)} label="Ready examples" prefix={`${P}-preset`} small />
        <Button variant="secondary" data-testid={`${P}-new`} onClick={fresh}>
          New figures
        </Button>
      </div>
      <InputsPanel inputs={inputs} onChange={change} problem={problem} s={s} />
      <Intro prefix={P}>
        {describe(s)}
      </Intro>
      <Walk s={s} reduced={reduced} start={Number.MAX_SAFE_INTEGER} stepMs={reduced ? 1200 : 2200} showSteps={false} />
    </div>
  );
}

function TryIt({ reduced, seed }: { reduced: boolean; seed?: number }) {
  const [kind, setKind] = useState<DepAskKind>(DEP_ASK_KINDS[0]);
  const [n, setN] = useState(0);
  const [answered, setAnswered] = useState(false);
  const ask = useMemo(() => depAsk(kind, askRng(seed ?? 1, kind, n)), [kind, n, seed]);
  const [current, setCurrent] = useState(ask);
  if (current !== ask) {
    setCurrent(ask);
    setAnswered(false);
  }
  const s = useMemo(() => schedule(ask.inputs), [ask]);
  const shown = answered ? ask.reveal : ask.shown;
  return (
    <div className="flex flex-col gap-3">
      <Toggle options={DEP_ASK_KINDS.map((k) => ({ value: k, label: DEP_ASK_LABEL[k] }))} value={kind} onChange={(k) => { setKind(k); setN(0); }} label="Kind of question" prefix={`${P}-kind`} small />
      <TryItCard ask={ask} prefix={P} title={DEP_ASK_LABEL[kind]} onAnswered={() => setAnswered(true)} onNext={() => setN((x) => (seed ? x + 1 : x + 1 + (Date.now() % 997)))} />
      <p className="text-sm text-muted">{answered ? 'The picture has moved on to the answer.' : 'The picture stands just before the answer: work it out from what it shows.'}</p>
      <Stage prefix={P} label="The asset" shown={shown}>
        <AssetPicture s={s} shown={shown} reduced={reduced} />
      </Stage>
      <div className="grid items-start gap-3 lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
        <ScheduleTable s={s} shown={shown} />
        <AccountsPanel s={s} shown={shown} />
      </div>
    </div>
  );
}
