import type { McqQuestion } from '@/content/types';
import type { Rng } from '@/engine/rng';
import { parseRupees } from '@/lib/money-input';
import { BEYOND_IGST_CROSS_SET_OFF } from '@/content/beyondSyllabus';
import { beyondSyllabus, factsTemplate, formatINR, mcqTemplate, numericTemplate, rupees, type Paise } from '../authoring';
import type { Distractor, Template } from '../types';
import { assertionReasonTemplate } from '../assertionReason';

const T = 'theory-base';

// ---------------------------------------------------------------------------------------------------------------
// Small helpers
// ---------------------------------------------------------------------------------------------------------------

/** Every amount in a prompt as formatINR wrote it ("₹1,25,000"), without a comma or full stop that merely follows it. */
const RUPEE_G = /₹\d(?:[\d,]*\d)?/g;
const amountsIn = (prompt: string): Paise[] => (prompt.match(RUPEE_G) ?? []).map((s) => parseRupees(s) ?? Number.NaN);
const correctText = (q: McqQuestion): string | undefined => q.options.find((o) => o.id === q.correct)?.text;
/** A whole-rupee value written the Indian way. Computations below are done in whole rupees and turned into paise at the end. */
const inr = (rs: number): string => formatINR(rupees(rs));
const pct = (prompt: string): number[] => [...prompt.matchAll(/(\d+)%/g)].map((m) => Number(m[1]));
const allWhole = (...ns: number[]): boolean => ns.every((n) => Number.isInteger(n));
/** Common errors must be positive and are only listed when they are real, so drop anything that is not. */
const errs = (...e: { value: number; why: string }[]) => e.filter((x) => Number.isInteger(x.value) && x.value > 0).map((x) => ({ ...x, value: rupees(x.value) }));
/** As errs, but also drops any value that equals the right answer or repeats an earlier one (the same number reached by two slips). */
const errsExcept = (answer: number, ...e: { value: number; why: string }[]) => {
  const seen = new Set<number>([answer]);
  return errs(...e).filter((x) => !seen.has(x.value / 100) && !!seen.add(x.value / 100));
};

const FIRMS = ['Mehta Traders', 'Kumar Electricals', 'Gupta Garments', 'Nair Stationers', 'Iyer Hardware', 'Patel Agencies', 'Singh Auto Parts', 'Reddy Foods'];
const GOODS = ['garments', 'electrical fittings', 'stationery', 'paints', 'auto parts', 'packaged foods', 'plastic goods', 'hardware items'];
/** The two general GST rates now in force. The 12% and 28% slabs were withdrawn from 22 September 2025. */
const RATES = [5, 18];

/**
 * A firm with the goods it deals in and the GST rate those goods bear (rates as they stand from 22 September 2025):
 * used where a question names the firm, the goods and the rate together, so that the three agree.
 */
interface Line {
  firm: string;
  goods: string;
  rate: 5 | 18;
}
const LINES: Line[] = [
  { firm: 'Kumar Electricals', goods: 'electrical fittings', rate: 18 },
  { firm: 'Gupta Handloom House', goods: 'cotton bedsheets and towels', rate: 5 },
  { firm: 'Iyer Hardware', goods: 'hardware items', rate: 18 },
  { firm: 'Singh Auto Parts', goods: 'auto parts', rate: 18 },
  { firm: 'Reddy Dairy Products', goods: 'butter and ghee', rate: 5 },
  { firm: 'Mehta Paints', goods: 'paints and varnishes', rate: 18 },
  { firm: 'Nair Agro Inputs', goods: 'bio-pesticides', rate: 5 },
  { firm: 'Patel Furniture Mart', goods: 'office furniture', rate: 18 },
];

// Hint pairs shared by the GST sums: a nudge, then the step.
const GST_INVOICE_HINTS = [
  'Work in the order the invoice is written: list price, trade discount, then the tax.',
  'Take the trade discount off first; GST is charged on the price after it. Within a state split the tax half and half into CGST and SGST; between states it is all IGST.',
];
const GST_SUPPLY_HINTS = [
  'First decide whether the seller and the buyer are in the same state.',
  'GST = rate % of the taxable value. Same state: CGST and SGST are half each. Different states: the whole of it is IGST. The invoice total is the value plus the tax.',
];
const GST_NET_HINTS = [
  'Work out the tax on the sales (output) and the tax paid on the purchases (input) under each head.',
  'Under each head, output tax less input credit is payable; if the credit is larger, nothing is paid and the rest is carried forward. CGST credit never pays SGST, nor the reverse.',
];

interface Place {
  city: string;
  state: string;
}
const PLACES: Place[] = [
  { city: 'Pune', state: 'Maharashtra' }, { city: 'Nashik', state: 'Maharashtra' }, { city: 'Nagpur', state: 'Maharashtra' },
  { city: 'Chennai', state: 'Tamil Nadu' }, { city: 'Coimbatore', state: 'Tamil Nadu' }, { city: 'Madurai', state: 'Tamil Nadu' },
  { city: 'Surat', state: 'Gujarat' }, { city: 'Rajkot', state: 'Gujarat' }, { city: 'Vadodara', state: 'Gujarat' },
  { city: 'Jaipur', state: 'Rajasthan' }, { city: 'Jodhpur', state: 'Rajasthan' }, { city: 'Kochi', state: 'Kerala' },
  { city: 'Kozhikode', state: 'Kerala' }, { city: 'Lucknow', state: 'Uttar Pradesh' }, { city: 'Kanpur', state: 'Uttar Pradesh' },
  { city: 'Indore', state: 'Madhya Pradesh' }, { city: 'Bhopal', state: 'Madhya Pradesh' }, { city: 'Bengaluru', state: 'Karnataka' },
  { city: 'Mysuru', state: 'Karnataka' }, { city: 'Hubballi', state: 'Karnataka' }, { city: 'Vijayawada', state: 'Andhra Pradesh' },
  { city: 'Visakhapatnam', state: 'Andhra Pradesh' }, { city: 'Ludhiana', state: 'Punjab' }, { city: 'Amritsar', state: 'Punjab' },
  { city: 'Kolkata', state: 'West Bengal' }, { city: 'Howrah', state: 'West Bengal' }, { city: 'Hyderabad', state: 'Telangana' },
  { city: 'Warangal', state: 'Telangana' }, { city: 'Patna', state: 'Bihar' }, { city: 'Gaya', state: 'Bihar' },
];

/** Two different places, in the same state or in different states. */
function twoPlaces(rng: Rng, sameState: boolean): [Place, Place] {
  const first = rng.pick(PLACES);
  const pool = PLACES.filter((p) => p.city !== first.city && (p.state === first.state) === sameState);
  return [first, rng.pick(pool)];
}

/** A bank of ready-made multiple-choice facts: one question per entry, each wrong option a named mistake. */
interface Fact {
  q: string;
  right: string;
  wrong: Distractor[];
  because: string;
}
/** `hints` and `version` are given only to a bank whose questions were changed to carry hints of their own. */
function factTemplate(id: string, conceptId: string, difficulty: 'easy' | 'medium' | 'complex', bank: Fact[], extra: { hints?: string[]; version?: number } = {}) {
  return mcqTemplate({
    id,
    ...(extra.version ? { version: extra.version } : {}),
    topicId: T,
    conceptId,
    difficulty,
    generate: (rng) => {
      const f = rng.pick(bank);
      return { prompt: f.q, correct: f.right, distractors: f.wrong, explanation: f.because, ...(extra.hints ? { hints: extra.hints } : {}) };
    },
    // The bank is the independent record: the question must still be one of its entries, with its right answer.
    verify: (q) => bank.some((f) => f.q === q.prompt && f.right === correctText(q) && !f.wrong.some((w) => w.text === f.right)),
  });
}

// ---------------------------------------------------------------------------------------------------------------
// The principle bank: concepts, principles and assumptions, and 50-odd scenarios that follow or break them
// ---------------------------------------------------------------------------------------------------------------

type Pr =
  | 'entity' | 'money' | 'goingConcern' | 'period' | 'disclosure' | 'materiality' | 'prudence'
  | 'cost' | 'matching' | 'dual' | 'revenue' | 'objectivity' | 'consistency' | 'accrual';

const NAMES: Record<Pr, string> = {
  entity: 'Business Entity Concept',
  money: 'Money Measurement Concept',
  goingConcern: 'Going Concern Assumption',
  period: 'Accounting Period Concept',
  disclosure: 'Full Disclosure Principle',
  materiality: 'Materiality Principle',
  prudence: 'Prudence (Conservatism) Principle',
  cost: 'Historical Cost Concept',
  matching: 'Matching Concept',
  dual: 'Dual Aspect Concept',
  revenue: 'Revenue Recognition (Realisation) Principle',
  objectivity: 'Verifiable Objectivity Principle',
  consistency: 'Consistency Assumption',
  accrual: 'Accrual Assumption',
};

/** What each one is about, in a phrase that follows "which is about". */
const GIST: Record<Pr, string> = {
  entity: 'treating the business as separate from its owner',
  money: 'recording only what can be expressed in money',
  goingConcern: 'assuming the business will continue for the foreseeable future',
  period: 'measuring profit for fixed periods such as a year',
  disclosure: 'revealing every fact that could matter to the users of the accounts',
  materiality: 'giving attention only to items large enough to affect decisions',
  prudence: 'providing for likely losses but not anticipating profits',
  cost: 'recording assets at the price actually paid for them',
  matching: 'setting the expenses of a period against the revenue they helped to earn',
  dual: 'recording both aspects (a debit and a credit) of every transaction',
  revenue: 'recognising revenue only when it is earned and realised',
  objectivity: 'basing entries on evidence that anyone can verify',
  consistency: 'following the same methods from one year to the next',
  accrual: 'recording items when they are earned or incurred, not when cash moves',
};

/** The ones a student most often mixes each one up with. A scenario can drop any that would also fit it. */
const CONFUSED_WITH: Record<Pr, Pr[]> = {
  entity: ['dual', 'money', 'objectivity', 'disclosure', 'goingConcern'],
  money: ['objectivity', 'cost', 'entity', 'materiality', 'disclosure'],
  goingConcern: ['matching', 'period', 'cost', 'prudence', 'consistency'],
  period: ['goingConcern', 'matching', 'accrual', 'consistency', 'revenue'],
  disclosure: ['materiality', 'prudence', 'consistency', 'objectivity', 'accrual'],
  materiality: ['disclosure', 'prudence', 'matching', 'cost', 'money'],
  prudence: ['cost', 'matching', 'revenue', 'disclosure', 'consistency'],
  cost: ['objectivity', 'prudence', 'money', 'goingConcern', 'matching'],
  matching: ['accrual', 'period', 'revenue', 'prudence', 'goingConcern'],
  dual: ['entity', 'money', 'cost', 'objectivity', 'accrual'],
  revenue: ['accrual', 'matching', 'prudence', 'period', 'objectivity'],
  objectivity: ['cost', 'money', 'disclosure', 'consistency', 'dual'],
  consistency: ['period', 'disclosure', 'goingConcern', 'accrual', 'materiality'],
  accrual: ['matching', 'revenue', 'period', 'goingConcern', 'consistency'],
};

/** Used only to top up the wrong options of a scenario whose close neighbours would mostly fit it too. */
const FAR: Pr[] = ['consistency', 'materiality', 'entity', 'dual', 'period', 'disclosure', 'money', 'objectivity'];

/** The names without "concept", "principle" or "assumption", for questions that ask which of those a thing is. */
const BARE: Record<Pr, string> = {
  entity: 'Business entity',
  money: 'Money measurement',
  goingConcern: 'Going concern',
  period: 'Accounting period',
  disclosure: 'Full disclosure',
  materiality: 'Materiality',
  prudence: 'Prudence (conservatism)',
  cost: 'Historical cost',
  matching: 'Matching',
  dual: 'Dual aspect',
  revenue: 'Revenue recognition',
  objectivity: 'Verifiable objectivity',
  consistency: 'Consistency',
  accrual: 'Accrual',
};

const ASSUMPTIONS: Pr[] = ['goingConcern', 'consistency', 'accrual'];
const PRINCIPLES: Pr[] = ['entity', 'money', 'period', 'disclosure', 'materiality', 'prudence', 'cost', 'matching', 'dual', 'revenue', 'objectivity'];

interface Ctx {
  /** A round amount, a larger one (one and a half times), a small one (a few hundred rupees) and a name. */
  x: string;
  y: string;
  z: string;
  who: string;
}
interface Scenario {
  a: Pr;
  text: (c: Ctx) => string;
  /** The reason the answer is right, in a phrase. */
  point: string;
  /** True when the text describes a treatment that breaks the principle. */
  violates?: boolean;
  /** Principles that would also fit this scenario and so must not be offered as wrong options. */
  skip?: Pr[];
}

/** Women's and men's names. No scenario uses a pronoun for the person named. */
const WHO = ['Meera', 'Kiran', 'Rajesh', 'Anita', 'Suresh', 'Farida', 'Gurpreet', 'Lakshmi', 'Imran', 'Shreya'];

const SCENARIOS: Scenario[] = [
  // Business entity
  { a: 'entity', point: 'the owner\'s personal spending is not an expense of the business',
    text: (c) => `${c.who}, a sole trader, takes ${c.x} out of the shop's cash to pay for a wedding in the family, and the accountant debits it to Drawings and not to an expense account.` },
  { a: 'entity', point: 'the rent of the proprietor\'s house is a personal expense, not the shop\'s',
    text: (c) => `The accountant of a hardware shop keeps the year's rent of the proprietor's own house, ${c.x}, out of the shop's expenses and treats it as drawings.` },
  { a: 'entity', point: 'the owner\'s own bank balance is not part of the business',
    text: (c) => `A trader's personal savings of ${c.y}, kept in a private bank account, do not appear anywhere in the books of the trader's business.` },
  { a: 'entity', skip: ['dual'], point: 'the business and its owner are separate, so capital is owed by the business to the owner',
    text: (c) => `Capital of ${c.x} brought in by the owner is shown in the books as an amount the business owes to the owner.` },
  { a: 'entity', violates: true, point: 'a family holiday is the owner\'s own expense, not the business\'s',
    text: (c) => `The accountant of a bakery debits the owner's family holiday cost of ${c.x} to the bakery's Travelling Expenses account.` },

  // Money measurement
  { a: 'money', skip: ['objectivity'], point: 'a famous chef cannot be measured in money, so only the furniture is recorded',
    text: (c) => `A restaurant's books show its furniture at ${c.x}, but they do not record that its chef is famous and draws large crowds.` },
  { a: 'money', skip: ['objectivity'], point: 'the manager\'s experience cannot be stated in money',
    text: () => `The balance sheet of a firm lists stock, furniture and debtors in rupees but leaves out its manager's long experience, because that cannot be stated in money.` },
  { a: 'money', point: 'unlike things become comparable only when stated in a common unit, rupees',
    text: () => `The balance sheet of a shop adds 300 shirts, 40 tables and 12 computers into a single total by showing each lot in rupees.` },
  { a: 'money', skip: ['objectivity'], point: 'a quarrel between staff cannot be measured in money',
    text: () => `A quarrel between two senior employees is hurting the work of a firm, yet no entry is made for it in the books.` },

  // Going concern
  { a: 'goingConcern', skip: ['matching', 'cost'], point: 'the firm expects to continue, so the cost of the asset is spread over its working life',
    text: (c) => `A bus operator spreads the cost of a new bus, ${c.x}, over the many years it will serve instead of charging it all at once, because the service is expected to continue.` },
  { a: 'goingConcern', skip: ['cost', 'prudence', 'matching'], point: 'the ovens are kept for use, not for a hurried sale',
    text: () => `A bakery shows its ovens at cost less depreciation and not at what they would fetch in a hurried sale, because it expects to keep baking for many years.` },
  { a: 'goingConcern', skip: ['matching', 'cost'], point: 'the van will serve the firm beyond this year because the firm will carry on',
    text: (c) => `A hardware shop buys a delivery van for ${c.x} and records it as a fixed asset, not as an expense, because it expects to be trading for years to come.` },
  { a: 'goingConcern', violates: true, skip: ['matching', 'cost'], point: 'a business about to close should show its assets at what they will realise',
    text: (c) => `${c.who} has decided to close down the business next month, yet the accountant still values the machinery at cost less depreciation, as if it would be used for years. Which concept, principle or assumption no longer holds, so that this treatment is wrong?` },

  // Accounting period
  { a: 'period', point: 'profit is measured for a fixed period without waiting for the business to end',
    text: () => `A trader closes the books on 31 March every year to find the profit of that year, instead of waiting until the business is finally wound up.` },
  { a: 'period', violates: true, point: 'profit has to be measured at regular intervals, not only when the business ends',
    text: () => `A shopkeeper plans to work out the profit only when the shop is finally shut after fifteen years, and so keeps no yearly accounts.` },
  { a: 'period', point: 'banks and the tax department need results for each twelve-month period',
    text: () => `A firm prepares a profit and loss account and a balance sheet every twelve months because the bank and the tax department ask for them regularly.` },

  // Full disclosure
  { a: 'disclosure', skip: ['prudence', 'materiality'], point: 'a fact that could influence readers is stated in a note',
    text: (c) => `A firm has been sued for ${c.x} and the case is still pending. No provision is made, but a note under the balance sheet tells readers about the case.` },
  { a: 'disclosure', skip: ['consistency'], point: 'a change in method and its effect is told to the readers',
    text: () => `A trader changes the method of valuing stock and states the change, and its effect on profit, in a note to the accounts.` },
  { a: 'disclosure', violates: true, point: 'the pledge of stock is a fact the bank and others must be told',
    text: (c) => `A trader's balance sheet does not mention that part of the stock is pledged with a bank against a loan of ${c.x}.` },
  { a: 'disclosure', point: 'details that readers need are given in a note',
    text: () => `The balance sheet of a firm carries a note on its loan, naming the lender, the rate of interest and the security given.` },

  // Materiality
  { a: 'materiality', skip: ['matching', 'prudence'], point: 'a trivial amount is not worth spreading over several years',
    text: (c) => `A large store spends ${c.z} on a stapler and charges all of it to expenses in the year of purchase, though the stapler will last several years.` },
  { a: 'materiality', point: 'small differences would not change any reader\'s decision',
    text: () => `A big firm publishes its yearly accounts rounded to the nearest thousand rupees, because small differences do not change anyone's decisions.` },
  { a: 'materiality', skip: ['matching', 'prudence'], point: 'only the large item deserves separate treatment as an asset',
    text: (c) => `An accountant records a generator costing ${c.x} as a fixed asset but charges a packet of pins costing ${c.z} straight to expenses.` },

  // Prudence
  { a: 'prudence', skip: ['cost'], point: 'a likely loss is provided for; a gain is not taken',
    text: (c) => `A trader's stock cost ${c.y}, but it would now sell for only ${c.x}, so it is valued at ${c.x} in the balance sheet.` },
  { a: 'prudence', skip: ['matching'], point: 'a likely loss is provided for even though no debtor has defaulted yet',
    text: (c) => `A firm creates a provision of ${c.x} for doubtful debts although no customer has refused to pay so far.` },
  { a: 'prudence', skip: ['revenue', 'cost'], point: 'the expected loss is provided for at once, but the expected profit waits until the goods are sold',
    text: (c) => `At the year end a trader expects a loss of ${c.x} on one lot of goods whose price has fallen and a profit of ${c.y} on another lot whose price has risen. The loss is provided for now, but the profit is not recorded until the goods are sold.` },
  { a: 'prudence', violates: true, skip: ['cost'], point: 'a fall in the value of stock must be provided for',
    text: (c) => `Stock that cost ${c.y} can now be sold for only ${c.x}, but the accountant keeps it at ${c.y} in the balance sheet.` },

  // Historical cost
  { a: 'cost', skip: ['objectivity', 'prudence', 'goingConcern', 'consistency'], point: 'land stays at its cost, not at the present market price',
    text: (c) => `A trader bought land for ${c.x} some years ago. It is now worth ${c.y}, but the balance sheet still shows ${c.x}.` },
  { a: 'cost', skip: ['objectivity', 'prudence', 'goingConcern', 'consistency'], point: 'the asset stays at its price when bought',
    text: (c) => `Machinery bought for ${c.x} is entered at ${c.x}, its price at the time of purchase, and the entry is left unchanged when similar machines later sell for ${c.y}.` },
  { a: 'cost', skip: ['objectivity'], point: 'an asset is recorded at the amount actually paid to acquire it',
    text: (c) => `A dealer first quoted ${c.y} for a machine, but after bargaining the firm paid ${c.x}. The firm records the machine at ${c.x}, the amount it actually paid.` },
  { a: 'cost', violates: true, skip: ['objectivity', 'prudence', 'consistency'], point: 'a rise in market price is not entered in the books',
    text: (c) => `The accountant raises the value of a shop in the books from ${c.x} to ${c.y} because property prices in the area have risen.` },

  // Matching
  { a: 'matching', skip: ['accrual', 'period'], point: 'the commission is an expense of earning that year\'s sales',
    text: (c) => `A firm's year ends on 31 March. Commission of ${c.x} on that year's sales will be paid only in April, but the firm sets it against the sales of the year in which those sales were made.` },
  { a: 'matching', skip: ['accrual', 'revenue', 'period'], point: 'the cost of goods sold is set against the sales it produced',
    text: () => `To find the profit, a trader sets the cost of the goods sold during the year against the sales of the same year.` },
  { a: 'matching', skip: ['accrual', 'period'], point: 'only the part of the premium that relates to this year\'s revenue is charged',
    text: (c) => `A factory paid an annual insurance premium of ${c.x} from 1 October. At 31 March it sets only half of it against the year's revenue and carries the other half forward.` },
  { a: 'matching', violates: true, skip: ['accrual', 'period'], point: 'the expenses of earning a revenue belong in the same period as that revenue',
    text: () => `A firm that earned its revenue in one year charges the expenses of earning that revenue to the next year's accounts.` },

  // Dual aspect
  { a: 'dual', point: 'both the furniture received and the cash given are recorded, so the two sides stay equal',
    text: (c) => `A business buys furniture worth ${c.x} for cash. The books record both the furniture received and the cash given.` },
  { a: 'dual', point: 'every transaction has a debit and an equal credit',
    text: () => `Every transaction of a firm is recorded as a debit in one account and an equal credit in another account.` },
  { a: 'dual', skip: ['entity'], point: 'assets and the owner\'s claim rise together, so Assets = Liabilities + Capital still holds',
    text: (c) => `When the owner brings ${c.x} into the business, the assets and the owner's claim on them both rise by the same amount, so Assets = Liabilities + Capital still holds.` },
  { a: 'dual', skip: ['entity'], point: 'cash and the loan both rise, so the accounting equation stays balanced',
    text: (c) => `A firm takes a bank loan of ${c.x}. Cash and the loan both rise by that amount, and the accounting equation stays balanced.` },

  // Revenue recognition
  { a: 'revenue', skip: ['accrual', 'matching', 'prudence'], point: 'a sale is recognised on delivery, not on receipt of an order or an advance',
    text: (c) => `A furniture maker receives an order for ${c.y} and an advance of ${c.x}. No sale is recorded until the furniture is delivered.` },
  { a: 'revenue', skip: ['accrual', 'matching'], point: 'a credit sale is revenue when the goods are sold, not when the money comes in',
    text: (c) => `Goods worth ${c.x} are sold and delivered on credit on 28 March. The firm includes them in the sales of the year ending 31 March even though the money will come in May.` },
  { a: 'revenue', skip: ['accrual', 'matching', 'prudence', 'period'], point: 'an advance is not yet earned, so it is not this year\'s income',
    text: (c) => `A coaching centre receives ${c.x} as advance fees for next year's course. It does not treat the amount as this year's income.` },
  { a: 'revenue', violates: true, skip: ['accrual', 'matching', 'prudence'], point: 'an order is not a sale; revenue is recognised on delivery',
    text: (c) => `A trader records ${c.x} as sales on the day a customer places an order, although the goods have not yet been sent.` },

  // Verifiable objectivity
  { a: 'objectivity', skip: ['cost'], point: 'the purchase is entered only on the strength of documents that prove it',
    text: () => `An accountant records a purchase only after seeing the supplier's invoice and the bank debit advice that prove it.` },
  { a: 'objectivity', point: 'every entry has a voucher an auditor can check',
    text: () => `Every entry in a firm's cash book is backed by a cash memo, bill or receipt, so an auditor can check it.` },
  { a: 'objectivity', skip: ['cost'], point: 'stock is recorded on the evidence of a signed count sheet, not on the owner\'s say-so',
    text: (c) => `The proprietor tells the accountant that the stock is worth ${c.y}. The accountant records it only after checking a physical count sheet signed by two staff members.` },
  { a: 'objectivity', violates: true, skip: ['cost'], point: 'entries need a bill or receipt, not memory',
    text: (c) => `The accountant records a sale of ${c.x} on the basis of what the proprietor remembers, with no bill or receipt to support it.` },

  // Consistency
  { a: 'consistency', point: 'the same method is followed year after year',
    text: () => `A firm has charged depreciation on its vehicles by the same method for years and does not change the method each year to suit its profit.` },
  { a: 'consistency', point: 'the same method makes the profits of different years comparable',
    text: () => `A trader values closing stock by the same method every year, so that the profits of different years can be compared.` },
  { a: 'consistency', violates: true, skip: ['disclosure'], point: 'a method should not be changed from year to year just to alter the profit',
    text: () => `A firm valued its stock by one method last year and by a different method this year only because it raises the profit.` },

  // Accrual
  { a: 'accrual', skip: ['matching', 'revenue'], point: 'an item is recorded when it is incurred, whatever the date of payment',
    text: () => `A firm records rent for March as an expense of March although it will pay it in April. It records items when they are incurred or earned, whatever the date of cash payment or receipt.` },
  { a: 'accrual', skip: ['matching', 'revenue'], point: 'income is recorded when earned, not when the cash arrives',
    text: () => `A coaching firm records the fees earned in March as income of March though the students will pay in April, because it records what has been earned and not when cash comes.` },
  { a: 'accrual', violates: true, skip: ['matching', 'revenue', 'period'], point: 'expenses belong to the period in which they are incurred, not paid',
    text: () => `A firm records salaries only on the day they are paid in cash, so salaries of March paid in April appear in the next year's expenses.` },
];

