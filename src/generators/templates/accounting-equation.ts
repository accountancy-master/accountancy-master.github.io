import type { McqQuestion, NumericQuestion, StatementQuestion } from '@/content/types';
import type { Rng } from '@/engine/rng';
import { parseRupees } from '@/lib/money-input';
import { PARTIES, amount, formatINR, mcqTemplate, numericTemplate, party, rupees, statementTemplate, type Paise } from '../authoring';
import type { Distractor, McqParts, NumericParts, Template } from '../types';
import { assertionReasonTemplate } from '../assertionReason';

const T = 'accounting-equation';

/** An amount as formatINR writes it, without a comma or full stop that merely follows it in the sentence. */
const RUPEES = /₹\d(?:[\d,]*\d)?/;

// ---------------------------------------------------------------------------------------------------------------
// ae-effect: which way does a transaction move Assets = Liabilities + Capital? (mcq)
// ---------------------------------------------------------------------------------------------------------------

/** The five ways a simple transaction can change the equation. a, l, c are the signs of the change in assets, liabilities and capital. */
const EFFECTS = {
  assetsUpLiabilitiesUp: { a: 1, l: 1, c: 0, text: (x: string) => `Assets and liabilities both increase by ${x}` },
  assetsUpCapitalUp: { a: 1, l: 0, c: 1, text: (x: string) => `Assets and capital both increase by ${x}` },
  assetsDownLiabilitiesDown: { a: -1, l: -1, c: 0, text: (x: string) => `Assets and liabilities both decrease by ${x}` },
  assetsDownCapitalDown: { a: -1, l: 0, c: -1, text: (x: string) => `Assets and capital both decrease by ${x}` },
  assetSwap: { a: 0, l: 0, c: 0, text: (x: string) => `One asset increases and another decreases by ${x}; total assets stay the same` },
};
type Effect = keyof typeof EFFECTS;

interface Scenario {
  prompt: (x: string, who: string) => string;
  right: Effect;
  /** Wrong effects, each with the mistake that leads to it. */
  wrong: [Effect, string][];
  explanation: string;
}

const SCENARIOS: Scenario[] = [
  {
    prompt: (x, who) => `A business buys furniture worth ${x} on credit from ${who}. What happens to the accounting equation?`,
    right: 'assetsUpLiabilitiesUp',
    wrong: [
      ['assetsUpCapitalUp', 'Treated the purchase as capital brought in by the owner.'],
      ['assetSwap', 'Treated it as a cash purchase, where one asset simply replaces another.'],
      ['assetsDownLiabilitiesDown', 'Took buying on credit as repaying a debt.'],
    ],
    explanation: 'Furniture is an asset that comes in. Nothing is paid, so the business owes the supplier: assets and liabilities both rise.',
  },
  {
    prompt: (x) => `A business buys machinery for ${x} and pays for it in cash. What happens to the accounting equation?`,
    right: 'assetSwap',
    wrong: [
      ['assetsUpLiabilitiesUp', 'Counted a liability, but the payment was made at once and nothing is owed.'],
      ['assetsUpCapitalUp', 'Counted the machinery as an increase in capital.'],
      ['assetsDownCapitalDown', 'Treated the payment as an expense, but machinery is an asset the business keeps.'],
    ],
    explanation: 'Machinery, an asset, increases and cash, another asset, decreases by the same amount. Total assets, liabilities and capital are unchanged.',
  },
  {
    prompt: (x) => `The owner brings ${x} in cash into the business as capital. What happens to the accounting equation?`,
    right: 'assetsUpCapitalUp',
    wrong: [
      ['assetsUpLiabilitiesUp', 'Treated the owner\'s capital as money borrowed from outsiders.'],
      ['assetSwap', 'Thought the cash only changes form, as when one asset is bought with another.'],
      ['assetsDownCapitalDown', 'Reversed the effect: took capital brought in as a withdrawal.'],
    ],
    explanation: 'Cash, an asset, increases and the owner\'s claim, capital, increases by the same amount.',
  },
  {
    prompt: (x, who) => `A business pays ${x} in cash to ${who}, a supplier it owed. What happens to the accounting equation?`,
    right: 'assetsDownLiabilitiesDown',
    wrong: [
      ['assetsDownCapitalDown', 'Treated the payment as an expense that reduces capital.'],
      ['assetSwap', 'Thought paying a creditor just moves one asset into another.'],
      ['assetsUpLiabilitiesUp', 'Took paying a creditor as taking on a new debt.'],
    ],
    explanation: 'Cash, an asset, falls and the amount owed to the supplier, a liability, falls by the same amount.',
  },
  {
    prompt: (x) => `The owner withdraws ${x} in cash from the business for personal use. What happens to the accounting equation?`,
    right: 'assetsDownCapitalDown',
    wrong: [
      ['assetsDownLiabilitiesDown', 'Treated the withdrawal as the repayment of a debt.'],
      ['assetsUpCapitalUp', 'Read the withdrawal as money coming into the business.'],
      ['assetSwap', 'Thought the cash only changes form.'],
    ],
    explanation: 'Drawings reduce the owner\'s capital, and the cash that leaves is an asset: assets and capital both fall.',
  },
  {
    prompt: (x) => `A business pays shop rent of ${x} for the month in cash. What happens to the accounting equation?`,
    right: 'assetsDownCapitalDown',
    wrong: [
      ['assetSwap', 'Treated rent as buying an asset, so only the form of the assets changes.'],
      ['assetsDownLiabilitiesDown', 'Treated the rent as the repayment of a liability.'],
      ['assetsUpCapitalUp', 'Took rent paid as an income.'],
    ],
    explanation: 'Rent is an expense. It reduces profit and so capital, and the cash paid reduces assets by the same amount.',
  },
  {
    prompt: (x) => `A business receives commission of ${x} in cash. What happens to the accounting equation?`,
    right: 'assetsUpCapitalUp',
    wrong: [
      ['assetsUpLiabilitiesUp', 'Treated the commission as money owed to someone else.'],
      ['assetsDownCapitalDown', 'Took commission received as an expense.'],
      ['assetSwap', 'Thought receiving cash only changes the form of the assets.'],
    ],
    explanation: 'Commission is an income. It increases profit and so capital, and the cash received increases assets by the same amount.',
  },
  {
    prompt: (x) => `A business takes a bank loan of ${x}, and the money is credited to its bank account. What happens to the accounting equation?`,
    right: 'assetsUpLiabilitiesUp',
    wrong: [
      ['assetsUpCapitalUp', 'Treated the loan as capital brought in by the owner.'],
      ['assetSwap', 'Thought the bank balance rising only moves value between assets.'],
      ['assetsDownLiabilitiesDown', 'Reversed the effect: took the loan as a repayment.'],
    ],
    explanation: 'The bank balance, an asset, increases and the loan, a liability, increases by the same amount.',
  },
];

const aeEffect = mcqTemplate({
  id: 'ae-effect',
  topicId: T,
  conceptId: 'ae-effects',
  difficulty: 'easy',
  generate: (rng) => {
    const s = rng.pick(SCENARIOS);
    const x = formatINR(amount(rng, 5000, 90000, 5000));
    return {
      prompt: s.prompt(x, party(rng)),
      correct: EFFECTS[s.right].text(x),
      distractors: s.wrong.map(([effect, why]) => ({ text: EFFECTS[effect].text(x), why })),
      explanation: s.explanation,
      hints: [
        'Decide whether each item in the equation (assets, liabilities, capital) goes up, goes down or stays the same.',
        'Both sides of Assets = Liabilities + Capital must still be equal after the transaction.',
      ],
    };
  },
  // Independent check: the right option must be one of the five effects, for the amount in the prompt, and that
  // effect must leave the equation balanced (change in assets = change in liabilities + change in capital).
  verify: (q) => {
    const x = RUPEES.exec(q.prompt)?.[0];
    const right = q.options.find((o) => o.id === q.correct)?.text;
    const effect = Object.values(EFFECTS).find((e) => x !== undefined && e.text(x) === right);
    return effect !== undefined && effect.a === effect.l + effect.c;
  },
});

// ---------------------------------------------------------------------------------------------------------------
// ae-missing-item: find the missing item of Assets = Liabilities + Capital (numeric, rupees)
// ---------------------------------------------------------------------------------------------------------------

const aeMissingItem = addHints(numericTemplate({
  id: 'ae-missing-item',
  topicId: T,
  conceptId: 'ae-equation',
  difficulty: 'easy',
  unit: 'rupees',
  version: 2,
  generate: (rng) => {
    const firm = bare(anyFirm(rng));
    const capital = amount(rng, 50000, 500000, 10000);
    const liabilities = amount(rng, 20000, 300000, 10000);
    if (capital === liabilities) return null; // The wrong answers below would coincide.
    const assets = capital + liabilities;
    const [A, L, C] = [assets, liabilities, capital].map(formatINR);
    const equation = 'Assets = Liabilities + Capital';

    switch (rng.pick(['capital', 'liabilities', 'assets'] as const)) {
      case 'capital':
        return {
          prompt: `${firm} has assets of ${A} and liabilities of ${L}. What is the owner's capital?`,
          answer: capital,
          commonErrors: [
            { value: assets + liabilities, why: 'Added the liabilities to the assets instead of deducting them.' },
            { value: assets, why: 'Gave the assets as the capital, forgetting to deduct the liabilities.' },
            { value: liabilities, why: 'Gave the liabilities, which is the other part of the assets, not the capital.' },
          ],
          explanation: [equation + ', so Capital = Assets - Liabilities.', `${A} - ${L} = ${C}.`],
        };
      case 'liabilities':
        return {
          prompt: `${firm} has assets of ${A} and the owner's capital is ${C}. How much does the business owe to outsiders (its liabilities)?`,
          answer: liabilities,
          commonErrors: [
            { value: assets + capital, why: 'Added the capital to the assets instead of deducting it.' },
            { value: capital, why: 'Gave the capital, which is the other part of the assets, not the liabilities.' },
            { value: assets, why: 'Gave the total assets as the liabilities.' },
          ],
          explanation: [equation + ', so Liabilities = Assets - Capital.', `${A} - ${C} = ${L}.`],
        };
      default:
        return {
          prompt: `${firm} owes ${L} to its creditors and the owner's capital is ${C}. What is the total of its assets?`,
          answer: assets,
          commonErrors: [
            { value: Math.abs(capital - liabilities), why: 'Subtracted one claim from the other instead of adding them.' },
            { value: Math.max(capital, liabilities), why: 'Counted only the larger of the two claims on the assets.' },
            { value: Math.min(capital, liabilities), why: 'Counted only the smaller of the two claims on the assets.' },
          ],
          explanation: [equation + '.', `${L} + ${C} = ${A}.`],
        };
    }
  },
  // Independent check from the prompt alone: the two amounts given and the answer must satisfy the equation,
  // whichever of the three figures was left out.
  verify: (q) => {
    const [given1, given2] = (q.prompt.match(new RegExp(RUPEES, 'g')) ?? []).map(parseRupees);
    if (given1 == null || given2 == null) return false;
    return q.answer === given1 + given2 || given1 === q.answer + given2;
  },
}), [
  'Assets = Liabilities + Capital: two of the three are given.',
  'Capital = Assets - Liabilities; Liabilities = Assets - Capital; Assets = Liabilities + Capital.',
]);

// ===============================================================================================================
// Everything below is shared by the other generators of this topic.
// ===============================================================================================================

const f = formatINR;
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
const sum = (xs: number[]) => xs.reduce((s, x) => s + x, 0);
const AMOUNT_G = new RegExp(RUPEES, 'g');
/** Every rupee amount written in a text, in order, in paise. */
const amountsIn = (text: string): Paise[] => (text.match(AMOUNT_G) ?? []).map((s) => parseRupees(s) ?? NaN);
/** The first amount that follows a phrase ("drawings of ₹5,000"), or null when the phrase is absent. */
const after = (text: string, phrase: string): Paise | null => {
  const m = new RegExp(`${phrase} (${RUPEES.source})`).exec(text);
  return m ? parseRupees(m[1]) : null;
};
/** The last sentence of a prompt (the question itself). */
const lastSentence = (text: string): string => text.slice(text.lastIndexOf('. ') + 2);
const ROMAN = ['(i)', '(ii)', '(iii)', '(iv)', '(v)', '(vi)'];
/** An amount with its sign: "+₹5,000", "−₹5,000" or "0". */
const sg = (v: Paise): string => (v === 0 ? '0' : `${v > 0 ? '+' : '−'}${f(Math.abs(v))}`);
const list = (xs: string[]): string => (xs.length <= 1 ? xs.join('') : `${xs.slice(0, -1).join(', ')} and ${xs[xs.length - 1]}`);
/** A clause closed as a sentence. A clause that ends in an abbreviation ("... from Rao & Co.") already has its full stop. */
const sentence = (text: string): string => (text.endsWith('.') ? text : `${text}.`);

const SHOPS = [
  "Sunita's cloth shop",
  'Imran Electronics',
  'Gurpreet Stationers',
  "Meena's bakery",
  'Arjun Traders',
  'Lakshmi Tailoring',
  "Faisal's mobile shop",
  'Joseph Hardware',
];
const shop = (rng: Rng): string => rng.pick(SHOPS);

// Named businesses of many kinds, for the templates raised to a later version and the ones added later (the eight
// SHOPS stay with the templates that are set in mock papers, so that those do not move). A business that deals in
// goods (a trader or a small maker) is drawn wherever stock, goods sold or goods taken by the owner come in.
const GOODS_FIRMS = [
  'Kaveri Agro Inputs, a seed and fertiliser dealer,',
  'Noor Footwear',
  'Patil Hardware Mart',
  'Lalitha Silk Sarees',
  'Bose Electricals',
  'Rao Spice Traders',
  'Khanna Sports Store',
  'Ansari Furniture Works, a small workshop,',
  'Thomas Bakery Products',
  'Rajput Cartons, a box maker,',
];
const SERVICE_FIRMS = [
  'Iyer Dental Clinic',
  'Bright Minds Coaching Centre',
  'Gill Roadways, a truck operator,',
  'Fernandes Event Planners',
  'Hegde Computer Repairs',
  'Desai Tax Consultants',
];
/** A business that deals in goods: its name as the subject of a sentence ("Ansari Furniture Works, a small workshop,"). */
const goodsFirm = (rng: Rng): string => rng.pick(GOODS_FIRMS);
/** Any business, of goods or of services. */
const anyFirm = (rng: Rng): string => rng.pick([...GOODS_FIRMS, ...SERVICE_FIRMS]);
/** A firm's name where it ends a phrase ("the books of Kaveri Agro Inputs"): the description after it is dropped. */
const bare = (name: string): string => name.replace(/,.*$/, '');

// Hints, one pair to a family of questions.
const TOTALS_HINTS = [
  'Write the opening Assets, Liabilities and Capital side by side, then apply the transactions one at a time.',
  "After each transaction check that Assets = Liabilities + Capital. Capital moves only with an income, an expense, a profit or loss on goods, and the owner's own dealings (capital brought in, drawings).",
];
const CLOSING_HINTS = [
  'Closing capital = Opening capital + Additional capital + Profit - Drawings (deduct a loss instead of adding a profit).',
  'Put the figures given into that line and solve it for the one that is missing. To find the profit, add the drawings back and take the additional capital away.',
];
const MISSING_HINTS = [
  'Assets = Liabilities + Capital. Add up each list of items first.',
  'Then move the unknown to one side: Capital = Assets - Liabilities; Liabilities = Assets - Capital; an asset = Liabilities + Capital - the other assets.',
];
const PICK_HINTS = [
  'Write the effect of each transaction as assets up or down, liabilities up or down, capital up or down.',
  'Then test each one against the question. An asset bought or collected with another asset leaves every total as it was; an expense, a loss or drawings lowers assets (or raises liabilities) and lowers capital.',
];
const ADJUST_HINTS = [
  'Ask what belongs to this year: an expense or an income of the year changes capital whether or not cash has moved.',
  'An unpaid expense and income received in advance are liabilities; a prepaid expense and income earned but not received are assets. Depreciation, bad debts and an uncovered loss lower an asset and capital together.',
];
const SALE_HINTS = [
  'Goods leave the stock at their cost; the customer pays or owes the selling price.',
  'Only the difference changes capital: a profit (price more than cost) raises it, a loss lowers it.',
];

// ---------------------------------------------------------------------------------------------------------------
// Transactions and their effect on Assets = Liabilities + Capital.
// ---------------------------------------------------------------------------------------------------------------

/** The change a transaction makes to total assets (a), total liabilities (l) and capital (c), in paise. */
interface Eff {
  a: Paise;
  l: Paise;
  c: Paise;
}
const eff = (a: Paise, l: Paise, c: Paise): Eff => ({ a, l, c });
/** A change that keeps the equation true: the change in assets equals the change in liabilities plus capital. */
const balanced = (e: Eff): boolean => e.a === e.l + e.c;

interface Move {
  /** The transaction as a clause that starts with its subject ("the owner brought ..."). */
  text: string;
  e: Eff;
  /** The main amount of the transaction, used to build wrong effects. */
  x: Paise;
  /** One line that says why the effect is what it is. */
  note: string;
  /** No cash or bank money moves in this transaction. */
  noCash?: boolean;
  /** The most tempting wrong effect and the mistake behind it. */
  trap?: { e: Eff; why: string };
  /** Other wrong effects that belong to this transaction in particular, offered before the general ones. */
  also?: { e: Eff; why: string }[];
  /** Wrong amounts a student gives when asked how much one element changes, with the mistake behind each. */
  slips?: { value: Paise; why: string }[];
}
type Pool = 'cap' | 'credit' | 'swap' | 'adjust' | 'hard';
interface MoveDef {
  id: string;
  pools: Pool[];
  /** True when `slips` is filled in, so the amount of the change can be asked. */
  hasSlips: boolean;
  make(rng: Rng): Move;
}
const mv = (id: string, pools: Pool[], make: (rng: Rng) => Move, hasSlips = false): MoveDef => ({ id, pools, hasSlips, make });

const amt = (rng: Rng): Paise => amount(rng, 2000, 40000, 1000);
const ASSETS = ['furniture', 'a computer', 'machinery', 'a refrigerator', 'shop fittings'];
const OLD_ASSETS = ['old furniture', 'an old computer', 'old machinery', 'an old refrigerator'];
const DEP_ON = ['machinery', 'furniture', 'the delivery van', 'the computers'];
const EXPENSES = ['shop rent', 'staff salaries', 'electricity charges', 'advertising charges', 'repair charges', 'telephone charges'];
const INCOMES = ['commission', 'interest on a bank deposit', 'rent from a sub-tenant', 'dividend on shares'];
const ACCRUED = [
  (x: string) => `commission of ${x} has been earned but is not yet received`,
  (x: string) => `interest of ${x} on a deposit has been earned but is not yet received`,
  (x: string) => `rent of ${x} from a sub-tenant has been earned but is not yet received`,
];

