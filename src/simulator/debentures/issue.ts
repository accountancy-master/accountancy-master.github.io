import { formatINR, type Paise } from '@/engine/money';

// ---------------------------------------------------------------------------------------------------------------
// The lab "debentures": one issue of debentures in its year, as the topic `debentures` teaches it (CBSE 2025-26:
// the ISSUE only; redemption is outside the syllabus, so a premium payable on redemption appears only as it is
// provided for at the time of issue).
//
// Conventions, the same as the topic's generators (src/generators/templates/debentures.ts):
//  - the debentures account is always credited with the nominal (face) value;
//  - a premium on issue is credited to Securities Premium A/c; a discount on issue alone goes to Discount on Issue of
//    Debentures A/c; once a premium is payable on redemption, the whole loss (the discount, if any, plus that
//    premium) goes to Loss on Issue of Debentures A/c, and Premium on Redemption of Debentures A/c is credited;
//  - the discount or loss is written off on 31 March of the year of allotment, first from Securities Premium (the
//    premium received on the same issue included) and the rest from the Statement of Profit and Loss;
//  - the whole issue price comes with the application, through Debenture Application and Allotment A/c;
//  - interest is on the nominal value, falls due half-yearly on 30 September and 31 March and is paid by cheque on
//    the day; no tax is deducted at source; the accounting year ends on 31 March;
//  - debentures to a vendor: the number is the price to be settled divided by the issue price of one debenture;
//  - debentures as collateral security carry no interest: the lender earns interest on the loan. First method: no
//    entry, a note under the loan; second method: Debenture Suspense A/c Dr; To % Debentures A/c, the suspense
//    account deducted from the debentures in the balance sheet.
// Every figure is in paise; the terms are chosen so that every figure comes to whole rupees.
// ---------------------------------------------------------------------------------------------------------------

export type IssueAt = 'par' | 'premium' | 'discount';
export type RedeemAt = 'par' | 'premium';
/** How the debentures are issued: to the public for cash, to a vendor for an asset, or to a lender as collateral security. */
export type Route = 'cash' | 'vendor' | 'collateral';
/** Collateral security: no entry with a note (the first method), or through Debenture Suspense A/c (the second). */
export type Method = 'note' | 'suspense';
export type AllotMonth = 'April' | 'July' | 'October' | 'January';
export type AssetKind = 'Machinery' | 'Building' | 'Furniture';

export const ALLOT_MONTHS: readonly AllotMonth[] = ['April', 'July', 'October', 'January'];
/** The months from the first of the month of allotment to 31 March. */
export const MONTHS_TO_MARCH: Record<AllotMonth, number> = { April: 12, July: 9, October: 6, January: 3 };

export interface DebInput {
  company: string;
  route: Route;
  /** The number of debentures (for cash or as collateral). For a vendor it follows from the price. */
  n: number;
  /** Face value of one debenture, in rupees. */
  face: number;
  /** Rate of interest, % a year. */
  rate: number;
  issueAt: IssueAt;
  /** The premium or discount on issue, % of the face value. */
  issuePct: number;
  redeemAt: RedeemAt;
  /** The premium on redemption, % of the face value. */
  redPct: number;
  /** Redeemable after so many years (a term of issue only). */
  years: number;
  /** Allotted on the first of this month. */
  month: AllotMonth;
  /** The accounting year begins on 1 April of this year and ends on 31 March of the next. */
  year: number;
  /** The balance of Securities Premium A/c before this issue. */
  spBefore: Paise;
  vendor: { name: string; asset: AssetKind; price: Paise };
  loan: { amount: Paise; rate: number; method: Method };
}

/** The six cases of issue with terms of redemption, in the order the topic lists them. */
export const CASES = [
  { id: 'par-par', issueAt: 'par', redeemAt: 'par', label: 'Issued at par, redeemable at par' },
  { id: 'discount-par', issueAt: 'discount', redeemAt: 'par', label: 'Issued at a discount, redeemable at par' },
  { id: 'premium-par', issueAt: 'premium', redeemAt: 'par', label: 'Issued at a premium, redeemable at par' },
  { id: 'par-premium', issueAt: 'par', redeemAt: 'premium', label: 'Issued at par, redeemable at a premium' },
  { id: 'discount-premium', issueAt: 'discount', redeemAt: 'premium', label: 'Issued at a discount, redeemable at a premium' },
  { id: 'premium-premium', issueAt: 'premium', redeemAt: 'premium', label: 'Issued at a premium, redeemable at a premium' },
] as const satisfies readonly { id: string; issueAt: IssueAt; redeemAt: RedeemAt; label: string }[];
export type CaseId = (typeof CASES)[number]['id'];
export const caseOf = (i: Pick<DebInput, 'issueAt' | 'redeemAt'>): CaseId => `${i.issueAt}-${i.redeemAt}` as CaseId;

