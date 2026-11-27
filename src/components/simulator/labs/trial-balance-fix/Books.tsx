'use client';

import { Journal } from '../kit/TAccount';
import { amountText } from '../kit/format';
import { Card } from '../kit/LabShell';
import { dayShort, f, findError, title, YEAR, type Case, type JournalEntryView } from '@/simulator/trial-balance-fix/model';
import type { DeskState } from '@/simulator/trial-balance-fix/walk';
import { Badge, P } from './LedgerAccount';

// ---------------------------------------------------------------------------------------------------------------
// The books as the clerk wrote them: the month's transactions, the balances it began with, the journal (with the
// L.F. filled in as each line is posted, and left blank where a line never was), the Sales or Purchases Book, and
// the journal of the rectifying entries. An error is marked where it lives once it has been found.
// ---------------------------------------------------------------------------------------------------------------

/** The line of the books a detective's check is on. */
export type Highlight = { txn: number; line: number } | 'book' | null;

const th = 'py-1 pr-1 text-[11px] font-bold uppercase tracking-wide text-muted';

export function Transactions({ c }: { c: Case }) {
  const d = c.data;
  return (
    <details open className="group min-w-0 rounded-card border border-edge bg-surface p-3 shadow-card sm:p-4">
      <summary className="flex min-h-11 cursor-pointer list-none items-center gap-2 text-base font-extrabold [&::-webkit-details-marker]:hidden">
        <span aria-hidden="true" className="inline-block transition-transform group-open:rotate-90 motion-reduce:transition-none">
          ▸
        </span>
        What happened in April {YEAR}
      </summary>
      {d.opening.length ? (
        <p data-testid={`${P}-opening`} className="mt-1 text-sm text-muted">
          Balances on 1 April: {d.opening.map((o) => `${title(o.accountId)} ${f(o.amount)} (${o.side})`).join(', ')}.
        </p>
      ) : null}
      <ol data-testid={`${P}-txns`} className="mt-2 flex flex-col gap-1 text-sm">
        {d.txns.map((t, i) => (
          <li key={i} className="flex gap-2">
            <span className="w-12 shrink-0 font-bold text-muted">{dayShort(t.day)}</span>
            <span>
              {t.text}
              {t.book && c.book ? <span className="text-muted"> ({c.book.name})</span> : null}
            </span>
          </li>
        ))}
      </ol>
    </details>
  );
}

function EntryRows({ e, c, st, highlight, ghost }: { e: JournalEntryView; c: Case; st: DeskState; highlight: Highlight; ghost?: boolean }) {
  const entryErr = e.letter && st.revealed.has(e.letter) ? findError(c, e.letter) : null;
  return (
    <tbody data-testid={ghost ? `${P}-journal-missing` : `${P}-journal-entry`} className={`border-b-2 ${ghost ? 'border-2 border-dashed border-danger text-muted' : 'border-edge'} ${entryErr && !ghost ? 'bg-danger-soft' : ''}`}>
      {e.lines.map((l, i) => {
        const err = c.errors.find((x) => 'line' in x.spec && x.kind !== 'principle' && x.spec.txn === l.txn && x.spec.line === l.line);
        const shownErr = err && (st.revealed.has(err.letter) || (err.when === 'before' && st.checked)) ? err : null;
        const lit = highlight && highlight !== 'book' && highlight.txn === l.txn && highlight.line === l.line;
        const lf = st.posted && !ghost ? (st.checked ? l.lfChecked : l.lf) : '';
        return (
          <tr key={i} className={`${lit ? 'outline outline-2 -outline-offset-2 outline-focus' : ''} ${shownErr ? (shownErr.when === 'before' ? 'bg-accent-soft' : 'bg-danger-soft') : ''}`}>
            <td className="py-0.5 pr-1 text-xs text-muted">{i === 0 ? dayShort(e.day) : ''}</td>
            <td className={`break-words py-0.5 pr-1 ${l.side === 'Cr' ? 'pl-4' : ''}`}>
              {i === 0 && entryErr ? (
                <Badge tone={ghost ? 'missing' : 'wrong'} label={ghost ? 'left out of the books' : 'recorded in the wrong account'}>
                  ✗({entryErr.letter})
                </Badge>
              ) : null}
              {shownErr ? (
                <Badge tone={shownErr.when === 'before' ? 'fixed' : 'wrong'} label={shownErr.when === 'before' ? 'posting corrected before the trial balance' : shownErr.kind === 'partial-omission' ? 'never posted' : 'posted wrongly'}>
                  {shownErr.when === 'before' ? '✎' : '✗'}({shownErr.letter})
                </Badge>
              ) : null}
              {l.side === 'Cr' ? `To ${title(l.accountId)}` : (
                <>
                  {title(l.accountId)} <span className="font-bold">Dr.</span>
                </>
              )}
            </td>
            <td className="py-0.5 pr-1 text-center text-xs">
              <span className="font-bold text-primary-ink">{lf}</span>
            </td>
            <td className="py-0.5 pr-1 text-right tabular-nums">{l.side === 'Dr' ? amountText(l.amount) : ''}</td>
            <td className="py-0.5 text-right tabular-nums">{l.side === 'Cr' ? amountText(l.amount) : ''}</td>
          </tr>
        );
      })}
      <tr>
        <td />
        <td colSpan={4} className="pb-1 text-xs italic text-muted">
          ({e.narration}){ghost ? ' — not recorded by the clerk' : ''}
        </td>
      </tr>
    </tbody>
  );
}

