import type { AccountQuestion, JournalSetQuestion, McqQuestion, StatementQuestion } from '@/content/types';
import { resolveAccount, vendor } from '@/engine/accounts';
import { BALANCE_BD, BALANCE_CD, accountOf, post, type DatedEntry, type Ledger } from '@/engine/books';
import type { JournalLine } from '@/engine/journal';
import type { Rng } from '@/engine/rng';
import { assertionReasonFacts, accountTemplate, factsTemplate, formatINR, journalSetTemplate, journalTemplate, keepFor, ledgerSides, mcqTemplate, numericTemplate, rupees, setDays, setHolds, statementTemplate } from '../authoring';
import type { AccountTemplate, FormatRowParts, JournalSetParts, JournalSetTemplate, McqParts, NumericParts, StatementLineParts, StatementTemplate, Template } from '../types';

const T = 'share-capital';

// ---------------------------------------------------------------------------------------------------------------
// Conventions used throughout (and stated in the prompts that rely on them):
//  - shares are issued at par or at a premium, never at a discount; no interest is charged on calls in arrears or
//    allowed on calls in advance;
//  - the premium is credited to Securities Premium A/c on the instalment with which it is payable, and every prompt
//    says which instalment that is ("₹6 on allotment (including the premium)");
//  - on a pro rata allotment the excess application money is used for the allotment money first; what is still left
//    over is refunded or kept as calls in advance, as the prompt says;
//  - a prompt says whether unpaid calls are moved to Calls in Arrears A/c or left as debit balances of the call accounts;
//  - on forfeiture Share Capital A/c is debited with the amount called up, Securities Premium A/c only when the premium
//    was not received, and Forfeited Shares A/c is credited with what the holder had paid towards capital;
//  - every figure is in whole rupees and every number of shares is whole: other combinations are rejected.
// ---------------------------------------------------------------------------------------------------------------

/** Whole rupees as the amount text a learner sees. */
const inr = (n: number): string => formatINR(rupees(n));
/** A number of shares with Indian digit grouping: 1,20,000. */
const cnt = (n: number): string => formatINR(rupees(n)).slice(1);

const COMPANIES = [
  'Sagar Mills Ltd.', 'Himadri Steels Ltd.', 'Narmada Textiles Ltd.', 'Kaveri Foods Ltd.', 'Deccan Tools Ltd.',
  'Malwa Cements Ltd.', 'Konkan Papers Ltd.', 'Vindhya Pharma Ltd.', 'Nilgiri Tea Ltd.', 'Aravali Motors Ltd.',
];
const HOLDERS = ['Mohan', 'Anita', 'Kiran', 'Farhan', 'Gurpreet', 'Lakshmi', 'Ravi', 'Sunita', 'Joseph', 'Meera', 'Nikhil', 'Zoya'];
const VENDORS = ['Sharma Machines', 'Rao Engineering Works', 'Kiran Traders', 'Lakshmi Industries', 'Mehta Brothers', 'Anand Tools'];

type Kind = 'equity' | 'preference';

/** Shareholders who behaved alike: what they applied for, what they were allotted and how far they paid. */
interface Group {
  applied: number;
  allotted: number;
  /** How many instalments were paid as they fell due, the application among them (1 = the application money only). */
  paid: number;
  forfeited?: boolean;
  /** Of the forfeited shares: how many were reissued, and the price of each (left out: at the called-up amount). */
  reissued?: number;
  price?: number;
}

/** One issue of shares, in rupees a share. */
interface Issue {
  kind: Kind;
  face: number;
  /** The capital part of each instalment: application, allotment, then one or two calls. They add up to the face value. */
  parts: number[];
  /** The premium a share, 0 for an issue at par, and the instalment that carries it (0 application, 1 allotment). */
  premium: number;
  premiumAt: 0 | 1;
  /** How many instalments have been called so far, the application and the allotment among them. */
  called: number;
  /** True when unpaid allotment and call money is moved to Calls in Arrears A/c. */
  arrears: boolean;
  /** What happens to excess application money that the allotment money does not use up. */
  surplus: 'refund' | 'advance';
  groups: Group[];
}

const STAGE_IDS = ['Application', 'Allotment', 'FirstCall', 'SecondAndFinalCall'];
const stageId = (kind: Kind, i: number, n: number): string => `${kind}Share${i === 2 && n === 3 ? 'FirstAndFinalCall' : STAGE_IDS[i]}`;
const stageName = (i: number, n: number): string => (i === 2 && n === 3 ? 'first and final call' : ['application', 'allotment', 'first call', 'second and final call'][i]);
/** "application", "allotment", "the first call": an instalment as a sentence names it. */
const stage = (i: number, n: number): string => (i >= 2 ? `the ${stageName(i, n)}` : stageName(i, n));
const capitalId = (kind: Kind): string => `${kind}ShareCapital`;
const ac = (id: string): string => `${resolveAccount(id).name} A/c`;
const sum = (list: readonly number[]): number => list.reduce((a, b) => a + b, 0);

/** "₹3 on application, ₹6 on allotment (including the premium) and ₹3 on the first and final call". */
function terms(s: Issue): string {
  const n = s.parts.length;
  const bits = s.parts.map((p, i) => {
    const withPremium = s.premium > 0 && s.premiumAt === i;
    return `${inr(p + (withPremium ? s.premium : 0))} on ${stage(i, n)}${withPremium ? ' (including the premium)' : ''}`;
  });
  return `${bits.slice(0, -1).join(', ')} and ${bits.at(-1)}`;
}
const priced = (s: Issue): string => (s.premium > 0 ? `at a premium of ${inr(s.premium)} a share` : 'at par');
const sharesOf = (s: Issue): string => `${s.kind} shares of ${inr(s.face)} each`;
/** What is payable on an instalment, the premium with it. */
const payable = (s: Issue, i: number): number => s.parts[i] + (s.premium > 0 && s.premiumAt === i ? s.premium : 0);

const SHAPES = [[3, 4, 3], [2, 3, 5], [4, 3, 3], [3, 3, 2, 2], [2, 3, 3, 2], [2, 4, 2, 2], [3, 2, 3, 2]];

/** An issue with its terms drawn: the face value, the instalments and the premium (payable on allotment). No shareholders yet. */
function drawIssue(rng: Rng, o: { premium?: 'none' | 'some'; calls?: 1 | 2; kind?: Kind } = {}): Issue {
  const face = rng.pick([10, 10, 10, 100]);
  const shape = rng.pick(SHAPES.filter((p) => o.calls === undefined || p.length === o.calls + 2));
  const step = rng.int(1, 5);
  const some = o.premium === 'some' || (o.premium === undefined && rng.int(0, 2) > 0);
  return {
    kind: o.kind ?? 'equity',
    face,
    parts: shape.map((x) => (x * face) / 10),
    premium: some ? (step * face) / 10 : 0,
    premiumAt: 1,
    called: shape.length,
    arrears: false,
    surplus: 'refund',
    groups: [],
  };
}

// ---------------------------------------------------------------------------------------------------------------
// The books of an issue, written up shareholder by shareholder. The templates work their answers out with the
// formulas a student uses; `verify` reads the same answers off these books, where each figure is reached another
// way (the amount forfeited, for one, is the balancing figure of the forfeiture entry).
// ---------------------------------------------------------------------------------------------------------------

interface Books {
  /** The money received with each instalment (index 0 is the application). */
  received: JournalLine[][];
  /** The application money dealt with on allotment. */
  transfer: JournalLine[];
  /** Each instalment becoming due (index 1 is the allotment). */
  due: JournalLine[][];
  forfeiture: JournalLine[];
  reissue: JournalLine[];
  reserve: JournalLine[];
  ledger: Ledger;
}

function books(s: Issue): Books {
  const n = s.parts.length;
  const capital = capitalId(s.kind);
  const at = (i: number): string => stageId(s.kind, i, n);
  type Tally = Map<string, number>;
  const tally = (): Tally => new Map();
  const add = (t: Tally, id: string, v: number): void => void t.set(id, (t.get(id) ?? 0) + v);
  const received = s.parts.map(tally);
  const due = s.parts.map(tally);
  const transfer = tally();
  const forfeiture = tally();
  const reissue = tally();
  const reserve = tally();
  const calledUp = sum(s.parts.slice(0, s.called));
  for (const g of s.groups) {
    const rate = payable(s, 0);
    add(received[0], 'bank', g.applied * rate);
    add(received[0], at(0), -g.applied * rate);
    add(transfer, at(0), g.applied * rate);
    add(transfer, capital, -g.allotted * s.parts[0]);
    add(transfer, 'securitiesPremium', -g.allotted * (rate - s.parts[0]));
    const excess = (g.applied - g.allotted) * rate;
    const owing = [0];
    let ahead = 0;
    for (let i = 1; i < s.called; i++) {
      const total = g.allotted * payable(s, i);
      add(due[i], at(i), total);
      add(due[i], capital, -g.allotted * s.parts[i]);
      add(due[i], 'securitiesPremium', -g.allotted * (payable(s, i) - s.parts[i]));
      let left = total;
      if (i === 1) {
        const used = Math.min(excess, total);
        add(transfer, at(1), -used);
        left -= used;
        if (s.surplus === 'advance' && g.allotted > 0) {
          add(transfer, 'callsInAdvance', -(excess - used));
          ahead = excess - used;
        } else add(transfer, 'bank', -(excess - used));
      } else {
        const used = Math.min(ahead, total);
        add(received[i], 'callsInAdvance', used);
        add(received[i], at(i), -used);
        ahead -= used;
        left -= used;
      }
      if (g.paid > i) {
        add(received[i], 'bank', left);
        add(received[i], at(i), -left);
        left = 0;
      } else if (s.arrears) {
        add(received[i], 'callsInArrears', left);
        add(received[i], at(i), -left);
      }
      owing.push(left);
    }
    if (!g.forfeited) continue;
    // The premium is taken back only when the instalment that carried it was not paid.
    const premiumBack = s.premium > 0 && s.premiumAt === 1 && owing[1] > 0 ? g.allotted * s.premium : 0;
    add(forfeiture, capital, g.allotted * calledUp);
    add(forfeiture, 'securitiesPremium', premiumBack);
    if (s.arrears) add(forfeiture, 'callsInArrears', -sum(owing));
    else owing.forEach((o, i) => add(forfeiture, at(i), -o));
    const kept = g.allotted * calledUp + premiumBack - sum(owing);
    add(forfeiture, 'forfeitedShares', -kept);
    if (!g.reissued) continue;
    const price = g.price ?? calledUp;
    const short = g.reissued * (calledUp - price);
    add(reissue, 'bank', g.reissued * price);
    add(reissue, capital, -g.reissued * calledUp);
    add(reissue, short > 0 ? 'forfeitedShares' : 'securitiesPremium', short);
    const gain = (kept * g.reissued) / g.allotted - Math.max(short, 0);
    add(reserve, 'forfeitedShares', gain);
    add(reserve, 'capitalReserve', -gain);
  }
  const lines = (t: Tally): JournalLine[] =>
    [...t].filter(([, v]) => v !== 0).map(([accountId, v]): JournalLine => ({ accountId, side: v > 0 ? 'Dr' : 'Cr', amount: rupees(Math.abs(v)) }));
  const out = { received: received.map(lines), transfer: lines(transfer), due: due.map(lines), forfeiture: lines(forfeiture), reissue: lines(reissue), reserve: lines(reserve) };
  return { ...out, ledger: post([...out.received, out.transfer, ...out.due, out.forfeiture, out.reissue, out.reserve]) };
}

/** The amount, in paise, of the line of an entry for one account on one side; 0 when the entry has no such line. */
const lineOf = (lines: readonly JournalLine[], accountId: string, side: 'Dr' | 'Cr'): number => lines.find((l) => l.accountId === accountId && l.side === side)?.amount ?? 0;
/** The balance of an account in paise: a debit balance above zero, a credit balance below. */
const net = (ledger: Ledger, accountId: string): number => ledger.get(accountId) ?? 0;
const sameEntry = (a: readonly JournalLine[], b: readonly JournalLine[]): boolean => {
  const key = (list: readonly JournalLine[]): string => list.map((l) => `${l.accountId}|${l.side}|${l.amount}`).sort().join(';');
  return key(a) === key(b);
};

/** The issue a question was made from, kept for its `verify`. */
const ISSUES = keepFor<Issue>();
/** The plain figures a question was made from, kept for its `verify` where no issue of shares is walked. */
const FACTS = keepFor<Record<string, number>>();
/** Every figure of a prompt, in order: amounts and numbers of shares alike. */
const figures = (s: string): number[] => (s.match(/\d[\d,]*/g) ?? []).map((x) => Number(x.replace(/,/g, '')));
const optionText = (q: McqQuestion): string | undefined => q.options.find((o) => o.id === q.correct)?.text;

const dr = (accountId: string, n: number): JournalLine => ({ accountId, side: 'Dr', amount: rupees(n) });
const cr = (accountId: string, n: number): JournalLine => ({ accountId, side: 'Cr', amount: rupees(n) });
/** The lines of an entry, without those that come to nothing. */
const entry = (...lines: JournalLine[]): JournalLine[] => lines.filter((l) => l.amount > 0);

/** A numeric question's answer and wrong answers, in rupees (or plain numbers with `scale` 1). Null when fewer than two distinct wrong answers remain. */
function numeric(answer: number, errs: [number, string][], scale = 100): Pick<NumericParts, 'answer' | 'commonErrors'> | null {
  if (!Number.isInteger(answer) || answer <= 0) return null;
  const seen = new Set([answer]);
  const commonErrors: { value: number; why: string }[] = [];
  for (const [v, why] of errs) if (Number.isInteger(v) && v > 0 && !seen.has(v) && seen.add(v)) commonErrors.push({ value: v * scale, why });
  return commonErrors.length >= 2 ? { answer: answer * scale, commonErrors } : null;
}

/** A multiple-choice question; null when fewer than three distinct wrong options remain. */
function choice(prompt: string, correct: string, wrong: [string, string][], explanation: string, hints?: string[]): McqParts | null {
  const seen = new Set([correct]);
  const distractors: { text: string; why: string }[] = [];
  for (const [text, why] of wrong) if (!seen.has(text) && seen.add(text)) distractors.push({ text, why });
  if (distractors.length < 3) return null;
  return { prompt, correct, distractors, explanation, ...(hints ? { hints } : {}) };
}

const H = {
  kinds: ['Go down the ladder: authorised, issued, subscribed, called-up, paid-up. Each is a part of the one before it.', 'Paid-up capital = called-up capital - calls in arrears.'],
  issue: ['Money comes in on the shares applied for; Share Capital A/c is credited only for the shares allotted.', 'The premium is credited to Securities Premium A/c with the instalment on which it is payable.'],
  prorata: ['Excess application money = (shares applied for - shares allotted) x application money a share.', 'The excess is used for the allotment money first; only what is still left over is refunded or kept as calls in advance.'],
  calls: ['A call is made on every share; what some holders do not pay is calls in arrears.', 'Money paid before a call is made is a liability, Calls in Advance A/c, until the call falls due.'],
  vendor: ['Number of shares = amount to be paid in shares / issue price of one share.', 'A price above the net assets taken over is goodwill; a price below them leaves a capital reserve.'],
  forfeit: ['Debit Share Capital A/c with the amount called up on the forfeited shares, not with what was paid.', 'Forfeited Shares A/c is credited with what the holder had paid towards capital; Securities Premium A/c is debited only if the premium was never received.'],
  reissue: ['The discount on reissue cannot be more than the amount forfeited on those shares.', 'Capital reserve = amount forfeited on the shares reissued - discount allowed on their reissue.'],
  note: ['Share capital in the balance sheet = called-up amount of the subscribed shares - calls in arrears + balance of Forfeited Shares A/c.', 'Securities Premium and Capital Reserve are shown under Reserves and Surplus, not in share capital.'],
};

// ===============================================================================================================
// KINDS OF SHARE CAPITAL
// ===============================================================================================================

/** A company's capital at each stage, from one set of figures. `partly` keeps the amount called below the face value. */
function drawCapital(rng: Rng, partly: boolean) {
  const face = rng.pick([10, 10, 100]);
  const unit = face / 10;
  const offered = rng.step(20000, 100000, 10000);
  const registered = offered * rng.pick([2, 3, 4, 5]);
  const taken = offered - (offered * rng.pick([2, 4, 5, 8, 10])) / 100;
  const called = rng.pick(partly ? [6, 7, 8] : [6, 7, 8, 10]) * unit;
  const last = rng.pick([2, 3]) * unit;
  const k = rng.step(100, 1000, 100);
  const who = rng.pick(HOLDERS);
  const text =
    `${rng.pick(COMPANIES)} is registered with a capital of ${inr(registered * face)} divided into ${cnt(registered)} equity shares of ${inr(face)} each. ` +
    `It offered ${cnt(offered)} shares to the public, and applications were received for ${cnt(taken)} shares, all of which were allotted. ` +
    `The company has called up ${inr(called)} a share so far. Every shareholder has paid the calls except ${who}, who holds ${cnt(k)} shares and has not paid the last call of ${inr(last)} a share.`;
  return { face, offered, registered, taken, called, last, k, who, text, authorised: registered * face, issued: offered * face, subscribed: taken * face, calledUp: taken * called, paidUp: taken * called - k * last };
}
/** The same five figures read back from the prompt `drawCapital` wrote. */
function capitalFrom(prompt: string) {
  const [authorised, , face, offered, taken, called, k, last] = figures(prompt);
  return { authorised, issued: offered * face, subscribed: taken * face, 'called-up': taken * called, 'paid-up': (taken - k) * called + k * (called - last) };
}

const capitalAmounts = numericTemplate({
  id: 'sc-capital-amounts', topicId: T, conceptId: 'sc-kinds', difficulty: 'easy', unit: 'rupees',
  generate: (rng) => {
    const c = drawCapital(rng, false);
    const ask = rng.pick(['issued', 'subscribed', 'called-up', 'paid-up'] as const);
    const set = {
      issued: {
        answer: c.issued,
        errs: [
          [c.authorised, 'Gave the authorised capital, the limit set in the Memorandum, not the part offered to the public.'],
          [c.subscribed, 'Gave the subscribed capital: the shares the public took up, not the shares offered.'],
          [c.offered * c.called, 'Multiplied the shares offered by the amount called up; issued capital is taken at face value.'],
        ],
        working: [`Issued capital = shares offered to the public x face value = ${cnt(c.offered)} x ${inr(c.face)} = ${inr(c.issued)}.`],
      },
      subscribed: {
        answer: c.subscribed,
        errs: [
          [c.issued, 'Gave the issued capital: the shares offered, although fewer were applied for and allotted.'],
          [c.calledUp, 'Gave the called-up capital; subscribed capital is the face value of the shares taken up.'],
          [c.authorised, 'Gave the authorised capital, the limit set in the Memorandum.'],
          [c.paidUp, 'Gave the paid-up capital; subscribed capital is the face value of the shares taken up.'],
        ],
        working: [`Subscribed capital = shares taken up by the public x face value = ${cnt(c.taken)} x ${inr(c.face)} = ${inr(c.subscribed)}.`],
      },
      'called-up': {
        answer: c.calledUp,
        errs: [
          [c.paidUp, `Deducted the call ${c.who} has not paid; that gives the paid-up capital, and called-up capital is what has been asked for.`],
          [c.offered * c.called, 'Worked on the shares offered, not on the shares that were subscribed.'],
          [c.subscribed, `Took the full face value, although only ${inr(c.called)} a share has been called so far.`],
          [c.issued, 'Gave the issued capital, the face value of the shares offered.'],
        ],
        working: [`Called-up capital = shares subscribed x amount called a share = ${cnt(c.taken)} x ${inr(c.called)} = ${inr(c.calledUp)}.`, 'The unpaid call is still part of the called-up capital: it has been asked for.'],
      },
      'paid-up': {
        answer: c.paidUp,
        errs: [
          [c.calledUp, `Gave the called-up capital and did not deduct the call ${c.who} has not paid.`],
          [c.calledUp + c.k * c.last, 'Added the calls in arrears instead of deducting them.'],
          [(c.taken - c.k) * c.called, `Left out everything on ${c.who}'s shares; only the unpaid call on them is missing from the paid-up capital.`],
        ],
        working: [
          `Called-up capital = ${cnt(c.taken)} x ${inr(c.called)} = ${inr(c.calledUp)}.`,
          `Calls in arrears = ${cnt(c.k)} x ${inr(c.last)} = ${inr(c.k * c.last)}.`,
          `Paid-up capital = ${inr(c.calledUp)} - ${inr(c.k * c.last)} = ${inr(c.paidUp)}.`,
        ],
      },
    }[ask];
    const n = numeric(set.answer, set.errs as [number, string][]);
    return n && { prompt: `${c.text} What is the company's ${ask} capital?`, ...n, explanation: set.working, hints: H.kinds };
  },
  verify: (q) => {
    const ask = /What is the company's ([a-z-]+) capital\?$/.exec(q.prompt)?.[1] as 'issued' | 'subscribed' | 'called-up' | 'paid-up';
    return q.answer === capitalFrom(q.prompt)[ask] * 100;
  },
});

const CAPITAL_TERMS = {
  authorised: ['Authorised capital', 'Picked the limit set in the Memorandum of Association'],
  issued: ['Issued capital', 'Picked the face value of the shares offered to the public'],
  subscribed: ['Subscribed capital', 'Picked the face value of the shares the public took up'],
  'called-up': ['Called-up capital', 'Picked the amount the company has asked for on the shares taken up'],
  'paid-up': ['Paid-up capital', 'Picked the amount the shareholders have actually paid on the calls'],
} as const;

const capitalTerm = mcqTemplate({
  id: 'sc-capital-term', topicId: T, conceptId: 'sc-kinds', difficulty: 'easy',
  generate: (rng) => {
    const c = drawCapital(rng, true);
    const value = { authorised: c.authorised, issued: c.issued, subscribed: c.subscribed, 'called-up': c.calledUp, 'paid-up': c.paidUp };
    const keys = Object.keys(CAPITAL_TERMS) as (keyof typeof CAPITAL_TERMS)[];
    const ask = rng.pick(keys);
    const wrong = keys.filter((k) => k !== ask).map((k): [string, string] => [CAPITAL_TERMS[k][0], `${CAPITAL_TERMS[k][1]}, which is ${inr(value[k])} here.`]);
    wrong.push(['Reserve capital', 'Picked the uncalled capital that is kept back for a winding up; no such decision is mentioned here.']);
    return choice(
      `${c.text} In this company, what is the figure of ${inr(value[ask])} called?`,
      CAPITAL_TERMS[ask][0],
      wrong,
      `Authorised ${inr(c.authorised)}; issued ${cnt(c.offered)} x ${inr(c.face)} = ${inr(c.issued)}; subscribed ${cnt(c.taken)} x ${inr(c.face)} = ${inr(c.subscribed)}; called-up ${cnt(c.taken)} x ${inr(c.called)} = ${inr(c.calledUp)}; paid-up ${inr(c.calledUp)} - ${inr(c.k * c.last)} = ${inr(c.paidUp)}.`,
      H.kinds,
    );
  },
  verify: (q) => {
    const value = capitalFrom(q.prompt);
    const asked = figures(q.prompt).at(-1);
    const key = (Object.keys(value) as (keyof typeof value)[]).filter((k) => value[k] === asked);
    return key.length === 1 && optionText(q) === CAPITAL_TERMS[key[0]][0];
  },
});

const reserveCapital = numericTemplate({
  id: 'sc-reserve-capital', topicId: T, conceptId: 'sc-kinds', difficulty: 'medium', unit: 'rupees',
  generate: (rng) => {
    const face = rng.pick([10, 10, 100]);
    const unit = face / 10;
    const shares = rng.step(20000, 200000, 10000);
    const called = rng.pick([5, 6, 7]) * unit;
    const kept = rng.pick([1, 2]) * unit;
    const free = face - called - kept;
    const reserve = rng.step(20000, 90000, 5000);
    const askReserve = rng.int(0, 2) > 0;
    const base =
      `${rng.pick(COMPANIES)} has ${cnt(shares)} equity shares of ${inr(face)} each in issue, on which ${inr(called)} a share has been called up and paid. ` +
      `By a special resolution the company has decided that ${inr(kept)} a share of the uncalled amount will be called only if the company is wound up. ` +
      `Its books also show a Capital Reserve of ${inr(reserve)}, the gain on reissue of forfeited shares.`;
    const n = askReserve
      ? numeric(shares * kept, [
          [reserve, 'Gave the Capital Reserve, a reserve made out of a capital profit; reserve capital is uncalled share capital.'],
          [shares * (face - called), 'Took the whole of the uncalled capital; only the part kept back for a winding up is reserve capital.'],
          [shares * free, 'Gave the uncalled capital that can still be called in the normal course, which is the part that is not reserve capital.'],
          [shares * kept + reserve, 'Added the Capital Reserve to the reserve capital; the two have nothing to do with each other.'],
        ])
      : numeric(shares * free, [
          [shares * (face - called), 'Took the whole of the uncalled capital and did not leave out the part kept back for a winding up.'],
          [shares * kept, 'Gave the reserve capital, which is exactly the part that cannot be called while the company is running.'],
          [shares * (face - called) - reserve, 'Deducted the Capital Reserve; it is a reserve made out of a capital profit and has nothing to do with uncalled capital.'],
        ]);
    return n && {
      prompt: `${base} ${askReserve ? "What is the company's reserve capital?" : 'How much can the company still call from its shareholders while it is a going concern?'}`,
      ...n,
      explanation: askReserve
        ? [`Reserve capital = uncalled capital kept back for a winding up = ${cnt(shares)} x ${inr(kept)} = ${inr(shares * kept)}.`, 'Capital Reserve is a different thing: a reserve made out of a capital profit.']
        : [`Uncalled a share = ${inr(face)} - ${inr(called)} = ${inr(face - called)}, of which ${inr(kept)} is reserve capital.`, `Still callable = ${cnt(shares)} x ${inr(free)} = ${inr(shares * free)}.`],
      hints: ['Reserve capital is a part of the uncalled share capital; Capital Reserve is a reserve made out of a capital profit.', 'Uncalled capital = face value - amount called up, on every share.'],
    };
  },
  verify: (q) => {
    const [shares, face, called, kept] = figures(q.prompt);
    return q.answer === (q.prompt.endsWith('reserve capital?') ? shares * kept : shares * face - shares * called - shares * kept) * 100;
  },
});

// ===============================================================================================================
// PRIVATE PLACEMENT, ESOP AND SWEAT EQUITY (recognition only)
// ===============================================================================================================

const ISSUE_KINDS = {
  esop: ['An Employee Stock Option Plan (ESOP)', 'Took it for an option given to employees to buy shares later at a price fixed now; nothing of that kind is described.'],
  sweat: ['An issue of sweat equity shares', 'Took it for shares given to employees or directors in return for know-how or other value they add; that is not what happened here.'],
  placement: ['A private placement of shares', 'Took it for an offer made privately to a selected group of investors; that is not what happened here.'],
  public: ['A public issue of shares', 'Took it for an invitation to the general public through a prospectus; the public was not invited here.'],
  vendor: ['An issue of shares to a vendor for consideration other than cash', 'Took it for shares given to a vendor in payment for an asset or a business; nothing was bought from a vendor here.'],
} as const;

const specialIssueKind = mcqTemplate({
  id: 'sc-special-issue-kind', topicId: T, conceptId: 'sc-special-issues', difficulty: 'easy',
  generate: (rng) => {
    const co = rng.pick(COMPANIES);
    const shares = rng.step(1000, 9000, 1000);
    const people = rng.step(20, 150, 10);
    const market = rng.step(120, 400, 20);
    const price = market - rng.step(20, 80, 10);
    const years = rng.int(2, 4);
    const keys = Object.keys(ISSUE_KINDS) as (keyof typeof ISSUE_KINDS)[];
    const kind = rng.pick(keys);
    const story = {
      esop: rng.pick([
        `${co} gave ${people} of its employees the right to buy ${cnt(shares)} equity shares each, after ${years} years of service, at ${inr(price)} a share. The market price of the share is ${inr(market)}.`,
        `Under a scheme of ${co}, an employee who stays for ${years} years may choose to buy up to ${cnt(shares)} equity shares at ${inr(price)} each, well below the market price of ${inr(market)}. No employee is bound to buy.`,
      ]),
      sweat: rng.pick([
        `${co} allotted ${cnt(shares)} equity shares to its technical director, without taking any cash, in return for the know-how the director made available to the company.`,
        `${co} allotted ${cnt(shares)} equity shares to ${rng.int(2, 6)} of its senior employees at ${inr(price)} each, when the market price was ${inr(market)}, in recognition of the designs they created for the company.`,
      ]),
      placement: rng.pick([
        `${co} needed funds quickly. Without issuing a prospectus, it offered ${cnt(shares * 100)} equity shares through an offer letter to ${people} selected investors, who took them all.`,
        `${co} raised capital by allotting ${cnt(shares * 100)} equity shares to ${people} chosen financial institutions and investors, to whom alone the offer was made.`,
      ]),
      public: rng.pick([
        `${co} issued a prospectus inviting anyone to apply for ${cnt(shares * 100)} equity shares at ${inr(price)} each.`,
        `Through a prospectus published in the newspapers, ${co} invited applications from the public for ${cnt(shares * 100)} equity shares.`,
      ]),
      vendor: rng.pick([
        `${co} bought a building from ${rng.pick(VENDORS)} and, instead of paying cash, allotted ${cnt(shares * 10)} equity shares to that seller.`,
        `${co} took over the running business of ${rng.pick(VENDORS)} and settled the price by allotting ${cnt(shares * 10)} equity shares to it.`,
      ]),
    }[kind];
    return choice(
      `${story} What is this an example of?`,
      ISSUE_KINDS[kind][0],
      keys.filter((k) => k !== kind).map((k): [string, string] => [ISSUE_KINDS[k][0], ISSUE_KINDS[k][1]]),
      {
        esop: 'An ESOP gives employees the option, not the duty, to buy shares of the company in future at a price fixed in advance, usually below the market price.',
        sweat: 'Sweat equity shares are issued to employees or directors at a discount or for consideration other than cash, for know-how, intellectual property or other value they add.',
        placement: 'A private placement is an offer of shares to a selected group of persons through a private offer letter, without a prospectus and without inviting the public.',
        public: 'A public issue invites the general public to subscribe, through a prospectus.',
        vendor: 'When a company pays for an asset or a business with its own shares, the shares are issued for consideration other than cash.',
      }[kind],
      ['Who gets the shares: the public, a chosen few investors, employees, or a seller of assets?', 'An option to buy later is an ESOP; shares for know-how are sweat equity; an offer to a selected group is a private placement.'],
    );
  },
});

// ===============================================================================================================
// ISSUE AT PAR AND AT A PREMIUM
// ===============================================================================================================

const instalmentDue = numericTemplate({
  id: 'sc-instalment-due', topicId: T, conceptId: 'sc-issue', difficulty: 'easy', unit: 'rupees',
  generate: (rng) => {
    const s = drawIssue(rng);
    const n = rng.step(20000, 200000, 10000);
    s.groups = [{ applied: n, allotted: n, paid: s.parts.length }];
    const [app, allot] = s.parts;
    const p = s.premium;
    const base = `${rng.pick(COMPANIES)} issued ${cnt(n)} ${sharesOf(s)} ${priced(s)}, payable ${terms(s)}. The issue was fully subscribed and every instalment was received in full.`;
    const asks: { q: string; a: number; errs: [number, string][]; w: string[] }[] = [
      {
        q: 'How much became due on allotment in all?',
        a: n * (allot + p),
        errs: [
          [n * allot, 'Left out the premium, which is payable with the allotment money.'],
          [n * (app + allot + p), 'Added the application money to the allotment money.'],
          [n * s.face, 'Took the whole face value as due on allotment.'],
          [n * p, 'Gave only the premium on the shares.'],
        ],
        w: [`Due on allotment = ${cnt(n)} x ${inr(allot + p)} = ${inr(n * (allot + p))}${p > 0 ? `, of which ${inr(n * p)} is premium` : ''}.`],
      },
      {
        q: 'How much did the company receive on application?',
        a: n * app,
        errs: [
          [n * (app + p), 'Added the premium, which is payable on allotment and not on application.'],
          [n * s.face, 'Took the whole face value as received on application.'],
          [n * (app + allot + p), 'Added the allotment money to the application money.'],
        ],
        w: [`Received on application = ${cnt(n)} x ${inr(app)} = ${inr(n * app)}.`],
      },
    ];
    if (p > 0) {
      asks.push(
        {
          q: 'By how much is Share Capital A/c credited when the allotment money becomes due?',
          a: n * allot,
          errs: [
            [n * (allot + p), 'Credited the premium to Share Capital A/c; it goes to Securities Premium A/c.'],
            [n * (app + allot), 'Added the application money, which is credited to Share Capital A/c by a separate entry.'],
            [n * s.face, 'Credited the whole face value on allotment; only the capital part of the allotment money is credited at this stage.'],
          ],
          w: [`Allotment money a share = ${inr(allot + p)}, of which ${inr(p)} is premium and ${inr(allot)} is capital.`, `Share Capital A/c is credited with ${cnt(n)} x ${inr(allot)} = ${inr(n * allot)}; Securities Premium A/c with ${inr(n * p)}.`],
        },
        {
          q: 'How much cash did the company receive on these shares in all?',
          a: n * (s.face + p),
          errs: [
            [n * s.face, 'Left out the premium received over the face value.'],
            [n * p, 'Gave only the premium received.'],
            [n * (s.face - p), 'Deducted the premium from the face value; a premium is received over and above it.'],
          ],
          w: [`Issue price = face value ${inr(s.face)} + premium ${inr(p)} = ${inr(s.face + p)} a share.`, `Total received = ${cnt(n)} x ${inr(s.face + p)} = ${inr(n * (s.face + p))}.`],
        },
      );
    }
    const ask = rng.pick(asks);
    const num = numeric(ask.a, ask.errs);
    const prompt = `${base} ${ask.q}`;
    ISSUES.keep(prompt, s);
    return num && { prompt, ...num, explanation: ask.w, hints: H.issue };
  },
  verify: (q) => {
    const s = ISSUES.of(q.prompt);
    if (!s) return false;
    const b = books(s);
    const allotment = stageId(s.kind, 1, s.parts.length);
    if (q.prompt.endsWith('on allotment in all?')) return q.answer === lineOf(b.due[1], allotment, 'Dr');
    if (q.prompt.endsWith('on application?')) return q.answer === lineOf(b.received[0], 'bank', 'Dr');
    if (q.prompt.endsWith('becomes due?')) return q.answer === lineOf(b.due[1], capitalId(s.kind), 'Cr');
    return q.answer === net(b.ledger, 'bank');
  },
});

const premiumTotal = numericTemplate({
  id: 'sc-premium-total', topicId: T, conceptId: 'sc-issue', difficulty: 'easy', unit: 'rupees',
  generate: (rng) => {
    const face = rng.pick([10, 100]);
    const pct = rng.pick(face === 10 ? [10, 20, 30, 40, 50] : [5, 10, 15, 20, 25, 40, 50]);
    const p = (face * pct) / 100;
    const n = rng.step(10000, 150000, 5000);
    const style = rng.int(0, 2);
    const how = [`at a premium of ${pct}%`, `at ${inr(face + p)} a share`, `at a premium of ${inr(p)} a share`][style];
    const base = `${rng.pick(COMPANIES)} issued ${cnt(n)} equity shares of ${inr(face)} each ${how}. All the shares were taken up and paid for in full.`;
    const askPremium = rng.int(0, 1) === 0;
    const num = askPremium
      ? numeric(n * p, [
          [n * (face + p), 'Gave the whole amount received; only the excess over the face value is premium.'],
          [n * face, 'Gave the share capital, the face value of the shares.'],
          ...(style === 0 ? [[n * pct, `Took ${pct} as rupees a share; the premium is ${pct}% of the face value of ${inr(face)}.`] as [number, string]] : []),
        ])
      : numeric(n * (face + p), [
          [n * face, 'Left out the premium received over the face value.'],
          [n * p, 'Gave only the premium received.'],
          ...(style === 0 ? [[n * (face + pct), `Took ${pct} as rupees a share; the premium is ${pct}% of the face value of ${inr(face)}.`] as [number, string]] : []),
        ]);
    return num && {
      prompt: `${base} ${askPremium ? 'What amount is credited to Securities Premium A/c in all?' : 'How much did the company receive on these shares in all?'}`,
      ...num,
      explanation: [
        style === 0 ? `Premium a share = ${pct}% of ${inr(face)} = ${inr(p)}.` : style === 1 ? `Premium a share = issue price ${inr(face + p)} - face value ${inr(face)} = ${inr(p)}.` : `Premium a share = ${inr(p)}; issue price = ${inr(face + p)}.`,
        askPremium ? `Securities Premium = ${cnt(n)} x ${inr(p)} = ${inr(n * p)}.` : `Total received = ${cnt(n)} x ${inr(face + p)} = ${inr(n * (face + p))}, of which ${inr(n * face)} is share capital and ${inr(n * p)} premium.`,
      ],
      hints: ['Premium a share = issue price - face value.', 'The face value goes to Share Capital A/c and the excess to Securities Premium A/c.'],
    };
  },
  verify: (q) => {
    const [n, face, x] = figures(q.prompt);
    const p = q.prompt.includes('%') ? (face * x) / 100 : q.prompt.includes('a premium of') ? x : x - face;
    return q.answer === (q.prompt.endsWith('Securities Premium A/c in all?') ? n * p : n * face + n * p) * 100;
  },
});