const MOVES: MoveDef[] = [
  mv('capital-cash', ['cap'], (rng) => {
    const x = amt(rng);
    return {
      x,
      text: `the owner brought ${f(x)} in cash as additional capital`,
      e: eff(x, 0, x),
      note: "Cash, an asset, comes in, and the owner's claim on the business (capital) rises by the same amount.",
      trap: { e: eff(x, x, 0), why: "Treated the owner's money as a loan from an outsider." },
    };
  }),
  mv('capital-asset', ['cap'], (rng) => {
    const x = amt(rng);
    return {
      x,
      text: `the owner brought ${rng.pick(ASSETS)} worth ${f(x)} into the business as capital`,
      e: eff(x, 0, x),
      noCash: true,
      note: "An asset comes in and the owner's capital rises by its value; no cash is involved.",
      trap: { e: eff(0, 0, 0), why: 'Treated it as one asset replacing another, though nothing in the business was given up.' },
    };
  }),
  mv('drawings-cash', ['cap'], (rng) => {
    const x = amt(rng);
    return {
      x,
      text: `the owner withdrew ${f(x)} in cash for personal use`,
      e: eff(-x, 0, -x),
      note: 'Drawings reduce the owner\'s capital, and the cash that leaves is an asset.',
      trap: { e: eff(-x, -x, 0), why: 'Treated the withdrawal as the repayment of a debt.' },
    };
  }),
  mv('drawings-goods', ['cap'], (rng) => {
    const x = amt(rng);
    return {
      x,
      text: `the owner took goods costing ${f(x)} from the shop for personal use`,
      e: eff(-x, 0, -x),
      noCash: true,
      note: 'Goods taken for personal use are drawings: stock, an asset, falls and capital falls by its cost.',
      trap: { e: eff(-x, -x, 0), why: 'Treated the goods taken home as the repayment of a liability.' },
    };
  }),
  mv('expense-cash', ['cap'], (rng) => {
    const x = amt(rng);
    return {
      x,
      text: `the business paid ${rng.pick(EXPENSES)} of ${f(x)} in cash`,
      e: eff(-x, 0, -x),
      note: 'An expense reduces profit and so capital, and the cash paid reduces assets by the same amount.',
      trap: { e: eff(0, 0, 0), why: 'Treated the payment as buying an asset, so only the form of the assets changes.' },
    };
  }),
  mv('income-cash', ['cap'], (rng) => {
    const x = amt(rng);
    return {
      x,
      text: `the business received ${f(x)} in cash as ${rng.pick(INCOMES)}`,
      e: eff(x, 0, x),
      note: 'An income increases profit and so capital, and the cash received increases assets by the same amount.',
      trap: { e: eff(x, x, 0), why: 'Treated the income as an amount owed to someone else.' },
    };
  }),
  mv('credit-asset', ['credit'], (rng) => {
    const x = amt(rng);
    return {
      x,
      text: `the business bought ${rng.pick(ASSETS)} worth ${f(x)} on credit from ${party(rng)}`,
      e: eff(x, x, 0),
      noCash: true,
      note: 'The asset comes in and nothing is paid yet, so the business owes the supplier: a liability.',
      trap: { e: eff(x, 0, x), why: 'Took the purchase as capital brought in by the owner.' },
    };
  }),
  mv('credit-goods', ['credit'], (rng) => {
    const x = amt(rng);
    return {
      x,
      text: `the business bought goods worth ${f(x)} on credit from ${party(rng)}`,
      e: eff(x, x, 0),
      noCash: true,
      note: 'Stock, an asset, increases and the amount owed to the supplier, a liability, increases.',
      trap: { e: eff(0, 0, 0), why: 'Treated it as a cash purchase, where nothing is owed.' },
    };
  }),
  mv('pay-creditor', ['credit'], (rng) => {
    const x = amt(rng);
    return {
      x,
      text: `the business paid ${f(x)} by cheque to ${party(rng)}, a creditor`,
      e: eff(-x, -x, 0),
      note: 'The bank balance, an asset, falls and the amount owed to the creditor, a liability, falls by the same amount.',
      trap: { e: eff(-x, 0, -x), why: 'Treated paying a creditor as an expense.' },
    };
  }),
  mv('loan-bank', ['credit'], (rng) => {
    const x = amount(rng, 10000, 60000, 5000);
    return {
      x,
      text: `the business took a bank loan of ${f(x)}, which was credited to its bank account`,
      e: eff(x, x, 0),
      note: 'The bank balance, an asset, increases and the loan, a liability, increases by the same amount.',
      trap: { e: eff(x, 0, x), why: 'Treated the loan as capital brought in by the owner.' },
    };
  }),
  mv('repay-loan', ['credit'], (rng) => {
    const x = amount(rng, 10000, 40000, 5000);
    return {
      x,
      text: `the business repaid ${f(x)} of its bank loan from its bank account`,
      e: eff(-x, -x, 0),
      note: 'The bank balance, an asset, falls and the loan, a liability, falls by the same amount.',
      trap: { e: eff(-x, 0, -x), why: 'Treated repaying a loan as an expense.' },
    };
  }),
  mv(
    'credit-sale-profit',
    ['credit'],
    (rng) => {
      const c = amount(rng, 10000, 40000, 1000);
      const m = amount(rng, 1000, 5000, 500);
      const s = c + m;
      return {
        x: s,
        text: `the business sold goods costing ${f(c)} on credit to ${party(rng)} for ${f(s)}`,
        e: eff(m, 0, m),
        noCash: true,
        note: `Debtors rise by the selling price (${f(s)}) and stock falls by the cost (${f(c)}), so assets rise only by the profit of ${f(m)}, and so does capital.`,
        trap: { e: eff(s, 0, s), why: 'Counted the whole selling price as the increase instead of only the profit.' },
        slips: [
          { value: s, why: 'Took the whole selling price as the change.' },
          { value: c, why: 'Took the cost of the goods as the change.' },
        ],
      };
    },
    true,
  ),
  mv(
    'cash-sale-profit',
    ['credit'],
    (rng) => {
      const c = amount(rng, 10000, 40000, 1000);
      const m = amount(rng, 1000, 5000, 500);
      const s = c + m;
      return {
        x: s,
        text: `the business sold goods costing ${f(c)} for ${f(s)} in cash`,
        e: eff(m, 0, m),
        note: `Cash rises by the selling price (${f(s)}) and stock falls by the cost (${f(c)}), so assets rise only by the profit of ${f(m)}, and so does capital.`,
        trap: { e: eff(s, 0, s), why: 'Counted the whole selling price as the increase instead of only the profit.' },
        slips: [
          { value: s, why: 'Took the whole selling price as the change.' },
          { value: c, why: 'Took the cost of the goods as the change.' },
        ],
      };
    },
    true,
  ),
  mv(
    'sale-loss',
    ['credit', 'hard'],
    (rng) => {
      const c = amount(rng, 12000, 40000, 1000);
      const m = amount(rng, 500, 3000, 500);
      const s = c - m;
      const onCredit = rng.next() < 0.5;
      return {
        x: c,
        text: onCredit
          ? `the business sold goods costing ${f(c)} on credit to ${party(rng)} for ${f(s)}`
          : `the business sold goods costing ${f(c)} for ${f(s)} in cash`,
        e: eff(-m, 0, -m),
        noCash: onCredit,
        note: `${onCredit ? 'Debtors rise' : 'Cash rises'} by the selling price (${f(s)}) but stock falls by the cost (${f(c)}), so assets fall by the loss of ${f(m)}, and so does capital.`,
        trap: { e: eff(-c, 0, -c), why: 'Deducted the whole cost of the goods instead of only the loss.' },
        slips: [
          { value: c, why: 'Took the whole cost of the goods as the change.' },
          { value: s, why: 'Took the selling price as the change.' },
        ],
      };
    },
    true,
  ),
  mv('collect-debtor', ['swap'], (rng) => {
    const x = amt(rng);
    return {
      x,
      text: `the business received ${f(x)} in cash from ${party(rng)}, a debtor`,
      e: eff(0, 0, 0),
      note: 'Cash, an asset, increases and debtors, another asset, decrease by the same amount.',
      trap: { e: eff(x, 0, x), why: 'Counted money received from a debtor as a new income.' },
    };
  }),
  mv('deposit', ['swap'], (rng) => {
    const x = amt(rng);
    return {
      x,
      text: `the business deposited ${f(x)} of its cash into its bank account`,
      e: eff(0, 0, 0),
      note: 'The bank balance, an asset, increases and cash in hand, another asset, decreases by the same amount.',
      trap: { e: eff(x, 0, x), why: 'Took the deposit as new money brought in by the owner.' },
    };
  }),
  mv('buy-asset-cash', ['swap'], (rng) => {
    const x = amt(rng);
    return {
      x,
      text: `the business bought ${rng.pick(ASSETS)} for ${f(x)} and paid by cheque`,
      e: eff(0, 0, 0),
      note: 'The new asset replaces the same value of bank balance: one asset rises and another falls.',
      trap: { e: eff(-x, 0, -x), why: 'Treated buying an asset as an expense.' },
    };
  }),
  mv('buy-goods-cash', ['swap'], (rng) => {
    const x = amt(rng);
    return {
      x,
      text: `the business bought goods for ${f(x)} in cash`,
      e: eff(0, 0, 0),
      note: 'Stock, an asset, increases and cash, another asset, decreases by the same amount.',
      trap: { e: eff(-x, 0, -x), why: 'Treated buying goods as an expense that reduces capital.' },
    };
  }),
  mv('return-supplier', ['credit'], (rng) => {
    const x = amount(rng, 2000, 20000, 1000);
    return {
      x,
      text: `the business returned goods worth ${f(x)}, bought on credit and not yet paid for, to ${party(rng)}`,
      e: eff(-x, -x, 0),
      noCash: true,
      note: 'Stock, an asset, falls and the amount still owed to the supplier, a liability, falls by the same amount.',
      trap: { e: eff(-x, 0, -x), why: 'Treated the returned goods as a loss.' },
    };
  }),
  mv('bill-accepted', ['swap', 'hard'], (rng) => {
    const x = amt(rng);
    return {
      x,
      text: `the business accepted a bill of exchange for ${f(x)} drawn by ${party(rng)}, a creditor, in place of the amount due`,
      e: eff(0, 0, 0),
      noCash: true,
      note: 'Bills payable replace creditors: one liability rises and another falls by the same amount.',
      trap: { e: eff(-x, -x, 0), why: 'Treated accepting the bill as paying the creditor.' },
    };
  }),
  mv('bill-received', ['swap'], (rng) => {
    const x = amt(rng);
    return {
      x,
      text: `${party(rng)}, a debtor, gave the business a bill of exchange for ${f(x)} in place of the amount due`,
      e: eff(0, 0, 0),
      noCash: true,
      note: 'Bills receivable replace debtors: one asset rises and another falls by the same amount.',
      trap: { e: eff(x, 0, x), why: 'Counted the bill as a new income.' },
    };
  }),
  mv('prepaid-all', ['swap', 'adjust'], (rng) => {
    const x = amount(rng, 2000, 20000, 1000);
    return {
      x,
      text: `the business paid ${f(x)} in cash as rent for the first month of the next accounting year`,
      e: eff(0, 0, 0),
      note: 'Rent paid in advance is an asset (prepaid rent): cash falls and prepaid rent rises by the same amount.',
      trap: { e: eff(-x, 0, -x), why: "Charged the advance payment as this year's expense." },
    };
  }),
  mv('outstanding', ['adjust'], (rng) => {
    const x = amount(rng, 2000, 30000, 1000);
    return {
      x,
      text: `${rng.pick(EXPENSES)} of ${f(x)} for the last month of the year remained unpaid when the year ended`,
      e: eff(0, x, -x),
      noCash: true,
      note: 'An expense of this year that is still unpaid (an outstanding expense) is charged all the same, so capital falls, and the business owes it, so liabilities rise. Assets do not change.',
      trap: { e: eff(-x, 0, -x), why: 'Reduced assets, though no money has been paid yet.' },
    };
  }),
  mv(
    'prepaid-part',
    ['adjust'],
    (rng) => {
      const month = amount(rng, 500, 3000, 500);
      const k = rng.int(2, 5);
      const x = month * 12;
      const y = month * k;
      return {
        x,
        text: `the business paid by cheque an insurance premium of ${f(x)} for 12 months, of which ${k} months fall in the next accounting year`,
        e: eff(-(x - y), 0, -(x - y)),
        note: `The bank balance falls by ${f(x)}. Only the ${12 - k} months of this year (${f(x)} x ${12 - k}/12 = ${f(x - y)}) are an expense; the other ${f(y)} is prepaid insurance, an asset. So assets and capital fall by ${f(x - y)}.`,
        trap: { e: eff(-x, 0, -x), why: 'Charged the whole premium as an expense, ignoring the prepaid part.' },
        also: [{ e: eff(-y, 0, -y), why: 'Charged the months of the next year as the expense, instead of the months of this year.' }],
        slips: [
          { value: x, why: 'Took the whole premium as the change.' },
          { value: y, why: 'Took only the prepaid part as the change.' },
        ],
      };
    },
    true,
  ),
  mv('accrued', ['adjust'], (rng) => {
    const x = amount(rng, 2000, 20000, 1000);
    return {
      x,
      text: rng.pick(ACCRUED)(f(x)),
      e: eff(x, 0, x),
      noCash: true,
      note: 'Accrued income is an asset (a receivable) and part of this year\'s profit, so assets and capital both rise.',
      trap: { e: eff(0, 0, 0), why: 'Ignored income that is earned but not yet received.' },
    };
  }),
  mv('advance', ['adjust'], (rng) => {
    const x = amount(rng, 2000, 20000, 1000);
    return {
      x,
      text: `the business received ${f(x)} in cash as rent for a period that falls in the next year`,
      e: eff(x, x, 0),
      note: 'Cash comes in but the rent is not yet earned, so the business owes the service: income received in advance is a liability.',
      trap: { e: eff(x, 0, x), why: "Counted income received in advance as this year's income." },
    };
  }),
  mv('depreciation', ['adjust'], (rng) => {
    const x = amount(rng, 2000, 30000, 1000);
    return {
      x,
      text: `depreciation of ${f(x)} was charged on ${rng.pick(DEP_ON)}`,
      e: eff(-x, 0, -x),
      noCash: true,
      note: "Depreciation is an expense: the asset's book value falls and so does capital, though no cash is paid.",
      trap: { e: eff(0, 0, 0), why: 'Thought depreciation does not matter because no cash is paid.' },
    };
  }),
  mv('bad-debt', ['adjust'], (rng) => {
    const x = amount(rng, 2000, 20000, 1000);
    return {
      x,
      text: `${party(rng)}, a debtor, could not pay, and ${f(x)} due from the debtor was written off as a bad debt`,
      e: eff(-x, 0, -x),
      noCash: true,
      note: 'A bad debt written off is a loss: debtors, an asset, fall and so does capital.',
      trap: { e: eff(0, 0, 0), why: 'Thought that no cash moves, so nothing changes.' },
    };
  }),
  mv('theft', ['adjust'], (rng) => {
    const x = amount(rng, 2000, 30000, 1000);
    return {
      x,
      text: `goods costing ${f(x)} were stolen from the shop and the loss is not covered by insurance`,
      e: eff(-x, 0, -x),
      noCash: true,
      note: 'Stock, an asset, falls and the loss reduces capital by the same amount.',
      trap: { e: eff(0, 0, 0), why: 'Thought that no cash is paid, so the totals do not change.' },
    };
  }),
  mv(
    'discount-allowed',
    ['hard'],
    (rng) => {
      const due = amount(rng, 10000, 40000, 2000);
      const d = Math.round((due * rng.pick([5, 10])) / 100);
      return {
        x: due,
        text: `the business received ${f(due - d)} in cash from ${party(rng)} in full settlement of ${f(due)} due from the debtor`,
        e: eff(-d, 0, -d),
        note: `Debtors fall by the full ${f(due)} but cash rises by only ${f(due - d)}. The ${f(d)} given up is discount allowed, a loss, so assets and capital fall by it.`,
        trap: { e: eff(0, 0, 0), why: 'Treated it as an ordinary receipt from a debtor, ignoring the discount given.' },
        also: [{ e: eff(due - d, 0, due - d), why: 'Counted the cash received from the debtor as a new income.' }],
        slips: [
          { value: due, why: 'Took the whole amount due as the change.' },
          { value: due - d, why: 'Took the cash actually received as the change.' },
        ],
      };
    },
    true,
  ),
  mv(
    'discount-received',
    ['hard'],
    (rng) => {
      const due = amount(rng, 10000, 40000, 2000);
      const d = Math.round((due * rng.pick([5, 10])) / 100);
      return {
        x: due,
        text: `the business paid ${f(due - d)} in cash to ${party(rng)} in full settlement of ${f(due)} owed to the creditor`,
        e: eff(-(due - d), -due, d),
        note: `The creditor falls by the full ${f(due)} but only ${f(due - d)} leaves the business. The ${f(d)} saved is discount received, a gain, so capital rises by it.`,
        trap: { e: eff(-(due - d), -(due - d), 0), why: 'Reduced the liability only by the cash paid, ignoring the discount.' },
        also: [
          { e: eff(-due, -due, 0), why: 'Took the full amount owed as paid in cash, ignoring the discount.' },
          { e: eff(-(due - d), 0, -(due - d)), why: 'Treated the payment to the creditor as an expense.' },
        ],
        slips: [
          { value: due, why: 'Took the whole amount owed as the change.' },
          { value: due - d, why: 'Took the cash actually paid as the change.' },
          { value: d, why: 'Took only the discount as the change.' },
        ],
      };
    },
    true,
  ),
  mv(
    'fire-claim',
    ['hard'],
    (rng) => {
      const x = amount(rng, 8000, 40000, 4000);
      const y = (x * 3) / 4;
      return {
        x,
        text: `goods costing ${f(x)} were destroyed by fire, and the insurance company admitted a claim of ${f(y)}`,
        e: eff(-(x - y), 0, -(x - y)),
        noCash: true,
        note: `Stock falls by ${f(x)}, but the claim of ${f(y)} admitted by the insurance company is a new asset (insurance claim receivable). Only the ${f(x - y)} not covered is a loss, so assets and capital fall by it.`,
        trap: { e: eff(-x, 0, -x), why: 'Treated the whole value of the goods as lost, ignoring the insurance claim.' },
        also: [{ e: eff(-y, 0, -y), why: 'Took the claim admitted as the loss, instead of the part of the cost that the claim does not cover.' }],
        slips: [
          { value: x, why: 'Took the whole cost of the goods as the change.' },
          { value: y, why: 'Took the claim admitted as the change.' },
        ],
      };
    },
    true,
  ),
  mv(
    'asset-sale-profit',
    ['hard'],
    (rng) => {
      const b = amount(rng, 12000, 40000, 1000);
      const g = amount(rng, 500, 4000, 500);
      const s = b + g;
      return {
        x: s,
        text: `the business sold ${rng.pick(OLD_ASSETS)} with a book value of ${f(b)} for ${f(s)} in cash`,
        e: eff(g, 0, g),
        note: `Cash rises by ${f(s)} and the asset leaves at its book value of ${f(b)}, so assets rise by the profit of ${f(g)}, and so does capital.`,
        trap: { e: eff(s, 0, s), why: 'Counted the whole sale price as the increase instead of only the profit.' },
        slips: [
          { value: s, why: 'Took the whole sale price as the change.' },
          { value: b, why: 'Took the book value of the asset as the change.' },
        ],
      };
    },
    true,
  ),
  mv(
    'asset-sale-loss',
    ['hard'],
    (rng) => {
      const b = amount(rng, 12000, 40000, 1000);
      const g = amount(rng, 500, 4000, 500);
      const s = b - g;
      return {
        x: b,
        text: `the business sold ${rng.pick(OLD_ASSETS)} with a book value of ${f(b)} for ${f(s)} in cash`,
        e: eff(-g, 0, -g),
        note: `Cash rises by ${f(s)} and the asset leaves at its book value of ${f(b)}, so assets fall by the loss of ${f(g)}, and so does capital.`,
        trap: { e: eff(-b, 0, -b), why: 'Deducted the whole book value instead of only the loss.' },
        slips: [
          { value: b, why: 'Took the whole book value as the change.' },
          { value: s, why: 'Took the sale price as the change.' },
        ],
      };
    },
    true,
  ),
  mv('owner-paid-creditor', ['hard'], (rng) => {
    const x = amt(rng);
    return {
      x,
      text: `the owner paid ${f(x)} due to ${party(rng)}, a creditor of the business, out of personal savings`,
      e: eff(0, -x, x),
      noCash: true,
      note: "No money of the business is used. The business owes the creditor less, and the amount the owner paid for it counts as fresh capital: a liability falls and capital rises. Assets do not change.",
      trap: { e: eff(-x, -x, 0), why: 'Took it as the business paying the creditor from its own cash.' },
      also: [{ e: eff(-x, 0, -x), why: 'Took it as drawings, as if the owner had taken the money out of the business.' }],
    };
  }),
];

