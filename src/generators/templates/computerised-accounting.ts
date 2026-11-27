import type { JournalQuestion, McqQuestion } from '@/content/types';
import { creditor, debtor } from '@/engine/accounts';
import type { JournalLine } from '@/engine/journal';
import type { Rng } from '@/engine/rng';
import { assertionReasonFacts, factsTemplate, amount, formatINR, journalTemplate, keepFor, mcqTemplate, numericTemplate, rupees, statementTemplate } from '../authoring';
import type { JournalParts, McqParts, NumericParts, Template } from '../types';

const T = 'computerised-accounting';

// ---------------------------------------------------------------------------------------------------------------
// Computerised Accounting, the option a school may teach in place of Part B (Analysis of Financial Statements) of
// Class 12. Conventions used throughout, each stated in the prompt that relies on it:
//  - a spreadsheet function is always described in plain words beside its name: what SLN, DB, PMT, IPMT and PPMT
//    give, and how;
//  - SLN: (cost - salvage value) ÷ life, the same every year;
//  - DB: a fixed rate, 1 - (salvage value ÷ cost)^(1 ÷ life), rounded to three decimal places, charged each period on
//    the book value at the start of the period. The figures are chosen so that the rate is exact (10%, 20%, 25%, 30%,
//    40% or 50%) and every amount is a whole rupee: nothing has to be rounded;
//  - a written down value schedule charges its rate on the book value at the start of each year, and the figures
//    come out in whole rupees;
//  - PMT gives the equal instalment paid at the end of each period that repays a loan with interest:
//    loan × r × (1 + r)^n ÷ ((1 + r)^n - 1). The loan is entered with a minus sign so the instalment comes out
//    positive. Loans are round (a multiple of ₹50,000 from ₹1,00,000 to ₹10,00,000) at a business rate of 8% to 12%,
//    repaid over 3 to 5 years. As a board's schedule does, the instalment PMT gives is rounded to the nearest rupee,
//    each year's interest (balance at its start × r) is rounded to the nearest rupee, principal = instalment -
//    interest, and the last instalment is adjusted to repay exactly the balance left with its interest; seeds where a
//    figure would end in exactly 50 paise are refused, so no rounding is in doubt;
//  - the quick ratio is (current assets - inventories - prepaid expenses) ÷ current liabilities, as the CBSE has it;
//  - the hierarchy of account heads is the general one (primary group, sub-group, ledger), never the reserved
//    sub-groups of one package;
//  - a relative reference moves with a copied formula by as many columns and rows as the copy moves; a $ fixes the
//    column letter or the row number it stands before;
//  - the code of a ledger account is the scheme the prompt sets out, and nothing else;
//  - adjusting, closing and opening entries are those of a sole trader whose books are kept on a computerised
//    system, entered through a journal voucher; depreciation is credited to the asset account.
// Amounts are whole rupees.
// ---------------------------------------------------------------------------------------------------------------

/** Whole rupees as a learner reads them: 48000 is "₹48,000". */
const inr = (n: number): string => formatINR(rupees(n));
/** A whole number with Indian grouping and no ₹: 480000 is "4,80,000". */
const grouped = (n: number): string => inr(n).slice(1);
/** A figure in hundredths as it is written: 250 is "2.5". */
const dec = (hundredths: number): string => String(Math.round(hundredths) / 100);

const FIRMS = [
  'Sagar Traders', 'Nila Textiles', 'Kaveri Electricals', 'Aravali Stores', 'Konkan Foods', 'Malwa Hardware', 'Vindhya Pharma',
  'Godavari Paints', 'Sahyadri Books', 'Narmada Tiles', 'Chenab Crockery', 'Tapti Garments',
];
const CUSTOMERS = ['Mehta & Sons', 'Anita Traders', 'Lakshmi Stores', 'Kiran Agencies'];
const SUPPLIERS = ['Rao & Co.', 'Sharma Bros', 'Pillai Suppliers', 'Bose Brothers'];

type Wrong = [text: string, why: string];

/** A multiple-choice question; null when fewer than three distinct wrong options remain. */
function choice(prompt: string, correct: string, wrong: Wrong[], explanation: string, hints?: string[]): McqParts | null {
  const seen = new Set([correct]);
  const distractors: { text: string; why: string }[] = [];
  for (const [text, why] of wrong) if (!seen.has(text) && seen.add(text)) distractors.push({ text, why });
  if (distractors.length < 3) return null;
  return { prompt, correct, distractors, explanation, ...(hints ? { hints } : {}) };
}

const optionText = (q: McqQuestion): string => q.options.find((o) => o.id === q.correct)?.text ?? '';
const cap = (s: string): string => s.charAt(0).toUpperCase() + s.slice(1);
/** The first letter in lower case, unless the word is written in capitals ("MIS reports"). */
const lower = (s: string): string => (/^[A-Z][A-Z]/.test(s) ? s : s.charAt(0).toLowerCase() + s.slice(1));

type Unit = 'rupees' | 'number' | 'percent' | 'times';
type Err = [value: number, why: string] | null | false | undefined;
const near = (a: number, b: number): boolean => Math.abs(a - b) < 1e-6;

/**
 * The answer and the known wrong answers of a typed question from their natural values: whole rupees, a whole
 * number, or a percentage or a number of times to two decimal places. A wrong rupee figure or number is offered only
 * when it is whole and positive; a wrong percentage or ratio is rounded to two decimal places as the student who made
 * the slip would round it. Null when the answer is not exact or fewer than two distinct wrong answers remain.
 */
function typed(unit: Unit, answer: number, errs: Err[]): Pick<NumericParts, 'answer' | 'commonErrors'> | null {
  const whole = unit === 'rupees' || unit === 'number';
  const scale = unit === 'number' ? 1 : 100;
  const stepped = whole ? answer : answer * 100;
  if (!(answer > 0) || !near(stepped, Math.round(stepped))) return null;
  const a = Math.round(answer * scale);
  const seen = new Set([a]);
  const commonErrors: { value: number; why: string }[] = [];
  for (const e of errs) {
    if (!e) continue;
    const [v, why] = e;
    if (!Number.isFinite(v) || v <= 0) continue;
    if (whole && !near(v, Math.round(v))) continue;
    const p = Math.round(v * scale);
    if (p > 0 && Number.isSafeInteger(p) && !seen.has(p)) {
      seen.add(p);
      commonErrors.push({ value: p, why });
    }
  }
  return commonErrors.length >= 2 ? { answer: a, commonErrors } : null;
}


/** The cells a prompt lists, one to a line: "B2 (Sales of April): ₹2,40,000" or "C2: 5", by address. */
function cellsIn(prompt: string): Map<string, number> {
  const out = new Map<string, number>();
  for (const m of prompt.matchAll(/^([A-Z]+\d+)(?: \([^)\n]*\))?: ₹?([\d,]+)%?$/gm)) out.set(m[1], Number(m[2].replace(/,/g, '')));
  return out;
}

/** Every rupee amount of a text, in the order it is printed. */
const amountsIn = (s: string): number[] => (s.match(/₹\d[\d,]*/g) ?? []).map((x) => Number(x.slice(1).replace(/,/g, '')));

const HINTS = {
  overview: ['Ask what the situation shows the system doing better than, or differently from, manual books.', 'Speed, accuracy, reliability, up-to-date information, scalability, legibility, storage and retrieval, documents and reports produced automatically.'],
  structure: ['A computerised accounting system is made of hardware, software, people, procedure and data, and works by input, processing, storage and output.', 'Ask what the item is: a machine, a program, a person, a rule or step, or a fact entered.'],
  packages: ['Ask how large the business is, how special its needs are, and how much it will spend.', 'Generic: off the shelf. Specific: a standard package fitted to particular needs. Tailored: written for one organisation.'],
  cells: ['A cell is named by its column letter and then its row number.', 'A formula starts with "=" and works on the values in the cells it names.'],
  copy: ['Count how many columns and how many rows the copy moves.', 'A relative reference moves by that much; a $ fixes the column letter or the row number it stands before.'],
  depreciation: ['Write down the cost, the salvage value and the life first.', 'Straight line: (cost - salvage value) ÷ life every year. Written down value: the rate on the book value at the start of each year.'],
  loan: ['Interest for a period is charged on the balance of the loan at its start.', 'Principal repaid = instalment - interest; the balance falls by the principal repaid. Round each figure to the nearest rupee as you go; the last instalment repays the whole balance left, with its interest.'],
  pmt: ['PMT takes three things, in this order: the rate for one period, the number of periods, and the loan.', 'For monthly instalments divide the yearly rate by 12 and multiply the years by 12. The loan is entered with a minus sign so that the instalment comes out positive; ROUND(..., 0) gives the nearest rupee.'],
  payroll: ['Write the rule in words first: what is paid, worked out on what, and when.', "Fix with $ every rate cell a copied formula must keep; leave the employee's own cells (B2, C2) relative, so that they move down a row with each copy. In IF the value if true comes before the value if false."],
  brs: ['Starting from the cash book balance, ask what the bank has done that the cash book has not, and the other way round.', 'Cheques issued but not yet presented are added; cheques deposited but not yet credited are deducted.'],
  ratios: ['Write the ratio as a formula of the cells before you work it out.', 'Brackets decide what is worked out first: division and multiplication come before addition and subtraction.'],
  charts: ['Ask what the chart has to show: a trend, a share of a whole, a comparison, or a relationship.', 'Line: change over time. Pie: parts of one whole. Column or bar: categories side by side. Scatter: two measures against each other.'],
  codes: ['Read the scheme digit by digit: head, then group, then the serial number of the ledger.', 'Serial numbers run from 01 in the order the ledgers of the group were opened.'],
  codeKinds: ['Ask what the code is built from: numbers one after another, a range of numbers kept for each class of account, or letters that remind the user of the account.', 'Sequential: 1001, 1002, 1003. Block: 100-199 assets, 200-299 liabilities. Mnemonic: SD for Sundry Debtors. A code is shorter than the name, names one account only, and places it in its group.'],
  functions: ['Say in words what the job needs: a total, an average, the largest or smallest figure, a count, one of two values, a rounded figure, depreciation, or an instalment of a loan.', 'SUM, AVERAGE, MAX, MIN, COUNT, IF, ROUND; SLN and DB for depreciation; PMT for the instalment, and IPMT and PPMT for its interest and principal parts.'],
  groups: ['Ask what the ledger is: an asset, a liability, capital, an income or an expense, and of which kind.', 'Direct expenses and incomes go to the trading account; indirect ones to the profit and loss account.'],
  vouchers: ['Ask whether cash or bank is involved, and in which direction.', 'Receipt: money in. Payment: money out. Contra: between cash and bank. Journal: no cash or bank.'],
  validation: ['Ask which rule, applied as the data is typed in, would refuse this entry.', 'Validation checks data against rules as it is entered; verification checks it against the source document.'],
  security: ['Ask what the feature protects against: an outsider, a user going beyond a role, a change made in secret, or a loss of data.', 'Password, user access rights, audit trail, back-up, data vault (encryption).'],
  entries: ['Ask which account the adjustment or the closing touches, and on which side.', 'A journal voucher records an entry with no cash or bank in it: adjustments, closing and opening entries.'],
};

// ===============================================================================================================
// Overview: features, limitations, structure, packages
// ===============================================================================================================

interface Feature {
  name: string;
  about: string;
  scenes: ((firm: string) => string)[];
  /** Features too close to this one to be offered beside it. */
  near: string[];
}

const FEATURES: Feature[] = [
  {
    name: 'Speed', about: 'how quickly the work is done',
    scenes: [
      (f) => `At ${f}, the accountant saves the last of the month's 600 vouchers at 5 p.m., and the ledgers, the trial balance and the profit and loss account are ready a moment later; the manual books used to take a week to reach this point.`,
      (f) => `${f} used to take three days to send its customers their month-end statements of account; with its computerised system they are ready within minutes of the last entry.`,
    ],
    // The statements and reports of its scenes are also produced from one entry, automatically: not offered beside it.
    near: ['Up-to-date information', 'Reliability', 'Automated document production', 'Efficiency'],
  },
  {
    name: 'Accuracy', about: 'figures free of slips in posting, adding and balancing',
    scenes: [
      (f) => `In the computerised books of ${f}, the system itself posts the debit of every voucher to one account and the credit to the other and works out every total, so no slip in posting or adding can creep in.`,
      (f) => `Since ${f} began to keep its books on a computer, no balance has been carried forward wrongly and no column has been added up wrongly.`,
    ],
    near: ['Reliability', 'Speed'],
  },
  {
    name: 'Reliability', about: 'the same careful working every time, without fatigue',
    scenes: [
      (f) => `On the busiest day of the year, the system of ${f} handles the 900th voucher exactly as it handled the first: it does not tire or lose concentration as a person might.`,
    ],
    near: ['Accuracy', 'Speed'],
  },
  {
    name: 'Up-to-date information', about: 'balances that include every entry the moment it is saved',
    scenes: [
      (f) => `The owner of ${f} opens the account of a customer at 11 a.m. and finds in it the credit sale made to that customer at 10:55 a.m.`,
      (f) => `The cash balance shown by the system of ${f} always includes the payment saved a minute ago; nobody waits for the books to be written up at the end of the day.`,
    ],
    near: ['Speed'],
  },
  {
    name: 'Scalability', about: 'coping with many more transactions without changing the system',
    scenes: [
      (f) => `${f} opened three new branches and its vouchers grew from 2,000 to 15,000 a month; the same system copes with one more data-entry operator and no change in how the work is done.`,
    ],
    near: ['Speed'],
  },
  {
    name: 'Legibility', about: 'records that are clean and easy to read',
    scenes: [(f) => `The auditor of ${f} never meets an overwritten figure or a smudged entry: every ledger printed from the system is clean and easy to read.`],
    near: ['Automated document production'],
  },
  {
    name: 'Storage and retrieval', about: 'keeping years of data in little space and finding any item quickly',
    scenes: [(f) => `${f} keeps the vouchers and ledgers of the last eight years on one storage device and finds any voucher in seconds by its number, date or party.`],
    near: [],
  },
  {
    name: 'Automated document production', about: 'invoices, statements and reports printed in a standard layout from the data entered',
    scenes: [(f) => `The invoices of ${f}, its trial balance and its balance sheet are printed straight from the data that has been entered, each in a fixed standard layout.`],
    near: ['Legibility', 'MIS reports'],
  },
  {
    name: 'MIS reports', about: 'reports that help managers decide, drawn from the same data',
    scenes: [(f) => `Every Monday the sales manager of ${f} receives a report of last week's sales by region and by product, drawn from the same entries that make the books.`],
    near: ['Automated document production'],
  },
  {
    name: 'Real-time user interface', about: 'many users working on the same data at once, each seeing it as it stands',
    scenes: [(f) => `The sales office of ${f} in Pune and its warehouse in Nashik work on the same books at the same time: an invoice saved in Pune is seen at once by the storekeeper in Nashik.`],
    near: ['Up-to-date information', 'Speed'],
  },
  {
    name: 'Efficiency', about: 'better use of the time and resources of the business',
    scenes: [(f) => `Since ${f} moved its books to a computer, the same two clerks who once spent the whole month writing up ledgers now also follow up customers who are late in paying.`],
    near: ['Speed', 'Scalability'],
  },
];

/** Every scene of a feature, written for every firm: what verify finds an option among. */
const sceneTexts = (scenes: ((firm: string) => string)[]): Set<string> => new Set(FIRMS.flatMap((f) => scenes.map((s) => s(f))));
const FEATURE_SCENES = new Map(FEATURES.map((f) => [f.name, sceneTexts(f.scenes)]));

const casFeature = mcqTemplate({
  id: 'cas-feature', topicId: T, conceptId: 'cas-overview', difficulty: 'easy', version: 2,
  generate: (rng) => {
    const right = rng.pick(FEATURES);
    const others = rng.shuffle(FEATURES.filter((f) => f !== right && !right.near.includes(f.name) && !f.near.includes(right.name)));
    const firm = rng.pick(FIRMS);
    if (rng.int(0, 2) < 2) {
      return choice(
        `${rng.pick(right.scenes)(firm)} Which feature of a computerised accounting system does this show?`,
        right.name,
        others.slice(0, 4).map((o) => [o.name, `Chose ${lower(o.name)}, which is about ${o.about}; the situation is about ${right.about}.`]),
        `${right.name} is ${right.about}, which is what the situation describes.`,
        HINTS.overview,
      );
    }
    return choice(
      `Which of these situations shows ${lower(right.name)} in a computerised accounting system?`,
      rng.pick(right.scenes)(firm),
      others.slice(0, 4).map((o) => [rng.pick(o.scenes)(firm), `This shows ${lower(o.name)} (${o.about}), not ${lower(right.name)}.`]),
      `${right.name} is ${right.about}.`,
      HINTS.overview,
    );
  },
  verify: (q) => {
    const right = optionText(q);
    const named = FEATURES.find((f) => q.prompt.startsWith(`Which of these situations shows ${lower(f.name)} `));
    if (named) return FEATURE_SCENES.get(named.name)!.has(right);
    const feature = FEATURES.find((f) => f.name === right);
    return feature !== undefined && [...FEATURE_SCENES.get(feature.name)!].some((s) => q.prompt.startsWith(s));
  },
});

interface Limitation {
  name: string;
  about: string;
  scene: (firm: string) => string;
}

const LIMITATIONS: Limitation[] = [
  { name: 'Cost of training', about: 'the money and time spent teaching the staff to use the system', scene: (f) => `${f} had to pay for a two-week course for its accounts staff before they could use the new package.` },
  { name: 'Staff opposition', about: 'employees resisting the change, often for fear of losing their jobs', scene: (f) => `Some clerks of ${f} refused to learn the new system, fearing that it would make their jobs unnecessary.` },
  { name: 'Disruption', about: 'work slowing down while the change is being made', scene: (f) => `For the first month after the change, the work of the accounts office of ${f} slowed down while the old records were being moved into the system.` },
  { name: 'System failure', about: 'work stopping, or data being lost, when the hardware or software fails', scene: (f) => `A crash of the hard disk stopped all accounting at ${f} for two days.` },
  { name: 'Inability to check unanticipated errors', about: 'a mistake the system was never told to look for passing unnoticed', scene: (f) => `A clerk of ${f} recorded a payment of rent in the account of salaries; the system accepted it, since the voucher balanced and both accounts exist.` },
  { name: 'Breaches of security', about: 'data being read or altered by people who should not have access to it', scene: (f) => `An outsider who guessed the password of the accountant of ${f} changed the balances of some customers' accounts.` },
  { name: 'Ill effects on health', about: 'strain on the eyes, the back and the wrists from long hours at a screen', scene: (f) => `The data-entry operators of ${f} complain of tired eyes and backache after long hours at the computer.` },
];

const ADVANTAGES = FEATURES.filter((f) => ['Speed', 'Accuracy', 'Scalability', 'Storage and retrieval', 'Legibility', 'Up-to-date information'].includes(f.name));

const casLimitation = mcqTemplate({
  id: 'cas-limitation', topicId: T, conceptId: 'cas-overview', difficulty: 'medium',
  generate: (rng) => {
    const form = rng.int(0, 2);
    const firm = rng.pick(FIRMS);
    if (form === 0) {
      const right = rng.pick(LIMITATIONS);
      return choice(
        `${right.scene(firm)} Which limitation of a computerised accounting system does this show?`,
        right.name,
        rng.shuffle(LIMITATIONS.filter((l) => l !== right)).slice(0, 4).map((o) => [o.name, `Chose ${lower(o.name)}, which is ${o.about}; the situation is about ${right.about}.`]),
        `${right.name}: ${right.about}.`,
        HINTS.overview,
      );
    }
    if (form === 1) {
      const right = rng.pick(LIMITATIONS);
      return choice(
        'Which of these is a limitation of a computerised accounting system?',
        right.name,
        rng.shuffle(ADVANTAGES).slice(0, 4).map((a) => [a.name, `${a.name} is an advantage of a computerised system (${a.about}), not a limitation.`]),
        `${right.name} is a limitation: ${right.about}.`,
        HINTS.overview,
      );
    }
    const right = rng.pick(ADVANTAGES);
    return choice(
      'Which of these is NOT a limitation of a computerised accounting system?',
      right.name,
      rng.shuffle(LIMITATIONS).slice(0, 4).map((l) => [l.name, `${l.name} is a real limitation: ${l.about}.`]),
      `${right.name} is an advantage of the system: ${right.about}.`,
      HINTS.overview,
    );
  },
  verify: (q) => {
    const right = optionText(q);
    const isLimit = LIMITATIONS.some((l) => l.name === right);
    if (q.prompt.startsWith('Which of these is NOT')) return ADVANTAGES.some((a) => a.name === right);
    if (q.prompt.startsWith('Which of these is a limitation')) return isLimit;
    const l = LIMITATIONS.find((x) => x.name === right);
    return l !== undefined && FIRMS.some((f) => q.prompt.startsWith(l.scene(f)));
  },
});

interface Part {
  name: string;
  about: string;
  items: string[];
}

const COMPONENTS: Part[] = [
  { name: 'Hardware', about: 'the machines: computers, printers, servers and the network', items: ['the printer on which the balance sheet is printed', 'the server on which the company data is stored', 'the keyboard and screen of the data-entry operator'] },
  { name: 'Software', about: 'the programs: the operating system and the accounting package', items: ['the accounting package that posts the vouchers and prepares the reports', 'the operating system on which the accounting package runs'] },
  { name: 'People', about: 'those who run and use the system: accountants, operators and the managers who read its reports', items: ['the accountant who enters and checks the vouchers', 'the manager who reads the reports to take decisions'] },
  { name: 'Procedure', about: 'the rules and steps laid down for using the system', items: ['the rule that every payment voucher above ₹50,000 is approved by the finance manager before it is saved', 'the steps laid down for taking a back-up of the data at the end of each day'] },
  { name: 'Data', about: 'the facts entered and kept: vouchers, ledger names, amounts and dates', items: ['the dates, amounts and ledger names typed in from the vouchers', 'the list of customers with their opening balances'] },
];

const STAGES: Part[] = [
  { name: 'Input', about: 'getting the data into the system', items: ['keying in the details of a sales invoice', 'entering the opening balances of the ledger accounts'] },
  { name: 'Processing', about: 'what the system does with the data: posting, totalling, balancing and classifying', items: ['posting each saved voucher to its ledger accounts and working out their balances', 'arranging the balances of the ledger accounts into a trial balance'] },
  { name: 'Storage', about: 'keeping the data so that it can be used again later', items: ['keeping the vouchers of past years on the disk so that they can be opened again'] },
  { name: 'Output', about: 'what the system gives out: reports on the screen or on paper', items: ['the balance sheet shown on the screen and printed for the bank', 'the list of amounts due from customers printed for the sales team'] },
];

const casStructure = mcqTemplate({
  id: 'cas-structure', topicId: T, conceptId: 'cas-structure', difficulty: 'easy',
  generate: (rng) => {
    const firm = rng.pick(FIRMS);
    const components = rng.int(0, 1) === 0;
    const list = components ? COMPONENTS : STAGES;
    const right = rng.pick(list);
    const item = rng.pick(right.items);
    return choice(
      components
        ? `In the computerised accounting system of ${firm}, to which component of the system does this belong: ${item}?`
        : `In the working of the computerised accounting system of ${firm}, which stage is this: ${item}?`,
      right.name,
      list.filter((p) => p !== right).map((o) => [o.name, `Chose ${lower(o.name)}, which is ${o.about}.`]),
      `${right.name} is ${right.about}. ${cap(item)} is part of it.`,
      HINTS.structure,
    );
  },
  verify: (q) => {
    const right = optionText(q);
    const list = q.prompt.includes('which component') ? COMPONENTS : STAGES;
    const part = list.find((p) => p.name === right);
    return part !== undefined && part.items.some((i) => q.prompt.endsWith(`${i}?`));
  },
});

type Pkg = 'generic' | 'specific' | 'tailored';
const PKG_NAME: Record<Pkg, string> = {
  generic: 'Generic (ready-made) software',
  specific: 'Specific (customised) software',
  tailored: 'Tailored (tailor-made) software',
};
/** One trait of each kind under the same heading: cost, users, how it is made, secrecy. Each is true of its own kind only. */
const PKG_TRAITS: Record<Pkg, string>[] = [
  {
    generic: 'It is sold off the shelf and used as it comes.',
    specific: 'It is a standard package altered or added to so that it fits the particular needs of its user.',
    tailored: 'It is written from the start for one organisation alone.',
  },
  {
    generic: 'It costs the least of the three kinds.',
    specific: 'It costs more than a ready-made package but less than one written from the start.',
    tailored: 'It costs the most of the three kinds.',
  },
  {
    generic: 'It is meant for a small business with one or a few users and the usual books.',
    specific: 'It is meant for a business with some needs that a standard package does not meet, which has the package fitted to them.',
    tailored: 'It is meant for a large organisation with many users in several places.',
  },
  {
    generic: 'Any business can buy exactly the same package, so it gives the least secrecy.',
    specific: 'Its secrecy lies between the two others: greater than that of a ready-made package, less than that of one written for a single user.',
    tailored: 'No other business has the same program, so it gives the most secrecy.',
  },
  {
    generic: 'Its users need the least training.',
    specific: 'Its users need some training in the parts added for them.',
    tailored: 'Its users need the most training, since the program is like no other.',
  },
];
const BUSINESSES: Record<Pkg, string[]> = {
  generic: [
    'a small grocery shop with one computer, which needs only the usual books and reports and wants to spend as little as possible',
    'a newly started stationery shop run by its owner, who wants the usual accounts at the lowest cost',
    'a two-person consultancy firm that needs a cash book, ledgers and final accounts and nothing more',
  ],
  specific: [
    'a hotel that uses a standard accounting package but has a room-billing module added to it',
    'a chain of three pharmacies that has a standard package altered to follow the expiry dates of medicines',
    'a school that has a standard accounting package adapted to collect fees class by class and term by term',
  ],
  tailored: [
    'a nationalised bank with thousands of branches that has its accounting software written to its own design',
    'a steel company with plants in four states whose accounting software is written for it alone',
    'an airline that has a firm of programmers build its accounting system to its own requirements',
  ],
};
const PKGS: Pkg[] = ['generic', 'specific', 'tailored'];
const SPREADSHEET_WRONG: Wrong = ['Spreadsheet software', 'A spreadsheet is a general tool for tables of figures; the question is about which kind of accounting package fits.'];

