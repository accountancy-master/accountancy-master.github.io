import type { AccountQuestion, JournalSetQuestion, StatementQuestion } from '@/content/types';
import { debtor } from '@/engine/accounts';
import { BALANCE_BD, BALANCE_CD, accountOf, type DatedEntry } from '@/engine/books';
import type { JournalLine } from '@/engine/journal';
import type { Rng } from '@/engine/rng';
import { PARTIES, accountTemplate, factsTemplate, formatINR, journalSetTemplate, journalTemplate, ledgerPeriods, ledgerSides, mcqTemplate, numericTemplate, statementTemplate } from '../authoring';
import type { AccountTemplate, Distractor, JournalSetTemplate, SetTransaction, StatementParts, Template } from '../types';

type StatementRows = StatementParts['rows'];
import { assertionReasonTemplate } from '../assertionReason';

const T = 'provisions-and-reserves';

// ---------------------------------------------------------------------------------------------------------------
// Small helpers. Inside a generator every amount is a whole number of rupees; `rs` turns it into paise for the answer.
// ---------------------------------------------------------------------------------------------------------------

const rs = (n: number): number => n * 100;
const inr = (n: number): string => formatINR(rs(n));
/** `rate` percent of a rupee amount; may be fractional, so callers test it with `Number.isInteger`. */
const pc = (n: number, rate: number): number => (n * rate) / 100;
/** Rupee amounts in a prompt, in the order they appear (formatINR writes whole rupees without paise). */
const amts = (s: string): number[] => (s.match(/₹\d[\d,]*/g) ?? []).map((m) => Number.parseInt(m.slice(1).replace(/,/g, ''), 10));
/** Percentages in a prompt, in the order they appear. */
const pcts = (s: string): number[] => (s.match(/\d+(?:\.\d+)?(?=%)/g) ?? []).map(Number);
/** The first whole number after a phrase, for example `after 4 years`. */
const after = (s: string, re: RegExp): number => Number.parseInt(re.exec(s)?.[1] ?? '', 10);

const FIRMS = [
  'Sunita Textiles',
  'Ravi Hardware',
  'Kavita Stationers',
  'Gopal Electricals',
  'Meena Garments',
  'Harish Traders',
  'Naveen Sports Goods',
  'Bhavna General Store',
];
const ASSETS = ['machinery', 'furniture', 'a delivery van', 'office equipment'];
const RATES = [2, 3, 4, 5, 6, 8, 10];

// Hint pairs shared by a family of templates that ask the same thing: a first nudge, then the step named. A template
// that took one of these in place of the two default hints is at version 2 (hints are part of what a seed makes).
const H_PDD_BASE = [
  'Which debtors can still turn bad: the whole figure, or only those left once the bad debts are written off?',
  'Provision = Rate % x (Debtors - Further bad debts). Turn it round to find the debtors (Provision x 100 / Rate) or the rate (Provision / Debtors left x 100).',
];
const H_PDD_CHARGE = [
  'List what this year must bear: the bad debts in the trial balance, the further bad debts and the new provision. What was provided in an earlier year?',
  'Charge = Bad debts + Further bad debts + New provision - Old provision, with the new provision worked on the debtors left after the further bad debts.',
];
const H_PDD_WRITEBACK = [
  'Does the old provision hold more than this year needs for the bad debts and the new provision together?',
  'Written back = Old provision - (Bad debts + New provision); with no bad debts it is Old provision - New provision. Only a surplus is credited to profit.',
];
const H_PDD_DISCOUNT = [
  'Work in the order the debtors shrink: bad debts first, then doubtful debts, then the discount.',
  'Provision for discount = Rate % x (Debtors - Bad debts - Provision for doubtful debts): only debtors expected to pay can take a discount.',
];
const H_CAPITAL_PROFIT = [
  'Which gain comes from trading, and which from selling or revaluing a fixed asset?',
  'Capital profit = Sale (or revalued) amount - Book value. The trading profit belongs to the revenue reserves, not to the Capital Reserve.',
];
const H_CHARGE_THEN_APPROPRIATE = [
  'Which item is deducted to find the net profit, and which is taken out of the net profit afterwards?',
  'Net profit = Profit - Provision (a charge). Then transfer the reserve rate on that net profit (an appropriation); the rest goes to capital.',
];
const H_DEPR_PROVISION = [
  'Straight line on cost: the same amount every year for each asset. How many years of it stand in the provision?',
  'Provision for an asset = Cost x Rate % x Years. On a sale only that asset\'s share leaves the Provision for Depreciation A/c; the other asset\'s share stays.',
];
const H_DEPR_ENTRY = [
  'Depreciation is an expense of the year. Is the asset itself reduced, or is the amount gathered in another account?',
  'Depreciation A/c is debited; Provision for Depreciation A/c is credited, and the asset account stays at cost.',
];

/** Keeps the errors that are real values: positive, whole, and not the answer. The harness drops repeats itself. */
const errs = (answer: number, list: { value: number; why: string }[]) =>
  list
    .map((e) => ({ ...e, value: Math.round(e.value) }))
    .filter((e) => e.value > 0 && e.value !== answer);

// ---------------------------------------------------------------------------------------------------------------
// Item banks shared by the classification generators.
// ---------------------------------------------------------------------------------------------------------------

interface PrItem {
  key: string; // a phrase that identifies the item in a prompt (used by verify)
  text: (who: string, x: string) => string;
  kind: 'provision' | 'reserve';
  note: string;
}

const PR_ITEMS: PrItem[] = [
  {
    key: 'may not pay',
    kind: 'provision',
    text: (w, x) => `${w} feels that some of its debtors may not pay, so it charges ${x} against the year's profit to cover the likely loss.`,
    note: 'A likely loss is met by an amount charged against profit before profit is found: a provision (for doubtful debts).',
  },
  {
    key: 'wear and tear',
    kind: 'provision',
    text: (w, x) => `${w} charges ${x} against the year's profit for the wear and tear of its machinery and credits Provision for Depreciation A/c.`,
    note: 'Depreciation is charged against profit to cover the fall in the machinery\'s value: a provision (for depreciation).',
  },
  {
    key: 'pay promptly',
    kind: 'provision',
    text: (w, x) => `${w} debits ${x} to its Profit and Loss Account for the discount it expects to allow to debtors who pay promptly.`,
    note: 'The discount is an expected loss, charged against profit before profit is found: a provision (for discount on debtors).',
  },
  {
    key: 'repairs and renewals',
    kind: 'provision',
    text: (w, x) => `${w} charges ${x} to its Profit and Loss Account each year to meet the heavy repairs and renewals its building will need in later years.`,
    note: 'A future cost that is certain to arise is spread over the years by charging profit: a provision (for repairs and renewals).',
  },
  {
    key: 'in financial difficulty',
    kind: 'provision',
    text: (w, x) => `A large customer of ${w} is in financial difficulty and may pay only a part of the amount due. ${w} charges ${x} against the year's profit for the loss it expects.`,
    note: 'The loss is likely but its exact amount is not yet known, so an estimate is charged against profit: a provision (for doubtful debts).',
  },
  {
    key: 'strengthen its finances',
    kind: 'reserve',
    text: (w, x) => `${w} transfers ${x} out of the year's net profit to General Reserve to strengthen its finances.`,
    note: 'Profit already found is set aside for the future with no particular loss in mind: a reserve (an appropriation of profit).',
  },
  {
    key: 'compensation claims of workers',
    kind: 'reserve',
    text: (w, x) => `${w} sets aside ${x} out of its profit for future compensation claims of workers, although no claim has yet arisen.`,
    note: 'No liability exists yet and the amount comes out of profit already found: a reserve (a specific reserve).',
  },
  {
    key: 'market value of its investments',
    kind: 'reserve',
    text: (w, x) => `${w} keeps ${x} of its profit aside to meet any fall in the market value of its investments in future.`,
    note: 'The money is kept back out of profit for a possible future fall in value: a reserve (a specific reserve).',
  },
  {
    key: 'future expansion',
    kind: 'reserve',
    text: (w, x) => `${w} transfers ${x} out of the year's profit to a reserve for the future expansion of the business.`,
    note: 'A transfer out of profit for the future growth of the business is a reserve.',
  },
  {
    key: 'years of low profit',
    kind: 'reserve',
    text: (w, x) => `The owner of ${w} keeps ${x} of this year's net profit in the business so that drawings need not be cut in years of low profit.`,
    note: 'Profit already found is kept back to even out later years: a reserve (a specific reserve).',
  },
];

// Version 2: the customer in financial difficulty "may pay only a part of the amount due", not of what "he" owes (the
// house rule: no gendered pronouns).
const prOrRes = mcqTemplate({
  id: 'pr-provision-or-reserve',
  version: 2,
  topicId: T,
  conceptId: 'pr-difference',
  difficulty: 'easy',
  generate: (rng) => {
    const item = rng.pick(PR_ITEMS);
    const x = inr(rng.step(5000, 90000, 1000));
    const prompt = `${item.text(rng.pick(FIRMS), x)} How is the amount classified?`;
    const distractors: Distractor[] =
      item.kind === 'provision'
        ? [
            { text: 'A reserve', why: 'Took any amount "set aside" for a reserve; but this is charged against profit for a likely loss or liability, which makes it a provision.' },
            { text: 'A secret reserve', why: 'Confused an amount shown openly as a charge with a reserve hidden in the books.' },
            { text: 'An outstanding expense', why: 'Treated an estimate for a likely loss as an expense already incurred and only left unpaid.' },
            { text: 'A capital reserve', why: 'Thought any amount set aside is a capital reserve; capital reserves come from capital profits.' },
          ]
        : [
            { text: 'A provision', why: 'Took any amount set aside as a provision; but nothing is owed or lost yet and the amount comes out of profit already found.' },
            { text: 'A liability to outsiders', why: 'Treated the reserve as an amount owed to someone else; a reserve belongs to the owner.' },
            { text: 'An expense of the year', why: 'Treated the transfer as an expense; an appropriation is made after net profit is found.' },
            { text: 'A secret reserve', why: 'Called an openly shown transfer a secret reserve.' },
          ];
    return {
      prompt,
      correct: item.kind === 'provision' ? 'A provision' : 'A reserve',
      distractors,
      explanation: item.note,
      hints: [
        'Is the amount charged against profit to meet a likely loss or liability, or is it set aside out of profit already found?',
        'A provision is a charge against profit; a reserve is an appropriation of profit.',
      ],
    };
  },
  verify: (q) => {
    const item = PR_ITEMS.find((i) => q.prompt.includes(i.key));
    const right = q.options.find((o) => o.id === q.correct)?.text;
    return item !== undefined && right === (item.kind === 'provision' ? 'A provision' : 'A reserve');
  },
});

// ---------------------------------------------------------------------------------------------------------------
// Charge against profit or appropriation of profit.
// ---------------------------------------------------------------------------------------------------------------

const CHARGES = [
  'provision for doubtful debts',
  'depreciation on machinery',
  'bad debts written off',
  'provision for discount on debtors',
  'provision for repairs and renewals',
];
const APPROPRIATIONS = [
  'transfer to General Reserve',
  'transfer to Workmen Compensation Reserve',
  'transfer to Investment Fluctuation Reserve',
  'transfer to a reserve for replacing machinery',
  'transfer to a reserve for expansion',
];

const CHARGE_TEXT = 'A charge against profit: debited to the Profit and Loss Account before the net profit is found';
const APPROP_TEXT = 'An appropriation of profit: set aside out of the net profit after it has been found';

const chargeOrApp = mcqTemplate({
  id: 'pr-charge-or-appropriation',
  topicId: T,
  conceptId: 'pr-difference',
  difficulty: 'easy',
  generate: (rng) => {
    const isCharge = rng.next() < 0.5;
    const item = rng.pick(isCharge ? CHARGES : APPROPRIATIONS);
    const x = inr(rng.step(5000, 90000, 1000));
    return {
      prompt: `At the year end ${rng.pick(FIRMS)} records the following: ${item}, ${x}. How is it treated in the accounts?`,
      correct: isCharge ? CHARGE_TEXT : APPROP_TEXT,
      distractors: [
        isCharge
          ? { text: APPROP_TEXT, why: 'Treated a charge as a share of profit; it is deducted to find the profit and is made even when profit is small.' }
          : { text: CHARGE_TEXT, why: 'Treated a transfer to a reserve as an expense; a reserve is made out of profit already found.' },
        { text: "Debited directly to the owner's Capital A/c", why: 'Took setting an amount aside as a withdrawal by the owner; the amount stays in the business.' },
        { text: 'Charged to the Trading Account against the gross profit', why: 'Mixed up the Trading Account, which holds the direct costs of goods, with the Profit and Loss Account.' },
        { text: 'Not recorded at all until the money is spent', why: 'Waited for an actual payment; this is a book entry made at the year end, whether or not any money is spent.' },
      ],
      explanation: isCharge
        ? `${item[0].toUpperCase()}${item.slice(1)} is an expense or a loss of the year. It is debited to the Profit and Loss Account, so it reduces net profit.`
        : `A ${item} is made out of the net profit after it has been found. It is an appropriation: it does not reduce the net profit shown by the Profit and Loss Account.`,
      hints: ['Does it reduce the profit of the year, or is it a way of using the profit already earned?', 'Provisions, depreciation and bad debts are charges; transfers to reserves are appropriations.'],
    };
  },
  verify: (q) => {
    const right = q.options.find((o) => o.id === q.correct)?.text;
    const isCharge = CHARGES.some((c) => q.prompt.includes(c));
    const isApp = APPROPRIATIONS.some((a) => q.prompt.includes(a));
    return isCharge !== isApp && right === (isCharge ? CHARGE_TEXT : APPROP_TEXT);
  },
});

// ---------------------------------------------------------------------------------------------------------------
// Revenue reserve or capital reserve.
// ---------------------------------------------------------------------------------------------------------------

interface ReserveItem {
  key: string;
  kind: 'capital' | 'revenue';
  text: (w: string, base: string, gain: string, total: string) => string;
  note: string;
}

const RESERVE_ITEMS: ReserveItem[] = [
  {
    key: 'sold land',
    kind: 'capital',
    text: (w, base, gain, total) => `${w} sold land that had cost ${base} for ${total} and keeps the profit of ${gain} as a reserve.`,
    note: 'The profit comes from selling a fixed asset, not from trading, so it is a capital profit and the reserve is a capital reserve.',
  },
  {
    key: 'revalued',
    kind: 'capital',
    text: (w, base, gain, total) => `A building of ${w} stood in its books at ${base}. It was revalued at ${total} and the surplus of ${gain} was credited to a reserve.`,
    note: 'A surplus on revaluing a fixed asset is a capital profit, so the reserve is a capital reserve.',
  },
  {
    key: 'long-term investments',
    kind: 'capital',
    text: (w, base, gain, total) => `${w} sold some long-term investments that had cost ${base} for ${total} and keeps the profit of ${gain} as a reserve.`,
    note: 'Profit on selling a long-term investment is a capital profit, so the reserve made from it is a capital reserve.',
  },
  {
    key: 'earned a good trading profit',
    kind: 'revenue',
    text: (w, _b, gain) => `${w} earned a good trading profit this year and transferred ${gain} of it to General Reserve.`,
    note: 'The amount comes out of the profit of normal trading, so it is a revenue reserve.',
  },
  {
    key: 'compensation claims of workers',
    kind: 'revenue',
    text: (w, _b, gain) => `${w} sets aside ${gain} out of its trading profit to meet possible compensation claims of workers.`,
    note: 'It is made from trading profit, so it is a revenue reserve. It is also a specific reserve, because its purpose is named.',
  },
  {
    key: 'day-to-day trading',
    kind: 'revenue',
    text: (w, _b, gain) => `${w} transfers ${gain} from the profit of its day-to-day trading to an Investment Fluctuation Reserve.`,
    note: 'The source is trading profit, so it is a revenue reserve (and a specific one).',
  },
  {
    key: 'selling goods',
    kind: 'revenue',
    text: (w, _b, gain) => `${w} keeps back ${gain} of the profit earned from selling goods to meet any future losses.`,
    note: 'Profit from selling goods is a revenue profit, so a reserve made from it is a revenue reserve.',
  },
];

// Version 2: the "why" of the capital-reserve option no longer says capital reserves come *only* from selling or
// revaluing assets (capital profits also include, for companies, premium on securities, profit on reissue of
// forfeited shares and profit prior to incorporation).
const revOrCap = mcqTemplate({
  id: 'pr-revenue-or-capital',
  version: 2,
  topicId: T,
  conceptId: 'pr-revenue-capital',
  difficulty: 'easy',
  generate: (rng) => {
    const item = rng.pick(RESERVE_ITEMS);
    const base = rng.step(100000, 600000, 50000);
    const gain = rng.step(10000, 90000, 5000);
    const prompt = `${item.text(rng.pick(FIRMS), inr(base), inr(gain), inr(base + gain))} What kind of reserve is this?`;
    const distractors: Distractor[] =
      item.kind === 'capital'
        ? [
            { text: 'A revenue reserve', why: 'Treated the profit on selling or revaluing an asset as an ordinary trading profit.' },
            { text: 'A provision', why: 'Took the amount kept aside as a charge against profit; but nothing is charged and the profit is already earned.' },
            { text: 'A secret reserve', why: 'Thought a reserve shown openly in the books is a hidden one.' },
          ]
        : [
            { text: 'A capital reserve', why: 'Took any large reserve as a capital reserve; a capital reserve is made from capital profits (such as a gain on selling or revaluing a fixed asset), never from trading profit.' },
            { text: 'A provision', why: 'Took the amount kept aside as a charge against profit; it is an appropriation of profit.' },
            { text: 'A secret reserve', why: 'Thought a reserve shown openly in the books is a hidden one.' },
          ];
    return {
      prompt,
      correct: item.kind === 'capital' ? 'A capital reserve' : 'A revenue reserve',
      distractors,
      explanation: item.note,
      hints: ['Where did the profit come from: normal trading, or the sale or revaluation of a fixed asset?', 'Trading profit makes revenue reserves; capital profit makes a capital reserve.'],
    };
  },
  verify: (q) => {
    const item = RESERVE_ITEMS.find((i) => q.prompt.includes(i.key));
    const right = q.options.find((o) => o.id === q.correct)?.text;
    return item !== undefined && right === (item.kind === 'capital' ? 'A capital reserve' : 'A revenue reserve');
  },
});

// ---------------------------------------------------------------------------------------------------------------
// General reserve or specific reserve.
// ---------------------------------------------------------------------------------------------------------------

interface GsItem {
  key: string;
  kind: 'general' | 'specific';
  text: (w: string, x: string) => string;
  note: string;
}

const GS_ITEMS: GsItem[] = [
  {
    key: 'no particular purpose',
    kind: 'general',
    text: (w, x) => `${w} transfers ${x} from profit to a reserve that is kept for no particular purpose, only to strengthen the business.`,
    note: 'A reserve with no stated purpose is a general reserve.',
  },
  {
    key: 'any need of the business',
    kind: 'general',
    text: (w, x) => `${w} transfers ${x} from profit to a reserve that can be used for any need of the business that may arise.`,
    note: 'It can be used for any purpose, so it is a general reserve.',
  },
  {
    key: 'compensation to workers',
    kind: 'specific',
    text: (w, x) => `${w} transfers ${x} from profit to a reserve meant only for paying compensation to workers for accidents.`,
    note: 'It is meant for a named purpose, so it is a specific reserve (a Workmen Compensation Reserve).',
  },
  {
    key: 'fall in the market price',
    kind: 'specific',
    text: (w, x) => `${w} transfers ${x} from profit to a reserve meant only to cover a fall in the market price of its investments.`,
    note: 'It is meant for a named purpose, so it is a specific reserve (an Investment Fluctuation Reserve).',
  },
  {
    key: 'replace its delivery van',
    kind: 'specific',
    text: (w, x) => `${w} transfers ${x} from profit to a reserve meant only to replace its delivery van when it wears out.`,
    note: 'It is meant for a named purpose, so it is a specific reserve.',
  },
  {
    key: 'open a new branch',
    kind: 'specific',
    text: (w, x) => `${w} transfers ${x} from profit to a reserve meant only to open a new branch in two years' time.`,
    note: 'It is meant for a named purpose, so it is a specific reserve (a reserve for expansion).',
  },
];

