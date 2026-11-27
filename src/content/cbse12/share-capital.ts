import type { JournalLine } from '@/engine/journal';
import { buildLadder, laterLevels } from '../ladder';
import type { Card, Concept, Difficulty, JournalQuestion, McqQuestion, NumericQuestion, Question, TopicPack, TrueFalseQuestion } from '../types';

const T = 'share-capital';

const concepts: Concept[] = [
  { id: 'sc-kinds', topicId: T, title: 'Kinds of share capital' },
  { id: 'sc-special-issues', topicId: T, title: 'Private placement, ESOP and sweat equity' },
  { id: 'sc-issue', topicId: T, title: 'Issue of shares at par and at a premium' },
  { id: 'sc-subscription', topicId: T, title: 'Under-subscription, over-subscription and pro rata allotment' },
  { id: 'sc-calls', topicId: T, title: 'Calls in arrears and calls in advance' },
  { id: 'sc-vendor', topicId: T, title: 'Issue for consideration other than cash' },
  { id: 'sc-forfeiture', topicId: T, title: 'Forfeiture of shares' },
  { id: 'sc-reissue', topicId: T, title: 'Reissue of forfeited shares and capital reserve' },
  { id: 'sc-disclosure', topicId: T, title: 'Share capital in the balance sheet and its note' },
  { id: 'sc-sets', topicId: T, title: 'Journal entries of an issue, a forfeiture and a reissue' },
  { id: 'sc-formats', topicId: T, title: 'Preparing the accounts of an issue and the note on share capital' },
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
): Card => ({ id: `sc-card-${n}`, topicId: T, conceptId, kind, prompt, answer, explanation, example, commonMistake });