const entryApplicationReceived = journalTemplate({
  id: 'sc-entry-application-received', topicId: T, conceptId: 'sc-issue', difficulty: 'easy', computed: true,
  generate: (rng) => {
    const s = drawIssue(rng, { kind: rng.pick(['equity', 'equity', 'preference'] as const) });
    const offered = rng.step(20000, 150000, 10000);
    const mode = rng.int(0, 2);
    const applied = mode === 0 ? offered : mode === 1 ? offered + rng.step(5000, 50000, 5000) : offered - (offered * rng.pick([2, 5, 10])) / 100;
    s.groups = [{ applied, allotted: Math.min(applied, offered), paid: 1 }];
    const app = stageId(s.kind, 0, s.parts.length);
    const money = applied * s.parts[0];
    const prompt = `${rng.pick(COMPANIES)} invited applications for ${cnt(offered)} ${sharesOf(s)} ${priced(s)}, payable ${terms(s)}. Applications were received for ${cnt(applied)} shares, each with the application money. Pass the entry for the money received on application.`;
    ISSUES.keep(prompt, s);
    return {
      prompt,
      lines: [dr('bank', money), cr(app, money)],
      explanation: [
        `Application money comes in on the ${cnt(applied)} shares applied for${applied === offered ? '' : `, not on the ${cnt(offered)} shares offered`}: ${cnt(applied)} x ${inr(s.parts[0])} = ${inr(money)}.`,
        'The money is in the bank, so Bank A/c is debited.',
        `No share has been allotted yet, so the money is held in ${ac(app)}; Share Capital A/c is credited only on allotment.`,
      ],
      distractorAccounts: [capitalId(s.kind), stageId(s.kind, 1, s.parts.length), 'securitiesPremium'],
      hints: H.issue,
    };
  },
  verify: (q) => {
    const s = ISSUES.of(q.prompt);
    return !!s && sameEntry(q.expected, books(s).received[0]);
  },
});

const entryApplicationTransfer = journalTemplate({
  id: 'sc-entry-application-transfer', topicId: T, conceptId: 'sc-issue', difficulty: 'easy', computed: true,
  generate: (rng) => {
    const s = drawIssue(rng, { kind: rng.pick(['equity', 'equity', 'preference'] as const) });
    const n = rng.step(20000, 150000, 10000);
    s.groups = [{ applied: n, allotted: n, paid: 1 }];
    const app = stageId(s.kind, 0, s.parts.length);
    const money = n * s.parts[0];
    const prompt = `${rng.pick(COMPANIES)} issued ${cnt(n)} ${sharesOf(s)} ${priced(s)}, payable ${terms(s)}. Applications were received for exactly ${cnt(n)} shares, and the directors allotted them. Pass the entry that deals with the application money on allotment.`;
    ISSUES.keep(prompt, s);
    return {
      prompt,
      lines: [dr(app, money), cr(capitalId(s.kind), money)],
      explanation: [
        `Application money held = ${cnt(n)} x ${inr(s.parts[0])} = ${inr(money)}.`,
        `The shares are now allotted, so ${ac(app)} is debited and closed.`,
        `The money becomes capital: ${ac(capitalId(s.kind))} is credited.${s.premium > 0 ? ' The premium is payable on allotment, so no premium is credited at this stage.' : ''}`,
      ],
      distractorAccounts: ['bank', stageId(s.kind, 1, s.parts.length), 'securitiesPremium'],
      hints: H.issue,
    };
  },
  verify: (q) => {
    const s = ISSUES.of(q.prompt);
    return !!s && sameEntry(q.expected, books(s).transfer);
  },
});

const entryPremiumWithApplication = journalTemplate({
  id: 'sc-entry-premium-with-application', topicId: T, conceptId: 'sc-issue', difficulty: 'medium', computed: true,
  generate: (rng) => {
    const co = rng.pick(COMPANIES);
    const n = rng.step(20000, 150000, 10000);
    if (rng.int(0, 1) === 0) {
      // Payable in instalments, the premium with the application money.
      const s: Issue = { ...drawIssue(rng, { premium: 'some' }), premiumAt: 0 };
      s.groups = [{ applied: n, allotted: n, paid: 1 }];
      const app = stageId(s.kind, 0, s.parts.length);
      const prompt = `${co} issued ${cnt(n)} ${sharesOf(s)} ${priced(s)}, payable ${terms(s)}. The issue was fully subscribed and the shares were allotted. Pass the entry that deals with the application money on allotment.`;
      ISSUES.keep(prompt, s);
      return {
        prompt,
        lines: [dr(app, n * (s.parts[0] + s.premium)), cr(capitalId(s.kind), n * s.parts[0]), cr('securitiesPremium', n * s.premium)],
        explanation: [
          `Application money held = ${cnt(n)} x ${inr(s.parts[0] + s.premium)} = ${inr(n * (s.parts[0] + s.premium))}: ${ac(app)} is debited.`,
          `Its capital part, ${cnt(n)} x ${inr(s.parts[0])} = ${inr(n * s.parts[0])}, is credited to ${ac(capitalId(s.kind))}.`,
          `The premium was payable with the application, so ${cnt(n)} x ${inr(s.premium)} = ${inr(n * s.premium)} is credited to Securities Premium A/c now.`,
        ],
        distractorAccounts: ['bank', stageId(s.kind, 1, s.parts.length), 'capitalReserve'],
        hints: H.issue,
      };
    }
    // The whole issue price in one sum with the application.
    const face = rng.pick([10, 10, 100]);
    const p = (rng.int(1, 5) * face) / 10;
    const prompt = `${co} issued ${cnt(n)} equity shares of ${inr(face)} each at a premium of ${inr(p)} a share. The whole issue price was payable in one sum with the application, and the company keeps one Equity Share Application and Allotment A/c. Applications were received for exactly ${cnt(n)} shares, with the money, and the shares were allotted. Pass the entry on allotment.`;
    return {
      prompt,
      lines: [dr('equityShareApplicationAndAllotment', n * (face + p)), cr('equityShareCapital', n * face), cr('securitiesPremium', n * p)],
      explanation: [
        `Money held = ${cnt(n)} x ${inr(face + p)} = ${inr(n * (face + p))}: Equity Share Application and Allotment A/c is debited and closed.`,
        `The face value, ${cnt(n)} x ${inr(face)} = ${inr(n * face)}, is credited to Equity Share Capital A/c.`,
        `The premium, ${cnt(n)} x ${inr(p)} = ${inr(n * p)}, is credited to Securities Premium A/c.`,
      ],
      distractorAccounts: ['bank', 'equityShareApplication', 'equityShareAllotment', 'capitalReserve'],
      hints: H.issue,
    };
  },
  verify: (q) => {
    const s = ISSUES.of(q.prompt);
    if (s) return sameEntry(q.expected, books(s).transfer);
    // The lump sum: the debit is the whole issue price, split between the face value and the premium.
    const [n, face, p] = figures(q.prompt);
    return q.prompt.includes('in one sum') && lineOf(q.expected, 'equityShareApplicationAndAllotment', 'Dr') === n * (face + p) * 100 && lineOf(q.expected, 'securitiesPremium', 'Cr') === n * p * 100 && lineOf(q.expected, 'equityShareCapital', 'Cr') === n * face * 100;
  },
});

const entryAllotmentDue = journalTemplate({
  id: 'sc-entry-allotment-due', topicId: T, conceptId: 'sc-issue', difficulty: 'medium', computed: true,
  generate: (rng) => {
    const s = drawIssue(rng, { premium: rng.int(0, 3) === 0 ? 'none' : 'some', kind: rng.pick(['equity', 'equity', 'preference'] as const) });
    const offered = rng.step(20000, 150000, 10000);
    const under = rng.int(0, 2) === 0;
    const n = under ? offered - (offered * rng.pick([2, 5, 10])) / 100 : offered;
    s.groups = [{ applied: n, allotted: n, paid: 1 }];
    const allotment = stageId(s.kind, 1, s.parts.length);
    const prompt =
      `${rng.pick(COMPANIES)} offered ${cnt(offered)} ${sharesOf(s)} ${priced(s)}, payable ${terms(s)}. ` +
      `${under ? `Applications were received for ${cnt(n)} shares only, and all of them were allotted.` : 'The issue was fully subscribed and the shares were allotted.'} Pass the entry for the allotment money becoming due.`;
    ISSUES.keep(prompt, s);
    return {
      prompt,
      lines: entry(dr(allotment, n * payable(s, 1)), cr(capitalId(s.kind), n * s.parts[1]), cr('securitiesPremium', n * s.premium)),
      explanation: [
        `Allotment money is due on the ${cnt(n)} shares allotted: ${cnt(n)} x ${inr(payable(s, 1))} = ${inr(n * payable(s, 1))}. ${ac(allotment)} is debited.`,
        `Its capital part, ${cnt(n)} x ${inr(s.parts[1])} = ${inr(n * s.parts[1])}, is credited to ${ac(capitalId(s.kind))}.`,
        ...(s.premium > 0 ? [`The premium is payable on allotment: ${cnt(n)} x ${inr(s.premium)} = ${inr(n * s.premium)} is credited to Securities Premium A/c.`] : []),
        'No money has come in yet, so Bank A/c is not touched.',
      ],
      distractorAccounts: ['bank', stageId(s.kind, 0, s.parts.length), 'securitiesPremium', 'callsInArrears'],
      hints: H.issue,
    };
  },
  verify: (q) => {
    const s = ISSUES.of(q.prompt);
    return !!s && sameEntry(q.expected, books(s).due[1]);
  },
});

const entryCallDue = journalTemplate({
  id: 'sc-entry-call-due', topicId: T, conceptId: 'sc-issue', difficulty: 'easy', computed: true,
  generate: (rng) => {
    const s = drawIssue(rng, { premium: 'none', kind: rng.pick(['equity', 'equity', 'preference'] as const) });
    const count = s.parts.length;
    const i = rng.int(2, count - 1);
    s.called = i + 1;
    const n = rng.step(20000, 150000, 10000);
    const k = rng.step(100, 900, 100);
    const late = rng.int(0, 1) === 0;
    s.groups = late ? [{ applied: n - k, allotted: n - k, paid: i }, { applied: k, allotted: k, paid: 1 }] : [{ applied: n, allotted: n, paid: i }];
    const call = stageId(s.kind, i, count);
    const prompt =
      `${rng.pick(COMPANIES)} has allotted ${cnt(n)} ${sharesOf(s)}, payable ${terms(s)}. ` +
      `${late ? `The earlier instalments have been received, except ${i === 3 ? 'the allotment money and the first call' : 'the allotment money'} on ${cnt(k)} shares held by ${rng.pick(HOLDERS)}.` : 'The earlier instalments have been received in full.'} ` +
      `The directors now make ${stage(i, count)}. Pass the entry for the call becoming due.`;
    ISSUES.keep(prompt, s);
    return {
      prompt,
      lines: [dr(call, n * s.parts[i]), cr(capitalId(s.kind), n * s.parts[i])],
      explanation: [
        `The call is made on every share allotted${late ? ', the shares with earlier money unpaid among them' : ''}: ${cnt(n)} x ${inr(s.parts[i])} = ${inr(n * s.parts[i])}.`,
        `The money is now due from the shareholders, so ${ac(call)} is debited.`,
        `More of the face value has been called up, so ${ac(capitalId(s.kind))} is credited.`,
      ],
      distractorAccounts: ['bank', 'callsInArrears', 'callsInAdvance', stageId(s.kind, 1, count)],
      hints: H.calls,
    };
  },
  verify: (q) => {
    const s = ISSUES.of(q.prompt);
    return !!s && sameEntry(q.expected, books(s).due[s.called - 1]);
  },
});

const PREMIUM_USES: string[] = [
  'Issuing fully paid bonus shares to the shareholders',
  'Writing off the preliminary expenses of the company',
  'Writing off the expenses of an issue of shares',
  'Writing off the commission paid on an issue of shares',
];
const PREMIUM_MISUSES: [string, string][] = [
  ['Paying a cash dividend to the shareholders', 'Treated the premium as a profit that can be shared out; it is a capital receipt and cannot be paid as dividend.'],
  ['Writing off the loss on sale of a machine', 'Used the premium to absorb an ordinary business loss, which is charged to the Statement of Profit and Loss.'],
  ['Paying the salaries of the staff', 'Used the premium to meet a running expense of the business.'],
  ['Writing off the depreciation of the year', 'Used the premium to absorb depreciation, a normal expense of the year.'],
  ['Writing off bad debts', 'Used the premium to absorb a trading loss, which is charged to the Statement of Profit and Loss.'],
  ['Paying interest on a bank loan', 'Used the premium to meet a finance cost of the year.'],
];
const premiumUses = mcqTemplate({
  id: 'sc-premium-uses', topicId: T, conceptId: 'sc-issue', difficulty: 'easy',
  generate: (rng) => {
    const balance = inr(rng.step(100000, 900000, 50000));
    const co = rng.pick(COMPANIES);
    const hints = ['Securities premium is a capital receipt, not a profit of the year.', 'Section 52 of the Companies Act, 2013 lists the only purposes it may be used for.'];
    if (rng.int(0, 2) > 0) {
      return choice(
        rng.pick([
          `${co} has a balance of ${balance} in Securities Premium A/c. For which of these purposes may the company use it?`,
          `Securities Premium A/c of ${co} shows ${balance}. Which of the following is a use the Companies Act, 2013 allows for this balance?`,
        ]),
        rng.pick(PREMIUM_USES),
        rng.shuffle(PREMIUM_MISUSES),
        'Securities premium may be used only for the purposes in section 52 of the Companies Act, 2013: issuing fully paid bonus shares, writing off preliminary expenses, writing off the expenses, commission or discount on an issue of securities, providing for the premium on redemption of debentures or preference shares, and buying back its own shares.',
        hints,
      );
    }
    const [misuse] = rng.pick(PREMIUM_MISUSES);
    return choice(
      `${co} has a balance of ${balance} in Securities Premium A/c. Which of these is NOT a purpose for which the balance may be used?`,
      misuse,
      rng.shuffle(PREMIUM_USES).map((use): [string, string] => [use, 'Picked a purpose that section 52 of the Companies Act, 2013 does allow.']),
      'Securities premium is a capital receipt. It may be used only for the purposes in section 52 of the Companies Act, 2013, none of which is paying a dividend or meeting an expense or loss of the business.',
      hints,
    );
  },
  verify: (q) => {
    const right = optionText(q) ?? '';
    return q.prompt.includes('NOT') ? PREMIUM_MISUSES.some(([text]) => text === right) : PREMIUM_USES.includes(right);
  },
});

// ===============================================================================================================
// UNDER-SUBSCRIPTION, OVER-SUBSCRIPTION AND PRO RATA ALLOTMENT
// ===============================================================================================================

/** Shares applied for to shares allotted on a pro rata allotment. */
const RATIOS = [[3, 2], [5, 4], [4, 3], [6, 5], [2, 1], [5, 3], [7, 5]];

const underSubscription = numericTemplate({
  id: 'sc-under-subscription', topicId: T, conceptId: 'sc-subscription', difficulty: 'easy', unit: 'rupees',
  generate: (rng) => {
    const s = drawIssue(rng);
    const offered = rng.step(20000, 200000, 10000);
    const taken = offered - (offered * rng.pick([2, 4, 5, 8, 10])) / 100;
    s.groups = [{ applied: taken, allotted: taken, paid: s.parts.length }];
    const [app, allot] = s.parts;
    const p = s.premium;
    const base = `${rng.pick(COMPANIES)} offered ${cnt(offered)} ${sharesOf(s)} ${priced(s)} to the public, payable ${terms(s)}. Applications were received for ${cnt(taken)} shares only. All of them were allotted, and every instalment on them was received in full.`;
    const ask = rng.pick<{ q: string; a: number; errs: [number, string][]; w: string[] }>([
      {
        q: 'How much application money did the company receive?',
        a: taken * app,
        errs: [
          [offered * app, 'Worked on the shares offered; money comes only on the shares applied for.'],
          [(offered - taken) * app, 'Gave the application money on the shares nobody applied for.'],
          [taken * s.face, 'Took the whole face value as received on application.'],
        ],
        w: [`Application money = shares applied for x ${inr(app)} = ${cnt(taken)} x ${inr(app)} = ${inr(taken * app)}.`],
      },
      {
        q: 'How much became due on allotment?',
        a: taken * (allot + p),
        errs: [
          [offered * (allot + p), 'Worked on the shares offered; allotment money is due only on the shares allotted.'],
          [taken * allot, 'Left out the premium, which is payable with the allotment money.'],
          [taken * (app + allot + p), 'Added the application money to the allotment money.'],
        ],
        w: [`Only ${cnt(taken)} shares were allotted, so allotment money = ${cnt(taken)} x ${inr(allot + p)} = ${inr(taken * (allot + p))}.`],
      },
      {
        q: 'What does Share Capital A/c stand at once the last call has been received?',
        a: taken * s.face,
        errs: [
          [offered * s.face, 'Took the shares offered; only the shares applied for were allotted, and the entries are passed for those alone.'],
          [taken * (s.face + p), 'Added the premium, which is kept in Securities Premium A/c.'],
          [(offered - taken) * s.face, 'Gave the face value of the shares that were not taken up.'],
        ],
        w: [`Entries are passed only for the ${cnt(taken)} shares allotted.`, `Share capital = ${cnt(taken)} x ${inr(s.face)} = ${inr(taken * s.face)}.`],
      },
    ]);
    const num = numeric(ask.a, ask.errs);
    const prompt = `${base} ${ask.q}`;
    ISSUES.keep(prompt, s);
    return num && { prompt, ...num, explanation: ask.w, hints: H.issue };
  },
  verify: (q) => {
    const s = ISSUES.of(q.prompt);
    if (!s) return false;
    const b = books(s);
    if (q.prompt.endsWith('company receive?')) return q.answer === lineOf(b.received[0], 'bank', 'Dr');
    if (q.prompt.endsWith('on allotment?')) return q.answer === lineOf(b.due[1], stageId(s.kind, 1, s.parts.length), 'Dr');
    return q.answer === -net(b.ledger, capitalId(s.kind));
  },
});

const minimumSubscription = numericTemplate({
  id: 'sc-minimum-subscription', topicId: T, conceptId: 'sc-subscription', difficulty: 'easy', unit: 'number',
  generate: (rng) => {
    const co = rng.pick(COMPANIES);
    const face = inr(rng.pick([10, 100]));
    const hints = ['The minimum subscription is a fixed percentage of the shares issued.', 'It is 90% of the issue: below that, no share can be allotted.'];
    if (rng.int(0, 2) > 0) {
      const offered = rng.step(20000, 500000, 10000);
      const need = (offered * 9) / 10;
      const num = numeric(need, [
        [offered, 'Thought every share offered must be applied for; 90% of the issue is enough.'],
        [offered / 10, 'Took 10% of the issue; the minimum subscription is 90% of it.'],
        [offered / 2, 'Took half of the issue; the minimum subscription is 90% of it.'],
      ], 1);
      return num && {
        prompt: rng.pick([
          `${co} offers ${cnt(offered)} equity shares of ${face} each to the public through a prospectus. For how many shares, at the least, must applications be received before the company can allot any?`,
          `${co} has issued a prospectus for ${cnt(offered)} equity shares of ${face} each. What is the minimum subscription, as a number of shares, that the issue must receive before allotment can be made?`,
        ]),
        ...num,
        explanation: ['The minimum subscription is 90% of the shares issued.', `90% of ${cnt(offered)} = ${cnt(need)} shares.`, 'If applications fall short of this, no share is allotted and all the application money is returned.'],
        hints,
      };
    }
    const applied = rng.step(18000, 450000, 9000);
    const offered = (applied * 10) / 9;
    const num = numeric(offered, [
      [(applied * 9) / 10, 'Took 90% of the shares applied for; the shares applied for are themselves 90% of the issue.'],
      [applied, 'Took the minimum subscription to be the whole issue; it is 90% of it.'],
      [applied * 10, 'Took the applications to be 10% of the issue; the minimum subscription is 90% of it.'],
    ], 1);
    return num && {
      prompt: `In the public issue of ${co}, applications for ${cnt(applied)} equity shares of ${face} each were exactly the minimum subscription. How many shares had the company offered?`,
      ...num,
      explanation: ['The minimum subscription is 90% of the shares issued.', `Shares issued = ${cnt(applied)} / 90% = ${cnt(offered)}.`],
      hints,
    };
  },
  verify: (q) => {
    const [x] = figures(q.prompt);
    return q.prompt.includes('exactly the minimum') ? q.answer * 9 === x * 10 : q.answer * 10 === x * 9;
  },
});

const subscriptionOutcome = mcqTemplate({
  id: 'sc-subscription-outcome', topicId: T, conceptId: 'sc-subscription', difficulty: 'medium',
  generate: (rng) => {
    const offered = rng.step(20000, 200000, 10000);
    const regime = rng.int(0, 2);
    const applied = (offered * rng.pick([[50, 60, 70, 75, 80, 85], [90, 92, 95, 96, 98], [120, 125, 150, 200, 300]][regime])) / 100;
    const least = (offered * 9) / 10;
    const prompt = `${rng.pick(COMPANIES)} offered ${cnt(offered)} equity shares of ₹10 each to the public through a prospectus. When the list closed, applications had been received for ${cnt(applied)} shares. What follows?`;
    const none = 'No share can be allotted, and all the application money must be returned';
    const forApplied = `${cnt(applied)} shares are allotted, and the entries are passed for ${cnt(applied)} shares only`;
    const hints = ['Compare the shares applied for with 90% of the shares offered, and with the shares offered.', 'Below 90%: no allotment. From 90% up to the issue: allot what was applied for. Above the issue: reject the excess or allot pro rata.'];
    if (regime === 0) {
      return choice(prompt, none, [
        [forApplied, `Allotted on applications below the minimum subscription, which is 90% of the issue: ${cnt(least)} shares here.`],
        [`${cnt(offered)} shares are allotted, and the ${cnt(offered - applied)} not applied for are shown as calls in arrears`, 'Allotted shares nobody applied for; and the minimum subscription was not received in any case.'],
        [`The company keeps the money and waits until the other ${cnt(offered - applied)} shares are applied for`, 'Held on to the application money; when the minimum subscription is not received in the time allowed, the money must go back.'],
      ], `The minimum subscription is 90% of ${cnt(offered)} = ${cnt(least)} shares. Applications for ${cnt(applied)} fall short of it, so the company cannot allot and must return the application money.`, hints);
    }
    if (regime === 1) {
      return choice(prompt, forApplied, [
        [none, `Refused to allot although the applications reach the minimum subscription of 90% of the issue, ${cnt(least)} shares.`],
        [`${cnt(offered)} shares are allotted, and the ${cnt(offered - applied)} not applied for are shown as calls in arrears`, 'Allotted shares nobody applied for; calls in arrears are unpaid calls on shares that have been allotted.'],
        [`${cnt(offered)} shares are allotted, and the entries are passed for all ${cnt(offered)} shares`, 'Passed the entries for the shares offered; only the shares applied for can be allotted.'],
      ], `The minimum subscription is 90% of ${cnt(offered)} = ${cnt(least)} shares, and ${cnt(applied)} is not below it. The issue is under-subscribed: the company allots the ${cnt(applied)} shares applied for and passes its entries for them alone.`, hints);
    }
    return choice(prompt, `${cnt(offered)} shares are allotted: the applications for the other ${cnt(applied - offered)} are refused, or all the applicants are allotted pro rata`, [
      [`${cnt(applied)} shares are allotted, because a company cannot refuse a valid application`, 'Allotted more shares than were offered; a company cannot allot beyond its issue.'],
      [none, 'Treated an over-subscribed issue as a failed one; over-subscription only means that some applicants get fewer shares, or none.'],
      [`${cnt(offered)} shares are allotted, and the money on the other ${cnt(applied - offered)} is credited to Securities Premium A/c`, 'Treated the excess application money as a premium; it is returned or adjusted against the later instalments.'],
    ], `The issue is over-subscribed by ${cnt(applied - offered)} shares. Only the ${cnt(offered)} shares offered can be allotted: the excess applications are refused and refunded, or everyone is allotted pro rata, or both.`, hints);
  },
  verify: (q) => {
    const [offered, , applied] = figures(q.prompt);
    const right = optionText(q) ?? '';
    return applied * 10 < offered * 9 ? right.startsWith('No share') : applied <= offered ? right.startsWith(`${cnt(applied)} shares are allotted, and the entries`) : right.startsWith(`${cnt(offered)} shares are allotted: the applications`);
  },
});

/** An issue for which more shares were applied for than offered, and the applications for the excess refused. */
function drawRefusal(rng: Rng) {
  const s = drawIssue(rng);
  const offered = rng.step(20000, 150000, 10000);
  const refused = rng.step(5000, 60000, 5000);
  s.groups = [{ applied: offered, allotted: offered, paid: s.parts.length }, { applied: refused, allotted: 0, paid: 1 }];
  const text = `${rng.pick(COMPANIES)} issued ${cnt(offered)} ${sharesOf(s)} ${priced(s)}, payable ${terms(s)}. Applications were received for ${cnt(offered + refused)} shares. The directors allotted the ${cnt(offered)} shares in full to some applicants and refused the applications for the other ${cnt(refused)} shares, returning the money paid on them.`;
  return { s, offered, refused, text };
}

const oversubRefund = numericTemplate({
  id: 'sc-oversub-refund', topicId: T, conceptId: 'sc-subscription', difficulty: 'easy', unit: 'rupees',
  generate: (rng) => {
    const { s, offered, refused, text } = drawRefusal(rng);
    const app = s.parts[0];
    const askRefund = rng.int(0, 1) === 0;
    const num = askRefund
      ? numeric(refused * app, [
          [(offered + refused) * app, 'Returned all the application money; the money on the shares allotted is kept.'],
          [offered * app, 'Gave the application money on the shares allotted, which is kept as share capital.'],
          [refused * s.face, 'Returned the whole face value; the applicants had paid only the application money.'],
        ])
      : numeric(offered * app, [
          [(offered + refused) * app, 'Moved all the application money to Share Capital A/c; only the money on the shares allotted is capital.'],
          [refused * app, 'Gave the money returned on the refused applications.'],
          [offered * s.face, 'Credited the whole face value; only the application money has been received so far.'],
        ]);
    const prompt = `${text} ${askRefund ? 'How much was returned to the applicants?' : 'How much of the application money is transferred to Share Capital A/c?'}`;
    ISSUES.keep(prompt, s);
    return num && {
      prompt,
      ...num,
      explanation: [
        `Application money received = ${cnt(offered + refused)} x ${inr(app)} = ${inr((offered + refused) * app)}.`,
        `On the ${cnt(offered)} shares allotted: ${cnt(offered)} x ${inr(app)} = ${inr(offered * app)}, transferred to Share Capital A/c.`,
        `On the ${cnt(refused)} shares refused: ${cnt(refused)} x ${inr(app)} = ${inr(refused * app)}, returned.`,
      ],
      hints: H.issue,
    };
  },
  verify: (q) => {
    const s = ISSUES.of(q.prompt);
    if (!s) return false;
    const b = books(s);
    return q.answer === (q.prompt.endsWith('to the applicants?') ? lineOf(b.transfer, 'bank', 'Cr') : lineOf(b.transfer, capitalId(s.kind), 'Cr'));
  },
});

const entryOversubRefund = journalTemplate({
  id: 'sc-entry-oversub-refund', topicId: T, conceptId: 'sc-subscription', difficulty: 'medium', computed: true,
  generate: (rng) => {
    const { s, offered, refused, text } = drawRefusal(rng);
    const app = s.parts[0];
    const appId = stageId(s.kind, 0, s.parts.length);
    const prompt = `${text} Pass the one entry that deals with all the application money on allotment.`;
    ISSUES.keep(prompt, s);
    return {
      prompt,
      lines: [dr(appId, (offered + refused) * app), cr(capitalId(s.kind), offered * app), cr('bank', refused * app)],
      explanation: [
        `All the application money, ${cnt(offered + refused)} x ${inr(app)} = ${inr((offered + refused) * app)}, leaves ${ac(appId)}: it is debited.`,
        `The money on the ${cnt(offered)} shares allotted, ${inr(offered * app)}, becomes capital: ${ac(capitalId(s.kind))} is credited.`,
        `The money on the ${cnt(refused)} shares refused, ${inr(refused * app)}, is paid back: Bank A/c is credited.`,
      ],
      distractorAccounts: [stageId(s.kind, 1, s.parts.length), 'callsInAdvance', 'securitiesPremium'],
      hints: H.issue,
    };
  },
  verify: (q) => {
    const s = ISSUES.of(q.prompt);
    return !!s && sameEntry(q.expected, books(s).transfer);
  },
});

const prorataShares = numericTemplate({
  id: 'sc-prorata-shares', topicId: T, conceptId: 'sc-subscription', difficulty: 'easy', unit: 'number',
  generate: (rng) => {
    const [a, b] = rng.pick(RATIOS);
    const unit = rng.step(10000, 40000, 5000);
    const t = 10 * rng.int(1, 9);
    const who = rng.pick(HOLDERS);
    const base = `${rng.pick(COMPANIES)} issued ${cnt(b * unit)} equity shares and received applications for ${cnt(a * unit)}. The shares were allotted pro rata to all the applicants.`;
    const hints = ['Pro rata: every applicant gets the same fraction of what was applied for.', 'Shares allotted = shares applied for x (shares issued / shares applied for in all).'];
    if (rng.int(0, 1) === 0) {
      const applied = a * b * t;
      const num = numeric(b * b * t, [
        [applied, 'Allotted every share applied for; in a pro rata allotment each applicant gets only a proportion.'],
        [a * a * t, 'Turned the proportion upside down, so the applicant got more shares than were applied for.'],
        [(a - b) * b * t, 'Gave the shares that were not allotted to the applicant.'],
      ], 1);
      return num && {
        prompt: `${base} ${who} had applied for ${cnt(applied)} shares. How many shares was ${who} allotted?`,
        ...num,
        explanation: [`${cnt(a * unit)} shares applied for : ${cnt(b * unit)} shares allotted = ${a} : ${b}.`, `${who} is allotted ${cnt(applied)} x ${b}/${a} = ${cnt(b * b * t)} shares.`],
        hints,
      };
    }
    const allotted = a * b * t;
    const num = numeric(a * a * t, [
      [allotted, 'Took the shares applied for to be the shares allotted; in a pro rata allotment more shares were applied for.'],
      [b * b * t, 'Turned the proportion upside down, so the shares applied for came out fewer than the shares allotted.'],
      [a * (a - b) * t, 'Gave only the shares applied for in excess of those allotted.'],
    ], 1);
    return num && {
      prompt: `${base} ${who} was allotted ${cnt(allotted)} shares. For how many shares had ${who} applied?`,
      ...num,
      explanation: [`${cnt(a * unit)} shares applied for : ${cnt(b * unit)} shares allotted = ${a} : ${b}.`, `${who} had applied for ${cnt(allotted)} x ${a}/${b} = ${cnt(a * a * t)} shares.`],
      hints,
    };
  },
  verify: (q) => {
    const [issued, applied, x] = figures(q.prompt);
    return q.prompt.endsWith('allotted?') ? q.answer * applied === x * issued : q.answer * issued === x * applied;
  },
});

const prorataExcess = numericTemplate({
  id: 'sc-prorata-excess', topicId: T, conceptId: 'sc-subscription', difficulty: 'medium', unit: 'rupees',
  generate: (rng) => {
    const s = drawIssue(rng);
    const [a, b] = rng.pick(RATIOS);
    const unit = rng.step(5000, 30000, 5000);
    const issued = b * unit;
    const applied = a * unit;
    s.groups = [{ applied, allotted: issued, paid: s.parts.length }];
    const app = s.parts[0];
    const due = issued * payable(s, 1);
    const excess = (applied - issued) * app;
    if (excess >= due) return null;
    const base = `${rng.pick(COMPANIES)} issued ${cnt(issued)} ${sharesOf(s)} ${priced(s)}, payable ${terms(s)}. Applications were received for ${cnt(applied)} shares, and the shares were allotted pro rata to all the applicants. The excess application money was kept towards the sum due on allotment, and the rest of the allotment money was received in full.`;
    const askExcess = rng.int(0, 2) === 0;
    const num = askExcess
      ? numeric(excess, [
          [applied * app, 'Gave all the application money received; the part for the shares allotted is share capital.'],
          [issued * app, 'Gave the application money on the shares allotted, which goes to Share Capital A/c.'],
          [(applied - issued) * payable(s, 1), 'Worked the excess at the allotment rate; the applicants had paid only the application money.'],
        ])
      : numeric(due - excess, [
          [due, 'Ignored the excess application money already in hand; it reduces what is collected on allotment.'],
          [issued * s.parts[1] - excess, 'Left out the premium, which is payable with the allotment money.'],
          [due + excess, 'Added the excess application money instead of deducting it.'],
          [excess, 'Gave the excess application money adjusted, not the cash received.'],
        ]);
    const prompt = `${base} ${askExcess ? 'How much application money was adjusted against the allotment money?' : 'How much cash was received on allotment?'}`;
    ISSUES.keep(prompt, s);
    return num && {
      prompt,
      ...num,
      explanation: [
        `Excess application money = (${cnt(applied)} - ${cnt(issued)}) x ${inr(app)} = ${inr(excess)}, adjusted against allotment.`,
        ...(askExcess ? [] : [`Due on allotment = ${cnt(issued)} x ${inr(payable(s, 1))} = ${inr(due)}.`, `Cash received on allotment = ${inr(due)} - ${inr(excess)} = ${inr(due - excess)}.`]),
      ],
      hints: H.prorata,
    };
  },
  verify: (q) => {
    const s = ISSUES.of(q.prompt);
    if (!s) return false;
    const b = books(s);
    return q.answer === (q.prompt.endsWith('against the allotment money?') ? lineOf(b.transfer, stageId(s.kind, 1, s.parts.length), 'Cr') : lineOf(b.received[1], 'bank', 'Dr'));
  },
});

const entryProrataApplication = journalTemplate({
  id: 'sc-entry-prorata-application', topicId: T, conceptId: 'sc-subscription', difficulty: 'medium', computed: true,
  generate: (rng) => {
    const s = drawIssue(rng);
    const [a, b] = rng.pick(RATIOS);
    const unit = rng.step(5000, 30000, 5000);
    const issued = b * unit;
    const pro = a * unit;
    const refused = rng.int(0, 1) === 0 ? rng.step(2000, 20000, 1000) : 0;
    const app = s.parts[0];
    const excess = (pro - issued) * app;
    if (excess >= issued * payable(s, 1)) return null;
    s.groups = [{ applied: pro, allotted: issued, paid: 1 }, { applied: refused, allotted: 0, paid: 1 }];
    const appId = stageId(s.kind, 0, s.parts.length);
    const allotId = stageId(s.kind, 1, s.parts.length);
    const prompt =
      `${rng.pick(COMPANIES)} issued ${cnt(issued)} ${sharesOf(s)} ${priced(s)}, payable ${terms(s)}. Applications were received for ${cnt(pro + refused)} shares. ` +
      (refused > 0 ? `Applications for ${cnt(refused)} shares were refused and the money on them was returned. The other applicants, for ${cnt(pro)} shares, were allotted the ${cnt(issued)} shares pro rata, ` : `The ${cnt(issued)} shares were allotted pro rata to all the applicants, `) +
      'and their excess application money was kept towards the sum due on allotment. Pass the one entry that deals with all the application money on allotment.';
    ISSUES.keep(prompt, s);
    return {
      prompt,
      lines: entry(dr(appId, (pro + refused) * app), cr(capitalId(s.kind), issued * app), cr(allotId, excess), cr('bank', refused * app)),
      explanation: [
        `All the application money, ${cnt(pro + refused)} x ${inr(app)} = ${inr((pro + refused) * app)}, leaves ${ac(appId)}: it is debited.`,
        `On the ${cnt(issued)} shares allotted, ${cnt(issued)} x ${inr(app)} = ${inr(issued * app)} becomes capital: ${ac(capitalId(s.kind))} is credited.`,
        `The pro rata applicants paid on ${cnt(pro - issued)} shares they did not get: ${cnt(pro - issued)} x ${inr(app)} = ${inr(excess)} is kept for allotment, so ${ac(allotId)} is credited.`,
        ...(refused > 0 ? [`The money on the ${cnt(refused)} shares refused, ${inr(refused * app)}, is paid back: Bank A/c is credited.`] : []),
      ],
      distractorAccounts: ['bank', 'callsInAdvance', 'securitiesPremium', 'callsInArrears'],
      hints: H.prorata,
    };
  },
  verify: (q) => {
    const s = ISSUES.of(q.prompt);
    return !!s && sameEntry(q.expected, books(s).transfer);
  },
});

