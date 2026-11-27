'use client';

import { useMemo, useState } from 'react';
import { Button } from '@/components/ui/Button';
import { formatINR } from '@/engine/money';
import { createRng } from '@/engine/rng';
import { dissolve, problemOf, type DFirm, type Dissolution } from '@/simulator/dissolution/dissolve';
import { EXAMPLES, randomFirm, WATCH_EXAMPLES } from '@/simulator/dissolution/examples';
import { askRng, DIS_ASK_KINDS, DIS_ASK_LABEL, disAsk, type DisAskKind } from '@/simulator/dissolution/tryit';
import { useReducedMotion } from '../useReducedMotion';
import { Accounts } from './dissolution/Accounts';
import { InputsPanel } from './dissolution/InputsPanel';
import { DissolutionPicture } from './dissolution/Picture';
import { Toggle, type LabMode } from './kit/LabControls';
import { Intro, LabShell } from './kit/LabShell';
import { PlaybackBar, Stage, StepList, StepNow } from './kit/Playback';
import { TryItCard } from './kit/TryItCard';
import { usePlayback } from './kit/usePlayback';
import type { LabProps } from './types';

// ---------------------------------------------------------------------------------------------------------------
// The lab "dissolution" (src/simulator/labs.ts): closing a firm. The picture is the balance sheet emptying into
// Realisation A/c (assets to its debit, outside liabilities to its credit), the assets realised and the liabilities
// paid, the profit or loss that levels the two sides shared among the partners, and the bank emptied by the last
// payment, with the accounts written up beside it as the board writes them. The figures and words all come from
// src/simulator/dissolution.
// ---------------------------------------------------------------------------------------------------------------

const P = 'lab-dissolution';
const inr = formatINR;

const CONVENTIONS = [
  "Every receipt and payment is by cheque (Bank A/c). Capitals are fluctuating. Figures in ₹.",
  "Every asset but cash at bank and fictitious assets goes to the debit of Realisation A/c at its book value; every outside liability (a loan from a partner's relative among them) and the provision for doubtful debts go to its credit.",
  "General Reserve and the balance of Profit and Loss A/c go straight to the capital accounts in the profit-sharing ratio. A partner's own loan stays out of Realisation A/c and is repaid after the outside liabilities.",
  "An asset about which nothing is said realises its book value if it is tangible and nothing if it is intangible. An asset the creditors accept needs no entry: only the balance paid to them is recorded.",
  "Realisation A/c bears only the expenses the firm bears (or the remuneration agreed for a partner who bears them); expenses a partner bears and pays personally have no entry.",
  "The profit or loss on realisation is shared in the profit-sharing ratio. No partner is insolvent: a debit balance on a capital account is brought in, and every credit balance is paid, which leaves the bank at nil.",
];

