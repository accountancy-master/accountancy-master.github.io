import type { Difficulty, McqQuestion } from '@/content/types';
import type { Rng } from '@/engine/rng';
import { parseRupees } from '@/lib/money-input';
import { factsTemplate, formatINR, mcqTemplate, numericTemplate, rupees } from '../authoring';
import type { Distractor, McqTemplate, Template } from '../types';
import { assertionReasonTemplate } from '../assertionReason';

const T = 'introduction-to-accounting';

// Concept ids of the pack (src/content/cbse11/introduction-to-accounting.ts).
const C_MEANING = 'ia-meaning';
const C_PROCESS = 'ia-process';
const C_USERS = 'ia-users';
const C_QUALITIES = 'ia-qualities';
const C_ASSETS = 'ia-assets-liabilities';
const C_INCOME = 'ia-income-expense';
const C_TRADE = 'ia-trade-terms';

// ---------------------------------------------------------------------------------------------------------------
// Small helpers.
// ---------------------------------------------------------------------------------------------------------------

/** An amount as formatINR writes it: a rupee sign, digits and commas, never a comma or full stop that follows it. */
const RUPEE = /₹\d(?:[\d,]*\d)?/g;
/** The amounts written in a prompt, in order, in paise. */
const amountsIn = (s: string): number[] => (s.match(RUPEE) ?? []).map((x) => parseRupees(x) ?? -1);
const firstAmount = (s: string): string => s.match(RUPEE)?.[0] ?? '';
const fill = (text: string, a: string): string => text.split('{a}').join(a);
const cap = (s: string): string => s.charAt(0).toUpperCase() + s.slice(1);
const lc = (s: string): string => s.charAt(0).toLowerCase() + s.slice(1);
const rs = (rng: Rng, min: number, max: number, step: number): number => rng.step(min, max, step);
const money = (rupeeValue: number): string => formatINR(rupees(rupeeValue));
const correctText = (q: McqQuestion): string | undefined => q.options.find((o) => o.id === q.correct)?.text;
const sum = (xs: number[]): number => xs.reduce((s, x) => s + x, 0);
/** A generator whose every question carries the two hints given. */
const withHints =
  <P extends object>(hints: string[], generate: (rng: Rng) => P | null) =>
  (rng: Rng): (P & { hints: string[] }) | null => {
    const made = generate(rng);
    return made === null ? null : { ...made, hints };
  };

// ---------------------------------------------------------------------------------------------------------------
// A bank of items, each with one right label, and the mcq built from it. Every wrong label is a real mistake:
// "treated it as <what that label means>, but it <what is true of this item>".
// ---------------------------------------------------------------------------------------------------------------

interface Item<K extends string> {
  kind: K;
  /** A self-contained description with no full stop at the end; "{a}" is replaced by a random amount. */
  text: string;
  /** A verb phrase saying why the item belongs to its label ("is held for sale within the year"). */
  fact: string;
  /** Its own amount range, where the range of its kind would not fit it (a cash discount is never ₹2 lakh). */
  range?: Range;
}
/** [lowest, highest, step] in rupees: what a plausible amount for an item of this kind looks like. */
type Range = [number, number, number];
const ANY: Range = [5000, 900000, 5000];

interface Label {
  label: string;
  /** What choosing this label means, as it reads after "Treated it as". */
  taken: string;
}

function labelled<K extends string>(cfg: {
  id: string;
  version?: number;
  conceptId: string;
  difficulty: Difficulty;
  bank: Item<K>[];
  labels: Record<K, Label>;
  /** Amount range by the kind of the item, so that a van never costs ₹5,000 and a month's rent never ₹8 lakh. */
  range?: Partial<Record<K, Range>>;
  ask: (text: string) => string;
  hints: string[];
}): McqTemplate {
  const kinds = Object.keys(cfg.labels) as K[];
  return mcqTemplate({
    id: cfg.id,
    ...(cfg.version === undefined ? {} : { version: cfg.version }),
    topicId: T,
    conceptId: cfg.conceptId,
    difficulty: cfg.difficulty,
    generate: (rng) => {
      const item = rng.pick(cfg.bank);
      const [lo, hi, st] = item.range ?? cfg.range?.[item.kind] ?? ANY;
      const text = fill(item.text, money(rs(rng, lo, hi, st)));
      return {
        prompt: cfg.ask(text),
        correct: cfg.labels[item.kind].label,
        distractors: kinds
          .filter((k) => k !== item.kind)
          .map((k) => ({ text: cfg.labels[k].label, why: `Treated it as ${cfg.labels[k].taken}, but it ${item.fact}.` })),
        explanation: `${cfg.labels[item.kind].label}: it ${item.fact}.`,
        hints: cfg.hints,
      };
    },
    // Independent check: find the bank item whose text sits in the prompt and compare its label with the right option.
    verify: (q) => {
      const a = firstAmount(q.prompt);
      const found = cfg.bank.filter((i) => q.prompt.includes(fill(i.text, a))).sort((x, y) => y.text.length - x.text.length)[0];
      return found !== undefined && correctText(q) === cfg.labels[found.kind].label;
    },
  });
}

// ---------------------------------------------------------------------------------------------------------------
// Classify an item: current or non-current asset, current or non-current liability, capital, income, expense.
// ---------------------------------------------------------------------------------------------------------------

type K7 = 'ca' | 'nca' | 'cl' | 'ncl' | 'cap' | 'inc' | 'exp';
const LABELS7: Record<K7, Label> = {
  ca: { label: 'Current asset', taken: 'a current asset (owned, and turned into cash or used up within a year)' },
  nca: { label: 'Non-current asset', taken: 'a non-current asset (owned and kept in use for many years)' },
  cl: { label: 'Current liability', taken: 'a current liability (owed to an outsider, and due within a year)' },
  ncl: { label: 'Non-current liability', taken: 'a non-current liability (owed to an outsider, and not due for more than a year)' },
  cap: { label: 'Capital', taken: "capital (the owner's own stake in the business, owed to the owner and not to an outsider)" },
  inc: { label: 'Income (revenue)', taken: 'an income (earned, so it adds to profit)' },
  exp: { label: 'Expense', taken: 'an expense (a cost of running the business, so it reduces profit)' },
};
const RANGE7: Record<K7, Range> = {
  ca: [10000, 300000, 5000],
  nca: [100000, 900000, 25000],
  cl: [10000, 300000, 5000],
  ncl: [200000, 900000, 50000],
  cap: [50000, 900000, 10000],
  inc: [10000, 200000, 5000],
  exp: [10000, 100000, 5000],
};
const i7 = (kind: K7, text: string, fact: string, range?: Range): Item<K7> => ({ kind, text, fact, ...(range === undefined ? {} : { range }) });
// The capital items are worded as the owner's stake, never as the cash or furniture he brought in: that cash or
// furniture is itself an asset of the business, so "cash put in by the owner" could be defended as a current asset.
const OWNER_STAKE = 'is the owner\'s own investment in the business, which the business owes to the owner and not to an outsider';

const BANK7: Item<K7>[] = [
  i7('ca', 'Goods worth {a} lying unsold in a kirana shop at the end of the year', 'is held for sale and will be sold within the year'),
  i7('ca', '{a} due from customers who bought goods on credit from a hardware store', 'is money that customers owe and it is expected to be collected within the year'),
  i7('ca', 'A bill of exchange for {a} accepted by a customer, due for payment in three months', 'is a claim on a customer that falls due in three months, so it turns into cash within the year'),
  i7('ca', 'Cash of {a} kept in the shop\'s cash box', 'is cash itself, which can be spent at once'),
  i7('ca', 'A balance of {a} in the firm\'s current account with a bank', 'is money in the bank that can be withdrawn at any time'),
  i7('ca', 'An advance of {a} paid to a supplier for goods due to arrive next month', 'is a short-term claim: the goods will arrive, or the money come back, within the year'),
  i7('nca', 'A delivery van bought for {a} by a bakery to take cakes to shops', 'is bought to be used over many years in the business, not to be sold'),
  i7('nca', 'Machinery worth {a} installed in a flour mill', 'is bought to be used over many years in the business, not to be sold'),
  i7('nca', 'Office furniture costing {a} in a coaching institute', 'is kept for many years to be used in the work of the institute'),
  i7('nca', 'A building worth {a}, owned by a trader, in which the trader runs the shop', 'is a long-lived property that the business uses and does not sell'),
  i7('nca', 'Computers costing {a} used in the accounts department of a firm', 'is kept for use over several years, not for resale'),
  i7('nca', 'Goodwill of {a} paid for taking over an established tailoring shop', 'is a long-term asset with no physical form: the extra value of a well-known business'),
  i7('nca', 'A patent bought for {a} to make a special type of lock', 'is a long-term right with no physical form that the business will use for many years'),
  i7('nca', 'Land bought for {a} on which a factory will be built', 'is a long-lived property that the business uses and does not sell'),
  i7('nca', 'A trademark purchased for {a} by a biscuit manufacturer', 'is a long-term right with no physical form that the business will use for many years'),
  i7('cl', '{a} owed to suppliers from whom goods were bought on credit', 'is owed to suppliers and has to be paid within the credit period, which is under a year'),
  i7('cl', 'A bill of exchange for {a} accepted by the business in favour of a supplier, payable in two months', 'is a promise to pay a supplier within two months'),
  i7('cl', 'A bank overdraft of {a} on the firm\'s current account', 'is owed to the bank and is repayable on demand'),
  i7('cl', 'The amount of {a} still owed to the staff at the year end for last month\'s salaries', 'is owed to the staff and will be paid in the coming month'),
  i7('cl', 'An advance of {a} received from a customer for goods to be supplied next month', 'will be settled within the year by supplying the goods or refunding the money'),
  i7('ncl', 'A bank loan of {a} that is repayable after five years', 'is owed to an outsider and is not due for more than a year'),
  i7('ncl', 'A loan of {a} taken from a financial institution, to be repaid after four years', 'is owed to an outsider and is not due for more than a year'),
  i7('ncl', 'A loan of {a} from a friend of the owner, not to be repaid for six years', 'is owed to an outsider and is not due for more than a year'),
  i7('ncl', 'A term loan of {a} taken to build a warehouse, repayable after seven years', 'is owed to an outsider and is not due for more than a year'),
  i7('cap', 'The owner\'s stake of {a} in a newly started business, arising from the savings the owner put into it', OWNER_STAKE),
  i7('cap', 'The owner\'s stake of {a} in the business, arising from further money the owner put into it during the year', OWNER_STAKE),
  i7('cap', 'Anita Joshi\'s stake of {a} in Joshi Boutique, arising from the savings with which Anita started it', OWNER_STAKE),
  i7('cap', 'The amount of {a} that a stationery shop owes to its proprietor for the money the proprietor has invested in it', OWNER_STAKE),
  i7('inc', 'Sales of goods worth {a} made during the year', 'is earned from selling goods, so it adds to profit'),
  i7('inc', 'Commission of {a} earned by a firm for selling another firm\'s products', 'is earned for a service the firm gave, so it adds to profit'),
  i7('inc', 'Interest of {a} received on the firm\'s fixed deposit with a bank', 'is earned on the firm\'s money lying in the bank, so it adds to profit'),
  i7('inc', 'Rent of {a} received from a tenant who has taken part of the firm\'s building', 'is earned by letting out part of the premises, so it adds to profit'),
  // A cash discount is a small part of a bill: it has a range of its own.
  i7('inc', 'A discount of {a} received from a supplier for paying earlier than the due date', 'is a benefit the business earned, so it adds to profit', [500, 10000, 500]),
  i7('exp', 'Rent of {a} paid for the shop premises', 'is a cost of running the business that is used up in earning revenue'),
  i7('exp', 'Salaries of {a} paid to the staff of a showroom', 'is a cost of running the business that is used up in earning revenue'),
  i7('exp', 'Electricity charges of {a} paid for a workshop', 'is a cost of running the business that is used up in earning revenue'),
  i7('exp', 'Charges of {a} paid for a newspaper advertisement', 'is a cost of running the business that is used up in earning revenue'),
  i7('exp', 'Interest of {a} paid on a bank loan', 'is the price of using borrowed money and reduces profit'),
  i7('exp', 'Routine repairs of {a} carried out during the year on machinery already in use', 'is a cost of keeping the machinery working, which reduces profit'),
  i7('exp', 'Carriage of {a} paid on goods sent to customers', 'is a cost of delivering goods to customers and reduces profit'),
];

const HINT7 = [
  'Ask whether the item is owned, owed, put in by the owner, earned or spent, and how soon it is used up or paid.',
  'Assets are owned; liabilities are owed to outsiders; capital is the owner\'s own stake, owed to the owner; incomes are earned; expenses are costs of earning.',
];

// Version 2: the cash discount received has a range of its own (₹500 to ₹10,000), and the bank is worded without
// "he" or "she". Both templates that draw on BANK7 moved to version 2 together.
const iaClassifyItem = labelled({
  id: 'ia-classify-item',
  version: 2,
  conceptId: C_ASSETS,
  difficulty: 'easy',
  bank: BANK7,
  labels: LABELS7,
  range: RANGE7,
  ask: (text) => `Classify the following item in the books of the business concerned: ${text}.`,
  hints: HINT7,
});

// ---------------------------------------------------------------------------------------------------------------
// Classify an asset: tangible or intangible non-current, current, or not an asset at all.
// ---------------------------------------------------------------------------------------------------------------

type KA = 'nt' | 'ni' | 'cu' | 'no';
const LABELS_A: Record<KA, Label> = {
  nt: { label: 'Non-current asset: tangible', taken: 'a physical asset kept for many years' },
  ni: { label: 'Non-current asset: intangible', taken: 'a long-term asset with no physical form' },
  cu: { label: 'Current asset', taken: 'a current asset, to be sold, collected or used up within a year' },
  no: { label: 'Not an asset: it is a claim against the business', taken: 'something the business owes, and so not an asset at all' },
};
const ia = (kind: KA, text: string, fact: string): Item<KA> => ({ kind, text, fact });
const TANGIBLE = 'can be seen and touched and is kept in use for many years';
const INTANGIBLE = 'has no physical form but gives the business a lasting benefit';
const CURRENT = 'will be sold, collected or used within a year';
const CLAIM = 'is something the business owes, so it is a claim on its assets and not an asset';

const BANK_A: Item<KA>[] = [
  ia('nt', 'Land of {a} owned by a manufacturer for building its factory', TANGIBLE),
  ia('nt', 'A shop building worth {a} owned by a cloth merchant', TANGIBLE),
  ia('nt', 'A packing machine worth {a} in a spice factory', TANGIBLE),
  ia('nt', 'Showroom furniture worth {a} owned by a mobile dealer', TANGIBLE),
  ia('nt', 'A delivery van worth {a} owned by a dairy', TANGIBLE),
  ia('nt', 'Computers and printers worth {a} in a coaching institute\'s office', TANGIBLE),
  ia('ni', 'Goodwill of {a} paid for an established sweet shop', INTANGIBLE),
  ia('ni', 'A patent of {a} bought for a new process of making paper', INTANGIBLE),
  ia('ni', 'A trademark of {a} bought by a tea company', INTANGIBLE),
  ia('ni', 'Copyright of {a} bought by a publisher for a textbook', INTANGIBLE),
  ia('ni', 'Accounting software licence of {a} bought for use in the firm over several years', INTANGIBLE),
  ia('cu', 'Goods worth {a} held in stock by a grocer for sale', CURRENT),
  ia('cu', '{a} due from customers of a stationery wholesaler', CURRENT),
  ia('cu', 'A bill of exchange for {a} accepted by a customer and due in two months', CURRENT),
  ia('cu', 'Cash of {a} in the firm\'s cash box', CURRENT),
  ia('cu', 'A balance of {a} in the firm\'s bank account', CURRENT),
  ia('no', '{a} owed to suppliers for goods bought on credit', CLAIM),
  ia('no', 'A bank loan of {a} taken to buy machinery', CLAIM),
  ia('no', 'A bill of exchange for {a} that the firm has accepted in favour of a supplier', CLAIM),
  ia('no', 'Capital of {a} invested by the owner', 'is what the business owes the owner, so it is a claim on the assets and not an asset'),
  ia('no', 'Wages of {a} due to workers but not yet paid', CLAIM),
];

const iaAssetClass = labelled({
  id: 'ia-asset-class',
  conceptId: C_ASSETS,
  difficulty: 'medium',
  bank: BANK_A,
  labels: LABELS_A,
  range: { nt: [100000, 900000, 25000], ni: [100000, 900000, 25000], cu: [10000, 300000, 5000], no: [20000, 400000, 5000] },
  ask: (text) => `Which heading fits this item best? ${text}.`,
  hints: [
    'First decide whether the business owns it or owes it. Then ask whether it lasts for years, and whether it can be touched.',
    'Tangible non-current assets have physical form; intangible ones do not; current assets turn into cash or are used up within a year.',
  ],
});

// ---------------------------------------------------------------------------------------------------------------
// Classify a liability: current, non-current, capital, or not a liability.
// ---------------------------------------------------------------------------------------------------------------

type KL = 'cl' | 'ncl' | 'cap' | 'na';
const LABELS_L: Record<KL, Label> = {
  cl: { label: 'Current liability', taken: 'a current liability (owed and due within a year)' },
  ncl: { label: 'Non-current liability', taken: 'a non-current liability (owed and due after more than a year)' },
  cap: { label: 'Capital (the owner\'s claim)', taken: 'capital (the owner\'s own claim on the business)' },
  na: { label: 'Not a liability: it is an asset', taken: 'something the business owns or is owed, and so not a liability at all' },
};
const il = (kind: KL, text: string, fact: string): Item<KL> => ({ kind, text, fact });
const DUE_SOON = 'is owed to an outsider and falls due within a year';
const DUE_LATE = 'is owed to an outsider but is not due for more than a year';
const OWNERS = 'is the owner\'s own stake in the business, owed to the owner and not to an outsider';
const OWNED = 'is something the business owns or is owed, so it is an asset';

