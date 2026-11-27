'use client';

import { useId, useMemo, useState } from 'react';
import { Button } from '@/components/ui/Button';
import { creditor, debtor } from '@/engine/accounts';
import { rupees, type Paise } from '@/engine/money';
import { createRng } from '@/engine/rng';
import { EXAMPLES, randomMonth } from '@/simulator/books-of-entry/examples';
import {
  ASSET_WORDS,
  BOOK_NAME,
  BOOK_TAKES,
  EXPENSE_NAME,
  HEAD_NAME,
  inr,
  partyBalance,
  PETTY_HEADS,
  problemOf,
  recordsOf,
  type AssetId,
  type BookId,
  type ExpenseId,
  type GstSetting,
  type Mode,
  type Month,
  type PettyHead,
  type Tx,
} from '@/simulator/books-of-entry/model';
import { walkOf } from '@/simulator/books-of-entry/walk';
import { MoneyField } from '../kit/MoneyField';
import { Toggle } from '../kit/LabControls';
import { PlaybackBar, Stage, StepNow } from '../kit/Playback';
import { usePlayback } from '../kit/usePlayback';
import { P } from './Desk';
import { Stage as BooksPicture } from './Stage';

// ---------------------------------------------------------------------------------------------------------------
// Play: the learner sorts the month's documents into the books (a wrong book is told why), changes the GST, adds
// or removes transactions; once the tray is empty, the month end plays: the Cash Book balanced and every book
// posted. A transaction that cannot be (cash paid out beyond what is in hand, a party paid more than is owed) is
// refused with the reason.
// ---------------------------------------------------------------------------------------------------------------

type AddKind =
  | 'creditPurchase' | 'creditSale' | 'purchaseReturn' | 'salesReturn' | 'cashSale' | 'cashPurchase' | 'received' | 'receivedDisc'
  | 'paid' | 'paidDisc' | 'deposit' | 'withdraw' | 'drawings' | 'expense' | 'assetCredit' | 'assetPaid' | 'goodsDrawings' | 'badDebt' | 'petty';

const ADD_KINDS: readonly { value: AddKind; label: string; amount: string; party?: 'supplier' | 'customer'; mode?: boolean }[] = [
  { value: 'creditPurchase', label: 'Goods bought on credit', amount: 'List price', party: 'supplier' },
  { value: 'creditSale', label: 'Goods sold on credit', amount: 'List price', party: 'customer' },
  { value: 'purchaseReturn', label: 'Goods returned to a supplier', amount: 'List price of the goods', party: 'supplier' },
  { value: 'salesReturn', label: 'Goods returned by a customer', amount: 'List price of the goods', party: 'customer' },
  { value: 'cashSale', label: 'Goods sold for cash or a cheque', amount: 'Price', mode: true },
  { value: 'cashPurchase', label: 'Goods bought for cash or by cheque', amount: 'Price', mode: true },
  { value: 'received', label: 'Money received from a customer, on account', amount: 'Money received', party: 'customer', mode: true },
  { value: 'receivedDisc', label: 'A customer settles in full at a cash discount', amount: 'Cash discount allowed', party: 'customer', mode: true },
  { value: 'paid', label: 'Money paid to a supplier, on account', amount: 'Money paid', party: 'supplier', mode: true },
  { value: 'paidDisc', label: 'A supplier is paid in full at a cash discount', amount: 'Cash discount received', party: 'supplier', mode: true },
  { value: 'deposit', label: 'Office cash paid into the bank', amount: 'Amount' },
  { value: 'withdraw', label: 'Cash drawn from the bank for the office', amount: 'Amount' },
  { value: 'drawings', label: 'Money taken by the proprietor', amount: 'Amount', mode: true },
  { value: 'expense', label: 'Rent of the shop paid', amount: 'Amount', mode: true },
  { value: 'assetCredit', label: 'Furniture bought on credit', amount: 'Price', party: 'supplier' },
  { value: 'assetPaid', label: 'A computer bought by cheque', amount: 'Price' },
  { value: 'goodsDrawings', label: 'Goods taken by the proprietor', amount: 'Cost' },
  { value: 'badDebt', label: 'A customer’s debt written off as bad', amount: 'Amount', party: 'customer' },
  { value: 'petty', label: 'A petty cash payment', amount: 'Amount' },
];

const GST_CHOICES = [
  { value: 'none', label: 'No GST' },
  { value: 'intra', label: 'CGST + SGST' },
  { value: 'inter', label: 'IGST' },
] as const;
type GstChoice = (typeof GST_CHOICES)[number]['value'];
const gstChoice = (g: GstSetting): GstChoice => (g.rate === 0 ? 'none' : g.intra ? 'intra' : 'inter');

