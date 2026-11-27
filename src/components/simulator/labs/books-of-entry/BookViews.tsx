'use client';

import { useState, type ReactNode } from 'react';
import { creditor, debtor } from '@/engine/accounts';
import { formatINR, type Paise } from '@/engine/money';
import {
  BOOK_NAME,
  BOOK_ORDER,
  booksOf,
  goodsTotals,
  HEAD_NAME,
  headsUsed,
  ledgerName,
  pettyTotals,
  shortDate,
  taxColumnName,
  taxColumns,
  type BookId,
  type Books,
  type GoodsRow,
  type Month,
  type TxRecord,
} from '@/simulator/books-of-entry/model';
import { reopenDate } from '@/simulator/books-of-entry/walk';
import { Toggle } from '../kit/LabControls';
import { P } from './Desk';

// ---------------------------------------------------------------------------------------------------------------
// The books in the board's formats: the Purchases, Sales and return books (with their GST columns when GST is
// charged), the Cash Book with cash and bank columns, the analytical Petty Cash Book and the Journal Proper. The L.F.
// column is filled with the ledger folio once a book is posted; a contra entry is marked "C".
// ---------------------------------------------------------------------------------------------------------------

const fig = (p: Paise) => (p ? formatINR(p).slice(1) : '');
const TH = 'py-1 pr-2 text-left text-xs font-bold uppercase tracking-wide text-muted';
const THR = 'py-1 pl-2 text-right text-xs font-bold uppercase tracking-wide text-muted';

export interface BookState {
  m: Month;
  records: TxRecord[];
  cards: number;
  closed: boolean;
  posted: ReadonlySet<BookId>;
  folios: ReadonlyMap<string, number>;
}

/** The books with tabs to open each one; it follows the book the picture is about unless another tab is chosen. */
export function BookViews({ s, follow, hide = false }: { s: BookState; follow: BookId | null; hide?: boolean }) {
  const [chosen, setChosen] = useState<BookId>(follow ?? 'cash');
  const [last, setLast] = useState(follow);
  if (last !== follow) {
    setLast(follow);
    if (follow) setChosen(follow);
  }
  const books = booksOf(s.m, s.records, s.cards);
  return (
    <section aria-label="The books, as the board writes them" data-testid={`${P}-books`} className="flex flex-col gap-2 rounded-card border border-edge bg-surface p-3 shadow-card">
      <Toggle options={BOOK_ORDER.map((b) => ({ value: b, label: BOOK_NAME[b] }))} value={chosen} onChange={setChosen} label="Open a book" prefix={`${P}-open`} small />
      <div data-testid={`${P}-book-view`} data-book={chosen} className="min-w-0">
        {chosen === 'cash' ? <CashBookTable s={s} books={books} /> : null}
        {chosen === 'petty' ? <PettyBookTable s={s} books={books} /> : null}
        {chosen === 'journal' ? <JournalTable s={s} books={books} /> : null}
        {chosen !== 'cash' && chosen !== 'petty' && chosen !== 'journal' ? <GoodsBookTable s={s} book={chosen} rows={books[chosen]} hide={hide} /> : null}
      </div>
    </section>
  );
}

function Title({ children, note }: { children: ReactNode; note?: ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-0.5 text-center">
      <h4 className="text-base font-extrabold">{children}</h4>
      {note ? <p className="text-xs text-muted">{note}</p> : null}
    </div>
  );
}

/** A table that may be wider than a phone: it scrolls inside its own box, never the page. */
function Wide({ children }: { children: ReactNode }) {
  return <div className="max-w-full overflow-x-auto">{children}</div>;
}

const FOOT: Record<'purchases' | 'sales' | 'purchasesReturn' | 'salesReturn', string> = {
  purchases: 'Purchases A/c Dr.',
  sales: 'Sales A/c Cr.',
  purchasesReturn: 'Purchases Return A/c Cr.',
  salesReturn: 'Sales Return A/c Dr.',
};