const cards: Card[] = [
  card(1, 'sc-kinds', 'rule', 'What are the five stages of share capital?',
    'Authorised (the limit in the Memorandum), issued (offered for subscription), subscribed (applied for and allotted), called-up (the amount asked for on those shares) and paid-up (called-up less calls in arrears). Each is a part of the one before it.',
    'Only the subscribed capital enters the total of the balance sheet, at its called-up amount less calls in arrears. The authorised and issued capital are shown in the note for information.',
    'Authorised 1,00,000 shares of ₹10; offered 55,000; taken up 50,000; ₹8 a share called; ₹2 unpaid on 1,000 shares. Issued ₹5,50,000, subscribed ₹5,00,000, called-up ₹4,00,000, paid-up ₹3,98,000.',
    'Working the called-up capital on the shares offered instead of the shares subscribed.'),
  card(2, 'sc-kinds', 'rule', 'How does reserve capital differ from capital reserve?',
    'Reserve capital is the part of the uncalled share capital that a company decides, by special resolution, to call only on winding up. Capital reserve is a reserve built out of capital profits, such as the gain on reissue of forfeited shares.',
    'Reserve capital has not been called or received, so it does not appear in the balance sheet. Capital reserve has a credit balance and is shown under Reserves and Surplus.',
    '50,000 shares of ₹10 with ₹7 called, and ₹2 a share kept back for a winding up: reserve capital ₹1,00,000. A gain of ₹4,000 on reissue of forfeited shares: capital reserve ₹4,000.',
    'Treating the two as the same thing because they use the same two words.'),
  card(3, 'sc-kinds', 'rule', 'How do preference shares differ from equity shares?',
    'Preference shares carry two prior rights: a dividend at a fixed rate before any dividend on equity shares, and repayment of capital before the equity shareholders on winding up. Equity shares are all the shares that are not preference shares.',
    'Equity shareholders take what is left after the preference shareholders, so their dividend is not fixed and they bear the greater risk.',
    'On 9% preference shares of ₹100 each, ₹9 a share is paid as dividend before the equity shareholders get anything.',
    'Calling the preference dividend interest. It is a dividend and is paid only out of profit.'),
  card(4, 'sc-special-issues', 'rule', 'What are private placement, ESOP and sweat equity?',
    'Private placement: an offer of shares to a selected group of persons through a private offer letter, without a prospectus. ESOP: an option given to employees to buy shares in future at a price fixed in advance. Sweat equity: shares issued to employees or directors at a discount or for consideration other than cash, for know-how or other value they add.',
    'In all three the shares do not go to the general public. For the examination they are ideas to recognise; no entries are asked.',
    'Shares offered by letter to 60 chosen investors: private placement. A right to buy 500 shares at ₹80 after three years of service: ESOP. Shares given to a director for technical know-how: sweat equity.',
    'Calling an ESOP a free gift of shares. The employee has only an option, and pays the price if the option is used.'),
  card(5, 'sc-issue', 'format', 'What are the entries when shares are issued and paid for in instalments?',
    '1) Bank A/c Dr; To Share Application A/c (money on the shares applied for). 2) Share Application A/c Dr; To Share Capital A/c (on allotment). 3) Share Allotment A/c Dr; To Share Capital A/c (allotment money due). 4) Bank A/c Dr; To Share Allotment A/c (received). Each call then has the same pair: due, and received.',
    'Application money is held in Share Application A/c because an applicant is not a shareholder until the shares are allotted. Share Capital A/c is credited only as each part of the face value is called.',
    '10,000 equity shares of ₹10: ₹3 on application. Bank A/c Dr 30,000; To Equity Share Application A/c 30,000. On allotment: Equity Share Application A/c Dr 30,000; To Equity Share Capital A/c 30,000.',
    'Crediting Share Capital A/c as soon as the application money is received.'),
  card(6, 'sc-issue', 'rule', 'What is securities premium and when is it credited?',
    'The excess of the issue price over the face value. It is credited to Securities Premium A/c in the entry for the instalment with which it is payable, when that instalment falls due, and is shown under Reserves and Surplus.',
    'It is a capital receipt. Section 52 of the Companies Act, 2013 allows it to be used only for issuing fully paid bonus shares, writing off preliminary expenses, writing off the expenses, commission or discount on an issue of securities, providing for the premium on redemption of preference shares or debentures, and buying back shares.',
    'A share of ₹10 issued at ₹12, with ₹6 payable on allotment including the premium: Share Allotment A/c Dr 6; To Share Capital A/c 4; To Securities Premium A/c 2, on every share.',
    'Crediting the whole allotment money to Share Capital A/c, or treating the premium as a profit that can be paid out as dividend.'),
  card(7, 'sc-issue', 'rule', 'Can a company issue shares at a discount?',
    'No. Section 53 of the Companies Act, 2013 forbids the issue of shares below their face value. The one exception is sweat equity shares.',
    'Shares are issued at par (at face value) or at a premium (above it). The discount allowed when forfeited shares are reissued is a different matter: it is met out of the amount already forfeited on those shares.',
    'A ₹10 share may be issued at ₹10 or at ₹12, never at ₹9. A forfeited ₹10 share on which ₹6 was received may be reissued, fully paid, for ₹4 or more.',
    'Mixing up the discount on reissue of forfeited shares with an issue of shares at a discount.'),
  card(8, 'sc-subscription', 'rule', 'What are minimum subscription and under-subscription?',
    'Minimum subscription: applications must be received for at least 90% of the shares issued, or no share can be allotted and all the application money is returned. Under-subscription: fewer shares are applied for than offered (but at least 90%); the company allots the shares applied for and passes every entry for those shares only.',
    'A company cannot allot a share nobody applied for, so the shares not taken up simply stay unissued.',
    '1,00,000 shares offered. Applications for 85,000: no allotment, money returned. Applications for 94,000: allot 94,000, and work application, allotment and calls on 94,000 shares.',
    'Passing the entries on the number of shares offered when fewer were applied for.'),
  card(9, 'sc-subscription', 'formula', 'What can a company do when an issue is over-subscribed, and how is excess application money worked out?',
    'It may refuse the excess applications and return their money, allot pro rata to all applicants, or do both. Excess application money = (shares applied for - shares allotted) x application money a share.',
    'On a pro rata allotment the excess is kept and used for the allotment money first. What is still left over is refunded or kept as calls in advance, whichever the terms of issue say.',
    '40,000 shares issued, 60,000 applied for, ₹3 on application, pro rata to all: excess = 20,000 x ₹3 = ₹60,000, set against the allotment money. An applicant for 600 shares gets 400.',
    'Working the excess at the allotment rate, or forgetting it when the cash received on allotment is asked.'),
  card(10, 'sc-subscription', 'format', 'What is the entry for the application money when shares are allotted pro rata?',
    'Share Application A/c Dr (all the application money received); To Share Capital A/c (application money on the shares allotted); To Share Allotment A/c (excess kept for allotment); To Bank A/c (money returned on refused applications); To Calls in Advance A/c (any excess kept for the calls).',
    'The debit clears Share Application A/c completely. Each credit says where a part of the money goes.',
    '60,000 shares applied for, 40,000 allotted pro rata, ₹3 on application: Share Application A/c Dr 1,80,000; To Share Capital A/c 1,20,000; To Share Allotment A/c 60,000.',
    'Crediting all the application money to Share Capital A/c.'),
  card(11, 'sc-calls', 'rule', 'What are calls in arrears and how are they recorded?',
    'Money called on shares but not paid by the due date. Either the unpaid amount is moved to Calls in Arrears A/c (Bank A/c Dr with the money received; Calls in Arrears A/c Dr with the unpaid part; To Share Call A/c with the whole call), or no such account is opened and the call account is left with a debit balance equal to the unpaid amount.',
    'Either way the amount is the same, and in the note on Share Capital it is deducted from the called-up amount of the subscribed capital. Unpaid allotment money is dealt with in the same way: where a Calls in Arrears A/c is kept, it is moved to that account too.',
    'First call of ₹2 on 10,000 shares, unpaid on 400 shares: calls in arrears ₹800; cash received ₹19,200.',
    'Making the call only on the shares whose holders are expected to pay. A call is made on every share.'),
  card(12, 'sc-calls', 'rule', 'What are calls in advance and how are they recorded?',
    'Money a shareholder pays on a call before the call is made. On receipt: Bank A/c Dr; To Calls in Advance A/c. When the call is made: Calls in Advance A/c Dr; To Share Call A/c.',
    'Until the call is made the money is not capital. The company owes it, so calls in advance are shown under Other Current Liabilities.',
    'With the allotment money a holder of 500 shares also pays the first call of ₹3 a share: Calls in Advance A/c is credited with ₹1,500. When the first call is made, that ₹1,500 is set against it and no cash comes from this holder.',
    'Crediting money received in advance to Share Capital A/c, or counting it again as cash when the call is made.'),
  card(13, 'sc-vendor', 'formula', 'How many shares are issued to a vendor, and what are the entries?',
    'Number of shares = amount to be paid in shares / issue price of one share. Entries: Asset A/c Dr; To Vendor (purchase). Then Vendor Dr; To Share Capital A/c (face value); To Securities Premium A/c (premium, if any).',
    'The issue price is the face value at par, and the face value plus the premium when the shares are issued at a premium. No cash is received, so Bank A/c is not touched.',
    'Machinery bought for ₹6,00,000, paid by shares of ₹10 at a premium of ₹2: 6,00,000 / 12 = 50,000 shares. Vendor Dr 6,00,000; To Equity Share Capital A/c 5,00,000; To Securities Premium A/c 1,00,000.',
    'Dividing the price by the face value when the shares are issued at a premium.'),
  card(14, 'sc-vendor', 'rule', 'What arises when a company buys a whole business for a price different from its net assets?',
    'Net assets = assets taken over - liabilities taken over, at agreed values. Purchase consideration above the net assets: the excess is debited to Goodwill A/c. Purchase consideration below them: the difference is credited to Capital Reserve A/c.',
    'Entry: each asset Dr (and Goodwill A/c Dr, if any); To each liability; To Vendor (purchase consideration); To Capital Reserve A/c (if any).',
    'Assets ₹9,00,000, liabilities ₹2,00,000: net assets ₹7,00,000. Price ₹7,60,000: goodwill ₹60,000. Price ₹6,50,000: capital reserve ₹50,000.',
    'Comparing the price with the total assets and forgetting to deduct the liabilities taken over.'),
  card(15, 'sc-forfeiture', 'format', 'What is the entry for the forfeiture of shares?',
    'Share Capital A/c Dr (amount called up on the forfeited shares); Securities Premium A/c Dr (premium on them, only if it was not received); To Forfeited Shares A/c (amount received towards capital); To Share Allotment A/c and Share Call A/c, or To Calls in Arrears A/c (amount unpaid).',
    'Forfeiture cancels the shares: the capital credited on them so far is taken back, the unpaid money is written out of the books, and what the holder had paid stays with the company.',
    '100 shares of ₹10, fully called, final call of ₹3 unpaid: Share Capital A/c Dr 1,000; To Forfeited Shares A/c 700; To Share First and Final Call A/c 300.',
    'Debiting Share Capital A/c with the amount paid, or with the full face value when a part of it has not been called yet.'),
  card(16, 'sc-forfeiture', 'rule', 'When is Securities Premium A/c debited on forfeiture?',
    'Only when the premium on the forfeited shares was not received. A premium that has been received is never taken back.',
    'The premium was credited when the instalment carrying it fell due. If that instalment was never paid, the credit is cancelled by a debit; if it was paid, Securities Premium A/c is left alone.',
    'Premium ₹2 payable on allotment, 100 shares forfeited. Allotment unpaid: Securities Premium A/c Dr 200. Allotment paid and only a call unpaid: no debit.',
    'Debiting Securities Premium A/c on every forfeiture of shares issued at a premium.'),
  card(17, 'sc-forfeiture', 'shortcut', 'Shares allotted pro rata are forfeited after only the application money was paid. What was received on them?',
    'Amount received = shares applied for x application money a share. Shares applied for = shares allotted x (applied : allotted). Amount unpaid on allotment = allotment money due on the shares allotted - excess application money.',
    'The excess application money had already been set against the allotment money, so it is part of what the holder paid and is credited to Forfeited Shares A/c. If the allotment money carries a premium, the excess is taken to meet its capital part first: the whole premium is then unpaid and is debited to Securities Premium A/c.',
    'Allotted 400 shares at 3 : 2, so applied for 600. ₹3 on application: received ₹1,800 (not ₹1,200). Allotment ₹4 a share: due ₹1,600, less excess ₹600, unpaid ₹1,000.',
    'Taking the application money on the shares allotted only, and so losing the excess application money.'),
  card(18, 'sc-reissue', 'rule', 'At what price can forfeited shares be reissued, and what is the entry?',
    'At par, at a premium or at a discount, as fully paid or as partly paid. The discount cannot be more than the amount forfeited on those shares. Entry: Bank A/c Dr (price received); Forfeited Shares A/c Dr (discount); To Share Capital A/c (amount treated as paid up, which may be less than the face value); To Securities Premium A/c (any price above that).',
    'The new holder and the old holder together must put in at least the paid-up value of the share, so the company never ends up with less than that.',
    'A ₹10 share, ₹6 forfeited, reissued fully paid at ₹8: Bank A/c Dr 8; Forfeited Shares A/c Dr 2; To Share Capital A/c 10. The lowest possible price is ₹4.',
    'Debiting the discount on reissue to Securities Premium A/c or to the Statement of Profit and Loss.'),
  card(19, 'sc-reissue', 'formula', 'How much is transferred to Capital Reserve after reissue?',
    'Capital Reserve = amount forfeited on the shares reissued - discount allowed on their reissue. When only some of the forfeited shares are reissued, take the forfeited amount in proportion: amount forfeited x shares reissued / shares forfeited.',
    'Entry: Forfeited Shares A/c Dr; To Capital Reserve A/c. The amount forfeited on the shares not yet reissued stays in Forfeited Shares A/c.',
    '200 shares forfeited with ₹6 a share received (₹1,200). 120 reissued at ₹7: forfeited on them ₹720, discount ₹360, capital reserve ₹360. ₹480 stays in Forfeited Shares A/c for the other 80 shares.',
    'Transferring the whole balance of Forfeited Shares A/c when only some of the shares were reissued.'),
  card(20, 'sc-disclosure', 'format', 'How is share capital shown in the balance sheet of a company?',
    "On the face of the balance sheet, one figure, Share Capital, under Shareholders' Funds. The note gives: Authorised capital; Issued capital; Subscribed capital (subscribed and fully paid; subscribed but not fully paid, at the called-up amount, less calls in arrears); add the balance of Forfeited Shares A/c.",
    'Securities Premium and Capital Reserve are not share capital: they are shown under Reserves and Surplus. Calls in advance are shown under Other Current Liabilities.',
    '50,000 shares of ₹10, ₹8 called, ₹2 unpaid on 1,000 shares: subscribed but not fully paid ₹4,00,000, less calls in arrears ₹2,000 = ₹3,98,000.',
    'Adding securities premium to share capital, or adding calls in arrears instead of deducting them.'),
  // Added after the check against the CBSE 2025-26 syllabus (docs/syllabus-coverage.md), which begins the unit with
  // the features and types of companies.
  card(21, 'sc-kinds', 'rule', 'What are the features of a company, and what types of company are there?',
    'Features: an association of persons formed under the Companies Act; a separate legal entity, distinct from its members; limited liability of its members; perpetual succession (members come and go, the company goes on); it acts through its directors and has a common seal where it chooses to keep one; shares are transferable (freely in a public company); ownership and management are separate. Types: by liability, companies limited by shares, limited by guarantee and unlimited; by the number of members, the private company (at least 2 members, at most 200, shares not freely transferable), the public company (at least 7 members, no upper limit) and the one person company; and others, such as government companies and holding and subsidiary companies.',
    'The features explain why a company raises capital from the public in small shares and keeps its accounts in the form the Companies Act lays down.',
    'Deccan Tools Ltd. is a public company limited by shares: its shareholders lose at most the unpaid amount on their shares if it fails.',
    'Thinking the members of a company are personally liable for all its debts, as partners are.'),
];

