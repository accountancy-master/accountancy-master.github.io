import type { JournalLine } from '@/engine/journal';
import { buildLadder, laterLevels } from '../ladder';
import type { Card, Concept, Difficulty, JournalQuestion, McqQuestion, NumericQuestion, Question, RatioQuestion, TopicPack, TrueFalseQuestion } from '../types';

const T = 'partnership-fundamentals';

const concepts: Concept[] = [
  { id: 'pf-features', topicId: T, title: 'Features of partnership and the partnership deed' },
  { id: 'pf-no-deed', topicId: T, title: 'Rules in the absence of a deed' },
  { id: 'pf-capitals', topicId: T, title: 'Fixed and fluctuating capitals' },
  { id: 'pf-appropriation', topicId: T, title: 'Profit and Loss Appropriation Account' },
  { id: 'pf-ioc', topicId: T, title: 'Interest on capital' },
  { id: 'pf-iod', topicId: T, title: 'Interest on drawings' },
  { id: 'pf-salary-commission', topicId: T, title: "Salary, commission and interest on a partner's loan" },
  { id: 'pf-guarantee', topicId: T, title: 'Guarantee of profit' },
  { id: 'pf-past-adjustments', topicId: T, title: 'Past adjustments' },
  { id: 'pf-sets', topicId: T, title: 'Passing the entries of a year: charges, appropriations and a guarantee' },
  { id: 'pf-formats', topicId: T, title: 'Preparing the Appropriation Account, the partners\' accounts and a statement of adjustments' },
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
): Card => ({ id: `pf-card-${n}`, topicId: T, conceptId, kind, prompt, answer, explanation, example, commonMistake });

