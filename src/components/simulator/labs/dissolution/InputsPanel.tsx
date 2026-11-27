'use client';

import { useId, type ReactNode } from 'react';
import { formatINR, type Paise } from '@/engine/money';
import { bankOf, EXPENSE_FORMS, EXPENSE_NAME, type AssetFate, type DAsset, type DFirm, type DLiability, type ExpenseForm, type Unrecorded } from '@/simulator/dissolution/dissolve';
import { MoneyField, NumberSlider } from '../kit/MoneyField';

// The sandbox of the dissolution lab: the balance sheet, and what happens to each item on dissolution.

const P = 'lab-dissolution-in';

function Select({ label, value, options, onChange, testId }: { label: string; value: string; options: readonly { value: string; label: string }[]; onChange(v: string): void; testId: string }) {
  const id = useId();
  return (
    <label htmlFor={id} className="flex min-w-0 flex-col gap-1 text-sm font-bold">
      {label}
      <select id={id} data-testid={testId} value={value} onChange={(e) => onChange(e.target.value)} className="min-h-11 w-full min-w-0 rounded-control border-2 border-edge-deep bg-surface px-2 text-base">
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  );
}

/** An asset's fate as one value of a select: "sold", "silent", "creditors" or "taken-1". */
const fateKey = (f: AssetFate): string => (f.kind === 'taken' ? `taken-${f.by}` : f.kind);

function Box({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="flex min-w-0 flex-col gap-2 rounded-control border border-edge p-2">
      <p className="text-sm font-extrabold">{title}</p>
      {children}
    </div>
  );
}

