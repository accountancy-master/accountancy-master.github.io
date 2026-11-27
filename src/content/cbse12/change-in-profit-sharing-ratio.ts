import { buildLadder, laterLevels } from '../ladder';
import type { Card, Concept, Difficulty, JournalQuestion, McqQuestion, NumericQuestion, Question, RatioQuestion, TopicPack, TrueFalseQuestion } from '../types';
import { partnerCapital } from '@/engine/accounts';
import type { JournalLine } from '@/engine/journal';

const T = 'change-in-profit-sharing-ratio';

const concepts: Concept[] = [
  { id: 'cpr-meaning', topicId: T, title: 'Reconstitution: what a change in the ratio means' },
  { id: 'cpr-ratio', topicId: T, title: 'Sacrificing ratio and gaining ratio' },
  { id: 'cpr-goodwill', topicId: T, title: 'Goodwill on a change in the ratio' },
  { id: 'cpr-reserves', topicId: T, title: 'Reserves, accumulated profits and losses' },
  { id: 'cpr-revaluation', topicId: T, title: 'Revaluation of assets and reassessment of liabilities' },
  { id: 'cpr-single-entry', topicId: T, title: 'One adjusting entry when balances are left as they are' },
  { id: 'cpr-capitals', topicId: T, title: 'Capitals and the Balance Sheet after the change' },
  { id: 'cpr-sets', topicId: T, title: 'Passing the entries on a change in the ratio' },
  { id: 'cpr-formats', topicId: T, title: 'Preparing the Revaluation Account, the capital accounts and the Balance Sheet' },
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
): Card => ({ id: `cpr-card-${n}`, topicId: T, conceptId, kind, prompt, answer, explanation, example, commonMistake });

