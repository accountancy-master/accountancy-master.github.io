// A whole case study, as a fixture: the tests of the case-study level, of the case panel and of everything that must
// never serve one question of a case on its own use it, so they run whatever cases the stages hold. Its text is as
// long as a case may be (fourteen lines, the first of them long enough to wrap on a phone). It is not registered in
// any stage and never reaches a learner; a unit test that needs it registered mocks a stage's file with it.
import { creditor, debtor } from '@/engine/accounts';
import { accountOf, post, trialBalance, type DatedEntry } from '@/engine/books';
import type { JournalLine } from '@/engine/journal';
import { amount, caseTemplate, formatINR, ledgerSides } from '@/generators/authoring';
import { casePartId } from '@/generators/engine';
import type { CaseTemplate } from '@/generators/types';

const dr = (accountId: string, value: number): JournalLine => ({ accountId, side: 'Dr', amount: value });
const cr = (accountId: string, value: number): JournalLine => ({ accountId, side: 'Cr', amount: value });

/** The stage the sample belongs to (see `CASE_STAGES`): its topic and the concept its questions count towards. */
export const SAMPLE_CASE_TOPIC = 'trial-balance';
export const SAMPLE_CASE_CONCEPT = 'tb-case';

/** The first fortnight of a new shop: thirteen transactions, then five questions that end at the trial balance. */
export const SAMPLE_CASE = caseTemplate({
  id: 'case-sample-fortnight',
  topicId: SAMPLE_CASE_TOPIC,
  conceptId: SAMPLE_CASE_CONCEPT,
  difficulty: 'medium',
  title: 'The first fortnight of a shop',
  setup: (rng) => {
    const owner = rng.pick(['Meena', 'Arjun', 'Fatima']);
    const trade = rng.pick(['stationery', 'hardware', 'grocery']);
    const supplier = rng.pick(['Rao & Co.', 'Sharma Bros']);
    const customer = rng.pick(['Kiran', 'Anita Traders']);
    const capital = amount(rng, 300000, 600000, 50000);
    const furniture = amount(rng, 20000, 40000, 5000);
    const goods = amount(rng, 40000, 90000, 5000);
    const onCredit = amount(rng, 30000, 60000, 5000);
    const sale = amount(rng, 30000, 70000, 5000);
    const creditSale = amount(rng, 20000, 40000, 5000);
    const deposit = amount(rng, 20000, 50000, 10000);
    const rent = amount(rng, 4000, 9000, 1000);
    const wages = amount(rng, 2000, 5000, 1000);
    const paid = amount(rng, 10000, 25000, 5000);
    const received = amount(rng, 5000, 15000, 5000);
    const drawings = amount(rng, 2000, 6000, 1000);
    if (sale + creditSale >= goods + onCredit) return null;
    const entries = [
      [dr('cash', capital), cr('capital', capital)],
      [dr('furniture', furniture), cr('cash', furniture)],
      [dr('purchases', goods), cr('cash', goods)],
      [dr('purchases', onCredit), cr(creditor(supplier), onCredit)],
      [dr('cash', sale), cr('sales', sale)],
      [dr(debtor(customer), creditSale), cr('sales', creditSale)],
      [dr('bank', deposit), cr('cash', deposit)],
      [dr('rent', rent), cr('cash', rent)],
      [dr('wages', wages), cr('cash', wages)],
      [dr(creditor(supplier), paid), cr('cash', paid)],
      [dr('cash', received), cr(debtor(customer), received)],
      [dr('drawings', drawings), cr('cash', drawings)],
    ];
    const ledger = post(entries);
    const cashIn = capital + sale + received;
    const cashOut = furniture + goods + deposit + rent + wages + paid + drawings;
    return {
      owner, trade, supplier, customer, capital, furniture, goods, onCredit, sale, creditSale, deposit, rent, wages, paid,
      received, drawings, entries, ledger, cashIn, cashOut,
    };
  },
  context: (s) =>
    [
      `${s.owner} opened a ${s.trade} shop on 1 April, keeps the books on the double entry system and deals only in goods on which no GST is charged.`,
      `1 April: Started business with cash ${formatINR(s.capital)}.`,
      `2 April: Bought furniture for cash ${formatINR(s.furniture)}.`,
      `3 April: Bought goods for cash ${formatINR(s.goods)}.`,
      `4 April: Bought goods on credit from ${s.supplier} ${formatINR(s.onCredit)}.`,
      `6 April: Sold goods for cash ${formatINR(s.sale)}.`,
      `8 April: Sold goods on credit to ${s.customer} ${formatINR(s.creditSale)}.`,
      `10 April: Deposited cash into the bank ${formatINR(s.deposit)}.`,
      `11 April: Paid rent in cash ${formatINR(s.rent)}.`,
      `12 April: Paid wages in cash ${formatINR(s.wages)}.`,
      `13 April: Paid ${s.supplier} in cash ${formatINR(s.paid)}.`,
      `14 April: Received cash from ${s.customer} ${formatINR(s.received)}.`,
      `15 April: Withdrew cash for personal use ${formatINR(s.drawings)}.`,
      'A trial balance is prepared at the close of 15 April.',
    ].join('\n'),
  parts: [
    {
      kind: 'journal',
      make: (s) => ({
        prompt: 'Pass the journal entry for the transaction of 4 April.',
        lines: s.entries[3],
        explanation: [
          'Goods bought for resale are purchases, an expense, so Purchases A/c is debited.',
          `They were bought on credit, so ${s.supplier}, a creditor, is credited.`,
        ],
      }),
    },
    {
      kind: 'numeric',
      unit: 'rupees',
      make: (s) => ({
        prompt: 'What is the balance of Cash A/c at the close of 15 April?',
        answer: s.ledger.get('cash')!,
        commonErrors: [
          { value: s.cashIn - s.cashOut + s.deposit, why: 'Left out the cash deposited into the bank.' },
          { value: s.cashIn - s.cashOut + s.drawings, why: 'Left out the cash withdrawn for personal use.' },
        ],
        explanation: [
          `Receipts: ${formatINR(s.capital)} + ${formatINR(s.sale)} + ${formatINR(s.received)} = ${formatINR(s.cashIn)}.`,
          `Payments, including the deposit into the bank: ${formatINR(s.cashOut)}.`,
          `Balance = ${formatINR(s.cashIn)} - ${formatINR(s.cashOut)} = ${formatINR(s.cashIn - s.cashOut)} (debit).`,
        ],
      }),
      verify: (q) => q.answer > 0,
    },
    {
      kind: 'mcq',
      make: (s) => ({
        prompt: `How does the account of ${s.supplier} stand at the close of 15 April?`,
        correct: `Credit balance of ${formatINR(s.onCredit - s.paid)}`,
        distractors: [
          { text: `Debit balance of ${formatINR(s.onCredit - s.paid)}`, why: 'A supplier still to be paid is a creditor, whose account has a credit balance.' },
          { text: `Credit balance of ${formatINR(s.onCredit)}`, why: 'Left out the cash paid on 13 April.' },
          { text: `Credit balance of ${formatINR(s.onCredit + s.paid)}`, why: 'Added the payment instead of deducting it.' },
        ],
        explanation: `${formatINR(s.onCredit)} is owed for the goods and ${formatINR(s.paid)} has been paid, so ${formatINR(s.onCredit - s.paid)} is still owed: a credit balance.`,
      }),
    },
    {
      kind: 'numeric',
      unit: 'rupees',
      make: (s) => ({
        prompt: 'What is the balance of Sales A/c at the close of 15 April?',
        answer: s.sale + s.creditSale,
        commonErrors: [
          { value: s.sale, why: 'Took the cash sale only: a credit sale is a sale too.' },
          { value: s.sale + s.received, why: 'Took the cash received from the customer instead of the credit sale.' },
        ],
        explanation: [`Cash sale ${formatINR(s.sale)} + credit sale ${formatINR(s.creditSale)} = ${formatINR(s.sale + s.creditSale)} (credit).`],
      }),
    },
    {
      kind: 'numeric',
      unit: 'rupees',
      make: (s) => ({
        prompt: 'What is the total of the debit column of the trial balance?',
        answer: trialBalance(s.ledger).debitTotal,
        commonErrors: [
          { value: s.capital, why: 'Took the capital alone: sales and the creditor have credit balances too.' },
          { value: trialBalance(s.ledger).debitTotal - s.drawings, why: 'Left out Drawings A/c, which has a debit balance.' },
        ],
        explanation: [
          `Credit balances: Capital ${formatINR(s.capital)}, Sales ${formatINR(s.sale + s.creditSale)}, ${s.supplier} ${formatINR(s.onCredit - s.paid)}.`,
          `Their total, ${formatINR(trialBalance(s.ledger).creditTotal)}, is also the total of the debit column.`,
        ],
      }),
    },
  ],
});

