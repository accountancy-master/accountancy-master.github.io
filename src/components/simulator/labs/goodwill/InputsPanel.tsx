'use client';

import { useId, useState } from 'react';
import { Button } from '@/components/ui/Button';
import { formatINR, rupees, type Paise } from '@/engine/money';
import { adjustmentShort, GW_METHODS, METHOD_NAME, yearLabels, type AdjKind, type GwAdjustment, type GwInputs } from '@/simulator/goodwill/valuation';
import { Toggle } from '../kit/LabControls';
import { MoneyField, NumberSlider } from '../kit/MoneyField';

// The sandbox of the goodwill lab: every figure of the valuation, and the method.

const P = 'lab-goodwill-in';

/** An amount on a slider (a loss below nothing), with the figure beside it in the Indian grouping. */
export function RupeeSlider({ label, value, onChange, min, max, step, testId, loss }: { label: string; value: Paise; onChange(p: Paise): void; min: number; max: number; step: number; testId: string; loss?: boolean }) {
  const id = useId();
  const r = Math.round(value / 100);
  return (
    <div className="flex min-w-0 flex-col gap-1 text-sm font-bold">
      <label htmlFor={id} className="flex flex-wrap justify-between gap-x-2">
        <span>{label}</span>
        <span className={`tabular-nums ${loss && r < 0 ? 'text-danger-deep' : ''}`}>{loss && r < 0 ? `Loss ${formatINR(-value)}` : formatINR(value)}</span>
      </label>
      <input
        id={id}
        type="range"
        min={min}
        max={max}
        step={step}
        value={Math.max(min, Math.min(max, r))}
        data-testid={testId}
        aria-valuetext={loss && r < 0 ? `Loss of ${formatINR(-value)}` : formatINR(value)}
        onChange={(e) => onChange(rupees(Number(e.target.value)))}
        className="h-11 w-full min-w-0 accent-[var(--color-primary)]"
      />
    </div>
  );
}

const KINDS: { value: AdjKind; label: string }[] = [
  { value: 'abnormalLoss', label: 'Abnormal loss (fire)' },
  { value: 'abnormalGain', label: 'Abnormal gain (sale of land)' },
  { value: 'stockOver', label: 'Closing stock overvalued' },
  { value: 'stockUnder', label: 'Closing stock undervalued' },
  { value: 'omittedExpense', label: 'Rent left out of the books' },
  { value: 'repairsCapitalised', label: 'Repairs debited to Machinery' },
];

