'use client';

import { useMemo } from 'react';
import { BOOK_ORDER, ledgerOf, type BookId, type Month, type TxRecord } from '@/simulator/books-of-entry/model';
import { standingAfter, type WalkStep } from '@/simulator/books-of-entry/walk';
import { BookViews } from './BookViews';
import { Desk, type Picking } from './Desk';
import { PostingPanel } from './Posting';

/** The ledger folio of every account the month posts to: its page, in the order the accounts are opened. */
export function useFolios(m: Month, records: TxRecord[]): Map<string, number> {
  return useMemo(() => new Map(ledgerOf(m, records, new Set(BOOK_ORDER)).map((a, k) => [a.accountId, k + 1])), [m, records]);
}

/**
 * The whole picture after `shown` steps of the walk: the desk and shelf, the open book, and a posting under way.
 * `hide` keeps the running figures and the totals of the books out of sight while a question asks for one.
 */
export function Stage({ m, records, walk, shown, reduced, picking, follow, hide = false }: { m: Month; records: TxRecord[]; walk: readonly WalkStep[]; shown: number; reduced: boolean; picking?: Picking; follow?: BookId | null; hide?: boolean }) {
  const st = standingAfter(walk, shown);
  const folios = useFolios(m, records);
  return (
    <div className="flex flex-col gap-3">
      <Desk m={m} records={records} cards={st.cards} reduced={reduced} picking={picking} focus={st.posting} hide={hide} />
      {st.posting ? <PostingPanel m={m} records={records} book={st.posting} posted={st.posted} reduced={reduced} folios={folios} /> : null}
      <BookViews s={{ m, records, cards: st.cards, closed: st.closed, posted: st.posted, folios }} follow={follow === undefined ? st.book : follow} hide={hide} />
    </div>
  );
}