/**
 * Transactions added after the papers were set, used only by the templates added with them (ae-effect-more,
 * ae-totals-more): a sales return that takes back the profit, goods given away, a deal partly in cash, a private
 * payment from the business cash and commission received in advance. They are kept out of MOVES, so that no question
 * drawn from MOVES (and no simulator scene) changes.
 */
const MORE_MOVES: MoveDef[] = [
  mv(
    'sales-return',
    [],
    (rng) => {
      const c = amount(rng, 10000, 40000, 1000);
      const m = amount(rng, 1000, 5000, 500);
      const s = c + m;
      return {
        x: s,
        text: `${party(rng)}, a customer, returned goods that had been sold on credit for ${f(s)} and had cost ${f(c)}, and the goods were taken back into stock`,
        e: eff(-m, 0, -m),
        noCash: true,
        note: `Debtors fall by the selling price (${f(s)}) and stock comes back at its cost (${f(c)}), so assets fall by the profit of ${f(m)} that was counted on the sale, and capital falls with them.`,
        trap: { e: eff(-s, 0, -s), why: 'Took the whole selling price off assets and capital, forgetting that the goods come back into stock.' },
        also: [{ e: eff(0, 0, 0), why: 'Thought the goods coming back exactly make up for the amount the customer no longer owes.' }],
        slips: [
          { value: s, why: 'Took the selling price of the goods returned as the change.' },
          { value: c, why: 'Took the cost of the goods returned as the change.' },
        ],
      };
    },
    true,
  ),
  mv('goods-given-away', [], (rng) => {
    const x = amt(rng);
    return {
      x,
      text: `the business gave away goods costing ${f(x)} ${rng.pick(['as charity to a flood relief fund', 'as free samples to customers', 'as charity to a village school'])}`,
      e: eff(-x, 0, -x),
      noCash: true,
      note: 'Goods given away bring nothing back: stock, an asset, falls by their cost, and the charity (or the samples, an advertisement expense) reduces capital by the same amount.',
      trap: { e: eff(0, 0, 0), why: 'Thought nothing changes because no cash was paid.' },
      also: [{ e: eff(-x, -x, 0), why: 'Treated the goods given away as goods returned to a supplier.' }],
    };
  }),
  mv(
    'part-cash-purchase',
    [],
    (rng) => {
      const x = amount(rng, 8000, 40000, 4000);
      const y = (x * rng.pick([1, 2, 3])) / 4;
      return {
        x,
        text: `the business bought goods for ${f(x)} from ${party(rng)}, paying ${f(y)} in cash at once and owing the rest`,
        e: eff(x - y, x - y, 0),
        note: `Stock rises by ${f(x)} and cash falls by ${f(y)}, so assets rise by ${f(x - y)}; the ${f(x - y)} still owed to the supplier is a liability. Capital does not change.`,
        trap: { e: eff(0, 0, 0), why: 'Treated the whole purchase as a cash purchase.' },
        also: [{ e: eff(x, x, 0), why: 'Treated the whole purchase as a credit purchase, forgetting the cash paid at once.' }],
        slips: [
          { value: x, why: 'Took the whole price of the goods as the change.' },
          { value: y, why: 'Took the cash paid as the change.' },
        ],
      };
    },
    true,
  ),
  mv('private-payment', [], (rng) => {
    const x = amount(rng, 5000, 40000, 1000);
    return {
      x,
      text: `the business paid ${rng.pick(["the owner's personal income tax", "the premium on the owner's life insurance policy"])} of ${f(x)} out of its cash`,
      e: eff(-x, 0, -x),
      note: "A payment for the owner's own needs is drawings, not an expense of the business: cash falls and capital falls by the same amount.",
      trap: { e: eff(-x, -x, 0), why: 'Treated it as paying off a debt of the business.' },
      also: [{ e: eff(0, 0, 0), why: "Thought a private payment has no place in the business's books, though business cash went out." }],
    };
  }),
  mv('commission-advance', [], (rng) => {
    const x = amount(rng, 2000, 20000, 1000);
    return {
      x,
      text: `the business received ${f(x)} in cash as commission for work it will do next year`,
      e: eff(x, x, 0),
      note: 'Cash comes in, but the commission is not yet earned: it is income received in advance, a liability, until the work is done.',
      trap: { e: eff(x, 0, x), why: "Counted commission received in advance as this year's income." },
    };
  }),
];

/**
 * Gives each transaction of a list its own party, so that nobody is a debtor in one item and a creditor in another
 * item of the same question. Only the name in the transaction's own text is changed.
 */
function withDistinctParties(moves: Move[]): Move[] {
  const used = new Set<string>();
  return moves.map((m) => {
    const name = PARTIES.find((p) => m.text.includes(p));
    if (name === undefined) return m;
    const free = used.has(name) ? PARTIES.find((p) => !used.has(p)) : name;
    if (free === undefined) return m;
    used.add(free);
    return free === name ? m : { ...m, text: m.text.replace(name, free) };
  });
}

/** The moves of the given pools. */
const defsOf = (...pools: Pool[]): MoveDef[] => MOVES.filter((d) => d.pools.some((p) => pools.includes(p)));

// How an effect is written as an option, and read back by the checks.
const clause = (word: string, v: Paise): string =>
  v === 0 ? `${word} unchanged` : `${word} ${v > 0 ? 'increase' : 'decrease'}${word === 'capital' ? 's' : ''} by ${f(Math.abs(v))}`;
const describe = (e: Eff): string =>
  e.a === 0 && e.l === 0 && e.c === 0
    ? 'Assets, liabilities and capital all unchanged'
    : `${clause('Assets', e.a)}, ${clause('liabilities', e.l)}, ${clause('capital', e.c)}`;
const part = (word: string, text: string): Paise | null => {
  const m = new RegExp(`${word} (?:(increase|decrease)s? by (${RUPEES.source})|unchanged)`, 'i').exec(text);
  if (!m) return null;
  if (!m[1]) return 0;
  const v = parseRupees(m[2]);
  return v === null ? null : m[1] === 'increase' ? v : -v;
};
/** Reads an effect back from text written by `describe`; null when the text does not contain one. */
const parseEffect = (text: string): Eff | null => {
  if (/all unchanged/i.test(text)) return eff(0, 0, 0);
  const a = part('assets', text);
  const l = part('liabilities', text);
  const c = part('capital', text);
  return a === null || l === null || c === null ? null : eff(a, l, c);
};

/**
 * Three wrong effects for a transaction, each a mistake students make. The transaction's own mistakes (its trap,
 * then `also`) come first and are always offered; the general ones fill the remaining places. Only effects that
 * keep the equation true, differ from the right one and differ from each other are listed.
 */
function wrongsFor(rng: Rng, m: Move): { e: Eff; why: string }[] {
  const { a, l, c } = m.e;
  const x = m.x;
  const own = [...(m.trap ? [m.trap] : []), ...(m.also ?? [])];
  const general: { e: Eff; why: string }[] =
    a === 0 && l === 0 && c === 0
      ? rng.shuffle([
          { e: eff(x, x, 0), why: 'Thought a new amount is owed, as if the business had bought on credit.' },
          { e: eff(x, 0, x), why: "Took it as new value coming in and adding to the owner's capital." },
          { e: eff(-x, 0, -x), why: 'Treated it as an expense or drawings, as if the value was lost.' },
          { e: eff(-x, -x, 0), why: 'Treated it as the repayment of a liability.' },
        ])
      : [
          ...(l === 0 && c !== 0 ? [{ e: eff(a, c, 0), why: 'Put the change on the liabilities side instead of capital.' }] : []),
          ...(c === 0 && l !== 0 ? [{ e: eff(a, 0, l), why: 'Put the change in capital instead of liabilities.' }] : []),
          {
            e: eff(0, 0, 0),
            why: m.noCash ? 'Thought that nothing changes because no cash or bank money moves.' : 'Thought one item only replaces another, so that no total changes.',
          },
          { e: eff(-a, -l, -c), why: 'Reversed the direction of every change.' },
        ];
  const seen = new Set([describe(m.e)]);
  return [...own, ...general].filter((w) => balanced(w.e) && !seen.has(describe(w.e)) && seen.add(describe(w.e))).slice(0, 3);
}

/** The question "what is the effect?" about one transaction drawn from the pools, leaving out the moves named in `skip`. */
function effectMcq(rng: Rng, pools: Pool[], skip: string[] = [], hints?: string[]): McqParts {
  return effectMcqOf(rng, defsOf(...pools).filter((d) => !skip.includes(d.id)), shop, hints);
}

/** The template with `hints` on every question it makes, in place of the default pair. */
function addHints<X extends { generate(rng: Rng): object | null }>(t: X, hints: string[]): X {
  const generate = t.generate;
  return { ...t, generate: (rng: Rng) => {
    const parts = generate(rng);
    return parts === null ? null : { ...parts, hints };
  } } as X;
}

/** The effect question about one transaction drawn from `defs`, the business named by `firm`. */
function effectMcqOf(rng: Rng, defs: MoveDef[], firm: (rng: Rng) => string, hints?: string[]): McqParts {
  const m = rng.pick(defs).make(rng);
  const frames = [
    `${sentence(cap(m.text))} How does this transaction change total assets, total liabilities and capital?`,
    `In the books of ${bare(firm(rng))}: ${sentence(m.text)} Which of these gives its effect on total assets, total liabilities and capital?`,
    `Consider this transaction: ${sentence(m.text)} What is its effect on the totals of the accounting equation?`,
  ];
  const correct = describe(m.e);
  return {
    prompt: rng.pick(frames),
    correct,
    distractors: wrongsFor(rng, m).map((w) => ({ text: describe(w.e), why: w.why })),
    explanation: `${m.note} ${correct}. Check: change in assets (${sg(m.e.a)}) = change in liabilities (${sg(m.e.l)}) + change in capital (${sg(m.e.c)}).`,
    hints: hints ?? [
      'Decide whether each total (assets, liabilities, capital) goes up, goes down or stays the same.',
      'The change in assets must equal the change in liabilities plus the change in capital.',
    ],
  };
}

/** Check for the effect questions: the right option is a balanced effect, the explanation repeats it, no wrong option equals it. */
const verifyEffect = (q: McqQuestion): boolean => {
  const right = q.options.find((o) => o.id === q.correct)?.text ?? '';
  const e = parseEffect(right);
  if (e === null || !balanced(e) || !q.explanation.includes(right)) return false;
  return q.options.every((o) => o.id === q.correct || o.text !== right);
};

// ---------------------------------------------------------------------------------------------------------------
// Totals after a list of transactions.
// ---------------------------------------------------------------------------------------------------------------

interface Pos {
  a: Paise;
  l: Paise;
  c: Paise;
}
const addEff = (p: Pos, e: Eff): Pos => ({ a: p.a + e.a, l: p.l + e.l, c: p.c + e.c });
/** What is asked: assets, liabilities, capital, or liabilities plus capital. */
type Ask = 'a' | 'l' | 'c' | 'lc';
const askValue = (p: Pos, k: Ask): Paise => (k === 'a' ? p.a : k === 'l' ? p.l : k === 'c' ? p.c : p.l + p.c);
const ASK_PHRASE: Record<Ask, string[]> = {
  a: ['What is the total of its assets at the end of the year?', 'Find the total assets after all these transactions.'],
  l: ['What are its total liabilities at the end of the year?', 'Find the total liabilities after all these transactions.'],
  c: ["What is the owner's capital at the end of the year?", 'Find the capital after all these transactions.'],
  lc: ['What is the total of liabilities plus capital at the end of the year?', 'Find liabilities plus capital after all these transactions.'],
};
const askOf = (prompt: string): Ask => {
  const s = lastSentence(prompt);
  return /plus capital/.test(s) ? 'lc' : /liabilities/.test(s) ? 'l' : /assets/.test(s) ? 'a' : 'c';
};

interface Start {
  p: Pos;
  text: string;
}
/** A starting position, given as assets and liabilities (or, when allowed, as capital and liabilities). */
function opening(rng: Rng, mayGiveCapital: boolean): Start {
  const l = amount(rng, 80000, 300000, 10000);
  const c = amount(rng, 150000, 600000, 10000);
  const p = { a: l + c, l, c };
  const giveCapital = mayGiveCapital && rng.next() < 0.4;
  return { p, text: giveCapital ? `capital of ${f(c)} and liabilities of ${f(l)}` : `assets of ${f(p.a)} and liabilities of ${f(l)}` };
}

/** A figure to ask for that enough of the transactions change, so that the answer depends on the list. */
function askThatMatters(rng: Rng, moves: Move[], asks: readonly Ask[], need: (a: Ask) => number): Ask | null {
  for (const a of rng.shuffle(asks)) {
    if (moves.filter((m) => askValue({ a: m.e.a, l: m.e.l, c: m.e.c }, a) !== 0).length >= need(a)) return a;
  }
  return null;
}

const pickMoves = (rng: Rng, pools: Pool[], n: number): Move[] =>
  withDistinctParties(
    rng
      .shuffle(defsOf(...pools))
      .slice(0, n)
      .map((d) => d.make(rng)),
  );

const ASK_LABEL: Record<Ask, string> = { a: 'Total assets', l: 'Total liabilities', c: 'Capital', lc: 'Liabilities + Capital' };

function totalsParts(
  rng: Rng,
  o: { moves: Move[]; ask: Ask; start: Start; lead?: string; tail?: string; extraErrors?: (answer: Paise) => { value: Paise; why: string }[] },
): NumericParts | null {
  const { moves, ask, start } = o;
  const single = moves.length === 1;
  const rows: Pos[] = [start.p];
  const lines = [`Opening position: Assets ${f(start.p.a)}, Liabilities ${f(start.p.l)}, Capital ${f(start.p.c)}.`];
  moves.forEach((m, i) => {
    const next = addEff(rows[i], m.e);
    rows.push(next);
    lines.push(
      `${single ? '' : `${ROMAN[i]} `}${cap(m.text)}: assets ${sg(m.e.a)}, liabilities ${sg(m.e.l)}, capital ${sg(m.e.c)}. Now Assets ${f(next.a)}, Liabilities ${f(next.l)}, Capital ${f(next.c)}.`,
    );
  });
  // No figure may run out on the way, for example by repaying more than the business owes.
  if (rows.some((r) => r.a <= 0 || r.l <= 0 || r.c <= 0)) return null;
  const end = rows[rows.length - 1];
  const answer = askValue(end, ask);
  lines.push(
    ask === 'lc'
      ? `Liabilities + Capital = ${f(end.l)} + ${f(end.c)} = ${f(answer)}, which is also the total of assets.`
      : `${ASK_LABEL[ask]} at the end = ${f(answer)}.`,
  );

  // Mistakes. First the usual misreading of a transaction (its trap), those that matter most to the figure asked
  // for first; then leaving out or reversing one of the transactions that matter most.
  const weight = (m: Move) => Math.abs(askValue({ a: m.e.a, l: m.e.l, c: m.e.c }, ask));
  const byWeight = moves.map((m, i) => ({ m, i, w: weight(m) })).sort((p, q) => q.w - p.w);
  const replay = (change: (i: number, e: Eff) => Eff): Paise => askValue(moves.reduce((p, m, i) => addEff(p, change(i, m.e)), start.p), ask);
  const inItem = (i: number, why: string) => (single ? why : `In ${ROMAN[i]}: ${why.charAt(0).toLowerCase()}${why.slice(1)}`);
  const named = (i: number) => (single ? 'the transaction' : `transaction ${ROMAN[i]}`);
  const errors: { value: Paise; why: string }[] = [...(o.extraErrors?.(answer) ?? [])];
  for (const { m, i } of byWeight) {
    const trap = m.trap;
    if (trap) errors.push({ value: replay((j, e) => (j === i ? trap.e : e)), why: inItem(i, trap.why) });
  }
  for (const { i } of byWeight.filter((x) => x.w > 0).slice(0, 2)) {
    errors.push({ value: replay((j, e) => (j === i ? eff(0, 0, 0) : e)), why: `Left out ${named(i)}.` });
    errors.push({ value: replay((j, e) => (j === i ? eff(-e.a, -e.l, -e.c) : e)), why: `Applied ${named(i)} in the wrong direction.` });
  }
  errors.push({ value: askValue(start.p, ask), why: `Gave the opening figure and ignored the ${single ? 'transaction' : 'transactions'}.` });
  const usable = new Set(errors.filter((e) => e.value > 0 && e.value !== answer).map((e) => e.value));
  if (usable.size < 2) return null;

  const items = sentence(single ? moves[0].text : moves.map((m, i) => `${ROMAN[i]} ${m.text}`).join('; '));
  const question = rng.pick(ASK_PHRASE[ask]).replace('all these transactions', single ? 'this transaction' : 'all these transactions');
  const frame = rng.pick([
    `${o.lead ?? shop(rng)} began the year with ${start.text}. During the year: ${items}${o.tail ? ` ${o.tail}` : ''} ${question}`,
    `At the start of the year the books of ${o.lead === undefined ? shop(rng) : bare(o.lead)} showed ${start.text}. Then, during the year: ${items}${o.tail ? ` ${o.tail}` : ''} ${question}`,
  ]);
  return { prompt: frame, answer, commonErrors: errors, explanation: lines };
}

/** Check for the totals questions: every position keeps the equation true, it starts as the prompt says and ends at the answer. */
const verifyRunning = (q: NumericQuestion): boolean => {
  const rows = q.working
    .map((l) => /Assets (₹\d(?:[\d,]*\d)?), Liabilities (₹\d(?:[\d,]*\d)?), Capital (₹\d(?:[\d,]*\d)?)/.exec(l))
    .filter((m): m is RegExpExecArray => m !== null)
    .map((m) => ({ a: parseRupees(m[1]), l: parseRupees(m[2]), c: parseRupees(m[3]) }));
  if (rows.length < 2) return false;
  if (!rows.every((r) => r.a !== null && r.l !== null && r.c !== null && r.a === r.l + r.c)) return false;
  const first = rows[0];
  const given = /(assets|capital) of (₹\d(?:[\d,]*\d)?) and liabilities of (₹\d(?:[\d,]*\d)?)/.exec(q.prompt);
  if (!given) return false;
  if (parseRupees(given[2]) !== (given[1] === 'assets' ? first.a : first.c) || parseRupees(given[3]) !== first.l) return false;
  const last = rows[rows.length - 1];
  const ask = askOf(q.prompt);
  const want = ask === 'a' ? last.a : ask === 'l' ? last.l : ask === 'c' ? last.c : last.a;
  return want === q.answer;
};

// ---------------------------------------------------------------------------------------------------------------
// Capital account: closing capital = opening capital + additional capital + profit - loss - drawings.
// ---------------------------------------------------------------------------------------------------------------

