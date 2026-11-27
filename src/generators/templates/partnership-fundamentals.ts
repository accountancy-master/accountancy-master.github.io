import type { AccountQuestion, JournalQuestion, JournalSetQuestion, McqQuestion, StatementQuestion } from '@/content/types';
import { partnerCapital, partnerCurrent, partnerDrawings, partnerLoan } from '@/engine/accounts';
import { accountOf, columnarAccount, post, type DatedEntry, type Ledger } from '@/engine/books';
import type { JournalLine } from '@/engine/journal';
import type { Rng } from '@/engine/rng';
import {
  assertionReasonFacts,
  factsTemplate,
  accountTemplate,
  columnarSides,
  crSide,
  drSide,
  formatINR,
  journalSetTemplate,
  journalTemplate,
  keepFor,
  lowestTerms,
  mcqTemplate,
  numericTemplate,
  partnerColumns,
  rupees,
  setHolds,
  statementTemplate,
} from '../authoring';
import type { FormatRowParts, McqParts, NumericParts, RatioParts, SetTransaction, StatementLineParts, Template } from '../types';

const T = 'partnership-fundamentals';

// ---------------------------------------------------------------------------------------------------------------
// Conventions used throughout (and stated in the prompts that rely on them):
//  - the accounting year ends on 31 March; a date on the 1st of a month counts that month, a month-end date does not;
//  - interest is always "% p.a.", so time always counts; drawings whose dates are not given carry six months;
//  - without an agreement the Indian Partnership Act, 1932 applies: equal profits, no interest on capital or on
//    drawings, no salary or commission, 6% p.a. on a partner's loan;
//  - interest on a partner's loan and rent paid to a partner are charges (Profit and Loss A/c); interest on capital,
//    salary and commission are appropriations (Profit and Loss Appropriation A/c) unless the deed says "charge";
//  - a prompt says whether capitals are fixed (the partner's Current A/c takes the entry) or fluctuating (Capital A/c);
//  - every figure is worked in whole rupees: values are drawn so that they come out clean, or the seed is rejected.
// ---------------------------------------------------------------------------------------------------------------

/** Whole rupees as the amount text a learner sees. */
const inr = (n: number): string => formatINR(rupees(n));
const sum = (xs: readonly number[]): number => xs.reduce((a, b) => a + b, 0);
const near = (a: number, b: number): boolean => Math.abs(a - b) < 1e-6;

const NAMES = ['Aarav', 'Bhavna', 'Chetan', 'Deepa', 'Esha', 'Farhan', 'Gauri', 'Harish', 'Imran', 'Jaya', 'Kabir', 'Lata', 'Meena', 'Naveen', 'Pooja', 'Rohan', 'Sana', 'Tarun', 'Uma', 'Vikram'];
/** `n` partners, in alphabetical order so that "Aarav, Bhavna and Chetan" reads naturally. */
const partners = (rng: Rng, n: number): string[] => rng.shuffle(NAMES).slice(0, n).sort();
const list = (xs: readonly string[]): string => (xs.length === 2 ? `${xs[0]} and ${xs[1]}` : `${xs.slice(0, -1).join(', ')} and ${xs[xs.length - 1]}`);

const FIRMS = [
  'a firm that sells sports goods in Jaipur',
  'a firm of cloth merchants in Surat',
  'a firm that runs a bookshop in Pune',
  'a firm that trades in spices in Kochi',
  'a firm that makes furniture in Ludhiana',
  'a firm that runs a medical store in Bhopal',
  'a firm that supplies stationery in Chennai',
  'a firm that trades in tea in Guwahati',
  'a firm that sells electrical goods in Nagpur',
  'a firm that runs a bakery in Mysuru',
];
const firmOf = (rng: Rng): string => rng.pick(FIRMS);

const MONTHS = ['April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December', 'January', 'February', 'March'];
const LAST_DAY = [30, 31, 30, 31, 31, 30, 31, 30, 31, 31, 28, 31];
interface Year {
  y: number;
  /** "year ended 31 March 2025" */
  ended: string;
  /** "1 April 2024" */
  from: string;
  /** "31 March 2025" */
  on: string;
}
const yearOf = (rng: Rng): Year => {
  const y = rng.int(2023, 2026);
  return { y, ended: `year ended 31 March ${y}`, from: `1 April ${y - 1}`, on: `31 March ${y}` };
};
/** The first day of month `k` of the year (0 is April, 11 is March). */
const firstOf = (yr: Year, k: number): string => `1 ${MONTHS[k]} ${k >= 9 ? yr.y : yr.y - 1}`;
/** The last day of month `k` of the year. */
const lastOf = (yr: Year, k: number): string => `${LAST_DAY[k]} ${MONTHS[k]} ${k >= 9 ? yr.y : yr.y - 1}`;
const DATE_RE = new RegExp(`(\\d{1,2}) (${MONTHS.join('|')}) 20\\d\\d`, 'g');
/** For every date in a text, the months from it to the 31 March that follows: the 1st counts its month, a month end does not. */
const monthsLeft = (s: string): number[] =>
  [...s.matchAll(DATE_RE)].map((m) => {
    const k = MONTHS.indexOf(m[2]);
    return m[1] === '1' ? 12 - k : 11 - k;
  });

const toNumber = (s: string): number => Number(s.replace(/[₹,]/g, ''));
const amountsIn = (s: string): number[] => (s.match(/₹\d[\d,]*/g) ?? []).map(toNumber);
/** The first amount (or number) a pattern captures in a text; NaN when it is not there, which fails any check. */
const read = (s: string, re: RegExp): number => toNumber(re.exec(s)?.[1] ?? 'x');
const rateIn = (s: string): number => read(s, /(\d+)% p\.a\./);
const optionText = (q: McqQuestion): string | undefined => q.options.find((o) => o.id === q.correct)?.text;
/** The lines of a prompt after its first: the data given one item to a line. */
const dataLines = (prompt: string): string[] => prompt.split('\n').slice(1);

/** Profit-sharing ratios, in lowest terms, the larger shares first. */
const PSR2 = [[3, 2], [2, 1], [3, 1], [5, 3], [4, 1], [7, 3], [5, 2]];
const PSR3 = [[5, 3, 2], [3, 2, 1], [2, 2, 1], [4, 3, 2], [5, 4, 1], [3, 3, 2], [2, 1, 1], [4, 3, 1], [5, 2, 1], [4, 3, 3]];
const psrOf = (rng: Rng, n: number, ok: (r: number[]) => boolean = () => true): number[] => rng.pick((n === 2 ? PSR2 : PSR3).filter(ok));
/** Capitals as small whole numbers of a unit (₹50,000 or ₹1,00,000), the largest first. */
const CAPS2 = [[3, 2], [2, 1], [3, 1], [5, 3], [4, 3], [5, 2], [4, 1], [6, 5]];
const CAPS3 = [[3, 2, 1], [5, 3, 2], [4, 3, 1], [4, 2, 1], [3, 2, 2], [5, 4, 3], [2, 2, 1], [3, 3, 2], [6, 4, 3]];
const ratioText = (r: readonly number[]): string => r.join(':');
const sameRatio = (a: readonly number[], b: readonly number[]): boolean => lowestTerms(a).join(':') === lowestTerms(b).join(':');

/**
 * A numeric question's answer and errors from whole rupees (or, with scale 1, plain numbers). A wrong figure that is
 * not a whole positive number, or that repeats the answer or another error, is dropped; null when fewer than two remain.
 */
function numeric(answer: number, errs: [number, string][], scale = 100): Pick<NumericParts, 'answer' | 'commonErrors'> | null {
  if (!Number.isInteger(answer) || answer <= 0) return null;
  const seen = new Set([answer]);
  const commonErrors: { value: number; why: string }[] = [];
  for (const [v, why] of errs) {
    if (Number.isInteger(v) && v > 0 && !seen.has(v) && seen.add(v)) commonErrors.push({ value: v * scale, why });
  }
  return commonErrors.length >= 2 ? { answer: answer * scale, commonErrors } : null;
}

/** A ratio answer and its wrong ratios, each reduced to lowest terms; null when fewer than two distinct wrong ratios remain. */
function ratio(answer: number[], errs: [number[], string][]): Pick<RatioParts, 'answer' | 'commonErrors'> | null {
  const usable = (r: number[]) => r.length === answer.length && r.every((x) => Number.isInteger(x) && x > 0);
  if (!usable(answer)) return null;
  const right = lowestTerms(answer);
  const seen = new Set([right.join(':')]);
  const commonErrors: { value: number[]; why: string }[] = [];
  for (const [v, why] of errs) {
    if (!usable(v)) continue;
    const low = lowestTerms(v);
    if (!seen.has(low.join(':')) && seen.add(low.join(':'))) commonErrors.push({ value: low, why });
  }
  return commonErrors.length >= 2 ? { answer: right, commonErrors } : null;
}

/** A multiple-choice question; null when fewer than three distinct wrong options remain. */
function choice(prompt: string, correct: string, wrong: [string, string][], explanation: string, hints?: string[]): McqParts | null {
  const seen = new Set([correct]);
  const distractors: { text: string; why: string }[] = [];
  for (const [text, why] of wrong) if (!seen.has(text) && seen.add(text)) distractors.push({ text, why });
  if (distractors.length < 3) return null;
  return { prompt, correct, distractors, explanation, ...(hints ? { hints } : {}) };
}

const dr = (accountId: string, amt: number): JournalLine => ({ accountId, side: 'Dr', amount: rupees(amt) });
const cr = (accountId: string, amt: number): JournalLine => ({ accountId, side: 'Cr', amount: rupees(amt) });
/** The account of a partner that takes interest, salary, profit and drawings: Current A/c beside a fixed capital, else Capital A/c. */
const ownId = (fixed: boolean, name: string): string => (fixed ? partnerCurrent(name) : partnerCapital(name));
const ownName = (fixed: boolean, name: string): string => `${name}'s ${fixed ? 'Current' : 'Capital'} A/c`;
const capitalsAre = (fixed: boolean): string => (fixed ? 'Their capitals are fixed.' : 'Their capitals are fluctuating.');
const whyOwn = (fixed: boolean): string =>
  fixed ? 'Capitals are fixed, so the partner\'s Current A/c is used and the capital account is not touched.' : 'Capitals are fluctuating, so the partner\'s Capital A/c itself is used.';

const H = {
  noDeed: ['Have the partners agreed on this point? If not, the Indian Partnership Act, 1932 decides it.', 'Without an agreement: profits are shared equally, there is no interest on capital or drawings and no salary, and a partner\'s loan earns 6% p.a.'],
  ioc: ['Interest on capital runs on each amount for the months it stayed in the firm during the year.', 'Interest = Capital x Rate/100 x Months/12, starting from the capital at the beginning of the year.'],
  iod: ['For how many months, up to the end of the year, was each amount out of the firm?', 'Interest = Amount x Rate/100 x Months/12. For equal drawings at regular intervals, use the average period on the total.'],
  approp: ['Start from the net profit. Take out interest on capital, salary and commission, and add interest on drawings.', 'What is left is the divisible profit, shared in the profit-sharing ratio.'],
  comm: ['Is the percentage worked on the profit before the commission, or on what is left after it?', 'Before charging: Profit x Rate/100. After charging: Profit x Rate/(100 + Rate).'],
  guarantee: ['First share the profit in the usual ratio. Does the guaranteed partner reach the minimum?', 'Deficiency = guaranteed amount - actual share. It is taken from whoever gave the guarantee, in the ratio stated.'],
  past: ['Make a table: what each partner should have been credited with, and what was credited instead.', 'The partner who got too much is debited and the partner who got too little is credited, in one entry.'],
  entry: ['Is the amount something the firm gives the partner, or something the partner owes the firm?', 'With fixed capitals the partner\'s Current A/c takes it; with fluctuating capitals the Capital A/c does.'],
  charge: ['Would the amount be due even if the firm made a loss?', 'A charge is debited to Profit and Loss A/c. An appropriation is debited to Profit and Loss Appropriation A/c.'],
  product: [
    'For each withdrawal, count the months from its date to the end of the year: a withdrawal on the 1st counts its month, one on the last day of a month does not.',
    'Multiply each amount by its months and add the products. Interest = Sum of products x Rate/100 x 1/12.',
  ],
  fluctuating: ['With fluctuating capitals one Capital A/c takes everything: the opening capital and every item of the year.', 'Credit side: opening capital, interest on capital, salary, share of profit. Debit side: drawings and interest on drawings. The difference is the closing balance.'],
  capitals: ['Does the item change the capital the partner has invested, or is it part of the yearly dealings with the firm?', 'A fixed capital changes only when capital is brought in or permanently withdrawn; everything else goes to the Current A/c.'],
};

// ===============================================================================================================
// EASY
// ===============================================================================================================

const DEED_FACTS: { q: string; right: string; wrong: [string, string][]; why: string }[] = [
  {
    q: 'What is the smallest number of persons who can form a partnership?',
    right: 'Two',
    wrong: [
      ['One', 'Described a sole proprietorship; one person cannot make an agreement of partnership.'],
      ['Seven', 'Used the minimum number of members of a public company.'],
      ['Fifty', 'Gave the largest number of partners a firm may have, not the smallest.'],
    ],
    why: 'A partnership is a relation between persons who agree to share the profits of a business, so it needs at least two. The largest number allowed is 50.',
  },
  {
    q: 'What is the largest number of partners a partnership firm may have at present?',
    right: 'Fifty',
    wrong: [
      ['Ten', 'Used the old limit for a banking business under the Companies Act, 1956.'],
      ['Twenty', 'Used the old limit for other businesses under the Companies Act, 1956.'],
      ['Two hundred', 'Used the limit on the members of a private company.'],
    ],
    why: 'The Companies Act, 2013 lets the Government fix the limit, and the rules made under it fix it at 50.',
  },
  {
    q: 'Which law lays down the rules for partnership firms in India?',
    right: 'The Indian Partnership Act, 1932',
    wrong: [
      ['The Companies Act, 2013', 'Picked the law for companies; for a firm it only limits the number of partners.'],
      ['The Limited Liability Partnership Act, 2008', 'Picked the law for LLPs, which are a different form of business from a partnership firm.'],
      ['The Sale of Goods Act, 1930', 'Picked a law about contracts of sale, not about the relation between partners.'],
    ],
    why: 'The Indian Partnership Act, 1932 defines partnership and gives the rules that apply when the partners have not agreed otherwise.',
  },
  {
    q: 'Must an agreement of partnership be in writing?',
    right: 'No. An oral agreement is valid, though a written deed is safer because it settles disputes',
    wrong: [
      ['Yes. The Indian Partnership Act, 1932 accepts only a written deed', 'Read a good practice as a rule of law; the Act does not ask for writing.'],
      ['Yes, and the deed must be registered before the business starts', 'Made both writing and registration compulsory; neither is.'],
      ['Only when there are more than two partners', 'Invented a condition about the number of partners.'],
    ],
    why: 'The agreement may be oral or written. A written agreement, the partnership deed, is preferred because it is evidence of what was agreed.',
  },
  {
    q: 'What is the liability of the partners of a firm for the debts of the firm?',
    right: 'Unlimited: their private assets can also be used to pay the debts of the firm',
    wrong: [
      ['Limited to the capital each partner has put in', 'Described the position of a shareholder of a company or a partner of an LLP.'],
      ['Limited to each partner\'s share of the profit', 'Tied the liability to the profit; it does not stop at any amount.'],
      ['Only the partner who manages the business is liable', 'Left out that partners are liable jointly and severally, whoever manages the business.'],
    ],
    why: 'Partners are liable jointly and severally, and without limit, for the debts of the firm.',
  },
  {
    q: 'The business of a firm "may be carried on by all the partners or by any of them acting for all". What does this feature mean?',
    right: 'Mutual agency: each partner is an agent of the firm and can bind the other partners by acts done in its business',
    wrong: [
      ['Every partner must work in the business every day', 'Read "carried on by all" as a duty to work; a partner may take no part in the business and still be a partner.'],
      ['Each partner answers only for that partner\'s own acts', 'Said the opposite; an act of one partner in the business of the firm binds the others.'],
      ['The firm is a legal person separate from its partners', 'Described a company; a firm has no legal existence apart from its partners.'],
    ],
    why: 'Each partner is both an agent (who can bind the others) and a principal (who is bound by the others). This is the test of partnership.',
  },
  {
    q: 'Which of these is NOT needed for a partnership to exist?',
    right: 'A deed registered with the Registrar of Firms',
    wrong: [
      ['An agreement between the persons', 'An agreement is the basis of partnership, so it cannot be the odd one out.'],
      ['A lawful business', 'There must be a business, and a lawful one, so it cannot be the odd one out.'],
      ['Sharing of the profits of the business', 'Sharing of profits is an essential feature, so it cannot be the odd one out.'],
    ],
    why: 'Two or more persons, an agreement, a lawful business, sharing of its profits and mutual agency make a partnership. Neither a written deed nor registration is compulsory.',
  },
  {
    q: 'Two friends buy a flat together, let it out and share the rent equally. Are they partners?',
    right: 'No. Owning a property together and sharing its income is not carrying on a business',
    wrong: [
      ['Yes, because they share an income', 'Took any sharing of income for partnership; the income must be the profit of a business they carry on.'],
      ['Yes, because there is an agreement between them', 'Took any agreement for an agreement of partnership; it must be to share the profits of a business.'],
      ['No, because their agreement is not in writing', 'Gave the wrong reason; writing is not needed for a partnership.'],
    ],
    why: 'Partnership needs a business. Joint ownership of property, even with the income shared, is co-ownership and not partnership.',
  },
  {
    q: 'A partnership deed is silent on a matter over which the partners disagree. How is the matter settled?',
    right: 'By the provisions of the Indian Partnership Act, 1932',
    wrong: [
      ['By the wish of the partner with the largest capital', 'Gave the larger capital a deciding voice, which it does not have.'],
      ['By the rules of the Companies Act, 2013', 'Used the law for companies; partners are governed by the Partnership Act.'],
      ['By the practice of other firms in the same trade', 'Looked to trade custom; it is the Act that fills the gaps in a deed.'],
    ],
    why: 'The deed comes first. Where it says nothing, the provisions of the Indian Partnership Act, 1932 apply.',
  },
  {
    q: 'Which of these is usually written into a partnership deed?',
    right: 'The ratio in which the partners share profits and losses',
    wrong: [
      ['The names of the firm\'s customers and suppliers', 'Put day-to-day business records into the agreement between the partners.'],
      ['The selling prices of the goods the firm deals in', 'Put a business decision that changes all the time into the deed.'],
      ['The Balance Sheet of the firm for the coming year', 'Mixed up a financial statement with the agreement between the partners.'],
    ],
    why: 'A deed sets out the terms between the partners: capitals, the profit-sharing ratio, interest on capital and drawings, salaries, and what happens on admission, retirement or dissolution.',
  },
  {
    q: 'Which of these may be claimed by a partner only if the partnership deed provides for it?',
    right: 'A salary for working in the business',
    wrong: [
      ['An equal share of the profit', 'An equal share is what the Act itself gives when there is no agreement.'],
      ['Interest at 6% p.a. on a loan given to the firm', 'Interest at 6% p.a. on a partner\'s loan is given by the Act itself, without any agreement.'],
      ['The right to take part in running the business', 'Every partner has this right under the Act, without any agreement.'],
    ],
    why: 'Salary, commission, interest on capital and interest on drawings all need an agreement. Equal profits, 6% p.a. on a partner\'s loan and the right to take part in the business come from the Act.',
  },
];
const deedFact = mcqTemplate({
  id: 'pf-deed-fact', topicId: T, conceptId: 'pf-features', difficulty: 'easy',
  generate: (rng) => {
    const f = rng.pick(DEED_FACTS);
    return choice(f.q, f.right, f.wrong, f.why, ['Think of what makes a partnership: persons, an agreement, a business, shared profits, mutual agency.', 'What the partners have not agreed on is decided by the Indian Partnership Act, 1932.']);
  },
});

const noDeedRule = mcqTemplate({
  id: 'pf-no-deed-rule', topicId: T, conceptId: 'pf-no-deed', difficulty: 'easy',
  generate: (rng) => {
    const [a, b] = partners(rng, 2);
    const yr = yearOf(rng);
    const r = rng.pick([8, 9, 10, 12]);
    const silent = rng.pick(['They have no partnership deed.', 'Their agreement is oral and says nothing on this point.', 'Their partnership deed is silent on this point.']);
    const intro = `${a} and ${b} are partners in ${firmOf(rng)}. ${silent}`;
    const ask = 'What does the Indian Partnership Act, 1932 provide?';
    const capA = rng.step(400000, 900000, 100000);
    const capB = rng.step(100000, capA - 100000, 100000);
    const kind = rng.int(0, 5);
    if (kind === 0) {
      return choice(
        `${intro} ${a} has put in ${inr(capA)} as capital and ${b} ${inr(capB)}. ${a} wants the profit of the ${yr.ended} shared in the ratio of capitals. ${ask}`,
        'The profit is shared equally',
        [
          [`The profit is shared in the ratio of capitals, ${ratioText(lowestTerms([capA, capB]))}`, 'Let the capitals decide the shares; that needs an agreement between the partners.'],
          [`${a} first gets interest on the extra capital, and the rest is shared equally`, 'Allowed interest on capital, which is not given unless the partners have agreed to it.'],
          ['The profit is shared in the ratio of the time each partner gives to the business', 'Invented a rule about time and effort; the Act knows only equal sharing.'],
        ],
        'Without an agreement on the ratio, partners share profits and losses equally, whatever their capitals.', H.noDeed,
      );
    }
    if (kind === 1) {
      return choice(
        `${intro} ${a}'s capital is ${inr(capA)} and ${b}'s is ${inr(capB)}. ${a} claims interest on capital at ${r}% p.a. for the ${yr.ended}. ${ask}`,
        'No interest on capital is allowed',
        [
          [`Interest on capital is allowed at ${r}% p.a., as ${a} claims`, 'Took the claim of one partner for an agreement between the partners.'],
          ['Interest on capital is allowed at 6% p.a.', 'Used the rate the Act gives for a partner\'s loan; capital is not a loan.'],
          [`Interest is allowed only to ${a}, on the capital in excess of ${b}'s`, 'Made up a rule for the larger capital; without an agreement no capital earns interest.'],
        ],
        'Interest on capital is allowed only when the partners have agreed to it. Without an agreement none is allowed.', H.noDeed,
      );
    }
    if (kind === 2) {
      const s = rng.step(5000, 20000, 1000);
      return choice(
        `${intro} ${a} looks after the business full time, while ${b} attends only now and then. ${a} claims a salary of ${inr(s)} per month for the ${yr.ended}. ${ask}`,
        'No salary is allowed to any partner',
        [
          [`${a} gets ${inr(s)} per month, as claimed`, 'Thought that working for the firm earns a salary by itself; a partner\'s salary needs an agreement.'],
          [`${a} gets the salary only if the firm earns a profit`, 'Mixed this up with the rule that appropriations come out of profit; without an agreement there is no salary at all.'],
          [`${a} gets a salary equal to 6% of the profit`, 'Carried the 6% of a partner\'s loan over to salary.'],
        ],
        'A partner is not entitled to any salary or other remuneration for taking part in the business unless the partners have agreed to it.', H.noDeed,
      );
    }
    const loan = rng.step(100000, 500000, 50000);
    if (kind === 3) {
      return choice(
        `${intro} Besides capital, ${b} gave the firm a loan of ${inr(loan)} on ${yr.from} and claims interest on it at ${r}% p.a. for the ${yr.ended}. ${ask}`,
        'Interest is allowed on the loan at 6% p.a.',
        [
          [`Interest is allowed on the loan at ${r}% p.a., as ${b} claims`, 'Took the rate one partner asks for; without an agreement the Act fixes it at 6% p.a.'],
          ['No interest is allowed on the loan', 'Applied the rule for capital to a loan; a partner\'s loan earns interest even without an agreement.'],
          ['Interest is allowed at 6% p.a., but only if the firm earns a profit', 'Treated interest on a loan as an appropriation; it is a charge and is due even in a year of loss.'],
        ],
        'A partner who lends money to the firm beyond capital is entitled to interest at 6% p.a. when there is no agreement on the rate.', H.noDeed,
      );
    }
    if (kind === 4) {
      const d = rng.step(24000, 120000, 12000);
      return choice(
        `${intro} ${b} withdrew ${inr(d)} for personal use during the ${yr.ended}. ${a} wants interest charged on these drawings at ${r}% p.a. ${ask}`,
        'No interest is charged on drawings',
        [
          [`Interest is charged on the drawings at ${r}% p.a.`, 'Took the wish of one partner for an agreement between the partners.'],
          ['Interest is charged on the drawings at 6% p.a.', 'Used the rate the Act gives for a partner\'s loan; it has nothing to do with drawings.'],
          [`Interest is charged at ${r}% p.a. for six months`, 'Went straight to the average period, which matters only once the partners have agreed to charge interest.'],
        ],
        'Interest on drawings is charged only when the partners have agreed to it. Without an agreement none is charged.', H.noDeed,
      );
    }
    return choice(
      `${intro} The firm made a loss in the ${yr.ended}. ${b}, who had given the firm a loan of ${inr(loan)} on ${yr.from}, asks for interest on it. ${a} says that nothing is due in a year of loss. ${ask}`,
      'Interest at 6% p.a. is due on the loan even though there is a loss',
      [
        ['No interest is due, because there is no profit to pay it from', 'Treated interest on a partner\'s loan as an appropriation of profit; it is a charge against profit.'],
        ['No interest is due, because the partners have not agreed on any', 'Applied the rule for capital to a loan; the Act itself gives 6% p.a. on a partner\'s loan.'],
        ['Interest is due, but it waits until the firm earns a profit', 'Made the charge depend on profit; it is due for the year whatever the result.'],
      ],
      'Interest on a partner\'s loan is a charge against profit: it is allowed at 6% p.a. whether the firm earns a profit or suffers a loss.', H.noDeed,
    );
  },
});

const noDeedLoanInterest = numericTemplate({
  id: 'pf-no-deed-loan-interest', topicId: T, conceptId: 'pf-no-deed', difficulty: 'easy', unit: 'rupees',
  // Version 2: the prompt says the other partner does not accept the rate asked for, so it cannot be read as agreed.
  version: 2,
  generate: (rng) => {
    const [a, b] = partners(rng, 2);
    const yr = yearOf(rng);
    const loan = rng.step(100000, 900000, 20000);
    const k = rng.int(0, 3) === 0 ? 0 : rng.int(1, 10);
    const m = 12 - k;
    const r = rng.pick([8, 9, 10, 12]);
    const answer = (loan * 6 * m) / 1200;
    const silent = rng.pick(['There is no partnership deed.', 'The partnership deed says nothing about interest on a partner\'s loan.']);
    const n = numeric(answer, [
      ...(m < 12 ? ([[(loan * 6) / 100, 'Charged interest for the whole year, although the loan was with the firm for only part of it.']] as [number, string][]) : []),
      [(loan * r * m) / 1200, `Used the ${r}% that the partner asks for; without an agreement the rate is 6% p.a.`],
      [(loan * 6 * (12 - m)) / 1200, 'Counted the months before the loan was given instead of the months after it.'],
      ...(m === 12 ? ([[(loan * 6 * 6) / 1200, 'Charged six months, the average period used for drawings whose dates are not known; the loan was with the firm all year.']] as [number, string][]) : []),
      [(loan * 6 * (m - 1)) / 1200, 'Left out the month in which the loan was given, although it was given on the first day of that month.'],
    ]);
    return n && {
      prompt: `${a} and ${b} are partners in ${firmOf(rng)}. ${silent} On ${firstOf(yr, k)}, ${a} gave the firm a loan of ${inr(loan)} and asks for interest on it at ${r}% p.a., which ${b} does not accept. How much interest on the loan is ${a} entitled to for the ${yr.ended}?`,
      ...n,
      explanation: [
        'With no agreement on the rate, a partner\'s loan earns interest at 6% p.a.',
        `From ${firstOf(yr, k)} to ${yr.on} is ${m} months.`,
        `Interest = ${inr(loan)} x 6/100 x ${m}/12 = ${inr(answer)}.`,
      ],
      hints: H.noDeed,
    };
  },
  verify: (q) => {
    const loan = read(q.prompt, /loan of (₹[\d,]+)/);
    const m = monthsLeft(q.prompt.slice(0, q.prompt.indexOf('gave the firm')))[0];
    return near(q.answer / 100, ((loan * 0.06) / 12) * m);
  },
});

const noDeedProfitShare = numericTemplate({
  id: 'pf-no-deed-profit-share', topicId: T, conceptId: 'pf-no-deed', difficulty: 'easy', unit: 'rupees',
  generate: (rng) => {
    const n = rng.pick([2, 2, 3]);
    const names = partners(rng, n);
    const yr = yearOf(rng);
    const units = rng.pick(n === 2 ? CAPS2 : CAPS3);
    const caps = units.map((u) => u * 100000);
    const U = sum(units);
    const step = n * U * 1000;
    const profit = step * rng.int(Math.ceil(120000 / step), Math.floor(900000 / step));
    const i = rng.int(0, n - 1);
    const salaryClaim = rng.int(0, 1) === 1;
    const s = rng.step(3000, 9000, 1000);
    const claim = salaryClaim
      ? `${names[0]}, who manages the business, claims a salary of ${inr(s)} per month before the profit is shared.`
      : `${names[0]} wants the profit shared in the ratio of capitals.`;
    const answer = profit / n;
    const num = numeric(answer, [
      [(profit * units[i]) / U, 'Shared the profit in the ratio of capitals; without an agreement the capitals do not decide the shares.'],
      ...(salaryClaim
        ? ([
            i === 0
              ? [(profit - 12 * s) / n + 12 * s, 'Allowed the salary claimed and shared only the rest; without an agreement no partner gets a salary.']
              : [(profit - 12 * s) / n, 'Took out the salary claimed before sharing; without an agreement no partner gets a salary.'],
          ] as [number, string][])
        : []),
      [profit, 'Gave the whole profit of the firm, not the share of one partner.'],
    ]);
    return num && {
      prompt: `${list(names)} are partners in ${firmOf(rng)} with capitals of ${list(caps.map(inr))} respectively. There is no partnership deed. ${claim} The net profit for the ${yr.ended} is ${inr(profit)}. How much of this profit goes to ${names[i]}?`,
      ...num,
      explanation: [
        'There is no agreement, so the Indian Partnership Act, 1932 applies: profits are shared equally, and no salary or interest on capital is allowed.',
        `Share of each of the ${n} partners = ${inr(profit)} / ${n} = ${inr(answer)}.`,
      ],
      hints: H.noDeed,
    };
  },
  verify: (q) => {
    const n = amountsIn(/capitals of (.+?) respectively/.exec(q.prompt)?.[1] ?? '').length;
    const profit = read(q.prompt, /is (₹[\d,]+)\. How much/);
    return n >= 2 && q.answer * n === profit * 100;
  },
});

type Place = 'plDr' | 'appDr' | 'appCr' | 'plCr';
const PLACES: Record<Place, string> = {
  plDr: 'On the debit side of Profit and Loss A/c, as a charge against profit',
  appDr: 'On the debit side of Profit and Loss Appropriation A/c, as an appropriation of profit',
  appCr: 'On the credit side of Profit and Loss Appropriation A/c',
  plCr: 'On the credit side of Profit and Loss A/c',
};
type ItemKind = 'charge' | 'appropriation' | 'drawings';
const PLACE_WHY: Record<ItemKind, Partial<Record<Place, string>>> = {
  charge: {
    appDr: 'Treated it like interest on capital or a partner\'s salary. It is due whether or not there is a profit, so it is a charge.',
    appCr: 'Took an expense of the firm for an income, and put it in the account that only shares out the profit.',
    plCr: 'Took an expense of the firm for an income.',
  },
  appropriation: {
    plDr: 'Treated a part of the profit, given out or set aside as the partners agreed, as an expense of the business.',
    appCr: 'Put it on the side that shows what comes into the account; an appropriation is taken out of the profit.',
    plCr: 'Took an appropriation of profit for an income of the business.',
  },
  drawings: {
    appDr: 'Put what the partner pays the firm on the side that shows what the firm gives the partners.',
    plDr: 'Treated interest on drawings as an expense; it is a gain of the firm from its partner.',
    plCr: 'Put it with the incomes of the business; it arises from the agreement between the partners, so it goes to Profit and Loss Appropriation A/c.',
  },
};
const PLACE_RIGHT: Record<ItemKind, Place> = { charge: 'plDr', appropriation: 'appDr', drawings: 'appCr' };
const PLACE_EXPLAIN: Record<ItemKind, string> = {
  charge: 'It has to be paid whether the firm earns a profit or not, so it is a charge against profit and is debited to Profit and Loss A/c before the net profit is found.',
  appropriation: 'It is given out of the profit because the partners have agreed to it, so it is an appropriation: it is debited to Profit and Loss Appropriation A/c.',
  drawings: 'Interest on drawings is what the partners pay the firm under their agreement. It adds to the profit to be shared, so it is credited to Profit and Loss Appropriation A/c.',
};
const PL_ITEMS: { kind: ItemKind; text: (a: string, x: string) => string }[] = [
  { kind: 'charge', text: (a, x) => `interest of ${x} on a loan that ${a} had given to the firm` },
  { kind: 'charge', text: (a, x) => `rent of ${x} for the building that belongs to ${a} and is used as the office of the firm` },
  { kind: 'charge', text: (_a, x) => `a commission of ${x} due to the manager of the firm, who is an employee and not a partner` },
  { kind: 'appropriation', text: (a, x) => `interest on capital of ${x} allowed to ${a} under the deed, which does not treat it as a charge` },
  { kind: 'appropriation', text: (a, x) => `a salary of ${x} allowed to ${a}, a partner, under the deed` },
  { kind: 'appropriation', text: (a, x) => `a commission of ${x} allowed to ${a}, a partner, under the deed` },
  { kind: 'appropriation', text: (_a, x) => `a transfer of ${x} to General Reserve, as the deed requires` },
  { kind: 'drawings', text: (a, x) => `interest of ${x} charged on the drawings of ${a}` },
];
const chargeOrAppropriation = mcqTemplate({
  id: 'pf-charge-or-appropriation', topicId: T, conceptId: 'pf-appropriation', difficulty: 'easy',
  generate: (rng) => {
    const [a, b] = partners(rng, 2);
    const yr = yearOf(rng);
    const item = rng.pick(PL_ITEMS);
    // Interest on drawings is a small sum beside a salary, a rent or interest on capital.
    const x = inr(item.kind === 'drawings' ? rng.step(900, 9000, 300) : rng.step(6000, 96000, 3000));
    const right = PLACE_RIGHT[item.kind];
    const wrong = (Object.keys(PLACES) as Place[]).filter((p) => p !== right).map((p): [string, string] => [PLACES[p], PLACE_WHY[item.kind][p]!]);
    return choice(
      `${a} and ${b} are partners in ${firmOf(rng)}, which prepares a Profit and Loss A/c and then a Profit and Loss Appropriation A/c. The accounts of the ${yr.ended} include ${item.text(rng.pick([a, b]), x)}. Where is this amount shown?`,
      PLACES[right], wrong, PLACE_EXPLAIN[item.kind], H.charge,
    );
  },
  verify: (q) => {
    const kind: ItemKind = /drawings/.test(q.prompt) ? 'drawings' : /loan|rent|manager/.test(q.prompt) ? 'charge' : 'appropriation';
    return optionText(q) === PLACES[PLACE_RIGHT[kind]];
  },
});

const CAPITAL_ITEMS: { toCapital: boolean; range: [number, number, number]; text: (a: string, x: string, yr: Year) => string }[] = [
  { toCapital: true, range: [50000, 300000, 50000], text: (a, x, yr) => `${a} brought in ${x} as additional capital on ${firstOf(yr, 6)}.` },
  { toCapital: true, range: [50000, 200000, 50000], text: (a, x, yr) => `With the consent of the other partner, ${a} permanently withdrew ${x} of capital on ${firstOf(yr, 6)}.` },
  { toCapital: false, range: [36000, 144000, 12000], text: (a, x) => `${a}'s Drawings A/c, which shows ${x} withdrawn during the year against the expected profit, is closed at the year end.` },
  { toCapital: false, range: [10000, 60000, 2500], text: (a, x) => `${a} is allowed interest on capital of ${x} for the year.` },
  { toCapital: false, range: [36000, 120000, 12000], text: (a, x) => `${a} is allowed a salary of ${x} for the year.` },
  { toCapital: false, range: [40000, 200000, 5000], text: (a, x) => `${a} is credited with ${x} as the share of the profit of the year.` },
  { toCapital: false, range: [900, 6000, 300], text: (a, x) => `${a} is charged interest on drawings of ${x} for the year.` },
  { toCapital: false, range: [10000, 80000, 5000], text: (a, x) => `${a} has to bear ${x} as the share of the loss of the year.` },
];
const capitalAccountItem = mcqTemplate({
  id: 'pf-capital-account-item', topicId: T, conceptId: 'pf-capitals', difficulty: 'easy',
  generate: (rng) => {
    const [a, b] = partners(rng, 2);
    const yr = yearOf(rng);
    const fixed = rng.int(0, 3) > 0;
    const item = rng.pick(CAPITAL_ITEMS);
    const x = inr(rng.step(...item.range));
    const capital = `${a}'s Capital A/c`;
    const current = `${a}'s Current A/c`;
    const right = fixed && !item.toCapital ? current : capital;
    const wrong: [string, string][] = [
      fixed
        ? item.toCapital
          ? [current, 'Passed a change in the capital itself through the Current A/c, which is for drawings, interest, salary and the share of profit.']
          : [capital, 'Changed a fixed capital; it changes only when capital is brought in or permanently withdrawn.']
        : [current, 'Used a Current A/c, which is kept only when capitals are fixed.'],
      [`${a}'s Loan A/c`, 'Treated the amount as a loan between the partner and the firm; nothing has been lent.'],
      ['Profit and Loss Appropriation A/c only', 'Named the account that shares out the profit; the question is which account of the partner takes the amount.'],
    ];
    const explanation = fixed
      ? item.toCapital
        ? 'With fixed capitals, the Capital A/c changes only when capital is brought in or permanently withdrawn, and this is such a change.'
        : 'With fixed capitals, the Capital A/c is left alone: drawings, interest on capital and on drawings, salary, commission and the share of profit or loss all go through the Current A/c.'
      : 'With fluctuating capitals there is only one account for each partner, the Capital A/c, and every item passes through it.';
    return choice(
      `${a} and ${b} are partners in ${firmOf(rng)}. ${capitalsAre(fixed)} In the ${yr.ended}: ${item.text(a, x, yr)} In which account of ${a} is this recorded?`,
      right, wrong, explanation, H.capitals,
    );
  },
  verify: (q) => {
    const fixed = q.prompt.includes('capitals are fixed');
    const toCapital = /additional capital|withdrew .+ of capital/.test(q.prompt);
    return (optionText(q) ?? '').endsWith(fixed && !toCapital ? 'Current A/c' : 'Capital A/c');
  },
});

const iocSimple = numericTemplate({
  id: 'pf-ioc-simple', topicId: T, conceptId: 'pf-ioc', difficulty: 'easy', unit: 'rupees',
  generate: (rng) => {
    const [a, b] = partners(rng, 2);
    const yr = yearOf(rng);
    const caps = [rng.step(200000, 900000, 50000), rng.step(150000, 800000, 50000)];
    if (caps[0] === caps[1]) return null;
    const r = rng.pick([5, 6, 8, 10, 12]);
    const fixed = rng.int(0, 1) === 0;
    const cur = [rng.step(20000, 90000, 10000), rng.step(10000, 80000, 10000)];
    const int = caps.map((c) => (c * r) / 100);
    const total = rng.int(0, 3) === 0;
    const i = rng.int(0, 1);
    const names = [a, b];
    const setting = fixed
      ? `Their capitals are fixed at ${inr(caps[0])} and ${inr(caps[1])} respectively, and their current accounts show credit balances of ${inr(cur[0])} and ${inr(cur[1])}. The deed allows interest at ${r}% p.a. on the fixed capitals only.`
      : `Their capitals are fluctuating. On ${yr.from} the capitals were ${inr(caps[0])} and ${inr(caps[1])} respectively, and no capital was brought in or withdrawn during the year. The deed allows interest on capital at ${r}% p.a.`;
    const answer = total ? sum(int) : int[i];
    const n = numeric(answer, [
      ...(total
        ? ([[int[0], 'Worked out the interest of one partner only; the total for both is asked.']] as [number, string][])
        : ([
            [int[1 - i], 'Worked out the interest on the capital of the other partner.'],
            [sum(int), 'Gave the interest of both partners together; only one partner is asked for.'],
          ] as [number, string][])),
      ...(fixed
        ? ([[total ? ((sum(caps) + sum(cur)) * r) / 100 : ((caps[i] + cur[i]) * r) / 100, 'Added the current account balance to the capital; the deed allows interest on the fixed capital only.']] as [number, string][])
        : []),
      [answer / 2, 'Charged six months, as is done for drawings whose dates are not known; the capital stayed in the firm for the whole year.'],
    ]);
    return n && {
      prompt: `${a} and ${b} are partners in ${firmOf(rng)}. ${setting} The profit of the ${yr.ended} is more than enough to cover the interest. ${total ? 'What is the total interest on capital allowed to the two partners for the year?' : `How much interest on capital is ${names[i]} allowed for the year?`}`,
      ...n,
      explanation: total
        ? ['Interest on capital = Capital x Rate/100, for a full year.', `${a}: ${inr(caps[0])} x ${r}/100 = ${inr(int[0])}. ${b}: ${inr(caps[1])} x ${r}/100 = ${inr(int[1])}.`, `Total = ${inr(int[0])} + ${inr(int[1])} = ${inr(answer)}.`]
        : ['Interest on capital = Capital x Rate/100, for a full year.', `${names[i]}: ${inr(caps[i])} x ${r}/100 = ${inr(answer)}.`],
      hints: H.ioc,
    };
  },
  verify: (q) => {
    const [c0, c1] = amountsIn(q.prompt);
    const r = rateIn(q.prompt);
    if (q.prompt.includes('total interest')) return near(q.answer / 100, ((c0 + c1) / 100) * r);
    const asked = /is (\w+) allowed for the year/.exec(q.prompt)?.[1];
    return near(q.answer / 100, ((q.prompt.startsWith(`${asked} and`) ? c0 : c1) / 100) * r);
  },
});

const iodWholeAmount = numericTemplate({
  id: 'pf-iod-whole-amount', topicId: T, conceptId: 'pf-iod', difficulty: 'easy', unit: 'rupees',
  generate: (rng) => {
    const [a] = partners(rng, 1);
    const yr = yearOf(rng);
    const d = rng.step(24000, 240000, 12000);
    const r = rng.pick([6, 8, 9, 10, 12]);
    const firm = firmOf(rng);
    const rule = rng.pick([`The deed charges interest on drawings at ${r}% p.a.`, `Under the deed, interest on drawings is charged at ${r}% p.a.`]);
    if (rng.int(0, 2) === 0) {
      const answer = (d * r * 6) / 1200;
      const n = numeric(answer, [
        [(d * r) / 100, 'Charged interest for all twelve months. When the dates are not known the drawings are taken as spread evenly over the year, which gives six months.'],
        [(d * r * 13) / 2400, 'Used 6.5 months, the period for equal drawings at the beginning of every month.'],
        [(d * r * 11) / 2400, 'Used 5.5 months, the period for equal drawings at the end of every month.'],
      ]);
      return n && {
        prompt: `${a}, a partner in ${firm}, withdrew ${inr(d)} in all during the ${yr.ended}. The dates of the withdrawals are not known. ${rule} Find the interest on ${a}'s drawings for the year.`,
        ...n,
        explanation: ['When the dates of drawings are not given, interest is charged on the total for an average period of six months.', `Interest = ${inr(d)} x ${r}/100 x 6/12 = ${inr(answer)}.`],
        hints: H.iod,
      };
    }
    const monthEnd = rng.int(0, 1) === 1;
    const k = monthEnd ? rng.int(0, 9) : rng.int(1, 10);
    const m = monthEnd ? 11 - k : 12 - k;
    const date = monthEnd ? lastOf(yr, k) : firstOf(yr, k);
    const answer = (d * r * m) / 1200;
    const n = numeric(answer, [
      [(d * r) / 100, 'Charged interest for all twelve months, although the money was taken part-way through the year.'],
      [(d * r * 6) / 1200, 'Ignored the date and used six months, which is only for drawings whose dates are not known.'],
      [(d * r * (12 - m)) / 1200, 'Counted the months before the withdrawal instead of the months from the withdrawal to the end of the year.'],
      monthEnd
        ? [(d * r * (m + 1)) / 1200, 'Counted the month of the withdrawal as well, although the money was taken on its last day.']
        : [(d * r * (m - 1)) / 1200, 'Left out the month of the withdrawal, although the money was taken on its first day.'],
    ]);
    return n && {
      prompt: `${a}, a partner in ${firm}, withdrew ${inr(d)} on ${date} for personal use and made no other drawings in the ${yr.ended}. ${rule} Find the interest on ${a}'s drawings for the year.`,
      ...n,
      explanation: [`From ${date} to ${yr.on} is ${m} months.`, `Interest = ${inr(d)} x ${r}/100 x ${m}/12 = ${inr(answer)}.`],
      hints: H.iod,
    };
  },
  verify: (q) => {
    const d = amountsIn(q.prompt)[0];
    const r = rateIn(q.prompt);
    const m = q.prompt.includes('not known') ? 6 : monthsLeft(q.prompt.slice(0, q.prompt.indexOf('for personal use')))[0];
    return near(q.answer / 100, (((d / 100) * r) / 12) * m);
  },
});

type Every = 'month' | 'quarter' | 'half-year';
type When = 'beginning' | 'middle' | 'end';
const GAP: Record<Every, number> = { month: 1, quarter: 3, 'half-year': 6 };
const WHENS: When[] = ['beginning', 'middle', 'end'];
/** Months to the year end of the first and of the last of the equal drawings of a year. */
const firstLast = (every: Every, when: When): [number, number] => {
  const lead = when === 'beginning' ? 0 : when === 'middle' ? GAP[every] / 2 : GAP[every];
  return [12 - lead, GAP[every] - lead];
};
const averagePeriod = (every: Every, when: When): number => sum(firstLast(every, when)) / 2;
const timing = (every: Every, when: When): string =>
  `${when === 'middle' ? 'in the middle' : `at the ${when}`} of ${every === 'half-year' ? 'each half-year' : `every ${every}`}`;
const monthsText = (p: number): string => `${p} ${p === 1 ? 'month' : 'months'}`;

const iodAveragePeriod = mcqTemplate({
  id: 'pf-iod-average-period', topicId: T, conceptId: 'pf-iod', difficulty: 'easy',
  generate: (rng) => {
    const [a] = partners(rng, 1);
    const yr = yearOf(rng);
    const every = rng.pick<Every>(['month', 'month', 'quarter', 'quarter', 'half-year']);
    const when = rng.pick(WHENS);
    const d = rng.step(4000, 30000, 2000) * GAP[every];
    const r = rng.pick([6, 8, 9, 10, 12]);
    const p = averagePeriod(every, when);
    const [first, last] = firstLast(every, when);
    const other = rng.pick((['month', 'quarter', 'half-year'] as Every[]).filter((e) => e !== every));
    const wrong: [string, string][] = [
      ...WHENS.filter((w) => w !== when).map((w): [string, string] => [monthsText(averagePeriod(every, w)), `Used the period for drawings made ${timing(every, w)}.`]),
      ['12 months', 'Charged the whole year, as if the full amount had been withdrawn on the first day.'],
      [monthsText(averagePeriod(other, when)), `Used the period for drawings made ${timing(other, when)}; here the money is drawn ${timing(every, when)}.`],
    ];
    return choice(
      `${a}, a partner in ${firmOf(rng)}, withdraws ${inr(d)} ${timing(every, when)} throughout the ${yr.ended}. Interest on drawings is charged at ${r}% p.a. On the total drawings of the year, for what average period is the interest worked out?`,
      monthsText(p), wrong,
      `The first amount is out of the firm for ${monthsText(first)} and the last for ${monthsText(last)}. Average period = (${first} + ${last}) / 2 = ${monthsText(p)}.`, H.iod,
    );
  },
  verify: (q) => {
    // Every withdrawal of the year, with the months it is out of the firm: their average is the period.
    const every: Every = q.prompt.includes('half-year') ? 'half-year' : q.prompt.includes('quarter') ? 'quarter' : 'month';
    const lead = q.prompt.includes('at the beginning') ? 0 : q.prompt.includes('in the middle') ? GAP[every] / 2 : GAP[every];
    const out: number[] = [];
    for (let start = 0; start < 12; start += GAP[every]) out.push(12 - start - lead);
    return optionText(q) === monthsText(sum(out) / out.length);
  },
});

const divisibleProfit = numericTemplate({
  id: 'pf-divisible-profit', topicId: T, conceptId: 'pf-appropriation', difficulty: 'easy', unit: 'rupees',
  generate: (rng) => {
    const [a, b] = partners(rng, 2);
    const yr = yearOf(rng);
    const profit = rng.step(300000, 900000, 10000);
    const s = rng.step(3000, 12000, 1000);
    const ioc = [rng.step(12000, 60000, 2000), rng.step(10000, 50000, 2000)];
    const iod = [rng.step(900, 4500, 300), rng.step(600, 3600, 300)];
    const withDrawings = rng.int(0, 3) > 0;
    const paid = 12 * s + sum(ioc);
    const got = withDrawings ? sum(iod) : 0;
    const answer = profit - paid + got;
    const who = rng.pick([a, b]);
    const n = numeric(answer, [
      [profit - s - sum(ioc) + got, 'Took out the salary of one month only; the salary is for twelve months.'],
      ...(withDrawings
        ? ([
            [profit - paid - got, 'Deducted the interest on drawings; it is paid by the partners to the firm, so it is added.'],
            [profit - paid, 'Left out the interest on drawings, which adds to the profit to be shared.'],
          ] as [number, string][])
        : []),
      [profit - 12 * s + got, 'Took out the salary but forgot the interest on capital.'],
      [profit - sum(ioc) + got, 'Forgot to take out the partner\'s salary.'],
    ]);
    return n && {
      prompt: [
        `${a} and ${b} are partners in ${firmOf(rng)}. The net profit for the ${yr.ended} is ${inr(profit)}, and the deed provides for the items below. How much profit is left to be shared between the partners?`,
        `Salary to ${who}: ${inr(s)} per month`,
        `Interest on capital: ${a} ${inr(ioc[0])}, ${b} ${inr(ioc[1])}`,
        ...(withDrawings ? [`Interest on drawings: ${a} ${inr(iod[0])}, ${b} ${inr(iod[1])}`] : []),
      ].join('\n'),
      ...n,
      explanation: [
        `Salary for the year = ${inr(s)} x 12 = ${inr(12 * s)}. Interest on capital = ${inr(ioc[0])} + ${inr(ioc[1])} = ${inr(sum(ioc))}.`,
        withDrawings
          ? `Divisible profit = ${inr(profit)} + interest on drawings ${inr(got)} - salary ${inr(12 * s)} - interest on capital ${inr(sum(ioc))} = ${inr(answer)}.`
          : `Divisible profit = ${inr(profit)} - salary ${inr(12 * s)} - interest on capital ${inr(sum(ioc))} = ${inr(answer)}.`,
      ],
      hints: H.approp,
    };
  },
  verify: (q) => {
    // The Profit and Loss Appropriation A/c must agree: what comes in is what goes out plus the profit shared.
    const [profit, s, i0, i1, d0 = 0, d1 = 0] = amountsIn(q.prompt);
    return profit + d0 + d1 === 12 * s + i0 + i1 + q.answer / 100;
  },
});

const shareOfProfit = numericTemplate({
  id: 'pf-share-of-profit', topicId: T, conceptId: 'pf-appropriation', difficulty: 'easy', unit: 'rupees',
  generate: (rng) => {
    const n = rng.pick([2, 3, 3]);
    const names = partners(rng, n);
    const yr = yearOf(rng);
    const psr = psrOf(rng, n);
    const total = sum(psr);
    const step = total * 1000;
    const amount = step * rng.int(Math.ceil(90000 / step), Math.floor(720000 / step));
    const i = rng.int(0, n - 1);
    const loss = rng.int(0, 4) === 0;
    const what = loss ? 'loss' : 'profit';
    const answer = (amount * psr[i]) / total;
    const j = (i + 1) % n;
    const num = numeric(answer, [
      [amount / n, `Shared the ${what} equally, although the deed gives a ratio.`],
      [(amount * psr[j]) / total, `Used the term of ${names[j]} in the ratio instead of the term of ${names[i]}.`],
      psr[i] === 1
        ? [amount, `Gave the whole ${what} of the firm, not the part of one partner.`]
        : [amount / psr[i], `Divided the ${what} by the partner's own term, ${psr[i]}, instead of multiplying by ${psr[i]}/${total}.`],
      [amount / total, `Found the value of one part of the ratio but did not multiply it by the partner's term, ${psr[i]}.`],
    ]);
    return num && {
      prompt: loss
        ? `${list(names)} are partners in ${firmOf(rng)} sharing profits and losses in the ratio ${ratioText(psr)}. The firm made a net loss of ${inr(amount)} in the ${yr.ended}. How much of the loss does ${names[i]} bear?`
        : `${list(names)} are partners in ${firmOf(rng)} sharing profits and losses in the ratio ${ratioText(psr)}. After all the appropriations, the profit of the ${yr.ended} left to be shared is ${inr(amount)}. What is ${names[i]}'s share?`,
      ...num,
      explanation: [`The terms of the ratio add up to ${psr.join(' + ')} = ${total}.`, `${names[i]}'s share = ${inr(amount)} x ${psr[i]}/${total} = ${inr(answer)}.`],
      hints: ['Add the terms of the ratio to find the number of parts.', 'Share = Amount x the partner\'s term / total of the terms.'],
    };
  },
  verify: (q) => {
    const psr = (/ratio ([\d:]+)\./.exec(q.prompt)?.[1] ?? '').split(':').map(Number);
    const names = (/^(.+?) are partners/.exec(q.prompt)?.[1] ?? '').split(/, | and /);
    const asked = /does (\w+) bear|is (\w+)'s share/.exec(q.prompt);
    const i = names.indexOf(asked?.[1] ?? asked?.[2] ?? '');
    // One part of the ratio, taken from the answer, must rebuild the whole amount.
    return i >= 0 && near((q.answer / 100 / psr[i]) * sum(psr), amountsIn(q.prompt)[0]);
  },
});

const gcd = (a: number, b: number): number => (b === 0 ? a : gcd(b, a % b));
const lcm = (a: number, b: number): number => (a * b) / gcd(a, b);
const FRACTION_PAIRS: [[number, number], [number, number]][] = [
  [[1, 2], [1, 3]], [[2, 5], [1, 3]], [[1, 2], [1, 4]], [[1, 3], [1, 4]], [[3, 8], [1, 2]], [[2, 5], [2, 5]], [[1, 4], [1, 2]],
  [[4, 9], [1, 3]], [[1, 2], [3, 10]], [[3, 7], [2, 7]], [[5, 12], [1, 3]], [[1, 2], [1, 5]], [[3, 10], [2, 5]],
];
const ratioFromFractions = numericTemplate({
  id: 'pf-ratio-from-fractions', topicId: T, conceptId: 'pf-appropriation', difficulty: 'easy', unit: 'ratio',
  generate: (rng) => {
    const names = partners(rng, 3);
    const [a, b, c] = names;
    const order = `State the ratio in the order ${a}, ${b}, ${c}.`;
    const intro = `${list(names)} start ${firmOf(rng)}.`;
    if (rng.int(0, 1) === 0) {
      const [[n1, d1], [n2, d2]] = rng.pick(FRACTION_PAIRS);
      const den = lcm(d1, d2);
      const x = (n1 * den) / d1;
      const y = (n2 * den) / d2;
      const rest = den - x - y;
      const r = ratio([x, y, rest], [
        [[n1, n2, rest], 'Took the numerators as they stand, without first bringing the fractions to a common denominator.'],
        [[x, y, Math.abs(x - y)], `Took ${c}'s share as the difference of the two fractions instead of what is left from 1.`],
        [[1, 1, 1], 'Shared the profit equally and ignored the fractions agreed.'],
        [[rest, x, y], `Put ${c}'s share first; the ratio is asked in the order ${a}, ${b}, ${c}.`],
      ]);
      return r && {
        prompt: `${intro} They agree that ${a} gets ${n1}/${d1} of the profit, ${b} gets ${n2}/${d2} and ${c} gets what is left. What is their profit-sharing ratio? ${order}`,
        ...r,
        explanation: [
          `${c}'s share = 1 - ${n1}/${d1} - ${n2}/${d2} = ${rest}/${den}.`,
          `With ${den} as the common denominator the shares are ${x}/${den}, ${y}/${den} and ${rest}/${den}.`,
          `Ratio = ${x}:${y}:${rest}${r.answer.join(':') !== `${x}:${y}:${rest}` ? ` = ${ratioText(r.answer)}` : ''}.`,
        ],
        hints: ['Find the share that is left: 1 minus the other shares.', 'Bring all the shares to a common denominator; the numerators are then the ratio.'],
      };
    }
    const [n1, d1] = rng.pick<[number, number]>([[1, 4], [1, 3], [1, 5], [2, 5], [1, 2], [3, 8], [2, 7], [1, 6]]);
    const [p, q] = rng.pick<[number, number]>([[1, 1], [3, 2], [2, 1], [3, 1], [4, 3]]);
    const terms = [n1 * (p + q), (d1 - n1) * p, (d1 - n1) * q];
    const how = p === q ? 'equally' : `in the ratio ${p}:${q}`;
    const r = ratio(terms, [
      [[n1, p, q], `Wrote the numerator of ${a}'s fraction beside the ratio of the other two, without sharing out what is left.`],
      [[n1 * (p + q), d1 * p, d1 * q], `Applied the ratio of ${b} and ${c} to the whole profit instead of to what is left after ${a}'s share.`],
      [[1, 1, 1], 'Shared the profit equally among all three and ignored what was agreed.'],
    ]);
    return r && {
      prompt: `${intro} They agree that ${a} gets ${n1}/${d1} of the profit and that ${b} and ${c} share the rest ${how}. What is their profit-sharing ratio? ${order}`,
      ...r,
      explanation: [
        `What is left after ${a}'s share = 1 - ${n1}/${d1} = ${d1 - n1}/${d1}.`,
        `${b} gets ${d1 - n1}/${d1} x ${p}/${p + q} = ${(d1 - n1) * p}/${d1 * (p + q)} and ${c} gets ${d1 - n1}/${d1} x ${q}/${p + q} = ${(d1 - n1) * q}/${d1 * (p + q)}.`,
        `${a}'s share is ${n1 * (p + q)}/${d1 * (p + q)}, so the ratio is ${terms.join(':')}${terms.join(':') !== r.answer.join(':') ? ` = ${ratioText(r.answer)}` : ''}.`,
      ],
      hints: ['Find what is left after the first share, then split it between the other two.', 'Bring all three shares to a common denominator; the numerators are then the ratio.'],
    };
  },
  verify: (q) => {
    // The shares as decimal fractions: each term of the answer, over their total, must be that partner's share.
    const fr = [...q.prompt.matchAll(/(\d+)\/(\d+)/g)].map((m) => Number(m[1]) / Number(m[2]));
    let shares: number[];
    if (q.prompt.includes('what is left')) shares = [fr[0], fr[1], 1 - fr[0] - fr[1]];
    else {
      const split = /in the ratio (\d+):(\d+)/.exec(q.prompt);
      const [p, s] = split ? [Number(split[1]), Number(split[2])] : [1, 1];
      shares = [fr[0], ((1 - fr[0]) * p) / (p + s), ((1 - fr[0]) * s) / (p + s)];
    }
    const total = sum(q.answer);
    return q.answer.length === 3 && q.answer.every((t, i) => near(t / total, shares[i]));
  },
});

const commissionBefore = numericTemplate({
  id: 'pf-commission-before', topicId: T, conceptId: 'pf-salary-commission', difficulty: 'easy', unit: 'rupees',
  generate: (rng) => {
    const [a, b] = partners(rng, 2);
    const yr = yearOf(rng);
    const r = rng.pick([5, 10, 20, 25]);
    const step = (100 + r) * 1000;
    const profit = step * rng.int(Math.ceil(200000 / step), Math.floor(900000 / step));
    const commission = (profit * r) / 100;
    const after = (profit * r) / (100 + r);
    const askLeft = rng.int(0, 2) === 0;
    const intro = `${a} and ${b} are partners in ${firmOf(rng)}. Under the deed ${a} gets a commission of ${r}% of the net profit before charging such commission. The net profit of the ${yr.ended}, before the commission, is ${inr(profit)}.`;
    const n = askLeft
      ? numeric(profit - commission, [
          [commission, 'Gave the commission itself, not the profit that is left after it.'],
          [profit - after, 'Worked the commission on the profit after charging it, although the deed says before.'],
          [profit, 'Left the commission out altogether.'],
        ])
      : numeric(commission, [
          [after, `Worked the commission on the profit after charging it (${r}/${100 + r}), although the deed says before.`],
          [profit - commission, 'Gave the profit that is left after the commission, not the commission.'],
        ]);
    return n && {
      prompt: `${intro} ${askLeft ? 'How much profit is left after the commission?' : `What is ${a}'s commission?`}`,
      ...n,
      explanation: [
        `Commission before charging it = Net profit x Rate/100 = ${inr(profit)} x ${r}/100 = ${inr(commission)}.`,
        ...(askLeft ? [`Profit left = ${inr(profit)} - ${inr(commission)} = ${inr(profit - commission)}.`] : []),
      ],
      hints: H.comm,
    };
  },
  verify: (q) => {
    const profit = amountsIn(q.prompt)[0];
    const r = read(q.prompt, /commission of (\d+)%/);
    const commission = q.prompt.includes('is left after') ? profit - q.answer / 100 : q.answer / 100;
    return near(commission / profit, r / 100);
  },
});

type Allowed = 'capital' | 'salary' | 'commission' | 'drawings';
const ALLOW: Record<Allowed, { account: string; name: string; range: [number, number, number]; text: (a: string, x: string) => string; ask: string; distractors: (a: string) => string[] }> = {
  capital: {
    account: 'interestOnCapital', name: 'Interest on Capital A/c', range: [6000, 72000, 1500],
    text: (a, x) => `${a} is allowed interest on capital of ${x}`, ask: 'credits the partner with the interest',
    distractors: () => ['interestOnDrawings', 'interestOnPartnersLoan'],
  },
  salary: {
    account: 'partnersSalary', name: 'Partner\'s Salary A/c', range: [24000, 144000, 6000],
    text: (a, x) => `${a} is allowed a salary of ${x}`, ask: 'credits the partner with the salary',
    distractors: () => ['salaries', 'partnersCommission'],
  },
  commission: {
    account: 'partnersCommission', name: 'Partner\'s Commission A/c', range: [5000, 80000, 2500],
    text: (a, x) => `${a} is allowed a commission of ${x}`, ask: 'credits the partner with the commission',
    distractors: () => ['commissionPaid', 'partnersSalary'],
  },
  drawings: {
    account: 'interestOnDrawings', name: 'Interest on Drawings A/c', range: [600, 7500, 300],
    text: (a, x) => `${a} is charged interest on drawings of ${x}`, ask: 'charges the partner with the interest',
    distractors: (a) => [partnerDrawings(a), 'interestOnCapital'],
  },
};
const OWN_ACCOUNTS = 'The firm records each appropriation in an account of its own (Interest on Capital A/c, Partner\'s Salary A/c and so on) before closing it to Profit and Loss Appropriation A/c.';
/** Interest on drawings is not an appropriation, so the sentence above does not cover it: the prompt names its account. */
const OWN_DRAWINGS = 'The firm records interest on drawings in Interest on Drawings A/c before closing that account to Profit and Loss Appropriation A/c.';

const journalAllow = journalTemplate({
  id: 'pf-journal-allow', topicId: T, conceptId: 'pf-appropriation', difficulty: 'easy',
  generate: (rng) => {
    const [a, b] = partners(rng, 2);
    const yr = yearOf(rng);
    const fixed = rng.int(0, 1) === 0;
    const kind = rng.pick<Allowed>(['capital', 'salary', 'commission', 'drawings']);
    const item = ALLOW[kind];
    const amt = rng.step(...item.range);
    const own = ownId(fixed, a);
    const other = fixed ? partnerCapital(a) : partnerCurrent(a);
    const owes = kind === 'drawings';
    return {
      prompt: `${a} and ${b} are partners in ${firmOf(rng)}. ${capitalsAre(fixed)} ${owes ? OWN_DRAWINGS : OWN_ACCOUNTS} For the ${yr.ended}, ${item.text(a, inr(amt))}. Pass the entry that ${item.ask}.`,
      lines: owes ? [dr(own, amt), cr(item.account, amt)] : [dr(item.account, amt), cr(own, amt)],
      explanation: owes
        ? [`Interest on drawings is owed by the partner to the firm, so ${ownName(fixed, a)} is debited.`, `It is a gain of the firm: ${item.name} is credited.`, whyOwn(fixed)]
        : [`The firm gives this amount to the partner: ${item.name} is debited.`, `${a} is entitled to it, so ${ownName(fixed, a)} is credited.`, whyOwn(fixed)],
      distractorAccounts: [other, 'profitAndLossAppropriation', ...item.distractors(a)],
      hints: H.entry,
    };
  },
  verify: (q: JournalQuestion) => {
    const fixed = q.prompt.includes('capitals are fixed');
    const partner = q.expected.find((l) => l.accountId.includes(':'));
    return partner !== undefined && partner.accountId.startsWith(fixed ? 'current:' : 'capital:') && (partner.side === 'Dr') === q.prompt.includes('is charged interest on drawings');
  },
});

const journalClose = journalTemplate({
  id: 'pf-journal-close', topicId: T, conceptId: 'pf-appropriation', difficulty: 'easy',
  generate: (rng) => {
    const [a, b] = partners(rng, 2);
    const yr = yearOf(rng);
    const kind = rng.int(0, 5);
    // A net profit is large, interest on drawings small, and the rest in between.
    const amt = kind === 0 ? rng.step(120000, 900000, 10000) : kind === 2 ? rng.step(1500, 12000, 300) : kind === 1 ? rng.step(3000, 48000, 1500) : rng.step(12000, 144000, 3000);
    const x = inr(amt);
    const intro = `${a} and ${b} are partners in ${firmOf(rng)}.`;
    const app = 'profitAndLossAppropriation';
    if (kind === 0) {
      return {
        prompt: `${intro} The Profit and Loss A/c for the ${yr.ended} shows a net profit of ${x}. Pass the entry that carries it to the account in which it is shared out among the partners.`,
        lines: [dr('profitAndLoss', amt), cr(app, amt)],
        explanation: ['The net profit is taken out of Profit and Loss A/c, so that account is debited.', 'It is carried to Profit and Loss Appropriation A/c, which is credited and then shares it out.'],
        distractorAccounts: [partnerCapital(a), partnerCapital(b)],
        hints: H.charge,
      };
    }
    if (kind === 1) {
      return {
        prompt: `${intro} Interest of ${x} on ${a}'s loan to the firm for the ${yr.ended} has been debited to Interest on Partner's Loan A/c and credited to ${a}'s Loan A/c. Pass the entry that closes Interest on Partner's Loan A/c at the year end.`,
        lines: [dr('profitAndLoss', amt), cr('interestOnPartnersLoan', amt)],
        explanation: ['Interest on a partner\'s loan is a charge against profit, due whether or not there is a profit.', 'So it is closed to Profit and Loss A/c, which is debited, and not to Profit and Loss Appropriation A/c.'],
        distractorAccounts: [app, partnerLoan(a), 'interestOnCapital'],
        hints: H.charge,
      };
    }
    if (kind === 2) {
      return {
        prompt: `${intro} ${OWN_DRAWINGS} Interest on drawings of ${x} for the ${yr.ended} has been charged to the partners. Pass the entry that closes Interest on Drawings A/c at the year end.`,
        lines: [dr('interestOnDrawings', amt), cr(app, amt)],
        explanation: ['Interest on drawings is a gain of the firm that adds to the profit to be shared.', 'Interest on Drawings A/c is debited to close it, and Profit and Loss Appropriation A/c is credited.'],
        distractorAccounts: ['profitAndLoss', 'interestOnCapital', partnerDrawings(a)],
        hints: H.charge,
      };
    }
    const item = ALLOW[(['capital', 'salary', 'commission'] as const)[kind - 3]];
    const what = kind === 3 ? 'Interest on capital' : kind === 4 ? `${b}'s salary` : `${b}'s commission`;
    return {
      prompt: `${intro} ${OWN_ACCOUNTS} ${what} of ${x} for the ${yr.ended} has been credited to the partner${kind === 3 ? 's' : ''}. Pass the entry that closes ${item.name} at the year end.`,
      lines: [dr(app, amt), cr(item.account, amt)],
      explanation: ['This is an appropriation of profit, made because the partners have agreed to it.', `So ${item.name} is closed to Profit and Loss Appropriation A/c, which is debited.`],
      distractorAccounts: ['profitAndLoss', ...item.distractors(a)],
      hints: H.charge,
    };
  },
  verify: (q: JournalQuestion) => {
    // A charge and the net profit itself pass through Profit and Loss A/c; an appropriation never does.
    const viaPl = /net profit of|loan to the firm/.test(q.prompt);
    return q.expected.some((l) => l.accountId === 'profitAndLoss' && l.side === 'Dr') === viaPl;
  },
});

// ===============================================================================================================
// MEDIUM
// ===============================================================================================================

const iocAdditional = numericTemplate({
  id: 'pf-ioc-additional', topicId: T, conceptId: 'pf-ioc', difficulty: 'medium', unit: 'rupees',
  generate: (rng) => {
    const [a, b] = partners(rng, 2);
    const yr = yearOf(rng);
    const open = rng.step(200000, 900000, 50000);
    const add = rng.step(60000, 300000, 60000);
    const r = rng.pick([5, 6, 8, 10, 12]);
    const k1 = rng.int(1, 8);
    const m1 = 12 - k1;
    const withdraws = rng.int(0, 2) === 0;
    const k2 = rng.int(k1 + 1, 10);
    const m2 = 12 - k2;
    const out = withdraws ? rng.step(60000, 120000, 60000) : 0;
    const full = (open * r) / 100;
    const onAdd = (add * r * m1) / 1200;
    const onOut = (out * r * m2) / 1200;
    const answer = full + onAdd - onOut;
    const d1 = firstOf(yr, k1);
    const d2 = firstOf(yr, k2);
    const n = numeric(answer, [
      [((open + add - out) * r) / 100, 'Charged a full year on the capital as it stood at the end of the year.'],
      [full, `Took interest on the opening capital only and ignored the ${withdraws ? 'changes' : 'capital brought in'} during the year.`],
      [full + (add * r * (12 - m1)) / 1200 - (out * r * (12 - m2)) / 1200, 'Counted the months before each change instead of the months from the change to the end of the year.'],
      ...(withdraws ? ([[full + onAdd + onOut, 'Added interest on the capital withdrawn instead of deducting it.'], [full + onAdd, 'Ignored the capital withdrawn, which stops earning interest from the day it leaves.']] as [number, string][]) : []),
      [full + (add * r) / 100 - onOut, 'Gave the fresh capital interest for the whole year, although it came in part-way through.'],
    ]);
    return n && {
      prompt: `${a} and ${b} are partners in ${firmOf(rng)} with fixed capitals. The deed allows interest on capital at ${r}% p.a. On ${yr.from}, ${a}'s capital was ${inr(open)}. ${a} brought in a further ${inr(add)} as capital on ${d1}${withdraws ? ` and, with ${b}'s consent, withdrew ${inr(out)} of capital on ${d2}` : ''}. The profit of the ${yr.ended} is more than enough to cover the interest. Find the interest on ${a}'s capital for the year.`,
      ...n,
      explanation: [
        `On the opening capital for 12 months: ${inr(open)} x ${r}/100 = ${inr(full)}.`,
        `On the capital brought in on ${d1}, for ${m1} months: ${inr(add)} x ${r}/100 x ${m1}/12 = ${inr(onAdd)}.`,
        ...(withdraws ? [`Less: on the capital withdrawn on ${d2}, for the ${m2} months it was out: ${inr(out)} x ${r}/100 x ${m2}/12 = ${inr(onOut)}.`] : []),
        `Interest on capital = ${inr(full)} + ${inr(onAdd)}${withdraws ? ` - ${inr(onOut)}` : ''} = ${inr(answer)}.`,
      ],
      hints: H.ioc,
    };
  },
  verify: (q) => {
    // The product method: each balance of the capital for the months it stood.
    const [open, add, out = 0] = amountsIn(q.prompt);
    const r = rateIn(q.prompt);
    const [m1, m2 = 0] = monthsLeft(q.prompt.slice(q.prompt.indexOf('brought in'), q.prompt.indexOf('The profit of')));
    const products = open * (12 - m1) + (open + add) * (m1 - m2) + (open + add - out) * m2;
    return near(q.answer / 100, (products * r) / 1200);
  },
});

interface CapitalRow {
  close: number;
  drawings: number;
  profit: number;
  fresh: number;
}
const capitalRow = (rng: Rng): CapitalRow => ({ close: rng.step(300000, 900000, 10000), drawings: rng.step(24000, 96000, 6000), profit: rng.step(40000, 150000, 5000), fresh: 0 });
const rowLine = (name: string, row: CapitalRow, yr: Year, freshOn: string): string =>
  `${name}: capital on ${yr.on} ${inr(row.close)}; drawings ${inr(row.drawings)}; share of profit ${inr(row.profit)}${row.fresh > 0 ? `; fresh capital brought in on ${freshOn} ${inr(row.fresh)}` : ''}`;
const readRow = (line: string): CapitalRow => {
  const [close, drawings, profit, fresh = 0] = amountsIn(line);
  return { close, drawings, profit, fresh };
};
const CLOSING_INTRO = (yr: Year, r: number): string =>
  `The deed allows interest on capital at ${r}% p.a. The capital balances below are those on ${yr.on}, after the drawings and the share of profit of the ${yr.ended} had been entered; the interest on capital itself has not been entered yet.`;

const iocOpeningFromClosing = numericTemplate({
  id: 'pf-ioc-opening-from-closing', topicId: T, conceptId: 'pf-ioc', difficulty: 'medium', unit: 'rupees',
  // Version 2: the second hint names every item to undo, not only drawings, profit and fresh capital.
  version: 2,
  generate: (rng) => {
    const names = partners(rng, 2);
    const yr = yearOf(rng);
    const r = rng.pick([5, 6, 8, 10]);
    const rows = names.map(() => capitalRow(rng));
    const total = rng.int(0, 3) === 0;
    const i = rng.int(0, 1);
    const of = (f: (x: CapitalRow) => number): number => ((total ? sum(rows.map(f)) : f(rows[i])) * r) / 100;
    const opening = rows.map((x) => x.close + x.drawings - x.profit);
    const answer = of((x) => x.close + x.drawings - x.profit);
    const n = numeric(answer, [
      [of((x) => x.close), 'Worked the interest on the capital at the end of the year; it is allowed on the capital at the beginning.'],
      [of((x) => x.close - x.drawings + x.profit), 'Went the wrong way: deducted the drawings and added the profit, which moves away from the opening capital.'],
      [of((x) => x.close + x.drawings), 'Added back the drawings but did not take out the share of profit that had been credited.'],
      [of((x) => x.close - x.profit), 'Took out the share of profit but did not add back the drawings.'],
    ]);
    return n && {
      prompt: [
        `${list(names)} are partners in ${firmOf(rng)} with fluctuating capitals. ${CLOSING_INTRO(yr, r)} No capital was brought in or withdrawn during the year. ${total ? 'Find the total interest on capital of the two partners for the year.' : `Find the interest on ${names[i]}'s capital for the year.`}`,
        ...rows.map((row, j) => rowLine(names[j], row, yr, '')),
      ].join('\n'),
      ...n,
      explanation: [
        'Interest is allowed on the capital at the beginning of the year: Opening capital = Closing capital + Drawings - Share of profit.',
        ...rows.flatMap((x, j) => (total || j === i ? [`${names[j]}: ${inr(x.close)} + ${inr(x.drawings)} - ${inr(x.profit)} = ${inr(opening[j])}; interest = ${inr(opening[j])} x ${r}/100 = ${inr((opening[j] * r) / 100)}.`] : [])),
        ...(total ? [`Total interest on capital = ${inr(answer)}.`] : []),
      ],
      hints: [
        'Interest runs on the capital at the beginning of the year. Undo the year: add back what was taken out of the account and take out what was credited to it.',
        'Opening capital = Closing capital + Drawings (and any interest on drawings or capital withdrawn) - Share of profit (and any salary, commission or fresh capital credited).',
      ],
    };
  },
  verify: (q) => {
    // Roll forward: the opening capital the answer implies, plus profit, less drawings, must be the closing capital.
    const r = rateIn(q.prompt);
    const rows = dataLines(q.prompt).map(readRow);
    const asked = /interest on (\w+)'s capital/.exec(q.prompt)?.[1];
    const mine = asked ? rows.filter((_, j) => dataLines(q.prompt)[j].startsWith(`${asked}:`)) : rows;
    return mine.length > 0 && near(q.answer / r + sum(mine.map((x) => x.profit - x.drawings)), sum(mine.map((x) => x.close)));
  },
});

/** Capitals, their interest and a profit-sharing ratio that is not the ratio of the capitals, for the questions on a profit too small for the interest. */
function interestSetup(rng: Rng, totals: number[]) {
  const n = rng.pick([2, 2, 3]);
  const names = partners(rng, n);
  const units = rng.pick(n === 2 ? CAPS2 : CAPS3);
  const base = rng.pick([100000, 100000, 200000]);
  const caps = units.map((u) => u * base);
  const psr = psrOf(rng, n, (p) => totals.includes(sum(p)) && !sameRatio(p, units));
  const r = rng.pick([5, 6, 8, 10, 12]);
  const int = caps.map((c) => (c * r) / 100);
  return { n, names, units, base, caps, psr, r, int, U: sum(units), total: sum(psr), due: sum(int), i: rng.int(0, n - 1) };
}
const capitalLines = (names: string[], caps: number[]): string[] => names.map((nm, j) => `${nm}: capital ${inr(caps[j])}`);
const dueLine = (names: string[], int: number[], r: number): string =>
  `Interest due at ${r}% p.a.: ${names.map((nm, j) => `${nm} ${inr(int[j])}`).join(', ')}; ${inr(sum(int))} in all.`;
/** What the prompts of the three templates below share, re-read: the capitals, the rate, the ratio and who is asked about. */
function readInterest(prompt: string) {
  const lines = dataLines(prompt);
  const caps = lines.map((l) => read(l, /capital (₹[\d,]+)/));
  const r = rateIn(prompt);
  const psr = (/in the ratio ([\d:]+)\./.exec(prompt)?.[1] ?? '').split(':').map(Number);
  const asked = /is (\w+) allowed for the year|What is (\w+)'s share of the net loss/.exec(prompt);
  const i = lines.findIndex((l) => l.startsWith(`${asked?.[1] ?? asked?.[2]}:`));
  return { caps, r, psr, i, int: caps.map((c) => (c / 100) * r) };
}

const iocInsufficient = numericTemplate({
  id: 'pf-ioc-insufficient', topicId: T, conceptId: 'pf-ioc', difficulty: 'medium', unit: 'rupees',
  generate: (rng) => {
    const s = interestSetup(rng, [2, 3, 4, 5, 6, 7, 8, 9, 10]);
    const yr = yearOf(rng);
    const { names, units, int, psr, i, r } = s;
    const enough = rng.int(0, 3) === 0;
    let profit: number;
    let n: ReturnType<typeof numeric>;
    let working: string[];
    if (enough) {
      const extra = s.U * s.total * 1000 * rng.int(1, 3);
      profit = s.due + extra;
      n = numeric(int[i], [
        [(profit * units[i]) / s.U, 'Shared the whole profit in the ratio of the interest, although the profit covers the interest in full.'],
        [int[i] + (extra * psr[i]) / s.total, 'Gave the interest and the share of profit together; only the interest on capital is asked.'],
        [(profit * psr[i]) / s.total, 'Shared the profit in the profit-sharing ratio and allowed no interest.'],
      ]);
      working = [dueLine(names, int, r), `The profit of ${inr(profit)} is more than ${inr(s.due)}, so the interest is allowed in full.`, `${names[i]} is allowed ${inr(int[i])}.`];
    } else {
      const k = rng.int(Math.max(1, r - 5), r - 1);
      profit = (s.U * s.base * k) / 100;
      const answer = (profit * units[i]) / s.U;
      n = numeric(answer, [
        [int[i], 'Allowed the interest in full, although the profit is not enough to cover it and the deed does not make it a charge.'],
        [(profit * psr[i]) / s.total, 'Shared the profit in the profit-sharing ratio; when it falls short of the interest it is given in the ratio of the interest due.'],
        [profit / s.n, 'Shared the profit equally.'],
      ]);
      working = [
        dueLine(names, int, r),
        `The profit of ${inr(profit)} is less than ${inr(s.due)}, and interest on capital is an appropriation, so only the profit can be given, in the ratio of the interest due.`,
        `${names[i]} is allowed ${inr(profit)} x ${plain(int[i])}/${plain(s.due)} = ${inr(answer)}.`,
      ];
    }
    return n && {
      prompt: [
        `${list(names)} are partners in ${firmOf(rng)} sharing profits and losses in the ratio ${ratioText(psr)}. Their capitals are fixed. The deed allows interest on capital at ${r}% p.a. as an appropriation of profit, not as a charge. The net profit for the ${yr.ended}, before interest on capital, is ${inr(profit)}. How much interest on capital is ${names[i]} allowed for the year?`,
        ...capitalLines(names, s.caps),
      ].join('\n'),
      ...n,
      explanation: working,
      hints: ['Compare the profit with the total interest due. Is there enough?', 'Interest on capital as an appropriation cannot be more than the profit: a smaller profit is shared in the ratio of the interest due.'],
    };
  },
  verify: (q) => {
    const { int, i } = readInterest(q.prompt);
    const profit = read(q.prompt, /before interest on capital, is (₹[\d,]+)/);
    const due = sum(int);
    return i >= 0 && near(q.answer / 100, profit >= due ? int[i] : (profit * int[i]) / due);
  },
});

const iocCharge = numericTemplate({
  id: 'pf-ioc-charge', topicId: T, conceptId: 'pf-ioc', difficulty: 'medium', unit: 'rupees',
  generate: (rng) => {
    const s = interestSetup(rng, [2, 4, 5, 10]);
    const yr = yearOf(rng);
    const { names, units, int, psr, i, r } = s;
    const mode = rng.int(0, 2);
    const k = rng.int(Math.max(1, r - 5), r - 1);
    const profit = (s.U * s.base * k) / 100;
    const before = mode === 2 ? s.total * 1000 * rng.int(2, 9) : 0;
    const loss = mode === 2 ? s.due + before : s.due - profit;
    const lossShare = (loss * psr[i]) / s.total;
    const n =
      mode === 0
        ? numeric(int[i], [
            [(profit * units[i]) / s.U, 'Cut the interest down to the profit available, as is done when interest on capital is an appropriation; here the deed makes it a charge.'],
            [(profit * psr[i]) / s.total, 'Shared the profit in the profit-sharing ratio and allowed no interest.'],
            [int[i] - lossShare, 'Set the partner\'s share of the resulting loss off against the interest; the interest allowed is asked for.'],
          ])
        : numeric(lossShare, [
            mode === 2
              ? [(before * psr[i]) / s.total, 'Shared only the loss before interest; the interest is a charge and makes the loss larger.']
              : [(profit * psr[i]) / s.total, 'Shared the profit before interest as if no interest were charged.'],
            [(loss * units[i]) / s.U, 'Shared the loss in the ratio of capitals; a loss is shared in the profit-sharing ratio.'],
            [loss, 'Gave the whole loss of the firm, not the share of one partner.'],
            [int[i], 'Gave the interest on the partner\'s capital instead of the share of the loss.'],
          ]);
    const result = mode === 2 ? `the firm made a net loss of ${inr(before)}` : `the net profit is ${inr(profit)}`;
    return n && {
      prompt: [
        `${list(names)} are partners in ${firmOf(rng)} sharing profits and losses in the ratio ${ratioText(psr)}. Their capitals are fixed. The deed allows interest on capital at ${r}% p.a. and treats it as a charge against profit, to be allowed in full even if it results in a loss. For the ${yr.ended}, before interest on capital, ${result}. ${mode === 0 ? `How much interest on capital is ${names[i]} allowed for the year?` : `What is ${names[i]}'s share of the net loss after the interest is charged?`}`,
        ...capitalLines(names, s.caps),
      ].join('\n'),
      ...n,
      explanation:
        mode === 0
          ? [dueLine(names, int, r), 'The deed makes the interest a charge, so it is allowed in full whatever the profit.', `${names[i]} is allowed ${inr(int[i])}. The resulting loss of ${inr(loss)} is then shared in the profit-sharing ratio.`]
          : [
              dueLine(names, int, r),
              mode === 2 ? `Net loss after the charge = ${inr(before)} + ${inr(s.due)} = ${inr(loss)}.` : `Net loss after the charge = ${inr(s.due)} - ${inr(profit)} = ${inr(loss)}.`,
              `${names[i]}'s share = ${inr(loss)} x ${psr[i]}/${s.total} = ${inr(lossShare)}.`,
            ],
      hints: ['Is the interest an appropriation (out of profit only) or a charge (allowed whatever the result)?', 'A charge is allowed in full; the loss that results is shared in the profit-sharing ratio.'],
    };
  },
  verify: (q) => {
    const { int, psr, i } = readInterest(q.prompt);
    const made = /made a net loss of (₹[\d,]+)/.test(q.prompt) ? -read(q.prompt, /made a net loss of (₹[\d,]+)/) : read(q.prompt, /the net profit is (₹[\d,]+)/);
    if (i < 0) return false;
    // After the charge the result is negative; the partner bears that fraction of it.
    return q.prompt.includes('share of the net loss') ? near(q.answer / 100, ((sum(int) - made) / sum(psr)) * psr[i]) : near(q.answer / 100, int[i]);
  },
});

const iocRatio = numericTemplate({
  id: 'pf-ioc-ratio', topicId: T, conceptId: 'pf-ioc', difficulty: 'medium', unit: 'ratio',
  generate: (rng) => {
    const n = rng.pick([2, 2, 3]);
    const names = partners(rng, n);
    const yr = yearOf(rng);
    const units = rng.pick(n === 2 ? CAPS2 : CAPS3);
    const psr = psrOf(rng, n, (p) => !sameRatio(p, units));
    const r = rng.pick([5, 6, 8, 10, 12]);
    const withAdd = rng.int(0, 3) > 0;
    const j = rng.int(0, n - 1);
    const addUnits = rng.pick([1, 2]);
    const k = rng.pick([3, 6, 9]);
    const m = 12 - k;
    const weights = units.map((u, x) => u * 12 + (withAdd && x === j ? addUnits * m : 0));
    const int = weights.map((w) => (w / 3) * 250 * r);
    const due = sum(int);
    const profit = Math.floor((due * rng.pick([0.4, 0.5, 0.6, 0.7, 0.8])) / 1000) * 1000;
    if (profit <= 0 || profit >= due) return null;
    const closing = units.map((u, x) => u + (withAdd && x === j ? addUnits : 0));
    const ans = ratio(weights, [
      [psr, 'Shared the profit in the profit-sharing ratio; when it falls short of the interest on capital, it is given in the ratio of the interest due.'],
      ...(withAdd
        ? ([
            [units, 'Used the capitals at the beginning of the year and gave the fresh capital no interest.'],
            [closing, 'Used the capitals at the end of the year, as if the fresh capital had been in the firm all year.'],
          ] as [number[], string][])
        : []),
      [units.map(() => 1), 'Shared the profit equally.'],
    ]);
    if (!ans || Math.max(...ans.answer) > 30) return null;
    return {
      prompt: [
        `${list(names)} are partners in ${firmOf(rng)} sharing profits and losses in the ratio ${ratioText(psr)}. Their capitals are fixed, and the deed allows interest on capital at ${r}% p.a. as an appropriation of profit. The net profit for the ${yr.ended}, before interest on capital, is ${inr(profit)}, which is less than the interest due. In what ratio is this profit given to the partners? State the ratio in the order ${names.join(', ')}.`,
        ...names.map((nm, x) => `${nm}: capital on ${yr.from} ${inr(units[x] * 100000)}${withAdd && x === j ? `; further capital brought in on ${firstOf(yr, k)} ${inr(addUnits * 100000)}` : ''}`),
      ].join('\n'),
      ...ans,
      explanation: [
        ...names.map((nm, x) =>
          withAdd && x === j
            ? `${nm}: ${inr(units[x] * 100000)} x ${r}/100 + ${inr(addUnits * 100000)} x ${r}/100 x ${m}/12 = ${inr(int[x])}.`
            : `${nm}: ${inr(units[x] * 100000)} x ${r}/100 = ${inr(int[x])}.`,
        ),
        `Interest due is ${inr(due)} in all, but the profit is only ${inr(profit)}. Interest on capital is an appropriation, so the profit is given in the ratio of the interest due.`,
        `Ratio = ${int.map((x) => inr(x).slice(1)).join(' : ')} = ${ratioText(ans.answer)}.`,
      ],
      hints: ['Work out the interest due to each partner for the year, counting the months for any capital brought in later.', 'A profit smaller than the interest on capital is shared in the ratio of the interest due, not in the profit-sharing ratio.'],
    };
  },
  verify: (q) => {
    const r = rateIn(q.prompt);
    const int = dataLines(q.prompt).map((line) => {
      const [open, add = 0] = amountsIn(line);
      const m = add > 0 ? monthsLeft(line.slice(line.indexOf('further')))[0] : 0;
      return (open * r) / 100 + (add * r * m) / 1200;
    });
    return int.length === q.answer.length && q.answer.every((t, x) => near(t * int[0], q.answer[0] * int[x]));
  },
});

/** A number with Indian grouping and no rupee sign: a product of an amount and months. */
const plain = (n: number): string => inr(n).slice(1);

const iodProduct = numericTemplate({
  id: 'pf-iod-product', topicId: T, conceptId: 'pf-iod', difficulty: 'medium', unit: 'rupees',
  // Version 2: hints of the product method; the average period, which the old second hint named, is not used here.
  version: 2,
  generate: (rng) => {
    const [a] = partners(rng, 1);
    const yr = yearOf(rng);
    const r = rng.pick([6, 8, 9, 10, 12]);
    const count = rng.int(3, 4);
    const ks = rng.shuffle([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10]).slice(0, count).sort((x, y) => x - y);
    const rows = ks.map((k) => {
      const monthEnd = k <= 9 && rng.int(0, 2) === 0;
      return { date: monthEnd ? lastOf(yr, k) : firstOf(yr, k), amount: rng.step(6000, 48000, 6000), m: monthEnd ? 11 - k : 12 - k, monthEnd };
    });
    const total = sum(rows.map((x) => x.amount));
    const products = sum(rows.map((x) => x.amount * x.m));
    const answer = (products * r) / 1200;
    const anyEnd = rows.some((x) => x.monthEnd);
    const n = numeric(answer, [
      [(total * r * 6) / 1200, 'Ignored the dates and charged six months on the total; that is only for drawings whose dates are not known.'],
      [(total * r) / 100, 'Charged every withdrawal for the whole year.'],
      [(sum(rows.map((x) => x.amount * (12 - x.m))) * r) / 1200, 'Counted the months before each withdrawal instead of the months from the withdrawal to the end of the year.'],
      ...(anyEnd ? ([[(sum(rows.map((x) => x.amount * (x.m + (x.monthEnd ? 1 : 0)))) * r) / 1200, 'Counted the month of withdrawal for money taken on the last day of a month.']] as [number, string][]) : []),
      [(products * r) / 100, 'Applied the yearly rate to the sum of the products and did not divide by 12; the products are for months, so the rate for one month is used.'],
    ]);
    return n && {
      prompt: [
        `${a}, a partner in ${firmOf(rng)}, withdrew the amounts below for personal use during the ${yr.ended}. The deed charges interest on drawings at ${r}% p.a. Find the interest on ${a}'s drawings for the year by the product method.`,
        ...rows.map((x) => `${x.date}: ${inr(x.amount)}`),
      ].join('\n'),
      ...n,
      explanation: [
        ...rows.map((x) => `${x.date} to ${yr.on} is ${monthsText(x.m)}: ${inr(x.amount)} x ${x.m} = ${plain(x.amount * x.m)}.`),
        `Sum of the products = ${plain(products)}.`,
        `Interest = ${plain(products)} x ${r}/100 x 1/12 = ${inr(answer)}.`,
      ],
      hints: H.product,
    };
  },
  verify: (q) => {
    // Interest on each withdrawal by itself, added up.
    const r = rateIn(q.prompt);
    const each = dataLines(q.prompt).map((line) => (((amountsIn(line)[0] / 100) * r) / 12) * monthsLeft(line)[0]);
    return each.length >= 3 && near(q.answer / 100, sum(each));
  },
});

/** Interest on equal drawings made at regular intervals through a whole year, withdrawal by withdrawal. */
const simulateDrawings = (amount: number, r: number, every: Every, when: When): number => {
  const lead = when === 'beginning' ? 0 : when === 'middle' ? GAP[every] / 2 : GAP[every];
  let interest = 0;
  for (let start = 0; start < 12; start += GAP[every]) interest += (((amount / 100) * r) / 12) * (12 - start - lead);
  return interest;
};
const whenIn = (s: string): When => (s.includes('at the beginning') ? 'beginning' : s.includes('in the middle') ? 'middle' : 'end');

const iodMonthly = numericTemplate({
  id: 'pf-iod-monthly', topicId: T, conceptId: 'pf-iod', difficulty: 'medium', unit: 'rupees',
  generate: (rng) => {
    const [a] = partners(rng, 1);
    const yr = yearOf(rng);
    const when = rng.pick(WHENS);
    const r = rng.pick([6, 8, 9, 10, 12]);
    const askDrawing = rng.int(0, 3) === 0;
    const d = askDrawing ? rng.step(6000, 30000, 6000) : rng.step(2000, 20000, 2000);
    const p = averagePeriod('month', when);
    const total = 12 * d;
    const interest = (total * r * p) / 1200;
    const [first, last] = firstLast('month', when);
    const periodLine = `The first amount is out of the firm for ${monthsText(first)} and the last for ${monthsText(last)}: average period = (${first} + ${last}) / 2 = ${monthsText(p)}.`;
    const firm = firmOf(rng);
    if (askDrawing) {
      const n = numeric(d, [
        [total, 'Gave the total drawings of the year, not the amount withdrawn each month.'],
        [(d * p) / 6, 'Used six months as the average period, which is right only for drawings in the middle of every month or with no dates.'],
        [(d * p) / 12, 'Took the total as outstanding for the whole year.'],
      ]);
      return n && {
        prompt: `${a}, a partner in ${firm}, withdrew the same amount ${timing('month', when)} throughout the ${yr.ended}. Interest on drawings, charged at ${r}% p.a., came to ${inr(interest)} for the year. How much did ${a} withdraw each month?`,
        ...n,
        explanation: [periodLine, `Interest = Total drawings x ${r}/100 x ${p}/12, so Total drawings = ${inr(interest)} x 100/${r} x 12/${p} = ${inr(total)}.`, `Monthly drawings = ${inr(total)} / 12 = ${inr(d)}.`],
        hints: H.iod,
      };
    }
    const n = numeric(interest, [
      ...WHENS.filter((w) => w !== when).map((w): [number, string] => [(total * r * averagePeriod('month', w)) / 1200, `Used ${averagePeriod('month', w)} months, the period for drawings ${timing('month', w)}.`]),
      [(total * r) / 100, 'Charged the total drawings for the whole year.'],
      [(d * r * p) / 1200, 'Worked the interest on one month\'s drawings instead of on the total of the year.'],
    ]);
    return n && {
      prompt: `${a}, a partner in ${firm}, withdrew ${inr(d)} ${timing('month', when)} throughout the ${yr.ended}. The deed charges interest on drawings at ${r}% p.a. Find the interest on ${a}'s drawings for the year.`,
      ...n,
      explanation: [`Total drawings = ${inr(d)} x 12 = ${inr(total)}.`, periodLine, `Interest = ${inr(total)} x ${r}/100 x ${p}/12 = ${inr(interest)}.`],
      hints: H.iod,
    };
  },
  verify: (q) => {
    const r = rateIn(q.prompt);
    const when = whenIn(q.prompt);
    const given = amountsIn(q.prompt)[0];
    return q.prompt.includes('each month?') ? near(simulateDrawings(q.answer / 100, r, 'month', when), given) : near(q.answer / 100, simulateDrawings(given, r, 'month', when));
  },
});

const iodQuarterly = numericTemplate({
  id: 'pf-iod-quarterly', topicId: T, conceptId: 'pf-iod', difficulty: 'medium', unit: 'rupees',
  generate: (rng) => {
    const [a] = partners(rng, 1);
    const yr = yearOf(rng);
    const every = rng.pick<Every>(['quarter', 'quarter', 'half-year']);
    const when = rng.pick(WHENS);
    const r = rng.pick([6, 8, 9, 10, 12]);
    const amount = every === 'quarter' ? rng.step(3000, 45000, 3000) : rng.step(6000, 90000, 6000);
    const count = 12 / GAP[every];
    const total = amount * count;
    const p = averagePeriod(every, when);
    const interest = (total * r * p) / 1200;
    const [first, last] = firstLast(every, when);
    const n = numeric(interest, [
      ...WHENS.filter((w) => w !== when).map((w): [number, string] => [(total * r * averagePeriod(every, w)) / 1200, `Used ${averagePeriod(every, w)} months, the period for drawings ${timing(every, w)}.`]),
      [(total * r * averagePeriod('month', when)) / 1200, `Used ${averagePeriod('month', when)} months, the period for monthly drawings; here the first amount is out for ${first} months and the last for ${last}.`],
      [(total * r) / 100, 'Charged the total drawings for the whole year.'],
      [(amount * r * p) / 1200, 'Worked the interest on one withdrawal instead of on the total of the year.'],
    ]);
    return n && {
      prompt: `${a}, a partner in ${firmOf(rng)}, withdrew ${inr(amount)} ${timing(every, when)} during the ${yr.ended}, ${count === 4 ? 'four' : 'two'} withdrawals in all. The deed charges interest on drawings at ${r}% p.a. Find the interest on ${a}'s drawings for the year.`,
      ...n,
      explanation: [
        `Total drawings = ${inr(amount)} x ${count} = ${inr(total)}.`,
        `The first amount is out of the firm for ${monthsText(first)} and the last for ${monthsText(last)}: average period = (${first} + ${last}) / 2 = ${monthsText(p)}.`,
        `Interest = ${inr(total)} x ${r}/100 x ${p}/12 = ${inr(interest)}.`,
      ],
      hints: H.iod,
    };
  },
  verify: (q) => near(q.answer / 100, simulateDrawings(amountsIn(q.prompt)[0], rateIn(q.prompt), q.prompt.includes('half-year') ? 'half-year' : 'quarter', whenIn(q.prompt))),
});

const commissionAfter = numericTemplate({
  id: 'pf-commission-after', topicId: T, conceptId: 'pf-salary-commission', difficulty: 'medium', unit: 'rupees',
  generate: (rng) => {
    const [a, b] = partners(rng, 2);
    const yr = yearOf(rng);
    const r = rng.pick([5, 10, 20, 25]);
    const step = (100 + r) * 1000;
    const profit = step * rng.int(Math.ceil(200000 / step), Math.floor(900000 / step));
    const commission = (profit * r) / (100 + r);
    const before = (profit * r) / 100;
    const toManager = rng.int(0, 2) === 0;
    const askLeft = rng.int(0, 2) === 0;
    const who = toManager ? 'the manager' : a;
    const intro = toManager
      ? `${a} and ${b} are partners in ${firmOf(rng)}. The manager of the firm, an employee, is entitled to a commission of ${r}% of the net profit after charging such commission. The net profit of the ${yr.ended}, before the manager's commission, is ${inr(profit)}.`
      : `${a} and ${b} are partners in ${firmOf(rng)}. Under the deed ${a} gets a commission of ${r}% of the net profit after charging such commission. The net profit of the ${yr.ended}, before the commission, is ${inr(profit)}.`;
    const n = askLeft
      ? numeric(profit - commission, [
          [commission, 'Gave the commission itself, not the profit that is left after it.'],
          [profit - before, `Worked the commission as ${r}% of the profit before charging it, although it is ${r}% of what is left after it.`],
          [profit, 'Left the commission out altogether.'],
        ])
      : numeric(commission, [
          [before, `Took ${r}% of the profit before the commission; the commission is ${r}% of the profit that is left after it.`],
          [(profit * r) / (100 - r), `Divided by ${100 - r} instead of ${100 + r}.`],
          [profit - commission, 'Gave the profit that is left after the commission, not the commission.'],
        ]);
    return n && {
      prompt: `${intro} ${askLeft ? 'How much profit is left after the commission?' : `What is the commission of ${who}?`}`,
      ...n,
      explanation: [
        `Commission after charging it = Net profit x Rate/(100 + Rate) = ${inr(profit)} x ${r}/${100 + r} = ${inr(commission)}.`,
        `Check: profit left = ${inr(profit)} - ${inr(commission)} = ${inr(profit - commission)}, and ${r}% of it is ${inr(commission)}.`,
      ],
      hints: H.comm,
    };
  },
  verify: (q) => {
    // The commission must be the stated percentage of the profit that is left after it.
    const profit = amountsIn(q.prompt)[0];
    const r = read(q.prompt, /commission of (\d+)%/);
    const commission = q.prompt.includes('is left after') ? profit - q.answer / 100 : q.answer / 100;
    return near(commission * 100, r * (profit - commission));
  },
});

const capitalLabel = (fixed: boolean, yr: Year): string => (fixed ? 'fixed capital' : `capital on ${yr.from}`);
const noChange = (fixed: boolean): string => (fixed ? '' : ' No capital was brought in or withdrawn during the year.');
const namesIn = (prompt: string): string[] => (/^(.+?) are partners/.exec(prompt)?.[1] ?? '').split(/, | and /);
const psrIn = (prompt: string): number[] => (/in the ratio ([\d:]+)\./.exec(prompt)?.[1] ?? '').split(':').map(Number);

const appropriationShare = numericTemplate({
  id: 'pf-appropriation-share', topicId: T, conceptId: 'pf-appropriation', difficulty: 'medium', unit: 'rupees',
  generate: (rng) => {
    const n = rng.pick([2, 2, 3]);
    const names = partners(rng, n);
    const yr = yearOf(rng);
    const fixed = rng.int(0, 1) === 0;
    const psr = psrOf(rng, n);
    const total = sum(psr);
    const base = rng.pick([50000, 100000]);
    const caps = rng.pick(n === 2 ? CAPS2 : CAPS3).map((u) => u * base);
    const r = rng.pick([5, 6, 8, 10]);
    const ioc = caps.map((c) => (c * r) / 100);
    const si = rng.int(0, n - 1);
    const s = rng.step(2000, 8000, 1000);
    const withDrawings = rng.int(0, 2) > 0;
    const iod = names.map(() => (withDrawings ? total * 100 * rng.int(2, 9) : 0));
    const step = total * n * 1000;
    const divisible = step * rng.int(Math.ceil(60000 / step), Math.floor(480000 / step));
    const profit = divisible + sum(ioc) + 12 * s - sum(iod);
    const i = rng.int(0, n - 1);
    const answer = (divisible * psr[i]) / total;
    const num = numeric(answer, [
      ...(withDrawings ? ([[((divisible - sum(iod)) * psr[i]) / total, 'Left out the interest on drawings, which adds to the profit to be shared.']] as [number, string][]) : []),
      [answer + ioc[i] + (i === si ? 12 * s : 0), `Added ${names[i]}'s own interest on capital${i === si ? ' and salary' : ''}; only the share of the divisible profit is asked.`],
      [divisible / n, 'Shared the divisible profit equally, although the deed gives a ratio.'],
      [((divisible + 11 * s) * psr[i]) / total, 'Took out the salary of one month only.'],
      [(profit * psr[i]) / total, 'Shared the net profit itself, without first making the appropriations.'],
    ]);
    return num && {
      prompt: [
        `${list(names)} are partners in ${firmOf(rng)} sharing profits and losses in the ratio ${ratioText(psr)}. ${capitalsAre(fixed)}${noChange(fixed)} The net profit for the ${yr.ended} is ${inr(profit)}. The deed allows interest on capital at ${r}% p.a. and a salary of ${inr(s)} per month to ${names[si]}${withDrawings ? ', and charges the interest on drawings shown below' : ''}. What is ${names[i]}'s share of the divisible profit?`,
        ...names.map((nm, j) => `${nm}: ${capitalLabel(fixed, yr)} ${inr(caps[j])}${withDrawings ? `; interest on drawings ${inr(iod[j])}` : ''}`),
      ].join('\n'),
      ...num,
      explanation: [
        `Interest on capital at ${r}%: ${names.map((nm, j) => `${nm} ${inr(ioc[j])}`).join(', ')}; total ${inr(sum(ioc))}.`,
        `Salary to ${names[si]} = ${inr(s)} x 12 = ${inr(12 * s)}.`,
        `Divisible profit = ${inr(profit)}${withDrawings ? ` + interest on drawings ${inr(sum(iod))}` : ''} - ${inr(sum(ioc))} - ${inr(12 * s)} = ${inr(divisible)}.`,
        `${names[i]}'s share = ${inr(divisible)} x ${psr[i]}/${total} = ${inr(answer)}.`,
      ],
      hints: H.approp,
    };
  },
  verify: (q) => {
    // Profit and Loss Appropriation A/c must agree: net profit and interest on drawings in, appropriations and shares out.
    const lines = dataLines(q.prompt);
    const r = rateIn(q.prompt);
    const psr = psrIn(q.prompt);
    const i = namesIn(q.prompt).indexOf(/What is (\w+)'s share/.exec(q.prompt)?.[1] ?? '');
    const ioc = sum(lines.map((l) => (amountsIn(l)[0] * r) / 100));
    const iod = sum(lines.map((l) => amountsIn(l)[1] ?? 0));
    const profit = read(q.prompt, /net profit for the .+? is (₹[\d,]+)/);
    const salary = 12 * read(q.prompt, /salary of (₹[\d,]+) per month/);
    return i >= 0 && near(profit + iod, ioc + salary + (q.answer / 100 / psr[i]) * sum(psr));
  },
});

const loanInterestProfit = numericTemplate({
  id: 'pf-loan-interest-profit', topicId: T, conceptId: 'pf-salary-commission', difficulty: 'medium', unit: 'rupees',
  generate: (rng) => {
    const n = rng.pick([2, 2, 3]);
    const names = partners(rng, n);
    const yr = yearOf(rng);
    const noDeed = rng.int(0, 1) === 0;
    const psr = noDeed ? names.map(() => 1) : psrOf(rng, n);
    const total = sum(psr);
    const unit = 20000 * total;
    const loan = unit * rng.int(Math.ceil(100000 / unit), Math.max(Math.ceil(100000 / unit), Math.floor(600000 / unit)));
    const k = rng.int(1, 9);
    const m = 12 - k;
    const interest = (loan * 6 * m) / 1200;
    const withRent = rng.int(0, 2) === 0;
    const rentUnit = total * 500;
    const rent = withRent ? rentUnit * rng.int(Math.ceil(2000 / rentUnit), Math.max(Math.ceil(2000 / rentUnit), Math.floor(12000 / rentUnit))) : 0;
    const owner = names[n - 1];
    const step = total * n * 1000;
    const divisible = step * rng.int(Math.ceil(90000 / step), Math.floor(480000 / step));
    const profit = divisible + interest + 12 * rent;
    const i = rng.int(0, n - 1);
    const answer = (divisible * psr[i]) / total;
    const num = numeric(answer, [
      [((divisible + interest) * psr[i]) / total, 'Did not charge interest on the loan; a partner\'s loan earns 6% p.a. even when nothing has been agreed.'],
      [((divisible + interest - (loan * 6) / 100) * psr[i]) / total, 'Charged interest on the loan for the whole year, although it was given part-way through.'],
      ...(withRent ? ([[((divisible + 12 * rent) * psr[i]) / total, 'Did not charge the rent; rent paid to a partner is an expense of the firm like any other rent.']] as [number, string][]) : []),
      ...(i === 0 ? ([[answer + interest, 'Added the interest on the loan to the share of profit; the interest is a charge, credited to the loan account.']] as [number, string][]) : []),
      ...(noDeed ? [] : ([[divisible / n, 'Shared the profit equally, although the deed gives a ratio.']] as [number, string][])),
    ]);
    const terms = noDeed ? 'They have no partnership deed.' : `They share profits and losses in the ratio ${ratioText(psr)}, and their deed says nothing about interest on a partner's loan.`;
    return num && {
      prompt: `${list(names)} are partners in ${firmOf(rng)}. ${terms} On ${firstOf(yr, k)}, ${names[0]} gave the firm a loan of ${inr(loan)}.${withRent ? ` The firm occupies a shop owned by ${owner} and has agreed to pay a rent of ${inr(rent)} per month for it.` : ''} The net profit for the ${yr.ended}, before interest on the loan${withRent ? ' and before the rent' : ''}, is ${inr(profit)}. What is ${names[i]}'s share of the profit?`,
      ...num,
      explanation: [
        `Nothing is agreed about the loan, so interest is 6% p.a. for ${m} months: ${inr(loan)} x 6/100 x ${m}/12 = ${inr(interest)}. It is a charge against profit.`,
        ...(withRent ? [`Rent for the year = ${inr(rent)} x 12 = ${inr(12 * rent)}, also a charge.`] : []),
        `Profit to be shared = ${inr(profit)} - ${inr(interest)}${withRent ? ` - ${inr(12 * rent)}` : ''} = ${inr(divisible)}.`,
        noDeed ? `With no deed the profit is shared equally: ${inr(divisible)} / ${n} = ${inr(answer)}.` : `${names[i]}'s share = ${inr(divisible)} x ${psr[i]}/${total} = ${inr(answer)}.`,
      ],
      hints: H.charge,
    };
  },
  verify: (q) => {
    const names = namesIn(q.prompt);
    const psr = q.prompt.includes('no partnership deed') ? names.map(() => 1) : (/in the ratio ([\d:]+),/.exec(q.prompt)?.[1] ?? '').split(':').map(Number);
    const i = names.indexOf(/What is (\w+)'s share/.exec(q.prompt)?.[1] ?? '');
    const loan = read(q.prompt, /loan of (₹[\d,]+)/);
    const m = monthsLeft(q.prompt.slice(q.prompt.indexOf('On 1 '), q.prompt.indexOf('gave the firm')))[0];
    const rent = q.prompt.includes('per month') ? read(q.prompt, /rent of (₹[\d,]+) per month/) : 0;
    const profit = read(q.prompt, /, is (₹[\d,]+)\. What is/);
    // What the partners share, rebuilt from one partner's share, plus the two charges, is the profit given.
    return i >= 0 && near((q.answer / 100 / psr[i]) * sum(psr) + (loan * 0.06 * m) / 12 + 12 * rent, profit);
  },
});

const guaranteeFirm = numericTemplate({
  id: 'pf-guarantee-firm', topicId: T, conceptId: 'pf-guarantee', difficulty: 'medium', unit: 'rupees',
  generate: (rng) => {
    const names = partners(rng, 3);
    const [a, b, c] = names;
    const yr = yearOf(rng);
    const psr = psrOf(rng, 3);
    const [x, y, z] = psr;
    const total = sum(psr);
    const pair = x + y;
    const step = total * pair * 1000;
    const profit = step * rng.int(Math.ceil(150000 / step), Math.max(Math.ceil(150000 / step), Math.floor(900000 / step)));
    const own = [(profit * x) / total, (profit * y) / total, (profit * z) / total];
    const short = rng.int(0, 4) > 0;
    const gap = pair * 1000 * rng.int(1, 6);
    const guaranteed = short ? own[2] + gap : own[2] - gap;
    // A guarantee far from the partner's own share does not read like a real deed.
    if (guaranteed <= 0 || gap * 2 > own[2]) return null;
    const ask = short && rng.int(0, 3) === 0 ? 2 : rng.int(0, 1);
    const part = [(gap * x) / pair, (gap * y) / pair];
    const intro = `${list(names)} are partners in ${firmOf(rng)} sharing profits and losses in the ratio ${ratioText(psr)}. The firm has guaranteed that ${c}'s share of profit will not be less than ${inr(guaranteed)} in any year; any deficiency is borne by ${a} and ${b} in their profit-sharing ratio, ${ratioText(lowestTerms([x, y]))}. The profit of the ${yr.ended} available for distribution is ${inr(profit)}.`;
    const shares = `Shares in ${ratioText(psr)}: ${names.map((nm, j) => `${nm} ${inr(own[j])}`).join(', ')}.`;
    if (!short) {
      const num = numeric(own[ask], [
        [own[ask] + part[ask], `Took the excess of ${c}'s share over the guaranteed amount away from ${c}; a guarantee sets only a minimum.`],
        [own[ask] - part[ask], `Deducted a deficiency that does not exist; ${c}'s own share is already above the guaranteed amount.`],
      ]);
      return num && {
        prompt: `${intro} How much profit does ${names[ask]} finally get?`,
        ...num,
        explanation: [shares, `${c}'s share of ${inr(own[2])} is not less than the guaranteed ${inr(guaranteed)}, so there is no deficiency and nothing is adjusted.`, `${names[ask]} gets ${inr(own[ask])}.`],
        hints: H.guarantee,
      };
    }
    if (ask === 2) {
      const num = numeric(gap, [
        [guaranteed, 'Gave the guaranteed amount itself, not the shortfall in it.'],
        [own[2], `Gave ${c}'s share of the profit, not the amount by which it falls short.`],
        [profit - guaranteed, `Gave what is left for ${a} and ${b} after ${c} takes the guaranteed amount.`],
      ]);
      return num && {
        prompt: `${intro} How much is the deficiency in ${c}'s share that ${a} and ${b} have to make good?`,
        ...num,
        explanation: [shares, `Deficiency = guaranteed amount - ${c}'s share = ${inr(guaranteed)} - ${inr(own[2])} = ${inr(gap)}.`, `${a} bears ${inr(part[0])} and ${b} bears ${inr(part[1])}.`],
        hints: H.guarantee,
      };
    }
    const answer = own[ask] - part[ask];
    const num = numeric(answer, [
      [own[ask], `Gave the share before the deficiency in ${c}'s share was made good.`],
      [own[ask] - gap / 2, `Split the deficiency equally between ${a} and ${b}; they bear it in their profit-sharing ratio.`],
      [own[ask] - gap, `Charged the whole deficiency to ${names[ask]} alone.`],
      [own[ask] + part[ask], 'Added the share of the deficiency instead of deducting it.'],
      [own[ask] - (gap * psr[ask]) / total, `Divided the deficiency by ${total}, the total of all three terms; only ${a} and ${b} bear it, so it is divided by ${pair}.`],
    ]);
    return num && {
      prompt: `${intro} How much profit does ${names[ask]} finally get?`,
      ...num,
      explanation: [
        shares,
        `Deficiency = ${inr(guaranteed)} - ${inr(own[2])} = ${inr(gap)}, borne by ${a} and ${b} in ${ratioText(lowestTerms([x, y]))}: ${a} ${inr(part[0])}, ${b} ${inr(part[1])}.`,
        `${names[ask]} finally gets ${inr(own[ask])} - ${inr(part[ask])} = ${inr(answer)}.`,
      ],
      hints: H.guarantee,
    };
  },
  verify: (q) => {
    const psr = psrIn(q.prompt);
    const names = namesIn(q.prompt);
    const [guaranteed, profit] = amountsIn(q.prompt);
    const third = Math.max(guaranteed, (profit * psr[2]) / sum(psr));
    if (q.prompt.includes('How much is the deficiency')) return near(q.answer / 100, third - (profit * psr[2]) / sum(psr));
    const i = names.indexOf(/does (\w+) finally get/.exec(q.prompt)?.[1] ?? '');
    // What is left after the guaranteed partner is paid goes to the other two in their own ratio.
    return (i === 0 || i === 1) && near(q.answer / 100, ((profit - third) * psr[i]) / (psr[0] + psr[1]));
  },
});

const guaranteeOnePartner = numericTemplate({
  id: 'pf-guarantee-one-partner', topicId: T, conceptId: 'pf-guarantee', difficulty: 'medium', unit: 'rupees',
  generate: (rng) => {
    const names = partners(rng, 3);
    const c = names[2];
    const yr = yearOf(rng);
    const psr = psrOf(rng, 3);
    const total = sum(psr);
    const step = total * 1000;
    const profit = step * rng.int(Math.ceil(150000 / step), Math.floor(900000 / step));
    const own = psr.map((t) => (profit * t) / total);
    const gap = 1000 * rng.int(2, 24);
    const guaranteed = own[2] + gap;
    const g = rng.int(0, 1);
    const o = 1 - g;
    const askGuarantor = rng.int(0, 2) > 0;
    const final = own[g] - gap;
    if (final <= 0 || gap * 2 > own[2]) return null;
    const pair = psr[g] + psr[o];
    const num = askGuarantor
      ? numeric(final, [
          [own[g], `Gave the share before the deficiency in ${c}'s share was made good.`],
          [own[g] - (gap * psr[g]) / pair, `Shared the deficiency with ${names[o]}; the guarantee was given by ${names[g]} alone.`],
          [own[g] + gap, 'Added the deficiency instead of deducting it.'],
          [gap, 'Gave the deficiency, not the profit the partner finally gets.'],
        ])
      : numeric(own[o], [
          [own[o] - (gap * psr[o]) / pair, `Made ${names[o]} bear a part of the deficiency; the guarantee was given by ${names[g]} alone.`],
          [own[o] - gap, `Charged the deficiency to ${names[o]}, who gave no guarantee.`],
          [final, `Gave the final share of ${names[g]}, the partner who gave the guarantee.`],
        ]);
    const asked = askGuarantor ? names[g] : names[o];
    return num && {
      prompt: `${list(names)} are partners in ${firmOf(rng)} sharing profits and losses in the ratio ${ratioText(psr)}. ${names[g]} has personally guaranteed that ${c}'s share of profit will not be less than ${inr(guaranteed)} in any year. The profit of the ${yr.ended} available for distribution is ${inr(profit)}. How much profit does ${asked} finally get?`,
      ...num,
      explanation: [
        `Shares in ${ratioText(psr)}: ${names.map((nm, j) => `${nm} ${inr(own[j])}`).join(', ')}.`,
        `Deficiency = ${inr(guaranteed)} - ${inr(own[2])} = ${inr(gap)}. It is borne by ${names[g]} alone, who gave the guarantee.`,
        askGuarantor ? `${names[g]} finally gets ${inr(own[g])} - ${inr(gap)} = ${inr(final)}.` : `${names[o]} gave no guarantee, so the share of ${inr(own[o])} is not touched.`,
      ],
      hints: H.guarantee,
    };
  },
  verify: (q) => {
    const psr = psrIn(q.prompt);
    const names = namesIn(q.prompt);
    const [guaranteed, profit] = amountsIn(q.prompt);
    const guarantor = names.indexOf(/\. (\w+) has personally guaranteed/.exec(q.prompt)?.[1] ?? '');
    const i = names.indexOf(/does (\w+) finally get/.exec(q.prompt)?.[1] ?? '');
    if (guarantor < 0 || i < 0) return false;
    const other = (profit * psr[1 - guarantor]) / sum(psr);
    // The three final shares use up the profit: the guarantor gets what the other two leave.
    return near(q.answer / 100, i === guarantor ? profit - guaranteed - other : other);
  },
});

const currentBalance = numericTemplate({
  id: 'pf-current-balance', topicId: T, conceptId: 'pf-capitals', difficulty: 'medium', unit: 'rupees',
  // Version 2: a seed of fluctuating capitals gets hints of its own, not those of the fixed/current routing.
  version: 2,
  generate: (rng) => {
    const [a] = partners(rng, 1);
    const yr = yearOf(rng);
    const fixed = rng.int(0, 2) > 0;
    const cap = rng.step(200000, 800000, 50000);
    const r = rng.pick([5, 6, 8, 10]);
    const ioc = (cap * r) / 100;
    const s = rng.pick([0, 3000, 4000, 5000, 6000, 8000]);
    const share = rng.step(40000, 160000, 5000);
    const drawings = rng.step(36000, 120000, 6000);
    const iod = rng.step(900, 4800, 300);
    const debitOpening = fixed && rng.int(0, 4) === 0;
    const open = rng.step(5000, 40000, 5000);
    const fresh = fixed && rng.int(0, 1) === 0 ? rng.step(50000, 200000, 50000) : 0;
    const credits = ioc + 12 * s + share;
    const debits = drawings + iod;
    const answer = (fixed ? (debitOpening ? -open : open) : cap) + credits - debits;
    const num = numeric(answer, [
      ...(fixed
        ? ([
            [answer + cap, 'Added the fixed capital to the Current A/c; the capital stays in the Capital A/c.'],
            ...(fresh > 0 ? [[answer + fresh, 'Passed the additional capital through the Current A/c; capital brought in goes to the Capital A/c.']] : []),
            ...(debitOpening ? [[answer + 2 * open, 'Took the opening debit balance of the Current A/c for a credit balance.']] : []),
          ] as [number, string][])
        : ([[answer - cap, 'Left out the opening capital and gave only the net change of the year.']] as [number, string][])),
      [answer + iod, 'Left out the interest on drawings, which is debited to the partner.'],
      [answer + 2 * iod, 'Added the interest on drawings instead of deducting it.'],
      ...(s > 0 ? ([[answer - 11 * s, 'Credited the salary of one month only.']] as [number, string][]) : []),
      [answer + 2 * drawings, 'Added the drawings instead of deducting them.'],
    ]);
    const account = fixed ? 'Current A/c' : 'Capital A/c';
    return num && {
      prompt: [
        `${a} is a partner in ${firmOf(rng)}, where capitals are ${fixed ? 'fixed' : 'fluctuating'}. From the particulars below for the ${yr.ended}, find the closing credit balance of ${a}'s ${account}.`,
        fixed ? `Fixed capital on ${yr.from}: ${inr(cap)}` : `Capital on ${yr.from}: ${inr(cap)}`,
        ...(fixed ? [`Current A/c on ${yr.from}: ${inr(open)} (${debitOpening ? 'Dr' : 'Cr'})`] : []),
        ...(fresh > 0 ? [`Additional capital brought in on ${yr.on}: ${inr(fresh)}`] : []),
        `Interest on capital: ${r}% p.a.${fixed ? '' : ' (no capital was brought in or withdrawn during the year)'}`,
        ...(s > 0 ? [`Salary: ${inr(s)} per month`] : []),
        `Share of profit: ${inr(share)}`,
        `Drawings: ${inr(drawings)}`,
        `Interest on drawings: ${inr(iod)}`,
      ].join('\n'),
      ...num,
      explanation: [
        `Interest on capital = ${inr(cap)} x ${r}/100 = ${inr(ioc)}.${fresh > 0 ? ` The additional capital came in on the last day of the year, so it earns no interest and goes to the Capital A/c.` : ''}`,
        `Credits: ${fixed ? (debitOpening ? '' : `opening balance ${inr(open)} + `) : `opening capital ${inr(cap)} + `}interest on capital ${inr(ioc)}${s > 0 ? ` + salary ${inr(12 * s)}` : ''} + share of profit ${inr(share)} = ${inr((fixed ? (debitOpening ? 0 : open) : cap) + credits)}.`,
        `Debits: ${debitOpening ? `opening balance ${inr(open)} + ` : ''}drawings ${inr(drawings)} + interest on drawings ${inr(iod)} = ${inr(debits + (debitOpening ? open : 0))}.`,
        `Closing balance of ${account} = ${inr((fixed ? (debitOpening ? 0 : open) : cap) + credits)} - ${inr(debits + (debitOpening ? open : 0))} = ${inr(answer)} (Cr).`,
      ],
      hints: fixed ? H.capitals : H.fluctuating,
    };
  },
  verify: (q) => {
    // The account written up line by line: each particular goes to the side it belongs on.
    let balance = 0;
    let cap = 0;
    const fixed = q.prompt.includes('capitals are fixed');
    for (const line of dataLines(q.prompt)) {
      const x = amountsIn(line)[0] ?? 0;
      if (/^(Fixed capital|Capital) on/.test(line)) {
        cap = x;
        if (!fixed) balance += x;
      } else if (line.startsWith('Current A/c')) balance += line.includes('(Dr)') ? -x : x;
      else if (line.startsWith('Interest on capital')) balance += (cap * read(line, /(\d+)% p\.a\./)) / 100;
      else if (line.startsWith('Salary')) balance += 12 * x;
      else if (line.startsWith('Share of profit')) balance += x;
      else if (line.startsWith('Drawings') || line.startsWith('Interest on drawings')) balance -= x;
      else if (!line.startsWith('Additional capital')) return false;
    }
    return near(q.answer / 100, balance);
  },
});

const journalProfitTransfer = journalTemplate({
  id: 'pf-journal-profit-transfer', topicId: T, conceptId: 'pf-appropriation', difficulty: 'medium',
  generate: (rng) => {
    const n = rng.pick([2, 3, 3]);
    const names = partners(rng, n);
    const yr = yearOf(rng);
    const fixed = rng.int(0, 1) === 0;
    const psr = psrOf(rng, n);
    const total = sum(psr);
    const step = total * 1000;
    const divisible = step * rng.int(Math.ceil(60000 / step), Math.floor(600000 / step));
    const shares = psr.map((t) => (divisible * t) / total);
    return {
      prompt: `${list(names)} are partners in ${firmOf(rng)} sharing profits and losses in the ratio ${ratioText(psr)}. ${capitalsAre(fixed)} After all the appropriations, Profit and Loss Appropriation A/c for the ${yr.ended} shows a profit of ${inr(divisible)} still to be shared. Pass the entry that transfers it to the partners.`,
      lines: [dr('profitAndLossAppropriation', divisible), ...names.map((nm, j) => cr(ownId(fixed, nm), shares[j]))],
      explanation: [
        `Shares in ${ratioText(psr)}: ${names.map((nm, j) => `${nm} ${inr(divisible)} x ${psr[j]}/${total} = ${inr(shares[j])}`).join('; ')}.`,
        'Profit and Loss Appropriation A/c is debited to close it, and each partner is credited with the share.',
        whyOwn(fixed),
      ],
      distractorAccounts: ['profitAndLoss', fixed ? partnerCapital(names[0]) : partnerCurrent(names[0])],
      hints: H.entry,
    };
  },
  verify: (q: JournalQuestion) => {
    const psr = psrIn(q.prompt);
    const names = namesIn(q.prompt);
    const divisible = read(q.prompt, /profit of (₹[\d,]+) still/);
    const family = q.prompt.includes('capitals are fixed') ? 'current' : 'capital';
    return names.every((nm, j) => q.expected.some((l) => l.accountId === `${family}:${nm}` && l.side === 'Cr' && l.amount * sum(psr) === divisible * 100 * psr[j]));
  },
});

const journalLoanInterest = journalTemplate({
  id: 'pf-journal-loan-interest', topicId: T, conceptId: 'pf-salary-commission', difficulty: 'medium', computed: true,
  generate: (rng) => {
    const [a, b] = partners(rng, 2);
    const yr = yearOf(rng);
    const loan = rng.step(60000, 600000, 60000);
    const k = rng.int(0, 9);
    const m = 12 - k;
    const agreed = rng.int(0, 2) === 0;
    const r = agreed ? rng.pick([8, 9, 10, 12]) : 6;
    const amt = (loan * r * m) / 1200;
    const closing = rng.int(0, 2) === 0;
    const working = [
      agreed ? `The partners agreed on ${r}% p.a.` : 'Nothing was agreed, so the rate is 6% p.a. under the Indian Partnership Act, 1932.',
      `From ${firstOf(yr, k)} to ${yr.on} is ${m} months: ${inr(loan)} x ${r}/100 x ${m}/12 = ${inr(amt)}.`,
    ];
    return {
      prompt: `${a} and ${b} are partners in ${firmOf(rng)}. On ${firstOf(yr, k)}, ${a} gave the firm a loan of ${inr(loan)}. ${agreed ? `The partners agreed on interest at ${r}% p.a. on this loan.` : 'Nothing was agreed about interest on this loan.'} The interest for the ${yr.ended} is not paid in cash; it is debited to Interest on Partner's Loan A/c and credited to ${a}'s Loan A/c. ${closing ? 'Pass the entry that closes Interest on Partner\'s Loan A/c at the year end.' : 'Pass the entry for the interest due for the year.'}`,
      lines: closing ? [dr('profitAndLoss', amt), cr('interestOnPartnersLoan', amt)] : [dr('interestOnPartnersLoan', amt), cr(partnerLoan(a), amt)],
      explanation: closing
        ? [...working, 'Interest on a partner\'s loan is a charge against profit, so the account is closed to Profit and Loss A/c, not to Profit and Loss Appropriation A/c.']
        : [...working, 'The interest is an expense of the firm: Interest on Partner\'s Loan A/c is debited.', `It is owed to ${a} as a lender, so ${a}'s Loan A/c is credited, not the capital or current account.`],
      distractorAccounts: closing ? ['profitAndLossAppropriation', partnerLoan(a), 'interestOnCapital'] : [partnerCapital(a), partnerCurrent(a), 'interestOnCapital', 'profitAndLossAppropriation'],
      hints: H.charge,
    };
  },
  verify: (q: JournalQuestion) => {
    const loan = read(q.prompt, /loan of (₹[\d,]+)/);
    const r = q.prompt.includes('Nothing was agreed') ? 6 : rateIn(q.prompt);
    const m = monthsLeft(q.prompt.slice(0, q.prompt.indexOf('gave the firm')))[0];
    return q.expected.every((l) => near(l.amount / 100, (((loan / 100) * r) / 12) * m));
  },
});

const pastAdjustmentTakeBack = numericTemplate({
  id: 'pf-past-adj-take-back', topicId: T, conceptId: 'pf-past-adjustments', difficulty: 'medium', unit: 'rupees',
  generate: (rng) => {
    const n = rng.pick([2, 3, 3]);
    const names = partners(rng, n);
    const yr = yearOf(rng);
    const psr = psrOf(rng, n);
    const total = sum(psr);
    const ioc = names.map(() => total * 500 * rng.int(2, 12));
    const omitted = sum(ioc);
    const back = psr.map((t) => (omitted * t) / total);
    const net = ioc.map((x, j) => x - back[j]);
    const i = rng.int(0, n - 1);
    const askNet = rng.int(0, 1) === 1;
    if (net[i] === 0) return null;
    const num = askNet
      ? numeric(Math.abs(net[i]), [
          [ioc[i], 'Stopped after crediting the interest and did not take back the profit that had already been shared.'],
          [back[i], 'Gave only the profit taken back and left out the interest the partner should get.'],
          [ioc[i] + back[i], 'Added the two figures instead of setting one off against the other.'],
        ])
      : numeric(back[i], [
          [ioc[i], 'Gave the interest the partner should have got, not the profit to be taken back.'],
          [omitted, 'Gave the whole amount to be taken back from all the partners.'],
          [omitted / n, 'Took the profit back equally; it had been shared in the profit-sharing ratio, so it is taken back in that ratio.'],
          [Math.abs(net[i]), 'Gave the net effect on the partner; only the profit to be taken back is asked.'],
        ]);
    return num && {
      prompt: [
        `${list(names)} are partners in ${firmOf(rng)} sharing profits and losses in the ratio ${ratioText(psr)}. After the accounts of the ${yr.ended} were closed, it was found that the interest on capital below, allowed by the deed, had been left out, so the whole profit had been shared in the profit-sharing ratio. The profit of the year was more than enough for the interest. The partners will set this right by one adjusting entry. ${askNet ? `By what net amount does that entry change ${names[i]}'s account? Give the amount only, whether it turns out to be a debit or a credit.` : `In the working for that entry, how much of the profit already credited to ${names[i]} has to be taken back?`}`,
        ...names.map((nm, j) => `${nm}: interest on capital left out ${inr(ioc[j])}`),
      ].join('\n'),
      ...num,
      explanation: [
        `Interest on capital left out = ${ioc.map((x) => inr(x)).join(' + ')} = ${inr(omitted)}. This much profit was shared when it should have gone as interest.`,
        `It is taken back in ${ratioText(psr)}: ${names.map((nm, j) => `${nm} ${inr(back[j])}`).join(', ')}.`,
        `${names[i]}: interest to be credited ${inr(ioc[i])}, profit to be taken back ${inr(back[i])}, net ${inr(Math.abs(net[i]))} ${net[i] > 0 ? 'credit' : 'debit'}.`,
      ],
      hints: H.past,
    };
  },
  verify: (q) => {
    const psr = psrIn(q.prompt);
    const names = namesIn(q.prompt);
    const ioc = dataLines(q.prompt).map((l) => amountsIn(l)[0]);
    const asked = /change (\w+)'s account|credited to (\w+) has/.exec(q.prompt);
    const i = names.indexOf(asked?.[1] ?? asked?.[2] ?? '');
    if (i < 0) return false;
    const backOf = (j: number) => (sum(ioc) / sum(psr)) * psr[j];
    // The nets of all partners cancel out, so one partner's net is what the others' nets leave.
    const others = sum(names.map((_, j) => (j === i ? 0 : ioc[j] - backOf(j))));
    return q.prompt.includes('net amount') ? near(q.answer / 100, Math.abs(others)) : near(q.answer / 100, sum(ioc) - sum(names.map((_, j) => (j === i ? 0 : backOf(j)))));
  },
});

// ===============================================================================================================
// COMPLEX
// ===============================================================================================================

const iocClosingFresh = numericTemplate({
  id: 'pf-ioc-closing-fresh', topicId: T, conceptId: 'pf-ioc', difficulty: 'complex', unit: 'rupees',
  generate: (rng) => {
    const names = partners(rng, 2);
    const yr = yearOf(rng);
    const r = rng.pick([5, 6, 8, 10]);
    const rows = names.map(() => capitalRow(rng));
    const who = rng.int(0, 1);
    const k = rng.int(1, 9);
    const m = 12 - k;
    rows[who].fresh = rng.step(60000, 180000, 60000);
    const opening = rows.map((x) => x.close + x.drawings - x.profit - x.fresh);
    if (opening.some((o) => o < 100000)) return null;
    const total = rng.int(0, 2) === 0;
    const of = (f: (x: CapitalRow) => number): number => (total ? sum(rows.map(f)) : f(rows[who]));
    const onFresh = (x: CapitalRow, months: number): number => (x.fresh * r * months) / 1200;
    const answer = of((x) => ((x.close + x.drawings - x.profit - x.fresh) * r) / 100 + onFresh(x, m));
    const date = firstOf(yr, k);
    const n = numeric(answer, [
      [of((x) => ((x.close + x.drawings - x.profit) * r) / 100), 'Did not take the fresh capital out of the opening capital, so it earned interest for the whole year.'],
      [of((x) => (x.close * r) / 100), 'Worked the interest on the capital at the end of the year.'],
      [of((x) => ((x.close + x.drawings - x.profit - x.fresh) * r) / 100), 'Found the opening capital correctly but gave the fresh capital no interest for the months it was in the firm.'],
      [of((x) => ((x.close + x.drawings - x.profit - x.fresh) * r) / 100 + onFresh(x, 12 - m)), 'Counted the months before the fresh capital came in instead of the months after.'],
      [of((x) => ((x.close - x.fresh) * r) / 100 + onFresh(x, m)), 'Took out the fresh capital but did not add back the drawings and take out the share of profit.'],
    ]);
    return n && {
      prompt: [
        `${list(names)} are partners in ${firmOf(rng)} with fluctuating capitals. ${CLOSING_INTRO(yr, r)} Apart from the fresh capital shown, no capital was brought in or withdrawn during the year. ${total ? 'Find the total interest on capital of the two partners for the year.' : `Find the interest on ${names[who]}'s capital for the year.`}`,
        ...rows.map((row, j) => rowLine(names[j], row, yr, date)),
      ].join('\n'),
      ...n,
      explanation: [
        'Opening capital = Closing capital + Drawings - Share of profit - Fresh capital brought in during the year.',
        ...rows.flatMap((x, j) =>
          total || j === who
            ? [
                x.fresh > 0
                  ? `${names[j]}: ${inr(x.close)} + ${inr(x.drawings)} - ${inr(x.profit)} - ${inr(x.fresh)} = ${inr(opening[j])}. Interest = ${inr(opening[j])} x ${r}/100 + ${inr(x.fresh)} x ${r}/100 x ${m}/12 = ${inr((opening[j] * r) / 100)} + ${inr(onFresh(x, m))} = ${inr((opening[j] * r) / 100 + onFresh(x, m))}.`
                  : `${names[j]}: ${inr(x.close)} + ${inr(x.drawings)} - ${inr(x.profit)} = ${inr(opening[j])}. Interest = ${inr(opening[j])} x ${r}/100 = ${inr((opening[j] * r) / 100)}.`,
              ]
            : [],
        ),
        ...(total ? [`Total interest on capital = ${inr(answer)}.`] : []),
      ],
      hints: ['Work back to the capital at the beginning of the year, then treat the fresh capital separately for its months.', 'Opening capital = Closing capital + Drawings - Share of profit - Fresh capital.'],
    };
  },
  verify: (q) => {
    // Another route: a full year on everything that was in the firm at the end, less the months before the fresh capital came.
    const r = rateIn(q.prompt);
    const lines = dataLines(q.prompt);
    const asked = /interest on (\w+)'s capital/.exec(q.prompt)?.[1];
    const mine = lines.filter((l) => !asked || l.startsWith(`${asked}:`));
    const each = mine.map((l) => {
      const x = readRow(l);
      const m = x.fresh > 0 ? monthsLeft(l.slice(l.indexOf('fresh capital')))[0] : 12;
      return ((x.close + x.drawings - x.profit) * r) / 100 - (x.fresh * r * (12 - m)) / 1200;
    });
    return each.length > 0 && near(q.answer / 100, sum(each));
  },
});

const iodPartYear = numericTemplate({
  id: 'pf-iod-part-year', topicId: T, conceptId: 'pf-iod', difficulty: 'complex', unit: 'rupees',
  generate: (rng) => {
    const [a] = partners(rng, 1);
    const yr = yearOf(rng);
    const when = rng.pick(WHENS);
    const count = rng.pick([4, 6, 8, 9]);
    const r = rng.pick([6, 9, 12, 15]);
    const d = rng.step(4000, 40000, 4000);
    const lead = when === 'beginning' ? 0 : when === 'middle' ? 0.5 : 1;
    const first = count - lead;
    const last = 1 - lead;
    const p = (first + last) / 2;
    const total = count * d;
    const interest = (total * r * p) / 1200;
    const fullYear = averagePeriod('month', when);
    const n = numeric(interest, [
      [(total * r * fullYear) / 1200, `Used ${fullYear} months, the average period of drawings made in all twelve months; these drawings ran for ${count} months only.`],
      [(total * r * count) / 1200, `Charged the whole amount for all ${count} months, as if it had all been withdrawn on the first day.`],
      ...WHENS.filter((w) => w !== when).map((w): [number, string] => {
        const l = w === 'beginning' ? 0 : w === 'middle' ? 0.5 : 1;
        return [(total * r * (count + 1 - 2 * l)) / 2400, `Used ${(count + 1 - 2 * l) / 2} months, the period for drawings ${timing('month', w)}.`];
      }),
      [(12 * d * r * fullYear) / 1200, 'Took twelve withdrawals for the year, although there were none in the earlier months.'],
    ]);
    return n && {
      prompt: `${a}, a partner in ${firmOf(rng)}, made no drawings in the first ${12 - count} months of the ${yr.ended}. From ${firstOf(yr, 12 - count)} to ${yr.on}, ${a} withdrew ${inr(d)} ${timing('month', when)}, ${count} withdrawals in all. The deed charges interest on drawings at ${r}% p.a. Find the interest on ${a}'s drawings for the year.`,
      ...n,
      explanation: [
        `Total drawings = ${inr(d)} x ${count} = ${inr(total)}.`,
        `The first amount is out of the firm for ${monthsText(first)} and the last for ${monthsText(last)}: average period = (${first} + ${last}) / 2 = ${monthsText(p)}.`,
        `Interest = ${inr(total)} x ${r}/100 x ${p}/12 = ${inr(interest)}.`,
      ],
      hints: ['The average-period shortcut needs the months for the first and the last withdrawal actually made.', 'Average period = (months for the first withdrawal + months for the last) / 2, applied to the total drawn.'],
    };
  },
  verify: (q) => {
    // Withdrawal by withdrawal, each for the months it is out of the firm.
    const d = amountsIn(q.prompt)[0];
    const r = rateIn(q.prompt);
    const count = read(q.prompt, /, (\d+) withdrawals in all/);
    const when = whenIn(q.prompt);
    const lead = when === 'beginning' ? 0 : when === 'middle' ? 0.5 : 1;
    let interest = 0;
    for (let j = 0; j < count; j++) interest += (((d / 100) * r) / 12) * (count - j - lead);
    return near(q.answer / 100, interest);
  },
});

const guaranteeRatio = numericTemplate({
  id: 'pf-guarantee-ratio', topicId: T, conceptId: 'pf-guarantee', difficulty: 'complex', unit: 'rupees',
  generate: (rng) => {
    const names = partners(rng, 3);
    const [a, b, c] = names;
    const yr = yearOf(rng);
    const psr = psrOf(rng, 3);
    const [x, y, z] = psr;
    const total = sum(psr);
    const [p, q] = rng.pick(([[1, 1], [2, 1], [1, 2], [3, 1], [3, 2], [2, 3], [1, 3]] as [number, number][]).filter((pq) => !sameRatio(pq, [x, y])));
    const s = rng.step(3000, 9000, 1000);
    const si = rng.int(0, 1);
    const step = total * 1000;
    const divisible = step * rng.int(Math.ceil(150000 / step), Math.floor(720000 / step));
    const own = psr.map((t) => (divisible * t) / total);
    const gap = lcm(p + q, x + y) * 1000 * rng.int(1, 3);
    const guaranteed = own[2] + gap;
    const part = [(gap * p) / (p + q), (gap * q) / (p + q)];
    const final = [own[0] - part[0], own[1] - part[1]];
    if (final.some((v) => v <= 0) || gap * 2 > own[2]) return null;
    const profit = divisible + 12 * s;
    const ask = rng.int(0, 1);
    const gapNoSalary = guaranteed - (profit * z) / total;
    const how = p === q ? 'equally' : `in the ratio ${p}:${q}`;
    const num = numeric(final[ask], [
      [own[ask] - (gap * psr[ask]) / (x + y), `Shared the deficiency in the profit-sharing ratio of ${a} and ${b}; the deed says they bear it ${how}.`],
      [own[ask], `Gave the share before the deficiency in ${c}'s share was made good.`],
      ...(p === q ? [] : ([[own[ask] - part[1 - ask], 'Used the other partner\'s part of the deficiency.']] as [number, string][])),
      ...(gapNoSalary > 0 ? ([[(profit * psr[ask]) / total - (gapNoSalary * (ask === 0 ? p : q)) / (p + q), 'Shared the net profit without first taking out the salary.']] as [number, string][]) : []),
      ...(ask === si ? ([[final[ask] + 12 * s, 'Added the salary; only the share of profit is asked.']] as [number, string][]) : []),
      [own[ask] + part[ask], 'Added the part of the deficiency instead of deducting it.'],
    ]);
    return num && {
      prompt: `${list(names)} are partners in ${firmOf(rng)} sharing profits and losses in the ratio ${ratioText(psr)}. ${names[si]} gets a salary of ${inr(s)} per month. ${c} is guaranteed a share of profit of not less than ${inr(guaranteed)} a year; any deficiency is borne by ${a} and ${b} ${how}. The net profit for the ${yr.ended}, before the salary, is ${inr(profit)}. How much does ${names[ask]} finally get as share of profit${ask === si ? ', apart from the salary' : ''}?`,
      ...num,
      explanation: [
        `Profit to be shared = ${inr(profit)} - salary ${inr(12 * s)} = ${inr(divisible)}.`,
        `Shares in ${ratioText(psr)}: ${names.map((nm, j) => `${nm} ${inr(own[j])}`).join(', ')}.`,
        `Deficiency = ${inr(guaranteed)} - ${inr(own[2])} = ${inr(gap)}, borne ${how}: ${a} ${inr(part[0])}, ${b} ${inr(part[1])}.`,
        `${names[ask]} finally gets ${inr(own[ask])} - ${inr(part[ask])} = ${inr(final[ask])}.`,
      ],
      hints: H.guarantee,
    };
  },
  verify: (q) => {
    const psr = psrIn(q.prompt);
    const names = namesIn(q.prompt);
    const [s, guaranteed, profit] = amountsIn(q.prompt);
    const split = /borne by .+? (equally|in the ratio (\d+):(\d+))\./.exec(q.prompt);
    const i = names.indexOf(/How much does (\w+) finally get/.exec(q.prompt)?.[1] ?? '');
    if (!split || (i !== 0 && i !== 1)) return false;
    const [p, s2] = split[1] === 'equally' ? [1, 1] : [Number(split[2]), Number(split[3])];
    const divisible = profit - 12 * s;
    const gap = guaranteed - (divisible * psr[2]) / sum(psr);
    const o = 1 - i;
    const otherFinal = (divisible * psr[o]) / sum(psr) - (gap * (o === 0 ? p : s2)) / (p + s2);
    // The three final shares use up the profit: the partner asked about gets what the other two leave.
    return gap > 0 && near(q.answer / 100, divisible - guaranteed - otherFinal);
  },
});

const commissionAfterSalary = numericTemplate({
  id: 'pf-commission-after-salary', topicId: T, conceptId: 'pf-salary-commission', difficulty: 'complex', unit: 'rupees',
  generate: (rng) => {
    const [a, b] = partners(rng, 2);
    const yr = yearOf(rng);
    const psr = psrOf(rng, 2, (pr) => [4, 5, 8, 10].includes(sum(pr)));
    const total = sum(psr);
    const r = rng.pick([5, 10, 20, 25]);
    const step = (100 + r) * 1000;
    const base = step * rng.int(Math.ceil(150000 / step), Math.floor(800000 / step));
    const s = rng.step(4000, 12000, 1000);
    const profit = base + 12 * s;
    const commission = (base * r) / (100 + r);
    const left = base - commission;
    const ask = rng.int(0, 2);
    const shareOf = (v: number): number => (v * psr[1]) / total;
    const num =
      ask === 0
        ? numeric(commission, [
            [(base * r) / 100, `Took ${r}% of the profit after the salary but before the commission; the commission is ${r}% of what is left after it too.`],
            [(profit * r) / (100 + r), `Worked the commission on the profit before ${b}'s salary; the deed says after charging the salary.`],
            [(profit * r) / 100, `Took ${r}% of the net profit as given, before both the salary and the commission.`],
            [left, 'Gave the profit left after the commission, not the commission.'],
          ])
        : ask === 1
          ? numeric(left, [
              [base - (base * r) / 100, `Worked the commission as ${r}% of the profit before charging it.`],
              [base, 'Took out the salary but forgot the commission.'],
              [profit - (profit * r) / (100 + r), 'Took out a commission worked on the profit before the salary, and forgot the salary itself.'],
              [commission, 'Gave the commission, not the profit left to be shared.'],
            ])
          : numeric(shareOf(left), [
              [shareOf(base - (base * r) / 100), `Worked the commission as ${r}% of the profit before charging it.`],
              [shareOf(base), 'Took out the salary but forgot the commission.'],
              [shareOf(left) + 12 * s, 'Added the salary; only the share of profit is asked.'],
              [left / 2, 'Shared the profit equally, although the deed gives a ratio.'],
              [(left * psr[0]) / total, `Gave ${a}'s share of the profit instead of ${b}'s.`],
            ]);
    const question = ask === 0 ? `What is ${a}'s commission?` : ask === 1 ? 'How much profit is left to be shared after the salary and the commission?' : `What is ${b}'s share of the profit that is left, apart from the salary?`;
    return num && {
      prompt: `${a} and ${b} are partners in ${firmOf(rng)} sharing profits and losses in the ratio ${ratioText(psr)}. Under the deed ${b} gets a salary of ${inr(s)} per month, and ${a} gets a commission of ${r}% of the net profit that remains after charging ${b}'s salary and such commission. The net profit for the ${yr.ended}, before the salary and the commission, is ${inr(profit)}. ${question}`,
      ...num,
      explanation: [
        `Profit after ${b}'s salary = ${inr(profit)} - ${inr(s)} x 12 = ${inr(base)}.`,
        `Commission after charging it = ${inr(base)} x ${r}/${100 + r} = ${inr(commission)}.`,
        `Profit left to be shared = ${inr(base)} - ${inr(commission)} = ${inr(left)}; ${r}% of it is ${inr(commission)}, which checks the commission.`,
        ...(ask === 2 ? [`${b}'s share = ${inr(left)} x ${psr[1]}/${total} = ${inr(shareOf(left))}.`] : []),
      ],
      hints: H.comm,
    };
  },
  verify: (q) => {
    const psr = psrIn(q.prompt);
    const [s, profit] = amountsIn(q.prompt);
    const r = read(q.prompt, /commission of (\d+)%/);
    const base = profit - 12 * s;
    const answer = q.answer / 100;
    const commission = q.prompt.endsWith("'s commission?") ? answer : q.prompt.includes('How much profit is left') ? base - answer : base - (answer / psr[1]) * sum(psr);
    // The commission must be the stated percentage of what is left after the salary and the commission itself.
    return near(commission * 100, r * (base - commission));
  },
});

const appropriationFull = numericTemplate({
  id: 'pf-appropriation-full', topicId: T, conceptId: 'pf-appropriation', difficulty: 'complex', unit: 'rupees',
  generate: (rng) => {
    const n = rng.pick([2, 3]);
    const names = partners(rng, n);
    const yr = yearOf(rng);
    const fixed = rng.int(0, 1) === 0;
    const psr = psrOf(rng, n);
    const total = sum(psr);
    const base = rng.pick([50000, 100000]);
    const caps = rng.pick(n === 2 ? CAPS2 : CAPS3).map((u) => u * base);
    const r = rng.pick([5, 8, 10, 12]);
    const ioc = caps.map((c) => (c * r) / 100);
    const unit = 20000 * total;
    const loan = unit * rng.int(Math.ceil(100000 / unit), Math.max(Math.ceil(100000 / unit), Math.floor(600000 / unit)));
    const k = rng.int(0, 8);
    const m = 12 - k;
    const loanInterest = (loan * 6 * m) / 1200;
    const si = rng.int(0, n - 1);
    const quarterly = rng.int(0, 1) === 0;
    const pay = quarterly ? rng.step(6000, 24000, 3000) : rng.step(2000, 8000, 1000);
    const periods = quarterly ? 4 : 12;
    const salary = pay * periods;
    const iod = names.map(() => total * 100 * rng.int(2, 9));
    const step = total * n * 1000;
    const divisible = step * rng.int(Math.ceil(90000 / step), Math.floor(480000 / step));
    const profit = divisible + loanInterest + sum(ioc) + salary - sum(iod);
    const i = rng.int(0, n - 1);
    const share = (v: number): number => (v * psr[i]) / total;
    const answer = share(divisible);
    const num = numeric(answer, [
      [share(divisible + loanInterest), 'Did not charge interest on the loan; with nothing agreed, a partner\'s loan still earns 6% p.a.'],
      [share(divisible + loanInterest - (loan * r * m) / 1200), `Charged the loan at ${r}%, the rate for capital; with nothing agreed, the loan carries 6% p.a.`],
      [share(divisible - sum(iod)), 'Left out the interest on drawings, which adds to the profit to be shared.'],
      [share(divisible - 2 * sum(iod)), 'Deducted the interest on drawings instead of adding it.'],
      [share(divisible + salary - pay), `Took out the salary of one ${quarterly ? 'quarter' : 'month'} only.`],
      ...(m < 12 ? ([[share(divisible + loanInterest - (loan * 6) / 100), 'Charged interest on the loan for the whole year, although it was given part-way through.']] as [number, string][]) : []),
    ]);
    return num && {
      prompt: [
        `${list(names)} are partners in ${firmOf(rng)} sharing profits and losses in the ratio ${ratioText(psr)}. ${capitalsAre(fixed)}${noChange(fixed)} The net profit for the ${yr.ended}, before any of the items below, is ${inr(profit)}. What is ${names[i]}'s share of the divisible profit?`,
        `Loan given to the firm by ${names[0]} on ${firstOf(yr, k)}: ${inr(loan)} (nothing is agreed about interest on it)`,
        `Interest on capital: ${r}% p.a.`,
        `Salary to ${names[si]}: ${inr(pay)} per ${quarterly ? 'quarter' : 'month'}`,
        ...names.map((nm, j) => `${nm}: ${capitalLabel(fixed, yr)} ${inr(caps[j])}; interest on drawings ${inr(iod[j])}`),
      ].join('\n'),
      ...num,
      explanation: [
        `Interest on the loan is a charge: 6% p.a. for ${m} months = ${inr(loan)} x 6/100 x ${m}/12 = ${inr(loanInterest)}. Net profit after it = ${inr(profit - loanInterest)}.`,
        `Interest on capital at ${r}%: ${names.map((nm, j) => `${nm} ${inr(ioc[j])}`).join(', ')}; total ${inr(sum(ioc))}. Salary = ${inr(pay)} x ${periods} = ${inr(salary)}.`,
        `Divisible profit = ${inr(profit - loanInterest)} + interest on drawings ${inr(sum(iod))} - ${inr(sum(ioc))} - ${inr(salary)} = ${inr(divisible)}.`,
        `${names[i]}'s share = ${inr(divisible)} x ${psr[i]}/${total} = ${inr(answer)}.`,
      ],
      hints: ['Sort the items first: which is a charge that comes off before the net profit, and which are appropriations?', 'Net profit after the charge, plus interest on drawings, less interest on capital and salary, is shared in the ratio.'],
    };
  },
  verify: (q) => {
    // Both accounts must agree: the profit given, with interest on drawings, is used up by the charge, the appropriations and the shares.
    const [loanLine, , salaryLine, ...rows] = dataLines(q.prompt);
    const r = rateIn(q.prompt);
    const psr = psrIn(q.prompt);
    const i = namesIn(q.prompt).indexOf(/What is (\w+)'s share/.exec(q.prompt)?.[1] ?? '');
    const loanInterest = (amountsIn(loanLine)[0] * 0.06 * monthsLeft(loanLine)[0]) / 12;
    const salary = amountsIn(salaryLine)[0] * (salaryLine.includes('per quarter') ? 4 : 12);
    const ioc = sum(rows.map((l) => (amountsIn(l)[0] * r) / 100));
    const iod = sum(rows.map((l) => amountsIn(l)[1]));
    const profit = read(q.prompt, /before any of the items below, is (₹[\d,]+)/);
    return i >= 0 && near(profit + iod, loanInterest + ioc + salary + (q.answer / 100 / psr[i]) * sum(psr));
  },
});

/** The lines of one adjusting entry from the net effect on each partner: who got too much is debited, who got too little is credited. */
const adjustingLines = (fixed: boolean, names: string[], net: number[]): JournalLine[] => [
  ...names.flatMap((nm, j) => (net[j] < 0 ? [dr(ownId(fixed, nm), -net[j])] : [])),
  ...names.flatMap((nm, j) => (net[j] > 0 ? [cr(ownId(fixed, nm), net[j])] : [])),
];
const netText = (names: string[], net: number[]): string =>
  names.map((nm, j) => (net[j] === 0 ? `${nm} nil` : `${nm} ${inr(Math.abs(net[j]))} ${net[j] > 0 ? 'short (credit)' : 'in excess (debit)'}`)).join(', ');
/** True when the expected lines are exactly the nets: a debit for each negative one and a credit for each positive one. */
const linesMatch = (q: JournalQuestion, names: string[], net: number[]): boolean => {
  const family = q.prompt.includes('capitals are fixed') ? 'current' : 'capital';
  const moved = names.filter((_, j) => !near(net[j], 0));
  return (
    q.expected.length === moved.length &&
    names.every((nm, j) => near(net[j], 0) || q.expected.some((l) => l.accountId === `${family}:${nm}` && l.side === (net[j] > 0 ? 'Cr' : 'Dr') && near(l.amount / 100, Math.abs(net[j]))))
  );
};

const pastAdjustmentIoc = journalTemplate({
  id: 'pf-past-adj-ioc', topicId: T, conceptId: 'pf-past-adjustments', difficulty: 'complex', computed: true,
  generate: (rng) => {
    const n = rng.pick([2, 3, 3]);
    const names = partners(rng, n);
    const yr = yearOf(rng);
    const fixed = rng.int(0, 1) === 0;
    const base = rng.pick([50000, 100000]);
    const caps = rng.pick(n === 2 ? CAPS2 : CAPS3).map((u) => u * base);
    const r = rng.pick([5, 6, 8, 10, 12]);
    const ioc = caps.map((c) => (c * r) / 100);
    const withSalary = rng.int(0, 2) === 0;
    const si = rng.int(0, n - 1);
    const s = rng.step(2000, 6000, 500);
    const due = ioc.map((x, j) => x + (withSalary && j === si ? 12 * s : 0));
    const omitted = sum(due);
    const usable = (n === 2 ? PSR2 : PSR3).filter((pr) => omitted % sum(pr) === 0 && due.every((x, j) => x * sum(pr) !== omitted * pr[j]));
    if (usable.length === 0) return null;
    const psr = rng.pick(usable);
    const total = sum(psr);
    const back = psr.map((t) => (omitted * t) / total);
    const net = due.map((x, j) => x - back[j]);
    const what = withSalary ? `interest on capital at ${r}% p.a. and ${names[si]}'s salary of ${inr(s)} per month, both provided by the deed,` : `interest on capital at ${r}% p.a., provided by the deed,`;
    return {
      prompt: [
        `${list(names)} are partners in ${firmOf(rng)} sharing profits and losses in the ratio ${ratioText(psr)}. ${capitalsAre(fixed)}${noChange(fixed)} After the accounts of the ${yr.ended} were closed, it was found that ${what} had been left out, so the whole profit had been shared in the profit-sharing ratio. The profit of the year was more than enough for what was left out. Pass one adjusting entry to set this right, without reopening the accounts.`,
        ...names.map((nm, j) => `${nm}: ${capitalLabel(fixed, yr)} ${inr(caps[j])}`),
      ].join('\n'),
      lines: adjustingLines(fixed, names, net),
      explanation: [
        `Should have been credited (${withSalary ? `interest on capital at ${r}%, and salary ${inr(12 * s)} to ${names[si]}` : `interest on capital at ${r}%`}): ${names.map((nm, j) => `${nm} ${inr(due[j])}`).join(', ')}; total ${inr(omitted)}.`,
        `This ${inr(omitted)} was shared as profit in ${ratioText(psr)} instead, so it is taken back: ${names.map((nm, j) => `${nm} ${inr(back[j])}`).join(', ')}.`,
        `Net effect: ${netText(names, net)}.`,
        `A partner who received too much is debited and a partner who received too little is credited. ${whyOwn(fixed)}`,
      ],
      distractorAccounts: ['profitAndLossAppropriation', 'interestOnCapital', fixed ? partnerCapital(names[0]) : partnerCurrent(names[0])],
      hints: H.past,
    };
  },
  verify: (q: JournalQuestion) => {
    // The year shared out both ways on a profit large enough: as it was, and as the deed requires. The entry is the difference.
    const names = namesIn(q.prompt);
    const psr = psrIn(q.prompt);
    const total = sum(psr);
    const r = rateIn(q.prompt);
    const caps = dataLines(q.prompt).map((l) => amountsIn(l)[0]);
    const salaried = /and (\w+)'s salary of (₹[\d,]+) per month/.exec(q.prompt);
    const due = caps.map((c, j) => (c * r) / 100 + (salaried && names[j] === salaried[1] ? 12 * toNumber(salaried[2]) : 0));
    const whole = sum(due) * 10;
    const net = names.map((_, j) => due[j] + ((whole - sum(due)) * psr[j]) / total - (whole * psr[j]) / total);
    return linesMatch(q, names, net);
  },
});

const pastAdjustmentRatio = journalTemplate({
  id: 'pf-past-adj-ratio', topicId: T, conceptId: 'pf-past-adjustments', difficulty: 'complex', computed: true,
  generate: (rng) => {
    const n = rng.pick([2, 3, 3]);
    const names = partners(rng, n);
    const yr = yearOf(rng);
    const fixed = rng.int(0, 1) === 0;
    const right = psrOf(rng, n);
    const equally = rng.int(0, 1) === 0;
    const wrong = equally ? names.map(() => 1) : psrOf(rng, n, (pr) => !sameRatio(pr, right));
    const tr = sum(right);
    const tw = sum(wrong);
    const step = lcm(tr, tw) * 1000;
    const lo = Math.ceil(120000 / step);
    const hi = Math.floor(720000 / step);
    if (hi < lo) return null;
    const profit = step * rng.int(lo, hi);
    const should = right.map((t) => (profit * t) / tr);
    const got = wrong.map((t) => (profit * t) / tw);
    const net = should.map((x, j) => x - got[j]);
    const how = equally ? 'equally' : `in the ratio ${ratioText(wrong)}`;
    return {
      prompt: `${list(names)} are partners in ${firmOf(rng)}. Under their deed they share profits and losses in the ratio ${ratioText(right)}. ${capitalsAre(fixed)} After the accounts of the ${yr.ended} were closed, it was found that the profit of ${inr(profit)} had been shared ${how} by mistake. Pass one adjusting entry to set this right, without reopening the accounts.`,
      lines: adjustingLines(fixed, names, net),
      explanation: [
        `Should have been credited, in ${ratioText(right)}: ${names.map((nm, j) => `${nm} ${inr(should[j])}`).join(', ')}.`,
        `Was credited, ${how}: ${names.map((nm, j) => `${nm} ${inr(got[j])}`).join(', ')}.`,
        `Net effect: ${netText(names, net)}.`,
        `A partner who received too much is debited and a partner who received too little is credited. ${whyOwn(fixed)}`,
      ],
      distractorAccounts: ['profitAndLossAppropriation', 'profitAndLoss', fixed ? partnerCapital(names[0]) : partnerCurrent(names[0])],
      hints: H.past,
    };
  },
  verify: (q: JournalQuestion) => {
    const names = namesIn(q.prompt);
    const right = psrIn(q.prompt);
    const mistaken = /shared (equally|in the ratio ([\d:]+)) by mistake/.exec(q.prompt);
    if (!mistaken) return false;
    const wrong = mistaken[1] === 'equally' ? names.map(() => 1) : mistaken[2].split(':').map(Number);
    const profit = amountsIn(q.prompt)[0];
    // Each partner's share as a fraction of the profit, right less wrong.
    const net = names.map((_, j) => profit * (right[j] / sum(right) - wrong[j] / sum(wrong)));
    return linesMatch(q, names, net);
  },
});

const pastAdjustmentEffect = mcqTemplate({
  id: 'pf-past-adj-effect', topicId: T, conceptId: 'pf-past-adjustments', difficulty: 'complex',
  generate: (rng) => {
    const n = rng.pick([2, 3, 3]);
    const names = partners(rng, n);
    const yr = yearOf(rng);
    const fixed = rng.int(0, 1) === 0;
    const i = rng.int(0, n - 1);
    const account = ownName(fixed, names[i]);
    const says = (v: number): string => `It is ${v > 0 ? 'credited' : 'debited'} with ${inr(Math.abs(v))}`;
    const closed = `After the accounts of the ${yr.ended} were closed, it was found that`;
    const ask = `The partners set this right by one adjusting entry. What does that entry do to ${account}?`;
    if (rng.int(0, 1) === 0) {
      // Interest on drawings left out: each partner owes the interest, and the firm's extra profit goes back in the ratio.
      const psr = psrOf(rng, n);
      const total = sum(psr);
      const iod = names.map(() => total * 100 * rng.int(2, 12));
      const extra = sum(iod);
      const back = psr.map((t) => (extra * t) / total);
      const net = back.map((x, j) => x - iod[j]);
      if (net[i] === 0) return null;
      return choice(
        [
          `${list(names)} are partners in ${firmOf(rng)} sharing profits and losses in the ratio ${ratioText(psr)}. ${capitalsAre(fixed)} ${closed} the interest on drawings below, which the deed requires, had not been charged. ${ask}`,
          ...names.map((nm, j) => `${nm}: interest on drawings not charged ${inr(iod[j])}`),
        ].join('\n'),
        says(net[i]),
        [
          [says(-net[i]), net[i] > 0 ? 'Reversed the entry: the partner\'s share of the extra profit is more than the interest owed, so the account is credited.' : 'Reversed the entry: the interest the partner owes is more than the share of the extra profit, so the account is debited.'],
          [says(-iod[i]), 'Charged the interest on drawings but gave the partner no share of the extra profit that the interest creates.'],
          [says(back[i]), 'Gave the share of the extra profit but did not charge the partner\'s own interest on drawings.'],
        ],
        `Interest on drawings to be charged: ${names.map((nm, j) => `${nm} ${inr(iod[j])}`).join(', ')}; total ${inr(extra)}. This adds ${inr(extra)} to the profit, shared in ${ratioText(psr)}: ${names.map((nm, j) => `${nm} ${inr(back[j])}`).join(', ')}. For ${names[i]}: share ${inr(back[i])} less interest ${inr(iod[i])} = ${inr(Math.abs(net[i]))} net ${net[i] > 0 ? 'credit' : 'debit'}.`,
        H.past,
      );
    }
    // Interest on capital allowed at the wrong rate: the difference is due to (or from) each partner, and the profit moves the other way.
    const base = rng.pick([50000, 100000]);
    const caps = rng.pick(n === 2 ? CAPS2 : CAPS3).map((u) => u * base);
    const [given, due] = rng.pick<[number, number]>([[10, 8], [8, 10], [6, 9], [9, 6], [12, 10], [10, 12], [5, 8], [8, 6]]);
    const diff = caps.map((c) => (c * (due - given)) / 100);
    const moved = sum(diff);
    const usable = (n === 2 ? PSR2 : PSR3).filter((pr) => moved % sum(pr) === 0 && diff[i] * sum(pr) !== moved * pr[i]);
    if (usable.length === 0) return null;
    const psr = rng.pick(usable);
    const back = psr.map((t) => (moved * t) / sum(psr));
    const net = diff.map((x, j) => x - back[j]);
    const short = due > given;
    return choice(
      [
        `${list(names)} are partners in ${firmOf(rng)} sharing profits and losses in the ratio ${ratioText(psr)}. ${capitalsAre(fixed)}${noChange(fixed)} ${closed} interest on capital had been allowed at ${given}% p.a. instead of the ${due}% p.a. that the deed provides. The profit of the year was more than enough for the interest. ${ask}`,
        ...names.map((nm, j) => `${nm}: ${capitalLabel(fixed, yr)} ${inr(caps[j])}`),
      ].join('\n'),
      says(net[i]),
      [
        [says(-net[i]), 'Reversed the entry: debit and credit have changed places.'],
        [says(diff[i]), short ? 'Credited the interest that was short but did not take back the profit that had been shared in its place.' : 'Took back the excess interest but did not give the partner a share of the profit that this sets free.'],
        [says(-back[i]), short ? 'Took back the profit that had been shared in place of the interest but did not credit the interest that was short.' : 'Gave the share of the profit set free but did not take back the excess interest.'],
      ],
      `Interest ${short ? 'short' : 'in excess'} at ${Math.abs(due - given)}% of capital: ${names.map((nm, j) => `${nm} ${inr(Math.abs(diff[j]))}`).join(', ')}; total ${inr(Math.abs(moved))}. The profit shared was ${short ? 'too large' : 'too small'} by this ${inr(Math.abs(moved))}, in ${ratioText(psr)}: ${names.map((nm, j) => `${nm} ${inr(Math.abs(back[j]))}`).join(', ')}. For ${names[i]}: ${short ? `interest to be credited ${inr(diff[i])} less profit to be taken back ${inr(back[i])}` : `profit to be credited ${inr(-back[i])} less interest to be taken back ${inr(-diff[i])}`} = ${inr(Math.abs(net[i]))} net ${net[i] > 0 ? 'credit' : 'debit'}.`,
      H.past,
    );
  },
  verify: (q) => {
    // What each partner should have had less what each partner had, on a profit large enough for both ways of sharing.
    const names = namesIn(q.prompt);
    const psr = psrIn(q.prompt);
    const total = sum(psr);
    const i = names.indexOf(/do to (\w+)'s (?:Current|Capital) A\/c/.exec(q.prompt)?.[1] ?? '');
    const figures = dataLines(q.prompt).map((l) => amountsIn(l)[0]);
    if (i < 0) return false;
    let net: number;
    if (q.prompt.includes('interest on drawings')) net = (sum(figures) * psr[i]) / total - figures[i];
    else {
      const rates = /allowed at (\d+)% p\.a\. instead of the (\d+)% p\.a\./.exec(q.prompt);
      if (!rates) return false;
      const whole = sum(figures);
      const had = (rate: number) => (figures[i] * rate) / 100 + ((whole - (sum(figures) * rate) / 100) * psr[i]) / total;
      net = had(Number(rates[2])) - had(Number(rates[1]));
    }
    return optionText(q) === `It is ${net > 0 ? 'credited' : 'debited'} with ${inr(Math.round(Math.abs(net)))}`;
  },
});

// ===============================================================================================================
// SETS OF ENTRIES: the entries of one year of one firm, one entry for each item
// ===============================================================================================================
// Conventions of the sets (each opening states the ones it relies on):
//  - an appropriation is passed by one entry straight through Profit and Loss Appropriation A/c; a charge (interest
//    on a partner's loan, rent to a partner) has an expense account of its own, which is closed to Profit and Loss A/c;
//  - interest on a partner's loan is credited to the partner's Loan A/c, never to the capital or current account;
//  - a guaranteed share: the divisible profit is first shared in the ratio, and the deficiency is then made good by an
//    entry between the partners' own accounts.
// The single entries of the topic (pf-journal-allow, pf-journal-close) teach the other form the board accepts, in
// which each appropriation has an account of its own that is then closed. So that a student who has met both is
// never marked wrong for the form the other taught, a set states its form in the opening, says in the explanation
// that no separate account is opened, and never offers the accounts of the other form among its choices
// (`SEPARATE_ACCOUNTS`; every set names enough wrong choices of its own for the engine to add none at random).

const APP = 'profitAndLossAppropriation';
const THROUGH_APP =
  'The firm passes each appropriation by one entry straight through Profit and Loss Appropriation A/c, without opening a separate account for it.';
/** The same where interest on drawings is charged: it is no appropriation, so the sentence names it. */
const THROUGH_APP_DRAWINGS =
  'The firm passes each appropriation, and interest on drawings, by one entry straight through Profit and Loss Appropriation A/c, without opening a separate account for it.';
/** Why the debit (or, for interest on drawings, the credit) of an entry of a set is Profit and Loss Appropriation A/c itself. */
const NO_ACCOUNT_OF_ITS_OWN = 'The firm opens no separate account for it, so the entry goes straight through Profit and Loss Appropriation A/c.';
/**
 * The accounts of the two-entry form, and the expense accounts a student taught that form would take for them. A set
 * never offers one: its entries go straight through Profit and Loss Appropriation A/c.
 */
const SEPARATE_ACCOUNTS = ['interestOnCapital', 'partnersSalary', 'partnersCommission', 'interestOnDrawings', 'salaries', 'commissionPaid', 'interestPaid', 'interestReceived'];
/** True when a set offers none of the accounts of the two-entry form. */
const oneEntryChoices = (q: JournalSetQuestion): boolean => !q.accountChoices.some((id) => SEPARATE_ACCOUNTS.includes(id));
/** "Aarav ₹3,00,000, Bhavna ₹2,00,000". */
const each = (names: readonly string[], xs: readonly number[]): string => names.map((nm, j) => `${nm} ${inr(xs[j])}`).join(', ');
/** The items of a set that are not dated transactions: (a), (b), ... in the order given. */
type SetItem = Pick<SetTransaction, 'text' | 'lines' | 'explanation'>;
const labelled = (items: SetItem[]): SetTransaction[] => items.map((it, k) => ({ label: `(${'abcdefgh'[k]})`, ...it }));
/** The line of the data that starts with `key` ("Interest on capital"), or '' when there is none. */
const rowOf = (rows: readonly string[], key: string): string => rows.find((l) => l.startsWith(key)) ?? '';
/** What a ledger shows for an account in rupees, a credit balance positive. */
const credit = (ledger: Ledger, accountId: string): number => -(ledger.get(accountId) ?? 0) / 100;
const sharesText = (names: readonly string[], d: number, psr: readonly number[]): string =>
  `Shares in ${ratioText(psr)}: ${names.map((nm, j) => `${nm} ${inr(d)} x ${psr[j]}/${sum(psr)} = ${inr((d * psr[j]) / sum(psr))}`).join('; ')}.`;

/** How round a figure is: the place of the largest of `steps` (largest first) that divides it, and their number when none does. */
const roundness = (x: number, steps: readonly number[]): number => {
  const at = steps.findIndex((step) => x % step === 0);
  return at < 0 ? steps.length : at;
};
/**
 * A net profit that leaves every partner a share in whole hundreds of rupees. `left(p)` is the profit a net profit
 * of `p` leaves to be shared once the appropriations are made (null when one of them would not be in whole rupees);
 * it must be a fair part of the profit, and the profit in keeping with the `capital` of the firm. Of the profits that fit, one of the roundest is taken, the roundness of the
 * shares counting twice that of the profit: a round profit with shares to the last rupee does not read like a
 * question that was set, while a profit to the last ten rupees is what a Profit and Loss A/c shows.
 */
function profitThatFits(rng: Rng, total: number, left: (p: number) => number | null, capital: number): number | null {
  // A profit in keeping with the capital employed: a firm with ₹2,00,000 of capital does not earn ₹9,00,000.
  const [min, max] = [150000, Math.min(900000, Math.max(300000, 1.5 * capital))];
  // Whole hundreds first; a profit to the last ten rupees only when interest on drawings leaves no other.
  for (const step of [100, 10]) {
    let best = Infinity;
    let fits: number[] = [];
    for (let p = Math.ceil(min / step) * step; p <= max; p += step) {
      const d = left(p);
      if (d === null || !Number.isInteger(d) || d < 40000 || d * 5 < p || d % (total * 100) !== 0) continue;
      const score = roundness(p, [10000, 5000, 1000, 500, 100, 50]) + 2 * roundness(d / total, [1000, 500]);
      if (score < best) [best, fits] = [score, []];
      if (score === best) fits.push(p);
    }
    if (fits.length > 0) return rng.pick(fits);
  }
  return null;
}

/** The first of `options`, in an order drawn for the seed, for which `fit` finds a figure; null when none does. */
function firstThatFits<T>(rng: Rng, options: readonly T[], fit: (option: T) => number | null): { option: T; value: number } | null {
  for (const option of rng.shuffle(options)) {
    const value = fit(option);
    if (value !== null) return { option, value };
  }
  return null;
}

/** Capital brought in (or withdrawn for good) by partner `i` on the first day of month `k` of the year. */
interface Move {
  i: number;
  kind: 'in' | 'out';
  k: number;
  amt: number;
  /** Capital brought in as an asset and not by cheque: the account that is debited, what the data calls the asset and the particulars of the row. */
  asset?: { id: string; text: string; label: string };
}
/** What a partner may bring in as capital in place of money. */
const ASSETS = [
  { id: 'machinery', text: 'machinery', label: 'Machinery A/c' },
  { id: 'furniture', text: 'furniture', label: 'Furniture A/c' },
  { id: 'computers', text: 'computers', label: 'Computers A/c' },
  { id: 'vehicles', text: 'a delivery van', label: 'Vehicles A/c' },
];
const moveSays = (names: readonly string[], m: Move): string =>
  m.asset
    ? `${names[m.i]} brought in ${m.asset.text} valued at ${inr(m.amt)} as further capital`
    : m.kind === 'in'
      ? `${names[m.i]} brought in ${inr(m.amt)} as further capital, by cheque`
      : `${names[m.i]} permanently withdrew ${inr(m.amt)} of capital, by cheque`;
const MOVE_RE = /(\d{1,2} \w+ 20\d\d)[:,] (\w+) (brought in|permanently withdrew) (?:[a-z ]+ valued at )?(₹[\d,]+)/;
/** One or two changes of capital in a year, on different days and by different partners, each leaving a fair capital behind. */
function movesOf(rng: Rng, caps: readonly number[], count: number): Move[] | null {
  const moves: Move[] = [];
  const months = rng.shuffle([1, 2, 3, 4, 5, 6, 7, 8, 9]).slice(0, count).sort((x, y) => x - y);
  for (let c = 0; c < count; c++) {
    const free = caps.map((_, i) => i).filter((i) => !moves.some((m) => m.i === i));
    // Capital can be withdrawn only by a partner who is left with the larger part of it.
    const most = Math.max(...free.map((i) => caps[i]));
    const amt = rng.step(60000, Math.max(60000, Math.min(180000, Math.floor(most / 120000) * 60000)), 60000);
    const rich = free.filter((i) => amt * 2 <= caps[i]);
    // The second change is of the other kind, so that a set or an account never shows the same thing twice.
    const wanted = c === 0 ? rng.pick(['in', 'in', 'out'] as const) : moves[0].kind === 'in' ? 'out' : 'in';
    if (wanted === 'out' && rich.length === 0 && c > 0) return null;
    const kind = wanted === 'out' && rich.length > 0 ? 'out' : 'in';
    moves.push({ i: rng.pick(kind === 'out' ? rich : free), kind, k: months[c], amt });
  }
  return moves;
}
/**
 * Interest on capital at `r`% p.a.: a full year on the capital the year opened with, and on capital brought in or
 * withdrawn for the months from its date to the year end. With the working, one line for each partner.
 */
function interestOnCapitals(names: readonly string[], caps: readonly number[], r: number, moves: readonly Move[], yr: Year): { ioc: number[]; working: string[] } {
  const part = (m: Move): number => (m.amt * r * (12 - m.k)) / 1200;
  const ioc = caps.map((c, j) => (c * r) / 100 + sum(moves.filter((m) => m.i === j).map((m) => (m.kind === 'in' ? part(m) : -part(m)))));
  const working = names.map((nm, j) => {
    const mine = moves.filter((m) => m.i === j);
    const full = `${nm}: ${inr(caps[j])} x ${r}/100 = ${inr((caps[j] * r) / 100)}`;
    if (mine.length === 0) return `${full}.`;
    const parts = mine.map((m) => `${m.kind === 'in' ? 'plus' : 'less'} ${inr(m.amt)} x ${r}/100 x ${12 - m.k}/12 = ${inr(part(m))} on the capital ${m.kind === 'in' ? 'brought in' : 'withdrawn'} on ${firstOf(yr, m.k)}`);
    return `${full}, ${parts.join(', ')}: ${inr(ioc[j])}.`;
  });
  return { ioc, working };
}
/** Interest on a capital by the product method: each balance for the months it stood. `changes` are [months left to the year end, amount in or (negative) out]. */
function productInterest(open: number, r: number, changes: readonly [number, number][]): number {
  let balance = open;
  let products = 0;
  let at = 12;
  for (const [left, delta] of [...changes].sort((x, y) => y[0] - x[0])) {
    products += balance * (at - left);
    balance += delta;
    at = left;
  }
  return ((products + balance * at) * r) / 1200;
}
/** The changes of capital a text states ("1 October 2024: Bhavna brought in ₹1,20,000 ..."), by partner, for `productInterest`. */
function changesIn(texts: readonly string[], names: readonly string[]): [number, number][][] {
  const out: [number, number][][] = names.map(() => []);
  for (const text of texts) {
    const m = MOVE_RE.exec(text);
    if (m && names.includes(m[2])) out[names.indexOf(m[2])].push([monthsLeft(m[1])[0], m[3] === 'brought in' ? toNumber(m[4]) : -toNumber(m[4])]);
  }
  return out;
}

/** How a partner drew during the year, as the data says it, with the interest it carries at `q`% p.a. and the working. */
interface Drawn {
  text: string;
  total: number;
  interest: number;
  working: string;
}
type DrawKind = 'monthly' | 'date' | 'none';
function drawnBy(rng: Rng, yr: Year, q: number, kind: DrawKind, when: When): Drawn {
  if (kind === 'monthly') {
    const p = averagePeriod('month', when);
    // Interest = d x q x p / 100. At 9% with an average period of 5.5 or 6.5 months only an even number of
    // thousands gives whole tens of rupees, which the profit of the year needs to leave round shares.
    const d = (q * p * 10) % 10 === 0 ? rng.step(2000, 9000, 1000) : rng.step(2000, 8000, 2000);
    const interest = (12 * d * q * p) / 1200;
    return { text: `${inr(d)} ${timing('month', when)}`, total: 12 * d, interest, working: `${inr(12 * d)} x ${q}/100 x ${p}/12 = ${inr(interest)} (average period ${monthsText(p)})` };
  }
  if (kind === 'date') {
    // Interest = amt x q x months / 1200: amounts that give it in whole fifties of rupees at the rate.
    const amt = q % 3 === 0 ? rng.step(20000, 100000, 20000) : rng.step(24000, 96000, 12000);
    const k = rng.int(1, 10);
    const interest = (amt * q * (12 - k)) / 1200;
    return { text: `${inr(amt)} on ${firstOf(yr, k)}`, total: amt, interest, working: `${inr(amt)} x ${q}/100 x ${12 - k}/12 = ${inr(interest)}` };
  }
  const amt = rng.step(20000, 120000, 10000);
  const interest = (amt * q * 6) / 1200;
  return { text: `${inr(amt)} during the year, dates not known`, total: amt, interest, working: `${inr(amt)} x ${q}/100 x 6/12 = ${inr(interest)} (no dates, so six months)` };
}
/** The interest on drawings stated as `drawnBy` states them, worked the long way: every withdrawal for its own months. */
function interestOnDrawn(text: string, q: number): number {
  const amt = amountsIn(text)[0];
  if (text.includes('every month')) return simulateDrawings(amt, q, 'month', whenIn(text));
  return (amt * q * (text.includes('dates not known') ? 6 : monthsLeft(text)[0])) / 1200;
}

// 1. pf-set-appropriations: the appropriations of a year with fluctuating capitals, each by one entry (easy)
const APPROPRIATION_SHAPES: { transfer: boolean; salary: boolean; commission: boolean }[] = [
  { transfer: false, salary: true, commission: false },
  { transfer: false, salary: false, commission: true },
  { transfer: false, salary: true, commission: true },
  { transfer: true, salary: true, commission: false },
  { transfer: true, salary: false, commission: true },
  { transfer: true, salary: false, commission: false },
];
const setAppropriations = journalSetTemplate({
  id: 'pf-set-appropriations', topicId: T, conceptId: 'pf-sets', difficulty: 'easy',
  generate: (rng) => {
    const n = rng.pick([2, 2, 3]);
    const names = partners(rng, n);
    const yr = yearOf(rng);
    const firm = firmOf(rng);
    const psr = psrOf(rng, n);
    const total = sum(psr);
    const shape = rng.pick(APPROPRIATION_SHAPES);
    const base = rng.pick([50000, 100000]);
    const caps = rng.pick(n === 2 ? CAPS2 : CAPS3).map((u) => u * base);
    const r = rng.pick([5, 6, 8, 10]);
    const ioc = caps.map((c) => (c * r) / 100);
    const si = rng.int(0, n - 1);
    const s = rng.step(2000, 8000, 1000);
    const salary = shape.salary ? 12 * s : 0;
    const ci = shape.salary ? (si + rng.int(1, n - 1)) % n : rng.int(0, n - 1);
    const c = rng.pick([5, 10]);
    const commissionOn = (p: number): number => (shape.commission ? (p * c) / 100 : 0);
    const profit = profitThatFits(rng, total, (p) => p - sum(ioc) - salary - commissionOn(p), sum(caps));
    if (profit === null) return null;
    const commission = commissionOn(profit);
    const divisible = profit - sum(ioc) - salary - commission;
    const shares = psr.map((t) => (divisible * t) / total);
    const capital = (j: number): string => partnerCapital(names[j]);
    const items: SetItem[] = [];
    if (shape.transfer) {
      items.push({
        text: 'The net profit of the year is carried from Profit and Loss A/c to Profit and Loss Appropriation A/c.',
        lines: [dr('profitAndLoss', profit), cr(APP, profit)],
        explanation: [`Profit and Loss A/c is debited with its net profit of ${inr(profit)}, which closes it.`, 'Profit and Loss Appropriation A/c is credited: it is the account in which the profit is shared out.'],
      });
    }
    items.push({
      text: 'Interest on capital is allowed to the partners for the year.',
      lines: [dr(APP, sum(ioc)), ...names.map((_, j) => cr(capital(j), ioc[j]))],
      explanation: [
        `No capital came in or went out, so each capital earns ${r}% for the full year: ${names.map((nm, j) => `${nm} ${inr(caps[j])} x ${r}/100 = ${inr(ioc[j])}`).join('; ')}; total ${inr(sum(ioc))}.`,
        `Interest on capital is an appropriation of profit: Profit and Loss Appropriation A/c is debited with the total. ${NO_ACCOUNT_OF_ITS_OWN}`,
        'Capitals are fluctuating, so each partner\'s Capital A/c is credited.',
      ],
    });
    if (shape.salary) {
      items.push({
        text: `${names[si]} is allowed the salary for the year.`,
        lines: [dr(APP, salary), cr(capital(si), salary)],
        explanation: [`Salary = ${inr(s)} x 12 = ${inr(salary)}.`, `A partner's salary is an appropriation, not an expense: Profit and Loss Appropriation A/c is debited and ${names[si]}'s Capital A/c is credited. ${NO_ACCOUNT_OF_ITS_OWN}`],
      });
    }
    if (shape.commission) {
      items.push({
        text: `${names[ci]} is allowed the commission for the year.`,
        lines: [dr(APP, commission), cr(capital(ci), commission)],
        explanation: [
          `The commission is worked on the net profit before any appropriation: ${inr(profit)} x ${c}/100 = ${inr(commission)}.`,
          `It is an appropriation: Profit and Loss Appropriation A/c is debited and ${names[ci]}'s Capital A/c is credited. ${NO_ACCOUNT_OF_ITS_OWN}`,
        ],
      });
    }
    items.push({
      text: 'The profit that is left is shared among the partners.',
      lines: [dr(APP, divisible), ...names.map((_, j) => cr(capital(j), shares[j]))],
      explanation: [
        `Divisible profit = ${inr(profit)} - interest on capital ${inr(sum(ioc))}${shape.salary ? ` - salary ${inr(salary)}` : ''}${shape.commission ? ` - commission ${inr(commission)}` : ''} = ${inr(divisible)}.`,
        sharesText(names, divisible, psr),
        'Profit and Loss Appropriation A/c is debited with what is left, which closes it, and each partner\'s Capital A/c is credited with the share.',
      ],
    });
    return {
      task: `Pass the journal entries of ${yr.on} for the appropriation of the profit.`,
      opening: [
        `${list(names)} are partners in ${firm} sharing profits and losses in the ratio ${ratioText(psr)}. Their capitals are fluctuating, and no capital was brought in or withdrawn during the ${yr.ended}. Profit and Loss A/c for the year shows a net profit of ${inr(profit)}${shape.transfer ? '' : ', which has already been carried to Profit and Loss Appropriation A/c'}. ${THROUGH_APP}`,
        `Capitals on ${yr.from}: ${each(names, caps)}`,
        `Interest on capital: ${r}% p.a.`,
        ...(shape.salary ? [`Salary: ${inr(s)} per month to ${names[si]}`] : []),
        ...(shape.commission ? [`Commission: ${c}% of the net profit shown above, before any appropriation, to ${names[ci]}`] : []),
      ].join('\n'),
      transactions: labelled(items),
      hints: [H.approp[0], 'Each appropriation debits Profit and Loss Appropriation A/c and credits the partner. What is left closes the account.'],
      // The slips: the Current A/c that only fixed capitals have, the Drawings A/c, and Profit and Loss A/c for what is no charge.
      distractorAccounts: [...names.map(partnerCurrent), partnerDrawings(names[0]), 'generalReserve', ...(shape.transfer ? [] : ['profitAndLoss'])],
    };
  },
  verify: (q: JournalSetQuestion) => {
    if (!setHolds()(q) || !oneEntryChoices(q)) return false;
    // The year worked forwards from the figures the student reads: what each partner is credited with in all.
    const [, head, ...rows] = q.prompt.split('\n');
    const names = namesIn(head);
    const psr = psrIn(head);
    const profit = read(head, /net profit of (₹[\d,]+)/);
    const caps = amountsIn(rowOf(rows, 'Capitals on'));
    const r = rateIn(rowOf(rows, 'Interest on capital'));
    const salaryRow = rowOf(rows, 'Salary');
    const commissionRow = rowOf(rows, 'Commission');
    const allowed = names.map(
      (nm, j) => (caps[j] * r) / 100 + (salaryRow.endsWith(` to ${nm}`) ? 12 * amountsIn(salaryRow)[0] : 0) + (commissionRow.endsWith(` to ${nm}`) ? (profit * read(commissionRow, /(\d+)%/)) / 100 : 0),
    );
    const left = profit - sum(allowed);
    const ledger = post(q.entries.map((e) => e.expected));
    const carried = q.entries.some((e) => e.expected.some((l) => l.accountId === 'profitAndLoss'));
    // Profit and Loss Appropriation A/c is used up exactly: closed when the set carries the profit to it, else debited with the whole profit.
    return (ledger.get(APP) ?? 0) === (carried ? 0 : rupees(profit)) && names.every((nm, j) => near(credit(ledger, partnerCapital(nm)), allowed[j] + (left * psr[j]) / sum(psr)));
  },
});

// 2. pf-set-fixed-appropriations: the same with fixed capitals, so through the current accounts, with interest on
//    drawings and a transfer to General Reserve; interest is worked from rates and months (medium)
const setFixedAppropriations = journalSetTemplate({
  id: 'pf-set-fixed-appropriations', topicId: T, conceptId: 'pf-sets', difficulty: 'medium',
  generate: (rng) => {
    const n = rng.pick([2, 2, 3]);
    const names = partners(rng, n);
    const yr = yearOf(rng);
    const firm = firmOf(rng);
    const psr = psrOf(rng, n);
    const total = sum(psr);
    const base = rng.pick([50000, 100000]);
    const caps = rng.pick(n === 2 ? CAPS2 : CAPS3).map((u) => u * base);
    const r = rng.pick([5, 6, 8, 10]);
    const moves = rng.int(0, 3) === 0 ? [] : movesOf(rng, caps, 1);
    if (moves === null) return null;
    const { ioc, working } = interestOnCapitals(names, caps, r, moves, yr);
    const q = rng.pick([6, 9, 10, 12]);
    // Without a change of capital the months are in the drawings: they then have dates.
    const kind = rng.pick<DrawKind>(moves.length === 0 ? ['monthly', 'date'] : ['monthly', 'date', 'none']);
    const when = rng.pick(WHENS);
    const drawn = names.map(() => drawnBy(rng, yr, q, kind, when));
    const iod = drawn.map((d) => d.interest);
    const withSalary = rng.int(0, 2) > 0;
    const si = rng.int(0, n - 1);
    const s = rng.step(2000, 8000, 500);
    const salary = withSalary ? 12 * s : 0;
    // The share of the profit that is set aside: the first, in an order drawn for the seed, that leaves round shares.
    const leftOf = (p: number, pc: number): number | null => ((p * pc) % 100 === 0 ? p + sum(iod) - sum(ioc) - salary - (p * pc) / 100 : null);
    const fit = firstThatFits(rng, [5, 10, 20], (pc) => profitThatFits(rng, total, (p) => leftOf(p, pc), sum(caps)));
    if (fit === null) return null;
    const { option: pct, value: profit } = fit;
    const reserve = (profit * pct) / 100;
    const divisible = leftOf(profit, pct)!;
    const shares = psr.map((t) => (divisible * t) / total);
    const current = (j: number): string => partnerCurrent(names[j]);
    const items: SetItem[] = [
      {
        text: 'Interest on capital is allowed to the partners for the year.',
        lines: [dr(APP, sum(ioc)), ...names.map((_, j) => cr(current(j), ioc[j]))],
        explanation: [
          `Interest on capital at ${r}% p.a. ${working.join(' ')} Total ${inr(sum(ioc))}.`,
          `It is an appropriation of profit: Profit and Loss Appropriation A/c is debited with the total. ${NO_ACCOUNT_OF_ITS_OWN}`,
          'Capitals are fixed, so the interest is credited to each partner\'s Current A/c and the Capital A/c is not touched.',
        ],
      },
      ...(withSalary
        ? [
            {
              text: `${names[si]} is allowed the salary for the year.`,
              lines: [dr(APP, salary), cr(current(si), salary)],
              explanation: [`Salary = ${inr(s)} x 12 = ${inr(salary)}.`, `It is an appropriation: Profit and Loss Appropriation A/c is debited and ${names[si]}'s Current A/c is credited.`],
            },
          ]
        : []),
      {
        text: 'Interest on drawings is charged to the partners for the year.',
        lines: [...names.map((_, j) => dr(current(j), iod[j])), cr(APP, sum(iod))],
        explanation: [
          `Interest on drawings at ${q}% p.a.: ${names.map((nm, j) => `${nm} ${drawn[j].working}`).join('; ')}; total ${inr(sum(iod))}.`,
          'The partners owe it to the firm, so each partner\'s Current A/c is debited.',
          `It adds to the profit to be shared: Profit and Loss Appropriation A/c is credited. ${NO_ACCOUNT_OF_ITS_OWN}`,
        ],
      },
      {
        text: 'The transfer to General Reserve is made.',
        lines: [dr(APP, reserve), cr('generalReserve', reserve)],
        explanation: [`Transfer = ${inr(profit)} x ${pct}/100 = ${inr(reserve)}, worked on the net profit as Profit and Loss A/c shows it.`, 'Profit set aside is an appropriation: Profit and Loss Appropriation A/c is debited and General Reserve A/c is credited.'],
      },
      {
        text: 'The profit that is left is shared among the partners.',
        lines: [dr(APP, divisible), ...names.map((_, j) => cr(current(j), shares[j]))],
        explanation: [
          `Divisible profit = ${inr(profit)} + interest on drawings ${inr(sum(iod))} - interest on capital ${inr(sum(ioc))}${withSalary ? ` - salary ${inr(salary)}` : ''} - General Reserve ${inr(reserve)} = ${inr(divisible)}.`,
          sharesText(names, divisible, psr),
          'Profit and Loss Appropriation A/c is debited with what is left, which closes it, and each partner\'s Current A/c is credited with the share.',
        ],
      },
    ];
    return {
      task: `Pass the journal entries of ${yr.on} for the appropriation of the profit.`,
      opening: [
        `${list(names)} are partners in ${firm} sharing profits and losses in the ratio ${ratioText(psr)}. Their capitals are fixed. Profit and Loss A/c for the ${yr.ended} shows a net profit of ${inr(profit)}, which has already been carried to Profit and Loss Appropriation A/c. ${THROUGH_APP_DRAWINGS}`,
        `Fixed capitals on ${yr.from}: ${each(names, caps)}`,
        ...moves.map((m) => `${firstOf(yr, m.k)}: ${moveSays(names, m)}`),
        `Interest on capital: ${r}% p.a.`,
        `Drawings: ${names.map((nm, j) => `${nm} ${drawn[j].text}`).join('; ')}`,
        `Interest on drawings: ${q}% p.a.`,
        ...(withSalary ? [`Salary: ${inr(s)} per month to ${names[si]}`] : []),
        `General Reserve: ${pct}% of the net profit shown above, before any appropriation`,
      ].join('\n'),
      transactions: labelled(items),
      hints: ['Capitals are fixed: which account of a partner takes interest, salary and the share of profit?', 'Interest on capital and on drawings runs only for the months each amount was in, or out of, the firm.'],
      // The slips: the Capital A/c, which a fixed capital keeps out of the year, the Drawings A/c for interest on drawings, and Profit and Loss A/c.
      distractorAccounts: [...names.map(partnerCapital), partnerDrawings(names[0]), 'profitAndLoss'],
    };
  },
  verify: (q: JournalSetQuestion) => {
    if (!setHolds()(q) || !oneEntryChoices(q)) return false;
    // Interest on capital by the product method and interest on drawings withdrawal by withdrawal, then the year forwards.
    const [, head, ...rows] = q.prompt.split('\n');
    const names = namesIn(head);
    const psr = psrIn(head);
    const profit = read(head, /net profit of (₹[\d,]+)/);
    const caps = amountsIn(rowOf(rows, 'Fixed capitals on'));
    const r = rateIn(rowOf(rows, 'Interest on capital'));
    const changes = changesIn(rows, names);
    const ioc = caps.map((c, j) => productInterest(c, r, changes[j]));
    const rate = rateIn(rowOf(rows, 'Interest on drawings'));
    const iod = rowOf(rows, 'Drawings: ').slice('Drawings: '.length).split('; ').map((text) => interestOnDrawn(text, rate));
    const salaryRow = rowOf(rows, 'Salary');
    const salary = names.map((nm) => (salaryRow.endsWith(` to ${nm}`) ? 12 * amountsIn(salaryRow)[0] : 0));
    const reserve = (profit * read(rowOf(rows, 'General Reserve'), /(\d+)%/)) / 100;
    const left = profit + sum(iod) - sum(ioc) - sum(salary) - reserve;
    const ledger = post(q.entries.map((e) => e.expected));
    return (
      iod.length === names.length &&
      (ledger.get(APP) ?? 0) === rupees(profit) &&
      near(credit(ledger, 'generalReserve'), reserve) &&
      names.every((nm, j) => !ledger.has(partnerCapital(nm)) && near(credit(ledger, partnerCurrent(nm)), ioc[j] + salary[j] - iod[j] + (left * psr[j]) / sum(psr)))
    );
  },
});

// 3. pf-set-loan-charge: a partner's loan (and in some seeds rent to a partner) beside the appropriations: the
//    charges go through Profit and Loss A/c and reduce the net profit that is carried to be shared (medium)
/** A charge has an expense account of its own, so that "Profit and Loss A/c Dr, To the partner's Loan A/c" is not a second answer. */
const CHARGES_OWN = 'The firm debits each charge against profit to an expense account of its own';
const LOAN_SHAPES = ['close', 'close', 'rentClose', 'rentAllow', 'noDeed'] as const;
const setLoanCharge = journalSetTemplate({
  id: 'pf-set-loan-charge', topicId: T, conceptId: 'pf-sets', difficulty: 'medium',
  // Version 2: a firm with no deed has fluctuating capitals (the fixed capital method needs an agreement).
  version: 2,
  generate: (rng) => {
    const shape = rng.pick(LOAN_SHAPES);
    const n = rng.pick([2, 2, 3]);
    const names = partners(rng, n);
    const yr = yearOf(rng);
    const firm = firmOf(rng);
    const fixedDrawn = rng.int(0, 1) === 0;
    // With no deed there is no interest on capital and no salary: the profit after the charges is shared equally.
    const noDeed = shape === 'noDeed' || (shape === 'rentClose' && rng.int(0, 1) === 0);
    // Nor are capitals fixed without an agreement: they are fluctuating. (The draw above stays, so that the other seeds keep their figures.)
    const fixed = fixedDrawn && !noDeed;
    const psr = noDeed ? names.map(() => 1) : psrOf(rng, n);
    const total = sum(psr);
    const li = rng.int(0, n - 1);
    const lender = names[li];
    const k = rng.int(1, 9);
    const m = 12 - k;
    const agreed = !noDeed && rng.int(0, 3) === 0;
    const rate = agreed ? rng.pick([8, 9, 10, 12]) : 6;
    const loan = agreed ? rng.step(120000, 600000, 60000) : rng.step(100000, 600000, 20000);
    const interest = (loan * rate * m) / 1200;
    const withRent = shape === 'rentClose' || shape === 'rentAllow';
    const owner = names[(li + rng.int(1, n - 1)) % n];
    const monthly = rng.step(2000, 9000, 500);
    const rent = withRent ? 12 * monthly : 0;
    const closes = shape !== 'rentAllow';
    const allows = shape === 'close' || shape === 'rentAllow';
    const allowance = rng.pick(['salary', 'capital'] as const);
    const si = rng.int(0, n - 1);
    const s = rng.step(2000, 8000, 500);
    const base = rng.pick([50000, 100000]);
    const caps = rng.pick(n === 2 ? CAPS2 : CAPS3).map((u) => u * base);
    const r = rng.pick([5, 8, 10, 12]);
    const allowed = names.map((_, j) => (!allows ? 0 : allowance === 'salary' ? (j === si ? 12 * s : 0) : (caps[j] * r) / 100));
    const step = total * 1000;
    const divisible = step * rng.int(Math.ceil(60000 / step), Math.floor(420000 / step));
    const net = divisible + sum(allowed);
    const profit = net + interest + rent;
    const shares = psr.map((t) => (divisible * t) / total);
    const own = (j: number): string => ownId(fixed, names[j]);
    /** The account of a partner that this firm does not use for the year: the slip the set is about. */
    const other = (j: number): string => (fixed ? partnerCapital(names[j]) : partnerCurrent(names[j]));
    const rateWhy = agreed ? `The partners agreed on ${rate}% p.a.` : 'Nothing was agreed, so the loan carries 6% p.a. under the Indian Partnership Act, 1932.';
    const items: SetItem[] = [
      {
        text: `Interest on ${lender}'s loan for the year is provided.`,
        lines: [dr('interestOnPartnersLoan', interest), cr(partnerLoan(lender), interest)],
        explanation: [
          `${rateWhy} From ${firstOf(yr, k)} to ${yr.on} is ${m} months: ${inr(loan)} x ${rate}/100 x ${m}/12 = ${inr(interest)}.`,
          'It is an expense of the firm: Interest on Partner\'s Loan A/c is debited.',
          `It is owed to ${lender} as a lender, so ${lender}'s Loan A/c is credited, not the capital or current account.`,
        ],
      },
    ];
    if (withRent) {
      items.push({
        text: `The rent of the year is paid to ${owner} by cheque.`,
        lines: [dr('rent', rent), cr('bank', rent)],
        explanation: [`Rent = ${inr(monthly)} x 12 = ${inr(rent)}.`, 'Rent is an expense of the business, whoever owns the shop: Rent A/c is debited and Bank A/c is credited.'],
      });
    }
    if (closes) {
      items.push(
        withRent
          ? {
              text: 'Interest on Partner\'s Loan A/c and Rent A/c are closed at the year end.',
              lines: [dr('profitAndLoss', interest + rent), cr('interestOnPartnersLoan', interest), cr('rent', rent)],
              explanation: [
                'Both are charges against profit: they are due whether or not the firm earns a profit.',
                `So both are closed to Profit and Loss A/c, which is debited with ${inr(interest)} + ${inr(rent)} = ${inr(interest + rent)}, and never to Profit and Loss Appropriation A/c.`,
              ],
            }
          : {
              text: 'Interest on Partner\'s Loan A/c is closed at the year end.',
              lines: [dr('profitAndLoss', interest), cr('interestOnPartnersLoan', interest)],
              explanation: ['Interest on a partner\'s loan is a charge against profit: it is due whether or not the firm earns a profit.', 'So the account is closed to Profit and Loss A/c, never to Profit and Loss Appropriation A/c.'],
            },
      );
    }
    items.push({
      text: 'The net profit of the year is carried to Profit and Loss Appropriation A/c.',
      lines: [dr('profitAndLoss', net), cr(APP, net)],
      explanation: [
        `Net profit = ${inr(profit)} - interest on the loan ${inr(interest)}${withRent ? ` - rent ${inr(rent)}` : ''} = ${inr(net)}: the charges come off before any profit is shared.${closes ? '' : ' (Interest on Partner\'s Loan A/c and Rent A/c are first closed to Profit and Loss A/c; that entry is not asked here.)'}`,
        'Profit and Loss A/c is debited with the net profit and Profit and Loss Appropriation A/c is credited.',
      ],
    });
    if (allows) {
      items.push(
        allowance === 'salary'
          ? {
              text: `${names[si]} is allowed the salary for the year.`,
              lines: [dr(APP, 12 * s), cr(own(si), 12 * s)],
              explanation: [`Salary = ${inr(s)} x 12 = ${inr(12 * s)}.`, `A partner's salary is an appropriation: Profit and Loss Appropriation A/c is debited and ${ownName(fixed, names[si])} is credited. ${NO_ACCOUNT_OF_ITS_OWN}`, whyOwn(fixed)],
            }
          : {
              text: 'Interest on capital is allowed to the partners for the year.',
              lines: [dr(APP, sum(allowed)), ...names.map((_, j) => cr(own(j), allowed[j]))],
              explanation: [
                `Interest on capital at ${r}% p.a. for the full year: ${names.map((nm, j) => `${nm} ${inr(caps[j])} x ${r}/100 = ${inr(allowed[j])}`).join('; ')}; total ${inr(sum(allowed))}.`,
                `Unlike interest on the loan, it is an appropriation: Profit and Loss Appropriation A/c is debited. ${NO_ACCOUNT_OF_ITS_OWN}`,
                whyOwn(fixed),
              ],
            },
      );
    }
    items.push({
      text: 'The profit that is left is shared among the partners.',
      lines: [dr(APP, divisible), ...names.map((_, j) => cr(own(j), shares[j]))],
      explanation: [
        allows ? `Divisible profit = ${inr(net)} - ${allowance === 'salary' ? 'salary' : 'interest on capital'} ${inr(sum(allowed))} = ${inr(divisible)}.` : `Nothing else is allowed to a partner, so the whole net profit of ${inr(net)} is shared.`,
        noDeed ? `With no deed the profit is shared equally: ${inr(divisible)} / ${n} = ${inr(shares[0])} each.` : sharesText(names, divisible, psr),
        `Profit and Loss Appropriation A/c is debited, which closes it. ${whyOwn(fixed)}`,
      ],
    });
    return {
      task: `Pass the journal entries of ${yr.on}.`,
      opening: [
        `${list(names)} are partners in ${firm}. ${noDeed ? 'They have no partnership deed.' : `They share profits and losses in the ratio ${ratioText(psr)}.`} ${capitalsAre(fixed)} For the ${yr.ended}, Profit and Loss A/c shows a profit of ${inr(profit)} before ${withRent ? 'the interest on the loan and the rent below are' : 'the interest on the loan below is'} charged. ${allows ? `${CHARGES_OWN}, but passes each appropriation by one entry straight through Profit and Loss Appropriation A/c, without opening a separate account for it.` : `${CHARGES_OWN}.`}`,
        `Loan: ${lender} lent the firm ${inr(loan)} on ${firstOf(yr, k)}; ${agreed ? `interest at ${rate}% p.a. was agreed` : 'nothing was agreed about interest on it'}. The interest is not paid in cash: it is credited to ${lender}'s Loan A/c`,
        ...(withRent ? [`Rent: the firm uses a shop owned by ${owner} at an agreed rent of ${inr(monthly)} per month`] : []),
        ...(allows && allowance === 'salary' ? [`Salary: ${inr(s)} per month to ${names[si]}, under the deed`] : []),
        ...(allows && allowance === 'capital' ? [`${fixed ? 'Fixed capitals' : 'Capitals'} on ${yr.from}: ${each(names, caps)}`, `Interest on capital: ${r}% p.a., under the deed${fixed ? '' : ' (no capital was brought in or withdrawn during the year)'}`] : []),
      ].join('\n'),
      transactions: labelled(items),
      hints: H.charge,
      // The slips: the lender's capital or current account for the interest, the account of a partner that this firm
      // does not use for the year, the Drawings A/c, and a liability for interest that the data says is credited to the loan.
      distractorAccounts: [other(li), other((li + 1) % n), partnerDrawings(lender), 'outstandingExpenses', 'generalReserve'],
    };
  },
  verify: (q: JournalSetQuestion) => {
    if (!setHolds()(q) || !oneEntryChoices(q)) return false;
    const [, head, ...rows] = q.prompt.split('\n');
    const names = namesIn(head);
    const psr = head.includes('no partnership deed') ? names.map(() => 1) : psrIn(head);
    const profit = read(head, /profit of (₹[\d,]+) before/);
    const loanRow = rowOf(rows, 'Loan');
    const lender = /^Loan: (\w+) lent/.exec(loanRow)?.[1] ?? '';
    const interest = (amountsIn(loanRow)[0] * (loanRow.includes('nothing was agreed') ? 6 : rateIn(loanRow)) * monthsLeft(loanRow)[0]) / 1200;
    const rentRow = rowOf(rows, 'Rent');
    const rent = rentRow ? 12 * amountsIn(rentRow)[0] : 0;
    const salaryRow = rowOf(rows, 'Salary');
    const caps = amountsIn(rows.find((l) => /^(Fixed capitals|Capitals) on/.test(l)) ?? '');
    const r = rateIn(rowOf(rows, 'Interest on capital'));
    const allowed = names.map((nm, j) => (salaryRow.includes(` to ${nm},`) ? 12 * amountsIn(salaryRow)[0] : 0) + (caps.length > 0 ? (caps[j] * r) / 100 : 0));
    const net = profit - interest - rent;
    const left = net - sum(allowed);
    const ledger = post(q.entries.map((e) => e.expected));
    const family = head.includes('capitals are fixed') ? partnerCurrent : partnerCapital;
    // A charge account that the set closes has gone to Profit and Loss A/c; one it leaves open still shows the charge.
    const open = (accountId: string, amt: number): number => ((ledger.get(accountId) ?? 0) === 0 ? 0 : amt);
    return (
      near(credit(ledger, partnerLoan(lender)), interest) &&
      [0, rupees(interest)].includes(ledger.get('interestOnPartnersLoan') ?? 0) &&
      [0, rupees(rent)].includes(ledger.get('rent') ?? 0) &&
      (ledger.get(APP) ?? 0) === 0 &&
      near(-credit(ledger, 'profitAndLoss'), profit - open('interestOnPartnersLoan', interest) - open('rent', rent)) &&
      names.every((nm, j) => near(credit(ledger, family(nm)), allowed[j] + (left * psr[j]) / sum(psr)))
    );
  },
});

// 4. pf-set-guarantee-year: a whole year with a guaranteed share: capital brought in or withdrawn (which changes the
//    interest on capital), the appropriations, the profit shared in the ratio and then the deficiency made good by
//    the firm or by one partner (complex)
const setGuaranteeYear = journalSetTemplate({
  id: 'pf-set-guarantee-year', topicId: T, conceptId: 'pf-sets', difficulty: 'complex',
  generate: (rng) => {
    const names = partners(rng, 3);
    const [a, b, c] = names;
    const yr = yearOf(rng);
    const firm = firmOf(rng);
    const fixed = rng.int(0, 1) === 0;
    const psr = psrOf(rng, 3);
    const total = sum(psr);
    const base = rng.pick([50000, 100000]);
    const caps = rng.pick(CAPS3).map((u) => u * base);
    const r = rng.pick([5, 6, 8, 10]);
    const moves = movesOf(rng, caps, rng.pick([1, 1, 2]));
    if (moves === null) return null;
    const { ioc, working } = interestOnCapitals(names, caps, r, moves, yr);
    // With one change of capital the set needs a salary or interest on drawings to have six entries.
    const extras = rng.pick(moves.length === 1 ? (['salary', 'drawings', 'both'] as const) : (['salary', 'drawings', 'both', 'none'] as const));
    const withSalary = extras === 'salary' || extras === 'both';
    const withDrawings = extras === 'drawings' || extras === 'both';
    const si = rng.int(0, 2);
    const s = rng.step(2000, 8000, 500);
    const salary = withSalary ? 12 * s : 0;
    const q = rng.pick([6, 9, 10, 12]);
    const drawn = names.map(() => drawnBy(rng, yr, q, 'none', 'end'));
    const iod = drawn.map((d) => (withDrawings ? d.interest : 0));
    const byFirm = rng.int(0, 1) === 0;
    const g = rng.int(0, 1);
    const pair = psr[0] + psr[1];
    const step = total * 1000;
    const divisible = step * rng.int(Math.ceil(150000 / step), Math.floor(600000 / step));
    const shares = psr.map((t) => (divisible * t) / total);
    // A guarantee far above the partner's own share does not read like a real deed: the deficiency is at most half the share.
    const unit = (byFirm ? pair : 1) * 1000;
    if (unit * 2 > shares[2]) return null;
    const gap = unit * rng.int(1, Math.min(6, Math.floor(shares[2] / (2 * unit))));
    const guaranteed = shares[2] + gap;
    const borne = byFirm ? [(gap * psr[0]) / pair, (gap * psr[1]) / pair] : [g === 0 ? gap : 0, g === 1 ? gap : 0];
    if (borne.some((x, j) => x * 2 > shares[j])) return null;
    const profit = divisible + sum(ioc) + salary - sum(iod);
    const own = (j: number): string => ownId(fixed, names[j]);
    const account = fixed ? 'Current A/c' : 'Capital A/c';
    const items: SetItem[] = moves.map((m) => ({
      text: `On ${firstOf(yr, m.k)}, ${moveSays(names, m)}.`,
      lines: m.kind === 'in' ? [dr('bank', m.amt), cr(partnerCapital(names[m.i]), m.amt)] : [dr(partnerCapital(names[m.i]), m.amt), cr('bank', m.amt)],
      explanation:
        m.kind === 'in'
          ? ['The cheque is paid into the bank: Bank A/c is debited.', `It is capital, so ${names[m.i]}'s Capital A/c is credited${fixed ? ': this is one of the few entries a fixed capital account takes' : ''}.`]
          : [`Capital goes out for good, so ${names[m.i]}'s Capital A/c is debited${fixed ? ': a fixed capital account changes only for capital brought in or withdrawn' : ', not the Drawings A/c'}.`, 'It is paid by cheque: Bank A/c is credited.'],
    }));
    items.push(
      {
        text: 'The net profit of the year is carried to Profit and Loss Appropriation A/c.',
        lines: [dr('profitAndLoss', profit), cr(APP, profit)],
        explanation: [`Profit and Loss A/c is debited with its net profit of ${inr(profit)}, which closes it.`, 'Profit and Loss Appropriation A/c is credited: it is the account in which the profit is shared out.'],
      },
      {
        text: 'Interest on capital is allowed to the partners for the year.',
        lines: [dr(APP, sum(ioc)), ...names.map((_, j) => cr(own(j), ioc[j]))],
        explanation: [`Interest on capital at ${r}% p.a. ${working.join(' ')} Total ${inr(sum(ioc))}.`, `It is an appropriation: Profit and Loss Appropriation A/c is debited. ${NO_ACCOUNT_OF_ITS_OWN}`, whyOwn(fixed)],
      },
    );
    if (withSalary) {
      items.push({
        text: `${names[si]} is allowed the salary for the year.`,
        lines: [dr(APP, salary), cr(own(si), salary)],
        explanation: [`Salary = ${inr(s)} x 12 = ${inr(salary)}.`, `It is an appropriation: Profit and Loss Appropriation A/c is debited and ${ownName(fixed, names[si])} is credited.`],
      });
    }
    if (withDrawings) {
      items.push({
        text: 'Interest on drawings is charged to the partners for the year.',
        lines: [...names.map((_, j) => dr(own(j), iod[j])), cr(APP, sum(iod))],
        explanation: [
          `Interest on drawings at ${q}% p.a.: ${names.map((nm, j) => `${nm} ${drawn[j].working}`).join('; ')}; total ${inr(sum(iod))}.`,
          `The partners owe it to the firm, so each partner's ${account} is debited, and Profit and Loss Appropriation A/c is credited because it adds to the profit to be shared.`,
        ],
      });
    }
    items.push(
      {
        text: 'The divisible profit is shared among the partners in the profit-sharing ratio.',
        lines: [dr(APP, divisible), ...names.map((_, j) => cr(own(j), shares[j]))],
        explanation: [
          `Divisible profit = ${inr(profit)}${withDrawings ? ` + interest on drawings ${inr(sum(iod))}` : ''} - interest on capital ${inr(sum(ioc))}${withSalary ? ` - salary ${inr(salary)}` : ''} = ${inr(divisible)}.`,
          sharesText(names, divisible, psr),
          `Profit and Loss Appropriation A/c is debited, which closes it, and each partner's ${account} is credited. The guarantee is dealt with next.`,
        ],
      },
      {
        text: `The deficiency in ${c}'s guaranteed share is made good.`,
        lines: [...borne.flatMap((x, j) => (x > 0 ? [dr(own(j), x)] : [])), cr(own(2), gap)],
        explanation: [
          `${c}'s share is ${inr(shares[2])}, which is ${inr(guaranteed)} - ${inr(shares[2])} = ${inr(gap)} short of the guaranteed amount.`,
          byFirm
            ? `The firm gave the guarantee, so ${a} and ${b} bear the deficiency in ${ratioText(lowestTerms([psr[0], psr[1]]))}: ${a} ${inr(borne[0])}, ${b} ${inr(borne[1])}.`
            : `${names[g]} alone gave the guarantee, so ${names[g]} bears the whole ${inr(gap)}; ${names[1 - g]} is not touched.`,
          `A partner who bears a deficiency is debited in the ${account} and ${c} is credited. No profit account is used: the profit has already been shared.`,
        ],
      },
    );
    return {
      task: `Pass the journal entries for the ${yr.ended}.`,
      opening: [
        `${list(names)} are partners in ${firm} sharing profits and losses in the ratio ${ratioText(psr)}. ${capitalsAre(fixed)} ${
          byFirm
            ? `The firm has guaranteed that ${c}'s share of the divisible profit will not be less than ${inr(guaranteed)} in any year; a deficiency is borne by ${a} and ${b} in their profit-sharing ratio, ${ratioText(lowestTerms([psr[0], psr[1]]))}.`
            : `${names[g]} has personally guaranteed that ${c}'s share of the divisible profit will not be less than ${inr(guaranteed)} in any year.`
        } Profit and Loss A/c for the ${yr.ended} shows a net profit of ${inr(profit)}. ${withDrawings ? THROUGH_APP_DRAWINGS : THROUGH_APP} The divisible profit is first shared in the profit-sharing ratio, and a deficiency in the guaranteed share is then made good by a separate entry.`,
        `${fixed ? 'Fixed capitals' : 'Capitals'} on ${yr.from}: ${each(names, caps)}`,
        `Interest on capital: ${r}% p.a.`,
        ...(withSalary ? [`Salary: ${inr(s)} per month to ${names[si]}`] : []),
        ...(withDrawings ? [`Drawings: ${names.map((nm, j) => `${nm} ${drawn[j].text}`).join('; ')}`, `Interest on drawings: ${q}% p.a.`] : []),
      ].join('\n'),
      transactions: labelled(items),
      hints: H.guarantee,
      // The slips: the account of a partner that this firm does not use for the year, the Drawings A/c for capital
      // withdrawn or for interest on drawings, and a reserve for the deficiency.
      distractorAccounts: [...names.map((nm) => (fixed ? partnerCapital(nm) : partnerCurrent(nm))), ...names.map(partnerDrawings), 'generalReserve'],
    };
  },
  verify: (q: JournalSetQuestion) => {
    if (!setHolds()(q) || !oneEntryChoices(q)) return false;
    const [, head, ...rows] = q.prompt.split('\n');
    const names = namesIn(head);
    const psr = psrIn(head);
    const fixed = head.includes('capitals are fixed');
    const profit = read(head, /net profit of (₹[\d,]+)/);
    const guaranteed = read(head, /not be less than (₹[\d,]+)/);
    const guarantor = names.indexOf(/\. (\w+) has personally guaranteed/.exec(head)?.[1] ?? '');
    const caps = amountsIn(rows[0]);
    const r = rateIn(rowOf(rows, 'Interest on capital'));
    const changes = changesIn(q.entries.map((e) => e.text), names);
    const ioc = caps.map((cap, j) => productInterest(cap, r, changes[j]));
    const salaryRow = rowOf(rows, 'Salary');
    const salary = names.map((nm) => (salaryRow.endsWith(` to ${nm}`) ? 12 * amountsIn(salaryRow)[0] : 0));
    const drawingsRow = rowOf(rows, 'Drawings: ');
    const iod = drawingsRow ? drawingsRow.slice('Drawings: '.length).split('; ').map((text) => interestOnDrawn(text, rateIn(rowOf(rows, 'Interest on drawings')))) : names.map(() => 0);
    const divisible = profit + sum(iod) - sum(ioc) - sum(salary);
    // The other way round: the guaranteed partner gets the guaranteed amount, and whoever gave the guarantee gets what is left.
    const third = Math.max(guaranteed, (divisible * psr[2]) / sum(psr));
    const final =
      guarantor < 0
        ? [((divisible - third) * psr[0]) / (psr[0] + psr[1]), ((divisible - third) * psr[1]) / (psr[0] + psr[1]), third]
        : [0, 1].map((j) => (j === guarantor ? divisible - third - (divisible * psr[1 - j]) / sum(psr) : (divisible * psr[j]) / sum(psr))).concat(third);
    const ledger = post(q.entries.map((e) => e.expected));
    const moved = changes.map((list) => sum(list.map(([, delta]) => delta)));
    return (
      third > (divisible * psr[2]) / sum(psr) &&
      (ledger.get(APP) ?? 0) === 0 &&
      near(-credit(ledger, 'profitAndLoss'), profit) &&
      names.every((nm, j) => {
        const yearly = ioc[j] + salary[j] - iod[j] + final[j];
        return fixed ? near(credit(ledger, partnerCapital(nm)), moved[j]) && near(credit(ledger, partnerCurrent(nm)), yearly) : near(credit(ledger, partnerCapital(nm)), moved[j] + yearly);
      })
    );
  },
});

// ===============================================================================================================
// FORMATS: the Profit and Loss Appropriation Account, the partners' accounts in columns, a statement of adjustments
// ===============================================================================================================
// Every account is written up from journal entries with the engine. In them each appropriation has an account of
// its own, so that the particulars read as an examiner expects them: "To Interest on Capital A/c", "To Partner's
// Salary A/c", "By Interest on Drawings A/c", "By Profit and Loss Appropriation A/c" for a share of profit.

/** What the format of a question was made from, for its `verify`: the entries, and the balances the accounts open with. */
const keptEntries = keepFor<{ entries: DatedEntry[]; opening?: Ledger }>();

/** The year's appropriations, in rupees: one figure for each partner (0 for none). `profit` is the net profit after every charge. */
interface Appropriations {
  yr: Year;
  names: string[];
  fixed: boolean;
  psr: number[];
  profit: number;
  /** Lines of working shown under the net profit in the solution, where it had to be worked out. */
  profitDetails?: string[];
  ioc: number[];
  salary: number[];
  commission: number[];
  iod: number[];
  reserve: number;
}
/** The profit the appropriations leave to be shared: net profit and interest on drawings in, everything allowed or set aside out. */
const divisibleOf = (a: Pick<Appropriations, 'profit' | 'ioc' | 'salary' | 'commission' | 'iod' | 'reserve'>): number =>
  a.profit + sum(a.iod) - sum(a.ioc) - sum(a.salary) - sum(a.commission) - a.reserve;
/**
 * Profit and Loss Appropriation A/c written up from the closing entries of the year. Interest on capital of all the
 * partners is one row, and so is interest on drawings (the solution shows each partner's figure under it); each
 * partner's share of profit is a closing row of its own, which the student works out.
 */
function appropriationAccount(a: Appropriations) {
  const on = a.yr.on;
  const divisible = divisibleOf(a);
  const shares = a.psr.map((t) => (divisible * t) / sum(a.psr));
  const closed = (accountId: string, xs: number[]): DatedEntry[] => (sum(xs) > 0 ? [{ date: on, lines: [dr(APP, sum(xs)), cr(accountId, sum(xs))] }] : []);
  const entries: DatedEntry[] = [
    { date: on, lines: [dr('profitAndLoss', a.profit), cr(APP, a.profit)] },
    ...(sum(a.iod) > 0 ? [{ date: on, lines: [dr('interestOnDrawings', sum(a.iod)), cr(APP, sum(a.iod))] }] : []),
    ...closed('interestOnCapital', a.ioc),
    ...closed('partnersSalary', a.salary),
    ...closed('partnersCommission', a.commission),
    ...closed('generalReserve', [a.reserve]),
    { date: on, lines: [dr(APP, divisible), ...a.names.map((nm, j) => cr(ownId(a.fixed, nm), shares[j]))] },
  ];
  const view = accountOf(entries, APP);
  const perPartner = (xs: number[]): string[] => (xs.filter((x) => x > 0).length > 1 ? a.names.flatMap((nm, j) => (xs[j] > 0 ? [`${nm} ${inr(xs[j])}`] : [])) : []);
  const details: Record<string, string[]> = {
    profitAndLoss: a.profitDetails ?? [],
    interestOnDrawings: perPartner(a.iod),
    interestOnCapital: perPartner(a.ioc),
    partnersSalary: perPartner(a.salary),
    partnersCommission: perPartner(a.commission),
  };
  const rows = (postings: typeof view.debit): FormatRowParts[] =>
    postings.map((p) => ({
      date: p.date,
      label: p.label,
      amount: p.amount,
      ...(details[p.accountIds[0]]?.length ? { details: details[p.accountIds[0]] } : {}),
      ...(p.accountIds[0].includes(':') ? { closing: true } : {}),
    }));
  return { entries, divisible, shares, left: drSide(rows(view.debit)), right: crSide(rows(view.credit)) };
}
const APP_TITLE = 'Profit and Loss Appropriation A/c';
const appTask = (yr: Year, drawings: boolean): string =>
  `Prepare the Profit and Loss Appropriation Account of the firm for the ${yr.ended}, showing interest on capital as one figure${drawings ? ', interest on drawings as one figure' : ''} and each partner's share of profit on its own.`;
/** What a finished Appropriation Account must show: both sides at `credits`, and a closing row for each partner's share of what is left. */
function appropriationHolds(q: AccountQuestion, names: string[], psr: number[], fixed: boolean, credits: number, appropriated: number): boolean {
  const kept = keptEntries.of(q.data);
  if (!kept) return false;
  const [debit, creditSide] = q.sides.map((s) => s.rows);
  const total = (rows: typeof debit): number => sum(rows.map((row) => row.amounts[0])) / 100;
  const left = credits - appropriated;
  const ledger = post(kept.entries.map((e) => e.lines));
  return (
    near(total(debit), credits) &&
    near(total(creditSide), credits) &&
    (ledger.get(APP) ?? 0) === 0 &&
    // Nothing that is a charge may stand in the account.
    !debit.some((row) => /Loan|Rent|Manager/.test(row.label)) &&
    names.every((nm, j) => {
      const share = (left * psr[j]) / sum(psr);
      return debit.some((row) => row.closing && row.label === ownName(fixed, nm) && near(row.amounts[0] / 100, share)) && near(credit(ledger, ownId(fixed, nm)), share);
    })
  );
}

// 1. pf-fmt-appropriation: Profit and Loss Appropriation A/c from appropriations that are given; the divisible
//    profit and the shares are worked out. A third of the seeds name a charge that is already in the net profit (easy)
const APP_GIVEN_SHAPES: { salary: boolean; commission: boolean; drawings: boolean; reserve: boolean }[] = [
  { salary: true, commission: false, drawings: true, reserve: false },
  { salary: true, commission: true, drawings: false, reserve: false },
  { salary: true, commission: false, drawings: false, reserve: true },
  { salary: false, commission: true, drawings: true, reserve: false },
  { salary: true, commission: true, drawings: true, reserve: false },
  { salary: true, commission: false, drawings: true, reserve: true },
  { salary: false, commission: false, drawings: true, reserve: true },
];
const fmtAppropriation = accountTemplate({
  id: 'pf-fmt-appropriation', topicId: T, conceptId: 'pf-formats', difficulty: 'easy',
  generate: (rng) => {
    const n = rng.pick([2, 2, 3]);
    const names = partners(rng, n);
    const yr = yearOf(rng);
    const firm = firmOf(rng);
    const fixed = rng.int(0, 1) === 0;
    const psr = psrOf(rng, n);
    const total = sum(psr);
    const shape = rng.pick(APP_GIVEN_SHAPES);
    const ioc = names.map(() => rng.step(9000, 48000, 1500));
    const si = rng.int(0, n - 1);
    const ci = (si + rng.int(1, n - 1)) % n;
    const salary = names.map((_, j) => (shape.salary && j === si ? rng.step(24000, 96000, 12000) : 0));
    const commission = names.map((_, j) => (shape.commission && j === ci ? rng.step(10000, 50000, 5000) : 0));
    const iod = names.map(() => (shape.drawings ? rng.step(500, 4500, 500) : 0));
    const reserve = shape.reserve ? rng.step(10000, 50000, 5000) : 0;
    const step = total * 1000;
    const divisible = step * rng.int(Math.ceil(60000 / step), Math.floor(420000 / step));
    const profit = divisible + sum(ioc) + sum(salary) + sum(commission) + reserve - sum(iod);
    const charge = rng.pick(['none', 'none', 'none', 'loan', 'rent', 'manager'] as const);
    const charged = rng.step(6000, 36000, 3000);
    const who = names[rng.int(0, n - 1)];
    const chargeLine = {
      none: '',
      loan: `Interest on ${who}'s loan to the firm, ${inr(charged)}, has been charged in Profit and Loss A/c`,
      rent: `Rent of ${inr(charged)} for the shop that ${who} lets to the firm has been charged in Profit and Loss A/c`,
      manager: `The manager's commission of ${inr(charged)} has been charged in Profit and Loss A/c`,
    }[charge];
    const chargeWhy = {
      none: '',
      loan: `Interest on ${who}'s loan is a charge against profit. It was debited to Profit and Loss A/c before the net profit was found, so it has no place in this account.`,
      rent: `Rent paid to ${who} is a charge against profit, like any rent. It was debited to Profit and Loss A/c before the net profit was found, so it has no place in this account.`,
      manager: 'The manager is an employee, so the commission is a charge against profit. It was debited to Profit and Loss A/c before the net profit was found, so it has no place in this account.',
    }[charge];
    const made = appropriationAccount({ yr, names, fixed, psr, profit, ioc, salary, commission, iod, reserve });
    const data = [
      `${list(names)} are partners in ${firm} sharing profits and losses in the ratio ${ratioText(psr)}. ${capitalsAre(fixed)}`,
      `Net profit for the ${yr.ended} as per Profit and Loss A/c: ${inr(profit)}`,
      ...(charge === 'none' ? [] : [chargeLine]),
      `Interest on capital allowed: ${each(names, ioc)}`,
      ...(shape.salary ? [`Salary allowed to ${names[si]} for the year: ${inr(salary[si])}`] : []),
      ...(shape.commission ? [`Commission allowed to ${names[ci]} for the year: ${inr(commission[ci])}`] : []),
      ...(shape.drawings ? [`Interest on drawings charged: ${each(names, iod)}`] : []),
      ...(shape.reserve ? [`Transfer to General Reserve: ${inr(reserve)}`] : []),
    ].join('\n');
    keptEntries.keep(data, { entries: made.entries });
    const account = fixed ? 'Current A/c' : 'Capital A/c';
    const out = [
      `interest on capital ${inr(sum(ioc))}`,
      ...(shape.salary ? [`salary ${inr(sum(salary))}`] : []),
      ...(shape.commission ? [`commission ${inr(sum(commission))}`] : []),
      ...(shape.reserve ? [`General Reserve ${inr(reserve)}`] : []),
    ];
    return {
      task: appTask(yr, shape.drawings),
      data,
      title: APP_TITLE,
      left: made.left,
      right: made.right,
      // Every label an Appropriation Account may hold is on offer, so that the list does not say which of them this one has.
      distractors: ['Interest on Partner\'s Loan A/c', 'Rent A/c', 'Drawings A/c', 'Balance c/d', `${names[0]}'s ${fixed ? 'Capital' : 'Current'} A/c`, 'Manager\'s Commission A/c', 'Partner\'s Salary A/c', 'Partner\'s Commission A/c', 'Interest on Drawings A/c', 'General Reserve A/c'],
      explanation: [
        `The account opens with the net profit brought from Profit and Loss A/c: By Profit and Loss A/c ${inr(profit)}.`,
        ...(charge === 'none' ? [] : [chargeWhy]),
        ...(shape.drawings ? [`Interest on drawings is a gain of the firm from its partners, so it is on the credit side: ${iod.map(inr).join(' + ')} = ${inr(sum(iod))}.`] : []),
        `Interest on capital is an appropriation, on the debit side: ${ioc.map(inr).join(' + ')} = ${inr(sum(ioc))}.${shape.salary || shape.commission ? ` So ${shape.salary && shape.commission ? 'are the salary and the commission' : shape.salary ? 'is the salary' : 'is the commission'} allowed to a partner.` : ''}${shape.reserve ? ' Profit set aside in General Reserve is debited too.' : ''}`,
        `Divisible profit = ${inr(profit)}${shape.drawings ? ` + ${inr(sum(iod))}` : ''} - ${out.join(' - ')} = ${inr(made.divisible)}.`,
        sharesText(names, made.divisible, psr),
        `Each share is debited and carried to the partner's ${account}, because capitals are ${fixed ? 'fixed' : 'fluctuating'}. The two sides then agree and no balance is left.`,
      ],
      hints: H.approp,
    };
  },
  verify: (q: AccountQuestion) => {
    // Forwards from the figures the student reads: what goes in, what is appropriated, and what that leaves for each partner.
    const [head, ...rows] = q.data.split('\n');
    const figure = (key: string): number => sum(amountsIn(rowOf(rows, key)));
    const credits = figure('Net profit') + figure('Interest on drawings charged');
    const appropriated = figure('Interest on capital allowed') + figure('Salary allowed') + figure('Commission allowed') + figure('Transfer to General Reserve');
    return appropriationHolds(q, namesIn(head), psrIn(head), head.includes('capitals are fixed'), credits, appropriated);
  },
});

// 2. pf-fmt-appropriation-worked: the same account where every figure is worked out: interest on capital from the
//    rate, interest on drawings from how each partner drew, a salary by the month, a commission before or after
//    charging it and, in a third of the seeds, a net profit that is still before interest on a partner's loan (medium)
const fmtAppropriationWorked = accountTemplate({
  id: 'pf-fmt-appropriation-worked', topicId: T, conceptId: 'pf-formats', difficulty: 'medium',
  generate: (rng) => {
    const n = rng.pick([2, 2, 3]);
    const names = partners(rng, n);
    const yr = yearOf(rng);
    const firm = firmOf(rng);
    const fixed = rng.int(0, 1) === 0;
    const psr = psrOf(rng, n);
    const total = sum(psr);
    const base = rng.pick([50000, 100000]);
    const caps = rng.pick(n === 2 ? CAPS2 : CAPS3).map((u) => u * base);
    const r = rng.pick([5, 6, 8, 10]);
    const ioc = caps.map((cap) => (cap * r) / 100);
    const q = rng.pick([6, 9, 10, 12]);
    const drawn = names.map(() => drawnBy(rng, yr, q, rng.pick<DrawKind>(['monthly', 'monthly', 'date', 'none']), rng.pick(WHENS)));
    const iod = drawn.map((d) => d.interest);
    const si = rng.int(0, n - 1);
    const ci = (si + rng.int(1, n - 1)) % n;
    const s = rng.step(2000, 8000, 500);
    const salary = names.map((_, j) => (j === si ? 12 * s : 0));
    // How the commission is worked: before or after charging it, at a rate; the first, in an order drawn for the seed, that leaves round shares.
    const commissionOn = (p: number, [after, c]: readonly [boolean, number]): number => (after ? (p * c) / (100 + c) : (p * c) / 100);
    const leftOf = (p: number, basis: readonly [boolean, number]): number | null => (Number.isInteger(commissionOn(p, basis)) ? p + sum(iod) - sum(ioc) - 12 * s - commissionOn(p, basis) : null);
    const fit = firstThatFits<[boolean, number]>(rng, [[true, 5], [true, 10], [true, 20], [false, 5], [false, 10]], (basis) => profitThatFits(rng, total, (p) => leftOf(p, basis), sum(caps)));
    if (fit === null) return null;
    const { option: [after, c], value: profit } = fit;
    const commission = names.map((_, j) => (j === ci ? commissionOn(profit, [after, c]) : 0));
    const withLoan = rng.int(0, 2) === 0;
    const lender = names[rng.int(0, n - 1)];
    const k = rng.int(1, 9);
    const loan = rng.step(100000, 400000, 20000);
    const loanInterest = withLoan ? (loan * 6 * (12 - k)) / 1200 : 0;
    const made = appropriationAccount({
      yr, names, fixed, psr, profit, ioc, salary, commission, iod, reserve: 0,
      ...(withLoan ? { profitDetails: [`Profit before interest on the loan ${inr(profit + loanInterest)}`, `Less: Interest on ${lender}'s loan ${inr(loanInterest)}`] } : {}),
    });
    const data = [
      `${list(names)} are partners in ${firm} sharing profits and losses in the ratio ${ratioText(psr)}. ${capitalsAre(fixed)}${noChange(fixed)}`,
      withLoan ? `Profit for the ${yr.ended} before interest on ${lender}'s loan: ${inr(profit + loanInterest)}` : `Net profit for the ${yr.ended} as per Profit and Loss A/c: ${inr(profit)}`,
      ...(withLoan ? [`Loan given to the firm by ${lender} on ${firstOf(yr, k)}: ${inr(loan)}; nothing is agreed about interest on it`] : []),
      `${fixed ? 'Fixed capitals' : `Capitals on ${yr.from}`}: ${each(names, caps)}`,
      `Interest on capital: ${r}% p.a.`,
      `Drawings: ${names.map((nm, j) => `${nm} ${drawn[j].text}`).join('; ')}`,
      `Interest on drawings: ${q}% p.a.`,
      `Salary: ${inr(s)} per month to ${names[si]}`,
      `Commission to ${names[ci]}: ${c}% of the net profit (after all charges, before any ${after ? 'other appropriation), after charging such commission' : 'appropriation)'}`,
    ].join('\n');
    keptEntries.keep(data, { entries: made.entries });
    const account = fixed ? 'Current A/c' : 'Capital A/c';
    return {
      task: appTask(yr, true),
      data,
      title: APP_TITLE,
      left: made.left,
      right: made.right,
      distractors: ['Interest on Partner\'s Loan A/c', `${lender}'s Loan A/c`, 'Drawings A/c', 'Balance c/d', `${names[0]}'s ${fixed ? 'Capital' : 'Current'} A/c`, 'General Reserve A/c', 'Manager\'s Commission A/c'],
      explanation: [
        withLoan
          ? `Interest on ${lender}'s loan is a charge against profit: nothing is agreed, so 6% p.a. for ${12 - k} months = ${inr(loan)} x 6/100 x ${12 - k}/12 = ${inr(loanInterest)}. It comes off in Profit and Loss A/c, so the net profit brought into this account is ${inr(profit + loanInterest)} - ${inr(loanInterest)} = ${inr(profit)}, and the interest itself is not shown here.`
          : `The account opens with the net profit brought from Profit and Loss A/c: By Profit and Loss A/c ${inr(profit)}.`,
        `Interest on drawings at ${q}% p.a. is credited: ${names.map((nm, j) => `${nm} ${drawn[j].working}`).join('; ')}; total ${inr(sum(iod))}.`,
        `Interest on capital at ${r}% p.a. for the full year is debited: ${names.map((nm, j) => `${nm} ${inr(caps[j])} x ${r}/100 = ${inr(ioc[j])}`).join('; ')}; total ${inr(sum(ioc))}.`,
        `Salary to ${names[si]} = ${inr(s)} x 12 = ${inr(12 * s)}.`,
        after
          ? `Commission after charging it = ${inr(profit)} x ${c}/${100 + c} = ${inr(commission[ci])}: it is ${c}% of the ${inr(profit - commission[ci])} that is left of the net profit once it is taken out.`
          : `Commission = ${inr(profit)} x ${c}/100 = ${inr(commission[ci])}, on the net profit before any appropriation.`,
        `Divisible profit = ${inr(profit)} + ${inr(sum(iod))} - ${inr(sum(ioc))} - ${inr(12 * s)} - ${inr(commission[ci])} = ${inr(made.divisible)}.`,
        sharesText(names, made.divisible, psr),
        `Each share is debited and carried to the partner's ${account}, because capitals are ${fixed ? 'fixed' : 'fluctuating'}. The two sides then agree and no balance is left.`,
      ],
      hints: [H.charge[0], H.approp[0]],
    };
  },
  verify: (q: AccountQuestion) => {
    // Every figure again, the long way: the loan by its months, the drawings withdrawal by withdrawal, the commission by what defines it.
    const [head, ...rows] = q.data.split('\n');
    const names = namesIn(head);
    const loanRow = rowOf(rows, 'Loan given');
    const before = rowOf(rows, 'Profit for the');
    const profit = before ? amountsIn(before)[0] - (amountsIn(loanRow)[0] * 6 * monthsLeft(loanRow)[0]) / 1200 : amountsIn(rowOf(rows, 'Net profit'))[0];
    const ioc = sum(amountsIn(rows.find((l) => /^(Fixed capitals|Capitals on)/.test(l)) ?? '')) * (rateIn(rowOf(rows, 'Interest on capital')) / 100);
    const rate = rateIn(rowOf(rows, 'Interest on drawings'));
    const iod = sum(rowOf(rows, 'Drawings: ').slice('Drawings: '.length).split('; ').map((text) => interestOnDrawn(text, rate)));
    const salary = 12 * amountsIn(rowOf(rows, 'Salary'))[0];
    const commissionRow = rowOf(rows, 'Commission to');
    const c = read(commissionRow, /(\d+)%/);
    const commission = (q.sides[0].rows.find((row) => row.label === 'Partner\'s Commission A/c')?.amounts[0] ?? 0) / 100;
    const defined = commissionRow.includes('after charging') ? near(commission * 100, c * (profit - commission)) : near(commission * 100, c * profit);
    const shown = (side: 0 | 1, label: string): number => (q.sides[side].rows.find((row) => row.label === label)?.amounts[0] ?? 0) / 100;
    return (
      defined &&
      near(shown(1, 'Profit and Loss A/c'), profit) &&
      near(shown(1, 'Interest on Drawings A/c'), iod) &&
      near(shown(0, 'Interest on Capital A/c'), ioc) &&
      near(shown(0, 'Partner\'s Salary A/c'), salary) &&
      appropriationHolds(q, names, psrIn(head), head.includes('capitals are fixed'), profit + iod, ioc + salary + commission)
    );
  },
});

/**
 * One year of the partners' own accounts: the capitals (and, beside fixed capitals, the current accounts) the year
 * opens with, capital brought in or withdrawn, drawings, and what the appropriations give each partner. A current
 * balance is in rupees, a credit balance positive.
 */
interface PartnersYear {
  names: string[];
  yr: Year;
  firm: string;
  fixed: boolean;
  psr: number[];
  caps: number[];
  currents: number[];
  moves: Move[];
  r: number;
  ioc: number[];
  iocWorking: string[];
  drawings: number[];
  q: number;
  iod: number[];
  si: number;
  s: number;
  salary: number[];
  ci: number;
  commission: number[];
  divisible: number;
  shares: number[];
  profit: number;
}
/** What a year may hold beyond the usual. */
interface YearOptions {
  /** The partner with the smallest share draws more than the year gives, so that the current account ends with a debit balance. */
  overdraw?: boolean;
  /** How many changes of capital by cheque the year has: one of these, drawn for the seed. */
  changes?: readonly number[];
  /** A partner also brings in an asset as further capital. */
  inKind?: boolean;
  /** The year of a 6-mark question: a commission may be allowed to a partner, and at least two of salary, commission and interest on drawings occur. */
  rich?: boolean;
}
function partnersYear(rng: Rng, fixed: boolean, opts: YearOptions = {}): PartnersYear | null {
  const n = rng.pick([2, 3, 3]);
  const names = partners(rng, n);
  const yr = yearOf(rng);
  const firm = firmOf(rng);
  const psr = psrOf(rng, n);
  const total = sum(psr);
  const base = rng.pick([50000, 100000]);
  const caps = rng.pick(n === 2 ? CAPS2 : CAPS3).map((u) => u * base);
  const r = rng.pick([5, 6, 8, 10]);
  const moves = movesOf(rng, caps, rng.pick(opts.changes ?? [1, 1, 2]));
  if (moves === null) return null;
  if (opts.inKind) {
    // On a day of its own, by a partner who has not taken capital out, and of a size in keeping with the capitals.
    const k = rng.pick([1, 2, 3, 4, 5, 6, 7, 8, 9].filter((month) => !moves.some((m) => m.k === month)));
    const i = rng.pick(names.map((_, j) => j).filter((j) => !moves.some((m) => m.i === j && m.kind === 'out')));
    const amt = rng.step(60000, Math.max(60000, Math.min(180000, Math.floor(Math.max(...caps) / 120000) * 60000)), 60000);
    moves.push({ i, kind: 'in', k, amt, asset: rng.pick(ASSETS) });
    moves.sort((x, y) => x.k - y.k);
  }
  const { ioc, working } = interestOnCapitals(names, caps, r, moves, yr);
  const si = rng.int(0, n - 1);
  const s = rng.step(2000, 8000, 500);
  const withSalary = rng.int(0, 2) > 0;
  const salary = names.map((_, j) => (withSalary && j === si ? 12 * s : 0));
  const q = rng.pick([6, 9, 10, 12]);
  const charged = rng.int(0, 3) > 0;
  const ci = (si + rng.int(1, n - 1)) % n;
  const paid = rng.step(12000, 48000, 6000);
  // A rich year allows the commission whenever the salary or the interest on drawings is missing, and has one of those two at least.
  const withCommission = opts.rich === true && (rng.int(0, 1) === 0 || !withSalary || !charged);
  if (opts.rich && !withSalary && !charged) return null;
  const commission = names.map((_, j) => (withCommission && j === ci ? paid : 0));
  const step = total * 1000;
  const divisible = step * rng.int(Math.ceil(90000 / step), Math.floor(360000 / step));
  const shares = psr.map((t) => (divisible * t) / total);
  const debit = fixed && rng.int(0, 2) === 0 ? rng.int(0, n - 1) : -1;
  const currents = names.map((_, j) => (fixed ? (j === debit ? -1 : 1) * rng.step(4000, 30000, 2000) : 0));
  // Drawings in whole ten thousands: six months' interest on them is then in whole fifties of rupees at every rate.
  const drawings = names.map(() => rng.step(20000, 100000, 10000));
  if (opts.overdraw) {
    const o = shares.lastIndexOf(Math.min(...shares));
    drawings[o] = Math.ceil((Math.max(currents[o], 0) + ioc[o] + salary[o] + commission[o] + shares[o] + 5000) / 10000) * 10000 + 10000 * rng.int(0, 1);
  }
  const iod = drawings.map((d) => (charged ? (d * q * 6) / 1200 : 0));
  const profit = divisible + sum(ioc) + sum(salary) + sum(commission) - sum(iod);
  return { names, yr, firm, fixed, psr, caps, currents, moves, r, ioc, iocWorking: working, drawings, q, iod, si, s, salary, ci, commission, divisible, shares, profit };
}
/** The entries of the year that touch the partners' own accounts, each appropriation through an account of its own. */
function yearEntries(y: PartnersYear): DatedEntry[] {
  const own = (j: number): string => ownId(y.fixed, y.names[j]);
  const on = y.yr.on;
  return [
    ...y.moves.map((m) => {
      const capital = partnerCapital(y.names[m.i]);
      return { date: firstOf(y.yr, m.k), lines: m.kind === 'in' ? [dr(m.asset?.id ?? 'bank', m.amt), cr(capital, m.amt)] : [dr(capital, m.amt), cr('bank', m.amt)] };
    }),
    ...y.names.map((nm, j) => ({ date: on, lines: [dr(own(j), y.drawings[j]), cr(partnerDrawings(nm), y.drawings[j])] })),
    ...(sum(y.iod) > 0 ? [{ date: on, lines: [...y.names.map((_, j) => dr(own(j), y.iod[j])), cr('interestOnDrawings', sum(y.iod))] }] : []),
    { date: on, lines: [dr('interestOnCapital', sum(y.ioc)), ...y.names.map((_, j) => cr(own(j), y.ioc[j]))] },
    ...(sum(y.salary) > 0 ? [{ date: on, lines: [dr('partnersSalary', sum(y.salary)), cr(own(y.si), sum(y.salary))] }] : []),
    ...(sum(y.commission) > 0 ? [{ date: on, lines: [dr('partnersCommission', sum(y.commission)), cr(own(y.ci), sum(y.commission))] }] : []),
    { date: on, lines: [dr(APP, y.divisible), ...y.names.map((_, j) => cr(own(j), y.shares[j]))] },
  ];
}
/**
 * The partners' accounts name each item of the year by an account of its own, as the board's layout does. The data
 * says that the firm keeps those accounts, so that a student who has passed the entries of a set straight through
 * Profit and Loss Appropriation A/c does not write that account against interest on capital or a salary.
 */
const ITEMS_OWN = "The firm records each appropriation, and interest on drawings, in an account of its own (Interest on Capital A/c, Partner's Salary A/c and so on).";
/** The data of the year, one line to an item. `given` says whether the divisible profit is stated or has to be worked out from the net profit. */
function yearData(y: PartnersYear, given: 'divisible' | 'net'): string {
  const allowed = ['interest on capital', ...(sum(y.salary) > 0 ? ['salary'] : []), ...(sum(y.commission) > 0 ? ['commission'] : []), ...(sum(y.iod) > 0 ? ['interest on drawings'] : [])];
  return [
    `${list(y.names)} are partners in ${y.firm} sharing profits and losses in the ratio ${ratioText(y.psr)}. ${capitalsAre(y.fixed)} ${ITEMS_OWN}`,
    `${y.fixed ? 'Fixed capitals' : 'Capitals'} on ${y.yr.from}: ${each(y.names, y.caps)}`,
    ...(y.fixed ? [`Current accounts on ${y.yr.from}: ${y.names.map((nm, j) => `${nm} ${inr(Math.abs(y.currents[j]))} (${y.currents[j] < 0 ? 'Dr' : 'Cr'})`).join(', ')}`] : []),
    ...y.moves.map((m) => `${firstOf(y.yr, m.k)}: ${moveSays(y.names, m)}`),
    `Drawings during the year: ${each(y.names, y.drawings)}`,
    `Interest on capital: ${y.r}% p.a.`,
    sum(y.iod) > 0 ? `Interest on drawings: ${y.q}% p.a.; the dates of the drawings are not known` : 'No interest is charged on drawings',
    ...(sum(y.salary) > 0 ? [`Salary: ${inr(y.s)} per month to ${y.names[y.si]}`] : []),
    ...(sum(y.commission) > 0 ? [`Commission: ${inr(sum(y.commission))} for the year to ${y.names[y.ci]}`] : []),
    given === 'divisible'
      ? `Divisible profit of the ${y.yr.ended}, after ${allowed.length === 1 ? allowed[0] : list(allowed)}: ${inr(y.divisible)}`
      : `Net profit for the ${y.yr.ended} as per Profit and Loss A/c: ${inr(y.profit)}`,
  ].join('\n');
}
/**
 * The year read back from its data and worked the long way (interest on capital by the product method): what the
 * capital of each partner moved by, and what the year adds to the partner's own account, in rupees.
 */
function readYear(data: string) {
  const [head, ...rows] = data.split('\n');
  const names = namesIn(head);
  const psr = psrIn(head);
  const caps = amountsIn(rows.find((l) => /^(Fixed capitals|Capitals) on/.test(l)) ?? '');
  const currents = [...rowOf(rows, 'Current accounts on').matchAll(/(₹[\d,]+) \((Dr|Cr)\)/g)].map((m) => (m[2] === 'Cr' ? 1 : -1) * toNumber(m[1]));
  const changes = changesIn(rows, names);
  const r = rateIn(rowOf(rows, 'Interest on capital'));
  const ioc = caps.map((cap, j) => productInterest(cap, r, changes[j]));
  const drawings = amountsIn(rowOf(rows, 'Drawings during the year'));
  const charged = rowOf(rows, 'Interest on drawings');
  const iod = drawings.map((d) => (charged ? (d * rateIn(charged)) / 200 : 0));
  const salaryRow = rowOf(rows, 'Salary');
  const salary = names.map((nm) => (salaryRow.endsWith(` to ${nm}`) ? 12 * amountsIn(salaryRow)[0] : 0));
  const commissionRow = rowOf(rows, 'Commission');
  const commission = names.map((nm) => (commissionRow.endsWith(` to ${nm}`) ? amountsIn(commissionRow)[0] : 0));
  const given = rows.find((l) => /^(Divisible profit|Net profit)/.test(l)) ?? '';
  const stated = toNumber(/: (₹[\d,]+)$/.exec(given)?.[1] ?? 'x');
  const divisible = given.startsWith('Divisible') ? stated : stated + sum(iod) - sum(ioc) - sum(salary) - sum(commission);
  return {
    names,
    caps,
    currents,
    moved: changes.map((own) => sum(own.map(([, delta]) => delta))),
    yearly: names.map((_, j) => ioc[j] + salary[j] + commission[j] + (divisible * psr[j]) / sum(psr) - drawings[j] - iod[j]),
  };
}
/** True when accounts in columns close on `expected` (rupees, a credit balance positive): in the rows, below the totals, and in the ledger the kept entries give. */
function balancesHold(q: AccountQuestion, accountIds: string[], expected: number[]): boolean {
  const kept = keptEntries.of(q.data);
  if (!kept || expected.length !== q.columns.length) return false;
  const ledger = post(kept.entries.map((e) => e.lines), kept.opening);
  const [debit, creditSide] = q.sides;
  const carried = (side: typeof debit): number[] => side.rows.find((row) => row.closing)?.amounts ?? [];
  const brought = (side: typeof debit): number[] => side.below[0]?.amounts ?? [];
  return expected.every(
    (x, c) =>
      near(credit(ledger, accountIds[c]), x) &&
      near(((carried(debit)[c] ?? 0) - (carried(creditSide)[c] ?? 0)) / 100, x) &&
      near(((brought(creditSide)[c] ?? 0) - (brought(debit)[c] ?? 0)) / 100, x),
  );
}
/** The balances accounts open with, as a ledger (debits positive, in paise), from rupees with a credit balance positive. */
const openingLedger = (accountIds: string[], balances: number[]): Ledger => new Map(accountIds.map((id, c) => [id, -rupees(balances[c])]));
const openingBalances = (balances: number[]) => balances.map((x) => (x === 0 ? null : { side: x > 0 ? ('Cr' as const) : ('Dr' as const), amount: rupees(Math.abs(x)) }));
const reopens = (yr: Year): string => `1 April ${yr.y}`;
const balancesText = (names: string[], xs: number[]): string => names.map((nm, j) => `${nm} ${inr(Math.abs(xs[j]))}${xs[j] < 0 ? ' (Dr)' : ''}`).join(', ');
const movesWhy = (y: PartnersYear): string =>
  y.moves
    .map((m) =>
      m.asset
        ? `${y.names[m.i]} brought in ${m.asset.text} valued at ${inr(m.amt)} on ${firstOf(y.yr, m.k)}: that is capital too, and the asset is what the firm received, so By ${m.asset.label}.`
        : m.kind === 'in'
          ? `The ${inr(m.amt)} ${y.names[m.i]} brought in on ${firstOf(y.yr, m.k)} is capital: By Bank A/c.`
          : `The ${inr(m.amt)} ${y.names[m.i]} withdrew for good on ${firstOf(y.yr, m.k)} reduces the capital: To Bank A/c.`,
    )
    .join(' ');
/** Why a salary and a commission stand where they do, where the year has them. */
const allowedWhy = (y: PartnersYear): string[] => [
  ...(sum(y.salary) > 0 ? [`Salary to ${y.names[y.si]} = ${inr(y.s)} x 12 = ${inr(12 * y.s)}, credited: By Partner's Salary A/c.`] : []),
  ...(sum(y.commission) > 0 ? [`The commission of ${inr(sum(y.commission))} to ${y.names[y.ci]} is credited: By Partner's Commission A/c.`] : []),
];
const drawingsWhy = (y: PartnersYear): string =>
  `Drawings are debited: To Drawings A/c.${sum(y.iod) > 0 ? ` With no dates, interest on drawings runs for six months at ${y.q}% p.a.: ${y.names.map((nm, j) => `${nm} ${inr(y.drawings[j])} x ${y.q}/100 x 6/12 = ${inr(y.iod[j])}`).join('; ')}. It is debited too: To Interest on Drawings A/c.` : ''}`;

// 3. pf-fmt-capital-accounts: fluctuating capitals: the partners' capital accounts in columns for a year, with
//    capital brought in or withdrawn, drawings, interest on capital and on drawings, a salary and the share of the
//    divisible profit, which is given (medium)
const fmtCapitalAccounts = accountTemplate({
  id: 'pf-fmt-capital-accounts', topicId: T, conceptId: 'pf-formats', difficulty: 'medium',
  generate: (rng) => {
    const y = partnersYear(rng, false);
    if (y === null) return null;
    const { names, yr } = y;
    const capitals = names.map(partnerCapital);
    const entries = yearEntries(y);
    const data = yearData(y, 'divisible');
    keptEntries.keep(data, { entries, opening: openingLedger(capitals, y.caps) });
    const closing = names.map((_, j) => y.caps[j] + sum(y.moves.filter((m) => m.i === j).map((m) => (m.kind === 'in' ? m.amt : -m.amt))) + y.ioc[j] + y.salary[j] + y.shares[j] - y.drawings[j] - y.iod[j]);
    if (closing.some((x) => x <= 0)) return null;
    return {
      task: `Prepare the partners' capital accounts in columns for the ${yr.ended} and bring the balances down on ${reopens(yr)}.`,
      data,
      title: "Partners' Capital Accounts",
      columns: partnerColumns(names),
      ...columnarSides(columnarAccount(entries, capitals, { date: yr.from, balances: openingBalances(y.caps) }), { closeOn: yr.on, reopenOn: reopens(yr) }),
      // "Profit and Loss A/c" is not offered: an examiner would not refuse it against a share of profit.
      distractors: ['Current A/c', 'Capital A/c', 'Cash A/c', "Interest on Partner's Loan A/c", "Partner's Commission A/c", "Partner's Salary A/c", 'Interest on Drawings A/c', 'Bank A/c'],
      explanation: [
        'Capitals are fluctuating, so every item of the year goes through the capital accounts. Each partner has a column, and a capital is a credit balance: By Balance b/d.',
        movesWhy(y),
        `Interest on capital at ${y.r}% p.a. is credited: By Interest on Capital A/c. ${y.iocWorking.join(' ')}`,
        ...allowedWhy(y),
        drawingsWhy(y),
        `${sharesText(names, y.divisible, y.psr)} Each share is credited: By Profit and Loss Appropriation A/c.`,
        `The credit side of every column is the larger. Balances: ${balancesText(names, closing)}, carried down on the debit side and brought down on the credit side on ${reopens(yr)}.`,
      ],
      hints: ["Which items add to a partner's capital and which take away from it?", H.ioc[0]],
    };
  },
  verify: (q: AccountQuestion) => {
    const y = readYear(q.data);
    return balancesHold(q, y.names.map(partnerCapital), y.names.map((_, j) => y.caps[j] + y.moved[j] + y.yearly[j]));
  },
});

// 4. Fixed capitals. Two generators, because an account in columns is one account: the current accounts, which take
//    the whole year and are the 6-mark task, and the capital accounts, which take only the capital brought in or
//    withdrawn. Both are made from the same kind of year, so the data reads the same and each says which account it wants.
// 4a. pf-fmt-current-accounts: the partners' current accounts in columns for a year that has at least two of a
//     salary, a commission and interest on drawings; the divisible profit is worked out from the net profit, an
//     opening balance may be a debit one, and in about four seeds of ten a partner ends overdrawn: two of ten are
//     made to, and in the others a partner whose drawings exceed the year's credits does (complex)
const fmtCurrentAccounts = accountTemplate({
  id: 'pf-fmt-current-accounts', topicId: T, conceptId: 'pf-formats', difficulty: 'complex',
  generate: (rng) => {
    const y = partnersYear(rng, true, { overdraw: rng.int(0, 9) < 2, rich: true });
    if (y === null) return null;
    const { names, yr } = y;
    const currents = names.map(partnerCurrent);
    const entries = yearEntries(y);
    const data = yearData(y, 'net');
    keptEntries.keep(data, { entries, opening: openingLedger(currents, y.currents) });
    const closing = names.map((_, j) => y.currents[j] + y.ioc[j] + y.salary[j] + y.commission[j] + y.shares[j] - y.drawings[j] - y.iod[j]);
    if (closing.some((x) => x === 0)) return null;
    const over = names.filter((_, j) => closing[j] < 0);
    return {
      task: `Prepare the partners' current accounts in columns for the ${yr.ended} and bring the balances down on ${reopens(yr)}.`,
      data,
      title: "Partners' Current Accounts",
      columns: partnerColumns(names),
      ...columnarSides(columnarAccount(entries, currents, { date: yr.from, balances: openingBalances(y.currents) }), { closeOn: yr.on, reopenOn: reopens(yr) }),
      // "Profit and Loss A/c" is not offered: an examiner would not refuse it against a share of profit.
      distractors: ['Bank A/c', 'Capital A/c', 'Cash A/c', "Interest on Partner's Loan A/c", "Partner's Salary A/c", "Partner's Commission A/c", 'Interest on Drawings A/c'],
      explanation: [
        `Capitals are fixed, so every yearly item goes through the current accounts. An opening credit balance is on the credit side${y.currents.some((x) => x < 0) ? ' and an opening debit balance on the debit side' : ''}: Balance b/d.`,
        `Capital brought in or withdrawn belongs to the capital accounts and is not entered here, but it changes the interest on capital, which at ${y.r}% p.a. is credited: By Interest on Capital A/c. ${y.iocWorking.join(' ')}`,
        ...allowedWhy(y),
        drawingsWhy(y),
        `Divisible profit = ${inr(y.profit)}${sum(y.iod) > 0 ? ` + interest on drawings ${inr(sum(y.iod))}` : ''} - interest on capital ${inr(sum(y.ioc))}${sum(y.salary) > 0 ? ` - salary ${inr(sum(y.salary))}` : ''}${sum(y.commission) > 0 ? ` - commission ${inr(sum(y.commission))}` : ''} = ${inr(y.divisible)}.`,
        `${sharesText(names, y.divisible, y.psr)} Each share is credited: By Profit and Loss Appropriation A/c.`,
        over.length > 0
          ? `Balances: ${balancesText(names, closing)}. ${over.length === 1 ? `${over[0]} has` : `${list(over)} have`} drawn more than the year gave, so ${over.length === 1 ? 'that account is' : 'those accounts are'} overdrawn: a debit balance is carried down on the credit side and brought down on the debit side. A credit balance is carried down on the debit side.`
          : `The credit side of every column is the larger. Balances: ${balancesText(names, closing)}, carried down on the debit side and brought down on the credit side on ${reopens(yr)}.`,
      ],
      hints: [H.capitals[1], 'Work out the divisible profit first: net profit, plus interest on drawings, less interest on capital, salary and commission.'],
    };
  },
  verify: (q: AccountQuestion) => {
    const y = readYear(q.data);
    return y.currents.length === y.names.length && balancesHold(q, y.names.map(partnerCurrent), y.names.map((_, j) => y.currents[j] + y.yearly[j]));
  },
});

// 4b. pf-fmt-fixed-capital-accounts: the other half of the same answer: the capital accounts of a firm with fixed
//     capitals, which take nothing of the year but the capital brought in or withdrawn: by cheque, and as an asset
//     that a partner brings in. The task says that it is the capital accounts that are wanted, so that it is a
//     question about what they hold and not a trap (easy). It is the lightest 4-mark format of the topic: a format
//     is dealt to mock papers by its difficulty alone, and nothing keeps one on its level only.
const fmtFixedCapitalAccounts = accountTemplate({
  id: 'pf-fmt-fixed-capital-accounts', topicId: T, conceptId: 'pf-formats', difficulty: 'easy',
  generate: (rng) => {
    const y = partnersYear(rng, true, { changes: [2, 2, 1], inKind: true });
    if (y === null) return null;
    const { names, yr } = y;
    const capitals = names.map(partnerCapital);
    const entries = yearEntries(y);
    const data = yearData(y, 'net');
    keptEntries.keep(data, { entries, opening: openingLedger(capitals, y.caps) });
    const closing = names.map((_, j) => y.caps[j] + sum(y.moves.filter((m) => m.i === j).map((m) => (m.kind === 'in' ? m.amt : -m.amt))));
    return {
      task: `Capitals are fixed: prepare the partners' capital accounts (not their current accounts) in columns for the ${yr.ended} and bring the balances down on ${reopens(yr)}.`,
      data,
      title: "Partners' Capital Accounts",
      columns: partnerColumns(names),
      ...columnarSides(columnarAccount(entries, capitals, { date: yr.from, balances: openingBalances(y.caps) }), { closeOn: yr.on, reopenOn: reopens(yr) }),
      distractors: ['Interest on Capital A/c', 'Drawings A/c', 'Profit and Loss Appropriation A/c', "Partner's Salary A/c", 'Interest on Drawings A/c', 'Current A/c', 'Cash A/c'],
      explanation: [
        'Each partner has a column. The fixed capitals on the first day of the year are credit balances: By Balance b/d.',
        movesWhy(y),
        'Nothing else is entered. Interest on capital, salary, drawings, interest on drawings and the share of profit all go through the current accounts when capitals are fixed.',
        `Balances: ${balancesText(names, closing)}, carried down on the debit side and brought down on the credit side on ${reopens(yr)}. A partner whose capital did not change carries down the opening figure.`,
      ],
      hints: H.capitals,
    };
  },
  verify: (q: AccountQuestion) => {
    const y = readYear(q.data);
    // A fixed capital account shows capital, the bank and an asset brought in as capital, and nothing of the year's dealings.
    const labels = q.sides.flatMap((s) => [...s.rows, ...s.below]).map((row) => row.label);
    return labels.every((l) => ['Balance b/d', 'Balance c/d', 'Bank A/c', ...ASSETS.map((a) => a.label)].includes(l)) && balancesHold(q, y.names.map(partnerCapital), y.names.map((_, j) => y.caps[j] + y.moved[j]));
  },
});

// 5. pf-fmt-past-adjustments: the statement behind the single adjusting entry for a mistake of a year that is closed:
//    appropriations left out, interest on capital allowed at a wrong rate, or the profit shared in a wrong ratio
//    with an appropriation left out. A column for each partner. The profit of the year is given, so the whole of it
//    is shared out both ways: under A what each partner should have been credited with, under B what each was
//    credited with, and the net effect, A less B, as a plus (credit) or a minus (debit). The data states that layout
//    and nothing more: which appropriation goes where, what is left to be shared either way and who was credited with
//    too much are the student's to work out. It is the working of a 4-mark question of the board (medium)
const ADJ = { ioc: 'Interest on capital', salary: "Partner's salary", commission: "Partner's commission", share: 'Share of profit' };
const ADJ_A = 'A. Should have been credited';
const ADJ_B = 'B. Was credited';
const ADJ_TOTAL_A = 'Total of A';
const ADJ_NET = 'Net effect, A less B: credit (+) or debit (-)';
const ADJ_LAYOUT =
  'Layout of the statement: under A, everything each partner should have been credited with out of the profit of the year, as the deed provides; under B, everything each partner was credited with; then the net effect, A less B.';
const RATE_PAIRS: [number, number][] = [[10, 8], [8, 10], [6, 9], [9, 6], [12, 10], [10, 12], [5, 8], [8, 6]];
type AdjRow = { label: string; xs: number[] };
/** What a year left out, by shape: interest on capital, a salary, a commission. */
const LEFT_OUT: Record<'omitted' | 'ratio', string[][]> = {
  omitted: [['ioc', 'salary'], ['ioc', 'commission'], ['ioc', 'salary', 'commission']],
  ratio: [['ioc'], ['salary'], ['ioc', 'salary']],
};
const stepped = (from: number, to: number, step: number): number[] => Array.from({ length: Math.floor((to - from) / step) + 1 }, (_, k) => from + step * k);
const fmtPastAdjustments = statementTemplate({
  id: 'pf-fmt-past-adjustments', topicId: T, conceptId: 'pf-formats', difficulty: 'medium',
  generate: (rng) => {
    const n = rng.pick([2, 3, 3]);
    const names = partners(rng, n);
    const yr = yearOf(rng);
    const firm = firmOf(rng);
    const fixed = rng.int(0, 1) === 0;
    // The wrong rate twice: it is the shape a seed rejects most often (the ratio must leave whole shares both ways).
    const shape = rng.pick(['omitted', 'omitted', 'rate', 'rate', 'ratio'] as const);
    const base = rng.pick([50000, 100000]);
    const caps = rng.pick(n === 2 ? CAPS2 : CAPS3).map((u) => u * base);
    const capitalLine = `${fixed ? 'Fixed capitals' : `Capitals on ${yr.from} (no capital was brought in or withdrawn during the year)`}: ${each(names, caps)}`;
    const si = rng.int(0, n - 1);
    const ci = (si + rng.int(1, n - 1)) % n;
    const ratios = n === 2 ? PSR2 : PSR3;
    const closed = `After the accounts of the ${yr.ended} were closed, it was found that`;
    // A profit in keeping with the capitals, which leaves a fair sum to be shared after the appropriations.
    const [low, high] = [150000, Math.min(900000, Math.max(300000, 1.5 * sum(caps)))];
    /** One of the roundest of the profits that fit. */
    const roundest = (fits: number[]): number => rng.pick(fits.some((p) => p % 1000 === 0) ? fits.filter((p) => p % 1000 === 0) : fits);
    let psr: number[];
    let profit: number;
    let a: AdjRow[];
    let b: AdjRow[];
    let found: string[];
    let why: string[];
    if (shape === 'rate') {
      const [given, due] = rng.pick(RATE_PAIRS);
      const right = caps.map((cap) => (cap * due) / 100);
      const allowed = caps.map((cap) => (cap * given) / 100);
      const moved = Math.abs(sum(right) - sum(allowed));
      // Every share in whole five hundreds both ways, and no partner whose capital is the same part of the whole as
      // the share of profit, for whom the mistake would change nothing.
      const usable = ratios.filter((pr) => moved % (sum(pr) * 500) === 0 && caps.every((cap, j) => cap * sum(pr) !== sum(caps) * pr[j]));
      if (usable.length === 0) return null;
      psr = rng.pick(usable);
      const t = sum(psr);
      const fits = stepped(low, high, 500).filter((p) => (p - sum(right)) % (t * 500) === 0 && p - Math.max(sum(right), sum(allowed)) >= 60000);
      if (fits.length === 0) return null;
      profit = roundest(fits);
      const should = psr.map((x) => ((profit - sum(right)) * x) / t);
      const got = psr.map((x) => ((profit - sum(allowed)) * x) / t);
      a = [{ label: ADJ.ioc, xs: right }, { label: ADJ.share, xs: should }];
      b = [{ label: ADJ.ioc, xs: allowed }, { label: ADJ.share, xs: got }];
      found = [
        `${closed} interest on capital had been allowed at ${given}% p.a. instead of the ${due}% p.a. that the deed provides. The net profit of the year was ${inr(profit)}, and what was left of it after the interest was shared in the profit-sharing ratio.`,
        capitalLine,
      ];
      why = [
        `A: interest on capital at ${due}% p.a.: ${each(names, right)}; total ${inr(sum(right))}. That leaves ${inr(profit)} - ${inr(sum(right))} = ${inr(profit - sum(right))} to be shared in ${ratioText(psr)}: ${each(names, should)}.`,
        `B: interest was allowed at ${given}% p.a.: ${each(names, allowed)}; total ${inr(sum(allowed))}. That left ${inr(profit)} - ${inr(sum(allowed))} = ${inr(profit - sum(allowed))}, which was shared in ${ratioText(psr)}: ${each(names, got)}.`,
      ];
    } else {
      const left = rng.pick(LEFT_OUT[shape]);
      const r = rng.pick([5, 6, 8, 10, 12]);
      const ioc = caps.map((cap) => (left.includes('ioc') ? (cap * r) / 100 : 0));
      const salaries = left.includes('salary') ? stepped(2000, 6000, 500) : [0];
      const commissions = left.includes('commission') ? stepped(12000, 60000, 1000) : [0];
      const dueOf = (s: number, paid: number): number[] => names.map((_, j) => ioc[j] + (j === si ? 12 * s : 0) + (j === ci ? paid : 0));
      const equally = rng.int(0, 1) === 0;
      let wrong: number[];
      let s: number;
      let paid: number;
      if (shape === 'omitted') {
        // The right ratio was used, so the net effect is what was left out less its share of the total left out:
        // the salary and the commission are drawn so that the total divides into whole five hundreds, and nobody's net effect is nil.
        const fits: { pr: number[]; s: number; paid: number }[] = [];
        for (const pr of ratios) {
          for (const sm of salaries) {
            for (const c of commissions) {
              const due = dueOf(sm, c);
              if (sum(due) % (sum(pr) * 500) === 0 && due.every((x, j) => x * sum(pr) !== sum(due) * pr[j])) fits.push({ pr, s: sm, paid: c });
            }
          }
        }
        if (fits.length === 0) return null;
        ({ pr: psr, s, paid } = rng.pick(fits));
        wrong = psr;
        const t = sum(psr);
        const profits = stepped(Math.ceil(low / (t * 1000)) * t * 1000, high, t * 1000).filter((p) => p - sum(dueOf(s, paid)) >= 60000);
        if (profits.length === 0) return null;
        profit = rng.pick(profits);
      } else {
        psr = psrOf(rng, n);
        const right = psr;
        wrong = equally ? names.map(() => 1) : psrOf(rng, n, (pr) => !sameRatio(pr, right));
        const [t, w] = [sum(psr), sum(wrong)];
        const fits: { s: number; p: number }[] = [];
        for (const sm of salaries) {
          const o = sum(dueOf(sm, 0));
          for (const p of stepped(low, high, 500)) if (p % (w * 500) === 0 && (p - o) % (t * 500) === 0 && p - o >= 60000) fits.push({ s: sm, p });
        }
        if (fits.length === 0) return null;
        profit = roundest(fits.map((f) => f.p));
        s = rng.pick(fits.filter((f) => f.p === profit)).s;
        paid = 0;
      }
      const due = dueOf(s, paid);
      const should = psr.map((x) => ((profit - sum(due)) * x) / sum(psr));
      const got = wrong.map((x) => (profit * x) / sum(wrong));
      const how = shape === 'omitted' ? 'in the profit-sharing ratio' : `${equally ? 'equally' : `in the ratio ${ratioText(wrong)}`}, by mistake`;
      a = [
        ...(left.includes('ioc') ? [{ label: ADJ.ioc, xs: ioc }] : []),
        ...(s > 0 ? [{ label: ADJ.salary, xs: names.map((_, j) => (j === si ? 12 * s : 0)) }] : []),
        ...(paid > 0 ? [{ label: ADJ.commission, xs: names.map((_, j) => (j === ci ? paid : 0)) }] : []),
        { label: ADJ.share, xs: should },
      ];
      b = [{ label: ADJ.share, xs: got }];
      found = [
        `${closed} the whole profit of ${inr(profit)} had been shared ${how}, and that the following, which the deed provides, had been left out.`,
        ...(left.includes('ioc') ? [capitalLine, `Left out: interest on capital at ${r}% p.a.`] : []),
        ...(s > 0 ? [`Left out: salary of ${inr(s)} per month to ${names[si]}`] : []),
        ...(paid > 0 ? [`Left out: commission of ${inr(paid)} for the year to ${names[ci]}`] : []),
      ];
      const parts = [
        ...(left.includes('ioc') ? [`interest on capital at ${r}% p.a. (${each(names, ioc)})`] : []),
        ...(s > 0 ? [`the salary of ${inr(s)} x 12 = ${inr(12 * s)} to ${names[si]}`] : []),
        ...(paid > 0 ? [`the commission of ${inr(paid)} to ${names[ci]}`] : []),
      ];
      why = [
        `A: ${parts.join(', ')}; total ${inr(sum(due))}. That leaves ${inr(profit)} - ${inr(sum(due))} = ${inr(profit - sum(due))} to be shared in ${ratioText(psr)}: ${each(names, should)}.`,
        `B: the whole ${inr(profit)} was shared ${how}: ${each(names, got)}.`,
      ];
    }
    const totalOf = (rows: AdjRow[]): number[] => names.map((_, j) => sum(rows.map((row) => row.xs[j])));
    const net = totalOf(a).map((x, j) => x - totalOf(b)[j]);
    if (net.some((x) => x === 0)) return null;
    const part = (heading: string, rows: AdjRow[], total: string): (FormatRowParts | StatementLineParts)[] => [
      { heading },
      ...rows.map((row) => ({ label: row.label, amounts: row.xs.map(rupees) })),
      ...(rows.length > 1 ? [{ subtotal: total, amounts: totalOf(rows).map(rupees), sum: 'section' as const }] : []),
    ];
    const account = fixed ? 'Current A/c' : 'Capital A/c';
    const entry = `${names.flatMap((nm, j) => (net[j] < 0 ? [`${nm}'s ${account} Dr ${inr(-net[j])}`] : [])).join(', ')}; To ${names.flatMap((nm, j) => (net[j] > 0 ? [`${nm}'s ${account} ${inr(net[j])}`] : [])).join(', To ')}`;
    return {
      task: `Prepare a statement showing the adjustment that each partner's ${account} needs, with the net effect shown as a plus figure for a credit and with a minus sign for a debit.`,
      data: [
        `${list(names)} are partners in ${firm}${shape === 'ratio' ? '. Under their deed they share' : ' sharing'} profits and losses in the ratio ${ratioText(psr)}. ${capitalsAre(fixed)}`,
        ...found,
        ADJ_LAYOUT,
      ].join('\n'),
      title: `Statement of adjustments for the ${yr.ended}`,
      columns: names.map((nm) => ({ name: `${nm} (₹)`, signed: true })),
      rows: [...part(ADJ_A, a, ADJ_TOTAL_A), ...part(ADJ_B, b, 'Total of B'), { subtotal: ADJ_NET, amounts: net.map(rupees) }],
      distractors: ['Interest on drawings', "Interest on partner's loan", 'Drawings', 'General Reserve', ...Object.values(ADJ)],
      explanation: [
        'The accounts are not reopened. The statement shares the profit of the year out twice, as the deed provides and as it was done, and the difference is put right by one entry.',
        ...why,
        `Net effect, A less B: ${netText(names, net)}.`,
        `A partner credited with too little is credited now, and a partner credited with too much is debited. The adjusting entry is: ${entry}. ${whyOwn(fixed)}`,
      ],
      hints: H.past,
    };
  },
  verify: (q: StatementQuestion) => {
    // The year shared out in full both ways, as it was and as the deed requires, from the figures the student reads.
    const [head, ...rows] = q.data.split('\n');
    const names = namesIn(head);
    const psr = psrIn(head);
    const caps = amountsIn(rows.find((l) => /^(Fixed capitals|Capitals on)/.test(l)) ?? '');
    const found = rows[0];
    const profit = read(found, /profit of (?:the year was )?(₹[\d,]+)/);
    const share = (ratio: number[], first: number[]): number[] => names.map((_, j) => first[j] + ((profit - sum(first)) * ratio[j]) / sum(ratio));
    const none = names.map(() => 0);
    let was: number[];
    let should: number[];
    const rates = /allowed at (\d+)% p\.a\. instead of the (\d+)% p\.a\./.exec(found);
    if (rates) {
      [was, should] = [Number(rates[1]), Number(rates[2])].map((rate) => share(psr, caps.map((cap) => (cap * rate) / 100)));
    } else {
      const mistaken = /shared (equally|in the ratio ([\d:]+)), by mistake/.exec(found);
      const wrong = !mistaken ? psr : mistaken[1] === 'equally' ? none.map(() => 1) : mistaken[2].split(':').map(Number);
      const iocRow = rowOf(rows, 'Left out: interest on capital');
      const salaryRow = rowOf(rows, 'Left out: salary');
      const commissionRow = rowOf(rows, 'Left out: commission');
      const due = names.map((nm, j) => (iocRow ? (caps[j] * rateIn(iocRow)) / 100 : 0) + (salaryRow.endsWith(` to ${nm}`) ? 12 * amountsIn(salaryRow)[0] : 0) + (commissionRow.endsWith(` to ${nm}`) ? amountsIn(commissionRow)[0] : 0));
      if (sum(due) <= 0 || sum(due) >= profit) return false;
      [was, should] = [share(wrong, none), share(psr, due)];
    }
    const subtotal = (name: string): number[] | undefined => (q.lines ?? []).flatMap((line) => ('subtotal' in line && line.subtotal === name ? [line.amounts] : []))[0];
    const net = subtotal(ADJ_NET);
    const credited = subtotal(ADJ_TOTAL_A);
    return (
      net !== undefined &&
      credited !== undefined &&
      net.length === names.length &&
      near(sum(net), 0) &&
      near(sum(should), profit) &&
      near(sum(was), profit) &&
      names.every((_, j) => near(credited[j] / 100, should[j]) && near(net[j] / 100, should[j] - was[j]) && net[j] !== 0)
    );
  },
});

// One-mark Assertion-Reason questions of the board. They stand on their own level and go into no mock paper and no
// Look back (`isAssertionReason`), so nothing that was served before moves.
const pfAssertionReason = factsTemplate({
  id: 'pf-assertion-reason', topicId: 'partnership-fundamentals', conceptId: 'pf-appropriation', difficulty: 'medium',
  facts: assertionReasonFacts([
    {
      answer: 'both',
      assertion: "Interest on a partner's loan is debited to Profit and Loss A/c, not to Profit and Loss Appropriation A/c.",
      reason: "Interest on a partner's loan is a charge against profit, to be met whether or not the firm earns a profit.",
      a: 'The loan is a debt of the firm, and its interest is an expense of the firm.',
      r: 'A charge has to be met whatever the result of the year.',
      link: 'R explains A: a charge comes out before the profit is arrived at, which is why it goes to Profit and Loss A/c.',
    },
    {
      answer: 'both',
      assertion: 'Under a deed that treats interest on capital as an appropriation, no interest on capital is allowed in a year of loss.',
      reason: 'An appropriation can be made only out of profit.',
      a: 'In a year of loss there is nothing to appropriate, so no interest on capital is allowed.',
      r: 'An appropriation is a way of sharing out profit that is there.',
      link: 'R explains A: with no profit to share out, there is nothing from which the interest could come.',
    },
    {
      answer: 'both',
      assertion: 'Anu and Bela have no partnership deed. Anu put in twice the capital of Bela, yet they share the profit of ₹90,000 equally.',
      reason: 'With no deed, the Indian Partnership Act, 1932 has profits shared equally, whatever the capitals.',
      a: 'Each gets ₹45,000, as the capitals do not decide the shares.',
      r: 'Equal sharing is the first of the rules of the Act where there is no deed.',
      link: 'R explains A: the equal shares come straight from that rule of the Act.',
    },
    {
      answer: 'both',
      assertion: "Under the fixed capital method, the balance of a partner's Capital A/c normally stays the same from year to year.",
      reason: "Under the fixed capital method, drawings, interest, salary and the share of profit all go through the partner's Current A/c.",
      a: 'The Capital A/c changes only when capital is brought in or permanently withdrawn.',
      r: 'Each partner has a second account, the Current A/c, for all these items.',
      link: 'R explains A: the items that change a capital from year to year are kept out of the Capital A/c.',
    },
    {
      answer: 'both',
      assertion: 'Equal drawings made at the end of every month of a full year carry interest for an average period of 5.5 months.',
      reason: 'The first of those withdrawals is out for 11 months and the last for none, and the average of the two is 5.5 months.',
      a: 'The average period for drawings at the end of each month is 5.5 months.',
      r: 'A withdrawal on 30 April is out for 11 months of a year ending 31 March, and one on 31 March for none: (11 + 0) ÷ 2 = 5.5.',
      link: 'R explains A: it is the working that gives the 5.5 months.',
    },
    {
      answer: 'bothNot',
      assertion: 'Interest on capital is debited to Profit and Loss Appropriation A/c.',
      reason: 'Interest on drawings is credited to Profit and Loss Appropriation A/c.',
      a: 'Interest on capital is a sharing out of profit among the partners.',
      r: 'Interest on drawings is paid by the partners, so it adds to the profit available.',
      link: 'R does not explain A: where interest on drawings goes has no bearing on why interest on capital is debited.',
    },
    {
      answer: 'bothNot',
      assertion: "A partner's salary is debited to Profit and Loss Appropriation A/c.",
      reason: "Under the fixed capital method, a partner's salary is credited to the partner's Current A/c.",
      a: "A partner's salary is an appropriation of profit, not a charge against it.",
      r: 'Under fixed capitals every such item goes through the Current A/c.',
      link: 'R does not explain A: R says where the credit goes under one method; the debit comes from the salary being an appropriation.',
    },
    {
      answer: 'bothNot',
      assertion: 'Kabir drew ₹48,000 during a year, on dates not given, and the deed charges interest on drawings at 10% p.a. The interest is ₹2,400.',
      reason: "Interest on drawings reduces the balance of the partner's Capital or Current A/c.",
      a: 'With no dates, interest runs for six months: ₹48,000 × 10% × 6/12 = ₹2,400.',
      r: "Interest on drawings is debited to the partner's Capital or Current A/c.",
      link: 'R does not explain A: R says where the interest is debited; the figure comes from taking six months on the total drawings.',
    },
    {
      answer: 'aOnly',
      assertion: "A partner's loan to the firm carries interest at 6% p.a. when nothing has been agreed.",
      reason: "A partner's capital also carries interest at 6% p.a. when nothing has been agreed.",
      a: 'The Indian Partnership Act, 1932 allows 6% p.a. on a loan by a partner to the firm.',
      r: 'With no agreement, no interest on capital is allowed at all.',
    },
    {
      answer: 'aOnly',
      assertion: 'Isha, Jay and Kavya share profits 2:2:1 and the firm guarantees Kavya ₹30,000. On a profit of ₹1,20,000, Isha and Jay bear a deficiency of ₹6,000 equally.',
      reason: 'A deficiency on a guarantee given by the firm is shared by all the partners, the guaranteed partner included.',
      a: "Kavya's share is ₹24,000, so the deficiency is ₹6,000, and it falls on Isha and Jay in their own ratio, 2:2.",
      r: 'The deficiency falls on the other partners only; the guaranteed partner bears none of it.',
    },
    {
      answer: 'rOnly',
      assertion: 'When the deed is silent, a partner who runs the business every day is entitled to a salary.',
      reason: 'When the deed is silent on a point, the Indian Partnership Act, 1932 applies.',
      a: 'Under the Act no partner gets a salary or commission, however much work that partner does.',
      r: 'The Act fills in whatever the partners have not agreed.',
    },
    {
      answer: 'rOnly',
      assertion: 'A net profit before commission is ₹1,10,000, and a partner gets 10% of the net profit after charging that commission. The commission is ₹11,000.',
      reason: 'Commission after charging it = Net profit × Rate ÷ (100 + Rate).',
      a: 'The commission is ₹1,10,000 × 10 ÷ 110 = ₹10,000. ₹11,000 is 10% before charging it.',
      r: 'This is the formula for a commission on the profit left after charging it.',
    },
  ]),
});

// ===============================================================================================================
// ADDED AFTER THE AUDIT (outside the mock papers, the worksheets and Look back: src/generators/outsidePapers.ts)
// ===============================================================================================================

// pf-iod-flat-rate: interest on drawings at a flat rate, not per annum: the time the money was out does not count
const iodFlatRate = numericTemplate({
  id: 'pf-iod-flat-rate', topicId: T, conceptId: 'pf-iod', difficulty: 'medium', unit: 'rupees',
  generate: (rng) => {
    const [a] = partners(rng, 1);
    const yr = yearOf(rng);
    const r = rng.pick([2, 4, 5, 6, 8, 10]);
    const monthly = rng.int(0, 2) === 0;
    const each = rng.step(6000, 30000, 6000);
    const ks = monthly ? [] : rng.shuffle([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10]).slice(0, rng.int(3, 4)).sort((x, y) => x - y);
    const rows = ks.map((k) => ({ date: firstOf(yr, k), amount: rng.step(6000, 48000, 6000), m: 12 - k }));
    const total = monthly ? 12 * each : sum(rows.map((x) => x.amount));
    const answer = (total * r) / 100;
    const timed = monthly ? (total * r * 6.5) / 1200 : (sum(rows.map((x) => x.amount * x.m)) * r) / 1200;
    const n = numeric(answer, [
      [timed, monthly ? 'Treated the rate as per annum and charged it for the average period of 6.5 months; a flat rate ignores the time.' : 'Treated the rate as per annum and charged each withdrawal for its months; a flat rate ignores the time.'],
      [(total * r * 6) / 1200, 'Charged six months on the total, as for a rate per annum when the dates are not known.'],
      [monthly ? (each * r) / 100 : (rows[rows.length - 1].amount * r) / 100, monthly ? 'Charged the rate on one month\'s drawings only, not on the total drawn.' : 'Charged the rate on the last withdrawal only, not on the total drawn.'],
      [(total * r) / 1200, 'Divided by 12 as if the rate were for a month; a flat rate is charged once on the amount drawn.'],
    ]);
    return n && {
      prompt: [
        `${a}, a partner in ${firmOf(rng)}, made the drawings below during the ${yr.ended}. The deed charges interest on drawings at a flat rate of ${r}% on the amount drawn (the rate is not per annum). Find the interest on ${a}'s drawings for the year.`,
        ...(monthly ? [`${inr(each)} at the beginning of every month`] : rows.map((x) => `${x.date}: ${inr(x.amount)}`)),
      ].join('\n'),
      ...n,
      explanation: [
        'A rate that is not per annum is a flat rate: it is charged once on the amount drawn, whatever the dates.',
        monthly ? `Total drawn = ${inr(each)} x 12 = ${inr(total)}.` : `Total drawn = ${rows.map((x) => inr(x.amount)).join(' + ')} = ${inr(total)}.`,
        `Interest = ${inr(total)} x ${r}/100 = ${inr(answer)}.`,
        'Had the deed said "% p.a.", the months for which each amount was out would have counted.',
      ],
      hints: ['Look at how the rate is given: is it "% p.a."? If not, does the time for which the money was out matter?', 'A flat rate is charged once on the total drawn: Interest = Total drawings x Rate/100.'],
    };
  },
  verify: (q) => {
    // The total drawn, read line by line, at the flat rate.
    const r = read(q.prompt, /flat rate of (\d+)%/);
    const lines = dataLines(q.prompt);
    const total = lines[0].includes('every month') ? 12 * amountsIn(lines[0])[0] : sum(lines.map((l) => amountsIn(l)[0]));
    return near(q.answer / 100, (total * r) / 100);
  },
});

// pf-iod-loss-year: a year of loss: no interest on capital or salary (appropriations), but interest on drawings is
// still charged and lessens the loss the partners share
const iodLossYear = numericTemplate({
  id: 'pf-iod-loss-year', topicId: T, conceptId: 'pf-iod', difficulty: 'medium', unit: 'rupees',
  generate: (rng) => {
    const n = rng.pick([2, 3]);
    const names = partners(rng, n);
    const yr = yearOf(rng);
    const fixed = rng.int(0, 1) === 0;
    const psr = psrOf(rng, n);
    const total = sum(psr);
    const base = rng.pick([50000, 100000]);
    const caps = rng.pick(n === 2 ? CAPS2 : CAPS3).map((u) => u * base);
    const r = rng.pick([6, 8, 10]);
    const si = rng.int(0, n - 1);
    const s = rng.step(3000, 8000, 1000);
    const iod = names.map(() => rng.step(600, 4200, 300));
    const shared = total * 1000 * rng.int(Math.ceil(20000 / (total * 1000)), Math.floor(150000 / (total * 1000)));
    const loss = shared + sum(iod);
    const i = rng.int(0, n - 1);
    const share = (x: number): number => (x * psr[i]) / total;
    const ioc = sum(caps.map((c) => (c * r) / 100));
    const account = ownName(fixed, names[i]);
    const num = numeric(share(shared), [
      [share(loss), 'Left out the interest on drawings; it is charged in a year of loss too and lessens the loss to be shared.'],
      [share(loss + sum(iod)), 'Added the interest on drawings to the loss; it is a gain of the firm and is credited.'],
      [share(shared + ioc + 12 * s), 'Allowed interest on capital and the salary, which made the loss larger; they are appropriations and are not allowed in a loss.'],
      [share(shared + ioc), 'Allowed interest on capital, which made the loss larger; it is an appropriation and is not allowed in a loss.'],
      [shared / n, 'Shared the loss equally; the deed gives a ratio, and a loss is shared like a profit.'],
    ]);
    return num && {
      prompt: [
        `${list(names)} are partners in ${firmOf(rng)} sharing profits and losses in the ratio ${ratioText(psr)}. ${capitalsAre(fixed)} The deed allows interest on capital at ${r}% p.a. and a salary of ${inr(s)} a month to ${names[si]}, and charges interest on drawings. Interest on capital is not a charge against profit. For the ${yr.ended}, Profit and Loss A/c shows a net loss of ${inr(loss)}. How much of the loss is debited to ${account} through Profit and Loss Appropriation A/c?`,
        `${fixed ? 'Fixed capitals' : `Capitals on ${yr.from}`}: ${each(names, caps)}`,
        `Interest on drawings for the year: ${each(names, iod)}`,
      ].join('\n'),
      ...num,
      explanation: [
        'Interest on capital and a partner\'s salary are appropriations: they come only out of a profit, so in a year of loss neither is allowed.',
        `Interest on drawings is what the partners pay the firm, so it is still charged and credited to Profit and Loss Appropriation A/c: ${iod.map(inr).join(' + ')} = ${inr(sum(iod))}.`,
        `Loss to be shared = ${inr(loss)} - ${inr(sum(iod))} = ${inr(shared)}.`,
        `${names[i]}'s share in ${ratioText(psr)} = ${inr(shared)} x ${psr[i]}/${total} = ${inr(share(shared))}, debited to ${account}. ${whyOwn(fixed)}`,
      ],
      hints: ['Which items come only out of a profit, and which are charged whatever the result of the year?', 'In a loss: no interest on capital and no salary. Interest on drawings is still credited, so Loss to share = Net loss - Interest on drawings.'],
    };
  },
  verify: (q) => {
    const [head, , iodLine] = q.prompt.split('\n');
    const names = namesIn(head);
    const psr = psrIn(head);
    const loss = read(head, /net loss of (₹[\d,]+)/);
    const i = names.indexOf(/debited to (\w+)'s/.exec(head)?.[1] ?? '');
    return i >= 0 && near((q.answer / 100) * sum(psr), (loss - sum(amountsIn(iodLine))) * psr[i]);
  },
});

// pf-guarantee-two: one partner guarantees a minimum share to each of the other two and bears both deficiencies
const guaranteeTwo = numericTemplate({
  id: 'pf-guarantee-two', topicId: T, conceptId: 'pf-guarantee', difficulty: 'complex', unit: 'rupees',
  generate: (rng) => {
    const names = partners(rng, 3);
    const yr = yearOf(rng);
    const psr = psrOf(rng, 3, (pr) => pr[0] > pr[1] && pr[0] > pr[2]);
    const total = sum(psr);
    const step = total * 1000;
    const profit = step * rng.int(Math.ceil(180000 / step), Math.floor(900000 / step));
    const own = psr.map((t) => (profit * t) / total);
    // The senior partner, the first, guarantees the other two; one of them may already be above the minimum.
    // A deed guarantees a round sum: a multiple of ₹5,000 above the share (or, for the one already clear, below it).
    const nilOne = rng.int(0, 3) === 0 ? rng.int(1, 2) : 0;
    const round = (x: number): number => 5000 * Math.ceil(x / 5000);
    const guaranteed = [0, 1, 2].map((j) => (j === 0 ? 0 : j === nilOne ? round(own[j]) - 5000 * rng.int(1, 3) : round(own[j] + 1000) + 5000 * rng.int(0, 2)));
    const gap = [0, 1, 2].map((j) => (j === 0 || j === nilOne ? 0 : guaranteed[j] - own[j]));
    if (guaranteed.slice(1).some((g) => g <= 0) || guaranteed[nilOne] >= own[nilOne] || gap[1] + gap[2] > own[0] / 3) return null;
    const [a, b, c] = names;
    const ask = rng.int(0, 2) === 0 ? 'total' : 'a';
    const borne = gap[1] + gap[2];
    const answer = ask === 'total' ? borne : own[0] - borne;
    const num = numeric(answer, ask === 'total'
      ? [
          [gap[1] > 0 ? gap[1] : gap[2], 'Made good one deficiency only; each guaranteed partner is looked at in turn.'],
          [(borne * psr[0]) / total, `Gave only ${a}'s share of the deficiencies, as if all three partners bore them; ${a} gave the guarantees and bears them alone.`],
          [guaranteed[1] + guaranteed[2], 'Gave the guaranteed amounts themselves, not the shortfalls in them.'],
          ...(nilOne > 0 ? ([[borne + own[nilOne] - guaranteed[nilOne], `Treated ${names[nilOne]}'s surplus over the minimum as a deficiency too; a guarantee sets only a minimum.`]] as [number, string][]) : []),
        ]
      : [
          [own[0], `Gave ${a}'s share before the deficiencies were made good.`],
          [own[0] - (gap[1] > 0 ? gap[1] : gap[2]), 'Made good one deficiency only; each guaranteed partner is looked at in turn.'],
          [own[0] - (borne * psr[0]) / total, `Took only ${a}'s share of the deficiencies, as if all three partners bore them; ${a} gave the guarantees and bears them alone.`],
          [own[0] + borne, 'Added the deficiencies instead of deducting them.'],
          ...(nilOne > 0 ? ([[own[0] - borne - (own[nilOne] - guaranteed[nilOne]), `Treated ${names[nilOne]}'s surplus over the minimum as a deficiency too; a guarantee sets only a minimum.`]] as [number, string][]) : []),
        ]);
    const shortLine = (j: number): string =>
      gap[j] > 0
        ? `${names[j]}: share ${inr(own[j])}, guaranteed ${inr(guaranteed[j])}, deficiency ${inr(gap[j])}.`
        : `${names[j]}: share ${inr(own[j])} is above the guaranteed ${inr(guaranteed[j])}, so there is no deficiency.`;
    return num && {
      prompt: `${list(names)} are partners in ${firmOf(rng)} sharing profits and losses in the ratio ${ratioText(psr)}. ${a} has personally guaranteed that ${b}'s share of profit will not be less than ${inr(guaranteed[1])} and ${c}'s share will not be less than ${inr(guaranteed[2])} in any year; ${a} alone bears any deficiency. The profit of the ${yr.ended} available for distribution is ${inr(profit)}. ${ask === 'total' ? `How much does ${a} have to make good in all?` : `How much profit does ${a} finally get?`}`,
      ...num,
      explanation: [
        `Shares in ${ratioText(psr)}: ${names.map((nm, j) => `${nm} ${inr(own[j])}`).join(', ')}.`,
        shortLine(1),
        shortLine(2),
        `${a} gave both guarantees, so ${a} alone bears ${gap[1] > 0 && gap[2] > 0 ? `${inr(gap[1])} + ${inr(gap[2])} = ` : ''}${inr(borne)}.`,
        ...(ask === 'total' ? [] : [`${a} finally gets ${inr(own[0])} - ${inr(borne)} = ${inr(answer)}; ${b} and ${c} get at least their guaranteed amounts.`]),
      ],
      hints: ['Share the profit in the ratio first, then take each guaranteed partner in turn: is that share below the minimum?', 'Each deficiency = guaranteed amount - actual share (nil if the share is already enough). Whoever gave the guarantee bears all of it.'],
    };
  },
  verify: (q) => {
    const names = namesIn(q.prompt);
    const psr = psrIn(q.prompt);
    const [gb, gc, profit] = amountsIn(q.prompt);
    const share = (j: number): number => (profit * psr[j]) / sum(psr);
    // What the two guaranteed partners finally hold; the guarantor keeps the rest.
    const kept = Math.max(gb, share(1)) + Math.max(gc, share(2));
    return q.prompt.includes('make good in all') ? near(q.answer / 100, kept - share(1) - share(2)) : names.length === 3 && near(q.answer / 100, profit - kept);
  },
});

// pf-past-adj-years: interest on capital left out for two years, with a new profit-sharing ratio in the second;
// one adjusting entry for both years
const pastAdjustmentYears = journalTemplate({
  id: 'pf-past-adj-years', topicId: T, conceptId: 'pf-past-adjustments', difficulty: 'complex', computed: true,
  generate: (rng) => {
    const n = rng.pick([2, 3, 3]);
    const names = partners(rng, n);
    const yr = yearOf(rng);
    const base = rng.pick([50000, 100000]);
    const caps = rng.pick(n === 2 ? CAPS2 : CAPS3).map((u) => u * base);
    const r = rng.pick([5, 6, 8, 10, 12]);
    const ioc = caps.map((c) => (c * r) / 100);
    const omitted = sum(ioc);
    // Each year's share of the omitted total in round hundreds, as a board question gives them.
    const fits = (pr: number[]) => omitted % (sum(pr) * 100) === 0;
    const first = (n === 2 ? PSR2 : PSR3).filter(fits);
    if (first.length === 0) return null;
    const r1 = rng.pick(first);
    const second = (n === 2 ? PSR2 : PSR3).filter((pr) => fits(pr) && !sameRatio(pr, r1));
    if (second.length === 0) return null;
    const r2 = rng.pick(second);
    const back1 = r1.map((t) => (omitted * t) / sum(r1));
    const back2 = r2.map((t) => (omitted * t) / sum(r2));
    const net1 = ioc.map((x, j) => x - back1[j]);
    const net2 = ioc.map((x, j) => x - back2[j]);
    const net = net1.map((x, j) => x + net2[j]);
    if (net.every((x) => x === 0)) return null;
    const y1 = `year ended 31 March ${yr.y - 1}`;
    return {
      prompt: [
        `${list(names)} are partners in ${firmOf(rng)}. Their capitals are fixed and did not change in the two years below. The deed allows interest on capital at ${r}% p.a. In the accounts of the ${y1} and of the ${yr.ended}, the interest on capital was left out and the whole profit was shared: in the ratio ${ratioText(r1)} in the first year and ${ratioText(r2)} in the second, when the ratio was changed. Each year's profit was more than enough for the interest. Pass one adjusting entry on 1 April ${yr.y} to set both years right, without reopening the accounts.`,
        ...names.map((nm, j) => `${nm}: fixed capital ${inr(caps[j])}`),
      ].join('\n'),
      lines: adjustingLines(true, names, net),
      explanation: [
        `Interest on capital that should have been credited each year: ${names.map((nm, j) => `${nm} ${inr(ioc[j])}`).join(', ')}; total ${inr(omitted)}.`,
        `Year ended 31 March ${yr.y - 1}: the ${inr(omitted)} went out as profit in ${ratioText(r1)} (${names.map((nm, j) => `${nm} ${inr(back1[j])}`).join(', ')}). Net: ${netText(names, net1)}.`,
        `Year ended 31 March ${yr.y}: the ${inr(omitted)} went out as profit in ${ratioText(r2)} (${names.map((nm, j) => `${nm} ${inr(back2[j])}`).join(', ')}). Net: ${netText(names, net2)}.`,
        `Both years together: ${netText(names, net)}.`,
        `One entry: the partner who received too much over the two years is debited and the one who received too little is credited. ${whyOwn(true)}`,
      ],
      distractorAccounts: ['profitAndLossAppropriation', 'interestOnCapital', partnerCapital(names[0])],
      hints: ['Make the table for each year on its own: interest that should have been credited, less the same total taken back in that year\'s ratio.', 'Add the two years\' net effects for each partner, then pass one entry: debit the net excess, credit the net shortfall.'],
    };
  },
  verify: (q: JournalQuestion) => {
    // Each year shared out on a large profit both ways, as the deed requires and as it was done; the entry is the sum of the differences.
    const names = namesIn(q.prompt);
    const r = rateIn(q.prompt);
    const [r1, r2] = [...q.prompt.matchAll(/(\d+(?::\d+)+)/g)].map((m) => m[1].split(':').map(Number));
    const caps = dataLines(q.prompt).map((l) => amountsIn(l)[0]);
    const due = caps.map((c) => (c * r) / 100);
    const yearNet = (pr: number[]) => {
      const whole = sum(due) * 10;
      return names.map((_, j) => due[j] + ((whole - sum(due)) * pr[j]) / sum(pr) - (whole * pr[j]) / sum(pr));
    };
    if (!r1 || !r2) return false;
    const [a, b] = [yearNet(r1), yearNet(r2)];
    return linesMatch(q, names, a.map((x, j) => x + b[j]));
  },
});

// pf-fmt-appropriation-short: Profit and Loss Appropriation A/c in a year whose profit is too small for the interest
// on capital (shared in the ratio of the interest due), or in a year of loss (no interest on capital or salary;
// interest on drawings still credited and the rest of the loss shared in the ratio)
const fmtAppropriationShort = accountTemplate({
  id: 'pf-fmt-appropriation-short', topicId: T, conceptId: 'pf-formats', difficulty: 'medium',
  generate: (rng) => {
    const loss = rng.int(0, 1) === 0;
    const n = rng.pick([2, 3, 3]);
    const names = partners(rng, n);
    const yr = yearOf(rng);
    const firm = firmOf(rng);
    const fixed = rng.int(0, 1) === 0;
    const psr = psrOf(rng, n);
    const total = sum(psr);
    const base = rng.pick([50000, 100000]);
    const units = rng.pick(n === 2 ? CAPS2 : CAPS3);
    const caps = units.map((u) => u * base);
    const r = rng.pick([6, 8, 10, 12]);
    const due = caps.map((c) => (c * r) / 100);
    const iod = names.map(() => rng.step(600, 3600, 300));
    const si = rng.int(0, n - 1);
    const s = rng.step(3000, 8000, 1000);
    const on = yr.on;
    let entries: DatedEntry[];
    let profitOrLoss: number;
    let allowed: number[] = [];
    let shares: number[] = [];
    if (loss) {
      const left = total * 1000 * rng.int(Math.ceil(30000 / (total * 1000)), Math.floor(180000 / (total * 1000)));
      profitOrLoss = left + sum(iod);
      shares = psr.map((t) => (left * t) / total);
      entries = [
        { date: on, lines: [dr(APP, profitOrLoss), cr('profitAndLoss', profitOrLoss)] },
        { date: on, lines: [dr('interestOnDrawings', sum(iod)), cr(APP, sum(iod))] },
        { date: on, lines: [...names.map((nm, j) => dr(ownId(fixed, nm), shares[j])), cr(APP, left)] },
      ];
    } else {
      // What is there to appropriate (net profit and interest on drawings) is less than the interest due, and is
      // shared in the ratio of the interest due, which is the ratio of the capitals.
      const unit = sum(units) * 100;
      const lo = Math.ceil((sum(due) * 0.4) / unit);
      const hi = Math.floor((sum(due) * 0.9) / unit);
      if (hi < lo) return null;
      const available = unit * rng.int(lo, hi);
      profitOrLoss = available - sum(iod);
      if (profitOrLoss <= 0) return null;
      allowed = units.map((u) => (available * u) / sum(units));
      entries = [
        { date: on, lines: [dr('profitAndLoss', profitOrLoss), cr(APP, profitOrLoss)] },
        { date: on, lines: [dr('interestOnDrawings', sum(iod)), cr(APP, sum(iod))] },
        { date: on, lines: [dr(APP, available), cr('interestOnCapital', available)] },
      ];
    }
    const view = accountOf(entries, APP);
    const details: Record<string, string[]> = {
      interestOnDrawings: names.map((nm, j) => `${nm} ${inr(iod[j])}`),
      interestOnCapital: names.map((nm, j) => `${nm} ${inr(allowed[j] ?? 0)}`),
    };
    const rows = (postings: typeof view.debit): FormatRowParts[] =>
      postings.map((p) => ({
        date: p.date,
        label: p.label,
        amount: p.amount,
        ...(details[p.accountIds[0]] ? { details: details[p.accountIds[0]] } : {}),
        ...(p.accountIds[0].includes(':') ? { closing: true } : {}),
      }));
    const data = [
      `${list(names)} are partners in ${firm} sharing profits and losses in the ratio ${ratioText(psr)}. ${capitalsAre(fixed)}${noChange(fixed)}`,
      `${fixed ? 'Fixed capitals' : `Capitals on ${yr.from}`}: ${each(names, caps)}`,
      `The deed allows interest on capital at ${r}% p.a. as an appropriation, not as a charge${loss ? `, and a salary of ${inr(s)} a month to ${names[si]}` : ''}`,
      `Interest on drawings charged for the year: ${each(names, iod)}`,
      loss ? `Net loss for the ${yr.ended} as per Profit and Loss A/c: ${inr(profitOrLoss)}` : `Net profit for the ${yr.ended} as per Profit and Loss A/c: ${inr(profitOrLoss)}`,
    ].join('\n');
    const own = fixed ? 'Current' : 'Capital';
    return {
      task: `Prepare the Profit and Loss Appropriation Account of the firm for the ${yr.ended}, showing interest on capital and interest on drawings as one figure each and each partner's share of any profit or loss on its own.`,
      data,
      title: APP_TITLE,
      left: drSide(rows(view.debit)),
      right: crSide(rows(view.credit)),
      distractors: [
        ...(loss ? ['Interest on Capital A/c', 'Partner\'s Salary A/c'] : ['Partner\'s Salary A/c', `${names[0]}'s ${own} A/c`]),
        'Balance c/d', 'General Reserve A/c', 'Interest on Partner\'s Loan A/c', `${names[0]}'s ${fixed ? 'Capital' : 'Current'} A/c`,
      ],
      explanation: loss
        ? [
            `The year ended in a loss of ${inr(profitOrLoss)}: it is brought in on the debit side, To Profit and Loss A/c.`,
            `Interest on capital and ${names[si]}'s salary are appropriations: with no profit, neither is allowed, so neither appears.`,
            `Interest on drawings is still charged and credited: ${iod.map(inr).join(' + ')} = ${inr(sum(iod))}.`,
            `Loss left to share = ${inr(profitOrLoss)} - ${inr(sum(iod))} = ${inr(profitOrLoss - sum(iod))}, in ${ratioText(psr)}: ${names.map((nm, j) => `${nm} ${inr(shares[j])}`).join(', ')}.`,
            `Each share of the loss is credited to this account and debited to the partner's ${own} A/c, because capitals are ${fixed ? 'fixed' : 'fluctuating'}. The two sides then agree.`,
          ]
        : [
            `Interest due at ${r}% p.a.: ${names.map((nm, j) => `${nm} ${inr(due[j])}`).join(', ')}; total ${inr(sum(due))}.`,
            `There is only ${inr(profitOrLoss)} + interest on drawings ${inr(sum(iod))} = ${inr(profitOrLoss + sum(iod))} to appropriate, less than the interest due.`,
            `Interest on capital is an appropriation, so it takes only what there is, shared in the ratio of the interest due (${ratioText(lowestTerms(units))}): ${names.map((nm, j) => `${nm} ${inr(allowed[j])}`).join(', ')}.`,
            'Nothing is left, so no share of profit is carried to the partners and the two sides agree at once.',
          ],
      hints: [
        loss ? 'Which items can only come out of a profit? Which are charged whatever the result?' : 'Add up the interest on capital due. Is there enough profit (with the interest on drawings) to pay it in full?',
        loss
          ? 'In a loss, interest on capital and salary are not allowed. Interest on drawings is credited, and what is left of the loss is shared in the profit-sharing ratio.'
          : 'When the profit falls short, interest on capital takes all of it, in the ratio of the interest due; there is no divisible profit.',
      ],
    };
  },
  verify: (q: AccountQuestion) => {
    // Forwards from the data: what is there to share, what each partner can be given, and the sides agreeing.
    const [head, capsRow, deedRow, iodRow, resultRow] = q.data.split('\n');
    const names = namesIn(head);
    const psr = psrIn(head);
    const caps = amountsIn(capsRow);
    const r = rateIn(deedRow);
    const iod = sum(amountsIn(iodRow));
    const figure = amountsIn(resultRow)[0];
    const [debit, creditSide] = q.sides.map((s) => s.rows);
    const total = (rows: typeof debit): number => sum(rows.map((row) => row.amounts[0] ?? 0)) / 100;
    const shown = (rows: typeof debit, label: string): number => (rows.find((row) => row.label === label)?.amounts[0] ?? 0) / 100;
    const fixed = head.includes('capitals are fixed');
    if (resultRow.startsWith('Net loss')) {
      const left = figure - iod;
      return (
        near(total(debit), figure) &&
        near(total(creditSide), figure) &&
        near(shown(creditSide, 'Interest on Drawings A/c'), iod) &&
        names.every((nm, j) => near(shown(creditSide, ownName(fixed, nm)), (left * psr[j]) / sum(psr)))
      );
    }
    const due = caps.map((c) => (c * r) / 100);
    return figure + iod < sum(due) && near(total(debit), figure + iod) && near(total(creditSide), figure + iod) && near(shown(debit, 'Interest on Capital A/c'), figure + iod) && debit.length === 1;
  },
});

const templates: Template[] = [
  deedFact, noDeedRule, noDeedLoanInterest, noDeedProfitShare, chargeOrAppropriation, capitalAccountItem, iocSimple, iodWholeAmount, iodAveragePeriod,
  divisibleProfit, shareOfProfit, ratioFromFractions, commissionBefore, journalAllow, journalClose,
  iocAdditional, iocOpeningFromClosing, iocInsufficient, iocCharge, iocRatio, iodProduct, iodMonthly, iodQuarterly, commissionAfter, appropriationShare,
  loanInterestProfit, guaranteeFirm, guaranteeOnePartner, currentBalance, journalProfitTransfer, journalLoanInterest, pastAdjustmentTakeBack,
  iocClosingFresh, iodPartYear, guaranteeRatio, commissionAfterSalary, appropriationFull, pastAdjustmentIoc, pastAdjustmentRatio, pastAdjustmentEffect,
  setAppropriations, setFixedAppropriations, setLoanCharge, setGuaranteeYear,
  fmtAppropriation, fmtAppropriationWorked, fmtCapitalAccounts, fmtCurrentAccounts, fmtFixedCapitalAccounts, fmtPastAdjustments,
  pfAssertionReason,
  iodFlatRate, iodLossYear, guaranteeTwo, pastAdjustmentYears, fmtAppropriationShort,
];

export default templates;

/**
 * What the case studies of the stage "partnership-accounts" (`src/generators/cases/partnership-accounts.ts`) reuse
 * of this topic: its people and years, its wording, its interest and drawings helpers, and the rows of its sets and
 * formats, so that a case reads and works exactly as the examined questions of the topic do. Exporting them changes
 * no question this file makes.
 */
export const PF_CASE = {
  inr, sum, near, partners, list, firmOf, yearOf, firstOf, monthsLeft, toNumber, amountsIn, read, rateIn, optionText,
  PSR2, PSR3, psrOf, CAPS2, CAPS3, ratioText, sameRatio, numeric, choice, dr, cr, ownId, ownName, capitalsAre, whyOwn,
  noChange, namesIn, psrIn, H, PLACES, PLACE_WHY, PLACE_EXPLAIN, RATE_PAIRS, WHENS, averagePeriod, timing, monthsText,
  simulateDrawings, whenIn, lcm, adjustingLines, netText,
  APP, THROUGH_APP, OWN_ACCOUNTS, OWN_DRAWINGS, ITEMS_OWN, NO_ACCOUNT_OF_ITS_OWN, each, labelled, rowOf, credit, sharesText,
  profitThatFits, firstThatFits, ASSETS, moveSays, movesOf, interestOnCapitals, productInterest, changesIn, drawnBy, interestOnDrawn,
  divisibleOf, appropriationAccount, APP_TITLE, appTask, partnersYear, yearEntries, readYear, openingBalances, reopens, balancesText,
  movesWhy, allowedWhy, drawingsWhy,
};
export type { Year as PfYear, Move as PfMove, Drawn as PfDrawn, DrawKind as PfDrawKind, When as PfWhen, Appropriations as PfAppropriations, PartnersYear as PfPartnersYear };