const cards: Card[] = [
  card(1, 'pf-features', 'rule', 'What is a partnership, and what must be present for one to exist?',
    'A relation between persons who have agreed to share the profits of a business carried on by all of them or by any of them acting for all. It needs two or more persons (at most 50), an agreement, a lawful business, sharing of its profits and mutual agency.',
    'Mutual agency means each partner is an agent who can bind the others and a principal who is bound by the others. The partners are together called a firm, which has no legal existence apart from them, and their liability for its debts is unlimited.',
    'Asha and Bilal agree to run a bakery together and share what it earns: that is a partnership, even if nothing is written down.',
    'Treating any sharing of income as partnership. Two co-owners who share the rent of a flat are not partners, because they carry on no business.'),
  card(2, 'pf-features', 'rule', 'What is a partnership deed, and what does it usually contain?',
    'The written agreement between the partners. It gives the names of the firm and the partners, the nature of the business, the capitals, the profit-sharing ratio, the rates of interest on capital, drawings and loans, salaries and commission, and what happens when a partner joins, leaves or dies.',
    'A deed is not compulsory, since an oral agreement is also valid, but a written deed is evidence of what was agreed and settles disputes.',
    'A deed says: capitals ₹3,00,000 and ₹2,00,000, profits in 3:2, interest on capital at 8% p.a., salary of ₹5,000 a month to one partner.',
    'Believing that a firm cannot exist without a written or registered deed.'),
  card(3, 'pf-no-deed', 'rule', 'What rules apply when there is no deed, or the deed is silent on a point?',
    'The Indian Partnership Act, 1932 applies: (1) profits and losses are shared equally; (2) no interest on capital; (3) no interest on drawings; (4) no salary or commission to any partner; (5) interest at 6% p.a. on a loan given by a partner to the firm.',
    'The Act fills only the gaps. Whatever the partners have agreed, in writing or orally, comes first.',
    'Capitals are ₹5,00,000 and ₹1,00,000 and there is no deed. A profit of ₹1,20,000 is shared ₹60,000 each, with no interest on capital.',
    'Sharing the profit in the ratio of capitals, or allowing 6% on capital. The 6% is only for a partner\'s loan.'),
  card(4, 'pf-capitals', 'rule', 'How do fixed and fluctuating capital accounts differ?',
    'Fixed: each partner has two accounts. The Capital A/c changes only when capital is brought in or permanently withdrawn; drawings, interest on capital and on drawings, salary, commission and the share of profit or loss go through the Current A/c. Fluctuating: one Capital A/c takes every item, so its balance changes every year.',
    'A fixed Capital A/c always shows a credit balance. A Current A/c may show a credit or a debit balance; a debit balance is shown on the assets side of the Balance Sheet.',
    'Fixed capital ₹4,00,000. Interest on capital ₹32,000, share of profit ₹90,000 and drawings ₹60,000 all go to the Current A/c; the Capital A/c stays at ₹4,00,000.',
    'Crediting interest on capital or the share of profit to a fixed Capital A/c.'),
  card(5, 'pf-appropriation', 'rule', 'What is the difference between a charge against profit and an appropriation of profit?',
    'A charge is an expense that must be met whether or not there is a profit: it is debited to Profit and Loss A/c. An appropriation is a way of sharing out the profit that is there: it is debited to Profit and Loss Appropriation A/c.',
    'Charges: interest on a partner\'s loan, rent paid to a partner, the manager\'s commission. Appropriations: interest on capital, a partner\'s salary or commission, a transfer to reserve, the shares of profit. Interest on capital becomes a charge only when the deed says so.',
    'Interest of ₹12,000 on a partner\'s loan is debited to Profit and Loss A/c. A partner\'s salary of ₹60,000 is debited to Profit and Loss Appropriation A/c.',
    'Showing interest on a partner\'s loan in Profit and Loss Appropriation A/c.'),
  card(6, 'pf-appropriation', 'format', 'What does a Profit and Loss Appropriation Account look like?',
    'Debit side: interest on capital, partners\' salaries, partners\' commission, transfer to General Reserve, and last the profit transferred to the partners\' Capital (or Current) Accounts in their ratio. Credit side: net profit brought from Profit and Loss A/c (after all charges) and interest on drawings.',
    'It is an extension of Profit and Loss A/c. What is left after the appropriations is the divisible profit.',
    'Net profit ₹3,00,000 and interest on drawings ₹4,000 on the credit side; interest on capital ₹30,000 and salary ₹60,000 on the debit side; divisible profit ₹2,14,000 shared in the ratio.',
    'Putting interest on drawings on the debit side, or starting from the profit before interest on a partner\'s loan.'),
  card(7, 'pf-appropriation', 'format', 'What are the journal entries for the appropriations?',
    'Interest on capital: Interest on Capital A/c Dr; To Partner\'s Capital (or Current) A/c. Salary or commission: Partner\'s Salary (or Commission) A/c Dr; To Partner\'s Capital (or Current) A/c. Each is then closed: Profit and Loss Appropriation A/c Dr; To Interest on Capital (Salary, Commission) A/c. Interest on drawings: Partner\'s Capital (or Current) A/c Dr; To Interest on Drawings A/c; then Interest on Drawings A/c Dr; To Profit and Loss Appropriation A/c. Share of profit: Profit and Loss Appropriation A/c Dr; To Partners\' Capital (or Current) A/cs.',
    'Use the Current A/c when capitals are fixed and the Capital A/c when they are fluctuating. A firm may instead pass each item straight through Profit and Loss Appropriation A/c without the separate accounts (for interest on capital: Profit and Loss Appropriation A/c Dr; To Partner\'s Capital or Current A/c). Both forms are accepted, and a question says which one it wants.',
    'Fixed capitals, salary ₹60,000 to Bilal: Partner\'s Salary A/c Dr 60,000; To Bilal\'s Current A/c 60,000. Then Profit and Loss Appropriation A/c Dr 60,000; To Partner\'s Salary A/c 60,000.',
    'Debiting the partner for salary, or crediting the partner for interest on drawings.'),
  card(8, 'pf-ioc', 'formula', 'How is interest on capital worked out?',
    'Interest = Capital x Rate/100 x Months/12, on the capital at the beginning of the year, plus interest on capital brought in during the year for the months it stayed, less interest on capital withdrawn for the months it was out.',
    'Each amount earns interest only for the time it was in the firm. Drawings made against the profit of the year do not reduce the capital on which interest is worked.',
    'Opening capital ₹4,00,000; ₹1,20,000 brought in on 1 October; 10% p.a.; year ends 31 March. Interest = ₹40,000 + ₹1,20,000 x 10/100 x 6/12 = ₹46,000.',
    'Giving a full year of interest on the closing capital.'),
  card(9, 'pf-ioc', 'shortcut', 'Only the closing capital is given. How is the opening capital found?',
    'Opening capital = Closing capital + Drawings + Interest on drawings + Capital withdrawn - Share of profit - Interest on capital, salary or commission credited - Fresh capital brought in during the year.',
    'Work backwards: undo every item entered in the capital account during the year, whatever it is. Interest is then taken on the opening capital, and on the fresh capital for its months.',
    'Closing capital ₹5,00,000 after drawings of ₹60,000 and a profit share of ₹90,000: opening capital = 5,00,000 + 60,000 - 90,000 = ₹4,70,000.',
    'Working the interest straight on the closing capital, or deducting the drawings and adding the profit.'),
  card(10, 'pf-ioc', 'rule', 'What if the profit is less than the interest on capital, or there is a loss?',
    'Interest on capital is an appropriation, so it comes only out of profit. Loss: no interest. Profit less than the interest due: the whole profit is given to the partners in the ratio of the interest due. Profit enough: interest in full. If the deed makes interest on capital a charge, it is allowed in full whatever the result, and the loss that follows is shared in the profit-sharing ratio.',
    'When the rate and the period are the same for all, the ratio of the interest due is the ratio of the capitals.',
    'Interest due ₹30,000 and ₹20,000; profit ₹40,000. The partners get ₹40,000 x 3/5 = ₹24,000 and ₹40,000 x 2/5 = ₹16,000.',
    'Sharing the short profit in the profit-sharing ratio, or allowing the interest in full and showing a loss when the deed does not make it a charge.'),
  card(11, 'pf-iod', 'formula', 'How is interest on drawings found by the product method?',
    'Multiply each withdrawal by the months from its date to the end of the year, add the products, and take Interest = Sum of products x Rate/100 x 1/12.',
    'A withdrawal on the 1st of a month counts that month; a withdrawal on the last day of a month does not.',
    'Year ends 31 March. ₹12,000 on 1 July (9 months) and ₹6,000 on 31 December (3 months): products 1,08,000 + 18,000 = 1,26,000. At 10% p.a.: 1,26,000 x 10/100 x 1/12 = ₹1,050.',
    'Counting the months from the beginning of the year to the withdrawal instead of from the withdrawal to the year end.'),
  card(12, 'pf-iod', 'shortcut', 'What is the average period for equal drawings at regular intervals through the whole year?',
    'Monthly: beginning 6.5 months, middle 6, end 5.5. Quarterly: beginning 7.5, middle 6, end 4.5. Half-yearly: beginning 9, middle 6, end 3. Interest = Total drawings x Rate/100 x Average period/12.',
    'Average period = (months for the first withdrawal + months for the last withdrawal) / 2. For drawings over part of a year, work it afresh from the first and last withdrawals actually made.',
    '₹5,000 at the beginning of every month, 12% p.a.: total ₹60,000 x 12/100 x 6.5/12 = ₹3,900.',
    'Using 6 months for every case, or applying the rate to one month\'s drawings instead of the total.'),
  card(13, 'pf-iod', 'rule', 'What if the dates of the drawings are not given?',
    'Interest is charged on the total drawings for six months, on the view that they were spread evenly over the year. Interest on drawings is charged only when the partners have agreed to it; with no agreement, none is charged.',
    'This applies when the rate is given per annum. Interest on drawings is a gain of the firm and is credited to Profit and Loss Appropriation A/c.',
    'Drawings ₹80,000 during the year, dates not known, 9% p.a.: ₹80,000 x 9/100 x 6/12 = ₹3,600.',
    'Charging the full twelve months when no date is given.'),
  card(14, 'pf-salary-commission', 'formula', 'How is a commission worked out as a percentage of net profit?',
    'Before charging the commission: Net profit x Rate/100. After charging the commission: Net profit x Rate/(100 + Rate). Anything to be charged first (a salary, say) is taken out of the net profit before either formula is used.',
    'After charging: the commission is the given percentage of what is left once the commission itself is taken out.',
    'Net profit ₹2,20,000, commission 10%. Before charging: ₹22,000. After charging: ₹2,20,000 x 10/110 = ₹20,000, which is 10% of the ₹2,00,000 left.',
    'Using Rate/100 when the deed says "after charging such commission".'),
  card(15, 'pf-salary-commission', 'rule', 'How are interest on a partner\'s loan and rent paid to a partner treated?',
    'Both are charges against profit, debited to Profit and Loss A/c and allowed even when there is a loss. The interest is at the agreed rate, or at 6% p.a. when nothing is agreed, for the months the loan was with the firm. Until it is paid, it is credited to the Partner\'s Loan A/c, not to the Capital or Current A/c.',
    'A partner who lends to the firm or lets a building to it deals with the firm as an outsider would. A partner\'s salary and commission, by contrast, are appropriations.',
    'Loan ₹2,00,000 given on 1 October, nothing agreed, year ends 31 March: ₹2,00,000 x 6/100 x 6/12 = ₹6,000. Interest on Partner\'s Loan A/c Dr 6,000; To Partner\'s Loan A/c 6,000.',
    'Crediting the interest to the partner\'s Capital A/c, or showing it in Profit and Loss Appropriation A/c.'),
  card(16, 'pf-guarantee', 'rule', 'How is a guarantee of minimum profit to a partner dealt with?',
    '1) Share the profit in the profit-sharing ratio. 2) Deficiency = guaranteed amount - the partner\'s share (none if the share is already enough). 3) Take the deficiency from whoever gave the guarantee: the other partners in their own profit-sharing ratio when the firm guarantees, one partner alone when that partner guarantees, or the other partners in the ratio the deed states. 4) Add it to the guaranteed partner.',
    'The guarantee sets only a minimum. If the partner\'s own share is higher, the partner keeps it.',
    'Profit ₹2,00,000 in 5:3:2; the third partner is guaranteed ₹50,000 by the firm. Share ₹40,000, deficiency ₹10,000, borne 5:3: ₹6,250 and ₹3,750. Final shares ₹93,750, ₹56,250, ₹50,000.',
    'Dividing the deficiency by the total of all three terms, or adjusting when there is no deficiency.'),
  card(17, 'pf-past-adjustments', 'format', 'How is an omission or a mistake of an earlier year set right?',
    'By one adjusting entry, without reopening the accounts. Make a table: (a) what each partner should have been credited with (the omitted interest on capital, salary and so on), (b) what was credited instead (the same total, shared as profit in the profit-sharing ratio), (c) the difference. The partner who received too much is debited and the partner who received too little is credited.',
    'With fixed capitals the entry is passed through the Current Accounts, with fluctuating capitals through the Capital Accounts. The debits always equal the credits.',
    'Interest on capital left out: ₹20,000 and ₹10,000; profits shared equally. Taken back: ₹15,000 each. Net: first partner ₹5,000 short, second ₹5,000 in excess. Entry: Second partner\'s Capital A/c Dr 5,000; To First partner\'s Capital A/c 5,000.',
    'Crediting the omitted item and forgetting to take back the profit that was shared in its place.'),
];