/** The parties of a month, each kind. */
function partiesOf(m: Month, kind: 'supplier' | 'customer'): string[] {
  const names = new Set<string>(Object.keys(kind === 'supplier' ? m.owed.creditors : m.owed.debtors));
  for (const t of m.txs) {
    if (!('party' in t)) continue;
    const supplierSide = t.kind === 'creditPurchase' || t.kind === 'purchaseReturn' || t.kind === 'paid' || t.kind === 'assetCredit';
    if (supplierSide === (kind === 'supplier')) names.add(t.party);
  }
  for (const d of kind === 'supplier' ? ['Rao & Co.', 'Bose & Sons'] : ['Kiran Stores', 'Patel Mart']) names.add(d);
  return [...names];
}

/** The month again with every settlement and bad debt matched to what the party owes (after a change of GST). */
function rebalance(m: Month): Month {
  const txs: Tx[] = [];
  for (const t of m.txs) {
    const sofar: Month = { ...m, txs };
    if ((t.kind === 'received' || t.kind === 'paid') && t.due !== undefined) {
      const due = partyBalance(sofar, recordsOf(sofar), t.kind === 'received' ? debtor(t.party) : creditor(t.party));
      txs.push({ ...t, due, amount: due - (t.due - t.amount) });
    } else if (t.kind === 'badDebt') {
      txs.push({ ...t, amount: partyBalance(sofar, recordsOf(sofar), debtor(t.party)) });
    } else txs.push(t);
  }
  return { ...m, txs };
}

function Select<T extends string>({ label, value, options, onChange, testId }: { label: string; value: NoInfer<T>; options: readonly { value: T; label: string }[]; onChange(v: NoInfer<T>): void; testId: string }) {
  const id = useId();
  return (
    <label htmlFor={id} className="flex min-w-0 flex-col gap-1 text-sm font-bold">
      {label}
      <select id={id} data-testid={testId} value={value} onChange={(e) => onChange(e.target.value as T)} className="min-h-11 w-full min-w-0 rounded-control border-2 border-edge-deep bg-surface px-2 text-base">
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  );
}