const casPackage = mcqTemplate({
  id: 'cas-package', topicId: T, conceptId: 'cas-structure', difficulty: 'medium',
  generate: (rng) => {
    const kind = rng.pick(PKGS);
    if (rng.int(0, 1) === 0) {
      const business = rng.pick(BUSINESSES[kind]);
      const traits = PKG_TRAITS.map((t) => t[kind]).slice(0, 3).join(' ');
      return choice(
        `Which kind of accounting software suits ${business}?`,
        PKG_NAME[kind],
        [...PKGS.filter((k) => k !== kind).map((k): Wrong => [PKG_NAME[k], `${PKG_NAME[k]} does not fit this business: ${lower(PKG_TRAITS[2][k])}`]), SPREADSHEET_WRONG],
        `${PKG_NAME[kind]}: ${traits}`,
        HINTS.packages,
      );
    }
    const row = rng.pick(PKG_TRAITS);
    return choice(
      `Which kind of accounting software is described here? "${row[kind]}"`,
      PKG_NAME[kind],
      [...PKGS.filter((k) => k !== kind).map((k): Wrong => [PKG_NAME[k], `Of ${lower(PKG_NAME[k])} the statement would read: "${row[k]}"`]), SPREADSHEET_WRONG],
      `${PKG_NAME[kind]}: ${PKG_TRAITS.map((t) => t[kind]).join(' ')}`,
      HINTS.packages,
    );
  },
  verify: (q) => {
    const right = optionText(q);
    const fits = PKGS.find((k) => BUSINESSES[k].some((b) => q.prompt === `Which kind of accounting software suits ${b}?`));
    if (fits) return right === PKG_NAME[fits];
    const kind = PKGS.find((k) => PKG_TRAITS.some((t) => q.prompt.endsWith(`"${t[k]}"`)));
    return kind !== undefined && right === PKG_NAME[kind];
  },
});

// ===============================================================================================================
// The electronic spreadsheet: cells, ranges, formulas and functions
// ===============================================================================================================

const col = (n: number): string => String.fromCharCode(64 + n);
const colNumber = (letters: string): number => letters.charCodeAt(0) - 64;

const casRangeCells = numericTemplate({
  id: 'cas-range-cells', topicId: T, conceptId: 'cas-spreadsheet', difficulty: 'easy', unit: 'number',
  generate: (rng) => {
    const c1 = rng.int(1, 5), r1 = rng.int(2, 9);
    const shape = rng.int(0, 2);
    const w = shape === 0 ? 1 : rng.int(2, 6), h = shape === 1 ? 1 : rng.int(3, 14);
    const range = `${col(c1)}${r1}:${col(c1 + w - 1)}${r1 + h - 1}`;
    const prompt = rng.pick([
      `How many cells are there in the range ${range} of a spreadsheet?`,
      `The formula =SUM(${range}) adds the numbers in a range of cells. How many cells does the range hold?`,
      `A spreadsheet user selects the range ${range} to copy it. How many cells are selected?`,
    ]);
    const parts = typed('number', w * h, [
      w > 1 && h > 1 && [(w - 1) * (h - 1), 'Took the difference of the column letters and of the row numbers: both the first and the last column and row are in the range.'],
      w > 1 && h > 1 && [w + h, 'Added the number of columns to the number of rows instead of multiplying them.'],
      h > 1 && [w * (h - 1), 'Took the difference of the row numbers as the number of rows, leaving out the first row.'],
      w > 1 && [(w - 1) * h, 'Took the difference of the column letters as the number of columns, leaving out the first column.'],
      w > 1 && [(w + 1) * h, 'Counted one column too many.'],
      h > 1 && [w * (h + 1), 'Counted one row too many.'],
    ]);
    if (!parts) return null;
    return {
      prompt,
      ...parts,
      explanation: [
        `The range runs from column ${col(c1)} to column ${col(c1 + w - 1)}: ${w} ${w === 1 ? 'column' : 'columns'}.`,
        `It runs from row ${r1} to row ${r1 + h - 1}: ${h} ${h === 1 ? 'row' : 'rows'}.`,
        `Cells = ${w} × ${h} = ${w * h}.`,
      ],
      hints: HINTS.cells,
    };
  },
  verify: (q) => {
    const m = /([A-Z])(\d+):([A-Z])(\d+)/.exec(q.prompt);
    if (!m) return false;
    return q.answer === (colNumber(m[3]) - colNumber(m[1]) + 1) * (Number(m[4]) - Number(m[2]) + 1);
  },
});

interface FormulaCase {
  formula: string;
  cells: [address: string, label: string, value: number, rupee: boolean][];
  answer: number;
  errs: Err[];
  working: string[];
}

/** What a formula of this file returns, worked out from the cells the prompt lists. */
function evaluate(formula: string, cells: Map<string, number>): number | null {
  const v = (a: string): number => cells.get(a) ?? NaN;
  const range = (from: string, to: string): number[] => {
    const out: number[] = [];
    for (let r = Number(from.slice(1)); r <= Number(to.slice(1)); r++) out.push(v(`${from[0]}${r}`));
    return out;
  };
  let m: RegExpExecArray | null;
  if ((m = /^=([A-Z]\d+)\*([A-Z]\d+)\/100$/.exec(formula))) return (v(m[1]) * v(m[2])) / 100;
  if ((m = /^=SUM\(([A-Z]\d+):([A-Z]\d+)\)-([A-Z]\d+)$/.exec(formula))) return range(m[1], m[2]).reduce((a, b) => a + b, 0) - v(m[3]);
  if ((m = /^=AVERAGE\(([A-Z]\d+):([A-Z]\d+)\)$/.exec(formula))) {
    const xs = range(m[1], m[2]);
    return xs.reduce((a, b) => a + b, 0) / xs.length;
  }
  if ((m = /^=MAX\(([A-Z]\d+):([A-Z]\d+)\)-MIN\(([A-Z]\d+):([A-Z]\d+)\)$/.exec(formula))) return Math.max(...range(m[1], m[2])) - Math.min(...range(m[3], m[4]));
  if ((m = /^=([A-Z]\d+)\*\(1\+([A-Z]\d+)\/100\)$/.exec(formula))) return v(m[1]) * (1 + v(m[2]) / 100);
  if ((m = /^=IF\(([A-Z]\d+)>=(\d+),([A-Z]\d+)\*(\d+)\/100,([A-Z]\d+)\*(\d+)\/100\)$/.exec(formula))) {
    return v(m[1]) >= Number(m[2]) ? (v(m[3]) * Number(m[4])) / 100 : (v(m[5]) * Number(m[6])) / 100;
  }
  if ((m = /^=IF\(([A-Z]\d+)>(\d+),([A-Z]\d+)\*(\d+)\/100,0\)\+([A-Z]\d+)$/.exec(formula))) {
    return (v(m[1]) > Number(m[2]) ? (v(m[3]) * Number(m[4])) / 100 : 0) + v(m[5]);
  }
  return null;
}

const cellLines = (cells: FormulaCase['cells']): string => cells.map(([a, label, value, rupee]) => `${a} (${label}): ${rupee ? inr(value) : grouped(value)}`).join('\n');

const casFormulaResult = numericTemplate({
  id: 'cas-formula-result', topicId: T, conceptId: 'cas-spreadsheet', difficulty: 'easy', unit: 'rupees',
  generate: (rng) => {
    const form = rng.int(0, 4);
    let c: FormulaCase;
    if (form === 0) {
      const sales = amount(rng, 60000, 900000, 10000) / 100, rate = rng.pick([2, 3, 4, 5, 6, 8, 10]);
      const ans = (sales * rate) / 100;
      c = {
        formula: '=B2*C2/100',
        cells: [['B2', 'sales of the month', sales, true], ['C2', 'rate of commission, per cent', rate, false]],
        answer: ans,
        errs: [[sales * rate, 'Left out the division by 100, so the rate was taken as a whole number of times.'], [sales + ans, 'Added the commission to the sales.'], [sales - ans, 'Deducted the commission from the sales.']],
        working: [`=B2*C2/100 multiplies B2 by C2 and divides by 100.`, `${inr(sales)} × ${rate} ÷ 100 = ${inr(ans)}.`],
      };
    } else if (form === 1) {
      const months = Array.from({ length: 4 }, () => amount(rng, 40000, 300000, 5000) / 100);
      const returns = amount(rng, 5000, 40000, 1000) / 100;
      const total = months.reduce((a, b) => a + b, 0);
      c = {
        formula: '=SUM(B2:B5)-B6',
        cells: [
          ...(['April', 'May', 'June', 'July'] as const).map((m, i): FormulaCase['cells'][number] => [`B${i + 2}`, `sales of ${m}`, months[i], true]),
          ['B6', 'sales returns of the four months', returns, true],
        ],
        answer: total - returns,
        errs: [[total + returns, 'Took B6 into the total as well: the minus sign deducts it.'], [total - months[3] - returns, 'Took B2:B5 as three cells and left out B5.'], [total, 'Did not deduct the returns in B6.']],
        working: [`SUM(B2:B5) = ${months.map(inr).join(' + ')} = ${inr(total)}.`, `${inr(total)} - ${inr(returns)} = ${inr(total - returns)}.`],
      };
    } else if (form === 2) {
      const xs = Array.from({ length: 4 }, () => amount(rng, 2000, 20000, 400) / 100);
      const total = xs.reduce((a, b) => a + b, 0);
      if (total % 4 !== 0) return null;
      c = {
        formula: '=AVERAGE(B2:B5)',
        cells: (['first', 'second', 'third', 'fourth'] as const).map((q, i): FormulaCase['cells'][number] => [`B${i + 2}`, `electricity bill of the ${q} quarter`, xs[i], true]),
        answer: total / 4,
        errs: [[total, 'Gave the total; AVERAGE divides it by the number of cells.'], [total / 3, 'Divided by 3, as if B2:B5 held three cells.'], [(xs[0] + xs[3]) / 2, 'Averaged only the first and last cells named.']],
        working: [`AVERAGE adds the numbers in B2:B5 and divides by how many there are.`, `(${xs.map(inr).join(' + ')}) ÷ 4 = ${inr(total)} ÷ 4 = ${inr(total / 4)}.`],
      };
    } else if (form === 3) {
      const xs = rng.shuffle(Array.from({ length: 5 }, () => amount(rng, 5000, 90000, 500) / 100));
      if (new Set(xs).size < 5) return null;
      const hi = Math.max(...xs), lo = Math.min(...xs);
      c = {
        formula: '=MAX(B2:B6)-MIN(B2:B6)',
        cells: (['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'] as const).map((d, i): FormulaCase['cells'][number] => [`B${i + 2}`, `cash sales of ${d}`, xs[i], true]),
        answer: hi - lo,
        errs: [[hi, 'Gave the largest figure without deducting the smallest.'], [hi + lo, 'Added the smallest figure instead of deducting it.'], [Math.abs(xs[0] - xs[4]), 'Took the difference of the first and last cells instead of the largest and the smallest.']],
        working: [`MAX(B2:B6) = ${inr(hi)}; MIN(B2:B6) = ${inr(lo)}.`, `${inr(hi)} - ${inr(lo)} = ${inr(hi - lo)}.`],
      };
    } else {
      const rent = amount(rng, 60000, 480000, 10000) / 100, rise = rng.pick([5, 10, 12, 15, 20]);
      const ans = rent * (1 + rise / 100);
      c = {
        formula: '=B2*(1+C2/100)',
        cells: [['B2', 'yearly rent this year', rent, true], ['C2', 'increase in rent, per cent', rise, false]],
        answer: ans,
        errs: [[(rent * rise) / 100, 'Gave only the increase; the formula adds it to the rent.'], [rent * (1 + rise), 'Left out the division by 100.'], [rent + rise, 'Added the rate to the rent as if it were rupees.']],
        working: [`=B2*(1+C2/100) is the rent with the increase added.`, `${inr(rent)} × (1 + ${rise} ÷ 100) = ${inr(ans)}.`],
      };
    }
    const parts = typed('rupees', c.answer, c.errs);
    if (!parts) return null;
    return {
      prompt: `What does the formula ${c.formula} return? The cells it names hold these figures:\n${cellLines(c.cells)}`,
      ...parts,
      explanation: c.working,
      hints: HINTS.cells,
    };
  },
  verify: (q) => {
    const formula = /formula (=\S+) return/.exec(q.prompt)?.[1];
    const value = formula ? evaluate(formula, cellsIn(q.prompt)) : null;
    return value !== null && rupees(value) === q.answer;
  },
});

const casIfFormula = numericTemplate({
  id: 'cas-if-formula', topicId: T, conceptId: 'cas-spreadsheet', difficulty: 'medium', unit: 'rupees',
  generate: (rng) => {
    if (rng.int(0, 1) === 0) {
      const limit = rng.pick([25000, 50000, 75000, 100000]), hi = rng.pick([8, 10, 12]), lo = rng.pick([2, 4, 5]);
      const where = rng.int(0, 2);
      const order = where === 0 ? limit : where === 1 ? limit + amount(rng, 1000, 40000, 1000) / 100 : limit - amount(rng, 1000, Math.min(20000, limit / 2), 1000) / 100;
      const formula = `=IF(B2>=${limit},B2*${hi}/100,B2*${lo}/100)`;
      const met = order >= limit;
      const ans = (order * (met ? hi : lo)) / 100;
      const other = (order * (met ? lo : hi)) / 100;
      const parts = typed('rupees', ans, [
        [other, order === limit ? `Read >= as "more than": ${inr(order)} is not more than ${inr(limit)}, but it is equal to it, so the condition holds.` : `Read the condition the wrong way: the order ${met ? 'does' : 'does not'} reach ${inr(limit)}.`],
        [order - ans, 'Gave the amount of the order after the discount; the formula gives the discount itself.'],
        [order * (met ? hi : lo), 'Left out the division by 100.'],
      ]);
      if (!parts) return null;
      return {
        prompt: `Cell B2 holds the amount of an order, ${inr(order)}. A discount is worked out in C2 by the formula ${formula}. IF gives its second value when the condition is true and its third when it is false. What discount does C2 show?`,
        ...parts,
        explanation: [`Condition: is ${inr(order)} >= ${inr(limit)}? ${met ? 'Yes' : 'No'}.`, `So C2 = ${inr(order)} × ${met ? hi : lo} ÷ 100 = ${inr(ans)}.`],
        hints: ['Decide first whether the condition is true or false.', 'IF(condition, value if true, value if false); >= means "more than or equal to".'],
      };
    }
    const target = rng.pick([200000, 300000, 400000, 500000]), rate = rng.pick([1, 2, 3, 5]), salary = amount(rng, 15000, 45000, 500) / 100;
    const met = rng.int(0, 2) > 0;
    const sales = met ? target + amount(rng, 10000, 200000, 5000) / 100 : target - amount(rng, 5000, 100000, 5000) / 100;
    const formula = `=IF(B2>${target},B2*${rate}/100,0)+C2`;
    const bonus = met ? (sales * rate) / 100 : 0;
    const parts = typed('rupees', salary + bonus, [
      met ? [salary, 'Took the condition as false: the sales are above the target, so the bonus is paid.'] : [salary + (sales * rate) / 100, 'Took the condition as true: the sales did not go above the target, so no bonus is paid.'],
      met
        ? [bonus, 'Gave only the bonus; the formula adds the salary in C2 to it.']
        : [(sales * rate) / 100, 'Took the condition as true and gave only the bonus, leaving out the salary in C2 that the formula adds.'],
      met && [salary + ((sales - target) * rate) / 100, 'Paid the bonus only on the sales above the target; the formula takes the rate on the whole of B2.'],
      !met && [salary + ((target - sales) * rate) / 100, 'Worked the bonus on the shortfall below the target.'],
    ]);
    if (!parts) return null;
    return {
      prompt: `Cell B2 holds the sales of a salesperson for the month, ${inr(sales)}, and C2 the fixed monthly salary, ${inr(salary)}. D2 holds ${formula}. IF gives its second value when the condition is true and its third when it is false. What does D2 show?`,
      ...parts,
      explanation: [
        `Condition: is ${inr(sales)} > ${inr(target)}? ${met ? 'Yes' : 'No'}.`,
        met ? `Bonus = ${inr(sales)} × ${rate} ÷ 100 = ${inr(bonus)}.` : 'So the IF part gives 0: no bonus.',
        `D2 = ${inr(bonus)} + ${inr(salary)} = ${inr(salary + bonus)}.`,
      ],
      hints: ['Decide first whether the condition is true or false.', 'IF(condition, value if true, value if false), and then add C2.'],
    };
  },
  verify: (q) => {
    const formula = /(=IF\S+?)\. IF gives/.exec(q.prompt)?.[1];
    const amounts = amountsIn(q.prompt);
    if (!formula || amounts.length < 1) return false;
    const cells = new Map([['B2', amounts[0]]]);
    if (amounts.length > 1) cells.set('C2', amounts[1]);
    const value = evaluate(formula, cells);
    return value !== null && rupees(value) === q.answer;
  },
});

interface Fn {
  name: string;
  gives: string;
  tasks: string[];
  near: string[];
}

const FUNCTIONS: Fn[] = [
  { name: 'SUM', gives: 'the total of the numbers in a range', tasks: ['total the twelve monthly sales figures in B2:B13', 'add up the debit column of a trial balance'], near: ['AVERAGE', 'COUNT'] },
  { name: 'AVERAGE', gives: 'the arithmetic mean of the numbers in a range', tasks: ['find the average monthly expense on electricity for the year', 'find the average of the opening and closing inventory for the inventory turnover ratio'], near: ['SUM'] },
  { name: 'MAX', gives: 'the largest number in a range', tasks: ['find the highest sale made on a single day of the month'], near: ['MIN'] },
  { name: 'MIN', gives: 'the smallest number in a range', tasks: ['find the lowest closing cash balance of the week'], near: ['MAX'] },
  { name: 'COUNT', gives: 'how many cells of a range hold numbers', tasks: ['find how many invoices of the month have an amount entered against them'], near: ['SUM'] },
  { name: 'IF', gives: 'one value when a condition is true and another when it is false', tasks: ['pay a salesperson a bonus only when the sales of the month exceed a target', 'charge a late fee only on a bill that is more than 30 days old'], near: [] },
  { name: 'ROUND', gives: 'a number rounded to the number of decimal places asked for', tasks: ['show a ratio worked out by a formula to two decimal places'], near: [] },
  { name: 'SLN', gives: 'the depreciation of one period by the straight line method', tasks: ['work out the equal yearly depreciation of a machine from its cost, salvage value and life'], near: ['DB'] },
  { name: 'DB', gives: 'the depreciation of a given period by the fixed declining balance (written down value) method', tasks: ['work out the depreciation of the third year of a machine charged on its reducing book value'], near: ['SLN'] },
  { name: 'PMT', gives: 'the equal periodic instalment that repays a loan with its interest', tasks: ['find the equal yearly instalment that repays a bank loan with interest in five years'], near: ['IPMT', 'PPMT'] },
  { name: 'IPMT', gives: 'the interest part of a given instalment of a loan', tasks: ['find how much of the second instalment of a loan is interest'], near: ['PMT', 'PPMT'] },
  { name: 'PPMT', gives: 'the principal part of a given instalment of a loan: what it repays of the amount borrowed', tasks: ['find how much of the second instalment of a loan goes to reduce the amount borrowed'], near: ['PMT', 'IPMT'] },
];

const casFunctionChoice = mcqTemplate({
  id: 'cas-function-choice', topicId: T, conceptId: 'cas-spreadsheet', difficulty: 'easy', version: 2,
  generate: (rng) => {
    const right = rng.pick(FUNCTIONS);
    const near = FUNCTIONS.filter((f) => right.near.includes(f.name));
    const rest = rng.shuffle(FUNCTIONS.filter((f) => f !== right && !right.near.includes(f.name)));
    const others = [...near, ...rest].slice(0, 4);
    if (rng.int(0, 2) < 2) {
      return choice(
        `In a spreadsheet, which function would you use to ${rng.pick(right.tasks)}?`,
        right.name,
        others.map((o) => [o.name, `Chose ${o.name}, which gives ${o.gives}.`]),
        `${right.name} gives ${right.gives}.`,
        HINTS.functions,
      );
    }
    return choice(
      `What does the spreadsheet function ${right.name} give?`,
      cap(right.gives),
      others.map((o) => [cap(o.gives), `That is what ${o.name} gives, not ${right.name}.`]),
      `${right.name} gives ${right.gives}.`,
      HINTS.functions,
    );
  },
  verify: (q) => {
    const right = optionText(q);
    const fn = FUNCTIONS.find((f) => q.prompt === `What does the spreadsheet function ${f.name} give?`);
    if (fn) return right === cap(fn.gives);
    const named = FUNCTIONS.find((f) => f.name === right);
    return named !== undefined && named.tasks.some((t) => q.prompt.endsWith(`to ${t}?`));
  },
});

// ---- References: relative, absolute and mixed ----

interface Ref {
  col: number;
  row: number;
  absCol: boolean;
  absRow: boolean;
}

const refText = (r: Ref): string => `${r.absCol ? '$' : ''}${col(r.col)}${r.absRow ? '$' : ''}${r.row}`;
/** The reference after a copy that moves `dc` columns and `dr` rows, as the student who makes the slip moves it. */
function moved(r: Ref, dc: number, dr: number, how: 'right' | 'unchanged' | 'all' | 'rows' | 'cols' | 'swapped'): Ref {
  switch (how) {
    case 'unchanged':
      return r;
    case 'all':
      return { ...r, col: r.col + dc, row: r.row + dr };
    case 'rows':
      return { ...r, row: r.absRow ? r.row : r.row + dr };
    case 'cols':
      return { ...r, col: r.absCol ? r.col : r.col + dc };
    case 'swapped':
      return { ...r, col: r.absCol ? r.col : r.col + dr, row: r.absRow ? r.row : r.row + dc };
    default:
      return { ...r, col: r.absCol ? r.col : r.col + dc, row: r.absRow ? r.row : r.row + dr };
  }
}

/** A formula as a list of pieces: text and references. */
type Piece = string | Ref;
const render = (pieces: Piece[], f: (r: Ref) => Ref = (r) => r): string => pieces.map((p) => (typeof p === 'string' ? p : refText(f(p)))).join('');
const rel = (c: number, r: number): Ref => ({ col: c, row: r, absCol: false, absRow: false });
const abs = (c: number, r: number): Ref => ({ col: c, row: r, absCol: true, absRow: true });

/** The reference a copy gives, worked out from the text alone: what verify uses. */
function shiftText(formula: string, dc: number, dr: number): string {
  return formula.replace(/(\$?)([A-Z])(\$?)(\d+)/g, (_, c$: string, c: string, r$: string, r: string) =>
    `${c$}${c$ ? c : String.fromCharCode(c.charCodeAt(0) + dc)}${r$}${r$ ? r : Number(r) + dr}`,
  );
}
const addressOf = (a: string): [number, number] => [colNumber(a[0]), Number(a.slice(1))];

const casCopyFormula = mcqTemplate({
  id: 'cas-copy-formula', topicId: T, conceptId: 'cas-spreadsheet', difficulty: 'medium',
  generate: (rng) => {
    const row = rng.int(2, 5);
    const form = rng.int(0, 3);
    const pieces: Piece[] =
      form === 0 ? ['=', rel(2, row), '*', abs(3, 1)]
        : form === 1 ? ['=', rel(2, row), '*', rel(3, row)]
          : form === 2 ? ['=SUM(', rel(2, row), ':', rel(4, row), ')']
            : ['=', rel(2, row), '-', rel(3, row), '+', abs(6, 1)];
    const at = form === 2 ? 5 : 4;
    const dc = rng.pick([0, 0, 1, 2]), dr = dc === 0 ? rng.int(1, 6) : rng.int(0, 4);
    const from = `${col(at)}${row}`, to = `${col(at + dc)}${row + dr}`;
    const show = (how: Parameters<typeof moved>[3]) => render(pieces, (r) => moved(r, dc, dr, how));
    const hasAbs = pieces.some((p) => typeof p !== 'string' && p.absCol);
    return choice(
      `Cell ${from} of a sheet holds the formula ${render(pieces)}. It is copied to cell ${to}. What formula does ${to} hold?`,
      show('right'),
      [
        [show('unchanged'), 'Thought a formula is copied exactly as it was typed; its relative references move with the copy.'],
        hasAbs ? [show('all'), 'Moved the absolute reference too: the $ signs keep its column and row fixed.'] : null,
        dc !== dr ? [show('swapped'), `Moved the references the wrong way: the copy goes ${dc} ${dc === 1 ? 'column' : 'columns'} across and ${dr} ${dr === 1 ? 'row' : 'rows'} down.`] : null,
        dc > 0 && dr > 0 ? [show('rows'), 'Moved the row numbers but not the column letters.'] : null,
        dc > 0 && dr > 0 ? [show('cols'), 'Moved the column letters but not the row numbers.'] : null,
        [render(pieces, (r) => moved(r, dc, dr + 1, 'right')), 'Counted one row too many in the move.'],
        dc > 0 ? [render(pieces, (r) => moved(r, dc + 1, dr, 'right')), 'Counted one column too many in the move.'] : null,
      ].filter((x): x is Wrong => x !== null),
      `The copy moves ${dc} ${dc === 1 ? 'column' : 'columns'} across and ${dr} ${dr === 1 ? 'row' : 'rows'} down. Each relative reference moves by as much; ${hasAbs ? 'the absolute reference, with $ before its column and its row, stays as it is' : 'there is no $ in the formula, so every reference moves'}. ${to} holds ${show('right')}.`,
      HINTS.copy,
    );
  },
  verify: (q) => {
    const m = /^Cell ([A-Z]\d+) of a sheet holds the formula (\S+)\. It is copied to cell ([A-Z]\d+)\./.exec(q.prompt);
    if (!m) return false;
    const [c1, r1] = addressOf(m[1]), [c2, r2] = addressOf(m[3]);
    return optionText(q) === shiftText(m[2], c2 - c1, r2 - r1);
  },
});