const genOrSpec = mcqTemplate({
  id: 'pr-general-or-specific',
  topicId: T,
  conceptId: 'pr-general-specific',
  difficulty: 'medium',
  generate: (rng) => {
    const item = rng.pick(GS_ITEMS);
    const x = inr(rng.step(10000, 90000, 5000));
    const general = item.kind === 'general';
    return {
      prompt: `${item.text(rng.pick(FIRMS), x)} What type of reserve is this?`,
      correct: general ? 'A general reserve' : 'A specific reserve',
      distractors: [
        general
          ? { text: 'A specific reserve', why: 'Took a reserve with no stated purpose as one made for a particular purpose.' }
          : { text: 'A general reserve', why: 'Overlooked that the reserve is meant for a stated purpose; a general reserve has none.' },
        { text: 'A capital reserve', why: 'Called it a capital reserve, but it is made out of trading profit, not out of a capital profit.' },
        { text: 'A provision', why: 'Took a transfer out of profit as a charge against profit; a provision is charged before profit is found.' },
        { text: 'A secret reserve', why: 'Thought a reserve shown openly in the books is a hidden one.' },
      ],
      explanation: item.note,
      hints: ['Does the description name a purpose for which the reserve may be used?', 'A general reserve has no particular purpose; a specific reserve is kept for one.'],
    };
  },
  verify: (q) => {
    const item = GS_ITEMS.find((i) => q.prompt.includes(i.key));
    const right = q.options.find((o) => o.id === q.correct)?.text;
    return item !== undefined && right === (item.kind === 'general' ? 'A general reserve' : 'A specific reserve');
  },
});

// ---------------------------------------------------------------------------------------------------------------
// Which reserve for which purpose.
// ---------------------------------------------------------------------------------------------------------------

const NAMED = [
  { name: 'General Reserve', purpose: 'to strengthen the financial position of the business, with no particular purpose', short: 'strengthen the business in general' },
  { name: 'Workmen Compensation Reserve', purpose: 'to meet compensation that may be payable to workers for accidents', short: 'meet workers\' compensation claims' },
  { name: 'Investment Fluctuation Reserve', purpose: 'to cover a fall in the market value of investments', short: 'cover a fall in the value of investments' },
  { name: 'Reserve for Expansion', purpose: 'to pay for the expansion of the business in later years', short: 'pay for the expansion of the business' },
];

const namedReserve = mcqTemplate({
  id: 'pr-named-reserve',
  topicId: T,
  conceptId: 'pr-general-specific',
  difficulty: 'medium',
  generate: (rng) => {
    const right = rng.pick(NAMED);
    const others = NAMED.filter((n) => n !== right);
    if (rng.next() < 0.5) {
      const x = inr(rng.step(10000, 90000, 5000));
      return {
        prompt: `${rng.pick(FIRMS)} sets aside ${x} out of profit ${right.purpose}. Which reserve is it creating?`,
        correct: right.name,
        distractors: others.map((o) => ({ text: o.name, why: `Chose the reserve meant to ${o.short}, not the one described.` })),
        explanation: `A reserve for the purpose "${right.purpose}" is the ${right.name}.`,
      };
    }
    return {
      prompt: `What is the ${right.name} created for?`,
      correct: `To ${right.short}`,
      distractors: others.map((o) => ({ text: `To ${o.short}`, why: `That is the purpose of the ${o.name}.` })),
      explanation: `The ${right.name} is created ${right.purpose}.`,
    };
  },
  verify: (q) => {
    const right = q.options.find((o) => o.id === q.correct)?.text ?? '';
    const hit = NAMED.find((n) => right === n.name || right === `To ${n.short}`);
    return hit !== undefined && (q.prompt.includes(hit.purpose) || q.prompt.includes(hit.name));
  },
});

// ---------------------------------------------------------------------------------------------------------------
// Features: provision, reserve, both or neither.
// ---------------------------------------------------------------------------------------------------------------

const BELONGS = ['A provision only', 'A reserve only', 'Both a provision and a reserve', 'Neither of them'] as const;
type Belongs = 0 | 1 | 2 | 3;

const FEATURES: { text: string; belongs: Belongs; note: string }[] = [
  { text: 'It is charged against profit before the net profit is found', belongs: 0, note: 'A provision is a charge; a reserve is made after profit is found.' },
  { text: 'It is made for a known liability or an expected loss whose exact amount is not certain', belongs: 0, note: 'That is the purpose of a provision.' },
  { text: 'It has to be made even in a year when the business earns no profit', belongs: 0, note: 'A provision is compulsory because it covers a likely loss; a reserve needs profit.' },
  { text: 'It is shown as a deduction from the asset it relates to, such as debtors', belongs: 0, note: 'Provisions for doubtful debts and for depreciation are deducted from the asset.' },
  { text: 'It can be made only when the business has earned a profit', belongs: 1, note: 'A reserve is an appropriation of profit, so there must be profit to appropriate.' },
  { text: 'It is made to strengthen the financial position and not for a known loss', belongs: 1, note: 'That is the purpose of a reserve.' },
  { text: 'It is made at the discretion of the owner', belongs: 1, note: 'A reserve is a free choice; a provision is required by prudence.' },
  { text: 'It is shown on the liabilities side along with the owner\'s capital', belongs: 1, note: 'A reserve belongs to the owner, so it is shown with capital.' },
  { text: 'It is made out of the net profit after it has been found', belongs: 1, note: 'A reserve is an appropriation of profit.' },
  { text: 'It appears in the balance sheet', belongs: 2, note: 'Both are shown in the balance sheet: a provision as a deduction or a liability, a reserve with capital.' },
  { text: 'It is only a book entry and not a separate sum of cash kept aside', belongs: 2, note: 'Neither provision nor reserve is a pile of cash; both are balances in the books.' },
  { text: 'It is a sum of cash paid to an outsider when it is created', belongs: 3, note: 'Neither is a payment: both are entries made in the books.' },
  { text: 'It is an expense that was incurred and paid during the year', belongs: 3, note: 'Neither is a payment made in the year; a provision is an estimate and a reserve is an appropriation.' },
];

const featureBelongs = mcqTemplate({
  id: 'pr-feature-belongs',
  topicId: T,
  conceptId: 'pr-difference',
  difficulty: 'easy',
  generate: (rng) => {
    const f = rng.pick(FEATURES);
    const names = ['a provision', 'a reserve'];
    const whyNot = (i: number): string => {
      if (f.belongs <= 1) {
        if (i === 3) return `Thought it describes neither; it describes ${names[f.belongs]}.`;
        if (i === 2) return `Took it as common to both; ${names[1 - f.belongs]} does not work this way.`;
        return `Gave it to ${names[i]}; it describes ${names[f.belongs]}.`;
      }
      if (f.belongs === 2) {
        if (i === 3) return 'Thought it describes neither; both of them do.';
        return `Gave it to ${names[i]} only; the other one has it too.`;
      }
      if (i === 2) return 'Took it as common to both; neither of them works this way.';
      return `Gave it to ${names[i]}, but ${names[i]} is an entry in the books and not a payment.`;
    };
    return {
      prompt: `Which of these has the following feature? "${f.text}."`,
      correct: BELONGS[f.belongs],
      distractors: BELONGS.map((text, i) => ({ text, why: whyNot(i), i }))
        .filter(({ i }) => i !== f.belongs)
        .map(({ text, why }) => ({ text, why })),
      explanation: f.note,
    };
  },
  verify: (q) => {
    const f = FEATURES.find((x) => q.prompt.includes(x.text));
    const right = q.options.find((o) => o.id === q.correct)?.text;
    return f !== undefined && right === BELONGS[f.belongs];
  },
});

// ---------------------------------------------------------------------------------------------------------------
// Which statement is correct about a provision / a reserve?
// ---------------------------------------------------------------------------------------------------------------

const DIMENSIONS = [
  { dim: 'its purpose', p: 'It is made to meet a known liability or an expected loss', r: 'It is made to strengthen the financial position of the business' },
  { dim: 'its effect on profit', p: 'It is a charge, so it reduces the profit of the year', r: 'It is an appropriation, so it is made out of profit already found' },
  { dim: 'whether it must be made', p: 'It must be made whether or not the business earns a profit', r: 'It is made only when there is a profit, and it is the owner\'s choice' },
  { dim: 'how it is shown in the balance sheet', p: 'It is deducted from the asset it relates to, or shown as a liability', r: 'It is shown on the liabilities side along with the owner\'s capital' },
  { dim: 'whether it can be paid out as profit', p: 'It is not profit, so it cannot be paid out to the owner as profit', r: 'It is profit kept in the business, so it can be paid out as profit later' },
];

const whichStatement = mcqTemplate({
  id: 'pr-which-statement',
  topicId: T,
  conceptId: 'pr-difference',
  difficulty: 'easy',
  generate: (rng) => {
    const d = rng.pick(DIMENSIONS);
    const isProv = rng.next() < 0.5;
    const mine = isProv ? 'p' : 'r';
    const other = isProv ? 'r' : 'p';
    const term = isProv ? 'provision' : 'reserve';
    const otherTerm = isProv ? 'reserve' : 'provision';
    const elsewhere = rng.shuffle(DIMENSIONS.filter((x) => x !== d)).slice(0, 2);
    return {
      prompt: `Which statement about ${d.dim} is correct for a ${term}?`,
      correct: d[mine],
      distractors: [
        { text: d[other], why: `Swapped the two terms: this is how a ${otherTerm} works.` },
        ...elsewhere.map((e) => ({ text: e[other], why: `Gave the feature of a ${otherTerm}, and about a different point.` })),
      ],
      explanation: `For a ${term}: ${d[mine].toLowerCase()}. For a ${otherTerm}: ${d[other].toLowerCase()}.`,
    };
  },
  verify: (q) => {
    const right = q.options.find((o) => o.id === q.correct)?.text;
    const term = q.prompt.includes('for a provision') ? 'p' : 'r';
    const d = DIMENSIONS.find((x) => q.prompt.includes(x.dim));
    return d !== undefined && right === d[term];
  },
});

// ---------------------------------------------------------------------------------------------------------------
// Does it reduce net profit?
// ---------------------------------------------------------------------------------------------------------------

const REDUCES: [string, string][] = [
  ['A provision for doubtful debts', 'It is a charge, debited to the Profit and Loss Account.'],
  ['Depreciation on machinery', 'It is a charge, debited to the Profit and Loss Account.'],
  ['Bad debts written off', 'It is a loss of the year, debited to the Profit and Loss Account.'],
  ['A provision for discount on debtors', 'It is a charge, debited to the Profit and Loss Account.'],
];
const NOT_REDUCES: [string, string][] = [
  ['A transfer to General Reserve', 'It is an appropriation of profit already found.'],
  ['A transfer to Workmen Compensation Reserve', 'It is an appropriation of profit already found.'],
  ['A transfer to Investment Fluctuation Reserve', 'It is an appropriation of profit already found.'],
  ['A transfer to a reserve for expansion', 'It is an appropriation of profit already found.'],
];

const whichReduces = mcqTemplate({
  id: 'pr-which-reduces-profit',
  topicId: T,
  conceptId: 'pr-difference',
  difficulty: 'easy',
  generate: (rng) => {
    const wantsReducer = rng.next() < 0.5;
    const rightPool = wantsReducer ? REDUCES : NOT_REDUCES;
    const wrongPool = wantsReducer ? NOT_REDUCES : REDUCES;
    const right = rng.pick(rightPool);
    const wrong = rng.shuffle(wrongPool).slice(0, 3);
    return {
      prompt: wantsReducer
        ? 'Which one of these reduces the net profit shown by the Profit and Loss Account for the year?'
        : 'Which one of these does NOT reduce the net profit shown by the Profit and Loss Account for the year?',
      correct: right[0],
      distractors: wrong.map(([text]) => ({
        text,
        why: wantsReducer
          ? 'Took a transfer to a reserve as a charge; it is made after net profit is found and does not reduce it.'
          : 'Took a charge as an appropriation; it is debited to find the net profit and so reduces it.',
      })),
      explanation: `${right[0]}: ${right[1]} ${wantsReducer ? 'So it reduces net profit.' : 'So net profit is the same with or without it.'}`,
    };
  },
  verify: (q) => {
    const right = q.options.find((o) => o.id === q.correct)?.text ?? '';
    const wantsReducer = !q.prompt.includes('does NOT');
    return REDUCES.some(([t]) => t === right) === wantsReducer && NOT_REDUCES.some(([t]) => t === right) === !wantsReducer;
  },
});

// ---------------------------------------------------------------------------------------------------------------
// Secret reserves.
// ---------------------------------------------------------------------------------------------------------------

const UNDERSTATE = 'Profit is understated and a secret reserve is created';
const OVERSTATE_RES = 'Profit is overstated and a secret reserve is created';
const OVERSTATE = 'Profit is overstated, assets are shown too high and no secret reserve is created';
const NO_EFFECT = 'Profit is not affected';

const SECRET_ITEMS: { key: string; creates: boolean; text: (w: string) => string; note: string }[] = [
  { key: 'well below both its cost and its market price', creates: true, text: (w) => `${w} deliberately values its closing stock well below both its cost and its market price.`, note: 'Stock should be valued at cost or market price, whichever is lower. Showing it lower still means a lower profit this year and a hidden surplus in the stock: a secret reserve.' },
  { key: 'far higher than', creates: true, text: (w) => `${w} charges depreciation on its machinery at a rate far higher than the wear and tear justifies.`, note: 'Excess depreciation lowers profit and the asset value, hiding a surplus: a secret reserve.' },
  { key: 'much larger than', creates: true, text: (w) => `${w} creates a provision for doubtful debts much larger than its debtors could possibly need.`, note: 'An unnecessarily large provision lowers profit and hides a surplus: a secret reserve.' },
  { key: 'as a repair expense', creates: true, text: (w) => `${w} writes off the whole cost of a new machine as a repair expense in the year it is bought, although it will serve for many years.`, note: 'Writing a capital item off as a revenue expense lowers profit and hides the machine\'s value: a secret reserve.' },
  { key: 'goodwill it paid for', creates: true, text: (w) => `${w} writes off against this year's profit the whole of the goodwill it paid for, although the goodwill has lost none of its value.`, note: 'Writing off an asset that still has its value lowers profit and hides the asset: a secret reserve.' },
  { key: 'above its cost', creates: false, text: (w) => `${w} values its closing stock above its cost.`, note: 'Stock is never valued above its cost. A higher closing stock raises this year\'s profit, so profit is overstated: the opposite of a secret reserve.' },
  { key: 'does not charge any depreciation', creates: false, text: (w) => `${w} does not charge any depreciation on its machinery although it wears out.`, note: 'Leaving out depreciation raises profit and keeps the asset too high: the opposite of a secret reserve.' },
  { key: 'makes no provision', creates: false, text: (w) => `${w} makes no provision for debtors who are very likely to default.`, note: 'Leaving out a needed provision raises profit and keeps debtors too high: the opposite of a secret reserve.' },
  { key: 'addition to the cost of its building', creates: false, text: (w) => `${w} treats the cost of heavy repairs, which is a revenue expense, as an addition to the cost of its building.`, note: 'Capitalising a revenue expense raises profit and the asset value: the opposite of a secret reserve.' },
];

const secretReserve = mcqTemplate({
  id: 'pr-secret-reserve',
  topicId: T,
  conceptId: 'pr-secret',
  difficulty: 'easy',
  generate: (rng) => {
    const item = rng.pick(SECRET_ITEMS);
    return {
      prompt: `${item.text(rng.pick(FIRMS))} What is the effect on profit and on secret reserves?`,
      correct: item.creates ? UNDERSTATE : OVERSTATE,
      distractors: item.creates
        ? [
            { text: OVERSTATE_RES, why: 'Reversed the direction: a secret reserve comes from understating profit, not overstating it.' },
            { text: OVERSTATE, why: 'Read the direction the wrong way; this practice shows assets and profit lower than they are, not higher.' },
            { text: NO_EFFECT, why: 'Thought valuing an asset or making a charge does not reach the profit.' },
          ]
        : [
            { text: UNDERSTATE, why: 'Took any wrong valuation as a secret reserve; here assets and profit are too high, so profit is not hidden.' },
            { text: OVERSTATE_RES, why: 'Saw that profit is overstated but still called it a secret reserve, which needs profit to be understated.' },
            { text: NO_EFFECT, why: 'Thought valuing an asset or making a charge does not reach the profit.' },
          ],
      explanation: item.note,
      hints: ['Does the practice make profit and assets lower than they really are, or higher?', 'A secret reserve arises when assets are undervalued, liabilities overvalued or profit understated.'],
    };
  },
  verify: (q) => {
    const item = SECRET_ITEMS.find((i) => q.prompt.includes(i.key));
    const right = q.options.find((o) => o.id === q.correct)?.text;
    return item !== undefined && right === (item.creates ? UNDERSTATE : OVERSTATE);
  },
});

// ---------------------------------------------------------------------------------------------------------------
// Net profit versus the transfer to reserve (complex mcq).
// ---------------------------------------------------------------------------------------------------------------

const profitStatement = mcqTemplate({
  id: 'pr-profit-statement',
  topicId: T,
  conceptId: 'pr-difference',
  difficulty: 'complex',
  generate: (rng) => {
    const n = rng.step(100000, 400000, 10000);
    const p = rng.step(10000, 40000, 5000);
    const r = rng.step(10000, 60000, 5000);
    if (p === r) return null;
    return {
      prompt: `${rng.pick(FIRMS)} earned a profit of ${inr(n)} before providing for doubtful debts. It created a provision for doubtful debts of ${inr(p)} and then transferred ${inr(r)} to General Reserve. Which statement is correct?`,
      correct: `Net profit is ${inr(n - p)}; the transfer of ${inr(r)} is made out of it, leaving ${inr(n - p - r)}`,
      distractors: [
        { text: `Net profit is ${inr(n - p - r)}, because both the provision and the transfer are charges`, why: 'Treated the transfer to reserve as a charge and deducted it before finding net profit.' },
        { text: `Net profit is ${inr(n)}; the provision and the transfer are both appropriations`, why: 'Treated the provision as an appropriation of profit; it is a charge.' },
        { text: `Net profit is ${inr(n - r)}; the transfer is a charge and the provision is not`, why: 'Swapped the two: the provision is the charge and the transfer is the appropriation.' },
      ],
      explanation: `The provision is a charge: ${inr(n)} - ${inr(p)} = ${inr(n - p)} is the net profit. The transfer to reserve is an appropriation out of it: ${inr(n - p)} - ${inr(r)} = ${inr(n - p - r)} remains.`,
    };
  },
  verify: (q) => {
    const a = amts(q.prompt); // profit, provision, transfer
    const right = q.options.find((o) => o.id === q.correct)?.text;
    return a.length === 3 && right === `Net profit is ${inr(a[0] - a[1])}; the transfer of ${inr(a[2])} is made out of it, leaving ${inr(a[0] - a[1] - a[2])}`;
  },
});

// ---------------------------------------------------------------------------------------------------------------
// Provision for doubtful debts.
// ---------------------------------------------------------------------------------------------------------------

