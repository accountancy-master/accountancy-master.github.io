'use client';

import { useMemo, useState } from 'react';
import { Button } from '@/components/ui/Button';
import { formatINR, rupees, type Paise } from '@/engine/money';
import { newBusiness, READY } from '@/simulator/final-accounts/examples';
import {
  adjKey,
  adjustmentTitle,
  boughtOn,
  clampAdjustment,
  finalAccounts,
  fullState,
  limitOf,
  type Adjustment,
  type Business,
  type Statements,
} from '@/simulator/final-accounts/model';
import { changeWords } from '@/simulator/final-accounts/walk';
import { Toggle } from '../kit/LabControls';
import { Stage } from '../kit/Playback';
import { Board, T, type AdjustmentCard } from './Board';

// ---------------------------------------------------------------------------------------------------------------
// Play: a sandbox. Pick a business (three ready ones, or new figures from a seed), switch each adjustment on or off
// and change its amount, rate or months; the statements follow at once, and what an adjustment adds flies in.
// ---------------------------------------------------------------------------------------------------------------

const tid = (key: string) => key.replace(/:/g, '-');

interface Setup {
  business: Business;
  /** The figures of every adjustment, as last set. */
  values: Record<string, Adjustment>;
  /** Which adjustments are made. */
  made: Record<string, boolean>;
}

const setupOf = (business: Business): Setup => ({
  business,
  values: Object.fromEntries(business.adjustments.map((a) => [adjKey(a), a])),
  // The final accounts as the trial balance and the closing stock give them; the student makes the rest.
  made: Object.fromEntries(business.adjustments.map((a) => [adjKey(a), a.type === 'closingStock'])),
});

const madeOf = (s: Setup): Adjustment[] => s.business.adjustments.map((a) => adjKey(a)).filter((k) => s.made[k]).map((k) => s.values[k]);

export function PlayPanel({ reduced, seed }: { reduced: boolean; seed?: number }) {
  const [setup, setSetup] = useState<Setup>(() => setupOf(READY[0]));
  const [previous, setPrevious] = useState<Setup | null>(null);
  // The seed of the next new figures: the address's, or one picked when first asked for.
  const [nextSeed, setNextSeed] = useState<number | null>(seed ?? null);
  const { business } = setup;

  const state = useMemo(() => fullState(business, madeOf(setup)), [business, setup]);
  const statements = useMemo(() => finalAccounts(business, state), [business, state]);
  const before: Statements | null = useMemo(
    () => (previous && previous.business === business ? finalAccounts(business, fullState(business, madeOf(previous))) : null),
    [previous, business],
  );
  const said = before ? changeWords(before, statements) : [];

  const change = (next: Setup) => {
    setPrevious(setup);
    setSetup(next);
  };
  const pick = (b: Business) => {
    setPrevious(null);
    setSetup(setupOf(b));
  };
  const toggle = (key: string) => change({ ...setup, made: { ...setup.made, [key]: !setup.made[key] } });
  const setValue = (a: Adjustment) => change({ ...setup, values: { ...setup.values, [adjKey(a)]: clampAdjustment(business, a) } });
  const all = (on: boolean) => change({ ...setup, made: Object.fromEntries(Object.keys(setup.made).map((k) => [k, on || setup.values[k].type === 'closingStock' ? true : false])) });

  const cards: AdjustmentCard[] = business.adjustments.map((a0) => {
    const key = adjKey(a0);
    const a = setup.values[key];
    return {
      adjustment: a,
      made: setup.made[key],
      controls: <Controls a={a} made={setup.made[key]} limit={limitOf(business, a)} onToggle={() => toggle(key)} onChange={setValue} />,
    };
  });

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-2">
        <div className="flex flex-wrap items-end gap-2">
          <Toggle options={READY.map((b) => ({ value: b.id, label: b.name }))} value={business.id} onChange={(id) => pick(READY.find((b) => b.id === id)!)} label="Choose a business" prefix={`${T}-play-example`} small showLabel />
          <Button
            variant="secondary"
            data-testid={`${T}-play-new`}
            onClick={() => {
              const s = nextSeed ?? 1 + Math.floor(Math.random() * 1_000_000);
              pick(newBusiness(s));
              setNextSeed(s + 1);
            }}
          >
            New figures
          </Button>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" data-testid={`${T}-play-all`} onClick={() => all(true)}>
            Make every adjustment
          </Button>
          <Button variant="ghost" data-testid={`${T}-play-none`} onClick={() => all(false)}>
            Undo them all
          </Button>
        </div>
        <p data-testid={`${T}-play-business`} className="text-sm text-muted">
          {business.name}, {business.trade}. Switch an adjustment on and watch its two effects land; change a figure and see the profit and the Balance Sheet follow.
        </p>
      </div>

      <Stage prefix={T} label="The picture">
        <Board business={business} state={state} statements={statements} before={before} cards={cards} reduced={reduced} speed={1} />
      </Stage>

      <p role="status" aria-live="polite" data-testid={`${T}-play-said`} className="text-sm font-semibold">
        {said.length > 0 ? `${said.map((x) => x.charAt(0).toUpperCase() + x.slice(1)).join('. ')}. ` : ''}
        {statements.bs.closed ? `The Balance Sheet ${statements.bs.liabilities.total === statements.bs.assets.total ? 'agrees' : 'does not agree'} at ${formatINR(statements.bs.assets.total)}.` : ''}
      </p>
    </div>
  );
}

