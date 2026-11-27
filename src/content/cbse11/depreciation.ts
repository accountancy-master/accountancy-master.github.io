import { buildLadder, laterLevels } from '../ladder';
import type { Card, Concept, Difficulty, JournalQuestion, McqQuestion, NumericQuestion, Question, TopicPack, TrueFalseQuestion } from '../types';
import type { JournalLine } from '@/engine/journal';

const T = 'depreciation';

const concepts: Concept[] = [
  { id: 'dep-meaning', topicId: T, title: 'Meaning, causes and need for depreciation' },
  { id: 'dep-cost', topicId: T, title: 'Cost of an asset' },
  { id: 'dep-slm', topicId: T, title: 'Straight line method' },
  { id: 'dep-wdv', topicId: T, title: 'Written down value method' },
  { id: 'dep-part-year', topicId: T, title: 'Depreciation for part of a year' },
  { id: 'dep-accounting', topicId: T, title: 'Recording depreciation: asset account or provision account' },
  { id: 'dep-sale', topicId: T, title: 'Sale of an asset: profit or loss' },
  { id: 'dep-compare', topicId: T, title: 'Comparing the two methods' },
  { id: 'dep-sets', topicId: T, title: 'Journalising the life of an asset' },
  { id: 'dep-formats', topicId: T, title: 'Preparing the asset, provision and disposal accounts' },
];

// ---------------------------------------------------------------------------------------------------------------
// Cards
// ---------------------------------------------------------------------------------------------------------------

const card = (
  n: number,
  conceptId: string,
  kind: Card['kind'],
  prompt: string,
  answer: string,
  explanation: string,
  example: string,
  commonMistake: string,
): Card => ({ id: `dep-card-${n}`, topicId: T, conceptId, kind, prompt, answer, explanation, example, commonMistake });

