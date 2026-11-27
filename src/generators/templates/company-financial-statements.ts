import type { McqQuestion, NumericQuestion, StatementQuestion } from '@/content/types';
import type { Rng } from '@/engine/rng';
import { parseRupees } from '@/lib/money-input';
import { assertionReasonFacts, factsTemplate, formatINR, mcqTemplate, numericTemplate, rupees, statementTemplate } from '../authoring';
import type { Distractor, FormatRowParts, NumericParts, StatementLineParts, StatementParts, Template } from '../types';

// Financial Statements of a Company (Class 12, Part B). Everything follows Schedule III to the Companies Act, 2013,
// Division I, as amended with effect from 1 April 2021: "Property, Plant and Equipment and Intangible Assets" in
// place of fixed assets, current maturities of long-term borrowings under short-term borrowings, and long-term
// security deposits under other non-current assets. The board's sample papers mark by the amended form, while the
// NCERT textbook still prints the form as it stood before 2021 (current maturities under other current liabilities,
// "fixed assets"). So the amended place is always the right answer and the older place is never offered as a wrong
// one, in an option or as a named mistake; a total that turns on the difference says which form it follows.

const T = 'company-financial-statements';

// ---------------------------------------------------------------------------------------------------------------
// Small helpers
// ---------------------------------------------------------------------------------------------------------------

/** A whole-rupee value written the Indian way. Figures are worked in whole rupees and turned into paise at the end. */
const inr = (rs: number): string => formatINR(rupees(rs));
const correctText = (q: McqQuestion): string => q.options.find((o) => o.id === q.correct)?.text ?? '';
const wrongTexts = (q: McqQuestion): string[] => q.options.filter((o) => o.id !== q.correct).map((o) => o.text);
const sum = (ns: readonly number[]): number => ns.reduce((a, b) => a + b, 0);
const low = (s: string): string => s[0].toLowerCase() + s.slice(1);

/** Every amount in a text as formatINR wrote it ("₹1,25,000"), in whole rupees. */
const RUPEE_G = /₹\d(?:[\d,]*\d)?/g;
const amountsIn = (text: string): number[] => (text.match(RUPEE_G) ?? []).map((s) => (parseRupees(s) ?? Number.NaN) / 100);

/** The "Name: ₹amount" lines of a prompt (every line after the first), in whole rupees. */
const listed = (prompt: string): { label: string; rs: number }[] =>
  prompt
    .split('\n')
    .slice(1)
    .flatMap((line) => {
      const m = /^(.*): (₹[\d,]+)$/.exec(line);
      return m ? [{ label: m[1], rs: (parseRupees(m[2]) ?? Number.NaN) / 100 }] : [];
    });
/** The total of the listed lines whose name matches. */
const sumWhere = (prompt: string, re: RegExp): number => sum(listed(prompt).filter((l) => re.test(l.label)).map((l) => l.rs));
/** The one listed line whose name matches, or NaN. */
const oneWhere = (prompt: string, re: RegExp): number => {
  const hit = listed(prompt).filter((l) => re.test(l.label));
  return hit.length === 1 ? hit[0].rs : Number.NaN;
};
const answerRs = (q: NumericQuestion): number => q.answer / 100;

interface Err {
  value: number;
  why: string;
}
/**
 * The parts of a typed-amount question from figures in whole rupees. Wrong answers that are not positive whole
 * rupees, that equal the answer or that repeat an earlier one are dropped; a seed left with fewer than two is rejected.
 */
function numeric(prompt: string, answer: number, errors: Err[], explanation: string[], hints?: string[]): NumericParts | null {
  if (!Number.isInteger(answer) || answer <= 0) return null;
  const seen = new Set<number>([answer]);
  const commonErrors = errors
    .filter((e) => Number.isInteger(e.value) && e.value > 0 && !seen.has(e.value) && !!seen.add(e.value))
    .map((e) => ({ value: rupees(e.value), why: e.why }));
  if (commonErrors.length < 2) return null;
  return { prompt, answer: rupees(answer), commonErrors, explanation, ...(hints ? { hints } : {}) };
}

/** A list of balances, one to a line, in an order drawn from the seed. */
interface Line {
  label: string;
  rs: number;
}
const lines = (rng: Rng, items: Line[]): string => rng.shuffle(items).map((l) => `${l.label}: ${inr(l.rs)}`).join('\n');
/** A round amount in whole rupees. */
const amt = (rng: Rng, min: number, max: number, step: number): number => rng.step(min, max, step);

// Names that say nothing about the trade, since a question often says what the company does.
const COMPANIES = [
  'Aarohan Ltd.', 'Bhuvan Ltd.', 'Chetak Ltd.', 'Dhruv Ltd.', 'Ekta Ltd.', 'Girnar Ltd.',
  'Himadri Ltd.', 'Kaveri Ltd.', 'Malwa Ltd.', 'Narmada Ltd.', 'Sutlej Ltd.', 'Trishul Ltd.',
];
const company = (rng: Rng): string => rng.pick(COMPANIES);

/**
 * Companies named with their trade and city, for the questions of version 2 and later of the templates that total a
 * list (and the balance sheet formats): a manufacturer where the list has a factory's items, any business otherwise.
 * `firm` is the name with its trade, to stand before a comma; the questions that say what the company does in their
 * own words keep to `COMPANIES`.
 */
interface Firm {
  name: string;
  what: string;
}
const MAKERS: Firm[] = [
  { name: 'Kaveri Spinning Mills Ltd.', what: 'a maker of cotton yarn in Coimbatore' },
  { name: 'Malwa Flour Mills Ltd.', what: 'a flour mill in Indore' },
  { name: 'Girnar Ceramics Ltd.', what: 'a maker of floor tiles in Morbi' },
  { name: 'Sutlej Cycle Parts Ltd.', what: 'a maker of bicycle parts in Ludhiana' },
  { name: 'Narmada Remedies Ltd.', what: 'a maker of medicines in Vadodara' },
  { name: 'Himadri Cartons Ltd.', what: 'a maker of cardboard cartons in Baddi' },
  { name: 'Kisan Agro Inputs Ltd.', what: 'a maker of organic fertilisers in Nashik' },
  { name: 'Chetak Gears Ltd.', what: 'a maker of tractor gears in Rajkot' },
];
const SERVICES: Firm[] = [
  { name: 'Aarohan Diagnostics Ltd.', what: 'which runs pathology laboratories in Lucknow' },
  { name: 'Trishul Roadways Ltd.', what: 'a road transport company in Nagpur' },
  { name: 'Dhruv Learning Ltd.', what: 'which runs coaching centres in Kota' },
  { name: 'Ekta Supermarkets Ltd.', what: 'a chain of grocery stores in Kochi' },
  { name: 'Sahyadri Clinics Ltd.', what: 'which runs clinics in Pune' },
  { name: 'Bhuvan Hotels Ltd.', what: 'a hotel company in Jaipur' },
];
const ANY_FIRM: Firm[] = [...MAKERS, ...SERVICES];
const firm = (f: Firm): string => `${f.name}, ${f.what}`;
const YEARS = [2025, 2026, 2027];

// ---------------------------------------------------------------------------------------------------------------
// The balance sheet: major heads, sub-heads and the bank of items
// ---------------------------------------------------------------------------------------------------------------

type Major = 'sf' | 'sam' | 'ncl' | 'cl' | 'nca' | 'ca';
const MAJOR: Record<Major, string> = {
  sf: "Shareholders' Funds",
  sam: 'Share Application Money Pending Allotment',
  ncl: 'Non-Current Liabilities',
  cl: 'Current Liabilities',
  nca: 'Non-Current Assets',
  ca: 'Current Assets',
};
const isAssetMajor = (m: Major): boolean => m === 'nca' || m === 'ca';

type Sub =
  | 'shareCapital' | 'reserves' | 'warrants' | 'sam'
  | 'ltb' | 'oltl' | 'ltp'
  | 'stb' | 'tp' | 'ocl' | 'stp'
  | 'ppe' | 'intangible' | 'cwip' | 'iaud' | 'nci' | 'ltla' | 'onca'
  | 'ci' | 'inv' | 'tr' | 'cash' | 'stla' | 'oca';

const PPE_IA = 'Property, Plant and Equipment and Intangible Assets';
const SUBS: Record<Sub, [Major, string]> = {
  shareCapital: ['sf', 'Share Capital'],
  reserves: ['sf', 'Reserves and Surplus'],
  warrants: ['sf', 'Money Received against Share Warrants'],
  sam: ['sam', ''],
  ltb: ['ncl', 'Long-term Borrowings'],
  oltl: ['ncl', 'Other Long-term Liabilities'],
  ltp: ['ncl', 'Long-term Provisions'],
  stb: ['cl', 'Short-term Borrowings'],
  tp: ['cl', 'Trade Payables'],
  ocl: ['cl', 'Other Current Liabilities'],
  stp: ['cl', 'Short-term Provisions'],
  ppe: ['nca', `${PPE_IA} (Property, Plant and Equipment)`],
  intangible: ['nca', `${PPE_IA} (Intangible Assets)`],
  cwip: ['nca', `${PPE_IA} (Capital Work-in-Progress)`],
  iaud: ['nca', `${PPE_IA} (Intangible Assets under Development)`],
  nci: ['nca', 'Non-current Investments'],
  ltla: ['nca', 'Long-term Loans and Advances'],
  onca: ['nca', 'Other Non-current Assets'],
  ci: ['ca', 'Current Investments'],
  inv: ['ca', 'Inventories'],
  tr: ['ca', 'Trade Receivables'],
  cash: ['ca', 'Cash and Cash Equivalents'],
  stla: ['ca', 'Short-term Loans and Advances'],
  oca: ['ca', 'Other Current Assets'],
};
const majorOf = (s: Sub): Major => SUBS[s][0];
/** "Current Liabilities: Short-term Borrowings"; share application money pending allotment is a major head alone. */
const headOf = (s: Sub): string => (s === 'sam' ? MAJOR.sam : `${MAJOR[majorOf(s)]}: ${SUBS[s][1]}`);

/**
 * One item of the bank: what it is called, where Schedule III shows it, a sentence saying why, and the wrong
 * sub-heads students choose, each with the mistake behind it. A `why` is written about the item, so it reads as
 * well when the head is asked for and the item is the wrong option.
 */
export interface BsItem {
  name: string;
  sub: Sub;
  note: string;
  wrong: [Sub, string][];
  /** An everyday item, asked at the easy level. */
  common?: boolean;
  /** The name is the head itself, so the item is asked only for its major head. */
  majorOnly?: boolean;
  /**
   * The place the item had before the 2021 amendment moved it, which the textbook in use still shows. The item is
   * asked for its amended place, is never set against the older one (not even beside an item that belongs there),
   * and is never the option a student is told "does belong".
   */
  moved?: Sub;
}

const A_PROVISION = 'A provision is an estimate set aside for a liability; this is a known amount actually owed.';

export const BS_ITEMS: BsItem[] = [
  // --- Shareholders' Funds: Share Capital ---
  { name: 'Equity share capital', sub: 'shareCapital', common: true,
    note: "Equity share capital is what the shareholders have paid on their shares: Shareholders' Funds, Share Capital.",
    wrong: [
      ['reserves', 'Took the capital paid on shares for profits kept back in the business. Reserves come from profits and premiums; capital comes from the shares themselves.'],
      ['ltb', 'Treated share capital as money borrowed. Shareholders are owners of the company, not its lenders.'],
      ['sam', 'That head is only for money received on shares not yet allotted. These shares have been allotted.'],
    ] },
  { name: '8% Preference share capital', sub: 'shareCapital', common: true,
    note: "Preference shares are shares, whatever their fixed rate of dividend: Shareholders' Funds, Share Capital.",
    wrong: [
      ['ltb', 'Treated preference shares as a borrowing because they carry a fixed rate. They are shares, so the amount is share capital.'],
      ['reserves', 'Took capital paid on preference shares for profits kept back in the business.'],
      ['nci', "Mixed the company's own preference shares with shares of other companies that it holds as an investment."],
    ] },
  { name: 'Balance of Forfeited Shares Account (the shares are not yet reissued)', sub: 'shareCapital',
    note: "Until forfeited shares are reissued, the balance of Forfeited Shares Account is added to the subscribed capital in the note on share capital: Shareholders' Funds, Share Capital.",
    wrong: [
      ['reserves', 'Took the amount forfeited for a reserve. Only the gain left after the shares are reissued goes to Capital Reserve; until then the balance is added to share capital.'],
      ['ocl', 'Treated the amount forfeited as refundable to the defaulting shareholders. Money paid on forfeited shares is not returned.'],
      ['sam', 'That head is for shares not yet allotted. These shares were allotted and later forfeited.'],
    ] },
  { name: 'Calls in arrears', sub: 'shareCapital',
    note: "Calls in arrears are deducted from the subscribed capital in the note on share capital, so they are dealt with under Shareholders' Funds, Share Capital.",
    wrong: [
      ['oca', 'Showed the unpaid calls as an amount receivable on the assets side. They are deducted from the subscribed capital instead.'],
      ['tr', 'Took shareholders who owe calls for customers. Trade receivables arise only from sales; unpaid calls are deducted from share capital.'],
      ['stla', 'Treated the unpaid calls as an advance given. They are deducted from the subscribed capital in the note.'],
    ] },

  // --- Shareholders' Funds: Reserves and Surplus ---
  { name: 'Securities Premium', sub: 'reserves', common: true,
    note: "Securities Premium is the amount received on shares above their face value. It is a reserve: Shareholders' Funds, Reserves and Surplus.",
    wrong: [
      ['shareCapital', 'Added the premium to share capital because shareholders paid both. The premium is kept apart as a reserve; share capital is the face value called up.'],
      ['warrants', 'Mixed the premium on shares already issued with money received on share warrants, which are rights to take shares later.'],
      ['oltl', 'Treated the premium as an amount to be paid back. It belongs to the company and is a reserve.'],
    ] },
  { name: 'Capital Redemption Reserve', sub: 'reserves',
    note: "Capital Redemption Reserve is a reserve built out of profits: Shareholders' Funds, Reserves and Surplus.",
    wrong: [
      ['shareCapital', 'Went by the word "capital". It is a reserve built out of profits, not capital paid on shares.'],
      ['ltp', 'Read "redemption" as money set aside to repay someone. A reserve is profit kept back, not a provision for a liability.'],
      ['oltl', 'Treated a reserve, which belongs to the shareholders, as an amount owed to outsiders.'],
    ] },
  { name: 'General Reserve', sub: 'reserves', common: true,
    note: "General Reserve is profit kept back in the business: Shareholders' Funds, Reserves and Surplus.",
    wrong: [
      ['ltp', 'Mixed a reserve with a provision. A reserve is profit kept back and belongs to the shareholders; a provision meets a liability.'],
      ['stp', 'Mixed a reserve with a provision. A reserve is profit kept back and belongs to the shareholders; a provision meets a liability.'],
      ['shareCapital', 'Added profits kept back to the capital paid on shares. Reserves are shown apart from share capital.'],
    ] },
  { name: 'Capital Reserve', sub: 'reserves',
    note: "Capital Reserve holds capital profits, such as the gain on reissue of forfeited shares: Shareholders' Funds, Reserves and Surplus.",
    wrong: [
      ['shareCapital', 'Went by the word "capital". A capital reserve holds capital profits; it is not capital paid on shares.'],
      ['ltp', 'Mixed a reserve with a provision. A capital reserve is a profit of a capital kind, not an amount set aside for a liability.'],
      ['oltl', 'Treated a reserve, which belongs to the shareholders, as an amount owed to outsiders.'],
    ] },
  { name: 'Surplus, i.e. the credit balance of the Statement of Profit and Loss', sub: 'reserves', common: true,
    note: "The credit balance of the Statement of Profit and Loss is accumulated profit: Shareholders' Funds, Reserves and Surplus.",
    wrong: [
      ['stp', 'Took accumulated profit for a provision. It is profit kept in the business and belongs to the shareholders.'],
      ['ocl', 'Treated undistributed profit as already owed to the shareholders. It becomes a liability only when a dividend is declared.'],
      ['shareCapital', 'Added accumulated profit to the capital paid on shares. It is shown apart, under Reserves and Surplus.'],
    ] },
  { name: 'Debit balance of the Statement of Profit and Loss (accumulated loss)', sub: 'reserves',
    note: "A debit balance of the Statement of Profit and Loss is shown as a negative figure under Shareholders' Funds, Reserves and Surplus.",
    wrong: [
      ['oca', 'Showed the loss on the assets side, as the old form of balance sheet did. Under Schedule III it is a negative figure under Reserves and Surplus.'],
      ['onca', 'Carried the loss forward as if it were an asset. Under Schedule III it is a negative figure under Reserves and Surplus.'],
      ['shareCapital', 'Deducted the loss from share capital. It is deducted within Reserves and Surplus; share capital stays as it is.'],
    ] },
  // This place held "Share Options Outstanding Account" until version 2 of the templates that draw from the bank:
  // employee stock options are outside the 2025-26 syllabus, so the reserve kept for debentures stands here instead.
  { name: 'Debenture Redemption Reserve', sub: 'reserves',
    note: "Debenture Redemption Reserve is profit set aside towards redeeming the company's debentures. It is a reserve, and belongs to the shareholders: Shareholders' Funds, Reserves and Surplus.",
    wrong: [
      ['ltb', 'Put the reserve with the debentures it is kept for. The debentures are the borrowing; the reserve is profit set aside, which belongs to the shareholders.'],
      ['ltp', 'Read "redemption" as money set aside to pay a liability. A reserve is profit kept back, not a provision for a liability.'],
      ['oltl', 'Treated the reserve as an amount owed to the debentureholders. Nothing is owed to them out of it; it is profit kept back.'],
    ] },

  // --- Shareholders' Funds: Money received against share warrants; share application money ---
  { name: 'Money received against share warrants', sub: 'warrants', majorOnly: true,
    note: "A share warrant gives its holder the right to take shares later. Money received against it is the third item of Shareholders' Funds.",
    wrong: [
      ['sam', "Mixed share warrants with applications for shares. Money received against warrants is a part of Shareholders' Funds."],
      ['ocl', 'Treated the money as refundable. It will be turned into shares, so it stays with the shareholders\' funds.'],
      ['ltb', 'Treated the money as borrowed. Warrant holders are future shareholders, not lenders.'],
    ] },
  { name: 'Share application money pending allotment (shares will be allotted against it)', sub: 'sam', majorOnly: true,
    note: 'Application money against which shares are yet to be allotted is a major head of its own, "Share application money pending allotment", after Shareholders\' Funds.',
    wrong: [
      ['shareCapital', 'The shares have not been allotted yet, so the money is not share capital.'],
      ['ocl', 'Only application money that has to be refunded is a current liability. Money against which shares will be allotted has a head of its own.'],
      ['warrants', 'Mixed applications for shares with share warrants, which are rights to take shares at a later date.'],
    ] },
  { name: 'Share application money received in excess and due for refund', sub: 'ocl',
    note: 'Application money that has to be refunded is owed to the applicants: Current Liabilities, Other Current Liabilities.',
    wrong: [
      ['sam', 'That head is only for money against which shares will be allotted. Money to be refunded is owed to the applicants.'],
      ['shareCapital', 'No shares will be issued for this money; it is to be refunded, so it is not capital.'],
      ['stb', 'Treated the refund due as a borrowing. Nothing was borrowed; the amount is simply owed back.'],
    ] },

  // --- Non-Current Liabilities ---
  { name: '9% Debentures, redeemable after five years', sub: 'ltb', common: true,
    note: 'Debentures are money borrowed, and these fall due after five years: Non-Current Liabilities, Long-term Borrowings.',
    wrong: [
      ['stb', 'Took the debentures as repayable within twelve months. They fall due after five years.'],
      ['shareCapital', 'Treated debentures like shares because both are issued to the public. Debentureholders are lenders.'],
      ['oltl', 'Debentures are money borrowed, so they are borrowings and not "other" liabilities.'],
    ] },
  { name: 'Public deposits, repayable after three years', sub: 'ltb', common: true,
    note: 'Deposits accepted from the public are money borrowed, and these are repayable after three years: Non-Current Liabilities, Long-term Borrowings.',
    wrong: [
      ['stb', 'Took the deposits as repayable within twelve months. They are repayable after three years.'],
      ['ocl', 'Took deposits accepted from the public for an everyday payable. They are money borrowed, repayable after three years.'],
      ['oltl', 'Deposits accepted from the public are money borrowed, so they are borrowings and not "other" liabilities.'],
    ] },
  { name: 'Mortgage loan, repayable after six years', sub: 'ltb', common: true,
    note: 'A loan secured by a mortgage is a borrowing, and this one is repayable after six years: Non-Current Liabilities, Long-term Borrowings.',
    wrong: [
      ['stb', 'Took the loan as repayable within twelve months. It is repayable after six years.'],
      ['ppe', 'Went by the asset that is mortgaged. The loan is what the company owes; the asset stays under its own head.'],
      ['oltl', 'A loan is a borrowing even when it is secured, so it is not an "other" liability.'],
    ] },
  { name: 'Term loan from a bank, repayable after four years', sub: 'ltb', common: true,
    note: 'A term loan repayable after four years is a borrowing not due within twelve months: Non-Current Liabilities, Long-term Borrowings.',
    wrong: [
      ['stb', 'Took every bank loan as short-term, like an overdraft. This loan is repayable after four years.'],
      ['oltl', 'A loan is money borrowed, so it is a borrowing and not an "other" liability.'],
      ['ocl', 'Took the loan for an everyday payable. It is money borrowed, repayable after four years.'],
    ] },
  { name: 'Premium payable on redemption of debentures (the debentures are redeemable after six years)', sub: 'oltl',
    note: 'The premium payable on redemption falls due with the debentures, after six years, and is not itself money borrowed: Non-Current Liabilities, Other Long-term Liabilities.',
    wrong: [
      ['reserves', 'Took it for Securities Premium. This premium is payable by the company, not received by it.'],
      ['ltb', 'Added the premium to the debentures. It is not money borrowed, so it is shown apart from the borrowing.'],
      ['ltp', 'Treated a fixed, known amount as a provision. A provision is an estimate.'],
      ['ocl', 'Took the premium as payable within twelve months. It falls due only when the debentures are redeemed, after six years.'],
    ] },
  { name: 'Trade payables falling due 30 months after the balance sheet date (the operating cycle is 12 months)', sub: 'oltl',
    note: 'Amounts owed to suppliers that fall due after both twelve months and the operating cycle are non-current: Non-Current Liabilities, Other Long-term Liabilities.',
    wrong: [
      ['tp', 'Took every amount owed to suppliers as current. These fall due after both twelve months and the operating cycle.'],
      ['ltb', 'Amounts owed to suppliers are not money borrowed, so they are not borrowings.'],
      ['ocl', 'Took the amount as due within twelve months. It falls due after 30 months, so it is non-current.'],
    ] },
  { name: 'Provision for gratuity, payable to employees when they retire many years from now', sub: 'ltp',
    note: 'A provision for employee benefits that is not due within twelve months is non-current: Non-Current Liabilities, Long-term Provisions.',
    wrong: [
      ['stp', 'Took the provision as payable within twelve months. The gratuity falls due only when the employees retire, years from now.'],
      ['oltl', 'A provision, being an estimated liability, has a sub-head of its own and is not an "other" liability.'],
      ['reserves', 'Mixed a provision with a reserve. A provision meets a liability; a reserve is profit kept back.'],
    ] },

  // --- Current Liabilities: Short-term Borrowings ---
  { name: 'Bank overdraft', sub: 'stb', common: true,
    note: 'A bank overdraft is money borrowed from the bank, repayable on demand: Current Liabilities, Short-term Borrowings.',
    wrong: [
      ['ocl', 'Treated the overdraft as an everyday payable. It is money borrowed from the bank, repayable on demand.'],
      ['cash', 'Set the overdraft off against cash and bank balances. A liability is not deducted from an asset.'],
      ['tp', 'Trade payables are amounts owed for goods and services bought. An overdraft is a borrowing.'],
      ['ltb', 'Took the overdraft as a long-term loan. It is repayable on demand, so it is short-term.'],
    ] },
  { name: 'Cash credit from a bank', sub: 'stb',
    note: 'Cash credit is a borrowing from a bank, repayable on demand: Current Liabilities, Short-term Borrowings.',
    wrong: [
      ['cash', 'Went by the word "cash". Cash credit is a borrowing from a bank, a liability and not a cash balance.'],
      ['ocl', 'Treated the cash credit as an everyday payable. It is money borrowed from the bank.'],
      ['ltb', 'Took the cash credit as a long-term loan. It is repayable on demand, so it is short-term.'],
    ] },
  { name: 'Loan from a bank, repayable on demand', sub: 'stb',
    note: 'A loan repayable on demand is a current borrowing: Current Liabilities, Short-term Borrowings.',
    wrong: [
      ['ltb', 'Took every bank loan as long-term. One repayable on demand is short-term.'],
      ['ocl', 'Treated the loan as an everyday payable. Money borrowed is a borrowing.'],
      ['tp', 'Trade payables are owed to suppliers of goods and services. A loan is a borrowing.'],
    ] },
  { name: 'Current maturities of long-term borrowings (the part of a term loan repayable within twelve months)', sub: 'stb', moved: 'ocl',
    note: 'In Schedule III as amended in 2021, current maturities of long-term borrowings are shown under Current Liabilities, Short-term Borrowings.',
    wrong: [
      ['ltb', 'Left the instalment with the loan it comes from. The part repayable within twelve months is current.'],
      ['stp', 'A fixed instalment of a loan is not an estimate, so it is not a provision.'],
      ['oltl', 'Called it non-current, and an "other" liability. The instalment is repayable within twelve months, and it is money borrowed.'],
      ['tp', 'Trade payables are owed to suppliers of goods and services. An instalment of a loan is money borrowed.'],
    ] },

  // --- Current Liabilities: Trade Payables ---
  { name: 'Sundry creditors for goods purchased', sub: 'tp', common: true,
    note: 'Amounts owed to suppliers of goods and services are trade payables: Current Liabilities, Trade Payables.',
    wrong: [
      ['ocl', 'Amounts owed to suppliers of goods and services have a line of their own, trade payables.'],
      ['stb', 'Buying on credit is not borrowing money, so creditors for goods are not borrowings.'],
      ['stp', A_PROVISION],
    ] },
  { name: 'Bills payable', sub: 'tp', common: true,
    note: 'A bill accepted for goods bought is owed to a supplier: Current Liabilities, Trade Payables.',
    wrong: [
      ['stb', 'Took a bill accepted for goods bought as a borrowing. It is owed to a supplier, so it is a trade payable.'],
      ['ocl', 'Bills accepted for goods bought are trade payables, which have a line of their own.'],
      ['tr', 'Mixed bills payable with bills receivable. A bill payable is owed by the company.'],
    ] },

  // --- Current Liabilities: Other Current Liabilities ---
  { name: 'Unpaid dividend (declared, but not yet claimed by some shareholders)', sub: 'ocl', common: true,
    note: 'A dividend declared and not yet paid is a known amount owed to shareholders: Current Liabilities, Other Current Liabilities.',
    wrong: [
      ['stp', 'A dividend already declared is a fixed amount owed, not an estimate, so it is not a provision.'],
      ['reserves', 'Once declared, the dividend has left the surplus and is owed to the shareholders.'],
      ['tp', 'Shareholders are not suppliers. Trade payables are owed for goods and services bought.'],
    ] },
  { name: 'Calls in advance', sub: 'ocl',
    note: 'Money received on a call not yet made is owed back to the shareholder until the call is made: Current Liabilities, Other Current Liabilities.',
    wrong: [
      ['shareCapital', 'Added money not yet called to share capital. Until the call is made it is owed to the shareholder.'],
      ['sam', 'The shares are already allotted. This is money paid ahead of a call, not application money.'],
      ['stla', 'Went by the word "advance". The company has received this money, not paid it, so it is a liability.'],
    ] },
  { name: 'Outstanding salaries', sub: 'ocl', common: true,
    note: 'An expense owing is a known amount due within twelve months: Current Liabilities, Other Current Liabilities.',
    wrong: [
      ['stp', 'An outstanding expense is a known amount owed, not an estimate, so it is not a provision.'],
      ['tp', 'Trade payables are owed to suppliers of goods and services. Salaries are owed to employees.'],
      ['oca', 'Mixed an expense owing with an expense paid in advance. Outstanding salaries are owed by the company.'],
    ] },
  { name: 'Interest accrued but not due on borrowings', sub: 'ocl',
    note: 'Interest owing on a loan is not part of the money borrowed: Current Liabilities, Other Current Liabilities.',
    wrong: [
      ['stb', 'Added the interest to the loan. Only the principal is a borrowing; interest owing is another current liability.'],
      ['ltb', 'Kept the interest with the long-term loan it is on. The interest is payable within twelve months and is not money borrowed.'],
      ['stp', A_PROVISION],
    ] },
  { name: 'Interest accrued and due on borrowings', sub: 'ocl',
    note: 'Interest due on a loan and not yet paid is not part of the money borrowed: Current Liabilities, Other Current Liabilities.',
    wrong: [
      ['stb', 'Added the interest to the loan. Only the principal is a borrowing; interest owing is another current liability.'],
      ['tp', 'Trade payables are owed for goods and services bought. Interest is owed to lenders.'],
      ['stp', A_PROVISION],
    ] },
  { name: 'Income received in advance', sub: 'ocl',
    note: 'Income received before it is earned is owed back in goods or services: Current Liabilities, Other Current Liabilities.',
    wrong: [
      ['oca', 'Mixed it with accrued income. Income received in advance is owed back in goods or services, so it is a liability.'],
      ['stp', A_PROVISION],
      ['tp', 'Trade payables are owed to suppliers. This amount is owed to customers who paid early.'],
    ] },
  { name: 'GST payable', sub: 'ocl',
    note: 'A tax collected and due to the government is a known amount owed: Current Liabilities, Other Current Liabilities.',
    wrong: [
      ['stp', 'Mixed a tax already due with a provision for tax. GST payable is a known amount, not an estimate.'],
      ['tp', 'Trade payables are owed to suppliers of goods and services. GST is owed to the government.'],
      ['stb', 'Tax owed to the government is not money borrowed.'],
    ] },

  // --- Current Liabilities: Short-term Provisions ---
  { name: 'Provision for tax', sub: 'stp', common: true,
    note: 'Provision for tax is the estimated tax on the profit of the year, payable within twelve months: Current Liabilities, Short-term Provisions.',
    wrong: [
      ['reserves', 'Treated a provision as a reserve. A provision meets a liability; a reserve is profit kept back.'],
      ['ocl', 'Provision for tax is an estimate of the tax for the year, so it is a provision and not another current liability.'],
      ['ltp', 'Tax on the profit of the year is payable within twelve months, so the provision is short-term.'],
    ] },
  { name: 'Provision for leave encashment, payable to employees within twelve months', sub: 'stp',
    note: 'A provision for employee benefits payable within twelve months is current: Current Liabilities, Short-term Provisions.',
    wrong: [
      ['ltp', 'Took the provision as long-term. It is payable within twelve months of the balance sheet date.'],
      ['reserves', 'Treated a provision as a reserve. A provision meets a liability; a reserve is profit kept back.'],
      ['tp', 'Trade payables are owed to suppliers of goods and services. This is an estimated amount due to employees.'],
    ] },

  // --- Non-Current Assets: Property, Plant and Equipment ---
  { name: 'Plant and machinery', sub: 'ppe', common: true,
    note: `Machinery held for use in the business is a tangible fixed asset: Non-Current Assets, ${PPE_IA}, Property, Plant and Equipment.`,
    wrong: [
      ['cwip', 'A machine already in use is not under construction.'],
      ['inv', 'Machinery kept for use in the business is not held for sale, so it is not inventory.'],
      ['onca', 'Tangible assets held for use have a line of their own, Property, Plant and Equipment.'],
    ] },
  { name: 'Land and building used for the factory', sub: 'ppe', common: true,
    note: `Land and building held for use in the business are tangible fixed assets: Non-Current Assets, ${PPE_IA}, Property, Plant and Equipment.`,
    wrong: [
      ['nci', 'Land and building used in the business are not an investment.'],
      ['cwip', 'The building is complete and in use, so it is not under construction.'],
      ['inv', 'Land and building used in the business are not held for sale.'],
    ] },
  { name: 'Vehicles', sub: 'ppe', common: true,
    note: `Vehicles held for use in the business are tangible fixed assets: Non-Current Assets, ${PPE_IA}, Property, Plant and Equipment.`,
    wrong: [
      ['inv', 'Vehicles kept for use in the business are not held for sale.'],
      ['onca', 'Tangible assets held for use have a line of their own, Property, Plant and Equipment.'],
      ['oca', 'Vehicles serve the business for years, so they are not current assets.'],
    ] },
  { name: 'Computers', sub: 'ppe', common: true,
    note: `Computers are physical assets held for use: Non-Current Assets, ${PPE_IA}, Property, Plant and Equipment.`,
    wrong: [
      ['intangible', 'Mixed the computers with the software that runs on them. Computers are physical assets.'],
      ['inv', 'Computers kept for use in the business are not held for sale.'],
      ['oca', 'Computers serve the business for years, so they are not current assets.'],
    ] },
  { name: 'Furniture and fixtures', sub: 'ppe', common: true,
    note: `Furniture held for use in the business is a tangible fixed asset: Non-Current Assets, ${PPE_IA}, Property, Plant and Equipment.`,
    wrong: [
      ['inv', 'Furniture kept for use in the business is not held for sale.'],
      ['onca', 'Tangible assets held for use have a line of their own, Property, Plant and Equipment.'],
      ['intangible', 'Furniture has a physical form, so it is not an intangible asset.'],
    ] },
  { name: 'Livestock', sub: 'ppe',
    note: `Livestock kept for use in the business is a tangible fixed asset: Non-Current Assets, ${PPE_IA}, Property, Plant and Equipment.`,
    wrong: [
      ['inv', 'Took animals kept for use in the business for goods held for sale.'],
      ['ci', 'Animals kept for use in the business are not an investment.'],
      ['oca', 'Livestock serves the business for years, so it is not a current asset.'],
    ] },

  // --- Non-Current Assets: Intangible Assets ---
  { name: 'Goodwill', sub: 'intangible', common: true,
    note: `Goodwill has no physical form: Non-Current Assets, ${PPE_IA}, Intangible Assets.`,
    wrong: [
      ['ppe', 'Goodwill has no physical form, so it is not property, plant and equipment.'],
      ['onca', 'Intangible assets have a line of their own; goodwill is one of them.'],
      ['nci', 'Goodwill is not an investment in another business; it is an intangible asset of this one.'],
    ] },
  { name: 'Patents', sub: 'intangible', common: true,
    note: `A patent is a right without physical form: Non-Current Assets, ${PPE_IA}, Intangible Assets.`,
    wrong: [
      ['ppe', 'A patent is a right with no physical form, so it is not property, plant and equipment.'],
      ['iaud', 'These patents are already granted and in use. The other line is only for intangibles still being developed.'],
      ['onca', 'Intangible assets have a line of their own; patents are among them.'],
    ] },
  { name: 'Trademarks', sub: 'intangible', common: true,
    note: `A trademark is a right without physical form: Non-Current Assets, ${PPE_IA}, Intangible Assets.`,
    wrong: [
      ['ppe', 'A trademark is a right with no physical form, so it is not property, plant and equipment.'],
      ['onca', 'Intangible assets have a line of their own; trademarks are among them.'],
      ['iaud', 'The trademarks are registered and in use. The other line is only for intangibles still being developed.'],
    ] },
  { name: 'Computer software', sub: 'intangible',
    note: `Software in use has no physical form: Non-Current Assets, ${PPE_IA}, Intangible Assets.`,
    wrong: [
      ['ppe', 'Put the software with the computers it runs on. Software has no physical form, so it is an intangible asset.'],
      ['iaud', 'The software is complete and in use. The other line is only for software still being developed.'],
      ['oca', 'Software serves the business for years, so it is not a current asset.'],
    ] },
  { name: 'Mining rights', sub: 'intangible',
    note: `A right to mine is a right, not the mine itself: Non-Current Assets, ${PPE_IA}, Intangible Assets.`,
    wrong: [
      ['ppe', 'Took the right to mine for the mine itself. A right has no physical form, so it is an intangible asset.'],
      ['onca', 'Intangible assets have a line of their own; mining rights are among them.'],
      ['ltla', 'Treated the amount paid for the right as an advance. It bought a right the company uses for years.'],
    ] },
  { name: 'Copyrights', sub: 'intangible',
    note: `A copyright is a right without physical form: Non-Current Assets, ${PPE_IA}, Intangible Assets.`,
    wrong: [
      ['ppe', 'A copyright is a right with no physical form, so it is not property, plant and equipment.'],
      ['iaud', 'The copyrights are already owned and in use. The other line is only for intangibles still being developed.'],
      ['nci', 'A copyright is not an investment in another business; it is an intangible asset the company uses.'],
    ] },
  { name: 'Licences and franchises', sub: 'intangible',
    note: `A licence or franchise is a right the company uses over years: Non-Current Assets, ${PPE_IA}, Intangible Assets.`,
    wrong: [
      ['ltla', 'Treated the fee paid for the licence as an advance. It bought a right the company uses for years.'],
      ['ppe', 'A licence is a right with no physical form, so it is not property, plant and equipment.'],
      ['oca', 'A licence serves the business for years, so it is not a current asset.'],
    ] },

  // --- Non-Current Assets: Capital work-in-progress; Intangible assets under development ---
  { name: 'Factory building under construction', sub: 'cwip',
    note: `A tangible fixed asset still being built is not ready for use: Non-Current Assets, ${PPE_IA}, Capital Work-in-Progress.`,
    wrong: [
      ['ppe', 'The building is not ready for use, so it is not yet property, plant and equipment.'],
      ['inv', 'Mixed capital work-in-progress with the work-in-progress of goods being made for sale.'],
      ['iaud', 'A building is a tangible asset, so its construction is capital work-in-progress.'],
    ] },
  { name: 'Software being developed by the company for its own use', sub: 'iaud',
    note: `An intangible asset not yet ready for use is shown apart: Non-Current Assets, ${PPE_IA}, Intangible Assets under Development.`,
    wrong: [
      ['intangible', 'The software is not ready for use yet. Only completed intangibles are shown as intangible assets.'],
      ['cwip', 'Capital work-in-progress is for tangible assets being built. Software is intangible.'],
      ['inv', 'Took software being developed for the company\'s own use for goods being made for sale.'],
    ] },
  { name: 'Cost of developing a patent that is not yet ready for use', sub: 'iaud',
    note: `An intangible asset not yet ready for use is shown apart: Non-Current Assets, ${PPE_IA}, Intangible Assets under Development.`,
    wrong: [
      ['intangible', 'The patent is not ready for use yet. Only completed intangibles are shown as intangible assets.'],
      ['cwip', 'Capital work-in-progress is for tangible assets being built. A patent is intangible.'],
      ['oca', 'Took the development cost for a current asset. It will become an intangible asset used for years.'],
    ] },

  // --- Non-Current Assets: Non-current investments, long-term loans and advances, other non-current assets ---
  { name: 'Shares in a subsidiary company, to be held for many years', sub: 'nci', common: true,
    note: 'An investment meant to be held for more than twelve months is non-current: Non-Current Assets, Non-current Investments.',
    wrong: [
      ['ci', 'Took the shares as held for sale within twelve months. They are to be held for many years.'],
      ['ltla', 'Buying shares is investing, not lending money.'],
      ['cash', 'Shares held for many years are not cash or a cash equivalent.'],
    ] },
  { name: 'Investment in 10-year government bonds, to be held till they mature', sub: 'nci',
    note: 'An investment to be held for more than twelve months is non-current: Non-Current Assets, Non-current Investments.',
    wrong: [
      ['ci', 'Took the bonds as realisable within twelve months. They are to be held till they mature, years from now.'],
      ['ltla', 'Buying bonds as an investment is not giving a loan or an advance.'],
      ['cash', 'Bonds held for years are not cash or a cash equivalent.'],
    ] },
  { name: 'Land bought as an investment, not for use in the business', sub: 'nci',
    note: 'Property held as an investment and not for use is an investment: Non-Current Assets, Non-current Investments.',
    wrong: [
      ['ppe', 'Property, plant and equipment are assets held for use in the business. This land is held only as an investment.'],
      ['ci', 'Took the land as held for sale within twelve months. It is a long-term investment.'],
      ['onca', 'Investments have a line of their own; this land is one of them.'],
    ] },
  { name: 'Capital advances (advance paid to a supplier for machinery ordered)', sub: 'ltla',
    note: 'An advance for a fixed asset does not come back as cash or goods of the operating cycle: Non-Current Assets, Long-term Loans and Advances.',
    wrong: [
      ['ppe', 'The machinery has not been received, so there is no property, plant and equipment to show yet.'],
      ['cwip', 'Nothing is being built yet. An advance paid for a capital asset is a long-term advance.'],
      ['stla', 'An advance for a fixed asset will not come back as cash or goods of the operating cycle, so it is long-term.'],
    ] },
  { name: 'Loan given to a subsidiary company, repayable after three years', sub: 'ltla',
    note: 'A loan given that is recoverable after more than twelve months is non-current: Non-Current Assets, Long-term Loans and Advances.',
    wrong: [
      ['nci', 'A loan given is not an investment, even when it is given to a subsidiary.'],
      ['stla', 'Took the loan as recoverable within twelve months. It is repayable after three years.'],
      ['onca', 'Loans given have a line of their own, long-term loans and advances.'],
    ] },
  { name: 'Security deposit with the electricity board, to stay for many years', sub: 'onca', moved: 'ltla',
    note: 'In Schedule III as amended in 2021, long-term security deposits are listed under Non-Current Assets, Other Non-current Assets.',
    wrong: [
      ['cash', 'Took a deposit kept with an authority for a balance in a bank.'],
      ['nci', 'A deposit kept as security is not an investment: it is lodged to keep the connection, not to earn a return.'],
      ['oca', 'Took the deposit as coming back within twelve months. It stays for as long as the connection lasts, so it is non-current.'],
    ] },
  { name: 'Trade receivables falling due 30 months after the balance sheet date (the operating cycle is 12 months)', sub: 'onca',
    note: 'Amounts due from customers after both twelve months and the operating cycle are non-current: Non-Current Assets, Other Non-current Assets.',
    wrong: [
      ['tr', 'Took every amount due from customers as current. These fall due after both twelve months and the operating cycle.'],
      ['ltla', 'Selling on credit is not giving a loan. Long-term trade receivables are shown under other non-current assets.'],
      ['oca', 'Took the amount as realisable within twelve months. It falls due after 30 months, so it is non-current.'],
    ] },

  // --- Current Assets ---
  { name: 'Units of an equity mutual fund, to be sold within six months', sub: 'ci',
    note: 'An investment meant to be realised within twelve months is current: Current Assets, Current Investments.',
    wrong: [
      ['nci', 'Took the units as a long-term holding. They are to be sold within six months.'],
      ['cash', 'Took a readily saleable investment for cash. It is shown as a current investment.'],
      ['stla', 'Buying units of a fund is investing, not lending money.'],
    ] },
  { name: 'Stock of raw materials', sub: 'inv', common: true,
    note: 'Materials waiting to be used in production are inventory: Current Assets, Inventories.',
    wrong: [
      ['oca', 'Inventories have a line of their own among the current assets.'],
      ['ppe', 'Materials are used up in production within the operating cycle. They are not kept for use over years.'],
      ['cwip', 'Capital work-in-progress is a fixed asset under construction. Materials for production are inventory.'],
    ] },
  { name: 'Work-in-progress (goods partly made, meant for sale)', sub: 'inv',
    note: 'Goods partly made and meant for sale are inventory: Current Assets, Inventories.',
    wrong: [
      ['cwip', 'Mixed the work-in-progress of goods for sale with capital work-in-progress, which is a fixed asset under construction.'],
      ['ppe', 'Goods being made for sale are not assets held for use.'],
      ['oca', 'Inventories have a line of their own among the current assets.'],
    ] },
  { name: 'Stock of finished goods', sub: 'inv', common: true,
    note: 'Goods made and waiting to be sold are inventory: Current Assets, Inventories.',
    wrong: [
      ['tr', 'Goods not yet sold are not receivable from anyone.'],
      ['oca', 'Inventories have a line of their own among the current assets.'],
      ['ci', 'Goods held for sale are not an investment.'],
    ] },
  { name: 'Stock-in-trade (goods bought for resale)', sub: 'inv', common: true,
    note: 'Goods bought for resale are inventory: Current Assets, Inventories.',
    wrong: [
      ['ci', 'Went by the word "stock" and took it for shares held. Stock-in-trade is goods bought for resale.'],
      ['oca', 'Inventories have a line of their own among the current assets.'],
      ['tr', 'Goods not yet sold are not receivable from anyone.'],
    ] },
  { name: 'Stores and spares', sub: 'inv',
    note: 'Stores and spares are used up in running the business: Current Assets, Inventories.',
    wrong: [
      ['ppe', 'Put the spares with the machines they are for. Stores and spares are used up, so Schedule III lists them under inventories.'],
      ['oca', 'Schedule III lists stores and spares under inventories, not among the other current assets.'],
      ['onca', 'Stores and spares are used up within the operating cycle, so they are current, and they are inventory.'],
    ] },
  { name: 'Loose tools', sub: 'inv',
    note: 'Schedule III lists loose tools under inventories: Current Assets, Inventories.',
    wrong: [
      ['ppe', 'Took loose tools for equipment. Schedule III lists them under inventories.'],
      ['oca', 'Schedule III lists loose tools under inventories, not among the other current assets.'],
      ['onca', 'Took loose tools for a long-term asset. Schedule III lists them under inventories, a current asset.'],
    ] },
  { name: 'Sundry debtors for goods sold', sub: 'tr', common: true,
    note: 'Amounts due from customers for goods sold are trade receivables: Current Assets, Trade Receivables.',
    wrong: [
      ['stla', 'Selling on credit is not lending money. Amounts due from customers are trade receivables.'],
      ['oca', 'Amounts due from customers have a line of their own, trade receivables.'],
      ['cash', 'An amount still due from a customer is not cash until it is received.'],
    ] },
  { name: 'Bills receivable', sub: 'tr', common: true,
    note: 'A bill received from a customer for goods sold is a trade receivable: Current Assets, Trade Receivables.',
    wrong: [
      ['cash', 'A bill is a promise to pay later. It is not cash until it is met.'],
      ['stla', 'A bill received for goods sold is not a loan given; it is due from a customer.'],
      ['tp', 'Mixed bills receivable with bills payable. A bill receivable is owed to the company.'],
    ] },
  { name: 'Cheques and drafts on hand', sub: 'cash',
    note: 'Cheques and drafts on hand are counted with cash: Current Assets, Cash and Cash Equivalents.',
    wrong: [
      ['tr', 'Thought the customer still owes the money until the cheque is cleared. Cheques on hand are counted with cash and cash equivalents.'],
      ['oca', 'Cheques and drafts on hand are part of cash and cash equivalents, which have a line of their own.'],
      ['ci', 'A cheque waiting to be banked is not an investment.'],
    ] },
  { name: 'Balance in current account with a bank', sub: 'cash', common: true,
    note: 'Balances with banks are part of cash and cash equivalents: Current Assets, Cash and Cash Equivalents.',
    wrong: [
      ['ci', 'A balance in a bank account is not an investment.'],
      ['stla', 'Money kept in a bank account is not a loan given.'],
      ['oca', 'Balances with banks are part of cash and cash equivalents, which have a line of their own.'],
    ] },
  { name: 'Advance paid to a supplier for raw materials', sub: 'stla',
    note: 'An advance for goods is settled within the operating cycle: Current Assets, Short-term Loans and Advances.',
    wrong: [
      ['tr', 'A supplier who has been paid in advance is not a customer; nothing has been sold.'],
      ['ltla', 'Mixed it with a capital advance. An advance for goods is settled within the operating cycle.'],
      ['inv', 'The materials have not been received yet, so there is no inventory to show.'],
    ] },
  { name: 'Loan to an employee, recoverable within six months', sub: 'stla',
    note: 'A loan given that is recoverable within twelve months is current: Current Assets, Short-term Loans and Advances.',
    wrong: [
      ['ltla', 'Took the loan as recoverable after more than twelve months. It is recoverable within six months.'],
      ['tr', 'Trade receivables arise from sales. An employee who has taken a loan is not a customer.'],
      ['oca', 'Loans given have a line of their own, short-term loans and advances.'],
    ] },
  { name: 'Prepaid insurance', sub: 'oca', common: true,
    note: 'An expense paid in advance is a current asset with no line of its own: Current Assets, Other Current Assets.',
    wrong: [
      ['ocl', 'Mixed an expense paid in advance with an expense owing. A prepaid expense is an asset.'],
      ['cash', 'The money has already been paid out. What is left is the right to insurance cover.'],
      ['onca', 'The cover paid for is used up within twelve months, so the asset is current.'],
    ] },
  { name: 'Interest accrued on investments', sub: 'oca',
    note: 'Income earned but not yet received is a current asset with no line of its own: Current Assets, Other Current Assets.',
    wrong: [
      ['ci', 'Added the interest to the investment. Interest earned but not received is shown apart, as another current asset.'],
      ['nci', 'Added the interest to the investment. Interest earned but not received is shown apart, as another current asset.'],
      ['ocl', 'Mixed income earned but not received with income received in advance. Accrued income is an asset.'],
    ] },
];

