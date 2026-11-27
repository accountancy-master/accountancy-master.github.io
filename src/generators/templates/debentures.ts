import type { JournalQuestion, JournalSetQuestion, McqQuestion } from '@/content/types';
import { debentures, isParty, resolveAccount, vendor } from '@/engine/accounts';
import { accountOf, balanceOf, ledgerLabel, post, type DatedEntry } from '@/engine/books';
import type { JournalLine } from '@/engine/journal';
import type { Rng } from '@/engine/rng';
import { assertionReasonFacts, factsTemplate, accountTemplate, formatINR, journalSetTemplate, journalTemplate, keepFor, ledgerPeriods, ledgerSides, mcqTemplate, numericTemplate, rupees, setDays, setHolds, statementTemplate } from '../authoring';
import type { FormatRowParts, McqParts, NumericParts, SetTransaction, StatementLineParts, Template } from '../types';

const T = 'debentures';

// ---------------------------------------------------------------------------------------------------------------
// Conventions used throughout (and stated in the prompts that rely on them):
//  - only the ISSUE of debentures is in the syllabus: no entry of redemption is ever asked. A premium payable on
//    redemption is provided for at the time of issue (Loss on Issue of Debentures A/c, Premium on Redemption of
//    Debentures A/c);
//  - a discount on issue alone goes to Discount on Issue of Debentures A/c; where a premium is payable on redemption
//    the whole loss (discount, if any, plus the premium on redemption) goes to Loss on Issue of Debentures A/c, and
//    the prompt of an entry says so;
//  - the discount or loss is written off in the year of allotment, first from Securities Premium and then from the
//    Statement of Profit and Loss;
//  - interest is on the nominal value, is paid in full (no tax is deducted at source) and, unless a prompt says
//    otherwise, falls due half-yearly on 30 September and 31 March; the accounting year ends on 31 March;
//  - a lump sum received with the application goes through Debenture Application and Allotment A/c; money payable
//    in two instalments goes through Debenture Application A/c and Debenture Allotment A/c;
//  - every figure is in whole rupees: the face values, rates and numbers drawn make it so, and a seed is rejected
//    otherwise.
// ---------------------------------------------------------------------------------------------------------------

/** Whole rupees as the amount text a learner sees. */
const inr = (n: number): string => formatINR(rupees(n));
const GROUPED = new Intl.NumberFormat('en-IN');
/** A number of debentures with Indian grouping: 12,000. */
const count = (n: number): string => GROUPED.format(n);
const toInt = (s: string): number => Number(s.replace(/,/g, ''));
const amountsIn = (s: string): number[] => (s.match(/₹\d[\d,]*/g) ?? []).map((x) => toInt(x.slice(1)));
const optionText = (q: McqQuestion): string => q.options.find((o) => o.id === q.correct)?.text ?? '';
const capitalise = (s: string): string => s.charAt(0).toUpperCase() + s.slice(1);
const lowerFirst = (s: string): string => s.charAt(0).toLowerCase() + s.slice(1);

const COMPANIES = [
  'Sagar Mills Ltd.', 'Narmada Textiles Ltd.', 'Himgiri Steels Ltd.', 'Konark Cements Ltd.', 'Deccan Tools Ltd.',
  'Kaveri Paper Mills Ltd.', 'Aravali Motors Ltd.', 'Nilgiri Tea Estates Ltd.', 'Vindhya Chemicals Ltd.', 'Godavari Foods Ltd.',
];
const VENDORS = ['Sharma Traders', 'Mehta Engineering Works', 'Lakshmi Industries', 'Bose & Sons', 'Iyer Machines', 'Khanna Brothers'];
const INVESTORS = ['Asha', 'Bimal', 'Farida', 'Gurpreet', 'Kavita', 'Naveen', 'Sunita', 'Thomas'];
const RATES = [6, 7, 8, 9, 10, 11, 12];

/** One issue of debentures. The premium, the discount and the premium on redemption are rupees per debenture. */
interface Issue {
  n: number;
  rate: number;
  face: number;
  prem: number;
  disc: number;
  red: number;
}
type IssueAt = 'par' | 'premium' | 'discount';

/**
 * An issue whose nominal value is a whole number of lakhs, so that interest for a year, a half-year or a quarter is
 * in whole rupees at every rate, and whose premium, discount and premium on redemption are whole rupees a debenture.
 */
function drawIssue(rng: Rng, at: IssueAt, redeemAtPremium = false): Issue {
  const face = rng.pick([100, 100, 100, 100, 500, 1000]);
  const n = face === 100 ? rng.step(1000, 20000, 1000) : face === 500 ? rng.step(200, 4000, 200) : rng.step(100, 2000, 100);
  return {
    n,
    rate: rng.pick(RATES),
    face,
    prem: at === 'premium' ? (face * rng.pick([4, 5, 6, 8, 10, 20])) / 100 : 0,
    disc: at === 'discount' ? (face * rng.pick([2, 4, 5, 6, 8, 10])) / 100 : 0,
    red: redeemAtPremium ? (face * rng.pick([4, 5, 6, 8, 10])) / 100 : 0,
  };
}
const priceOf = (i: Issue): number => i.face + i.prem - i.disc;
const nominalOf = (i: Issue): number => i.n * i.face;
const pctOf = (i: Issue, perDebenture: number): number => (perDebenture * 100) / i.face;

/** "5,000, 9% Debentures of ₹100 each". */
const lot = (i: Issue): string => `${count(i.n)}, ${i.rate}% Debentures of ${inr(i.face)} each`;
/** "at par", "at a premium of 10%", "at a discount of ₹5 per debenture". */
const issueTerms = (rng: Rng, i: Issue): string => {
  if (i.prem > 0) return rng.pick([`at a premium of ${pctOf(i, i.prem)}%`, `at a premium of ${inr(i.prem)} per debenture`]);
  if (i.disc > 0) return rng.pick([`at a discount of ${pctOf(i, i.disc)}%`, `at a discount of ${inr(i.disc)} per debenture`]);
  return 'at par';
};
/** "redeemable at a premium of 10% after 5 years" or "redeemable at par after 5 years". */
const redTerms = (i: Issue, years: number): string => `redeemable ${i.red > 0 ? `at a premium of ${pctOf(i, i.red)}%` : 'at par'} after ${years} years`;

/**
 * The issue a prompt describes, read back from its words for `verify`: the lot ("5,000, 9% Debentures of ₹100
 * each"), then the terms of issue, then (if any) the terms of redemption.
 */
function parseIssue(s: string): Issue | null {
  const m = /([\d,]+), (\d+)% Debentures of ₹([\d,]+) each/.exec(s);
  if (!m) return null;
  const n = toInt(m[1]), rate = Number(m[2]), face = toInt(m[3]);
  const rest = s.slice(m.index + m[0].length);
  const redM = /redeemable at (par|a premium of (\d+)%)/.exec(rest);
  const at = /at (par|a (premium|discount) of (?:(\d+)%|₹([\d,]+) per debenture))/.exec(redM ? rest.slice(0, redM.index) : rest);
  if (!at) return null;
  const per = at[3] ? (face * Number(at[3])) / 100 : at[4] ? toInt(at[4]) : 0;
  return { n, rate, face, prem: at[2] === 'premium' ? per : 0, disc: at[2] === 'discount' ? per : 0, red: redM?.[2] ? (face * Number(redM[2])) / 100 : 0 };
}

/** A wrong figure that is offered only when it is a whole positive number; otherwise 0, which `numeric` drops. */
const whole = (v: number): number => (v > 0 && Math.abs(v - Math.round(v)) < 1e-9 ? Math.round(v) : 0);

/** A numeric question's answer and errors, in the unit's scale (100 for rupees). Null when fewer than two distinct errors remain. */
function numeric(answer: number, errs: [number, string][], scale = 100): Pick<NumericParts, 'answer' | 'commonErrors'> | null {
  if (!(answer > 0) || Math.abs(answer - Math.round(answer)) > 1e-9) return null;
  const a = Math.round(answer) * scale;
  const seen = new Set([a]);
  const commonErrors: { value: number; why: string }[] = [];
  for (const [v, why] of errs) {
    const p = whole(v) * scale;
    if (p > 0 && Number.isSafeInteger(p) && !seen.has(p) && seen.add(p)) commonErrors.push({ value: p, why });
  }
  return commonErrors.length >= 2 ? { answer: a, commonErrors } : null;
}

/** A multiple-choice question; null when fewer than three distinct wrong options remain. */
function choice(prompt: string, correct: string, wrong: [string, string][], explanation: string, hints?: string[]): McqParts | null {
  const seen = new Set([correct]);
  const distractors: { text: string; why: string }[] = [];
  for (const [text, why] of wrong) if (!seen.has(text) && seen.add(text)) distractors.push({ text, why });
  if (distractors.length < 3) return null;
  return { prompt, correct, distractors, explanation, ...(hints ? { hints } : {}) };
}

const dr = (accountId: string, r: number): JournalLine => ({ accountId, side: 'Dr', amount: rupees(r) });
const cr = (accountId: string, r: number): JournalLine => ({ accountId, side: 'Cr', amount: rupees(r) });
/** The lines of an entry, without those that come to nothing (no premium, no discount). */
const entry = (...lines: JournalLine[]): JournalLine[] => lines.filter((l) => l.amount > 0);
/** What an entry posts to an account on a side, in rupees (0 when it does not name it). */
const posted = (q: JournalQuestion, accountId: string, side: 'Dr' | 'Cr'): number =>
  q.expected.filter((l) => l.accountId === accountId && l.side === side).reduce((t, l) => t + l.amount, 0) / 100;
/** True when an entry is exactly these postings: [account, side, rupees], those of 0 left out. */
const isEntry = (q: JournalQuestion, want: [string, 'Dr' | 'Cr', number][]): boolean => {
  const lines = want.filter(([, , r]) => r > 0);
  return lines.length === q.expected.length && lines.every(([id, side, r]) => posted(q, id, side) === r);
};

const H = {
  issue: ['Debentures A/c is always credited with the nominal (face) value.', 'Money received = number of debentures x issue price; a premium goes to Securities Premium A/c, a discount to Discount on Issue of Debentures A/c.'],
  vendor: ['The vendor takes each debenture at its issue price, not at its face value.', 'Number of debentures = amount to be settled / issue price of one debenture.'],
  cases: ['Loss on issue = discount allowed on issue + premium payable on redemption.', 'A premium received on issue is a gain: it goes to Securities Premium A/c and is not set off against the loss in the entry.'],
  collateral: ['Collateral debentures are only an additional security for a loan: no money is received for them.', 'Interest is paid on the loan, never on the debentures held as collateral.'],
  interest: ['Interest is worked on the nominal value at the stated rate, whatever the issue price.', 'Interest for part of a year = nominal value x rate x months / 12.'],
  writeOff: ['The discount or loss on issue is written off in full in the year the debentures are allotted.', 'Use Securities Premium first, as far as it goes; only the rest is charged to the Statement of Profit and Loss.'],
};

// ===============================================================================================================
// EASY
// ===============================================================================================================

interface Kind {
  name: string;
  /** What the classification is about, as the end of "named for ...". */
  basis: string;
  /** What these debentures are, as the end of "debentures that ...". */
  is: string;
  /** A kind that is in the classification but that a company may not issue today: said in the explanation, and never put as a present issue. */
  note?: string;
}
const BY_SECURITY = 'the security behind them';
const BY_TENURE = 'whether and when they are repaid';
const BY_CONVERSION = 'whether they can be turned into shares';
const BY_RECORD = 'how their holders are recorded and how they change hands';
const BY_COUPON = 'the rate of interest they carry';
const KINDS: Kind[] = [
  { name: 'Secured (mortgage) debentures', basis: BY_SECURITY, is: 'are backed by a charge on the assets of the company, so that the holders can recover their money from those assets if the company fails to pay' },
  { name: 'Unsecured (naked) debentures', basis: BY_SECURITY, is: 'carry no charge on any asset of the company, so that the holders rank as ordinary unsecured creditors' },
  { name: 'Redeemable debentures', basis: BY_TENURE, is: 'are to be repaid by the company at the end of a stated period, in one lump sum or in instalments' },
  {
    name: 'Irredeemable (perpetual) debentures', basis: BY_TENURE, is: 'are not repayable during the life of the company and fall due only when it is wound up',
    note: 'This kind is kept in the classification, but under the Companies Act, 2013 and its rules debentures have to be redeemed within a fixed period, so a company in India does not issue irredeemable debentures today.',
  },
  { name: 'Convertible debentures', basis: BY_CONVERSION, is: 'give the holder the right to exchange them for equity shares of the company after a stated period' },
  { name: 'Non-convertible debentures', basis: BY_CONVERSION, is: 'can never be exchanged for shares of the company and stay a loan until they are repaid' },
  { name: 'Registered debentures', basis: BY_RECORD, is: 'are held by persons whose names and holdings are entered in a register kept by the company, and are transferred only by a transfer deed' },
  { name: 'Bearer debentures', basis: BY_RECORD, is: 'pass from one person to another by mere delivery, the interest being paid to whoever presents the coupon' },
  { name: 'Zero coupon rate debentures', basis: BY_COUPON, is: 'carry no stated rate of interest and are issued at a deep discount, the difference between the face value and the issue price taking the place of interest' },
  { name: 'Specific coupon rate debentures', basis: BY_COUPON, is: 'carry a stated rate of interest on their face value, such as 9% a year' },
];

const kindName = mcqTemplate({
  id: 'deb-kind-name', topicId: T, conceptId: 'deb-meaning', difficulty: 'easy',
  generate: (rng) => {
    const right = rng.pick(KINDS);
    const opposite = KINDS.find((k) => k.basis === right.basis && k !== right)!;
    const others = rng.shuffle(KINDS.filter((k) => k.basis !== right.basis)).slice(0, 3);
    const why = (k: Kind): string =>
      k.basis === right.basis
        ? `Chose the opposite kind: ${lowerFirst(k.name)} ${k.is}.`
        : `Chose a kind named for ${k.basis}: ${lowerFirst(k.name)} ${k.is}. The description is about ${right.basis}.`;
    const co = rng.pick(COMPANIES);
    const form = rng.pick([
      `${co} issues debentures that ${right.is}. What kind of debentures are these?`,
      `Debentures that ${right.is} are called:`,
      `An investor is offered debentures of ${co} that ${right.is}. By this feature they are:`,
    ]);
    // A kind that may no longer be issued is asked only as a definition, never as a company's present issue.
    const prompt = right.note ? `In the classification of debentures, those that ${right.is} are called:` : form;
    return choice(prompt, right.name, [opposite, ...others].map((k) => [k.name, why(k)]), `${right.name} ${right.is}. Debentures are classified by ${right.basis} here.${right.note ? ` ${right.note}` : ''}`,
      ['Ask what the description is about: security, repayment, conversion, the register or the rate of interest.', 'Each basis gives a pair of opposite kinds.']);
  },
  verify: (q) => KINDS.some((k) => k.name === optionText(q) && q.prompt.includes(k.is)),
});

const versusShare = mcqTemplate({
  id: 'deb-vs-share', topicId: T, conceptId: 'deb-meaning', difficulty: 'easy',
  generate: (rng) => {
    const co = rng.pick(COMPANIES), r = rng.pick(RATES);
    const d = rng.step(200000, 2000000, 100000), i = (d * r) / 100;
    const hints = ['A debentureholder lends money to the company; a shareholder owns a part of it.', 'Interest on a loan is payable whether or not a profit is earned; a dividend is a share of profit.'];
    switch (rng.int(0, 4)) {
      case 0:
        return choice(
          `${co} has ${r}% Debentures of ${inr(d)} outstanding for the whole year, besides its equity share capital. This year it made a loss. What must it pay the debentureholders for the year?`,
          `Interest of ${inr(i)}, because interest is a charge against profit`,
          [
            ['Nothing, because the company earned no profit', 'Treated the interest like a dividend, which is paid only out of profit; interest on debentures is payable even in a year of loss.'],
            [`A dividend of ${inr(i)}, if the directors recommend it`, 'Called the return on debentures a dividend; a dividend is the return on shares and depends on profit and on the directors.'],
            [`Interest of ${inr(i)}, but only after the equity shareholders approve it`, 'Thought the shareholders decide the interest; it is fixed by the terms of issue and needs no approval.'],
            [`Half the interest, ${inr(i / 2)}, because of the loss`, 'Cut the interest because of the loss; the rate is fixed and the full interest is payable.'],
          ],
          `Debentures are a loan. Interest at ${r}% on ${inr(d)} = ${inr(i)} is a charge against profit and is payable whether or not the company earns a profit.`, hints);
      case 1: {
        const who = rng.pick(INVESTORS);
        return choice(
          `${who} buys ${r}% Debentures of ${inr(d)} when ${co} issues them. What is ${who}'s relation to the company?`,
          'A creditor: the company has borrowed the money',
          [
            ['An owner of the company', 'Confused a debentureholder with a shareholder; shareholders own the company, debentureholders lend to it.'],
            ['A member with a right to vote at its general meetings', 'Gave the debentureholder the voting right of an equity shareholder; debentures carry no vote.'],
            ['A debtor of the company', 'Turned the relation round: it is the company that owes the money to the debentureholder.'],
          ],
          `A debenture is a written acknowledgement of a debt. ${who} has lent ${inr(d)} to the company and is its creditor, with no ownership and no vote.`, hints);
      }
      case 2:
        return choice(
          `${co} is being wound up. Among its ${r}% debentureholders, its preference shareholders and its equity shareholders, who is repaid first?`,
          'The debentureholders, who are creditors of the company',
          [
            ['The equity shareholders, who are the owners', 'Put the owners first; owners are paid last, only after every outside liability has been met.'],
            ['The preference shareholders', 'Preference shareholders come before equity shareholders, but after the creditors, the debentureholders among them.'],
            ['All three together, in proportion to the amounts they paid in', 'Treated lenders and owners alike; creditors are repaid in full before any shareholder gets anything.'],
          ],
          'Debentureholders are creditors, so they are repaid before the shareholders: preference shareholders come next and equity shareholders last.', hints);
      case 3: {
        const below = rng.pick([90, 92, 94, 95, 96, 98]);
        return choice(
          `${co} wants to raise money by issuing securities of ₹100 each at ${inr(below)}, below their face value. Which of these may it issue in this way?`,
          'Debentures, which may be issued at a discount',
          [
            ['Equity shares offered to the public, which may be issued at a discount', 'Thought shares can be issued below face value as debentures can; the Companies Act does not allow shares to be issued at a discount.'],
            ['Both equity shares and debentures', 'Thought one rule covers both; of the two, only debentures can be issued at a discount.'],
            ['Neither equity shares nor debentures', 'Thought no security can be issued below its face value; debentures can.'],
          ],
          `A company may issue debentures at a discount: here ${inr(100 - below)} per debenture goes to Discount on Issue of Debentures A/c. Shares cannot be issued to the public at a discount.`, hints);
      }
      default:
        return choice(
          `What does the holder of ${r}% Debentures of ${inr(d)} in ${co} receive for a full year?`,
          `Interest of ${inr(i)} at the fixed rate, whatever the profit of the year`,
          [
            ['A dividend that rises and falls with the profit of the year', 'Described the return on equity shares; debentures earn interest at a fixed rate.'],
            [`${r}% of the profit the company earns in the year`, 'Applied the rate to the profit; the rate is applied to the nominal value of the debentures.'],
            ['Nothing until the debentures are repaid', 'Thought the return comes only at repayment; interest is paid every year (usually every half-year) while the debentures are outstanding.'],
            [`Interest of ${inr(i)}, but only in a year of profit`, 'Made the interest depend on profit like a dividend; it is a charge against profit and is payable in every year.'],
          ],
          `The return on debentures is interest at the fixed rate on the nominal value: ${r}% of ${inr(d)} = ${inr(i)}, payable whether or not a profit is earned.`, hints);
    }
  },
  verify: (q) => {
    // Where the right option is an amount of interest, it is the rate on the nominal value in the prompt.
    const m = /(\d+)% Debentures of ₹([\d,]+)/.exec(q.prompt);
    const text = optionText(q);
    if (!text.startsWith('Interest of')) return true;
    return !!m && amountsIn(text)[0] === (toInt(m[2]) * Number(m[1])) / 100;
  },
});

const issueKind = mcqTemplate({
  id: 'deb-issue-kind', topicId: T, conceptId: 'deb-issue-cash', difficulty: 'easy',
  generate: (rng) => {
    const co = rng.pick(COMPANIES), r = rng.pick(RATES);
    const face = rng.pick([100, 100, 500, 1000]);
    const premium = rng.int(0, 1) === 0;
    const per = (face * rng.pick(premium ? [5, 10, 20, 25] : [2, 4, 5, 10])) / 100;
    const price = premium ? face + per : face - per;
    const prompt = rng.pick([
      `${co} issues ${r}% Debentures of ${inr(face)} each at ${inr(price)} each. How is the difference of ${inr(per)} on each debenture recorded?`,
      `${co} issues each of its ${r}% Debentures of ${inr(face)} for ${inr(price)}. Where does the difference of ${inr(per)} on a debenture go in the books of the company?`,
    ]);
    const acct = `${r}% Debentures A/c`;
    return premium
      ? choice(prompt, 'It is credited to Securities Premium A/c',
          [
            [`It is credited to ${acct}, which then shows ${inr(price)} a debenture`, 'Credited the premium to the debentures; the debentures account is credited with the nominal value only.'],
            ['It is credited to the Statement of Profit and Loss as an income of the year', 'Treated a capital receipt as a revenue income; a premium on issue is a capital receipt.'],
            ['It is debited to Discount on Issue of Debentures A/c', 'Read a premium as a discount; the issue price is above the face value here.'],
            ['It is credited to Premium on Redemption of Debentures A/c', 'Confused a premium received on issue with a premium payable on redemption.'],
          ],
          `The issue price is ${inr(per)} above the face value: the debentures are issued at a premium. ${acct} is credited with ${inr(face)} and Securities Premium A/c with ${inr(per)}.`, H.issue)
      : choice(prompt, 'It is debited to Discount on Issue of Debentures A/c',
          [
            [`It is deducted from ${acct}, which then shows ${inr(price)} a debenture`, 'Credited the debentures with the money received; the debentures account is credited with the nominal value, which is what has to be repaid.'],
            ['It is debited to Securities Premium A/c as a premium paid', 'Read a discount as a premium; the issue price is below the face value here.'],
            ['It is credited to Discount on Issue of Debentures A/c', 'Put the discount on the wrong side; it is a loss to the company and is debited.'],
            ['It is debited to Debenture Interest A/c', 'Treated the discount as interest; interest is the yearly charge at the stated rate, the discount is a loss on the issue.'],
          ],
          `The issue price is ${inr(per)} below the face value: the debentures are issued at a discount. ${acct} is credited with ${inr(face)}; the ${inr(per)} not received is debited to Discount on Issue of Debentures A/c.`, H.issue);
  },
  verify: (q) => {
    const [face, price] = amountsIn(q.prompt);
    return optionText(q).includes(price > face ? 'Securities Premium' : 'Discount on Issue');
  },
});

const issueProceeds = numericTemplate({
  id: 'deb-issue-proceeds', topicId: T, conceptId: 'deb-issue-cash', difficulty: 'easy', unit: 'rupees',
  generate: (rng) => {
    const premium = rng.int(0, 1) === 0;
    const i = drawIssue(rng, premium ? 'premium' : 'discount');
    const nominal = nominalOf(i), per = i.prem + i.disc, extra = i.n * per, cash = i.n * priceOf(i);
    const word = premium ? 'premium' : 'discount';
    const base = `${rng.pick(COMPANIES)} issued ${lot(i)} ${issueTerms(rng, i)}, payable in full on application. All the debentures were taken up and paid for.`;
    const priceLine = `Issue price = ${inr(i.face)} ${premium ? '+' : '-'} ${inr(per)} = ${inr(priceOf(i))} per debenture.`;
    const ask = rng.int(0, 2);
    if (ask === 0) {
      const n = numeric(cash, [
        [nominal, `Gave the nominal value and ignored the ${word}.`],
        [premium ? nominal - extra : nominal + extra, premium ? 'Deducted the premium from the face value instead of adding it.' : 'Added the discount to the face value instead of deducting it.'],
        [extra, `Gave only the ${word}, not the money received.`],
      ]);
      return n && { prompt: `${base} How much money did the company receive?`, ...n, explanation: [priceLine, `Money received = ${count(i.n)} x ${inr(priceOf(i))} = ${inr(cash)}.`], hints: H.issue };
    }
    if (ask === 1) {
      const n = numeric(extra, [
        [cash, `Gave the whole amount received, not the ${word} alone.`],
        [nominal, 'Gave the nominal value, which is credited to the debentures account.'],
        [per, `Gave the ${word} on one debenture; multiply it by the number of debentures.`],
      ]);
      return n && {
        prompt: `${base} What amount is ${premium ? 'credited to Securities Premium A/c' : 'debited to Discount on Issue of Debentures A/c'}?`,
        ...n,
        explanation: [`The ${word} is ${inr(per)} on each debenture.`, `${capitalise(word)} on the issue = ${count(i.n)} x ${inr(per)} = ${inr(extra)}.`],
        hints: H.issue,
      };
    }
    const n = numeric(nominal, [
      [cash, 'Credited the debentures with the money received; the debentures account is credited with the nominal value.'],
      [extra, `Gave the ${word}, which goes to its own account.`],
      [i.face, 'Gave the face value of one debenture; multiply it by the number of debentures.'],
    ]);
    return n && {
      prompt: `${base} With what amount is ${i.rate}% Debentures A/c credited?`,
      ...n,
      explanation: [`The debentures account always shows the nominal value: ${count(i.n)} x ${inr(i.face)} = ${inr(nominal)}.`, `The ${word} of ${inr(extra)} goes to ${premium ? 'Securities Premium A/c' : 'Discount on Issue of Debentures A/c'}.`],
      hints: H.issue,
    };
  },
  verify: (q) => {
    const i = parseIssue(q.prompt);
    if (!i) return false;
    const nominal = i.n * i.face, pct = (i.prem - i.disc) / i.face;
    const want = q.prompt.includes('How much money') ? nominal * (1 + pct) : q.prompt.includes('Debentures A/c credited') ? nominal : Math.abs(nominal * pct);
    return Math.abs(q.answer / 100 - want) < 1e-6;
  },
});

const journalLumpStep = journalTemplate({
  id: 'deb-journal-lump-step', topicId: T, conceptId: 'deb-issue-cash', difficulty: 'easy', computed: true,
  generate: (rng) => {
    const co = rng.pick(COMPANIES);
    if (rng.int(0, 2) === 0) {
      const i = drawIssue(rng, 'par');
      const nominal = nominalOf(i);
      return {
        prompt: `${co} issued ${lot(i)} at par, the whole amount payable with the application. All the debentures were applied for, and the money was received and credited to Debenture Application and Allotment A/c. The debentures were then allotted. Pass the entry for the allotment.`,
        lines: entry(dr('debentureApplicationAndAllotment', nominal), cr(debentures(i.rate), nominal)),
        explanation: [
          `Nominal value = ${count(i.n)} x ${inr(i.face)} = ${inr(nominal)}.`,
          'On allotment the money stops being application money: Debenture Application and Allotment A/c is debited.',
          `It becomes a loan the company owes: ${i.rate}% Debentures A/c is credited with the nominal value.`,
        ],
        distractorAccounts: ['debentureApplication', 'debentureAllotment', 'debentureholders', 'securitiesPremium'],
        hints: H.issue,
      };
    }
    const i = drawIssue(rng, rng.pick(['par', 'premium', 'discount'] as const));
    const cash = i.n * priceOf(i);
    return {
      prompt: `${co} invited applications for ${lot(i)} ${issueTerms(rng, i)}. The whole amount was payable with the application, and applications were received for all the debentures. The company uses Debenture Application and Allotment A/c. Pass the entry for the money received.`,
      lines: entry(dr('bank', cash), cr('debentureApplicationAndAllotment', cash)),
      explanation: [
        i.prem + i.disc > 0 ? `Issue price = ${inr(i.face)} ${i.prem > 0 ? '+' : '-'} ${inr(i.prem + i.disc)} = ${inr(priceOf(i))}; money received = ${count(i.n)} x ${inr(priceOf(i))} = ${inr(cash)}.` : `Money received = ${count(i.n)} x ${inr(i.face)} = ${inr(cash)}.`,
        'Money comes in: Bank A/c is debited.',
        'Until the debentures are allotted the money is held in Debenture Application and Allotment A/c, which is credited.',
      ],
      distractorAccounts: [debentures(i.rate), 'debentureApplication', i.disc > 0 ? 'discountOnIssueOfDebentures' : 'securitiesPremium', 'debentureholders'],
      hints: H.issue,
    };
  },
  verify: (q) => {
    const i = parseIssue(q.prompt);
    if (!i) return false;
    const cash = i.n * (i.face + i.prem - i.disc);
    return q.prompt.includes('for the allotment')
      ? isEntry(q, [['debentureApplicationAndAllotment', 'Dr', cash], [debentures(i.rate), 'Cr', cash]])
      : isEntry(q, [['bank', 'Dr', cash], ['debentureApplicationAndAllotment', 'Cr', cash]]);
  },
});

const interestYear = numericTemplate({
  id: 'deb-interest-year', topicId: T, conceptId: 'deb-interest', difficulty: 'easy', unit: 'rupees',
  generate: (rng) => {
    const i = drawIssue(rng, rng.pick(['premium', 'discount', 'discount'] as const));
    const y = rng.int(2023, 2025);
    const nominal = nominalOf(i), annual = (nominal * i.rate) / 100, onPrice = (i.n * priceOf(i) * i.rate) / 100;
    const base = `${rng.pick(COMPANIES)} has ${lot(i)} outstanding throughout the year ended 31 March ${y + 1}. They had been issued ${issueTerms(rng, i)}. Interest is payable half-yearly on 30 September and 31 March.`;
    if (rng.int(0, 1) === 0) {
      const n = numeric(annual, [
        [onPrice, 'Worked the interest on the issue price; interest is always on the nominal value.'],
        [annual / 2, 'Gave the interest of one half-year only.'],
        [nominal, 'Gave the nominal value of the debentures, not the interest on it.'],
      ]);
      return n && {
        prompt: `${base} What is the interest on the debentures for the year?`,
        ...n,
        explanation: [`Nominal value = ${count(i.n)} x ${inr(i.face)} = ${inr(nominal)}. The issue price does not matter.`, `Interest for the year = ${i.rate}% of ${inr(nominal)} = ${inr(annual)}.`],
        hints: H.interest,
      };
    }
    const n = numeric(annual / 2, [
      [annual, 'Gave the interest of the whole year; one half-year is paid on each date.'],
      [onPrice / 2, 'Worked the interest on the issue price; interest is always on the nominal value.'],
      [annual / 4, 'Took a quarter of the yearly interest; a half-year is six months.'],
    ]);
    return n && {
      prompt: `${base} How much interest is paid on 30 September ${y}?`,
      ...n,
      explanation: [`Nominal value = ${count(i.n)} x ${inr(i.face)} = ${inr(nominal)}; interest for a year = ${i.rate}% of it = ${inr(annual)}.`, `For the half-year to 30 September: ${inr(annual)} x 6/12 = ${inr(annual / 2)}.`],
      hints: H.interest,
    };
  },
  verify: (q) => {
    const i = parseIssue(q.prompt);
    return !!i && q.answer === i.n * i.face * i.rate * (q.prompt.includes('for the year?') ? 1 : 0.5);
  },
});