const cards: Card[] = [
  card(1, 'cpr-meaning', 'rule', 'What happens to a firm when the existing partners change their profit-sharing ratio?',
    'The firm is reconstituted: the old agreement ends and a new one begins, but the firm, its business and its books go on.',
    'Any change in the relations among the partners is a reconstitution. Nobody joins or leaves here, so only the rights of the same partners change.',
    'Asha, Bina and Charu shared profits as 5:3:2 and decide to share equally from 1 April. The firm continues; only the agreement is new.',
    'Calling it a dissolution of the firm. The firm is not closed down; only the partnership agreement changes.'),
  card(2, 'cpr-meaning', 'rule', 'Which matters are adjusted when the ratio changes?',
    '1) Sacrifice and gain of each partner. 2) Goodwill. 3) Reserves and accumulated profits or losses. 4) Revaluation of assets and reassessment of liabilities. 5) Capitals, if they are to follow the new ratio.',
    'Everything the firm built up before the change was earned under the old ratio, so it has to be settled among the partners before the new ratio starts to apply.',
    'A firm with goodwill, a General Reserve and a building worth more than its book value settles all three on the date of the change.',
    'Changing the ratio and nothing else, so that a partner who gains gets a bigger share of past profits and of goodwill without paying for it.'),
  card(3, 'cpr-ratio', 'formula', 'How are the share sacrificed and the share gained worked out?',
    'Share sacrificed = old share - new share. Share gained = new share - old share.',
    'Both ratios are first turned into shares of the whole profit with one common denominator. A positive old share less new share is a sacrifice; a negative one is a gain.',
    'Old 5:3:2, new 2:3:5. A: 5/10 - 2/10 = 3/10 sacrificed. B: 3/10 - 3/10 = nil. C: 5/10 - 2/10 = 3/10 gained.',
    'Subtracting the terms of two ratios that add up to different totals (5:3:2 and 1:1:1) without first bringing them to a common denominator.'),
  card(4, 'cpr-ratio', 'shortcut', 'How do you check a sacrifice and gain working?',
    'The total of the shares sacrificed must equal the total of the shares gained.',
    'The whole profit is still shared out, so what one partner gives up some other partner receives.',
    'Old 5:3:2, new 1:1:1. A sacrifices 5/30; B gains 1/30 and C gains 4/30. 5/30 = 1/30 + 4/30.',
    'Accepting a working in which the sacrifices and the gains do not agree.'),
  card(5, 'cpr-ratio', 'rule', 'What are the sacrificing ratio and the gaining ratio?',
    'Sacrificing ratio: the ratio of the shares given up by the partners who sacrifice. Gaining ratio: the ratio of the shares acquired by the partners who gain.',
    'A partner whose share is the same before and after neither gains nor sacrifices and is in neither ratio.',
    'Old 5:3:2, new 3:2:5 (out of 10). A sacrifices 2/10 and B sacrifices 1/10, so their sacrificing ratio is 2:1; C alone gains 3/10. With old 4:3:3 and new 2:5:3, C stays at 3/10 and is in neither ratio.',
    'Giving the old ratio or the new ratio of the partners as their sacrificing ratio.'),
  card(6, 'cpr-goodwill', 'rule', 'How is goodwill treated when the ratio changes?',
    "The gaining partner compensates the sacrificing partner with goodwill of the firm x share gained: Gaining Partner's Capital A/c Dr; To Sacrificing Partner's Capital A/c.",
    'Goodwill was built up under the old ratio. A partner who takes a bigger share of future profits is buying a part of it from the partner who gives the share up. No Goodwill A/c is opened (AS 26).',
    "Goodwill ₹3,00,000; C gains 2/10 from A. C's Capital A/c Dr 60,000; To A's Capital A/c 60,000.",
    'Debiting Goodwill A/c with the full value and crediting all the partners, which shows self-generated goodwill as an asset.'),
  card(7, 'cpr-goodwill', 'rule', 'What if Goodwill already appears in the Balance Sheet?',
    "It is first written off among all the partners in the old ratio: All Partners' Capital A/cs Dr; To Goodwill A/c. Then the goodwill of the firm is adjusted between the gaining and the sacrificing partners.",
    'Only purchased goodwill may stand in the books, and on reconstitution the existing balance is removed. Every partner bears it, including one whose share does not change.',
    "Goodwill ₹60,000 in the books; old ratio 3:2:1. A's Capital Dr 30,000, B's Capital Dr 20,000, C's Capital Dr 10,000; To Goodwill A/c 60,000.",
    'Writing the old goodwill off in the new ratio, or leaving it in the books and adjusting only the difference.'),
  card(8, 'cpr-reserves', 'rule', 'How are reserves and accumulated profits dealt with on a change in the ratio?',
    "They are credited to the partners in the old ratio: General Reserve A/c Dr (or Profit and Loss A/c Dr); To Partners' Capital A/cs.",
    'They are profits earned and kept back while the old ratio was in force, so they belong to the partners in that ratio.',
    "General Reserve ₹90,000; old ratio 5:3:1. Credited: A ₹50,000, B ₹30,000, C ₹10,000.",
    'Distributing a reserve in the new ratio.'),
  card(9, 'cpr-reserves', 'rule', 'How are accumulated losses and fictitious assets dealt with?',
    "They are debited to the partners in the old ratio: Partners' Capital A/cs Dr; To Profit and Loss A/c (debit balance), Advertisement Suspense A/c or Deferred Revenue Expenditure A/c.",
    'A debit balance of Profit and Loss A/c is a past loss, and advertisement suspense or deferred revenue expenditure is an expense not yet written off. Neither is a real asset.',
    "Advertisement Suspense ₹30,000; old ratio 2:1. A's Capital Dr 20,000; B's Capital Dr 10,000; To Advertisement Suspense A/c 30,000.",
    'Crediting the partners with a debit balance, or leaving a fictitious asset untouched as if it were a real asset.'),
  card(10, 'cpr-reserves', 'rule', 'How is a Workmen Compensation Reserve treated?',
    'No claim: the whole reserve is credited to the partners in the old ratio. Claim less than the reserve: the claim goes to Workmen Compensation Claim A/c and the rest to the partners. Claim more than the reserve: the whole reserve meets the claim and the shortfall is debited to Revaluation A/c.',
    'The reserve was kept for one purpose. Only what is not needed for that purpose is a free reserve. The claim admitted is a liability; many books name its account Provision for Workmen Compensation Claim A/c.',
    'Reserve ₹80,000, claim ₹50,000: Workmen Compensation Reserve A/c Dr 80,000; To Workmen Compensation Claim A/c 50,000; To Partners\' Capital A/cs 30,000 (old ratio).',
    'Distributing the whole reserve although a claim has been admitted against it.'),
  card(11, 'cpr-reserves', 'rule', 'How is an Investment Fluctuation Reserve treated?',
    'Market value equal to or above book value: the whole reserve is credited to the partners in the old ratio. Fall in value less than the reserve: the fall is set against the reserve and the rest goes to the partners. Fall more than the reserve: the reserve is used up and the rest of the fall is debited to Revaluation A/c.',
    'The reserve exists to absorb a fall in the value of investments, so the fall is met from it before anything is distributed. A rise above book value does not touch the reserve: if the investments are to be shown at market value, the rise is a gain credited to Revaluation A/c.',
    'Investments ₹2,00,000 (market value ₹1,90,000), reserve ₹30,000: fall ₹10,000; ₹20,000 is credited to the partners in the old ratio.',
    'Debiting the fall in value to Revaluation A/c although the reserve is large enough to cover it.'),
  card(12, 'cpr-revaluation', 'format', 'What goes on each side of Revaluation A/c?',
    'Debit: decrease in the value of an asset, increase in a liability or provision, an unrecorded liability. Credit: increase in the value of an asset, decrease in a liability, an unrecorded asset. A credit balance is a profit; a debit balance is a loss.',
    'Revaluation A/c is a nominal account that collects the gains and losses of bringing assets and liabilities to their agreed values.',
    'Building up ₹50,000 (credit); stock down ₹8,000 and outstanding salaries ₹2,000 (debit): profit on revaluation ₹40,000.',
    'Putting an increase in a liability or in a provision, such as a bigger provision for doubtful debts, on the credit side.'),
  card(13, 'cpr-revaluation', 'rule', 'Who gets the profit or loss on revaluation, and by which entry?',
    "The partners, in the old ratio. Profit: Revaluation A/c Dr; To Partners' Capital A/cs. Loss: Partners' Capital A/cs Dr; To Revaluation A/c.",
    'The change in the values took place while the old ratio was in force, even though it is recorded on the date of the change.',
    'Profit on revaluation ₹40,000; old ratio 3:1. Revaluation A/c Dr 40,000; To A\'s Capital 30,000; To B\'s Capital 10,000.',
    'Sharing the profit on revaluation in the new ratio because the revaluation is done when the new ratio is agreed.'),
  card(14, 'cpr-single-entry', 'formula', 'What is the single adjusting entry when reserves and values are left as they are in the books?',
    "Net effect = reserves + accumulated profits + gain on revaluation - accumulated losses - loss on revaluation. Amount = net effect x share gained. Gaining Partner's Capital A/c Dr; To Sacrificing Partner's Capital A/c. For a net loss the entry is reversed.",
    'What stays in the books will be shared in the new ratio later. The partner who gains would get more of it than before, so that partner pays the one who sacrifices now.',
    "General Reserve ₹80,000 and Profit and Loss (Dr) ₹20,000 are left in the books; C gains 1/10 from A. Net ₹60,000 x 1/10 = ₹6,000: C's Capital A/c Dr; To A's Capital A/c.",
    'Using the old share or the new share of a partner in place of the share gained or sacrificed.'),
  card(15, 'cpr-capitals', 'formula', 'How is a capital found after all the adjustments?',
    'Capital after adjustments = old capital + share of reserves and profits + share of profit on revaluation + goodwill received - share of losses - share of loss on revaluation - goodwill paid - share of goodwill written off.',
    'Each adjustment is a credit or a debit in the capital account (in the current account when capitals are fixed).',
    'Capital ₹2,00,000; share of General Reserve ₹30,000; share of loss on revaluation ₹6,000; goodwill paid ₹20,000: ₹2,04,000.',
    'Forgetting that the goodwill compensation is a debit for the partner who gains and a credit for the partner who sacrifices.'),
  card(16, 'cpr-capitals', 'formula', 'How are capitals brought to the new profit-sharing ratio?',
    "New capital of a partner = total capital of the firm x the partner's new share. A partner with a shortfall brings in cash (or it is debited to the current account); a partner with an excess is paid back (or it is credited to the current account).",
    'The total capital is the total of the capitals after all the adjustments, unless the partners fix another total.',
    'Capitals after adjustments ₹3,00,000, ₹2,20,000 and ₹1,40,000 (total ₹6,60,000); new ratio 3:2:1: ₹3,30,000, ₹2,20,000 and ₹1,10,000. A brings in ₹30,000 and C is paid back ₹30,000.',
    'Dividing the total capital in the old ratio, or giving the new capital when the cash to be brought in is asked.'),
  card(17, 'cpr-capitals', 'rule', 'What does the Balance Sheet show after the change?',
    'Assets and liabilities at their revised values, no Goodwill A/c, no reserves or accumulated profits or losses that were distributed, and the capitals after all the adjustments.',
    'Distributing a reserve or adjusting goodwill through the capitals only moves amounts within the liabilities side. The total changes only when an asset is revalued, brought in or written off.',
    'A reserve of ₹60,000 is distributed and a building is appreciated by ₹40,000: the total of the Balance Sheet rises by ₹40,000 only.',
    'Showing goodwill at its new value among the assets, or keeping a reserve that has been distributed.'),
];

// ---------------------------------------------------------------------------------------------------------------
// Authored questions
// ---------------------------------------------------------------------------------------------------------------

const qid = (n: number): string => `cpr-q-${String(n).padStart(3, '0')}`;

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

const AR = {
  both: 'Both A and R are true, and R is the correct explanation of A',
  notWhy: 'Both A and R are true, but R is not the correct explanation of A',
  onlyA: 'A is true but R is false',
  onlyR: 'A is false but R is true',
};

