import { debentures, vendor } from '@/engine/accounts';
import type { JournalLine } from '@/engine/journal';
import { buildLadder, laterLevels } from '../ladder';
import type { Card, Concept, Difficulty, JournalQuestion, McqQuestion, NumericQuestion, NumericUnit, Question, TopicPack, TrueFalseQuestion } from '../types';

const T = 'debentures';

// Scope (CBSE 2025-26): the ISSUE of debentures only. Redemption is not in the syllabus, so no entry of redemption,
// reserve or investment for it is asked anywhere; a premium payable on redemption appears only as it is provided for
// at the time of issue. Interest is paid in full: tax deducted at source is excluded.

const concepts: Concept[] = [
  { id: 'deb-meaning', topicId: T, title: 'Debentures, their kinds, and debentures against shares' },
  { id: 'deb-issue-cash', topicId: T, title: 'Issue for cash: at par, at a premium and at a discount' },
  { id: 'deb-vendor', topicId: T, title: 'Issue for consideration other than cash' },
  { id: 'deb-redemption-terms', topicId: T, title: 'Issue with terms of redemption: the six cases' },
  { id: 'deb-collateral', topicId: T, title: 'Debentures as collateral security' },
  { id: 'deb-interest', topicId: T, title: 'Interest on debentures' },
  { id: 'deb-write-off', topicId: T, title: 'Writing off discount or loss on issue' },
  { id: 'deb-sets', topicId: T, title: 'Journalising an issue of debentures, its interest and its write-off' },
  { id: 'deb-formats', topicId: T, title: 'Preparing the ledger accounts of an issue and the balance sheet extract' },
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
): Card => ({ id: `deb-card-${n}`, topicId: T, conceptId, kind, prompt, answer, explanation, example, commonMistake });