const journalInterestStep = journalTemplate({
  id: 'deb-journal-interest-step', topicId: T, conceptId: 'deb-interest', difficulty: 'easy', computed: true,
  generate: (rng) => {
    const co = rng.pick(COMPANIES), r = rng.pick(RATES), y = rng.int(2023, 2025);
    const d = rng.step(200000, 3000000, 100000), annual = (d * r) / 100, half = annual / 2;
    const base = `${co} has ${r}% Debentures of ${inr(d)} outstanding. Interest is payable half-yearly on 30 September and 31 March.`;
    const step = rng.int(0, 2);
    if (step === 0) {
      const on = rng.pick([`30 September ${y}`, `31 March ${y + 1}`]);
      return {
        prompt: `${base} Pass the entry on ${on} for the half-year's interest becoming due to the debentureholders.`,
        lines: entry(dr('debentureInterest', half), cr('debentureholders', half)),
        explanation: [
          `Interest for the half-year = ${inr(d)} x ${r}% x 6/12 = ${inr(half)}.`,
          'Interest is an expense: Debenture Interest A/c is debited.',
          'It is owed to the debentureholders until it is paid: Debentureholders A/c is credited.',
        ],
        distractorAccounts: [debentures(r), 'interestPaid', 'statementOfProfitAndLoss'],
        hints: H.interest,
      };
    }
    if (step === 1) {
      const on = rng.pick([`30 September ${y}`, `31 March ${y + 1}`]);
      return {
        prompt: `${base} The interest of ${inr(half)} that became due on ${on} has been credited to Debentureholders A/c. It is now paid by cheque. Pass the entry for the payment.`,
        lines: entry(dr('debentureholders', half), cr('bank', half)),
        explanation: [
          'The amount owed to the debentureholders is settled: Debentureholders A/c is debited.',
          'Money goes out of the bank: Bank A/c is credited.',
          'The expense was recorded when the interest became due, so Debenture Interest A/c is not touched again.',
        ],
        distractorAccounts: ['debentureInterest', debentures(r), 'interestPaid'],
        hints: H.interest,
      };
    }
    return {
      prompt: `${base} Debenture Interest A/c shows the interest of ${inr(annual)} for the year ended 31 March ${y + 1}. Pass the entry to close it at the end of the year.`,
      lines: entry(dr('statementOfProfitAndLoss', annual), cr('debentureInterest', annual)),
      explanation: [
        `Interest for the year = ${r}% of ${inr(d)} = ${inr(annual)}.`,
        'It is an expense of the year (a finance cost): the Statement of Profit and Loss is debited.',
        'Debenture Interest A/c is credited and so closed.',
      ],
      distractorAccounts: ['debentureholders', debentures(r), 'profitAndLoss', 'interestPaid'],
      hints: H.interest,
    };
  },
  verify: (q) => {
    const m = /(\d+)% Debentures of ₹([\d,]+)/.exec(q.prompt);
    if (!m) return false;
    const annual = (toInt(m[2]) * Number(m[1])) / 100;
    if (q.prompt.includes('becoming due')) return isEntry(q, [['debentureInterest', 'Dr', annual / 2], ['debentureholders', 'Cr', annual / 2]]);
    if (q.prompt.includes('for the payment')) return isEntry(q, [['debentureholders', 'Dr', annual / 2], ['bank', 'Cr', annual / 2]]);
    return isEntry(q, [['statementOfProfitAndLoss', 'Dr', annual], ['debentureInterest', 'Cr', annual]]);
  },
});

const lossOnIssuePar = numericTemplate({
  id: 'deb-loss-on-issue-par', topicId: T, conceptId: 'deb-redemption-terms', difficulty: 'easy', unit: 'rupees',
  generate: (rng) => {
    const i = drawIssue(rng, 'par', true);
    const years = rng.int(4, 8);
    const nominal = nominalOf(i), premium = i.n * i.red;
    const base = `${rng.pick(COMPANIES)} issued ${lot(i)} at par, ${redTerms(i, years)}.`;
    const perLine = `Premium on redemption = ${pctOf(i, i.red)}% of ${inr(i.face)} = ${inr(i.red)} per debenture; on the issue, ${count(i.n)} x ${inr(i.red)} = ${inr(premium)}.`;
    const ask = rng.int(0, 2);
    if (ask === 0) {
      const n = numeric(premium, [
        [nominal + premium, 'Gave the whole amount payable on redemption; the loss is only the premium.'],
        [i.red, 'Gave the premium on one debenture; multiply it by the number of debentures.'],
        [premium * years, 'Multiplied the premium by the number of years; it is payable once, on redemption.'],
      ]);
      return n && {
        prompt: `${base} What loss on the issue does the company record at the time of issue?`,
        ...n,
        explanation: [perLine, 'The premium is known to be payable from the day of issue, so it is recorded then: Loss on Issue of Debentures A/c is debited with it.'],
        hints: H.cases,
      };
    }
    if (ask === 1) {
      const n = numeric(premium, [
        [nominal, 'Gave the nominal value, which is credited to the debentures account.'],
        [nominal + premium, 'Gave the whole amount payable on redemption; only the premium goes to this account.'],
        [i.red, 'Gave the premium on one debenture; multiply it by the number of debentures.'],
      ]);
      return n && {
        prompt: `${base} What amount is credited to Premium on Redemption of Debentures A/c at the time of issue?`,
        ...n,
        explanation: [perLine, 'Premium on Redemption of Debentures A/c is credited with it: it is a liability from the day of issue.'],
        hints: H.cases,
      };
    }
    const n = numeric(nominal + premium, [
      [nominal, 'Left out the premium payable on redemption.'],
      [premium, 'Gave only the premium, not the whole amount payable.'],
      [nominal - premium, 'Deducted the premium instead of adding it.'],
    ]);
    return n && {
      prompt: `${base} What total amount has the company bound itself to pay the debentureholders on redemption?`,
      ...n,
      explanation: [`Nominal value = ${count(i.n)} x ${inr(i.face)} = ${inr(nominal)}.`, perLine, `Payable on redemption = ${inr(nominal)} + ${inr(premium)} = ${inr(nominal + premium)}.`],
      hints: H.cases,
    };
  },
  verify: (q) => {
    const i = parseIssue(q.prompt);
    if (!i || i.prem + i.disc !== 0) return false;
    const pct = i.red / i.face, nominal = i.n * i.face;
    return Math.abs(q.answer / 100 - (q.prompt.includes('total amount') ? nominal * (1 + pct) : nominal * pct)) < 1e-6;
  },
});

const collateralTreatment = mcqTemplate({
  id: 'deb-collateral-treatment', topicId: T, conceptId: 'deb-collateral', difficulty: 'easy',
  generate: (rng) => {
    const co = rng.pick(COMPANIES), r = rng.pick(RATES);
    const loan = rng.step(500000, 4000000, 100000);
    const d = (loan * rng.pick([120, 125, 130, 150])) / 100;
    const acct = `${r}% Debentures A/c`;
    const base = `${co} takes a loan of ${inr(loan)} from its bank and issues ${r}% Debentures of ${inr(d)} to the bank as collateral security.`;
    switch (rng.int(0, 4)) {
      case 0:
        return choice(
          `${base} The company follows the method under which no entry is made for such debentures. How do they appear in its books?`,
          'No entry is passed; a note below the loan in the balance sheet states that the debentures were issued as collateral security',
          [
            [`Bank A/c Dr; To ${acct}, with ${inr(d)}`, 'Treated the collateral debentures as an issue for cash; no money is received for them.'],
            [`Bank Loan A/c Dr; To ${acct}, with ${inr(loan)}`, 'Replaced the loan with debentures; the loan stays a liability and the debentures only stand behind it.'],
            [`Bank A/c Dr; To ${acct}, with ${inr(loan)}`, 'Recorded the money borrowed as an issue of debentures; it is a bank loan, and the debentures are only a security for it.'],
            ['No entry is passed and nothing is disclosed anywhere', 'Left out the disclosure; the fact has to be stated by a note to the loan.'],
          ],
          `The debentures create no liability unless the company defaults on the loan. The loan of ${inr(loan)} is recorded as usual, and a note says that ${r}% Debentures of ${inr(d)} were issued as collateral security.`, H.collateral);
      case 1:
        return choice(
          `${base} The company chooses to record the debentures in its books. Which account is debited when ${acct} is credited with ${inr(d)}?`,
          'Debenture Suspense A/c',
          [
            ['Bank A/c', 'Treated the collateral debentures as an issue for cash; no money is received for them.'],
            ['Bank Loan A/c', 'Debited the loan as if it were repaid; the loan stays a liability in full.'],
            ['Discount on Issue of Debentures A/c', 'Read the excess of the debentures over the loan as a discount; nothing is issued at a discount here.'],
            ['Loss on Issue of Debentures A/c', 'Treated the collateral debentures as a loss; they are only a security, so the debit goes to a suspense account.'],
          ],
          `Under the second method the entry is Debenture Suspense A/c Dr; To ${acct}, with ${inr(d)}. In the balance sheet the debentures are shown and Debenture Suspense A/c is deducted from them, so no extra liability appears.`, H.collateral);
      case 2: {
        const i = rng.pick([8, 9, 10, 11, 12, 13].filter((x) => x !== r));
        return choice(
          `${base} The loan carries interest at ${i}% a year and the company pays its dues on time. On what does the company pay interest?`,
          `On the loan of ${inr(loan)} only, at ${i}%`,
          [
            [`On the loan at ${i}% and also on the debentures of ${inr(d)} at ${r}%`, 'Paid interest twice; debentures held as collateral security carry no interest.'],
            [`On the debentures of ${inr(d)} at ${r}%, in place of interest on the loan`, 'Moved the interest to the debentures; the bank is a lender on the loan, and the debentures only secure it.'],
            [`On the debentures of ${inr(d)} at the loan rate of ${i}%`, 'Applied the loan rate to the nominal value of the collateral debentures; interest is on the amount borrowed.'],
          ],
          `The bank has lent ${inr(loan)} and earns interest on that at ${i}%. The debentures are only an additional security and earn nothing while the company keeps to its terms.`, H.collateral);
      }
      case 3:
        return choice(
          `${base} When can the bank use these debentures to recover its money?`,
          'Only if the company fails to repay the loan or the interest on it',
          [
            ['From the day they are issued, like any other debentureholder', 'Treated collateral debentures as ordinary ones; the bank becomes a debentureholder only on default.'],
            ['On the date the debentures would fall due, even if the loan has been repaid', 'Thought the debentures run on their own; once the loan is repaid they are released and cancelled.'],
            ['Never: they are only a formality', 'Thought the security has no effect; on default the bank can exercise all the rights of a debentureholder.'],
          ],
          'Collateral security is an additional security. The bank falls back on the debentures only on default; when the loan is repaid, the debentures are released.', H.collateral);
      default:
        return choice(
          `${base} What does "collateral security" mean here?`,
          'An additional security, given over and above the primary security for the loan',
          [
            ['The main security for the loan, without which the loan is unsecured', 'Took it for the primary security; collateral is a second, supporting security.'],
            ['A security the bank gives the company for the money it has lent', 'Turned it round: it is the borrower who gives security to the lender.'],
            [`Debentures sold to the bank for ${inr(d)} in cash`, 'Treated the debentures as an issue for cash; the bank pays nothing for them.'],
          ],
          'A lender may ask for a second security besides the main one. Debentures issued for this purpose are debentures issued as collateral security.', H.collateral);
    }
  },
});

const collateralInterest = numericTemplate({
  id: 'deb-collateral-interest', topicId: T, conceptId: 'deb-collateral', difficulty: 'easy', unit: 'rupees',
  generate: (rng) => {
    const r = rng.pick(RATES), i = rng.pick([8, 9, 10, 11, 12, 13].filter((x) => x !== r)), y = rng.int(2023, 2025);
    const loan = rng.step(500000, 4000000, 100000);
    const d = (loan * rng.pick([120, 125, 130, 150])) / 100;
    const base = `On 1 April ${y}, ${rng.pick(COMPANIES)} took a loan of ${inr(loan)} from its bank at ${i}% a year and issued ${r}% Debentures of ${inr(d)} to the bank as collateral security. The company made no default during the year ended 31 March ${y + 1}.`;
    if (rng.int(0, 2) > 0) {
      const n = numeric((loan * i) / 100, [
        [(d * r) / 100, 'Worked interest on the debentures given as collateral security; no interest is payable on them.'],
        [(loan * i) / 100 + (d * r) / 100, 'Added interest on the collateral debentures to the interest on the loan; only the loan carries interest.'],
        [(d * i) / 100, 'Applied the loan rate to the nominal value of the debentures; interest is on the amount borrowed.'],
        [(loan * r) / 100, 'Applied the debenture rate to the loan; the loan carries its own rate.'],
      ]);
      return n && {
        prompt: `${base} How much interest does the company owe the bank for the year?`,
        ...n,
        explanation: ['Debentures issued as collateral security carry no interest: the bank earns interest on the loan.', `Interest = ${i}% of ${inr(loan)} = ${inr((loan * i) / 100)}.`],
        hints: H.collateral,
      };
    }
    const n = numeric(loan, [
      [d, 'Took the nominal value of the collateral debentures as the amount owed; the liability is the loan.'],
      [loan + d, 'Counted the collateral debentures as a second liability; they only secure the loan.'],
      [d - loan, 'Gave the margin by which the debentures exceed the loan.'],
    ]);
    return n && {
      prompt: `${base} What is the principal amount the company owes the bank on 31 March ${y + 1}, no part of the loan having been repaid?`,
      ...n,
      explanation: [`The company borrowed ${inr(loan)}, and that is what it owes.`, `The debentures of ${inr(d)} are only an additional security: they add nothing to the liability.`],
      hints: H.collateral,
    };
  },
  verify: (q) => {
    const [loan] = amountsIn(q.prompt);
    const rate = Number(/at (\d+)% a year/.exec(q.prompt)?.[1]);
    return q.answer / 100 === (q.prompt.includes('How much interest') ? (loan * rate) / 100 : loan);
  },
});

const ASSET_BOUGHT: { id: string; text: string }[] = [
  { id: 'machinery', text: 'machinery' },
  { id: 'building', text: 'a building' },
  { id: 'land', text: 'land' },
  { id: 'furniture', text: 'furniture' },
  { id: 'patents', text: 'patents' },
];

const vendorNumber = numericTemplate({
  id: 'deb-vendor-number', topicId: T, conceptId: 'deb-vendor', difficulty: 'easy', unit: 'number',
  generate: (rng) => {
    const price = rng.pick([125, 120, 110, 108, 105, 104, 96, 95, 92, 90]);
    const n = rng.step(1000, 20000, 500), r = rng.pick(RATES), pc = n * price;
    const v = rng.pick(VENDORS), a = rng.pick(ASSET_BOUGHT), gap = Math.abs(price - 100);
    const num = numeric(n, [
      [pc / 100, 'Divided by the face value; the vendor takes each debenture at its issue price.'],
      [pc / gap, price > 100 ? 'Divided by the premium alone instead of the whole issue price.' : 'Divided by the discount alone instead of the issue price.'],
      [(pc / 100) * ((200 - price) / 100), price > 100 ? 'Divided by the face value and then cut the number by the rate of premium; divide by the issue price instead.' : 'Divided by the face value and then raised the number by the rate of discount; divide by the issue price instead.'],
    ], 1);
    return num && {
      prompt: `${rng.pick(COMPANIES)} bought ${a.text} for ${inr(pc)} from ${v} and settled the price by issuing ${r}% Debentures of ₹100 each at ${inr(price)} each. How many debentures were issued to ${v}?`,
      ...num,
      explanation: ['Number of debentures = amount payable / issue price of one debenture.', `${inr(pc)} / ${inr(price)} = ${count(n)} debentures.`],
      hints: H.vendor,
    };
  },
  verify: (q) => {
    const [pc, face, price] = amountsIn(q.prompt);
    return face === 100 && q.answer * price === pc;
  },
});

const writeOffOrder = mcqTemplate({
  id: 'deb-write-off-order', topicId: T, conceptId: 'deb-write-off', difficulty: 'easy',
  generate: (rng) => {
    const co = rng.pick(COMPANIES), y = rng.int(2024, 2026), years = rng.pick([4, 5, 8, 10]);
    const loss = years * rng.step(4000, 30000, 2000);
    const state = rng.int(0, 2);
    const sp = state === 0 ? 0 : state === 1 ? Math.max(1000, Math.floor((loss * rng.pick([0.25, 0.4, 0.5, 0.75])) / 1000) * 1000) : loss + rng.step(10000, 80000, 10000);
    const acct = rng.pick(['Discount on Issue of Debentures A/c', 'Loss on Issue of Debentures A/c']);
    const prompt = `${co} allotted debentures during the year ended 31 March ${y}, and ${inr(loss)} stands in its ${acct}. ${sp > 0 ? `Securities Premium A/c has a balance of ${inr(sp)}.` : 'There is no balance in Securities Premium A/c.'} The debentures are redeemable after ${years} years. How is the ${inr(loss)} written off?`;
    const spread: [string, string] = [`${inr(loss / years)} a year from the Statement of Profit and Loss over the ${years} years`, 'Spread the amount over the life of the debentures; it is written off in full in the year of allotment.'];
    const carry: [string, string] = ['It is carried in the balance sheet and written off when the debentures are redeemed', 'Kept the amount as an asset until redemption; it is written off in the year the debentures are allotted.'];
    const halves: [string, string] = [`${inr(loss / 2)} from Securities Premium and ${inr(loss / 2)} from the Statement of Profit and Loss`, 'Split the amount equally; Securities Premium is used first, for as much as it can bear.'];
    const allPl = `The whole ${inr(loss)} from the Statement of Profit and Loss, in the year of allotment`;
    const allSp = `The whole ${inr(loss)} from Securities Premium, in the year of allotment`;
    if (sp === 0) {
      return choice(prompt, allPl, [spread, carry, [allSp, 'Charged it to Securities Premium, which has no balance to bear it.'], ['The whole amount from General Reserve', 'Used a reserve the rule does not name; without Securities Premium the amount is charged to the Statement of Profit and Loss.']],
        `With no Securities Premium to use, the whole ${inr(loss)} is charged to the Statement of Profit and Loss, as a finance cost, in the year of allotment.`, H.writeOff);
    }
    if (sp < loss) {
      return choice(prompt, `${inr(sp)} from Securities Premium and the remaining ${inr(loss - sp)} from the Statement of Profit and Loss, in the year of allotment`,
        [spread, carry, [allPl, 'Left Securities Premium untouched; it is used first, to the extent it is available.'], [allSp, `Took more out of Securities Premium than it holds; only ${inr(sp)} is available there.`], ...(sp * 2 === loss ? [] : [halves])],
        `Securities Premium is used first: ${inr(sp)}. The balance, ${inr(loss)} - ${inr(sp)} = ${inr(loss - sp)}, is charged to the Statement of Profit and Loss as a finance cost. All of it is written off in the year of allotment.`, H.writeOff);
    }
    return choice(prompt, allSp, [spread, carry, [allPl, 'Left Securities Premium untouched; it is used first, and here it covers the whole amount.'], halves],
      `Securities Premium of ${inr(sp)} is enough to bear the whole ${inr(loss)}, so nothing is charged to the Statement of Profit and Loss. ${inr(sp - loss)} remains in Securities Premium A/c.`, H.writeOff);
  },
  verify: (q) => {
    const a = amountsIn(q.prompt);
    const loss = a[0], sp = q.prompt.includes('no balance in Securities Premium') ? 0 : a[1];
    const text = optionText(q);
    if (sp === 0) return text.startsWith(`The whole ${inr(loss)} from the Statement`);
    if (sp >= loss) return text.startsWith(`The whole ${inr(loss)} from Securities Premium`);
    return text.startsWith(`${inr(sp)} from Securities Premium and the remaining ${inr(loss - sp)} `);
  },
});

const interestEntryForm = mcqTemplate({
  id: 'deb-interest-entry-form', topicId: T, conceptId: 'deb-interest', difficulty: 'easy',
  generate: (rng) => {
    const co = rng.pick(COMPANIES), r = rng.pick(RATES);
    const d = rng.step(200000, 3000000, 100000), annual = (d * r) / 100, half = annual / 2;
    const acct = `${r}% Debentures A/c`;
    const due = 'Debenture Interest A/c Dr; To Debentureholders A/c';
    const paid = 'Debentureholders A/c Dr; To Bank A/c';
    const close = 'Statement of Profit and Loss Dr; To Debenture Interest A/c';
    switch (rng.int(0, 2)) {
      case 0:
        return choice(
          `Half-year interest of ${inr(half)} on the ${r}% Debentures of ${co} becomes due on 30 September. Which entry records the interest becoming due?`,
          due,
          [
            ['Debentureholders A/c Dr; To Debenture Interest A/c', 'Reversed the entry: the expense is debited and the amount owed to the debentureholders is credited.'],
            [`Debenture Interest A/c Dr; To ${acct}`, 'Credited the debentures themselves; interest due does not add to the loan, it is owed to the debentureholders.'],
            [paid, 'Gave the entry for paying the interest, not for its becoming due.'],
            ['Statement of Profit and Loss Dr; To Debentureholders A/c', 'Skipped Debenture Interest A/c; the expense is recorded there first and transferred at the end of the year.'],
          ],
          `The expense is debited (Debenture Interest A/c) and the amount owed is credited (Debentureholders A/c), each with ${inr(half)}.`, H.interest);
      case 1:
        return choice(
          `Half-year interest of ${inr(half)} on the ${r}% Debentures of ${co} was credited to Debentureholders A/c when it became due on 31 March. Which entry records its payment by cheque?`,
          paid,
          [
            ['Bank A/c Dr; To Debentureholders A/c', 'Reversed the entry: money goes out of the bank, so Bank A/c is credited.'],
            [due, 'Gave the entry for the interest becoming due, which has already been passed.'],
            [`${acct} Dr; To Bank A/c`, 'Debited the debentures as if part of the loan were repaid; only interest is being paid.'],
            ['Debenture Interest A/c Dr; To Bank A/c', 'Debited the expense a second time; it was debited when the interest became due.'],
          ],
          `Paying the interest settles what is owed: Debentureholders A/c is debited and Bank A/c credited with ${inr(half)}.`, H.interest);
      default:
        return choice(
          `Debenture Interest A/c of ${co} shows ${inr(annual)}, the interest for the year on its ${r}% Debentures of ${inr(d)}. Which entry closes it at the end of the year?`,
          close,
          [
            ['Debenture Interest A/c Dr; To Statement of Profit and Loss', 'Reversed the entry: an expense is closed by crediting it and debiting the Statement of Profit and Loss.'],
            ['Statement of Profit and Loss Dr; To Debentureholders A/c', 'Credited the debentureholders; they were credited when the interest became due.'],
            [`Debenture Interest A/c Dr; To ${acct}`, 'Added the interest to the debentures; the expense is transferred to the Statement of Profit and Loss.'],
            [paid, 'Gave the entry for paying the interest, not for closing the expense account.'],
          ],
          `Interest is an expense of the year: the Statement of Profit and Loss is debited and Debenture Interest A/c credited with ${inr(annual)}.`, H.interest);
    }
  },
});

const accountNature = mcqTemplate({
  id: 'deb-account-nature', topicId: T, conceptId: 'deb-redemption-terms', difficulty: 'easy',
  generate: (rng) => {
    const co = rng.pick(COMPANIES);
    switch (rng.int(0, 4)) {
      case 0: {
        const i = drawIssue(rng, 'par', true);
        return choice(
          `${co} issued ${lot(i)} at par, redeemable at a premium of ${pctOf(i, i.red)}%, and credited ${inr(i.n * i.red)} to Premium on Redemption of Debentures A/c. What is this account?`,
          'A liability: the extra amount payable to the debentureholders on redemption',
          [
            ['An expense of the year of issue', 'Took the credit balance for the expense; the loss side of the entry is Loss on Issue of Debentures A/c.'],
            ['A reserve that belongs to the shareholders', 'Confused it with Securities Premium; this premium is owed to the debentureholders.'],
            ['An asset to be written off', 'Confused it with Loss on Issue of Debentures A/c, which is the debit balance that is written off.'],
          ],
          'The company has bound itself to pay the premium on redemption, so the premium is a liability from the day of issue. It stays until the debentures are redeemed.', H.cases);
      }
      case 1: {
        const i = drawIssue(rng, 'discount', true);
        return choice(
          `${co} issued ${lot(i)} at a discount of ${pctOf(i, i.disc)}%, redeemable at a premium of ${pctOf(i, i.red)}%, and debited ${inr(i.n * (i.disc + i.red))} to Loss on Issue of Debentures A/c. What is this amount?`,
          'A capital loss, written off in the year the debentures are allotted',
          [
            ['A liability payable on redemption', 'Confused it with Premium on Redemption of Debentures A/c, which is the liability.'],
            ['A revenue expense that recurs every year, like interest', 'Treated it like interest; it arises once, on the issue, and is a capital loss.'],
            ['A gain credited to Securities Premium A/c', 'Read a loss as a gain; it is a debit balance and is written off against Securities Premium or profit.'],
          ],
          'The discount allowed and the premium payable on redemption are a loss on the issue. It is a capital loss, written off in the year of allotment from Securities Premium and then from the Statement of Profit and Loss.', H.cases);
      }
      case 2: {
        const i = drawIssue(rng, 'premium');
        return choice(
          `${co} issued ${lot(i)} at a premium of ${pctOf(i, i.prem)}% and credited ${inr(i.n * i.prem)} to Securities Premium A/c. What is this amount?`,
          'A capital receipt, shown as a reserve',
          [
            ['A revenue income, credited to the Statement of Profit and Loss', 'Treated a capital receipt as an income of the year.'],
            ['A liability payable to the debentureholders on redemption', 'Confused a premium received on issue with a premium payable on redemption.'],
            ['Part of the nominal value of the debentures', 'Added the premium to the debentures; the debentures account shows the nominal value only.'],
          ],
          'A premium received on the issue of debentures is a capital receipt. It is credited to Securities Premium A/c, a reserve, and can be used to write off a discount or loss on issue of debentures.', H.issue);
      }
      case 3: {
        const i = drawIssue(rng, 'discount');
        return choice(
          `${co} issued ${lot(i)} at a discount of ${pctOf(i, i.disc)}% and debited ${inr(i.n * i.disc)} to Discount on Issue of Debentures A/c. What is this amount?`,
          'A capital loss, written off in the year the debentures are allotted',
          [
            ['A gain, because less money has to be repaid', 'Thought the discount lowers what is repaid; the full nominal value is repaid, so the discount is a loss.'],
            ['Interest paid in advance for the first year', 'Treated the discount as interest; interest is charged separately at the stated rate.'],
            ['A liability owed to the debentureholders', 'Read a debit balance as a liability; nothing more is owed because of the discount.'],
          ],
          'The company receives less than the nominal value it must repay. The difference is a capital loss, written off in the year of allotment.', H.issue);
      }
      default: {
        const r = rng.pick(RATES), d = rng.step(200000, 3000000, 100000);
        return choice(
          `${co} credits Debentureholders A/c with ${inr((d * r) / 200)} on 30 September, the half-year's interest on its ${r}% Debentures of ${inr(d)}. Until the cheques are sent, what does this balance show?`,
          'A liability: interest due to the debentureholders but not yet paid',
          [
            ['The nominal value of the debentures', `Confused it with ${r}% Debentures A/c, which shows the loan itself.`],
            ['An expense of the half-year', 'Confused it with Debenture Interest A/c, which is the expense; this account is the amount owed.'],
            ['An amount receivable from the debentureholders', 'Read a credit balance as an asset; the company owes this amount.'],
          ],
          'Debenture Interest A/c is the expense; Debentureholders A/c is the personal account of those to whom the interest is owed. It is cleared when the interest is paid.', H.interest);
      }
    }
  },
});

type RedeemAt = 'par' | 'premium';
const CASE_FORMS: { issue: IssueAt; red: RedeemAt; form: string }[] = [
  { issue: 'par', red: 'par', form: 'Nothing else: the money received is equal to the nominal value' },
  { issue: 'discount', red: 'par', form: 'Discount on Issue of Debentures A/c is debited with the discount' },
  { issue: 'premium', red: 'par', form: 'Securities Premium A/c is credited with the premium on issue' },
  { issue: 'par', red: 'premium', form: 'Loss on Issue of Debentures A/c is debited and Premium on Redemption of Debentures A/c is credited, each with the premium on redemption' },
  { issue: 'discount', red: 'premium', form: 'Loss on Issue of Debentures A/c is debited with the discount plus the premium on redemption, and Premium on Redemption of Debentures A/c is credited with the premium on redemption' },
  { issue: 'premium', red: 'premium', form: 'Securities Premium A/c is credited with the premium on issue; Loss on Issue of Debentures A/c is debited and Premium on Redemption of Debentures A/c is credited, each with the premium on redemption' },
];
const AT_WORD: Record<IssueAt, string> = { par: 'at par', premium: 'at a premium', discount: 'at a discount' };

const caseEntryForm = mcqTemplate({
  id: 'deb-case-entry-form', topicId: T, conceptId: 'deb-redemption-terms', difficulty: 'easy',
  generate: (rng) => {
    const right = rng.pick(CASE_FORMS);
    const i = drawIssue(rng, right.issue, right.red === 'premium');
    const why = (c: (typeof CASE_FORMS)[number]): string => {
      const reasons: string[] = [];
      if (c.red !== right.red) reasons.push(right.red === 'premium' ? 'left out the premium payable on redemption, which is provided for at the time of issue' : 'provided for a premium on redemption although these debentures are redeemable at par');
      if (c.issue !== right.issue) reasons.push(`treated the debentures as issued ${AT_WORD[c.issue]} when they are issued ${AT_WORD[right.issue]}`);
      return `${capitalise(reasons.join(', and '))}.`;
    };
    const issued = right.issue === 'par' ? 'at par' : `${AT_WORD[right.issue]} of ${pctOf(i, i.prem + i.disc)}%`;
    const redeemed = right.red === 'par' ? 'at par' : `at a premium of ${pctOf(i, i.red)}%`;
    return choice(
      `${rng.pick(COMPANIES)} issues ${i.rate}% Debentures of ${inr(i.face)} each ${issued}, redeemable ${redeemed}. The whole amount is received with the applications. In the entry on allotment, Debenture Application and Allotment A/c is debited with the money received and ${i.rate}% Debentures A/c is credited with the nominal value. What else does the entry contain?`,
      right.form,
      rng.shuffle(CASE_FORMS.filter((c) => c !== right)).map((c) => [c.form, why(c)]),
      `These debentures are issued ${AT_WORD[right.issue]} and are redeemable ${right.red === 'par' ? 'at par' : 'at a premium'}. ${right.form}. A discount on issue is a loss, a premium on issue goes to Securities Premium A/c, and a premium payable on redemption is a loss known at the time of issue, so it is provided for then.`,
      H.cases);
  },
  verify: (q) => {
    const m = /each (at par|at a premium|at a discount)(?: of \d+%)?, redeemable (at par|at a premium)/.exec(q.prompt);
    const right = CASE_FORMS.find((c) => m && AT_WORD[c.issue] === m[1] && (c.red === 'par' ? 'at par' : 'at a premium') === m[2]);
    return !!right && optionText(q) === right.form;
  },
});

const easy: Template[] = [
  kindName, versusShare, issueKind, issueProceeds, journalLumpStep, interestYear, journalInterestStep, lossOnIssuePar,
  collateralTreatment, collateralInterest, vendorNumber, writeOffOrder, interestEntryForm, accountNature, caseEntryForm,
];

// ===============================================================================================================
// MEDIUM
// ===============================================================================================================