// ---------------------------------------------------------------------------------------------------------------
// Authored questions
// ---------------------------------------------------------------------------------------------------------------

const qid = (n: number): string => `sc-q-${String(n).padStart(3, '0')}`;
/** The four options of an Assertion-Reason item, in the board's order. */
const BOARD_ORDER = ['Both A and R are true, and R is the correct explanation of A', 'Both A and R are true, but R is not the correct explanation of A', 'A is true but R is false', 'A is false but R is true'];

/** An mcq: the right option is put at a position that depends on n, so the answers are spread over a, b, c and d. */
function mcq(n: number, conceptId: string, difficulty: Difficulty, prompt: string, correct: string, wrong: [string, string][], explanation: string, hints: string[]): McqQuestion {
  const all: { text: string; why?: string }[] = wrong.map(([text, why]) => ({ text, why }));
  all.splice(n % (wrong.length + 1), 0, { text: correct });
  // An Assertion-Reason item keeps the board's four options in the board's order, (a) to (d).
  if (all.every((o) => BOARD_ORDER.includes(o.text))) all.sort((x, y) => BOARD_ORDER.indexOf(x.text) - BOARD_ORDER.indexOf(y.text));
  const options = all.map((o, i) => ({ id: 'abcdefgh'[i], text: o.text, ...(o.why === undefined ? {} : { why: o.why }) }));
  return { id: qid(n), topicId: T, conceptId, difficulty, type: 'mcq', prompt, options, correct: options.find((o) => o.text === correct)!.id, hints, explanation };
}

const tf = (n: number, conceptId: string, difficulty: Difficulty, prompt: string, correct: boolean, explanation: string, hints: string[]): TrueFalseQuestion => ({
  id: qid(n), topicId: T, conceptId, difficulty, type: 'true_false', prompt, correct, hints, explanation,
});

/** A typed answer: an amount in rupees, or a plain number (of shares) with `unit` 'number'. */
const num = (
  n: number,
  conceptId: string,
  difficulty: Difficulty,
  prompt: string,
  answer: number,
  errors: [number, string][],
  working: string[],
  hints: string[],
  unit: 'rupees' | 'number' = 'rupees',
): NumericQuestion => {
  const scale = unit === 'rupees' ? 100 : 1;
  return {
    id: qid(n), topicId: T, conceptId, difficulty, type: 'numeric', unit, prompt, answer: answer * scale,
    commonErrors: errors.map(([value, why]) => ({ value: value * scale, why })), working, hints, explanation: working.join(' '),
  };
};

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
  const expected: JournalLine[] = lines.map(([accountId, side, amount]) => ({ accountId, side, amount: amount * 100 }));
  return {
    id: qid(n), topicId: T, conceptId, difficulty, type: 'journal_entry', prompt, expected,
    accountChoices: [...new Set([...expected.map((l) => l.accountId), ...extraChoices, 'cash', 'bank'])].sort(), hints, explanation,
  };
};

const AR = 'Assertion (A) and Reason (R) are given. Which is correct?';
const arOptions = (right: 0 | 1 | 2 | 3, whys: [string, string, string]): { correct: string; wrong: [string, string][] } => {
  const wrong = BOARD_ORDER.filter((_, i) => i !== right).map((text, i): [string, string] => [text, whys[i]]);
  return { correct: BOARD_ORDER[right], wrong };
};

const ar13 = arOptions(0, [
  'Missed the link: it is because the premium is a capital receipt with uses fixed by law that it cannot be paid out as dividend.',
  'Denied that the premium is a capital receipt; it is not earned by the business, it is paid in by shareholders.',
  'Thought the premium can be paid out as dividend; section 52 does not allow it.',
]);
const ar29 = arOptions(0, [
  'Missed the link: the gain goes to Capital Reserve exactly because it is a capital profit.',
  'Denied that the gain is a capital profit; it does not come from the trading of the company.',
  'Thought the gain is credited to the Statement of Profit and Loss or left in Forfeited Shares A/c.',
]);

