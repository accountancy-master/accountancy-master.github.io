'use client';

import { HUE_EDGE, HUE_ICON, type Hue } from '@/components/ui/hues';
import { BOOK_NAME, BOOK_ORDER, BOOK_TAKES, booksOf, goodsTotals, inr, isGoodsBook, pettyTotals, type BookId, type Month, type TxRecord } from '@/simulator/books-of-entry/model';
import { Arrive } from '../kit/Arrive';

// ---------------------------------------------------------------------------------------------------------------
// The sorting desk: the source document of the transaction just sorted (with where it went) and the next one
// waiting, above the shelf of the seven books. A card that is sorted drops into its book (or into two books, when
// a settlement at a discount splits into the money and the discount). In Play the books are buttons.
// ---------------------------------------------------------------------------------------------------------------

export const P = 'lab-books-of-entry';

export const BOOK_HUE: Record<BookId, Hue> = {
  cash: 'green',
  petty: 'teal',
  purchases: 'blue',
  sales: 'violet',
  purchasesReturn: 'sky',
  salesReturn: 'rose',
  journal: 'amber',
};

/** A short glyph for each book, said in words beside it. */
const GLYPH: Record<BookId, string> = { cash: '₹', petty: '¢', purchases: 'P', sales: 'S', purchasesReturn: 'PR', salesReturn: 'SR', journal: 'J' };

export interface Picking {
  /** The books chosen so far for the waiting card. */
  picked: readonly BookId[];
  onPick(b: BookId): void;
}

/** What a book holds so far, in a line. */
function bookLine(m: Month, records: TxRecord[], cards: number, b: BookId): string {
  const books = booksOf(m, records, cards);
  if (b === 'cash') {
    const v = books.cash.view;
    const bal = (c: 'cash' | 'bank') => [...v.debit, ...v.credit].reduce((t, r) => t + (r.side === 'Dr' ? 1 : -1) * r[c], 0);
    const bank = bal('bank');
    return `Cash ${inr(bal('cash'))} · Bank ${bank < 0 ? `overdraft ${inr(-bank)}` : inr(bank)}`;
  }
  if (b === 'petty') {
    const t = pettyTotals(books.petty);
    return `In hand ${inr(t.balance)}`;
  }
  if (b === 'journal') return `${books.journal.length} ${books.journal.length === 1 ? 'entry' : 'entries'}`;
  const rows = books[b];
  return rows.length ? `${rows.length} ${rows.length === 1 ? 'row' : 'rows'} · ${inr(goodsTotals(rows).total)}` : 'Nothing yet';
}