const PLACEHOLDER: Ctx = { x: '₹#', y: '₹#', z: '₹#', who: '@' };
/** Turns a prompt into the shape of the scenario text that made it (amounts and names masked), so verify can find it again. */
const mask = (s: string): string => WHO.reduce((t, n) => t.split(n).join('@'), s.replace(RUPEE_G, '₹#'));
const scenariosIn = (prompt: string): Scenario[] => {
  const m = mask(prompt);
  return SCENARIOS.filter((s) => m.includes(s.text(PLACEHOLDER)));
};

function draw(rng: Rng): Ctx {
  const x = rng.step(20000, 480000, 20000);
  return { x: inr(x), y: inr((x * 3) / 2), z: inr(rng.pick([40, 60, 75, 90, 120, 150, 250, 350])), who: rng.pick(WHO) };
}

/**
 * The option labels of `thb-name-principle` (version 2): the three that AS-1 calls fundamental accounting assumptions
 * are labelled as such, since the CBSE list calls consistency a basic concept and the bare name could be read either
 * way. The other templates keep NAMES as they were.
 */
const OPTION_NAMES: Record<Pr, string> = {
  ...NAMES,
  goingConcern: 'Going Concern (AS-1 assumption)',
  consistency: 'Consistency (AS-1 assumption)',
  accrual: 'Accrual (AS-1 assumption)',
};

/** The neighbouring principles a student might choose instead, each with the mistake that leads to it. */
const confusions = (s: Scenario, names: Record<Pr, string> = NAMES): { p: Pr; d: Distractor }[] => {
  const fits = [s.a, ...(s.skip ?? [])];
  const close = CONFUSED_WITH[s.a].filter((p) => !fits.includes(p));
  // At least four, so that the three the engine keeps are not always the same three.
  const far = FAR.filter((p) => !fits.includes(p) && !close.includes(p)).slice(0, Math.max(0, 4 - close.length));
  return [...close, ...far].map((p) => ({
    p,
    d: {
      text: names[p],
      why: `Took it for the ${names[p]}, which is about ${GIST[p]}. Here the point is different: ${s.point}.`,
    },
  }));
};
const wrongOptions = (s: Scenario, names: Record<Pr, string> = NAMES): Distractor[] => confusions(s, names).map((c) => c.d);

const STEMS_FOLLOW = [
  'Which accounting concept, principle or assumption does this follow?',
  'This practice rests on which of the following?',
  'Name the concept, principle or assumption behind this treatment.',
];

const thbNamePrinciple = mcqTemplate({
  id: 'thb-name-principle',
  version: 2,
  topicId: T,
  conceptId: 'thb-principles',
  difficulty: 'easy',
  generate: (rng) => {
    const s = rng.pick(SCENARIOS);
    const text = s.text(draw(rng));
    // A scenario that already ends in its own question needs no stem.
    const stem = s.violates ? (text.endsWith('?') ? '' : ' Which accounting concept, principle or assumption is violated?') : ` ${rng.pick(STEMS_FOLLOW)}`;
    return {
      prompt: text + stem,
      correct: OPTION_NAMES[s.a],
      distractors: wrongOptions(s, OPTION_NAMES),
      explanation: `The ${OPTION_NAMES[s.a]}: ${s.point}.`,
      hints: ['Decide what the accountant is trying to protect or show: the owner, the period, the cost, the evidence, the timing?', 'Match the one idea in the scenario to the principle that is about exactly that idea.'],
    };
  },
  verify: (q) => {
    const found = scenariosIn(q.prompt);
    return found.length === 1 && correctText(q) === OPTION_NAMES[found[0].a] && !q.options.some((o) => o.id !== q.correct && o.text === OPTION_NAMES[found[0].a]);
  },
});

// ---------------------------------------------------------------------------------------------------------------
// Two events at once: which pair of principles? (complex)
// ---------------------------------------------------------------------------------------------------------------

const thbTwoPrinciples = mcqTemplate({
  id: 'thb-two-principles',
  topicId: T,
  conceptId: 'thb-principles',
  difficulty: 'complex',
  generate: (rng) => {
    const follows = SCENARIOS.filter((s) => !s.violates && !s.text(PLACEHOLDER).includes('Which'));
    const s1 = rng.pick(follows);
    // The second case must not be one that the first case's principle would also fit, or the reverse: the pair
    // written in the wrong order has to be plainly wrong.
    const s2 = rng.pick(follows.filter((s) => s.a !== s1.a && !(s.skip ?? []).includes(s1.a) && !(s1.skip ?? []).includes(s.a)));
    const t1 = s1.text(draw(rng));
    const t2 = s2.text(draw(rng));
    const pair = (p: string, q: string) => `(i) ${p}; (ii) ${q}`;
    const f1 = rng.pick(confusions(s1).filter((c) => c.p !== s2.a));
    const f2 = rng.pick(confusions(s2).filter((c) => c.p !== s1.a && c.p !== f1.p));
    return {
      prompt: `Read these two cases. (i) ${t1} (ii) ${t2} Which pair of concepts, principles or assumptions do cases (i) and (ii) follow, in that order?`,
      correct: pair(NAMES[s1.a], NAMES[s2.a]),
      distractors: [
        { text: pair(NAMES[s2.a], NAMES[s1.a]), why: 'Matched the two principles to the cases in the wrong order.' },
        { text: pair(NAMES[s1.a], NAMES[f2.p]), why: `First case right, but for the second took the ${NAMES[f2.p]}, which is about ${GIST[f2.p]}.` },
        { text: pair(NAMES[f1.p], NAMES[s2.a]), why: `Second case right, but for the first took the ${NAMES[f1.p]}, which is about ${GIST[f1.p]}.` },
        { text: pair(NAMES[f1.p], NAMES[f2.p]), why: `Took the first case for the ${NAMES[f1.p]} and the second for the ${NAMES[f2.p]}; neither is the idea its case turns on.` },
      ],
      explanation: `(i) ${NAMES[s1.a]}: ${s1.point}. (ii) ${NAMES[s2.a]}: ${s2.point}.`,
      hints: ['Name the principle behind each case on its own first.', 'Then match them in the order the cases are written.'],
    };
  },
  verify: (q) => {
    const m = mask(q.prompt);
    const found = SCENARIOS.filter((s) => m.includes(s.text(PLACEHOLDER)));
    if (found.length !== 2) return false;
    const ordered = found.sort((a, b) => m.indexOf(a.text(PLACEHOLDER)) - m.indexOf(b.text(PLACEHOLDER)));
    return correctText(q) === `(i) ${NAMES[ordered[0].a]}; (ii) ${NAMES[ordered[1].a]}`;
  },
});

// ---------------------------------------------------------------------------------------------------------------
// Assumption or principle?
// ---------------------------------------------------------------------------------------------------------------

// The three are called "fundamental accounting assumptions" by Accounting Standard 1 (Disclosure of Accounting
// Policies). Some books call every one of these ideas a "concept", so each question names AS-1 as its authority and
// the options carry the bare names: "Going concern", not "Going Concern Assumption", which would give the answer away.
const AS1 = 'Accounting Standard 1 (AS-1) names three fundamental accounting assumptions.';
const ASSUMPTION_NOTE =
  'AS-1 names going concern, consistency and accrual as the three fundamental accounting assumptions. The other ideas, such as business entity, matching and prudence, are basic accounting concepts or principles and are not among the three.';
const low = (s: string): string => s[0].toLowerCase() + s.slice(1);

const ASSUMPTION_HINTS = [
  'AS-1 names only three fundamental accounting assumptions. Can you say them?',
  'The three are going concern, consistency and accrual. Everything else here (entity, matching, prudence, cost and the rest) is a basic concept or principle.',
];

const thbAssumptionOrPrinciple = mcqTemplate({
  id: 'thb-assumption-or-principle',
  version: 2,
  topicId: T,
  conceptId: 'thb-assumptions',
  difficulty: 'easy',
  generate: (rng) => {
    const variant = rng.pick(['which', 'not', 'pair']);
    const counted = (p: Pr) => `Counted ${low(BARE[p])} as a fundamental assumption. It is a basic accounting concept, about ${GIST[p]}, and is not one of the three.`;
    if (variant === 'which') {
      const a = rng.pick(ASSUMPTIONS);
      return {
        prompt: `${AS1} Which one of the following is among them?`,
        correct: BARE[a],
        distractors: rng.shuffle(PRINCIPLES).slice(0, 4).map((p) => ({ text: BARE[p], why: counted(p) })),
        explanation: `${BARE[a]} is one of the three. ${ASSUMPTION_NOTE}`,
        hints: ASSUMPTION_HINTS,
      };
    }
    if (variant === 'not') {
      const p = rng.pick(PRINCIPLES);
      return {
        prompt: `${AS1} Which one of the following is NOT among them?`,
        correct: BARE[p],
        distractors: ASSUMPTIONS.map((a) => ({
          text: BARE[a],
          why: `Left ${low(BARE[a])} out of the fundamental assumptions, though it is one of the three: it is about ${GIST[a]}.`,
        })),
        explanation: `${BARE[p]} is a basic accounting concept, not a fundamental assumption. ${ASSUMPTION_NOTE}`,
        hints: ASSUMPTION_HINTS,
      };
    }
    const [a1, a2, a3] = rng.shuffle(ASSUMPTIONS);
    const [p1, p2, p3] = rng.shuffle(PRINCIPLES);
    const both = (x: Pr, y: Pr) => `${BARE[x]} and ${low(BARE[y])}`;
    return {
      prompt: `${AS1} In which pair are both items among them?`,
      correct: both(a1, a2),
      distractors: [
        { text: both(a1, p1), why: counted(p1) },
        { text: both(p2, a2), why: counted(p2) },
        { text: both(a3, p3), why: counted(p3) },
        { text: both(p1, p3), why: `Took two basic accounting concepts for fundamental assumptions; neither ${low(BARE[p1])} nor ${low(BARE[p3])} is one of the three.` },
      ],
      explanation: `${BARE[a1]} and ${low(BARE[a2])} are both among the three. ${ASSUMPTION_NOTE}`,
      hints: ASSUMPTION_HINTS,
    };
  },
  // Checked against the three names written out here, not against the lists the question was built from: the
  // right option must pass and every wrong option must fail.
  verify: (q) => {
    const isOneOfThree = (t: string) => ['going concern', 'consistency', 'accrual'].includes(t.trim().toLowerCase());
    const right = correctText(q) ?? '';
    const wrong = q.options.filter((o) => o.id !== q.correct).map((o) => o.text);
    if (q.prompt.includes('NOT among them')) return !isOneOfThree(right) && wrong.every(isOneOfThree);
    if (q.prompt.includes('In which pair')) {
      const bothAre = (t: string) => t.split(' and ').every(isOneOfThree);
      return bothAre(right) && !wrong.some(bothAre);
    }
    return isOneOfThree(right) && !wrong.some(isOneOfThree);
  },
});

// ---------------------------------------------------------------------------------------------------------------
// Cash basis or accrual basis?
// ---------------------------------------------------------------------------------------------------------------

type Basis = 'cash' | 'accrual';
const BASES: { basis: Basis; text: (who: string) => string; note: string }[] = [
  { basis: 'cash', text: (w) => `${w}, a home tutor, enters a month's fee in the books only on the day the parent actually pays it.`, note: 'the fee is recorded when cash is received' },
  { basis: 'cash', text: (w) => `${w} sells vegetables and records each expense only on the day it is paid in cash.`, note: 'expenses are recorded when cash is paid' },
  { basis: 'cash', text: () => `A trust records a donation as income only in the year in which the money is received.`, note: 'income is recorded when cash is received' },
  { basis: 'cash', text: (w) => `${w}, a freelancer, raised an invoice in March but records the income only when the payment arrives in April.`, note: 'income waits for the cash' },
  { basis: 'cash', text: () => `A tea stall treats electricity as an expense in the month the bill is paid, whatever month the power was used.`, note: 'the expense follows the payment, not the use' },
  { basis: 'cash', text: () => `A club works out its surplus for the year as cash received less cash paid, and ignores amounts due to it or owed by it.`, note: 'only cash received and paid count' },
  { basis: 'cash', text: () => `A small clinic does not record fees that patients still owe, and shows them only after they are paid.`, note: 'unpaid fees are not recorded until cash arrives' },
  { basis: 'cash', text: () => `A shopkeeper counts salaries as an expense only when paid, so March salaries paid on 5 April fall in the next year.`, note: 'the expense is recorded when cash is paid' },
  { basis: 'accrual', text: (w) => `${w} records goods sold on credit in March as sales of March, although the customer will pay in May.`, note: 'revenue is recorded when earned, not when cash comes' },
  { basis: 'accrual', text: () => `A firm records March salaries as an expense of March although they are paid on 5 April.`, note: 'the expense is recorded when incurred' },
  { basis: 'accrual', text: () => `Interest earned on a fixed deposit up to 31 March, which the bank will credit only in April, is recorded as income of the year ended 31 March.`, note: 'income is recorded when earned' },
  { basis: 'accrual', text: () => `Insurance paid in March for the next year is carried forward as a prepaid expense and not charged to the year just ended.`, note: 'the expense belongs to the period it relates to' },
  { basis: 'accrual', text: () => `Rent received in advance for the coming year is shown as a liability and not counted as this year's income.`, note: 'income not yet earned is not recorded as income' },
  { basis: 'accrual', text: () => `A firm records an electricity bill for March as an expense of March although it is unpaid on 31 March.`, note: 'the expense is recorded when incurred' },
  { basis: 'accrual', text: () => `Profit of the year is found by setting income earned in the year against expenses incurred in the year, whatever cash was received or paid.`, note: 'income and expenses are taken as earned and incurred' },
  { basis: 'accrual', text: (w) => `${w} shows amounts still due from customers as debtors and amounts due to suppliers as creditors in the balance sheet.`, note: 'amounts due and owing are recorded' },
  { basis: 'accrual', text: () => `A school records fees for the term as income of the term even though some parents pay late, and records the unpaid part as due.`, note: 'income is recorded as earned and the unpaid part is shown as due' },
  { basis: 'accrual', text: () => `Commission earned in the last week of March, to be received in April, is recorded as accrued income at the year end.`, note: 'earned but unreceived income is recorded' },
];

const thbWhichBasis = mcqTemplate({
  id: 'thb-which-basis',
  topicId: T,
  conceptId: 'thb-bases',
  difficulty: 'easy',
  generate: (rng) => {
    const b = rng.pick(BASES);
    const cash = b.basis === 'cash';
    const right = cash ? 'Cash basis' : 'Accrual (mercantile) basis';
    const other = cash ? 'Accrual (mercantile) basis' : 'Cash basis';
    const prompt = `${b.text(rng.pick(WHO))} Which basis of accounting is being followed?`;
    // The other basis is always offered; two of the three look-alikes join it (the engine keeps every one of three).
    const lookAlikes: Distractor[] = rng.shuffle([
      { text: 'Single entry system', why: 'Single entry is a system of recording, not a basis. A basis decides when income and expenses are recognised.' },
      { text: 'Double entry system', why: 'Double entry is a system of recording, not a basis. A basis decides when income and expenses are recognised.' },
      { text: 'Going concern assumption', why: 'Going concern is an assumption about the business continuing, not a basis that decides when items are recorded.' },
    ]);
    return {
      prompt,
      correct: right,
      distractors: [
        {
          text: other,
          why: cash
            ? 'Took it for the accrual basis, which records items when earned or incurred; here an item is recorded only when cash moves.'
            : 'Took it for the cash basis, which would wait for cash to move; here the item is recorded when it is earned or incurred.',
        },
        ...lookAlikes.slice(0, 2),
      ],
      explanation: `${right}: ${b.note}.`,
    };
  },
  verify: (q) => {
    const m = mask(q.prompt.replace(' Which basis of accounting is being followed?', ''));
    const hit = BASES.find((b) => m === b.text('@'));
    return hit !== undefined && correctText(q) === (hit.basis === 'cash' ? 'Cash basis' : 'Accrual (mercantile) basis');
  },
});

// ---------------------------------------------------------------------------------------------------------------
// Single or double entry?
// ---------------------------------------------------------------------------------------------------------------