/** o opening capital, a additional capital, p profit, l loss, d drawings, c closing capital. */
type K = 'o' | 'a' | 'p' | 'l' | 'd' | 'c';
const LABEL: Record<K, string> = {
  o: 'opening capital',
  a: 'additional capital',
  p: 'profit',
  l: 'loss',
  d: 'drawings',
  c: 'closing capital',
};
/** A figure as the prompt gives it ("a profit of ₹5,000"). */
const fact = (k: K, v: Paise): string => `${k === 'p' || k === 'l' ? 'a ' : ''}${LABEL[k]} of ${f(v)}`;
/** The terms add up to zero: o + a + p - l - d - c = 0. */
const COEF: Record<K, number> = { o: 1, a: 1, p: 1, l: -1, d: -1, c: -1 };
const KEYS: K[] = ['o', 'a', 'p', 'l', 'd', 'c'];
type Vals = Partial<Record<K, Paise>>;

const solveFor = (u: K, vals: Vals, coef: Record<K, number> = COEF): Paise =>
  -sum(KEYS.filter((k) => k !== u && vals[k] !== undefined).map((k) => coef[k] * (vals[k] ?? 0))) / coef[u];

/** What a student gets by using the wrong sign for one term, or by leaving one term out, when finding `unknown`. */
function slipsFor(vals: Vals, unknown: K): { value: Paise; why: string }[] {
  const out: { value: Paise; why: string }[] = [];
  for (const j of KEYS.filter((k) => k !== unknown && vals[k] !== undefined)) {
    const signInFormula = -COEF[j] / COEF[unknown];
    // Wrong signs on the capitals are made often; leaving out the opening or closing capital is not.
    if (!(j === 'o' && unknown === 'c')) {
      out.push({
        value: solveFor(unknown, vals, { ...COEF, [j]: -COEF[j] }),
        why: signInFormula > 0 ? `Deducted the ${LABEL[j]} figure instead of adding it.` : `Added the ${LABEL[j]} figure instead of deducting it.`,
      });
    }
    if (j !== 'o' && j !== 'c') out.push({ value: solveFor(unknown, vals, { ...COEF, [j]: 0 }), why: `Left out the ${LABEL[j]}.` });
  }
  return out;
}

const ASK_FOR: Record<K, string[]> = {
  c: ['What is the closing capital?', 'Find the closing capital.'],
  o: ['What was the opening capital?', 'Find the opening capital.'],
  a: ['How much additional capital did the owner bring in during the year?', 'Find the additional capital introduced.'],
  p: ['What profit did the business earn for the year?', 'Find the profit for the year.'],
  l: ['What loss did the business suffer for the year?', 'Find the loss for the year.'],
  d: ['How much did the owner withdraw as drawings during the year?', 'Find the drawings for the year.'],
};
const UNKNOWN_ASK: [K, RegExp][] = [
  ['c', /closing capital/],
  ['o', /opening capital/],
  ['a', /additional capital/],
  ['p', /profit/],
  ['l', /loss/],
  ['d', /drawings/],
];

const randomValue = (rng: Rng, k: K): Paise => {
  switch (k) {
    case 'o':
      return amount(rng, 200000, 800000, 10000);
    case 'a':
      return amount(rng, 20000, 150000, 10000);
    case 'p':
      return amount(rng, 30000, 250000, 5000);
    case 'l':
      return amount(rng, 20000, 100000, 5000);
    case 'd':
      return amount(rng, 20000, 120000, 5000);
    default:
      return 0;
  }
};

/** A capital-account question over the given terms (the closing capital is worked out), asking for `unknown`. */
function capitalAccount(rng: Rng, terms: K[], unknown: K, firm: (rng: Rng) => string = shop): NumericParts | null {
  const vals: Vals = {};
  for (const k of terms) vals[k] = randomValue(rng, k);
  const closing = solveFor('c', vals);
  const full: Vals = { ...vals, c: closing };
  const answer = full[unknown] ?? 0;
  if (closing <= 0 || answer <= 0) return null;
  const shown = KEYS.filter((k) => full[k] !== undefined && k !== unknown);
  const facts = shown.map((k) => fact(k, full[k] ?? 0));
  // What the question does not mention is stated, so that nothing has to be assumed.
  const none = [...(terms.includes('d') ? [] : ['made no drawings']), ...(terms.includes('a') ? [] : ['brought in no additional capital'])];
  const convention = none.length === 0 ? '' : ` The owner ${none.join(' and ')} during the year.`;
  const prompt = rng.pick([
    `The books of ${bare(firm(rng))} show, for the year, ${list(facts)}.${convention} ${rng.pick(ASK_FOR[unknown])}`,
    `For the year, ${bare(firm(rng))} reported ${list(facts)}.${convention} ${rng.pick(ASK_FOR[unknown])}`,
  ]);

  const used = KEYS.filter((k) => k !== 'c' && full[k] !== undefined);
  const formula = `Closing capital = ${used
    .map((k, i) => `${i === 0 ? '' : COEF[k] > 0 ? '+ ' : '- '}${cap(LABEL[k])}`)
    .join(' ')}`;
  // The rearranged formula for the unknown, positive terms first.
  const others = KEYS.filter((k) => k !== unknown && full[k] !== undefined).map((k) => ({ k, s: -COEF[k] / COEF[unknown] }));
  const plus = others.filter((t) => t.s > 0);
  const ordered = [...plus.filter((t) => t.k === 'c'), ...plus.filter((t) => t.k !== 'c'), ...others.filter((t) => t.s < 0)];
  const rearranged = ordered.map((t, i) => (i === 0 ? cap(LABEL[t.k]) : `${t.s > 0 ? '+' : '-'} ${cap(LABEL[t.k])}`)).join(' ');
  const numbers = ordered.map((t, i) => (i === 0 ? f(full[t.k] ?? 0) : `${t.s > 0 ? '+' : '-'} ${f(full[t.k] ?? 0)}`)).join(' ');
  const explanation =
    unknown === 'c'
      ? [`${formula}.`, `${numbers} = ${f(answer)}.`]
      : [`${formula}.`, `So ${LABEL[unknown]} = ${rearranged}.`, `${numbers} = ${f(answer)}.`];

  const errors = slipsFor(full, unknown);
  if (new Set(errors.filter((e) => e.value > 0 && e.value !== answer).map((e) => e.value)).size < 2) return null;
  return { prompt, answer, commonErrors: errors, explanation };
}

/** Check for capital-account questions: the figures in the prompt and the answer satisfy the identity. */
const verifyCapitalAccount = (q: NumericQuestion): boolean => {
  const vals: Vals = {};
  const re = /(opening capital|additional capital|closing capital|profit|loss|drawings) of (₹\d(?:[\d,]*\d)?)/g;
  const body = q.prompt.slice(0, q.prompt.length - lastSentence(q.prompt).length);
  for (const m of body.matchAll(re)) {
    const k = KEYS.find((x) => LABEL[x] === m[1]);
    const v = parseRupees(m[2]);
    if (k === undefined || v === null) return false;
    vals[k] = v;
  }
  const unknown = UNKNOWN_ASK.find(([, r]) => r.test(lastSentence(q.prompt)))?.[0];
  if (unknown === undefined || vals[unknown] !== undefined) return false;
  vals[unknown] = q.answer;
  return sum(KEYS.map((k) => COEF[k] * (vals[k] ?? 0))) === 0;
};

// ---------------------------------------------------------------------------------------------------------------
// Which transaction ...? Properties of an effect, for choosing and for counting.
// ---------------------------------------------------------------------------------------------------------------

interface Prop {
  /** The ending of "Which one of these transactions ...?" */
  one: string;
  /** The ending of "How many of these transactions ...?" */
  many: string;
  testE(e: Eff): boolean;
  /** The property also needs that no cash or bank money moves, which an effect alone does not show. */
  needsNoCash?: boolean;
  /** A wrong way of counting for the "how many" question. */
  slip: { test(e: Eff): boolean; why: string };
}
const PROPS: Prop[] = [
  {
    one: 'leaves the total of assets unchanged',
    many: 'leave the total of assets unchanged',
    testE: (e) => e.a === 0,
    slip: { test: (e) => e.c === 0, why: 'Counted the transactions that leave capital unchanged instead of those that leave total assets unchanged.' },
  },
  {
    one: 'increases both total assets and total liabilities',
    many: 'increase both total assets and total liabilities',
    testE: (e) => e.a > 0 && e.l > 0,
    slip: { test: (e) => e.a > 0, why: 'Counted every transaction in which total assets rise, whether or not liabilities rise with them.' },
  },
  {
    one: "reduces the owner's capital",
    many: "reduce the owner's capital",
    testE: (e) => e.c < 0,
    slip: { test: (e) => e.a < 0, why: 'Counted the transactions in which total assets fall instead of those in which capital falls.' },
  },
  {
    one: "increases the owner's capital",
    many: "increase the owner's capital",
    testE: (e) => e.c > 0,
    slip: { test: (e) => e.a > 0, why: 'Counted the transactions in which total assets rise instead of those in which capital rises.' },
  },
  {
    one: 'reduces the total liabilities of the business',
    many: 'reduce the total liabilities of the business',
    testE: (e) => e.l < 0,
    slip: { test: (e) => e.a < 0, why: 'Counted the transactions in which total assets fall instead of those in which total liabilities fall.' },
  },
  {
    one: 'reduces capital without reducing the total of assets',
    many: 'reduce capital without reducing the total of assets',
    testE: (e) => e.c < 0 && e.a >= 0,
    slip: { test: (e) => e.c < 0, why: 'Counted every transaction that reduces capital, including those that also reduce total assets.' },
  },
  {
    one: 'reduces total assets and total liabilities by the same amount',
    many: 'reduce total assets and total liabilities by the same amount',
    testE: (e) => e.a < 0 && e.a === e.l,
    slip: { test: (e) => e.a < 0, why: 'Counted every transaction in which total assets fall, whether or not liabilities fall by the same amount.' },
  },
  {
    one: "changes the owner's capital although no cash or bank balance of the business is affected",
    many: "change the owner's capital although no cash or bank balance of the business is affected",
    testE: (e) => e.c !== 0,
    needsNoCash: true,
    slip: { test: (e) => e.c !== 0, why: 'Counted every transaction that changes capital, including those in which cash or bank money moves.' },
  },
];
const holds = (p: Prop, m: Move): boolean => p.testE(m.e) && (!p.needsNoCash || m.noCash === true);

/** One of the moves that satisfies the property, and three that do not. */
function pickByProperty(rng: Rng, prop: Prop): { yes: Move; no: { m: Move; why: string }[] } | null {
  const made = rng.shuffle(MOVES).map((d) => d.make(rng));
  const yes = made.filter((m) => holds(prop, m));
  const no = made.filter((m) => !holds(prop, m));
  if (yes.length === 0 || no.length < 3) return null;
  // The four options name different parties, so that nobody is a debtor in one option and a creditor in another.
  const [chosen, ...others] = withDistinctParties([rng.pick(yes), ...no.slice(0, 3)]);
  return {
    yes: chosen,
    no: others.map((m) => ({
      m,
      why: prop.needsNoCash
        ? m.e.c === 0
          ? 'Picked a transaction that does not change capital at all.'
          : 'Picked a transaction that changes capital, but cash or bank money does move in it.'
        : `Misjudged this transaction. Its effect is: ${describe(m.e)}.`,
    })),
  };
}

// ---------------------------------------------------------------------------------------------------------------
// Items of the equation (classification).
// ---------------------------------------------------------------------------------------------------------------

type Cat = 'A' | 'L' | 'C' | 'I' | 'E';
const CAT_TEXT: Record<Cat, string> = {
  A: 'An asset',
  L: 'A liability',
  C: "The owner's capital itself",
  I: 'An income or gain, which adds to capital',
  E: 'An expense, loss or drawings, which reduces capital',
};
const CAT_WHY: Record<Cat, Partial<Record<Cat, string>>> = {
  A: {
    L: 'Took something the business owns as something it owes.',
    C: "Mixed up what the business owns with the owner's claim on it.",
    I: 'Took an asset as an income because it is connected with receiving money.',
    E: 'Took something the business keeps as an expense.',
  },
  L: {
    A: 'Took an amount the business owes as something it owns.',
    C: "Treated an amount owed to outsiders as the owner's claim.",
    I: 'Took an amount owed as an income because money comes in.',
    E: 'Took an amount payable as an expense.',
  },
  C: {
    A: "Took the owner's investment as an asset instead of the owner's claim.",
    L: "Treated the owner's investment as a debt to outsiders.",
    I: 'Took capital brought in as an income of the business.',
    E: "Took the owner's capital as an expense.",
  },
  I: {
    A: 'Took an income as an asset because money comes in.',
    L: 'Took an income as an amount owed.',
    C: 'Treated income as capital itself; it reaches capital only through profit.',
    E: 'Took an income as an expense.',
  },
  E: {
    A: 'Took an expense as an asset because something was bought or paid for.',
    L: 'Took an expense as an amount owed.',
    C: 'Treated a deduction from capital as capital itself.',
    I: 'Took an expense or drawings as an income.',
  },
};
/** Why an item of each group belongs there, for the explanation. */
const CAT_REASON: Record<Cat, string> = {
  A: 'The business owns it or is owed it, and it will bring a benefit later.',
  L: 'The business owes it to an outsider and will have to pay it or make it good.',
  C: "It is the owner's claim on the business, not a debt to an outsider and not something the business owns.",
  I: 'It is earned by the business, so it raises the profit and, through the profit, the capital.',
  E: 'It takes value out of the business without leaving an asset behind, so it reduces the capital.',
};
interface Item {
  name: string;
  cat: Cat;
  /** A wrong category that is especially tempting for this item, with the mistake. */
  trick?: [Cat, string];
}
const ITEMS: Item[] = [
  { name: 'stock of goods in hand', cat: 'A' },
  { name: 'amount due from debtors', cat: 'A' },
  { name: 'furniture', cat: 'A' },
  { name: 'balance at the bank', cat: 'A' },
  { name: 'the balance of prepaid insurance', cat: 'A', trick: ['E', 'Took the whole prepaid amount as an expense, though the unexpired part is still an asset.'] },
  { name: 'interest receivable (earned but not yet received)', cat: 'A', trick: ['I', 'Took it as an income only; the amount still to be received is an asset.'] },
  { name: 'bills receivable', cat: 'A', trick: ['L', 'Took a bill as something owed, though it is a promise to pay the business.'] },
  { name: 'goodwill', cat: 'A' },
  { name: 'a delivery van', cat: 'A' },
  { name: 'investments in shares', cat: 'A' },
  { name: 'cash in hand', cat: 'A' },
  { name: 'computers', cat: 'A' },
  { name: 'amount due to creditors', cat: 'L' },
  { name: 'a bank loan', cat: 'L', trick: ['A', 'Took the loan money as an asset, forgetting it has to be repaid.'] },
  { name: 'bills payable', cat: 'L', trick: ['A', 'Took a bill as an asset because it is a document the business holds.'] },
  { name: 'the balance of outstanding salaries', cat: 'L', trick: ['E', 'Took the unpaid salaries as an expense only; the amount still owed is a liability.'] },
  { name: 'the balance of rent received in advance', cat: 'L', trick: ['I', 'Took the advance as income of this year, though the service is still owed.'] },
  { name: 'a bank overdraft', cat: 'L', trick: ['A', 'Took the bank balance as an asset, though an overdraft is money owed to the bank.'] },
  { name: 'a loan taken from a friend', cat: 'L' },
  { name: "the owner's investment in the business", cat: 'C', trick: ['A', "Took the owner's investment as an asset instead of the owner's claim."] },
  { name: 'capital at the start of the year', cat: 'C' },
  { name: 'commission received', cat: 'I' },
  { name: 'interest received on a deposit', cat: 'I' },
  { name: 'rent received from a tenant', cat: 'I' },
  { name: 'dividend received', cat: 'I' },
  { name: 'discount received', cat: 'I' },
  { name: 'drawings', cat: 'E', trick: ['C', 'Took the owner\'s drawings as capital, though they are deducted from it.'] },
  { name: 'rent paid', cat: 'E' },
  { name: 'salaries paid', cat: 'E' },
  { name: 'depreciation charged for the year', cat: 'E', trick: ['A', 'Took depreciation as an asset because it relates to an asset.'] },
  { name: 'bad debts', cat: 'E', trick: ['A', 'Took bad debts as an asset because they come from debtors.'] },
  { name: 'loss of goods by theft', cat: 'E' },
  { name: 'discount allowed', cat: 'E' },
];

// ---------------------------------------------------------------------------------------------------------------
// The generators. mcq first.
// ---------------------------------------------------------------------------------------------------------------

const aeClassify = mcqTemplate({
  id: 'ae-classify',
  topicId: T,
  conceptId: 'ae-equation',
  difficulty: 'easy',
  generate: (rng) => {
    const item = rng.pick(ITEMS);
    // The tempting wrong group, when there is one, is always offered; the other groups are drawn.
    const cats = rng.shuffle((Object.keys(CAT_TEXT) as Cat[]).filter((c) => c !== item.cat && c !== item.trick?.[0]));
    const offered = (item.trick ? [item.trick[0], ...cats] : cats).slice(0, 3);
    const distractors: Distractor[] = offered.map((c) => ({
      text: CAT_TEXT[c],
      why: item.trick && item.trick[0] === c ? item.trick[1] : (CAT_WHY[item.cat][c] ?? 'Put the item in the wrong group.'),
    }));
    return {
      prompt: rng.pick([
        `In the accounting equation, how is "${item.name}" treated?`,
        `Where does "${item.name}" belong when a business's position is written as Assets = Liabilities + Capital?`,
      ]),
      correct: CAT_TEXT[item.cat],
      distractors,
      explanation: `${cap(item.name)}: ${CAT_TEXT[item.cat].charAt(0).toLowerCase()}${CAT_TEXT[item.cat].slice(1)}. ${CAT_REASON[item.cat]}`,
      hints: ['Does the business own it, owe it, or does it belong to the owner?', 'Incomes and expenses change capital through profit; drawings reduce it.'],
    };
  },
  verify: (q) => {
    const name = /"([^"]+)"/.exec(q.prompt)?.[1];
    const item = ITEMS.find((i) => i.name === name);
    return item !== undefined && q.options.find((o) => o.id === q.correct)?.text === CAT_TEXT[item.cat];
  },
});

const FORMS = [
  {
    ask: "the owner's capital",
    correct: 'Assets - Liabilities',
    wrong: [
      ['Assets + Liabilities', 'Added the liabilities instead of deducting them.'],
      ['Liabilities - Assets', 'Subtracted the wrong way round, taking the assets away from the liabilities.'],
      ['Assets', 'Forgot to deduct the liabilities.'],
      ['Liabilities', 'Gave the other claim on the assets instead of the capital.'],
    ],
  },
  {
    ask: 'the total liabilities',
    correct: 'Assets - Capital',
    wrong: [
      ['Assets + Capital', 'Added the capital instead of deducting it.'],
      ['Capital - Assets', 'Subtracted the wrong way round, taking the assets away from the capital.'],
      ['Assets', 'Forgot to deduct the capital.'],
      ['Capital', 'Gave the other claim on the assets instead of the liabilities.'],
    ],
  },
  {
    ask: 'the total assets',
    correct: 'Liabilities + Capital',
    wrong: [
      ['Liabilities - Capital', 'Deducted the capital instead of adding it to the liabilities.'],
      ['Capital - Liabilities', 'Deducted the liabilities from the capital.'],
      ['Liabilities', 'Counted only what is owed to outsiders.'],
      ['Capital', 'Counted only the owner\'s claim.'],
    ],
  },
];
const aeFormPick = addHints(mcqTemplate({
  id: 'ae-form-pick',
  topicId: T,
  conceptId: 'ae-missing',
  difficulty: 'easy',
  version: 2,
  generate: (rng) => {
    const form = rng.pick(FORMS);
    return {
      prompt: rng.pick([
        `Assets = Liabilities + Capital. Which expression gives ${form.ask}?`,
        `The accounting equation holds for every business at all times. Which expression gives ${form.ask}?`,
      ]),
      correct: form.correct,
      distractors: form.wrong.map(([text, why]) => ({ text, why })),
      explanation: `From Assets = Liabilities + Capital, moving a term across the equals sign gives ${form.ask} = ${form.correct}.`,
    };
  },
  verify: (q) => {
    const asked = lastSentence(q.prompt).split('gives ')[1] ?? '';
    const form = FORMS.find((x) => asked.startsWith(x.ask));
    return form !== undefined && q.options.find((o) => o.id === q.correct)?.text === form.correct;
  },
}), [
  'Start from Assets = Liabilities + Capital and keep the item asked for on one side alone.',
  'A term moved across the equals sign changes its sign: what is added on one side is deducted on the other.',
]);