// --- Names ---------------------------------------------------------------------------------------------------------

export const BANK = 'Bank A/c';
export const DAA = 'Debenture Application and Allotment A/c';
export const SP = 'Securities Premium A/c';
export const PREM_RED = 'Premium on Redemption of Debentures A/c';
export const DISCOUNT = 'Discount on Issue of Debentures A/c';
export const LOSS = 'Loss on Issue of Debentures A/c';
export const INTEREST = 'Debenture Interest A/c';
export const HOLDERS = 'Debentureholders A/c';
export const SPL = 'Statement of Profit and Loss';
export const BANK_LOAN = 'Bank Loan A/c';
export const SUSPENSE = 'Debenture Suspense A/c';
export const INTEREST_PAID = 'Interest Paid A/c';
export const debenturesAc = (rate: number): string => `${rate}% Debentures A/c`;
export const assetAc = (k: AssetKind): string => `${k} A/c`;

const inr = formatINR;
const GROUPED = new Intl.NumberFormat('en-IN');
/** A number of debentures with the Indian grouping: 12,000. */
export const count = (n: number): string => GROUPED.format(n);

// --- The figures of an issue -----------------------------------------------------------------------------------------

export interface Figures {
  /** Per debenture. */
  face: Paise;
  premium: Paise;
  discount: Paise;
  onRedemption: Paise;
  issuePrice: Paise;
  redemptionPrice: Paise;
  /** The number of debentures (for a vendor, the price over the issue price). */
  n: number;
  /** For the whole issue. */
  nominal: Paise;
  money: Paise;
  premiumTotal: Paise;
  discountTotal: Paise;
  onRedemptionTotal: Paise;
  /** Discount + premium on redemption. */
  loss: Paise;
  /** The account the loss is debited to: Loss on Issue once a premium is payable on redemption, else Discount on Issue. */
  lossAccount: string;
  /** "loss" or "discount", as the topic names it. */
  lossWord: 'loss' | 'discount';
  /** Securities Premium available to write the loss off: the balance before and the premium of this issue. */
  available: Paise;
  fromSp: Paise;
  fromPl: Paise;
  spLeft: Paise;
  /** Months from allotment to 31 March. */
  months: number;
  /** The interest of each half-year falling due in the year: [to 30 September, to 31 March]; nil where none. */
  halves: [Paise, Paise];
  interest: Paise;
  /** Interest on the loan for the year (collateral security). */
  loanInterest: Paise;
  /** Finance costs of the year: the interest and what Securities Premium could not bear. */
  financeCosts: Paise;
}

export function figures(i: DebInput): Figures {
  const face = i.face * 100;
  const premium = i.issueAt === 'premium' ? (face * i.issuePct) / 100 : 0;
  const discount = i.issueAt === 'discount' ? (face * i.issuePct) / 100 : 0;
  const onRedemption = i.redeemAt === 'premium' ? (face * i.redPct) / 100 : 0;
  const issuePrice = face + premium - discount;
  const n = i.route === 'vendor' ? i.vendor.price / issuePrice : i.n;
  const months = MONTHS_TO_MARCH[i.month];
  if (i.route === 'collateral') {
    const nominal = n * face;
    const loanInterest = (i.loan.amount * i.loan.rate * months) / 1200;
    return {
      face, premium: 0, discount: 0, onRedemption: 0, issuePrice: face, redemptionPrice: face, n, nominal, money: 0,
      premiumTotal: 0, discountTotal: 0, onRedemptionTotal: 0, loss: 0, lossAccount: DISCOUNT, lossWord: 'discount',
      available: i.spBefore, fromSp: 0, fromPl: 0, spLeft: i.spBefore, months, halves: [0, 0], interest: 0, loanInterest, financeCosts: loanInterest,
    };
  }
  const nominal = n * face;
  const premiumTotal = n * premium;
  const discountTotal = n * discount;
  const onRedemptionTotal = n * onRedemption;
  const loss = discountTotal + onRedemptionTotal;
  const available = i.spBefore + premiumTotal;
  const fromSp = Math.min(loss, available);
  const fromPl = loss - fromSp;
  const half = (m: number) => (nominal * i.rate * m) / 1200;
  const halves: [Paise, Paise] = [half(Math.max(0, months - 6)), half(Math.min(months, 6))];
  const interest = halves[0] + halves[1];
  return {
    face, premium, discount, onRedemption, issuePrice, redemptionPrice: face + onRedemption, n, nominal, money: n * issuePrice,
    premiumTotal, discountTotal, onRedemptionTotal, loss,
    lossAccount: onRedemption > 0 ? LOSS : DISCOUNT,
    lossWord: onRedemption > 0 ? 'loss' : 'discount',
    available, fromSp, fromPl, spLeft: available - fromSp, months, halves, interest, loanInterest: 0, financeCosts: interest + fromPl,
  };
}