/** A table of interest: amounts down column A from A3, rates along row 2 from B2, and =$A3*B$2/100 in B3. */
const MIXED: Piece[] = ['=', { col: 1, row: 3, absCol: true, absRow: false }, '*', { col: 2, row: 2, absCol: false, absRow: true }, '/100'];

const casMixedReference = mcqTemplate({
  id: 'cas-mixed-reference', topicId: T, conceptId: 'cas-spreadsheet', difficulty: 'complex',
  generate: (rng) => {
    const dc = rng.int(1, 4), dr = rng.int(1, 5);
    const to = `${col(2 + dc)}${3 + dr}`;
    const show = (how: Parameters<typeof moved>[3]) => render(MIXED, (r) => moved(r, dc, dr, how));
    return choice(
      `A sheet works out a year's interest on loans: the amounts of the loans are in A3, A4, A5 and so on, the rates of interest in B2, C2, D2 and so on, and B3 holds =$A3*B$2/100. B3 is copied to ${to}. What formula does ${to} hold?`,
      show('right'),
      [
        [show('unchanged'), 'Thought a formula is copied exactly as it was typed; only the parts fixed by $ stay as they are.'],
        [show('all'), 'Ignored the $ signs and moved every column letter and row number.'],
        [show('rows'), 'Moved only the row numbers: the column letter of B$2 is not fixed, so it moves across.'],
        [show('cols'), 'Moved only the column letters: the row number of $A3 is not fixed, so it moves down.'],
        [render(MIXED, (r) => ({ ...r, col: r.absCol ? r.col + dc : r.col, row: r.absRow ? r.row + dr : r.row })), 'Read each $ the wrong way round, moving exactly the parts it fixes.'],
      ],
      `The copy moves ${dc} ${dc === 1 ? 'column' : 'columns'} across and ${dr} ${dr === 1 ? 'row' : 'rows'} down. In $A3 the column A is fixed and the row moves: $A${3 + dr}. In B$2 the row 2 is fixed and the column moves: ${col(2 + dc)}$2. So ${to} holds ${show('right')}, the amount of its own row at the rate of its own column.`,
      HINTS.copy,
    );
  },
  verify: (q) => {
    const m = /B3 is copied to ([A-Z]\d+)\./.exec(q.prompt);
    if (!m) return false;
    const [c, r] = addressOf(m[1]);
    return optionText(q) === shiftText('=$A3*B$2/100', c - 2, r - 3);
  },
});

const casMixedValue = numericTemplate({
  id: 'cas-mixed-value', topicId: T, conceptId: 'cas-spreadsheet', difficulty: 'complex', unit: 'rupees',
  generate: (rng) => {
    const loans = Array.from({ length: 5 }, () => amount(rng, 50000, 900000, 10000) / 100);
    const rates = rng.shuffle([6, 7, 8, 9, 10, 11, 12]).slice(0, 4);
    if (new Set(loans).size < 5) return null;
    const dc = rng.int(1, 3), dr = rng.int(1, 4);
    const to = `${col(2 + dc)}${3 + dr}`;
    const at = (i: number, j: number) => (loans[i] * rates[j]) / 100;
    const lines = [...loans.map((l, i) => `A${3 + i} (loan): ${inr(l)}`), ...rates.map((r, j) => `${col(2 + j)}2 (rate, per cent): ${r}`)];
    const parts = typed('rupees', at(dr, dc), [
      [at(0, 0), 'Took the value of B3 itself: the copy is a formula, which works on its own row and column.'],
      [at(dr, 0), `Kept the rate of column B: B$2 fixes only the row, so the copy takes the rate in ${col(2 + dc)}2.`],
      [at(0, dc), `Kept the loan of row 3: $A3 fixes only the column, so the copy takes the loan in A${3 + dr}.`],
      [loans[dr] * rates[dc], 'Left out the division by 100.'],
    ]);
    if (!parts) return null;
    return {
      prompt: `A sheet works out a year's interest on loans. B3 holds =$A3*B$2/100 and is copied across and down the table. What does ${to} show?\n${lines.join('\n')}`,
      ...parts,
      explanation: [
        `${to} holds =$A${3 + dr}*${col(2 + dc)}$2/100: the loan of its own row and the rate of its own column.`,
        `${inr(loans[dr])} × ${rates[dc]} ÷ 100 = ${inr(at(dr, dc))}.`,
      ],
      hints: HINTS.copy,
    };
  },
  verify: (q) => {
    const m = /What does ([A-Z])(\d+) show\?/.exec(q.prompt);
    if (!m) return false;
    const cells = cellsIn(q.prompt);
    const loan = cells.get(`A${m[2]}`), rate = cells.get(`${m[1]}2`);
    return loan !== undefined && rate !== undefined && rupees((loan * rate) / 100) === q.answer;
  },
});

// ===============================================================================================================
// Spreadsheet applications: depreciation schedules, a loan repayment schedule, the bank reconciliation statement,
// ratios from the cells of a sheet
// ===============================================================================================================

const gcd = (a: number, b: number): number => (b === 0 ? a : gcd(b, a % b));
const lcm = (a: number, b: number): number => (a / gcd(a, b)) * b;

/**
 * A cost for which a written down value at `rate` per cent gives whole rupees of depreciation (and so of book value)
 * every year up to `years`, and, with `salvageYears`, a whole salvage value after that many years: a multiple of the
 * smallest such figure, in [lo, hi]. Null when none fits.
 */
function exactCost(rng: Rng, rate: number, years: number, lo: number, hi: number, salvageYears = 0): number | null {
  let unit = 1000;
  for (let k = 1; k <= years; k++) {
    const top = (100 - rate) ** (k - 1) * rate, bottom = 100 ** k;
    unit = lcm(unit, bottom / gcd(bottom, top));
  }
  if (salvageYears > 0) {
    const top = (100 - rate) ** salvageYears, bottom = 100 ** salvageYears;
    unit = lcm(unit, bottom / gcd(bottom, top));
  }
  const first = Math.ceil(lo / unit), last = Math.floor(hi / unit);
  return first > last ? null : unit * rng.int(first, last);
}

/** Book value at the start of each year and the depreciation of each year, by the written down value method. */
function wdvYears(cost: number, rate: number, years: number): { start: number; dep: number; end: number }[] {
  const out: { start: number; dep: number; end: number }[] = [];
  let bv = cost;
  for (let k = 1; k <= years; k++) {
    const dep = (bv * rate) / 100;
    out.push({ start: bv, dep, end: bv - dep });
    bv -= dep;
  }
  return out;
}

const SLN_SAYS = 'SLN gives the depreciation of one year by the straight line method: (cost - salvage value) ÷ life';
const ASSETS = ['machine', 'delivery van', 'set of computers', 'generator', 'printing press', 'packing machine'];

const casSln = numericTemplate({
  id: 'cas-sln', topicId: T, conceptId: 'cas-sheet-apps', difficulty: 'easy', unit: 'rupees',
  generate: (rng) => {
    const life = rng.pick([4, 5, 8, 10]), dep = amount(rng, 5000, 90000, 1000) / 100, salvage = amount(rng, 0, 50000, 2000) / 100;
    const cost = dep * life + salvage;
    if (salvage === 0 || salvage > cost / 4) return null;
    const asset = rng.pick(ASSETS);
    const parts = typed('rupees', dep, [
      [cost / life, 'Ignored the salvage value: SLN deducts it from the cost before dividing.'],
      [(cost + salvage) / life, 'Added the salvage value to the cost instead of deducting it.'],
      [cost - salvage, 'Did not divide by the life: that is the total depreciation over the whole life.'],
    ]);
    if (!parts) return null;
    return {
      prompt: `B1 holds the cost of a ${asset}, ${inr(cost)}; B2 its salvage value at the end of its life, ${inr(salvage)}; B3 its useful life, ${life} years. What does =SLN(B1,B2,B3) return? (${SLN_SAYS}.)`,
      ...parts,
      explanation: [`SLN = (cost - salvage value) ÷ life.`, `(${inr(cost)} - ${inr(salvage)}) ÷ ${life} = ${inr(cost - salvage)} ÷ ${life} = ${inr(dep)}.`],
      hints: HINTS.depreciation,
    };
  },
  verify: (q) => {
    const [cost, salvage] = amountsIn(q.prompt);
    const life = Number(/useful life, (\d+) years/.exec(q.prompt)?.[1]);
    return rupees((cost - salvage) / life) === q.answer;
  },
});

const casSlnSchedule = numericTemplate({
  id: 'cas-sln-schedule', topicId: T, conceptId: 'cas-sheet-apps', difficulty: 'medium', unit: 'rupees', version: 2,
  generate: (rng) => {
    const life = rng.pick([5, 6, 8, 10]), dep = amount(rng, 8000, 90000, 1000) / 100, salvage = amount(rng, 4000, 60000, 2000) / 100;
    const cost = dep * life + salvage;
    // A salvage value of at most a quarter of the cost, as an asset worn out over its life leaves.
    if (salvage > cost / 4) return null;
    const k = rng.int(2, life - 1);
    const asset = rng.pick(ASSETS);
    const askBook = rng.int(0, 1) === 0;
    const answer = askBook ? cost - k * dep : k * dep;
    const parts = typed('rupees', answer, askBook
      ? [
        [cost - (k - 1) * dep, `Took the book value at the start of year ${k}, one year's depreciation short.`],
        [cost - (k + 1) * dep, `Deducted the depreciation of ${k + 1} years.`],
        [cost - (k * cost) / life, 'Ignored the salvage value: the yearly depreciation is (cost - salvage value) ÷ life.'],
      ]
      : [
        [(k - 1) * dep, `Added up the depreciation of ${k - 1} years only.`],
        [cost - k * dep, 'Gave the book value instead of the depreciation charged so far.'],
        [(k * cost) / life, 'Ignored the salvage value: the yearly depreciation is (cost - salvage value) ÷ life.'],
      ]);
    if (!parts) return null;
    return {
      prompt: `A depreciation schedule on a sheet: B1 holds the cost of a ${asset}, ${inr(cost)}; B2 its salvage value, ${inr(salvage)}; B3 its life, ${life} years. Column C has the depreciation of each year, =SLN($B$1,$B$2,$B$3), and column D the book value at the end of each year, the book value of the year before less that year's depreciation. (${SLN_SAYS}.) What does the schedule show as ${askBook ? `the book value at the end of year ${k}` : `the total depreciation charged in the first ${k} years`}?`,
      ...parts,
      explanation: [
        `Depreciation of each year = (${inr(cost)} - ${inr(salvage)}) ÷ ${life} = ${inr(dep)}.`,
        `Depreciation of ${k} years = ${k} × ${inr(dep)} = ${inr(k * dep)}.`,
        ...(askBook ? [`Book value at the end of year ${k} = ${inr(cost)} - ${inr(k * dep)} = ${inr(cost - k * dep)}.`] : []),
      ],
      hints: HINTS.depreciation,
    };
  },
  verify: (q) => {
    const [cost, salvage] = amountsIn(q.prompt);
    const life = Number(/its life, (\d+) years/.exec(q.prompt)?.[1]);
    const book = /book value at the end of year (\d+)\?/.exec(q.prompt);
    const total = /first (\d+) years\?/.exec(q.prompt);
    let sum = 0;
    const years = Number((book ?? total)?.[1]);
    for (let y = 1; y <= years; y++) sum += (cost - salvage) / life;
    return rupees(book ? cost - sum : sum) === q.answer;
  },
});

const casWdvSchedule = numericTemplate({
  id: 'cas-wdv-schedule', topicId: T, conceptId: 'cas-sheet-apps', difficulty: 'medium', unit: 'rupees',
  generate: (rng) => {
    const rate = rng.pick([10, 15, 20, 25, 30, 40]), k = rng.int(2, 4);
    const cost = exactCost(rng, rate, k, 100000, 2500000);
    if (cost === null) return null;
    const years = wdvYears(cost, rate, k);
    const y = years[k - 1];
    const asset = rng.pick(ASSETS);
    const parts = typed('rupees', y.dep, [
      [(cost * rate) / 100, 'Charged the rate on the cost every year, as the straight line method does.'],
      [y.start, `Gave the book value at the start of year ${k} without charging the rate on it.`],
      [years[k - 2].dep, `Gave the depreciation of year ${k - 1}.`],
      [y.end, `Gave the book value at the end of year ${k}.`],
    ]);
    if (!parts) return null;
    return {
      prompt: `A sheet sets out the depreciation of a ${asset} bought for ${inr(cost)}, by the written down value method at ${rate}% a year. F1 holds ${rate}%. B3 holds the cost; each year's depreciation in column C is the book value at the start of the year times $F$1, and the next year's book value is that year's book value less its depreciation. What is the depreciation of year ${k}?`,
      ...parts,
      explanation: [
        ...years.slice(0, k).map((x, i) => `Year ${i + 1}: ${inr(x.start)} × ${rate}% = ${inr(x.dep)}; book value at the end ${inr(x.end)}.`),
        `Depreciation of year ${k} = ${inr(y.dep)}.`,
      ],
      hints: HINTS.depreciation,
    };
  },
  verify: (q) => {
    const [cost] = amountsIn(q.prompt);
    const rate = Number(/at (\d+)% a year/.exec(q.prompt)?.[1]);
    const k = Number(/depreciation of year (\d+)\?/.exec(q.prompt)?.[1]);
    // The book value after k - 1 years is the cost times (1 - rate)^(k - 1).
    return rupees((cost * (1 - rate / 100) ** (k - 1) * rate) / 100) === q.answer;
  },
});

/** The rates and lives for which DB's fixed rate comes out exact, with a salvage value of at most half the cost. */
const DB_CASES: [rate: number, life: number][] = [[20, 4], [25, 3], [25, 4], [30, 2], [30, 3], [30, 4], [40, 2], [40, 3], [40, 4], [50, 3], [50, 4]];
const DB_SAYS = 'DB works out a fixed rate, 1 - (salvage value ÷ cost)^(1 ÷ life), rounded to three decimal places, and charges it each period on the book value at the start of that period; its fifth argument, the months of the first year, is left out, so every year is a full year';

function dbCase(rng: Rng): { cost: number; salvage: number; life: number; rate: number } | null {
  const [rate, life] = rng.pick(DB_CASES);
  const cost = exactCost(rng, rate, life, 100000, 3000000, life);
  if (cost === null) return null;
  return { cost, salvage: (cost * (100 - rate) ** life) / 100 ** life, life, rate };
}

const casDb = numericTemplate({
  id: 'cas-db', topicId: T, conceptId: 'cas-sheet-apps', difficulty: 'complex', unit: 'rupees',
  generate: (rng) => {
    const c = dbCase(rng);
    if (!c) return null;
    const k = rng.int(2, c.life);
    const years = wdvYears(c.cost, c.rate, c.life);
    const y = years[k - 1];
    const asset = rng.pick(ASSETS);
    const parts = typed('rupees', y.dep, [
      [(c.cost - c.salvage) / c.life, 'Gave the straight line depreciation, which is what SLN returns.'],
      [(c.cost * c.rate) / 100, 'Charged the rate on the cost: DB charges it on the book value at the start of the period.'],
      [((c.cost - c.salvage) * c.rate * (1 - c.rate / 100) ** (k - 1)) / 100, 'Charged the rate on the cost less the salvage value.'],
      [y.start, `Gave the book value at the start of period ${k}.`],
    ]);
    if (!parts) return null;
    return {
      prompt: `B1 holds the cost of a ${asset}, ${inr(c.cost)}; B2 its salvage value, ${inr(c.salvage)}; B3 its life, ${c.life} years. What does =DB(B1,B2,B3,${k}) return, the depreciation of year ${k}? (${DB_SAYS}.)`,
      ...parts,
      explanation: [
        `Salvage value ÷ cost = ${inr(c.salvage)} ÷ ${inr(c.cost)} = ${Number(((1 - c.rate / 100) ** c.life).toFixed(6))}; its ${c.life === 2 ? 'square' : c.life === 3 ? 'cube' : 'fourth'} root is ${1 - c.rate / 100}, so the rate is 1 - ${1 - c.rate / 100} = ${(c.rate / 100).toFixed(3)}, or ${c.rate}%.`,
        ...years.slice(0, k).map((x, i) => `Year ${i + 1}: ${inr(x.start)} × ${c.rate}% = ${inr(x.dep)}.`),
        `DB for year ${k} = ${inr(y.dep)}.`,
      ],
      hints: HINTS.depreciation,
    };
  },
  verify: (q) => {
    const [cost, salvage] = amountsIn(q.prompt);
    const life = Number(/its life, (\d+) years/.exec(q.prompt)?.[1]);
    const k = Number(/=DB\(B1,B2,B3,(\d+)\)/.exec(q.prompt)?.[1]);
    // The rate as a spreadsheet rounds it, then the book value period by period.
    const rate = Math.round((1 - (salvage / cost) ** (1 / life)) * 1000) / 1000;
    let bv = cost, dep = 0;
    for (let p = 1; p <= k; p++) {
      dep = bv * rate;
      bv -= dep;
    }
    return rupees(dep) === q.answer;
  },
});

const casDbRate = numericTemplate({
  id: 'cas-db-rate', topicId: T, conceptId: 'cas-sheet-apps', difficulty: 'complex', unit: 'percent',
  generate: (rng) => {
    const c = dbCase(rng);
    if (!c) return null;
    const asset = rng.pick(ASSETS);
    const parts = typed('percent', c.rate, [
      [(((c.cost - c.salvage) / c.cost) * 100) / c.life, 'Gave the straight line rate: (cost - salvage value) ÷ cost ÷ life.'],
      [(c.salvage / c.cost) * 100, 'Gave the salvage value as a percentage of the cost.'],
      [((c.cost - c.salvage) / c.cost) * 100, 'Gave the fall in value over the whole life as a percentage of the cost.'],
    ]);
    if (!parts) return null;
    return {
      prompt: `A ${asset} costs ${inr(c.cost)}, has a salvage value of ${inr(c.salvage)} and a life of ${c.life} years. What rate, in per cent, does the spreadsheet function DB charge on it each year? (${DB_SAYS}.)`,
      ...parts,
      explanation: [
        `Salvage value ÷ cost = ${inr(c.salvage)} ÷ ${inr(c.cost)} = ${Number(((1 - c.rate / 100) ** c.life).toFixed(6))}.`,
        `Its ${c.life === 2 ? 'square' : c.life === 3 ? 'cube' : 'fourth'} root is ${1 - c.rate / 100}, since ${1 - c.rate / 100} multiplied by itself ${c.life} times is ${Number(((1 - c.rate / 100) ** c.life).toFixed(6))}.`,
        `Rate = 1 - ${1 - c.rate / 100} = ${(c.rate / 100).toFixed(3)}, that is ${c.rate}%.`,
      ],
      hints: ['DB charges the same rate every year on a falling book value, so that the book value falls exactly to the salvage value.', 'Rate = 1 - (salvage value ÷ cost)^(1 ÷ life).'],
    };
  },
  verify: (q) => {
    const [cost, salvage] = amountsIn(q.prompt);
    const life = Number(/a life of (\d+) years/.exec(q.prompt)?.[1]);
    return Math.round((1 - (salvage / cost) ** (1 / life)) * 1000) * 10 === q.answer;
  },
});

// ---- Loans: the instalment and its interest and principal parts ----

/** Yearly rates a bank or a finance company charges on a business loan, in whole per cent. */
const LOAN_RATES = [8, 9, 10, 11, 12];

/** One year of a loan repayment schedule, in whole rupees. */
interface LoanRow {
  open: number;
  instalment: number;
  interest: number;
  principal: number;
  close: number;
}

interface Loan {
  /** A round loan: a multiple of ₹50,000 from ₹1,00,000 to ₹10,00,000. */
  loan: number;
  /** The yearly rate in per cent, and as a prompt prints it ("10%"). */
  pct: number;
  rate: string;
  years: number;
  /** What =PMT returns, paise and all. */
  pmt: number;
  /** That instalment rounded to the nearest rupee: every instalment but the last. */
  instalment: number;
  /** The schedule as a sheet shows it, every figure rounded to the nearest rupee and the last instalment adjusted. */
  rows: LoanRow[];
}

/** How a schedule of round figures is drawn up: said in every prompt that relies on it. */
const LOAN_ROUNDING = "The instalment =PMT gives is rounded to the nearest rupee, and so is each year's interest; the last instalment is adjusted so that it repays exactly the balance left, with that year's interest";

/**
 * A round loan (a multiple of ₹50,000 from ₹1,00,000 to ₹10,00,000) at a whole-per-cent rate, repaid in `minYears` to
 * `maxYears` yearly instalments, and its schedule in whole rupees: the instalment PMT gives rounded to the nearest
 * rupee, each year's interest (balance at the start × the rate) rounded to the nearest rupee, principal = instalment
 * - interest, and the last instalment the balance left with its interest. Null when a figure would end in exactly 50
 * paise, so that no rounding is ever in doubt.
 */
function makeLoan(rng: Rng, minYears = 3, maxYears = 5, minLoan = 100000): Loan | null {
  const pct = rng.pick(LOAN_RATES), years = rng.int(minYears, maxYears);
  const loan = 50000 * rng.int(minLoan / 50000, 20);
  const r = pct / 100;
  const pmt = (loan * r) / (1 - (1 + r) ** -years);
  if (Math.abs((pmt % 1) - 0.5) < 0.005) return null;
  const instalment = Math.round(pmt);
  const rows: LoanRow[] = [];
  let open = loan;
  for (let k = 1; k <= years; k++) {
    if ((open * pct) % 100 === 50) return null;
    const interest = Math.round((open * pct) / 100);
    const principal = k < years ? instalment - interest : open;
    if (principal <= 0) return null;
    rows.push({ open, instalment: principal + interest, interest, principal, close: open - principal });
    open -= principal;
  }
  return { loan, pct, rate: `${pct}%`, years, pmt, instalment, rows };
}

/**
 * The schedule worked out again as verify does it, in whole paise: each year's interest is the balance × the rate in
 * paise, rounded half up to the rupee; the last year repays the balance left.
 */
function scheduleOf(loan: number, pct: number, instalment: number, years: number): LoanRow[] {
  const out: LoanRow[] = [];
  let open = loan;
  for (let k = 1; k <= years; k++) {
    const paise = open * pct;
    const interest = (paise - (paise % 100)) / 100 + (paise % 100 >= 50 ? 1 : 0);
    const principal = k === years ? open : instalment - interest;
    out.push({ open, instalment: principal + interest, interest, principal, close: open - principal });
    open -= principal;
  }
  return out;
}

/** The instalment PMT gives, found another way: the loan ÷ the present value of 1 a year for n years. */
function pmtOf(loan: number, pct: number, years: number): number {
  let factor = 0;
  for (let k = 1; k <= years; k++) factor += 1 / (1 + pct / 100) ** k;
  return loan / factor;
}

/** A figure that may have paise, as a learner reads it: 131898.74 is "₹1,31,898.74". */
const inrPaise = (n: number): string => formatINR(Math.round(n * 100));
/** A power worked out for a prompt or a working, to six decimal places at most. */
const six = (n: number): number => Number(n.toFixed(6));

/** One year of a schedule in words, with the rounding of the interest and the adjusted last instalment shown. */
function loanRowLine(l: Loan, k: number): string {
  const x = l.rows[k - 1];
  const exact = (x.open * l.pct) / 100;
  const interest = `interest ${inr(x.open)} × ${l.rate} = ${exact === x.interest ? inr(x.interest) : `${inrPaise(exact)}, or ${inr(x.interest)} to the nearest rupee`}`;
  if (k < l.years) return `Year ${k}: ${interest}; principal ${inr(x.instalment)} - ${inr(x.interest)} = ${inr(x.principal)}; balance ${inr(x.open)} - ${inr(x.principal)} = ${inr(x.close)}.`;
  return `Year ${k}, the last: ${interest}; the principal repaid is the whole balance left, ${inr(x.principal)}, so the last instalment is ${inr(x.principal)} + ${inr(x.interest)} = ${inr(x.instalment)}; balance nil.`;
}

/** The working of PMT for a loan, to its rounded figure. */
function pmtLines(l: Loan): string[] {
  const r = l.pct / 100, g = (1 + r) ** l.years;
  return [
    `r = ${l.rate} = ${r}; n = ${l.years}; (1 + r)^n = ${six(g)}.`,
    `Instalment = ${inr(l.loan)} × ${r} × ${six(g)} ÷ ${six(g - 1)} = ${inrPaise(l.pmt)}.`,
    `To the nearest rupee: ${inr(l.instalment)}.`,
  ];
}

const PMT_SAYS = 'PMT gives the equal instalment, paid at the end of each year, that repays the loan with interest: loan × r × (1 + r)^n ÷ ((1 + r)^n - 1), where r is the yearly rate and n the number of instalments. The loan is entered with a minus sign so that the instalment comes out positive';
const LENDERS = ['a bank', 'a finance company', 'a co-operative bank'];
/** The rate a prompt names, in per cent: "10% a year" is 10. */
const pctIn = (s: string): number => Number(/(\d+(?:\.\d+)?)% a year/.exec(s)?.[1]);