const pddAmount = numericTemplate({
  id: 'pr-pdd-amount',
  version: 2,
  topicId: T,
  conceptId: 'pr-pdd',
  difficulty: 'easy',
  unit: 'rupees',
  generate: (rng) => {
    const d = rng.step(20000, 500000, 5000);
    const r = rng.pick(RATES);
    const provision = pc(d, r);
    if (!Number.isInteger(provision)) return null;
    const w = rng.pick(FIRMS);
    if (rng.next() < 0.65) {
      return {
        prompt: `${w} has debtors of ${inr(d)} at the end of the year. It decides to create a provision for doubtful debts at ${r}% of them. What is the amount of the provision?`,
        answer: rs(provision),
        commonErrors: errs(rs(provision), [
          { value: rs(d - provision), why: 'Gave the debtors left after the provision instead of the provision itself.' },
          { value: rs(d * r), why: 'Multiplied by the rate without dividing by 100.' },
          { value: rs(d + provision), why: 'Added the provision to the debtors.' },
        ]),
        explanation: ['Provision = Debtors x Rate.', `${inr(d)} x ${r}/100 = ${inr(provision)}.`],
        hints: H_PDD_BASE,
      };
    }
    return {
      prompt: `${w} created a provision for doubtful debts of ${inr(provision)}, which is ${r}% of its debtors. What were the debtors?`,
      answer: rs(d),
      commonErrors: errs(rs(d), [
        { value: rs(pc(provision, r)), why: `Took ${r}% of the provision instead of finding the debtors on which the provision is ${r}%.` },
        { value: rs(provision * (100 + r) / 100), why: 'Added the rate to the provision, as if the debtors were the provision plus the rate.' },
        { value: rs(provision * r), why: 'Multiplied the provision by the rate.' },
      ]),
      explanation: ['Debtors = Provision x 100 / Rate.', `${inr(provision)} x 100 / ${r} = ${inr(d)}.`],
      hints: H_PDD_BASE,
    };
  },
  verify: (q) => {
    const [a] = amts(q.prompt);
    const [r] = pcts(q.prompt);
    const ans = q.answer / 100;
    return q.prompt.includes('What were the debtors') ? ans * r === a * 100 : ans * 100 === a * r;
  },
});

const pddAfterBad = numericTemplate({
  id: 'pr-pdd-after-bad-debts',
  topicId: T,
  conceptId: 'pr-pdd',
  difficulty: 'easy',
  unit: 'rupees',
  generate: (rng) => {
    const d = rng.step(40000, 400000, 5000);
    const b = rng.step(1000, Math.floor(d / 10 / 1000) * 1000, 1000);
    const r = rng.pick(RATES);
    const provision = pc(d - b, r);
    if (!Number.isInteger(provision)) return null;
    const w = rng.pick(FIRMS);
    const prompt =
      rng.next() < 0.5
        ? `${w} shows debtors of ${inr(d)} at the year end, with no old provision. Bad debts of ${inr(b)} are yet to be written off, and a provision for doubtful debts of ${r}% is to be made on the debtors that remain. What is the new provision?`
        : `The trial balance of ${w} shows sundry debtors of ${inr(d)}. The adjustments say: write off bad debts of ${inr(b)}, then create a provision for doubtful debts at ${r}% on the balance. There is no old provision. What is the provision to be created?`;
    return {
      prompt,
      answer: rs(provision),
      commonErrors: errs(rs(provision), [
        { value: rs(pc(d, r)), why: 'Took the provision on the debtors before deducting the bad debts.' },
        { value: rs(provision + b), why: 'Added the bad debts to the provision; they are a separate charge.' },
        { value: rs(pc(b, r)), why: 'Applied the rate to the bad debts instead of to the remaining debtors.' },
      ]),
      explanation: [
        'Debtors left after bad debts = Debtors - Bad debts.',
        `${inr(d)} - ${inr(b)} = ${inr(d - b)}.`,
        `Provision = ${inr(d - b)} x ${r}/100 = ${inr(provision)}.`,
      ],
      hints: ['First write off the bad debts from the debtors.', 'The provision is made on the debtors that remain, not on the original figure.'],
    };
  },
  verify: (q) => {
    const [d, b] = amts(q.prompt);
    const [r] = pcts(q.prompt);
    return q.answer / 100 === Math.round(((d - b) * r) / 100);
  },
});

const pddRate = numericTemplate({
  id: 'pr-pdd-rate',
  version: 2,
  topicId: T,
  conceptId: 'pr-pdd',
  difficulty: 'medium',
  unit: 'percent',
  generate: (rng) => {
    const d = rng.step(50000, 500000, 10000);
    const b = rng.step(5000, Math.min(50000, Math.floor(d / 5 / 5000) * 5000), 5000);
    const r = rng.pick(RATES);
    const base = d - b;
    const p = pc(base, r);
    if (!Number.isInteger(p)) return null;
    return {
      prompt: `${rng.pick(FIRMS)} has debtors of ${inr(d)}. After writing off bad debts of ${inr(b)}, it creates a provision for doubtful debts of ${inr(p)} on the remaining debtors. What percentage of the remaining debtors is the provision?`,
      answer: r * 100,
      commonErrors: errs(r * 100, [
        { value: (p * 10000) / d, why: 'Divided the provision by the debtors before the bad debts were written off.' },
        { value: (100 - r) * 100, why: 'Gave 100 less the rate, the share of the debtors that is not provided for.' },
        { value: (p * 10000) / (base - p), why: 'Divided the provision by the debtors left after the provision itself.' },
      ]),
      explanation: [`Debtors left = ${inr(d)} - ${inr(b)} = ${inr(base)}.`, `Rate = ${inr(p)} / ${inr(base)} x 100 = ${r}%.`],
      hints: H_PDD_BASE,
    };
  },
  verify: (q) => {
    const [d, b, p] = amts(q.prompt);
    return q.answer === Math.round((p * 10000) / (d - b));
  },
});

const pddCharge = numericTemplate({
  id: 'pr-pdd-pl-charge',
  topicId: T,
  conceptId: 'pr-pdd',
  difficulty: 'medium',
  unit: 'rupees',
  generate: (rng) => {
    const o = rng.step(2000, 20000, 500);
    const b = rng.step(1000, 20000, 500);
    const n = rng.step(5000, 40000, 500);
    const charge = b + n - o;
    if (charge <= 0 || n === o) return null;
    return {
      prompt: `The Provision for Doubtful Debts A/c of ${rng.pick(FIRMS)} has an opening credit balance of ${inr(o)}. During the year bad debts of ${inr(b)} were written off. The provision needed at the year end is ${inr(n)}. What is the net amount debited to the Profit and Loss Account for the year for bad debts and the provision for doubtful debts taken together?`,
      answer: rs(charge),
      commonErrors: errs(rs(charge), [
        { value: rs(b + n), why: 'Ignored the old provision, which is already there and is deducted from the charge.' },
        { value: rs(b + n + o), why: 'Added the old provision instead of deducting it.' },
        { value: rs(n - o), why: 'Took only the change in provision and left out the bad debts.' },
      ]),
      explanation: ['Net charge = Bad debts + New provision - Old provision.', `${inr(b)} + ${inr(n)} - ${inr(o)} = ${inr(charge)}.`],
      hints: ['Bad debts and the provision now needed are both charges of the year.', 'The old provision was charged in an earlier year, so it is deducted.'],
    };
  },
  verify: (q) => {
    const [o, b, n] = amts(q.prompt);
    // Debits less credits, taken one entry at a time.
    return q.answer / 100 === [b, n, -o].reduce((sum, x) => sum + x, 0);
  },
});

const pddWriteback = numericTemplate({
  id: 'pr-pdd-writeback',
  version: 2,
  topicId: T,
  conceptId: 'pr-pdd',
  difficulty: 'medium',
  unit: 'rupees',
  generate: (rng) => {
    const w = rng.pick(FIRMS);
    if (rng.next() < 0.6) {
      const d = rng.step(40000, 300000, 5000);
      const r = rng.pick(RATES);
      const n = pc(d, r);
      const extra = rng.step(500, 6000, 500);
      const o = n + extra; // the old provision is a little more than is now needed
      if (!Number.isInteger(n) || extra > n) return null;
      return {
        prompt: `${w} had a provision for doubtful debts of ${inr(o)} at the start of the year. No bad debts arose during the year. Debtors at the year end are ${inr(d)}, and the provision is to be ${r}% of them. How much of the old provision is no longer needed and is credited to the Profit and Loss Account?`,
        answer: rs(o - n),
        commonErrors: errs(rs(o - n), [
          { value: rs(o), why: 'Wrote back the whole old provision instead of only the excess over the new one.' },
          { value: rs(n), why: 'Gave the new provision instead of the excess of the old one.' },
          { value: rs(o + n), why: 'Added the old and new provisions instead of finding their difference.' },
        ]),
        explanation: [`New provision = ${inr(d)} x ${r}/100 = ${inr(n)}.`, `Excess = Old provision - New provision = ${inr(o)} - ${inr(n)} = ${inr(o - n)}.`],
        hints: H_PDD_WRITEBACK,
      };
    }
    const d = rng.step(100000, 500000, 10000);
    const r1 = rng.pick([6, 8, 10]);
    const r2 = rng.pick([2, 3, 4, 5]);
    const x = pc(d, r1 - r2);
    if (r2 >= r1 || !Number.isInteger(x)) return null;
    return {
      prompt: `Debtors of ${w} are ${inr(d)} at both the start and the end of the year, and there are no bad debts. The provision for doubtful debts is reduced from ${r1}% to ${r2}% of the debtors. How much is credited to the Profit and Loss Account because of the reduction?`,
      answer: rs(x),
      commonErrors: errs(rs(x), [
        { value: rs(pc(d, r2)), why: 'Gave the new provision instead of the reduction.' },
        { value: rs(pc(d, r1)), why: 'Gave the old provision instead of the reduction.' },
        { value: rs(pc(d, r1 + r2)), why: 'Added the two rates instead of taking their difference.' },
      ]),
      explanation: [`Old provision = ${inr(pc(d, r1))}; new provision = ${inr(pc(d, r2))}.`, `Reduction = ${inr(pc(d, r1))} - ${inr(pc(d, r2))} = ${inr(x)}.`],
      hints: H_PDD_WRITEBACK,
    };
  },
  verify: (q) => {
    const a = amts(q.prompt);
    const p = pcts(q.prompt);
    const ans = q.answer / 100;
    return q.prompt.includes('reduced from') ? ans * 100 === a[0] * (p[0] - p[1]) : ans * 100 === a[0] * 100 - a[1] * p[0];
  },
});

const debtorsNet = numericTemplate({
  id: 'pr-debtors-net',
  topicId: T,
  conceptId: 'pr-pdd',
  difficulty: 'medium',
  unit: 'rupees',
  generate: (rng) => {
    const d = rng.step(50000, 500000, 5000);
    const b = rng.step(2000, Math.floor(d / 10 / 1000) * 1000, 1000);
    const r = rng.pick(RATES);
    const p = pc(d - b, r);
    if (!Number.isInteger(p)) return null;
    return {
      prompt: `At the end of the year ${rng.pick(FIRMS)} has debtors of ${inr(d)}. Bad debts of ${inr(b)} are to be written off and a provision for doubtful debts of ${r}% is to be created on the remaining debtors. At what amount will the debtors be shown in the balance sheet?`,
      answer: rs(d - b - p),
      commonErrors: errs(rs(d - b - p), [
        { value: rs(d - b), why: 'Left out the provision; it is deducted from the debtors in the balance sheet.' },
        { value: rs(d - pc(d, r)), why: 'Worked the provision on the full debtors and did not write off the bad debts.' },
        { value: rs(d - b + p), why: 'Added the provision to the debtors instead of deducting it.' },
        { value: rs(p), why: 'Gave the provision instead of the debtors left.' },
      ]),
      explanation: [
        `Debtors after bad debts = ${inr(d)} - ${inr(b)} = ${inr(d - b)}.`,
        `Provision = ${inr(d - b)} x ${r}/100 = ${inr(p)}.`,
        `Shown in the balance sheet = ${inr(d - b)} - ${inr(p)} = ${inr(d - b - p)}.`,
      ],
    };
  },
  verify: (q) => {
    const [d, b] = amts(q.prompt);
    const [r] = pcts(q.prompt);
    return q.answer / 100 === Math.round(((d - b) * (100 - r)) / 100);
  },
});

const pddChargeDebtors = numericTemplate({
  id: 'pr-pdd-pl-charge-debtors',
  version: 2,
  topicId: T,
  conceptId: 'pr-pdd',
  difficulty: 'complex',
  unit: 'rupees',
  generate: (rng) => {
    const d = rng.step(80000, 400000, 5000);
    const b1 = rng.step(1000, 10000, 500);
    const o = rng.step(3000, 20000, 500);
    const b2 = rng.step(2000, Math.floor(d / 10 / 500) * 500, 500);
    const r = rng.pick(RATES);
    const n = pc(d - b2, r);
    const total = b1 + b2 + n - o;
    if (!Number.isInteger(n) || total <= 0) return null;
    return {
      prompt: `The trial balance of ${rng.pick(FIRMS)} shows debtors of ${inr(d)}, bad debts of ${inr(b1)} and a Provision for Doubtful Debts (credit) of ${inr(o)}. The adjustments are: write off further bad debts of ${inr(b2)}, and provide for doubtful debts at ${r}% on the debtors that remain. What is the total amount charged to the Profit and Loss Account for bad debts and provision, after crediting the old provision?`,
      answer: rs(total),
      commonErrors: errs(rs(total), [
        { value: rs(b2 + n - o), why: 'Left out the bad debts already in the trial balance.' },
        { value: rs(b1 + b2 + pc(d, r) - o), why: 'Worked the new provision on the debtors before the further bad debts were written off.' },
        { value: rs(b1 + b2 + n), why: 'Forgot to credit the old provision.' },
        { value: rs(b1 + b2 + n + o), why: 'Added the old provision instead of deducting it.' },
      ]),
      explanation: [
        `Debtors left = ${inr(d)} - ${inr(b2)} = ${inr(d - b2)}; new provision = ${r}% = ${inr(n)}.`,
        'Charge = Bad debts + Further bad debts + New provision - Old provision.',
        `${inr(b1)} + ${inr(b2)} + ${inr(n)} - ${inr(o)} = ${inr(total)}.`,
      ],
      hints: H_PDD_CHARGE,
    };
  },
  verify: (q) => {
    const [d, b1, o, b2] = amts(q.prompt);
    const [r] = pcts(q.prompt);
    const debits = b1 + b2 + ((d - b2) * r) / 100;
    return q.answer / 100 === debits - o;
  },
});

const pddNetCredit = numericTemplate({
  id: 'pr-pdd-net-credit',
  version: 2,
  topicId: T,
  conceptId: 'pr-pdd',
  difficulty: 'complex',
  unit: 'rupees',
  generate: (rng) => {
    const b = rng.step(1000, 6000, 500);
    const d = rng.step(100000, 400000, 5000);
    const r = rng.pick(RATES);
    const n = pc(d, r);
    const gain = rng.step(500, 4000, 500);
    const o = b + n + gain; // the old provision covers both debits with something to spare
    if (!Number.isInteger(n) || b + gain > n) return null;
    return {
      prompt: `The trial balance of ${rng.pick(FIRMS)} shows bad debts of ${inr(b)} and a Provision for Doubtful Debts (credit) of ${inr(o)}. Debtors at the year end, after all bad debts have been written off, are ${inr(d)}, and the provision is to be ${r}% of them. The old provision is more than the bad debts and the new provision together. What net amount is credited to the Profit and Loss Account?`,
      answer: rs(gain),
      commonErrors: errs(rs(gain), [
        { value: rs(o - n), why: 'Left out the bad debts, which the old provision also has to cover.' },
        { value: rs(o - b), why: 'Left out the new provision, which has to be kept back out of the old one.' },
        { value: rs(o), why: 'Gave the whole old provision, without deducting the bad debts and the new provision.' },
        { value: rs(b + n), why: 'Gave the total of the bad debts and the new provision instead of the surplus of the old provision over them.' },
      ]),
      explanation: [
        `New provision = ${inr(d)} x ${r}/100 = ${inr(n)}.`,
        `Bad debts + New provision = ${inr(b)} + ${inr(n)} = ${inr(b + n)}.`,
        `Net credit = Old provision - (Bad debts + New provision) = ${inr(o)} - ${inr(b + n)} = ${inr(gain)}.`,
      ],
      hints: H_PDD_WRITEBACK,
    };
  },
  verify: (q) => {
    const [b, o, d] = amts(q.prompt);
    const [r] = pcts(q.prompt);
    // Net credit equals what is left of the old provision once both debits are met.
    return o - q.answer / 100 === b + (d * r) / 100;
  },
});

const pddDiscount = numericTemplate({
  id: 'pr-pdd-discount',
  version: 2,
  topicId: T,
  conceptId: 'pr-pdd',
  difficulty: 'complex',
  unit: 'rupees',
  generate: (rng) => {
    const d = rng.step(60000, 400000, 10000);
    const b = rng.step(2000, 20000, 2000);
    const r1 = rng.pick([5, 10, 20]);
    const r2 = rng.pick([2, 3, 5]);
    const rem = d - b;
    const pdd = pc(rem, r1);
    const good = rem - pdd;
    const disc = pc(good, r2);
    if (!Number.isInteger(pdd) || !Number.isInteger(disc)) return null;
    const wantsBoth = rng.next() < 0.35;
    const w = rng.pick(FIRMS);
    const base = `Debtors of ${w} stand at ${inr(d)}. Bad debts of ${inr(b)} are to be written off. A provision for doubtful debts of ${r1}% is to be made on the remaining debtors. A provision for discount on debtors of ${r2}% is then to be made on the debtors left after deducting both the bad debts and the provision for doubtful debts.`;
    if (wantsBoth) {
      return {
        prompt: `${base} What is the total of the two new provisions?`,
        answer: rs(pdd + disc),
        commonErrors: errs(rs(pdd + disc), [
          { value: rs(disc), why: 'Gave only the provision for discount.' },
          { value: rs(pdd), why: 'Gave only the provision for doubtful debts.' },
          { value: rs(pdd + pc(rem, r2)), why: 'Worked the discount provision before deducting the provision for doubtful debts.' },
        ]),
        explanation: [
          `Provision for doubtful debts = ${inr(rem)} x ${r1}/100 = ${inr(pdd)}.`,
          `Debtors left for discount = ${inr(rem)} - ${inr(pdd)} = ${inr(good)}; provision for discount = ${r2}% = ${inr(disc)}.`,
          `Total = ${inr(pdd)} + ${inr(disc)} = ${inr(pdd + disc)}.`,
        ],
        hints: H_PDD_DISCOUNT,
      };
    }
    return {
      prompt: `${base} What is the provision for discount on debtors?`,
      answer: rs(disc),
      commonErrors: errs(rs(disc), [
        { value: rs(pc(d, r2)), why: 'Took the discount on the full debtors, without deducting the bad debts or the provision.' },
        { value: rs(pc(rem, r2)), why: 'Took the discount on the debtors after bad debts but before deducting the provision for doubtful debts.' },
        { value: rs(pdd), why: 'Gave the provision for doubtful debts instead of the one for discount.' },
      ]),
      explanation: [
        `Provision for doubtful debts = ${inr(rem)} x ${r1}/100 = ${inr(pdd)}.`,
        `Good debtors = ${inr(rem)} - ${inr(pdd)} = ${inr(good)}.`,
        `Provision for discount = ${inr(good)} x ${r2}/100 = ${inr(disc)}.`,
      ],
      hints: H_PDD_DISCOUNT,
    };
  },
  verify: (q) => {
    const [d, b] = amts(q.prompt);
    const [r1, r2] = pcts(q.prompt);
    const good = ((d - b) * (100 - r1)) / 100; // debtors left after both deductions
    const disc = (good * r2) / 100;
    return q.prompt.includes('total of the two') ? q.answer / 100 === disc + ((d - b) * r1) / 100 : q.answer / 100 === disc;
  },
});

// ---------------------------------------------------------------------------------------------------------------
// Reserves: amounts.
// ---------------------------------------------------------------------------------------------------------------

