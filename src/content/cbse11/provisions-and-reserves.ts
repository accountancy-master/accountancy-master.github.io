import { buildLadder, laterLevels } from '../ladder';
import type { Card, Concept, Difficulty, JournalQuestion, McqQuestion, NumericQuestion, Question, TopicPack, TrueFalseQuestion } from '../types';

const T = 'provisions-and-reserves';

const concepts: Concept[] = [
  { id: 'pr-provision-meaning', topicId: T, title: 'Meaning and need of provisions' },
  { id: 'pr-reserve-meaning', topicId: T, title: 'Meaning, need and importance of reserves' },
  { id: 'pr-difference', topicId: T, title: 'Provision versus reserve' },
  { id: 'pr-revenue-capital', topicId: T, title: 'Revenue reserves and capital reserves' },
  { id: 'pr-general-specific', topicId: T, title: 'General and specific reserves' },
  { id: 'pr-secret', topicId: T, title: 'Secret reserves' },
  { id: 'pr-pdd', topicId: T, title: 'Provision for doubtful debts and for discount on debtors' },
  { id: 'pr-depn-provision', topicId: T, title: 'Provision for depreciation' },
  { id: 'pr-sets', topicId: T, title: 'Journalising provisions and reserves' },
  { id: 'pr-formats', topicId: T, title: 'Preparing the bad debts and provision accounts' },
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
): Card => ({ id: `pr-card-${n}`, topicId: T, conceptId, kind, prompt, answer, explanation, example, commonMistake });

const cards: Card[] = [
  card(1, 'pr-provision-meaning', 'rule', 'What is a provision?',
    'An amount charged against profit to meet a known liability, or a likely loss, whose exact amount is not known.',
    'Prudence says a likely loss should be allowed for before it happens. The charge is debited to the Profit and Loss Account, so it reduces the profit of the year.',
    'Debtors are ₹2,00,000 and ₹10,000 of them are likely to turn bad: ₹10,000 is charged against profit as a provision for doubtful debts.',
    'Calling it a part of profit set aside. A provision is deducted to find the profit; it is not taken out of profit already found.'),
  card(2, 'pr-reserve-meaning', 'rule', 'What is a reserve?',
    'A part of the profit set aside, and not paid out, to strengthen the business or to meet future needs.',
    'A reserve is made out of profit that has already been found. It is an appropriation of profit and belongs to the owner.',
    'Net profit is ₹1,00,000 and ₹20,000 is transferred to General Reserve; ₹80,000 is left.',
    'Treating a reserve as a liability to outsiders, or as a separate sum of cash. It is a balance in the books.'),
  card(3, 'pr-difference', 'rule', 'How do a provision and a reserve differ?',
    'Provision: a charge against profit, for a known liability or likely loss, compulsory, deducted from the asset or shown as a liability. Reserve: an appropriation of profit, to strengthen the business, made only when there is profit and at the owner\'s choice, shown on the liabilities side with capital.',
    'The two differ in purpose, in effect on profit, in whether they must be made and in the way they appear in the balance sheet.',
    'Provision for doubtful debts ₹5,000 reduces net profit. A transfer of ₹5,000 to General Reserve does not: it is taken out of the net profit.',
    'Mixing up the two columns, for example saying a reserve is compulsory or that a provision is shown with capital.'),
  card(4, 'pr-difference', 'shortcut', 'A quick test to tell a provision from a reserve',
    'Is it deducted to find the net profit, for a likely loss or liability? That is a provision. Is it taken out of net profit already found? That is a reserve.',
    'The word "set aside" appears in both definitions, so ask instead when it is made: before the net profit (a charge) or after it (an appropriation).',
    'Depreciation, bad debts and provision for doubtful debts come before the net profit. Transfers to General Reserve come after it.',
    'Going by the words "set aside" or "kept for the future", which fit both.'),
  card(5, 'pr-provision-meaning', 'rule', 'Name the usual provisions',
    'Provision for doubtful debts, provision for discount on debtors, provision for depreciation, and provision for repairs and renewals. A company also makes a provision for taxation.',
    'Each meets a loss or a cost that is likely or certain, but whose exact amount is not yet known. Each is charged against profit. Provision for taxation belongs to a company, which pays tax on its own profit: the income tax of a sole proprietor is the owner\'s personal tax, so when the business pays it, it is the owner\'s drawings and not a charge against profit.',
    'Provision for discount on debtors covers the discount the firm expects to allow to debtors who pay promptly.',
    'Treating a general reserve as a provision. General Reserve is never charged against profit.'),
  card(6, 'pr-revenue-capital', 'rule', 'Revenue reserve versus capital reserve',
    'Revenue reserve: made out of profits of normal business activity. Capital reserve: made out of capital profits, such as a gain on selling or revaluing a fixed asset.',
    'The source of the profit decides the kind of reserve. Capital profits are not earned by trading, so they are kept apart.',
    'Land costing ₹3,00,000 is sold for ₹4,10,000: the ₹1,10,000 gain may be kept in a Capital Reserve. A transfer from trading profit to General Reserve is a revenue reserve.',
    'Calling a reserve made from trading profit a capital reserve because the amount is large.'),
  card(7, 'pr-general-specific', 'rule', 'General reserve versus specific reserve',
    'General reserve: kept for no particular purpose, usable for any need. Specific reserve: kept for a named purpose and used only for it.',
    'Specific reserves include the Workmen Compensation Reserve and the Investment Fluctuation Reserve. (Companies also keep a Dividend Equalisation Reserve.)',
    'Workmen Compensation Reserve: for claims of workers for accidents. Investment Fluctuation Reserve: for a fall in the value of investments.',
    'Thinking a specific reserve can be used for anything, or that a reserve with a named purpose is a provision.'),
  card(8, 'pr-secret', 'rule', 'What is a secret reserve and how does it arise?',
    'A reserve that is not shown in the balance sheet. It arises when assets are shown below their real value, liabilities above it, or profit is understated.',
    'Examples: stock valued below both its cost and its market price, excess depreciation, an unnecessarily large provision for doubtful debts, a capital item written off as an expense.',
    'Closing stock that cost ₹50,000, and can be sold for more, is shown at ₹40,000: profit is ₹10,000 lower than the true figure and a secret reserve of ₹10,000 is created.',
    'Calling overvaluation of assets a secret reserve. Overvaluing assets overstates profit and hides a loss.'),
  card(9, 'pr-pdd', 'formula', 'How is the new provision for doubtful debts found?',
    'New provision = Rate % x (Debtors - Further bad debts).',
    'Bad debts are losses that have already happened, so they are written off first. The provision is made only on the debtors that remain.',
    'Debtors ₹1,00,000, further bad debts ₹10,000, provision 5%: 5% of ₹90,000 = ₹4,500.',
    'Taking the percentage on the debtors before the bad debts are written off.'),
  card(10, 'pr-pdd', 'formula', 'What is charged to the Profit and Loss Account for bad debts and provision?',
    'Net charge = Bad debts (those already written off and the further ones) + New provision - Old provision.',
    'Bad debts and the new provision are charges of the year; the old provision was charged earlier, so it is deducted. Only if the old provision is larger than the bad debts and the new provision together is the net a credit to the Profit and Loss Account.',
    'Bad debts ₹5,000 + new provision ₹5,700 - old provision ₹3,000 = ₹7,700 charged.',
    'Adding the old provision instead of deducting it, or leaving out the bad debts.'),
  card(11, 'pr-pdd', 'rule', 'When is part of the old provision written back?',
    'Only when the old provision is larger than the bad debts of the year and the new provision together. The surplus (Old provision - Bad debts - New provision) is written back: credited to the Profit and Loss Account, which raises profit. If the old provision falls short of the two, the shortfall is charged, even when the new provision is smaller than the old one.',
    'The old provision first meets the bad debts of the year, and what is left must cover the new provision. Only what is left over after both is no longer needed.',
    'Old provision ₹12,000, no bad debts, new provision ₹9,000: ₹3,000 written back (Provision for Doubtful Debts A/c Dr ₹3,000; To Profit and Loss A/c ₹3,000). Old provision ₹12,000, bad debts ₹5,000, new provision ₹9,000: 5,000 + 9,000 - 12,000 = ₹2,000 is charged, not written back.',
    'Comparing only the old and the new provision and writing back the difference while bad debts of the year are still to be met.'),
  card(12, 'pr-pdd', 'formula', 'How is the provision for discount on debtors found?',
    'Provision for discount = Rate % x (Debtors - Bad debts - Provision for doubtful debts).',
    'Discount can only be claimed by debtors who actually pay, so it is worked on the debtors that are thought to be good.',
    'Debtors ₹2,10,000, bad debts ₹10,000, doubtful debts 5%, discount 2%: ₹2,00,000 - ₹10,000 = ₹1,90,000; 2% = ₹3,800.',
    'Working the discount on the full debtors, or before deducting the provision for doubtful debts.'),
  card(13, 'pr-pdd', 'format', 'How do these appear in the balance sheet?',
    'Provisions: deducted from the asset (Debtors less Provision for doubtful debts). Reserves: on the liabilities side, along with the owner\'s capital.',
    'A provision reduces what an asset is worth. A reserve is part of the owner\'s funds.',
    'Debtors ₹1,00,000 less Provision ₹5,000 = ₹95,000 on the assets side. General Reserve ₹20,000 on the liabilities side.',
    'Showing a provision for doubtful debts on the liabilities side, or deducting a reserve from an asset.'),
  card(14, 'pr-depn-provision', 'formula', 'What is the provision for depreciation after n years?',
    'Balance = Cost x Rate % x n (straight line, on cost). Book value = Cost - Balance.',
    'Under this method the asset stays at its cost and each year\'s depreciation is added to Provision for Depreciation A/c.',
    'Machinery ₹5,00,000 at 10% for 4 years: ₹5,00,000 x 10% x 4 = ₹2,00,000. Book value ₹3,00,000.',
    'Giving only one year\'s depreciation, or giving the book value when the balance of the provision is asked.'),
  card(15, 'pr-depn-provision', 'format', 'Which entries create a provision?',
    'Depreciation: Depreciation A/c Dr; To Provision for Depreciation A/c. Doubtful debts: Profit and Loss A/c Dr; To Provision for Doubtful Debts A/c.',
    'The charge reaches the Profit and Loss Account: directly for doubtful debts, and through Depreciation A/c for depreciation. The credit goes to the provision account, not to the asset or to the debtors.',
    'Depreciation ₹10,000: Depreciation A/c Dr ₹10,000; To Provision for Depreciation A/c ₹10,000. Doubtful debts ₹5,000: Profit and Loss A/c Dr ₹5,000; To Provision for Doubtful Debts A/c ₹5,000.',
    'Crediting Machinery A/c or Debtors A/c directly, or debiting Bad Debts A/c for a loss that is only likely. The asset and the debtors stay at their full amounts.'),
  card(16, 'pr-reserve-meaning', 'rule', 'Why do businesses create reserves?',
    'To strengthen the financial position, to meet future losses, to expand from their own funds, and in some cases to keep payouts steady in lean years.',
    'A reserve keeps part of the profit in the business instead of paying it out, so the firm relies less on borrowing.',
    'A firm keeps ₹50,000 in reserve and later uses the strength it gives to buy new machinery without a loan.',
    'Thinking a reserve raises the profit of the year. It uses profit that was earned.'),
  card(17, 'pr-reserve-meaning', 'formula', 'How is a transfer to reserve worked out?',
    'Transfer = Rate % x Net profit. Profit left = (100 - Rate)% of Net profit.',
    'The transfer is taken from the net profit after all charges, so the net profit is found first.',
    'Net profit ₹3,60,000, 15% to General Reserve: transfer ₹54,000; profit left ₹3,06,000.',
    'Taking the rate on the profit before provisions and other charges were deducted.'),
  card(18, 'pr-difference', 'shortcut', 'Which items reduce the net profit?',
    'Charges do: depreciation, bad debts, provisions. Transfers to reserves do not; they come after the net profit.',
    'Net profit is the balance of the Profit and Loss Account before any appropriation.',
    'Profit before items ₹1,00,000; provision ₹10,000; transfer to reserve ₹20,000. Net profit ₹90,000; ₹70,000 after the transfer.',
    'Subtracting the transfer to reserve before finding the net profit.'),
  // Added after the check against the CBSE 2025-26 syllabus (docs/syllabus-coverage.md), whose learning outcomes ask
  // for the difference between a reserve and a reserve fund.
  card(19, 'pr-reserve-meaning', 'rule', 'How does a reserve fund differ from a reserve?',
    'A reserve is profit kept back in the business; the money stays in the business and is used in it like any other funds. A reserve fund is a reserve whose amount is invested outside the business, in securities earmarked for it, so that the money is ready when the purpose arises.',
    'Both are appropriations of profit and stand with the owner\'s funds in the balance sheet. Only the reserve fund has its own investments on the assets side.',
    'General Reserve ₹50,000 with no investment against it is a reserve. A reserve of ₹50,000 invested in government bonds to repay a loan later is a reserve fund: the bonds are shown among the investments.',
    'Thinking every reserve is kept as separate cash or investments, or showing a reserve fund as a provision.'),
];