const cards: Card[] = [
  card(1, 'dep-meaning', 'rule', 'What is depreciation and why is it charged?',
    'The part of the cost of a fixed asset that is used up in a year, charged as an expense so that every year of use carries its share of the cost.',
    'An asset serves the business for several years. Writing off the whole cost in the year of purchase would make that year look very poor and the later years look too good.',
    'A machine costing ₹1,00,000 that serves for 5 years with no scrap value is charged ₹20,000 a year (straight line): ₹1,00,000 / 5.',
    'Thinking depreciation is cash set aside for a new asset, or the fall in the market price. It is a book entry; no cash moves.'),
  card(2, 'dep-meaning', 'rule', 'What are the causes of depreciation?',
    'Wear and tear from use, obsolescence (a newer, better asset), passage of time (a lease or patent that expires) and exhaustion of a natural resource (mine, quarry). A change in market price is not a cause.',
    'Each cause lowers the useful life that is left in the asset, so a part of its cost is used up.',
    'A computer that still works but cannot run the new software has lost value through obsolescence.',
    'Counting a fall in the market price of the asset as a cause of depreciation.'),
  card(3, 'dep-meaning', 'rule', 'Which assets are depreciated?',
    'Tangible fixed assets whose usefulness wears out with use or time: machinery, furniture, vehicles, buildings, computers. Land is generally not depreciated. The cost of an intangible asset such as a patent, a copyright or a lease is written off over its life too, but that write-off is called amortisation, not depreciation.',
    'Land is not used up by time or use. Current assets such as stock and debtors are not written off at all. The name of the write-off follows the kind of asset: depreciation for tangible fixed assets, amortisation for intangible ones, depletion for a mine or a quarry.',
    'Machinery, furniture and a delivery van are depreciated; a patent bought for 10 years is amortised; the plot on which the factory stands is not written off.',
    'Depreciating land or stock, or calling the write-off of a patent or a lease depreciation.'),
  card(4, 'dep-cost', 'formula', 'How is the cost of an asset found?',
    'Cost = purchase price (after trade discount) + carriage + installation and erection + duty and similar costs of making it ready for use. Repairs and running costs are not part of the cost.',
    'Everything spent to bring the asset to the place and make it ready for use is capitalised: added to the asset and not charged as an expense.',
    'Machine ₹2,00,000 + carriage ₹10,000 + installation ₹15,000 = ₹2,25,000 is the cost on which depreciation is worked.',
    'Charging freight and installation to expenses, or adding repairs and wages of the operator to the cost.'),
  card(5, 'dep-slm', 'formula', 'How is annual depreciation found under the straight line method?',
    'Annual depreciation = (Cost - Scrap value) / Life in years. It is the same every year.',
    'Scrap value is what the asset is expected to fetch at the end of its life, so only cost less scrap value is written off.',
    'Cost ₹1,20,000, scrap value ₹20,000, life 5 years: (1,20,000 - 20,000) / 5 = ₹20,000 a year.',
    'Dividing the whole cost by the life and forgetting to deduct the scrap value first.'),
  card(6, 'dep-slm', 'formula', 'How are the rate, the book value and the total depreciation related under the straight line method?',
    'Rate = annual depreciation / cost x 100. Book value after n years = Cost - (annual depreciation x n). Total depreciation = annual depreciation x n.',
    'The rate under this method is always taken on the original cost, so the amount does not change from year to year.',
    'Cost ₹2,00,000, scrap ₹40,000, life 5 years: yearly ₹32,000, rate 16%, book value after 3 years = 2,00,000 - 96,000 = ₹1,04,000.',
    'Giving the total depreciation when the book value is asked, or the other way round.'),
  card(7, 'dep-wdv', 'formula', 'How is depreciation found under the written down value method?',
    'Depreciation = rate x opening book value of the year. Closing book value = opening book value - depreciation.',
    'The percentage is applied to a balance that falls every year, so the charge is highest in the first year and smaller each year after.',
    '20% on ₹1,00,000: year 1 charge ₹20,000, book value ₹80,000; year 2 charge ₹16,000, book value ₹64,000.',
    'Applying the percentage to the original cost every year, which is the straight line method in disguise.'),
  card(8, 'dep-wdv', 'shortcut', 'Is there a quick way to the book value after n full years under the written down value method?',
    'Book value after n years = Cost x (1 - r)^n, where r is the rate as a fraction.',
    'Each year the book value is multiplied by (1 - r). It works only when every year is a full year, so not when the first year is a part year.',
    '₹1,00,000 at 10% for 3 years: 1,00,000 x 0.9 x 0.9 x 0.9 = ₹72,900.',
    'Using this shortcut when the asset was bought part-way through the first year.'),
  card(9, 'dep-part-year', 'rule', 'How is depreciation charged in the year an asset is bought or sold?',
    'For the months of use only: full-year depreciation x months / 12. The months are counted from the date of purchase to the year end, or from the start of the year to the date of sale. Other years are full years.',
    'Depreciation follows use, so a year in which the asset was held for only some months carries only that share. Count whole months, using the accounting year end given in the question.',
    'Year ends 31 March. Machine bought on 1 October, 10% on ₹1,20,000: ₹12,000 x 6/12 = ₹6,000 for the first year.',
    'Charging a full year, or counting the months before the purchase instead of the months after it.'),
  card(10, 'dep-accounting', 'format', 'What is the entry when depreciation is charged to the asset account?',
    'Depreciation A/c Dr; To Machinery (or other asset) A/c. The asset account is reduced every year and shows the book value.',
    'Depreciation is an expense, so it is debited. The asset loses value, so it is credited.',
    'Depreciation of ₹20,000 on machinery: Depreciation A/c Dr 20,000; To Machinery A/c 20,000.',
    'Crediting the Depreciation account, or debiting the asset account.'),
  card(11, 'dep-accounting', 'format', 'What is the entry when a Provision for Depreciation account is kept?',
    'Depreciation A/c Dr; To Provision for Depreciation A/c. The asset account stays at cost; the balance sheet shows cost less provision.',
    'The provision account is a contra account that collects the depreciation of the asset year after year.',
    'Depreciation of ₹20,000: Depreciation A/c Dr 20,000; To Provision for Depreciation A/c 20,000. Balance sheet: Machinery ₹1,00,000 less Provision ₹20,000 = ₹80,000.',
    'Crediting the asset account as well, or adding the provision to the asset.'),
  card(12, 'dep-accounting', 'rule', 'Where does the Depreciation account go at the end of the year?',
    'It is closed by transfer to the debit side of the Profit and Loss A/c: Profit and Loss A/c Dr; To Depreciation A/c.',
    'Depreciation is an indirect expense of the year and reduces the profit.',
    'Depreciation of ₹20,000 reduces the net profit by ₹20,000.',
    'Showing depreciation in the Trading Account, or leaving it out of the profit and loss account.'),
  card(13, 'dep-sale', 'formula', 'How is the profit or loss on the sale of an asset found?',
    'Profit or loss = Selling price - Book value on the date of sale. A positive figure is a profit; a negative one is a loss.',
    'Book value is cost less depreciation up to the date of sale. The original cost is not the figure to compare with.',
    'Book value ₹64,000, sold for ₹70,000: profit of ₹6,000. Sold for ₹60,000: loss of ₹4,000.',
    'Comparing the selling price with the original cost.'),
  card(14, 'dep-sale', 'format', 'What is the entry for the sale of an asset when depreciation has been charged to the asset account?',
    'Bank (or Cash) A/c Dr with the price; Loss on Sale A/c Dr with any loss; To Asset A/c with the book value; To Profit on Sale A/c with any profit.',
    'The asset leaves at its book value. The difference between the price and the book value balances the entry.',
    'Book value ₹40,000 sold for ₹35,000 in cash: Cash A/c Dr 35,000; Loss on Sale of Asset A/c Dr 5,000; To Machinery A/c 40,000.',
    'Crediting the asset with the selling price instead of its book value.'),
  card(15, 'dep-sale', 'format', 'What are the entries through an Asset Disposal account when a provision account is kept?',
    '1) Asset Disposal Dr; To Asset (cost). 2) Provision for Depreciation Dr; To Asset Disposal (depreciation on it). 3) Bank Dr; To Asset Disposal (price). 4) A debit balance of Asset Disposal is a loss: Loss on Sale Dr; To Asset Disposal. A credit balance is a profit: Asset Disposal Dr; To Profit on Sale.',
    'Asset Disposal A/c collects the cost, the depreciation and the sale proceeds; what is left over is the profit or loss.',
    'Cost ₹1,00,000, provision ₹40,000, sold for ₹50,000: debit ₹1,00,000; credits ₹40,000 + ₹50,000 = ₹90,000; balance ₹10,000 is a loss.',
    'Leaving out the transfer of the provision, so that the loss is overstated.'),
  card(16, 'dep-sale', 'shortcut', 'How much depreciation has been charged on an asset by the date of sale?',
    'Total depreciation = Cost - Book value on the date of sale. In the year of sale, depreciation is charged only up to the date of sale.',
    'The selling price has no effect on the depreciation already charged; it affects only the profit or loss.',
    'Cost ₹1,00,000, book value ₹64,000 at the date of sale: total depreciation ₹36,000.',
    'Using the selling price in place of the book value to find the depreciation.'),
  card(17, 'dep-sale', 'rule', 'What if there are expenses of removing the asset that is sold?',
    'The net proceeds are the price less the removal expenses. Loss = Book value - Net proceeds; the removal expenses add to the loss or reduce the profit.',
    'The business receives less than the price from the sale, so the result is worse by the amount of the expenses.',
    'Book value ₹50,000, sold for ₹45,000, removal expenses ₹3,000: net ₹42,000, loss ₹8,000.',
    'Ignoring the removal expenses, or subtracting them from the loss instead of adding them.'),
  card(18, 'dep-compare', 'rule', 'How do the straight line and written down value methods compare?',
    'Straight line: the same amount each year on cost; the book value falls to the scrap value. Written down value: a falling charge on the book value, highest in the first year; the book value never reaches zero. At the same rate the first year charge is equal, and from year 2 the written down value charge is lower.',
    'With the written down value method, depreciation plus repairs stays steadier as repairs rise with age.',
    '10% on ₹1,00,000: straight line ₹10,000, ₹10,000, ₹10,000; written down value ₹10,000, ₹9,000, ₹8,100.',
    'Thinking the written down value method charges more than straight line in every year at the same rate.'),
  // Added after the check against the CBSE 2025-26 syllabus (docs/syllabus-coverage.md), which names the features and
  // the factors of depreciation, depletion and amortisation, and the advantages of each method.
  card(19, 'dep-meaning', 'rule', 'What are the features of depreciation, and which factors decide its amount?',
    'Features: it is a decline in the book value of a fixed asset; it is a gradual and continuing process over the useful life; it is a non-cash expense, a charge against profit; it arises from use, time or obsolescence, not from a fall in market price. Factors: the cost of the asset, its estimated useful life, its estimated scrap (salvage) value, and the depreciable cost, which is cost less scrap value.',
    'The depreciable cost is what is spread over the useful life, so a change in any of the three estimates changes the yearly charge.',
    'Cost ₹2,20,000, scrap value ₹20,000, useful life 5 years: depreciable cost ₹2,00,000, charged at ₹40,000 a year by the straight line method.',
    'Spreading the full cost when a scrap value is given, or treating depreciation as cash put aside.'),
  card(20, 'dep-meaning', 'rule', 'What are depletion and amortisation, and how do they differ from depreciation?',
    'Depletion is the using up of a natural resource (a mine, a quarry, an oil well), worked on the quantity extracted. Amortisation is the writing off of the cost of an intangible asset (a patent, a copyright, a trademark, goodwill bought, a lease) over its useful life. Depreciation is the word used for tangible fixed assets such as machinery and buildings.',
    'All three spread a cost over the periods that benefit from it; the name changes with the kind of asset.',
    'A quarry bought for ₹10,00,000 with 1,00,000 tonnes of stone: 8,000 tonnes taken out this year gives depletion of ₹80,000. A patent costing ₹5,00,000 for 10 years is amortised at ₹50,000 a year.',
    'Calling the write-off of a patent depreciation, or charging depletion on a fixed rate of years when it follows the quantity extracted.'),
  card(21, 'dep-compare', 'rule', 'What are the advantages of the straight line method and of the written down value method?',
    'Straight line: simple to work out and to understand; the same charge every year makes the results of years comparable; the asset can be written down to exactly its scrap value; suits assets whose use is even over their life, such as leases and patents. Written down value: a larger charge in the early years, when the asset is most useful; depreciation plus repairs stays fairly even over the years, because repairs rise as the charge falls; it is the method accepted by the income tax law; suits assets like plant and machinery and vehicles.',
    'Choose by the pattern of use and repairs: even use favours straight line, heavy early use and rising repairs favour written down value.',
    'A 10-year lease is written off at the same amount each year (straight line); delivery vans, which need more repairs as they age, are depreciated on the written down value.',
    'Thinking one method suits every asset, or that the written down value method writes the asset down to nil.'),
];

