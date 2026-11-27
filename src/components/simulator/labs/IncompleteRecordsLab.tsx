'use client';

import { useMemo, useState } from 'react';
import { Button } from '@/components/ui/Button';
import { createRng } from '@/engine/rng';
import { EXAMPLES, randomInputs, WATCH_EXAMPLES } from '@/simulator/incomplete-records/examples';
import { endOf, problemOf, resultOf, resultWords, startOf, type Inputs } from '@/simulator/incomplete-records/model';
import { askRng, IR_ASK_KINDS, IR_ASK_LABEL, irAsk, type IrAskKind } from '@/simulator/incomplete-records/tryit';
import { standingAfter, walkOf } from '@/simulator/incomplete-records/walk';
import { useReducedMotion } from '../useReducedMotion';
import { InputsPanel } from './incomplete-records/InputsPanel';
import { P, Picture } from './incomplete-records/Picture';
import { Statements } from './incomplete-records/Statements';
import { Toggle, type LabMode } from './kit/LabControls';
import { Intro, LabShell } from './kit/LabShell';
import { PlaybackBar, Stage, StepList, StepNow } from './kit/Playback';
import { TryItCard } from './kit/TryItCard';
import { usePlayback } from './kit/usePlayback';
import type { LabProps } from './types';

// ---------------------------------------------------------------------------------------------------------------
// The lab "incomplete-records" (src/simulator/labs.ts): profit without full books, by the statement of affairs
// method. Two statements of affairs side by side, each a stack of what the business owns against what it owes, with
// the capital as the balancing block; then the capital ladder from the closing capital to the profit; then the
// adjustments to the net result. The accounting is in src/simulator/incomplete-records; this screen only draws it.
// ---------------------------------------------------------------------------------------------------------------

const CONVENTIONS = [
  "The statement of affairs method only (the conversion method is outside the CBSE syllabus). The year runs from 1 April to 31 March.",
  "Capital on a date = business assets − business liabilities, the balancing figure. The proprietor's private assets and debts are left out; an overdraft and an unpaid expense are liabilities.",
  "Profit (or loss) = closing capital + drawings − additional capital − opening capital. Drawings: cash taken (a monthly figure × 12; a salary the proprietor takes counts as drawings), goods taken at cost (not at the sale price), and private bills the business paid.",
  "The closing statement of affairs is drawn up before the adjustments, which are then made to the profit found: interest on capital (at the rate given, on the capital at the beginning of the year), depreciation (on the figure in the closing statement), a provision for doubtful debts (on the closing debtors) and an outstanding expense are deducted; a prepaid expense and an accrued income are added.",
  "Amounts worked out by a rate are rounded to the nearest rupee.",
];