const entryProrataSurplus = journalTemplate({
  id: 'sc-entry-prorata-surplus', topicId: T, conceptId: 'sc-subscription', difficulty: 'complex', computed: true,
  generate: (rng) => {
    const s = drawIssue(rng, { premium: rng.int(0, 1) === 0 ? 'none' : 'some' });
    const app = s.parts[0];
    const allotment = payable(s, 1);
    // The fewest shares applied for, per share allotted, that leave money over after the whole allotment is covered.
    const m = Math.floor(allotment / app) + 2 + (rng.int(0, 2) === 0 ? 1 : 0);
    if (m > 5) return null;
    const over = (m - 1) * app - allotment;
    const issued = rng.step(10000, 60000, 5000);
    s.surplus = rng.int(0, 1) === 0 && over <= sum(s.parts.slice(2)) ? 'advance' : 'refund';
    s.groups = [{ applied: m * issued, allotted: issued, paid: 1 }];
    const appId = stageId(s.kind, 0, s.parts.length);
    const allotId = stageId(s.kind, 1, s.parts.length);
    const last = s.surplus === 'advance' ? 'callsInAdvance' : 'bank';
    const prompt =
      `${rng.pick(COMPANIES)} issued ${cnt(issued)} ${sharesOf(s)} ${priced(s)}, payable ${terms(s)}. The issue was heavily over-subscribed: applications were received for ${cnt(m * issued)} shares, and the shares were allotted pro rata to all the applicants. ` +
      `The excess application money was used for the sum due on allotment first; ${s.surplus === 'advance' ? 'what was still left over was kept as calls in advance' : 'what was still left over was returned to the applicants'}. Pass the one entry that deals with all the application money on allotment.`;
    ISSUES.keep(prompt, s);
    return {
      prompt,
      lines: [dr(appId, m * issued * app), cr(capitalId(s.kind), issued * app), cr(allotId, issued * allotment), cr(last, issued * over)],
      explanation: [
        `Application money received = ${cnt(m * issued)} x ${inr(app)} = ${inr(m * issued * app)}: ${ac(appId)} is debited with all of it.`,
        `On the ${cnt(issued)} shares allotted, ${cnt(issued)} x ${inr(app)} = ${inr(issued * app)} becomes capital: ${ac(capitalId(s.kind))} is credited.`,
        `Excess = ${inr(m * issued * app)} - ${inr(issued * app)} = ${inr((m - 1) * issued * app)}. The whole sum due on allotment is ${cnt(issued)} x ${inr(allotment)} = ${inr(issued * allotment)}, and the excess covers it: ${ac(allotId)} is credited with ${inr(issued * allotment)}.`,
        `Still left over = ${inr((m - 1) * issued * app)} - ${inr(issued * allotment)} = ${inr(issued * over)}: ${s.surplus === 'advance' ? 'kept for the calls to come, so Calls in Advance A/c is credited' : 'paid back, so Bank A/c is credited'}.`,
      ],
      distractorAccounts: ['bank', 'callsInAdvance', 'securitiesPremium', stageId(s.kind, 2, s.parts.length)],
      hints: H.prorata,
    };
  },
  verify: (q) => {
    const s = ISSUES.of(q.prompt);
    return !!s && sameEntry(q.expected, books(s).transfer);
  },
});

const prorataCombination = numericTemplate({
  id: 'sc-prorata-combination', topicId: T, conceptId: 'sc-subscription', difficulty: 'complex', unit: 'rupees',
  generate: (rng) => {
    const s = drawIssue(rng);
    const [a, b] = rng.pick(RATIOS);
    const unit = rng.step(5000, 20000, 5000);
    const full = rng.step(5000, 30000, 5000);
    const refused = rng.step(2000, 20000, 2000);
    const proShares = b * unit;
    const proApplied = a * unit;
    const issued = full + proShares;
    const app = s.parts[0];
    const rate = payable(s, 1);
    const excess = (proApplied - proShares) * app;
    if (excess >= proShares * rate) return null;
    s.groups = [{ applied: refused, allotted: 0, paid: 1 }, { applied: full, allotted: full, paid: s.parts.length }, { applied: proApplied, allotted: proShares, paid: s.parts.length }];
    const base =
      `${rng.pick(COMPANIES)} issued ${cnt(issued)} ${sharesOf(s)} ${priced(s)}, payable ${terms(s)}. Applications were received for ${cnt(full + proApplied + refused)} shares. ` +
      `Applicants for ${cnt(full)} shares were allotted in full; applicants for ${cnt(proApplied)} shares were allotted the remaining ${cnt(proShares)} shares pro rata; applications for ${cnt(refused)} shares were refused and the money on them was returned. ` +
      'Excess application money of the pro rata applicants was kept towards the sum due on allotment, and the rest of the allotment money was received in full.';
    const ask = rng.int(0, 3);
    const due = issued * rate;
    const num =
      ask === 0
        ? numeric(excess, [
            [excess + refused * app, 'Included the money on the refused applications, which was returned and not adjusted.'],
            [proApplied * app, 'Took all the application money of the pro rata applicants; the part for the shares allotted is share capital.'],
            [(full + proApplied + refused - issued) * rate, 'Worked the excess at the allotment rate, and on the refused applications too.'],
            [proShares * app, 'Gave the application money on the shares allotted pro rata, which goes to Share Capital A/c.'],
          ])
        : ask === 1
          ? numeric(refused * app, [
              [refused * app + excess, 'Returned the excess money of the pro rata applicants as well; it was kept for allotment.'],
              [refused * s.face, 'Returned the whole face value; the applicants had paid only the application money.'],
              [(full + proApplied + refused - issued) * app, 'Returned the money on every share not allotted; the excess of the pro rata applicants was kept for allotment.'],
            ])
          : numeric(due - excess, [
              [due, 'Ignored the excess application money kept from the pro rata applicants.'],
              [due - excess - refused * app, 'Set off the money on the refused applications too, although it had been returned.'],
              [proShares * rate - excess, 'Left out the allotment money on the shares allotted in full.'],
              [issued * s.parts[1] - excess, 'Left out the premium, which is payable with the allotment money.'],
            ]);
    const prompt = `${base} ${['How much application money was adjusted against the allotment money?', 'How much application money was returned?', 'How much cash was received on allotment?', 'How much cash was received on allotment?'][ask]}`;
    ISSUES.keep(prompt, s);
    return num && {
      prompt,
      ...num,
      explanation: [
        `Refused: ${cnt(refused)} x ${inr(app)} = ${inr(refused * app)} returned.`,
        `Pro rata applicants paid on ${cnt(proApplied)} shares and got ${cnt(proShares)}: excess = ${cnt(proApplied - proShares)} x ${inr(app)} = ${inr(excess)}, adjusted against allotment.`,
        `Due on allotment = ${cnt(issued)} x ${inr(rate)} = ${inr(due)}; cash received = ${inr(due)} - ${inr(excess)} = ${inr(due - excess)}.`,
      ],
      hints: H.prorata,
    };
  },
  verify: (q) => {
    const s = ISSUES.of(q.prompt);
    if (!s) return false;
    const b = books(s);
    if (q.prompt.endsWith('against the allotment money?')) return q.answer === lineOf(b.transfer, stageId(s.kind, 1, s.parts.length), 'Cr');
    if (q.prompt.endsWith('was returned?')) return q.answer === lineOf(b.transfer, 'bank', 'Cr');
    return q.answer === lineOf(b.received[1], 'bank', 'Dr');
  },
});

/** One applicant of a pro rata allotment: `b` shares allotted for every `a` applied for. */
function drawApplicant(rng: Rng) {
  const [a, b] = rng.pick(RATIOS);
  const t = 100 * rng.int(1, 9);
  return { a, b, applied: a * t, allotted: b * t, who: rng.pick(HOLDERS) };
}

const prorataHolderDue = numericTemplate({
  id: 'sc-prorata-holder-due', topicId: T, conceptId: 'sc-subscription', difficulty: 'medium', unit: 'rupees',
  generate: (rng) => {
    const s = drawIssue(rng);
    const { a, b, applied, allotted, who } = drawApplicant(rng);
    const app = s.parts[0];
    const rate = payable(s, 1);
    const excess = (applied - allotted) * app;
    const due = allotted * rate - excess;
    if (due <= 0) return null;
    s.groups = [{ applied, allotted, paid: s.parts.length }];
    const base = `${rng.pick(COMPANIES)} issued ${sharesOf(s)} ${priced(s)}, payable ${terms(s)}. The issue was over-subscribed, and every applicant was allotted ${b} shares for every ${a} applied for. Excess application money was kept towards the sum due on allotment. ${who} had applied for ${cnt(applied)} shares.`;
    const askExcess = rng.int(0, 2) === 0;
    const num = askExcess
      ? numeric(excess, [
          [applied * app, 'Gave all the application money paid; the part for the shares allotted is share capital.'],
          [allotted * app, 'Gave the application money on the shares allotted, which goes to Share Capital A/c; the excess is the money on the shares not allotted.'],
          [(applied - allotted) * rate, 'Worked the excess at the allotment rate; the applicant had paid only the application money.'],
        ])
      : numeric(due, [
          [allotted * rate, 'Ignored the excess application money the company already holds.'],
          [applied * rate - excess, `Worked the allotment money on the shares applied for; it is due only on the ${cnt(allotted)} shares allotted.`],
          [allotted * s.parts[1] - excess, 'Left out the premium, which is payable with the allotment money.'],
          [excess, 'Gave the excess application money, not what is still to be paid.'],
        ]);
    const prompt = `${base} ${askExcess ? `How much of ${who}'s application money is adjusted against the allotment money?` : `How much must ${who} still pay on allotment?`}`;
    ISSUES.keep(prompt, s);
    return num && {
      prompt,
      ...num,
      explanation: [
        `Shares allotted to ${who} = ${cnt(applied)} x ${b}/${a} = ${cnt(allotted)}.`,
        `Excess application money = (${cnt(applied)} - ${cnt(allotted)}) x ${inr(app)} = ${inr(excess)}.`,
        ...(askExcess ? [] : [`Due on allotment = ${cnt(allotted)} x ${inr(rate)} = ${inr(allotted * rate)}; still to pay = ${inr(allotted * rate)} - ${inr(excess)} = ${inr(due)}.`]),
      ],
      hints: H.prorata,
    };
  },
  verify: (q) => {
    const s = ISSUES.of(q.prompt);
    if (!s) return false;
    const b = books(s);
    return q.answer === (q.prompt.endsWith('against the allotment money?') ? lineOf(b.transfer, stageId(s.kind, 1, s.parts.length), 'Cr') : lineOf(b.received[1], 'bank', 'Dr'));
  },
});

const prorataAllotmentReceived = numericTemplate({
  id: 'sc-prorata-allotment-received', topicId: T, conceptId: 'sc-subscription', difficulty: 'complex', unit: 'rupees',
  generate: (rng) => {
    const s = drawIssue(rng);
    const { a, b, applied: ownApplied, allotted: k, who } = drawApplicant(rng);
    const unit = rng.step(5000, 30000, 5000);
    const issued = b * unit;
    const applied = a * unit;
    const app = s.parts[0];
    const rate = payable(s, 1);
    const excess = (applied - issued) * app;
    if (excess >= issued * rate) return null;
    const own = (ownApplied - k) * app;
    const unpaid = k * rate - own;
    const cash = issued * rate - excess - unpaid;
    s.groups = [{ applied: applied - ownApplied, allotted: issued - k, paid: s.parts.length }, { applied: ownApplied, allotted: k, paid: 1 }];
    const base =
      `${rng.pick(COMPANIES)} issued ${cnt(issued)} ${sharesOf(s)} ${priced(s)}, payable ${terms(s)}. Applications were received for ${cnt(applied)} shares and the shares were allotted pro rata to all the applicants, the excess application money being kept towards the sum due on allotment. ` +
      `${who}, who was allotted ${cnt(k)} shares, did not pay the allotment money. All the other shareholders paid it in full.`;
    const askCash = rng.int(0, 2) > 0;
    const num = askCash
      ? numeric(cash, [
          [issued * rate - excess, `Forgot that ${who} did not pay.`],
          [issued * rate - excess - k * rate, `Took the whole allotment money on ${who}'s shares as unpaid, although ${who}'s excess application money had already covered part of it.`],
          [(issued - k) * rate, 'Ignored the excess application money altogether.'],
          [issued * rate - unpaid, `Deducted ${who}'s arrears but not the excess application money already held.`],
        ])
      : numeric(unpaid, [
          [k * rate, `Ignored ${who}'s excess application money, which the company had already set against the allotment money.`],
          [own, `Gave ${who}'s excess application money, which is the part of the allotment money that was covered.`],
          [k * s.parts[1] - own, 'Left out the premium, which is payable with the allotment money.'],
          [k * rate - ownApplied * app, `Set off all of ${who}'s application money, the part that is share capital as well.`],
        ]);
    const prompt = `${base} ${askCash ? 'How much cash was received on allotment?' : `How much allotment money is in arrears from ${who}?`}`;
    ISSUES.keep(prompt, s);
    return num && {
      prompt,
      ...num,
      explanation: [
        `${who} was allotted ${cnt(k)} shares, so had applied for ${cnt(k)} x ${a}/${b} = ${cnt(ownApplied)}; excess application money = ${cnt(ownApplied - k)} x ${inr(app)} = ${inr(own)}.`,
        `Due from ${who} on allotment = ${cnt(k)} x ${inr(rate)} = ${inr(k * rate)}; in arrears = ${inr(k * rate)} - ${inr(own)} = ${inr(unpaid)}.`,
        ...(askCash
          ? [
              `Total due on allotment = ${cnt(issued)} x ${inr(rate)} = ${inr(issued * rate)}; total excess application money = ${cnt(applied - issued)} x ${inr(app)} = ${inr(excess)}.`,
              `Cash received = ${inr(issued * rate)} - ${inr(excess)} - ${inr(unpaid)} = ${inr(cash)}.`,
            ]
          : []),
      ],
      hints: H.prorata,
    };
  },
  verify: (q) => {
    const s = ISSUES.of(q.prompt);
    if (!s) return false;
    const b = books(s);
    return q.answer === (q.prompt.endsWith('on allotment?') ? lineOf(b.received[1], 'bank', 'Dr') : net(b.ledger, stageId(s.kind, 1, s.parts.length)));
  },
});

// ===============================================================================================================
// CALLS IN ARREARS AND CALLS IN ADVANCE
// ===============================================================================================================

const callsInArrearsAmount = numericTemplate({
  id: 'sc-calls-in-arrears-amount', topicId: T, conceptId: 'sc-calls', difficulty: 'easy', unit: 'rupees',
  generate: (rng) => {
    const s = drawIssue(rng, { premium: 'none' });
    const count = s.parts.length;
    s.called = 3;
    const n = rng.step(20000, 150000, 10000);
    const [h1, h2] = rng.shuffle(HOLDERS);
    const k1 = rng.step(200, 1500, 100);
    const two = rng.int(0, 1) === 0;
    const k2 = two ? rng.step(100, 900, 100) : 0;
    s.groups = [{ applied: n - k1 - k2, allotted: n - k1 - k2, paid: 3 }, { applied: k1, allotted: k1, paid: 2 }, { applied: k2, allotted: k2, paid: 2 }];
    const c = s.parts[2];
    const base =
      `${rng.pick(COMPANIES)} made ${stage(2, count)} of ${inr(c)} a share on its ${cnt(n)} ${sharesOf(s)}. ` +
      `${two ? `${h1}, who holds ${cnt(k1)} shares, and ${h2}, who holds ${cnt(k2)} shares, did not pay it.` : `${h1}, who holds ${cnt(k1)} shares, did not pay it.`} All the other shareholders paid in full.`;
    const askArrears = rng.int(0, 1) === 0;
    const unpaid = (k1 + k2) * c;
    const num = askArrears
      ? numeric(unpaid, [
          [(n - k1 - k2) * c, 'Gave the call money received, not the part left unpaid.'],
          [(k1 + k2) * s.face, `Took the face value of the shares; only the call of ${inr(c)} a share is unpaid on them.`],
          [n * c, 'Gave the whole call money due, not the part left unpaid.'],
          ...(two ? [[k1 * c, `Left out the shares held by ${h2}.`] as [number, string]] : []),
        ])
      : numeric(n * c - unpaid, [
          [n * c, 'Took the call as received on every share, the defaulted shares among them.'],
          [unpaid, 'Gave the calls in arrears, not the money received.'],
          ...(two ? [[(n - k1) * c, `Deducted the shares of ${h1} only, and not those of ${h2}.`] as [number, string]] : []),
          [n * c - (k1 + k2) * s.face, 'Deducted the face value of the defaulted shares; only the call on them is unpaid.'],
        ]);
    const prompt = `${base} ${askArrears ? 'What is the amount of calls in arrears?' : 'How much was received on the call?'}`;
    ISSUES.keep(prompt, s);
    return num && {
      prompt,
      ...num,
      explanation: [
        `Call money due = ${cnt(n)} x ${inr(c)} = ${inr(n * c)}.`,
        `Calls in arrears = ${cnt(k1 + k2)} x ${inr(c)} = ${inr(unpaid)}.`,
        ...(askArrears ? [] : [`Received = ${inr(n * c)} - ${inr(unpaid)} = ${inr(n * c - unpaid)}.`]),
      ],
      hints: H.calls,
    };
  },
  verify: (q) => {
    const s = ISSUES.of(q.prompt);
    if (!s) return false;
    const b = books(s);
    return q.answer === (q.prompt.endsWith('calls in arrears?') ? net(b.ledger, stageId(s.kind, 2, s.parts.length)) : lineOf(b.received[2], 'bank', 'Dr'));
  },
});

const entryCallReceivedArrears = journalTemplate({
  id: 'sc-entry-call-received-arrears', topicId: T, conceptId: 'sc-calls', difficulty: 'medium', computed: true,
  generate: (rng) => {
    const s = drawIssue(rng, { premium: 'none', kind: rng.pick(['equity', 'equity', 'preference'] as const) });
    const count = s.parts.length;
    const i = rng.int(2, count - 1);
    s.called = i + 1;
    s.arrears = rng.int(0, 1) === 0;
    const n = rng.step(20000, 150000, 10000);
    const k = rng.step(200, 2000, 100);
    s.groups = [{ applied: n - k, allotted: n - k, paid: i + 1 }, { applied: k, allotted: k, paid: i }];
    const c = s.parts[i];
    const call = stageId(s.kind, i, count);
    const prompt =
      `${rng.pick(COMPANIES)} made ${stage(i, count)} of ${inr(c)} a share on its ${cnt(n)} ${sharesOf(s)} and passed the entry for the call becoming due. All the shareholders paid the call except ${rng.pick(HOLDERS)}, who holds ${cnt(k)} shares. ` +
      `${s.arrears ? 'The company keeps a Calls in Arrears A/c, to which unpaid allotment and call money is moved.' : 'The company keeps no Calls in Arrears A/c: an unpaid call is left as a debit balance in the call account.'} Pass the entry for the receipt of the call money.`;
    ISSUES.keep(prompt, s);
    return {
      prompt,
      lines: s.arrears ? [dr('bank', (n - k) * c), dr('callsInArrears', k * c), cr(call, n * c)] : [dr('bank', (n - k) * c), cr(call, (n - k) * c)],
      explanation: s.arrears
        ? [
            `Received on ${cnt(n - k)} shares: ${cnt(n - k)} x ${inr(c)} = ${inr((n - k) * c)}. Bank A/c is debited.`,
            `Unpaid on ${cnt(k)} shares: ${cnt(k)} x ${inr(c)} = ${inr(k * c)}. It is moved to Calls in Arrears A/c, which is debited.`,
            `${ac(call)} is credited with the whole call, ${inr(n * c)}, and so is closed.`,
          ]
        : [
            `Received on ${cnt(n - k)} shares: ${cnt(n - k)} x ${inr(c)} = ${inr((n - k) * c)}. Bank A/c is debited.`,
            `${ac(call)} is credited with the money received only. The unpaid ${inr(k * c)} stays in it as a debit balance: that balance is the calls in arrears.`,
          ],
      distractorAccounts: [capitalId(s.kind), 'callsInAdvance', 'callsInArrears', 'forfeitedShares'],
      hints: H.calls,
    };
  },
  verify: (q) => {
    const s = ISSUES.of(q.prompt);
    return !!s && sameEntry(q.expected, books(s).received[s.called - 1]);
  },
});

const entryCallsInAdvance = journalTemplate({
  id: 'sc-entry-calls-in-advance', topicId: T, conceptId: 'sc-calls', difficulty: 'medium', computed: true,
  generate: (rng) => {
    const s = drawIssue(rng);
    const count = s.parts.length;
    const n = rng.step(20000, 150000, 10000);
    const k = rng.step(200, 2000, 100);
    const who = rng.pick(HOLDERS);
    const call = s.parts[2];
    const rate = payable(s, 1);
    const callId = stageId(s.kind, 2, count);
    const allotId = stageId(s.kind, 1, count);
    const receipt = rng.int(0, 1) === 0;
    const prompt = receipt
      ? `${rng.pick(COMPANIES)} allotted ${cnt(n)} ${sharesOf(s)} ${priced(s)}, payable ${terms(s)}, and passed the entry for the allotment money becoming due. All the allotment money was received. Along with it ${who}, who holds ${cnt(k)} shares, paid ${stage(2, count)} as well, although the call had not been made yet. Pass the entry for the money received.`
      : `${rng.pick(COMPANIES)} has allotted ${cnt(n)} ${sharesOf(s)} ${priced(s)}, payable ${terms(s)}. With the allotment money ${who}, who holds ${cnt(k)} shares, had also paid ${stage(2, count)} before it was made, and the company had credited that money to Calls in Advance A/c. The directors have now made the call and passed the entry for the call becoming due on all the shares. Pass the entry that sets ${who}'s advance against the call.`;
    FACTS.keep(prompt, { n, k, call, rate, receipt: receipt ? 1 : 0 });
    return receipt
      ? {
          prompt,
          lines: [dr('bank', n * rate + k * call), cr(allotId, n * rate), cr('callsInAdvance', k * call)],
          explanation: [
            `Allotment money = ${cnt(n)} x ${inr(rate)} = ${inr(n * rate)}: ${ac(allotId)} is credited and closed.`,
            `${who} paid ${cnt(k)} x ${inr(call)} = ${inr(k * call)} on a call that is not yet due. The company owes this until the call is made: Calls in Advance A/c is credited.`,
            `Bank A/c is debited with all the money received, ${inr(n * rate)} + ${inr(k * call)} = ${inr(n * rate + k * call)}.`,
          ],
          distractorAccounts: [callId, capitalId(s.kind), 'callsInArrears', 'securitiesPremium'],
          hints: H.calls,
        }
      : {
          prompt,
          lines: [dr('callsInAdvance', k * call), cr(callId, k * call)],
          explanation: [
            `The advance is ${cnt(k)} x ${inr(call)} = ${inr(k * call)}.`,
            'The call is now due, so the money is no longer owed back: Calls in Advance A/c is debited.',
            `${who}'s share of the call is treated as paid: ${ac(callId)} is credited. No cash moves, so Bank A/c is not touched.`,
          ],
          distractorAccounts: ['bank', capitalId(s.kind), 'callsInArrears', allotId],
          hints: H.calls,
        };
  },
  verify: (q) => {
    const f = FACTS.of(q.prompt);
    if (!f) return false;
    const advance = f.k * f.call * 100;
    if (!f.receipt) return q.expected.length === 2 && lineOf(q.expected, 'callsInAdvance', 'Dr') === advance;
    return lineOf(q.expected, 'callsInAdvance', 'Cr') === advance && lineOf(q.expected, 'bank', 'Dr') - advance === f.n * f.rate * 100;
  },
});

const callCashReceived = numericTemplate({
  id: 'sc-call-cash-received', topicId: T, conceptId: 'sc-calls', difficulty: 'medium', unit: 'rupees',
  generate: (rng) => {
    const s = drawIssue(rng, { premium: 'none', calls: 2 });
    const n = rng.step(20000, 150000, 10000);
    const [h1, h2] = rng.shuffle(HOLDERS);
    const k1 = rng.step(200, 1500, 100);
    const k2 = rng.step(100, 900, 100);
    const c = s.parts[2];
    const d = s.parts[3];
    const base = `${rng.pick(COMPANIES)} made the first call of ${inr(c)} a share on its ${cnt(n)} ${sharesOf(s)}; the second and final call of ${inr(d)} a share is still to be made. ${h1}, who holds ${cnt(k1)} shares, did not pay the first call.`;
    const early = rng.int(0, 1) === 0;
    const num = early
      ? numeric((n - k1 - k2) * c, [
          [(n - k1) * c, `Counted ${h2}'s call money again; it had come in earlier, with the allotment money.`],
          [n * c, `Took the call as received on every share, although ${h1} did not pay and ${h2} had paid before.`],
          [(n - k2) * c, `Deducted the advance of ${h2} but forgot that ${h1} did not pay.`],
        ])
      : numeric((n - k1) * c + k2 * d, [
          [(n - k1) * c, `Left out the final call money ${h2} paid ahead of time; it is cash received now, credited to Calls in Advance A/c.`],
          [n * c + k2 * d, `Did not deduct the call ${h1} failed to pay.`],
          [(n - k1 - k2) * c + k2 * d, `Left out the first call on ${h2}'s shares, which ${h2} paid along with the final call.`],
          [(n - k1) * c - k2 * d, `Deducted the money ${h2} paid in advance instead of adding it.`],
        ]);
    const prompt = `${base} ${early ? `${h2}, who holds ${cnt(k2)} shares, had already paid this call in advance, with the allotment money. How much cash came in when the first call was made?` : `${h2}, who holds ${cnt(k2)} shares, paid the second and final call along with the first call. How much cash came in with the first call?`}`;
    FACTS.keep(prompt, { n, k1, k2, c, d, early: early ? 1 : 0 });
    return num && {
      prompt,
      ...num,
      explanation: early
        ? [
            `First call due = ${cnt(n)} x ${inr(c)} = ${inr(n * c)}.`,
            `Not received now: ${h1}'s arrears ${cnt(k1)} x ${inr(c)} = ${inr(k1 * c)}, and ${h2}'s ${cnt(k2)} x ${inr(c)} = ${inr(k2 * c)}, which came in earlier and is only moved out of Calls in Advance A/c.`,
            `Cash received = ${inr(n * c)} - ${inr(k1 * c)} - ${inr(k2 * c)} = ${inr((n - k1 - k2) * c)}.`,
          ]
        : [
            `First call received = (${cnt(n)} - ${cnt(k1)}) x ${inr(c)} = ${inr((n - k1) * c)}.`,
            `Calls in advance from ${h2} = ${cnt(k2)} x ${inr(d)} = ${inr(k2 * d)}.`,
            `Cash received = ${inr((n - k1) * c)} + ${inr(k2 * d)} = ${inr((n - k1) * c + k2 * d)}.`,
          ],
      hints: H.calls,
    };
  },
  verify: (q) => {
    const f = FACTS.of(q.prompt);
    if (!f) return false;
    // Holder by holder: the defaulter pays nothing; the holder who pays ahead of time pays either nothing now or both calls.
    const others = (f.n - f.k1 - f.k2) * f.c;
    return q.answer === (others + (f.early ? 0 : f.k2 * (f.c + f.d))) * 100 && q.prompt.includes(cnt(f.k2));
  },
});

// ===============================================================================================================
// ISSUE FOR CONSIDERATION OTHER THAN CASH
// ===============================================================================================================

const BOUGHT = [
  { id: 'machinery', text: 'machinery' },
  { id: 'building', text: 'a building' },
  { id: 'land', text: 'land' },
  { id: 'furniture', text: 'furniture' },
  { id: 'patents', text: 'patents' },
];

/** Shares given to a vendor: the face value, the premium (and how the prompt states it) and a number of shares that divides cleanly. */
function drawVendorShares(rng: Rng, atPar = false) {
  const face = rng.pick([10, 10, 100]);
  const pct = atPar ? 0 : rng.pick(face === 10 ? [10, 20, 30, 40, 50] : [5, 10, 20, 25, 40, 50]);
  const p = (face * pct) / 100;
  const n = (face === 10 ? 6000 : 1000) * rng.int(1, 9);
  const style = rng.int(0, 2);
  const how = atPar ? 'at par' : [`at a premium of ${pct}%`, `at a premium of ${inr(p)} a share`, `at ${inr(face + p)} a share`][style];
  return { face, pct, p, n, how, price: n * (face + p) };
}
/** The premium a share, read back from a prompt written with `drawVendorShares`: `x` is the figure after the face value. */
const premiumFrom = (prompt: string, face: number, x: number): number =>
  prompt.includes('at par') ? 0 : prompt.includes('%') ? (face * x) / 100 : prompt.includes('at a premium of') ? x : x - face;

const vendorShares = numericTemplate({
  id: 'sc-vendor-shares', topicId: T, conceptId: 'sc-vendor', difficulty: 'easy', unit: 'number',
  generate: (rng) => {
    const { face, p, n, how, price } = drawVendorShares(rng);
    const v = rng.pick(VENDORS);
    const num = numeric(n, [
      [price / face, 'Divided the price by the face value; each share is issued at more than its face value, so fewer shares are needed.'],
      [price / p, 'Divided the price by the premium alone, not by the whole issue price of a share.'],
    ], 1);
    return num && {
      prompt: `${rng.pick(COMPANIES)} bought ${rng.pick(BOUGHT).text} for ${inr(price)} from ${v}. The price was paid in full by an issue of equity shares of ${inr(face)} each ${how}. How many shares were issued to ${v}?`,
      ...num,
      explanation: [`Issue price of a share = face value ${inr(face)} + premium ${inr(p)} = ${inr(face + p)}.`, `Number of shares = ${inr(price)} / ${inr(face + p)} = ${cnt(n)}.`],
      hints: H.vendor,
    };
  },
  verify: (q) => {
    const [price, face, x] = figures(q.prompt);
    return q.answer * (face + premiumFrom(q.prompt, face, x)) === price;
  },
});

const entryVendorAsset = journalTemplate({
  id: 'sc-entry-vendor-asset', topicId: T, conceptId: 'sc-vendor', difficulty: 'easy',
  generate: (rng) => {
    const v = rng.pick(VENDORS);
    const items = rng.shuffle(BOUGHT).slice(0, rng.int(1, 2)).map((b) => ({ ...b, cost: rng.step(100000, 900000, 50000) }));
    const total = sum(items.map((b) => b.cost));
    return {
      prompt: `${rng.pick(COMPANIES)} bought ${items.map((b) => `${b.text} for ${inr(b.cost)}`).join(' and ')} from ${v}. Nothing has been paid yet: the price will be settled by an issue of the company's shares. Pass the entry for the purchase.`,
      lines: [...items.map((b) => dr(b.id, b.cost)), cr(vendor(v), total)],
      explanation: [
        ...items.map((b) => `${ac(b.id)} is debited with ${inr(b.cost)}: the asset comes in.`),
        `${v} is credited with ${inr(total)}: the company owes the price to the vendor until the shares are allotted.`,
        'No cash is paid and no share has been issued yet, so neither Bank A/c nor Share Capital A/c is touched.',
      ],
      distractorAccounts: ['bank', 'equityShareCapital', 'securitiesPremium', 'goodwill'],
      hints: ['First record what was bought and who is owed for it; the shares come in a second entry.', 'The vendor is a creditor until the shares are allotted.'],
    };
  },
  verify: (q) => lineOf(q.expected, q.expected.find((l) => l.side === 'Cr')?.accountId ?? '', 'Cr') === sum(figures(q.prompt)) * 100 && q.expected.filter((l) => l.side === 'Cr').length === 1,
});

const entryVendorIssue = journalTemplate({
  id: 'sc-entry-vendor-issue', topicId: T, conceptId: 'sc-vendor', difficulty: 'medium', computed: true,
  generate: (rng) => {
    const { face, p, n, how, price } = drawVendorShares(rng, rng.int(0, 2) === 0);
    const v = rng.pick(VENDORS);
    const asset = rng.pick(BOUGHT);
    return {
      prompt: `${rng.pick(COMPANIES)} bought ${asset.text} for ${inr(price)} from ${v} and has recorded the purchase. It now settles the price in full by allotting to ${v} equity shares of ${inr(face)} each ${how}. Pass the entry for the allotment of the shares.`,
      lines: entry(dr(vendor(v), price), cr('equityShareCapital', n * face), cr('securitiesPremium', n * p)),
      explanation: [
        `Issue price of a share = ${inr(face + p)}, so shares allotted = ${inr(price)} / ${inr(face + p)} = ${cnt(n)}.`,
        `${v} is debited with ${inr(price)}: the amount owed to the vendor is settled.`,
        `Equity Share Capital A/c is credited with the face value, ${cnt(n)} x ${inr(face)} = ${inr(n * face)}.`,
        ...(p > 0 ? [`Securities Premium A/c is credited with the premium, ${cnt(n)} x ${inr(p)} = ${inr(n * p)}.`] : []),
      ],
      distractorAccounts: ['bank', asset.id, 'capitalReserve', 'equityShareAllotment', 'securitiesPremium'],
      hints: H.vendor,
    };
  },
  verify: (q) => {
    const [price, face, x] = figures(q.prompt);
    const p = premiumFrom(q.prompt, face, x);
    const capital = lineOf(q.expected, 'equityShareCapital', 'Cr') / 100;
    return (capital / face) * (face + p) === price && lineOf(q.expected, 'securitiesPremium', 'Cr') / 100 === (capital / face) * p;
  },
});

const TAKEN_OVER = [
  { id: 'building', name: 'Building', min: 300000, max: 900000 },
  { id: 'machinery', name: 'Machinery', min: 200000, max: 800000 },
  { id: 'stock', name: 'Stock', min: 100000, max: 400000 },
  { id: 'furniture', name: 'Furniture', min: 50000, max: 200000 },
  { id: 'debtors', name: 'Debtors', min: 100000, max: 300000 },
];

/** A running business taken over from a vendor: the assets and liabilities at agreed values, and the purchase consideration. */
function drawBusiness(rng: Rng) {
  const v = rng.pick(VENDORS);
  const assets = TAKEN_OVER.filter(() => rng.int(0, 2) > 0).map((a) => ({ ...a, value: rng.step(a.min, a.max, 10000) }));
  const liabilities = [{ id: 'creditors', name: 'Creditors', value: rng.step(50000, 250000, 10000) }];
  if (rng.int(0, 2) === 0) liabilities.push({ id: 'billsPayable', name: 'Bills Payable', value: rng.step(20000, 90000, 10000) });
  const gross = sum(assets.map((a) => a.value));
  const owed = sum(liabilities.map((l) => l.value));
  const gap = rng.step(20000, 150000, 10000);
  const goodwill = rng.int(0, 1) === 0;
  const price = gross - owed + (goodwill ? gap : -gap);
  if (assets.length < 2 || gross - owed - gap < 200000) return null;
  const list = (items: { name: string; value: number }[]): string => items.map((x) => `${x.name} ${inr(x.value)}`).join(', ');
  const text = `${rng.pick(COMPANIES)} took over the running business of ${v} at these agreed values: assets: ${list(assets)}; liabilities: ${list(liabilities)}. The purchase consideration was fixed at ${inr(price)}.`;
  return { v, assets, liabilities, gross, owed, gap, goodwill, price, text };
}

const vendorGoodwill = mcqTemplate({
  id: 'sc-vendor-goodwill', topicId: T, conceptId: 'sc-vendor', difficulty: 'medium',
  generate: (rng) => {
    const b = drawBusiness(rng);
    if (!b) return null;
    const named = (x: number): string => `${x > 0 ? 'Goodwill' : 'Capital reserve'} of ${inr(Math.abs(x))}`;
    const prompt = `${b.text} What arises in the books of the company on this takeover?`;
    FACTS.keep(prompt, { gross: b.gross, owed: b.owed, price: b.price });
    return choice(
      prompt,
      named(b.price - (b.gross - b.owed)),
      [
        [named(b.gross - b.owed - b.price), b.goodwill ? 'Read a price above the net assets as a gain; paying more than the net assets are worth is the cost of goodwill.' : 'Read a price below the net assets as goodwill; getting the net assets for less than they are worth is a capital profit.'],
        ...(b.price === b.gross ? [] : [[named(b.price - b.gross), 'Compared the price with the total of the assets and forgot to deduct the liabilities taken over.'] as [string, string]]),
        ...(b.price === b.gross + b.owed ? [] : [[named(b.price - b.gross - b.owed), 'Added the liabilities taken over to the assets instead of deducting them.'] as [string, string]]),
        [`Neither: the business simply comes into the books at ${inr(b.price)}`, 'Left the difference unrecorded; the assets and liabilities come in at their agreed values, and the difference is goodwill or a capital reserve.'],
      ],
      `Net assets = ${inr(b.gross)} - ${inr(b.owed)} = ${inr(b.gross - b.owed)}. The purchase consideration is ${inr(b.price)}, which is ${b.goodwill ? 'more' : 'less'} by ${inr(b.gap)}: ${b.goodwill ? 'the excess paid is goodwill, debited to Goodwill A/c' : 'the saving is a capital profit, credited to Capital Reserve A/c'}.`,
      H.vendor,
    );
  },
  verify: (q) => {
    const f = FACTS.of(q.prompt);
    if (!f) return false;
    // The takeover entry itself: assets debited, liabilities and the vendor credited; the side that is short names the difference.
    const short = f.gross - (f.owed + f.price);
    return optionText(q) === `${short < 0 ? 'Goodwill' : 'Capital reserve'} of ${inr(Math.abs(short))}` && q.prompt.includes(inr(f.price));
  },
});