// ---------------------------------------------------------------------------------------------------------------
// Authored questions
// ---------------------------------------------------------------------------------------------------------------

let counter = 0;
const nextId = (): string => `pr-q-${String(++counter).padStart(3, '0')}`;

const HINTS = ['Recall what the term means before reading the options.', 'A provision is a charge against profit; a reserve is an appropriation of profit.'];

/** A multiple-choice question. The right option is rotated through the four places so the answers do not follow a pattern. */
const mc = (
  conceptId: string,
  difficulty: Difficulty,
  prompt: string,
  right: string,
  wrongs: [string, string][],
  explanation: string,
  hints: string[] = HINTS,
): McqQuestion => {
  const id = nextId();
  const place = counter % 4;
  const wrong = wrongs.map(([text, why]) => ({ text, why }));
  const options = [...wrong.slice(0, place).map((o) => ({ ...o, right: false })), { text: right, why: '', right: true }, ...wrong.slice(place).map((o) => ({ ...o, right: false }))];
  return {
    id,
    topicId: T,
    conceptId,
    difficulty,
    type: 'mcq',
    prompt,
    options: options.map((o, i) => (o.right ? { id: 'abcd'[i], text: o.text } : { id: 'abcd'[i], text: o.text, why: o.why })),
    correct: 'abcd'[place],
    hints,
    explanation,
  };
};

const tf = (conceptId: string, difficulty: Difficulty, prompt: string, correct: boolean, explanation: string, hints: string[] = HINTS): TrueFalseQuestion => ({
  id: nextId(),
  topicId: T,
  conceptId,
  difficulty,
  type: 'true_false',
  prompt,
  correct,
  hints,
  explanation,
});

const AR_OPTIONS = {
  a: 'Both A and R are true, and R is the correct explanation of A',
  b: 'Both A and R are true, but R is not the correct explanation of A',
  c: 'A is true, but R is false',
  d: 'A is false, but R is true',
} as const;
type Letter = keyof typeof AR_OPTIONS;

const AR_WHY: Record<Letter, Partial<Record<Letter, string>>> = {
  a: { b: 'Saw both as true but missed that R is the very reason for A.', c: 'Called R false; R is true and it explains A.', d: 'Called A false; A is true.' },
  b: { a: 'Took R as the explanation of A; R is true but does not explain A.', c: 'Called R false; R is a true statement.', d: 'Called A false; A is true.' },
  c: { a: 'Took R as true; R is false.', b: 'Took R as true but unrelated to A; R is false.', d: 'Reversed the verdicts: A is the true one.' },
  d: { a: 'Took A as true; A is false.', b: 'Took A as true; A is false.', c: 'Reversed the verdicts: R is the true one.' },
};

/** An assertion-and-reason item, written as a multiple-choice question. */
const ar = (conceptId: string, difficulty: Difficulty, assertion: string, reason: string, correct: Letter, explanation: string): McqQuestion => ({
  id: nextId(),
  topicId: T,
  conceptId,
  difficulty,
  type: 'mcq',
  prompt: `Assertion (A): ${assertion}\nReason (R): ${reason}\nChoose the correct option.`,
  options: (Object.keys(AR_OPTIONS) as Letter[]).map((l) =>
    l === correct ? { id: l, text: AR_OPTIONS[l] } : { id: l, text: AR_OPTIONS[l], why: AR_WHY[correct][l] ?? 'Judged the two statements wrongly.' },
  ),
  correct,
  hints: ['Decide whether A is true, then whether R is true, and only then whether R explains A.', HINTS[1]],
  explanation,
});

const num = (
  conceptId: string,
  difficulty: Difficulty,
  prompt: string,
  rupees: number,
  errors: [number, string][],
  working: string[],
): NumericQuestion => ({
  id: nextId(),
  topicId: T,
  conceptId,
  difficulty,
  type: 'numeric',
  unit: 'rupees',
  prompt,
  answer: rupees * 100,
  commonErrors: errors.map(([v, why]) => ({ value: v * 100, why })),
  working,
  hints: ['Write down the formula first, then substitute the amounts.', 'Check which figure the rate is applied to.'],
  explanation: working.join(' '),
});

const journal = (
  conceptId: string,
  difficulty: Difficulty,
  prompt: string,
  expected: JournalQuestion['expected'],
  extraChoices: string[],
  explanation: string,
): JournalQuestion => ({
  id: nextId(),
  topicId: T,
  conceptId,
  difficulty,
  type: 'journal_entry',
  prompt,
  expected,
  accountChoices: [...new Set([...expected.map((l) => l.accountId), ...extraChoices])],
  hints: ['Is the amount a charge against profit? Then the expense account is debited.', 'The credit goes to the provision account, not to the asset.'],
  explanation,
});

// --- Meaning and need of provisions ----------------------------------------------------------------------------

const PM = 'pr-provision-meaning';