// ---------------------------------------------------------------------------------------------------------------
// Authored questions
// ---------------------------------------------------------------------------------------------------------------

const qid = (n: number): string => `pf-q-${String(n).padStart(3, '0')}`;

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
function mcq(n: number, conceptId: string, difficulty: Difficulty, prompt: string, correct: string, wrong: [string, string][], explanation: string, hints: string[]): McqQuestion {
  const all: { text: string; why?: string }[] = [...wrong.map(([text, why]) => ({ text, why }))];
  all.splice(n % (wrong.length + 1), 0, { text: correct });
  if (all.length === 4 && all.every((o) => arPlace(o.text) >= 0)) all.sort((x, y) => arPlace(x.text) - arPlace(y.text));
  const options = all.map((o, i) => ({ id: 'abcdefgh'[i], text: o.text, ...(o.why === undefined ? {} : { why: o.why }) }));
  return { id: qid(n), topicId: T, conceptId, difficulty, type: 'mcq', prompt, options, correct: options.find((o) => o.text === correct)!.id, hints, explanation };
}

const tf = (n: number, conceptId: string, difficulty: Difficulty, prompt: string, correct: boolean, explanation: string, hints: string[]): TrueFalseQuestion => ({
  id: qid(n), topicId: T, conceptId, difficulty, type: 'true_false', prompt, correct, hints, explanation,
});

const rs = (n: number): number => n * 100;

const num = (n: number, conceptId: string, difficulty: Difficulty, prompt: string, answer: number, errors: [number, string][], working: string[], hints: string[]): NumericQuestion => ({
  id: qid(n), topicId: T, conceptId, difficulty, type: 'numeric', unit: 'rupees', prompt, answer: rs(answer),
  commonErrors: errors.map(([value, why]) => ({ value: rs(value), why })), working, hints, explanation: working.join(' '),
});

const rat = (n: number, conceptId: string, difficulty: Difficulty, prompt: string, answer: number[], errors: [number[], string][], working: string[], hints: string[]): RatioQuestion => ({
  id: qid(n), topicId: T, conceptId, difficulty, type: 'numeric', unit: 'ratio', prompt, answer,
  commonErrors: errors.map(([value, why]) => ({ value, why })), working, hints, explanation: working.join(' '),
});

const jr = (n: number, conceptId: string, difficulty: Difficulty, prompt: string, lines: [string, 'Dr' | 'Cr', number][], extraChoices: string[], explanation: string, hints: string[]): JournalQuestion => {
  const expected: JournalLine[] = lines.map(([accountId, side, amount]) => ({ accountId, side, amount: rs(amount) }));
  return {
    id: qid(n), topicId: T, conceptId, difficulty, type: 'journal_entry', prompt, expected,
    accountChoices: [...new Set([...expected.map((l) => l.accountId), ...extraChoices, 'cash', 'bank'])].sort(), hints, explanation,
  };
};

const AR = 'Which of these is correct?';
const AR_BOTH = 'Both A and R are true, and R is the correct explanation of A';

