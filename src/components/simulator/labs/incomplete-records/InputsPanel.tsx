'use client';

import { endOf, startOf, type Inputs } from '@/simulator/incomplete-records/model';
import { Toggle } from '../kit/LabControls';
import { MoneyField, NumberSlider } from '../kit/MoneyField';
import { P } from './Picture';

// The figures of the sandbox: every item on both dates, the drawings, the capital brought in and the adjustments.

export function InputsPanel({ i, onChange, problem }: { i: Inputs; onChange(next: Inputs): void; problem: string | null }) {
  const d = i.drawings;
  const a = i.adjustments;
  const setD = (next: Partial<Inputs['drawings']>) => onChange({ ...i, drawings: { ...d, ...next } });
  const setA = (next: Partial<Inputs['adjustments']>) => onChange({ ...i, adjustments: { ...a, ...next } });
  const fixed = i.items.find((x) => a.dep?.itemId === x.id) ?? i.items.find((x) => ['furniture', 'machinery', 'van'].includes(x.id));
  return (
    <fieldset data-testid={`${P}-inputs`} className="flex min-w-0 flex-col gap-4 rounded-card border border-edge bg-surface p-3 shadow-card sm:p-4">
      <legend className="px-1 text-sm font-extrabold">
        {i.shop}, kept by {i.owner}: the figures
      </legend>
      <div className="flex flex-col gap-2">
        <p className="text-sm font-bold">Assets and liabilities on each date (₹0 where an item is nil)</p>
        <div className="grid gap-x-4 gap-y-2 md:grid-cols-2">
          {i.items.map((x) => (
            <div key={x.id} className="grid grid-cols-2 gap-2 rounded-control border border-edge p-2">
              <p className="col-span-2 text-sm font-extrabold">
                {x.label} <span className="font-normal text-muted">({x.side === 'asset' ? 'asset' : 'liability'})</span>
              </p>
              {(['open', 'close'] as const).map((k) => (
                <MoneyField
                  key={k}
                  label={k === 'open' ? startOf(i) : endOf(i)}
                  value={x[k]}
                  max={10000000}
                  testId={`${P}-in-${x.id}-${k}`}
                  onChange={(p) => onChange({ ...i, items: i.items.map((y) => (y.id === x.id ? { ...y, [k]: p } : y)) })}
                />
              ))}
            </div>
          ))}
        </div>
      </div>
      <div className="flex flex-col gap-2">
        <p className="text-sm font-bold">Drawings</p>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <MoneyField label={d.salary ? 'Salary taken (drawings)' : 'Cash drawn'} value={d.cash} max={2000000} testId={`${P}-in-cash-drawn`} onChange={(p) => setD({ cash: p })} />
          <div className="flex flex-col gap-1 text-sm font-bold">
            Cash drawn is
            <Toggle
              options={[
                { value: 'month', label: 'a month' },
                { value: 'year', label: 'for the year' },
              ]}
              value={d.monthly ? 'month' : 'year'}
              onChange={(v) => setD({ monthly: v === 'month' })}
              label="Cash drawn a month or for the year"
              prefix={`${P}-in-monthly`}
              small
            />
          </div>
          <MoneyField label="Goods taken, at cost" value={d.goodsCost} max={500000} testId={`${P}-in-goods-cost`} onChange={(p) => setD({ goodsCost: p, goodsPrice: Math.max(d.goodsPrice, p) })} />
          <MoneyField label="Their sale price" value={d.goodsPrice} max={600000} testId={`${P}-in-goods-price`} onChange={(p) => setD({ goodsPrice: p })} hint="Told, but not used: goods are drawn at cost." />
          {d.bill ? <MoneyField label={d.bill.label} value={d.bill.amount} max={500000} testId={`${P}-in-bill`} onChange={(p) => setD({ bill: { ...d.bill!, amount: p } })} /> : null}
        </div>
      </div>
      <MoneyField
        label={i.additional?.label ?? 'Additional capital introduced'}
        value={i.additional?.amount ?? 0}
        max={5000000}
        testId={`${P}-in-additional`}
        onChange={(p) => onChange({ ...i, additional: p > 0 ? { label: i.additional?.label ?? 'Additional capital introduced during the year', amount: p } : null })}
        hint="₹0 for none."
      />
      <div className="flex flex-col gap-2">
        <p className="text-sm font-bold">Adjustments (the closing statement was drawn up before them; 0 for none)</p>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <NumberSlider label="Interest on capital" value={a.ioc} min={0} max={12} unit="% a year" testId={`${P}-in-ioc`} onChange={(n) => setA({ ioc: n })} />
          {fixed ? <NumberSlider label={`Depreciation on ${fixed.label.toLowerCase()}`} value={a.dep?.rate ?? 0} min={0} max={25} unit="%" testId={`${P}-in-dep`} onChange={(n) => setA({ dep: n > 0 ? { itemId: fixed.id, rate: n } : null })} /> : null}
          {i.items.some((x) => x.id === 'debtors') ? <NumberSlider label="Provision for doubtful debts" value={a.pdd} min={0} max={10} unit="% of debtors" testId={`${P}-in-pdd`} onChange={(n) => setA({ pdd: n })} /> : null}
          <MoneyField label={`${a.outstanding?.label ?? 'Salaries'} outstanding`} value={a.outstanding?.amount ?? 0} max={500000} testId={`${P}-in-outstanding`} onChange={(p) => setA({ outstanding: p > 0 ? { label: a.outstanding?.label ?? 'Salaries', amount: p } : null })} />
          <MoneyField label={`${a.prepaid?.label ?? 'Insurance'} paid in advance`} value={a.prepaid?.amount ?? 0} max={500000} testId={`${P}-in-prepaid`} onChange={(p) => setA({ prepaid: p > 0 ? { label: a.prepaid?.label ?? 'Insurance', amount: p } : null })} />
          <MoneyField label={`${a.accrued?.label ?? 'Commission'} earned, not received`} value={a.accrued?.amount ?? 0} max={500000} testId={`${P}-in-accrued`} onChange={(p) => setA({ accrued: p > 0 ? { label: a.accrued?.label ?? 'Commission', amount: p } : null })} />
        </div>
      </div>
      {problem ? (
        <p role="alert" data-testid={`${P}-problem`} className="rounded-control bg-danger-soft px-3 py-2 text-sm font-semibold text-danger-deep">
          {problem} The picture still shows the last figures that worked.
        </p>
      ) : null}
    </fieldset>
  );
}