// ---------------------------------------------------------------------------------------------------------------
// Authored questions
// ---------------------------------------------------------------------------------------------------------------

const qid = (n: number): string => `dep-q-${String(n).padStart(3, '0')}`;

/** An mcq: the right option is put at a position that depends on n, so the answers are spread over a, b, c and d. */
function mcq(
  n: number,
  conceptId: string,
  difficulty: Difficulty,
  prompt: string,
  correct: string,
  wrong: [string, string][],
  explanation: string,
  hints: string[],
): McqQuestion {
  const pos = n % (wrong.length + 1);
  const all: { text: string; why?: string }[] = [...wrong.map(([text, why]) => ({ text, why }))];
  all.splice(pos, 0, { text: correct });
  const options = all.map((o, i) => ({ id: 'abcdefgh'[i], text: o.text, ...(o.why === undefined ? {} : { why: o.why }) }));
  return {
    id: qid(n), topicId: T, conceptId, difficulty, type: 'mcq', prompt, options,
    correct: options.find((o) => o.text === correct)!.id, hints, explanation,
  };
}

/** The board's four options of an Assertion-Reason question, always in this order. */
const AR_TEXTS = [
  'Both Assertion (A) and Reason (R) are true, and R is the correct explanation of A.',
  'Both A and R are true, but R is not the correct explanation of A.',
  'A is true, but R is false.',
  'A is false, but R is true.',
] as const;
const AR_HINTS = ['Judge A by itself, then R by itself: true or false?', 'If both are true, read them as "A, because R". Is that the real reason?'];

/**
 * An Assertion-Reason question with the board's four options in the board's order; `answer` is the index of the right
 * one and `whys` are the mistakes behind the three others, in order.
 */
function ar(n: number, conceptId: string, difficulty: Difficulty, assertion: string, reason: string, answer: 0 | 1 | 2 | 3, whys: [string, string, string], explanation: string): McqQuestion {
  const wrong = [...whys];
  const options = AR_TEXTS.map((text, i) => ({ id: 'abcd'[i], text, ...(i === answer ? {} : { why: wrong.shift()! }) }));
  return {
    id: qid(n), topicId: T, conceptId, difficulty, type: 'mcq', prompt: `Assertion (A): ${assertion}\nReason (R): ${reason}\nChoose the correct option.`,
    options, correct: 'abcd'[answer], hints: AR_HINTS, explanation,
  };
}

const tf = (n: number, conceptId: string, difficulty: Difficulty, prompt: string, correct: boolean, explanation: string, hints: string[]): TrueFalseQuestion => ({
  id: qid(n), topicId: T, conceptId, difficulty, type: 'true_false', prompt, correct, hints, explanation,
});

const rs = (n: number): number => n * 100;

const num = (
  n: number,
  conceptId: string,
  difficulty: Difficulty,
  prompt: string,
  answer: number,
  errors: [number, string][],
  working: string[],
  hints: string[],
): NumericQuestion => ({
  id: qid(n), topicId: T, conceptId, difficulty, type: 'numeric', unit: 'rupees', prompt, answer: rs(answer),
  commonErrors: errors.map(([value, why]) => ({ value: rs(value), why })), working, hints, explanation: working.join(' '),
});

const jr = (
  n: number,
  conceptId: string,
  difficulty: Difficulty,
  prompt: string,
  lines: [string, 'Dr' | 'Cr', number][],
  extraChoices: string[],
  explanation: string,
  hints: string[],
): JournalQuestion => {
  const expected: JournalLine[] = lines.map(([accountId, side, amount]) => ({ accountId, side, amount: rs(amount) }));
  return {
    id: qid(n), topicId: T, conceptId, difficulty, type: 'journal_entry', prompt, expected,
    accountChoices: [...new Set([...expected.map((l) => l.accountId), ...extraChoices, 'cash', 'bank'])].sort(), hints, explanation,
  };
};

