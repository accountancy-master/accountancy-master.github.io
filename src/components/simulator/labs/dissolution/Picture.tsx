'use client';

import { formatINR } from '@/engine/money';
import { visible, type Dissolution, type Row, type StepKind } from '@/simulator/dissolution/dissolve';
import { Arrive } from '../kit/Arrive';

// ---------------------------------------------------------------------------------------------------------------
// The picture of a dissolution: the balance sheet the firm starts from, whose items leave it one group at a time;
// Realisation A/c as two stacks, the debit and the credit, each block as tall as its amount, so that the heavier side
// shows at a glance and the profit or loss is the block that levels them; the partners' capital accounts as columns
// that rise and fall; and the bank, which fills with what is realised and empties to nothing at the last payment.
// Everything drawn is also said in text.
// ---------------------------------------------------------------------------------------------------------------

const P = 'lab-dissolution';
const inr = formatINR;
const pct = (part: number, whole: number) => (whole > 0 ? Math.max(0, Math.min(100, (part / whole) * 100)) : 0);

/** The step a kind of step was played at (or the number of steps when it never is). */
const stepOf = (d: Dissolution, kind: StepKind): number => {
  const i = d.steps.findIndex((s) => s.kind === kind);
  return i < 0 ? d.steps.length + 1 : i;
};

interface SheetItem {
  label: string;
  amount: number;
  /** The step at which it leaves the balance sheet, and where it goes. */
  leaves: number;
  to: string;
}

function sheetOf(d: Dissolution): { left: SheetItem[]; right: SheetItem[] } {
  const f = d.firm;
  const acc = stepOf(d, 'accumulated');
  const right: SheetItem[] = [
    ...f.liabilities.map((l) => ({ label: l.name, amount: l.book, leaves: stepOf(d, 'liabilities'), to: 'to Realisation A/c (credit)' })),
    ...(f.provision ? [{ label: 'Provision for doubtful debts', amount: f.provision, leaves: stepOf(d, 'liabilities'), to: 'to Realisation A/c (credit)' }] : []),
    ...f.partners.filter((p) => p.loan > 0).map((p) => ({ label: `${p.name}'s loan`, amount: p.loan, leaves: stepOf(d, 'loans'), to: 'repaid from the bank' })),
    ...(f.reserve ? [{ label: 'General Reserve', amount: f.reserve, leaves: acc, to: 'to the capital accounts' }] : []),
    ...(f.plCredit ? [{ label: 'Profit and Loss A/c', amount: f.plCredit, leaves: acc, to: 'to the capital accounts' }] : []),
    ...f.partners.map((p) => ({ label: `${p.name}'s capital`, amount: p.capital, leaves: stepOf(d, 'final'), to: 'settled' })),
  ];
  const left: SheetItem[] = [
    { label: 'Cash at bank', amount: d.bank, leaves: d.steps.length + 1, to: '' },
    ...f.assets.map((a) => ({ label: a.name, amount: a.book, leaves: stepOf(d, 'assets'), to: 'to Realisation A/c (debit)' })),
    ...(f.plDebit ? [{ label: 'Profit and Loss A/c (debit balance)', amount: f.plDebit, leaves: acc, to: 'to the capital accounts' }] : []),
  ];
  return { left, right };
}