function GoodsBookTable({ s, book, rows, hide }: { s: BookState; book: 'purchases' | 'sales' | 'purchasesReturn' | 'salesReturn'; rows: GoodsRow[]; hide: boolean }) {
  const taxes = taxColumns(s.m.gst);
  const input = book === 'purchases' || book === 'purchasesReturn';
  const t = goodsTotals(rows);
  const posted = s.posted.has(book);
  const partyId = (name: string) => (input ? creditor(name) : debtor(name));
  const noName = book === 'purchases' ? 'Invoice No.' : book === 'sales' ? 'Invoice No.' : book === 'purchasesReturn' ? 'Debit Note No.' : 'Credit Note No.';
  const who = input ? 'supplier' : 'customer';
  const lastIndex = s.cards - 1;
  return (
    <div className="flex flex-col gap-2">
      <Title note={taxes.length ? `GST ${s.m.gst.rate}%: ${s.m.gst.intra ? `CGST ${s.m.gst.rate / 2}% and SGST ${s.m.gst.rate / 2}% (within the state)` : `IGST ${s.m.gst.rate}% (another state)`}, on the price after trade discount.` : 'GST is ignored in this month.'}>
        {BOOK_NAME[book]} of {s.m.firm}, {s.m.month} {s.m.year}
      </Title>
      <Wide>
        <table data-testid={`${P}-table-${book}`} className="w-full min-w-[20rem] border-collapse text-sm">
          <caption className="sr-only">{BOOK_NAME[book]}</caption>
          <thead>
            <tr className="border-b-2 border-edge-deep">
              <th scope="col" className={TH}>Date</th>
              <th scope="col" className={TH}>Particulars ({who})</th>
              <th scope="col" className={`${TH} hidden sm:table-cell`}>{noName}</th>
              <th scope="col" className={TH}>L.F.</th>
              <th scope="col" className={THR}>{taxes.length ? 'Taxable value ₹' : 'Amount ₹'}</th>
              {taxes.map((c) => (
                <th key={c} scope="col" className={THR}>
                  {taxColumnName(c, input)} ₹
                </th>
              ))}
              {taxes.length ? <th scope="col" className={THR}>Total ₹</th> : null}
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={5 + taxes.length + (taxes.length ? 1 : 0)} className="py-3 text-center text-sm text-muted">
                  Nothing written in it yet.
                </td>
              </tr>
            ) : null}
            {rows.map((r) => (
              <tr key={r.index} data-mark={r.index === lastIndex ? 'now' : undefined} className={`border-b border-edge align-top tabular-nums ${r.index === lastIndex ? 'bg-primary-soft' : ''}`}>
                <td className="py-1 pr-2 text-xs text-muted">{shortDate(s.m, Number(r.date.split(' ')[0]))}</td>
                <td className="py-1 pr-2">
                  {r.party}
                  <span className="block text-xs text-muted sm:hidden">
                    {noName} {r.no}
                  </span>
                  {r.invoice.td > 0 ? (
                    <span className="block text-xs text-muted">
                      List price {formatINR(r.invoice.list)}, less trade discount {r.invoice.td}% {formatINR(r.invoice.tdAmount)}
                    </span>
                  ) : null}
                </td>
                <td className="hidden py-1 pr-2 sm:table-cell">{r.no}</td>
                <td className="py-1 pr-2 text-xs">{posted ? (s.folios.get(partyId(r.party)) ?? '') : ''}</td>
                <td className="py-1 pl-2 text-right">{fig(r.invoice.taxable)}</td>
                {taxes.map((c) => (
                  <td key={c} className="py-1 pl-2 text-right">
                    {fig(r.invoice[c])}
                  </td>
                ))}
                {taxes.length ? <td className="py-1 pl-2 text-right font-bold">{fig(r.invoice.total)}</td> : null}
              </tr>
            ))}
            {rows.length && !hide ? (
              <tr data-testid={`${P}-total-${book}`} className="border-y-2 border-edge-deep font-extrabold tabular-nums">
                <td className="py-1 pr-2 text-xs text-muted">{s.closed ? shortDate(s.m, s.m.lastDay) : ''}</td>
                <td className="py-1 pr-2" colSpan={1}>
                  {s.closed ? FOOT[book] : 'Total so far'}
                </td>
                <td className="hidden sm:table-cell" />
                <td className="py-1 pr-2 text-xs">{posted ? (s.folios.get(book) ?? '') : ''}</td>
                <td className="py-1 pl-2 text-right">{fig(t.taxable)}</td>
                {taxes.map((c) => (
                  <td key={c} className="py-1 pl-2 text-right">
                    {fig(t[c])}
                  </td>
                ))}
                {taxes.length ? <td className="py-1 pl-2 text-right">{fig(t.total)}</td> : null}
              </tr>
            ) : null}
          </tbody>
        </table>
      </Wide>
      <p className="text-xs text-muted">
        Each row is entered at the price after trade discount{taxes.length ? '; the Total column is what the party ' + (input ? 'is owed' : 'owes') : ''}. Trade discount itself is never recorded.
      </p>
    </div>
  );
}