const entryBusinessPurchase = journalTemplate({
  id: 'sc-entry-business-purchase', topicId: T, conceptId: 'sc-vendor', difficulty: 'complex', computed: true,
  generate: (rng) => {
    const b = drawBusiness(rng);
    if (!b) return null;
    const prompt = `${b.text} It will be settled later by an issue of shares. Pass the entry for the takeover of the business.`;
    FACTS.keep(prompt, { gross: b.gross, owed: b.owed, price: b.price });
    return {
      prompt,
      lines: entry(
        ...b.assets.map((a) => dr(a.id, a.value)),
        dr('goodwill', b.goodwill ? b.gap : 0),
        ...b.liabilities.map((l) => cr(l.id, l.value)),
        cr(vendor(b.v), b.price),
        cr('capitalReserve', b.goodwill ? 0 : b.gap),
      ),
      explanation: [
        `Each asset taken over is debited at its agreed value (${inr(b.gross)} in all) and each liability is credited (${inr(b.owed)} in all).`,
        `${b.v} is credited with the purchase consideration, ${inr(b.price)}.`,
        `Net assets = ${inr(b.gross)} - ${inr(b.owed)} = ${inr(b.gross - b.owed)}.`,
        b.goodwill
          ? `The price is ${inr(b.gap)} more than the net assets: Goodwill A/c is debited with ${inr(b.gap)}.`
          : `The price is ${inr(b.gap)} less than the net assets: Capital Reserve A/c is credited with ${inr(b.gap)}.`,
      ],
      distractorAccounts: [b.goodwill ? 'capitalReserve' : 'goodwill', 'equityShareCapital', 'bank', 'securitiesPremium'],
      hints: H.vendor,
    };
  },
  verify: (q) => {
    const f = FACTS.of(q.prompt);
    if (!f) return false;
    const difference = f.price - (f.gross - f.owed);
    return lineOf(q.expected, 'goodwill', 'Dr') === Math.max(difference, 0) * 100 && lineOf(q.expected, 'capitalReserve', 'Cr') === Math.max(-difference, 0) * 100;
  },
});

const vendorPartCash = numericTemplate({
  id: 'sc-vendor-part-cash', topicId: T, conceptId: 'sc-vendor', difficulty: 'complex', unit: 'rupees',
  generate: (rng) => {
    const b = drawBusiness(rng);
    if (!b) return null;
    const face = rng.pick([10, 10, 100]);
    const p = (face * rng.pick([20, 25, 50])) / 100;
    if (!Number.isInteger(p)) return null;
    // About two thirds of the price in shares, in whole thousands of shares; the rest by cheque.
    const n = Math.floor((b.price * rng.pick([60, 70, 80])) / 100 / (face + p) / 1000) * 1000;
    const cheque = b.price - n * (face + p);
    if (n <= 0 || cheque <= 0) return null;
    const askPremium = rng.int(0, 1) === 0;
    const inShares = b.price - cheque;
    const num = askPremium
      ? numeric(n * p, [
          [(inShares / face) * p, 'Worked out the number of shares on the face value, although each share is issued above it.'],
          [inShares, 'Gave the whole amount settled in shares; only the premium part of it goes to Securities Premium A/c.'],
          [n * face, 'Gave the face value of the shares, which is credited to Equity Share Capital A/c.'],
          [(b.price / (face + p)) * p, 'Forgot the part of the price paid by cheque and issued shares for the whole consideration.'],
        ])
      : numeric(n * face, [
          [inShares, 'Credited the whole amount settled in shares to share capital; the premium on the shares goes to Securities Premium A/c.'],
          [n * p, 'Gave the premium, which is credited to Securities Premium A/c.'],
          [(b.price / (face + p)) * face, 'Forgot the part of the price paid by cheque and issued shares for the whole consideration.'],
          [b.price, 'Credited the whole purchase consideration to share capital.'],
        ]);
    const prompt = `${b.text} ${b.v} was paid ${inr(cheque)} by cheque and the balance by an issue of equity shares of ${inr(face)} each at a premium of ${inr(p)} a share. ${askPremium ? 'What amount is credited to Securities Premium A/c on this issue?' : 'What amount is credited to Equity Share Capital A/c on this issue?'}`;
    FACTS.keep(prompt, { price: b.price, cheque, face, p });
    return num && {
      prompt,
      ...num,
      explanation: [
        `Amount settled in shares = ${inr(b.price)} - ${inr(cheque)} = ${inr(inShares)}. The values of the assets and liabilities are not needed for this.`,
        `Issue price of a share = ${inr(face)} + ${inr(p)} = ${inr(face + p)}, so shares issued = ${inr(inShares)} / ${inr(face + p)} = ${cnt(n)}.`,
        `Equity Share Capital = ${cnt(n)} x ${inr(face)} = ${inr(n * face)}; Securities Premium = ${cnt(n)} x ${inr(p)} = ${inr(n * p)}.`,
      ],
      hints: H.vendor,
    };
  },
  verify: (q) => {
    const f = FACTS.of(q.prompt);
    if (!f) return false;
    const shares = q.answer / 100 / (q.prompt.includes('Securities Premium A/c on this issue') ? f.p : f.face);
    return shares * (f.face + f.p) + f.cheque === f.price && q.prompt.includes(inr(f.cheque));
  },
});

// ===============================================================================================================
// FORFEITURE
// ===============================================================================================================

const PAID = ['', 'only the application money', 'the application and allotment money', 'everything up to the first call'];
/** The instalments a defaulter did not pay, from instalment `from` to the last one called: "the allotment money and the first call". */
function dues(s: Issue, from: number): string {
  const names: string[] = [];
  for (let i = from; i < s.called; i++) names.push(i === 1 ? 'the allotment money' : stage(i, s.parts.length));
  return names.length === 1 ? names[0] : `${names.slice(0, -1).join(', ')} and ${names.at(-1)}`;
}
const notYet = (s: Issue): string => (s.called < s.parts.length ? ` The ${stageName(s.parts.length - 1, s.parts.length)} has not been made yet.` : '');
const arrearsNote = (s: Issue): string =>
  s.arrears ? 'The unpaid amounts had been moved to Calls in Arrears A/c.' : 'The company keeps no Calls in Arrears A/c: the unpaid amounts stand as debit balances in the accounts of those instalments.';
/** The credits that clear what a defaulter owed on `k` shares, less `covered` already set against the allotment money. */
function unpaidCredits(s: Issue, k: number, paid: number, covered = 0): JournalLine[] {
  const owed = s.parts.map((_, i) => (i >= paid && i < s.called ? k * payable(s, i) - (i === 1 ? covered : 0) : 0));
  return s.arrears ? [cr('callsInArrears', sum(owed))] : entry(...owed.map((o, i) => cr(stageId(s.kind, i, s.parts.length), o)));
}
const unpaidNote = (s: Issue, total: number): string =>
  s.arrears ? `The unpaid ${inr(total)} is taken out of Calls in Arrears A/c, which is credited.` : `The unpaid ${inr(total)} is cleared from the accounts in which it stands as a debit balance: each is credited with its own unpaid amount.`;

/** One shareholder who stopped paying, and whose shares are forfeited. `fully`: every call has been made. */
function drawDefault(rng: Rng, premium?: 'none' | 'some', fully = false, lean = false) {
  const s = drawIssue(rng, premium ? { premium } : {});
  const n = s.parts.length;
  s.called = fully ? n : rng.int(3, n);
  // `lean`: two times in three the holder stops after the application money, so that the premium is unpaid too.
  const paid = lean && rng.int(0, 2) > 0 ? 1 : rng.int(1, s.called - 1);
  const k = rng.step(100, 2000, 100);
  const who = rng.pick(HOLDERS);
  s.arrears = rng.int(0, 1) === 0;
  s.groups = [{ applied: k, allotted: k, paid, forfeited: true }];
  const calledUp = sum(s.parts.slice(0, s.called));
  /** What the holder paid towards capital, a share. */
  const kept = sum(s.parts.slice(0, paid));
  const premiumLost = s.premium > 0 && paid < 2;
  const unpaid = k * (calledUp - kept) + (premiumLost ? k * s.premium : 0);
  const story = `${who} holds ${cnt(k)} ${sharesOf(s)}, issued ${priced(s)} and payable ${terms(s)}. ${paid === 1 ? `${who} paid the application money only: ${dues(s, 1)} remained unpaid.` : `${who} paid ${PAID[paid]} but did not pay ${dues(s, paid)}.`}${notYet(s)} The directors forfeited the shares.`;
  return { s, n, k, who, paid, calledUp, kept, premiumLost, unpaid, story };
}

const forfeitAmount = numericTemplate({
  id: 'sc-forfeit-amount', topicId: T, conceptId: 'sc-forfeiture', difficulty: 'easy', unit: 'rupees',
  generate: (rng) => {
    const d = drawDefault(rng, 'none');
    const { s, k, calledUp, kept } = d;
    const askKept = rng.int(0, 1) === 0;
    const num = askKept
      ? numeric(k * kept, [
          [k * calledUp, 'Gave the amount called up, which is the debit to Share Capital A/c; Forfeited Shares A/c takes only what was received.'],
          [k * (calledUp - kept), 'Gave the amount left unpaid; Forfeited Shares A/c is credited with what was received.'],
          [k * s.face, 'Took the full face value of the shares.'],
        ])
      : numeric(k * calledUp, [
          [k * s.face, `Debited the full face value, although only ${inr(calledUp)} a share has been called up.`],
          [k * kept, 'Debited only what the holder had paid; the debit is the amount called up on the shares.'],
          [k * (calledUp - kept), 'Debited only the amount left unpaid.'],
        ]);
    const prompt = `${d.story} ${askKept ? 'What amount is credited to Forfeited Shares A/c?' : 'By how much is Share Capital A/c debited on the forfeiture?'}`;
    ISSUES.keep(prompt, s);
    return num && {
      prompt,
      ...num,
      explanation: [
        `Called up on the shares = ${cnt(k)} x ${inr(calledUp)} = ${inr(k * calledUp)}: Share Capital A/c is debited with this.`,
        `Received on them = ${cnt(k)} x ${inr(kept)} = ${inr(k * kept)}: Forfeited Shares A/c is credited with this.`,
        `The difference, ${inr(k * (calledUp - kept))}, is the unpaid money, which is credited to close it.`,
      ],
      hints: H.forfeit,
    };
  },
  verify: (q) => {
    const s = ISSUES.of(q.prompt);
    if (!s) return false;
    const b = books(s);
    return q.answer === (q.prompt.endsWith('Forfeited Shares A/c?') ? lineOf(b.forfeiture, 'forfeitedShares', 'Cr') : lineOf(b.forfeiture, capitalId(s.kind), 'Dr'));
  },
});

const entryForfeiturePar = journalTemplate({
  id: 'sc-entry-forfeiture-par', topicId: T, conceptId: 'sc-forfeiture', difficulty: 'medium', computed: true,
  generate: (rng) => {
    const d = drawDefault(rng, 'none');
    const { s, k, calledUp, kept } = d;
    const prompt = `${d.story} ${arrearsNote(s)} Pass the entry for the forfeiture.`;
    ISSUES.keep(prompt, s);
    return {
      prompt,
      lines: [dr(capitalId(s.kind), k * calledUp), cr('forfeitedShares', k * kept), ...unpaidCredits(s, k, d.paid)],
      explanation: [
        `Called up on the shares = ${cnt(k)} x ${inr(calledUp)} = ${inr(k * calledUp)}: ${ac(capitalId(s.kind))} is debited with it${s.called < d.n ? ', not with the face value' : ''}.`,
        `Received on them = ${cnt(k)} x ${inr(kept)} = ${inr(k * kept)}: Forfeited Shares A/c is credited.`,
        unpaidNote(s, d.unpaid),
      ],
      distractorAccounts: ['bank', 'securitiesPremium', 'capitalReserve', s.arrears ? stageId(s.kind, 2, d.n) : 'callsInArrears'],
      hints: H.forfeit,
    };
  },
  verify: (q) => {
    const s = ISSUES.of(q.prompt);
    return !!s && sameEntry(q.expected, books(s).forfeiture);
  },
});

const forfeitPremiumDebit = mcqTemplate({
  id: 'sc-forfeit-premium-debit', topicId: T, conceptId: 'sc-forfeiture', difficulty: 'medium',
  generate: (rng) => {
    const d = drawDefault(rng, 'some');
    const { s, k, calledUp } = d;
    const nil = 'It is not debited at all';
    const premium = inr(k * s.premium);
    const prompt = `${d.story} By how much is Securities Premium A/c debited on the forfeiture?`;
    ISSUES.keep(prompt, s);
    return choice(
      prompt,
      d.premiumLost ? premium : nil,
      [
        d.premiumLost
          ? [nil, 'Left the premium standing in Securities Premium A/c although it was never received on these shares.']
          : [premium, 'Took back the premium although it had come in with the allotment money; a premium that has been received is not cancelled on forfeiture.'],
        [inr(k * payable(s, 1)), d.premiumLost ? 'Debited the whole allotment money; only the premium part of it belongs to Securities Premium A/c.' : 'Debited the whole allotment money, which had in fact been received.'],
        [inr(k * (calledUp + s.premium)), 'Debited everything called on the shares, the premium with it; the capital part is debited to Share Capital A/c.'],
        [inr(k * (calledUp - d.kept)), 'Debited the unpaid capital; that is part of the debit to Share Capital A/c and has nothing to do with the premium.'],
      ],
      d.premiumLost
        ? `The premium of ${inr(s.premium)} a share was payable with the allotment money, which ${d.who} never paid. It was credited to Securities Premium A/c when the allotment fell due, so it is now debited: ${cnt(k)} x ${inr(s.premium)} = ${premium}.`
        : `The premium was payable with the allotment money, and ${d.who} paid that. A premium that has been received stays in Securities Premium A/c, so the account is not debited.`,
      H.forfeit,
    );
  },
  verify: (q) => {
    const s = ISSUES.of(q.prompt);
    if (!s) return false;
    const back = lineOf(books(s).forfeiture, 'securitiesPremium', 'Dr');
    return optionText(q) === (back === 0 ? 'It is not debited at all' : formatINR(back));
  },
});

const entryForfeiturePremium = journalTemplate({
  id: 'sc-entry-forfeiture-premium', topicId: T, conceptId: 'sc-forfeiture', difficulty: 'complex', computed: true,
  generate: (rng) => {
    const d = drawDefault(rng, 'some', false, true);
    const { s, k, calledUp, kept } = d;
    const prompt = `${d.story} ${arrearsNote(s)} Pass the entry for the forfeiture.`;
    ISSUES.keep(prompt, s);
    return {
      prompt,
      lines: entry(dr(capitalId(s.kind), k * calledUp), dr('securitiesPremium', d.premiumLost ? k * s.premium : 0), cr('forfeitedShares', k * kept), ...unpaidCredits(s, k, d.paid)),
      explanation: [
        `Called up on the shares, premium apart = ${cnt(k)} x ${inr(calledUp)} = ${inr(k * calledUp)}: ${ac(capitalId(s.kind))} is debited with it${s.called < d.n ? ', not with the face value' : ''}.`,
        d.premiumLost
          ? `The premium, ${cnt(k)} x ${inr(s.premium)} = ${inr(k * s.premium)}, was due with the allotment money and never came in: Securities Premium A/c is debited to cancel it.`
          : 'The premium came in with the allotment money, so Securities Premium A/c is not touched.',
        `Received towards capital = ${cnt(k)} x ${inr(kept)} = ${inr(k * kept)}: Forfeited Shares A/c is credited.`,
        unpaidNote(s, d.unpaid),
      ],
      distractorAccounts: ['bank', 'securitiesPremium', 'capitalReserve', s.arrears ? stageId(s.kind, 1, d.n) : 'callsInArrears'],
      hints: H.forfeit,
    };
  },
  verify: (q) => {
    const s = ISSUES.of(q.prompt);
    return !!s && sameEntry(q.expected, books(s).forfeiture);
  },
});

/**
 * A shareholder of a pro rata allotment whose shares are forfeited. Mode 0: an issue at par, nothing paid after the
 * application. Mode 1: a premium issue, the allotment money paid and a call not paid (the pro rata allotment then
 * changes nothing). Mode 2: a premium issue, nothing paid after the application; the prompt says that the excess
 * application money is set against the capital part of the allotment money, so the whole premium is unpaid.
 */
function drawProrataDefault(rng: Rng, fully: boolean, modes: number[]) {
  const mode = rng.pick(modes);
  const s = drawIssue(rng, { premium: mode === 0 ? 'none' : 'some' });
  const n = s.parts.length;
  const { a, b, applied, allotted: k, who } = drawApplicant(rng);
  s.called = fully ? n : rng.int(3, n);
  s.arrears = rng.int(0, 1) === 0;
  const paid = mode === 1 ? rng.int(2, s.called - 1) : 1;
  const app = s.parts[0];
  const excess = (applied - k) * app;
  // The excess must leave something unpaid on allotment, and in mode 2 must fit inside its capital part.
  if (excess >= k * (mode === 1 ? payable(s, 1) : s.parts[1])) return null;
  s.groups = [{ applied, allotted: k, paid, forfeited: true }];
  const calledUp = sum(s.parts.slice(0, s.called));
  const covered = paid === 1 ? excess : 0;
  /** What the company keeps in Forfeited Shares A/c, in all. */
  const kept = paid === 1 ? applied * app : k * sum(s.parts.slice(0, paid));
  const premiumLost = mode === 2;
  const unpaid = k * calledUp + (premiumLost ? k * s.premium : 0) - kept;
  const story =
    `${rng.pick(COMPANIES)} issued ${sharesOf(s)} ${priced(s)}, payable ${terms(s)}. The issue was over-subscribed and every applicant was allotted ${b} shares for every ${a} applied for, the excess application money being kept towards the sum due on allotment. ` +
    `${who}, who was allotted ${cnt(k)} shares, ${paid === 1 ? `paid nothing after the application money: ${dues(s, 1)} remained unpaid` : `paid ${paid === 2 ? 'the allotment money' : 'the allotment money and the first call'} but did not pay ${dues(s, paid)}`}.${notYet(s)} The directors forfeited these shares.` +
    (mode === 2 ? ' The excess application money is treated as set against the capital part of the allotment money, so the whole premium on these shares is unpaid.' : '');
  return { s, n, a, b, k, who, applied, paid, app, excess, covered, calledUp, kept, premiumLost, unpaid, mode, story };
}

const entryProrataForfeiture = journalTemplate({
  id: 'sc-entry-prorata-forfeiture', topicId: T, conceptId: 'sc-forfeiture', difficulty: 'complex', computed: true,
  generate: (rng) => {
    const d = drawProrataDefault(rng, false, [0, 1, 2]);
    if (!d) return null;
    const { s, k } = d;
    const prompt = `${d.story} ${arrearsNote(s)} Pass the entry for the forfeiture.`;
    ISSUES.keep(prompt, s);
    return {
      prompt,
      lines: entry(dr(capitalId(s.kind), k * d.calledUp), dr('securitiesPremium', d.premiumLost ? k * s.premium : 0), cr('forfeitedShares', d.kept), ...unpaidCredits(s, k, d.paid, d.covered)),
      explanation: [
        `${d.who} applied for ${cnt(k)} x ${d.a}/${d.b} = ${cnt(d.applied)} shares and paid ${cnt(d.applied)} x ${inr(d.app)} = ${inr(d.applied * d.app)} on application; ${inr(d.excess)} of it was excess, set against the allotment money.`,
        `Called up on the shares${s.premium > 0 ? ', premium apart' : ''} = ${cnt(k)} x ${inr(d.calledUp)} = ${inr(k * d.calledUp)}: ${ac(capitalId(s.kind))} is debited.`,
        ...(d.premiumLost ? [`The premium, ${cnt(k)} x ${inr(s.premium)} = ${inr(k * s.premium)}, is unpaid: Securities Premium A/c is debited to cancel it.`] : s.premium > 0 ? ['The premium came in with the allotment money, so Securities Premium A/c is not touched.'] : []),
        d.paid === 1
          ? `Received from ${d.who} towards capital = the whole application money, ${inr(d.kept)}${d.premiumLost ? ' (its excess met the capital part of the allotment money, none of the premium)' : ''}: Forfeited Shares A/c is credited with it.`
          : `Received towards capital = ${cnt(k)} x ${inr(sum(s.parts.slice(0, d.paid)))} = ${inr(d.kept)}: Forfeited Shares A/c is credited. (The excess application money only reduced the cash ${d.who} paid on allotment.)`,
        ...(d.paid === 1 ? [`Unpaid on allotment = ${cnt(k)} x ${inr(payable(s, 1))} - ${inr(d.excess)} = ${inr(k * payable(s, 1) - d.excess)}.`] : []),
        unpaidNote(s, d.unpaid),
      ],
      distractorAccounts: ['bank', 'securitiesPremium', 'capitalReserve', s.arrears ? stageId(s.kind, 1, d.n) : 'callsInArrears', stageId(s.kind, 0, d.n)],
      hints: H.forfeit,
    };
  },
  verify: (q) => {
    const s = ISSUES.of(q.prompt);
    return !!s && sameEntry(q.expected, books(s).forfeiture);
  },
});

// ===============================================================================================================
// REISSUE OF FORFEITED SHARES AND CAPITAL RESERVE
// ===============================================================================================================

/** A price for reissuing fully paid shares on which `kept` a share was forfeited: below par (within the limit), at par or above it. */
function drawReissuePrice(rng: Rng, s: Issue, kept: number, allow: ('discount' | 'par' | 'premium')[]): number | null {
  const unit = s.face / 10;
  const how = rng.pick(allow);
  if (how === 'par') return s.face;
  if (how === 'premium') return s.face + unit * rng.int(1, 2);
  // The discount stays below the amount forfeited, so that a gain is left.
  const most = Math.ceil(kept / unit) - 1;
  return most < 1 ? null : s.face - unit * rng.int(1, Math.min(most, 4));
}
/** A part of `k` forfeited shares, in round numbers: a half, a quarter, three quarters, two fifths or three fifths. */
const somePart = (rng: Rng, k: number): number => (k * rng.pick([50, 25, 75, 40, 60])) / 100;

const reissueMaxDiscount = numericTemplate({
  id: 'sc-reissue-max-discount', topicId: T, conceptId: 'sc-reissue', difficulty: 'easy', unit: 'rupees',
  generate: (rng) => {
    const d = drawDefault(rng, 'none', true);
    const { s, k, kept } = d;
    const base = `${rng.pick(COMPANIES)} forfeited ${cnt(k)} ${sharesOf(s)}, issued at par, on which ${inr(kept)} a share had been received; the rest of the face value had been called but not paid. The shares are to be reissued as fully paid.`;
    const askPrice = kept * 2 !== s.face && rng.int(0, 1) === 0;
    const num = askPrice
      ? numeric(s.face - kept, [
          [kept, 'Gave the largest discount that can be allowed, not the lowest price.'],
          [s.face, 'Thought forfeited shares cannot be reissued below face value; a discount up to the amount forfeited is allowed.'],
        ])
      : numeric(k * kept, [
          [k * (s.face - kept), 'Gave the amount that was unpaid on the shares; the limit is the amount forfeited on them.'],
          [k * s.face, 'Took the full face value of the shares as the limit.'],
        ]);
    const prompt = `${base} ${askPrice ? 'What is the lowest price a share at which they can be reissued?' : 'What is the largest discount, in all, that can be allowed on reissuing all of them?'}`;
    ISSUES.keep(prompt, s);
    return num && {
      prompt,
      ...num,
      explanation: askPrice
        ? [`The discount on reissue cannot be more than the amount forfeited, ${inr(kept)} a share.`, `Lowest price = ${inr(s.face)} - ${inr(kept)} = ${inr(s.face - kept)} a share: with the ${inr(kept)} already held, the company still gets the full face value.`]
        : [`The discount on reissue cannot be more than the amount forfeited on the shares, ${inr(kept)} a share.`, `Largest discount = ${cnt(k)} x ${inr(kept)} = ${inr(k * kept)}.`],
      hints: H.reissue,
    };
  },
  verify: (q) => {
    const s = ISSUES.of(q.prompt);
    if (!s) return false;
    const held = lineOf(books(s).forfeiture, 'forfeitedShares', 'Cr');
    const k = s.groups[0].allotted;
    return q.prompt.endsWith('can be reissued?') ? q.answer === s.face * 100 - held / k : q.answer === held;
  },
});

const reissueCapitalReserveAll = numericTemplate({
  id: 'sc-reissue-capital-reserve-all', topicId: T, conceptId: 'sc-reissue', difficulty: 'medium', unit: 'rupees',
  generate: (rng) => {
    const d = drawDefault(rng, undefined, true);
    const { s, k, kept } = d;
    const price = drawReissuePrice(rng, s, kept, ['discount', 'discount', 'par', 'premium']);
    if (price === null) return null;
    const off = Math.max(s.face - price, 0);
    const over = Math.max(price - s.face, 0);
    const gain = k * kept - k * off;
    s.groups[0].reissued = k;
    s.groups[0].price = price;
    const num = numeric(gain, [
      ...(off > 0
        ? ([
            [k * kept, 'Transferred the whole amount forfeited and forgot the discount allowed on reissue.'],
            [k * off, 'Gave the discount allowed on reissue, not the gain left after it.'],
            [k * kept + k * off, 'Added the discount on reissue instead of deducting it.'],
          ] as [number, string][])
        : []),
      ...(over > 0
        ? ([
            [k * kept + k * over, 'Added the premium received on reissue; that premium goes to Securities Premium A/c.'],
            [k * over, 'Gave the premium received on reissue, which goes to Securities Premium A/c.'],
          ] as [number, string][])
        : []),
      [k * price, 'Gave the cash received on reissue.'],
      [k * (s.face - kept), 'Gave the capital that had been left unpaid on the shares, not the amount forfeited.'],
      ...(s.premium > 0 ? [[k * (kept + s.premium) - k * off, 'Counted the securities premium as part of the amount forfeited; Forfeited Shares A/c holds only what was received towards capital.'] as [number, string]] : []),
    ]);
    const prompt = `${d.story} Later all of them were reissued at ${inr(price)} a share, fully paid. What amount is transferred to Capital Reserve?`;
    ISSUES.keep(prompt, s);
    return num && {
      prompt,
      ...num,
      explanation: [
        `Amount forfeited = received towards capital = ${cnt(k)} x ${inr(kept)} = ${inr(k * kept)}.`,
        off > 0
          ? `Discount on reissue = ${cnt(k)} x (${inr(s.face)} - ${inr(price)}) = ${inr(k * off)}, debited to Forfeited Shares A/c.`
          : over > 0
            ? `The shares were reissued above face value: no discount, and the extra ${inr(k * over)} goes to Securities Premium A/c.`
            : 'The shares were reissued at face value: there is no discount.',
        off > 0 ? `Capital Reserve = ${inr(k * kept)} - ${inr(k * off)} = ${inr(gain)}.` : `Capital Reserve = the whole amount forfeited = ${inr(gain)}.`,
      ],
      hints: H.reissue,
    };
  },
  verify: (q) => {
    const s = ISSUES.of(q.prompt);
    return !!s && q.answer === -net(books(s).ledger, 'capitalReserve');
  },
});

/** Forfeited shares of an issue at par, a share of them (or all) reissued as fully paid. */
function drawReissue(rng: Rng, allow: ('discount' | 'par' | 'premium')[]) {
  const d = drawDefault(rng, 'none', true);
  const price = drawReissuePrice(rng, d.s, d.kept, allow);
  if (price === null) return null;
  const j = rng.int(0, 2) === 0 ? d.k : somePart(rng, d.k);
  d.s.groups[0].reissued = j;
  d.s.groups[0].price = price;
  const text = `${rng.pick(COMPANIES)} forfeited ${cnt(d.k)} ${sharesOf(d.s)}, issued at par, on which ${inr(d.kept)} a share had been received.`;
  return { ...d, price, j, text, some: j === d.k ? 'all of them' : `${cnt(j)} of them` };
}

const entryReissue = journalTemplate({
  id: 'sc-entry-reissue', topicId: T, conceptId: 'sc-reissue', difficulty: 'medium', computed: true,
  generate: (rng) => {
    const d = drawReissue(rng, ['discount', 'discount', 'par', 'premium']);
    if (!d) return null;
    const { s, j, price } = d;
    const prompt = `${d.text} It now reissues ${d.some} at ${inr(price)} a share, fully paid. Pass the entry for the reissue.`;
    ISSUES.keep(prompt, s);
    return {
      prompt,
      lines: entry(dr('bank', j * price), dr('forfeitedShares', j * Math.max(s.face - price, 0)), cr(capitalId(s.kind), j * s.face), cr('securitiesPremium', j * Math.max(price - s.face, 0))),
      explanation: [
        `Cash received = ${cnt(j)} x ${inr(price)} = ${inr(j * price)}: Bank A/c is debited.`,
        `The shares are reissued as fully paid, so ${ac(capitalId(s.kind))} is credited with the face value, ${cnt(j)} x ${inr(s.face)} = ${inr(j * s.face)}.`,
        price < s.face
          ? `The shortfall, ${cnt(j)} x ${inr(s.face - price)} = ${inr(j * (s.face - price))}, is the discount on reissue. It is met out of the amount forfeited: Forfeited Shares A/c is debited.`
          : price > s.face
            ? `The extra ${cnt(j)} x ${inr(price - s.face)} = ${inr(j * (price - s.face))} is a premium: Securities Premium A/c is credited. Forfeited Shares A/c is not touched by this entry.`
            : 'There is no discount, so Forfeited Shares A/c is not touched by this entry.',
      ],
      distractorAccounts: ['capitalReserve', 'forfeitedShares', 'securitiesPremium', 'callsInArrears'],
      hints: H.reissue,
    };
  },
  verify: (q) => {
    const s = ISSUES.of(q.prompt);
    return !!s && sameEntry(q.expected, books(s).reissue);
  },
});

const entryCapitalReserve = journalTemplate({
  id: 'sc-entry-capital-reserve', topicId: T, conceptId: 'sc-reissue', difficulty: 'medium', computed: true,
  generate: (rng) => {
    const d = drawReissue(rng, ['discount', 'discount', 'par']);
    if (!d) return null;
    const { s, j, k, kept, price } = d;
    const gain = j * kept - j * (s.face - price);
    const prompt = `${d.text} It has reissued ${d.some} at ${inr(price)} a share, fully paid, and has passed the entry for the reissue. Pass the entry that transfers the gain on the reissued shares to Capital Reserve.`;
    ISSUES.keep(prompt, s);
    return {
      prompt,
      lines: [dr('forfeitedShares', gain), cr('capitalReserve', gain)],
      explanation: [
        `Forfeited on the ${cnt(j)} shares reissued = ${cnt(j)} x ${inr(kept)} = ${inr(j * kept)}${j < k ? `; the ${inr((k - j) * kept)} on the other ${cnt(k - j)} shares stays in Forfeited Shares A/c` : ''}.`,
        price < s.face ? `Discount allowed on reissue = ${cnt(j)} x ${inr(s.face - price)} = ${inr(j * (s.face - price))}.` : 'No discount was allowed on reissue.',
        `Gain = ${price < s.face ? `${inr(j * kept)} - ${inr(j * (s.face - price))} = ` : ''}${inr(gain)}: Forfeited Shares A/c is debited and Capital Reserve A/c is credited.`,
      ],
      distractorAccounts: ['bank', capitalId(s.kind), 'securitiesPremium', 'generalReserve', 'statementOfProfitAndLoss'],
      hints: H.reissue,
    };
  },
  verify: (q) => {
    const s = ISSUES.of(q.prompt);
    return !!s && sameEntry(q.expected, books(s).reserve);
  },
});

const reissueCapitalReservePart = numericTemplate({
  id: 'sc-reissue-capital-reserve-part', topicId: T, conceptId: 'sc-reissue', difficulty: 'complex', unit: 'rupees',
  generate: (rng) => {
    const d = drawDefault(rng, undefined, true);
    const { s, k, kept } = d;
    const price = drawReissuePrice(rng, s, kept, ['discount', 'discount', 'discount', 'par']);
    if (price === null) return null;
    const j = somePart(rng, k);
    const off = s.face - price;
    const gain = j * kept - j * off;
    s.groups[0].reissued = j;
    s.groups[0].price = price;
    const askGain = rng.int(0, 2) > 0;
    const num = askGain
      ? numeric(gain, [
          [k * kept - j * off, `Transferred the whole amount forfeited, although only ${cnt(j)} of the ${cnt(k)} shares were reissued.`],
          [j * kept, 'Forgot the discount allowed on reissue.'],
          [(k - j) * kept, 'Gave the amount that stays in Forfeited Shares A/c for the shares not yet reissued.'],
          [j * off, 'Gave the discount allowed on reissue, not the gain left after it.'],
          ...(d.premiumLost ? [[j * (kept + s.premium) - j * off, 'Counted the unpaid premium as part of the amount forfeited; only money actually received is forfeited.'] as [number, string]] : []),
        ])
      : numeric((k - j) * kept, [
          [k * kept, 'Gave the balance before the reissue.'],
          [k * kept - j * off, 'Deducted only the discount and left the gain on the reissued shares in the account.'],
          [gain, 'Gave the gain transferred to Capital Reserve, not what stays behind.'],
          [(k - j) * s.face, 'Took the face value of the shares not yet reissued; only what was received on them stays in the account.'],
        ]);
    const prompt = `${d.story} Later ${cnt(j)} of them were reissued at ${inr(price)} a share, fully paid. ${askGain ? 'What amount is transferred to Capital Reserve?' : 'What balance is left in Forfeited Shares A/c after the transfer to Capital Reserve?'}`;
    ISSUES.keep(prompt, s);
    return num && {
      prompt,
      ...num,
      explanation: [
        `Amount forfeited = received towards capital = ${cnt(k)} x ${inr(kept)} = ${inr(k * kept)}${d.premiumLost ? ' (the premium was never received, so none of it is forfeited)' : ''}.`,
        off > 0
          ? `On the ${cnt(j)} shares reissued: forfeited ${cnt(j)} x ${inr(kept)} = ${inr(j * kept)}, less discount ${cnt(j)} x ${inr(off)} = ${inr(j * off)}: gain ${inr(gain)}, transferred to Capital Reserve.`
          : `On the ${cnt(j)} shares reissued: forfeited ${cnt(j)} x ${inr(kept)} = ${inr(j * kept)}, and no discount was allowed: gain ${inr(gain)}, transferred to Capital Reserve.`,
        `On the ${cnt(k - j)} shares not yet reissued: ${cnt(k - j)} x ${inr(kept)} = ${inr((k - j) * kept)} stays in Forfeited Shares A/c.`,
      ],
      hints: H.reissue,
    };
  },
  verify: (q) => {
    const s = ISSUES.of(q.prompt);
    if (!s) return false;
    const b = books(s);
    return q.answer === -net(b.ledger, q.prompt.includes('What balance') ? 'forfeitedShares' : 'capitalReserve');
  },
});

