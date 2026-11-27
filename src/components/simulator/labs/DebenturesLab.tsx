'use client';

import { useMemo, useState } from 'react';
import { Button } from '@/components/ui/Button';
import { createRng } from '@/engine/rng';
import { EXAMPLES, randomInput, WATCH_EXAMPLES } from '@/simulator/debentures/examples';
import { describe, problemOf, story, type DebInput, type Story } from '@/simulator/debentures/issue';
import { askRng, DEB_ASK_KINDS, DEB_ASK_LABEL, debAsk, type DebAskKind } from '@/simulator/debentures/tryit';
import { useReducedMotion } from '../useReducedMotion';
import { Books } from './debentures/Books';
import { Inputs } from './debentures/Inputs';
import { P, Picture } from './debentures/Picture';
import { Toggle, type LabMode } from './kit/LabControls';
import { Intro, LabShell } from './kit/LabShell';
import { PlaybackBar, Stage, StepList, StepNow } from './kit/Playback';
import { TryItCard } from './kit/TryItCard';
import { usePlayback } from './kit/usePlayback';
import type { LabProps } from './types';

// ---------------------------------------------------------------------------------------------------------------
// The lab "debentures" (src/simulator/labs.ts): one issue of debentures through its year. The picture is a debenture
// certificate with its three prices on one ruler (received, face value, repaid), whose gaps are the premium, the
// discount and the premium on redemption, beside the accounts of the whole issue as pots that fill and empty as the
// entries are made: allotment, interest, the write-off of the loss, and the balance sheet at the year end. The
// figures and words all come from src/simulator/debentures.
// ---------------------------------------------------------------------------------------------------------------

const CONVENTIONS = [
  "Only the issue of debentures is in the CBSE 2025-26 syllabus: a premium payable on redemption is shown only as it is provided for at the time of issue. No entry of redemption is made.",
  "The debentures account is always credited with the face value. A premium on issue goes to Securities Premium A/c.",
  "A discount alone (redeemable at par) goes to Discount on Issue of Debentures A/c. Once a premium is payable on redemption, the whole loss (discount + premium on redemption) goes to Loss on Issue of Debentures A/c, and Premium on Redemption of Debentures A/c is credited: a liability, shown under Other long-term liabilities.",
  "The discount or loss is written off on 31 March of the year of allotment, first from Securities Premium (the premium of the same issue included), the rest from the Statement of Profit and Loss as a finance cost.",
  "For cash, the whole issue price comes with the application, through Debenture Application and Allotment A/c. To a vendor, the number of debentures is the price over the issue price of one.",
  "Interest is on the face value, half-yearly on 30 September and 31 March, paid on the day; no tax is deducted at source. The year ends on 31 March. Figures in ₹.",
  "Debentures given as collateral security earn no interest: the lender earns interest on the loan. The first method passes no entry (a note under the loan); the second goes through Debenture Suspense A/c, deducted from the debentures in the balance sheet.",
];

