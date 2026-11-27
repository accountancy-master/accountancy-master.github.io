import { buildLadder, laterLevels } from '../ladder';
import type { Card, Concept, Difficulty, McqQuestion, NumericQuestion, NumericUnit, Question, TopicPack, TrueFalseQuestion } from '../types';

const T = 'goodwill';

const concepts: Concept[] = [
  { id: 'gw-nature', topicId: T, title: 'Nature of goodwill and the factors that affect it' },
  { id: 'gw-kinds', topicId: T, title: 'Purchased and self-generated goodwill; when and how goodwill is valued' },
  { id: 'gw-average-profit', topicId: T, title: 'Average profit method' },
  { id: 'gw-adjustments', topicId: T, title: 'Adjusting past profits to normal profits' },
  { id: 'gw-weighted', topicId: T, title: 'Weighted average profit method' },
  { id: 'gw-capital-employed', topicId: T, title: 'Capital employed and normal profit' },
  { id: 'gw-super-profit', topicId: T, title: 'Super profit method' },
  { id: 'gw-capitalisation', topicId: T, title: 'Capitalisation methods' },
  { id: 'gw-formats', topicId: T, title: 'Setting out a valuation: the statement of normal profits and the super profit working' },
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
): Card => ({ id: `gw-card-${n}`, topicId: T, conceptId, kind, prompt, answer, explanation, example, commonMistake });

const cards: Card[] = [
  card(1, 'gw-nature', 'rule', 'What is goodwill?',
    'The value of the reputation and other advantages of a business that let it earn more than the normal profit of its trade. It is an intangible asset.',
    'A firm with a good name, loyal customers or a fine location earns more than a new firm with the same capital would. A buyer of the business pays for that extra earning power.',
    'Two sweet shops have the same capital. One, known across the town, earns ₹3,00,000 a year; the other earns the normal ₹2,00,000. The first has goodwill; the second has none.',
    'Calling goodwill a fictitious asset. A fictitious asset has no value; goodwill is realised when the business is sold.'),
  card(2, 'gw-nature', 'rule', 'What are the features of goodwill?',
    'It is intangible but not fictitious; it cannot be sold apart from the business; its value changes from time to time; its valuation is subjective; it helps the firm earn super profits.',
    'Goodwill has no physical form, yet it has a value. That value depends on what the business is expected to earn, which is a matter of judgement.',
    'A partner cannot sell "the goodwill" and keep the shop. When the shop is sold, its goodwill goes with it.',
    'Thinking that goodwill, once valued, keeps the same value for ever.'),
  card(3, 'gw-nature', 'rule', 'Which factors affect the goodwill of a firm?',
    'Nature of the business, location, efficiency of management, market situation (monopoly or little competition) and special advantages (licences, long-term contracts, patents, assured supplies).',
    'Anything that raises the profit a firm can expect in future raises its goodwill; anything that makes those profits smaller or riskier lowers it. A need for more capital to earn the same profit also lowers it.',
    'A chemist next to a large hospital (location) and a firm with the only gas agency in town (market situation) both have high goodwill.',
    'Listing the capital of the firm as a factor that raises goodwill. More capital for the same profit means less profit above the normal.'),
  card(4, 'gw-kinds', 'rule', 'What is the difference between purchased and self-generated goodwill?',
    'Purchased goodwill is paid for when a business is bought: price paid less net assets taken over. Self-generated goodwill grows inside the firm over time. Under AS 26 only purchased goodwill is recorded in the books.',
    'Purchased goodwill has a cost that can be measured reliably, the amount paid. Self-generated goodwill has no such cost, so it is not shown as an asset.',
    'A business with assets of ₹9,00,000 and liabilities of ₹1,00,000 is bought for ₹10,00,000: purchased goodwill = 10,00,000 - 8,00,000 = ₹2,00,000.',
    'Recording the partners\' own estimate of the firm\'s goodwill as an asset.'),
  card(5, 'gw-kinds', 'rule', 'When does a partnership firm need to value its goodwill?',
    'On a change in the profit-sharing ratio, on the admission, retirement or death of a partner, and when the business is sold or amalgamated.',
    'On each of these occasions someone gains a share of the future profits and someone gives it up. The one who gives up has to be compensated, and goodwill measures that.',
    'When a partner retires, the remaining partners will enjoy the whole of the future profits, so the retiring partner is paid a share of the goodwill.',
    'Thinking goodwill is valued and recorded at the end of every accounting year.'),
  card(6, 'gw-kinds', 'format', 'What are the methods of valuing goodwill in the syllabus?',
    '1) Average profit (simple or weighted): average profit x years\' purchase. 2) Super profit: super profit x years\' purchase. 3) Capitalisation: of average profit, or of super profit.',
    'The years\' purchase methods multiply a profit by an agreed number of years. The capitalisation methods divide a profit by the normal rate of return.',
    'Average profit ₹1,00,000 at 2 years\' purchase gives ₹2,00,000. Super profit ₹20,000 capitalised at 10% gives ₹2,00,000.',
    'Multiplying by years in a capitalisation method, or dividing by the rate in a years\' purchase method.'),
  card(7, 'gw-average-profit', 'formula', 'How is goodwill found by the average profit method?',
    'Average profit = total of the normal profits / number of years (a loss is deducted). Goodwill = average profit x number of years\' purchase.',
    'The number of years\' purchase is agreed by the partners. It says for how many years the firm is expected to go on earning this profit because of its past effort.',
    'Profits ₹80,000, ₹1,00,000 and ₹1,20,000: total ₹3,00,000, average ₹1,00,000. At 2 years\' purchase, goodwill = ₹2,00,000.',
    'Multiplying by the number of years averaged (3) instead of the number of years\' purchase (2), or adding a loss instead of deducting it.'),
  card(8, 'gw-adjustments', 'rule', 'How are past profits turned into normal profits?',
    'Add back abnormal losses (fire, theft, flood). Take out abnormal gains (profit on sale of a fixed asset, a one-time receipt). Charge expenses that were omitted and bring in incomes that were omitted. Where the profits were arrived at before charging anything for the partners\' work, deduct a fair remuneration for it from the average; where an actual salary was charged that differs from a fair one, adjust only the difference.',
    'Goodwill is about the profit the business can keep earning. Anything that will not recur is removed, and anything that should have been in the profit is put in.',
    'Profit ₹1,00,000 after a loss by fire of ₹20,000 and including ₹15,000 profit on sale of land: normal profit = 1,00,000 + 20,000 - 15,000 = ₹1,05,000.',
    'Deducting an abnormal loss again, or leaving an abnormal gain in the profit.'),
  card(9, 'gw-adjustments', 'rule', 'What happens when closing stock was wrongly valued in a past year?',
    'Closing stock overvalued: that year\'s profit is overstated (deduct) and the next year\'s is understated by the same amount (add). Undervalued: the reverse.',
    'Closing stock is a credit in the Trading Account, and it becomes the opening stock, a debit, of the next year. So one error moves two years in opposite directions.',
    'Closing stock of 2023-24 overvalued by ₹10,000: profit of 2023-24 less ₹10,000; profit of 2024-25 plus ₹10,000.',
    'Correcting only the year of the error and forgetting the next year.'),
  card(10, 'gw-adjustments', 'rule', 'How is a capital or revenue item that was wrongly treated corrected?',
    'Revenue expense wrongly added to an asset: deduct the expense and add back the depreciation charged on it. Capital expenditure wrongly charged as an expense: add it back and deduct the depreciation now due on it.',
    'The wrong treatment changes the profit twice: through the expense itself and through depreciation.',
    'Repairs ₹50,000 debited to Machinery A/c and depreciated at 10%: correct profit = profit - 50,000 + 5,000.',
    'Adjusting the expense and forgetting the depreciation.'),
  card(11, 'gw-weighted', 'formula', 'How is the weighted average profit found, and when is it used?',
    'Multiply each year\'s profit by its weight, add the products and divide by the total of the weights. The latest year gets the highest weight. It is used when profits show a clear rising or falling trend.',
    'The latest years say more about the future than the earliest ones, so they count for more.',
    'Profits ₹60,000, ₹90,000 and ₹1,20,000 with weights 1, 2, 3: (60,000 + 1,80,000 + 3,60,000) / 6 = ₹1,00,000.',
    'Dividing the total of the products by the number of years (3) instead of the total of the weights (6).'),
  card(12, 'gw-capital-employed', 'formula', 'How is capital employed found?',
    'Assets side: all assets except goodwill, fictitious assets and non-trade investments, less outside liabilities. Liabilities side: partners\' capitals + reserves and undistributed profits, less goodwill, fictitious assets and non-trade investments.',
    'Capital employed is the money at work in the business itself. Goodwill is what is being valued, fictitious assets have no value, and non-trade investments earn outside the business.',
    'Assets ₹12,00,000 including goodwill ₹1,00,000 and non-trade investments ₹1,50,000; outside liabilities ₹2,50,000: capital employed = 12,00,000 - 1,00,000 - 1,50,000 - 2,50,000 = ₹7,00,000.',
    'Leaving goodwill or a debit balance of Profit and Loss A/c among the assets, or forgetting to deduct the outside liabilities.'),
  card(13, 'gw-capital-employed', 'formula', 'What is normal profit?',
    'Normal profit = capital employed x normal rate of return / 100. It is what a similar firm in the same trade would earn on the same capital.',
    'The normal rate of return is the rate that investors expect in that line of business, given its risk.',
    'Capital employed ₹8,00,000 and a normal rate of 10%: normal profit = ₹80,000.',
    'Taking the rate on the average profit, or on total assets without deducting outside liabilities.'),
  card(14, 'gw-super-profit', 'formula', 'How is goodwill found by the super profit method?',
    'Super profit = average profit - normal profit. Goodwill = super profit x number of years\' purchase.',
    'Only the profit above the normal is due to goodwill. A firm that earns just the normal profit has no super profit and so no goodwill by this method.',
    'Average profit ₹1,00,000, capital employed ₹8,00,000, normal rate 10%: normal profit ₹80,000, super profit ₹20,000. At 3 years\' purchase, goodwill = ₹60,000.',
    'Multiplying the whole average profit by the years\' purchase.'),
  card(15, 'gw-capitalisation', 'formula', 'How is goodwill found by capitalisation of average profit?',
    'Capitalised value of average profit = average profit x 100 / normal rate of return. Goodwill = capitalised value - capital employed (net assets).',
    'The capitalised value is the capital that would be needed to earn the firm\'s profit at the normal rate. If the firm earns it with less capital, the difference is goodwill.',
    'Average profit ₹1,00,000 at 10%: capitalised value ₹10,00,000. Capital employed ₹8,00,000: goodwill = ₹2,00,000.',
    'Giving the capitalised value itself as the goodwill.'),
  card(16, 'gw-capitalisation', 'formula', 'How is goodwill found by capitalisation of super profit?',
    'Goodwill = super profit x 100 / normal rate of return.',
    'It is the capital that would earn the super profit at the normal rate. Worked on the same average profit, capital employed and rate, it always equals goodwill by capitalisation of average profit.',
    'Super profit ₹20,000 at 10%: goodwill = 20,000 x 100 / 10 = ₹2,00,000, the same as ₹10,00,000 - ₹8,00,000.',
    'Taking 10% of the super profit (₹2,000) instead of dividing by the rate.'),
  card(17, 'gw-super-profit', 'shortcut', 'How is a missing term found when the goodwill is given?',
    'Work backwards. Goodwill / years\' purchase = the profit that was multiplied (average or super). Average profit = normal profit + super profit. Capital employed = normal profit x 100 / normal rate. Normal rate = normal profit / capital employed x 100.',
    'Every formula of this topic can be turned round: write it down, put in what is known and solve for the one term that is missing.',
    'Goodwill ₹60,000 at 3 years\' purchase of super profit: super profit ₹20,000. With average profit ₹1,00,000, normal profit is ₹80,000; at 10% the capital employed is ₹8,00,000.',
    'Dividing the goodwill by the average profit when the method used was super profit.'),
];

