'use client';

import { formatINR } from '@/engine/money';
import type { Side } from '@/engine/accounts';
import type { LedgerRow, TAccount } from '@/simulator/posting/ledger';
import { accountTitle, CLOSE_DATE, YEAR, type PostingStory } from '@/simulator/posting/story';
import { amountText } from '../kit/format';

// ---------------------------------------------------------------------------------------------------------------
// The pictures of the lab "posting": the journal, the T-accounts of the ledger, the trial balance, and one account
// written as the examination expects it. What each shows is given by a `Picture`, worked out by the screen from
// the steps played (src/simulator/posting/ledger.ts).
// ---------------------------------------------------------------------------------------------------------------

export const P = 'lab-posting';
export const slug = (accountId: string) =>
  accountId
    .replace(/[^a-zA-Z0-9]+/g, '-')
    .replace(/-+$/, '')
    .toLowerCase();
const money = (p: number) => amountText(p);

export interface Picture {
  /** Ledger rows written. */
  rows: ReadonlySet<string>;
  /** Ledger rows about to be written: in place, but not yet seen (where a flying chip lands). */
  pending: ReadonlySet<string>;
  /** Journal lines posted: their L.F. is filled in. */
  posted: ReadonlySet<string>;
  /** The journal line (`<txn>.<line>`) being posted now. */
  current: string | null;
  /** Accounts balanced: 'cd' while the balance is being brought down, 'full' once it is. */
  balanced: ReadonlyMap<string, 'cd' | 'full'>;
  /** Accounts taken to the trial balance, and the one being taken now. */
  listed: ReadonlySet<string>;
  listing: string | null;
  totals: boolean;
  /** The account the step is about. */
  focus: string | null;
}

const sideWord = (s: Side) => (s === 'Dr' ? 'debit' : 'credit');

// ---------------------------------------------------------------------------------------------------------------

export function JournalBook({ story, pic, only }: { story: PostingStory; pic: Pick<Picture, 'posted' | 'current'>; only?: number }) {
  const folios = new Map<string, number>();
  for (const t of story.txns) for (const l of t.lines) if (!folios.has(l.accountId)) folios.set(l.accountId, folios.size + 1);
  const txns = story.txns.map((t, i) => ({ t, i })).filter(({ i }) => only === undefined || i === only);
  return (
    <div className="overflow-x-auto">
      <table data-testid={`${P}-journal`} className="w-full min-w-[17.5rem] border-collapse text-xs sm:text-sm">
        <caption className="sr-only">Journal of {story.business}</caption>
        <thead>
          <tr className="border-b-2 border-edge-deep text-left text-[11px] uppercase tracking-wide text-muted">
            <th scope="col" className="w-11 py-1 pr-1">
              Date
            </th>
            <th scope="col" className="py-1 pr-1">
              Particulars
            </th>
            <th scope="col" className="w-8 py-1 pr-1 text-center">
              L.F.
            </th>
            <th scope="col" className="w-[4.2rem] py-1 pr-1 text-right">
              Dr (₹)
            </th>
            <th scope="col" className="w-[4.2rem] py-1 text-right">
              Cr (₹)
            </th>
          </tr>
          <tr className="text-[11px] text-muted">
            <td className="py-0.5 font-bold">{YEAR}</td>
            <td colSpan={4} />
          </tr>
        </thead>
        <tbody>
          {txns.map(({ t, i }) => (
            <JournalEntryRows key={i} story={story} txn={i} pic={pic} folios={folios} day={t.day} />
          ))}
        </tbody>
      </table>
    </div>
  );
}

function JournalEntryRows({ story, txn, pic, folios, day }: { story: PostingStory; txn: number; pic: Pick<Picture, 'posted' | 'current'>; folios: Map<string, number>; day: number }) {
  const t = story.txns[txn];
  const order = t.lines.map((l, i) => ({ l, i })).sort((a, b) => (a.l.side === b.l.side ? 0 : a.l.side === 'Dr' ? -1 : 1));
  return (
    <>
      {order.map(({ l, i }, k) => {
        const key = `${txn}.${i}`;
        const now = pic.current === key;
        return (
          <tr key={key} data-line={key} className={`align-top ${now ? 'bg-primary-soft' : ''}`}>
            <td className="py-0.5 pr-1 tabular-nums text-muted">{k === 0 ? `Apr ${day}` : ''}</td>
            <td className={`py-0.5 pr-1 ${l.side === 'Cr' ? 'pl-4' : ''} ${now ? 'font-extrabold' : ''}`}>
              {l.side === 'Cr' ? `To ${accountTitle(l.accountId)}` : <>{accountTitle(l.accountId)} <span className="font-bold">Dr.</span></>}
            </td>
            <td data-testid={`${P}-lf-${key}`} className="py-0.5 pr-1 text-center tabular-nums font-bold text-primary-ink">
              {pic.posted.has(key) ? folios.get(l.accountId) : ''}
            </td>
            <td className="py-0.5 pr-1 text-right tabular-nums">{l.side === 'Dr' ? money(l.amount) : ''}</td>
            <td className="py-0.5 text-right tabular-nums">{l.side === 'Cr' ? money(l.amount) : ''}</td>
          </tr>
        );
      })}
      <tr className="border-b border-edge">
        <td />
        <td colSpan={4} className="pb-1.5 text-[11px] italic text-muted">
          (Being {t.narration})
        </td>
      </tr>
    </>
  );
}

