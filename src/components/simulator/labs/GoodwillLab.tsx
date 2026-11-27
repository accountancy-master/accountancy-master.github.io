'use client';

import { useMemo, useState } from 'react';
import { Button } from '@/components/ui/Button';
import { createRng } from '@/engine/rng';
import { EXAMPLES, randomInputs, WATCH_EXAMPLES } from '@/simulator/goodwill/examples';
import { playStage, stageOf, stepsOf, type GwStage } from '@/simulator/goodwill/steps';
import { askRng, GW_ASK_KINDS, GW_ASK_LABEL, gwAsk, type GwAskKind } from '@/simulator/goodwill/tryit';
import { METHOD_NAME, problemOf, show, value, type GwInputs, type Valuation } from '@/simulator/goodwill/valuation';
import { useReducedMotion } from '../useReducedMotion';
import { CapitalBar, GoodwillPanel } from './goodwill/GoodwillPanel';
import { InputsPanel } from './goodwill/InputsPanel';
import { ProfitBars } from './goodwill/ProfitBars';
import { Statement } from './goodwill/Statement';
import { Toggle, type LabMode } from './kit/LabControls';
import { Intro, LabShell } from './kit/LabShell';
import { PlaybackBar, Stage, StepList, StepNow } from './kit/Playback';
import { TryItCard } from './kit/TryItCard';
import { usePlayback } from './kit/usePlayback';
import type { LabProps } from './types';

// ---------------------------------------------------------------------------------------------------------------
// The lab "goodwill" (src/simulator/labs.ts): putting a price on goodwill. The picture is the past profits as bars,
// corrected to normal profits piece by piece, the average drawn across them, the normal profit under it and the
// super profit between the two; then the goodwill, as a profit repeated for the years' purchase or as a capitalised
// value set against the capital employed. The figures and words all come from src/simulator/goodwill.
// ---------------------------------------------------------------------------------------------------------------

const P = 'lab-goodwill';

const CONVENTIONS = [
  "Each accounting year ends on 31 March. Figures are in ₹.",
  "Past profits are first brought to normal profits: an abnormal loss is added back, an abnormal gain taken out, an expense left out charged, wrongly valued closing stock corrected in its own year and the next (the other way), and repairs debited to an asset charged to profit with the depreciation on them added back.",
  "Average profit = total of the normal profits / number of years (a loss deducted). Weighted average profit = total of the products / total of the weights, the latest year having the highest weight.",
  "A fair remuneration for the partners' work, when the profits were arrived at without it, is deducted from the average profit.",
  "Capital employed = assets used in the business less outside liabilities; goodwill, non-trade investments (whose income is not in the profits here) and fictitious assets are left out. Normal profit = capital employed x normal rate / 100; super profit = average profit - normal profit.",
  "Capitalisation of average profit: average profit x 100 / rate - capital employed. Capitalisation of super profit: super profit x 100 / rate. A method that leaves nothing gives no goodwill.",
  "Figures are worked exactly and shown to the paisa only where they do not come out in whole rupees (the ready examples and the questions always do).",
];