const SYSTEMS: { sys: 'double' | 'single'; text: string; note: string }[] = [
  { sys: 'double', text: 'Every transaction is recorded in two accounts, one debited and the other credited with the same amount.', note: 'two equal sides for every transaction' },
  { sys: 'double', text: 'A trial balance can be prepared from the books to check their arithmetical accuracy.', note: 'equal debit and credit totals make the trial balance possible' },
  { sys: 'double', text: 'Personal, real and nominal accounts are all kept.', note: 'all three classes of account are kept' },
  { sys: 'double', text: 'Profit can be worked out accurately through the profit and loss account, and a full balance sheet can be drawn up.', note: 'complete records support final accounts' },
  { sys: 'double', text: 'It is based on the dual aspect concept: each transaction has a receiving side and a giving side.', note: 'it applies the dual aspect concept' },
  { sys: 'double', text: 'Many errors can be found because total debits must equal total credits.', note: 'the equality of totals helps to detect errors' },
  { sys: 'double', text: 'It is the system followed by large firms and companies, since it gives complete and reliable accounts.', note: 'it gives complete and reliable accounts' },
  { sys: 'single', text: 'A small shopkeeper keeps only a cash book and notes of what customers owe and what is owed to suppliers, with no accounts for expenses or incomes.', note: 'only part of the records is kept' },
  { sys: 'single', text: 'Some transactions are recorded in two accounts, some in one account and some not at all.', note: 'records are incomplete and not uniform' },
  { sys: 'single', text: 'A trial balance cannot be prepared, so the arithmetical accuracy of the books cannot be proved.', note: 'one-sided records give no trial balance' },
  { sys: 'single', text: 'Profit can only be estimated roughly, for example by comparing the capital at the start and the end of the year.', note: 'profit cannot be found accurately from incomplete records' },
  { sys: 'single', text: 'It is cheap and simple, so it suits very small traders, though its records are incomplete.', note: 'it is simple but incomplete' },
  { sys: 'single', text: 'Accounts for fixed assets and for nominal items such as rent and salaries are usually not kept.', note: 'nominal accounts and most real accounts are not kept' },
];

const thbWhichSystem = mcqTemplate({
  id: 'thb-which-system',
  topicId: T,
  conceptId: 'thb-systems',
  difficulty: 'easy',
  generate: (rng) => {
    const s = rng.pick(SYSTEMS);
    const dbl = s.sys === 'double';
    return {
      prompt: `${s.text} Which system of accounting does this describe?`,
      correct: dbl ? 'Double entry system' : 'Single entry system',
      distractors: [
        {
          text: dbl ? 'Single entry system' : 'Double entry system',
          why: dbl ? 'Took it for single entry, whose records are incomplete and which cannot give a trial balance.' : 'Took it for double entry, which records both aspects of every transaction and gives a trial balance.',
        },
        { text: 'Cash basis of accounting', why: 'Cash basis is a basis, deciding when items are recognised; this describes how entries are made.' },
        { text: 'Accrual basis of accounting', why: 'Accrual basis is a basis, deciding when items are recognised; this describes how entries are made.' },
      ],
      explanation: `${dbl ? 'Double entry system' : 'Single entry system'}: ${s.note}.`,
    };
  },
  verify: (q) => {
    const hit = SYSTEMS.find((s) => q.prompt === `${s.text} Which system of accounting does this describe?`);
    return hit !== undefined && correctText(q) === (hit.sys === 'double' ? 'Double entry system' : 'Single entry system');
  },
});

// ---------------------------------------------------------------------------------------------------------------
// Fact banks: GAAP, accounting standards, GST
// ---------------------------------------------------------------------------------------------------------------

const GAAP_FACTS: Fact[] = [
  {
    q: 'GAAP stands for:', right: 'Generally Accepted Accounting Principles',
    wrong: [
      { text: 'Government Approved Accounting Practices', why: 'Thought an official body approves them; GAAP gain their authority from wide acceptance among accountants and users.' },
      { text: 'Generally Accepted Auditing Practices', why: 'Mixed accounting up with auditing; GAAP are rules for recording and reporting, not for checking accounts.' },
      { text: 'Globally Applied Accounting Policies', why: 'Assumed they are the same worldwide; GAAP differ from country to country.' },
      { text: 'General Accounting and Audit Procedures', why: 'Invented an expansion that mixes accounting with auditing.' },
    ],
    because: 'GAAP are the Generally Accepted Accounting Principles: the common rules, conventions and practices followed in recording and reporting.',
  },
  {
    q: 'Which of these best describes GAAP?', right: 'The common rules, principles and conventions that accountants follow in recording and reporting transactions',
    wrong: [
      { text: 'A single law passed by Parliament that fixes the format of every business\'s accounts', why: 'Took GAAP for a single statute; it is a body of accepted rules and practices, which law and standards partly draw on.' },
      { text: 'The list of ledger accounts every business must open', why: 'Mixed GAAP up with the chart of accounts.' },
      { text: 'The plan by which a business sets its profit target', why: 'Mixed GAAP up with budgeting.' },
      { text: 'The method of checking the accounts after they are prepared', why: 'Mixed GAAP up with auditing.' },
    ],
    because: 'GAAP are the accepted rules, principles and conventions that guide how transactions are recorded and reported.',
  },
  {
    q: 'A main purpose of GAAP is to:', right: 'make financial statements of different firms comparable and reliable',
    wrong: [
      { text: 'make every firm show the same profit', why: 'Thought uniform rules give equal profits; they give comparable statements, not equal results.' },
      { text: 'reduce the tax every firm pays', why: 'Mixed accounting rules up with tax planning.' },
      { text: 'remove the need for an audit', why: 'Thought accepted rules make checking unnecessary; auditing still verifies that the rules were followed.' },
      { text: 'let each accountant choose any treatment at will', why: 'Reversed the aim: GAAP narrow the choices so that statements can be compared.' },
    ],
    because: 'GAAP bring uniformity and discipline so that statements of different firms can be compared and relied on.',
  },
  {
    q: 'Which of the following forms part of the framework of GAAP in India?', right: 'Accounting standards issued by ICAI',
    wrong: [
      { text: 'The personal preferences of the accountant', why: 'GAAP are generally accepted rules, not one person\'s preferences.' },
      { text: 'The owner\'s estimate of next year\'s profit', why: 'Estimates of the future are not accounting rules.' },
      { text: 'The rates of GST on different goods', why: 'GST rates belong to tax law, not to the rules of recording and reporting.' },
      { text: 'The selling prices fixed by a trade association', why: 'Prices are a commercial matter, not an accounting rule.' },
    ],
    because: 'Accounting standards, along with the accepted principles and legal requirements, make up the GAAP framework in India.',
  },
  {
    q: 'GAAP are called "generally accepted" because:', right: 'the accounting profession and the users of accounts accept them through wide practice and agreement',
    wrong: [
      { text: 'every country uses exactly the same ones', why: 'GAAP differ between countries, which is why international convergence matters.' },
      { text: 'the owner of each business has to approve them every year', why: 'Acceptance is by the profession and users, not by each owner.' },
      { text: 'they are written into the income tax return form', why: 'Mixed accounting rules up with tax forms.' },
      { text: 'they were accepted once and can never change', why: 'GAAP change as business practice and the needs of users change.' },
    ],
    because: 'The word "accepted" means that the profession and users agree on them through practice, not that a government or an owner approves them.',
  },
  {
    q: 'Which statement about GAAP is correct?', right: 'They change over time as business practices, law and the needs of users change',
    wrong: [
      { text: 'Once framed, they can never change', why: 'Treated GAAP as fixed; they are revised as business and law change.' },
      { text: 'They apply only to companies and not to sole traders', why: 'GAAP are the common rules of accounting; they are not limited to one kind of business.' },
      { text: 'They are the same in all countries', why: 'GAAP differ from country to country, which is why convergence with IFRS is discussed.' },
      { text: 'They are a list of the taxes a business must pay', why: 'Mixed accounting rules up with tax law.' },
    ],
    because: 'GAAP evolve: they are revised as business practices, laws and users\' needs change, and they differ from country to country.',
  },
  {
    q: 'Which one is a result of every business following GAAP?', right: 'Users can compare the accounts of one business with those of another',
    wrong: [
      { text: 'All businesses earn equal profits', why: 'Rules for recording do not equalise profits.' },
      { text: 'No business needs to keep books of account', why: 'GAAP tell how to keep books; they do not remove the need for them.' },
      { text: 'All errors in the books vanish', why: 'Following accepted rules reduces some mistakes but does not remove all errors.' },
      { text: 'The Government pays the cost of the audit', why: 'Mixed GAAP up with public funding of audit.' },
    ],
    because: 'The point of common rules is comparability: similar transactions are recorded in similar ways by different firms.',
  },
  {
    q: 'Which of the following is NOT a feature of GAAP?', right: 'They allow every business to use whatever treatment gives the highest profit',
    wrong: [
      { text: 'They are accepted by the accounting profession', why: 'Acceptance by the profession is exactly what makes them generally accepted.' },
      { text: 'They guide how transactions are recorded and reported', why: 'Guiding recording and reporting is their main function.' },
      { text: 'They promote comparability between firms', why: 'Comparability is one of their main aims.' },
      { text: 'They vary from country to country', why: 'GAAP do differ between countries, so this is a true feature.' },
    ],
    because: 'GAAP narrow choices so that statements are fair and comparable; they do not permit a treatment chosen only to raise profit.',
  },
];

const STANDARDS_FACTS: Fact[] = [
  {
    q: 'In India, accounting standards are formulated by:', right: 'The Institute of Chartered Accountants of India (ICAI)',
    wrong: [
      { text: 'The Reserve Bank of India', why: 'RBI regulates banks and money; it does not formulate accounting standards.' },
      { text: 'The Income Tax Department', why: 'The tax department collects direct taxes; it does not frame accounting standards.' },
      { text: 'The International Accounting Standards Board', why: 'IASB frames international standards (IFRS) from London, not the standards of India.' },
      { text: 'The Goods and Services Tax Council', why: 'The GST Council makes decisions on GST; it has nothing to do with accounting standards.' },
    ],
    because: 'The ICAI, through its Accounting Standards Board, formulates the accounting standards followed in India; for companies they are then notified by the Central Government.',
  },
  {
    q: 'International Financial Reporting Standards (IFRS) are issued by:', right: 'The International Accounting Standards Board (IASB)',
    wrong: [
      { text: 'The Institute of Chartered Accountants of India', why: 'ICAI frames the Indian accounting standards, not IFRS.' },
      { text: 'The International Monetary Fund', why: 'The IMF looks after monetary co-operation among countries, not accounting rules.' },
      { text: 'The Securities and Exchange Board of India', why: 'SEBI regulates the securities market in India, not international standards.' },
      { text: 'The World Trade Organisation', why: 'The WTO deals with trade rules between countries, not accounting standards.' },
    ],
    because: 'IFRS are issued by the IASB, an independent international body.',
  },
  {
    q: 'Ind AS stands for:', right: 'Indian Accounting Standards',
    wrong: [
      { text: 'International Accounting Standards', why: 'Mixed it up with IAS, the older international standards; Ind AS are the Indian standards converged with IFRS.' },
      { text: 'Industrial Accounting Standards', why: 'Guessed from the letters; Ind stands for Indian, not industrial.' },
      { text: 'Independent Auditing Standards', why: 'Mixed accounting standards up with auditing standards.' },
      { text: 'Indirect Tax Accounting Statements', why: 'Mixed accounting standards up with indirect taxes such as GST.' },
    ],
    because: 'Ind AS are the Indian Accounting Standards, converged with IFRS.',
  },
  {
    q: 'A main objective of accounting standards is to:', right: 'bring uniformity and reduce the alternative ways of treating the same item, so that statements are comparable',
    wrong: [
      { text: 'increase the profit that firms show', why: 'Standards aim at fair and comparable reporting, not at higher profit.' },
      { text: 'do away with books of account', why: 'Standards govern how books are kept and reported; they do not replace them.' },
      { text: 'fix the prices at which goods are sold', why: 'Mixed accounting rules up with pricing.' },
      { text: 'give every firm the freedom to choose its own rules', why: 'Reversed the aim: standards limit the choice of treatments.' },
    ],
    because: 'Standards cut down differing treatments, bring uniformity and make statements comparable and reliable.',
  },
  {
    q: 'Which statement about Ind AS is correct?', right: 'They are Indian standards that are converged with IFRS, with some changes to suit Indian conditions',
    wrong: [
      { text: 'They are a word-for-word copy of IFRS', why: 'Ind AS follow IFRS closely but depart from it in places to suit Indian conditions.' },
      { text: 'They are tax rules issued under the GST law', why: 'Mixed accounting standards up with tax law.' },
      { text: 'They apply only to sole traders', why: 'They are notified for companies that meet specified conditions, not for sole traders.' },
      { text: 'They are issued by the IASB for use in India', why: 'Ind AS are Indian standards notified in India, although based on IFRS.' },
    ],
    because: 'Ind AS are converged with IFRS but adapted where Indian conditions call for it.',
  },
  {
    q: 'Why is India converging its accounting standards with IFRS?', right: 'To make the accounts of Indian companies comparable and understood abroad, which helps investment and cross-border business',
    wrong: [
      { text: 'To stop companies from keeping books of account', why: 'Convergence is about the standard of reporting; books still have to be kept.' },
      { text: 'To reduce the rate of GST', why: 'Mixed accounting standards up with tax rates.' },
      { text: 'To let each company choose its own rules', why: 'Convergence moves towards common rules, not company-specific ones.' },
      { text: 'To abolish the audit of company accounts', why: 'Convergence does not remove the audit.' },
    ],
    because: 'Common standards make Indian accounts understandable to foreign investors and ease cross-border business.',
  },
  {
    q: 'How do accounting standards differ from accounting principles and assumptions?', right: 'Standards give detailed written rules for treating a particular item or transaction',
    wrong: [
      { text: 'Standards are the broad ideas beneath all accounting, such as going concern', why: 'Mixed standards up with assumptions; standards are detailed rules for particular items.' },
      { text: 'Standards are optional notes with no authority', why: 'Standards are issued with authority and must be followed by those they apply to.' },
      { text: 'Standards are laws on indirect taxes', why: 'Mixed accounting standards up with tax laws.' },
      { text: 'Standards apply only to the cash book', why: 'Standards cover many items such as inventories and depreciation, not one book.' },
    ],
    because: 'Principles and assumptions are broad ideas; standards turn them into detailed rules for particular items.',
  },
  {
    q: 'IFRS stands for:', right: 'International Financial Reporting Standards',
    wrong: [
      { text: 'Indian Financial Reporting Standards', why: 'Took the I for Indian; the Indian version is Ind AS.' },
      { text: 'International Fiscal Revenue Statements', why: 'Guessed an expansion; the standards are about financial reporting, not government revenue.' },
      { text: 'Integrated Financial Recording System', why: 'Mixed the standards up with a software or recording system.' },
      { text: 'Internal Financial Review Standards', why: 'Mixed it up with internal review of a firm\'s own accounts.' },
    ],
    because: 'IFRS are International Financial Reporting Standards issued by the IASB.',
  },
  {
    q: 'In India, Ind AS are notified for the companies to which they apply by:', right: 'The Central Government through the Ministry of Corporate Affairs',
    wrong: [
      { text: 'The Reserve Bank of India alone', why: 'RBI issues rules for banks and money; the notification of Ind AS comes from the Ministry of Corporate Affairs.' },
      { text: 'The International Accounting Standards Board', why: 'IASB issues IFRS; Ind AS are notified in India.' },
      { text: 'Each company\'s own board of directors', why: 'Boards apply standards; they do not notify them.' },
      { text: 'The Goods and Services Tax Council', why: 'The GST Council deals with GST, not accounting standards.' },
    ],
    because: 'Ind AS are formulated by ICAI and take legal effect for companies when the Central Government (Ministry of Corporate Affairs) notifies them under the Companies Act, 2013, after consulting the National Financial Reporting Authority.',
  },
  {
    q: 'Which of these is an example of a matter covered by an accounting standard?', right: 'The valuation of inventories (stock)',
    wrong: [
      { text: 'The rate of GST on cement', why: 'GST rates are fixed under tax law, not by an accounting standard.' },
      { text: 'The date for filing an income tax return', why: 'Dates for tax returns are set by tax law.' },
      { text: 'The salary of the firm\'s accountant', why: 'Pay is a matter of employment, not of accounting standards.' },
      { text: 'The colour of the firm\'s letterhead', why: 'Letterheads have nothing to do with the treatment of transactions.' },
    ],
    because: 'Standards deal with the recording and reporting of items such as inventories, depreciation and revenue.',
  },
  {
    q: 'Which statement about IFRS is correct?', right: 'Many countries have adopted them or have converged their own standards with them',
    wrong: [
      { text: 'They are issued by ICAI for Indian firms only', why: 'IFRS are issued by the IASB for international use; ICAI issues the Indian standards.' },
      { text: 'They apply only to sole traders', why: 'IFRS were framed mainly for companies reporting to investors.' },
      { text: 'They are a tax law', why: 'IFRS are accounting standards, not tax law.' },
      { text: 'They are used in no country except one', why: 'Many countries have adopted or converged with them; that is the reason for convergence.' },
    ],
    because: 'IFRS have been adopted by many countries, and others, including India, have converged with them.',
  },
];