const BANK_L: Item<KL>[] = [
  il('cl', '{a} owed to a supplier for goods bought on credit', DUE_SOON),
  il('cl', 'A bill of exchange for {a} accepted by the firm, payable in 45 days', DUE_SOON),
  il('cl', 'A bank overdraft of {a}, repayable on demand', DUE_SOON),
  il('cl', 'Rent of {a} for last month, due to the landlord and not yet paid', DUE_SOON),
  il('cl', 'A short-term bank loan of {a} that has to be repaid in nine months', DUE_SOON),
  il('cl', 'An advance of {a} received from a customer for goods yet to be delivered', 'will be settled within the year by delivering the goods or refunding the money'),
  il('ncl', 'A bank loan of {a} repayable after six years', DUE_LATE),
  il('ncl', 'A loan of {a} from a relative of the owner, repayable after three years', DUE_LATE),
  il('ncl', 'A term loan of {a} from a financial institution, repayable after ten years', DUE_LATE),
  il('ncl', 'A loan of {a} taken to buy a delivery van, to be repaid after five years', DUE_LATE),
  il('cap', 'The owner\'s stake of {a} in the business, arising from the cash the owner invested at the start', OWNERS),
  il('cap', 'The amount of {a} that the business owes to its owner for fresh money the owner brought in during the year', OWNERS),
  il('cap', 'The amount of {a} that a newly opened clinic owes to its owner, a doctor, for the savings the doctor put into it', OWNERS),
  il('na', '{a} due from a customer who bought goods on credit', OWNED),
  il('na', 'A bill of exchange for {a} accepted by a customer in favour of the firm', OWNED),
  il('na', 'A balance of {a} lying in the firm\'s bank account', OWNED),
  il('na', 'Goods worth {a} in the firm\'s godown', OWNED),
  il('na', 'An advance of {a} paid to a supplier for goods yet to arrive', OWNED),
];

// Version 2: the bank of liabilities is worded without "he" or "she".
const iaLiabilityClass = labelled({
  id: 'ia-liability-class',
  version: 2,
  conceptId: C_ASSETS,
  difficulty: 'medium',
  bank: BANK_L,
  labels: LABELS_L,
  range: { cl: [10000, 300000, 5000], ncl: [200000, 900000, 50000], cap: [50000, 900000, 10000], na: [10000, 300000, 5000] },
  ask: (text) => `Which heading fits this item best? ${text}. (Take the owner's claim as capital, not as a liability to outsiders.)`,
  hints: [
    'Is the amount owed to the owner, to an outsider, or is it owed to the business?',
    'An amount owed to an outsider within a year is current; after a year, non-current. What the owner has put in is capital. What the business is owed is an asset.',
  ],
});

// ---------------------------------------------------------------------------------------------------------------
// Capital or revenue expenditure, capital or revenue receipt.
// ---------------------------------------------------------------------------------------------------------------

type KE = 'cx' | 'rx' | 'cr' | 'rr';
const LABELS_E: Record<KE, Label> = {
  cx: { label: 'Capital expenditure', taken: 'capital expenditure (spending that buys or improves a long-lasting asset)' },
  rx: { label: 'Revenue expenditure', taken: 'revenue expenditure (day-to-day spending whose benefit is used up within the year)' },
  cr: { label: 'Capital receipt', taken: 'a capital receipt (money from the owner, a loan or the sale of a long-term asset)' },
  rr: { label: 'Revenue receipt', taken: 'a revenue receipt (money earned from the regular activity of the business)' },
};
const ie = (kind: KE, text: string, fact: string): Item<KE> => ({ kind, text, fact });
const LASTING = 'buys or improves an asset that will serve the business for many years';
const RUNNING = 'is a running cost whose benefit is used up within the year';

const BANK_E: Item<KE>[] = [
  ie('cx', 'A transport firm buys a new truck for {a}', LASTING),
  ie('cx', '{a} is spent on carriage and installation of a newly bought machine before it starts work', 'is a cost of getting the machine ready for use, so it adds to the cost of a long-lasting asset'),
  ie('cx', '{a} is paid as legal fees for registering a plot of land bought for the firm', 'is a cost of acquiring land, so it adds to the cost of a long-lasting asset'),
  ie('cx', 'A bakery pays {a} to add one more room to its shop building', LASTING),
  ie('cx', '{a} is spent on repairing a second-hand machine, just after buying it, to make it fit for use', 'is needed to bring the asset into working condition, so it adds to the cost of the asset'),
  ie('cx', 'A school buys computers for its laboratory costing {a}', LASTING),
  ie('cx', 'A firm pays {a} as wages to its own workers for building a new storeroom', 'is a cost of creating a lasting asset for the firm'),
  ie('rx', '{a} is paid as the monthly rent of the shop', RUNNING),
  ie('rx', '{a} is spent on routine repairs of the delivery van', 'only keeps an existing asset in working order and the benefit is used up within the year'),
  ie('rx', 'A grocer buys goods worth {a} to sell to customers', 'is the cost of goods that will be resold within the year'),
  ie('rx', '{a} is paid as salaries to the shop staff', RUNNING),
  ie('rx', '{a} is spent on whitewashing the office, as is done every year', RUNNING),
  ie('rx', '{a} is paid for fuel for the firm\'s delivery van', RUNNING),
  ie('rx', '{a} is spent on a newspaper advertisement', RUNNING),
  ie('rx', '{a} is paid for the electricity used in the factory', RUNNING),
  ie('cr', 'The owner brings {a} into the firm as additional capital', 'comes from the owner and is not earned from trading'),
  ie('cr', 'A firm takes a bank loan of {a}, repayable after five years', 'comes from a loan, which has to be repaid, and is not earned from trading'),
  ie('cr', 'A firm sells an old machine for {a}', 'comes from selling a long-term asset and not from regular trading'),
  ie('cr', 'A firm sells a part of its long-term investments for {a}', 'comes from selling a long-term asset and not from regular trading'),
  ie('rr', 'A shop receives {a} from customers for goods sold', 'is earned from the regular activity of the business'),
  ie('rr', 'A firm receives {a} as commission for its selling services', 'is earned from the regular activity of the business'),
  ie('rr', 'A firm receives {a} as interest on its bank deposit', 'is earned on the firm\'s money lying in the bank, so it is income of the year'),
  ie('rr', 'A firm receives {a} as rent from a tenant who uses part of its premises', 'is earned by letting out the premises, so it is income of the year'),
];

const iaExpType = labelled({
  id: 'ia-exp-type',
  conceptId: C_INCOME,
  difficulty: 'medium',
  bank: BANK_E,
  labels: LABELS_E,
  range: { cx: [50000, 900000, 10000], rx: [5000, 100000, 5000], cr: [50000, 900000, 10000], rr: [5000, 200000, 5000] },
  ask: (text) => `${text}. How is this item classified?`,
  hints: [
    'Is money going out or coming in? Then ask whether it relates to a long-lasting asset, the owner or a loan, or to the day-to-day trading of the year.',
    'Capital items concern assets, the owner or borrowings. Revenue items concern the ordinary running and trading of the business.',
  ],
});

// ---------------------------------------------------------------------------------------------------------------
// Goods or asset, for a given kind of business: the same item can be stock for one firm and an asset for another.
// ---------------------------------------------------------------------------------------------------------------

type KG = 'g' | 'a' | 'e' | 'd';
const LABELS_G: Record<KG, Label> = {
  g: { label: 'Goods (recorded as purchases)', taken: 'goods, that is, items bought to be resold' },
  a: { label: 'Non-current asset', taken: 'an asset kept for use in the business over many years' },
  e: { label: 'Expense', taken: 'an expense (something used up in the daily work of the business)' },
  d: { label: 'Drawings', taken: 'drawings (something the owner takes for personal use)' },
};
const ig = (kind: KG, text: string, fact: string): Item<KG> => ({ kind, text, fact });
const RESALE = 'is bought only to be resold at a profit';
const KEPT = 'is bought to be used in the business for many years, not to be sold';
const USED_UP = 'is used up in the daily work of the business and is neither resold nor kept for years';
const PERSONAL = 'goes out of the business for the owner\'s personal use';

const BANK_G: Item<KG>[] = [
  ig('g', 'A car dealer buys four new cars for {a} to sell to customers', RESALE),
  ig('g', 'A furniture dealer buys sofa sets worth {a} to sell in its showroom', RESALE),
  ig('g', 'A stationery shop buys pens and notebooks worth {a} to sell to students', RESALE),
  ig('g', 'A computer dealer buys laptops worth {a} to sell to customers', RESALE),
  ig('g', 'A mobile shop buys phones worth {a} to sell', RESALE),
  ig('g', 'A machinery dealer buys lathe machines worth {a} to sell to factories', RESALE),
  ig('a', 'A grocer buys a car for {a} to deliver orders to customers\' homes', KEPT),
  ig('a', 'A hotel buys sofa sets for {a} for its reception lounge', KEPT),
  ig('a', 'A coaching institute buys laptops worth {a} for its teachers to use', KEPT),
  ig('a', 'A garment maker buys sewing machines for {a} to stitch its garments', KEPT),
  ig('a', 'A car dealer buys computers for {a} for its billing counters and accounts office', KEPT),
  ig('a', 'A stationery shop buys steel racks and counters for {a} to display its goods', KEPT),
  ig('e', 'A school buys pens and notebooks worth {a} for its office staff to use', USED_UP),
  ig('e', 'A shop buys cleaning material worth {a} for the daily cleaning of its floor', USED_UP),
  ig('e', 'A clinic buys printing paper worth {a} for its reception counter', USED_UP),
  ig('d', 'The owner of a grocery shop takes rice worth {a} from the shop for the family\'s use at home', PERSONAL),
  ig('d', 'The proprietor of a mobile shop takes a phone worth {a} from the shop\'s stock as a gift for a nephew', PERSONAL),
  ig('d', 'The owner of a garment shop takes shirts worth {a} from the shop for personal use', PERSONAL),
];

// Version 2: the bank is worded without "he" or "his" (the house rule: no gendered pronouns).
const iaGoodsOrAsset = labelled({
  id: 'ia-goods-or-asset',
  version: 2,
  conceptId: C_TRADE,
  difficulty: 'medium',
  bank: BANK_G,
  labels: LABELS_G,
  range: { g: [100000, 900000, 10000], a: [150000, 600000, 10000], e: [5000, 40000, 5000], d: [2000, 30000, 1000] },
  ask: (text) => `${text}. How is this item treated in the books of the business concerned?`,
  hints: [
    'Ask what the business does with the item: sells it, keeps it for use, uses it up, or hands it to the owner.',
    'The same thing can be goods for one business and an asset for another; what matters is the purpose it is bought for.',
  ],
});

// ---------------------------------------------------------------------------------------------------------------
// Classify two items in one question: the indirect, multi-step version.
// ---------------------------------------------------------------------------------------------------------------

const iaClassifyTwo = mcqTemplate({
  id: 'ia-classify-two',
  version: 2,
  topicId: T,
  conceptId: C_ASSETS,
  difficulty: 'complex',
  generate: (rng) => {
    const first = rng.pick(BANK7);
    const second = rng.pick(BANK7.filter((i) => i.kind !== first.kind));
    const a1 = money(rs(rng, ...(first.range ?? RANGE7[first.kind])));
    const a2 = money(rs(rng, ...(second.range ?? RANGE7[second.kind])));
    const t1 = fill(first.text, a1);
    const t2 = fill(second.text, a2);
    const kinds = Object.keys(LABELS7) as K7[];
    const L = (k: K7): string => LABELS7[k].label;
    const pair = (x: K7, y: K7): string => `First: ${L(x)}; second: ${L(y)}`;
    const otherThan = (k: K7, also?: K7): K7 => rng.pick(kinds.filter((x) => x !== k && x !== also));
    const w1 = otherThan(first.kind, second.kind);
    const w2 = otherThan(second.kind, first.kind);
    const distractors: Distractor[] = [
      { text: pair(second.kind, first.kind), why: 'Mixed up which heading goes with which item: each heading was given to the wrong item.' },
      {
        text: pair(first.kind, w2),
        why: `The first is right, but the second was treated as ${LABELS7[w2].taken}, when it ${second.fact}.`,
      },
      {
        text: pair(w1, second.kind),
        why: `The second is right, but the first was treated as ${LABELS7[w1].taken}, when it ${first.fact}.`,
      },
      {
        text: pair(w1, w2),
        why: `Both are wrong: the first was treated as ${LABELS7[w1].taken} and the second as ${LABELS7[w2].taken}.`,
      },
    ];
    return {
      prompt: `Classify each item in the books of the business concerned. First: ${t1}. Second: ${t2}.`,
      correct: pair(first.kind, second.kind),
      distractors,
      explanation: `First: ${L(first.kind)}, because it ${first.fact}. Second: ${L(second.kind)}, because it ${second.fact}.`,
      hints: [
        'Classify the two items one at a time, and ignore the order of the headings in the options until you have both answers.',
        ...HINT7.slice(1),
      ],
    };
  },
  verify: (q) => {
    const [a1, a2] = (q.prompt.match(RUPEE) ?? []);
    if (a1 === undefined || a2 === undefined) return false;
    const first = BANK7.find((i) => q.prompt.includes(`First: ${fill(i.text, a1)}. Second:`));
    const second = BANK7.find((i) => q.prompt.endsWith(`Second: ${fill(i.text, a2)}.`));
    if (!first || !second) return false;
    return correctText(q) === `First: ${LABELS7[first.kind].label}; second: ${LABELS7[second.kind].label}`;
  },
});

// ---------------------------------------------------------------------------------------------------------------
// Loan timing: current or non-current liability by the time left to the due date (complex, with a distractor fact).
// ---------------------------------------------------------------------------------------------------------------

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const PURPOSES = ['machinery', 'a delivery van', 'a godown', 'office computers', 'a packing line'];
const FIRMS = ['Ravi Foods', 'Meena Textiles', 'Imran Traders', 'Kavita Pharma', 'Harpreet Auto Parts', 'Lata Printers', 'Gopal Hardware'];

const iaLoanTiming = mcqTemplate({
  id: 'ia-loan-timing',
  topicId: T,
  conceptId: C_ASSETS,
  difficulty: 'complex',
  generate: (rng) => {
    const year = rng.int(2025, 2028);
    const current = rng.next() < 0.5;
    const months = current ? rng.int(3, 9) : rng.int(15, 40);
    const total = 3 + months; // March is month 3
    const dueYear = year + Math.floor((total - 1) / 12);
    const dueMonth = ((total - 1) % 12) + 1;
    const lastDay = new Date(dueYear, dueMonth, 0).getDate();
    const due = `${lastDay} ${MONTHS[dueMonth - 1]} ${dueYear}`;
    const takenYear = year - rng.int(1, 3);
    const a = money(rs(rng, 100000, 900000, 50000));
    const label = current ? 'Current liability' : 'Non-current liability';
    const why = {
      wrongTerm: current
        ? 'Looked at the whole period of the loan, counted from the day it was taken, instead of the time left from the balance sheet date to the due date.'
        : 'Saw that it is a liability and ignored that the due date is more than twelve months after the balance sheet date.',
      asset: 'Classified the loan by what it paid for (an asset) instead of by what it is: an amount owed to the lender.',
      capital: 'Took borrowed money as the owner\'s investment, but the lender is an outsider, not the owner.',
      cash: 'Took the cash that came in from the loan as the item, when the item is the amount still owed.',
    };
    return {
      prompt: `On 1 April ${takenYear}, ${rng.pick(FIRMS)} took a bank loan of ${a} to buy ${rng.pick(PURPOSES)}. The whole loan is to be repaid in one payment on ${due}. How is the loan shown in the balance sheet as at 31 March ${year}?`,
      correct: label,
      distractors: [
        { text: current ? 'Non-current liability' : 'Current liability', why: why.wrongTerm },
        { text: 'Non-current asset', why: why.asset },
        { text: 'Capital', why: why.capital },
        { text: 'Current asset', why: why.cash },
      ],
      explanation: `The balance sheet date is 31 March ${year}. The due date, ${due}, is ${months} months later, ${current ? 'within' : 'more than'} twelve months, so the loan is a ${lc(label)}. The date of borrowing and the purpose do not matter.`,
      hints: [
        'Measure the time from the balance sheet date to the due date, not from the date the loan was taken.',
        'Owed and due within twelve months of the balance sheet date: current. Due after more than twelve months: non-current.',
      ],
    };
  },
  verify: (q) => {
    const m = /repaid in one payment on (\d+) (\w+) (\d{4})\. .* as at 31 March (\d{4})\?$/.exec(q.prompt);
    if (!m) return false;
    const monthsLeft = (Number(m[3]) - Number(m[4])) * 12 + (MONTHS.indexOf(m[2]) + 1) - 3;
    return correctText(q) === (monthsLeft <= 12 ? 'Current liability' : 'Non-current liability');
  },
});

// ---------------------------------------------------------------------------------------------------------------
// Users of accounting information.
// ---------------------------------------------------------------------------------------------------------------

type UserKind = 'internal' | 'external' | 'unclassified';
interface User {
  id: string;
  who: string;
  kind: UserKind;
  wants: [string, string];
}