export default function IncompleteRecordsLab({ seed }: LabProps) {
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

function about(i: Inputs): string {
  const r = resultOf(i);
  return `${i.owner} keeps only a cash book and a list of debtors and creditors for ${i.shop}: no full double entry, so no Profit and Loss Account can be drawn from the books. The capital on ${startOf(i)} and on ${endOf(i)} is found from statements of affairs, and the result of the year from the change in it: ${resultWords(r.net)}.`;
}

/** The picture and the board's formats, with the playback and keys. */
function Walk({ i, reduced, start, stepMs, showSteps }: { i: Inputs; reduced: boolean; start: number; stepMs: number; showSteps: boolean }) {
  const walk = useMemo(() => walkOf(i), [i]);
  const playback = usePlayback(walk.length, { story: walk, stepMs, start });
  const { shown } = playback;
  const st = standingAfter(walk, shown);
  const now = shown > 0 ? walk[shown - 1] : null;
  return (
    <div className="flex flex-col gap-3">
      <PlaybackBar playback={playback} prefix={P} announce={now ? `${now.title}. ${now.text}` : ''} />
      <StepNow prefix={P} at={shown} count={playback.count} title={now?.title} idle={'Press Play, or Step, to build the statement of affairs at the start of the year.'}>
        {now?.text}
      </StepNow>
      <Stage prefix={P} label="The statements" playback={playback}>
        <Picture i={i} st={st} reduced={reduced} />
      </Stage>
      <Statements i={i} st={st} />
      {showSteps ? <StepList steps={walk.map((s) => ({ title: s.title, text: s.text }))} shown={shown} prefix={P} onPick={(i) => playback.seek(i + 1)} /> : null}
    </div>
  );
}

function Watch({ reduced }: { reduced: boolean }) {
  const [id, setId] = useState(WATCH_EXAMPLES[0].id);
  const i = WATCH_EXAMPLES.find((e) => e.id === id)!.inputs;
  return (
    <div className="flex flex-col gap-3">
      <Toggle options={WATCH_EXAMPLES.map((e) => ({ value: e.id, label: e.title }))} value={id} onChange={setId} label="Example" prefix={`${P}-example`} small />
      <Intro prefix={P}>
        {about(i)}
      </Intro>
      <Walk key={id} i={i} reduced={reduced} start={0} stepMs={reduced ? 1200 : 3600} showSteps />
    </div>
  );
}

function Play({ reduced, seed }: { reduced: boolean; seed?: number }) {
  const [inputs, setInputs] = useState<Inputs>(EXAMPLES[0].inputs);
  const [good, setGood] = useState<Inputs>(EXAMPLES[0].inputs);
  const [preset, setPreset] = useState<string>(EXAMPLES[0].id);
  const [draw, setDraw] = useState(seed ?? 1);
  const problem = problemOf(inputs);
  const change = (next: Inputs) => {
    setInputs(next);
    setPreset('');
    if (!problemOf(next)) setGood(next);
  };
  const load = (next: Inputs, id: string) => {
    setInputs(next);
    setGood(next);
    setPreset(id);
  };
  const fresh = () => {
    const n = seed ? draw + 1 : Date.now() % 1_000_000_007;
    setDraw(n);
    load(randomInputs(createRng(n)), '');
  };
  const r = resultOf(good);
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
        <Toggle options={EXAMPLES.map((e) => ({ value: e.id, label: e.title }))} value={preset} onChange={(v) => load(EXAMPLES.find((e) => e.id === v)!.inputs, v)} label="Ready examples" prefix={`${P}-preset`} small />
        <Button variant="secondary" data-testid={`${P}-new`} onClick={fresh}>
          New figures
        </Button>
      </div>
      <InputsPanel i={inputs} onChange={change} problem={problem} />
      <p data-testid={`${P}-summary`} className="rounded-control bg-surface px-3 py-2 text-base">
        Capital {startOf(good)}: <strong>{`₹${(r.capital[0] / 100).toLocaleString('en-IN')}`}</strong>; {endOf(good)}: <strong>{`₹${(r.capital[1] / 100).toLocaleString('en-IN')}`}</strong>. Before adjustments: <strong>{resultWords(r.before)}</strong>
        {r.adjs.length ? (
          <>
            ; net: <strong>{resultWords(r.net)}</strong>
          </>
        ) : null}
        .
      </p>
      <Walk i={good} reduced={reduced} start={Number.MAX_SAFE_INTEGER} stepMs={reduced ? 1000 : 2200} showSteps={false} />
    </div>
  );
}

function TryIt({ reduced, seed }: { reduced: boolean; seed?: number }) {
  const [kind, setKind] = useState<IrAskKind>(IR_ASK_KINDS[0]);
  const [n, setN] = useState(0);
  const [answered, setAnswered] = useState(false);
  const ask = useMemo(() => irAsk(kind, askRng(seed ?? 1, kind, n)), [kind, n, seed]);
  const [current, setCurrent] = useState(ask);
  if (current !== ask) {
    setCurrent(ask);
    setAnswered(false);
  }
  const walk = useMemo(() => walkOf(ask.inputs), [ask]);
  const shown = answered ? ask.reveal : ask.shown;
  const st = standingAfter(walk, shown);
  return (
    <div className="flex flex-col gap-3">
      <Toggle options={IR_ASK_KINDS.map((k) => ({ value: k, label: IR_ASK_LABEL[k] }))} value={kind} onChange={(k) => { setKind(k); setN(0); }} label="Kind of question" prefix={`${P}-kind`} small />
      <TryItCard ask={ask} prefix={P} title={IR_ASK_LABEL[kind]} onAnswered={() => setAnswered(true)} onNext={() => setN((x) => (seed ? x + 1 : x + 1 + (Date.now() % 997)))} />
      <p className="text-sm text-muted">
        {kind === 'where' ? 'The picture shows a worked year of Menon Hardware, for reference.' : answered ? 'The picture has moved on to the answer.' : 'The picture stands just before the answer: work it out from what it shows.'}
      </p>
      <Stage prefix={P} label="The statements" shown={shown}>
        <Picture i={ask.inputs} st={st} reduced={reduced} />
      </Stage>
      <Statements i={ask.inputs} st={st} />
    </div>
  );
}