const GST_FACTS: Fact[] = [
  {
    q: 'GST is best described as:', right: 'a tax on the supply of goods and services, charged at each stage with credit for the tax paid earlier',
    wrong: [
      { text: 'a tax on the income of a business', why: 'Took GST for income tax; GST is charged on supplies, not on income.' },
      { text: 'a tax charged only on the final retail sale', why: 'GST is charged at every stage of supply, with credit for tax paid at earlier stages.' },
      { text: 'a tax on the profit of the manufacturer', why: 'GST is on the value of supplies, whatever the profit.' },
      { text: 'a tax on the property owned by a firm', why: 'Mixed GST up with property tax.' },
    ],
    because: 'GST is a multi-stage tax on supplies of goods and services, with input tax credit for the tax paid on inputs.',
  },
  {
    q: '"One nation, one tax" means that GST:', right: 'replaced many separate indirect taxes of the Centre and the States with a single tax',
    wrong: [
      { text: 'has the same rate for every item', why: 'GST has more than one rate (5% and 18% are the two general rates); "one tax" is about a single system for the whole country, not a single rate.' },
      { text: 'is collected only by the Central Government', why: 'Both the Centre and the States share the tax; only IGST is collected by the Centre first.' },
      { text: 'removes the need to register for tax', why: 'Registered dealers must still follow GST rules.' },
      { text: 'applies to income as well as supplies', why: 'GST is on supplies; income is taxed under income tax.' },
    ],
    because: 'GST merged taxes such as VAT and service tax into one system across the country.',
  },
  {
    q: 'The main advantage of input tax credit is that it:', right: 'removes tax on tax, since tax paid on purchases is set off against tax payable on sales',
    wrong: [
      { text: 'refunds all the tax to the customers', why: 'The credit is claimed by the registered business, not refunded to customers.' },
      { text: 'allows the seller to charge no tax on sales', why: 'Tax is still charged on sales; only the tax paid on inputs is set off.' },
      { text: 'raises the price of goods at every stage', why: 'Credit stops tax being charged on tax, which tends to lower the cascading burden.' },
      { text: 'lets a firm claim credit on its owner\'s personal purchases', why: 'Credit is for tax on business purchases; personal use is outside the business.' },
    ],
    because: 'Input tax credit stops tax being charged on tax already paid (the cascading effect).',
  },
  {
    q: 'IGST is charged, and first collected by the Central Government, on:', right: 'supplies from one state to another',
    wrong: [
      { text: 'supplies within the same state', why: 'Within a state CGST and SGST are charged instead.' },
      { text: 'every supply, in addition to CGST and SGST', why: 'IGST replaces the CGST and SGST pair on a supply; it is not added on top.' },
      { text: 'supplies made only by sole traders', why: 'The kind of tax depends on where the goods go, not on the type of owner.' },
      { text: 'income of a business', why: 'GST is a tax on supplies, not on income.' },
    ],
    because: 'IGST applies when the supplier and the place of supply are in different states; the Centre collects it and passes the state\'s share on.',
  },
  {
    q: 'SGST on a supply within a state is received by:', right: 'the State Government of that state',
    wrong: [
      { text: 'the Central Government', why: 'The Centre receives CGST; SGST goes to the State.' },
      { text: 'the Reserve Bank of India', why: 'RBI does not collect GST.' },
      { text: 'the local municipal body', why: 'Municipal bodies collect their own local taxes, not SGST.' },
      { text: 'the supplier, as profit', why: 'The supplier only collects the tax; it is paid over to the government.' },
    ],
    because: 'On a supply within a state, CGST goes to the Centre and SGST to the State.',
  },
  {
    q: 'CGST on a supply within a state is received by:', right: 'the Central Government',
    wrong: [
      { text: 'the State Government', why: 'The State receives SGST; CGST goes to the Centre.' },
      { text: 'the buyer', why: 'The buyer pays the tax and does not receive it.' },
      { text: 'the Goods and Services Tax Council', why: 'The Council recommends rates and rules; it does not receive the tax.' },
      { text: 'the supplier, to cover the costs of collection', why: 'The supplier only collects the tax and pays it over.' },
    ],
    because: 'CGST is the Centre\'s half of the tax on a supply within a state.',
  },
  {
    q: 'Which of the following taxes was merged into GST?', right: 'Value added tax (VAT) and service tax',
    wrong: [
      { text: 'Income tax', why: 'Income tax is a direct tax and was not merged into GST.' },
      { text: 'Stamp duty on property', why: 'Stamp duty on property remains a separate state levy.' },
      { text: 'Corporate tax on the profit of companies', why: 'Corporate tax is a direct tax and was not merged into GST.' },
      { text: 'Professional tax on salaries', why: 'Professional tax is not an indirect tax on supplies and was not merged into GST.' },
    ],
    because: 'GST merged many indirect taxes such as VAT, service tax and others into one system.',
  },
  {
    q: 'GST is described as a multi-stage tax because it:', right: 'is charged at each stage of the supply chain, though the final burden falls on the consumer',
    wrong: [
      { text: 'is charged only at the last stage', why: 'GST is charged at every stage, not only the last.' },
      { text: 'is paid in full by the manufacturer out of profit', why: 'Each dealer collects the tax from the next buyer; the consumer ultimately bears it.' },
      { text: 'is paid by the consumer to the Centre directly', why: 'Registered dealers collect and pay the tax; consumers do not pay the government directly.' },
      { text: 'is charged twice on the same item at one stage', why: 'Mixed the dual structure (CGST and SGST) with double charging.' },
    ],
    because: 'Each dealer in the chain charges GST on sales and claims credit for the tax on purchases, so the consumer finally bears it.',
  },
  {
    q: 'GST is called a dual tax because:', right: 'both the Centre and the States levy it on the same supply, as CGST and SGST',
    wrong: [
      { text: 'it is charged twice on each item', why: 'Dual refers to two governments sharing the tax, not to double charging.' },
      { text: 'seller and buyer each pay half', why: 'The buyer pays the whole tax; the seller collects it.' },
      { text: 'every item has two different rates', why: 'An item has one rate; the rate is split between the Centre and the State.' },
      { text: 'it applies to both goods and income', why: 'GST applies to supplies of goods and services, not income.' },
    ],
    because: 'The Centre levies CGST and the State levies SGST on the same supply, which is why GST is dual.',
  },
  {
    q: 'Which of these is an advantage of GST?', right: 'Fewer separate indirect taxes, less cascading of tax and a common national market',
    wrong: [
      { text: 'No tax at all on services', why: 'Services are taxed under GST.' },
      { text: 'Higher tax on every inter-state sale', why: 'GST aims to make inter-state trade smoother, not costlier.' },
      { text: 'A separate rate of tax in every state for the same item', why: 'Under GST the rate on an item is the same throughout the country.' },
      { text: 'Tax on tax at each stage', why: 'Tax on tax is what input tax credit removes.' },
    ],
    because: 'GST merges taxes, removes cascading through input tax credit and creates a common market across states.',
  },
  {
    q: 'A registered dealer buys goods for resale and is entitled to input tax credit on them. In the dealer\'s books, the GST paid on these purchases is recorded as:',
    right: 'an asset (a debit balance in the Input GST accounts), because it can be set off against output GST',
    wrong: [
      { text: 'an expense of the business', why: 'Treated the tax as a cost; the dealer can claim it as credit, so it is not an expense.' },
      { text: 'a part of the cost of the goods purchased', why: 'Added the tax to Purchases; that is done only when no credit can be claimed, and here credit is available.' },
      { text: 'a liability to the government', why: 'Took it for output tax; input tax is credit the business can use, not an amount it owes.' },
      { text: 'an income of the business', why: 'Treated a credit against tax as a receipt; it reduces the tax to be paid and is not income.' },
    ],
    because: 'When credit is available, input CGST, SGST or IGST is debited to its own account and set off against output tax. Any balance left is an asset, a credit the dealer can still use.',
  },
  {
    q: 'Output GST collected on sales is recorded in the seller\'s books as:', right: 'a liability to the government, until it is paid or set off against input tax credit',
    wrong: [
      { text: 'income of the seller', why: 'The seller collects the tax on behalf of the government; it is not the seller\'s income.' },
      { text: 'an asset of the seller', why: 'Output tax is owed, not owned.' },
      { text: 'an expense of the seller', why: 'Output tax collected is not a cost of the seller.' },
      { text: 'part of the sales figure', why: 'The tax is recorded separately from sales.' },
    ],
    because: 'The seller collects output tax for the government, so it is a liability until paid or set off.',
  },
  {
    q: 'GST payable to the government for a period equals:', right: 'output GST minus input tax credit',
    wrong: [
      { text: 'output GST plus input tax credit', why: 'Added the credit instead of deducting it.' },
      { text: 'input tax credit minus output GST', why: 'Reversed the subtraction; payable is output tax less credit.' },
      { text: 'sales less purchases', why: 'Subtracted the values instead of the taxes on them.' },
      { text: 'the input tax credit alone', why: 'Forgot the tax collected on sales.' },
    ],
    because: 'Net GST payable = output GST - input tax credit, when output exceeds the credit.',
  },
  {
    q: 'Who finally bears the burden of GST?', right: 'The final consumer',
    wrong: [
      { text: 'The manufacturer', why: 'The manufacturer collects the tax from the next buyer and claims credit; the consumer ends up bearing it.' },
      { text: 'The Central Government', why: 'The Government receives the tax; it does not bear it.' },
      { text: 'Every dealer in the chain, for the full amount', why: 'Each dealer passes on the tax and claims credit; no dealer bears the whole tax.' },
      { text: 'The wholesaler alone', why: 'Every dealer passes the tax on to the next buyer.' },
    ],
    because: 'Each dealer recovers the tax from the next buyer, so the final consumer bears it.',
  },
];

const thbGaapFacts = factTemplate('thb-gaap-facts', 'thb-gaap', 'easy', GAAP_FACTS, {
  version: 2,
  hints: ['GAAP are rules the profession and the users agree on. What are they for?', 'They exist so that similar events are recorded alike and accounts can be compared and relied on; they come from practice and agreement and change over time.'],
});
const thbStandardsFacts = factTemplate('thb-standards-facts', 'thb-standards', 'medium', STANDARDS_FACTS);
const thbGstFacts = factTemplate('thb-gst-facts', 'thb-gst', 'medium', GST_FACTS);

// ---------------------------------------------------------------------------------------------------------------
// What is the right treatment?
// ---------------------------------------------------------------------------------------------------------------

interface Treatment {
  q: (c: Ctx) => string;
  right: (c: Ctx) => string;
  wrong: (c: Ctx) => Distractor[];
  because: string;
}
const TREATMENTS: Treatment[] = [
  {
    q: (c) => `The proprietor takes goods costing ${c.x} from the shop for use at home. What is the correct treatment in the books?`,
    right: (c) => `Debit Drawings with ${c.x}, because it is the owner's withdrawal`,
    wrong: (c) => [
      { text: `Treat ${c.x} as a business expense of the shop`, why: 'Forgot the business entity concept: the owner\'s personal use is not an expense of the business.' },
      { text: `Credit Sales with ${c.x}, as a sale to the owner`, why: 'Treated the withdrawal as an ordinary sale; goods taken by the owner are drawings, which reduce capital.' },
      { text: 'Make no entry, because the owner owns the goods', why: 'The goods belong to the business, which is separate from the owner; the withdrawal must be recorded.' },
      { text: `Add ${c.x} to the capital`, why: 'Reversed the effect: a withdrawal reduces capital; it does not increase it.' },
    ],
    because: 'Under the business entity concept the owner is separate from the business, so goods taken by the owner are drawings.',
  },
  {
    q: (c) => `Land was bought for ${c.x} some years ago, and similar land now sells for ${c.y}. At what amount does the balance sheet show the land?`,
    right: (c) => `${c.x}, its cost`,
    wrong: (c) => [
      { text: `${c.y}, the present market price`, why: 'Used market value, but the historical cost concept records assets at cost.' },
      { text: `${c.x} plus a reserve for the rise`, why: 'Recorded an unrealised gain; the rise in value is not recorded in the books.' },
      { text: `The average of ${c.x} and ${c.y}`, why: 'Invented a middle figure; the books keep the cost, not an estimate.' },
      { text: `${c.y} less depreciation`, why: 'Started from market value, though the cost is the starting figure.' },
    ],
    because: 'The historical cost concept keeps the asset at its cost, whatever the market price does later.',
  },
  {
    q: (c) => `A customer places an order for ${c.x} on 28 March. The goods will be delivered on 10 April, and the accounting year ends on 31 March. When is the sale recognised?`,
    right: () => 'On 10 April, when the goods are delivered',
    wrong: () => [
      { text: 'On 28 March, when the order is placed', why: 'Treated an order as a sale; revenue is recognised when goods are delivered, not when ordered.' },
      { text: 'On 31 March, at the end of the year', why: 'Took the year end as the date of sale, though nothing had been delivered.' },
      { text: 'Only when the customer pays', why: 'Waited for cash; a credit sale is recognised on delivery.' },
      { text: 'Half in March and half in April', why: 'Split the sale with no basis; a sale is recognised at one point, delivery.' },
    ],
    because: 'The revenue recognition principle: revenue is recognised when goods are delivered and the right to payment arises.',
  },
  {
    q: (c) => `A shop with large sales buys a pocket calculator for ${c.z} that should last several years. How is it treated?`,
    right: () => 'Charged to expenses in the year of purchase, because the amount is too small to matter',
    wrong: () => [
      { text: 'Capitalised and depreciated over its life', why: 'Ignored materiality: the effort is not worth it for a trivial amount.' },
      { text: 'Shown as stock', why: 'The calculator is not meant for sale, so it is not stock.' },
      { text: 'Treated as drawings', why: 'The calculator is for the shop, not for the owner\'s personal use.' },
      { text: 'Left out of the books altogether', why: 'Every transaction must be recorded; materiality allows a simple treatment, not omission.' },
    ],
    because: 'Under materiality, trivial items are written off at once rather than treated as assets.',
  },
  {
    q: (c) => `A firm with the year ending on 31 March owes salaries of ${c.x} for March, to be paid in April. How is it treated?`,
    right: () => 'Shown as an outstanding expense of the year ended 31 March',
    wrong: () => [
      { text: 'Charged to next year, when it is paid', why: 'Followed cash thinking; under accrual the expense belongs to the year in which it is incurred.' },
      { text: 'Ignored until it is paid', why: 'Ignored the matching concept: the March salaries helped earn March revenue.' },
      { text: 'Shown as a prepaid expense', why: 'Prepaid means paid in advance; here the payment is still to be made.' },
      { text: 'Shown as an income', why: 'Salaries owed are a cost, not income.' },
    ],
    because: 'The expense is incurred in March, so it is charged to that year and the unpaid amount is shown as a liability.',
  },
  {
    q: (c) => `In March, a firm pays ${c.x} as rent for the whole of the next year. How should this be treated at 31 March?`,
    right: () => 'Carried forward as a prepaid expense, not charged to the year just ended',
    wrong: () => [
      { text: 'Charged in full to the year just ended', why: 'Charged by cash payment; the rent belongs to next year\'s revenue.' },
      { text: 'Shown as an outstanding expense', why: 'Outstanding means owed; here it is paid in advance.' },
      { text: 'Shown as an income', why: 'Rent paid is an expense item, not an income.' },
      { text: 'Treated as drawings', why: 'Rent for the business premises is not the owner\'s personal withdrawal.' },
    ],
    because: 'Matching and accrual say the rent belongs to the period it covers; the unexpired part is a prepaid expense (an asset).',
  },
  {
    q: (c) => `The proprietor brings ${c.x} into the business as capital. How does the business record it?`,
    right: () => 'As the capital owed by the business to the proprietor',
    wrong: () => [
      { text: 'As income of the business', why: 'Took capital for income; it does not increase profit.' },
      { text: 'As a gift to the business', why: 'The owner expects the business to account for it; it is the owner\'s claim on the business.' },
      { text: 'No entry, because owner and business are the same person', why: 'Ignored the business entity concept: they are separate for accounting.' },
      { text: 'As a loan from an outsider', why: 'Capital comes from the owner, not from an outsider.' },
    ],
    because: 'The business entity concept treats the business as separate; capital is what it owes its owner.',
  },
  {
    q: () => 'The loyalty and skill of a shop\'s best salesperson help it earn a lot. Should the worth of this employee be entered as an asset in the books?',
    right: () => 'No, because it cannot be measured in money and verified',
    wrong: () => [
      { text: 'Yes, at the salary paid to the employee for the year', why: 'Treated salary as the worth of the person; salary is an expense, not an asset.' },
      { text: 'Yes, at an estimate made by the owner', why: 'An owner\'s estimate cannot be verified; it fails money measurement and objectivity.' },
      { text: 'Yes, as goodwill, at any figure the accountant likes', why: 'Goodwill is recorded only when it is purchased and can be measured.' },
      { text: 'Yes, but only in the profit and loss account', why: 'An unmeasurable quality has no place in any account.' },
    ],
    because: 'Money measurement: only what can be expressed in money and verified is recorded.',
  },
  {
    q: (c) => `A school receives ${c.x} in March as advance fees for the next session. How is it shown at 31 March?`,
    right: () => 'As income received in advance, a liability, and not as income of the year',
    wrong: () => [
      { text: 'As income of the year just ended', why: 'Counted cash received as income; the amount is not yet earned.' },
      { text: 'As an asset', why: 'Money received for a future service is owed back as service, so it is a liability, not an asset.' },
      { text: 'As an expense', why: 'Received amounts are not expenses.' },
      { text: 'As capital', why: 'Fees from students are not capital brought in by an owner.' },
    ],
    because: 'Revenue is recognised when earned; advance fees are a liability until the service is given.',
  },
  {
    q: (c) => `Interest of ${c.x} has been earned on a firm's fixed deposit up to 31 March, but the bank will credit it only in April. How is it treated for the year ended 31 March?`,
    right: () => 'Recorded as accrued income of the year',
    wrong: () => [
      { text: 'Recorded in April, when the bank credits it', why: 'Followed cash basis; under accrual the income belongs to the year in which it is earned.' },
      { text: 'Ignored altogether', why: 'Income that is earned must be recorded even if not received.' },
      { text: 'Shown as income received in advance', why: 'Income received in advance is cash received before it is earned; here it is earned but not received.' },
      { text: 'Shown as an outstanding expense', why: 'It is an income, so it cannot be an expense item.' },
    ],
    because: 'Accrual: income is recorded when earned; the amount not yet received is an asset, accrued income.',
  },
  {
    q: (c) => `A firm expects that ${c.x} of its debtors may turn out to be bad, though none has defaulted yet. What is the correct treatment?`,
    right: () => 'Make a provision by charging the likely loss to this year\'s profit',
    wrong: () => [
      { text: 'Wait until customers actually default', why: 'Ignored prudence: a likely loss is provided for in advance.' },
      { text: 'Reduce the sales figure by that amount', why: 'Sales are what they are; the likely loss is charged to profit as a provision.' },
      { text: 'Add the amount to profit as a reserve', why: 'Added a loss to profit; prudence reduces profit for likely losses.' },
      { text: 'Treat it as drawings', why: 'The likely bad debts are a business matter, not the owner\'s withdrawal.' },
    ],
    because: 'Prudence: provide for all likely losses; do not anticipate profits.',
  },
  {
    q: (c) => `At the year end a trader holds unsold goods and expects to make a profit of ${c.x} when they are sold next year. What is done about this expected profit in this year's books?`,
    right: () => 'Nothing: no profit is recorded until the goods are sold, and the stock stays at cost',
    wrong: () => [
      { text: 'The whole expected profit is recorded this year, to show a strong position', why: 'Anticipated a profit; prudence and revenue recognition do not allow it.' },
      { text: 'Half the expected profit is recorded this year and half next year', why: 'Invented a split; the profit is earned only when the goods are sold.' },
      { text: 'The stock is shown at its expected selling price', why: 'Valuing stock at selling price brings the unearned profit into this year through the stock figure.' },
      { text: 'The expected profit is added to a reserve', why: 'A reserve is set aside out of profit already earned, not out of a profit that is only expected.' },
    ],
    because: 'Prudence: expected profits are not anticipated. Revenue is recognised when the goods are sold, so the unsold stock stays at cost.',
  },
];

const thbRightTreatment = mcqTemplate({
  id: 'thb-right-treatment',
  topicId: T,
  conceptId: 'thb-principles',
  difficulty: 'medium',
  generate: (rng) => {
    const t = rng.pick(TREATMENTS);
    const c = draw(rng);
    return {
      prompt: t.q(c),
      correct: t.right(c),
      distractors: t.wrong(c),
      explanation: t.because,
      hints: ['Name the principle that decides this first.', 'Then ask what that principle says about timing, owner, cost or evidence.'],
    };
  },
  verify: (q) => {
    const m = mask(q.prompt);
    const hit = TREATMENTS.find((t) => m === mask(t.q(PLACEHOLDER)));
    return hit !== undefined && mask(correctText(q) ?? '') === mask(hit.right(PLACEHOLDER));
  },
});

// ---------------------------------------------------------------------------------------------------------------
// GST: which taxes?
// ---------------------------------------------------------------------------------------------------------------

const thbGstWhichTax = mcqTemplate({
  id: 'thb-gst-which-tax',
  topicId: T,
  conceptId: 'thb-gst',
  difficulty: 'easy',
  generate: (rng) => {
    const same = rng.next() < 0.5;
    const [from, to] = twoPlaces(rng, same);
    const [seller, buyer] = rng.shuffle(FIRMS);
    const goods = rng.pick(GOODS);
    const shape = rng.pick([0, 1]);
    const place = (p: Place) => `${p.city} (${p.state})`;
    const prompt =
      shape === 0
        ? `${seller} of ${place(from)} sells ${goods} to ${buyer} of ${place(to)}. Which GST is charged on this supply?`
        : `A registered dealer in ${place(from)} supplies ${goods} to a customer in ${place(to)}. Which GST appears on the invoice?`;
    const right = same ? 'CGST and SGST' : 'IGST';
    const wrongPair = same
      ? [
          { text: 'IGST only', why: 'Applied IGST, but IGST is charged only when the supply crosses a state border.' },
          { text: 'CGST only', why: 'Forgot that the State\'s share, SGST, is charged along with the Centre\'s CGST on a supply within a state.' },
          { text: 'SGST only', why: 'Forgot that the Centre\'s share, CGST, is charged along with SGST on a supply within a state.' },
          { text: 'CGST and IGST', why: 'Mixed the two: IGST is never charged together with CGST on the same supply.' },
        ]
      : [
          { text: 'CGST and SGST', why: 'Applied the within-state split, though the supply is from one state to another.' },
          { text: 'CGST only', why: 'Charged only the Centre\'s share, but an inter-state supply bears IGST.' },
          { text: 'SGST only', why: 'Charged only the State\'s share, but an inter-state supply bears IGST.' },
          { text: 'SGST and IGST', why: 'Mixed the two: IGST is the whole tax on an inter-state supply and is not combined with SGST.' },
        ];
    // The first wrong option is the one that swaps the two cases, so it is always offered; two of the others join it.
    return {
      prompt,
      correct: right,
      distractors: [wrongPair[0], ...rng.shuffle(wrongPair.slice(1)).slice(0, 2)],
      explanation: same
        ? `Both places are in ${from.state}, so it is a supply within the state: CGST (Centre) and SGST (State) are charged.`
        : `${from.state} and ${to.state} are different states, so it is an inter-state supply: IGST is charged.`,
      hints: ['Compare the state of the seller with the state of the buyer.', 'Same state: the tax is split into two parts. Different states: a single tax.'],
    };
  },
  verify: (q) => {
    const states = [...q.prompt.matchAll(/\(([A-Za-z ]+)\)/g)].map((m) => m[1]);
    if (states.length !== 2) return false;
    return correctText(q) === (states[0] === states[1] ? 'CGST and SGST' : 'IGST');
  },
});

// ---------------------------------------------------------------------------------------------------------------
// Typed amounts: GST on a supply
// ---------------------------------------------------------------------------------------------------------------

