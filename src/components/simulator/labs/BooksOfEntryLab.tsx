'use client';

import { useMemo, useState } from 'react';
import { recordsOf } from '@/simulator/books-of-entry/model';
import { WATCH_EXAMPLES } from '@/simulator/books-of-entry/examples';
import { askRng, BOE_ASK_KINDS, BOE_ASK_LABEL, boeAsk, type BoeAskKind } from '@/simulator/books-of-entry/tryit';
import { walkOf } from '@/simulator/books-of-entry/walk';
import { useReducedMotion } from '../useReducedMotion';
import { P } from './books-of-entry/Desk';
import { PlayPanel } from './books-of-entry/PlayPanel';
import { Stage as BooksPicture } from './books-of-entry/Stage';
import { Toggle, type LabMode } from './kit/LabControls';
import { Intro, LabShell } from './kit/LabShell';
import { PlaybackBar, Stage, StepList, StepNow } from './kit/Playback';
import { TryItCard } from './kit/TryItCard';
import { usePlayback } from './kit/usePlayback';
import type { LabProps } from './types';

// ---------------------------------------------------------------------------------------------------------------
// The lab "books-of-entry" (src/simulator/labs.ts): which book does a transaction go in? The month's source
// documents are sorted on a desk into the seven books (a settlement at a cash discount splits into the Cash Book and
// the Journal Proper); each book fills in the board's format; at the month end the Cash Book is balanced and each
// book is totalled and posted to the ledger, shown as arrows into the accounts. The accounting is all in
// src/simulator/books-of-entry; this screen only draws it.
// ---------------------------------------------------------------------------------------------------------------

const CONVENTIONS = [
  "The Cash Book has cash and bank columns only (the current CBSE treatment): receipts on the debit side, payments on the credit side. A cheque received is banked the same day.",
  "A cash discount is not in the Cash Book: it shows the money that moves, and the discount is a Journal Proper entry (Discount Allowed A/c Dr, To the debtor; or the creditor Dr, To Discount Received A/c).",
  "Cash paid into the bank or drawn from it for office use is a contra entry: on both sides, marked \"C\", and not posted. Money the proprietor draws from the bank is drawings, not a contra entry.",
  "The Purchases, Sales and return books take only credit dealings in the goods of the business, at the price after trade discount (never recorded). An asset bought on credit, goods taken by the proprietor (at cost) and a bad debt go to the Journal Proper.",
  "With GST, CGST and SGST (half the rate each) within the state, IGST across states, on the price after trade discount, at 5% or 18%. Each party is posted with its invoice or note on the day; the column totals are posted at the month end (\"Sundries as per\" the book), the tax columns to the Input or Output GST accounts. A cash dealing with GST has a row in the Cash Book for the goods and for each tax.",
  "Petty cash on the imprest system: the head cashier gives the imprest and, on the last day, exactly what was spent. The analytical columns are posted as totals.",
  "The ledger accounts are shown with the month's postings only, in the order of their dates; balancing them is the work of the \"Journal to ledger to trial balance\" lab.",
];

export default function BooksOfEntryLab({ seed }: LabProps) {
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
  const [id, setId] = useState(WATCH_EXAMPLES[0].id);
  const m = WATCH_EXAMPLES.find((e) => e.id === id)!.month;
  const records = useMemo(() => recordsOf(m), [m]);
  const walk = useMemo(() => walkOf(m, records), [m, records]);
  const playback = usePlayback(walk.length, { story: walk, stepMs: reduced ? 900 : 3200 });
  const { shown } = playback;
  const now = shown > 0 ? walk[shown - 1] : null;
  return (
    <div className="flex flex-col gap-3">
      <Toggle options={WATCH_EXAMPLES.map((e) => ({ value: e.id, label: e.title }))} value={id} onChange={setId} label="Example" prefix={`${P}-example`} small />
      <Intro prefix={P}>
        {m.firm} deals in {m.goods}. {m.month} {m.year} opens with {m.opening.cash ? `cash in hand of ₹${(m.opening.cash / 100).toLocaleString('en-IN')}` : 'no cash'} and {m.opening.bank >= 0 ? `₹${(m.opening.bank / 100).toLocaleString('en-IN')} at the bank` : `a bank overdraft of ₹${(-m.opening.bank / 100).toLocaleString('en-IN')}`}.{' '}
        {m.gst.rate ? `Its goods carry GST at ${m.gst.rate}%${m.gst.intra ? ' (CGST and SGST, all within the state)' : ' (IGST, from another state)'}.` : 'GST is ignored.'} Each document of the month goes to its book.
      </Intro>
      <PlaybackBar playback={playback} prefix={P} announce={now ? `${now.title}. ${now.text}` : ''} />
      <StepNow prefix={P} at={shown} count={playback.count} title={now?.title} idle={'Press Play, or Step, to sort the first document of the month.'}>
        {now?.text}
      </StepNow>
      <Stage prefix={P} label="The books" playback={playback}>
        <BooksPicture m={m} records={records} walk={walk} shown={shown} reduced={reduced} />
      </Stage>
      <details className="rounded-control border border-edge bg-surface px-3 py-2">
        <summary className="min-h-11 cursor-pointer py-2 text-sm font-extrabold">All the steps of the month</summary>
        <StepList steps={walk.map((s) => ({ title: s.title, text: s.text }))} shown={shown} prefix={P} onPick={(i) => playback.seek(i + 1)} />
      </details>
    </div>
  );
}

function TryIt({ reduced, seed }: { reduced: boolean; seed?: number }) {
  const [kind, setKind] = useState<BoeAskKind>(BOE_ASK_KINDS[0]);
  const [n, setN] = useState(0);
  const [answered, setAnswered] = useState(false);
  const ask = useMemo(() => boeAsk(kind, askRng(seed ?? 1, kind, n)), [kind, n, seed]);
  const [current, setCurrent] = useState(ask);
  if (current !== ask) {
    setCurrent(ask);
    setAnswered(false);
  }
  const records = useMemo(() => recordsOf(ask.month), [ask]);
  const walk = useMemo(() => walkOf(ask.month, records), [ask, records]);
  const shown = answered ? ask.reveal : ask.shown;
  return (
    <div className="flex flex-col gap-3">
      <Toggle options={BOE_ASK_KINDS.map((k) => ({ value: k, label: BOE_ASK_LABEL[k] }))} value={kind} onChange={(k) => { setKind(k); setN(0); }} label="Kind of question" prefix={`${P}-kind`} small />
      <TryItCard ask={ask} prefix={P} title={BOE_ASK_LABEL[kind]} onAnswered={() => setAnswered(true)} onNext={() => setN((x) => (seed ? x + 1 : x + 1 + (Date.now() % 997)))} />
      <p className="text-sm text-muted">{answered ? 'The picture has moved on to the answer.' : 'The picture stands just before the answer: work it out from what it shows.'}</p>
      <Stage prefix={P} label="The books" shown={shown}>
        <BooksPicture m={ask.month} records={records} walk={walk} shown={shown} reduced={reduced} follow={answered || ask.kind !== 'which-book' ? ask.book : null} hide={!answered && (ask.kind === 'cash-balance' || ask.kind === 'book-total')} />
      </Stage>
    </div>
  );
}
