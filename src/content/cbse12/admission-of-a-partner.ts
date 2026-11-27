import { partnerCapital, partnerCurrent } from '@/engine/accounts';
import type { JournalLine } from '@/engine/journal';
import { buildLadder, laterLevels } from '../ladder';
import type { Card, Concept, Difficulty, JournalQuestion, McqQuestion, NumericQuestion, Question, RatioQuestion, TopicPack, TrueFalseQuestion } from '../types';

const T = 'admission-of-a-partner';

const concepts: Concept[] = [
  { id: 'adm-new-ratio', topicId: T, title: 'New profit-sharing ratio' },
  { id: 'adm-sacrifice', topicId: T, title: 'Sacrificing ratio' },
  { id: 'adm-premium', topicId: T, title: 'Premium for goodwill brought in cash' },
  { id: 'adm-goodwill-adjust', topicId: T, title: 'Goodwill not brought in, partly brought in, or already in the books' },
  { id: 'adm-hidden-goodwill', topicId: T, title: 'Hidden goodwill' },
  { id: 'adm-revaluation', topicId: T, title: 'Revaluation of assets and reassessment of liabilities' },
  { id: 'adm-reserves', topicId: T, title: 'Reserves and accumulated profits and losses' },
  { id: 'adm-capitals', topicId: T, title: 'Adjustment of capitals' },
  { id: 'adm-new-firm', topicId: T, title: 'Capitals and balance sheet of the new firm' },
  { id: 'adm-sets', topicId: T, title: 'Passing the entries on an admission' },
  { id: 'adm-formats', topicId: T, title: 'Preparing the Revaluation Account, the capital accounts and the balance sheet' },
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
): Card => ({ id: `adm-card-${n}`, topicId: T, conceptId, kind, prompt, answer, explanation, example, commonMistake });