const cards: Card[] = [
  card(1, 'deb-meaning', 'rule', 'What is a debenture?',
    'A document issued by a company that acknowledges a debt: it states the amount borrowed, the fixed rate of interest and the terms of repayment. The holder is a creditor of the company.',
    'A company that needs long-term money without giving away ownership borrows it from the public in small units. Each unit is a debenture, and the rate of interest is part of its name.',
    '"9% Debentures of ₹100 each": every debenture is a loan of ₹100 to the company, on which it pays ₹9 a year.',
    'Calling a debentureholder an owner or a member of the company. Debentureholders lend; shareholders own.'),
  card(2, 'deb-meaning', 'rule', 'How do debentures differ from shares?',
    'Debentures are borrowed money, shares are owned capital. Debentures earn interest at a fixed rate, a charge against profit payable even in a year of loss; shares earn dividend, an appropriation of profit. Debentureholders have no vote, are usually secured, and are repaid before shareholders. Debentures can be issued at a discount; shares cannot, except sweat equity shares.',
    'Every difference follows from one fact: a debentureholder is a creditor, a shareholder is an owner.',
    'A company with 9% Debentures of ₹10,00,000 makes a loss this year: it still owes interest of ₹90,000, but it declares no dividend.',
    'Saying that interest is paid "out of profits". Interest is charged before profit is found; dividend is paid out of profit.'),
  card(3, 'deb-meaning', 'rule', 'What are the kinds of debentures?',
    'By security: secured (mortgage) and unsecured (naked). By tenure: redeemable and irredeemable (perpetual). By convertibility: convertible and non-convertible. By record: registered and bearer. By coupon rate: specific coupon rate and zero coupon rate.',
    'Each basis gives a pair of opposites. A zero coupon rate debenture states no interest: it is issued at a deep discount, and the difference between the face value and the issue price stands in place of interest. Irredeemable debentures are kept in the classification, but under the Companies Act, 2013 and its rules debentures have to be redeemed within a fixed period, so a company in India does not issue them today.',
    'Debentures backed by a charge on the factory building are secured; those that can be exchanged for equity shares after three years are convertible.',
    'Mixing up the bases: "bearer" is about transfer by delivery, not about security or repayment.'),
  card(4, 'deb-issue-cash', 'format', 'What are the entries when debentures are issued for cash, the whole amount payable with the application?',
    '1) Bank A/c Dr; To Debenture Application and Allotment A/c (money received). 2) Debenture Application and Allotment A/c Dr; To % Debentures A/c (on allotment).',
    'The money is held in a temporary account until the debentures are allotted. On allotment it becomes a loan, and the debentures account is credited with the nominal value.',
    '2,000, 9% Debentures of ₹100 at par: Bank Dr 2,00,000; To Debenture Application and Allotment 2,00,000. Then Debenture Application and Allotment Dr 2,00,000; To 9% Debentures 2,00,000.',
    'Crediting the debentures account straight away when the money comes in, before allotment.'),
  card(5, 'deb-issue-cash', 'rule', 'How are a premium and a discount on the issue of debentures recorded?',
    'The debentures account is always credited with the nominal value. A premium is credited to Securities Premium A/c. A discount is debited to Discount on Issue of Debentures A/c.',
    'A premium is a capital receipt, kept as a reserve. A discount is a capital loss: the company gets less than the nominal value it must repay.',
    '₹100 debenture issued at ₹110: Debentures 100, Securities Premium 10. Issued at ₹95: Debentures 100, Discount on Issue of Debentures 5 (debit).',
    'Crediting the debentures account with the money received (₹110 or ₹95) instead of the nominal value.'),
  card(6, 'deb-issue-cash', 'format', 'How is the issue recorded when the money is payable on application and on allotment, and the issue is over-subscribed?',
    'Bank Dr; To Debenture Application (all application money). Debenture Application Dr; To % Debentures (on debentures allotted); To Bank (refunded) or To Debenture Allotment (excess kept towards allotment). Debenture Allotment Dr; Discount on Issue Dr (if any); To % Debentures; To Securities Premium (if any). Bank Dr; To Debenture Allotment.',
    'Debenture Application A/c is debited with everything received, so that it closes. Only the application money on the debentures actually allotted goes to the debentures account.',
    '1,000 debentures of ₹100, ₹40 on application, 1,200 applied for, excess refunded: Debenture Application Dr 48,000; To Debentures 40,000; To Bank 8,000.',
    'Crediting the debentures account with the application money on all the debentures applied for.'),
  card(7, 'deb-vendor', 'formula', 'How many debentures are issued to a vendor?',
    'Number of debentures = amount to be settled / issue price of one debenture. Issue price = face value + premium, or face value - discount.',
    'The vendor accepts each debenture at its issue price, so that is the divisor, never the face value. If part of the price is paid by cheque, only the balance is settled by debentures.',
    'Machinery for ₹5,40,000 paid by ₹100 debentures at a premium of 20%: 5,40,000 / 120 = 4,500 debentures (nominal ₹4,50,000, Securities Premium ₹90,000).',
    'Dividing by the face value, or taking the premium as a percentage of the purchase price instead of the nominal value.'),
  card(8, 'deb-vendor', 'format', 'What are the entries when a business is bought and paid for in debentures?',
    '1) Assets Dr (each by name); Goodwill Dr (if any); To Liabilities (each by name); To Vendor (purchase consideration); To Capital Reserve (if any). 2) Vendor Dr; Discount on Issue of Debentures Dr (if any); To % Debentures; To Securities Premium (if any).',
    'Net assets = assets - liabilities taken over. Purchase consideration above net assets is goodwill (a debit); below net assets it is a capital reserve (a credit).',
    'Assets ₹9,00,000, creditors ₹1,00,000, consideration ₹8,50,000: net assets ₹8,00,000, so goodwill is ₹50,000.',
    'Comparing the consideration with the assets alone and forgetting the liabilities taken over.'),
  card(9, 'deb-redemption-terms', 'rule', 'What are the six cases of issue with terms of redemption?',
    'Issued at par, redeemable at par. Issued at a discount, redeemable at par. Issued at a premium, redeemable at par. Issued at par, redeemable at a premium. Issued at a discount, redeemable at a premium. Issued at a premium, redeemable at a premium.',
    'Three issue prices and two redemption prices. A premium on issue is credited to Securities Premium A/c; a discount on issue and a premium payable on redemption are losses, recorded at the time of issue.',
    '₹100 debenture issued at ₹95, redeemable at ₹105: the fifth case. Loss on issue ₹10; Premium on Redemption of Debentures ₹5.',
    'Leaving the terms of redemption out of the entry of issue, or looking for a seventh case: the terms of issue provide for redemption at par or at a premium, never at a discount.'),
  card(10, 'deb-redemption-terms', 'formula', 'How much is the loss on issue of debentures?',
    'Loss on issue = discount allowed on issue + premium payable on redemption.',
    'Both are known on the day of issue, so both are recorded then. A premium received on issue is not set off in the entry: it is credited to Securities Premium A/c in full.',
    '4,000 debentures of ₹100 at a discount of 5%, redeemable at a premium of 10%: 20,000 + 40,000 = ₹60,000.',
    'Counting only the discount, or deducting the premium received on issue from the premium on redemption.'),
  card(11, 'deb-redemption-terms', 'format', 'What is the allotment entry when debentures are redeemable at a premium?',
    'Debenture Application and Allotment A/c Dr (money received); Loss on Issue of Debentures A/c Dr (discount + premium on redemption); To % Debentures A/c (nominal value); To Securities Premium A/c (premium on issue, if any); To Premium on Redemption of Debentures A/c (premium on redemption).',
    'Premium on Redemption of Debentures A/c is a liability: the extra amount the company has bound itself to pay. It stays in the books until the debentures are redeemed. Once a premium is payable on redemption the whole loss, a discount on issue included, goes to Loss on Issue of Debentures A/c; Discount on Issue of Debentures A/c is used only when the debentures are redeemable at par.',
    '1,000 debentures of ₹100 at ₹95, redeemable at ₹105: Dr Application and Allotment 95,000; Dr Loss on Issue 10,000; Cr Debentures 1,00,000; Cr Premium on Redemption 5,000.',
    'Waiting until redemption to record the premium, or debiting it to Securities Premium A/c in the allotment entry (Securities Premium is used later, when the loss is written off).'),
  card(12, 'deb-collateral', 'rule', 'What are debentures issued as collateral security, and how are they recorded?',
    'Debentures given to a lender as an additional security for a loan. Method 1: no entry; a note below the loan states the fact. Method 2: Debenture Suspense A/c Dr; To % Debentures A/c, and Debenture Suspense A/c is deducted from the debentures in the balance sheet.',
    'No money is received for them, and no interest is paid on them: the lender earns interest on the loan. The lender can act on them only if the company defaults; when the loan is repaid they are released.',
    'Loan of ₹10,00,000 from a bank at 10%, with 9% Debentures of ₹12,00,000 as collateral security: the liability is ₹10,00,000 and the yearly interest ₹1,00,000.',
    'Passing Bank Dr; To Debentures for them, or working interest on the collateral debentures.'),
  card(13, 'deb-interest', 'formula', 'How is interest on debentures worked out?',
    'Interest = nominal value x rate x months / 12. It is always on the nominal (face) value, whatever the issue price, and for the months the debentures were outstanding.',
    'Interest is usually payable half-yearly, on 30 September and 31 March. Debentures issued during the year earn interest only from the date of issue.',
    '9% Debentures of ₹8,00,000 issued on 1 October at a discount of 5%: interest to 31 March = 8,00,000 x 9% x 6/12 = ₹36,000.',
    'Working interest on the issue price, or charging a full year on debentures issued part-way through the year.'),
  card(14, 'deb-interest', 'format', 'What are the entries for interest on debentures?',
    'Due: Debenture Interest A/c Dr; To Debentureholders A/c. Paid: Debentureholders A/c Dr; To Bank A/c. At the year end: Statement of Profit and Loss Dr; To Debenture Interest A/c.',
    'Debenture Interest A/c is the expense; Debentureholders A/c is what is owed until the cheques go out. The interest is paid in full: deduction of tax at source is outside the syllabus.',
    'Half-year interest of ₹45,000: Debenture Interest Dr 45,000; To Debentureholders 45,000. Then Debentureholders Dr 45,000; To Bank 45,000.',
    'Crediting the % Debentures A/c with interest due, as if the interest were added to the loan.'),
  card(15, 'deb-write-off', 'rule', 'When and how is the discount or loss on issue of debentures written off?',
    'In the year the debentures are allotted, in full: first from Securities Premium, to the extent it is available, and the balance from the Statement of Profit and Loss (a finance cost).',
    'Entry: Securities Premium A/c Dr; Statement of Profit and Loss Dr; To Discount (or Loss) on Issue of Debentures A/c.',
    'Loss on issue ₹90,000, Securities Premium ₹50,000: Securities Premium Dr 50,000; Statement of Profit and Loss Dr 40,000; To Loss on Issue of Debentures 90,000.',
    'Spreading the amount over the life of the debentures, or charging it all to the Statement of Profit and Loss when Securities Premium has a balance.'),
  card(16, 'deb-write-off', 'shortcut', 'What does the Statement of Profit and Loss bear in the year debentures are issued?',
    'Interest for the months outstanding, plus the loss on issue less the Securities Premium available (never below nil). A premium received on the same issue counts as Securities Premium available.',
    'Work in three steps: interest on the nominal value; loss on issue (discount + premium on redemption); then take Securities Premium away from the loss.',
    '₹10,00,000, 9% debentures issued on 1 April at a discount of 6%, redeemable at a premium of 5%, no Securities Premium: 90,000 + 1,10,000 = ₹2,00,000.',
    'Forgetting that debentures issued at a premium and redeemable at a premium create their own Securities Premium, which bears the loss first.'),
];

// ---------------------------------------------------------------------------------------------------------------
// Authored questions
// ---------------------------------------------------------------------------------------------------------------

const qid = (n: number): string => `deb-q-${String(n).padStart(3, '0')}`;

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

/** The options of an assertion and reason question, with the mistake behind each wrong one. */
const AR = {
  both: 'Both A and R are true, and R is the correct explanation of A',
  bothNot: 'Both A and R are true, but R is not the correct explanation of A',
  aOnly: 'A is true but R is false',
  rOnly: 'A is false but R is true',
};
const BOARD_ORDER = [AR.both, AR.bothNot, AR.aOnly, AR.rOnly];