const meaning: Question[] = [
  mc(PM, 'easy', 'Which statement best describes a provision?',
    'An amount charged against profit to meet a known liability or a likely loss whose exact amount is not known',
    [
      ['A part of the profit set aside to strengthen the financial position of the business', 'This describes a reserve, which is set aside out of profit already found.'],
      ['An amount paid in advance to a supplier', 'Mixed it up with a prepaid item; a provision is only an entry in the books and nothing is paid.'],
      ['The money the owner invests in the business', 'Confused a provision with capital.'],
    ],
    'A provision is a charge against profit for a liability or loss that is known or likely but whose amount is uncertain.'),
  mc(PM, 'easy', 'Which of these is a provision?',
    'Provision for doubtful debts',
    [
      ['General Reserve', 'General Reserve is a reserve, an appropriation of profit.'],
      ['Capital Reserve', 'Capital Reserve is made out of a capital profit; it is not a charge against profit.'],
      ['Drawings', 'Drawings are withdrawals by the owner and reduce capital; they are not set aside for a loss.'],
    ],
    'Provision for doubtful debts is charged against profit for the loss likely on debtors.'),
  mc(PM, 'medium', 'Which accounting principle mainly requires a business to allow for a likely loss, such as doubtful debts, before it happens?',
    'Prudence (conservatism)',
    [
      ['Going concern', 'Going concern assumes the business continues; it does not require allowing for likely losses.'],
      ['Money measurement', 'Money measurement decides what is recorded, not how likely losses are treated.'],
      ['Dual aspect', 'Dual aspect says every transaction has two effects; it does not require provisions.'],
    ],
    'Prudence says to provide for all likely losses but not to anticipate gains. A provision follows that rule.'),
  mc(PM, 'easy', 'Why is a provision for doubtful debts made at the end of the year?',
    'So that the year in which the goods were sold bears the loss that is likely to follow from them',
    [
      ['To increase the profit of the year', 'A provision is a charge, so it lowers profit.'],
      ['To keep cash ready for paying creditors', 'A provision is only a book entry; it does not put cash aside.'],
      ['To write off a debtor who has been declared insolvent', 'That is a bad debt, a loss that has already happened; a provision covers losses that are only likely.'],
    ],
    'The charge is matched with the sales of the year that are likely to cause the loss.'),
  mc(PM, 'easy', 'How is a provision for doubtful debts shown in the balance sheet?',
    'As a deduction from sundry debtors on the assets side',
    [
      ['On the liabilities side along with the owner\'s capital', 'That is where reserves are shown; a provision is not part of the owner\'s funds.'],
      ['As an expense in the Trading Account', 'It is charged in the Profit and Loss Account, not the Trading Account.'],
      ['It is not shown anywhere', 'It is always shown, because it changes what the debtors are worth.'],
    ],
    'Debtors less the provision shows the amount the business expects to collect.'),
  mc(PM, 'easy', 'Which of these is NOT an example of a provision?',
    'General Reserve',
    [
      ['Provision for depreciation', 'This is a provision, so it is not the answer.'],
      ['Provision for doubtful debts', 'This is a provision, so it is not the answer.'],
      ['Provision for discount on debtors', 'This is a provision, so it is not the answer.'],
    ],
    'General Reserve is an appropriation of profit, not a charge.'),
  tf(PM, 'medium', 'A provision for doubtful debts is meant for debtors who have already been found unable to pay.', false,
    'A debt that is known to be lost is a bad debt and is written off. The provision covers debts that are only doubtful: the loss is likely, not yet certain.'),
  tf(PM, 'easy', 'A provision is an appropriation of profit.', false,
    'A provision is a charge against profit. An appropriation, such as a transfer to a reserve, is made out of profit already found.'),
  mc(PM, 'medium', 'A firm creates a provision for doubtful debts of ₹10,000. What is the effect?',
    'Profit falls by ₹10,000 and debtors are shown ₹10,000 lower in the balance sheet',
    [
      ['Profit is unchanged, because only the debtors figure is adjusted', 'Left out the debit to the Profit and Loss Account; the provision is a charge.'],
      ['Cash falls by ₹10,000', 'A provision is a book entry; no cash goes out.'],
      ['Profit rises by ₹10,000 because the debtors are now safe', 'Reversed the effect: a charge lowers profit.'],
    ],
    'The charge is debited to the Profit and Loss Account, and the provision is deducted from the debtors.'),
  mc(PM, 'medium', 'A provision for discount on debtors is made to cover:',
    'The discount the business expects to allow to debtors who pay promptly',
    [
      ['Debtors who will not pay at all', 'That is the provision for doubtful debts.'],
      ['Discount that was allowed to debtors during the year', 'That is an actual expense, Discount Allowed, not a provision.'],
      ['The discount the business expects to receive from creditors', 'Prudence provides for expected losses, not expected gains such as discount from creditors.'],
    ],
    'The expected discount is a likely loss, so it is charged now against profit.'),
  tf(PM, 'easy', 'The exact amount of a provision may not be known when it is created; it is an estimate.', true,
    'That is the nature of a provision: the liability or loss is known or likely, but its amount has to be estimated.'),
  mc(PM, 'medium', 'A provision for repairs and renewals is created to:',
    'Spread the cost of heavy repairs expected in later years over the years that benefit',
    [
      ['Pay for the repairs done during the year', 'Repairs done are an actual expense, debited to Repairs A/c.'],
      ['Strengthen the financial position of the firm', 'That is the purpose of a reserve, not a provision.'],
      ['Increase the value of the building', 'A provision does not add to the value of an asset.'],
    ],
    'The cost will certainly arise, so it is charged year by year through a provision.'),
  ar(PM, 'medium', 'A provision for doubtful debts is created even in a year when the firm earns no profit.',
    'A provision is a charge against profit to meet a likely loss.', 'a',
    'Because a provision is a charge made to find the profit, it is made whatever the profit turns out to be.'),
];

// --- Reserves ----------------------------------------------------------------------------------------------------

const RM = 'pr-reserve-meaning';

const reserves: Question[] = [
  mc(RM, 'easy', 'A reserve is best described as:',
    'A part of the profit set aside, and not paid out, to strengthen the business or meet future needs',
    [
      ['A charge against profit to meet a likely loss', 'That describes a provision.'],
      ['A liability owed to outsiders', 'A reserve belongs to the owner, not to outsiders.'],
      ['The cash kept in the safe', 'A reserve is a balance in the books, not a sum of cash.'],
    ],
    'A reserve is an appropriation of profit that stays in the business.'),
  mc(RM, 'easy', 'A reserve is created out of:',
    'Profits of the business',
    [
      ['Fresh capital brought in by the owner', 'Capital brought in is not profit; a reserve is made from profit.'],
      ['A loan from the bank', 'A loan is a liability and has nothing to do with profit.'],
      ['Charges made against profit', 'Charges are provisions, which reduce profit; a reserve comes out of the profit left.'],
    ],
    'A reserve is made from profits: trading profit for a revenue reserve, capital profit for a capital reserve.'),
  mc(RM, 'easy', 'Where is a general reserve shown in the balance sheet?',
    'On the liabilities side, along with the owner\'s capital',
    [
      ['As a deduction from debtors on the assets side', 'That is where a provision for doubtful debts is shown.'],
      ['As an expense in the Profit and Loss Account', 'A reserve is an appropriation of profit, not an expense.'],
      ['On the assets side as cash in hand', 'A reserve is not cash; it is part of the owner\'s funds.'],
    ],
    'A reserve belongs to the owner, so it is shown with the capital.'),
  mc(RM, 'medium', 'Which of these is a benefit of creating reserves?',
    'The business can meet future losses or expand using its own funds',
    [
      ['It raises the profit of the year in which it is created', 'Setting aside uses profit; it does not raise it.'],
      ['It brings extra cash into the business', 'A reserve is a book entry; no cash comes in.'],
      ['It reduces the owner\'s funds', 'Reserves are part of the owner\'s funds and add to the capital base.'],
    ],
    'Reserves strengthen the business and reduce its need to borrow.'),
  tf(RM, 'easy', 'A reserve can be created only if the business has earned a profit.', true,
    'A reserve is an appropriation of profit, so there must be profit to appropriate.'),
  tf(RM, 'easy', 'A reserve is a liability to outsiders.', false,
    'A reserve belongs to the owner. It is part of the owner\'s funds, shown with the capital.'),
  tf(RM, 'medium', 'Creating a reserve means that a separate sum of cash is put aside.', false,
    'A reserve is a balance in the books. The cash may well have been spent on assets.'),
  mc(RM, 'easy', 'Which of these amounts is a reserve?',
    'Net profit kept back in the business to pay for a new showroom later',
    [
      ['An amount charged against profit for heavy repairs the building will need', 'This is a provision (for repairs and renewals), a charge against profit.'],
      ['Salaries for March that are still unpaid at the year end', 'This is an outstanding expense, a liability for an expense already incurred.'],
      ['An amount charged against profit for debtors who may not pay', 'This is a provision (for doubtful debts), a charge against profit.'],
    ],
    'Profit already found and kept back in the business is a reserve. The other three are deducted before the profit is found.'),
  mc(RM, 'medium', 'A sole trader\'s net profit for the year is ₹2,00,000. Instead of adding all of it to capital, the trader transfers ₹50,000 to General Reserve and adds ₹1,50,000 to capital. Compared with adding the whole ₹2,00,000 to capital, the owner\'s total funds (capital plus reserves) are:',
    'The same: ₹50,000 is only shown under General Reserve instead of under capital',
    [
      ['₹50,000 higher', 'Counted the reserve as something extra; it is part of the same ₹2,00,000 of profit.'],
      ['₹50,000 lower', 'Treated the transfer as a loss or a withdrawal; the amount stays in the business and belongs to the owner.'],
      ['The same, and cash is ₹50,000 higher', 'A transfer to reserve is a book entry and does not bring in cash.'],
    ],
    'The transfer changes where the owner\'s claim is shown, not how big it is: ₹1,50,000 + ₹50,000 = ₹2,00,000 either way.'),
  ar(RM, 'medium', 'Reserves strengthen the financial position of a business.',
    'A reserve is shown on the liabilities side of the balance sheet.', 'b',
    'Both statements are true, but R does not explain A. Reserves strengthen the business because profit is kept in it and can later meet losses or pay for expansion; where the reserve is shown is not the reason.'),
];

// --- Provision versus reserve ------------------------------------------------------------------------------------

const PD = 'pr-difference';

