import { formatINR, type Paise } from '@/engine/money';

// ---------------------------------------------------------------------------------------------------------------
// The depreciation lab: the life of one fixed asset, year by year. Every figure the screen shows is worked here.
//
// Conventions (said on the screen too):
//  - the accounting year ends on 31 March; an asset is bought, and sold, on the first day of a month;
//  - depreciation is charged for the whole months of use: from the date of purchase in the first year, up to the
//    date of sale in the year of sale, a full year otherwise;
//  - straight line (SLM): (cost - scrap value) / life, or a rate on the original cost, the same every full year, and
//    never below the scrap value; written down value (WDV): the rate on the opening book value of each year;
//  - every charge is in whole rupees, rounded to the nearest rupee where the figures do not come out whole. Under SLM
//    the yearly charge is rounded once and is the same every full year (a part year is the rounded share of it); the
//    year in which the life runs out takes whatever is left above the scrap value, so the rupee or two lost to the
//    rounding is made good there and the book value ends exactly at the scrap value (or nil);
//  - cost = purchase price + carriage and installation, the spending that makes the asset ready for use.
// ---------------------------------------------------------------------------------------------------------------

export type Method = 'slm' | 'wdv';
/** How the straight line charge is given: by the useful life and scrap value, or by a rate on cost. */
export type SlmBasis = 'life' | 'rate';
export type AssetKind = 'machinery' | 'furniture' | 'vehicles' | 'computers';

export interface AssetInfo {
  /** The account: "Machinery" for Machinery A/c. */
  account: string;
  /** What was bought: "a packing machine". */
  item: string;
  /** How it is named afterwards: "the machine". */
  the: string;
  /** What was spent to make it ready, besides the price. */
  extra: string;
}

export const ASSETS: Record<AssetKind, AssetInfo> = {
  machinery: { account: 'Machinery', item: 'a packing machine', the: 'the machine', extra: 'carriage and installation' },
  furniture: { account: 'Furniture', item: 'showroom furniture', the: 'the furniture', extra: 'carriage and fitting' },
  vehicles: { account: 'Vehicles', item: 'a delivery van', the: 'the van', extra: 'registration and fitting' },
  computers: { account: 'Computers', item: 'a computer server', the: 'the server', extra: 'delivery and installation' },
};

export const MONTHS = ['April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December', 'January', 'February', 'March'] as const;

/** `1 <month>` of the accounting year that starts on 1 April `startYear`; month 0 is April, 11 is March. */
export const firstOf = (startYear: number, month: number): string => `1 ${MONTHS[month]} ${month >= 9 ? startYear + 1 : startYear}`;
/** The year end of the accounting year that starts on 1 April `startYear`. */
export const yearEnd = (startYear: number): string => `31 March ${startYear + 1}`;
/** "2022-23". */
export const yearLabel = (startYear: number): string => `${startYear}-${String((startYear + 1) % 100).padStart(2, '0')}`;

export interface Sale {
  /** The accounting year of the sale, counted from the year of purchase (0). */
  year: number;
  /** Sold on the first of this month (1 is May, 11 is March): the months of use in that year before it. */
  month: number;
  /** What it is sold for (received by cheque). */
  price: Paise;
}

export interface DepInputs {
  asset: AssetKind;
  /** The accounting year of purchase starts on 1 April of this year. */
  startYear: number;
  /** Bought on the first of this month (0 is April). */
  purchaseMonth: number;
  /** The purchase price. */
  price: Paise;
  /** Carriage, installation and the like: part of the cost. */
  extra: Paise;
  method: Method;
  slmBasis: SlmBasis;
  /** Useful life in years (SLM by life). */
  life: number;
  /** Scrap value at the end of the life (SLM by life). */
  scrap: Paise;
  /** % a year: on cost (SLM by rate) or on the opening book value (WDV). */
  rate: number;
  /** Depreciation is collected in a Provision for Depreciation A/c, and the asset stays at cost. */
  provision: boolean;
  /** How many accounting years are followed when the asset is not sold. */
  years: number;
  sale: Sale | null;
}