export function PlayPanel({ reduced, seed }: { reduced: boolean; seed?: number }) {
  const [month, setMonth] = useState<Month>(EXAMPLES[0].month);
  const [preset, setPreset] = useState<string>(EXAMPLES[0].id);
  const [draw, setDraw] = useState(seed ?? 1);
  const [done, setDone] = useState(0);
  const [picked, setPicked] = useState<BookId[]>([]);
  const [said, setSaid] = useState<{ right: boolean; text: string } | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const records = useMemo(() => recordsOf(month), [month]);
  const walk = useMemo(() => walkOf(month, records), [month, records]);
  const n = records.length;
  const playback = usePlayback(walk.length, { story: records, stepMs: reduced ? 1000 : 2600, start: n, floor: n });
  const sorting = done < n;
  const shown = sorting ? done : Math.max(n, playback.shown);
  const now = !sorting && shown > n ? walk[shown - 1] : null;

  const load = (m: Month, id: string) => {
    setMonth(m);
    setPreset(id);
    setDone(0);
    setPicked([]);
    setSaid(null);
    setProblem(null);
  };
  const fresh = () => {
    const k = seed ? draw + 1 : Date.now() % 1_000_000_007;
    setDraw(k);
    load(randomMonth(createRng(k)), '');
  };
  const change = (next: Month, keepDone = true) => {
    const why = problemOf(next);
    if (why) {
      setProblem(why);
      return false;
    }
    setProblem(null);
    setMonth(next);
    setPreset('');
    if (!keepDone) setDone(0);
    return true;
  };
  const setGst = (g: GstSetting) => change(rebalance({ ...month, gst: g }));

  const pick = (b: BookId) => {
    const r = records[done];
    if (!r) return;
    if (r.books.includes(b)) {
      const now = picked.includes(b) ? picked : [...picked, b];
      if (r.books.every((x) => now.includes(x))) {
        setDone(done + 1);
        setPicked([]);
        setSaid({ right: true, text: `Right. ${r.why}` });
      } else {
        setPicked(now);
        setSaid({ right: true, text: `Right: the ${BOOK_NAME[b]} takes part of it. Which other book takes the rest?` });
      }
    } else {
      setSaid({ right: false, text: `Not the ${BOOK_NAME[b]}. ${r.traps[b] ?? `It takes: ${BOOK_TAKES[b].toLowerCase()}.`}` });
    }
  };

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
        <Toggle options={EXAMPLES.map((e) => ({ value: e.id, label: e.title }))} value={preset} onChange={(v) => load(EXAMPLES.find((e) => e.id === v)!.month, v)} label="Ready months" prefix={`${P}-preset`} small />
        <Button variant="secondary" data-testid={`${P}-new`} onClick={fresh}>
          New figures
        </Button>
      </div>
      <fieldset className="flex min-w-0 flex-col gap-3 rounded-card border border-edge bg-surface p-3 shadow-card">
        <legend className="px-1 text-sm font-extrabold">The month: {month.firm}, dealing in {month.goods}, {month.month} {month.year}</legend>
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm font-bold">GST</span>
          <Toggle
            options={GST_CHOICES}
            value={gstChoice(month.gst)}
            onChange={(v) => setGst(v === 'none' ? { rate: 0, intra: true } : { rate: month.gst.rate || 18, intra: v === 'intra' })}
            label="GST"
            prefix={`${P}-gst`}
            small
          />
          {month.gst.rate ? (
            <Toggle
              options={[
                { value: '5', label: '5%' },
                { value: '18', label: '18%' },
              ]}
              value={String(month.gst.rate) as '5' | '18'}
              onChange={(v) => setGst({ ...month.gst, rate: Number(v) as 5 | 18 })}
              label="GST rate"
              prefix={`${P}-rate`}
              small
            />
          ) : null}
        </div>
        <AddForm month={month} onAdd={(t) => change(insertTx(month, t))} onRemove={() => change({ ...month, txs: month.txs.slice(0, -1) }) && setDone(Math.min(done, month.txs.length - 1))} />
        {problem ? (
          <p role="alert" data-testid={`${P}-problem`} className="rounded-control bg-danger-soft px-3 py-2 text-sm font-semibold text-danger-deep">
            {problem} Nothing was changed.
          </p>
        ) : null}
      </fieldset>

      <div className="flex flex-wrap items-center gap-2">
        {sorting ? (
          <Button variant="secondary" data-testid={`${P}-sort-all`} onClick={() => { setDone(n); setPicked([]); setSaid(null); }}>
            Sort the rest for me
          </Button>
        ) : null}
        <Button variant="secondary" data-testid={`${P}-restart`} onClick={() => { setDone(0); setPicked([]); setSaid(null); }} disabled={done === 0}>
          Start the sorting again
        </Button>
        <span data-testid={`${P}-sorted`} className="text-sm font-bold text-muted">
          Sorted {done} of {n}
        </span>
      </div>
      <div role="status" aria-live="polite" data-testid={`${P}-feedback`} data-correct={said ? String(said.right) : undefined}>
        {said ? <p className={`rounded-control px-3 py-2 text-sm font-semibold ${said.right ? 'bg-primary-soft text-primary-ink' : 'bg-danger-soft text-danger-deep'}`}>{said.right ? '✓ ' : '✗ '}{said.text}</p> : null}
      </div>
      {!sorting ? (
        <div className="flex flex-col gap-2">
          <p className="text-sm font-bold">The tray is empty. Now the month end: balance the Cash Book and post each book.</p>
          <PlaybackBar playback={playback} prefix={`${P}-end`} announce={now ? `${now.title}. ${now.text}` : ''} />
          <StepNow prefix={`${P}-end`} at={shown} count={playback.count} title={now?.title} idle="Press Play or Step for the month end.">
            {now?.text}
          </StepNow>
        </div>
      ) : null}
      <Stage prefix={P} label="The books" playback={sorting ? undefined : playback} shown={shown}>
        <BooksPicture m={month} records={records} walk={walk} shown={shown} reduced={reduced} picking={sorting ? { picked, onPick: pick } : undefined} />
      </Stage>
    </div>
  );
}

/** A new transaction goes after the last one (before a reimbursement on the last day), the day after it. */
function insertTx(m: Month, t: Tx): Month {
  const tail = m.txs.at(-1)?.kind === 'reimburse' ? 1 : 0;
  const body = m.txs.slice(0, m.txs.length - tail);
  const lastDay = body.at(-1)?.day ?? 0;
  const day = Math.min(lastDay + 1, m.lastDay - tail);
  return { ...m, txs: [...body, { ...t, day } as Tx, ...m.txs.slice(m.txs.length - tail)] };
}