const distinguish: Question[] = [
  mc(PD, 'medium', 'Which feature belongs to a provision and not to a reserve?',
    'It is a charge against profit',
    [
      ['It is made only when there is a profit', 'That is a feature of a reserve.'],
      ['It is shown along with the owner\'s capital', 'That is where a reserve is shown.'],
      ['It is made at the owner\'s discretion', 'A reserve is optional; a provision is not.'],
    ],
    'A provision is debited to the Profit and Loss Account before the net profit is found.'),
  mc(PD, 'medium', 'Which feature belongs to a reserve and not to a provision?',
    'It is an appropriation of profit',
    [
      ['It is made to meet a known liability or a likely loss', 'That is the purpose of a provision.'],
      ['It must be made even if there is a loss', 'That is true of a provision, not of a reserve.'],
      ['It is deducted from the asset it relates to', 'That is how a provision such as that for doubtful debts is shown.'],
    ],
    'A reserve is an appropriation: it is taken out of the net profit after that profit has been found, so it does not reduce the net profit. The other three options describe a provision, which is made to meet a known liability or a likely loss, must be made whether or not there is profit, and is deducted from the asset it relates to.'),
  mc(PD, 'medium', 'Which of these is a correct point of difference between a provision and a reserve?',
    'A provision reduces the profit of the year; a reserve is made after the profit is found',
    [
      ['A provision is made at the owner\'s choice; a reserve is compulsory', 'Reversed: a provision is compulsory and a reserve is optional.'],
      ['A provision is shown with capital; a reserve is deducted from assets', 'Reversed: a reserve is shown with capital and a provision is deducted from the asset.'],
      ['A provision strengthens the business; a reserve meets a known liability', 'Reversed the purposes of the two.'],
    ],
    'In every row of the comparison the provision and the reserve sit on opposite sides.'),
  mc(PD, 'medium', 'Which of these is NOT a point of difference between a provision and a reserve?',
    'Both are shown in the balance sheet',
    [
      ['One is a charge against profit and the other is an appropriation of profit', 'This is a real difference, so it is not the answer.'],
      ['One must be made and the other is optional', 'This is a real difference, so it is not the answer.'],
      ['One is for a known liability or likely loss and the other strengthens the business', 'This is a real difference, so it is not the answer.'],
    ],
    'Both appear in the balance sheet; that is a similarity, not a difference.'),
  mc(PD, 'medium', 'Which of these can still be made in a year when the firm has a loss?',
    'A provision for doubtful debts',
    [
      ['A transfer to General Reserve out of that year\'s profit', 'There is no profit to appropriate, so no reserve can be made out of it.'],
      ['Both can be made', 'A reserve needs profit.'],
      ['Neither can be made', 'A provision is a charge and is made whatever the result.'],
    ],
    'A provision for doubtful debts is a charge made in finding the profit, so it is made whatever the result of the year, profit or loss: the likely loss on debtors exists either way. A transfer to General Reserve is an appropriation out of the year\'s profit, and in a year of loss there is no profit to appropriate.'),
  mc(PD, 'easy', 'After the net profit has been found, which of these is deducted from it?',
    'Transfer to General Reserve',
    [
      ['Provision for doubtful debts', 'This is deducted before the net profit is found.'],
      ['Depreciation', 'This is deducted before the net profit is found.'],
      ['Bad debts', 'This is deducted before the net profit is found.'],
    ],
    'Only appropriations such as a transfer to reserve come after the net profit.'),
  tf(PD, 'easy', 'A provision is shown on the liabilities side along with the owner\'s capital.', false,
    'A reserve is shown with capital. A provision is deducted from the related asset (or shown as a liability).'),
  tf(PD, 'medium', 'Both a provision and a transfer to a reserve reduce the net profit shown by the Profit and Loss Account.', false,
    'Only the provision does. A transfer to a reserve is made after the net profit is found.'),
  tf(PD, 'medium', 'A provision may be shown as a deduction from the asset it relates to, while a reserve forms part of the owner\'s funds.', true,
    'That is how they are presented: provision for doubtful debts against debtors, reserves with capital.'),
  mc(PD, 'medium', 'A firm earns a profit of ₹1,00,000 before any provision. It creates a provision for doubtful debts of ₹10,000 and transfers ₹20,000 to General Reserve. What net profit does the Profit and Loss Account show?',
    '₹90,000',
    [
      ['₹1,00,000', 'Ignored the provision, which is a charge against profit.'],
      ['₹70,000', 'Also deducted the transfer to reserve, which comes after the net profit.'],
      ['₹80,000', 'Deducted the transfer instead of the provision.'],
    ],
    'Net profit = ₹1,00,000 - ₹10,000 = ₹90,000. The ₹20,000 is taken out of it afterwards, leaving ₹70,000.'),
  mc(PD, 'medium', 'A firm has a Provision for Doubtful Debts of ₹6,000 and a General Reserve of ₹6,000. Which statement about the balance sheet is correct?',
    'The provision is deducted from debtors, and the reserve is shown with the owner\'s capital',
    [
      ['Both are shown with the owner\'s capital', 'A provision is not part of the owner\'s funds.'],
      ['Both are deducted from debtors', 'Only the provision is deducted from debtors.'],
      ['The reserve is deducted from debtors and the provision is shown with capital', 'Reversed the two.'],
    ],
    'A provision reduces an asset; a reserve belongs to the owner.'),
  ar(PD, 'medium', 'A transfer to General Reserve does not reduce the net profit shown by the Profit and Loss Account.',
    'A transfer to a reserve is an appropriation of profit.', 'a',
    'An appropriation is made out of the net profit, after it has been found, so the net profit itself is unchanged.'),
  ar(PD, 'medium', 'A reserve can be created only when the business earns a profit.',
    'A reserve is created to meet a known liability.', 'c',
    'A is true because a reserve is an appropriation of profit. R is false: meeting a known liability is the purpose of a provision.'),
  ar(PD, 'medium', 'A provision for doubtful debts is shown as a deduction from debtors in the balance sheet.',
    'Provision for depreciation is a charge against profit.', 'b',
    'Both statements are true, but R does not explain A: the deduction is shown because the provision reduces what the debtors are worth, not because depreciation is a charge.'),
];

// --- Revenue and capital reserves ---------------------------------------------------------------------------------

const RC = 'pr-revenue-capital';

const revcap: Question[] = [
  mc(RC, 'easy', 'Which of these is a capital profit?',
    'Profit on the sale of a building',
    [
      ['Profit on the sale of goods in the ordinary course of business', 'This is a revenue profit.'],
      ['Commission received from customers', 'This is an ordinary income of the business, a revenue profit.'],
      ['Discount received from suppliers', 'This is an ordinary gain of the business, a revenue profit.'],
    ],
    'A gain on selling or revaluing a fixed asset is a capital profit; it does not come from trading.'),
  mc(RC, 'easy', 'A capital reserve is created out of:',
    'Capital profits, such as a gain on selling a fixed asset',
    [
      ['Profit from normal trading', 'That makes a revenue reserve.'],
      ['Capital brought in by the owner', 'Capital brought in is the owner\'s investment, not a profit.'],
      ['Bad debts recovered', 'This is an ordinary income of the business.'],
    ],
    'A capital reserve is made from capital profits, which do not arise from trading: a gain on selling or revaluing a fixed asset, and for companies also the premium on issuing shares or debentures and the profit on reissuing forfeited shares. Profit from normal trading makes a revenue reserve, and capital brought in or bad debts recovered are not capital profits.'),
  mc(RC, 'easy', 'A revenue reserve is created out of:',
    'Profits from the normal activities of the business',
    [
      ['Profit on the sale of land', 'That is a capital profit.'],
      ['The surplus on revaluing a building', 'That is a capital profit.'],
      ['A bank loan received', 'A loan is a liability and not a profit.'],
    ],
    'General Reserve and the specific reserves made from trading profit are revenue reserves.'),
  mc(RC, 'medium', 'Which of these is a revenue reserve?',
    'General Reserve',
    [
      ['A reserve made from the profit on selling an old machine', 'That profit is a capital profit, so the reserve is a capital reserve.'],
      ['A reserve made from the surplus on revaluing a building', 'That surplus is a capital profit, so the reserve is a capital reserve.'],
      ['Provision for depreciation', 'This is a provision, a charge against profit.'],
    ],
    'General Reserve is made by transferring part of the profit of normal trading, so it is a revenue reserve. A reserve made from a profit on selling an old machine or from a surplus on revaluing a building comes from a capital profit, so it is a capital reserve; and provision for depreciation is a charge against profit, not a reserve at all.'),
  tf(RC, 'medium', 'The surplus on revaluing a building upwards is a capital profit and not a profit from trading.', true,
    'It arises from a change in the value of a fixed asset, not from selling goods or services.'),
  tf(RC, 'easy', 'A reserve made out of the profit on selling an old building is a revenue reserve.', false,
    'The profit on selling a fixed asset is a capital profit, so the reserve made from it is a capital reserve.'),
  mc(RC, 'medium', 'Which pairing is correct?',
    'Surplus on revaluing a building: capital reserve. Trading profit set aside: revenue reserve',
    [
      ['Surplus on revaluing a building: revenue reserve. Trading profit set aside: capital reserve', 'Swapped the two kinds of reserve.'],
      ['Both are capital reserves', 'Only the surplus on the building is a capital profit.'],
      ['Both are revenue reserves', 'The surplus on revaluation is a capital profit, so its reserve is not a revenue reserve.'],
    ],
    'Ask where each profit came from. The surplus on revaluing a building arises from a change in the value of a fixed asset, a capital profit, so it goes to a capital reserve. Profit earned by trading and set aside goes to a revenue reserve, such as General Reserve. The size of the amount has nothing to do with it.'),
  mc(RC, 'medium', 'A firm earns a trading profit of ₹2,00,000 and a profit of ₹50,000 on selling land. It transfers ₹30,000 of trading profit to General Reserve and keeps the ₹50,000 profit on the land in a separate reserve. Which statement is correct?',
    'The ₹30,000 is a revenue reserve and the ₹50,000 is a capital reserve',
    [
      ['Both reserves are revenue reserves', 'The profit on the sale of land is a capital profit.'],
      ['Both reserves are capital reserves', 'The ₹30,000 comes from trading profit, so it is a revenue reserve.'],
      ['The ₹30,000 is a capital reserve and the ₹50,000 is a revenue reserve', 'Swapped the two: trading profit makes a revenue reserve, the profit on land a capital one.'],
    ],
    'Look at where each profit came from: trading, or the sale of a fixed asset.'),
  ar(RC, 'medium', 'The profit on the sale of land can be kept in a Capital Reserve.',
    'A profit on the sale of a fixed asset is a capital profit.', 'a',
    'Capital reserves are made from capital profits, and a gain on selling a fixed asset is one.'),
];

// --- General and specific reserves ---------------------------------------------------------------------------------

const GS = 'pr-general-specific';

const genspec: Question[] = [
  mc(GS, 'easy', 'A general reserve is a reserve that is:',
    'Created without any particular purpose',
    [
      ['Created only to pay compensation to workers', 'That is a specific reserve.'],
      ['Created only from capital profits', 'That is a capital reserve.'],
      ['Deducted from the debtors', 'That is how a provision is shown, not a reserve.'],
    ],
    'A general reserve has no stated purpose and can be used for any need of the business.'),
  mc(GS, 'easy', 'A specific reserve is a reserve that is:',
    'Created for a stated purpose and used only for that purpose',
    [
      ['Created for no particular purpose', 'That is a general reserve.'],
      ['Charged against profit before the net profit is found', 'That describes a provision.'],
      ['Hidden from the balance sheet', 'That describes a secret reserve.'],
    ],
    'A specific reserve is kept for a purpose named when it is made, such as the Workmen Compensation Reserve or the Investment Fluctuation Reserve, and is used only for it. A reserve with no named purpose is a general reserve; a charge made before the net profit is found is a provision; a hidden one is a secret reserve.'),
  mc(GS, 'easy', 'Which of these is a specific reserve?',
    'Investment Fluctuation Reserve',
    [
      ['General Reserve', 'A general reserve has no particular purpose.'],
      ['Provision for doubtful debts', 'This is a provision, not a reserve.'],
      ['Secret reserve', 'A secret reserve is a hidden reserve, not one made for a stated purpose.'],
    ],
    'The Investment Fluctuation Reserve is kept for a named purpose.'),
  mc(GS, 'medium', 'An Investment Fluctuation Reserve is created to:',
    'Meet a fall in the market value of investments',
    [
      ['Pay for the purchase of new investments', 'It guards against a fall in value; it does not pay for purchases.'],
      ['Pay compensation to workers', 'That is the purpose of the Workmen Compensation Reserve.'],
      ['Meet the loss from debtors who may not pay', 'That is the purpose of the provision for doubtful debts, which is a charge and not a reserve.'],
    ],
    'The amount is kept back out of profit in case the investments lose value.'),
  mc(GS, 'medium', 'Besides charging depreciation, a trader keeps back ₹40,000 of the net profit in a reserve meant only for buying a new delivery van when the present one is worn out. The ₹40,000 is:',
    'A specific reserve',
    [
      ['A general reserve', 'A general reserve has no stated purpose; this one has.'],
      ['A provision for depreciation', 'Depreciation is charged against profit for the wear of the present van; this amount is kept back out of the net profit.'],
      ['A capital reserve', 'A capital reserve comes from a capital profit; this comes out of the ordinary profit of the year.'],
    ],
    'It is an appropriation of profit kept for a named purpose, so it is a specific reserve.'),
  tf(GS, 'easy', 'A specific reserve can be used for any purpose of the business.', false,
    'A specific reserve is kept for a stated purpose and is used only for that purpose.'),
  tf(GS, 'medium', 'A reserve set aside for possible future claims of workers, when no claim has yet arisen, is a specific reserve.', true,
    'It has a named purpose and is made out of profit, so it is a specific reserve (Workmen Compensation Reserve).'),
  mc(GS, 'medium', 'The Workmen Compensation Reserve is created to meet:',
    'Possible claims for compensation for accidents to workers',
    [
      ['Wages that are already due to workers', 'Wages due are an outstanding expense, a liability, not a reserve.'],
      ['A fall in the market value of investments', 'That is the Investment Fluctuation Reserve.'],
      ['The cost of replacing old machinery', 'That would be a reserve for replacement; it is not what this reserve is for.'],
    ],
    'Its purpose is named: compensation for accidents to workers.'),
  ar(GS, 'easy', 'General Reserve is a specific reserve.',
    'A specific reserve is created for a stated purpose.', 'd',
    'A is false: General Reserve has no stated purpose, which is exactly why it is not a specific reserve. R is true.'),
];