const reserveTransfer = numericTemplate({
  id: 'pr-reserve-transfer',
  topicId: T,
  conceptId: 'pr-reserve-meaning',
  difficulty: 'easy',
  unit: 'rupees',
  generate: (rng) => {
    const n = rng.step(100000, 800000, 10000);
    const r = rng.pick([5, 10, 15, 20, 25]);
    const t = pc(n, r);
    if (!Number.isInteger(t)) return null;
    const w = rng.pick(FIRMS);
    const k = rng.next();
    if (k < 0.4) {
      return {
        prompt: `${w} earned a net profit of ${inr(n)} this year and transferred ${r}% of it to General Reserve. What is the amount transferred?`,
        answer: rs(t),
        commonErrors: errs(rs(t), [
          { value: rs(n - t), why: 'Gave the profit left after the transfer instead of the transfer.' },
          { value: rs(n * r), why: 'Multiplied the profit by the rate without dividing by 100.' },
          { value: rs(n + t), why: 'Added the transfer to the profit.' },
        ]),
        explanation: ['Transfer = Net profit x Rate.', `${inr(n)} x ${r}/100 = ${inr(t)}.`],
      };
    }
    if (k < 0.75) {
      return {
        prompt: `${w} earned a net profit of ${inr(n)} this year and transferred ${r}% of it to General Reserve. How much of the profit remains after the transfer?`,
        answer: rs(n - t),
        commonErrors: errs(rs(n - t), [
          { value: rs(t), why: 'Gave the amount transferred instead of the profit that remains.' },
          { value: rs(n + t), why: 'Added the transfer to the profit.' },
          { value: rs(n), why: 'Forgot that the transfer comes out of the profit.' },
        ]),
        explanation: [`Transfer = ${inr(n)} x ${r}/100 = ${inr(t)}.`, `Profit remaining = ${inr(n)} - ${inr(t)} = ${inr(n - t)}.`],
      };
    }
    return {
      prompt: `${w} transferred ${inr(t)} to General Reserve, which is ${r}% of its net profit for the year. What was the net profit?`,
      answer: rs(n),
      commonErrors: errs(rs(n), [
        { value: rs(pc(t, r)), why: `Took ${r}% of the transfer instead of finding the profit it is ${r}% of.` },
        { value: rs(t * r), why: 'Multiplied the transfer by the rate.' },
        { value: rs(t + pc(t, r)), why: 'Added the rate on the transfer to the transfer.' },
      ]),
      explanation: ['Net profit = Transfer x 100 / Rate.', `${inr(t)} x 100 / ${r} = ${inr(n)}.`],
    };
  },
  verify: (q) => {
    const [a] = amts(q.prompt);
    const [r] = pcts(q.prompt);
    const ans = q.answer / 100;
    if (q.prompt.includes('What was the net profit')) return ans * r === a * 100;
    if (q.prompt.includes('remains after')) return ans === a - (a * r) / 100;
    return ans * 100 === a * r;
  },
});

const reserveBalance = numericTemplate({
  id: 'pr-reserve-balance',
  topicId: T,
  conceptId: 'pr-reserve-meaning',
  difficulty: 'medium',
  unit: 'rupees',
  generate: (rng) => {
    const o = rng.step(20000, 200000, 10000);
    const n1 = rng.step(100000, 500000, 10000);
    const n2 = rng.step(100000, 500000, 10000);
    const r1 = rng.pick([5, 10, 15, 20]);
    const r2 = rng.pick([5, 10, 15, 20]);
    const t1 = pc(n1, r1);
    const t2 = pc(n2, r2);
    if (!Number.isInteger(t1) || !Number.isInteger(t2) || n1 === n2) return null;
    return {
      prompt: `General Reserve of ${rng.pick(FIRMS)} stood at ${inr(o)} at the start of the first year. The net profit of the first year was ${inr(n1)}, of which ${r1}% was transferred to General Reserve. The net profit of the second year was ${inr(n2)}, of which ${r2}% was transferred. What is the balance of General Reserve at the end of the second year?`,
      answer: rs(o + t1 + t2),
      commonErrors: errs(rs(o + t1 + t2), [
        { value: rs(o + t1), why: 'Left out the transfer of the second year.' },
        { value: rs(t1 + t2), why: 'Left out the opening balance of the reserve.' },
        { value: rs(o + n1 + n2), why: 'Added the whole profits instead of only the amounts transferred.' },
      ]),
      explanation: [
        `First-year transfer = ${inr(n1)} x ${r1}/100 = ${inr(t1)}.`,
        `Second-year transfer = ${inr(n2)} x ${r2}/100 = ${inr(t2)}.`,
        `Closing balance = ${inr(o)} + ${inr(t1)} + ${inr(t2)} = ${inr(o + t1 + t2)}.`,
      ],
    };
  },
  verify: (q) => {
    const [o, n1, n2] = amts(q.prompt);
    const [r1, r2] = pcts(q.prompt);
    return q.answer / 100 === o + (n1 * r1) / 100 + (n2 * r2) / 100;
  },
});

const profitFromReserve = numericTemplate({
  id: 'pr-profit-from-reserve',
  topicId: T,
  conceptId: 'pr-reserve-meaning',
  difficulty: 'medium',
  unit: 'rupees',
  generate: (rng) => {
    const n = rng.step(100000, 800000, 10000);
    const r = rng.pick([5, 10, 15, 20, 25]);
    const t = pc(n, r);
    const left = n - t;
    if (!Number.isInteger(t)) return null;
    return {
      prompt: `${rng.pick(FIRMS)} transfers ${r}% of its net profit to General Reserve. After the transfer, ${inr(left)} of the profit is left. What was the net profit?`,
      answer: rs(n),
      commonErrors: errs(rs(n), [
        { value: rs(pc(left, 100 + r)), why: `Added back ${r}% of the profit that is left; the ${r}% was taken from the full profit, so this does not return to it.` },
        { value: rs(t), why: 'Gave the amount transferred instead of the profit it was taken from.' },
        { value: rs(left), why: 'Gave the profit left instead of the profit before the transfer.' },
      ]),
      explanation: [
        `The profit left is (100 - ${r})% = ${100 - r}% of the net profit.`,
        `Net profit = ${inr(left)} x 100 / ${100 - r} = ${inr(n)}.`,
      ],
    };
  },
  verify: (q) => {
    const [left] = amts(q.prompt);
    const [r] = pcts(q.prompt);
    const n = q.answer / 100;
    return n - (n * r) / 100 === left;
  },
});

const capitalProfit = numericTemplate({
  id: 'pr-capital-profit',
  version: 2,
  topicId: T,
  conceptId: 'pr-revenue-capital',
  difficulty: 'medium',
  unit: 'rupees',
  generate: (rng) => {
    const t = rng.step(50000, 300000, 10000);
    const c = rng.step(100000, 600000, 50000);
    const g = rng.step(10000, 90000, 5000);
    const s = c + g;
    const w = rng.pick(FIRMS);
    const prompt =
      rng.next() < 0.5
        ? `${w} earned a trading profit of ${inr(t)} this year. It also sold a plot of land that had cost ${inr(c)} for ${inr(s)}. The profit on the sale is a capital profit and is kept in a reserve. What amount goes to the Capital Reserve?`
        : `${w} earned a trading profit of ${inr(t)} this year. Its building, which stood in the books at ${inr(c)}, was revalued upwards to ${inr(s)}, and the surplus is kept in a reserve. What amount goes to the Capital Reserve?`;
    return {
      prompt,
      answer: rs(g),
      commonErrors: errs(rs(g), [
        { value: rs(s), why: 'Took the whole sale or revalued figure as the capital profit instead of the gain over cost.' },
        { value: rs(t + g), why: 'Added the trading profit, which is a revenue profit and belongs to the revenue reserves.' },
        { value: rs(t), why: 'Gave the trading profit; it is not a capital profit.' },
      ]),
      explanation: [
        'Capital profit = Sale (or revalued) amount - Book value.',
        `${inr(s)} - ${inr(c)} = ${inr(g)}. The trading profit of ${inr(t)} is a revenue profit and is not part of it.`,
      ],
      hints: H_CAPITAL_PROFIT,
    };
  },
  verify: (q) => {
    const [t, c, s] = amts(q.prompt);
    return t > 0 && s > c && q.answer / 100 === s - c;
  },
});

const profitAfterBoth = numericTemplate({
  id: 'pr-profit-after-both',
  version: 2,
  topicId: T,
  conceptId: 'pr-difference',
  difficulty: 'complex',
  unit: 'rupees',
  generate: (rng) => {
    const n = rng.step(100000, 600000, 10000);
    const p = rng.step(5000, Math.floor(n / 4 / 5000) * 5000, 5000);
    const r = rng.pick([10, 20, 25]);
    const net = n - p;
    const rest = pc(net, 100 - r);
    if (!Number.isInteger(rest) || !Number.isInteger(pc(n, 100 - r))) return null;
    return {
      prompt: `${rng.pick(FIRMS)} earned a profit of ${inr(n)} before making a provision for doubtful debts of ${inr(p)}. After that provision is charged, ${r}% of the resulting net profit is transferred to General Reserve and the balance is added to the owner's capital. How much is added to the capital?`,
      answer: rs(rest),
      commonErrors: errs(rs(rest), [
        { value: rs(pc(n, 100 - r) - p), why: 'Took the reserve on the profit before the provision was charged.' },
        { value: rs(net), why: 'Forgot the transfer to General Reserve.' },
        { value: rs(pc(net, r)), why: 'Gave the amount transferred to the reserve instead of the balance.' },
        { value: rs(pc(n, 100 - r)), why: 'Left out the provision, which is charged before the net profit is found.' },
      ]),
      explanation: [
        `Net profit = ${inr(n)} - ${inr(p)} = ${inr(net)} (the provision is a charge).`,
        `Transfer to General Reserve = ${inr(net)} x ${r}/100 = ${inr(pc(net, r))} (an appropriation).`,
        `Added to capital = ${inr(net)} - ${inr(pc(net, r))} = ${inr(rest)}.`,
      ],
      hints: H_CHARGE_THEN_APPROPRIATE,
    };
  },
  verify: (q) => {
    const [n, p] = amts(q.prompt);
    const [r] = pcts(q.prompt);
    return q.answer / 100 === n - p - ((n - p) * r) / 100;
  },
});

// ---------------------------------------------------------------------------------------------------------------
// Provision for depreciation.
// ---------------------------------------------------------------------------------------------------------------

const deprBalance = numericTemplate({
  id: 'pr-depr-provision-balance',
  topicId: T,
  conceptId: 'pr-depn-provision',
  difficulty: 'easy',
  unit: 'rupees',
  generate: (rng) => {
    const c = rng.step(100000, 800000, 10000);
    const r = rng.pick([5, 8, 10, 12, 15, 20]);
    const n = rng.int(2, 6);
    if (r * n >= 80) return null;
    const one = pc(c, r);
    const prov = one * n;
    if (!Number.isInteger(one)) return null;
    const asset = rng.pick(ASSETS);
    const w = rng.pick(FIRMS);
    const base = `${w} bought ${asset} costing ${inr(c)} at the start of year 1. It keeps the asset at cost and records depreciation in a Provision for Depreciation A/c, at ${r}% of cost every year (straight line, a full year of depreciation in each year).`;
    if (rng.next() < 0.6) {
      return {
        prompt: `${base} What is the balance of the Provision for Depreciation A/c after ${n} years?`,
        answer: rs(prov),
        commonErrors: errs(rs(prov), [
          { value: rs(one), why: 'Gave one year\'s depreciation instead of the total for all the years.' },
          { value: rs(c - prov), why: 'Gave the book value of the asset instead of the balance of the provision.' },
          { value: rs(one * (n + 1)), why: 'Counted one year too many.' },
        ]),
        explanation: [`Depreciation each year = ${inr(c)} x ${r}/100 = ${inr(one)}.`, `After ${n} years = ${inr(one)} x ${n} = ${inr(prov)}.`],
      };
    }
    return {
      prompt: `${base} At what amount will the asset be shown in the balance sheet after ${n} years (cost less the provision)?`,
      answer: rs(c - prov),
      commonErrors: errs(rs(c - prov), [
        { value: rs(prov), why: 'Gave the balance of the provision instead of the asset\'s value after deducting it.' },
        { value: rs(c - one), why: 'Deducted only one year\'s depreciation.' },
        { value: rs(c), why: 'Showed the cost and forgot to deduct the provision.' },
      ]),
      explanation: [`Depreciation each year = ${inr(c)} x ${r}/100 = ${inr(one)}.`, `Provision after ${n} years = ${inr(prov)}.`, `Shown at ${inr(c)} - ${inr(prov)} = ${inr(c - prov)}.`],
    };
  },
  verify: (q) => {
    const [c] = amts(q.prompt);
    const [r] = pcts(q.prompt);
    const n = after(q.prompt, /after (\d+) years/);
    const prov = (c * r * n) / 100;
    return q.prompt.includes('cost less the provision') ? q.answer / 100 === c - prov : q.answer / 100 === prov;
  },
});

const deprTwoAssets = numericTemplate({
  id: 'pr-depr-two-assets',
  version: 2,
  topicId: T,
  conceptId: 'pr-depn-provision',
  difficulty: 'complex',
  unit: 'rupees',
  generate: (rng) => {
    const c1 = rng.step(200000, 800000, 50000);
    const c2 = rng.step(50000, 300000, 10000);
    const r1 = rng.pick([5, 10, 15]);
    const r2 = rng.pick([10, 15, 20]);
    const n = rng.int(2, 5);
    const p1 = pc(c1, r1) * n;
    const p2 = pc(c2, r2) * n;
    if (!Number.isInteger(p1) || !Number.isInteger(p2) || r1 === r2 || r1 * n >= 80 || r2 * n >= 80) return null; // no asset written off completely
    const base = `${rng.pick(FIRMS)} owns machinery costing ${inr(c1)} and furniture costing ${inr(c2)}, both bought at the start of year 1. Depreciation is provided on cost (straight line) at ${r1}% on the machinery and ${r2}% on the furniture, and credited to one Provision for Depreciation A/c. At the end of year ${n}, after that year's depreciation has been provided, the furniture is sold.`;
    if (rng.next() < 0.5) {
      return {
        prompt: `${base} What balance remains in the Provision for Depreciation A/c, relating to the machinery, after the furniture's share is transferred out?`,
        answer: rs(p1),
        commonErrors: errs(rs(p1), [
          { value: rs(p1 + p2), why: 'Gave the balance before the furniture\'s share was transferred out.' },
          { value: rs(p2), why: 'Gave the furniture\'s share, which is the amount transferred out.' },
          { value: rs(pc(c1, r1)), why: 'Gave one year\'s depreciation on the machinery instead of the total for all the years.' },
        ]),
        explanation: [
          `Machinery: ${inr(c1)} x ${r1}/100 x ${n} years = ${inr(p1)}.`,
          `Furniture: ${inr(c2)} x ${r2}/100 x ${n} years = ${inr(p2)}, which goes out with the sale.`,
          `Balance left for the machinery = ${inr(p1)}.`,
        ],
        hints: H_DEPR_PROVISION,
      };
    }
    return {
      prompt: `${base} What amount of the provision relates to the furniture and is transferred to the Asset Disposal A/c?`,
      answer: rs(p2),
      commonErrors: errs(rs(p2), [
        { value: rs(p1 + p2), why: 'Transferred the whole provision, including the machinery\'s share, which stays in the books.' },
        { value: rs(p1), why: 'Gave the machinery\'s share instead of the furniture\'s.' },
        { value: rs(pc(c2, r2)), why: 'Gave one year\'s depreciation on the furniture instead of the total for all the years.' },
      ]),
      explanation: [`Furniture: ${inr(c2)} x ${r2}/100 = ${inr(pc(c2, r2))} a year.`, `For ${n} years = ${inr(p2)}, which is transferred to Asset Disposal A/c.`],
      hints: H_DEPR_PROVISION,
    };
  },
  verify: (q) => {
    const [c1, c2] = amts(q.prompt);
    const [r1, r2] = pcts(q.prompt);
    const n = after(q.prompt, /end of year (\d+)/);
    const ans = q.answer / 100;
    return q.prompt.includes('relating to the machinery') ? ans * 100 === c1 * r1 * n : ans * 100 === c2 * r2 * n;
  },
});

// ---------------------------------------------------------------------------------------------------------------
// Counting items.
// ---------------------------------------------------------------------------------------------------------------

const COUNT_ITEMS: { text: string; charge: boolean }[] = [
  { text: 'provision for doubtful debts', charge: true },
  { text: 'depreciation on furniture', charge: true },
  { text: 'bad debts written off', charge: true },
  { text: 'provision for discount on debtors', charge: true },
  { text: 'provision for repairs and renewals', charge: true },
  { text: 'transfer to General Reserve', charge: false },
  { text: 'transfer to Workmen Compensation Reserve', charge: false },
  { text: 'transfer to Investment Fluctuation Reserve', charge: false },
  { text: 'transfer to a reserve for expansion', charge: false },
];

const countCharges = numericTemplate({
  id: 'pr-count-charges',
  topicId: T,
  conceptId: 'pr-difference',
  difficulty: 'medium',
  unit: 'number',
  generate: (rng) => {
    const picked = rng.shuffle(COUNT_ITEMS).slice(0, 5);
    const c = picked.filter((i) => i.charge).length;
    const named = picked.filter((i) => i.charge && i.text.startsWith('provision')).length;
    if (c < 1 || c > 4 || named === c || named === 5 - c || named < 1) return null;
    const list = picked.map((i, k) => `(${'abcde'[k]}) ${i.text}`).join('; ');
    return {
      prompt: `${rng.pick(FIRMS)} lists these items at the year end: ${list}. How many of them are charged against profit (debited in the Profit and Loss Account to find the net profit)?`,
      answer: c,
      commonErrors: [
        { value: 5 - c, why: 'Counted the appropriations instead of the charges.' },
        { value: named, why: 'Counted only the items called provisions, and left out depreciation and bad debts, which are also charges.' },
      ],
      explanation: [
        'Charges: provisions, depreciation and bad debts. Appropriations: transfers to reserves.',
        `Charges in the list: ${picked.filter((i) => i.charge).map((i) => i.text).join(', ')}.`,
        `So ${c} of the 5 are charged against profit.`,
      ],
    };
  },
  verify: (q) => COUNT_ITEMS.filter((i) => i.charge && q.prompt.includes(i.text)).length === q.answer,
});

// ---------------------------------------------------------------------------------------------------------------
// Entries.
// ---------------------------------------------------------------------------------------------------------------

const journalDepr = journalTemplate({
  id: 'pr-journal-depr-provision',
  version: 2,
  topicId: T,
  conceptId: 'pr-depn-provision',
  difficulty: 'easy',
  generate: (rng) => {
    const c = rng.step(100000, 800000, 10000);
    const r = rng.pick([5, 10, 15, 20]);
    const d = pc(c, r);
    if (!Number.isInteger(d)) return null;
    const asset = rng.pick(ASSETS);
    return {
      prompt: `${rng.pick(FIRMS)} bought ${asset} costing ${inr(c)}. It keeps the asset at cost and records depreciation in a Provision for Depreciation A/c at ${r}% of cost a year, which comes to ${inr(d)} for the first year. Pass the entry for that depreciation.`,
      lines: [
        { accountId: 'depreciation', side: 'Dr', amount: rs(d) },
        { accountId: 'provisionForDepreciation', side: 'Cr', amount: rs(d) },
      ],
      explanation: [
        `Depreciation = ${inr(c)} x ${r}/100 = ${inr(d)}, an expense: Depreciation A/c is debited.`,
        'The asset stays at cost, so the amount is credited to Provision for Depreciation A/c.',
      ],
      hints: H_DEPR_ENTRY,
      distractorAccounts: ['machinery', 'repairs', 'generalReserve'],
    };
  },
});

// The entries for the provision for doubtful debts debit or credit the Profit and Loss Account, which is not an
// account a journal question can offer, so these two ask the learner to choose the entry instead of building it.

const PL = 'Profit and Loss';
const PDD = 'Provision for Doubtful Debts';
const DEBTORS = 'Sundry Debtors';
/** A two-line entry written out in words, as it is read aloud: "X A/c Dr ₹n; To Y A/c ₹n". */
const entry = (dr: string, cr: string, x: number): string => `${dr} A/c Dr ${inr(x)}; To ${cr} A/c ${inr(x)}`;