export default function DissolutionLab({ seed }: LabProps) {
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

const about = (d: Dissolution): string =>
  `${d.firm.firm} share profits ${d.firm.partners.map((p) => p.ratio).join(':')} and dissolve their firm on ${d.firm.date}: ${d.result > 0 ? `a profit of ${inr(d.result)}` : d.result < 0 ? `a loss of ${inr(-d.result)}` : 'no profit or loss'} on realisation.`;

function Watch({ reduced }: { reduced: boolean }) {
  const [id, setId] = useState(WATCH_EXAMPLES[0].id);
  const example = WATCH_EXAMPLES.find((e) => e.id === id)!;
  const d = useMemo(() => dissolve(example.firm), [example]);
  const playback = usePlayback(d.steps.length, { story: d, stepMs: reduced ? 2400 : 4400 });
  const { shown } = playback;
  const now = shown > 0 ? d.steps[shown - 1] : null;
  return (
    <div className="flex flex-col gap-3">
      <Toggle options={WATCH_EXAMPLES.map((e) => ({ value: e.id, label: e.title }))} value={id} onChange={setId} label="Example" prefix={`${P}-example`} small />
      <Intro prefix={P}>
        {d.firm.firm} share profits {d.firm.partners.map((p) => p.ratio).join(':')} and dissolve their firm on {d.firm.date}. Follow every balance out of the books.
      </Intro>
      <PlaybackBar playback={playback} prefix={P} announce={now ? `${now.title}. ${now.text}` : ''} />
      <StepNow prefix={P} at={shown} count={playback.count} title={now?.title} idle={'Press Play, or Step, to close the books of the firm one step at a time.'}>
        {now?.text}
      </StepNow>
      <Stage prefix={P} label="The dissolution" playback={playback}>
        <DissolutionPicture d={d} shown={shown} reduced={reduced} />
      </Stage>
      <Accounts d={d} shown={shown} />
      <StepList steps={d.steps.map((s) => ({ title: s.title, text: s.text }))} shown={shown} prefix={P} onPick={(i) => playback.seek(i + 1)} />
    </div>
  );
}

function Play({ reduced, seed }: { reduced: boolean; seed?: number }) {
  const [firm, setFirm] = useState<DFirm>(EXAMPLES[0].firm);
  const [good, setGood] = useState<DFirm>(EXAMPLES[0].firm);
  const [preset, setPreset] = useState<string>(EXAMPLES[0].id);
  const [draw, setDraw] = useState(seed ?? 1);
  const problem = problemOf(firm) ?? dissolve(firm).problem;
  const d = useMemo(() => dissolve(good), [good]);
  const change = (next: DFirm) => {
    setFirm(next);
    setPreset('');
    if (!problemOf(next) && !dissolve(next).problem) setGood(next);
  };
  const load = (next: DFirm, id: string) => {
    setFirm(next);
    setGood(next);
    setPreset(id);
  };
  const fresh = () => {
    // With a seed, a class (and the tests) get the same run of figures; without one, any.
    const n = seed ? draw + 1 : Date.now() % 1_000_000_007;
    setDraw(n);
    load(randomFirm(createRng(n)), '');
  };
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
        <Toggle options={EXAMPLES.map((e) => ({ value: e.id, label: e.title }))} value={preset} onChange={(id) => load(EXAMPLES.find((e) => e.id === id)!.firm, id)} label="Ready examples" prefix={`${P}-preset`} small />
        <Button variant="secondary" data-testid={`${P}-new`} onClick={fresh}>
          New figures
        </Button>
      </div>
      <Intro prefix={P}>
        {about(d)}
      </Intro>
      <Stage prefix={P} label="The dissolution">
        <DissolutionPicture d={d} shown={d.steps.length} reduced={reduced} />
      </Stage>
      <InputsPanel firm={firm} onChange={change} problem={problem} />
      <Accounts d={d} shown={d.steps.length} />
    </div>
  );
}

function TryIt({ reduced, seed }: { reduced: boolean; seed?: number }) {
  const [kind, setKind] = useState<DisAskKind>(DIS_ASK_KINDS[0]);
  const [n, setN] = useState(0);
  const [answered, setAnswered] = useState(false);
  const ask = useMemo(() => disAsk(kind, askRng(seed ?? 1, kind, n)), [kind, n, seed]);
  const [current, setCurrent] = useState(ask);
  if (current !== ask) {
    setCurrent(ask);
    setAnswered(false);
  }
  const d = useMemo(() => dissolve(ask.firm), [ask]);
  const shown = answered ? ask.reveal : ask.shown;
  return (
    <div className="flex flex-col gap-3">
      <Toggle
        options={DIS_ASK_KINDS.map((k) => ({ value: k, label: DIS_ASK_LABEL[k] }))}
        value={kind}
        onChange={(k) => {
          setKind(k);
          setN(0);
        }}
        label="Kind of question"
        prefix={`${P}-kind`}
        small
      />
      <TryItCard ask={ask} prefix={P} title={DIS_ASK_LABEL[kind]} onAnswered={() => setAnswered(true)} onNext={() => setN((x) => (seed ? x + 1 : x + 1 + (Date.now() % 997)))} />
      <p className="text-sm text-muted">{answered ? 'The picture has moved on to the answer.' : 'The picture stands just before the answer: work it out from what it shows.'}</p>
      <Stage prefix={P} label="The dissolution" shown={shown}>
        <DissolutionPicture d={d} shown={shown} reduced={reduced} />
      </Stage>
      <Accounts d={d} shown={shown} />
    </div>
  );
}