const cards: Card[] = [
  card(1, 'adm-new-ratio', 'rule', 'What has to be settled when a new partner is admitted?',
    'The new profit-sharing ratio and the sacrificing ratio; goodwill; revaluation of assets and reassessment of liabilities; reserves and accumulated profits and losses; and the capitals of the partners.',
    'The new partner gets a share of future profits and of the assets of the firm. Everything earned or lost before the admission is first settled among the old partners, and the old partners are paid for the share they give up.',
    'Asha and Bhavna admit Chetan for 1/5 share: they fix the new ratio, share the reserve and the revaluation profit between themselves, take the premium Chetan brings, and then fix the capitals.',
    'Giving the new partner a part of the old reserves or of the revaluation profit.'),
  card(2, 'adm-new-ratio', 'formula', "How is the new ratio found when the old partners keep their old ratio (or nothing is said about how the share is acquired)?",
    "Share left = 1 - new partner's share. Each old partner's new share = share left x old share.",
    'When the question is silent, the old partners are taken to give up the share in their old ratio, which leaves their ratio between themselves unchanged.',
    'Asha and Bhavna share 3:2; Chetan gets 1/5. Left: 4/5. Asha 4/5 x 3/5 = 12/25, Bhavna 4/5 x 2/5 = 8/25, Chetan 5/25. New ratio 12:8:5.',
    'Writing 3:2:1: keeping the old shares as they are and adding the new share on top.'),
  card(3, 'adm-new-ratio', 'formula', 'How is the new ratio found when the share is taken equally, in a stated ratio, or wholly from one partner?',
    'New share of an old partner = old share - the part of the new share that partner gives up. Equally: half each (for two partners). In a ratio x:y: x/(x+y) and y/(x+y) of the new share. From one partner: the whole of it.',
    'Work in fractions of the whole profit, bring the three shares to a common denominator, and check that they add up to 1.',
    '3:2, Chetan gets 1/5 equally: Asha 3/5 - 1/10 = 5/10, Bhavna 2/5 - 1/10 = 3/10, Chetan 2/10. New ratio 5:3:2.',
    'Dividing what is left equally between the old partners. It is the share given up that is equal, not what they keep.'),
  card(4, 'adm-new-ratio', 'formula', "How is the new ratio found when each old partner surrenders a fraction of that partner's own share?",
    "Sacrifice = old share x fraction surrendered. New share = old share - sacrifice. The new partner's share = total of the sacrifices.",
    "'1/4 of Asha's share' is a fraction of that partner's share, not of the whole profit, so it is multiplied by the share.",
    "3:2; Asha surrenders 1/4 of Asha's share and Bhavna 1/3 of Bhavna's share. Sacrifices: 3/5 x 1/4 = 3/20 and 2/5 x 1/3 = 2/15. Chetan gets 17/60. New ratio 27:16:17.",
    'Deducting 1/4 and 1/3 straight from 3/5 and 2/5.'),
  card(5, 'adm-sacrifice', 'formula', 'What is the sacrificing ratio and how is it found?',
    'Sacrifice of an old partner = old share - new share. The sacrificing ratio is the ratio of these sacrifices, in the order of the old partners.',
    'It is the ratio in which the old partners give up profit to the new partner, and so the ratio in which they share the premium for goodwill.',
    'Old 3:2, new 5:3:2. Asha 3/5 - 5/10 = 1/10; Bhavna 2/5 - 3/10 = 1/10. Sacrificing ratio 1:1.',
    'Subtracting the terms of the ratios as they stand (3 - 5 and 2 - 3) without first writing the shares as fractions.'),
  card(6, 'adm-sacrifice', 'shortcut', 'When can the sacrificing ratio be read off without any working?',
    'Old partners keep their old ratio: sacrificing ratio = old ratio. Share taken equally: 1:1. Share taken in a stated ratio: that ratio. Share taken wholly from one partner: only that partner sacrifices.',
    'In each of these cases the question itself says how the new share is given up.',
    'Chetan takes 1/6 from Asha and Bhavna in 2:1: the sacrificing ratio is 2:1 whatever the old ratio was.',
    'Using the old ratio in every case. It is the sacrificing ratio only when the old partners keep their old ratio between themselves.'),
  card(7, 'adm-premium', 'format', 'What are the entries when the new partner brings the premium for goodwill in cash and it is kept in the business?',
    "1) Bank A/c Dr; To New Partner's Capital A/c (capital); To Premium for Goodwill A/c (premium). 2) Premium for Goodwill A/c Dr; To Sacrificing Partners' Capital A/cs, in the sacrificing ratio.",
    'Under AS 26 goodwill that a firm has built itself is not recorded as an asset, so no Goodwill A/c is raised. The premium is the price of the share of profit given up and goes to those who give it up.',
    'Chetan brings ₹60,000 as premium; Asha and Bhavna sacrifice in 2:1. Premium for Goodwill A/c Dr 60,000; To Asha\'s Capital A/c 40,000; To Bhavna\'s Capital A/c 20,000.',
    "Crediting the premium to the new partner's capital, or sharing it in the old or the new ratio."),
  card(8, 'adm-premium', 'rule', 'What if the old partners withdraw the premium, or the premium is paid to them privately?',
    "Withdrawn (fully or partly): Old Partners' Capital A/cs Dr; To Bank A/c, with the amount each takes out. Paid privately, outside the firm: no entry in the books of the firm.",
    'A withdrawal takes money out of the firm, so the capital accounts and the bank fall. A private payment never passes through the firm at all.',
    'Asha and Bhavna, credited with ₹40,000 and ₹20,000, withdraw half: Asha\'s Capital A/c Dr 20,000; Bhavna\'s Capital A/c Dr 10,000; To Bank A/c 30,000.',
    'Debiting Bank A/c for a premium that was paid privately.'),
  card(9, 'adm-goodwill-adjust', 'format', 'What is the entry when the new partner does not bring the share of goodwill in cash, or brings only part of it?',
    "Not brought: New Partner's Current (or Capital) A/c Dr; To Sacrificing Partners' Capital A/cs. Partly brought: Premium for Goodwill A/c Dr (amount brought); New Partner's Current A/c Dr (amount not brought); To Sacrificing Partners' Capital A/cs (whole share).",
    'The sacrificing partners must get the full value of the share of goodwill. What does not come in as cash is made a debt of the new partner to the firm.',
    'Share of goodwill ₹50,000, only ₹30,000 brought, sacrifice 3:2: Premium for Goodwill A/c Dr 30,000; Chetan\'s Current A/c Dr 20,000; To Asha\'s Capital A/c 30,000; To Bhavna\'s Capital A/c 20,000.',
    'Raising Goodwill A/c for the part not brought in, or crediting the old partners only with the cash received.'),
  card(10, 'adm-goodwill-adjust', 'rule', 'What is done with goodwill that already appears in the books?',
    "It is written off: Old Partners' Capital A/cs Dr, in the old ratio; To Goodwill A/c.",
    'That goodwill belongs to the time before the admission, so the old partners bear it in the ratio in which they shared profits then. The premium the new partner brings is a separate entry.',
    'Goodwill in the books ₹50,000, old ratio 3:2: Asha\'s Capital A/c Dr 30,000; Bhavna\'s Capital A/c Dr 20,000; To Goodwill A/c 50,000.',
    'Writing it off in the new ratio among all the partners, or in the sacrificing ratio.'),
  card(11, 'adm-goodwill-adjust', 'rule', 'What if an old partner also gains a share on the admission?',
    "Every partner who gains pays for the gain: the new partner through the premium, the gaining old partner through the capital account. Premium for Goodwill A/c Dr; Gaining Old Partner's Capital A/c Dr; To Sacrificing Partner's Capital A/c.",
    'Old share less new share is negative for a partner who gains. That partner owes goodwill for the gain, exactly as the new partner does.',
    'Old 4:1, new 2:2:1, goodwill ₹1,00,000. Asha sacrifices 2/5; Bhavna gains 1/5; Chetan gains 1/5. Premium for Goodwill A/c Dr 20,000; Bhavna\'s Capital A/c Dr 20,000; To Asha\'s Capital A/c 40,000.',
    'Crediting both old partners with the premium without checking whether each of them sacrifices.'),
  card(12, 'adm-hidden-goodwill', 'formula', 'How is hidden goodwill worked out from the capitals?',
    "Capitalised value of the firm = new partner's capital x reciprocal of the new partner's share. Hidden goodwill = capitalised value - net worth of the new firm (capitals of all the partners, the new partner's included, plus reserves, less accumulated losses).",
    'If the new partner pays more capital for the share than the capital in the books would suggest, the difference is the goodwill of the firm that has not been stated.',
    'Asha ₹2,00,000 and Bhavna ₹1,50,000; Chetan brings ₹1,50,000 for 1/4. Firm worth 1,50,000 x 4 = ₹6,00,000; capital in it ₹5,00,000; hidden goodwill ₹1,00,000, of which Chetan\'s share is ₹25,000.',
    "Leaving the new partner's own capital out of the net worth."),
  card(13, 'adm-revaluation', 'format', 'How are changes in the values of assets and liabilities recorded on admission?',
    'Through Revaluation A/c. Gains are credited: an asset rises, an unrecorded asset comes in, a liability falls. Losses are debited: an asset falls, a provision is made, an unrecorded liability comes in. The profit or loss goes to the old partners\' capital accounts in the old ratio.',
    'The change in values took place while the old partners owned the firm, so they alone take the profit or bear the loss.',
    'Building up ₹40,000, stock down ₹10,000, provision for doubtful debts ₹5,000: profit ₹25,000. Old ratio 3:2: Revaluation A/c Dr 25,000; To Asha\'s Capital A/c 15,000; To Bhavna\'s Capital A/c 10,000.',
    'Treating a provision or an outstanding expense as a gain, or sharing the result in the new ratio.'),
  card(14, 'adm-reserves', 'rule', 'What happens to reserves and accumulated profits and losses on admission?',
    "General Reserve and a credit balance of Profit and Loss A/c are credited to the old partners in the old ratio. A debit balance of Profit and Loss A/c and deferred revenue expenditure (such as Advertisement Suspense) are debited to them in the old ratio.",
    'They are profits earned, or losses suffered, before the new partner came in.',
    'General Reserve ₹90,000, old ratio 2:1: General Reserve A/c Dr 90,000; To Asha\'s Capital A/c 60,000; To Bhavna\'s Capital A/c 30,000.',
    'Leaving the reserve in the balance sheet of the new firm, or sharing it in the new ratio.'),
  card(15, 'adm-reserves', 'rule', 'How are Workmen Compensation Reserve and Investment Fluctuation Reserve dealt with?',
    'First use the reserve for its purpose: a claim for compensation, or a fall in the market value of investments. Only what is left of the reserve is credited to the old partners in the old ratio. If the claim or the fall is equal to the reserve, nothing is left to share and nothing goes to Revaluation A/c. If it is more than the reserve, only the excess is a loss debited to Revaluation A/c.',
    'These are reserves kept against a particular loss, so that loss is met out of them before anything is shared.',
    'Workmen Compensation Reserve ₹60,000, claim ₹40,000: ₹40,000 becomes Workmen Compensation Claim (a liability) and ₹20,000 goes to the old partners in the old ratio.',
    'Sharing the whole reserve and ignoring the claim.'),
  card(16, 'adm-capitals', 'formula', "How is the new partner's capital found when it is to be in proportion to the share of profit?",
    "Combined adjusted capital of the old partners stands for their combined share. Total capital of the new firm = that capital x reciprocal of their combined share. New partner's capital = total capital x new partner's share.",
    'The old partners\' capitals are taken after revaluation, reserves and goodwill have been adjusted.',
    'Asha and Bhavna have ₹6,00,000 in all after adjustments; Chetan gets 1/4. ₹6,00,000 is 3/4 of the firm, so the total is ₹8,00,000 and Chetan brings ₹2,00,000.',
    "Taking 1/4 of ₹6,00,000. The old partners' capital is only 3/4 of the firm."),
  card(17, 'adm-capitals', 'formula', "How are the old partners' capitals adjusted on the basis of the new partner's capital?",
    "Total capital of the new firm = new partner's capital x reciprocal of the share. Each partner's capital = total capital x new share. An old partner with more than this withdraws the excess (or it is credited to the current account); one with less brings in the shortfall (or the current account is debited).",
    'After the adjustment the capitals of all the partners stand in the new profit-sharing ratio.',
    'Chetan brings ₹2,00,000 for 1/5; new ratio 5:3:2. Total ₹10,00,000: Asha ₹5,00,000, Bhavna ₹3,00,000. Asha has ₹5,40,000, so Asha withdraws ₹40,000.',
    'Applying the old ratio to the total capital, or reading an excess as a shortfall.'),
  card(18, 'adm-new-firm', 'shortcut', 'Which ratio is used for what on admission?',
    'Old ratio: reserves, accumulated profits and losses, profit or loss on revaluation, goodwill already in the books. Sacrificing ratio: the premium for goodwill (brought in or not). New ratio: future profits, and the capitals when they are to be proportionate.',
    'Whatever belongs to the past goes in the old ratio; payment for the share given up goes in the sacrificing ratio; whatever belongs to the future goes in the new ratio.',
    'On one admission: reserve ₹50,000 shared 3:2 (old), premium ₹30,000 shared 1:1 (sacrificing), capitals fixed in 5:3:2 (new).',
    'Sharing the premium in the old ratio when the old partners do not sacrifice in that ratio.'),
  card(19, 'adm-new-firm', 'rule', 'What changes when the firm keeps fixed capital accounts?',
    "The capital brought in is still credited to the Capital A/c, but every other adjustment (share of premium, reserves, revaluation, goodwill written off) passes through the partners' Current A/cs.",
    'A fixed capital account changes only when capital is brought in or withdrawn for good.',
    'Fixed capitals, premium ₹60,000 shared 2:1: Premium for Goodwill A/c Dr 60,000; To Asha\'s Current A/c 40,000; To Bhavna\'s Current A/c 20,000.',
    'Crediting a share of premium or reserve to a fixed capital account.'),
];

// ---------------------------------------------------------------------------------------------------------------
// Authored questions
// ---------------------------------------------------------------------------------------------------------------

const qid = (n: number): string => `adm-q-${String(n).padStart(3, '0')}`;

/**
 * The place of an Assertion-Reason option in the board's fixed order: (a) both true and R explains A, (b) both true
 * and R does not explain A, (c) A true and R false, (d) A false and R true. -1 for any other option.
 */
const arPlace = (text: string): number =>
  text.startsWith('Both A and R are true') ? (text.includes(' not ') ? 1 : 0) : text.startsWith('A is true') ? 2 : text.startsWith('A is false') ? 3 : -1;