// ---------------------------------------------------------------------------------------------------------------

type RowState = 'shown' | 'pending';

function TRow({ row, state, accent, testId }: { row: LedgerRow; state: RowState; accent?: boolean; testId?: string }) {
  return (
    <li
      data-row={row.key}
      data-testid={testId}
      className={`flex flex-wrap items-baseline gap-x-1 rounded px-1 py-0.5 transition-opacity duration-300 ${state === 'pending' ? 'opacity-0' : 'opacity-100'} ${accent ? 'bg-accent-soft font-bold text-accent-ink' : ''}`}
    >
      {/* The date stands above the particulars on a narrow side, beside them on a wide one. */}
      <span className="w-full shrink-0 text-[11px] leading-tight tabular-nums text-muted lg:w-9">{row.date}</span>
      <span className="min-w-0 flex-1">{row.particulars}</span>
      <span className="shrink-0 tabular-nums">{money(row.amount)}</span>
    </li>
  );
}

/**
 * One ledger account as a T: the debit side on the left, the credit side on the right, the postings written so far,
 * and once balanced, "Balance c/d" on the shorter side, the totals level with each other, and "Balance b/d" below.
 */
export function TAccountCard({
  account,
  pic,
  pickSide,
}: {
  account: TAccount;
  pic: Picture;
  /** For "Try it": each side is a button. */
  pickSide?: { chosen: Side | null; onPick(s: Side): void; marks?: Partial<Record<Side, 'right' | 'wrong'>>; testId: (s: Side) => string };
}) {
  const id = account.accountId;
  const state = (r: LedgerRow): RowState | null => (pic.rows.has(r.key) ? 'shown' : pic.pending.has(r.key) ? 'pending' : null);
  const bal = pic.balanced.get(id);
  const focus = pic.focus === id;
  const cd = bal ? account.carriedDown : null;
  const bd = bal ? account.broughtDown : null;
  const side = (s: Side) => {
    const rows = (s === 'Dr' ? account.debit : account.credit).flatMap((r) => {
      const st = state(r);
      return st ? [{ r, st }] : [];
    });
    const body = (
      <>
        <ul className="flex flex-col gap-0.5">
          {rows.map(({ r, st }) => (
            <TRow key={r.key} row={r} state={st} />
          ))}
          {cd && cd.side === s ? <TRow row={cd} state="shown" accent testId={`${P}-acc-${slug(id)}-cd`} /> : null}
        </ul>
        {bal ? (
          <p data-testid={`${P}-acc-${slug(id)}-total-${s}`} className="mt-auto border-y-2 border-double border-edge-deep border-t-edge-deep px-1 text-right font-extrabold tabular-nums">
            <span className="sr-only">Total of the {sideWord(s)} side: </span>
            {money(account.total)}
          </p>
        ) : null}
      </>
    );
    const base = `flex min-h-16 min-w-0 flex-col gap-1 p-1.5 ${s === 'Cr' ? 'border-l-2 border-edge-deep' : ''}`;
    if (!pickSide) {
      return (
        <div data-side={`${id}:${s}`} className={base}>
          <span className="sr-only">{sideWord(s)} side</span>
          {body}
        </div>
      );
    }
    const mark = pickSide.marks?.[s];
    const chosen = pickSide.chosen === s;
    return (
      <button
        type="button"
        data-side={`${id}:${s}`}
        aria-pressed={chosen}
        data-testid={pickSide.testId(s)}
        onClick={() => pickSide.onPick(s)}
        className={`${base} min-h-20 text-left ${mark === 'right' ? 'bg-primary-soft' : mark === 'wrong' ? 'bg-danger-soft' : chosen ? 'bg-primary-soft ring-2 ring-inset ring-primary' : 'hover:bg-sunken'}`}
      >
        <span className="text-xs font-extrabold text-muted">
          {mark === 'right' ? '✓ ' : mark === 'wrong' ? '✗ ' : ''}
          {s === 'Dr' ? 'Debit side' : 'Credit side'} of {account.title}
        </span>
        {body}
      </button>
    );
  };

  return (
    <section
      data-account={id}
      data-testid={`${P}-acc-${slug(id)}`}
      aria-label={`${account.title}, ledger folio ${account.folio}`}
      className={`flex min-w-0 flex-col rounded-card border bg-surface text-xs shadow-card transition-colors sm:text-[13px] ${focus ? 'border-primary ring-2 ring-primary/40' : 'border-edge'}`}
    >
      <header className="flex items-baseline justify-between gap-2 px-2 pt-1.5">
        <span className="text-[11px] font-bold text-muted">Dr.</span>
        <h4 className="min-w-0 text-center text-sm font-extrabold">
          {account.title} <span className="text-[11px] font-bold text-muted">(L.F. {account.folio})</span>
        </h4>
        <span className="text-[11px] font-bold text-muted">Cr.</span>
      </header>
      <div className="mt-1 grid grid-cols-2 border-t-2 border-edge-deep">
        {side('Dr')}
        {side('Cr')}
      </div>
      {bd ? (
        <div className="grid grid-cols-2">
          <ul className="px-1.5 pb-1.5">{bd.side === 'Dr' ? <TRow row={bd} state={bal === 'full' ? 'shown' : 'pending'} testId={`${P}-acc-${slug(id)}-bd`} /> : null}</ul>
          <ul className="border-l-2 border-edge-deep px-1.5 pb-1.5">{bd.side === 'Cr' ? <TRow row={bd} state={bal === 'full' ? 'shown' : 'pending'} testId={`${P}-acc-${slug(id)}-bd`} /> : null}</ul>
        </div>
      ) : bal ? (
        <p className="px-2 pb-1.5 text-[11px] font-bold text-muted">No balance: the two sides are equal.</p>
      ) : null}
    </section>
  );
}

