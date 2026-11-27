import { loanToPartner, partnerCapital, partnerLoan } from '@/engine/accounts';
import type { JournalLine } from '@/engine/journal';
import { buildLadder, laterLevels } from '../ladder';
import type { Card, Concept, Difficulty, JournalQuestion, McqQuestion, NumericQuestion, Question, TopicPack, TrueFalseQuestion } from '../types';

const T = 'dissolution-of-partnership';

const concepts: Concept[] = [
  { id: 'dis-meaning', topicId: T, title: 'Dissolution of partnership and dissolution of the firm' },
  { id: 'dis-settlement', topicId: T, title: 'Settlement of accounts and its order (section 48)' },
  { id: 'dis-realisation', topicId: T, title: 'Realisation Account: what goes to it and its profit or loss' },
  { id: 'dis-taken-over', topicId: T, title: 'Assets sold or taken over, liabilities paid or taken over' },
  { id: 'dis-unrecorded', topicId: T, title: 'Unrecorded assets and liabilities' },
  { id: 'dis-expenses', topicId: T, title: 'Realisation expenses' },
  { id: 'dis-loans', topicId: T, title: "A partner's loan, a loan to a partner and a loan from a relative" },
  { id: 'dis-closing', topicId: T, title: 'Closing the capital accounts and the bank account' },
  { id: 'dis-sets', topicId: T, title: 'Journalising a dissolution' },
  { id: 'dis-formats', topicId: T, title: 'Preparing the Realisation Account, the capital accounts and the Bank Account' },
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
): Card => ({ id: `dis-card-${n}`, topicId: T, conceptId, kind, prompt, answer, explanation, example, commonMistake });