const questions: Question[] = [
  // ---- Meaning, causes, cost, the two methods (recognition) ----
  mcq(1, 'dep-meaning', 'easy', 'Which statement best describes depreciation?',
    'The part of the cost of a fixed asset that is used up in an accounting year',
    [
      ['The fall in the market price of an asset during the year', 'Confused depreciation with a change in market value; depreciation spreads cost and does not follow prices.'],
      ['The cash set aside each year to buy a new asset', 'Treated it as a fund in cash; depreciation is a book entry and no cash is set aside.'],
      ['The money spent on repairing an asset', 'Mixed up depreciation with repairs, which are a separate expense.'],
    ],
    'Depreciation is the share of an asset\'s cost that is used up in the year and charged as an expense.',
    ['Think of the asset as being "used up" over its life.', 'Depreciation is not a cash payment.']),
  tf(2, 'dep-meaning', 'easy', 'Land is generally depreciated every year in the same way as machinery.', false,
    'Land is not used up by use or the passing of time, so it is generally not depreciated.',
    ['What wears out or expires with time?']),
  mcq(3, 'dep-meaning', 'easy', 'A firm uses a printing press for three shifts a day. Which cause of depreciation is the main one here?',
    'Wear and tear',
    [
      ['Obsolescence', 'Picked a newer machine arriving; the press is simply being used heavily.'],
      ['Expiry of time', 'Picked a fixed legal period; the press has no such period.'],
      ['Fall in market price', 'Picked a price change, which is not a cause of depreciation.'],
    ],
    'Heavy use wears the parts out: wear and tear.', ['What is happening to the machine physically?']),
  mcq(4, 'dep-meaning', 'easy', 'A patent right is granted for 12 years. Why does its value fall with each year that passes?',
    'The period for which the right lasts is running out',
    [
      ['The patent wears out through use', 'A patent is a right; it does not wear out physically.'],
      ['A newer machine has made it out of date', 'Obsolescence is not what the question describes; the right simply has a fixed period.'],
      ['Its market price has fallen', 'Market price changes are not a cause of depreciation.'],
    ],
    'A patent, like a lease, loses value as its fixed period expires.', ['Is the right used up by use, or by time?']),
  mcq(5, 'dep-cost', 'easy', 'A firm buys a machine for ₹3,00,000 and pays ₹12,000 for carriage and ₹18,000 for installation. On what amount is depreciation worked out?',
    '₹3,30,000',
    [
      ['₹3,00,000', 'Left out carriage and installation, which are part of the cost of getting the machine ready for use.'],
      ['₹3,12,000', 'Included carriage but left out installation.'],
      ['₹3,18,000', 'Included installation but left out carriage.'],
    ],
    'Cost = 3,00,000 + 12,000 + 18,000 = ₹3,30,000.', ['Which payments were needed to make the machine ready for use?']),
  tf(6, 'dep-slm', 'easy', 'Under the straight line method the depreciation is the same amount every year.', true,
    'The charge is (cost - scrap value) / life, a fixed amount, in every full year.', ['Look at the formula: does anything in it change from year to year?']),
  mcq(7, 'dep-wdv', 'easy', 'Under the written down value method, the rate of depreciation is applied to:',
    'The book value at the start of each year',
    [
      ['The original cost every year', 'This is the straight line method, where the base never changes.'],
      ['The selling price of the asset', 'Used the sale price, which is not known until the asset is sold.'],
      ['The scrap value', 'Applied the rate to the scrap value, which is the amount left at the end of life.'],
    ],
    'The base is the reducing balance, which is why the charge falls each year.', ['The method is also called the reducing balance method.']),
  ar(8, 'dep-meaning', 'medium', 'Charging depreciation reduces the profit of the year.', 'Depreciation is an expense of using the asset.', 0,
    [
      'Missed the link: the profit falls precisely because depreciation is an expense charged against it.',
      'Took R for false. Depreciation is the cost of the asset used up in the year, an expense charged to the Profit and Loss A/c.',
      'Took A for false. Every expense charged to the Profit and Loss A/c lowers the profit, and depreciation is one.',
    ],
    'A is true: the charge is debited to the Profit and Loss A/c. R is true: depreciation is the part of the cost of the asset used up in the year. R explains A: because depreciation is an expense, charging it lowers the profit.'),
  tf(9, 'dep-meaning', 'medium', 'Depreciation is charged even in a year when the market price of the asset rises.', true,
    'Depreciation spreads the cost over the years of use. It does not follow the market price, so it is charged whatever the price does.',
    ['Is depreciation based on market price or on cost and use?']),
  mcq(10, 'dep-slm', 'easy', 'The scrap value of an asset is:',
    'The amount the asset is expected to fetch at the end of its useful life',
    [
      ['The amount spent on repairing it', 'Confused the scrap value with repair expenses.'],
      ['The depreciation charged in the first year', 'Confused it with the yearly charge.'],
      ['The cost paid when it was bought', 'Confused it with the original cost.'],
    ],
    'Scrap (residual) value is the expected sale value at the end of life; only cost less scrap value is depreciated.', ['It comes at the end of the life, not at the start.']),
  tf(11, 'dep-wdv', 'medium', 'With the same rate and no part-year, the written down value charge for the second year is lower than the first year\'s charge.', true,
    'The second year\'s base is the book value after year 1, which is lower than the cost.', ['Compare the opening book value of year 2 with that of year 1.']),
  tf(12, 'dep-slm', 'medium', 'Under the straight line method, the total depreciation over the whole life equals the cost less the scrap value.', true,
    'The yearly charge is (cost - scrap) / life, and it is charged for the whole life.', ['Multiply the yearly charge by the life.']),

  // ---- Recording and sale (treatment) ----
  mcq(13, 'dep-accounting', 'easy', 'A firm maintains a Provision for Depreciation A/c. The entry for the year\'s depreciation on machinery is:',
    'Depreciation A/c Dr; To Provision for Depreciation A/c',
    [
      ['Depreciation A/c Dr; To Machinery A/c', 'Credited the asset itself; that is the entry when no provision account is kept.'],
      ['Provision for Depreciation A/c Dr; To Depreciation A/c', 'Reversed the entry: the expense is debited and the provision is credited.'],
      ['Machinery A/c Dr; To Provision for Depreciation A/c', 'Debited the asset; depreciation lowers the asset, it does not add to it.'],
    ],
    'The expense is debited and the provision (a contra asset account) is credited; the machinery account is not touched.', ['Which account gets the credit when the asset is left at cost?']),
  mcq(14, 'dep-accounting', 'easy', 'When depreciation is charged directly to the asset account, which account is credited?',
    'The asset account (for example Machinery A/c)',
    [
      ['Depreciation A/c', 'Credited the expense; an expense is debited.'],
      ['Provision for Depreciation A/c', 'Used the provision method; here there is no provision account.'],
      ['Bank A/c', 'Treated depreciation as a payment; no money leaves the business.'],
    ],
    'Depreciation A/c is debited and the asset is credited with the same amount, so it is shown at the reduced value.', ['Only two accounts are involved.']),
  mcq(15, 'dep-accounting', 'medium', 'A machine costing ₹5,00,000 has a Provision for Depreciation of ₹1,50,000. How is it shown in the balance sheet?',
    'Machinery ₹5,00,000 less Provision for Depreciation ₹1,50,000 = ₹3,50,000',
    [
      ['Machinery ₹5,00,000 only', 'Left out the provision, which has to be deducted from the cost.'],
      ['Machinery ₹5,00,000 plus Provision ₹1,50,000 = ₹6,50,000', 'Added the provision to the asset instead of deducting it.'],
      ['Machinery ₹1,50,000 only', 'Showed the provision as the value of the machine.'],
    ],
    'The provision is a contra account: the machine is shown at cost less the provision.', ['The provision account reduces the value of the asset.']),
  tf(16, 'dep-accounting', 'easy', 'When a Provision for Depreciation A/c is kept, the asset account continues to show the original cost.', true,
    'Depreciation is credited to the provision account, so the asset account is left untouched at cost.', ['Is the asset account credited in this method?']),
  mcq(17, 'dep-sale', 'easy', 'When does a profit arise on the sale of an asset?',
    'When the selling price is more than its book value',
    [
      ['When the selling price is less than its book value', 'Reversed profit and loss.'],
      ['When the selling price is more than its original cost only', 'Compared with the original cost; the comparison is with the book value.'],
      ['When depreciation has been charged on it', 'Thought charging depreciation always produces a profit.'],
    ],
    'Profit = selling price - book value, when this is positive.', ['Book value is what the asset stands at in the books on the date of sale.']),
  tf(18, 'dep-sale', 'medium', 'If an asset is sold for less than its original cost, there is always a loss on sale.', false,
    'The comparison is with the book value. An asset sold below cost but above its book value gives a profit.', ['Which figure should the price be compared with?']),
  mcq(19, 'dep-sale', 'medium', 'A loss on sale of an asset is shown in the books as:',
    'An expense: Loss on Sale of Asset A/c is debited and then charged to the profit and loss account',
    [
      ['An income credited to the profit and loss account', 'Treated a loss as a gain.'],
      ['A reduction of the sale proceeds in the bank account', 'Thought the loss changes the cash received; the cash received is the selling price.'],
      ['An addition to the cost of the new asset', 'Thought the loss can be carried into another asset; it is an expense of the year.'],
    ],
    'A loss is an expense, so Loss on Sale of Asset A/c is debited.', ['Losses are debited and gains are credited.']),
  mcq(20, 'dep-sale', 'complex', 'A firm uses an Asset Disposal A/c. How is the provision for depreciation on the asset sold dealt with?',
    'Provision for Depreciation A/c Dr; To Asset Disposal A/c',
    [
      ['Asset Disposal A/c Dr; To Provision for Depreciation A/c', 'Reversed the entry: the provision is no longer needed, so it is debited.'],
      ['Depreciation A/c Dr; To Asset Disposal A/c', 'Charged more depreciation to profit and loss; the depreciation was already charged earlier.'],
      ['Provision for Depreciation A/c Dr; To Machinery A/c', 'Credited the asset, but the asset has already been transferred to Asset Disposal A/c at cost.'],
    ],
    'The provision on the asset sold is released: it is debited, and Asset Disposal A/c is credited with it.', ['Is the provision still needed once the asset is sold?']),

  // ---- Typed amounts ----
  num(21, 'dep-slm', 'easy', 'A machine costs ₹1,20,000. Its scrap value is ₹20,000 and its life is 5 years. What is the annual depreciation by the straight line method?', 20000,
    [[24000, 'Divided the whole cost by the life and forgot to deduct the scrap value.'], [100000, 'Found the depreciable amount but did not divide by the life.']],
    ['(Cost - Scrap value) / Life = (₹1,20,000 - ₹20,000) / 5 = ₹20,000.'], ['Deduct the scrap value first, then divide by the life.']),
  num(22, 'dep-wdv', 'easy', 'A machine costing ₹2,00,000 is bought on 1 April, the first day of the accounting year, and depreciated at 10% a year on the written down value. What is its book value at the end of the second year?', 162000,
    [[160000, 'Charged 10% of the original cost in both years, which is the straight line method.'], [180000, 'Stopped after the first year.']],
    ['Year 1: 10% of ₹2,00,000 = ₹20,000; book value ₹1,80,000.', 'Year 2: 10% of ₹1,80,000 = ₹18,000; book value ₹1,62,000.'], ['Apply the rate to each year\'s opening book value.']),
  num(23, 'dep-part-year', 'medium', 'On 1 October a firm buys a machine for ₹1,20,000. The accounting year ends on 31 March and depreciation of 10% a year on cost is charged for the period of use by the straight line method. What is the depreciation for the first year?', 6000,
    [[12000, 'Charged a full year although the machine was used for six months.'], [7000, 'Counted seven months instead of six: October, November, December, January, February and March are the months of use.'], [5000, 'Counted five months and left out October, the month of purchase.']],
    ['Full-year depreciation = 10% of ₹1,20,000 = ₹12,000.', 'Months of use, 1 October to 31 March = 6, so ₹12,000 x 6/12 = ₹6,000.'], ['Count the whole months from the purchase date to the year end.']),
  num(24, 'dep-sale', 'medium', 'A machine that cost ₹1,50,000 stands in the books at ₹80,000 after depreciation. It is sold for ₹72,500. What is the loss on sale?', 7500,
    [[77500, 'Compared the selling price with the original cost instead of the book value.'], [70000, 'Gave the depreciation charged so far (cost less book value) instead of the loss.']],
    ['The original cost is not needed: the comparison is with the book value.', 'Loss = Book value - Selling price = ₹80,000 - ₹72,500 = ₹7,500.'], ['Compare the price with the book value.']),
  num(25, 'dep-sale', 'complex', 'A machine costing ₹2,00,000 was bought on 1 April 2021 and depreciated at 10% a year on cost by the straight line method. The accounting year ends on 31 March. The machine was sold for ₹1,50,000 on 31 March 2024. Find the profit on sale.', 10000,
    [[50000, 'Compared the price with the original cost: ₹2,00,000 - ₹1,50,000 = ₹50,000.'], [60000, 'Gave the total depreciation charged instead of the profit.']],
    ['1 April 2021 to 31 March 2024 is 3 full years.', 'Depreciation for 3 years = 3 x 10% of ₹2,00,000 = ₹60,000.', 'Book value = ₹2,00,000 - ₹60,000 = ₹1,40,000.', 'Profit = Selling price - Book value = ₹1,50,000 - ₹1,40,000 = ₹10,000.'],
    ['Find the book value first.']),

  // ---- Entries ----
  jr(26, 'dep-accounting', 'easy', 'Depreciation of ₹12,000 is to be charged on machinery for the year. A Provision for Depreciation A/c is maintained. Pass the journal entry.',
    [['depreciation', 'Dr', 12000], ['provisionForDepreciation', 'Cr', 12000]], ['machinery'],
    'Depreciation (an expense) is debited; the provision account is credited and the machinery account is left at cost.', ['The asset is left at cost.']),
  jr(27, 'dep-sale', 'medium', 'Machinery standing in the books at ₹40,000 after depreciation is sold for ₹35,000 in cash. Pass the journal entry for the sale.',
    [['cash', 'Dr', 35000], ['lossOnSaleOfAsset', 'Dr', 5000], ['machinery', 'Cr', 40000]], ['assetDisposal', 'profitOnSaleOfAsset'],
    'The machine leaves at its book value ₹40,000 (credit). Cash ₹35,000 comes in (debit) and the shortfall of ₹5,000 is a loss (debit).', ['Book value is above the price: loss or profit?']),
  mcq(28, 'dep-part-year', 'medium', 'The accounting year ends on 31 March. A machine is bought on 1 November. Depreciation for the first year is charged for:',
    '5 months, so 5/12 of the annual depreciation',
    [
      ['12 months, a full year', 'Charged a full year although the machine was owned for part of it.'],
      ['4 months, so 4/12 of the annual depreciation', 'Left out the month of purchase.'],
      ['7 months, so 7/12 of the annual depreciation', 'Counted the months before the purchase instead of the months after it.'],
    ],
    'From 1 November to 31 March is November, December, January, February and March: 5 months.', ['Count the months from the purchase date up to the year end.']),
  mcq(29, 'dep-compare', 'medium', 'The same rate of 20% is used under both methods for a machine bought on 1 April, the first day of the accounting year. How do the charges for the first year compare?',
    'They are equal',
    [
      ['The written down value charge is higher', 'Thought the reducing balance method front-loads the charge from the very first year.'],
      ['The straight line charge is higher', 'Thought a charge on cost must be bigger than one on the balance; in year one the base is the same.'],
      ['They cannot be compared without the scrap value', 'Brought in the scrap value; with a rate on cost it does not matter.'],
    ],
    'In the first year the book value equals the cost, so 20% of either is the same.', ['What is the book value at the start of year 1?']),
  // dep-q-030 asked what dep-q-037 asks (the written down value never reaches nil); it now asks the other side of it,
  // keeping its id, type and difficulty so that no paper but those that set it moves.
  tf(30, 'dep-compare', 'medium', 'Under the straight line method an asset can be written down to exactly its scrap value by the end of its useful life.', true,
    'True. The yearly charge is (cost − scrap value) ÷ life, so after the last year exactly the scrap value is left. Under the written down value method a percentage of a shrinking balance never brings it to an exact figure.', ['What does the straight line formula take away from the cost, and over how many years?']),
  mcq(31, 'dep-accounting', 'easy', 'At the end of the year the Depreciation A/c is transferred to:',
    'The debit side of the Profit and Loss A/c',
    [
      ['The credit side of the Profit and Loss A/c', 'Treated depreciation as an income; it is an expense.'],
      ['The Trading Account', 'Treated it as a direct expense; depreciation is shown in the profit and loss account.'],
      ['The Balance Sheet as an asset', 'Treated the charge as an asset; it reduces the profit.'],
    ],
    'Depreciation is an indirect expense and is debited to the Profit and Loss A/c.', ['Is depreciation a gain or an expense?']),
  mcq(32, 'dep-sale', 'complex', 'A machine that cost ₹1,00,000 has a provision of ₹40,000 against it. It is sold for ₹50,000. After the cost, the provision and the sale proceeds are posted, Asset Disposal A/c shows a balance of ₹10,000. What does this represent?',
    'A loss on sale of ₹10,000, debit balance transferred to Loss on Sale of Asset A/c',
    [
      ['A profit on sale of ₹10,000, credit balance', 'The balance is on the debit side: the debit of cost is larger than the credits of provision and price.'],
      ['The depreciation for the year', 'Confused the balance with the depreciation, which is already in the provision.'],
      ['The balance of the provision account', 'Confused the balance of Asset Disposal A/c with the provision.'],
    ],
    'Debit ₹1,00,000 against credits ₹40,000 + ₹50,000 = ₹90,000: the debit balance of ₹10,000 is a loss.', ['Which side is bigger, debit or credit?']),
];