// --- Secret reserves ----------------------------------------------------------------------------------------------

const SR = 'pr-secret';

const secret: Question[] = [
  mc(SR, 'easy', 'A secret reserve is a reserve that is:',
    'Not shown in the balance sheet, because assets are shown too low or liabilities too high',
    [
      ['Kept in a locked cash box', 'A secret reserve is not cash; it is hidden in the valuation of assets and liabilities.'],
      ['Shown separately along with the capital', 'A secret reserve is not disclosed at all.'],
      ['Created from capital profits only', 'That describes a capital reserve.'],
    ],
    'The reserve lies hidden in undervalued assets or overvalued liabilities.'),
  mc(SR, 'medium', 'Which of these creates a secret reserve?',
    'Charging the cost of a new machine to Repairs A/c',
    [
      ['Valuing the closing stock above its cost', 'That overstates profit and hides a loss; it is the opposite.'],
      ['Not charging depreciation on machinery', 'That overstates profit and the asset value; it is the opposite.'],
      ['Making no provision for a doubtful debtor', 'That overstates profit and debtors; it is the opposite.'],
    ],
    'A capital item written off as an expense lowers the profit, and the machine does not appear in the balance sheet: a hidden surplus.'),
  mc(SR, 'medium', 'Which of these is a ground for objecting to secret reserves?',
    'They hide the true profit and financial position of the business',
    [
      ['They show a profit higher than the true profit', 'They show a lower profit.'],
      ['They are always shown as a separate liability', 'They are hidden, not shown.'],
      ['They have to be paid out in cash', 'They are not cash.'],
    ],
    'Profit and assets are shown below their real figures, so the accounts mislead.'),
  tf(SR, 'medium', 'A secret reserve is shown as a separate item on the liabilities side of the balance sheet.', false,
    'A secret reserve is not disclosed. It exists only as an undervaluation of assets or an overvaluation of liabilities.'),
  mc(SR, 'medium', 'Charging far more depreciation on machinery than its wear and tear justifies results in:',
    'Profit understated and the machinery undervalued, creating a secret reserve',
    [
      ['Profit overstated and the machinery overvalued', 'Excess depreciation does the opposite: it lowers profit and asset value.'],
      ['Profit overstated and the machinery undervalued', 'Higher depreciation lowers profit, not raises it.'],
      ['No effect on profit', 'Depreciation is a charge against profit.'],
    ],
    'The extra depreciation lowers profit and the asset, hiding a surplus.'),
  tf(SR, 'complex', 'A firm shows this year\'s closing stock ₹10,000 below its correct value. If next year\'s closing stock is valued correctly, next year\'s profit will be ₹10,000 more than it would have been without the undervaluation.', true,
    'This year\'s closing stock is next year\'s opening stock. It is ₹10,000 too low, so next year\'s cost of goods sold is ₹10,000 lower and that year\'s profit ₹10,000 higher. The secret reserve only shifts profit from one year to the next.'),
  mc(SR, 'easy', 'Which of these can give rise to a secret reserve?',
    'Showing assets at less than their real value',
    [
      ['Showing assets at more than their real value', 'That overstates profit and hides a loss.'],
      ['Leaving out a liability that really exists', 'That overstates profit; a secret reserve needs liabilities to be shown too high.'],
      ['Valuing closing stock above cost', 'That overstates profit.'],
    ],
    'A secret reserve comes from undervalued assets or overvalued liabilities.'),
  ar(SR, 'medium', 'Valuing the closing stock below both its cost and its market price creates a secret reserve.',
    'The stock and the profit of the year are then shown at less than their true amounts, and the difference is not disclosed.', 'a',
    'Stock should be shown at cost or market price, whichever is lower. Showing it lower still understates the asset and the profit, and that hidden difference is the secret reserve.'),
  ar(SR, 'medium', 'Secret reserves are shown openly in the balance sheet.',
    'Secret reserves arise when assets are undervalued.', 'd',
    'A is false: a secret reserve is hidden and not shown. R is true.'),
];

// --- Provision for doubtful debts ------------------------------------------------------------------------------------

const PP = 'pr-pdd';

const pdd: Question[] = [
  mc(PP, 'easy', 'A provision for doubtful debts is normally calculated on:',
    'The debtors that remain after bad debts have been written off',
    [
      ['The total sales of the year', 'The provision covers debtors, not all sales.'],
      ['The debtors before the bad debts are written off', 'Bad debts are already losses, so they are removed before the provision is worked.'],
      ['The creditors', 'The provision is for what customers owe, not what the business owes.'],
    ],
    'Write off the bad debts first; the provision is for the debtors that are left.'),
  mc(PP, 'medium', 'Which statement correctly separates bad debts from a provision for doubtful debts?',
    'Bad debts are losses that have actually occurred; the provision is an estimate of losses that are only likely',
    [
      ['Bad debts are an estimate; the provision is an actual loss', 'Reversed.'],
      ['Bad debts go to the balance sheet and the provision goes to the Profit and Loss Account', 'Both are charged in the Profit and Loss Account.'],
      ['There is no difference between them', 'One is a loss already suffered and the other is for losses still to come.'],
    ],
    'A debtor who cannot pay is a bad debt. A debtor who may not pay is a doubtful debt.'),
  mc(PP, 'medium', 'The provision for discount on debtors is worked out on:',
    'Debtors left after deducting bad debts and the provision for doubtful debts',
    [
      ['All the debtors, before any deduction', 'Debtors who are bad or doubtful will not claim discount.'],
      ['Debtors after bad debts but before the provision for doubtful debts', 'The doubtful debtors are not expected to pay, so they are deducted as well.'],
      ['The sales of the year', 'The provision is made on debtors, not on sales.'],
    ],
    'Only debtors thought to be good will pay in time and claim the discount, so bad debts and the provision for doubtful debts are both deducted first.'),
  mc(PP, 'medium', 'No bad debts arose during the year, and the new provision for doubtful debts is smaller than the old one. The difference is:',
    'Credited to the Profit and Loss Account (written back)',
    [
      ['Debited to the Profit and Loss Account as a further loss', 'Reversed: the excess is a gain.'],
      ['Added to the debtors', 'The debtors are not affected by a change in the provision.'],
      ['Left unchanged in the provision account', 'The provision account must show the amount needed now.'],
    ],
    'With no bad debts to meet, the old provision has only the new provision to cover, so the excess is no longer needed and goes back to profit. Had there been bad debts, they would be met first: only a surplus over the bad debts and the new provision together is written back.'),
  mc(PP, 'medium', 'In the entry that creates a provision for doubtful debts, which account is debited?',
    'Profit and Loss A/c',
    [
      ['Sundry Debtors A/c', 'The debtors are not debited or credited; they stay in the books at the full amount.'],
      ['Provision for Doubtful Debts A/c', 'That account is credited: the provision is created there.'],
      ['Bad Debts A/c', 'Bad Debts A/c is debited when a debt is actually lost, not for a loss that is only likely.'],
    ],
    'The entry is Profit and Loss A/c Dr; To Provision for Doubtful Debts A/c. The provision is a charge against the profit of the year.',
    ['A provision is a charge against profit.', 'Bad Debts A/c is for debts that are actually lost; the provision is for those that are only doubtful.']),
  tf(PP, 'medium', 'Debtors are ₹50,000, of which ₹2,000 is still to be written off as bad. A provision for doubtful debts at 10% on debtors will be ₹5,000.', false,
    'Bad debts are written off first: ₹50,000 - ₹2,000 = ₹48,000, and 10% of ₹48,000 is ₹4,800.',
    ['Is the provision worked before or after the bad debts are written off?', 'Provision = Rate x (Debtors - Further bad debts).']),
  tf(PP, 'medium', 'When a provision for doubtful debts is created, the debtors account is reduced in the ledger.', false,
    'The debtors stay at full value in the ledger. The provision is a separate account, shown as a deduction in the balance sheet.'),
  mc(PP, 'medium', 'Debtors are ₹1,00,000, including a bad debt of ₹10,000 that is to be written off. A provision of 5% is to be made on the remaining debtors. At what amount are the debtors shown in the balance sheet?',
    '₹85,500',
    [
      ['₹95,000', 'Worked the provision on the full ₹1,00,000 and forgot to write off the bad debt.'],
      ['₹90,000', 'Wrote off the bad debt but forgot to deduct the provision.'],
      ['₹95,500', 'Worked the provision correctly on ₹90,000 but deducted it from the full ₹1,00,000, leaving the bad debt in the debtors.'],
    ],
    '₹1,00,000 - ₹10,000 = ₹90,000. Provision = 5% of ₹90,000 = ₹4,500. Shown at ₹90,000 - ₹4,500 = ₹85,500.'),
  ar(PP, 'medium', 'A provision for doubtful debts is created on the debtors that remain after bad debts are written off.',
    'Debtors written off as bad are no longer debtors, so they cannot be doubtful.', 'a',
    'Debtors already written off are gone from the books; only the ones that remain can still turn out bad.'),
  ar(PP, 'medium', 'If there are no bad debts and the provision for doubtful debts now needed is smaller than the old provision, the profit of the year rises by the difference.',
    'A provision that is no longer needed is written back to the Profit and Loss Account.', 'a',
    'The excess of the old provision over the amount now needed is credited to the Profit and Loss Account, and that credit is what raises the profit.'),
];