const prorataForfeitReissue = numericTemplate({
  id: 'sc-prorata-forfeit-reissue', topicId: T, conceptId: 'sc-reissue', difficulty: 'complex', unit: 'rupees',
  generate: (rng) => {
    const d = drawProrataDefault(rng, true, [0, 0, 2]);
    if (!d) return null;
    const { s, k, kept, app } = d;
    const all = rng.int(0, 2) === 0;
    const j = all ? k : somePart(rng, k);
    // The discount a share stays below what was forfeited a share, so that a gain is left.
    const unit = s.face / 10;
    const most = Math.ceil(kept / k / unit) - 1;
    const off = unit * rng.int(0, Math.min(most, 3));
    const share = (kept * j) / k;
    const gain = share - j * off;
    if (!Number.isInteger(share) || gain <= 0) return null;
    s.groups[0].reissued = j;
    s.groups[0].price = s.face - off;
    const askGain = all || rng.int(0, 1) === 0;
    const num = askGain
      ? numeric(gain, [
          [j * app - j * off, 'Took only the application money on the shares allotted as forfeited, and left out the excess application money that had been set against the allotment.'],
          [kept - j * off, `Transferred the whole amount forfeited, although only ${cnt(j)} of the ${cnt(k)} shares were reissued.`],
          [share, 'Forgot the discount allowed on reissue.'],
          [j * off, 'Gave the discount allowed on reissue, not the gain left after it.'],
          [kept, 'Gave the whole amount forfeited, before the discount on reissue.'],
        ])
      : numeric(kept - share, [
          [(k - j) * app, 'Took only the application money on the shares allotted as forfeited, and left out the excess application money that had been set against the allotment.'],
          [kept, 'Gave the balance before the reissue.'],
          [kept - j * off, 'Deducted only the discount and left the gain on the reissued shares in the account.'],
          [gain, 'Gave the gain transferred to Capital Reserve, not what stays behind.'],
        ]);
    const prompt = `${d.story} Later ${all ? 'all these shares' : `${cnt(j)} of these shares`} were reissued at ${inr(s.face - off)} a share, fully paid. ${askGain ? 'What amount is transferred to Capital Reserve?' : 'What balance is left in Forfeited Shares A/c after the transfer to Capital Reserve?'}`;
    ISSUES.keep(prompt, s);
    return num && {
      prompt,
      ...num,
      explanation: [
        `${d.who} applied for ${cnt(k)} x ${d.a}/${d.b} = ${cnt(d.applied)} shares and paid ${cnt(d.applied)} x ${inr(app)} = ${inr(kept)} on application. Nothing else was received, so ${inr(kept)} is the amount forfeited on the ${cnt(k)} shares.`,
        ...(all ? [] : [`Forfeited on the ${cnt(j)} shares reissued = ${inr(kept)} x ${cnt(j)}/${cnt(k)} = ${inr(share)}; on the other ${cnt(k - j)} shares, ${inr(kept - share)} stays in Forfeited Shares A/c.`]),
        off > 0 ? `Discount on reissue = ${cnt(j)} x ${inr(off)} = ${inr(j * off)}.` : 'The shares were reissued at face value: there is no discount.',
        off > 0 ? `Capital Reserve = ${inr(share)} - ${inr(j * off)} = ${inr(gain)}.` : `Capital Reserve = the amount forfeited on the shares reissued = ${inr(gain)}.`,
      ],
      hints: H.reissue,
    };
  },
  verify: (q) => {
    const s = ISSUES.of(q.prompt);
    if (!s) return false;
    const b = books(s);
    return q.answer === -net(b.ledger, q.prompt.includes('What balance') ? 'forfeitedShares' : 'capitalReserve');
  },
});

// ===============================================================================================================
// SHARE CAPITAL IN THE BALANCE SHEET AND ITS NOTE
// ===============================================================================================================

const noteShareCapital = numericTemplate({
  id: 'sc-note-share-capital', topicId: T, conceptId: 'sc-disclosure', difficulty: 'medium', unit: 'rupees',
  generate: (rng) => {
    const total = rng.step(20000, 150000, 10000);
    const ask = "What amount is shown as share capital in the company's balance sheet?";
    if (rng.int(0, 1) === 0) {
      // Calls in arrears: deducted from the called-up amount.
      const s = drawIssue(rng);
      const n = s.parts.length;
      s.called = rng.int(3, n);
      s.arrears = true;
      const k = rng.step(100, 2000, 100);
      s.groups = [{ applied: total - k, allotted: total - k, paid: s.called }, { applied: k, allotted: k, paid: s.called - 1 }];
      const calledUp = sum(s.parts.slice(0, s.called));
      const last = s.parts[s.called - 1];
      const answer = total * calledUp - k * last;
      const num = numeric(answer, [
        [total * calledUp, 'Did not deduct the calls in arrears.'],
        [total * calledUp + k * last, 'Added the calls in arrears instead of deducting them.'],
        [total * s.face, `Took the full face value, although only ${inr(calledUp)} a share has been called up.`],
        [answer + total * s.premium, 'Added the securities premium, which is shown under Reserves and Surplus.'],
        [(total - k) * calledUp, 'Left out everything on the shares in arrears; only the unpaid call on them is deducted.'],
      ]);
      const prompt = `${rng.pick(COMPANIES)} has allotted ${cnt(total)} ${sharesOf(s)} ${priced(s)}, payable ${terms(s)}.${notYet(s)} All the money called has been received, except ${stage(s.called - 1, n)} on ${cnt(k)} shares. ${ask}`;
      ISSUES.keep(prompt, s);
      return num && {
        prompt,
        ...num,
        explanation: [
          `Subscribed capital, at the amount called up: ${cnt(total)} shares x ${inr(calledUp)} = ${inr(total * calledUp)}.`,
          `Less calls in arrears: ${cnt(k)} x ${inr(last)} = ${inr(k * last)}.`,
          `Share capital = ${inr(total * calledUp)} - ${inr(k * last)} = ${inr(answer)}.${s.premium > 0 ? ' The premium is not share capital: it is shown under Reserves and Surplus.' : ''}`,
        ],
        hints: H.note,
      };
    }
    // Forfeited shares that have not been reissued: what was received on them is added.
    const d = drawDefault(rng, undefined, true);
    const { s, k, kept } = d;
    s.groups.push({ applied: total - k, allotted: total - k, paid: d.n });
    const answer = (total - k) * s.face + k * kept;
    const num = numeric(answer, [
      [(total - k) * s.face, 'Left out the balance of Forfeited Shares A/c, which is added to the share capital in the note.'],
      [total * s.face, 'Ignored the forfeiture; the forfeited shares are no longer part of the subscribed capital.'],
      [(total - k) * s.face - k * kept, 'Deducted the amount forfeited instead of adding it.'],
      [answer + (total - k) * s.premium + (d.premiumLost ? 0 : k * s.premium), 'Added the securities premium, which is shown under Reserves and Surplus.'],
    ]);
    const prompt = `${rng.pick(COMPANIES)} allotted ${cnt(total)} ${sharesOf(s)} ${priced(s)}, payable ${terms(s)}, and has made every call. ${d.who}, who held ${cnt(k)} of the shares, paid ${PAID[d.paid]}; these shares were forfeited and have not been reissued. Every other share is fully paid. ${ask}`;
    ISSUES.keep(prompt, s);
    return num && {
      prompt,
      ...num,
      explanation: [
        `Subscribed and fully paid: ${cnt(total - k)} shares x ${inr(s.face)} = ${inr((total - k) * s.face)}.`,
        `Add Forfeited Shares A/c: received towards capital on the forfeited shares = ${cnt(k)} x ${inr(kept)} = ${inr(k * kept)}.`,
        `Share capital = ${inr((total - k) * s.face)} + ${inr(k * kept)} = ${inr(answer)}.`,
      ],
      hints: H.note,
    };
  },
  verify: (q) => {
    const s = ISSUES.of(q.prompt);
    if (!s) return false;
    const { ledger } = books(s);
    return q.answer === -net(ledger, capitalId(s.kind)) - net(ledger, 'callsInArrears') - net(ledger, 'forfeitedShares');
  },
});

const balanceSheetCapital = numericTemplate({
  id: 'sc-balance-sheet-capital', topicId: T, conceptId: 'sc-disclosure', difficulty: 'complex', unit: 'rupees',
  generate: (rng) => {
    const d = drawDefault(rng, undefined, true);
    const { s, k, kept } = d;
    const total = rng.step(20000, 150000, 10000);
    const price = drawReissuePrice(rng, s, kept, ['discount', 'discount', 'par']);
    if (price === null) return null;
    const j = somePart(rng, k);
    const off = s.face - price;
    s.groups[0].reissued = j;
    s.groups[0].price = price;
    s.groups.push({ applied: total - k, allotted: total - k, paid: d.n });
    const paidUp = (total - k + j) * s.face;
    const answer = paidUp + (k - j) * kept;
    const gain = j * kept - j * off;
    const num = numeric(answer, [
      [paidUp, 'Left out the balance of Forfeited Shares A/c on the shares not yet reissued, which is added to the share capital.'],
      [paidUp + k * kept - j * off, 'Left the gain on the reissued shares in Forfeited Shares A/c; it is moved to Capital Reserve, under Reserves and Surplus.'],
      [answer + gain, 'Added the Capital Reserve, which is shown under Reserves and Surplus.'],
      [total * s.face, 'Ignored the forfeiture: the shares not yet reissued are not part of the paid-up capital.'],
      [(total - k) * s.face + k * kept, 'Ignored the reissue.'],
    ]);
    const prompt =
      `${rng.pick(COMPANIES)} allotted ${cnt(total)} ${sharesOf(s)} ${priced(s)}, payable ${terms(s)}, and has made every call. ${d.who}, who held ${cnt(k)} of the shares, paid ${PAID[d.paid]}, and these shares were forfeited. ` +
      `Of them, ${cnt(j)} were reissued at ${inr(price)} a share, fully paid, and the gain on these was transferred to Capital Reserve. Every other share is fully paid. What amount is shown as share capital in the company's balance sheet?`;
    ISSUES.keep(prompt, s);
    return num && {
      prompt,
      ...num,
      explanation: [
        `Shares now fully paid = ${cnt(total)} - ${cnt(k)} + ${cnt(j)} = ${cnt(total - k + j)}; at ${inr(s.face)} each = ${inr(paidUp)}.`,
        `Forfeited Shares A/c: ${inr(kept)} a share was received on the ${cnt(k - j)} shares not yet reissued = ${inr((k - j) * kept)}; this is added.`,
        `Share capital = ${inr(paidUp)} + ${inr((k - j) * kept)} = ${inr(answer)}. The gain of ${inr(gain)} on the reissued shares is in Capital Reserve, under Reserves and Surplus.`,
      ],
      hints: H.note,
    };
  },
  verify: (q) => {
    const s = ISSUES.of(q.prompt);
    if (!s) return false;
    const { ledger } = books(s);
    return q.answer === -net(ledger, capitalId(s.kind)) - net(ledger, 'forfeitedShares');
  },
});

const PLACES = {
  reserves: "Under Reserves and Surplus, in Shareholders' Funds",
  deducted: 'In the note on Share Capital, deducted from the called-up amount of the subscribed capital',
  added: 'In the note on Share Capital, added to the subscribed capital',
  liability: 'Under Other Current Liabilities',
  asset: 'Under Other Current Assets',
} as const;
type Place = keyof typeof PLACES;
const SHOWN: { what: string; place: Place; whys: Partial<Record<Place, string>>; because: string }[] = [
  {
    what: 'a balance of Securities Premium A/c',
    place: 'reserves',
    whys: {
      added: 'Treated the premium as share capital; share capital is the face value alone, and the premium is a reserve.',
      deducted: 'Treated the premium as a reduction of capital; it is an extra amount received from shareholders.',
      liability: 'Treated the premium as money to be paid back to the shareholders; it is not repayable.',
      asset: 'Treated a credit balance received from shareholders as an asset.',
    },
    because: 'The premium is a capital receipt kept as a reserve: it is shown under Reserves and Surplus.',
  },
  {
    what: 'a Capital Reserve, the gain on reissue of forfeited shares,',
    place: 'reserves',
    whys: {
      added: 'Left the gain in share capital; once the shares are reissued the gain is moved to Capital Reserve, which is a reserve.',
      deducted: "Deducted a gain from the capital; it is a reserve and adds to the shareholders' funds.",
      liability: 'Treated a capital profit as something owed to outsiders.',
      asset: 'Treated a reserve, which has a credit balance, as an asset.',
    },
    because: 'Capital Reserve is a reserve made out of a capital profit: it is shown under Reserves and Surplus.',
  },
  {
    what: 'calls in arrears',
    place: 'deducted',
    whys: {
      added: 'Added the unpaid calls to the capital; they are the part of the called-up capital that has not been received.',
      reserves: 'Treated unpaid calls as a reserve; they are called-up capital that has not come in.',
      liability: 'Treated unpaid calls as something the company owes; it is the shareholders who owe them to the company.',
      asset: 'Showed the unpaid calls as a receivable; in the balance sheet of a company they are deducted from the called-up capital.',
    },
    because: 'Calls in arrears are deducted from the called-up amount of the subscribed capital, so that the note ends on the paid-up capital.',
  },
  {
    what: 'a balance of Forfeited Shares A/c, on shares not yet reissued,',
    place: 'added',
    whys: {
      reserves: 'Treated the balance as a reserve; it becomes one (Capital Reserve) only when the shares are reissued.',
      deducted: 'Deducted the balance; it is money received towards capital, so it is added.',
      liability: 'Treated the balance as money to be returned to the former shareholders; it is not returned.',
      asset: 'Treated a credit balance as an asset.',
    },
    because: 'Until the shares are reissued, the balance of Forfeited Shares A/c is added to the subscribed capital in the note on Share Capital.',
  },
  {
    what: 'calls in advance',
    place: 'liability',
    whys: {
      added: 'Treated money received before a call as share capital; it is not capital until the call is made.',
      deducted: 'Mixed up calls in advance with calls in arrears, which are deducted from the called-up capital.',
      reserves: 'Treated money received ahead of a call as a reserve; the company owes it until the call is made.',
      asset: 'Treated money the company has received, and owes, as an asset.',
    },
    because: 'Calls in advance are owed to the shareholders until the call is made: they are shown under Other Current Liabilities.',
  },
];

const disclosureWhere = mcqTemplate({
  id: 'sc-disclosure-where', topicId: T, conceptId: 'sc-disclosure', difficulty: 'easy',
  generate: (rng) => {
    const item = rng.pick(SHOWN);
    const places = (Object.keys(PLACES) as Place[]).filter((p) => p !== item.place);
    return choice(
      `${rng.pick(COMPANIES)} is preparing its balance sheet as at 31 March ${rng.int(2024, 2026)}. Its books show ${item.what} of ${inr(rng.step(10000, 400000, 5000))}. Where is this amount shown?`,
      PLACES[item.place],
      places.map((p): [string, string] => [PLACES[p], item.whys[p] ?? '']),
      item.because,
      ['Is it capital, a reserve, something the company owes, or something it owns?', 'Calls in arrears are deducted from capital, the balance of Forfeited Shares A/c is added to it; premium and capital reserve are reserves; calls in advance are owed.'],
    );
  },
  verify: (q) => {
    const item = SHOWN.find((x) => q.prompt.includes(x.what));
    return !!item && optionText(q) === PLACES[item.place];
  },
});

const templates: Template[] = [
  capitalAmounts, capitalTerm, reserveCapital, specialIssueKind,
  instalmentDue, premiumTotal, entryApplicationReceived, entryApplicationTransfer, entryPremiumWithApplication, entryAllotmentDue, entryCallDue, premiumUses,
  underSubscription, minimumSubscription, subscriptionOutcome, oversubRefund, entryOversubRefund, prorataShares, prorataExcess, entryProrataApplication,
  entryProrataSurplus, prorataCombination, prorataHolderDue, prorataAllotmentReceived,
  callsInArrearsAmount, entryCallReceivedArrears, entryCallsInAdvance, callCashReceived,
  vendorShares, entryVendorAsset, entryVendorIssue, vendorGoodwill, entryBusinessPurchase, vendorPartCash,
  forfeitAmount, entryForfeiturePar, forfeitPremiumDebit, entryForfeiturePremium, entryProrataForfeiture,
  reissueMaxDiscount, reissueCapitalReserveAll, entryReissue, entryCapitalReserve, reissueCapitalReservePart, prorataForfeitReissue,
  noteShareCapital, balanceSheetCapital, disclosureWhere,
];

// ===============================================================================================================
// SETS OF ENTRIES AND FORMATS: one issue of one company, told from the applications to the reissue
// ===============================================================================================================
// A set ("Pass the necessary journal entries") and a format (an account, the balance sheet extract, the note on
// share capital) are both made from one story: an issue with its terms, how it was subscribed and allotted, who
// stopped paying and from which instalment, which shares were forfeited and how many were reissued at what price.
// `stepsOf` writes the entries of the story with the formulas a student uses (shares x rate); `storyHolds` reads
// the same story off `books`, where every figure is reached shareholder by shareholder.
//
// The conventions are the topic's, and every set and format states the ones it relies on:
//  - the premium is payable with the allotment money (in the easy set, sometimes with the application money) and is
//    credited to Securities Premium A/c when that instalment falls due;
//  - on a pro rata allotment the excess application money is kept towards the sum due on allotment and is taken to
//    meet its capital part first, so a holder who pays nothing on allotment has not paid the premium; an issue in
//    which the excess would be more than that capital part is not made;
//  - unpaid allotment and call money is moved to Calls in Arrears A/c where the company keeps one, and is otherwise
//    left as a debit balance of the instalment's own account: the question says which;
//  - shares are forfeited only after every call asked for in the story has been made, forfeited shares are reissued
//    as fully paid, and the discount on reissue is never more than the amount forfeited on those shares;
//  - an issue is at least 90% subscribed; no interest on calls; all money passes through the bank.

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const cap = (text: string): string => text.charAt(0).toUpperCase() + text.slice(1);
/** "To Bank A/c ₹50,000": a row as the working of a format quotes it. */
const quoted = (prefix: 'To' | 'By', label: string, n: number): string => `"${prefix} ${label} ${inr(n)}"`;

/** A shareholder who stopped paying from instalment `from` on (1 is the allotment money), on `k` shares for which `applied` were applied. */
interface Defaulter {
  who: string;
  k: number;
  applied: number;
  from: number;
  forfeited: boolean;
}
/** Forfeited shares reissued together as fully paid at one price: how many of each defaulter's shares, in the order of `bad`. */
interface Lot {
  takes: number[];
  price: number;
}
/** One issue and what became of it. `seal` checks it and writes it out as the groups of shareholders `books` walks. */
interface Float {
  co: string;
  /** The terms, how far they have been called (`called`) and whether a Calls in Arrears A/c is kept. */
  s: Issue;
  /** Shares offered, shares allotted (fewer when the issue is under-subscribed) and shares refused outright. */
  offered: number;
  n: number;
  refused: number;
  /** A pro rata allotment of every share: `b` shares allotted for every `a` applied for. */
  pro: { a: number; b: number } | null;
  bad: Defaulter[];
  lots: Lot[];
  /** A holder of `m` shares who paid the last call early, with the instalment before it. */
  ahead?: { who: string; m: number };
}

const TWO_PARTS = [[3, 7], [4, 6], [5, 5], [2, 8]];
/** The terms of an issue payable in `count` instalments, the premium (if any) with the allotment money. No shareholders yet. */
function drawTerms(rng: Rng, count: 2 | 3 | 4, premium: boolean, kind: Kind = 'equity'): Issue {
  const face = rng.pick([10, 10, 10, 100]);
  const shape = rng.pick(count === 2 ? TWO_PARTS : SHAPES.filter((p) => p.length === count));
  const step = rng.int(1, 5);
  return { kind, face, parts: shape.map((x) => (x * face) / 10), premium: premium ? (step * face) / 10 : 0, premiumAt: 1, called: count, arrears: false, surplus: 'refund', groups: [] };
}
/** A pro rata ratio whose excess application money stays inside the capital part of the allotment money; null when none does. */
function drawRatio(rng: Rng, s: Issue): { a: number; b: number } | null {
  const fit = RATIOS.filter(([a, b]) => (a - b) * s.parts[0] < b * s.parts[1]);
  if (fit.length === 0) return null;
  const [a, b] = rng.pick(fit);
  return { a, b };
}

/** The shares of an issue allotted pro rata: a multiple of `b`, and 20,000 at the least, an issue a public company would make. */
const proIssue = (rng: Rng, pro: { a: number; b: number }): number => pro.b * rng.step(Math.ceil(20000 / pro.b / 5000) * 5000, 30000, 5000);
/** One shareholder's holding in an issue of `n` shares, in lots of `lot`: `least` to `most` lots, and never more than a twentieth of the issue (unless `least` lots are more). */
const holding = (rng: Rng, n: number, lot: number, least: number, most: number): number => lot * rng.int(least, Math.max(least, Math.min(most, Math.floor(n / (20 * lot)))));

const appliedFor = (f: Float, shares: number): number => (f.pro ? (shares * f.pro.a) / f.pro.b : shares);
const allApplied = (f: Float): number => f.refused + appliedFor(f, f.n);
/** The excess application money of a pro rata allotment, kept towards the allotment money. */
const excessOf = (f: Float): number => (appliedFor(f, f.n) - f.n) * payable(f.s, 0);
const ownExcess = (f: Float, d: Defaulter): number => (d.applied - d.k) * payable(f.s, 0);
/** What a defaulter left unpaid on instalment `i`. */
const unpaidOn = (f: Float, d: Defaulter, i: number): number => (i < d.from || i >= f.s.called ? 0 : d.k * payable(f.s, i) - (i === 1 ? ownExcess(f, d) : 0));
const unpaidAll = (f: Float, d: Defaulter): number => sum(f.s.parts.map((_, i) => unpaidOn(f, d, i)));
/** What a defaulter paid towards capital, which the company keeps on forfeiture: all the application money, or the instalments paid. */
const forfeitedOn = (f: Float, d: Defaulter): number => (d.from === 1 ? d.applied * f.s.parts[0] : d.k * sum(f.s.parts.slice(0, d.from)));
const premiumLost = (f: Float, d: Defaulter): boolean => f.s.premium > 0 && d.from === 1;
const calledUpOf = (f: Float): number => sum(f.s.parts.slice(0, f.s.called));

/**
 * The story checked and written out as groups of shareholders who behaved alike, for `books`. Null for a story that
 * cannot be told: a number of shares that is not whole, excess application money that does not fit inside the
 * capital part of the allotment money, a discount on reissue above the amount forfeited, or a reissue that leaves no gain.
 */
function seal(f: Float): Float | null {
  const { s } = f;
  const whole = (x: number): boolean => Number.isInteger(x) && x >= 0;
  if ((f.pro || f.bad.length > 0) && s.premiumAt !== 1) return null;
  if (f.pro && excessOf(f) >= f.n * s.parts[1]) return null;
  if (f.n > f.offered || f.n * 10 < f.offered * 9 || (f.n < f.offered && (f.pro || f.refused > 0))) return null;
  if (!f.bad.every((d) => d.applied === appliedFor(f, d.k) && whole(d.applied) && d.from >= 1 && d.from < s.called)) return null;
  if (f.lots.length > 0 && s.called !== s.parts.length) return null;
  const left = f.bad.map((d) => d.k);
  const payers = f.n - sum(left) - (f.ahead?.m ?? 0);
  if (payers <= 0 || !whole(appliedFor(f, payers)) || !whole(appliedFor(f, f.ahead?.m ?? 0))) return null;
  const groups: Group[] = [];
  if (f.refused > 0) groups.push({ applied: f.refused, allotted: 0, paid: 1 });
  // A holder who pays a call early is, once the call is made, a holder who paid it.
  groups.push({ applied: appliedFor(f, f.n - sum(left)), allotted: f.n - sum(left), paid: s.called });
  for (const lot of f.lots) {
    let forfeited = 0;
    let shares = 0;
    for (const [x, take] of lot.takes.entries()) {
      if (take === 0) continue;
      const d = f.bad[x];
      const share = (forfeitedOn(f, d) * take) / d.k;
      if (!d.forfeited || take > left[x] || !whole(share) || !whole(appliedFor(f, take))) return null;
      // The discount stays within the amount forfeited on every share of the lot.
      if ((s.face - lot.price) * d.k > forfeitedOn(f, d)) return null;
      left[x] -= take;
      forfeited += share;
      shares += take;
      groups.push({ applied: appliedFor(f, take), allotted: take, paid: d.from, forfeited: true, reissued: take, price: lot.price });
    }
    if (shares === 0 || lot.price > s.face || forfeited - shares * (s.face - lot.price) <= 0) return null;
  }
  f.bad.forEach((d, x) => {
    if (left[x] > 0) groups.push({ applied: appliedFor(f, left[x]), allotted: left[x], paid: d.from, ...(d.forfeited ? { forfeited: true } : {}) });
  });
  s.groups = groups;
  return f;
}

type StepKind = 'applied' | 'allotted' | 'due' | 'received' | 'advance' | 'adjusted' | 'forfeited' | 'reissued' | 'reserve';
/** One entry of the story: what happened, the entry and the reasoning. `i` is the instalment, `x` the defaulter or the lot. */
interface Step {
  kind: StepKind;
  i: number;
  x: number;
  text: string;
  lines: JournalLine[];
  explanation: string[];
}

/** How a lot of reissued shares is described: "300 of the forfeited shares", "all of Mohan's forfeited shares and 200 of Anita's". */
function lotShares(f: Float, x: number): string {
  const lot = f.lots[x];
  const forfeited = f.bad.filter((d) => d.forfeited);
  const before = (at: number): number => sum(f.lots.slice(0, x).map((l) => l.takes[at]));
  if (forfeited.length === 1) {
    const at = f.bad.indexOf(forfeited[0]);
    const take = lot.takes[at];
    if (before(at) > 0) return take === forfeited[0].k - before(at) ? `the remaining ${cnt(take)} forfeited shares` : `${cnt(take)} more of the forfeited shares`;
    return take === forfeited[0].k ? `all the ${cnt(take)} forfeited shares` : `${cnt(take)} of the forfeited shares`;
  }
  const bits = f.bad.flatMap((d, at) => {
    const take = lot.takes[at];
    if (take === 0) return [];
    if (before(at) > 0) return [take === d.k - before(at) ? `the remaining ${cnt(take)} of ${d.who}'s forfeited shares` : `${cnt(take)} more of ${d.who}'s forfeited shares`];
    return [take === d.k ? `all the ${cnt(take)} forfeited shares of ${d.who}` : `${cnt(take)} of ${d.who}'s forfeited shares`];
  });
  return bits.join(' and ');
}

/** Every entry of the story in order, each worked the way a student works it. */
function stepsOf(f: Float): Step[] {
  const { s, n } = f;
  const count = s.parts.length;
  const capital = capitalId(s.kind);
  const at = (i: number): string => stageId(s.kind, i, count);
  const rate = payable(s, 0);
  const applied = allApplied(f);
  const excess = excessOf(f);
  const last = count - 1;
  const early = f.ahead ? f.ahead.m * s.parts[last] : 0;
  const steps: Step[] = [];
  const add = (kind: StepKind, i: number, x: number, text: string, lines: JournalLine[], explanation: string[]): void => void steps.push({ kind, i, x, text, lines, explanation });

  // The application money comes in on every share applied for.
  add(
    'applied', 0, 0,
    applied === f.offered ? `The application money was received on all the ${cnt(applied)} shares applied for.` : `Applications were received for ${cnt(applied)} shares, each with the application money.`,
    [dr('bank', applied * rate), cr(at(0), applied * rate)],
    [
      `Application money comes in on every share applied for: ${cnt(applied)} x ${inr(rate)} = ${inr(applied * rate)}. Bank A/c is debited.`,
      `No share has been allotted yet, so the money is held in ${ac(at(0))}, which is credited.`,
    ],
  );

  // On allotment all of it is dealt with in one entry.
  const proText = f.pro ? (f.refused > 0 ? `allotted the ${cnt(n)} shares pro rata to the other applicants, who had applied for ${cnt(appliedFor(f, n))} shares` : `allotted the ${cnt(n)} shares pro rata to all the applicants`) : '';
  const allotText = f.pro
    ? `The directors ${f.refused > 0 ? `refused the applications for ${cnt(f.refused)} shares and returned the money on them, ` : ''}${proText}${f.refused > 0 ? ',' : ''} and dealt with all the application money in one entry.`
    : f.refused > 0
      ? `The directors allotted the ${cnt(n)} shares in full to some applicants, refused the applications for the other ${cnt(f.refused)} shares and returned the money on them, dealing with all the application money in one entry.`
      : n < f.offered
        ? `The directors allotted all the ${cnt(n)} shares applied for, and the application money held on them was transferred.`
        : 'The directors allotted the shares, and the application money held on them was transferred.';
  add(
    'allotted', 0, 0, allotText,
    entry(dr(at(0), applied * rate), cr(capital, n * s.parts[0]), cr('securitiesPremium', n * (rate - s.parts[0])), cr(at(1), excess), cr('bank', f.refused * rate)),
    [
      `${ac(at(0))} is debited with ${f.pro || f.refused > 0 ? `all the application money, ${inr(applied * rate)}` : `the application money, ${cnt(n)} x ${inr(rate)} = ${inr(applied * rate)}`}, and so is closed.`,
      `On the ${cnt(n)} shares allotted, ${cnt(n)} x ${inr(s.parts[0])} = ${inr(n * s.parts[0])} becomes capital: ${ac(capital)} is credited.`,
      ...(rate > s.parts[0] ? [`The premium was payable with the application money: ${cnt(n)} x ${inr(s.premium)} = ${inr(n * s.premium)} is credited to Securities Premium A/c.`] : []),
      ...(s.premium > 0 && s.premiumAt === 1 && !f.pro && f.refused === 0 ? ['The premium is payable with the allotment money, so none is credited at this stage.'] : []),
      ...(f.pro ? [`The applicants allotted pro rata paid on ${cnt(appliedFor(f, n))} shares and got ${cnt(n)}: the excess, ${cnt(appliedFor(f, n) - n)} x ${inr(rate)} = ${inr(excess)}, is kept towards the allotment money, so ${ac(at(1))} is credited.`] : []),
      ...(f.refused > 0 ? [`The money on the ${cnt(f.refused)} shares refused, ${cnt(f.refused)} x ${inr(rate)} = ${inr(f.refused * rate)}, is paid back: Bank A/c is credited.`] : []),
    ],
  );

  for (let i = 1; i < s.called; i++) {
    const name = i === 1 ? 'allotment money' : `${stageName(i, count)} money`;
    const premium = payable(s, i) - s.parts[i];
    // The instalment falls due on every share allotted.
    add(
      'due', i, 0,
      i === 1 ? 'The allotment money became due on the shares allotted.' : `The directors made ${stage(i, count)} on all the shares.`,
      entry(dr(at(i), n * payable(s, i)), cr(capital, n * s.parts[i]), cr('securitiesPremium', n * premium)),
      i === 1
        ? [
            `Allotment money is due on the ${cnt(n)} shares allotted: ${cnt(n)} x ${inr(payable(s, 1))} = ${inr(n * payable(s, 1))}. ${ac(at(1))} is debited.`,
            `Its capital part, ${cnt(n)} x ${inr(s.parts[1])} = ${inr(n * s.parts[1])}, is credited to ${ac(capital)}.`,
            ...(premium > 0 ? [`The premium falls due with the allotment money: ${cnt(n)} x ${inr(premium)} = ${inr(n * premium)} is credited to Securities Premium A/c.`] : []),
            'No money has come in yet, so Bank A/c is not touched.',
          ]
        : [
            `The call is made on every share allotted${f.bad.some((d) => d.from < i) ? ', the shares with earlier money unpaid among them' : ''}: ${cnt(n)} x ${inr(s.parts[i])} = ${inr(n * s.parts[i])}. ${ac(at(i))} is debited.`,
            `More of the face value is called up, so ${ac(capital)} is credited.`,
          ],
    );
    if (f.ahead && i === last) {
      add(
        'adjusted', i, 0,
        `The money ${f.ahead.who} had paid in advance was set against the call.`,
        [dr('callsInAdvance', early), cr(at(i), early)],
        [
          `${f.ahead.who}'s advance is ${cnt(f.ahead.m)} x ${inr(s.parts[i])} = ${inr(early)}. The call is now due, so the money is no longer owed back: Calls in Advance A/c is debited.`,
          `${f.ahead.who}'s share of the call is treated as paid: ${ac(at(i))} is credited. No cash moves.`,
        ],
      );
    }
    // The money is received, less what a defaulter does not pay.
    const total = n * payable(s, i) - (i === 1 ? excess : 0) - (i === last ? early : 0);
    const late = f.bad.filter((d) => unpaidOn(f, d, i) > 0);
    const unpaid = sum(late.map((d) => unpaidOn(f, d, i)));
    const holders = late.map((d) => `${d.who}, who ${f.pro ? 'had been allotted' : 'holds'} ${cnt(d.k)} shares`).join(' and ');
    const working: string[] = [];
    if (i === 1 && excess > 0) working.push(`Due on allotment = ${cnt(n)} x ${inr(payable(s, 1))} = ${inr(n * payable(s, 1))}. The excess application money, ${inr(excess)}, has already been set against it, so ${inr(total)} is still to come.`);
    else if (i === last && early > 0) working.push(`${cap(name)} due = ${cnt(n)} x ${inr(payable(s, i))} = ${inr(n * payable(s, i))}, of which ${inr(early)} was set against ${f.ahead!.who}'s advance: ${inr(total)} is still to come.`);
    else working.push(`${cap(name)} due = ${cnt(n)} x ${inr(payable(s, i))} = ${inr(total)}.`);
    for (const d of late) {
      working.push(
        i === 1 && ownExcess(f, d) > 0
          ? `${d.who} owed ${cnt(d.k)} x ${inr(payable(s, 1))} = ${inr(d.k * payable(s, 1))} on allotment. ${d.who} had applied for ${cnt(d.k)} x ${f.pro!.a}/${f.pro!.b} = ${cnt(d.applied)} shares, so ${cnt(d.applied - d.k)} x ${inr(rate)} = ${inr(ownExcess(f, d))} of excess application money was already set against this: ${inr(unpaidOn(f, d, 1))} is unpaid.`
          : `${d.who} did not pay ${cnt(d.k)} x ${inr(payable(s, i))} = ${inr(unpaidOn(f, d, i))}.`,
      );
    }
    working.push(unpaid > 0 ? `Money received = ${inr(total)} - ${inr(unpaid)} = ${inr(total - unpaid)}: Bank A/c is debited.` : `All of it is received: Bank A/c is debited with ${inr(total)}.`);
    working.push(
      unpaid === 0
        ? `${ac(at(i))} is credited and so is closed.`
        : s.arrears
          ? `The unpaid ${inr(unpaid)} is moved to Calls in Arrears A/c, which is debited. ${ac(at(i))} is credited with ${inr(total)} and so is closed.`
          : `${ac(at(i))} is credited with the money received only. The unpaid ${inr(unpaid)} stays in it as a debit balance, because no Calls in Arrears A/c is kept.`,
    );
    add(
      'received', i, 0,
      `${i === 1 && excess > 0 ? 'The balance of the allotment money' : `The ${name}`} was received${late.length > 0 ? `, except from ${holders}` : ' in full'}.`,
      s.arrears ? entry(dr('bank', total - unpaid), dr('callsInArrears', unpaid), cr(at(i), total)) : [dr('bank', total - unpaid), cr(at(i), total - unpaid)],
      working,
    );
    if (f.ahead && i === last - 1) {
      add(
        'advance', i, 0,
        `With it ${f.ahead.who}, who holds ${cnt(f.ahead.m)} shares, also paid ${stage(last, count)}, which had not been made yet.`,
        [dr('bank', early), cr('callsInAdvance', early)],
        [
          `${f.ahead.who} paid ${cnt(f.ahead.m)} x ${inr(s.parts[last])} = ${inr(early)} on a call that is not yet due: Bank A/c is debited.`,
          'The company owes this money until the call is made, so it is not capital yet: Calls in Advance A/c is credited.',
        ],
      );
    }
  }

  // Forfeiture, one entry for each holder.
  const called = calledUpOf(f);
  f.bad.forEach((d, x) => {
    if (!d.forfeited) return;
    const kept = forfeitedOn(f, d);
    const unpaid = unpaidAll(f, d);
    add(
      'forfeited', 0, x,
      `The directors forfeited the ${cnt(d.k)} shares of ${d.who} for non-payment of ${dues(s, d.from)}.`,
      entry(dr(capital, d.k * called), dr('securitiesPremium', premiumLost(f, d) ? d.k * s.premium : 0), cr('forfeitedShares', kept), ...unpaidCredits(s, d.k, d.from, ownExcess(f, d))),
      [
        `Called up on the ${cnt(d.k)} shares${s.premium > 0 ? ', premium apart' : ''} = ${cnt(d.k)} x ${inr(called)} = ${inr(d.k * called)}: ${ac(capital)} is debited${s.called < count ? ', with the amount called up and not with the face value' : ', which cancels the shares'}.`,
        ...(premiumLost(f, d)
          ? [`The premium on them, ${cnt(d.k)} x ${inr(s.premium)} = ${inr(d.k * s.premium)}, fell due with the allotment money and was never received: Securities Premium A/c is debited to cancel it.`]
          : s.premium > 0
            ? ['The premium on them came in with the allotment money. A premium that has been received is not taken back, so Securities Premium A/c is not touched.']
            : []),
        d.from > 1
          ? `Received towards capital = ${cnt(d.k)} x ${inr(sum(s.parts.slice(0, d.from)))} = ${inr(kept)}: Forfeited Shares A/c is credited.`
          : d.applied > d.k
            ? `${d.who} had applied for ${cnt(d.k)} x ${f.pro!.a}/${f.pro!.b} = ${cnt(d.applied)} shares and paid ${cnt(d.applied)} x ${inr(rate)} = ${inr(kept)} on application${s.premium > 0 ? `; the excess in it, ${inr(ownExcess(f, d))}, met part of the capital due on allotment and none of the premium` : ''}. Nothing else was received, so Forfeited Shares A/c is credited with ${inr(kept)}.`
            : `Received towards capital = the application money, ${cnt(d.k)} x ${inr(rate)} = ${inr(kept)}: Forfeited Shares A/c is credited.`,
        `Unpaid: ${s.parts.flatMap((_, i) => (unpaidOn(f, d, i) > 0 ? [`${i === 1 ? 'allotment money' : stageName(i, count)} ${inr(unpaidOn(f, d, i))}`] : [])).join(', ')}. ${unpaidNote(s, unpaid)}`,
      ],
    );
  });

  // Reissue as fully paid, lot by lot, and the gain on each lot.
  f.lots.forEach((lot, x) => {
    const shares = sum(lot.takes);
    const off = s.face - lot.price;
    const bits = f.bad.flatMap((d, k) => {
      const take = lot.takes[k];
      if (take === 0) return [];
      const share = (forfeitedOn(f, d) * take) / d.k;
      const how = take === d.k ? `the whole ${inr(share)}` : d.from === 1 && d.applied > d.k ? `${inr(forfeitedOn(f, d))} x ${cnt(take)}/${cnt(d.k)} = ${inr(share)}` : `${cnt(take)} x ${inr(forfeitedOn(f, d) / d.k)} = ${inr(share)}`;
      return [{ d, take, share, how }];
    });
    const forfeited = sum(bits.map((b) => b.share));
    const gain = forfeited - shares * off;
    const stays = sum(f.bad.map((d, k) => (d.forfeited ? (forfeitedOn(f, d) * (d.k - sum(f.lots.slice(0, x + 1).map((l) => l.takes[k])))) / d.k : 0)));
    add(
      'reissued', 0, x,
      `${cap(lotShares(f, x))} were reissued at ${inr(lot.price)} a share, fully paid.`,
      entry(dr('bank', shares * lot.price), dr('forfeitedShares', shares * off), cr(capital, shares * s.face)),
      [
        `Money received = ${cnt(shares)} x ${inr(lot.price)} = ${inr(shares * lot.price)}: Bank A/c is debited.`,
        `The shares are reissued as fully paid, so ${ac(capital)} is credited with their face value, ${cnt(shares)} x ${inr(s.face)} = ${inr(shares * s.face)}.`,
        off > 0
          ? `The discount, ${cnt(shares)} x ${inr(off)} = ${inr(shares * off)}, is met out of the amount forfeited on these shares, ${inr(forfeited)}${bits.length > 1 ? `, and ${inr(off)} a share is no more than was forfeited on any of them` : ', so it is within the limit'}: Forfeited Shares A/c is debited.`
          : 'The shares fetch their full face value: there is no discount, and Forfeited Shares A/c is not touched by this entry.',
      ],
    );
    add(
      'reserve', 0, x,
      x === 0 ? `The gain on the ${cnt(shares)} shares reissued was transferred to Capital Reserve.` : `The gain on the ${cnt(shares)} shares of this later reissue was transferred to Capital Reserve.`,
      [dr('forfeitedShares', gain), cr('capitalReserve', gain)],
      [
        bits.length === 1
          ? `Forfeited on the ${cnt(shares)} shares reissued = ${bits[0].how}.`
          : `Forfeited on the shares reissued: ${bits.map((b) => `${b.d.who}'s ${cnt(b.take)} shares, ${b.how}`).join('; ')}; ${inr(forfeited)} in all.`,
        off > 0 ? `Less the discount allowed on their reissue, ${inr(shares * off)}: gain = ${inr(forfeited)} - ${inr(shares * off)} = ${inr(gain)}.` : `No discount was allowed, so the whole ${inr(gain)} is a gain.`,
        `The gain is a capital profit: Forfeited Shares A/c is debited and Capital Reserve A/c is credited.${stays > 0 ? ` The ${inr(stays)} forfeited on the shares not yet reissued stays in Forfeited Shares A/c.` : ''}`,
      ],
    );
  });
  return steps;
}