// ---------------------------------------------------------------------------------------------------------------
// Levels
// ---------------------------------------------------------------------------------------------------------------

const levels = buildLadder(T, {
  concept: {
    title: 'Why Assets Are Depreciated',
    description: 'See why the cost of an asset is spread over its years of use, and the two ways of doing it.',
    lesson: [
      {
        type: 'text',
        heading: 'A machine is used up bit by bit',
        body: 'A firm buys a machine for ₹1,00,000 and uses it for five years. If the whole ₹1,00,000 were charged in the year of purchase, that year would look terrible and the next four would look too good. Depreciation spreads the cost over the years in which the machine earns for the business. The causes are wear and tear, a newer machine arriving (obsolescence), the passing of time for a lease or patent, and the exhaustion of a mine. A fall in market price is not a cause.',
      },
      {
        type: 'text',
        heading: 'Two ways to spread the cost',
        body: 'Straight line method: the same amount every year, (cost - scrap value) / life. For ₹1,00,000, no scrap, 5 years: ₹20,000 each year. Written down value method: a fixed percentage of the book value at the start of each year. At 20%, year 1 is ₹20,000 (book value ₹80,000), year 2 is ₹16,000 (book value ₹64,000), and the charge keeps falling. The cost of the asset includes carriage and installation, because they are needed to make it ready for use.',
      },
      {
        type: 'text',
        heading: 'Part of a year',
        body: 'When an asset is bought or sold during the year, depreciation is charged only for the months it is used. If the year ends on 31 March and a machine is bought on 1 October, the first year carries 6 months: half of the yearly amount. Every year after that is a full year.',
      },
      {
        type: 'working',
        title: 'Straight line, a part year and then a full year: Bhatia Printers, Ludhiana',
        lines: [
          'On 1 October 2025 Bhatia Printers buys a paper-cutting machine for ₹4,60,000 and pays ₹40,000 for its carriage and installation. It is expected to last 10 years and then fetch ₹50,000 as scrap. The books close on 31 March.',
          'Cost = ₹4,60,000 + ₹40,000 = ₹5,00,000: carriage and installation make the machine ready for use, so they are part of its cost.',
          'Depreciable cost = cost - scrap value = ₹5,00,000 - ₹50,000 = ₹4,50,000.',
          'Depreciation for a full year = ₹4,50,000 / 10 years = ₹45,000, the same every year.',
          'Year ended 31 March 2026: the machine was used from 1 October to 31 March, 6 months, so ₹45,000 x 6/12 = ₹22,500.',
          'Year ended 31 March 2027: a full year, ₹45,000.',
          'Book value on 31 March 2027 = ₹5,00,000 - ₹22,500 - ₹45,000 = ₹4,32,500.',
        ],
        note: 'Watch out: count the months from the date of purchase to the year end (October to March is 6 months, not 7), and take the scrap value off the cost before dividing by the life.',
      },
      {
        type: 'working',
        title: 'Written down value: bought on 1 July, sold in a later December: Konkan Cold Storage, Ratnagiri',
        lines: [
          'A cooling plant is bought on 1 July 2023 for ₹2,40,000 and depreciated at 20% a year on the written down value. It is sold on 1 December 2025 for ₹1,30,000. The books close on 31 March.',
          'Year ended 31 March 2024: July to March is 9 months: ₹2,40,000 x 20% x 9/12 = ₹36,000. Book value ₹2,40,000 - ₹36,000 = ₹2,04,000.',
          'Year ended 31 March 2025: a full year on the new book value: ₹2,04,000 x 20% = ₹40,800. Book value ₹1,63,200.',
          'Year of sale: April to November is 8 months: ₹1,63,200 x 20% x 8/12 = ₹21,760. Book value on 1 December 2025 = ₹1,63,200 - ₹21,760 = ₹1,41,440.',
          'The price, ₹1,30,000, is less than the book value: loss on sale = ₹1,41,440 - ₹1,30,000 = ₹11,440.',
        ],
        note: 'Watch out: each year the rate is applied to the book value at the start of that year, not to the cost; in the year of sale depreciation runs only up to the date of sale; and the price is compared with the book value, never with the cost.',
      },
      {
        type: 'table',
        title: 'Asset Disposal A/c, step by step: Sahyadri Dairy sells a milk chiller that cost ₹3,00,000, with ₹1,14,000 provided on it, for ₹1,70,000 by cheque',
        rows: [
          { label: 'Debit side' },
          { label: 'To Machinery A/c: the cost of the chiller, taken out of Machinery A/c', amount: '₹3,00,000' },
          { label: 'Credit side' },
          { label: 'By Provision for Depreciation A/c: all the depreciation provided on it', amount: '₹1,14,000' },
          { label: 'By Bank A/c: the price received', amount: '₹1,70,000' },
          { label: 'By Loss on Sale of Asset A/c: the debit side is ₹16,000 larger, so a loss closes the account', amount: '₹16,000' },
          { label: 'Each side totals', amount: '₹3,00,000', total: true },
        ],
        note: 'Check: book value = ₹3,00,000 - ₹1,14,000 = ₹1,86,000; sold for ₹1,70,000, a loss of ₹16,000. Watch out: transfer all the depreciation provided on the asset sold, including the charge up to the date of sale, and not only the charge of this year.',
      },
      {
        type: 'example',
        title: 'Kaveri Tiles sells a tile press standing at ₹40,000 (no provision account) for ₹34,000 by cheque',
        lines: [
          { accountId: 'bank', side: 'Dr', amount: 3400000 },
          { accountId: 'lossOnSaleOfAsset', side: 'Dr', amount: 600000 },
          { accountId: 'machinery', side: 'Cr', amount: 4000000 },
        ],
        note: 'The press leaves the books at its book value, ₹40,000 (credit Machinery). The bank receives ₹34,000 (debit). The shortfall of ₹6,000 is a loss (debit). Watch out: credit the asset with its book value, not with the price.',
      },
      {
        type: 'example',
        title: 'Depreciation of ₹20,000 charged to a Provision for Depreciation account',
        lines: [
          { accountId: 'depreciation', side: 'Dr', amount: 2000000 },
          { accountId: 'provisionForDepreciation', side: 'Cr', amount: 2000000 },
        ],
        note: 'Depreciation is an expense, so it is debited. The machine stays at its cost; the provision account collects the depreciation and is deducted from the machine in the balance sheet.',
      },
      { type: 'check', questionId: qid(1) },
      { type: 'check', questionId: qid(23) },
    ],
  },
  cards: {
    title: 'Depreciation Rules and Formulas',
    description: 'Recall the formulas, the entries and the rules for part years and sales.',
    cardIds: cards.map((c) => c.id),
  },
  recognition: [
    {
      title: 'Meaning, Causes and the Two Methods',
      description: 'Recognise what depreciation is, what causes it and how the two methods differ.',
      questionIds: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map(qid),
    },
    {
      title: 'Recording Depreciation and Selling Assets',
      description: 'Choose the right entry and the right comparison for provision accounts and sales.',
      questionIds: [13, 14, 15, 16, 17, 18, 19, 20, 28, 29, 30, 31, 32].map(qid),
    },
  ],
  practice: [
    {
      title: 'Straight Line Basics',
      description: 'Yearly depreciation, rate, book value and the cost of an asset.',
      templateIds: ['dep-slm-annual', 'dep-slm-rate-amount', 'dep-slm-book-value', 'dep-slm-rate', 'dep-cost-capitalised', 'dep-cost-items'],
      count: 8,
    },
    {
      title: 'Written Down Value and First Entries',
      description: 'The reducing balance method, causes of depreciation and simple entries.',
      templateIds: ['dep-wdv-first-year', 'dep-wdv-rate', 'dep-method-name', 'dep-cause', 'dep-purpose', 'dep-journal-asset', 'dep-journal-provision'],
      count: 8,
    },
    {
      title: 'Part of a Year (Guided)',
      description: 'Count the months of use, then charge that share of the yearly depreciation.',
      templateIds: ['dep-months-used', 'dep-slm-part-year'],
      count: 6,
      guided: true,
    },
    {
      title: 'Written Down Value and Part Years',
      description: 'Later years under written down value, and the first year when the asset is bought mid-year.',
      templateIds: ['dep-wdv-part-year', 'dep-part-year-next', 'dep-wdv-year-n', 'dep-wdv-book-value', 'dep-wdv-rate-two-years', 'dep-cost-then-dep', 'dep-journal-asset-cost'],
      count: 8,
    },
    {
      title: 'Provision Accounts, Sales and Comparing Methods',
      description: 'Provision for Depreciation, profit or loss on sale, and straight line against written down value.',
      templateIds: [
        'dep-total-dep', 'dep-sale-result', 'dep-sale-amount', 'dep-journal-sale', 'dep-provision-balance', 'dep-provision-treatment',
        'dep-compare-diff', 'dep-compare-statement', 'dep-method-choice', 'dep-disposal-step',
      ],
      count: 8,
    },
    {
      title: 'Complex Depreciation Problems',
      description: 'Part-year sales, two machines, shares of a provision and Asset Disposal entries.',
      templateIds: [
        'dep-sale-part-slm', 'dep-sale-part-wdv', 'dep-two-assets', 'dep-two-machines-wdv', 'dep-provision-sold-share',
        'dep-sale-removal-cost', 'dep-disposal-result', 'dep-journal-sale-compound', 'dep-compare-bv',
      ],
      count: 8,
    },
  ],
  mixed: { title: 'Mixed Depreciation Practice', description: 'Everything in this topic, shuffled the way an exam serves it.', count: 12 },
  challenge: { title: 'Challenge: Depreciation Mastery', description: 'The hardest questions in the topic, against the clock.', count: 8 },
  // "Journalise the following transactions": the entries of one asset's life, in date order. These levels come after
  // every other one and have ids of their own, so the ids of the levels above never move.
  sets: [
    {
      title: 'Journalise the Life of an Asset',
      description: 'One asset, three to five dated entries: its purchase with the costs of making it ready, the charge of each year worked out by you, and the transfer to Profit and Loss A/c.',
      templateIds: ['dep-set-slm-life', 'dep-set-wdv-part-year', 'dep-set-sale-part-year'],
      count: 4,
    },
    {
      title: 'Journalise the Sale of an Asset',
      description: 'From the purchase to the sale: depreciation up to the day of sale, then the sale in one entry, or step by step through Asset Disposal A/c when a provision is kept.',
      templateIds: ['dep-set-sale-part-year', 'dep-set-provision-disposal', 'dep-set-machines-sale'],
      count: 4,
    },
  ],
  // Accounts the student prepares over two or three years, balanced on each 31 March and brought down on each 1 April.
  // Each level serves four accounts; the first draws on the easy one, the straight-line account of two full years.
  formats: [
    {
      title: 'Prepare Machinery A/c over the Years',
      description: 'Machinery A/c with depreciation written off the asset, balanced and brought down year after year: two full years under the straight line method, two or three under written down value with a part year at purchase, and a second machine bought during the period.',
      templateIds: ['dep-fmt-slm-year', 'dep-fmt-wdv-part-year', 'dep-fmt-second-machine'],
      count: 4,
    },
    {
      title: 'Prepare the Accounts of a Provision and a Sale',
      description: 'Provision for Depreciation A/c for three years with the machinery kept at cost, Machinery A/c from the purchase to the year in which a machine is sold, Asset Disposal A/c, and the long board question: Machinery A/c or Provision for Depreciation A/c over three years with two or three machines, one of them sold during the third year.',
      templateIds: ['dep-fmt-provision', 'dep-fmt-sale', 'dep-fmt-disposal', 'dep-fmt-machines-sale', 'dep-fmt-provision-sale'],
      count: 4,
    },
  ],
});