/** What makes a sandbox input impossible, said plainly; null when it can be played. */
export function problemOf(i: DebInput): string | null {
  if (!Number.isInteger(i.face) || i.face <= 0 || i.face % 100 !== 0) return 'The face value must be a whole number of hundreds of rupees.';
  if (i.issueAt !== 'par' && !(i.issuePct >= 1 && i.issuePct <= (i.issueAt === 'discount' ? 20 : 50))) return i.issueAt === 'discount' ? 'Give a discount from 1% to 20%.' : 'Give a premium on issue from 1% to 50%.';
  if (i.redeemAt === 'premium' && !(i.redPct >= 1 && i.redPct <= 20)) return 'Give a premium on redemption from 1% to 20%.';
  if (!(i.rate >= 1 && i.rate <= 20)) return 'Give a rate of interest from 1% to 20%.';
  if (i.route === 'vendor') {
    const f = figures(i);
    if (i.vendor.price <= 0) return 'Give the price of the asset.';
    if (!Number.isInteger(f.n)) {
      return `The vendor takes a whole number of debentures: ${inr(i.vendor.price)} / ${inr(f.issuePrice)} = ${(i.vendor.price / f.issuePrice).toFixed(2)} is not one. Try a price that is a multiple of ${inr(f.issuePrice)}.`;
    }
  } else if (!(Number.isInteger(i.n) && i.n >= 1 && i.n <= 100000)) {
    return 'Give a whole number of debentures, from 1 to 1,00,000.';
  }
  if (i.route === 'collateral') {
    if (i.loan.amount <= 0) return 'Give the amount of the loan.';
    if (!(i.loan.rate >= 1 && i.loan.rate <= 20)) return 'Give a rate of interest on the loan from 1% to 20%.';
    if (!Number.isInteger((i.loan.amount * i.loan.rate * MONTHS_TO_MARCH[i.month]) / 1200)) return 'The interest on the loan does not come to whole paise: try a round amount.';
  }
  if (!(Number.isInteger(i.years) && i.years >= 2)) {
    // Due within twelve months of the balance sheet date, the debt would be current (short-term borrowings), not the long-term borrowing the extract shows.
    return i.route === 'collateral' ? 'Give a loan repayable after two years or more: one due within twelve months is a short-term borrowing.' : 'Give a term of two years or more: debentures due within twelve months are shown as a short-term borrowing.';
  }
  if (i.spBefore < 0) return 'Securities Premium cannot be below nil.';
  const f = figures(i);
  if (![f.premium, f.discount, f.onRedemption, ...f.halves, f.loanInterest].every(Number.isInteger)) return 'These terms do not come to whole paise: try a round rate or percentage.';
  return null;
}

// --- Dates -----------------------------------------------------------------------------------------------------------

export const allotDate = (i: DebInput): string => `1 ${i.month} ${i.month === 'January' ? i.year + 1 : i.year}`;
export const septDate = (i: DebInput): string => `30 September ${i.year}`;
export const yearEnd = (i: DebInput): string => `31 March ${i.year + 1}`;
export const yearOpen = (i: DebInput): string => `1 April ${i.year}`;

// --- Words -----------------------------------------------------------------------------------------------------------

/** "at par", "at a premium of 10% (₹10 a debenture)". */
export function issueWords(i: DebInput): string {
  const f = figures(i);
  if (i.issueAt === 'premium') return `at a premium of ${i.issuePct}% (${inr(f.premium)} a debenture)`;
  if (i.issueAt === 'discount') return `at a discount of ${i.issuePct}% (${inr(f.discount)} a debenture)`;
  return 'at par';
}
/** "redeemable at par after 5 years", "redeemable at a premium of 5% after 5 years". */
export function redeemWords(i: DebInput): string {
  const f = figures(i);
  return i.redeemAt === 'premium' ? `redeemable at a premium of ${i.redPct}% (${inr(f.onRedemption)} a debenture) after ${i.years} years` : `redeemable at par after ${i.years} years`;
}
/** "1,000, 9% Debentures of ₹100 each". */
export const lotWords = (i: DebInput, n = figures(i).n): string => `${count(n)}, ${i.rate}% Debentures of ${inr(i.face * 100)} each`;