const aeEffectCapital = mcqTemplate({
  id: 'ae-effect-capital',
  topicId: T,
  conceptId: 'ae-expenses-incomes',
  difficulty: 'easy',
  generate: (rng) => effectMcq(rng, ['cap']),
  verify: verifyEffect,
});

const aeEffectCredit = mcqTemplate({
  id: 'ae-effect-credit',
  topicId: T,
  conceptId: 'ae-credit-goods',
  difficulty: 'easy',
  // Rent paid in advance is an adjustment; it is asked in ae-effect-adjust.
  generate: (rng) => effectMcq(rng, ['credit', 'swap'], ['prepaid-all']),
  verify: verifyEffect,
});

const aeEffectAdjust = mcqTemplate({
  id: 'ae-effect-adjust',
  topicId: T,
  conceptId: 'ae-adjustments',
  difficulty: 'medium',
  version: 2,
  generate: (rng) => effectMcqOf(rng, defsOf('adjust'), goodsFirm, ADJUST_HINTS),
  verify: verifyEffect,
});

const aeEffectHard = mcqTemplate({
  id: 'ae-effect-hard',
  topicId: T,
  conceptId: 'ae-effects',
  difficulty: 'complex',
  generate: (rng) => effectMcq(rng, ['hard']),
  verify: verifyEffect,
});

const aeUnchangedPick = addHints(mcqTemplate({
  id: 'ae-unchanged-pick',
  topicId: T,
  conceptId: 'ae-unchanged',
  difficulty: 'easy',
  version: 2,
  generate: (rng) => {
    const prop: Prop = { one: 'does not change the total of assets, liabilities or capital', many: '', testE: (e) => balanced(e) && e.a === 0 && e.l === 0 && e.c === 0, slip: { test: () => false, why: '' } };
    const pick = pickByProperty(rng, prop);
    if (!pick) return null;
    return {
      prompt: rng.pick([
        `Which one of these transactions ${prop.one}?`,
        `Which of the following transactions ${prop.one}? (Each one is a separate transaction of a trading business.)`,
      ]),
      correct: cap(pick.yes.text),
      distractors: pick.no.map(({ m, why }) => ({ text: cap(m.text), why })),
      explanation: `${cap(pick.yes.text)}: ${describe(pick.yes.e)}. ${pick.yes.note}`,
    };
  },
  verify: (q) => {
    const e = parseEffect(q.explanation);
    return e !== null && e.a === 0 && e.l === 0 && e.c === 0 && q.options.filter((o) => o.id !== q.correct).every((o) => {
      const w = parseEffect(o.why ?? '');
      return w !== null && !(w.a === 0 && w.l === 0 && w.c === 0);
    });
  },
}), [
  'Look for a transaction in which one asset takes the place of another, or one liability takes the place of another.',
  'Any income, expense, loss, drawings, loan or credit purchase moves at least one total; an exchange within one side moves none.',
]);

const aePropertyPick = addHints(mcqTemplate({
  id: 'ae-property-pick',
  topicId: T,
  conceptId: 'ae-effects',
  difficulty: 'medium',
  version: 2,
  generate: (rng) => {
    const prop = rng.pick(PROPS);
    const pick = pickByProperty(rng, prop);
    if (!pick) return null;
    return {
      prompt: `Which one of these transactions ${prop.one}?`,
      correct: cap(pick.yes.text),
      distractors: pick.no.map(({ m, why }) => ({ text: cap(m.text), why })),
      explanation: `${cap(pick.yes.text)}: ${describe(pick.yes.e)}. ${pick.yes.note}`,
    };
  },
  verify: (q) => {
    const prop = PROPS.find((p) => q.prompt.includes(p.one));
    const e = parseEffect(q.explanation);
    if (!prop || e === null || !prop.testE(e)) return false;
    if (prop.needsNoCash) return true;
    return q.options.filter((o) => o.id !== q.correct).every((o) => {
      const w = parseEffect(o.why ?? '');
      return w !== null && !prop.testE(w);
    });
  },
}), PICK_HINTS);

// ---------------------------------------------------------------------------------------------------------------
// numeric: effects and totals
// ---------------------------------------------------------------------------------------------------------------

const aeAfterOne = numericTemplate({
  id: 'ae-after-one',
  topicId: T,
  conceptId: 'ae-effects',
  difficulty: 'easy',
  unit: 'rupees',
  version: 2,
  generate: (rng) => {
    const m = rng.pick(defsOf('cap', 'credit')).make(rng);
    const changing = (['a', 'l', 'c'] as const).filter((k) => m.e[k] !== 0);
    if (changing.length === 0) return null;
    const ask = rng.pick(changing);
    const parts = totalsParts(rng, { moves: [m], ask, start: opening(rng, ask !== 'c'), lead: goodsFirm(rng) });
    return parts && { ...parts, hints: TOTALS_HINTS };
  },
  verify: verifyRunning,
});

const aeTotals3 = numericTemplate({
  id: 'ae-totals-3',
  topicId: T,
  conceptId: 'ae-totals',
  difficulty: 'medium',
  unit: 'rupees',
  generate: (rng) => {
    const moves = pickMoves(rng, ['cap', 'credit', 'swap'], 3);
    const ask = askThatMatters(rng, moves, ['a', 'l', 'c'], (a) => (a === 'l' ? 1 : 2));
    return ask === null ? null : totalsParts(rng, { moves, ask, start: opening(rng, ask !== 'c') });
  },
  verify: verifyRunning,
});

const aeTotalsCapital = numericTemplate({
  id: 'ae-totals-capital',
  topicId: T,
  conceptId: 'ae-totals',
  difficulty: 'medium',
  unit: 'rupees',
  version: 2,
  generate: (rng) => {
    const parts = totalsParts(rng, { moves: pickMoves(rng, ['cap', 'adjust', 'credit'], 4), ask: 'c', start: opening(rng, false), lead: goodsFirm(rng) });
    return parts && { ...parts, hints: TOTALS_HINTS };
  },
  verify: verifyRunning,
});

const aeTotalsRhs = numericTemplate({
  id: 'ae-totals-rhs',
  topicId: T,
  conceptId: 'ae-totals',
  difficulty: 'medium',
  unit: 'rupees',
  generate: (rng) => totalsParts(rng, { moves: pickMoves(rng, ['cap', 'credit', 'swap', 'adjust'], 4), ask: 'lc', start: opening(rng, true) }),
  verify: verifyRunning,
});

// Facts that are not transactions, so they change nothing in the equation: a complex question gives one to be left out.
const NOISE = [
  'The owner also plans to open a second shop next year.',
  'The business remained open on all days of the year.',
  'The owner mentions that business was slow in the first week.',
  'A customer placed an order for goods to be delivered next month; nothing has been delivered or paid yet.',
  'The owner was quoted a price for a new counter but has not yet decided to buy it.',
  'A new assistant was appointed, to join next month at a monthly salary.',
  "The owner's own house, which is not used for the business, was repainted during the year.",
  'The landlord has said that the shop rent will rise from next year.',
];
const aeTotals5 = addHints(numericTemplate({
  id: 'ae-totals-5',
  topicId: T,
  conceptId: 'ae-totals',
  difficulty: 'complex',
  unit: 'rupees',
  // Version 2: the fact that is not a transaction is drawn from eight, not three, and the working says it is left out.
  version: 2,
  generate: (rng) => {
    const moves = pickMoves(rng, ['cap', 'credit', 'swap', 'adjust', 'hard'], rng.int(5, 6));
    const ask = askThatMatters(rng, moves, ['a', 'l', 'c'], (a) => (a === 'l' ? 2 : 3));
    if (ask === null) return null;
    const tail = rng.pick(NOISE);
    const parts = totalsParts(rng, { moves, ask, start: opening(rng, false), tail });
    return parts && { ...parts, explanation: [...parts.explanation, `"${tail}" is not a transaction of the business, so it changes nothing.`] };
  },
  verify: verifyRunning,
}), TOTALS_HINTS);

const aeEffectAmount = numericTemplate({
  id: 'ae-effect-amount',
  topicId: T,
  conceptId: 'ae-effects',
  difficulty: 'medium',
  unit: 'rupees',
  generate: (rng) => {
    const m = rng.pick(MOVES.filter((d) => d.hasSlips)).make(rng);
    const k = rng.pick((['a', 'l', 'c'] as const).filter((x) => m.e[x] !== 0));
    const answer = Math.abs(m.e[k]);
    const phrase = { a: 'do the total assets change', l: 'do the total liabilities change', c: "does the owner's capital change" }[k];
    const label = { a: 'the total assets change', l: 'the total liabilities change', c: "the owner's capital changes" }[k];
    const errors = m.slips ?? [];
    if (new Set(errors.filter((e) => e.value !== answer).map((e) => e.value)).size < 2) return null;
    return {
      prompt: `${sentence(cap(m.text))} By what amount ${phrase}? (Give the amount only, not the direction.)`,
      answer,
      commonErrors: errors,
      explanation: [m.note, `${describe(m.e)}.`, `So ${label} by ${f(answer)}.`],
    };
  },
  verify: (q) => {
    const e = parseEffect(q.working.join(' '));
    if (e === null || !balanced(e)) return false;
    const s = lastSentence(q.prompt);
    const k = /total assets/.test(s) ? 'a' : /total liabilities/.test(s) ? 'l' : 'c';
    return Math.abs(e[k]) === q.answer;
  },
});

const aeNetCapitalChange = numericTemplate({
  id: 'ae-net-capital-change',
  topicId: T,
  conceptId: 'ae-expenses-incomes',
  difficulty: 'medium',
  unit: 'rupees',
  generate: (rng) => {
    const moves = pickMoves(rng, ['cap', 'adjust', 'credit', 'hard'], 4);
    const cs = moves.map((m) => m.e.c);
    if (cs.filter((c) => c !== 0).length < 3) return null;
    const net = sum(cs);
    const answer = Math.abs(net);
    if (answer < rupees(1000)) return null; // No change, or one so small that it looks like a slip.
    const order = moves.map((m, i) => ({ i, w: Math.abs(m.e.c) })).sort((p, q) => q.w - p.w);
    const errors = [
      { value: sum(cs.map(Math.abs)), why: 'Added every change as if each one raised capital, ignoring which ones reduce it.' },
      { value: Math.abs(net - cs[order[0].i]), why: `Left out transaction ${ROMAN[order[0].i]}.` },
      { value: Math.abs(net - cs[order[1].i]), why: `Left out transaction ${ROMAN[order[1].i]}.` },
      { value: Math.abs(sum(moves.map((m) => m.e.a))), why: 'Added up the changes in assets instead of the changes in capital.' },
      // The usual misreading of each transaction, where it changes the capital figure.
      ...order.flatMap(({ i }) => {
        const trap = moves[i].trap;
        return trap ? [{ value: Math.abs(net - cs[i] + trap.e.c), why: `In ${ROMAN[i]}: ${trap.why.charAt(0).toLowerCase()}${trap.why.slice(1)}` }] : [];
      }),
    ];
    if (new Set(errors.filter((e) => e.value > 0 && e.value !== answer).map((e) => e.value)).size < 2) return null;
    const lines = moves.map((m, i) => `${ROMAN[i]} ${cap(m.text)}: capital ${sg(m.e.c)}.`);
    lines.push(`Net change in capital = ${cs.filter((c) => c !== 0).map(sg).join(' ')} = ${net > 0 ? '+' : '−'}${f(answer)}, so capital ${net > 0 ? 'rises' : 'falls'} by ${f(answer)}.`);
    return {
      prompt: `${shop(rng)} recorded these transactions: ${sentence(moves.map((m, i) => `${ROMAN[i]} ${m.text}`).join('; '))} By what net amount did the owner's capital change as a result? (Give the amount only, not the direction.)`,
      answer,
      commonErrors: errors,
      explanation: lines,
    };
  },
  verify: (q) => {
    const changes = q.working.flatMap((l) => {
      const m = /: capital (?:(\+|−)(₹\d(?:[\d,]*\d)?)|0)\.$/.exec(l);
      if (!m) return [];
      return m[1] === undefined ? [0] : [(m[1] === '+' ? 1 : -1) * (parseRupees(m[2]) ?? NaN)];
    });
    return changes.length === 4 && Math.abs(sum(changes)) === q.answer;
  },
});

const aeUnchangedCount = addHints(numericTemplate({
  id: 'ae-unchanged-count',
  topicId: T,
  conceptId: 'ae-unchanged',
  difficulty: 'medium',
  unit: 'number',
  version: 2,
  generate: (rng) => {
    const prop = rng.pick(PROPS);
    const moves = pickMoves(rng, ['cap', 'credit', 'swap', 'adjust', 'hard'], 5);
    const fits = moves.map((m) => holds(prop, m));
    const answer = fits.filter(Boolean).length;
    if (answer < 1 || answer > 4) return null;
    const slipCount = moves.filter((m) => prop.slip.test(m.e)).length;
    // A transaction read the usual wrong way (its trap) is counted when it should not be, or missed when it should be.
    const misread = moves.flatMap((m, i) => {
      const trap = m.trap;
      if (!trap || holds(prop, { ...m, e: trap.e }) === fits[i]) return [];
      const why = `${trap.why.charAt(0).toLowerCase()}${trap.why.slice(1)}`;
      return fits[i]
        ? [{ value: answer - 1, why: `Missed ${ROMAN[i]}, which fits: ${why}` }]
        : [{ value: answer + 1, why: `Counted ${ROMAN[i]}, which does not fit: ${why}` }];
    });
    const errors = [
      { value: slipCount, why: prop.slip.why },
      ...misread,
      { value: 5 - answer, why: 'Counted the transactions that do not fit instead of those that do.' },
    ];
    const usable = () => new Set(errors.filter((e) => e.value > 0 && e.value !== answer).map((e) => e.value)).size;
    // Only when the list offers no named misreading: a count that is one out.
    if (usable() < 2) {
      errors.push(
        { value: answer + 1, why: 'Counted one transaction too many, taking one that does not fit as fitting.' },
        { value: answer - 1, why: 'Missed one transaction that does fit.' },
      );
    }
    if (usable() < 2) return null;
    return {
      prompt: `${goodsFirm(rng)} recorded five separate transactions: ${sentence(moves.map((m, i) => `${ROMAN[i]} ${m.text}`).join('; '))} How many of them ${prop.many}?`,
      answer,
      commonErrors: errors,
      explanation: [
        ...moves.map(
          (m, i) =>
            `${ROMAN[i]} ${describe(m.e)}${prop.needsNoCash ? (m.noCash ? '; no cash or bank money moves' : '; cash or bank money moves') : ''} - ${fits[i] ? 'fits' : 'does not fit'}.`,
        ),
        `${answer} of the five ${answer === 1 ? 'fits' : 'fit'}.`,
      ],
    };
  },
  verify: (q) => {
    const prop = PROPS.find((p) => q.prompt.includes(p.many));
    if (!prop) return false;
    const lines = q.working.filter((l) => / - (fits|does not fit)\.$/.test(l));
    if (lines.length !== 5 || lines.filter((l) => /- fits\.$/.test(l)).length !== q.answer) return false;
    return prop.needsNoCash || lines.every((l) => {
      const e = parseEffect(l);
      return e !== null && prop.testE(e) === /- fits\.$/.test(l);
    });
  },
}), PICK_HINTS);

// ---------------------------------------------------------------------------------------------------------------
// numeric: income and expense, profit on a sale, goods
// ---------------------------------------------------------------------------------------------------------------

const aeCapitalIncomeExpense = addHints(numericTemplate({
  id: 'ae-capital-income-expense',
  topicId: T,
  conceptId: 'ae-expenses-incomes',
  difficulty: 'easy',
  unit: 'rupees',
  version: 2,
  generate: (rng) => {
    const [in1, in2] = rng.shuffle(['commission', 'interest', 'dividend', 'rent']).slice(0, 2);
    const [ex1, ex2] = rng.shuffle(['salaries', 'advertising expenses', 'electricity charges', 'repair charges', 'telephone charges']).slice(0, 2);
    const capital = amount(rng, 100000, 600000, 10000);
    const [i1, i2] = [amount(rng, 5000, 40000, 1000), amount(rng, 1000, 20000, 1000)];
    const [e1, e2] = [amount(rng, 5000, 40000, 1000), amount(rng, 10000, 60000, 1000)];
    const income = i1 + i2;
    const expense = e1 + e2;
    if (income === expense) return null; // The capital would not move, and the answer would be a figure of the prompt.
    const answer = capital + income - expense;
    return {
      prompt: `${anyFirm(rng)} began the month with capital of ${f(capital)}. During the month it earned ${in1} of ${f(i1)} and ${in2} of ${f(i2)}, and incurred ${ex1} of ${f(e1)} and ${ex2} of ${f(e2)}. The owner made no drawings and brought in no new capital. What is the capital at the end of the month?`,
      answer,
      commonErrors: [
        { value: capital + income + expense, why: 'Added the expenses to the capital instead of deducting them.' },
        { value: capital + income, why: 'Ignored the expenses.' },
        { value: capital - expense, why: 'Ignored the incomes.' },
        { value: capital - income - expense, why: 'Deducted the incomes as well as the expenses.' },
      ],
      explanation: [
        `Total income = ${f(i1)} + ${f(i2)} = ${f(income)}.`,
        `Total expenses = ${f(e1)} + ${f(e2)} = ${f(expense)}.`,
        `Closing capital = Opening capital + Income - Expenses = ${f(capital)} + ${f(income)} - ${f(expense)} = ${f(answer)}.`,
      ],
    };
  },
  verify: (q) => {
    const [c, i1, i2, e1, e2] = amountsIn(q.prompt);
    return c + i1 + i2 - e1 - e2 === q.answer;
  },
}), [
  'Incomes add to capital; expenses take away from it.',
  'Add the incomes, add the expenses, then: closing capital = opening capital + incomes - expenses.',
]);