/** Several entries as one: every account with the net of what the entries debit and credit it. */
function merged(entries: readonly JournalLine[][]): JournalLine[] {
  const ledger = post([...entries]);
  return [...ledger].filter(([, v]) => v !== 0).map(([accountId, v]): JournalLine => ({ accountId, side: v > 0 ? 'Dr' : 'Cr', amount: Math.abs(v) }));
}

/**
 * True when the entries of a story are the ones the books of the issue give, shareholder by shareholder: each entry
 * the books have one for one (the receipts, the transfer on allotment, each instalment falling due, the forfeiture),
 * and the balance of every account once all of them are posted, which takes in the reissues and the capital reserve.
 */
function storyHolds(f: Float, story: readonly Step[]): boolean {
  const b = books(f.s);
  const count = f.s.parts.length;
  const one = (kind: StepKind, i: number): JournalLine[] => merged(story.filter((st) => st.kind === kind && st.i === i).map((st) => st.lines));
  if (!sameEntry(one('applied', 0), b.received[0]) || !sameEntry(one('allotted', 0), b.transfer)) return false;
  for (let i = 1; i < f.s.called; i++) {
    if (!sameEntry(one('due', i), b.due[i])) return false;
    // A call paid early comes in sooner and is set against the call later: the books show the receipt with the call.
    if (!(f.ahead && i >= count - 2) && !sameEntry(one('received', i), b.received[i])) return false;
  }
  if (!sameEntry(merged(story.filter((st) => st.kind === 'forfeited').map((st) => st.lines)), b.forfeiture)) return false;
  const mine = post(story.map((st) => st.lines));
  return [...new Set([...mine.keys(), ...b.ledger.keys()])].every((id) => net(mine, id) === net(b.ledger, id));
}

/** True when a step is entered on the day of the step before it: the allotment money falls due on allotment, an advance comes with its instalment, a second forfeiture is resolved with the first, the gain is transferred on reissue. */
const sameDay = (before: Step | undefined, step: Step): boolean =>
  !!before &&
  ((step.kind === 'due' && step.i === 1 && before.kind === 'allotted') ||
    step.kind === 'advance' ||
    step.kind === 'adjusted' ||
    (step.kind === 'forfeited' && before.kind === 'forfeited') ||
    (step.kind === 'reserve' && before.kind === 'reissued'));
const monthsOf = (steps: readonly Step[]): number => steps.filter((st, i) => !sameDay(steps[i - 1], st)).length;
/**
 * A date for every step, a month apart from the calendar month `start` (0 is January) on, steps of one day together.
 * With `year` the dates carry their year ("12 May 2025"), as the rows of an account do. A step that is `alone` has a
 * day of its own even where it would share the day of the step before it.
 */
function datesFor(rng: Rng, steps: readonly Step[], start: number, year?: number, alone?: (step: Step) => boolean): string[] {
  let month = start - 1;
  let day = 0;
  return steps.map((st, i) => {
    if (!sameDay(steps[i - 1], st) || alone?.(st)) {
      month += 1;
      day = rng.int(1, 28);
    }
    return `${day} ${MONTHS[month % 12]}${year === undefined ? '' : ` ${year + Math.floor(month / 12)}`}`;
  });
}

const SET_TASK = 'Pass the necessary journal entries in the books of the company.';
const BANKED = 'All money is received and paid through the bank.';
const offerOf = (f: Float, who = f.co): string => `${who} offered ${cnt(f.offered)} ${sharesOf(f.s)} to the public ${priced(f.s)}, payable ${terms(f.s)}.`;
const arrearsRule = (s: Issue): string =>
  s.arrears ? 'The company keeps a Calls in Arrears A/c, to which unpaid allotment and call money is moved.' : 'The company keeps no Calls in Arrears A/c: unpaid money is left as a debit balance in the account of its own instalment.';
const proRule = (s: Issue): string =>
  s.premium > 0
    ? 'Excess application money of applicants allotted pro rata is kept towards the sum due on allotment and is taken to meet its capital part first.'
    : 'Excess application money of applicants allotted pro rata is kept towards the sum due on allotment.';

/** What a set was made from, kept for its `verify`: the whole story, and which of its entries the set asks for. */
const SETS = keepFor<{ f: Float; story: Step[]; asked: number[] }>();

/** A set that asks for the entries `asked` of a story, dated a month apart within one calendar year. */
function storySet(rng: Rng, f: Float, story: Step[], asked: Step[], opening: string, rest: Pick<JournalSetParts, 'hints' | 'distractorAccounts'>): JournalSetParts {
  const months = monthsOf(asked);
  const start = rng.int(Math.max(0, Math.min(3, 12 - months)), 12 - months);
  const dates = datesFor(rng, asked, start);
  SETS.keep(`${SET_TASK}\n${opening}`, { f, story, asked: asked.map((st) => story.indexOf(st)) });
  return { task: SET_TASK, opening, transactions: asked.map((st, i) => ({ date: dates[i], text: st.text, lines: st.lines, explanation: st.explanation })), ...rest };
}

/** The entries of the set are the ones asked of its story, in order, and the story is the one the books of the issue tell. */
function storySetHolds(q: JournalSetQuestion): boolean {
  const kept = SETS.of(q.prompt);
  if (!kept || !setHolds()(q)) return false;
  const { f, story, asked } = kept;
  return asked.length === q.entries.length && asked.every((at, i) => sameEntry(story[at].lines, q.entries[i].expected)) && storyHolds(f, story);
}

// 1. sc-set-issue-in-full: a fully subscribed issue, every instalment received in full (easy, four entries).
//    Payable on application and allotment; or with a call still to be made, which has no entry yet; or, with the
//    application money already dealt with, from the allotment money to the call. At par or at a premium, the premium
//    with the allotment money or (where the set opens with the applications) with the application money.
const setIssueInFull = journalSetTemplate({
  id: 'sc-set-issue-in-full', topicId: T, conceptId: 'sc-sets', difficulty: 'easy',
  generate: (rng) => {
    const shape = rng.pick(['two', 'two', 'later', 'calls'] as const);
    const s = drawTerms(rng, shape === 'two' ? 2 : 3, rng.int(0, 3) > 0, rng.pick(['equity', 'equity', 'equity', 'preference'] as const));
    if (shape === 'later') s.called = 2;
    // The premium with the application money, one seed in three of those that open with the applications.
    if (s.premium > 0 && shape !== 'calls' && rng.int(0, 2) === 0) s.premiumAt = 0;
    const n = rng.step(20000, 150000, 10000);
    const f = seal({ co: rng.pick(COMPANIES), s, offered: n, n, refused: 0, pro: null, bad: [], lots: [] });
    if (!f) return null;
    const story = stepsOf(f);
    const asked = shape === 'calls' ? story.slice(2) : story;
    const opening =
      `${offerOf(f)} The issue was fully subscribed: applications were received for exactly ${cnt(n)} shares, every share was allotted, and all the money called was received in full. ${BANKED}` +
      (shape === 'later' ? ` The ${stageName(2, 3)} has not been made yet.` : '') +
      (shape === 'calls' ? ` The application money has been received and, on allotment, transferred to ${ac(capitalId(s.kind))}: pass the entries from the allotment money onwards.` : '');
    return storySet(rng, f, story, asked, opening, {
      hints: H.issue,
      distractorAccounts: ['securitiesPremium', 'callsInArrears', 'callsInAdvance', stageId(s.kind, 2, 3), capitalId(s.kind === 'equity' ? 'preference' : 'equity')],
    });
  },
  verify: storySetHolds,
});

const OPENED = ' The entry for the receipt of the application money has been passed: pass the entries from the allotment onwards.';

// 2. sc-set-prorata-issue: an over-subscribed issue allotted pro rata, with or without applications refused
//    outright (medium, four or five entries). Payable on application and allotment, or with a call still to be made:
//    the application money, the one entry that deals with it on allotment, the allotment money due and its balance
//    received. Or with the call made: from the allotment to the receipt of the call, on which a holder may be in arrears.
const setProrataIssue = journalSetTemplate({
  id: 'sc-set-prorata-issue', topicId: T, conceptId: 'sc-sets', difficulty: 'medium',
  generate: (rng) => {
    const shape = rng.pick(['allot', 'later', 'calls', 'calls'] as const);
    const s = drawTerms(rng, shape === 'allot' ? 2 : 3, rng.int(0, 2) > 0);
    if (shape === 'later') s.called = 2;
    s.arrears = rng.int(0, 1) === 0;
    const pro = drawRatio(rng, s);
    if (!pro) return null;
    const n = proIssue(rng, pro);
    const refused = rng.int(0, 1) === 0 ? rng.step(2000, 20000, 1000) : 0;
    const k = holding(rng, n, pro.b * 100, 1, 9);
    const late = shape === 'calls' && rng.int(0, 2) > 0;
    const bad: Defaulter[] = late ? [{ who: rng.pick(HOLDERS), k, applied: (k * pro.a) / pro.b, from: 2, forfeited: false }] : [];
    const f = seal({ co: rng.pick(COMPANIES), s, offered: n, n, refused, pro, bad, lots: [] });
    if (!f) return null;
    const story = stepsOf(f);
    const opening =
      `${offerOf(f)} The issue was over-subscribed: applications were received for ${cnt(allApplied(f))} shares. ${proRule(s)} ${BANKED}` +
      (late ? ` ${arrearsRule(s)}` : '') +
      (shape === 'later' ? ` The ${stageName(2, 3)} has not been made yet.` : '') +
      (shape === 'calls' ? OPENED : '');
    return storySet(rng, f, story, shape === 'calls' ? story.slice(1) : story, opening, {
      hints: H.prorata,
      distractorAccounts: ['callsInAdvance', 'securitiesPremium', 'callsInArrears', 'forfeitedShares'],
    });
  },
  verify: storySetHolds,
});

/** A part of `k` forfeited shares to reissue, in whole lots of `lot` shares (a hundred unless given); all of them when they cannot be split. */
function partOf(rng: Rng, k: number, lot = 100): number {
  const lots = k / lot;
  return lots < 2 ? k : lot * rng.int(1, lots - 1);
}

/** The largest discount on reissue, in tenths of the face value (four at most), that still leaves a gain on shares on which `per` a share was forfeited. */
const discountRoom = (s: Issue, per: number): number => Math.min(Math.ceil((per * 10) / s.face) - 1, 4);
/** How a holder who stopped paying is introduced: "Mohan, who holds 400 of the shares, has paid the application and allotment money but not the first and final call". */
const lapse = (s: Issue, d: Defaulter): string =>
  `${d.who}, who holds ${cnt(d.k)} of the shares, has paid ${d.from === 1 ? `only the application money, so that ${dues(s, 1)} ${s.called > 2 ? 'are' : 'is'} unpaid` : `${PAID[d.from]} but not ${dues(s, d.from)}`}`;

// 3. sc-set-forfeiture-reissue: shares forfeited for non-payment and reissued as fully paid at a discount
//    (medium, four or five entries). Three shapes: the last call received with one holder in arrears, the forfeiture,
//    the reissue of all or some of the shares and the gain; one holder's shares forfeited and reissued in two lots at
//    two prices, each with its gain; or two holders, one who never paid the allotment money (so the premium on those
//    shares was not received) and one who failed only the last call, forfeited and then reissued together.
const setForfeitureReissue = journalSetTemplate({
  id: 'sc-set-forfeiture-reissue', topicId: T, conceptId: 'sc-sets', difficulty: 'medium',
  generate: (rng) => {
    const shape = rng.pick(['call', 'lots', 'holders'] as const);
    const s = drawTerms(rng, rng.pick([3, 3, 4] as const), rng.int(0, 2) > 0);
    const count = s.parts.length;
    const last = count - 1;
    const unit = s.face / 10;
    s.arrears = rng.int(0, 1) === 0;
    const n = rng.step(20000, 150000, 10000);
    const [w1, w2] = rng.shuffle(HOLDERS);
    const k1 = holding(rng, n, 100, 2, 20);
    const k2 = holding(rng, n, 100, 1, 15);
    /** What a holder who stopped at instalment `from` had paid towards capital, a share. */
    const per = (from: number): number => sum(s.parts.slice(0, from));
    const holder = (who: string, k: number, from: number): Defaulter => ({ who, k, applied: k, from, forfeited: true });
    let bad: Defaulter[];
    let lots: Lot[];
    if (shape === 'call') {
      bad = [holder(w1, k1, last)];
      lots = [{ takes: [rng.int(0, 2) === 0 ? k1 : partOf(rng, k1)], price: s.face - unit * rng.int(1, discountRoom(s, per(last))) }];
    } else if (shape === 'lots') {
      const from = rng.int(1, last);
      const room = discountRoom(s, per(from));
      const first = rng.int(1, room);
      // The second lot fetches another price: the full face value, or another discount.
      const second = room > 1 && rng.int(0, 2) > 0 ? rng.pick(Array.from({ length: room }, (_, i) => i + 1).filter((x) => x !== first)) : 0;
      const j = partOf(rng, k1);
      bad = [holder(w1, k1, from)];
      lots = [{ takes: [j], price: s.face - unit * first }, { takes: [k1 - j], price: s.face - unit * second }];
    } else {
      bad = [holder(w1, k1, 1), holder(w2, k2, last)];
      const takes = rng.pick([[k1, k2], [k1, partOf(rng, k2)], [partOf(rng, k1), k2]]);
      lots = [{ takes, price: s.face - unit * rng.int(1, Math.min(discountRoom(s, per(1)), discountRoom(s, per(last)))) }];
    }
    const f = seal({ co: rng.pick(COMPANIES), s, offered: n, n, refused: 0, pro: null, bad, lots });
    if (!f) return null;
    const story = stepsOf(f);
    const held = `${f.co} has allotted ${cnt(n)} ${sharesOf(s)}, issued ${priced(s)} and payable ${terms(s)}.`;
    const opening =
      shape === 'call'
        ? `${held} Every earlier instalment was received in full. The directors have now made ${stage(last, count)}, and the entry for the call becoming due has been passed. ${arrearsRule(s)} ${BANKED}`
        : `${held} Every call has been made. ${bad.map((d) => lapse(s, d)).join('; ')}. Every other shareholder has paid in full. ${arrearsNote(s)} ${BANKED}`;
    return storySet(rng, f, story, story.slice(shape === 'lots' ? -5 : -4), opening, {
      hints: [H.forfeit[1], H.reissue[1]],
      distractorAccounts: ['securitiesPremium', 'capitalReserve', s.arrears ? stageId(s.kind, last, count) : 'callsInArrears', 'generalReserve', 'statementOfProfitAndLoss'],
    });
  },
  verify: storySetHolds,
});

// 4. sc-set-issue-with-default: a whole issue at a premium, allotted pro rata, with one holder who stops paying
//    (complex, six to eight entries). Payable on application and allotment: from the applications (seven entries) or
//    from the allotment (six) to the forfeiture, the reissue and the gain. Or with a call as well, from the allotment
//    (eight entries), the holder failing from the allotment money on or on the call alone. The holder's own excess
//    application money counts as paid, and where nothing was paid on allotment the premium is cancelled on forfeiture.
const setIssueWithDefault = journalSetTemplate({
  id: 'sc-set-issue-with-default', topicId: T, conceptId: 'sc-sets', difficulty: 'complex',
  generate: (rng) => {
    const shape = rng.pick(['seven', 'six', 'eight', 'eight'] as const);
    const s = drawTerms(rng, shape === 'eight' ? 3 : 2, true);
    s.arrears = rng.int(0, 1) === 0;
    const pro = drawRatio(rng, s);
    if (!pro) return null;
    const n = proIssue(rng, pro);
    const refused = rng.int(0, 1) === 0 ? rng.step(2000, 20000, 1000) : 0;
    const k = holding(rng, n, pro.b * 100, 1, 9);
    const from = shape === 'eight' ? rng.pick([1, 1, 2]) : 1;
    const applied = (k * pro.a) / pro.b;
    const room = discountRoom(s, from === 1 ? (applied * s.parts[0]) / k : s.parts[0] + s.parts[1]);
    if (room < 1) return null;
    const lot: Lot = { takes: [rng.int(0, 2) === 0 ? k : partOf(rng, k, pro.b * 100)], price: s.face - (s.face / 10) * rng.int(1, room) };
    const f = seal({ co: rng.pick(COMPANIES), s, offered: n, n, refused, pro, bad: [{ who: rng.pick(HOLDERS), k, applied, from, forfeited: true }], lots: [lot] });
    if (!f) return null;
    const story = stepsOf(f);
    const opening =
      `${offerOf(f)} The issue was over-subscribed: applications were received for ${cnt(allApplied(f))} shares. ${proRule(s)} ${arrearsRule(s)} ${BANKED}` +
      (shape === 'seven' ? '' : OPENED);
    return storySet(rng, f, story, shape === 'seven' ? story : story.slice(1), opening, {
      hints: ['Find the shares the defaulter applied for first: the whole of that application money is what was received, and so what is forfeited.', H.reissue[1]],
      distractorAccounts: ['callsInAdvance', 'generalReserve', s.arrears ? stageId(s.kind, 1, s.parts.length) : 'callsInArrears', 'statementOfProfitAndLoss'],
    });
  },
  verify: storySetHolds,
});

// 5. sc-set-business-purchase: shares issued for consideration other than cash (medium, four or five entries). A
//    running business is taken over (assets and liabilities at agreed values, with goodwill or a capital reserve) and
//    the vendor is settled in fully paid shares at par or at a premium, wholly or after a cheque for a part; then an
//    asset is bought from a second vendor and paid for in shares on the same terms. The numbers of shares are worked
//    out by the student.
const setBusinessPurchase = journalSetTemplate({
  id: 'sc-set-business-purchase', topicId: T, conceptId: 'sc-sets', difficulty: 'medium',
  generate: (rng) => {
    const b = drawBusiness(rng);
    if (!b) return null;
    const face = rng.pick([10, 10, 100]);
    const pct = rng.pick(face === 10 ? [0, 10, 20, 50] : [0, 10, 20, 25, 50]);
    const p = (face * pct) / 100;
    const each = face + p;
    const how = pct === 0 ? 'at par' : rng.pick([`at a premium of ${pct}%`, `at a premium of ${inr(p)} a share`, `at ${inr(each)} a share`]);
    const lot = face === 10 ? 1000 : 100;
    // The vendor of the business: shares for the whole price where it divides, or a cheque for a part and shares for the rest.
    const whole = b.price % (each * lot) === 0 && rng.int(0, 1) === 0;
    const n = whole ? b.price / each : Math.floor((b.price * rng.pick([60, 70, 80])) / 100 / each / lot) * lot;
    const cheque = b.price - n * each;
    if (n <= 0 || (!whole && cheque <= 0)) return null;
    // A second vendor, from whom one asset is bought and paid for in shares.
    const v2 = rng.pick(VENDORS.filter((v) => v !== b.v));
    const asset = rng.pick(BOUGHT.filter((x) => !b.assets.some((a) => a.id === x.id)));
    const m = lot * rng.int(5, 40);
    const cost = m * each;
    const days = setDays(rng, whole ? 4 : 5, 1, 28);
    const month = rng.pick(MONTHS);
    const netAssets = b.gross - b.owed;
    const sharesFor = (amount: number, shares: number): string[] => [
      `Issue price of a share = ${p > 0 ? `${inr(face)} + ${inr(p)} = ` : 'its face value, '}${inr(each)}, so shares allotted = ${inr(amount)} / ${inr(each)} = ${cnt(shares)}.`,
      `Equity Share Capital A/c is credited with their face value, ${cnt(shares)} x ${inr(face)} = ${inr(shares * face)}.`,
      ...(p > 0 ? [`Securities Premium A/c is credited with the premium, ${cnt(shares)} x ${inr(p)} = ${inr(shares * p)}.`] : []),
    ];
    const transactions: JournalSetParts['transactions'] = [
      {
        date: `${days[0]} ${month}`,
        text: `The business of ${b.v} was taken over at the agreed values.`,
        lines: entry(...b.assets.map((a) => dr(a.id, a.value)), dr('goodwill', b.goodwill ? b.gap : 0), ...b.liabilities.map((l) => cr(l.id, l.value)), cr(vendor(b.v), b.price), cr('capitalReserve', b.goodwill ? 0 : b.gap)),
        explanation: [
          `Each asset taken over is debited at its agreed value (${inr(b.gross)} in all) and each liability is credited (${inr(b.owed)} in all).`,
          `${b.v} is credited with the purchase consideration, ${inr(b.price)}: it is owed until it is settled.`,
          `Net assets = ${inr(b.gross)} - ${inr(b.owed)} = ${inr(netAssets)}. ${b.goodwill ? `The price is ${inr(b.gap)} more: Goodwill A/c is debited with ${inr(b.gap)}.` : `The price is ${inr(b.gap)} less: Capital Reserve A/c is credited with ${inr(b.gap)}.`}`,
        ],
      },
      ...(whole
        ? []
        : [
            {
              date: `${days[1]} ${month}`,
              text: `${b.v} was paid ${inr(cheque)} by cheque towards the purchase consideration.`,
              lines: [dr(vendor(b.v), cheque), cr('bank', cheque)],
              explanation: [`The amount owed to ${b.v} falls by ${inr(cheque)}: ${b.v} is debited.`, 'The cheque goes out of the bank: Bank A/c is credited.'],
            },
          ]),
      {
        date: `${days[whole ? 1 : 2]} ${month}`,
        text: whole ? `Shares were allotted to ${b.v} for the whole of the purchase consideration.` : `Shares were allotted to ${b.v} for the balance of the purchase consideration.`,
        lines: entry(dr(vendor(b.v), n * each), cr('equityShareCapital', n * face), cr('securitiesPremium', n * p)),
        explanation: [
          whole ? `${b.v} is debited with ${inr(b.price)}: the amount owed is settled in shares, so Bank A/c is not touched.` : `Still owed = ${inr(b.price)} - ${inr(cheque)} = ${inr(n * each)}: ${b.v} is debited, and the account is closed.`,
          ...sharesFor(n * each, n),
        ],
      },
      {
        date: `${days[whole ? 2 : 3]} ${month}`,
        text: `Bought ${asset.text} for ${inr(cost)} from ${v2}, the price to be settled in shares.`,
        lines: [dr(asset.id, cost), cr(vendor(v2), cost)],
        explanation: [`${ac(asset.id)} is debited with ${inr(cost)}: the asset comes in.`, `${v2} is credited: the price is owed to the vendor until the shares are allotted. No cash is paid.`],
      },
      {
        date: `${days[whole ? 3 : 4]} ${month}`,
        text: `Shares were allotted to ${v2} in full settlement of the price.`,
        lines: entry(dr(vendor(v2), cost), cr('equityShareCapital', m * face), cr('securitiesPremium', m * p)),
        explanation: [`${v2} is debited with ${inr(cost)}: the amount owed is settled.`, ...sharesFor(cost, m)],
      },
    ];
    const opening = `${b.text} The company settles with its vendors in equity shares of ${inr(face)} each, allotted as fully paid ${how}; a part of a price not settled in shares is paid by cheque.`;
    FACTS.keep(`${SET_TASK}\n${opening}`, { price: b.price, netAssets, cheque, cost, face, each });
    return {
      task: SET_TASK,
      opening,
      transactions,
      hints: H.vendor,
      distractorAccounts: [b.goodwill ? 'capitalReserve' : 'goodwill', 'equityShareApplication', 'equityShareAllotment', 'securitiesPremium', 'bank'],
    };
  },
  // Read back off the entries: both vendors are settled exactly, the shares at their issue price pay for what the
  // cheque did not, and the difference between the price and the net assets is the goodwill or the capital reserve.
  verify: (q) => {
    const f = FACTS.of(q.prompt);
    if (!f || !setHolds()(q)) return false;
    const ledger = post(q.entries.map((e) => e.expected));
    const shares = -net(ledger, 'equityShareCapital') / 100 / f.face;
    return (
      [...ledger.keys()].filter((id) => id.startsWith('vendor:')).every((id) => net(ledger, id) === 0) &&
      Number.isInteger(shares) &&
      shares * f.each === f.price - f.cheque + f.cost &&
      -net(ledger, 'securitiesPremium') / 100 === shares * (f.each - f.face) &&
      -net(ledger, 'bank') / 100 === f.cheque &&
      (net(ledger, 'goodwill') + net(ledger, 'capitalReserve')) / 100 === f.price - f.netAssets
    );
  },
});

const sets: JournalSetTemplate[] = [setIssueInFull, setProrataIssue, setForfeitureReissue, setIssueWithDefault, setBusinessPurchase];
// ===============================================================================================================
// FORMATS: the accounts of an issue, the balance sheet extract and the note on share capital
// ===============================================================================================================
// Every format is made from the entries of a story (`stepsOf`), posted with the engine: an account is written up from
// them with `accountOf`, and the figures of a statement are read off the ledger they leave. The story is dated month by
// month from April of the year the company was formed, and the books are closed on the next 31 March. An account is
// asked for with every posting under the account its entry names, which is what a ledger shows (the forfeiture of
// shares on which the premium was received debits Share Capital A/c alone, so that it is two rows there and not
// "Sundries"); the accounts are therefore asked only of stories in which the premium, if any, had been received on the
// shares forfeited. Share Capital A/c is the one account with such postings (the forfeiture and the reissue): its task
// says how they are to be shown, and "Sundries", which an examiner would accept for them, is never offered as a wrong
// label. No posting of Bank A/c or of Forfeited Shares A/c could be shown as "Sundries".

/** What a format was made from, kept for its `verify`. */
const FORMATS = keepFor<{ f: Float; story: Step[] }>();
const POSTED = "showing each posting against the account its entry names, never as 'Sundries'";
const stepName = (s: Issue, i: number): string => (i === 1 ? 'allotment money' : `${stageName(i, s.parts.length)} money`);

// 1. sc-fmt-bank-account: the Bank A/c of an over-subscribed issue through to the last call (medium). Money comes in
//    on every share applied for and is returned on the applications refused; the excess of a pro rata allotment never
//    passes through the bank again; a holder in arrears pays nothing; and in half the seeds a holder pays the last call
//    early, which is cash when it is paid and none when the call is made.
const fmtBankAccount = accountTemplate({
  id: 'sc-fmt-bank-account', topicId: T, conceptId: 'sc-formats', difficulty: 'medium',
  generate: (rng) => {
    const count = rng.pick([3, 4] as const);
    const s = drawTerms(rng, count, rng.int(0, 2) > 0);
    s.arrears = rng.int(0, 1) === 0;
    const pro = rng.int(0, 1) === 0 ? drawRatio(rng, s) : null;
    const lot = pro ? pro.b * 100 : 100;
    const n = pro ? proIssue(rng, pro) : rng.step(20000, 150000, 10000);
    const refused = rng.step(2000, 20000, 1000);
    const [w1, w2] = rng.shuffle(HOLDERS);
    const k = holding(rng, n, lot, 1, 9);
    const from = rng.pick([count - 1, count - 1, rng.int(1, count - 1)]);
    const ahead = rng.int(0, 1) === 0 ? { who: w2, m: holding(rng, n, lot, 1, 9) } : undefined;
    const sealed = seal({ co: rng.pick(COMPANIES), s, offered: n, n, refused, pro, bad: [{ who: w1, k, applied: pro ? (k * pro.a) / pro.b : k, from, forfeited: false }], lots: [], ...(ahead ? { ahead } : {}) });
    if (!sealed) return null;
    const f = sealed;
    const story = stepsOf(f);
    const y = rng.int(2022, 2025);
    const dates = datesFor(rng, story, 3, y);
    const end = `31 March ${y + 1}`;
    const reopen = `1 April ${y + 1}`;
    const d = f.bad[0];
    const arrears = unpaidAll(f, d);
    const balance = n * (s.face + s.premium) - arrears;
    const data = [
      `${f.co} was formed in April ${y}. ${offerOf(f, 'It')} ${pro ? `${proRule(s)} ` : ''}${arrearsRule(s)} Up to ${end} its only dealings with the bank were those of this issue.`,
      ...story.map((st, i) => `${dates[i]}: ${st.text}`),
    ].join('\n');
    FORMATS.keep(data, { f, story });
    const explanation: string[] = [];
    for (const st of story) {
      const bank = st.lines.find((l) => l.accountId === 'bank');
      const amount = (bank?.amount ?? 0) / 100;
      const opposite = ac(stageId(s.kind, st.i, count));
      if (st.kind === 'applied') explanation.push(`${st.explanation[0]} Row: ${quoted('To', opposite, amount)}.`);
      else if (st.kind === 'allotted')
        explanation.push(
          `On allotment the money on the ${cnt(refused)} shares refused is paid back: ${cnt(refused)} x ${inr(payable(s, 0))} = ${inr(amount)}. Row: ${quoted('By', opposite, amount)}. The rest of the application money stays in the bank${pro ? ', the excess of the pro rata allotment with it' : ''}: it is only moved between accounts.`,
        );
      else if (st.kind === 'received') explanation.push(`${st.explanation.slice(0, -1).join(' ')} Row: ${quoted('To', opposite, amount)}.`);
      else if (st.kind === 'advance') explanation.push(`${st.explanation[0]} Row: ${quoted('To', 'Calls in Advance A/c', amount)}. It is money received, though it is not capital until the call is made.`);
      else if (st.kind === 'adjusted') explanation.push(`When ${stage(count - 1, count)} is made, ${f.ahead!.who}'s advance is set against it by a transfer from Calls in Advance A/c. No money moves, so the Bank A/c has no row for it.`);
    }
    explanation.push(
      'An instalment falling due brings in no money: only its receipt is entered in the Bank A/c.',
      `The debit side is larger by ${inr(balance)}: ${quoted('By', BALANCE_CD, balance)} on ${end}, brought down as ${quoted('To', BALANCE_BD, balance)} on ${reopen}.`,
      `Check: ${cnt(n)} shares at the issue price of ${inr(s.face + s.premium)} = ${inr(n * (s.face + s.premium))}, less the ${inr(arrears)} that ${d.who} has not paid = ${inr(balance)}.`,
    );
    return {
      task: `Prepare the Bank A/c of ${f.co} for its issue of shares, balance it on ${end} and bring the balance down on ${reopen}.`,
      data,
      title: 'Bank A/c',
      ...ledgerSides(accountOf(story.map((st, i): DatedEntry => ({ date: dates[i], lines: st.lines })), 'bank'), { closeOn: end, reopenOn: reopen }),
      distractors: ['Bank A/c', ac(capitalId(s.kind)), 'Securities Premium A/c', 'Calls in Arrears A/c', 'Calls in Advance A/c'],
      explanation,
      hints: ['Enter only what passes through the bank: money received on each instalment and money paid back. An instalment falling due is not a receipt.', 'Money received on allotment = allotment money due - excess application money already held - what a defaulter did not pay.'],
    };
  },
  // The balance another way: every share allotted at its issue price, less what is in arrears. It is what the books of
  // the issue leave in the bank, what the rows leave, and what is carried down and brought down.
  verify: (q: AccountQuestion) => {
    const kept = FORMATS.of(q.data);
    if (!kept || !storyHolds(kept.f, kept.story)) return false;
    const { f } = kept;
    const paidIn = rupees(f.n * (f.s.face + f.s.premium) - sum(f.bad.map((d) => unpaidAll(f, d))));
    const [left, right] = q.sides;
    const closing = right.rows.filter((r) => r.closing);
    const total = (rows: typeof left.rows): number => sum(rows.map((r) => r.amounts[0]));
    return (
      net(books(f.s).ledger, 'bank') === paidIn &&
      closing.length === 1 &&
      closing[0].label === BALANCE_CD &&
      closing[0].amounts[0] === paidIn &&
      total(left.rows) - total(right.rows.filter((r) => !r.closing)) === paidIn &&
      left.below.length === 1 &&
      left.below[0].amounts[0] === paidIn &&
      right.below.length === 0
    );
  },
});

