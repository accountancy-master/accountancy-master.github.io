import { formatINR, type Paise } from '@/engine/money';
import { profitOrLoss, yearEnd, type Schedule } from './schedule';

// ---------------------------------------------------------------------------------------------------------------
// The life of the asset as events (bought, depreciated year by year, sold), each told in words with its journal
// entries, and the accounts written up as the board writes them. Event 0 is the purchase, event r + 1 the charge of
// period r, and the sale (if any) comes last. A row of an account carries the event that writes it (`at`), so the
// screen can show an account as it stands after any event.
// ---------------------------------------------------------------------------------------------------------------

const inr = formatINR;

export const PROVISION = 'Provision for Depreciation A/c';
export const DEPRECIATION = 'Depreciation A/c';
export const DISPOSAL = 'Asset Disposal A/c';
export const BANK = 'Bank A/c';
export const PROFIT_AND_LOSS = 'Profit and Loss A/c';
export const PROFIT_ON_SALE = 'Profit on Sale of Asset A/c';
export const LOSS_ON_SALE = 'Loss on Sale of Asset A/c';

export interface JournalLine {
  account: string;
  side: 'Dr' | 'Cr';
  amount: Paise;
}

export interface JournalEntry {
  date: string;
  lines: JournalLine[];
  /** "Being depreciation charged for the year". */
  narration: string;
}

export type EventKind = 'buy' | 'charge' | 'sale';

export interface DepEvent {
  kind: EventKind;
  /** The period of a charge. */
  row: number | null;
  date: string;
  /** A short name: "Year 2023-24". */
  title: string;
  /** What moves and why, in a sentence or three. */
  text: string;
  entries: JournalEntry[];
}

export const assetAccount = (s: Schedule): string => `${s.info.account} A/c`;

const dr = (account: string, amount: Paise): JournalLine => ({ account, side: 'Dr', amount });
const cr = (account: string, amount: Paise): JournalLine => ({ account, side: 'Cr', amount });