/** One sentence that says what the example is. */
export function describe(i: DebInput): string {
  const f = figures(i);
  if (i.route === 'collateral') {
    return `${i.company} borrows ${inr(i.loan.amount)} from its bank at ${i.loan.rate}% a year on ${allotDate(i)}, repayable after ${i.years} years, and gives the bank ${i.rate}% Debentures of ${inr(f.nominal)} as collateral security, recorded by the ${i.loan.method === 'note' ? 'first method (no entry, a note)' : 'second method (Debenture Suspense A/c)'}.`;
  }
  const to = i.route === 'vendor' ? `to ${i.vendor.name} for ${i.vendor.asset.toLowerCase()} costing ${inr(i.vendor.price)}` : 'to the public for cash, the whole price with the application';
  return `${i.company} allots ${lotWords(i)} on ${allotDate(i)} ${to}, ${issueWords(i)}, ${redeemWords(i)}. ${i.spBefore > 0 ? `Securities Premium A/c has a balance of ${inr(i.spBefore)} before the issue.` : 'Securities Premium A/c has no balance before the issue.'}`;
}

// --- The story of the year ---------------------------------------------------------------------------------------------

/** The accounts drawn as pots. */
export type PotId = 'bank' | 'daa' | 'vendor' | 'asset' | 'debentures' | 'sp' | 'premRed' | 'loss' | 'interest' | 'spl' | 'loan' | 'suspense' | 'interestPaid';

export interface JLine {
  account: string;
  side: 'Dr' | 'Cr';
  amount: Paise;
  /** The pot the line changes; none for an account that is not drawn (Debentureholders A/c, cleared the same day). */
  pot?: PotId;
}
export interface JEntry {
  date: string;
  lines: JLine[];
  narration: string;
}

export interface DebStep {
  id: 'terms' | 'money' | 'asset' | 'allot' | 'loan' | 'collateral' | 'interest1' | 'interest2' | 'loanInterest' | 'writeOff' | 'close' | 'sheet' | 'release';
  title: string;
  /** What moves and why, in a sentence or two. */
  text: string;
  entries: JEntry[];
  /** The balance of every pot after the step: a debit balance positive, a credit balance negative. */
  pots: Partial<Record<PotId, Paise>>;
}

export interface Story {
  input: DebInput;
  f: Figures;
  /** The pots this route draws, in order. */
  potIds: PotId[];
  steps: DebStep[];
}

const dr = (account: string, amount: Paise, pot?: PotId): JLine => ({ account, side: 'Dr', amount, pot });
const cr = (account: string, amount: Paise, pot?: PotId): JLine => ({ account, side: 'Cr', amount, pot });
/** The lines of an entry without those of nil. */
const lines = (...ls: JLine[]): JLine[] => ls.filter((l) => l.amount > 0);

function applyEntries(pots: Partial<Record<PotId, Paise>>, entries: JEntry[]): Partial<Record<PotId, Paise>> {
  const out = { ...pots };
  for (const e of entries) for (const l of e.lines) if (l.pot) out[l.pot] = (out[l.pot] ?? 0) + (l.side === 'Dr' ? l.amount : -l.amount) || 0;
  return out;
}

/** The account a pot stands for, by the input. */
export function potName(i: DebInput, p: PotId): string {
  const f = figures(i);
  switch (p) {
    case 'bank':
      return BANK;
    case 'daa':
      return DAA;
    case 'vendor':
      return i.vendor.name;
    case 'asset':
      return assetAc(i.vendor.asset);
    case 'debentures':
      return debenturesAc(i.rate);
    case 'sp':
      return SP;
    case 'premRed':
      return PREM_RED;
    case 'loss':
      return f.lossAccount;
    case 'interest':
      return INTEREST;
    case 'spl':
      return SPL;
    case 'loan':
      return BANK_LOAN;
    case 'suspense':
      return SUSPENSE;
    case 'interestPaid':
      return INTEREST_PAID;
  }
}