const thbGstIntra = numericTemplate({
  id: 'thb-gst-intra',
  version: 2,
  topicId: T,
  conceptId: 'thb-gst-calc',
  difficulty: 'easy',
  unit: 'rupees',
  generate: (rng) => {
    const v = rng.step(12000, 360000, 200);
    const r = rng.pick(RATES);
    const tax = (v * r) / 100;
    const half = tax / 2;
    if (!allWhole(tax, half)) return null;
    const [from, to] = twoPlaces(rng, true);
    const goods = rng.pick(GOODS);
    const [seller, buyer] = rng.shuffle(FIRMS);
    const intro = rng.pick([
      `${seller} of ${from.city} (${from.state}) sells ${goods} worth ${inr(v)} (before GST) to ${buyer} of ${to.city}, also in ${from.state}. GST is charged at ${r}% on this supply.`,
      `${seller}, a registered dealer in ${from.city}, ${from.state}, raises a bill for ${goods} with a taxable value of ${inr(v)} on a customer in ${to.city}, ${from.state}. The GST rate for this supply is ${r}%.`,
      `A dealer in ${from.state} supplies ${goods} to a buyer in the same state. The value of the supply is ${inr(v)} and GST is ${r}%.`,
    ]);
    const ask = rng.pick(['cgst', 'sgst', 'tax', 'total'] as const);
    const rate = `${r}% of ${inr(v)} = ${inr(tax)}`;
    const split = `CGST = SGST = half of the tax = ${inr(half)}.`;
    switch (ask) {
      case 'cgst':
      case 'sgst': {
        const name = ask === 'cgst' ? 'CGST' : 'SGST';
        return {
          prompt: `${intro} What amount of ${name} is shown on the invoice?`,
          answer: rupees(half),
          commonErrors: errs(
            { value: tax, why: `Took the whole GST as ${name}; within a state the tax is split equally between CGST and SGST.` },
            { value: v + half, why: `Added the ${name} to the value instead of giving the tax alone.` },
            { value: v, why: 'Gave the taxable value instead of the tax.' },
          ),
          explanation: [`Total GST = ${rate}.`, split, `${name} = ${inr(half)}.`],
          hints: GST_SUPPLY_HINTS,
        };
      }
      case 'tax':
        return {
          prompt: `${intro} What is the total GST (CGST and SGST together) on the invoice?`,
          answer: rupees(tax),
          commonErrors: errs(
            { value: half, why: 'Gave only one of the two parts (CGST or SGST); the invoice carries both.' },
            { value: v + tax, why: 'Gave the invoice total instead of the tax alone.' },
            { value: 2 * tax, why: 'Charged the full rate twice, once as CGST and once as SGST; the rate is shared between them.' },
          ),
          explanation: [`Total GST = ${rate}.`, `CGST ${inr(half)} + SGST ${inr(half)} = ${inr(tax)}.`],
          hints: GST_SUPPLY_HINTS,
        };
      default:
        return {
          prompt: `${intro} What is the invoice total payable by the buyer?`,
          answer: rupees(v + tax),
          commonErrors: errs(
            { value: v + half, why: 'Added only one half of the tax (CGST or SGST); both are charged.' },
            { value: v, why: 'Left out the GST, which the buyer must pay on top of the value.' },
            { value: v + 2 * tax, why: 'Charged the full rate twice, once as CGST and once as SGST.' },
          ),
          explanation: [`Total GST = ${rate}.`, split, `Invoice total = ${inr(v)} + ${inr(tax)} = ${inr(v + tax)}.`],
          hints: GST_SUPPLY_HINTS,
        };
    }
  },
  verify: (q) => {
    const [v] = amountsIn(q.prompt);
    const r = pct(q.prompt)[0];
    if (!v || !r) return false;
    const cgst = (v * r) / 200; // each of the two shares is half the rate on the value
    if (q.prompt.includes('What amount of')) return q.answer === cgst;
    if (q.prompt.includes('total GST')) return q.answer === 2 * cgst;
    return q.answer === v + 2 * cgst;
  },
});

const thbGstInter = numericTemplate({
  id: 'thb-gst-inter',
  version: 2,
  topicId: T,
  conceptId: 'thb-gst-calc',
  difficulty: 'easy',
  unit: 'rupees',
  generate: (rng) => {
    const v = rng.step(12000, 360000, 200);
    const r = rng.pick(RATES);
    const igst = (v * r) / 100;
    if (!allWhole(igst)) return null;
    const [from, to] = twoPlaces(rng, false);
    const goods = rng.pick(GOODS);
    const [seller, buyer] = rng.shuffle(FIRMS);
    const intro = rng.pick([
      `${seller} of ${from.city} (${from.state}) sells ${goods} worth ${inr(v)} (before GST) to ${buyer} of ${to.city} (${to.state}). GST is charged at ${r}% on this supply.`,
      `A dealer in ${from.state} sends ${goods} with a taxable value of ${inr(v)} to a customer in ${to.state}. The GST rate for this supply is ${r}%.`,
    ]);
    if (rng.next() < 0.5) {
      return {
        prompt: `${intro} What is the amount of IGST on the invoice?`,
        answer: rupees(igst),
        commonErrors: errs(
          { value: igst / 2, why: 'Halved the tax as if CGST and SGST applied; on an inter-state supply the whole rate is IGST.' },
          { value: v + igst, why: 'Gave the invoice total instead of the tax alone.' },
          { value: 2 * igst, why: 'Charged the full rate twice, as if CGST and SGST were each at the full rate.' },
        ),
        explanation: [`The supply crosses a state border, so IGST at the full rate applies.`, `IGST = ${r}% of ${inr(v)} = ${inr(igst)}.`],
        hints: GST_SUPPLY_HINTS,
      };
    }
    return {
      prompt: `${intro} What is the invoice total?`,
      answer: rupees(v + igst),
      commonErrors: errs(
        { value: v + igst / 2, why: 'Added only half the tax, as if CGST and SGST were shared; the whole rate is charged as IGST.' },
        { value: v, why: 'Left out the GST, which the buyer pays on top of the value.' },
        { value: v + 2 * igst, why: 'Charged the full rate twice, as if CGST and SGST were each at the full rate.' },
      ),
      explanation: [`The supply crosses a state border, so IGST at the full rate applies.`, `IGST = ${r}% of ${inr(v)} = ${inr(igst)}.`, `Invoice total = ${inr(v)} + ${inr(igst)} = ${inr(v + igst)}.`],
      hints: GST_SUPPLY_HINTS,
    };
  },
  verify: (q) => {
    const [v] = amountsIn(q.prompt);
    const r = pct(q.prompt)[0];
    if (!v || !r) return false;
    const igst = (v * r) / 100;
    return q.prompt.includes('amount of IGST') ? q.answer === igst : q.answer === v + igst;
  },
});

// ---------------------------------------------------------------------------------------------------------------
// Typed amounts: invoice with trade discount and GST
// ---------------------------------------------------------------------------------------------------------------

// Version 2: the firm, its goods and the rate come from one line of LINES, so that a garment shop does not sell paints
// and the rate fits the goods.
const thbGstInvoiceDiscount = numericTemplate({
  id: 'thb-gst-invoice-discount',
  version: 2,
  topicId: T,
  conceptId: 'thb-gst-calc',
  difficulty: 'medium',
  unit: 'rupees',
  generate: (rng) => {
    const list = rng.step(20000, 400000, 2000);
    const d = rng.pick([10, 20, 25]);
    const line = rng.pick(LINES);
    const r = line.rate;
    const net = (list * (100 - d)) / 100;
    const tax = (net * r) / 100;
    const half = tax / 2;
    const taxOnList = (list * r) / 100;
    if (!allWhole(net, tax, half, taxOnList)) return null;
    const inter = rng.next() < 0.3;
    const [from, to] = twoPlaces(rng, !inter);
    const goods = line.goods;
    const seller = line.firm;
    const where = inter
      ? `to a buyer in ${to.city} (${to.state}), a different state`
      : `to a buyer in ${to.city}, in the same state`;
    const intro = `${seller} of ${from.city} (${from.state}) lists ${goods} at ${inr(list)} and allows a trade discount of ${d}%. GST at ${r}% is charged on the price after trade discount. The goods are sold ${where}.`;
    const ask = inter ? rng.pick(['total', 'igst'] as const) : rng.pick(['total', 'cgst'] as const);
    if (ask === 'total') {
      return {
        prompt: `${intro} What is the invoice total?`,
        answer: rupees(net + tax),
        commonErrors: errs(
          { value: list + taxOnList, why: 'Ignored the trade discount and charged GST on the list price.' },
          { value: net, why: 'Gave the price after discount and left out the GST.' },
          { value: net + taxOnList, why: 'Deducted the discount from the price but calculated the GST on the list price.' },
        ),
        explanation: [
          `Trade discount = ${d}% of ${inr(list)} = ${inr(list - net)}, so the price after discount = ${inr(net)}.`,
          `GST = ${r}% of ${inr(net)} = ${inr(tax)}${inter ? ' (all IGST)' : ` (CGST ${inr(half)} + SGST ${inr(half)})`}.`,
          `Invoice total = ${inr(net)} + ${inr(tax)} = ${inr(net + tax)}.`,
        ],
        hints: GST_INVOICE_HINTS,
      };
    }
    const part = ask === 'igst' ? tax : half;
    const name = ask === 'igst' ? 'IGST' : 'CGST';
    return {
      prompt: `${intro} What amount of ${name} is shown on the invoice?`,
      answer: rupees(part),
      commonErrors: errs(
        { value: ask === 'igst' ? taxOnList : (list * r) / 200, why: `Calculated the ${name} on the list price instead of the price after trade discount.` },
        { value: ask === 'igst' ? tax / 2 : tax, why: ask === 'igst' ? 'Halved the tax as if CGST and SGST applied; an inter-state supply bears the whole tax as IGST.' : 'Took the whole GST as CGST; the tax is split equally between CGST and SGST.' },
        { value: net, why: 'Gave the price after discount instead of the tax.' },
      ),
      explanation: [
        `Price after ${d}% trade discount = ${inr(net)}.`,
        `GST = ${r}% of ${inr(net)} = ${inr(tax)}.`,
        ask === 'igst' ? `The supply is inter-state, so IGST = ${inr(tax)}.` : `CGST = half of ${inr(tax)} = ${inr(half)}.`,
      ],
      hints: GST_INVOICE_HINTS,
    };
  },
  verify: (q) => {
    const [list] = amountsIn(q.prompt);
    const [d, r] = pct(q.prompt);
    if (!list || !d || !r) return false;
    const afterDiscount = list - (list * d) / 100;
    const gstRatio = (afterDiscount * r) / 100;
    if (q.prompt.includes('invoice total')) return q.answer === afterDiscount + gstRatio;
    return q.prompt.includes('IGST') ? q.answer === gstRatio : q.answer === gstRatio / 2;
  },
});

// ---------------------------------------------------------------------------------------------------------------
// Net GST payable after input tax credit (same-head set-off)
// ---------------------------------------------------------------------------------------------------------------

// Version 2: the firm buys and sells the same goods, so its purchases bear the rate its sales do (version 1 drew the two
// rates apart, and a firm could buy at 18% and sell the same goods at 5%). The firm, its goods and the rate agree.
const thbGstNetPayable = numericTemplate({
  id: 'thb-gst-net-payable',
  version: 2,
  topicId: T,
  conceptId: 'thb-gst-calc',
  difficulty: 'medium',
  unit: 'rupees',
  generate: (rng) => {
    const mode = rng.pick(['cgst', 'total', 'carry'] as const);
    const s = rng.step(200000, 900000, 10000);
    const line = rng.pick(LINES);
    const r1 = line.rate;
    const r2 = line.rate;
    const f = mode === 'carry' ? rng.pick([115, 125, 140, 160]) : rng.pick([40, 50, 60, 70]);
    // Purchases are sized from the sales so that credit is clearly less than (or clearly more than) the output tax.
    const p = Math.floor((s * r1 * f) / (r2 * 100) / 200) * 200;
    if (p < 10000) return null;
    const out = (s * r1) / 200; // output CGST (and equally SGST)
    const inp = (p * r2) / 200; // input CGST (and equally SGST)
    if (!allWhole(out, inp) || (mode === 'carry' ? inp <= out : out <= inp)) return null;
    const rule = 'Input CGST is set off against output CGST and input SGST against output SGST; credit of one cannot be used against the other.';
    const intro = `${line.firm}, a dealer in ${line.goods}, sells and buys only within its own state. In one tax period its taxable sales were ${inr(s)}, on which it charged GST at ${r1}% (CGST and SGST in equal shares). In the same period it bought ${line.goods} worth ${inr(p)} (before tax) from suppliers in the same state, paying GST at the same rate of ${r2}%. ${rule}`;
    const working = [`Output CGST = ${r1}% / 2 of ${inr(s)} = ${inr(out)}; output SGST is the same.`, `Input CGST = ${r2}% / 2 of ${inr(p)} = ${inr(inp)}; input SGST is the same.`];
    if (mode === 'carry') {
      return {
        prompt: `${intro} The credit is more than the output tax in each head, so no cash payment is due. How much CGST credit is carried forward to the next period?`,
        answer: rupees(inp - out),
        commonErrors: errs(
          { value: 2 * (inp - out), why: 'Gave the carry-forward of CGST and SGST together; the question asks for CGST alone.' },
          { value: inp, why: 'Gave the whole input CGST instead of the part left after setting off the output CGST.' },
          { value: out, why: 'Gave the output CGST, which is the amount set off, not the credit left over.' },
        ),
        explanation: [...working, `CGST credit left = ${inr(inp)} - ${inr(out)} = ${inr(inp - out)}.`],
        hints: GST_NET_HINTS,
      };
    }
    if (mode === 'cgst') {
      return {
        prompt: `${intro} How much CGST must the firm pay in cash for the period?`,
        answer: rupees(out - inp),
        commonErrors: errs(
          { value: 2 * (out - inp), why: 'Gave CGST and SGST together; the question asks for CGST alone.' },
          { value: out, why: 'Ignored the input tax credit and paid the whole output CGST.' },
          { value: out + inp, why: 'Added the input credit to the output tax instead of deducting it.' },
        ),
        explanation: [...working, `CGST payable = ${inr(out)} - ${inr(inp)} = ${inr(out - inp)}.`],
        hints: GST_NET_HINTS,
      };
    }
    return {
      prompt: `${intro} How much GST (CGST and SGST together) must the firm pay in cash for the period?`,
      answer: rupees(2 * (out - inp)),
      commonErrors: errs(
        { value: out - inp, why: 'Set off the credit and counted CGST only; SGST is payable in the same amount.' },
        { value: 2 * out, why: 'Ignored the input tax credit and paid the whole output tax.' },
        { value: 2 * (out + inp), why: 'Added the input credit to the output tax instead of deducting it.' },
        { value: 2 * inp, why: 'Gave the input credit instead of the tax payable after setting it off.' },
      ),
      explanation: [...working, `CGST payable = ${inr(out)} - ${inr(inp)} = ${inr(out - inp)}; SGST payable is the same.`, `Total payable = ${inr(2 * (out - inp))}.`],
      hints: GST_NET_HINTS,
    };
  },
  verify: (q) => {
    const [s, p] = amountsIn(q.prompt);
    const [r1, r2] = pct(q.prompt);
    if (!s || !p || !r1 || !r2 || r1 !== r2) return false;
    const netBothHeads = (s * r1 - p * r2) / 100; // CGST and SGST together
    if (q.prompt.includes('carried forward')) return q.answer === -netBothHeads / 2;
    if (q.prompt.includes('CGST must')) return q.answer === netBothHeads / 2;
    return q.answer === netBothHeads;
  },
});

// ---------------------------------------------------------------------------------------------------------------
// Complex: set-off with IGST credit
// ---------------------------------------------------------------------------------------------------------------

// The order is the one the GST law lays down: credit of IGST is used up first (against output IGST, and then against
// output CGST and SGST in whatever split the dealer chooses), and only then is CGST credit used against CGST and SGST
// credit against SGST. The firm here has no output IGST and the prompt fixes the split at half and half, so that the
// tax payable under each head has one answer.
const thbGstCrossSetOff = numericTemplate({
  id: 'thb-gst-cross-set-off',
  topicId: T,
  conceptId: 'thb-gst-calc',
  difficulty: 'complex',
  unit: 'rupees',
  generate: (rng) => {
    const mode = rng.pick(['total', 'cgst', 'sgst'] as const);
    const s = rng.step(400000, 1000000, 10000);
    const rs = rng.pick(RATES);
    const r1 = rng.pick(RATES);
    const r2 = rng.pick(RATES);
    const p1 = Math.floor((s * rs * rng.pick([30, 40, 50])) / (r1 * 100) / 200) * 200;
    if (p1 < 10000) return null;
    const out = (s * rs) / 200; // output CGST (and equally SGST)
    const inp = (p1 * r1) / 200; // input CGST (and equally SGST)
    const d = out - inp;
    if (!allWhole(out, inp) || d <= 0) return null;
    const fraction = rng.pick([40, 60, 80, 120, 150, 170]);
    const p2 = Math.round(((d * fraction) / 100) * (100 / r2) / 200) * 200;
    if (p2 < 10000) return null;
    const g = (p2 * r2) / 100; // input IGST
    const half = g / 2;
    const head = d - half; // payable under each head
    if (!allWhole(g, half) || head <= 0) return null;
    const w = rng.step(20000, 90000, 10000);
    const firm = rng.pick(FIRMS);
    const intro = `${firm} sells only within its own state, so it has no output IGST. In one tax period it made taxable sales of ${inr(s)} at ${rs}% GST (CGST and SGST in equal shares). It bought goods worth ${inr(p1)} (before tax) from suppliers within the state at ${r1}% GST (input CGST and SGST in equal shares), and goods worth ${inr(p2)} (before tax) from a supplier in another state at ${r2}% GST (input IGST). It also paid salaries of ${inr(w)}, which carry no GST. Set-off rule: the IGST credit must be used first, and the firm uses half of it against output CGST and half against output SGST (the law allows any split). After that, input CGST is set off against the remaining output CGST and input SGST against the remaining output SGST. CGST credit cannot be used against SGST, nor SGST credit against CGST.`;
    const working = [
      `Output CGST = ${rs}% / 2 of ${inr(s)} = ${inr(out)}; output SGST is the same.`,
      `Input IGST = ${r2}% of ${inr(p2)} = ${inr(g)}, used first: ${inr(half)} against CGST and ${inr(half)} against SGST.`,
      `Input CGST = ${r1}% / 2 of ${inr(p1)} = ${inr(inp)}; input SGST is the same.`,
      `CGST payable = ${inr(out)} - ${inr(half)} - ${inr(inp)} = ${inr(head)}; SGST payable is the same.`,
    ];
    if (mode === 'total') {
      return {
        prompt: `${intro} How much GST must the firm pay in cash for the period (CGST and SGST together)?`,
        answer: rupees(2 * head),
        commonErrors: errsExcept(2 * head,
          { value: 2 * d, why: 'Forgot the input IGST credit, which also reduces the tax payable.' },
          { value: 2 * out - g, why: 'Used the IGST credit but forgot the input CGST and SGST paid on purchases within the state.' },
          { value: head, why: 'Gave the tax under one head only; CGST and SGST are both payable.' },
          { value: 2 * d + g, why: 'Added the IGST credit to the tax payable instead of deducting it.' },
          { value: 2 * out, why: 'Ignored all the input credit.' },
        ),
        explanation: [...working, `Cash payable = ${inr(head)} + ${inr(head)} = ${inr(2 * head)}. Salaries carry no GST and do not enter the working.`],
      };
    }
    const name = mode === 'cgst' ? 'CGST' : 'SGST';
    return {
      prompt: `${intro} How much ${name} must the firm pay in cash for the period?`,
      answer: rupees(head),
      commonErrors: errsExcept(head,
        { value: d, why: `Forgot the IGST credit; half of it is used against output ${name}.` },
        { value: d - g, why: `Set the whole IGST credit against ${name}; the firm uses only half of it under each head.` },
        { value: 2 * head, why: `Gave CGST and SGST together; the question asks for ${name} alone.` },
        { value: out - half, why: `Used the IGST credit but forgot the input ${name} paid on purchases within the state.` },
        { value: out, why: 'Ignored all the input credit.' },
      ),
      explanation: [...working, `${name} payable in cash = ${inr(head)}. Salaries carry no GST and do not enter the working.`],
    };
  },
  verify: (q) => {
    const [s, p1, p2] = amountsIn(q.prompt);
    const [rs, r1, r2] = pct(q.prompt);
    if (!s || !p1 || !p2 || !rs || !r1 || !r2) return false;
    // Walk the credits through the two heads in the stated order: IGST credit first, half to each head, then own-head credit.
    const igst = (p2 * r2) / 100;
    const ownHead = (p1 * r1) / 200;
    let cgst = (s * rs) / 200;
    let sgst = cgst;
    cgst -= igst / 2;
    sgst -= igst / 2;
    if (cgst < ownHead || sgst < ownHead) return false; // nothing may be left unused: the prompt speaks of tax to pay
    cgst -= ownHead;
    sgst -= ownHead;
    if (q.prompt.includes('CGST and SGST together')) return q.answer === cgst + sgst;
    return q.answer === (q.prompt.includes('How much CGST must') ? cgst : sgst);
  },
});

// ---------------------------------------------------------------------------------------------------------------
// Going concern: spreading cost over the life of an asset
// ---------------------------------------------------------------------------------------------------------------

const ASSET_NAMES = ['an oven', 'a delivery van', 'a sewing machine', 'a printing machine', 'a refrigeration unit', 'a lathe'];

const GC_HINTS = [
  'The firm will carry on, so the cost is shared out over the years the asset works. How much falls in one year?',
  'Yearly charge = cost / years of life. The cost still to be charged after k years = cost - k x yearly charge.',
];