// A fault in the bank is a fault of this file, so it is refused when the file loads: every item needs three wrong
// heads, each different from the right one and from each other.
for (const item of BS_ITEMS) {
  const subs = item.wrong.map(([s]) => s);
  if (subs.length < 3 || subs.includes(item.sub) || new Set(subs).size !== subs.length) throw new Error(`fs: the wrong heads of "${item.name}" are not three different ones`);
  if (item.moved && subs.includes(item.moved)) throw new Error(`fs: "${item.name}" is set against the place it had before 2021`);
}

const itemsIn = (prompt: string): BsItem[] => BS_ITEMS.filter((i) => prompt.includes(`"${i.name}"`));
const onAssetsSide = (i: BsItem): boolean => isAssetMajor(majorOf(i.sub));

const WHERE_STEMS: ((name: string, co: string) => string)[] = [
  (n) => `Under which major head and sub-head of a company's balance sheet (Schedule III) is this item shown: "${n}"?`,
  (n, co) => `${co} is preparing its balance sheet as per Schedule III. Under which major head and sub-head does "${n}" go?`,
  (n, co) => `The books of ${co} show "${n}". Where does it appear in the balance sheet prepared as per Schedule III?`,
];

/** "Under which head and sub-head?" for the items of one side of the balance sheet, everyday or less usual. */
function subHeadTemplate(id: string, conceptId: string, difficulty: 'easy' | 'medium', pool: BsItem[], version = 1) {
  return mcqTemplate({
    id,
    topicId: T,
    conceptId,
    difficulty,
    version,
    generate: (rng) => {
      const item = rng.pick(pool);
      return {
        prompt: rng.pick(WHERE_STEMS)(item.name, company(rng)),
        correct: headOf(item.sub),
        distractors: item.wrong.map(([s, why]) => ({ text: headOf(s), why })),
        explanation: item.note,
        hints: ['Decide first whether it is equity, a liability or an asset, and whether it is current or non-current.', 'Then ask what kind of item it is: a borrowing, a provision, a payable; an asset held for use, an inventory, a receivable.'],
      };
    },
    // The item is read back from the prompt; the right option must be its head and no wrong option may be.
    verify: (q) => {
      const found = itemsIn(q.prompt);
      return found.length === 1 && pool.includes(found[0]) && correctText(q) === headOf(found[0].sub) && !wrongTexts(q).includes(headOf(found[0].sub));
    },
  });
}

const usable = (i: BsItem): boolean => !i.majorOnly;
const fsElSubHead = subHeadTemplate('fs-el-sub-head', 'fs-bs-equity-liabilities', 'easy', BS_ITEMS.filter((i) => usable(i) && !onAssetsSide(i) && i.common));
const fsAssetsSubHead = subHeadTemplate('fs-assets-sub-head', 'fs-bs-assets', 'easy', BS_ITEMS.filter((i) => usable(i) && onAssetsSide(i) && i.common));
// Version 2: Debenture Redemption Reserve in the bank in place of Share Options Outstanding Account.
const fsElSubHeadTricky = subHeadTemplate('fs-el-sub-head-tricky', 'fs-bs-equity-liabilities', 'medium', BS_ITEMS.filter((i) => usable(i) && !onAssetsSide(i) && !i.common), 2);
const fsAssetsSubHeadTricky = subHeadTemplate('fs-assets-sub-head-tricky', 'fs-bs-assets', 'medium', BS_ITEMS.filter((i) => usable(i) && onAssetsSide(i) && !i.common));

// --- The major head alone ----------------------------------------------------------------------------------------

/**
 * The mistake of placing an item of equity and liabilities under another major head of that side, when the bank
 * names none for that head.
 */
function majorWhy(right: Major, wrong: Major): string {
  if (wrong === 'sam') return 'That head is only for money received on shares that have not been allotted yet.';
  if (right === 'sam') return 'Treated money received for shares still to be allotted as an amount owed to outsiders. It has a head of its own until the shares are allotted.';
  if (right === 'cl' && wrong === 'ncl') return 'Took it for a long-term obligation. It is to be settled within twelve months of the balance sheet date, so it is current.';
  if (right === 'ncl' && wrong === 'cl') return 'Took it as due within twelve months. It is not due for settlement within twelve months of the balance sheet date, so it is non-current.';
  if (right === 'sf') return "Treated an item of the shareholders' own funds as an amount owed to outsiders.";
  return "Treated an amount owed to others as part of the shareholders' own funds.";
}
const EL_ITEMS = BS_ITEMS.filter((i) => !onAssetsSide(i));
const MAJOR_STEMS: ((name: string, co: string) => string)[] = [
  (n) => `Under which major head of a company's balance sheet (Schedule III) is this item shown: "${n}"?`,
  (n, co) => `${co} is preparing its balance sheet as per Schedule III. Which major head does "${n}" come under?`,
  (n, co) => `The books of ${co} show "${n}". Name the major head of the balance sheet it is shown under.`,
];

const fsBsMajorHead = mcqTemplate({
  id: 'fs-bs-major-head',
  version: 2,
  topicId: T,
  conceptId: 'fs-bs-form',
  difficulty: 'easy',
  generate: (rng) => {
    // Items of equity and liabilities only: that side has four major heads, so every wrong head is one a student
    // could really choose. (The assets side has two, and its items are asked for their sub-head instead.)
    const item = rng.pick(EL_ITEMS);
    const right = majorOf(item.sub);
    const named = (m: Major) => item.wrong.find(([s]) => majorOf(s) === m)?.[1];
    // The other three heads of the side, and a head of the assets side where the bank names that confusion.
    const others: Major[] = [...(['sf', 'sam', 'ncl', 'cl'] as Major[]).filter((m) => m !== right), ...(['nca', 'ca'] as Major[]).filter((m) => named(m) !== undefined)];
    return {
      prompt: rng.pick(MAJOR_STEMS)(item.name, company(rng)),
      correct: MAJOR[right],
      distractors: others.map((m) => ({ text: MAJOR[m], why: named(m) ?? majorWhy(right, m) })),
      explanation: item.note,
      hints: ['Is it equity, a liability or an asset?', 'A liability or an asset is current when it is settled or realised within twelve months of the balance sheet date or within the operating cycle.'],
    };
  },
  verify: (q) => {
    const found = itemsIn(q.prompt);
    return found.length === 1 && !onAssetsSide(found[0]) && correctText(q) === MAJOR[majorOf(found[0].sub)] && !wrongTexts(q).includes(correctText(q));
  },
});

// --- Which item is shown under a head, and which is not ------------------------------------------------------------

const trueItems = (x: Sub): BsItem[] => BS_ITEMS.filter((i) => i.sub === x && usable(i));
/** The items of a head that every book in use places there: the ones a student may be told "do belong". */
const settled = (x: Sub): BsItem[] => trueItems(x).filter((i) => !i.moved);
const confusers = (x: Sub): BsItem[] => BS_ITEMS.filter((i) => i.sub !== x && i.wrong.some(([s]) => s === x));
const whyNot = (i: BsItem, x: Sub): string => i.wrong.find(([s]) => s === x)![1];

const UNDER_STEMS: ((head: string, co: string) => string)[] = [
  (h) => `Which of the following is shown under ${h} in a company's balance sheet (Schedule III)?`,
  (h, co) => `${co} is preparing its balance sheet as per Schedule III. Which of these items does it show under ${h}?`,
  (h) => `Only one of these items belongs under ${h} in a balance sheet prepared as per Schedule III. Which one?`,
];
const NOT_UNDER_STEMS: ((head: string, co: string) => string)[] = [
  (h) => `Which of the following is NOT shown under ${h} in a company's balance sheet (Schedule III)?`,
  (h, co) => `${co} is preparing its balance sheet as per Schedule III. Which of these items is NOT shown under ${h}?`,
  (h) => `Three of these items belong under ${h} in a balance sheet prepared as per Schedule III. Which one is NOT shown there?`,
];

/** "Which of these is shown under X?" and "Which is NOT shown under X?", for the sub-heads of one side. */
/** The hints of "which is (not) shown under X?", on both sides of the balance sheet (from version 2). */
const WHICH_UNDER_HINTS = [
  'Place each option on its own first: is it owned or owed, is it current, and what kind of item is it?',
  'Then keep the one option that does (or, if the question says NOT, does not) belong under the head named.',
];
function whichUnderTemplate(id: string, conceptId: string, assets: boolean) {
  const subs = (Object.keys(SUBS) as Sub[]).filter((s) => isAssetMajor(majorOf(s)) === assets && s !== 'sam' && s !== 'warrants');
  const cases: { x: Sub; not: boolean }[] = [
    ...subs.filter((x) => trueItems(x).length >= 1 && confusers(x).length >= 3).map((x) => ({ x, not: false })),
    ...subs.filter((x) => settled(x).length >= 3 && confusers(x).length >= 1).map((x) => ({ x, not: true })),
  ];
  return mcqTemplate({
    id,
    topicId: T,
    conceptId,
    difficulty: 'medium',
    // Version 2: hints of its own, and (equity and liabilities) Debenture Redemption Reserve in the bank.
    version: 2,
    generate: (rng) => {
      const { x, not } = rng.pick(cases);
      if (!not) {
        const right = rng.pick(trueItems(x));
        return {
          prompt: rng.pick(UNDER_STEMS)(`"${headOf(x)}"`, company(rng)),
          correct: right.name,
          distractors: rng.shuffle(confusers(x)).slice(0, 5).map((i) => ({ text: i.name, why: `${whyNot(i, x)} ${i.note}` })),
          explanation: right.note,
          hints: WHICH_UNDER_HINTS,
        };
      }
      const odd = rng.pick(confusers(x));
      return {
        prompt: rng.pick(NOT_UNDER_STEMS)(`"${headOf(x)}"`, company(rng)),
        correct: odd.name,
        distractors: rng.shuffle(settled(x)).slice(0, 4).map((i) => ({ text: i.name, why: `Thought this item does not belong here, but it does. ${i.note}` })),
        explanation: `${odd.note} ${whyNot(odd, x)}`,
        hints: WHICH_UNDER_HINTS,
      };
    },
    // Read back from the prompt and the options: under the head named, exactly the right options must belong.
    verify: (q) => {
      const x = (Object.keys(SUBS) as Sub[]).find((s) => q.prompt.includes(`"${headOf(s)}"`));
      if (!x) return false;
      const subOf = (text: string) => BS_ITEMS.find((i) => i.name === text)?.sub;
      const right = subOf(correctText(q));
      const wrong = wrongTexts(q).map(subOf);
      if (right === undefined || wrong.includes(undefined)) return false;
      return q.prompt.includes('NOT shown') ? right !== x && wrong.every((s) => s === x) : right === x && wrong.every((s) => s !== x);
    },
  });
}

const fsElWhichUnder = whichUnderTemplate('fs-el-which-under', 'fs-bs-equity-liabilities', false);
const fsAssetsWhichUnder = whichUnderTemplate('fs-assets-which-under', 'fs-bs-assets', true);

// --- Two items at once (complex) -------------------------------------------------------------------------------------

const TRICKY = BS_ITEMS.filter((i) => usable(i) && !i.common);

const fsBsTwoItems = mcqTemplate({
  id: 'fs-bs-two-items',
  version: 2,
  topicId: T,
  conceptId: 'fs-bs-form',
  difficulty: 'complex',
  generate: (rng) => {
    const one = rng.pick(TRICKY);
    // An item the amendment moved is not paired with one that stands in its older place: the two heads the wrong way
    // round would then put it there.
    const two = rng.pick(TRICKY.filter((i) => i.sub !== one.sub && i.sub !== one.moved && i.moved !== one.sub));
    // A wrong head for each item, chosen so that no wrong pair can come out as the right pair or as another wrong one.
    const f1 = rng.pick(one.wrong.filter(([s]) => s !== two.sub));
    const f2 = rng.pick(two.wrong.filter(([s]) => s !== one.sub && s !== f1[0]));
    const pair = (a: Sub, b: Sub) => `(i) ${headOf(a)}; (ii) ${headOf(b)}`;
    return {
      prompt: `Under which heads of a company's balance sheet (Schedule III) are these two items shown, in this order? (i) "${one.name}" (ii) "${two.name}"`,
      correct: pair(one.sub, two.sub),
      distractors: [
        { text: pair(two.sub, one.sub), why: 'Matched the two heads to the items in the wrong order.' },
        { text: pair(one.sub, f2[0]), why: `Item (i) is right. For item (ii): ${low(f2[1])}` },
        { text: pair(f1[0], two.sub), why: `Item (ii) is right. For item (i): ${low(f1[1])}` },
        { text: pair(f1[0], f2[0]), why: `Both are wrong. For item (i): ${low(f1[1])} For item (ii): ${low(f2[1])}` },
      ],
      explanation: `(i) ${one.note} (ii) ${two.note}`,
      hints: ['Place each item on its own first: equity, liability or asset; current or non-current; then the sub-head.', 'Then match the two heads in the order the items are written.'],
    };
  },
  verify: (q) => {
    const found = itemsIn(q.prompt).sort((a, b) => q.prompt.indexOf(`"${a.name}"`) - q.prompt.indexOf(`"${b.name}"`));
    return found.length === 2 && correctText(q) === `(i) ${headOf(found[0].sub)}; (ii) ${headOf(found[1].sub)}` && !wrongTexts(q).includes(correctText(q));
  },
});

// ---------------------------------------------------------------------------------------------------------------
// Current or non-current: twelve months and the operating cycle
// ---------------------------------------------------------------------------------------------------------------

/**
 * The two hints of the templates that work out an amount (from version 2): a first nudge, then the step named. Each
 * template had the general pair before.
 */
const HINTS = {
  cncSplit: ['Find the dividing line first: the longer of twelve months and the operating cycle.', 'Add the amounts that fall due within that period: they are current. What falls due after it is non-current.'],
  cncLoan: ['Count the instalments already paid by the balance sheet date, and find what is still owed.', 'The instalment due within the next twelve months is the current maturity (Short-term Borrowings); the rest of the balance is Long-term Borrowings.'],
  materials: ['Materials used up = what was on hand at the start + what was bought - what is left at the end.', 'Cost of materials consumed = Opening inventory + Purchases - Closing inventory. To find the purchases, turn the formula round.'],
  totalIncome: ["Ask of each figure whether it comes from the company's main business.", 'Revenue from operations = sales - sales returns + sale of scrap (for a manufacturer); interest, dividend, rent and profit on sale of an asset are other income; total income is the two together.'],
  employees: ['Pick out everything paid to the employees or for their benefit.', "Add wages, salaries, bonus, the employer's contribution to provident fund, gratuity and staff welfare. Audit fee, agents' commission, interest, rent and depreciation are not employee benefits."],
  otherExpenses: ['Strike out every item that has a line of its own in the statement.', 'Pay to employees, interest and depreciation have their own lines. Add up what is left.'],
  financeCosts: ['Ask of each item: is it a cost of money borrowed?', 'Work out the interest on the debentures from their rate, then add the other interest and the discount or loss written off. Charges for a service of the bank and a dividend are not finance costs.'],
  financePremium: ['Two parts make the finance cost: the interest for the months the debentures were out, and the part of the discount or loss charged to profit.', 'Charged to profit = discount or loss - Securities Premium used. Interest = face value × rate × months ÷ 12.'],
  profit: ['Work out the interest on the debentures from the rate first, and set the dividend aside.', 'Profit before tax = (revenue + other income) - every expense. For the profit after tax, deduct the tax at the rate given.'],
  inventories: ['Ask of each item: is it goods, or something used up in making or selling them?', 'Inventories = raw materials + work-in-progress + finished goods + stock-in-trade + stores and spares + loose tools. Capital work-in-progress and amounts due are not inventories.'],
  cash: ['Keep only cash, money in a bank account, and cheques or drafts in hand.', 'Cash and cash equivalents = cash on hand + balances with banks + cheques and drafts on hand. A bank overdraft is a borrowing: it is not deducted.'],
  stb: ['Keep only money borrowed that is repayable on demand or within twelve months.', 'Short-term borrowings = bank overdraft + cash credit or a loan repayable on demand + current maturities of long-term borrowings (the 2021 form). Interest owing and trade payables are not borrowings.'],
  ocl: ['Work out the interest accrued for the months stated, from the loan and the rate.', 'Other current liabilities are known amounts owed that are not borrowings, trade payables or provisions: unpaid dividend, calls in advance, outstanding expenses, income received in advance, interest accrued.'],
  cl: ['Split the term loan first: only the part repayable within twelve months is current.', 'Current liabilities = short-term borrowings (with that part) + trade payables + other current liabilities + short-term provisions.'],
  reserves: ['Keep only the reserves and the balance of the Statement of Profit and Loss.', 'Add the reserves. Add a credit balance of the Statement of Profit and Loss, or deduct a debit balance.'],
  shareCapital: ['Start from the amount called up on the shares allotted.', 'Share capital = called-up capital - calls in arrears + forfeited shares not yet reissued. Securities Premium belongs to Reserves and Surplus.'],
  funds: ["Shareholders' Funds = Share Capital + Reserves and Surplus: work out each part.", 'Deduct the calls in arrears from the capital and a debit balance of the Statement of Profit and Loss from the reserves. Share application money and debentures stand outside.'],
  contingent: ['Ask of each item: is it owed now, owed only if something uncertain happens, or a contract to spend later?', 'A contingent liability hangs on an uncertain event; a commitment is a contract for future spending; an actual liability is shown in the balance sheet, not in this note.'],
};

const CNC_RULE =
  'An asset or a liability is current when it is realised or settled within twelve months of the balance sheet date or within the operating cycle. An operating cycle that cannot be identified is taken as twelve months.';
const OPERATING_CYCLES: (number | null)[] = [6, 8, 9, 10, null, 14, 15, 16, 18, 20];

const fsCncOperatingCycle = mcqTemplate({
  id: 'fs-cnc-operating-cycle',
  topicId: T,
  conceptId: 'fs-current-non-current',
  difficulty: 'medium',
  generate: (rng) => {
    const receivable = rng.next() < 0.5;
    const oc = rng.pick(OPERATING_CYCLES);
    const limit = Math.max(12, oc ?? 12);
    const current = rng.next() < 0.5;
    // A current amount is put where one of the two tests alone would fail: past the shorter of them, within the longer.
    // The exact end of either period is never asked: "within twelve months" should not turn on a day.
    const months = !current ? rng.int(limit + 1, limit + 9) : oc === null ? rng.int(7, 11) : oc > 12 ? rng.int(13, oc - 1) : rng.int(oc + 1, 11);
    const x = inr(amt(rng, 50000, 900000, 10000));
    const cycle = oc === null ? 'cannot identify its operating cycle' : `has an operating cycle of ${oc} months`;
    const what = receivable ? `Its trade receivables include ${x} that is expected to be realised` : `Its trade payables include ${x} that is due to be paid`;
    const [cur, non, loanLike, otherCur]: Sub[] = receivable ? ['tr', 'onca', 'ltla', 'oca'] : ['tp', 'oltl', 'ltb', 'ocl'];
    const party = receivable ? 'an amount due from customers' : 'an amount owed to suppliers';
    const kind = receivable ? 'receivable' : 'payable';
    const both = `beyond both twelve months and the operating cycle${oc === null ? ', which is taken as twelve months' : ` of ${oc} months`}`;
    const opposite = !current
      ? `Took every trade ${kind} as current. This amount falls due after ${months} months, ${both}.`
      : oc === null
        ? `Thought nothing can be called current when the operating cycle is not known. The cycle is then taken as twelve months, and ${months} months is within it.`
        : oc > 12
          ? `Applied the twelve-month test alone. The operating cycle is ${oc} months, and an item ${receivable ? 'realised' : 'settled'} within the operating cycle is current even after twelve months.`
          : `Called it non-current because it runs past the operating cycle of ${oc} months. It still falls within twelve months of the balance sheet date, and that is enough to make it current.`;
    const loanWhy = current
      ? `Called it non-current, and also took ${party} for ${receivable ? 'a loan given' : 'money borrowed'}.`
      : `Right that it is non-current, but ${party} is not ${receivable ? 'a loan or an advance' : 'money borrowed'}. Long-term trade ${kind}s are shown under ${receivable ? 'other non-current assets' : 'other long-term liabilities'}.`;
    const otherWhy = current ? `Right that it is current, but ${party} has a line of its own: trade ${kind}s.` : `Called it current, though it falls due ${both}.`;
    const reason = !current
      ? `${months} months is ${both}, so the amount is non-current`
      : oc !== null && oc > 12
        ? `${months} months is within the operating cycle of ${oc} months, so the amount is current`
        : `${months} months is within twelve months of the balance sheet date, so the amount is current`;
    const right = current ? cur : non;
    return {
      prompt: `${company(rng)} ${cycle}. ${what} ${months} months after the balance sheet date. Under which major head and sub-head is this amount shown?`,
      correct: headOf(right),
      distractors: [
        { text: headOf(current ? non : cur), why: opposite },
        { text: headOf(loanLike), why: loanWhy },
        { text: headOf(otherCur), why: otherWhy },
      ],
      explanation: `${CNC_RULE} Here ${reason}: ${headOf(right)}.`,
      hints: ['Find the longer of twelve months and the operating cycle.', 'An amount that falls due within that time is current; one that falls due after it is non-current.'],
    };
  },
  // Worked again from the two periods in the prompt.
  verify: (q) => {
    const oc = /operating cycle of (\d+) months/.exec(q.prompt);
    const m = /(\d+) months after the balance sheet date/.exec(q.prompt);
    if (!m || (!oc && !q.prompt.includes('cannot identify its operating cycle'))) return false;
    const current = Number(m[1]) <= Math.max(12, oc ? Number(oc[1]) : 12);
    const expected: Sub = q.prompt.includes('trade receivables') ? (current ? 'tr' : 'onca') : current ? 'tp' : 'oltl';
    return correctText(q) === headOf(expected) && !wrongTexts(q).includes(headOf(expected));
  },
});

// --- A due date and the balance sheet date --------------------------------------------------------------------------

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
/** Due dates within twelve months of 31 March of year y, and beyond them: the day and month, and the years after y. */
const DUE_WITHIN: [string, number][] = [['30 June', 0], ['30 September', 0], ['31 December', 0], ['31 January', 1], ['28 February', 1]];
const DUE_BEYOND: [string, number][] = [['30 June', 1], ['30 September', 1], ['31 December', 1], ['31 March', 2], ['30 September', 2], ['31 March', 3]];