export function story(i: DebInput): Story {
  const f = figures(i);
  if (i.route === 'collateral') return collateralStory(i, f);
  const steps: DebStep[] = [];
  let pots: Partial<Record<PotId, Paise>> = { sp: -i.spBefore };
  const push = (s: Omit<DebStep, 'pots'>) => {
    pots = applyEntries(pots, s.entries);
    steps.push({ ...s, pots });
  };
  const deb = debenturesAc(i.rate);
  const on = allotDate(i);
  const end = yearEnd(i);
  const lot = lotWords(i);

  // 1. The terms: the three prices of one debenture.
  const termWords = [
    `Face value ${inr(f.face)}`,
    `issued at ${inr(f.issuePrice)}${i.issueAt === 'par' ? ' (at par)' : i.issueAt === 'premium' ? ` (a premium of ${inr(f.premium)})` : ` (a discount of ${inr(f.discount)})`}`,
    `redeemable at ${inr(f.redemptionPrice)}${i.redeemAt === 'par' ? ' (at par)' : ` (a premium of ${inr(f.onRedemption)})`}`,
  ].join(', ');
  const perLoss = f.discount + f.onRedemption;
  push({
    id: 'terms',
    title: 'The terms of issue',
    text: `${termWords}. ${perLoss > 0 ? `The company gives up ${f.discount > 0 && f.onRedemption > 0 ? `${inr(f.discount)} on issue and ${inr(f.onRedemption)} on redemption` : f.discount > 0 ? `${inr(f.discount)} on issue` : `${inr(f.onRedemption)} on redemption`}: a loss of ${inr(perLoss)} a debenture, known on the day of issue, so it is recorded then.` : 'Nothing is lost on the issue: the company owes back no more than the face value it is credited with.'}${f.premium > 0 ? ` The premium of ${inr(f.premium)} is a capital gain, kept apart in Securities Premium.` : ''}`,
    entries: [],
  });

  // 2. The money, or the asset bought.
  if (i.route === 'cash') {
    push({
      id: 'money',
      title: 'Money received with the applications',
      text: `${on}: applications for ${count(f.n)} debentures come in with ${inr(f.issuePrice)} each, ${count(f.n)} × ${inr(f.issuePrice)} = ${inr(f.money)}. The money waits in ${DAA} until the debentures are allotted.`,
      entries: [{ date: on, lines: [dr(BANK, f.money, 'bank'), cr(DAA, f.money, 'daa')], narration: `Being application money received on ${count(f.n)} debentures at ${inr(f.issuePrice)} each` }],
    });
  } else {
    push({
      id: 'asset',
      title: `${i.vendor.asset} bought from ${i.vendor.name}`,
      text: `${on}: ${i.vendor.asset.toLowerCase()} is bought for ${inr(i.vendor.price)}, to be paid for in debentures. ${i.vendor.name} is credited with the price until it is settled.`,
      entries: [{ date: on, lines: [dr(assetAc(i.vendor.asset), i.vendor.price, 'asset'), cr(i.vendor.name, i.vendor.price, 'vendor')], narration: `Being ${i.vendor.asset.toLowerCase()} bought from ${i.vendor.name}` }],
    });
  }

  // 3. The allotment.
  const source = i.route === 'cash' ? DAA : i.vendor.name;
  const sourcePot: PotId = i.route === 'cash' ? 'daa' : 'vendor';
  const allotWhy: string[] = [
    `${deb} is credited with the face value, ${count(f.n)} × ${inr(f.face)} = ${inr(f.nominal)}, whatever was ${i.route === 'cash' ? 'received' : 'settled'}.`,
  ];
  if (f.premiumTotal > 0) allotWhy.push(`The premium on issue, ${inr(f.premiumTotal)}, goes to Securities Premium.`);
  if (f.onRedemptionTotal > 0) {
    allotWhy.push(
      `The premium payable on redemption, ${inr(f.onRedemptionTotal)}, is owed from today: ${PREM_RED} is credited, and the whole loss${f.discountTotal > 0 ? `, discount ${inr(f.discountTotal)} + premium on redemption ${inr(f.onRedemptionTotal)} = ${inr(f.loss)},` : ` of ${inr(f.loss)}`} is debited to ${LOSS}.`,
    );
  } else if (f.discountTotal > 0) {
    allotWhy.push(`The discount, ${count(f.n)} × ${inr(f.discount)} = ${inr(f.discountTotal)}, is a capital loss: ${DISCOUNT} is debited.`);
  }
  if (i.route === 'vendor') allotWhy.unshift(`${i.vendor.name} takes each debenture at its issue price: ${inr(i.vendor.price)} / ${inr(f.issuePrice)} = ${count(f.n)} debentures.`);
  push({
    id: 'allot',
    title: i.route === 'cash' ? 'The debentures are allotted' : `Debentures issued to ${i.vendor.name}`,
    text: allotWhy.join(' '),
    entries: [
      {
        date: on,
        lines: lines(dr(source, i.route === 'cash' ? f.money : i.vendor.price, sourcePot), dr(f.lossAccount, f.loss, 'loss'), cr(deb, f.nominal, 'debentures'), cr(SP, f.premiumTotal, 'sp'), cr(PREM_RED, f.onRedemptionTotal, 'premRed')),
        narration: i.route === 'cash' ? `Being the allotment of ${lot} ${issueWords(i).replace(/ \(.*\)$/, '')}, ${redeemWords(i).replace(/ \(.*\)/, '')}` : `Being ${lot} issued to ${i.vendor.name} ${issueWords(i).replace(/ \(.*\)$/, '')} in payment of the price`,
      },
    ],
  });

  // 4. Interest, half-year by half-year.
  const interestStep = (id: 'interest1' | 'interest2', date: string, m: number, x: Paise, from: string) =>
    push({
      id,
      title: `Interest to ${date}`,
      text: `Interest for ${m === 6 ? 'the half-year' : `${m} months`} from ${from} = ${inr(f.nominal)} × ${i.rate}% × ${m}/12 = ${inr(x)}, on the face value, not on the issue price. It falls due to the debentureholders and is paid by cheque the same day; no tax is deducted at source.`,
      entries: [
        { date, lines: [dr(INTEREST, x, 'interest'), cr(HOLDERS, x)], narration: `Being interest due on ${deb.replace(' A/c', '')} for ${m} months` },
        { date, lines: [dr(HOLDERS, x), cr(BANK, x, 'bank')], narration: 'Being interest paid to the debentureholders' },
      ],
    });
  const [m1, m2] = [Math.max(0, f.months - 6), Math.min(f.months, 6)];
  if (m1 > 0) interestStep('interest1', septDate(i), m1, f.halves[0], on);
  interestStep('interest2', end, m2, f.halves[1], m1 > 0 ? `1 October ${i.year}` : on);

  // 5. The write-off.
  if (f.loss > 0) {
    const name = f.lossAccount;
    const avail =
      f.available === 0
        ? 'Securities Premium has no balance, so'
        : `Securities Premium available = ${i.spBefore > 0 && f.premiumTotal > 0 ? `${inr(i.spBefore)} + ${inr(f.premiumTotal)} from this issue = ` : f.premiumTotal > 0 ? 'the premium of this issue, ' : ''}${inr(f.available)}.`;
    const split =
      f.fromPl === 0
        ? `It bears the whole ${inr(f.loss)}, and ${inr(f.spLeft)} of it is left.`
        : f.fromSp === 0
          ? `the whole ${inr(f.loss)} goes to the Statement of Profit and Loss as a finance cost.`
          : `It bears ${inr(f.fromSp)}; the other ${inr(f.loss)} - ${inr(f.fromSp)} = ${inr(f.fromPl)} goes to the Statement of Profit and Loss as a finance cost.`;
    push({
      id: 'writeOff',
      title: `The ${f.lossWord} written off`,
      text: `${end}: the ${f.lossWord} on issue, ${inr(f.loss)}, is written off in full in the year of allotment, Securities Premium first. ${avail} ${split}`,
      entries: [{ date: end, lines: lines(dr(SP, f.fromSp, 'sp'), dr(SPL, f.fromPl, 'spl'), cr(name, f.loss, 'loss')), narration: `Being the ${f.lossWord} on issue of debentures written off` }],
    });
  }

  // 6. Interest closed to the Statement of Profit and Loss.
  push({
    id: 'close',
    title: 'Interest to the Statement of Profit and Loss',
    text: `${end}: ${INTEREST}, ${inr(f.interest)}, is closed to the Statement of Profit and Loss. Interest is a charge against profit, due whether or not there is a profit.`,
    entries: [{ date: end, lines: [dr(SPL, f.interest, 'spl'), cr(INTEREST, f.interest, 'interest')], narration: 'Being debenture interest transferred to the Statement of Profit and Loss' }],
  });

  // 7. The balance sheet.
  push({
    id: 'sheet',
    title: 'In the balance sheet',
    text: `On ${end} the debentures stand under Long-term borrowings at ${inr(f.nominal)}${f.onRedemptionTotal > 0 ? `, the premium on redemption of ${inr(f.onRedemptionTotal)} under Other long-term liabilities` : ''}${f.spLeft > 0 ? `, what is left of Securities Premium, ${inr(f.spLeft)}, under Reserves and surplus` : ''}; Finance costs in the Statement of Profit and Loss come to ${inr(f.financeCosts)}.`,
    entries: [],
  });

  const potIds: PotId[] =
    i.route === 'cash'
      ? ['bank', 'daa', 'debentures', 'sp', 'premRed', 'loss', 'interest', 'spl']
      : ['asset', 'vendor', 'debentures', 'sp', 'premRed', 'loss', 'interest', 'spl', 'bank'];
  return { input: i, f, potIds: potIds.filter((p) => p !== 'premRed' || f.onRedemptionTotal > 0).filter((p) => p !== 'loss' || f.loss > 0), steps };
}

