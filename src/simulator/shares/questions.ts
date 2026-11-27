import { formatINR, rupees } from '@/engine/money';
import { createRng, type Rng } from '@/engine/rng';
import type { TryQuestion } from '../tryit';
import { newIssue } from './examples';
import { callLabel, issueShares, type IssueIn } from './issue';

// The "Try it" questions of the share-capital lab, each worked by the lab's own logic. Nothing is recorded.

const inr = formatINR;
const R = rupees;
const qty = (n: number) => new Intl.NumberFormat('en-IN').format(n);
const HOLDERS = ['Meera Iyer', 'Kabir Shah', 'Tenzin Dorje', 'Farida Khan', 'Joseph Mathew', 'Anil Rao'];

/** The terms of an issue in words, as a question states them. */
export function describeIssue(x: IssueIn, holder = 'A shareholder'): string[] {
  const n = x.calls.length;
  const parts = [
    `${inr(x.application)} on application`,
    `${inr(x.allotment + x.premium)} on allotment${x.premium > 0 ? ' (including the premium)' : ''}`,
    ...x.calls.map((c, i) => `${inr(c)} on ${callLabel(n, i).toLowerCase()}`),
  ];
  const out = [
    `${x.company} offered ${qty(x.offered)} equity shares of ${inr(x.face)} each${x.premium > 0 ? ` at a premium of ${inr(x.premium)}` : ''}, payable ${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]}.`,
  ];
  const pool = x.applied - x.rejected;
  const refundsExcess = (pool - x.offered) * x.application > x.offered * (x.allotment + x.premium);
  if (pool > x.offered) {
    out.push(
      `Applications were received for ${qty(x.applied)} shares.${x.rejected > 0 ? ` Those for ${qty(x.rejected)} shares were rejected and their money refunded;` : ''} ${x.rejected > 0 ? 'the rest were' : 'They were'} allotted ${qty(x.offered)} shares pro rata, the excess application money being set against the allotment${refundsExcess ? ' and the rest of it refunded' : ''}.`,
    );
  } else if (x.rejected > 0) {
    out.push(`Applications were received for ${qty(x.applied)} shares. Those for ${qty(x.rejected)} shares were rejected and their money refunded; the rest were allotted in full.`);
  } else {
    out.push(`Applications were received for exactly ${qty(x.offered)} shares, and all were allotted.`);
  }
  if (x.defaulter) {
    const d = x.defaulter;
    const appliedFor = (d.shares * pool) / x.offered;
    const missed =
      d.paid === 'application'
        ? `did not pay the allotment money or ${x.forfeitEarly ? 'the first call' : n === 1 ? 'the call' : 'any call'}`
        : d.paid === 'allotment'
          ? `paid the allotment money but not the ${x.forfeitEarly || n === 1 ? callLabel(n, 0).toLowerCase() : 'calls'}`
          : `did not pay the ${callLabel(n, 1).toLowerCase()}`;
    out.push(
      `${holder}, allotted ${qty(d.shares)} shares${appliedFor !== d.shares ? ` (having applied for ${qty(appliedFor)})` : ''}, ${missed}. The shares were forfeited after the ${x.forfeitEarly ? 'first call' : `${callLabel(n, n - 1).toLowerCase()}`}${x.forfeitEarly ? ', before the final call was made' : ''}.`,
    );
  }
  if (x.reissue) out.push(`${x.reissue.shares === x.defaulter?.shares ? 'All of them were' : `${qty(x.reissue.shares)} of them were`} reissued as fully paid at ${inr(x.reissue.price)} a share.`);
  return out;
}

function allotmentQuestion(rng: Rng, n: number): TryQuestion {
  for (;;) {
    const [num, den] = rng.pick([[5, 4], [4, 3], [3, 2], [2, 1]]);
    const k = rng.int(1, 6);
    const allotted = den * 100 * k;
    const applied = num * 100 * k;
    const a = R(rng.pick([2, 3, 4]));
    const b = R(rng.pick([3, 4, 5]));
    const p = R(rng.pick([0, 1, 2, 3]));
    const excess = (applied - allotted) * a;
    const due = allotted * (b + p);
    if (excess >= due) continue;
    return {
      id: `allotment-${n}`,
      kind: 'allotment',
      label: 'Money due on allotment',
      facts: [
        `Shares of ₹10 are issued${p > 0 ? ` at a premium of ${inr(p)}` : ''}: ${inr(a)} on application and ${inr(b + p)} on allotment${p > 0 ? ' (including the premium)' : ''}. The issue was over-subscribed and allotted pro rata, the excess application money being set against the allotment.`,
        `${rng.pick(HOLDERS)} applied for ${qty(applied)} shares and was allotted ${qty(allotted)}.`,
      ],
      prompt: 'How much must this applicant still pay on allotment?',
      answer: { type: 'amount', value: due - excess },
      why: [
        `Allotment money due: ${qty(allotted)} x ${inr(b + p)} = ${inr(due)}.`,
        `Excess application money: (${qty(applied)} - ${qty(allotted)}) x ${inr(a)} = ${inr(excess)}, already paid and set against it.`,
        `Still to pay: ${inr(due)} - ${inr(excess)} = ${inr(due - excess)}.`,
      ],
    };
  }
}

/** An issue with a forfeiture (and, when asked, a reissue that leaves a capital profit). */
function forfeitedIssue(rng: Rng, opts: { reissue?: boolean; early?: boolean } = {}): IssueIn {
  for (;;) {
    const x = newIssue(rng);
    if (!x.defaulter) continue;
    if (opts.early !== undefined && x.forfeitEarly !== opts.early) continue;
    if (opts.reissue && (!x.reissue || issueShares(x).figures.capitalReserve <= 0)) continue;
    if (opts.reissue === false) x.reissue = null;
    return x;
  }
}