// ---------------------------------------------------------------------------------------------------------------

/** The trial balance by the balance method, its rows coming in one by one. */
export function TrialBalanceTable({ business, ledger, pic }: { business: string; ledger: readonly TAccount[]; pic: Picture }) {
  const rows = ledger.filter((a) => a.balance && (pic.listed.has(a.accountId) || pic.listing === a.accountId));
  const leftOut = ledger.filter((a) => !a.balance && pic.listed.has(a.accountId));
  const total = (s: Side) => ledger.filter((a) => a.balance?.side === s).reduce((t, a) => t + a.balance!.amount, 0);
  const dr = total('Dr');
  const cr = total('Cr');
  return (
    <section aria-labelledby={`${P}-tb-title`} className="flex flex-col gap-1 rounded-card border border-edge bg-surface p-3 shadow-card">
      <h4 id={`${P}-tb-title`} className="text-center text-sm font-extrabold">
        Trial Balance of {business} as on {CLOSE_DATE}
      </h4>
      <div className="overflow-x-auto">
        <table data-testid={`${P}-tb`} className="w-full min-w-[18rem] border-collapse text-xs sm:text-sm">
          <thead>
            <tr className="border-y-2 border-edge-deep text-left text-[11px] uppercase tracking-wide text-muted">
              <th scope="col" className="py-1 pr-1">
                Name of account
              </th>
              <th scope="col" className="w-8 py-1 pr-1 text-center">
                L.F.
              </th>
              <th scope="col" className="w-[5.2rem] py-1 pr-1 text-right">
                Debit (₹)
              </th>
              <th scope="col" className="w-[5.2rem] py-1 text-right">
                Credit (₹)
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={4} className="py-2 text-center text-muted">
                  The balances come here once the accounts are balanced.
                </td>
              </tr>
            ) : null}
            {rows.map((a) => {
              const pending = pic.listing === a.accountId && !pic.listed.has(a.accountId);
              const b = a.balance!;
              return (
                <tr key={a.accountId} data-testid={`${P}-tb-row-${slug(a.accountId)}`} className={`border-b border-edge transition-opacity duration-300 ${pending ? 'opacity-0' : ''} ${pic.listing === a.accountId ? 'bg-primary-soft' : ''}`}>
                  <td className="py-0.5 pr-1">{a.title}</td>
                  <td className="py-0.5 pr-1 text-center tabular-nums">{a.folio}</td>
                  <td data-tb={`${a.accountId}:Dr`} className="py-0.5 pr-1 text-right tabular-nums">
                    {b.side === 'Dr' ? money(b.amount) : ''}
                  </td>
                  <td data-tb={`${a.accountId}:Cr`} className="py-0.5 text-right tabular-nums">
                    {b.side === 'Cr' ? money(b.amount) : ''}
                  </td>
                </tr>
              );
            })}
            {pic.totals ? (
              <tr className="border-y-2 border-double border-edge-deep font-extrabold">
                <td className="py-1 pr-1">Total</td>
                <td />
                <td data-testid={`${P}-tb-debit-total`} className="py-1 pr-1 text-right tabular-nums">
                  {money(dr)}
                </td>
                <td data-testid={`${P}-tb-credit-total`} className="py-1 text-right tabular-nums">
                  {money(cr)}
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
      {leftOut.length > 0 ? <p className="text-xs text-muted">Left out, having no balance: {leftOut.map((a) => a.title).join(', ')}.</p> : null}
      {pic.totals ? (
        <p data-testid={`${P}-tb-verdict`} className={`text-sm font-extrabold ${dr === cr ? 'text-primary-ink' : 'text-danger-deep'}`}>
          {dr === cr ? `✓ The totals agree: ${formatINR(dr)} on each side.` : `✗ The totals differ by ${formatINR(Math.abs(dr - cr))}.`}
        </p>
      ) : null}
    </section>
  );
}