interface DueKind {
  text: (due: string, rng: Rng) => string;
  cur: Sub;
  non: Sub;
  /** The mistake of calling it non-current when it is current, and the reverse. */
  opposite: [string, string];
  /** Two more wrong heads, each with the mistake when the item is current and when it is non-current. */
  others: [Sub, string, string][];
}
const BORROWING_OTHERS: [Sub, string, string][] = [
  ['stp', 'A sum borrowed that falls due is a known amount, not an estimate, so it is not a provision.', 'Took it as due within twelve months, and as a provision though it is a known sum borrowed.'],
  ['oltl', 'Called it non-current though it is repayable within twelve months; and money borrowed is a borrowing, not an "other" liability.', 'Right that it is non-current, but money borrowed is a borrowing, not an "other" liability.'],
];
const BORROWING_OPPOSITE: [string, string] = [
  'Went by the original term of the borrowing. What counts is the time left: it is repayable within twelve months of the balance sheet date, so it is a current maturity.',
  'Took it as repayable within twelve months. It falls due more than twelve months after the balance sheet date.',
];
const DUE_KINDS: DueKind[] = [
  { text: (due, rng) => `A term loan taken from a bank for ${rng.pick(['five', 'six', 'seven'])} years is repayable in one sum on ${due}.`, cur: 'stb', non: 'ltb', opposite: BORROWING_OPPOSITE, others: BORROWING_OTHERS },
  { text: (due, rng) => `Its ${rng.pick([8, 9, 10])}% Debentures, issued ${rng.pick(['six', 'seven', 'eight'])} years ago, are redeemable on ${due}.`, cur: 'stb', non: 'ltb', opposite: BORROWING_OPPOSITE, others: BORROWING_OTHERS },
  { text: (due) => `Public deposits it accepted for a term of three years are repayable on ${due}.`, cur: 'stb', non: 'ltb', opposite: BORROWING_OPPOSITE, others: BORROWING_OTHERS },
  { text: (due) => `A loan given by it to another company is recoverable in one sum on ${due}.`, cur: 'stla', non: 'ltla',
    opposite: ['Called it non-current, though the loan is recoverable within twelve months of the balance sheet date.', 'Called it current, though the loan is recoverable more than twelve months after the balance sheet date.'],
    others: [
      ['nci', 'A loan given is not an investment, and this one is recoverable within twelve months.', 'A loan given is not an investment. It is a long-term loan and advance.'],
      ['oca', 'Right that it is current, but loans given have a line of their own, short-term loans and advances.', 'Called it current, though the loan is recoverable more than twelve months after the balance sheet date.'],
    ] },
  { text: (due) => `A provision for gratuity has been made for employees who will retire, and be paid, on ${due}.`, cur: 'stp', non: 'ltp',
    opposite: ['Called it non-current, though the gratuity is payable within twelve months of the balance sheet date.', 'Called it current, though the gratuity is payable more than twelve months after the balance sheet date.'],
    others: [
      ['ocl', 'Right that it is current, but an estimated amount set aside for a liability is a provision, which has a line of its own.', 'Called it current, and missed that an estimated amount set aside for a liability is a provision.'],
      ['reserves', 'Mixed a provision with a reserve. A provision meets a liability; a reserve is profit kept back.', 'Mixed a provision with a reserve. A provision meets a liability; a reserve is profit kept back.'],
    ] },
];

const fsCncDueDate = mcqTemplate({
  id: 'fs-cnc-due-date',
  topicId: T,
  conceptId: 'fs-current-non-current',
  difficulty: 'medium',
  generate: (rng) => {
    const y = rng.pick(YEARS);
    const kind = rng.pick(DUE_KINDS);
    const current = rng.next() < 0.5;
    const [day, add] = rng.pick(current ? DUE_WITHIN : DUE_BEYOND);
    const due = `${day} ${y + add}`;
    const right = current ? kind.cur : kind.non;
    const borrowing = kind.cur === 'stb';
    return {
      prompt: `${company(rng)} is preparing its balance sheet as at 31 March ${y}. ${kind.text(due, rng)} Under which major head and sub-head is the amount shown in that balance sheet?`,
      correct: headOf(right),
      distractors: [
        { text: headOf(current ? kind.non : kind.cur), why: kind.opposite[current ? 0 : 1] },
        ...kind.others.map(([s, whenCurrent, whenNot]) => ({ text: headOf(s), why: current ? whenCurrent : whenNot })),
      ],
      explanation: `The amount falls due on ${due}, ${current ? 'within twelve months of' : 'more than twelve months after'} the balance sheet date of 31 March ${y}, so it is ${current ? 'current' : 'non-current'}: ${headOf(right)}.${current && borrowing ? ' In Schedule III as amended in 2021, the current maturity of a long-term borrowing is shown under short-term borrowings.' : ''}`,
      hints: ['Count the months from the balance sheet date to the due date.', 'Within twelve months it is current, whatever the original term was; beyond twelve months it is non-current.'],
    };
  },
  // The months between the two dates are counted again from the prompt.
  verify: (q) => {
    const bs = /as at 31 March (\d{4})/.exec(q.prompt);
    const due = / on \d{1,2} ([A-Z][a-z]+) (\d{4})\./.exec(q.prompt);
    if (!bs || !due) return false;
    const months = (Number(due[2]) - Number(bs[1])) * 12 + (MONTHS.indexOf(due[1]) - 2);
    const current = months > 0 && months < 12;
    if (!current && months <= 12) return false; // exactly twelve months is not asked
    const kind = q.prompt.includes('loan given') ? ['stla', 'ltla'] : q.prompt.includes('provision for gratuity') ? ['stp', 'ltp'] : ['stb', 'ltb'];
    return correctText(q) === headOf(kind[current ? 0 : 1] as Sub);
  },
});

// --- How much is current -----------------------------------------------------------------------------------------------

const fsCncSplitAmount = numericTemplate({
  id: 'fs-cnc-split-amount',
  version: 2,
  topicId: T,
  conceptId: 'fs-current-non-current',
  difficulty: 'medium',
  unit: 'rupees',
  generate: (rng) => {
    const receivable = rng.next() < 0.5;
    const oc = rng.pick([6, 8, 9, 10, 15, 16, 18, 20, 24]);
    const lo = Math.min(12, oc);
    const hi = Math.max(12, oc);
    // The exact end of either period is never asked: "within twelve months" should not turn on a day.
    const [m1, m2, m3] = [rng.int(2, lo - 1), rng.int(lo + 1, hi - 1), rng.int(hi + 1, hi + 10)];
    const [a, b, c] = [amt(rng, 100000, 800000, 10000), amt(rng, 50000, 400000, 10000), amt(rng, 50000, 400000, 10000)];
    const askCurrent = rng.next() < 0.6;
    const item = receivable ? 'trade receivables' : 'trade payables';
    const verb = receivable ? 'Realised' : 'Payable';
    const side = receivable ? 'assets' : 'liabilities';
    const prompt = [
      `${firm(rng.pick(MAKERS))}, has an operating cycle of ${oc} months. Its ${item} at the balance sheet date fall due as shown. How much of them is shown under ${askCurrent ? 'current' : 'non-current'} ${side}?`,
      `${verb} after ${m1} months: ${inr(a)}`,
      `${verb} after ${m2} months: ${inr(b)}`,
      `${verb} after ${m3} months: ${inr(c)}`,
    ].join('\n');
    const oneTest =
      oc > 12
        ? `Applied the twelve-month test alone. The operating cycle is ${oc} months, so the amount due after ${m2} months is current too.`
        : `Treated everything beyond the operating cycle of ${oc} months as non-current. The amount due after ${m2} months is within twelve months, so it is current.`;
    const working = [
      CNC_RULE,
      `The longer of twelve months and the operating cycle of ${oc} months is ${hi} months.`,
      `Due after ${m1} and ${m2} months: within ${hi} months, so current: ${inr(a)} + ${inr(b)} = ${inr(a + b)}.`,
      `Due after ${m3} months: beyond ${hi} months, so non-current: ${inr(c)}.`,
    ];
    return askCurrent
      ? numeric(prompt, a + b, [
          { value: a, why: oneTest },
          { value: a + b + c, why: `Took all ${item} as current, whatever their period.` },
          { value: c, why: 'Gave the non-current part.' },
        ], working, HINTS.cncSplit)
      : numeric(prompt, c, [
          { value: b + c, why: oneTest },
          { value: a + b, why: 'Gave the current part.' },
        ], working, HINTS.cncSplit);
  },
  // Each line is tested again on its months against the longer of twelve months and the operating cycle.
  verify: (q) => {
    const oc = Number(/operating cycle of (\d+) months/.exec(q.prompt)?.[1]);
    const rows = listed(q.prompt).map((l) => ({ months: Number(/after (\d+) months/.exec(l.label)?.[1]), rs: l.rs }));
    if (rows.length !== 3 || !Number.isFinite(oc)) return false;
    const current = sum(rows.filter((r) => r.months <= Math.max(12, oc)).map((r) => r.rs));
    return answerRs(q) === (q.prompt.includes('under current') ? current : sum(rows.map((r) => r.rs)) - current);
  },
});

const fsCncLoanInstalments = numericTemplate({
  id: 'fs-cnc-loan-instalments',
  version: 2,
  topicId: T,
  conceptId: 'fs-current-non-current',
  difficulty: 'complex',
  unit: 'rupees',
  generate: (rng) => {
    const n = rng.pick([5, 6, 8, 10]);
    const per = amt(rng, 50000, 400000, 25000);
    const loan = per * n;
    const y = rng.pick(YEARS);
    const day = rng.pick(['30 June', '30 September', '31 December']);
    // Instalments fall in the calendar years first, first + 1, ...; those up to year y - 1 are paid by 31 March y.
    const paid = rng.int(1, n - 3);
    const first = y - paid;
    const left = loan - paid * per;
    const askLong = rng.next() < 0.6;
    const prompt = `${firm(rng.pick(ANY_FIRM))}, took a term loan of ${inr(loan)} from a bank, repayable in ${n} equal annual instalments on ${day} every year, the first on ${day} ${first}. Every instalment has been paid on its due date. In the balance sheet as at 31 March ${y}, how much of the loan is shown ${askLong ? `under ${headOf('ltb')}` : 'under Current Liabilities, as the current maturity of the loan'}?`;
    const working = [
      `Each instalment = ${inr(loan)} ÷ ${n} = ${inr(per)}.`,
      `Instalments paid up to 31 March ${y}: ${paid} (${day} ${first}${paid > 1 ? ` to ${day} ${y - 1}` : ''}), so ${inr(left)} is still owed.`,
      `The instalment due on ${day} ${y} falls within twelve months: ${inr(per)} is a current maturity, a current liability (shown under short-term borrowings in Schedule III as amended in 2021).`,
      `The rest, ${inr(left)} - ${inr(per)} = ${inr(left - per)}, is shown under long-term borrowings.`,
    ];
    return askLong
      ? numeric(prompt, left - per, [
          { value: left, why: 'Kept the whole balance under long-term borrowings. The instalment due within twelve months is a current maturity, a current liability.' },
          { value: loan - per, why: 'Deducted the next instalment from the original loan, ignoring the instalments already repaid.' },
          { value: per, why: 'Gave the current maturity, which is a current liability.' },
          { value: loan, why: 'Showed the loan at its original amount, ignoring both the instalments repaid and the one due within twelve months.' },
        ], working, HINTS.cncLoan)
      : numeric(prompt, per, [
          { value: left, why: 'Showed the whole balance as current. Only the instalment due within twelve months is a current maturity.' },
          { value: left - per, why: 'Gave the part shown under long-term borrowings.' },
          { value: paid * per, why: 'Gave the amount already repaid.' },
        ], working, HINTS.cncLoan);
  },
  // The instalments are counted again from the dates in the prompt.
  verify: (q) => {
    const m = /loan of (₹[\d,]+) .* in (\d+) equal annual instalments on \d+ [A-Z][a-z]+ every year, the first on \d+ [A-Z][a-z]+ (\d{4})\..* as at 31 March (\d{4})/.exec(q.prompt);
    if (!m) return false;
    const [loan, n, first, y] = [amountsIn(m[1])[0], Number(m[2]), Number(m[3]), Number(m[4])];
    const paid = y - first; // one a year, in the calendar years first to y - 1
    const per = loan / n;
    const long = loan - (paid + 1) * per;
    return paid >= 1 && long > 0 && answerRs(q) === (q.prompt.includes(headOf('ltb')) ? long : per);
  },
});

// ---------------------------------------------------------------------------------------------------------------
// The Statement of Profit and Loss: its lines and the bank of items
// ---------------------------------------------------------------------------------------------------------------

export type PlLine = 'rfo' | 'oi' | 'cmc' | 'pst' | 'chg' | 'ebe' | 'fc' | 'dep' | 'oe' | 'tax';
/** The name of each line and what it shows, in a phrase that follows "which shows". */
const PL: Record<PlLine, [string, string]> = {
  rfo: ['Revenue from Operations', 'what the company earns from its main business: sales of goods and services and other operating revenues'],
  oi: ['Other Income', 'incomes that do not come from the main business, such as interest, dividend and profit on sale of a fixed asset'],
  cmc: ['Cost of Materials Consumed', 'the raw materials used up in production'],
  pst: ['Purchases of Stock-in-Trade', 'goods bought for resale without processing'],
  chg: ['Changes in Inventories of Finished Goods, Work-in-Progress and Stock-in-Trade', 'the difference between the opening and closing inventories of finished goods, work-in-progress and stock-in-trade'],
  ebe: ['Employee Benefits Expense', 'what the company spends on its employees: wages, salaries, bonus, provident fund contribution and staff welfare'],
  fc: ['Finance Costs', 'the cost of borrowing: interest on loans and debentures and other borrowing costs'],
  dep: ['Depreciation and Amortisation Expense', 'depreciation of tangible fixed assets and amortisation of intangible ones'],
  oe: ['Other Expenses', 'every expense that has no line of its own, such as rent, audit fee, carriage and bad debts'],
  tax: ['Tax Expense', 'the income tax on the profit of the year'],
};
const lineName = (l: PlLine): string => PL[l][0];

export interface PlItem {
  name: string;
  line: PlLine;
  note: string;
  /** The wrong lines students choose, each with the mistake behind it; topped up to three where fewer are named. */
  wrong: [PlLine, string][];
}

const NO_OWN_LINE = 'Other expenses are those with no line of their own. Everything paid to or for employees has one.';
const INTEREST_NOT_OTHER = 'Interest on borrowed money has a line of its own and is not one of the other expenses.';
const INTEREST_PAID = 'Mixed interest paid with interest received. This interest is a cost to the company.';
const DEP_OWN_LINE = 'Depreciation and amortisation have a line of their own and are not among the other expenses.';

export const PL_ITEMS: PlItem[] = [
  // --- Employee benefits expense ---
  { name: 'Wages', line: 'ebe', note: 'Wages are pay to employees: Employee Benefits Expense.',
    wrong: [
      ['cmc', 'Took wages for a direct cost that joins the materials, as a trading account does. In the Statement of Profit and Loss all pay to employees is one line.'],
      ['oe', NO_OWN_LINE],
    ] },
  { name: 'Salaries', line: 'ebe', note: 'Salaries are pay to employees: Employee Benefits Expense.', wrong: [['oe', NO_OWN_LINE]] },
  { name: 'Bonus to employees', line: 'ebe', note: 'Bonus is pay to employees: Employee Benefits Expense.', wrong: [['oe', NO_OWN_LINE]] },
  { name: "Employer's contribution to provident fund", line: 'ebe', note: "The employer's contribution to provident fund is paid for the benefit of employees: Employee Benefits Expense.",
    wrong: [
      ['fc', 'Took a contribution to a fund for a cost of finance. It is paid for the benefit of employees.'],
      ['oe', NO_OWN_LINE],
    ] },
  { name: 'Staff welfare expenses', line: 'ebe', note: 'Spending on the welfare of staff is part of Employee Benefits Expense.',
    wrong: [['oe', 'Went by the word "expenses" and placed it with the other expenses.']] },
  { name: 'Gratuity paid to employees', line: 'ebe', note: 'Gratuity is paid to employees for their service: Employee Benefits Expense.', wrong: [['oe', NO_OWN_LINE]] },
  { name: 'Leave encashment paid to employees', line: 'ebe', note: 'Leave encashment is paid to employees: Employee Benefits Expense.', wrong: [['oe', NO_OWN_LINE]] },

  // --- Finance costs ---
  { name: 'Interest on debentures', line: 'fc', note: 'Interest on debentures is the cost of money borrowed: Finance Costs.', wrong: [['oe', INTEREST_NOT_OTHER], ['oi', INTEREST_PAID]] },
  { name: 'Interest on a term loan from a bank', line: 'fc', note: 'Interest on a loan is the cost of money borrowed: Finance Costs.', wrong: [['oe', INTEREST_NOT_OTHER], ['oi', INTEREST_PAID]] },
  { name: 'Interest on bank overdraft', line: 'fc', note: 'Interest on an overdraft is the cost of borrowing from the bank: Finance Costs.',
    wrong: [['oe', 'Treated the interest like bank charges. Interest on an overdraft is the cost of borrowing from the bank.'], ['oi', INTEREST_PAID]] },
  { name: 'Discount on issue of debentures written off', line: 'fc', note: 'The discount allowed on issue of debentures is a cost of raising the loan. The part written off against profit is a Finance Cost.',
    wrong: [
      ['dep', 'Took the writing off for amortisation of an asset. The discount is a cost of raising the loan, so it is a finance cost.'],
      ['oe', 'The discount allowed on issue of debentures is a cost of borrowing, so it is not one of the other expenses.'],
    ] },
  { name: 'Loss on issue of debentures written off', line: 'fc', note: 'A loss on issue of debentures is a cost of raising the loan. The part written off against profit is a Finance Cost.',
    wrong: [
      ['dep', 'Took the writing off for amortisation of an asset. The loss is a cost of raising the loan, so it is a finance cost.'],
      ['oe', 'A loss on issue of debentures is a cost of borrowing, so it is not one of the other expenses.'],
    ] },

  // --- Depreciation and amortisation expense ---
  { name: 'Depreciation on plant and machinery', line: 'dep', note: 'Depreciation of a tangible fixed asset: Depreciation and Amortisation Expense.',
    wrong: [['oe', DEP_OWN_LINE], ['cmc', 'Took a factory cost for a material. Depreciation is never part of the materials consumed.']] },
  { name: 'Depreciation on office building', line: 'dep', note: 'Depreciation of a tangible fixed asset: Depreciation and Amortisation Expense.', wrong: [['oe', DEP_OWN_LINE]] },
  { name: 'Amortisation of patents', line: 'dep', note: 'Writing off an intangible asset over its life is amortisation: Depreciation and Amortisation Expense.', wrong: [['oe', DEP_OWN_LINE]] },
  { name: 'Goodwill written off', line: 'dep', note: 'Writing off an intangible asset is amortisation: Depreciation and Amortisation Expense.',
    wrong: [['oe', 'Writing off an intangible asset is amortisation, which shares a line with depreciation.']] },

  // --- Other expenses ---
  { name: 'Rent of office premises', line: 'oe', note: 'Rent has no line of its own: Other Expenses.',
    wrong: [['fc', 'Took a regular payment for the use of premises for a cost of borrowing. Rent is one of the other expenses.']] },
  { name: 'Audit fee', line: 'oe', note: 'The fee of the auditors has no line of its own: Other Expenses.',
    wrong: [['ebe', 'Auditors are not employees of the company, so their fee is not an employee benefit.']] },
  { name: 'Bad debts', line: 'oe', note: 'A debt that cannot be recovered has no line of its own: Other Expenses.',
    wrong: [
      ['fc', 'A debt that cannot be recovered is not a cost of borrowing.'],
      ['dep', 'Took the writing off of a debt for amortisation, which is for intangible assets.'],
    ] },
  { name: 'Carriage outwards', line: 'oe', note: 'Carriage on goods sold is a selling expense with no line of its own: Other Expenses.',
    wrong: [
      ['cmc', 'Carriage on goods sold has nothing to do with the materials used in production.'],
      ['pst', 'Carriage on goods sold is a selling expense, not a part of purchases.'],
    ] },
  { name: 'Power and fuel', line: 'oe', note: 'Power and fuel are not materials and have no line of their own: Other Expenses.',
    wrong: [['cmc', 'Took a factory expense for a material. Power and fuel are not materials, so they are among the other expenses.']] },
  { name: 'Advertisement expenses', line: 'oe', note: 'Advertisement has no line of its own: Other Expenses.', wrong: [] },
  { name: 'Insurance premium', line: 'oe', note: 'Insurance has no line of its own: Other Expenses.', wrong: [['fc', 'Took a premium paid to an insurer for a cost of borrowing.']] },
  { name: 'Repairs to machinery', line: 'oe', note: 'Repairs have no line of their own: Other Expenses.',
    wrong: [['dep', 'Repairs keep an asset working; depreciation spreads its cost. Repairs are among the other expenses.']] },
  { name: 'Bank charges', line: 'oe', note: 'Bank charges are paid for the services of the bank, not for money borrowed: Other Expenses.',
    wrong: [['fc', 'Bank charges are paid for the services of the bank, not for money borrowed, so they are not a finance cost.']] },
  { name: 'Loss on sale of machinery', line: 'oe', note: 'A loss on selling a fixed asset has no line of its own: Other Expenses.',
    wrong: [['dep', 'Took the loss on selling an asset for its depreciation. The loss is one of the other expenses.']] },
  { name: 'Printing and stationery', line: 'oe', note: 'Office stationery has no line of its own: Other Expenses.', wrong: [['cmc', 'Took office stationery for materials used in production.']] },
  { name: 'Commission paid to selling agents', line: 'oe', note: 'Commission to agents, who are not employees, has no line of its own: Other Expenses.',
    wrong: [['ebe', 'Selling agents are not employees of the company, so their commission is not an employee benefit.']] },
  { name: 'Rates and taxes', line: 'oe', note: 'Rates and local taxes are an ordinary expense with no line of its own: Other Expenses.',
    wrong: [['tax', 'Tax expense is the income tax on the profit of the year. Rates and local taxes are an ordinary expense.']] },
  { name: 'Telephone and internet charges', line: 'oe', note: 'Telephone and internet charges have no line of their own: Other Expenses.', wrong: [] },

  // --- Purchases, tax ---
  { name: 'Purchases of goods for resale', line: 'pst', note: 'Goods bought to be sold as they are: Purchases of Stock-in-Trade.',
    wrong: [
      ['cmc', 'Goods bought for resale are not materials to be processed.'],
      ['chg', 'Mixed the goods bought in the year with the change in the stock of them.'],
    ] },
  { name: 'Income tax on the profit of the year', line: 'tax', note: 'Income tax on the profit is shown after profit before tax: Tax Expense.',
    wrong: [['oe', 'Treated the tax on profit as an ordinary expense. It is shown after profit before tax, as tax expense.']] },

  // --- Incomes ---
  { name: 'Sale of products', line: 'rfo', note: 'Sales are the main business of the company: Revenue from Operations.',
    wrong: [['oi', 'Other income is what does not come from the main business. Sales are the main business.']] },
  { name: 'Sale of scrap by a manufacturing company', line: 'rfo', note: 'Scrap arises from production, so its sale by a manufacturer is other operating revenue: Revenue from Operations.',
    wrong: [['oi', 'Took the sale of scrap for a side income. For a manufacturer it arises from production, so it is other operating revenue.']] },
  { name: 'Dividend received on shares held by a manufacturing company', line: 'oi', note: 'Holding shares is not the business of a manufacturer: Other Income.',
    wrong: [['rfo', 'Holding shares is not the business of a manufacturer, so the dividend is not revenue from operations.']] },
  { name: 'Interest on fixed deposits earned by a trading company', line: 'oi', note: 'Lending money is not the business of a trading company: Other Income.',
    wrong: [
      ['rfo', 'Lending money is not the business of a trading company, so the interest is not revenue from operations.'],
      ['fc', 'Set the interest earned off against interest paid. An income and an expense are shown separately.'],
    ] },
  { name: 'Profit on sale of an old machine', line: 'oi', note: 'Selling a fixed asset is not what the business is run for: Other Income.',
    wrong: [
      ['rfo', 'Selling a fixed asset is not what the business is run for, so the profit is not revenue from operations.'],
      ['dep', 'Set the profit on sale off against depreciation. It is an income, shown as other income.'],
    ] },
];

/**
 * The bank as this topic's own questions use it. `PL_ITEMS` is read as it stands by the case studies of the
 * company-year and analysis stages; in this topic's questions (from version 2) three items are worded otherwise.
 * Books differ on where "bank charges" go: charges for a borrowing (a loan processing fee) are a finance cost, and
 * charges for the bank's services are other expenses. So the item is named for what it pays for, collecting cheques,
 * and only one answer is defensible. A discount or loss on issue of debentures written off is a finance cost here,
 * as a cost of raising the loan; some books show it under other expenses, which is the less preferred place and is
 * not called a mistake.
 */
const SERVICE_CHARGES: PlItem = {
  name: 'Bank charges for collecting cheques',
  line: 'oe',
  note: 'Charges for collecting cheques pay the bank for a service, not for money borrowed: Other Expenses. (Charges for a borrowing, such as a loan processing fee, would be a finance cost.)',
  wrong: [['fc', 'Took a fee for a service of the bank for a cost of borrowing. Collecting cheques has nothing to do with money borrowed; only charges for a borrowing are finance costs.']],
};
const LESS_PREFERRED = (what: string): string =>
  `Placed it under Other Expenses. Some books do, but ${what} is a cost of raising a loan, so the preferred place, and the one taken here, is Finance Costs.`;
const FS_WORDING = new Map<string, PlItem>([
  ['Bank charges', SERVICE_CHARGES],
  ...(['Discount on issue of debentures written off', 'Loss on issue of debentures written off'] as const).map((name): [string, PlItem] => {
    const item = PL_ITEMS.find((i) => i.name === name)!;
    const what = name.startsWith('Discount') ? 'the discount on issue' : 'the loss on issue';
    return [name, { ...item, wrong: item.wrong.map(([l, why]): [PlLine, string] => [l, l === 'oe' ? LESS_PREFERRED(what) : why]) }];
  }),
]);
/** An item of `PL_ITEMS` as this topic's own questions word it. */
const fsView = (i: PlItem): PlItem => FS_WORDING.get(i.name) ?? i;
const FS_PL_ITEMS = PL_ITEMS.map(fsView);

/** The lines offered when an item names fewer than three wrong ones, nearest first. */
const PL_FALLBACK: Record<PlLine, PlLine[]> = {
  ebe: ['oe', 'cmc', 'fc', 'dep'],
  fc: ['oe', 'dep', 'ebe', 'cmc'],
  dep: ['oe', 'fc', 'cmc', 'ebe'],
  oe: ['ebe', 'fc', 'dep', 'cmc'],
  pst: ['cmc', 'chg', 'oe', 'ebe'],
  tax: ['oe', 'fc', 'dep', 'ebe'],
  rfo: ['oi', 'oe', 'fc', 'dep'],
  oi: ['rfo', 'oe', 'fc', 'dep'],
  cmc: ['pst', 'oe', 'chg', 'ebe'],
  chg: ['cmc', 'pst', 'oe', 'ebe'],
};
function plWrong(item: PlItem): Distractor[] {
  const named = item.wrong.map(([l, why]) => ({ text: lineName(l), why }));
  const taken = new Set<PlLine>([item.line, ...item.wrong.map(([l]) => l)]);
  const more = PL_FALLBACK[item.line]
    .filter((l) => !taken.has(l))
    .slice(0, Math.max(0, 3 - named.length))
    .map((l) => ({ text: lineName(l), why: `Took it for ${lineName(l)}, which shows ${PL[l][1]}. ${item.note}` }));
  return [...named, ...more];
}
const plItemsIn = (prompt: string): PlItem[] => FS_PL_ITEMS.filter((i) => prompt.includes(`"${i.name}"`));

const EXPENSE_ITEMS = FS_PL_ITEMS.filter((i) => i.line !== 'rfo' && i.line !== 'oi');
const LINE_STEMS: ((name: string, co: string) => string)[] = [
  (n) => `Under which line of a company's Statement of Profit and Loss (Schedule III) is this item shown: "${n}"?`,
  (n, co) => `${co} is preparing its Statement of Profit and Loss as per Schedule III. On which line does "${n}" go?`,
  (n, co) => `The books of ${co} show "${n}" for the year. Which line of the Statement of Profit and Loss carries it?`,
];

const fsSplLine = mcqTemplate({
  id: 'fs-spl-line',
  version: 2,
  topicId: T,
  conceptId: 'fs-spl-lines',
  difficulty: 'easy',
  generate: (rng) => {
    const item = rng.pick(EXPENSE_ITEMS);
    return {
      prompt: rng.pick(LINE_STEMS)(item.name, company(rng)),
      correct: lineName(item.line),
      distractors: plWrong(item),
      explanation: item.note,
      hints: ['Ask what the money was spent on: employees, borrowed money, the wearing out of an asset, or something else.', 'An expense with no line of its own goes under Other Expenses.'],
    };
  },
  verify: (q) => {
    const found = plItemsIn(q.prompt);
    return found.length === 1 && correctText(q) === lineName(found[0].line) && !wrongTexts(q).includes(lineName(found[0].line));
  },
});

const plTrue = (x: PlLine): PlItem[] => FS_PL_ITEMS.filter((i) => i.line === x);
const plConfusers = (x: PlLine): PlItem[] => FS_PL_ITEMS.filter((i) => i.line !== x && i.wrong.some(([l]) => l === x));
const PL_CASES: { x: PlLine; not: boolean }[] = [
  ...(Object.keys(PL) as PlLine[]).filter((x) => plTrue(x).length >= 1 && plConfusers(x).length >= 3).map((x) => ({ x, not: false })),
  ...(Object.keys(PL) as PlLine[]).filter((x) => plTrue(x).length >= 3 && plConfusers(x).length >= 1).map((x) => ({ x, not: true })),
];

const LINE_UNDER_STEMS: ((line: string, co: string) => string)[] = [
  (l) => `Which of the following is shown under ${l} in a company's Statement of Profit and Loss?`,
  (l, co) => `${co} is preparing its Statement of Profit and Loss as per Schedule III. Which of these items does it show under ${l}?`,
  (l) => `Only one of these items belongs under ${l} in a Statement of Profit and Loss prepared as per Schedule III. Which one?`,
];
const LINE_NOT_UNDER_STEMS: ((line: string, co: string) => string)[] = [
  (l) => `Which of the following is NOT shown under ${l} in a company's Statement of Profit and Loss?`,
  (l, co) => `${co} is preparing its Statement of Profit and Loss as per Schedule III. Which of these items is NOT shown under ${l}?`,
  (l) => `Three of these items belong under ${l} in a Statement of Profit and Loss prepared as per Schedule III. Which one is NOT shown there?`,
];

const SPL_UNDER_HINTS = [
  'Ask of each option what the money was spent on, or where the income came from.',
  'Interest and other costs of borrowing are finance costs; pay to employees is employee benefits expense; wearing out is depreciation and amortisation; what has no line of its own is other expenses.',
];

const fsSplWhichUnder = mcqTemplate({
  id: 'fs-spl-which-under',
  version: 2,
  topicId: T,
  conceptId: 'fs-spl-lines',
  difficulty: 'medium',
  generate: (rng) => {
    const { x, not } = rng.pick(PL_CASES);
    const whyNotHere = (i: PlItem) => i.wrong.find(([l]) => l === x)![1];
    if (!not) {
      const right = rng.pick(plTrue(x));
      return {
        prompt: rng.pick(LINE_UNDER_STEMS)(`"${lineName(x)}"`, company(rng)),
        correct: right.name,
        distractors: rng.shuffle(plConfusers(x)).slice(0, 5).map((i) => ({ text: i.name, why: `${whyNotHere(i)} ${i.note}` })),
        explanation: right.note,
        hints: SPL_UNDER_HINTS,
      };
    }
    const odd = rng.pick(plConfusers(x));
    return {
      prompt: rng.pick(LINE_NOT_UNDER_STEMS)(`"${lineName(x)}"`, company(rng)),
      correct: odd.name,
      distractors: rng.shuffle(plTrue(x)).slice(0, 4).map((i) => ({ text: i.name, why: `Thought this item does not belong here, but it does. ${i.note}` })),
      explanation: `${odd.note} ${whyNotHere(odd)}`,
      hints: SPL_UNDER_HINTS,
    };
  },
  verify: (q) => {
    const x = (Object.keys(PL) as PlLine[]).find((l) => q.prompt.includes(`"${lineName(l)}"`));
    if (!x) return false;
    const lineOf = (text: string) => FS_PL_ITEMS.find((i) => i.name === text)?.line;
    const right = lineOf(correctText(q));
    const wrong = wrongTexts(q).map(lineOf);
    if (right === undefined || wrong.includes(undefined)) return false;
    return q.prompt.includes('NOT shown') ? right !== x && wrong.every((l) => l === x) : right === x && wrong.every((l) => l !== x);
  },
});

// --- Revenue from operations or other income: it depends on the business ------------------------------------------------

interface IncomeCase {
  text: (co: string) => string;
  right: 'rfo' | 'oi';
  /** Why it is what it is, in a sentence. */
  note: string;
  /** The mistake of choosing the other of the two. */
  other: string;
  /** What a student sets it off against, and the mistake. */
  net: Distractor;
}
const NET_FINANCE: Distractor = { text: 'It is deducted from Finance Costs', why: 'Set the interest earned off against the interest paid. An income and an expense are shown separately, each at its full amount.' };
const NET_MATERIALS: Distractor = { text: 'It is deducted from Cost of Materials Consumed', why: 'Set the sale of scrap off against the cost of materials. The income is shown on its own, at its full amount.' };
const NET_OTHER: Distractor = { text: 'It is deducted from Other Expenses', why: 'Set the income off against expenses. An income and an expense are shown separately, each at its full amount.' };
const NET_DEP: Distractor = { text: 'It is deducted from Depreciation and Amortisation Expense', why: 'Set the profit on sale off against depreciation. The profit is an income, shown on its own.' };
const CAPITAL_PROFIT: Distractor = {
  text: 'It is credited to Capital Reserve and does not pass through the Statement of Profit and Loss',
  why: 'Took an income of the year for a capital profit. It is earned in the running of the company and passes through the Statement of Profit and Loss.',
};
const INCOME_CASES: IncomeCase[] = [
  { right: 'rfo', net: NET_MATERIALS, text: (co) => `${co}, a manufacturer, sells the scrap left over from production.`,
    note: 'For a manufacturer, scrap arises from production, so its sale is other operating revenue, a part of Revenue from Operations.',
    other: 'Took the sale of scrap for a side income. It arises from production, the main business, so it is other operating revenue.' },
  { right: 'rfo', net: NET_FINANCE, text: (co) => `${co} is a finance company. It earns interest on the loans it gives to customers.`,
    note: 'Lending is the main business of a finance company, so the interest it earns on loans is Revenue from Operations.',
    other: 'Applied the rule for a company that is not in finance. Lending is the main business of a finance company, so this interest is its revenue from operations.' },
  { right: 'rfo', net: NET_OTHER, text: (co) => `${co} is a finance company. It charges borrowers a processing fee on every loan it sanctions.`,
    note: 'Fees for financial services are earned in the main business of a finance company: Revenue from Operations.',
    other: 'Took the fee for a side income. Giving loans is the main business of a finance company, so its fees on loans are revenue from operations.' },
  { right: 'rfo', net: NET_OTHER, text: (co) => `${co} runs a fleet of trucks and earns freight for carrying the goods of its customers.`,
    note: 'Carrying goods is the main business of a transport company, so the freight earned is revenue from the sale of services: Revenue from Operations.',
    other: 'Took a company that sells a service to have no revenue from operations. Freight is what a transport company is in business to earn.' },
  { right: 'rfo', net: NET_OTHER, text: (co) => `${co} is an investment company whose business is buying and selling securities. It earns dividend on the securities it holds.`,
    note: 'Dealing in securities is the main business of an investment company, so the dividend it earns is Revenue from Operations.',
    other: 'Applied the rule for a company that is not in finance. Holding securities is the main business here, so the dividend is revenue from operations.' },
  { right: 'oi', net: NET_FINANCE, text: (co) => `${co}, a trading company, earns interest on a fixed deposit kept with its bank.`,
    note: 'Lending money is not the business of a trading company, so the interest is Other Income.',
    other: 'Counted every income as revenue from operations. Lending money is not the business of a trading company.' },
  { right: 'oi', net: NET_OTHER, text: (co) => `${co}, a manufacturer, receives a dividend on shares it holds in another company.`,
    note: 'Holding shares is not the business of a manufacturer, so the dividend is Other Income.',
    other: 'Counted every income as revenue from operations. Holding shares is not the business of a manufacturer.' },
  { right: 'oi', net: NET_DEP, text: (co) => `${co}, a software company, sells its old office furniture for more than its book value.`,
    note: 'Selling a fixed asset is not what the company is in business for, so the profit on sale is Other Income.',
    other: 'Took the word "sells" to mean revenue from operations. Furniture is a fixed asset of this company, not what it deals in.' },
  { right: 'oi', net: NET_OTHER, text: (co) => `${co}, a manufacturer, lets out a spare godown and receives rent for it.`,
    note: 'Letting out property is not the business of a manufacturer, so the rent is Other Income.',
    other: 'Counted every regular income as revenue from operations. Letting out property is not the business of a manufacturer.' },
  { right: 'oi', net: NET_DEP, text: (co) => `${co} is a finance company. It sells one of its office cars for more than its book value.`,
    note: 'Even for a finance company, selling a fixed asset is not the main business, so the profit on sale is Other Income.',
    other: 'Thought every income of a finance company is revenue from operations. Only its income from lending and other financial services is; a car is a fixed asset.' },
  { right: 'oi', net: NET_OTHER, text: (co) => `${co} is a finance company. It lets out a part of its office building and receives rent.`,
    note: 'Letting out property is not the business of a finance company, so the rent is Other Income.',
    other: 'Thought every income of a finance company is revenue from operations. Only its income from lending and other financial services is.' },
];