// 2. sc-fmt-share-capital-account: Equity Share Capital A/c from the allotment to the reissue of forfeited shares
//    (medium). The issue is subscribed exactly, under-subscribed, over-subscribed with applications refused or allotted
//    pro rata: only the shares allotted are capital. One holder's shares are forfeited and all or some of them
//    reissued, at a discount or at their face value; the account is balanced and brought down.
const fmtShareCapitalAccount = accountTemplate({
  id: 'sc-fmt-share-capital-account', topicId: T, conceptId: 'sc-formats', difficulty: 'medium',
  generate: (rng) => {
    const count = rng.pick([3, 3, 4] as const);
    const s = drawTerms(rng, count, rng.int(0, 2) > 0);
    s.arrears = rng.int(0, 1) === 0;
    const sub = rng.pick(['exact', 'under', 'refused', 'pro'] as const);
    const pro = sub === 'pro' ? drawRatio(rng, s) : null;
    const lot = pro ? pro.b * 100 : 100;
    const offered = pro ? proIssue(rng, pro) : rng.step(20000, 150000, 10000);
    const n = sub === 'under' ? offered - (offered * rng.pick([2, 4, 5, 8, 10])) / 100 : offered;
    const refused = sub === 'refused' ? rng.step(5000, 40000, 5000) : 0;
    const k = holding(rng, n, lot, 2, 12);
    // The premium, if any, was received on the shares forfeited: the holder paid the allotment money.
    const from = s.premium > 0 ? rng.int(2, count - 1) : rng.int(1, count - 1);
    const applied = pro ? (k * pro.a) / pro.b : k;
    const room = discountRoom(s, from === 1 ? (applied * s.parts[0]) / k : sum(s.parts.slice(0, from)));
    if (room < 1) return null;
    const j = rng.int(0, 2) === 0 ? k : partOf(rng, k, lot);
    const price = rng.int(0, 3) === 0 ? s.face : s.face - (s.face / 10) * rng.int(1, room);
    const sealed = seal({ co: rng.pick(COMPANIES), s, offered, n, refused, pro, bad: [{ who: rng.pick(HOLDERS), k, applied, from, forfeited: true }], lots: [{ takes: [j], price }] });
    if (!sealed) return null;
    const f = sealed;
    const story = stepsOf(f);
    const y = rng.int(2022, 2025);
    const dates = datesFor(rng, story, 3, y);
    const end = `31 March ${y + 1}`;
    const reopen = `1 April ${y + 1}`;
    const capital = capitalId(s.kind);
    const d = f.bad[0];
    const balance = (n - k + j) * s.face;
    const data = [
      `${f.co} was formed in April ${y}. ${offerOf(f, 'It')} ${pro ? `${proRule(s)} ` : ''}${arrearsRule(s)} Its accounting year ends on 31 March.`,
      ...story.map((st, i) => `${dates[i]}: ${st.text}`),
    ].join('\n');
    FORMATS.keep(data, { f, story });
    const explanation: string[] = [];
    for (const st of story) {
      const mine = st.lines.find((l) => l.accountId === capital);
      const amount = (mine?.amount ?? 0) / 100;
      const opposite = ac(stageId(s.kind, st.i, count));
      if (st.kind === 'allotted')
        explanation.push(
          `On allotment the application money on the ${cnt(n)} shares allotted becomes capital: ${cnt(n)} x ${inr(s.parts[0])} = ${inr(amount)}. Row: ${quoted('By', opposite, amount)}.${n < f.offered ? ' The shares nobody applied for bring in nothing and are not capital.' : refused > 0 || pro ? ' Money refunded, or kept as excess towards allotment, is not capital.' : ''}`,
        );
      else if (st.kind === 'due')
        explanation.push(
          `${cap(stepName(s, st.i))} falls due on every share: ${cnt(n)} x ${inr(s.parts[st.i])} = ${inr(amount)}. Row: ${quoted('By', opposite, amount)}.${st.i === 1 && s.premium > 0 ? ` The premium of ${inr(s.premium)} a share is credited to Securities Premium A/c, not here.` : ''}${st.i === 1 ? ' Capital is credited when an instalment falls due, whether or not the money comes in.' : ''}`,
        );
      else if (st.kind === 'forfeited') {
        const unpaid = st.lines.filter((l) => l.side === 'Cr' && l.accountId !== 'forfeitedShares').map((l) => quoted('To', ac(l.accountId), l.amount / 100));
        const paid =
          from > 1
            ? `${cnt(k)} x ${inr(sum(s.parts.slice(0, from)))}`
            : applied > k
              ? `the application money on the ${cnt(k)} x ${pro!.a}/${pro!.b} = ${cnt(applied)} shares applied for, ${cnt(applied)} x ${inr(s.parts[0])}`
              : `the application money, ${cnt(k)} x ${inr(s.parts[0])}`;
        explanation.push(
          `Forfeiture cancels ${d.who}'s ${cnt(k)} shares, so the ${cnt(k)} x ${inr(s.face)} = ${inr(amount)} credited on them is debited, a row for each account the entry credits. ${d.who} had paid ${paid} = ${inr(forfeitedOn(f, d))} towards capital: ${quoted('To', 'Forfeited Shares A/c', forfeitedOn(f, d))}. The rest was called and never paid: ${unpaid.join(' and ')}.`,
        );
      } else if (st.kind === 'reissued') {
        const off = (s.face - price) * j;
        explanation.push(
          `The ${cnt(j)} shares reissued are fully paid, so their face value, ${inr(amount)}, is credited: ${quoted('By', 'Bank A/c', j * price)} for the money received${off > 0 ? ` and ${quoted('By', 'Forfeited Shares A/c', off)} for the discount of ${inr(s.face - price)} a share` : ''}.`,
        );
      }
    }
    explanation.push(
      'The gain transferred to Capital Reserve is an entry between Forfeited Shares A/c and Capital Reserve A/c: it has no row here.',
      `Balance: ${cnt(n)} - ${cnt(k)} + ${cnt(j)} = ${cnt(n - k + j)} shares x ${inr(s.face)} = ${inr(balance)}, a credit balance: ${quoted('To', BALANCE_CD, balance)} on ${end}, brought down as ${quoted('By', BALANCE_BD, balance)} on ${reopen}.`,
    );
    return {
      task: `Prepare ${ac(capital)} of ${f.co} for the year ended ${end}, ${POSTED}; balance it and bring the balance down on ${reopen}.`,
      data,
      title: ac(capital),
      ...ledgerSides(accountOf(story.map((st, i): DatedEntry => ({ date: dates[i], lines: st.lines })), capital), { closeOn: end, reopenOn: reopen }),
      // "Sundries" is not offered: an examiner would accept it for the forfeiture or the reissue, which the task rules out.
      distractors: [ac(capital), 'Securities Premium A/c', 'Capital Reserve A/c', s.arrears ? ac(stageId(s.kind, count - 1, count)) : 'Calls in Arrears A/c'],
      explanation,
      hints: ['Share Capital A/c is credited as each part of the face value falls due on the shares allotted, debited with the amount called up on shares forfeited, and credited again with the face value of shares reissued.', H.forfeit[1]],
    };
  },
  // The balance another way: the shares now in issue at their face value. It is the capital the books of the issue
  // leave, what the rows leave, and what is carried down and brought down.
  verify: (q: AccountQuestion) => {
    const kept = FORMATS.of(q.data);
    if (!kept || !storyHolds(kept.f, kept.story)) return false;
    const { f } = kept;
    const inIssue = rupees((f.n - f.bad[0].k + f.lots[0].takes[0]) * f.s.face);
    const [left, right] = q.sides;
    const closing = left.rows.filter((r) => r.closing);
    const total = (rows: typeof left.rows): number => sum(rows.map((r) => r.amounts[0]));
    return (
      -net(books(f.s).ledger, capitalId(f.s.kind)) === inIssue &&
      closing.length === 1 &&
      closing[0].amounts[0] === inIssue &&
      total(right.rows) - total(left.rows.filter((r) => !r.closing)) === inIssue &&
      left.rows.some((r) => r.label === 'Forfeited Shares A/c' && r.amounts[0] === rupees(forfeitedOn(f, f.bad[0]))) &&
      right.below.length === 1 &&
      right.below[0].amounts[0] === inIssue
    );
  },
});

// 3. sc-fmt-forfeited-shares-account: Forfeited Shares A/c from the forfeiture to the transfers to Capital Reserve
//    (medium). Either one holder's shares, reissued in two lots at two prices, or the shares of two holders who had
//    paid different amounts, reissued one holder at a time; what was received on shares not yet reissued is left as
//    the balance, and in some seeds none is left.
const fmtForfeitedSharesAccount = accountTemplate({
  id: 'sc-fmt-forfeited-shares-account', topicId: T, conceptId: 'sc-formats', difficulty: 'medium',
  generate: (rng) => {
    const shape = rng.pick(['lots', 'holders'] as const);
    const count = rng.pick([3, 3, 4] as const);
    const s = drawTerms(rng, count, rng.int(0, 2) > 0);
    const last = count - 1;
    const unit = s.face / 10;
    s.arrears = rng.int(0, 1) === 0;
    const n = rng.step(20000, 150000, 10000);
    const [w1, w2] = rng.shuffle(HOLDERS);
    // The premium, if any, was received on the shares forfeited: each holder paid the allotment money.
    const lowest = s.premium > 0 ? 2 : 1;
    const per = (from: number): number => sum(s.parts.slice(0, from));
    const holder = (who: string, k: number, from: number): Defaulter => ({ who, k, applied: k, from, forfeited: true });
    /** Two prices for two lots: a discount within `room`, then the face value or another discount within `other`. */
    const prices = (room: number, other: number): number[] => {
      const first = rng.int(1, room);
      const second = rng.int(0, 3) === 0 ? 0 : rng.int(1, other);
      return [s.face - unit * first, s.face - unit * (second === first && other === room ? 0 : second)];
    };
    let bad: Defaulter[];
    let lots: Lot[];
    if (shape === 'lots') {
      const from = rng.int(lowest, last);
      const k = holding(rng, n, 100, 4, 20);
      const j = partOf(rng, k);
      const [p1, p2] = prices(discountRoom(s, per(from)), discountRoom(s, per(from)));
      bad = [holder(w1, k, from)];
      lots = [{ takes: [j], price: p1 }, { takes: [rng.int(0, 1) === 0 ? k - j : partOf(rng, k - j)], price: p2 }];
    } else {
      // Where the terms allow, the first holder stopped paying earlier than the second, who failed the last call only.
      const from = rng.int(lowest, Math.max(lowest, last - 1));
      const k1 = holding(rng, n, 100, 2, 15);
      const k2 = holding(rng, n, 100, 2, 15);
      const [p1, p2] = prices(discountRoom(s, per(from)), discountRoom(s, per(last)));
      bad = [holder(w1, k1, from), holder(w2, k2, last)];
      lots = [{ takes: [k1, 0], price: p1 }, { takes: [0, rng.int(0, 1) === 0 ? k2 : partOf(rng, k2)], price: p2 }];
    }
    const sealed = seal({ co: rng.pick(COMPANIES), s, offered: n, n, refused: 0, pro: null, bad, lots });
    if (!sealed) return null;
    const f = sealed;
    const story = stepsOf(f);
    const tail = story.filter((st) => st.kind === 'forfeited' || st.kind === 'reissued' || st.kind === 'reserve');
    const y = rng.int(2022, 2025);
    // Each holder's shares are forfeited on a day of their own: forfeited together, they could as well be one entry,
    // and so one row of the account.
    const dates = datesFor(rng, tail, rng.int(6, 9), y, (st) => st.kind === 'forfeited');
    const end = `31 March ${y + 1}`;
    const reopen = `1 April ${y + 1}`;
    const capital = ac(capitalId(s.kind));
    const view = accountOf(tail.map((st, i): DatedEntry => ({ date: dates[i], lines: st.lines })), 'forfeitedShares');
    // Rows are matched by their particulars and amounts: no two of a side may be alike.
    for (const side of [view.debit, view.credit]) if (new Set(side.map((p) => `${p.label}|${p.amount}`)).size !== side.length) return null;
    const left = bad.map((d, x) => d.k - sum(lots.map((l) => l.takes[x])));
    const balance = sum(bad.map((d, x) => left[x] * per(d.from)));
    // An account of fewer than five rows asks too little.
    if (view.debit.length + view.credit.length + (balance > 0 ? 1 : 0) < 5) return null;
    const data = [
      `${f.co} has allotted ${cnt(n)} ${sharesOf(s)}, issued ${priced(s)} and payable ${terms(s)}. By June ${y} every call had been made. ${bad.map((d) => lapse(s, d)).join('; ')}. Every other shareholder has paid in full. ${arrearsNote(s)} The accounting year ends on 31 March.`,
      ...tail.map((st, i) => `${dates[i]}: ${st.text}`),
      `No other forfeited share was reissued up to ${end}.`,
    ].join('\n');
    FORMATS.keep(data, { f, story });
    const explanation: string[] = [];
    for (const st of tail) {
      if (st.kind === 'forfeited') {
        const d = bad[st.x];
        explanation.push(
          `${d.who} had paid ${inr(per(d.from))} a share towards capital on ${cnt(d.k)} shares: ${cnt(d.k)} x ${inr(per(d.from))} = ${inr(forfeitedOn(f, d))}, which the company keeps. Row: ${quoted('By', capital, forfeitedOn(f, d))}.${s.premium > 0 ? ' The premium received on the shares is no part of it: it stays in Securities Premium A/c.' : ''}`,
        );
      } else if (st.kind === 'reissued') {
        const lot = lots[st.x];
        const shares = sum(lot.takes);
        const off = (s.face - lot.price) * shares;
        explanation.push(
          off > 0
            ? `${cap(lotShares(f, st.x))} are reissued at ${inr(lot.price)}: the discount, ${cnt(shares)} x ${inr(s.face - lot.price)} = ${inr(off)}, is met from this account. Row: ${quoted('To', capital, off)}.`
            : `${cap(lotShares(f, st.x))} are reissued at their face value: there is no discount, and this account has no row for the reissue.`,
        );
      } else {
        const gain = st.lines[0].amount / 100;
        explanation.push(`${st.explanation.slice(0, 2).join(' ')} Row: ${quoted('To', 'Capital Reserve A/c', gain)}.`);
      }
    }
    explanation.push(
      balance > 0
        ? `Left in the account is what was received on the shares not yet reissued: ${bad.flatMap((d, x) => (left[x] > 0 ? [`${cnt(left[x])} x ${inr(per(d.from))}`] : [])).join(' + ')} = ${inr(balance)}. It is a credit balance: ${quoted('To', BALANCE_CD, balance)} on ${end}, brought down as ${quoted('By', BALANCE_BD, balance)} on ${reopen}. In the balance sheet it is added to share capital.`
        : 'Every forfeited share has been reissued, so nothing is left in the account: the two sides agree and there is no balance to bring down.',
    );
    return {
      task: `Prepare Forfeited Shares A/c of ${f.co} for the year ended ${end}; balance it and bring down the balance, if any, on ${reopen}.`,
      data,
      title: 'Forfeited Shares A/c',
      ...ledgerSides(view, { closeOn: end, reopenOn: reopen }),
      distractors: ['Forfeited Shares A/c', 'Bank A/c', 'Securities Premium A/c', s.arrears ? 'Calls in Arrears A/c' : ac(stageId(s.kind, last, count)), 'Statement of Profit and Loss', BALANCE_CD, BALANCE_BD],
      explanation,
      hints: ['The account is credited with what the holders had paid towards capital, and debited with each discount on reissue and each gain transferred to Capital Reserve.', H.reissue[1]],
    };
  },
  // The balance another way: what the holders had paid, a share, on the shares not yet reissued. The gains are the
  // capital reserve the books of the issue show.
  verify: (q: AccountQuestion) => {
    const kept = FORMATS.of(q.data);
    if (!kept || !storyHolds(kept.f, kept.story)) return false;
    const { f } = kept;
    const stays = rupees(sum(f.bad.map((d, x) => (forfeitedOn(f, d) / d.k) * (d.k - sum(f.lots.map((l) => l.takes[x]))))));
    const b = books(f.s);
    const [left, right] = q.sides;
    const closing = left.rows.filter((r) => r.closing);
    const gains = sum(left.rows.filter((r) => r.label === 'Capital Reserve A/c').map((r) => r.amounts[0]));
    return (
      -net(b.ledger, 'forfeitedShares') === stays &&
      gains === -net(b.ledger, 'capitalReserve') &&
      (stays === 0 ? closing.length === 0 && right.below.length === 0 : closing.length === 1 && closing[0].amounts[0] === stays && right.below.length === 1 && right.below[0].amounts[0] === stays) &&
      sum(right.rows.map((r) => r.amounts[0])) === rupees(sum(f.bad.map((d) => forfeitedOn(f, d)))) &&
      q.continued === true
    );
  },
});

/** The figure of a row of a statement, in paise, by its particulars (the last column, the amount); 0 when the statement has no such row. */
const figureOf = (q: StatementQuestion, label: string): number => q.rows.find((r) => r.label === label)?.amounts.at(-1) ?? 0;
/** The figures of the sub-totals of a statement, in order (the last column). */
const subtotalsOf = (q: StatementQuestion): number[] => (q.lines ?? []).flatMap((line) => ('subtotal' in line ? [line.amounts.at(-1) ?? 0] : []));

const FORFEITED_ROW = 'Forfeited shares (amount originally paid up)';

// 4. sc-fmt-balance-sheet-extract: share capital and reserves in the balance sheet, with their two notes, after an
//    issue at a premium in which one holder's shares were forfeited and some of them reissued (complex). The four
//    figures are the balances the posted entries leave: the shares now in issue at face value, what was received on
//    the forfeited shares not yet reissued, the premium (less what was never received on the forfeited shares) and
//    the gain on the shares reissued. The issue is subscribed exactly, under-subscribed, over-subscribed with
//    applications refused, or allotted pro rata.
const fmtBalanceSheetExtract = statementTemplate({
  id: 'sc-fmt-balance-sheet-extract', topicId: T, conceptId: 'sc-formats', difficulty: 'complex',
  generate: (rng) => {
    const count = rng.pick([3, 3, 4] as const);
    const s = drawTerms(rng, count, true);
    s.arrears = rng.int(0, 1) === 0;
    const sub = rng.pick(['exact', 'under', 'refused', 'pro', 'pro'] as const);
    const pro = sub === 'pro' ? drawRatio(rng, s) : null;
    const lot = pro ? pro.b * 100 : 100;
    const offered = pro ? proIssue(rng, pro) : rng.step(20000, 150000, 10000);
    const n = sub === 'under' ? offered - (offered * rng.pick([2, 4, 5, 8, 10])) / 100 : offered;
    const refused = sub === 'refused' ? rng.step(5000, 40000, 5000) : 0;
    const k = holding(rng, n, lot, 2, 12);
    const from = rng.int(1, count - 1);
    const applied = pro ? (k * pro.a) / pro.b : k;
    const room = discountRoom(s, from === 1 ? (applied * s.parts[0]) / k : sum(s.parts.slice(0, from)));
    if (room < 1) return null;
    // Some of the forfeited shares are reissued, never all: a balance is left in Forfeited Shares A/c.
    const j = partOf(rng, k, lot);
    const price = s.face - (s.face / 10) * rng.int(1, room);
    const sealed = seal({ co: rng.pick(COMPANIES), s, offered, n, refused, pro, bad: [{ who: rng.pick(HOLDERS), k, applied, from, forfeited: true }], lots: [{ takes: [j], price }] });
    if (!sealed || j === k) return null;
    const f = sealed;
    const story = stepsOf(f);
    const ledger = post(story.map((st) => st.lines));
    const d = f.bad[0];
    const y = rng.int(2022, 2025);
    const end = `31 March ${y + 1}`;
    const registered = offered * rng.pick([2, 3, 4, 5]);
    // What the entries leave, in rupees.
    const paidUp = -net(ledger, capitalId(s.kind)) / 100;
    const held = -net(ledger, 'forfeitedShares') / 100;
    const premium = -net(ledger, 'securitiesPremium') / 100;
    const reserve = -net(ledger, 'capitalReserve') / 100;
    const kept = forfeitedOn(f, d);
    const off = (s.face - price) * j;
    const subscribed =
      sub === 'exact'
        ? 'The issue was fully subscribed and every share was allotted.'
        : sub === 'under'
          ? `Applications were received for ${cnt(n)} shares only, and all of them were allotted.`
          : sub === 'refused'
            ? `Applications were received for ${cnt(allApplied(f))} shares: ${cnt(n)} shares were allotted in full to some applicants, and the applications for the other ${cnt(refused)} shares were refused and the money on them returned.`
            : `Applications were received for ${cnt(allApplied(f))} shares, and the ${cnt(n)} shares were allotted pro rata to all the applicants. ${proRule(s)}`;
    const data = [
      `${f.co} is registered with a capital of ${inr(registered * s.face)} divided into ${cnt(registered)} equity shares of ${inr(s.face)} each.`,
      `In April ${y} it offered ${cnt(offered)} of these shares to the public ${priced(s)}, payable ${terms(s)}.`,
      subscribed,
      `Every call was made during the year, and all the money due was received except from ${d.who}, who ${pro ? 'had been allotted' : 'held'} ${cnt(k)} shares and paid ${from === 1 ? `only the application money, so that ${dues(s, 1)} remained unpaid` : `${PAID[from]} but not ${dues(s, from)}`}.`,
      `After the last call the directors forfeited ${d.who}'s shares. Before ${end}, ${cnt(j)} of them were reissued at ${inr(price)} a share, fully paid.`,
      `${arrearsRule(s)} The company has no other share capital and no other reserve, and its accounting year ends on 31 March.`,
    ].join('\n');
    FORMATS.keep(data, { f, story });
    const shares = (x: number): string => `${cnt(x)} equity shares of ${inr(s.face)} each`;
    return {
      task: `Show the share capital and the reserves of ${f.co} in its Balance Sheet as at ${end}, and prepare Note 1 (Share capital) and Note 2 (Reserves and surplus).`,
      data,
      title: `Balance Sheet of ${f.co} as at ${end} (extract), with its Notes to Accounts`,
      noteHeading: 'Note No.',
      rows: [
        { heading: 'I. EQUITY AND LIABILITIES' },
        { heading: "1. Shareholders' funds" },
        { label: 'Share capital', amount: rupees(paidUp + held), note: '1' },
        { label: 'Reserves and surplus', amount: rupees(premium + reserve), note: '2' },
        { heading: 'Note 1: Share capital' },
        { label: 'Authorised capital', amount: rupees(registered * s.face), details: [shares(registered)] },
        { label: 'Issued capital', amount: rupees(offered * s.face), details: [shares(offered)] },
        { heading: 'Subscribed capital' },
        { label: 'Subscribed and fully paid', amount: rupees(paidUp), details: [shares(n - k + j)] },
        { label: FORFEITED_ROW, amount: rupees(held), details: [`On ${cnt(k - j)} shares not yet reissued`] },
        { subtotal: 'Total share capital', amount: rupees(paidUp + held), sum: 'section' },
        { heading: 'Note 2: Reserves and surplus' },
        { label: 'Capital reserve', amount: rupees(reserve) },
        { label: 'Securities premium', amount: rupees(premium) },
        { subtotal: 'Total reserves and surplus', amount: rupees(reserve + premium), sum: 'section' },
      ],
      distractors: ['Calls in arrears', 'Calls in advance', 'Subscribed but not fully paid', 'General reserve', 'Reserve capital', 'Other current liabilities'],
      explanation: [
        `Note 1. Authorised capital is the capital the company is registered with, ${inr(registered * s.face)}; issued capital is the face value of the shares offered, ${cnt(offered)} x ${inr(s.face)} = ${inr(offered * s.face)}${n < offered ? `, although only ${cnt(n)} were taken up` : ''}. Both are shown for information: neither is added into the total.`,
        `Shares now in issue = ${cnt(n)} allotted - ${cnt(k)} forfeited + ${cnt(j)} reissued = ${cnt(n - k + j)}, every one fully paid: ${cnt(n - k + j)} x ${inr(s.face)} = ${inr(paidUp)}.`,
        `Forfeited shares: ${d.who} had paid ${d.applied > d.k && from === 1 ? `the application money on the ${cnt(d.applied)} shares applied for, ${cnt(d.applied)} x ${inr(s.parts[0])}` : `${cnt(k)} x ${inr(kept / k)}`} = ${inr(kept)} towards capital. ${cnt(k - j)} of the ${cnt(k)} shares are not yet reissued, so ${inr(kept)} x ${cnt(k - j)}/${cnt(k)} = ${inr(held)} is still in Forfeited Shares A/c and is added to the share capital.`,
        `Share capital = ${inr(paidUp)} + ${inr(held)} = ${inr(paidUp + held)}, the figure on the face of the balance sheet.`,
        `Note 2. Capital reserve is the gain on the ${cnt(j)} shares reissued: forfeited on them ${inr(kept)} x ${cnt(j)}/${cnt(k)} = ${inr((kept * j) / k)}, less the discount ${cnt(j)} x ${inr(s.face - price)} = ${inr(off)}, is ${inr(reserve)}.`,
        premiumLost(f, d)
          ? `Securities premium was credited when the allotment money fell due, ${cnt(n)} x ${inr(s.premium)} = ${inr(n * s.premium)}. ${d.who} never paid the allotment money, so the premium on those shares, ${cnt(k)} x ${inr(s.premium)} = ${inr(k * s.premium)}, was cancelled on forfeiture: ${inr(premium)} is left.`
          : `Securities premium was credited when the allotment money fell due, ${cnt(n)} x ${inr(s.premium)} = ${inr(premium)}. ${d.who} had paid the allotment money, and a premium that has been received is not taken back on forfeiture.`,
        `Reserves and surplus = ${inr(reserve)} + ${inr(premium)} = ${inr(reserve + premium)}.`,
        `Check: the two lines together, ${inr(paidUp + held + premium + reserve)}, are exactly the money the issue and the reissue have left in the bank.`,
      ],
      hints: H.note,
    };
  },
  // The accounting equation of a company whose only asset is the money of its shares: share capital and reserves
  // together are what the books of the issue leave in the bank, with no other balance left open. And each line is
  // what its note comes to.
  verify: (q: StatementQuestion) => {
    const kept = FORMATS.of(q.data);
    if (!kept || !storyHolds(kept.f, kept.story)) return false;
    const { f } = kept;
    const b = books(f.s);
    const open = [...b.ledger.keys()].filter((id) => net(b.ledger, id) !== 0);
    const [capital, reserves] = subtotalsOf(q);
    return (
      open.every((id) => ['bank', capitalId(f.s.kind), 'forfeitedShares', 'securitiesPremium', 'capitalReserve'].includes(id)) &&
      figureOf(q, 'Share capital') + figureOf(q, 'Reserves and surplus') === net(b.ledger, 'bank') &&
      figureOf(q, 'Share capital') === capital &&
      figureOf(q, 'Reserves and surplus') === reserves &&
      figureOf(q, 'Subscribed and fully paid') === rupees((f.n - f.bad[0].k + f.lots[0].takes[0]) * f.s.face) &&
      figureOf(q, FORFEITED_ROW) > 0 &&
      figureOf(q, 'Issued capital') === rupees(f.offered * f.s.face)
    );
  },
});

/** What the note on share capital was made from, besides the public issue: shares allotted to a vendor as fully paid, and the value they paid for. */
const NOTES = keepFor<{ f: Float; story: Step[]; vendorShares: number; vendorValue: number }>();
const PAID_UP_ROW = 'Amount originally paid up';

// 5. sc-fmt-note-share-capital: the Note to Accounts on Share Capital in its parts, with the number of shares beside
//    the amount (complex). Authorised and issued capital; subscribed and fully paid; subscribed but not fully paid,
//    at the amount called up, with calls in arrears deducted; forfeited shares added. Which parts the note has
//    changes with the story: every call made and one holder in arrears on the last one, so that those shares alone
//    are not fully paid; or the last call not yet made, so that every share of the public issue is partly paid and
//    only the shares allotted to a vendor as fully paid are fully paid. Shares may have been forfeited, and after the
//    last call some of them reissued.
const fmtNoteShareCapital = statementTemplate({
  id: 'sc-fmt-note-share-capital', topicId: T, conceptId: 'sc-formats', difficulty: 'complex',
  generate: (rng) => {
    const shape = rng.pick(['called', 'called', 'uncalled'] as const);
    // A holder in arrears on a call (never on the allotment money, which may carry the premium) needs a call that has been made.
    const count = shape === 'uncalled' ? 4 : rng.pick([3, 4] as const);
    const s = drawTerms(rng, count, rng.int(0, 2) > 0);
    if (shape === 'uncalled') s.called = count - 1;
    s.arrears = rng.int(0, 1) === 0;
    const offered = rng.step(20000, 150000, 10000);
    const n = rng.int(0, 2) === 0 ? offered - (offered * rng.pick([2, 4, 5, 8, 10])) / 100 : offered;
    const [wA, wB] = rng.shuffle(HOLDERS);
    // With every call made a holder is always in arrears, or no share would be partly paid; shares are forfeited in two seeds of three.
    const late = shape === 'called' || rng.int(0, 2) > 0;
    const lost = !late || rng.int(0, 2) > 0;
    const kA = holding(rng, n, 100, 2, 12);
    const kB = holding(rng, n, 100, 2, 20);
    const bad: Defaulter[] = [];
    if (lost) bad.push({ who: wA, k: kA, applied: kA, from: rng.int(1, s.called - 1), forfeited: true });
    if (late) bad.push({ who: wB, k: kB, applied: kB, from: s.called - 1, forfeited: false });
    const lots: Lot[] = [];
    if (lost && shape === 'called' && rng.int(0, 1) === 0) {
      const room = discountRoom(s, sum(s.parts.slice(0, bad[0].from)));
      if (room < 1) return null;
      lots.push({ takes: [partOf(rng, kA), ...(late ? [0] : [])], price: s.face - (s.face / 10) * rng.int(1, room) });
    }
    const sealed = seal({ co: rng.pick(COMPANIES), s, offered, n, refused: 0, pro: null, bad, lots });
    if (!sealed) return null;
    const f = sealed;
    const story = stepsOf(f);
    // Shares allotted to a vendor as fully paid, at the price of the public issue.
    const vendorShares = shape === 'uncalled' ? (s.face === 10 ? 1000 : 100) * rng.int(10, 60) : 0;
    const vendorValue = vendorShares * (s.face + s.premium);
    // A vendor whose name is not a shareholder's ("Kiran Traders" beside Kiran would read as one person).
    const seller = rng.pick(VENDORS.filter((v) => !bad.some((d) => v.startsWith(d.who))));
    const bought = rng.pick(BOUGHT);
    const capital = capitalId(s.kind);
    const ledger = post([
      ...story.map((st) => st.lines),
      ...(vendorShares > 0 ? [[dr(bought.id, vendorValue), cr(vendor(seller), vendorValue)], entry(dr(vendor(seller), vendorValue), cr(capital, vendorShares * s.face), cr('securitiesPremium', vendorShares * s.premium))] : []),
    ]);
    const y = rng.int(2022, 2025);
    const end = `31 March ${y + 1}`;
    const called = calledUpOf(f);
    const reissued = lots.length > 0 ? lots[0].takes[0] : 0;
    const gone = lost ? kA - reissued : 0;
    // The shares in issue: fully paid ones, and those on which something called or uncalled is still to come.
    const partly = shape === 'called' ? (late ? kB : 0) : n - gone;
    const fully = shape === 'called' ? n - gone - partly : vendorShares;
    const registered = Math.ceil(((offered + vendorShares) * rng.pick([2, 3, 4])) / 100000) * 100000;
    const issued = offered + vendorShares;
    // What the entries leave, in rupees: capital credited, money called and not received, money kept on forfeited shares.
    const credited = -net(ledger, capital) / 100;
    const arrears = sum(['callsInArrears', ...s.parts.map((_, i) => stageId(s.kind, i, count))].map((id) => Math.max(net(ledger, id), 0))) / 100;
    const held = -net(ledger, 'forfeitedShares') / 100;
    const partlyAmount = credited - fully * s.face;
    const total = credited - arrears + held;
    const a = lost ? bad[0] : undefined;
    const b = late ? bad[bad.length - 1] : undefined;
    const data = [
      `${f.co} is registered with a capital of ${inr(registered * s.face)} divided into ${cnt(registered)} equity shares of ${inr(s.face)} each.`,
      ...(vendorShares > 0 ? [`It bought ${bought.text} for ${inr(vendorValue)} from ${seller} and paid the price by allotting ${cnt(vendorShares)} of these shares to ${seller} as fully paid, ${s.premium > 0 ? `at a premium of ${inr(s.premium)} a share` : 'at par'}.`] : []),
      `It ${vendorShares > 0 ? 'also ' : ''}offered ${cnt(offered)} shares to the public ${priced(s)}, payable ${terms(s)}. ${n < offered ? `Applications were received for ${cnt(n)} shares only, and all of them were allotted.` : 'The issue was fully subscribed and every share was allotted.'}`,
      shape === 'called' ? 'Every call has been made.' : `The directors have made ${stage(s.called - 1, count)}; the ${stageName(count - 1, count)} has not been made yet.`,
      ...(a ? [`${a.who}, who held ${cnt(a.k)} shares, paid ${a.from === 1 ? 'only the application money' : `${PAID[a.from]} but not ${dues(s, a.from)}`}, and these shares were forfeited. ${reissued > 0 ? `Later ${cnt(reissued)} of them were reissued at ${inr(lots[0].price)} a share, fully paid.` : 'None of them has been reissued.'}`] : []),
      ...(b ? [`${b.who}, who holds ${cnt(b.k)} shares, has not paid ${dues(s, b.from)}. These shares have not been forfeited.`] : []),
      `Every other amount called has been received. ${arrearsRule(s)} The note is wanted as at ${end}.`,
    ].join('\n');
    NOTES.keep(data, { f, story, vendorShares, vendorValue });
    const shares = `Equity shares of ${inr(s.face)} each`;
    const rows: (FormatRowParts | StatementLineParts)[] = [
      { heading: 'Authorised capital' },
      { label: shares, amounts: [registered, rupees(registered * s.face)] },
      { heading: 'Issued capital' },
      { label: shares, amounts: [issued, rupees(issued * s.face)] },
      { heading: 'Subscribed capital' },
    ];
    if (fully > 0) {
      rows.push(
        { heading: 'Subscribed and fully paid' },
        { label: shares, amounts: [fully, rupees(fully * s.face)], ...(vendorShares > 0 ? { details: [`Allotted as fully paid to ${seller}, for consideration other than cash`] } : {}) },
      );
    }
    if (partly > 0) {
      rows.push({ heading: 'Subscribed but not fully paid' }, { label: shares, amounts: [partly, rupees(partlyAmount)], details: [`${inr(called)} a share called up`] });
      if (arrears > 0) rows.push({ label: 'Calls in arrears', amounts: [0, -rupees(arrears)] }, { subtotal: 'Subscribed but not fully paid, less calls in arrears', amounts: [0, rupees(partlyAmount - arrears)], sum: 'section' });
    }
    if (held > 0) rows.push({ heading: 'Forfeited shares' }, { label: PAID_UP_ROW, amounts: [0, rupees(held)] });
    rows.push({ subtotal: 'Total share capital', amounts: [0, rupees(total)] });
    const parts = [
      ...(fully > 0 ? [inr(fully * s.face)] : []),
      ...(partly > 0 ? [inr(partlyAmount - arrears)] : []),
      ...(held > 0 ? [inr(held)] : []),
    ];
    return {
      task: `Prepare the Note to Accounts on Share Capital of ${f.co} as at ${end}. Enter a number of shares only in the rows for shares, and show a deduction with a minus sign.`,
      data,
      title: `Note to Accounts: Share Capital of ${f.co} as at ${end}`,
      columns: [{ name: 'Number of shares', unit: 'number', adds: false }, { name: 'Amount (₹)', signed: true }],
      rows,
      // "Calls in arrears" and the amount paid up on forfeited shares are offered in every story, so that the list does not say which of them the note has.
      distractors: ['Calls in arrears', PAID_UP_ROW, 'Securities premium', 'Capital reserve', 'Calls in advance', 'Reserve capital', 'Preference shares of ₹100 each'],
      explanation: [
        `Authorised capital is what the company is registered with: ${cnt(registered)} shares, ${inr(registered * s.face)}.`,
        `Issued capital is the face value of the shares offered${vendorShares > 0 ? ` to the public and allotted to the vendor: ${cnt(offered)} + ${cnt(vendorShares)} = ${cnt(issued)} shares` : `: ${cnt(issued)} shares`}, ${inr(issued * s.face)}${n < offered ? `, although only ${cnt(n)} of those offered were taken up` : ''}. Neither figure is added into the total.`,
        ...(shape === 'called'
          ? [
              `Every call has been made, so a share is fully paid unless something on it is unpaid. Fully paid: ${cnt(n)} allotted${a ? ` - ${cnt(a.k)} forfeited${reissued > 0 ? ` + ${cnt(reissued)} reissued` : ''}` : ''}${b ? ` - ${cnt(b.k)} in arrears` : ''} = ${cnt(fully)} shares x ${inr(s.face)} = ${inr(fully * s.face)}.`,
              ...(b ? [`${b.who}'s ${cnt(b.k)} shares are subscribed but not fully paid: called up ${cnt(b.k)} x ${inr(called)} = ${inr(partlyAmount)}, less calls in arrears ${cnt(b.k)} x ${inr(s.parts[b.from])} = ${inr(arrears)}, is ${inr(partlyAmount - arrears)}.`] : []),
            ]
          : [
              ...(vendorShares > 0 ? [`Only the ${cnt(vendorShares)} shares allotted to ${seller} are fully paid: ${cnt(vendorShares)} x ${inr(s.face)} = ${inr(fully * s.face)}.${s.premium > 0 ? ' The premium on them is not share capital.' : ''}`] : []),
              `Only ${inr(called)} of the ${inr(s.face)} has been called on the shares of the public issue, so all of them still in issue are subscribed but not fully paid: ${a ? `${cnt(n)} - ${cnt(a.k)} forfeited = ` : ''}${cnt(partly)} shares x ${inr(called)} = ${inr(partlyAmount)}.`,
              ...(b ? [`Less calls in arrears, ${b.who}'s ${cnt(b.k)} x ${inr(s.parts[b.from])} = ${inr(arrears)}: ${inr(partlyAmount - arrears)}.`] : []),
            ]),
        ...(a
          ? [
              `Forfeited shares: ${a.who} had paid ${cnt(a.k)} x ${inr(sum(s.parts.slice(0, a.from)))} = ${inr(forfeitedOn(f, a))} towards capital${reissued > 0 ? `; on the ${cnt(a.k - reissued)} shares not yet reissued, ${cnt(a.k - reissued)} x ${inr(sum(s.parts.slice(0, a.from)))} = ${inr(held)} is still in Forfeited Shares A/c` : ', all of it still in Forfeited Shares A/c'}. It is added to the share capital.${reissued > 0 ? ' The gain on the shares reissued has gone to Capital Reserve, which is a reserve and has no place in this note.' : ''}`,
            ]
          : []),
        `Total share capital = ${parts.join(' + ')}${parts.length > 1 ? ` = ${inr(total)}` : ''}.${s.premium > 0 ? ' Securities premium is shown under Reserves and Surplus, not here.' : ''}`,
      ],
      hints: H.note,
    };
  },
  // The total another way, from the accounting equation: what the company holds (the money the books of the issue
  // leave in the bank, and what the vendor's shares paid for) less its reserves (the premium and the capital reserve)
  // is its share capital. And the parts of the note are the shares counted head by head.
  verify: (q: StatementQuestion) => {
    const kept = NOTES.of(q.data);
    if (!kept || !storyHolds(kept.f, kept.story)) return false;
    const { f, vendorShares, vendorValue } = kept;
    const b = books(f.s);
    const total = subtotalsOf(q).at(-1);
    const reserves = -net(b.ledger, 'securitiesPremium') - net(b.ledger, 'capitalReserve') + rupees(vendorShares * f.s.premium);
    const counted = sum(q.rows.slice(2).map((r) => r.amounts[0]));
    const inIssue = f.n + vendorShares - sum(f.bad.map((d, x) => (d.forfeited ? d.k - sum(f.lots.map((l) => l.takes[x])) : 0)));
    return total === net(b.ledger, 'bank') + rupees(vendorValue) - reserves && counted === inIssue && q.rows[1].amounts[0] === f.offered + vendorShares && q.rows.every((r) => r.amounts[1] !== 0);
  },
});

