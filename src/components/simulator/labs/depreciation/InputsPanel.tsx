'use client';

import { useId } from 'react';
import { ASSETS, MONTHS, yearLabel, type AssetKind, type DepInputs, type Schedule } from '@/simulator/depreciation/schedule';
import { MoneyField, NumberSlider } from '../kit/MoneyField';
import { Toggle } from '../kit/LabControls';

/** A labelled select of the sandbox, 44 px tall. */
function Pick<T extends string | number>({ label, value, options, onChange, testId }: { label: string; value: T; options: readonly { value: T; label: string }[]; onChange(v: T): void; testId: string }) {
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

const YEARS = Array.from({ length: 8 }, (_, k) => 2018 + k);

export function InputsPanel({ inputs, onChange, problem, s }: { inputs: DepInputs; onChange(next: DepInputs): void; problem: string | null; s: Schedule }) {
  const set = <K extends keyof DepInputs>(key: K, value: DepInputs[K]) => onChange({ ...inputs, [key]: value });
  const slmLife = inputs.method === 'slm' && inputs.slmBasis === 'life';
  const sale = inputs.sale;
  return (
    <fieldset data-testid="lab-depreciation-inputs" className="flex min-w-0 flex-col gap-4 rounded-card border border-edge bg-surface p-3 shadow-card sm:p-4">
      <legend className="sr-only">The asset and the choices</legend>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Pick label="The asset" value={inputs.asset} options={(Object.keys(ASSETS) as AssetKind[]).map((k) => ({ value: k, label: `${ASSETS[k].account}: ${ASSETS[k].item}` }))} onChange={(v) => set('asset', v)} testId="lab-depreciation-in-asset" />
        <Pick label="Bought on the 1st of" value={inputs.purchaseMonth} options={MONTHS.map((m, k) => ({ value: k, label: m }))} onChange={(v) => set('purchaseMonth', v)} testId="lab-depreciation-in-month" />
        <Pick label="In the accounting year" value={inputs.startYear} options={YEARS.map((y) => ({ value: y, label: yearLabel(y) }))} onChange={(v) => set('startYear', v)} testId="lab-depreciation-in-year" />
        <p className="self-end pb-2 text-sm text-muted">
          Bought on <strong className="text-ink">{s.purchaseDate}</strong>
        </p>
        <MoneyField label="Purchase price" value={inputs.price} onChange={(p) => set('price', p)} min={1000} max={10000000} testId="lab-depreciation-in-price" />
        <MoneyField label={`Spent on ${ASSETS[inputs.asset].extra}`} value={inputs.extra} onChange={(p) => set('extra', p)} max={1000000} testId="lab-depreciation-in-extra" hint="Part of the cost: it makes the asset ready for use." />
      </div>

      <div className="flex flex-col gap-2">
        <p className="text-sm font-bold">Method</p>
        <Toggle options={[{ value: 'slm', label: 'Straight line' }, { value: 'wdv', label: 'Written down value' }]} value={inputs.method} onChange={(v) => set('method', v)} label="Method" prefix="lab-depreciation-in-method" />
        {inputs.method === 'slm' ? (
          <Toggle options={[{ value: 'life', label: 'By life and scrap value' }, { value: 'rate', label: 'By a rate on cost' }]} value={inputs.slmBasis} onChange={(v) => set('slmBasis', v)} label="How the straight line charge is given" prefix="lab-depreciation-in-basis" small />
        ) : null}
      </div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {slmLife ? (
          <>
            <NumberSlider label="Useful life" value={inputs.life} onChange={(n) => set('life', n)} min={1} max={20} unit="years" testId="lab-depreciation-in-life" />
            <MoneyField label="Scrap value" value={inputs.scrap} onChange={(p) => set('scrap', p)} max={10000000} testId="lab-depreciation-in-scrap" />
          </>
        ) : null}
        <NumberSlider label={slmLife ? 'Rate of the written down value line' : 'Rate'} value={inputs.rate} onChange={(n) => set('rate', n)} min={1} max={50} unit="% a year" testId="lab-depreciation-in-rate" />
      </div>

      <div className="flex flex-col gap-2">
        <p className="text-sm font-bold">Where the depreciation is credited</p>
        <Toggle
          options={[{ value: 'asset', label: 'To the asset account' }, { value: 'provision', label: 'To a Provision for Depreciation A/c' }]}
          value={inputs.provision ? 'provision' : 'asset'}
          onChange={(v) => set('provision', v === 'provision')}
          label="Where the depreciation is credited"
          prefix="lab-depreciation-in-record"
          small
        />
      </div>

      <div className="flex flex-col gap-2">
        <p className="text-sm font-bold">Sale</p>
        <Toggle
          options={[{ value: 'keep', label: 'Keep it' }, { value: 'sell', label: 'Sell it' }]}
          value={sale ? 'sell' : 'keep'}
          onChange={(v) => set('sale', v === 'sell' ? { year: Math.min(2, inputs.years - 1 || 1), month: 6, price: Math.max(100, Math.round(s.rows[Math.min(1, s.rows.length - 1)].closing / 100000) * 100000) } : null)}
          label="Keep or sell the asset"
          prefix="lab-depreciation-in-sale"
          small
        />
        {sale ? (
          <div className="grid gap-3 sm:grid-cols-3">
            <Pick label="Sold in the year" value={sale.year} options={Array.from({ length: 10 }, (_, k) => ({ value: k, label: yearLabel(inputs.startYear + k) }))} onChange={(v) => set('sale', { ...sale, year: v })} testId="lab-depreciation-in-sale-year" />
            <Pick label="On the 1st of" value={sale.month} options={MONTHS.slice(1).map((m, k) => ({ value: k + 1, label: m }))} onChange={(v) => set('sale', { ...sale, month: v })} testId="lab-depreciation-in-sale-month" />
            <MoneyField label="Selling price" value={sale.price} onChange={(p) => set('sale', { ...sale, price: p })} min={1} max={10000000} testId="lab-depreciation-in-sale-price" />
          </div>
        ) : (
          <NumberSlider label="Years to follow" value={inputs.years} onChange={(n) => set('years', n)} min={1} max={10} unit="years" testId="lab-depreciation-in-years" />
        )}
      </div>
      {problem ? (
        <p role="alert" data-testid="lab-depreciation-problem" className="rounded-control bg-danger-soft px-3 py-2 text-sm font-semibold text-danger-deep">
          {problem} The picture still shows the last figures that worked.
        </p>
      ) : null}
    </fieldset>
  );
}