const casPmt = numericTemplate({
  id: 'cas-pmt', topicId: T, conceptId: 'cas-sheet-apps', difficulty: 'medium', unit: 'rupees', version: 2,
  generate: (rng) => {
    const l = makeLoan(rng);
    if (!l) return null;
    const r = l.pct / 100;
    const firm = rng.pick(FIRMS);
    const parts = typed('rupees', l.instalment, [
      [Math.round(l.loan / l.years + l.loan * r), 'Divided the loan equally and added a full year of interest on the whole loan.'],
      [Math.round((l.loan * (1 + r) ** l.years) / l.years), 'Added interest for every year on the whole loan and divided the total by the number of instalments.'],
      [Math.round(l.loan / l.years), 'Divided the loan by the number of instalments and left out the interest.'],
      [l.loan * r, "Gave only the first year's interest."],
      Math.trunc(l.pmt) !== l.instalment && [Math.trunc(l.pmt), 'Dropped the paise instead of rounding: a figure of 50 paise or more goes up to the next rupee.'],
    ]);
    if (!parts) return null;
    return {
      prompt: `${firm} borrows ${inr(l.loan)} from ${rng.pick(LENDERS)} at ${l.rate} a year, to be repaid in ${l.years} equal yearly instalments. B1 holds the loan, B2 the rate and B3 the number of instalments. What does =PMT(B2,B3,-B1) return, to the nearest rupee? (${PMT_SAYS}.)`,
      ...parts,
      explanation: [
        ...pmtLines(l),
        `Check: ${l.years} instalments of ${inrPaise(l.pmt)}, each paying the interest on the balance at the start of its year and the rest off the loan, leave nothing.`,
      ],
      hints: ["The instalment is the same every year; each covers that year's interest and repays part of the loan.", 'Instalment = loan × r × (1 + r)^n ÷ ((1 + r)^n - 1). Work it to the paisa, then round to the nearest rupee.'],
    };
  },
  verify: (q) => {
    const [loan] = amountsIn(q.prompt);
    const n = Number(/in (\d+) equal yearly instalments/.exec(q.prompt)?.[1]);
    return rupees(Math.round(pmtOf(loan, pctIn(q.prompt), n))) === q.answer;
  },
});

const casLoanSplit = numericTemplate({
  id: 'cas-loan-split', topicId: T, conceptId: 'cas-sheet-apps', difficulty: 'medium', unit: 'rupees', version: 2,
  generate: (rng) => {
    const l = makeLoan(rng);
    if (!l) return null;
    const k = rng.int(2, l.years);
    const row = l.rows[k - 1], before = l.rows[k - 2];
    const askInterest = rng.int(0, 1) === 0;
    const r = l.pct / 100;
    const parts = typed('rupees', askInterest ? row.interest : row.principal, askInterest
      ? [
        [l.loan * r, 'Charged interest on the whole loan: after each instalment interest is on the balance left.'],
        [row.principal, 'Gave the principal part of the instalment, not its interest.'],
        [before.interest, `Gave the interest of instalment ${k - 1}.`],
        [Math.round((l.loan - ((k - 1) * l.loan) / l.years) * r), 'Took the loan as repaid in equal parts, so that the balance fell by the same amount every year.'],
      ]
      : [
        [l.instalment - l.loan * r, 'Took the interest as if it were on the whole loan every year, so the principal came out as in the first year.'],
        [row.interest, 'Gave the interest part of the instalment, not its principal.'],
        [Math.round(l.loan / l.years), 'Took the loan as repaid in equal parts.'],
        [before.principal, `Gave the principal part of instalment ${k - 1}.`],
        k === l.years && [l.instalment - row.interest, 'Took the last instalment to be the equal one; the last instalment is adjusted, and its principal part is the whole balance left.'],
      ]);
    if (!parts) return null;
    return {
      prompt: `A loan of ${inr(l.loan)} at ${l.rate} a year is repaid in ${l.years} equal yearly instalments of ${inr(l.instalment)}, the figure =PMT gives rounded to the nearest rupee. Its schedule on a sheet charges each year's interest on the balance at the start of the year, rounded to the nearest rupee (IPMT gives the interest part of an instalment in this way), and takes the principal repaid as the instalment less that interest (PPMT gives the principal part); the last instalment is adjusted so that it repays exactly the balance left. What does the schedule show as the ${askInterest ? 'interest' : 'principal'} part of instalment ${k}?`,
      ...parts,
      explanation: [
        ...Array.from({ length: k }, (_, i) => loanRowLine(l, i + 1)),
        `${askInterest ? 'Interest' : 'Principal'} part of instalment ${k} = ${inr(askInterest ? row.interest : row.principal)}.`,
      ],
      hints: HINTS.loan,
    };
  },
  verify: (q) => {
    const [loan, instalment] = amountsIn(q.prompt);
    const n = Number(/in (\d+) equal yearly instalments/.exec(q.prompt)?.[1]);
    const m = /the (interest|principal) part of instalment (\d+)\?$/.exec(q.prompt);
    if (!m) return false;
    const row = scheduleOf(loan, pctIn(q.prompt), instalment, n)[Number(m[2]) - 1];
    return instalment === Math.round(pmtOf(loan, pctIn(q.prompt), n)) && rupees(m[1] === 'interest' ? row.interest : row.principal) === q.answer;
  },
});

const casLoanBalance = numericTemplate({
  id: 'cas-loan-balance', topicId: T, conceptId: 'cas-sheet-apps', difficulty: 'complex', unit: 'rupees', version: 2,
  generate: (rng) => {
    const l = makeLoan(rng);
    if (!l) return null;
    const k = rng.int(1, l.years - 1);
    const row = l.rows[k - 1];
    const r = l.pct / 100;
    const firm = rng.pick(FIRMS);
    const parts = typed('rupees', row.close, [
      [l.loan - k * l.instalment, 'Deducted the whole instalments from the loan; only their principal parts reduce it.'],
      k > 1 && [l.loan - k * l.rows[0].principal, 'Took the principal part of every instalment to be that of the first.'],
      [Math.round(l.loan - (k * l.loan) / l.years), 'Took the loan as repaid in equal parts.'],
      [row.open, `Gave the balance before instalment ${k}.`],
      [Math.round(l.loan * (1 + r) ** k - k * l.instalment), 'Added interest on the whole loan for every year, and deducted the instalments only at the end.'],
    ]);
    if (!parts) return null;
    return {
      prompt: `${firm} repays a loan of ${inr(l.loan)}, taken at ${l.rate} a year, in ${l.years} equal yearly instalments of ${inr(l.instalment)}, the figure =PMT gives rounded to the nearest rupee. Its loan schedule on a sheet charges each year's interest on the balance at the start of the year, rounded to the nearest rupee, and takes the rest of the instalment off the loan. What balance does the schedule show after instalment ${k}?`,
      ...parts,
      explanation: [...Array.from({ length: k }, (_, i) => loanRowLine(l, i + 1)), `Balance after instalment ${k} = ${inr(row.close)}.`],
      hints: HINTS.loan,
    };
  },
  verify: (q) => {
    const [loan, instalment] = amountsIn(q.prompt);
    const pct = pctIn(q.prompt), r = pct / 100;
    const n = Number(/in (\d+) equal yearly instalments/.exec(q.prompt)?.[1]);
    const k = Number(/after instalment (\d+)\?/.exec(q.prompt)?.[1]);
    // Year by year in whole paise, and close to the balance in one step: the loan grown at r for k years less the
    // instalments grown with it (the roundings of k years move it by less than a rupee a year).
    const balance = scheduleOf(loan, pct, instalment, n)[k - 1].close;
    const grown = loan * (1 + r) ** k - instalment * (((1 + r) ** k - 1) / r);
    return rupees(balance) === q.answer && Math.abs(grown - balance) <= k;
  },
});

/** The cells of a payroll sheet, the people it pays and the hints for it. */
const EMPLOYEES = ['Asha', 'Bimal', 'Farida', 'Harpreet', 'Joseph', 'Meena', 'Naveen', 'Rukmini'];

interface Payroll {
  basic: number;
  da: number;
  hra: number;
  limit: number;
  flat: number;
  pf: number;
}

/** DA, HRA, gross, PF and net pay of one row of the payroll sheet. */
function payOf(p: Payroll): { da: number; hra: number; gross: number; pf: number; net: number } {
  const da = (p.basic * p.da) / 100;
  const hra = p.basic >= p.limit ? (p.basic * p.hra) / 100 : p.flat;
  const gross = p.basic + da + hra;
  const pf = ((p.basic + da) * p.pf) / 100;
  return { da, hra, gross, pf, net: gross - pf };
}

/** A payroll row whose every figure is a whole rupee; the basic pay is sometimes exactly the limit of the IF. */
function payroll(rng: Rng): Payroll | null {
  const limit = rng.pick([20000, 25000, 30000]), hra = rng.pick([10, 15, 20]), flat = rng.pick([1500, 2000, 2500, 3000]);
  if (flat >= (limit * hra) / 100) return null;
  const basic = rng.int(0, 3) === 0 ? limit : amount(rng, 12000, 60000, 500) / 100;
  return { basic, da: rng.pick([20, 25, 30, 40, 50]), hra, limit, flat, pf: 12 };
}

const PAYROLL_CELLS = (p: Payroll, name: string): string[] => [
  `B2 (basic pay of ${name}): ${inr(p.basic)}`,
  `F1 (DA rate, as a number of per cent): ${p.da}`,
  `F2 (HRA rate, as a number of per cent): ${p.hra}`,
  `F3 (basic pay from which HRA is that rate): ${inr(p.limit)}`,
  `F4 (HRA paid when the basic pay is lower): ${inr(p.flat)}`,
  `F5 (PF rate, as a number of per cent): ${p.pf}`,
  'C2 (DA): =B2*$F$1/100',
  'D2 (HRA): =IF(B2>=$F$3,B2*$F$2/100,$F$4)',
  'E2 (gross salary): =B2+C2+D2',
  'G2 (PF deducted): =(B2+C2)*$F$5/100',
  'H2 (net salary): =E2-G2',
];

const payrollIn = (prompt: string): Payroll => {
  const c = cellsIn(prompt);
  return { basic: c.get('B2')!, da: c.get('F1')!, hra: c.get('F2')!, limit: c.get('F3')!, flat: c.get('F4')!, pf: c.get('F5')! };
};

const casPayrollIf = numericTemplate({
  id: 'cas-payroll-if', topicId: T, conceptId: 'cas-sheet-apps', difficulty: 'medium', unit: 'rupees',
  generate: (rng) => {
    const p = payroll(rng);
    if (!p) return null;
    const name = rng.pick(EMPLOYEES), firm = rng.pick(FIRMS);
    const pay = payOf(p);
    const other = p.basic >= p.limit ? p.flat : (p.basic * p.hra) / 100;
    const ask = rng.pick(['D2', 'E2', 'H2'] as const);
    const atLimit = p.basic === p.limit;
    const errs: Err[] = ask === 'D2'
      ? [
        [other, `Took the other value of the IF: the basic pay ${p.basic >= p.limit ? 'is' : 'is not'} ${inr(p.limit)} or more.`],
        atLimit && [p.flat, 'Read >= as "more than": a basic pay equal to the limit meets the condition.'],
        [((p.basic + pay.da) * p.hra) / 100, 'Charged the HRA rate on the basic pay and DA together; the formula charges it on B2 alone.'],
      ]
      : ask === 'E2'
        ? [
          [p.basic + pay.da + other, 'Took the other value of the IF for the HRA.'],
          [p.basic + pay.da, 'Left the HRA out of the gross salary.'],
          [pay.net, 'Deducted the PF: that is the net salary, in H2.'],
        ]
        : [
          [pay.gross, 'Did not deduct the PF: that is the gross salary, in E2.'],
          [pay.gross - (p.basic * p.pf) / 100, 'Charged the PF on the basic pay alone; the formula charges it on basic pay and DA.'],
          [pay.gross - (pay.gross * p.pf) / 100, 'Charged the PF on the gross salary, HRA too.'],
          [pay.gross + pay.pf, 'Added the PF instead of deducting it.'],
        ];
    const parts = typed('rupees', ask === 'D2' ? pay.hra : ask === 'E2' ? pay.gross : pay.net, errs);
    if (!parts) return null;
    const what = { D2: 'the HRA', E2: 'the gross salary', H2: 'the net salary' }[ask];
    const hraLine = p.basic >= p.limit
      ? `HRA: ${inr(p.basic)} >= ${inr(p.limit)} is true, so D2 = ${inr(p.basic)} × ${p.hra}% = ${inr(pay.hra)}.`
      : `HRA: ${inr(p.basic)} >= ${inr(p.limit)} is false, so D2 = F4 = ${inr(p.flat)}.`;
    return {
      prompt: `${firm} works out each employee's salary on a payroll sheet, one row for each employee. These are the cells of ${name}'s row and the rate cells. What does ${ask} show, ${what} of ${name}? (IF gives its second value when the condition is true and its third when it is false; >= means "equal to or more than".)\n${PAYROLL_CELLS(p, name).join('\n')}`,
      ...parts,
      explanation: [
        `DA: C2 = ${inr(p.basic)} × ${p.da}% = ${inr(pay.da)}.`,
        hraLine,
        ...(ask === 'D2' ? [] : [`Gross salary: E2 = ${inr(p.basic)} + ${inr(pay.da)} + ${inr(pay.hra)} = ${inr(pay.gross)}.`]),
        ...(ask === 'H2' ? [`PF: G2 = (${inr(p.basic)} + ${inr(pay.da)}) × ${p.pf}% = ${inr(pay.pf)}.`, `Net salary: H2 = ${inr(pay.gross)} - ${inr(pay.pf)} = ${inr(pay.net)}.`] : []),
      ],
      hints: HINTS.payroll,
    };
  },
  verify: (q) => {
    const p = payrollIn(q.prompt);
    const ask = /What does ([DEH]2) show/.exec(q.prompt)?.[1];
    // Worked through the cells in the order the sheet fills them.
    const c2 = p.basic * (p.da / 100);
    const d2 = p.basic < p.limit ? p.flat : p.basic * (p.hra / 100);
    const e2 = p.basic + c2 + d2;
    const h2 = e2 - (p.basic + c2) * (p.pf / 100);
    const value = ask === 'D2' ? d2 : ask === 'E2' ? e2 : ask === 'H2' ? h2 : NaN;
    return near(value, Math.round(value)) && rupees(value) === q.answer;
  },
});

const casPayrollFormula = mcqTemplate({
  id: 'cas-payroll-formula', topicId: T, conceptId: 'cas-sheet-apps', difficulty: 'medium',
  generate: (rng) => {
    const p = payroll(rng);
    if (!p) return null;
    const firm = rng.pick(FIRMS);
    if (rng.int(0, 1) === 0) {
      return choice(
        `On the payroll sheet of ${firm}, column B holds each employee's basic pay, from row 2 down. F2 holds the HRA rate as a number of per cent, ${p.hra}; F3 the basic pay from which HRA is paid at that rate, ${inr(p.limit)}; F4 the HRA paid when the basic pay is lower, ${inr(p.flat)}. Which formula, entered in D2 and copied down the column, gives the HRA of each employee?`,
        '=IF(B2>=$F$3,B2*$F$2/100,$F$4)',
        [
          ['=IF(B2>=F3,B2*F2/100,F4)', 'Left out the $ signs: copied to D3 the formula reads F4, F3 and F5, and every row below picks up the wrong cells.'],
          ['=IF(B2>$F$3,B2*$F$2/100,$F$4)', `Used > for "from": an employee whose basic pay is exactly ${inr(p.limit)} would get only the fixed HRA.`],
          ['=IF(B2>=$F$3,$F$4,B2*$F$2/100)', 'Swapped the two values: IF gives its second value when the condition is true.'],
          ['=IF($B$2>=$F$3,$B$2*$F$2/100,$F$4)', "Fixed B2 as well: every row would show the HRA of the first employee."],
          ['=B2*$F$2/100', 'Left out the condition: an employee below the limit gets the fixed HRA, not the rate.'],
        ],
        'The condition is the basic pay of the row, B2, at or above the limit in F3. If it holds, HRA is B2 × the rate in F2; if not, the fixed figure in F4. The rate cells carry $ so that they stay put when the formula is copied down; B2 has none, so that it becomes B3, B4 and so on.',
        HINTS.payroll,
      );
    }
    return choice(
      `On the payroll sheet of ${firm}, column B holds each employee's basic pay and column C the DA, from row 2 down; F5 holds the PF rate as a number of per cent, ${p.pf}. PF is deducted at that rate on the basic pay and DA together. Which formula, entered in G2 and copied down the column, gives the PF of each employee?`,
      '=(B2+C2)*$F$5/100',
      [
        ['=B2+C2*$F$5/100', 'Left out the brackets: only the DA would be multiplied by the rate.'],
        ['=(B2+C2)*F5/100', 'Left out the $ signs: copied to G3 the formula reads F6, an empty cell.'],
        ['=B2*$F$5/100', 'Charged the PF on the basic pay alone, leaving the DA out.'],
        ['=(B2+C2+D2)*$F$5/100', 'Charged the PF on the HRA too; it is on basic pay and DA only.'],
      ],
      'Basic pay and DA are added first, inside brackets, and the total is multiplied by the rate. The rate cell carries $ so that every copy reads F5; B2 and C2 move down with the copy.',
      HINTS.payroll,
    );
  },
  verify: (q) => {
    const right = optionText(q);
    if (q.prompt.includes('gives the HRA of each employee?')) return right === '=IF(B2>=$F$3,B2*$F$2/100,$F$4)';
    return q.prompt.includes('gives the PF of each employee?') && right === '=(B2+C2)*$F$5/100';
  },
});

/** The three ways the PMT formula is asked for, each with its right formula and the slips beside it. */
const PMT_FORMS: { key: string; ask: (n: number) => string; right: string; wrong: Wrong[]; why: string }[] = [
  {
    key: 'yearly',
    ask: (n) => `repayable in ${n} equal yearly instalments. Which formula gives the yearly instalment, as a positive figure?`,
    right: '=PMT(B2,B3,-B1)',
    wrong: [
      ['=PMT(B2,B3,B1)', 'Left out the minus sign before the loan: PMT then shows the instalment as a negative figure, money paid out against the loan received.'],
      ['=PMT(B3,B2,-B1)', 'Swapped the rate and the number of instalments: PMT takes the rate first.'],
      ['=PMT(B2/12,B3*12,-B1)', 'Worked a monthly instalment; this loan is repaid yearly.'],
      ['=B1/B3', 'Divided the loan by the years, leaving the interest out.'],
      ['=PMT(B2,B3,-B1)*B3', 'Multiplied the instalment by the years: that is the total repaid.'],
    ],
    why: 'PMT takes the rate for one period (B2, a year), the number of periods (B3) and the loan, entered as -B1 so that the instalment comes out positive.',
  },
  {
    key: 'monthly',
    ask: (n) => `repayable in equal monthly instalments over ${n} years. Which formula gives the monthly instalment, as a positive figure?`,
    right: '=PMT(B2/12,B3*12,-B1)',
    wrong: [
      ['=PMT(B2,B3*12,-B1)', 'Charged the yearly rate every month: for a monthly instalment the rate is divided by 12.'],
      ['=PMT(B2/12,B3,-B1)', 'Divided the rate by 12 but left the number of instalments in years: there are B3 × 12 monthly instalments.'],
      ['=PMT(B2/12,B3*12,B1)', 'Left out the minus sign before the loan: the instalment comes out as a negative figure.'],
      ['=PMT(B2,B3,-B1)/12', 'Divided the yearly instalment by 12: monthly instalments repay the loan sooner, so they are less than a twelfth of the yearly one.'],
      ['=B1/(B3*12)', 'Divided the loan by the number of months, leaving the interest out.'],
    ],
    why: 'For monthly instalments every argument is put in months: the rate for one month is B2/12 and the number of instalments B3*12. The loan is entered as -B1 so that the instalment comes out positive.',
  },
  {
    key: 'rounded',
    ask: (n) => `repayable in ${n} equal yearly instalments; its schedule shows every figure to the nearest rupee. Which formula gives the yearly instalment rounded to the nearest rupee, as a positive figure?`,
    right: '=ROUND(PMT(B2,B3,-B1),0)',
    wrong: [
      ['=ROUND(PMT(B2,B3,-B1),2)', 'Rounded to two decimal places, which keeps the paise.'],
      ['=PMT(ROUND(B2,0),B3,-B1)', 'Rounded the rate instead of the instalment.'],
      ['=ROUND(PMT(B2,B3,B1),0)', 'Left out the minus sign before the loan: the instalment comes out as a negative figure.'],
      ['=ROUND(B1/B3,0)', 'Divided the loan by the years, leaving the interest out.'],
    ],
    why: 'PMT(B2,B3,-B1) gives the instalment, positive because the loan is entered with a minus sign; ROUND(..., 0) rounds it to no decimal places, the nearest rupee.',
  },
];

const casPmtFormula = mcqTemplate({
  id: 'cas-pmt-formula', topicId: T, conceptId: 'cas-sheet-apps', difficulty: 'medium',
  generate: (rng) => {
    const f = rng.pick(PMT_FORMS);
    const loan = 50000 * rng.int(2, 20), pct = rng.pick(LOAN_RATES), n = rng.int(3, 5);
    return choice(
      `${rng.pick(FIRMS)} borrows ${inr(loan)} from ${rng.pick(LENDERS)} at ${pct}% a year. On its sheet B1 holds the loan, B2 the yearly rate (${pct}%) and B3 the term in years (${n}). The loan is ${f.ask(n)}`,
      f.right,
      f.wrong,
      f.why,
      HINTS.pmt,
    );
  },
  verify: (q) => {
    const f = PMT_FORMS.find((x) => q.prompt.endsWith(x.ask(Number(/the term in years \((\d+)\)/.exec(q.prompt)?.[1]))));
    return f !== undefined && optionText(q) === f.right;
  },
});

// ---- The bank reconciliation statement on a sheet ----

interface BrsItem {
  label: string;
  /** +1 when the item is added going from the cash book balance to the pass book balance. */
  sign: 1 | -1;
  timing: boolean;
}

const BRS_ITEMS: BrsItem[] = [
  { label: 'cheques issued but not yet presented for payment', sign: 1, timing: true },
  { label: 'cheques deposited but not yet credited by the bank', sign: -1, timing: true },
  { label: 'bank charges debited in the pass book only', sign: -1, timing: false },
  { label: 'interest credited in the pass book only', sign: 1, timing: false },
  { label: 'amount paid into the bank directly by a customer, not yet in the cash book', sign: 1, timing: false },
  { label: 'insurance premium paid by the bank on a standing instruction, not yet in the cash book', sign: -1, timing: false },
];
const BRS_START = { cash: 'balance as per cash book, a debit balance', pass: 'balance as per pass book, a credit balance' };

interface BrsSheet {
  fromCash: boolean;
  start: number;
  items: { item: BrsItem; value: number }[];
  answer: number;
}

function brsSheet(rng: Rng): BrsSheet | null {
  const fromCash = rng.int(0, 2) > 0;
  const extra = rng.shuffle(BRS_ITEMS.filter((i) => !i.timing)).slice(0, rng.int(1, 3));
  const items = [...BRS_ITEMS.filter((i) => i.timing), ...extra].map((item) => ({ item, value: amount(rng, 500, 40000, 100) / 100 }));
  const start = amount(rng, 20000, 300000, 500) / 100;
  const dir = fromCash ? 1 : -1;
  const answer = start + items.reduce((s, x) => s + dir * x.item.sign * x.value, 0);
  if (answer <= 0) return null;
  return { fromCash, start, items, answer };
}

const brsLines = (s: BrsSheet): string =>
  [`B2 (${s.fromCash ? BRS_START.cash : BRS_START.pass}): ${inr(s.start)}`, ...s.items.map((x, i) => `B${i + 3} (${x.item.label}): ${inr(x.value)}`)].join('\n');
const brsTarget = (s: BrsSheet): string => (s.fromCash ? 'balance as per pass book' : 'balance as per cash book');

/** The pass book or cash book balance worked out from a prompt's cells by reading what each item is. */
function brsFromPrompt(prompt: string): number | null {
  const fromCash = prompt.includes(BRS_START.cash);
  let total = 0;
  for (const m of prompt.matchAll(/^B(\d+) \(([^)]+)\): ₹([\d,]+)$/gm)) {
    const v = Number(m[3].replace(/,/g, ''));
    if (m[1] === '2') {
      total += v;
      continue;
    }
    const item = BRS_ITEMS.find((i) => i.label === m[2]);
    if (!item) return null;
    total += (fromCash ? 1 : -1) * item.sign * v;
  }
  return total;
}