const questions: Question[] = [
  // ---- Kinds of capital, special issues, issue at par and at a premium ----
  mcq(1, 'sc-kinds', 'easy', 'The capital stated in the Memorandum of Association, beyond which a company cannot issue shares, is its:',
    'Authorised capital',
    [
      ['Issued capital', 'Mixed up the limit with the part of it that is actually offered for subscription.'],
      ['Subscribed capital', 'Mixed up the limit with the shares the public has taken up.'],
      ['Paid-up capital', 'Mixed up the limit with the money actually received from the shareholders.'],
    ],
    'Authorised (nominal or registered) capital is the largest share capital a company may raise. It is fixed in the Memorandum of Association.',
    ['Which figure is a ceiling, not something raised?', 'It is also called nominal or registered capital.']),
  tf(2, 'sc-kinds', 'easy', 'The subscribed capital of a company can be more than its issued capital.', false,
    'A company cannot allot more shares than it has offered, so the subscribed capital is at most equal to the issued capital.',
    ['Subscribed capital is the part of the issued capital that was taken up.']),
  mcq(3, 'sc-kinds', 'medium', 'When can reserve capital be called up from the shareholders?',
    'Only when the company is being wound up',
    [
      ['Whenever the directors need funds', 'Treated it as ordinary uncalled capital; a special resolution has set it apart and it cannot be called while the company is running.'],
      ['Only in a year in which the company makes a loss', 'Tied it to losses; the only event that allows the call is a winding up.'],
      ['Only after all the reserves of the company are used up', 'Mixed it up with reserves made out of profit; reserve capital is uncalled share capital.'],
    ],
    'Reserve capital is the part of the uncalled capital that the company has resolved, by special resolution, to call only in the event of winding up.',
    ['It is capital that is deliberately kept back.', 'A special resolution is needed to create it.']),
  mcq(4, 'sc-kinds', 'easy', 'Which of these is created out of a capital profit?',
    'Capital reserve',
    [
      ['Reserve capital', 'Mixed up the two names; reserve capital is uncalled share capital kept back for a winding up.'],
      ['Called-up capital', 'Picked the amount asked for on the shares, which is not made out of any profit.'],
      ['Authorised capital', 'Picked the limit set in the Memorandum, which is not made out of any profit.'],
    ],
    'A capital reserve is built from capital profits, such as the gain on reissue of forfeited shares or a business bought for less than its net assets.',
    ['Which of the four is a reserve at all?']),
  tf(5, 'sc-kinds', 'medium', 'Reserve capital is shown under Reserves and Surplus in the balance sheet.', false,
    'Reserve capital is a part of the uncalled capital. It has been neither called nor received, so it does not appear in the balance sheet at all. It is Capital Reserve that is shown under Reserves and Surplus.',
    ['Has any money been received for reserve capital?']),
  mcq(6, 'sc-kinds', 'easy', 'Compared with equity shareholders, preference shareholders have a prior right to:',
    'A dividend at a fixed rate, and repayment of capital on winding up',
    [
      ['Vote on every resolution of the company', 'Gave them the right that normally belongs to the equity shareholders.'],
      ['Interest on their shares whether or not there is a profit', 'Treated the preference dividend as interest; it is a dividend and comes only out of profit.'],
      ['Buy every new share the company issues', 'Invented a right; their preference is only as to dividend and repayment of capital.'],
    ],
    'Preference shares are preferred in two ways: the dividend at a fixed rate is paid before any equity dividend, and on winding up their capital is repaid before the equity capital.',
    ['There are exactly two preferential rights.']),
  mcq(7, 'sc-special-issues', 'easy', 'An Employee Stock Option Plan (ESOP) gives an employee:',
    'The right, but not the duty, to buy shares of the company in future at a price fixed in advance',
    [
      ['Free shares in place of a part of the salary', 'Took the plan for a gift of shares; an option has to be exercised and the price paid.'],
      ['A fixed dividend every year on the salary earned', 'Mixed up an option to buy shares with a payment of dividend.'],
      ['A duty to buy the shares of the company at the market price', 'Turned an option into a duty; the employee may choose not to buy.'],
    ],
    'An ESOP is an option: after a stated period the employee may buy the shares at the pre-fixed price, usually below the market price, or may let the option go.',
    ['The key word is "option".']),
  mcq(8, 'sc-special-issues', 'medium', 'A company allots shares to one of its directors, without taking cash, for the technical know-how the director has made available. These shares are:',
    'Sweat equity shares',
    [
      ['Shares under an Employee Stock Option Plan', 'Took an allotment made now for know-how to be an option to buy shares later.'],
      ['Shares issued by private placement', 'Took it for an offer made to selected investors for cash.'],
      ['Preference shares', 'Named a class of share; the question is about why and to whom the shares are given.'],
    ],
    'Sweat equity shares are issued to employees or directors at a discount or for consideration other than cash, in return for know-how, intellectual property rights or other value they add.',
    ['What did the director give the company in return?']),
  tf(9, 'sc-special-issues', 'easy', 'In a private placement a company offers its shares to a selected group of persons, without inviting the public through a prospectus.', true,
    'A private placement is made through a private offer letter to chosen persons. The public is not invited.',
    ['To whom is the offer made?']),
  mcq(10, 'sc-issue', 'easy', 'A company receives application money on its shares. Until the shares are allotted, the money is credited to:',
    'Share Application A/c',
    [
      ['Share Capital A/c', 'Treated the money as capital before any share was allotted; an applicant is not yet a shareholder.'],
      ['Share Allotment A/c', 'Used the account that records the allotment money falling due.'],
      ['Securities Premium A/c', 'Treated application money as a premium.'],
    ],
    'Application money is held in Share Application A/c. Only on allotment is it transferred to Share Capital A/c.',
    ['Is an applicant a shareholder yet?']),
  mcq(11, 'sc-issue', 'easy', 'Securities premium is best described as:',
    'A capital receipt, shown under Reserves and Surplus',
    [
      ['A revenue profit, credited to the Statement of Profit and Loss', 'Treated money paid in by shareholders as a profit earned by the business.'],
      ['A part of share capital, shown with the face value of the shares', 'Added the premium to share capital; share capital is the face value alone.'],
      ['A liability, to be repaid to the shareholders', 'Treated the premium as repayable; it stays with the company as a reserve.'],
    ],
    'The premium is received from shareholders over and above the face value. It is a capital receipt, credited to Securities Premium A/c and shown under Reserves and Surplus.',
    ['Is it earned from trading, or paid in by the owners?']),
  tf(12, 'sc-issue', 'easy', 'A company may issue its equity shares to the public at a price below their face value.', false,
    'Section 53 of the Companies Act, 2013 forbids the issue of shares at a discount. The only exception is sweat equity shares.',
    ['Shares are issued at par or at a premium.']),
  mcq(13, 'sc-issue', 'medium', `${AR} Assertion (A): The balance of Securities Premium A/c cannot be used to pay a dividend. Reason (R): Securities premium is a capital receipt, and the Companies Act, 2013 lists the only purposes for which it may be used.`,
    ar13.correct, ar13.wrong,
    'Both statements are true, and the reason explains the assertion: the premium is a capital receipt whose uses are limited by section 52, and paying a dividend is not among them.',
    ['Is the premium a profit of the business?', 'Is paying a dividend among the uses the Act allows?']),
  mcq(14, 'sc-subscription', 'easy', 'A public issue of shares can go to allotment only if applications are received for at least:',
    '90% of the shares issued',
    [
      ['50% of the shares issued', 'Took a simple majority to be enough; the minimum subscription is 90% of the issue.'],
      ['75% of the shares issued', 'Took three quarters to be enough; the minimum subscription is 90% of the issue.'],
      ['100% of the shares issued', 'Thought an issue must be fully subscribed; 90% is enough.'],
    ],
    'The minimum subscription is 90% of the issue. If it is not received, no share is allotted and the application money is returned.',
    ['It is called the minimum subscription.']),
  mcq(15, 'sc-issue', 'medium', 'A share of ₹10 is issued at ₹13, the premium of ₹3 being payable with the allotment money. When is Securities Premium A/c credited?',
    'When the allotment money becomes due',
    [
      ['When the application money is received', 'Credited the premium on application although it is payable with the allotment money.'],
      ['Only when the last call is received', 'Put the premium off to the end of the issue; it belongs to the instalment that carries it.'],
      ['It is not credited separately: the ₹13 goes to Share Capital A/c', 'Credited the premium to Share Capital A/c; share capital is the face value alone.'],
    ],
    'The premium is credited in the entry for the instalment with which it is payable: Share Allotment A/c Dr; To Share Capital A/c; To Securities Premium A/c.',
    ['Which instalment carries the premium here?']),
  tf(16, 'sc-subscription', 'easy', 'When an issue is under-subscribed, the entries are passed for the number of shares offered to the public.', false,
    'Only the shares applied for can be allotted, so every entry, from application to the last call, is worked on the number of shares applied for and allotted.',
    ['Can a company allot a share nobody applied for?']),
  mcq(42, 'sc-issue', 'medium', 'Deccan Tools Ltd. has ₹4,00,000 in Securities Premium A/c and has earned very little profit this year. A director proposes to pay the dividend out of the premium. What should the accountant say?',
    'It cannot be done: the premium may be used only for the purposes the Companies Act allows, and a dividend is not one of them',
    [
      ['It can be done, because the premium is money that belongs to the company', 'Treated a capital receipt as a profit free to be shared out.'],
      ['It can be done, once the premium is transferred to the Statement of Profit and Loss', 'Thought a transfer turns a capital receipt into a profit; the law does not allow that transfer.'],
      ['It can be done, but only for the preference shareholders', 'Invented an exception; no dividend of any kind can be paid out of the premium.'],
    ],
    'Securities premium is a capital receipt. Section 52 of the Companies Act, 2013 lists its uses, and paying a dividend is not among them.',
    ['Is the premium a profit earned by the company?']),
  num(33, 'sc-kinds', 'easy', 'A company has allotted 10,000 equity shares of ₹10 each and has called up ₹8 a share. The last call of ₹2 a share has not been paid on 500 shares. What is its paid-up capital?', 79000,
    [[80000, 'Gave the called-up capital and did not deduct the calls in arrears.'], [81000, 'Added the calls in arrears instead of deducting them.'], [99000, 'Deducted the arrears from the full face value, although only ₹8 a share has been called.']],
    ['Called-up capital = 10,000 x ₹8 = ₹80,000.', 'Calls in arrears = 500 x ₹2 = ₹1,000.', 'Paid-up capital = ₹80,000 - ₹1,000 = ₹79,000.'],
    ['Paid-up capital = called-up capital - calls in arrears.']),

  // ---- Subscription, calls and vendors ----
  mcq(17, 'sc-subscription', 'medium', 'An issue of shares is over-subscribed. Which of these can the company NOT do?',
    'Allot every share applied for, although that is more than the shares offered',
    [
      ['Refuse some applications and return the money paid on them', 'Picked a course that is open to the company: excess applications may be refused and refunded.'],
      ['Allot shares pro rata to all the applicants', 'Picked a course that is open to the company: everyone may be given a proportion of what was applied for.'],
      ['Refuse some applications and allot pro rata to the rest', 'Picked a course that is open to the company: the two methods may be combined.'],
    ],
    'A company cannot allot more shares than it has offered. It deals with the excess by refusing applications, by allotting pro rata, or by a combination of the two.',
    ['How many shares, at most, can be allotted?']),
  mcq(18, 'sc-subscription', 'medium', 'Shares are allotted pro rata. What is normally done with the excess application money of those applicants?',
    'It is kept and set against the allotment money due from them',
    [
      ['It is credited to Securities Premium A/c', 'Treated the excess application money as a premium.'],
      ['It is credited to Share Capital A/c as extra capital', 'Credited capital on shares that were never allotted.'],
      ['It is transferred to Capital Reserve', 'Treated money that still belongs to the applicants as a gain of the company.'],
    ],
    'The applicants paid on more shares than they got. The excess is kept towards the sum due on allotment: Share Application A/c Dr; To Share Allotment A/c.',
    ['The applicants still owe the allotment money.']),
  mcq(19, 'sc-calls', 'easy', 'A shareholder has not paid a call that the company has made. The unpaid amount is called:',
    'Calls in arrears',
    [
      ['Calls in advance', 'Mixed up money paid before a call is made with money not paid after it.'],
      ['Uncalled capital', 'Picked the part of the face value not yet asked for; here the call has been made.'],
      ['Reserve capital', 'Picked the uncalled capital kept back for a winding up.'],
    ],
    'Money called but not received is calls in arrears. It is deducted from the called-up capital in the note on Share Capital.',
    ['Has the call been made? Has it been paid?']),
  mcq(20, 'sc-calls', 'easy', 'Money received from a shareholder on a call that has not yet been made is, for the company:',
    'A liability, credited to Calls in Advance A/c',
    [
      ['Share capital, credited to Share Capital A/c', 'Treated the money as capital before the call was made.'],
      ['An income, credited to the Statement of Profit and Loss', 'Treated money paid in by a shareholder as income.'],
      ['A reserve, credited to Securities Premium A/c', 'Treated money paid early as a premium.'],
    ],
    'Until the call is made the company owes this money to the shareholder, so it is a liability: Bank A/c Dr; To Calls in Advance A/c.',
    ['Has the company asked for this money yet?']),
  tf(21, 'sc-calls', 'medium', 'Calls in advance are shown as part of the paid-up share capital in the balance sheet.', false,
    'Calls in advance are not capital until the call is made. They are shown under Other Current Liabilities.',
    ['Is the money due to the company yet?']),
  mcq(22, 'sc-vendor', 'medium', 'A company has bought machinery from a vendor and recorded the purchase. It now settles the price by allotting its shares to the vendor at a premium. Which entry records the allotment?',
    'Vendor Dr; To Share Capital A/c; To Securities Premium A/c',
    [
      ['Bank A/c Dr; To Share Capital A/c; To Securities Premium A/c', 'Brought in cash; no money is received when shares are given in payment for an asset.'],
      ['Vendor Dr; To Bank A/c', 'Paid the vendor in cash, although the price is settled in shares.'],
      ['Share Capital A/c Dr; To Vendor', 'Turned the entry round: the amount owed to the vendor is cleared by a debit, and capital is credited.'],
    ],
    'The vendor is debited because the amount owed is settled. Share Capital A/c is credited with the face value of the shares and Securities Premium A/c with the premium.',
    ['Who is owed the money, and how is it being settled?']),
  mcq(23, 'sc-vendor', 'medium', 'A company takes over a running business and pays more than its net assets are worth. The excess is:',
    'Debited to Goodwill A/c',
    [
      ['Credited to Capital Reserve A/c', 'Read an excess paid as a gain; a capital reserve arises when the price is below the net assets.'],
      ['Debited to the Statement of Profit and Loss as an expense of the year', 'Charged the excess to profit; it is the price of goodwill, an asset.'],
      ['Credited to Securities Premium A/c', 'Mixed up a price above net assets with shares issued above face value.'],
    ],
    'Purchase consideration above the net assets taken over is the price paid for goodwill, so Goodwill A/c is debited.',
    ['Net assets = assets taken over - liabilities taken over.']),
  mcq(32, 'sc-subscription', 'medium', 'A company allots 2 shares for every 3 applied for. Ravi applied for 900 shares and paid ₹3 a share on application. How much of Ravi\'s application money is excess, to be set against the allotment money?',
    '₹900',
    [
      ['₹2,700', 'Gave all the application money Ravi paid; the part for the 600 shares allotted is share capital.'],
      ['₹1,800', 'Gave the application money on the 600 shares allotted, which goes to Share Capital A/c.'],
      ['₹300', 'Gave the number of shares not allotted, without multiplying by the application money a share.'],
    ],
    'Ravi is allotted 900 x 2/3 = 600 shares. Excess = (900 - 600) x ₹3 = ₹900.',
    ['First find the shares allotted.', 'Excess = shares not allotted x application money a share.']),
  mcq(46, 'sc-calls', 'medium', 'A company keeps no Calls in Arrears A/c. It made a first call of ₹2 a share on 10,000 shares and received the money on 9,600 shares. What does Share First Call A/c now show?',
    'A debit balance of ₹800',
    [
      ['A credit balance of ₹800', 'Put the unpaid call on the credit side; the account was debited with the whole call and credited only with the money received.'],
      ['No balance', 'Closed the account although the call on 400 shares is unpaid.'],
      ['A debit balance of ₹20,000', 'Left the whole call as the balance and forgot the ₹19,200 received.'],
    ],
    'Debited with 10,000 x ₹2 = ₹20,000 when the call fell due and credited with 9,600 x ₹2 = ₹19,200 received: the debit balance of ₹800 is the calls in arrears.',
    ['What was the account debited with, and what was it credited with?']),
  mcq(48, 'sc-vendor', 'easy', 'Shares allotted to a vendor in payment for an asset bought from the vendor are said to be issued:',
    'For consideration other than cash',
    [
      ['At a discount', 'Mixed up the way the shares are paid for with the price at which they are issued.'],
      ['By private placement', 'Took it for an offer of shares to selected investors for cash.'],
      ['As sweat equity', 'Took it for shares given to employees or directors for know-how; here an outside seller is paid for an asset.'],
    ],
    'The company receives an asset, not cash, for the shares: they are issued for consideration other than cash.',
    ['What does the company receive in return for the shares?']),
  num(34, 'sc-subscription', 'medium', 'A company issued 40,000 equity shares of ₹10 each, payable ₹3 on application. Applications were received for 60,000 shares and the shares were allotted pro rata to all the applicants. How much application money is excess, to be set against the allotment money?', 60000,
    [[180000, 'Gave all the application money received.'], [120000, 'Gave the application money on the shares allotted, which goes to Share Capital A/c.'], [200000, 'Worked the excess at the face value of the shares not allotted.']],
    ['Shares applied for but not allotted = 60,000 - 40,000 = 20,000.', 'Excess application money = 20,000 x ₹3 = ₹60,000.'],
    ['Excess = (shares applied for - shares allotted) x application money a share.']),
  num(35, 'sc-vendor', 'easy', 'A company bought a building for ₹5,50,000 and paid for it by issuing equity shares of ₹10 each at a premium of 10%. How many shares did it issue?', 50000,
    [[55000, 'Divided the price by the face value, although each share is issued at ₹11.'], [550000, 'Divided the price by the premium of ₹1 alone.']],
    ['Issue price = ₹10 + 10% of ₹10 = ₹11.', 'Number of shares = ₹5,50,000 / ₹11 = 50,000.'],
    ['Number of shares = purchase price / issue price of a share.'], 'number'),
  jr(39, 'sc-issue', 'easy', 'A company invited applications for 50,000 equity shares of ₹10 each, payable ₹3 on application. Applications were received for exactly 50,000 shares, with the money. Pass the entry for the receipt of the application money.',
    [['bank', 'Dr', 150000], ['equityShareApplication', 'Cr', 150000]], ['equityShareCapital', 'equityShareAllotment', 'securitiesPremium'],
    '50,000 x ₹3 = ₹1,50,000 is received in the bank. It is held in Equity Share Application A/c until the shares are allotted.',
    ['The applicants are not shareholders yet.']),

  // ---- Forfeiture, reissue and the balance sheet ----
  mcq(24, 'sc-forfeiture', 'easy', 'On the forfeiture of shares, Share Capital A/c is debited with:',
    'The amount called up on the forfeited shares',
    [
      ['The amount paid up on the forfeited shares', 'Debited only what was received; the capital credited on the shares so far is the amount called up.'],
      ['The face value of the forfeited shares, whatever has been called', 'Debited the full face value even where a part of it has not been called yet.'],
      ['The amount unpaid on the forfeited shares', 'Debited only the unpaid money; that is the amount credited to the call accounts.'],
    ],
    'Share Capital A/c was credited with every amount called on the shares. Forfeiture cancels the shares, so the same called-up amount is debited.',
    ['What has Share Capital A/c been credited with on these shares so far?']),
  mcq(25, 'sc-forfeiture', 'medium', 'Shares that were issued at a premium are forfeited. Securities Premium A/c is debited:',
    'Only if the premium on those shares was not received',
    [
      ['Always, with the premium on the forfeited shares', 'Took back a premium even where it had been received.'],
      ['Never', 'Left a premium in the account even where it was never received.'],
      ['Only if the premium on those shares was received', 'Turned the rule round: a premium that was received stays, one that was not received is cancelled.'],
    ],
    'The premium is credited when it falls due. If it was never received on the forfeited shares, that credit is cancelled; if it was received, it stays.',
    ['Was the instalment that carried the premium paid?']),
  tf(26, 'sc-reissue', 'medium', 'The balance of Forfeited Shares A/c is transferred to Capital Reserve as soon as the shares are forfeited.', false,
    'The transfer is made only after the shares are reissued, and only for the shares reissued, after deducting any discount on reissue. Until then the balance stays in Forfeited Shares A/c.',
    ['Could a discount on reissue still have to be met out of this balance?']),
  mcq(27, 'sc-reissue', 'easy', 'Forfeited shares may be reissued at a discount. The discount on a share cannot be more than:',
    'The amount forfeited on that share',
    [
      ['The face value of the share', 'Allowed the whole face value as a discount; the company would then receive nothing for the share.'],
      ['The amount left unpaid on that share', 'Took the unpaid amount as the limit; the limit is what had been received and forfeited.'],
      ['10% of the face value of the share', 'Applied a fixed percentage; the limit is the amount forfeited on the share.'],
    ],
    'On reissue the company must receive, from the old holder and the new one together, at least the amount the share is treated as paid up. The old holder\'s part is the amount forfeited, so the discount can go up to that and no further. (A ₹10 share, ₹8 called and ₹5 paid, reissued as fully paid: the lowest price is ₹10 - ₹5 = ₹5.)',
    ['The company must end up with the full paid-up value of the share.']),
  mcq(28, 'sc-reissue', 'medium', 'A forfeited share of ₹10 is reissued as fully paid for ₹12. The extra ₹2 is credited to:',
    'Securities Premium A/c',
    [
      ['Capital Reserve A/c', 'Treated the premium on reissue as part of the gain on forfeiture.'],
      ['Forfeited Shares A/c', 'Added the premium to the amount forfeited.'],
      ['Share Capital A/c', 'Credited more than the face value to Share Capital A/c.'],
    ],
    'A price above the paid-up value on reissue is a premium, credited to Securities Premium A/c. The whole amount forfeited on the share then goes to Capital Reserve.',
    ['Share capital is the face value alone.']),
  mcq(29, 'sc-reissue', 'medium', `${AR} Assertion (A): After forfeited shares are reissued, the gain left in Forfeited Shares A/c on them is transferred to Capital Reserve. Reason (R): The gain is a capital profit; it does not arise from the trading of the company.`,
    ar29.correct, ar29.wrong,
    'Both statements are true, and the reason explains the assertion: because the gain is a capital profit it is kept in a capital reserve and not credited to the Statement of Profit and Loss.',
    ['Where does a capital profit go?']),
  tf(31, 'sc-forfeiture', 'easy', 'A shareholder whose shares are forfeited is paid back the money already paid on them.', false,
    'On forfeiture the holder loses the shares and the money paid on them. That money is credited to Forfeited Shares A/c.',
    ['What does "forfeit" mean?']),
  mcq(43, 'sc-disclosure', 'medium', 'Which of these is NOT shown in the note on Share Capital?',
    'Securities premium',
    [
      ['Authorised capital', 'Picked an item the note does show, for information.'],
      ['Calls in arrears', 'Picked an item the note does show, as a deduction from the called-up capital.'],
      ['The balance of Forfeited Shares A/c', 'Picked an item the note does show, added to the subscribed capital.'],
    ],
    'Securities premium is a reserve and is shown in the note on Reserves and Surplus. The note on Share Capital shows authorised, issued and subscribed capital, calls in arrears and forfeited shares.',
    ['Which of the four is a reserve?']),
  tf(44, 'sc-disclosure', 'medium', 'The authorised capital of a company is included in the total of the Equity and Liabilities part of its balance sheet.', false,
    'Authorised and issued capital are shown in the note for information only. The total takes in the subscribed capital, at its called-up amount less calls in arrears, plus any forfeited shares balance.',
    ['Has the authorised capital been received?']),
  mcq(45, 'sc-disclosure', 'easy', 'Under which head of the balance sheet of a company is share capital shown?',
    "Shareholders' Funds",
    [
      ['Non-current Liabilities', 'Treated capital contributed by the owners as a long-term debt.'],
      ['Current Liabilities', 'Treated capital contributed by the owners as a short-term debt.'],
      ['Non-current Assets', 'Put a source of funds among the assets.'],
    ],
    "Share Capital is the first line under Shareholders' Funds; Reserves and Surplus is the second.",
    ['Whose money is share capital?']),
  tf(47, 'sc-forfeiture', 'medium', 'On forfeiture, a premium that has already been received on the shares is debited to Securities Premium A/c.', false,
    'A premium that has been received is not cancelled on forfeiture. Securities Premium A/c is debited only with a premium that was not received.',
    ['Was the premium received or not?']),
  num(36, 'sc-forfeiture', 'easy', 'Kiran holds 200 equity shares of ₹10 each, fully called up, on which ₹6 a share has been paid. The shares are forfeited. What amount is credited to Forfeited Shares A/c?', 1200,
    [[2000, 'Gave the amount called up, which is the debit to Share Capital A/c.'], [800, 'Gave the amount left unpaid on the shares.']],
    ['Forfeited Shares A/c is credited with the amount received: 200 x ₹6 = ₹1,200.'],
    ['Forfeited Shares A/c holds what the holder had paid.']),
  num(37, 'sc-reissue', 'medium', 'A company forfeited 200 shares of ₹10 each on which ₹6 a share had been received. It reissued 120 of them at ₹7 a share, fully paid. What amount is transferred to Capital Reserve?', 360,
    [[720, 'Forgot the discount of ₹3 a share allowed on reissue.'], [840, 'Took the whole ₹1,200 forfeited, although only 120 of the 200 shares were reissued.'], [480, 'Gave the amount that stays in Forfeited Shares A/c for the 80 shares not yet reissued.']],
    ['Forfeited on the 120 shares reissued = 120 x ₹6 = ₹720.', 'Discount on reissue = 120 x (₹10 - ₹7) = ₹360.', 'Capital Reserve = ₹720 - ₹360 = ₹360.'],
    ['Work only on the shares reissued.', 'Capital reserve = amount forfeited on them - discount on reissue.']),
  num(38, 'sc-forfeiture', 'complex', 'Equity shares of ₹10 each were issued at par, payable ₹3 on application, ₹4 on allotment and ₹3 on first and final call. Every applicant was allotted 2 shares for every 3 applied for, and excess application money was set against the allotment money. Farhan, who was allotted 400 shares, paid nothing after the application money, and the shares were forfeited after the call. What amount is credited to Forfeited Shares A/c?', 1800,
    [[1200, 'Took the application money on the 400 shares allotted only, and left out the excess application money.'], [4000, 'Gave the amount called up, which is the debit to Share Capital A/c.'], [2200, 'Gave the amount left unpaid: ₹1,000 on allotment and ₹1,200 on the call.']],
    ['Farhan applied for 400 x 3/2 = 600 shares and paid 600 x ₹3 = ₹1,800 on application.', 'Nothing else was received, so ₹1,800 is credited to Forfeited Shares A/c.', 'Check: called up ₹4,000 = received ₹1,800 + unpaid on allotment (₹1,600 - ₹600) ₹1,000 + unpaid call ₹1,200.'],
    ['How many shares did Farhan apply for?', 'Everything Farhan paid is forfeited.']),
  jr(40, 'sc-forfeiture', 'medium', 'Meera holds 100 equity shares of ₹10 each, issued at par and fully called up. Meera paid the application and allotment money, ₹7 a share in all, but not the first and final call of ₹3 a share. The company keeps no Calls in Arrears A/c. Pass the entry for the forfeiture of the shares.',
    [['equityShareCapital', 'Dr', 1000], ['forfeitedShares', 'Cr', 700], ['equityShareFirstAndFinalCall', 'Cr', 300]], ['callsInArrears', 'securitiesPremium', 'capitalReserve'],
    'Equity Share Capital A/c is debited with the amount called up, 100 x ₹10 = ₹1,000. Forfeited Shares A/c is credited with the ₹700 received, and the call account with the ₹300 unpaid.',
    ['Debit the amount called up.', 'Credit what was received and what was unpaid.']),
  jr(41, 'sc-reissue', 'medium', 'A company had forfeited 100 equity shares of ₹10 each on which ₹7 a share had been received. It now reissues all of them at ₹8 a share, fully paid. Pass the entry for the reissue.',
    [['bank', 'Dr', 800], ['forfeitedShares', 'Dr', 200], ['equityShareCapital', 'Cr', 1000]], ['capitalReserve', 'securitiesPremium'],
    'Bank A/c is debited with 100 x ₹8 = ₹800. The shares are fully paid, so Equity Share Capital A/c is credited with ₹1,000. The discount of ₹200 is met out of the amount forfeited: Forfeited Shares A/c is debited.',
    ['The shares are reissued as fully paid.', 'Where does the discount on reissue come from?']),
];