export interface YearRow {
  /** 0 for the year of purchase. */
  index: number;
  startYear: number;
  /** "2022-23". */
  label: string;
  /** The date the period's depreciation runs from and to: the purchase date or 1 April; 31 March or the date of sale. */
  from: string;
  to: string;
  months: number;
  /** Book value at the start of the period and at its end. */
  opening: Paise;
  charge: Paise;
  closing: Paise;
  /** Depreciation charged so far, before and after this period (the provision when one is kept). */
  writtenBefore: Paise;
  writtenAfter: Paise;
  /** The working of the charge, in a line or two. */
  working: string;
  /** The year ends in the sale. */
  sold: boolean;
}

export interface SaleResult {
  date: string;
  price: Paise;
  /** Book value on the date of sale. */
  bookValue: Paise;
  /** Depreciation written off up to the date of sale. */
  written: Paise;
  /** price - book value: a profit when positive, a loss when negative. */
  result: Paise;
}

export interface Schedule {
  inputs: DepInputs;
  info: AssetInfo;
  cost: Paise;
  purchaseDate: string;
  /** The depreciation of a full year: on cost under SLM; under WDV it changes every year, so this is the first full year's. */
  annual: Paise;
  /** What may be written off in all: cost - scrap (SLM by life), the cost otherwise. */
  depreciable: Paise;
  rows: YearRow[];
  sale: SaleResult | null;
}

/** To the nearest whole rupee. */
export const toRupee = (p: number): Paise => Math.round(p / 100) * 100;
const inr = formatINR;
/** A figure that may have paise, as the working shows it. */
const exact = (p: number): string => formatINR(Math.round(p));

export const costOf = (i: DepInputs): Paise => i.price + i.extra;

/** Whether the inputs describe an asset that can be followed: amounts and dates that make sense together. */
export function problemOf(i: DepInputs): string | null {
  const cost = costOf(i);
  if (!(i.price > 0) || i.extra < 0) return 'The price must be more than nothing.';
  if (i.method === 'slm' && i.slmBasis === 'life') {
    if (!(i.life >= 1)) return 'The useful life must be at least one year.';
    if (i.scrap < 0 || i.scrap >= cost) return 'The scrap value must be less than the cost.';
  } else if (!(i.rate > 0 && i.rate <= 100)) return 'The rate must be between 1% and 100%.';
  if (i.purchaseMonth < 0 || i.purchaseMonth > 11) return 'Pick a month of purchase.';
  if (i.sale) {
    if (i.sale.month < 1 || i.sale.month > 11) return 'An asset is sold on the first of a month from May to March.';
    if (i.sale.year === 0 && i.sale.month <= i.purchaseMonth) return 'The sale must come after the purchase.';
    if (!(i.sale.price > 0)) return 'The selling price must be more than nothing.';
  }
  return null;
}

/** The months of use in the accounting year `index`. */
function monthsIn(i: DepInputs, index: number): number {
  const start = index === 0 ? i.purchaseMonth : 0;
  const end = i.sale && i.sale.year === index ? i.sale.month : 12;
  return end - start;
}

const ofMonths = (m: number): string => (m === 12 ? '' : ` × ${m}/12`);