const USERS: User[] = [
  { id: 'owner', who: 'The proprietor of the business', kind: 'internal', wants: ['how much profit the business has earned and how much of the owner\'s capital is still in it', 'whether the profit is enough for the owner to draw a living and still let the business grow'] },
  { id: 'sales', who: 'The sales manager of the business', kind: 'internal', wants: ['sales figures by product and area, to set targets and decide selling prices', 'which products bring in most revenue and which are slow to sell, to plan the next season\'s selling'] },
  { id: 'finance', who: 'The finance manager of the business', kind: 'internal', wants: ['the cash position and the payments falling due, to plan how funds will be found', 'how much cash will be needed next month to meet bills and expenses'] },
  { id: 'gm', who: 'The general manager of the business', kind: 'internal', wants: ['costs and profits of each department, to plan and control the work of the whole business', 'how the actual results of each department compare with the plan, so that corrective action can be taken'] },
  { id: 'investor', who: 'An investor who is thinking of putting money into the business', kind: 'external', wants: ['whether the business is profitable and its profits are likely to grow, before putting money in', 'how safe the money put into the business would be and what return it could earn'] },
  { id: 'lender', who: 'A bank that has given a loan to the business', kind: 'external', wants: ['whether the business can pay interest regularly and repay the loan on time', 'whether the business has enough assets and cash to repay what it has borrowed'] },
  { id: 'supplier', who: 'A supplier who sells goods to the business on credit', kind: 'external', wants: ['whether the business will pay for goods bought on credit within the credit period', 'how promptly the business paid its earlier bills, before more goods are sent on credit'] },
  { id: 'customer', who: 'A customer who depends on the business for regular supplies', kind: 'external', wants: ['whether the business is stable and will keep supplying goods and honouring its warranties', 'whether the business is likely to stay in operation so that supplies and after-sales service continue'] },
  { id: 'tax', who: 'The income-tax department', kind: 'external', wants: ['whether the profit shown in the books is correctly worked out, so that income tax can be assessed on it', 'whether the correct profit and sales have been reported, so that the right amount of tax is collected'] },
  { id: 'govt', who: 'A government agency that prepares statistics on industries', kind: 'external', wants: ['the output and employment of different industries, to plan policy', 'how the business sector is growing and how many people it employs'] },
  { id: 'research', who: 'A researcher studying firms in the industry', kind: 'external', wants: ['trends in the profits and costs of firms in the industry, for a research study', 'how firms of one industry have performed over the years, for a report'] },
  { id: 'employees', who: 'The employees of the business', kind: 'unclassified', wants: ['whether the business can keep paying wages and a bonus and keep their jobs secure', 'whether the business is doing well enough to pay a bonus and raise salaries'] },
];

/**
 * Pairs of users whose interests overlap too much to appear together as the right answer and a wrong option. A sole
 * proprietor also runs the business, so every manager's need (and a lender's, about repayment) can be defended for
 * the proprietor; the general manager shares the needs of the managers under him; the finance manager watches the
 * same payments as the lender and the supplier.
 */
const CLASH: [string, string][] = [
  ['owner', 'investor'], ['owner', 'gm'], ['owner', 'sales'], ['owner', 'finance'], ['owner', 'lender'], ['owner', 'employees'],
  ['gm', 'sales'], ['gm', 'finance'], ['finance', 'lender'], ['finance', 'supplier'],
  ['lender', 'supplier'], ['investor', 'lender'], ['tax', 'govt'], ['govt', 'research'],
];
const clashes = (a: User, b: User): boolean => CLASH.some(([x, y]) => (a.id === x && b.id === y) || (a.id === y && b.id === x));
const kindWord = (k: UserKind): string => (k === 'internal' ? 'Internal' : 'External');
const typed = USERS.filter((u) => u.kind !== 'unclassified');

// ia-user-profile, ia-user-need and ia-process-step are at version 2: the owner's needs and the activities are
// worded without "he" or "him".
const iaUserProfile = mcqTemplate({
  id: 'ia-user-profile',
  version: 2,
  topicId: T,
  conceptId: C_USERS,
  difficulty: 'easy',
  generate: (rng) => {
    const u = rng.pick(typed);
    const want = rng.pick(u.wants);
    const flip: UserKind = u.kind === 'internal' ? 'external' : 'internal';
    // The wrong interests come only from users whose needs this user could not claim as well (see CLASH).
    const [rightGroup, wrongGroup] = rng.shuffle(typed.filter((x) => x.id !== u.id && !clashes(u, x)));
    const otherWant = (x: User): string => rng.pick(x.wants);
    const option = (k: UserKind, w: string): string => `${kindWord(k)} user, who wants to know ${w}`;
    return {
      prompt: `Consider ${lc(u.who)}. Which statement about this user of accounting information is correct?`,
      correct: option(u.kind, want),
      distractors: [
        { text: option(flip, want), why: `Described the interest correctly but put the user in the wrong group: this user is ${u.kind === 'internal' ? 'inside' : 'outside'} the business.` },
        { text: option(u.kind, otherWant(rightGroup)), why: `Chose the right group but gave the interest of another user (${lc(rightGroup.who)}), not of this one.` },
        { text: option(flip, otherWant(wrongGroup)), why: `Mixed up both the group and the interest, taking the interest of ${lc(wrongGroup.who)}.` },
      ],
      explanation: `${u.who} is an ${u.kind} user: ${u.kind === 'internal' ? 'this user owns or manages the business' : 'this user stands outside the business and needs the information for its own decisions'}. The main interest is in ${want}.`,
      hints: ['Does the user own or manage the business, or deal with it from outside?', 'Owners and managers are internal users; lenders, suppliers, customers, would-be investors, the tax department, government agencies and researchers are external users.'],
    };
  },
  verify: (q) => {
    const u = typed.find((x) => q.prompt.startsWith(`Consider ${lc(x.who)}.`));
    const right = correctText(q);
    return u !== undefined && right !== undefined && right.startsWith(`${kindWord(u.kind)} user, who wants to know `) && u.wants.some((w) => right.endsWith(w));
  },
});

const iaInternalExternal = mcqTemplate({
  id: 'ia-internal-external',
  topicId: T,
  conceptId: C_USERS,
  difficulty: 'easy',
  generate: (rng) => {
    const wantInternal = rng.next() < 0.5;
    const right = rng.pick(typed.filter((u) => (u.kind === 'internal') === wantInternal));
    const wrong = rng.shuffle(typed.filter((u) => (u.kind === 'internal') !== wantInternal)).slice(0, 4);
    return {
      prompt: `Which of the following is an ${wantInternal ? 'internal' : 'external'} user of accounting information?`,
      correct: right.who,
      distractors: wrong.map((u) => ({
        text: u.who,
        why: wantInternal
          ? 'Took this user as inside the business, but this user deals with it from outside and uses the accounts only for its own decisions.'
          : 'Took this user as outside the business, but this user owns or manages it, and so is an internal user.',
      })),
      explanation: wantInternal
        ? `${right.who} belongs to the ownership or management of the business, and so is an internal user. The others deal with the business from outside.`
        : `${right.who} deals with the business from outside, and so is an external user. The others own or manage the business.`,
      hints: ['Internal users own or manage the business. External users deal with it from outside.', 'Banks, suppliers, customers, would-be investors and the tax department are external users.'],
    };
  },
  verify: (q) => {
    const asksInternal = q.prompt.includes('an internal user');
    const u = typed.find((x) => x.who === correctText(q));
    return u !== undefined && (u.kind === 'internal') === asksInternal;
  },
});

const iaUserNeed = mcqTemplate({
  id: 'ia-user-need',
  version: 2,
  topicId: T,
  conceptId: C_USERS,
  difficulty: 'medium',
  generate: (rng) => {
    const u = rng.pick(USERS);
    const want = rng.pick(u.wants);
    const pool = USERS.filter((x) => x.id !== u.id && !clashes(u, x));
    const wrong = rng.shuffle(pool).slice(0, 4);
    return {
      prompt: `Which user of accounting information is most interested in knowing ${want}?`,
      correct: u.who,
      distractors: wrong.map((x) => ({ text: x.who, why: `Looked at ${lc(x.who)}, whose main concern is ${x.wants[0]}, which is a different need.` })),
      explanation: `${u.who} is the user who wants this: it is interested in ${want}.`,
      hints: ['Match the need to the kind of decision each user has to take.', 'Lenders look at repayment, investors at profit and safety, suppliers at payment of bills, tax authorities at tax, owners and managers at running the business.'],
    };
  },
  verify: (q) => {
    const u = USERS.find((x) => x.who === correctText(q));
    return u !== undefined && u.wants.some((w) => q.prompt === `Which user of accounting information is most interested in knowing ${w}?`);
  },
});

// ---------------------------------------------------------------------------------------------------------------
// The accounting process: which step is it, and in what order do the steps come.
// ---------------------------------------------------------------------------------------------------------------

const STEPS = ['Identifying', 'Measuring', 'Recording', 'Classifying', 'Summarising', 'Analysing', 'Interpreting', 'Communicating'] as const;
type Step = (typeof STEPS)[number];
const STEP_DESC: Record<Step, string> = {
  Identifying: 'deciding which events are business transactions that have to be accounted for',
  Measuring: 'expressing a transaction in terms of money',
  Recording: 'writing the transactions in the books of original entry, such as the journal, as they happen',
  Classifying: 'grouping similar transactions together under their accounts, as in the ledger',
  Summarising: 'putting the classified figures into a trial balance and the financial statements',
  Analysing: 'establishing relationships between the figures, such as comparing items or years',
  Interpreting: 'explaining what the analysed figures mean for the business',
  Communicating: 'giving the information to its users through reports and statements',
};

const act = (step: Step, text: string): { step: Step; text: string } => ({ step, text });
const ACTIVITIES = [
  act('Identifying', 'From the day\'s happenings the accountant picks the sale of goods to Mehta and the payment of the electricity bill as items that must be accounted for, and leaves out a chat with a supplier about next year\'s prices'),
  act('Identifying', 'The accountant decides that the owner\'s family holiday expense of {a} does not belong in the shop\'s books'),
  act('Identifying', 'Out of many events, the clerk selects those that change the firm\'s assets, liabilities or capital'),
  act('Identifying', 'The accountant decides that the purchase of a refrigerator for the shop is an event to be accounted for, while an enquiry from a customer is not'),
  act('Measuring', 'The value of goods sold on credit is fixed at {a}, the agreed invoice price'),
  act('Measuring', 'The quantity of goods sold is converted into rupees using the selling price per unit'),
  act('Measuring', 'Before any entry is made, the machinery that was bought is valued in rupees at its purchase price of {a}'),
  act('Measuring', 'A money value of {a} is put on the stationery used during the month, on the basis of the bills'),
  act('Recording', 'Each day\'s credit sales are entered in the sales book in date order, from the copies of the invoices'),
  act('Recording', 'The purchase of furniture is written in the journal with the date, the accounts affected and the amount of {a}'),
  act('Recording', 'Every cash receipt and payment is entered in the cash book in the order in which it took place'),
  act('Recording', 'The day\'s transactions are entered in the books of original entry as soon as they occur'),
  act('Classifying', 'Entries are posted from the journal into ledger accounts such as Rent A/c and Sales A/c'),
  act('Classifying', 'All the entries relating to Mohan are collected in one account to show what Mohan owes'),
  act('Classifying', 'The sales entries scattered through the journal are grouped together in one Sales Account'),
  act('Classifying', 'Recorded transactions are sorted so that all items of rent fall under one account heading'),
  act('Summarising', 'The balances of all ledger accounts are listed and totalled in a trial balance'),
  act('Summarising', 'The income statement and balance sheet are prepared at the end of the year'),
  act('Summarising', 'The balances of the ledger accounts are put together in the year-end statements'),
  act('Summarising', 'The trading and profit and loss account of the year is prepared from the ledger balances'),
  act('Analysing', 'This year\'s sales and expenses are compared item by item with last year\'s, to see what changed'),
  act('Analysing', 'The relationship between gross profit and sales is worked out for each of the last three years'),
  act('Analysing', 'The share of each product in total sales is worked out from the year-end statements'),
  // Worded as drawing a conclusion, not as telling someone: "the owner is told ..." could be defended as communicating.
  act('Interpreting', 'After the figures of the two years have been compared, the accountant concludes that profit fell mainly because rent and salaries rose faster than sales'),
  act('Interpreting', 'Having worked out how much of the firm\'s funds are borrowed, the accountant forms a view on what so much borrowing means for the safety of the firm'),
  act('Interpreting', 'From the comparison already made, the accountant draws the conclusion that the rise in amounts due from customers will leave the firm short of cash'),
  act('Communicating', 'Copies of the annual statements are sent to the bank that lent money to the firm'),
  act('Communicating', 'The finance report is handed over to the owner and the managers'),
  act('Communicating', 'The annual report is presented to the loan officer of the bank'),
  act('Communicating', 'The financial statements are filed with the tax authorities'),
];

const iaProcessStep = mcqTemplate({
  id: 'ia-process-step',
  version: 2,
  topicId: T,
  conceptId: C_PROCESS,
  difficulty: 'medium',
  generate: (rng) => {
    const a = rng.pick(ACTIVITIES);
    const text = fill(a.text, money(rs(rng, 5000, 90000, 5000)));
    return {
      prompt: `Which step of the accounting process is this? ${text}.`,
      correct: a.step,
      distractors: STEPS.filter((s) => s !== a.step).map((s) => ({
        text: s,
        why: `Took it for ${s}, which is ${STEP_DESC[s]}; this activity is ${STEP_DESC[a.step]}.`,
      })),
      explanation: `This is ${a.step}: ${STEP_DESC[a.step]}. The order of the steps is identifying, measuring, recording, classifying, summarising, analysing, interpreting and communicating.`,
      hints: ['Think of the path from an event to a report: what has been done so far, and what is being done now?', 'Recording writes entries; classifying groups them; summarising makes statements; analysing and interpreting explain them; communicating hands them over.'],
    };
  },
  verify: (q) => {
    const a = firstAmount(q.prompt);
    const found = ACTIVITIES.find((x) => q.prompt.endsWith(`${fill(x.text, a)}.`));
    return found !== undefined && correctText(q) === found.step;
  },
});

const iaProcessOrder = mcqTemplate({
  id: 'ia-process-order',
  topicId: T,
  conceptId: C_PROCESS,
  difficulty: 'easy',
  generate: (rng) => {
    const mode = rng.pick(['after', 'before', 'nth'] as const);
    const i = mode === 'after' ? rng.int(0, 6) : rng.int(1, 7);
    const target = mode === 'after' ? i + 1 : i - 1;
    const answer = mode === 'nth' ? i : target;
    const named = STEPS[i];
    // NCERT's definition names four steps and other textbooks six to eight, so the list this question counts along is
    // stated, in alphabetical order so that it does not give the working order away.
    const listed = [...STEPS].map((s) => lc(s)).sort();
    const stated = `Take the accounting process in eight steps, listed here in alphabetical order: ${listed.slice(0, -1).join(', ')} and ${listed[listed.length - 1]}.`;
    const prompt =
      mode === 'nth'
        ? `${stated} In their working order, which step is number ${i + 1}?`
        : `${stated} In their working order, which step comes immediately ${mode} ${named}?`;
    const why = (j: number): string => {
      const s = STEPS[j];
      if (mode === 'nth') return `${s} is step number ${j + 1}, not number ${i + 1}.`;
      const delta = mode === 'after' ? j - i : i - j;
      if (delta === 0) return `${s} is the step named in the question, not the one ${mode} it.`;
      if (delta < 0) return `Reversed the order: ${s} comes ${mode === 'after' ? 'before' : 'after'} ${named}, not ${mode} it.`;
      return `Skipped ${delta - 1} step${delta - 1 === 1 ? '' : 's'}: ${s} is ${delta} places ${mode} ${named}, not the next one.`;
    };
    return {
      prompt,
      correct: STEPS[answer],
      distractors: STEPS.map((s, j) => ({ s, j })).filter(({ j }) => j !== answer).map(({ s, j }) => ({ text: s, why: why(j) })),
      explanation: `The order is: ${STEPS.map((s, j) => `${j + 1}. ${s}`).join(', ')}. So the answer is ${STEPS[answer]}.`,
      hints: ['Picture the path from a business event to a report that a user can read.', 'Identify, measure, record, classify, summarise, analyse, interpret, communicate.'],
    };
  },
  verify: (q) => {
    const after = /immediately after (\w+)\?$/.exec(q.prompt);
    const before = /immediately before (\w+)\?$/.exec(q.prompt);
    const nth = /step is number (\d)\?$/.exec(q.prompt);
    const right = correctText(q);
    if (after) return right === STEPS[STEPS.indexOf(after[1] as Step) + 1];
    if (before) return right === STEPS[STEPS.indexOf(before[1] as Step) - 1];
    if (nth) return right === STEPS[Number(nth[1]) - 1];
    return false;
  },
});

// ---------------------------------------------------------------------------------------------------------------
// Qualitative characteristics of accounting information.
// ---------------------------------------------------------------------------------------------------------------