const aeProfitOnSale = addHints(numericTemplate({
  id: 'ae-profit-on-sale',
  topicId: T,
  conceptId: 'ae-credit-goods',
  difficulty: 'easy',
  unit: 'rupees',
  version: 2,
  generate: (rng) => {
    const cost = amount(rng, 5000, 60000, 1000);
    const gap = amount(rng, 1000, 12000, 500);
    const profit = rng.next() < 0.65;
    const price = profit ? cost + gap : cost - gap;
    if (price < 1000) return null;
    const how = rng.pick([' in cash', ' on credit']);
    return {
      prompt: `${goodsFirm(rng)} sold goods that cost ${f(cost)} for ${f(price)}${how}. By how much does the owner's capital ${profit ? 'increase' : 'decrease'}?`,
      answer: gap,
      commonErrors: [
        { value: price, why: `Gave the selling price instead of the ${profit ? 'profit' : 'loss'}.` },
        { value: cost, why: `Gave the cost of the goods instead of the ${profit ? 'profit' : 'loss'}.` },
        { value: cost + price, why: 'Added the cost and the selling price.' },
      ],
      explanation: [
        profit ? `Profit = Selling price - Cost = ${f(price)} - ${f(cost)} = ${f(gap)}.` : `Loss = Cost - Selling price = ${f(cost)} - ${f(price)} = ${f(gap)}.`,
        `Only this ${profit ? 'profit' : 'loss'} changes capital: capital ${profit ? 'rises' : 'falls'} by ${f(gap)}.`,
      ],
    };
  },
  verify: (q) => {
    const [cost, price] = amountsIn(q.prompt);
    return Math.abs(price - cost) === q.answer && (price > cost) === /increase\?$/.test(q.prompt);
  },
}), SALE_HINTS);

const aeSaleMargin = addHints(numericTemplate({
  id: 'ae-sale-margin',
  topicId: T,
  conceptId: 'ae-credit-goods',
  difficulty: 'complex',
  unit: 'rupees',
  version: 2,
  generate: (rng) => {
    const onCost = rng.next() < 0.5;
    const pct = onCost ? rng.pick([10, 20, 25, 40, 50]) : rng.pick([20, 25, 40, 50]);
    const cost = amount(rng, 24000, 120000, 12000);
    const costR = cost / 100;
    // Whole rupees: with a margin on the selling price, the price is cost x 100 / (100 - pct).
    const priceR = onCost ? costR + (costR * pct) / 100 : (costR * 100) / (100 - pct);
    if (!Number.isInteger(priceR)) return null;
    const price = rupees(priceR);
    const profit = price - cost;
    const askProfit = rng.next() < 0.6;
    // The usual slip is to take the percentage on the other base: a profit "on cost" worked as a share of the
    // selling price (profit = cost x pct / (100 - pct)), or a profit "on the selling price" worked on the cost.
    const wrongR = onCost ? (costR * pct) / (100 - pct) : (costR * pct) / 100;
    const wrongProfit = Number.isInteger(wrongR) ? rupees(wrongR) : null;
    const wrongBase = `Took the ${pct}% as a share of the ${onCost ? 'selling price' : 'cost'}, though the profit is given on ${onCost ? 'cost' : 'the selling price'}.`;
    const base = onCost ? 'cost' : 'the selling price';
    return {
      prompt: `${goodsFirm(rng)} sold goods costing ${f(cost)} on credit at a profit of ${pct}% on ${base}. ${askProfit ? "By how much does the owner's capital increase?" : 'By how much do debtors increase?'}`,
      answer: askProfit ? profit : price,
      commonErrors: askProfit
        ? [
            ...(wrongProfit === null ? [] : [{ value: wrongProfit, why: wrongBase }]),
            { value: price, why: 'Gave the selling price instead of the profit.' },
            { value: cost, why: 'Gave the cost of the goods instead of the profit.' },
          ]
        : [
            ...(wrongProfit === null ? [] : [{ value: cost + wrongProfit, why: wrongBase }]),
            { value: profit, why: 'Gave the profit instead of the selling price.' },
            { value: cost, why: 'Gave the cost of the goods instead of the selling price.' },
          ],
      explanation: onCost
        ? [`Profit = ${pct}% of cost = ${pct}% of ${f(cost)} = ${f(profit)}.`, `Selling price = Cost + Profit = ${f(cost)} + ${f(profit)} = ${f(price)}.`, askProfit ? `Capital increases by the profit, ${f(profit)}.` : `Debtors increase by the selling price, ${f(price)}.`]
        : [
            `Profit is ${pct}% of the selling price, so cost is ${100 - pct}% of the selling price.`,
            `Selling price = ${f(cost)} x 100 / ${100 - pct} = ${f(price)}, and Profit = ${f(price)} - ${f(cost)} = ${f(profit)}.`,
            askProfit ? `Capital increases by the profit, ${f(profit)}.` : `Debtors increase by the selling price, ${f(price)}.`,
          ],
    };
  },
  verify: (q) => {
    const cost = amountsIn(q.prompt)[0];
    const pct = Number(/(\d+)%/.exec(q.prompt)?.[1]);
    const onCost = /on cost\./.test(q.prompt);
    // Independent route: the selling price from the ratio of price to cost.
    const price = onCost ? (cost * (100 + pct)) / 100 : (cost * 100) / (100 - pct);
    const askProfit = /capital increase\?$/.test(q.prompt);
    return q.answer === (askProfit ? price - cost : price);
  },
}), [
  'Is the profit given as a percentage of the cost or of the selling price?',
  'On cost: profit = cost x rate / 100. On the selling price: selling price = cost x 100 / (100 - rate), and the profit is the difference. Capital rises by the profit; debtors by the selling price.',
]);

// ---------------------------------------------------------------------------------------------------------------
// numeric: finding a missing figure from items
// ---------------------------------------------------------------------------------------------------------------

interface Line {
  name: string;
  phrase: (x: string) => string;
}
const ASSET_LINES: Line[] = [
  { name: 'cash in hand', phrase: (x) => `cash in hand of ${x}` },
  { name: 'stock', phrase: (x) => `stock worth ${x}` },
  { name: 'debtors', phrase: (x) => `debtors of ${x}` },
  { name: 'furniture', phrase: (x) => `furniture worth ${x}` },
  { name: 'machinery', phrase: (x) => `machinery worth ${x}` },
  { name: 'bank balance', phrase: (x) => `a bank balance of ${x}` },
];
const LIABILITY_LINES: Line[] = [
  { name: 'creditors', phrase: (x) => `creditors of ${x}` },
  { name: 'bank loan', phrase: (x) => `a bank loan of ${x}` },
  { name: 'bills payable', phrase: (x) => `bills payable of ${x}` },
  { name: 'outstanding wages', phrase: (x) => `outstanding wages of ${x}` },
];
const owes = (n: number): string => (n === 1 ? ' Its only liability is ' : ' Its liabilities are ');
const OWES = / Its (?:only liability is|liabilities are) /;
/** An item as it reads after "other than". */
const the = (name: string): string => (name.startsWith('bank ') ? `the ${name}` : name);
const sumLine = (label: string, xs: Paise[]): string => (xs.length === 1 ? `${label} = ${f(xs[0])}.` : `${label} = ${xs.map(f).join(' + ')} = ${f(sum(xs))}.`);

const aeMissingCapitalItemised = addHints(numericTemplate({
  id: 'ae-missing-capital-itemised',
  topicId: T,
  conceptId: 'ae-missing',
  difficulty: 'easy',
  unit: 'rupees',
  version: 2,
  generate: (rng) => {
    const assets = rng.shuffle(ASSET_LINES).slice(0, rng.int(3, 4));
    const liabs = rng.shuffle(LIABILITY_LINES).slice(0, rng.int(1, 2));
    const av = assets.map(() => amount(rng, 10000, 150000, 5000));
    const lv = liabs.map(() => amount(rng, 10000, 100000, 5000));
    const [A, L] = [sum(av), sum(lv)];
    if (A - L < rupees(30000)) return null;
    const lastName = assets[assets.length - 1].name;
    const errors = [
      { value: A, why: 'Gave the total assets, forgetting to deduct the liabilities.' },
      { value: A + L, why: 'Added the liabilities to the assets instead of deducting them.' },
      { value: A - L - av[av.length - 1], why: `Left out the ${lastName} when adding the assets.` },
      ...(liabs.length === 2 ? [{ value: A - lv[0], why: `Deducted only the ${liabs[0].name}, forgetting the ${liabs[1].name}.` }] : []),
    ];
    return {
      prompt: `The assets of ${bare(goodsFirm(rng))} are ${list(assets.map((x, i) => x.phrase(f(av[i]))))}.${owes(liabs.length)}${list(liabs.map((x, i) => x.phrase(f(lv[i]))))}. What is the owner's capital?`,
      answer: A - L,
      commonErrors: errors,
      explanation: [
        sumLine('Total assets', av),
        sumLine('Total liabilities', lv),
        `Capital = Assets - Liabilities = ${f(A)} - ${f(L)} = ${f(A - L)}.`,
      ],
    };
  },
  verify: (q) => {
    const [owns, owes] = q.prompt.split(OWES);
    return sum(amountsIn(owns)) - sum(amountsIn(owes ?? '')) === q.answer;
  },
}), MISSING_HINTS);

const aeMissingAssetItemised = numericTemplate({
  id: 'ae-missing-asset-itemised',
  topicId: T,
  conceptId: 'ae-missing',
  difficulty: 'medium',
  unit: 'rupees',
  generate: (rng) => {
    const [unknown, ...others] = rng.shuffle(ASSET_LINES);
    const known = others.slice(0, rng.int(2, 3));
    const liabs = rng.shuffle(LIABILITY_LINES).slice(0, rng.int(1, 2));
    const missing = amount(rng, 10000, 150000, 5000);
    const kv = known.map(() => amount(rng, 10000, 120000, 5000));
    const lv = liabs.map(() => amount(rng, 10000, 100000, 5000));
    const [K, L] = [sum(kv), sum(lv)];
    const capital = K + missing - L;
    if (capital < rupees(30000)) return null;
    return {
      prompt: `The capital of ${shop(rng)} is ${f(capital)}.${owes(liabs.length)}${list(liabs.map((x, i) => x.phrase(f(lv[i]))))}. Its assets other than ${the(unknown.name)} are ${list(known.map((x, i) => x.phrase(f(kv[i]))))}. What is the value of its ${unknown.name}?`,
      answer: missing,
      commonErrors: [
        { value: capital - K, why: 'Forgot the liabilities: the assets must cover the liabilities as well as the capital.' },
        { value: capital - L - K, why: 'Deducted the liabilities from the capital instead of adding them to it.' },
        { value: capital + L, why: 'Gave the total assets instead of taking away the assets already known.' },
        { value: capital + L + K, why: 'Added the known assets instead of deducting them.' },
      ],
      explanation: [
        `Total assets = Liabilities + Capital = ${f(L)} + ${f(capital)} = ${f(L + capital)}.`,
        sumLine('Known assets', kv),
        `${cap(unknown.name)} = ${f(L + capital)} - ${f(K)} = ${f(missing)}.`,
      ],
    };
  },
  verify: (q) => {
    const [head, rest] = q.prompt.split(OWES);
    const [owed, known] = (rest ?? '').split('Its assets other than');
    return amountsIn(head)[0] + sum(amountsIn(owed ?? '')) - sum(amountsIn(known ?? '')) === q.answer;
  },
});

const aeMissingLiabilityItemised = addHints(numericTemplate({
  id: 'ae-missing-liability-itemised',
  topicId: T,
  conceptId: 'ae-missing',
  difficulty: 'medium',
  unit: 'rupees',
  version: 2,
  generate: (rng) => {
    const [unknown, ...others] = rng.shuffle(LIABILITY_LINES);
    const known = others.slice(0, rng.int(1, 2));
    const kv = known.map(() => amount(rng, 10000, 100000, 5000));
    const missing = amount(rng, 10000, 100000, 5000);
    const capital = amount(rng, 150000, 600000, 10000);
    const [K, assets] = [sum(kv), capital + sum(kv) + missing];
    return {
      prompt: `${anyFirm(rng)} has assets worth ${f(assets)} and the owner's capital is ${f(capital)}. Its ${known.length === 1 ? 'only liability' : 'liabilities'} other than ${the(unknown.name)} ${known.length === 1 ? 'is' : 'are'} ${list(known.map((x, i) => x.phrase(f(kv[i]))))}. What is the amount of its ${unknown.name}?`,
      answer: missing,
      commonErrors: [
        { value: assets - capital, why: 'Gave all the liabilities, forgetting the ones already known.' },
        { value: assets - capital + K, why: 'Added the known liabilities instead of deducting them.' },
        { value: assets - K, why: 'Forgot to deduct the capital.' },
      ],
      explanation: [
        `Total liabilities = Assets - Capital = ${f(assets)} - ${f(capital)} = ${f(assets - capital)}.`,
        sumLine('Known liabilities', kv),
        `${cap(unknown.name)} = ${f(assets - capital)} - ${f(K)} = ${f(missing)}.`,
      ],
    };
  },
  verify: (q) => {
    const [assets, capital, ...known] = amountsIn(q.prompt);
    return assets - capital - sum(known) === q.answer;
  },
}), MISSING_HINTS);

// ---------------------------------------------------------------------------------------------------------------
// numeric and mcq: capital account
// ---------------------------------------------------------------------------------------------------------------

const aeClosingBasic = addHints(numericTemplate({
  id: 'ae-closing-basic',
  topicId: T,
  conceptId: 'ae-closing-capital',
  difficulty: 'easy',
  unit: 'rupees',
  version: 2,
  generate: (rng) => capitalAccount(rng, ['o', rng.next() < 0.65 ? 'p' : 'l'], 'c', anyFirm),
  verify: verifyCapitalAccount,
}), CLOSING_HINTS);

const aeClosingFull = numericTemplate({
  id: 'ae-closing-full',
  topicId: T,
  conceptId: 'ae-closing-capital',
  difficulty: 'medium',
  unit: 'rupees',
  generate: (rng) => capitalAccount(rng, ['o', 'a', 'p', 'd'], 'c'),
  verify: verifyCapitalAccount,
});

const aeClosingLoss = numericTemplate({
  id: 'ae-closing-loss',
  topicId: T,
  conceptId: 'ae-closing-capital',
  difficulty: 'medium',
  unit: 'rupees',
  generate: (rng) => capitalAccount(rng, ['o', 'a', 'l', 'd'], 'c'),
  verify: verifyCapitalAccount,
});

const aeProfitFromCapitals = addHints(numericTemplate({
  id: 'ae-profit-from-capitals',
  topicId: T,
  conceptId: 'ae-closing-capital',
  difficulty: 'medium',
  unit: 'rupees',
  version: 2,
  generate: (rng) => capitalAccount(rng, rng.next() < 0.5 ? ['o', 'p', 'd'] : ['o', 'a', 'p', 'd'], 'p', anyFirm),
  verify: verifyCapitalAccount,
}), CLOSING_HINTS);

const aeClosingUnknown = numericTemplate({
  id: 'ae-closing-unknown',
  topicId: T,
  conceptId: 'ae-closing-capital',
  difficulty: 'medium',
  unit: 'rupees',
  generate: (rng) => capitalAccount(rng, ['o', 'a', 'p', 'd'], rng.pick(['o', 'a', 'd'] as const)),
  verify: verifyCapitalAccount,
});

const signedText = (v: Paise): string => (v > 0 ? `Profit of ${f(v)}` : `Loss of ${f(-v)}`);
const aeProfitOrLoss = mcqTemplate({
  id: 'ae-profit-or-loss',
  topicId: T,
  conceptId: 'ae-closing-capital',
  difficulty: 'medium',
  generate: (rng) => {
    const o = randomValue(rng, 'o');
    const a = rng.next() < 0.5 ? randomValue(rng, 'a') : 0;
    const d = randomValue(rng, 'd');
    const size = amount(rng, 10000, 150000, 5000);
    const p = rng.next() < 0.55 ? size : -size;
    const c = o + a + p - d;
    if (c <= 0) return null;
    const vals: Vals = { o, c, d, ...(a > 0 ? { a } : {}) };
    const wrong: { value: Paise; why: string }[] = [
      ...slipsFor(vals, 'p').filter((s) => s.why.includes('drawings') || s.why.includes('additional')),
      { value: c - o, why: 'Took the change in capital as the result, ignoring the drawings and any additional capital.' },
      { value: -p, why: 'Worked out the right figure but called a profit a loss, or a loss a profit.' },
    ].filter((s) => s.value !== 0 && s.value !== p);
    const options = new Set(wrong.map((w) => signedText(w.value)));
    if (options.size < 3) return null;
    const facts = [`opening capital of ${f(o)}`, `closing capital of ${f(c)}`, `drawings of ${f(d)}`, ...(a > 0 ? [`additional capital of ${f(a)}`] : [])];
    return {
      prompt: `The books of ${shop(rng)} show, for the year, ${list(facts)}.${a > 0 ? '' : ' The owner brought in no additional capital during the year.'} Nothing else changed the capital except the profit or loss of the year. Did the business make a profit or a loss in the year, and of how much?`,
      correct: signedText(p),
      distractors: wrong.map((w) => ({ text: signedText(w.value), why: w.why })),
      explanation: `Closing capital = Opening capital${a > 0 ? ' + Additional capital' : ''} + Profit - Drawings, so Profit = Closing capital - Opening capital${a > 0 ? ' - Additional capital' : ''} + Drawings = ${f(c)} - ${f(o)}${a > 0 ? ` - ${f(a)}` : ''} + ${f(d)} = ${sg(p)}. ${p > 0 ? `A positive figure is a profit: ${signedText(p).toLowerCase()}.` : `A negative figure is a loss: ${signedText(p).toLowerCase()}.`}`,
    };
  },
  verify: (q) => {
    const body = q.prompt.slice(0, q.prompt.length - lastSentence(q.prompt).length);
    const o = after(body, 'opening capital of');
    const c = after(body, 'closing capital of');
    const d = after(body, 'drawings of');
    const a = after(body, 'additional capital of') ?? 0;
    if (o === null || c === null || d === null) return false;
    return q.options.find((o2) => o2.id === q.correct)?.text === signedText(c - o - a + d);
  },
});

// ---------------------------------------------------------------------------------------------------------------
// numeric: complex capital questions
// ---------------------------------------------------------------------------------------------------------------

const aeProfitFromStatements = addHints(numericTemplate({
  id: 'ae-profit-from-statements',
  topicId: T,
  conceptId: 'ae-closing-capital',
  difficulty: 'complex',
  unit: 'rupees',
  version: 2,
  generate: (rng) => {
    const oc = amount(rng, 200000, 600000, 10000);
    const profit = amount(rng, 80000, 250000, 5000);
    const drawings = amount(rng, 20000, 40000, 5000);
    const extra = rng.next() < 0.5 ? amount(rng, 20000, 100000, 10000) : 0;
    const ol = amount(rng, 50000, 200000, 10000);
    const cl = amount(rng, 50000, 200000, 10000);
    const cc = oc + extra + profit - drawings;
    const [oa, ca] = [oc + ol, cc + cl];
    const extraText = extra > 0 ? ` and brought in additional capital of ${f(extra)}` : ' and brought in no additional capital';
    const errors = [
      { value: cc - oc, why: 'Took the rise in capital as the profit, ignoring the drawings' + (extra > 0 ? ' and the additional capital.' : '.') },
      { value: cc - oc - drawings - extra, why: 'Deducted the drawings instead of adding them back.' },
      { value: ca - oa + drawings - extra, why: 'Compared the total assets instead of the capital, forgetting that the liabilities changed too.' },
      ...(extra > 0 ? [{ value: cc - oc + drawings, why: 'Forgot that the additional capital is not profit.' }] : []),
    ];
    if (new Set(errors.filter((e) => e.value > 0 && e.value !== profit).map((e) => e.value)).size < 2) return null;
    return {
      prompt: `On 1 April ${anyFirm(rng)} had assets of ${f(oa)} and liabilities of ${f(ol)}. On 31 March of the next year its assets were ${f(ca)} and its liabilities ${f(cl)}. During the year the owner made drawings of ${f(drawings)}${extraText}. Nothing else changed the capital except the profit of the year. What profit did the business earn in the year?`,
      answer: profit,
      commonErrors: errors,
      explanation: [
        `Opening capital = ${f(oa)} - ${f(ol)} = ${f(oc)}.`,
        `Closing capital = ${f(ca)} - ${f(cl)} = ${f(cc)}.`,
        `Profit = Closing capital - Opening capital + Drawings${extra > 0 ? ' - Additional capital' : ''} = ${f(cc)} - ${f(oc)} + ${f(drawings)}${extra > 0 ? ` - ${f(extra)}` : ''} = ${f(profit)}.`,
      ],
    };
  },
  verify: (q) => {
    const [oa, ol, ca, cl] = amountsIn(q.prompt);
    const d = after(q.prompt, 'drawings of') ?? NaN;
    const x = after(q.prompt, 'additional capital of') ?? 0;
    return ca - cl - (oa - ol) + d - x === q.answer;
  },
}), [
  'First find the capital on each date: Capital = Assets - Liabilities.',
  'Then Profit = Closing capital - Opening capital + Drawings - Additional capital.',
]);