const casBrsSheet = numericTemplate({
  id: 'cas-brs-sheet', topicId: T, conceptId: 'cas-sheet-apps', difficulty: 'medium', unit: 'rupees',
  generate: (rng) => {
    const s = brsSheet(rng);
    if (!s) return null;
    const dir = s.fromCash ? 1 : -1;
    const sum = (f: (x: { item: BrsItem; value: number }) => number) => s.start + s.items.reduce((t, x) => t + f(x), 0);
    const parts = typed('rupees', s.answer, [
      [sum((x) => -dir * x.item.sign * x.value), 'Gave every item the opposite sign, as if starting from the other book.'],
      [sum((x) => (x.item.timing ? -1 : 1) * dir * x.item.sign * x.value), 'Gave the two timing items, the cheques not yet presented and those not yet credited, the wrong signs.'],
      [sum((x) => (x.item.timing ? dir * x.item.sign * x.value : 0)), 'Left out the items that only the bank has recorded.'],
      [sum((x) => x.value), 'Added every item to the starting balance.'],
    ]);
    if (!parts) return null;
    const firm = rng.pick(FIRMS);
    return {
      prompt: `${firm} prepares its bank reconciliation statement on a sheet for 31 March 2026. What ${brsTarget(s)} should the formula in B${s.items.length + 3} work out?\n${brsLines(s)}`,
      ...parts,
      explanation: [
        `Start from the ${s.fromCash ? BRS_START.cash : BRS_START.pass}: ${inr(s.start)}.`,
        ...s.items.map((x) => `${dir * x.item.sign > 0 ? 'Add' : 'Deduct'} ${x.item.label}: ${inr(x.value)}.`),
        `${cap(brsTarget(s))} = ${inr(s.answer)}.`,
      ],
      hints: HINTS.brs,
    };
  },
  verify: (q) => {
    const value = brsFromPrompt(q.prompt);
    return value !== null && rupees(value) === q.answer;
  },
});

const casBrsFormula = mcqTemplate({
  id: 'cas-brs-formula', topicId: T, conceptId: 'cas-sheet-apps', difficulty: 'medium',
  generate: (rng) => {
    const s = brsSheet(rng);
    if (!s) return null;
    const dir = s.fromCash ? 1 : -1;
    const formula = (sign: (x: { item: BrsItem }) => number): string =>
      `=B2${s.items.map((x, i) => `${sign(x) > 0 ? '+' : '-'}B${i + 3}`).join('')}`;
    const right = formula((x) => dir * x.item.sign);
    const last = s.items.length + 2;
    return choice(
      `${rng.pick(FIRMS)} prepares its bank reconciliation statement on a sheet. Which formula in B${last + 1} gives the ${brsTarget(s)}?\n${brsLines(s)}`,
      right,
      [
        [formula((x) => -dir * x.item.sign), 'Gave every item the opposite sign, as if starting from the other book.'],
        [formula((x) => (x.item.timing ? -1 : 1) * dir * x.item.sign), 'Reversed the signs of the two timing items.'],
        [formula((x) => (x.item.timing ? 1 : -1) * dir * x.item.sign), 'Reversed the signs of the items recorded by the bank only.'],
        [`=SUM(B2:B${last})`, 'Added every item, though some of them have to be deducted.'],
      ],
      `From the ${s.fromCash ? BRS_START.cash : BRS_START.pass}: ${s.items.map((x) => `${dir * x.item.sign > 0 ? 'add' : 'deduct'} ${x.item.label}`).join('; ')}. So the formula is ${right}.`,
      HINTS.brs,
    );
  },
  verify: (q) => {
    const fromCash = q.prompt.includes(BRS_START.cash);
    const signs = [...q.prompt.matchAll(/^B(\d+) \(([^)]+)\): ₹/gm)].filter((m) => m[1] !== '2').map((m) => {
      const item = BRS_ITEMS.find((i) => i.label === m[2]);
      return item ? `${(fromCash ? 1 : -1) * item.sign > 0 ? '+' : '-'}B${m[1]}` : '?';
    });
    return optionText(q) === `=B2${signs.join('')}`;
  },
});

// ---- Ratios from the cells of a sheet ----

const casRatioCells = numericTemplate({
  id: 'cas-ratio-cells', topicId: T, conceptId: 'cas-sheet-apps', difficulty: 'easy', unit: 'times', version: 2,
  generate: (rng) => {
    const form = rng.int(0, 2);
    const firm = rng.pick(FIRMS);
    let prompt: string, answer: number, errs: Err[], working: string[];
    if (form === 0) {
      const ratio = rng.pick([125, 150, 175, 200, 225, 250, 275, 300]), cl = amount(rng, 40000, 400000, 4000) / 100;
      const ca = (cl * ratio) / 100;
      prompt = `What does =B2/B3 return, the current ratio of ${firm}? Give it to two decimal places where needed (for 2.5 : 1 type 2.5).\nB2 (current assets): ${inr(ca)}\nB3 (current liabilities): ${inr(cl)}`;
      answer = ratio / 100;
      errs = [[Math.round((cl / ca) * 100) / 100, 'Divided B3 by B2: the ratio is upside down.'], [Math.round(((ca - cl) / cl) * 100) / 100, 'Deducted the current liabilities from the current assets before dividing.']];
      working = ['=B2/B3 divides the current assets by the current liabilities.', `${inr(ca)} ÷ ${inr(cl)} = ${dec(ratio)}.`];
    } else if (form === 1) {
      const quick = rng.pick([75, 80, 100, 120, 125, 150]), cl = amount(rng, 40000, 400000, 4000) / 100, inv = amount(rng, 20000, 300000, 2000) / 100;
      const pre = amount(rng, 2000, 30000, 500) / 100;
      const qa = (cl * quick) / 100, ca = qa + inv + pre;
      prompt = `What does =(B2-B3-B4)/B5 return, the quick ratio of ${firm} (quick assets, the current assets less inventories and prepaid expenses, ÷ current liabilities)? Give it to two decimal places where needed (for 2.5 : 1 type 2.5).\nB2 (current assets): ${inr(ca)}\nB3 (inventories): ${inr(inv)}\nB4 (prepaid expenses): ${inr(pre)}\nB5 (current liabilities): ${inr(cl)}`;
      answer = quick / 100;
      errs = [
        [Math.round((ca / cl) * 100) / 100, 'Left the inventories and the prepaid expenses in: that is the current ratio.'],
        [Math.round(((qa + pre) / cl) * 100) / 100, 'Took out the inventories but left the prepaid expenses in the quick assets.'],
        [Math.round((qa / ca) * 100) / 100, 'Divided by the current assets in B2 instead of the current liabilities in B5.'],
        [Math.round((cl / qa) * 100) / 100, 'Turned the ratio upside down.'],
      ];
      working = ['=(B2-B3-B4)/B5 takes the inventories and the prepaid expenses out of the current assets first, because of the brackets, then divides by the current liabilities.', `(${inr(ca)} - ${inr(inv)} - ${inr(pre)}) ÷ ${inr(cl)} = ${inr(qa)} ÷ ${inr(cl)} = ${dec(quick)}.`];
    } else {
      const ratio = rng.pick([40, 50, 60, 75, 80, 120, 125, 150]), equity = amount(rng, 200000, 2000000, 20000) / 100;
      const reserves = amount(rng, 40000, Math.floor(equity * 0.4 / 1000) * 1000, 4000) / 100;
      const capital = equity - reserves;
      const debt = (equity * ratio) / 100;
      prompt = `What does =B2/(B3+B4) return, the debt to equity ratio of ${firm} Ltd.? Give it to two decimal places where needed (for 2.5 : 1 type 2.5).\nB2 (long-term borrowings): ${inr(debt)}\nB3 (share capital): ${inr(capital)}\nB4 (reserves and surplus): ${inr(reserves)}`;
      answer = ratio / 100;
      errs = [[Math.round((debt / capital) * 100) / 100, 'Left the reserves and surplus out of equity.'], [Math.round((equity / debt) * 100) / 100, 'Turned the ratio upside down.'], [Math.round((debt / reserves) * 100) / 100, 'Divided by the reserves and surplus alone.']];
      working = ['=B2/(B3+B4) adds share capital and reserves first, because of the brackets, then divides the debt by the total.', `${inr(debt)} ÷ (${inr(capital)} + ${inr(reserves)}) = ${inr(debt)} ÷ ${inr(equity)} = ${dec(ratio)}.`];
    }
    const parts = typed('times', answer, errs);
    if (!parts) return null;
    return { prompt, ...parts, explanation: working, hints: HINTS.ratios };
  },
  verify: (q) => {
    const c = cellsIn(q.prompt);
    const v = (a: string) => c.get(a) ?? NaN;
    const formula = /^What does (=\S+) return/.exec(q.prompt)?.[1];
    const value = formula === '=B2/B3' ? v('B2') / v('B3') : formula === '=(B2-B3-B4)/B5' ? (v('B2') - v('B3') - v('B4')) / v('B5') : formula === '=B2/(B3+B4)' ? v('B2') / (v('B3') + v('B4')) : NaN;
    return Math.round(value * 100) === q.answer && near(value * 100, q.answer);
  },
});

interface RatioLayout {
  name: string;
  /** The ratio in words, as the prompt states it: the question is about writing it in a cell, not recalling it. */
  means: string;
  cells: string[];
  right: string;
  wrong: Wrong[];
  explanation: string;
}

const RATIO_LAYOUTS: RatioLayout[] = [
  {
    name: 'inventory turnover ratio',
    means: 'cost of revenue from operations ÷ average inventory, the average being half the sum of the opening and closing inventory',
    cells: ['B2 (cost of revenue from operations)', 'B3 (opening inventory)', 'B4 (closing inventory)'],
    right: '=B2/((B3+B4)/2)',
    wrong: [
      ['=B2/(B3+B4)/2', 'Divided by the sum of the inventories and then halved the result, which gives a quarter of the ratio.'],
      ['=B2/B3+B4/2', 'Left out the brackets: the division is done before the addition.'],
      ['=(B3+B4)/2/B2', 'Turned the ratio upside down.'],
      ['=B2/B4', 'Used the closing inventory alone instead of the average inventory.'],
    ],
    explanation: 'Inventory turnover ratio = cost of revenue from operations ÷ average inventory, and the average needs its own brackets: =B2/((B3+B4)/2).',
  },
  {
    name: 'quick ratio',
    means: 'quick assets ÷ current liabilities, the quick assets being the current assets less inventories and prepaid expenses',
    cells: ['B2 (current assets)', 'B3 (inventories)', 'B4 (prepaid expenses)', 'B5 (current liabilities)'],
    right: '=(B2-B3-B4)/B5',
    wrong: [
      ['=B2-B3-B4/B5', 'Left out the brackets: only the prepaid expenses would be divided.'],
      ['=(B2-B3)/B5', 'Left the prepaid expenses in the quick assets.'],
      ['=B2/B5', 'Left the inventories and prepaid expenses in: that is the current ratio.'],
      ['=B5/(B2-B3-B4)', 'Turned the ratio upside down.'],
    ],
    explanation: 'Quick ratio = (current assets - inventories - prepaid expenses) ÷ current liabilities, with the quick assets in brackets: =(B2-B3-B4)/B5.',
  },
  {
    name: 'gross profit ratio, in per cent',
    means: 'gross profit ÷ revenue from operations × 100, the gross profit being revenue from operations less its cost',
    cells: ['B2 (revenue from operations)', 'B3 (cost of revenue from operations)'],
    right: '=(B2-B3)/B2*100',
    wrong: [
      ['=(B2-B3)/B3*100', 'Worked the gross profit on cost; the ratio is on revenue from operations.'],
      ['=B2-B3/B2*100', 'Left out the brackets: only the cost would be divided.'],
      ['=B3/B2*100', 'Gave the cost of revenue as a percentage of revenue, not the gross profit.'],
    ],
    explanation: 'Gross profit ratio = (revenue from operations - cost of revenue from operations) ÷ revenue from operations × 100: =(B2-B3)/B2*100.',
  },
  {
    name: 'interest coverage ratio',
    means: 'profit before interest and tax ÷ interest on long-term debt',
    cells: ['B2 (net profit after tax)', 'B3 (tax)', 'B4 (interest on long-term debt)'],
    right: '=(B2+B3+B4)/B4',
    wrong: [
      ['=B2/B4', 'Used the profit after tax; the interest is covered by the profit before interest and tax.'],
      ['=(B2+B3)/B4', 'Added back the tax but not the interest.'],
      ['=B2+B3+B4/B4', 'Left out the brackets: only the interest would be divided, by itself.'],
    ],
    explanation: 'Interest coverage ratio = profit before interest and tax ÷ interest on long-term debt. Profit before interest and tax = B2 + B3 + B4, in brackets: =(B2+B3+B4)/B4.',
  },
];

const casRatioFormula = mcqTemplate({
  id: 'cas-ratio-formula', topicId: T, conceptId: 'cas-sheet-apps', difficulty: 'medium',
  generate: (rng) => {
    const l = rng.pick(RATIO_LAYOUTS);
    return choice(
      `A sheet holds these figures of ${rng.pick(FIRMS)}. Which formula gives the ${l.name} (${l.means})?\n${l.cells.join('\n')}`,
      l.right,
      l.wrong,
      l.explanation,
      HINTS.ratios,
    );
  },
  verify: (q) => {
    const l = RATIO_LAYOUTS.find((x) => q.prompt.includes(`gives the ${x.name} (${x.means})?`));
    return l !== undefined && optionText(q) === l.right;
  },
});

// ---- Graphs and charts ----

interface Chart {
  name: string;
  shows: string;
  scenes: string[];
}

const CHARTS: Chart[] = [
  { name: 'Line chart', shows: 'how a figure changes over time', scenes: ['how the sales of the business moved over the last ten years', 'the rise and fall of the closing cash balance month by month over a year'] },
  { name: 'Pie chart', shows: 'the parts of one whole as slices of a circle', scenes: ["the share of each head of expense in one year's total expenses", "how one year's revenue was divided among cost of goods, expenses and profit"] },
  { name: 'Column (bar) chart', shows: 'separate items side by side for comparison', scenes: ['the sales of four branches in the same year, side by side', 'the profit of three products in one year compared with one another'] },
  { name: 'Scatter (XY) chart', shows: 'whether two measures move together', scenes: ['whether the months with more advertisement expense were also the months with more sales'] },
];

const casChart = mcqTemplate({
  id: 'cas-chart', topicId: T, conceptId: 'cas-charts', difficulty: 'easy',
  generate: (rng) => {
    const right = rng.pick(CHARTS);
    const scene = rng.pick(right.scenes);
    return choice(
      `${rng.pick(FIRMS)} wants a chart on its spreadsheet showing ${scene}. Which kind of chart suits this best?`,
      right.name,
      CHARTS.filter((c) => c !== right).map((c) => [c.name, `A ${lower(c.name)} shows ${c.shows}; this calls for ${right.shows}.`]),
      `A ${lower(right.name)} shows ${right.shows}, which is what is wanted here.`,
      HINTS.charts,
    );
  },
  verify: (q) => {
    const c = CHARTS.find((x) => x.name === optionText(q));
    return c !== undefined && c.scenes.some((s) => q.prompt.includes(`showing ${s}.`));
  },
});

const casPieAngle = numericTemplate({
  id: 'cas-pie-angle', topicId: T, conceptId: 'cas-charts', difficulty: 'medium', unit: 'number',
  generate: (rng) => {
    const heads = rng.shuffle(['Salaries', 'Rent', 'Advertisement', 'Electricity', 'Repairs', 'Insurance']).slice(0, rng.int(4, 5));
    // Each slice a multiple of 18 degrees (5% of the whole), all of them adding up to 360.
    const units = heads.map(() => 1);
    for (let left = 20 - heads.length; left > 0; left--) units[rng.int(0, heads.length - 1)]++;
    const per = rng.pick([10000, 15000, 20000, 25000, 40000]);
    const values = units.map((u) => u * per);
    const total = values.reduce((a, b) => a + b, 0);
    const i = rng.int(0, heads.length - 1);
    const degrees = (values[i] / total) * 360;
    const largest = Math.max(...values);
    const parts = typed('number', degrees, [
      [(values[i] / total) * 100, 'Gave the share as a percentage of the total, not in degrees.'],
      [(values[i] / total) * 180, 'Measured the share against half a circle, 180°.'],
      values[i] < largest && [(values[i] / largest) * 360, 'Compared the item with the largest item instead of with the total.'],
    ]);
    if (!parts) return null;
    return {
      prompt: `A pie chart of the expenses of ${rng.pick(FIRMS)} for the year is drawn from these figures. What angle, in degrees, does the slice for ${heads[i]} make at the centre?\n${heads.map((h, j) => `${h}: ${inr(values[j])}`).join('\n')}`,
      ...parts,
      explanation: [`Total expenses = ${inr(total)}.`, `Angle = ${inr(values[i])} ÷ ${inr(total)} × 360° = ${degrees}°.`],
      hints: ['The whole circle, 360°, stands for the total.', 'Angle of a slice = item ÷ total × 360.'],
    };
  },
  verify: (q) => {
    const head = /slice for (.+?) make/.exec(q.prompt)?.[1];
    const lines = [...q.prompt.matchAll(/^(.+): ₹([\d,]+)$/gm)].map((m) => [m[1], Number(m[2].replace(/,/g, ''))] as const);
    const total = lines.reduce((s, [, v]) => s + v, 0);
    const mine = lines.find(([h]) => h === head)?.[1];
    return mine !== undefined && near((mine * 360) / total, q.answer);
  },
});

// ===============================================================================================================
// Using a computerised accounting system: installation, codification and the hierarchy of account heads
// ===============================================================================================================

interface CodeGroup {
  name: string;
  ledgers: string[];
}

const CODE_HEADS: { head: string; groups: CodeGroup[] }[] = [
  {
    head: 'Assets',
    groups: [
      { name: 'Fixed assets', ledgers: ['Land and building', 'Machinery', 'Furniture', 'Computers', 'Delivery van', 'Office equipment'] },
      { name: 'Current assets', ledgers: ['Cash in hand', 'Bank', 'Stock', 'Debtors', 'Bills receivable', 'Prepaid insurance'] },
    ],
  },
  {
    head: 'Liabilities',
    groups: [
      { name: 'Long-term liabilities', ledgers: ['Bank loan', 'Loan from a finance company', 'Loan from a relative', 'Mortgage loan'] },
      { name: 'Current liabilities', ledgers: ['Creditors', 'Bills payable', 'Outstanding salaries', 'Outstanding rent', 'GST payable'] },
    ],
  },
  { head: 'Capital', groups: [{ name: "Owner's capital", ledgers: ['Capital', 'Drawings'] }] },
  {
    head: 'Incomes',
    groups: [
      { name: 'Sales', ledgers: ['Sales', 'Sales returns'] },
      { name: 'Other incomes', ledgers: ['Commission received', 'Interest received', 'Rent received', 'Discount received', 'Dividend received'] },
    ],
  },
  {
    head: 'Expenses',
    groups: [
      { name: 'Direct expenses', ledgers: ['Wages', 'Carriage inwards', 'Power and fuel', 'Factory rent'] },
      { name: 'Indirect expenses', ledgers: ['Salaries', 'Office rent', 'Electricity', 'Advertisement', 'Printing and stationery', 'Telephone'] },
    ],
  },
];
const HEAD_ORDERS: string[][] = [
  ['Assets', 'Liabilities', 'Capital', 'Incomes', 'Expenses'],
  ['Capital', 'Liabilities', 'Assets', 'Incomes', 'Expenses'],
  ['Assets', 'Capital', 'Liabilities', 'Expenses', 'Incomes'],
];

interface CodeScheme {
  firm: string;
  /** Head name to its digit. */
  heads: Map<string, number>;
  /** Group name to its two digits, and the head it is under. */
  groups: Map<string, { code: number; head: string; groupDigit: number }>;
  /** The groups whose ledgers the prompt lists, each with its ledgers in the order they were opened. */
  shown: { group: string; ledgers: string[] }[];
}

function codeScheme(rng: Rng, siblings: boolean): CodeScheme | null {
  const order = rng.pick(HEAD_ORDERS);
  const heads = new Map(order.map((h, i) => [h, i + 1]));
  const groups = new Map<string, { code: number; head: string; groupDigit: number }>();
  for (const h of CODE_HEADS) h.groups.forEach((g, j) => groups.set(g.name, { code: heads.get(h.head)! * 10 + j + 1, head: h.head, groupDigit: j + 1 }));
  const head = rng.pick(CODE_HEADS.filter((h) => h.groups.length > 1));
  const pick = (g: CodeGroup) => ({ group: g.name, ledgers: rng.shuffle(g.ledgers).slice(0, rng.int(4, Math.min(6, g.ledgers.length))) });
  const main = rng.pick(head.groups.filter((g) => g.ledgers.length >= 4));
  if (!main) return null;
  const shown = [pick(main)];
  if (siblings) {
    const other = head.groups.find((g) => g !== main && g.ledgers.length >= 4);
    if (!other) return null;
    shown.push(pick(other));
  }
  return { firm: rng.pick(FIRMS), heads, groups, shown };
}

const SCHEME_RULE = 'four-digit code: the first digit for the major head, the second for the group within the head, and the last two for the serial number of the ledger in its group, from 01 in the order the ledgers of the group were opened';

const schemeLines = (s: CodeScheme): string[] => [
  `Major heads: ${[...s.heads].sort((a, b) => a[1] - b[1]).map(([h, d]) => `${d} ${h}`).join(', ')}`,
  `Groups: ${[...s.groups].sort((a, b) => a[1].code - b[1].code).map(([g, x]) => `${x.code} ${g}`).join(', ')}`,
  ...s.shown.map((x) => `Ledgers of ${x.group} (group ${s.groups.get(x.group)!.code}), in the order opened: ${x.ledgers.join(', ')}`),
];

/** The code of a ledger read from a prompt's own scheme: what verify works the answer out from. */
function codeFromPrompt(prompt: string, ledger: string): number | null {
  for (const m of prompt.matchAll(/^Ledgers of .+ \(group (\d+)\), in the order opened: (.+)$/gm)) {
    const at = m[2].split(', ').indexOf(ledger);
    if (at >= 0) return Number(m[1]) * 100 + at + 1;
  }
  return null;
}

const casLedgerCode = mcqTemplate({
  id: 'cas-ledger-code', topicId: T, conceptId: 'cas-codification', difficulty: 'medium',
  generate: (rng) => {
    const s = codeScheme(rng, false);
    if (!s) return null;
    const { group, ledgers } = s.shown[0];
    const at = rng.int(1, ledgers.length - 1);
    const g = s.groups.get(group)!;
    const headDigit = s.heads.get(g.head)!;
    const code = g.code * 100 + at + 1;
    const wrong: (Wrong | false)[] = [
      [String(code - 1), 'Numbered the ledgers from 00 instead of 01.'],
      [String(headDigit * 100 + g.groupDigit * 10 + at + 1), 'Wrote the serial number as one digit, dropping its 0: the serial always takes two digits.'],
      g.groupDigit !== headDigit && [String(g.groupDigit * 1000 + headDigit * 100 + at + 1), 'Wrote the group digit before the head digit.'],
      at + 1 < ledgers.length && [String(code + 1), 'Counted one ledger too many in the order of opening.'],
      at + 1 < ledgers.length && [String(g.code * 100 + ledgers.length), 'Gave the code of the last ledger opened in the group.'],
    ];
    return choice(
      [`${s.firm} gives each ledger account a ${SCHEME_RULE}. What is the code of ${ledgers[at]}?`, ...schemeLines(s)].join('\n'),
      String(code),
      wrong.filter((w): w is Wrong => w !== false),
      `${ledgers[at]} is in the group ${group} (code ${g.code}), under the head ${g.head} (${headDigit}). It was the ledger number ${at + 1} opened in the group: serial ${String(at + 1).padStart(2, '0')}. Code = ${g.code} followed by ${String(at + 1).padStart(2, '0')} = ${code}.`,
      HINTS.codes,
    );
  },
  verify: (q) => {
    const ledger = /What is the code of (.+?)\?/.exec(q.prompt)?.[1];
    return ledger !== undefined && codeFromPrompt(q.prompt, ledger) === Number(optionText(q));
  },
});

const casCodeLedger = mcqTemplate({
  id: 'cas-code-ledger', topicId: T, conceptId: 'cas-codification', difficulty: 'medium',
  generate: (rng) => {
    const s = codeScheme(rng, true);
    if (!s) return null;
    const [main, other] = s.shown;
    const at = rng.int(0, Math.min(main.ledgers.length, other.ledgers.length) - 2);
    const g = s.groups.get(main.group)!;
    const code = g.code * 100 + at + 1;
    return choice(
      [`${s.firm} gives each ledger account a ${SCHEME_RULE}. Which ledger account has the code ${code}?`, ...schemeLines(s)].join('\n'),
      main.ledgers[at],
      [
        [main.ledgers[at + 1], `Numbered the ledgers from 00, so took ${String(at + 1).padStart(2, '0')} as the ledger opened after it.`],
        [other.ledgers[at], `Took the group ${s.groups.get(other.group)!.code}, ${other.group}; the first two digits ${g.code} are the group ${main.group}.`],
        [`${main.group} (the group itself)`, 'Gave the group: a four-digit code names one ledger account, and only its first two digits name the group.'],
        [`${g.head} (the major head)`, 'Gave the major head: only the first digit names it; the code goes down to one ledger account.'],
      ],
      `${code}: head ${Math.floor(code / 1000)} is ${g.head}, group ${g.code} is ${main.group}, and serial ${String(at + 1).padStart(2, '0')} is the ledger number ${at + 1} opened in it: ${main.ledgers[at]}.`,
      HINTS.codes,
    );
  },
  verify: (q) => {
    const code = Number(/has the code (\d+)\?/.exec(q.prompt)?.[1]);
    const right = optionText(q);
    return codeFromPrompt(q.prompt, right) === code;
  },
});

