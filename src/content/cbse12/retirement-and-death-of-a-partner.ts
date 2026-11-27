import { buildLadder, laterLevels } from '../ladder';
import type { Card, Concept, Difficulty, JournalQuestion, McqQuestion, NumericQuestion, Question, RatioQuestion, TopicPack, TrueFalseQuestion } from '../types';
import { executor, partnerCapital, partnerCurrent, partnerLoan } from '@/engine/accounts';
import type { JournalLine } from '@/engine/journal';

const T = 'retirement-and-death-of-a-partner';

const concepts: Concept[] = [
  { id: 'ret-ratio', topicId: T, title: 'New profit-sharing ratio and gaining ratio' },
  { id: 'ret-goodwill', topicId: T, title: 'Goodwill on retirement or death' },
  { id: 'ret-revaluation', topicId: T, title: 'Revaluation, reserves and accumulated profits' },
  { id: 'ret-amount-due', topicId: T, title: 'Amount due to the retiring partner and its settlement' },
  { id: 'ret-loan', topicId: T, title: "The retiring partner's loan account" },
  { id: 'ret-capitals', topicId: T, title: "Adjusting the continuing partners' capitals" },
  { id: 'ret-death-profit', topicId: T, title: 'Death: share of profit up to the date of death' },
  { id: 'ret-executor', topicId: T, title: "The deceased partner's capital account and the executor's account" },
  { id: 'ret-sets', topicId: T, title: 'Journal entries on retirement and on death' },
  { id: 'ret-formats', topicId: T, title: 'Preparing the accounts and the balance sheet on retirement and on death' },
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
): Card => ({ id: `ret-card-${n}`, topicId: T, conceptId, kind, prompt, answer, explanation, example, commonMistake });