function Sheet({ d, shown }: { d: Dissolution; shown: number }) {
  const { left, right } = sheetOf(d);
  const side = (title: string, items: SheetItem[], testId: string) => (
    <div className="flex min-w-0 flex-col gap-1">
      <p className="text-xs font-extrabold uppercase tracking-wide text-muted">{title}</p>
      <ul data-testid={testId} className="flex flex-col gap-0.5 text-sm">
        {items.map((it) => {
          const gone = it.leaves < shown;
          return (
            // An item that has gone is struck through, in muted words with a dashed outline: never faded, so that it
            // can still be read.
            <li key={it.label} data-gone={gone ? 'true' : 'false'} className={`flex flex-col rounded border px-1.5 py-0.5 ${gone ? 'border-dashed border-edge-deep text-muted' : 'border-transparent bg-sunken'}`}>
              <span className="flex justify-between gap-2">
                <span className={gone ? 'line-through' : ''}>{it.label}</span>
                <span className={`tabular-nums ${gone ? 'line-through' : ''}`}>{inr(it.amount)}</span>
              </span>
              {gone ? <span className="text-xs text-muted">→ {it.to}</span> : null}
            </li>
          );
        })}
      </ul>
    </div>
  );
  return (
    <section aria-labelledby="dis-sheet-title" data-testid={`${P}-sheet`} className="flex min-w-0 flex-col gap-2 rounded-card border border-edge bg-surface p-3 shadow-card">
      <h3 id="dis-sheet-title" className="text-base font-extrabold">
        Balance sheet on {d.firm.date}
      </h3>
      <div className="grid gap-3 sm:grid-cols-2">
        {side('Liabilities', right, `${P}-sheet-liabilities`)}
        {side('Assets', left, `${P}-sheet-assets`)}
      </div>
      <p className="text-xs text-muted">Cash at bank, {inr(d.bank)}, is the figure that makes the two sides agree. It stays in Bank A/c, which takes in and pays out the money.</p>
    </section>
  );
}

/** The colour of a block of Realisation A/c, by what it is (the particulars say). */
function blockClass(r: Row, side: 'dr' | 'cr'): string {
  const p = r.particulars;
  if (/\((profit|loss)\)$/.test(p)) return 'sim-deduction';
  if (/Capital A\/c/.test(p)) return 'bg-hue-violet/75';
  if (/Bank A\/c/.test(p)) return side === 'dr' ? 'bg-hue-rose/75' : 'bg-hue-green/75';
  return side === 'dr' ? 'bg-hue-blue/75' : 'bg-hue-amber/75';
}

function Stack({ rows, scale, shown, side, reduced }: { rows: Row[]; scale: number; shown: number; side: 'dr' | 'cr'; reduced: boolean }) {
  const on = visible(rows, shown);
  return (
    <div aria-hidden="true" className="flex h-full min-w-0 flex-1 flex-col-reverse overflow-hidden rounded-control border border-edge bg-sunken">
      {on.map((r, i) => (
        <Arrive
          key={`${r.particulars}-${i}`}
          reduced={reduced}
          from={side === 'dr' ? 'translateX(-3rem)' : 'translateX(3rem)'}
          ms={600 + (i % 4) * 120}
          className={`relative block shrink-0 overflow-hidden border-t border-white/70 ${blockClass(r, side)} ${r.step === shown - 1 ? 'ring-2 ring-inset ring-ink' : ''}`}
          style={{ height: `${pct(r.amount, scale)}%` }}
        >
          {/* The words sit on a chip of the card's colour, so that they read on every tone of the blocks, in both themes. */}
          {pct(r.amount, scale) > 9 ? <span className="absolute left-1 top-0.5 max-w-[calc(100%-0.5rem)] truncate rounded bg-surface/85 px-1 text-[11px] font-bold text-ink">{r.particulars.replace(/^(To|By) /, '')}</span> : null}
        </Arrive>
      ))}
    </div>
  );
}