type KQ = 'rel' | 'rev' | 'und' | 'com';
const Q_LABEL: Record<KQ, string> = { rel: 'Reliability', rev: 'Relevance', und: 'Understandability', com: 'Comparability' };
const Q_DESC: Record<KQ, string> = {
  rel: 'figures that are free from error and bias and backed by evidence',
  rev: 'information that can affect a decision and reaches the user in time',
  und: 'information that users can easily follow',
  com: 'information that can be compared from one period to another or between firms',
};
interface QItem {
  kind: KQ;
  lack: string;
  meets: string;
}
const QITEMS: QItem[] = [
  { kind: 'rel', lack: 'A trader enters a purchase of {a} without any bill and simply guesses the amount', meets: 'Every entry of the firm is supported by a bill, cash memo or other voucher, and the figures show things as they truly are' },
  { kind: 'rel', lack: 'A manager inflates the closing stock figure so that the profit looks better than it really is', meets: 'An accountant reports a loss honestly, although the owner would have liked to show a profit' },
  { kind: 'rel', lack: 'The owner asks the accountant to leave out a loan of {a} so that the firm looks stronger', meets: 'The statements show every asset and liability of the firm, whether or not the owner likes the picture' },
  { kind: 'rev', lack: 'Monthly sales figures reach the manager three months after the month ends, when the decisions they could have helped are already taken', meets: 'The finance manager receives the weekly cash position every Monday, in time to decide which bills to pay' },
  { kind: 'rev', lack: 'A bank deciding on a loan today is sent the firm\'s figures of five years ago', meets: 'A lender is given the latest figures of the firm\'s debts and cash, which bear directly on the loan decision' },
  { kind: 'rev', lack: 'A report meant to help decide whether to stock a new product is full of detail about the canteen\'s tea bills and says nothing about sales or costs', meets: 'The sales manager gets product-wise sales and costs before deciding whether to stock a new product' },
  { kind: 'und', lack: 'The annual statements are written in dense technical language that an ordinary small trader cannot follow', meets: 'The statements use clear headings and plain words so that an ordinary reader can follow them' },
  { kind: 'und', lack: 'The clerk keeps the accounts in private abbreviations that nobody else can read', meets: 'Each figure in the statements carries a short note in simple words, so that a reader with a little knowledge of business can follow what it stands for' },
  { kind: 'com', lack: 'A firm values its stock by one method this year and another next year without saying so, so the two years\' profits cannot be compared', meets: 'A firm values its stock by the same method every year, so this year\'s profit can be compared with last year\'s' },
  { kind: 'com', lack: 'Two shops in the same trade treat the same kind of cost in quite different ways, so their statements cannot be put side by side', meets: 'Two shops in the same trade follow the same accounting rules, so their statements can be put side by side' },
  { kind: 'com', lack: 'A firm keeps changing the way it records depreciation from one year to the next', meets: 'A firm records depreciation in the same way every year' },
];

const iaQualityMatch = mcqTemplate({
  id: 'ia-quality-match',
  topicId: T,
  conceptId: C_QUALITIES,
  difficulty: 'medium',
  generate: (rng) => {
    const item = rng.pick(QITEMS);
    const lacking = rng.next() < 0.5;
    const text = fill(lacking ? item.lack : item.meets, money(rs(rng, 5000, 90000, 5000)));
    const kinds = Object.keys(Q_LABEL) as KQ[];
    return {
      prompt: lacking
        ? `${text}. Which qualitative characteristic of accounting information is mainly missing here?`
        : `${text}. Which qualitative characteristic of accounting information does this mainly serve?`,
      correct: Q_LABEL[item.kind],
      distractors: kinds
        .filter((k) => k !== item.kind)
        .map((k) => ({
          text: Q_LABEL[k],
          why: `Mixed it up with ${Q_LABEL[k]}, which is about ${Q_DESC[k]}; this case is about ${Q_DESC[item.kind]}.`,
        })),
      explanation: `${Q_LABEL[item.kind]} means ${Q_DESC[item.kind]}, and that is what this case ${lacking ? 'lacks' : 'serves'}.`,
      hints: ['Ask what is wrong with, or good about, the information: can it be trusted, does it help a decision, can it be understood, can it be compared?', 'Reliability, relevance, understandability and comparability are the four characteristics.'],
    };
  },
  verify: (q) => {
    const a = firstAmount(q.prompt);
    const lacking = q.prompt.endsWith('is mainly missing here?');
    const found = QITEMS.find((x) => q.prompt.startsWith(`${fill(lacking ? x.lack : x.meets, a)}.`));
    return found !== undefined && correctText(q) === Q_LABEL[found.kind];
  },
});

// ---------------------------------------------------------------------------------------------------------------
// Branches of accounting, and book-keeping versus accounting versus accountancy.
// ---------------------------------------------------------------------------------------------------------------

type KB = 'fin' | 'cost' | 'mgmt' | 'book';
const LABELS_B: Record<KB, Label> = {
  fin: { label: 'Financial accounting', taken: 'financial accounting (recording transactions and preparing statements of profit and position for owners and outsiders)' },
  cost: { label: 'Cost accounting', taken: 'cost accounting (finding and controlling the cost of making a product or giving a service)' },
  mgmt: { label: 'Management accounting', taken: 'management accounting (using accounting information to help managers plan, control and decide)' },
  book: { label: 'Book-keeping', taken: 'book-keeping (only recording transactions in the books)' },
};
const ib = (kind: KB, text: string, fact: string): Item<KB> => ({ kind, text, fact });
const FIN = 'is about preparing the statements that show the owner and outsiders the profit and the financial position';
const COST = 'is about working out and controlling what it costs to make a product';
const MGMT = 'is about using figures to help the managers plan, control or decide';
const BOOK = 'is only the recording of transactions in the books, with no statements or decisions';

const BANK_B: Item<KB>[] = [
  ib('fin', 'Preparing the profit and loss account and the balance sheet at the year end to show the owner and the bank how the firm did', FIN),
  ib('fin', 'Recording the year\'s transactions and drawing up final accounts to find the profit or loss and the financial position', FIN),
  ib('fin', 'Preparing statements of profit and financial position that the tax authorities and lenders will examine', FIN),
  ib('cost', 'Working out that making one kilogram of biscuits costs {a}, counting materials, labour and factory overheads', COST),
  ib('cost', 'Finding what it costs to make one school bag in a garment unit and looking for ways to bring the cost down', COST),
  ib('cost', 'Fixing the cost of each unit of a product, so that its selling price can be set above it', COST),
  ib('mgmt', 'Preparing budgets and reports that help the managers decide whether to drop a loss-making product', MGMT),
  ib('mgmt', 'Using past figures to prepare a forecast showing whether the firm should open a second branch', MGMT),
  ib('mgmt', 'Analysing sales by region so that managers can set next year\'s targets', MGMT),
  ib('book', 'Entering each day\'s cash receipts and payments in the cash book in date order', BOOK),
  ib('book', 'Posting entries from the journal to the ledger accounts of a small shop', BOOK),
  ib('book', 'Keeping the journal and ledger of a small business up to date', BOOK),
];

const iaBranch = labelled({
  id: 'ia-branch',
  conceptId: C_MEANING,
  difficulty: 'easy',
  bank: BANK_B,
  labels: LABELS_B,
  range: { cost: [20, 400, 10] },
  ask: (text) => `Which branch of accounting, or which activity, does this describe? ${text}.`,
  hints: ['Ask who the work is for and what it produces: statements for outsiders, cost per unit, help for managers, or only entries in the books.', 'Financial accounting reports results, cost accounting finds cost, management accounting helps decisions, book-keeping only records.'],
});

type KW = 'bk' | 'ac' | 'ay' | 'au';
const LABELS_W: Record<KW, Label> = {
  bk: { label: 'Book-keeping', taken: 'book-keeping (recording transactions and keeping the books)' },
  ac: { label: 'Accounting', taken: 'accounting (summarising, analysing, interpreting and communicating the recorded information)' },
  ay: { label: 'Accountancy', taken: 'accountancy (the body of principles, rules and knowledge on which accounts are kept)' },
  au: { label: 'Auditing', taken: 'auditing (an independent check of the books and statements)' },
};
const iw = (kind: KW, text: string, fact: string): Item<KW> => ({ kind, text, fact });
const BK = 'is the clerical work of recording transactions and keeping the books';
const AC = 'goes beyond recording: it summarises, analyses, interprets and communicates the information';
const AY = 'is the theory: the principles, rules and knowledge behind how accounts are kept';
const AU = 'is an independent person checking whether the books and statements can be relied on';

const BANK_W: Item<KW>[] = [
  iw('bk', 'A clerk writes each day\'s transactions in the journal and posts them to the ledger', BK),
  iw('bk', 'Daily sales and purchases of a shop are entered in the books and the books are kept up to date', BK),
  iw('bk', 'The cash book of a firm is written every day from vouchers', BK),
  iw('ac', 'Year-end statements are prepared from the ledger and the owner is told what the results mean', AC),
  iw('ac', 'The year\'s figures are analysed and the management is told where costs have risen', AC),
  iw('ac', 'The records are summarised into a trial balance and statements and sent to the bank', AC),
  iw('ay', 'A student learns the rules, principles and conventions on which accounts are prepared', AY),
  iw('ay', 'The body of knowledge that tells accountants how to record and report transactions', AY),
  iw('ay', 'The subject taught in a commerce class, covering the principles and methods of accounting', AY),
  iw('au', 'An independent chartered accountant examines the books and vouchers to see whether the statements give a true and fair picture', AU),
  iw('au', 'The books were examined by an outside professional to see if the accounts can be relied on', AU),
];

const iaBkVsAcc = labelled({
  id: 'ia-bk-vs-acc',
  conceptId: C_MEANING,
  difficulty: 'medium',
  bank: BANK_W,
  labels: LABELS_W,
  ask: (text) => `${text}. Which term fits this best? (Take book-keeping as recording and keeping the books; accounting as the further work of summarising, analysing, interpreting and communicating; accountancy as the body of principles and rules.)`,
  hints: ['Ask whether it is recording, using the records, the rules behind both, or an outsider checking them.', 'Book-keeping records; accounting uses the records; accountancy is the theory; auditing checks.'],
});

// ---------------------------------------------------------------------------------------------------------------
// Is it a financial transaction?
// ---------------------------------------------------------------------------------------------------------------

const TRANSACTIONS = [
  'Goods worth {a} are bought on credit from a supplier',
  'Rent of {a} is paid in cash for the shop',
  'Goods worth {a} are sold for cash',
  'A debtor pays {a} to the firm',
  'The owner puts {a} of personal savings into the business',
  'The firm takes a bank loan of {a}',
  'Salaries of {a} are paid to the staff',
  'Furniture worth {a} is bought on credit',
  'The firm withdraws {a} from its bank account for use in the office',
];
const EVENTS: { text: string; fact: string }[] = [
  { text: 'A customer asks for a price quotation for goods worth about {a}', fact: 'is only an enquiry: nothing of value has been exchanged' },
  { text: 'An order for goods worth {a} is placed with a supplier, but no goods have been delivered', fact: 'is only an order: nothing has been delivered or paid, so nothing has been exchanged yet' },
  { text: 'The proprietor decides to appoint a new sales manager', fact: 'is only a decision: no money or goods have changed hands' },
  { text: 'The market price of the goods in the godown, worth {a} at cost, rises by 10%', fact: 'is a change in market price: no exchange has taken place, so no entry is made' },
  { text: 'A monthly salary is promised to a clerk who has not yet joined', fact: 'is a promise for the future: no service has been received and nothing has been paid' },
  { text: 'A bank officer visits the firm to discuss a possible loan of {a}', fact: 'is only a discussion: no loan has been given' },
  { text: 'The government announces a change in the GST rate for goods worth {a}, which the firm may buy next month', fact: 'is only an announcement: the firm has not bought or sold anything' },
];

// Version 2: the owner's capital is worded without "his" (the house rule: no gendered pronouns).
const iaFinancialTransaction = mcqTemplate({
  id: 'ia-financial-transaction',
  version: 2,
  topicId: T,
  conceptId: C_TRADE,
  difficulty: 'easy',
  generate: (rng) => {
    const a = money(rs(rng, 10000, 200000, 5000));
    const wantTransaction = rng.next() < 0.5;
    const tx = rng.shuffle(TRANSACTIONS).map((t) => fill(t, a));
    const ev = rng.shuffle(EVENTS);
    if (wantTransaction) {
      return {
        prompt: 'Which of the following is a financial transaction of the business?',
        correct: tx[0],
        distractors: ev.slice(0, 4).map((e) => ({ text: fill(e.text, a), why: `Took it for a transaction, but it ${e.fact}.` })),
        explanation: `${tx[0]}: value is exchanged and the amount can be measured in money, so it changes the financial position. The others are events that involve no exchange yet.`,
        hints: ['A transaction is an exchange of value that can be measured in money and changes assets, liabilities or capital.', 'An enquiry, an order not yet delivered, a decision or a promise has exchanged nothing yet.'],
      };
    }
    return {
      prompt: 'Which of the following is NOT a financial transaction of the business, as it stands?',
      correct: fill(ev[0].text, a),
      distractors: tx.slice(0, 4).map((t) => ({ text: t, why: 'Took it for a mere event, but value is exchanged and measured in money, so it is a transaction.' })),
      explanation: `${fill(ev[0].text, a)} ${ev[0].fact}. The others each exchange value and change the financial position.`,
      hints: ['A transaction is an exchange of value that can be measured in money and changes assets, liabilities or capital.', 'An enquiry, an order not yet delivered, a decision or a promise has exchanged nothing yet.'],
    };
  },
  verify: (q) => {
    const right = correctText(q);
    const a = firstAmount(right ?? '') || firstAmount(q.options.map((o) => o.text).join(' '));
    const isTx = TRANSACTIONS.some((t) => fill(t, a) === right);
    const isEv = EVENTS.some((e) => fill(e.text, a) === right);
    return q.prompt.startsWith('Which of the following is a financial') ? isTx : isEv;
  },
});

// ---------------------------------------------------------------------------------------------------------------
// Terms: which term fits a described situation, and which statement describes a term.
// ---------------------------------------------------------------------------------------------------------------

interface Term {
  name: string;
  group: 'trade' | 'owner' | 'income';
  def: string;
  near: string[];
  /** Whole questions. They print `a` before `b` where both appear; `b` is always smaller than `a`. */
  scenes: ((a: string, b: string) => string)[];
}

/**
 * The paper that proves a transaction: the cash memo, invoice or receipt. Called a supporting voucher (or source
 * document), so that it is not confused with the accounting voucher prepared from it to show the entry (ia-card-24).
 */
const VOUCHER = 'Voucher (supporting voucher / source document)';