export default function DebenturesLab({ seed }: LabProps) {
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

/** The picture with its playback, the told step and the board's formats. */
function Walk({ s, reduced, start, stepMs, showSteps }: { s: Story; reduced: boolean; start: number; stepMs: number; showSteps: boolean }) {
  const playback = usePlayback(s.steps.length, { story: s, stepMs, start });
  const { shown } = playback;
  const now = shown > 0 ? s.steps[shown - 1] : null;
  return (
    <div className="flex flex-col gap-3">
      <Stage prefix={P} label="The issue" playback={playback}>
        <Picture s={s} shown={shown} reduced={reduced} />
      </Stage>
      <PlaybackBar playback={playback} prefix={P} announce={now ? `${now.title}. ${now.text}` : ''} />
      <StepNow prefix={P} at={shown} count={playback.count} title={now?.title} idle={'Press Play, or Step, to follow the issue from its terms to the balance sheet.'}>
        {now?.text}
      </StepNow>
      <Books s={s} shown={shown} />
      {showSteps ? <StepList steps={s.steps.map((x) => ({ title: x.title, text: x.text }))} shown={shown} prefix={P} onPick={(i) => playback.seek(i + 1)} /> : null}
    </div>
  );
}

function Watch({ reduced }: { reduced: boolean }) {
  const [id, setId] = useState(WATCH_EXAMPLES[0].id);
  const example = WATCH_EXAMPLES.find((e) => e.id === id)!;
  const s = useMemo(() => story(example.input), [example]);
  return (
    <div className="flex flex-col gap-3">
      <Toggle options={WATCH_EXAMPLES.map((e) => ({ value: e.id, label: e.title }))} value={id} onChange={setId} label="Example" prefix={`${P}-example`} small />
      <Intro prefix={P}>
        {describe(example.input)}
      </Intro>
      <Walk s={s} reduced={reduced} start={0} stepMs={reduced ? 1400 : 3600} showSteps />
    </div>
  );
}

function Play({ reduced, seed }: { reduced: boolean; seed?: number }) {
  const [input, setInput] = useState<DebInput>(EXAMPLES[0].input);
  const [good, setGood] = useState<DebInput>(EXAMPLES[0].input);
  const [preset, setPreset] = useState<string>(EXAMPLES[0].id);
  const [draw, setDraw] = useState(seed ?? 1);
  const problem = problemOf(input);
  const s = useMemo(() => story(good), [good]);
  const change = (next: DebInput) => {
    setInput(next);
    setPreset('');
    if (!problemOf(next)) setGood(next);
  };
  const load = (next: DebInput, id: string) => {
    setInput(next);
    setGood(next);
    setPreset(id);
  };
  const fresh = () => {
    // With a seed, a class (and the tests) get the same run of figures; without one, any.
    const n = seed ? draw + 1 : Date.now() % 1_000_000_007;
    setDraw(n);
    load(randomInput(createRng(n)), '');
  };
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
        <Toggle options={EXAMPLES.map((e) => ({ value: e.id, label: e.title }))} value={preset} onChange={(v) => load(EXAMPLES.find((e) => e.id === v)!.input, v)} label="Ready examples" prefix={`${P}-preset`} small />
        <Button variant="secondary" data-testid={`${P}-new`} onClick={fresh}>
          New figures
        </Button>
      </div>
      <Inputs input={input} onChange={change} problem={problem} />
      <Intro prefix={P}>
        {describe(good)}
      </Intro>
      <Walk s={s} reduced={reduced} start={Number.MAX_SAFE_INTEGER} stepMs={reduced ? 1200 : 2400} showSteps={false} />
    </div>
  );
}

function TryIt({ reduced, seed }: { reduced: boolean; seed?: number }) {
  const [kind, setKind] = useState<DebAskKind>(DEB_ASK_KINDS[0]);
  const [n, setN] = useState(0);
  const [answered, setAnswered] = useState(false);
  const ask = useMemo(() => debAsk(kind, askRng(seed ?? 1, kind, n)), [kind, n, seed]);
  const [current, setCurrent] = useState(ask);
  if (current !== ask) {
    setCurrent(ask);
    setAnswered(false);
  }
  const s = useMemo(() => story(ask.input), [ask]);
  const shown = answered ? ask.reveal : ask.shown;
  return (
    <div className="flex flex-col gap-3">
      <Toggle
        options={DEB_ASK_KINDS.map((k) => ({ value: k, label: DEB_ASK_LABEL[k] }))}
        value={kind}
        onChange={(k) => {
          setKind(k);
          setN(0);
        }}
        label="Kind of question"
        prefix={`${P}-kind`}
        small
      />
      <TryItCard ask={ask} prefix={P} title={DEB_ASK_LABEL[kind]} onAnswered={() => setAnswered(true)} onNext={() => setN((x) => (seed ? x + 1 : x + 1 + (Date.now() % 997)))} />
      <p className="text-sm text-muted">{answered ? 'The picture has moved on to the answer.' : 'The picture stands just before the answer: work it out from what it shows.'}</p>
      <Stage prefix={P} label="The issue" shown={shown}>
        <Picture s={s} shown={shown} reduced={reduced} />
      </Stage>
      <Books s={s} shown={shown} />
    </div>
  );
}