interface CashRow {
  date: string;
  label: string;
  lf: string;
  cash: Paise;
  bank: Paise;
  mark?: 'now';
  strong?: boolean;
}

function CashSide({ side, rows, testId }: { side: 'Dr' | 'Cr'; rows: CashRow[]; testId: string }) {
  return (
    <table data-testid={testId} className="w-full border-collapse text-sm">
      <caption className="sr-only">{side === 'Dr' ? 'Debit side: receipts' : 'Credit side: payments'}</caption>
      <thead>
        <tr className="border-b-2 border-edge-deep">
          <th scope="col" className={TH}>{side === 'Dr' ? 'Dr. Date' : 'Date'}</th>
          <th scope="col" className={TH}>Particulars</th>
          <th scope="col" className={TH}>L.F.</th>
          <th scope="col" className={THR}>Cash ₹</th>
          <th scope="col" className={THR}>Bank ₹{side === 'Cr' ? ' Cr.' : ''}</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r, i) => (
          <tr key={i} data-mark={r.mark} className={`align-top tabular-nums ${r.strong ? 'border-y-2 border-edge-deep font-extrabold' : 'border-b border-edge'} ${r.mark === 'now' ? 'bg-primary-soft' : ''}`}>
            <td className="py-1 pr-2 text-xs text-muted">{r.date}</td>
            <td className="py-1 pr-2">{r.label}</td>
            <td className="py-1 pr-2 text-xs font-bold">{r.lf}</td>
            <td className="py-1 pl-2 text-right">{fig(r.cash)}</td>
            <td className="py-1 pl-2 text-right">{fig(r.bank)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function CashBookTable({ s, books }: { s: BookState; books: Books }) {
  const v = books.cash.view;
  const posted = s.posted.has('cash');
  const lastIndex = s.cards - 1;
  const short = (date: string) => shortDate(s.m, Number(date.split(' ')[0]));
  const toRows = (side: 'Dr' | 'Cr'): CashRow[] => {
    const src = side === 'Dr' ? v.debit : v.credit;
    const from = side === 'Dr' ? books.cash.debitFrom : books.cash.creditFrom;
    return src.map((r, i) => ({
      date: short(r.date),
      label: `${side === 'Dr' ? 'To' : 'By'} ${r.label}`,
      lf: r.contra ? 'C' : posted && r.accountIds.length === 1 ? String(s.folios.get(r.accountIds[0]) ?? '') : '',
      cash: r.cash,
      bank: r.bank,
      ...(from[i] !== null && from[i] === lastIndex && !s.closed ? { mark: 'now' as const } : {}),
    }));
  };
  const dr = toRows('Dr');
  const cr = toRows('Cr');
  const end = shortDate(s.m, s.m.lastDay);
  const next = reopenDate(s.m);
  const nextShort = `${next.split(' ')[1].slice(0, 3)} 1`;
  if (s.closed) {
    // A balance is carried down on the side opposite to its own and brought down on its own side.
    const carried = (side: 'Dr' | 'Cr') => ({ cash: v.cash && v.cash.side !== side ? v.cash.amount : 0, bank: v.bank && v.bank.side !== side ? v.bank.amount : 0 });
    for (const [rows, side] of [
      [dr, 'Dr'],
      [cr, 'Cr'],
    ] as const) {
      const c = carried(side);
      if (c.cash || c.bank) rows.push({ date: end, label: `${side === 'Dr' ? 'To' : 'By'} Balance c/d`, lf: '', cash: c.cash, bank: c.bank });
    }
    const n = Math.max(dr.length, cr.length);
    for (const rows of [dr, cr]) while (rows.length < n) rows.push({ date: ' ', label: '', lf: '', cash: 0, bank: 0 });
    for (const rows of [dr, cr]) rows.push({ date: '', label: 'Total', lf: '', cash: v.totals.cash, bank: v.totals.bank, strong: true });
    const down = (side: 'Dr' | 'Cr') => ({ cash: v.cash && v.cash.side === side ? v.cash.amount : 0, bank: v.bank && v.bank.side === side ? v.bank.amount : 0 });
    for (const [rows, side] of [
      [dr, 'Dr'],
      [cr, 'Cr'],
    ] as const) {
      const d = down(side);
      if (d.cash || d.bank) rows.push({ date: nextShort, label: `${side === 'Dr' ? 'To' : 'By'} Balance b/d`, lf: '', cash: d.cash, bank: d.bank });
    }
  }
  return (
    <div className="flex flex-col gap-2">
      <Title note="Cash and bank columns only: a cash discount is not a column of it (it goes through the Journal Proper). C marks a contra entry.">
        Cash Book of {s.m.firm}, {s.m.month} {s.m.year}
      </Title>
      <div className="grid gap-3 lg:grid-cols-2">
        <Wide>
          <CashSide side="Dr" rows={dr} testId={`${P}-cash-dr`} />
        </Wide>
        <Wide>
          <CashSide side="Cr" rows={cr} testId={`${P}-cash-cr`} />
        </Wide>
      </div>
      {s.closed ? (
        <p data-testid={`${P}-cash-balances`} className="text-sm">
          On {s.m.lastDay} {s.m.month}: cash in hand <strong>{v.cash ? formatINR(v.cash.amount) : '₹0'}</strong>; bank{' '}
          <strong>{v.bank ? (v.bank.side === 'Dr' ? `balance ${formatINR(v.bank.amount)}` : `overdraft ${formatINR(v.bank.amount)}`) : '₹0'}</strong>. Brought down on {next}.
        </p>
      ) : null}
    </div>
  );
}

function PettyBookTable({ s, books }: { s: BookState; books: Books }) {
  const heads = headsUsed(s.m);
  const p = books.petty;
  const t = pettyTotals(p);
  const lastIndex = s.cards - 1;
  const posted = s.posted.has('petty');
  type Row = { index: number; date: string; receipt: Paise; label: string; voucher: string; total: Paise; head?: string };
  const rows: Row[] = [
    ...p.receipts.map((r) => ({ index: r.index, date: r.date, receipt: r.amount, label: r.label, voucher: '', total: 0 })),
    ...p.rows.map((r) => ({ index: r.index, date: r.date, receipt: 0, label: `${r.what.charAt(0).toUpperCase()}${r.what.slice(1)}`, voucher: String(r.voucher), total: r.amount, head: r.head })),
  ].sort((a, b) => a.index - b.index);
  const short = (date: string) => shortDate(s.m, Number(date.split(' ')[0]));
  return (
    <div className="flex flex-col gap-2">
      <Title note="Analytical, on the imprest system: each payment in the Total column and again under its head.">
        Petty Cash Book of {s.m.firm}, {s.m.month} {s.m.year}
      </Title>
      <Wide>
        <table data-testid={`${P}-table-petty`} className="w-full min-w-[24rem] border-collapse text-sm">
          <caption className="sr-only">Petty Cash Book</caption>
          <thead>
            <tr className="border-b-2 border-edge-deep">
              <th scope="col" className={THR}>Receipts ₹</th>
              <th scope="col" className={`${TH} pl-2`}>Date</th>
              <th scope="col" className={TH}>Particulars</th>
              <th scope="col" className={TH}>V. No.</th>
              <th scope="col" className={THR}>Total ₹</th>
              {heads.map((h) => (
                <th key={h} scope="col" className={THR}>
                  {HEAD_NAME[h]} ₹
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={5 + heads.length} className="py-3 text-center text-muted">
                  {s.m.txs.some((x) => x.kind === 'imprest') ? 'Nothing written in it yet.' : 'No petty cash is kept this month.'}
                </td>
              </tr>
            ) : null}
            {rows.map((r) => (
              <tr key={r.index} data-mark={r.index === lastIndex ? 'now' : undefined} className={`border-b border-edge align-top tabular-nums ${r.index === lastIndex ? 'bg-primary-soft' : ''}`}>
                <td className="py-1 pr-2 text-right">{fig(r.receipt)}</td>
                <td className="py-1 pl-2 pr-2 text-xs text-muted">{short(r.date)}</td>
                <td className="py-1 pr-2">{r.label}</td>
                <td className="py-1 pr-2 text-xs">{r.voucher}</td>
                <td className="py-1 pl-2 text-right">{fig(r.total)}</td>
                {heads.map((h) => (
                  <td key={h} className="py-1 pl-2 text-right">
                    {r.head === h ? fig(r.total) : ''}
                  </td>
                ))}
              </tr>
            ))}
            {s.closed && rows.length ? (
              <>
                <tr className="border-t-2 border-edge-deep font-bold tabular-nums">
                  <td />
                  <td />
                  <td className="py-1 pr-2">Total payments</td>
                  <td />
                  <td className="py-1 pl-2 text-right">{fig(t.paid)}</td>
                  {heads.map((h) => (
                    <td key={h} className="py-1 pl-2 text-right">
                      {fig(t.byHead[h])}
                    </td>
                  ))}
                </tr>
                <tr className="tabular-nums">
                  <td />
                  <td className="py-1 pl-2 pr-2 text-xs text-muted">{shortDate(s.m, s.m.lastDay)}</td>
                  <td className="py-1 pr-2">Balance c/d</td>
                  <td />
                  <td className="py-1 pl-2 text-right">{fig(t.balance)}</td>
                  <td colSpan={heads.length} />
                </tr>
                <tr className="border-y-2 border-edge-deep font-extrabold tabular-nums">
                  <td className="py-1 pr-2 text-right">{fig(t.received)}</td>
                  <td />
                  <td />
                  <td />
                  <td className="py-1 pl-2 text-right">{fig(t.received)}</td>
                  <td colSpan={heads.length} />
                </tr>
                <tr className="tabular-nums">
                  <td className="py-1 pr-2 text-right">{fig(t.balance)}</td>
                  <td className="py-1 pl-2 pr-2 text-xs text-muted">{`${reopenDate(s.m).split(' ')[1].slice(0, 3)} 1`}</td>
                  <td className="py-1 pr-2">Balance b/d</td>
                  <td colSpan={2 + heads.length} />
                </tr>
                <tr className="text-xs text-muted">
                  <td colSpan={4} className="py-1">
                    L.F. of the column totals
                  </td>
                  <td />
                  {heads.map((h) => (
                    <td key={h} className="py-1 pl-2 text-right">
                      {posted ? s.folios.get(h) : ''}
                    </td>
                  ))}
                </tr>
              </>
            ) : null}
          </tbody>
        </table>
      </Wide>
    </div>
  );
}

function JournalTable({ s, books }: { s: BookState; books: Books }) {
  const lastIndex = s.cards - 1;
  const posted = s.posted.has('journal');
  return (
    <div className="flex flex-col gap-2">
      <Title note="For what no other book takes. Each entry with its narration.">
        Journal Proper of {s.m.firm}, {s.m.month} {s.m.year}
      </Title>
      {books.journal.length === 0 ? <p className="text-center text-sm text-muted">Nothing written in it yet.</p> : null}
      {books.journal.length ? (
        <Wide>
          <table data-testid={`${P}-table-journal`} className="w-full min-w-[20rem] border-collapse text-sm">
            <caption className="sr-only">Journal Proper</caption>
            <thead>
              <tr className="border-b-2 border-edge-deep">
                <th scope="col" className={TH}>Date</th>
                <th scope="col" className={TH}>Particulars</th>
                <th scope="col" className={TH}>L.F.</th>
                <th scope="col" className={THR}>Dr ₹</th>
                <th scope="col" className={THR}>Cr ₹</th>
              </tr>
            </thead>
            {books.journal.map((e, k) => (
              <tbody key={k} data-mark={e.index === lastIndex ? 'now' : undefined} className={`border-b-2 border-edge ${e.index === lastIndex ? 'bg-primary-soft' : ''}`}>
                {[...e.lines.filter((l) => l.side === 'Dr'), ...e.lines.filter((l) => l.side === 'Cr')].map((l, i) => (
                  <tr key={i} className="tabular-nums">
                    <td className="py-0.5 pr-2 text-xs text-muted">{i === 0 ? shortDate(s.m, Number(e.date.split(' ')[0])) : ''}</td>
                    <td className={`py-0.5 pr-2 ${l.side === 'Cr' ? 'pl-5' : ''}`}>
                      {l.side === 'Cr' ? `To ${ledgerName(l.accountId)}` : (
                        <>
                          {ledgerName(l.accountId)} <span className="font-bold">Dr.</span>
                        </>
                      )}
                    </td>
                    <td className="py-0.5 pr-2 text-xs">{posted ? s.folios.get(l.accountId) : ''}</td>
                    <td className="py-0.5 pl-2 text-right">{l.side === 'Dr' ? fig(l.amount) : ''}</td>
                    <td className="py-0.5 pl-2 text-right">{l.side === 'Cr' ? fig(l.amount) : ''}</td>
                  </tr>
                ))}
                <tr>
                  <td />
                  <td colSpan={4} className="pb-1 text-xs italic text-muted">
                    ({e.narration})
                  </td>
                </tr>
              </tbody>
            ))}
          </table>
        </Wide>
      ) : null}
    </div>
  );
}