const journalCreatePdd = mcqTemplate({
  id: 'pr-journal-create-pdd',
  topicId: T,
  conceptId: 'pr-pdd',
  difficulty: 'medium',
  generate: (rng) => {
    const d = rng.step(40000, 500000, 5000);
    const r = rng.pick(RATES);
    const n = pc(d, r);
    if (!Number.isInteger(n)) return null;
    const w = rng.pick(FIRMS);
    const hints = ['Work out the provision needed, then ask which account bears the charge.', 'A provision is charged to the Profit and Loss Account and credited to its own account; the debtors are not touched.'];
    if (rng.next() < 0.5) {
      return {
        prompt: `At the year end ${w} has debtors of ${inr(d)} after writing off all bad debts. It has no provision for doubtful debts so far and decides to create one at ${r}% of the debtors. Which entry creates the provision?`,
        correct: entry(PL, PDD, n),
        distractors: [
          { text: entry(PDD, PL, n), why: 'Reversed the entry: this would write a provision back to profit, not create one.' },
          { text: entry(PL, DEBTORS, n), why: 'Credited the debtors; they stay in the books at the full amount and the provision is kept in its own account.' },
          { text: entry('Bad Debts', DEBTORS, n), why: 'Treated a loss that is only likely as debts already proved bad, and wrote them off.' },
          { text: entry('General Reserve', PDD, n), why: 'Took the provision out of a reserve; a provision is a charge against the profit of the year.' },
        ],
        explanation: `Provision = ${inr(d)} x ${r}/100 = ${inr(n)}. It is a charge against profit, so the Profit and Loss Account is debited, and it is credited to Provision for Doubtful Debts A/c, which is shown as a deduction from the debtors.`,
        hints,
      };
    }
    const shortfall = rng.step(500, 6000, 500);
    const o = n - shortfall;
    if (shortfall * 2 > n) return null; // the old balance is at least half of what is now needed
    return {
      prompt: `The Provision for Doubtful Debts A/c of ${w} has a credit balance of ${inr(o)} brought forward. No bad debts arose during the year. Debtors at the year end are ${inr(d)}, and the provision is to be ${r}% of them. Which entry brings the provision to the amount needed?`,
      correct: entry(PL, PDD, shortfall),
      distractors: [
        { text: entry(PL, PDD, n), why: 'Charged the whole of the provision needed and ignored the balance already in the account.' },
        { text: entry(PDD, PL, shortfall), why: 'Reversed the entry: the provision has to rise, so its account is credited and profit is charged.' },
        { text: entry(PL, PDD, n + o), why: 'Added the old balance to the provision needed instead of charging only the shortfall.' },
        { text: entry(PL, DEBTORS, shortfall), why: 'Credited the debtors; they stay in the books at the full amount and the provision is kept in its own account.' },
      ],
      explanation: `Provision needed = ${inr(d)} x ${r}/100 = ${inr(n)}. The account already holds ${inr(o)}, so only ${inr(n)} - ${inr(o)} = ${inr(shortfall)} more is charged: Profit and Loss A/c is debited and Provision for Doubtful Debts A/c is credited.`,
      hints,
    };
  },
  verify: (q) => {
    const a = amts(q.prompt);
    const [r] = pcts(q.prompt);
    const right = q.options.find((o) => o.id === q.correct)?.text;
    // With a balance brought forward the amounts are old provision, then debtors; otherwise the debtors alone.
    const charge = q.prompt.includes('brought forward') ? (a[1] * r) / 100 - a[0] : (a[0] * r) / 100;
    return charge > 0 && right === `Profit and Loss A/c Dr ${inr(charge)}; To Provision for Doubtful Debts A/c ${inr(charge)}`;
  },
});

const journalExcessPdd = mcqTemplate({
  id: 'pr-journal-pdd-excess',
  topicId: T,
  conceptId: 'pr-pdd',
  difficulty: 'complex',
  generate: (rng) => {
    const d = rng.step(40000, 300000, 5000);
    const r = rng.pick(RATES);
    const n = pc(d, r);
    const excess = rng.step(500, 6000, 500);
    const o = n + excess;
    if (!Number.isInteger(n) || excess >= n) return null;
    return {
      prompt: `The Provision for Doubtful Debts A/c of ${rng.pick(FIRMS)} has an old credit balance of ${inr(o)}. No bad debts arose during the year. Debtors at the year end are ${inr(d)}, and the provision is to be ${r}% of them. Which entry adjusts the provision at the year end?`,
      correct: entry(PDD, PL, excess),
      distractors: [
        { text: entry(PL, PDD, excess), why: 'Reversed the entry: the account holds more than is needed, so the excess goes back to profit.' },
        { text: entry(PL, PDD, n), why: 'Charged the provision needed in full and ignored the larger balance already in the account.' },
        { text: entry(PDD, PL, o), why: 'Wrote back the whole old provision and left nothing for the debtors that are still doubtful.' },
        { text: entry(PDD, PL, n), why: 'Wrote back the provision needed instead of the excess of the old balance over it.' },
        { text: entry(PDD, DEBTORS, excess), why: 'Credited the debtors; a change in the provision does not alter what the debtors owe.' },
      ],
      explanation: `Provision needed = ${inr(d)} x ${r}/100 = ${inr(n)}. The account holds ${inr(o)}, which is ${inr(o)} - ${inr(n)} = ${inr(excess)} too much. The excess is written back: Provision for Doubtful Debts A/c is debited and the Profit and Loss Account is credited, which raises the profit.`,
      hints: ['Compare the provision needed now with the balance already in the account.', 'A provision that is no longer needed is written back: the provision account is debited and profit is credited.'],
    };
  },
  verify: (q) => {
    const [o, d] = amts(q.prompt);
    const [r] = pcts(q.prompt);
    const right = q.options.find((x) => x.id === q.correct)?.text;
    const excess = o - (d * r) / 100;
    return excess > 0 && right === `Provision for Doubtful Debts A/c Dr ${inr(excess)}; To Profit and Loss A/c ${inr(excess)}`;
  },
});

const templates: Template[] = [
  prOrRes,
  chargeOrApp,
  revOrCap,
  genOrSpec,
  namedReserve,
  featureBelongs,
  whichStatement,
  whichReduces,
  secretReserve,
  profitStatement,
  pddAmount,
  pddAfterBad,
  pddRate,
  pddCharge,
  pddWriteback,
  debtorsNet,
  pddChargeDebtors,
  pddNetCredit,
  pddDiscount,
  reserveTransfer,
  reserveBalance,
  profitFromReserve,
  capitalProfit,
  profitAfterBoth,
  deprBalance,
  deprTwoAssets,
  countCharges,
  journalDepr,
  journalCreatePdd,
  journalExcessPdd,
];

// ---------------------------------------------------------------------------------------------------------------
// Sets of entries ("Journalise the following transactions").
// ---------------------------------------------------------------------------------------------------------------
// Profit and Loss A/c is an account of the chart now, so the entries for a provision can be built, not only chosen.
//
// Bad debts in a year in which a provision already stands are written in two ways. Most books for this course set
// them off against the provision, which was made to meet them, and charge Profit and Loss A/c with what the provision
// is then short of the amount needed; others transfer them to Profit and Loss A/c and only bring the provision from
// its old amount to the new. The net charge is the same either way ("bad debts + new provision - old provision",
// card 10) but the entries are not, and the rest of the bank takes no side: it asks an entry on a provision that
// stands only when no debt went bad in the year, or when the prompt says what was done with the bad debts
// (`faa-entry-provision` sets them off). So the set on doubtful debts says in its opening line that the bad debts of
// a year are set off against the provision, and its last item gives what the account shows after that: the entry
// that brings the provision to the amount needed is then "needed less held" whichever way a student was taught.
//
// The chart has no Provision for Repairs, Provision for Taxation or Profit and Loss Appropriation account. The
// year-end set therefore keeps to the two provisions it can write (depreciation and doubtful debts) and makes the
// transfer to General Reserve from Profit and Loss A/c itself, as a sole proprietor's books do; its opening line
// says so, and the explanation says that the transfer is an appropriation whatever the account debited is called.

const line = (accountId: string, side: 'Dr' | 'Cr', n: number): JournalLine => ({ accountId, side, amount: rs(n) });
const PL_ID = 'profitAndLoss';
const PDD_ID = 'provisionForDoubtfulDebts';

/** What an entry of a set debits or credits to the accounts named, in rupees ("debtor:" names every debtor). */
const moved = (e: { expected: JournalLine[] }, side: 'Dr' | 'Cr', ...ids: string[]): number =>
  e.expected
    .filter((l) => l.side === side && ids.some((id) => (id.endsWith(':') ? l.accountId.startsWith(id) : l.accountId === id)))
    .reduce((sum, l) => sum + l.amount, 0) / 100;

/** The months a dated transaction can fall in, in the order of the accounting year; March is left to the year end. */
const YEAR_MONTHS = ['April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December', 'January', 'February'];
/** `count` dates in order within the accounting year that starts on 1 April `y`, each in a month of its own. */
function datesInYear(rng: Rng, y: number, count: number): string[] {
  return rng
    .shuffle(YEAR_MONTHS.map((_, k) => k))
    .slice(0, count)
    .sort((a, b) => a - b)
    .map((k) => `${rng.int(2, 28)} ${YEAR_MONTHS[k]} ${k >= 9 ? y + 1 : y}`);
}

/** A transaction that still needs its date. */
type Undated = Pick<SetTransaction, 'text' | 'lines' | 'explanation'>;

/**
 * A debt that proves bad: lost in full, or settled for so many paise in the rupee with the rest written off. No more
 * than `most` rupees are lost (a whole number of thousands, 2,000 or more). `provided` says a provision stands by
 * then, so the explanation adds what becomes of the loss at the year end.
 */
function badDebt(rng: Rng, name: string, provided: boolean, most = 22500): { tx: Undated; lost: number; full: boolean } {
  const later = provided ? ' It stays in Bad Debts A/c until the year end, when the bad debts of the year are set off against the provision.' : '';
  if (rng.int(0, 2) === 0) {
    const owed = rng.step(6000, 30000, 2000);
    const paise = rng.pick([25, 40, 50, 60, 75]);
    const got = pc(owed, paise);
    const lost = owed - got;
    if (lost <= most) {
      return {
        lost,
        full: false,
        tx: {
          text: `${name}, a customer who owed ${inr(owed)}, was declared insolvent. A cheque for ${paise} paise in the rupee was received in full settlement and the rest of the debt was written off.`,
          lines: [line('bank', 'Dr', got), line('badDebts', 'Dr', lost), line(debtor(name), 'Cr', owed)],
          explanation: [
            `${paise} paise in the rupee on ${inr(owed)} is ${inr(owed)} x ${paise}/100 = ${inr(got)}, received by cheque: Bank A/c is debited.`,
            `The rest, ${inr(owed)} - ${inr(got)} = ${inr(lost)}, is lost for certain: Bad Debts A/c is debited.${later}`,
            `Nothing more can be claimed from ${name}: the account of ${name} is credited with the whole ${inr(owed)} and so closed.`,
          ],
        },
      };
    }
  }
  const owed = rng.step(2000, Math.min(15000, most), 500);
  return {
    lost: owed,
    full: true,
    tx: {
      text: `${name}, a customer who owed ${inr(owed)}, was declared insolvent. Nothing could be recovered and the debt was written off.`,
      lines: [line('badDebts', 'Dr', owed), line(debtor(name), 'Cr', owed)],
      explanation: [
        `The debt is lost for certain, which is a loss of the year: Bad Debts A/c is debited.${later}`,
        `Nothing more can be claimed from ${name}: the account of ${name} is credited and so closed.`,
      ],
    },
  };
}

// 1. Bad debts and the provision for doubtful debts over two years.
const setDoubtfulDebts = journalSetTemplate({
  id: 'pr-set-doubtful-debts-two-years',
  version: 2,
  topicId: T,
  conceptId: 'pr-sets',
  difficulty: 'medium',
  generate: (rng) => {
    const y = rng.int(2021, 2024); // the first year runs from 1 April y to 31 March y + 1
    const firm = rng.pick(FIRMS);
    const [name1, name2, name3, name4] = rng.shuffle(PARTIES);
    // The first provision is large enough to meet the bad debts of the year after it.
    const r1 = rng.pick([4, 5, 10]);
    const r2 = rng.int(0, 2) === 0 ? rng.pick([2, 4, 5, 10].filter((r) => r !== r1)) : r1;
    const d1 = rng.step(200000, 600000, 20000);
    // A year later the debtors are somewhat higher or lower, not a different business.
    const d2 = Math.max(120000, d1 + 20000 * rng.int(-6, 8));
    const p1 = pc(d1, r1);
    const p2 = pc(d2, r2);
    const firstYearBad = rng.int(0, 3) > 0;
    // Version 2: the bad debts of the second year are always set off against the provision by an entry the set asks
    // for (version 1 sometimes only told of it, leaving Bad Debts A/c open). The set keeps to four or five entries.
    const more = ['setOff', ...rng.shuffle(['recovery', 'second'] as const).slice(0, firstYearBad ? 0 : rng.int(0, 1))];
    const end1 = `31 March ${y + 1}`;
    const end2 = `31 March ${y + 2}`;
    const transactions: SetTransaction[] = [];

    // The first year: perhaps a bad debt, then the provision is created.
    const bad1 = firstYearBad ? badDebt(rng, name1, false) : null;
    if (bad1) transactions.push({ date: datesInYear(rng, y, 1)[0], ...bad1.tx });
    transactions.push({
      date: end1,
      text: `Debtors stood at ${inr(d1)}${bad1 ? ' after the bad debt of the year had been written off and charged to Profit and Loss A/c' : '; no debt had proved bad during the year'}. A provision for doubtful debts was created for the first time, at ${r1}% of the debtors.`,
      lines: [line(PL_ID, 'Dr', p1), line(PDD_ID, 'Cr', p1)],
      explanation: [
        `Provision = ${r1}% of ${inr(d1)} = ${inr(p1)}. A provision is a charge against the profit of the year: Profit and Loss A/c is debited.`,
        'The debtors stay in the books at their full amount: the credit goes to Provision for Doubtful Debts A/c, which is deducted from them in the balance sheet.',
      ],
    });

    // The second year: bad debts that the provision can meet, perhaps a recovery, then the year end.
    const two = more.includes('second');
    const most = Math.floor((p1 * 3) / 4 / (two ? 2 : 1) / 1000) * 1000;
    const bad2 = badDebt(rng, name2, true, most);
    const bad3 = two ? badDebt(rng, name3, true, most) : null;
    // Two debts of the same amount would read like one told twice.
    if (bad2.lost === bad1?.lost || bad2.lost === bad3?.lost) return null;
    const during: Undated[] = [bad2.tx, ...(bad3 ? [bad3.tx] : [])];
    let stranger: string | null = null; // someone whose debt was written off before the set begins
    if (more.includes('recovery')) {
      const old = bad1?.full ? bad1 : null; // only a debt written off in full can come back later
      const who = old ? name1 : name4;
      const got = old ? rng.step(1000, old.lost, 500) : rng.step(1000, 8000, 500);
      if (got === bad2.lost || got === bad3?.lost) return null; // not the figure of a debt lost in the same year
      if (!old) stranger = who;
      during.push({
        text: `Received a cheque for ${inr(got)} from ${who}, whose debt had been written off as bad ${old ? `in the year ended ${end1}` : 'some years ago'}.`,
        lines: [line('bank', 'Dr', got), line('badDebtsRecovered', 'Cr', got)],
        explanation: [
          'The money goes into the bank: Bank A/c is debited.',
          `The account of ${who} was closed when the debt was written off, so it is not credited now. The amount is a gain of this year: Bad Debts Recovered A/c is credited.`,
        ],
      });
    }
    const order = rng.shuffle(during);
    const dates = datesInYear(rng, y + 1, order.length);
    order.forEach((tx, i) => transactions.push({ date: dates[i], ...tx }));

    const lost2 = bad2.lost + (bad3?.lost ?? 0);
    const left = p1 - lost2;
    if (p2 === left) return null; // nothing to enter at the second year end
    const badDebts2 = `${bad3 ? `${inr(bad2.lost)} + ${inr(bad3.lost)} = ` : ''}${inr(lost2)}`;
    if (more.includes('setOff')) {
      transactions.push({
        date: end2,
        text: `Closed Bad Debts A/c by setting the bad debts of the year ended ${end2} off against the provision for doubtful debts.`,
        lines: [line(PDD_ID, 'Dr', lost2), line('badDebts', 'Cr', lost2)],
        explanation: [
          `Bad debts written off in the year = ${badDebts2}. The provision was made last year to meet just such losses, so it is now used for them: Provision for Doubtful Debts A/c is debited.`,
          `Bad Debts A/c is credited with the same amount and so closed. The provision is left with ${inr(p1)} - ${inr(lost2)} = ${inr(left)}.`,
        ],
      });
    }
    const diff = Math.abs(p2 - left);
    transactions.push({
      date: end2,
      text: `Debtors stood at ${inr(d2)} after the bad debts of the year had been written off, and Provision for Doubtful Debts A/c showed ${inr(left)} after those bad debts had been set off against it. The provision is ${r2 === r1 ? `to be kept at ${r2}%` : `now to be ${r2}%`} of the debtors.`,
      lines: p2 > left ? [line(PL_ID, 'Dr', diff), line(PDD_ID, 'Cr', diff)] : [line(PDD_ID, 'Dr', diff), line(PL_ID, 'Cr', diff)],
      explanation: [
        `Provision needed = ${r2}% of ${inr(d2)} = ${inr(p2)}. The account holds ${inr(left)}: the ${inr(p1)} created on ${end1} less the bad debts of ${inr(lost2)} set off against it.`,
        p2 > left
          ? `It has to rise by ${inr(p2)} - ${inr(left)} = ${inr(diff)}: Profit and Loss A/c is debited and Provision for Doubtful Debts A/c is credited. This is the whole charge of the year: bad debts ${inr(lost2)} + new provision ${inr(p2)} - old provision ${inr(p1)} = ${inr(diff)}.`
          : `It holds ${inr(left)} - ${inr(p2)} = ${inr(diff)} more than is needed. The excess is written back: Provision for Doubtful Debts A/c is debited and Profit and Loss A/c is credited, which raises the profit. For the year as a whole that is a net credit: old provision ${inr(p1)} - bad debts ${inr(lost2)} - new provision ${inr(p2)} = ${inr(diff)}.`,
      ],
    });

    return {
      opening: `${firm} sells on credit and closes its books on 31 March. It had no provision for doubtful debts before ${end1}. A debt that proves bad is written off to Bad Debts A/c. Once a provision stands, the bad debts of a year are set off against it at the year end, and the provision is then brought to the amount needed through Profit and Loss A/c. Money received comes by cheque.`,
      transactions,
      hints: [
        'A bad debt is a loss that has happened: it goes to Bad Debts A/c. A provision is for debts that are only doubtful.',
        'At the second year end, compare the provision needed with what the account holds after the bad debts were set off against it. Only the difference is entered.',
      ],
      // The account of a customer whose debt comes back is the one a student wrongly credits.
      distractorAccounts: ['badDebtsRecovered', 'discountAllowed', 'sales', ...(stranger ? [debtor(stranger)] : [])],
    };
  },
  // Walked again from the texts: every debt leaves the books at what was owed, the bad debts set off are those of the
  // year, the provision account shows what the last item says it does, and after each year-end entry on the
  // provision it is the stated percentage of the stated debtors.
  verify: (q: JournalSetQuestion) => {
    let held = 0;
    let bad = 0;
    let setOff = 0;
    let yearEnds = 0;
    let closed = false;
    for (const e of q.entries) {
      const atYearEnd = e.date?.startsWith('31 March') ?? false;
      if (!atYearEnd && closed) bad = 0; // a new year: the bad debts of the last one are behind us
      closed = atYearEnd;
      const owed = moved(e, 'Cr', 'debtor:');
      if (owed > 0) {
        const paise = after(e.text, /for (\d+) paise in the rupee/);
        const got = Number.isNaN(paise) ? 0 : (owed * paise) / 100;
        if (amts(e.text)[0] !== owed || moved(e, 'Dr', 'bank') !== got || moved(e, 'Dr', 'badDebts') !== owed - got) return false;
        bad += owed - got;
      }
      const recovered = moved(e, 'Cr', 'badDebtsRecovered');
      if (recovered > 0 && (amts(e.text)[0] !== recovered || moved(e, 'Dr', 'bank') !== recovered)) return false;
      const transferred = moved(e, 'Cr', 'badDebts');
      if (transferred > 0) {
        // Bad debts go against the provision, never more of them than it holds, and only once a provision stands.
        if (!atYearEnd || yearEnds !== 1 || transferred !== bad || transferred >= held || moved(e, 'Dr', PDD_ID) !== transferred) return false;
        setOff = transferred;
        continue;
      }
      const charged = moved(e, 'Dr', PL_ID) - moved(e, 'Cr', PL_ID);
      if (charged !== 0) {
        if (!atYearEnd || moved(e, 'Cr', PDD_ID) - moved(e, 'Dr', PDD_ID) !== charged) return false;
        yearEnds++;
        const [debtors, shown] = amts(e.text);
        const [rate] = pcts(e.text);
        if (yearEnds === 2) {
          // The balance the item gives is the first provision less the bad debts of the second year.
          if (shown !== held - bad || shown <= 0 || (setOff !== 0 && setOff !== bad)) return false;
          held = shown;
        }
        held += charged;
        if (held * 100 !== debtors * rate) return false;
      }
    }
    return yearEnds === 2 && held > 0;
  },
});