// ---------------------------------------------------------------------------------------------------------------
// The theory the CBSE 2025-26 syllabus names (features, factors, depletion and amortisation, the advantages of the
// two methods and the difference between them), added after the check against it: a level of its own after every
// other level, with an id of its own, so no level a learner has passed moves.
// ---------------------------------------------------------------------------------------------------------------

const THEORY_HINTS = ['Is it about the asset, the cost, or the way the cost is spread?', 'Cost, useful life and scrap value decide the amount; the method decides the pattern.'];

const theoryQuestions: Question[] = [
  mcq(33, 'dep-meaning', 'easy', 'The writing off of the cost of a patent over its legal life is called:', 'Amortisation', [
    ['Depletion', 'Depletion is for natural resources such as mines and quarries.'],
    ['Depreciation', 'Depreciation is the word for tangible fixed assets; a patent is intangible.'],
    ['Appreciation', 'Appreciation is a rise in value, the opposite of a write-off.'],
  ], 'A patent is an intangible asset; spreading its cost over its life is amortisation.', THEORY_HINTS),
  mcq(34, 'dep-meaning', 'easy', 'Depletion is charged on:', 'Natural resources, such as a mine or a quarry, as they are extracted', [
    ['Intangible assets, such as goodwill bought', 'Intangible assets are amortised.'],
    ['Machinery and furniture', 'Tangible fixed assets are depreciated.'],
    ['Stock of goods held for sale', 'Stock is not a fixed asset and is not depleted.'],
  ], 'Depletion follows the quantity taken out of a wasting natural resource.', THEORY_HINTS),
  tf(35, 'dep-meaning', 'easy', 'True or false: depreciation is a non-cash expense.', true,
    'Nothing is paid when depreciation is charged; the cash went out when the asset was bought.', THEORY_HINTS),
  tf(36, 'dep-meaning', 'medium', 'True or false: the depreciable cost of an asset is its cost plus its estimated scrap value.', false,
    'Depreciable cost = cost less estimated scrap value: the part of the cost that is used up over the life.', THEORY_HINTS),
  tf(37, 'dep-compare', 'medium', 'True or false: under the written down value method the book value of an asset never becomes nil.', true,
    'A fixed percentage of the balance is written off each year, so something always remains.', THEORY_HINTS),
  ar(38, 'dep-meaning', 'medium', 'Depreciation is charged even in a year of loss.', 'Depreciation is a charge against profit, not an appropriation of profit.', 0, [
    'Missed the link: R is exactly why A holds, since a charge against profit is made whether or not there is a profit.',
    'Took R for false. Depreciation is a cost of earning revenue, charged before the profit is found.',
    'Took A for false. A loss does not stop depreciation from being charged.',
  ], 'A is true: depreciation is charged in every year the asset is used. R is true: it is a cost of earning revenue, like rent. R explains A: a charge against profit is made whether there is a profit or a loss, unlike a reserve, which is made only out of profit.'),
  ar(39, 'dep-compare', 'medium', 'The straight line method suits a lease better than the written down value method.', 'The straight line method charges the same amount every year.', 0, [
    'Missed the link: a lease gives the same benefit each year, which is why a fixed charge (R) suits it.',
    'Took R for false. Under the straight line method the charge is (cost - scrap value) / life, the same every year.',
    'Took A for false. A lease is used evenly over its period, so an even charge matches it.',
  ], 'A is true: a lease gives the same benefit in every year of its period. R is true: the straight line charge does not change. R explains A: an even benefit is matched by an even charge.'),
  ar(40, 'dep-compare', 'medium', 'The written down value method is preferred for machinery.', 'Under the written down value method the same amount of depreciation is charged every year.', 2, [
    'R is false: a fixed charge every year is the straight line method; under written down value the charge falls each year.',
    'R is false, so the two cannot both be true.',
    'Took A for false. The falling charge suits machinery, whose repairs rise as it ages.',
  ], 'A is true: a falling charge, with rising repairs, keeps the yearly cost of a machine fairly even. R is false: the written down value charge falls each year, as the rate is applied to a smaller balance; the same charge every year is the straight line method. So R cannot explain A.'),
  mcq(41, 'dep-meaning', 'medium', 'A printing press bought for ₹4,00,000 is thought likely to become out of date in 5 years, though it could run for 10. Over how many years should its depreciable cost be spread?', '5 years, its useful life to the business', [
    ['10 years, the physical life of the press', 'Useful life is how long the asset will serve the business; obsolescence can cut it short.'],
    ['1 year, because it will be out of date', 'It will serve for 5 years, so its cost is spread over them.'],
    ['It is not depreciated until it is out of date', 'Depreciation is spread over the useful life from the start.'],
  ], 'Obsolescence is a cause of depreciation and shortens the useful life, which is what the cost is spread over.', THEORY_HINTS),
  mcq(42, 'dep-compare', 'complex', 'Lata Printers wants a method of depreciation for a new press that needs few repairs at first and many later, and also wants a method the income tax law accepts. Which method fits, and why?', 'Written down value: the falling charge balances the rising repairs, and the tax law accepts it', [
    ['Straight line: the charge is the same every year', 'A fixed charge plus rising repairs makes the later years heavier, the opposite of what is wanted.'],
    ['Written down value: it writes the press down to nil', 'The method never reaches nil; the reasons that fit are the even total with repairs and the tax law.'],
    ['Straight line: it is the method the income tax law accepts', 'It is the written down value method that the income tax law accepts.'],
  ], 'Written down value gives a heavier charge when repairs are light and a lighter one when they are heavy, and it is the method of the income tax law.', THEORY_HINTS),
];