const thbGcSpread = numericTemplate({
  id: 'thb-gc-spread',
  version: 2,
  topicId: T,
  conceptId: 'thb-assumptions',
  difficulty: 'easy',
  unit: 'rupees',
  generate: (rng) => {
    const life = rng.pick([4, 5, 8, 10]);
    const yearly = rng.step(5000, 60000, 2500);
    const cost = yearly * life;
    const asset = rng.pick(ASSET_NAMES);
    const firm = rng.pick(FIRMS);
    const intro = `${firm} buys ${asset} for ${inr(cost)}. The firm expects to stay in business for many years (the going concern assumption), so it spreads the cost equally over the ${life} years the asset will work, assuming no scrap value.`;
    if (rng.next() < 0.5) {
      return {
        prompt: `${intro} What amount is charged to the profit and loss account for each full year?`,
        answer: rupees(yearly),
        commonErrors: errs(
          { value: cost, why: 'Charged the whole cost in the first year, as if the business would not last beyond it.' },
          { value: cost * life, why: 'Multiplied the cost by the years instead of dividing it among them.' },
          { value: cost - yearly, why: 'Gave the cost left after the first year\'s charge instead of the yearly charge itself.' },
        ),
        explanation: [`Going concern: the business will carry on, so the cost is spread over the asset's life.`, `Yearly charge = ${inr(cost)} / ${life} = ${inr(yearly)}.`],
        hints: GC_HINTS,
      };
    }
    const k = rng.int(1, life - 1);
    return {
      prompt: `${intro} What is the cost still to be charged (the unexpired cost) after ${k} full ${k === 1 ? 'year' : 'years'}?`,
      answer: rupees(cost - yearly * k),
      commonErrors: errs(
        { value: yearly * k, why: 'Gave the amount already charged, not the amount still to be charged.' },
        { value: cost - yearly, why: `Deducted only one year's charge, though ${k} full years have passed.` },
        { value: cost, why: 'Gave the original cost, ignoring the charges already made.' },
      ),
      explanation: [`Yearly charge = ${inr(cost)} / ${life} = ${inr(yearly)}.`, `Charged in ${k} ${k === 1 ? 'year' : 'years'} = ${inr(yearly * k)}.`, `Unexpired cost = ${inr(cost)} - ${inr(yearly * k)} = ${inr(cost - yearly * k)}.`],
      hints: GC_HINTS,
    };
  },
  verify: (q) => {
    const [cost] = amountsIn(q.prompt);
    const life = Number(/over the (\d+) years/.exec(q.prompt)?.[1]);
    if (!cost || !life) return false;
    if (q.prompt.includes('each full year')) return q.answer * life === cost;
    const k = Number(/after (\d+) full/.exec(q.prompt)?.[1]);
    return q.answer + (cost / life) * k === cost;
  },
});

// ---------------------------------------------------------------------------------------------------------------
// Prudence: stock at the lower of cost and net realisable value
// ---------------------------------------------------------------------------------------------------------------

const LOTS = ['sarees', 'shirts', 'trousers', 'towels', 'blankets', 'school bags', 'cooking pots'];

const thbStockValuation = numericTemplate({
  id: 'thb-stock-valuation',
  topicId: T,
  conceptId: 'thb-principles',
  difficulty: 'medium',
  unit: 'rupees',
  generate: (rng) => {
    const names = rng.shuffle(LOTS).slice(0, 3);
    const lots = names.map(() => {
      const cost = rng.step(20000, 120000, 5000);
      const nrv = cost + rng.pick([-20000, -15000, -10000, -5000, 5000, 10000, 15000]);
      return { cost, nrv };
    });
    if (nrv0(lots) < 10000) return null;
    const lower = lots.filter((l) => l.nrv < l.cost).length;
    if (lower === 0 || lower === 3) return null; // The lesson needs some lots that fell and some that rose.
    const answer = lots.reduce((t, l) => t + Math.min(l.cost, l.nrv), 0);
    const totalCost = lots.reduce((t, l) => t + l.cost, 0);
    const totalNrv = lots.reduce((t, l) => t + l.nrv, 0);
    const totalMax = lots.reduce((t, l) => t + Math.max(l.cost, l.nrv), 0);
    const firm = rng.pick(['Anand Textiles', 'Gupta Emporium', 'Meena Stores', 'Rao Home Goods']);
    const list = lots.map((l, i) => `Lot ${i + 1} (${names[i]}): cost ${inr(l.cost)}, net realisable value ${inr(l.nrv)}`).join('; ');
    return {
      prompt: `At the year end, ${firm} holds three lots of stock. ${list}. Following prudence, at what total value will the stock be shown in the balance sheet, valuing each lot separately?`,
      answer: rupees(answer),
      commonErrors: errs(
        { value: totalCost, why: 'Valued all the stock at cost, ignoring the fall in value of the lots whose net realisable value is lower.' },
        { value: totalNrv, why: 'Valued all the stock at net realisable value, which records an unrealised gain on the lots that have risen in value.' },
        { value: totalMax, why: 'Took the higher of the two figures for each lot; prudence needs the lower.' },
      ),
      explanation: [
        'Prudence: stock is valued at the lower of cost and net realisable value, lot by lot.',
        ...lots.map((l, i) => `Lot ${i + 1}: lower of ${inr(l.cost)} and ${inr(l.nrv)} = ${inr(Math.min(l.cost, l.nrv))}.`),
        `Total = ${inr(answer)}.`,
      ],
    };
  },
  verify: (q) => {
    const m = amountsIn(q.prompt);
    if (m.length !== 6) return false;
    const pairs = [[m[0], m[1]], [m[2], m[3]], [m[4], m[5]]];
    return q.answer === pairs.reduce((t, [c, n]) => t + (c < n ? c : n), 0);
  },
});
const nrv0 = (lots: { cost: number; nrv: number }[]): number => Math.min(...lots.map((l) => l.nrv));

// ---------------------------------------------------------------------------------------------------------------
// Cash basis versus accrual basis: profit from the same facts
// ---------------------------------------------------------------------------------------------------------------

const BIZ = ['a coaching institute', 'a computer training centre', 'a dance academy', 'a driving school'];

const BASIS_PROFIT_HINTS = [
  'Sort the four items: which belong to this year but have not moved cash, and which moved cash but belong to next year?',
  'Accrual income = cash received - received in advance + earned but not received. Accrual expenses = cash paid - paid in advance + outstanding. Profit = income - expenses; the cash profit is simply cash in less cash out.',
];

const thbCashAccrualProfit = numericTemplate({
  id: 'thb-cash-accrual-profit',
  version: 2,
  topicId: T,
  conceptId: 'thb-bases',
  difficulty: 'medium',
  unit: 'rupees',
  generate: (rng) => {
    const biz = rng.pick(BIZ);
    const R = rng.step(400000, 900000, 10000); // fees received in cash
    const P = rng.step(100000, 300000, 10000); // expenses paid in cash
    const AD = rng.step(10000, 60000, 5000); // received in advance for next year
    const A = rng.step(10000, 60000, 5000); // earned, not yet received
    const PP = rng.step(5000, 40000, 5000); // paid in advance for next year
    const O = rng.step(5000, 40000, 5000); // outstanding at the year end
    if (A === AD || O === PP) return null; // Equal items would make some of the wrong answers collapse into the right one.
    const income = R - AD + A;
    const expense = P - PP + O;
    const accrual = income - expense;
    const cash = R - P;
    const none = 'There were no such items at the start of the year.';
    switch (rng.pick(['accrual', 'cash', 'diff'] as const)) {
      case 'accrual':
        return {
          prompt: `The cash records of ${biz} for the year ended 31 March show fees received ${inr(R)} (this includes ${inr(AD)} received in advance for the next year) and expenses paid ${inr(P)} (this includes ${inr(PP)} paid in advance for the next year). Fees of ${inr(A)} were earned but not yet received, and expenses of ${inr(O)} were outstanding at 31 March. ${none} What is the profit for the year on the accrual basis?`,
          answer: rupees(accrual),
          commonErrors: errs(
            { value: cash, why: 'Gave the cash-basis profit, ignoring the advance, accrued, prepaid and outstanding items.' },
            { value: R + A - (P - PP + O), why: 'Left the advance fees in the income; they belong to next year.' },
            { value: income - (P + PP + O), why: 'Added the prepaid expense instead of deducting it; prepaid belongs to next year.' },
            { value: income - (P - PP), why: 'Left out the outstanding expenses, which belong to this year.' },
            { value: R - AD - expense, why: 'Left out the fees earned but not received, which belong to this year.' },
          ),
          explanation: [
            `Income for the year = ${inr(R)} - ${inr(AD)} + ${inr(A)} = ${inr(income)}.`,
            `Expenses for the year = ${inr(P)} - ${inr(PP)} + ${inr(O)} = ${inr(expense)}.`,
            `Profit on accrual basis = ${inr(income)} - ${inr(expense)} = ${inr(accrual)}.`,
          ],
          hints: BASIS_PROFIT_HINTS,
        };
      case 'cash':
        return {
          prompt: `The accounts of ${biz} on the accrual basis for the year ended 31 March show income of ${inr(income)} and expenses of ${inr(expense)}. At 31 March, fees of ${inr(A)} were earned but not received, and fees of ${inr(AD)} had been received in advance for the next year. Expenses of ${inr(O)} were outstanding, and expenses of ${inr(PP)} had been paid in advance for the next year. There were no such items at the start of the year. What would the profit be on the cash basis?`,
          answer: rupees(cash),
          commonErrors: errs(
            { value: accrual, why: 'Gave the accrual-basis profit, which is what the question already starts from.' },
            { value: income + A - AD - (expense - O + PP), why: 'Adjusted the income in the wrong direction; cash received excludes the accrued fees and includes the advance.' },
            { value: income - A + AD - (expense + O - PP), why: 'Adjusted the expenses in the wrong direction; cash paid excludes the outstanding items and includes the prepaid.' },
            { value: income - A - expense + O - PP, why: 'Forgot that the advance fees were received in cash, so they count on the cash basis.' },
          ),
          explanation: [
            `Cash received = ${inr(income)} - ${inr(A)} + ${inr(AD)} = ${inr(R)}.`,
            `Cash paid = ${inr(expense)} - ${inr(O)} + ${inr(PP)} = ${inr(P)}.`,
            `Profit on cash basis = ${inr(R)} - ${inr(P)} = ${inr(cash)}.`,
          ],
          hints: BASIS_PROFIT_HINTS,
        };
      default: {
        const diff = Math.abs(accrual - cash);
        if (diff === 0) return null;
        return {
          prompt: `The cash records of ${biz} for the year ended 31 March show fees received ${inr(R)} (this includes ${inr(AD)} received in advance for the next year) and expenses paid ${inr(P)} (this includes ${inr(PP)} paid in advance for the next year). Fees of ${inr(A)} were earned but not yet received, and expenses of ${inr(O)} were outstanding at 31 March. ${none} By how much does the profit on the accrual basis differ from the profit on the cash basis?`,
          answer: rupees(diff),
          commonErrors: errs(
            { value: A + AD + O + PP, why: 'Added all four items, though two of them raise the accrual profit and two lower it.' },
            { value: Math.abs(A - AD), why: 'Counted only the adjustments to income and left out those to expenses.' },
            { value: Math.abs(O - PP), why: 'Counted only the adjustments to expenses and left out those to income.' },
            { value: accrual, why: 'Gave the accrual profit itself, not its difference from the cash profit.' },
          ),
          explanation: [
            `Accrual profit = ${inr(accrual)}; cash profit = ${inr(R)} - ${inr(P)} = ${inr(cash)}.`,
            `Accrual profit is ${accrual > cash ? 'higher' : 'lower'} than cash profit by ${inr(diff)}.`,
            `Check: ${inr(A)} accrued - ${inr(AD)} in advance + ${inr(PP)} prepaid - ${inr(O)} outstanding = ${accrual > cash ? '' : '-'}${inr(diff)}.`,
          ],
          hints: BASIS_PROFIT_HINTS,
        };
      }
    }
  },
  verify: (q) => {
    const m = amountsIn(q.prompt);
    if (q.prompt.includes('What would the profit be on the cash basis')) {
      const [income, expense, A, AD, O, PP] = m;
      return q.answer === income - A + AD - (expense - O + PP);
    }
    const [R, AD, P, PP, A, O] = m;
    const cash = R - P;
    const net = A - AD + (PP - O); // what the four items add to the cash profit
    return q.prompt.includes('accrual basis?') ? q.answer === cash + net : q.answer === Math.abs(net);
  },
});

// ---------------------------------------------------------------------------------------------------------------
// Matching: the part of a prepaid cost that belongs to this year
// ---------------------------------------------------------------------------------------------------------------

const MONTHS = ['April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December', 'January', 'February', 'March'];
const PREPAID_ITEMS = ['an insurance premium for the shop', 'annual maintenance charges for the lift', 'rent of a godown', 'a subscription to a trade journal', 'a software licence'];

const thbPremiumPeriod = numericTemplate({
  id: 'thb-premium-period',
  topicId: T,
  conceptId: 'thb-principles',
  difficulty: 'medium',
  unit: 'rupees',
  generate: (rng) => {
    const idx = rng.int(0, 11);
    const monthsThisYear = 12 - idx;
    const span = rng.pick([12, 24]);
    if (monthsThisYear >= span) return null;
    const monthly = rng.step(500, 3000, 250);
    const paid = monthly * span;
    const item = rng.pick(PREPAID_ITEMS);
    const firm = rng.pick(FIRMS);
    const intro = `On 1 ${MONTHS[idx]}, ${firm} paid ${inr(paid)} for ${item}, covering the next ${span} months. The firm's accounting year ends on 31 March, and the cost is spread equally over the months it covers.`;
    const charge = monthly * monthsThisYear;
    const carried = paid - charge;
    if (rng.next() < 0.5) {
      return {
        prompt: `${intro} How much of it is charged to the profit and loss account of the accounting year in which it was paid?`,
        answer: rupees(charge),
        commonErrors: errs(
          { value: paid, why: 'Charged the whole payment to this year, though part of it covers months after 31 March.' },
          { value: carried, why: 'Gave the part that covers months after 31 March instead of the part that belongs to this year.' },
          { value: monthly * (monthsThisYear + 1), why: 'Counted one month too many; the cost runs from 1 ' + MONTHS[idx] + ' to 31 March only.' },
          { value: monthly * (monthsThisYear - 1), why: 'Counted one month too few, leaving out a month of the year.' },
        ),
        explanation: [
          `Cost per month = ${inr(paid)} / ${span} = ${inr(monthly)}.`,
          `Months from 1 ${MONTHS[idx]} to 31 March = ${monthsThisYear}.`,
          `Matching: charge for this year = ${inr(monthly)} x ${monthsThisYear} = ${inr(charge)}.`,
        ],
      };
    }
    return {
      prompt: `${intro} What amount is shown as a prepaid expense at the first 31 March after the payment?`,
      answer: rupees(carried),
      commonErrors: errs(
        { value: charge, why: 'Gave the part that belongs to this year instead of the unexpired part.' },
        { value: paid, why: 'Carried forward the whole payment, though part of it covers months of this year.' },
        { value: carried + monthly, why: 'Counted one month too many as unexpired.' },
        { value: carried - monthly, why: 'Counted one month too few as unexpired.' },
      ),
      explanation: [
        `Cost per month = ${inr(paid)} / ${span} = ${inr(monthly)}.`,
        `Months used up to 31 March = ${monthsThisYear}; months still unexpired = ${span - monthsThisYear}.`,
        `Prepaid at 31 March = ${inr(monthly)} x ${span - monthsThisYear} = ${inr(carried)}.`,
      ],
    };
  },
  verify: (q) => {
    const [paid] = amountsIn(q.prompt);
    const month = MONTHS.findIndex((mo) => q.prompt.includes(`On 1 ${mo},`));
    const span = Number(/covering the next (\d+) months/.exec(q.prompt)?.[1]);
    if (!paid || month < 0 || !span) return false;
    const used = MONTHS.length - month; // April is month 0, so the months to 31 March are 12 - index
    const unexpired = (paid * (span - used)) / span;
    return q.prompt.includes('prepaid expense') ? q.answer === unexpired : q.answer === paid - unexpired;
  },
});

// ---------------------------------------------------------------------------------------------------------------
// Revenue recognition: how much revenue for the year?
// ---------------------------------------------------------------------------------------------------------------

const WORKSHOPS: [string, string][] = [
  ['a tailoring workshop', 'garments'],
  ['a furniture workshop', 'furniture'],
  ['a printing press', 'printed jobs'],
  ['a bakery that takes bulk orders', 'cakes and pastries'],
];

const thbRevenueAmount = numericTemplate({
  id: 'thb-revenue-amount',
  topicId: T,
  conceptId: 'thb-principles',
  difficulty: 'medium',
  unit: 'rupees',
  generate: (rng) => {
    const [biz, product] = rng.pick(WORKSHOPS);
    const C = rng.step(40000, 200000, 10000);
    const K = rng.step(20000, 150000, 10000);
    const A = rng.step(5000, 40000, 5000);
    const O = A + rng.step(20000, 80000, 10000);
    const M = rng.step(10000, 60000, 10000);
    const revenue = C + K;
    return {
      prompt: `For the year ended 31 March, ${biz} delivered ${product} worth ${inr(C)} against cash and ${inr(K)} on credit. At 31 March it also held firm orders of ${inr(O)} for ${product} not yet delivered, and had received ${inr(A)} as advance against those orders. During the year it also collected ${inr(M)} from customers for ${product} delivered in the previous year. What revenue does it recognise for the year?`,
      answer: rupees(revenue),
      commonErrors: errs(
        { value: revenue + A, why: 'Counted the advance as revenue, though the goods are not yet delivered.' },
        { value: revenue + O, why: 'Counted the orders on hand as sales; an order is not revenue until delivery.' },
        { value: revenue + M, why: 'Counted the collection of last year\'s sales again; that revenue was recognised last year.' },
        { value: C + A + M, why: 'Counted cash received instead of goods delivered; revenue follows delivery, not cash.' },
      ),
      explanation: [
        'Revenue is recognised when goods are delivered, whether or not cash has been received.',
        `Delivered for cash ${inr(C)} + delivered on credit ${inr(K)} = ${inr(revenue)}.`,
        `Not revenue of this year: orders on hand ${inr(O)}, advance ${inr(A)} (goods not yet delivered) and ${inr(M)} collected for last year's sales.`,
      ],
    };
  },
  verify: (q) => {
    const [C, K] = amountsIn(q.prompt);
    return q.answer === C + K;
  },
});

// ---------------------------------------------------------------------------------------------------------------
// Complex: expense, income and profit from opening and closing balances
// ---------------------------------------------------------------------------------------------------------------

type Open = 'out' | 'pre';
type OpenIncome = 'acc' | 'adv';

const thbCashAccrualRoll = numericTemplate({
  id: 'thb-cash-accrual-roll',
  topicId: T,
  conceptId: 'thb-bases',
  difficulty: 'complex',
  unit: 'rupees',
  generate: (rng) => {
    const P = rng.step(100000, 300000, 10000);
    const R = rng.step(300000, 800000, 10000);
    const [oa, ob] = [rng.step(5000, 40000, 5000), rng.step(5000, 40000, 5000)];
    const [ia, ib] = [rng.step(5000, 40000, 5000), rng.step(5000, 40000, 5000)];
    // Equal opening and closing figures would make two of the slips below give the same number.
    if (oa === ob || ia === ib) return null;
    const eo: Open = rng.pick(['out', 'pre']);
    const ec: Open = rng.pick(['out', 'pre']);
    const io: OpenIncome = rng.pick(['acc', 'adv']);
    const ic: OpenIncome = rng.pick(['acc', 'adv']);
    // The effect of each opening or closing balance on what the year's figure is, given the cash figure.
    const eSign = { open: eo === 'out' ? -1 : 1, close: ec === 'out' ? 1 : -1 };
    const iSign = { open: io === 'acc' ? -1 : 1, close: ic === 'acc' ? 1 : -1 };
    const expense = P + eSign.open * oa + eSign.close * ob;
    const income = R + iSign.open * ia + iSign.close * ib;
    const profit = income - expense;
    if (profit <= 0) return null;
    const rentOpen = eo === 'out' ? `rent outstanding at the beginning of the year ${inr(oa)}` : `rent paid in advance at the beginning of the year ${inr(oa)}`;
    const rentClose = ec === 'out' ? `rent outstanding at the end of the year ${inr(ob)}` : `rent paid in advance at the end of the year ${inr(ob)}`;
    const comOpen = io === 'acc' ? `commission accrued but not received at the beginning of the year ${inr(ia)}` : `commission received in advance at the beginning of the year ${inr(ia)}`;
    const comClose = ic === 'acc' ? `commission accrued but not received at the end of the year ${inr(ib)}` : `commission received in advance at the end of the year ${inr(ib)}`;
    const intro = `${rng.pick(FIRMS)} keeps its accounts on the accrual basis. For the year ended 31 March: rent paid during the year ${inr(P)}; ${rentOpen}; ${rentClose}. Commission received during the year ${inr(R)}; ${comOpen}; ${comClose}.`;
    const rentLine = `Rent for the year = ${inr(P)}${eo === 'out' ? ' - ' : ' + '}${inr(oa)}${ec === 'out' ? ' + ' : ' - '}${inr(ob)} = ${inr(expense)}.`;
    const comLine = `Commission earned for the year = ${inr(R)}${io === 'acc' ? ' - ' : ' + '}${inr(ia)}${ic === 'acc' ? ' + ' : ' - '}${inr(ib)} = ${inr(income)}.`;
    const ask = rng.pick(['rent', 'commission', 'profit'] as const);
    if (ask === 'rent') {
      return {
        prompt: `${intro} What rent is charged to the profit and loss account for the year?`,
        answer: rupees(expense),
        commonErrors: errsExcept(expense,
          { value: P, why: 'Gave the rent paid in cash; the charge for the year also depends on the opening and closing balances.' },
          { value: P + eSign.close * ob, why: 'Ignored the balance at the beginning of the year.' },
          { value: P + eSign.open * oa, why: 'Ignored the balance at the end of the year.' },
          { value: P - eSign.open * oa + eSign.close * ob, why: 'Applied the opening balance the wrong way round: added what should be deducted or the reverse.' },
          { value: P + eSign.open * oa - eSign.close * ob, why: 'Applied the closing balance the wrong way round: added what should be deducted or the reverse.' },
        ),
        explanation: [rentLine],
      };
    }
    if (ask === 'commission') {
      return {
        prompt: `${intro} What commission is credited to the profit and loss account as income of the year?`,
        answer: rupees(income),
        commonErrors: errsExcept(income,
          { value: R, why: 'Gave the commission received in cash; the income of the year also depends on the opening and closing balances.' },
          { value: R + iSign.close * ib, why: 'Ignored the balance at the beginning of the year.' },
          { value: R + iSign.open * ia, why: 'Ignored the balance at the end of the year.' },
          { value: R - iSign.open * ia + iSign.close * ib, why: 'Applied the opening balance the wrong way round.' },
          { value: R + iSign.open * ia - iSign.close * ib, why: 'Applied the closing balance the wrong way round.' },
        ),
        explanation: [comLine],
      };
    }
    return {
      prompt: `${intro} What is the net result for the year from these two items (commission earned less rent charged)?`,
      answer: rupees(profit),
      commonErrors: errsExcept(profit,
        { value: R - P, why: 'Used the cash received less the cash paid, ignoring all opening and closing balances.' },
        { value: income - P, why: 'Adjusted the commission but charged the rent as paid.' },
        { value: R - expense, why: 'Adjusted the rent but took the commission as received.' },
        { value: income - (P + eSign.close * ob), why: 'Ignored the rent balance at the beginning of the year.' },
      ),
      explanation: [rentLine, comLine, `Net result = ${inr(income)} - ${inr(expense)} = ${inr(profit)}.`],
    };
  },
  // Re-derived as ledger accounts: the debit side of a rent account less its credit side, and the credit side of a
  // commission account less its debit side, each read off the labels in the prompt.
  verify: (q) => {
    const get = (label: string): number => {
      const m = new RegExp(`${label} (₹\\d(?:[\\d,]*\\d)?)`, 'i').exec(q.prompt);
      return m ? (parseRupees(m[1]) ?? 0) : 0;
    };
    const rentDr = get('rent paid during the year') + get('rent paid in advance at the beginning of the year') + get('rent outstanding at the end of the year');
    const rentCr = get('rent outstanding at the beginning of the year') + get('rent paid in advance at the end of the year');
    const comCr = get('commission received during the year') + get('commission received in advance at the beginning of the year') + get('commission accrued but not received at the end of the year');
    const comDr = get('commission accrued but not received at the beginning of the year') + get('commission received in advance at the end of the year');
    if (q.prompt.includes('What rent is charged')) return q.answer === rentDr - rentCr;
    if (q.prompt.includes('What commission is credited')) return q.answer === comCr - comDr;
    return q.answer === comCr - comDr - (rentDr - rentCr);
  },
});