const questions: Question[] = [
  // ---- Meaning, sacrifice and gain, goodwill (recognition) ----
  mcq(1, 'cpr-meaning', 'easy', 'The existing partners of a firm agree to share future profits in a new ratio. Nobody joins or leaves. What is this called?',
    'Reconstitution of the firm',
    [
      ['Dissolution of the firm', 'Thought the firm comes to an end. The business and the firm continue; only the agreement among the partners changes.'],
      ['Admission of a partner', 'Picked a change in which a new person joins. Here the partners are the same.'],
      ['Revaluation of the firm', 'Mixed up the event with one of its adjustments. Revaluation of assets is a step taken on reconstitution, not its name.'],
    ],
    'Any change in the agreement among the partners reconstitutes the firm. A change in the profit-sharing ratio among the same partners is one such change.',
    ['Does the firm stop doing business?', 'The old agreement ends and a new one takes its place.']),
  tf(2, 'cpr-meaning', 'easy', 'When partners change their profit-sharing ratio, the firm is dissolved and its assets have to be sold.', false,
    'The firm is only reconstituted. It carries on the same business with the same assets and the same partners under a new agreement.',
    ['What actually changes: the business, or the agreement?']),
  mcq(3, 'cpr-ratio', 'easy', 'The share of profit sacrificed by a partner on a change in the ratio is:',
    'Old share - New share',
    [
      ['New share - Old share', 'Gave the formula for the share gained.'],
      ['Old share + New share', 'Added the two shares; a sacrifice is the fall from the old share to the new share.'],
      ['Old share x New share', 'Multiplied the shares; a sacrifice is a difference of shares.'],
    ],
    'A partner sacrifices when the new share is smaller than the old share: sacrifice = old share - new share.',
    ['A sacrifice means the share has become smaller.']),
  mcq(4, 'cpr-ratio', 'easy', 'Ritu and Sahil share profits as 3:1. They decide to share equally. What is the effect on Ritu?',
    'Ritu sacrifices 1/4 of the profit',
    [
      ['Ritu sacrifices 1/2 of the profit', 'Gave the new share (or subtracted the terms 3 and 1 over 4) in place of old share less new share.'],
      ['Ritu gains 1/4 of the profit', 'Read the change the wrong way round: the share falls from 3/4 to 1/2, which is a sacrifice.'],
      ['Ritu sacrifices 3/4 of the profit', 'Gave the old share itself, not the fall in the share.'],
    ],
    'Old share 3/4, new share 1/2 = 2/4. Sacrifice = 3/4 - 2/4 = 1/4. Sahil gains the same 1/4.',
    ['Write both shares over the same denominator.']),
  tf(5, 'cpr-ratio', 'easy', 'On a change in the profit-sharing ratio, the total of the shares sacrificed is always equal to the total of the shares gained.', true,
    'The whole profit is still divided among the same partners, so whatever some partners give up the others receive.',
    ['Do the new shares still add up to one whole?']),
  mcq(6, 'cpr-ratio', 'easy', "Kiran's share of profit is 2/5 before a change in the ratio and 2/5 after it. Which statement is correct?",
    'Kiran neither gains nor sacrifices and takes no part in the goodwill compensation',
    [
      ['Kiran sacrifices 2/5 of the profit', 'Gave the share itself as the sacrifice; the share has not changed.'],
      ['Kiran gains 2/5 of the profit', 'Gave the share itself as the gain; the share has not changed.'],
      ['Kiran pays compensation to every other partner', 'Thought every partner pays on a change; only a partner who gains pays.'],
    ],
    'Old share less new share is nil, so Kiran neither gains nor sacrifices and neither pays nor receives compensation for goodwill.',
    ['Old share - new share = ?']),
  mcq(7, 'cpr-goodwill', 'medium', 'Why does a partner who gains on a change in the ratio compensate the partner who sacrifices?',
    'The gaining partner gets a bigger share of future profits, which come partly from the goodwill built up under the old ratio',
    [
      ['The gaining partner has the larger capital in the firm', 'Linked the compensation to capital. It depends on the share of profit that changes hands, not on capital.'],
      ['The Partnership Act requires all partners to share profits equally', 'Brought in the rule for a firm without a deed. Partners may share in any ratio they agree.'],
      ['The sacrificing partner is leaving the firm', 'Mixed up the change with retirement. Nobody leaves the firm here.'],
    ],
    'Goodwill is the value of the profits the firm is expected to earn because of its past. A partner who takes over a part of another partner\'s share buys that part of the goodwill.',
    ['What does the gaining partner receive from the change?']),
  mcq(8, 'cpr-goodwill', 'easy', 'On a change in the ratio, goodwill is adjusted through the capital accounts. Which entry is passed?',
    "Gaining Partner's Capital A/c Dr; To Sacrificing Partner's Capital A/c",
    [
      ["Sacrificing Partner's Capital A/c Dr; To Gaining Partner's Capital A/c", 'Reversed the entry: the partner who gains pays, and the partner who sacrifices receives.'],
      ["Goodwill A/c Dr; To All Partners' Capital A/cs", 'Raised goodwill in the books; self-generated goodwill is not recorded as an asset (AS 26).'],
      ['Cash A/c Dr; To Premium for Goodwill A/c', 'Used the entry for a new partner who brings in goodwill in cash; no one is admitted here.'],
    ],
    'The gaining partner is debited and the sacrificing partner credited with goodwill of the firm x the share gained.',
    ['Who pays whom?']),
  tf(9, 'cpr-goodwill', 'medium', 'Goodwill valued on a change in the profit-sharing ratio is debited to Goodwill A/c and shown as an asset in the Balance Sheet of the reconstituted firm.', false,
    'Under AS 26 only purchased goodwill is recorded. Goodwill valued on reconstitution is adjusted between the partners through their capital accounts and no Goodwill A/c is opened.',
    ['Was this goodwill bought, or built up by the firm itself?']),
  mcq(10, 'cpr-goodwill', 'medium', 'Uma, Varun and Wasim share profits as 3:2:1 and decide to share equally. Goodwill stands in the books at ₹60,000. How is this book goodwill dealt with?',
    'Written off in the old ratio: Uma ₹30,000, Varun ₹20,000 and Wasim ₹10,000',
    [
      ['Written off in the new ratio: ₹20,000 each', 'Used the new ratio; goodwill already in the books is written off in the old ratio.'],
      ['Written off against Uma alone, ₹60,000, as Uma is the only partner who sacrifices', 'Confined the write-off to the partner who sacrifices; every partner bears it in the old ratio.'],
      ['Left in the books at ₹60,000', 'Kept the old goodwill; on reconstitution the goodwill in the books is written off.'],
    ],
    'Existing goodwill is written off among all the partners in the old ratio 3:2:1: ₹30,000, ₹20,000 and ₹10,000.',
    ['Which ratio was in force while this goodwill stood in the books?']),

  // ---- Reserves, revaluation, the adjusting entry (recognition) ----
  mcq(11, 'cpr-reserves', 'easy', 'On a change in the profit-sharing ratio, a General Reserve appearing in the Balance Sheet is, unless agreed otherwise:',
    "Credited to the partners' capital accounts in the old ratio",
    [
      ["Credited to the partners' capital accounts in the new ratio", 'Used the new ratio; the reserve was built out of profits earned under the old ratio.'],
      ["Debited to the partners' capital accounts in the old ratio", 'Treated a reserve as a loss; it is undistributed profit and is credited.'],
      ['Credited to Revaluation A/c', 'Mixed up a reserve with a change in the value of an asset or a liability.'],
    ],
    'A reserve is profit kept back in earlier years. It belongs to the partners in the ratio in which those profits were shared: the old ratio.',
    ['When was the reserve created: before or after the change?']),
  mcq(12, 'cpr-reserves', 'easy', "Which of these is debited to the partners' capital accounts in the old ratio on a change in the ratio?",
    'Advertisement Suspense A/c',
    [
      ['General Reserve', 'Picked a reserve, which is undistributed profit and is credited to the partners.'],
      ['Profit and Loss A/c (credit balance)', 'Picked an undistributed profit, which is credited to the partners.'],
      ['Workmen Compensation Reserve with no claim against it', 'Picked a free reserve, which is credited to the partners.'],
    ],
    'Advertisement Suspense is an expense not yet written off (a fictitious asset). It is a loss of the partners and is debited to them in the old ratio.',
    ['Which one is a loss or an expense not yet written off?']),
  mcq(13, 'cpr-reserves', 'medium', 'On the date of a change in the ratio a firm has a Workmen Compensation Reserve of ₹80,000 and admits a claim of ₹50,000. What is done?',
    '₹50,000 is transferred to Workmen Compensation Claim A/c and ₹30,000 is credited to the partners in the old ratio',
    [
      ['The whole ₹80,000 is credited to the partners in the old ratio', 'Ignored the claim, which has to be met out of the reserve first.'],
      ['₹50,000 is credited to the partners in the old ratio and ₹30,000 is kept as a claim', 'Swapped the two amounts: the claim is ₹50,000 and the free part is ₹30,000.'],
      ['₹50,000 is debited to Revaluation A/c and ₹80,000 is credited to the partners', 'Charged the claim to Revaluation A/c although the reserve is large enough to meet it.'],
    ],
    'The reserve first meets the claim of ₹50,000 (a liability). The remaining ₹30,000 is a free reserve and goes to the partners in the old ratio.',
    ['What was the reserve kept for?']),
  mcq(14, 'cpr-reserves', 'medium', 'A firm has a Workmen Compensation Reserve of ₹40,000. On the change in the ratio a claim of ₹55,000 is admitted. How is the ₹15,000 not covered by the reserve treated?',
    'It is debited to Revaluation A/c',
    [
      ['It is debited to Profit and Loss Appropriation A/c', "Used the account that distributes the year's profit; a loss on reconstitution goes to Revaluation A/c."],
      ['It is ignored, because the reserve has been used up', 'Left out a liability that the firm has admitted.'],
      ["It is debited to the partners' capital accounts in the new ratio", 'Used the new ratio; the shortfall is a loss of the period before the change, shared in the old ratio through Revaluation A/c.'],
    ],
    'The whole reserve is used for the claim. The shortfall of ₹15,000 is a loss: it is debited to Revaluation A/c and so borne by the partners in the old ratio.',
    ['A liability has gone up by more than the reserve kept for it.']),
  mcq(15, 'cpr-reserves', 'medium', 'Investments stand in the books at ₹2,00,000 and their market value is ₹1,90,000. The Investment Fluctuation Reserve is ₹30,000. How much of the reserve is credited to the partners in the old ratio?',
    '₹20,000',
    [
      ['₹30,000', 'Distributed the whole reserve and ignored the fall of ₹10,000 in the value of the investments.'],
      ['₹10,000', 'Gave the fall in value; it is the rest of the reserve that goes to the partners.'],
      ['Nil', 'Thought the reserve cannot be distributed at all; the part not needed for the fall is free.'],
    ],
    'Fall in value = ₹2,00,000 - ₹1,90,000 = ₹10,000, met out of the reserve. The remaining ₹20,000 is credited to the partners in the old ratio.',
    ['How much of the reserve is needed for the fall in value?']),
  tf(16, 'cpr-reserves', 'medium', 'If the market value of the investments is equal to their book value, the whole Investment Fluctuation Reserve is credited to the partners in the old ratio.', true,
    'Nothing has to be met out of the reserve, so all of it is a free reserve and belongs to the partners in the old ratio.',
    ['Is there any fall in value for the reserve to absorb?']),
  mcq(17, 'cpr-revaluation', 'easy', 'Which of these is debited to Revaluation A/c?',
    'A decrease in the value of stock',
    [
      ['An increase in the value of a building', 'Picked a gain; an asset going up is credited to Revaluation A/c.'],
      ['Creditors written back as no longer payable', 'Picked a gain; a liability going down is credited to Revaluation A/c.'],
      ['Investments not recorded in the books so far', 'Picked a gain; an unrecorded asset is credited to Revaluation A/c.'],
    ],
    'A fall in the value of an asset is a loss, and losses are debited to Revaluation A/c.',
    ['Which one makes the firm worse off?']),
  mcq(18, 'cpr-revaluation', 'easy', 'The profit on revaluation of assets and liabilities on a change in the ratio is transferred to the capital accounts of:',
    'All the partners in the old ratio',
    [
      ['All the partners in the new ratio', 'Used the new ratio; the rise in values took place before the change.'],
      ['The sacrificing partners in the sacrificing ratio', 'Used the rule for goodwill compensation.'],
      ['The gaining partners in the gaining ratio', 'Used the gaining ratio, which only decides who pays for goodwill.'],
    ],
    'The values changed while the old ratio was in force, so the profit (or loss) is shared in the old ratio.',
    ['When did the assets rise in value?']),
  tf(19, 'cpr-revaluation', 'easy', 'A liability that was not recorded in the books and is brought in on a change in the ratio is credited to Revaluation A/c.', false,
    'An unrecorded liability is a loss to the firm. Revaluation A/c is debited and the liability is credited.',
    ['Is the firm better off or worse off for it?']),
  mcq(20, 'cpr-revaluation', 'medium', 'Revaluation A/c is:',
    'A nominal account',
    [
      ['A real account', 'Took it for an asset account; it holds gains and losses, not an asset.'],
      ['A personal account', 'Took it for the account of a person; the result goes to the partners but the account itself records gains and losses.'],
      ['A liability account', 'Took it for something owed; it is closed as soon as its balance is transferred to the partners.'],
    ],
    'It records the gains and losses on revaluing assets and reassessing liabilities, so it is a nominal account, closed by transfer to the partners.',
    ['What does the account collect?']),
  mcq(21, 'cpr-reserves', 'medium', 'Assertion (A): Reserves appearing in the Balance Sheet on the date of a change in the ratio are distributed in the old ratio. Reason (R): They are profits earned and set aside while the old ratio was in force.',
    AR.both,
    [
      [AR.notWhy, 'Missed the link: the reserves belong to the old ratio exactly because they were earned under it.'],
      [AR.onlyA, 'Denied the reason; a reserve is created out of the profits of earlier years.'],
      [AR.onlyR, 'Denied the assertion; reserves are distributed in the old ratio unless the partners agree to keep them.'],
    ],
    'Both statements are true, and the reason is why the old ratio is used.',
    ['Out of whose profits was the reserve made?']),
  mcq(22, 'cpr-single-entry', 'medium', 'Assertion (A): When the partners decide to keep a General Reserve in the books on a change in the ratio, the gaining partner is debited and the sacrificing partner is credited with the reserve x the share gained. Reason (R): When the reserve is distributed later it will be shared in the new ratio, which gives the gaining partner more of it than before.',
    AR.both,
    [
      [AR.notWhy, 'Missed the link: the entry is passed because the gaining partner will later get a bigger part of the reserve.'],
      [AR.onlyA, 'Denied the reason; a balance left in the books is shared in the ratio in force when it is distributed.'],
      [AR.onlyR, 'Denied the assertion; this single adjusting entry is the accepted treatment when the reserve is not distributed.'],
    ],
    'Both statements are true and the reason explains the entry.',
    ['In which ratio will the reserve be shared if it is distributed next year?']),
  mcq(23, 'cpr-single-entry', 'complex', 'Gita and Hari share profits equally and decide to share as 3:2. The Balance Sheet shows a debit balance of ₹60,000 in Profit and Loss A/c, which the partners decide to leave in the books. Capitals are fluctuating. Which adjusting entry is passed?',
    "Hari's Capital A/c Dr ₹6,000; To Gita's Capital A/c ₹6,000",
    [
      ["Gita's Capital A/c Dr ₹6,000; To Hari's Capital A/c ₹6,000", 'Applied the rule for a reserve. A loss is left in the books here, so the entry is reversed: the gaining partner is credited.'],
      ["Gita's Capital A/c Dr ₹36,000; To Hari's Capital A/c ₹36,000", "Used Gita's new share of 3/5 in place of the share gained, and debited the gaining partner."],
      ["Hari's Capital A/c Dr ₹30,000; To Gita's Capital A/c ₹30,000", "Used Hari's old share of 1/2 in place of the share sacrificed."],
    ],
    'Gita gains 3/5 - 1/2 = 1/10 and will bear 1/10 more of the loss later. So Hari, who sacrifices, pays Gita now: ₹60,000 x 1/10 = ₹6,000.',
    ['Is the balance left in the books a profit or a loss?', 'Who will bear a larger part of it in future?']),

  // ---- Short sums and entries ----
  num(24, 'cpr-goodwill', 'medium', 'Anu, Bala and Chitra share profits as 5:3:2. From 1 April they will share as 2:3:5. Goodwill of the firm is valued at ₹2,00,000 and is adjusted through the capital accounts without opening a Goodwill A/c. By how much is Chitra\'s Capital A/c debited?', 60000,
    [[100000, "Multiplied the goodwill by Chitra's new share of 5/10, not by the share gained."], [40000, "Multiplied the goodwill by Chitra's old share of 2/10, not by the share gained."], [200000, 'Took the whole goodwill of the firm.']],
    ['Chitra: new share 5/10 - old share 2/10 = 3/10 gained.', 'Goodwill x share gained = ₹2,00,000 x 3/10 = ₹60,000, debited to Chitra and credited to Anu, who sacrifices 3/10.'],
    ['Find the share Chitra gains first.', 'Compensation = goodwill x share gained.']),
  rat(25, 'cpr-ratio', 'medium', 'Dev, Ela and Farid share profits as 5:3:2 and decide to share equally. Find the gaining ratio of Ela and Farid.', [1, 4],
    [[[3, 2], 'Gave the old ratio of Ela and Farid, not the ratio of what each gains.'], [[4, 1], 'Wrote the terms in the wrong order: Ela is named first.'], [[2, 1], 'Subtracted the new terms from the old ones as they stand (3 - 1 and 2 - 1), with no common denominator; that is a sacrifice worked on unlike shares, not a gain.'], [[1, 1], 'Gave the new ratio of Ela and Farid, not the ratio of what each gains.']],
    ['Old shares 15/30, 9/30 and 6/30; new shares 10/30 each.', 'Ela gains 10/30 - 9/30 = 1/30; Farid gains 10/30 - 6/30 = 4/30; Dev sacrifices 5/30.', 'Gaining ratio of Ela and Farid = 1:4.'],
    ['Use 30 as the common denominator.', 'Gain = new share - old share.']),
  num(26, 'cpr-single-entry', 'medium', 'Xavier and Yash share profits as 3:2 and decide to share equally. A General Reserve of ₹90,000 is to stay in the books, and one adjusting entry is passed through the capital accounts. With how much is Xavier\'s Capital A/c credited?', 9000,
    [[54000, "Gave Xavier's share of the reserve in the old ratio, as if it were distributed."], [45000, "Multiplied the reserve by Xavier's new share of 1/2."], [90000, 'Took the whole reserve.']],
    ['Xavier: old share 3/5 - new share 1/2 = 1/10 sacrificed.', 'Reserve x share sacrificed = ₹90,000 x 1/10 = ₹9,000: Yash, who gains, is debited and Xavier is credited.'],
    ['The reserve is not distributed, so only the share that moves matters.']),
  jr(27, 'cpr-goodwill', 'easy', 'Meena and Nitin share profits as 3:2 and decide to share equally. Goodwill of the firm is valued at ₹1,00,000. No Goodwill A/c is to be opened and the capitals are fluctuating. Pass the journal entry for goodwill.',
    [[partnerCapital('Nitin'), 'Dr', 10000], [partnerCapital('Meena'), 'Cr', 10000]], ['goodwill', 'premiumForGoodwill'],
    'Meena sacrifices 3/5 - 1/2 = 1/10 and Nitin gains 1/10. Nitin pays ₹1,00,000 x 1/10 = ₹10,000: Nitin\'s Capital A/c is debited and Meena\'s Capital A/c is credited.',
    ['Who gains and who sacrifices?', 'The gaining partner is debited.']),
  jr(28, 'cpr-reserves', 'easy', 'Asha, Bina and Charu share profits as 3:2:1 and decide to share equally. The General Reserve of ₹60,000 is distributed before the change. The capitals are fluctuating. Pass the journal entry.',
    [['generalReserve', 'Dr', 60000], [partnerCapital('Asha'), 'Cr', 30000], [partnerCapital('Bina'), 'Cr', 20000], [partnerCapital('Charu'), 'Cr', 10000]], ['revaluation', 'profitAndLoss'],
    'The reserve belongs to the partners in the old ratio 3:2:1: ₹30,000, ₹20,000 and ₹10,000. General Reserve A/c is debited to close it and the capital accounts are credited.',
    ['Old ratio or new ratio?']),
  mcq(29, 'cpr-capitals', 'medium', 'The capitals of the partners are fixed. Through which accounts are the adjustments for goodwill, reserves and revaluation passed on a change in the ratio?',
    "The partners' current accounts",
    [
      ["The partners' capital accounts", 'Used the capital accounts; when capitals are fixed they change only when capital is brought in or withdrawn.'],
      ['Profit and Loss Appropriation A/c', "Used the account that distributes the year's profit."],
      ["The partners' loan accounts", 'Used loan accounts, which record money lent to the firm by a partner.'],
    ],
    'With fixed capitals every adjustment other than capital brought in or withdrawn goes through the current accounts.',
    ['Which account of a partner changes from year to year when capitals are fixed?']),
  num(30, 'cpr-capitals', 'medium', 'After all the adjustments on a change in the ratio, the capitals of Jay, Kamal and Leela are ₹3,00,000, ₹2,20,000 and ₹1,40,000. The total capital is to remain the same and be in the new profit-sharing ratio of 3:2:1, excess capital being paid back in cash. How much is paid back to Leela?', 30000,
    [[110000, 'Gave the capital Leela should have, not the excess to be paid back.'], [80000, 'Divided the total capital equally (₹2,20,000 each), which would make Leela bring in cash.']],
    ['Total capital = ₹3,00,000 + ₹2,20,000 + ₹1,40,000 = ₹6,60,000.', "Leela's capital in the new ratio = 1/6 of ₹6,60,000 = ₹1,10,000.", 'Excess = ₹1,40,000 - ₹1,10,000 = ₹30,000, paid back to Leela.'],
    ['Find the total capital, then Leela\'s share of it in the new ratio.']),
  mcq(31, 'cpr-capitals', 'complex', 'On a change in the ratio a firm distributes its General Reserve, adjusts goodwill through the capital accounts and appreciates its building by ₹50,000. Which description of the new Balance Sheet is correct?',
    'The building is shown ₹50,000 higher; there is no General Reserve and no Goodwill A/c',
    [
      ['The building is shown ₹50,000 higher; the General Reserve is still shown and Goodwill appears at its valued amount', 'Kept the reserve and raised goodwill; the reserve has gone to the capitals and goodwill is not recorded.'],
      ['The building is shown at its old value; the profit on revaluation is shown as a separate reserve', 'Left the asset at book value; the revised value is recorded and the profit goes to the capitals.'],
      ['The building is shown ₹50,000 higher and Goodwill appears at its valued amount; there is no General Reserve', 'Raised goodwill in the books; it is only adjusted between the partners.'],
    ],
    'Assets appear at revised values, the reserve has moved into the capitals, and goodwill adjusted through the capital accounts is not shown as an asset.',
    ['Which of the three adjustments changes an asset?']),
  tf(32, 'cpr-goodwill', 'medium', 'A partner whose share of profit does not change takes no part in the compensation for goodwill, but still bears a share of any goodwill written off from the books.', true,
    'Compensation passes only between the partners who gain and those who sacrifice. Goodwill already in the books is written off among all the partners in the old ratio.',
    ['Two different entries are involved.']),
  mcq(33, 'cpr-single-entry', 'medium', 'On a change in the ratio the assets are found to be worth ₹30,000 more than their book values, but the partners decide not to alter the book values. What is done?',
    'One adjusting entry: the gaining partner is debited and the sacrificing partner credited with ₹30,000 x the share gained',
    [
      ['Nothing, because the books are not being changed', 'Ignored the gain; the partner who gains would later get a bigger share of it without paying.'],
      ['Revaluation A/c is credited with ₹30,000 and the assets are debited', 'Recorded the new values in the books, which the partners decided not to do.'],
      ['The ₹30,000 is credited to all the partners in the new ratio', 'Used the new ratio and credited everyone; only the share that moves is adjusted between the two partners.'],
    ],
    'The gain belongs to the old ratio. Since the values stay as they are, its effect is settled between the partners by one entry for the share that changes hands.',
    ['Who would benefit later if nothing were done?']),
  mcq(34, 'cpr-reserves', 'easy', 'Deferred Revenue Expenditure appearing on the assets side on the date of a change in the ratio is:',
    'A fictitious asset, written off by debiting the partners in the old ratio',
    [
      ['A real asset, revalued through Revaluation A/c', 'Took it for an asset with a value; it is an expense not yet written off.'],
      ['A reserve, credited to the partners in the old ratio', 'Took a debit balance for a reserve.'],
      ['A liability, to be paid off before the change', 'Took it for something owed; nothing is payable.'],
    ],
    'It is an expense already incurred but not yet charged to profit: an accumulated loss, debited to the partners in the old ratio.',
    ['Could it be sold for cash?']),
  tf(35, 'cpr-revaluation', 'easy', 'The profit or loss on revaluation is shared in the new ratio, because the revaluation is recorded after the new ratio has been agreed.', false,
    'The change in values arose before the change in the ratio, so the profit or loss on revaluation goes to the partners in the old ratio.',
    ['When did the values change, and when was that recorded?']),
  mcq(36, 'cpr-meaning', 'medium', 'Partners who change their profit-sharing ratio make no adjustment for goodwill, reserves or revaluation. Who benefits unfairly?',
    'The partner who gains, who gets a bigger share of what was built up under the old ratio without paying for it',
    [
      ['The partner who sacrifices, who keeps the old share of past profits', 'Reversed the effect: without adjustment the sacrificing partner loses a part of what was earned under the old ratio.'],
      ['Nobody, because the total profit of the firm is unchanged', 'Looked at the firm as a whole; the question is how the partners share what already exists.'],
      ['The creditors of the firm', 'Brought in outsiders; the change affects only the partners among themselves.'],
    ],
    'Goodwill, reserves and unrecorded gains would all be shared in the new ratio later, so the gaining partner would take a part of them that belonged to the sacrificing partner.',
    ['In which ratio would an undistributed reserve be shared next year?']),
];