const cards: Card[] = [
  card(1, 'dis-meaning', 'rule', 'How does dissolution of a partnership differ from dissolution of a firm?',
    'Dissolution of partnership: the agreement among the partners changes (admission, retirement, death, a new ratio) but the business goes on. Dissolution of the firm: the business itself is closed, the assets are realised, the liabilities paid and the books closed.',
    'Dissolution of the firm always ends the partnership as well. Dissolution of the partnership need not end the firm.',
    'Meera retires and Kunal and Arif carry on: only the partnership is dissolved. Kunal and Arif later close the shop and sell everything: the firm is dissolved.',
    'Saying that every retirement or death dissolves the firm, or that a firm can be dissolved while the partnership continues.'),
  card(2, 'dis-meaning', 'rule', 'In what ways can a firm be dissolved?',
    '1) By agreement: all the partners consent, or a contract among them provides for it. 2) Compulsorily: the business becomes unlawful (or all partners, or all but one, become insolvent). 3) On the happening of an event, unless agreed otherwise: a fixed term ends, the venture is completed, a partner dies or is adjudged insolvent. 4) By notice in writing from a partner, in a partnership at will. 5) By the court, on a suit by a partner.',
    'The court may order dissolution when a partner is of unsound mind, permanently incapable, guilty of misconduct or of persistent breach of the agreement, has transferred the whole interest to an outsider, when the business can run only at a loss, or on any other just and equitable ground.',
    'A firm formed to build one bridge is dissolved when the bridge is complete: dissolution on the happening of an event.',
    'Calling it dissolution "by the court" just because there is a quarrel. The court dissolves a firm only on a suit by a partner.'),
  card(3, 'dis-settlement', 'rule', 'In what order is the money of a dissolved firm applied (section 48)?',
    '1) Debts of the firm to outsiders. 2) Loans given to the firm by partners. 3) The capitals of the partners. 4) Whatever is left, to the partners in their profit-sharing ratio.',
    'Outsiders come before partners, and partners as lenders come before partners as owners. A loss, including a shortfall of capital, is met first out of profits, then out of capital, and lastly by the partners personally in their profit-sharing ratio.',
    'Cash ₹5,00,000; creditors ₹1,00,000; a partner\'s loan ₹50,000; capitals ₹3,00,000. Pay ₹1,00,000, then ₹50,000, then ₹3,00,000; the surplus of ₹50,000 is shared in the profit-sharing ratio.',
    'Repaying a partner\'s loan before the outside creditors, or sharing the surplus in the ratio of capitals.'),
  card(4, 'dis-settlement', 'rule', "How are a partner's private debts and the firm's debts kept apart?",
    "The firm's property pays the firm's debts first; only a partner's share of any surplus can go to that partner's private creditors. A partner's private property pays the private debts first; only a surplus can be used for the firm's debts.",
    'Each set of creditors has the first claim on the property it lent against.',
    'A partner has private assets of ₹4,00,000 and private debts of ₹3,00,000. Only the surplus of ₹1,00,000 is available for the debts of the firm.',
    "Using the whole of a partner's private property for the firm's creditors before the private creditors are paid."),
  card(5, 'dis-realisation', 'format', 'What is entered on each side of Realisation A/c?',
    'Debit: assets transferred at book value (gross); amounts paid for liabilities, including unrecorded ones; realisation expenses or the remuneration agreed in place of them; the profit, transferred to capital accounts. Credit: outside liabilities and provisions transferred; money realised from assets, including unrecorded ones; assets taken over by partners; the loss, transferred to capital accounts.',
    'The account gathers every asset and outside liability once at its book figure and once at what it actually fetched or cost. The difference is the profit or loss of winding up.',
    'Assets ₹4,00,000 fetch ₹3,70,000; creditors ₹90,000 are paid ₹88,000; expenses ₹3,000. Debit 4,00,000 + 88,000 + 3,000 = 4,91,000; credit 90,000 + 3,70,000 = 4,60,000; loss ₹31,000.',
    'Crediting the asset accounts again when the assets are sold. They were closed by the transfer: the sale is Bank A/c Dr; To Realisation A/c.'),
  card(6, 'dis-realisation', 'rule', 'Which balances are NOT transferred to Realisation A/c, and where do they go?',
    "Cash and bank: they stay in their own accounts. Fictitious assets (a debit balance of Profit and Loss A/c, Advertisement Suspense, deferred revenue expenditure): debited to the capital accounts in the profit-sharing ratio. Reserves and undistributed profits: credited to the capital accounts in the profit-sharing ratio. A partner's loan: repaid by itself. A loan to a partner: debited to that partner's capital. Capitals: closed last, through Bank A/c.",
    'Only what can be turned into money, and what is owed to outsiders, belongs in Realisation A/c.',
    'General Reserve ₹30,000, partners sharing 2:1: General Reserve A/c Dr 30,000; To the capital accounts 20,000 and 10,000.',
    "Transferring General Reserve or a partner's own loan to the credit of Realisation A/c with the creditors."),
  card(7, 'dis-realisation', 'rule', 'How are an asset and the provision against it transferred?',
    'The asset goes to the debit of Realisation A/c at its gross figure, and the provision (for doubtful debts, for depreciation) goes to the credit of Realisation A/c.',
    'Each ledger account is closed at its own balance. The provision then absorbs that much of any shortfall when the asset is realised.',
    'Debtors ₹1,00,000, provision ₹5,000, collected ₹93,000: debit 1,00,000; credit 5,000 + 93,000 = 98,000; loss ₹2,000, not ₹7,000.',
    'Sending the provision to the capital accounts as if it were a reserve, or forgetting it, which overstates the loss.'),
  card(8, 'dis-realisation', 'rule', 'What is assumed when the realised value of an asset is not given?',
    'A tangible asset is taken as realised at its book value. An intangible asset (goodwill, patents, trademarks) is taken as realising nothing.',
    'This is the note in the CBSE syllabus. It applies only when the question is silent: a stated value always wins.',
    'Furniture ₹40,000 and goodwill ₹25,000, nothing said about either: furniture brings in ₹40,000 (no profit, no loss); goodwill brings in nil (a loss of ₹25,000).',
    'Taking goodwill at its book value, or leaving the silent asset out of Realisation A/c altogether.'),
  card(9, 'dis-realisation', 'formula', 'How is the profit or loss on realisation found and shared?',
    'Profit = total of the credit side - total of the debit side (a loss when the debit side is heavier). It is shared among all the partners in their profit-sharing ratio. Profit: Realisation A/c Dr; To Capital A/cs. Loss: Capital A/cs Dr; To Realisation A/c.',
    'It is the last profit or loss of the firm, so it follows the profit-sharing ratio, never the capital ratio.',
    'Credit ₹5,20,000, debit ₹5,50,000: loss ₹30,000; partners 3:2 bear ₹18,000 and ₹12,000.',
    'Sharing it in the ratio of capitals or equally, or reading a heavier debit side as a profit.'),
  card(10, 'dis-taken-over', 'format', 'What are the entries when an asset is sold, and when a partner takes it over?',
    "Sold: Bank (or Cash) A/c Dr; To Realisation A/c, with the amount received. Taken over by a partner: that partner's Capital A/c Dr; To Realisation A/c, with the agreed value.",
    'The asset account itself is already closed. A partner who takes an asset is treated as having bought it: the price is charged to the capital account in place of cash.',
    "Stock of book value ₹50,000 taken over by Anu at ₹46,000: Anu's Capital A/c Dr 46,000; To Realisation A/c 46,000.",
    'Crediting Stock A/c, or using the book value when a different value was agreed.'),
  card(11, 'dis-taken-over', 'rule', 'What is the entry when a creditor accepts an asset in settlement?',
    'In full settlement: no entry at all. In part settlement: no entry for the asset; only the cash paid for the balance is recorded, Realisation A/c Dr; To Bank A/c. If the asset is worth more than the debt, the creditor pays the difference: Bank A/c Dr; To Realisation A/c.',
    'The asset (debit side) and the creditor (credit side) are both already in Realisation A/c, so handing one over to settle the other needs nothing more.',
    'Creditors ₹60,000 accept stock at ₹45,000 and a cheque for the rest: Realisation A/c Dr 15,000; To Bank A/c 15,000.',
    'Passing "Creditors A/c Dr; To Stock A/c", or paying the whole ₹60,000 by cheque as well.'),
  card(12, 'dis-taken-over', 'format', 'What are the entries when a liability is paid, and when a partner takes it over?',
    "Paid: Realisation A/c Dr; To Bank A/c, with the amount actually paid (so a discount needs no entry). Taken over by a partner: Realisation A/c Dr; To that partner's Capital A/c.",
    'The liability account is already closed. A partner who agrees to pay a debt of the firm is owed that amount by the firm, so the capital account is credited.',
    "Creditors of ₹80,000 paid ₹78,000 in full settlement: Realisation A/c Dr 78,000; To Bank A/c 78,000. The ₹2,000 saved stays in Realisation A/c as a gain.",
    'Debiting Creditors A/c again, or passing a separate entry for the discount received.'),
  card(13, 'dis-unrecorded', 'rule', 'How are unrecorded assets and liabilities dealt with?',
    "Unrecorded asset sold: Bank A/c Dr; To Realisation A/c. Taken over by a partner: Capital A/c Dr; To Realisation A/c. Unrecorded liability paid: Realisation A/c Dr; To Bank A/c. Met by a partner: Realisation A/c Dr; To Capital A/c.",
    'Nothing was transferred for them, because they were not in the books. So the whole amount received is a gain and the whole amount paid is a loss. A contingent liability (a bill discounted) needs an entry only if the firm actually has to pay.',
    'An old typewriter, written off earlier, sells for ₹3,000: Bank A/c Dr 3,000; To Realisation A/c 3,000.',
    'First "bringing the asset into the books", or debiting Realisation A/c for an unrecorded asset.'),
  card(14, 'dis-expenses', 'format', 'What is the entry for realisation expenses in each case?',
    "1) Borne and paid by the firm: Realisation A/c Dr; To Bank A/c. 2) Borne by the firm, paid by a partner: Realisation A/c Dr; To Partner's Capital A/c. 3) Borne and paid by a partner: no entry. 4) Borne by a partner, paid by the firm: Partner's Capital A/c Dr; To Bank A/c. 5) Partner bears them for an agreed remuneration: Realisation A/c Dr; To Partner's Capital A/c with the remuneration (and entry 4 as well if the firm paid the expenses).",
    'Ask two things: who bears the expenses, and whose money paid them? Realisation A/c is debited only with what the firm bears.',
    "Rina gets ₹10,000 to bear all expenses and spends ₹8,000 of Rina's own money: Realisation A/c Dr 10,000; To Rina's Capital A/c 10,000. No entry for the ₹8,000.",
    'Debiting Realisation A/c with the actual expenses as well as the remuneration.'),
  card(15, 'dis-loans', 'rule', "How are a partner's loan, a relative's loan and a loan to a partner treated?",
    "Loan from a partner: kept out of Realisation A/c and repaid after the outside liabilities, Partner's Loan A/c Dr; To Bank A/c. Loan from a partner's spouse or other relative: an outside liability, transferred to the credit of Realisation A/c and paid through it. Loan to a partner: kept out of Realisation A/c and debited to that partner's Capital A/c. A partner who takes over an asset in part payment of that partner's own loan: Partner's Loan A/c Dr; To Realisation A/c, so less of the loan is left to repay.",
    'A relative is an outsider in law, however close. A partner who lends to the firm ranks after outsiders but before capitals.',
    "Balance sheet: Mrs. Rao's loan ₹40,000 and Rao's loan ₹30,000. Mrs. Rao's loan goes through Realisation A/c; Rao's loan is repaid by itself afterwards.",
    "Transferring the partner's own loan to Realisation A/c, or leaving the relative's loan out of it."),
  card(16, 'dis-closing', 'format', "What goes into a partner's capital account on dissolution, and how is it closed?",
    'Credit: the balance, the share of reserves and undistributed profit, the share of a profit on realisation, liabilities taken over, expenses paid for the firm or remuneration. Debit: the share of accumulated losses and fictitious assets, the share of a loss on realisation, assets taken over, a loan to the partner, drawings. A credit balance is paid: Capital A/c Dr; To Bank A/c. A debit balance is brought in: Bank A/c Dr; To Capital A/c.',
    'When capitals are fixed, the current accounts are first closed by transfer to the capital accounts.',
    'Capital ₹2,00,000 + reserve share ₹12,000 - loss share ₹18,000 - stock taken over ₹40,000 = ₹1,54,000 paid to the partner.',
    'Forgetting to debit the asset the partner took over, so that the bank account does not agree.'),
  card(17, 'dis-closing', 'shortcut', 'How do you know the dissolution accounts are right?',
    'Bank A/c: opening balance + all money received = all payments, the last of which are the balances of the capital accounts. If the two sides agree, every account has closed.',
    'Assets taken over by partners or accepted by creditors never pass through Bank A/c, because no money moves.',
    'Opening ₹20,000 + realised ₹4,60,000 = ₹4,80,000; paid creditors ₹88,000, expenses ₹3,000, partner\'s loan ₹39,000 = ₹1,30,000; so ₹3,50,000 must be the total due to the partners.',
    'Entering assets taken over by partners in Bank A/c, or leaving out the opening balance.'),
  card(18, 'dis-realisation', 'shortcut', 'How is Realisation A/c different from Revaluation A/c?',
    'Revaluation A/c is prepared when the firm is reconstituted and goes on: it records only the changes in value, and the asset accounts stay open. Realisation A/c is prepared when the firm is dissolved: every asset and outside liability is transferred to it and its account closed.',
    'Goodwill shows the difference well: on reconstitution, goodwill in the books is written off to the old partners; on dissolution it is transferred to Realisation A/c like any other asset.',
    'Machinery ₹1,00,000 now worth ₹90,000. Revaluation A/c is debited with ₹10,000 only. On dissolution, Realisation A/c is debited with ₹1,00,000 and credited with whatever the machinery fetches.',
    'Writing off goodwill to the capital accounts on dissolution, as is done on admission or retirement.'),
];