// ---------------------------------------------------------------------------------------------------------------
// Historical cost: what goes into the cost of an asset (complex)
// ---------------------------------------------------------------------------------------------------------------

/** Version 2 of `thb-asset-cost`: each machine goes with a firm that would use it (version 1 had a stationer buy an oven). */
const BUYERS: [string, string][] = [
  ['Reddy Foods, a maker of packaged snacks', 'a packaging machine'],
  ['Singh Auto Parts, a maker of brake parts', 'a CNC cutting machine'],
  ['Annapurna Bakers', 'an industrial oven'],
  ['Nair Printers', 'a printing press'],
  ['Rathore Cartons', 'a carton-making machine'],
  ['Joshi Ice Creams', 'an ice-cream freezing plant'],
];
const ASSET_COST_HINTS = [
  'Ask of each figure: did the firm spend it to get the machine and make it ready to work?',
  'Cost = price after trade discount + freight + installation. Leave out GST the firm claims back as credit, a running maintenance contract and any later market value.',
];

const thbAssetCost = numericTemplate({
  id: 'thb-asset-cost',
  version: 2,
  topicId: T,
  conceptId: 'thb-principles',
  difficulty: 'complex',
  unit: 'rupees',
  generate: (rng) => {
    const list = rng.step(100000, 600000, 10000);
    const d = rng.pick([10, 20, 25]);
    const net = (list * (100 - d)) / 100;
    const gstRate = 18; // plant and machinery
    const gst = (net * gstRate) / 100;
    const freight = rng.step(2000, 12000, 1000);
    const install = rng.step(3000, 15000, 1000);
    const amc = rng.step(4000, 20000, 1000);
    const later = list + rng.step(20000, 90000, 10000);
    if (!allWhole(net, gst)) return null;
    const cost = net + freight + install;
    const [buyer, asset] = rng.pick(BUYERS);
    return {
      prompt: `${buyer} buys ${asset} with a list price of ${inr(list)} and gets a trade discount of ${d}%. The supplier also charges GST at ${gstRate}%, which the firm will claim as input tax credit. The firm pays freight of ${inr(freight)} and installation charges of ${inr(install)}, and a one-year maintenance contract costing ${inr(amc)}. Three years later a valuer says the machine would sell for ${inr(later)}. Under the historical cost concept, what is the cost of the machine in the firm's books, before any depreciation?`,
      answer: rupees(cost),
      commonErrors: errs(
        { value: cost + gst, why: 'Included the GST, which the firm claims back as input tax credit, so it is not part of the cost.' },
        { value: cost + amc, why: 'Included the maintenance contract, which is a running expense (revenue expenditure), not part of the cost of the machine.' },
        { value: list + freight + install, why: 'Ignored the trade discount; the cost is the price actually paid.' },
        { value: net + freight, why: 'Left out installation, which is needed to bring the machine to working condition and so forms part of its cost.' },
        { value: later, why: 'Used the later market value; the historical cost concept does not record later changes in value.' },
      ),
      explanation: [
        `Price after ${d}% trade discount = ${inr(list)} - ${inr(list - net)} = ${inr(net)}.`,
        `Cost = ${inr(net)} + freight ${inr(freight)} + installation ${inr(install)} = ${inr(cost)}.`,
        `Not included: GST ${inr(gst)} (claimed as input tax credit), the maintenance contract ${inr(amc)} (a running expense) and the later market value ${inr(later)}.`,
      ],
      hints: ASSET_COST_HINTS,
    };
  },
  verify: (q) => {
    const [list, freight, install] = amountsIn(q.prompt);
    const d = pct(q.prompt)[0];
    if (!list || !d) return false;
    return q.answer === list - (list * d) / 100 + freight + install;
  },
});

// ---------------------------------------------------------------------------------------------------------------
// Business entity: personal items charged to the business (complex)
// ---------------------------------------------------------------------------------------------------------------

const PERSONAL = ['the proprietor\'s home electricity bill', 'the school fees of the proprietor\'s daughter', 'the proprietor\'s house rent', 'the proprietor\'s family holiday expenses', 'groceries bought for the proprietor\'s home', 'the proprietor\'s personal income tax'];
const BUSINESS = ['shop rent', 'wages of the shop assistants', 'electricity of the shop', 'advertisement', 'repairs to the shop shutters', 'packing material'];