// 2. The year end: charges against profit (depreciation, doubtful debts) and an appropriation of profit (reserve).
interface YearEndAsset {
  id: string;
  /** The account, as the journal names it. */
  account: string;
  item: string;
  the: string;
  held: string;
}
const YEAR_END_ASSETS: YearEndAsset[] = [
  { id: 'machinery', account: 'Machinery A/c', item: 'a machine', the: 'the machine', held: 'its machinery' },
  { id: 'furniture', account: 'Furniture A/c', item: 'furniture for its showroom', the: 'the furniture', held: 'its furniture' },
  { id: 'vehicles', account: 'Vehicles A/c', item: 'a delivery van', the: 'the van', held: 'its delivery van' },
  { id: 'officeEquipment', account: 'Office Equipment A/c', item: 'office equipment', the: 'the office equipment', held: 'its office equipment' },
];
/**
 * What a year-end set holds, in order: A the asset is bought, D depreciation is provided, X Depreciation A/c is
 * closed, Q the provision for doubtful debts, G the transfer to General Reserve, C the rest of the profit to capital.
 * Every one has a charge (D or Q) before the appropriation (G).
 */
const YEAR_END_SHAPES = ['DQG', 'QDG', 'ADG', 'ADQG', 'AQDG', 'DQGC', 'QDGC', 'ADGC', 'QGC', 'DXG', 'DXGC', 'ADXG', 'DGC'];

const setYearEnd = journalSetTemplate({
  id: 'pr-set-year-end-charges-and-reserve',
  topicId: T,
  conceptId: 'pr-sets',
  difficulty: 'easy',
  generate: (rng) => {
    const y = rng.int(2021, 2025);
    const firm = rng.pick(FIRMS);
    const shape = rng.pick(YEAR_END_SHAPES);
    const end = `31 March ${y + 1}`;
    const a = rng.pick(YEAR_END_ASSETS);
    const bought = shape.includes('A');
    const half = bought && rng.int(0, 2) === 0; // bought on 1 October: half a year of use
    const months = half ? 6 : 12;
    const cost = rng.step(100000, 600000, 20000);
    const rate = rng.pick([5, 10, 15, 20]);
    const dep = (cost * rate * months) / 1200;
    const debtors = rng.step(100000, 500000, 10000);
    const pddRate = rng.pick([2, 3, 4, 5]);
    const needed = pc(debtors, pddRate);
    // Half the time a provision already stands, at a round figure well below what is now needed.
    const old = rng.int(0, 1) === 0 ? 0 : Math.floor((needed * rng.pick([40, 50, 60, 75])) / 100 / 500) * 500;
    const charge = needed - old;
    const profit = rng.step(150000, 600000, 10000);
    const share = rng.pick([5, 10, 15, 20, 25]);
    const reserve = pc(profit, share);
    const make: Record<string, () => SetTransaction> = {
      A: () => ({
        date: `1 ${half ? 'October' : 'April'} ${y}`,
        text: `Bought ${a.item} for ${inr(cost)}, paid by cheque.`,
        lines: [line(a.id, 'Dr', cost), line('bank', 'Cr', cost)],
        explanation: [`It is bought to be used in the business, not to be sold again, so it is an asset: ${a.account} is debited with its cost.`, 'It was paid for by cheque: Bank A/c is credited.'],
      }),
      D: () => ({
        date: end,
        text: bought
          ? `Provided depreciation on ${a.the} for the year.`
          : `Provided depreciation for the year on ${a.held}, which cost ${inr(cost)} and was in use throughout the year.`,
        lines: [line('depreciation', 'Dr', dep), line('provisionForDepreciation', 'Cr', dep)],
        explanation: [
          `${half ? `From 1 October ${y} to ${end} is 6 months of use: ${rate}% of ${inr(cost)} x 6/12 = ${inr(dep)}` : `Depreciation = ${rate}% of ${inr(cost)} = ${inr(dep)}`}. It is a charge against profit, made whether or not the year shows a profit: Depreciation A/c, an expense, is debited.`,
          `${a.account} stays at cost: the credit goes to Provision for Depreciation A/c.`,
        ],
      }),
      X: () => ({
        date: end,
        text: 'Closed Depreciation A/c by transfer to Profit and Loss A/c.',
        lines: [line(PL_ID, 'Dr', dep), line('depreciation', 'Cr', dep)],
        explanation: [`This is how the charge of ${inr(dep)} reaches the profit: Profit and Loss A/c is debited before the net profit is found.`, 'Depreciation A/c is credited and so closed.'],
      }),
      Q: () => ({
        date: end,
        text:
          old === 0
            ? `Debtors stood at ${inr(debtors)}. A provision for doubtful debts, the first the firm has made, was created at ${pddRate}% of them.`
            : `Debtors stood at ${inr(debtors)} and no debt had proved bad in the year. The provision for doubtful debts, which stood at ${inr(old)}, was raised to ${pddRate}% of the debtors.`,
        lines: [line(PL_ID, 'Dr', charge), line(PDD_ID, 'Cr', charge)],
        explanation: [
          `Provision needed = ${pddRate}% of ${inr(debtors)} = ${inr(needed)}${old === 0 ? '' : `; the account holds ${inr(old)}, so ${inr(needed)} - ${inr(old)} = ${inr(charge)} more is needed`}. A provision is a charge against profit: Profit and Loss A/c is debited before the net profit is found.`,
          'The debtors stay at their full amount: the credit goes to Provision for Doubtful Debts A/c.',
        ],
      }),
      G: () => ({
        date: end,
        text: `After every charge of the year, Profit and Loss A/c showed a net profit of ${inr(profit)}. Transferred ${share}% of it to General Reserve.`,
        lines: [line(PL_ID, 'Dr', reserve), line('generalReserve', 'Cr', reserve)],
        explanation: [
          `Transfer = ${share}% of ${inr(profit)} = ${inr(reserve)}. It is an appropriation of profit, not a charge against it: it is made out of the net profit after that has been found, and the net profit stays ${inr(profit)}. Profit and Loss A/c is debited only because this firm keeps no Profit and Loss Appropriation A/c; the name of the account debited does not turn the transfer into a charge.`,
          'The amount is kept in the business as part of the owner\'s funds: General Reserve A/c is credited.',
        ],
      }),
      C: () => ({
        date: end,
        text: 'Transferred the rest of the net profit to the Capital A/c of the proprietor.',
        lines: [line(PL_ID, 'Dr', profit - reserve), line('capital', 'Cr', profit - reserve)],
        explanation: [
          `Net profit left after the transfer to reserve = ${inr(profit)} - ${inr(reserve)} = ${inr(profit - reserve)}: Profit and Loss A/c is debited and so closed.`,
          'The profit belongs to the proprietor: Capital A/c is credited.',
        ],
      }),
    };
    const depreciates = shape.includes('D');
    return {
      opening:
        `${firm} is the business of a sole proprietor and closes its books on ${end}.`
        + (depreciates ? ` It keeps its fixed assets at cost and credits depreciation, at ${rate}% a year on cost${bought ? ' for the period of use in whole months from the date of purchase' : ''}, to Provision for Depreciation A/c.` : '')
        + ' It keeps no Profit and Loss Appropriation A/c: an appropriation of profit is debited to Profit and Loss A/c itself, after the net profit has been found.',
      transactions: [...shape].map((step) => make[step]()),
      hints: [
        'A charge against profit (depreciation, a provision) is made before the net profit is found; an appropriation (a transfer to reserve) is made out of the net profit.',
        'Work each amount from the figures given: the rate on the cost or on the debtors, the percentage of the net profit.',
      ],
      distractorAccounts: ['capital', 'drawings', 'outstandingExpenses', 'badDebts', ...(depreciates ? [a.id] : [])],
    };
  },
  // Every amount worked again from the texts and the opening line.
  verify: (q: JournalSetQuestion) => {
    const rate = after(q.prompt, /at (\d+)% a year on cost/);
    let cost = 0;
    let months = 12;
    let dep = 0;
    let profit = 0;
    let reserve = 0;
    for (const e of q.entries) {
      const debit = moved(e, 'Dr', PL_ID);
      const boughtFor = moved(e, 'Dr', 'machinery', 'furniture', 'vehicles', 'officeEquipment');
      if (boughtFor > 0) {
        if (amts(e.text)[0] !== boughtFor || moved(e, 'Cr', 'bank') !== boughtFor) return false;
        cost = boughtFor;
        months = e.date?.startsWith('1 October') ? 6 : 12;
      }
      const charged = moved(e, 'Dr', 'depreciation');
      if (charged > 0) {
        cost ||= amts(e.text)[0];
        if (charged * 1200 !== cost * rate * months || moved(e, 'Cr', 'provisionForDepreciation') !== charged) return false;
        dep = charged;
      }
      const closedWith = moved(e, 'Cr', 'depreciation');
      if (closedWith > 0 && (closedWith !== dep || debit !== dep)) return false;
      const provided = moved(e, 'Cr', PDD_ID);
      if (provided > 0) {
        const [debtors, old = 0] = amts(e.text);
        if ((provided + old) * 100 !== debtors * pcts(e.text)[0] || debit !== provided) return false;
      }
      const toReserve = moved(e, 'Cr', 'generalReserve');
      if (toReserve > 0) {
        [profit] = amts(e.text);
        reserve = toReserve;
        if (reserve * 100 !== profit * pcts(e.text)[0] || debit !== reserve) return false;
      }
      const toCapital = moved(e, 'Cr', 'capital');
      if (toCapital > 0 && (reserve === 0 || toCapital !== profit - reserve || debit !== toCapital)) return false;
    }
    return reserve > 0;
  },
});

const sets: JournalSetTemplate[] = [setDoubtfulDebts, setYearEnd];

// ---------------------------------------------------------------------------------------------------------------
// Formats: the accounts behind bad and doubtful debts, which the student prepares row by row.
// ---------------------------------------------------------------------------------------------------------------
// The convention is the one the set on doubtful debts fixes and states (see above): a debt that proves bad is written
// off to Bad Debts A/c; where a provision stands, the bad debts of the year are set off against it at the year end
// and the provision is then brought to the amount needed through Profit and Loss A/c; where none stands, Bad Debts
// A/c is closed to Profit and Loss A/c. Each format says so in its data, so that only one account is defensible.
//
// Bad Debts A/c opens and closes within a year. Provision for Doubtful Debts A/c runs on, so it is asked for two
// years in one account, balanced on each 31 March and brought down on each 1 April (`ledgerPeriods`): in some seeds
// the provision is created at the first year end (the bad debts of that year, when no provision stood, go to Profit
// and Loss A/c and have no row in it), in the others it already stands when the first year opens.
//
// The rows come from the dated entries. `verify` reads the data again line by line and year by year: what was lost
// on each debt, the provision held and the provision needed, and the charge of the year by the formula of card 10
// (bad debts + new provision - old provision).

const BAD_DEBTS_AC = 'Bad Debts A/c';
const PL_AC = 'Profit and Loss A/c';
const PDD_AC = 'Provision for Doubtful Debts A/c';

/** What was lost on each debt that the data says proved bad, read from its own line: the customer and the rupees. */
function lossesIn(lines: string[]): { name: string; lost: number }[] {
  return lines
    .filter((t) => t.includes('declared insolvent'))
    .map((t) => {
      const owed = amts(t)[0];
      const paise = after(t, /for (\d+) paise in the rupee/);
      return { name: /: (.+?), a customer who owed/.exec(t)?.[1] ?? '', lost: owed - (Number.isNaN(paise) ? 0 : (owed * paise) / 100) };
    });
}

/** The rows of one side of an account as "particulars|paise", in order, for comparing with the rows worked out again. */
const rowKeys = (rows: { label: string; amounts: number[] }[]): string => rows.map((r) => `${r.label}|${r.amounts[0]}`).sort().join(';');
const wantKeys = (rows: [string, number][]): string => rowKeys(rows.map(([label, n]) => ({ label, amounts: [rs(n)] })));

/** A cheque for a debt written off in an earlier year: it belongs in Bad Debts Recovered A/c, and in neither of these accounts. */
function recoveryOf(rng: Rng, name: string): { got: number; tx: Undated } {
  const got = rng.step(1000, 8000, 500);
  return {
    got,
    tx: {
      text: `Received a cheque for ${inr(got)} from ${name}, whose debt had been written off as bad some years ago.`,
      lines: [line('bank', 'Dr', got), line('badDebtsRecovered', 'Cr', got)],
      explanation: [],
    },
  };
}

/** How the working tells one bad debt: the whole of it lost, or what is left after a part was received. */
function lossStep(d: { tx: Undated; lost: number; full: boolean }, name: string): string {
  const owed = d.tx.lines.find((l) => l.side === 'Cr')!.amount / 100;
  return d.full
    ? `${name}: the whole debt of ${inr(owed)} is lost.`
    : `${name}: ${inr(owed - d.lost)} of the ${inr(owed)} owed was received, so the bad debt is the rest, ${inr(owed)} - ${inr(owed - d.lost)} = ${inr(d.lost)}. The cheque is debited to Bank A/c.`;
}

// 1. pr-fmt-bad-debts: Bad Debts A/c of a year, closed against the provision where one stands, or to Profit and Loss A/c (easy)
const fmtBadDebts = accountTemplate({
  id: 'pr-fmt-bad-debts',
  topicId: T,
  conceptId: 'pr-formats',
  difficulty: 'easy',
  generate: (rng) => {
    const y = rng.int(2021, 2025);
    const firm = rng.pick(FIRMS);
    const names = rng.shuffle(PARTIES);
    const provided = rng.int(0, 4) < 3;
    // Three or four debts: with the closing transfer the account has four or five rows, and never only three.
    const n = rng.pick([3, 3, 4]);
    const provision = rng.step(8000 * n, 60000, 4000);
    // Where a provision stands, it is large enough to meet the bad debts of the year.
    const most = provided ? Math.floor((provision * 3) / 4 / n / 1000) * 1000 : 22500;
    const debts = names.slice(0, n).map((name) => ({ name, ...badDebt(rng, name, provided, most) }));
    // Two debts of the same amount would read like one told twice.
    if (new Set(debts.map((d) => d.lost)).size < n) return null;
    const total = debts.reduce((s, d) => s + d.lost, 0);
    const recovery = rng.int(0, 2) === 0 ? recoveryOf(rng, names[n]) : null;
    if (recovery && debts.some((d) => d.lost === recovery.got)) return null;
    const order = rng.shuffle([...debts.map((d) => d.tx), ...(recovery ? [recovery.tx] : [])]);
    const dates = datesInYear(rng, y, order.length);
    const byDate = order.flatMap((tx) => debts.filter((d) => d.tx === tx));
    const end = `31 March ${y + 1}`;
    const entries: DatedEntry[] = [
      ...order.map((tx, i) => ({ date: dates[i], lines: tx.lines })),
      { date: end, lines: [line(provided ? PDD_ID : PL_ID, 'Dr', total), line('badDebts', 'Cr', total)] },
    ];
    const view = accountOf(entries, 'badDebts');
    if (view.balance) return null;
    return {
      task: `Prepare Bad Debts A/c of ${firm} for the year ended ${end} and close it.`,
      data: [
        `${firm} sells on credit and closes its books on 31 March. A debt that proves bad is written off to Bad Debts A/c. ${
          provided
            ? `Provision for Doubtful Debts A/c stood at ${inr(provision)} on 1 April ${y}, and at the year end the bad debts of the year are set off against the provision.`
            : 'The firm keeps no provision for doubtful debts: at the year end Bad Debts A/c is closed by transfer to Profit and Loss A/c.'
        } Money received comes by cheque.`,
        ...order.map((tx, i) => `${dates[i]}: ${tx.text}`),
      ].join('\n'),
      title: BAD_DEBTS_AC,
      ...ledgerSides(view, { closeOn: end }),
      distractors: [BAD_DEBTS_AC, 'Bank A/c', 'Bad Debts Recovered A/c', provided ? PL_AC : PDD_AC, BALANCE_CD, ...(recovery ? [`${names[n]} A/c`] : [])],
      explanation: [
        ...order.map((tx) => {
          const d = debts.find((x) => x.tx === tx);
          return d
            ? `${lossStep(d, d.name)} Bad Debts A/c is debited and the account of ${d.name} credited: "To ${d.name} A/c ${inr(d.lost)}".`
            : `The cheque from ${names[n]} is for a debt written off in an earlier year. It is a gain of this year, credited to Bad Debts Recovered A/c: it has no row in Bad Debts A/c.`;
        }),
        `Bad debts of the year = ${byDate.map((d) => inr(d.lost)).join(' + ')} = ${inr(total)}.`,
        provided
          ? `A provision of ${inr(provision)} stands, made to meet just such losses, so the bad debts are set off against it on ${end}: Provision for Doubtful Debts A/c is debited and Bad Debts A/c credited, "By ${PDD_AC} ${inr(total)}".`
          : `No provision stands, so the loss is charged to the profit of the year on ${end}: Profit and Loss A/c is debited and Bad Debts A/c credited, "By ${PL_AC} ${inr(total)}".`,
        `Both sides total ${inr(total)}: the account is closed, and there is no balance to carry down.`,
      ],
      hints: [
        'Bad Debts A/c is debited with what is actually lost on each debt. If a part of a debt was received, only the rest is lost.',
        'At the year end the account is closed. Read the first line of the data: does a provision stand to take the bad debts, or do they go to Profit and Loss A/c?',
      ],
    };
  },
  verify: (q: AccountQuestion) => {
    const [head, ...items] = q.data.split('\n');
    const losses = lossesIn(items);
    const total = losses.reduce((s, l) => s + l.lost, 0);
    const closedBy = head.includes('keeps no provision') ? PL_AC : PDD_AC;
    const [debit, credit] = q.sides;
    if (losses.length < 2 || debit.below.length > 0 || credit.below.length > 0 || [...debit.rows, ...credit.rows].some((r) => r.closing)) return false;
    return rowKeys(debit.rows) === wantKeys(losses.map((l) => [`${l.name} A/c`, l.lost])) && rowKeys(credit.rows) === wantKeys([[closedBy, total]]);
  },
});