// The trade terms (and the scenes of the owner's terms) are at version 2: the paper that proves a transaction is named
// a supporting voucher, as the card on source documents and accounting vouchers names it, and no scene says "he" or
// "she". The terms of income are as they were.
const TERMS: Term[] = [
  { name: 'Debtor (trade receivable)', group: 'trade', def: 'A person who owes money to the business for goods bought from it on credit', near: ['Creditor (trade payable)', 'Bill receivable', 'Bill payable', 'Sales'],
    scenes: [(a) => `A hardware shop sold goods worth ${a} to Meena on credit, and Meena has not paid yet. Which term describes Meena in the shop's books?`, (a) => `Imran Traders bought goods of ${a} on credit from a wholesaler and promised to pay next month. Which term describes Imran Traders in the wholesaler's books?`] },
  { name: 'Creditor (trade payable)', group: 'trade', def: 'A person to whom the business owes money for goods bought from that person on credit', near: ['Debtor (trade receivable)', 'Bill payable', 'Purchases', 'Bill receivable'],
    scenes: [(a) => `A hardware shop bought goods worth ${a} on credit from Gupta Traders and has not paid yet. Which term describes Gupta Traders in the shop's books?`, (a) => `A garment retailer owes ${a} to a cloth mill for fabric bought on credit. Which term describes the mill in the retailer's books?`] },
  { name: 'Bill receivable', group: 'trade', def: 'A bill of exchange accepted by a customer, which the business will collect on its due date', near: ['Debtor (trade receivable)', 'Bill payable', 'Creditor (trade payable)', VOUCHER],
    scenes: [(a) => `A customer signed a bill of exchange for ${a}, promising to pay the firm after 60 days. Which term describes this bill in the firm's books?`, (a) => `The firm holds a bill for ${a} accepted by its customer and due for payment after three months. Which term describes this bill in the firm's books?`] },
  { name: 'Bill payable', group: 'trade', def: 'A bill of exchange accepted by the business, which it must pay to its supplier on the due date', near: ['Creditor (trade payable)', 'Bill receivable', 'Debtor (trade receivable)', VOUCHER],
    scenes: [(a) => `The firm accepted a bill of exchange for ${a}, promising to pay its supplier after 60 days. Which term describes this bill in the firm's books?`, (a) => `A firm signed a bill for ${a} in favour of its supplier, to be paid after three months. Which term describes this bill in the firm's books?`] },
  { name: 'Trade discount', group: 'trade', def: 'A reduction in the list price allowed to a buyer, usually for buying in quantity, which is not entered in the books', near: ['Cash discount', 'Sales', 'Purchases', VOUCHER],
    scenes: [(a) => `A wholesaler's price list shows ${a} for a lot, but the wholesaler allows 10% off to a retailer who buys in bulk, and the invoice shows only the reduced price. Which term describes the 10% reduction?`, (a) => `A dealer quotes ${a} for a set of goods at list price and allows a 20% reduction to every shopkeeper who buys the full set. Which term describes this reduction?`] },
  { name: 'Cash discount', group: 'trade', def: 'A concession allowed for prompt payment, which is entered in the books', near: ['Trade discount', 'Expense', VOUCHER, 'Sales'],
    scenes: [(a) => `A seller allows a deduction of 2% on a bill of ${a} if the buyer pays within 10 days. The buyer pays in time and takes the deduction. Which term describes the deduction?`, (a) => `Kiran owes ${a} to a supplier, and the supplier agrees to accept a little less because Kiran pays well before the due date. Which term describes the concession?`] },
  { name: VOUCHER, group: 'trade', def: 'A paper such as a cash memo, invoice or receipt that proves a transaction; the accounting voucher showing the entry is prepared from it', near: ['Transaction', 'Bill receivable', 'Bill payable', 'Goods'],
    scenes: [(a) => `To prove that ${a} was paid for stationery, the accountant files the shop's cash memo. Which term describes such a supporting paper?`, (a) => `A landlord gives a signed receipt for rent of ${a}, and the tenant files it as proof of payment. Which term describes this proof?`] },
  { name: 'Goods', group: 'trade', def: 'Items that the business buys in order to sell them again in the ordinary course of trade', near: ['Closing stock', 'Sales', 'Cost', 'Cash discount'],
    scenes: [(a) => `A cloth merchant buys sarees worth ${a} only to sell them to customers. Which term describes such items in the merchant's books?`, (a) => `A mobile phone dealer buys phones worth ${a} in order to resell them. Which term describes the phones in the dealer's books?`] },
  { name: 'Opening stock', group: 'trade', def: 'Goods that are still unsold at the start of the period, carried over from the end of the last period', near: ['Closing stock', 'Purchases', 'Sales', 'Debtor (trade receivable)'],
    scenes: [(a) => `On 1 April a trader begins the year with unsold sarees costing ${a}, left over from last year. Which term describes these goods in the accounts of the year that is beginning?`, (a) => `A grocer's shelves on the first day of the year hold unsold rice and pulses costing ${a}, left over from the previous year. Which term describes these goods in the accounts of the new year?`] },
  { name: 'Closing stock', group: 'trade', def: 'Goods that are still unsold at the end of the period', near: ['Opening stock', 'Purchases', 'Sales', 'Debtor (trade receivable)'],
    scenes: [(a) => `On 31 March, the last day of the accounting year, a trader counts unsold sarees that cost ${a}. Which term describes these goods in the accounts of the year that is ending?`, (a) => `At the end of the year a grocer finds unsold goods that cost ${a} on the shop's shelves. Which term describes these goods in the accounts of the year that is ending?`] },
  { name: 'Purchases', group: 'trade', def: 'Goods bought during the period for resale, whether for cash or on credit', near: ['Sales', 'Opening stock', 'Closing stock', 'Creditor (trade payable)'],
    scenes: [(a, b) => `During the year a trader bought goods for resale: ${a} for cash and ${b} on credit. Which term describes the total of the goods bought?`] },
  { name: 'Sales', group: 'trade', def: 'Goods sold during the period, whether for cash or on credit', near: ['Purchases', 'Closing stock', 'Debtor (trade receivable)', 'Cash discount'],
    scenes: [(a, b) => `During the year a shop sold goods for ${a} in cash and ${b} on credit. Which term describes the total of the goods sold?`] },
  { name: 'Transaction', group: 'trade', def: 'An exchange of value that can be measured in money and changes the financial position of the business', near: [VOUCHER, 'Business entity', 'Cost', 'Drawings'],
    scenes: [(a) => `A shop buys a fan for ${a} on credit. This exchange of value, measured in money, changes the shop's assets and liabilities. Which term describes it?`, (a) => `A trader pays ${a} as a month's salary to a clerk. This exchange, measured in money, changes the trader's assets and capital. Which term describes it?`] },

  { name: 'Capital', group: 'owner', def: 'The amount invested in the business by its owner, which the business owes to the owner and not to any outsider', near: ['Drawings', 'Asset', 'Revenue', 'Gain'],
    // The cash brought in is itself an asset, so each scene asks about the owner's stake, not about "this amount".
    scenes: [(a) => `Rajesh Kumar starts Kumar Bakery with ${a} of personal savings. Which term describes what the bakery now owes to Rajesh as its owner?`, (a) => `Lakshmi Iyer brings ${a} of personal savings into Iyer Tailors, which Lakshmi owns. Which term describes Lakshmi's stake in the business that arises from this investment?`] },
  { name: 'Drawings', group: 'owner', def: 'Cash or goods taken out of the business by the owner for personal use', near: ['Capital', 'Expense', 'Liability', 'Loss'],
    scenes: [(a) => `The owner of a grocery shop takes ${a} from the cash box to pay a child's school fees. Which term describes this withdrawal in the shop's books?`, (a) => `A proprietor takes goods worth ${a} from the shop for use at home. Which term describes this in the shop's books?`] },
  { name: 'Asset', group: 'owner', def: 'A resource owned by the business that is expected to bring it a benefit in the future', near: ['Liability', 'Capital', 'Cost', 'Expense'],
    scenes: [(a) => `A courier firm owns a van worth ${a}, which will help it earn for years. Which term describes the van in its books?`, (a) => `A printing firm owns a press worth ${a} that it will use to earn money for many years. Which term describes the press in its books?`] },
  { name: 'Liability', group: 'owner', def: 'An amount that the business owes to outsiders and must pay in the future', near: ['Asset', 'Capital', 'Expense', 'Drawings'],
    scenes: [(a) => `A firm borrows ${a} from a bank and must pay it back with interest. Which term describes the amount it owes?`, (a) => `A firm takes a loan of ${a} from a financial institution, repayable after four years. Which term describes the amount it owes?`] },
  { name: 'Business entity', group: 'owner', def: 'The business seen as a unit separate from its owner, with books of its own', near: ['Capital', 'Transaction', 'Asset', 'Drawings'],
    scenes: [(a) => `The owner's household bill of ${a} is not entered in the shop's books, because the shop is treated as a separate unit. Which term describes the shop in this treatment?`, (a) => `Ravi's shop has its own set of books, apart from Ravi's household accounts, and a cash purchase of ${a} for the shop goes into the shop's books. Which term describes the shop as it is treated here?`] },

  { name: 'Revenue', group: 'income', def: 'The amount a business earns from selling goods or services in its ordinary activity', near: ['Profit', 'Gain', 'Capital', 'Expense'],
    scenes: [(a) => `A bakery sells cakes and pastries for ${a} during the month. Which term describes the amount earned from these sales?`, (a) => `A tuition centre receives ${a} in fees for teaching during the month. Which term describes the amount earned from its services?`] },
  { name: 'Expense', group: 'income', def: 'A cost incurred in running the business and earning revenue, such as rent or salaries', near: ['Asset', 'Loss', 'Drawings', 'Cash discount'],
    scenes: [(a) => `A shop pays ${a} as rent for the month. Which term describes this cost of running the shop?`, (a) => `A firm pays ${a} as salaries to its staff for the month. Which term describes this cost of earning revenue?`] },
  { name: 'Profit', group: 'income', def: 'The excess of revenue over expenses in a period', near: ['Revenue', 'Loss', 'Capital', 'Expense'],
    scenes: [(a, b) => `A firm's revenue for the year was ${a} and its expenses were ${b}. Which term describes the excess of revenue over expenses?`] },
  { name: 'Gain', group: 'income', def: 'A profit that comes from an event incidental to the business, such as selling an old asset for more than its value in the books', near: ['Revenue', 'Loss', 'Cash discount', 'Capital'],
    scenes: [(a, b) => `A firm sells an old machine for ${a}, which is ${b} more than its value in the books. Which term describes the extra ${b}?`] },
  { name: 'Loss', group: 'income', def: 'The excess of expenses over revenue in a period, or the value of something lost for which nothing is received', near: ['Expense', 'Drawings', 'Cost', 'Gain'],
    scenes: [(a, b) => `A firm's expenses for the year were ${a} while its revenue was only ${b}. Which term describes the excess of expenses over revenue?`, (a) => `Goods worth ${a} were destroyed in a fire in the godown and nothing was recovered. Which term describes the amount lost?`] },
  { name: 'Cost', group: 'income', def: 'The amount spent or given up to acquire an asset, goods or a service', near: ['Expense', 'Asset', 'Purchases', 'Loss'],
    scenes: [(a) => `A firm pays ${a} to buy a machine. Which term describes the amount given up to acquire the machine?`, (a) => `A firm pays ${a} for a delivery van. Which term describes the amount sacrificed to obtain the van?`] },
];
const TERM = new Map(TERMS.map((t) => [t.name, t]));
const termOf = (name: string): Term => {
  const t = TERM.get(name);
  if (!t) throw new Error(`Unknown term ${name}`);
  return t;
};

function termSituation(id: string, group: Term['group'], conceptId: string, difficulty: Difficulty, version?: number): McqTemplate {
  const terms = TERMS.filter((t) => t.group === group);
  return mcqTemplate({
    id,
    ...(version === undefined ? {} : { version }),
    topicId: T,
    conceptId,
    difficulty,
    generate: (rng) => {
      const t = rng.pick(terms);
      const ar = rs(rng, 20000, 200000, 5000);
      const br = rs(rng, 5000, Math.floor(ar / 10000) * 5000, 5000);
      const prompt = rng.pick(t.scenes)(money(ar), money(br));
      return {
        prompt,
        correct: t.name,
        distractors: t.near.map((n) => ({ text: n, why: `Took it for ${n}, which is ${lc(termOf(n).def)}; that is not what this describes.` })),
        explanation: `${t.name}: ${lc(t.def)}.`,
        hints: ['Look for the key feature in the description: who owes whom, what is earned or spent, what the owner does, or what is left unsold.', 'Match the feature to the definition of each term in the options.'],
      };
    },
    verify: (q) => {
      const [x, y] = (q.prompt.match(RUPEE) ?? []);
      const t = terms.find((term) => term.name === correctText(q));
      return t !== undefined && x !== undefined && t.scenes.some((s) => s(x, y ?? x) === q.prompt);
    },
  });
}

function termDefinition(id: string, group: Term['group'], conceptId: string, difficulty: Difficulty, version?: number): McqTemplate {
  const terms = TERMS.filter((t) => t.group === group);
  return mcqTemplate({
    id,
    ...(version === undefined ? {} : { version }),
    topicId: T,
    conceptId,
    difficulty,
    generate: (rng) => {
      const t = rng.pick(terms);
      return {
        prompt: `Which of these correctly describes ${t.name}?`,
        correct: t.def,
        distractors: t.near.map((n) => ({ text: termOf(n).def, why: `That describes ${n}, not ${t.name}.` })),
        explanation: `${t.name}: ${lc(t.def)}.`,
        hints: ['Think of a small example from a shop: who gives what to whom, and what changes in the books.', 'Compare the options: each defines a different term.'],
      };
    },
    verify: (q) => {
      const t = terms.find((term) => q.prompt === `Which of these correctly describes ${term.name}?`);
      return t !== undefined && correctText(q) === t.def;
    },
  });
}

const iaTermTrade = termSituation('ia-term-trade', 'trade', C_TRADE, 'easy', 2);
const iaTermOwner = termSituation('ia-term-owner', 'owner', C_ASSETS, 'easy', 2);
const iaTermIncome = termSituation('ia-term-income', 'income', C_INCOME, 'medium');
const iaDefineTrade = termDefinition('ia-define-trade', 'trade', C_TRADE, 'easy', 2);
const iaDefineOwner = termDefinition('ia-define-owner', 'owner', C_ASSETS, 'easy');
const iaDefineIncome = termDefinition('ia-define-income', 'income', C_INCOME, 'medium');

// ---------------------------------------------------------------------------------------------------------------
// Typed amounts.
// ---------------------------------------------------------------------------------------------------------------

const PROFIT_HINTS = [
  'Write the one relation first: Profit = Revenue - Expenses. Which of the three is unknown here?',
  'Add up the expenses if they are listed. Profit: revenue less expenses. Loss: expenses less revenue. Expenses: revenue less profit. Revenue: expenses plus profit.',
];
const BUSINESSES = ['a tea stall', 'a tailoring shop', 'a stationery shop', 'a mobile repair shop', 'a bakery', 'a medical store', 'a cloth shop', 'a photocopy centre'];
const HEADS = ['cost of goods sold', 'rent', 'salaries', 'electricity', 'advertisement', 'transport'];

/** Revenue, expenses and profit: find any one from the others. Version 2: hints of its own. */
const iaProfit = numericTemplate({
  id: 'ia-profit',
  version: 2,
  topicId: T,
  conceptId: C_INCOME,
  difficulty: 'easy',
  unit: 'rupees',
  generate: withHints(PROFIT_HINTS, (rng) => {
    const biz = cap(rng.pick(BUSINESSES));
    const mode = rng.pick(['profit', 'loss', 'expenses', 'revenue'] as const);
    if (mode === 'profit') {
      const heads = rng.shuffle(HEADS).slice(0, 3);
      const parts = heads.map(() => rs(rng, 5000, 120000, 5000));
      const e = sum(parts);
      const p = rs(rng, 5000, 150000, 5000);
      const r = e + p;
      const list = `${heads[0]} ${money(parts[0])}, ${heads[1]} ${money(parts[1])} and ${heads[2]} ${money(parts[2])}`;
      return {
        prompt: `${biz} had revenue of ${money(r)} in a month. Its expenses were: ${list}. What was the profit for the month?`,
        answer: rupees(p),
        commonErrors: [
          { value: rupees(r + e), why: 'Added the expenses to the revenue instead of deducting them.' },
          { value: rupees(e), why: 'Gave the total of the expenses, not the profit.' },
          { value: rupees(r), why: 'Gave the revenue, forgetting to deduct the expenses.' },
          { value: rupees(r - parts[0] - parts[1]), why: 'Left out one of the expense heads.' },
        ],
        explanation: ['Profit = Revenue - Expenses.', `Expenses = ${money(parts[0])} + ${money(parts[1])} + ${money(parts[2])} = ${money(e)}.`, `Profit = ${money(r)} - ${money(e)} = ${money(p)}.`],
      };
    }
    if (mode === 'loss') {
      const r = rs(rng, 20000, 200000, 5000);
      const l = rs(rng, 5000, 60000, 5000);
      const e = r + l;
      return {
        prompt: `${biz} had revenue of ${money(r)} in a month and total expenses of ${money(e)}. What was the loss for the month?`,
        answer: rupees(l),
        commonErrors: [
          { value: rupees(r + e), why: 'Added the revenue and the expenses instead of finding the shortfall.' },
          { value: rupees(e), why: 'Gave the total expenses, not the loss.' },
          { value: rupees(r), why: 'Gave the revenue, not the loss.' },
        ],
        explanation: ['Expenses are more than revenue, so there is a loss.', 'Loss = Expenses - Revenue.', `${money(e)} - ${money(r)} = ${money(l)}.`],
      };
    }
    if (mode === 'expenses') {
      const e = rs(rng, 20000, 300000, 5000);
      const p = rs(rng, 5000, 100000, 5000);
      if (e === p) return null;
      const r = e + p;
      return {
        prompt: `${biz} earned revenue of ${money(r)} and a profit of ${money(p)} in a month. What were its total expenses?`,
        answer: rupees(e),
        commonErrors: [
          { value: rupees(r + p), why: 'Added the profit to the revenue instead of deducting it.' },
          { value: rupees(p), why: 'Gave the profit, not the expenses.' },
          { value: rupees(r), why: 'Gave the revenue, forgetting to deduct the profit.' },
        ],
        explanation: ['Profit = Revenue - Expenses, so Expenses = Revenue - Profit.', `${money(r)} - ${money(p)} = ${money(e)}.`],
      };
    }
    const e = rs(rng, 20000, 300000, 5000);
    const p = rs(rng, 5000, 100000, 5000);
    if (e <= p) return null;
    const r = e + p;
    return {
      prompt: `${biz} had total expenses of ${money(e)} and made a profit of ${money(p)} in a month. What was its revenue?`,
      answer: rupees(r),
      commonErrors: [
        { value: rupees(e - p), why: 'Deducted the profit from the expenses instead of adding it.' },
        { value: rupees(e), why: 'Gave the expenses, forgetting the profit.' },
        { value: rupees(p), why: 'Gave the profit, not the revenue.' },
      ],
      explanation: ['Profit = Revenue - Expenses, so Revenue = Expenses + Profit.', `${money(e)} + ${money(p)} = ${money(r)}.`],
    };
  }),
  verify: (q) => {
    const a = amountsIn(q.prompt);
    if (q.prompt.endsWith('What was the profit for the month?')) return q.answer === a[0] - sum(a.slice(1));
    if (q.prompt.endsWith('What was the loss for the month?')) return q.answer === a[1] - a[0];
    if (q.prompt.endsWith('What were its total expenses?')) return q.answer === a[0] - a[1];
    if (q.prompt.endsWith('What was its revenue?')) return q.answer === a[0] + a[1];
    return false;
  },
});

/** Goods sold by the dozen or the lot, each with a believable list price per piece in rupees: [lowest, highest, step]. */
const PACKS: { name: string; price: Range }[] = [
  { name: 'kurtas', price: [300, 900, 50] },
  { name: 'school bags', price: [250, 700, 50] },
  { name: 'LED bulbs', price: [100, 300, 10] },
  { name: 'steel utensils', price: [200, 800, 50] },
  { name: 'mixer grinders', price: [1500, 4000, 250] },
  { name: 'pairs of shoes', price: [400, 1500, 50] },
  { name: 'ceiling fans', price: [1200, 3000, 100] },
];
const BUYERS = ['A retailer', 'A shopkeeper', 'A trader', 'A dealer'];