const pack: TopicPack = {
  topicId: T,
  concepts,
  cards,
  levels: [
    ...levels,
    ...laterLevels(T, levels, [
      {
        name: 'theory',
        type: 'method_recognition',
        title: 'Features, Factors and the Two Methods',
        description: 'What depreciation is and is not, the factors that decide it, depletion and amortisation, and the advantages and differences of the two methods.',
        questionIds: theoryQuestions.map((q) => q.id),
        generate: { templateIds: ['dep-feature', 'dep-factor', 'dep-similar-term', 'dep-method-advantage', 'dep-method-difference', 'dep-similar-terms-together'], count: 8 },
      },
      {
        name: 'odd-dates',
        type: 'medium_practice',
        title: 'Dates Other than the First of a Month',
        description: 'Assets bought or sold on the 15th (half a month of use in that month), depreciation counted by days, and a sale on such a date with its profit or loss.',
        generate: { templateIds: ['dep-odd-date-half-month', 'dep-odd-date-days', 'dep-odd-date-sale'], count: 6 },
      },
      {
        name: 'assertion-reason',
        type: 'medium_practice',
        title: 'Assertion and Reason',
        description: 'Two statements on this topic: decide whether each is true, and whether the Reason explains the Assertion.',
        generate: { templateIds: ['dep-assertion-reason'], count: 8 },
      },
    ]),
  ],
  questions: [...questions, ...theoryQuestions],
};

export default pack;