export function eventsOf(s: Schedule): DepEvent[] {
  const A = assetAccount(s);
  const i = s.inputs;
  const out: DepEvent[] = [];
  const ready = i.extra > 0 ? ` and ${inr(i.extra)} is spent on its ${s.info.extra}. Both make it ready for use, so its cost is ${inr(i.price)} + ${inr(i.extra)} = ${inr(s.cost)}` : `. Its cost is ${inr(s.cost)}`;
  out.push({
    kind: 'buy',
    row: null,
    date: s.purchaseDate,
    title: 'Bought',
    text: `${s.purchaseDate}: ${s.info.item} is bought for ${inr(i.price)}${ready}. ${A} is debited with the cost and Bank A/c credited.`,
    entries: [{ date: s.purchaseDate, lines: [dr(A, s.cost), cr(BANK, s.cost)], narration: `Being ${s.info.item} bought${i.extra > 0 ? ` and its ${s.info.extra} paid for` : ''} by cheque` }],
  });
  for (const r of s.rows) {
    const to = i.provision ? PROVISION : A;
    const lead = r.sold ? `${r.to}: ${s.info.the} is to be sold today, so it is first depreciated up to the date of sale, ${r.months} months from ${r.from}.` : `${r.to}: ${r.months === 12 ? 'a full year of use' : `${r.months} months of use, from ${r.from}`}.`;
    const where = r.charge === 0
      ? `${A} stays at ${inr(i.provision ? s.cost : r.closing)}.`
      : i.provision
        ? `Depreciation A/c is debited and Provision for Depreciation A/c credited, so ${A} stays at its cost of ${inr(s.cost)} and the provision grows to ${inr(r.writtenAfter)}: book value ${inr(s.cost)} - ${inr(r.writtenAfter)} = ${inr(r.closing)}.`
        : `Depreciation A/c is debited and ${A} itself credited, so the account falls to the book value, ${inr(r.closing)}.`;
    const pl = r.charge > 0 ? ` On 31 March the ${inr(r.charge)} goes to Profit and Loss A/c: an expense of ${r.label}, though no cash moves.` : '';
    const entries: JournalEntry[] = r.charge > 0
      ? [
          { date: r.to, lines: [dr(DEPRECIATION, r.charge), cr(to, r.charge)], narration: `Being depreciation ${r.sold ? 'charged up to the date of sale' : `charged for ${r.label}`}` },
          { date: yearEnd(r.startYear), lines: [dr(PROFIT_AND_LOSS, r.charge), cr(DEPRECIATION, r.charge)], narration: 'Being depreciation transferred to Profit and Loss A/c' },
        ]
      : [];
    out.push({ kind: 'charge', row: r.index, date: r.to, title: `Year ${r.label}`, text: `${lead} ${r.working} ${where}${pl}`, entries });
  }
  if (s.sale) {
    const { date, price, bookValue, written, result } = s.sale;
    const gap = Math.abs(result);
    const verdict = `book value ${inr(bookValue)}, price ${inr(price)}: ${profitOrLoss(result)}`;
    if (i.provision) {
      const close: JournalEntry[] = result === 0 ? [] : [result > 0
        ? { date, lines: [dr(DISPOSAL, gap), cr(PROFIT_ON_SALE, gap)], narration: 'Being the profit on sale transferred' }
        : { date, lines: [dr(LOSS_ON_SALE, gap), cr(DISPOSAL, gap)], narration: 'Being the loss on sale transferred' }];
      out.push({
        kind: 'sale',
        row: null,
        date,
        title: 'Sold',
        text: `${date}: ${s.info.the} is sold for ${inr(price)} by cheque. Its cost of ${inr(s.cost)} leaves ${A} for Asset Disposal A/c (debit); the provision of ${inr(written)} built up on it is transferred there (credit), and so is the price (credit). What is left in Asset Disposal A/c is the result: book value ${inr(bookValue)} against the price of ${inr(price)}, ${profitOrLoss(result)}${result === 0 ? '' : `, transferred to ${result > 0 ? PROFIT_ON_SALE : LOSS_ON_SALE}`}.`,
        entries: [
          { date, lines: [dr(DISPOSAL, s.cost), cr(A, s.cost)], narration: `Being the cost of ${s.info.the} sold transferred to Asset Disposal A/c` },
          { date, lines: [dr(PROVISION, written), cr(DISPOSAL, written)], narration: `Being the depreciation provided on ${s.info.the} sold transferred to Asset Disposal A/c` },
          { date, lines: [dr(BANK, price), cr(DISPOSAL, price)], narration: `Being ${s.info.the} sold and the price received by cheque` },
          ...close,
        ],
      });
    } else {
      // As NCERT journalises it, and as Asset A/c shows it: the whole price credited to the asset, then the profit or
      // loss transferred out of it. (One compound entry, Bank Dr and Loss on Sale Dr, To the asset with the book value
      // and To Profit on Sale, comes to the same.)
      const close: JournalEntry[] = result === 0 ? [] : [result > 0
        ? { date, lines: [dr(A, gap), cr(PROFIT_ON_SALE, gap)], narration: 'Being the profit on sale transferred' }
        : { date, lines: [dr(LOSS_ON_SALE, gap), cr(A, gap)], narration: 'Being the loss on sale transferred' }];
      out.push({
        kind: 'sale',
        row: null,
        date,
        title: 'Sold',
        text: `${date}: ${s.info.the} is sold for ${inr(price)} by cheque. Bank A/c is debited and ${A} credited with the whole price. ${A} stood at the book value, so what is left in it is the result: ${verdict}${result === 0 ? '' : `, transferred ${result > 0 ? `by debiting ${A} and crediting ${PROFIT_ON_SALE}` : `by debiting ${LOSS_ON_SALE} and crediting ${A}`}`}, and the account is closed. The price is compared with the book value, never with the cost.`,
        entries: [{ date, lines: [dr(BANK, price), cr(A, price)], narration: `Being ${s.info.the} sold and the price received by cheque` }, ...close],
      });
    }
  }
  return out;
}

// ---------------------------------------------------------------------------------------------------------------
// The accounts.
// ---------------------------------------------------------------------------------------------------------------

export interface LedgerRow {
  date: string;
  /** "To Bank A/c", "By Balance c/d". */
  particulars: string;
  amount: Paise;
  /** The event that writes the row. */
  at: number;
  /** A line under the particulars: "(₹1,80,000 + ₹20,000)". */
  note?: string;
}

export interface LedgerPeriod {
  /** "Year 2023-24". */
  title: string;
  dr: LedgerRow[];
  cr: LedgerRow[];
}

export type AccountId = 'asset' | 'provision' | 'depreciation' | 'disposal';

export interface LedgerAccount {
  id: AccountId;
  title: string;
  periods: LedgerPeriod[];
}