// ---------------------------------------------------------------------------------------------------------------
// Levels
// ---------------------------------------------------------------------------------------------------------------

const levels = buildLadder(T, {
  concept: {
    title: 'How a Company Raises Share Capital',
    description: 'See what a share is, the stages its capital passes through, and why the money comes in instalments.',
    lesson: [
      {
        type: 'text',
        heading: 'Capital in small equal parts',
        body: 'A company needs far more capital than a few partners can bring, so it divides its capital into small equal units called shares and invites many people to buy them. A share has a face value, say ₹10. Whoever is allotted shares becomes a part-owner. Equity shareholders take the risk and what is left of the profit; preference shareholders get a fixed rate of dividend first and their capital back first on winding up. A company may also give shares to a chosen few investors (private placement), offer employees an option to buy shares later (ESOP), or give shares to employees and directors for their know-how (sweat equity).',
      },
      {
        type: 'text',
        heading: 'Five stages of one capital',
        body: 'Suppose the Memorandum allows 1,00,000 shares of ₹10: that ₹10,00,000 is the authorised capital. The company offers 55,000 shares: issued capital ₹5,50,000. The public takes up 50,000: subscribed capital ₹5,00,000. The company has so far asked for ₹8 a share: called-up capital ₹4,00,000. One holder of 1,000 shares has not paid the last ₹2: calls in arrears ₹2,000, so the paid-up capital is ₹3,98,000. Each figure is a part of the one before it.',
      },
      {
        type: 'text',
        heading: 'The money comes in instalments',
        body: 'A share is usually paid for in parts: some with the application, some on allotment, the rest on one or two calls. Application money is held in Share Application A/c, because an applicant is not a shareholder yet. On allotment it is moved to Share Capital A/c. After that, each instalment has two entries: one when it falls due (the instalment account is debited and Share Capital A/c credited) and one when the money is received. If the share is sold above its face value, the excess is a premium. It is credited to Securities Premium A/c, never to Share Capital A/c, with the instalment that carries it. Shares cannot be issued below face value.',
      },
      {
        type: 'example',
        title: 'Allotment money due on 50,000 shares: ₹6 a share, of which ₹2 is premium',
        lines: [
          { accountId: 'equityShareAllotment', side: 'Dr', amount: 30000000 },
          { accountId: 'equityShareCapital', side: 'Cr', amount: 20000000 },
          { accountId: 'securitiesPremium', side: 'Cr', amount: 10000000 },
        ],
        note: 'The shareholders now owe 50,000 x ₹6 = ₹3,00,000, so Equity Share Allotment A/c is debited. Only the capital part, 50,000 x ₹4, goes to Equity Share Capital A/c; the premium, 50,000 x ₹2, goes to Securities Premium A/c. Bank A/c is debited later, when the money comes in.',
      },
      {
        type: 'text',
        heading: 'When things do not go to plan',
        body: 'Too few applications: below 90% of the issue nothing can be allotted; from 90% upwards the company allots what was applied for. Too many: it refuses some applications, or gives everyone a proportion (pro rata) and keeps the excess application money towards allotment. A shareholder who does not pay a call is in arrears; if the money still does not come, the shares are forfeited: the holder loses them and the money paid, and the company can reissue them, even below face value, as long as the discount is not more than the amount forfeited. What is left of the forfeited amount after reissue is a capital profit, kept in Capital Reserve.',
      },
      {
        type: 'working',
        title: 'Narmada Textiles Ltd., Surat: 1,00,000 shares of ₹10 offered, 1,60,000 applied for, ₹3 a share on application',
        lines: [
          'Applications for 40,000 shares are refused and the money returned: 40,000 x ₹3 = ₹1,20,000.',
          'Applicants for the other 1,20,000 shares get 1,00,000 shares pro rata, five for every six applied for.',
          'Application money of these applicants = 1,20,000 x ₹3 = ₹3,60,000. Money due on application for the shares allotted = 1,00,000 x ₹3 = ₹3,00,000.',
          'Excess = ₹3,60,000 - ₹3,00,000 = ₹60,000, kept towards the allotment money (₹4 a share, ₹4,00,000 in all).',
        ],
        note: 'Watch out: the excess of the pro rata group is adjusted towards allotment, while the money of the refused applicants is returned. Only what the allotment money cannot absorb is refunded.',
      },
      {
        type: 'example',
        title: 'Narmada Textiles: the application money moved to share capital, refunded and kept for allotment',
        lines: [
          { accountId: 'equityShareApplication', side: 'Dr', amount: 48000000 },
          { accountId: 'equityShareCapital', side: 'Cr', amount: 30000000 },
          { accountId: 'bank', side: 'Cr', amount: 12000000 },
          { accountId: 'equityShareAllotment', side: 'Cr', amount: 6000000 },
        ],
        note: 'All the application money received, 1,60,000 x ₹3 = ₹4,80,000, leaves Equity Share Application A/c: ₹3,00,000 is capital on the shares allotted, ₹1,20,000 is refunded and ₹60,000 is credited to the allotment account.',
      },
      {
        type: 'example',
        title: 'Kaveri Foods Ltd., Mysuru: 200 shares of ₹10 issued at ₹2 premium (payable on allotment) forfeited; the holder paid only the ₹3 application money',
        lines: [
          { accountId: 'equityShareCapital', side: 'Dr', amount: 200000 },
          { accountId: 'securitiesPremium', side: 'Dr', amount: 40000 },
          { accountId: 'forfeitedShares', side: 'Cr', amount: 60000 },
          { accountId: 'equityShareAllotment', side: 'Cr', amount: 100000 },
          { accountId: 'equityShareFirstAndFinalCall', side: 'Cr', amount: 80000 },
        ],
        note: 'The shares were fully called (₹3 + ₹3 + ₹4): Share Capital is debited 200 x ₹10. The premium was due with allotment and never received, so it is taken back from Securities Premium. Forfeited Shares gets only what was paid towards capital, 200 x ₹3; the unpaid allotment (₹5 with the premium) and call (₹4) close their accounts. Watch out: had the allotment money been paid, Securities Premium would not be debited.',
      },
      {
        type: 'working',
        title: 'Kaveri Foods reissues 150 of those 200 shares as fully paid at ₹8 each',
        lines: [
          'Reissue entry: Bank A/c Dr 150 x ₹8 = ₹1,200; Forfeited Shares A/c Dr 150 x ₹2 = ₹300; To Equity Share Capital A/c 150 x ₹10 = ₹1,500.',
          'Forfeited on the 150 shares reissued = 150 x ₹3 = ₹450.',
          'Gain on them = ₹450 - ₹300 (discount) = ₹150: Forfeited Shares A/c Dr ₹150; To Capital Reserve A/c ₹150.',
          'Forfeited Shares A/c still holds 50 x ₹3 = ₹150 for the 50 shares not yet reissued; it is shown with share capital in the balance sheet.',
        ],
        note: 'Watch out: only the gain on the shares actually reissued goes to Capital Reserve, never the whole balance of Forfeited Shares A/c.',
      },
      { type: 'check', questionId: qid(10) },
      { type: 'check', questionId: qid(33) },
    ],
  },
  cards: {
    title: 'Share Capital Rules and Entries',
    description: 'Recall the kinds of capital, the entries of an issue, pro rata allotment, forfeiture, reissue and the note on share capital.',
    cardIds: cards.map((c) => c.id),
  },
  recognition: [
    {
      title: 'Kinds of Capital and the Issue of Shares',
      description: 'Recognise each kind of share capital, the special ways of issuing shares, and where application money and premium go.',
      questionIds: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 42].map(qid),
    },
    {
      title: 'Subscription, Calls and Vendors',
      description: 'Choose the right treatment when an issue is over-subscribed, a call is unpaid or paid early, and shares are given for assets.',
      questionIds: [17, 18, 32, 34, 19, 20, 21, 46, 22, 23, 48, 35, 39].map(qid),
      type: 'method_recognition',
    },
    {
      title: 'Forfeiture, Reissue and the Balance Sheet',
      description: 'Choose what is debited and credited on forfeiture and reissue, and where each balance is shown.',
      questionIds: [24, 25, 31, 47, 36, 40, 38, 26, 27, 28, 29, 41, 37, 43, 44, 45].map(qid),
      type: 'method_recognition',
    },
  ],
  practice: [
    {
      title: 'Capital, Premium and the First Entries',
      description: 'The stages of share capital, the money due on each instalment and the entries for application money and calls.',
      templateIds: [
        'sc-capital-amounts', 'sc-capital-term', 'sc-special-issue-kind', 'sc-instalment-due', 'sc-premium-total', 'sc-entry-application-received',
        'sc-entry-application-transfer', 'sc-entry-call-due', 'sc-premium-uses',
      ],
      count: 8,
    },
    {
      title: 'Subscription, Arrears, Vendors and First Forfeitures',
      description: 'Under- and over-subscription, calls in arrears, shares given to a vendor, the amount forfeited and the limit on the discount at reissue.',
      templateIds: [
        'sc-under-subscription', 'sc-minimum-subscription', 'sc-oversub-refund', 'sc-calls-in-arrears-amount', 'sc-vendor-shares', 'sc-entry-vendor-asset',
        'sc-forfeit-amount', 'sc-reissue-max-discount', 'sc-disclosure-where',
      ],
      count: 8,
    },
    {
      title: 'Pro Rata Allotment (Guided)',
      description: 'Find the shares allotted, then the excess application money, then what is still to be paid on allotment.',
      templateIds: ['sc-prorata-shares', 'sc-prorata-excess', 'sc-prorata-holder-due', 'sc-entry-prorata-application'],
      count: 6,
      guided: true,
    },
    {
      title: 'Premium, Subscription and Calls',
      description: 'Entries with a premium, refused applications, calls in arrears with and without their own account, and calls in advance.',
      templateIds: [
        'sc-reserve-capital', 'sc-entry-premium-with-application', 'sc-entry-allotment-due', 'sc-subscription-outcome', 'sc-entry-oversub-refund',
        'sc-entry-call-received-arrears', 'sc-entry-calls-in-advance', 'sc-call-cash-received',
      ],
      count: 8,
    },
    {
      title: 'Vendors, Forfeiture and Reissue',
      description: 'Shares to a vendor, goodwill or capital reserve on a takeover, the forfeiture entry, reissue and the transfer to Capital Reserve.',
      templateIds: [
        'sc-entry-vendor-issue', 'sc-vendor-goodwill', 'sc-entry-forfeiture-par', 'sc-forfeit-premium-debit', 'sc-reissue-capital-reserve-all',
        'sc-entry-reissue', 'sc-entry-capital-reserve', 'sc-note-share-capital',
      ],
      count: 8,
    },
    {
      title: 'Over-subscription and Takeovers in Full',
      description: 'Heavy over-subscription, three groups of applicants, a defaulter in a pro rata allotment, and a business paid for partly in shares.',
      templateIds: ['sc-entry-prorata-surplus', 'sc-prorata-combination', 'sc-prorata-allotment-received', 'sc-entry-business-purchase', 'sc-vendor-part-cash'],
      count: 6,
    },
    {
      title: 'Forfeiture and Reissue in Full',
      description: 'Forfeiture with a premium, forfeiture of shares allotted pro rata, reissue of some of the shares and the share capital that results.',
      templateIds: ['sc-entry-forfeiture-premium', 'sc-entry-prorata-forfeiture', 'sc-reissue-capital-reserve-part', 'sc-prorata-forfeit-reissue', 'sc-balance-sheet-capital'],
      count: 6,
    },
  ],
  mixed: { title: 'Mixed Share Capital Practice', description: 'Everything in this topic, shuffled the way an examination serves it.', count: 12 },
  challenge: { title: 'Challenge: Share Capital Mastery', description: 'The hardest questions of the topic, against the clock.', count: 8 },
  // "Pass the necessary journal entries": the entries of one issue, in date order, every amount worked out by the
  // student. These levels come after every other one and have ids of their own, so the ids of the levels above never move.
  sets: [
    {
      title: 'Journalise an Issue of Shares',
      description: 'One issue, four or five dated entries, every amount worked out by you: a fully subscribed issue from the applications to the call, an over-subscribed one allotted pro rata, and a business paid for in shares.',
      templateIds: ['sc-set-issue-in-full', 'sc-set-prorata-issue', 'sc-set-business-purchase'],
      count: 3,
    },
    {
      title: 'Journalise Forfeiture and Reissue',
      description: 'Shares forfeited for non-payment, with the premium received or not, reissued as fully paid at a discount, and the gain taken to Capital Reserve; then a whole issue with one defaulter, from the allotment to the reissue.',
      templateIds: ['sc-set-forfeiture-reissue', 'sc-set-issue-with-default'],
      count: 2,
    },
  ],
  // Accounts and statements the student prepares. Each level serves two; the accounts are balanced on 31 March and
  // brought down, the statements are the balance sheet extract with its notes and the note on share capital in parts.
  formats: [
    {
      title: 'Prepare the Accounts of an Issue',
      description: 'The Bank A/c of an issue with a refund and calls in arrears, Equity Share Capital A/c through a forfeiture and a reissue, and Forfeited Shares A/c down to the balance left on shares not yet reissued.',
      templateIds: ['sc-fmt-bank-account', 'sc-fmt-share-capital-account', 'sc-fmt-forfeited-shares-account'],
      count: 2,
    },
    {
      title: 'Show Share Capital in the Balance Sheet',
      description: 'Share capital and reserves on the face of the balance sheet with their notes, after a forfeiture and a partial reissue; and the Note to Accounts on Share Capital in all its parts, with calls in arrears deducted and forfeited shares added.',
      templateIds: ['sc-fmt-balance-sheet-extract', 'sc-fmt-note-share-capital'],
      count: 2,
    },
  ],
});