const aeClosingAssets = numericTemplate({
  id: 'ae-closing-assets',
  topicId: T,
  conceptId: 'ae-closing-capital',
  difficulty: 'complex',
  unit: 'rupees',
  generate: (rng) => {
    const o = randomValue(rng, 'o');
    const p = randomValue(rng, 'p');
    const d = randomValue(rng, 'd');
    const a = rng.next() < 0.5 ? randomValue(rng, 'a') : 0;
    const ol = amount(rng, 50000, 200000, 10000);
    const cl = amount(rng, 50000, 200000, 10000);
    if (ol === cl) return null;
    const cc = o + a + p - d;
    const answer = cc + cl;
    return {
      prompt: `The books of ${shop(rng)} show, for the year, opening capital of ${f(o)}, a profit of ${f(p)}, drawings of ${f(d)}${a > 0 ? `, additional capital of ${f(a)}` : ''}, opening liabilities of ${f(ol)} and closing liabilities of ${f(cl)}.${a > 0 ? '' : ' The owner brought in no additional capital during the year.'} What is the total of its assets at the end of the year?`,
      answer,
      commonErrors: [
        { value: cc, why: 'Gave the closing capital, forgetting the liabilities that also finance the assets.' },
        { value: cc + ol, why: 'Used the opening liabilities instead of the closing liabilities.' },
        { value: o + a + p + d + cl, why: 'Added the drawings figure instead of deducting it.' },
        { value: cc - cl, why: 'Deducted the liabilities instead of adding them.' },
      ],
      explanation: [
        `Closing capital = Opening capital${a > 0 ? ' + Additional capital' : ''} + Profit - Drawings = ${f(o)}${a > 0 ? ` + ${f(a)}` : ''} + ${f(p)} - ${f(d)} = ${f(cc)}.`,
        `Closing assets = Closing liabilities + Closing capital = ${f(cl)} + ${f(cc)} = ${f(answer)}.`,
        'The opening liabilities are not needed.',
      ],
    };
  },
  verify: (q) => {
    const get = (p: string) => after(q.prompt, p) ?? 0;
    return get('opening capital of') + get('additional capital of') + get('profit of') - get('drawings of') + get('closing liabilities of') === q.answer;
  },
});

const aeExpandedAssets = numericTemplate({
  id: 'ae-expanded-assets',
  topicId: T,
  conceptId: 'ae-closing-capital',
  difficulty: 'complex',
  unit: 'rupees',
  generate: (rng) => {
    const [in1, in2] = rng.shuffle(['commission', 'interest', 'dividend', 'rent']).slice(0, 2);
    const [ex1, ex2] = rng.shuffle(['salaries', 'advertising expenses', 'electricity charges', 'repair charges']).slice(0, 2);
    const oc = amount(rng, 200000, 600000, 10000);
    const [x1, x2] = [amount(rng, 20000, 90000, 1000), amount(rng, 10000, 60000, 1000)];
    const [y1, y2] = [amount(rng, 20000, 80000, 1000), amount(rng, 10000, 50000, 1000)];
    const d = amount(rng, 20000, 80000, 1000);
    const cl = amount(rng, 50000, 250000, 10000);
    const result = x1 + x2 - y1 - y2;
    const cc = oc + result - d;
    if (cc <= 0 || result === 0) return null;
    const answer = cc + cl;
    return {
      prompt: `The books of ${shop(rng)} show opening capital of ${f(oc)}. During the year it earned ${in1} of ${f(x1)} and ${in2} of ${f(x2)}, and incurred ${ex1} of ${f(y1)} and ${ex2} of ${f(y2)}; it had no other income or expense. The owner withdrew ${f(d)} as drawings and brought in no additional capital. The liabilities at the end of the year were ${f(cl)}. What was the total of the assets at the end of the year?`,
      answer,
      commonErrors: [
        { value: cc, why: 'Gave the closing capital, forgetting the liabilities.' },
        { value: answer + d, why: 'Forgot the drawings.' },
        { value: answer + y1 + y2, why: 'Ignored the expenses.' },
        { value: answer - x1 - x2, why: 'Ignored the incomes.' },
        { value: answer + 2 * d, why: 'Added the drawings figure instead of deducting it.' },
      ],
      explanation: [
        result > 0
          ? `Profit = Income - Expenses = (${f(x1)} + ${f(x2)}) - (${f(y1)} + ${f(y2)}) = ${f(x1 + x2)} - ${f(y1 + y2)} = ${f(result)}.`
          : `Income - Expenses = (${f(x1)} + ${f(x2)}) - (${f(y1)} + ${f(y2)}) = ${f(x1 + x2)} - ${f(y1 + y2)}: the expenses are more, so there is a loss of ${f(-result)}.`,
        `Closing capital = Opening capital ${result > 0 ? '+ Profit' : '- Loss'} - Drawings = ${f(oc)} ${result > 0 ? '+' : '-'} ${f(Math.abs(result))} - ${f(d)} = ${f(cc)}.`,
        `Assets = Liabilities + Capital = ${f(cl)} + ${f(cc)} = ${f(answer)}.`,
      ],
    };
  },
  verify: (q) => {
    const [oc, x1, x2, y1, y2, d, cl] = amountsIn(q.prompt);
    return cl + oc + (x1 + x2) - (y1 + y2) - d === q.answer;
  },
});

// ---------------------------------------------------------------------------------------------------------------
// numeric: depreciation and adjustments
// ---------------------------------------------------------------------------------------------------------------

const aeDepreciationAssets = numericTemplate({
  id: 'ae-depreciation-assets',
  topicId: T,
  conceptId: 'ae-adjustments',
  difficulty: 'complex',
  unit: 'rupees',
  generate: (rng) => {
    const cost = amount(rng, 40000, 200000, 40000);
    const rate = rng.pick([10, 15, 20]);
    const months = rng.pick([6, 9, 12]);
    const dep = (cost / 100) * rate * months;
    if (dep % 1200 !== 0) return null;
    const d = rupees(dep / 1200);
    const cash = rng.next() < 0.5;
    const buy: Move = cash
      ? {
          x: cost,
          text: `the business bought machinery for ${f(cost)}, paying by cheque`,
          e: eff(0, 0, 0),
          note: 'Machinery rises and the bank balance falls by the same amount.',
          trap: { e: eff(-cost, 0, -cost), why: 'Treated buying the machinery as an expense.' },
        }
      : {
          x: cost,
          text: `the business bought machinery for ${f(cost)} on credit from ${party(rng)}`,
          e: eff(cost, cost, 0),
          note: 'Machinery and the amount owed to the supplier both rise.',
          trap: { e: eff(cost, 0, cost), why: 'Took the credit purchase as capital brought in by the owner.' },
        };
    const depn: Move = {
      x: d,
      text: `at the end of the year the business charged depreciation on this machinery at ${rate}% a year on its cost, for the ${months} months it was in use`,
      e: eff(-d, 0, -d),
      note: 'Depreciation is an expense: assets and capital fall by it.',
    };
    const ask = rng.pick(cash ? (['a', 'c'] as const) : (['a', 'l', 'c'] as const));
    const fullYear = rupees(((cost / 100) * rate) / 100);
    const parts = totalsParts(rng, {
      moves: [buy, depn],
      ask,
      start: opening(rng, false),
      // Depreciation moves assets and capital alike, so the same slips apply to either figure; liabilities are not touched.
      extraErrors: (answer) =>
        ask === 'l' || months === 12
          ? []
          : [{ value: answer + d - fullYear, why: `Charged depreciation for the full year instead of for ${months} months.` }],
    });
    if (parts === null) return null;
    const [openingLine, buyLine, depLine, ...rest] = parts.explanation;
    return {
      ...parts,
      explanation: [openingLine, buyLine, `Depreciation = ${f(cost)} x ${rate}% x ${months}/12 = ${f(d)}.`, depLine, ...rest],
    };
  },
  verify: (q) => {
    const cost = amountsIn(q.prompt)[2];
    const rate = Number(/(\d+)% a year/.exec(q.prompt)?.[1]);
    const months = Number(/for the (\d+) months it was in use/.exec(q.prompt)?.[1]);
    const d = (cost * rate * months) / 1200;
    return verifyRunning(q) && q.working.some((l) => l.includes(`capital ${sg(-d)}`));
  },
});

const aeAdjustCapitalEffect = numericTemplate({
  id: 'ae-adjust-capital-effect',
  topicId: T,
  conceptId: 'ae-adjustments',
  difficulty: 'complex',
  unit: 'rupees',
  generate: (rng) => {
    const month = amount(rng, 500, 2500, 500);
    const k = rng.int(2, 5);
    const x = month * 12;
    const y = month * k;
    const z = amount(rng, 10000, 30000, 1000);
    const w = amount(rng, 5000, 30000, 1000);
    const v = amount(rng, 5000, 30000, 1000);
    const net = -(x - y) - z + w;
    if (net >= 0) return null;
    const answer = -net;
    const errors = [
      { value: x + z - w, why: 'Charged the whole premium as an expense, ignoring the part that is prepaid.' },
      { value: answer - v, why: 'Counted the rent received in advance as income of the year.' },
      { value: x - y - w, why: 'Left out the unpaid salaries because no cash has been paid.' },
      { value: x - y + z, why: 'Ignored the interest that is earned but not yet received.' },
      { value: y + z - w, why: 'Charged the months of the next year as the insurance expense, instead of the months of this year.' },
    ];
    return {
      prompt: `At the end of the year, ${shop(rng)} notes four items: (i) during the year it paid an insurance premium of ${f(x)} for 12 months, of which ${k} months fall in the next year; (ii) salaries of ${f(z)} for the last month of the year are unpaid; (iii) interest of ${f(w)} on a deposit has been earned but not yet received; (iv) rent of ${f(v)} was received in cash for a period that falls in the next year. Taking the four items together, by what amount is the owner's capital at the end of the year reduced?`,
      answer,
      commonErrors: errors,
      explanation: [
        `(i) Insurance expense of this year = ${f(x)} x ${12 - k}/12 = ${f(x - y)}; the other ${f(y)} is prepaid insurance, an asset. Capital falls by ${f(x - y)}.`,
        `(ii) Outstanding salaries are an expense of this year and a liability: capital falls by ${f(z)}.`,
        `(iii) Accrued interest is income of this year and an asset: capital rises by ${f(w)}.`,
        `(iv) Rent received in advance is a liability, not income of this year: no effect on capital.`,
        `Net fall in capital = ${f(x - y)} + ${f(z)} - ${f(w)} = ${f(answer)}.`,
      ],
    };
  },
  verify: (q) => {
    const [x, z, w] = amountsIn(q.prompt);
    const k = Number(/of which (\d+) months fall/.exec(q.prompt)?.[1]);
    return (x * (12 - k)) / 12 + z - w === q.answer;
  },
});

// ===============================================================================================================
// Added after the mock papers were set (kept off them: generators/outsidePapers.ts). The transactions of MORE_MOVES,
// and the accounting equation in columns.
// ===============================================================================================================

const MORE_HINTS = [
  'Name what moves first: goods, cash, a debt owed to or by the business, or the owner\'s own claim.',
  "Goods move at cost; a profit counted on a sale comes off capital when the goods come back; money paid for the owner's own needs is drawings; money received for work not yet done is owed.",
];

const aeEffectMore = addHints(mcqTemplate({
  id: 'ae-effect-more',
  topicId: T,
  conceptId: 'ae-effects',
  difficulty: 'medium',
  generate: (rng) => effectMcqOf(rng, MORE_MOVES, goodsFirm),
  verify: verifyEffect,
}), MORE_HINTS);

const aeTotalsMore = addHints(numericTemplate({
  id: 'ae-totals-more',
  topicId: T,
  conceptId: 'ae-totals',
  difficulty: 'complex',
  unit: 'rupees',
  generate: (rng) => {
    const more = rng.shuffle(MORE_MOVES).slice(0, 2).map((d) => d.make(rng));
    const usual = rng.shuffle(defsOf('cap', 'credit', 'swap')).slice(0, 3).map((d) => d.make(rng));
    const moves = withDistinctParties(rng.shuffle([...more, ...usual]));
    const ask = askThatMatters(rng, moves, ['a', 'l', 'c'], (a) => (a === 'l' ? 1 : 2));
    return ask === null ? null : totalsParts(rng, { moves, ask, start: opening(rng, false), lead: goodsFirm(rng) });
  },
  verify: verifyRunning,
}), TOTALS_HINTS);

// ---------------------------------------------------------------------------------------------------------------
// The equation in columns: Cash + Bank + Stock + Debtors + Furniture = Creditors + Bank loan + Capital, one row for
// each transaction. A story of a new business is drawn so that nothing runs out (no payment from cash or bank that is
// not there, no creditor paid more than is owed, no goods sold that are not in stock), and every transaction is
// written in one of a few fixed forms, which `verify` reads back to work the columns out again.
// ---------------------------------------------------------------------------------------------------------------

type Col = 'cash' | 'bank' | 'stock' | 'debtors' | 'furniture' | 'creditors' | 'loan' | 'capital';
const COLS: Col[] = ['cash', 'bank', 'stock', 'debtors', 'furniture', 'creditors', 'loan', 'capital'];
const COL_LABEL: Record<Col, string> = { cash: 'Cash', bank: 'Bank', stock: 'Stock', debtors: 'Debtors', furniture: 'Furniture', creditors: 'Creditors', loan: 'Bank loan', capital: 'Capital' };
const ASSET_COLS: readonly Col[] = ['cash', 'bank', 'stock', 'debtors', 'furniture'];
const COLUMNS_LINE = 'Cash + Bank + Stock + Debtors + Furniture = Creditors + Bank loan + Capital';
type Cols = Partial<Record<Col, Paise>>;
interface ColTx {
  text: string;
  d: Cols;
  /** A sale: its cost and price, for the slips that use the wrong one. */
  sale?: { c: Paise; s: Paise };
}

const M = String.raw`(₹\d(?:[\d,]*\d)?)`;
/** Every form a transaction of a story is written in, and what it does to the columns. */
const COL_READ: [RegExp, (x: Paise[]) => Cols][] = [
  [new RegExp(String.raw`^Started the business with cash of ${M} and goods worth ${M}\.$`), ([c, g]) => ({ cash: c, stock: g, capital: c + g })],
  [new RegExp(String.raw`^Started the business with cash of ${M}\.$`), ([c]) => ({ cash: c, capital: c })],
  [new RegExp(String.raw`^Deposited ${M} of the cash into the bank account\.$`), ([x]) => ({ cash: -x, bank: x })],
  [new RegExp(String.raw`^Bought goods for ${M} on credit from .+\.$`), ([x]) => ({ stock: x, creditors: x })],
  [new RegExp(String.raw`^Bought goods for ${M} in cash\.$`), ([x]) => ({ stock: x, cash: -x })],
  [new RegExp(String.raw`^Sold goods costing ${M} to .+ on credit for ${M}\.$`), ([c, s]) => ({ stock: -c, debtors: s, capital: s - c })],
  [new RegExp(String.raw`^Sold goods costing ${M} for ${M} in cash\.$`), ([c, s]) => ({ stock: -c, cash: s, capital: s - c })],
  [new RegExp(String.raw`^Bought furniture for ${M}, paying by cheque\.$`), ([x]) => ({ furniture: x, bank: -x })],
  [new RegExp(String.raw`^Paid ${M} by cheque to .+, a creditor\.$`), ([x]) => ({ bank: -x, creditors: -x })],
  [new RegExp(String.raw`^Received ${M} in cash from .+, a debtor\.$`), ([x]) => ({ cash: x, debtors: -x })],
  [new RegExp(String.raw`^Took a bank loan of ${M}, which was credited to the bank account\.$`), ([x]) => ({ bank: x, loan: x })],
  [new RegExp(String.raw`^Paid (?:shop rent|salaries|electricity charges) of ${M} in cash\.$`), ([x]) => ({ cash: -x, capital: -x })],
  [new RegExp(String.raw`^Withdrew ${M} in cash for personal use\.$`), ([x]) => ({ cash: -x, capital: -x })],
  [new RegExp(String.raw`^Took goods costing ${M} for personal use\.$`), ([x]) => ({ stock: -x, capital: -x })],
  [new RegExp(String.raw`^Gave away goods costing ${M} as (?:charity|free samples)\.$`), ([x]) => ({ stock: -x, capital: -x })],
];

/** The changes to the columns of one transaction, read from its text alone; null when it is in no known form. */
function readColTx(text: string): Cols | null {
  for (const [re, make] of COL_READ) {
    const m = re.exec(text);
    if (m) return make(m.slice(1).map((s) => parseRupees(s) ?? NaN));
  }
  return null;
}
/** The transactions of a printed story: its lines that start with a number in brackets, without the number. */
const storyLines = (text: string): string[] => text.split('\n').flatMap((l) => {
  const m = /^\((?:i|ii|iii|iv|v|vi|vii)\) (.+)$/.exec(l);
  return m ? [m[1]] : [];
});
/** The columns after every transaction of a printed story, worked out from its text; null when a line cannot be read. */
function columnsAfter(text: string): Record<Col, Paise>[] | null {
  const rows: Record<Col, Paise>[] = [];
  let now = Object.fromEntries(COLS.map((c) => [c, 0])) as Record<Col, Paise>;
  for (const line of storyLines(text)) {
    const d = readColTx(line);
    if (d === null) return null;
    now = Object.fromEntries(COLS.map((c) => [c, now[c] + (d[c] ?? 0)])) as Record<Col, Paise>;
    rows.push(now);
  }
  return rows;
}
const assetsOf = (r: Record<Col, Paise>): Paise => sum(ASSET_COLS.map((c) => r[c]));
const claimsOf = (r: Record<Col, Paise>): Paise => r.creditors + r.loan + r.capital;
/** Every row of the equation is in balance, and no figure is below nil. */
const columnsHold = (rows: Record<Col, Paise>[]): boolean => rows.every((r) => assetsOf(r) === claimsOf(r) && COLS.every((c) => r[c] >= 0));

const ROMANS = ['(i)', '(ii)', '(iii)', '(iv)', '(v)', '(vi)', '(vii)'];
type Kind = 'deposit' | 'buyCredit' | 'buyCash' | 'saleCredit' | 'saleCash' | 'furniture' | 'payCreditor' | 'receiveDebtor' | 'loan' | 'expense' | 'drawings' | 'goodsDrawn' | 'givenAway';
const KINDS: Kind[] = ['deposit', 'buyCredit', 'buyCash', 'saleCredit', 'saleCash', 'furniture', 'payCreditor', 'receiveDebtor', 'loan', 'expense', 'drawings', 'goodsDrawn', 'givenAway'];
/** One expense, drawings or gift at most in a story: they all move capital down. */
const CAPITAL_DOWN: readonly Kind[] = ['expense', 'drawings', 'goodsDrawn', 'givenAway'];