// ---------------------------------------------------------------------------------------------------------------
// Authored questions
// ---------------------------------------------------------------------------------------------------------------

const qid = (n: number): string => `dis-q-${String(n).padStart(3, '0')}`;

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

const AR = {
  both: 'Both A and R are true, and R is the correct explanation of A',
  bothNot: 'Both A and R are true, but R is not the correct explanation of A',
  aOnly: 'A is true but R is false',
  rOnly: 'A is false but R is true',
};
const BOARD_ORDER = [AR.both, AR.bothNot, AR.aOnly, AR.rOnly];

const questions: Question[] = [
  // ---- Dissolution, its modes and the order of payment (recognition) ----
  mcq(1, 'dis-meaning', 'easy', 'Which statement about the dissolution of a firm is correct?',
    'It always brings the partnership among the partners to an end as well',
    [
      ['The business continues under a new agreement among the partners', 'Described the dissolution of a partnership; when the firm is dissolved the business itself stops.'],
      ['It happens whenever a partner retires', 'Took a change among the partners for the end of the firm; on retirement the others may carry on.'],
      ['The books of account are kept open for the remaining partners', 'Missed that the books are closed: assets are realised and every account is settled.'],
    ],
    'When the firm is dissolved the business ends, the assets are realised, the accounts are settled and the partnership necessarily ends too.',
    ['Does the business go on after the firm is dissolved?', 'The firm is the partners taken together; if it ends, so does their agreement.']),
  tf(2, 'dis-meaning', 'easy', 'Dissolution of a partnership always means that the firm is dissolved as well.', false,
    'A partnership is dissolved whenever the agreement among the partners changes (admission, retirement, death, a new ratio). The business can go on, so the firm need not be dissolved.',
    ['Think of a partner retiring while the others carry on.']),
  mcq(3, 'dis-meaning', 'easy', 'Zubin retires from the firm of Zubin, Hema and Ravi. Hema and Ravi carry on the business. Which of these is done?',
    'The assets are revalued and the business continues; the books are not closed',
    [
      ['Realisation A/c is prepared and all the assets are sold', 'Treated a retirement as the dissolution of the firm; the business is not being wound up.'],
      ['Every partner is paid off and the bank account is closed', 'Closed the books, which is done only when the firm itself is dissolved.'],
      ['Nothing at all: the old agreement goes on unchanged', 'Missed that the partnership has been dissolved: a new agreement is needed among those who remain.'],
    ],
    'Only the partnership is dissolved. The firm is reconstituted: assets and liabilities are revalued, the retiring partner is settled and the business goes on.',
    ['Is the business being closed down?', 'Realisation A/c belongs to the dissolution of the firm, Revaluation A/c to a reconstitution.']),
  mcq(4, 'dis-meaning', 'easy', 'On which of these grounds can a firm be dissolved only through an order of the court?',
    'A partner has become of unsound mind',
    [
      ['All the partners agree to dissolve the firm', 'This is dissolution by agreement; no court is needed.'],
      ['The business of the firm has become unlawful', 'This is compulsory dissolution; it happens by law, without a suit.'],
      ['The fixed term for which the firm was formed has ended', 'This is dissolution on the happening of an event; no court is needed.'],
    ],
    'Unsoundness of mind of a partner is a ground on which the court may dissolve the firm when another partner files a suit.',
    ['Which of these needs a partner to file a suit?', 'By agreement, compulsory, on an event and by notice all work without a court.']),
  tf(5, 'dis-meaning', 'easy', 'If the business of a firm becomes unlawful, the firm is dissolved even if every partner wants to continue.', true,
    'This is compulsory dissolution: a firm cannot carry on a business that the law forbids, whatever the partners wish.',
    ['Can partners agree to carry on an unlawful business?']),
  mcq(6, 'dis-meaning', 'medium', 'In a partnership at will, Farida wants the firm dissolved but the other partners do not. What can Farida do without going to court?',
    'Give the other partners a notice in writing of the intention to dissolve the firm',
    [
      ['Nothing: a firm can be dissolved only if all the partners agree', 'Thought agreement is the only mode; in a partnership at will a notice from one partner is enough.'],
      ['Stop coming to the office, which dissolves the firm automatically', 'Took absence for a mode of dissolution; a written notice is required.'],
      ['Wait for the firm to make a loss', 'Mixed this up with a ground for dissolution by the court, which needs a suit.'],
    ],
    'A partnership at will can be dissolved by any partner giving notice in writing to all the other partners of the intention to dissolve the firm.',
    ['What is special about a partnership "at will"?', 'Dissolution by notice needs neither consent nor a court.']),
  mcq(7, 'dis-settlement', 'easy', 'On dissolution, the money realised from the assets of the firm is applied first of all in paying:',
    'The debts of the firm to outsiders',
    [
      ['Loans that partners have given to the firm', "Put the partners' loans first; they are repaid second, after outsiders."],
      ['The capitals of the partners', 'Put capital first; it is returned third, after outside debts and partners\' loans.'],
      ['Each partner an equal share', 'Ignored the order of section 48 altogether.'],
    ],
    "Section 48: debts to outsiders, then partners' loans, then capitals, then the surplus in the profit-sharing ratio.",
    ['Who must never lose because the partners decided to close?', 'Outsiders first, then partners as lenders, then partners as owners.']),
  tf(8, 'dis-settlement', 'easy', "A loan given to the firm by a partner is repaid before the firm's outside creditors, because the partner is an owner.", false,
    "It is the other way round: outside creditors are paid first, and a partner's loan only after them (but before the capitals).",
    ['Section 48 puts outsiders ahead of every claim of a partner.']),
  mcq(9, 'dis-settlement', 'medium', 'Under section 48, a loss of the firm on dissolution, including a deficiency of capital, is made good:',
    'First out of profits, next out of capital, and lastly by the partners personally in their profit-sharing ratio',
    [
      ['First by the partners personally, then out of capital, and lastly out of profits', 'Reversed the order; undistributed profits are used first.'],
      ['Out of capital only, in the ratio of capitals', 'Used the capital ratio; losses follow the profit-sharing ratio.'],
      ['By the outside creditors, who accept less than is due to them', 'Passed the loss to outsiders; the partners bear the losses of the firm.'],
    ],
    'Losses are paid first out of profits, next out of capital, and lastly, if necessary, by the partners individually in the proportion in which they share profits.',
    ['What is used up first: profit kept in the business, or the capital itself?']),
  mcq(10, 'dis-settlement', 'medium', "Tarun, a partner, has private property worth ₹6,00,000 and private debts of ₹4,50,000. The firm's assets are not enough to pay the firm's creditors. How much of Tarun's private property is available for the creditors of the firm?",
    '₹1,50,000',
    [
      ['₹6,00,000', "Used the whole of the private property; the private debts have the first claim on it."],
      ['₹4,50,000', 'Gave the amount of the private debts instead of what is left after paying them.'],
      ['Nothing', "Kept the private property wholly out of reach; the surplus after private debts can be used for the firm's debts."],
    ],
    "Private property is applied first to private debts: ₹6,00,000 - ₹4,50,000 = ₹1,50,000 is the surplus available for the firm's debts.",
    ["Which creditors have the first claim on a partner's own property?"]),
  mcq(11, 'dis-loans', 'medium', "Assertion (A): On dissolution, a loan taken from a partner's wife is transferred to the credit of Realisation A/c. Reason (R): A relative of a partner is an outsider, so the loan is an outside liability of the firm.",
    AR.both,
    [
      [AR.bothNot, 'Missed the link: the loan goes to Realisation A/c precisely because it is an outside liability.'],
      [AR.aOnly, 'Treated a relative as if the relative were a partner; only a person who is a partner is an insider.'],
      [AR.rOnly, "Gave the loan the treatment of a partner's own loan, which is kept out of Realisation A/c."],
    ],
    "The partner's wife is not a partner. The loan is therefore an outside liability: it is transferred to Realisation A/c and paid with the other outside liabilities.",
    ['Is the lender a partner of the firm?', "Only a partner's own loan stays out of Realisation A/c."]),
  mcq(12, 'dis-realisation', 'easy', 'Realisation A/c is prepared:',
    'When the firm is dissolved, to find the profit or loss on selling the assets and paying the liabilities',
    [
      ['When a partner is admitted, to record the changes in the values of assets', 'Described Revaluation A/c, which is prepared on a reconstitution.'],
      ['At the end of every year, to share the profit among the partners', 'Described Profit and Loss Appropriation A/c.'],
      ['When a partner retires, to work out the amount due to that partner', "Described the retiring partner's capital account, together with Revaluation A/c."],
    ],
    'Realisation A/c is opened only on the dissolution of the firm. Assets and outside liabilities are transferred to it and its balance is the profit or loss of winding up.',
    ['Realise means to turn into money.']),
  mcq(13, 'dis-realisation', 'medium', 'How does Realisation A/c differ from Revaluation A/c?',
    'All assets and outside liabilities are transferred to Realisation A/c and their accounts closed; Revaluation A/c records only the changes in their values',
    [
      ['Realisation A/c records only the changes in values; all the assets are transferred to Revaluation A/c', 'Swapped the two accounts.'],
      ['The balance of Realisation A/c is shared in the capital ratio; that of Revaluation A/c in the profit-sharing ratio', 'Used the capital ratio; both balances are shared in the profit-sharing ratio.'],
      ['There is no difference: the two names are used for the same account', 'Missed that one closes the books and the other keeps them running.'],
    ],
    'On dissolution the asset and liability accounts are closed by transfer to Realisation A/c. On reconstitution they stay open and Revaluation A/c takes only the increases and decreases.',
    ['After which of the two do the asset accounts still exist?']),

  // ---- What the Realisation Account holds (treatment) ----
  tf(14, 'dis-realisation', 'easy', 'On dissolution, the cash and bank balances are transferred to the debit of Realisation A/c with the other assets.', false,
    'Cash and bank are already money: nothing has to be realised. They stay in their own accounts, which receive the proceeds and make the payments.',
    ['What does "realise" mean, and does cash need it?']),
  mcq(15, 'dis-realisation', 'easy', 'A firm is dissolved. Its balance sheet shows General Reserve ₹60,000. The reserve is:',
    "Credited to the partners' capital accounts in the profit-sharing ratio",
    [
      ['Transferred to the credit of Realisation A/c', 'Treated the reserve as an outside liability; it is profit that belongs to the partners.'],
      ['Paid to the creditors along with their dues', 'Took the reserve for money owed to outsiders.'],
      ["Credited to the partners' capital accounts in the ratio of their capitals", 'Used the capital ratio; reserves are accumulated profit and follow the profit-sharing ratio.'],
    ],
    'A reserve is undistributed profit. It is not transferred to Realisation A/c: General Reserve A/c Dr; To the capital accounts, in the profit-sharing ratio.',
    ['Is a reserve owed to anyone outside the firm?']),
  mcq(16, 'dis-realisation', 'medium', 'Goodwill appears in the balance sheet at ₹40,000 on the date the firm is dissolved. How is it dealt with?',
    'It is transferred to the debit of Realisation A/c like any other asset',
    [
      ['It is written off to the capital accounts in the profit-sharing ratio', 'Applied the treatment for admission or retirement; on dissolution goodwill in the books goes to Realisation A/c.'],
      ['It is left in the books until a buyer is found', 'Kept an account open; every asset account is closed on dissolution.'],
      ['It is transferred to the credit of Realisation A/c', 'Put an asset on the liabilities side of Realisation A/c.'],
    ],
    'Goodwill in the books is an asset, so it is transferred to the debit of Realisation A/c. If nothing is said about what it fetched, it is taken to realise nil, and the whole ₹40,000 is a loss.',
    ['Reconstitution and dissolution treat goodwill in the books differently.']),
  mcq(17, 'dis-realisation', 'medium', 'The balance sheet shows Machinery ₹5,00,000 on the assets side and Provision for Depreciation ₹1,50,000 on the liabilities side. How are they transferred to Realisation A/c?',
    'Machinery ₹5,00,000 to the debit and the provision ₹1,50,000 to the credit',
    [
      ['Only the machinery, ₹5,00,000, to the debit; the provision goes to the capital accounts', 'Treated the provision as a reserve; it stands against the asset and is closed through Realisation A/c.'],
      ['Machinery ₹5,00,000 and the provision ₹1,50,000, both to the debit', 'Put the provision on the same side as the asset, which counts it as another asset.'],
      ['Nothing: machinery with a provision against it is not transferred', 'Left the asset out; every asset other than cash and bank is transferred.'],
    ],
    'Each account is closed at its own balance: the asset at its gross figure on the debit, the provision against it on the credit.',
    ['Is a provision for depreciation a profit kept back, or a reduction of an asset?']),
  tf(18, 'dis-taken-over', 'medium', 'When a creditor accepts an asset of the firm in full settlement of the debt, the entry is: Realisation A/c Dr; To Asset A/c.', false,
    'No entry is passed. The asset and the creditor are both already in Realisation A/c, and no money moves.',
    ['Where are the asset account and the creditors account by this stage?']),
  mcq(19, 'dis-unrecorded', 'medium', 'An old computer that had been written off completely is sold for ₹6,000 during the dissolution. The amount is:',
    'Debited to Bank A/c and credited to Realisation A/c',
    [
      ['Debited to Realisation A/c and credited to Bank A/c', 'Reversed the entry: money came in, and it is a gain.'],
      ['Debited to Bank A/c and credited to Computers A/c', 'Credited an asset account that has no balance: the computer was written off.'],
      ["Credited straight to the partners' capital accounts", 'Skipped Realisation A/c, where every gain of winding up is first gathered.'],
    ],
    'An unrecorded asset has no book value, so the whole of what it fetches is a gain: Bank A/c Dr; To Realisation A/c.',
    ['Was anything transferred to Realisation A/c for this computer?']),
  mcq(20, 'dis-expenses', 'medium', "Lata, a partner, agreed to bear all the realisation expenses. They came to ₹7,000 and Lata paid them out of Lata's own pocket. No remuneration was agreed. What entry does the firm pass?",
    'No entry',
    [
      ['Realisation A/c Dr 7,000; To Bank A/c 7,000', "Charged the firm and credited its bank; the firm neither bears nor pays these expenses."],
      ["Realisation A/c Dr 7,000; To Lata's Capital A/c 7,000", 'Gave Lata credit, which is right only when the firm bears the expenses and a partner pays for it.'],
      ["Lata's Capital A/c Dr 7,000; To Bank A/c 7,000", "Recorded a payment out of the firm's bank; Lata paid out of Lata's own money."],
    ],
    'The expenses are borne by Lata and paid by Lata. Nothing is owed by or to the firm, and none of its money moves.',
    ['Who bears the expenses? Whose money paid them?']),
  mcq(21, 'dis-realisation', 'medium', "Assertion (A): On dissolution, a debit balance of Profit and Loss A/c is not transferred to Realisation A/c. Reason (R): It is an accumulated loss, which cannot be realised and has to be borne by the partners.",
    AR.both,
    [
      [AR.bothNot, 'Missed the link: it stays out of Realisation A/c precisely because nothing can be realised from a past loss.'],
      [AR.aOnly, 'Denied that a debit balance of Profit and Loss A/c is an accumulated loss.'],
      [AR.rOnly, 'Sent the loss to Realisation A/c as if it were an asset that could be sold.'],
    ],
    "A past loss is a fictitious asset. It is debited to the partners' capital accounts in the profit-sharing ratio.",
    ['Can anyone buy a past loss?']),
  mcq(22, 'dis-loans', 'complex', "The balance sheet of a dissolved firm shows: Creditors ₹90,000; Mrs. Nair's loan ₹40,000 (Mrs. Nair is the wife of the partner Nair); Nair's loan ₹50,000. All three are paid in full by cheque. What total is debited to Realisation A/c for these payments?",
    '₹1,30,000',
    [
      ['₹1,80,000', "Passed the partner's own loan through Realisation A/c as well; it is repaid against its own account: Nair's Loan A/c Dr; To Bank A/c."],
      ['₹90,000', "Kept Mrs. Nair's loan out, as if it were a partner's loan; a relative of a partner is an outsider."],
      ['₹1,40,000', "Swapped the two loans: put Nair's own loan through Realisation A/c and kept Mrs. Nair's loan out."],
    ],
    "Outside liabilities are paid through Realisation A/c: creditors ₹90,000 and Mrs. Nair's loan ₹40,000 = ₹1,30,000. Nair's own loan of ₹50,000 never enters Realisation A/c; it is repaid afterwards from the bank.",
    ['Which of the three are owed to outsiders?', "A partner's own loan is paid only after every outside liability, and never through Realisation A/c."]),
  tf(23, 'dis-realisation', 'easy', "The profit or loss on realisation is shared among the partners in the ratio of their capitals.", false,
    'It is shared in the profit-sharing ratio, like any other profit or loss of the firm.',
    ['Which ratio is used for every profit and loss of a firm?']),
  mcq(24, 'dis-realisation', 'medium', 'On dissolution the balance sheet shows Workmen Compensation Reserve ₹50,000. A claim of ₹20,000 for compensation has been admitted and is still to be paid. How is the reserve dealt with?',
    "₹20,000 is transferred to the credit of Realisation A/c as a liability, and the remaining ₹30,000 is credited to the partners' capital accounts",
    [
      ["The whole ₹50,000 is credited to the partners' capital accounts, and nothing is set aside for the claim", 'Ignored the claim, which is owed to the workers and has to be paid.'],
      ['The whole ₹50,000 is transferred to the credit of Realisation A/c', 'Treated the whole reserve as a liability; only the claim is owed to outsiders.'],
      ['The claim of ₹20,000 is debited to Realisation A/c and the reserve is left untouched', 'Left a reserve standing in books that are being closed.'],
    ],
    'The admitted claim of ₹20,000 is a liability to outsiders, so that much of the reserve goes to the credit of Realisation A/c, and its payment is debited there (Realisation A/c Dr; To Bank A/c). The free part of the reserve, ₹30,000, is profit and goes to the capital accounts in the profit-sharing ratio.',
    ['How much of the reserve is owed to somebody?']),
  mcq(25, 'dis-taken-over', 'medium', 'A partner takes over investments of book value ₹80,000 at ₹72,000. Which account is debited, and with how much?',
    "The partner's Capital A/c, with ₹72,000",
    [
      ["The partner's Capital A/c, with ₹80,000", 'Used the book value; the partner is charged the value agreed.'],
      ['Bank A/c, with ₹72,000', 'Recorded a receipt of money; the partner takes the asset in place of cash.'],
      ['Investments A/c, with ₹72,000', 'Debited the asset; its account was closed when it went to Realisation A/c.'],
    ],
    "The partner's Capital A/c is debited with the agreed value, ₹72,000, and Realisation A/c is credited. The ₹8,000 shortfall shows in the balance of Realisation A/c.",
    ['What does the partner give for the asset: cash, or a smaller final payment?']),

  // ---- Short sums ----
  num(26, 'dis-realisation', 'easy', 'Realisation A/c shows a profit of ₹45,000. Kiran, Lalit and Mona share profits and losses 5:3:1. What is Lalit\'s share?', 15000,
    [[25000, "Gave Kiran's share: the terms of the ratio follow the order of the names."], [45000, "Gave the whole profit, not Lalit's share."]],
    ["Lalit's share = 3/9 x ₹45,000 = ₹15,000, credited to Lalit's Capital A/c."], ['The ratio has 5 + 3 + 1 = 9 parts.']),
  num(27, 'dis-realisation', 'medium', 'On dissolution, assets of book value ₹3,00,000 (other than cash) realised ₹2,70,000. Creditors of ₹80,000 were paid ₹76,000 in full settlement. Realisation expenses of ₹5,000 were paid by the firm. What is the loss on realisation?', 31000,
    [[35000, 'Missed the ₹4,000 the creditors gave up, which reduces the loss.'], [26000, 'Left out the realisation expenses.'], [39000, 'Added the discount from the creditors to the loss instead of deducting it.']],
    ['Debit: assets ₹3,00,000 + creditors paid ₹76,000 + expenses ₹5,000 = ₹3,81,000.', 'Credit: creditors ₹80,000 + assets realised ₹2,70,000 = ₹3,50,000.', 'Loss = ₹3,81,000 - ₹3,50,000 = ₹31,000.'],
    ['Write both sides of Realisation A/c.', 'A liability settled for less than its book figure gives a gain.']),
  num(28, 'dis-taken-over', 'medium', 'Creditors of ₹60,000 accepted stock at an agreed value of ₹45,000 and were paid the balance by cheque. How much is debited to Realisation A/c for this settlement?', 15000,
    [[60000, 'Paid the creditors in full by cheque, ignoring the stock they accepted.'], [45000, 'Debited the value of the stock; no entry is passed for the asset handed over.']],
    ['No entry is passed for the stock: it and the creditors are already in Realisation A/c.', 'Only the cheque is recorded: ₹60,000 - ₹45,000 = ₹15,000. Realisation A/c Dr; To Bank A/c.'],
    ['How much money actually left the firm?']),
  num(29, 'dis-closing', 'medium', "Sunil's capital is ₹1,80,000. Sunil's share of General Reserve is ₹12,000 and of the loss on realisation ₹20,000. Sunil took over furniture at ₹30,000. The capitals are fluctuating. How much is finally paid to Sunil?", 142000,
    [[172000, 'Left out the furniture taken over, which is debited to the capital account.'], [202000, 'Added the furniture taken over instead of deducting it.'], [182000, 'Added the share of the loss instead of deducting it.']],
    ['Credit: capital ₹1,80,000 + reserve ₹12,000 = ₹1,92,000.', 'Debit: loss ₹20,000 + furniture ₹30,000 = ₹50,000.', 'Paid to Sunil = ₹1,92,000 - ₹50,000 = ₹1,42,000.'],
    ['What is credited and what is debited to the capital account?']),
  num(30, 'dis-settlement', 'complex', "A dissolved firm has ₹4,20,000 in the bank after realising all its assets. It owes creditors ₹1,00,000 and a loan of ₹60,000 to the partner Gopal. The capitals are Gopal ₹1,20,000 and Hari ₹1,00,000. Gopal and Hari share profits 3:1. How much does Gopal receive in all?", 210000,
    [[150000, "Left out Gopal's loan, which is repaid to Gopal before the capitals."], [180000, 'Left out the share of the surplus.'], [255000, 'Shared all the cash left after the creditors and the loan 3:1; the capitals are returned first.']],
    ['After creditors ₹1,00,000 and the loan ₹60,000, the cash left is ₹2,60,000.', 'Capitals take ₹2,20,000; the surplus is ₹40,000, shared 3:1: Gopal ₹30,000.', 'Gopal receives loan ₹60,000 + capital ₹1,20,000 + surplus ₹30,000 = ₹2,10,000.'],
    ['Follow section 48 step by step.', 'Gopal is paid in three capacities: lender, owner of capital, sharer of the surplus.']),

  // ---- Entries ----
  jr(31, 'dis-taken-over', 'easy', "On the dissolution of the firm of Anu and Bala, Anu took over stock of book value ₹50,000 at ₹46,000. The assets had already been transferred to Realisation A/c and the capitals are fluctuating. Pass the journal entry.",
    [[partnerCapital('Anu'), 'Dr', 46000], ['realisation', 'Cr', 46000]], ['stock', partnerCapital('Bala')],
    "Anu takes the stock in place of money, so Anu's Capital A/c is debited with the agreed value. Realisation A/c is credited, as on a sale. Stock A/c is already closed.",
    ['Stock A/c has no balance left.', 'A partner who takes an asset over is charged for it in the capital account.']),
  jr(32, 'dis-expenses', 'medium', "On the dissolution of the firm of Rina and Sahil, Rina was to carry out the dissolution for a remuneration of ₹10,000 and to bear all the realisation expenses. Rina spent ₹8,000 on them out of Rina's own money. The capitals are fluctuating. Pass the one journal entry that is needed.",
    [['realisation', 'Dr', 10000], [partnerCapital('Rina'), 'Cr', 10000]], [partnerCapital('Sahil'), 'tradeExpenses'],
    "The firm owes Rina the agreed remuneration of ₹10,000: Realisation A/c Dr; To Rina's Capital A/c. The ₹8,000 Rina spent is Rina's own affair and gets no entry.",
    ['What does the firm owe Rina: the amount spent, or the amount agreed?']),
  jr(33, 'dis-loans', 'medium', "On the dissolution of the firm of Dinesh and Ela, the outside liabilities had been paid. Dinesh's loan of ₹75,000 to the firm was then repaid by cheque. Pass the journal entry.",
    [[partnerLoan('Dinesh'), 'Dr', 75000], ['bank', 'Cr', 75000]], ['realisation', partnerCapital('Dinesh')],
    "A partner's loan is not passed through Realisation A/c. It is repaid from the bank after the outside liabilities: Dinesh's Loan A/c Dr; To Bank A/c.",
    ["Is a partner's own loan transferred to Realisation A/c?"]),
  jr(34, 'dis-unrecorded', 'medium', "On the dissolution of a firm, a bill of ₹9,000 for repairs, which had not been recorded in the books, was paid by cheque. Pass the journal entry.",
    [['realisation', 'Dr', 9000], ['bank', 'Cr', 9000]], ['repairs', 'outstandingExpenses'],
    'An unrecorded liability was never credited to Realisation A/c, so the whole payment is a loss of winding up: Realisation A/c Dr; To Bank A/c.',
    ['Nothing stood in the books for this bill.']),
  jr(35, 'dis-loans', 'medium', "The balance sheet of the firm of Farah and Girish on the date of dissolution showed, among the assets, a loan of ₹25,000 given by the firm to Girish. The capitals are fluctuating. Pass the journal entry that closes the loan account.",
    [[partnerCapital('Girish'), 'Dr', 25000], [loanToPartner('Girish'), 'Cr', 25000]], ['realisation', partnerCapital('Farah')],
    "A loan to a partner is not transferred to Realisation A/c. It is set off against what the firm owes that partner: Girish's Capital A/c Dr; To Loan to Girish A/c.",
    ['Who owes whom here?', 'The loan is recovered by paying Girish that much less.']),
  jr(36, 'dis-realisation', 'easy', "Realisation A/c of the firm of Indu and Jatin shows a loss of ₹24,000. They share profits and losses 5:3 and their capitals are fluctuating. Pass the journal entry to close Realisation A/c.",
    [[partnerCapital('Indu'), 'Dr', 15000], [partnerCapital('Jatin'), 'Dr', 9000], ['realisation', 'Cr', 24000]], ['profitAndLoss'],
    "The loss is borne 5:3: Indu ₹15,000 and Jatin ₹9,000. The capital accounts are debited and Realisation A/c is credited.",
    ['A loss reduces capital.', '5/8 and 3/8 of ₹24,000.']),
];