function collateralStory(i: DebInput, f: Figures): Story {
  const steps: DebStep[] = [];
  let pots: Partial<Record<PotId, Paise>> = {};
  const push = (s: Omit<DebStep, 'pots'>) => {
    pots = applyEntries(pots, s.entries);
    steps.push({ ...s, pots });
  };
  const deb = debenturesAc(i.rate);
  const on = allotDate(i);
  const end = yearEnd(i);
  const L = i.loan.amount;
  push({
    id: 'terms',
    title: 'The loan and its security',
    text: `The bank lends ${inr(L)} at ${i.loan.rate}%, repayable after ${i.years} years, and asks for ${i.rate}% Debentures of ${inr(f.nominal)} as collateral security: an additional security, used only if the company fails to pay. Nothing is received for these debentures and no interest is paid on them.`,
    entries: [],
  });
  push({
    id: 'loan',
    title: 'The loan is taken',
    text: `${on}: the bank lends ${inr(L)}. ${BANK} is debited and ${BANK_LOAN} credited: the loan is the only debt the company has taken on.`,
    entries: [{ date: on, lines: [dr(BANK, L, 'bank'), cr(BANK_LOAN, L, 'loan')], narration: 'Being a loan taken from the bank' }],
  });
  push({
    id: 'collateral',
    title: 'Debentures given as collateral security',
    text:
      i.loan.method === 'note'
        ? `First method: no entry is passed for the ${count(f.n)} debentures. The balance sheet says under the loan that it is secured by ${i.rate}% Debentures of ${inr(f.nominal)} issued as collateral security.`
        : `Second method: ${deb} is credited with ${inr(f.nominal)} and ${SUSPENSE} debited with the same amount. In the balance sheet the suspense account is deducted from the debentures, so the debt stays at the loan.`,
    entries: i.loan.method === 'note' ? [] : [{ date: on, lines: [dr(SUSPENSE, f.nominal, 'suspense'), cr(deb, f.nominal, 'debentures')], narration: `Being ${count(f.n)}, ${i.rate}% Debentures of ${inr(f.face)} each issued to the bank as collateral security for the loan` }],
  });
  push({
    id: 'loanInterest',
    title: 'Interest on the loan',
    text: `${end}: interest for ${f.months} months = ${inr(L)} × ${i.loan.rate}% × ${f.months}/12 = ${inr(f.loanInterest)}, on the loan, the money actually borrowed. Nothing is worked on the debentures held as security; the year's interest is paid by cheque.`,
    entries: [
      { date: end, lines: [dr(INTEREST_PAID, f.loanInterest, 'interestPaid'), cr(BANK, f.loanInterest, 'bank')], narration: 'Being interest on the bank loan paid' },
      { date: end, lines: [dr(SPL, f.loanInterest, 'spl'), cr(INTEREST_PAID, f.loanInterest, 'interestPaid')], narration: 'Being interest transferred to the Statement of Profit and Loss' },
    ],
  });
  push({
    id: 'sheet',
    title: 'In the balance sheet',
    text: `On ${end} Long-term borrowings come to ${inr(L)}, the loan alone (it falls due after ${i.years} years, so it is non-current): ${i.loan.method === 'note' ? 'the debentures appear only in the note under it' : `the debentures of ${inr(f.nominal)} are shown and ${SUSPENSE} is deducted from them`}. Finance costs: ${inr(f.loanInterest)}, the interest on the loan.`,
    entries: [],
  });
  push({
    id: 'release',
    title: 'Later: the loan repaid',
    text:
      i.loan.method === 'note'
        ? 'When the loan is repaid the bank releases the debentures. No entry was passed for them, so none is needed now; the note goes.'
        : `When the loan is repaid the bank releases the debentures, and the entry of their issue is reversed: ${deb} is debited and ${SUSPENSE} credited, both back to nil.`,
    entries: i.loan.method === 'note' ? [] : [{ date: 'On repayment', lines: [dr(deb, f.nominal, 'debentures'), cr(SUSPENSE, f.nominal, 'suspense')], narration: 'Being the debentures held as collateral security cancelled on repayment of the loan' }],
  });
  const potIds: PotId[] = ['bank', 'loan', ...(i.loan.method === 'suspense' ? (['debentures', 'suspense'] as const) : []), 'interestPaid', 'spl'];
  return { input: i, f, potIds, steps };
}