const fsSplIncomeKind = mcqTemplate({
  id: 'fs-spl-income-kind',
  topicId: T,
  conceptId: 'fs-spl-lines',
  difficulty: 'medium',
  generate: (rng) => {
    const c = rng.pick(INCOME_CASES);
    return {
      prompt: `${c.text(rng.pick(COMPANIES))} How is this income shown in its Statement of Profit and Loss?`,
      correct: `Under ${lineName(c.right)}`,
      distractors: [{ text: `Under ${lineName(c.right === 'rfo' ? 'oi' : 'rfo')}`, why: c.other }, c.net, CAPITAL_PROFIT],
      explanation: c.note,
      hints: ['Ask what the company is in business to do.', 'Income from that main business is revenue from operations; any other income is other income.'],
    };
  },
  verify: (q) => {
    const hit = INCOME_CASES.filter((c) => COMPANIES.some((n) => q.prompt.startsWith(c.text(n))));
    return hit.length === 1 && correctText(q) === `Under ${lineName(hit[0].right)}`;
  },
});

// --- Changes in inventories: the amount and its sign --------------------------------------------------------------------

const fsSplChangeInventories = mcqTemplate({
  id: 'fs-spl-change-inventories',
  topicId: T,
  conceptId: 'fs-spl-amounts',
  difficulty: 'medium',
  generate: (rng) => {
    const pick = () => amt(rng, 40000, 400000, 5000);
    const [fgO, fgC, wipO, wipC, rmO, rmC] = [pick(), pick(), pick(), pick(), pick(), pick()];
    const change = fgO + wipO - (fgC + wipC);
    const withMaterials = change + rmO - rmC;
    const finishedOnly = fgO - fgC;
    // Every option must differ: no figure may be nil or repeat another.
    if (new Set([0, change, -change, withMaterials, -withMaterials, finishedOnly]).size < 6) return null;
    const show = (v: number) => `${inr(Math.abs(v))}, ${v > 0 ? 'added to the expenses' : 'shown as a negative figure among the expenses'}`;
    return {
      prompt: [
        `From these inventories of ${company(rng)}, a manufacturer, what is shown against "Changes in Inventories of Finished Goods, Work-in-Progress and Stock-in-Trade" in its Statement of Profit and Loss?`,
        `Finished goods, opening: ${inr(fgO)}`,
        `Finished goods, closing: ${inr(fgC)}`,
        `Work-in-progress, opening: ${inr(wipO)}`,
        `Work-in-progress, closing: ${inr(wipC)}`,
        `Raw materials, opening: ${inr(rmO)}`,
        `Raw materials, closing: ${inr(rmC)}`,
      ].join('\n'),
      correct: show(change),
      distractors: [
        { text: show(-change), why: 'Took closing less opening. The line is opening inventory less closing inventory: a fall in inventory adds to the expenses and a rise reduces them.' },
        { text: show(withMaterials), why: 'Included the raw materials. They belong to Cost of Materials Consumed; this line is for finished goods, work-in-progress and stock-in-trade.' },
        { text: show(finishedOnly), why: 'Took the finished goods alone and left out the work-in-progress.' },
        { text: show(-withMaterials), why: 'Included the raw materials, which belong to Cost of Materials Consumed, and also took closing less opening.' },
      ],
      explanation: `Change = opening inventory - closing inventory of finished goods and work-in-progress = (${inr(fgO)} + ${inr(wipO)}) - (${inr(fgC)} + ${inr(wipC)}) = ${change > 0 ? inr(change) : `(${inr(-change)})`}. ${change > 0 ? 'Inventory has fallen, so the amount is added to the expenses.' : 'Inventory has risen, so the amount is shown as a negative figure among the expenses.'} Raw materials are dealt with in Cost of Materials Consumed.`,
      hints: ['Use opening inventory less closing inventory.', 'Only finished goods, work-in-progress and stock-in-trade count here; raw materials have their own line.'],
    };
  },
  verify: (q) => {
    const of = (re: RegExp) => oneWhere(q.prompt, re);
    const change = of(/^Finished goods, opening/) + of(/^Work-in-progress, opening/) - of(/^Finished goods, closing/) - of(/^Work-in-progress, closing/);
    return correctText(q) === `${inr(Math.abs(change))}, ${change > 0 ? 'added to the expenses' : 'shown as a negative figure among the expenses'}`;
  },
});

// ---------------------------------------------------------------------------------------------------------------
// A total from a list: what belongs under a head or a line, and what does not
// ---------------------------------------------------------------------------------------------------------------

/** A name with the range its amount is drawn from, in whole rupees. */
type Entry = [label: string, min: number, max: number, step: number];
const drawn = (rng: Rng, e: Entry): Line => ({ label: e[0], rs: amt(rng, e[1], e[2], e[3]) });
/** An item of the list that does not belong; `where` says where it does, in words that follow its name. */
type TrapEntry = [...Entry, where: string];
interface Trap extends Line {
  where: string;
  /** Set for an item students deduct (a bank overdraft from cash) instead of adding. */
  deducted?: boolean;
}
const trap = (rng: Rng, e: TrapEntry, deducted = false): Trap => ({ label: e[0], rs: amt(rng, e[1], e[2], e[3]), where: e[4], ...(deducted ? { deducted } : {}) });
const some = <X,>(rng: Rng, pool: readonly X[], count: number): X[] => rng.shuffle(pool).slice(0, count);

/**
 * "Find the amount shown under X" from a shuffled list: the items that belong (`own`), the ones that do not (`traps`),
 * and the items of `own` that students leave out (`left`, with the mistake). Each wrong answer is what one of those
 * mistakes gives.
 */
function totalFromList(rng: Rng, lead: string, rule: string, own: Line[], traps: Trap[], left: { line: Line; why: string }[] = [], more: (answer: number) => Err[] = () => [], hints?: string[]): NumericParts | null {
  const answer = sum(own.map((l) => l.rs));
  const added = traps.filter((t) => !t.deducted);
  const errors: Err[] = [
    ...left.map(({ line, why }) => ({ value: answer - line.rs, why })),
    ...traps.map((t) => ({ value: t.deducted ? answer - t.rs : answer + t.rs, why: `${t.deducted ? 'Deducted' : 'Counted'} "${low(t.label)}", which ${t.where}.` })),
    ...more(answer),
    ...(added.length > 1 ? [{ value: answer + sum(added.map((t) => t.rs)), why: 'Added every item in the list, without asking which of them belong here.' }] : []),
  ];
  return numeric(`${lead}\n${lines(rng, [...own, ...traps])}`, answer, errors, [
    rule,
    `${own.map((l) => `${l.label} ${inr(l.rs)}`).join(' + ')} = ${inr(answer)}.`,
    ...traps.map((t) => `Left out: ${low(t.label)}, which ${t.where}.`),
  ], hints);
}

// --- Lines of the Statement of Profit and Loss ----------------------------------------------------------------------

/** A material, what is made of it, and (from version 2 of the template) the town of the factory. */
const MATERIALS: [string, string, string][] = [
  ['cotton', 'cloth', 'Surat'], ['steel sheets', 'utensils', 'Jagadhri'], ['wheat', 'flour', 'Indore'], ['timber', 'furniture', 'Saharanpur'],
  ['leather', 'shoes', 'Agra'], ['paper pulp', 'paper', 'Rajahmundry'], ['sugarcane', 'sugar', 'Kolhapur'], ['plastic granules', 'toys', 'Daman'],
];

const fsSplMaterialsConsumed = numericTemplate({
  id: 'fs-spl-materials-consumed',
  version: 2,
  topicId: T,
  conceptId: 'fs-spl-amounts',
  difficulty: 'easy',
  unit: 'rupees',
  generate: (rng) => {
    const [material, product, town] = rng.pick(MATERIALS);
    const [opening, purchases, closing] = [amt(rng, 40000, 300000, 5000), amt(rng, 400000, 2000000, 20000), amt(rng, 30000, 280000, 5000)];
    const consumed = opening + purchases - closing;
    const lead = `${company(rng)} makes ${product} from ${material} at its factory in ${town}.`;
    const formula = 'Cost of materials consumed = Opening inventory of materials + Purchases - Closing inventory of materials.';
    if (rng.next() < 0.6) {
      return numeric(
        `${lead} Its opening inventory of ${material} was ${inr(opening)}, it purchased ${material} for ${inr(purchases)} during the year and the closing inventory was ${inr(closing)}. Find the cost of materials consumed.`,
        consumed,
        [
          { value: opening + purchases + closing, why: 'Added the closing inventory instead of deducting it.' },
          { value: purchases + closing - opening, why: 'Deducted the opening inventory and added the closing one: the wrong way round.' },
          { value: opening + purchases, why: 'Forgot to deduct the closing inventory.' },
          { value: purchases, why: 'Took the purchases as the materials consumed, ignoring the inventories.' },
        ],
        [formula, `${inr(opening)} + ${inr(purchases)} - ${inr(closing)} = ${inr(consumed)}.`],
        HINTS.materials,
      );
    }
    return numeric(
      `${lead} Its opening inventory of ${material} was ${inr(opening)} and the closing inventory was ${inr(closing)}. The cost of materials consumed during the year was ${inr(consumed)}. Find the purchases of ${material} during the year.`,
      purchases,
      [
        { value: consumed + opening - closing, why: 'Added the opening inventory and deducted the closing one: the wrong way round.' },
        { value: consumed, why: 'Took the materials consumed as the purchases, ignoring the inventories.' },
        { value: consumed - opening, why: 'Deducted the opening inventory but forgot to add the closing inventory.' },
        { value: consumed + opening + closing, why: 'Added both inventories to the materials consumed.' },
      ],
      [formula, 'So Purchases = Cost of materials consumed + Closing inventory - Opening inventory.', `${inr(consumed)} + ${inr(closing)} - ${inr(opening)} = ${inr(purchases)}.`],
      HINTS.materials,
    );
  },
  // The three figures of the prompt and the answer must satisfy opening + purchases - closing = consumed.
  verify: (q) => {
    const a = amountsIn(q.prompt);
    if (a.length !== 3) return false;
    return q.prompt.includes('Find the purchases') ? a[0] + answerRs(q) - a[1] === a[2] : a[0] + a[1] - a[2] === answerRs(q);
  },
});

const OTHER_INCOMES = ['Dividend received on shares held', 'Profit on sale of an old machine', 'Rent received for a spare godown'];

const fsSplTotalIncome = numericTemplate({
  id: 'fs-spl-total-income',
  version: 2,
  topicId: T,
  conceptId: 'fs-spl-amounts',
  difficulty: 'easy',
  unit: 'rupees',
  generate: (rng) => {
    const [sales, returns, scrap, interest, other] = [amt(rng, 2000000, 9000000, 50000), amt(rng, 20000, 200000, 10000), amt(rng, 10000, 90000, 5000), amt(rng, 10000, 80000, 5000), amt(rng, 10000, 60000, 5000)];
    const otherLabel = rng.pick(OTHER_INCOMES);
    const ask = rng.pick(['rfo', 'oi', 'total'] as const);
    const rfo = sales - returns + scrap;
    const oi = interest + other;
    const asked = { rfo: 'the revenue from operations', oi: 'the other income', total: 'the total income' }[ask];
    const prompt = `${firm(rng.pick(MAKERS))}, is a manufacturing company. From these figures for the year, find ${asked} shown in its Statement of Profit and Loss.\n${lines(rng, [
      { label: 'Sale of products', rs: sales },
      { label: 'Sales returns', rs: returns },
      { label: 'Sale of scrap', rs: scrap },
      { label: 'Interest received on fixed deposits', rs: interest },
      { label: otherLabel, rs: other },
    ])}`;
    const working = [
      `Revenue from operations = Sale of products - Sales returns + Sale of scrap (other operating revenue of a manufacturer) = ${inr(sales)} - ${inr(returns)} + ${inr(scrap)} = ${inr(rfo)}.`,
      `Other income = ${inr(interest)} + ${inr(other)} = ${inr(oi)}.`,
      `Total income = ${inr(rfo)} + ${inr(oi)} = ${inr(rfo + oi)}.`,
    ];
    const scrapOut = 'Left out the sale of scrap. For a manufacturer it is other operating revenue, a part of revenue from operations.';
    if (ask === 'rfo') {
      return numeric(prompt, rfo, [
        { value: sales - returns, why: scrapOut },
        { value: sales + scrap, why: 'Did not deduct the sales returns.' },
        { value: rfo + oi, why: 'Gave the total income. Interest and the other item are other income, not revenue from operations.' },
        { value: sales + returns + scrap, why: 'Added the sales returns instead of deducting them.' },
      ], working.slice(0, 1), HINTS.totalIncome);
    }
    if (ask === 'oi') {
      return numeric(prompt, oi, [
        { value: oi + scrap, why: 'Counted the sale of scrap as other income. For a manufacturer it is other operating revenue, a part of revenue from operations.' },
        { value: interest, why: `Counted the interest alone and left out "${low(otherLabel)}".` },
        { value: rfo + oi, why: 'Gave the total income, which includes the revenue from operations.' },
      ], working.slice(1, 2), HINTS.totalIncome);
    }
    return numeric(prompt, rfo + oi, [
      { value: rfo, why: 'Stopped at the revenue from operations and left out the other income.' },
      { value: sales + scrap + oi, why: 'Did not deduct the sales returns.' },
      { value: sales + returns + scrap + oi, why: 'Added the sales returns instead of deducting them.' },
      { value: sales - returns + oi, why: 'Left out the sale of scrap.' },
    ], working, HINTS.totalIncome);
  },
  verify: (q) => {
    const of = (re: RegExp) => oneWhere(q.prompt, re);
    const rfo = of(/^Sale of products/) - of(/^Sales returns/) + of(/^Sale of scrap/);
    const oi = sumWhere(q.prompt, /^(Interest received|Dividend received|Profit on sale|Rent received)/);
    const expected = q.prompt.includes('find the revenue from operations') ? rfo : q.prompt.includes('find the other income') ? oi : rfo + oi;
    return answerRs(q) === expected;
  },
});

const EMPLOYEE_EXTRAS: Entry[] = [
  ["Employer's contribution to provident fund", 20000, 120000, 5000],
  ['Staff welfare expenses', 10000, 80000, 5000],
  ['Bonus to employees', 30000, 150000, 5000],
  ['Gratuity paid to employees', 20000, 100000, 5000],
];
const NOT_EMPLOYEE: TrapEntry[] = [
  ['Audit fee', 20000, 90000, 5000, 'is one of the other expenses: auditors are not employees'],
  ['Interest on bank loan', 30000, 200000, 5000, 'is a finance cost'],
  ['Rent of office premises', 60000, 300000, 10000, 'is one of the other expenses'],
  ['Depreciation on machinery', 50000, 250000, 10000, 'has a line of its own, depreciation and amortisation expense'],
  ['Commission paid to selling agents', 20000, 120000, 5000, 'is one of the other expenses: selling agents are not employees'],
];