function forfeitedQuestion(rng: Rng, n: number): TryQuestion {
  const x = forfeitedIssue(rng, { reissue: false });
  const f = issueShares(x).figures;
  const d = x.defaulter!.shares;
  return {
    id: `forfeited-${n}`,
    kind: 'forfeited',
    label: 'The amount forfeited',
    facts: describeIssue(x, rng.pick(HOLDERS)),
    prompt: 'How much is credited to Forfeited Shares A/c?',
    answer: { type: 'amount', value: f.forfeited },
    why: [
      `Share Capital A/c is debited with the amount called up on the ${qty(d)} shares: ${inr(f.calledUpOnForfeited)}${f.premiumUnpaidOnForfeited > 0 ? `; Securities Premium A/c with the premium not received: ${inr(f.premiumUnpaidOnForfeited)}` : ''}.`,
      `Calls in Arrears A/c is credited with what was not paid: ${inr(f.unpaidOnForfeited)}.`,
      `Forfeited Shares A/c takes what was received towards capital: ${inr(f.calledUpOnForfeited)}${f.premiumUnpaidOnForfeited > 0 ? ` + ${inr(f.premiumUnpaidOnForfeited)}` : ''} - ${inr(f.unpaidOnForfeited)} = ${inr(f.forfeited)}.`,
    ],
  };
}

function capitalDebitQuestion(rng: Rng, n: number): TryQuestion {
  const x = forfeitedIssue(rng, { reissue: false, early: rng.int(0, 1) === 0 });
  const f = issueShares(x).figures;
  const d = x.defaulter!.shares;
  const per = f.calledUpOnForfeited / d;
  return {
    id: `capital-${n}`,
    kind: 'capital',
    label: 'Share capital on forfeiture',
    facts: describeIssue(x, rng.pick(HOLDERS)),
    prompt: 'On forfeiture, Share Capital A/c is debited with how much?',
    answer: { type: 'amount', value: f.calledUpOnForfeited },
    why: [
      'Share Capital A/c was credited with every amount called on the shares, so forfeiture takes back the amount called up, not the face value and not the amount paid.',
      `Called up a share at the time of forfeiture: ${inr(per)}${x.forfeitEarly ? ' (the final call had not been made)' : ''}. ${qty(d)} x ${inr(per)} = ${inr(f.calledUpOnForfeited)}.`,
    ],
  };
}

function reserveQuestion(rng: Rng, n: number): TryQuestion {
  const x = forfeitedIssue(rng, { reissue: true });
  const f = issueShares(x).figures;
  const d = x.defaulter!.shares;
  const r = x.reissue!.shares;
  const onThese = (f.forfeited * r) / d;
  return {
    id: `reserve-${n}`,
    kind: 'reserve',
    label: 'Capital reserve',
    facts: describeIssue(x, rng.pick(HOLDERS)),
    prompt: 'How much is transferred to Capital Reserve A/c?',
    answer: { type: 'amount', value: f.capitalReserve },
    why: [
      `Forfeited on the ${qty(d)} shares: ${inr(f.forfeited)}${r < d ? `; on the ${qty(r)} reissued: ${inr(f.forfeited)} x ${qty(r)}/${qty(d)} = ${inr(onThese)}` : ''}.`,
      `Discount on reissue: ${qty(r)} x ${inr(x.face - x.reissue!.price)} = ${inr(f.discountOnReissue)}.`,
      `Capital reserve = ${inr(onThese)} - ${inr(f.discountOnReissue)} = ${inr(f.capitalReserve)}.${r < d ? ' The rest stays in Forfeited Shares A/c until those shares are reissued.' : ''}`,
    ],
  };
}

function debitedQuestion(rng: Rng, n: number): TryQuestion {
  const withPremium = rng.int(0, 1) === 0;
  let x: IssueIn;
  for (;;) {
    x = forfeitedIssue(rng, { reissue: false });
    const f = issueShares(x).figures;
    if (withPremium === f.premiumUnpaidOnForfeited > 0) break;
  }
  const f = issueShares(x).figures;
  const options = ['Share Capital A/c', 'Securities Premium A/c', 'Calls in Arrears A/c', 'Forfeited Shares A/c'];
  return {
    id: `debited-${n}`,
    kind: 'debited',
    label: 'The forfeiture entry',
    facts: describeIssue(x, rng.pick(HOLDERS)),
    prompt: 'Which accounts are debited in the entry for the forfeiture? Pick every one.',
    answer: { type: 'pick', options, correct: f.premiumUnpaidOnForfeited > 0 ? [0, 1] : [0], many: true },
    why: [
      `Share Capital A/c Dr ${inr(f.calledUpOnForfeited)}: the amount called up.`,
      f.premiumUnpaidOnForfeited > 0
        ? `Securities Premium A/c Dr ${inr(f.premiumUnpaidOnForfeited)}: the premium was due with the allotment money, which was not paid.`
        : x.premium > 0
          ? 'Securities Premium A/c is not touched: the premium was received with the allotment money, and a premium received is never taken back.'
          : 'There is no premium on these shares.',
      `Calls in Arrears A/c (${inr(f.unpaidOnForfeited)}) and Forfeited Shares A/c (${inr(f.forfeited)}) are credited.`,
    ],
  };
}

/** A run of questions for a seed: each kind at least once. */
export function sharesQuestions(seed: number, count = 6): TryQuestion[] {
  const rng = createRng(seed * 104729 + 3);
  const makers = [allotmentQuestion, forfeitedQuestion, reserveQuestion, capitalDebitQuestion, debitedQuestion];
  const order = [...makers, ...rng.shuffle(makers)].slice(0, Math.max(count, makers.length));
  return order.map((make, n) => make(rng, n));
}