/** The journal as the clerk wrote it, with any entry left out shown where it belongs once it is found. */
export function BooksJournal({ c, st, highlight = null }: { c: Case; st: DeskState; highlight?: Highlight }) {
  const missing = c.missing.filter((m) => m.letter && st.revealed.has(m.letter));
  const all = [...c.journal.map((e) => ({ e, ghost: false })), ...missing.map((e) => ({ e, ghost: true }))].sort((a, b) => a.e.txn - b.e.txn);
  return (
    <Card title={`Journal of ${c.data.business}`} testId={`${P}-journal`} aside={<span className="text-xs font-bold text-muted">Page J1</span>}>
      <div className="min-w-0 overflow-x-auto" tabIndex={0} role="region" aria-label="The journal, scrolls sideways on a narrow screen">
        <table className="w-full min-w-[24rem] table-fixed border-collapse text-sm">
          <caption className="sr-only">The journal as recorded</caption>
          <thead>
            <tr className="border-b-2 border-edge-deep text-left">
              <th scope="col" className={`${th} w-12`}>
                Date
              </th>
              <th scope="col" className={th}>
                Particulars
              </th>
              <th scope="col" className={`${th} w-9 text-center`}>
                L.F.
              </th>
              <th scope="col" className={`${th} w-[4.6rem] text-right`}>
                Dr (₹)
              </th>
              <th scope="col" className={`${th} w-[4.6rem] text-right`}>
                Cr (₹)
              </th>
            </tr>
          </thead>
          {all.map(({ e, ghost }) => (
            <EntryRows key={`${e.txn}${ghost ? 'g' : ''}`} e={e} c={c} st={st} highlight={highlight} ghost={ghost} />
          ))}
        </table>
      </div>
      <p className="text-xs text-muted">The L.F. column is filled in as each line is posted to the ledger.</p>
    </Card>
  );
}