const questions: Question[] = [
  // ---- Partnership, the deed and the Act ----
  mcq(1, 'pf-features', 'easy', 'Which of these best describes a partnership?',
    'A relation between persons who have agreed to share the profits of a business carried on by all or any of them acting for all',
    [
      ['A body registered under the Companies Act, 2013 that has a legal existence of its own', 'Described a company; a firm is not a legal person apart from its partners.'],
      ['A business owned and run by one person, who takes all the profit', 'Described a sole proprietorship; a partnership needs at least two persons.'],
      ['Persons who own a property together and share the income from it', 'Described co-ownership; without a business carried on by them there is no partnership.'],
    ],
    'Partnership needs persons, an agreement, a business, sharing of its profits and mutual agency.',
    ['Look for an agreement, a business and shared profits.', 'Each partner acts for all the others: mutual agency.']),
  tf(2, 'pf-features', 'easy', 'A partnership firm has a legal existence separate from that of its partners.', false,
    'A firm is only a name for the partners taken together. Unlike a company, it is not a separate legal person.',
    ['Compare a firm with a company.']),
  mcq(3, 'pf-features', 'easy', 'The persons who have entered into partnership with one another are called, one by one and all together:',
    'Partners, and a firm',
    [
      ['Members, and a company', 'Used the words for a company and its shareholders.'],
      ['Proprietors, and a concern', 'Used the words for a business owned by one person.'],
      ['Directors, and a board', 'Used the words for those who manage a company.'],
    ],
    'Individually they are partners; collectively they are a firm, and the name they trade under is the firm name.',
    ['The word for the group is also used for the business itself.']),
  tf(4, 'pf-features', 'medium', 'A partner who takes no part in running the business is still liable for the debts of the firm.', true,
    'The business may be carried on by any of the partners acting for all, and every partner is liable for the acts of the firm, whether active or not.',
    ['Think of mutual agency: who is bound by the acts of the active partners?']),
  mcq(5, 'pf-features', 'medium', 'Farah and Gopal are partners in a coaching centre. Gopal only put in money and never visits. Farah, acting for the firm, buys furniture for the centre on credit and the firm cannot pay. The supplier asks Gopal to pay. What is the position?',
    'Gopal is liable, because Farah acted as an agent of the firm and of every partner',
    [
      ['Gopal is not liable, because Gopal did not sign the order', 'Missed mutual agency: an act of one partner in the business of the firm binds all the partners.'],
      ['Gopal is liable only up to the capital Gopal put in', 'Gave a partner the limited liability of a shareholder; a partner\'s liability is unlimited.'],
      ['Only the firm is liable, not any partner personally', 'Treated the firm as a separate legal person; its debts are the debts of the partners.'],
    ],
    'Mutual agency makes each partner an agent of the others, and the liability of every partner is unlimited.',
    ['Who is bound when a partner acts in the ordinary business of the firm?']),
  mcq(6, 'pf-no-deed', 'easy', 'A partner has given a loan to the firm, and the deed says nothing about interest on it. The partner is entitled to interest at:',
    '6% p.a.',
    [
      ['Nil, because nothing was agreed', 'Applied the rule for capital to a loan; the Act itself gives interest on a partner\'s loan.'],
      ['The rate at which banks lend', 'Looked to the market rate; the Act fixes the rate at 6% p.a.'],
      ['12% p.a.', 'Doubled the rate; the Act fixes it at 6% p.a.'],
    ],
    'Under the Indian Partnership Act, 1932 a partner\'s loan carries interest at 6% p.a. when no rate has been agreed.',
    ['This is the one rate the Act itself lays down.']),
  tf(7, 'pf-no-deed', 'easy', 'When the deed is silent, a partner who has contributed more capital gets a larger share of the profit.', false,
    'Without an agreement on the ratio, profits and losses are shared equally, whatever the capitals.',
    ['What does the Act say about the ratio when nothing is agreed?']),
  mcq(8, 'pf-no-deed', 'medium', `Assertion (A): When there is no agreement on it, interest on a partner's loan is allowed at 6% p.a. even in a year in which the firm makes a loss. Reason (R): Interest on a partner's loan is a charge against profit, not an appropriation of profit. ${AR}`,
    AR_BOTH,
    [
      ['Both A and R are true, but R is not the correct explanation of A', 'Missed the link: it is because the interest is a charge that a loss does not stop it.'],
      ['A is true, but R is false', 'Took interest on a partner\'s loan for an appropriation; it is debited to Profit and Loss A/c as a charge.'],
      ['A is false, but R is true', 'Thought a loss stops the interest; a charge is due whatever the result of the year.'],
    ],
    'A charge has to be met whether or not there is a profit, which is exactly why the interest is due in a year of loss.',
    ['Does a charge depend on there being a profit?']),
  num(9, 'pf-no-deed', 'easy', 'Hema and Irfan are partners with no partnership deed. On 1 October 2024 Hema gave the firm a loan of ₹2,00,000 and asked for interest at 10% p.a., which Irfan did not accept. The year ends on 31 March 2025. How much interest is Hema entitled to for the year?', 6000,
    [[12000, 'Charged 6% for the whole year, although the loan was given on 1 October.'], [10000, 'Used the 10% that Hema asks for; without an agreement the rate is 6% p.a.'], [20000, 'Used 10% for the whole year: wrong rate and wrong period.']],
    ['No rate is agreed, so the loan carries 6% p.a.', '1 October 2024 to 31 March 2025 is 6 months.', 'Interest = ₹2,00,000 x 6/100 x 6/12 = ₹6,000.'],
    ['Which rate applies when nothing is agreed?', 'Count the months from the date of the loan to the year end.']),

  // ---- Capitals, the Appropriation Account and interest ----
  mcq(10, 'pf-capitals', 'easy', 'When capitals are fixed, a partner\'s share of the profit of the year is credited to:',
    'The partner\'s Current A/c',
    [
      ['The partner\'s Capital A/c', 'Changed a fixed capital; it changes only when capital is brought in or permanently withdrawn.'],
      ['The partner\'s Loan A/c', 'Treated the share of profit as money lent to the firm.'],
      ['The partner\'s Drawings A/c', 'Used the account that collects what the partner takes out, not what the partner earns.'],
    ],
    'With fixed capitals every yearly item, the share of profit included, goes through the Current A/c.',
    ['Which account is left untouched under the fixed method?']),
  tf(11, 'pf-capitals', 'easy', 'When capitals are fixed, a partner\'s Capital A/c can end the year with a debit balance because of heavy drawings.', false,
    'Drawings go to the Current A/c, not to the fixed Capital A/c, so the Capital A/c always shows a credit balance. It is the Current A/c that may show a debit balance.',
    ['Where are drawings recorded under the fixed method?']),
  mcq(12, 'pf-capitals', 'medium', 'Capitals are fixed. Which of these is entered in a partner\'s Capital A/c?',
    'Additional capital brought in by the partner',
    [
      ['Interest on the partner\'s capital', 'Interest on capital is a yearly item and goes to the Current A/c.'],
      ['The partner\'s drawings against profit', 'Drawings against profit are closed to the Current A/c.'],
      ['The partner\'s share of a loss', 'A share of profit or loss goes to the Current A/c.'],
    ],
    'A fixed Capital A/c records only capital brought in and capital permanently withdrawn.',
    ['Which item changes the capital invested itself?']),
  mcq(13, 'pf-capitals', 'medium', 'A partner\'s Current A/c shows a debit balance at the end of the year. Where does it appear in the Balance Sheet of the firm?',
    'On the assets side',
    [
      ['On the liabilities side, added to the partner\'s capital', 'Treated a debit balance as money the firm owes the partner; it is money the partner owes the firm.'],
      ['It is written off to Profit and Loss A/c', 'Treated the balance as a loss of the firm; it is still due from the partner.'],
      ['It is not shown at all', 'Left out a balance of the books; every balance is shown in the Balance Sheet.'],
    ],
    'A debit balance of a Current A/c means the partner has drawn more than the partner has earned, so the partner owes the firm: it is shown on the assets side.',
    ['Who owes whom when the balance is a debit one?']),
  mcq(14, 'pf-appropriation', 'easy', 'Why does a firm prepare a Profit and Loss Appropriation Account?',
    'To show how the net profit is shared out among the partners',
    [
      ['To find the gross profit of the year', 'Named the job of the Trading A/c.'],
      ['To find the net profit of the year', 'Named the job of the Profit and Loss A/c; the Appropriation A/c starts from the net profit.'],
      ['To show the assets and liabilities at the year end', 'Named the job of the Balance Sheet.'],
    ],
    'It takes the net profit from Profit and Loss A/c and shows the interest on capital, salaries, commission and shares of profit given out of it.',
    ['Its first entry on the credit side is the net profit itself.']),
  mcq(15, 'pf-appropriation', 'easy', 'Which of these is NOT shown in the Profit and Loss Appropriation Account?',
    'Interest on a loan given by a partner to the firm',
    [
      ['Interest on the partners\' capitals', 'Interest on capital is an appropriation and is shown on the debit side of the account.'],
      ['Salary allowed to a partner', 'A partner\'s salary is an appropriation and is shown on the debit side of the account.'],
      ['Interest charged on the partners\' drawings', 'Interest on drawings is shown on the credit side of the account.'],
    ],
    'Interest on a partner\'s loan is a charge against profit, so it is debited to Profit and Loss A/c before the net profit is found.',
    ['Which item would be due even in a year of loss?']),
  tf(16, 'pf-appropriation', 'medium', 'Rent paid to a partner for the use of the partner\'s building by the firm is an appropriation of profit.', false,
    'Rent is an expense of running the business, whoever the landlord is. It is a charge against profit, debited to Profit and Loss A/c.',
    ['Would the firm have to pay rent if the building belonged to an outsider?']),
  mcq(17, 'pf-appropriation', 'medium', `Assertion (A): Interest on drawings is credited to Profit and Loss Appropriation A/c. Reason (R): Interest on drawings is paid by the partners to the firm, so it adds to the profit that is available for the partners. ${AR}`,
    AR_BOTH,
    [
      ['Both A and R are true, but R is not the correct explanation of A', 'Missed the link: it is credited to the account because it adds to the profit to be shared.'],
      ['A is true, but R is false', 'Denied that interest on drawings is a gain of the firm from its partners.'],
      ['A is false, but R is true', 'Put interest on drawings on the debit side, with what the firm gives the partners.'],
    ],
    'Interest on drawings is a gain of the firm, which is why it sits on the credit side beside the net profit.',
    ['Who pays interest on drawings, and to whom?']),
  num(18, 'pf-ioc', 'easy', 'Jatin\'s capital in a firm was ₹4,00,000 throughout the year ended 31 March 2025. The deed allows interest on capital at 8% p.a. and the profit is more than enough. How much interest on capital is Jatin allowed?', 32000,
    [[16000, 'Charged six months, as for drawings whose dates are not known; the capital stayed all year.'], [24000, 'Used 6%, the rate the Act gives for a partner\'s loan; the deed gives 8% on capital.']],
    ['Interest on capital = ₹4,00,000 x 8/100 = ₹32,000 for the full year.'],
    ['The capital did not change during the year.']),
  mcq(19, 'pf-ioc', 'medium', 'A deed allows interest on capital at 10% p.a. and does not treat it as a charge. In a year in which the firm makes a net loss, how much interest on capital is allowed?',
    'None',
    [
      ['The full interest at 10% p.a.', 'Allowed an appropriation where there is no profit to appropriate.'],
      ['Half of the interest due', 'Invented a compromise; with a loss there is nothing to give.'],
      ['The interest due, shared in the profit-sharing ratio', 'Mixed up the case of a small profit with the case of a loss.'],
    ],
    'Interest on capital is an appropriation of profit. With a loss there is no profit, so no interest is allowed, and the loss is shared in the profit-sharing ratio.',
    ['Is there any profit to appropriate?']),
  num(20, 'pf-ioc', 'medium', 'Kavya and Lalit are partners. The deed allows interest on capital as an appropriation of profit. For the year, the interest due is ₹30,000 to Kavya and ₹20,000 to Lalit, but the net profit before interest is only ₹30,000. How much interest on capital is Kavya allowed?', 18000,
    [[30000, 'Allowed Kavya the interest in full, which would leave nothing for Lalit and ignores that the profit is short.'], [15000, 'Shared the profit equally; a short profit is given in the ratio of the interest due.']],
    ['Interest due is ₹50,000 but the profit is ₹30,000, so the profit is given in the ratio of the interest due, 3:2.', 'Kavya is allowed ₹30,000 x 3/5 = ₹18,000.'],
    ['Compare the profit with the total interest due.', 'A short profit is shared in the ratio of the interest due.']),
  mcq(21, 'pf-iod', 'easy', 'A partner withdraws a fixed amount at the beginning of every month of the year. On the total drawings, interest is charged for an average period of:',
    '6.5 months',
    [
      ['6 months', 'Used the period for drawings in the middle of every month, or with no dates.'],
      ['5.5 months', 'Used the period for drawings at the end of every month.'],
      ['12 months', 'Charged the whole year, as if everything had been withdrawn on the first day.'],
    ],
    'The first amount is out for 12 months and the last for 1 month: (12 + 1) / 2 = 6.5 months.',
    ['Average of the months for the first and the last withdrawal.']),
  num(22, 'pf-iod', 'medium', 'Mohan, a partner, withdrew ₹5,000 at the end of every month during the year ended 31 March 2025. Interest on drawings is charged at 12% p.a. Find the interest on Mohan\'s drawings for the year.', 3300,
    [[3600, 'Used six months, the period for drawings in the middle of every month.'], [3900, 'Used 6.5 months, the period for drawings at the beginning of every month.'], [7200, 'Charged the total for the whole year.']],
    ['Total drawings = ₹5,000 x 12 = ₹60,000.', 'Drawn at the end of every month: average period = (11 + 0) / 2 = 5.5 months.', 'Interest = ₹60,000 x 12/100 x 5.5/12 = ₹3,300.'],
    ['Find the total drawings first.', 'End of every month: 5.5 months.']),
  tf(23, 'pf-iod', 'easy', 'Interest is charged on a partner\'s drawings even when the partnership deed says nothing about it.', false,
    'Interest on drawings needs an agreement. When the deed is silent, none is charged.',
    ['Recall the rules that apply in the absence of a deed.']),
  mcq(24, 'pf-iod', 'medium', 'A partner withdraws the same amount at the end of every quarter of the year. On the total drawings, interest is charged for an average period of:',
    '4.5 months',
    [
      ['7.5 months', 'Used the period for drawings at the beginning of every quarter.'],
      ['6 months', 'Used the period for drawings in the middle of every quarter, or with no dates.'],
      ['5.5 months', 'Used the period for drawings at the end of every month.'],
    ],
    'The first amount is out for 9 months and the last for none: (9 + 0) / 2 = 4.5 months.',
    ['When is the first withdrawal made, and how long is it out?']),

  // ---- Commission, loans, guarantee and past adjustments ----
  num(25, 'pf-salary-commission', 'medium', 'Under the deed, Nidhi gets a commission of 10% of the net profit after charging such commission. The net profit before the commission is ₹2,20,000. What is Nidhi\'s commission?', 20000,
    [[22000, 'Took 10% of the profit before the commission; the deed says after charging it.'], [200000, 'Gave the profit left after the commission, not the commission.']],
    ['Commission after charging it = Net profit x Rate/(100 + Rate).', '₹2,20,000 x 10/110 = ₹20,000, which is 10% of the ₹2,00,000 that is left.'],
    ['"After charging" means the commission is a percentage of what remains.']),
  mcq(26, 'pf-salary-commission', 'medium', 'A firm pays a commission to its manager, who is an employee, and allows a commission to a partner under the deed. How are the two treated?',
    'The manager\'s commission is a charge against profit; the partner\'s commission is an appropriation of profit',
    [
      ['Both are charges against profit', 'Treated the partner\'s commission as a business expense; it is a share of profit given under the deed.'],
      ['Both are appropriations of profit', 'Treated the manager\'s commission as a share of profit; an employee is paid whether or not there is a profit.'],
      ['The manager\'s commission is an appropriation; the partner\'s commission is a charge', 'Reversed the two.'],
    ],
    'What is paid to an employee is an expense of the business. What is allowed to a partner under the deed comes out of the profit.',
    ['Which of the two is paid even in a year of loss?']),
  jr(27, 'pf-salary-commission', 'easy', 'Capitals are fixed. The firm records each appropriation in an account of its own before closing it to Profit and Loss Appropriation A/c. Omar, a partner, is allowed a salary of ₹60,000 for the year. Pass the entry that credits Omar with the salary.',
    [['partnersSalary', 'Dr', 60000], ['current:Omar', 'Cr', 60000]], ['capital:Omar', 'salaries', 'profitAndLossAppropriation'],
    'Partner\'s Salary A/c is debited with what the firm gives the partner. Capitals are fixed, so Omar\'s Current A/c, not the Capital A/c, is credited.',
    ['Is the salary given to the partner or owed by the partner?', 'Fixed capitals: which account takes the yearly items?']),
  jr(28, 'pf-iod', 'medium', 'Capitals are fluctuating. The firm records interest on drawings in Interest on Drawings A/c before closing that account to Profit and Loss Appropriation A/c. Interest on drawings of ₹2,400 is to be charged to Priya, a partner, for the year. Pass the entry that charges Priya with the interest.',
    [['capital:Priya', 'Dr', 2400], ['interestOnDrawings', 'Cr', 2400]], ['current:Priya', 'drawings:Priya', 'interestOnCapital', 'profitAndLossAppropriation'],
    'Priya owes the interest to the firm, so Priya\'s Capital A/c is debited (capitals are fluctuating). Interest on Drawings A/c, a gain of the firm, is credited.',
    ['Who owes this amount to whom?', 'Fluctuating capitals: only one account for each partner.']),
  mcq(29, 'pf-guarantee', 'medium', 'A partner is guaranteed a minimum share of profit "by the firm". Who bears a deficiency in that partner\'s share?',
    'The other partners, in their own profit-sharing ratio',
    [
      ['The partner to whom the guarantee is given', 'Made the guaranteed partner bear the shortfall, which would make the guarantee worthless.'],
      ['The other partners, always equally', 'Shared it equally; it follows the ratio in which the other partners share profits, unless the deed says otherwise.'],
      ['The partner with the largest capital', 'Brought in the capitals, which have nothing to do with a guarantee.'],
    ],
    'A guarantee by the firm is a guarantee by all the other partners together, so they bear the deficiency in the ratio in which they share profits among themselves.',
    ['"The firm" here means the partners other than the one guaranteed.']),
  num(30, 'pf-guarantee', 'medium', 'Qadir, Rekha and Suresh share profits in the ratio 5:3:2. The firm has guaranteed Suresh a share of profit of not less than ₹50,000 a year. The profit of the year available for distribution is ₹2,00,000. How much profit does Qadir finally get?', 93750,
    [[100000, 'Gave Qadir\'s share before the deficiency in Suresh\'s share was made good.'], [95000, 'Split the deficiency equally (or over all ten parts); Qadir and Rekha bear it in 5:3.'], [90000, 'Charged the whole deficiency to Qadir alone.']],
    ['Shares in 5:3:2: Qadir ₹1,00,000, Rekha ₹60,000, Suresh ₹40,000.', 'Deficiency = ₹50,000 - ₹40,000 = ₹10,000, borne by Qadir and Rekha in 5:3: ₹6,250 and ₹3,750.', 'Qadir finally gets ₹1,00,000 - ₹6,250 = ₹93,750.'],
    ['Share the profit first, then find the deficiency.', 'Qadir and Rekha bear it in 5:3, so Qadir bears 5/8 of it.']),
  mcq(31, 'pf-past-adjustments', 'complex', 'After the accounts were closed, a firm with fluctuating capitals found that interest on capital had been left out. The working shows that Tara should have been credited with interest of ₹10,000, and that ₹12,000 of the profit wrongly shared in its place had gone to Tara. In the adjusting entry, Tara\'s Capital A/c is:',
    'Debited with ₹2,000',
    [
      ['Credited with ₹2,000', 'Reversed the entry: Tara received ₹12,000 in place of ₹10,000, which is ₹2,000 too much.'],
      ['Credited with ₹10,000', 'Credited the interest but did not take back the profit that had been shared in its place.'],
      ['Debited with ₹12,000', 'Took back the profit but did not credit the interest Tara should have got.'],
    ],
    'Tara should have got ₹10,000 and got ₹12,000 instead: ₹2,000 in excess, so Tara\'s Capital A/c is debited with ₹2,000.',
    ['Compare what should have been credited with what was credited.']),
  tf(32, 'pf-past-adjustments', 'medium', 'When an omission of an earlier year is discovered, the old accounts are reopened and prepared again.', false,
    'The accounts stay closed. The net effect on each partner is worked out in a table and set right by one adjusting entry.',
    ['How many entries does a past adjustment need?']),
  mcq(33, 'pf-past-adjustments', 'medium', 'Capitals are fixed. Through which accounts is an adjusting entry for an omission of an earlier year passed?',
    'The partners\' Current Accounts',
    [
      ['The partners\' Capital Accounts', 'Changed fixed capitals; interest, salary and shares of profit never pass through them.'],
      ['Profit and Loss Appropriation A/c', 'Reopened the appropriation of a year that is closed; one partner is adjusted against another.'],
      ['The partners\' Loan Accounts', 'Treated the adjustment as a loan between the partners and the firm.'],
    ],
    'The items being set right (interest on capital, salary, the share of profit) all belong to the Current Accounts when capitals are fixed.',
    ['Where would these items have gone if they had been entered correctly?']),
  rat(34, 'pf-appropriation', 'easy', 'Uday and Veena agree to share profits in the ratio of their capitals, which are ₹6,00,000 and ₹4,00,000. What is their profit-sharing ratio? State it in the order Uday, Veena.', [3, 2],
    [[[2, 3], 'Wrote the ratio in the wrong order; Uday, with the larger capital, comes first.'], [[1, 1], 'Shared equally, although the partners have agreed on the ratio of capitals.']],
    ['Ratio of capitals = 6,00,000 : 4,00,000 = 3:2.'],
    ['Divide both capitals by their highest common factor.']),
  mcq(35, 'pf-ioc', 'complex', 'Wasim and Xena are partners with fluctuating capitals. On 31 March 2025, after drawings of ₹40,000 and a profit share of ₹70,000 for the year had been entered, Wasim\'s capital stood at ₹5,30,000. No capital was brought in or withdrawn. The deed allows interest on capital at 10% p.a. On what amount is Wasim\'s interest for the year worked out?',
    '₹5,00,000',
    [
      ['₹5,30,000', 'Used the closing capital; interest is allowed on the capital at the beginning of the year.'],
      ['₹5,60,000', 'Went the wrong way: deducted the drawings and added the profit.'],
      ['₹5,70,000', 'Added back the drawings but did not take out the share of profit.'],
    ],
    'Opening capital = Closing capital + Drawings - Share of profit = ₹5,30,000 + ₹40,000 - ₹70,000 = ₹5,00,000.',
    ['Undo what happened to the capital during the year.']),
];

