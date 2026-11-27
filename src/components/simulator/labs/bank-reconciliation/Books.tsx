'use client';

import { formatINR } from '@/engine/money';
import type { BookRow, CashBook, PassBook, Scenario } from '@/simulator/bank-reconciliation/books';
import { TAccount, type TRow } from '../kit/TAccount';

// The two books of the month as each party keeps them: the firm's Cash Book (its bank column) and the bank's Pass
// Book. The rows of the items that differ carry their letter and are lit when the picture is about them.

const figure = (p: number) => formatINR(p).slice(1);
const short = (s: Scenario, day: number) => `${day} ${s.month.slice(0, 3)}`;

export interface Marks {
  /** The letter of each item, by id. */
  letter: Map<string, string>;
  /** The items the picture is about just now. */
  lit: ReadonlySet<string>;
  /** Items already carried into the statement (or entered in the amended cash book). */
  done: ReadonlySet<string>;
}

const toRow = (s: Scenario, r: BookRow, marks: Marks): TRow => ({
  date: short(s, r.day),
  particulars: r.particulars,
  amount: r.amount,
  ...(r.item ? { tag: marks.letter.get(r.item), mark: marks.lit.has(r.item) ? ('now' as const) : ('item' as const) } : {}),
});

export function CashBookCard({ s, book, marks, title = 'Cash Book (bank column)', testId = 'lab-bank-reconciliation-cash-book', note }: { s: Scenario; book: CashBook; marks: Marks; title?: string; testId?: string; note?: string }) {
  return (
    <section className="flex flex-col gap-2 rounded-card border border-edge bg-surface p-3 shadow-card">
      <p className="text-xs font-extrabold uppercase tracking-wide text-hue-blue">Kept by {s.firm}</p>
      <TAccount
        title={title}
        testId={testId}
        periods={[{ title: `${s.month} ${s.year}`, dr: book.dr.map((r) => toRow(s, r, marks)), cr: book.cr.map((r) => toRow(s, r, marks)), totals: true }]}
        caption={<p className="text-center text-xs text-muted">{note ?? 'Receipts into the bank on the left (Dr.), payments out of it on the right (Cr.).'}</p>}
      />
    </section>
  );
}

export function PassBookCard({ s, book, marks }: { s: Scenario; book: PassBook; marks: Marks }) {
  return (
    <section aria-labelledby="brs-pass-title" className="flex flex-col gap-2 rounded-card border border-edge bg-surface p-3 shadow-card">
      <p className="text-xs font-extrabold uppercase tracking-wide text-hue-violet">Kept by the bank</p>
      <h4 id="brs-pass-title" className="text-center text-base font-extrabold">
        Pass Book of {s.firm}
      </h4>
      <p className="text-center text-xs text-muted">The bank&apos;s copy of the account: withdrawals, deposits and the balance after each (Dr. for an overdraft).</p>
      <table data-testid="lab-bank-reconciliation-pass-book" className="w-full border-collapse text-xs sm:text-sm">
        <thead>
          <tr className="border-b-2 border-edge-deep text-left text-muted">
            <th scope="col" className="py-1 pr-1 font-bold">
              Date
            </th>
            <th scope="col" className="py-1 pr-1 font-bold">
              Particulars
            </th>
            <th scope="col" className="py-1 pr-1 text-right font-bold">
              Withdrawals
            </th>
            <th scope="col" className="py-1 pr-1 text-right font-bold">
              Deposits
            </th>
            <th scope="col" className="py-1 text-right font-bold">
              Balance
            </th>
          </tr>
        </thead>
        <tbody>
          {book.rows.map((r, i) => (
            <tr key={i} data-mark={r.item ? (marks.lit.has(r.item) ? 'now' : 'item') : undefined} className={`border-b border-edge align-top tabular-nums ${r.item ? (marks.lit.has(r.item) ? 'bg-primary-soft' : 'bg-accent-soft') : ''}`}>
              <td className="py-1 pr-1 text-muted">{short(s, r.day)}</td>
              <td className="py-1 pr-1">
                {r.item ? <span className="mr-1 inline-block rounded bg-surface px-1 text-xs font-extrabold ring-1 ring-edge-deep">{marks.letter.get(r.item)}</span> : null}
                {r.particulars}
              </td>
              <td className="py-1 pr-1 text-right">{r.withdrawal ? figure(r.withdrawal) : ''}</td>
              <td className="py-1 pr-1 text-right">{r.deposit ? figure(r.deposit) : ''}</td>
              <td className="py-1 text-right font-bold">
                {figure(Math.abs(r.balance))} {r.balance < 0 ? 'Dr.' : 'Cr.'}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}