export function Desk({ m, records, cards, reduced, picking, focus, hide = false }: { m: Month; records: TxRecord[]; cards: number; reduced: boolean; picking?: Picking; focus: BookId | null; hide?: boolean }) {
  const last = cards > 0 ? records[cards - 1] : null;
  const next = cards < records.length ? records[cards] : null;
  return (
    <div data-testid={`${P}-desk`} className="flex flex-col gap-3">
      <div className="grid gap-3 md:grid-cols-2">
        <section aria-label="The transaction just sorted" className="flex min-h-32 flex-col gap-1 rounded-card border border-edge bg-surface p-3 shadow-card">
          <p className="text-xs font-extrabold uppercase tracking-wide text-muted">Just sorted</p>
          {last ? (
            <Arrive key={`last-${last.index}-${m.firm}`} reduced={reduced} from="translateY(-0.75rem)" className="flex flex-col gap-1">
              <DocCard r={last} m={m} />
              <span data-testid={`${P}-went`} className="flex flex-wrap items-center gap-1.5 text-sm font-bold">
                <span aria-hidden="true">→</span>
                {last.books.map((b) => (
                  <span key={b} className={`rounded-full px-2 py-0.5 ${HUE_ICON[BOOK_HUE[b]]}`}>
                    {BOOK_NAME[b]}
                  </span>
                ))}
              </span>
            </Arrive>
          ) : (
            <p className="text-sm text-muted">Nothing yet: the month&apos;s documents wait in the tray.</p>
          )}
        </section>
        <section aria-label="The next transaction" className="flex min-h-32 flex-col gap-1 rounded-card border-2 border-dashed border-edge-deep bg-sunken p-3">
          <p className="text-xs font-extrabold uppercase tracking-wide text-muted">
            {next ? `In the tray: ${records.length - cards} left` : 'The tray is empty'}
          </p>
          {next ? (
            <div data-testid={`${P}-next`}>
              <DocCard r={next} m={m} />
              {picking ? <p className="mt-1 text-sm font-bold text-primary-ink">{picking.picked.length ? `In ${picking.picked.map((b) => BOOK_NAME[b]).join(' and ')}: which other book takes part of it?` : 'Which book does it go in? Tap the book below.'}</p> : null}
            </div>
          ) : (
            <p className="text-sm text-muted">Every document of {m.month} is in its book. At the month end the Cash Book is balanced and each book is posted to the ledger.</p>
          )}
        </section>
      </div>
      <ul aria-label="The books" className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-7">
        {BOOK_ORDER.map((b) => {
          const line = hide ? 'Figures hidden for the question' : bookLine(m, records, cards, b);
          const lit = last?.books.includes(b) ?? false;
          const focused = focus === b;
          const chosen = picking?.picked.includes(b) ?? false;
          const inner = (
            <>
              <span className="flex items-center gap-1.5">
                <span aria-hidden="true" className={`grid h-7 min-w-7 place-items-center rounded-full px-1 text-xs font-extrabold ${HUE_ICON[BOOK_HUE[b]]}`}>
                  {GLYPH[b]}
                </span>
                <span className="text-sm font-extrabold leading-tight">{BOOK_NAME[b]}</span>
              </span>
              <span className="text-xs text-muted">{BOOK_TAKES[b]}</span>
              <span data-testid={`${P}-book-line-${b}`} className="text-xs font-bold tabular-nums">
                {line}
              </span>
              {lit && last ? (
                <Arrive key={`drop-${last.index}-${b}-${m.firm}`} reduced={reduced} from="translateY(-3rem) scale(1.1)" ms={800} className={`mt-0.5 block rounded-control px-1.5 py-0.5 text-xs font-bold ${HUE_ICON[BOOK_HUE[b]]}`}>
                  + {last.date}: {isGoodsBook(b) && last.invoice ? inr(last.invoice.total) : inr(last.parts.find((p) => p.book === b)?.lines.find((l) => l.side === 'Dr')?.amount ?? last.amount)}
                </Arrive>
              ) : null}
            </>
          );
          const cls = `flex h-full min-h-24 w-full flex-col gap-1 rounded-control border border-t-4 bg-surface p-2 text-left ${HUE_EDGE[BOOK_HUE[b]]} ${lit || focused || chosen ? 'border-primary ring-2 ring-primary' : 'border-edge'}`;
          return (
            <li key={b} data-testid={`${P}-book-${b}`} data-lit={lit ? 'true' : 'false'}>
              {picking && next ? (
                <button type="button" data-testid={`${P}-pick-${b}`} aria-pressed={chosen} onClick={() => picking.onPick(b)} className={`${cls} min-h-11 hover:bg-sunken`}>
                  {inner}
                </button>
              ) : (
                <div className={cls}>{inner}</div>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function DocCard({ r, m }: { r: TxRecord; m: Month }) {
  return (
    <span className="flex flex-col gap-0.5">
      <span className="flex flex-wrap items-baseline gap-x-2">
        <span className="rounded bg-accent-soft px-1.5 text-xs font-extrabold text-accent-ink">{r.doc}</span>
        <span className="text-xs font-bold text-muted">{r.date} {m.year}</span>
      </span>
      <span className="text-base">{r.text}</span>
    </span>
  );
}