/** An mcq. The options of an Assertion-Reason question stand in the board's order, whichever is right. */
function mcq(n: number, conceptId: string, difficulty: Difficulty, prompt: string, correct: string, wrong: [string, string][], explanation: string, hints: string[]): McqQuestion {
  const pos = n % (wrong.length + 1);
  const all: { text: string; why?: string }[] = [...wrong.map(([text, why]) => ({ text, why }))];
  all.splice(pos, 0, { text: correct });
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

/** A question answered with a ratio, its terms in the order the prompt names the partners. */
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
const arOptions = (truth: 'explains' | 'both' | 'onlyA' | 'onlyR', whys: { explains?: string; both?: string; onlyA?: string; onlyR?: string }): { correct: string; wrong: [string, string][] } => {
  const text = {
    explains: 'Both A and R are true, and R is the correct explanation of A',
    both: 'Both A and R are true, but R is not the correct explanation of A',
    onlyA: 'A is true but R is false',
    onlyR: 'A is false but R is true',
  };
  const keys = ['explains', 'both', 'onlyA', 'onlyR'] as const;
  return { correct: text[truth], wrong: keys.filter((k) => k !== truth).map((k): [string, string] => [text[k], whys[k]!]) };
};

const ar1 = arOptions('explains', {
  both: 'Missed the link: goodwill is not raised precisely because AS 26 does not allow self-generated goodwill to be recorded.',
  onlyA: 'Denied the rule of AS 26. Only goodwill that has been paid for may be shown in the books.',
  onlyR: 'Thought goodwill is raised in the books at its full value on admission. It is adjusted through the capital accounts instead.',
});
const ar2 = arOptions('explains', {
  both: 'Missed the link: the reserve goes to the old partners because it is made of profits they earned.',
  onlyA: 'Denied that a reserve is set aside out of past profits.',
  onlyR: 'Thought the reserve is carried into the new firm for all the partners to share.',
});
const ar3 = arOptions('onlyA', {
  explains: 'Accepted the reason. The premium is shared in the sacrificing ratio, which is the old ratio only when the old partners keep that ratio between themselves.',
  both: 'Accepted the reason as a true statement. The premium is not always shared in the old ratio.',
  onlyR: 'Denied that the premium belongs to the sacrificing partners.',
});

const questions: Question[] = [
  // ---- Ratios and goodwill: recognition ----
  mcq(1, 'adm-sacrifice', 'easy', 'On the admission of a partner, the sacrifice of an old partner is:',
    "The old partner's old share less the new share",
    [
      ["The old partner's new share less the old share", 'Reversed the subtraction; this gives a gain, which is what a partner who gets a larger share has.'],
      ["The new partner's share divided by the number of old partners", 'Assumed the share is always taken equally from the old partners.'],
      ["The old partner's old share multiplied by the new share", 'Multiplied the shares; a sacrifice is the part of the share that is given up.'],
    ],
    'Sacrifice = old share - new share. The ratio of the sacrifices of the old partners is the sacrificing ratio.',
    ['How much less of the profit does the old partner get now?', 'Old share - new share.']),
  tf(2, 'adm-new-ratio', 'easy', "When a question says nothing about how the new partner acquires the share, the old partners are taken to give it up in their old profit-sharing ratio.", true,
    "In the absence of any other agreement the new partner's share comes from the old partners in their old ratio, so their ratio between themselves stays as it was.",
    ['If nothing changes between the old partners, which ratio still holds between them?', 'Silence means the old partners keep their old ratio.']),
  mcq(3, 'adm-premium', 'easy', 'The premium for goodwill brought in by a new partner is credited to:',
    'The sacrificing partners, in their sacrificing ratio',
    [
      ['All the partners, in the new ratio', 'Used the new ratio, which gives the new partner back a part of what the new partner paid.'],
      ['The old partners, always in the old ratio', 'Used the old ratio in every case. It is right only when the old partners sacrifice in the old ratio.'],
      ["The new partner's capital account", 'Treated the premium as capital of the new partner. It is the price paid to the partners who give up a share.'],
    ],
    'The premium pays the old partners for the share of profit they give up, so it follows the sacrificing ratio.',
    ['Who loses a part of the profit when the new partner comes in?', 'The premium goes to those who sacrifice, in the ratio of their sacrifice.']),
  mcq(4, 'adm-goodwill-adjust', 'easy', 'Goodwill of ₹40,000 already appears in the balance sheet when a partner is admitted. It is:',
    'Written off among the old partners in the old ratio',
    [
      ['Written off among all the partners in the new ratio', 'Brought the new partner into the write-off. The goodwill belongs to the time before the admission.'],
      ['Left in the balance sheet of the new firm', 'Left the old goodwill in the books; it is written off at the time of admission.'],
      ['Written off among the old partners in the sacrificing ratio', 'Used the sacrificing ratio, which is only for the premium the new partner brings.'],
    ],
    "Old Partners' Capital A/cs Dr (old ratio); To Goodwill A/c.",
    ['Whose goodwill was it before the new partner came?', 'It is written off in the old ratio.']),
  tf(5, 'adm-premium', 'easy', 'When the new partner pays the premium for goodwill privately to the old partners, the firm debits its Bank A/c with the amount.', false,
    'A private payment does not pass through the firm, so the books of the firm show no entry for it.',
    ['Did the money ever reach the firm?', 'No entry is passed for a premium paid privately.']),
  mcq(6, 'adm-new-ratio', 'medium', 'A person admitted as a partner acquires the right to share:',
    'The future profits of the firm and its assets',
    [
      ['Only the future profits of the firm', 'Left out the right to share in the assets, which the new partner also acquires.'],
      ['The reserves and accumulated profits already in the books', 'Gave the new partner profits earned before the admission. These belong to the old partners.'],
      ['The profit on revaluation made at the time of admission', 'Gave the new partner the revaluation profit, which belongs to the old partners.'],
    ],
    'A new partner gets a share in the future profits and in the assets of the firm, and becomes liable for what the firm does after the admission.',
    ['What does the new partner pay capital and a premium for?', 'Two rights: a share of future profits and a share in the assets.']),
  mcq(7, 'adm-premium', 'medium', `Assertion (A): On the admission of a partner, goodwill is not raised in the books at its full value. Reason (R): AS 26 allows only purchased goodwill to be recorded; goodwill a firm has built itself is not recognised as an asset. ${AR}`,
    ar1.correct, ar1.wrong,
    'Both statements are true and the reason is why goodwill is adjusted through the capital accounts instead of being raised.',
    ['Is the goodwill of a running firm bought or built?', 'AS 26: only purchased goodwill is shown in the books.']),
  mcq(8, 'adm-sacrifice', 'medium', 'Kabir and Lata share profits in 3:2. Mohan is admitted for 1/5 share, and Kabir and Lata keep their old ratio between themselves. Their sacrificing ratio is:',
    '3:2',
    [
      ['1:1', 'Assumed the share is taken equally. The old partners keep their old ratio, so they give up in that ratio.'],
      ['12:8:5', 'Gave the new profit-sharing ratio of all three partners, not the ratio in which the two old partners give up their shares.'],
      ['2:3', 'Wrote the old ratio the wrong way round.'],
    ],
    'When the old partners keep their old ratio, each gives up the same fraction of the share, so the sacrificing ratio is the old ratio, 3:2.',
    ['Does the ratio between Kabir and Lata change?', 'Old ratio kept: sacrificing ratio = old ratio.']),
  mcq(9, 'adm-premium', 'medium', `Assertion (A): The premium for goodwill brought in by a new partner belongs to the sacrificing partners. Reason (R): The premium for goodwill is always shared by the old partners in their old profit-sharing ratio. ${AR}`,
    ar3.correct, ar3.wrong,
    'A is true. R is false: the premium is shared in the sacrificing ratio, which equals the old ratio only when the old partners keep their old ratio between themselves.',
    ['Is the sacrificing ratio always the old ratio?', 'Think of a share taken wholly from one partner.']),
  tf(10, 'adm-sacrifice', 'easy', "An old partner whose share of profit is the same before and after the admission gets no part of the premium for goodwill.", true,
    'That partner gives up nothing, so there is no sacrifice to be paid for.',
    ['What is the premium a payment for?', 'No sacrifice, no share of the premium.']),
  mcq(11, 'adm-goodwill-adjust', 'medium', 'Asha and Bhavna share profits in 4:1. Chetan is admitted and the new ratio of Asha, Bhavna and Chetan is 2:2:1. Who compensates whom for goodwill?',
    'Bhavna and Chetan, who gain, compensate Asha, who sacrifices',
    [
      ['Chetan alone compensates Asha and Bhavna in the old ratio', 'Assumed both old partners sacrifice. Bhavna\'s share rises from 1/5 to 2/5, so Bhavna gains.'],
      ['Chetan alone compensates Asha', 'Left out Bhavna, who also gains a share and must pay for it.'],
      ['Asha compensates Bhavna and Chetan', 'Reversed it: the partner whose share falls is the one who is paid.'],
    ],
    'Asha: 4/5 - 2/5 = 2/5 sacrifice. Bhavna: 1/5 - 2/5 = a gain of 1/5. Chetan gains 1/5. Both gainers compensate Asha.',
    ['Work out old share less new share for Bhavna.', 'A partner who gains pays; a partner who sacrifices is paid.']),
  mcq(12, 'adm-hidden-goodwill', 'medium', 'Goodwill is said to be hidden when:',
    "Its value is not given and has to be inferred from the capital the new partner brings for the share",
    [
      ['It already appears in the balance sheet of the firm', 'That is goodwill in the books, which is simply written off.'],
      ['The new partner pays the premium privately to the old partners', 'That is a premium paid privately; its amount is known.'],
      ['The old partners withdraw the premium brought in', 'A withdrawal of premium has nothing to do with how goodwill is valued.'],
    ],
    "When the new partner's capital, scaled up to the whole firm, is more than the net worth of the firm, the difference is goodwill that the question has not stated.",
    ['What can the capital paid for a share tell you about the worth of the whole firm?', 'Hidden goodwill = capitalised value of the firm - net worth.']),
  mcq(13, 'adm-new-firm', 'medium', 'A firm keeps fixed capital accounts. The share of an old partner in the premium for goodwill brought by a new partner is credited to:',
    "The old partner's Current A/c",
    [
      ["The old partner's Capital A/c", 'Changed a fixed capital account. With fixed capitals such adjustments go through the current account.'],
      ['Premium for Goodwill A/c', 'Left the premium in the temporary account that only holds it until it is shared.'],
      ['Profit and Loss Appropriation A/c', 'Treated the premium as a profit of the year to be appropriated.'],
    ],
    'With fixed capitals, only capital introduced or withdrawn touches the Capital A/c; the premium goes to the Current A/c.',
    ['What is allowed to change a fixed capital account?', 'Fixed capitals: adjustments pass through current accounts.']),

  // ---- Ratios and amounts to work out ----
  rat(14, 'adm-new-ratio', 'easy', 'Asha and Bhavna share profits in the ratio 3:2. Chetan is admitted for 1/5 share, and Asha and Bhavna share the remaining profit in their old ratio. Find the new profit-sharing ratio of Asha, Bhavna and Chetan, in that order.',
    [12, 8, 5],
    [[[3, 2, 1], "Left the old shares as they were and added Chetan's share on top, so the shares add up to more than the whole profit."], [[5, 3, 2], "Took Chetan's share equally from Asha and Bhavna; they give it up in their old ratio."]],
    ['Share left = 1 - 1/5 = 4/5.', 'Asha 4/5 x 3/5 = 12/25; Bhavna 4/5 x 2/5 = 8/25; Chetan 1/5 = 5/25.', 'New ratio = 12:8:5.'],
    ['What is left for the old partners after Chetan takes 1/5?', 'They share the 4/5 in 3:2.']),
  rat(15, 'adm-sacrifice', 'easy', 'Kabir and Lata share profits in the ratio 3:2. On the admission of Mohan the new ratio of Kabir, Lata and Mohan is 5:3:2. Find the sacrificing ratio of Kabir and Lata, in that order.',
    [1, 1],
    [[[3, 2], 'Gave the old ratio. Here the old partners do not keep their old ratio between themselves.'], [[5, 3], 'Gave the new ratio between the old partners, not what each gave up.'], [[2, 1], 'Subtracted the terms of the ratios as they stand (5 - 3 and 3 - 2) without first writing the shares as fractions.']],
    ['Kabir: 3/5 - 5/10 = 1/10.', 'Lata: 2/5 - 3/10 = 1/10.', 'Sacrificing ratio = 1:1.'],
    ['Write each share as a fraction of the whole profit first.', 'Sacrifice = old share - new share.']),
  rat(16, 'adm-new-ratio', 'medium', 'Rekha and Sunil share profits in the ratio 2:1. Tarun is admitted for 1/4 share, which Tarun acquires equally from Rekha and Sunil. Find the new profit-sharing ratio of Rekha, Sunil and Tarun, in that order.',
    [13, 5, 6],
    [[[2, 1, 1], "Took Tarun's share from the old partners in their old ratio; it is taken equally."], [[5, 1, 3], "Deducted the whole of Tarun's 1/4 from each old partner instead of 1/8 from each; the shares then add up to only 3/4, not to a whole."]],
    ['Each old partner gives up 1/4 x 1/2 = 1/8.', 'Rekha 2/3 - 1/8 = 13/24; Sunil 1/3 - 1/8 = 5/24; Tarun 1/4 = 6/24.', 'New ratio = 13:5:6.'],
    ['How much of the 1/4 does each old partner give up?', 'New share = old share - 1/8.']),
  num(17, 'adm-premium', 'easy', 'The goodwill of a firm is valued at ₹1,80,000. A new partner is admitted for 1/4 share. How much premium for goodwill must the new partner bring?', 45000,
    [[180000, 'Took the whole goodwill of the firm. The new partner pays only for the share acquired.'], [135000, "Took the old partners' 3/4 of the goodwill."]],
    ['Premium = ₹1,80,000 x 1/4 = ₹45,000.'],
    ['The new partner buys a share of the goodwill, not all of it.', "Premium = firm's goodwill x new partner's share."]),
  num(18, 'adm-hidden-goodwill', 'medium', 'The capitals of Asha and Bhavna, after all adjustments, are ₹2,00,000 and ₹1,50,000. Chetan is admitted for 1/4 share and brings ₹1,50,000 as capital. The firm has no reserves. Find the hidden goodwill of the firm.', 100000,
    [[250000, "Left Chetan's own capital out of the capital of the new firm."], [25000, "Gave Chetan's share of the goodwill, not the goodwill of the firm."], [600000, 'Stopped at the capitalised value of the firm.']],
    ['Firm is worth ₹1,50,000 x 4 = ₹6,00,000.', 'Capital in the new firm = ₹2,00,000 + ₹1,50,000 + ₹1,50,000 = ₹5,00,000.', 'Hidden goodwill = ₹6,00,000 - ₹5,00,000 = ₹1,00,000.'],
    ["Scale Chetan's capital up to the whole firm.", "Deduct the capital of all three partners from it."]),
  num(19, 'adm-capitals', 'medium', 'After all adjustments the capitals of the old partners add up to ₹6,00,000. A new partner is admitted for 1/4 share and is to bring capital in proportion to this share. How much capital must the new partner bring?', 200000,
    [[150000, "Took 1/4 of the old partners' capital. Their capital is only 3/4 of the new firm."], [800000, 'Gave the total capital of the new firm.']],
    ['₹6,00,000 stands for 3/4 of the firm.', 'Total capital = ₹6,00,000 x 4/3 = ₹8,00,000.', "New partner's capital = ₹8,00,000 x 1/4 = ₹2,00,000."],
    ['What share of the new firm do the old partners hold?', 'Find the total capital first, then take 1/4 of it.']),
  mcq(20, 'adm-capitals', 'medium', 'Chetan is admitted for 1/5 share and brings ₹2,00,000 as capital. If the capital of the firm is fixed on the basis of Chetan\'s capital, the total capital of the new firm is:',
    '₹10,00,000',
    [
      ['₹8,00,000', "Gave the combined capital of the old partners and left out Chetan's own."],
      ['₹40,000', "Took 1/5 of Chetan's capital instead of scaling it up."],
      ['₹2,50,000', "Divided by the old partners' share, 4/5, instead of by Chetan's 1/5."],
    ],
    '₹2,00,000 is 1/5 of the firm, so the total capital is ₹2,00,000 x 5 = ₹10,00,000.',
    ["Chetan's capital is one-fifth of what?", "Total capital = new partner's capital x reciprocal of the share."]),

  // ---- Entries ----
  jr(21, 'adm-premium', 'easy', 'Chetan is admitted as a partner and brings ₹3,00,000 as capital and ₹60,000 as premium for goodwill by cheque. Capitals are fluctuating. Pass the journal entry for the amount brought in.',
    [['bank', 'Dr', 360000], [partnerCapital('Chetan'), 'Cr', 300000], ['premiumForGoodwill', 'Cr', 60000]], ['goodwill', partnerCapital('Asha')],
    "Bank A/c is debited with the whole ₹3,60,000. Chetan's Capital A/c is credited with the capital only; the premium is credited to Premium for Goodwill A/c until it is shared by the sacrificing partners.",
    ['Is the premium part of the new partner\'s capital?', "Bank A/c Dr; To New Partner's Capital A/c; To Premium for Goodwill A/c."]),
  jr(22, 'adm-premium', 'medium', 'Chetan has brought ₹60,000 in cash as premium for goodwill, which stands in Premium for Goodwill A/c. Asha and Bhavna sacrifice in the ratio 2:1 and capitals are fluctuating. Pass the journal entry to share the premium.',
    [['premiumForGoodwill', 'Dr', 60000], [partnerCapital('Asha'), 'Cr', 40000], [partnerCapital('Bhavna'), 'Cr', 20000]], ['goodwill', partnerCapital('Chetan')],
    'Premium for Goodwill A/c is debited to close it. Asha gets 2/3 of ₹60,000 = ₹40,000 and Bhavna 1/3 = ₹20,000.',
    ['Who gives up a share of profit?', "Premium for Goodwill A/c Dr; To Sacrificing Partners' Capital A/cs."]),
  jr(23, 'adm-goodwill-adjust', 'medium', "Mohan is admitted as a partner. Mohan's share of goodwill is ₹50,000, which Mohan cannot bring in cash; it is to be adjusted through Mohan's Current A/c. Kabir and Lata sacrifice in the ratio 3:2 and their capitals are fluctuating. Pass the journal entry.",
    [[partnerCurrent('Mohan'), 'Dr', 50000], [partnerCapital('Kabir'), 'Cr', 30000], [partnerCapital('Lata'), 'Cr', 20000]], ['premiumForGoodwill', 'goodwill', partnerCapital('Mohan')],
    "No cash comes in, so Mohan's Current A/c is debited with ₹50,000. Kabir is credited with 3/5 = ₹30,000 and Lata with 2/5 = ₹20,000.",
    ['No premium came in, so which account cannot be used?', "New Partner's Current A/c Dr; To Sacrificing Partners' Capital A/cs."]),
  jr(24, 'adm-reserves', 'easy', 'Rekha and Sunil share profits in the ratio 2:1. On the admission of Tarun the balance sheet shows a General Reserve of ₹90,000. Capitals are fluctuating. Pass the journal entry to distribute it.',
    [['generalReserve', 'Dr', 90000], [partnerCapital('Rekha'), 'Cr', 60000], [partnerCapital('Sunil'), 'Cr', 30000]], [partnerCapital('Tarun'), 'revaluation', 'profitAndLoss'],
    'The reserve is made of past profits, so it goes to the old partners in the old ratio: Rekha ₹60,000 and Sunil ₹30,000. General Reserve A/c is debited to close it.',
    ['Who earned the profits that were kept in the reserve?', "General Reserve A/c Dr; To Old Partners' Capital A/cs, in the old ratio."]),
  mcq(25, 'adm-goodwill-adjust', 'complex', "Zubin is admitted and Zubin's share of the firm's goodwill is ₹60,000. Zubin brings only ₹40,000 in cash for goodwill, which has been credited to Premium for Goodwill A/c; the rest is to be adjusted through Zubin's Current A/c. The capital accounts of the old partners are fluctuating. Which entry gives the sacrificing partners their due?",
    "Premium for Goodwill A/c Dr 40,000; Zubin's Current A/c Dr 20,000; To Sacrificing Partners' Capital A/cs 60,000",
    [
      ["Premium for Goodwill A/c Dr 40,000; To Sacrificing Partners' Capital A/cs 40,000", 'Credited the old partners only with the cash received, so they lose ₹20,000 of the goodwill due to them.'],
      ["Premium for Goodwill A/c Dr 40,000; Goodwill A/c Dr 20,000; To Sacrificing Partners' Capital A/cs 60,000", 'Raised Goodwill A/c for the part not brought in. AS 26 does not allow self-generated goodwill in the books.'],
      ["Zubin's Current A/c Dr 60,000; To Sacrificing Partners' Capital A/cs 60,000", 'Charged the whole share to Zubin and ignored the ₹40,000 already brought in cash.'],
    ],
    'The sacrificing partners are credited with the full ₹60,000: ₹40,000 comes from the premium received and ₹20,000 is made a debt of Zubin through the Current A/c.',
    ['How much are the old partners entitled to in all?', 'Cash brought: Premium for Goodwill A/c. Not brought: the new partner\'s Current A/c.']),

  // ---- Revaluation, reserves and capitals: recognition ----
  mcq(26, 'adm-reserves', 'easy', 'A General Reserve appearing in the balance sheet at the time of admission is credited to:',
    'The old partners, in the old ratio',
    [
      ['All the partners, in the new ratio', 'Gave the new partner a part of profits earned before the admission.'],
      ['The old partners, in the sacrificing ratio', 'Used the sacrificing ratio, which is only for the premium for goodwill.'],
      ['Revaluation A/c', 'Treated a reserve as a gain on revaluation. It is distributed directly to the capital accounts.'],
    ],
    'A reserve is made of past profits and belongs to the partners who earned them, in the ratio in which they shared profits then.',
    ['When were these profits earned?', 'Past profits: old partners, old ratio.']),
  mcq(27, 'adm-revaluation', 'easy', 'On revaluation, an increase in the value of an asset is:',
    'Credited to Revaluation A/c',
    [
      ['Debited to Revaluation A/c', 'Treated a gain as a loss. A fall in an asset is what is debited.'],
      ['Credited to Profit and Loss A/c', 'Used the Profit and Loss A/c. Changes in values on admission go through Revaluation A/c.'],
      ["Credited to the new partner's capital account", 'Gave the gain to the new partner. It belongs to the old partners, through Revaluation A/c.'],
    ],
    'Asset A/c Dr; To Revaluation A/c. A rise in an asset is a gain.',
    ['Is the firm better off or worse off?', 'Gains are credited to Revaluation A/c.']),
  mcq(28, 'adm-revaluation', 'easy', 'The Revaluation A/c prepared on the admission of a partner is in the nature of a:',
    'Nominal account',
    [
      ['Real account', 'Took it for an asset account. It records gains and losses, not an asset.'],
      ['Personal account', 'Took it for the account of a person. It collects gains and losses on revaluation.'],
      ['Capital account of the new partner', 'Linked it with the new partner. Its balance goes to the old partners.'],
    ],
    'It records the gains and losses from changes in values and is closed by transferring the balance to the old partners.',
    ['What does the account collect: assets, or gains and losses?', 'Gains and losses: a nominal account.']),
  tf(29, 'adm-revaluation', 'easy', 'A profit on revaluation at the time of admission is shared by all the partners, the new partner included, in the new profit-sharing ratio.', false,
    'The change in values happened before the admission, so the profit goes to the old partners only, in the old ratio.',
    ['Who owned the firm while the assets changed in value?', 'Revaluation profit: old partners, old ratio.']),
  mcq(30, 'adm-reserves', 'medium', `Assertion (A): A General Reserve in the books is distributed among the old partners before a new partner is admitted. Reason (R): A reserve is created out of profits earned in the past by the old partners. ${AR}`,
    ar2.correct, ar2.wrong,
    'Both are true, and the reason explains why the new partner gets no part of the reserve.',
    ['Whose profits went into the reserve?', 'Past profits belong to those who earned them.']),
  mcq(31, 'adm-revaluation', 'medium', 'A liability for outstanding wages, not yet in the books, is found at the time of admission. It is:',
    'Debited to Revaluation A/c and credited to Outstanding Expenses A/c',
    [
      ['Credited to Revaluation A/c and debited to Outstanding Expenses A/c', 'Treated a new liability as a gain. It is a loss.'],
      ["Debited to the new partner's capital account", 'Charged the new partner with an expense of the time before the admission.'],
      ['Ignored, because it was not in the books', 'Left the liability out. Every unrecorded liability is brought in before the admission.'],
    ],
    'An unrecorded liability is a loss of the old partners: Revaluation A/c Dr; To Outstanding Expenses A/c.',
    ['Does a new liability make the firm better off or worse off?', 'Losses are debited to Revaluation A/c.']),
  mcq(32, 'adm-reserves', 'medium', 'A Workmen Compensation Reserve of ₹60,000 stands in the books at the time of admission, and a claim of ₹40,000 for compensation is to be provided for. What is done?',
    '₹40,000 is transferred to Workmen Compensation Claim and ₹20,000 is credited to the old partners in the old ratio',
    [
      ['The whole ₹60,000 is credited to the old partners in the old ratio', 'Ignored the claim, which must first be met out of the reserve.'],
      ['₹40,000 is debited to Revaluation A/c and ₹60,000 is credited to the old partners', 'Charged the claim to revaluation although the reserve is there to meet it.'],
      ['₹20,000 is credited to all the partners in the new ratio', 'Shared the surplus in the new ratio. It belongs to the old partners.'],
    ],
    'The reserve first meets the claim. Only the surplus of ₹20,000 is free to be shared, by the old partners in the old ratio.',
    ['What is this reserve kept for?', 'Reserve less claim = surplus for the old partners.']),
  mcq(33, 'adm-reserves', 'medium', 'Investments stand at ₹1,00,000 with an Investment Fluctuation Reserve of ₹15,000. At the time of admission their market value is ₹90,000. How much of the reserve is credited to the old partners?',
    '₹5,000',
    [
      ['₹15,000', 'Shared the whole reserve without first meeting the fall of ₹10,000 in the value of the investments.'],
      ['₹10,000', 'Gave the fall in value instead of what is left of the reserve after it.'],
      ['Nothing', 'Thought the whole reserve is used up. The fall is only ₹10,000 and the reserve is ₹15,000.'],
    ],
    'Fall in value = ₹10,000, met out of the reserve. Surplus = ₹15,000 - ₹10,000 = ₹5,000, credited to the old partners in the old ratio.',
    ['How much have the investments fallen by?', 'Reserve less fall in value = surplus.']),
  tf(34, 'adm-reserves', 'medium', 'Advertisement Suspense A/c appearing on the assets side at the time of admission is written off by debiting all the partners, the new partner included, in the new ratio.', false,
    'It is expenditure of the time before the admission that has not yet been written off, so the old partners bear it in the old ratio.',
    ['When was this money spent?', 'Accumulated losses and deferred expenditure: old partners, old ratio.']),
  mcq(35, 'adm-revaluation', 'medium', 'After all the changes are entered, the credit side of Revaluation A/c is larger than the debit side. The difference is:',
    "A profit, credited to the old partners' capital accounts in the old ratio",
    [
      ["A loss, debited to the old partners' capital accounts in the old ratio", 'Read the balance the wrong way: gains are on the credit side, so a larger credit side is a profit.'],
      ["A profit, credited to all the partners' capital accounts in the new ratio", 'Shared the profit with the new partner. It belongs to the old partners in the old ratio.'],
      ['A reserve to be carried in the balance sheet of the new firm', 'Left the profit undistributed. Revaluation A/c is closed to the capital accounts.'],
    ],
    'Gains are credited and losses debited, so a larger credit side means a profit on revaluation, which the old partners share in the old ratio.',
    ['Which side of Revaluation A/c holds the gains?', 'Credit more than debit: profit to the old partners.']),
  mcq(36, 'adm-capitals', 'complex', "After all adjustments Rekha's capital stands at ₹3,40,000. On the basis of the new partner's capital it should be ₹3,00,000, and the difference is to be adjusted through the current account. Which entry is passed?",
    "Rekha's Capital A/c Dr 40,000; To Rekha's Current A/c 40,000",
    [
      ["Rekha's Current A/c Dr 40,000; To Rekha's Capital A/c 40,000", "Treated the excess as a shortfall. Rekha's capital is above the figure required, so it must come down."],
      ["Rekha's Capital A/c Dr 40,000; To Bank A/c 40,000", 'Paid the excess out in cash, although it is to be transferred to the current account.'],
      ["Bank A/c Dr 40,000; To Rekha's Capital A/c 40,000", 'Made Rekha bring in cash, although the capital is already more than required.'],
    ],
    'The capital is ₹40,000 more than required. The excess is moved out of the Capital A/c (debit) into the Current A/c (credit).',
    ['Is ₹3,40,000 more or less than what is required?', 'An excess is debited to the capital account.']),
  mcq(37, 'adm-new-firm', 'complex', 'A new partner brings a premium for goodwill in cash and it is kept in the business. How does this premium appear in the balance sheet of the new firm?',
    "It is not shown as a separate item: it is part of the old partners' capital accounts and of the bank balance",
    [
      ['As Premium for Goodwill on the liabilities side', 'Left the temporary account open. It is closed by transfer to the sacrificing partners.'],
      ['As Goodwill on the assets side', 'Raised goodwill as an asset, which AS 26 does not allow for goodwill a firm has built itself.'],
      ["As part of the new partner's capital", 'Credited the premium to the partner who paid it. It belongs to the sacrificing partners.'],
    ],
    'Premium for Goodwill A/c is closed by crediting the sacrificing partners, so the money sits in the bank and the credit in their capital accounts.',
    ['What happens to Premium for Goodwill A/c after the premium is shared?', 'It is closed, so it cannot appear in the balance sheet.']),
  mcq(38, 'adm-new-firm', 'complex', 'Which of these adjustments on admission leaves the total of the balance sheet unchanged?',
    'Recording outstanding salaries of ₹10,000 through Revaluation A/c',
    [
      ['Appreciating the building by ₹10,000', 'An asset rises, so the total of the assets side rises by ₹10,000 (and the capitals with it).'],
      ['The new partner bringing ₹10,000 as capital in cash', 'Cash and capital both rise, so the total rises by ₹10,000.'],
      ['Writing off goodwill of ₹10,000 that appears in the books', 'An asset is removed, so the total falls by ₹10,000 (and the capitals with it).'],
    ],
    'Outstanding salaries add ₹10,000 to the liabilities and take ₹10,000 off the capitals through Revaluation A/c: both are on the same side, so the total stays the same.',
    ['Which adjustment only moves an amount between two items on the liabilities side?', 'A liability up and the capitals down by the same amount: no change in the total.']),
  tf(39, 'adm-premium', 'medium', 'If the old partners withdraw the premium for goodwill credited to them, the bank balance of the firm falls but the capital of the new partner does not change.', true,
    "The withdrawal is debited to the old partners' capital accounts and credited to Bank A/c. The new partner's capital is not touched.",
    ['Whose capital accounts were credited with the premium?', "Old Partners' Capital A/cs Dr; To Bank A/c."]),
];

// ---------------------------------------------------------------------------------------------------------------
// Levels
// ---------------------------------------------------------------------------------------------------------------

const levels = buildLadder(T, {
  concept: {
    title: 'A New Partner Joins the Firm',
    description: 'See what a new partner gets, what the old partners give up, and what is settled before the new firm starts.',
    lesson: [
      {
        type: 'text',
        heading: 'Someone has to give up a share',
        body: 'Asha and Bhavna share the profits of their firm in the ratio 3:2. They admit Chetan for 1/5 of the profits. The whole profit is still only 1, so Chetan\'s 1/5 must come out of what Asha and Bhavna used to get. If nothing else is agreed, they give it up in their old ratio: the 4/5 that is left is shared 3:2, which makes Asha 12/25, Bhavna 8/25 and Chetan 5/25. The new ratio is 12:8:5.',
      },
      {
        type: 'text',
        heading: 'The sacrifice, and paying for it',
        body: 'What an old partner gives up is the sacrifice: old share less new share. Asha gives up 3/5 - 12/25 = 3/25 and Bhavna 2/5 - 8/25 = 2/25, so the sacrificing ratio is 3:2. The firm has a reputation that earns profit, its goodwill, and Chetan is buying a part of that. So Chetan pays a premium for goodwill, and it goes to Asha and Bhavna in the sacrificing ratio. No Goodwill A/c is opened: under AS 26 a firm cannot record goodwill it has built itself.',
      },
      {
        type: 'text',
        heading: 'Settle the past, then fix the capitals',
        body: 'Everything that belongs to the time before Chetan came in is settled between Asha and Bhavna in their old ratio 3:2: the General Reserve and any undistributed profit or loss, the profit or loss on revaluing the assets and liabilities (worked in a Revaluation A/c), and any goodwill already standing in the books, which is written off. Chetan gets no part of these. Chetan then brings capital for the share, and often the capitals are made proportionate to the new ratio: if Chetan brings ₹2,00,000 for 1/5, the whole firm should have ₹2,00,000 x 5 = ₹10,00,000 and each old partner the new share of that. A partner with too much withdraws the excess; one with too little brings in the shortfall.',
      },
      {
        type: 'example',
        title: 'Chetan brings a premium of ₹50,000; Asha and Bhavna sacrifice in 3:2',
        lines: [
          { accountId: 'premiumForGoodwill', side: 'Dr', amount: 5000000 },
          { accountId: partnerCapital('Asha'), side: 'Cr', amount: 3000000 },
          { accountId: partnerCapital('Bhavna'), side: 'Cr', amount: 2000000 },
        ],
        note: 'The cash was first recorded as Bank A/c Dr; To Premium for Goodwill A/c. This entry closes Premium for Goodwill A/c and gives the premium to the partners who sacrificed: 3/5 of ₹50,000 to Asha and 2/5 to Bhavna.',
      },
      {
        type: 'table',
        title: 'Worked example 1: the Revaluation A/c of Asha and Bhavna (a sports goods firm in Meerut) on Chetan\'s admission',
        rows: [
          { label: 'The facts: building up by ₹40,000; stock down by ₹8,000; rent of ₹5,000 outstanding; debtors ₹2,04,000 with a provision of ₹12,000, of which ₹4,000 are bad and are written off, the provision then kept at 5% of the rest.' },
          { label: 'Debit side' },
          { label: 'To Provision for Doubtful Debts A/c (₹10,000 needed less ₹8,000 left after the bad debts)', amount: '₹2,000' },
          { label: 'To Stock A/c', amount: '₹8,000' },
          { label: 'To Outstanding Rent A/c', amount: '₹5,000' },
          { label: 'To Profit transferred: Asha\'s Capital A/c ₹15,000, Bhavna\'s Capital A/c ₹10,000 (old ratio 3:2)', amount: '₹25,000' },
          { label: 'Total of the debit side', amount: '₹40,000', total: true },
          { label: 'Credit side' },
          { label: 'By Building A/c', amount: '₹40,000' },
          { label: 'Total of the credit side', amount: '₹40,000', total: true },
        ],
        note: 'Watch out: the bad debts of ₹4,000 are met from the old provision (Provision for Doubtful Debts A/c Dr; To Debtors A/c) and never pass through Revaluation A/c. Only the ₹2,000 still needed to bring the provision to ₹10,000 is a loss. Chetan gets no part of the profit.',
      },
      {
        type: 'table',
        title: 'The Balance Sheet of the new firm as at 1 April (Chetan brings ₹1,50,000 capital and ₹50,000 premium; the General Reserve of ₹20,000 is shared 3:2)',
        rows: [
          { label: 'Liabilities' },
          { label: 'Creditors', amount: '₹1,20,000' },
          { label: 'Outstanding Rent', amount: '₹5,000' },
          { label: 'Asha\'s Capital: ₹3,00,000 + ₹12,000 reserve + ₹15,000 revaluation + ₹30,000 premium', amount: '₹3,57,000' },
          { label: 'Bhavna\'s Capital: ₹2,00,000 + ₹8,000 + ₹10,000 + ₹20,000', amount: '₹2,38,000' },
          { label: 'Chetan\'s Capital', amount: '₹1,50,000' },
          { label: 'Total', amount: '₹8,70,000', total: true },
          { label: 'Assets' },
          { label: 'Cash at Bank: ₹50,000 + ₹1,50,000 + ₹50,000', amount: '₹2,50,000' },
          { label: 'Debtors ₹2,00,000 less provision ₹10,000', amount: '₹1,90,000' },
          { label: 'Stock: ₹98,000 - ₹8,000', amount: '₹90,000' },
          { label: 'Building: ₹3,00,000 + ₹40,000', amount: '₹3,40,000' },
          { label: 'Total', amount: '₹8,70,000', total: true },
        ],
        note: 'Neither the General Reserve, nor Premium for Goodwill, nor Revaluation A/c is a row: each has been closed to the capitals. Had the capitals been fixed, these amounts would sit in the current accounts, shown beside the unchanged capitals.',
      },
      {
        type: 'working',
        title: 'Worked example 2: premium partly brought, and an old partner who gains',
        lines: [
          'Gauri and Harish share profits equally. Indu is admitted, and the new ratio of Gauri, Harish and Indu is 2:6:2. Goodwill of the firm is ₹3,00,000.',
          'Gauri: 5/10 - 2/10 = 3/10 sacrificed. Harish: 6/10 - 5/10 = 1/10 gained. Indu gets 2/10.',
          'Indu\'s share of goodwill = ₹3,00,000 x 2/10 = ₹60,000, but Indu brings only ₹40,000 as premium.',
          'Harish gains 1/10 too, so Harish pays ₹3,00,000 x 1/10 = ₹30,000.',
          'Gauri, the only one who sacrifices, receives ₹3,00,000 x 3/10 = ₹90,000: ₹40,000 from the premium, ₹20,000 from Indu\'s capital and ₹30,000 from Harish\'s.',
        ],
        note: 'Watch out: the premium goes only to a partner who sacrifices, and a partner who gains is debited like the new partner. The goodwill not brought in is debited to the new partner\'s capital (or current) account.',
      },
      {
        type: 'example',
        title: 'The one entry for Indu\'s premium, Indu\'s shortfall and Harish\'s gain',
        lines: [
          { accountId: 'premiumForGoodwill', side: 'Dr', amount: 4000000 },
          { accountId: partnerCapital('Indu'), side: 'Dr', amount: 2000000 },
          { accountId: partnerCapital('Harish'), side: 'Dr', amount: 3000000 },
          { accountId: partnerCapital('Gauri'), side: 'Cr', amount: 9000000 },
        ],
        note: 'The debits add up to ₹90,000, the credit to Gauri for the 3/10 sacrificed.',
      },
      {
        type: 'working',
        title: 'Worked example 3: hidden goodwill',
        lines: [
          'Jatin and Kavita share profits 3:2; their capitals after every adjustment are ₹3,00,000 and ₹2,00,000. Lokesh brings ₹2,00,000 as capital for 1/4 share and nothing for goodwill.',
          'Lokesh\'s capital implies a firm worth ₹2,00,000 x 4 = ₹8,00,000.',
          'The capital actually there, Lokesh\'s included: ₹3,00,000 + ₹2,00,000 + ₹2,00,000 = ₹7,00,000.',
          'Hidden goodwill = ₹8,00,000 - ₹7,00,000 = ₹1,00,000. Lokesh\'s share = ₹1,00,000 x 1/4 = ₹25,000.',
          'Lokesh\'s Capital (or Current) A/c is debited with ₹25,000; Jatin and Kavita, who give up the share in their old ratio, are credited ₹15,000 and ₹10,000.',
        ],
        note: 'Watch out: the new partner\'s own capital is part of the capital actually there. Leaving it out would give ₹3,00,000 of goodwill.',
      },
      {
        type: 'working',
        title: 'Worked example 4: old partners\' capitals on the basis of the new partner\'s capital',
        lines: [
          'Meera and Naveen share 3:2 and admit Pooja for 1/4, keeping their own ratio: the new ratio is 9:6:5. Pooja brings ₹1,50,000.',
          'Total capital of the new firm = ₹1,50,000 x 4 = ₹6,00,000. Meera should have 9/20 = ₹2,70,000 and Naveen 6/20 = ₹1,80,000.',
          'After the adjustments Meera has ₹3,00,000 and Naveen ₹1,60,000.',
          'In cash: Meera withdraws ₹30,000 (Meera\'s Capital A/c Dr; To Bank A/c) and Naveen brings ₹20,000 (Bank A/c Dr; To Naveen\'s Capital A/c).',
          'Through current accounts instead: Meera\'s Capital A/c Dr; To Meera\'s Current A/c ₹30,000; Naveen\'s Current A/c Dr; To Naveen\'s Capital A/c ₹20,000.',
        ],
        note: 'Watch out: compare with the capitals after the reserve, revaluation and goodwill have been adjusted, not with the opening capitals.',
      },
      { type: 'check', questionId: qid(1) },
      { type: 'check', questionId: qid(3) },
    ],
  },
  cards: {
    title: 'Admission: Rules, Formulas and Entries',
    description: 'Recall the ratios, the goodwill entries and the rules for reserves, revaluation and capitals.',
    cardIds: cards.map((c) => c.id),
  },
  recognition: [
    {
      title: 'Ratios and Goodwill: Know the Rule',
      description: 'Recognise who sacrifices, who gets the premium and how goodwill is treated in each case.',
      questionIds: [2, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 39].map(qid),
    },
    {
      title: 'Revaluation, Reserves and Capitals: Know the Rule',
      description: 'Recognise what goes to the old partners in the old ratio and how the capitals are fixed.',
      questionIds: [26, 27, 28, 29, 30, 31, 32, 33, 34, 35, 36, 37, 38].map(qid),
    },
    {
      title: 'First Ratios, Amounts and Entries',
      description: 'Work out a new ratio, a sacrifice, a premium and the capital to bring, and pass the standard entries.',
      questionIds: [14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25].map(qid),
    },
  ],
  practice: [
    {
      title: 'New Ratio and Sacrifice: First Steps',
      description: 'The new ratio when the old partners keep their ratio, give up equally or one of them gives up; the sacrifice from two ratios.',
      templateIds: ['adm-new-ratio-old-ratio', 'adm-new-ratio-equal', 'adm-new-ratio-one', 'adm-sacrifice-old-new', 'adm-sacrifice-rule'],
      count: 8,
    },
    {
      title: 'Goodwill, Revaluation and Reserves: First Entries',
      description: 'The premium to bring, the entry for cash brought in, goodwill in the books, single revaluation entries, reserves and the total capital.',
      templateIds: [
        'adm-premium-amount', 'adm-je-premium-brought', 'adm-goodwill-treatment', 'adm-je-existing-goodwill', 'adm-je-revaluation-item',
        'adm-je-reserves', 'adm-reserve-share', 'adm-distribution-rule', 'adm-total-capital',
      ],
      count: 8,
    },
    {
      title: 'From Sacrifice to Premium (Guided)',
      description: 'Find what each old partner gives up, turn it into the sacrificing ratio, then share the premium in that ratio.',
      templateIds: ['adm-sacrifice-surrender', 'adm-premium-share', 'adm-je-premium-distribute'],
      count: 6,
      guided: true,
    },
    {
      title: 'New Ratio and Sacrificing Ratio in Every Case',
      description: 'A stated ratio, a fraction of a partner\'s own share, a new ratio agreed for what is left, and three old partners.',
      templateIds: ['adm-new-ratio-stated', 'adm-new-ratio-surrender', 'adm-new-ratio-remaining', 'adm-new-partner-share', 'adm-sacrifice-three', 'adm-sacrifice-surrender'],
      count: 8,
    },
    {
      title: 'Premium for Goodwill and Hidden Goodwill',
      description: 'Sharing the premium, withdrawing it, goodwill not brought in, hidden goodwill from the capitals and the bank balance.',
      templateIds: ['adm-premium-share', 'adm-je-premium-distribute', 'adm-je-premium-withdrawn', 'adm-je-goodwill-not-brought', 'adm-hidden-goodwill', 'adm-bank-balance'],
      count: 8,
    },
    {
      title: 'Revaluation, Reserves and Capitals',
      description: 'The result of revaluation and each partner\'s share, entries worked from percentages, and capitals in proportion.',
      templateIds: ['adm-revaluation-result', 'adm-revaluation-share', 'adm-je-revaluation-percent', 'adm-je-revaluation-transfer', 'adm-new-partner-capital', 'adm-old-partner-capital'],
      count: 8,
    },
    {
      title: 'Harder Goodwill and Reserve Problems',
      description: 'Premium partly brought in, an old partner who gains, goodwill in the books with a premium, net worth and reserves against a claim.',
      templateIds: ['adm-sacrifice-remaining', 'adm-je-goodwill-partly', 'adm-je-premium-gainer', 'adm-goodwill-existing-net', 'adm-hidden-goodwill-share', 'adm-reserve-claim'],
      count: 8,
    },
    {
      title: 'Capitals and the New Firm',
      description: 'Reserve, revaluation and goodwill together, capitals made proportionate with cash brought in or withdrawn, and the new balance sheet total.',
      templateIds: ['adm-capital-adjust-cash', 'adm-je-capital-adjust', 'adm-capital-after-all', 'adm-combined-new-capital', 'adm-balance-sheet-total'],
      count: 8,
    },
  ],
  mixed: { title: 'Mixed Practice: Admission of a Partner', description: 'Everything in this topic, shuffled the way an examination serves it.', count: 12 },
  challenge: { title: 'Challenge: Admission Mastery', description: 'The hardest questions in the topic, against the clock.', count: 8 },
  // "Pass the necessary journal entries": the entries of one admission, lettered. These levels come after every
  // other one and have ids of their own, so the ids of the levels above never move.
  sets: [
    {
      title: 'Pass the Entries for Goodwill',
      description: 'One admission, three to five entries: the capital and the premium brought in and shared in the sacrificing ratio, goodwill in the books written off, and a share of goodwill brought in part or not at all.',
      templateIds: ['adm-set-premium-cash', 'adm-set-goodwill-forms'],
      count: 2,
    },
    {
      title: 'Pass the Entries for Revaluation and a Whole Admission',
      description: 'An entry for every change in an asset or a liability and the transfer of the result; then a whole admission, from the reserves to the cash that brings each capital to the new ratio.',
      templateIds: ['adm-set-revaluation', 'adm-set-whole-admission'],
      count: 2,
    },
  ],
  // Accounts and a statement the student prepares. They come after the sets and have ids of their own.
  formats: [
    {
      title: 'Prepare the Revaluation Account',
      description: 'The Revaluation Account on an admission: from a list of changes, then with a provision, depreciation and new values to work out, ending in a profit or a loss shared by the old partners.',
      templateIds: ['adm-fmt-revaluation', 'adm-fmt-revaluation-worked'],
      count: 2,
    },
    {
      title: "Prepare the Partners' Capital Accounts",
      description: 'The capital accounts in columns, a column for each old partner and one for the new: reserves, revaluation, goodwill written off, the premium and the capital brought in; then the capitals adjusted to the new ratio in cash or through the current accounts.',
      templateIds: ['adm-fmt-capitals', 'adm-fmt-capitals-adjusted'],
      count: 2,
    },
    {
      title: 'Prepare the Balance Sheet of the New Firm',
      description: 'From the old balance sheet and the terms of the admission to the balance sheet of the new firm: every reserve shared out, every asset and liability at its new figure, and the capital of each partner.',
      templateIds: ['adm-fmt-balance-sheet'],
      count: 2,
    },
    // Added after the audit: an id of its own (admission-of-a-partner-formats-4), after the three above.
    {
      title: 'Fixed Capitals: Current Accounts and the Balance Sheet',
      description: 'With fixed capitals: the old partners\' current accounts in columns on the admission, and the balance sheet of the new firm with the capitals unchanged and the current accounts on the side their balances belong to.',
      templateIds: ['adm-fmt-current-accounts', 'adm-fmt-balance-sheet-fixed'],
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
        name: 'goodwill-from-profits',
        type: 'complex_practice',
        title: 'Goodwill Valued from Profits, and More Revaluation',
        description: 'Value the goodwill at a number of years\' purchase of the average normal profit or of the super profit, then the premium and its sharing; and an asset taken over by a partner, an asset not in the books, and a liability a partner pays.',
        generate: { templateIds: ['adm-premium-from-profits', 'adm-je-premium-from-profits', 'adm-je-revaluation-more'], count: 6 },
      },
      {
        name: 'assertion-reason',
        type: 'medium_practice',
        title: 'Assertion and Reason',
        description: 'The one-mark question of the board: judge the Assertion, judge the Reason, and say whether the Reason explains the Assertion.',
        generate: { templateIds: ['adm-assertion-reason'], count: 6 },
      },
    ]),
  ],
  questions,
};

export default pack;