// ---------------------------------------------------------------------------------------------------------------
// The features and types of companies, added after the check against the CBSE 2025-26 syllabus: a level of its own
// after every other level, with an id of its own, so no level a learner has passed moves.
// ---------------------------------------------------------------------------------------------------------------

const COMPANY_HINTS = ['Is it about the company as a person, about its members, or about who controls it?', 'Private 2 to 200 members, public at least 7, one person company 1.'];
const companyQuestions: Question[] = [
  tf(49, 'sc-kinds', 'easy', 'True or false: a private company must have at least seven members.', false,
    'False. A private company needs at least 2 members (and at most 200); it is a public company that needs at least 7.', COMPANY_HINTS),
  tf(50, 'sc-kinds', 'easy', 'True or false: a company can own property and enter into contracts in its own name.', true,
    'True. A company is a separate legal entity, distinct from its members.', COMPANY_HINTS),
  mcq(51, 'sc-kinds', 'medium', 'The founder of Indus Chemicals Ltd., who held most of its shares, dies. What becomes of the company?', 'It carries on: the shares pass to the heirs, and the company is unaffected', [
    ['It is wound up, as a firm is on the death of a partner', 'Mixed a company up with a partnership; a company has perpetual succession.'],
    ['It must be registered again under a new name', 'Nothing in the law requires that; the company is the same person in law.'],
    ['It becomes a government company', 'Who holds the shares changes, not the nature of the company.'],
  ], 'Perpetual succession: members come and go, and the company goes on.', COMPANY_HINTS),
];