// --- The balance sheet extract and its notes ---------------------------------------------------------------------------

export type SheetLine =
  | { kind: 'heading'; text: string }
  | { kind: 'row'; label: string; note?: string; amount: Paise | null; less?: boolean; indent?: boolean }
  | { kind: 'total'; label: string; amount: Paise };

/**
 * What the year leaves in the financial statements, as the topic's balance sheet format writes it: the face of the
 * balance sheet (extract), the Finance costs line of the Statement of Profit and Loss, and the notes to accounts. A
 * line that comes to nil is left out, with its note.
 */
export function sheetOf(i: DebInput): { face: SheetLine[]; notes: SheetLine[] } {
  const f = figures(i);
  const end = yearEnd(i);
  const face: SheetLine[] = [{ kind: 'heading', text: `Balance Sheet as at ${end} (extract)` }, { kind: 'heading', text: 'I. EQUITY AND LIABILITIES' }];
  const notes: SheetLine[] = [];
  let k = 0;
  if (i.route === 'collateral') {
    const n = String(++k);
    face.push({ kind: 'heading', text: 'Non-current liabilities' }, { kind: 'row', label: 'Long-term borrowings', note: n, amount: i.loan.amount });
    notes.push({ kind: 'heading', text: `Note ${n}: Long-term borrowings` });
    if (i.loan.method === 'note') {
      notes.push({ kind: 'row', label: `Bank loan (secured by the issue of ${i.rate}% Debentures of ${inr(f.nominal)} as collateral security)`, amount: i.loan.amount });
    } else {
      notes.push(
        { kind: 'row', label: 'Bank loan (secured by the issue of debentures as collateral security)', amount: i.loan.amount },
        { kind: 'row', label: `${lotWords(i)} (issued as collateral security)`, amount: f.nominal },
        { kind: 'row', label: 'Less: Debenture Suspense', amount: f.nominal, less: true, indent: true },
      );
    }
    // The first method leaves one line in the note: a total of one line would only repeat it.
    if (i.loan.method === 'suspense') notes.push({ kind: 'total', label: 'Total long-term borrowings', amount: i.loan.amount });
    const c = String(++k);
    face.push({ kind: 'heading', text: `Statement of Profit and Loss for the year ended ${end} (extract)` }, { kind: 'row', label: 'Finance costs', note: c, amount: f.loanInterest });
    notes.push({ kind: 'heading', text: `Note ${c}: Finance costs` }, { kind: 'row', label: 'Interest on bank loan', amount: f.loanInterest });
    return { face, notes };
  }
  if (f.spLeft > 0) {
    const n = String(++k);
    face.push({ kind: 'heading', text: "Shareholders' funds" }, { kind: 'row', label: 'Reserves and surplus', note: n, amount: f.spLeft });
    notes.push({ kind: 'heading', text: `Note ${n}: Reserves and surplus` });
    if (i.spBefore > 0) notes.push({ kind: 'row', label: `Securities premium on ${yearOpen(i)}`, amount: i.spBefore });
    if (f.premiumTotal > 0) notes.push({ kind: 'row', label: 'Premium received on issue of debentures', amount: f.premiumTotal });
    if (f.fromSp > 0) notes.push({ kind: 'row', label: `Less: ${f.lossWord === 'loss' ? 'Loss' : 'Discount'} on issue of debentures written off`, amount: f.fromSp, less: true });
    if (notes.length > 2) notes.push({ kind: 'total', label: `Securities premium on ${end}`, amount: f.spLeft });
  }
  const b = String(++k);
  face.push({ kind: 'heading', text: 'Non-current liabilities' }, { kind: 'row', label: 'Long-term borrowings', note: b, amount: f.nominal });
  notes.push({ kind: 'heading', text: `Note ${b}: Long-term borrowings` }, { kind: 'row', label: `${lotWords(i)}${i.route === 'vendor' ? ' (issued to a vendor for consideration other than cash)' : ''}`, amount: f.nominal });
  if (f.onRedemptionTotal > 0) {
    const o = String(++k);
    face.push({ kind: 'row', label: 'Other long-term liabilities', note: o, amount: f.onRedemptionTotal });
    notes.push({ kind: 'heading', text: `Note ${o}: Other long-term liabilities` }, { kind: 'row', label: 'Premium on redemption of debentures', amount: f.onRedemptionTotal });
  }
  const c = String(++k);
  face.push({ kind: 'heading', text: `Statement of Profit and Loss for the year ended ${end} (extract)` }, { kind: 'row', label: 'Finance costs', note: c, amount: f.financeCosts });
  notes.push({ kind: 'heading', text: `Note ${c}: Finance costs` }, { kind: 'row', label: 'Interest on debentures', amount: f.interest });
  if (f.fromPl > 0) notes.push({ kind: 'row', label: `${f.lossWord === 'loss' ? 'Loss' : 'Discount'} on issue of debentures written off`, amount: f.fromPl }, { kind: 'total', label: 'Total finance costs', amount: f.financeCosts });
  return { face, notes };
}