/** List price, trade discount and the amount recorded. */
const iaTradeDiscount = numericTemplate({
  id: 'ia-trade-discount',
  topicId: T,
  conceptId: C_TRADE,
  difficulty: 'medium',
  unit: 'rupees',
  generate: (rng) => {
    const pack = rng.pick(PACKS);
    const goods = pack.name;
    const q = rs(rng, 20, 200, 10);
    const p = rs(rng, ...pack.price);
    const td = rng.pick([5, 10, 15, 20, 25]);
    const listR = q * p;
    if ((listR * td) % 100 !== 0) return null;
    const discR = (listR * td) / 100;
    const netR = listR - discR;
    const who = rng.pick(BUYERS);
    const mode = rng.pick(['net', 'discount', 'list'] as const);
    if (mode === 'net') {
      return {
        prompt: `${who} buys ${q} ${goods} at a list price of ${money(p)} each. The wholesaler allows a trade discount of ${td}%. At what amount is the purchase recorded in the buyer's books? (Ignore GST.)`,
        answer: rupees(netR),
        commonErrors: [
          { value: rupees(listR), why: 'Recorded the list price; the trade discount is deducted before the purchase is recorded.' },
          { value: rupees(listR + discR), why: 'Added the trade discount to the list price instead of deducting it.' },
          { value: rupees(discR), why: 'Gave the amount of the discount instead of the amount recorded.' },
        ],
        explanation: [`List price = ${q} x ${money(p)} = ${money(listR)}.`, `Trade discount = ${td}% of ${money(listR)} = ${money(discR)}.`, `Purchase recorded = ${money(listR)} - ${money(discR)} = ${money(netR)}.`],
      };
    }
    if (mode === 'discount') {
      return {
        prompt: `${who} buys ${q} ${goods} at a list price of ${money(p)} each. The wholesaler allows a trade discount of ${td}%. How much is the trade discount?`,
        answer: rupees(discR),
        commonErrors: [
          { value: rupees(netR), why: 'Gave the amount payable after the discount, not the discount.' },
          { value: rupees(listR), why: 'Gave the total list price, not the discount.' },
          { value: Math.round((rupees(p) * td) / 100), why: 'Worked out the discount on one unit only.' },
        ],
        explanation: [`List price = ${q} x ${money(p)} = ${money(listR)}.`, `Trade discount = ${td}% of ${money(listR)} = ${money(discR)}.`],
      };
    }
    return {
      prompt: `${who}'s invoice shows ${money(netR)} after a trade discount of ${td}% on the list price. What was the list price?`,
      answer: rupees(listR),
      commonErrors: [
        { value: rupees(netR), why: 'Gave the amount after discount; the list price is the amount before it.' },
        { value: Math.round((rupees(netR) * (100 + td)) / 100), why: `Added ${td}% of the net amount instead of working back, since the discount is ${td}% of the list price.` },
        { value: Math.round((rupees(netR) * (100 - td)) / 100), why: `Took ${td}% off the invoice amount once more instead of working back to the price before the discount.` },
      ],
      explanation: [`The net amount is ${100 - td}% of the list price.`, `List price = ${money(netR)} x 100 / ${100 - td} = ${money(listR)}.`, `Check: ${td}% of ${money(listR)} = ${money(discR)}, and ${money(listR)} - ${money(discR)} = ${money(netR)}.`],
    };
  },
  verify: (q) => {
    const a = amountsIn(q.prompt);
    const td = Number(/discount of (\d+)%/.exec(q.prompt)?.[1]);
    const units = Number(/buys (\d+) /.exec(q.prompt)?.[1]);
    if (q.prompt.includes('recorded in the buyer')) return q.answer === Math.round((units * a[0] * (100 - td)) / 100);
    if (q.prompt.includes('How much is the trade discount')) return q.answer === Math.round((units * a[0] * td) / 100);
    if (q.prompt.includes('What was the list price')) return q.answer === Math.round((a[0] * 100) / (100 - td));
    return false;
  },
});

const DISCOUNT_HINTS = [
  'Which discount comes first, and on which amount is the second one worked?',
  'Trade discount on the list price gives the invoice amount (the figure recorded); cash discount is then worked on that invoice amount, not on the list price.',
];

/**
 * Trade discount and then cash discount on the invoice amount. Version 2: the wholesaler is not "he" (the house rule:
 * no gendered pronouns), and the questions have hints of their own.
 */
const iaTwoDiscounts = numericTemplate({
  id: 'ia-two-discounts',
  version: 2,
  topicId: T,
  conceptId: C_TRADE,
  difficulty: 'complex',
  unit: 'rupees',
  generate: withHints(DISCOUNT_HINTS, (rng) => {
    const listR = rs(rng, 20000, 200000, 10000);
    const t = rng.pick([10, 20, 25]);
    const c = rng.pick([2, 5]);
    const netR = (listR * (100 - t)) / 100;
    if ((netR * c) % 100 !== 0) return null;
    const cdR = (netR * c) / 100;
    const tdR = listR - netR;
    const base = `A wholesaler's list price for a lot of goods is ${money(listR)}. The wholesaler allows a trade discount of ${t}% on the list price and a further cash discount of ${c}% on the invoice amount after trade discount, if payment is made within 15 days.`;
    const mode = rng.pick(['paid', 'cash', 'sales'] as const);
    const bothOnList = rupees(listR - (listR * (t + c)) / 100);
    if (mode === 'paid') {
      return {
        prompt: `${base} The buyer pays within 15 days. How much does the buyer pay?`,
        answer: rupees(netR - cdR),
        commonErrors: [
          { value: bothOnList, why: 'Took both percentages on the list price; the cash discount is on the invoice amount after trade discount.' },
          { value: rupees(netR), why: 'Allowed the trade discount but forgot the cash discount.' },
          { value: rupees(listR - (listR * c) / 100), why: 'Allowed the cash discount but forgot the trade discount.' },
        ],
        explanation: [`Trade discount = ${t}% of ${money(listR)} = ${money(tdR)}, so the invoice amount is ${money(netR)}.`, `Cash discount = ${c}% of ${money(netR)} = ${money(cdR)}.`, `Amount paid = ${money(netR)} - ${money(cdR)} = ${money(netR - cdR)}.`],
      };
    }
    if (mode === 'cash') {
      return {
        prompt: `${base} The buyer pays within 15 days. How much is the cash discount?`,
        answer: rupees(cdR),
        commonErrors: [
          { value: rupees((listR * c) / 100), why: 'Worked the cash discount on the list price; it is worked on the invoice amount after trade discount.' },
          { value: rupees(tdR), why: 'Gave the trade discount instead of the cash discount.' },
          { value: rupees(tdR + cdR), why: 'Added the trade discount to the cash discount.' },
        ],
        explanation: [`Invoice amount = ${money(listR)} - ${t}% = ${money(netR)}.`, `Cash discount = ${c}% of ${money(netR)} = ${money(cdR)}.`],
      };
    }
    return {
      prompt: `${base} The buyer pays within 15 days and the seller records the cash discount separately as Discount Allowed. At what amount does the seller record the sale in the Sales Account?`,
      answer: rupees(netR),
      commonErrors: [
        { value: rupees(netR - cdR), why: 'Deducted the cash discount from the sale; it is recorded separately as discount allowed.' },
        { value: rupees(listR), why: 'Recorded the sale at the list price; the trade discount is deducted before recording.' },
        { value: bothOnList, why: 'Took both discounts on the list price and deducted both from the sale.' },
      ],
      explanation: [`Trade discount = ${t}% of ${money(listR)} = ${money(tdR)}, so the sale is recorded at ${money(netR)}.`, `The cash discount of ${money(cdR)} is not deducted from Sales: it goes to Discount Allowed A/c.`],
    };
  }),
  verify: (q) => {
    const listP = amountsIn(q.prompt)[0];
    const [t, c] = [...q.prompt.matchAll(/(\d+)%/g)].map((m) => Number(m[1]));
    const netP = (listP * (100 - t)) / 100;
    const cdP = (netP * c) / 100;
    if (q.prompt.includes('How much does the buyer pay')) return q.answer === netP - cdP;
    if (q.prompt.includes('How much is the cash discount')) return q.answer === cdP;
    if (q.prompt.includes('record the sale in the Sales Account')) return q.answer === netP;
    return false;
  },
});

/** Goods counted in units, each with a believable cost per unit in rupees: [lowest, highest, step]. */
const STOCK_GOODS: { name: string; cost: Range }[] = [
  { name: 'kg of rice', cost: [30, 90, 10] },
  { name: 'packets of tea', cost: [100, 400, 10] },
  { name: 'shirts', cost: [200, 700, 10] },
  { name: 'bags of cement', cost: [300, 420, 10] },
  { name: 'litres of oil', cost: [100, 180, 10] },
  { name: 'notebooks', cost: [20, 80, 10] },
];

const STOCK_HINTS = [
  'Stock is valued at what it cost, not at what it will fetch. Which figure in the question is the cost?',
  'Closing stock at cost = unsold units x cost per unit; to find the cost of one unit, divide the stock at cost by the units.',
];

/** A shop that sells each kind of goods of STOCK_GOODS, so that the stock questions name a business that fits. */
const STOCK_SELLERS: Record<string, string[]> = {
  'kg of rice': ['Annapurna Kirana Store, Nagpur', 'Kaveri Rice Traders, Mandya'],
  'packets of tea': ['Brahmaputra Tea House, Guwahati', 'Nilgiri Tea Mart, Coonoor'],
  shirts: ['Sharma Menswear, Ludhiana', 'Fashion Point, Surat'],
  'bags of cement': ['Patil Building Materials, Kolhapur', 'Shree Ram Cement Depot, Jaipur'],
  'litres of oil': ['Nair Oil Stores, Kochi', 'Gujarat Oil Depot, Rajkot'],
  notebooks: ['Vidya Stationers, Patna', 'Saraswati Book Centre, Bhopal'],
};

/** Closing stock from units and cost, valued at cost. Version 2: a named shop that sells the goods, and hints of its own. */
const iaStockValue = numericTemplate({
  id: 'ia-stock-value',
  version: 2,
  topicId: T,
  conceptId: C_TRADE,
  difficulty: 'easy',
  unit: 'rupees',
  generate: withHints(STOCK_HINTS, (rng) => {
    const item = rng.pick(STOCK_GOODS);
    const shop = rng.pick(STOCK_SELLERS[item.name]);
    const units = rs(rng, 50, 900, 10);
    const cost = rs(rng, ...item.cost);
    const mark = rs(rng, 10, 40, 5);
    const sell = cost + (cost * mark) / 100;
    if (!Number.isInteger(sell)) return null;
    const goods = item.name;
    const mode = rng.pick(['value', 'value', 'unit'] as const);
    const value = units * cost;
    if (mode === 'value') {
      return {
        prompt: `At the end of the year ${shop} finds ${units} ${goods} unsold. The cost was ${money(cost)} per unit and the selling price is ${money(sell)} per unit. At what value is the closing stock shown, valued at cost?`,
        answer: rupees(value),
        commonErrors: [
          { value: rupees(units * sell), why: 'Valued the stock at selling price; here the selling price is above cost, and stock is not valued above cost.' },
          { value: rupees(units * (sell - cost)), why: 'Gave the profit the stock would bring if sold (selling price less cost), not the cost of the stock.' },
          { value: rupees(cost), why: 'Gave the cost of a single unit instead of the cost of all the unsold units.' },
        ],
        explanation: ['Closing stock = unsold units x cost per unit (valued at cost).', `${units} x ${money(cost)} = ${money(value)}.`, 'The selling price is above cost, so it is not used: stock is not valued above cost.'],
      };
    }
    return {
      prompt: `The closing stock of ${shop}, valued at cost, is ${money(value)} and consists of ${units} ${goods}. The same stock could be sold for ${money(units * sell)}. What did each unit cost the shop?`,
      answer: rupees(cost),
      commonErrors: [
        { value: rupees(sell), why: 'Divided the selling value by the units; the cost of one unit comes from the cost value of the stock.' },
        { value: rupees(sell - cost), why: 'Gave the profit on one unit (its selling price less its cost), not its cost.' },
        { value: rupees(value), why: 'Gave the value of the whole stock, not the cost of one unit.' },
      ],
      explanation: ['Closing stock at cost = units x cost per unit, so cost per unit = closing stock at cost / units.', `${money(value)} / ${units} = ${money(cost)}.`, 'The selling value of the stock is not used.'],
    };
  }),
  verify: (q) => {
    const a = amountsIn(q.prompt);
    const units = Number(/(\d+) (?:kg|packets|shirts|bags|litres|notebooks)/.exec(q.prompt)?.[1]);
    if (q.prompt.includes('closing stock shown')) return q.answer === units * a[0];
    if (q.prompt.includes('did each unit cost')) return q.answer * units === a[0];
    return false;
  },
});

const STOCK_FLOW_HINTS = [
  'First find how many units are left: start with the opening stock, add what came in, take away what went out.',
  'Units left = opening + bought - sold. Closing stock = units left x cost per unit; the selling price is not used.',
];

/**
 * Opening stock, purchases and sales in units, then the value of what is left at cost. Version 2: a named shop that
 * sells the goods, in place of "a trader" and "he" (the house rule: no gendered pronouns), and hints of its own.
 */
const iaClosingStockFlow = numericTemplate({
  id: 'ia-closing-stock-flow',
  version: 2,
  topicId: T,
  conceptId: C_TRADE,
  difficulty: 'complex',
  unit: 'rupees',
  generate: withHints(STOCK_FLOW_HINTS, (rng) => {
    const item = rng.pick(STOCK_GOODS);
    const shop = rng.pick(STOCK_SELLERS[item.name]);
    const open = rs(rng, 50, 400, 10);
    const bought = rs(rng, 100, 800, 10);
    const sold = rs(rng, 100, open + bought - 20, 10);
    const left = open + bought - sold;
    if (left <= 0) return null;
    const cost = rs(rng, ...item.cost);
    const mark = rs(rng, 10, 40, 5);
    const sell = cost + (cost * mark) / 100;
    if (!Number.isInteger(sell)) return null;
    return {
      prompt: `The opening stock of ${shop} was ${open} ${item.name}. During the year the shop bought ${bought} more and sold ${sold}. The cost per unit was ${money(cost)} throughout and the selling price per unit was ${money(sell)}. Valued at cost, what is the value of the closing stock?`,
      answer: rupees(left * cost),
      commonErrors: [
        { value: rupees((bought - sold) * cost), why: 'Left out the opening stock when working out the units left.' },
        { value: rupees((open + bought) * cost), why: 'Valued all the units available and did not deduct the units sold.' },
        { value: rupees(left * sell), why: 'Valued the unsold units at selling price; closing stock is valued at cost.' },
        { value: rupees(sold * cost), why: 'Valued the units sold, not the units left.' },
      ],
      explanation: [`Units left = opening ${open} + bought ${bought} - sold ${sold} = ${left}.`, `Closing stock at cost = ${left} x ${money(cost)} = ${money(left * cost)}.`, 'The selling price is not needed.'],
    };
  }),
  verify: (q) => {
    const m = /opening stock of .+? was (\d+) .*? the shop bought (\d+) more and sold (\d+)\. The cost per unit was (₹[\d,]+) throughout/.exec(q.prompt);
    if (!m) return false;
    const cost = parseRupees(m[4]) ?? -1;
    return q.answer === (Number(m[1]) + Number(m[2]) - Number(m[3])) * cost;
  },
});

/** A believable size for each asset of a small trader, in rupees: [lowest, highest, step]. */
const ASSET_RANGE: Record<string, Range> = {
  'Cash in hand': [10000, 60000, 5000],
  'Balance at bank': [20000, 200000, 5000],
  'Closing stock': [50000, 300000, 5000],
  Debtors: [30000, 200000, 5000],
  'Bills receivable': [10000, 100000, 5000],
  Furniture: [30000, 200000, 5000],
  Machinery: [100000, 400000, 10000],
  Computers: [30000, 200000, 5000],
  Land: [200000, 600000, 10000],
  Building: [300000, 900000, 10000],
  Goodwill: [50000, 300000, 10000],
  Patents: [50000, 250000, 10000],
};
const ASSET_POOL = ['Cash in hand', 'Balance at bank', 'Closing stock', 'Debtors', 'Bills receivable', 'Furniture', 'Machinery', 'Computers', 'Land'];
const LIAB_POOL = ['Creditors', 'Bills payable', 'Bank loan', 'Outstanding salaries'];
const PENDING = [
  { noun: 'order', text: 'An order for goods worth {a} has been placed with a supplier, but the goods have not yet been delivered.' },
  { noun: 'agreement', text: 'An agreement to buy a machine for {a} next month has been signed, but nothing has been paid or delivered.' },
  { noun: 'enquiry', text: 'A customer has enquired about goods worth {a}, but no order has been placed yet.' },
  { noun: 'quotation', text: 'A supplier has sent a quotation of {a} for goods the firm may buy next month, and the firm has not accepted it.' },
];

/** Capital as assets less liabilities, with a pending order that is not yet a transaction. */
const iaCapitalFromList = numericTemplate({
  id: 'ia-capital-from-list',
  topicId: T,
  conceptId: C_ASSETS,
  difficulty: 'complex',
  unit: 'rupees',
  generate: (rng) => {
    const assets = rng.shuffle(ASSET_POOL).slice(0, 4).map((name) => ({ name, v: rs(rng, ...ASSET_RANGE[name]) }));
    const liabs = rng.shuffle(LIAB_POOL).slice(0, 2).map((name) => ({ name, v: rs(rng, 10000, 120000, 5000) }));
    const a = sum(assets.map((x) => x.v));
    const l = sum(liabs.map((x) => x.v));
    if (a - l < 50000) return null;
    const pending = rs(rng, 10000, 100000, 5000);
    const fact = rng.pick(PENDING);
    const show = (xs: { name: string; v: number }[]): string => xs.map((x) => `${x.name} ${money(x.v)}`).join(', ');
    return {
      prompt: `On 31 March a trader's records show the following. Assets: ${show(assets)}. Liabilities: ${show(liabs)}. Other fact: ${fill(fact.text, money(pending))} What is the trader's capital on 31 March?`,
      answer: rupees(a - l),
      commonErrors: [
        { value: rupees(a + l), why: 'Added the liabilities to the assets instead of deducting them.' },
        { value: rupees(a), why: 'Gave the total assets and forgot to deduct the liabilities.' },
        { value: rupees(a - l - pending), why: `Deducted the ${fact.noun} as if it were already a liability; no transaction has taken place yet.` },
        { value: rupees(a - l + pending), why: `Counted the ${fact.noun} as if it were already an asset; no transaction has taken place yet.` },
      ],
      explanation: [`Assets = ${assets.map((x) => money(x.v)).join(' + ')} = ${money(a)}.`, `Liabilities = ${liabs.map((x) => money(x.v)).join(' + ')} = ${money(l)}.`, `Capital = Assets - Liabilities = ${money(a)} - ${money(l)} = ${money(a - l)}.`, `The ${fact.noun} is not a transaction yet, so it is left out.`],
    };
  },
  verify: (q) => {
    const m = /Assets: (.*?)\. Liabilities: (.*?)\. Other fact:/.exec(q.prompt);
    if (!m) return false;
    return q.answer === sum(amountsIn(m[1])) - sum(amountsIn(m[2]));
  },
});

