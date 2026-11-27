'use client';

import { HUE_ICON } from '@/components/ui/hues';
import { formatINR } from '@/engine/money';
import { BOOK_NAME, ledgerName, ledgerOf, postingsOfBook, shortDate, type BookId, type Month, type TxRecord } from '@/simulator/books-of-entry/model';
import { Arrive } from '../kit/Arrive';
import { TAccount, type TRow } from '../kit/TAccount';
import { BOOK_HUE, P } from './Desk';

// ---------------------------------------------------------------------------------------------------------------
// The month-end posting of one book: each posting as an arrow from the book (a row, or a column total) to the side
// of a ledger account, and then those accounts as the ledger shows them, the new postings lit. A contra entry has
// no arrow: it is "not posted".
// ---------------------------------------------------------------------------------------------------------------

export function PostingPanel({ m, records, book, posted, reduced, folios }: { m: Month; records: TxRecord[]; book: BookId; posted: ReadonlySet<BookId>; reduced: boolean; folios: ReadonlyMap<string, number> }) {
  const lines = postingsOfBook(m, records, book);
  const accounts = [...new Set(lines.filter((l) => !l.contra).map((l) => l.accountId))];
  const ledger = ledgerOf(m, records, posted).filter((a) => accounts.includes(a.accountId));
  const short = (date: string) => shortDate(m, Number(date.split(' ')[0]));
  const row = (it: (typeof ledger)[number]['debit'][number]): TRow => ({
    date: short(it.date),
    particulars: `${it.side === 'Dr' ? 'To' : 'By'} ${it.label}`,
    amount: it.amount,
    ...(it.book === book ? { mark: 'now' as const } : {}),
  });
  return (
    <section aria-labelledby={`${P}-posting-title`} data-testid={`${P}-posting`} data-book={book} className="flex flex-col gap-3 rounded-card border border-edge bg-surface p-3 shadow-card">
      <h3 id={`${P}-posting-title`} className="text-base font-extrabold">
        Posting the {BOOK_NAME[book]} to the ledger
      </h3>
      <ol aria-label={`Postings of the ${BOOK_NAME[book]}`} className="flex flex-col gap-1.5">
        {lines.map((l, k) => (
          <li key={k} data-testid={`${P}-post-line`} className="grid items-center gap-1 text-sm sm:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] sm:gap-2">
            <span className={`rounded-control px-2 py-1 ${l.total ? 'font-bold' : ''} ${HUE_ICON[BOOK_HUE[book]]}`}>
              {l.total ? '∑ ' : ''}
              {l.from.length > 90 ? `${l.from.slice(0, 88)}…` : l.from} <span className="font-extrabold tabular-nums">{formatINR(l.amount)}</span>
            </span>
            <span aria-hidden="true" className="justify-self-center text-lg font-extrabold text-muted">
              <span className="hidden sm:inline">{l.contra ? '✕' : '→'}</span>
              <span className="sm:hidden">{l.contra ? '✕' : '↓'}</span>
            </span>
            {l.contra ? (
              <span className="rounded-control border border-dashed border-edge-deep px-2 py-1 text-muted">{l.particulars}</span>
            ) : (
              <Arrive key={`${book}-${k}`} reduced={reduced} from="translateX(-2.5rem)" ms={600 + 60 * Math.min(k, 10)} className="block rounded-control border border-edge-deep bg-sunken px-2 py-1">
                <span className="font-bold">{l.side === 'Dr' ? 'Debit' : 'Credit'} of {ledgerName(l.accountId)}</span>
                {folios.get(l.accountId) ? <span className="text-xs text-muted"> (folio {folios.get(l.accountId)})</span> : null}
                <span className="block text-xs text-muted">
                  {l.date}: “{l.particulars}”{l.total ? ', at the month end' : ''}
                </span>
              </Arrive>
            )}
          </li>
        ))}
      </ol>
      {ledger.length ? (
        <div className="flex flex-col gap-2">
          <p className="text-xs font-extrabold uppercase tracking-wide text-muted">The ledger accounts it posts to (this book&apos;s postings lit; not yet balanced)</p>
          <div data-testid={`${P}-ledger`} className="grid gap-4 md:grid-cols-2">
            {ledger.map((a) => (
              <TAccount key={a.accountId} title={a.title} testId={`${P}-ledger-account`} periods={[{ dr: a.debit.map(row), cr: a.credit.map(row), totals: false }]} />
            ))}
          </div>
        </div>
      ) : null}
    </section>
  );
}