/** The same case under another id, for tests in which a level has two cases to take turns with. */
export const SECOND_SAMPLE_CASE: CaseTemplate = {
  ...SAMPLE_CASE,
  id: 'case-sample-again',
  title: 'Another fortnight of a shop',
  parts: SAMPLE_CASE.parts.map((part, i) => ({ ...part, id: casePartId('case-sample-again', i) })),
};

/**
 * The sample case under another id and title, filed under another stage's topic and concept: for tests in which a
 * stage that has no case yet is given one (a stage beside another on the same topic, say).
 */
export function sampleCaseOf(stage: { topicId: string; conceptId: string }, id: string, title: string): CaseTemplate {
  const filed = { topicId: stage.topicId, conceptId: stage.conceptId };
  return { ...SAMPLE_CASE, ...filed, id, title, parts: SAMPLE_CASE.parts.map((part, i) => ({ ...part, ...filed, id: casePartId(id, i) })) };
}

/**
 * A chained case, as a fixture: the first week of a new shop, journalised (a set of entries), posted to Cash A/c (an
 * account) and carried to the trial balance (a statement). The case text is the only data of all three: the set
 * names each transaction in a few words and leaves the amounts to the case, and the two formats give no data.
 */
export const SAMPLE_CHAIN = caseTemplate({
  id: 'case-sample-chain',
  topicId: SAMPLE_CASE_TOPIC,
  conceptId: SAMPLE_CASE_CONCEPT,
  difficulty: 'medium',
  title: 'A week from the journal to the trial balance',
  setup: (rng) => {
    const owner = rng.pick(['Meena', 'Arjun', 'Fatima']);
    const trade = rng.pick(['stationery', 'hardware', 'grocery']);
    const supplier = rng.pick(['Rao & Co.', 'Sharma Bros']);
    const capital = amount(rng, 200000, 500000, 50000);
    const goods = amount(rng, 40000, 90000, 5000);
    const onCredit = amount(rng, 20000, 60000, 5000);
    const sale = amount(rng, 20000, 60000, 5000);
    // The week ends with the rent or with the wages: which one is drawn with the rest.
    const [expense, paid] = rng.pick([['rent', 'Paid rent'], ['wages', 'Paid wages']] as const);
    const cost = amount(rng, 4000, 9000, 1000);
    const dated: (DatedEntry & { text: string; told: string; why: string[] })[] = [
      {
        date: '1 April',
        text: 'Capital brought in as cash.',
        told: `Started business with cash ${formatINR(capital)}.`,
        lines: [dr('cash', capital), cr('capital', capital)],
        why: ['Cash comes in, so Cash A/c is debited.', 'It is the capital of the owner, so Capital A/c is credited.'],
      },
      {
        date: '2 April',
        text: 'Goods bought for cash.',
        told: `Bought goods for cash ${formatINR(goods)}.`,
        lines: [dr('purchases', goods), cr('cash', goods)],
        why: ['Goods bought for resale are purchases, so Purchases A/c is debited.', 'Cash goes out, so Cash A/c is credited.'],
      },
      {
        date: '3 April',
        text: `Goods bought on credit from ${supplier}.`,
        told: `Bought goods on credit from ${supplier} ${formatINR(onCredit)}.`,
        lines: [dr('purchases', onCredit), cr(creditor(supplier), onCredit)],
        why: ['Goods bought for resale are purchases, so Purchases A/c is debited.', `${supplier} is owed the price, so ${supplier} is credited.`],
      },
      {
        date: '5 April',
        text: 'Goods sold for cash.',
        told: `Sold goods for cash ${formatINR(sale)}.`,
        lines: [dr('cash', sale), cr('sales', sale)],
        why: ['Cash comes in, so Cash A/c is debited.', 'Sales are an income, so Sales A/c is credited.'],
      },
      {
        date: '7 April',
        text: `${paid} in cash.`,
        told: `${paid} in cash ${formatINR(cost)}.`,
        lines: [dr(expense, cost), cr('cash', cost)],
        why: [`${expense === 'rent' ? 'Rent is' : 'Wages are'} an expense, so ${expense === 'rent' ? 'Rent' : 'Wages'} A/c is debited.`, 'Cash goes out, so Cash A/c is credited.'],
      },
    ];
    return { owner, trade, supplier, dated, ledger: post(dated.map((e) => e.lines)) };
  },
  context: (s) =>
    [`${s.owner} opened a ${s.trade} shop on 1 April and deals only in goods on which no GST is charged.`, ...s.dated.map((e) => `${e.date}: ${e.told}`)].join('\n'),
  parts: [
    {
      kind: 'journal_set',
      make: (s) => ({
        task: 'Journalise the transactions of the week.',
        transactions: s.dated.map((e) => ({ date: e.date, text: e.text, lines: e.lines, explanation: e.why })),
      }),
    },
    {
      kind: 'account',
      make: (s) => ({
        task: 'Prepare Cash A/c for the week and balance it on 7 April.',
        title: 'Cash A/c',
        ...ledgerSides(accountOf(s.dated, 'cash'), { closeOn: '7 April' }),
        distractors: ['Cash A/c', 'Balance b/d', `${s.supplier} A/c`],
        explanation: ['Cash received is entered on the debit side and cash paid on the credit side.', 'The debit side is larger, so the balance is carried down on the credit side.'],
      }),
      // The closing row is the balance the ledger gives, found here from the case text instead of the entries.
      verify: (q) => {
        const figures = [...q.data.matchAll(/^(\d+ April): (.+?) ₹([\d,]+)\.$/gm)].map((m) => ({ told: m[2], value: Number(m[3].replace(/,/g, '')) * 100 }));
        const cashIn = figures.filter((f) => /^(Started|Sold)/.test(f.told)).reduce((sum, f) => sum + f.value, 0);
        const cashOut = figures.filter((f) => /^(Bought goods for cash|Paid)/.test(f.told)).reduce((sum, f) => sum + f.value, 0);
        return q.sides[1].rows.some((r) => r.closing && r.amounts[0] === cashIn - cashOut);
      },
    },
    {
      kind: 'statement',
      make: (s) => ({
        task: 'Prepare the Trial Balance on 7 April.',
        title: `Trial Balance of ${s.owner} as on 7 April`,
        heading: 'Name of account',
        columns: ['Debit (₹)', 'Credit (₹)'],
        totalsAgree: true,
        rows: trialBalance(s.ledger).rows.map((r) => ({ label: r.label, amounts: r.side === 'Dr' ? [r.amount, 0] : [0, r.amount] })),
        distractors: ['Closing stock', 'Suspense A/c'],
        explanation: ['Cash, purchases and the expense have debit balances.', `Capital, sales and ${s.supplier}, a creditor, have credit balances.`],
      }),
      verify: (q) => q.rows.some((r) => r.label === 'Cash A/c' && r.amounts[0] > 0 && r.amounts[1] === 0),
    },
  ],
});