const CODE_FACTS: { prompt: string; correct: string; wrong: Wrong[]; explanation: string }[] = [
  {
    prompt: 'Which of these is a mnemonic code?',
    correct: 'SD for Sundry Debtors and SC for Sundry Creditors',
    wrong: [
      ['1001, 1002, 1003 given to vouchers in the order they are made', 'That is a sequential code: numbers given one after another.'],
      ['100 to 199 kept for assets and 200 to 299 for liabilities', 'That is a block code: a range of numbers kept for one class of accounts.'],
      ['Account names arranged in the order of the alphabet', 'Arranging names in alphabetical order gives them no code at all.'],
    ],
    explanation: 'A mnemonic code is made of letters that remind the user of the account: SD for Sundry Debtors.',
  },
  {
    prompt: 'Which of these is a block code?',
    correct: '100 to 199 kept for assets and 200 to 299 for liabilities',
    wrong: [
      ['SD for Sundry Debtors and SC for Sundry Creditors', 'That is a mnemonic code: letters that help the memory.'],
      ['1001, 1002, 1003 given to vouchers in the order they are made', 'That is a sequential code: numbers given one after another, with no ranges kept for classes.'],
      ['Account names arranged in the order of the alphabet', 'Arranging names in alphabetical order gives them no code at all.'],
    ],
    explanation: 'A block code keeps a range of numbers for each class of accounts, with room left in each range for new accounts.',
  },
  {
    prompt: 'Which of these is a sequential code?',
    correct: '1001, 1002, 1003 given to vouchers in the order they are made',
    wrong: [
      ['100 to 199 kept for assets and 200 to 299 for liabilities', 'That is a block code: a range kept for each class of accounts.'],
      ['SD for Sundry Debtors and SC for Sundry Creditors', 'That is a mnemonic code: letters that help the memory.'],
      ['Account names arranged in the order of the alphabet', 'Arranging names in alphabetical order gives them no code at all.'],
    ],
    explanation: 'A sequential code gives numbers one after another, in the order the items arise: the usual coding of vouchers and invoices.',
  },
  {
    prompt: 'What is the main advantage of a mnemonic code?',
    correct: 'It is easy to remember, since its letters stand for the name of the account',
    wrong: [
      ['It leaves room for new accounts within each class', 'That is the advantage of block codes.'],
      ['It shows the order in which documents were made, so a missing one is noticed', 'That is the advantage of sequential codes.'],
      ['It hides the name of the account from outsiders', 'A mnemonic code is meant to bring the name to mind, not to hide it.'],
    ],
    explanation: 'Mnemonic codes use letters that bring the account to mind, so users remember them easily.',
  },
  {
    prompt: 'What is the main advantage of block codes?',
    correct: 'Each class of accounts has its own range of numbers, with room for new accounts in it',
    wrong: [
      ['They are easy to remember, since their letters stand for the account', 'That is the advantage of mnemonic codes.'],
      ['They show the order in which documents were made', 'That is the advantage of sequential codes.'],
      ['They make every voucher balance', 'A voucher balances because its debits equal its credits; the code of an account has nothing to do with it.'],
    ],
    explanation: 'A block code keeps a range for each class of accounts; the range shows the class, and spare numbers take new accounts.',
  },
  {
    prompt: 'Vouchers and invoices are usually numbered by which method of coding?',
    correct: 'Sequential codes',
    wrong: [
      ['Mnemonic codes', 'Mnemonic codes are letters that stand for a name; vouchers have no name to remind the user of.'],
      ['Block codes', 'Block codes keep ranges for classes of accounts; vouchers are simply numbered in turn.'],
      ['No codes at all', 'Vouchers are always numbered, so that a missing or repeated one can be found.'],
    ],
    explanation: 'Vouchers are numbered one after another as they are made, so a gap or a repeat shows at once: sequential coding.',
  },
  {
    prompt: 'Why are the account heads coded in a computerised accounting system?',
    correct: 'So that each account is identified uniquely, entered quickly and grouped automatically in the reports',
    wrong: [
      ['So that the trial balance always agrees', 'The trial balance agrees because every voucher balances, not because accounts are coded.'],
      ['So that no password is needed', 'Codes identify accounts; they do nothing for security.'],
      ['So that the vouchers need not be kept', 'The source documents must be kept whatever the coding.'],
    ],
    explanation: 'A code names one account and nothing else, is quicker to key in than a name, and its digits place the account in its group and head, so the reports are built from it.',
  },
  {
    prompt: 'In a computerised accounting system, account heads are arranged in a hierarchy. Which order runs from the top of it down?',
    correct: 'Primary group, sub-group, ledger account',
    wrong: [
      ['Ledger account, sub-group, primary group', 'Gave the order from the bottom up.'],
      ['Sub-group, primary group, ledger account', 'A sub-group stands inside a primary group, not above it.'],
      ['Primary group, ledger account, sub-group', 'A ledger account is the lowest level: it holds no sub-group.'],
    ],
    explanation: 'Primary groups (the heads of the final accounts) hold sub-groups, and the ledger accounts, to which vouchers are posted, stand at the bottom.',
  },
];

const casCodeType = mcqTemplate({
  id: 'cas-code-type', topicId: T, conceptId: 'cas-codification', difficulty: 'easy', version: 2,
  generate: (rng) => {
    const f = rng.pick(CODE_FACTS);
    return choice(f.prompt, f.correct, f.wrong, f.explanation, HINTS.codeKinds);
  },
  verify: (q) => {
    const f = CODE_FACTS.find((x) => x.prompt === q.prompt);
    return f !== undefined && optionText(q) === f.correct;
  },
});

const PRIMARY: Record<string, string> = {
  'Capital Account': "the owner's capital, and the drawings that reduce it",
  'Fixed Assets': 'assets kept for use in the business for a long time',
  Investments: 'money placed in shares, bonds and the like for the long term',
  'Current Assets': 'cash, bank, stock, debtors and other assets that turn into cash within a year',
  'Current Liabilities': 'amounts payable within a year: creditors, bills payable, outstanding expenses and taxes',
  'Loans (Liability)': 'loans taken for the long term',
  'Sales Accounts': 'the sale of goods',
  'Purchase Accounts': 'the purchase of goods for resale or for use in production',
  'Direct Expenses': 'expenses of buying or making the goods, which go to the trading account',
  'Indirect Expenses': 'expenses of the office and of selling, which go to the profit and loss account',
  'Direct Incomes': 'incomes from the main trade other than sales, which go to the trading account',
  'Indirect Incomes': 'other incomes, which go to the profit and loss account',
};

const LEDGER_GROUPS: { ledger: string; group: string; slip: Wrong }[] = [
  { ledger: 'Wages paid to factory workers', group: 'Direct Expenses', slip: ['Indirect Expenses', 'Took wages, a cost of making the goods, for an office expense.'] },
  { ledger: 'Carriage inwards on goods bought', group: 'Direct Expenses', slip: ['Indirect Expenses', 'Carriage outwards is an indirect expense; carriage inwards is part of the cost of the goods.'] },
  { ledger: 'Power and fuel used in the factory', group: 'Direct Expenses', slip: ['Indirect Expenses', 'Took a cost of production for an office expense.'] },
  { ledger: 'Salaries of the office staff', group: 'Indirect Expenses', slip: ['Direct Expenses', 'Took office salaries for a cost of making the goods.'] },
  { ledger: 'Rent of the showroom', group: 'Indirect Expenses', slip: ['Current Liabilities', 'Took the rent, an expense, for an amount still payable.'] },
  { ledger: 'Advertisement', group: 'Indirect Expenses', slip: ['Fixed Assets', 'Treated advertisement, a selling expense of the year, as an asset.'] },
  { ledger: 'Commission received', group: 'Indirect Incomes', slip: ['Sales Accounts', 'Took an income other than the sale of goods for a sale.'] },
  { ledger: 'Interest received on a fixed deposit', group: 'Indirect Incomes', slip: ['Investments', 'Put the interest earned with the deposit that earns it.'] },
  { ledger: 'Machinery', group: 'Fixed Assets', slip: ['Purchase Accounts', 'Took the purchase of an asset for a purchase of goods.'] },
  { ledger: 'Furniture of the office', group: 'Fixed Assets', slip: ['Indirect Expenses', 'Took furniture, an asset used for years, for an expense of the year.'] },
  { ledger: 'Loan from a bank, repayable in five years', group: 'Loans (Liability)', slip: ['Current Liabilities', 'Took a loan repayable after five years for one payable within a year.'] },
  { ledger: 'Creditors for goods bought', group: 'Current Liabilities', slip: ['Loans (Liability)', 'Took creditors, payable within a year, for a long-term loan.'] },
  { ledger: 'Outstanding salaries', group: 'Current Liabilities', slip: ['Indirect Expenses', 'The expense is salaries; the amount still owed for it is a liability.'] },
  { ledger: 'Prepaid insurance', group: 'Current Assets', slip: ['Indirect Expenses', 'The expense is insurance; the part paid in advance is an asset.'] },
  { ledger: 'Debtors for goods sold', group: 'Current Assets', slip: ['Current Liabilities', 'Took the customers who owe the business for people the business owes.'] },
  { ledger: "Owner's capital", group: 'Capital Account', slip: ['Loans (Liability)', "Took the owner's capital for a loan from outside."] },
  { ledger: 'Drawings', group: 'Capital Account', slip: ['Indirect Expenses', "Took the owner's withdrawals for an expense of the business."] },
  { ledger: 'Shares of another company held for the long term', group: 'Investments', slip: ['Current Assets', 'Shares held for the long term are not turned into cash within a year.'] },
  { ledger: 'Goods bought for resale', group: 'Purchase Accounts', slip: ['Direct Expenses', 'Goods bought are purchases; direct expenses are the costs of bringing them in or making them.'] },
  { ledger: 'Goods sold to customers', group: 'Sales Accounts', slip: ['Direct Incomes', 'Put the sale of goods among the incomes other than sales.'] },
];

const casLedgerGroup = mcqTemplate({
  id: 'cas-ledger-group', topicId: T, conceptId: 'cas-codification', difficulty: 'easy',
  generate: (rng) => {
    const item = rng.pick(LEDGER_GROUPS);
    const others = rng.shuffle(Object.keys(PRIMARY).filter((g) => g !== item.group && g !== item.slip[0])).slice(0, 3);
    return choice(
      `In a computerised accounting system, under which group is the ledger account for this created: ${lower(item.ledger)}?`,
      item.group,
      [item.slip, ...others.map((g): Wrong => [g, `Chose ${g}, the group for ${PRIMARY[g]}.`])],
      `${item.group} is the group for ${PRIMARY[item.group]}.`,
      HINTS.groups,
    );
  },
  verify: (q) => {
    const item = LEDGER_GROUPS.find((x) => q.prompt.endsWith(`created: ${lower(x.ledger)}?`));
    return item !== undefined && optionText(q) === item.group;
  },
});

// The general hierarchy every package follows in some form: primary groups, the sub-groups of each, and the ledgers
// under them. Only sub-groups whose place follows from what they hold are asked about; the names and the reserved
// sub-groups of one package or another are not examined.
const SUBS: Record<string, { parent: string; holds: string }> = {
  'Bank Accounts': { parent: 'Current Assets', holds: 'the current and savings accounts of the business with banks' },
  'Cash-in-hand': { parent: 'Current Assets', holds: 'the cash kept in the office, petty cash too' },
  'Sundry Debtors': { parent: 'Current Assets', holds: 'the customers who owe the business' },
  'Sundry Creditors': { parent: 'Current Liabilities', holds: 'the suppliers the business owes' },
  'Duties and Taxes': { parent: 'Current Liabilities', holds: 'taxes collected or payable, such as GST' },
  Provisions: { parent: 'Current Liabilities', holds: 'amounts set aside for known liabilities payable within the year, such as tax' },
  'Secured Loans': { parent: 'Loans (Liability)', holds: 'long-term loans backed by a charge on the assets of the business' },
  'Unsecured Loans': { parent: 'Loans (Liability)', holds: 'long-term loans taken without any security' },
};
const TOP_GROUPS = ['Current Assets', 'Current Liabilities', 'Loans (Liability)', 'Capital Account', 'Fixed Assets'];
const SUB_LEDGERS: { ledger: string; sub: string; slip: Wrong }[] = [
  { ledger: 'Mehta & Sons, a customer who buys on credit', sub: 'Sundry Debtors', slip: ['Sundry Creditors', 'Took a customer, who owes the business, for a supplier.'] },
  { ledger: 'Rao & Co., a supplier who sells to the business on credit', sub: 'Sundry Creditors', slip: ['Sundry Debtors', 'Took a supplier, whom the business owes, for a customer.'] },
  { ledger: 'the current account of the business with State Bank of India', sub: 'Bank Accounts', slip: ['Cash-in-hand', 'Money in a bank account is not cash kept in the office.'] },
  { ledger: 'the petty cash kept by the office', sub: 'Cash-in-hand', slip: ['Bank Accounts', 'Petty cash is kept in the office, not with a bank.'] },
  { ledger: 'Output CGST payable on the sales', sub: 'Duties and Taxes', slip: ['Provisions', 'GST collected on sales is a tax payable, kept with duties and taxes, not a provision.'] },
  { ledger: 'Provision for income tax', sub: 'Provisions', slip: ['Duties and Taxes', 'An amount set aside for a known liability is a provision.'] },
  { ledger: 'a loan from HDFC Bank, repayable in six years and secured on the machinery', sub: 'Secured Loans', slip: ['Unsecured Loans', 'The loan is backed by the machinery, so it is secured.'] },
  { ledger: 'a loan from a friend of the owner, repayable in four years and given without any security', sub: 'Unsecured Loans', slip: ['Secured Loans', 'No asset backs the loan, so it is unsecured.'] },
];
const LEDGER_EXAMPLES = ['Mehta & Sons', 'Rao & Co.', 'Petty Cash', 'Output CGST', 'State Bank of India Current Account', 'Wages'];

const casHierarchy = mcqTemplate({
  id: 'cas-hierarchy', topicId: T, conceptId: 'cas-codification', difficulty: 'medium', version: 2,
  generate: (rng) => {
    const form = rng.int(0, 2);
    if (form === 0) {
      const sub = rng.pick(Object.keys(SUBS));
      const parent = SUBS[sub].parent;
      return choice(
        `In the hierarchy of account heads of a computerised accounting system, under which primary group does the sub-group ${sub} stand?`,
        parent,
        TOP_GROUPS.filter((g) => g !== parent).map((g): Wrong => [g, `${g} is the group for ${PRIMARY[g]}; ${sub}, which holds ${SUBS[sub].holds}, belongs under ${parent}.`]),
        `${sub} holds ${SUBS[sub].holds}, so it is a sub-group of ${parent}, the group for ${PRIMARY[parent]}.`,
        HINTS.groups,
      );
    }
    if (form === 1) {
      const item = rng.pick(SUB_LEDGERS);
      const others = rng.shuffle(Object.keys(SUBS).filter((s) => s !== item.sub && s !== item.slip[0])).slice(0, 3);
      return choice(
        `A ledger account is created for ${item.ledger}. Under which sub-group of a computerised accounting system is it created?`,
        item.sub,
        [item.slip, ...others.map((s): Wrong => [s, `Chose ${s}, the sub-group for ${SUBS[s].holds}.`])],
        `${item.sub} is the sub-group for ${SUBS[item.sub].holds}; it stands under ${SUBS[item.sub].parent}.`,
        HINTS.groups,
      );
    }
    const ledger = rng.pick(LEDGER_EXAMPLES);
    const groups = rng.shuffle([...TOP_GROUPS, ...Object.keys(SUBS)]).slice(0, 4);
    return choice(
      'Which of these is a ledger account, not a group or a sub-group?',
      ledger,
      groups.map((g): Wrong => [g, `${g} is a ${TOP_GROUPS.includes(g) ? 'primary group' : 'sub-group'}: it holds ledger accounts, and no voucher is posted to it directly.`]),
      `${ledger} is a ledger account, the lowest level of the hierarchy, to which vouchers are posted. The others are groups that hold ledgers.`,
      HINTS.groups,
    );
  },
  verify: (q) => {
    const right = optionText(q);
    const sub = /does the sub-group (.+) stand\?/.exec(q.prompt)?.[1];
    if (sub) return SUBS[sub]?.parent === right;
    const item = SUB_LEDGERS.find((x) => q.prompt === `A ledger account is created for ${x.ledger}. Under which sub-group of a computerised accounting system is it created?`);
    if (item) return right === item.sub;
    return LEDGER_EXAMPLES.includes(right);
  },
});

const INSTALL_FACTS: { prompt: string; correct: string; wrong: Wrong[]; explanation: string }[] = [
  {
    prompt: 'What should be checked before a computerised accounting package is installed?',
    correct: 'That the computer has the hardware and the operating system the package needs',
    wrong: [
      ['That the opening balances have been entered', 'Opening balances are entered after the package is installed and a company has been created in it.'],
      ['That the trial balance agrees', 'There is no trial balance before the package is even installed.'],
      ['That every voucher of the year has been typed in', 'Vouchers are entered only after installation, once the company and its ledgers exist.'],
    ],
    explanation: 'Installation begins by making sure the computer meets the requirements of the package: processor, memory, disk space and operating system.',
  },
  {
    prompt: 'Once the package is installed, what is created first?',
    correct: 'The company, with its name, address and the date its financial year begins',
    wrong: [
      ['The ledger accounts', 'A ledger belongs to a company, so the company has to exist first.'],
      ['The vouchers', 'Vouchers are posted to ledgers, which need the company first.'],
      ['The balance sheet', 'The balance sheet is a report the system makes from the entries; it is never created by hand.'],
    ],
    explanation: 'Everything is kept inside a company: it is created first, then its groups and ledgers, then the vouchers.',
  },
  {
    prompt: 'Which detail is given when a company is created in a computerised accounting package?',
    correct: 'The date from which its financial year and its books begin',
    wrong: [
      ["The balance of each customer's account", 'That is given when each customer\'s ledger is created.'],
      ['The closing stock of the year', 'Closing stock is known only at the end of the year.'],
      ['The net profit of the year', 'The system works out the profit from the entries.'],
    ],
    explanation: 'Creating a company records its name and address, the beginning of its financial year and of its books, its currency and, where wanted, a password.',
  },
  {
    prompt: 'In which order is a computerised accounting system set up and used?',
    correct: 'Install the package, create the company, create the groups and ledgers, enter the vouchers',
    wrong: [
      ['Create the company, install the package, enter the vouchers, create the ledgers', 'The package must be installed before anything can be created in it, and ledgers before vouchers are posted to them.'],
      ['Install the package, enter the vouchers, create the company, create the ledgers', 'Vouchers need a company and ledgers to be posted to.'],
      ['Install the package, create the ledgers, create the company, enter the vouchers', 'Ledgers belong to a company, which is created first.'],
    ],
    explanation: 'The package is installed; a company is created; its chart of accounts (groups and ledgers) is set up; then the vouchers are entered and the reports follow.',
  },
  {
    prompt: 'What must exist before a ledger account can be created?',
    correct: 'The group it belongs to, whether the package provides it or the user creates it',
    wrong: [
      ['Its first voucher', 'A voucher can be posted only to a ledger that already exists.'],
      ['A printed trial balance', 'The trial balance is a report made from the ledgers, not something they need first.'],
      ['An opening balance for it', 'A ledger can be created with no opening balance at all.'],
    ],
    explanation: 'Every ledger is created under a group, which decides where its balance appears in the trial balance and the final accounts.',
  },
  {
    prompt: 'Why does a computerised accounting package come with groups of accounts already made?',
    correct: 'So that the ledgers created under them fall into place in the trial balance, the profit and loss account and the balance sheet',
    wrong: [
      ['So that no ledger account need ever be created', 'The ledgers of the business still have to be created under the groups.'],
      ['So that vouchers can be posted to the groups directly', 'Vouchers are posted to ledgers; a group only collects them.'],
      ['So that the accounts need no audit', 'An audit is needed whatever the package provides.'],
    ],
    explanation: 'Each ready-made group has a place in the final accounts, so a ledger created under it is reported in the right place automatically.',
  },
  {
    prompt: 'Why is a password set when a company is created?',
    correct: 'So that only authorised users can open its accounts',
    wrong: [
      ['So that the trial balance agrees', 'Agreement depends on balanced vouchers, not on passwords.'],
      ['So that the accounts are backed up', 'A back-up has to be taken; a password does not take one.'],
      ['So that the company can be created again every year', 'A company is created once; its books continue year after year.'],
    ],
    explanation: 'The password keeps the data of the company from anyone who has no right to see or change it.',
  },
];

const casInstall = mcqTemplate({
  id: 'cas-install', topicId: T, conceptId: 'cas-codification', difficulty: 'easy',
  generate: (rng) => {
    const f = rng.pick(INSTALL_FACTS);
    return choice(f.prompt, f.correct, f.wrong, f.explanation, ['Ask what has to exist before this step can be taken.', 'Install, create the company, create the groups and ledgers, enter the vouchers.']);
  },
  verify: (q) => {
    const f = INSTALL_FACTS.find((x) => x.prompt === q.prompt);
    return f !== undefined && optionText(q) === f.correct;
  },
});

// ===============================================================================================================
// Data entry, validation and verification; security
// ===============================================================================================================

const VOUCHERS: Record<string, string> = {
  Receipt: 'money received, in cash or into the bank',
  Payment: 'money paid out, in cash or from the bank',
  Contra: 'money moved between cash and bank, or between two bank accounts',
  Journal: 'entries with no cash or bank in them, such as adjustments and transfers',
  Sales: 'goods sold',
  Purchase: 'goods bought',
  'Credit Note': 'goods returned by a customer',
  'Debit Note': 'goods returned to a supplier',
};
const VOUCHER_CASES: { text: (x: string) => string; voucher: string; near: string[] }[] = [
  { text: (x) => `Received ${x} in cash from Mehta & Sons, a customer, against the amount due`, voucher: 'Receipt', near: ['Sales', 'Contra'] },
  { text: (x) => `The bank credited interest of ${x} on a fixed deposit`, voucher: 'Receipt', near: ['Journal', 'Contra'] },
  { text: (x) => `Received a cheque of ${x} from Anita Traders, a debtor, and paid it into the bank the same day`, voucher: 'Receipt', near: ['Contra', 'Sales'] },
  { text: (x) => `Paid the office rent of ${x} in cash`, voucher: 'Payment', near: ['Journal', 'Purchase'] },
  { text: (x) => `Paid ${x} to Rao & Co., a supplier, by cheque`, voucher: 'Payment', near: ['Purchase', 'Contra'] },
  { text: (x) => `Paid salaries of ${x} by bank transfer`, voucher: 'Payment', near: ['Journal', 'Contra'] },
  { text: (x) => `Deposited ${x} of cash into the bank`, voucher: 'Contra', near: ['Payment', 'Receipt'] },
  { text: (x) => `Withdrew ${x} from the bank for office use`, voucher: 'Contra', near: ['Payment', 'Receipt'] },
  { text: (x) => `Transferred ${x} from the current account with one bank to the current account with another`, voucher: 'Contra', near: ['Payment', 'Journal'] },
  { text: (x) => `Charged depreciation of ${x} on the machinery`, voucher: 'Journal', near: ['Payment', 'Purchase'] },
  { text: (x) => `Wrote off ${x} due from a customer as a bad debt`, voucher: 'Journal', near: ['Credit Note', 'Payment'] },
  { text: (x) => `Salaries of ${x} for March are outstanding at the end of the year`, voucher: 'Journal', near: ['Payment', 'Receipt'] },
  { text: (x) => `Sold goods for ${x} on credit to Lakshmi Stores`, voucher: 'Sales', near: ['Receipt', 'Journal'] },
  { text: (x) => `Bought goods for ${x} on credit from Sharma Bros`, voucher: 'Purchase', near: ['Payment', 'Journal'] },
  { text: (x) => `Lakshmi Stores returned goods of ${x} that had been sold to it on credit`, voucher: 'Credit Note', near: ['Debit Note', 'Sales'] },
  { text: (x) => `Returned goods of ${x} to Sharma Bros, bought from them on credit`, voucher: 'Debit Note', near: ['Credit Note', 'Purchase'] },
];

const casVoucher = mcqTemplate({
  id: 'cas-voucher', topicId: T, conceptId: 'cas-data-entry', difficulty: 'easy',
  generate: (rng) => {
    const c = rng.pick(VOUCHER_CASES);
    const x = inr(amount(rng, 1000, 90000, 500) / 100);
    const rest = rng.shuffle(Object.keys(VOUCHERS).filter((v) => v !== c.voucher && !c.near.includes(v))).slice(0, 2);
    return choice(
      `${rng.pick(FIRMS)} keeps its books on a computerised accounting system. ${c.text(x)}. Which type of voucher records this?`,
      `${c.voucher} voucher`,
      [...c.near, ...rest].map((v): Wrong => [`${v} voucher`, `Chose a ${v.toLowerCase()} voucher, which records ${VOUCHERS[v]}.`]),
      `A ${c.voucher.toLowerCase()} voucher records ${VOUCHERS[c.voucher]}: that is what happened here.`,
      HINTS.vouchers,
    );
  },
  verify: (q) => {
    const done = /accounting system\. (.+)\. Which type of voucher records this\?$/.exec(q.prompt)?.[1] ?? '';
    const amountText = /₹[\d,]+/.exec(done)?.[0] ?? '';
    const c = VOUCHER_CASES.find((x) => x.text(amountText) === done);
    return c !== undefined && optionText(q) === `${c.voucher} voucher`;
  },
});

interface Check {
  name: string;
  about: string;
  scenes: string[];
  /** Checks a learner could defend for its scenes too: not offered beside it. */
  near?: string[];
}