/** A round amount from `min` up to `share` of `have` (both in paise), or null when there is not enough. */
function upTo(rng: Rng, have: Paise, share: number, min: number, step: number, cap = Infinity): Paise | null {
  const max = Math.min(cap, Math.floor((have / 100) * share / 100 / step) * step);
  return max < min ? null : amount(rng, min, max, step);
}

/** A new business and four or five transactions after the day it starts. */
function columnStory(rng: Rng, n: number): ColTx[] | null {
  const [creditorName, debtorName] = rng.shuffle(PARTIES).slice(0, 2);
  const now = Object.fromEntries(COLS.map((c) => [c, 0])) as Record<Col, Paise>;
  const txs: ColTx[] = [];
  const add = (tx: ColTx) => {
    for (const c of COLS) now[c] += tx.d[c] ?? 0;
    txs.push({ ...tx, text: sentence(tx.text) });
  };
  const cash0 = amount(rng, 100000, 400000, 10000);
  if (rng.next() < 0.5) {
    const goods0 = amount(rng, 20000, 100000, 5000);
    add({ text: `Started the business with cash of ${f(cash0)} and goods worth ${f(goods0)}`, d: { cash: cash0, stock: goods0, capital: cash0 + goods0 } });
  } else add({ text: `Started the business with cash of ${f(cash0)}`, d: { cash: cash0, capital: cash0 } });

  const make = (k: Kind): ColTx | null => {
    switch (k) {
      case 'deposit': {
        const x = upTo(rng, now.cash, 60, 20000, 5000);
        return x === null ? null : { text: `Deposited ${f(x)} of the cash into the bank account`, d: { cash: -x, bank: x } };
      }
      case 'buyCredit': {
        const x = amount(rng, 10000, 60000, 1000);
        return { text: `Bought goods for ${f(x)} on credit from ${creditorName}`, d: { stock: x, creditors: x } };
      }
      case 'buyCash': {
        const x = upTo(rng, now.cash, 40, 5000, 1000);
        return x === null ? null : { text: `Bought goods for ${f(x)} in cash`, d: { stock: x, cash: -x } };
      }
      case 'saleCredit':
      case 'saleCash': {
        const c = upTo(rng, now.stock, 70, 5000, 1000);
        if (c === null) return null;
        const s = c + amount(rng, 1000, 8000, 500);
        return k === 'saleCredit'
          ? { text: `Sold goods costing ${f(c)} to ${debtorName} on credit for ${f(s)}`, d: { stock: -c, debtors: s, capital: s - c }, sale: { c, s } }
          : { text: `Sold goods costing ${f(c)} for ${f(s)} in cash`, d: { stock: -c, cash: s, capital: s - c }, sale: { c, s } };
      }
      case 'furniture': {
        const x = upTo(rng, now.bank, 80, 5000, 1000);
        return x === null ? null : { text: `Bought furniture for ${f(x)}, paying by cheque`, d: { furniture: x, bank: -x } };
      }
      case 'payCreditor': {
        const x = upTo(rng, Math.min(now.creditors, now.bank), 100, 5000, 1000);
        return x === null ? null : { text: `Paid ${f(x)} by cheque to ${creditorName}, a creditor`, d: { bank: -x, creditors: -x } };
      }
      case 'receiveDebtor': {
        const x = upTo(rng, now.debtors, 100, 2000, 1000);
        return x === null ? null : { text: `Received ${f(x)} in cash from ${debtorName}, a debtor`, d: { cash: x, debtors: -x } };
      }
      case 'loan': {
        const x = amount(rng, 20000, 100000, 10000);
        return { text: `Took a bank loan of ${f(x)}, which was credited to the bank account`, d: { bank: x, loan: x } };
      }
      case 'expense': {
        const x = upTo(rng, now.cash, 25, 2000, 500, 20000);
        return x === null ? null : { text: `Paid ${rng.pick(['shop rent', 'salaries', 'electricity charges'])} of ${f(x)} in cash`, d: { cash: -x, capital: -x } };
      }
      case 'drawings': {
        const x = upTo(rng, now.cash, 25, 2000, 500, 20000);
        return x === null ? null : { text: `Withdrew ${f(x)} in cash for personal use`, d: { cash: -x, capital: -x } };
      }
      case 'goodsDrawn': {
        const x = upTo(rng, now.stock, 30, 1000, 500, 15000);
        return x === null ? null : { text: `Took goods costing ${f(x)} for personal use`, d: { stock: -x, capital: -x } };
      }
      case 'givenAway': {
        const x = upTo(rng, now.stock, 20, 1000, 500, 10000);
        return x === null ? null : { text: `Gave away goods costing ${f(x)} as ${rng.pick(['charity', 'free samples'])}`, d: { stock: -x, capital: -x } };
      }
    }
  };
  const used = new Set<Kind>();
  for (let i = 0; i < n; i++) {
    let done = false;
    for (const k of rng.shuffle(KINDS)) {
      if (used.has(k) || (CAPITAL_DOWN.includes(k) && CAPITAL_DOWN.some((x) => used.has(x)))) continue;
      const tx = make(k);
      if (tx === null) continue;
      add(tx);
      used.add(k);
      done = true;
      break;
    }
    if (!done) return null;
  }
  return txs;
}
const storyText = (txs: ColTx[]): string => txs.map((t, i) => `${ROMANS[i]} ${t.text}`).join('\n');

/** The columns after each transaction of a story, as the story itself adds them up. */
function runColumns(txs: ColTx[]): Record<Col, Paise>[] {
  const rows: Record<Col, Paise>[] = [];
  let now = Object.fromEntries(COLS.map((c) => [c, 0])) as Record<Col, Paise>;
  for (const t of txs) {
    now = Object.fromEntries(COLS.map((c) => [c, now[c] + (t.d[c] ?? 0)])) as Record<Col, Paise>;
    rows.push(now);
  }
  return rows;
}
/** The last row of the columns written out as the equation. */
const equationLine = (r: Record<Col, Paise>): string => {
  const left = ASSET_COLS.filter((c) => r[c] > 0);
  const right = (['creditors', 'loan', 'capital'] as const).filter((c) => r[c] > 0);
  return `${left.map((c) => `${COL_LABEL[c]} ${f(r[c])}`).join(' + ')} = ${f(assetsOf(r))}; ${right.map((c) => `${COL_LABEL[c]} ${f(r[c])}`).join(' + ')} = ${f(claimsOf(r))}. The two sides agree.`;
};

const COLUMN_HINTS = [
  'Give each asset, each liability and the capital a column of its own, and write each transaction as a row of changes.',
  'Goods sold leave Stock at cost and come into Cash or Debtors at the selling price, the profit going to Capital; expenses and drawings come off Cash (or Stock) and Capital. Total the column asked for, and check that both sides agree.',
];

const aeColumnValue = addHints(numericTemplate({
  id: 'ae-column-value',
  topicId: T,
  conceptId: 'ae-columnar',
  difficulty: 'complex',
  unit: 'rupees',
  generate: (rng) => {
    const txs = columnStory(rng, rng.int(4, 5));
    if (txs === null) return null;
    const rows = runColumns(txs);
    const last = rows[rows.length - 1];
    const candidates = COLS.filter((c) => last[c] > 0 && txs.filter((t) => (t.d[c] ?? 0) !== 0).length >= 3);
    if (candidates.length === 0) return null;
    const col = rng.pick(candidates);
    const answer = last[col];
    const label = COL_LABEL[col];
    const errors: { value: Paise; why: string }[] = [];
    txs.forEach((t, i) => {
      const d = t.d[col] ?? 0;
      if (t.sale && col === 'stock') errors.push({ value: answer - t.sale.s + t.sale.c, why: `In ${ROMANS[i]}: took the goods out of Stock at their selling price instead of their cost.` });
      if (t.sale && col === 'capital') errors.push({ value: answer + t.sale.c, why: `In ${ROMANS[i]}: added the whole selling price to Capital instead of only the profit.` });
      if (t.sale && (col === 'cash' || col === 'debtors') && d !== 0) errors.push({ value: answer - t.sale.s + t.sale.c, why: `In ${ROMANS[i]}: entered the cost of the goods sold instead of their selling price.` });
      if (d !== 0 && i > 0) errors.push({ value: answer - 2 * d, why: `Entered ${ROMANS[i]} in the ${label} column the wrong way round.` });
      if (d !== 0 && i > 0) errors.push({ value: answer - d, why: `Left ${ROMANS[i]} out of the ${label} column.` });
    });
    if (new Set(errors.filter((e) => e.value > 0 && e.value !== answer).map((e) => e.value)).size < 2) return null;
    let running = 0;
    const lines = txs.flatMap((t, i) => {
      const d = t.d[col] ?? 0;
      if (d === 0) return [`${ROMANS[i]} No change in ${label}.`];
      running += d;
      return [`${ROMANS[i]} ${label} ${sg(d)}: now ${f(running)}.`];
    });
    return {
      prompt: `${bare(goodsFirm(rng))} works its accounting equation in columns (${COLUMNS_LINE}). What is the figure in the ${label} column after the last of these transactions?\n${storyText(txs)}`,
      answer,
      commonErrors: errors,
      explanation: [...lines, `${label} after the last transaction = ${f(answer)}.`, `Check, after the last transaction: ${equationLine(last)}`],
    };
  },
  // Worked out again from the printed transactions alone: every row in balance, and the column asked for at the end.
  verify: (q) => {
    const rows = columnsAfter(q.prompt);
    const col = COLS.find((c) => q.prompt.split('\n')[0].includes(`figure in the ${COL_LABEL[c]} column`));
    return rows !== null && rows.length >= 5 && col !== undefined && columnsHold(rows) && rows[rows.length - 1][col] === q.answer;
  },
}), COLUMN_HINTS);

const aeFmtClosingEquation = statementTemplate({
  id: 'ae-fmt-closing-equation',
  topicId: T,
  conceptId: 'ae-columnar',
  difficulty: 'medium',
  generate: (rng) => {
    const txs = columnStory(rng, rng.int(4, 5));
    if (txs === null) return null;
    const rows = runColumns(txs);
    const last = rows[rows.length - 1];
    const shown = COLS.filter((c) => last[c] > 0);
    if (shown.length < 4) return null;
    const name = bare(goodsFirm(rng));
    const trail = (c: Col) => {
      const steps = txs.flatMap((t, i) => ((t.d[c] ?? 0) === 0 ? [] : [`${sg(t.d[c] ?? 0)} ${ROMANS[i]}`]));
      return `${COL_LABEL[c]}: ${steps.join(' ')} = ${f(last[c])}.`;
    };
    return {
      task: `Work the transactions of ${name} through the accounting equation in columns and show the position after the last one: each asset in the first column, each liability and the capital in the second.`,
      data: `${name} began business this month. Its transactions:\n${storyText(txs)}`,
      title: `Accounting equation of ${name} after the transactions`,
      heading: 'Item',
      columns: ['Assets (₹)', 'Liabilities and Capital (₹)'],
      totalsAgree: true,
      rows: shown.map((c) => ({ label: COL_LABEL[c], amounts: ASSET_COLS.includes(c) ? [last[c], 0] : [0, last[c]] })),
      distractors: ['Drawings', 'Sales', 'Purchases', 'Profit'],
      explanation: [
        `Columns: ${COLUMNS_LINE}. Each transaction is a row of changes; each column is then added up.`,
        ...shown.map(trail),
        ...COLS.filter((c) => last[c] === 0 && txs.some((t) => (t.d[c] ?? 0) !== 0)).map((c) => `${COL_LABEL[c]} comes back to nil, so it is not shown.`),
        `Check: ${equationLine(last)}`,
        'Drawings, sales, purchases and profit are not items of the equation: each has already changed Cash, Stock, Debtors or Capital.',
      ],
      hints: COLUMN_HINTS,
    };
  },
  // Worked out again from the data alone: each item at the end, in its own column, and the two columns agreeing.
  verify: (q: StatementQuestion) => {
    const rows = columnsAfter(q.data);
    if (rows === null || !columnsHold(rows)) return false;
    const last = rows[rows.length - 1];
    const want = COLS.filter((c) => last[c] > 0);
    return q.rows.length === want.length && want.every((c) => q.rows.some((r) => r.label === COL_LABEL[c] && r.amounts.join() === (ASSET_COLS.includes(c) ? [last[c], 0] : [0, last[c]]).join()));
  },
});

const templates: Template[] = [
  aeEffect,
  aeMissingItem,
  aeClassify,
  aeFormPick,
  aeEffectCapital,
  aeEffectCredit,
  aeEffectAdjust,
  aeEffectHard,
  aeUnchangedPick,
  aePropertyPick,
  aeAfterOne,
  aeCapitalIncomeExpense,
  aeProfitOnSale,
  aeClosingBasic,
  aeMissingCapitalItemised,
  aeMissingAssetItemised,
  aeMissingLiabilityItemised,
  aeEffectAmount,
  aeTotals3,
  aeTotalsCapital,
  aeTotalsRhs,
  aeNetCapitalChange,
  aeUnchangedCount,
  aeClosingFull,
  aeClosingLoss,
  aeProfitFromCapitals,
  aeClosingUnknown,
  aeProfitOrLoss,
  aeTotals5,
  aeProfitFromStatements,
  aeClosingAssets,
  aeExpandedAssets,
  aeSaleMargin,
  aeDepreciationAssets,
  aeAdjustCapitalEffect,
];

// Assertion and Reason comes last, and is on its own level and on no mock paper (see assertionReason.ts).
const assertionReason = assertionReasonTemplate({
  prefix: 'ae', topicId: 'accounting-equation', conceptId: 'ae-effects',
  items: [
    {
      answer: 'explains',
      a: 'Goods costing ₹20,000 sold on credit for ₹25,000 raise the total assets by ₹5,000.',
      r: 'Stock falls by the cost of the goods and debtors rise by their selling price.',
      aWhy: 'Assets change by ₹25,000 - ₹20,000 = ₹5,000.',
      rWhy: 'The goods leave at cost and the customer owes the selling price.',
      link: 'The rise of ₹5,000 is the difference between those two changes, so R explains A.',
    },
    {
      answer: 'explains',
      a: 'Paying a creditor ₹10,000 by cheque reduces the total assets by ₹10,000.',
      r: 'The bank balance and the amount owed to creditors both fall by the same amount.',
      aWhy: 'The bank balance is an asset, and it falls by ₹10,000 with no other asset rising.',
      rWhy: 'Money goes out and the debt it pays comes to an end.',
      link: 'Assets fall because the bank balance falls, and liabilities fall with them, so R explains A.',
    },
    {
      answer: 'explains',
      a: 'Writing off a bad debt of ₹3,000 reduces capital, though no cash is paid.',
      r: 'A bad debt is a loss, so debtors and capital fall together.',
      aWhy: 'Capital falls by ₹3,000 and assets fall by the same amount.',
      rWhy: 'The amount will not be received, and a loss falls on the owner.',
      link: 'Capital falls because the bad debt is a loss, whether or not cash moves, so R explains A.',
    },
    {
      answer: 'explains',
      a: 'Collecting ₹15,000 from a debtor leaves the total assets unchanged.',
      r: 'Cash rises and debtors fall by the same amount.',
      aWhy: 'The total of the assets stays as it was.',
      rWhy: 'One asset takes the place of another.',
      link: 'The two changes in assets cancel out, which is why the total does not move, so R explains A.',
    },
    {
      answer: 'explains',
      a: 'When the proprietor pays a business creditor of ₹8,000 out of private money, capital rises by ₹8,000.',
      r: 'A business debt paid by the owner from private funds is capital brought in.',
      aWhy: 'Liabilities fall by ₹8,000, assets do not change, and so capital must rise by ₹8,000.',
      rWhy: 'The owner has put value into the business, in the form of a debt cleared.',
      link: 'Capital rises because the payment counts as fresh capital, so R explains A.',
    },
    {
      answer: 'not-the-reason',
      a: 'A business with assets of ₹9,00,000 and liabilities of ₹3,00,000 has a capital of ₹6,00,000.',
      r: 'Every transaction changes at least two items of the equation.',
      aWhy: 'Capital = Assets - Liabilities = ₹6,00,000.',
      rWhy: 'A transaction always has two effects.',
      link: 'The capital comes from the equation itself. R is about how transactions move the equation.',
    },
    {
      answer: 'not-the-reason',
      a: 'Depreciation of ₹6,000 on machinery reduces capital.',
      r: 'Charging depreciation involves no payment of cash.',
      aWhy: 'Depreciation is an expense, and an expense reduces capital.',
      rWhy: 'The machinery is written down in the books, and no money moves.',
      link: 'Capital falls because depreciation is an expense. That no cash is paid does not explain the fall.',
    },
    {
      answer: 'not-the-reason',
      a: 'Buying goods for ₹30,000 on credit increases the total assets and the total liabilities by ₹30,000.',
      r: 'A purchase of goods for cash leaves the total assets unchanged.',
      aWhy: 'Stock rises by ₹30,000 and so do the creditors.',
      rWhy: 'Stock rises and cash falls by the same amount.',
      link: 'R is about a purchase for cash. Here both totals rise because stock comes in and a debt is created.',
    },
    {
      answer: 'a-only',
      a: 'Insurance of ₹12,000 for one year is paid on 1 January and the year ends on 31 March, so ₹9,000 of it is an asset on 31 March.',
      r: 'The whole of an insurance premium reduces the capital of the year in which it is paid.',
      aWhy: 'Nine months of cover remain: ₹12,000 × 9/12 = ₹9,000 is prepaid.',
      rWhy: 'Only the part for the current year reduces capital; the rest is carried as an asset.',
    },
    {
      answer: 'a-only',
      a: 'Goods costing ₹10,000 are destroyed by fire and the insurer admits a claim of ₹7,000, so capital falls by ₹3,000.',
      r: 'A claim admitted by the insurer is not an asset until the money is received.',
      aWhy: 'Stock falls by ₹10,000, the claim of ₹7,000 comes in as an asset, and only ₹3,000 is a loss.',
      rWhy: 'A claim that has been admitted is an amount due to the business, so it is an asset at once.',
    },
    {
      answer: 'r-only',
      a: 'With an opening capital of ₹2,00,000, a profit of ₹50,000 and drawings of ₹20,000, the closing capital is ₹2,70,000.',
      r: 'Drawings are deducted in finding the closing capital.',
      aWhy: 'Closing capital = ₹2,00,000 + ₹50,000 - ₹20,000 = ₹2,30,000.',
      rWhy: 'Drawings take value out of the business, so they reduce capital.',
    },
    {
      answer: 'r-only',
      a: 'Capital rises from ₹4,00,000 to ₹5,00,000 with drawings of ₹30,000 and no capital brought in, so the profit is ₹1,00,000.',
      r: 'The rise in capital is what is left after the drawings, so they are added back to find the profit.',
      aWhy: 'Profit = ₹5,00,000 - ₹4,00,000 + ₹30,000 = ₹1,30,000.',
      rWhy: 'Drawings reduced the capital, but they are not a loss.',
    },
  ],
});

// Added after the papers were set: on levels of their own and outside the mock papers (generators/outsidePapers.ts).
const later: Template[] = [aeEffectMore, aeTotalsMore, aeColumnValue, aeFmtClosingEquation];

const withAssertionReason: Template[] = [...templates, ...later, assertionReason];

export default withAssertionReason;

/**
 * The transactions behind the effect questions, for the simulator (src/simulator/equation/generators.ts), which plays
 * them as entries. Read only: nothing here changes what a template makes.
 */
export const EQUATION_MOVES: readonly Pick<MoveDef, 'id' | 'make'>[] = MOVES;
export type { Move as EquationMove };