const cards: Card[] = [
  card(1, 'ret-ratio', 'rule', 'What is the new ratio of the continuing partners when nothing is agreed on a retirement or death?',
    'They keep their old ratio between themselves: strike out the term of the partner who leaves. The same ratio is their gaining ratio.',
    'With no agreement, the continuing partners take over the outgoing share in the ratio they already had, so every remaining share grows in the same proportion.',
    'Old ratio 5:3:2 and the third partner retires: the new ratio of the other two is 5:3, and they gain in the ratio 5:3.',
    'Dividing the outgoing share equally, or making the new ratio 1:1, because nothing was agreed.'),
  card(2, 'ret-ratio', 'formula', 'How is the gaining ratio found when the continuing partners agree on a new ratio?',
    'Gain of a partner = New share - Old share. The gaining ratio is the ratio of these gains, worked on a common denominator.',
    'A partner gains only the part of the new share that is more than the old share, so each new share has to be compared with the old one.',
    'Old ratio 5:3:2; the third partner retires and the other two agree on 3:2. First partner: 3/5 - 5/10 = 1/10. Second: 2/5 - 3/10 = 1/10. Gaining ratio 1:1.',
    'Giving the new ratio as the gaining ratio, or subtracting the terms of one ratio from the other without a common denominator.'),
  card(3, 'ret-ratio', 'formula', 'How is the new ratio found when the outgoing share is taken over in a stated ratio, or wholly by one partner?',
    'New share = Old share + the part of the outgoing share taken over. The ratio in which the share is taken over is itself the gaining ratio.',
    'Turn the outgoing share into a fraction, split it as stated, and add each part to the old share of the partner who takes it.',
    'Old ratio 5:3:2; the third partner\'s 2/10 is taken over in 3:1. First: 5/10 + 2/10 x 3/4 = 26/40. Second: 3/10 + 2/10 x 1/4 = 14/40. New ratio 13:7; gaining ratio 3:1.',
    'Adding the terms of the two ratios (5 + 3 : 3 + 1) without first putting the shares on a common denominator.'),
  card(4, 'ret-ratio', 'shortcut', 'Sacrificing ratio or gaining ratio: which belongs to which event?',
    'Admission: the old partners give up share, so sacrifice = Old share - New share. Retirement or death: the continuing partners take over share, so gain = New share - Old share.',
    'In both events the rule for goodwill is the same: partners who gain share pay, and partners who give up share are paid.',
    'On retirement a result of +1/10 is a gain. A result of -1/10 means that partner has sacrificed and is to be compensated.',
    'Working Old share - New share on a retirement and reading the negative results as gains.'),
  card(5, 'ret-goodwill', 'format', 'What is the entry for goodwill when a partner retires or dies?',
    "Gaining Partners' Capital A/cs Dr (in the gaining ratio); To Retiring or Deceased Partner's Capital A/c (that partner's share of the goodwill of the firm).",
    'The partner who leaves helped to build the goodwill and will not share its future profits, so the partners who take over the share pay for it. No Goodwill A/c is raised: AS 26 allows only purchased goodwill in the books.',
    'Goodwill ₹3,00,000; ratio 5:3:2; the third partner retires with nothing agreed. Share = ₹60,000, gaining ratio 5:3: First Partner\'s Capital Dr ₹37,500; Second Partner\'s Capital Dr ₹22,500; To Third Partner\'s Capital ₹60,000.',
    'Debiting Goodwill A/c, or debiting the continuing partners in their new ratio instead of their gaining ratio.'),
  card(6, 'ret-goodwill', 'rule', 'What is done with goodwill that already appears in the balance sheet?',
    "It is written off first: All Partners' Capital A/cs Dr, in the old ratio; To Goodwill A/c.",
    'The book value belongs to the time when all the partners, the outgoing partner included, were in the firm, so all of them bear the write-off. The new value is then adjusted through the gaining ratio.',
    'Goodwill of ₹50,000 in the books, old ratio 5:3:2: the capital accounts are debited with ₹25,000, ₹15,000 and ₹10,000 and Goodwill A/c is credited with ₹50,000.',
    'Writing it off among the continuing partners only, or adjusting only the difference between the new value and the book value.'),
  card(7, 'ret-goodwill', 'rule', 'What if a continuing partner ends up with a smaller share than before?',
    "That partner has sacrificed and is credited like the partner who leaves: Gaining Partner's Capital A/c Dr; To Outgoing Partner's Capital A/c; To Sacrificing Partner's Capital A/c.",
    'Each credit is goodwill of the firm x the share given up. The partner who gains pays for everything gained: the outgoing share and the share sacrificed.',
    'Old ratio 2:2:1; the first partner retires and the other two agree on 9:1. Second: 9/10 - 2/5 = +5/10. Third: 1/10 - 1/5 = -1/10. Goodwill ₹1,00,000: Second Dr ₹50,000; To First ₹40,000 (2/5); To Third ₹10,000 (1/10).',
    'Debiting both continuing partners without checking that each of them really gains.'),
  card(8, 'ret-goodwill', 'shortcut', 'What is hidden goodwill on retirement?',
    'When a lump sum is paid in full settlement, the excess of that sum over the amount due on the capital account (after reserves and revaluation) is the outgoing partner\'s share of goodwill.',
    'The continuing partners would not pay more than is due unless they were paying for goodwill. They bear the excess in their gaining ratio.',
    'Amount due ₹3,00,000; paid ₹3,45,000 in full settlement: hidden goodwill ₹45,000. Gaining ratio 2:1: the capital accounts are debited with ₹30,000 and ₹15,000.',
    'Charging the excess to Revaluation A/c or Profit and Loss A/c, or treating the whole payment as goodwill.'),
  card(9, 'ret-revaluation', 'rule', 'Who shares the reserves, the accumulated profits and losses and the result of revaluation?',
    'All the partners, the one who leaves included, in the old ratio. Reserves, a credit balance of Profit and Loss A/c and a profit on revaluation are credited; a debit balance of Profit and Loss A/c, a fictitious asset such as Advertisement Suspense and a loss on revaluation are debited.',
    'These amounts arose while the outgoing partner was still a partner, so that partner takes a share of the gains and bears a share of the losses.',
    'General Reserve ₹90,000, old ratio 5:3:2: General Reserve A/c Dr ₹90,000; To the three capital accounts ₹45,000, ₹27,000 and ₹18,000.',
    'Sharing them among the continuing partners only, or in the new ratio.'),
  card(10, 'ret-revaluation', 'rule', 'How are Workmen Compensation Reserve and Investment Fluctuation Reserve dealt with?',
    'A claim for workmen compensation is kept out of the reserve as a liability, and a fall in the value of investments is met from the fluctuation reserve. Only what is left of each reserve is credited to all the partners in the old ratio.',
    'These reserves are set aside for a purpose. The purpose is served first; the surplus is free reserve.',
    'Workmen Compensation Reserve ₹60,000 with a claim of ₹20,000: ₹20,000 becomes Workmen Compensation Claim (a liability) and ₹40,000 is shared in the old ratio.',
    'Distributing the whole reserve and ignoring the claim or the fall in value.'),
  card(11, 'ret-amount-due', 'formula', 'How is the amount due to a retiring partner worked out?',
    'Capital (and current account) balance + share of goodwill + share of reserves and accumulated profits + share of revaluation profit + share of profit and interest on capital up to the date of retirement - drawings - interest on drawings - share of revaluation loss and accumulated losses.',
    "Everything is gathered in the retiring partner's Capital A/c. Its closing balance is what the firm owes.",
    'Capital ₹2,00,000 + goodwill ₹40,000 + reserve ₹30,000 - revaluation loss ₹15,000 - drawings ₹20,000 = ₹2,35,000.',
    'Forgetting to deduct drawings, or adding the share of a loss on revaluation.'),
  card(12, 'ret-amount-due', 'format', 'What are the entries for settling the amount due to a retiring partner?',
    "Paid at once: Retiring Partner's Capital A/c Dr; To Bank A/c. Left with the firm: Retiring Partner's Capital A/c Dr; To Retiring Partner's Loan A/c. Partly each: Capital A/c Dr; To Bank A/c; To Loan A/c.",
    "The capital account of a person who is no longer a partner must be closed. What is not paid becomes a loan, shown as a liability.",
    "Amount due ₹5,00,000 with ₹2,00,000 paid by cheque: Capital A/c Dr ₹5,00,000; To Bank A/c ₹2,00,000; To Loan A/c ₹3,00,000.",
    "Leaving a balance in the retiring partner's capital account, or crediting an Executor's A/c, which is used only on death.",
  ),
  card(13, 'ret-loan', 'rule', "What interest does a retiring partner's loan carry?",
    'The agreed rate. If nothing is agreed, section 37 of the Indian Partnership Act, 1932 lets the outgoing partner (or the estate) choose between interest at 6% p.a. on the amount due and the share of profit earned with that amount, until it is paid.',
    'Interest runs only for the months the amount is outstanding and is credited to the loan account, so it adds to what the firm owes until it is paid.',
    '₹4,00,000 left with the firm from 30 September to 31 March with no rate agreed: ₹4,00,000 x 6% x 6/12 = ₹12,000.',
    'Charging a full year of interest for a part of a year, or allowing no interest because none was agreed.'),
  card(14, 'ret-loan', 'format', 'How does the loan account run when it is repaid in equal annual instalments with interest?',
    'Each year: interest = rate x balance outstanding during the year (credited to the loan account); payment = instalment of principal + that interest; closing balance = opening balance - instalment.',
    'The principal falls by one instalment every year, so the interest falls every year as well. Interest is simple: it is worked on the principal still unpaid, and interest credited to the account at a closing is paid off with the next instalment.',
    '₹3,00,000 in 3 instalments at 10%: year 1 interest ₹30,000, paid ₹1,30,000, balance ₹2,00,000; year 2 interest ₹20,000, paid ₹1,20,000, balance ₹1,00,000; year 3 interest ₹10,000, paid ₹1,10,000, balance nil.',
    'Charging interest on the original loan every year, or deducting the interest paid from the principal.'),
  card(15, 'ret-capitals', 'formula', 'How are the capitals of the continuing partners adjusted to the new ratio?',
    '1) Find the total capital of the new firm. 2) New capital of a partner = total x new share. 3) Compare with the adjusted capital: a shortfall is brought in (Bank A/c Dr; To Capital A/c) and a surplus is withdrawn (Capital A/c Dr; To Bank A/c), or both go through the current accounts.',
    'The total may be stated, or be the total of the adjusted capitals, or be the adjusted capitals plus the amount due to the outgoing partner when the continuing partners bring in the cash to pay it.',
    'Total ₹6,00,000 in 2:1 gives ₹4,00,000 and ₹2,00,000. Adjusted capitals ₹3,50,000 and ₹2,30,000: the first brings in ₹50,000 and the second withdraws ₹30,000.',
    'Dividing the total capital in the old ratio, or reading a shortfall as a surplus.'),
  card(16, 'ret-death-profit', 'formula', 'How is the share of profit up to the date of death found on the basis of time?',
    "Share = profit of the previous year (or the average of past years, as the deed says) x months from the last balance sheet to the date of death / 12 x the deceased partner's share.",
    'The accounts of the year are not yet made up, so the profit of the months the partner lived is estimated from past profit.',
    "Year ends 31 March; a partner with a 1/4 share dies on 30 June; last year's profit ₹2,40,000: ₹2,40,000 x 3/12 x 1/4 = ₹15,000.",
    "Giving a full year's share, or counting the months after the death."),
  card(17, 'ret-death-profit', 'formula', 'How is the share of profit up to the date of death found on the basis of sales (turnover)?',
    "Share = sales from the last balance sheet to the date of death x rate of profit on sales x the deceased partner's share. Rate of profit = last year's profit / last year's sales x 100.",
    'The estimate follows the business actually done in the period, not the number of months.',
    'Last year: profit ₹1,50,000 on sales ₹10,00,000, a rate of 15%. Sales up to the death ₹4,00,000: profit ₹60,000; a 2/5 share is ₹24,000.',
    'Using months although the deed says sales, or taking a share of the sales instead of the profit on them.'),
  card(18, 'ret-death-profit', 'format', 'What is the entry for the share of profit up to the date of death?',
    "Profit and Loss Suspense A/c Dr; To Deceased Partner's Capital A/c.",
    'The profit of the year is not known on the date of death, so the estimated share is held in a suspense account, which is closed against the profit of the year when the accounts are made up.',
    "A share of ₹15,000: Profit and Loss Suspense A/c Dr ₹15,000; To Deceased Partner's Capital A/c ₹15,000.",
    "Debiting Profit and Loss Appropriation A/c on the date of death, or crediting the Executor's A/c directly."),
  card(19, 'ret-executor', 'format', "How is the deceased partner's account closed and paid?",
    "Everything due is gathered in the deceased partner's Capital A/c and its balance is transferred: Deceased Partner's Capital A/c Dr; To Deceased Partner's Executor's A/c. Payment: Executor's A/c Dr; To Bank A/c. An unpaid balance carries interest.",
    'The executor acts for the estate of the deceased partner. The capital account is credited with capital, goodwill, reserves, revaluation profit, profit to date and interest on capital, and debited with drawings, interest on drawings and shares of losses.',
    "Balance ₹4,80,000 transferred to the Executor's A/c; ₹1,80,000 paid at once; ₹3,00,000 stays as a liability with interest until it is paid.",
    "Transferring the balance to a loan account in the name of the deceased partner, or leaving it in the capital account."),
];