export function InputsPanel({ firm, onChange, problem }: { firm: DFirm; onChange(next: DFirm): void; problem: string | null }) {
  const names = firm.partners.map((p) => p.name);
  const set = <K extends keyof DFirm>(key: K, value: DFirm[K]) => onChange({ ...firm, [key]: value });
  const setAsset = (i: number, a: DAsset) => set('assets', firm.assets.map((x, k) => (k === i ? a : x)));
  const setLiab = (i: number, l: DLiability) => set('liabilities', firm.liabilities.map((x, k) => (k === i ? l : x)));
  const hasCreditors = firm.liabilities.some((l) => l.id === 'creditors' && l.fate.kind === 'paid');
  const bank = bankOf(firm);
  const unrecorded = (key: 'unrecordedAsset' | 'unrecordedLiability', what: string, u: Unrecorded | null, verbs: [string, string]) => (
    <div className="grid gap-2 sm:grid-cols-2">
      <Select
        label={key === 'unrecordedAsset' ? 'An asset not in the books' : 'A liability not in the books'}
        value={u === null ? 'none' : u.by === null ? 'firm' : `p-${u.by}`}
        options={[{ value: 'none', label: 'None' }, { value: 'firm', label: verbs[0] }, ...names.map((n, i) => ({ value: `p-${i}`, label: `${verbs[1]} ${n}` }))]}
        onChange={(v) => set(key, v === 'none' ? null : { what, amount: u?.amount ?? 500000, by: v === 'firm' ? null : Number(v.slice(2)) })}
        testId={`${P}-${key}`}
      />
      {u ? <MoneyField label={`Amount (${what})`} value={u.amount} onChange={(amount) => set(key, { ...u, amount })} min={1} max={1000000} testId={`${P}-${key}-amount`} /> : null}
    </div>
  );

  return (
    <fieldset data-testid="lab-dissolution-inputs" className="flex min-w-0 flex-col gap-4 rounded-card border border-edge bg-surface p-3 shadow-card sm:p-4">
      <legend className="sr-only">The firm and what happens on dissolution</legend>

      <Box title="The partners">
        <div className="grid gap-3 sm:grid-cols-3">
          {firm.partners.map((p, i) => (
            <div key={p.name} className="flex min-w-0 flex-col gap-2">
              <MoneyField label={`${p.name}'s capital`} value={p.capital} onChange={(capital) => set('partners', firm.partners.map((x, k) => (k === i ? { ...x, capital } : x)))} min={1} max={5000000} testId={`${P}-capital-${i}`} />
              <NumberSlider label={`${p.name}'s share`} value={p.ratio} onChange={(ratio) => set('partners', firm.partners.map((x, k) => (k === i ? { ...x, ratio } : x)))} min={1} max={9} unit="parts" testId={`${P}-ratio-${i}`} />
              <MoneyField label={`${p.name}'s loan to the firm`} value={p.loan} onChange={(loan) => set('partners', firm.partners.map((x, k) => (k === i ? { ...x, loan } : x)))} max={2000000} testId={`${P}-loan-${i}`} />
            </div>
          ))}
        </div>
        <p className="text-sm">
          Profit-sharing ratio <strong>{firm.partners.map((p) => p.ratio).join(':')}</strong>. Cash at bank on the balance sheet: <strong data-testid={`${P}-bank`}>{formatINR(bank)}</strong> (the figure that makes it agree).
        </p>
      </Box>

      <Box title="The assets, and what each fetched">
        {firm.assets.map((a, i) => (
          <div key={a.id} data-testid={`${P}-asset`} className="grid items-end gap-2 sm:grid-cols-3">
            <MoneyField label={`${a.name}: book value`} value={a.book} onChange={(book) => setAsset(i, { ...a, book })} min={1} max={5000000} testId={`${P}-asset-book-${i}`} />
            <Select
              label="On dissolution"
              value={fateKey(a.fate)}
              options={[
                { value: 'sold', label: 'Sold' },
                ...names.map((n, k) => ({ value: `taken-${k}`, label: `Taken over by ${n}` })),
                ...(hasCreditors ? [{ value: 'creditors', label: 'Accepted by the creditors' }] : []),
                { value: 'silent', label: a.intangible ? 'Nothing said (fetches nothing)' : 'Nothing said (fetches book value)' },
              ]}
              onChange={(v) => {
                const amount = a.fate.kind === 'silent' ? a.book : a.fate.amount;
                const fate: AssetFate = v === 'sold' ? { kind: 'sold', amount } : v === 'creditors' ? { kind: 'creditors', amount } : v === 'silent' ? { kind: 'silent' } : { kind: 'taken', by: Number(v.slice(6)), amount };
                setAsset(i, { ...a, fate });
              }}
              testId={`${P}-asset-fate-${i}`}
            />
            {a.fate.kind !== 'silent' ? (
              <MoneyField
                label={a.fate.kind === 'sold' ? 'Realised' : 'Agreed value'}
                value={a.fate.amount}
                onChange={(amount) => setAsset(i, { ...a, fate: { ...a.fate, amount } as AssetFate })}
                max={5000000}
                testId={`${P}-asset-amount-${i}`}
              />
            ) : (
              <p className="pb-2 text-sm text-muted">{a.intangible ? 'Intangible: taken to fetch nothing.' : 'Tangible: taken to fetch its book value.'}</p>
            )}
          </div>
        ))}
        <MoneyField label="Provision for doubtful debts" value={firm.provision} onChange={(p: Paise) => set('provision', p)} max={1000000} testId={`${P}-provision`} />
      </Box>

      <Box title="The outside liabilities, and how each was settled">
        {firm.liabilities.map((l, i) => (
          <div key={l.id} data-testid={`${P}-liability`} className="grid items-end gap-2 sm:grid-cols-3">
            <MoneyField label={`${l.name}: book figure`} value={l.book} onChange={(book) => setLiab(i, { ...l, book })} min={1} max={5000000} testId={`${P}-liability-book-${i}`} />
            <Select
              label="On dissolution"
              value={l.fate.kind === 'paid' ? 'paid' : `taken-${l.fate.by}`}
              options={[{ value: 'paid', label: 'Paid by the firm' }, ...(l.id === 'creditors' && firm.assets.some((a) => a.fate.kind === 'creditors') ? [] : names.map((n, k) => ({ value: `taken-${k}`, label: `Taken over by ${n}` })))]}
              onChange={(v) => setLiab(i, { ...l, fate: v === 'paid' ? { kind: 'paid', discount: 0 } : { kind: 'taken', by: Number(v.slice(6)) } })}
              testId={`${P}-liability-fate-${i}`}
            />
            {l.fate.kind === 'paid' ? (
              <MoneyField label="Discount allowed by them" value={l.fate.discount} onChange={(discount) => setLiab(i, { ...l, fate: { kind: 'paid', discount } })} max={5000000} testId={`${P}-liability-discount-${i}`} />
            ) : (
              <p className="pb-2 text-sm text-muted">The partner pays it personally.</p>
            )}
          </div>
        ))}
      </Box>

      <Box title="What belongs to the partners">
        <div className="grid gap-3 sm:grid-cols-3">
          <MoneyField label="General Reserve" value={firm.reserve} onChange={(p) => set('reserve', p)} max={2000000} testId={`${P}-reserve`} />
          <MoneyField label="Profit and Loss A/c (credit)" value={firm.plCredit} onChange={(p) => set('plCredit', p)} max={2000000} testId={`${P}-pl-credit`} />
          <MoneyField label="Profit and Loss A/c (debit)" value={firm.plDebit} onChange={(p) => set('plDebit', p)} max={2000000} testId={`${P}-pl-debit`} />
        </div>
      </Box>

      <Box title="Things not in the books">
        {unrecorded('unrecordedAsset', 'old typewriter', firm.unrecordedAsset, ['Sold by the firm', 'Taken over by'])}
        {unrecorded('unrecordedLiability', 'repairs bill', firm.unrecordedLiability, ['Paid by the firm', 'Paid personally by'])}
      </Box>

      <Box title="Realisation expenses">
        <div className="grid gap-2 sm:grid-cols-2">
          <Select label="Who bears them, and who pays" value={firm.expenses.form} options={EXPENSE_FORMS.map((f) => ({ value: f, label: EXPENSE_NAME[f] }))} onChange={(v) => set('expenses', { ...firm.expenses, form: v as ExpenseForm, fee: (v === 'feePersonal' || v === 'feeFirmPays') && !firm.expenses.fee ? firm.expenses.actual + 200000 : firm.expenses.fee })} testId={`${P}-expenses-form`} />
          {firm.expenses.form !== 'firm' ? <Select label="The partner" value={String(firm.expenses.by)} options={names.map((n, i) => ({ value: String(i), label: n }))} onChange={(v) => set('expenses', { ...firm.expenses, by: Number(v) })} testId={`${P}-expenses-by`} /> : null}
          <MoneyField label="The expenses" value={firm.expenses.actual} onChange={(actual) => set('expenses', { ...firm.expenses, actual })} max={1000000} testId={`${P}-expenses-actual`} />
          {firm.expenses.form === 'feePersonal' || firm.expenses.form === 'feeFirmPays' ? <MoneyField label="The remuneration agreed" value={firm.expenses.fee} onChange={(fee) => set('expenses', { ...firm.expenses, fee })} max={1000000} testId={`${P}-expenses-fee`} /> : null}
        </div>
      </Box>

      {problem ? (
        <p role="alert" data-testid="lab-dissolution-problem" className="rounded-control bg-danger-soft px-3 py-2 text-sm font-semibold text-danger-deep">
          {problem} The picture still shows the last figures that worked.
        </p>
      ) : null}
    </fieldset>
  );
}