// 2. pr-fmt-doubtful-debts: Provision for Doubtful Debts A/c for two years, balanced on each 31 March: the provision
//    created at the first year end or already standing, the bad debts set off against it, and the charge or the
//    write-back that brings it to the amount needed (medium)
const fmtDoubtfulDebts = accountTemplate({
  id: 'pr-fmt-doubtful-debts',
  topicId: T,
  conceptId: 'pr-formats',
  difficulty: 'medium',
  generate: (rng) => {
    const y = rng.int(2021, 2024); // the two years end on 31 March y + 1 and on 31 March y + 2
    const firm = rng.pick(FIRMS);
    const [name1, name2, name3, name4] = rng.shuffle(PARTIES);
    // In two seeds of five a provision already stands when the first year opens; in the others it is created at the first year end.
    const standing = rng.int(0, 4) < 2;
    const r1 = rng.pick([4, 5, 10]);
    const r2 = rng.int(0, 2) === 0 ? rng.pick([2, 4, 5, 10].filter((r) => r !== r1)) : r1;
    const d1 = rng.step(200000, 600000, 20000);
    // A year later the debtors are somewhat higher or lower, not a different business.
    const d2 = Math.max(120000, d1 + 20000 * rng.int(-8, 6));
    const p1 = pc(d1, r1);
    const p2 = pc(d2, r2);
    // A provision that already stands was made at the same rate on the debtors of the year before, which were much the same.
    const p0 = standing ? pc(Math.max(120000, d1 + 20000 * rng.int(-4, 4)), r1) : 0;
    // A provision that stands is large enough to meet the bad debts set off against it.
    const bad1 = standing ? badDebt(rng, name1, true, Math.floor((p0 * 3) / 4 / 1000) * 1000) : rng.int(0, 2) > 0 ? badDebt(rng, name1, false) : null;
    const two = rng.int(0, 2) === 0;
    const most = Math.floor((p1 * 3) / 4 / (two ? 2 : 1) / 1000) * 1000;
    const bad2 = badDebt(rng, name2, true, most);
    const bad3 = two ? badDebt(rng, name3, true, most) : null;
    const recovery = rng.int(0, 2) === 0 ? recoveryOf(rng, name4) : null;
    // Two figures the same would read like one debt told twice.
    const figures = [bad1?.lost, bad2.lost, bad3?.lost, recovery?.got].filter((x): x is number => x !== undefined);
    if (new Set(figures).size < figures.length) return null;
    const lost1 = bad1?.lost ?? 0;
    const lost2 = bad2.lost + (bad3?.lost ?? 0);
    // What the account holds at each year end once the bad debts are set off, and what brings it to the amount needed.
    const left1 = standing ? p0 - lost1 : 0;
    const left2 = p1 - lost2;
    if (p1 === left1 || p2 === left2) return null; // a year end with nothing to enter for Profit and Loss A/c
    const end1 = `31 March ${y + 1}`;
    const end2 = `31 March ${y + 2}`;
    const next = `1 April ${y + 2}`;
    const adjust = (date: string, needed: number, left: number): DatedEntry => ({
      date,
      lines: needed > left ? [line(PL_ID, 'Dr', needed - left), line(PDD_ID, 'Cr', needed - left)] : [line(PDD_ID, 'Dr', left - needed), line(PL_ID, 'Cr', left - needed)],
    });
    const date1 = datesInYear(rng, y, 1)[0];
    const order = rng.shuffle([bad2.tx, ...(bad3 ? [bad3.tx] : []), ...(recovery ? [recovery.tx] : [])]);
    const dates = datesInYear(rng, y + 1, order.length);
    const entries: DatedEntry[] = [
      ...(bad1 ? [{ date: date1, lines: bad1.tx.lines }, { date: end1, lines: [line(standing ? PDD_ID : PL_ID, 'Dr', lost1), line('badDebts', 'Cr', lost1)] }] : []),
      adjust(end1, p1, left1),
      ...order.map((tx, i) => ({ date: dates[i], lines: tx.lines })),
      { date: end2, lines: [line(PDD_ID, 'Dr', lost2), line('badDebts', 'Cr', lost2)] },
      adjust(end2, p2, left2),
    ];
    const periods = ledgerPeriods(
      entries,
      PDD_ID,
      [
        { closeOn: end1, reopenOn: `1 April ${y + 1}`, title: `Year ended ${end1}` },
        { closeOn: end2, reopenOn: next, title: `Year ended ${end2}` },
      ],
      standing ? { date: `1 April ${y}`, side: 'Cr', amount: rs(p0) } : null,
    );
    // The debts of the second year in the order of their dates, each with the customer's name.
    const losses = order.flatMap((tx) => (tx === bad2.tx ? [{ ...bad2, name: name2 }] : bad3 && tx === bad3.tx ? [{ ...bad3, name: name3 }] : []));
    const yearSteps = (end: string, held: number, lost: number, lostText: string, needed: number, rate: number, debtors: number, last: boolean): string => {
      const left = held - lost;
      const diff = Math.abs(needed - left);
      return [
        `The bad debts of the year, ${lostText}, are set off against the provision, which was made to meet them: "To ${BAD_DEBTS_AC} ${inr(lost)}". The provision is left with ${inr(held)} - ${inr(lost)} = ${inr(left)}.`,
        `Provision needed on ${end} = ${rate}% of ${inr(debtors)} = ${inr(needed)}.`,
        needed > left
          ? `The account is ${inr(needed)} - ${inr(left)} = ${inr(diff)} short, which is charged to the profit of the year: "By ${PL_AC} ${inr(diff)}". (Check: bad debts ${inr(lost)} + new provision ${inr(needed)} - old provision ${inr(held)} = ${inr(diff)}.)`
          : `The account holds ${inr(left)} - ${inr(needed)} = ${inr(diff)} more than is needed, and the excess is written back to profit: "To ${PL_AC} ${inr(diff)}". (Check: old provision ${inr(held)} - bad debts ${inr(lost)} - new provision ${inr(needed)} = ${inr(diff)}.)`,
        `The provision needed is the balance: "To ${BALANCE_CD} ${inr(needed)}" on ${end}, and "By ${BALANCE_BD} ${inr(needed)}" on the next day, ${last ? 'below the totals' : 'the first row of the next year'}.`,
      ].join(' ');
    };
    const year1 = standing
      ? `Year ended ${end1}: The account opens with the provision held, a credit balance: "By ${BALANCE_BD} ${inr(p0)}". ${lossStep(bad1!, name1)} ${yearSteps(end1, p0, lost1, inr(lost1), p1, r1, d1, false)}`
      : `Year ended ${end1}: ${bad1 ? `${lossStep(bad1, name1)} No provision stands yet, so this bad debt is transferred from Bad Debts A/c to Profit and Loss A/c: it has no row in the provision account. ` : ''}Provision created = ${r1}% of ${inr(d1)} = ${inr(p1)}, charged to the profit of the year: "By ${PL_AC} ${inr(p1)}". It is the balance: "To ${BALANCE_CD} ${inr(p1)}" on ${end1}, and "By ${BALANCE_BD} ${inr(p1)}" on the next day, the first row of the next year.`;
    return {
      task: `Prepare Provision for Doubtful Debts A/c of ${firm} for the two years ended ${end2}. Balance it on each 31 March and bring the balance down on each 1 April.${two ? ' Enter the bad debts set off at a year end as one figure.' : ''}`,
      data: [
        `${firm} sells on credit and closes its books on 31 March. A debt that proves bad is written off to Bad Debts A/c. ${
          standing
            ? 'At each year end the bad debts of the year are set off against the provision for doubtful debts, and the provision is then brought to the amount needed through Profit and Loss A/c.'
            : `The firm had no provision for doubtful debts before ${end1}: the bad debts of a year in which none stands are transferred to Profit and Loss A/c. Once a provision stands, the bad debts of the year are set off against it at the year end, and the provision is then brought to the amount needed through Profit and Loss A/c.`
        } Money received comes by cheque.`,
        ...(standing ? [`1 April ${y}: Provision for Doubtful Debts A/c stood at ${inr(p0)}.`] : []),
        ...(bad1 ? [`${date1}: ${bad1.tx.text}`] : []),
        `${end1}: Debtors stood at ${inr(d1)}${bad1 ? ' after the bad debt of the year had been written off' : '; no debt had proved bad during the year'}. ${
          standing ? `The provision is to be ${r1}% of the debtors.` : `A provision for doubtful debts was created for the first time, at ${r1}% of the debtors.`
        }`,
        ...order.map((tx, i) => `${dates[i]}: ${tx.text}`),
        `${end2}: Debtors stood at ${inr(d2)} after the bad debts of the year had been written off. The provision is ${r2 === r1 ? `to be kept at ${r2}%` : `now to be ${r2}%`} of the debtors.`,
      ].join('\n'),
      title: PDD_AC,
      ...periods,
      // Two debts set off in one entry: the solution shows what the figure is made of.
      later: periods.later!.map((p) => ({ ...p, left: p.left.map((r) => (two && r.label === BAD_DEBTS_AC ? { ...r, details: losses.map((d) => `${d.name} ${inr(d.lost)}`) } : r)) })),
      distractors: [PDD_AC, `${name2} A/c`, 'Bad Debts Recovered A/c', 'Bank A/c', 'Sales A/c'],
      explanation: [
        year1,
        `Year ended ${end2}: ${losses.map((d) => lossStep(d, d.name)).join(' ')} ${yearSteps(end2, p1, lost2, `${two ? `${losses.map((d) => inr(d.lost)).join(' + ')} = ` : ''}${inr(lost2)}`, p2, r2, d2, true)}`,
        ...(recovery ? [`The cheque from ${name4} is credited to Bad Debts Recovered A/c: it does not touch the provision.`] : []),
      ],
      hints: [
        'Take one year at a time. What does the provision account hold when the year opens, and what is set off against it at the year end?',
        'Then find the provision needed on the closing debtors. Is the account short of it (a further charge to Profit and Loss A/c) or does it hold too much (the excess is written back)?',
      ],
    };
  },
  // Read again from the data, line by line and year by year: the provision held, the bad debts of the year, the
  // provision needed on the debtors, and the charge of the year by the formula of card 10.
  verify: (q: AccountQuestion) => {
    const lines = q.data.split('\n').slice(1);
    const ends = lines.flatMap((t, i) => (t.startsWith('31 March') ? [i] : []));
    if (ends.length !== 2 || q.later?.length !== 1) return false;
    const stood = lines.find((t) => t.includes(`${PDD_AC} stood at`));
    let held = stood ? amts(stood)[0] : 0;
    const years = [q.sides.map((s) => s.rows), q.later[0]];
    for (const [k, end] of ends.entries()) {
      const lost = lossesIn(lines.slice(k === 0 ? 0 : ends[0] + 1, end)).reduce((s, l) => s + l.lost, 0);
      const needed = pc(amts(lines[end])[0], pcts(lines[end])[0]);
      if (!(needed > 0)) return false;
      const [debit, credit] = years[k];
      const pair = (label: string, n: number): [string, number] => [label, n];
      if (held === 0) {
        // No provision stands: the bad debts go to Profit and Loss A/c, and the provision is created out of profit.
        if (rowKeys(debit) !== wantKeys([pair(BALANCE_CD, needed)]) || rowKeys(credit) !== wantKeys([pair(PL_AC, needed)])) return false;
      } else {
        // Card 10: what Profit and Loss A/c bears is the bad debts and the new provision less the old one.
        const charge = lost + needed - held;
        if (!(lost > 0) || !(lost < held) || charge === 0) return false;
        if (rowKeys(debit) !== wantKeys([pair(BAD_DEBTS_AC, lost), ...(charge < 0 ? [pair(PL_AC, -charge)] : []), pair(BALANCE_CD, needed)])) return false;
        if (rowKeys(credit) !== wantKeys([pair(BALANCE_BD, held), ...(charge > 0 ? [pair(PL_AC, charge)] : [])])) return false;
      }
      if (debit.filter((r) => r.closing).length !== 1 || credit.some((r) => r.closing)) return false;
      held = needed;
    }
    return q.sides[0].below.length === 0 && rowKeys(q.sides[1].below) === wantKeys([[BALANCE_BD, held]]);
  },
});

const formats: AccountTemplate[] = [fmtBadDebts, fmtDoubtfulDebts];


// ---------------------------------------------------------------------------------------------------------------
// A reserve and a reserve fund, added after the check against the CBSE 2025-26 syllabus, which names the difference between the two among its learning outcomes.
// ---------------------------------------------------------------------------------------------------------------

const prReserveFundWhich = factsTemplate({
  id: 'pr-reserve-fund-which', topicId: T, conceptId: 'pr-reserve-meaning', difficulty: 'easy',
  facts: [
    {
      prompt: 'A firm keeps back ₹50,000 of its profit as General Reserve, and the money stays in use in the business. What is it?',
      correct: 'A reserve',
      distractors: [
        { text: 'A reserve fund', why: 'A reserve becomes a reserve fund only when its amount is invested outside the business; here the money is used in the business.' },
        { text: 'A provision', why: 'A provision is a charge against profit for a known liability or loss; this is profit kept back.' },
        { text: 'A secret reserve', why: 'A secret reserve does not appear in the balance sheet; General Reserve is shown openly.' },
      ],
      explanation: 'Profit kept back and used in the business is a reserve.',
    },
    {
      prompt: 'A firm keeps back ₹1,00,000 of its profit to repay a loan in five years, and invests the same amount in government bonds held for that purpose. What is it?',
      correct: 'A reserve fund',
      distractors: [
        { text: 'A reserve, like any other', why: 'Missed the earmarked investment: a reserve whose amount is invested outside the business is a reserve fund.' },
        { text: 'A provision for a known liability', why: 'Repaying a loan is not an expense; this is profit set aside, an appropriation.' },
        { text: 'A capital reserve', why: 'It comes out of ordinary profits; a capital reserve is made from capital profits.' },
      ],
      explanation: 'The reserve is matched by investments kept outside the business for its purpose, so it is a reserve fund.',
    },
    {
      prompt: 'A Reserve for Replacement of Machinery of ₹80,000 is made, and the amount is placed in a fixed deposit earmarked for buying the new machine. What is it?',
      correct: 'A reserve fund',
      distractors: [
        { text: 'A provision for depreciation', why: 'Mixed it up with depreciation, which is a charge against profit; this is profit set aside.' },
        { text: 'A reserve, as the fixed deposit belongs to the business', why: 'Missed that the amount is invested outside the business and earmarked: that makes it a reserve fund.' },
        { text: 'A secret reserve', why: 'It is shown openly in the balance sheet.' },
      ],
      explanation: 'The earmarked fixed deposit stands against the reserve, so the reserve is a reserve fund.',
    },
    {
      prompt: 'Profit of ₹40,000 is set aside as a Reserve for Contingencies and is used as working capital. What is it?',
      correct: 'A reserve',
      distractors: [
        { text: 'A reserve fund', why: 'Nothing is invested outside the business, so it is not a fund.' },
        { text: 'A provision for doubtful debts', why: 'That provision is a charge for debts that may not be received; this is profit set aside.' },
        { text: 'A current liability', why: 'A reserve belongs to the owner and stands with the capital; it is owed to no outsider.' },
      ],
      explanation: 'Profit set aside and kept in use in the business is a reserve.',
    },
  ],
});

const prReserveFundDifference = factsTemplate({
  id: 'pr-reserve-fund-difference', topicId: T, conceptId: 'pr-reserve-meaning', difficulty: 'medium',
  facts: [
    {
      prompt: 'What is the main difference between a reserve and a reserve fund?',
      correct: 'The amount of a reserve fund is invested outside the business; the amount of a reserve is used in it',
      distractors: [
        { text: 'A reserve fund is a charge against profit; a reserve is an appropriation of profit', why: 'Both are appropriations of profit; a charge against profit is a provision.' },
        { text: 'A reserve fund is made from capital profits only', why: 'A reserve fund may come from ordinary profits; what marks it is the investment.' },
        { text: 'A reserve is shown on the assets side, a reserve fund on the liabilities side', why: 'Both stand with the owner\'s funds; only the investments of a fund are on the assets side.' },
      ],
      explanation: 'Both are profit set aside; a reserve fund also has investments kept for it outside the business.',
    },
    {
      prompt: 'What does the balance sheet show for a reserve fund that it does not show for a reserve?',
      correct: 'Earmarked investments on the assets side, besides the fund itself with the owner\'s funds',
      distractors: [
        { text: 'A deduction from the asset the fund relates to', why: 'That is how a provision (for depreciation, for doubtful debts) is shown.' },
        { text: 'The fund as a current liability', why: 'A reserve fund is the owner\'s, not owed to outsiders.' },
        { text: 'Nothing at all', why: 'Mixed it up with a secret reserve, which is not shown.' },
      ],
      explanation: 'The fund stands with the reserves; its investments stand among the assets.',
    },
    {
      prompt: 'What do a reserve and a reserve fund have in common?',
      correct: 'Both are appropriations of profit, shown with the owner\'s funds',
      distractors: [
        { text: 'Both are charges against profit', why: 'A charge against profit is a provision; reserves are set aside out of profit.' },
        { text: 'Both are liabilities to outsiders', why: 'Both belong to the owner.' },
        { text: 'Both are invested outside the business', why: 'Only a reserve fund is; a reserve is used in the business.' },
      ],
      explanation: 'A reserve fund is a reserve with investments behind it, so the two share the nature of a reserve.',
    },
  ],
});

/** What a question on reserve funds was made from, kept for its `verify`: each reserve and whether it is invested. */
let keptFunds: { prompt: string; reserves: { amount: number; invested: boolean }[] } | undefined;

const prReserveFundAmount = numericTemplate({
  id: 'pr-reserve-fund-amount', topicId: T, conceptId: 'pr-reserve-meaning', difficulty: 'medium', unit: 'rupees',
  generate: (rng) => {
    const firm = rng.pick(FIRMS);
    const general = rng.step(40000, 200000, 10000), replace = rng.step(30000, 150000, 10000), loan = rng.step(30000, 150000, 10000), shares = rng.step(20000, 90000, 10000);
    const [replaceIn, loanIn] = rng.pick([[true, false], [false, true], [true, true]] as const);
    if (new Set([general, replace, loan, shares]).size < 4) return null;
    const answer = (replaceIn ? replace : 0) + (loanIn ? loan : 0);
    const items = [
      `General Reserve ${inr(general)}, used in the business`,
      `Reserve for Replacement of Machinery ${inr(replace)}, ${replaceIn ? 'invested in fixed deposits earmarked for the new machine' : 'used in the business'}`,
      `Loan Repayment Reserve ${inr(loan)}, ${loanIn ? 'invested in government bonds earmarked to repay the loan' : 'used in the business'}`,
    ];
    const prompt = `The balance sheet of ${firm} shows these reserves: ${items.join('; ')}. It also holds shares of other companies worth ${inr(shares)}, bought out of spare cash and earmarked for nothing. What is the total of the reserve funds?`;
    keptFunds = { prompt, reserves: [{ amount: general, invested: false }, { amount: replace, invested: replaceIn }, { amount: loan, invested: loanIn }] };
    const errors = [
      { value: rs(general + replace + loan), why: 'Counted every reserve as a reserve fund; only those whose amount is invested outside the business are.' },
      { value: rs(answer + shares), why: 'Counted the shares bought out of spare cash; an investment earmarked for no reserve makes no reserve fund.' },
      { value: rs(answer + general), why: 'Counted General Reserve, whose amount is used in the business.' },
    ];
    const commonErrors = errors.filter((e, i) => e.value !== rs(answer) && errors.findIndex((x) => x.value === e.value) === i);
    if (commonErrors.length < 2) return null;
    return {
      prompt,
      answer: rs(answer),
      commonErrors,
      explanation: [
        'A reserve fund is a reserve whose amount is invested outside the business in securities earmarked for it.',
        `Reserve funds: ${[replaceIn ? `Reserve for Replacement of Machinery ${inr(replace)}` : '', loanIn ? `Loan Repayment Reserve ${inr(loan)}` : ''].filter(Boolean).join(' and ')} = ${inr(answer)}.`,
        'General Reserve, and any reserve used in the business, is a reserve only; the shares are an ordinary investment.',
      ],
    };
  },
  verify: (q) => keptFunds !== undefined && keptFunds.prompt === q.prompt && rs(keptFunds.reserves.filter((r) => r.invested).reduce((s, r) => s + r.amount, 0)) === q.answer,
});