// --- Provision for depreciation -----------------------------------------------------------------------------------------

const DP = 'pr-depn-provision';

const depn: Question[] = [
  mc(DP, 'easy', 'Under the provision for depreciation method, the year\'s depreciation is credited to:',
    'Provision for Depreciation A/c, and the asset stays at its cost',
    [
      ['The asset account, which reduces the asset directly', 'That is the direct method; here the asset stays at cost.'],
      ['The Capital A/c', 'Depreciation is a charge and does not go to capital.'],
      ['Cash A/c', 'No cash is paid for depreciation.'],
    ],
    'Depreciation A/c is debited and Provision for Depreciation A/c is credited.'),
  mc(DP, 'medium', 'Under this method the asset appears in the balance sheet:',
    'At cost, with the provision for depreciation deducted from it',
    [
      ['At cost only, with nothing deducted', 'The provision must be deducted to show the asset\'s present value.'],
      ['At the amount of the provision', 'The provision is only the depreciation so far, not the asset\'s value.'],
      ['At cost plus the provision', 'Depreciation lowers the asset\'s value; it is not added.'],
    ],
    'Under this method the asset account keeps the original cost, and the depreciation of every year so far is gathered in Provision for Depreciation A/c. In the balance sheet the asset is shown at cost with the provision deducted from it, which gives its book value: machinery costing ₹5,00,000 with a provision of ₹2,00,000 is shown at ₹5,00,000 less ₹2,00,000 = ₹3,00,000.'),
  tf(DP, 'easy', 'Depreciation is a charge against profit.', true,
    'It is debited to the Profit and Loss Account, like any other expense of the year.'),
  tf(DP, 'medium', 'When an asset is sold and an Asset Disposal Account is opened, the provision for depreciation relating to that asset is transferred to the Asset Disposal Account.', true,
    'The asset goes out at cost and its accumulated depreciation is taken out of the provision along with it.'),
  ar(DP, 'medium', 'When a Provision for Depreciation A/c is kept, the asset account continues to show the original cost.',
    'Under this method no depreciation is charged against profit until the asset is sold.', 'c',
    'A is true: each year\'s depreciation is credited to Provision for Depreciation A/c and not to the asset account. R is false: depreciation is still charged against profit every year.'),
];

// --- Amounts and entries --------------------------------------------------------------------------------------------

const amounts: Question[] = [
  num(PP, 'easy', 'Debtors at the end of the year are ₹2,40,000. A provision for doubtful debts of 5% is required. What is the amount of the provision?',
    12000,
    [
      [228000, 'Gave the debtors left after the provision instead of the provision.'],
      [1200000, 'Multiplied by the rate without dividing by 100.'],
    ],
    ['Provision = Debtors x Rate. No further bad debts are given, so the rate applies to all the debtors.', '₹2,40,000 x 5/100 = ₹12,000.', 'It is charged to the Profit and Loss Account, and the debtors are shown at ₹2,40,000 - ₹12,000 = ₹2,28,000 in the balance sheet.']),
  num(PP, 'medium', 'Debtors are ₹1,00,000. Further bad debts of ₹5,000 are to be written off and a provision of 6% made on the remaining debtors. The old provision is ₹3,000 and there were no earlier bad debts. What is the total charged to the Profit and Loss Account for bad debts and provision, after crediting the old provision?',
    7700,
    [
      [10700, 'Forgot to credit the old provision.'],
      [8000, 'Worked the new provision on the full debtors of ₹1,00,000, not on the ₹95,000 that remain.'],
      [2700, 'Left out the bad debts.'],
    ],
    ['Debtors left = ₹1,00,000 - ₹5,000 = ₹95,000. New provision = 6% of ₹95,000 = ₹5,700.', 'Charge = ₹5,000 + ₹5,700 - ₹3,000 = ₹7,700.']),
  num(RM, 'easy', 'General Reserve stands at ₹80,000 at the start of the year. The net profit for the year is ₹4,50,000, of which 10% is transferred to General Reserve. What is the General Reserve at the end of the year?',
    125000,
    [
      [45000, 'Gave only the transfer and forgot the opening balance.'],
      [530000, 'Added the whole profit instead of the 10% transferred.'],
      [35000, 'Deducted the transfer from the opening balance instead of adding it.'],
    ],
    ['Transfer = ₹4,50,000 x 10/100 = ₹45,000.', 'Closing balance = ₹80,000 + ₹45,000 = ₹1,25,000.']),
  num(DP, 'medium', 'Machinery costing ₹5,00,000 is depreciated at 10% a year on cost (straight line), and the depreciation is credited to a Provision for Depreciation A/c. What is the balance of the provision after 4 years?',
    200000,
    [
      [50000, 'Gave one year\'s depreciation only.'],
      [300000, 'Gave the book value of the machinery instead of the provision.'],
      [250000, 'Counted five years of depreciation instead of four.'],
    ],
    ['Depreciation each year = ₹5,00,000 x 10/100 = ₹50,000.', 'After 4 years = ₹50,000 x 4 = ₹2,00,000.']),
  num(RC, 'medium', 'A plot of land that cost ₹3,00,000 is sold for ₹4,10,000, and the profit is transferred to a Capital Reserve. What is the amount transferred?',
    110000,
    [
      [410000, 'Took the whole sale price instead of the gain.'],
      [300000, 'Gave the cost of the land.'],
    ],
    ['Capital profit = Sale price - Cost.', '₹4,10,000 - ₹3,00,000 = ₹1,10,000.']),
  num(PP, 'complex', 'Debtors are ₹2,10,000. Bad debts of ₹10,000 are to be written off. A provision for doubtful debts of 5% is to be made on the remaining debtors, and a provision for discount on debtors of 2% on the debtors left after deducting both the bad debts and the provision for doubtful debts. What is the provision for discount on debtors?',
    3800,
    [
      [4000, 'Worked the discount on the debtors after bad debts but before deducting the provision for doubtful debts.'],
      [4200, 'Worked the discount on the full debtors of ₹2,10,000.'],
      [10000, 'Gave the provision for doubtful debts instead of the one for discount.'],
    ],
    ['Debtors after bad debts = ₹2,10,000 - ₹10,000 = ₹2,00,000.', 'Provision for doubtful debts = 5% of ₹2,00,000 = ₹10,000.', 'Debtors for discount = ₹2,00,000 - ₹10,000 = ₹1,90,000; 2% = ₹3,800.']),
  journal(DP, 'easy', 'Depreciation of ₹18,000 on machinery is to be provided for the year. The machinery is kept at cost and the depreciation is recorded in a Provision for Depreciation A/c. Pass the entry.',
    [
      { accountId: 'depreciation', side: 'Dr', amount: 1800000 },
      { accountId: 'provisionForDepreciation', side: 'Cr', amount: 1800000 },
    ],
    ['machinery', 'repairs', 'cash'],
    'Depreciation is an expense, so Depreciation A/c is debited. The credit goes to Provision for Depreciation A/c and the machinery stays at cost.'),
  mc(PP, 'medium', 'Debtors at the year end, after writing off all bad debts, are ₹1,50,000. A provision for doubtful debts is to be created for the first time, at 5% of the debtors. Which entry records it?',
    'Profit and Loss A/c Dr ₹7,500; To Provision for Doubtful Debts A/c ₹7,500',
    [
      ['Profit and Loss A/c Dr ₹7,500; To Sundry Debtors A/c ₹7,500', 'Credited the debtors; they stay in the books at the full amount and the provision is kept in its own account.'],
      ['Provision for Doubtful Debts A/c Dr ₹7,500; To Profit and Loss A/c ₹7,500', 'Reversed the entry: this would write a provision back to profit, not create one.'],
      ['Profit and Loss A/c Dr ₹1,42,500; To Provision for Doubtful Debts A/c ₹1,42,500', 'Took the debtors left after the provision as the amount of the provision.'],
    ],
    'Provision = 5% of ₹1,50,000 = ₹7,500. It is a charge against profit, so the Profit and Loss Account is debited and Provision for Doubtful Debts A/c is credited.',
    ['Work out 5% of the debtors first.', 'A provision is charged to the Profit and Loss Account and credited to its own account.']),
  mc(PP, 'medium', 'Provision for Doubtful Debts A/c shows ₹12,000 brought forward. No bad debts arose during the year, and only ₹8,000 is needed on the debtors at the year end. Which entry is passed?',
    'Provision for Doubtful Debts A/c Dr ₹4,000; To Profit and Loss A/c ₹4,000',
    [
      ['Profit and Loss A/c Dr ₹4,000; To Provision for Doubtful Debts A/c ₹4,000', 'Reversed the entry: the account holds more than is needed, so the excess goes back to profit.'],
      ['Profit and Loss A/c Dr ₹8,000; To Provision for Doubtful Debts A/c ₹8,000', 'Charged the provision needed in full and ignored the larger balance already in the account.'],
      ['Provision for Doubtful Debts A/c Dr ₹12,000; To Profit and Loss A/c ₹12,000', 'Wrote back the whole old provision and left nothing for the debtors that are still doubtful.'],
    ],
    'The excess is ₹12,000 - ₹8,000 = ₹4,000. It is written back: the provision account is debited and the Profit and Loss Account is credited, which raises the profit.',
    ['Compare the balance in the account with the amount needed now.', 'A provision that is no longer needed is written back to the Profit and Loss Account.']),
];

const questions: Question[] = [...meaning, ...reserves, ...distinguish, ...revcap, ...genspec, ...secret, ...pdd, ...depn, ...amounts];

const ids = (qs: Question[]): string[] => qs.map((q) => q.id);

// ---------------------------------------------------------------------------------------------------------------
// Ladder
// ---------------------------------------------------------------------------------------------------------------