export const saleEvent = (s: Schedule): number => s.rows.length + 1;

export function ledgerOf(s: Schedule): LedgerAccount[] {
  const A = assetAccount(s);
  const i = s.inputs;
  const sold = saleEvent(s);
  const sale = s.sale;
  const asset: LedgerPeriod[] = [];
  for (const r of s.rows) {
    const dr: LedgerRow[] = [];
    const cr: LedgerRow[] = [];
    const balance = i.provision ? s.cost : r.opening;
    if (r.index === 0) dr.push({ date: s.purchaseDate, particulars: `To ${BANK}`, amount: s.cost, at: 0, ...(i.extra > 0 ? { note: `(${inr(i.price)} + ${inr(i.extra)})` } : {}) });
    else if (balance > 0) dr.push({ date: `1 April ${r.startYear}`, particulars: 'To Balance b/d', amount: balance, at: r.index });
    else break; // written off to nothing: the account is closed
    if (!i.provision && r.charge > 0) cr.push({ date: r.to, particulars: `By ${DEPRECIATION}`, amount: r.charge, at: r.index + 1 });
    if (r.sold && sale) {
      if (i.provision) cr.push({ date: sale.date, particulars: `By ${DISPOSAL}`, amount: s.cost, at: sold });
      else {
        cr.push({ date: sale.date, particulars: `By ${BANK}`, amount: sale.price, at: sold });
        if (sale.result < 0) cr.push({ date: sale.date, particulars: `By ${LOSS_ON_SALE}`, amount: -sale.result, at: sold });
        if (sale.result > 0) dr.push({ date: sale.date, particulars: `To ${PROFIT_ON_SALE}`, amount: sale.result, at: sold });
      }
    } else {
      const left = i.provision ? s.cost : r.closing;
      if (left > 0) cr.push({ date: yearEnd(r.startYear), particulars: 'By Balance c/d', amount: left, at: r.index + 1 });
    }
    asset.push({ title: `Year ${r.label}`, dr, cr });
  }
  const accounts: LedgerAccount[] = [{ id: 'asset', title: A, periods: asset }];

  if (i.provision) {
    const provision: LedgerPeriod[] = [];
    for (const r of s.rows) {
      if (r.writtenAfter === 0) continue;
      const dr: LedgerRow[] = [];
      const cr: LedgerRow[] = [];
      if (r.writtenBefore > 0) cr.push({ date: `1 April ${r.startYear}`, particulars: 'By Balance b/d', amount: r.writtenBefore, at: r.index });
      if (r.charge > 0) cr.push({ date: r.to, particulars: `By ${DEPRECIATION}`, amount: r.charge, at: r.index + 1 });
      if (r.sold && sale) dr.push({ date: sale.date, particulars: `To ${DISPOSAL}`, amount: r.writtenAfter, at: sold });
      else dr.push({ date: yearEnd(r.startYear), particulars: 'To Balance c/d', amount: r.writtenAfter, at: r.index + 1 });
      provision.push({ title: `Year ${r.label}`, dr, cr });
    }
    accounts.push({ id: 'provision', title: PROVISION, periods: provision });
  }

  const depreciation: LedgerPeriod[] = s.rows
    .filter((r) => r.charge > 0)
    .map((r) => ({
      title: `Year ${r.label}`,
      dr: [{ date: r.to, particulars: `To ${i.provision ? PROVISION : A}`, amount: r.charge, at: r.index + 1 }],
      cr: [{ date: yearEnd(r.startYear), particulars: `By ${PROFIT_AND_LOSS}`, amount: r.charge, at: r.index + 1 }],
    }));
  accounts.push({ id: 'depreciation', title: DEPRECIATION, periods: depreciation });

  if (i.provision && sale) {
    const dr: LedgerRow[] = [{ date: sale.date, particulars: `To ${A}`, amount: s.cost, at: sold }];
    const cr: LedgerRow[] = [
      { date: sale.date, particulars: `By ${PROVISION}`, amount: sale.written, at: sold },
      { date: sale.date, particulars: `By ${BANK}`, amount: sale.price, at: sold },
    ];
    if (sale.result > 0) dr.push({ date: sale.date, particulars: `To ${PROFIT_ON_SALE}`, amount: sale.result, at: sold });
    if (sale.result < 0) cr.push({ date: sale.date, particulars: `By ${LOSS_ON_SALE}`, amount: -sale.result, at: sold });
    accounts.push({ id: 'disposal', title: DISPOSAL, periods: [{ title: `Year ${s.rows.at(-1)!.label}`, dr, cr }] });
  }
  return accounts;
}