function RealisationScale({ d, shown, reduced }: { d: Dissolution; shown: number; reduced: boolean }) {
  const R = d.realisation;
  const total = Math.max(R.dr.reduce((s, r) => s + r.amount, 0), 1);
  const dr = visible(R.dr, shown).reduce((s, r) => s + r.amount, 0);
  const cr = visible(R.cr, shown).reduce((s, r) => s + r.amount, 0);
  const resultAt = d.steps.findIndex((s) => s.kind === 'result');
  const closed = shown > resultAt;
  const diff = cr - dr;
  return (
    <section aria-labelledby="dis-real-title" data-testid={`${P}-scale`} className="flex min-w-0 flex-col gap-2 rounded-card border border-edge bg-surface p-3 shadow-card">
      <h3 id="dis-real-title" className="text-base font-extrabold">
        Realisation A/c
      </h3>
      <div role="img" aria-label={`Realisation A/c: debit side ${inr(dr)}, credit side ${inr(cr)}.`} className="flex h-64 gap-2">
        <Stack rows={R.dr} scale={total} shown={shown} side="dr" reduced={reduced} />
        <Stack rows={R.cr} scale={total} shown={shown} side="cr" reduced={reduced} />
      </div>
      <div className="grid grid-cols-2 gap-2 text-sm">
        <p>
          Dr. <strong data-testid={`${P}-real-dr`} className="tabular-nums">{inr(dr)}</strong>
        </p>
        <p className="text-right">
          Cr. <strong data-testid={`${P}-real-cr`} className="tabular-nums">{inr(cr)}</strong>
        </p>
      </div>
      <p data-testid={`${P}-result`} className={`rounded-control px-3 py-2 text-sm font-extrabold ${closed ? (d.result > 0 ? 'bg-primary-soft text-primary-ink' : d.result < 0 ? 'bg-danger-soft text-danger-deep' : 'bg-sunken') : 'bg-sunken'}`}>
        {closed
          ? d.result > 0
            ? `▲ Profit on realisation ${inr(d.result)}, shared in the profit-sharing ratio: both sides now ${inr(total)}.`
            : d.result < 0
              ? `▼ Loss on realisation ${inr(-d.result)}, shared in the profit-sharing ratio: both sides now ${inr(total)}.`
              : '= No profit and no loss on realisation.'
          : shown === 0
            ? 'Empty: nothing has been transferred yet.'
            : `So far the ${diff >= 0 ? 'credit' : 'debit'} side is heavier by ${inr(Math.abs(diff))}.`}
      </p>
      <ul className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted">
        <li className="flex items-center gap-1"><span aria-hidden="true" className="inline-block h-3 w-3 rounded-sm bg-hue-blue/75" />Assets at book value</li>
        <li className="flex items-center gap-1"><span aria-hidden="true" className="inline-block h-3 w-3 rounded-sm bg-hue-amber/75" />Liabilities transferred</li>
        <li className="flex items-center gap-1"><span aria-hidden="true" className="inline-block h-3 w-3 rounded-sm bg-hue-green/75" />Money received</li>
        <li className="flex items-center gap-1"><span aria-hidden="true" className="inline-block h-3 w-3 rounded-sm bg-hue-rose/75" />Money paid</li>
        <li className="flex items-center gap-1"><span aria-hidden="true" className="inline-block h-3 w-3 rounded-sm bg-hue-violet/75" />A partner&apos;s capital</li>
        <li className="flex items-center gap-1"><span aria-hidden="true" className="sim-deduction inline-block h-3 w-3 rounded-sm" />Profit or loss shared</li>
      </ul>
    </section>
  );
}

const capitalsAt = (d: Dissolution, shown: number): number[] => (shown > 0 ? d.steps[Math.min(shown, d.steps.length) - 1].capitals : d.firm.partners.map((p) => p.capital));
const bankAt = (d: Dissolution, shown: number): number => (shown > 0 ? d.steps[Math.min(shown, d.steps.length) - 1].bank : d.bank);