const EASY_CLASSIFY = [
  'pr-provision-or-reserve',
  'pr-charge-or-appropriation',
  'pr-feature-belongs',
  'pr-which-statement',
  'pr-which-reduces-profit',
  'pr-secret-reserve',
  'pr-revenue-or-capital',
];
const EASY_AMOUNTS = ['pr-pdd-amount', 'pr-reserve-transfer', 'pr-depr-provision-balance', 'pr-journal-depr-provision'];
const GUIDED = ['pr-pdd-after-bad-debts', 'pr-pdd-amount', 'pr-journal-depr-provision'];
const MEDIUM_RESERVES = ['pr-general-or-specific', 'pr-named-reserve', 'pr-count-charges', 'pr-capital-profit', 'pr-reserve-balance', 'pr-profit-from-reserve'];
const MEDIUM_PDD = ['pr-pdd-pl-charge', 'pr-pdd-writeback', 'pr-debtors-net', 'pr-pdd-rate', 'pr-journal-create-pdd'];
const COMPLEX = [
  'pr-profit-statement',
  'pr-pdd-pl-charge-debtors',
  'pr-pdd-net-credit',
  'pr-pdd-discount',
  'pr-profit-after-both',
  'pr-depr-two-assets',
  'pr-journal-pdd-excess',
];

// The templates of the practice levels as the ladder first had them, in the order it took them: the mixed and the
// challenge levels name them explicitly, so the levels added below (which reuse templates) change neither of them,
// nor the Look back level, which draws on the mixed level.
const FIRST_PRACTICE = [...new Set([...EASY_CLASSIFY, ...EASY_AMOUNTS, ...GUIDED, ...MEDIUM_RESERVES, ...MEDIUM_PDD, ...COMPLEX])];

// In the quality pass the seven "Quick quiz" levels of recall questions (levels 8 to 14, made by `withQuizLevels`)
// were cut to three. Four themed levels now stand at levels 8 to 11: each asks the recall questions of one theme and
// then practice on it, with a complex template among them so that the ladder keeps them after level 7. The questions
// still unlisted (27) make three quick quizzes at levels 12 to 14, so the mixed level stays level 15 and the challenge
// level 16: no level id changes.
const THEMED: { title: string; description: string; questions: Question[]; templateIds: string[]; count: number }[] = [
  {
    title: 'Revenue and Capital Reserves, in Depth',
    description: 'Where each profit comes from decides the reserve: recall questions, then practice with amounts.',
    questions: revcap,
    templateIds: ['pr-revenue-or-capital', 'pr-capital-profit', 'pr-profit-after-both'],
    count: 4,
  },
  {
    title: 'Secret Reserves and Reserve Amounts',
    description: 'How a hidden reserve arises and what it does to profit, then transfers to reserve and the profit left.',
    questions: secret,
    templateIds: ['pr-secret-reserve', 'pr-reserve-balance', 'pr-profit-from-reserve', 'pr-profit-statement'],
    count: 4,
  },
  {
    title: 'Doubtful Debts in Depth',
    description: 'Bad debts first, then the provision; when the old provision is written back and when it is not.',
    questions: pdd,
    templateIds: ['pr-pdd-pl-charge', 'pr-pdd-writeback', 'pr-pdd-net-credit', 'pr-pdd-discount', 'pr-journal-pdd-excess'],
    count: 4,
  },
  {
    title: 'Provision for Depreciation and Worked Amounts',
    description: 'The asset kept at cost and the provision beside it, and amounts worked out step by step.',
    questions: [...depn, ...amounts],
    templateIds: ['pr-depr-provision-balance', 'pr-journal-depr-provision', 'pr-depr-two-assets'],
    count: 3,
  },
];

const levels = buildLadder(T, {
  concept: {
    title: 'Setting Profit Aside',
    description: 'See why a business sets amounts aside, and why some come before profit and some after it.',
    lesson: [
      {
        type: 'text',
        heading: 'Why set anything aside?',
        body: 'A business earns profit in a year, but it also knows that some of its debtors may not pay and that its machines are wearing out. Prudent accounting lets the year bear these likely losses. A business may also choose to keep part of its profit inside instead of paying it all out.',
      },
      {
        type: 'text',
        heading: 'A provision is charged against profit',
        body: 'A provision is an amount charged to the Profit and Loss Account for a liability or loss that is known or likely, though its exact amount is not. It comes before the net profit is found, so it lowers the profit. Provision for doubtful debts and for depreciation are the usual ones.',
      },
      {
        type: 'text',
        heading: 'A reserve is taken out of profit',
        body: 'A reserve is a part of profit that has already been found and is kept back in the business to make it stronger. It is an appropriation, made only when there is profit and at the owner\'s choice. It does not lower the net profit and it belongs to the owner.',
      },
      {
        type: 'example',
        title: 'Providing ₹10,000 for depreciation',
        lines: [
          { accountId: 'depreciation', side: 'Dr', amount: 1000000 },
          { accountId: 'provisionForDepreciation', side: 'Cr', amount: 1000000 },
        ],
        note: 'Depreciation is a charge against profit, so it is debited. The credit goes to the provision account and the asset stays at cost.',
      },
      {
        type: 'text',
        heading: 'One test to tell them apart',
        body: 'Ask when the amount is deducted. Before the net profit is found, to meet a likely loss: a provision. After the net profit is found, to keep the profit in the business: a reserve. Reserves are further split into revenue and capital (by where the profit came from) and general and specific (by whether a purpose is named).',
      },
      { type: 'check', questionId: meaning[0].id },
      { type: 'check', questionId: meaning[7].id },
      {
        type: 'text',
        heading: 'Worked examples: from the simplest to a board question',
        body: 'The examples below take one firm through the year end. Each works in the order an examiner expects: the bad debts first, then the provision for doubtful debts on what is left, then the provision for discount on the debtors expected to pay, and only after the net profit is found, the transfer to a reserve.',
      },
      {
        type: 'working',
        title: 'Sharma Electricals, 31 March: doubtful debts and discount, step by step',
        lines: [
          'Given: sundry debtors ₹2,10,000; further bad debts ₹10,000; provision for doubtful debts 5%; provision for discount on debtors 2%; old Provision for Doubtful Debts ₹6,000 (no old provision for discount).',
          'Bad debts first, because they are losses that have already happened: debtors left = ₹2,10,000 - ₹10,000 = ₹2,00,000.',
          'New provision for doubtful debts on the debtors left: 5% of ₹2,00,000 = ₹10,000.',
          'Debtors expected to pay = ₹2,00,000 - ₹10,000 = ₹1,90,000. Provision for discount: 2% of ₹1,90,000 = ₹3,800.',
          'Charge for bad debts and doubtful debts = Further bad debts + New provision - Old provision = ₹10,000 + ₹10,000 - ₹6,000 = ₹14,000.',
          'Charge for the provision for discount = ₹3,800 (there was none before). Total debited to the Profit and Loss Account = ₹14,000 + ₹3,800 = ₹17,800.',
          'Balance sheet: debtors ₹2,10,000 less bad debts ₹10,000, less provision ₹10,000, less provision for discount ₹3,800 = ₹1,86,200.',
        ],
        note: 'Watch out: the 2% is not taken on ₹2,10,000 (₹4,200) or on ₹2,00,000 (₹4,000). A debtor who may never pay will never claim a discount for paying early.',
      },
      {
        type: 'table',
        title: 'Sharma Electricals: the same figures in the final accounts',
        rows: [
          { label: 'Profit and Loss Account (debit side)' },
          { label: 'Bad debts (further)', amount: '₹10,000' },
          { label: 'Add: New provision for doubtful debts', amount: '₹10,000' },
          { label: 'Less: Old provision for doubtful debts', amount: '(6,000)' },
          { label: 'Bad debts and provision, one item', amount: '₹14,000', total: true },
          { label: 'Provision for discount on debtors', amount: '₹3,800' },
          { label: 'Balance Sheet (assets side)' },
          { label: 'Sundry debtors', amount: '₹2,10,000' },
          { label: 'Less: Bad debts', amount: '(10,000)' },
          { label: 'Less: Provision for doubtful debts', amount: '(10,000)' },
          { label: 'Less: Provision for discount on debtors', amount: '(3,800)' },
          { label: 'Debtors shown at', amount: '₹1,86,200', total: true },
        ],
        note: 'The provisions are deducted from the debtors on the assets side. They are never shown on the liabilities side.',
      },
      {
        type: 'example',
        title: 'Sharma Electricals brings its provision to ₹10,000 after setting off the further bad debts',
        lines: [
          { accountId: 'profitAndLoss', side: 'Dr', amount: 1400000 },
          { accountId: 'provisionForDoubtfulDebts', side: 'Cr', amount: 1400000 },
        ],
        note: 'As in the rest of this topic, the bad debts are first set off against the provision (Provision for Doubtful Debts A/c Dr ₹10,000; To Bad Debts A/c ₹10,000). The old ₹6,000 cannot meet them: the account is left ₹4,000 short, a debit balance. To bring it to the ₹10,000 now needed, ₹4,000 + ₹10,000 = ₹14,000 is charged, the same ₹14,000 as in the Profit and Loss Account above. (Where the bad debts are closed straight to the Profit and Loss Account instead, only ₹10,000 - ₹6,000 = ₹4,000 is added to the provision, and the total charge is still ₹14,000.) Watch out: the debtors themselves are not credited.',
      },
      {
        type: 'working',
        title: 'Write back, or charge? Two years at Kaveri Stores',
        lines: [
          'Year 1: old provision ₹12,000; no bad debts arose; new provision needed ₹9,000.',
          'The old provision has nothing to meet but the new one: ₹12,000 - ₹9,000 = ₹3,000 is no longer needed and is written back (credited to the Profit and Loss Account).',
          'Year 2: old provision ₹12,000; bad debts of the year ₹5,000; new provision needed ₹9,000.',
          'The old provision must meet the bad debts first and then the new provision: ₹5,000 + ₹9,000 = ₹14,000 is needed against ₹12,000 held.',
          'Net charge = ₹5,000 + ₹9,000 - ₹12,000 = ₹2,000, debited to the Profit and Loss Account. Nothing is written back.',
        ],
        note: 'Watch out: a new provision smaller than the old one does not by itself mean a write-back. Write back only when the old provision is more than the bad debts and the new provision together.',
      },
      {
        type: 'table',
        title: 'Charge first, then the reserve: Patel Agro Inputs',
        rows: [
          { label: 'Profit before the provision for doubtful debts', amount: '₹4,20,000' },
          { label: 'Less: Provision for doubtful debts (a charge)', amount: '(20,000)' },
          { label: 'Net profit', amount: '₹4,00,000', total: true },
          { label: 'Less: Transfer to General Reserve, 10% (an appropriation)', amount: '(40,000)' },
          { label: 'Added to the owner\'s capital', amount: '₹3,60,000', total: true },
          { label: 'Separately: land costing ₹3,00,000 sold for ₹3,75,000' },
          { label: 'Capital profit kept in a Capital Reserve', amount: '₹75,000' },
        ],
        note: 'Watch out: the 10% is taken on the net profit after the provision (₹4,00,000), not on ₹4,20,000. The gain on the land is a capital profit, so it goes to a capital reserve and not to General Reserve.',
      },
      {
        type: 'working',
        title: 'A provision for depreciation over three years: Lakshmi Printers',
        lines: [
          'A printing machine is bought on 1 April for ₹4,00,000 and kept at cost; depreciation is 10% a year on cost (straight line), credited to Provision for Depreciation A/c.',
          'Each year: Depreciation A/c Dr ₹40,000; To Provision for Depreciation A/c ₹40,000. Depreciation A/c is then closed to the Profit and Loss Account.',
          'After three years the provision holds ₹40,000 x 3 = ₹1,20,000; the Machinery A/c still shows ₹4,00,000.',
          'Balance sheet: Machinery ₹4,00,000 less Provision for Depreciation ₹1,20,000 = ₹2,80,000.',
        ],
        note: 'Watch out: the provision is the depreciation of all the years so far, not of the last year only, and it is deducted from the asset, not shown as a liability.',
      },
    ],
  },
  cards: {
    title: 'Provisions and Reserves: Rules and Formulas',
    description: 'Recall the definitions, the differences and the formulas.',
    cardIds: cards.map((c) => c.id),
  },
  recognition: [
    {
      title: 'Distinguish: Provision or Reserve?',
      description: 'Choices, true or false, and assertion-and-reason on the points of difference.',
      questionIds: [
        ...ids(meaning).slice(0, 6),
        ...ids(reserves).slice(0, 4),
        ...ids(distinguish).slice(0, 8),
      ],
    },
  ],
  practice: [
    {
      title: 'Provision or Reserve? Easy Practice',
      description: 'Classify items, and try the first amounts.',
      templateIds: [...EASY_CLASSIFY, ...EASY_AMOUNTS],
      count: 10,
    },
    {
      title: 'Provision for Doubtful Debts (Guided)',
      description: 'Write off the bad debts first, then apply the rate to what remains.',
      templateIds: GUIDED,
      count: 6,
      guided: true,
    },
    {
      title: 'Kinds of Reserve and Reserve Amounts',
      description: 'General or specific, revenue or capital, and transfers to reserve.',
      templateIds: MEDIUM_RESERVES,
      count: 8,
    },
    {
      title: 'Doubtful Debts: Charge, Write-back and Balance Sheet',
      description: 'What is charged to profit, what is written back and how debtors are shown.',
      templateIds: MEDIUM_PDD,
      count: 8,
    },
    {
      title: 'Complex Provisions and Reserves',
      description: 'Several steps at once: charges and appropriations together, discount on debtors, depreciation provisions.',
      templateIds: COMPLEX,
      count: 8,
    },
    // Levels 8 to 11 (see THEMED above); their questions are added just below, after the ladder is built.
    ...THEMED.map(({ title, description, templateIds, count }) => ({ title, description, templateIds, count })),
  ],
  mixed: { title: 'Mixed Practice', description: 'Everything in this topic, shuffled the way an exam serves it.', count: 12, templateIds: FIRST_PRACTICE },
  challenge: { title: 'Challenge: Provisions and Reserves', description: 'The hardest questions in the topic, mixed together.', count: 8, templateIds: COMPLEX },
  // "Journalise the following transactions": dated entries of one business. These levels come after every other one
  // and have ids of their own, so the ids of the levels above never move.
  sets: [
    {
      title: 'Journalise Provisions and a Reserve',
      description: 'One business, three to five dated entries: charges against profit and an appropriation at a year end, and bad debts with the provision for doubtful debts over two years.',
      templateIds: ['pr-set-year-end-charges-and-reserve', 'pr-set-doubtful-debts-two-years'],
      count: 4,
    },
  ],
  // The accounts themselves, prepared row by row, under the convention the set on doubtful debts states.
  formats: [
    {
      title: 'Prepare Bad Debts A/c and the Provision Account',
      description: 'Bad Debts A/c of a year, closed against the provision or to Profit and Loss A/c, Provision for Doubtful Debts A/c for two years, and the Profit and Loss Account and Balance Sheet in extract with the provisions for doubtful debts and for discount.',
      templateIds: ['pr-fmt-bad-debts', 'pr-fmt-doubtful-debts', 'pr-fmt-provisions-extract', 'pr-fmt-provisions-extract-discount'],
      count: 4,
    },
  ],
});