export function schedule(inputs: DepInputs): Schedule {
  const info = ASSETS[inputs.asset];
  const cost = costOf(inputs);
  const slm = inputs.method === 'slm';
  const byLife = slm && inputs.slmBasis === 'life';
  // The yearly SLM charge, exactly (it may have a fraction of a paisa).
  const yearly = byLife ? (cost - inputs.scrap) / inputs.life : (cost * inputs.rate) / 100;
  const depreciable = byLife ? cost - inputs.scrap : cost;
  const count = inputs.sale ? inputs.sale.year + 1 : inputs.years;
  const rows: YearRow[] = [];
  let used = 0; // months of use so far
  let written = 0;
  for (let index = 0; index < count; index++) {
    const startYear = inputs.startYear + index;
    const months = monthsIn(inputs, index);
    const sold = inputs.sale?.year === index;
    const opening = cost - written;
    let charge: Paise;
    let working: string;
    if (slm) {
      // The same rounded charge every full year; the year the life runs out takes what is left above the scrap value.
      const plain = (yearly * months) / 12;
      const left = Math.max(0, depreciable - written);
      const exactSoFar = (yearly * (used + months)) / 12;
      const lastYear = exactSoFar >= depreciable - 1; // the life (or the whole cost at the rate) runs out in this period
      const capped = exactSoFar > depreciable + 1 && toRupee(plain) > left; // less is left than a period's charge
      charge = lastYear ? left : Math.min(toRupee(plain), left);
      const floor = byLife && inputs.scrap > 0 ? `scrap value of ${inr(inputs.scrap)}` : 'nil value';
      const base = byLife
        ? `${inputs.scrap > 0 ? `(${inr(cost)} - ${inr(inputs.scrap)})` : inr(cost)} / ${inputs.life} years = ${exact(yearly)} a year`
        : `${inputs.rate}% of the cost of ${inr(cost)} = ${exact(yearly)} a year`;
      const part = months === 12 ? '' : `; for ${months} months: ${exact(yearly)}${ofMonths(months)} = ${exact(plain)}`;
      if (charge === 0) working = `Nothing is left to write off above the ${floor}: no depreciation.`;
      else if (capped) working = `${base}${part}, but only ${inr(charge)} is left above the ${floor}, so only ${inr(charge)} is charged.`;
      else if (charge !== toRupee(plain)) working = `${base}${part}. The life runs out this year, so the ${inr(charge)} still left above the ${floor} is charged (the earlier years were rounded to ${inr(toRupee(yearly))}).`;
      else working = `${base}${part}.${Math.round(plain) === charge ? '' : ` Charged: ${inr(charge)} (to the nearest rupee).`}`;
    } else {
      const plain = (opening * inputs.rate * months) / 1200;
      charge = toRupee(plain);
      working = `${inputs.rate}% of the opening book value of ${inr(opening)}${ofMonths(months)} = ${exact(plain)}${Math.round(plain) === charge ? '' : `, charged as ${inr(charge)} (to the nearest rupee)`}.`;
    }
    rows.push({
      index,
      startYear,
      label: yearLabel(startYear),
      from: index === 0 ? firstOf(inputs.startYear, inputs.purchaseMonth) : `1 April ${startYear}`,
      to: sold ? firstOf(startYear, inputs.sale!.month) : yearEnd(startYear),
      months,
      opening,
      charge,
      closing: opening - charge,
      writtenBefore: written,
      writtenAfter: written + charge,
      working,
      sold,
    });
    used += months;
    written += charge;
  }
  const last = rows.at(-1)!;
  const sale: SaleResult | null = inputs.sale
    ? { date: last.to, price: inputs.sale.price, bookValue: last.closing, written: last.writtenAfter, result: inputs.sale.price - last.closing }
    : null;
  // The first full year's charge, for the picture's caption.
  const firstFull = rows.find((r) => r.months === 12);
  const annual = slm ? toRupee(yearly) : toRupee(((firstFull?.opening ?? cost) * inputs.rate) / 100);
  return { inputs, info, cost, purchaseDate: firstOf(inputs.startYear, inputs.purchaseMonth), annual, depreciable, rows, sale };
}

/** A point of the book value line: months since the purchase, and the book value then. */
export interface CurvePoint {
  months: number;
  value: Paise;
  /** "31 March 2024". */
  date: string;
}

/** The book value at the purchase and at the end of each period. */
export function curveOf(s: Schedule): CurvePoint[] {
  const out: CurvePoint[] = [{ months: 0, value: s.cost, date: s.purchaseDate }];
  let m = 0;
  for (const r of s.rows) {
    m += r.months;
    out.push({ months: m, value: r.closing, date: r.to });
  }
  return out;
}

/** The same asset under the other method (and not sold), for the comparison of the two lines. */
export function otherMethod(i: DepInputs, years: number): DepInputs {
  // From WDV the straight line is drawn at the same rate on cost; from SLM the written down value at the rate given.
  return i.method === 'slm' ? { ...i, method: 'wdv', sale: null, years } : { ...i, method: 'slm', slmBasis: 'rate', sale: null, years };
}

export const profitOrLoss = (result: Paise): string => (result > 0 ? `a profit of ${inr(result)}` : result < 0 ? `a loss of ${inr(-result)}` : 'neither a profit nor a loss');