const fsSplEmployeeBenefits = numericTemplate({
  id: 'fs-spl-employee-benefits',
  version: 2,
  topicId: T,
  conceptId: 'fs-spl-amounts',
  difficulty: 'medium',
  unit: 'rupees',
  generate: (rng) => {
    const wages = drawn(rng, ['Wages', 200000, 900000, 10000]);
    const salaries = drawn(rng, ['Salaries', 300000, 1200000, 10000]);
    const extras = some(rng, EMPLOYEE_EXTRAS, 2).map((e) => drawn(rng, e));
    return totalFromList(
      rng,
      `From these expenses of ${firm(rng.pick(MAKERS))}, for the year, find the employee benefits expense shown in its Statement of Profit and Loss.`,
      'Employee benefits expense is everything paid to or for employees: wages, salaries, bonus, contribution to provident fund, gratuity and staff welfare.',
      [wages, salaries, ...extras],
      some(rng, NOT_EMPLOYEE, 2).map((e) => trap(rng, e)),
      [{ line: wages, why: 'Left out the wages, taking them for a direct expense. All pay to employees is one line, employee benefits expense.' }],
      () => [{ value: wages.rs + salaries.rs, why: `Counted only the wages and salaries. "${extras[0].label}" and "${low(extras[1].label)}" are employee benefits too.` }],
      HINTS.employees,
    );
  },
  verify: (q) => answerRs(q) === sumWhere(q.prompt, /^(Wages|Salaries|Employer's contribution|Staff welfare|Bonus to employees|Gratuity paid)/),
});

const OTHER_EXPENSES: Entry[] = [
  ['Rent of office premises', 60000, 300000, 10000],
  ['Audit fee', 20000, 90000, 5000],
  ['Bad debts', 10000, 80000, 5000],
  ['Carriage outwards', 15000, 120000, 5000],
  ['Advertisement expenses', 30000, 250000, 10000],
  ['Insurance premium', 10000, 70000, 5000],
  ['Power and fuel', 40000, 300000, 10000],
  ['Printing and stationery', 5000, 40000, 1000],
];
const NOT_OTHER_EXPENSES: TrapEntry[] = [
  ['Salaries', 300000, 1200000, 10000, 'are an employee benefits expense'],
  ['Wages', 200000, 900000, 10000, 'are an employee benefits expense'],
  ['Interest on term loan', 40000, 300000, 10000, 'is a finance cost'],
  ['Depreciation on machinery', 50000, 250000, 10000, 'has a line of its own, depreciation and amortisation expense'],
];

const fsSplOtherExpenses = numericTemplate({
  id: 'fs-spl-other-expenses',
  version: 2,
  topicId: T,
  conceptId: 'fs-spl-amounts',
  difficulty: 'easy',
  unit: 'rupees',
  generate: (rng) =>
    totalFromList(
      rng,
      `From these expenses of ${firm(rng.pick(MAKERS))}, for the year, find the amount shown as "Other Expenses" in its Statement of Profit and Loss.`,
      'Other expenses are the expenses with no line of their own: not pay to employees, not the cost of borrowing, not depreciation.',
      some(rng, OTHER_EXPENSES, 4).map((e) => drawn(rng, e)),
      some(rng, NOT_OTHER_EXPENSES, 2).map((e) => trap(rng, e)),
      [],
      undefined,
      HINTS.otherExpenses,
    ),
  verify: (q) => answerRs(q) === sumWhere(q.prompt, /^(Rent of office|Audit fee|Bad debts|Carriage outwards|Advertisement|Insurance premium|Power and fuel|Printing and stationery)/),
});

const DEBENTURE_RATES = [8, 9, 10, 12];

const fsSplFinanceCosts = numericTemplate({
  id: 'fs-spl-finance-costs',
  version: 2,
  topicId: T,
  conceptId: 'fs-spl-amounts',
  difficulty: 'medium',
  unit: 'rupees',
  generate: (rng) => {
    const rate = rng.pick(DEBENTURE_RATES);
    const face = amt(rng, 500000, 3000000, 100000);
    const debInterest = (face * rate) / 100;
    const other = drawn(rng, rng.pick<Entry>([['Interest on bank overdraft', 10000, 90000, 5000], ['Interest on term loan from bank', 40000, 300000, 10000]]));
    const off = drawn(rng, [rng.pick(['Discount on issue of debentures written off', 'Loss on issue of debentures written off']), 10000, 80000, 5000]);
    const charges = drawn(rng, ['Bank charges for collecting cheques', 2000, 15000, 1000]);
    const dividend = drawn(rng, ['Interim dividend paid to shareholders', 50000, 300000, 10000]);
    const answer = debInterest + other.rs + off.rs;
    return numeric(
      `From these figures of ${firm(rng.pick(ANY_FIRM))}, for the year, find the finance costs shown in its Statement of Profit and Loss. The interest on the debentures for the year is not in the list.\n${lines(rng, [
        { label: `${rate}% Debentures (outstanding for the whole year)`, rs: face },
        other,
        off,
        charges,
        dividend,
      ])}`,
      answer,
      [
        { value: answer + charges.rs, why: 'Counted the charges for collecting cheques. They pay the bank for a service, not for money borrowed, so they are other expenses.' },
        { value: answer - off.rs, why: `Left out "${low(off.label)}". It is a cost of raising the loan, so it is a finance cost.` },
        { value: answer + dividend.rs, why: 'Counted the dividend. A dividend is a share of profit paid to the owners, not a cost of borrowing.' },
        { value: other.rs + off.rs, why: 'Left out the interest on the debentures, which has to be worked out from the rate.' },
        { value: face + other.rs + off.rs, why: 'Added the debentures themselves instead of the interest on them.' },
      ],
      [
        `Interest on debentures = ${rate}% of ${inr(face)} = ${inr(debInterest)}.`,
        `Finance costs = ${inr(debInterest)} + ${other.label} ${inr(other.rs)} + ${off.label} ${inr(off.rs)} = ${inr(answer)}.`,
        'Charges for collecting cheques pay for a service of the bank, so they are other expenses; a dividend is not an expense at all.',
      ],
      HINTS.financeCosts,
    );
  },
  verify: (q) => {
    const deb = listed(q.prompt).find((l) => /^\d+% Debentures/.test(l.label));
    if (!deb) return false;
    return answerRs(q) === (deb.rs * Number(/^(\d+)%/.exec(deb.label)![1])) / 100 + sumWhere(q.prompt, /^(Interest on|Discount on issue|Loss on issue)/);
  },
});

/** The day debentures were issued in the year ended 31 March, and the months they were outstanding in it. */
const ISSUE_DAYS: [string, number][] = [['1 April', 12], ['1 July', 9], ['1 October', 6], ['1 January', 3]];

const fsSplFinanceCostsPremium = numericTemplate({
  id: 'fs-spl-finance-costs-premium',
  version: 2,
  topicId: T,
  conceptId: 'fs-spl-amounts',
  difficulty: 'complex',
  unit: 'rupees',
  generate: (rng) => {
    const y = rng.pick(YEARS);
    const [day, months] = rng.pick(ISSUE_DAYS);
    const count = amt(rng, 5000, 40000, 1000);
    const face = count * 100;
    const rate = rng.pick(DEBENTURE_RATES);
    const atDiscount = rng.next() < 0.5;
    const pct = rng.pick(atDiscount ? [4, 5, 6, 8, 10] : [5, 6, 8, 10]);
    const loss = (face * pct) / 100;
    const premium = (loss * rng.pick([20, 25, 40, 50, 60, 75])) / 100;
    const fullYear = (face * rate) / 100;
    const interest = (fullYear * months) / 12;
    const charged = loss - premium;
    const what = atDiscount ? 'discount on issue' : 'loss on issue';
    const terms = atDiscount ? `at a discount of ${pct}%, redeemable at par` : `at par, redeemable at a premium of ${pct}%`;
    return numeric(
      `On ${day} ${months === 3 ? y : y - 1}, ${firm(rng.pick(ANY_FIRM))}, issued ${count.toLocaleString('en-IN')} ${rate}% Debentures of ₹100 each ${terms}. On that date its Securities Premium stood at ${inr(premium)}. The ${what} is written off in the year of issue, first against Securities Premium and the rest against the profit of the year. Interest has been paid up to 31 March ${y}. What amount of finance costs is shown in the Statement of Profit and Loss for the year ended 31 March ${y}?`,
      interest + charged,
      [
        { value: interest + loss, why: `Charged the whole ${what} against profit, without first using the Securities Premium.` },
        { value: interest, why: `Left out the part of the ${what} written off against profit, which is a finance cost.` },
        ...(months < 12 ? [{ value: fullYear + charged, why: `Charged interest for the full year, though the debentures were outstanding for ${months} months only.` }] : []),
        { value: charged, why: 'Left out the interest on the debentures.' },
        { value: interest + premium, why: 'Charged the part met from Securities Premium instead of the part left after it.' },
      ],
      [
        `${atDiscount ? 'Discount on issue' : 'Loss on issue (the premium payable on redemption)'} = ${pct}% of ${inr(face)} = ${inr(loss)}.`,
        `Written off against Securities Premium: ${inr(premium)}. Written off against profit, as a finance cost: ${inr(loss)} - ${inr(premium)} = ${inr(charged)}.`,
        `Interest for ${months} months = ${inr(face)} × ${rate}% × ${months}/12 = ${inr(interest)}.`,
        `Finance costs = ${inr(interest)} + ${inr(charged)} = ${inr(interest + charged)}.`,
      ],
      HINTS.financePremium,
    );
  },
  verify: (q) => {
    const m = /^On 1 (\w+) \d{4}, .* issued ([\d,]+) (\d+)% Debentures of ₹100 each .*(?:discount|premium) of (\d+)%.* stood at (₹[\d,]+)\./.exec(q.prompt);
    if (!m) return false;
    const months = ISSUE_DAYS.find(([day]) => day === `1 ${m[1]}`)?.[1];
    if (!months) return false;
    const face = Number(m[2].replace(/,/g, '')) * 100;
    return answerRs(q) === (face * Number(m[3]) * months) / 1200 + (face * Number(m[4])) / 100 - amountsIn(m[5])[0];
  },
});

const fsSplProfitBeforeTax = numericTemplate({
  id: 'fs-spl-profit-before-tax',
  version: 2,
  topicId: T,
  conceptId: 'fs-spl-amounts',
  difficulty: 'complex',
  unit: 'rupees',
  generate: (rng) => {
    const y = rng.pick(YEARS);
    const revenue = amt(rng, 4000000, 9000000, 100000);
    const otherIncome = amt(rng, 20000, 150000, 10000);
    const materials = (revenue * rng.pick([40, 45, 50, 55])) / 100;
    const employees = amt(rng, 300000, 900000, 10000);
    const rate = rng.pick(DEBENTURE_RATES);
    const face = amt(rng, 500000, 2000000, 100000);
    const interest = (face * rate) / 100;
    const depreciation = amt(rng, 100000, 400000, 10000);
    const others = amt(rng, 150000, 600000, 10000);
    const dividend = amt(rng, 100000, 300000, 10000);
    const tax = rng.pick([25, 30]);
    const expenses = materials + employees + interest + depreciation + others;
    const pbt = revenue + otherIncome - expenses;
    if (pbt < 200000) return null;
    const after = (p: number) => (p * (100 - tax)) / 100;
    const askAfter = rng.next() < 0.5;
    const prompt = `From these figures of ${firm(rng.pick(MAKERS))}, for the year ended 31 March ${y}, find ${askAfter ? 'the profit for the period (the profit after tax)' : 'the profit before tax'}. The interest on the debentures for the year is not in the list. Tax is ${tax}% of the profit before tax.\n${lines(rng, [
      { label: 'Revenue from operations', rs: revenue },
      { label: 'Other income', rs: otherIncome },
      { label: 'Cost of materials consumed', rs: materials },
      { label: 'Employee benefits expense', rs: employees },
      { label: `${rate}% Debentures (outstanding for the whole year)`, rs: face },
      { label: 'Depreciation and amortisation expense', rs: depreciation },
      { label: 'Other expenses', rs: others },
      { label: 'Dividend paid to equity shareholders', rs: dividend },
    ])}`;
    const working = [
      `Total income = ${inr(revenue)} + ${inr(otherIncome)} = ${inr(revenue + otherIncome)}.`,
      `Finance costs = ${rate}% of ${inr(face)} = ${inr(interest)}.`,
      `Total expenses = ${inr(materials)} + ${inr(employees)} + ${inr(interest)} + ${inr(depreciation)} + ${inr(others)} = ${inr(expenses)}.`,
      `Profit before tax = ${inr(revenue + otherIncome)} - ${inr(expenses)} = ${inr(pbt)}.`,
      'The dividend is a distribution of profit, not an expense, so it is not deducted.',
    ];
    const noIncome = 'Left the other income out of the total income.';
    const noInterest = 'Did not charge the interest on the debentures, which has to be worked out from the rate.';
    const divAsExpense = 'Charged the dividend as an expense. It is a distribution of profit, not a charge against it.';
    return askAfter
      ? numeric(prompt, after(pbt), [
          { value: pbt, why: 'Stopped at the profit before tax and did not deduct the tax expense.' },
          { value: pbt - after(pbt), why: 'Gave the tax expense instead of the profit left after it.' },
          { value: after(pbt - dividend), why: divAsExpense },
          { value: after(pbt + interest), why: noInterest },
          { value: after(pbt - otherIncome), why: noIncome },
        ], [...working, `Tax expense = ${tax}% of ${inr(pbt)} = ${inr(pbt - after(pbt))}. Profit for the period = ${inr(pbt)} - ${inr(pbt - after(pbt))} = ${inr(after(pbt))}.`], HINTS.profit)
      : numeric(prompt, pbt, [
          { value: pbt - otherIncome, why: noIncome },
          { value: pbt + interest, why: noInterest },
          { value: pbt - dividend, why: divAsExpense },
          { value: after(pbt), why: 'Went on to deduct the tax. The question asks for the profit before tax.' },
        ], working, HINTS.profit);
  },
  verify: (q) => {
    const of = (re: RegExp) => oneWhere(q.prompt, re);
    const deb = listed(q.prompt).find((l) => /^\d+% Debentures/.test(l.label));
    const tax = Number(/Tax is (\d+)%/.exec(q.prompt)?.[1]);
    if (!deb || !Number.isFinite(tax)) return false;
    const interest = (deb.rs * Number(/^(\d+)%/.exec(deb.label)![1])) / 100;
    const pbt = of(/^Revenue from operations/) + of(/^Other income/) - of(/^Cost of materials/) - of(/^Employee benefits/) - interest - of(/^Depreciation/) - of(/^Other expenses/);
    return answerRs(q) === (q.prompt.includes('profit after tax') ? (pbt * (100 - tax)) / 100 : pbt);
  },
});

// --- Totals of heads of the balance sheet ---------------------------------------------------------------------------

const fsTotalInventories = numericTemplate({
  id: 'fs-total-inventories',
  version: 2,
  topicId: T,
  conceptId: 'fs-bs-assets',
  difficulty: 'easy',
  unit: 'rupees',
  generate: (rng) => {
    const goods = some<Entry>(rng, [['Raw materials', 100000, 700000, 10000], ['Work-in-progress', 50000, 400000, 10000], ['Finished goods', 100000, 800000, 10000]], 2).map((e) => drawn(rng, e));
    const tools = drawn(rng, ['Loose tools', 10000, 90000, 5000]);
    const stores = rng.next() < 0.5 ? [drawn(rng, ['Stores and spares', 20000, 150000, 5000])] : [];
    const extra = rng.pick<TrapEntry>([
      ['Trade receivables', 100000, 600000, 10000, 'have a line of their own among the current assets'],
      ['Advance paid to suppliers for raw materials', 20000, 200000, 10000, 'is a short-term loan and advance: the materials have not been received'],
    ]);
    return totalFromList(
      rng,
      `From these balances of ${firm(rng.pick(MAKERS))}, find the amount shown under Current Assets: Inventories.`,
      'Inventories are raw materials, work-in-progress, finished goods, stock-in-trade, stores and spares and loose tools.',
      [...goods, ...stores, tools],
      [trap(rng, ['Capital work-in-progress', 200000, 900000, 50000, 'is a fixed asset under construction, shown under non-current assets']), trap(rng, extra)],
      [
        { line: tools, why: 'Left out the loose tools, taking them for property, plant and equipment. Schedule III lists them under inventories.' },
        ...stores.map((line) => ({ line, why: 'Left out the stores and spares. Schedule III lists them under inventories.' })),
      ],
      undefined,
      HINTS.inventories,
    );
  },
  verify: (q) => answerRs(q) === sumWhere(q.prompt, /^(Raw materials|Work-in-progress|Finished goods|Stores and spares|Loose tools)/),
});

const fsTotalCashEquivalents = numericTemplate({
  id: 'fs-total-cash-equivalents',
  version: 2,
  topicId: T,
  conceptId: 'fs-bs-assets',
  difficulty: 'easy',
  unit: 'rupees',
  generate: (rng) => {
    const cheques = drawn(rng, ['Cheques and drafts on hand', 20000, 200000, 5000]);
    const extra = rng.pick<TrapEntry>([
      ['Units of an equity mutual fund, to be sold within six months', 50000, 300000, 10000, 'are a current investment, with a line of their own'],
      ['Bills receivable', 30000, 250000, 10000, 'are trade receivables until they are paid'],
    ]);
    return totalFromList(
      rng,
      `From these balances of ${firm(rng.pick(ANY_FIRM))}, find the amount shown under Current Assets: Cash and Cash Equivalents.`,
      'Cash and cash equivalents are cash on hand, balances with banks and cheques and drafts on hand.',
      [drawn(rng, ['Cash on hand', 10000, 90000, 1000]), drawn(rng, ['Balances with banks', 100000, 900000, 10000]), cheques],
      [trap(rng, ['Bank overdraft', 15000, 95000, 5000, 'is a short-term borrowing, shown among the current liabilities and never set off against cash'], true), trap(rng, extra)],
      [{ line: cheques, why: 'Left out the cheques and drafts on hand. They are counted with cash and cash equivalents.' }],
      undefined,
      HINTS.cash,
    );
  },
  verify: (q) => answerRs(q) === sumWhere(q.prompt, /^(Cash on hand|Balances with banks|Cheques and drafts)/),
});

const NOT_BORROWINGS: TrapEntry[] = [
  ['Trade payables', 100000, 600000, 10000, 'are owed to suppliers and have a line of their own'],
  ['Interest accrued but not due on borrowings', 5000, 60000, 1000, 'is one of the other current liabilities: only the amount borrowed is a borrowing'],
  ['Unpaid dividend', 10000, 80000, 5000, 'is one of the other current liabilities'],
  ['Term loan from bank, repayable after four years', 500000, 2000000, 100000, 'is a long-term borrowing'],
];

const fsTotalShortTermBorrowings = numericTemplate({
  id: 'fs-total-short-term-borrowings',
  version: 2,
  topicId: T,
  conceptId: 'fs-bs-equity-liabilities',
  difficulty: 'medium',
  unit: 'rupees',
  generate: (rng) => {
    const maturities = drawn(rng, ['Current maturities of long-term borrowings', 50000, 300000, 10000]);
    return totalFromList(
      rng,
      `${firm(rng.pick(ANY_FIRM))}, draws up its balance sheet in the form of Schedule III as amended in 2021. From these balances, find the amount shown under Current Liabilities: Short-term Borrowings.`,
      'Short-term borrowings are loans repayable on demand, such as a bank overdraft and cash credit, and, in the form as amended in 2021, the current maturities of long-term borrowings.',
      [drawn(rng, ['Bank overdraft', 50000, 400000, 10000]), drawn(rng, [rng.pick(['Cash credit from bank', 'Loan from bank repayable on demand']), 100000, 600000, 10000]), maturities],
      some(rng, NOT_BORROWINGS, 2).map((e) => trap(rng, e)),
      [{ line: maturities, why: 'Left out the current maturities of long-term borrowings. In the form as amended in 2021, which the question names, they are a part of short-term borrowings.' }],
      undefined,
      HINTS.stb,
    );
  },
  verify: (q) => answerRs(q) === sumWhere(q.prompt, /^(Bank overdraft|Cash credit|Loan from bank repayable on demand|Current maturities)/),
});

const fsTotalOtherCurrentLiabilities = numericTemplate({
  id: 'fs-total-other-current-liabilities',
  version: 2,
  topicId: T,
  conceptId: 'fs-bs-equity-liabilities',
  difficulty: 'complex',
  unit: 'rupees',
  generate: (rng) => {
    const y = rng.pick(YEARS);
    const rate = rng.pick(DEBENTURE_RATES);
    const months = rng.pick([3, 6]);
    const loan = amt(rng, 500000, 3000000, 100000);
    const accrued = (loan * rate * months) / 1200;
    const dividend = drawn(rng, ['Unpaid dividend', 10000, 90000, 5000]);
    const other = drawn(rng, [rng.pick(['Calls in advance', 'Outstanding salaries', 'Income received in advance']), 10000, 120000, 5000]);
    const overdraft = drawn(rng, ['Bank overdraft', 50000, 300000, 10000]);
    const provision = drawn(rng, ['Provision for tax', 50000, 400000, 10000]);
    const answer = dividend.rs + other.rs + accrued;
    return numeric(
      `From these balances of ${firm(rng.pick(ANY_FIRM))}, as at 31 March ${y}, find the amount shown under Current Liabilities: Other Current Liabilities. Interest at ${rate}% a year on the term loan for the last ${months} months of the year is accrued but not due, and is not in the list.\n${lines(rng, [
        { label: 'Term loan from bank, repayable after four years', rs: loan },
        dividend,
        other,
        overdraft,
        provision,
      ])}`,
      answer,
      [
        { value: dividend.rs + other.rs, why: 'Left out the interest accrued but not due on the term loan. It is owed at the year end, so it is another current liability.' },
        { value: answer + overdraft.rs, why: 'Counted the bank overdraft. It is money borrowed from the bank, so it is a short-term borrowing.' },
        { value: answer + provision.rs, why: 'Counted the provision for tax, which is a short-term provision.' },
        { value: dividend.rs + other.rs + (loan * rate) / 100, why: `Took the interest for the whole year. Only ${months} months of it is owing.` },
        { value: answer + overdraft.rs + provision.rs, why: 'Counted both the bank overdraft, which is a short-term borrowing, and the provision for tax, which is a short-term provision.' },
      ],
      [
        `Interest accrued but not due = ${inr(loan)} × ${rate}% × ${months}/12 = ${inr(accrued)}.`,
        `Other current liabilities = ${dividend.label} ${inr(dividend.rs)} + ${other.label} ${inr(other.rs)} + Interest accrued ${inr(accrued)} = ${inr(answer)}.`,
        'The term loan is a long-term borrowing, the bank overdraft is a short-term borrowing, and provision for tax is a short-term provision.',
      ],
      HINTS.ocl,
    );
  },
  verify: (q) => {
    const m = /Interest at (\d+)% a year on the term loan for the last (\d+) months/.exec(q.prompt);
    if (!m) return false;
    const accrued = (oneWhere(q.prompt, /^Term loan/) * Number(m[1]) * Number(m[2])) / 1200;
    return answerRs(q) === accrued + sumWhere(q.prompt, /^(Unpaid dividend|Calls in advance|Outstanding salaries|Income received in advance)/);
  },
});

const fsTotalCurrentLiabilities = numericTemplate({
  id: 'fs-total-current-liabilities',
  version: 2,
  topicId: T,
  conceptId: 'fs-bs-equity-liabilities',
  difficulty: 'complex',
  unit: 'rupees',
  generate: (rng) => {
    const y = rng.pick(YEARS);
    const loan = amt(rng, 1000000, 4000000, 200000);
    const due = (loan * rng.pick([10, 20, 25])) / 100;
    const own = [drawn(rng, ['Bank overdraft', 50000, 400000, 10000]), drawn(rng, ['Trade payables', 200000, 900000, 10000]), drawn(rng, ['Provision for tax', 50000, 400000, 10000]), drawn(rng, ['Unpaid dividend', 10000, 90000, 5000])];
    const debentures = drawn(rng, ['9% Debentures, redeemable after six years', 500000, 2000000, 100000]);
    const gratuity = drawn(rng, ['Provision for gratuity, payable on retirement after many years', 100000, 600000, 10000]);
    const rest = sum(own.map((l) => l.rs));
    const answer = rest + due;
    return numeric(
      `From these balances of ${firm(rng.pick(ANY_FIRM))}, as at 31 March ${y}, find the total of Current Liabilities. Of the term loan, ${inr(due)} is repayable within twelve months of that date.\n${lines(rng, [{ label: 'Term loan from bank', rs: loan }, ...own, debentures, gratuity])}`,
      answer,
      [
        { value: rest, why: 'Left the part of the term loan repayable within twelve months with the long-term loan. It is a current maturity, shown under short-term borrowings.' },
        { value: rest + loan, why: 'Took the whole term loan as current. Only the part repayable within twelve months is.' },
        { value: answer + gratuity.rs, why: 'Counted the provision for gratuity, which is a long-term provision.' },
        { value: answer + debentures.rs, why: 'Counted the debentures, which are a long-term borrowing.' },
        { value: answer - own[2].rs, why: 'Left out the provision for tax, taking it for a reserve. It is a short-term provision, a current liability.' },
      ],
      [
        `Short-term borrowings = Bank overdraft ${inr(own[0].rs)} + Current maturity of the term loan ${inr(due)} = ${inr(own[0].rs + due)}.`,
        `Trade payables ${inr(own[1].rs)}; Other current liabilities (unpaid dividend) ${inr(own[3].rs)}; Short-term provisions (provision for tax) ${inr(own[2].rs)}.`,
        `Current liabilities = ${inr(own[0].rs + due)} + ${inr(own[1].rs)} + ${inr(own[3].rs)} + ${inr(own[2].rs)} = ${inr(answer)}.`,
        'The rest of the term loan and the debentures are long-term borrowings; the provision for gratuity is a long-term provision.',
      ],
      HINTS.cl,
    );
  },
  verify: (q) => answerRs(q) === amountsIn(q.prompt.split('\n')[0])[0] + sumWhere(q.prompt, /^(Bank overdraft|Trade payables|Provision for tax|Unpaid dividend)/),
});

const NOT_RESERVES: TrapEntry[] = [
  ['Provision for tax', 50000, 400000, 10000, 'is a provision, not a reserve: it is shown under short-term provisions'],
  ['Money received against share warrants', 50000, 400000, 10000, "is an item of Shareholders' Funds on its own, outside Reserves and Surplus"],
  ['Share application money pending allotment', 100000, 600000, 10000, 'is a major head of its own'],
];

const fsTotalReservesSurplus = numericTemplate({
  id: 'fs-total-reserves-surplus',
  version: 2,
  topicId: T,
  conceptId: 'fs-bs-equity-liabilities',
  difficulty: 'medium',
  unit: 'rupees',
  generate: (rng) => {
    const premium = drawn(rng, ['Securities Premium', 100000, 900000, 10000]);
    const reserve = drawn(rng, [rng.pick(['General Reserve', 'Capital Redemption Reserve', 'Capital Reserve']), 100000, 800000, 10000]);
    const debit = rng.next() < 0.65;
    const balance = amt(rng, 50000, 600000, 10000);
    const outsider = trap(rng, rng.pick(NOT_RESERVES));
    const kept = premium.rs + reserve.rs;
    const answer = debit ? kept - balance : kept + balance;
    return numeric(
      `From these balances of ${firm(rng.pick(ANY_FIRM))}, find the amount shown under Shareholders' Funds: Reserves and Surplus.\n${lines(rng, [premium, reserve, { label: `Statement of Profit and Loss (${debit ? 'debit' : 'credit'} balance)`, rs: balance }, outsider])}`,
      answer,
      [
        debit
          ? { value: kept + balance, why: 'Added the debit balance of the Statement of Profit and Loss. It is an accumulated loss, shown as a negative figure.' }
          : { value: kept - balance, why: 'Deducted the credit balance of the Statement of Profit and Loss. A credit balance is accumulated profit, so it is added.' },
        debit
          ? { value: kept, why: 'Left out the debit balance, as if it were shown on the assets side. It is deducted under Reserves and Surplus.' }
          : { value: kept, why: 'Left out the surplus, the credit balance of the Statement of Profit and Loss.' },
        { value: answer + outsider.rs, why: `Counted "${low(outsider.label)}", which ${outsider.where}.` },
      ],
      [
        `${premium.label} ${inr(premium.rs)} + ${reserve.label} ${inr(reserve.rs)} = ${inr(kept)}.`,
        debit
          ? `Less: debit balance of the Statement of Profit and Loss ${inr(balance)}, shown as a negative figure: ${inr(kept)} - ${inr(balance)} = ${inr(answer)}.`
          : `Add: surplus (credit balance of the Statement of Profit and Loss) ${inr(balance)}: ${inr(kept)} + ${inr(balance)} = ${inr(answer)}.`,
        `Left out: ${low(outsider.label)}, which ${outsider.where}.`,
      ],
      HINTS.reserves,
    );
  },
  verify: (q) => {
    const kept = sumWhere(q.prompt, /^(Securities Premium|General Reserve|Capital Redemption Reserve|Capital Reserve)/);
    const balance = oneWhere(q.prompt, /^Statement of Profit and Loss/);
    return answerRs(q) === (q.prompt.includes('(debit balance)') ? kept - balance : kept + balance);
  },
});

// --- The note on share capital, and shareholders' funds -------------------------------------------------------------

const fsNoteShareCapital = numericTemplate({
  id: 'fs-note-share-capital',
  version: 2,
  topicId: T,
  conceptId: 'fs-notes-contingent',
  difficulty: 'medium',
  unit: 'rupees',
  generate: (rng) => {
    const shares = amt(rng, 20000, 100000, 5000);
    const called = rng.pick([6, 7, 8, 10]);
    const arrears = amt(rng, 500, 3000, 100) * rng.pick([2, 3]);
    const calledUp = shares * called;
    const lead = `${firm(rng.pick(ANY_FIRM))}, has allotted ${shares.toLocaleString('en-IN')} equity shares of ₹10 each, on which ₹${called} a share has been called up. Calls of ${inr(arrears)} have not been received.`;
    const ask = 'What amount is shown against Share Capital in the balance sheet?';
    const first = `Called-up capital = ${shares.toLocaleString('en-IN')} × ₹${called} = ${inr(calledUp)}.`;
    const faceValue = called < 10 ? [{ value: shares * 10 - arrears, why: `Took the face value of ₹10 a share. Only the ₹${called} called up counts.` }] : [];
    if (rng.next() < 0.5) {
      const forfeited = amt(rng, 4000, 40000, 2000);
      return numeric(`${lead} Forfeited Shares Account has a balance of ${inr(forfeited)}, on other shares that were forfeited and are not yet reissued. ${ask}`, calledUp - arrears + forfeited, [
        { value: calledUp - arrears, why: 'Left out the balance of Forfeited Shares Account. Until the shares are reissued it is added to the subscribed capital in the note.' },
        { value: calledUp + arrears + forfeited, why: 'Added the calls in arrears. They are deducted from the called-up capital.' },
        { value: calledUp + forfeited, why: 'Did not deduct the calls in arrears.' },
        { value: calledUp - arrears - forfeited, why: 'Deducted the balance of Forfeited Shares Account. It is added to the subscribed capital until the shares are reissued.' },
      ], [first, `Less: Calls in arrears ${inr(arrears)}: ${inr(calledUp - arrears)}.`, `Add: Forfeited Shares Account ${inr(forfeited)}, shown as a separate line of the note: ${inr(calledUp - arrears + forfeited)}.`], HINTS.shareCapital);
    }
    const premium = shares * rng.pick([2, 4, 5]);
    return numeric(`${lead} Securities Premium of ${inr(premium)} was received on these shares. ${ask}`, calledUp - arrears, [
      { value: calledUp, why: 'Did not deduct the calls in arrears.' },
      { value: calledUp + arrears, why: 'Added the calls in arrears. They are deducted from the called-up capital.' },
      { value: calledUp - arrears + premium, why: 'Added the Securities Premium, which is shown under Reserves and Surplus.' },
      ...faceValue,
    ], [first, `Less: Calls in arrears ${inr(arrears)}: ${inr(calledUp - arrears)}.`, 'Securities Premium is shown under Reserves and Surplus, not under Share Capital.'], HINTS.shareCapital);
  },
  verify: (q) => {
    const m = /allotted ([\d,]+) equity shares of ₹10 each, on which ₹(\d+) a share has been called up\. Calls of (₹[\d,]+)/.exec(q.prompt);
    if (!m) return false;
    const forfeited = /has a balance of (₹[\d,]+)/.exec(q.prompt);
    return answerRs(q) === Number(m[1].replace(/,/g, '')) * Number(m[2]) - amountsIn(m[3])[0] + (forfeited ? amountsIn(forfeited[1])[0] : 0);
  },
});

const fsTotalShareholdersFunds = numericTemplate({
  id: 'fs-total-shareholders-funds',
  version: 2,
  topicId: T,
  conceptId: 'fs-bs-equity-liabilities',
  difficulty: 'complex',
  unit: 'rupees',
  generate: (rng) => {
    const shares = amt(rng, 50000, 300000, 10000);
    const capital = shares * 10;
    const arrears = amt(rng, 5000, 40000, 1000);
    const premium = amt(rng, 100000, 900000, 10000);
    const reserve = amt(rng, 100000, 800000, 10000);
    const loss = amt(rng, 50000, 500000, 10000);
    const application = amt(rng, 100000, 600000, 10000);
    const debentures = amt(rng, 500000, 2000000, 100000);
    const surplus = premium + reserve - loss;
    const answer = capital - arrears + surplus;
    return numeric(
      `From these balances of ${firm(rng.pick(ANY_FIRM))}, find the total of Shareholders' Funds shown in its balance sheet.\n${lines(rng, [
        { label: `Equity share capital, fully called up (${shares.toLocaleString('en-IN')} shares of ₹10 each)`, rs: capital },
        { label: 'Calls in arrears', rs: arrears },
        { label: 'Securities Premium', rs: premium },
        { label: 'General Reserve', rs: reserve },
        { label: 'Statement of Profit and Loss (debit balance)', rs: loss },
        { label: 'Share application money pending allotment', rs: application },
        { label: '9% Debentures', rs: debentures },
      ])}`,
      answer,
      [
        { value: answer + application, why: "Counted the share application money pending allotment. It is a major head of its own, outside Shareholders' Funds." },
        { value: answer + 2 * loss, why: 'Added the debit balance of the Statement of Profit and Loss. It is an accumulated loss, shown as a negative figure under Reserves and Surplus.' },
        { value: answer + 2 * arrears, why: 'Added the calls in arrears. They are deducted from the called-up capital.' },
        { value: answer + loss, why: 'Left out the debit balance of the Statement of Profit and Loss, as if it were shown on the assets side.' },
        { value: answer + arrears, why: 'Did not deduct the calls in arrears from the share capital.' },
        { value: answer + debentures, why: 'Counted the debentures, which are a long-term borrowing.' },
      ],
      [
        `Share Capital = ${inr(capital)} - Calls in arrears ${inr(arrears)} = ${inr(capital - arrears)}.`,
        `Reserves and Surplus = Securities Premium ${inr(premium)} + General Reserve ${inr(reserve)} - Debit balance of the Statement of Profit and Loss ${inr(loss)} = ${surplus >= 0 ? inr(surplus) : `a negative figure of ${inr(-surplus)}`}.`,
        `Shareholders' Funds = ${inr(capital - arrears)} ${surplus >= 0 ? '+' : '-'} ${inr(Math.abs(surplus))} = ${inr(answer)}.`,
        'Share application money pending allotment is a separate major head, and debentures are a long-term borrowing.',
      ],
      HINTS.funds,
    );
  },
  verify: (q) => {
    const of = (re: RegExp) => oneWhere(q.prompt, re);
    return answerRs(q) === of(/^Equity share capital/) - of(/^Calls in arrears/) + of(/^Securities Premium/) + of(/^General Reserve/) - of(/^Statement of Profit and Loss/);
  },
});

// ---------------------------------------------------------------------------------------------------------------
// Contingent liabilities and commitments
// ---------------------------------------------------------------------------------------------------------------

const DISCLOSED = {
  contingent: 'As a contingent liability, in the notes to accounts',
  commitment: 'As a commitment, in the notes to accounts',
  provision: 'Under Short-term Provisions, in the balance sheet',
  liability: 'Under Other Current Liabilities, in the balance sheet',
  borrowing: 'Under Short-term Borrowings, in the balance sheet',
  cwip: 'Under Capital Work-in-Progress, in the balance sheet',
  reserve: 'Under Reserves and Surplus, in the balance sheet',
  arrears: 'As calls in arrears, deducted from Share Capital',
} as const;
type Shown = keyof typeof DISCLOSED;
interface ContingentCase {
  text: (co: string, x: string) => string;
  right: Shown;
  note: string;
  wrong: [Shown, string][];
}
const NOT_UNCERTAIN = 'Nothing here hangs on an uncertain event: the amount is actually owed.';
const NOT_A_CONTRACT_TO_SPEND = 'A commitment is a contract for future spending. This amount becomes payable only if an uncertain event goes against the company, so it is a contingent liability.';
const CONTINGENT_CASES: ContingentCase[] = [
  { right: 'contingent', text: (co, x) => `A customer has sued ${co} for damages of ${x}. The company disputes the claim and has not accepted it as a debt.`,
    note: 'A claim against the company not acknowledged as debt becomes payable only if the court decides against it. It is a contingent liability, disclosed in the notes and not shown in the balance sheet.',
    wrong: [
      ['provision', 'Made a provision though the company does not accept the claim. A claim not acknowledged as debt is only disclosed in the notes.'],
      ['liability', 'Treated a disputed claim as an amount actually owed.'],
      ['commitment', NOT_A_CONTRACT_TO_SPEND],
    ] },
  { right: 'contingent', text: (co, x) => `${co} has given a guarantee of ${x} to a bank for a loan taken by its subsidiary company.`,
    note: 'A guarantee is payable only if the subsidiary fails to repay. It is a contingent liability, disclosed in the notes and not shown in the balance sheet.',
    wrong: [
      ['borrowing', "Treated the subsidiary's loan as the company's own borrowing. The company pays only if the subsidiary fails to."],
      ['liability', 'Treated the guarantee as an amount actually owed. It is payable only if the subsidiary fails to repay.'],
      ['commitment', NOT_A_CONTRACT_TO_SPEND],
    ] },
  { right: 'contingent', text: (co, x) => `${co} discounted bills receivable of ${x} with its bank. The bills have not matured by the balance sheet date.`,
    note: 'If an acceptor dishonours a bill, the company must pay the bank. Until the bills mature this is a contingent liability, disclosed in the notes.',
    wrong: [
      ['borrowing', 'Treated the discounting as a loan from the bank. The company has to pay only if a bill is dishonoured.'],
      ['liability', 'Treated the bills discounted as an amount actually owed. The company has to pay only if a bill is dishonoured.'],
      ['commitment', NOT_A_CONTRACT_TO_SPEND],
    ] },
  { right: 'contingent', text: (co, x) => `The income tax department has raised an extra demand of ${x} on ${co} for an earlier year. The company disputes it, has gone in appeal and has made no provision.`,
    note: 'A disputed demand not provided for is payable only if the appeal fails. It is a contingent liability, disclosed in the notes.',
    wrong: [
      ['provision', "Took the disputed demand for the year's provision for tax. The company does not accept it and has made no provision, so it is only disclosed."],
      ['liability', 'Treated a disputed demand as an amount actually owed.'],
      ['commitment', NOT_A_CONTRACT_TO_SPEND],
    ] },
  { right: 'commitment', text: (co, x) => `${co} has placed an order for a machine costing ${x}. At the balance sheet date the machine has not been delivered and nothing has been paid or provided.`,
    note: 'The estimated amount of contracts remaining to be executed on capital account and not provided for is a commitment, disclosed in the notes.',
    wrong: [
      ['contingent', 'A contingent liability hangs on an uncertain event. Here there is a firm contract for capital spending still to be carried out, which is a commitment.'],
      ['liability', 'Nothing is owed yet: the machine has not been delivered.'],
      ['cwip', 'Nothing has been built or paid for yet, so there is no asset to show.'],
    ] },
  { right: 'commitment', text: (co, x) => `${co} holds partly paid shares of another company as an investment. ${x} on them has not yet been called.`,
    note: 'The uncalled liability on partly paid shares held as an investment is a commitment, disclosed in the notes.',
    wrong: [
      ['contingent', 'Schedule III lists the uncalled liability on partly paid shares under commitments: the company has bound itself to pay when the call is made.'],
      ['liability', 'Until a call is made nothing is due, so there is no liability to show in the balance sheet.'],
      ['arrears', "Mixed the company's own share capital with shares it holds in another company. And no call has been made, so nothing is in arrears."],
    ] },
  { right: 'provision', text: (co, x) => `${co} estimates that income tax of ${x} will be payable on its profit of the year.`,
    note: 'Tax on the profit of the year is a present obligation whose amount is estimated: a provision, shown in the balance sheet under Short-term Provisions.',
    wrong: [
      ['contingent', 'Tax on the profit of the year does not hang on an uncertain event. It is a present obligation, so a provision is made.'],
      ['liability', 'The amount is an estimate, so it is a provision. Other current liabilities are known amounts.'],
      ['reserve', 'Treated a provision as a reserve. A provision meets a liability; a reserve is profit kept back.'],
    ] },
  { right: 'liability', text: (co, x) => `Salaries of ${x} for March have not been paid by ${co} at 31 March.`,
    note: 'Salaries owing are a known amount actually owed: Other Current Liabilities, in the balance sheet.',
    wrong: [
      ['contingent', NOT_UNCERTAIN],
      ['provision', 'A known amount owing is not a provision, which is an estimate.'],
      ['commitment', 'A commitment is for spending still to come. These salaries have already been earned by the employees.'],
    ] },
  { right: 'liability', text: (co, x) => `${co} declared a dividend at its annual general meeting. ${x} of it has not been claimed by shareholders at the year end.`,
    note: 'A dividend declared and not yet paid is a known amount owed to shareholders: Other Current Liabilities, in the balance sheet.',
    wrong: [
      ['contingent', NOT_UNCERTAIN],
      ['provision', 'A dividend already declared is a fixed amount, not an estimate, so it is not a provision.'],
      ['reserve', 'Once declared, the dividend has left the surplus and is owed to the shareholders.'],
    ] },
  { right: 'liability', text: (co, x) => `A customer claimed ${x} from ${co} for defective goods. The company has accepted the claim and agreed to pay it next month.`,
    note: 'A claim the company has accepted is no longer contingent. It is a known amount owed: Other Current Liabilities, in the balance sheet.',
    wrong: [
      ['contingent', 'The claim is no longer disputed. The company has accepted it, so it is an actual liability.'],
      ['commitment', 'A commitment is a contract for future spending. This is an amount already owed.'],
      ['provision', 'The amount is known and agreed, not an estimate, so it is not a provision.'],
    ] },
];

const fsContingentKind = mcqTemplate({
  id: 'fs-contingent-kind',
  topicId: T,
  conceptId: 'fs-notes-contingent',
  difficulty: 'easy',
  generate: (rng) => {
    const c = rng.pick(CONTINGENT_CASES);
    return {
      prompt: `${c.text(company(rng), inr(amt(rng, 50000, 2000000, 50000)))} How is this shown in the financial statements?`,
      correct: DISCLOSED[c.right],
      distractors: c.wrong.map(([s, why]) => ({ text: DISCLOSED[s], why })),
      explanation: c.note,
      hints: ['Is the amount actually owed now, or does it depend on something uncertain?', 'A contingent liability and a commitment are disclosed in the notes; a liability and a provision are shown in the balance sheet.'],
    };
  },
  verify: (q) => {
    const masked = q.prompt.replace(RUPEE_G, '#').replace(' How is this shown in the financial statements?', '');
    const hit = CONTINGENT_CASES.filter((c) => COMPANIES.some((co) => c.text(co, '#') === masked));
    return hit.length === 1 && correctText(q) === DISCLOSED[hit[0].right] && !wrongTexts(q).includes(DISCLOSED[hit[0].right]);
  },
});

const CONTINGENTS: Entry[] = [
  ['Claim against the company not acknowledged as debt', 100000, 900000, 10000],
  ['Guarantee given to a bank for a loan taken by a subsidiary', 200000, 1500000, 50000],
  ['Bills receivable discounted with the bank, not yet matured', 40000, 300000, 10000],
  ['Income tax demand disputed in appeal, not provided for', 50000, 500000, 10000],
];
const COMMITMENTS: Entry[] = [
  ['Contracts remaining to be executed on capital account, not provided for', 200000, 2000000, 50000],
  ['Uncalled liability on partly paid shares held as an investment', 50000, 400000, 10000],
];
const ACTUAL_LIABILITIES: Entry[] = [['Provision for tax', 50000, 400000, 10000], ['Outstanding expenses', 20000, 150000, 5000], ['Unpaid dividend', 10000, 90000, 5000]];

const fsContingentTotal = numericTemplate({
  id: 'fs-contingent-total',
  version: 2,
  topicId: T,
  conceptId: 'fs-notes-contingent',
  difficulty: 'medium',
  unit: 'rupees',
  generate: (rng) => {
    const ask = rng.pick(['contingent', 'commitments', 'both'] as const);
    const contingents = some(rng, CONTINGENTS, rng.int(2, 3)).map((e) => drawn(rng, e));
    const commitments = some(rng, COMMITMENTS, ask === 'commitments' ? 2 : rng.int(1, 2)).map((e) => drawn(rng, e));
    const actual = drawn(rng, rng.pick(ACTUAL_LIABILITIES));
    const [c, k] = [sum(contingents.map((l) => l.rs)), sum(commitments.map((l) => l.rs))];
    const asked = { contingent: 'contingent liabilities', commitments: 'commitments', both: 'contingent liabilities and commitments together' }[ask];
    const prompt = `The notes to accounts of ${firm(rng.pick(MAKERS))}, are being prepared from these items. Find the total disclosed as ${asked}.\n${lines(rng, [...contingents, ...commitments, actual])}`;
    const added = (ls: Line[], total: number) => (ls.length > 1 ? `${ls.map((l) => inr(l.rs)).join(' + ')} = ${inr(total)}` : inr(total));
    const actualWhy = `Counted "${low(actual.label)}", an actual liability that is shown in the balance sheet itself.`;
    const working = [
      `Contingent liabilities (payable only if an uncertain event goes against the company): ${added(contingents, c)}.`,
      `Commitments (contracts for future spending): ${added(commitments, k)}.`,
      `Left out: ${low(actual.label)}, an actual liability shown in the balance sheet and not in this note.`,
    ];
    if (ask === 'contingent') {
      return numeric(prompt, c, [
        { value: c + k, why: 'Counted the commitments too. A commitment is a contract for future spending, not an amount that depends on an uncertain event.' },
        { value: c + actual.rs, why: actualWhy },
        { value: c + k + actual.rs, why: 'Added every item in the list.' },
      ], working, HINTS.contingent);
    }
    if (ask === 'commitments') {
      return numeric(prompt, k, [
        { value: c + k, why: 'Counted the contingent liabilities too. They depend on an uncertain event; a commitment is a contract for future spending.' },
        { value: k + actual.rs, why: actualWhy },
        { value: c, why: 'Gave the contingent liabilities instead of the commitments.' },
        { value: c + k + actual.rs, why: 'Added every item in the list.' },
      ], working, HINTS.contingent);
    }
    return numeric(prompt, c + k, [
      { value: c + k + actual.rs, why: actualWhy },
      { value: c, why: 'Gave the contingent liabilities alone and left out the commitments.' },
      { value: k, why: 'Gave the commitments alone and left out the contingent liabilities.' },
    ], [...working, `Total = ${inr(c)} + ${inr(k)} = ${inr(c + k)}.`], HINTS.contingent);
  },
  verify: (q) => {
    const c = sumWhere(q.prompt, /^(Claim against|Guarantee given|Bills receivable discounted|Income tax demand)/);
    const k = sumWhere(q.prompt, /^(Contracts remaining|Uncalled liability)/);
    const first = q.prompt.split('\n')[0];
    return answerRs(q) === (first.includes('together') ? c + k : first.includes('disclosed as commitments') ? k : c);
  },
});

// ---------------------------------------------------------------------------------------------------------------
// Facts: the form of the statements, and what financial statements are
// ---------------------------------------------------------------------------------------------------------------

/** A bank of ready-made multiple-choice facts: one question per entry, each wrong option a named mistake. */
interface Fact {
  q: string;
  right: string;
  wrong: Distractor[];
  because: string;
}
function factTemplate(id: string, conceptId: string, difficulty: 'easy' | 'medium', bank: Fact[], hints: string[]) {
  return mcqTemplate({
    id,
    topicId: T,
    conceptId,
    difficulty,
    // Version 2: the hints of the bank in place of the general pair.
    version: 2,
    generate: (rng) => {
      const f = rng.pick(bank);
      return { prompt: f.q, correct: f.right, distractors: f.wrong, explanation: f.because, hints };
    },
    // The bank is the record: the question must still be one of its entries, with its right answer among no wrong ones.
    verify: (q) => bank.some((f) => f.q === q.prompt && f.right === correctText(q) && !wrongTexts(q).includes(f.right)),
  });
}

const FORM_FACTS: Fact[] = [
  { q: 'In the balance sheet of a company as per Schedule III, which is the first major head under "Equity and Liabilities"?',
    right: "Shareholders' Funds",
    wrong: [
      { text: 'Share Capital', why: "Named a sub-head. Share Capital is the first item under the major head Shareholders' Funds." },
      { text: 'Current Liabilities', why: 'Put the liabilities due soonest first. Schedule III begins with the funds of the owners and ends with current liabilities.' },
      { text: 'Non-Current Liabilities', why: "Skipped the owners' funds. Non-current liabilities come after Shareholders' Funds and share application money pending allotment." },
    ],
    because: "Equity and Liabilities are listed as: Shareholders' Funds; Share application money pending allotment; Non-Current Liabilities; Current Liabilities." },
  { q: 'Which of these is a major head of the Schedule III balance sheet, and not a sub-head of another head?',
    right: 'Share application money pending allotment',
    wrong: [
      { text: 'Money received against share warrants', why: "It sounds alike, but it is the third item under Shareholders' Funds, not a major head." },
      { text: 'Reserves and Surplus', why: "Reserves and Surplus is the second item under Shareholders' Funds." },
      { text: 'Trade Payables', why: 'Trade Payables is a sub-head under Current Liabilities.' },
    ],
    because: "Share application money pending allotment stands on its own between Shareholders' Funds and Non-Current Liabilities." },
  { q: 'Since the 2021 amendment of Schedule III, what is the sub-head once called "Fixed Assets" now called?',
    right: 'Property, Plant and Equipment and Intangible Assets',
    wrong: [
      { text: 'Property, Plant and Equipment', why: 'That is the new name of "Tangible Assets", which is only one part of the sub-head.' },
      { text: 'Tangible and Intangible Assets', why: 'Joined the two old names of the parts. The sub-head is now Property, Plant and Equipment and Intangible Assets.' },
      { text: 'Non-current Fixed Assets', why: 'Made up a name from the major head. The words "fixed assets" are no longer used in the form.' },
    ],
    because: 'The 2021 amendment renamed "Fixed Assets" as "Property, Plant and Equipment and Intangible Assets", and "Tangible Assets" within it as "Property, Plant and Equipment".' },
  { q: 'Which of these is NOT one of the four parts of the sub-head "Property, Plant and Equipment and Intangible Assets"?',
    right: 'Non-current investments',
    wrong: [
      { text: 'Capital work-in-progress', why: 'It is a part of the sub-head: tangible assets still being built.' },
      { text: 'Intangible assets under development', why: 'It is a part of the sub-head: intangible assets not yet ready for use.' },
      { text: 'Intangible assets', why: 'It is a part of the sub-head, with goodwill, patents and software.' },
    ],
    because: 'The four parts are Property, Plant and Equipment; Intangible assets; Capital work-in-progress; Intangible assets under development. Non-current investments is a sub-head of its own.' },
  { q: 'Which list gives all the sub-heads of "Current Liabilities" in the Schedule III balance sheet?',
    right: 'Short-term borrowings, trade payables, other current liabilities, short-term provisions',
    wrong: [
      { text: 'Trade payables, other current liabilities, short-term provisions', why: 'Left out short-term borrowings, as if every borrowing were long-term.' },
      { text: 'Short-term borrowings, trade payables, bank overdraft, short-term provisions', why: 'Put bank overdraft, which is itself a short-term borrowing, in the place of other current liabilities.' },
      { text: 'Short-term borrowings, trade payables, current maturities of long-term debt, other current liabilities, short-term provisions', why: 'Gave current maturities a sub-head of their own. They are a part of short-term borrowings.' },
    ],
    because: 'Current Liabilities has four sub-heads: (a) Short-term borrowings, (b) Trade payables, (c) Other current liabilities, (d) Short-term provisions.' },
  { q: 'Which of these sub-heads of Current Assets has no long-term counterpart among the sub-heads of Non-Current Assets?',
    right: 'Inventories',
    wrong: [
      { text: 'Current investments', why: 'Its counterpart is Non-current investments.' },
      { text: 'Short-term loans and advances', why: 'Its counterpart is Long-term loans and advances.' },
      { text: 'Other current assets', why: 'Its counterpart is Other non-current assets.' },
    ],
    because: 'Investments, loans and advances and "other" assets each appear in a non-current and a current form. Inventories are always current.' },
  { q: "In a company's balance sheet, which two totals must agree?",
    right: 'The total of Equity and Liabilities and the total of Assets',
    wrong: [
      { text: "The total of Shareholders' Funds and the total of Non-Current Assets", why: 'Matched one head with one head. The whole of equity and liabilities equals the whole of the assets.' },
      { text: 'The total of Current Assets and the total of Current Liabilities', why: 'These two need not be equal; their difference is the working capital.' },
      { text: 'Total income and total expenses', why: 'Those belong to the Statement of Profit and Loss, and their difference is the profit.' },
    ],
    because: 'The balance sheet has two parts, I. Equity and Liabilities and II. Assets, and their totals are equal.' },
  { q: 'In what form does Schedule III require the balance sheet of a company?',
    right: 'A vertical form, with Equity and Liabilities first and Assets below them',
    wrong: [
      { text: 'A horizontal form, with liabilities on the left and assets on the right', why: 'That is the form used for a sole trader or a firm. A company follows the vertical form of Schedule III.' },
      { text: 'A vertical form, with Assets first and Equity and Liabilities below them', why: 'Reversed the two parts. Equity and Liabilities come first.' },
      { text: 'Any form the directors find suitable', why: 'The form is laid down by Schedule III and is not left to the company.' },
    ],
    because: 'Schedule III gives one vertical form: I. Equity and Liabilities, then II. Assets.' },
  { q: 'Since the 2021 amendment of Schedule III, where are current maturities of long-term borrowings shown?',
    right: 'Under Short-term Borrowings',
    wrong: [
      { text: 'Under Trade Payables', why: 'Trade payables are owed to suppliers of goods and services. An instalment of a loan is money borrowed.' },
      { text: 'Under Long-term Borrowings', why: 'The part repayable within twelve months is current and is taken out of long-term borrowings.' },
      { text: 'Under Short-term Provisions', why: 'An instalment of a loan is a fixed amount, not an estimate, so it is not a provision.' },
    ],
    because: 'The amendment moved current maturities of long-term borrowings from other current liabilities, where older books still show them, to short-term borrowings.' },
  { q: "Which of these is a sub-head of Shareholders' Funds?",
    right: 'Money received against share warrants',
    wrong: [
      { text: 'Share application money pending allotment', why: "It is a major head of its own, shown after Shareholders' Funds." },
      { text: 'Long-term provisions', why: 'It is a sub-head of Non-Current Liabilities.' },
      { text: 'Deferred tax liabilities (net)', why: 'It is a sub-head of Non-Current Liabilities.' },
    ],
    because: "Shareholders' Funds has three items: (a) Share capital, (b) Reserves and surplus, (c) Money received against share warrants." },
  { q: 'In which pair are both items sub-heads of Non-Current Liabilities?',
    right: 'Deferred tax liabilities (net) and long-term provisions',
    wrong: [
      { text: 'Long-term borrowings and trade payables', why: 'Trade payables is a sub-head of Current Liabilities.' },
      { text: 'Long-term provisions and reserves and surplus', why: "Reserves and surplus belongs to Shareholders' Funds. A reserve is not a liability." },
      { text: 'Other long-term liabilities and short-term borrowings', why: 'Short-term borrowings is a sub-head of Current Liabilities.' },
    ],
    because: 'Non-Current Liabilities: (a) Long-term borrowings, (b) Deferred tax liabilities (net), (c) Other long-term liabilities, (d) Long-term provisions.' },
  { q: 'In which pair are both items sub-heads of Current Assets?',
    right: 'Inventories and short-term loans and advances',
    wrong: [
      { text: 'Trade receivables and capital work-in-progress', why: 'Capital work-in-progress is a fixed asset under construction, a part of Non-Current Assets.' },
      { text: 'Current investments and deferred tax assets (net)', why: 'Deferred tax assets (net) is a sub-head of Non-Current Assets.' },
      { text: 'Cash and cash equivalents and long-term loans and advances', why: 'Long-term loans and advances is a sub-head of Non-Current Assets.' },
    ],
    because: 'Current Assets: (a) Current investments, (b) Inventories, (c) Trade receivables, (d) Cash and cash equivalents, (e) Short-term loans and advances, (f) Other current assets.' },
  { q: 'Since the 2021 amendment of Schedule III, under which sub-head are long-term security deposits listed?',
    right: 'Other non-current assets',
    wrong: [
      { text: 'Other current assets', why: 'A deposit that stays for years is not realised within twelve months, so it is not a current asset.' },
      { text: 'Non-current investments', why: 'A deposit kept as security is not an investment.' },
      { text: 'Cash and cash equivalents', why: 'A deposit kept with an authority as security is not a balance with a bank.' },
    ],
    because: 'The 2021 amendment took security deposits out of long-term loans and advances, where older books still show them, and listed them under other non-current assets.' },
  { q: "Where does a company give the details of a line of its balance sheet, such as the kinds of reserves that make up Reserves and Surplus?",
    right: 'In the notes to accounts, numbered in the "Note No." column',
    wrong: [
      { text: 'On the face of the balance sheet, under each sub-head', why: 'The face of the balance sheet carries only the heads and sub-heads with one figure each. The details go to the notes.' },
      { text: "In the directors' report", why: "The directors' report is not a part of the financial statements. The details are in the notes to accounts." },
      { text: 'In the Statement of Profit and Loss', why: 'That statement shows the income and expenses of the year, not the make-up of a balance sheet item.' },
    ],
    because: 'Each line of the balance sheet refers by number to a note that gives its details.' },
  { q: 'In the Statement of Profit and Loss as per Schedule III, what is "Total Income"?',
    right: 'Revenue from Operations plus Other Income',
    wrong: [
      { text: 'Revenue from Operations less Total Expenses', why: 'That difference, after adding other income, is the profit before tax and not the total income.' },
      { text: 'Revenue from Operations alone', why: 'Left out Other Income, the second line of the statement.' },
      { text: 'Profit before Tax plus Tax Expense', why: 'Worked backwards from the bottom of the statement. Total income is the sum of the first two lines.' },
    ],
    because: 'I. Revenue from Operations + II. Other Income = III. Total Income.' },
  { q: 'Which of these is the last expense line before "Total Expenses" in the Statement of Profit and Loss as per Schedule III?',
    right: 'Other Expenses',
    wrong: [
      { text: 'Tax Expense', why: 'Tax is not among the expenses that make up Total Expenses. It is deducted after the profit before tax.' },
      { text: 'Finance Costs', why: 'Finance costs come before depreciation and amortisation expense and other expenses.' },
      { text: 'Depreciation and Amortisation Expense', why: 'It is followed by one more line, Other Expenses.' },
    ],
    because: 'The expenses are listed as: cost of materials consumed; purchases of stock-in-trade; changes in inventories; employee benefits expense; finance costs; depreciation and amortisation expense; other expenses.' },
  { q: 'In the Statement of Profit and Loss as per Schedule III, how is "Profit before Tax" arrived at?',
    right: 'Total Income less Total Expenses',
    wrong: [
      { text: 'Revenue from Operations less Total Expenses', why: 'Left out Other Income. Total Income, not revenue from operations alone, is the starting figure.' },
      { text: 'Total Income less Tax Expense', why: 'Tax is deducted from the profit before tax, to give the profit for the period.' },
      { text: 'Total Income less Cost of Materials Consumed', why: 'That deducts only one of the expenses. All the expense lines are deducted.' },
    ],
    because: 'Total Income - Total Expenses = Profit before Tax; Profit before Tax - Tax Expense = Profit for the period.' },
];

const MEANING_FACTS: Fact[] = [
  { q: 'Which of these is a part of the financial statements of a company?',
    right: 'The notes to accounts',
    wrong: [
      { text: "The directors' report", why: "The directors' report is sent with the financial statements but is not a part of them." },
      { text: "The auditor's report", why: 'It is the opinion of the auditor on the financial statements, not a part of them.' },
      { text: 'The trial balance', why: 'The trial balance is a working list from which the statements are prepared. It is not published.' },
    ],
    because: 'The financial statements are the balance sheet, the Statement of Profit and Loss, the cash flow statement and the notes to accounts.' },
  { q: "What does the balance sheet of a company show?",
    right: 'Its financial position on a particular date',
    wrong: [
      { text: 'Its financial performance over a period', why: 'Performance over a period is shown by the Statement of Profit and Loss.' },
      { text: 'Its receipts and payments of cash during the year', why: 'Those are shown by the cash flow statement.' },
      { text: 'The market value of the company on a particular date', why: 'Assets are shown mostly at cost, so the balance sheet does not give the market value of the company.' },
    ],
    because: 'A balance sheet lists what the company owns and owes "as at" a date: its financial position.' },
  { q: 'What does the Statement of Profit and Loss of a company show?',
    right: 'Its financial performance, the profit or loss, for a period',
    wrong: [
      { text: 'Its financial position on a particular date', why: 'Position on a date is shown by the balance sheet.' },
      { text: 'The cash it received and paid during the period', why: 'It is prepared on the accrual basis, so its income and expenses are not the cash received and paid.' },
      { text: 'The assets it bought during the period', why: 'Buying an asset is not an expense. Assets appear in the balance sheet.' },
    ],
    because: 'The Statement of Profit and Loss sets the income of a period against its expenses to give the profit or loss.' },
  { q: 'Which of these is an objective of financial statements?',
    right: 'To give information about the economic resources and obligations of the business',
    wrong: [
      { text: 'To show the present market value of every asset', why: 'Assets are recorded at historical cost. Showing market values is not an objective, and is in fact a limitation.' },
      { text: 'To record every transaction as it takes place', why: 'That is the work of the books of account. Financial statements summarise them at the end of the period.' },
      { text: 'To forecast the profit of the coming year with certainty', why: 'Financial statements report what has happened. They help in judging the future but do not forecast it.' },
    ],
    because: 'Financial statements aim to give true and fair information about resources, obligations and earning capacity to those who use them.' },
  { q: 'Financial statements are a blend of recorded facts, accounting conventions and personal judgements. Which of these is a recorded fact?',
    right: 'The price at which a machine was bought',
    wrong: [
      { text: 'The method chosen for depreciating the machine', why: 'The choice of a method is a personal judgement of the accountant.' },
      { text: 'Valuing inventory at the lower of cost and net realisable value', why: 'That follows a convention, prudence, and is not a recorded fact.' },
      { text: 'The estimate of debts that may not be recovered', why: 'An estimate rests on personal judgement.' },
    ],
    because: 'Recorded facts are figures taken from the books, such as the cost of an asset or cash in hand.' },
  { q: 'Which of these is a limitation of financial statements?',
    right: 'They leave out what cannot be measured in money, such as the quality of the management',
    wrong: [
      { text: 'They are prepared in a form laid down by law', why: 'A common form makes the statements comparable. It is a merit, not a limitation.' },
      { text: 'They give the figures of the previous year beside those of the current year', why: 'That helps comparison. It is a merit, not a limitation.' },
      { text: 'They are examined by an auditor', why: 'An audit adds to their reliability. It is not a limitation.' },
    ],
    because: 'Only facts that can be expressed in money are recorded, so qualitative factors are ignored.' },
  { q: 'What is meant by "window dressing" of financial statements?',
    right: 'Presenting the accounts so that the position looks better than it really is',
    wrong: [
      { text: 'Preparing the statements in the vertical form of Schedule III', why: 'That is the required form of presentation, not a manipulation.' },
      { text: 'Disclosing every material fact in the notes to accounts', why: 'That is full disclosure, the opposite of window dressing.' },
      { text: 'Decorating the showroom, and charging the cost to advertisement', why: 'Took the phrase literally. In accounting it means dressing up the figures.' },
    ],
    because: 'Window dressing is the manipulation of accounts to show a better profit or position than the real one.' },
  { q: 'Land bought twenty years ago stands in a balance sheet at its purchase price. Which limitation of financial statements does this show?',
    right: 'They are based on historical cost and ignore changes in the price level',
    wrong: [
      { text: 'They are affected by window dressing', why: 'Nothing has been manipulated here. The old cost is shown because the rules require it.' },
      { text: 'They ignore qualitative factors', why: 'The value of land can be stated in money. The trouble is that the figure is an old one.' },
      { text: 'They are affected by personal judgement', why: 'The purchase price is a recorded fact, not an estimate.' },
    ],
    because: 'Assets are shown at what was paid for them, so the balance sheet does not show their present worth.' },
  { q: 'Under which law is the form of the financial statements of a company laid down?',
    right: 'Schedule III to the Companies Act, 2013',
    wrong: [
      { text: 'Schedule VI to the Companies Act, 1956', why: 'That was the form under the old Act, which the Companies Act, 2013 replaced.' },
      { text: 'The Indian Partnership Act, 1932', why: 'That Act deals with partnership firms, not companies.' },
      { text: 'Schedule II to the Companies Act, 2013', why: 'Schedule II deals with the useful lives of assets for depreciation, not with the form of the statements.' },
    ],
    because: 'Schedule III to the Companies Act, 2013 gives the form of the balance sheet and of the Statement of Profit and Loss.' },
  { q: 'Why are the financial statements of a year called "interim reports"?',
    right: 'The exact result of a business is known only when it is finally wound up; the profit of a year is an estimate along the way',
    wrong: [
      { text: 'They are prepared every three months', why: 'Took "interim" to mean quarterly. The yearly statements themselves are interim in the life of the business.' },
      { text: 'They are published before the audit is complete', why: 'Annual financial statements are audited. "Interim" refers to the life of the business, not to the audit.' },
      { text: 'They cover only a part of the business', why: 'They cover the whole company. They are interim in time, not in coverage.' },
    ],
    because: 'The life of a business is cut into years for reporting, so the figures of any one year depend on estimates such as depreciation and provisions.' },
  { q: 'Which statement about financial statements is correct?',
    right: 'They are historical: they report what has already happened',
    wrong: [
      { text: 'They are free from personal judgement', why: 'Depreciation, provisions and the valuation of inventory all rest on judgement.' },
      { text: 'They show every asset at its market value', why: 'Assets are recorded at historical cost.' },
      { text: 'They are forecasts of the coming year', why: 'They report the year that has ended.' },
    ],
    because: 'Financial statements are a record of past transactions, prepared at the end of the accounting period.' },
  { q: 'For whom are the financial statements of a company primarily prepared?',
    right: 'Its shareholders, to whom the directors must account for the resources entrusted to them',
    wrong: [
      { text: 'Its employees, to fix their salaries', why: 'Employees use the statements, but the statements are a report by the directors to the shareholders.' },
      { text: 'Its competitors, to compare prices', why: 'Competitors may read published statements, but the statements are not prepared for them.' },
      { text: 'Its suppliers, to collect their dues', why: 'Suppliers use the statements to judge credit, but the statements are a report to the shareholders.' },
    ],
    because: 'The directors manage the company for its shareholders and report to them through the financial statements: the stewardship function.' },
  { q: 'Financial statements "aggregate" information. What limitation follows from this?',
    right: 'One figure, such as trade receivables, hides the details behind it, so it helps little in a particular decision',
    wrong: [
      { text: 'The statements become too long to read', why: 'Aggregation shortens the statements. The cost is the loss of detail.' },
      { text: 'The statements cannot be audited', why: 'Aggregated statements are audited from the detailed books.' },
      { text: 'The totals of the two parts of the balance sheet no longer agree', why: 'Adding figures together does not disturb the equality of the totals.' },
    ],
    because: 'Large numbers of transactions are grouped under a few heads, so the statements give totals, not the details a user may need.' },
];

const fsFormFacts = factTemplate('fs-form-facts', 'fs-bs-form', 'easy', FORM_FACTS, [
  'Picture the statement from the top down: the balance sheet in its vertical form, or the Statement of Profit and Loss line by line.',
  "Equity and Liabilities: Shareholders' Funds, Share application money pending allotment, Non-Current Liabilities, Current Liabilities. Then Assets: Non-Current, then Current. The Statement of Profit and Loss: incomes, expenses, profit before tax, tax, profit.",
]);
const fsMeaningFacts = factTemplate('fs-meaning-facts', 'fs-meaning', 'easy', MEANING_FACTS, [
  'Remember what the statements are: a report of the past year, prepared by the directors for the shareholders.',
  'They are a blend of recorded facts, conventions and judgements; their limits come from historical cost, money measurement, estimates and window dressing.',
]);

// --- Who uses the statements, and for what ------------------------------------------------------------------------------

type User = 'shareholders' | 'lenders' | 'investors' | 'government' | 'employees' | 'management';
/** Who they are, and what they read the statements for, in words that follow "to". */
const USERS: Record<User, [string, string]> = {
  shareholders: ['Existing shareholders, judging the stewardship of the directors', 'see how the directors have used the money entrusted to them'],
  lenders: ['Lenders and suppliers, deciding whether to give credit', 'judge whether the company can pay interest and repay what it owes'],
  investors: ['Prospective investors, deciding whether to buy its shares', 'judge the earning capacity and safety of the company before putting money in it'],
  government: ['The government, for taxation and economic policy', 'assess tax and frame its fiscal policies'],
  employees: ['Employees and their unions, for pay and bonus', 'judge whether the company can afford better pay, bonus and benefits'],
  management: ['The management, for planning and control', 'plan the work ahead and control costs'],
};
const USE_CASES: { user: User; text: (co: string) => string; point: string }[] = [
  { user: 'lenders', point: 'a bank is deciding on a loan', text: (co) => `A bank studies the balance sheet of ${co} before sanctioning a term loan.` },
  { user: 'lenders', point: 'a supplier is deciding whether to sell on credit', text: (co) => `A supplier checks the current assets and current liabilities of ${co} before agreeing to sell to it on 90 days' credit.` },
  { user: 'lenders', point: 'a lender is checking the safety of interest', text: (co) => `A debentureholder of ${co} checks whether its profit is large enough to cover the interest on debentures.` },
  { user: 'shareholders', point: 'the owners are judging how their money was used', text: (co) => `At the annual general meeting, the members of ${co} examine the statements to see what the directors did with the capital they contributed.` },
  { user: 'shareholders', point: 'the owners are judging the directors who manage for them', text: (co) => `The members of ${co} read the Statement of Profit and Loss before voting on the reappointment of its directors.` },
  { user: 'investors', point: 'a person who holds no shares yet is deciding whether to invest', text: (co) => `A person with savings compares the profits of ${co} for five years before applying for its shares for the first time.` },
  { user: 'investors', point: 'an outsider is deciding whether to put fresh money in the company', text: (co) => `The analyst of a mutual fund that holds no shares of ${co} reads its statements to decide whether the fund should buy them.` },
  { user: 'government', point: 'the state is framing its tax policy', text: (co) => `The finance ministry studies the profits of ${co} and other companies of its industry before changing the rate of tax on them.` },
  { user: 'government', point: 'the tax due is being assessed', text: (co) => `The income tax department examines the profit reported by ${co} to assess the tax payable by it.` },
  { user: 'employees', point: 'the workers are judging what the company can afford to pay them', text: (co) => `The workers' union of ${co} reads its Statement of Profit and Loss before asking for a higher bonus.` },
  { user: 'management', point: 'those who run the company are looking for costs to control', text: (co) => `The managers of ${co} compare this year's expenses, line by line, with last year's to decide where costs can be cut.` },
  { user: 'management', point: 'those who run the company are planning the next year', text: (co) => `The managers of ${co} use this year's statements to prepare the budget for next year.` },
];

const fsUseScenario = mcqTemplate({
  id: 'fs-use-scenario',
  topicId: T,
  conceptId: 'fs-meaning',
  difficulty: 'easy',
  generate: (rng) => {
    const c = rng.pick(USE_CASES);
    const others = rng.shuffle((Object.keys(USERS) as User[]).filter((u) => u !== c.user)).slice(0, 4);
    return {
      prompt: `${c.text(company(rng))} Which users of financial statements, and which use, does this show?`,
      correct: USERS[c.user][0],
      distractors: others.map((u) => ({ text: USERS[u][0], why: `That group reads the statements to ${USERS[u][1]}. Here ${c.point}.` })),
      explanation: `${USERS[c.user][0]}: they read the statements to ${USERS[c.user][1]}. Here ${c.point}.`,
      hints: ['Ask who is reading the statements in this case.', 'Then ask what decision that reader is about to take.'],
    };
  },
  verify: (q) => {
    const hit = USE_CASES.filter((c) => COMPANIES.some((co) => q.prompt.startsWith(c.text(co))));
    return hit.length === 1 && correctText(q) === USERS[hit[0].user][0] && !wrongTexts(q).includes(USERS[hit[0].user][0]);
  },
});

// --- Which limitation? -----------------------------------------------------------------------------------------------------

type Limit = 'cost' | 'window' | 'qualitative' | 'judgement';
/** The limitation as an option, and what it is about, in words that follow "which is about". */
const LIMITS: Record<Limit, [string, string]> = {
  cost: ['Historical cost: changes in the price level are ignored', 'assets and incomes being stated in the rupees of the past'],
  window: ['Window dressing: the figures can be arranged to look better than they are', 'figures being arranged on purpose to mislead'],
  qualitative: ['Qualitative factors are ignored: only what is measured in money is shown', 'things that matter but cannot be stated in money'],
  judgement: ['Personal judgement: many figures rest on estimates and choices of the accountant', 'honest estimates and choices that differ from one accountant to another'],
};
const LIMIT_CASES: { limit: Limit; text: (co: string) => string; point: string }[] = [
  { limit: 'cost', point: 'the figure is a true record of the past, and it is the change in prices that makes it mislead',
    text: (co) => `The balance sheet of ${co} shows its head-office land at the price paid for it in 1998. Similar land now sells for about five times as much.` },
  { limit: 'cost', point: 'nobody has estimated or arranged anything, and the two figures differ only because prices rose between the two purchases',
    text: (co) => `${co} and a rival own factories of the same size and kind. One was built twenty-five years ago and the other last year, so the two balance sheets show very different figures for the same asset.` },
  { limit: 'cost', point: 'the figures are correct in rupees, and it is the fall in the value of the rupee that they do not show',
    text: (co) => `The revenue of ${co} has doubled in ten years. Prices have also doubled over those years, so it sells no more goods than before, but its statements do not show this.` },
  { limit: 'window', point: 'the entries are being timed on purpose so that the position looks better than it is',
    text: (co) => `${co} holds back the recording of goods bought in the last week of March until April, so that its trade payables look smaller on 31 March.` },
  { limit: 'window', point: 'the transaction is arranged only to make the balance sheet date look good',
    text: (co) => `Just before the year end ${co} repays its bank overdraft, and it borrows the same sum again on 2 April, so that its liabilities look low on the balance sheet date.` },
  { limit: 'window', point: 'the figure is being pushed up on purpose, to impress a lender',
    text: (co) => `Before applying for a loan, ${co} knowingly shows its closing inventory at more than its cost so as to report a higher profit.` },
  { limit: 'qualitative', point: 'the loss of skilled people matters to the future of the company but cannot be stated in money',
    text: (co) => `The chief engineer of ${co} and half its design team resigned during the year. Nothing in its financial statements tells a reader so.` },
  { limit: 'qualitative', point: 'good relations with workers and customers cannot be stated in money',
    text: (co) => `The real strengths of ${co} are a record free of strikes and very loyal customers, yet its balance sheet has no figure for either.` },
  { limit: 'qualitative', point: 'a loss of reputation cannot be stated in money, so it is not recorded',
    text: (co) => `A product of ${co} was recalled this year and the name of the company has suffered. Its financial statements show no figure for the loss of reputation.` },
  { limit: 'judgement', point: 'the charge depends on an honest estimate, and estimates differ',
    text: (co) => `The accountant of ${co} estimates the life of a machine as eight years. Another accountant would have taken twelve, and so would have charged less depreciation.` },
  { limit: 'judgement', point: 'the figure rests on an opinion about the future, not on a recorded fact',
    text: (co) => `The provision for doubtful debts of ${co} rests on the opinion of its finance manager about which customers will pay.` },
  { limit: 'judgement', point: 'where the line is drawn between a repair and an improvement is a choice of the accountant',
    text: (co) => `${co} overhauled a machine at a large cost. Whether the cost is charged to this year or added to the machine depends on how its accountant reads the nature of the work.` },
];

const fsLimitationScenario = mcqTemplate({
  id: 'fs-limitation-scenario',
  topicId: T,
  conceptId: 'fs-meaning',
  difficulty: 'medium',
  generate: (rng) => {
    const c = rng.pick(LIMIT_CASES);
    return {
      prompt: `${c.text(company(rng))} Which limitation of financial statements does this show?`,
      correct: LIMITS[c.limit][0],
      distractors: (Object.keys(LIMITS) as Limit[])
        .filter((l) => l !== c.limit)
        .map((l) => ({ text: LIMITS[l][0], why: `Took it for the limitation which is about ${LIMITS[l][1]}. Here ${c.point}.` })),
      explanation: `${LIMITS[c.limit][0]}. Here ${c.point}.`,
      hints: ['Is a figure old, arranged on purpose, estimated, or missing altogether?', 'Old cost is historical cost; arranged on purpose is window dressing; estimated is personal judgement; missing because it cannot be measured is a qualitative factor.'],
    };
  },
  verify: (q) => {
    const hit = LIMIT_CASES.filter((c) => COMPANIES.some((co) => q.prompt.startsWith(c.text(co))));
    return hit.length === 1 && correctText(q) === LIMITS[hit[0].limit][0] && !wrongTexts(q).includes(LIMITS[hit[0].limit][0]);
  },
});

// ---------------------------------------------------------------------------------------------------------------
// Formats: the statements a student prepares
// ---------------------------------------------------------------------------------------------------------------
//
// Every format draws its items from the two banks above, so an item stands in a statement where the questions on it
// say it stands. A statement shows one figure for each sub-head, as the face of a Schedule III statement does, and
// the items behind a figure are its note. Three rulings of the bank hold here too. An item the 2021 amendment moved
// is never listed beside an item of its older sub-head, and that sub-head is then not among the labels on offer.
// Short-term Loans and Advances is not on offer in a statement that has a prepaid expense or an accrued income. And
// no item is listed whose place turns on a fact its name does not give.

const BS_BY_NAME = new Map(BS_ITEMS.map((i) => [i.name, i]));
/** An item of the bank by its name. A name that is not there is a fault of this file, refused when it loads. */
function bsItem(name: string): BsItem {
  const item = BS_BY_NAME.get(name);
  if (!item) throw new Error(`fs: the bank has no item "${name}"`);
  return item;
}
const EQUITY_CAPITAL = bsItem('Equity share capital');
const CALLS_IN_ARREARS = bsItem('Calls in arrears');
const SURPLUS = bsItem('Surplus, i.e. the credit balance of the Statement of Profit and Loss');
const ACCUMULATED_LOSS = bsItem('Debit balance of the Statement of Profit and Loss (accumulated loss)');
const TERM_LOAN = bsItem('Term loan from a bank, repayable after four years');
const CURRENT_MATURITIES = bsItem('Current maturities of long-term borrowings (the part of a term loan repayable within twelve months)');
const BANK_BALANCE = bsItem('Balance in current account with a bank');
const ACCRUED_INTEREST = bsItem('Interest accrued on investments');
const DRR = bsItem('Debenture Redemption Reserve');
const DEBENTURES = bsItem('9% Debentures, redeemable after five years');

/** Items that are deducted within their sub-head. */
const DEDUCTED = new Set<BsItem>([CALLS_IN_ARREARS, ACCUMULATED_LOSS]);
/**
 * Items no format lists: a major head that has no sub-head to stand under, a premium whose term would not agree with
 * the debentures of the bank, and two assets that would make the company hard to believe beside the others.
 */
const NOT_IN_FORMATS = new Set<BsItem>([
  bsItem('Share application money pending allotment (shares will be allotted against it)'),
  bsItem('Premium payable on redemption of debentures (the debentures are redeemable after six years)'),
  bsItem('Livestock'),
  bsItem('Mining rights'),
]);
/** Pairs that one list cannot hold: a surplus and an accumulated loss; a loan due after four years and a part of it due now. */
const NOT_TOGETHER: [BsItem, BsItem][] = [
  [SURPLUS, ACCUMULATED_LOSS],
  [TERM_LOAN, CURRENT_MATURITIES],
];
/**
 * The sub-heads that may not stand in a statement beside an item, as a row or as a label on offer: the place an item
 * had before the 2021 amendment, and Short-term Loans and Advances beside a prepaid expense or an accrued income.
 */
const rulesOut = (i: BsItem): Sub[] => [...(i.moved ? [i.moved] : []), ...(i.sub === 'oca' ? (['stla'] as Sub[]) : [])];

/** What a balance of each sub-head may come to, in whole rupees: least, most and step. */
type Range = [min: number, max: number, step: number];
const FMT_RANGE: Record<Sub, Range> = {
  shareCapital: [500000, 1500000, 100000],
  reserves: [100000, 900000, 50000],
  warrants: [100000, 500000, 50000],
  sam: [100000, 500000, 50000],
  ltb: [300000, 1200000, 100000],
  oltl: [100000, 400000, 10000],
  ltp: [100000, 500000, 10000],
  stb: [100000, 500000, 10000],
  tp: [100000, 600000, 10000],
  ocl: [10000, 90000, 5000],
  stp: [50000, 300000, 10000],
  ppe: [200000, 900000, 50000],
  intangible: [100000, 600000, 10000],
  cwip: [300000, 1200000, 50000],
  iaud: [100000, 500000, 10000],
  nci: [200000, 1000000, 50000],
  ltla: [100000, 600000, 10000],
  onca: [50000, 300000, 10000],
  ci: [100000, 500000, 10000],
  inv: [100000, 700000, 10000],
  tr: [150000, 800000, 10000],
  cash: [50000, 400000, 5000],
  stla: [30000, 200000, 5000],
  oca: [5000, 40000, 1000],
};
const FMT_RANGE_OF = new Map<BsItem, Range>([
  [EQUITY_CAPITAL, [2000000, 6000000, 500000]],
  [CALLS_IN_ARREARS, [10000, 50000, 5000]],
  [bsItem('Balance of Forfeited Shares Account (the shares are not yet reissued)'), [10000, 60000, 5000]],
  [bsItem('Debenture Redemption Reserve'), [50000, 200000, 10000]],
  [CURRENT_MATURITIES, [100000, 400000, 50000]],
  [bsItem('Bills payable'), [50000, 300000, 10000]],
  [bsItem('Plant and machinery'), [800000, 3000000, 100000]],
  [bsItem('Land and building used for the factory'), [1000000, 4000000, 100000]],
  [bsItem('Stores and spares'), [20000, 120000, 5000]],
  [bsItem('Loose tools'), [20000, 120000, 5000]],
  [bsItem('Bills receivable'), [50000, 300000, 10000]],
]);

/** An item with its balance, in whole rupees. */
interface Held {
  item: BsItem;
  rs: number;
}
const signedRs = (h: Held): number => (DEDUCTED.has(h.item) ? -h.rs : h.rs);
const inSub = (s: Sub): BsItem[] => BS_ITEMS.filter((i) => i.sub === s && !NOT_IN_FORMATS.has(i) && !DEDUCTED.has(i));

/**
 * `count` items of one part of the balance sheet: the ones given, and then others, drawn sub-head by sub-head (a
 * sub-head is as likely as its weight) until the list is full. No sub-head takes more than its cap, and no item joins
 * a list it cannot stand in: beside its pair, beside a sub-head it rules out, (interest accrued on investments)
 * without an investment, or (the Debenture Redemption Reserve) without the debentures it is kept for.
 */
function pickItems(rng: Rng, assets: boolean, given: BsItem[], count: number, weights: Partial<Record<Sub, number>>, caps: Partial<Record<Sub, number>>, without: BsItem[] = []): BsItem[] | null {
  const chosen = [...given];
  const pool = BS_ITEMS.filter((i) => onAssetsSide(i) === assets && !NOT_IN_FORMATS.has(i) && !without.includes(i));
  const fits = (i: BsItem): boolean =>
    !chosen.includes(i) &&
    chosen.filter((c) => c.sub === i.sub).length < (caps[i.sub] ?? 1) &&
    !NOT_TOGETHER.some(([a, b]) => (a === i && chosen.includes(b)) || (b === i && chosen.includes(a))) &&
    !chosen.some((c) => rulesOut(c).includes(i.sub) || rulesOut(i).includes(c.sub)) &&
    (i !== ACCRUED_INTEREST || chosen.some((c) => c.sub === 'nci' || c.sub === 'ci')) &&
    (i !== DRR || chosen.includes(DEBENTURES));
  const subs = (Object.keys(weights) as Sub[]).flatMap((s) => Array<Sub>(weights[s] ?? 0).fill(s));
  for (let tries = 0; chosen.length < count && tries < 120; tries++) {
    const sub = rng.pick(subs);
    const open = pool.filter((i) => i.sub === sub && fits(i));
    if (open.length > 0) chosen.push(rng.pick(open));
  }
  return chosen.length === count ? chosen : null;
}

/** A balance for every item. An accumulated loss is kept below the reserves it is deducted from. */
function hold(rng: Rng, chosen: BsItem[]): Held[] {
  const held = chosen.filter((i) => i !== ACCUMULATED_LOSS).map((item) => ({ item, rs: amt(rng, ...(FMT_RANGE_OF.get(item) ?? FMT_RANGE[item.sub])) }));
  if (chosen.includes(ACCUMULATED_LOSS)) {
    const kept = sum(held.filter((h) => h.item.sub === 'reserves').map((h) => h.rs));
    held.push({ item: ACCUMULATED_LOSS, rs: amt(rng, 50000, Math.max(50000, Math.min(300000, kept - 50000)), 10000) });
  }
  return held;
}

const SUB_ORDER = Object.keys(SUBS) as Sub[];
/**
 * The four parts of the sub-head "Property, Plant and Equipment and Intangible Assets", each of which has a figure
 * of its own on the face. A statement names a part as Schedule III names it at (i) to (iv), without the name of the
 * sub-head before it: the short name is the one a student writes, and it fits the width of a phone.
 */
const PPE_PARTS: Partial<Record<Sub, string>> = {
  ppe: 'Property, Plant and Equipment',
  intangible: 'Intangible Assets',
  cwip: 'Capital Work-in-Progress',
  iaud: 'Intangible Assets under Development',
};
/** What a line of a statement is called: the sub-head, or the part of "Property, Plant and Equipment and Intangible Assets". */
const subLabel = (s: Sub): string => PPE_PARTS[s] ?? SUBS[s][1];
const PARTS_OF_PPE = `${Object.values(PPE_PARTS).slice(0, 3).join(', ')} and ${PPE_PARTS.iaud} are the four parts of one sub-head, ${PPE_IA}. Each part that has a balance is a line of its own on the face, with its own figure and note.`;
/** Said in a statement that has one of the four parts. */
const partsWhy = (rows: FaceRow[]): string[] => (rows.some((r) => PPE_PARTS[r.sub] !== undefined) ? [PARTS_OF_PPE] : []);
const EL_MAJORS: Major[] = ['sf', 'ncl', 'cl'];
const ASSET_MAJORS: Major[] = ['nca', 'ca'];

/** One line of the face of the balance sheet: a sub-head, the items under it (in the order of the bank, those deducted last) and its figure. */
interface FaceRow {
  sub: Sub;
  held: Held[];
  rs: number;
}
const faceRows = (held: Held[]): FaceRow[] =>
  SUB_ORDER.flatMap((sub) => {
    const mine = held.filter((h) => h.item.sub === sub).sort((x, y) => BS_ITEMS.indexOf(x.item) - BS_ITEMS.indexOf(y.item));
    const ordered = [...mine.filter((h) => !DEDUCTED.has(h.item)), ...mine.filter((h) => DEDUCTED.has(h.item))];
    return ordered.length > 0 ? [{ sub, held: ordered, rs: sum(ordered.map(signedRs)) }] : [];
  });
const totalOf = (rows: FaceRow[], major?: Major): number => sum(rows.filter((r) => major === undefined || majorOf(r.sub) === major).map((r) => r.rs));

/**
 * One part of the balance sheet as the lines of a statement: its heading, then each major head with its sub-heads as
 * rows, numbered for their notes from `firstNote`, and (where asked) a sub-total after each major head.
 *
 * The major heads carry no numbers and the sub-heads no letters. Schedule III numbers the heads of Equity and
 * Liabilities 1 to 4, the second being Share Application Money Pending Allotment, which no company of these questions
 * has: numbers run on as 1, 2, 3 would give Non-Current Liabilities the number of another head, and the numbers of
 * the Schedule would leave a gap that the screen cannot explain. A letter would change with the sub-heads a company
 * happens to have, and a label the student picks may not carry its own place. So only the two parts are numbered,
 * I and II, which never change.
 */
function facePart(rows: FaceRow[], assets: boolean, firstNote: number, subTotals: boolean): (FormatRowParts | StatementLineParts)[] {
  const out: (FormatRowParts | StatementLineParts)[] = [{ heading: assets ? 'II. ASSETS' : 'I. EQUITY AND LIABILITIES' }];
  let note = firstNote;
  for (const major of assets ? ASSET_MAJORS : EL_MAJORS) {
    const mine = rows.filter((r) => majorOf(r.sub) === major);
    if (mine.length === 0) continue;
    out.push({ heading: MAJOR[major] });
    for (const r of mine) {
      out.push({
        label: subLabel(r.sub),
        amount: rupees(r.rs),
        note: String(note++),
        ...(r.held.length > 1 ? { details: r.held.map((h) => `${DEDUCTED.has(h.item) ? 'Less: ' : ''}${h.item.name} ${inr(h.rs)}`) } : {}),
      });
    }
    if (subTotals) out.push({ subtotal: `Total of ${MAJOR[major]}`, amount: rupees(totalOf(mine)), sum: 'section' });
  }
  return out;
}

/** Why each line of the face holds what it holds: the items added up, and what the bank says of each. */
const faceWhy = (rows: FaceRow[]): string[] =>
  rows.map((r) => {
    const added = r.held.map((h, i) => `${DEDUCTED.has(h.item) ? '- ' : i > 0 ? '+ ' : ''}${h.item.name} ${inr(h.rs)}`).join(' ');
    return `${subLabel(r.sub)}: ${r.held.length > 1 ? `${added} = ${inr(r.rs)}` : inr(r.rs)}. ${r.held.map((h) => h.item.note).join(' ')}`;
  });
const headsWhy = (rows: FaceRow[], majors: Major[], total: string): string =>
  `${majors
    .filter((m) => rows.some((r) => majorOf(r.sub) === m))
    .map((m) => `${MAJOR[m]} ${inr(totalOf(rows, m))}`)
    .join(' + ')} = ${total} ${inr(totalOf(rows))}.`;

type Part = 'el' | 'assets';
const DEFERRED_TAX: Record<Part, string> = { el: 'Deferred Tax Liabilities (Net)', assets: 'Deferred Tax Assets (Net)' };
/**
 * The labels a student may wrongly reach for: the sub-heads of the parts prepared that no item of the list stands
 * under, less those an item of the list rules out, and the deferred tax line of each part.
 */
function spareHeads(held: Held[], parts: Part[]): string[] {
  const used = new Set(held.map((h) => h.item.sub));
  const out = new Set(held.flatMap((h) => rulesOut(h.item)));
  const partOf = (s: Sub): Part => (isAssetMajor(majorOf(s)) ? 'assets' : 'el');
  return [...SUB_ORDER.filter((s) => s !== 'sam' && parts.includes(partOf(s)) && !used.has(s) && !out.has(s)).map(subLabel), ...parts.map((p) => DEFERRED_TAX[p])];
}

const balancesOf = (rng: Rng, held: Held[]): string => lines(rng, held.map((h) => ({ label: h.item.name, rs: h.rs })));

/**
 * A balance sheet, or a part of one, checked from its own text: every balance of the data is looked up in the bank
 * again, the balances are added up sub-head by sub-head, and each must be the one row of that name under its own
 * major head. The sub-totals and totals are added up from the data too, the two totals of a whole balance sheet must
 * be equal, and no sub-head that an item of the list rules out may be on offer.
 */
function faceHolds(q: StatementQuestion, parts: Part[], subTotals: boolean): boolean {
  const listedHere = listed(q.data);
  const held = listedHere.flatMap((l) => {
    const item = BS_BY_NAME.get(l.label);
    return item ? [{ item, rs: l.rs }] : [];
  });
  if (held.length === 0 || held.length !== listedHere.length) return false;
  const want = new Map<Sub, number>();
  for (const h of held) want.set(h.item.sub, (want.get(h.item.sub) ?? 0) + signedRs(h));
  const sheet = q.lines ?? [];
  // The headings are the two parts and the major heads by the names of the form, with no number Schedule III does not give them.
  const majorNames = new Set(Object.values(MAJOR));
  const headings = sheet.flatMap((l) => ('heading' in l ? [l] : []));
  if (!headings.every((l) => majorNames.has(l.heading) || l.heading === 'I. EQUITY AND LIABILITIES' || l.heading === 'II. ASSETS')) return false;
  // The major head a row stands under: the last heading of a major head at or above it.
  const majorAt = (row: number): string | undefined => headings.flatMap((l) => (l.at <= row && majorNames.has(l.heading) ? [l.heading] : [])).at(-1);
  if (q.rows.length !== want.size) return false;
  for (const [sub, rs] of want) {
    const at = q.rows.findIndex((r, i) => r.label === subLabel(sub) && majorAt(i) === MAJOR[majorOf(sub)]);
    if (at < 0 || q.rows[at].amounts.length !== 1 || q.rows[at].amounts[0] !== rupees(rs)) return false;
  }
  const majorTotal = (m: Major): number => sum([...want].filter(([s]) => majorOf(s) === m).map(([, rs]) => rs));
  const figure = (name: string): number[] => sheet.flatMap((l) => ('subtotal' in l && l.subtotal === name ? [l.amounts[0]] : []));
  const majorsOf = (p: Part): Major[] => (p === 'el' ? EL_MAJORS : ASSET_MAJORS);
  if (subTotals && !parts.flatMap(majorsOf).every((m) => figure(`Total of ${MAJOR[m]}`).join() === String(rupees(majorTotal(m))))) return false;
  const totals = parts.map((p) => rupees(sum(majorsOf(p).map(majorTotal))));
  if (figure('Total').join() !== totals.join() || new Set(totals).size !== 1) return false;
  return held.every((h) => rulesOut(h.item).every((s) => !q.labels.includes(subLabel(s)))) && !NOT_TOGETHER.some(([a, b]) => held.some((h) => h.item === a) && held.some((h) => h.item === b));
}

const EL_WEIGHTS: Partial<Record<Sub, number>> = { shareCapital: 4, reserves: 6, warrants: 1, ltb: 4, oltl: 2, ltp: 5, stb: 8, tp: 3, ocl: 8, stp: 8 };
const EL_CAPS: Partial<Record<Sub, number>> = { shareCapital: 2, reserves: 3, ltb: 2, stb: 2, tp: 2, ocl: 2 };
/** The reserves a list starts with: the ones any company of these questions may have. */
const USUAL_RESERVES = [bsItem('Securities Premium'), bsItem('General Reserve'), SURPLUS];
const ONE_FIGURE = 'On the face of the balance sheet a sub-head carries one figure and the number of its note; the items that make it up are listed in that note.';

const fsFmtBsEquityLiabilities = statementTemplate({
  id: 'fs-fmt-bs-equity-liabilities',
  version: 2,
  topicId: T,
  conceptId: 'fs-formats',
  difficulty: 'medium',
  generate: (rng) => {
    const y = rng.pick(YEARS);
    const who = rng.pick(ANY_FIRM);
    const co = who.name;
    // Every major head has an item: the equity capital, a reserve, a long-term borrowing and a trade payable.
    const chosen = pickItems(rng, false, [EQUITY_CAPITAL, rng.pick(USUAL_RESERVES), rng.pick(inSub('ltb')), rng.pick(inSub('tp'))], rng.int(7, 10), EL_WEIGHTS, EL_CAPS);
    if (!chosen) return null;
    const held = hold(rng, chosen);
    const rows = faceRows(held);
    const distractors = spareHeads(held, ['el']);
    // Five sub-heads at least, and three labels to spare.
    if (rows.length < 5 || distractors.length < 3) return null;
    return {
      task: `Prepare the Equity and Liabilities part of the Balance Sheet of ${co} as at 31 March ${y} in the form of Schedule III, with one figure for each sub-head and a sub-total for each major head.`,
      data: `These balances, all of which belong to the Equity and Liabilities part of the balance sheet, were taken from the books of ${firm(who)}, on 31 March ${y}:\n${balancesOf(rng, held)}`,
      title: `Balance Sheet of ${co} as at 31 March ${y} (Equity and Liabilities)`,
      noteHeading: 'Note No.',
      rows: [...facePart(rows, false, 1, true), { subtotal: 'Total', amount: rupees(totalOf(rows)), sum: 'all' }],
      distractors,
      explanation: [...faceWhy(rows), headsWhy(rows, EL_MAJORS, 'Total of Equity and Liabilities'), ONE_FIGURE],
      hints: [
        'Ask of every balance: does it belong to the owners, or is it owed? If it is owed, is it due within twelve months?',
        'Then name the kind of item: capital or a reserve; a borrowing, a payable for goods, a provision, or another amount owed.',
      ],
    };
  },
  verify: (q) => faceHolds(q, ['el'], true),
});

const ASSET_WEIGHTS: Partial<Record<Sub, number>> = { ppe: 4, intangible: 5, cwip: 3, iaud: 2, nci: 5, ltla: 3, onca: 3, ci: 3, inv: 5, tr: 2, cash: 2, stla: 3, oca: 4 };
const ASSET_CAPS: Partial<Record<Sub, number>> = { ppe: 2, intangible: 2, inv: 3, tr: 2, cash: 2 };
/** The inventory a list starts with: goods, not the tools and spares that only go with them. */
const USUAL_INVENTORIES = ['Stock of raw materials', 'Stock of finished goods', 'Stock-in-trade (goods bought for resale)'].map(bsItem);

const fsFmtBsAssets = statementTemplate({
  id: 'fs-fmt-bs-assets',
  topicId: T,
  conceptId: 'fs-formats',
  difficulty: 'medium',
  generate: (rng) => {
    const y = rng.pick(YEARS);
    const co = company(rng);
    // Both major heads have an item: an asset held for use, an inventory, a trade receivable and cash.
    const chosen = pickItems(rng, true, [rng.pick(inSub('ppe')), rng.pick(USUAL_INVENTORIES), rng.pick(inSub('tr')), rng.pick(inSub('cash'))], rng.int(7, 10), ASSET_WEIGHTS, ASSET_CAPS);
    if (!chosen) return null;
    const held = hold(rng, chosen);
    const rows = faceRows(held);
    const distractors = spareHeads(held, ['assets']);
    // Five sub-heads at least, and three labels to spare.
    if (rows.length < 5 || distractors.length < 3) return null;
    return {
      task: `Prepare the Assets part of the Balance Sheet of ${co} as at 31 March ${y} in the form of Schedule III, with one figure for each sub-head and for each part of ${PPE_IA}, and a sub-total for each major head.`,
      data: `These balances, all of which belong to the Assets part of the balance sheet, were taken from the books of ${co} on 31 March ${y}:\n${balancesOf(rng, held)}`,
      title: `Balance Sheet of ${co} as at 31 March ${y} (Assets)`,
      noteHeading: 'Note No.',
      rows: [...facePart(rows, true, 1, true), { subtotal: 'Total', amount: rupees(totalOf(rows)), sum: 'all' }],
      distractors,
      explanation: [...faceWhy(rows), headsWhy(rows, ASSET_MAJORS, 'Total of Assets'), ...partsWhy(rows), ONE_FIGURE],
      hints: [
        'Ask of every asset: will it be realised, sold or used up within twelve months or the operating cycle? If not, it is non-current.',
        'Then name the kind of asset: held for use (with or without a physical form), an investment, a loan or advance, inventory, a receivable, cash, or another asset.',
      ],
    };
  },
  verify: (q) => faceHolds(q, ['assets'], true),
});

/** The large assets one of which every whole balance sheet has, and whose balance may be raised to make the capital a believable one. */
const LARGE_ASSETS = [bsItem('Plant and machinery'), bsItem('Land and building used for the factory')];
/** The inventory a whole balance sheet starts with: its company has a factory, so it holds materials or the goods it has made (goods bought for resale may come besides). */
const FACTORY_INVENTORIES = ['Stock of raw materials', 'Stock of finished goods'].map(bsItem);
/** What a whole balance sheet may be told besides its balances, and why none of it stands on the face. */
interface OffTheFace {
  text: (x: string) => string;
  why: string;
}
const PROPOSED_DIVIDEND: OffTheFace = {
  text: (x) => `The directors have proposed a dividend of ${x} for the year, which the shareholders have yet to approve at the annual general meeting.`,
  why: 'The proposed dividend is not a liability until the shareholders declare it. It is disclosed in the notes to accounts and left out of the balance sheet.',
};
const DISPUTED_CLAIM: OffTheFace = {
  text: (x) => `A customer has claimed damages of ${x} from the company, which disputes the claim and has not accepted it as a debt.`,
  why: 'The disputed claim is a contingent liability, payable only if the court decides against the company. It is disclosed in the notes to accounts and left out of the balance sheet.',
};
const MACHINE_ON_ORDER: OffTheFace = {
  text: (x) => `The company has ordered a machine costing ${x}. The machine has not been delivered, and nothing has been paid or provided for it.`,
  why: 'The machine on order is a commitment, a contract for capital spending still to come. Nothing is owned or owed yet, so it is disclosed in the notes to accounts and left out of the balance sheet.',
};
/** The rates of dividend a board may propose, in percent of the equity share capital. */
const DIVIDEND_RATES = [5, 8, 10, 12];
const CAPITAL_ADVANCES = bsItem('Capital advances (advance paid to a supplier for machinery ordered)');

const fsFmtBalanceSheet = statementTemplate({
  id: 'fs-fmt-balance-sheet',
  version: 2,
  topicId: T,
  conceptId: 'fs-formats',
  difficulty: 'complex',
  generate: (rng) => {
    const y = rng.pick(YEARS);
    const who = rng.pick(MAKERS);
    const co = who.name;
    // The balance of the Statement of Profit and Loss is set last, so it is kept out of the items drawn.
    const el = pickItems(rng, false, [EQUITY_CAPITAL, rng.pick(USUAL_RESERVES.filter((i) => i !== SURPLUS)), rng.pick(inSub('ltb')), rng.pick(inSub('tp'))], rng.int(5, 7), EL_WEIGHTS, EL_CAPS, [SURPLUS, ACCUMULATED_LOSS]);
    const assets = pickItems(rng, true, [rng.pick(LARGE_ASSETS), rng.pick(FACTORY_INVENTORIES), rng.pick(inSub('tr')), BANK_BALANCE], rng.int(6, 8), ASSET_WEIGHTS, ASSET_CAPS);
    if (!el || !assets) return null;
    const owned = hold(rng, assets);
    const owed = hold(rng, el.filter((i) => i !== EQUITY_CAPITAL));
    // The two parts agree by construction. Everything is drawn but the equity capital and the balance of the
    // Statement of Profit and Loss; `gap` is what those two must come to. The capital is the whole lakhs that leave
    // a surplus, or an accumulated loss, of about the size wanted, and that balance is then exactly what is left.
    let gap = sum(owned.map((h) => h.rs)) - sum(owed.map(signedRs));
    const kept = sum(owed.filter((h) => h.item.sub === 'reserves').map((h) => h.rs));
    const lossWanted = amt(rng, 50000, 200000, 10000);
    const surplusWanted = amt(rng, 100000, 600000, 10000);
    // An accumulated loss in about three balance sheets of ten, where the reserves are large enough to stay positive.
    const loss = rng.next() < 0.3 && kept - lossWanted >= 150000;
    let capital = loss ? Math.ceil((gap + lossWanted) / 100000) * 100000 : Math.floor((gap - surplusWanted) / 100000) * 100000;
    if (capital < 1000000) {
      // Too little is left for a capital anyone would believe: the large asset is larger by whole lots of ₹5,00,000.
      const more = Math.ceil((1000000 - capital) / 500000) * 500000;
      owned[0].rs += more;
      gap += more;
      capital += more;
    }
    if (capital > 8000000 || owned[0].rs > 6000000 || gap === capital) return null;
    const result: Held = gap > capital ? { item: SURPLUS, rs: gap - capital } : { item: ACCUMULATED_LOSS, rs: capital - gap };
    const equity: Held[] = [{ item: EQUITY_CAPITAL, rs: capital }, ...owed, result];
    const [elRows, assetRows] = [faceRows(equity), faceRows(owned)];
    const all = [...equity, ...owned];
    const distractors = spareHeads(all, ['el', 'assets']);
    if (totalOf(elRows) !== totalOf(assetRows) || distractors.length < 3) return null;
    // What is told besides the balances, in six balance sheets of ten. A dividend is proposed only out of a surplus
    // that covers it, never by a company with an accumulated loss; and no machine is on order with nothing paid for
    // it where the list has an advance paid for machinery ordered, which would read as the same machine.
    const dividends = result.item === SURPLUS ? DIVIDEND_RATES.map((rate) => (capital * rate) / 100).filter((rs) => rs <= result.rs) : [];
    const extras: (OffTheFace & { rs: number })[] = [
      ...(dividends.length > 0 ? [{ ...PROPOSED_DIVIDEND, rs: rng.pick(dividends) }] : []),
      { ...DISPUTED_CLAIM, rs: amt(rng, 100000, 500000, 10000) },
      ...(all.some((h) => h.item === CAPITAL_ADVANCES) ? [] : [{ ...MACHINE_ON_ORDER, rs: amt(rng, 200000, 800000, 50000) }]),
    ];
    const extra = rng.next() < 0.6 ? rng.pick(extras) : null;
    return {
      task: `Prepare the Balance Sheet of ${co} as at 31 March ${y} in the form of Schedule III, with one figure for each sub-head and for each part of ${PPE_IA}.`,
      data: [`These balances were taken from the books of ${firm(who)}, on 31 March ${y}:`, balancesOf(rng, all), ...(extra ? [`Additional information: ${extra.text(inr(extra.rs))}`] : [])].join('\n'),
      title: `Balance Sheet of ${co} as at 31 March ${y}`,
      noteHeading: 'Note No.',
      rows: [
        ...facePart(elRows, false, 1, false),
        { subtotal: 'Total', amount: rupees(totalOf(elRows)), sum: 'all' },
        ...facePart(assetRows, true, elRows.length + 1, false),
        { subtotal: 'Total', amount: rupees(totalOf(assetRows)), sum: 'block' },
      ],
      distractors,
      explanation: [
        ...faceWhy(elRows),
        headsWhy(elRows, EL_MAJORS, 'Total of Equity and Liabilities'),
        ...faceWhy(assetRows),
        headsWhy(assetRows, ASSET_MAJORS, 'Total of Assets'),
        `The total of Equity and Liabilities and the total of Assets agree at ${inr(totalOf(assetRows))}.`,
        ...(extra ? [extra.why] : []),
        ...partsWhy(assetRows),
        ONE_FIGURE,
      ],
      hints: [
        'Sort the balances first: what belongs to the owners, what is owed, what is owned. Then ask of each liability and asset whether it is current.',
        'Add the balances of one sub-head into one figure. The two totals must agree; if they do not, look for a balance placed in the wrong part or left out.',
      ],
    };
  },
  verify: (q) => faceHolds(q, ['el', 'assets'], false),
});

// --- The Statement of Profit and Loss as a format ---------------------------------------------------------------------

const PL_BY_NAME = new Map(PL_ITEMS.map((i) => [i.name, i]));
/** An item of the bank of the Statement of Profit and Loss by its name; a name that is not there is refused when the file loads. */
function plItem(name: string): PlItem {
  const item = PL_BY_NAME.get(name);
  if (!item) throw new Error(`fs: the bank has no item "${name}"`);
  return item;
}
const SALES = plItem('Sale of products');
const SCRAP = plItem('Sale of scrap by a manufacturing company');
const DIVIDEND = plItem('Dividend received on shares held by a manufacturing company');
const FD_INTEREST = plItem('Interest on fixed deposits earned by a trading company');
const MACHINE_PROFIT = plItem('Profit on sale of an old machine');
const MACHINE_LOSS = plItem('Loss on sale of machinery');
const RESALE_PURCHASES = plItem('Purchases of goods for resale');
const WAGES = plItem('Wages');
const SALARIES = plItem('Salaries');
const PF_CONTRIBUTION = plItem("Employer's contribution to provident fund");
const STAFF_WELFARE = plItem('Staff welfare expenses');
const STAFF_EXTRAS = [plItem('Bonus to employees'), PF_CONTRIBUTION, STAFF_WELFARE, plItem('Gratuity paid to employees'), plItem('Leave encashment paid to employees')];
const DEBENTURE_INTEREST = plItem('Interest on debentures');
const LOAN_INTEREST = plItem('Interest on a term loan from a bank');
const OVERDRAFT_INTEREST = plItem('Interest on bank overdraft');
const ISSUE_COSTS = [plItem('Discount on issue of debentures written off'), plItem('Loss on issue of debentures written off')];
const PLANT_DEPRECIATION = plItem('Depreciation on plant and machinery');
const BUILDING_DEPRECIATION = plItem('Depreciation on office building');
const PATENT_AMORTISATION = plItem('Amortisation of patents');
const GOODWILL_OFF = plItem('Goodwill written off');
const INCOME_TAX = plItem('Income tax on the profit of the year');
/** Expenses only a manufacturer has. */
const FACTORY_EXPENSES = [plItem('Power and fuel'), plItem('Repairs to machinery'), MACHINE_LOSS];
const OFFICE_RENT = plItem('Rent of office premises');
const OTHER_EXPENSE_ITEMS = PL_ITEMS.filter((i) => i.line === 'oe');
/**
 * The other expenses a company may have beside the rest of its list: a trader has no factory, a machine is not sold
 * at a profit and at a loss in one year, and a company that depreciates its own office building pays no office rent.
 */
const otherExpensesFor = (maker: boolean, machineSold: boolean, ownsOffice: boolean): PlItem[] =>
  OTHER_EXPENSE_ITEMS.filter((i) => (maker || !FACTORY_EXPENSES.includes(i)) && !(machineSold && i === MACHINE_LOSS) && !(ownsOffice && i === OFFICE_RENT));

/**
 * What an income is called in a list: the bank says whose income it is ("... by a manufacturing company"), and a list
 * says in its first line what the company does, so the item is written without those words.
 */
const PL_LIST_NAME = new Map<PlItem, string>([
  [SCRAP, 'Sale of scrap'],
  [DIVIDEND, 'Dividend received on shares held'],
  [FD_INTEREST, 'Interest on fixed deposits'],
]);
const listName = (i: PlItem): string => PL_LIST_NAME.get(i) ?? i.name;
const PL_BY_LIST_NAME = new Map([...PL_ITEMS, ...FS_WORDING.values()].map((i) => [listName(i), i]));

/** What each item may come to in a year, in whole rupees. */
const PL_RANGE = new Map<PlItem, Range>(
  (
    [
      ['Sale of scrap by a manufacturing company', [20000, 90000, 5000]],
      ['Dividend received on shares held by a manufacturing company', [10000, 80000, 5000]],
      ['Interest on fixed deposits earned by a trading company', [10000, 80000, 5000]],
      ['Profit on sale of an old machine', [10000, 60000, 5000]],
      ['Wages', [200000, 500000, 10000]],
      ['Salaries', [250000, 600000, 10000]],
      ['Bonus to employees', [30000, 150000, 5000]],
      ["Employer's contribution to provident fund", [20000, 60000, 5000]],
      ['Staff welfare expenses', [10000, 80000, 5000]],
      ['Gratuity paid to employees', [20000, 100000, 5000]],
      ['Leave encashment paid to employees', [10000, 60000, 5000]],
      ['Interest on debentures', [40000, 200000, 5000]],
      ['Interest on a term loan from a bank', [30000, 180000, 5000]],
      ['Interest on bank overdraft', [10000, 60000, 5000]],
      ['Discount on issue of debentures written off', [10000, 60000, 5000]],
      ['Loss on issue of debentures written off', [10000, 60000, 5000]],
      ['Depreciation on plant and machinery', [100000, 300000, 10000]],
      ['Depreciation on office building', [40000, 150000, 5000]],
      ['Amortisation of patents', [20000, 80000, 5000]],
      ['Goodwill written off', [20000, 100000, 5000]],
      ['Rent of office premises', [60000, 240000, 10000]],
      ['Audit fee', [20000, 90000, 5000]],
      ['Bad debts', [10000, 80000, 5000]],
      ['Carriage outwards', [15000, 120000, 5000]],
      ['Power and fuel', [40000, 250000, 10000]],
      ['Advertisement expenses', [30000, 200000, 10000]],
      ['Insurance premium', [10000, 70000, 5000]],
      ['Repairs to machinery', [10000, 80000, 5000]],
      ['Bank charges', [2000, 15000, 1000]],
      ['Loss on sale of machinery', [10000, 60000, 5000]],
      ['Printing and stationery', [5000, 40000, 1000]],
      ['Commission paid to selling agents', [20000, 120000, 5000]],
      ['Rates and taxes', [10000, 60000, 5000]],
      ['Telephone and internet charges', [8000, 40000, 1000]],
    ] as [string, Range][]
  ).map(([name, range]) => [plItem(name), range]),
);
for (const item of OTHER_EXPENSE_ITEMS) if (!PL_RANGE.has(item)) throw new Error(`fs: no range for "${item.name}"`);

/** An item with its figure for the year, in whole rupees. */
interface Charged {
  item: PlItem;
  rs: number;
}
const charge = (rng: Rng, items: PlItem[]): Charged[] => items.map((item) => ({ item, rs: amt(rng, ...PL_RANGE.get(item)!) }));

/** One line of the statement: its figure, the working shown under it in the solution, and why it is what it is. */
interface SplFigure {
  line: PlLine;
  rs: number;
  details?: string[];
  why: string;
}
/** The line that items of the bank add up to, or nothing when there is none of them. */
function figureOf(line: PlLine, charged: Charged[]): SplFigure[] {
  const mine = charged.filter((c) => c.item.line === line);
  if (mine.length === 0) return [];
  const said = mine.map((c) => `${listName(c.item)} ${inr(c.rs)}`);
  const rs = sum(mine.map((c) => c.rs));
  return [{ line, rs, ...(mine.length > 1 ? { details: said } : {}), why: `${mine.length > 1 ? `${said.join(' + ')} = ${inr(rs)}` : said[0]}. ${[...new Set(mine.map((c) => c.item.note))].join(' ')}` }];
}
/** A figure as a statement prints it: a negative one in brackets. */
const bracketed = (rs: number): string => (rs < 0 ? `(${inr(-rs)})` : inr(rs));
/** The change in inventories: opening less closing, and what its sign means. */
function changeFigure(stocks: { kind: string; opening: number; closing: number }[]): SplFigure {
  const [opening, closing] = [sum(stocks.map((s) => s.opening)), sum(stocks.map((s) => s.closing))];
  const each = (pick: (s: { opening: number; closing: number }) => number): string => (stocks.length > 1 ? `${stocks.map((s) => `${s.kind} ${inr(pick(s))}`).join(' + ')} = ` : '');
  const rs = opening - closing;
  return {
    line: 'chg',
    rs,
    details: [`Opening inventory: ${each((s) => s.opening)}${inr(opening)}`, `Less: Closing inventory: ${each((s) => s.closing)}${inr(closing)}`],
    why: `Opening inventory ${inr(opening)} - closing inventory ${inr(closing)} of ${stocks.map((s) => s.kind.toLowerCase()).join(' and ')} = ${bracketed(rs)}. ${rs > 0 ? 'The inventory has fallen, so the figure is added to the expenses.' : 'The inventory has risen, so the figure is negative and reduces the expenses.'}`,
  };
}

const SPL_ORDER: PlLine[] = ['rfo', 'oi', 'cmc', 'pst', 'chg', 'ebe', 'fc', 'dep', 'oe', 'tax'];
const isIncomeLine = (l: PlLine): boolean => l === 'rfo' || l === 'oi';
const NO_GROSS_PROFIT = 'The statement of a company has no trading account, no gross profit and no direct expenses: every expense is placed by what the money was spent on.';

/**
 * The statement from its lines and the tax: the incomes and their total, the expenses under their heading and their
 * total, the profit before tax, the tax expense and the profit for the period the statement ends on. A line the
 * company has no figure for is among the labels on offer, with two names from a trading account.
 */
function splParts(figures: SplFigure[], tax: SplFigure) {
  const ordered = SPL_ORDER.flatMap((l) => figures.filter((f) => f.line === l));
  const incomes = ordered.filter((f) => isIncomeLine(f.line));
  const expenses = ordered.filter((f) => !isIncomeLine(f.line));
  const [income, spent] = [sum(incomes.map((f) => f.rs)), sum(expenses.map((f) => f.rs))];
  let note = 0;
  const row = (f: SplFigure): FormatRowParts => ({ label: lineName(f.line), amount: rupees(f.rs), note: String(++note), ...(f.details ? { details: f.details } : {}) });
  const said = (f: SplFigure): string => `${lineName(f.line)}: ${f.why}`;
  const rows: (FormatRowParts | StatementLineParts)[] = [
    ...incomes.map(row),
    { subtotal: 'Total Income', amount: rupees(income), sum: 'all' },
    { heading: 'Expenses' },
    ...expenses.map(row),
    { subtotal: 'Total Expenses', amount: rupees(spent), sum: 'section' },
    { subtotal: 'Profit before Tax', amount: rupees(income - spent) },
    row(tax),
  ];
  return {
    columns: [{ name: 'Amount (₹)', signed: true }],
    noteHeading: 'Note No.',
    rows,
    final: { label: 'Profit for the period', amount: rupees(income - spent - tax.rs) },
    distractors: [...SPL_ORDER.filter((l) => l !== 'tax' && !figures.some((f) => f.line === l)).map(lineName), 'Gross Profit', 'Direct Expenses'],
    explanation: [
      ...incomes.map(said),
      `Total Income = ${incomes.map((f) => inr(f.rs)).join(' + ')} = ${inr(income)}.`,
      ...expenses.map(said),
      `Total Expenses = ${expenses.map((f, i) => `${i === 0 ? '' : f.rs < 0 ? '- ' : '+ '}${inr(Math.abs(f.rs))}`).join(' ')} = ${inr(spent)}.`,
      `Profit before Tax = Total Income ${inr(income)} - Total Expenses ${inr(spent)} = ${inr(income - spent)}.`,
      said(tax),
      `Profit for the period = Profit before Tax ${inr(income - spent)} - Tax Expense ${inr(tax.rs)} = ${inr(income - spent - tax.rs)}.`,
      NO_GROSS_PROFIT,
    ],
  };
}

/**
 * The figure of every line of the statement, worked out from the text of the data alone: an item of the bank goes to
 * the line the bank gives it, materials are opening inventory and purchases less closing inventory, the change in
 * inventories is opening less closing, debentures are charged their interest at their rate, depreciation and tax are
 * taken at the rates the data states. Nothing is returned for data with a line this cannot read.
 */
export function splFromData(data: string): Map<PlLine, number> | null {
  const first = data.split('\n')[0];
  const maker = first.includes('is a manufacturing company');
  if (maker === first.includes('is a trading company')) return null;
  const want = new Map<PlLine, number>();
  const add = (line: PlLine, rs: number) => want.set(line, (want.get(line) ?? 0) + rs);
  const costs: number[] = [];
  for (const { label, rs } of listed(data)) {
    const item = PL_BY_LIST_NAME.get(label);
    const debentures = /^(\d+)% Debentures \(outstanding for the whole year\)$/.exec(label);
    if (item) {
      // An income the bank gives to one kind of company is not listed for the other.
      if (item.name.includes(maker ? 'trading company' : 'manufacturing company')) return null;
      add(item.line, rs);
    } else if (label === 'Cost of materials consumed' || label === 'Raw materials, opening inventory' || label === 'Purchases of raw materials') add('cmc', rs);
    else if (label === 'Raw materials, closing inventory') add('cmc', -rs);
    else if (/^(Finished goods|Work-in-progress|Stock-in-trade), opening inventory$/.test(label)) add('chg', rs);
    else if (/^(Finished goods|Work-in-progress|Stock-in-trade), closing inventory$/.test(label)) add('chg', -rs);
    else if (debentures) add('fc', (rs * Number(debentures[1])) / 100);
    else if (/^(Plant and machinery|Office building), at cost$/.test(label)) costs.push(rs);
    else return null;
  }
  const depreciation = /Charge depreciation on (?:plant and machinery|the office building) at (\d+)% of cost\./.exec(data);
  if ((depreciation ? 1 : 0) !== costs.length) return null;
  if (depreciation) add('dep', (costs[0] * Number(depreciation[1])) / 100);
  const taxRate = /Provide for income tax at (\d+)% of the profit before tax\./.exec(data);
  if (taxRate) {
    if (want.has('tax')) return null;
    const before = sum([...want].map(([line, rs]) => (isIncomeLine(line) ? rs : -rs)));
    add('tax', (before * Number(taxRate[1])) / 100);
  }
  return want;
}

/**
 * A Statement of Profit and Loss checked against its own data: every line with the figure `splFromData` works out,
 * in the order of the form, the incomes above the heading "Expenses" and the tax below the profit before tax; and
 * the totals, the profit before tax and the profit for the period worked out from those figures.
 */
function splHolds(q: StatementQuestion): boolean {
  const want = splFromData(q.data);
  if (!want) return false;
  const present = SPL_ORDER.filter((l) => (want.get(l) ?? 0) !== 0);
  const sheet = q.lines ?? [];
  const figure = (name: string): string => sheet.flatMap((l) => ('subtotal' in l && l.subtotal === name ? [l.amounts[0]] : [])).join();
  const of = (pick: (l: PlLine) => boolean): number => sum(present.filter(pick).map((l) => want.get(l)!));
  const [income, spent, tax] = [of(isIncomeLine), of((l) => !isIncomeLine(l) && l !== 'tax'), want.get('tax') ?? 0];
  return (
    q.rows.length === present.length &&
    present.every((l, i) => q.rows[i].label === lineName(l) && q.rows[i].amounts.length === 1 && q.rows[i].amounts[0] === rupees(want.get(l)!)) &&
    present.at(-1) === 'tax' &&
    sheet.some((l) => 'heading' in l && l.heading === 'Expenses' && l.at === present.filter(isIncomeLine).length) &&
    figure('Total Income') === String(rupees(income)) &&
    figure('Total Expenses') === String(rupees(spent)) &&
    figure('Profit before Tax') === String(rupees(income - spent)) &&
    tax > 0 &&
    income - spent - tax > 0 &&
    q.final?.amount === rupees(income - spent - tax)
  );
}

/** The share of the revenue that the materials consumed, or the goods bought for resale, take: in percent. */
const MATERIALS_SHARE = [50, 55, 60];
const GOODS_SHARE = [65, 70, 75];
const TAX_RATES = [25, 30];
/**
 * A figure of the list is made a little larger so that the profit before tax is a whole number of twenty thousands,
 * and tax at 25% or 30% of it a round figure. `profit` is the profit before that; what is returned is added to the expense.
 */
const roundingOff = (profit: number): number => ((profit % 20000) + 20000) % 20000;

/** The Statement of Profit and Loss of `fs-fmt-spl`, with the figure of each of its lines, for the case of the analysis stage. */
export interface SplCase {
  parts: StatementParts;
  co: string;
  y: number;
  /** The figure of every line the statement has, the tax among them, in whole rupees. */
  figures: Map<PlLine, number>;
}
/**
 * The scenario and the statement of `fs-fmt-spl`. A case may ask for a trading company under a name of its own, and
 * for one whose expenses are all operating ones but its finance costs (no loss on a sale, nothing written off): the
 * draws that decide these otherwise are made all the same, so the template makes exactly what it made before.
 */
export function splStatement(rng: Rng, opts: { name?: string; trader?: boolean; operating?: boolean; fsWording?: boolean } = {}): SplCase | null {
  const y = rng.pick(YEARS);
  const drawn = company(rng);
  const co = opts.name ?? drawn;
  const maker = rng.next() < 0.6 && !opts.trader;
  const revenue = amt(rng, 5000000, 9500000, 100000);
  const otherIncomes = maker ? some(rng, [DIVIDEND, MACHINE_PROFIT], rng.pick([1, 1, 2])) : [FD_INTEREST];
  const incomes: Charged[] = [{ item: SALES, rs: revenue }, ...charge(rng, [...(maker && rng.next() < 0.6 ? [SCRAP] : []), ...otherIncomes])];
  // A manufacturer is given its materials consumed in one figure; a trader its purchases of goods for resale.
  const basic = (revenue * rng.pick(maker ? MATERIALS_SHARE : GOODS_SHARE)) / 100;
  const stock = { kind: maker ? 'Finished goods' : 'Stock-in-trade', opening: amt(rng, 150000, 600000, 10000), closing: amt(rng, 150000, 600000, 10000) };
  if (stock.opening === stock.closing) return null;
  const staff = maker ? [WAGES, SALARIES, ...some(rng, STAFF_EXTRAS, rng.pick([0, 1]))] : [SALARIES, ...some(rng, STAFF_EXTRAS, rng.pick([1, 2]))];
  const interest = rng.pick([DEBENTURE_INTEREST, LOAN_INTEREST, OVERDRAFT_INTEREST]);
  const second = rng.pick([...[DEBENTURE_INTEREST, LOAN_INTEREST, OVERDRAFT_INTEREST].filter((i) => i !== interest), ...(interest === DEBENTURE_INTEREST ? ISSUE_COSTS : [])]);
  const finance = [[], [interest], [interest], [interest, second]][rng.int(0, 3)];
  const writtenOff = rng.next() < 0.4 && !opts.operating;
  const wear = maker ? [PLANT_DEPRECIATION, ...(writtenOff ? [rng.pick([BUILDING_DEPRECIATION, PATENT_AMORTISATION, GOODWILL_OFF])] : [])] : [BUILDING_DEPRECIATION, ...(writtenOff ? [GOODWILL_OFF] : [])];
  const others = some(rng, otherExpensesFor(maker, otherIncomes.includes(MACHINE_PROFIT), wear.includes(BUILDING_DEPRECIATION)).filter((i) => !(opts.operating && i === MACHINE_LOSS)), rng.pick([3, 3, 4]));
  // `fsWording` (the topic's own template, from version 2) words the items as `fsView` does; the draws are the same.
  const own = (c: Charged): Charged => (opts.fsWording ? { item: fsView(c.item), rs: c.rs } : c);
  const expenses: Charged[] = [...(maker ? [] : [{ item: RESALE_PURCHASES, rs: basic }]), ...charge(rng, [...staff, ...finance, ...wear, ...others]).map(own)];
  const change = changeFigure([stock]);
  const before = (): number => sum(incomes.map((c) => c.rs)) - (maker ? basic : 0) - change.rs - sum(expenses.map((c) => c.rs));
  expenses.find((c) => c.item === SALARIES)!.rs += roundingOff(before());
  const profit = before();
  if (profit < 200000) return null;
  const rate = rng.pick(TAX_RATES);
  const tax: Charged = { item: INCOME_TAX, rs: (profit * rate) / 100 };
  const all = [...incomes, ...expenses, tax];
  const figures: SplFigure[] = [
    ...(['rfo', 'oi', 'pst', 'ebe', 'fc', 'dep', 'oe'] as PlLine[]).flatMap((l) => figureOf(l, all)),
    ...(maker ? [{ line: 'cmc' as const, rs: basic, why: `${inr(basic)}, as given: the raw materials used up in production during the year.` }] : []),
    change,
  ];
  const listedLines: Line[] = [
    ...all.map((c) => ({ label: listName(c.item), rs: c.rs })),
    ...(maker ? [{ label: 'Cost of materials consumed', rs: basic }] : []),
    { label: `${stock.kind}, opening inventory`, rs: stock.opening },
    { label: `${stock.kind}, closing inventory`, rs: stock.closing },
  ];
  const taxed = figureOf('tax', all)[0];
  const parts: StatementParts = {
    task: `Prepare the Statement of Profit and Loss of ${co} for the year ended 31 March ${y} in the form of Schedule III, with one figure for each line and a minus sign before a negative figure.`,
    data: `${co} is a ${maker ? 'manufacturing' : 'trading'} company. These figures are from its books for the year ended 31 March ${y}:\n${lines(rng, listedLines)}`,
    title: `Statement of Profit and Loss of ${co} for the year ended 31 March ${y}`,
    ...splParts(figures, taxed),
    hints: [
      'Sort the list first: what the company earned from its main business, what it earned otherwise, and each expense by what the money was spent on.',
      'Total Income less Total Expenses is the Profit before Tax; taking the tax away leaves the Profit for the period.',
    ],
  };
  return { parts, co, y, figures: new Map([...figures, taxed].map((f): [PlLine, number] => [f.line, f.rs])) };
}
/** A Statement of Profit and Loss checked against its own data (see `splHolds`). */
export const splStatementHolds = (q: StatementQuestion): boolean => splHolds(q);

const fsFmtSpl = statementTemplate({
  id: 'fs-fmt-spl',
  topicId: T,
  conceptId: 'fs-formats',
  difficulty: 'medium',
  version: 2,
  generate: (rng) => splStatement(rng, { fsWording: true })?.parts ?? null,
  verify: splHolds,
});

/** The rates at which the asset of the question is depreciated on its cost: machinery of a manufacturer, the office building of a trader. */
const MACHINERY_RATES = [10, 12];
const BUILDING_RATES = [4, 5];

const fsFmtSplWorked = statementTemplate({
  id: 'fs-fmt-spl-worked',
  version: 2,
  topicId: T,
  conceptId: 'fs-formats',
  difficulty: 'complex',
  generate: (rng) => {
    const y = rng.pick(YEARS);
    const co = company(rng);
    const maker = rng.next() < 0.6;
    const revenue = amt(rng, 5000000, 9500000, 100000);
    const otherIncome = maker ? rng.pick([DIVIDEND, MACHINE_PROFIT]) : FD_INTEREST;
    const incomes: Charged[] = [{ item: SALES, rs: revenue }, ...charge(rng, [otherIncome])];
    // A manufacturer buys raw materials and holds an inventory of them; a trader buys goods for resale.
    const bought = (revenue * rng.pick(maker ? MATERIALS_SHARE : GOODS_SHARE)) / 100;
    const materials = { opening: amt(rng, 200000, 600000, 10000), closing: amt(rng, 200000, 600000, 10000) };
    const consumed = materials.opening + bought - materials.closing;
    const stocks = (maker ? ['Finished goods', ...(rng.next() < 0.5 ? ['Work-in-progress'] : [])] : ['Stock-in-trade']).map((kind) => ({ kind, opening: amt(rng, 100000, 500000, 10000), closing: amt(rng, 100000, 500000, 10000) }));
    const change = changeFigure(stocks);
    if (change.rs === 0) return null;
    const staff = charge(rng, maker ? [WAGES, SALARIES, PF_CONTRIBUTION, STAFF_WELFARE] : [SALARIES, PF_CONTRIBUTION, STAFF_WELFARE]);
    // Debentures whose interest has to be worked out from the rate, with or without interest on an overdraft; or a
    // term loan whose interest is given.
    const debentures = rng.next() < 0.65;
    const rate = rng.pick(DEBENTURE_RATES);
    const face = amt(rng, 500000, 2000000, 100000);
    const coupon = debentures ? (face * rate) / 100 : 0;
    const interest = charge(rng, debentures ? (rng.next() < 0.5 ? [OVERDRAFT_INTEREST] : []) : [LOAN_INTEREST]);
    const asset = maker ? 'Plant and machinery' : 'Office building';
    const wearRate = rng.pick(maker ? MACHINERY_RATES : BUILDING_RATES);
    const cost = maker ? amt(rng, 1500000, 3000000, 100000) : amt(rng, 2000000, 6000000, 100000);
    const wear = (cost * wearRate) / 100;
    const others = charge(rng, some(rng, otherExpensesFor(maker, otherIncome === MACHINE_PROFIT, !maker), 3)).map((c) => ({ item: fsView(c.item), rs: c.rs }));
    const before = (): number => sum(incomes.map((c) => c.rs)) - (maker ? consumed : bought) - change.rs - sum([...staff, ...interest, ...others].map((c) => c.rs)) - coupon - wear;
    staff.find((c) => c.item === SALARIES)!.rs += roundingOff(before());
    const profit = before();
    if (profit < 200000) return null;
    const taxRate = rng.pick(TAX_RATES);
    const tax = (profit * taxRate) / 100;
    const goods: Charged[] = maker ? [] : [{ item: RESALE_PURCHASES, rs: bought }];
    const otherInterest = interest.map((c) => `${listName(c.item)} ${inr(c.rs)}`);
    const financeSaid = [...(debentures ? [`Interest on debentures (${rate}% of ${inr(face)}) ${inr(coupon)}`] : []), ...otherInterest];
    const figures: SplFigure[] = [
      ...(['rfo', 'oi', 'pst', 'ebe', 'oe'] as PlLine[]).flatMap((l) => figureOf(l, [...incomes, ...goods, ...staff, ...others])),
      ...(maker
        ? [
            {
              line: 'cmc' as const,
              rs: consumed,
              details: [`Opening inventory of raw materials ${inr(materials.opening)}`, `Add: Purchases of raw materials ${inr(bought)}`, `Less: Closing inventory of raw materials ${inr(materials.closing)}`],
              why: `Opening inventory ${inr(materials.opening)} + purchases ${inr(bought)} - closing inventory ${inr(materials.closing)} of raw materials = ${inr(consumed)}. Raw materials are dealt with here and never in the changes in inventories.`,
            },
          ]
        : []),
      change,
      {
        line: 'fc',
        rs: coupon + sum(interest.map((c) => c.rs)),
        ...(debentures ? { details: [`Interest on debentures: ${rate}% of ${inr(face)} = ${inr(coupon)}`, ...otherInterest] } : {}),
        why: `${financeSaid.length > 1 ? `${financeSaid.join(' + ')} = ${inr(coupon + sum(interest.map((c) => c.rs)))}` : financeSaid[0]}. ${[...(debentures ? [`${DEBENTURE_INTEREST.note} The debentures themselves are a borrowing in the balance sheet, not an expense.`] : []), ...interest.map((c) => c.item.note)].join(' ')}`,
      },
      {
        line: 'dep',
        rs: wear,
        details: [`${wearRate}% of ${inr(cost)}`],
        why: `${wearRate}% of the cost of ${inr(cost)} = ${inr(wear)}. ${(maker ? PLANT_DEPRECIATION : BUILDING_DEPRECIATION).note} The cost of the asset belongs to the balance sheet.`,
      },
    ];
    const listedLines: Line[] = [
      ...[...incomes, ...goods, ...staff, ...interest, ...others].map((c) => ({ label: listName(c.item), rs: c.rs })),
      ...(maker
        ? [
            { label: 'Raw materials, opening inventory', rs: materials.opening },
            { label: 'Purchases of raw materials', rs: bought },
            { label: 'Raw materials, closing inventory', rs: materials.closing },
          ]
        : []),
      ...stocks.flatMap((s) => [
        { label: `${s.kind}, opening inventory`, rs: s.opening },
        { label: `${s.kind}, closing inventory`, rs: s.closing },
      ]),
      ...(debentures ? [{ label: `${rate}% Debentures (outstanding for the whole year)`, rs: face }] : []),
      { label: `${asset}, at cost`, rs: cost },
    ];
    return {
      task: `Prepare the Statement of Profit and Loss of ${co} for the year ended 31 March ${y} in the form of Schedule III, working each line out from the details given and putting a minus sign before a negative figure.`,
      data: [
        `${co} is a ${maker ? 'manufacturing' : 'trading'} company. These figures are from its books for the year ended 31 March ${y}:`,
        lines(rng, listedLines),
        ...(debentures ? ['Interest on the debentures for the year has not been recorded yet and is to be charged.'] : []),
        `Charge depreciation on ${maker ? 'plant and machinery' : 'the office building'} at ${wearRate}% of cost.`,
        `Provide for income tax at ${taxRate}% of the profit before tax.`,
      ].join('\n'),
      title: `Statement of Profit and Loss of ${co} for the year ended 31 March ${y}`,
      ...splParts(figures, {
        line: 'tax',
        rs: tax,
        details: [`${taxRate}% of ${inr(profit)}`],
        why: `${taxRate}% of the profit before tax of ${inr(profit)} = ${inr(tax)}. ${INCOME_TAX.note}`,
      }),
      hints: [
        'Work out the lines that are not given as one figure: materials consumed, the change in inventories, employee benefits, finance costs and depreciation.',
        'Opening inventory less closing inventory gives the change in inventories. Tax is worked out last, on the profit before tax.',
      ],
    };
  },
  verify: splHolds,
});

// --- A note to accounts as a format -----------------------------------------------------------------------------------

/**
 * The notes that are asked for, each from balances some of which do not belong in it. A note asked for alone has four
 * or five items and three balances that belong elsewhere: a note of three items picked out of five would be thin
 * for the four marks an easy format carries. The two notes on borrowings are asked for together, three or four
 * long-term and three short-term with two balances that belong in neither: the bank holds only three short-term
 * borrowings that every book in use places there, and what the student has to get right is which loan is which.
 */
const NOTE_SETS: Sub[][] = [['reserves'], ['ocl'], ['ppe'], ['intangible'], ['inv'], ['ltb', 'stb']];
const noteSetName = (subs: Sub[]): string => subs.map(subLabel).join(' and ');
/** How many items a note has (least and most) and how many balances that do not belong: asked for alone, and as one of two. */
const NOTE_SIZE = { alone: { rows: [4, 5], strangers: 3 }, paired: { rows: [3, 4], strangers: 2 } } as const;
const noteSize = (subs: Sub[]) => (subs.length === 1 ? NOTE_SIZE.alone : NOTE_SIZE.paired);
const clash = (a: BsItem, b: BsItem): boolean => NOT_TOGETHER.some(([x, y]) => (x === a && y === b) || (x === b && y === a));
/** The items that belong in the note of a sub-head (never one the 2021 amendment moved there). */
const noteItems = (s: Sub): BsItem[] => settled(s).filter((i) => !NOT_IN_FORMATS.has(i));
/** The items of other sub-heads that students wrongly bring to one of the notes asked for (never one the amendment moved). */
const noteStrangers = (subs: Sub[]): BsItem[] => BS_ITEMS.filter((i) => usable(i) && !i.moved && !NOT_IN_FORMATS.has(i) && !subs.includes(i.sub) && i.wrong.some(([s]) => subs.includes(s)));
for (const subs of NOTE_SETS) {
  const size = noteSize(subs);
  if (subs.some((s) => noteItems(s).length < size.rows[0]) || noteStrangers(subs).length < size.strangers) throw new Error(`fs: the bank cannot fill a note on ${noteSetName(subs)}`);
}

const fsFmtNote = statementTemplate({
  id: 'fs-fmt-note',
  version: 2,
  topicId: T,
  conceptId: 'fs-formats',
  difficulty: 'easy',
  generate: (rng) => {
    const y = rng.pick(YEARS);
    const who = rng.pick(MAKERS);
    const co = who.name;
    const subs = rng.pick(NOTE_SETS);
    const alone = subs.length === 1;
    const size = noteSize(subs);
    // The items of each note, none beside its pair, with their balances. A note lists its items in the order of the
    // bank, what is deducted last.
    const notes: FaceRow[] = [];
    for (const sub of subs) {
      const mine: BsItem[] = [];
      const count = rng.int(size.rows[0], size.rows[1]);
      for (const item of rng.shuffle(noteItems(sub))) if (mine.length < count && !mine.some((m) => clash(m, item))) mine.push(item);
      if (mine.length < size.rows[0]) return null;
      notes.push(faceRows(hold(rng, mine))[0]);
    }
    const inNotes = notes.flatMap((n) => n.held);
    // The balances that belong in no note asked for: each is one that students wrongly bring to one of them.
    const strangers = rng
      .shuffle(noteStrangers(subs))
      .filter((i) => !inNotes.some((h) => clash(h.item, i)))
      .slice(0, size.strangers);
    if (strangers.length < size.strangers || strangers.some((a) => strangers.some((b) => clash(a, b)))) return null;
    const outside = hold(rng, strangers);
    const name = noteSetName(subs);
    // The note on reserves always takes a minus sign, whether or not this one has an accumulated loss to deduct.
    const signed = subs.includes('reserves');
    const rowsOf = (n: FaceRow): FormatRowParts[] => n.held.map((h) => ({ label: h.item.name, amount: rupees(signedRs(h)) }));
    const added = (n: FaceRow): string => n.held.map((h, i) => `${DEDUCTED.has(h.item) ? '- ' : i > 0 ? '+ ' : ''}${inr(h.rs)}`).join(' ');
    return {
      task: alone
        ? `From the balances given, prepare the Note to Accounts on ${name} for the Balance Sheet of ${co} as at 31 March ${y}, leaving out every balance that does not belong in it${signed ? ' and putting a minus sign before a figure that is deducted' : ''}.`
        : `From the balances given, prepare the two Notes to Accounts on ${name} for the Balance Sheet of ${co} as at 31 March ${y}, leaving out every balance that belongs in neither.`,
      data: `These balances were taken from the books of ${firm(who)}, on 31 March ${y}. Not all of them belong in the ${alone ? 'note' : 'notes'} on ${name}:\n${balancesOf(rng, [...inNotes, ...outside])}`,
      title: `${alone ? 'Note' : 'Notes'} to Accounts of ${co} as at 31 March ${y}: ${name}`,
      ...(signed ? { columns: [{ name: 'Amount (₹)', signed: true }] } : {}),
      rows: alone
        ? [...rowsOf(notes[0]), { subtotal: 'Total, carried to the balance sheet', amount: rupees(notes[0].rs), sum: 'all' as const }]
        : notes.flatMap((n) => [{ heading: `Note on ${subLabel(n.sub)}` }, ...rowsOf(n), { subtotal: `Total of ${subLabel(n.sub)}, carried to the balance sheet`, amount: rupees(n.rs), sum: 'section' as const }]),
      distractors: strangers.map((i) => i.name),
      explanation: [
        ...inNotes.map((h) => `${h.item.name} ${DEDUCTED.has(h.item) ? `(${inr(h.rs)})` : inr(h.rs)}: ${h.item.note}`),
        ...outside.map((h) => `Left out: ${low(h.item.name)}. ${h.item.note}`),
        ...notes.map((n) => `Total of ${subLabel(n.sub)} = ${added(n)} = ${inr(n.rs)}. This one figure stands against ${subLabel(n.sub)} on the face of the balance sheet, with the number of the note beside it.`),
      ],
      hints: alone
        ? ['Ask of each balance what kind of item it is, and whether that is the kind this note lists.', 'A note lists only the items of its own sub-head; the others have places of their own in the balance sheet.']
        : ['Ask of each balance first whether it is money borrowed at all, and then when it has to be repaid.', 'A borrowing repayable on demand or within twelve months is short-term; one repayable after more than twelve months is long-term.'],
    };
  },
  // Read back from the data: the balances the bank places under the sub-head of each note are the rows of that note,
  // each with its figure, and add up to its total; the others are on offer and are no row; nothing the amendment
  // moved is listed; and each note is of the size its marks call for.
  verify: (q) => {
    const subs = NOTE_SETS.find((set) => q.title.endsWith(`: ${noteSetName(set)}`));
    const balances = listed(q.data);
    const held = balances.flatMap((l) => {
      const item = BS_BY_NAME.get(l.label);
      return item ? [{ item, rs: l.rs }] : [];
    });
    if (!subs || held.length !== balances.length || held.some((h) => h.item.moved)) return false;
    const alone = subs.length === 1;
    const size = noteSize(subs);
    const rest = held.filter((h) => !subs.includes(h.item.sub));
    const sheet = q.lines ?? [];
    const totals = sheet.flatMap((l) => ('subtotal' in l ? [l] : []));
    const headings = sheet.flatMap((l) => ('heading' in l ? [l] : []));
    if (totals.length !== subs.length || totals.at(-1)?.at !== q.rows.length || headings.length !== (alone ? 0 : subs.length)) return false;
    return (
      rest.length === size.strangers &&
      rest.every((h) => q.labels.includes(h.item.name) && h.item.wrong.some(([s]) => subs.includes(s)) && !q.rows.some((r) => r.label === h.item.name)) &&
      subs.every((sub, k) => {
        // The rows of this note: those above its total, back to the total before.
        const from = k === 0 ? 0 : totals[k - 1].at;
        const rows = q.rows.slice(from, totals[k].at);
        const mine = held.filter((h) => h.item.sub === sub);
        const total = sum(mine.map(signedRs));
        return (
          mine.length >= size.rows[0] &&
          mine.length <= size.rows[1] &&
          rows.length === mine.length &&
          mine.every((h) => rows.some((r) => r.label === h.item.name && r.amounts.length === 1 && r.amounts[0] === rupees(signedRs(h)))) &&
          (alone || (headings[k].at === from && headings[k].heading === `Note on ${subLabel(sub)}`)) &&
          total > 0 &&
          totals[k].amounts[0] === rupees(total)
        );
      })
    );
  },
});

// One-mark Assertion-Reason questions of the board. They stand on their own level and go into no mock paper and no
// Look back (`isAssertionReason`), so nothing that was served before moves.
const fsAssertionReason = factsTemplate({
  id: 'fs-assertion-reason', topicId: 'company-financial-statements', conceptId: 'fs-bs-form', difficulty: 'medium',
  facts: assertionReasonFacts([
    {
      answer: 'both',
      assertion: 'A bank overdraft is shown under Short-term Borrowings.',
      reason: 'A bank overdraft is money borrowed from a bank and repayable on demand.',
      a: 'It is a sub-head of Current Liabilities.',
      r: 'The company owes the bank the amount overdrawn.',
      link: 'R explains A: a borrowing repayable on demand is short-term.',
    },
    {
      answer: 'both',
      assertion: 'Capital work-in-progress is shown under Property, Plant and Equipment and Intangible Assets, not under Inventories.',
      reason: 'Capital work-in-progress is a fixed asset being built, not goods held for sale.',
      a: 'It is one of the items of that sub-head of Non-Current Assets.',
      r: 'A factory under construction is an example.',
      link: 'R explains A: what it is to become decides where it is shown.',
    },
    {
      answer: 'both',
      assertion: '₹50,000 of a long-term loan is repayable within twelve months of the balance sheet date. That amount is shown under Short-term Borrowings.',
      reason: 'A liability to be settled within twelve months of the balance sheet date is current.',
      a: 'It is shown as current maturities, and the rest stays under Long-term Borrowings.',
      r: 'Twelve months or the operating cycle is the test.',
      link: 'R explains A: that part of the loan has become current.',
    },
    {
      answer: 'both',
      assertion: 'Opening materials are ₹40,000, purchases of materials ₹3,00,000 and closing materials ₹60,000. Cost of materials consumed is ₹2,80,000.',
      reason: 'Cost of materials consumed = Opening inventory + Purchases - Closing inventory.',
      a: '₹40,000 + ₹3,00,000 - ₹60,000 = ₹2,80,000.',
      r: 'Materials on hand and bought, less what is left, are what was used.',
      link: 'R explains A: the figure is that formula at work.',
    },
    {
      answer: 'both',
      assertion: 'A claim against the company not acknowledged as a debt is not shown in the balance sheet.',
      reason: 'It becomes payable only if an uncertain future event goes against the company.',
      a: 'It is a contingent liability, disclosed in the notes to accounts.',
      r: 'That is what makes a liability contingent.',
      link: 'R explains A: while the event is uncertain there is no liability to put in the balance sheet.',
    },
    {
      answer: 'bothNot',
      assertion: 'Interest on debentures is shown under Finance Costs.',
      reason: 'Profit on the sale of a fixed asset is shown under Other Income.',
      a: 'Finance costs take interest on loans, debentures and overdraft.',
      r: 'It is not revenue from the main business.',
      link: 'R does not explain A: one line of the statement does not explain the other.',
    },
    {
      answer: 'bothNot',
      assertion: 'Financial statements are a blend of recorded facts, accounting conventions and personal judgements.',
      reason: 'The financial statements of a company are prepared in the form of Schedule III.',
      a: 'Recorded facts come from the books, conventions are the agreed rules, and judgements are the estimates of the accountant.',
      r: 'Schedule III to the Companies Act, 2013 sets the form.',
      link: 'R does not explain A: the form sets how they are laid out, not what they are made of.',
    },
    {
      answer: 'bothNot',
      assertion: 'Revenue from operations is ₹10,00,000 and other income ₹50,000. Total income is ₹10,50,000.',
      reason: 'Sale of scrap is shown under revenue from operations.',
      a: 'Total Income = Revenue from Operations + Other Income.',
      r: 'It is an other operating revenue.',
      link: 'R does not explain A: the total comes from adding the two lines, and what goes into one of them does not say so.',
    },
    {
      answer: 'aOnly',
      assertion: 'Provision for tax is shown under Short-term Provisions.',
      reason: 'A provision is a part of the profit kept back as a reserve.',
      a: 'It is an estimated amount set aside for a liability, due within twelve months.',
      r: 'A provision is set aside for a liability; profit kept back is a reserve.',
    },
    {
      answer: 'aOnly',
      assertion: 'Stock-in-trade of ₹2,00,000 held by a trading company is shown under Inventories.',
      reason: 'Stock-in-trade is an investment held for the long term.',
      a: 'Stock-in-trade is one of the items of Inventories.',
      r: 'It is goods held for sale, not an investment.',
    },
    {
      answer: 'rOnly',
      assertion: 'An unpaid dividend of ₹25,000 is shown under Short-term Provisions.',
      reason: 'An unpaid dividend is a known amount owed, not an estimate.',
      a: 'It is shown under Other Current Liabilities, not Short-term Provisions.',
      r: 'The company knows the exact amount it owes the shareholders; a provision is an estimate of a liability.',
    },
    {
      answer: 'rOnly',
      assertion: 'A cash credit from a bank is shown under Cash and Cash Equivalents.',
      reason: 'Under a cash credit, a company borrows from a bank up to a limit.',
      a: 'It is a borrowing, shown under Short-term Borrowings.',
      r: 'The word "cash" in the name misleads; the company owes the money.',
    },
  ]),
});

// ---------------------------------------------------------------------------------------------------------------
// Added after the papers were set (outside the mock papers, the worksheets and Look back: generators/outsidePapers.ts):
// items the bank above does not hold, and the two notes of the balance sheet whose figure is found by a deduction.
// They draw on banks of their own, so no question served before moves.
// ---------------------------------------------------------------------------------------------------------------

/** Items of the balance sheet asked about only here: reserves and liabilities the bank lacks, and the two deductions. */
const MORE_ITEMS: BsItem[] = [
  { name: 'Revaluation Reserve (the gain on revaluing land)', sub: 'reserves',
    note: "A gain on revaluing an asset is not a profit earned in trading; it is kept as a reserve: Shareholders' Funds, Reserves and Surplus.",
    wrong: [
      ['shareCapital', 'Added the gain on revaluation to share capital. No shares were issued for it; it is a reserve.'],
      ['ppe', 'Put the reserve with the land that was revalued. The land stands under Property, Plant and Equipment at its new value; the gain is a reserve on the other side.'],
      ['oltl', 'Treated the gain as an amount owed to someone. Nothing is owed; it belongs to the shareholders.'],
    ] },
  { name: 'Unpaid matured debentures and interest accrued on them', sub: 'ocl',
    note: 'Debentures that have fallen due and are still unpaid, with the interest on them, are owed now. Schedule III lists them under Current Liabilities, Other Current Liabilities.',
    wrong: [
      ['ltb', 'Kept them with the debentures still running. These have matured and are owed now, so they are not long-term.'],
      ['stb', 'Schedule III does not count matured debentures as a borrowing still running: it lists them, with the interest on them, under other current liabilities.'],
      ['tp', 'Debentureholders are lenders, not suppliers of goods and services.'],
    ] },
  { name: 'Advance received from customers against orders', sub: 'ocl',
    note: 'Money received before the goods are supplied is owed back in goods (or in money, if the order fails): Current Liabilities, Other Current Liabilities.',
    wrong: [
      ['tr', 'Took it for an amount due from customers. The company has received this money; it owes the goods.'],
      ['stla', 'Went by the word "advance". An advance the company has received is a liability, not an advance it has given.'],
      ['tp', 'Trade payables are owed to suppliers. This amount is owed to customers.'],
    ] },
  { name: 'Unclaimed dividend', sub: 'ocl',
    note: 'A dividend declared and not yet claimed by some shareholders is a known amount owed to them: Current Liabilities, Other Current Liabilities.',
    wrong: [
      ['stp', 'A dividend already declared is a fixed amount owed, not an estimate, so it is not a provision.'],
      ['reserves', 'Once declared, the dividend has left the surplus and is owed to the shareholders.'],
      ['tp', 'Shareholders are not suppliers. Trade payables are owed for goods and services bought.'],
    ] },
  { name: 'Provision for warranty claims expected within the coming year', sub: 'stp',
    note: 'An estimate of what will be spent on repairs under warranty in the coming year is a provision payable within twelve months: Current Liabilities, Short-term Provisions.',
    wrong: [
      ['ocl', 'Took an estimate for a known amount owed. The claims have not been made yet; the amount is estimated, so it is a provision.'],
      ['ltp', 'Took the provision as long-term. The claims are expected within the coming year.'],
      ['reserves', 'Mixed a provision with a reserve. A provision meets a liability; a reserve is profit kept back.'],
    ] },
  { name: 'Debentures of another company, held as an investment for the next three years', sub: 'nci',
    note: 'Debentures that the company holds are an investment, and one to be held for more than twelve months is non-current: Non-Current Assets, Non-current Investments.',
    wrong: [
      ['ltb', "Mixed the debentures the company holds with debentures it has issued. These are another company's debentures, owned as an investment."],
      ['ci', 'Took the debentures as realisable within twelve months. They are to be held for three years.'],
      ['ltla', 'Buying debentures is investing in them, not giving a loan or an advance.'],
    ] },
  { name: 'Accumulated depreciation on plant and machinery', sub: 'ppe',
    note: `Accumulated depreciation is deducted from the cost of the machinery in the note on Property, Plant and Equipment, so it is dealt with under Non-Current Assets, ${PPE_IA}, Property, Plant and Equipment.`,
    wrong: [
      ['ltp', 'Showed accumulated depreciation as a provision on the liabilities side. It is deducted from the cost of the asset.'],
      ['reserves', 'Took depreciation charged for profit set aside. It is the part of the cost of the machine already used up, deducted from that cost.'],
      ['oltl', 'Treated accumulated depreciation as an amount owed. Nothing is owed; it reduces the asset.'],
    ] },
  { name: 'Provision for doubtful debts', sub: 'tr',
    note: 'Schedule III deducts the allowance for bad and doubtful debts from trade receivables in their note, so it is dealt with under Current Assets, Trade Receivables.',
    wrong: [
      ['stp', 'Showed the provision as a liability. It is not owed to anyone; it is deducted from the trade receivables it is made against.'],
      ['reserves', 'Took the provision for profit kept back. It is an estimate of debts that may not be received, deducted from them.'],
      ['ocl', 'Treated the provision as an amount owed. It reduces the amount the customers are expected to pay.'],
    ] },
];
for (const item of MORE_ITEMS) {
  const subs = item.wrong.map(([s]) => s);
  if (subs.length < 3 || subs.includes(item.sub) || new Set(subs).size !== subs.length) throw new Error(`fs: the wrong heads of "${item.name}" are not three different ones`);
}
/** The items of `MORE_ITEMS` dealt with by a deduction within their sub-head. */
const DEDUCTED_MORE = ['Accumulated depreciation on plant and machinery', 'Provision for doubtful debts'];

const fsBsItemMore = mcqTemplate({
  id: 'fs-bs-item-more',
  topicId: T,
  conceptId: 'fs-bs-form',
  difficulty: 'medium',
  generate: (rng) => {
    const item = rng.pick(MORE_ITEMS);
    const who = rng.pick(MAKERS);
    const deducted = DEDUCTED_MORE.includes(item.name);
    return {
      prompt: `${firm(who)}, is preparing its balance sheet as per Schedule III. Its books show "${item.name}". Under which major head and sub-head is it ${deducted ? 'dealt with' : 'shown'}?`,
      correct: headOf(item.sub),
      distractors: item.wrong.map(([s, why]) => ({ text: headOf(s), why })),
      explanation: item.note,
      hints: [
        'Ask first whether the item belongs to the owners, is owed to someone, or is owned; or whether it only reduces something that is owned.',
        'Then ask when it falls due and what kind of item it is. An item that reduces an asset is deducted under that asset\'s own sub-head.',
      ],
    };
  },
  // The item is read back from the prompt: the right option is its head, and no wrong option is.
  verify: (q) => {
    const found = MORE_ITEMS.filter((i) => q.prompt.includes(`"${i.name}"`));
    return found.length === 1 && correctText(q) === headOf(found[0].sub) && !wrongTexts(q).includes(headOf(found[0].sub));
  },
});

const fsTotalTradeReceivables = numericTemplate({
  id: 'fs-total-trade-receivables',
  topicId: T,
  conceptId: 'fs-bs-assets',
  difficulty: 'medium',
  unit: 'rupees',
  generate: (rng) => {
    const who = rng.pick(MAKERS);
    const debtors = amt(rng, 300000, 1200000, 50000);
    const bills = amt(rng, 50000, 300000, 10000);
    const provision = (debtors * rng.pick([2, 4, 5])) / 100;
    const traps: Trap[] = some<TrapEntry>(rng, [
      ['Bills payable', 50000, 250000, 10000, 'are owed by the company to its suppliers: trade payables'],
      ['Advance paid to suppliers for raw materials', 20000, 150000, 10000, 'is a short-term loan and advance: the company has paid it, nothing has been sold'],
      ['Trade receivables falling due 30 months after the balance sheet date', 50000, 200000, 10000, 'fall due after both twelve months and the operating cycle, so they are other non-current assets'],
    ], 2).map((e) => trap(rng, e));
    const answer = debtors + bills - provision;
    return numeric(
      `From these balances of ${firm(who)}, find the figure shown against Current Assets: Trade Receivables in its balance sheet. Its operating cycle is twelve months.\n${lines(rng, [
        { label: 'Sundry debtors for goods sold', rs: debtors },
        { label: 'Bills receivable', rs: bills },
        { label: 'Provision for doubtful debts', rs: provision },
        ...traps,
      ])}`,
      answer,
      [
        { value: debtors + bills, why: 'Did not deduct the provision for doubtful debts. Schedule III deducts it from trade receivables in their note.' },
        { value: debtors + bills + provision, why: 'Added the provision. It is an estimate of debts that may not be received, so it is deducted.' },
        { value: debtors - provision, why: 'Left out the bills receivable. A bill received from a customer for goods sold is a trade receivable.' },
        ...traps.map((t) => ({ value: answer + t.rs, why: `Counted "${low(t.label)}", which ${t.where}.` })),
      ],
      [
        'Trade receivables = sundry debtors + bills receivable - provision for doubtful debts.',
        `${inr(debtors)} + ${inr(bills)} - ${inr(provision)} = ${inr(answer)}.`,
        ...traps.map((t) => `Left out: ${low(t.label)}, which ${t.where}.`),
      ],
      [
        'Keep only the amounts due from customers for goods sold within the operating cycle, and what is set aside against them.',
        'Trade receivables = debtors + bills receivable - provision for doubtful debts. Bills payable, advances paid and long-term receivables have places of their own.',
      ],
    );
  },
  verify: (q) => answerRs(q) === oneWhere(q.prompt, /^Sundry debtors/) + oneWhere(q.prompt, /^Bills receivable/) - oneWhere(q.prompt, /^Provision for doubtful debts/),
});

const fsTotalPpe = numericTemplate({
  id: 'fs-total-ppe',
  topicId: T,
  conceptId: 'fs-bs-assets',
  difficulty: 'medium',
  unit: 'rupees',
  generate: (rng) => {
    const who = rng.pick(MAKERS);
    const building = amt(rng, 1000000, 4000000, 100000);
    const cost = amt(rng, 1500000, 4000000, 100000);
    const worn = (cost * rng.pick([20, 25, 30, 40])) / 100;
    const furniture = amt(rng, 100000, 500000, 10000);
    const traps: Trap[] = some<TrapEntry>(rng, [
      ['Capital work-in-progress (a new shed being built)', 200000, 900000, 50000, 'is an asset not yet ready for use: Capital Work-in-Progress, a part of its own'],
      ['Loose tools', 20000, 120000, 5000, 'are listed by Schedule III under inventories'],
      ['Patents', 100000, 400000, 10000, 'have no physical form: Intangible Assets'],
      ['Capital advances (paid to a supplier for a machine ordered)', 100000, 500000, 10000, 'are a long-term loan and advance: the machine has not been received'],
    ], 2).map((e) => trap(rng, e));
    const net = cost - worn;
    const answer = building + net + furniture;
    return numeric(
      `From these balances of ${firm(who)}, find the figure shown against Property, Plant and Equipment in its balance sheet.\n${lines(rng, [
        { label: 'Land and building used for the factory', rs: building },
        { label: 'Plant and machinery, at cost', rs: cost },
        { label: 'Accumulated depreciation on plant and machinery', rs: worn },
        { label: 'Furniture and fixtures', rs: furniture },
        ...traps,
      ])}`,
      answer,
      [
        { value: building + cost + furniture, why: 'Showed the plant and machinery at cost. The accumulated depreciation is deducted from it in the note.' },
        { value: answer + 2 * worn, why: 'Added the accumulated depreciation. It is the part of the cost already used up, so it is deducted.' },
        { value: answer - furniture, why: 'Left out the furniture and fixtures, which are tangible assets held for use.' },
        ...traps.map((t) => ({ value: answer + t.rs, why: `Counted "${low(t.label)}", which ${t.where}.` })),
      ],
      [
        `Plant and machinery: cost ${inr(cost)} - accumulated depreciation ${inr(worn)} = ${inr(net)}.`,
        `Property, Plant and Equipment = land and building ${inr(building)} + plant and machinery ${inr(net)} + furniture and fixtures ${inr(furniture)} = ${inr(answer)}.`,
        ...traps.map((t) => `Left out: ${low(t.label)}, which ${t.where}.`),
      ],
      [
        'Keep only tangible assets that are ready and in use, and bring each to its net figure.',
        'Property, Plant and Equipment = each such asset at cost - its accumulated depreciation. Assets being built, intangibles, loose tools and advances have places of their own.',
      ],
    );
  },
  verify: (q) =>
    answerRs(q) ===
    oneWhere(q.prompt, /^Land and building/) + oneWhere(q.prompt, /^Plant and machinery, at cost/) - oneWhere(q.prompt, /^Accumulated depreciation/) + oneWhere(q.prompt, /^Furniture/),
});

const templates: Template[] = [
  fsFormFacts, fsMeaningFacts, fsUseScenario, fsLimitationScenario,
  fsBsMajorHead, fsElSubHead, fsAssetsSubHead, fsElSubHeadTricky, fsAssetsSubHeadTricky, fsElWhichUnder, fsAssetsWhichUnder, fsBsTwoItems,
  fsCncOperatingCycle, fsCncDueDate, fsCncSplitAmount, fsCncLoanInstalments,
  fsSplLine, fsSplWhichUnder, fsSplIncomeKind, fsSplChangeInventories,
  fsSplMaterialsConsumed, fsSplTotalIncome, fsSplEmployeeBenefits, fsSplOtherExpenses, fsSplFinanceCosts, fsSplFinanceCostsPremium, fsSplProfitBeforeTax,
  fsTotalInventories, fsTotalCashEquivalents, fsTotalShortTermBorrowings, fsTotalOtherCurrentLiabilities, fsTotalCurrentLiabilities, fsTotalReservesSurplus,
  fsNoteShareCapital, fsTotalShareholdersFunds,
  fsContingentKind, fsContingentTotal,
  fsFmtBsEquityLiabilities, fsFmtBsAssets, fsFmtBalanceSheet, fsFmtSpl, fsFmtSplWorked, fsFmtNote,
  fsAssertionReason,
  fsBsItemMore, fsTotalTradeReceivables, fsTotalPpe,
];

export default templates;

/**
 * What the integrated case studies of the company-year stage (`src/generators/cases/company-year.ts`) reuse of this
 * topic: the place of an item in the balance sheet and the names of the lines of the Statement of Profit and Loss.
 * Only exported here; nothing in this file uses the object, so no question of the topic changes.
 */
export const FS_CASE = { headOf, lineName, PPE_IA, MAJOR };