// ---------------------------------------------------------------------------------------------------------------
// Levels
// ---------------------------------------------------------------------------------------------------------------

const levels = buildLadder(T, {
  concept: {
    title: 'Closing a Firm for Good',
    description: 'See what happens when a firm is wound up: the assets are turned into money, outsiders are paid, and the partners share what is left.',
    lesson: [
      {
        type: 'text',
        heading: 'Two kinds of ending',
        body: 'When a partner joins, retires or dies, the old agreement ends but the business usually goes on: only the partnership is dissolved, and you already know those adjustments. Sometimes the business itself stops: the partners agree to close, the trade becomes unlawful, the venture is over, or a court orders it. That is the dissolution of the firm. Nothing is carried forward now. Every asset is sold or handed to someone, every debt is paid, and the books are closed.',
      },
      {
        type: 'text',
        heading: 'One account for the whole winding up',
        body: 'Selling a dozen assets and paying several debts would give a dozen small profits and losses. Instead, everything is put through one account, the Realisation Account. Suppose stock and machinery stand in the books at ₹5,00,000 and creditors at ₹1,00,000. The assets go to its debit (₹5,00,000) and the creditors to its credit (₹1,00,000). The assets fetch ₹4,60,000 (credit); the creditors are paid ₹98,000 and the expenses of selling are ₹3,000 (debit). Debit 5,00,000 + 98,000 + 3,000 = ₹6,01,000; credit 1,00,000 + 4,60,000 = ₹5,60,000. The debit side is heavier by ₹41,000: that is the loss on realisation, borne by the partners in their profit-sharing ratio.',
      },
      {
        type: 'text',
        heading: 'What stays out of it',
        body: "Only things that can be turned into money, and debts owed to outsiders, belong in the Realisation Account. Cash and bank are money already. A debit balance of Profit and Loss A/c is a past loss, and a General Reserve is past profit: both go straight to the partners' capital accounts in the profit-sharing ratio. A loan a partner gave the firm is repaid by itself. If a partner takes an asset home instead of letting it be sold, the partner is charged for it: the capital account is debited and the Realisation Account credited.",
      },
      {
        type: 'text',
        heading: 'Who is paid first',
        body: "The law (section 48 of the Indian Partnership Act, 1932) fixes the order. First the debts due to outsiders, a loan from a partner's wife or husband among them. Second, loans the partners themselves gave the firm. Third, the partners' capitals. Whatever is still left is shared in the profit-sharing ratio. When the last payment to the partners is made, the bank account is empty and every account is closed: that is the proof that the work is right.",
      },
      {
        type: 'example',
        title: 'Asha, a partner, takes over stock at an agreed value of ₹40,000',
        lines: [
          { accountId: partnerCapital('Asha'), side: 'Dr', amount: 4000000 },
          { accountId: 'realisation', side: 'Cr', amount: 4000000 },
        ],
        note: "Stock A/c was closed when the stock went to the Realisation Account. Asha takes the stock in place of money, so Asha's capital account is debited: ₹40,000 less will be paid to Asha at the end. The Realisation Account is credited, exactly as if the stock had been sold for ₹40,000.",
      },
      {
        type: 'table',
        title: 'Kaveri Tea Agency, Guwahati: Ravi and Sunita (3:2) close the firm. Balance sheet on 31 March 2026',
        rows: [
          { label: 'Liabilities' },
          { label: 'Creditors', amount: '₹60,000' },
          { label: "Sunita's loan", amount: '₹20,000' },
          { label: 'General Reserve', amount: '₹25,000' },
          { label: 'Capitals: Ravi ₹1,50,000, Sunita ₹1,00,000', amount: '₹2,50,000' },
          { label: 'Total', amount: '₹3,55,000', total: true },
          { label: 'Assets' },
          { label: 'Bank', amount: '₹15,000' },
          { label: 'Debtors ₹80,000 less provision ₹5,000', amount: '₹75,000' },
          { label: 'Stock', amount: '₹90,000' },
          { label: 'Furniture', amount: '₹40,000' },
          { label: 'Machinery', amount: '₹1,35,000' },
          { label: 'Total', amount: '₹3,55,000', total: true },
        ],
        note: 'On dissolution: debtors realised ₹72,000; Ravi took over the stock at ₹85,000; machinery fetched ₹1,20,000 and furniture ₹30,000; creditors were paid ₹58,000 in full settlement; the firm paid realisation expenses of ₹4,000.',
      },
      {
        type: 'table',
        title: 'Kaveri Tea Agency: Realisation A/c',
        rows: [
          { label: 'Dr' },
          { label: 'To Debtors A/c (gross)', amount: '80,000' },
          { label: 'To Stock A/c', amount: '90,000' },
          { label: 'To Furniture A/c', amount: '40,000' },
          { label: 'To Machinery A/c', amount: '1,35,000' },
          { label: 'To Bank A/c (creditors paid)', amount: '58,000' },
          { label: 'To Bank A/c (expenses)', amount: '4,000' },
          { label: 'Total', amount: '4,07,000', total: true },
          { label: 'Cr' },
          { label: 'By Provision for Doubtful Debts A/c', amount: '5,000' },
          { label: 'By Creditors A/c', amount: '60,000' },
          { label: 'By Bank A/c (debtors ₹72,000, machinery ₹1,20,000, furniture ₹30,000)', amount: '2,22,000' },
          { label: "By Ravi's Capital A/c (stock taken over)", amount: '85,000' },
          { label: 'By loss on realisation: Ravi ₹21,000, Sunita ₹14,000', amount: '35,000' },
          { label: 'Total', amount: '4,07,000', total: true },
        ],
        note: "Watch out: the debtors go across at their gross figure and the provision to the credit side; cash at bank, the reserve and Sunita's own loan stay out of this account.",
      },
      {
        type: 'table',
        title: "Kaveri Tea Agency: Partners' Capital Accounts (₹: Ravi · Sunita)",
        rows: [
          { label: 'Dr' },
          { label: 'To Realisation A/c (stock taken over)', amount: '85,000 · –' },
          { label: 'To Realisation A/c (loss)', amount: '21,000 · 14,000' },
          { label: 'To Bank A/c (final payment)', amount: '59,000 · 96,000' },
          { label: 'Total', amount: '1,65,000 · 1,10,000', total: true },
          { label: 'Cr' },
          { label: 'By Balance b/d', amount: '1,50,000 · 1,00,000' },
          { label: 'By General Reserve A/c (3:2)', amount: '15,000 · 10,000' },
          { label: 'Total', amount: '1,65,000 · 1,10,000', total: true },
        ],
        note: 'Each column is closed by the final payment. Had a column ended with a debit balance, that partner would have brought the money in ("By Bank A/c").',
      },
      {
        type: 'working',
        title: 'Kaveri Tea Agency: Bank A/c and the proof',
        lines: [
          'Money in: opening balance ₹15,000 + debtors ₹72,000 + machinery ₹1,20,000 + furniture ₹30,000 = ₹2,37,000.',
          'Money out in the order of section 48: creditors ₹58,000 and expenses ₹4,000; then Sunita\'s loan ₹20,000; then the capitals, Ravi ₹59,000 and Sunita ₹96,000.',
          'Total paid = ₹58,000 + ₹4,000 + ₹20,000 + ₹59,000 + ₹96,000 = ₹2,37,000.',
          'Both sides are ₹2,37,000: the bank account closes with nothing left, and every account of the firm is closed.',
        ],
        note: 'Watch out: if the bank account does not come to nil, a figure in the Realisation or capital accounts is wrong. Check there before forcing the last payment.',
      },
      {
        type: 'example',
        title: 'A creditor owed ₹30,000 takes machinery worth ₹45,000 and pays the firm the difference',
        lines: [
          { accountId: 'bank', side: 'Dr', amount: 1500000 },
          { accountId: 'realisation', side: 'Cr', amount: 1500000 },
        ],
        note: 'The machinery and the creditor are already in Realisation A/c, so only the money that changes hands is recorded. Had the creditor accepted the machinery in full settlement, there would be no entry at all.',
      },
      {
        type: 'example',
        title: 'Workmen Compensation Reserve ₹50,000 with a claim of ₹20,000 (Ravi and Sunita, 3:2)',
        lines: [
          { accountId: 'workmenCompensationReserve', side: 'Dr', amount: 5000000 },
          { accountId: 'realisation', side: 'Cr', amount: 2000000 },
          { accountId: partnerCapital('Ravi'), side: 'Cr', amount: 1800000 },
          { accountId: partnerCapital('Sunita'), side: 'Cr', amount: 1200000 },
        ],
        note: 'The claim is a debt to outsiders, so that much of the reserve goes to Realisation A/c, through which the claim is paid. The free ₹30,000 goes to the partners. An Investment Fluctuation Reserve goes wholly to the partners: the investments themselves went to Realisation A/c at book value, so any fall in their value is already in the result there.',
      },
      {
        type: 'text',
        heading: 'When capitals were fixed',
        body: "If the partners kept fixed capitals with current accounts, close each current account into its capital account first: a credit balance by Current A/c Dr, To Capital A/c; a debit balance by Capital A/c Dr, To Current A/c. Every later item (reserves, the result of realisation, assets or liabilities taken over, the final payment) then goes to the capital accounts alone.",
      },
      { type: 'check', questionId: qid(2) },
      { type: 'check', questionId: qid(14) },
    ],
  },
  cards: {
    title: 'Dissolution Rules and Entries',
    description: 'Recall what goes to the Realisation Account, the entry for each kind of item, and the order of payment.',
    cardIds: cards.map((c) => c.id),
  },
  recognition: [
    {
      title: 'Dissolution, Its Modes and the Order of Payment',
      description: 'Tell the dissolution of a partnership from that of the firm, name the mode, and put the claims in the order of section 48.',
      questionIds: [1, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13].map(qid),
    },
    {
      title: 'What the Realisation Account Holds',
      description: 'Decide which balances go to the Realisation Account, on which side, and what is done with the rest.',
      questionIds: [15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25].map(qid),
    },
    {
      title: 'Short Sums and First Entries',
      description: 'Work out a share, a loss on realisation and a final payment, and pass the entries that come up most often.',
      questionIds: [26, 27, 28, 29, 30, 31, 32, 33, 34, 35, 36].map(qid),
    },
  ],
  practice: [
    {
      title: 'Modes, Order of Payment and the Realisation Account',
      description: 'Name the kind and mode of dissolution, order the claims, and find a simple profit or loss on realisation.',
      templateIds: ['dis-kind', 'dis-mode', 'dis-order', 'dis-to-realisation', 'dis-value-not-given', 'dis-result-simple', 'dis-share-of-result'],
      count: 8,
    },
    {
      title: 'First Entries of a Dissolution',
      description: 'An asset sold or taken over, a liability paid, expenses paid, reserves shared out and the final payment.',
      templateIds: [
        'dis-journal-asset-sold', 'dis-journal-liability-paid', 'dis-journal-asset-taken', 'dis-journal-expenses-paid', 'dis-loan-treatment',
        'dis-journal-reserves', 'dis-journal-final-payment',
      ],
      count: 8,
    },
    {
      title: 'Opening and Closing the Realisation Account (Guided)',
      description: 'From a balance sheet, transfer the right assets and the right liabilities; then close the account and share its balance.',
      templateIds: ['dis-journal-transfer-assets', 'dis-journal-transfer-liabilities', 'dis-journal-result'],
      count: 6,
      guided: true,
    },
    {
      title: 'Settlements in Kind and Unrecorded Items',
      description: 'Creditors who accept an asset, liabilities a partner takes over, debtors with a provision, and items that were never in the books.',
      templateIds: [
        'dis-journal-creditor-asset', 'dis-settled-by-asset', 'dis-journal-liability-taken', 'dis-debtors-provision', 'dis-journal-unrecorded-asset',
        'dis-journal-unrecorded-liability',
      ],
      count: 8,
    },
    {
      title: 'Realisation Expenses and Loans',
      description: "Every form of realisation expenses, and the three kinds of loan: from a partner, from a partner's relative, to a partner.",
      templateIds: ['dis-journal-remuneration', 'dis-expenses-entry', 'dis-expenses-charge', 'dis-journal-loans'],
      count: 8,
    },
    {
      title: 'Settling with the Partners',
      description: 'The final balance of a capital account, cash to be paid or brought in, the bank account and the order of section 48 in figures.',
      templateIds: ['dis-final-payment', 'dis-settle-or-bring', 'dis-cash-for-partners', 'dis-total-to-partner'],
      count: 8,
    },
    {
      title: 'Full Dissolution Problems',
      description: 'A balance sheet and five or more things that happen to it: the result on realisation, a missing figure, the final payment and the bank total.',
      templateIds: [
        'dis-realisation-full', 'dis-full-final-payment', 'dis-bank-total', 'dis-missing-realised-value', 'dis-result-sign', 'dis-creditors-cash',
        'dis-journal-close-realisation', 'dis-unrecorded-effect',
      ],
      count: 6,
    },
  ],
  mixed: { title: 'Mixed Dissolution Practice', description: 'Everything in this topic, shuffled the way an examination serves it.', count: 12 },
  challenge: { title: 'Challenge: Dissolution Mastery', description: 'The hardest questions of the topic, against the clock.', count: 6, timerSecondsPerQuestion: 240 },
  // Sets of entries: one firm, three to eight entries. They stand after every other level and keep ids of their own.
  sets: [
    {
      title: 'Pass the Entries on Dissolution',
      description: 'Three to five entries for one firm: assets taken over, creditors who accept an asset, items that were never in the books, realisation expenses in every form, and every kind of loan.',
      templateIds: ['dis-set-items', 'dis-set-expenses', 'dis-set-loans'],
      count: 3,
    },
    {
      title: 'Journalise a Whole Dissolution',
      description: 'From the balance sheet to the last cheque in eight entries: the two transfers, the money received and paid, the expenses, the profit or loss on realisation and the final payment.',
      templateIds: ['dis-set-whole'],
      count: 2,
    },
  ],
  // Accounts the student prepares, all written up from the entries of one dissolution.
  formats: [
    {
      title: 'Prepare the Realisation Account',
      description: 'Realisation A/c from a balance sheet: first with every asset sold and every liability paid, then with an asset taken over, creditors who accept an asset, unrecorded items and expenses borne by a partner.',
      templateIds: ['dis-fmt-realisation', 'dis-fmt-realisation-full'],
      count: 2,
    },
    {
      title: 'Prepare the Capital Accounts and the Bank Account',
      description: "The partners' capital accounts in columns, closed by the final payment or by cash a partner brings in, and the Bank A/c, which must close with nothing left.",
      templateIds: ['dis-fmt-capitals', 'dis-fmt-bank', 'dis-fmt-capitals-deficit'],
      count: 2,
    },
    {
      title: 'Prepare the Capital Accounts When Capitals Were Fixed',
      description: "The current accounts closed into the capital accounts first, a debit balance among them; reserves, the free part of a Workmen Compensation Reserve, an asset or a liability taken over, the result of realisation and the final settlement.",
      templateIds: ['dis-fmt-capitals-fixed'],
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
        name: 'earmarked-and-fixed',
        type: 'medium_practice',
        title: 'Earmarked Reserves and Fixed Capitals on Dissolution',
        description: 'A Workmen Compensation Reserve against a claim, an Investment Fluctuation Reserve when the investments fall, and current accounts closed into the capital accounts.',
        generate: { templateIds: ['dis-current-close', 'dis-wcr-claim', 'dis-ifr'], count: 6 },
      },
      {
        name: 'assertion-reason',
        type: 'medium_practice',
        title: 'Assertion and Reason',
        description: 'The one-mark question of the board: judge the Assertion, judge the Reason, and say whether the Reason explains the Assertion.',
        generate: { templateIds: ['dis-assertion-reason'], count: 6 },
      },
    ]),
  ],
  questions,
};

export default pack;