// Levels added later, after every level the topic had, with ids of their own.
const later = laterLevels(T, levels, [
      {
        name: 'companies',
        type: 'method_recognition',
        title: 'Features and Types of Companies',
        description: 'The features of a company seen in situations, the types of company, and how far a member is liable.',
        questionIds: companyQuestions.map((q) => q.id),
        generate: { templateIds: ['sc-company-feature', 'sc-company-type', 'sc-company-rule', 'sc-member-liability'], count: 6 },
      },
      {
        name: 'forfeiture-twists',
        type: 'complex_practice',
        title: 'Forfeiture and Reissue: Two Twists',
        description: 'A premium payable with the application, the allotment or the call, and forfeited shares reissued as partly paid.',
        generate: { templateIds: ['sc-entry-reissue-partly-paid', 'sc-entry-forfeiture-premium-call', 'sc-entry-forfeiture-premium', 'sc-entry-reissue'], count: 6 },
      },
      {
        name: 'assertion-reason',
        type: 'medium_practice',
        title: 'Assertion and Reason',
        description: 'The one-mark question of the board: judge the Assertion, judge the Reason, and say whether the Reason explains the Assertion.',
        generate: { templateIds: ['sc-assertion-reason'], count: 6 },
      },
    ]);

const pack: TopicPack = {
  topicId: T,
  concepts,
  cards,
  levels: [...levels, ...later],
  questions: [...questions, ...companyQuestions],
};

export default pack;
