'use client';

import { useMemo, useState } from 'react';
import { READY_CASES } from '@/simulator/trial-balance-fix/cases';
import { buildCase, findError } from '@/simulator/trial-balance-fix/model';
import { askRng, TF_ASK_KINDS, TF_ASK_LABEL, tfAsk, type TfAskKind } from '@/simulator/trial-balance-fix/tryit';
import { aboutCase, START, walkOf } from '@/simulator/trial-balance-fix/walk';
import { useReducedMotion } from '../useReducedMotion';
import { useVisitSeed } from './kit/format';
import { Toggle, type LabMode } from './kit/LabControls';
import { Card, Intro, LabShell } from './kit/LabShell';
import { PlaybackBar, Stage, StepList, StepNow } from './kit/Playback';
import { TryItCard } from './kit/TryItCard';
import { usePlayback } from './kit/usePlayback';
import { Desk, ErrorCard } from './trial-balance-fix/Desk';
import { P } from './trial-balance-fix/LedgerAccount';
import { PlayPanel } from './trial-balance-fix/PlayPanel';
import type { LabProps } from './types';

// ---------------------------------------------------------------------------------------------------------------
// The lab "trial-balance-fix" (src/simulator/labs.ts): when the trial balance won't agree. A business's month in its
// books as a clerk wrote them, errors and all; the ledger posted from them as rough work; a trial balance that does
// not agree and a Suspense A/c that holds the difference; the errors found, and each rectified by its entry (through
// Suspense A/c only when it was one-sided); the entries posted, Suspense A/c closed, the corrected trial balance and
// the corrected profit. The accounting is in src/simulator/trial-balance-fix; this screen only draws it.
// ---------------------------------------------------------------------------------------------------------------

const CONVENTIONS = [
  'One month, April 2026; the accounts are balanced on 30 April ("Balance c/d") and brought down on 1 May ("Balance b/d"). Amounts in rupees.',
  'Credit sales (or purchases) of goods go in the Sales (Purchases) Book: each party is posted on its day, the book’s total to Sales (Purchases) A/c on 30 April as "By (To) Sundries as per Sales (Purchases) Book". Everything else is in the journal.',
  'The trial balance by the balance method only: each account with a balance once, in the column of its balance.',
  'Before a Suspense A/c is opened, the trial balance is checked against the ledger. A balance left out or written in the wrong column is a slip in drawing up the trial balance, not in the books: the trial balance itself is put right, with no journal entry.',
  'What is still different goes to Suspense A/c in the column that is short, as "Difference in Trial Balance".',
  'An error that leaves one account wrong (one-sided) is rectified, once Suspense A/c exists, by an entry whose other side is Suspense A/c; found before the trial balance it is corrected in the account itself, with no journal entry. An error that leaves the totals equal (a complete omission, an error of principle, a wrong account, compensating errors) is rectified by an entry between the accounts concerned, never through Suspense A/c; compensating errors of casting make one entry between the two accounts after the trial balance, and found before it are each corrected in their own account.',
  'The rectifying entries are posted with the letter of their error in the date column; each account is balanced again from its balance brought down. A posting to the wrong side is put right by twice its amount; a wrong amount by the difference.',
  'The profit is corrected for the errors listed only (no depreciation is charged on an asset that was wrongly debited to Purchases): an expense too low or an income too high overstates it.',
];

export default function TrialBalanceFixLab({ seed }: LabProps) {
  const [mode, setMode] = useState<LabMode>('watch');
  const reduced = useReducedMotion();
  return (
    <LabShell prefix={P} mode={mode} onMode={setMode} conventions={CONVENTIONS}>
      {mode === 'watch' ? <Watch reduced={reduced} /> : null}
      {mode === 'play' ? <PlayPanel reduced={reduced} seed={seed} /> : null}
      {mode === 'try' ? <TryIt reduced={reduced} seed={seed} /> : null}
    </LabShell>
  );
}