const thbEntityProfit = numericTemplate({
  id: 'thb-entity-profit',
  topicId: T,
  conceptId: 'thb-principles',
  difficulty: 'complex',
  unit: 'rupees',
  generate: (rng) => {
    const personal = rng.shuffle(PERSONAL).slice(0, 2).map((label) => ({ label, v: rng.step(4000, 40000, 2000), personal: true }));
    const business = rng.shuffle(BUSINESS).slice(0, 2).map((label) => ({ label, v: rng.step(6000, 60000, 2000), personal: false }));
    const items = rng.shuffle([...personal, ...business]);
    const P = rng.step(80000, 400000, 10000);
    const personalSum = personal[0].v + personal[1].v;
    const businessSum = business[0].v + business[1].v;
    const list = items.map((i) => `${i.label} ${inr(i.v)}`).join('; ');
    const intro = `${rng.pick(WHO)}, a sole proprietor, drew up the books of a shop for the year and found a net profit of ${inr(P)}. The expenses charged against this profit included: ${list}.`;
    if (rng.next() < 0.6) {
      return {
        prompt: `${intro} Applying the business entity concept, what is the correct net profit?`,
        answer: rupees(P + personalSum),
        commonErrors: errs(
          { value: P, why: 'Left the profit as it stands, though the personal items were wrongly charged to the business.' },
          { value: P - personalSum, why: 'Deducted the personal items again; they must be added back because they were wrongly charged.' },
          { value: P + personalSum + businessSum, why: 'Added back the business expenses too; only the proprietor\'s personal items are wrongly charged.' },
          { value: P + personal[0].v, why: 'Added back only one of the two personal items.' },
        ),
        explanation: [
          `Personal items: ${personal.map((i) => `${i.label} ${inr(i.v)}`).join(' and ')} = ${inr(personalSum)}.`,
          'They belong to the owner, not the business, so they are drawings and not expenses.',
          `Correct net profit = ${inr(P)} + ${inr(personalSum)} = ${inr(P + personalSum)}.`,
        ],
      };
    }
    return {
      prompt: `${intro} Applying the business entity concept, what total should be treated as Drawings instead of expenses?`,
      answer: rupees(personalSum),
      commonErrors: errs(
        { value: personalSum + businessSum, why: 'Included the business expenses; only the proprietor\'s personal items are drawings.' },
        { value: personal[0].v, why: 'Counted only one of the two personal items.' },
        { value: businessSum, why: 'Chose the business expenses, which are properly charged, instead of the personal items.' },
        { value: P, why: 'Gave the profit, which is not what the question asks.' },
      ),
      explanation: [`Personal items: ${personal.map((i) => `${i.label} ${inr(i.v)}`).join(' and ')}.`, `Drawings = ${inr(personalSum)}.`],
    };
  },
  verify: (q) => {
    const [P] = amountsIn(q.prompt);
    const personal = [...q.prompt.matchAll(/proprietor's[^₹]*?(₹\d(?:[\d,]*\d)?)/g)].map((m) => parseRupees(m[1]) ?? 0);
    const sum = personal.reduce((a, b) => a + b, 0);
    if (personal.length !== 2) return false;
    return q.prompt.includes('Drawings') ? q.answer === sum : q.answer === P + sum;
  },
});


// ---------------------------------------------------------------------------------------------------------------
// Which entities follow Ind AS and which the Accounting Standards, added after the check against the CBSE 2025-26 syllabus, which names the applicability of AS and Ind AS.
// ---------------------------------------------------------------------------------------------------------------

const STANDARD_SETS = {
  ind: 'Ind AS',
  co: 'The Accounting Standards notified for companies under the Companies Act',
  icai: 'The Accounting Standards (AS) issued by the ICAI',
  ifrs: 'IFRS, as issued by the IASB, applied directly',
} as const;
type StandardSet = keyof typeof STANDARD_SETS;

/** Who follows what, in the plain terms the course teaches: no figures of net worth. */
const FOLLOWERS: { who: string; set: Exclude<StandardSet, 'ifrs'>; why: string }[] = [
  { who: 'A grocery shop run by its owner as a sole proprietorship', set: 'icai', why: 'A sole proprietorship is not a company: it follows the Accounting Standards issued by the ICAI.' },
  { who: 'A partnership firm of architects', set: 'icai', why: 'A partnership firm is not a company: it follows the Accounting Standards issued by the ICAI.' },
  { who: 'A steel company whose shares are listed on the main board of the National Stock Exchange', set: 'ind', why: 'A company listed on the main board of a stock exchange in India must follow Ind AS.' },
  { who: 'A textile company whose shares are listed on the main board of the Bombay Stock Exchange', set: 'ind', why: 'A company listed on the main board of a stock exchange in India must follow Ind AS.' },
  { who: 'An unlisted subsidiary of a listed steel company that follows Ind AS', set: 'ind', why: 'The holding, subsidiary, joint venture and associate companies of a company on Ind AS follow Ind AS too.' },
  { who: 'A small unlisted private company that is not required to follow Ind AS and has not chosen to', set: 'co', why: 'A company outside Ind AS follows the Accounting Standards notified for companies under the Companies Act.' },
];
const SET_SLIP: Record<StandardSet, string> = {
  ind: 'Thought Ind AS bind every business; they bind listed companies (and those linked to them) and the companies the rules name.',
  co: 'The Accounting Standards notified under the Companies Act are for companies outside Ind AS.',
  icai: 'The ICAI\'s Accounting Standards are for non-corporate entities such as sole proprietors and firms, not for companies.',
  ifrs: 'Indian entities do not apply IFRS directly: India has converged with IFRS through Ind AS.',
};

const WHICH_SET_HINTS = [
  'First ask: is the entity a company at all? Then: is it listed, or linked to a listed company?',
  'Non-corporate entities (sole proprietors, firms) follow the ICAI\'s Accounting Standards. Listed companies and those linked to them follow Ind AS. Other companies follow the Accounting Standards notified under the Companies Act. No one applies IFRS directly.',
];

const thbStandardsWhichSet = factsTemplate({
  id: 'thb-standards-which-set', version: 2, topicId: T, conceptId: 'thb-standards', difficulty: 'easy',
  facts: FOLLOWERS.map((f) => ({
    hints: WHICH_SET_HINTS,
    prompt: `${f.who}. Which accounting standards does it follow?`,
    correct: STANDARD_SETS[f.set],
    distractors: (Object.keys(STANDARD_SETS) as StandardSet[]).filter((k) => k !== f.set).map((k) => ({ text: STANDARD_SETS[k], why: SET_SLIP[k] })),
    explanation: f.why,
  })),
});

const thbStandardsRule = factsTemplate({
  id: 'thb-standards-rule', version: 2, topicId: T, conceptId: 'thb-standards', difficulty: 'medium',
  facts: [
    {
      hints: WHICH_SET_HINTS,
      prompt: 'Which statement about Ind AS is true?',
      correct: 'A company that has moved to Ind AS cannot go back to the Accounting Standards',
      distractors: [
        { text: 'A company may move between Ind AS and AS from year to year', why: 'Once on Ind AS a company stays on them; moving back and forth would destroy comparability.' },
        { text: 'Sole proprietors must follow Ind AS', why: 'Ind AS are for companies; sole proprietors follow the ICAI\'s Accounting Standards.' },
        { text: 'Ind AS are the IFRS of the IASB, applied without any change', why: 'Ind AS are converged with IFRS, closely but not word for word.' },
      ],
      explanation: 'Moving to Ind AS is a one-way step.',
    },
    {
      hints: WHICH_SET_HINTS,
      prompt: 'A company that is not required to follow Ind AS:',
      correct: 'May adopt them by choice, and must then keep to them',
      distractors: [
        { text: 'Is not allowed to adopt them', why: 'Any company may adopt Ind AS of its own choice.' },
        { text: 'Must follow IFRS instead', why: 'Indian companies do not apply IFRS directly.' },
        { text: 'Need follow no accounting standards at all', why: 'It follows the Accounting Standards notified for companies under the Companies Act.' },
      ],
      explanation: 'Ind AS can be adopted voluntarily; once adopted they cannot be given up.',
    },
    {
      hints: WHICH_SET_HINTS,
      prompt: 'Who follows the Accounting Standards issued by the ICAI?',
      correct: 'Non-corporate entities, such as sole proprietors and partnership firms',
      distractors: [
        { text: 'Companies listed on a stock exchange', why: 'Listed companies follow Ind AS.' },
        { text: 'Every company in India', why: 'Companies follow Ind AS or the Accounting Standards notified under the Companies Act.' },
        { text: 'No one: they were replaced by Ind AS', why: 'They are still in force for entities that are not companies.' },
      ],
      explanation: 'The ICAI\'s Accounting Standards apply to non-corporate entities.',
    },
    {
      hints: WHICH_SET_HINTS,
      prompt: 'Which companies must follow Ind AS?',
      correct: 'Listed companies, the companies linked to them as holding, subsidiary, joint venture or associate, and other companies the rules name',
      distractors: [
        { text: 'Every company, from the smallest private company upwards', why: 'Smaller unlisted companies outside the rules follow the Accounting Standards notified under the Companies Act.' },
        { text: 'Only companies incorporated outside India', why: 'Ind AS are Indian standards for Indian companies.' },
        { text: 'Only government companies', why: 'Ind AS do not turn on who owns the shares but on listing and the rules.' },
      ],
      explanation: 'Ind AS bind listed companies and those linked to them, and others as the rules lay down; any other company may adopt them.',
    },
  ],
});

const thbStandardsTwo = factsTemplate({
  id: 'thb-standards-two', version: 2, topicId: T, conceptId: 'thb-standards', difficulty: 'complex',
  facts: FOLLOWERS.filter((f) => f.set === 'icai').flatMap((small) =>
    FOLLOWERS.filter((f) => f.set === 'ind').map((big) => ({
      hints: WHICH_SET_HINTS,
      prompt: `Two clients of a chartered accountant: (i) ${small.who.charAt(0).toLowerCase()}${small.who.slice(1)}; (ii) ${big.who.charAt(0).toLowerCase()}${big.who.slice(1)}. Which standards does each follow?`,
      correct: '(i) the Accounting Standards issued by the ICAI; (ii) Ind AS',
      distractors: [
        { text: '(i) Ind AS; (ii) the Accounting Standards issued by the ICAI', why: 'Swapped the two: Ind AS are for companies such as (ii); the ICAI\'s standards for non-corporate entities such as (i).' },
        { text: 'Both follow Ind AS', why: 'Thought Ind AS bind every business; (i) is not a company.' },
        { text: '(i) the Accounting Standards issued by the ICAI; (ii) the Accounting Standards notified under the Companies Act', why: 'Missed that a listed company, or one linked to it, must follow Ind AS.' },
      ],
      explanation: `${small.why} ${big.why}`,
    })),
  ),
});

const standardsApplicability: Template[] = [thbStandardsWhichSet, thbStandardsRule, thbStandardsTwo];

// ---------------------------------------------------------------------------------------------------------------
// Added in the quality pass after the audit of Class 11, on a level of their own and outside the mock papers
// (generators/outsidePapers.ts): the benefits and limits of accounting standards, the AS-1 rule on disclosing the
// fundamental assumptions, what kind of account Input and Output GST are, and cash basis against accrual basis.
// ---------------------------------------------------------------------------------------------------------------

const STANDARDS_HINTS = [
  'Standards narrow the choices. Ask what that does for readers, and what it cannot do.',
  'Benefits: uniform treatment, comparable accounts, fuller disclosure, less room to dress up profit. Limits: alternatives still remain, standards cannot override the law, and they do not remove judgement or fraud.',
];

const thbStandardsBenefits = factsTemplate({
  id: 'thb-standards-benefits', topicId: T, conceptId: 'thb-standards', difficulty: 'medium',
  facts: [
    {
      prompt: 'Two cement companies value their stock under the same accounting standard. What does this chiefly give a reader of their accounts?',
      correct: 'Accounts that can be compared, because similar items are treated in the same way',
      distractors: [
        { text: 'A guarantee that both companies earn the same profit', why: 'Standards make the treatment alike; the profits still depend on how each business does.' },
        { text: 'Freedom from any need for an audit', why: 'Standards guide the accounts; they do not take the place of the auditor.' },
        { text: 'Accounts that need no notes at all', why: 'Standards often ask for more disclosure in notes, not less.' },
      ],
      explanation: 'A benefit of accounting standards: similar items are treated alike, so the accounts of different firms (and of one firm over the years) can be compared.',
      hints: STANDARDS_HINTS,
    },
    {
      prompt: 'Which of the following is a benefit of accounting standards?',
      correct: 'They cut down the confusing variety of treatments for the same kind of item',
      distractors: [
        { text: 'They let each firm choose the treatment that shows the highest profit', why: 'That is the very variety standards set out to reduce.' },
        { text: 'They take precedence over the Companies Act where the two differ', why: 'A standard cannot override the law; where the two differ, the law prevails.' },
        { text: 'They remove the need for the accountant to use any judgement', why: 'Estimates such as the life of an asset still call for judgement.' },
      ],
      explanation: 'By limiting the alternatives, standards bring uniformity and make the accounts more reliable and comparable.',
      hints: STANDARDS_HINTS,
    },
    {
      prompt: 'Which of the following is a limitation of accounting standards?',
      correct: 'They cannot override the law: where a statute requires a different treatment, the statute prevails',
      distractors: [
        { text: 'They make the accounts of different firms harder to compare', why: 'Comparability is what standards improve; this is not a limitation.' },
        { text: 'They forbid any disclosure beyond what the law asks for', why: 'Standards often ask for disclosure beyond the law; that is a benefit.' },
        { text: 'They apply only to sole proprietors', why: 'Standards apply to companies and to non-corporate entities alike.' },
      ],
      explanation: 'Standards are framed within the law of the land and cannot override it, which limits their scope.',
      hints: STANDARDS_HINTS,
    },
    {
      prompt: 'A standard allows stock to be valued by either of two cost formulas, and two firms choose differently. Which limitation of accounting standards does this show?',
      correct: 'Choosing between alternative treatments is still possible, so some differences between firms remain',
      distractors: [
        { text: 'Standards cannot override the law', why: 'True of standards, but nothing here concerns a statute.' },
        { text: 'Standards are issued by the government alone', why: 'In India they are formulated by the ICAI; and the case is about choice, not who issues them.' },
        { text: 'Standards make every firm\'s profit the same', why: 'Standards never equalise profit; and here they leave a choice open.' },
      ],
      explanation: 'Where a standard allows more than one method, firms may choose differently, so standards cannot remove every difference.',
      hints: STANDARDS_HINTS,
    },
    {
      prompt: 'A standard requires a firm to state in its notes the method it uses to value stock, though no law asks for it. This is an example of:',
      correct: 'a benefit of standards: disclosure beyond what the law requires',
      distractors: [
        { text: 'a limitation of standards: they cannot override the law', why: 'Nothing here goes against the law; the standard asks for more than the law, which is a benefit.' },
        { text: 'the materiality principle', why: 'Materiality decides whether an item is large enough to matter; this is about what a standard makes the firm disclose.' },
        { text: 'a breach of the consistency assumption', why: 'Stating the method does not change it; consistency is about keeping methods the same.' },
      ],
      explanation: 'Standards can call for disclosures the law does not, which tells readers more about the accounts.',
      hints: STANDARDS_HINTS,
    },
    {
      prompt: 'Even when every accounting standard is followed, accounts can still mislead if the figures are falsified. This shows that standards:',
      correct: 'guide the treatment of items but cannot by themselves prevent fraud or poor judgement',
      distractors: [
        { text: 'have no use for a business', why: 'They bring uniformity and comparability; the point is only that they are not a guard against fraud.' },
        { text: 'replace the need for internal checks', why: 'Standards say how to account; checks and audit are still needed to catch false figures.' },
        { text: 'apply only to listed companies', why: 'Standards apply to many kinds of entity; this is beside the point.' },
      ],
      explanation: 'Standards set out treatments; honest records, judgement and audit are still needed for accounts to be reliable.',
      hints: STANDARDS_HINTS,
    },
  ],
});

const AS1_HINTS = [
  'What does AS-1 say must be done about the three fundamental assumptions?',
  'If going concern, consistency and accrual are followed, nothing need be said. Only when one of them is not followed must the fact be disclosed.',
];

const thbAs1Disclosure = factsTemplate({
  id: 'thb-as1-disclosure', topicId: T, conceptId: 'thb-assumptions', difficulty: 'medium',
  facts: [
    {
      prompt: 'Kaveri Textiles follows going concern, consistency and accrual in preparing its accounts. Under AS-1, what must it say about these assumptions?',
      correct: 'Nothing: they are presumed to be followed unless the accounts say otherwise',
      distractors: [
        { text: 'It must state in a note that all three are followed', why: 'AS-1 calls for disclosure only when an assumption is not followed.' },
        { text: 'It must name them on the face of the balance sheet', why: 'No such statement is needed while all three are followed.' },
        { text: 'It must get each one approved by its auditor every year', why: 'There is no such approval; the rule is about disclosure when one is not followed.' },
      ],
      explanation: 'AS-1: if the fundamental accounting assumptions are followed, their acceptance is presumed and no disclosure is needed.',
      hints: AS1_HINTS,
    },
    {
      prompt: 'Lotus Garments has decided to close its business in two months, so its accounts are not prepared on the going concern basis. Under AS-1:',
      correct: 'the fact that going concern is not followed must be disclosed',
      distractors: [
        { text: 'nothing need be said, because the business still exists on 31 March', why: 'An assumption that is not followed must be disclosed; silence would mislead readers.' },
        { text: 'the firm must keep valuing its assets as if it would continue', why: 'A firm about to close shows its assets at what they will realise, and says so.' },
        { text: 'only the consistency assumption needs to be mentioned', why: 'It is going concern that is not followed here, so that is what must be disclosed.' },
      ],
      explanation: 'AS-1: when a fundamental accounting assumption is not followed, the fact must be disclosed.',
      hints: AS1_HINTS,
    },
    {
      prompt: 'Which statement about the fundamental accounting assumptions in AS-1 is correct?',
      correct: 'They need to be disclosed only if they are not followed',
      distractors: [
        { text: 'They must be disclosed in every set of accounts', why: 'AS-1 presumes them; disclosure is needed only when one is not followed.' },
        { text: 'They are prudence, matching and materiality', why: 'The three are going concern, consistency and accrual.' },
        { text: 'A firm may ignore them without saying so', why: 'A firm that does not follow one must disclose the fact.' },
      ],
      explanation: 'Going concern, consistency and accrual are presumed; only a departure from them is disclosed.',
      hints: AS1_HINTS,
    },
    {
      prompt: 'A small trader keeps the accounts on the cash basis, not the accrual basis. Under AS-1, what follows?',
      correct: 'The departure from the accrual assumption should be stated in the accounts',
      distractors: [
        { text: 'Nothing need be stated, since the trader is small', why: 'The rule turns on whether the assumption is followed, not on the size of the business.' },
        { text: 'The going concern assumption no longer applies', why: 'A cash basis says nothing about whether the business will continue.' },
        { text: 'The trader must switch to the accrual basis before the accounts can be prepared', why: 'AS-1 asks for disclosure of the departure; it does not say the accounts cannot be prepared.' },
      ],
      explanation: 'Accrual is a fundamental accounting assumption, so not following it is a fact to be disclosed.',
      hints: AS1_HINTS,
    },
    {
      prompt: 'Why does AS-1 ask for disclosure only when a fundamental assumption is not followed?',
      correct: 'Readers take the three assumptions for granted, so only a departure from them is news to them',
      distractors: [
        { text: 'Because the three assumptions are optional for every business', why: 'They are the basis on which accounts are normally prepared; that is why they are presumed.' },
        { text: 'Because disclosure is never useful to readers', why: 'Disclosure matters; it is only the expected that need not be repeated.' },
        { text: 'Because the auditor discloses them instead', why: 'The rule concerns the accounts themselves; there is no such transfer to the auditor.' },
      ],
      explanation: 'What is expected is presumed; a departure could mislead readers unless it is disclosed.',
      hints: AS1_HINTS,
    },
  ],
});

const GST_ACCOUNT_HINTS = [
  'Is the tax something the business will get back as credit, or something it owes to the government?',
  'Input GST (paid on purchases) is credit to be set off: an asset, debited. Output GST (collected on sales) is owed to the government: a liability, credited.',
];

const thbGstAccounts = factsTemplate({
  id: 'thb-gst-accounts', topicId: T, conceptId: 'thb-gst', difficulty: 'easy',
  facts: [
    {
      prompt: 'In the books of a registered dealer, Input CGST A/c is:',
      correct: 'an asset, debited with the CGST paid on purchases',
      distractors: [
        { text: 'a liability, credited with the CGST paid on purchases', why: 'Tax paid on purchases is credit the dealer will use, so it is an asset and is debited.' },
        { text: 'an expense, charged to the profit and loss account', why: 'Input tax that can be set off is not a cost to the dealer; it is a claim on the government.' },
        { text: 'an income of the dealer', why: 'Tax paid out is not an income.' },
      ],
      explanation: 'Input tax is a credit the dealer sets off against output tax, so it is an asset (a debit balance).',
      hints: GST_ACCOUNT_HINTS,
    },
    {
      prompt: 'In the books of a registered dealer, Output SGST A/c is:',
      correct: 'a liability, credited with the SGST charged on sales',
      distractors: [
        { text: 'an asset, debited with the SGST charged on sales', why: 'The tax collected is owed to the State, so it is a liability.' },
        { text: 'an income, credited to the profit and loss account', why: 'The dealer collects the tax for the government and does not keep it.' },
        { text: 'an expense of the dealer', why: 'The tax is paid by the buyer; for the dealer it is an amount owed.' },
      ],
      explanation: 'Output tax is collected from buyers and owed to the government until it is set off or paid: a liability.',
      hints: GST_ACCOUNT_HINTS,
    },
    {
      prompt: 'Which of the following normally has a debit balance?',
      correct: 'Input IGST A/c',
      distractors: [
        { text: 'Output IGST A/c', why: 'Output tax is owed to the government, so it has a credit balance.' },
        { text: 'Output CGST A/c', why: 'Output tax is a liability with a credit balance.' },
        { text: 'Output SGST A/c', why: 'Output tax is a liability with a credit balance.' },
      ],
      explanation: 'Input tax accounts are assets (credit to be used), so they have debit balances.',
      hints: GST_ACCOUNT_HINTS,
    },
    {
      prompt: 'When a dealer sells goods and charges GST within the state, which accounts are credited for the tax?',
      correct: 'Output CGST A/c and Output SGST A/c',
      distractors: [
        { text: 'Input CGST A/c and Input SGST A/c', why: 'Input accounts record tax paid on purchases, not tax charged on sales.' },
        { text: 'Output IGST A/c', why: 'IGST is charged on a sale to another state.' },
        { text: 'Sales A/c, with the tax added to the sale', why: 'The tax is not the dealer\'s revenue; it goes to its own Output accounts.' },
      ],
      explanation: 'Tax charged on sales within the state is credited to Output CGST and Output SGST, which are liabilities.',
      hints: GST_ACCOUNT_HINTS,
    },
    {
      prompt: 'At the end of a month, a dealer\'s Input CGST is more than its Output CGST. The balance left in Input CGST A/c is:',
      correct: 'credit carried forward to the next month, shown as an asset',
      distractors: [
        { text: 'a liability to the government', why: 'Unused input credit is the dealer\'s claim, not a debt.' },
        { text: 'used against Output SGST of the month', why: 'CGST credit can never be used against SGST.' },
        { text: 'written off as a loss at once', why: 'Unused credit is carried forward to be set off later.' },
      ],
      explanation: 'Unused input credit stays in the books as an asset and is set off in a later period.',
      hints: GST_ACCOUNT_HINTS,
    },
  ],
});

const CASH_ACCRUAL_HINTS = [
  'One basis waits for the money; the other looks at when the item is earned or incurred. Which is which?',
  'Cash basis: income when received, expenses when paid, so no outstanding, prepaid, accrued or advance items. Accrual basis: income when earned, expenses when incurred, which is what the matching of a period needs.',
];

const thbCashVsAccrual = factsTemplate({
  id: 'thb-cash-vs-accrual', topicId: T, conceptId: 'thb-bases', difficulty: 'medium',
  facts: [
    {
      prompt: 'Which statement correctly distinguishes the cash basis from the accrual basis?',
      correct: 'Cash basis records items when cash moves; accrual basis records them when they are earned or incurred',
      distractors: [
        { text: 'Cash basis records only cash sales; accrual basis records only credit sales', why: 'Both bases record every sale; they differ in when an item is recorded.' },
        { text: 'Cash basis uses double entry; accrual basis uses single entry', why: 'A basis is not a system of recording; either basis can be used with double entry.' },
        { text: 'Cash basis is required by AS-1; accrual basis is not', why: 'AS-1 names accrual as a fundamental assumption, not the cash basis.' },
      ],
      explanation: 'The two bases differ in timing: cash basis follows the movement of cash, accrual basis follows when income is earned and expenses are incurred.',
      hints: CASH_ACCRUAL_HINTS,
    },
    {
      prompt: 'Outstanding and prepaid expenses appear in the accounts:',
      correct: 'only on the accrual basis',
      distractors: [
        { text: 'only on the cash basis', why: 'The cash basis records only what was paid, so nothing is outstanding or prepaid in its accounts.' },
        { text: 'on both bases alike', why: 'The cash basis ignores amounts that have not moved as cash.' },
        { text: 'on neither basis', why: 'The accrual basis records them, to put each expense in its own period.' },
      ],
      explanation: 'Outstanding and prepaid items exist because the accrual basis separates the period of an expense from the date of its payment.',
      hints: CASH_ACCRUAL_HINTS,
    },
    {
      prompt: 'Which basis gives the truer profit of a year, and why?',
      correct: 'The accrual basis, because it sets the income of the year against the expenses of the same year',
      distractors: [
        { text: 'The cash basis, because cash cannot be manipulated', why: 'The cash basis can be shifted simply by paying or collecting early or late, and it ignores amounts due.' },
        { text: 'Both give the same profit in every year', why: 'They differ whenever there are amounts due, owing or paid in advance.' },
        { text: 'The cash basis, because it is the one AS-1 names', why: 'AS-1 names accrual among the fundamental assumptions.' },
      ],
      explanation: 'Matching the income and expenses of one period is possible only on the accrual basis.',
      hints: CASH_ACCRUAL_HINTS,
    },
    {
      prompt: 'Which is an advantage of the cash basis over the accrual basis?',
      correct: 'It is simple, since only cash received and paid is recorded',
      distractors: [
        { text: 'It shows the true profit of the period', why: 'It ignores income due and expenses owing, so its profit is less true.' },
        { text: 'It follows the matching concept closely', why: 'Matching needs the accrual basis.' },
        { text: 'It is the basis most companies are required to use', why: 'Companies keep their accounts on the accrual basis.' },
      ],
      explanation: 'The cash basis is simple and suits small professionals, but it does not match income with expenses.',
      hints: CASH_ACCRUAL_HINTS,
    },
    {
      prompt: 'Dr. Mehra, who runs a clinic, records fees only when patients pay. If the clinic switched to the accrual basis, fees earned in March but paid in April would be:',
      correct: 'income of March, with the unpaid amount shown as due at 31 March',
      distractors: [
        { text: 'income of April, when the cash comes in', why: 'That is how the cash basis treats them, not the accrual basis.' },
        { text: 'left out of the accounts of both months', why: 'Earned fees are income on the accrual basis even if unpaid.' },
        { text: 'income of March and of April both', why: 'Counting the fee twice would overstate the income.' },
      ],
      explanation: 'On the accrual basis income is recorded when earned; the amount not yet received is shown as accrued income.',
      hints: CASH_ACCRUAL_HINTS,
    },
    {
      prompt: 'A coaching centre receives fees in March for a course that runs in April and May. On the accrual basis, for the year ended 31 March, the fees are:',
      correct: 'a liability (income received in advance), not income of the year',
      distractors: [
        { text: 'income of the year, since the cash came in March', why: 'That is the cash-basis view; on the accrual basis the fees are not yet earned.' },
        { text: 'an asset of the centre', why: 'Money received for a service still to be given is owed back as service, a liability.' },
        { text: 'ignored until the course ends', why: 'The receipt is recorded at once, as income received in advance.' },
      ],
      explanation: 'On the accrual basis income is recognised when earned; fees for a course still to be taught are income received in advance.',
      hints: CASH_ACCRUAL_HINTS,
    },
  ],
});

/** The templates of the later level "More on Standards, GST Accounts and Bases". */
const moreTheory: Template[] = [thbStandardsBenefits, thbAs1Disclosure, thbGstAccounts, thbCashVsAccrual];

const templates: Template[] = [
  thbNamePrinciple,
  thbAssumptionOrPrinciple,
  thbWhichBasis,
  thbWhichSystem,
  thbGaapFacts,
  thbGstWhichTax,
  thbGstIntra,
  thbGstInter,
  thbGcSpread,
  thbStandardsFacts,
  thbGstFacts,
  thbRightTreatment,
  thbStockValuation,
  thbCashAccrualProfit,
  thbGstInvoiceDiscount,
  thbGstNetPayable,
  thbPremiumPeriod,
  thbRevenueAmount,
  thbTwoPrinciples,
  thbCashAccrualRoll,
  // Beyond the syllabus ("simple GST"): on no level and in no mock paper.
  beyondSyllabus(thbGstCrossSetOff, BEYOND_IGST_CROSS_SET_OFF),
  thbAssetCost,
  thbEntityProfit,
  // Added after the check against the CBSE 2025-26 syllabus.
  ...standardsApplicability,
  // Added in the quality pass after the audit: outside the mock papers (generators/outsidePapers.ts).
  ...moreTheory,
];

// Assertion and Reason comes last, and is on its own level and on no mock paper (see assertionReason.ts).
const assertionReason = assertionReasonTemplate({
  prefix: 'thb', topicId: 'theory-base', conceptId: 'thb-principles',
  items: [
    {
      answer: 'explains',
      a: 'A machine is shown in the balance sheet at cost less depreciation, and not at what it would fetch in a hurried sale.',
      r: 'The business is expected to continue for the foreseeable future.',
      aWhy: 'Fixed assets are carried at cost less depreciation in the accounts of a running business.',
      rWhy: 'This is the going concern assumption.',
      link: 'A business that will go on keeps using the machine and has no need to sell it, so R explains A.',
    },
    {
      answer: 'explains',
      a: 'Wages of ₹40,000 for March, paid on 5 April, are charged in the year ended 31 March.',
      r: 'Under the accrual assumption an expense is recorded when it is incurred, not when it is paid.',
      aWhy: 'The work was done in March, so the cost belongs to the year ended 31 March.',
      rWhy: 'That is what the accrual assumption says.',
      link: 'The date of payment does not matter because the wages were incurred in March, so R explains A.',
    },
    {
      answer: 'explains',
      a: 'A stapler costing ₹150 that will last for years is charged as an expense in the year it is bought.',
      r: 'An item too small to affect the decisions of readers need not be given strict treatment.',
      aWhy: 'Nobody would show so small an item as a fixed asset and depreciate it.',
      rWhy: 'This is the principle of materiality.',
      link: 'The stapler is treated in the simplest way because the amount does not matter to any reader, so R explains A.',
    },
    {
      answer: 'explains',
      a: 'A firm that changes its method of valuing stock states the change in its accounts.',
      r: 'A change of method affects the comparison of the results of different years.',
      aWhy: 'A method may be changed for a good reason, and the change must then be disclosed.',
      rWhy: 'Results can be compared only when they are worked on the same basis.',
      link: 'Readers are told of the change so that they can allow for it when they compare the years, so R explains A.',
    },
    {
      answer: 'explains',
      a: 'A trader in Mumbai who sells goods to a buyer in Jaipur and sends them there charges IGST.',
      r: 'IGST applies to a supply from one state to another.',
      aWhy: 'Maharashtra and Rajasthan are different states, so one tax is charged at the full rate.',
      rWhy: 'A supply between states bears IGST, and a supply within a state bears CGST and SGST.',
      link: 'The sale crosses from one state to another, which is why IGST is charged, so R explains A.',
    },
    {
      answer: 'not-the-reason',
      a: 'A firm prepares its accounts every year, though it expects to carry on for many years.',
      r: 'The business entity concept treats the firm as separate from its owner.',
      aWhy: 'Results are measured for a fixed period, usually a year.',
      rWhy: 'Only the affairs of the business go into its books, and not the private affairs of the owner.',
      link: 'Yearly accounts follow from the accounting period, since users need results at regular intervals. Business entity decides whose affairs are recorded, not how often.',
    },
    {
      answer: 'not-the-reason',
      a: 'On a supply within a state, CGST and SGST are each charged at half of the GST rate.',
      r: 'IGST is collected by the Centre.',
      aWhy: 'At a GST rate of 18%, CGST is 9% and SGST is 9%.',
      rWhy: 'IGST, charged on a supply between states, goes to the Centre.',
      link: 'R is about a supply between states and says nothing about how the tax on a supply within a state is divided.',
    },
    {
      answer: 'not-the-reason',
      a: 'Ind AS follow IFRS closely.',
      r: 'IFRS are issued by the International Accounting Standards Board.',
      aWhy: 'Ind AS are the Indian standards converged with IFRS.',
      rWhy: 'The IASB is the body that issues IFRS.',
      link: 'Ind AS follow IFRS so that Indian accounts can be compared and understood abroad, not because of who issues IFRS.',
    },
    {
      answer: 'a-only',
      a: 'An advance of ₹20,000 received from a customer on 25 March for goods to be delivered in April is not revenue of the year ending 31 March.',
      r: 'Revenue is recognised as soon as cash is received.',
      aWhy: 'The goods have not been delivered, so nothing has been earned by 31 March.',
      rWhy: 'Revenue is recognised when it is earned, generally on delivery, whatever the date of the cash.',
    },
    {
      answer: 'a-only',
      a: 'Full disclosure asks a firm to tell its readers about a large claim pending against it in court.',
      r: 'Materiality asks for every item, however small, to be shown separately.',
      aWhy: 'A large claim could affect the decisions of readers, so it is disclosed.',
      rWhy: 'Materiality says the opposite: only items large enough to matter need separate treatment.',
    },
    {
      answer: 'r-only',
      a: 'Under the consistency assumption, a firm can never change an accounting method.',
      r: 'A method may be changed if the law or a standard requires it, or if the new method gives a truer picture.',
      aWhy: 'Consistency asks for the same methods year after year, but a change for a good reason is allowed if it is disclosed.',
      rWhy: 'These are the good reasons for which a method may be changed.',
    },
    {
      answer: 'r-only',
      a: 'Prudence, matching and materiality are the three fundamental accounting assumptions.',
      r: 'AS-1 names going concern, consistency and accrual as the fundamental accounting assumptions.',
      aWhy: 'Those three are principles, and none of them is a fundamental assumption.',
      rWhy: 'These are the three that AS-1 names.',
    },
  ],
});

const withAssertionReason: Template[] = [...templates, assertionReason];

export default withAssertionReason;