const nominalToRaise = numericTemplate({
  id: 'deb-nominal-to-raise', topicId: T, conceptId: 'deb-issue-cash', difficulty: 'medium', unit: 'rupees',
  generate: (rng) => {
    const premium = rng.int(0, 2) === 0;
    const pct = rng.pick(premium ? [5, 10, 20, 25] : [2, 4, 5, 6, 8, 10]);
    const n = rng.step(2000, 40000, 2000), r = rng.pick(RATES);
    const price = premium ? 100 + pct : 100 - pct, nominal = n * 100, cash = n * price;
    const word = premium ? 'premium' : 'discount';
    const purpose = rng.pick(['a new plant', 'its expansion project', 'a new warehouse', 'modern machinery', 'a second factory']);
    const num = numeric(nominal, [
      [cash, `Took the nominal value to be the cash needed and ignored the ${word}.`],
      premium
        ? [cash - (cash * pct) / 100, `Deducted ${pct}% of the cash needed; the premium is ${pct}% of the nominal value, not of the cash.`]
        : [cash + (cash * pct) / 100, `Added ${pct}% of the cash needed; the discount is ${pct}% of the nominal value, not of the cash.`],
      premium
        ? [cash + (cash * pct) / 100, 'Added the premium to the cash needed; at a premium the nominal value is less than the cash raised.']
        : [cash - (cash * pct) / 100, 'Deducted the discount from the cash needed; at a discount the nominal value is more than the cash raised.'],
    ]);
    return num && {
      prompt: rng.pick([
        `${rng.pick(COMPANIES)} needs ${inr(cash)} in cash for ${purpose}. It will raise the money by issuing ${r}% Debentures of ₹100 each at a ${word} of ${pct}%. What nominal value of debentures must it issue?`,
        `To pay for ${purpose}, ${rng.pick(COMPANIES)} must collect ${inr(cash)} from an issue of ${r}% Debentures of ₹100 each at a ${word} of ${pct}%. What is the nominal value of the debentures to be issued?`,
      ]),
      ...num,
      explanation: [
        `Each debenture of ₹100 brings in ${inr(price)}.`,
        `Number of debentures = ${inr(cash)} / ${inr(price)} = ${count(n)}.`,
        `Nominal value = ${count(n)} x ₹100 = ${inr(nominal)}.`,
      ],
      hints: ['Find what one debenture brings in, then divide the cash needed by it.', 'The premium or discount is a percentage of the face value, not of the cash.'],
    };
  },
  verify: (q) => {
    const [cash] = amountsIn(q.prompt);
    const m = /a (premium|discount) of (\d+)%/.exec(q.prompt);
    return !!m && (q.answer / 100) * (m[1] === 'premium' ? 100 + Number(m[2]) : 100 - Number(m[2])) === cash * 100;
  },
});

/** An issue of debentures of ₹100 payable in two instalments: `app` rupees a debenture on application, the rest on allotment. */
function drawInstalments(rng: Rng, at: IssueAt, redeemAtPremium = false): { i: Issue; app: number } {
  const i: Issue = {
    n: rng.step(1000, 20000, 1000),
    rate: rng.pick(RATES),
    face: 100,
    prem: at === 'premium' ? rng.pick([5, 10, 20]) : 0,
    disc: at === 'discount' ? rng.pick([4, 5, 10]) : 0,
    red: redeemAtPremium ? rng.pick([5, 8, 10]) : 0,
  };
  return { i, app: rng.pick([20, 25, 30, 40, 50]) };
}
/** How the money is payable, after the terms of issue. */
const payable = (i: Issue, app: number): string =>
  `payable ${inr(app)} on application and the balance on allotment${i.prem > 0 ? ', the premium with it' : i.disc > 0 ? ', the discount being allowed then' : ''}`;
const appIn = (s: string): number => toInt(/payable ₹([\d,]+) on application/.exec(s)?.[1] ?? '0');

const instalmentAmount = numericTemplate({
  id: 'deb-instalment-amount', topicId: T, conceptId: 'deb-issue-cash', difficulty: 'medium', unit: 'rupees',
  generate: (rng) => {
    const { i, app } = drawInstalments(rng, rng.pick(['premium', 'premium', 'discount', 'discount', 'par'] as const));
    const price = priceOf(i), due = i.n * (price - app);
    const base = `${rng.pick(COMPANIES)} issued ${lot(i)} ${issueTerms(rng, i)}, ${payable(i, app)}. All the debentures were applied for and allotted.`;
    if (rng.int(0, 2) > 0) {
      const num = numeric(due, [
        [i.n * price, 'Gave the whole issue price; the application money has already been received.'],
        [i.n * app, 'Gave the application money, not the amount due on allotment.'],
        ...(i.prem > 0 ? ([[i.n * (100 - app), 'Took the balance of the face value and left out the premium, which is payable with the allotment money.'], [i.n * (100 - i.prem - app), 'Deducted the premium instead of adding it.']] as [number, string][]) : []),
        ...(i.disc > 0 ? ([[i.n * (100 - app), 'Took the balance of the face value and forgot the discount allowed on allotment.'], [i.n * (100 + i.disc - app), 'Added the discount instead of deducting it.']] as [number, string][]) : []),
      ]);
      return num && {
        prompt: `${base} How much money is due on allotment?`,
        ...num,
        explanation: [
          i.prem + i.disc > 0 ? `Issue price = ₹100 ${i.prem > 0 ? '+' : '-'} ${inr(i.prem + i.disc)} = ${inr(price)} per debenture.` : 'Issue price = ₹100 per debenture.',
          `Due on allotment = ${inr(price)} - ${inr(app)} = ${inr(price - app)} per debenture.`,
          `On the issue: ${count(i.n)} x ${inr(price - app)} = ${inr(due)}.`,
        ],
        hints: H.issue,
      };
    }
    const credited = i.n * (100 - app);
    const num = numeric(credited, [
      [nominalOf(i), 'Gave the whole nominal value; part of it was credited when the application money was transferred.'],
      [i.n * app, 'Gave the part credited on application, not the part credited on allotment.'],
      ...(i.prem + i.disc > 0 ? ([[due, i.prem > 0 ? 'Gave the money due on allotment; the premium in it goes to Securities Premium A/c, not to the debentures.' : 'Gave the money due on allotment; the debentures are credited with the nominal value, the discount included.']] as [number, string][]) : []),
    ]);
    return num && {
      prompt: `${base} With what amount is ${i.rate}% Debentures A/c credited in the entry for the allotment money becoming due?`,
      ...num,
      explanation: [
        `Of the face value of ₹100, ${inr(app)} was credited to the debentures when the application money was transferred.`,
        `The rest of the face value is credited on allotment: ${count(i.n)} x ${inr(100 - app)} = ${inr(credited)}.`,
        i.prem > 0 ? `The premium of ${inr(i.n * i.prem)} is credited to Securities Premium A/c.` : i.disc > 0 ? `The discount of ${inr(i.n * i.disc)} is debited to Discount on Issue of Debentures A/c.` : 'There is no premium or discount.',
      ],
      hints: H.issue,
    };
  },
  verify: (q) => {
    const i = parseIssue(q.prompt), app = appIn(q.prompt);
    if (!i || !app) return false;
    const nominal = i.n * i.face, received = i.n * app;
    return q.answer / 100 === (q.prompt.includes('How much money') ? nominal + i.n * (i.prem - i.disc) - received : nominal - received);
  },
});

const overSubscription = numericTemplate({
  id: 'deb-oversubscription', topicId: T, conceptId: 'deb-issue-cash', difficulty: 'medium', unit: 'rupees',
  generate: (rng) => {
    const { i, app } = drawInstalments(rng, rng.pick(['par', 'premium'] as const));
    const applied = i.n + i.n * rng.pick([0.2, 0.25, 0.5]);
    const price = priceOf(i), excess = (applied - i.n) * app, due = i.n * (price - app);
    const base = `${rng.pick(COMPANIES)} invited applications for ${lot(i)} ${issueTerms(rng, i)}, ${payable(i, app)}. Applications were received for ${count(applied)} debentures.`;
    if (rng.int(0, 1) === 0) {
      const num = numeric(excess, [
        [(applied - i.n) * price, 'Refunded the whole issue price; only the application money had been received from these applicants.'],
        [applied * app, 'Gave all the application money received; only the part on the rejected applications is refunded.'],
        [i.n * app, 'Gave the application money on the debentures allotted, which the company keeps.'],
      ]);
      return num && {
        prompt: `${base} Applicants for ${count(i.n)} debentures were allotted in full; the other applications were rejected and their money was refunded. How much is refunded?`,
        ...num,
        explanation: [`Applications rejected = ${count(applied)} - ${count(i.n)} = ${count(applied - i.n)} debentures.`, `Refund = ${count(applied - i.n)} x ${inr(app)} = ${inr(excess)}.`],
        hints: ['Only the application money was received from the applicants who got no debentures.', 'Excess applications = debentures applied for - debentures allotted.'],
      };
    }
    const num = numeric(due - excess, [
      [due, 'Did not deduct the excess application money that is already in hand.'],
      [excess, 'Gave the excess application money, not the cash still to come on allotment.'],
      [due + excess, 'Added the excess application money instead of deducting it.'],
      ...(i.prem > 0 ? ([[i.n * (100 - app) - excess, 'Left out the premium, which is payable with the allotment money.']] as [number, string][]) : []),
    ]);
    return num && {
      prompt: `${base} Allotment was made pro rata to all the applicants, and the excess application money was kept towards the amount due on allotment. How much cash is received on allotment?`,
      ...num,
      explanation: [
        `Due on allotment = ${count(i.n)} x (${inr(price)} - ${inr(app)}) = ${inr(due)}.`,
        `Excess application money already received = (${count(applied)} - ${count(i.n)}) x ${inr(app)} = ${inr(excess)}.`,
        `Cash received on allotment = ${inr(due)} - ${inr(excess)} = ${inr(due - excess)}.`,
      ],
      hints: ['Work out the whole amount due on allotment first.', 'Excess application money kept by the company reduces the cash to be collected on allotment.'],
    };
  },
  verify: (q) => {
    const i = parseIssue(q.prompt), app = appIn(q.prompt);
    const applied = toInt(/received for ([\d,]+) debentures/.exec(q.prompt)?.[1] ?? '0');
    if (!i || !app || applied <= i.n) return false;
    const taken = applied * app;
    return q.answer / 100 === (q.prompt.includes('How much is refunded') ? taken - i.n * app : i.n * (i.face + i.prem) - taken);
  },
});

const journalApplicationTransfer = journalTemplate({
  id: 'deb-journal-application-transfer', topicId: T, conceptId: 'deb-issue-cash', difficulty: 'medium', computed: true,
  generate: (rng) => {
    const { i, app } = drawInstalments(rng, rng.pick(['par', 'premium'] as const));
    const applied = i.n + i.n * rng.pick([0.2, 0.25, 0.5]);
    const refund = rng.int(0, 1) === 0;
    const received = applied * app, kept = i.n * app, excess = received - kept;
    const how = refund
      ? `Applicants for ${count(i.n)} debentures were allotted in full, and the money of the other applicants was refunded.`
      : 'Allotment was made pro rata to all the applicants, and the excess application money was kept towards the amount due on allotment.';
    return {
      prompt: `${rng.pick(COMPANIES)} invited applications for ${lot(i)} ${issueTerms(rng, i)}, ${payable(i, app)}. Applications were received for ${count(applied)} debentures, with the application money. ${how} Pass one entry that disposes of all the application money on allotment.`,
      lines: entry(dr('debentureApplication', received), cr(debentures(i.rate), kept), cr(refund ? 'bank' : 'debentureAllotment', excess)),
      explanation: [
        `Application money received = ${count(applied)} x ${inr(app)} = ${inr(received)}: Debenture Application A/c is debited with all of it and so closed.`,
        `On the ${count(i.n)} debentures allotted, ${count(i.n)} x ${inr(app)} = ${inr(kept)} becomes part of the loan: ${i.rate}% Debentures A/c is credited.`,
        refund
          ? `The excess, ${inr(received)} - ${inr(kept)} = ${inr(excess)}, is paid back: Bank A/c is credited.`
          : `The excess, ${inr(received)} - ${inr(kept)} = ${inr(excess)}, is kept towards allotment: Debenture Allotment A/c is credited.`,
      ],
      distractorAccounts: [refund ? 'debentureAllotment' : 'bank', 'debentureApplicationAndAllotment', 'securitiesPremium', 'debentureholders'],
      hints: ['Debenture Application A/c is debited with all the application money received, so that it closes.', 'Only the application money on the debentures allotted goes to the debentures account; the excess is refunded or kept towards allotment.'],
    };
  },
  verify: (q) => {
    const i = parseIssue(q.prompt), app = appIn(q.prompt);
    const applied = toInt(/received for ([\d,]+) debentures/.exec(q.prompt)?.[1] ?? '0');
    if (!i || !app) return false;
    const other = q.prompt.includes('refunded') ? 'bank' : 'debentureAllotment';
    return isEntry(q, [['debentureApplication', 'Dr', applied * app], [debentures(i.rate), 'Cr', i.n * app], [other, 'Cr', (applied - i.n) * app]]);
  },
});

const journalAllotmentDue = journalTemplate({
  id: 'deb-journal-allotment-due', topicId: T, conceptId: 'deb-issue-cash', difficulty: 'medium', computed: true,
  generate: (rng) => {
    const { i, app } = drawInstalments(rng, rng.pick(['premium', 'discount'] as const));
    const price = priceOf(i), due = i.n * (price - app), credited = i.n * (100 - app);
    return {
      prompt: `${rng.pick(COMPANIES)} issued ${lot(i)} ${issueTerms(rng, i)}, ${payable(i, app)}. All the debentures were applied for, and the application money has been transferred to the debentures account. Pass the entry for the allotment money becoming due.`,
      lines: entry(dr('debentureAllotment', due), dr('discountOnIssueOfDebentures', i.n * i.disc), cr(debentures(i.rate), credited), cr('securitiesPremium', i.n * i.prem)),
      explanation: [
        `Money due on allotment = ${count(i.n)} x (${inr(price)} - ${inr(app)}) = ${inr(due)}: Debenture Allotment A/c is debited.`,
        i.prem > 0
          ? `The premium, ${count(i.n)} x ${inr(i.prem)} = ${inr(i.n * i.prem)}, is credited to Securities Premium A/c.`
          : `The discount, ${count(i.n)} x ${inr(i.disc)} = ${inr(i.n * i.disc)}, is a loss: Discount on Issue of Debentures A/c is debited.`,
        `The rest of the face value, ${count(i.n)} x ${inr(100 - app)} = ${inr(credited)}, is credited to ${i.rate}% Debentures A/c.`,
      ],
      distractorAccounts: ['debentureApplication', 'bank', i.prem > 0 ? 'discountOnIssueOfDebentures' : 'securitiesPremium', 'lossOnIssueOfDebentures', 'debentureApplicationAndAllotment'],
      hints: H.issue,
    };
  },
  verify: (q) => {
    const i = parseIssue(q.prompt), app = appIn(q.prompt);
    if (!i || !app) return false;
    const nominal = i.n * i.face;
    return isEntry(q, [
      ['debentureAllotment', 'Dr', nominal + i.n * (i.prem - i.disc) - i.n * app],
      ['discountOnIssueOfDebentures', 'Dr', i.n * i.disc],
      [debentures(i.rate), 'Cr', nominal - i.n * app],
      ['securitiesPremium', 'Cr', i.n * i.prem],
    ]);
  },
});

const journalLumpAllot = journalTemplate({
  id: 'deb-journal-lump-allot', topicId: T, conceptId: 'deb-issue-cash', difficulty: 'medium', computed: true,
  generate: (rng) => {
    const i = drawIssue(rng, rng.pick(['premium', 'discount'] as const));
    const nominal = nominalOf(i), cash = i.n * priceOf(i);
    return {
      prompt: `${rng.pick(COMPANIES)} issued ${lot(i)} ${issueTerms(rng, i)}. The whole amount was received with the applications and credited to Debenture Application and Allotment A/c. Pass the entry for the allotment of the debentures.`,
      lines: entry(dr('debentureApplicationAndAllotment', cash), dr('discountOnIssueOfDebentures', i.n * i.disc), cr(debentures(i.rate), nominal), cr('securitiesPremium', i.n * i.prem)),
      explanation: [
        `Money received = ${count(i.n)} x ${inr(priceOf(i))} = ${inr(cash)}: Debenture Application and Allotment A/c is debited and so closed.`,
        i.prem > 0
          ? `The premium, ${count(i.n)} x ${inr(i.prem)} = ${inr(i.n * i.prem)}, is credited to Securities Premium A/c.`
          : `The discount, ${count(i.n)} x ${inr(i.disc)} = ${inr(i.n * i.disc)}, is a loss: Discount on Issue of Debentures A/c is debited.`,
        `${i.rate}% Debentures A/c is credited with the nominal value, ${count(i.n)} x ${inr(i.face)} = ${inr(nominal)}.`,
      ],
      distractorAccounts: ['bank', 'debentureApplication', i.prem > 0 ? 'discountOnIssueOfDebentures' : 'securitiesPremium', 'premiumOnRedemptionOfDebentures', 'lossOnIssueOfDebentures'],
      hints: H.issue,
    };
  },
  verify: (q) => {
    const i = parseIssue(q.prompt);
    if (!i) return false;
    const nominal = i.n * i.face;
    return isEntry(q, [
      ['debentureApplicationAndAllotment', 'Dr', nominal + i.n * (i.prem - i.disc)],
      ['discountOnIssueOfDebentures', 'Dr', i.n * i.disc],
      [debentures(i.rate), 'Cr', nominal],
      ['securitiesPremium', 'Cr', i.n * i.prem],
    ]);
  },
});

/** The terms on which debentures of ₹100 go to a vendor, and what one debenture then settles. */
function drawVendorTerms(rng: Rng, par = false): { pct: number; price: number; words: string; premium: boolean } {
  const kind = par && rng.int(0, 3) === 0 ? 'par' : rng.int(0, 1) === 0 ? 'premium' : 'discount';
  if (kind === 'par') return { pct: 0, price: 100, words: 'at par', premium: false };
  const pct = rng.pick(kind === 'premium' ? [5, 10, 20, 25] : [5, 10]);
  return { pct, price: kind === 'premium' ? 100 + pct : 100 - pct, words: `at a ${kind} of ${pct}%`, premium: kind === 'premium' };
}
/** The issue price of a ₹100 debenture from the words "at par", "at a premium of 20%", "at a discount of 10%". */
const vendorPriceIn = (s: string): number => {
  const m = /₹100 each at (par|a (premium|discount) of (\d+)%)/.exec(s);
  return !m ? 0 : m[1] === 'par' ? 100 : m[2] === 'premium' ? 100 + Number(m[3]) : 100 - Number(m[3]);
};

const vendorNumberPct = numericTemplate({
  id: 'deb-vendor-number-pct', topicId: T, conceptId: 'deb-vendor', difficulty: 'medium', unit: 'number',
  generate: (rng) => {
    const t = drawVendorTerms(rng);
    const n = rng.step(800, 16000, 400), r = rng.pick(RATES), settled = n * t.price;
    const cheque = rng.int(0, 1) === 0 ? 0 : rng.step(50000, 300000, 10000);
    const pc = settled + cheque, v = rng.pick(VENDORS), a = rng.pick(ASSET_BOUGHT);
    const num = numeric(n, [
      [settled / 100, 'Divided by the face value; each debenture settles its issue price.'],
      t.premium
        ? [(settled / 100) * ((100 - t.pct) / 100), `Divided by the face value and then cut the number by ${t.pct}%; divide by the issue price of ${inr(t.price)} instead.`]
        : [(settled / 100) * ((100 + t.pct) / 100), `Divided by the face value and then raised the number by ${t.pct}%; divide by the issue price of ${inr(t.price)} instead.`],
      [settled / (t.premium ? 100 - t.pct : 100 + t.pct), t.premium ? 'Deducted the premium from the face value to get the issue price; a premium is added.' : 'Added the discount to the face value to get the issue price; a discount is deducted.'],
      ...(cheque > 0 ? ([[pc / t.price, 'Ignored the cheque; only the balance is settled by debentures.']] as [number, string][]) : []),
    ], 1);
    return num && {
      prompt: `${rng.pick(COMPANIES)} bought ${a.text} from ${v} for ${inr(pc)}. ${cheque > 0 ? `It paid ${inr(cheque)} by cheque and settled the balance` : 'It settled the whole amount'} by issuing ${r}% Debentures of ₹100 each ${t.words}. How many debentures were issued to ${v}?`,
      ...num,
      explanation: [
        ...(cheque > 0 ? [`Amount settled by debentures = ${inr(pc)} - ${inr(cheque)} = ${inr(settled)}.`] : []),
        `Issue price = ₹100 ${t.premium ? '+' : '-'} ${inr(t.pct)} = ${inr(t.price)} per debenture.`,
        `Number of debentures = ${inr(settled)} / ${inr(t.price)} = ${count(n)}.`,
      ],
      hints: H.vendor,
    };
  },
  verify: (q) => {
    const a = amountsIn(q.prompt), price = vendorPriceIn(q.prompt);
    const settled = q.prompt.includes('by cheque') ? a[0] - a[1] : a[0];
    return price > 0 && q.answer * price === settled;
  },
});

/** The assets a business may hand over, from those that are usually worth most to those worth least. */
const TAKEOVER_ASSETS: { id: string; name: string }[] = [
  { id: 'land', name: 'land' },
  { id: 'building', name: 'building' },
  { id: 'machinery', name: 'machinery' },
  { id: 'stock', name: 'stock' },
  { id: 'debtors', name: 'debtors' },
  { id: 'furniture', name: 'furniture' },
];
interface Takeover {
  assets: { id: string; name: string; value: number }[];
  creditors: number;
  /** The purchase consideration. */
  pc: number;
  /** Purchase consideration less net assets: goodwill when above zero, a capital reserve when below. */
  diff: number;
}
/**
 * A business taken over for `pc` rupees: three assets and the creditors, whose net value differs from the
 * consideration by between ₹20,000 and ₹2,00,000 either way. Null when the figures do not make a sensible business.
 */
function drawTakeover(rng: Rng, pc: number): Takeover | null {
  const diff = rng.step(20000, 200000, 10000) * (rng.int(0, 2) === 0 ? -1 : 1);
  const creditors = rng.step(40000, 240000, 10000);
  const total = pc - diff + creditors; // the assets taken over
  if (diff >= pc / 2 || total < 300000) return null;
  // Three of the assets, kept in the order of the list, with the largest value on the first of them.
  const chosen = new Set(rng.shuffle(TAKEOVER_ASSETS).slice(0, 3));
  const picked = TAKEOVER_ASSETS.filter((a) => chosen.has(a));
  const first = Math.floor((total * rng.pick([0.45, 0.5, 0.55])) / 10000) * 10000;
  const second = Math.floor((total * rng.pick([0.25, 0.3])) / 10000) * 10000;
  const values = [first, second, total - first - second];
  if (values[2] < 20000 || values[2] > second) return null;
  return { assets: picked.map((a, k) => ({ ...a, value: values[k] })), creditors, pc, diff };
}
/** "took over the business of Sharma Traders: machinery ₹4,00,000, stock ₹1,50,000, furniture ₹60,000 and creditors ₹80,000". */
const tookOver = (t: Takeover, from: string): string =>
  `took over the business of ${from}: ${t.assets.map((a) => `${a.name} ${inr(a.value)}`).join(', ')} and creditors ${inr(t.creditors)}`;
const netAssets = (t: Takeover): number => t.assets.reduce((s, a) => s + a.value, 0) - t.creditors;
const netWorking = (t: Takeover): string =>
  `Net assets = ${t.assets.map((a) => inr(a.value)).join(' + ')} - ${inr(t.creditors)} = ${inr(netAssets(t))}.`;

const vendorGoodwill = numericTemplate({
  id: 'deb-vendor-goodwill', topicId: T, conceptId: 'deb-vendor', difficulty: 'medium', unit: 'rupees',
  generate: (rng) => {
    const t = drawTakeover(rng, rng.step(400000, 2400000, 50000));
    if (!t) return null;
    const total = netAssets(t) + t.creditors, net = netAssets(t), goodwill = t.diff > 0, r = rng.pick(RATES);
    const num = numeric(Math.abs(t.diff), [
      [goodwill ? t.pc - total : total - t.pc, 'Ignored the creditors taken over; they reduce the net assets acquired.'],
      [net, goodwill ? 'Gave the net assets taken over, not the excess of the purchase consideration over them.' : 'Gave the net assets taken over, not their excess over the purchase consideration.'],
      [goodwill ? t.pc - total - t.creditors : total + t.creditors - t.pc, 'Added the creditors to the assets instead of deducting them.'],
      [t.pc, 'Gave the purchase consideration itself.'],
    ]);
    return num && {
      prompt: `${rng.pick(COMPANIES)} ${tookOver(t, rng.pick(VENDORS))}. The purchase consideration of ${inr(t.pc)} was settled by issuing ${r}% Debentures at par. What amount is ${goodwill ? 'debited to Goodwill A/c' : 'credited to Capital Reserve A/c'} on the takeover?`,
      ...num,
      explanation: [
        netWorking(t),
        goodwill
          ? `The company pays more than the net assets: goodwill = ${inr(t.pc)} - ${inr(net)} = ${inr(t.diff)}.`
          : `The company pays less than the net assets: capital reserve = ${inr(net)} - ${inr(t.pc)} = ${inr(-t.diff)}.`,
      ],
      hints: ['Net assets = assets taken over - liabilities taken over.', 'Purchase consideration above net assets is goodwill; below net assets it is a capital reserve.'],
    };
  },
  verify: (q) => {
    const a = amountsIn(q.prompt); // three assets, the creditors, the purchase consideration
    const net = a[0] + a[1] + a[2] - a[3];
    return a.length === 5 && q.answer / 100 === (q.prompt.includes('Goodwill A/c') ? a[4] - net : net - a[4]);
  },
});

const vendorResult = mcqTemplate({
  id: 'deb-vendor-result', topicId: T, conceptId: 'deb-vendor', difficulty: 'medium',
  generate: (rng) => {
    const t = drawTakeover(rng, rng.step(400000, 2400000, 50000));
    if (!t) return null;
    const total = netAssets(t) + t.creditors, goodwill = t.diff > 0, x = Math.abs(t.diff);
    const gross = Math.abs(t.pc - total);
    if (gross === 0) return null; // the consideration equals the assets: ignoring the creditors would give neither goodwill nor a reserve
    return choice(
      `${rng.pick(COMPANIES)} ${tookOver(t, rng.pick(VENDORS))}. The purchase consideration of ${inr(t.pc)} was paid by an issue of ${rng.pick(RATES)}% Debentures. What arises on the takeover?`,
      goodwill ? `Goodwill of ${inr(x)}` : `Capital reserve of ${inr(x)}`,
      [
        [goodwill ? `Capital reserve of ${inr(x)}` : `Goodwill of ${inr(x)}`, goodwill ? 'Found the right difference but named it the wrong way round: paying more than the net assets is goodwill.' : 'Found the right difference but named it the wrong way round: paying less than the net assets is a capital reserve.'],
        [`${t.pc > total ? 'Goodwill' : 'Capital reserve'} of ${inr(gross)}`, 'Compared the purchase consideration with the assets alone and ignored the creditors taken over.'],
        [`${t.pc > total ? 'Capital reserve' : 'Goodwill'} of ${inr(gross)}`, 'Ignored the creditors taken over, and named the difference the wrong way round.'],
        ['Neither goodwill nor a capital reserve', 'Assumed the purchase consideration equals the net assets; here the two differ.'],
      ],
      `${netWorking(t)} Purchase consideration is ${inr(t.pc)}, which is ${goodwill ? 'more' : 'less'} than the net assets by ${inr(x)}: ${goodwill ? 'goodwill, debited to Goodwill A/c' : 'a capital reserve, credited to Capital Reserve A/c'}.`,
      ['Net assets = assets taken over - liabilities taken over.', 'Paying more than the net assets is goodwill; paying less is a capital reserve.']);
  },
  verify: (q) => {
    const a = amountsIn(q.prompt);
    const diff = a[4] - (a[0] + a[1] + a[2] - a[3]);
    return optionText(q) === `${diff > 0 ? 'Goodwill' : 'Capital reserve'} of ${inr(Math.abs(diff))}`;
  },
});

const journalVendorIssue = journalTemplate({
  id: 'deb-journal-vendor-issue', topicId: T, conceptId: 'deb-vendor', difficulty: 'medium',
  generate: (rng) => {
    const t = drawVendorTerms(rng, true);
    const n = rng.step(1000, 20000, 500), r = rng.pick(RATES), pc = n * t.price, nominal = n * 100;
    const v = rng.pick(VENDORS), a = rng.pick(ASSET_BOUGHT);
    const gap = Math.abs(nominal - pc);
    return {
      prompt: `${rng.pick(COMPANIES)} bought ${a.text} from ${v} for ${inr(pc)} and credited ${v} with that amount. It then settled the amount by issuing ${r}% Debentures of ₹100 each ${t.words}. Pass the entry for the issue of the debentures to ${v}.`,
      lines: entry(dr(vendor(v), pc), dr('discountOnIssueOfDebentures', t.premium || t.pct === 0 ? 0 : gap), cr(debentures(r), nominal), cr('securitiesPremium', t.premium ? gap : 0)),
      explanation: [
        `Number of debentures = ${inr(pc)} / ${inr(t.price)} = ${count(n)}; nominal value = ${count(n)} x ₹100 = ${inr(nominal)}.`,
        `The amount owed to ${v} is settled: ${v} is debited with ${inr(pc)}.`,
        `${r}% Debentures A/c is credited with the nominal value, ${inr(nominal)}.`,
        t.pct === 0
          ? 'The issue is at par, so there is neither a premium nor a discount.'
          : t.premium
            ? `The premium, ${count(n)} x ${inr(t.pct)} = ${inr(gap)}, is credited to Securities Premium A/c.`
            : `The discount, ${count(n)} x ${inr(t.pct)} = ${inr(gap)}, is debited to Discount on Issue of Debentures A/c.`,
      ],
      distractorAccounts: [a.id, 'bank', t.premium ? 'discountOnIssueOfDebentures' : 'securitiesPremium', 'debentureApplicationAndAllotment', 'goodwill'],
      hints: H.vendor,
    };
  },
  verify: (q) => {
    const [pc] = amountsIn(q.prompt), price = vendorPriceIn(q.prompt);
    const rate = Number(/(\d+)% Debentures/.exec(q.prompt)?.[1]);
    const nominal = (pc * 100) / price;
    const party = q.expected.find((l) => l.accountId.startsWith('vendor:'));
    return !!party && q.prompt.includes(party.accountId.slice(7)) && posted(q, party.accountId, 'Dr') === pc && posted(q, debentures(rate), 'Cr') === nominal
      && posted(q, 'securitiesPremium', 'Cr') === Math.max(0, pc - nominal) && posted(q, 'discountOnIssueOfDebentures', 'Dr') === Math.max(0, nominal - pc);
  },
});

const journalBusinessPurchase = journalTemplate({
  id: 'deb-journal-business-purchase', topicId: T, conceptId: 'deb-vendor', difficulty: 'medium',
  generate: (rng) => {
    const t = drawTakeover(rng, rng.step(400000, 2400000, 50000));
    if (!t) return null;
    const v = rng.pick(VENDORS), r = rng.pick(RATES), net = netAssets(t);
    return {
      prompt: `${rng.pick(COMPANIES)} ${tookOver(t, v)}. The purchase consideration of ${inr(t.pc)} is to be settled by an issue of ${r}% Debentures. Pass the entry for the takeover of the assets and liabilities.`,
      lines: entry(
        ...t.assets.map((a) => dr(a.id, a.value)),
        dr('goodwill', Math.max(0, t.diff)),
        cr('creditors', t.creditors),
        cr(vendor(v), t.pc),
        cr('capitalReserve', Math.max(0, -t.diff)),
      ),
      explanation: [
        'Each asset taken over is debited at its agreed value, and the creditors taken over are credited.',
        `${v} is credited with the purchase consideration, ${inr(t.pc)}, until the debentures are issued.`,
        netWorking(t),
        t.diff > 0
          ? `The consideration is more than the net assets by ${inr(t.pc)} - ${inr(net)} = ${inr(t.diff)}: Goodwill A/c is debited.`
          : `The consideration is less than the net assets by ${inr(net)} - ${inr(t.pc)} = ${inr(-t.diff)}: Capital Reserve A/c is credited.`,
      ],
      distractorAccounts: [t.diff > 0 ? 'capitalReserve' : 'goodwill', debentures(r), 'securitiesPremium', 'bank'],
      hints: ['Debit the assets, credit the liabilities and credit the vendor with the purchase consideration.', 'The difference that balances the entry is goodwill (a debit) or a capital reserve (a credit).'],
    };
  },
  verify: (q) => {
    const a = amountsIn(q.prompt);
    const diff = a[4] - (a[0] + a[1] + a[2] - a[3]);
    const party = q.expected.find((l) => l.accountId.startsWith('vendor:'));
    return !!party && posted(q, party.accountId, 'Cr') === a[4] && posted(q, 'creditors', 'Cr') === a[3]
      && posted(q, 'goodwill', 'Dr') === Math.max(0, diff) && posted(q, 'capitalReserve', 'Cr') === Math.max(0, -diff);
  },
});