// ---------------------------------------------------------------------------------------------------------------
// Levels
// ---------------------------------------------------------------------------------------------------------------

const levels = buildLadder(T, {
  concept: {
    title: 'Partners, a Deed and a Profit to Share',
    description: 'See what makes a partnership, what the law says when the partners have agreed nothing, and how a profit is shared step by step.',
    lesson: [
      {
        type: 'text',
        heading: 'Two people, one business',
        body: 'Asha and Bilal decide to run a bakery together and share what it earns. That agreement, even a spoken one, makes them partners, and together they are a firm. Each can act for the business and bind the other (mutual agency), and both are liable for its debts without limit. Most partners put their terms in writing. This partnership deed says who brings how much capital, in what ratio profits are shared, and whether there is interest on capital, interest on drawings or a salary for a partner.',
      },
      {
        type: 'text',
        heading: 'When nothing is agreed',
        body: 'Suppose there is no deed, or the deed is silent on a point. The Indian Partnership Act, 1932 then decides: profits and losses are shared equally, whatever the capitals; no interest is allowed on capital and none is charged on drawings; no partner gets a salary or commission; and a partner who lends money to the firm gets interest at 6% p.a. So if Asha put in ₹5,00,000 and Bilal ₹1,00,000 with nothing agreed, a profit of ₹1,20,000 still goes ₹60,000 to each.',
      },
      {
        type: 'text',
        heading: 'Sharing the profit, step by step',
        body: 'Some amounts must be met whatever the result of the year: interest on a loan a partner has given, or rent for a partner\'s building. These are charges against profit and come off in Profit and Loss A/c. What is left, the net profit, is then shared out in Profit and Loss Appropriation A/c as the deed says. Say the net profit is ₹3,00,000, the capitals are ₹2,00,000 and ₹1,00,000, the deed allows interest on capital at 10% p.a. and a salary of ₹5,000 a month to Bilal, and the ratio is 2:1. Interest on capital takes ₹20,000 + ₹10,000 = ₹30,000 and the salary ₹60,000. The remaining ₹2,10,000 is the divisible profit: ₹1,40,000 to Asha and ₹70,000 to Bilal.',
      },
      {
        type: 'text',
        heading: 'Fixed or fluctuating capitals',
        body: 'Where do these amounts go? If capitals are fluctuating, each partner has one Capital A/c and everything passes through it: interest, salary, share of profit, drawings. If capitals are fixed, the Capital A/c is left alone unless capital is brought in or permanently withdrawn, and all the yearly items go to a second account, the partner\'s Current A/c. Every question says which method the firm follows, because the entry depends on it.',
      },
      {
        type: 'example',
        title: 'Interest on capital of ₹20,000 allowed to Asha, capitals being fixed',
        lines: [
          { accountId: 'interestOnCapital', side: 'Dr', amount: 2000000 },
          { accountId: 'current:Asha', side: 'Cr', amount: 2000000 },
        ],
        note: 'The firm gives the interest, so Interest on Capital A/c is debited. Capitals are fixed, so Asha\'s Current A/c is credited and the Capital A/c is not touched. Interest on Capital A/c is then closed to Profit and Loss Appropriation A/c.',
      },
      {
        type: 'working',
        title: 'Worked example 1: interest on drawings, by the product method and by the average period',
        lines: [
          'Meera is a partner in a firm that sells electrical goods in Nagpur. The year ends on 31 March 2025 and the deed charges interest on drawings at 10% p.a.',
          'Meera drew ₹12,000 on 1 June 2024, ₹18,000 on 31 August 2024 and ₹24,000 on 1 January 2025. Count the months from each date to 31 March 2025.',
          '1 June counts June itself: 10 months, product ₹12,000 x 10 = 1,20,000.',
          '31 August is the last day of the month, so August does not count: September to March is 7 months, product ₹18,000 x 7 = 1,26,000.',
          '1 January: 3 months, product ₹24,000 x 3 = 72,000.',
          'Sum of the products = 3,18,000. Interest = 3,18,000 x 10/100 x 1/12 = ₹2,650.',
          'Next year Meera draws ₹5,000 at the end of every month instead: ₹60,000 in all. The first withdrawal is out for 11 months and the last for none, so the average period is (11 + 0) / 2 = 5.5 months.',
          'Interest = ₹60,000 x 10/100 x 5.5/12 = ₹2,750.',
        ],
        note: 'Watch out: the products are months of money, so the yearly rate is divided by 12. A withdrawal on the last day of a month does not count that month.',
      },
      {
        type: 'working',
        title: 'Worked example 2: commission after charging it, and after a salary',
        lines: [
          'Gauri and Harish make furniture in Ludhiana and share profits 3:2. The net profit for the year is ₹3,90,000.',
          'The deed gives Harish a salary of ₹5,000 a month, and Gauri a commission of 10% of the net profit after charging the salary and the commission itself.',
          'Salary first: ₹5,000 x 12 = ₹60,000. Profit after the salary = ₹3,90,000 - ₹60,000 = ₹3,30,000.',
          'Commission after charging it = ₹3,30,000 x 10/110 = ₹30,000. Check: what is left is ₹3,00,000, and 10% of it is ₹30,000.',
          'Divisible profit = ₹3,30,000 - ₹30,000 = ₹3,00,000: Gauri ₹1,80,000 and Harish ₹1,20,000.',
        ],
        note: 'Watch out: "after charging such commission" means Rate/(100 + Rate), not Rate/100. ₹33,000 would be 10% of the profit before the commission.',
      },
      {
        type: 'working',
        title: 'Worked example 3: interest on capital when the profit falls short',
        lines: [
          'Rohan and Sana trade in spices in Kochi and share profits 3:2. Capitals on 1 April 2024: Rohan ₹4,00,000, Sana ₹3,00,000. Sana brought in ₹1,00,000 more on 1 October 2024.',
          'The deed allows interest on capital at 10% p.a. The net profit for the year ended 31 March 2025 is ₹60,000.',
          'Interest due to Rohan = ₹4,00,000 x 10/100 = ₹40,000.',
          'Interest due to Sana = ₹3,00,000 x 10/100 + ₹1,00,000 x 10/100 x 6/12 = ₹30,000 + ₹5,000 = ₹35,000.',
          'Interest due in all = ₹75,000, more than the profit of ₹60,000. Interest on capital is an appropriation, so it can take only the profit there is.',
          'The ₹60,000 is shared in the ratio of the interest due, 40,000 : 35,000 = 8 : 7: Rohan ₹32,000, Sana ₹28,000. Nothing is left to share in 3:2.',
          'Had the firm made a loss, no interest on capital would be allowed at all; the loss would be shared 3:2.',
        ],
        note: 'Watch out: the short profit is shared in the ratio of the interest due, not in the profit-sharing ratio. Only when the deed makes interest on capital a charge is it allowed in full.',
      },
      {
        type: 'table',
        title: 'Rohan and Sana: Profit and Loss Appropriation A/c for the year ended 31 March 2025, in short',
        rows: [
          { label: 'Credit side' },
          { label: 'By Profit and Loss A/c (net profit)', amount: '₹60,000' },
          { label: 'Debit side' },
          { label: 'To Interest on Capital A/c: Rohan ₹32,000, Sana ₹28,000', amount: '₹60,000' },
          { label: 'Each side totals', amount: '₹60,000', total: true },
        ],
        note: 'There is no row for a share of profit: the interest on capital has taken all of it.',
      },
      {
        type: 'working',
        title: 'Worked example 4: a guaranteed minimum profit',
        lines: [
          'Aarav, Bhavna and Chetan run a bookshop in Pune and share profits 3:2:1. The firm guarantees Chetan at least ₹60,000 a year. The profit for the year is ₹3,00,000.',
          'Share in 3:2:1: Aarav ₹1,50,000, Bhavna ₹1,00,000, Chetan ₹50,000.',
          'Deficiency in Chetan\'s share = ₹60,000 - ₹50,000 = ₹10,000.',
          'The firm gave the guarantee, so the other partners bear it in their own ratio, 3:2: Aarav ₹6,000, Bhavna ₹4,000.',
          'Final shares: Aarav ₹1,44,000, Bhavna ₹96,000, Chetan ₹60,000; together still ₹3,00,000.',
        ],
        note: 'Watch out: divide the deficiency by 3 + 2 = 5, the terms of those who bear it, not by 6. Had one partner given the guarantee, that partner alone would bear the ₹10,000.',
      },
      {
        type: 'working',
        title: 'Worked example 5: a past adjustment, as a table and one entry',
        lines: [
          'Deepa and Esha supply stationery in Chennai and share profits 3:2. Their capitals are fixed: Deepa ₹5,00,000, Esha ₹3,00,000.',
          'After the accounts were closed they found that interest on capital at 10% p.a. had been left out, and the whole profit shared 3:2.',
          'Should have been credited: Deepa ₹50,000, Esha ₹30,000; total ₹80,000.',
          'The same ₹80,000 was credited instead as profit, in 3:2: Deepa ₹48,000, Esha ₹32,000.',
          'Net effect: Deepa ₹2,000 short (to be credited); Esha ₹2,000 in excess (to be debited).',
        ],
        note: 'Watch out: do not just credit the omitted interest; take back the profit that was shared in its place. The debits always equal the credits.',
      },
      {
        type: 'example',
        title: 'The single adjusting entry for Deepa and Esha',
        lines: [
          { accountId: 'current:Esha', side: 'Dr', amount: 200000 },
          { accountId: 'current:Deepa', side: 'Cr', amount: 200000 },
        ],
        note: 'Capitals are fixed, so the entry goes through the current accounts. Nothing is passed through Profit and Loss Appropriation A/c: the accounts of the year are not reopened.',
      },
      { type: 'check', questionId: qid(6) },
      { type: 'check', questionId: qid(15) },
    ],
  },
  cards: {
    title: 'Partnership Rules and Formulas',
    description: 'Recall the rules of the Act, the two kinds of capital account, the formulas for interest and commission, and the working for guarantees and past adjustments.',
    cardIds: cards.map((c) => c.id),
  },
  recognition: [
    {
      title: 'Partnership, the Deed and the Act',
      description: 'Recognise what a partnership is and what the Act provides when the deed is silent.',
      questionIds: [1, 2, 3, 4, 5, 6, 7, 8, 9].map(qid),
    },
    {
      title: 'Capitals, Appropriations and Interest',
      description: 'Decide which account takes an item, what is a charge and what is an appropriation, and how interest on capital and drawings is worked.',
      questionIds: [10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 34, 35].map(qid),
    },
    {
      title: 'Commission, Guarantees and Past Adjustments',
      description: 'Commission before and after charging it, entries for a partner, who bears a guarantee and how an old omission is set right.',
      questionIds: [25, 26, 27, 28, 29, 30, 31, 32, 33].map(qid),
    },
  ],
  practice: [
    {
      title: 'Without a Deed, and What Goes Where',
      description: 'The rules of the Act, charges and appropriations, the right account for each item, and the first entries.',
      templateIds: ['pf-deed-fact', 'pf-no-deed-rule', 'pf-no-deed-loan-interest', 'pf-no-deed-profit-share', 'pf-charge-or-appropriation', 'pf-capital-account-item', 'pf-journal-allow', 'pf-journal-close'],
      count: 8,
    },
    {
      title: 'First Sums: Interest, Commission and Shares',
      description: 'Interest on capital for a full year, interest on drawings for a date or for six months, the divisible profit and each partner\'s share.',
      templateIds: ['pf-ioc-simple', 'pf-iod-whole-amount', 'pf-iod-average-period', 'pf-divisible-profit', 'pf-share-of-profit', 'pf-ratio-from-fractions', 'pf-commission-before'],
      count: 8,
    },
    {
      title: 'Interest on Drawings by the Average Period (Guided)',
      description: 'Find the months for the first and the last withdrawal, average them, and apply the rate to the total drawn.',
      templateIds: ['pf-iod-average-period', 'pf-iod-monthly', 'pf-iod-quarterly'],
      count: 6,
      guided: true,
    },
    {
      title: 'Interest on Capital',
      description: 'Capital brought in or withdrawn during the year, the opening capital worked back from the closing capital, and a profit too small for the interest.',
      templateIds: ['pf-ioc-additional', 'pf-ioc-opening-from-closing', 'pf-ioc-insufficient', 'pf-ioc-charge', 'pf-ioc-ratio'],
      count: 8,
    },
    {
      title: 'Drawings, Commission and a Partner\'s Loan',
      description: 'The product method, commission after charging it, and interest on a partner\'s loan as a charge against profit.',
      templateIds: ['pf-iod-product', 'pf-iod-monthly', 'pf-iod-quarterly', 'pf-commission-after', 'pf-loan-interest-profit', 'pf-journal-loan-interest'],
      count: 8,
    },
    {
      title: 'Sharing the Profit: Appropriation, Accounts and Guarantees',
      description: 'From net profit to each partner\'s share, the closing balance of a partner\'s account, a guaranteed minimum profit and the first step of a past adjustment.',
      templateIds: ['pf-appropriation-share', 'pf-current-balance', 'pf-journal-profit-transfer', 'pf-guarantee-firm', 'pf-guarantee-one-partner', 'pf-past-adj-take-back'],
      count: 8,
    },
    {
      title: 'Complex Partnership Problems',
      description: 'Fresh capital hidden in a closing balance, drawings for part of a year, commission after salary, a guarantee borne in a stated ratio, and adjusting entries for past years.',
      templateIds: ['pf-ioc-closing-fresh', 'pf-iod-part-year', 'pf-guarantee-ratio', 'pf-commission-after-salary', 'pf-appropriation-full', 'pf-past-adj-ioc', 'pf-past-adj-ratio', 'pf-past-adj-effect'],
      count: 8,
    },
  ],
  mixed: { title: 'Mixed Partnership Practice', description: 'Everything in this topic, shuffled the way an examination serves it.', count: 12 },
  challenge: { title: 'Challenge: Fundamentals of Partnership', description: 'The hardest questions of the topic, against the clock.', count: 8 },
  // "Pass the necessary journal entries": the entries of one year of one firm. These levels come after every other
  // one and have ids of their own, so the ids of the levels above never move.
  sets: [
    {
      title: 'Pass the Entries for the Appropriation of Profit',
      description: 'One firm, one year: interest on capital, salary, commission, interest on drawings, a transfer to General Reserve and the divisible profit, first with fluctuating capitals and then through the current accounts of fixed capitals.',
      templateIds: ['pf-set-appropriations', 'pf-set-fixed-appropriations'],
      count: 3,
    },
    {
      title: 'Charges, Appropriations and a Guaranteed Share',
      description: 'Interest on a partner\'s loan and rent to a partner kept apart from the appropriations, and a whole year in which capital changes, the profit is shared and the deficiency in a guaranteed share is made good.',
      templateIds: ['pf-set-loan-charge', 'pf-set-guarantee-year'],
      count: 2,
    },
  ],
  // Accounts and a statement the student prepares. Each level serves two, in an order drawn for the play.
  formats: [
    {
      title: 'Prepare the Profit and Loss Appropriation Account',
      description: 'From the net profit to each partner\'s share: first with the appropriations given, then with interest on capital and drawings, salary and commission worked out, and a net profit that may still be before interest on a partner\'s loan.',
      templateIds: ['pf-fmt-appropriation', 'pf-fmt-appropriation-worked'],
      count: 2,
    },
    {
      title: 'Prepare the Partners\' Capital and Current Accounts',
      description: 'The partners\' accounts in columns for a year: capital accounts when capitals are fluctuating, and the capital accounts and the current accounts when they are fixed, with a partner who may end overdrawn.',
      templateIds: ['pf-fmt-capital-accounts', 'pf-fmt-fixed-capital-accounts', 'pf-fmt-current-accounts'],
      count: 2,
    },
    {
      title: 'Prepare a Statement of Past Adjustments',
      description: 'A mistake found after the accounts were closed: what each partner should have been credited with, what was credited instead, and the net effect that the single adjusting entry puts right.',
      templateIds: ['pf-fmt-past-adjustments'],
      count: 2,
    },
    // Added after the audit: an id of its own (partnership-fundamentals-formats-4), after the three above.
    {
      title: 'Prepare the Appropriation Account in a Lean Year',
      description: 'A profit too small for the interest on capital, shared in the ratio of the interest due, and a year of loss, in which interest on capital and salary are not allowed but interest on drawings still is.',
      templateIds: ['pf-fmt-appropriation-short'],
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
        title: 'More Board Patterns: Flat Rates, a Loss, Two Guarantees, Two Years',
        description: 'Interest on drawings at a flat rate and in a year of loss, one partner guaranteeing two others, and interest on capital left out for two years with a change of ratio between them.',
        generate: { templateIds: ['pf-iod-flat-rate', 'pf-iod-loss-year', 'pf-guarantee-two', 'pf-past-adj-years'], count: 8 },
      },
      {
        name: 'assertion-reason',
        type: 'medium_practice',
        title: 'Assertion and Reason',
        description: 'The one-mark question of the board: judge the Assertion, judge the Reason, and say whether the Reason explains the Assertion.',
        generate: { templateIds: ['pf-assertion-reason'], count: 6 },
      },
    ]),
  ],
  questions,
};

export default pack;