const num = (
  n: number,
  conceptId: string,
  difficulty: Difficulty,
  prompt: string,
  answer: number,
  errors: [number, string][],
  working: string[],
  hints: string[],
  unit: NumericUnit = 'rupees',
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

const questions: Question[] = [
  // ---- Debentures, their kinds, debentures against shares ----
  mcq(1, 'deb-meaning', 'easy', 'Which statement best describes a debenture?',
    'A document by which a company acknowledges a debt, at a fixed rate of interest',
    [
      ['A share in the ownership of a company', 'Described a share; a debenture is a loan to the company, not a part of its ownership.'],
      ['A receipt for money a company has deposited in a bank', 'Turned it round: with a debenture the company is the borrower, not the lender.'],
      ['A promise by the directors to pay a dividend', 'Confused interest with dividend; a debenture carries interest, and a dividend is never promised.'],
    ],
    'A debenture is evidence of a loan taken by the company: it states the amount, the fixed rate of interest and the terms of repayment.',
    ['Is the holder a lender or an owner?']),
  tf(2, 'deb-meaning', 'easy', 'Debentureholders are owners of the company.', false,
    'Debentureholders are creditors: they have lent money to the company. The owners are the shareholders.',
    ['Who owns a company, those who lend to it or those who hold its shares?']),
  mcq(3, 'deb-meaning', 'easy', 'Interest on debentures is:',
    'A charge against profit, payable whether or not the company earns a profit',
    [
      ['An appropriation of profit, payable only when there is a profit', 'Described a dividend; interest on borrowed money is an expense, not a share of profit.'],
      ['A capital loss, written off in the year of allotment', 'Confused interest with the discount or loss on issue, which is the capital loss.'],
      ['A capital receipt, credited to Securities Premium A/c', 'Confused interest paid with a premium received on issue.'],
    ],
    'Interest is the cost of borrowed money. It is charged before profit is found, so it is payable even in a year of loss.',
    ['Is interest paid before or after the profit is worked out?']),
  mcq(4, 'deb-meaning', 'easy', 'Which of these is NOT true of debentures?',
    'They carry a right to vote at the general meetings of the company',
    [
      ['They carry a fixed rate of interest', 'This is true of debentures: the rate is part of their name, as in "9% Debentures".'],
      ['Their holders are creditors of the company', 'This is true: a debenture is a loan to the company.'],
      ['They are repaid before the share capital if the company is wound up', 'This is true: creditors are paid before the owners.'],
    ],
    'A company cannot issue debentures that carry voting rights. Voting belongs to the shareholders, who own the company.',
    ['Which right belongs only to owners?']),
  tf(5, 'deb-meaning', 'easy', 'A company can issue debentures at a discount.', true,
    'Debentures may be issued at a discount; the discount is a capital loss, debited to Discount on Issue of Debentures A/c. Shares, by contrast, cannot be issued at a discount.',
    ['Compare with the rule for shares.']),
  mcq(6, 'deb-meaning', 'medium', 'Assertion (A): A company must pay interest on its debentures even in a year in which it makes a loss. Reason (R): Interest on debentures is a charge against profit and not an appropriation of profit.',
    AR.both,
    [
      [AR.bothNot, 'Missed the link: it is because interest is a charge, due whatever the result, that it is payable in a year of loss.'],
      [AR.aOnly, 'Denied that interest is a charge against profit; it is an expense, charged before profit is found.'],
      [AR.rOnly, 'Thought interest stops in a year of loss, as a dividend does.'],
    ],
    'A charge is an expense that has to be met whether or not there is a profit. That is exactly why interest is payable in a year of loss.',
    ['What is the difference between a charge and an appropriation?']),
  mcq(7, 'deb-meaning', 'easy', 'Secured and unsecured debentures are kinds of debentures classified by:',
    'The security behind them',
    [
      ['Whether and when they are repaid', 'That basis gives redeemable and irredeemable debentures.'],
      ['Whether they can be turned into shares', 'That basis gives convertible and non-convertible debentures.'],
      ['How their holders are recorded', 'That basis gives registered and bearer debentures.'],
    ],
    'Secured (mortgage) debentures are backed by a charge on the assets of the company; unsecured (naked) debentures are not.',
    ['What does "secured" tell you about?']),
  mcq(8, 'deb-meaning', 'medium', 'Farida has ₹2,00,000 to invest in Narmada Textiles Ltd. Farida wants a fixed return every year, even if the company does badly, and wants to be repaid before the owners if the company is wound up. Farida does not mind having no say in running the company. Which security suits Farida?',
    'Debentures of the company',
    [
      ['Equity shares of the company', 'Equity shares give a vote but no fixed return, and are repaid last.'],
      ['Preference shares of the company', 'A preference dividend is fixed in rate but is paid only out of profit, and preference shareholders rank after creditors.'],
      ['Either equity or preference shares, since both are repaid before debentures', 'Reversed the order of repayment: debentureholders, as creditors, come before every shareholder.'],
    ],
    'Debentures give interest at a fixed rate whether or not there is a profit, rank before shares for repayment, and carry no vote: exactly what Farida asks for.',
    ['Which security is a loan to the company?']),
  mcq(9, 'deb-meaning', 'medium', 'A debenture that states no rate of interest and is issued far below its face value is a:',
    'Zero coupon rate debenture',
    [
      ['Bearer debenture', 'A bearer debenture is one that passes by delivery; it says nothing about the rate of interest.'],
      ['Convertible debenture', 'A convertible debenture can be exchanged for shares; it usually carries a stated rate of interest.'],
      ['Secured debenture', 'A secured debenture has a charge on assets; it says nothing about the rate of interest.'],
    ],
    'With no stated interest, the investor is rewarded by the difference between the low issue price and the face value repaid.',
    ['"Coupon" is the interest.']),

  // ---- Issue for cash ----
  mcq(10, 'deb-issue-cash', 'easy', 'Whatever the issue price, the % Debentures A/c is credited with:',
    'The nominal (face) value of the debentures allotted',
    [
      ['The money actually received on the issue', 'Credited the issue price; a premium or discount goes to its own account.'],
      ['The amount payable on redemption', 'Credited the redemption price; a premium on redemption goes to Premium on Redemption of Debentures A/c.'],
      ['The market value of the debentures', 'Market value is not recorded in the books at all.'],
    ],
    'The debentures account shows the nominal value. Securities Premium, Discount or Loss on Issue and Premium on Redemption carry the differences.',
    ['Which value does the certificate itself state?']),
  tf(11, 'deb-issue-cash', 'easy', 'When debentures are issued at a premium, the premium is credited to Securities Premium A/c.', true,
    'A premium on issue is a capital receipt and is credited to Securities Premium A/c, exactly as for shares.',
    ['Is a premium a gain or a loss to the company?']),
  mcq(12, 'deb-issue-cash', 'medium', 'Discount on Issue of Debentures is:',
    'A capital loss',
    [
      ['A revenue loss of every year the debentures are outstanding', 'Spread it over the years like interest; it arises once, on the issue, and is a capital loss.'],
      ['A capital receipt', 'Read a loss as a receipt; the company receives less than the nominal value.'],
      ['A liability payable on redemption', 'Confused it with the premium on redemption, which is the liability.'],
    ],
    'The company gets less than the nominal value it must repay. This one-time loss on raising the loan is a capital loss.',
    ['Does it arise every year or once?']),
  mcq(13, 'deb-issue-cash', 'medium', 'The whole issue price of debentures is payable in one lump sum with the application. To which account is the money first credited?',
    'Debenture Application and Allotment A/c',
    [
      ['% Debentures A/c', 'Credited the debentures before allotment; until then the money is only application money.'],
      ['Debentureholders A/c', 'That account is for interest due to the debentureholders, not for money received on the issue.'],
      ['Securities Premium A/c', 'Only a premium goes there, and only when the debentures are allotted.'],
    ],
    'Bank A/c Dr; To Debenture Application and Allotment A/c. On allotment that account is debited and the debentures are credited.',
    ['The debentures are not yet allotted when the money comes in.']),
  tf(14, 'deb-issue-cash', 'medium', 'When an issue of debentures is over-subscribed, the excess application money may be refunded or kept towards the amount due on allotment.', true,
    'The company cannot allot more debentures than it offered. Money on the excess applications is refunded, or, where allotment is pro rata, adjusted towards allotment.',
    ['It is treated as excess application money on shares is.']),
  num(15, 'deb-issue-cash', 'easy', 'Konark Cements Ltd. issued 5,000, 9% Debentures of ₹100 each at a premium of 10%, payable in full on application. All were taken up. How much money did the company receive?', 550000,
    [[500000, 'Gave the nominal value and ignored the premium.'], [450000, 'Deducted the premium instead of adding it.'], [50000, 'Gave only the premium.']],
    ['Issue price = ₹100 + ₹10 = ₹110 per debenture.', 'Money received = 5,000 x ₹110 = ₹5,50,000.'], ['Issue price = face value + premium.']),
  jr(16, 'deb-issue-cash', 'medium', 'Himgiri Steels Ltd. issued 3,000, 8% Debentures of ₹100 each at a discount of 4%. The whole amount, ₹2,88,000, was received with the applications and credited to Debenture Application and Allotment A/c. Pass the entry for the allotment of the debentures.',
    [['debentureApplicationAndAllotment', 'Dr', 288000], ['discountOnIssueOfDebentures', 'Dr', 12000], [debentures(8), 'Cr', 300000]],
    ['securitiesPremium', 'lossOnIssueOfDebentures', 'debentureApplication'],
    'The money received, ₹2,88,000, is transferred from Debenture Application and Allotment A/c. The discount, 3,000 x ₹4 = ₹12,000, is a loss and is debited. 8% Debentures A/c is credited with the nominal value, ₹3,00,000.',
    ['The debentures are credited with the nominal value.', 'The discount is a loss: which side?']),

  // ---- Issue for consideration other than cash ----
  mcq(17, 'deb-vendor', 'easy', 'Debentures are said to be issued for consideration other than cash when they are:',
    'Given to a vendor in payment for an asset or a business bought from the vendor',
    [
      ['Given to a bank as an additional security for a loan', 'That is an issue as collateral security, where nothing at all is received for the debentures.'],
      ['Sold to the public at a discount', 'An issue at a discount is still an issue for cash.'],
      ['Paid for by the applicants in two instalments', 'Instalments are still cash; the question is what the company receives, not when.'],
    ],
    'The company receives an asset or a business instead of money, and settles the price by allotting debentures to the vendor.',
    ['What does the company get in return for the debentures?']),
  num(18, 'deb-vendor', 'medium', 'Deccan Tools Ltd. bought machinery for ₹4,95,000 from Sharma Traders and paid for it by issuing 9% Debentures of ₹100 each at a premium of 10%. How many debentures were issued?', 4500,
    [[4950, 'Divided by the face value; the vendor takes each debenture at its issue price of ₹110.'], [5500, 'Deducted the premium from the face value and divided by ₹90.']],
    ['Issue price = ₹100 + ₹10 = ₹110.', 'Number of debentures = ₹4,95,000 / ₹110 = 4,500.'], ['Divide by the issue price, not the face value.'], 'number'),
  mcq(19, 'deb-vendor', 'medium', 'A company takes over assets of ₹12,00,000 and liabilities of ₹2,00,000 and pays a purchase consideration of ₹11,00,000 in debentures. The difference of ₹1,00,000 is:',
    'Goodwill, debited to Goodwill A/c',
    [
      ['A capital reserve, credited to Capital Reserve A/c', 'Named it the wrong way round: the company paid more than the net assets of ₹10,00,000.'],
      ['A discount on issue of debentures', 'Confused the excess price paid for the business with a discount on the debentures themselves.'],
      ['A loss charged to the Statement of Profit and Loss', 'Treated the price of goodwill as an expense; it is an asset bought.'],
    ],
    'Net assets = 12,00,000 - 2,00,000 = ₹10,00,000. Paying ₹11,00,000 for them means ₹1,00,000 is paid for goodwill.',
    ['First find the net assets taken over.']),
  tf(20, 'deb-vendor', 'medium', 'When the purchase consideration is less than the net assets taken over, the difference is credited to Capital Reserve A/c.', true,
    'Buying net assets for less than they are worth is a capital profit, credited to Capital Reserve A/c.',
    ['Is paying less than the net assets a gain or a loss?']),
  jr(21, 'deb-vendor', 'medium', 'Godavari Foods Ltd. owes Mehta Traders ₹3,80,000 for a building bought from them. It settles the amount by issuing 9% Debentures of ₹100 each at a discount of 5%. Pass the entry for the issue of the debentures.',
    [[vendor('Mehta Traders'), 'Dr', 380000], ['discountOnIssueOfDebentures', 'Dr', 20000], [debentures(9), 'Cr', 400000]],
    ['building', 'securitiesPremium', 'debentureApplicationAndAllotment'],
    'Issue price = ₹95, so 3,80,000 / 95 = 4,000 debentures of nominal value ₹4,00,000. Mehta Traders is debited with ₹3,80,000, the discount of ₹20,000 is debited to Discount on Issue of Debentures A/c, and 9% Debentures A/c is credited with ₹4,00,000.',
    ['Number of debentures = amount / issue price.', 'The debentures are credited with the nominal value.']),

  // ---- Issue with terms of redemption ----
  mcq(22, 'deb-redemption-terms', 'easy', 'Debentures are issued today and are redeemable at a premium after six years. When is the premium on redemption first recorded in the books?',
    'At the time of issue',
    [
      ['Only when the debentures are redeemed', 'Waited for the payment; the premium is a loss and a liability known from the day of issue.'],
      ['At the end of each year, in equal parts', 'Spread it over the years; the whole premium is provided for at the time of issue.'],
      ['It is never recorded; it is only disclosed by a note', 'Treated it like collateral debentures; a premium on redemption is a real liability and is recorded.'],
    ],
    'Loss on Issue of Debentures A/c is debited and Premium on Redemption of Debentures A/c is credited in the entry for the allotment itself.',
    ['Is the premium known on the day of issue?']),
  mcq(23, 'deb-redemption-terms', 'easy', 'Debentures are issued at par and are redeemable at par. Which accounts appear in the entry for their allotment, the money having been received in a lump sum?',
    'Debenture Application and Allotment A/c and % Debentures A/c only',
    [
      ['Those two and Loss on Issue of Debentures A/c', 'Found a loss where there is none: nothing is given up on issue and nothing extra is payable on redemption.'],
      ['Those two and Securities Premium A/c', 'Found a premium on issue; the debentures are issued at par.'],
      ['Those two and Premium on Redemption of Debentures A/c', 'Found a premium on redemption; the debentures are redeemable at par.'],
    ],
    'At par both ways, the money received equals the nominal value: Debenture Application and Allotment A/c Dr; To % Debentures A/c.',
    ['Is there any difference between what is received, the nominal value and what is repaid?']),
  tf(24, 'deb-redemption-terms', 'medium', 'When debentures are issued at a premium and are redeemable at a premium, the premium received on issue is deducted from the premium on redemption in the entry, and only the difference is recorded.', false,
    'Each is recorded in full: Securities Premium A/c is credited with the premium on issue, and Loss on Issue of Debentures A/c is debited (Premium on Redemption of Debentures A/c credited) with the whole premium on redemption.',
    ['Are the two premiums recorded in the same account?']),
  num(25, 'deb-redemption-terms', 'medium', 'Aravali Motors Ltd. issued 2,000, 10% Debentures of ₹100 each at a discount of 5%, redeemable at a premium of 10% after five years. The company records the whole loss on the issue in Loss on Issue of Debentures A/c. What amount is debited to that account at the time of issue?', 30000,
    [[10000, 'Counted only the discount; the premium payable on redemption is also a loss on the issue.'], [20000, 'Counted only the premium on redemption; the discount on issue is also a loss.']],
    ['Discount on issue = 2,000 x ₹5 = ₹10,000.', 'Premium on redemption = 2,000 x ₹10 = ₹20,000.', 'Loss on issue = ₹10,000 + ₹20,000 = ₹30,000.'], ['Loss on issue = discount + premium on redemption.']),
  mcq(26, 'deb-redemption-terms', 'medium', 'Assertion (A): A premium payable on the redemption of debentures is debited to Loss on Issue of Debentures A/c at the time of issue. Reason (R): The premium is a loss that the company knows of, and has bound itself to bear, from the day the debentures are issued.',
    AR.both,
    [
      [AR.bothNot, 'Missed the link: it is because the loss is known and certain from the day of issue that it is recorded then.'],
      [AR.aOnly, 'Denied that the premium is certain from the start; it is fixed by the terms of issue.'],
      [AR.rOnly, 'Thought the premium is recorded only on redemption.'],
    ],
    'A loss that is known is provided for at once (prudence). The terms of issue fix the premium on redemption, so it is recorded at the time of issue.',
    ['Which accounting concept asks for known losses to be recorded at once?']),
  jr(27, 'deb-redemption-terms', 'medium', 'Sagar Mills Ltd. issued 1,000, 9% Debentures of ₹100 each at par, redeemable at a premium of 10%. The whole amount, ₹1,00,000, was received with the applications and credited to Debenture Application and Allotment A/c. Pass the entry for the allotment, providing for the premium payable on redemption.',
    [['debentureApplicationAndAllotment', 'Dr', 100000], ['lossOnIssueOfDebentures', 'Dr', 10000], [debentures(9), 'Cr', 100000], ['premiumOnRedemptionOfDebentures', 'Cr', 10000]],
    ['securitiesPremium', 'discountOnIssueOfDebentures', 'debentureholders'],
    'The money received is transferred and 9% Debentures A/c is credited with ₹1,00,000. The premium payable on redemption, 1,000 x ₹10 = ₹10,000, is a loss (Loss on Issue of Debentures A/c debited) and a liability (Premium on Redemption of Debentures A/c credited).',
    ['The premium on redemption appears twice: once as a loss, once as a liability.']),
  mcq(28, 'deb-redemption-terms', 'medium', 'Premium on Redemption of Debentures A/c has a credit balance. Until the debentures are redeemed, this balance is:',
    'A liability of the company',
    [
      ['A reserve available to the shareholders', 'Confused it with Securities Premium; this premium is owed to the debentureholders.'],
      ['A capital loss waiting to be written off', 'Confused it with Loss on Issue of Debentures A/c, which is the debit balance.'],
      ['An income of the year of issue', 'Read a credit balance as income; it is an amount the company will have to pay.'],
    ],
    'It is the extra amount the company has bound itself to pay over the nominal value, so it is a liability from the day of issue.',
    ['Who will receive this amount in the end?']),

  // ---- Collateral security ----
  mcq(29, 'deb-collateral', 'easy', 'Debentures issued as collateral security are debentures issued:',
    'As an additional security for a loan, over and above the primary security',
    [
      ['To the public for cash at a discount', 'That is an ordinary issue for cash; nothing is received for collateral debentures.'],
      ['To a vendor in payment for an asset', 'That is an issue for consideration other than cash.'],
      ['To the shareholders in place of a dividend', 'Debentures are not a way of sharing profit.'],
    ],
    'The lender holds them as a second security and can fall back on them only if the company defaults on the loan.',
    ['"Collateral" means standing by the side of something else.']),
  tf(30, 'deb-collateral', 'easy', 'Interest is paid on debentures issued as collateral security in the same way as on other debentures.', false,
    'No interest is paid on them. The lender earns interest on the loan; the debentures are only a security.',
    ['On what has the lender actually advanced money?']),
  mcq(31, 'deb-collateral', 'medium', 'A company records debentures issued as collateral security in its books (the second method). How do they appear in its balance sheet?',
    'The debentures are shown, and Debenture Suspense A/c is deducted from them, so that no extra liability appears',
    [
      ['The debentures are added to the loan as a second liability', 'Counted the security as a debt; the company owes only the loan.'],
      ['Debenture Suspense A/c is shown as an asset', 'Left the suspense account on the assets side; it is set off against the debentures.'],
      ['Nothing is shown and no note is given', 'That fits neither method: the first method needs a note, the second shows the debentures and the suspense account.'],
    ],
    'Entry: Debenture Suspense A/c Dr; To % Debentures A/c. In the balance sheet one is deducted from the other, so the liability stays at the amount of the loan.',
    ['The entry debits a suspense account. Where must it go so that the liability is not overstated?']),
  mcq(32, 'deb-collateral', 'medium', 'Vindhya Chemicals Ltd. took a loan of ₹8,00,000 from its bank and gave 10% Debentures of ₹10,00,000 as collateral security, without passing any entry for them. It has now repaid the loan in full. What happens to the debentures?',
    'The bank releases them and they are cancelled; no entry is needed for them',
    [
      ['The bank keeps them and collects ₹10,00,000 when they fall due', 'Treated collateral debentures as ordinary ones; the bank has no claim once the loan is repaid.'],
      ['The company pays the bank the extra ₹2,00,000 as well', 'Read the margin as an amount owed; the company owed only the loan.'],
      ['The company pays interest at 10% on them for the period of the loan', 'Worked interest on collateral debentures; interest was payable on the loan only.'],
    ],
    'The debentures were only a security. With the loan repaid, the security is released, and since no entry was passed for them none is needed now.',
    ['Did the bank ever pay anything for the debentures?']),

  // ---- Interest ----
  mcq(33, 'deb-interest', 'easy', 'Interest on debentures is calculated on:',
    'Their nominal (face) value',
    [
      ['Their issue price', 'Used the money received; the rate is promised on the face value.'],
      ['The amount payable on redemption', 'Used the redemption price; interest is on the nominal value.'],
      ['Their market price on the date of payment', 'Used the market price, which the books do not record.'],
    ],
    'The stated rate applies to the nominal value, whether the debentures were issued at par, at a premium or at a discount.',
    ['"9% Debentures of ₹100": 9% of what?']),
  tf(34, 'deb-interest', 'easy', 'At the end of the year Debenture Interest A/c is closed by transfer to the Statement of Profit and Loss.', true,
    'Interest is an expense of the year: Statement of Profit and Loss Dr; To Debenture Interest A/c.',
    ['Is interest an expense or an asset?']),
  num(35, 'deb-interest', 'medium', 'On 1 October 2025, Kaveri Paper Mills Ltd. issued 8% Debentures of ₹6,00,000 at a discount of 5%. Its accounting year ends on 31 March. What is the interest on these debentures for the year ended 31 March 2026?', 24000,
    [[48000, 'Charged a full year although the debentures were outstanding for six months.'], [22800, 'Worked the interest on the issue price of ₹5,70,000; interest is on the nominal value.']],
    ['From 1 October to 31 March is 6 months.', 'Interest = ₹6,00,000 x 8% x 6/12 = ₹24,000.'], ['Count the months from the date of issue to the year end.', 'Interest is on the nominal value.']),
  jr(36, 'deb-interest', 'easy', 'Half-year interest of ₹45,000 on the 9% Debentures of Nilgiri Tea Estates Ltd. becomes due on 30 September. Pass the entry for the interest becoming due.',
    [['debentureInterest', 'Dr', 45000], ['debentureholders', 'Cr', 45000]],
    [debentures(9), 'statementOfProfitAndLoss', 'interestPaid'],
    'Interest is an expense, so Debenture Interest A/c is debited. Until it is paid it is owed to the debentureholders, so Debentureholders A/c is credited.',
    ['Debit the expense; credit those to whom it is owed.']),
  mcq(37, 'deb-interest', 'medium', 'Sunita holds 500, 9% Debentures of ₹100 each in a company, bought when they were issued at ₹95. Interest is paid half-yearly. How much does Sunita receive on each interest date?',
    '₹2,250',
    [
      ['₹4,500', 'Gave the interest of a whole year; half of it is paid on each date.'],
      ['₹2,137.50', 'Worked the interest on the issue price of ₹47,500; interest is on the nominal value of ₹50,000.'],
      ['₹1,125', 'Took a quarter of the yearly interest; a half-year is six months.'],
    ],
    'Nominal value = 500 x ₹100 = ₹50,000. Interest for a year = 9% = ₹4,500, so each half-year brings ₹2,250.',
    ['Start from the nominal value of the holding.']),

  // ---- Writing off discount or loss on issue ----
  mcq(38, 'deb-write-off', 'easy', 'Discount or loss on issue of debentures is written off:',
    'In full, in the year in which the debentures are allotted',
    [
      ['In equal parts over the life of the debentures', 'Spread it over the life; it is written off in the year of allotment.'],
      ['In the year in which the debentures are redeemed', 'Waited until redemption; the loss is not carried forward.'],
      ['Never: it stays in the balance sheet as an asset', 'Kept a loss as a permanent asset.'],
    ],
    'The whole amount is written off in the year of allotment, first from Securities Premium and then from the Statement of Profit and Loss.',
    ['Is the loss carried forward to later years?']),
  mcq(39, 'deb-write-off', 'easy', 'Which is used first to write off a discount or loss on issue of debentures?',
    'Securities Premium, to the extent it is available',
    [
      ['The Statement of Profit and Loss', 'That bears only the balance left after Securities Premium has been used.'],
      ['General Reserve', 'Named a reserve the rule does not use.'],
      ['Premium on Redemption of Debentures A/c', 'That account is a liability to the debentureholders, not a reserve to write losses off against.'],
    ],
    'Securities Premium A/c Dr first; only what it cannot bear is debited to the Statement of Profit and Loss.',
    ['Which reserve may be used for losses on the issue of securities?']),
  tf(40, 'deb-write-off', 'medium', 'If there is no Securities Premium, the loss on issue of debentures is carried forward and written off over the years until the debentures are redeemed.', false,
    'It is still written off in the year of allotment: the whole of it is then charged to the Statement of Profit and Loss.',
    ['Does the year of write-off depend on Securities Premium?']),
  num(41, 'deb-write-off', 'medium', 'Loss on Issue of Debentures A/c of Godavari Foods Ltd. shows ₹90,000 for debentures allotted this year, and Securities Premium A/c has a balance of ₹50,000. How much is charged to the Statement of Profit and Loss when the loss is written off?', 40000,
    [[90000, 'Charged the whole loss to the Statement of Profit and Loss; Securities Premium is used first.'], [50000, 'Gave the part borne by Securities Premium.']],
    ['Securities Premium bears ₹50,000.', 'Charged to the Statement of Profit and Loss = ₹90,000 - ₹50,000 = ₹40,000.'], ['Use Securities Premium first.']),
  mcq(42, 'deb-write-off', 'medium', 'Assertion (A): The part of the discount on issue of debentures written off through the Statement of Profit and Loss is shown as a finance cost. Reason (R): The discount is part of the cost of borrowing the money.',
    AR.both,
    [
      [AR.bothNot, 'Missed the link: it is a finance cost precisely because it is a cost of borrowing.'],
      [AR.aOnly, 'Denied that the discount is a cost of borrowing; issuing below face value is the price of getting the loan.'],
      [AR.rOnly, 'Thought the discount is shown with the other expenses or as an employee or operating cost.'],
    ],
    'Finance costs are the costs of borrowed funds: interest, and the discount or loss on the issue of debentures that is charged to the Statement.',
    ['What kind of cost is interest? The discount belongs with it.']),
  mcq(43, 'deb-write-off', 'complex', 'On 1 April 2025, Deccan Tools Ltd. issued 9% Debentures of ₹10,00,000 at a discount of 6%, redeemable at a premium of 5%. It has no Securities Premium. Interest is paid half-yearly. What total amount is debited to its Statement of Profit and Loss for the year ended 31 March 2026 on account of these debentures?',
    '₹2,00,000',
    [
      ['₹90,000', 'Charged only the interest and left the loss on issue in the balance sheet.'],
      ['₹1,50,000', 'Counted only the discount of ₹60,000 as the loss on issue; the premium on redemption of ₹50,000 is part of it.'],
      ['₹1,10,000', 'Gave the loss on issue and left out the interest of the year.'],
    ],
    'Interest = 9% of ₹10,00,000 = ₹90,000. Loss on issue = 60,000 + 50,000 = ₹1,10,000, all charged to the Statement as there is no Securities Premium. Total = ₹2,00,000.',
    ['Two things: interest, and the loss on issue written off.']),
  mcq(44, 'deb-write-off', 'complex', 'Himgiri Steels Ltd. issued 10,000, 8% Debentures of ₹100 each at a premium of 4%, redeemable at a premium of 10%. Securities Premium A/c had no balance before this issue. How is the loss on issue written off at the end of the year?',
    '₹40,000 from Securities Premium and ₹60,000 from the Statement of Profit and Loss',
    [
      ['₹1,00,000 from the Statement of Profit and Loss', 'Forgot that the premium received on this very issue is in Securities Premium A/c and is used first.'],
      ['₹60,000 from the Statement of Profit and Loss, the rest being ignored', 'Netted the two premiums in the entry; the loss of ₹1,00,000 is recorded in full, and ₹40,000 of it is written off against Securities Premium.'],
      ['₹1,00,000 from Securities Premium', 'Took more from Securities Premium than it holds; only ₹40,000 is there.'],
    ],
    'Loss on issue = 10,000 x ₹10 = ₹1,00,000. Securities Premium from the issue = 10,000 x ₹4 = ₹40,000, used first; the remaining ₹60,000 goes to the Statement of Profit and Loss.',
    ['What did the premium on issue create?']),
];

// ---------------------------------------------------------------------------------------------------------------
// Levels
// ---------------------------------------------------------------------------------------------------------------

const levels = buildLadder(T, {
  concept: {
    title: 'How a Company Borrows from the Public',
    description: 'See what a debenture is, the three prices every question turns on, and why a loss on the issue is recorded on day one.',
    lesson: [
      {
        type: 'text',
        heading: 'A loan cut into small pieces',
        body: 'A company needs ₹10,00,000 for a new plant and does not want new owners. So it borrows: it offers the public 10,000 pieces of the loan of ₹100 each and promises 9% interest a year. Each piece is a debenture, and they are called "9% Debentures". Whoever buys one is a creditor of the company, not an owner: there is no vote, but the interest of ₹9 a year is due whether the company makes a profit or a loss, and the lender is repaid before any shareholder.',
      },
      {
        type: 'text',
        heading: 'Three prices, one fixed point',
        body: 'Every debenture has a face (nominal) value, say ₹100. It may be issued at ₹100 (at par), above it (at a premium) or below it (at a discount), and it may be redeemable at ₹100 or above it. The fixed point is this: the debentures account always shows the face value. Extra money received on issue goes to Securities Premium A/c. Money short on issue is a loss, Discount on Issue of Debentures. Interest, too, is always on the face value.',
      },
      {
        type: 'text',
        heading: 'A promise to repay more is a loss today',
        body: 'Suppose a ₹100 debenture is issued at ₹95 and the company promises to repay ₹105. The company receives ₹95 and will part with ₹105: a loss of ₹10 that is certain from the first day. So it is recorded on the first day. Loss on Issue of Debentures A/c is debited with ₹10 (discount ₹5 + premium on redemption ₹5), and the ₹5 still to be paid over the face value is shown as a liability, Premium on Redemption of Debentures A/c. The discount is not kept apart here: Discount on Issue of Debentures A/c is for debentures redeemable at par, and once a premium is payable on redemption the whole loss sits in the one account. Only the issue is in your syllabus; the entries of redemption itself are not.',
      },
      {
        type: 'example',
        title: '1,000, 9% Debentures of ₹100 allotted at ₹95, redeemable at ₹105 (money received with the applications)',
        lines: [
          { accountId: 'debentureApplicationAndAllotment', side: 'Dr', amount: 9500000 },
          { accountId: 'lossOnIssueOfDebentures', side: 'Dr', amount: 1000000 },
          { accountId: debentures(9), side: 'Cr', amount: 10000000 },
          { accountId: 'premiumOnRedemptionOfDebentures', side: 'Cr', amount: 500000 },
        ],
        note: 'Money received: 1,000 x ₹95 = ₹95,000. Debentures at face value: ₹1,00,000. Premium payable on redemption: 1,000 x ₹5 = ₹5,000, a liability. Loss on issue: discount ₹5,000 + premium on redemption ₹5,000 = ₹10,000.',
      },
      {
        type: 'text',
        heading: 'Clearing the loss, and paying the interest',
        body: 'The loss on issue is not carried forward. In the year the debentures are allotted it is written off in full: first from Securities Premium, as far as that goes, and the rest from the Statement of Profit and Loss. Interest is separate: 9% of the face value for the months the debentures were outstanding, usually paid half-yearly on 30 September and 31 March. It is debited to Debenture Interest A/c when due, paid to the debentureholders, and transferred to the Statement of Profit and Loss at the year end.',
      },
      {
        type: 'working',
        title: 'Konark Cements Ltd., Bhubaneswar: 2,000, 10% Debentures of ₹100 allotted on 1 July 2025 at ₹96, redeemable at ₹105',
        lines: [
          'Discount on issue = 2,000 x ₹4 = ₹8,000. Premium payable on redemption = 2,000 x ₹5 = ₹10,000.',
          'Loss on issue = ₹8,000 + ₹10,000 = ₹18,000, written off in full in the year of allotment.',
          'Securities Premium A/c has a balance of ₹10,000: it bears ₹10,000; the Statement of Profit and Loss bears the other ₹8,000 as a finance cost.',
          'Interest is on the nominal value of ₹2,00,000: 30 September 2025, for 3 months, ₹2,00,000 x 10% x 3/12 = ₹5,000; 31 March 2026, for 6 months, ₹10,000. The year bears ₹15,000.',
        ],
        note: 'Watch out: interest runs from the date of allotment and on ₹100, the nominal value, never on the ₹96 received.',
      },
      {
        type: 'example',
        title: "Konark Cements: the loss on issue written off on 31 March 2026",
        lines: [
          { accountId: 'securitiesPremium', side: 'Dr', amount: 1000000 },
          { accountId: 'statementOfProfitAndLoss', side: 'Dr', amount: 800000 },
          { accountId: 'lossOnIssueOfDebentures', side: 'Cr', amount: 1800000 },
        ],
        note: 'Securities Premium is used first, as far as it goes; only the rest is charged to the Statement of Profit and Loss. Nothing is carried forward to the next year.',
      },
      {
        type: 'working',
        title: 'Interest that falls due after the year end: interest dates of 30 June and 31 December',
        lines: [
          'Godavari Foods Ltd. has 9% Debentures of ₹4,00,000; interest is paid on 30 June and 31 December.',
          'The interest of 31 December 2025 has been paid. From 1 January to 31 March 2026 is 3 months: ₹4,00,000 x 9% x 3/12 = ₹9,000.',
          'It is owed but due only on 30 June: Debenture Interest A/c is debited and it is shown as interest accrued but not due, under Other current liabilities.',
        ],
        note: 'Watch out: the Statement of Profit and Loss still bears a full year of interest, ₹36,000, though only ₹27,000 of it has been paid or fallen due.',
      },
      {
        type: 'example',
        title: 'Himgiri Steels Ltd. takes a bank loan of ₹5,00,000 and gives 9% Debentures of ₹6,00,000 as collateral security (second method)',
        lines: [
          { accountId: 'debentureSuspense', side: 'Dr', amount: 60000000 },
          { accountId: debentures(9), side: 'Cr', amount: 60000000 },
        ],
        note: 'No money comes in for these debentures. Under the first method no entry is passed and the loan is shown "secured by" them; under this second method Debenture Suspense A/c is deducted from the debentures in the balance sheet, so the debt shown stays the loan of ₹5,00,000. No interest is paid on collateral debentures; when the loan is repaid the entry is reversed.',
      },
      { type: 'check', questionId: qid(10) },
      { type: 'check', questionId: qid(25) },
    ],
  },
  cards: {
    title: 'Debenture Rules, Entries and Formulas',
    description: 'Recall the entries of issue, the six cases, the vendor formula, interest and the write-off rule.',
    cardIds: cards.map((c) => c.id),
  },
  recognition: [
    {
      title: 'Debentures, Shares and the Issue for Cash',
      description: 'Recognise what a debenture is, how it differs from a share, its kinds, and where a premium or a discount on issue goes.',
      questionIds: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16].map(qid),
    },
    {
      title: 'Vendors, Terms of Redemption and Collateral Security',
      description: 'Choose the treatment when debentures go to a vendor, when a premium is payable on redemption, and when debentures only secure a loan.',
      questionIds: [17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30, 31, 32].map(qid),
    },
    {
      title: 'Interest and the Write-off',
      description: 'Interest on the nominal value, its entries, and how the discount or loss on issue is written off.',
      questionIds: [33, 34, 35, 36, 37, 38, 39, 40, 41, 42, 43, 44].map(qid),
    },
  ],
  practice: [
    {
      title: 'Issue for Cash and Interest: First Steps',
      description: 'Kinds of debentures, debentures against shares, money received on an issue, and the entries for interest.',
      templateIds: ['deb-kind-name', 'deb-vs-share', 'deb-issue-kind', 'deb-issue-proceeds', 'deb-journal-lump-step', 'deb-interest-year', 'deb-journal-interest-step', 'deb-interest-entry-form'],
      count: 8,
    },
    {
      title: 'Redemption Terms, Vendors, Collateral and Write-off: First Steps',
      description: 'A premium payable on redemption, the nature of each account, debentures to a vendor at a stated price, collateral security and the order of write-off.',
      templateIds: ['deb-loss-on-issue-par', 'deb-account-nature', 'deb-case-entry-form', 'deb-vendor-number', 'deb-collateral-treatment', 'deb-collateral-interest', 'deb-write-off-order'],
      count: 8,
    },
    {
      title: 'Loss on Issue, Case by Case (Guided)',
      description: 'Work out the discount, the premium on redemption and the loss on issue, one figure at a time.',
      templateIds: ['deb-loss-on-issue', 'deb-case-amount'],
      count: 6,
      guided: true,
    },
    {
      title: 'Instalments and Over-subscription',
      description: 'Money due on application and allotment, excess applications refunded or adjusted, and the entries on allotment.',
      templateIds: ['deb-nominal-to-raise', 'deb-instalment-amount', 'deb-oversubscription', 'deb-journal-application-transfer', 'deb-journal-allotment-due', 'deb-journal-lump-allot'],
      count: 8,
    },
    {
      title: 'Debentures to a Vendor',
      description: 'The number of debentures at a premium or a discount, goodwill or capital reserve on a takeover, and the two entries.',
      templateIds: ['deb-vendor-number-pct', 'deb-vendor-goodwill', 'deb-vendor-result', 'deb-journal-vendor-issue', 'deb-journal-business-purchase'],
      count: 8,
    },
    {
      title: 'Entries with a Premium on Redemption, Part-year Interest and the Write-off',
      description: 'The allotment entry in the cases with a premium on redemption, interest from the date of issue, and writing off the discount or loss.',
      templateIds: ['deb-journal-six-cases', 'deb-interest-part-year', 'deb-journal-interest-part-year', 'deb-write-off-split', 'deb-journal-write-off'],
      count: 8,
    },
    {
      title: 'Complex Debenture Problems',
      description: 'An issue with terms of redemption, a year of interest and the write-off in one question; working back to a rate; takeovers paid for in debentures.',
      templateIds: [
        'deb-complex-pl-charge', 'deb-complex-own-premium', 'deb-complex-vendor-premium', 'deb-journal-instalment-terms',
        'deb-complex-interest-two-issues', 'deb-journal-complex-write-off', 'deb-journal-complex-purchase', 'deb-complex-redemption-rate',
      ],
      count: 8,
    },
  ],
  mixed: { title: 'Mixed Debentures Practice', description: 'Everything in this topic, shuffled the way an examination serves it.', count: 12 },
  challenge: { title: 'Challenge: Debentures Mastery', description: 'The hardest questions in the topic, against the clock.', count: 8 },
  // Sets of entries: one company and one issue from the first rupee received to the last entry of the year.
  sets: [
    {
      title: 'Journalise an Issue of Debentures',
      description: 'Three to five entries for one issue: the money received, the allotment in each of the six cases, the refund of excess money and the write-off of the discount or loss.',
      templateIds: ['deb-set-issue-cash', 'deb-set-six-cases'],
      count: 3,
    },
    {
      title: 'Journalise Interest and Collateral Security',
      description: 'Four or five entries: the half-yearly interest of a year with its transfer to the Statement of Profit and Loss, and debentures given to a bank as collateral security, recorded through Debenture Suspense A/c and cancelled when the loan is repaid.',
      templateIds: ['deb-set-interest-year', 'deb-set-collateral'],
      count: 2,
    },
    {
      title: 'Journalise a Purchase Paid for in Debentures',
      description: 'Six to eight entries for one year: a business or assets bought from a vendor, the debentures issued in payment, the interest from the day of issue, and the write-off of the discount or loss.',
      templateIds: ['deb-set-vendor'],
      count: 2,
    },
  ],
  // Accounts and a statement the student prepares, each written up from the entries of the year (or two years) of issue.
  formats: [
    {
      title: 'Prepare the Ledger Accounts of an Issue',
      description: 'The debentures account of a year of issue, balanced and brought down; the account of the discount or loss on issue, closed by the write-off; and Debenture Interest A/c over two years, closed to the Statement of Profit and Loss at the end of each.',
      templateIds: ['deb-fmt-debentures-account', 'deb-fmt-loss-account', 'deb-fmt-interest-account'],
      count: 2,
    },
    {
      title: 'Show the Debentures in the Balance Sheet',
      description: 'The balance sheet extract of the year of issue with its notes to accounts: long-term borrowings, what is left of Securities Premium, a premium payable on redemption, and the finance costs in the Statement of Profit and Loss.',
      templateIds: ['deb-fmt-balance-sheet'],
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
        name: 'accrued-interest',
        type: 'medium_practice',
        title: 'Interest at the Year End and Where It Is Shown',
        description: 'Interest that falls due after 31 March, interest due and unpaid, debentures repayable within twelve months, and the interest of a part year.',
        generate: { templateIds: ['deb-where-shown', 'deb-interest-accrued', 'deb-interest-part-year', 'deb-collateral-interest'], count: 6 },
      },
      {
        name: 'assertion-reason',
        type: 'medium_practice',
        title: 'Assertion and Reason',
        description: 'The one-mark question of the board: judge the Assertion, judge the Reason, and say whether the Reason explains the Assertion.',
        generate: { templateIds: ['deb-assertion-reason'], count: 6 },
      },
    ]),
  ],
  questions,
};

export default pack;