const lossOnIssue = numericTemplate({
  id: 'deb-loss-on-issue', topicId: T, conceptId: 'deb-redemption-terms', difficulty: 'medium', unit: 'rupees',
  generate: (rng) => {
    const discount = rng.int(0, 2) > 0;
    const i = drawIssue(rng, discount ? 'discount' : 'premium', true);
    const years = rng.int(4, 8);
    const loss = i.n * (i.disc + i.red);
    const num = discount
      ? numeric(loss, [
          [i.n * i.disc, 'Counted only the discount; the premium payable on redemption is also a loss on the issue.'],
          [i.n * i.red, 'Counted only the premium on redemption; the discount allowed on issue is also a loss.'],
          [i.n * Math.abs(i.red - i.disc), 'Set the discount off against the premium on redemption; the two are added.'],
        ])
      : numeric(loss, [
          [i.n * (i.red - i.prem), 'Set the premium received on issue against the premium on redemption; the premium on issue goes to Securities Premium A/c and the loss is recorded in full.'],
          [i.n * (i.red + i.prem), 'Added the premium received on issue, which is a gain, to the loss.'],
          [i.n * i.prem, 'Gave the premium received on issue, which is credited to Securities Premium A/c.'],
          [i.n * (i.face + i.red), 'Gave the whole amount payable on redemption; the loss is only the premium.'],
        ]);
    return num && {
      prompt: `${rng.pick(COMPANIES)} issued ${lot(i)} ${issueTerms(rng, i)}, ${redTerms(i, years)}. The company records the whole loss on the issue in Loss on Issue of Debentures A/c. What amount is debited to that account at the time of issue?`,
      ...num,
      explanation: discount
        ? [
            `Discount on issue = ${count(i.n)} x ${inr(i.disc)} = ${inr(i.n * i.disc)}.`,
            `Premium payable on redemption = ${count(i.n)} x ${inr(i.red)} = ${inr(i.n * i.red)}.`,
            `Loss on issue = ${inr(i.n * i.disc)} + ${inr(i.n * i.red)} = ${inr(loss)}.`,
          ]
        : [
            `Premium payable on redemption = ${count(i.n)} x ${inr(i.red)} = ${inr(loss)}: this is the loss on issue.`,
            `The premium received on issue, ${inr(i.n * i.prem)}, is credited to Securities Premium A/c; it is not deducted from the loss in the entry.`,
          ],
      hints: H.cases,
    };
  },
  verify: (q) => {
    const i = parseIssue(q.prompt);
    return !!i && i.red > 0 && q.answer / 100 === (i.n * i.face * (i.disc + i.red)) / i.face;
  },
});

const journalSixCases = journalTemplate({
  id: 'deb-journal-six-cases', topicId: T, conceptId: 'deb-redemption-terms', difficulty: 'medium', computed: true,
  generate: (rng) => {
    const at = rng.pick(['par', 'discount', 'discount', 'premium'] as const);
    const i = drawIssue(rng, at, true);
    const years = rng.int(4, 8);
    const nominal = nominalOf(i), cash = i.n * priceOf(i), loss = i.n * (i.disc + i.red);
    return {
      prompt: `${rng.pick(COMPANIES)} issued ${lot(i)} ${issueTerms(rng, i)}, ${redTerms(i, years)}. The whole amount was received with the applications and credited to Debenture Application and Allotment A/c. Pass the entry for the allotment, providing for the premium payable on redemption. (The whole loss on the issue is recorded in Loss on Issue of Debentures A/c.)`,
      lines: entry(
        dr('debentureApplicationAndAllotment', cash),
        dr('lossOnIssueOfDebentures', loss),
        cr(debentures(i.rate), nominal),
        cr('securitiesPremium', i.n * i.prem),
        cr('premiumOnRedemptionOfDebentures', i.n * i.red),
      ),
      explanation: [
        `Money received = ${count(i.n)} x ${inr(priceOf(i))} = ${inr(cash)}: Debenture Application and Allotment A/c is debited and so closed.`,
        `${i.rate}% Debentures A/c is credited with the nominal value, ${inr(nominal)}.`,
        ...(i.prem > 0 ? [`The premium on issue, ${count(i.n)} x ${inr(i.prem)} = ${inr(i.n * i.prem)}, is credited to Securities Premium A/c.`] : []),
        `The premium payable on redemption, ${count(i.n)} x ${inr(i.red)} = ${inr(i.n * i.red)}, is a liability: Premium on Redemption of Debentures A/c is credited.`,
        i.disc > 0
          ? `Loss on issue = discount ${inr(i.n * i.disc)} + premium on redemption ${inr(i.n * i.red)} = ${inr(loss)}: Loss on Issue of Debentures A/c is debited.`
          : `Loss on issue = the premium on redemption, ${inr(loss)}: Loss on Issue of Debentures A/c is debited.`,
      ],
      distractorAccounts: ['discountOnIssueOfDebentures', 'securitiesPremium', 'bank', 'debentureholders', 'debentureApplication'],
      hints: H.cases,
    };
  },
  verify: (q) => {
    const i = parseIssue(q.prompt);
    if (!i || i.red === 0) return false;
    const nominal = i.n * i.face;
    return isEntry(q, [
      ['debentureApplicationAndAllotment', 'Dr', nominal + i.n * (i.prem - i.disc)],
      ['lossOnIssueOfDebentures', 'Dr', i.n * (i.disc + i.red)],
      [debentures(i.rate), 'Cr', nominal],
      ['securitiesPremium', 'Cr', i.n * i.prem],
      ['premiumOnRedemptionOfDebentures', 'Cr', i.n * i.red],
    ]);
  },
});

const caseAmount = numericTemplate({
  id: 'deb-case-amount', topicId: T, conceptId: 'deb-redemption-terms', difficulty: 'medium', unit: 'rupees',
  generate: (rng) => {
    const discount = rng.int(0, 1) === 0;
    const i = drawIssue(rng, discount ? 'discount' : 'premium', true);
    const years = rng.int(4, 8);
    const nominal = nominalOf(i), cash = i.n * priceOf(i), payableOnRedemption = i.n * (i.face + i.red);
    const base = `${rng.pick(COMPANIES)} issued ${lot(i)} ${issueTerms(rng, i)}, ${redTerms(i, years)}. The whole amount was payable on application and was received.`;
    const ask = rng.int(0, 2);
    if (ask === 0) {
      const num = numeric(cash, [
        [nominal, discount ? 'Gave the nominal value and ignored the discount on issue.' : 'Gave the nominal value and ignored the premium on issue.'],
        [payableOnRedemption, 'Used the redemption price; the premium on redemption is paid out later, it is not received now.'],
        [cash - i.n * i.red, 'Deducted the premium payable on redemption from the money received; it does not change what the subscribers pay.'],
        [cash + i.n * i.red, 'Added the premium payable on redemption to the money received; it is paid by the company later, not received now.'],
      ]);
      return num && {
        prompt: `${base} How much money did the company receive on the issue?`,
        ...num,
        explanation: [`Issue price = ${inr(i.face)} ${discount ? '-' : '+'} ${inr(i.prem + i.disc)} = ${inr(priceOf(i))} per debenture.`, `Money received = ${count(i.n)} x ${inr(priceOf(i))} = ${inr(cash)}. The terms of redemption do not change it.`],
        hints: H.cases,
      };
    }
    if (ask === 1) {
      const num = numeric(payableOnRedemption, [
        [cash, 'Gave the money received on issue; redemption is at the nominal value plus the premium on redemption.'],
        [nominal, 'Left out the premium payable on redemption.'],
        [cash + i.n * i.red, 'Added the premium on redemption to the issue price; it is added to the nominal value.'],
      ]);
      return num && {
        prompt: `${base} What total amount has the company bound itself to pay the debentureholders on redemption?`,
        ...num,
        explanation: [`Redemption price = ${inr(i.face)} + ${inr(i.red)} = ${inr(i.face + i.red)} per debenture, whatever the issue price was.`, `Payable on redemption = ${count(i.n)} x ${inr(i.face + i.red)} = ${inr(payableOnRedemption)}.`],
        hints: H.cases,
      };
    }
    if (discount) {
      const num = numeric(i.n * i.red, [
        [i.n * (i.disc + i.red), 'Gave the whole loss on issue; only the premium payable on redemption is credited to this account.'],
        [i.n * i.disc, 'Gave the discount on issue, which is part of the loss and not a liability.'],
        [payableOnRedemption, 'Gave the whole amount payable on redemption; the nominal value is in the debentures account.'],
      ]);
      return num && {
        prompt: `${base} What amount is credited to Premium on Redemption of Debentures A/c at the time of issue?`,
        ...num,
        explanation: [`Premium on redemption = ${pctOf(i, i.red)}% of ${inr(i.face)} = ${inr(i.red)} per debenture.`, `On the issue: ${count(i.n)} x ${inr(i.red)} = ${inr(i.n * i.red)}. The discount is not part of this liability.`],
        hints: H.cases,
      };
    }
    const num = numeric(i.n * i.prem, [
      [i.n * i.red, 'Gave the premium payable on redemption, which is credited to Premium on Redemption of Debentures A/c.'],
      [i.n * (i.prem + i.red), 'Added the two premiums; only the premium received on issue goes to Securities Premium A/c.'],
      [i.n * Math.abs(i.prem - i.red), 'Set one premium off against the other; each is recorded in full in its own account.'],
    ]);
    return num && {
      prompt: `${base} What amount is credited to Securities Premium A/c at the time of issue?`,
      ...num,
      explanation: [`Premium on issue = ${inr(i.prem)} per debenture.`, `On the issue: ${count(i.n)} x ${inr(i.prem)} = ${inr(i.n * i.prem)}. The premium on redemption goes to a separate account.`],
      hints: H.cases,
    };
  },
  verify: (q) => {
    const i = parseIssue(q.prompt);
    if (!i) return false;
    const nominal = i.n * i.face, a = q.answer / 100;
    if (q.prompt.includes('How much money')) return a === nominal + i.n * (i.prem - i.disc);
    if (q.prompt.includes('on redemption?')) return a === nominal + i.n * i.red;
    return a === i.n * (q.prompt.includes('Securities Premium A/c') ? i.prem : i.red);
  },
});

/** The dates on which debentures are issued part-way through a year that ends on 31 March, with the months left in it. */
const ISSUE_DATES: { month: string; months: number; nextYear?: true }[] = [
  { month: 'May', months: 11 }, { month: 'June', months: 10 }, { month: 'July', months: 9 }, { month: 'August', months: 8 },
  { month: 'September', months: 7 }, { month: 'October', months: 6 }, { month: 'November', months: 5 }, { month: 'December', months: 4 },
  { month: 'January', months: 3, nextYear: true }, { month: 'February', months: 2, nextYear: true },
];
/** A rate at which interest on a whole number of lakhs for `months` months is in whole rupees. */
const rateFor = (rng: Rng, months: number): number => rng.pick(RATES.filter((r) => (r * months) % 3 === 0));
const MONTHS_LEFT: Record<string, number> = Object.fromEntries(ISSUE_DATES.map((d) => [d.month, d.months]));
/** The months to 31 March from the "On 1 <month> <year>" a prompt opens with (12 for 1 April). */
const monthsIn = (s: string): number => {
  const m = /On 1 (\w+) \d{4}/.exec(s);
  return !m ? 0 : m[1] === 'April' ? 12 : (MONTHS_LEFT[m[1]] ?? 0);
};

const interestPartYear = numericTemplate({
  id: 'deb-interest-part-year', topicId: T, conceptId: 'deb-interest', difficulty: 'medium', unit: 'rupees',
  generate: (rng) => {
    const when = rng.pick(ISSUE_DATES), y = rng.int(2023, 2025);
    const i = { ...drawIssue(rng, rng.pick(['premium', 'discount'] as const)), rate: rateFor(rng, when.months) };
    const nominal = nominalOf(i), annual = (nominal * i.rate) / 100, m = when.months;
    const num = numeric((annual * m) / 12, [
      [annual, `Charged a full year although the debentures were outstanding for ${m} months.`],
      [(annual * (12 - m)) / 12, 'Counted the months before the issue instead of the months after it.'],
      [(i.n * priceOf(i) * i.rate * m) / 1200, 'Worked the interest on the issue price; interest is on the nominal value.'],
      [(annual * (m - 1)) / 12, 'Left out the month of issue when counting the months.'],
    ]);
    return num && {
      prompt: `On 1 ${when.month} ${when.nextYear ? y + 1 : y}, ${rng.pick(COMPANIES)} issued ${lot(i)} ${issueTerms(rng, i)}. Its accounting year ends on 31 March. What is the interest on these debentures for the year ended 31 March ${y + 1}?`,
      ...num,
      explanation: [
        `Nominal value = ${count(i.n)} x ${inr(i.face)} = ${inr(nominal)}; interest for a full year = ${i.rate}% of it = ${inr(annual)}.`,
        `From 1 ${when.month} to 31 March is ${m} months.`,
        `Interest = ${inr(annual)} x ${m}/12 = ${inr((annual * m) / 12)}.`,
      ],
      hints: H.interest,
    };
  },
  verify: (q) => {
    const i = parseIssue(q.prompt), m = monthsIn(q.prompt);
    return !!i && m > 0 && q.answer * 12 === i.n * i.face * i.rate * m;
  },
});

const journalInterestPartYear = journalTemplate({
  id: 'deb-journal-interest-part-year', topicId: T, conceptId: 'deb-interest', difficulty: 'medium', computed: true,
  generate: (rng) => {
    const when = rng.pick(ISSUE_DATES.filter((d) => d.months !== 6)), y = rng.int(2023, 2025);
    const i = { ...drawIssue(rng, rng.pick(['par', 'premium', 'discount'] as const)), rate: 0 };
    const closing = rng.int(0, 2) === 0;
    // The first interest date after the issue: 30 September for an issue before October, otherwise 31 March.
    const m = closing ? when.months : when.months > 6 ? when.months - 6 : when.months;
    i.rate = rateFor(rng, m);
    const nominal = nominalOf(i), interest = (nominal * i.rate * m) / 1200;
    const base = `On 1 ${when.month} ${when.nextYear ? y + 1 : y}, ${rng.pick(COMPANIES)} issued ${lot(i)} ${issueTerms(rng, i)}. Interest is payable half-yearly on 30 September and 31 March, and the accounting year ends on 31 March.`;
    if (closing) {
      return {
        prompt: `${base} Pass the entry on 31 March ${y + 1} to transfer the debenture interest of the year to the Statement of Profit and Loss.`,
        lines: entry(dr('statementOfProfitAndLoss', interest), cr('debentureInterest', interest)),
        explanation: [
          `From 1 ${when.month} to 31 March is ${m} months.`,
          `Interest for the year = ${inr(nominal)} x ${i.rate}% x ${m}/12 = ${inr(interest)}.`,
          'It is an expense of the year: the Statement of Profit and Loss is debited and Debenture Interest A/c is credited and closed.',
        ],
        distractorAccounts: ['debentureholders', debentures(i.rate), 'profitAndLoss', 'bank'],
        hints: H.interest,
      };
    }
    const first = when.months > 6 ? `30 September ${y}` : `31 March ${y + 1}`;
    return {
      prompt: `${base} Pass the entry on ${first} for the interest becoming due to the debentureholders.`,
      lines: entry(dr('debentureInterest', interest), cr('debentureholders', interest)),
      explanation: [
        `From 1 ${when.month} to ${first} is ${m === 1 ? 'one month' : `${m} months`}, so the first payment is not for a full half-year.`,
        `Interest due = ${inr(nominal)} x ${i.rate}% x ${m}/12 = ${inr(interest)}.`,
        'Debenture Interest A/c (the expense) is debited and Debentureholders A/c (the amount owed) is credited.',
      ],
      distractorAccounts: ['statementOfProfitAndLoss', debentures(i.rate), 'interestPaid', 'bank'],
      hints: H.interest,
    };
  },
  verify: (q) => {
    const i = parseIssue(q.prompt), left = monthsIn(q.prompt);
    if (!i || !left) return false;
    const closing = q.prompt.includes('to transfer the debenture interest');
    const months = closing ? left : q.prompt.includes('Pass the entry on 30 September') ? left - 6 : left;
    const interest = (i.n * i.face * i.rate * months) / 1200;
    return closing ? isEntry(q, [['statementOfProfitAndLoss', 'Dr', interest], ['debentureInterest', 'Cr', interest]]) : isEntry(q, [['debentureInterest', 'Dr', interest], ['debentureholders', 'Cr', interest]]);
  },
});

const LOSS_ACCOUNTS = [
  { id: 'discountOnIssueOfDebentures', name: 'Discount on Issue of Debentures A/c', other: 'lossOnIssueOfDebentures' },
  { id: 'lossOnIssueOfDebentures', name: 'Loss on Issue of Debentures A/c', other: 'discountOnIssueOfDebentures' },
];

const writeOffSplit = numericTemplate({
  id: 'deb-write-off-split', topicId: T, conceptId: 'deb-write-off', difficulty: 'medium', unit: 'rupees',
  generate: (rng) => {
    const years = rng.pick([4, 5, 8, 10]), y = rng.int(2024, 2026), acct = rng.pick(LOSS_ACCOUNTS);
    const loss = years * rng.step(5000, 40000, 1000);
    const short = rng.int(0, 2) > 0;
    const sp = short ? Math.floor((loss * rng.pick([0.2, 0.3, 0.4, 0.6, 0.7])) / 1000) * 1000 : loss + rng.step(10000, 120000, 5000);
    const base = `${rng.pick(COMPANIES)} allotted debentures, redeemable after ${years} years, during the year ended 31 March ${y}. ${acct.name} shows ${inr(loss)} and Securities Premium A/c has a balance of ${inr(sp)}.`;
    if (short) {
      const num = numeric(loss - sp, [
        [loss, 'Charged the whole amount to the Statement of Profit and Loss; Securities Premium is used first.'],
        [sp, 'Gave the part borne by Securities Premium, not the part charged to the Statement of Profit and Loss.'],
        [loss / years, 'Spread the amount over the life of the debentures; it is written off in full in the year of allotment.'],
        [(loss - sp) / years, 'Used Securities Premium first but then spread the rest over the life of the debentures; the rest is charged in full this year.'],
      ]);
      return num && {
        prompt: `${base} How much is charged to the Statement of Profit and Loss for the year when this amount is written off?`,
        ...num,
        explanation: [`Securities Premium is used first: ${inr(sp)}.`, `Charged to the Statement of Profit and Loss = ${inr(loss)} - ${inr(sp)} = ${inr(loss - sp)}, in the year of allotment.`],
        hints: H.writeOff,
      };
    }
    const num = numeric(sp - loss, [
      [sp, 'Left Securities Premium untouched and charged the Statement of Profit and Loss; Securities Premium is used first.'],
      [loss, 'Gave the amount written off, not the balance left in Securities Premium A/c.'],
      [sp - loss / years, 'Wrote off only one year\'s share; the whole amount is written off in the year of allotment.'],
    ]);
    return num && {
      prompt: `${base} What balance is left in Securities Premium A/c after this amount is written off?`,
      ...num,
      explanation: [`Securities Premium of ${inr(sp)} can bear the whole ${inr(loss)}, so nothing is charged to the Statement of Profit and Loss.`, `Balance left = ${inr(sp)} - ${inr(loss)} = ${inr(sp - loss)}.`],
      hints: H.writeOff,
    };
  },
  verify: (q) => {
    const [loss, sp] = amountsIn(q.prompt);
    return q.answer / 100 === Math.abs(loss - sp) && q.prompt.includes('What balance is left') === sp > loss;
  },
});

const journalWriteOff = journalTemplate({
  id: 'deb-journal-write-off', topicId: T, conceptId: 'deb-write-off', difficulty: 'medium',
  generate: (rng) => {
    const y = rng.int(2024, 2026), acct = rng.pick(LOSS_ACCOUNTS), r = rng.pick(RATES);
    const loss = rng.step(20000, 300000, 5000);
    const state = rng.int(0, 3);
    const sp = state === 0 ? 0 : state === 1 ? loss + rng.step(10000, 100000, 5000) : Math.max(5000, Math.floor((loss * rng.pick([0.2, 0.3, 0.4, 0.6, 0.7])) / 5000) * 5000);
    const fromSp = Math.min(sp, loss), fromPl = loss - fromSp;
    return {
      prompt: `During the year ended 31 March ${y}, ${rng.pick(COMPANIES)} allotted ${r}% Debentures, and ${acct.name} shows ${inr(loss)}. ${sp > 0 ? `Securities Premium A/c has a balance of ${inr(sp)}.` : 'There is no balance in Securities Premium A/c.'} Pass the entry at the end of the year to write this amount off.`,
      lines: entry(dr('securitiesPremium', fromSp), dr('statementOfProfitAndLoss', fromPl), cr(acct.id, loss)),
      explanation: [
        `The whole ${inr(loss)} is written off in the year of allotment: ${acct.name} is credited and closed.`,
        sp === 0 ? 'There is no Securities Premium to use.' : sp >= loss ? `Securities Premium of ${inr(sp)} bears all of it: Securities Premium A/c is debited with ${inr(loss)}.` : `Securities Premium is used first, as far as it goes: it is debited with ${inr(sp)}.`,
        ...(fromPl > 0 ? [`The ${sp > 0 ? 'balance' : 'whole amount'}, ${inr(fromPl)}, is charged to the Statement of Profit and Loss as a finance cost.`] : []),
      ],
      distractorAccounts: [acct.other, 'profitAndLoss', 'generalReserve', 'premiumOnRedemptionOfDebentures', debentures(r), 'securitiesPremium', 'statementOfProfitAndLoss'],
      hints: H.writeOff,
    };
  },
  verify: (q) => {
    const a = amountsIn(q.prompt);
    const loss = a[0], sp = q.prompt.includes('no balance in Securities Premium') ? 0 : a[1];
    const acct = LOSS_ACCOUNTS.find((x) => q.prompt.includes(x.name));
    return !!acct && isEntry(q, [['securitiesPremium', 'Dr', Math.min(sp, loss)], ['statementOfProfitAndLoss', 'Dr', Math.max(0, loss - sp)], [acct.id, 'Cr', loss]]);
  },
});

const medium: Template[] = [
  nominalToRaise, instalmentAmount, overSubscription, journalApplicationTransfer, journalAllotmentDue, journalLumpAllot,
  vendorNumberPct, vendorGoodwill, vendorResult, journalVendorIssue, journalBusinessPurchase,
  lossOnIssue, journalSixCases, caseAmount, interestPartYear, journalInterestPartYear, writeOffSplit, journalWriteOff,
];

// ===============================================================================================================
// COMPLEX
// ===============================================================================================================

/** The balance of Securities Premium a prompt gives: 0 for "no balance", otherwise the figure after "a balance of". */
const premiumBalanceIn = (s: string): number => toInt(/Securities Premium A\/c (?:had|has) a balance of ₹([\d,]+)/.exec(s)?.[1] ?? '0');

const complexPlCharge = numericTemplate({
  id: 'deb-complex-pl-charge', topicId: T, conceptId: 'deb-write-off', difficulty: 'complex', unit: 'rupees',
  generate: (rng) => {
    const y = rng.int(2023, 2025), years = rng.int(4, 8);
    const when = rng.int(0, 2) === 0 ? { month: 'April', months: 12, nextYear: undefined } : rng.pick(ISSUE_DATES);
    const i = { ...drawIssue(rng, 'discount', true), rate: rateFor(rng, when.months) };
    const m = when.months, nominal = nominalOf(i), annual = (nominal * i.rate) / 100, interest = (annual * m) / 12;
    const loss = i.n * (i.disc + i.red);
    const state = rng.int(0, 4);
    const sp = state === 0 ? 0 : state === 1 ? loss + rng.step(10000, 60000, 10000) : Math.max(1000, Math.floor((loss * rng.pick([0.25, 0.4, 0.5, 0.6, 0.75])) / 1000) * 1000);
    const charged = Math.max(0, loss - sp);
    const num = numeric(interest + charged, [
      ...(sp > 0 ? ([[interest + loss, 'Charged the whole loss on issue to the Statement of Profit and Loss; Securities Premium is used first.']] as [number, string][]) : []),
      ...(charged > 0
        ? ([
            [interest, 'Left out the loss on issue written off; what Securities Premium cannot bear is charged in the year of allotment.'],
            [charged, 'Left out the interest of the year.'],
            [interest + Math.max(0, i.n * i.disc - sp), 'Counted only the discount as the loss on issue; the premium payable on redemption is part of it.'],
            [interest + charged / years, 'Spread the loss over the life of the debentures; it is written off in full in the year of allotment.'],
          ] as [number, string][])
        : ([[loss, 'Gave the loss on issue, which Securities Premium bears in full; the charge to the Statement is the interest.']] as [number, string][])),
      ...(m < 12 ? ([[annual + charged, `Charged a full year's interest although the debentures were outstanding for ${m} months.`]] as [number, string][]) : []),
      [(i.n * priceOf(i) * i.rate * m) / 1200 + charged, 'Worked the interest on the issue price; interest is on the nominal value.'],
    ]);
    return num && {
      prompt: `On 1 ${when.month} ${when.nextYear ? y + 1 : y}, ${rng.pick(COMPANIES)} issued ${lot(i)} ${issueTerms(rng, i)}, ${redTerms(i, years)}. ${sp > 0 ? `On that date Securities Premium A/c had a balance of ${inr(sp)}.` : 'On that date there was no balance in Securities Premium A/c.'} Interest is payable half-yearly on 30 September and 31 March, and the accounting year ends on 31 March. What total amount is debited to the Statement of Profit and Loss for the year ended 31 March ${y + 1} on account of these debentures: the interest of the year and the loss on issue written off?`,
      ...num,
      explanation: [
        `Interest: ${inr(nominal)} x ${i.rate}% x ${m}/12 = ${inr(interest)}.`,
        `Loss on issue = discount ${inr(i.n * i.disc)} + premium on redemption ${inr(i.n * i.red)} = ${inr(loss)}.`,
        sp === 0
          ? `There is no Securities Premium, so the whole ${inr(loss)} is charged to the Statement of Profit and Loss.`
          : charged > 0
            ? `Securities Premium bears ${inr(sp)}; the balance charged to the Statement of Profit and Loss = ${inr(loss)} - ${inr(sp)} = ${inr(charged)}.`
            : `Securities Premium of ${inr(sp)} bears the whole loss, so none of it is charged to the Statement of Profit and Loss.`,
        charged > 0 ? `Total debited = ${inr(interest)} + ${inr(charged)} = ${inr(interest + charged)}.` : `Total debited = the interest alone, ${inr(interest)}.`,
      ],
      hints: ['Two things reach the Statement of Profit and Loss: the interest for the months the debentures were outstanding, and the part of the loss on issue that Securities Premium cannot bear.', 'Loss on issue = discount + premium on redemption; interest is on the nominal value.'],
    };
  },
  verify: (q) => {
    const i = parseIssue(q.prompt), m = monthsIn(q.prompt);
    if (!i || !m) return false;
    const nominal = i.n * i.face, lossPct = (i.disc + i.red) / i.face;
    return Math.abs(q.answer / 100 - ((nominal * i.rate * m) / 1200 + Math.max(0, nominal * lossPct - premiumBalanceIn(q.prompt)))) < 1e-6;
  },
});

const complexOwnPremium = numericTemplate({
  id: 'deb-complex-own-premium', topicId: T, conceptId: 'deb-write-off', difficulty: 'complex', unit: 'rupees',
  generate: (rng) => {
    const y = rng.int(2024, 2026), years = rng.int(4, 8), co = rng.pick(COMPANIES);
    if (rng.int(0, 1) === 0) {
      // The premium received on this very issue is the Securities Premium that bears the loss.
      const i = drawIssue(rng, 'premium', true);
      if (i.prem === i.red) return null;
      const own = i.n * i.prem, loss = i.n * i.red;
      const base = `During the year ended 31 March ${y}, ${co} issued ${lot(i)} ${issueTerms(rng, i)}, ${redTerms(i, years)}. Securities Premium A/c had no balance before this issue. The loss on issue is written off at the end of the year.`;
      const working = [`Securities Premium from this issue = ${count(i.n)} x ${inr(i.prem)} = ${inr(own)}.`, `Loss on issue = premium on redemption = ${count(i.n)} x ${inr(i.red)} = ${inr(loss)}.`];
      const hints = ['The premium received on these debentures is itself in Securities Premium A/c.', 'Securities Premium bears the loss first; only what is left over goes to the Statement of Profit and Loss.'];
      if (loss > own) {
        const num = numeric(loss - own, [
          [loss, 'Charged the whole loss to the Statement of Profit and Loss; the Securities Premium created by this very issue is used first.'],
          [own, 'Gave the part of the loss borne by Securities Premium.'],
          [loss + own, 'Added the premium received on issue to the loss instead of using it to bear the loss.'],
        ]);
        return num && { prompt: `${base} How much of it is charged to the Statement of Profit and Loss?`, ...num, explanation: [...working, `Charged to the Statement of Profit and Loss = ${inr(loss)} - ${inr(own)} = ${inr(loss - own)}.`], hints };
      }
      const num = numeric(own - loss, [
        [own, 'Left Securities Premium untouched; the loss on issue is written off against it first.'],
        [loss, 'Gave the loss written off, not the balance left in Securities Premium A/c.'],
        [own + loss, 'Added the loss to Securities Premium instead of deducting it.'],
      ]);
      return num && { prompt: `${base} What balance is left in Securities Premium A/c after the write-off?`, ...num, explanation: [...working, `Securities Premium bears the whole loss; balance left = ${inr(own)} - ${inr(loss)} = ${inr(own - loss)}.`], hints };
    }
    // Securities Premium comes from shares issued at a premium earlier in the year.
    const i = drawIssue(rng, 'discount', true);
    const shares = rng.step(2000, 30000, 1000), perShare = rng.pick([2, 4, 5, 10]);
    const sp = shares * perShare, loss = i.n * (i.disc + i.red);
    if (sp === loss) return null;
    const base = `During the year ended 31 March ${y}, ${co} issued ${count(shares)} equity shares of ₹10 each at a premium of ${inr(perShare)} per share; Securities Premium A/c has no other balance. Later in the year it issued ${lot(i)} ${issueTerms(rng, i)}, ${redTerms(i, years)}. The whole loss on the issue of the debentures (the discount and the premium payable on redemption) is written off at the end of the year.`;
    const working = [
      `Securities Premium from the shares = ${count(shares)} x ${inr(perShare)} = ${inr(sp)}.`,
      `Loss on issue = discount ${inr(i.n * i.disc)} + premium on redemption ${inr(i.n * i.red)} = ${inr(loss)}.`,
    ];
    const hints = ['First find the balance of Securities Premium: it comes from the shares.', 'Loss on issue = discount + premium on redemption; Securities Premium bears it first.'];
    if (loss > sp) {
      const num = numeric(loss - sp, [
        [loss, 'Charged the whole loss to the Statement of Profit and Loss; the premium received on the shares is in Securities Premium and is used first.'],
        [sp, 'Gave the part of the loss borne by Securities Premium.'],
        [i.n * i.disc - sp, 'Counted only the discount as the loss on issue; the premium payable on redemption is part of it.'],
        [i.n * i.red - sp, 'Counted only the premium on redemption as the loss on issue; the discount is part of it.'],
      ]);
      return num && { prompt: `${base} How much of it is charged to the Statement of Profit and Loss?`, ...num, explanation: [...working, `Charged to the Statement of Profit and Loss = ${inr(loss)} - ${inr(sp)} = ${inr(loss - sp)}.`], hints };
    }
    const num = numeric(sp - loss, [
      [sp, 'Left Securities Premium untouched; the loss on issue is written off against it first.'],
      [loss, 'Gave the loss written off, not the balance left in Securities Premium A/c.'],
      [sp - i.n * i.disc, 'Wrote off only the discount; the premium payable on redemption is part of the loss on issue.'],
    ]);
    return num && { prompt: `${base} What balance is left in Securities Premium A/c after the write-off?`, ...num, explanation: [...working, `Securities Premium bears the whole loss; balance left = ${inr(sp)} - ${inr(loss)} = ${inr(sp - loss)}.`], hints };
  },
  verify: (q) => {
    const i = parseIssue(q.prompt);
    if (!i) return false;
    const shares = /([\d,]+) equity shares of ₹10 each at a premium of ₹([\d,]+) per share/.exec(q.prompt);
    const sp = shares ? toInt(shares[1]) * toInt(shares[2]) : i.n * i.prem;
    const loss = i.n * (i.disc + i.red);
    return q.answer / 100 === Math.abs(loss - sp) && q.prompt.includes('What balance is left') === sp > loss;
  },
});