const CHECKS: Check[] = [
  { name: 'Data type check', about: 'that a field holds data of its own kind: figures in an amount, a date in a date field', scenes: ['The operator types "5O00", with the letter O, in the amount field of a payment voucher.', 'The quantity on a sales invoice is typed as "ten" in words.'], near: ['Format (length) check'] },
  { name: 'Range check', about: 'that a value lies between the lowest and the highest figure allowed', scenes: ['A rate of discount of 120% is typed on an invoice, though the firm allows from 0% to 10%.', 'A quantity of -5 units is typed on a sales invoice.'] },
  { name: 'Presence (completeness) check', about: 'that a field which must be filled is not left blank', scenes: ['A voucher is about to be saved without the name of the ledger to be credited.', 'A sales invoice is about to be saved without the name of the customer.'] },
  { name: 'List (existence) check', about: 'that an entry is one of those allowed, such as the ledgers already created', scenes: ['The operator types "Advertisment" as the ledger name; no ledger of that spelling has been created.', 'A GST rate of 15% is typed, though only the rates set up in the system may be chosen.'] },
  { name: 'Format (length) check', about: 'that an entry has the pattern and the number of characters laid down', scenes: ["A customer's GSTIN is typed with 13 characters instead of 15.", "A supplier's PAN is typed as 1234ABCDEF, with the figures and letters in the wrong places."] },
  { name: 'Date check', about: 'that a date is a real date within the period the books are open for', scenes: ['A voucher is dated 30 February.', 'A voucher of the year 2025-26 is dated 15 April 2027.'], near: ['Range check'] },
  { name: 'Balancing check', about: 'that the debits and the credits of a voucher are equal before it is saved', scenes: ['A journal voucher shows debits of ₹12,000 and credits of ₹10,000.'] },
  { name: 'Duplicate check', about: 'that the same document is not entered twice', scenes: ['The same purchase invoice, with the same number and from the same supplier, is entered a second time.'] },
];

const VERIFY_FACTS: { prompt: string; correct: string; wrong: Wrong[]; explanation: string }[] = [
  {
    prompt: 'Which of these errors would no validation rule catch, so that only verification against the source document finds it?',
    correct: 'A payment of ₹5,400 entered as ₹4,500',
    wrong: [
      ['A payment entered as "5,4OO" with letters in it', 'A data type check refuses letters in an amount.'],
      ['A journal voucher whose debits and credits differ', 'A balancing check refuses to save it.'],
      ['A voucher dated 31 June', 'A date check refuses a date that does not exist.'],
    ],
    explanation: '₹4,500 is a proper amount of the right type and within any sensible range, so every rule passes it; only comparing the entry with the voucher shows that the figures were swapped.',
  },
  {
    prompt: 'What is verification of data in a computerised accounting system?',
    correct: 'Checking that what was entered agrees with the source document it was taken from',
    wrong: [
      ['Checking data against rules as it is typed in', 'That is validation, which the system does as each entry is made.'],
      ['Taking a copy of the data to another disk', 'That is a back-up, a security measure.'],
      ['Working out the balances of the ledger accounts', 'That is processing, which the system does after the data is entered.'],
    ],
    explanation: 'Verification compares the entered data with the vouchers and invoices, for example by reading it back or by having a second person check it.',
  },
  {
    prompt: 'What is validation of data in a computerised accounting system?',
    correct: 'Checking data against set rules as it is entered, so that impossible or incomplete entries are refused',
    wrong: [
      ['Comparing the entered data with the source documents', 'That is verification.'],
      ['Approving the final accounts at the end of the year', 'Approval of the accounts is not a check on data entry.'],
      ['Keeping the data safe from outsiders', 'That is security, by passwords and the like.'],
    ],
    explanation: 'Validation rules (type, range, presence, list, format, date, balancing, duplicate) are applied by the system to each entry as it is made.',
  },
  {
    prompt: 'Rehana enters a credit sale to Lakshmi Stores in the account of Lakshmi Traders, another customer. Which control finds this?',
    correct: 'Verification of the entry against the sales invoice',
    wrong: [
      ['A list (existence) check', 'Lakshmi Traders is a ledger that exists, so the list check passes it.'],
      ['A balancing check', 'The voucher balances: one debit and one credit of the same amount.'],
      ['A data type check', 'The entry has the right kind of data in every field.'],
    ],
    explanation: 'The entry obeys every rule; only comparing it with the invoice shows the wrong customer. That is verification.',
  },
];

const casValidation = mcqTemplate({
  id: 'cas-validation', topicId: T, conceptId: 'cas-data-entry', difficulty: 'medium',
  generate: (rng) => {
    if (rng.int(0, 3) === 0) {
      const f = rng.pick(VERIFY_FACTS);
      return choice(f.prompt, f.correct, f.wrong, f.explanation, HINTS.validation);
    }
    const right = rng.pick(CHECKS);
    return choice(
      `${rng.pick(right.scenes)} Which validation check of a computerised accounting system refuses this entry?`,
      right.name,
      rng.shuffle(CHECKS.filter((c) => c !== right && !right.near?.includes(c.name) && !c.near?.includes(right.name))).slice(0, 4).map((c): Wrong => [c.name, `Chose the ${lower(c.name)}, which makes sure ${c.about}.`]),
      `The ${lower(right.name)} makes sure ${right.about}.`,
      HINTS.validation,
    );
  },
  verify: (q) => {
    const f = VERIFY_FACTS.find((x) => x.prompt === q.prompt);
    if (f) return optionText(q) === f.correct;
    const c = CHECKS.find((x) => x.name === optionText(q));
    return c !== undefined && c.scenes.some((s) => q.prompt.startsWith(s));
  },
});

const SECURITY: Check[] = [
  { name: 'Password', about: 'that no one can open the data of the company without the user name and its password', scenes: ["A visitor who sits at the accountant's computer cannot open the books without the secret word that only the staff know."] },
  { name: 'User access rights', about: "that each user can do only what that user's role allows", scenes: ['The data-entry operator can enter vouchers but cannot see the profit and loss account or alter a ledger.', 'Only the chief accountant may delete a voucher; the clerks can enter vouchers but not delete them.'] },
  { name: 'Audit trail', about: 'that a record is kept of who entered, altered or deleted each voucher, and when', scenes: ['The auditor finds that a sales voucher was altered on 3 April by the user "clerk2", with its old and new amounts shown.'] },
  { name: 'Back-up and restore', about: 'that copies of the data are taken so that it can be put back after a loss', scenes: ['After the hard disk failed, the books were put back from the copy taken the evening before.'] },
  { name: 'Data vault (encryption)', about: 'that the data is stored in a coded form that cannot be read without the key', scenes: ["A laptop with the company's data is stolen, but the files cannot be read without the key."] },
];

const casSecurity = mcqTemplate({
  id: 'cas-security', topicId: T, conceptId: 'cas-security', difficulty: 'easy',
  generate: (rng) => {
    const right = rng.pick(SECURITY);
    return choice(
      `${rng.pick(right.scenes)} Which security feature of a computerised accounting system is at work?`,
      right.name,
      SECURITY.filter((s) => s !== right).map((s): Wrong => [s.name, `Chose ${lower(s.name)}, which makes sure ${s.about}.`]),
      `${right.name} makes sure ${right.about}.`,
      HINTS.security,
    );
  },
  verify: (q) => {
    const s = SECURITY.find((x) => x.name === optionText(q));
    return s !== undefined && s.scenes.some((x) => q.prompt.startsWith(x));
  },
});

// ===============================================================================================================
// Adjusting, closing and opening entries, as a computerised system records them through a journal voucher
// ===============================================================================================================

const YEAR_END = '31 March 2026';
const VIA = 'through a journal voucher';
const dr = (accountId: string, r: number): JournalLine => ({ accountId, side: 'Dr', amount: rupees(r) });
const cr = (accountId: string, r: number): JournalLine => ({ accountId, side: 'Cr', amount: rupees(r) });
/** True for an entry of two lines of `r` rupees each, the debit to `debit`. */
const entryIs = (q: JournalQuestion, debit: string, r: number): boolean =>
  q.expected.length === 2 && q.expected.every((l) => l.amount === rupees(r)) && q.expected.some((l) => l.side === 'Dr' && l.accountId === debit);
const sideTotal = (q: JournalQuestion, side: 'Dr' | 'Cr'): number => q.expected.filter((l) => l.side === side).reduce((t, l) => t + l.amount, 0);

const OUT_EXPENSES = [{ id: 'salaries', name: 'Salaries' }, { id: 'rent', name: 'Rent' }, { id: 'wages', name: 'Wages' }, { id: 'electricity', name: 'Electricity charges' }] as const;
const PRE_EXPENSES = [{ id: 'insurance', name: 'Insurance premium' }, { id: 'rent', name: 'Rent' }, { id: 'advertisement', name: 'Advertisement' }] as const;
const INCOMES = [{ id: 'commissionReceived', name: 'Commission' }, { id: 'interestReceived', name: 'Interest on investments' }, { id: 'rentReceived', name: 'Rent from a sub-tenant' }] as const;

const casAdjusting = journalTemplate({
  id: 'cas-adjusting', topicId: T, conceptId: 'cas-final-accounts', difficulty: 'easy',
  generate: (rng): JournalParts => {
    const firm = rng.pick(FIRMS);
    const x = amount(rng, 2000, 60000, 500) / 100;
    const head = `${firm} keeps its books on a computerised accounting system. On ${YEAR_END}, the year end, this adjustment is entered ${VIA}:`;
    const form = rng.int(0, 4);
    if (form === 0) {
      const e = rng.pick(OUT_EXPENSES);
      return {
        prompt: `${head} ${inr(x)} of ${e.name.toLowerCase()} for the year is still unpaid. Pass the entry the voucher records.`,
        lines: [dr(e.id, x), cr('outstandingExpenses', x)],
        explanation: [`The expense of the year rises: ${e.name} A/c is debited.`, 'The amount is owed: Outstanding Expenses A/c, a liability, is credited.'],
        distractorAccounts: ['prepaidExpenses', 'cash'],
        hints: HINTS.entries,
      };
    }
    if (form === 1) {
      const e = rng.pick(PRE_EXPENSES);
      return {
        prompt: `${head} ${e.name} of ${inr(x)}, paid during the year, belongs to the next year. Pass the entry the voucher records.`,
        lines: [dr('prepaidExpenses', x), cr(e.id, x)],
        explanation: ['The part paid in advance is an asset: Prepaid Expenses A/c is debited.', `The expense of this year falls: ${e.name.replace(/ premium$/, '')} A/c is credited.`],
        distractorAccounts: ['outstandingExpenses', 'accruedIncome'],
        hints: HINTS.entries,
      };
    }
    if (form === 2) {
      const i = rng.pick(INCOMES);
      return {
        prompt: `${head} ${i.name} of ${inr(x)} has been earned during the year but not yet received. Pass the entry the voucher records.`,
        lines: [dr('accruedIncome', x), cr(i.id, x)],
        explanation: ['The amount earned and still to be received is an asset: Accrued Income A/c is debited.', `The income of the year rises: the income account is credited.`],
        distractorAccounts: ['incomeReceivedInAdvance', 'prepaidExpenses'],
        hints: HINTS.entries,
      };
    }
    if (form === 3) {
      const i = rng.pick(INCOMES.filter((y) => y.id !== 'interestReceived'));
      return {
        prompt: `${head} ${i.name} of ${inr(x)}, received during the year, belongs to the next year. Pass the entry the voucher records.`,
        lines: [dr(i.id, x), cr('incomeReceivedInAdvance', x)],
        explanation: ['The income of this year falls: the income account is debited.', 'The amount received for the next year is a liability: Income Received in Advance A/c is credited.'],
        distractorAccounts: ['accruedIncome', 'outstandingExpenses'],
        hints: HINTS.entries,
      };
    }
    const asset = rng.pick([{ id: 'machinery', name: 'machinery' }, { id: 'furniture', name: 'furniture' }, { id: 'vehicles', name: 'vehicles' }] as const);
    return {
      prompt: `${head} depreciation of ${inr(x)} is charged on the ${asset.name}, and credited to the asset account. Pass the entry the voucher records.`,
      lines: [dr('depreciation', x), cr(asset.id, x)],
      explanation: ['Depreciation is an expense: Depreciation A/c is debited.', `The value of the asset falls: ${cap(asset.name)} A/c is credited.`],
      distractorAccounts: ['provisionForDepreciation', 'profitAndLoss'],
      hints: HINTS.entries,
    };
  },
  verify: (q) => {
    const [x] = amountsIn(q.prompt);
    const credits = (id: string) => q.expected.some((l) => l.side === 'Cr' && l.accountId === id);
    if (q.prompt.includes('still unpaid')) return credits('outstandingExpenses') && entryIs(q, q.expected.find((l) => l.side === 'Dr')!.accountId, x);
    if (q.prompt.includes('not yet received')) return entryIs(q, 'accruedIncome', x);
    if (q.prompt.includes('depreciation of')) return entryIs(q, 'depreciation', x);
    if (q.prompt.includes('paid during the year, belongs')) return entryIs(q, 'prepaidExpenses', x);
    if (q.prompt.includes('received during the year, belongs')) return credits('incomeReceivedInAdvance') && entryIs(q, q.expected.find((l) => l.side === 'Dr')!.accountId, x);
    return false;
  },
});

const MONTHS = ['April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December', 'January', 'February', 'March'];

const casAdjustingWorked = journalTemplate({
  id: 'cas-adjusting-worked', topicId: T, conceptId: 'cas-final-accounts', difficulty: 'medium', computed: true,
  generate: (rng): JournalParts | null => {
    const firm = rng.pick(FIRMS);
    const head = `${firm} keeps its books on a computerised accounting system and closes its year on ${YEAR_END}. This adjustment is entered ${VIA}:`;
    const form = rng.int(0, 3);
    if (form === 0) {
      const rate = rng.pick([10, 15, 20]), cost = amount(rng, 100000, 1500000, 20000) / 100;
      const dep = (cost * rate) / 100;
      const asset = rng.pick([{ id: 'machinery', name: 'machinery' }, { id: 'furniture', name: 'furniture' }] as const);
      return {
        prompt: `${head} depreciation on ${asset.name} costing ${inr(cost)}, held for the whole year, at ${rate}% a year by the straight line method, credited to the asset account. Pass the entry the voucher records.`,
        lines: [dr('depreciation', dep), cr(asset.id, dep)],
        explanation: [`Depreciation = ${inr(cost)} × ${rate}% = ${inr(dep)}.`, `Depreciation A/c Dr ${inr(dep)}; To ${cap(asset.name)} A/c ${inr(dep)}.`],
        distractorAccounts: ['provisionForDepreciation', 'profitAndLoss'],
        hints: HINTS.entries,
      };
    }
    if (form === 1) {
      // Paid between 1 May and 1 December 2025, so that part of the year's cover falls in 2026-27.
      const from = rng.int(1, 8), premium = amount(rng, 6000, 60000, 1200) / 100;
      const used = 12 - from, ahead = 12 - used;
      const prepaid = (premium * ahead) / 12;
      return {
        prompt: `${head} an insurance premium of ${inr(premium)} for one year was paid on 1 ${MONTHS[from]} 2025. Pass the entry for the part paid in advance.`,
        lines: [dr('prepaidExpenses', prepaid), cr('insurance', prepaid)],
        explanation: [
          `The premium covers 1 ${MONTHS[from]} 2025 to the end of ${MONTHS[(from + 11) % 12]} 2026; ${used} months fall in this year, ${ahead} in the next.`,
          `Prepaid = ${inr(premium)} × ${ahead} ÷ 12 = ${inr(prepaid)}.`,
          'Prepaid Expenses A/c is debited; Insurance A/c is credited.',
        ],
        distractorAccounts: ['outstandingExpenses', 'cash'],
        hints: HINTS.entries,
      };
    }
    if (form === 2) {
      const invest = amount(rng, 100000, 1000000, 20000) / 100, rate = rng.pick([6, 8, 9, 10, 12]), months = rng.pick([3, 6, 9]);
      const accrued = (invest * rate * months) / 1200;
      if (!Number.isInteger(accrued)) return null;
      return {
        prompt: `${head} interest at ${rate}% a year on investments of ${inr(invest)} has been received for ${12 - months} months of the year; the interest of the other ${months} months is due but not received. Pass the entry for the interest due.`,
        lines: [dr('accruedIncome', accrued), cr('interestReceived', accrued)],
        explanation: [`Interest due = ${inr(invest)} × ${rate}% × ${months} ÷ 12 = ${inr(accrued)}.`, 'Accrued Income A/c is debited; Interest Received A/c is credited.'],
        distractorAccounts: ['incomeReceivedInAdvance', 'investments'],
        hints: HINTS.entries,
      };
    }
    const monthly = amount(rng, 8000, 60000, 500) / 100, unpaid = rng.int(1, 3);
    const e = rng.pick(OUT_EXPENSES.filter((x) => x.id === 'salaries' || x.id === 'wages'));
    const out = monthly * unpaid;
    return {
      prompt: `${head} ${e.name.toLowerCase()} are ${inr(monthly)} a month, and those of the last ${unpaid === 1 ? 'month' : `${unpaid} months`} of the year have not been paid. Pass the entry for the amount outstanding.`,
      lines: [dr(e.id, out), cr('outstandingExpenses', out)],
      explanation: [`Outstanding = ${inr(monthly)} × ${unpaid} = ${inr(out)}.`, `${e.name} A/c is debited; Outstanding Expenses A/c is credited.`],
      distractorAccounts: ['prepaidExpenses', 'cash'],
      hints: HINTS.entries,
    };
  },
  verify: (q) => {
    const [x] = amountsIn(q.prompt);
    const rate = Number(/at (\d+)% a year/.exec(q.prompt)?.[1]);
    let want: number, debit: string;
    if (q.prompt.includes('straight line')) [want, debit] = [(x * rate) / 100, 'depreciation'];
    else if (q.prompt.includes('insurance premium')) {
      // The months of cover from the month paid to the end of March fall in this year; the rest is prepaid.
      const month = /paid on 1 (\w+) 2025/.exec(q.prompt)?.[1] ?? '';
      const inYear = MONTHS.length - MONTHS.indexOf(month);
      [want, debit] = [(x * (12 - inYear)) / 12, 'prepaidExpenses'];
    } else if (q.prompt.includes('on investments')) {
      const months = Number(/the other (\d+) months/.exec(q.prompt)?.[1]);
      [want, debit] = [(((x * rate) / 100) * months) / 12, 'accruedIncome'];
    } else {
      const unpaid = /last (\d+) months/.exec(q.prompt)?.[1];
      [want, debit] = [x * (unpaid ? Number(unpaid) : 1), q.prompt.includes('wages') ? 'wages' : 'salaries'];
    }
    return entryIs(q, debit, want);
  },
});

const CLOSE_EXPENSES = [
  { id: 'salaries', name: 'Salaries' }, { id: 'rent', name: 'Rent' }, { id: 'electricity', name: 'Electricity' },
  { id: 'advertisement', name: 'Advertisement' }, { id: 'stationery', name: 'Stationery' }, { id: 'insurance', name: 'Insurance' },
] as const;
const CLOSE_INCOMES = [{ id: 'commissionReceived', name: 'Commission Received' }, { id: 'interestReceived', name: 'Interest Received' }, { id: 'rentReceived', name: 'Rent Received' }, { id: 'discountReceived', name: 'Discount Received' }] as const;

const casClosing = journalTemplate({
  id: 'cas-closing', topicId: T, conceptId: 'cas-final-accounts', difficulty: 'medium',
  generate: (rng): JournalParts => {
    const firm = rng.pick(FIRMS);
    const head = `${firm} keeps its books on a computerised accounting system. At the year end, ${YEAR_END}, a closing entry is entered ${VIA}:`;
    const form = rng.int(0, 4);
    if (form === 0) {
      const heads = rng.shuffle([...CLOSE_EXPENSES]).slice(0, rng.int(2, 3));
      const xs = heads.map(() => amount(rng, 5000, 150000, 500) / 100);
      const total = xs.reduce((a, b) => a + b, 0);
      return {
        prompt: `${head} the balances of ${heads.map((h, i) => `${h.name} A/c, ${inr(xs[i])}`).join('; ')} are transferred to the Profit and Loss Account. Pass the closing entry.`,
        lines: [dr('profitAndLoss', total), ...heads.map((h, i) => cr(h.id, xs[i]))],
        explanation: ['An expense account has a debit balance; it is closed by crediting it.', `Profit and Loss A/c is debited with the total, ${inr(total)}.`],
        distractorAccounts: ['trading', 'capital'],
        hints: HINTS.entries,
      };
    }
    if (form === 1) {
      const heads = rng.shuffle([...CLOSE_INCOMES]).slice(0, 2);
      const xs = heads.map(() => amount(rng, 2000, 90000, 500) / 100);
      const total = xs[0] + xs[1];
      return {
        prompt: `${head} the balances of ${heads.map((h, i) => `${h.name} A/c, ${inr(xs[i])}`).join(' and ')} are transferred to the Profit and Loss Account. Pass the closing entry.`,
        lines: [...heads.map((h, i) => dr(h.id, xs[i])), cr('profitAndLoss', total)],
        explanation: ['An income account has a credit balance; it is closed by debiting it.', `Profit and Loss A/c is credited with the total, ${inr(total)}.`],
        distractorAccounts: ['trading', 'capital'],
        hints: HINTS.entries,
      };
    }
    const x = amount(rng, 20000, 500000, 1000) / 100;
    if (form === 2) {
      return {
        prompt: `${head} the net profit of ${inr(x)} shown by the Profit and Loss Account is transferred to the Capital Account. Pass the closing entry.`,
        lines: [dr('profitAndLoss', x), cr('capital', x)],
        explanation: ['A net profit is the credit balance of Profit and Loss A/c: it is closed by debiting it.', "The profit belongs to the owner: Capital A/c is credited."],
        distractorAccounts: ['drawings', 'trading'],
        hints: HINTS.entries,
      };
    }
    if (form === 3) {
      return {
        prompt: `${head} the net loss of ${inr(x)} shown by the Profit and Loss Account is transferred to the Capital Account. Pass the closing entry.`,
        lines: [dr('capital', x), cr('profitAndLoss', x)],
        explanation: ['A net loss is the debit balance of Profit and Loss A/c: it is closed by crediting it.', "The loss is borne by the owner: Capital A/c is debited."],
        distractorAccounts: ['drawings', 'trading'],
        hints: HINTS.entries,
      };
    }
    const d = amount(rng, 5000, 200000, 1000) / 100;
    return {
      prompt: `${head} the balance of Drawings A/c, ${inr(d)}, is transferred to the Capital Account. Pass the closing entry.`,
      lines: [dr('capital', d), cr('drawings', d)],
      explanation: ['Drawings reduce the capital: Capital A/c is debited.', 'Drawings A/c, which has a debit balance, is closed by crediting it.'],
      distractorAccounts: ['profitAndLoss', 'cash'],
      hints: HINTS.entries,
    };
  },
  verify: (q) => {
    // The balances named add up to the one figure on the other side of the entry, which closes them all.
    const total = rupees(amountsIn(q.prompt).reduce((a, b) => a + b, 0));
    const closer = (side: 'Dr' | 'Cr', id: string) => q.expected.some((l) => l.side === side && l.accountId === id && l.amount === total);
    if (sideTotal(q, 'Dr') !== total || sideTotal(q, 'Cr') !== total) return false;
    if (q.prompt.includes('Drawings A/c')) return closer('Cr', 'drawings') && closer('Dr', 'capital');
    if (q.prompt.includes('net profit')) return closer('Dr', 'profitAndLoss') && closer('Cr', 'capital');
    if (q.prompt.includes('net loss')) return closer('Cr', 'profitAndLoss') && closer('Dr', 'capital');
    const expenses = CLOSE_EXPENSES.some((e) => q.prompt.includes(`${e.name} A/c`));
    return expenses ? closer('Dr', 'profitAndLoss') : closer('Cr', 'profitAndLoss');
  },
});

const OPEN_ASSETS = [
  { id: 'machinery', name: 'Machinery' }, { id: 'furniture', name: 'Furniture' }, { id: 'stock', name: 'Stock' },
  { id: 'bank', name: 'Cash at bank' }, { id: 'cash', name: 'Cash in hand' }, { id: 'billsReceivable', name: 'Bills receivable' },
] as const;

const casOpening = journalTemplate({
  id: 'cas-opening', topicId: T, conceptId: 'cas-final-accounts', difficulty: 'complex', computed: true,
  generate: (rng): JournalParts | null => {
    const firm = rng.pick(FIRMS);
    const assets = rng.shuffle([...OPEN_ASSETS]).slice(0, rng.int(3, 4));
    const av = assets.map(() => amount(rng, 10000, 400000, 1000) / 100);
    const customer = rng.pick(CUSTOMERS), supplier = rng.pick(SUPPLIERS);
    const due = amount(rng, 10000, 150000, 1000) / 100, owed = amount(rng, 10000, 150000, 1000) / 100;
    const loan = rng.int(0, 1) === 0 ? amount(rng, 50000, 300000, 10000) / 100 : 0;
    const totalAssets = av.reduce((a, b) => a + b, 0) + due;
    const capital = totalAssets - owed - loan;
    if (capital <= 0) return null;
    const assetText = [...assets.map((a, i) => `${a.name} ${inr(av[i])}`), `${customer} (a debtor) ${inr(due)}`].join(', ');
    const liabText = [`${supplier} (a creditor) ${inr(owed)}`, ...(loan > 0 ? [`Bank loan ${inr(loan)}`] : [])].join(', ');
    return {
      prompt: `${firm} keeps its books on a computerised accounting system. On 1 April 2026 it opens its books for the new year ${VIA}, with the balances of its balance sheet of ${YEAR_END}. Assets: ${assetText}. Liabilities: ${liabText}. The capital is not listed: it is the excess of the assets over the liabilities. Pass the opening entry.`,
      lines: [
        ...assets.map((a, i) => dr(a.id, av[i])),
        dr(debtor(customer), due),
        cr(creditor(supplier), owed),
        ...(loan > 0 ? [cr('bankLoan', loan)] : []),
        cr('capital', capital),
      ],
      explanation: [
        'Every asset account is debited with its balance, and every liability account credited.',
        `Total assets = ${inr(totalAssets)}; liabilities = ${inr(owed + loan)}.`,
        `Capital = ${inr(totalAssets)} - ${inr(owed + loan)} = ${inr(capital)}, credited to Capital A/c.`,
      ],
      distractorAccounts: ['profitAndLoss', 'drawings'],
      hints: ['The opening entry brings the balances of the balance sheet into the new books.', 'Assets Dr; To Liabilities; To Capital (the difference).'],
    };
  },
  verify: (q) => {
    const assets = amountsIn(/Assets: (.+?)\. Liabilities:/.exec(q.prompt)?.[1] ?? '');
    const liabilities = amountsIn(/Liabilities: (.+?)\. The capital/.exec(q.prompt)?.[1] ?? '');
    const capital = assets.reduce((a, b) => a + b, 0) - liabilities.reduce((a, b) => a + b, 0);
    return (
      q.expected.filter((l) => l.side === 'Dr').length === assets.length &&
      q.expected.some((l) => l.side === 'Cr' && l.accountId === 'capital' && l.amount === rupees(capital)) &&
      sideTotal(q, 'Dr') === rupees(assets.reduce((a, b) => a + b, 0))
    );
  },
});