function Capitals({ d, shown, reduced }: { d: Dissolution; shown: number; reduced: boolean }) {
  const now = capitalsAt(d, shown);
  const before = shown > 0 ? capitalsAt(d, shown - 1) : now;
  const most = Math.max(...[d.firm.partners.map((p) => p.capital), ...d.steps.map((s) => s.capitals)].flat().map(Math.abs), 1);
  const low = Math.min(0, ...d.steps.map((s) => Math.min(...s.capitals)));
  const top = Math.max(...[d.firm.partners.map((p) => p.capital), ...d.steps.map((s) => s.capitals)].flat(), 1);
  const range = top - low || most;
  const zero = (top / range) * 100;
  return (
    <section aria-labelledby="dis-cap-title" data-testid={`${P}-capitals`} className="flex min-w-0 flex-col gap-2 rounded-card border border-edge bg-surface p-3 shadow-card">
      <h3 id="dis-cap-title" className="text-base font-extrabold text-hue-violet">
        Partners&apos; capital accounts
      </h3>
      <div aria-hidden="true" className="relative flex h-36 gap-3 rounded-control bg-sunken px-3">
        <div className="absolute inset-x-0 border-t-2 border-edge-deep" style={{ top: `${zero}%` }} />
        {d.firm.partners.map((p, i) => {
          const v = now[i];
          const h = Math.abs(v) / range;
          return (
            <div key={p.name} className="relative h-full min-w-0 flex-1">
              <div className={`absolute inset-x-1 top-0 h-full origin-top ${reduced ? '' : 'transition-transform duration-700 ease-out'}`} style={{ transform: `translateY(${v >= 0 ? zero - h * 100 : zero}%) scaleY(${h})` }}>
                <div className={`h-full w-full rounded-sm ${v >= 0 ? 'bg-hue-violet/70' : 'sim-deduction'}`} />
              </div>
            </div>
          );
        })}
      </div>
      <ul data-testid={`${P}-capital-balances`} className="grid gap-1 text-sm" style={{ gridTemplateColumns: `repeat(${d.firm.partners.length}, minmax(0, 1fr))` }}>
        {d.firm.partners.map((p, i) => {
          const change = now[i] - before[i];
          return (
            <li key={p.name} className="flex min-w-0 flex-col items-center text-center">
              <span className="font-bold">{p.name}</span>
              <span className={`font-extrabold tabular-nums ${now[i] < 0 ? 'text-danger-deep' : ''}`}>{now[i] < 0 ? `Dr ${inr(-now[i])}` : now[i] === 0 ? 'nil' : inr(now[i])}</span>
              {change !== 0 ? <span className={`whitespace-nowrap text-xs ${change > 0 ? 'text-primary-ink' : 'text-danger-deep'}`}>{change > 0 ? `▲ +${inr(change)}` : `▼ -${inr(-change)}`}</span> : null}
            </li>
          );
        })}
      </ul>
      <p className="text-xs text-muted">A credit balance is what the firm owes the partner; a debit balance (hatched) is what the partner owes the firm.</p>
    </section>
  );
}

function BankTank({ d, shown, reduced }: { d: Dissolution; shown: number; reduced: boolean }) {
  const now = bankAt(d, shown);
  const before = shown > 0 ? bankAt(d, shown - 1) : now;
  const most = Math.max(d.bank, ...d.steps.map((s) => s.bank), 1);
  const change = now - before;
  return (
    <section aria-labelledby="dis-bank-title" data-testid={`${P}-bank`} className="flex min-w-0 flex-col gap-2 rounded-card border border-edge bg-surface p-3 shadow-card">
      <h3 id="dis-bank-title" className="text-base font-extrabold text-hue-teal">
        Bank A/c
      </h3>
      <div aria-hidden="true" className="relative h-36 overflow-hidden rounded-control border-2 border-hue-teal/60 bg-sunken">
        <div className={`absolute inset-0 origin-bottom bg-hue-teal/60 ${reduced ? '' : 'transition-transform duration-700 ease-out'}`} style={{ transform: `scaleY(${pct(now, most) / 100})` }} />
      </div>
      <p className="flex flex-wrap items-baseline justify-between gap-x-2 text-sm">
        <span>Balance</span>
        <strong data-testid={`${P}-bank-balance`} className="tabular-nums">
          {now === 0 ? 'nil' : inr(now)}
        </strong>
      </p>
      {change !== 0 ? <p className={`text-xs ${change > 0 ? 'text-primary-ink' : 'text-danger-deep'}`}>{change > 0 ? `▲ ${inr(change)} came in` : `▼ ${inr(-change)} went out`}</p> : null}
    </section>
  );
}

export function DissolutionPicture({ d, shown, reduced }: { d: Dissolution; shown: number; reduced: boolean }) {
  return (
    <div data-testid={`${P}-picture`} className="grid items-start gap-3 lg:grid-cols-[minmax(0,5fr)_minmax(0,6fr)_minmax(0,4fr)]">
      <Sheet d={d} shown={shown} />
      <RealisationScale d={d} shown={shown} reduced={reduced} />
      <div className="grid min-w-0 gap-3 sm:grid-cols-2 lg:grid-cols-1">
        <Capitals d={d} shown={shown} reduced={reduced} />
        <BankTank d={d} shown={shown} reduced={reduced} />
      </div>
    </div>
  );
}