const complexVendorPremium = numericTemplate({
  id: 'deb-complex-vendor-premium', topicId: T, conceptId: 'deb-vendor', difficulty: 'complex', unit: 'rupees',
  generate: (rng) => {
    const t = drawVendorTerms(rng);
    const n = rng.step(2000, 20000, 500), r = rng.pick(RATES), settled = n * t.price, nominal = n * 100, extra = n * t.pct;
    const cheque = rng.int(0, 1) === 0 ? 0 : rng.step(50000, 300000, 10000);
    const pc = settled + cheque;
    const tk = drawTakeover(rng, pc);
    if (!tk) return null;
    const net = netAssets(tk), word = t.premium ? 'premium' : 'discount', goodwill = tk.diff > 0;
    const base = `${rng.pick(COMPANIES)} ${tookOver(tk, rng.pick(VENDORS))}. ${goodwill ? `Goodwill of ${inr(tk.diff)}` : `A capital reserve of ${inr(-tk.diff)}`} arose on the takeover. The company ${cheque > 0 ? `paid ${inr(cheque)} of the purchase consideration by cheque and settled the balance` : 'settled the whole purchase consideration'} by issuing ${r}% Debentures of ₹100 each ${t.words}.`;
    const working = [
      netWorking(tk),
      goodwill ? `Purchase consideration = net assets + goodwill = ${inr(net)} + ${inr(tk.diff)} = ${inr(pc)}.` : `Purchase consideration = net assets - capital reserve = ${inr(net)} - ${inr(-tk.diff)} = ${inr(pc)}.`,
      ...(cheque > 0 ? [`Settled by debentures = ${inr(pc)} - ${inr(cheque)} = ${inr(settled)}.`] : []),
      `Issue price = ${inr(t.price)}, so the number of debentures = ${inr(settled)} / ${inr(t.price)} = ${count(n)} and their nominal value = ${inr(nominal)}.`,
    ];
    const left = goodwill ? 'Left the goodwill out of the purchase consideration, which is the net assets plus the goodwill.' : 'Left the capital reserve out: the purchase consideration is the net assets less the capital reserve.';
    const hints = ['Work back to the purchase consideration: net assets plus goodwill, or less capital reserve.', 'The premium or discount is a percentage of the nominal value: divide the amount settled by the issue price first.'];
    if (rng.int(0, 1) === 0) {
      const num = numeric(nominal, [
        [settled, `Took the amount settled by debentures as their nominal value and ignored the ${word}.`],
        t.premium
          ? [settled - (settled * t.pct) / 100, `Deducted ${t.pct}% of the amount settled; the premium is ${t.pct}% of the nominal value.`]
          : [settled + (settled * t.pct) / 100, `Added ${t.pct}% of the amount settled; the discount is ${t.pct}% of the nominal value.`],
        [((net - cheque) * 100) / t.price, left],
        ...(cheque > 0 ? ([[(pc * 100) / t.price, 'Ignored the cheque; only the balance is settled by debentures.']] as [number, string][]) : []),
      ]);
      return num && { prompt: `${base} What is the nominal value of the debentures issued?`, ...num, explanation: working, hints };
    }
    const num = numeric(extra, [
      [(settled * t.pct) / 100, `Took ${t.pct}% of the amount settled; the ${word} is ${t.pct}% of the nominal value.`],
      [nominal, `Gave the nominal value of the debentures, not the ${word} on them.`],
      [((net - cheque) * t.pct) / t.price, left],
      ...(cheque > 0 ? ([[(pc * t.pct) / t.price, 'Ignored the cheque; only the balance is settled by debentures.']] as [number, string][]) : []),
    ]);
    return num && {
      prompt: `${base} What amount is ${t.premium ? 'credited to Securities Premium A/c' : 'debited to Discount on Issue of Debentures A/c'} on the issue of the debentures?`,
      ...num,
      explanation: [...working, `${capitalise(word)} = ${t.pct}% of ${inr(nominal)} = ${inr(extra)}.`],
      hints,
    };
  },
  verify: (q) => {
    const a = amountsIn(q.prompt), price = vendorPriceIn(q.prompt); // three assets, creditors, goodwill or capital reserve, the cheque if any, ₹100
    const net = a[0] + a[1] + a[2] - a[3];
    const settled = net + (q.prompt.includes('Goodwill of') ? a[4] : -a[4]) - (q.prompt.includes('by cheque') ? a[5] : 0);
    const nominal = (settled * 100) / price;
    return q.answer / 100 === (q.prompt.includes('nominal value of the debentures issued') ? nominal : Math.abs(nominal - settled));
  },
});

const journalInstalmentTerms = journalTemplate({
  id: 'deb-journal-instalment-terms', topicId: T, conceptId: 'deb-redemption-terms', difficulty: 'complex', computed: true,
  generate: (rng) => {
    const { i, app } = drawInstalments(rng, rng.pick(['discount', 'discount', 'premium'] as const), true);
    const years = rng.int(4, 8);
    const due = i.n * (priceOf(i) - app), credited = i.n * (100 - app), loss = i.n * (i.disc + i.red);
    return {
      prompt: `${rng.pick(COMPANIES)} issued ${lot(i)} ${issueTerms(rng, i)}, ${redTerms(i, years)}. The money was ${payable(i, app)}. All the debentures were applied for, and the application money has been transferred to the debentures account. Pass the entry for the allotment money becoming due, providing for the premium payable on redemption. (The whole loss on the issue is recorded in Loss on Issue of Debentures A/c, at the time of allotment.)`,
      lines: entry(
        dr('debentureAllotment', due),
        dr('lossOnIssueOfDebentures', loss),
        cr(debentures(i.rate), credited),
        cr('securitiesPremium', i.n * i.prem),
        cr('premiumOnRedemptionOfDebentures', i.n * i.red),
      ),
      explanation: [
        `Issue price = ${inr(priceOf(i))}; due on allotment = ${count(i.n)} x (${inr(priceOf(i))} - ${inr(app)}) = ${inr(due)}: Debenture Allotment A/c is debited.`,
        `The rest of the face value, ${count(i.n)} x ${inr(100 - app)} = ${inr(credited)}, is credited to ${i.rate}% Debentures A/c.`,
        ...(i.prem > 0 ? [`The premium on issue, ${count(i.n)} x ${inr(i.prem)} = ${inr(i.n * i.prem)}, is credited to Securities Premium A/c.`] : []),
        `The premium payable on redemption, ${count(i.n)} x ${inr(i.red)} = ${inr(i.n * i.red)}, is credited to Premium on Redemption of Debentures A/c.`,
        i.disc > 0
          ? `Loss on issue = discount ${inr(i.n * i.disc)} + premium on redemption ${inr(i.n * i.red)} = ${inr(loss)}: Loss on Issue of Debentures A/c is debited.`
          : `Loss on issue = the premium on redemption, ${inr(loss)}: Loss on Issue of Debentures A/c is debited.`,
      ],
      distractorAccounts: ['debentureApplication', 'discountOnIssueOfDebentures', 'securitiesPremium', 'bank', 'debentureApplicationAndAllotment'],
      hints: ['The debit for money due is the issue price less the application money; the credit to the debentures is the face value less the application money.', 'Loss on issue = discount + premium on redemption; the premium on redemption is also credited to its own account.'],
    };
  },
  verify: (q) => {
    const i = parseIssue(q.prompt), app = appIn(q.prompt);
    if (!i || !app || i.red === 0) return false;
    const nominal = i.n * i.face;
    return isEntry(q, [
      ['debentureAllotment', 'Dr', nominal + i.n * (i.prem - i.disc) - i.n * app],
      ['lossOnIssueOfDebentures', 'Dr', i.n * (i.disc + i.red)],
      [debentures(i.rate), 'Cr', nominal - i.n * app],
      ['securitiesPremium', 'Cr', i.n * i.prem],
      ['premiumOnRedemptionOfDebentures', 'Cr', i.n * i.red],
    ]);
  },
});

const complexInterestTwoIssues = numericTemplate({
  id: 'deb-complex-interest-two-issues', topicId: T, conceptId: 'deb-interest', difficulty: 'complex', unit: 'rupees',
  generate: (rng) => {
    const y = rng.int(2023, 2025), when = rng.pick(ISSUE_DATES), m = when.months;
    const r1 = rng.pick(RATES), old = rng.step(500000, 4000000, 100000), oldInterest = (old * r1) / 100;
    const i: Issue = { n: rng.step(1000, 20000, 1000), rate: rateFor(rng, m), face: 100, prem: 0, disc: rng.pick([2, 4, 5, 10]), red: 0 };
    const fresh = nominalOf(i), freshFull = (fresh * i.rate) / 100, freshPart = (freshFull * m) / 12;
    const base = `${rng.pick(COMPANIES)} had ${r1}% Debentures of ${inr(old)} outstanding throughout the year ended 31 March ${y + 1}. On 1 ${when.month} ${when.nextYear ? y + 1 : y} it issued a further ${lot(i)} at a discount of ${i.disc}%. Interest on all the debentures is payable half-yearly on 30 September and 31 March.`;
    const hints = ['Take the two lots separately: the old debentures earn interest for the whole year, the new ones only from the date of issue.', 'Interest is on the nominal value; the discount on the new issue does not reduce it.'];
    if (m < 6 && rng.int(0, 1) === 0) {
      const num = numeric(oldInterest / 2 + freshPart, [
        [oldInterest + freshPart, 'Took a full year\'s interest on the old debentures; half of it was paid on 30 September.'],
        [oldInterest / 2 + freshFull / 2, `Took a full half-year on the new debentures; they were outstanding for only ${m} months.`],
        [oldInterest / 2, 'Left out the interest on the debentures issued during the year.'],
        [oldInterest / 2 + (i.n * priceOf(i) * i.rate * m) / 1200, 'Worked the interest on the new debentures on their issue price; interest is on the nominal value.'],
      ]);
      return num && {
        prompt: `${base} How much interest falls due on 31 March ${y + 1}?`,
        ...num,
        explanation: [
          `Old debentures, half-year to 31 March: ${inr(old)} x ${r1}% x 6/12 = ${inr(oldInterest / 2)}.`,
          `New debentures, 1 ${when.month} to 31 March (${m} months): ${inr(fresh)} x ${i.rate}% x ${m}/12 = ${inr(freshPart)}.`,
          `Interest due on 31 March = ${inr(oldInterest / 2)} + ${inr(freshPart)} = ${inr(oldInterest / 2 + freshPart)}.`,
        ],
        hints,
      };
    }
    const num = numeric(oldInterest + freshPart, [
      [oldInterest + freshFull, `Charged a full year on the new debentures; they were outstanding for only ${m} months.`],
      [oldInterest, 'Left out the interest on the debentures issued during the year.'],
      [oldInterest + (freshFull * (12 - m)) / 12, 'Counted the months before the new issue instead of the months after it.'],
      [oldInterest + (i.n * priceOf(i) * i.rate * m) / 1200, 'Worked the interest on the new debentures on their issue price; interest is on the nominal value.'],
    ]);
    return num && {
      prompt: `${base} What is the total debenture interest for the year?`,
      ...num,
      explanation: [
        `Old debentures, full year: ${r1}% of ${inr(old)} = ${inr(oldInterest)}.`,
        `New debentures, 1 ${when.month} to 31 March (${m} months): ${inr(fresh)} x ${i.rate}% x ${m}/12 = ${inr(freshPart)}.`,
        `Total = ${inr(oldInterest)} + ${inr(freshPart)} = ${inr(oldInterest + freshPart)}.`,
      ],
      hints,
    };
  },
  verify: (q) => {
    const i = parseIssue(q.prompt), m = monthsIn(q.prompt);
    const o = /(\d+)% Debentures of ₹([\d,]+) outstanding/.exec(q.prompt);
    if (!i || !m || !o) return false;
    const oldMonths = q.prompt.includes('falls due on 31 March') ? 6 : 12;
    return q.answer * 12 === toInt(o[2]) * Number(o[1]) * oldMonths + i.n * i.face * i.rate * m;
  },
});

const journalComplexWriteOff = journalTemplate({
  id: 'deb-journal-complex-write-off', topicId: T, conceptId: 'deb-write-off', difficulty: 'complex', computed: true,
  generate: (rng) => {
    const y = rng.int(2024, 2026), years = rng.int(4, 8);
    const kind = rng.pick(['discount-par', 'par-premium', 'discount-premium', 'discount-premium', 'premium-premium'] as const);
    const i = drawIssue(rng, kind.startsWith('discount') ? 'discount' : kind.startsWith('premium') ? 'premium' : 'par', kind.endsWith('premium'));
    const loss = i.n * (i.disc + i.red), own = i.n * i.prem;
    const state = rng.int(0, 3);
    const sp = i.prem > 0 ? own : state === 0 ? 0 : state === 1 ? loss + rng.step(10000, 60000, 10000) : Math.max(1000, Math.floor((loss * rng.pick([0.25, 0.4, 0.5, 0.6, 0.75])) / 1000) * 1000);
    const acct = LOSS_ACCOUNTS[i.red > 0 ? 1 : 0], what = i.red > 0 ? 'loss' : 'discount';
    // With a discount and a premium on redemption, the prompt says that the one account holds both.
    const recorded = i.red > 0 && i.disc > 0 ? 'whole loss on the issue (the discount and the premium payable on redemption)' : `${what} on the issue`;
    const fromSp = Math.min(sp, loss), fromPl = loss - fromSp;
    const spText = i.prem > 0 ? 'Securities Premium A/c had no balance before this issue.' : sp > 0 ? `Securities Premium A/c has a balance of ${inr(sp)}.` : 'There is no balance in Securities Premium A/c.';
    return {
      prompt: `During the year ended 31 March ${y}, ${rng.pick(COMPANIES)} issued ${lot(i)} ${issueTerms(rng, i)}, ${redTerms(i, years)}, and recorded the ${recorded} in ${acct.name}. ${spText} Pass the entry at the end of the year to write off the ${what} on the issue.`,
      lines: entry(dr('securitiesPremium', fromSp), dr('statementOfProfitAndLoss', fromPl), cr(acct.id, loss)),
      explanation: [
        i.red > 0 && i.disc > 0
          ? `Loss on issue = discount ${inr(i.n * i.disc)} + premium on redemption ${inr(i.n * i.red)} = ${inr(loss)}.`
          : i.red > 0
            ? `Loss on issue = premium on redemption = ${count(i.n)} x ${inr(i.red)} = ${inr(loss)}.`
            : `Discount on issue = ${count(i.n)} x ${inr(i.disc)} = ${inr(loss)}.`,
        ...(i.prem > 0 ? [`Securities Premium from this issue = ${count(i.n)} x ${inr(i.prem)} = ${inr(own)}.`] : []),
        `It is written off in full in the year of allotment: ${acct.name} is credited with ${inr(loss)}.`,
        sp === 0 ? 'There is no Securities Premium to use.' : `Securities Premium is used first: it is debited with ${inr(fromSp)}.`,
        ...(fromPl > 0 ? [`The ${sp > 0 ? 'balance' : 'whole amount'}, ${inr(fromPl)}, is charged to the Statement of Profit and Loss as a finance cost.`] : []),
      ],
      distractorAccounts: [acct.other, 'profitAndLoss', 'generalReserve', 'premiumOnRedemptionOfDebentures', debentures(i.rate), 'securitiesPremium', 'statementOfProfitAndLoss'],
      hints: H.writeOff,
    };
  },
  verify: (q) => {
    const i = parseIssue(q.prompt);
    if (!i) return false;
    const nominal = i.n * i.face, loss = (nominal * (i.disc + i.red)) / i.face;
    const sp = q.prompt.includes('no balance before this issue') ? (nominal * i.prem) / i.face : premiumBalanceIn(q.prompt);
    return isEntry(q, [['securitiesPremium', 'Dr', Math.min(sp, loss)], ['statementOfProfitAndLoss', 'Dr', Math.max(0, loss - sp)], [i.red > 0 ? 'lossOnIssueOfDebentures' : 'discountOnIssueOfDebentures', 'Cr', loss]]);
  },
});

const journalComplexPurchase = journalTemplate({
  id: 'deb-journal-complex-purchase', topicId: T, conceptId: 'deb-vendor', difficulty: 'complex', computed: true,
  generate: (rng) => {
    const t = drawVendorTerms(rng, true);
    const n = rng.step(2000, 20000, 500), r = rng.pick(RATES), pc = n * t.price;
    const tk = drawTakeover(rng, pc);
    if (!tk) return null;
    const v = rng.pick(VENDORS), net = netAssets(tk);
    return {
      prompt: `${rng.pick(COMPANIES)} ${tookOver(tk, v)}. The purchase consideration was discharged by issuing ${count(n)}, ${r}% Debentures of ₹100 each ${t.words}. Pass the entry for the takeover of the assets and liabilities. (The issue of the debentures to ${v} is a separate entry.)`,
      lines: entry(
        ...tk.assets.map((a) => dr(a.id, a.value)),
        dr('goodwill', Math.max(0, tk.diff)),
        cr('creditors', tk.creditors),
        cr(vendor(v), pc),
        cr('capitalReserve', Math.max(0, -tk.diff)),
      ),
      explanation: [
        `Purchase consideration = ${count(n)} debentures x issue price of ${inr(t.price)} = ${inr(pc)}: ${v} is credited with it.`,
        'Each asset taken over is debited at its agreed value, and the creditors taken over are credited.',
        netWorking(tk),
        tk.diff > 0
          ? `The consideration is more than the net assets by ${inr(pc)} - ${inr(net)} = ${inr(tk.diff)}: Goodwill A/c is debited.`
          : `The consideration is less than the net assets by ${inr(net)} - ${inr(pc)} = ${inr(-tk.diff)}: Capital Reserve A/c is credited.`,
      ],
      distractorAccounts: [tk.diff > 0 ? 'capitalReserve' : 'goodwill', debentures(r), t.premium ? 'securitiesPremium' : 'discountOnIssueOfDebentures', 'bank'],
      hints: ['The purchase consideration is what the debentures are worth at their issue price, not at their face value.', 'Debit the assets, credit the liabilities and the vendor; the balancing figure is goodwill or a capital reserve.'],
    };
  },
  verify: (q) => {
    const a = amountsIn(q.prompt), price = vendorPriceIn(q.prompt); // three assets, creditors, ₹100
    const n = toInt(/issuing ([\d,]+), \d+% Debentures/.exec(q.prompt)?.[1] ?? '0');
    const pc = n * price, diff = pc - (a[0] + a[1] + a[2] - a[3]);
    const party = q.expected.find((l) => l.accountId.startsWith('vendor:'));
    return pc > 0 && !!party && posted(q, party.accountId, 'Cr') === pc && posted(q, 'creditors', 'Cr') === a[3]
      && posted(q, 'goodwill', 'Dr') === Math.max(0, diff) && posted(q, 'capitalReserve', 'Cr') === Math.max(0, -diff);
  },
});

const complexRedemptionRate = numericTemplate({
  id: 'deb-complex-redemption-rate', topicId: T, conceptId: 'deb-redemption-terms', difficulty: 'complex', unit: 'percent',
  generate: (rng) => {
    const i = drawIssue(rng, 'discount', true);
    const years = rng.int(4, 8), co = rng.pick(COMPANIES);
    const d = pctOf(i, i.disc), p = pctOf(i, i.red), nominal = nominalOf(i), loss = i.n * (i.disc + i.red), cash = i.n * priceOf(i);
    const lossLine = `Loss on issue as a rate = ${inr(loss)} / ${inr(nominal)} x 100 = ${d + p}% of the nominal value.`;
    const hints = ['Loss on issue = discount on issue + premium on redemption, each a percentage of the nominal value.', 'Express the loss as a percentage of the nominal value, then take away the part you know.'];
    switch (rng.int(0, 2)) {
      case 0: {
        const num = numeric(p, [
          [d + p, `Took the whole loss as the premium on redemption; it includes the discount of ${d}%.`],
          [d, 'Gave the rate of discount on issue.'],
          [p + 2 * d, 'Added the discount to the rate of loss instead of deducting it.'],
        ]);
        return num && {
          prompt: `${co} issued ${lot(i)} at a discount of ${d}%. They are to be redeemed at a premium after ${years} years. At the time of issue the whole loss on the issue, ${inr(loss)}, was debited to Loss on Issue of Debentures A/c. At what rate of premium (% of the nominal value) are the debentures redeemable?`,
          ...num,
          explanation: [`Nominal value = ${count(i.n)} x ${inr(i.face)} = ${inr(nominal)}.`, lossLine, `Premium on redemption = ${d + p}% - discount of ${d}% = ${p}%.`],
          hints,
        };
      }
      case 1: {
        const num = numeric(d, [
          [d + p, `Took the whole loss as the discount; it includes the premium on redemption of ${p}%.`],
          [p, 'Gave the rate of premium on redemption.'],
          [d + 2 * p, 'Added the premium on redemption to the rate of loss instead of deducting it.'],
        ]);
        return num && {
          prompt: `${co} issued ${lot(i)} below their face value. They are to be redeemed at a premium of ${p}% after ${years} years. At the time of issue the whole loss on the issue, ${inr(loss)}, was debited to Loss on Issue of Debentures A/c. At what rate of discount (% of the nominal value) were the debentures issued?`,
          ...num,
          explanation: [`Nominal value = ${count(i.n)} x ${inr(i.face)} = ${inr(nominal)}.`, lossLine, `Discount on issue = ${d + p}% - premium on redemption of ${p}% = ${d}%.`],
          hints,
        };
      }
      default: {
        const num = numeric(p, [
          [d + p, 'Took the whole loss as the premium on redemption; part of it is the discount, the nominal value less the money received.'],
          [d, 'Gave the rate of discount on issue.'],
          [p + 2 * d, 'Added the discount to the rate of loss instead of deducting it.'],
        ]);
        return num && {
          prompt: `${co} issued ${lot(i)} and received ${inr(cash)} in all. They are to be redeemed at a premium after ${years} years. At the time of issue the whole loss on the issue, ${inr(loss)}, was debited to Loss on Issue of Debentures A/c. At what rate of premium (% of the nominal value) are the debentures redeemable?`,
          ...num,
          explanation: [
            `Nominal value = ${count(i.n)} x ${inr(i.face)} = ${inr(nominal)}; discount on issue = ${inr(nominal)} - ${inr(cash)} = ${inr(nominal - cash)}.`,
            `Premium on redemption = loss on issue - discount = ${inr(loss)} - ${inr(nominal - cash)} = ${inr(loss - (nominal - cash))}.`,
            `As a rate: ${inr(loss - (nominal - cash))} / ${inr(nominal)} x 100 = ${p}%.`,
          ],
          hints,
        };
      }
    }
  },
  verify: (q) => {
    const m = /([\d,]+), (\d+)% Debentures of ₹([\d,]+) each/.exec(q.prompt);
    if (!m) return false;
    const nominal = toInt(m[1]) * toInt(m[3]), a = amountsIn(q.prompt), loss = a[a.length - 1];
    const known = /at a discount of (\d+)%|redeemed at a premium of (\d+)%/.exec(q.prompt);
    // The rate asked for, in hundredths of a percent: the loss as a rate of the nominal value, less the rate that is known.
    const knownRate = known ? Number(known[1] ?? known[2]) * 100 : ((nominal - a[1]) * 10000) / nominal;
    return q.answer === (loss * 10000) / nominal - knownRate;
  },
});

const complex: Template[] = [
  complexPlCharge, complexOwnPremium, complexVendorPremium, journalInstalmentTerms, complexInterestTwoIssues,
  journalComplexWriteOff, journalComplexPurchase, complexRedemptionRate,
];

// ===============================================================================================================
// SETS OF ENTRIES
// ===============================================================================================================
// What the long questions add to the conventions at the top of the file, each stated in the opening line (or the
// data) of the question that relies on it:
//  - a discount on issue is 5% or 10%, and an issue price lies between ₹90 and ₹125 for every ₹100 of face value;
//  - money received is banked the same day; interest is credited to Debentureholders A/c on the day it falls due and
//    paid by cheque that day;
//  - the discount or loss is written off on 31 March of the year of allotment, and the Securities Premium available
//    for it includes the premium received on the same issue;
//  - a vendor is credited with the price until it is settled, and takes a whole number of debentures.

const DAA = 'debentureApplicationAndAllotment';
const SPL = 'statementOfProfitAndLoss';
const SP = 'securitiesPremium';
const PREM_RED = 'premiumOnRedemptionOfDebentures';
const DISCOUNT_AC = 'Discount on Issue of Debentures A/c';
const LOSS_AC = 'Loss on Issue of Debentures A/c';
/** The account a discount or loss on issue is debited to: Loss on Issue once a premium is payable on redemption. */
const lossIdOf = (redeemAtPremium: boolean): string => (redeemAtPremium ? 'lossOnIssueOfDebentures' : 'discountOnIssueOfDebentures');

/** A transaction of a set, on its date. */
const on = (date: string, text: string, lines: JournalLine[], explanation: string[]): SetTransaction => ({ date, text, lines, explanation });

/** The months of an accounting year that ends on 31 March, from April to February. */
const YEAR_MONTHS = ['April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December', 'January', 'February'];
/** Month `k` of the accounting year that begins in April of `y`, with its calendar year: "January 2026". */
const monthIn = (y: number, k: number): string => `${YEAR_MONTHS[k]} ${k >= 9 ? y + 1 : y}`;

/**
 * An issue for a set or a format: a discount of 5% or 10%, a premium of up to 25% and, if any, a premium on redemption
 * of 5% or 10%. The nominal value is a whole number of lakhs.
 */
function drawLot(rng: Rng, at: IssueAt, redeemAtPremium: boolean, faces: number[] = [100, 100, 100, 500, 1000]): Issue {
  const face = rng.pick(faces);
  const n = face === 100 ? rng.step(2000, 20000, 1000) : face === 500 ? rng.step(400, 4000, 200) : rng.step(200, 2000, 100);
  return {
    n,
    rate: rng.pick(RATES),
    face,
    prem: at === 'premium' ? (face * rng.pick([5, 10, 20, 25])) / 100 : 0,
    disc: at === 'discount' ? (face * rng.pick([5, 10])) / 100 : 0,
    red: redeemAtPremium ? (face * rng.pick([5, 10])) / 100 : 0,
  };
}

/** A balance of Securities Premium before a loss of `loss` rupees is written off: none, less than the loss, or more than it. */
function drawPremiumBalance(rng: Rng, loss: number): number {
  const state = rng.int(0, 3);
  if (state === 0 || loss <= 0) return 0;
  if (state === 1) return Math.ceil(loss / 10000) * 10000 + rng.step(10000, 80000, 10000);
  return Math.max(1000, Math.floor((loss * rng.pick([0.25, 0.4, 0.5, 0.6])) / 1000) * 1000);
}

/**
 * The lines of an allotment: `money` from `source` (the application account, the allotment account or a vendor), with
 * whatever the terms of the issue add. The debentures are credited with their nominal value, or with `credited`
 * where part of it was credited before (the application money of an issue payable in two instalments).
 */
const allotmentLines = (i: Issue, source: string, money: number, credited: number = nominalOf(i)): JournalLine[] =>
  entry(dr(source, money), dr(lossIdOf(i.red > 0), i.n * (i.disc + i.red)), cr(debentures(i.rate), credited), cr(SP, i.n * i.prem), cr(PREM_RED, i.n * i.red));

/** The steps of an allotment after the one for its debit: the nominal value, the premium, and the discount or loss. */
function allotmentSteps(i: Issue): string[] {
  const loss = i.n * (i.disc + i.red);
  return [
    `${i.rate}% Debentures A/c is credited with the nominal value, ${count(i.n)} x ${inr(i.face)} = ${inr(nominalOf(i))}.`,
    ...(i.prem > 0 ? [`The premium on issue, ${count(i.n)} x ${inr(i.prem)} = ${inr(i.n * i.prem)}, is credited to Securities Premium A/c.`] : []),
    ...(i.red > 0
      ? [
          `The premium payable on redemption, ${count(i.n)} x ${inr(i.red)} = ${inr(i.n * i.red)}, is owed from the day of issue: Premium on Redemption of Debentures A/c is credited.`,
          i.disc > 0
            ? `Loss on issue = discount ${inr(i.n * i.disc)} + premium on redemption ${inr(i.n * i.red)} = ${inr(loss)}: ${LOSS_AC} is debited with the whole of it.`
            : `That premium is the loss on the issue: ${LOSS_AC} is debited with ${inr(loss)}.`,
        ]
      : i.disc > 0
        ? [`The discount, ${count(i.n)} x ${inr(i.disc)} = ${inr(i.n * i.disc)}, is a loss: ${DISCOUNT_AC} is debited.`]
        : []),
  ];
}

/**
 * The entry that writes off a discount or loss on issue at the end of the year of allotment, with its working.
 * `before` is the balance of Securities Premium before the issue and `own` the premium received on the issue itself.
 */
function writeOffTx(date: string, discount: number, onRedemption: number, before: number, own: number): SetTransaction {
  const loss = discount + onRedemption, available = before + own;
  const fromSp = Math.min(loss, available), fromPl = loss - fromSp;
  const atPremium = onRedemption > 0, what = atPremium ? 'loss' : 'discount', name = atPremium ? LOSS_AC : DISCOUNT_AC;
  const amountLine = !atPremium
    ? `Discount on issue = ${inr(loss)}.`
    : discount > 0
      ? `Loss on issue = discount ${inr(discount)} + premium payable on redemption ${inr(onRedemption)} = ${inr(loss)}.`
      : `Loss on issue = the premium payable on redemption, ${inr(loss)}.`;
  const availableLine =
    available === 0
      ? 'Securities Premium A/c has no balance, so nothing can be written off against it.'
      : own > 0 && before > 0
        ? `Securities Premium available = ${inr(before)} + ${inr(own)} received on this issue = ${inr(available)}.`
        : own > 0
          ? `Securities Premium available = the ${inr(own)} received on this issue.`
          : `Securities Premium available = ${inr(available)}.`;
  return on(date, `Wrote off the ${what} on the issue of the debentures.`, entry(dr(SP, fromSp), dr(SPL, fromPl), cr(lossIdOf(atPremium), loss)), [
    `${amountLine} It is written off in full in the year of allotment: ${name} is credited and so closed.`,
    fromPl === 0
      ? `${availableLine} It bears the whole amount: Securities Premium A/c is debited with ${inr(loss)}.`
      : fromSp === 0
        ? `${availableLine} The whole ${inr(loss)} is charged to the Statement of Profit and Loss, as a finance cost.`
        : `${availableLine} It is used first: Securities Premium A/c is debited with ${inr(fromSp)}. The rest, ${inr(loss)} - ${inr(fromSp)} = ${inr(fromPl)}, is charged to the Statement of Profit and Loss as a finance cost.`,
  ]);
}

/** What the entries of a set leave in an account, in rupees: debits less credits (0 when the set does not name it). */
const leftIn = (q: JournalSetQuestion): ((accountId: string) => number) => {
  const ledger = post(q.entries.map((e) => e.expected));
  return (accountId) => (ledger.get(accountId) ?? 0) / 100;
};
/** All that the entries of a set debit to an account, in rupees. */
const setDebits = (q: JournalSetQuestion, accountId: string): number =>
  q.entries.flatMap((e) => e.expected).filter((l) => l.accountId === accountId && l.side === 'Dr').reduce((t, l) => t + l.amount, 0) / 100;