// ---------------------------------------------------------------------------------------------------------------
// Authored questions
// ---------------------------------------------------------------------------------------------------------------

const qid = (n: number): string => `gw-q-${String(n).padStart(3, '0')}`;

/**
 * The place of an Assertion-Reason option in the board's fixed order: (a) both true and R explains A, (b) both true
 * and R does not explain A, (c) A true and R false, (d) A false and R true. -1 for any other option.
 */
const arPlace = (text: string): number =>
  text.startsWith('Both A and R are true') ? (text.includes(' not ') ? 1 : 0) : text.startsWith('A is true') ? 2 : text.startsWith('A is false') ? 3 : -1;

/**
 * An mcq: the right option is put at a position that depends on n, so the answers are spread over a, b, c and d. The
 * options of an Assertion-Reason question stand in the board's order instead, whichever is right.
 */
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
  if (all.length === 4 && all.every((o) => arPlace(o.text) >= 0)) all.sort((x, y) => arPlace(x.text) - arPlace(y.text));
  const options = all.map((o, i) => ({ id: 'abcdefgh'[i], text: o.text, ...(o.why === undefined ? {} : { why: o.why }) }));
  return {
    id: qid(n), topicId: T, conceptId, difficulty, type: 'mcq', prompt, options,
    correct: options.find((o) => o.text === correct)!.id, hints, explanation,
  };
}

const tf = (n: number, conceptId: string, difficulty: Difficulty, prompt: string, correct: boolean, explanation: string, hints: string[]): TrueFalseQuestion => ({
  id: qid(n), topicId: T, conceptId, difficulty, type: 'true_false', prompt, correct, hints, explanation,
});