// The themed levels (8 to 11) ask their recall questions before their practice.
const themedLevels = levels.map((l) => {
  const theme = THEMED.find((t) => t.title === l.title);
  return theme ? { ...l, questionIds: ids(theme.questions) } : l;
});

// ---------------------------------------------------------------------------------------------------------------
// A reserve and a reserve fund, added after the check against the CBSE 2025-26 syllabus: a level of its own after
// every other level, with an id of its own, so no level a learner has passed moves.
// ---------------------------------------------------------------------------------------------------------------

const fundQuestions: Question[] = [
  tf('pr-reserve-meaning', 'easy', 'True or false: a reserve fund is a reserve whose amount is invested outside the business in securities earmarked for it.', true,
    'True. That investment is what turns a reserve into a reserve fund; a reserve whose amount stays in the business is a reserve only.'),
  ar('pr-reserve-meaning', 'medium', 'A General Reserve whose amount is used as working capital is not a reserve fund.',
    'A reserve becomes a reserve fund only when its amount is invested outside the business.', 'a',
    'Both are true, and R gives the reason for A: the money of this General Reserve is used in the business, not invested outside it.'),
  mc('pr-reserve-meaning', 'medium', 'Gopal Electricals has a Loan Repayment Reserve of ₹2,00,000 and has invested ₹2,00,000 in government bonds kept for that purpose. How do the two appear in its balance sheet?',
    'The reserve fund with the owner\'s funds, and the bonds among the investments on the assets side', [
      ['Only the bonds, on the assets side', 'Left out the reserve fund itself, which stands with the owner\'s funds.'],
      ['The reserve fund deducted from the bonds', 'A reserve fund is not set off against its investments; each is shown on its own side.'],
      ['The reserve fund as a current liability', 'A reserve fund belongs to the owner; it is owed to no outsider.'],
    ], 'A reserve fund appears twice: the fund with the reserves, and its earmarked investments among the assets.'),
];

// Capital profits as NCERT lists them, added in the quality pass on a level of their own (`capital-profits`).
const capitalQuestions: Question[] = [
  mc(RC, 'medium', 'Which of these is NOT a capital profit?',
    'Profit on goods sold during the year',
    [
      ['Premium received by a company on the issue of its shares', 'This is a capital profit: it comes from raising capital, not from trading.'],
      ['Profit on the revaluation of a building', 'This is a capital profit: it comes from a change in the value of a fixed asset.'],
      ['Profit made by a company on the reissue of forfeited shares', 'This is a capital profit: it arises from the share capital of the company, not from trading.'],
    ],
    'Profit on goods sold comes from the normal trading of the business, so it is a revenue profit and may go to a revenue reserve such as General Reserve. The other three are capital profits, which do not arise from trading and are kept in a capital reserve.'),
  tf(RC, 'medium', 'True or false: profit earned by a company before its incorporation is a capital profit.', true,
    'True. The company did not exist when that profit was earned, so it cannot be a trading profit of the company. It is a capital profit and is kept in a capital reserve, as are the premium on shares and debentures, the profit on reissue of forfeited shares, the profit on redemption of debentures and the gain on selling or revaluing fixed assets.'),
  mc(RC, 'medium', 'Kisan Agro Inputs sold an old godown that had cost ₹4,00,000 for ₹5,20,000 and earned a trading profit of ₹2,60,000 in the same year. How much may be kept in a capital reserve?',
    '₹1,20,000',
    [
      ['₹5,20,000', 'Took the whole sale price as the profit; only the gain over the cost is a capital profit.'],
      ['₹3,80,000', 'Added the trading profit to the gain; trading profit is a revenue profit.'],
      ['₹2,60,000', 'Took the trading profit as a capital profit.'],
    ],
    'Capital profit = ₹5,20,000 - ₹4,00,000 = ₹1,20,000. It comes from selling a fixed asset, so it may be kept in a capital reserve. The trading profit of ₹2,60,000 is a revenue profit and is not part of it.'),
  ar(RC, 'medium', 'A capital reserve is not made out of the profit of normal trading.',
    'A capital reserve is made out of capital profits, such as a gain on selling a fixed asset.', 'a',
    'Both are true, and R explains A: the source of a capital reserve is a capital profit, which by its nature does not come from normal trading.'),
];

const pack: TopicPack = {
  topicId: T,
  concepts,
  cards,
  levels: [
    ...themedLevels,
    ...laterLevels(T, levels, [
      {
        name: 'reserve-fund',
        type: 'medium_practice',
        title: 'A Reserve and a Reserve Fund',
        description: 'When a reserve becomes a reserve fund, how the two differ, and the total of the reserve funds in a balance sheet.',
        questionIds: fundQuestions.map((q) => q.id),
        generate: { templateIds: ['pr-reserve-fund-which', 'pr-reserve-fund-difference', 'pr-reserve-fund-amount'], count: 6 },
      },
      {
        name: 'capital-profits',
        type: 'medium_practice',
        title: 'Capital Profits and the Capital Reserve',
        description: 'The capital profits NCERT lists, told apart from the revenue profits of normal trading, and the reserve each goes to.',
        questionIds: capitalQuestions.map((q) => q.id),
        generate: { templateIds: ['pr-capital-profit-kinds', 'pr-revenue-or-capital', 'pr-capital-profit'], count: 6 },
      },
      {
        name: 'assertion-reason',
        type: 'medium_practice',
        title: 'Assertion and Reason',
        description: 'Two statements on this topic: decide whether each is true, and whether the Reason explains the Assertion.',
        generate: { templateIds: ['pr-assertion-reason'], count: 8 },
      },
    ]),
  ],
  questions: [...questions, ...fundQuestions, ...capitalQuestions],
};

export default pack;