/**
 * A set about one issue for cash, checked from the terms its opening states and not from its entries: the books end
 * with the debentures at their nominal value, the application and allotment accounts cleared, the premium on
 * redemption provided for, the discount or loss debited to the right account and written off, Securities Premium
 * bearing what it can, and the bank holding the issue price of the debentures allotted.
 */
function cashIssueHolds(q: JournalSetQuestion): boolean {
  const i = parseIssue(q.prompt);
  if (!i || !setHolds()(q)) return false;
  const left = leftIn(q), loss = i.n * (i.disc + i.red), available = premiumBalanceIn(q.prompt) + i.n * i.prem;
  const used = lossIdOf(i.red > 0), unused = lossIdOf(i.red === 0);
  return (
    left(debentures(i.rate)) === -nominalOf(i) &&
    [DAA, 'debentureApplication', 'debentureAllotment', used].every((id) => left(id) === 0) &&
    setDebits(q, used) === loss &&
    setDebits(q, unused) === 0 &&
    left(PREM_RED) === -(i.n * i.red) &&
    left(SP) === Math.min(loss, available) - i.n * i.prem &&
    left(SPL) === Math.max(0, loss - available) &&
    left('bank') === i.n * priceOf(i)
  );
}

const SET_HINTS = {
  issue: [
    'Work out the money from the issue price, but credit the debentures account with the nominal value.',
    'A discount or loss on issue is written off first from Securities Premium; only what is left over goes to the Statement of Profit and Loss.',
  ],
};

/** How an over-subscribed issue is told: the applications received, and what became of the excess. */
const overBy = (rng: Rng, n: number): number => n + n * rng.pick([0.1, 0.2, 0.25, 0.5]);

// 1. deb-set-issue-cash: an issue for cash, redeemable at par, the whole price with the application. The money
//    received, the allotment, the refund when the issue is over-subscribed and, for an issue at a discount, the
//    write-off of the discount (easy: 3 or 4 entries).
const setIssueCash = journalSetTemplate({
  id: 'deb-set-issue-cash', topicId: T, conceptId: 'deb-sets', difficulty: 'easy',
  generate: (rng) => {
    const co = rng.pick(COMPANIES), y = rng.int(2023, 2025), years = rng.int(4, 8);
    const at = rng.pick(['discount', 'discount', 'discount', 'premium', 'premium', 'par'] as const);
    const i = drawLot(rng, at, false);
    // An issue at par or at a premium has no write-off, so its third entry is the refund of the excess money.
    const over = at !== 'discount' || rng.int(0, 1) === 0;
    const applied = over ? overBy(rng, i.n) : i.n;
    const price = priceOf(i), discount = i.n * i.disc;
    const received = applied * price, kept = i.n * price;
    const sp = drawPremiumBalance(rng, discount);
    const month = monthIn(y, rng.int(0, 8));
    const [d1, d2, d3] = setDays(rng, 3, 2, 27);
    const priceLine = i.prem + i.disc > 0 ? `Issue price = ${inr(i.face)} ${i.prem > 0 ? '+' : '-'} ${inr(i.prem + i.disc)} = ${inr(price)} per debenture. ` : '';
    const transactions: SetTransaction[] = [
      on(
        `${d1} ${month}`,
        over ? `Applications were received for ${count(applied)} debentures, with the full issue price on each.` : `Applications were received for all the ${count(i.n)} debentures, with the full issue price on each.`,
        [dr('bank', received), cr(DAA, received)],
        [
          `${priceLine}Money received = ${count(applied)} x ${inr(price)} = ${inr(received)}: Bank A/c is debited.`,
          'Until the debentures are allotted it is only application money: Debenture Application and Allotment A/c is credited.',
        ],
      ),
      on(
        `${d2} ${month}`,
        over ? `Allotted the ${count(i.n)} debentures on offer; the applications for the other ${count(applied - i.n)} debentures were rejected.` : 'Allotted the debentures to the applicants.',
        allotmentLines(i, DAA, kept),
        [`The money on the debentures allotted, ${count(i.n)} x ${inr(price)} = ${inr(kept)}, stops being application money: Debenture Application and Allotment A/c is debited.`, ...allotmentSteps(i)],
      ),
    ];
    if (over) {
      transactions.push(
        on(`${d3} ${month}`, 'Refunded the money received on the rejected applications.', [dr(DAA, received - kept), cr('bank', received - kept)], [
          `Money on the rejected applications = ${count(applied - i.n)} x ${inr(price)} = ${inr(received - kept)}. It is no longer held for the applicants: Debenture Application and Allotment A/c is debited and so closed.`,
          'The money goes back to them: Bank A/c is credited.',
        ]),
      );
    }
    if (discount > 0) transactions.push(writeOffTx(`31 March ${y + 1}`, discount, 0, sp, 0));
    return {
      opening: `${co} offered ${lot(i)} to the public ${issueTerms(rng, i)}, ${redTerms(i, years)}. The whole issue price was payable with the application. Money received is banked the same day and held in Debenture Application and Allotment A/c until the debentures are allotted. The accounting year ends on 31 March.${
        discount > 0
          ? ` The discount on the issue is written off at the end of the year of allotment, first from Securities Premium and then from the Statement of Profit and Loss; before the write-off Securities Premium A/c ${sp > 0 ? `had a balance of ${inr(sp)}` : 'had no balance'}.`
          : ''
      }`,
      transactions,
      hints: SET_HINTS.issue,
      distractorAccounts: ['debentureApplication', 'debentureholders', at === 'discount' ? 'lossOnIssueOfDebentures' : 'discountOnIssueOfDebentures', 'securitiesPremium', 'premiumOnRedemptionOfDebentures', 'statementOfProfitAndLoss'],
    };
  },
  verify: cashIssueHolds,
});

// 2. deb-set-six-cases: the six cases of issue with terms of redemption. Either the whole price comes with the
//    application and the issue is over-subscribed (money received, allotment, refund, write-off), or the price is
//    payable on application and on allotment (four entries, and the write-off where there is a loss). The two cases
//    without a loss are always payable in two instalments, so that every seed has four or five entries (medium).
const SIX_CASES: [IssueAt, RedeemAt][] = [
  ['par', 'par'], ['discount', 'par'], ['premium', 'par'],
  ['par', 'premium'], ['discount', 'premium'], ['discount', 'premium'], ['premium', 'premium'], ['premium', 'premium'],
];

const setSixCases = journalSetTemplate({
  id: 'deb-set-six-cases', topicId: T, conceptId: 'deb-sets', difficulty: 'medium',
  generate: (rng) => {
    const co = rng.pick(COMPANIES), y = rng.int(2023, 2025), years = rng.int(4, 8);
    const [at, redeemAt] = rng.pick(SIX_CASES);
    const hasLoss = at === 'discount' || redeemAt === 'premium';
    const lump = hasLoss && rng.int(0, 1) === 0;
    const i = drawLot(rng, at, redeemAt === 'premium', lump ? undefined : [100]);
    const app = rng.pick([20, 25, 30, 40, 50]);
    const price = priceOf(i), discount = i.n * i.disc, onRedemption = i.n * i.red, own = i.n * i.prem;
    const sp = at === 'premium' ? rng.pick([0, 0, 1]) * rng.step(10000, 60000, 10000) : drawPremiumBalance(rng, discount + onRedemption);
    const month = monthIn(y, rng.int(0, 8));
    const [d1, d2, d3] = setDays(rng, 3, 2, 27);
    const transactions: SetTransaction[] = [];
    if (lump) {
      const applied = overBy(rng, i.n), received = applied * price, kept = i.n * price;
      transactions.push(
        on(`${d1} ${month}`, `Applications were received for ${count(applied)} debentures, with the full issue price on each.`, [dr('bank', received), cr(DAA, received)], [
          `${price === i.face ? '' : `Issue price = ${inr(i.face)} ${i.prem > 0 ? '+' : '-'} ${inr(i.prem + i.disc)} = ${inr(price)} per debenture. `}Money received = ${count(applied)} x ${inr(price)} = ${inr(received)}: Bank A/c is debited.${i.red > 0 ? ' The premium payable on redemption is paid out by the company later; it is no part of the money received.' : ''}`,
          'Until the debentures are allotted it is only application money: Debenture Application and Allotment A/c is credited.',
        ]),
        on(`${d2} ${month}`, `Allotted the ${count(i.n)} debentures on offer; the applications for the other ${count(applied - i.n)} debentures were rejected.`, allotmentLines(i, DAA, kept), [
          `The money on the debentures allotted, ${count(i.n)} x ${inr(price)} = ${inr(kept)}, stops being application money: Debenture Application and Allotment A/c is debited.`,
          ...allotmentSteps(i),
        ]),
        on(`${d3} ${month}`, 'Refunded the money received on the rejected applications.', [dr(DAA, received - kept), cr('bank', received - kept)], [
          `Money on the rejected applications = ${count(applied - i.n)} x ${inr(price)} = ${inr(received - kept)}: Debenture Application and Allotment A/c is debited and so closed.`,
          'The money goes back to the applicants: Bank A/c is credited.',
        ]),
      );
    } else {
      const onApplication = i.n * app, due = i.n * (price - app);
      transactions.push(
        on(`${d1} ${month}`, `Received the application money on all the ${count(i.n)} debentures.`, [dr('bank', onApplication), cr('debentureApplication', onApplication)], [
          `Application money = ${count(i.n)} x ${inr(app)} = ${inr(onApplication)}: Bank A/c is debited.`,
          'It is held in Debenture Application A/c, which is credited, until the debentures are allotted.',
        ]),
        on(`${d2} ${month}`, 'Allotted the debentures and transferred the application money to the debentures account.', [dr('debentureApplication', onApplication), cr(debentures(i.rate), onApplication)], [
          `On allotment the application money becomes part of the loan: Debenture Application A/c is debited with ${inr(onApplication)} and so closed.`,
          `${i.rate}% Debentures A/c is credited with it: ${inr(app)} of the face value of each debenture.`,
        ]),
        on(`${d2} ${month}`, 'The allotment money on the debentures fell due.', allotmentLines(i, 'debentureAllotment', due, i.n * (100 - app)), [
          `Due on allotment = issue price ${inr(price)} - ${inr(app)} already paid = ${inr(price - app)} per debenture; ${count(i.n)} x ${inr(price - app)} = ${inr(due)}: Debenture Allotment A/c is debited.`,
          `The rest of the face value, ${count(i.n)} x ${inr(100 - app)} = ${inr(i.n * (100 - app))}, is credited to ${i.rate}% Debentures A/c, which now shows the nominal value of ${inr(nominalOf(i))}.`,
          ...allotmentSteps(i).slice(1),
        ]),
        on(`${d3} ${month}`, 'Received the allotment money in full.', [dr('bank', due), cr('debentureAllotment', due)], [
          `The ${inr(due)} due on allotment comes in: Bank A/c is debited.`,
          'Debenture Allotment A/c is credited and so closed.',
        ]),
      );
    }
    if (hasLoss) transactions.push(writeOffTx(`31 March ${y + 1}`, discount, onRedemption, sp, own));
    const what = redeemAt === 'premium' ? 'loss' : 'discount';
    return {
      opening: `${co} offered ${lot(i)} to the public ${issueTerms(rng, i)}, ${redTerms(i, years)}. ${
        lump
          ? 'The whole issue price was payable with the application and is held in Debenture Application and Allotment A/c until the debentures are allotted.'
          : `The issue price was ${payable(i, app)}, through Debenture Application A/c and Debenture Allotment A/c; all the debentures were applied for.`
      } Money received is banked the same day.${
        redeemAt === 'premium'
          ? ` The premium payable on redemption is provided for at the time of allotment, and the whole loss on the issue (${at === 'discount' ? 'the discount and that premium' : 'that premium'}) is recorded in ${LOSS_AC}.`
          : ''
      }${
        hasLoss
          ? ` The ${what} on the issue is written off at the end of the year of allotment, first from Securities Premium${own > 0 ? ' (the premium received on this issue included)' : ''} and then from the Statement of Profit and Loss; before this issue Securities Premium A/c ${sp > 0 ? `had a balance of ${inr(sp)}` : 'had no balance'}.`
          : ''
      } The accounting year ends on 31 March.`,
      transactions,
      hints: SET_HINTS.issue,
      distractorAccounts: [lossIdOf(redeemAt !== 'premium'), 'securitiesPremium', 'premiumOnRedemptionOfDebentures', 'debentureholders', lump ? 'debentureApplication' : DAA, 'statementOfProfitAndLoss'],
    };
  },
  verify: cashIssueHolds,
});

/** The two interest periods of a year for debentures outstanding for its last `months` months: the months up to 30 September, and those from then to 31 March. */
const halves = (months: number): [number, number] => [Math.max(0, months - 6), Math.min(months, 6)];
const interestFor = (nominal: number, rate: number, months: number): number => (nominal * rate * months) / 1200;
/** A rate at which the interest on `nominal` rupees for each of these numbers of months is in whole rupees; null when there is none. */
function wholeRate(rng: Rng, nominal: number, periods: number[]): number | null {
  const rates = RATES.filter((r) => periods.every((m) => (nominal * r * m) % 1200 === 0));
  return rates.length > 0 ? rng.pick(rates) : null;
}
const monthsWord = (m: number): string => (m === 6 ? 'the half-year' : m === 1 ? 'one month' : `${m} months`);

/**
 * The interest entries of the year that ends on 31 March of `y + 1`, on debentures of `nominal` rupees that were
 * outstanding for its last `months` months (12 for the whole year; otherwise `from` is the day they were allotted):
 * the interest falling due and its payment on 30 September, where the debentures were there before October, and on
 * 31 March. `closing` is the transfer of the year's interest, for the caller to place last.
 */
function interestTxs(y: number, rate: number, nominal: number, months: number, from: string): { txs: SetTransaction[]; closing: SetTransaction; total: number } {
  const [m1, m2] = halves(months);
  const txs: SetTransaction[] = [];
  const parts: string[] = [];
  const add = (date: string, m: number, period: string) => {
    const x = interestFor(nominal, rate, m);
    parts.push(inr(x));
    txs.push(
      on(date, `The interest on the debentures for ${period} fell due.`, [dr('debentureInterest', x), cr('debentureholders', x)], [
        `Interest for ${monthsWord(m)} = ${inr(nominal)} x ${rate}% x ${m}/12 = ${inr(x)}, on the nominal value. It is an expense: Debenture Interest A/c is debited.`,
        'It is owed to the debentureholders until it is paid: Debentureholders A/c is credited.',
      ]),
      on(date, `Paid the debentureholders the interest that fell due on ${date}.`, [dr('debentureholders', x), cr('bank', x)], [
        `The ${inr(x)} owed to the debentureholders is paid in full, no tax being deducted: Debentureholders A/c is debited.`,
        'The cheques are paid out of the bank: Bank A/c is credited. The expense was recorded when the interest fell due, so Debenture Interest A/c is not touched again.',
      ]),
    );
  };
  if (m1 > 0) add(`30 September ${y}`, m1, months === 12 ? `the half-year ended 30 September ${y}` : `the period from ${from} to 30 September ${y}`);
  add(`31 March ${y + 1}`, m2, m1 > 0 || months === 12 ? `the half-year ended 31 March ${y + 1}` : `the period from ${from} to 31 March ${y + 1}`);
  const total = interestFor(nominal, rate, months);
  const closing = on(`31 March ${y + 1}`, 'Transferred the debenture interest of the year to the Statement of Profit and Loss.', [dr(SPL, total), cr('debentureInterest', total)], [
    parts.length > 1 ? `Interest of the year = ${parts.join(' + ')} = ${inr(total)}.` : `Interest of the year = ${inr(total)}.`,
    'It is an expense of the year, a finance cost: the Statement of Profit and Loss is debited, and Debenture Interest A/c is credited and so closed.',
  ]);
  return { txs, closing, total };
}

/** The months to 31 March for which the debentures of a prompt were outstanding: 12, or those from the 1st of the month of allotment. */
const monthsOutstanding = (s: string): number => {
  if (s.includes('outstanding throughout')) return 12;
  const m = /[Oo]n 1 (\w+) \d{4}/.exec(s);
  return m ? (MONTHS_LEFT[m[1]] ?? 0) : 0;
};

const INTEREST_CONVENTION =
  'Interest is payable half-yearly on 30 September and 31 March. On each of these dates the interest due is credited to Debentureholders A/c and paid by cheque the same day; no tax is deducted at source. The accounting year ends on 31 March.';

// 3. deb-set-interest-year: the interest of one year in five entries. Debentures outstanding for the whole year
//    (two half-years due and paid, and the transfer); debentures allotted between May and September (a part period
//    to 30 September, then a half-year); or debentures allotted from October to February, with the two entries of
//    their issue and one part period to 31 March (medium).
const setInterestYear = journalSetTemplate({
  id: 'deb-set-interest-year', topicId: T, conceptId: 'deb-sets', difficulty: 'medium',
  generate: (rng) => {
    const co = rng.pick(COMPANIES), y = rng.int(2023, 2025), years = rng.int(4, 8);
    const shape = rng.pick(['whole', 'early', 'early', 'late'] as const);
    const when = shape === 'whole' ? null : rng.pick(ISSUE_DATES.filter((d) => (shape === 'early' ? d.months > 6 : d.months <= 6)));
    const months = when ? when.months : 12;
    const at = shape === 'late' ? rng.pick(['par', 'premium'] as const) : rng.pick(['par', 'premium', 'discount'] as const);
    const base = drawLot(rng, at, false);
    const rate = wholeRate(rng, nominalOf(base), halves(months));
    if (rate === null) return null;
    const i: Issue = { ...base, rate };
    const from = when ? `1 ${when.month} ${when.nextYear ? y + 1 : y}` : '';
    const { txs, closing } = interestTxs(y, rate, nominalOf(i), months, from);
    const distractorAccounts = [debentures(rate), 'interestPaid', 'profitAndLoss', 'discountOnIssueOfDebentures', 'securitiesPremium'];
    if (when && shape === 'late') {
      const money = i.n * priceOf(i);
      // The applications come in during the last days of the month before the allotment.
      const received = `${rng.int(20, 28)} ${monthIn(y, YEAR_MONTHS.indexOf(when.month) - 1)}`;
      return {
        opening: `${co} offered ${lot(i)} to the public ${issueTerms(rng, i)}, ${redTerms(i, years)}, the whole issue price payable with the application. Money received is banked the same day and held in Debenture Application and Allotment A/c until allotment. The debentures were allotted on ${from}, and interest runs from that day. ${INTEREST_CONVENTION}`,
        transactions: [
          on(received, `Applications were received for all the ${count(i.n)} debentures, with the full issue price on each.`, [dr('bank', money), cr(DAA, money)], [
            `${i.prem > 0 ? `Issue price = ${inr(i.face)} + ${inr(i.prem)} = ${inr(priceOf(i))} per debenture. ` : ''}Money received = ${count(i.n)} x ${inr(priceOf(i))} = ${inr(money)}: Bank A/c is debited.`,
            'Until the debentures are allotted it is only application money: Debenture Application and Allotment A/c is credited.',
          ]),
          on(from, 'Allotted the debentures to the applicants.', allotmentLines(i, DAA, money), [`The ${inr(money)} stops being application money: Debenture Application and Allotment A/c is debited and so closed.`, ...allotmentSteps(i)]),
          ...txs,
          closing,
        ],
        hints: H.interest,
        distractorAccounts,
      };
    }
    return {
      task: 'Pass the journal entries for the interest on the debentures for the year.',
      opening: when
        ? `On ${from}, ${co} allotted ${lot(i)} ${issueTerms(rng, i)}, ${redTerms(i, years)}. Only the entries for the interest of the year ended 31 March ${y + 1} are asked. ${INTEREST_CONVENTION}`
        : `${co} had ${lot(i)} outstanding throughout the year ended 31 March ${y + 1}; they had been issued ${issueTerms(rng, i)} in an earlier year. ${INTEREST_CONVENTION}`,
      transactions: [...txs, closing],
      hints: H.interest,
      distractorAccounts,
    };
  },
  // From the lot and the date in the opening: the interest of the year on the nominal value, debited to the expense,
  // paid in full and transferred; and, where the set has the issue itself, the money and the debentures of that issue.
  verify: (q) => {
    const m = /([\d,]+), (\d+)% Debentures of ₹([\d,]+) each/.exec(q.prompt), months = monthsOutstanding(q.prompt);
    if (!m || !months || !setHolds()(q)) return false;
    const rate = Number(m[2]), nominal = toInt(m[1]) * toInt(m[3]), total = (nominal * rate * months) / 1200;
    const left = leftIn(q);
    const issue = q.prompt.includes(' offered ') ? parseIssue(q.prompt) : null;
    if (q.prompt.includes(' offered ') && !issue) return false;
    return (
      setDebits(q, 'debentureInterest') === total &&
      left('debentureInterest') === 0 &&
      left('debentureholders') === 0 &&
      left(SPL) === total &&
      left('bank') === (issue ? issue.n * priceOf(issue) : 0) - total &&
      left(debentures(rate)) === (issue ? -nominal : 0) &&
      left(DAA) === 0 &&
      left(SP) === (issue ? -(issue.n * issue.prem) : 0)
    );
  },
});

/** All that the entries of a set credit to an account, in rupees. */
const setCredits = (q: JournalSetQuestion, accountId: string): number =>
  q.entries.flatMap((e) => e.expected).filter((l) => l.accountId === accountId && l.side === 'Cr').reduce((t, l) => t + l.amount, 0) / 100;

// 4. deb-set-vendor: a business taken over (with goodwill or a capital reserve) or two assets bought from a vendor,
//    paid for in debentures at par, at a premium or at a discount, with or without a cheque for part of the price;
//    then the interest from the day of issue, the write-off of any discount or loss, and the transfer of the interest.
//    The shapes below are the mixes of these that give six to eight entries (complex).
const VENDOR_SHAPES: { early: boolean; cheque: boolean; loss: boolean }[] = [
  { early: false, cheque: true, loss: false }, // 6 entries
  { early: false, cheque: false, loss: true }, // 6
  { early: false, cheque: true, loss: true }, // 7
  { early: true, cheque: false, loss: false }, // 7
  { early: true, cheque: true, loss: false }, // 8
  { early: true, cheque: false, loss: true }, // 8
];
const VENDOR_LOSS_TERMS: [IssueAt, boolean][] = [['discount', false], ['discount', false], ['discount', true], ['par', true], ['premium', true]];
const BOUGHT_PAIR = ASSET_BOUGHT.filter((a) => a.id !== 'patents');
const BY_WORTH = ['land', 'building', 'machinery', 'furniture'];

/** What a set about a purchase paid for in debentures was made from, for its `verify`. Per debenture: `price`, `prem`, `disc`, `red`. */
interface VendorDeal {
  party: string;
  pc: number;
  cheque: number;
  /** The net assets of a business taken over; null where assets alone were bought. */
  net: number | null;
  price: number;
  prem: number;
  disc: number;
  red: number;
  rate: number;
  months: number;
  sp: number;
}
const keptDeal = keepFor<VendorDeal>();

const setVendor = journalSetTemplate({
  id: 'deb-set-vendor', topicId: T, conceptId: 'deb-sets', difficulty: 'complex',
  generate: (rng) => {
    const co = rng.pick(COMPANIES), v = rng.pick(VENDORS), y = rng.int(2023, 2025), years = rng.int(4, 8);
    const shape = rng.pick(VENDOR_SHAPES);
    const [at, redeemAtPremium]: [IssueAt, boolean] = shape.loss ? rng.pick(VENDOR_LOSS_TERMS) : [rng.pick(['par', 'premium', 'premium'] as const), false];
    const when = rng.pick(ISSUE_DATES.filter((d) => (shape.early ? d.months > 6 : d.months <= 6)));
    const n = rng.step(2000, 20000, 500);
    const rate = wholeRate(rng, n * 100, halves(when.months));
    if (rate === null) return null;
    const i: Issue = {
      n, rate, face: 100,
      prem: at === 'premium' ? rng.pick([5, 10, 20, 25]) : 0,
      disc: at === 'discount' ? rng.pick([5, 10]) : 0,
      red: redeemAtPremium ? rng.pick([5, 10]) : 0,
    };
    const price = priceOf(i), settled = n * price;
    const cheque = shape.cheque ? rng.step(50000, 300000, 10000) : 0;
    const pc = settled + cheque;
    const words = i.prem > 0 ? `at a premium of ${i.prem}%` : i.disc > 0 ? `at a discount of ${i.disc}%` : 'at par';
    const discount = n * i.disc, onRedemption = n * i.red, own = n * i.prem;
    const sp = drawPremiumBalance(rng, discount + onRedemption);
    const date = `1 ${when.month} ${when.nextYear ? y + 1 : y}`;
    const business = rng.int(0, 2) > 0;
    let purchase: SetTransaction;
    let net: number | null = null;
    let spare: string;
    if (business) {
      const tk = drawTakeover(rng, pc);
      if (!tk) return null;
      net = netAssets(tk);
      spare = tk.diff > 0 ? 'capitalReserve' : 'goodwill';
      purchase = on(
        date,
        `${capitalise(tookOver(tk, v))}, for a purchase consideration of ${inr(pc)}.`,
        entry(...tk.assets.map((a) => dr(a.id, a.value)), dr('goodwill', Math.max(0, tk.diff)), cr('creditors', tk.creditors), cr(vendor(v), pc), cr('capitalReserve', Math.max(0, -tk.diff))),
        [
          'Each asset taken over is debited at its agreed value, and the creditors taken over are credited.',
          `${v} is credited with the purchase consideration, ${inr(pc)}, until it is settled.`,
          netWorking(tk),
          tk.diff > 0
            ? `The consideration is more than the net assets by ${inr(pc)} - ${inr(net)} = ${inr(tk.diff)}: Goodwill A/c is debited.`
            : `The consideration is less than the net assets by ${inr(net)} - ${inr(pc)} = ${inr(-tk.diff)}: Capital Reserve A/c is credited.`,
        ],
      );
    } else {
      // Two of the assets, the one that is usually worth more first: it gets the larger part of the price.
      const [a1, a2] = rng.shuffle(BOUGHT_PAIR).slice(0, 2).sort((a, b) => BY_WORTH.indexOf(a.id) - BY_WORTH.indexOf(b.id));
      const v1 = Math.floor((pc * rng.pick([0.55, 0.6, 0.65, 0.7])) / 10000) * 10000, v2 = pc - v1;
      if (v2 < 20000) return null;
      spare = 'goodwill';
      purchase = on(date, `Bought ${a1.text} for ${inr(v1)} and ${a2.text} for ${inr(v2)} from ${v}.`, [dr(a1.id, v1), dr(a2.id, v2), cr(vendor(v), pc)], [
        `The assets come in at what they cost: ${capitalise(a1.id)} A/c is debited with ${inr(v1)} and ${capitalise(a2.id)} A/c with ${inr(v2)}.`,
        `${v} is owed ${inr(v1)} + ${inr(v2)} = ${inr(pc)} until the price is settled: ${v} is credited. Assets bought at their own prices leave neither goodwill nor a capital reserve.`,
      ]);
    }
    const transactions: SetTransaction[] = [purchase];
    if (cheque > 0) {
      transactions.push(
        on(date, `Paid ${v} ${inr(cheque)} by cheque in part payment of the price.`, [dr(vendor(v), cheque), cr('bank', cheque)], [
          `Part of what is owed to ${v} is paid: ${v} is debited with ${inr(cheque)}.`,
          'The cheque is paid out of the bank: Bank A/c is credited.',
        ]),
      );
    }
    transactions.push(
      on(date, `Issued ${rate}% Debentures of ₹100 each ${words} to ${v} in settlement of the ${cheque > 0 ? 'balance' : 'whole amount'} due.`, allotmentLines(i, vendor(v), settled), [
        `${cheque > 0 ? `Balance due = ${inr(pc)} - ${inr(cheque)} = ${inr(settled)}. ` : ''}${v} takes each debenture at its issue price of ${inr(price)}, so the number of debentures = ${inr(settled)} / ${inr(price)} = ${count(n)}. ${v} is debited with ${inr(settled)} and so settled.`,
        ...allotmentSteps(i),
      ]),
    );
    const { txs, closing } = interestTxs(y, rate, n * 100, when.months, date);
    transactions.push(...txs);
    if (discount + onRedemption > 0) transactions.push(writeOffTx(`31 March ${y + 1}`, discount, onRedemption, sp, own));
    transactions.push(closing);
    const what = redeemAtPremium ? 'loss' : 'discount';
    const opening = `During the year ended 31 March ${y + 1}, ${co} ${business ? `took over the business of ${v}` : `bought assets from ${v}`} and paid ${
      cheque > 0 ? 'part of the price by cheque and the rest' : 'the price'
    } in its own ${rate}% Debentures of ₹100 each, which are redeemable ${redeemAtPremium ? `at a premium of ${i.red}%` : 'at par'} after ${years} years. ${v} is credited with the price until it is settled.${
      redeemAtPremium
        ? ` The premium payable on redemption is provided for when the debentures are issued, and the whole loss on the issue (${i.disc > 0 ? 'the discount and that premium' : 'that premium'}) is recorded in ${LOSS_AC}.`
        : ''
    }${
      discount + onRedemption > 0
        ? ` The ${what} on the issue is written off at the end of the year, first from Securities Premium${own > 0 ? ' (the premium received on this issue included)' : ''} and then from the Statement of Profit and Loss; before these transactions Securities Premium A/c ${sp > 0 ? `had a balance of ${inr(sp)}` : 'had no balance'}.`
        : ''
    } Interest runs from the day the debentures are issued. ${INTEREST_CONVENTION}`;
    keptDeal.keep(opening, { party: vendor(v), pc, cheque, net, price, prem: i.prem, disc: i.disc, red: i.red, rate, months: when.months, sp });
    return {
      opening,
      transactions,
      hints: [
        'The vendor takes each debenture at its issue price: number of debentures = amount to be settled / issue price. The debentures account is credited with their nominal value.',
        'Interest is on the nominal value, from the day of issue. A discount or loss on issue is written off first from Securities Premium, then from the Statement of Profit and Loss.',
      ],
      distractorAccounts: [spare, lossIdOf(!redeemAtPremium), 'securitiesPremium', 'premiumOnRedemptionOfDebentures', DAA, 'interestPaid'],
    };
  },
  // Worked again from the price, the cheque and the terms alone: the number of debentures at the issue price, what
  // that leaves in every account at the end of the year, and the vendor settled to the rupee.
  verify: (q) => {
    const k = keptDeal.of(q.prompt.slice(q.prompt.indexOf('\n') + 1));
    if (!k || !setHolds()(q)) return false;
    const left = leftIn(q), n = (k.pc - k.cheque) / k.price, nominal = n * 100;
    const loss = n * (k.disc + k.red), available = k.sp + n * k.prem, interest = (nominal * k.rate * k.months) / 1200;
    const used = lossIdOf(k.red > 0);
    return (
      Number.isInteger(n) &&
      left(k.party) === 0 &&
      setCredits(q, k.party) === k.pc &&
      left(debentures(k.rate)) === -nominal &&
      left('goodwill') === (k.net === null ? 0 : Math.max(0, k.pc - k.net)) &&
      left('capitalReserve') === -(k.net === null ? 0 : Math.max(0, k.net - k.pc)) &&
      left(used) === 0 &&
      setDebits(q, used) === loss &&
      setDebits(q, lossIdOf(k.red === 0)) === 0 &&
      left(PREM_RED) === -(n * k.red) &&
      left(SP) === Math.min(loss, available) - n * k.prem &&
      left(SPL) === interest + Math.max(0, loss - available) &&
      left('bank') === -k.cheque - interest &&
      left('debentureholders') === 0 &&
      left('debentureInterest') === 0
    );
  },
});

