'use client';

import { formatINR } from '@/engine/money';
import { ALLOT_MONTHS, CASES, caseOf, count, figures, type AssetKind, type CaseId, type DebInput, type Route } from '@/simulator/debentures/issue';
import { Toggle } from '../kit/LabControls';
import { MoneyField, NumberSlider } from '../kit/MoneyField';
import { P } from './Picture';

/** The sandbox: the route, the case and every term of the issue. */
export function Inputs({ input, onChange, problem }: { input: DebInput; onChange(next: DebInput): void; problem: string | null }) {
  const set = <K extends keyof DebInput>(key: K, value: DebInput[K]) => onChange({ ...input, [key]: value });
  const setCase = (id: CaseId) => {
    const c = CASES.find((x) => x.id === id)!;
    onChange({
      ...input,
      issueAt: c.issueAt,
      redeemAt: c.redeemAt,
      issuePct: c.issueAt === 'par' ? 0 : input.issuePct > 0 && (c.issueAt === 'premium' || input.issuePct <= 20) ? input.issuePct : c.issueAt === 'premium' ? 10 : 5,
      redPct: c.redeemAt === 'par' ? 0 : input.redPct > 0 ? input.redPct : 5,
    });
  };
  const setRoute = (route: Route) => {
    if (route === 'vendor') {
      // The price that a whole number of debentures settles: as many debentures as before, at their issue price.
      const issuePrice = figures({ ...input, route: 'cash' }).issuePrice;
      onChange({ ...input, route, vendor: { ...input.vendor, price: Math.max(1, input.n) * issuePrice } });
    } else if (route === 'collateral') {
      onChange({ ...input, route, issueAt: 'par', issuePct: 0, redeemAt: 'par', redPct: 0, loan: { ...input.loan, amount: input.loan.amount > 0 ? input.loan.amount : 100000000 } });
    } else onChange({ ...input, route });
  };
  const f = problem ? null : figures(input);
  return (
    <fieldset data-testid={`${P}-inputs`} className="flex min-w-0 flex-col gap-4 rounded-card border border-edge bg-surface p-3 shadow-card sm:p-4">
      <legend className="sr-only">The issue and its terms</legend>
      <div className="flex flex-col gap-2">
        <p className="text-sm font-bold">Issued</p>
        <Toggle<Route>
          options={[
            { value: 'cash', label: 'For cash' },
            { value: 'vendor', label: 'To a vendor' },
            { value: 'collateral', label: 'As collateral security' },
          ]}
          value={input.route}
          onChange={setRoute}
          label="How the debentures are issued"
          prefix={`${P}-in-route`}
          small
        />
      </div>
      {input.route !== 'collateral' ? (
        <div className="flex flex-col gap-2">
          <p className="text-sm font-bold">The case</p>
          <Toggle<CaseId> options={CASES.map((c) => ({ value: c.id, label: c.label }))} value={caseOf(input)} onChange={setCase} label="The case of issue and redemption" prefix={`${P}-in-case`} small />
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          <p className="text-sm font-bold">Recorded by</p>
          <Toggle
            options={[
              { value: 'note', label: 'First method: no entry, a note' },
              { value: 'suspense', label: 'Second method: Debenture Suspense A/c' },
            ]}
            value={input.loan.method}
            onChange={(m) => set('loan', { ...input.loan, method: m })}
            label="How the collateral debentures are recorded"
            prefix={`${P}-in-method`}
            small
          />
        </div>
      )}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {input.route === 'vendor' ? (
          <>
            <div className="flex flex-col gap-1 text-sm font-bold">
              <span>Asset bought from {input.vendor.name}</span>
              <Toggle<AssetKind>
                options={(['Machinery', 'Building', 'Furniture'] as const).map((a) => ({ value: a, label: a }))}
                value={input.vendor.asset}
                onChange={(a) => set('vendor', { ...input.vendor, asset: a })}
                label="Asset bought"
                prefix={`${P}-in-asset`}
                small
              />
            </div>
            <MoneyField label="Price, paid in debentures" value={input.vendor.price} onChange={(p) => set('vendor', { ...input.vendor, price: p })} min={100} max={100000000} testId={`${P}-in-price`} hint={f ? `${count(f.n)} debentures at ${formatINR(f.issuePrice)} each.` : undefined} />
          </>
        ) : (
          <NumberSlider label={input.route === 'collateral' ? 'Debentures given as security' : 'Number of debentures'} value={input.n} onChange={(n) => set('n', n)} min={100} max={50000} step={100} unit="debentures" testId={`${P}-in-n`} />
        )}
        <div className="flex flex-col gap-1 text-sm font-bold">
          <span>Face value</span>
          <Toggle options={[100, 500, 1000].map((v) => ({ value: String(v), label: `₹${v.toLocaleString('en-IN')}` }))} value={String(input.face)} onChange={(v) => set('face', Number(v))} label="Face value" prefix={`${P}-in-face`} small />
        </div>
        <NumberSlider label="Rate of interest on the debentures" value={input.rate} onChange={(n) => set('rate', n)} min={1} max={20} unit="% a year" testId={`${P}-in-rate`} />
        {input.route !== 'collateral' && input.issueAt !== 'par' ? (
          <NumberSlider label={input.issueAt === 'premium' ? 'Premium on issue' : 'Discount on issue'} value={input.issuePct} onChange={(n) => set('issuePct', n)} min={1} max={input.issueAt === 'premium' ? 50 : 20} unit="% of the face value" testId={`${P}-in-issue-pct`} />
        ) : null}
        {input.route !== 'collateral' && input.redeemAt === 'premium' ? (
          <NumberSlider label="Premium on redemption" value={input.redPct} onChange={(n) => set('redPct', n)} min={1} max={20} unit="% of the face value" testId={`${P}-in-red-pct`} />
        ) : null}
        <NumberSlider label={input.route === 'collateral' ? 'Loan repayable after' : 'Redeemable after'} value={input.years} onChange={(n) => set('years', n)} min={2} max={15} unit="years" testId={`${P}-in-years`} />
        {input.route !== 'collateral' ? (
          <MoneyField label="Securities Premium before the issue" value={input.spBefore} onChange={(p) => set('spBefore', p)} max={10000000} testId={`${P}-in-sp`} hint="Bears the loss on issue first, with any premium of this issue." />
        ) : (
          <>
            <MoneyField label="Loan from the bank" value={input.loan.amount} onChange={(p) => set('loan', { ...input.loan, amount: p })} min={1000} max={100000000} testId={`${P}-in-loan`} />
            <NumberSlider label="Rate of interest on the loan" value={input.loan.rate} onChange={(n) => set('loan', { ...input.loan, rate: n })} min={1} max={20} unit="% a year" testId={`${P}-in-loan-rate`} />
          </>
        )}
      </div>
      <div className="flex flex-col gap-2">
        <p className="text-sm font-bold">{input.route === 'collateral' ? 'Loan taken on' : 'Allotted on'} the 1st of (year ends 31 March {input.year + 1})</p>
        <Toggle options={ALLOT_MONTHS.map((m) => ({ value: m, label: m }))} value={input.month} onChange={(m) => set('month', m)} label="Month of allotment" prefix={`${P}-in-month`} small />
      </div>
      {problem ? (
        <p role="alert" data-testid={`${P}-problem`} className="rounded-control bg-danger-soft px-3 py-2 text-sm font-semibold text-danger-deep">
          {problem} The picture still shows the last figures that worked.
        </p>
      ) : null}
    </fieldset>
  );
}