const casClosingCapital = numericTemplate({
  id: 'cas-closing-capital', topicId: T, conceptId: 'cas-final-accounts', difficulty: 'medium', unit: 'rupees',
  generate: (rng) => {
    const opening = amount(rng, 200000, 1500000, 10000) / 100;
    const gross = amount(rng, 100000, 900000, 5000) / 100;
    const expenses = amount(rng, 30000, 400000, 5000) / 100;
    const other = amount(rng, 2000, 60000, 1000) / 100;
    const drawings = amount(rng, 10000, 150000, 1000) / 100;
    const profit = gross + other - expenses;
    if (profit <= 0 || profit === drawings) return null;
    const firm = rng.pick(FIRMS);
    const parts = typed('rupees', opening + profit - drawings, [
      [opening + profit + drawings, 'Added the drawings instead of deducting them.'],
      [opening + profit, 'Did not transfer the drawings to the capital account.'],
      [opening + gross - drawings, 'Took the gross profit as the net profit, before the indirect expenses and incomes.'],
      other > 0 && [opening + gross - expenses - drawings, 'Left out the indirect incomes from the net profit.'],
    ]);
    if (!parts) return null;
    return {
      prompt: `${firm} keeps its books on a computerised accounting system. For the year ended ${YEAR_END}: capital at the start ${inr(opening)}; gross profit ${inr(gross)}; indirect expenses ${inr(expenses)}; indirect incomes ${inr(other)}; drawings ${inr(drawings)}. After the closing entries transfer the net profit and the drawings to the Capital Account, what capital does the balance sheet show?`,
      ...parts,
      explanation: [
        `Net profit = ${inr(gross)} + ${inr(other)} - ${inr(expenses)} = ${inr(profit)}.`,
        `Capital = ${inr(opening)} + ${inr(profit)} - ${inr(drawings)} = ${inr(opening + profit - drawings)}.`,
      ],
      hints: ['Work out the net profit first.', 'Closing capital = opening capital + net profit - drawings.'],
    };
  },
  verify: (q) => {
    const [opening, gross, expenses, other, drawings] = amountsIn(q.prompt);
    return rupees(opening - drawings + (gross - expenses + other)) === q.answer;
  },
});

const REPORT_FACTS: { prompt: string; correct: string; wrong: Wrong[]; explanation: string }[] = [
  {
    prompt: 'Which accounts are closed by the closing entries at the end of the year?',
    correct: 'The accounts of expenses, losses, incomes and gains, which are carried to the trading and profit and loss accounts',
    wrong: [
      ['The accounts of assets and liabilities', 'They are carried forward to the next year, by the opening entry.'],
      ['Every account in the ledger', 'Assets, liabilities and capital are not closed; their balances go to the balance sheet.'],
      ['Only the cash and bank accounts', 'Cash and bank are assets; their balances are carried forward.'],
    ],
    explanation: 'Closing entries transfer the balances of the nominal accounts to the trading and profit and loss accounts; the real and personal accounts are carried forward.',
  },
  {
    prompt: 'Which balances does the opening entry of the new year bring into the books?',
    correct: 'Those of the assets, the liabilities and the capital, as the balance sheet shows them',
    wrong: [
      ['Those of the expenses and incomes of the last year', 'They were closed to the profit and loss account and start the new year at nothing.'],
      ['Only the cash and bank balances', 'Every asset and liability is brought forward, not cash and bank alone.'],
      ['Only the net profit of the last year', 'The profit has already been added to the capital, which is brought forward with the rest.'],
    ],
    explanation: 'The opening entry debits each asset and credits each liability and the capital with its balance on the last balance sheet.',
  },
  {
    prompt: 'In a computerised accounting system, how is the profit and loss account prepared once the adjusting entries are in?',
    correct: 'The system draws it up from the ledger balances under the groups of incomes and expenses',
    wrong: [
      ['The accountant types each figure into it by hand', 'The system builds it from the ledgers; nothing is typed again.'],
      ['It is copied from the balance sheet', 'The balance sheet shows assets, liabilities and capital, not incomes and expenses.'],
      ['It is prepared only after the next year has begun', 'It can be drawn up at any moment from the entries made so far.'],
    ],
    explanation: 'Each ledger is created under a group, and each group has its place in the final accounts; the report is built from them at once.',
  },
  {
    prompt: 'Where does Outstanding Salaries A/c appear in the reports of a computerised accounting system?',
    correct: 'In the balance sheet, among the current liabilities',
    wrong: [
      ['In the profit and loss account, among the indirect expenses', 'The salaries of the year are there; the amount still owed is a liability.'],
      ['In the balance sheet, among the current assets', 'An amount owed is a liability, not an asset.'],
      ['In the trading account, among the direct expenses', 'Office salaries are not a direct expense, and an amount owed is not an expense at all.'],
    ],
    explanation: 'Outstanding Salaries A/c is created under Current Liabilities, so it is reported among them in the balance sheet.',
  },
  {
    prompt: 'Why are adjusting entries entered before the final accounts are drawn up from a computerised system?',
    correct: 'So that the profit and loss account shows the expenses and incomes that belong to the year, and the balance sheet the true assets and liabilities',
    wrong: [
      ['So that the trial balance agrees', 'The trial balance of a computerised system agrees already, since every voucher balances.'],
      ['So that the vouchers of the year are numbered', 'Vouchers are numbered as they are entered.'],
      ['So that the opening balances are entered', 'Opening balances belong to the start of the year, not the end.'],
    ],
    explanation: 'Outstanding and prepaid expenses, accrued income, income received in advance and depreciation are recorded so that each year bears its own expenses and incomes.',
  },
];

const casReports = mcqTemplate({
  id: 'cas-reports', topicId: T, conceptId: 'cas-final-accounts', difficulty: 'easy',
  generate: (rng) => {
    const f = rng.pick(REPORT_FACTS);
    return choice(f.prompt, f.correct, f.wrong, f.explanation, HINTS.entries);
  },
  verify: (q) => {
    const f = REPORT_FACTS.find((x) => x.prompt === q.prompt);
    return f !== undefined && optionText(q) === f.correct;
  },
});

// ===============================================================================================================
// Schedules to prepare as a sheet lays them out
// ===============================================================================================================

const FY = (start: number): string => `${start}-${String((start + 1) % 100).padStart(2, '0')}`;
const keptSln = keepFor<{ cost: number; salvage: number; life: number }>();

const casFmtSlnSchedule = statementTemplate({
  id: 'cas-fmt-sln-schedule', topicId: T, conceptId: 'cas-formats', difficulty: 'easy', version: 2,
  generate: (rng) => {
    const life = rng.int(3, 5), dep = amount(rng, 10000, 120000, 1000) / 100, salvage = amount(rng, 5000, 80000, 1000) / 100;
    const cost = dep * life + salvage;
    // A salvage value of at most a quarter of the cost, as an asset worn out over its life leaves.
    if (salvage > cost / 4) return null;
    const first = rng.pick([2021, 2022]);
    const asset = rng.pick(ASSETS);
    const firm = rng.pick(FIRMS);
    const data = [
      `${firm} bought a ${asset} on 1 April ${first} and depreciates it by the straight line method; its years end on 31 March.`,
      `B1 (cost): ${inr(cost)}`,
      `B2 (salvage value): ${inr(salvage)}`,
      `B3 (life in years): ${life}`,
      'Column C, depreciation: =SLN($B$1,$B$2,$B$3) in every year (SLN gives (cost - salvage value) ÷ life).',
      'Column D, accumulated depreciation: the depreciation of the year added to that of the years before.',
      'Column E, book value at the end of the year: cost less accumulated depreciation.',
    ].join('\n');
    keptSln.keep(data, { cost, salvage, life });
    return {
      task: `Prepare the depreciation schedule of the ${asset} for the ${life} years of its life, as the sheet sets it out.`,
      data,
      title: `Depreciation schedule of the ${asset} (straight line method)`,
      heading: 'Year',
      columns: ['Depreciation (₹)', { name: 'Accumulated depreciation (₹)', adds: false }, { name: 'Book value at the end of the year (₹)', adds: false }],
      rows: Array.from({ length: life }, (_, k) => ({ label: FY(first + k), amounts: [rupees(dep), rupees(dep * (k + 1)), rupees(cost - dep * (k + 1))] })),
      distractors: [FY(first - 1), FY(first + life), 'Salvage value'],
      explanation: [
        `Depreciation of each year = (${inr(cost)} - ${inr(salvage)}) ÷ ${life} = ${inr(dep)}.`,
        'Accumulated depreciation grows by that amount each year; the book value falls by it.',
        `At the end of the life the book value is the salvage value, ${inr(salvage)}.`,
      ],
      hints: HINTS.depreciation,
    };
  },
  verify: (q) => {
    const s = keptSln.of(q.data);
    if (!s || q.rows.length !== s.life) return false;
    // Each year's figures from the fraction of the life gone by.
    return q.rows.every((row, k) => {
      const gone = ((s.cost - s.salvage) * (k + 1)) / s.life;
      return row.amounts[0] === rupees((s.cost - s.salvage) / s.life) && row.amounts[1] === rupees(gone) && row.amounts[2] === rupees(s.cost - gone);
    }) && q.rows[s.life - 1].amounts[2] === rupees(s.salvage);
  },
});

const keptWdv = keepFor<{ cost: number; rate: number; years: number }>();

const casFmtWdvSchedule = statementTemplate({
  id: 'cas-fmt-wdv-schedule', topicId: T, conceptId: 'cas-formats', difficulty: 'medium',
  generate: (rng) => {
    const rate = rng.pick([10, 20, 25, 30, 40]), years = rng.int(3, 4);
    const cost = exactCost(rng, rate, years, 100000, 2500000);
    if (cost === null) return null;
    const rows = wdvYears(cost, rate, years);
    const first = rng.pick([2022, 2023]);
    const asset = rng.pick(ASSETS);
    const firm = rng.pick(FIRMS);
    const data = [
      `${firm} bought a ${asset} on 1 April ${first} for ${inr(cost)} and depreciates it by the written down value method; its years end on 31 March.`,
      `F1 (rate of depreciation): ${rate}%`,
      'Column B, book value at the start of the year: the cost in the first year, then the book value at the end of the year before.',
      'Column C, depreciation: the book value at the start of the year times $F$1.',
      'Column D, book value at the end of the year: B less C.',
    ].join('\n');
    keptWdv.keep(data, { cost, rate, years });
    return {
      task: `Prepare the depreciation schedule of the ${asset} for its first ${years} years, as the sheet sets it out.`,
      data,
      title: `Depreciation schedule of the ${asset} (written down value method)`,
      heading: 'Year',
      columns: [{ name: 'Book value at the start of the year (₹)', adds: false }, 'Depreciation (₹)', { name: 'Book value at the end of the year (₹)', adds: false }],
      rows: rows.map((r, k) => ({ label: FY(first + k), amounts: [rupees(r.start), rupees(r.dep), rupees(r.end)] })),
      distractors: [FY(first - 1), FY(first + years), 'Cost of the asset'],
      explanation: [
        ...rows.map((r, k) => `${FY(first + k)}: ${inr(r.start)} × ${rate}% = ${inr(r.dep)}; ${inr(r.start)} - ${inr(r.dep)} = ${inr(r.end)}.`),
        'The rate is charged on a falling book value, so the depreciation falls every year.',
      ],
      hints: HINTS.depreciation,
    };
  },
  verify: (q) => {
    const s = keptWdv.of(q.data);
    if (!s || q.rows.length !== s.years) return false;
    // The book value at the end of year k is the cost times (1 - rate)^k.
    return q.rows.every((row, k) => {
      const start = s.cost * (1 - s.rate / 100) ** k, end = s.cost * (1 - s.rate / 100) ** (k + 1);
      return row.amounts[0] === rupees(start) && row.amounts[2] === rupees(end) && row.amounts[1] === rupees(start - end);
    });
  },
});

const keptLoan = keepFor<{ loan: number; pct: number; instalment: number; years: number }>();

const casFmtLoanSchedule = statementTemplate({
  id: 'cas-fmt-loan-schedule', topicId: T, conceptId: 'cas-formats', difficulty: 'complex', version: 2,
  generate: (rng) => {
    const l = makeLoan(rng, 3, 4);
    if (!l) return null;
    const firm = rng.pick(FIRMS);
    const data = [
      `${firm} borrowed ${inr(l.loan)} on 1 April 2025 from ${rng.pick(LENDERS)} at ${l.rate} a year, repayable in ${l.years} equal instalments at the end of each year.`,
      `Instalment, as =PMT gives it, rounded to the nearest rupee: ${inr(l.instalment)}`,
      'Interest of a year = balance at the start of the year × the rate (what =IPMT gives), rounded to the nearest rupee.',
      'Principal repaid = instalment - interest (what =PPMT gives).',
      'Balance at the end of the year = balance at the start - principal repaid.',
      "The last instalment is adjusted: it repays exactly the balance left, with that year's interest.",
    ].join('\n');
    keptLoan.keep(data, { loan: l.loan, pct: l.pct, instalment: l.instalment, years: l.years });
    return {
      task: `Prepare the loan repayment schedule for the ${l.years} instalments, as a sheet sets it out.`,
      data,
      title: `Loan repayment schedule of ${firm}`,
      heading: 'Instalment',
      columns: [{ name: 'Balance at the start (₹)', adds: false }, 'Interest (₹)', 'Principal repaid (₹)', { name: 'Balance at the end (₹)', adds: false }],
      rows: l.rows.map((r, k) => ({ label: `Instalment ${k + 1}`, amounts: [rupees(r.open), rupees(r.interest), rupees(r.principal), rupees(r.close)] })),
      distractors: [`Instalment ${l.years + 1}`, 'Instalment 0', 'Total interest'],
      explanation: [
        ...l.rows.map((_, k) => loanRowLine(l, k + 1)),
        `The principal repaid adds up to the loan, ${inr(l.loan)}, and the balance after the last instalment is nil.`,
      ],
      hints: HINTS.loan,
    };
  },
  verify: (q) => {
    const s = keptLoan.of(q.data);
    if (!s || q.rows.length !== s.years) return false;
    const rows = scheduleOf(s.loan, s.pct, s.instalment, s.years);
    const ok = q.rows.every((row, k) => row.amounts[0] === rupees(rows[k].open) && row.amounts[1] === rupees(rows[k].interest) && row.amounts[2] === rupees(rows[k].principal) && row.amounts[3] === rupees(rows[k].close));
    // The instalment is PMT's rounded; the principal repaid adds up to the loan, and nothing is left.
    return ok && s.instalment === Math.round(pmtOf(s.loan, s.pct, s.years)) && q.rows.reduce((t, r) => t + r.amounts[2], 0) === rupees(s.loan) && q.rows[s.years - 1].amounts[3] === 0;
  },
});

/**
 * The long question of the Computerised Accounting paper: a round loan, its instalment found with PMT and rounded to
 * the nearest rupee, each year's interest rounded, and the last instalment adjusted so that the loan is repaid exactly.
 */
const casFmtLoanScheduleBoard = statementTemplate({
  id: 'cas-fmt-loan-schedule-board', topicId: T, conceptId: 'cas-formats', difficulty: 'complex',
  generate: (rng) => {
    const l = makeLoan(rng, 4, 5, 200000);
    if (!l) return null;
    const firm = rng.pick(FIRMS);
    const data = [
      `${firm} took a loan of ${inr(l.loan)} on 1 April 2025 from ${rng.pick(LENDERS)} at ${l.rate} a year, repayable in ${l.years} equal yearly instalments, each on 31 March. Its sheet:`,
      `B1 (loan): ${inr(l.loan)}`,
      `B2 (rate of interest a year): ${l.pct}%`,
      `B3 (number of instalments): ${l.years}`,
      `Instalment: =ROUND(PMT(B2,B3,-B1),0), the equal instalment PMT gives, rounded to the nearest rupee. (${PMT_SAYS}.)`,
      'Interest of a year: the balance at the start of the year × $B$2, rounded to the nearest rupee with ROUND(..., 0).',
      'Principal repaid: the instalment less the interest. Balance at the end: the balance at the start less the principal repaid.',
      "The last instalment is adjusted: it is the balance left at the start of the last year with that year's interest, so that the loan is repaid exactly.",
    ].join('\n');
    return {
      task: `Prepare the loan repayment schedule of ${firm} for the ${l.years} years: the instalment, the interest, the principal repaid and the balance at the end of each year.`,
      data,
      title: `Loan repayment schedule of ${firm}`,
      heading: 'Year',
      columns: ['Instalment (₹)', 'Interest (₹)', 'Principal repaid (₹)', { name: 'Balance at the end of the year (₹)', adds: false }],
      rows: l.rows.map((r, k) => ({ label: `Year ${k + 1}`, amounts: [rupees(r.instalment), rupees(r.interest), rupees(r.principal), rupees(r.close)] })),
      distractors: ['Year 0', `Year ${l.years + 1}`, 'Total interest'],
      explanation: [
        ...pmtLines(l),
        ...l.rows.map((_, k) => loanRowLine(l, k + 1)),
        `Check: the principal repaid adds up to the loan, ${inr(l.loan)}; the instalments add up to the loan and the interest together.`,
      ],
      hints: HINTS.loan,
    };
  },
  verify: (q) => {
    const c = cellsIn(q.data);
    const loan = c.get('B1')!, pct = c.get('B2')!, years = c.get('B3')!;
    if (q.rows.length !== years) return false;
    const instalment = Math.round(pmtOf(loan, pct, years));
    const rows = scheduleOf(loan, pct, instalment, years);
    const ok = q.rows.every((row, k) => row.amounts[0] === rupees(rows[k].instalment) && row.amounts[1] === rupees(rows[k].interest) && row.amounts[2] === rupees(rows[k].principal) && row.amounts[3] === rupees(rows[k].close));
    // Every instalment but the last is the rounded PMT; the principal adds up to the loan.
    return ok && q.rows.slice(0, -1).every((r) => r.amounts[0] === rupees(instalment)) && q.rows.reduce((t, r) => t + r.amounts[2], 0) === rupees(loan);
  },
});

// One-mark Assertion-Reason questions of the board. They stand on their own level and go into no mock paper and no
// Look back (`isAssertionReason`), so nothing that was served before moves.
const casAssertionReason = factsTemplate({
  id: 'cas-assertion-reason', topicId: 'computerised-accounting', conceptId: 'cas-overview', difficulty: 'medium',
  facts: assertionReasonFacts([
    {
      answer: 'both',
      assertion: 'Cell D2 holds =B2*$C$1. Copied to D3, it becomes =B3*$C$1.',
      reason: 'A relative reference moves with the copy, and an absolute reference never moves.',
      a: 'B2 moves down one row to B3, and $C$1 stays.',
      r: 'The $ fixes the column and the row.',
      link: 'R explains A: each reference behaves as its kind does.',
    },
    {
      answer: 'both',
      assertion: 'The formula =B2-B3/B4 does not give (B2 - B3) ÷ B4.',
      reason: 'A spreadsheet divides and multiplies before it adds and subtracts.',
      a: 'It works out B3/B4 first, and takes that from B2.',
      r: 'That is why a term that is a difference needs brackets.',
      link: 'R explains A: the division is done first, unless brackets say otherwise.',
    },
    {
      answer: 'both',
      assertion: 'Tailored accounting software costs more than generic software.',
      reason: 'Tailored software is written for one organisation alone.',
      a: 'Tailored software has the highest cost, and generic the lowest.',
      r: 'Generic software is sold off the shelf to many users.',
      link: 'R explains A: one user bears the whole cost of the writing.',
    },
    {
      answer: 'both',
      assertion: 'Cash withdrawn from the bank for office use is entered through a contra voucher.',
      reason: 'A contra voucher records money moved between cash and bank.',
      a: 'It is a transfer, with cash up and bank down.',
      r: 'Contra is the voucher for money moved between cash and bank, or between two banks.',
      link: 'R explains A: this withdrawal is such a movement.',
    },
    {
      answer: 'both',
      assertion: 'An audit trail helps to find who altered a voucher.',
      reason: 'An audit trail records who entered, altered or deleted each voucher, and when.',
      a: 'It is a security feature of the system.',
      r: 'The system logs the user and the time of every change to a voucher.',
      link: 'R explains A: the record is what lets the change be traced.',
    },
    {
      answer: 'bothNot',
      assertion: 'A line chart suits a figure that changes over time.',
      reason: 'A pie chart shows the parts of one whole.',
      a: 'The line shows the rise and fall.',
      r: 'Each slice is a part of the total.',
      link: 'R does not explain A: R is about a different chart.',
    },
    {
      answer: 'bothNot',
      assertion: 'Back-up and restore guard against the loss of data.',
      reason: 'Passwords keep outsiders out of the system.',
      a: 'A copy of the data can be brought back after a failure.',
      r: 'Only a person with the password can get in.',
      link: 'R does not explain A: both are security features, but a password does not recover lost data.',
    },
    {
      answer: 'bothNot',
      assertion: 'Cells B2, B3 and B4 hold 10, 20 and 30. =AVERAGE(B2:B4) shows 20.',
      reason: '=COUNT(B2:B4) tells how many cells of the range hold numbers.',
      a: '(10 + 20 + 30) ÷ 3 = 20.',
      r: 'That is what COUNT does, and here it shows 3.',
      link: 'R does not explain A: AVERAGE does its own work, and R describes another function.',
    },
    {
      answer: 'aOnly',
      assertion: '=SLN(100000, 10000, 5), which gives straight line depreciation for cost, salvage value and life, shows 18,000.',
      reason: 'SLN works on the book value at the start of each year, so it gives a smaller figure every year.',
      a: '(1,00,000 - 10,000) ÷ 5 = 18,000.',
      r: 'That describes written down value. SLN gives the same figure every year.',
    },
    {
      answer: 'aOnly',
      assertion: 'Goods returned to a supplier are entered through a debit note.',
      reason: 'A debit note records goods returned by a customer.',
      a: 'A debit note is for goods returned to a supplier.',
      r: 'Goods returned by a customer go through a credit note.',
    },
    {
      answer: 'rOnly',
      assertion: 'A computerised accounting system catches every mistake made at data entry.',
      reason: 'A computerised accounting system cannot check for errors it was not told to look for.',
      a: 'A wrong figure that passes every check goes through; this is a limitation of the system.',
      r: 'It checks only by the rules it is given.',
    },
    {
      answer: 'rOnly',
      assertion: 'Keeping the codes 100-199 for assets and 200-299 for liabilities is mnemonic coding.',
      reason: 'Mnemonic codes use letters that remind the user of the account.',
      a: 'A range kept for each class is block coding.',
      r: 'SD for Sundry Debtors is an example.',
    },
  ]),
});

const templates: Template[] = [
  casFeature, casLimitation, casStructure, casPackage,
  casRangeCells, casFormulaResult, casIfFormula, casFunctionChoice, casCopyFormula, casMixedReference, casMixedValue,
  casSln, casSlnSchedule, casWdvSchedule, casDb, casDbRate, casPmt, casLoanSplit, casLoanBalance,
  casPmtFormula, casPayrollIf, casPayrollFormula,
  casBrsSheet, casBrsFormula, casRatioCells, casRatioFormula,
  casChart, casPieAngle,
  casLedgerCode, casCodeLedger, casCodeType, casLedgerGroup, casHierarchy, casInstall,
  casVoucher, casValidation, casSecurity,
  casAdjusting, casAdjustingWorked, casClosing, casOpening, casClosingCapital, casReports,
  casFmtSlnSchedule, casFmtWdvSchedule, casFmtLoanSchedule, casFmtLoanScheduleBoard,
  casAssertionReason,
];

/** What the case studies of the topic reuse (cases/computerised-accounting-cases.ts). Nothing here changes a question above. */
export const CAS_CASE = {
  FIRMS, CUSTOMERS, SUPPLIERS, ASSETS, LENDERS, HINTS, BRS_ITEMS, BRS_START, CHECKS, SECURITY, SCHEME_RULE, SLN_SAYS, DB_SAYS, PMT_SAYS, LOAN_ROUNDING, YEAR_END, VIA,
  PKG_NAME, PKG_TRAITS, PKGS, VOUCHERS, VOUCHER_CASES,
  inr, dec, amountsIn, cellsIn, optionText, cap, lower, typed, choice, dr, cr, sideTotal,
  exactCost, wdvYears, dbCase, makeLoan, scheduleOf, pmtOf, pmtLines, loanRowLine, inrPaise, brsSheet, brsLines, brsTarget, brsFromPrompt, codeScheme, schemeLines, codeFromPrompt,
};
export type { BrsItem as CasBrsItem, BrsSheet as CasBrsSheet, CodeScheme as CasCodeScheme, Err as CasErr, Loan as CasLoan, Wrong as CasWrong };

export default templates;