/** The months an asset is depreciated for: the whole year, or from a purchase on 1 July, 1 October or 1 January. */
const MONTHS = [12, 9, 6, 3];

/** The switch and the figures of one adjustment. */
function Controls({ a, made, limit, onToggle, onChange }: { a: Adjustment; made: boolean; limit: Paise; onToggle(): void; onChange(a: Adjustment): void }) {
  const key = tid(adjKey(a));
  const money = (label: string, value: Paise, set: (p: Paise) => void, suffix = 'amount', max = limit) => (
    <label className="flex min-w-0 flex-col gap-0.5 text-xs font-bold">
      {label}
      <input
        type="number"
        inputMode="numeric"
        min={0}
        max={max / 100}
        step={100}
        value={value / 100}
        data-testid={`${T}-input-${key}-${suffix}`}
        onChange={(e) => {
          const n = Number(e.target.value);
          if (Number.isFinite(n)) set(rupees(n));
        }}
        className="min-h-11 w-full rounded-control border border-edge-deep bg-surface px-2 text-base tabular-nums"
      />
    </label>
  );
  const rate = (value: number, set: (r: number) => void, label = 'Rate (% p.a.)') => (
    <label className="flex min-w-0 flex-col gap-0.5 text-xs font-bold">
      {label}
      <input
        type="number"
        inputMode="decimal"
        min={0}
        max={100}
        step={1}
        value={value}
        data-testid={`${T}-input-${key}-rate`}
        onChange={(e) => {
          const n = Number(e.target.value);
          if (Number.isFinite(n)) set(n);
        }}
        className="min-h-11 w-full rounded-control border border-edge-deep bg-surface px-2 text-base tabular-nums"
      />
    </label>
  );
  const months = (value: number, set: (m: number) => void, label: string) => (
    <label className="flex min-w-0 flex-col gap-0.5 text-xs font-bold">
      {label}
      <select value={value} data-testid={`${T}-input-${key}-months`} onChange={(e) => set(Number(e.target.value))} className="min-h-11 w-full rounded-control border border-edge-deep bg-surface px-2 text-base">
        {MONTHS.map((m) => (
          <option key={m} value={m}>
            {m === 12 ? '12 months (held all year)' : `${m} months (bought ${boughtOn(m)})`}
          </option>
        ))}
      </select>
    </label>
  );

  let fields;
  switch (a.type) {
    case 'depreciation':
      fields = (
        <>
          {rate(a.rate, (r) => onChange({ ...a, rate: r }))}
          {months(a.months, (m) => onChange({ ...a, months: m }), 'Months in use')}
        </>
      );
      break;
    case 'badDebts':
      fields = (
        <>
          {money('Further bad debts (₹)', a.further, (p) => onChange({ ...a, further: p }), 'further')}
          {rate(a.rate, (r) => onChange({ ...a, rate: r }), 'Provision (% of debtors)')}
        </>
      );
      break;
    case 'discount':
      fields = rate(a.rate, (r) => onChange({ ...a, rate: r }), 'Rate (% of debtors)');
      break;
    case 'interestOnCapital':
      fields = rate(a.rate, (r) => onChange({ ...a, rate: r }));
      break;
    case 'commission':
      fields = (
        <>
          {rate(a.rate, (r) => onChange({ ...a, rate: r }), 'Rate (% of net profit)')}
          <label className="flex min-w-0 flex-col gap-0.5 text-xs font-bold">
            Of the net profit
            <select
              value={a.basis}
              data-testid={`${T}-input-${key}-basis`}
              onChange={(e) => onChange({ ...a, basis: e.target.value === 'before' ? 'before' : 'after' })}
              className="min-h-11 w-full rounded-control border border-edge-deep bg-surface px-2 text-base"
            >
              <option value="before">before charging it</option>
              <option value="after">after charging it</option>
            </select>
          </label>
        </>
      );
      break;
    case 'abnormalLoss':
      fields = (
        <>
          {money(`Cost of goods lost (₹), up to ${formatINR(limit)}`, a.amount, (p) => onChange({ ...a, amount: p, claim: Math.min(a.claim, p) }))}
          {money('Insurance claim admitted (₹)', a.claim, (p) => onChange({ ...a, claim: p }), 'claim', a.amount)}
        </>
      );
      break;
    default:
      fields = money(`Amount (₹)${limit < 1_00_00_000_00 ? `, up to ${formatINR(limit)}` : ''}`, a.amount, (p) => onChange({ ...a, amount: p }));
  }

  return (
    <div className="mt-2 flex flex-col gap-2">
      <label className="flex min-h-11 items-center gap-2 text-sm font-bold">
        <input type="checkbox" checked={made} onChange={onToggle} data-testid={`${T}-toggle-${key}`} className="h-5 w-5 accent-[var(--color-primary)]" />
        Make this adjustment: {adjustmentTitle(a).toLowerCase()}
      </label>
      <div className="grid grid-cols-2 gap-2">{fields}</div>
    </div>
  );
}