const reserveFundTemplates: Template[] = [prReserveFundWhich, prReserveFundDifference, prReserveFundAmount];

// The reserve fund, added after the check against the CBSE 2025-26 syllabus, comes last.
const all: Template[] = [...templates, ...sets, ...formats, ...reserveFundTemplates];

// Assertion and Reason comes last, and is on its own level and on no mock paper (see assertionReason.ts).
const assertionReason = assertionReasonTemplate({
  prefix: 'pr', topicId: 'provisions-and-reserves', conceptId: 'pr-difference',
  items: [
    {
      answer: 'explains',
      a: 'A first provision for doubtful debts of ₹8,000 lowers the net profit of the year by ₹8,000.',
      r: 'A provision is charged against profit, before the net profit is found.',
      aWhy: 'The amount is debited to the Profit and Loss Account.',
      rWhy: 'That is what makes it a provision and not a reserve.',
      link: 'The net profit is lower because the provision is one of the charges deducted to find it, so R explains A.',
    },
    {
      answer: 'explains',
      a: 'Reserves help a business to expand out of its own funds.',
      r: 'A reserve keeps part of the profit in the business instead of paying it out.',
      aWhy: 'A business with reserves relies less on borrowing.',
      rWhy: 'That is what setting aside a reserve does.',
      link: 'The money kept back is what pays for the expansion, so R explains A.',
    },
    {
      answer: 'explains',
      a: 'Charging depreciation far above the real fall in the value of an asset creates a secret reserve.',
      r: 'The asset is then shown below its real value, and the difference is not disclosed.',
      aWhy: 'Excess depreciation is one of the usual ways in which a secret reserve arises.',
      rWhy: 'The asset and the profit are both understated, and nothing in the balance sheet shows it.',
      link: 'An undisclosed undervaluation of an asset is what a secret reserve is, so R explains A.',
    },
    {
      answer: 'explains',
      a: 'With an old provision for doubtful debts of ₹5,000, a new provision of ₹7,000 and no bad debts, ₹2,000 is charged to the Profit and Loss Account.',
      r: 'The old provision is already in the books, so only the rise is charged.',
      aWhy: 'Charge = ₹7,000 - ₹5,000 = ₹2,000.',
      rWhy: 'The old provision was charged in an earlier year.',
      link: 'The charge is only ₹2,000 because ₹5,000 of the provision already exists, so R explains A.',
    },
    {
      answer: 'explains',
      a: 'A Workmen Compensation Reserve is a specific reserve.',
      r: 'A specific reserve is kept for a named purpose and is used only for that purpose.',
      aWhy: 'It is made to meet claims for compensation to workers.',
      rWhy: 'That is what a specific reserve is.',
      link: 'Its named purpose is what makes it specific, so R explains A.',
    },
    {
      answer: 'not-the-reason',
      a: 'General Reserve can be used for any need of the business.',
      r: 'General Reserve is made out of profit.',
      aWhy: 'It is kept for no particular purpose.',
      rWhy: 'Every reserve of this kind comes out of profit.',
      link: 'Specific reserves are made out of profit too, and they cannot be used for anything else. General Reserve is free because no purpose was named.',
    },
    {
      answer: 'not-the-reason',
      a: 'A provision must be made when a loss is likely, whether or not the business has earned a profit.',
      r: 'A provision for doubtful debts is deducted from debtors in the balance sheet.',
      aWhy: 'Prudence requires likely losses to be allowed for.',
      rWhy: 'That is how it is shown.',
      link: 'R tells where a provision stands in the balance sheet. It must be made because of prudence.',
    },
    {
      answer: 'not-the-reason',
      a: 'A reserve fund has investments of its own outside the business.',
      r: 'A reserve fund stands with the owner\'s funds in the balance sheet.',
      aWhy: 'The amount of the reserve is invested in securities earmarked for it.',
      rWhy: 'A reserve fund is an appropriation of profit, as any reserve is.',
      link: 'An ordinary reserve stands with the owner\'s funds too and has no such investments. A reserve fund has them so that the money is ready for its purpose.',
    },
    {
      answer: 'a-only',
      a: 'A General Reserve of ₹50,000 is shown on the liabilities side of the balance sheet.',
      r: 'A reserve is a liability to outsiders.',
      aWhy: 'It stands there along with the owner\'s capital.',
      rWhy: 'A reserve belongs to the owner, and nothing is owed to outsiders.',
    },
    {
      answer: 'a-only',
      a: 'With debtors of ₹1,00,000, further bad debts of ₹4,000 and a provision of 5%, the new provision is ₹4,800.',
      r: 'The provision is worked on the debtors before the further bad debts are written off.',
      aWhy: '5% of (₹1,00,000 - ₹4,000) = ₹4,800.',
      rWhy: 'Bad debts are written off first, and the provision is made on the debtors that remain.',
    },
    {
      answer: 'r-only',
      a: 'A reserve must be made every year, whether or not there is a profit.',
      r: 'A reserve is made out of profit, at the choice of the owner.',
      aWhy: 'A reserve can be made only when there is profit, and making it is a matter of choice.',
      rWhy: 'It is an appropriation of profit, and the owner decides whether to make it.',
    },
    {
      answer: 'r-only',
      a: 'Showing an asset above its real value creates a secret reserve.',
      r: 'A secret reserve arises when assets are shown below their real value.',
      aWhy: 'Overvaluing an asset overstates the profit and hides a loss.',
      rWhy: 'Undervaluation keeps back profit without saying so.',
    },
  ],
});

// ---------------------------------------------------------------------------------------------------------------
// Added in the quality pass after the content audit, after every other template so no earlier seed moves. They stand on
// levels of their own (and on the formats level), outside the mock papers, the worksheets and the Look back levels
// (`outsidePapers.ts`).
// ---------------------------------------------------------------------------------------------------------------

// 1. pr-capital-profit-kinds: the capital profits NCERT lists, beside the revenue profits a student takes for them.
const CAPITAL_PROFITS = [
  'Profit on the sale of a fixed asset, such as land or a building',
  'Surplus on revaluing a fixed asset',
  'Profit on the sale of long-term investments',
  'Premium received by a company on the issue of its shares',
  'Premium received by a company on the issue of its debentures',
  'Profit made by a company on the reissue of forfeited shares',
  'Profit earned by a company before its incorporation',
  'Profit made by a company on the redemption of its debentures',
];
const REVENUE_PROFITS: [string, string][] = [
  ['Profit on the sale of goods in the ordinary course of business', 'Selling goods is the normal trading of the business, so its profit is a revenue profit.'],
  ['Commission received for services rendered', 'Commission earned in the course of business is an ordinary income, a revenue profit.'],
  ['Discount received from suppliers for paying early', 'Discount received arises from day-to-day trading, so it is a revenue profit.'],
  ['Interest received on a loan given to an employee', 'Interest earned during the year is an ordinary income, a revenue profit.'],
  ['Rent received from sub-letting part of the shop', 'Rent received is an income of the year, a revenue profit.'],
  ['Bad debts recovered', 'A bad debt recovered is a gain of the year from trading, a revenue profit.'],
];
const H_CAPITAL_KINDS = [
  'Did the gain come from trading in the ordinary way, or from fixed assets, investments or the capital of a company?',
  'Capital profits: a gain on selling or revaluing fixed assets or long-term investments, and for a company premium on shares or debentures, profit on reissue of forfeited shares, profit before incorporation and profit on redemption of debentures. They go to a capital reserve.',
];

const capitalProfitKinds = mcqTemplate({
  id: 'pr-capital-profit-kinds',
  topicId: T,
  conceptId: 'pr-revenue-capital',
  difficulty: 'medium',
  generate: (rng) => {
    if (rng.next() < 0.55) {
      // Which one is a capital profit? One capital profit among revenue profits.
      const right = rng.pick(CAPITAL_PROFITS);
      const wrong = rng.shuffle(REVENUE_PROFITS).slice(0, 4);
      return {
        prompt: 'Some gains of a business, and of a company, are capital profits and may be kept in a capital reserve. Which of these is a capital profit?',
        correct: right,
        distractors: wrong.map(([text, why]) => ({ text, why: `Took a revenue profit for a capital profit. ${why}` })),
        explanation: `"${right}" does not arise from the normal trading of the business, so it is a capital profit and is kept in a capital reserve. The other gains come from day-to-day business and are revenue profits.`,
        hints: H_CAPITAL_KINDS,
      };
    }
    // Which one is NOT a capital profit? One revenue profit among capital profits.
    const [right, note] = rng.pick(REVENUE_PROFITS);
    const wrong = rng.shuffle(CAPITAL_PROFITS).slice(0, 4);
    return {
      prompt: 'Capital profits, of a business or of a company, may be kept in a capital reserve. Which of these is NOT a capital profit?',
      correct: right,
      distractors: wrong.map((text) => ({ text, why: 'Picked a capital profit: this gain does not arise from normal trading, so it does belong in a capital reserve.' })),
      explanation: `${note} Every other option is a capital profit, which arises outside normal trading and is kept in a capital reserve.`,
      hints: H_CAPITAL_KINDS,
    };
  },
  verify: (q) => {
    const right = q.options.find((o) => o.id === q.correct)?.text ?? '';
    const others = q.options.filter((o) => o.id !== q.correct).map((o) => o.text);
    const isCapital = (t: string) => CAPITAL_PROFITS.includes(t);
    const isRevenue = (t: string) => REVENUE_PROFITS.some(([x]) => x === t);
    return q.prompt.includes('NOT') ? isRevenue(right) && others.every(isCapital) : isCapital(right) && others.every(isRevenue);
  },
});

// 2. pr-fmt-provisions-extract (medium) and pr-fmt-provisions-extract-discount (complex): the Profit and Loss Account
//    and the Balance Sheet in extract, with the bad debts, the new and old provisions for doubtful debts and the
//    provision for discount on debtors, one figure to a row. A deduction is a minus figure in a signed column.
const EX_DATE = '31 March 2026';
const EX_COLUMNS = [{ name: 'Amount (₹)', signed: true }];
const EX = {
  pl: `Profit and Loss Account for the year ended ${EX_DATE} (debit side)`,
  bs: `Balance Sheet as at ${EX_DATE} (assets side)`,
  bad: 'Bad debts (as per trial balance)',
  further: 'Further bad debts',
  newPdd: 'New provision for doubtful debts',
  oldPdd: 'Old provision for doubtful debts',
  pddCharge: 'Bad debts and provision for doubtful debts charged',
  disc: 'Provision for discount on debtors',
  newDisc: 'New provision for discount on debtors',
  oldDisc: 'Old provision for discount on debtors',
  discCharge: 'Provision for discount on debtors charged',
  debtors: 'Sundry debtors',
  pdd: 'Provision for doubtful debts',
  net: 'Sundry debtors (net)',
} as const;
const EX_DATA = {
  debtors: 'Sundry debtors (trial balance)',
  bad: 'Bad debts (trial balance)',
  oldPdd: 'Provision for doubtful debts (trial balance, credit)',
  oldDisc: 'Provision for discount on debtors (trial balance, credit)',
  further: 'Further bad debts to be written off',
  pddRate: 'Provision for doubtful debts to be kept at',
  discRate: 'Provision for discount on debtors to be kept at',
} as const;
const EX_FIRMS = ['Sharma Electricals', 'Kisan Agro Inputs', 'Navkar Hardware', 'Joshi Medical Agencies', 'Sai Furniture Mart', 'Rathi Paints', 'Devika Tea Traders'];
const H_EXTRACT = [
  'Work the figures in the order the debtors shrink: further bad debts, then the provision for doubtful debts, then the provision for discount.',
  'In the Profit and Loss Account: bad debts + further bad debts + new provision - old provision, and the new discount provision less any old one. In the Balance Sheet: debtors less further bad debts, less both new provisions.',
];
/** The figures written `Label: ₹x` or `Label: x%` one to a line of the data, by label (rupees, or the rate). */
const exFigures = (data: string): Map<string, number> =>
  new Map(
    data
      .split('\n')
      .filter((l) => l.includes(': '))
      .map((l): [string, number] => {
        const label = l.slice(0, l.indexOf(': '));
        const figure = l.slice(l.indexOf(': ') + 2);
        return [label, figure.endsWith('%') ? Number.parseFloat(figure) : (amts(figure)[0] ?? Number.NaN)];
      }),
  );
/** The rows of a statement question as `part|label` with the figure in rupees, and each sub-total as `=|name`. */
const exRows = (q: StatementQuestion): Map<string, number> => {
  const out = new Map<string, number>();
  const heads = new Map((q.lines ?? []).flatMap((l) => ('heading' in l ? [[l.at, l.heading] as const] : [])));
  let part = '';
  q.rows.forEach((r, i) => {
    part = heads.get(i) ?? part;
    out.set(`${part}|${r.label}`, r.amounts[0] / 100);
  });
  for (const l of q.lines ?? []) if ('subtotal' in l) out.set(`=|${l.subtotal}`, l.amounts[0] / 100);
  return out;
};

function provisionsExtract(id: string, difficulty: 'medium' | 'complex') {
  const complex = difficulty === 'complex';
  return statementTemplate({
    id,
    topicId: T,
    conceptId: 'pr-formats',
    difficulty,
    generate: (rng) => {
      const firm = rng.pick(EX_FIRMS);
      const d = rng.step(120000, 480000, 10000);
      const b1 = rng.step(2000, 12000, 500);
      const b2 = rng.step(2000, 16000, 1000);
      const r1 = rng.pick([4, 5, 10]);
      const r2 = rng.pick([2, 3]);
      const left = d - b2;
      const n = pc(left, r1);
      const good = left - n;
      const disc = pc(good, r2);
      const o = rng.step(3000, 24000, 500);
      const od = complex ? rng.step(1000, Math.max(1000, Math.floor(disc / 1000) * 1000), 500) : 0;
      const charge = b1 + b2 + n - o;
      if (!Number.isInteger(n) || !Number.isInteger(disc) || charge <= 0 || n === o || (complex && od >= disc) || b1 === b2) return null;
      const data = [
        `${firm} closes its books on ${EX_DATE}. From its trial balance and the adjustments:`,
        `${EX_DATA.debtors}: ${inr(d)}`,
        `${EX_DATA.bad}: ${inr(b1)}`,
        `${EX_DATA.oldPdd}: ${inr(o)}`,
        ...(complex ? [`${EX_DATA.oldDisc}: ${inr(od)}`] : []),
        `${EX_DATA.further}: ${inr(b2)}`,
        `${EX_DATA.pddRate}: ${r1}%`,
        `${EX_DATA.discRate}: ${r2}%`,
        `The provision for doubtful debts is made on the debtors left after the further bad debts, and the provision for discount on the debtors left after both.${complex ? '' : ' There was no provision for discount before.'}`,
      ].join('\n');
      const discRows: StatementRows = complex
        ? [
            { label: EX.newDisc, amount: rs(disc) },
            { label: EX.oldDisc, amount: rs(-od) },
            { subtotal: EX.discCharge, amount: rs(disc - od), sum: 'block' },
          ]
        : [{ label: EX.disc, amount: rs(disc) }];
      const rows: StatementRows = [
        { heading: EX.pl },
        { label: EX.bad, amount: rs(b1) },
        { label: EX.further, amount: rs(b2) },
        { label: EX.newPdd, amount: rs(n) },
        { label: EX.oldPdd, amount: rs(-o) },
        { subtotal: EX.pddCharge, amount: rs(charge), sum: 'section' },
        ...discRows,
        { heading: EX.bs },
        { label: EX.debtors, amount: rs(d) },
        { label: EX.further, amount: rs(-b2) },
        { label: EX.pdd, amount: rs(-n) },
        { label: EX.disc, amount: rs(-disc) },
        { subtotal: EX.net, amount: rs(good - disc), sum: 'section' },
      ];
      return {
        task: `Prepare the extracts of the Profit and Loss Account and the Balance Sheet of ${firm} showing the bad debts and the provisions on debtors. Show an amount deducted with a minus sign.`,
        data,
        title: `${firm}: Profit and Loss Account and Balance Sheet (extracts)`,
        columns: EX_COLUMNS,
        rows,
        distractors: ['Bad debts recovered', 'General Reserve', complex ? 'Provision for doubtful debts (liabilities side)' : EX.oldDisc, 'Sundry creditors'],
        explanation: [
          `Debtors left after the further bad debts = ${inr(d)} - ${inr(b2)} = ${inr(left)}.`,
          `New provision for doubtful debts = ${r1}% of ${inr(left)} = ${inr(n)}.`,
          `Debtors expected to pay = ${inr(left)} - ${inr(n)} = ${inr(good)}; provision for discount = ${r2}% of it = ${inr(disc)}.`,
          `Profit and Loss Account: bad debts ${inr(b1)} + further bad debts ${inr(b2)} + new provision ${inr(n)} - old provision ${inr(o)} = ${inr(charge)}. The bad debts of the trial balance are already out of the debtors, so they are charged here but not deducted again in the Balance Sheet.`,
          complex
            ? `Provision for discount: the new ${inr(disc)} less the old ${inr(od)} already in the books = ${inr(disc - od)} charged.`
            : `Provision for discount: ${inr(disc)}, charged in full because there was none before.`,
          `Balance Sheet: ${inr(d)} - ${inr(b2)} - ${inr(n)} - ${inr(disc)} = ${inr(good - disc)}. The provisions are deducted from the debtors, never shown as liabilities.`,
        ],
        hints: H_EXTRACT,
      };
    },
    // Worked again from the data: each figure from the stated balances and rates, every row and sub-total checked.
    verify: (q) => {
      const f = exFigures(q.data);
      const get = (label: string): number => f.get(label) ?? Number.NaN;
      const d = get(EX_DATA.debtors);
      const b1 = get(EX_DATA.bad);
      const o = get(EX_DATA.oldPdd);
      const b2 = get(EX_DATA.further);
      const od = f.get(EX_DATA.oldDisc) ?? 0;
      const n = ((d - b2) * get(EX_DATA.pddRate)) / 100;
      const disc = ((d - b2 - n) * get(EX_DATA.discRate)) / 100;
      const discWant: [string, number][] =
        od > 0
          ? [[`${EX.pl}|${EX.newDisc}`, disc], [`${EX.pl}|${EX.oldDisc}`, -od], [`=|${EX.discCharge}`, disc - od]]
          : [[`${EX.pl}|${EX.disc}`, disc]];
      const want: [string, number][] = [
        [`${EX.pl}|${EX.bad}`, b1],
        [`${EX.pl}|${EX.further}`, b2],
        [`${EX.pl}|${EX.newPdd}`, n],
        [`${EX.pl}|${EX.oldPdd}`, -o],
        [`=|${EX.pddCharge}`, b1 + b2 + n - o],
        ...discWant,
        [`${EX.bs}|${EX.debtors}`, d],
        [`${EX.bs}|${EX.further}`, -b2],
        [`${EX.bs}|${EX.pdd}`, -n],
        [`${EX.bs}|${EX.disc}`, -disc],
        [`=|${EX.net}`, d - b2 - n - disc],
      ];
      const rows = exRows(q);
      return rows.size === want.length && want.every(([k, v]) => rows.get(k) === v);
    },
  });
}

const provisionsExtractMedium = provisionsExtract('pr-fmt-provisions-extract', 'medium');
const provisionsExtractComplex = provisionsExtract('pr-fmt-provisions-extract-discount', 'complex');

const qualityPassTemplates: Template[] = [capitalProfitKinds, provisionsExtractMedium, provisionsExtractComplex];

const withAssertionReason: Template[] = [...all, assertionReason, ...qualityPassTemplates];

export default withAssertionReason;