export default function GoodwillLab({ seed }: LabProps) {
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

/** The whole picture at a stage: the bars, the capital employed and the goodwill. */
function Picture({ v, stage, reduced }: { v: Valuation; stage: GwStage; reduced: boolean }) {
  const side = stage.capital || stage.capitalised || stage.goodwill;
  return (
    <div data-testid={`${P}-picture`} className={`grid items-start gap-3 ${side ? 'lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]' : ''}`}>
      <ProfitBars v={v} stage={stage} reduced={reduced} />
      {side ? (
        <div className="flex min-w-0 flex-col gap-3">
          {stage.capital ? <CapitalBar v={v} reduced={reduced} /> : null}
          {stage.capitalised && !stage.goodwill ? (
            <p data-testid={`${P}-capitalised`} className="rounded-card border border-edge bg-surface p-3 text-sm shadow-card">
              Capitalised value of the average profit: <strong className="tabular-nums">{show(v.capitalisedValue)}</strong>, the capital a normal firm would need to earn {show(v.averageAfter)} at {v.inputs.rate}%.
            </p>
          ) : null}
          {stage.goodwill ? <GoodwillPanel v={v} reduced={reduced} /> : null}
        </div>
      ) : null}
    </div>
  );
}

/** One sentence about the firm being valued. */
const about = (v: Valuation): string =>
  `${v.inputs.firm}: goodwill by the ${METHOD_NAME[v.inputs.method].toLowerCase()}${v.inputs.method === 'average' || v.inputs.method === 'super' ? ` at ${v.inputs.purchase} years' purchase` : ''}, on the ${v.inputs.averaging === 'weighted' ? 'weighted ' : ''}average of ${v.years.length} years' normal profits${v.inputs.method === 'average' ? '' : `, a normal rate of return of ${v.inputs.rate}%`}.`;

function Watch({ reduced }: { reduced: boolean }) {
  const [id, setId] = useState(WATCH_EXAMPLES[0].id);
  const example = WATCH_EXAMPLES.find((e) => e.id === id)!;
  const v = useMemo(() => value(example.inputs), [example]);
  const steps = useMemo(() => stepsOf(v), [v]);
  const playback = usePlayback(steps.length, { story: v, stepMs: reduced ? 2200 : 4200 });
  const { shown } = playback;
  const stage = stageOf(steps, shown);
  const now = shown > 0 ? steps[shown - 1] : null;
  return (
    <div className="flex flex-col gap-3">
      <Toggle options={WATCH_EXAMPLES.map((e) => ({ value: e.id, label: e.title }))} value={id} onChange={setId} label="Example" prefix={`${P}-example`} small />
      <Intro prefix={P}>
        {about(v)}
      </Intro>
      <PlaybackBar playback={playback} prefix={P} announce={now ? `${now.title}. ${now.text}` : ''} />
      <StepNow prefix={P} at={shown} count={playback.count} title={now?.title} idle={'Press Play, or Step, to value the goodwill from the profits of the past years.'}>
        {now?.text}
      </StepNow>
      <Stage prefix={P} label="The valuation" playback={playback}>
        {shown === 0 ? <p className="px-3 py-10 text-center text-sm text-muted">Press Play: the profits of the past years come first.</p> : <Picture v={v} stage={stage} reduced={reduced} />}
      </Stage>
      {shown > 0 ? <Statement v={v} stage={stage} /> : null}
      <StepList steps={steps} shown={shown} prefix={P} onPick={(i) => playback.seek(i + 1)} />
    </div>
  );
}

function Play({ reduced, seed }: { reduced: boolean; seed?: number }) {
  const [inputs, setInputs] = useState<GwInputs>(EXAMPLES[0].inputs);
  const [good, setGood] = useState<GwInputs>(EXAMPLES[0].inputs);
  const [preset, setPreset] = useState<string>(EXAMPLES[0].id);
  const [draw, setDraw] = useState(seed ?? 1);
  const problem = problemOf(inputs);
  const v = useMemo(() => value(good), [good]);
  const change = (next: GwInputs) => {
    setInputs(next);
    setPreset('');
    if (!problemOf(next)) setGood(next);
  };
  const load = (next: GwInputs, id: string) => {
    setInputs(next);
    setGood(next);
    setPreset(id);
  };
  const fresh = () => {
    // With a seed, a class (and the tests) get the same run of figures; without one, any.
    const n = seed ? draw + 1 : Date.now() % 1_000_000_007;
    setDraw(n);
    load(randomInputs(createRng(n)), '');
  };
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
        <Toggle options={EXAMPLES.map((e) => ({ value: e.id, label: e.title }))} value={preset} onChange={(id) => load(EXAMPLES.find((e) => e.id === id)!.inputs, id)} label="Ready examples" prefix={`${P}-preset`} small />
        <Button variant="secondary" data-testid={`${P}-new`} onClick={fresh}>
          New figures
        </Button>
      </div>
      <Intro prefix={P}>
        {about(v)}
      </Intro>
      <Stage prefix={P} label="The valuation">
        <Picture v={v} stage={playStage(v)} reduced={reduced} />
      </Stage>
      <InputsPanel inputs={inputs} onChange={change} problem={problem} />
      <Statement v={v} stage={playStage(v)} />
    </div>
  );
}

function TryIt({ reduced, seed }: { reduced: boolean; seed?: number }) {
  const [kind, setKind] = useState<GwAskKind>(GW_ASK_KINDS[0]);
  const [n, setN] = useState(0);
  const [answered, setAnswered] = useState(false);
  const ask = useMemo(() => gwAsk(kind, askRng(seed ?? 1, kind, n)), [kind, n, seed]);
  const [current, setCurrent] = useState(ask);
  if (current !== ask) {
    setCurrent(ask);
    setAnswered(false);
  }
  const v = useMemo(() => value(ask.inputs), [ask]);
  const stage = answered ? ask.reveal : ask.stage;
  return (
    <div className="flex flex-col gap-3">
      <Toggle
        options={GW_ASK_KINDS.map((k) => ({ value: k, label: GW_ASK_LABEL[k] }))}
        value={kind}
        onChange={(k) => {
          setKind(k);
          setN(0);
        }}
        label="Kind of question"
        prefix={`${P}-kind`}
        small
      />
      <TryItCard ask={ask} prefix={P} title={GW_ASK_LABEL[kind]} onAnswered={() => setAnswered(true)} onNext={() => setN((x) => (seed ? x + 1 : x + 1 + (Date.now() % 997)))} />
      <p className="text-sm text-muted">{answered ? 'The picture has moved on to the answer.' : 'The picture stands just before the answer: work it out from what it shows.'}</p>
      <Stage prefix={P} label="The valuation" data-answered={answered ? 'true' : 'false'}>
        <Picture v={v} stage={stage} reduced={reduced} />
      </Stage>
      <Statement v={v} stage={stage} />
    </div>
  );
}
