'use client';

import { amountText } from '../kit/format';
import type { AccRow, ColAccount, TAccount } from '@/simulator/partnership/appropriation';

// The board's formats beside the picture: the Profit and Loss Appropriation Account (rows appear as the walk-through
// writes them) and the partners' accounts in columns.

function Side({ title, rows, total, done, testId }: { title: string; rows: AccRow[]; total: number; done: boolean; testId: string }) {
  return (
    <table data-testid={testId} className="w-full table-fixed border-collapse text-sm">
      <caption className="pb-1 text-left text-xs font-extrabold uppercase tracking-wide text-muted">{title}</caption>
      <thead className="sr-only">
        <tr>
          <th scope="col">Particulars</th>
          <th scope="col">₹</th>
          <th scope="col">₹</th>
        </tr>
      </thead>
      <tbody>
        {rows.length === 0 ? (
          <tr>
            <td colSpan={3} className="py-1 text-muted">
              Nothing yet.
            </td>
          </tr>
        ) : null}
        {rows.map((r, i) => (
          <FragmentRows key={i} row={r} />
        ))}
        {done ? (
          <tr className="border-t-2 border-ink/60 font-extrabold">
            <td className="py-1">Total</td>
            <td />
            <td className="py-1 text-right tabular-nums">{amountText(total)}</td>
          </tr>
        ) : null}
      </tbody>
    </table>
  );
}

function FragmentRows({ row }: { row: AccRow }) {
  if (!row.sub) {
    return (
      <tr className="border-t border-edge align-top">
        <td className="py-1 pr-1">{row.text}</td>
        <td />
        <td className="w-24 py-1 text-right tabular-nums">{amountText(row.amount)}</td>
      </tr>
    );
  }
  return (
    <>
      <tr className="border-t border-edge align-top">
        <td className="pt-1 pr-1">{row.text}</td>
        <td />
        <td />
      </tr>
      {row.sub.map((s, j) => (
        <tr key={j} className="align-top">
          <td className="pl-3 pr-1 text-muted">{s.text}</td>
          <td className="w-20 text-right tabular-nums">{amountText(s.amount)}</td>
          <td className="w-24 text-right tabular-nums">{j === row.sub!.length - 1 ? amountText(row.amount) : ''}</td>
        </tr>
      ))}
    </>
  );
}

export function AppropriationAccount({ account, shown, total }: { account: TAccount; shown: number; total: number }) {
  const visible = (rows: AccRow[]) => rows.filter((r) => r.step < shown);
  const done = shown >= total;
  return (
    <div data-testid="lab-partnership-account" className="flex min-w-0 flex-col gap-2">
      <p className="text-center text-sm font-extrabold">
        Dr. <span className="px-1">{account.title}</span> Cr.
      </p>
      <div className="grid gap-3">
        <Side title="Dr. (debit side)" rows={visible(account.dr)} total={account.total} done={done} testId="lab-partnership-account-dr" />
        <Side title="Cr. (credit side)" rows={visible(account.cr)} total={account.total} done={done} testId="lab-partnership-account-cr" />
      </div>
    </div>
  );
}

export function PartnerAccounts({ accounts, names }: { accounts: ColAccount[]; names: string[] }) {
  return (
    <div className="flex min-w-0 flex-col gap-4">
      {accounts.map((acc) => (
        <div key={acc.title} className="flex min-w-0 flex-col gap-1">
          <p className="text-sm font-extrabold">{acc.title}</p>
          {(['dr', 'cr'] as const).map((side) => (
            <table key={side} data-testid={`lab-partnership-${acc.title.includes('Current') ? 'current' : 'capital'}-${side}`} className="w-full table-fixed border-collapse text-xs sm:text-sm">
              <caption className="pt-1 text-left text-xs font-extrabold uppercase tracking-wide text-muted">{side === 'dr' ? 'Dr. side' : 'Cr. side'}</caption>
              <thead>
                <tr className="border-b border-edge-deep text-left text-muted">
                  <th scope="col" className="w-[40%] py-0.5 pr-1">
                    Particulars
                  </th>
                  {names.map((n) => (
                    <th key={n} scope="col" className="py-0.5 text-right">
                      {n} (₹)
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {acc[side].map((r) => (
                  <tr key={r.text} className="border-b border-edge align-top">
                    <td className="break-words py-0.5 pr-1">{r.text}</td>
                    {r.amounts.map((a, i) => (
                      <td key={i} className="py-0.5 text-right tabular-nums">
                        {a ? amountText(a) : ''}
                      </td>
                    ))}
                  </tr>
                ))}
                <tr className="font-extrabold">
                  <td className="py-0.5">Total</td>
                  {acc.totals.map((t, i) => (
                    <td key={i} className="py-0.5 text-right tabular-nums">
                      {amountText(t)}
                    </td>
                  ))}
                </tr>
              </tbody>
            </table>
          ))}
        </div>
      ))}
    </div>
  );
}