/** A typed answer. Rupee figures are given in rupees; a percentage or a number of years in hundredths (250 is 2.5). */
const num = (
  n: number,
  conceptId: string,
  difficulty: Difficulty,
  unit: NumericUnit,
  prompt: string,
  answer: number,
  errors: [number, string][],
  working: string[],
  hints: string[],
): NumericQuestion => {
  const scale = unit === 'rupees' ? 100 : 1;
  return {
    id: qid(n), topicId: T, conceptId, difficulty, type: 'numeric', unit, prompt, answer: answer * scale,
    commonErrors: errors.map(([value, why]) => ({ value: value * scale, why })), working, hints, explanation: working.join(' '),
  };
};

const AR = {
  both: 'Both A and R are true, and R is the correct explanation of A',
  bothNot: 'Both A and R are true, but R is not the correct explanation of A',
  aOnly: 'A is true but R is false',
  rOnly: 'A is false but R is true',
};

const questions: Question[] = [
  // ---- Nature, factors, kinds of goodwill (recognition) ----
  mcq(1, 'gw-nature', 'easy', 'Goodwill is:',
    'an intangible asset',
    [
      ['a fictitious asset', 'Took an asset that cannot be seen for one that has no value; goodwill can be sold with the business.'],
      ['a current asset', 'Goodwill is not held to be turned into cash within a year.'],
      ['a tangible fixed asset', 'Goodwill has no physical form.'],
    ],
    'Goodwill cannot be seen or touched, but it has a value: it is an intangible asset.',
    ['Can it be seen? Does it have a value?', 'An asset without physical form but with value is intangible.']),
  tf(2, 'gw-nature', 'easy', 'Goodwill is a fictitious asset, because it cannot be seen or touched.', false,
    'Goodwill is intangible, not fictitious. A fictitious asset has no realisable value, while goodwill is paid for when a business is sold.',
    ['What does a buyer of a business pay extra for?', 'Intangible means without physical form; fictitious means without value.']),
  mcq(3, 'gw-nature', 'easy', 'Which of these statements about goodwill is NOT true?',
    'It can be sold separately from the business',
    [
      ['It helps a firm earn more than the normal profit', 'This is true: that extra earning power is what goodwill is.'],
      ['Its value may change from time to time', 'This is true: goodwill rises and falls with the prospects of the firm.'],
      ['Its valuation depends on the judgement of the valuer', 'This is true: the method and the years of purchase are matters of judgement.'],
    ],
    'Goodwill is attached to the business as a whole. It passes to a buyer only when the business itself is sold.',
    ['Three of the statements are features of goodwill.', 'Can a firm sell its reputation and keep its shop?']),
  mcq(4, 'gw-nature', 'easy', 'A garment shop stands at the busiest crossing of the main market and draws customers all day. Which factor affecting goodwill is at work?',
    'Location of the business',
    [
      ['Efficiency of management', 'Nothing is said about how well the shop is run.'],
      ['Special advantages', 'No licence, contract or assured supply is mentioned.'],
      ['Market situation', 'The shop is not said to be without competitors; its advantage is the place.'],
    ],
    'A place that many customers pass brings more sales and so more goodwill.',
    ['What gives this shop its edge?', 'Factors: nature of business, location, management, market situation, special advantages.']),
  tf(5, 'gw-nature', 'easy', 'Other things being equal, a firm that has a monopoly in its market is likely to have more goodwill than a firm that faces many competitors.', true,
    'A firm without rivals can keep its customers and its prices, so it earns more above the normal profit. Market situation is a factor affecting goodwill.',
    ['Which firm can expect higher profits in future?', 'Less competition means higher goodwill.']),
  mcq(6, 'gw-kinds', 'easy', 'According to AS 26, which goodwill is recorded in the books of account?',
    'Only goodwill for which a price has been paid (purchased goodwill)',
    [
      ['Only goodwill built up by the firm itself (self-generated goodwill)', 'Reversed the rule: self-generated goodwill has no cost that can be measured reliably and is not recorded.'],
      ['Both purchased and self-generated goodwill', 'Self-generated goodwill is not recorded; only purchased goodwill is.'],
      ['Neither kind of goodwill', 'Purchased goodwill has a cost, the amount paid, and it is recorded.'],
    ],
    'Goodwill is recorded only when money or money\'s worth has been paid for it.',
    ['Which kind has a cost that can be measured?', 'AS 26: internally generated goodwill is not recognised as an asset.']),
  tf(7, 'gw-kinds', 'easy', 'A firm that has built up a fine reputation over twenty years should record goodwill in its books at the value its partners estimate.', false,
    'This is self-generated goodwill. Nothing was paid for it, its cost cannot be measured reliably, and AS 26 does not allow it to be recorded.',
    ['Was any price paid for this goodwill?', 'Only purchased goodwill is recorded.']),
  mcq(8, 'gw-kinds', 'medium', 'Assertion (A): Self-generated goodwill is not recorded in the books of account. Reason (R): No price is paid for self-generated goodwill, so its cost cannot be measured reliably. Which is correct?',
    AR.both,
    [
      [AR.bothNot, 'Missed the link: it is because no cost can be measured reliably that it is not recorded.'],
      [AR.aOnly, 'The reason is true: self-generated goodwill grows inside the firm and nothing is paid for it.'],
      [AR.rOnly, 'The assertion is true: AS 26 does not allow self-generated goodwill to be recorded.'],
    ],
    'AS 26 allows an intangible asset to be recorded only when its cost can be measured reliably. Self-generated goodwill has no such cost.',
    ['Is each statement true on its own?', 'Does the reason say why the assertion holds?']),
  mcq(9, 'gw-nature', 'medium', 'Assertion (A): Goodwill is an intangible asset but not a fictitious asset. Reason (R): Goodwill has a value that is realised when the business is sold. Which is correct?',
    AR.both,
    [
      [AR.bothNot, 'Missed the link: having a realisable value is exactly what separates goodwill from a fictitious asset.'],
      [AR.aOnly, 'The reason is true: a buyer of the business pays for its goodwill.'],
      [AR.rOnly, 'The assertion is true: goodwill has no physical form, yet it is not without value.'],
    ],
    'A fictitious asset has no realisable value. Goodwill has one, so it is intangible but not fictitious.',
    ['What is the difference between intangible and fictitious?', 'Does the reason explain that difference?']),
  mcq(10, 'gw-kinds', 'easy', 'Which of these is NOT an occasion on which a partnership firm values its goodwill?',
    'When the firm buys goods on credit',
    [
      ['When a new partner is admitted', 'This is an occasion: the new partner gets a share of future profits from the old partners.'],
      ['When a partner retires', 'This is an occasion: the retiring partner gives up a share of future profits.'],
      ['When the partners change their profit-sharing ratio', 'This is an occasion: one partner gains a share that another gives up.'],
    ],
    'Goodwill is valued when the partners or their shares change, or the business is sold. A purchase of goods changes neither.',
    ['Which event leaves the partners and their shares as they were?', 'Goodwill compensates a partner who gives up a share of future profits.']),
  mcq(11, 'gw-nature', 'medium', 'Ritu\'s Bakery and Zoya\'s Bakery each have a capital employed of ₹10,00,000, on which the normal profit is ₹1,00,000 a year. Ritu\'s Bakery earns ₹1,60,000 a year and Zoya\'s Bakery earns ₹1,00,000. Which statement is correct?',
    'Ritu\'s Bakery has goodwill, because it earns ₹60,000 a year above the normal profit',
    [
      ['Both bakeries have the same goodwill, because their capital is the same', 'Tied goodwill to capital; it depends on the profit earned above the normal.'],
      ['Zoya\'s Bakery has goodwill, because it earns exactly the normal profit', 'Took the normal profit as a sign of goodwill; goodwill needs a profit above the normal.'],
      ['Neither bakery has goodwill, because goodwill is not shown in their books', 'Mixed up having goodwill with recording it; self-generated goodwill exists though it is not recorded.'],
    ],
    'Goodwill is the ability to earn more than the normal profit. Only Ritu\'s Bakery does so.',
    ['Compare what each bakery earns with the normal profit.', 'Profit above the normal is the super profit.']),
  tf(12, 'gw-nature', 'medium', 'If a business needs more capital than before to earn the same profit, its goodwill tends to fall.', true,
    'More capital means a higher normal profit. With the actual profit unchanged, less is left above the normal, so goodwill falls.',
    ['What happens to the normal profit when the capital employed rises?', 'Goodwill follows the profit above the normal.']),
  mcq(13, 'gw-nature', 'easy', 'A firm holds a long-term contract to supply meals to a large factory at good prices. Which factor affecting goodwill is this?',
    'Special advantages',
    [
      ['Location of the business', 'The advantage is the contract, not the place of business.'],
      ['Nature of the business', 'The advantage is not the kind of goods; it is an assured contract.'],
      ['Efficiency of management', 'Nothing is said about how the firm is run; the advantage is the contract.'],
    ],
    'A long-term contract, like an import licence or a patent, is a special advantage that rivals do not have.',
    ['Is it the place, the people, the trade or a special right?', 'Licences, contracts and assured supplies are special advantages.']),
  mcq(39, 'gw-kinds', 'medium', 'This year a firm paid ₹50,000 for goodwill when it bought another business, and the amount stands in its books. The firm\'s own reputation has also grown over many years, and a valuer now estimates its total goodwill at ₹2,50,000. Under AS 26, at what amount can goodwill appear in the books?',
    '₹50,000',
    [
      ['₹2,50,000', 'Recorded the valuer\'s estimate; all but ₹50,000 of it is self-generated goodwill, which is not recorded.'],
      ['₹2,00,000', 'Recorded the self-generated part and left out the purchased part: the reverse of the rule.'],
      ['Nil', 'Purchased goodwill has a cost, ₹50,000 here, and it is recorded.'],
    ],
    'Only the ₹50,000 was paid for. The other ₹2,00,000 is self-generated and cannot be recorded.',
    ['Which part of the goodwill was paid for?', 'Only purchased goodwill is recorded.']),

  // ---- The methods (recognition) ----
  mcq(14, 'gw-average-profit', 'easy', 'Under the average profit method, goodwill is:',
    'Average profit x Number of years\' purchase',
    [
      ['Average profit x 100 / Normal rate of return', 'This is the capitalised value of the average profit, not goodwill by the average profit method.'],
      ['Super profit x Number of years\' purchase', 'This is the super profit method.'],
      ['Total profit of all the years x Number of years\' purchase', 'The total has to be divided by the number of years first.'],
    ],
    'The average of the normal profits is multiplied by the agreed number of years\' purchase.',
    ['Which profit does this method use?', 'It is multiplied, not divided.']),
  mcq(15, 'gw-adjustments', 'easy', 'The profit of a past year is after charging a loss by fire. To find the normal profit of that year, the loss is:',
    'added back to the profit',
    [
      ['deducted from the profit', 'The loss has already reduced the profit; deducting it again doubles the effect.'],
      ['ignored', 'An abnormal loss makes the profit of that year lower than normal, so it cannot be ignored.'],
      ['deducted from the profit of the next year', 'The loss belongs to the year in which it was charged.'],
    ],
    'A loss by fire will not recur. Adding it back shows what the business earned in the normal course.',
    ['Has the loss already been taken out of the profit?', 'Abnormal losses are added back.']),
  tf(16, 'gw-adjustments', 'easy', 'A profit on the sale of land that is included in the profit of a past year is deducted to find the normal profit of that year.', true,
    'It is an abnormal gain: the firm will not sell land every year. Normal profit is found by taking it out.',
    ['Will this gain recur every year?', 'Abnormal gains are deducted.']),
  mcq(17, 'gw-adjustments', 'medium', 'The closing stock of 2023-24 was overvalued. What is the effect on the profits as shown by the books?',
    'The profit of 2023-24 is overstated and the profit of 2024-25 is understated',
    [
      ['The profit of 2023-24 is overstated and 2024-25 is not affected', 'Forgot that the closing stock of one year is the opening stock of the next.'],
      ['The profit of 2023-24 is understated and the profit of 2024-25 is overstated', 'Took the effect the wrong way round: closing stock is a credit in the Trading Account.'],
      ['The profits of both years are overstated', 'The two years move in opposite directions: opening stock is a debit.'],
    ],
    'Closing stock is credited in the Trading Account of 2023-24 and debited, as opening stock, in that of 2024-25.',
    ['On which side of the Trading Account is closing stock? And opening stock?', 'One error, two years, opposite directions.']),
  mcq(18, 'gw-weighted', 'medium', 'When is the weighted average profit preferred to the simple average profit?',
    'When the profits show a clear rising or falling trend',
    [
      ['When the profits are almost the same every year', 'With steady profits the weights make little difference; the simple average is used.'],
      ['When the firm has made a loss in every year', 'Weights do not turn losses into goodwill; the method is chosen for a trend in profits.'],
      ['When the capital employed is not known', 'Capital employed matters for super profit, not for choosing between the two averages.'],
    ],
    'With a trend, the latest years are a better guide to the future, so they are given higher weights.',
    ['Why would the latest year deserve more weight?', 'Weights matter when the years differ in a steady direction.']),
  tf(19, 'gw-weighted', 'medium', 'Under the weighted average profit method, the earliest year is given the highest weight.', false,
    'The latest year gets the highest weight, because it is the best guide to future profits.',
    ['Which year tells most about the future?', 'Weights rise from the earliest year to the latest.']),
  mcq(20, 'gw-super-profit', 'easy', 'Super profit is:',
    'the excess of average profit over normal profit',
    [
      ['the excess of normal profit over average profit', 'Reversed the two: super profit is what the firm earns above the normal.'],
      ['the total profit of all the years', 'Super profit is a yearly figure: average profit less normal profit.'],
      ['the profit before charging partners\' remuneration', 'Remuneration is an adjustment to the average profit; it is not what super profit means.'],
    ],
    'Super profit = Average profit - Normal profit.',
    ['"Super" means over and above something.', 'Over and above the normal profit.']),
  mcq(21, 'gw-capital-employed', 'easy', 'Normal profit is:',
    'Capital employed x Normal rate of return / 100',
    [
      ['Average profit x Normal rate of return / 100', 'The rate is applied to the capital employed, not to the profit.'],
      ['Capital employed x 100 / Normal rate of return', 'This divides by the rate, which is how a profit is capitalised.'],
      ['Total assets x Normal rate of return / 100', 'Applied the rate to all the assets without deducting the outside liabilities; capital employed is the assets used less those liabilities.'],
    ],
    'It is the return a similar firm would earn on the same capital.',
    ['A rate of return is a return on what?', 'On the capital employed.']),
  mcq(22, 'gw-capital-employed', 'medium', 'Which of these is left out when capital employed is calculated from the assets?',
    'Non-trade investments',
    [
      ['Stock', 'Stock is used in the business and is part of capital employed.'],
      ['Sundry debtors', 'Debtors arise from the trade and are part of capital employed.'],
      ['Plant and machinery', 'Machinery is used in the business and is part of capital employed.'],
    ],
    'Non-trade investments earn outside the business. Goodwill and fictitious assets are left out too.',
    ['Which asset is not at work in the business itself?', 'Left out: goodwill, fictitious assets, non-trade investments.']),
  tf(23, 'gw-capital-employed', 'medium', 'A debit balance of Profit and Loss A/c shown on the assets side is included in capital employed.', false,
    'It is a fictitious asset: a loss carried forward, with no value. Fictitious assets are left out of capital employed.',
    ['Does a past loss earn any profit?', 'Fictitious assets are left out.']),
  mcq(24, 'gw-capitalisation', 'medium', 'The capitalised value of the average profit is:',
    'Average profit x 100 / Normal rate of return',
    [
      ['Average profit x Normal rate of return / 100', 'This takes a percentage of the profit; capitalising divides the profit by the rate.'],
      ['Average profit x Number of years\' purchase', 'This is goodwill by the average profit method.'],
      ['Average profit - Normal profit', 'This is the super profit.'],
    ],
    'It is the capital that would earn the average profit at the normal rate of return.',
    ['How much capital earns this profit at the normal rate?', 'Divide the profit by the rate.']),
  mcq(25, 'gw-capitalisation', 'medium', 'Assertion (A): Goodwill by capitalisation of average profit is the same as goodwill by capitalisation of super profit. Reason (R): The capitalised value of the average profit less the capital employed equals the super profit capitalised at the same rate. Which is correct?',
    AR.both,
    [
      [AR.bothNot, 'Missed the link: the reason is the algebra that makes the two answers equal.'],
      [AR.aOnly, 'The reason is true: capital employed is the capitalised value of the normal profit, so the difference is the capitalised super profit.'],
      [AR.rOnly, 'The assertion is true: the two capitalisation methods always give the same goodwill.'],
    ],
    'Average profit x 100 / rate - Capital employed = (Average profit - Normal profit) x 100 / rate, because capital employed = normal profit x 100 / rate.',
    ['Try it with average profit ₹1,00,000, capital ₹8,00,000 and 10%.', 'Both give ₹2,00,000.']),
  tf(26, 'gw-super-profit', 'medium', 'If the average profit of a firm is less than its normal profit, the firm has no goodwill under the super profit method.', true,
    'There is no super profit: the firm earns less than a normal firm would on the same capital.',
    ['What is average profit less normal profit here?', 'No profit above the normal, no goodwill.']),
  mcq(27, 'gw-super-profit', 'medium', 'The normal rate of return in a trade rises from 10% to 12%. The average profit and the capital employed of a firm in that trade do not change. What happens to its goodwill by the super profit method?',
    'It falls, because the normal profit rises and the super profit becomes smaller',
    [
      ['It rises, because a higher rate is applied', 'Took the rate as something that multiplies goodwill; it raises the normal profit, which is deducted.'],
      ['It does not change, because the average profit is the same', 'Looked only at the average profit; the normal profit deducted from it has risen.'],
      ['It rises, because the capital employed earns more', 'The firm earns the same as before; only the profit expected of a normal firm has gone up.'],
    ],
    'Normal profit = capital employed x rate / 100 goes up, so average profit - normal profit goes down.',
    ['Which figure in the formula depends on the rate?', 'A higher normal profit leaves a smaller super profit.']),
  mcq(28, 'gw-adjustments', 'medium', 'The past profits of a firm were arrived at without charging anything for the work done by the partners. When goodwill is valued, a fair remuneration for the partners is:',
    'deducted from the average profit',
    [
      ['added to the average profit', 'The profit is too high without it; the cost of the partners\' work comes off.'],
      ['ignored, because partners are owners', 'A buyer would have to pay someone to do this work, so its cost is a charge on the profit of the business.'],
      ['deducted from the goodwill after it is calculated', 'The adjustment is made to the profit, before the years\' purchase is applied.'],
    ],
    'The profit that belongs to the business is what remains after paying for the work needed to run it. Had the partners already charged a salary of their own, only the difference between that salary and a fair remuneration would be adjusted.',
    ['Would a new owner have to pay for this work?', 'Deduct it from the average profit.']),
  mcq(29, 'gw-capitalisation', 'complex', 'A firm earns an average profit of ₹1,20,000 on a capital employed of ₹10,00,000. The normal rate of return is 12%. What is its goodwill by capitalisation of average profit?',
    'Nil',
    [
      ['₹10,00,000', 'Gave the capitalised value of the business and did not deduct the capital employed.'],
      ['₹1,20,000', 'Gave the average profit as the goodwill.'],
      ['₹14,400', 'Took 12% of the average profit instead of capitalising it.'],
    ],
    'Capitalised value = 1,20,000 x 100 / 12 = ₹10,00,000, which equals the capital employed. The firm earns only the normal profit, so it has no goodwill.',
    ['Find the capitalised value first.', 'Compare it with the capital employed.']),
  tf(38, 'gw-average-profit', 'easy', 'The "number of years\' purchase" is the number of years for which the firm has been in business.', false,
    'It is the agreed number by which the average (or super) profit is multiplied: the number of years for which the profit is expected to continue because of the firm\'s past effort.',
    ['Is it about the past life of the firm or about future profits?', 'It is a multiplier agreed by the partners.']),
  mcq(40, 'gw-adjustments', 'medium', 'The profit of one past year was reduced by a loss caused by an earthquake. Meera wants to use that profit as it stands; Kabir wants to add the loss back before averaging. Who is right, and why?',
    'Kabir, because goodwill is based on the profit the business can normally be expected to earn',
    [
      ['Meera, because the loss actually took place', 'Goodwill looks at maintainable future profit, not at everything that happened once.'],
      ['Meera, because past profits can never be changed', 'The books are not being changed; the profits are only being restated for the valuation.'],
      ['Kabir, because every loss of a past year is added back', 'Only abnormal losses are added back; normal trading losses stay.'],
    ],
    'An earthquake is abnormal and not expected to recur, so its loss is added back to find the normal profit.',
    ['Is the loss likely to recur every year?', 'Abnormal losses are added back.']),

  // ---- Short sums ----
  num(30, 'gw-average-profit', 'easy', 'rupees', 'The profits of a firm for the last three years were ₹40,000, ₹50,000 and ₹60,000. Find the goodwill at 2 years\' purchase of the average profit.', 100000,
    [[50000, 'Stopped at the average profit and did not multiply by 2.'], [300000, 'Multiplied the total profit of the three years by 2.'], [150000, 'Multiplied the average profit by 3, the number of years averaged.']],
    ['Average profit = (₹40,000 + ₹50,000 + ₹60,000) / 3 = ₹50,000.', 'Goodwill = ₹50,000 x 2 = ₹1,00,000.'],
    ['Find the average of the three profits.', "Multiply it by the number of years' purchase."]),
  num(31, 'gw-weighted', 'medium', 'rupees', 'The profits of the last three years were ₹60,000, ₹90,000 and ₹1,20,000, in that order. The weights are 1, 2 and 3, the latest year having the highest weight. Find the goodwill at 2 years\' purchase of the weighted average profit.', 200000,
    [[100000, 'Stopped at the weighted average profit.'], [180000, 'Used the simple average, ₹90,000, and ignored the weights.'], [400000, 'Divided the total of the products by 3, the number of years, instead of by 6.']],
    ['Products = (₹60,000 x 1) + (₹90,000 x 2) + (₹1,20,000 x 3) = ₹6,00,000.', 'Weighted average profit = ₹6,00,000 / 6 = ₹1,00,000.', 'Goodwill = ₹1,00,000 x 2 = ₹2,00,000.'],
    ['Multiply each profit by its weight and add.', 'Divide by the total of the weights, 6.']),
  num(32, 'gw-super-profit', 'medium', 'rupees', 'A firm earns an average profit of ₹1,50,000 on a capital employed of ₹10,00,000. The normal rate of return is 10%. Find the goodwill at 3 years\' purchase of the super profit.', 150000,
    [[450000, 'Multiplied the whole average profit by 3.'], [50000, 'Stopped at the super profit.'], [300000, 'Multiplied the normal profit by 3.']],
    ['Normal profit = ₹10,00,000 x 10 / 100 = ₹1,00,000.', 'Super profit = ₹1,50,000 - ₹1,00,000 = ₹50,000.', 'Goodwill = ₹50,000 x 3 = ₹1,50,000.'],
    ['Find the normal profit on the capital employed.', 'Super profit = average profit - normal profit.']),
  num(33, 'gw-capitalisation', 'medium', 'rupees', 'A firm earns an average profit of ₹90,000. Its assets, all tangible and used in the business, are ₹10,00,000 and its outside liabilities are ₹3,00,000. The normal rate of return is 10%. Find the goodwill by capitalisation of average profit.', 200000,
    [[900000, 'Gave the capitalised value and did not deduct the net assets.'], [20000, 'Stopped at the super profit, ₹90,000 - ₹70,000.'], [600000, 'Deducted only the outside liabilities from the capitalised value.']],
    ['Capitalised value = ₹90,000 x 100 / 10 = ₹9,00,000.', 'Net assets = ₹10,00,000 - ₹3,00,000 = ₹7,00,000.', 'Goodwill = ₹9,00,000 - ₹7,00,000 = ₹2,00,000.'],
    ['Capitalise the average profit at the normal rate.', 'Deduct the net assets (assets less outside liabilities).']),
  num(34, 'gw-capital-employed', 'medium', 'percent', 'A firm has a capital employed of ₹10,00,000. Its average profit is ₹1,80,000 and its super profit is ₹60,000. What is the normal rate of return?', 1200,
    [[1800, 'Divided the whole average profit by the capital employed: that is the rate the firm actually earns.'], [600, 'Divided the super profit by the capital employed.']],
    ['Normal profit = Average profit - Super profit = ₹1,80,000 - ₹60,000 = ₹1,20,000.', 'Normal rate of return = ₹1,20,000 / ₹10,00,000 x 100 = 12%.'],
    ['Find the normal profit first.', 'Normal rate = normal profit / capital employed x 100.']),
  num(35, 'gw-average-profit', 'medium', 'times', 'The goodwill of a firm is valued at ₹3,75,000 on the basis of the average profit of the last four years, which is ₹1,50,000 a year. At how many years\' purchase has the goodwill been valued?', 250,
    [[400, 'Gave the number of years whose profits were averaged, not the number of years\' purchase.'], [40, 'Divided the average profit by the goodwill instead of the goodwill by the average profit.']],
    ['Number of years\' purchase = Goodwill / Average profit = ₹3,75,000 / ₹1,50,000 = 2.5.'],
    ["Goodwill = average profit x years' purchase.", 'Divide the goodwill by the average profit.']),
  num(36, 'gw-adjustments', 'complex', 'rupees', 'The profits of a firm were: 2022-23 ₹90,000, 2023-24 ₹1,50,000 and 2024-25 ₹1,20,000. The profit of 2022-23 is after charging an abnormal loss of ₹30,000 by fire, and the closing stock of 2023-24 was overvalued by ₹15,000. Find the goodwill at 2 years\' purchase of the average normal profit.', 260000,
    [[240000, 'Averaged the profits as given and made no corrections.'], [250000, 'Corrected the stock only in 2023-24; the profit of 2024-25 rises by the same ₹15,000.'], [220000, 'Deducted the loss by fire again instead of adding it back.'], [130000, 'Stopped at the average normal profit.']],
    ['2022-23: ₹90,000 + ₹30,000 (abnormal loss added back) = ₹1,20,000.', '2023-24: ₹1,50,000 - ₹15,000 (closing stock overvalued) = ₹1,35,000.', '2024-25: ₹1,20,000 + ₹15,000 (opening stock overvalued) = ₹1,35,000.', 'Average = ₹3,90,000 / 3 = ₹1,30,000.', 'Goodwill = ₹1,30,000 x 2 = ₹2,60,000.'],
    ['Correct each year first.', 'The stock error changes two years, in opposite directions.']),
  mcq(37, 'gw-capital-employed', 'complex', 'The assets of a firm total ₹12,00,000. They include goodwill of ₹1,00,000 and non-trade investments of ₹1,50,000. Outside liabilities are ₹2,50,000. What is the capital employed for valuing goodwill?',
    '₹7,00,000',
    [
      ['₹9,50,000', 'Deducted the outside liabilities only, leaving in goodwill and the non-trade investments.'],
      ['₹8,50,000', 'Left out goodwill but kept the non-trade investments.'],
      ['₹8,00,000', 'Left out the non-trade investments but kept goodwill among the assets.'],
    ],
    'Capital employed = 12,00,000 - 1,00,000 - 1,50,000 - 2,50,000 = ₹7,00,000.',
    ['Which assets are not at work in the business?', 'Then deduct the outside liabilities.']),
];