/** The Sales Book or Purchases Book: one row for each invoice, its total posted at the month end. */
export function BookTable({ c, st, highlight = null }: { c: Case; st: DeskState; highlight?: Highlight }) {
  const b = c.book;
  if (!b) return null;
  const err = b.letter && st.revealed.has(b.letter) ? b.letter : null;
  return (
    <Card title={b.name} testId={`${P}-book`} aside={<span className="text-xs font-bold text-muted">Page {b.kind === 'sales' ? 'SB1' : 'PB1'}</span>}>
      <div className="min-w-0 overflow-x-auto" tabIndex={0} role="region" aria-label="The book, scrolls sideways on a narrow screen">
        <table className="w-full min-w-[22rem] table-fixed border-collapse text-sm">
          <caption className="sr-only">{b.name}</caption>
          <thead>
            <tr className="border-b-2 border-edge-deep text-left">
              <th scope="col" className={`${th} w-12`}>
                Date
              </th>
              <th scope="col" className={`${th} w-12`}>
                Inv.
              </th>
              <th scope="col" className={th}>
                {b.kind === 'sales' ? 'Customer' : 'Supplier'}
              </th>
              <th scope="col" className={`${th} w-9 text-center`}>
                L.F.
              </th>
              <th scope="col" className={`${th} w-[4.6rem] text-right`}>
                ₹
              </th>
            </tr>
          </thead>
          <tbody>
            {b.rows.map((r) => {
              const e = c.errors.find((x) => 'line' in x.spec && x.spec.txn === r.txn);
              const shown = e && (st.revealed.has(e.letter) || (e.when === 'before' && st.checked)) ? e : null;
              const lf = st.posted ? (st.checked ? r.lfChecked : r.lf) : '';
              const lit = highlight && highlight !== 'book' && highlight.txn === r.txn;
              return (
                <tr key={r.invoice} className={`border-b border-edge ${lit ? 'outline outline-2 -outline-offset-2 outline-focus' : ''} ${shown ? (shown.when === 'before' ? 'bg-accent-soft' : 'bg-danger-soft') : ''}`}>
                  <td className="py-0.5 pr-1 text-xs text-muted">{dayShort(r.day)}</td>
                  <td className="py-0.5 pr-1 text-xs">{r.invoice}</td>
                  <td className="break-words py-0.5 pr-1">
                    {shown ? <Badge tone={shown.when === 'before' ? 'fixed' : 'wrong'}>{`${shown.when === 'before' ? '✎' : '✗'}(${shown.letter})`}</Badge> : null}
                    {title(r.partyId).replace(/ A\/c$/, '')}
                  </td>
                  <td className="py-0.5 pr-1 text-center text-xs font-bold text-primary-ink">{lf}</td>
                  <td className="py-0.5 text-right tabular-nums">{amountText(r.amount)}</td>
                </tr>
              );
            })}
            <tr data-testid={`${P}-book-total`} className={`border-y-2 border-edge-deep font-extrabold ${err || highlight === 'book' ? 'bg-danger-soft' : ''}`}>
              <td colSpan={3} className="py-1 pr-1 text-xs">
                {err ? (
                  <Badge tone="wrong" label="added up wrongly">
                    ✗({err})
                  </Badge>
                ) : null}
                Total, posted to {b.kind === 'sales' ? 'Sales A/c' : 'Purchases A/c'} on Apr 30
                {err ? <span className="block font-bold text-danger-deep">The rows add up to {f(b.sum)}.</span> : null}
              </td>
              <td />
              <td className="py-1 text-right tabular-nums">{amountText(b.total)}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </Card>
  );
}

/** The journal of the rectifying entries, each dated by its error's letter. */
export function RectifyJournal({ c, st }: { c: Case; st: DeskState }) {
  const shown = c.rectifications.filter((r) => st.entries.has(r.letter));
  if (!shown.length) return null;
  const at = shown.findIndex((r) => r.letter === st.current);
  return (
    <Card title="Journal: the rectifying entries" testId={`${P}-rectify-journal`} aside={<span className="text-xs font-bold text-muted">Page J2</span>}>
      <Journal
        testId={`${P}-rectify-entries`}
        caption="The rectifying entries"
        being
        highlight={at >= 0 ? at : undefined}
        entries={shown.map((r) => ({ date: `(${r.letter}) ${findError(c, r.letter).name}`, lines: r.lines.map((l) => ({ account: title(l.accountId), side: l.side, amount: l.amount })), narration: r.narration }))}
      />
    </Card>
  );
}