// ---------------------------------------------------------------------------------------------------------------
// Authored questions
// ---------------------------------------------------------------------------------------------------------------

const qid = (n: number): string => `ret-q-${String(n).padStart(3, '0')}`;

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
  // An Assertion-Reason item keeps the board's four options in the board's order, (a) to (d).
  if (all.every((o) => BOARD_ORDER.includes(o.text))) all.sort((x, y) => BOARD_ORDER.indexOf(x.text) - BOARD_ORDER.indexOf(y.text));
  const options = all.map((o, i) => ({ id: 'abcdefgh'[i], text: o.text, ...(o.why === undefined ? {} : { why: o.why }) }));
  return {
    id: qid(n), topicId: T, conceptId, difficulty, type: 'mcq', prompt, options,
    correct: options.find((o) => o.text === correct)!.id, hints, explanation,
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

const ratio = (
  n: number,
  conceptId: string,
  difficulty: Difficulty,
  prompt: string,
  answer: number[],
  errors: [number[], string][],
  working: string[],
  hints: string[],
): RatioQuestion => ({
  id: qid(n), topicId: T, conceptId, difficulty, type: 'numeric', unit: 'ratio', prompt, answer,
  commonErrors: errors.map(([value, why]) => ({ value, why })), working, hints, explanation: working.join(' '),
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

const AR_BOTH = 'Both A and R are true, and R is the correct explanation of A';
const AR_BOTH_NOT = 'Both A and R are true, but R is not the correct explanation of A';
const AR_A_ONLY = 'A is true but R is false';
const AR_R_ONLY = 'A is false but R is true';
const BOARD_ORDER = [AR_BOTH, AR_BOTH_NOT, AR_A_ONLY, AR_R_ONLY];

const questions: Question[] = [
  // ---- New ratio, gaining ratio and goodwill ----
  mcq(1, 'ret-ratio', 'easy', 'The ratio in which the continuing partners take over the share of a partner who retires or dies is called the:',
    'Gaining ratio',
    [
      ['Sacrificing ratio', 'Picked the ratio used on admission, in which the old partners give up a part of their share.'],
      ['New profit-sharing ratio', 'Confused what each partner gains with the whole share each partner has after the change.'],
      ['Capital ratio', 'Picked the ratio of the capitals, which has nothing to do with who takes over a share of profit.'],
    ],
    'The continuing partners gain the share of the partner who leaves; the ratio of their gains is the gaining ratio.',
    ['Do the continuing partners give up share or take it over?']),
  mcq(2, 'ret-ratio', 'easy', 'On the retirement of a partner, the gain of a continuing partner is worked out as:',
    'New share - Old share',
    [
      ['Old share - New share', 'Used the formula for a sacrifice, which belongs to admission.'],
      ['New share + Old share', 'Added the two shares; a gain is the increase from the old share to the new one.'],
      ['Old share / New share', 'Divided the shares; a gain is a difference, not a quotient.'],
    ],
    'A continuing partner gains the part of the new share that is more than the old share.',
    ['Is the new share bigger or smaller than the old one?']),
  tf(3, 'ret-ratio', 'easy', 'When nothing is agreed on a retirement, the continuing partners take over the share of the retiring partner equally.', false,
    'With nothing agreed they take it over in their old ratio, so the ratio between them stays as it was.',
    ['What happens to the ratio between the continuing partners when nothing is said?']),
  ratio(4, 'ret-ratio', 'easy', 'Lata, Manoj and Nandini share profits in the ratio 4:3:2. Nandini retires and nothing is agreed about the future ratio. What is the gaining ratio of Lata and Manoj?',
    [4, 3],
    [[[1, 1], 'Took Lata and Manoj to gain equal parts of the share of Nandini.'], [[3, 4], 'Wrote the terms against the wrong names: a ratio follows the order in which the partners are named.']],
    ['With nothing agreed, the continuing partners gain in their old ratio.', 'Old ratio of Lata and Manoj = 4:3, so the gaining ratio is 4:3.'],
    ['Strike out the term of the partner who retires.']),
  mcq(5, 'ret-ratio', 'medium', 'Farid, Gauri and Harish share profits in the ratio 3:2:1. Harish retires, and Farid and Gauri decide to share future profits equally. Who gains?',
    'Gauri alone gains 1/6; the share of Farid does not change',
    [
      ['Farid and Gauri gain 1/12 each', 'Divided the share of Harish equally without comparing each new share with the old one.'],
      ['Farid gains 3/5 and Gauri 2/5 of the share of Harish', 'Applied the rule for the case in which no new ratio is agreed.'],
      ['Farid alone gains 1/6; the share of Gauri does not change', 'Worked the gains against the wrong names.'],
    ],
    'Farid: 1/2 - 3/6 = 0. Gauri: 1/2 - 2/6 = 1/6. Gauri takes over the whole share of Harish, so Gauri alone compensates Harish for goodwill.',
    ['Work out new share - old share for each of the two.']),
  ratio(6, 'ret-ratio', 'medium', 'Pooja, Rohit and Sneha share profits in the ratio 5:3:2. Rohit retires. Pooja takes 2/3 of the share of Rohit and Sneha takes the rest. What is the new profit-sharing ratio of Pooja and Sneha?',
    [7, 3],
    [[[2, 1], 'Gave the gaining ratio, the ratio in which the share is taken over, instead of the new ratio.'], [[5, 2], 'Kept the old ratio between Pooja and Sneha, although the share is taken over in a different ratio.']],
    ['Share of Rohit = 3/10. Pooja takes 2/3 of it = 2/10; Sneha takes 1/3 of it = 1/10.', 'Pooja: 5/10 + 2/10 = 7/10. Sneha: 2/10 + 1/10 = 3/10.', 'New ratio = 7:3.'],
    ['New share = old share + the part of the outgoing share taken over.']),
  mcq(7, 'ret-goodwill', 'easy', 'Who compensates a retiring partner for the share of goodwill?',
    'The continuing partners who gain, in their gaining ratio',
    [
      ['All the partners, in the old profit-sharing ratio', 'Made the retiring partner pay a part of the compensation that the retiring partner is to receive.'],
      ['The continuing partners, in their new profit-sharing ratio', 'Used the new ratio; each partner pays for the share gained, not for the whole share held.'],
      ['Nobody: Goodwill A/c is raised at its full value and kept in the books', 'Raised goodwill in the books, which AS 26 does not allow for goodwill that is not purchased.'],
    ],
    'Each continuing partner pays for what that partner gains, so the debit is in the gaining ratio.',
    ['Who will enjoy the profits that the share of the retiring partner used to earn?']),
  mcq(8, 'ret-goodwill', 'medium', 'Assertion (A): On the retirement of a partner, Goodwill A/c is not raised for the value placed on the goodwill of the firm. Reason (R): AS 26 allows goodwill in the books only when it has been purchased.',
    AR_BOTH,
    [
      [AR_BOTH_NOT, 'Missed that the standard is the very reason goodwill is adjusted through the capital accounts and not raised.'],
      [AR_A_ONLY, 'Denied the rule of AS 26: goodwill that a firm builds for itself is not recorded.'],
      [AR_R_ONLY, 'Thought that a Goodwill A/c is opened on retirement; the adjustment is made through the capital accounts.'],
    ],
    'Goodwill valued on a retirement is self-generated, and AS 26 does not allow it in the books, so it is adjusted through the capital accounts.',
    ['Is the goodwill valued on a retirement purchased or built up by the firm itself?']),
  tf(9, 'ret-goodwill', 'easy', 'Goodwill that already appears in the balance sheet is written off among the continuing partners only, in their new ratio.', false,
    'It is written off among all the partners, the one who leaves included, in the old ratio.',
    ['Who were the partners while that goodwill stood in the books?']),
  mcq(10, 'ret-goodwill', 'medium', 'Asha, Bhavna and Chetan share profits in the ratio 5:3:2 and their capitals are fluctuating. Chetan retires, the goodwill of the firm is valued at ₹1,00,000 and no new ratio is agreed. Which entry is passed?',
    "Asha's Capital A/c Dr ₹12,500; Bhavna's Capital A/c Dr ₹7,500; To Chetan's Capital A/c ₹20,000",
    [
      ["Goodwill A/c Dr ₹20,000; To Chetan's Capital A/c ₹20,000", 'Raised Goodwill A/c; goodwill that is not purchased is adjusted through the capital accounts.'],
      ["Asha's Capital A/c Dr ₹10,000; Bhavna's Capital A/c Dr ₹10,000; To Chetan's Capital A/c ₹20,000", 'Divided the compensation equally instead of in the gaining ratio 5:3.'],
      ["Chetan's Capital A/c Dr ₹20,000; To Asha's Capital A/c ₹12,500; To Bhavna's Capital A/c ₹7,500", 'Reversed the entry: the partners who gain are debited and the partner who leaves is credited.'],
    ],
    'Share of Chetan = ₹1,00,000 x 2/10 = ₹20,000. Asha and Bhavna gain in their old ratio 5:3: ₹12,500 and ₹7,500.',
    ['Find the share of goodwill of the retiring partner, then divide it in the gaining ratio.']),
  mcq(11, 'ret-goodwill', 'medium', 'After a retirement, the new share of a continuing partner is smaller than the old share. In the entry for goodwill this partner is:',
    'Credited with goodwill of the firm x the share given up',
    [
      ['Debited with goodwill of the firm x the share given up', 'Debited a partner who has sacrificed; only a partner who gains is debited.'],
      ['Left out of the entry', 'Left out a partner whose share has changed; a sacrifice is compensated like the share of the partner who leaves.'],
      ['Credited with the whole share of goodwill of the retiring partner', 'Gave this partner the credit that belongs to the retiring partner.'],
    ],
    'A continuing partner who gives up a part of the share is compensated by the partner who gains, just as the retiring partner is.',
    ['Has this partner gained or sacrificed?']),
  num(12, 'ret-goodwill', 'medium', 'Kiran retires from a firm. After the adjustments for reserves and revaluation, ₹3,00,000 is due to Kiran. The continuing partners agree to pay Kiran ₹3,60,000 in full settlement. What is the hidden goodwill, that is, the share of goodwill of Kiran?',
    60000,
    [[360000, 'Treated the whole payment as goodwill.'], [300000, 'Gave the amount due on the capital account, not the excess paid over it.']],
    ['Hidden goodwill = amount paid in full settlement - amount due.', '₹3,60,000 - ₹3,00,000 = ₹60,000, borne by the continuing partners in their gaining ratio.'],
    ['Why would the partners pay more than is due?']),

  // ---- Reserves, revaluation, amount due, loan and capitals ----
  mcq(13, 'ret-revaluation', 'easy', 'On the retirement of a partner, the General Reserve in the balance sheet is credited to:',
    'All the partners, the retiring partner included, in the old ratio',
    [
      ['The continuing partners only, in the new ratio', 'Left out the retiring partner, who was a partner when the reserve was set aside.'],
      ['The continuing partners only, in the gaining ratio', 'Used the gaining ratio, which is for goodwill, and left out the retiring partner.'],
      ['The retiring partner only', 'Gave the whole reserve to one partner; it is past profit of all the partners.'],
    ],
    'A reserve is profit of the past, earned by all the partners, so all of them share it in the old ratio.',
    ['Whose profit was set aside in the reserve?']),
  tf(14, 'ret-revaluation', 'easy', 'A loss on revaluation at the time of a retirement is borne by the continuing partners only.', false,
    'The values changed while the retiring partner was still a partner, so all the partners bear the loss in the old ratio.',
    ['When did the fall in value take place?']),
  mcq(15, 'ret-revaluation', 'medium', 'A firm has a Workmen Compensation Reserve of ₹60,000. On the day a partner retires, a claim of ₹20,000 for workmen compensation is admitted. What is done?',
    '₹20,000 is shown as a liability for the claim and ₹40,000 is credited to all the partners in the old ratio',
    [
      ['The whole ₹60,000 is credited to all the partners in the old ratio', 'Ignored the claim, which has to be met out of the reserve first.'],
      ['The whole ₹60,000 is kept in the balance sheet as a reserve', 'Kept the surplus of the reserve, in which the retiring partner has a share that must be paid.'],
      ['₹20,000 is shown as a liability and ₹40,000 is credited to the continuing partners in the new ratio', 'Left out the retiring partner, who was a partner while the reserve was built up.'],
    ],
    'The reserve first meets the claim; the surplus of ₹40,000 is free reserve and belongs to all the partners in the old ratio.',
    ['What is the reserve meant for, and how much of it is still needed?']),
  mcq(16, 'ret-amount-due', 'easy', 'Which of these is deducted in finding the amount due to a retiring partner?',
    "The partner's drawings and the interest on them",
    [
      ["The partner's share of the General Reserve", 'Deducted a share of past profit, which is added.'],
      ["The partner's share of goodwill", 'Deducted the compensation for goodwill, which is added.'],
      ["The partner's share of the profit on revaluation", 'Deducted a share of a gain, which is added.'],
    ],
    'Drawings and interest on drawings reduce what the firm owes the partner. Shares of reserves, goodwill and profits increase it.',
    ['Which item has the partner already taken out of the firm?']),
  mcq(17, 'ret-amount-due', 'easy', 'The amount due to a retiring partner that is not paid at once is transferred to:',
    "The retiring partner's Loan A/c",
    [
      ["The retiring partner's Executor's A/c", "Picked the account used on the death of a partner."],
      ["The retiring partner's Current A/c", 'Kept a current account for a person who is no longer a partner.'],
      ['Profit and Loss Suspense A/c', 'Picked the account that holds the estimated profit of a deceased partner.'],
    ],
    'What is not paid stays with the firm as a loan from the retiring partner and is shown as a liability.',
    ['The person is no longer a partner. What does the firm now owe?']),
  jr(18, 'ret-amount-due', 'medium', "Mohan retires. After all adjustments, Mohan's Capital A/c shows a credit balance of ₹2,40,000. ₹90,000 is paid by cheque and the balance is left with the firm as a loan from Mohan. Pass the journal entry.",
    [[partnerCapital('Mohan'), 'Dr', 240000], ['bank', 'Cr', 90000], [partnerLoan('Mohan'), 'Cr', 150000]],
    [executor('Mohan'), partnerCurrent('Mohan'), 'loan'],
    "Mohan's Capital A/c is debited with ₹2,40,000 to close it. Bank A/c is credited with the cheque of ₹90,000 and the unpaid ₹1,50,000 is credited to Mohan's Loan A/c.",
    ['Close the capital account; what is not paid becomes a loan.']),
  num(19, 'ret-amount-due', 'medium', 'A partner retires on 31 March. The capital account shows ₹2,00,000 before adjustments. The share of the General Reserve is ₹30,000, the share of goodwill is ₹40,000 and the share of the loss on revaluation is ₹15,000. Drawings of ₹20,000 have not yet been transferred to the capital account. What is the amount due to the partner?',
    235000,
    [[265000, 'Added the share of the loss on revaluation instead of deducting it.'], [255000, 'Did not deduct the drawings.'], [195000, 'Left out the share of goodwill.']],
    ['Add: ₹2,00,000 + ₹30,000 + ₹40,000 = ₹2,70,000.', 'Deduct: ₹15,000 + ₹20,000 = ₹35,000.', 'Amount due = ₹2,70,000 - ₹35,000 = ₹2,35,000.'],
    ['Which items increase what the firm owes, and which reduce it?']),
  mcq(20, 'ret-loan', 'medium', 'A partner retires, the amount due is not paid, and nothing is agreed about interest. Under section 37 of the Indian Partnership Act, 1932 the retired partner may choose between:',
    'Interest at 6% p.a. on the amount due, or the share of profit earned with that amount',
    [
      ['Interest at 12% p.a. on the amount due, or nothing', 'Used a rate the Act does not give; the rate under section 37 is 6% p.a.'],
      ['Interest at the bank rate, or the share of profit earned with that amount', 'Used the bank rate; the Act fixes 6% p.a.'],
      ['No interest and no share of profit until the partners agree on one', 'Thought that without an agreement nothing is payable.'],
    ],
    'Until the amount is paid, the outgoing partner may take 6% p.a. on it or the share of the profit that the firm earns by using it.',
    ['The same rate applies to a loan by a partner when the deed is silent.']),
  tf(21, 'ret-loan', 'easy', "When a retiring partner's loan is repaid in equal annual instalments, the interest of each year is charged on the balance outstanding during that year.", true,
    'The principal falls with every instalment, so the interest is worked on the balance that was outstanding during the year.',
    ['Does the firm still owe the original amount in the second year?']),
  num(22, 'ret-loan', 'medium', "A retiring partner's loan of ₹3,00,000 is repaid in 3 equal annual instalments of principal, each paid with interest at 10% p.a. on the balance outstanding during the year. How much is paid at the end of the second year?",
    120000,
    [[130000, 'Charged interest on the original loan, although one instalment had been repaid.'], [100000, 'Gave only the instalment of principal and left out the interest.'], [110000, 'Charged interest on the balance left after the second instalment.']],
    ['Instalment = ₹3,00,000 / 3 = ₹1,00,000.', 'Balance during the second year = ₹2,00,000; interest = ₹20,000.', 'Paid = ₹1,00,000 + ₹20,000 = ₹1,20,000.'],
    ['What is the balance of the loan during the second year?']),
  mcq(23, 'ret-capitals', 'easy', 'After a retirement, the total capital of the new firm is fixed at ₹6,00,000, to be held by Gauri and Harish in their new ratio 2:1. The adjusted capital of Gauri is ₹3,50,000. Gauri must:',
    'Bring in ₹50,000',
    [
      ['Withdraw ₹50,000', 'Read a shortfall as a surplus: the capital required is more than the capital held.'],
      ['Withdraw ₹1,50,000', 'Took 1/3 of the total capital, the share of Harish, as the capital required of Gauri.'],
      ['Bring in ₹2,50,000', 'Compared the capital of Gauri with the total capital of the firm.'],
    ],
    'Capital required = ₹6,00,000 x 2/3 = ₹4,00,000. Gauri has ₹3,50,000, so ₹50,000 is brought in.',
    ['Find the capital required of Gauri in the new ratio first.']),
  tf(24, 'ret-capitals', 'medium', 'When the continuing partners bring in cash to pay off the retiring partner in such a way that their capitals are in the new ratio, the total capital of the new firm is their adjusted capitals plus the amount due to the retiring partner.', true,
    'The cash brought in only replaces what is paid out, so the net assets do not change: the capital of the new firm is the adjusted capitals of the continuing partners plus the amount that was due to the retiring partner.',
    ['Does the firm have more or less cash after the retiring partner is paid?']),

  // ---- Death of a partner ----
  mcq(25, 'ret-death-profit', 'easy', 'A partner dies during the year. The share of profit up to the date of death is credited to the capital account of the deceased partner by debiting:',
    'Profit and Loss Suspense A/c',
    [
      ['Profit and Loss Appropriation A/c', 'Used the account prepared only when the accounts of the year are closed.'],
      ['Revaluation A/c', 'Used the account for changes in the values of assets and liabilities.'],
      ["The Executor's A/c", 'Debited the account of the person who is to be paid.'],
    ],
    'The profit of the year is not yet known, so the estimated share is held in Profit and Loss Suspense A/c.',
    ['Is the profit of the year known on the date of death?']),
  mcq(26, 'ret-death-profit', 'easy', 'How does the accounting on the death of a partner differ from that on a retirement at the end of a year?',
    'A share of the profit of the current year has to be estimated, and the amount due goes to the executor',
    [
      ['Goodwill is not adjusted when a partner dies', 'Left the estate without the share of goodwill of the deceased partner.'],
      ['Reserves are shared by the continuing partners only when a partner dies', 'Left the deceased partner out of profits earned before the death.'],
      ['The gaining ratio is not used when a partner dies', 'Thought the continuing partners gain nothing; they take over the share of the deceased partner.'],
    ],
    'Goodwill, reserves and revaluation are treated as on retirement. What is new is the estimated profit of a part of the year and the account of the executor.',
    ['Death seldom falls on the last day of the accounting year.']),
  num(27, 'ret-death-profit', 'easy', 'A firm closes its books on 31 March. Ravi, who has a 1/4 share, dies on 30 June 2025. The share of profit up to the date of death is worked out on the basis of time from the profit of the previous year, ₹2,40,000. What is the share of Ravi?',
    15000,
    [[60000, 'Gave a full year of profit; the share is only for the 3 months up to the date of death.'], [20000, 'Counted 4 months instead of 3: April, May and June.'], [45000, 'Counted the 9 months after the death instead of the 3 months before it.']],
    ['1 April to 30 June is 3 months.', '₹2,40,000 x 3/12 x 1/4 = ₹15,000.'],
    ['Count the months from the last balance sheet to the date of death.']),
  num(28, 'ret-death-profit', 'medium', 'Last year a firm earned a profit of ₹1,50,000 on sales of ₹10,00,000. A partner with a 2/5 share dies, and the sales from the last balance sheet to the date of death are ₹4,00,000. The deed says the share of profit is worked out on the sales of the period at the rate of profit of last year. What is the share of the deceased partner?',
    24000,
    [[60000, 'Gave the profit of the whole firm on these sales, not the share of the deceased partner.'], [160000, 'Took a share of the sales themselves instead of the profit on them.']],
    ['Rate of profit on sales = ₹1,50,000 / ₹10,00,000 = 15%.', 'Profit up to the date of death = ₹4,00,000 x 15% = ₹60,000.', 'Share = ₹60,000 x 2/5 = ₹24,000.'],
    ['Find the rate of profit on sales of last year first.']),
  mcq(29, 'ret-death-profit', 'medium', 'Assertion (A): The share of profit of a deceased partner up to the date of death is debited to Profit and Loss Suspense A/c. Reason (R): The final accounts are prepared only at the end of the year, so the profit up to the date of death can only be estimated.',
    AR_BOTH,
    [
      [AR_BOTH_NOT, 'Missed that the suspense account is used because the profit is only an estimate on that date.'],
      [AR_A_ONLY, 'Thought that the profit of a part of the year is known exactly on the date of death.'],
      [AR_R_ONLY, 'Thought that Profit and Loss Appropriation A/c is debited on the date of death.'],
    ],
    'The profit is an estimate because the accounts are not yet closed, which is exactly why a suspense account holds it.',
    ['When is the profit of a year finally known?']),
  mcq(30, 'ret-executor', 'easy', "The balance of the capital account of a deceased partner, after all adjustments, is transferred to:",
    "The deceased partner's Executor's A/c",
    [
      ["A Loan A/c in the name of the deceased partner", 'Used the account opened for a partner who retires.'],
      ['The capital accounts of the continuing partners', 'Gave the continuing partners what is owed to the estate.'],
      ['Revaluation A/c', 'Picked an account for changes in the values of assets and liabilities.'],
    ],
    'The amount is owed to the estate, which the executor represents.',
    ['Who receives the money on behalf of the deceased partner?']),
  tf(31, 'ret-executor', 'easy', 'The estate of a deceased partner is entitled to a share of the goodwill of the firm.', true,
    'The deceased partner helped to build the goodwill, so the continuing partners who gain compensate the estate in their gaining ratio.',
    ['Is goodwill treated differently on death and on retirement?']),
  jr(32, 'ret-executor', 'easy', "Sunita, a partner, has died. After all adjustments, Sunita's Capital A/c shows a credit balance of ₹4,80,000, which will be paid later. Pass the journal entry to close Sunita's Capital A/c.",
    [[partnerCapital('Sunita'), 'Dr', 480000], [executor('Sunita'), 'Cr', 480000]],
    [partnerLoan('Sunita'), partnerCurrent('Sunita'), 'loan'],
    "Sunita's Capital A/c is debited to close it and the amount is credited to Sunita's Executor's A/c, which the firm now owes.",
    ['The amount is owed to the estate.']),
  mcq(33, 'ret-executor', 'medium', "₹4,00,000 is transferred to the Executor's A/c of a partner who died on 30 September 2025. Interest at 9% p.a. has been agreed. Nothing is paid before the firm closes its books on 31 March 2026, when the interest accrued is credited to the Executor's A/c. At what amount is the Executor's A/c shown in the balance sheet on that date?",
    '₹4,18,000',
    [
      ['₹4,00,000', 'Left out the interest accrued for the 6 months, which is credited to the account.'],
      ['₹4,36,000', 'Charged interest for a full year instead of 6 months.'],
      ['₹18,000', 'Gave the interest only, not the balance of the account.'],
    ],
    'Interest = ₹4,00,000 x 9% x 6/12 = ₹18,000, credited to the account: ₹4,18,000.',
    ['For how many months has the amount been outstanding?']),
  mcq(34, 'ret-revaluation', 'medium', 'On the death of a partner, the balance sheet shows Advertisement Suspense A/c of ₹30,000 on the assets side. It is:',
    'Debited to the capital accounts of all the partners, the deceased partner included, in the old ratio',
    [
      ['Debited to the capital accounts of the continuing partners in the new ratio', 'Left out the deceased partner, although the expense was incurred while that partner was alive.'],
      ['Credited to the capital accounts of all the partners in the old ratio', 'Treated an expense not yet written off as if it were a reserve.'],
      ['Carried forward in the balance sheet of the new firm', 'Left the continuing partners to bear the whole of an expense that belongs to all the old partners.'],
    ],
    'Advertisement Suspense is an expense not yet written off: a loss of the old firm, borne by all the partners in the old ratio.',
    ['Is it a gain or a loss, and whose?']),
  mcq(35, 'ret-loan', 'medium', "A retiring partner's loan of ₹2,00,000 carries interest at 8% p.a. The partner retired on 31 December 2025 and the firm closes its books on 31 March 2026. Nothing has been paid. Which statement is correct on 31 March 2026?",
    "Interest of ₹4,000 is credited to the Loan A/c, which then stands at ₹2,04,000",
    [
      ["Interest of ₹16,000 is credited to the Loan A/c, which then stands at ₹2,16,000", 'Charged interest for a full year instead of the 3 months from January to March.'],
      ["No interest is recorded until it is paid", 'Left out the interest accrued, which is owed at the closing date.'],
      ["Interest of ₹4,000 is debited to the Loan A/c, which then stands at ₹1,96,000", 'Debited the loan account; interest owed adds to what the firm owes, so it is credited.'],
    ],
    'Interest for 3 months = ₹2,00,000 x 8% x 3/12 = ₹4,000. It is owed to the retired partner, so it is credited to the loan account.',
    ['How many months lie between the retirement and the closing of the books?']),
];

// ---------------------------------------------------------------------------------------------------------------
// Levels
// ---------------------------------------------------------------------------------------------------------------

const levels = buildLadder(T, {
  concept: {
    title: 'When a Partner Leaves the Firm',
    description: 'See what has to be settled when a partner retires or dies: who takes over the share, and what the firm owes.',
    lesson: [
      {
        type: 'text',
        heading: 'The firm goes on, one partner fewer',
        body: 'Asha, Bhavna and Chetan run a firm and share profits in the ratio 5:3:2. Chetan decides to retire. The business carries on under Asha and Bhavna, but two questions have to be answered on the day Chetan leaves. Who will now get the 2/10 of the profit that used to go to Chetan? And how much does the firm owe Chetan for the years spent building it?',
      },
      {
        type: 'text',
        heading: 'Who gains the share',
        body: 'The share of Chetan does not disappear: Asha and Bhavna take it over. What each of them takes over is a gain, and the ratio of their gains is the gaining ratio. If they agree on nothing, they simply keep their old ratio between themselves, 5:3, and gain in that ratio too. If they agree on a new ratio, the gain of each is the new share less the old share. This is the mirror image of admission, where the old partners give up share and we speak of a sacrifice.',
      },
      {
        type: 'text',
        heading: 'What the firm owes the partner who leaves',
        body: 'Everything the firm had built up to that day belongs to all three partners in the old ratio 5:3:2. So Chetan gets a share of the reserves and undistributed profits, and a share of any profit when the assets and liabilities are revalued (and bears a share of any loss). Chetan also helped to build the goodwill of the firm and will no longer share its fruits, so the partners who gain pay Chetan for it. No Goodwill A/c is opened, because AS 26 allows only purchased goodwill in the books: the partners who gain are debited in the gaining ratio and Chetan is credited.',
      },
      {
        type: 'example',
        title: 'Goodwill of the firm ₹3,00,000; Chetan (2/10) retires; Asha and Bhavna gain in 5:3',
        lines: [
          { accountId: partnerCapital('Asha'), side: 'Dr', amount: 3750000 },
          { accountId: partnerCapital('Bhavna'), side: 'Dr', amount: 2250000 },
          { accountId: partnerCapital('Chetan'), side: 'Cr', amount: 6000000 },
        ],
        note: 'The share of Chetan is ₹3,00,000 x 2/10 = ₹60,000. Asha pays 5/8 of it and Bhavna 3/8, through their capital accounts. Goodwill A/c does not appear.',
      },
      {
        type: 'text',
        heading: 'Paying the amount due, and what changes on death',
        body: 'All these items are gathered in the capital account of the partner who leaves; its balance is the amount due. A retiring partner is paid at once, or the amount is left with the firm as a loan that carries interest (6% p.a. under section 37 if no rate is agreed and interest is chosen). When a partner dies, the same adjustments are made, with two differences. Death usually falls in the middle of a year, so a share of the profit of that year is estimated, on the basis of time or of sales, and passed through Profit and Loss Suspense A/c. And the amount due is transferred to the account of the executor, who receives it for the estate.',
      },
      {
        type: 'working',
        title: 'Saffron Travels, Jaipur: Divya, Eshan and Fatima share 4:3:3. Fatima retires; Divya and Eshan agree on 4:1',
        lines: [
          'Old shares: Divya 4/10, Eshan 3/10, Fatima 3/10. New shares: Divya 4/5 = 8/10, Eshan 1/5 = 2/10.',
          'Divya: 8/10 - 4/10 = +4/10, a gain.',
          'Eshan: 2/10 - 3/10 = -1/10, a sacrifice: Eshan ends with less than before.',
          "Goodwill of the firm ₹3,00,000. Fatima's share = ₹3,00,000 x 3/10 = ₹90,000; Eshan's sacrifice = ₹3,00,000 x 1/10 = ₹30,000.",
          'Divya gains 4/10 and pays for all of it: ₹3,00,000 x 4/10 = ₹1,20,000 = ₹90,000 + ₹30,000.',
        ],
        note: 'Watch out: on a retirement, check every continuing partner. One whose new share is smaller has sacrificed and is credited, like the partner who leaves.',
      },
      {
        type: 'example',
        title: 'The goodwill entry at Saffron Travels: one partner pays two',
        lines: [
          { accountId: partnerCapital('Divya'), side: 'Dr', amount: 12000000 },
          { accountId: partnerCapital('Fatima'), side: 'Cr', amount: 9000000 },
          { accountId: partnerCapital('Eshan'), side: 'Cr', amount: 3000000 },
        ],
        note: "Divya's Capital A/c is debited with everything Divya gains; Fatima and Eshan are each credited with what they give up. Goodwill A/c is never opened.",
      },
      {
        type: 'table',
        title: "Saffron Travels: Partners' Capital Accounts on 31 March 2026 (₹: Divya · Eshan · Fatima)",
        rows: [
          { label: 'Dr' },
          { label: "To Fatima's Capital A/c (goodwill)", amount: '90,000 · – · –' },
          { label: "To Eshan's Capital A/c (goodwill)", amount: '30,000 · – · –' },
          { label: 'To Bank A/c', amount: '– · – · 54,000' },
          { label: "To Fatima's Loan A/c", amount: '– · – · 3,00,000' },
          { label: 'To Balance c/d', amount: '1,82,000 · 2,54,000 · –' },
          { label: 'Total', amount: '3,02,000 · 2,54,000 · 3,54,000', total: true },
          { label: 'Cr' },
          { label: 'By Balance b/d', amount: '2,70,000 · 2,00,000 · 2,40,000' },
          { label: 'By General Reserve A/c', amount: '24,000 · 18,000 · 18,000' },
          { label: 'By Revaluation A/c (profit)', amount: '8,000 · 6,000 · 6,000' },
          { label: "By Divya's Capital A/c (goodwill)", amount: '– · 30,000 · 90,000' },
          { label: 'Total', amount: '3,02,000 · 2,54,000 · 3,54,000', total: true },
        ],
        note: "The General Reserve of ₹60,000 and the revaluation profit of ₹20,000 go to all three in the old ratio 4:3:3. Fatima's column totals ₹3,54,000: ₹54,000 is paid by cheque and ₹3,00,000 is left as a loan. Watch out: the retiring partner's column is closed, never carried down.",
      },
      {
        type: 'working',
        title: "Fatima's loan of ₹3,00,000, repaid in three equal yearly instalments with interest at 12% p.a.",
        lines: [
          'Instalment of principal = ₹3,00,000 ÷ 3 = ₹1,00,000, paid each 31 March with the interest of that year.',
          'Year 1: interest = ₹3,00,000 x 12% = ₹36,000; cheque = ₹1,00,000 + ₹36,000 = ₹1,36,000; balance ₹2,00,000.',
          'Year 2: interest = ₹2,00,000 x 12% = ₹24,000; cheque = ₹1,24,000; balance ₹1,00,000.',
          'Year 3: interest = ₹1,00,000 x 12% = ₹12,000; cheque = ₹1,12,000; balance nil.',
          'In the Loan A/c each year: "By Interest on Loan A/c" with the interest, "To Bank A/c" with the cheque, and the balance carried down.',
        ],
        note: 'Watch out: the interest falls every year, because it runs on the principal still unpaid, not on the original ₹3,00,000.',
      },
      {
        type: 'working',
        title: 'Harit Agro, a seed and fertiliser dealer in Nashik: Imran, Jaya and Karthik share 2:2:1. Karthik dies on 15 August 2025',
        lines: [
          '1 April to 15 August is 4 whole months and half a month: 4½ months.',
          "On time: last year's profit ₹3,60,000 x 4.5/12 = ₹1,35,000 for the firm; Karthik's 1/5 = ₹27,000.",
          "On sales, as this deed says: last year's profit ₹3,60,000 on sales of ₹24,00,000 is 15%. Sales from 1 April to 15 August ₹8,00,000 x 15% = ₹1,20,000; Karthik's 1/5 = ₹24,000.",
          'Interest on capital at 8% p.a. on ₹2,00,000 for 4½ months = ₹2,00,000 x 8% x 4.5/12 = ₹6,000, through Interest on Capital A/c.',
          'Share of goodwill: ₹1,50,000 x 1/5 = ₹30,000, paid by Imran and Jaya in their gaining ratio 1:1.',
          "Amount due = ₹2,00,000 + ₹6,000 + ₹24,000 + ₹30,000 - drawings ₹10,000 = ₹2,50,000, transferred to Karthik's Executor's A/c.",
        ],
        note: 'Watch out: use the basis the deed names. The two bases give different figures, and only one of them is right for the question.',
      },
      {
        type: 'example',
        title: "Karthik's share of profit to the date of death, on the sales basis",
        lines: [
          { accountId: 'profitAndLossSuspense', side: 'Dr', amount: 2400000 },
          { accountId: partnerCapital('Karthik'), side: 'Cr', amount: 2400000 },
        ],
        note: 'The profit of the year is not known on 15 August, so the estimate is held in Profit and Loss Suspense A/c. On 31 March, when the profit is known, it is closed: Profit and Loss Appropriation A/c Dr, To Profit and Loss Suspense A/c.',
      },
      {
        type: 'example',
        title: "Workmen Compensation Reserve ₹50,000 and a claim of ₹65,000, on Fatima's retirement",
        lines: [
          { accountId: 'workmenCompensationReserve', side: 'Dr', amount: 5000000 },
          { accountId: 'revaluation', side: 'Dr', amount: 1500000 },
          { accountId: 'workmenCompensationClaim', side: 'Cr', amount: 6500000 },
        ],
        note: 'The claim is met from the reserve first; the ₹15,000 the reserve cannot cover is a loss on revaluation. Had the claim been ₹20,000, the ₹30,000 left would have gone to all three partners in the old ratio. An Investment Fluctuation Reserve works the same way against a fall in the value of the investments.',
      },
      {
        type: 'text',
        heading: 'When capitals are fixed',
        body: "With fixed capitals the adjustments do not touch the capital accounts: the reserves, the result of revaluation and goodwill all go through the current accounts. At the end, the balance of the retiring partner's current account is transferred to the capital account (Current A/c Dr, To Capital A/c for a credit balance; the other way round for a debit balance), so that the capital account shows the whole amount due before it is paid or turned into a loan.",
      },
      { type: 'check', questionId: qid(4) },
      { type: 'check', questionId: qid(7) },
    ],
  },
  cards: {
    title: 'Rules, Formulas and Entries',
    description: 'Recall the gaining ratio, the goodwill entry, the amount due, the loan account and the rules on death.',
    cardIds: cards.map((c) => c.id),
  },
  recognition: [
    {
      title: 'Gaining Ratio and Goodwill',
      description: 'Recognise who gains, in what ratio, and who pays whom for goodwill.',
      questionIds: [1, 2, 3, 5, 6, 8, 9, 10, 11, 12].map(qid),
    },
    {
      title: 'Reserves, the Amount Due and Its Settlement',
      description: 'Choose the right treatment for reserves, the amount due, the loan account and the capitals of the continuing partners.',
      questionIds: [13, 14, 15, 34, 16, 17, 18, 19, 20, 21, 22, 35, 23, 24].map(qid),
    },
    {
      title: 'Death of a Partner',
      description: "Recognise the estimate of profit up to the date of death and the executor's account.",
      questionIds: [25, 26, 27, 28, 29, 30, 31, 32, 33].map(qid),
    },
  ],
  practice: [
    {
      title: 'New Ratio and Share of Goodwill',
      description: 'The new ratio and the gaining ratio in the simple cases, the share of goodwill and the first goodwill entries.',
      templateIds: ['ret-ratio-no-info', 'ret-ratio-one-takes', 'ret-gain-ratio-stated', 'ret-gw-share', 'ret-gw-entry-one-takes', 'ret-gw-written-off'],
      count: 8,
    },
    {
      title: 'Reserves, Settlement and First Steps on Death',
      description: 'Shares of reserves and losses, paying the amount due, interest on the loan, and the months of profit on death.',
      templateIds: [
        'ret-reserve-share', 'ret-reserve-entry', 'ret-accumulated-loss-entry', 'ret-settle-loan-amount', 'ret-settle-entry', 'ret-loan-interest',
        'ret-cap-new-capital', 'ret-death-months', 'ret-death-profit-last-year', 'ret-exec-entry',
      ],
      count: 8,
    },
    {
      title: 'From the Gaining Ratio to the Goodwill Entry (Guided)',
      description: 'Put the shares on a common denominator, find each gain, then debit the partners who gain.',
      templateIds: ['ret-ratio-share-in-ratio', 'ret-gain-ratio-agreed', 'ret-gw-entry-gaining'],
      count: 6,
      guided: true,
    },
    {
      title: 'Goodwill and Revaluation',
      description: 'The goodwill entry under an agreed ratio, hidden goodwill, goodwill already in the books, and the result of revaluation.',
      templateIds: ['ret-gw-entry-new-ratio', 'ret-gw-hidden', 'ret-gw-net-effect', 'ret-reval-entry', 'ret-reval-share'],
      count: 8,
    },
    {
      title: 'Amount Due, Loan Account and Capitals',
      description: "The amount due to the retiring partner, the loan account with interest and instalments, and the continuing partners' capitals in the new ratio.",
      templateIds: ['ret-amount-due', 'ret-loan-instalment', 'ret-loan-first-close', 'ret-loan-payment-entry', 'ret-cap-cash', 'ret-cap-shortfall', 'ret-cap-entry'],
      count: 8,
    },
    {
      title: 'Death of a Partner',
      description: 'Profit up to the date of death by time and by sales, its entry, and the amount due to the executor.',
      templateIds: ['ret-death-profit-average', 'ret-death-profit-turnover', 'ret-death-profit-entry', 'ret-exec-amount', 'ret-exec-first-payment'],
      count: 8,
    },
    {
      title: 'Complex Problems on Retirement and Death',
      description: 'A partner who also sacrifices, goodwill valued from profits, amounts due in the middle of a year, and capitals adjusted to pay the retiring partner.',
      templateIds: [
        'ret-gain-with-sacrifice', 'ret-ratio-two-of-three', 'ret-gw-entry-sacrifice', 'ret-gw-valuation-share', 'ret-amount-due-midyear', 'ret-amount-due-reverse',
        'ret-loan-second-close', 'ret-cap-pay-retiring', 'ret-death-profit-rate-change', 'ret-exec-amount-full',
      ],
      count: 8,
    },
  ],
  mixed: { title: 'Mixed Practice: Retirement and Death', description: 'Everything in this topic, shuffled the way an examination serves it.', count: 12 },
  challenge: { title: 'Challenge: Retirement and Death', description: 'The hardest questions of the topic, against the clock.', count: 8 },
  // "Pass the necessary journal entries": the entries of one retirement or one death, lettered, for one firm. These
  // levels come after every other one and have ids of their own, so the ids of the levels above never move.
  sets: [
    {
      title: 'Journal Entries on a Retirement',
      description: 'One retirement, three to five entries: goodwill through the capital accounts of the partners who gain, goodwill in the books written off, the reserve and the result of revaluation shared in the old ratio, and the amount due paid or left as a loan.',
      templateIds: ['ret-set-goodwill', 'ret-set-retirement'],
      count: 3,
    },
    {
      title: 'Journal Entries on a Death, and a Whole Retirement',
      description: "A death during the year, with interest on capital and the share of profit to the date of death and the transfer to the executor; and a whole retirement, with the continuing partners' capitals brought to the new ratio and the first instalment of the loan with interest.",
      templateIds: ['ret-set-death', 'ret-set-whole-retirement'],
      count: 2,
    },
    {
      title: 'Journal Entries on a Retirement with Fixed Capitals',
      description: "Capitals are fixed: an earmarked reserve, the General Reserve, the result of revaluation and goodwill go through the current accounts; the retiring partner's current account is closed to the capital account, which is then paid or left as a loan.",
      templateIds: ['ret-set-fixed-capitals'],
      count: 2,
    },
  ],
  // Accounts and a balance sheet the student prepares. Each level serves two; the first opens with the easy one, the
  // Revaluation Account.
  formats: [
    {
      title: 'Prepare the Accounts of a Retirement',
      description: "The Revaluation Account, the partners' capital accounts in columns with the retiring partner's column closed by transfer to the loan account, and the loan account over two or three years of instalments with interest.",
      templateIds: ['ret-fmt-revaluation', 'ret-fmt-capitals', 'ret-fmt-loan'],
      count: 2,
    },
    {
      title: 'Prepare the Accounts of a Death, and the New Balance Sheet',
      description: "The deceased partner's capital account to the date of death, the executor's account over two or three years with interest for a part year first, and the balance sheet of the continuing partners after a retirement.",
      templateIds: ['ret-fmt-deceased-capital', 'ret-fmt-executor', 'ret-fmt-balance-sheet'],
      count: 2,
    },
    {
      title: "Prepare the Partners' Current Accounts on a Retirement",
      description: "Capitals are fixed: the current accounts in columns, with an earmarked reserve, the General Reserve, the result of revaluation and goodwill, and the retiring partner's column closed to the capital account.",
      templateIds: ['ret-fmt-current-accounts'],
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
      {
        name: 'earmarked-reserves',
        type: 'medium_practice',
        title: 'Workmen Compensation and Investment Fluctuation Reserves',
        description: 'A reserve kept for a purpose meets its claim or the fall in value first; what is left goes to all the partners, and a shortfall is a loss on revaluation.',
        generate: { templateIds: ['ret-earmarked-share', 'ret-wcr-claim', 'ret-ifr'], count: 6 },
      },
      {
        name: 'fixed-capitals-and-death',
        type: 'medium_practice',
        title: 'Fixed Capitals, a Death Mid-month and Profit and Loss Suspense',
        description: "Close the retiring partner's current account to the capital account, count half a month when a partner dies on the 15th, and close Profit and Loss Suspense A/c at the end of the year.",
        generate: { templateIds: ['ret-current-transfer', 'ret-death-mid-month', 'ret-suspense-close'], count: 6 },
      },
      {
        name: 'assertion-reason',
        type: 'medium_practice',
        title: 'Assertion and Reason',
        description: 'The one-mark question of the board: judge the Assertion, judge the Reason, and say whether the Reason explains the Assertion.',
        generate: { templateIds: ['ret-assertion-reason'], count: 6 },
      },
    ]),
  ],
  questions,
};

export default pack;