const CURRENT_POOL = ['Cash in hand', 'Balance at bank', 'Closing stock', 'Debtors', 'Bills receivable'];
const NONCURRENT_POOL = ['Land', 'Building', 'Machinery', 'Furniture', 'Computers', 'Goodwill', 'Patents'];

/** Total of the current, or of the non-current, assets in a list. */
const iaAssetsTotal = numericTemplate({
  id: 'ia-assets-total',
  topicId: T,
  conceptId: C_ASSETS,
  difficulty: 'medium',
  unit: 'rupees',
  generate: (rng) => {
    const cur = rng.shuffle(CURRENT_POOL).slice(0, 3).map((name) => ({ name, v: rs(rng, ...ASSET_RANGE[name]) }));
    const non = rng.shuffle(NONCURRENT_POOL).slice(0, 3).map((name) => ({ name, v: rs(rng, ...ASSET_RANGE[name]) }));
    const items = rng.shuffle([...cur, ...non]);
    const askCurrent = rng.next() < 0.5;
    const curTotal = sum(cur.map((x) => x.v));
    const nonTotal = sum(non.map((x) => x.v));
    const shown = items.map((x) => `${x.name} ${money(x.v)}`).join(', ');
    const biggestCurrent = Math.max(...cur.map((x) => x.v));
    return {
      prompt: `A firm's assets are: ${shown}. What is the total of its ${askCurrent ? 'current' : 'non-current'} assets?`,
      answer: rupees(askCurrent ? curTotal : nonTotal),
      commonErrors: askCurrent
        ? [
            { value: rupees(curTotal + nonTotal), why: 'Added all the assets, including the non-current ones.' },
            { value: rupees(nonTotal), why: 'Totalled the non-current assets instead of the current ones.' },
            { value: rupees(curTotal - biggestCurrent), why: 'Left out the largest current asset.' },
          ]
        : [
            { value: rupees(curTotal + nonTotal), why: 'Added all the assets, including the current ones.' },
            { value: rupees(curTotal), why: 'Totalled the current assets instead of the non-current ones.' },
            { value: rupees(nonTotal - Math.max(...non.map((x) => x.v))), why: 'Left out the largest non-current asset.' },
          ],
      explanation: askCurrent
        ? [`Current assets in the list: ${cur.map((x) => x.name).join(', ')}.`, `Total = ${cur.map((x) => money(x.v)).join(' + ')} = ${money(curTotal)}.`]
        : [`Non-current assets in the list: ${non.map((x) => x.name).join(', ')}.`, `Total = ${non.map((x) => money(x.v)).join(' + ')} = ${money(nonTotal)}.`],
    };
  },
  verify: (q) => {
    const m = /assets are: (.*?)\. What is the total of its (current|non-current) assets\?$/.exec(q.prompt);
    if (!m) return false;
    const wanted = m[2] === 'current' ? CURRENT_POOL : NONCURRENT_POOL;
    const total = m[1]
      .split(', ')
      .filter((entry) => wanted.some((n) => entry.startsWith(`${n} ₹`)))
      .reduce((s, entry) => s + (amountsIn(entry)[0] ?? 0), 0);
    return q.answer === total;
  },
});

/** Trade receivables (debtors and bills receivable) or trade payables (creditors and bills payable) from a list. */
const iaTradeReceivables = numericTemplate({
  id: 'ia-trade-receivables',
  topicId: T,
  conceptId: C_TRADE,
  difficulty: 'medium',
  unit: 'rupees',
  generate: (rng) => {
    const v = {
      debtors: rs(rng, 20000, 300000, 5000),
      bills: rs(rng, 10000, 100000, 5000),
      creditors: rs(rng, 20000, 300000, 5000),
      billsPay: rs(rng, 10000, 100000, 5000),
      cash: rs(rng, 10000, 100000, 5000),
      loan: rs(rng, 50000, 400000, 5000),
    };
    const receivables = rng.next() < 0.5;
    const list = [
      `Debtors ${money(v.debtors)}`,
      `Bills receivable ${money(v.bills)}`,
      `Creditors ${money(v.creditors)}`,
      `Bills payable ${money(v.billsPay)}`,
      `Cash in hand ${money(v.cash)}`,
      `Bank loan ${money(v.loan)}`,
    ];
    const total = receivables ? v.debtors + v.bills : v.creditors + v.billsPay;
    return {
      prompt: `A firm's balances are: ${rng.shuffle(list).join(', ')}. What is the amount of its trade ${receivables ? 'receivables' : 'payables'}?`,
      answer: rupees(total),
      commonErrors: receivables
        ? [
            { value: rupees(v.debtors), why: 'Counted only the debtors and left out the bills receivable.' },
            { value: rupees(v.debtors + v.bills + v.cash), why: 'Added cash in hand, which is not owed by any customer.' },
            { value: rupees(v.creditors + v.billsPay), why: 'Took the amounts the firm owes as the amounts it is owed.' },
          ]
        : [
            { value: rupees(v.creditors), why: 'Counted only the creditors and left out the bills payable.' },
            { value: rupees(v.creditors + v.billsPay + v.loan), why: 'Added the bank loan, which is borrowing and not owed to suppliers for goods.' },
            { value: rupees(v.debtors + v.bills), why: 'Took the amounts the firm is owed as the amounts it owes.' },
          ],
      explanation: receivables
        ? ['Trade receivables = Debtors + Bills receivable.', `${money(v.debtors)} + ${money(v.bills)} = ${money(total)}.`, 'Cash, creditors, bills payable and the bank loan are not trade receivables.']
        : ['Trade payables = Creditors + Bills payable.', `${money(v.creditors)} + ${money(v.billsPay)} = ${money(total)}.`, 'Cash, debtors, bills receivable and the bank loan are not trade payables.'],
    };
  },
  verify: (q) => {
    const m = /balances are: (.*?)\. What is the amount of its trade (receivables|payables)\?$/.exec(q.prompt);
    if (!m) return false;
    const want = m[2] === 'receivables' ? ['Debtors ', 'Bills receivable '] : ['Creditors ', 'Bills payable '];
    const total = m[1]
      .split(', ')
      .filter((e) => want.some((w) => e.startsWith(w)))
      .reduce((s, e) => s + (amountsIn(e)[0] ?? 0), 0);
    return q.answer === total;
  },
});


// ---------------------------------------------------------------------------------------------------------------
// The role of accounting in a business and the types of accounting information, added after the check against the CBSE 2025-26 syllabus, which names both in its first unit.
// ---------------------------------------------------------------------------------------------------------------

const INFO_TYPES = {
  result: 'Information about the profit or loss of the period',
  position: 'Information about the financial position: what is owned, owed and invested',
  cash: 'Information about the flow of cash in and out',
  none: 'None: accounting does not report this',
} as const;
type InfoType = keyof typeof INFO_TYPES;
const INFO_SLIP: Record<InfoType, string> = {
  result: 'Profit or loss tells how the year went (revenue less expenses), not this.',
  position: 'The financial position is what is owned and owed on one date, not this.',
  cash: 'The flow of cash tells where cash came from and went, not this.',
  none: 'Accounting does report this: it is one of its three types of information.',
};

const iaInfoTypeFacts = (items: { q: string; type: Exclude<InfoType, 'none'>; why: string }[]) =>
  items.map(({ q, type, why }) => ({
    prompt: q,
    correct: INFO_TYPES[type],
    distractors: (Object.keys(INFO_TYPES) as InfoType[]).filter((k) => k !== type).map((k) => ({ text: INFO_TYPES[k], why: INFO_SLIP[k] })),
    explanation: why,
  }));

const iaInfoType = factsTemplate({
  id: 'ia-info-type', topicId: T, conceptId: 'ia-users', difficulty: 'easy',
  facts: iaInfoTypeFacts([
    { q: 'How much did the business earn this year after all its expenses? Which type of accounting information answers this?', type: 'result', why: 'Revenues less expenses give the profit or loss of the period, reported in the profit and loss account.' },
    { q: 'What did the business own and owe on 31 March? Which type of accounting information answers this?', type: 'position', why: 'Assets, liabilities and capital on a date make up the financial position, shown in the balance sheet.' },
    { q: 'How much cash came into the business during the year, and where did it go? Which type of accounting information answers this?', type: 'cash', why: 'Receipts and payments of cash make up the information about cash flows.' },
    { q: 'What was the owner\'s capital in the business at the end of the year? Which type of accounting information answers this?', type: 'position', why: 'Capital on a date is part of the financial position.' },
    { q: 'Were the sales of the year enough to cover the costs of the year? Which type of accounting information answers this?', type: 'result', why: 'Comparing the revenue and the expenses of a period is the profit or loss.' },
  ]),
});

/** Hints of the questions that ask which type of accounting information a user needs. */
const INFO_HINTS = [
  'Ask what the user is trying to decide, and over what span: one date, a whole period, or the coming weeks.',
  'One date (owned and owed): the financial position. A period (earned less spent): profit or loss. Money in and out: the flow of cash.',
];

// Version 2: the supplier's question asks about the cash coming in and going out over the next month, which only the
// flow of cash answers (asked "whether the business can pay", the financial position could be defended too), and the
// questions have hints of their own.
const iaInfoNeed = factsTemplate({
  id: 'ia-info-need', version: 2, topicId: T, conceptId: 'ia-users', difficulty: 'medium',
  facts: iaInfoTypeFacts([
    { q: 'A supplier asked to sell on 30 days\' credit wants to know how much cash will come into the business and go out of it over the next month. Which type of accounting information helps most?', type: 'cash', why: 'Cash coming in and going out over a month is the flow of cash; the position on one date says nothing about the month ahead.' },
    { q: 'The owner wants to know whether the year\'s trading was worth the effort. Which type of accounting information helps most?', type: 'result', why: 'Whether trading paid off is the profit or loss of the year.' },
    { q: 'A bank asked for a loan wants to see what the business owns that could secure it, and what it already owes. Which type of accounting information helps most?', type: 'position', why: 'What is owned and owed on a date is the financial position.' },
    { q: 'The income tax department wants to check the income on which tax is due. Which type of accounting information helps most?', type: 'result', why: 'Tax is charged on the profit of the year.' },
  ]).map((f) => ({ ...f, hints: INFO_HINTS })),
});

const ROLES = {
  memory: 'It keeps a systematic record, the memory of the business',
  decide: 'It gives the owner and the managers information for planning and decisions',
  tell: 'It communicates results and position to people outside who deal with the business',
  law: 'It helps the business meet its legal and tax obligations',
} as const;
type Role = keyof typeof ROLES;
const ROLE_SLIP: Record<Role, string> = {
  memory: 'Keeping the record is the base of everything, but the point here is a different use of it.',
  decide: 'That role is the owner and the managers using the figures to plan and decide inside the business; this situation shows a different use.',
  tell: 'Communicating to outsiders is a different role from the one this situation shows.',
  law: 'Meeting the law and tax is a different role from the one this situation shows.',
};
const iaRole = factsTemplate({
  id: 'ia-role', topicId: T, conceptId: 'ia-advantages', difficulty: 'easy',
  facts: ([
    ['A shopkeeper finds out from the books how much a customer owed eighteen months ago.', 'memory', 'No one can remember every dealing: the books keep them, so they can be looked up.'],
    ['The owner compares the profit of two branches before deciding which one to expand.', 'decide', 'Accounting figures are used to plan and decide.'],
    ['A bank reads the accounts of a firm before agreeing to a loan.', 'tell', 'The accounts carry information to outsiders who deal with the business.'],
    ['The business prepares its GST returns from its books.', 'law', 'Tax returns and other legal returns are prepared from the accounting records.'],
    ['A trader can show the date and amount of every payment to a supplier who claims more money.', 'memory', 'The record settles the dispute: it is the memory of the business.'],
    ['Investors read the published accounts of a company before buying its shares.', 'tell', 'Accounts tell outsiders how the business is doing.'],
  ] as [string, Role, string][]).map(([situation, role, why]) => ({
    prompt: `${situation} Which role of accounting does this show?`,
    correct: ROLES[role],
    distractors: (Object.keys(ROLES) as Role[]).filter((k) => k !== role).map((k) => ({ text: ROLES[k], why: ROLE_SLIP[k] })),
    explanation: why,
  })),
});

const iaRoleLimit = factsTemplate({
  id: 'ia-role-limit', topicId: T, conceptId: 'ia-advantages', difficulty: 'medium',
  facts: [
    {
      prompt: 'Which of these is NOT something accounting does for a business?',
      correct: 'It records events that cannot be measured in money, such as a quarrel between two managers',
      distractors: [
        { text: 'It measures the profit or loss of each year', why: 'Measuring profit is a central role of accounting, so it is not the odd one out.' },
        { text: 'It shows what the business owns and owes', why: 'Showing the financial position is a role of accounting.' },
        { text: 'It keeps a record of every transaction', why: 'Keeping the record is a role of accounting.' },
      ],
      explanation: 'Accounting records only what can be expressed in money (the money measurement concept).',
    },
    {
      prompt: 'Which of these does accounting NOT do?',
      correct: 'Guarantee that the business will make a profit',
      distractors: [
        { text: 'Give the owner information for decisions', why: 'Information for decisions is a role of accounting.' },
        { text: 'Provide the figures for tax returns', why: 'Tax returns are prepared from the accounts.' },
        { text: 'Help compare the results of different years', why: 'Comparison is a use of accounting information.' },
      ],
      explanation: 'Accounting reports and informs; whether the business makes a profit depends on how it is run.',
    },
    {
      prompt: 'Which of these does accounting NOT show?',
      correct: 'The present market value of every asset',
      distractors: [
        { text: 'The profit or loss of the year', why: 'Profit or loss is reported, so this is not the odd one out.' },
        { text: 'The capital of the owner', why: 'Capital is shown in the balance sheet.' },
        { text: 'The cash received and paid', why: 'Cash flows are a type of accounting information.' },
      ],
      explanation: 'Assets are recorded at cost (less depreciation), not at what they would fetch today.',
    },
  ],
});

const roleAndInformation: Template[] = [iaInfoType, iaInfoNeed, iaRole, iaRoleLimit];

// ---------------------------------------------------------------------------------------------------------------
// Added in the quality pass after the audit of Class 11: the kinds of voucher, the parts of reliability and relevance,
// and matching the columns. They stand on a level of their own and outside the mock papers (generators/outsidePapers.ts).
// ---------------------------------------------------------------------------------------------------------------

/** The kinds of voucher. A cash voucher is for cash alone here, so that a cheque never makes two answers defensible. */
const VOUCHER_KINDS = {
  debit: 'Debit voucher (a cash voucher for cash paid)',
  credit: 'Credit voucher (a cash voucher for cash received)',
  transfer: 'Transfer (journal) voucher, for a dealing in which no cash moves',
  supporting: 'Supporting voucher (source document), the paper that proves the dealing',
} as const;
type VoucherKind = keyof typeof VOUCHER_KINDS;
const VOUCHER_SLIP: Record<VoucherKind, string> = {
  debit: 'A debit voucher is prepared when cash is paid out; that is not what happens here.',
  credit: 'A credit voucher is prepared when cash is received; that is not what happens here.',
  transfer: 'A transfer voucher is for a dealing in which no cash moves; here cash moves, or the paper asked about is the proof itself.',
  supporting: 'A supporting voucher is the bill, cash memo or receipt that proves the dealing, not the voucher the accountant prepares from it.',
};
const VOUCHER_HINTS = [
  'First ask what the paper is: the proof of the dealing from outside, or the voucher the accountant prepares. Then ask whether cash moves, and which way.',
  'Cash paid: debit voucher. Cash received: credit voucher. No cash at all (credit dealings, adjustments): transfer voucher. The bill, cash memo or receipt itself: supporting voucher.',
];