// 5. deb-set-collateral: debentures given to a bank as collateral security and recorded in the books (the second
//    method, which the opening names): the loan, the debentures through Debenture Suspense A/c, the interest on the
//    loan (and on the loan alone), the repayment, and the cancelling of the debentures when the bank releases them.
//    The interest is paid by a cheque of its own (five entries) or with the loan in one cheque (four) (medium).
//    Every loan here is repaid within the accounting year, so no interest is outstanding at a year end.
const LOAN_PERIODS: { from: string; to: string; months: number; fromNext?: true; toNext?: true }[] = [
  { from: '1 April', to: '30 September', months: 6 },
  { from: '1 April', to: '31 December', months: 9 },
  { from: '1 April', to: '31 March', months: 12, toNext: true },
  { from: '1 July', to: '31 December', months: 6 },
  { from: '1 July', to: '31 March', months: 9, toNext: true },
  { from: '1 October', to: '31 March', months: 6, toNext: true },
];
const keptLoan = keepFor<{ loan: number; nominal: number; rate: number; loanRate: number; months: number }>();

const setCollateral = journalSetTemplate({
  id: 'deb-set-collateral', topicId: T, conceptId: 'deb-sets', difficulty: 'medium',
  generate: (rng) => {
    const co = rng.pick(COMPANIES), y = rng.int(2023, 2025), rate = rng.pick(RATES);
    const loanRate = rng.pick([8, 9, 10, 11, 12, 13].filter((x) => x !== rate));
    const loan = rng.step(500000, 4000000, 100000);
    const nominal = (loan * rng.pick([120, 125, 130, 150])) / 100;
    const period = rng.pick(LOAN_PERIODS);
    const from = `${period.from} ${y}`, to = `${period.to} ${period.toNext ? y + 1 : y}`;
    const interest = (loan * loanRate * period.months) / 1200;
    const oneCheque = rng.int(0, 2) === 0;
    const interestSteps = [
      `From ${from} to ${to} is ${period.months} months. Interest is on the loan, the money actually borrowed: ${inr(loan)} x ${loanRate}% x ${period.months}/12 = ${inr(interest)}.`,
      `Nothing is worked on the ${rate}% Debentures of ${inr(nominal)}: debentures held as collateral security carry no interest.`,
    ];
    const opening = `${co} took a loan from its bank and gave the bank its own ${rate}% Debentures as collateral security. The company records debentures issued as collateral security in its books (the second method, through Debenture Suspense A/c), so an entry is passed for the debentures as well as for the loan. The loan carries interest at ${loanRate}% a year, payable when the loan is repaid; no interest is payable on debentures held as collateral security. The company kept to the terms of the loan throughout.`;
    keptLoan.keep(opening, { loan, nominal, rate, loanRate, months: period.months });
    return {
      opening,
      transactions: [
        on(from, `Took a loan of ${inr(loan)} from the bank; the money was credited to the company's account with the bank.`, [dr('bank', loan), cr('bankLoan', loan)], [
          'The money borrowed comes into the bank account: Bank A/c is debited.',
          'It is owed to the bank: Bank Loan A/c is credited. This is the only liability the loan creates.',
        ]),
        on(from, `Issued ${rate}% Debentures of ${inr(nominal)} to the bank as collateral security for the loan.`, [dr('debentureSuspense', nominal), cr(debentures(rate), nominal)], [
          `No money is received for these debentures, so Bank A/c is not touched. Under the second method ${rate}% Debentures A/c is credited with their nominal value, ${inr(nominal)}.`,
          'Debenture Suspense A/c is debited with the same amount. In the balance sheet it is deducted from the debentures, so that the liability stays at the amount of the loan.',
        ]),
        ...(oneCheque
          ? [
              on(to, `Repaid the loan, together with the interest on it from ${from} to ${to}, by one cheque.`, [dr('bankLoan', loan), dr('interestPaid', interest), cr('bank', loan + interest)], [
                ...interestSteps,
                `The loan is cleared: Bank Loan A/c is debited with ${inr(loan)}. The interest is an expense: Interest Paid A/c is debited. Bank A/c is credited with the cheque, ${inr(loan)} + ${inr(interest)} = ${inr(loan + interest)}.`,
              ]),
            ]
          : [
              on(to, `Paid the bank, by cheque, the interest on the loan from ${from} to ${to}.`, [dr('interestPaid', interest), cr('bank', interest)], [
                ...interestSteps,
                'The interest is an expense: Interest Paid A/c is debited, and Bank A/c is credited.',
              ]),
              on(to, 'Repaid the loan in full by a second cheque.', [dr('bankLoan', loan), cr('bank', loan)], [
                `The amount owed to the bank is cleared: Bank Loan A/c is debited with ${inr(loan)}, the amount borrowed and not the nominal value of the debentures.`,
                'Bank A/c is credited.',
              ]),
            ]),
        on(to, 'The bank released the debentures it held as collateral security, and they were cancelled.', [dr(debentures(rate), nominal), cr('debentureSuspense', nominal)], [
          `With the loan repaid the security is released. The entry made on their issue is reversed: ${rate}% Debentures A/c is debited with ${inr(nominal)}.`,
          'Debenture Suspense A/c is credited and so closed. Nothing is paid for the debentures, because nothing was received for them.',
        ]),
      ],
      hints: H.collateral,
      // Six choices beside those of the entries, so that no other account is drawn: a loan from a bank has one name here.
      distractorAccounts: ['debentureInterest', 'debentureholders', DAA, 'securitiesPremium', 'discountOnIssueOfDebentures'],
    };
  },
  // From the loan, the two rates and the months alone: the interest is on the loan, the loan is cleared, and the
  // debentures and the suspense account end as they began, at nil, with no interest ever charged on the debentures.
  verify: (q) => {
    const k = keptLoan.of(q.prompt.slice(q.prompt.indexOf('\n') + 1));
    if (!k || !setHolds()(q)) return false;
    const left = leftIn(q), interest = (k.loan * k.loanRate * k.months) / 1200;
    return (
      setCredits(q, 'bankLoan') === k.loan &&
      left('bankLoan') === 0 &&
      setCredits(q, debentures(k.rate)) === k.nominal &&
      left(debentures(k.rate)) === 0 &&
      left('debentureSuspense') === 0 &&
      left('interestPaid') === interest &&
      left('bank') === -interest &&
      setDebits(q, 'debentureInterest') === 0
    );
  },
});

const sets: Template[] = [setIssueCash, setSixCases, setInterestYear, setVendor, setCollateral];

// ===============================================================================================================
// FORMATS
// ===============================================================================================================
// The ledger accounts of a year of issue are written up from the entries of that year, posted with `accountOf`. A
// ledger is posted from the compound entry of an allotment item by item: the debentures account shows the money (or
// the price settled) and the discount as two items, and the loss account shows the discount ("To % Debentures A/c")
// and the premium payable on redemption ("To Premium on Redemption of Debentures A/c") as two. `ledgerEntries`
// writes each allotment as those two halves; `journalEntries` writes it as the one compound entry, and `verify`
// posts that form to check what the account comes to.

/** The name an account has in the particulars of a ledger account: a vendor by name alone, the Statement of Profit and Loss without "A/c". */
const particulars = (accountId: string): string =>
  accountId === SPL ? 'Statement of Profit and Loss' : isParty(accountId) ? resolveAccount(accountId).name : ledgerLabel(accountId);

/**
 * One lot of debentures of ₹100 allotted during a year: to the public for cash (the whole price with the
 * application), or to a vendor in payment for an asset. The premium and the discount are rupees a debenture.
 */
interface YearLot {
  date: string;
  n: number;
  prem: number;
  disc: number;
  vendor?: string;
  asset?: { id: string; text: string };
}
/** A year in which a company allots debentures of one class, once or twice. */
interface YearOfIssue {
  co: string;
  /** The accounting year runs from 1 April of `y` to 31 March of `y + 1`. */
  y: number;
  rate: number;
  years: number;
  /** The premium payable on redemption, in rupees a debenture (0 when they are redeemable at par). */
  red: number;
  /** The nominal value of the debentures of this class outstanding from earlier years. */
  old: number;
  /** The balance of Securities Premium on 1 April. */
  sp: number;
  lots: YearLot[];
}
const lotMoney = (l: YearLot): number => l.n * (100 + l.prem - l.disc);
const lotTerms = (l: YearLot): string => (l.prem > 0 ? `at a premium of ${l.prem}%` : l.disc > 0 ? `at a discount of ${l.disc}%` : 'at par');
const yearNominal = (s: YearOfIssue): number => s.old + s.lots.reduce((t, l) => t + l.n * 100, 0);
const yearLoss = (s: YearOfIssue): number => s.lots.reduce((t, l) => t + l.n * (l.disc + s.red), 0);
const yearPremium = (s: YearOfIssue): number => s.lots.reduce((t, l) => t + l.n * l.prem, 0);
const lossNameOf = (s: YearOfIssue): string => (s.red > 0 ? LOSS_AC : DISCOUNT_AC);

/**
 * A year of issue: a lot to the public, a lot to a vendor, or both in either order, in two different months. For a
 * loss account the debentures are more often redeemable at a premium and Securities Premium has an opening balance
 * drawn against the loss; for the debentures account there may be debentures of an earlier year.
 */
function drawYearOfIssue(rng: Rng, forLoss: boolean): YearOfIssue {
  const y = rng.int(2023, 2025);
  const terms = (choices: readonly IssueAt[]): { prem: number; disc: number } => {
    const at = rng.pick(choices);
    return { prem: at === 'premium' ? rng.pick([5, 10, 20, 25]) : 0, disc: at === 'discount' ? rng.pick([5, 10]) : 0 };
  };
  const toPublic: YearLot = { date: '', n: rng.step(2000, 12000, 1000), ...terms(['discount', 'discount', 'premium', 'premium', 'par']) };
  const toVendor: YearLot = { date: '', n: rng.step(1000, 8000, 500), ...terms(['discount', 'discount', 'premium', 'par']), vendor: rng.pick(VENDORS), asset: rng.pick(BOUGHT_PAIR) };
  // A loss account always has both lots: with one lot it would seldom have the four rows of a four-mark question.
  const lots = rng.int(0, 3) === 0 && !forLoss ? [toPublic] : rng.shuffle([toPublic, toVendor]);
  const months = setDays(rng, 2, 0, 10);
  lots.forEach((l, k) => {
    l.date = `${rng.pick([1, 5, 10, 15, 20])} ${monthIn(y, months[k])}`;
  });
  const s: YearOfIssue = { co: rng.pick(COMPANIES), y, rate: rng.pick(RATES), years: rng.int(4, 8), red: rng.pick(forLoss ? [0, 5, 5, 10, 10] : [0, 0, 5, 10]), old: 0, sp: 0, lots };
  if (forLoss && s.red === 0) {
    // Redeemable at par, the account holds the discounts alone: both lots go out at a discount, and Securities
    // Premium bears a part of them, so that the account has two rows on each side.
    for (const l of lots) {
      l.prem = 0;
      if (l.disc === 0) l.disc = rng.pick([5, 10]);
    }
    s.sp = Math.max(1000, Math.floor((yearLoss(s) * rng.pick([0.25, 0.4, 0.5, 0.6])) / 1000) * 1000);
  } else if (forLoss) s.sp = drawPremiumBalance(rng, yearLoss(s));
  else if (rng.int(0, 2) === 0) s.old = rng.step(200000, 1000000, 100000);
  return s;
}

/** The account that holds what a lot was allotted against: the vendor, or Debenture Application and Allotment A/c. */
const lotSource = (l: YearLot): string => (l.vendor ? vendor(l.vendor) : DAA);

/** The entries of a year of issue as a ledger is posted from them: see the note at the head of this section. */
function ledgerEntries(s: YearOfIssue): DatedEntry[] {
  const D = debentures(s.rate), L = lossIdOf(s.red > 0);
  const out: DatedEntry[] = [];
  for (const l of s.lots) {
    const money = lotMoney(l), source = lotSource(l);
    out.push({ date: l.date, lines: [dr(l.asset ? l.asset.id : 'bank', money), cr(source, money)] });
    out.push({ date: l.date, lines: entry(dr(source, money), cr(D, money - l.n * l.prem), cr(SP, l.n * l.prem)) });
    const lossLines = entry(dr(L, l.n * (l.disc + s.red)), cr(D, l.n * l.disc), cr(PREM_RED, l.n * s.red));
    if (lossLines.length > 0) out.push({ date: l.date, lines: lossLines });
  }
  const loss = yearLoss(s), fromSp = Math.min(loss, s.sp + yearPremium(s));
  if (loss > 0) out.push({ date: `31 March ${s.y + 1}`, lines: entry(dr(SP, fromSp), dr(SPL, loss - fromSp), cr(L, loss)) });
  return out;
}

/** The same year as the journal has it, one compound entry for each allotment, with the balances the year opens with. */
function journalEntries(s: YearOfIssue): { entries: JournalLine[][]; opening: Map<string, number> } {
  const entries: JournalLine[][] = [];
  for (const l of s.lots) {
    const money = lotMoney(l);
    entries.push([dr(l.asset ? l.asset.id : 'bank', money), cr(lotSource(l), money)]);
    entries.push(allotmentLines({ n: l.n, rate: s.rate, face: 100, prem: l.prem, disc: l.disc, red: s.red }, lotSource(l), money));
  }
  const loss = yearLoss(s), fromSp = Math.min(loss, s.sp + yearPremium(s));
  if (loss > 0) entries.push(entry(dr(SP, fromSp), dr(SPL, loss - fromSp), cr(lossIdOf(s.red > 0), loss)));
  const opening = new Map<string, number>();
  if (s.old > 0) opening.set(debentures(s.rate), -rupees(s.old));
  if (s.sp > 0) opening.set(SP, -rupees(s.sp));
  return { entries, opening };
}

/** The data of a year of issue, a line to each fact. `forLoss` adds what the write-off needs and leaves out the debentures of earlier years. */
function yearData(s: YearOfIssue, forLoss: boolean): string {
  const lotLine = (l: YearLot): string =>
    l.vendor && l.asset
      ? `${l.date}: Bought ${l.asset.text} from ${l.vendor} for ${inr(lotMoney(l))}. ${l.vendor} was credited with the price, which was settled in full the same day by issuing debentures to ${l.vendor} ${lotTerms(l)}.`
      : `${l.date}: Allotted ${count(l.n)} debentures to the public ${lotTerms(l)}. The whole issue price had been received with the applications and stood in Debenture Application and Allotment A/c.`;
  return [
    `${s.co} closes its books on 31 March. Its ${s.rate}% Debentures of ₹100 each are redeemable ${s.red > 0 ? `at a premium of ${s.red}%` : 'at par'} after ${s.years} years.`,
    ...(s.red > 0
      ? [`The premium payable on redemption is provided for when debentures are allotted, and the whole loss on an issue (any discount, and that premium) is debited to ${LOSS_AC}.`]
      : s.lots.some((l) => l.disc > 0)
        ? [`A discount on issue is debited to ${DISCOUNT_AC}.`]
        : []),
    ...(forLoss
      ? [`1 April ${s.y}: Securities Premium A/c ${s.sp > 0 ? `had a balance of ${inr(s.sp)}` : 'had no balance'}.`]
      : [s.old > 0 ? `1 April ${s.y}: ${count(s.old / 100)} of these debentures (${inr(s.old)}), allotted in an earlier year, were outstanding.` : `1 April ${s.y}: No debentures were outstanding.`]),
    ...s.lots.map(lotLine),
    ...(forLoss
      ? [`31 March ${s.y + 1}: The ${s.red > 0 ? 'loss' : 'discount'} on issue was written off, first from Securities Premium (any premium received during the year included) and then from the Statement of Profit and Loss.`]
      : []),
  ].join('\n');
}

/** True when two rows of a side have the same particulars and the same amount, so that nothing would tell them apart. */
const hasTwins = (rows: FormatRowParts[]): boolean => new Set(rows.map((r) => `${r.label}|${r.amount}`)).size !== rows.length;

const keptYear = keepFor<YearOfIssue>();
/** How a compound allotment entry (a discount and a premium payable on redemption in one entry) is posted, as the case studies say it. */
const POSTING_RULE = ', posting each discount against the debentures account and each premium payable on redemption against its own account';

// 1. deb-fmt-debentures-account: the debentures account of a year of issue, balanced and brought down. The task is
//    what the account is credited with: the nominal value alone, made up of the money (or the price settled) and the
//    discount, with a premium on issue and a premium payable on redemption kept out of it (medium).
const fmtDebenturesAccount = accountTemplate({
  id: 'deb-fmt-debentures-account', topicId: T, conceptId: 'deb-formats', difficulty: 'medium',
  // 2: when a premium is payable on redemption, the task says how the compound allotment entry is posted.
  version: 2,
  generate: (rng) => {
    const s = drawYearOfIssue(rng, false);
    // With every lot at par the account would only repeat the figures of the data.
    if (s.lots.every((l) => l.prem + l.disc === 0)) return null;
    const end = `31 March ${s.y + 1}`, reopen = `1 April ${s.y + 1}`, total = yearNominal(s);
    const view = accountOf(ledgerEntries(s), debentures(s.rate), s.old > 0 ? { date: `1 April ${s.y}`, side: 'Cr', amount: rupees(s.old) } : null, particulars);
    const sides = ledgerSides(view, { closeOn: end, reopenOn: reopen });
    // Three credit rows at least: a lone lot at a premium, or at par beside one at a premium, would be an account of two figures.
    if (sides.right.rows.length < 3 || hasTwins(sides.right.rows)) return null;
    const data = yearData(s, false);
    keptYear.keep(data, s);
    const lossName = lossNameOf(s);
    const explanation: string[] = [`${s.rate}% Debentures A/c shows what the company has borrowed on its debentures: every debenture allotted is credited at its nominal value of ₹100, whatever was received for it.`];
    if (s.old > 0) explanation.push(`The debentures of the earlier year open the account on the credit side: By Balance b/d ${inr(s.old)}.`);
    for (const l of s.lots) {
      const nominal = l.n * 100, money = lotMoney(l), from = l.vendor ?? 'Debenture Application and Allotment A/c';
      const lead = l.vendor
        ? `${l.date}: ${l.vendor} takes each debenture at ${inr(100 + l.prem - l.disc)}, so ${inr(money)} / ${inr(100 + l.prem - l.disc)} = ${count(l.n)} debentures are issued, of a nominal value of ${inr(nominal)}.`
        : `${l.date}: ${count(l.n)} debentures of ₹100 have a nominal value of ${inr(nominal)}.`;
      explanation.push(
        l.prem > 0
          ? `${lead} Of the ${inr(money)} ${l.vendor ? 'settled' : 'received'}, only the nominal value is credited here: By ${from} ${inr(nominal)}. The premium of ${inr(l.n * l.prem)} is credited to Securities Premium A/c.`
          : l.disc > 0
            ? `${lead} ${inr(money)} of it is ${l.vendor ? 'set against the price owed' : 'received in money'}: By ${from} ${inr(money)}. The discount makes up the rest: By ${lossName} ${inr(l.n * l.disc)}.`
            : `${lead} The whole of it is ${l.vendor ? 'set against the price owed' : 'received in money'}: By ${from} ${inr(nominal)}.`,
      );
    }
    if (s.red > 0) explanation.push(`The premium payable on redemption, ${s.red}% of the nominal value, is credited to Premium on Redemption of Debentures A/c. It is owed over and above the nominal value, so it never enters this account.`);
    explanation.push(`The credit side comes to ${inr(total)}, the nominal value of all the debentures outstanding. It is a credit balance: To Balance c/d ${inr(total)} on ${end}, and By Balance b/d ${inr(total)} on ${reopen}.`);
    const bought = s.lots.find((l) => l.asset)?.asset;
    return {
      task: `Prepare ${s.rate}% Debentures A/c of ${s.co} for the year ended ${end}, balance it and bring the balance down on ${reopen}${s.red > 0 ? POSTING_RULE : ''}.`,
      data,
      title: `${s.rate}% Debentures A/c`,
      ...sides,
      distractors: ['Bank A/c', 'Securities Premium A/c', 'Premium on Redemption of Debentures A/c', `${s.rate}% Debentures A/c`, DISCOUNT_AC, LOSS_AC, ...(bought ? [`${capitalise(bought.id)} A/c`] : [])],
      explanation,
      hints: [
        'This account is credited with the nominal value only. A premium on issue goes to Securities Premium A/c, and a premium payable on redemption to an account of its own.',
        'Where debentures go out at a discount, the money (or the price settled) and the discount together make up their nominal value.',
      ],
    };
  },
  // The journal form of the same year, posted: the balance of the account is the nominal value of every debenture
  // outstanding, and that is what the account is carried down and brought down at.
  verify: (q) => {
    const s = keptYear.of(q.data);
    if (!s) return false;
    const { entries, opening } = journalEntries(s);
    const balance = balanceOf(post(entries, opening), debentures(s.rate)), nominal = rupees(yearNominal(s));
    const [left, right] = q.sides;
    return (
      balance?.side === 'Cr' &&
      balance.amount === nominal &&
      left.rows.length === 1 &&
      left.rows[0].closing === true &&
      left.rows[0].amounts[0] === nominal &&
      right.rows.reduce((t, r) => t + r.amounts[0], 0) === nominal &&
      right.below.length === 1 &&
      right.below[0].amounts[0] === nominal &&
      right.rows.every((r) => r.label !== 'Securities Premium A/c' && r.label !== 'Premium on Redemption of Debentures A/c')
    );
  },
});

// 2. deb-fmt-loss-account: the other account of the same year, Loss on Issue of Debentures A/c (or, for debentures
//    redeemable at par, Discount on Issue of Debentures A/c). It is debited lot by lot with the discount and with the
//    premium payable on redemption, and closed by the write-off: Securities Premium first, the premium received
//    during the year included, then the Statement of Profit and Loss (medium).
const fmtLossAccount = accountTemplate({
  id: 'deb-fmt-loss-account', topicId: T, conceptId: 'deb-formats', difficulty: 'medium',
  // 2: when a premium is payable on redemption, the task says how the compound allotment entry is posted.
  version: 2,
  generate: (rng) => {
    const s = drawYearOfIssue(rng, true);
    const loss = yearLoss(s);
    if (loss === 0) return null;
    const end = `31 March ${s.y + 1}`, name = lossNameOf(s), what = s.red > 0 ? 'loss' : 'discount';
    const sides = ledgerSides(accountOf(ledgerEntries(s), lossIdOf(s.red > 0), null, particulars), { closeOn: end });
    // Four rows at least, for a question of four marks: one lot at a discount, redeemable at par, would be an account of two or three figures.
    if (sides.left.rows.length + sides.right.rows.length < 4 || hasTwins(sides.left.rows)) return null;
    const data = yearData(s, true);
    keptYear.keep(data, s);
    const own = yearPremium(s), available = s.sp + own, fromSp = Math.min(loss, available), fromPl = loss - fromSp;
    const explanation: string[] = [
      s.red > 0
        ? `${LOSS_AC} gathers the whole loss on the debentures allotted in the year: the discount allowed on issue and the premium payable on redemption. It is debited as each lot is allotted.`
        : `${DISCOUNT_AC} is debited with the discount on each lot of debentures as it is allotted.`,
    ];
    for (const l of s.lots) {
      const price = 100 + l.prem - l.disc;
      const steps = [l.vendor ? `${l.date}: ${l.vendor} takes each debenture at ${inr(price)}, so ${inr(lotMoney(l))} / ${inr(price)} = ${count(l.n)} debentures are issued.` : `${l.date}: ${count(l.n)} debentures are allotted.`];
      if (l.disc > 0) steps.push(`Discount = ${count(l.n)} x ${inr(l.disc)} = ${inr(l.n * l.disc)}: To ${s.rate}% Debentures A/c, because that account is credited with the full nominal value.`);
      if (s.red > 0) steps.push(`Premium payable on redemption = ${count(l.n)} x ${inr(s.red)} = ${inr(l.n * s.red)}: To Premium on Redemption of Debentures A/c.`);
      if (l.disc + s.red === 0) steps.push(`They go out ${lotTerms(l)} and are redeemable at par, so this lot adds nothing to the account.`);
      if (l.prem > 0) steps.push(`The premium of ${inr(l.n * l.prem)} on this lot is credited to Securities Premium A/c; it is not set off here.`);
      explanation.push(steps.join(' '));
    }
    explanation.push(
      `The debit side comes to ${inr(loss)}, the ${what} to be written off in the year of allotment.`,
      available === 0
        ? `Securities Premium A/c has no balance, so the whole ${what} is charged to the Statement of Profit and Loss as a finance cost: By Statement of Profit and Loss ${inr(loss)}.`
        : `Securities Premium available on ${end} = ${own > 0 && s.sp > 0 ? `${inr(s.sp)} + ${inr(own)} received during the year = ${inr(available)}` : own > 0 ? `the ${inr(own)} received during the year` : inr(available)}. ${
            fromPl === 0
              ? `It bears the whole ${what}: By Securities Premium A/c ${inr(loss)}.`
              : `It is used first: By Securities Premium A/c ${inr(fromSp)}. The rest, ${inr(loss)} - ${inr(fromSp)} = ${inr(fromPl)}, is a finance cost: By Statement of Profit and Loss ${inr(fromPl)}.`
          }`,
      `The two sides agree at ${inr(loss)}: the account is closed, and nothing is carried to the next year.`,
    );
    return {
      task: `Prepare ${name} of ${s.co} for the year ended ${end} and close it${s.red > 0 ? POSTING_RULE : ''}.`,
      data,
      title: name,
      ...sides,
      // Both places a write-off can go are always on offer, so that the choices do not say how it was split.
      distractors: ['Securities Premium A/c', 'Statement of Profit and Loss', `${s.rate}% Debentures A/c`, 'Premium on Redemption of Debentures A/c', 'Balance c/d', DISCOUNT_AC, LOSS_AC, 'Debenture Application and Allotment A/c', 'General Reserve A/c', 'Bank A/c'],
      explanation,
      hints: [
        s.red > 0
          ? 'For each lot: discount on issue (if any) + premium payable on redemption. A premium received on issue is not deducted here.'
          : 'For each lot issued below ₹100: number of debentures x discount on one debenture. Find the number first where the debentures went to a vendor.',
        'The account is closed in the year of allotment: Securities Premium bears what it can, and the Statement of Profit and Loss the rest.',
      ],
    };
  },
  // From the terms alone, and from the journal form of the year posted: the loss of the year, what Securities
  // Premium can bear of it and what is left for the Statement, with the account closed and Securities Premium
  // left with what it had less what it bore.
  verify: (q) => {
    const s = keptYear.of(q.data);
    if (!s) return false;
    const loss = rupees(yearLoss(s)), available = rupees(s.sp + yearPremium(s));
    const { entries, opening } = journalEntries(s);
    const ledger = post(entries, opening);
    const [left, right] = q.sides;
    const total = (rows: typeof left.rows, label?: string): number => rows.filter((r) => label === undefined || r.label === label).reduce((t, r) => t + r.amounts[0], 0);
    return (
      loss > 0 &&
      balanceOf(ledger, lossIdOf(s.red > 0)) === null &&
      total(left.rows) === loss &&
      total(right.rows) === loss &&
      total(right.rows, 'Securities Premium A/c') === Math.min(loss, available) &&
      total(right.rows, 'Statement of Profit and Loss') === Math.max(0, loss - available) &&
      (ledger.get(SP) ?? 0) === Math.min(loss, available) - available &&
      (ledger.get(SPL) ?? 0) === Math.max(0, loss - available) &&
      [...left.rows, ...right.rows].every((r) => !r.closing)
    );
  },
});

// 3. deb-fmt-interest-account: Debenture Interest A/c of two years with half-yearly interest, closed to the Statement
//    of Profit and Loss at the end of each. One year of it is three rows at most, which is not a question of four
//    marks, so the account runs over the year of a first allotment and the year of a second: a part period for each
//    lot, a year in which the first lot runs in full, and two transfers (five or six rows, each period closed on its
//    own). Two debit rows of the same amount in one year could not be told apart (dates are not typed); a second lot
//    allotted during the second year makes its two interest dates differ in every seed (medium).
const keptInterest = keepFor<{ first: number; second: number; rate: number; months1: number; months2: number }>();

const fmtInterestAccount = accountTemplate({
  id: 'deb-fmt-interest-account', topicId: T, conceptId: 'deb-formats', difficulty: 'medium',
  generate: (rng) => {
    const co = rng.pick(COMPANIES), y = rng.int(2023, 2024);
    const when1 = rng.pick(ISSUE_DATES), when2 = rng.pick(ISSUE_DATES);
    const [a1, a2] = halves(when1.months), [b1, b2] = halves(when2.months);
    const n1 = rng.step(3000, 12000, 1000), n2 = rng.step(2000, 8000, 1000), first = n1 * 100, second = n2 * 100;
    const terms = (): string => {
      const at = rng.pick(['par', 'premium', 'discount', 'discount'] as const);
      return at === 'premium' ? `at a premium of ${rng.pick([5, 10, 20])}%` : at === 'discount' ? `at a discount of ${rng.pick([5, 10])}%` : 'at par';
    };
    const terms1 = terms(), terms2 = terms();
    const isWhole = (nominal: number, r: number, m: number): boolean => (nominal * r * m) % 1200 === 0;
    const rates = RATES.filter((r) => [a1, a2, 6].every((m) => isWhole(first, r, m)) && [b1, b2].every((m) => isWhole(second, r, m)));
    if (rates.length === 0) return null;
    const rate = rng.pick(rates);
    const end1 = `31 March ${y + 1}`, end2 = `31 March ${y + 2}`, sept1 = `30 September ${y}`, sept2 = `30 September ${y + 1}`;
    const from1 = `1 ${when1.month} ${when1.nextYear ? y + 1 : y}`, from2 = `1 ${when2.month} ${when2.nextYear ? y + 2 : y + 1}`;
    const half = interestFor(first, rate, 6);
    // What falls due on each interest date: nothing on 30 September of the first year when the first lot came later.
    const x1 = interestFor(first, rate, a1), x2 = interestFor(first, rate, a2);
    const x3 = half + interestFor(second, rate, b1), x4 = half + interestFor(second, rate, b2);
    const total1 = x1 + x2, total2 = x3 + x4;
    const due = (date: string, x: number): DatedEntry[] =>
      x === 0
        ? []
        : [
            { date, lines: [dr('debentureInterest', x), cr('debentureholders', x)] },
            { date, lines: [dr('debentureholders', x), cr('bank', x)] },
          ];
    const transfer = (date: string, x: number): DatedEntry => ({ date, lines: [dr(SPL, x), cr('debentureInterest', x)] });
    const entries: DatedEntry[] = [...due(sept1, x1), ...due(end1, x2), transfer(end1, total1), ...due(sept2, x3), ...due(end2, x4), transfer(end2, total2)];
    const data = [
      `${co} closes its books on 31 March. Interest on its ${rate}% Debentures of ₹100 each is payable half-yearly on 30 September and 31 March. On each of these dates the interest due is credited to Debentureholders A/c and paid by cheque the same day; no tax is deducted at source. At the end of each year the interest of the year is transferred to the Statement of Profit and Loss.`,
      `1 April ${y}: No debentures were outstanding.`,
      `${from1}: Allotted ${count(n1)} debentures ${terms1}. Interest on them runs from this day.`,
      `${from2}: Allotted a further ${count(n2)} debentures ${terms2}. Interest on them runs from this day.`,
    ].join('\n');
    keptInterest.keep(data, { first, second, rate, months1: when1.months, months2: when2.months });
    const on1 = (m: number, x: number): string => `${inr(first)} x ${rate}% x ${m}/12 = ${inr(x)}`;
    const on2 = (m: number): string => `on the ${inr(second)} allotted on ${from2}, for ${monthsWord(m)}, ${inr(second)} x ${rate}% x ${m}/12 = ${inr(interestFor(second, rate, m))}`;
    const older = `on the ${inr(first)} of the first allotment, for the half-year, ${on1(6, half)}`;
    return {
      task: `Prepare Debenture Interest A/c of ${co} for the two years ended ${end2}, closing it at the end of each year.`,
      data,
      title: 'Debenture Interest A/c',
      ...ledgerPeriods(
        entries,
        'debentureInterest',
        [{ closeOn: end1, reopenOn: `1 April ${y + 1}`, title: `Year ended ${end1}` }, { closeOn: end2, title: `Year ended ${end2}` }],
        null,
        particulars,
      ),
      distractors: ['Bank A/c', `${rate}% Debentures A/c`, 'Balance c/d', 'Balance b/d', 'Debenture Interest A/c', DISCOUNT_AC, 'Securities Premium A/c'],
      explanation: [
        `Interest is worked on the nominal value at ${rate}% a year, for the months the debentures were outstanding. The price at which they were issued does not enter into it.`,
        a1 > 0
          ? `${sept1}: the debentures allotted on ${from1} have run for ${monthsWord(a1)}, not a full half-year: ${on1(a1, x1)}. To Debentureholders A/c ${inr(x1)}.`
          : `${sept1}: no debentures had been allotted yet, so no interest fell due and the account has no row for this date.`,
        a1 > 0
          ? `${end1}: a full half-year, ${on1(6, x2)}: To Debentureholders A/c ${inr(x2)}.`
          : `${end1}: the debentures allotted on ${from1} have run for ${monthsWord(a2)}: ${on1(a2, x2)}. To Debentureholders A/c ${inr(x2)}.`,
        `Interest of the first year = ${a1 > 0 ? `${inr(x1)} + ${inr(x2)} = ` : ''}${inr(total1)}. It is a finance cost of that year: By Statement of Profit and Loss ${inr(total1)} on ${end1}. The account is closed, so the second year opens with no balance.`,
        b1 > 0
          ? `${sept2}: ${older}; ${on2(b1)}. Interest due = ${inr(half)} + ${inr(x3 - half)} = ${inr(x3)}: To Debentureholders A/c ${inr(x3)}.`
          : `${sept2}: ${older}. The further debentures were not yet allotted. To Debentureholders A/c ${inr(x3)}.`,
        `${end2}: ${older}; ${on2(b2)}. Interest due = ${inr(half)} + ${inr(x4 - half)} = ${inr(x4)}: To Debentureholders A/c ${inr(x4)}.`,
        `Interest of the second year = ${inr(x3)} + ${inr(x4)} = ${inr(total2)}: By Statement of Profit and Loss ${inr(total2)} on ${end2}.`,
        'The expense is debited when the interest falls due. Paying it is an entry between Debentureholders A/c and Bank A/c, which does not touch this account.',
      ],
      hints: [
        'Interest is worked on the nominal value at the stated rate, whatever the issue price, and only for the months each lot was outstanding before the interest date.',
        'The account is closed at the end of each year by transfer to the Statement of Profit and Loss, so the second year starts with no balance.',
      ],
    };
  },
  // From the two lots, the rate and the months alone: the interest of each year, what falls due on each
  // 30 September, and each year closed by one transfer of the whole of its interest.
  verify: (q) => {
    const k = keptInterest.of(q.data);
    if (!k || !q.later || q.later.length !== 1) return false;
    const of = (nominal: number, months: number): number => rupees((nominal * k.rate * months) / 1200);
    const year1 = of(k.first, k.months1), sept1 = of(k.first, Math.max(0, k.months1 - 6));
    const year2 = of(k.first, 12) + of(k.second, k.months2), sept2 = of(k.first, 6) + of(k.second, Math.max(0, k.months2 - 6));
    type Rows = (typeof q.sides)[0]['rows'];
    const holds = (debit: Rows, credit: Rows, sept: number, year: number): boolean =>
      debit.length === (sept > 0 ? 2 : 1) &&
      debit.every((r) => r.label === 'Debentureholders A/c' && !r.closing) &&
      debit[0].amounts[0] === (sept > 0 ? sept : year) &&
      debit.reduce((t, r) => t + r.amounts[0], 0) === year &&
      credit.length === 1 &&
      credit[0].label === 'Statement of Profit and Loss' &&
      credit[0].amounts[0] === year;
    return holds(q.sides[0].rows, q.sides[1].rows, sept1, year1) && holds(q.later[0][0], q.later[0][1], sept2, year2) && q.sides.every((s) => s.below.length === 0);
  },
});