// ---------------------------------------------------------------------------------------------------------------
// Levels
// ---------------------------------------------------------------------------------------------------------------

const levels = buildLadder(T, {
  concept: {
    title: 'The Same Partners, a New Ratio',
    description: 'See who gains and who gives up a share when the ratio changes, and why that has to be paid for.',
    lesson: [
      {
        type: 'text',
        heading: 'Nobody joins, nobody leaves',
        body: 'Asha, Bina and Charu share profits as 5:3:2. Charu now does most of the work, so from 1 April they agree to share as 3:3:4. The firm goes on with the same business and the same books; only the agreement changes. This is a reconstitution of the firm. Put both ratios over 10: Asha goes from 5/10 to 3/10 and gives up 2/10 (a sacrifice). Charu goes from 2/10 to 4/10 and receives 2/10 (a gain). Bina stays at 3/10 and neither gains nor sacrifices. Sacrifice = old share - new share; gain = new share - old share; the two totals always agree.',
      },
      {
        type: 'text',
        heading: 'Why Charu has to pay Asha',
        body: 'The firm has a name customers trust, so it earns more than an ordinary firm. That goodwill was built while Asha had 5/10 of the profit. From 1 April a part of those profits goes to Charu instead. Charu is in effect buying 2/10 of the goodwill from Asha. If the goodwill of the firm is valued at ₹3,00,000, Charu pays ₹3,00,000 x 2/10 = ₹60,000. No Goodwill A/c is opened: the amount simply moves from Charu\'s capital to Asha\'s capital.',
      },
      {
        type: 'example',
        title: 'Goodwill ₹3,00,000; Charu gains 2/10 from Asha',
        lines: [
          { accountId: partnerCapital('Charu'), side: 'Dr', amount: 6000000 },
          { accountId: partnerCapital('Asha'), side: 'Cr', amount: 6000000 },
        ],
        note: 'The gaining partner is debited and the sacrificing partner is credited with goodwill x the share gained. Bina, whose share does not change, is not in the entry.',
      },
      {
        type: 'text',
        heading: 'What was earned before belongs to the old ratio',
        body: 'On 31 March the Balance Sheet shows a General Reserve of ₹1,00,000, and the building is worth ₹50,000 more than its book value. Both arose while the ratio was 5:3:2, so both go to the partners in the old ratio: the reserve is credited as ₹50,000, ₹30,000 and ₹20,000, and the gain on the building passes through Revaluation A/c and is shared the same way. Losses work in the opposite direction: a debit balance of Profit and Loss A/c, or a fall in the value of stock, is debited in the old ratio.',
      },
      {
        type: 'text',
        heading: 'Leaving things in the books',
        body: 'Sometimes the partners prefer not to disturb the reserve or the book values. Then one entry does the whole job. Add up what is being left in the books (here ₹1,00,000 + ₹50,000 = ₹1,50,000) and multiply by the share that changes hands: ₹1,50,000 x 2/10 = ₹30,000. Charu, who will get more of it in future, is debited and Asha is credited. If a net loss is left in the books, the entry runs the other way.',
      },
      {
        type: 'table',
        title: 'Worked example 1: Revaluation A/c of Malabar Spices, Kochi (old ratio 3:2:1), with a fall in investments larger than the reserve',
        rows: [
          { label: 'The facts: building up from ₹4,00,000 to ₹4,60,000; stock down by ₹10,000; a provision of ₹4,000 for doubtful debts; investments of ₹2,00,000 now worth ₹1,70,000, against an Investment Fluctuation Reserve of ₹20,000.' },
          { label: 'Debit side' },
          { label: 'To Investments A/c (fall ₹30,000 less the reserve ₹20,000)', amount: '₹10,000' },
          { label: 'To Stock A/c', amount: '₹10,000' },
          { label: 'To Provision for Doubtful Debts A/c', amount: '₹4,000' },
          { label: 'To Profit on revaluation: Meera ₹18,000, Nikhil ₹12,000, Omar ₹6,000 (old ratio 3:2:1)', amount: '₹36,000' },
          { label: 'Total of the debit side', amount: '₹60,000', total: true },
          { label: 'Credit side' },
          { label: 'By Building A/c', amount: '₹60,000' },
          { label: 'Total of the credit side', amount: '₹60,000', total: true },
        ],
        note: 'The fall of ₹30,000 is met first from the reserve: Investment Fluctuation Reserve A/c Dr ₹20,000 and Revaluation A/c Dr ₹10,000, To Investments A/c ₹30,000. Watch out: only the excess over the reserve is a loss on revaluation, and the profit is shared in the OLD ratio.',
      },
      {
        type: 'working',
        title: 'Worked example 2: capitals brought to the new ratio',
        lines: [
          'Ravi and Suman of Kaveri Book House change their ratio from 3:2 to 1:1. After the reserve, revaluation and goodwill have gone through, their capitals are Ravi ₹3,60,000 and Suman ₹2,40,000: ₹6,00,000 in all.',
          'They agree that the total capital stays ₹6,00,000, held in the new ratio 1:1: ₹3,00,000 each.',
          'Ravi has ₹60,000 too much and withdraws it: Ravi\'s Capital A/c Dr, To Bank A/c ₹60,000.',
          'Suman is ₹60,000 short and brings it in: Bank A/c Dr, To Suman\'s Capital A/c ₹60,000.',
          'If no cash is to move, the differences go to current accounts instead: Ravi\'s Capital A/c Dr, To Ravi\'s Current A/c ₹60,000; Suman\'s Current A/c Dr, To Suman\'s Capital A/c ₹60,000.',
        ],
        note: 'Watch out: take the capitals after every adjustment of the change. Using the capitals before the reserve and revaluation gives the wrong total.',
      },
      {
        type: 'working',
        title: 'Worked example 3: the same change with fixed capitals',
        lines: [
          'Asha, Bina and Charu (5:3:2 to 3:3:4) keep fixed capitals. The General Reserve of ₹1,00,000 goes to their current accounts in the old ratio: Asha ₹50,000, Bina ₹30,000, Charu ₹20,000.',
          'Goodwill of ₹3,00,000: Charu gains 2/10 from Asha, so Charu\'s Current A/c is debited and Asha\'s Current A/c credited with ₹60,000.',
          'The capital accounts do not move. In the new Balance Sheet each fixed capital stands as before and each current account shows its new balance: a credit balance among the liabilities, a debit balance among the assets.',
        ],
        note: 'Watch out: with fixed capitals nothing of the change is passed through the capital accounts, not even goodwill.',
      },
      {
        type: 'example',
        title: 'Goodwill with fixed capitals: Charu compensates Asha',
        lines: [
          { accountId: 'current:Charu', side: 'Dr', amount: 6000000 },
          { accountId: 'current:Asha', side: 'Cr', amount: 6000000 },
        ],
        note: 'The same entry as before, through the current accounts because the capitals are fixed.',
      },
      { type: 'check', questionId: qid(3) },
      { type: 'check', questionId: qid(8) },
    ],
  },
  cards: {
    title: 'Rules for a Change in the Ratio',
    description: 'Recall the formulas, the entries and the ratio that applies to each adjustment.',
    cardIds: cards.map((c) => c.id),
  },
  recognition: [
    {
      title: 'Sacrifice, Gain and Goodwill',
      description: 'Recognise what a change in the ratio is, who gains and who sacrifices, and how goodwill is settled.',
      questionIds: [1, 2, 4, 5, 6, 36, 7, 9, 10, 32].map(qid),
    },
    {
      title: 'Reserves, Revaluation and the Adjusting Entry',
      description: 'Choose the right ratio and the right side for reserves, losses, revaluation and balances left in the books.',
      questionIds: [11, 12, 34, 13, 14, 15, 16, 21, 17, 18, 19, 35, 20, 22, 33].map(qid),
    },
    {
      title: 'Short Sums and Entries',
      description: 'Work out a compensation, a ratio and a capital, and pass two simple entries.',
      questionIds: [24, 25, 27, 28, 26, 23, 29, 30, 31].map(qid),
    },
  ],
  practice: [
    {
      title: 'Who Gains and Who Sacrifices',
      description: 'Turn the two ratios into shares and find the sacrifice, the gain and the ratios they give.',
      templateIds: ['cpr-share-change', 'cpr-who-changes', 'cpr-sacrificing-ratio', 'cpr-gaining-ratio'],
      count: 8,
    },
    {
      title: 'Goodwill and Reserves: First Steps',
      description: 'The compensation for goodwill, writing off goodwill in the books, and distributing a reserve or a loss.',
      templateIds: ['cpr-gw-compensation', 'cpr-gw-treatment', 'cpr-gw-writeoff', 'cpr-res-share', 'cpr-res-entry', 'cpr-res-treatment'],
      count: 8,
    },
    {
      title: 'Revaluation, One Entry and Capitals: First Steps',
      description: 'Single changes in value, closing Revaluation A/c, a reserve left in the books and a capital in the new ratio.',
      templateIds: ['cpr-rev-item-entry', 'cpr-rev-item-side', 'cpr-rev-transfer-entry', 'cpr-single-amount', 'cpr-cap-proportionate'],
      count: 8,
    },
    {
      title: 'The Goodwill Entry (Guided)',
      description: 'Find each share that moves, multiply the goodwill by it, then debit those who gain and credit those who sacrifice.',
      templateIds: ['cpr-gw-entry', 'cpr-gw-entry-compound'],
      count: 6,
      guided: true,
    },
    {
      title: 'New Ratios and Goodwill',
      description: 'A share surrendered to another partner, and the value of goodwill read back from the entry.',
      templateIds: ['cpr-new-ratio-surrender', 'cpr-gw-find-value', 'cpr-gw-entry-compound'],
      count: 6,
    },
    {
      title: 'Reserves Kept for a Purpose',
      description: 'Several balances at once, a Workmen Compensation Reserve with a claim and an Investment Fluctuation Reserve.',
      templateIds: ['cpr-res-net', 'cpr-wcr-amount', 'cpr-wcr-entry', 'cpr-ifr-amount'],
      count: 8,
    },
    {
      title: 'Revaluation Account',
      description: 'The profit or loss on revaluation, each partner\'s share of it, and entries worked out from the figures.',
      templateIds: ['cpr-rev-result', 'cpr-rev-share', 'cpr-rev-entry-computed'],
      count: 6,
    },
    {
      title: 'One Adjusting Entry, and Capitals',
      description: 'Balances left in the books, capitals after the adjustments and capitals brought to the new ratio.',
      templateIds: ['cpr-single-entry', 'cpr-single-direction', 'cpr-cap-after', 'cpr-cap-cash', 'cpr-cap-adjust-entry'],
      count: 8,
    },
    {
      title: 'Complex: Ratios, Goodwill and Reserves',
      description: 'A share acquired in a stated ratio, goodwill valued from profits, goodwill in the books and a reserve that falls short.',
      templateIds: ['cpr-new-ratio-acquire', 'cpr-gw-from-profits', 'cpr-gw-both', 'cpr-ifr-entry', 'cpr-rev-complex'],
      count: 6,
    },
    {
      title: 'Complex: Everything in One Entry',
      description: 'Goodwill, a reserve and a revaluation settled by one entry, capitals in the new ratio and the new Balance Sheet total.',
      templateIds: ['cpr-single-combined-entry', 'cpr-single-combined-amount', 'cpr-cap-complex', 'cpr-bs-total'],
      count: 6,
    },
  ],
  mixed: { title: 'Mixed Practice: Change in the Ratio', description: 'Everything in this topic, shuffled the way an examination serves it.', count: 12 },
  challenge: { title: 'Challenge: Change in the Ratio', description: 'The hardest questions of the topic, against the clock.', count: 8, timerSecondsPerQuestion: 150 },
  sets: [
    {
      title: 'Pass the Entries: Reserves and Goodwill',
      description: 'One change of ratio, three or four entries: the reserve and the balance of Profit and Loss A/c closed in the old ratio, and goodwill adjusted between the partners.',
      templateIds: ['cpr-set-goodwill-reserves'],
      count: 3,
    },
    {
      title: 'Pass the Entries: Revaluation, or One Adjusting Entry',
      description: 'Four or five entries. Either every change in value is recorded through Revaluation A/c, with a reserve kept for a purpose in some sets, and the account is closed; or the balances are left as they are, one adjusting entry is passed and the capitals are brought to the new ratio.',
      templateIds: ['cpr-set-revaluation', 'cpr-set-single-entry'],
      count: 2,
    },
    {
      title: 'Pass the Entries: A Whole Change of Ratio',
      description: 'Six to eight entries for one change: the reserve and an accumulated loss, the changes in value and the closing of Revaluation A/c, goodwill in the books written off and goodwill adjusted.',
      templateIds: ['cpr-set-whole-change'],
      count: 2,
    },
  ],
  formats: [
    {
      title: 'Prepare the Revaluation Account',
      description: 'Every change in value on its side, some of them worked out from a rate or a revised value, and the profit or loss on revaluation shared among the partners in the old ratio.',
      templateIds: ['cpr-fmt-revaluation-direct', 'cpr-fmt-revaluation'],
      count: 2,
    },
    {
      title: "Prepare the Partners' Accounts in Columns",
      description: 'The capital accounts after the change, a column for each partner: the reserve, the result of revaluation and goodwill. With fixed capitals the same adjustments go through the current accounts.',
      templateIds: ['cpr-fmt-capitals', 'cpr-fmt-current-accounts'],
      count: 2,
    },
    {
      title: 'Prepare the Capital Accounts in the New Ratio, and the Balance Sheet',
      description: 'The capital accounts with the capitals then brought to the new ratio, the difference paid in or out or carried to current accounts; and the Balance Sheet of the firm after the change, from the old one and the matters settled.',
      templateIds: ['cpr-fmt-capitals-adjusted', 'cpr-fmt-balance-sheet'],
      count: 2,
    },
    // Added after the audit: an id of its own (change-in-profit-sharing-ratio-formats-4), after the three above.
    {
      title: 'Prepare the Balance Sheet with Fixed Capitals',
      description: 'The Balance Sheet after the change when the capitals are fixed: every matter settled through the current accounts, a current account in debit shown among the assets.',
      templateIds: ['cpr-fmt-balance-sheet-fixed'],
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
        name: 'goodwill-by-super-profit',
        type: 'complex_practice',
        title: 'Goodwill Valued by Super Profit, then the Entry',
        description: 'Value the goodwill at a number of years\' purchase of the super profit or by capitalising it, then pass the one entry by which the gaining partners compensate the sacrificing ones.',
        generate: { templateIds: ['cpr-gw-super-profit'], count: 4 },
      },
      {
        name: 'assertion-reason',
        type: 'medium_practice',
        title: 'Assertion and Reason',
        description: 'The one-mark question of the board: judge the Assertion, judge the Reason, and say whether the Reason explains the Assertion.',
        generate: { templateIds: ['cpr-assertion-reason'], count: 6 },
      },
    ]),
  ],
  questions,
};

export default pack;