function Select<T extends string | number>({ label, value, options, onChange, testId }: { label: string; value: T; options: readonly { value: T; label: string }[]; onChange(v: T): void; testId: string }) {
  const id = useId();
  return (
    <label htmlFor={id} className="flex min-w-0 flex-col gap-1 text-sm font-bold">
      {label}
      <select
        id={id}
        data-testid={testId}
        value={String(value)}
        onChange={(e) => {
          const found = options.find((o) => String(o.value) === e.target.value);
          if (found) onChange(found.value);
        }}
        className="min-h-11 w-full min-w-0 rounded-control border-2 border-edge-deep bg-surface px-2 text-base"
      >
        {options.map((o) => (
          <option key={String(o.value)} value={String(o.value)}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  );
}

/** The same firm over `k` years: older years are added (a copy of the oldest) or dropped at the start. */
function withYears(i: GwInputs, k: number): GwInputs {
  const d = k - i.profits.length;
  if (d === 0) return i;
  const profits = d > 0 ? [...Array.from({ length: d }, () => i.profits[0]), ...i.profits] : i.profits.slice(-d);
  const adjustments = i.adjustments.map((a) => ({ ...a, year: a.year + d })).filter((a) => a.year >= 0);
  return { ...i, profits, adjustments, weights: Array.from({ length: k }, (_, n) => n + 1) };
}

export function InputsPanel({ inputs, onChange, problem }: { inputs: GwInputs; onChange(next: GwInputs): void; problem: string | null }) {
  const set = <K extends keyof GwInputs>(key: K, value: GwInputs[K]) => onChange({ ...inputs, [key]: value });
  const labels = yearLabels(inputs);
  const k = inputs.profits.length;
  const weighted = inputs.averaging === 'weighted';
  const [newKind, setNewKind] = useState<AdjKind>('abnormalLoss');
  const setAdj = (n: number, a: GwAdjustment) => set('adjustments', inputs.adjustments.map((x, i) => (i === n ? a : x)));
  const addAdj = () => {
    const year = newKind === 'repairsCapitalised' ? k - 1 : 0;
    set('adjustments', [...inputs.adjustments, { kind: newKind, year, amount: rupees(10000), ...(newKind === 'repairsCapitalised' ? { rate: 10 } : {}) }]);
  };
  const b = inputs.books;
  const setBooks = (key: keyof GwInputs['books'], p: Paise) => set('books', { ...b, [key]: p });

  return (
    <fieldset data-testid="lab-goodwill-inputs" className="flex min-w-0 flex-col gap-4 rounded-card border border-edge bg-surface p-3 shadow-card sm:p-4">
      <legend className="sr-only">The figures of the valuation</legend>

      <div className="flex flex-col gap-2">
        <p className="text-sm font-bold">The method</p>
        <Toggle options={GW_METHODS.map((m) => ({ value: m, label: METHOD_NAME[m] }))} value={inputs.method} onChange={(m) => set('method', m)} label="Method of valuing goodwill" prefix={`${P}-method`} small />
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <NumberSlider label="Years averaged" value={k} onChange={(n) => onChange(withYears(inputs, n))} min={3} max={5} unit="years" testId={`${P}-years`} />
        <div className="flex flex-col gap-2">
          <p className="text-sm font-bold">Average</p>
          <Toggle options={[{ value: 'simple', label: 'Simple' }, { value: 'weighted', label: 'Weighted' }]} value={inputs.averaging} onChange={(v) => set('averaging', v)} label="Simple or weighted average" prefix={`${P}-averaging`} small />
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {inputs.profits.map((p, n) => (
          <div key={labels[n]} className="flex min-w-0 flex-col gap-1 rounded-control border border-edge p-2">
            <RupeeSlider label={`Profit of ${labels[n]}`} value={p} onChange={(v) => set('profits', inputs.profits.map((x, i) => (i === n ? v : x)))} min={-200000} max={600000} step={5000} testId={`${P}-profit-${n}`} loss />
            {weighted ? (
              <NumberSlider label={`Weight of ${labels[n]}`} value={inputs.weights[n]} onChange={(w) => set('weights', inputs.weights.map((x, i) => (i === n ? w : x)))} min={1} max={6} unit="" testId={`${P}-weight-${n}`} />
            ) : null}
          </div>
        ))}
      </div>

      <div className="flex flex-col gap-2">
        <p className="text-sm font-bold">Corrections to the past profits</p>
        {inputs.adjustments.length === 0 ? <p className="text-sm text-muted">None: the profits are normal as they stand.</p> : null}
        {inputs.adjustments.map((a, n) => (
          <div key={n} data-testid={`${P}-adjustment`} className="grid items-end gap-2 rounded-control border border-edge p-2 sm:grid-cols-[2fr_1fr_1fr_auto]">
            <p className="text-sm font-bold sm:col-span-4">
              {n + 1}. {adjustmentShort(a)}
            </p>
            <Select
              label="Year"
              value={a.year}
              options={labels
                .map((l, i) => ({ value: i, label: l }))
                .filter((o) => (a.kind === 'repairsCapitalised' ? o.value === k - 1 : true))}
              onChange={(year) => setAdj(n, { ...a, year })}
              testId={`${P}-adjustment-year-${n}`}
            />
            <MoneyField label="Amount" value={a.amount} onChange={(amount) => setAdj(n, { ...a, amount })} min={1} max={1000000} testId={`${P}-adjustment-amount-${n}`} />
            {a.kind === 'repairsCapitalised' ? (
              <NumberSlider label="Depreciation" value={a.rate ?? 10} onChange={(rate) => setAdj(n, { ...a, rate })} min={0} max={50} unit="%" testId={`${P}-adjustment-rate-${n}`} />
            ) : (
              <span className="hidden sm:block" />
            )}
            <Button variant="secondary" data-testid={`${P}-adjustment-remove-${n}`} onClick={() => set('adjustments', inputs.adjustments.filter((_, i) => i !== n))}>
              Remove
            </Button>
          </div>
        ))}
        {inputs.adjustments.length < 4 ? (
          <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
            <Select<AdjKind> label="Add a correction" value={newKind} options={KINDS} onChange={setNewKind} testId={`${P}-adjustment-kind`} />
            <Button variant="secondary" data-testid={`${P}-adjustment-add`} onClick={addAdj}>
              Add
            </Button>
          </div>
        ) : null}
      </div>

      <MoneyField
        label="Partners' remuneration a year, in all"
        value={inputs.remuneration}
        onChange={(p) => set('remuneration', p)}
        max={1000000}
        testId={`${P}-remuneration`}
        hint="0 when the profits already allow for the partners' work."
      />

      <div className="flex flex-col gap-2">
        <p className="text-sm font-bold">The books on the valuation date (for the capital employed)</p>
        <div className="grid gap-3 sm:grid-cols-2">
          <RupeeSlider label="Assets used in the business" value={b.trade} onChange={(p) => setBooks('trade', p)} min={100000} max={3000000} step={10000} testId={`${P}-trade`} />
          <RupeeSlider label="Outside liabilities" value={b.outside} onChange={(p) => setBooks('outside', p)} min={0} max={1500000} step={10000} testId={`${P}-outside`} />
        </div>
        <div className="grid gap-3 sm:grid-cols-3">
          <MoneyField label="Goodwill in the books" value={b.goodwill} onChange={(p) => setBooks('goodwill', p)} max={2000000} testId={`${P}-goodwill-books`} />
          <MoneyField label="Non-trade investments" value={b.nonTrade} onChange={(p) => setBooks('nonTrade', p)} max={2000000} testId={`${P}-non-trade`} hint="Their income is not in the profits." />
          <MoneyField label="Deferred advertisement expenditure" value={b.fictitious} onChange={(p) => setBooks('fictitious', p)} max={2000000} testId={`${P}-fictitious`} />
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <NumberSlider label="Normal rate of return" value={inputs.rate} onChange={(r) => set('rate', r)} min={1} max={30} unit="%" testId={`${P}-rate`} />
        <NumberSlider label="Years' purchase" value={inputs.purchase} onChange={(n) => set('purchase', n)} min={0.5} max={6} step={0.5} unit="years" testId={`${P}-purchase`} />
      </div>

      {problem ? (
        <p role="alert" data-testid="lab-goodwill-problem" className="rounded-control bg-danger-soft px-3 py-2 text-sm font-semibold text-danger-deep">
          {problem} The picture still shows the last figures that worked.
        </p>
      ) : null}
    </fieldset>
  );
}