const iaVoucherKind = factsTemplate({
  id: 'ia-voucher-kind', topicId: T, conceptId: C_TRADE, difficulty: 'medium',
  facts: ([
    ['Gupta Electricals pays ₹4,500 in cash for the shop\'s electricity bill. Which voucher does its accountant prepare?', 'debit', 'Cash goes out, so a debit voucher (a cash voucher for a payment) is prepared, backed by the electricity bill.'],
    ['Sunrise Coaching Centre pays ₹12,000 in cash as the month\'s salary to a teacher. Which voucher does its accountant prepare?', 'debit', 'Cash is paid, so the voucher is a debit voucher.'],
    ['Meera Medicals receives ₹8,000 in cash from a customer who owed it for medicines. Which voucher does its accountant prepare?', 'credit', 'Cash comes in, so a credit voucher (a cash voucher for a receipt) is prepared.'],
    ['Anand Bakery sells cakes for ₹3,200 in cash at its counter. Which voucher does its accountant prepare for the day\'s cash sales?', 'credit', 'Cash is received, so the voucher is a credit voucher.'],
    ['Patel Hardware buys goods worth ₹40,000 on credit from Shah Steel. Which voucher does its accountant prepare?', 'transfer', 'No cash moves: the purchase is on credit, so a transfer (journal) voucher is prepared.'],
    ['Joseph Transport charges depreciation of ₹25,000 on its trucks at the year end. Which voucher does its accountant prepare?', 'transfer', 'Depreciation is an adjustment in which no cash moves, so a transfer voucher is prepared.'],
    ['The owner of Rao Textiles takes cloth worth ₹2,000 from the shop for home use. Which voucher does its accountant prepare?', 'transfer', 'Goods, not cash, are taken out: no cash moves, so it is a transfer voucher.'],
    ['Krishna Kirana Store buys a weighing scale for ₹3,000 in cash and receives a cash memo from the seller. What is that cash memo, in the books of the store?', 'supporting', 'The cash memo is the proof of the purchase: a supporting voucher (source document) from which the debit voucher is prepared.'],
    ['Green Leaf Clinic pays ₹15,000 rent in cash and the landlord gives a signed receipt. What is that receipt, in the books of the clinic?', 'supporting', 'The receipt proves the payment: it is a supporting voucher (source document), and the debit voucher is prepared from it.'],
    ['Sahil Mobiles receives an invoice from its supplier for phones bought on credit. What is that invoice, in the books of Sahil Mobiles?', 'supporting', 'The invoice proves the credit purchase: it is a supporting voucher (source document), and the transfer voucher is prepared from it.'],
  ] as [string, VoucherKind, string][]).map(([prompt, kind, why]) => ({
    prompt,
    correct: VOUCHER_KINDS[kind],
    distractors: (Object.keys(VOUCHER_KINDS) as VoucherKind[]).filter((k) => k !== kind).map((k) => ({ text: VOUCHER_KINDS[k], why: VOUCHER_SLIP[k] })),
    explanation: why,
    hints: VOUCHER_HINTS,
  })),
});

/** The parts of reliability and relevance, and the two other qualities, with the quality each belongs to. */
const QUALITY_PARTS = {
  verifiability: 'Verifiability, a part of reliability',
  neutrality: 'Neutrality (freedom from bias), a part of reliability',
  faithful: 'Faithful representation, a part of reliability',
  timeliness: 'Timeliness, a part of relevance',
  predictive: 'Predictive value, a part of relevance',
  feedback: 'Feedback value, a part of relevance',
  understandability: 'Understandability',
  comparability: 'Comparability',
} as const;
type QualityPart = keyof typeof QUALITY_PARTS;
const QUALITY_PART_MEANS: Record<QualityPart, string> = {
  verifiability: 'other people checking the figures would reach the same amounts from the same evidence',
  neutrality: 'the figures are not slanted to please the owner or anyone else',
  faithful: 'the figures show what really happened',
  timeliness: 'the information reaches the user before the decision is taken',
  predictive: 'the information helps the user to forecast what is likely to happen',
  feedback: 'the information confirms or corrects what the user expected earlier',
  understandability: 'a user with a fair knowledge of business can follow the information',
  comparability: 'the information can be set beside that of other years or other firms',
};
const QUALITY_PART_HINTS = [
  'Ask what is good about the information in the situation: it can be checked, it is unbiased, it is true to the facts, it comes in time, it helps to forecast, or it confirms an earlier expectation.',
  'Verifiability, neutrality and faithful representation make information reliable; timeliness, predictive value and feedback value make it relevant.',
];
/** Each situation names its own two close options: the parts most often confused with the right one. */
const iaQualityParts = factsTemplate({
  id: 'ia-quality-parts', topicId: T, conceptId: C_QUALITIES, difficulty: 'medium',
  facts: ([
    ['Two auditors who check the books of Verma Agro Inputs separately both trace each sale to an invoice and arrive at the same total of ₹18,40,000.', 'verifiability', ['neutrality', 'faithful', 'comparability']],
    ['The accountant of Desai Builders reports a loss for the year exactly as the books show it, although the owner wanted a small profit shown to impress a bank.', 'neutrality', ['verifiability', 'timeliness', 'understandability']],
    ['Kapoor Furnishings shows the goods destroyed in a godown fire as a loss, instead of leaving them in its stock figure as if they still existed.', 'faithful', ['neutrality', 'predictive', 'comparability']],
    ['The manager of Hussain Cold Storage receives each week\'s figures of stock and cash every Monday morning, before deciding what to buy that week.', 'timeliness', ['feedback', 'predictive', 'verifiability']],
    ['Using the monthly sales of the last three years, the owner of Lotus Garments estimates the sales of the coming festival season.', 'predictive', ['feedback', 'timeliness', 'comparability']],
    ['At the year end the owner of Bharat Diagnostics finds that the actual profit was close to the figure forecast in April, which confirms that the plan was sound.', 'feedback', ['predictive', 'verifiability', 'timeliness']],
    ['Sen Travels adds a short note in plain words under each figure of its statements, so that the owner, who is not an accountant, can follow them.', 'understandability', ['comparability', 'faithful', 'timeliness']],
    ['Two dairies of the same size in Anand follow the same method for valuing their stock, so a bank can set their statements side by side.', 'comparability', ['understandability', 'verifiability', 'neutrality']],
  ] as [string, QualityPart, QualityPart[]][]).map(([situation, part, close]) => ({
    prompt: `${situation} Which quality of accounting information does this show?`,
    correct: QUALITY_PARTS[part],
    distractors: close.map((k) => ({ text: QUALITY_PARTS[k], why: `Took it for ${QUALITY_PARTS[k].toLowerCase()}, which means ${QUALITY_PART_MEANS[k]}; here the point is that ${QUALITY_PART_MEANS[part]}.` })),
    explanation: `${QUALITY_PARTS[part]}: ${QUALITY_PART_MEANS[part]}.`,
    hints: QUALITY_PART_HINTS,
  })),
});

/** Pairs for "match the columns": a term and the line that describes it, in families that are matched together. */
const MATCH_FAMILIES: { title: string; left: string; right: string; pairs: [string, string][] }[] = [
  {
    title: 'users and what they want to know', left: 'User', right: 'Main interest',
    pairs: [
      ['Bank that has lent money', 'Whether interest and the loan will be paid on time'],
      ['Supplier selling on credit', 'Whether bills for goods will be paid within the credit period'],
      ['Income tax department', 'Whether the profit on which tax is charged is correct'],
      ['Would-be investor', 'Whether the business is profitable and the money safe'],
      ['Sales manager', 'Sales by product and area, to set targets'],
      ['Customer who needs regular supplies', 'Whether the business will keep supplying and honouring warranties'],
    ],
  },
  {
    title: 'steps of the accounting process and what each does', left: 'Step', right: 'What it does',
    pairs: [
      ['Identifying', 'Picks out the events that are transactions'],
      ['Measuring', 'Puts a money value on each transaction'],
      ['Recording', 'Writes transactions in the journal in date order'],
      ['Classifying', 'Groups the entries under their ledger accounts'],
      ['Summarising', 'Prepares the trial balance and the financial statements'],
      ['Communicating', 'Gives the reports to their users'],
    ],
  },
  {
    title: 'terms and their meanings', left: 'Term', right: 'Meaning',
    pairs: [
      ['Drawings', 'What the owner takes out for personal use'],
      ['Capital', 'What the owner has invested, owed to the owner'],
      ['Liability', 'What the business owes to outsiders'],
      ['Trade discount', 'A reduction in the list price, not entered in the books'],
      ['Cash discount', 'A concession for prompt payment, entered in the books'],
      ['Goodwill', 'An intangible asset: the extra value of a well-known business'],
    ],
  },
  {
    title: 'qualities of information and what they mean', left: 'Quality', right: 'Meaning',
    pairs: [
      ['Reliability', 'Free from error and bias, backed by evidence'],
      ['Relevance', 'Able to affect a decision and available in time'],
      ['Understandability', 'Can be followed by a user with fair knowledge of business'],
      ['Comparability', 'Can be set beside other years and other firms'],
    ],
  },
];
const ROMAN = ['(i)', '(ii)', '(iii)', '(iv)'];
const LETTERS = ['(a)', '(b)', '(c)', '(d)'];
const matching = (order: number[]): string => order.map((r, i) => `${ROMAN[i]} ${LETTERS[r]}`).join(', ');

/** Match four terms of a family with their descriptions; the wrong options swap two matches, each a named slip. */
const iaMatchColumns = mcqTemplate({
  id: 'ia-match-columns', topicId: T, conceptId: C_MEANING, difficulty: 'medium',
  generate: (rng) => {
    const fam = rng.pick(MATCH_FAMILIES);
    const chosen = rng.shuffle(fam.pairs).slice(0, 4);
    // Column B in an order of its own: rightAt[j] is the pair whose description stands at letter j.
    const rightAt = rng.shuffle([0, 1, 2, 3]);
    if (rightAt.every((p, j) => p === j)) return null; // never print Column B already in the order of Column A
    const answer = [0, 1, 2, 3].map((i) => rightAt.indexOf(i));
    const swaps: [number, number][] = rng.shuffle([[0, 1], [2, 3], [0, 2], [1, 3], [0, 3], [1, 2]] as [number, number][]).slice(0, 4);
    const distractors = swaps.map(([x, y]) => {
      const wrong = [...answer];
      [wrong[x], wrong[y]] = [wrong[y], wrong[x]];
      return {
        text: matching(wrong),
        why: `Swapped the matches of ${ROMAN[x]} ${chosen[x][0]} and ${ROMAN[y]} ${chosen[y][0]}: ${chosen[x][0]} goes with "${chosen[x][1]}".`,
      };
    });
    const lines = [
      `Match the ${fam.title}. Which option matches Column A with Column B correctly?`,
      `Column A (${fam.left}): ${chosen.map((p, i) => `${ROMAN[i]} ${p[0]}`).join('; ')}`,
      `Column B (${fam.right}): ${rightAt.map((p, j) => `${LETTERS[j]} ${chosen[p][1]}`).join('; ')}`,
    ];
    return {
      prompt: lines.join('\n'),
      correct: matching(answer),
      distractors,
      explanation: chosen.map((p, i) => `${ROMAN[i]} ${p[0]}: ${LETTERS[answer[i]]} ${p[1]}.`).join(' '),
      hints: [
        'Take the items of Column A one at a time and find the one line of Column B that fits; leave the options until the end.',
        'Start with the pair you are surest of, then the next: each line of Column B is used once.',
      ],
    };
  },
  // Independent check: read the two columns back from the prompt and match each term through the bank.
  verify: (q) => {
    const [, a, b] = q.prompt.split('\n');
    const fam = MATCH_FAMILIES.find((f) => q.prompt.startsWith(`Match the ${f.title}.`));
    if (!fam || a === undefined || b === undefined) return false;
    const terms = a.replace(/^Column A \([^)]*\): /, '').split('; ').map((x) => x.replace(/^\(\w+\) /, ''));
    const descs = b.replace(/^Column B \([^)]*\): /, '').split('; ').map((x) => x.replace(/^\(\w\) /, ''));
    const order = terms.map((t) => descs.indexOf(fam.pairs.find((p) => p[0] === t)?.[1] ?? ''));
    return order.every((r) => r >= 0) && correctText(q) === matching(order);
  },
});

const addedAfterAudit: Template[] = [iaVoucherKind, iaQualityParts, iaMatchColumns];

const templates: Template[] = [
  iaClassifyItem,
  iaAssetClass,
  iaLiabilityClass,
  iaExpType,
  iaGoodsOrAsset,
  iaClassifyTwo,
  iaLoanTiming,
  iaUserProfile,
  iaInternalExternal,
  iaUserNeed,
  iaProcessStep,
  iaProcessOrder,
  iaQualityMatch,
  iaBranch,
  iaBkVsAcc,
  iaFinancialTransaction,
  iaTermTrade,
  iaTermOwner,
  iaTermIncome,
  iaDefineTrade,
  iaDefineOwner,
  iaDefineIncome,
  iaProfit,
  iaTradeDiscount,
  iaTwoDiscounts,
  iaStockValue,
  iaClosingStockFlow,
  iaCapitalFromList,
  iaAssetsTotal,
  iaTradeReceivables,
  // Added after the check against the CBSE 2025-26 syllabus.
  ...roleAndInformation,
  // Added in the quality pass after the audit of Class 11.
  ...addedAfterAudit,
];

// Assertion and Reason comes last, and is on its own level and on no mock paper (see assertionReason.ts).
const assertionReason = assertionReasonTemplate({
  prefix: 'ia', topicId: 'introduction-to-accounting', conceptId: 'ia-meaning',
  items: [
    {
      answer: 'explains',
      a: 'Book-keeping is the base on which accounting rests.',
      r: 'Accounting summarises, analyses and interprets the records that book-keeping keeps.',
      aWhy: 'Without systematic records there is nothing for accounting to work on.',
      rWhy: 'Book-keeping ends with the records, and accounting takes them further.',
      link: 'Accounting works on what book-keeping records, which is why book-keeping is its base, so R explains A.',
    },
    {
      answer: 'explains',
      a: 'An order for goods worth ₹50,000 received from a customer on 5 May is not recorded in the books on that day.',
      r: 'A transaction is recorded only when value has been given or received.',
      aWhy: 'An order is only a promise: no goods have left and no money has come in.',
      rWhy: 'An event becomes a transaction when an exchange of value takes place.',
      link: 'The order is not recorded because no value has passed yet, so R explains A.',
    },
    {
      answer: 'explains',
      a: 'A computer bought by a lawyer for the office is an asset, but the same computer bought by a computer dealer for resale is goods.',
      r: 'Whether an item is goods or an asset depends on why the business bought it.',
      aWhy: 'The lawyer will use the computer for years, while the dealer means to sell it.',
      rWhy: 'The purpose of buying decides, not what the item is.',
      link: 'The two buyers have different purposes, and that is the whole of the difference, so R explains A.',
    },
    {
      answer: 'explains',
      a: 'A correct report that reaches the manager after the decision has been taken has lost its relevance.',
      r: 'Relevant information must be available in time to influence a decision.',
      aWhy: 'However accurate it is, the report can no longer affect the decision.',
      rWhy: 'Timeliness is a part of relevance.',
      link: 'The report fails because it came too late to affect the decision, so R explains A.',
    },
    {
      answer: 'explains',
      a: 'A five-year loan with eight months left to its due date on the balance sheet date is a current liability.',
      r: 'Whether a liability is current depends on the time left to its due date, counted from the balance sheet date.',
      aWhy: 'Eight months is less than a year, so the loan falls due within the next year.',
      rWhy: 'A current liability is one due within a year of the balance sheet date.',
      link: 'The test looks at the eight months left and not at the five years of the original term, so R explains A.',
    },
    {
      answer: 'not-the-reason',
      a: 'The skill of a firm\'s workforce is not shown in its accounts.',
      r: 'Accounting information may not be free from personal bias.',
      aWhy: 'Accounting records only what can be measured in money, and skill cannot be.',
      rWhy: 'Estimates and judgement can bring bias into the figures.',
      link: 'Both are limitations of accounting, but skill is left out because it cannot be stated in money, not because of bias.',
    },
    {
      answer: 'not-the-reason',
      a: 'A bank studies the accounts of a firm before lending to it.',
      r: 'Tax authorities use accounting information to check the income on which tax is charged.',
      aWhy: 'A lender wants to know whether the interest and the loan can be repaid.',
      rWhy: 'Tax authorities are users of accounting information too.',
      link: 'Each user has a need of its own. What tax authorities want says nothing about why a bank reads the accounts.',
    },
    {
      answer: 'not-the-reason',
      a: 'Goodwill is an intangible asset.',
      r: 'Non-current assets are kept in the business for many years.',
      aWhy: 'Goodwill has value but cannot be seen or touched.',
      rWhy: 'That is what makes an asset non-current.',
      link: 'R explains why an asset is non-current. Goodwill is intangible because it has no physical form.',
    },
    {
      answer: 'a-only',
      a: 'Accounting helps the owner to find the profit of a period.',
      r: 'The profit of a period is the same as the cash received in that period.',
      aWhy: 'Finding the profit or loss of a period is an objective of accounting.',
      rWhy: 'Profit is revenue less expenses, and cash received need not be revenue: a loan received is cash, but it is not profit.',
    },
    {
      answer: 'a-only',
      a: 'Wages of ₹30,000 paid to workers for building the firm\'s own godown are capital expenditure.',
      r: 'Wages are always revenue expenditure.',
      aWhy: 'The wages are part of the cost of a long-lasting asset.',
      rWhy: 'Wages are usually revenue expenditure, but not when they are spent on creating an asset.',
    },
    {
      answer: 'r-only',
      a: 'Book-keeping, accounting and accountancy are three names for one thing.',
      r: 'Book-keeping keeps the records, while accounting reports and interprets them.',
      aWhy: 'They differ: the clerical work, the use of the records, and the body of principles behind both.',
      rWhy: 'Recording is book-keeping, and accounting goes further than recording.',
    },
    {
      answer: 'r-only',
      a: 'A machine with a book value of ₹70,000 is sold for ₹80,000, so the gain is ₹80,000.',
      r: 'The gain on selling an asset is the excess of the sale price over its book value.',
      aWhy: 'The gain is ₹80,000 - ₹70,000 = ₹10,000, not the whole of the price.',
      rWhy: 'Only what is received above the book value is a gain.',
    },
  ],
});

const withAssertionReason: Template[] = [...templates, assertionReason];

export default withAssertionReason;