/** An account as it stands once `shown` events have played: the rows written so far, periods with nothing yet left out. */
export function accountAsAt(a: LedgerAccount, shown: number): LedgerPeriod[] {
  return a.periods
    .map((p) => ({ ...p, dr: p.dr.filter((r) => r.at < shown), cr: p.cr.filter((r) => r.at < shown) }))
    .filter((p) => p.dr.length + p.cr.length > 0);
}

/** A period is complete, and its totals are shown, once every row of it is written. */
export const periodComplete = (full: LedgerPeriod, shown: number): boolean => [...full.dr, ...full.cr].every((r) => r.at < shown);

export const total = (rows: readonly LedgerRow[]): Paise => rows.reduce((t, r) => t + r.amount, 0);

// ---------------------------------------------------------------------------------------------------------------
// Where the asset stands after `shown` events.
// ---------------------------------------------------------------------------------------------------------------

export interface Standing {
  /** The balance of the asset account. */
  assetAccount: Paise;
  /** The balance of Provision for Depreciation A/c (0 when none is kept). */
  provision: Paise;
  /** Depreciation written off so far. */
  written: Paise;
  bookValue: Paise;
  /** The depreciation of the last event played (0 if it was not a charge). */
  lastCharge: Paise;
  sold: boolean;
  /** The date the picture stands at. */
  date: string;
}

export function standingAfter(s: Schedule, shown: number): Standing {
  const charged = s.rows.slice(0, Math.max(0, Math.min(shown - 1, s.rows.length)));
  const written = charged.reduce((t, r) => t + r.charge, 0);
  const sold = !!s.sale && shown > s.rows.length + 1;
  const last = shown >= 2 && shown - 2 < s.rows.length ? s.rows[shown - 2] : null;
  const events = eventsOf(s);
  const date = shown > 0 ? events[Math.min(shown, events.length) - 1].date : s.purchaseDate;
  if (shown === 0) return { assetAccount: 0, provision: 0, written: 0, bookValue: 0, lastCharge: 0, sold: false, date };
  if (sold) return { assetAccount: 0, provision: 0, written, bookValue: 0, lastCharge: 0, sold: true, date };
  const bookValue = s.cost - written;
  return {
    assetAccount: s.inputs.provision ? s.cost : bookValue,
    provision: s.inputs.provision ? written : 0,
    written,
    bookValue,
    lastCharge: last?.charge ?? 0,
    sold: false,
    date,
  };
}

/** The asset as the Balance Sheet shows it after `shown` events, line by line. */
export function balanceSheetLines(s: Schedule, shown: number): { label: string; amount: Paise; less?: boolean; total?: boolean }[] {
  const st = standingAfter(s, shown);
  if (shown === 0 || st.sold) return [];
  if (!s.inputs.provision) return [{ label: s.info.account, amount: st.bookValue, total: true }];
  return [
    { label: `${s.info.account} (at cost)`, amount: s.cost },
    { label: 'Less: Provision for Depreciation', amount: st.provision, less: true },
    { label: 'Book value', amount: st.bookValue, total: true },
  ];
}

/** The asset and the choices made, in a sentence or two: what a walk-through or a question is about. */
export function describe(s: Schedule): string {
  const i = s.inputs;
  const bought = `${s.info.item[0].toUpperCase()}${s.info.item.slice(1)} bought on ${s.purchaseDate} for ${inr(i.price)}${i.extra > 0 ? `, with ${inr(i.extra)} spent on its ${s.info.extra}` : ''}: cost ${inr(s.cost)}.`;
  const method =
    i.method === 'wdv'
      ? `Written down value method at ${i.rate}% a year on the opening book value.`
      : i.slmBasis === 'rate'
        ? `Straight line method at ${i.rate}% a year on the original cost.`
        : `Straight line method: useful life ${i.life} years, scrap value ${inr(i.scrap)}.`;
  const kept = i.provision ? 'A Provision for Depreciation A/c is kept.' : `Depreciation is written off ${assetAccount(s)} itself.`;
  const sold = s.sale ? ` Sold on ${s.sale.date} for ${inr(s.sale.price)}.` : '';
  return `${bought} ${method} ${kept}${sold}`;
}