// 4. deb-fmt-balance-sheet: what one issue leaves in the financial statements of its year, as a statement in parts:
//    the balance sheet extract (Reserves and surplus where Securities Premium is left, Long-term borrowings, and
//    Other long-term liabilities for a premium payable on redemption), the one line of the Statement of Profit and
//    Loss (Finance costs: the interest, and what Securities Premium could not bear of the discount or loss), and the
//    notes to accounts with their sub-totals. Every figure is read from the books: the entries of the year are
//    posted, the lines are the balances, and the notes are the postings of Securities Premium A/c and of the
//    Statement of Profit and Loss. A deduction in a note is a negative figure (complex).
//    Where Securities Premium is used up, the extract has no line for it: a nil item is not shown, and the engine
//    has no row for a nil figure.
const SHEET_CASES: [IssueAt, RedeemAt][] = [
  ['discount', 'par'], ['premium', 'par'], ['par', 'premium'], ['discount', 'premium'], ['discount', 'premium'], ['premium', 'premium'], ['premium', 'premium'],
];
const keptSheet = keepFor<{ i: Issue; months: number; sp: number }>();

const fmtBalanceSheet = statementTemplate({
  id: 'deb-fmt-balance-sheet', topicId: T, conceptId: 'deb-formats', difficulty: 'complex',
  generate: (rng) => {
    const co = rng.pick(COMPANIES), y = rng.int(2023, 2025), years = rng.int(4, 8);
    const [at, redeemAt] = rng.pick(SHEET_CASES);
    const when = rng.int(0, 2) === 0 ? { month: 'April', months: 12, nextYear: undefined } : rng.pick(ISSUE_DATES);
    const base = drawLot(rng, at, redeemAt === 'premium');
    const rate = wholeRate(rng, nominalOf(base), halves(when.months));
    if (rate === null) return null;
    const i: Issue = { ...base, rate };
    const nominal = nominalOf(i), discount = i.n * i.disc, onRedemption = i.n * i.red, loss = discount + onRedemption, own = i.n * i.prem;
    // An issue at a premium that is redeemable at par has no loss: an opening balance then gives its note two lines to add up.
    const sp = loss === 0 ? rng.step(20000, 200000, 10000) : at === 'premium' ? rng.pick([0, 0, 1]) * rng.step(10000, 60000, 10000) : drawPremiumBalance(rng, loss);
    const available = sp + own, fromSp = Math.min(loss, available), fromPl = loss - fromSp;
    const [m1, m2] = halves(when.months);
    const from = `1 ${when.month} ${when.nextYear ? y + 1 : y}`, sept = `30 September ${y}`, end = `31 March ${y + 1}`;
    const money = i.n * priceOf(i), interest = interestFor(nominal, rate, when.months);
    const what = i.red > 0 ? 'loss' : 'discount', What = capitalise(what);
    const due = (date: string, x: number): DatedEntry[] => [
      { date, lines: [dr('debentureInterest', x), cr('debentureholders', x)] },
      { date, lines: [dr('debentureholders', x), cr('bank', x)] },
    ];
    const entries: DatedEntry[] = [
      { date: from, lines: [dr('bank', money), cr(DAA, money)] },
      { date: from, lines: allotmentLines(i, DAA, money) },
      ...(m1 > 0 ? due(sept, interestFor(nominal, rate, m1)) : []),
      ...due(end, interestFor(nominal, rate, m2)),
      ...(loss > 0 ? [{ date: end, lines: entry(dr(SP, fromSp), dr(SPL, fromPl), cr(lossIdOf(i.red > 0), loss)) }] : []),
      { date: end, lines: [dr(SPL, interest), cr('debentureInterest', interest)] },
    ];
    const ledger = post(entries.map((e) => e.lines), new Map(sp > 0 ? [[SP, -rupees(sp)]] : []));
    const credit = (accountId: string): number => {
      const b = balanceOf(ledger, accountId);
      return b && b.side === 'Cr' ? b.amount : 0;
    };
    const reserve = credit(SP), borrowings = credit(debentures(rate)), other = credit(PREM_RED), finance = ledger.get(SPL) ?? 0;
    // The notes, from the postings of the two accounts they explain.
    const premiumView = accountOf(entries, SP, sp > 0 ? { date: `1 April ${y}`, side: 'Cr', amount: rupees(sp) } : null);
    const reserveRows: FormatRowParts[] = [
      ...premiumView.credit.map((p) => ({ label: p.accountIds.length === 0 ? `Securities premium on 1 April ${y}` : 'Premium received on issue of debentures', amount: p.amount })),
      // The minus sign says that the amount is deducted, so the wording without "Less:" is as right in this note.
      ...premiumView.debit.map((p) => ({ label: `Less: ${What} on issue of debentures written off`, amount: -p.amount, also: [`${What} on issue of debentures written off`] })),
    ];
    const costRows: FormatRowParts[] = accountOf(entries, SPL)
      .debit.map((p) => ({ label: p.accountIds[0] === 'debentureInterest' ? 'Interest on debentures' : `${What} on issue of debentures written off`, amount: p.amount }))
      .sort((a, b) => Number(b.label === 'Interest on debentures') - Number(a.label === 'Interest on debentures'));
    const face: (FormatRowParts | StatementLineParts)[] = [{ heading: `Balance Sheet as at ${end} (extract)` }, { heading: 'I. EQUITY AND LIABILITIES' }];
    const notes: (FormatRowParts | StatementLineParts)[] = [{ heading: 'Notes to Accounts' }];
    let noteNo = 0;
    if (reserve > 0) {
      const k = String(++noteNo);
      face.push({ heading: "Shareholders' funds" }, { label: 'Reserves and surplus', amount: reserve, note: k });
      notes.push({ heading: `Note ${k}: Reserves and surplus` }, ...reserveRows);
      if (reserveRows.length > 1) notes.push({ subtotal: `Securities premium on ${end}`, amount: reserve, sum: 'section' });
    }
    const borrowed = String(++noteNo);
    face.push({ heading: 'Non-current liabilities' }, { label: 'Long-term borrowings', amount: borrowings, note: borrowed });
    notes.push({ heading: `Note ${borrowed}: Long-term borrowings` }, { label: `${count(i.n)}, ${rate}% Debentures of ${inr(i.face)} each`, amount: borrowings });
    if (other > 0) {
      const k = String(++noteNo);
      face.push({ label: 'Other long-term liabilities', amount: other, note: k });
      notes.push({ heading: `Note ${k}: Other long-term liabilities` }, { label: 'Premium on redemption of debentures', amount: other });
    }
    const cost = String(++noteNo);
    face.push({ heading: `Statement of Profit and Loss for the year ended ${end} (extract)` }, { label: 'Finance costs', amount: finance, note: cost });
    notes.push({ heading: `Note ${cost}: Finance costs` }, ...costRows);
    if (costRows.length > 1) notes.push({ subtotal: 'Total finance costs', amount: finance, sum: 'section' });
    // Without a sub-total the screen would total the whole column, which means nothing here.
    if (!notes.some((line) => 'subtotal' in line)) return null;
    const data = [
      `${co} closes its books on 31 March.`,
      `1 April ${y}: Securities Premium A/c ${sp > 0 ? `had a balance of ${inr(sp)}` : 'had no balance'}, and the company had no debentures.`,
      `${from}: Allotted ${lot(i)} ${issueTerms(rng, i)}, ${redTerms(i, years)}. The whole issue price was received with the applications.`,
      ...(i.red > 0
        ? [
            `The premium payable on redemption was provided for on allotment, and the whole loss on the issue (${i.disc > 0 ? 'the discount and that premium' : 'that premium'}) was debited to ${LOSS_AC}. In the balance sheet a premium payable on redemption is shown under Other long-term liabilities.`,
          ]
        : []),
      'Interest on the debentures is payable half-yearly on 30 September and 31 March and was paid on the due dates; no tax is deducted at source.',
      ...(loss > 0 ? [`${end}: The ${what} on the issue was written off, first from Securities Premium${own > 0 ? ' (the premium received on this issue included)' : ''} and then from the Statement of Profit and Loss.`] : []),
      'Show only what arises from these debentures and from Securities Premium. A line that comes to nil is left out, with its note.',
    ].join('\n');
    keptSheet.keep(data, { i, months: when.months, sp });
    const explanation: string[] = [
      `Long-term borrowings: the debentures stand at their nominal value, ${count(i.n)} x ${inr(i.face)} = ${inr(nominal)}, whatever was received for them. They fall due after ${years} years, so they are a non-current liability.`,
    ];
    if (i.red > 0) explanation.push(`Other long-term liabilities: the premium payable on redemption, ${count(i.n)} x ${inr(i.red)} = ${inr(onRedemption)}, is owed from the day of issue and falls due with the debentures. It is not money borrowed, so it is shown apart from them.`);
    if (loss > 0) explanation.push(i.red > 0 && i.disc > 0 ? `Loss on issue = discount ${inr(discount)} + premium on redemption ${inr(onRedemption)} = ${inr(loss)}.` : i.red > 0 ? `Loss on issue = the premium payable on redemption, ${inr(loss)}.` : `Discount on issue = ${count(i.n)} x ${inr(i.disc)} = ${inr(loss)}.`);
    const availableLine = own > 0 && sp > 0 ? `${inr(sp)} + ${inr(own)} received on this issue = ${inr(available)}` : own > 0 ? `the ${inr(own)} received on this issue` : inr(available);
    if (loss === 0) explanation.push(`Reserves and surplus: Securities Premium = ${availableLine}. There is no discount or loss to write off against it.`);
    else if (available === 0) explanation.push(`Securities Premium A/c has no balance, so nothing is shown under Reserves and surplus and the whole ${what} of ${inr(loss)} is charged to the Statement of Profit and Loss.`);
    else if (reserve > 0) explanation.push(`Reserves and surplus: Securities Premium available = ${availableLine}. It bears the whole ${what}, and ${inr(available)} - ${inr(loss)} = ${inr(available - loss)} is left. Nothing of the ${what} reaches the Statement of Profit and Loss.`);
    else explanation.push(`Securities Premium available = ${availableLine}. All of it is used against the ${what}, so nothing is left to show under Reserves and surplus; the rest, ${inr(loss)} - ${inr(available)} = ${inr(fromPl)}, is charged to the Statement of Profit and Loss.`);
    explanation.push(
      `Interest: ${inr(nominal)} x ${rate}% x ${when.months}/12 = ${inr(interest)}${when.months < 12 ? `, for the ${when.months} months from ${from}` : ''}. It is on the nominal value and has all been paid, so nothing of it is owed on ${end}.`,
      fromPl > 0 ? `Finance costs = interest ${inr(interest)} + ${what} written off ${inr(fromPl)} = ${inr(interest + fromPl)}.` : `Finance costs = the interest alone, ${inr(interest)}.`,
      'Each note repeats the figure of its line in the statement and shows what it is made of.',
    );
    return {
      task: `Show how these debentures appear in the Balance Sheet of ${co} as at ${end} and in its Statement of Profit and Loss for the year, with the notes to accounts. Show an amount that is deducted with a minus sign.`,
      data,
      title: `Extracts from the Balance Sheet and the Statement of Profit and Loss of ${co}, with the notes to accounts`,
      columns: [{ name: 'Amount (₹)', signed: true }],
      noteHeading: 'Note No.',
      rows: [...face, ...notes],
      // The lines a year of issue may or may not have are always on offer, with the heads a student wrongly reaches for.
      distractors: [
        'Reserves and surplus', 'Other long-term liabilities', 'Premium on redemption of debentures', 'Premium received on issue of debentures',
        'Loss on issue of debentures written off', 'Discount on issue of debentures written off', 'Less: Loss on issue of debentures written off', 'Less: Discount on issue of debentures written off',
        // "Long-term provisions" is not offered: some books print a premium payable on redemption under it.
        `Securities premium on 1 April ${y}`, 'Short-term borrowings', 'Other current liabilities', 'Trade payables', 'Share capital', 'Other expenses',
      ],
      explanation,
      hints: [
        'The debentures stand at their nominal value under Long-term borrowings. What is left of Securities Premium is a reserve; a premium payable on redemption is a liability of its own.',
        'Finance costs = the interest for the months the debentures were outstanding + the part of the discount or loss that Securities Premium could not bear.',
      ],
    };
  },
  // From the terms of the issue alone, without the books: the nominal value, the premium payable on redemption, what
  // is left of Securities Premium, and the interest with what the Statement bears of the discount or loss.
  verify: (q) => {
    const k = keptSheet.of(q.data);
    if (!k) return false;
    const { i, months, sp } = k;
    const nominal = nominalOf(i), loss = i.n * (i.disc + i.red), available = sp + i.n * i.prem;
    const left = Math.max(0, available - loss), charged = Math.max(0, loss - available), interest = (nominal * i.rate * months) / 1200;
    const figure = (test: (label: string) => boolean): number => q.rows.filter((r) => test(r.label)).reduce((t, r) => t + r.amounts[0], 0) / 100;
    const is = (label: string) => (x: string) => x === label;
    const subtotals = (q.lines ?? []).flatMap((line) => ('subtotal' in line ? [line] : []));
    return (
      figure(is('Long-term borrowings')) === nominal &&
      figure((x) => x.endsWith('each')) === nominal &&
      figure(is('Other long-term liabilities')) === i.n * i.red &&
      figure(is('Premium on redemption of debentures')) === i.n * i.red &&
      figure(is('Reserves and surplus')) === left &&
      figure((x) => x.startsWith('Securities premium on') || x.startsWith('Premium received') || x.startsWith('Less:')) === left &&
      figure((x) => x.startsWith('Less:')) === (left > 0 ? -loss : 0) &&
      figure(is('Finance costs')) === interest + charged &&
      figure(is('Interest on debentures')) === interest &&
      figure((x) => x.endsWith('written off') && !x.startsWith('Less:')) === charged &&
      subtotals.length > 0 &&
      subtotals.every((line) => line.amounts[0] / 100 === (line.subtotal === 'Total finance costs' ? interest + charged : left))
    );
  },
});

const formats: Template[] = [fmtDebenturesAccount, fmtLossAccount, fmtInterestAccount, fmtBalanceSheet];

// One-mark Assertion-Reason questions of the board. They stand on their own level and go into no mock paper and no
// Look back (`isAssertionReason`), so nothing that was served before moves.
const debAssertionReason = factsTemplate({
  id: 'deb-assertion-reason', topicId: 'debentures', conceptId: 'deb-meaning', difficulty: 'medium',
  // 2: the item on interest in a year of loss names the debentureholders where it said "They".
  version: 2,
  facts: assertionReasonFacts([
    {
      answer: 'both',
      assertion: '9% debentures of ₹5,00,000 are issued at ₹95 for every ₹100. The interest of a full year is ₹45,000.',
      reason: 'Interest on debentures is worked on the nominal value, whatever the issue price.',
      a: '₹5,00,000 × 9% = ₹45,000.',
      r: 'The rate is on the face value.',
      link: 'R explains A: the discount does not lower the amount on which the interest runs.',
    },
    {
      answer: 'both',
      assertion: 'A debentureholder is a creditor of the company.',
      reason: 'A debenture is a document that acknowledges a debt of the company.',
      a: 'The holder has lent money to the company.',
      r: 'It states the amount borrowed, the rate of interest and the terms of repayment.',
      link: 'R explains A: a person to whom a company owes a debt is its creditor.',
    },
    {
      answer: 'both',
      assertion: 'Where debentures issued as collateral security are recorded through Debenture Suspense A/c, that account is deducted from the debentures in the balance sheet.',
      reason: 'No money is received on these debentures; they only stand as an additional security for a loan.',
      a: 'The deduction leaves only the debentures issued for money.',
      r: 'They are given to the lender along with the loan.',
      link: 'R explains A: with no money received there is no new debt, so the entry has to be cancelled out in the balance sheet.',
    },
    {
      answer: 'both',
      assertion: 'Debentures of ₹100 are issued at ₹95 and are redeemable at ₹105. The loss on issue is ₹10 on each debenture.',
      reason: 'Loss on issue = discount allowed on issue + premium payable on redemption.',
      a: '₹5 + ₹5 = ₹10.',
      r: 'The company gets less than the face value at issue and pays more than it on redemption, and both are costs of the issue.',
      link: 'R explains A: the ₹10 is that rule at work.',
    },
    {
      answer: 'both',
      assertion: 'Securities Premium of ₹20,000 is available and a discount of ₹50,000 arises on debentures. The Statement of Profit and Loss bears ₹30,000 of it in the year of allotment.',
      reason: 'A discount is written off first from Securities Premium, and the balance from the Statement of Profit and Loss.',
      a: '₹50,000 - ₹20,000 = ₹30,000.',
      r: 'This is the order of writing off, in the year of allotment.',
      link: 'R explains A: the ₹30,000 is what is left after Securities Premium is used.',
    },
    {
      answer: 'bothNot',
      assertion: 'The debentures account is always credited with the nominal value.',
      reason: 'A discount on the issue of debentures is written off in the year of allotment.',
      a: 'The account shows the debt at its face value, whatever the issue price.',
      r: 'It is written off first from Securities Premium, and the balance from the Statement of Profit and Loss.',
      link: 'R does not explain A: R says when a discount is written off; the nominal value is credited because it is the face value of the debt.',
    },
    {
      answer: 'bothNot',
      assertion: 'Debentureholders have no voting rights in the company.',
      reason: 'Debentures may be secured by a charge on the assets of the company.',
      a: 'They are lenders, not members of the company.',
      r: 'Secured or mortgage debentures carry such a charge.',
      link: 'R does not explain A: they have no vote because they are not owners; security on the assets has nothing to do with it.',
    },
    {
      answer: 'bothNot',
      assertion: 'A vendor owed ₹4,75,000 is paid in debentures of ₹100 each at ₹95. The vendor gets 5,000 debentures.',
      reason: 'Discount on the issue of debentures is a finance cost when it is written off through the Statement of Profit and Loss.',
      a: '₹4,75,000 ÷ ₹95 = 5,000.',
      r: 'It is a part of the cost of borrowing.',
      link: 'R does not explain A: the number comes from dividing by the issue price, and where the discount is shown plays no part.',
    },
    {
      answer: 'aOnly',
      assertion: 'A company may issue debentures at a discount.',
      reason: "Debentures are a part of the shareholders' funds of a company.",
      a: 'The bar on an issue at a discount is on shares, not on debentures.',
      r: 'Debentures are borrowed money, shown under Long-term Borrowings.',
    },
    {
      answer: 'aOnly',
      assertion: '10% debentures of ₹2,00,000 are issued on 1 October and the year ends on 31 March. The interest of that year is ₹10,000.',
      reason: 'Interest on debentures is charged for a full year, whatever the date of issue.',
      a: '₹2,00,000 × 10% × 6/12 = ₹10,000.',
      r: 'Interest runs only for the months the debentures were outstanding.',
    },
    {
      answer: 'rOnly',
      assertion: 'Interest on debentures need not be paid in a year of loss.',
      reason: 'Debentureholders are creditors of the company.',
      a: 'Interest on debentures is a charge against profit, payable even in a year of loss.',
      r: 'Debentureholders have lent money to the company.',
    },
    {
      answer: 'rOnly',
      assertion: 'Premium on redemption of debentures payable after some years is shown under Reserves and Surplus.',
      reason: 'A premium on redemption is an amount the company is bound to pay when the debentures are redeemed.',
      a: 'It is shown under Other Long-term Liabilities.',
      r: 'The company takes on this obligation at the time of issue.',
    },
  ]),
});

// ===============================================================================================================
// ADDED LATER: INTEREST ACCRUED AT THE YEAR END, AND WHERE IT AND THE DEBENTURES ARE SHOWN. These stand on a level of
// their own and are kept off the mock papers, the worksheets and the Look back levels (src/generators/outsidePapers.ts).
// ===============================================================================================================

/** Half-yearly interest dates that leave interest accrued on 31 March, with the months since the last of them. */
const ACCRUAL_DATES = [
  { dates: '30 June and 31 December', last: '31 December 2025', months: 3 },
  { dates: '31 May and 30 November', last: '30 November 2025', months: 4 },
  { dates: '31 July and 31 January', last: '31 January 2026', months: 2 },
  { dates: '31 August and 28 February', last: '28 February 2026', months: 1 },
];

// 1. deb-interest-accrued: interest on debentures payable half-yearly on dates other than the year end: the interest
//    accrued but not due on 31 March, which the balance sheet shows (medium)
const interestAccrued = numericTemplate({
  id: 'deb-interest-accrued', topicId: T, conceptId: 'deb-interest', difficulty: 'medium', unit: 'rupees',
  generate: (rng) => {
    const co = rng.pick(COMPANIES), rate = rng.pick(RATES);
    const n = rng.step(1200, 24000, 600);
    const when = rng.pick(ACCRUAL_DATES);
    const price = rng.pick([100, 100, 95, 98, 105]);
    const N = n * 100;
    const accrued = (N * rate * when.months) / 1200;
    const r = numeric(accrued, [
      [(N * rate) / 200, 'Took the interest of a whole half-year, as if a payment fell due on 31 March.'],
      [(N * rate) / 100, "Took a whole year's interest; most of it has been paid on the interest dates."],
      [(n * price * rate * when.months) / 1200, `Worked the interest on the issue price, ${inr(price)}, instead of the nominal value of ₹100.`],
      [(N * rate * (6 - when.months)) / 1200, `Counted the months from 31 March to the next interest date instead of those from ${when.last}.`],
    ]);
    return r && {
      prompt: `${co} has ${count(n)}, ${rate}% Debentures of ₹100 each, issued at ${inr(price)} some years ago. Interest is payable half-yearly on ${when.dates}, and the interest due on ${when.last} has been paid. How much interest accrued but not due on the debentures is shown in the balance sheet on 31 March 2026?`,
      ...r,
      explanation: [
        `Interest runs on the nominal value: ${count(n)} x ₹100 = ${inr(N)}${price !== 100 ? `, whatever the issue price of ${inr(price)}` : ''}.`,
        `From ${when.last} to 31 March 2026 is ${when.months} month${when.months > 1 ? 's' : ''}; that interest is owed but falls due only on the next interest date.`,
        `Accrued = ${inr(N)} x ${rate}% x ${when.months}/12 = ${inr(accrued)}. It is debited to Debenture Interest A/c, so the year bears its full interest, and shown under Other current liabilities.`,
      ],
      hints: [
        'When was interest last paid, and how many months have passed since then by 31 March?',
        'Accrued interest = nominal value x rate x months since the last interest date / 12. It is a current liability until it is paid.',
      ],
    };
  },
  verify: (q) => {
    const n = toInt(/has ([\d,]+), \d+% Debentures/.exec(q.prompt)?.[1] ?? '');
    const rate = Number(/, (\d+)% Debentures/.exec(q.prompt)?.[1]);
    const when = ACCRUAL_DATES.find((w) => q.prompt.includes(`half-yearly on ${w.dates},`));
    return !!when && q.answer === rupees((n * 100 * rate * when.months) / 1200);
  },
});

// 2. deb-where-shown: where the balance sheet of a company shows interest accrued on debentures, interest due and not
//    paid, debentures falling due within twelve months, and the interest of the year (easy)
const whereShown = factsTemplate({
  id: 'deb-where-shown', topicId: T, conceptId: 'deb-interest', difficulty: 'easy',
  facts: [
    {
      prompt: 'Interest on debentures is payable on 30 June and 31 December. Where does the balance sheet of 31 March show the interest from 1 January to 31 March, which is not yet due?',
      correct: 'Current liabilities: Other current liabilities (interest accrued but not due on borrowings)',
      distractors: [
        { text: 'Non-current liabilities: Long-term borrowings, added to the debentures', why: 'Added the interest to the debt itself; it is payable within months, so it is a current liability apart from the debentures.' },
        { text: 'Current liabilities: Short-term provisions', why: 'Treated a known amount owed as an estimate; a provision is for an uncertain amount.' },
        { text: 'Nowhere: interest is recorded only when it is paid', why: 'Left out an expense of the year that is owed at its end.' },
      ],
      explanation: 'Interest accrued but not due is an amount owed and payable within the year: Other current liabilities, under Current liabilities.',
    },
    {
      prompt: 'A company could not pay the interest on its debentures that fell due on 31 December, and it is still unpaid on 31 March. Where is it shown in the balance sheet of 31 March?',
      correct: 'Current liabilities: Other current liabilities (interest accrued and due on borrowings)',
      distractors: [
        { text: 'Non-current liabilities: Long-term borrowings', why: 'Added unpaid interest to the debentures; it is owed now, so it is current.' },
        { text: 'Equity: Reserves and surplus, as a deduction', why: 'Took unpaid interest for a loss of the owners; it is a debt to the debentureholders.' },
        { text: 'Current liabilities: Trade payables', why: 'Trade payables are owed for goods and services bought, not for interest.' },
      ],
      explanation: 'Interest that has fallen due and is unpaid is still a current liability, shown under Other current liabilities.',
    },
    {
      prompt: 'Debentures of ₹5,00,000 issued five years ago fall due for repayment within the next twelve months. Under the amended Schedule III, where are they shown in the balance sheet?',
      correct: 'Current liabilities: Short-term borrowings (current maturities of long-term borrowings)',
      distractors: [
        { text: 'Non-current liabilities: Long-term borrowings, as before', why: 'Kept them where they were; a borrowing repayable within twelve months is current.' },
        { text: 'Current liabilities: Trade payables', why: 'Trade payables are for goods and services; debentures are borrowings.' },
        { text: 'Equity: Share capital', why: 'Debentures are borrowed money, never capital.' },
      ],
      explanation: 'The part of a long-term borrowing repayable within twelve months is a current maturity, shown under Short-term borrowings.',
    },
    {
      prompt: 'Where does the interest on debentures for the year appear in the financial statements of a company?',
      correct: 'Statement of Profit and Loss: Finance costs',
      distractors: [
        { text: 'Statement of Profit and Loss: Other expenses', why: 'Placed a cost of borrowing among the general expenses; it has a line of its own.' },
        { text: 'Balance sheet: Reserves and surplus, as an appropriation', why: 'Treated interest as an appropriation of profit; it is a charge against profit.' },
        { text: 'Balance sheet: Long-term borrowings', why: 'Mixed up the debt and the cost of it.' },
      ],
      explanation: 'Interest on borrowings, debentures among them, is a finance cost in the Statement of Profit and Loss.',
    },
  ].map((f) => ({
    ...f,
    hints: [
      'Is the item the debt, the cost of the debt for the year, or interest owed? Is it payable within twelve months?',
      'Finance costs hold the interest of the year; interest accrued or due and unpaid is an Other current liability; a borrowing repayable within twelve months is a current maturity under Short-term borrowings.',
    ],
  })),
});

const templates: Template[] = [...easy, ...medium, ...complex, ...sets, ...formats, debAssertionReason,
  // Added later, outside the papers (outsidePapers.ts).
  interestAccrued, whereShown,
];

export default templates;

/**
 * What the case studies of the company-accounts stage (`src/generators/cases/company-accounts.ts`) reuse of this
 * topic: the issue of a lot, its allotment entry and its write-off, the interest periods and the books of a year of
 * issue. Only exported here; nothing in this file uses the object, so no question of the topic changes.
 */
export const DEB_CASE = {
  COMPANIES, VENDORS, RATES, ISSUE_DATES, BOUGHT_PAIR, H, SET_HINTS, DAA, SPL, SP, PREM_RED, DISCOUNT_AC, LOSS_AC, INTEREST_CONVENTION,
  inr, count, capitalise, numeric, choice, dr, cr, entry, on,
  priceOf, nominalOf, pctOf, lot, issueTerms, redTerms, lossIdOf, monthIn, drawLot, drawPremiumBalance, allotmentLines, allotmentSteps,
  writeOffTx, halves, interestFor, wholeRate, monthsWord, interestTxs, particulars, hasTwins,
  lotMoney, lotTerms, yearNominal, yearLoss, yearPremium, lossNameOf, ledgerEntries, journalEntries,
  drawTakeover, tookOver, netAssets, netWorking,
};
export type { Issue as DebIssue, IssueAt as DebIssueAt, YearLot as DebYearLot, YearOfIssue as DebYearOfIssue, Takeover as DebTakeover };