function Watch({ reduced }: { reduced: boolean }) {
  const [id, setId] = useState(READY_CASES[0].id);
  const data = READY_CASES.find((d) => d.id === id)!;
  const c = useMemo(() => buildCase(data), [data]);
  return (
    <div className="flex min-w-0 flex-col gap-3">
      <Toggle options={READY_CASES.map((d) => ({ value: d.id, label: d.title }))} value={id} onChange={setId} label="Case" prefix={`${P}-example`} small />
      <Intro prefix={P}>
        <span className="font-extrabold">{data.level}. </span>
        {aboutCase(c)}
      </Intro>
      <Walk key={id} id={id} reduced={reduced} />
    </div>
  );
}

function Walk({ id, reduced }: { id: string; reduced: boolean }) {
  const c = useMemo(() => buildCase(READY_CASES.find((d) => d.id === id)!), [id]);
  const walk = useMemo(() => walkOf(c), [c]);
  const playback = usePlayback(walk.length, {
    story: walk,
    // Time to read the step just shown.
    stepMs: (shown) => (reduced ? 1200 : Math.max(3600, (walk[shown - 1]?.text.split(' ').length ?? 0) * 240)),
  });
  const { shown } = playback;
  const now = shown > 0 ? walk[shown - 1] : null;
  const st = now ? now.state : START;
  const err = st.current ? findError(c, st.current) : null;
  return (
    <div className="flex min-w-0 flex-col gap-3">
      <PlaybackBar playback={playback} prefix={P} announce={now ? `${now.title}. ${now.text}` : ''} />
      <StepNow prefix={P} at={shown} count={playback.count} title={now?.title} idle="Press Play, or Step, to walk through the month: the books, the ledger, a trial balance that will not agree, and the errors found and rectified.">
        {now?.text}
      </StepNow>
      {err ? <ErrorCard c={c} e={err} /> : null}
      <Stage prefix={P} label="The books, the ledger and the trial balance" playback={playback}>
        <Desk c={c} st={st} reduced={reduced} />
      </Stage>
      <StepList steps={walk.map((s) => ({ title: s.title }))} shown={shown} prefix={P} onPick={(i) => playback.seek(i + 1)} />
    </div>
  );
}

function TryIt({ reduced, seed }: { reduced: boolean; seed?: number }) {
  const base = useVisitSeed(seed);
  const [kind, setKind] = useState<TfAskKind>(TF_ASK_KINDS[0]);
  const [n, setN] = useState(0);
  const [answered, setAnswered] = useState(false);
  const ask = useMemo(() => tfAsk(kind, askRng(base, kind, n)), [kind, n, base]);
  const [current, setCurrent] = useState(ask);
  if (current !== ask) {
    setCurrent(ask);
    setAnswered(false);
  }
  const c = useMemo(() => buildCase(ask.data), [ask]);
  const st = answered ? ask.reveal : ask.shown;
  return (
    <div className="flex min-w-0 flex-col gap-3">
      <Toggle
        options={TF_ASK_KINDS.map((k) => ({ value: k, label: TF_ASK_LABEL[k] }))}
        value={kind}
        onChange={(k) => {
          setKind(k);
          setN(0);
        }}
        label="Kind of question"
        prefix={`${P}-kind`}
        small
      />
      {ask.items.length ? (
        <Card title="The errors found" testId={`${P}-try-items`}>
          <ul className="flex flex-col gap-1 text-sm">
            {ask.items.map((t, i) => (
              <li key={i}>{t}</li>
            ))}
          </ul>
        </Card>
      ) : null}
      <TryItCard ask={ask} prefix={P} title={TF_ASK_LABEL[kind]} onAnswered={() => setAnswered(true)} onNext={() => setN((x) => x + 1)} />
      <p className="text-sm text-muted">{answered ? 'The picture now shows the answer: the error marked, and its rectification posted.' : `The books of ${ask.data.business} as the clerk left them. Open any account.`}</p>
      <Stage prefix={P} label="The ledger and the trial balance" shown={answered ? 1 : 0}>
        <Desk c={c} st={st} reduced={reduced} compact />
      </Stage>
    </div>
  );
}