// ---------------------------------------------------------------------------------------------------------------
// Levels
// ---------------------------------------------------------------------------------------------------------------

const levels = buildLadder(T, {
  concept: {
    title: 'What Goodwill Is and Why It Is Valued',
    description: 'See why a business can be worth more than its assets, and the two ideas every method of valuation rests on.',
    lesson: [
      {
        type: 'text',
        heading: 'Two shops, one of them worth more',
        body: 'Two sweet shops in the same town each have ₹8,00,000 invested in them. A shop like these normally earns ₹80,000 a year. The first shop, known for its quality and standing beside the bus stand, earns ₹1,00,000 every year. Anyone buying it would pay more than ₹8,00,000, because it comes with customers and a name. That extra value is goodwill. It cannot be seen or touched, so it is an intangible asset; but it has a real value, so it is not a fictitious asset. It cannot be sold apart from the shop, and its value changes as the prospects of the shop change. Location, good management, the kind of business, the absence of competitors and special advantages such as licences or long-term contracts all add to it.',
      },
      {
        type: 'text',
        heading: 'Paid for, or grown inside the firm',
        body: 'When a firm buys a running business and pays more than its net assets, the excess is purchased goodwill. It has a cost, so it is recorded in the books. Goodwill that a firm builds up by its own work is self-generated: nothing was paid for it, its cost cannot be measured reliably, and AS 26 does not allow it to be recorded. Even so, it has to be valued whenever the partners or their shares change (a new ratio, an admission, a retirement, a death) or the business is sold, because someone is then giving up a share of future profits.',
      },
      {
        type: 'example',
        title: 'A running business with net assets of ₹8,00,000 is bought for ₹10,00,000 by cheque',
        lines: [
          { accountId: 'building', side: 'Dr', amount: 50000000 },
          { accountId: 'stock', side: 'Dr', amount: 30000000 },
          { accountId: 'goodwill', side: 'Dr', amount: 20000000 },
          { accountId: 'bank', side: 'Cr', amount: 100000000 },
        ],
        note: 'The assets come in at ₹8,00,000 and ₹10,00,000 is paid. The extra ₹2,00,000 was paid for goodwill, so it is purchased goodwill and is recorded as an asset.',
      },
      {
        type: 'text',
        heading: 'First idea: a few years of the average profit',
        body: 'The simplest valuation says: the shop will go on earning its usual profit for some years because of its name, so goodwill is that profit for an agreed number of years. Profits of ₹80,000, ₹1,00,000 and ₹1,20,000 give an average of ₹1,00,000; at 2 years\' purchase, goodwill is ₹2,00,000. The profits must be normal ones: a loss by fire is added back, a gain on selling land is taken out, and errors of past years are corrected first. When profits are steadily rising or falling, the later years are given higher weights.',
      },
      {
        type: 'text',
        heading: 'Second idea: only the extra profit is goodwill',
        body: 'A shop with ₹8,00,000 of capital employed would earn ₹80,000 at the normal rate of 10% even without any reputation. Only the profit above that, the super profit, is due to goodwill: ₹1,00,000 - ₹80,000 = ₹20,000. At 3 years\' purchase, goodwill is ₹60,000. Or the super profit can be capitalised: ₹20,000 x 100 / 10 = ₹2,00,000. The same ₹2,00,000 comes from capitalising the average profit (₹1,00,000 x 100 / 10 = ₹10,00,000) and deducting the capital employed of ₹8,00,000.',
      },
      {
        type: 'table',
        title: 'Worked example 1: capital employed by both routes (Iyer & Nair, spice traders in Kochi, 31 March 2025)',
        rows: [
          { label: 'Route 1: assets used in the business' },
          { label: 'Building', amount: '₹4,00,000' },
          { label: 'Machinery', amount: '₹2,50,000' },
          { label: 'Stock', amount: '₹1,80,000' },
          { label: 'Debtors', amount: '₹1,40,000' },
          { label: 'Cash', amount: '₹30,000' },
          { label: 'Less: Creditors', amount: '(1,50,000)' },
          { label: 'Less: Bank loan', amount: '(1,00,000)' },
          { label: 'Capital employed', amount: '₹7,50,000', total: true },
          { label: "Route 2: the partners' funds" },
          { label: "Iyer's Capital + Nair's Capital + General Reserve", amount: '₹9,00,000' },
          { label: 'Less: Goodwill in the books', amount: '(50,000)' },
          { label: 'Less: Non-trade investments', amount: '(80,000)' },
          { label: 'Less: Advertisement suspense (fictitious)', amount: '(20,000)' },
          { label: 'Capital employed', amount: '₹7,50,000', total: true },
        ],
        note: 'Watch out: goodwill, non-trade investments and a fictitious asset are never part of capital employed, by either route. Both routes must give the same figure.',
      },
      {
        type: 'working',
        title: "Worked example 2: adjusting three years' profits, then the goodwill",
        lines: [
          'A printing press in Sivakasi shows profits of ₹1,40,000 (2022-23), ₹1,10,000 (2023-24) and ₹1,85,000 (2024-25). Goodwill is 2 years\' purchase of the average normal profit.',
          'Found: the profit of 2023-24 is after a loss of ₹30,000 by fire; the profit of 2024-25 includes a gain of ₹15,000 on selling old machinery; the closing stock of 2022-23 was overvalued by ₹10,000.',
          '2022-23: ₹1,40,000 - ₹10,000 (closing stock overvalued) = ₹1,30,000.',
          '2023-24: ₹1,10,000 + ₹30,000 (abnormal loss added back) + ₹10,000 (opening stock overvalued) = ₹1,50,000.',
          '2024-25: ₹1,85,000 - ₹15,000 (abnormal gain taken out) = ₹1,70,000.',
          'Total ₹4,50,000; average normal profit = ₹4,50,000 / 3 = ₹1,50,000; goodwill = ₹1,50,000 x 2 = ₹3,00,000.',
        ],
        note: 'Watch out: a stock error moves two years in opposite directions. Correcting only the year it was made gives the wrong average.',
      },
      {
        type: 'working',
        title: 'Worked example 3: a weighted average for a rising trend',
        lines: [
          'Desai & Patel, textile wholesalers in Surat, earned ₹70,000, ₹1,00,000 and ₹1,30,000 in the last three years. The weights are 1, 2 and 3, the latest year highest.',
          'Products: ₹70,000 x 1 = ₹70,000; ₹1,00,000 x 2 = ₹2,00,000; ₹1,30,000 x 3 = ₹3,90,000. Total ₹6,60,000.',
          'Weighted average = ₹6,60,000 / (1 + 2 + 3) = ₹1,10,000.',
          'At 3 years\' purchase, goodwill = ₹3,30,000. The simple average (₹1,00,000) would give only ₹3,00,000.',
        ],
        note: 'Watch out: divide by the total of the weights (6), not by the number of years (3). A loss year is a negative product.',
      },
      {
        type: 'working',
        title: 'Worked example 4: super profit and both capitalisation methods',
        lines: [
          'Iyer & Nair (example 1) have a capital employed of ₹7,50,000 and an average normal profit of ₹1,50,000. The normal rate of return is 12%.',
          'Normal profit = ₹7,50,000 x 12/100 = ₹90,000. Super profit = ₹1,50,000 - ₹90,000 = ₹60,000.',
          'At 3 years\' purchase of the super profit: goodwill = ₹60,000 x 3 = ₹1,80,000.',
          'Capitalising the super profit: ₹60,000 x 100/12 = ₹5,00,000.',
          'Capitalising the average profit: ₹1,50,000 x 100/12 = ₹12,50,000; less capital employed ₹7,50,000 = ₹5,00,000, the same figure.',
        ],
        note: 'Watch out: had the profit included income from the non-trade investments, that income would come out of the profit too, since the investments are out of the capital employed.',
      },
      { type: 'check', questionId: qid(1) },
      { type: 'check', questionId: qid(30) },
    ],
  },
  cards: {
    title: 'Goodwill: Rules and Formulas',
    description: 'Recall what goodwill is, which goodwill is recorded, and the formula of every method.',
    cardIds: cards.map((c) => c.id),
  },
  recognition: [
    {
      title: 'Nature, Factors and Kinds of Goodwill',
      description: 'Recognise what goodwill is, what raises it, and which goodwill may be recorded.',
      questionIds: [2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 39].map(qid),
    },
    {
      title: 'Choosing the Method and the Adjustment',
      description: 'Recognise the formula of each method and how past profits are corrected.',
      questionIds: [14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28, 38, 40].map(qid),
    },
    {
      title: 'Short Sums on Every Method',
      description: 'One quick sum on each method before the practice levels.',
      questionIds: [31, 32, 33, 34, 35, 29, 37, 36].map(qid),
    },
  ],
  practice: [
    {
      title: 'Average Profit and the Idea of Goodwill',
      description: 'Average profit, years\' purchase, purchased goodwill and what raises or lowers goodwill.',
      templateIds: ['gw-avg-profit', 'gw-avg-goodwill', 'gw-purchase-basic', 'gw-purchased-amount', 'gw-nature', 'gw-factor', 'gw-factor-effect', 'gw-purchased-or-self', 'gw-need'],
      count: 8,
    },
    {
      title: 'Normal Profit, Super Profit and Capitalisation: First Steps',
      description: 'Capital employed, normal profit, super profit and the two capitalisation formulas, one step at a time.',
      templateIds: ['gw-normal-profit', 'gw-super-profit', 'gw-super-goodwill-basic', 'gw-cap-super-basic', 'gw-capitalised-value', 'gw-capital-employed-basic', 'gw-adjust-direction', 'gw-method-name'],
      count: 8,
    },
    {
      title: 'Normal Profits, Step by Step (Guided)',
      description: 'Correct one thing at a time: an abnormal item, wrongly valued stock, a wrongly treated expense, the partners\' remuneration.',
      templateIds: ['gw-avg-abnormal', 'gw-stock-next-year', 'gw-capitalised-expense', 'gw-avg-remuneration'],
      count: 6,
      guided: true,
    },
    {
      title: 'Weighted Average and Missing Terms',
      description: 'Weighted average profit, and working back from the goodwill to the years\' purchase or a missing profit.',
      templateIds: ['gw-weighted-avg', 'gw-weighted-goodwill', 'gw-years-purchase', 'gw-missing-year-profit'],
      count: 6,
    },
    {
      title: 'Super Profit Method',
      description: 'Capital employed from the books, goodwill by super profit, and each term of the formula as the unknown.',
      templateIds: ['gw-super-goodwill', 'gw-super-find-avg', 'gw-super-find-rate', 'gw-super-find-capital', 'gw-super-find-years', 'gw-capital-employed-assets', 'gw-capital-employed-funds'],
      count: 8,
    },
    {
      title: 'Capitalisation Methods',
      description: 'Capitalisation of average profit and of super profit, why they agree, and each term as the unknown.',
      templateIds: ['gw-cap-avg-goodwill', 'gw-cap-super-goodwill', 'gw-cap-same', 'gw-cap-find-term', 'gw-cap-find-rate'],
      count: 6,
    },
    {
      title: 'Complex Valuations',
      description: 'Several corrections to past profits, capital employed from a Balance Sheet, and two methods compared.',
      templateIds: ['gw-avg-adjusted', 'gw-weighted-adjusted', 'gw-super-full', 'gw-cap-balance-sheet', 'gw-compare-methods', 'gw-super-indirect', 'gw-stock-average-effect', 'gw-super-reverse'],
      count: 8,
    },
  ],
  mixed: { title: 'Mixed Goodwill Practice', description: 'Every method and every adjustment, shuffled the way an examination serves them.', count: 12 },
  challenge: { title: 'Challenge: Goodwill Mastery', description: 'The hardest valuations in the topic, against the clock.', count: 8, timerSecondsPerQuestion: 150 },
  // Added after the audit: the topic's first formats, with an id of their own (goodwill-formats-1), after the challenge.
  formats: [
    {
      title: 'Set Out a Valuation of Goodwill',
      description: 'The 4-6 mark layout the board marks: a statement of normal profits year by year with the goodwill, and the full super profit working with capital employed and both methods.',
      templateIds: ['gw-fmt-normal-profits', 'gw-fmt-super-profit'],
      count: 2,
    },
  ],
});

const pack: TopicPack = {
  topicId: T,
  concepts,
  cards,
  levels: [
    ...levels,
    ...laterLevels(T, levels, [
      // Added after the audit, with an id of its own; the Assertion-Reason level stays last (content/assertionReason.test.ts).
      {
        name: 'more-board-patterns',
        type: 'complex_practice',
        title: 'More Board Patterns: a Loss Year, Average Capital, Investment Income',
        description: 'A weighted average with a loss year, super profit on the average capital employed, and profits that include income from non-trade investments.',
        generate: { templateIds: ['gw-weighted-loss-year', 'gw-super-avg-capital', 'gw-super-nti-income'], count: 6 },
      },
      {
        name: 'assertion-reason',
        type: 'medium_practice',
        title: 'Assertion and Reason',
        description: 'The one-mark question of the board: judge the Assertion, judge the Reason, and say whether the Reason explains the Assertion.',
        generate: { templateIds: ['gw-assertion-reason'], count: 6 },
      },
    ]),
  ],
  questions,
};

export default pack;