// ---------------------------------------------------------------------------------------------------------------

/** One account as it is written in the examination: Date, Particulars, J.F. and Amount on each side. */
export function BoardAccount({ account }: { account: TAccount }) {
  const side = (s: Side) => {
    const rows = [...(s === 'Dr' ? account.debit : account.credit), ...(account.carriedDown?.side === s ? [account.carriedDown] : [])];
    return rows;
  };
  const dr = side('Dr');
  const cr = side('Cr');
  const n = Math.max(dr.length, cr.length);
  const cell = (r: LedgerRow | undefined, left: boolean) => (
    <>
      <td className={`py-0.5 pr-1 tabular-nums ${left ? '' : 'pl-2'}`}>{r ? r.date : ''}</td>
      <td className="py-0.5 pr-1">{r ? r.particulars : ''}</td>
      <td className="py-0.5 pr-1 text-center">{r ? r.jf : ''}</td>
      <td className={`py-0.5 text-right tabular-nums ${left ? 'border-r-2 border-edge-deep pr-2' : ''}`}>{r ? money(r.amount) : ''}</td>
    </>
  );
  return (
    <div className="overflow-x-auto">
      <table data-testid={`${P}-board`} className="w-full min-w-[34rem] border-collapse text-xs sm:text-sm">
        <caption className="pb-1 text-sm font-extrabold">
          <span className="float-left text-xs font-bold text-muted">Dr.</span>
          {account.title}
          <span className="float-right text-xs font-bold text-muted">Cr.</span>
        </caption>
        <thead>
          <tr className="border-y-2 border-edge-deep text-left text-[11px] uppercase tracking-wide text-muted">
            <th className="py-1 pr-1">Date</th>
            <th className="py-1 pr-1">Particulars</th>
            <th className="py-1 pr-1 text-center">J.F.</th>
            <th className="border-r-2 border-edge-deep py-1 pr-2 text-right">Amount (₹)</th>
            <th className="py-1 pl-2 pr-1">Date</th>
            <th className="py-1 pr-1">Particulars</th>
            <th className="py-1 pr-1 text-center">J.F.</th>
            <th className="py-1 text-right">Amount (₹)</th>
          </tr>
          <tr className="text-[11px] text-muted">
            <td className="font-bold">{YEAR}</td>
            <td colSpan={3} className="border-r-2 border-edge-deep" />
            <td className="pl-2 font-bold">{YEAR}</td>
            <td colSpan={3} />
          </tr>
        </thead>
        <tbody>
          {Array.from({ length: n }, (_, i) => (
            <tr key={i} className="align-top">
              {cell(dr[i], true)}
              {cell(cr[i], false)}
            </tr>
          ))}
          <tr className="border-y-2 border-double border-edge-deep font-extrabold">
            <td colSpan={3} />
            <td className="border-r-2 border-edge-deep py-1 pr-2 text-right tabular-nums">{money(account.total)}</td>
            <td colSpan={3} />
            <td className="py-1 text-right tabular-nums">{money(account.total)}</td>
          </tr>
          {account.broughtDown ? (
            <tr>
              {cell(account.broughtDown.side === 'Dr' ? account.broughtDown : undefined, true)}
              {cell(account.broughtDown.side === 'Cr' ? account.broughtDown : undefined, false)}
            </tr>
          ) : null}
        </tbody>
      </table>
    </div>
  );
}