const formats: (AccountTemplate | StatementTemplate)[] = [fmtBankAccount, fmtShareCapitalAccount, fmtForfeitedSharesAccount, fmtBalanceSheetExtract, fmtNoteShareCapital];


// ---------------------------------------------------------------------------------------------------------------
// The features and the types of companies, added after the check against the CBSE 2025-26 syllabus, which names them at the head of its unit on companies.
// ---------------------------------------------------------------------------------------------------------------

const FEATURES = {
  entity: 'Separate legal entity',
  succession: 'Perpetual succession',
  limited: 'Limited liability',
  transfer: 'Transferability of shares',
  separation: 'Separation of ownership and management',
} as const;
type Feature = keyof typeof FEATURES;
const FEATURE_SLIP: Record<Feature, string> = {
  entity: 'A separate legal entity is about the company acting and owning in its own name; that is not what this shows.',
  succession: 'Perpetual succession is about the company going on whoever its members are; that is not what this shows.',
  limited: 'Limited liability is about how much a member can lose; that is not what this shows.',
  transfer: 'Transferability is about members selling their shares; that is not what this shows.',
  separation: 'Separation of ownership and management is about shareholders and directors; that is not what this shows.',
};
const COMPANY_HINTS = {
  feature: [
    'Is the situation about the company acting in its own name, about it going on, about what a member can lose, about selling shares, or about who runs it?',
    'Own name and own property: separate legal entity. Goes on whoever the members are: perpetual succession. Loss capped at the unpaid amount: limited liability. Shares sold without the others\' consent: transferability. Shareholders elect directors who manage: separation of ownership and management.',
  ],
  type: [
    'Find the one fact the description gives: how many members, who holds the capital, how far members are liable, or who controls the company.',
    'Public: at least 7 members, may invite the public. Private: 2 to 200, transfer restricted. One person company: a single member. Government: at least 51% of the paid-up capital held by governments. Guarantee: a fixed sum promised for winding up. Unlimited: no limit. Subsidiary: another company controls its board or more than half its voting power.',
  ],
  rule: [
    'Which part of company law is this about: the company as a person, its members, their liability, the transfer of its shares, who runs it, or who controls it?',
    'A company is an artificial person with perpetual succession, run by a board the shareholders elect. Members: one person company 1, private 2 to 200, public at least 7. Liability: limited by shares, the amount unpaid; by guarantee, the sum promised; unlimited, no limit. Control: a government company has at least 51% of its paid-up capital with governments; a subsidiary has its board or more than half its voting power controlled by another company.',
  ],
  liability: [
    'How much of the face value of each share is still unpaid, called or not?',
    'Liability on winding up = number of shares x (face value - amount paid a share): calls not paid and the uncalled amount both count.',
  ],
};

const scCompanyFeature = factsTemplate({
  id: 'sc-company-feature', topicId: T, conceptId: 'sc-kinds', difficulty: 'easy',
  // 2: ten situations in place of five, and hints of its own.
  version: 2,
  facts: ([
    ['Deccan Tools Ltd. files a suit in its own name against a supplier, and owns its factory in its own name.', 'entity', 'The company is a person in law, distinct from its members.'],
    ['Three of the four directors of Indus Chemicals Ltd. die in an accident; the company carries on as before.', 'succession', 'Members and directors come and go; the company goes on.'],
    ['Kaveri Mills Ltd. fails. A shareholder whose shares are fully paid loses the money paid but owes nothing more.', 'limited', 'A member is liable only up to the amount unpaid on the shares held.'],
    ['A shareholder of a listed company sells shares on the stock exchange without asking the other members.', 'transfer', 'Shares of a public company can be transferred freely.'],
    ['The thousands of shareholders of Ganga Foods Ltd. elect a board of directors who run the company.', 'separation', 'The owners (shareholders) are not the managers (directors).'],
    ['A shareholder of Narmada Textiles Ltd. sells cloth to the company and sues it for the unpaid price; the court treats the shareholder and the company as two different persons.', 'entity', 'The company is a person in law, distinct even from its own members.'],
    ['The founder of Vindhya Pharma Ltd., who held 40% of its shares, dies. The shares pass to the heirs and the company goes on as before.', 'succession', 'A change of members, even by death, does not end a company.'],
    ['Aravali Motors Ltd. is wound up owing large debts. A shareholder who has paid ₹6 on each share of ₹10 is asked for ₹4 a share and no more.', 'limited', 'A member is liable only up to the amount unpaid on the shares held.'],
    ['An investor buys 500 shares of Nilgiri Tea Ltd., a listed public company, through a broker; the company records the new holder without asking the other members.', 'transfer', 'Shares of a public company are freely transferable.'],
    ['A shareholder of Sagar Mills Ltd. cannot sign contracts for the company or decide what it buys; the board of directors does that.', 'separation', 'Owning shares does not give a say in day-to-day management, which is the directors\' work.'],
  ] as [string, Feature, string][]).map(([situation, f, why]) => ({
    prompt: `${situation} Which feature of a company does this show?`,
    correct: FEATURES[f],
    distractors: (Object.keys(FEATURES) as Feature[]).filter((k) => k !== f).slice(0, 4).map((k) => ({ text: FEATURES[k], why: FEATURE_SLIP[k] })),
    explanation: why,
    hints: COMPANY_HINTS.feature,
  })),
});

const TYPES = {
  public: 'A public company',
  private: 'A private company',
  opc: 'A one person company',
  government: 'A government company',
  guarantee: 'A company limited by guarantee',
  unlimited: 'An unlimited company',
  subsidiary: 'A subsidiary company',
} as const;
type CompanyType = keyof typeof TYPES;
// A company of one class may also belong to another (a company limited by guarantee is also public or private), so
// each question asks what the description itself tells, and every wrong option is something it does not tell.
const TYPE_SLIP: Record<CompanyType, string> = {
  public: 'Nothing in the description says it has at least 7 members and may invite the public, which is what makes a public company.',
  private: 'Nothing in the description says it has 2 to 200 members and restricts the transfer of its shares, which is what makes a private company.',
  opc: 'Nothing in the description says it has a single member, which is what makes a one person company.',
  government: 'Nothing in the description says the government holds at least 51% of its paid-up share capital, which is what makes a government company.',
  guarantee: 'Nothing in the description says its members promise a fixed sum towards its debts on winding up, which is what makes a company limited by guarantee.',
  unlimited: 'Nothing in the description says its members are liable without limit, which is what makes an unlimited company.',
  subsidiary: 'Nothing in the description says another company controls it, which is what makes a subsidiary.',
};
const scCompanyType = factsTemplate({
  id: 'sc-company-type', topicId: T, conceptId: 'sc-kinds', difficulty: 'easy',
  // 2: eleven descriptions in place of seven, and hints of its own.
  version: 2,
  facts: ([
    ['It has at least 7 members, no upper limit on their number, and may invite the public to buy its shares.', 'public', ['private', 'opc', 'government'], 'At least 7 members, no upper limit and an invitation to the public mark a public company.'],
    ['It has at least 2 and at most 200 members, restricts the transfer of its shares and may not invite the public to buy them.', 'private', ['public', 'opc', 'unlimited'], 'Two to 200 members, shares not freely transferable and no invitation to the public mark a private company.'],
    ['It has a single member.', 'opc', ['public', 'guarantee', 'subsidiary'], 'A company with one member is a one person company.'],
    ['The Central Government holds 60% of its paid-up share capital.', 'government', ['guarantee', 'subsidiary', 'unlimited'], 'At least 51% of the paid-up share capital held by the government makes a government company.'],
    ['Its members promise to pay up to ₹1,000 each towards its debts if it is wound up.', 'guarantee', ['unlimited', 'opc', 'government'], 'A fixed sum promised by each member for winding up marks a company limited by guarantee.'],
    ['Its members are liable for its debts without any limit.', 'unlimited', ['guarantee', 'government', 'subsidiary'], 'Liability without limit marks an unlimited company.'],
    ['Another company holds more than half of its total voting power.', 'subsidiary', ['government', 'guarantee', 'opc'], 'A company whose voting power is more than half held by another company is that company\'s subsidiary.'],
    ['It has 1,200 members and offers its shares to the public through a prospectus.', 'public', ['private', 'opc', 'guarantee'], 'Inviting the public to subscribe, with no upper limit on members, marks a public company.'],
    ['Its articles limit its members to 50 and do not let a member sell shares to an outsider without the consent of the board.', 'private', ['public', 'government', 'unlimited'], 'A limit on members and a restriction on transfer mark a private company.'],
    ['The Government of Kerala holds 51% of its paid-up share capital and private investors hold the rest.', 'government', ['subsidiary', 'guarantee', 'opc'], 'At least 51% of the paid-up share capital held by a State Government makes a government company.'],
    ['Another company appoints all the members of its board of directors.', 'subsidiary', ['government', 'unlimited', 'opc'], 'A company whose board is controlled by another company is that company\'s subsidiary.'],
  ] as [string, CompanyType, CompanyType[], string][]).map(([description, t, others, why]) => ({
    prompt: `${description} What does this tell you the company is?`,
    correct: TYPES[t],
    distractors: others.map((k) => ({ text: TYPES[k], why: TYPE_SLIP[k] })),
    explanation: why,
    hints: COMPANY_HINTS.type,
  })),
});

const scCompanyRule = factsTemplate({
  id: 'sc-company-rule', topicId: T, conceptId: 'sc-kinds', difficulty: 'medium',
  // 2: ten statements in place of four, and hints of its own.
  version: 2,
  facts: [
    {
      prompt: 'Which statement about a company is true?',
      correct: 'It is an artificial person created by law, distinct from its members',
      distractors: [
        { text: 'Its members are personally liable for all its debts', why: 'Mixed a company up with a partnership: the liability of members of a company limited by shares is limited.' },
        { text: 'It comes to an end when its largest shareholder dies', why: 'A company has perpetual succession.' },
        { text: 'It cannot own property in its own name', why: 'As a separate legal entity it owns property and enters contracts in its own name.' },
      ],
      explanation: 'A company is a legal person of its own, apart from the people who own its shares.',
    },
    {
      prompt: 'Which statement about the members of a company is true?',
      correct: 'A private company needs at least 2 members, a public company at least 7',
      distractors: [
        { text: 'A private company needs at least 7 members, a public company at least 2', why: 'Swapped the minimum numbers of the two.' },
        { text: 'Both need at least 7 members', why: 'A private company needs only 2.' },
        { text: 'A public company may have at most 200 members', why: 'The limit of 200 is for a private company; a public company has no upper limit.' },
      ],
      explanation: 'Private: at least 2, at most 200. Public: at least 7, no upper limit. One person company: 1.',
    },
    {
      prompt: 'In a company limited by shares, how far is a shareholder liable for its debts?',
      correct: 'Up to the amount unpaid on the shares held',
      distractors: [
        { text: 'For all its debts, without limit', why: 'That is the position of members of an unlimited company, or of partners.' },
        { text: 'Up to the face value of the shares, even when fully paid', why: 'Once the shares are fully paid, nothing more can be asked.' },
        { text: 'Up to a sum promised for winding up', why: 'That is a company limited by guarantee.' },
      ],
      explanation: 'Limited by shares: the most a member can be asked for is what is still unpaid on the shares.',
    },
    {
      prompt: 'When is a company a government company?',
      correct: 'When at least 51% of its paid-up share capital is held by the Central Government, a State Government or both',
      distractors: [
        { text: 'When it does business with the government', why: 'Dealing with the government does not make a company a government company; ownership of its capital does.' },
        { text: 'When a minister is one of its directors', why: 'It turns on the holding of the paid-up share capital.' },
        { text: 'When the government holds any of its shares', why: 'The holding must be at least 51% of the paid-up share capital.' },
      ],
      explanation: 'A government company is defined by who holds its paid-up share capital.',
    },
    {
      prompt: 'Which statement about a one person company is true?',
      correct: 'It has only one person as its member',
      distractors: [
        { text: 'It has one director and any number of members', why: 'Counted the directors instead of the members.' },
        { text: 'It is a sole proprietorship registered under another name', why: 'A one person company is a company, a separate legal entity, not a sole trader.' },
        { text: 'It may invite the public to buy its shares', why: 'Only a public company may invite the public.' },
      ],
      explanation: 'A one person company is a company with only one member, and it is still a person in law apart from that member.',
    },
    {
      prompt: 'Which statement about the transfer of shares is true?',
      correct: 'Shares of a public company are freely transferable; a private company restricts the transfer of its shares',
      distractors: [
        { text: 'Shares of a private company are freely transferable; a public company restricts transfer', why: 'Swapped the rules of the two kinds of company.' },
        { text: 'No shares may be transferred without the consent of every member', why: 'That is how a partner\'s share works, not a company\'s.' },
        { text: 'Shares may be transferred only on the death of the holder', why: 'Death is one way shares pass, not the only one.' },
      ],
      explanation: 'Free transferability is a feature of a public company; a private company must restrict it in its articles.',
    },
    {
      prompt: 'Which statement about the management of a company is true?',
      correct: 'It is managed by a board of directors elected by the shareholders',
      distractors: [
        { text: 'Every shareholder takes part in its day-to-day management', why: 'Mixed a company up with a partnership, where every partner may take part.' },
        { text: 'Its largest creditor manages it', why: 'Creditors lend money; they do not manage the company.' },
        { text: 'It is managed by the Registrar of Companies', why: 'The Registrar registers companies; the board manages them.' },
      ],
      explanation: 'Ownership and management are separate: shareholders own the company, the directors they elect run it.',
    },
    {
      prompt: 'Which statement about the life of a company is true?',
      correct: 'It goes on until it is wound up as the law lays down, whatever happens to its members',
      distractors: [
        { text: 'It ends when its managing director retires', why: 'A director leaving does not end a company.' },
        { text: 'It ends when all its shares change hands', why: 'New members do not make a new company.' },
        { text: 'It lasts for a fixed term of 99 years', why: 'There is no such term in the law; a company has perpetual succession.' },
      ],
      explanation: 'Perpetual succession: a company is created by law and ends only by the process of law.',
    },
    {
      prompt: 'Which statement about a company limited by guarantee is true?',
      correct: 'Its members promise to contribute a fixed sum to its assets if it is wound up',
      distractors: [
        { text: 'Its debts are guaranteed by the government', why: 'The guarantee is given by the members, not by the government.' },
        { text: 'Its members are liable without any limit', why: 'That is an unlimited company.' },
        { text: 'Its members are liable only for the amount unpaid on their shares', why: 'That is a company limited by shares.' },
      ],
      explanation: 'Limited by guarantee: each member undertakes to pay a fixed sum on winding up, and no more.',
    },
    {
      prompt: 'When is a company the subsidiary of another company?',
      correct: 'When the other company controls the composition of its board of directors, or holds more than half its total voting power',
      distractors: [
        { text: 'When the other company is its largest customer', why: 'Trading with a company gives no control over it.' },
        { text: 'When the other company holds any of its shares', why: 'A small holding gives no control; more than half the voting power, or control of the board, is needed.' },
        { text: 'When both companies have the same auditor', why: 'An auditor has no part in control.' },
      ],
      explanation: 'Control decides it: of the board, or of more than half the voting power.',
    },
  ].map((fact) => ({ ...fact, hints: COMPANY_HINTS.rule })),
});

/** What a question on a member's liability was made from, kept for its `verify`. */
let keptLiability: { prompt: string; shares: number; face: number; paid: number } | undefined;

const scMemberLiability = numericTemplate({
  id: 'sc-member-liability', topicId: T, conceptId: 'sc-kinds', difficulty: 'medium', unit: 'rupees',
  // 2: hints of its own.
  version: 2,
  generate: (rng) => {
    const shares = rng.step(100, 2000, 100), face = rng.pick([10, 100]);
    const called = face === 10 ? rng.pick([6, 7, 8, 10]) : rng.pick([60, 70, 80, 100]);
    const paid = face === 10 ? rng.pick([3, 6].filter((x) => x <= called)) : rng.pick([30, 60].filter((x) => x <= called));
    const company = rng.pick(['Kaveri Mills Ltd.', 'Deccan Tools Ltd.', 'Ganga Foods Ltd.', 'Indus Chemicals Ltd.']);
    const holder = rng.pick(['Asha', 'Bimal', 'Chitra', 'Farhan', 'Gurpreet']);
    const prompt = `${holder} holds ${shares.toLocaleString('en-IN')} equity shares of ₹${face} each in ${company}, a company limited by shares. ₹${called} a share has been called up, and ${holder} has paid ₹${paid} a share. The company is wound up. What is the most ${holder} can be asked to pay towards its debts?`;
    keptLiability = { prompt, shares, face, paid };
    const answer = rupees(shares * (face - paid));
    const errors = [
      { value: rupees(shares * face), why: 'Took the full face value of the shares, forgetting what has been paid.' },
      { value: rupees(shares * paid), why: 'Gave what has been paid already; the liability is what is still unpaid.' },
      ...(called > paid && called < face ? [{ value: rupees(shares * (called - paid)), why: 'Counted only the calls in arrears; on winding up the uncalled amount can be asked for as well.' }] : []),
      ...(called < face ? [{ value: rupees(shares * (face - called)), why: 'Counted only the uncalled amount and left out the calls not paid.' }] : []),
    ];
    const commonErrors = errors.filter((e, i) => e.value !== answer && errors.findIndex((x) => x.value === e.value) === i);
    if (commonErrors.length < 2) return null;
    return {
      prompt,
      answer,
      commonErrors,
      explanation: [
        'In a company limited by shares a member can be asked for no more than the amount unpaid on the shares held.',
        `Unpaid = ₹${face} - ₹${paid} = ₹${face - paid} a share; ${shares.toLocaleString('en-IN')} x ₹${face - paid} = ${formatINR(answer)}.`,
      ],
      hints: COMPANY_HINTS.liability,
    };
  },
  verify: (q) => {
    const k = keptLiability;
    if (!k || k.prompt !== q.prompt) return false;
    return q.answer === rupees(k.shares * k.face) - rupees(k.shares * k.paid);
  },
});

const companyFeatures: Template[] = [scCompanyFeature, scCompanyType, scCompanyRule, scMemberLiability];

// ---------------------------------------------------------------------------------------------------------------
// Added later, outside the papers (src/generators/outsidePapers.ts): a reissue of forfeited shares as partly paid,
// and a forfeiture when the premium is payable with the application, the allotment or the call.
// ---------------------------------------------------------------------------------------------------------------

const oneLine = (accountId: string, side: 'Dr' | 'Cr', n: number): JournalLine[] => (n > 0 ? [{ accountId, side, amount: rupees(n) }] : []);
const intAfter = (s: string, re: RegExp): number => Number(re.exec(s)?.[1].replace(/,/g, ''));

// 1. sc-entry-reissue-partly-paid: forfeited shares (of a first call not paid) reissued as partly paid, at the paid-up
//    value of the other shares, at a discount or at that value (medium)
const entryReissuePartlyPaid = journalTemplate({
  id: 'sc-entry-reissue-partly-paid', topicId: T, conceptId: 'sc-reissue', difficulty: 'medium', computed: true,
  generate: (rng) => {
    const company = rng.pick(COMPANIES);
    const face = 10;
    const [app, allot, call] = rng.pick([[2, 3, 3], [3, 3, 2], [2, 4, 2], [3, 4, 1], [2, 2, 3]]);
    const called = app + allot + call;
    const paid = app + allot;
    const k = rng.step(200, 2000, 100);
    const j = rng.pick([k, k, Math.max(100, Math.floor(k / 200) * 100)]);
    const discount = rng.int(0, 4) === 0 ? 0 : rng.int(1, paid);
    const price = called - discount;
    const prompt = `${company} forfeited ${cnt(k)} equity shares of ${inr(face)} each, on which ${inr(called)} a share had been called up (${inr(app)} on application, ${inr(allot)} on allotment and ${inr(call)} on the first call), for non-payment of the first call. ${j === k ? 'All of them were' : `${cnt(j)} of them were`} reissued as ${inr(called)} paid up for ${inr(price)} a share. Pass the entry for the reissue.`;
    return {
      prompt,
      lines: [...oneLine('bank', 'Dr', j * price), ...oneLine('forfeitedShares', 'Dr', j * discount), ...oneLine('equityShareCapital', 'Cr', j * called)],
      explanation: [
        `The other shares are ${inr(called)} paid up, and the reissued shares are made the same: ${ac('equityShareCapital')} is credited with ${cnt(j)} x ${inr(called)} = ${inr(j * called)}, not with the face value of ${inr(face)}.`,
        `Cash received = ${cnt(j)} x ${inr(price)} = ${inr(j * price)}: Bank A/c is debited.`,
        discount > 0
          ? `Discount on reissue = ${inr(called)} - ${inr(price)} = ${inr(discount)} a share, ${inr(j * discount)} in all, met out of the amount forfeited: Forfeited Shares A/c is debited. It is within the ${inr(paid)} a share forfeited (application and allotment money), so the reissue is allowed.`
          : 'The price equals the paid-up value, so there is no discount and Forfeited Shares A/c is not touched.',
        'The rest of the forfeited amount stays in Forfeited Shares A/c until it is transferred to Capital Reserve.',
      ],
      distractorAccounts: ['securitiesPremium', 'capitalReserve', 'callsInArrears', 'equityShareFirstCall'],
      hints: [
        'How much is each reissued share treated as paid up? That, not the face value, is credited to Share Capital.',
        'Bank A/c Dr (price received); Forfeited Shares A/c Dr (paid-up value - price); To Share Capital A/c (paid-up value). The discount may not be more than the amount forfeited on the share.',
      ],
    };
  },
  verify: (q) => {
    const called = intAfter(q.prompt, /on which ₹([\d,]+) a share had been called up/);
    const app = intAfter(q.prompt, /\(₹([\d,]+) on application/);
    const allot = intAfter(q.prompt, /₹([\d,]+) on allotment/);
    const price = intAfter(q.prompt, /paid up for ₹([\d,]+) a share/);
    const k = intAfter(q.prompt, /forfeited ([\d,]+) equity/);
    const some = /([\d,]+) of them were/.exec(q.prompt);
    const j = some ? Number(some[1].replace(/,/g, '')) : k;
    const sumOf = (id: string, side: 'Dr' | 'Cr'): number => sum(q.expected.filter((l) => l.accountId === id && l.side === side).map((l) => l.amount));
    return (
      called - price <= app + allot &&
      sumOf('equityShareCapital', 'Cr') === rupees(j * called) &&
      sumOf('bank', 'Dr') === rupees(j * price) &&
      sumOf('forfeitedShares', 'Dr') === rupees(j * (called - price))
    );
  },
});

const PREMIUM_AT = ['application', 'allotment', 'first and final call'] as const;

// 2. sc-entry-forfeiture-premium-call: shares issued at a premium payable with the application, the allotment or the
//    call; a holder who paid the application money (and in some seeds the allotment money) fails to pay the rest and
//    the shares are forfeited after the call: is Securities Premium A/c debited? (complex)
const entryForfeiturePremiumCall = journalTemplate({
  id: 'sc-entry-forfeiture-premium-call', topicId: T, conceptId: 'sc-forfeiture', difficulty: 'complex', computed: true,
  generate: (rng) => {
    const company = rng.pick(COMPANIES);
    const holder = rng.pick(HOLDERS);
    const [app, allot, call] = rng.pick([[3, 4, 3], [2, 5, 3], [3, 3, 4], [2, 4, 4], [3, 5, 2]]);
    const P = rng.pick([1, 2, 3, 5]);
    const at = rng.pick([0, 1, 1, 2, 2] as const);
    const paidAllot = rng.int(0, 1) === 0;
    const k = rng.step(100, 1500, 50);
    const due = (i: number, part: number): number => part + (at === i ? P : 0);
    const premiumUnpaid = at === 2 || (at === 1 && !paidAllot);
    const forfeited = k * (app + (paidAllot ? allot : 0));
    const allotUnpaid = paidAllot ? 0 : k * due(1, allot);
    const callUnpaid = k * due(2, call);
    const prompt = `${company} issued equity shares of ₹10 each at a premium of ${inr(P)} a share, payable ${inr(due(0, app))} on application, ${inr(due(1, allot))} on allotment and ${inr(due(2, call))} on the first and final call, the premium being payable with the ${PREMIUM_AT[at]}. ${holder}, who held ${cnt(k)} shares, paid the application money${paidAllot ? ' and the allotment money' : ''} but did not pay ${paidAllot ? 'the call' : 'the allotment money or the call'}. After the call, ${holder}'s shares were forfeited. No Calls in Arrears A/c is kept. Pass the entry for the forfeiture.`;
    const lines: JournalLine[] = [
      ...oneLine('equityShareCapital', 'Dr', k * 10),
      ...oneLine('securitiesPremium', 'Dr', premiumUnpaid ? k * P : 0),
      ...oneLine('forfeitedShares', 'Cr', forfeited),
      ...oneLine('equityShareAllotment', 'Cr', allotUnpaid),
      ...oneLine('equityShareFirstAndFinalCall', 'Cr', callUnpaid),
    ];
    return {
      prompt,
      lines,
      explanation: [
        `The shares were fully called up: ${ac('equityShareCapital')} is debited with ${cnt(k)} x ₹10 = ${inr(k * 10)}.`,
        at === 0
          ? `The premium came with the application money, which ${holder} paid: it was received, so Securities Premium A/c is not debited.`
          : at === 1 && paidAllot
            ? `The premium came with the allotment money, which ${holder} paid: it was received, so Securities Premium A/c is not debited.`
            : `The premium was payable with the ${PREMIUM_AT[at]}, which ${holder} did not pay: it was credited to Securities Premium A/c when the ${PREMIUM_AT[at]} fell due but never received, so Securities Premium A/c is debited with ${cnt(k)} x ${inr(P)} = ${inr(k * P)}.`,
        `What ${holder} paid towards capital: ${paidAllot ? `${inr(app)} + ${inr(allot)}` : inr(app)} a share x ${cnt(k)} = ${inr(forfeited)}, credited to Forfeited Shares A/c.`,
        ...(allotUnpaid > 0 ? [`The unpaid allotment money, ${cnt(k)} x ${inr(due(1, allot))} = ${inr(allotUnpaid)}, is credited to ${ac('equityShareAllotment')}.`] : []),
        `The unpaid call money, ${cnt(k)} x ${inr(due(2, call))} = ${inr(callUnpaid)}, is credited to ${ac('equityShareFirstAndFinalCall')}.`,
      ],
      distractorAccounts: ['callsInArrears', 'capitalReserve', 'bank', 'equityShareApplication'],
      hints: [
        'With which instalment was the premium payable, and did the holder pay that instalment?',
        'Debit Share Capital with the amount called up; debit Securities Premium only if the premium fell due on an instalment that was not paid; credit Forfeited Shares with what was paid towards capital and each instalment account with what is unpaid on it.',
      ],
    };
  },
  verify: (q) => {
    const P = intAfter(q.prompt, /premium of ₹([\d,]+) a share/);
    const k = intAfter(q.prompt, /held ([\d,]+) shares/);
    const [app, allot, call] = [/payable ₹([\d,]+) on application/, /₹([\d,]+) on allotment/, /₹([\d,]+) on the first and final call/].map((re) => intAfter(q.prompt, re));
    const at = PREMIUM_AT.findIndex((w) => q.prompt.includes(`payable with the ${w}.`));
    const paidAllot = /paid the application money and the allotment money/.test(q.prompt);
    // What the holder failed to pay, premium and all; what was paid towards capital; the premium never received.
    const unpaid = (paidAllot ? 0 : allot) + call;
    const paidCapital = app - (at === 0 ? P : 0) + (paidAllot ? allot - (at === 1 ? P : 0) : 0);
    const reversed = at === 2 || (at === 1 && !paidAllot) ? P : 0;
    const sumOf = (id: string, side: 'Dr' | 'Cr'): number => sum(q.expected.filter((l) => l.accountId === id && l.side === side).map((l) => l.amount));
    return (
      sumOf('equityShareCapital', 'Dr') === rupees(k * 10) &&
      sumOf('securitiesPremium', 'Dr') === rupees(k * reversed) &&
      sumOf('forfeitedShares', 'Cr') === rupees(k * paidCapital) &&
      sumOf('equityShareAllotment', 'Cr') + sumOf('equityShareFirstAndFinalCall', 'Cr') === rupees(k * unpaid)
    );
  },
});


// One-mark Assertion-Reason questions of the board. They stand on their own level and go into no mock paper and no
// Look back (`isAssertionReason`), so nothing that was served before moves.
const scAssertionReason = factsTemplate({
  id: 'sc-assertion-reason', topicId: 'share-capital', conceptId: 'sc-issue', difficulty: 'medium',
  // 2: the item on reserve capital explains R in words that read on their own after A's.
  version: 2,
  facts: assertionReasonFacts([
    {
      answer: 'both',
      assertion: 'A company cannot allot its equity shares of ₹10 each to the public at ₹9 each.',
      reason: 'Section 53 of the Companies Act, 2013 forbids the issue of shares below their face value, sweat equity shares apart.',
      a: '₹9 is a discount of ₹1 on the face value.',
      r: 'Sweat equity shares are the one exception.',
      link: 'R explains A: an issue at ₹9 is exactly what that section forbids.',
    },
    {
      answer: 'both',
      assertion: 'The called-up capital of a company is ₹8,00,000 and calls in arrears are ₹30,000. Its paid-up capital is ₹7,70,000.',
      reason: 'Paid-up capital is the called-up capital less calls in arrears.',
      a: '₹8,00,000 - ₹30,000 = ₹7,70,000.',
      r: 'Calls in arrears were called but never received, so they are not paid up.',
      link: 'R explains A: the ₹7,70,000 is that rule at work.',
    },
    {
      answer: 'both',
      assertion: 'Calls in advance are not a part of share capital.',
      reason: 'Money paid on a call that has not yet been made is not due, so it is held as a liability until the call is made.',
      a: 'Calls in advance are kept in their own account and shown as a liability.',
      r: 'When the call is made: Calls in Advance A/c Dr; To Share Call A/c.',
      link: 'R explains A: until the call is made, the money has not become capital.',
    },
    {
      answer: 'both',
      assertion: 'Shares of ₹10 on which ₹6 was received are forfeited. They can be reissued as fully paid at ₹4 each, but not below that.',
      reason: 'The discount on reissue cannot be more than the amount forfeited on those shares.',
      a: 'The amount forfeited is ₹6, so the price cannot fall below ₹10 - ₹6 = ₹4.',
      r: 'The amount forfeited is all that the company holds to cover a discount on those shares.',
      link: 'R explains A: the limit of ₹4 comes from that rule.',
    },
    {
      answer: 'both',
      assertion: 'If the premium on forfeited shares has been received, Securities Premium A/c is not debited on forfeiture.',
      reason: 'Forfeiture cancels the share capital of those shares; a premium already received stays with the company.',
      a: 'It is debited only when the premium was not received.',
      r: 'The money stays with the company and in Securities Premium A/c.',
      link: 'R explains A: to debit the account would undo a premium the company has received and keeps.',
    },
    {
      answer: 'bothNot',
      assertion: "In a company limited by shares, a shareholder's liability is limited to the amount unpaid on the shares held.",
      reason: 'A company has perpetual succession.',
      a: 'Limited liability is a feature of a company limited by shares.',
      r: 'Members come and go, and the company goes on.',
      link: 'R does not explain A: both are features of a company, but the going on of the company does not limit what a member owes.',
    },
    {
      answer: 'bothNot',
      assertion: 'Preference shareholders receive their dividend before equity shareholders.',
      reason: 'Preference shares carry a right to repayment of capital before equity shares on winding up.',
      a: 'This is the first of the two prior rights of preference shares.',
      r: 'This is the second of the two prior rights.',
      link: 'R does not explain A: they are two separate rights, and one is not the reason for the other.',
    },
    {
      answer: 'bothNot',
      assertion: 'A vendor owed ₹5,50,000 is paid in shares of ₹10 issued at ₹11. The vendor gets 50,000 shares.',
      reason: 'Securities premium is shown under Reserves and Surplus.',
      a: '₹5,50,000 ÷ ₹11 = 50,000 shares.',
      r: 'The ₹1 a share of premium is shown there.',
      link: 'R does not explain A: the number of shares comes from dividing by the issue price; where the premium is shown plays no part.',
    },
    {
      answer: 'aOnly',
      assertion: 'Reserve capital can be called up only on the winding up of the company.',
      reason: 'Reserve capital is built out of capital profits.',
      a: 'It is the part of the uncalled capital kept, by special resolution, for winding up.',
      r: 'R describes a capital reserve, which is built out of capital profits. Reserve capital is a part of the uncalled share capital.',
    },
    {
      answer: 'aOnly',
      assertion: 'A company offers 1,00,000 shares to the public and receives applications for 88,000. It cannot allot any share.',
      reason: 'A company can allot shares only when the whole of the issue has been subscribed.',
      a: 'Applications are below the minimum subscription of 90%, so the application money is returned.',
      r: 'At 90% or more, a company may allot the shares applied for; full subscription is not needed.',
    },
    {
      answer: 'rOnly',
      assertion: 'On 100 forfeited shares, ₹600 was forfeited. They are reissued at a discount of ₹200 in all, and ₹400 is transferred to General Reserve.',
      reason: 'The gain on the reissue of forfeited shares is a capital profit.',
      a: 'The ₹400 is transferred to Capital Reserve, not to General Reserve.',
      r: 'The gain does not come from trading.',
    },
    {
      answer: 'rOnly',
      assertion: 'The balance of Forfeited Shares A/c is shown under Reserves and Surplus.',
      reason: 'The balance of Forfeited Shares A/c is the money received on forfeited shares not yet reissued.',
      a: 'It is added to the subscribed capital in the note on Share Capital.',
      r: 'That balance is what remains of the amount forfeited.',
    },
  ]),
});

// Added after the check against the CBSE 2025-26 syllabus: they come last.
// Added later, outside the papers (outsidePapers.ts): entryReissuePartlyPaid, entryForfeiturePremiumCall.
const all: Template[] = [...templates, ...sets, ...formats, ...companyFeatures, scAssertionReason, entryReissuePartlyPaid, entryForfeiturePremiumCall];

export default all;

/**
 * What the case studies of the company-accounts stage (`src/generators/cases/company-accounts.ts`) reuse of this
 * topic: the issue and its books, the story of an issue told entry by entry, and the wording of its conventions. Only
 * exported here; nothing in this file uses the object, so no question of the topic changes.
 */
export const SC_CASE = {
  COMPANIES, HOLDERS, VENDORS, BOUGHT, H, PAID,
  inr, cnt, sum, ac, cap, stageId, stageName, stage, capitalId, terms, priced, sharesOf, payable,
  books, lineOf, net, sameEntry, numeric, choice, dr, cr, entry,
  drawTerms, drawRatio, proIssue, holding, seal, stepsOf, storyHolds, datesFor, partOf, discountRoom,
  appliedFor, allApplied, excessOf, ownExcess, unpaidOn, unpaidAll, forfeitedOn, premiumLost, calledUpOf, lotShares,
  dues, lapse, arrearsNote, arrearsRule, proRule, offerOf, unpaidNote, drawBusiness,
};
export type { Issue as ScIssue, Float as ScFloat, Defaulter as ScDefaulter, Lot as ScLot, Step as ScStep, StepKind as ScStepKind };