function AddForm({ month, onAdd, onRemove }: { month: Month; onAdd(t: Tx): void; onRemove(): void }) {
  const [kind, setKind] = useState<AddKind>('creditPurchase');
  const [amount, setAmount] = useState<Paise>(rupees(10000));
  const [mode, setMode] = useState<Mode>('bank');
  const [party, setParty] = useState('');
  const [head, setHead] = useState<PettyHead>('postage');
  const spec = ADD_KINDS.find((k) => k.value === kind)!;
  const parties = spec.party ? partiesOf(month, spec.party) : [];
  const who = parties.includes(party) ? party : (parties[0] ?? '');
  const add = () => {
    const recs = recordsOf(month);
    const owed = (p: string, customer: boolean) => partyBalance(month, recs, customer ? debtor(p) : creditor(p));
    const no = month.txs.length + 101;
    const t: Omit<Tx, 'day'> | null = (() => {
      switch (kind) {
        case 'creditPurchase':
        case 'creditSale':
        case 'purchaseReturn':
        case 'salesReturn':
          return { kind, party: who, list: amount, td: 0, no };
        case 'cashSale':
        case 'cashPurchase':
          return { kind, amount, mode };
        case 'received':
        case 'paid':
          return { kind, party: who, amount, mode };
        case 'receivedDisc':
        case 'paidDisc': {
          const due = owed(who, kind === 'receivedDisc');
          return { kind: kind === 'receivedDisc' ? 'received' : 'paid', party: who, amount: due - amount, mode, due };
        }
        case 'deposit':
        case 'withdraw':
        case 'goodsDrawings':
          return { kind, amount };
        case 'drawings':
          return { kind, amount, mode };
        case 'expense':
          return { kind, expense: 'rent' as ExpenseId, amount, mode };
        case 'assetCredit':
          return { kind, asset: 'furniture' as AssetId, party: who, amount };
        case 'assetPaid':
          return { kind, asset: 'computers' as AssetId, amount, mode: 'bank' as Mode };
        case 'badDebt':
          return { kind, party: who, amount: owed(who, true) };
        case 'petty':
          return { kind, head, what: `${HEAD_NAME[head].toLowerCase()}`, amount };
      }
    })();
    if (t) onAdd(t as Tx);
  };
  return (
    <div className="flex flex-col gap-2">
      <p className="text-sm font-bold">Add a transaction (dated the day after the last one)</p>
      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
        <Select label="What happened" value={kind} options={ADD_KINDS} onChange={setKind} testId={`${P}-add-kind`} />
        {spec.party ? <Select label={spec.party === 'supplier' ? 'Supplier' : 'Customer'} value={who} options={parties.map((p) => ({ value: p, label: p }))} onChange={setParty} testId={`${P}-add-party`} /> : null}
        {kind === 'petty' ? <Select label="Head" value={head} options={PETTY_HEADS.map((h) => ({ value: h, label: HEAD_NAME[h] }))} onChange={setHead} testId={`${P}-add-head`} /> : null}
        {kind !== 'badDebt' ? <MoneyField label={spec.amount} value={amount} onChange={setAmount} min={1} max={1000000} testId={`${P}-add-amount`} /> : <p className="self-end pb-2 text-sm text-muted">The whole of what is owed is written off.</p>}
        {spec.mode ? (
          <div className="flex flex-col gap-1 text-sm font-bold">
            Paid or received
            <Toggle
              options={[
                { value: 'cash', label: 'In cash' },
                { value: 'bank', label: 'By cheque' },
              ]}
              value={mode}
              onChange={setMode}
              label="Cash or cheque"
              prefix={`${P}-add-mode`}
              small
            />
          </div>
        ) : null}
      </div>
      <p className="text-xs text-muted">
        {kind === 'expense' ? `Pays ${EXPENSE_NAME.rent}. ` : ''}
        {kind === 'assetCredit' ? `${ASSET_WORDS.furniture}, from the supplier chosen. ` : ''}
        {kind === 'receivedDisc' || kind === 'paidDisc' ? `What is owed now, less the discount, is the money that moves: ${who ? inr(Math.max(0, partyBalance(month, recordsOf(month), kind === 'receivedDisc' ? debtor(who) : creditor(who)))) : '₹0'} is owed. ` : ''}
        {month.gst.rate && ['creditPurchase', 'creditSale', 'purchaseReturn', 'salesReturn', 'cashSale', 'cashPurchase', 'assetCredit', 'assetPaid'].includes(kind) ? 'GST is added at the rate chosen. ' : ''}
      </p>
      <div className="flex flex-wrap gap-2">
        <Button data-testid={`${P}-add`} onClick={add}>
          Add it
        </Button>
        <Button variant="secondary" data-testid={`${P}-remove`} onClick={onRemove} disabled={month.txs.length === 0}>
          Remove the last
        </Button>
      </div>
    </div>
  );
}
