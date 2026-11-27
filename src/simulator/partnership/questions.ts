import { formatINR, rupees } from '@/engine/money';
import { createRng, type Rng } from '@/engine/rng';
import { appropriate, interestForYear, type AppropriationIn, type PartnerIn } from './appropriation';
import { fr, frText } from './fraction';
import { reconstitute, type ReconIn } from './reconstitution';
import { NAMES, NEW_PARTNER } from './examples';
import type { TryQuestion } from '../tryit';

// The "Try it" questions of the partnership lab: each worked by the lab's own logic, so the answer and the reason are
// always the ones the picture shows. Nothing is recorded.

export type { Answer, TryQuestion } from '../tryit';

const inr = formatINR;
const R = rupees;
const ratioText = (t: readonly number[]) => t.join(':');
const list = (xs: readonly string[]): string => (xs.length <= 1 ? (xs[0] ?? '') : `${xs.slice(0, -1).join(', ')} and ${xs[xs.length - 1]}`);

const RATIOS2 = [[3, 2], [2, 1], [5, 3], [3, 1], [4, 1]];
const RATIOS3 = [[3, 2, 1], [5, 3, 2], [2, 2, 1], [4, 3, 1]];

function shareQuestion(rng: Rng, n: number): TryQuestion {
  const ratio = rng.pick(RATIOS2);
  const partners: PartnerIn[] = [0, 1].map((i) => ({ name: NAMES[i], capital: R(rng.step(200000, 500000, 50000)), ratio: ratio[i], salary: i === 1 ? R(rng.step(24000, 60000, 12000)) : 0, drawings: 0 }));
  const rate = rng.pick([5, 8, 10]);
  const total = ratio[0] + ratio[1];
  const due = partners.reduce((s, x) => s + interestForYear(x.capital, rate) + x.salary, 0);
  const netProfit = due + R(total * 1000 * rng.int(30, 150));
  const input: AppropriationIn = { partners, netProfit, iocRate: rate, iodRate: 0, commission: null, guarantee: null, capitals: 'fluctuating' };
  const a = appropriate(input);
  const i = rng.int(0, 1);
  return {
    id: `share-${n}`,
    kind: 'share',
    label: "A partner's share",
    facts: [
      `${NAMES[0]} and ${NAMES[1]} share profits ${ratioText(ratio)}. Capitals: ${inr(partners[0].capital)} and ${inr(partners[1].capital)}; interest on capital ${rate}% p.a.`,
      `${NAMES[1]} gets a salary of ${inr(partners[1].salary)} a year. Net profit ${inr(netProfit)}.`,
    ],
    prompt: `What is ${NAMES[i]}'s share of the divisible profit?`,
    answer: { type: 'amount', value: a.shares[i] },
    why: [
      `Appropriations: interest on capital ${inr(a.ioc[0])} + ${inr(a.ioc[1])}, salary ${inr(a.salary[1])}: ${inr(a.due)} in all.`,
      `Divisible profit = ${inr(netProfit)} - ${inr(a.due)} = ${inr(a.divisible)}.`,
      `${NAMES[i]}'s share = ${inr(a.divisible)} x ${ratio[i]}/${total} = ${inr(a.shares[i])}.`,
    ],
  };
}

function shortQuestion(rng: Rng, n: number): TryQuestion {
  const caps = [R(rng.step(100000, 400000, 50000)), R(rng.step(100000, 400000, 50000))];
  const rate = rng.pick([6, 10, 12]);
  const due = caps.map((c) => interestForYear(c, rate));
  const totalDue = due[0] + due[1];
  // A profit that is a round share of what is due, so that the answer is in whole rupees.
  const k = rng.pick([1, 2, 3, 4]);
  const netProfit = Math.round(((totalDue * k) / 5) / R(10)) * R(10) || R(1000);
  const partners: PartnerIn[] = [0, 1].map((i) => ({ name: NAMES[i], capital: caps[i], ratio: 1, salary: 0, drawings: 0 }));
  const a = appropriate({ partners, netProfit, iocRate: rate, iodRate: 0, commission: null, guarantee: null, capitals: 'fixed' });
  const i = rng.int(0, 1);
  return {
    id: `short-${n}`,
    kind: 'short',
    label: 'When the profit falls short',
    facts: [
      `${NAMES[0]} and ${NAMES[1]} share profits equally. Capitals: ${inr(caps[0])} and ${inr(caps[1])}; interest on capital ${rate}% p.a., an appropriation (not a charge).`,
      `Net profit for the year ${inr(netProfit)}.`,
    ],
    prompt: `How much interest on capital is ${NAMES[i]} allowed?`,
    answer: { type: 'amount', value: a.ioc[i] },
    why: [
      `Interest due: ${inr(due[0])} + ${inr(due[1])} = ${inr(totalDue)}, more than the profit of ${inr(netProfit)}.`,
      'Interest on capital is an appropriation, so only the profit can be given, in the ratio of the interest due.',
      `${NAMES[i]}: ${inr(netProfit)} x ${inr(due[i])}/${inr(totalDue)} = ${inr(a.ioc[i])}.`,
    ],
  };
}

function guaranteeQuestion(rng: Rng, n: number): TryQuestion {
  const ratio = rng.pick(RATIOS3);
  const total = ratio.reduce((s, t) => s + t, 0);
  const profit = R(total * 10000 * rng.int(5, 20));
  const third = (profit * ratio[2]) / total;
  const amount = third + R(rng.step(5000, 30000, 1000) * (ratio[0] + ratio[1]));
  const partners: PartnerIn[] = NAMES.map((name, i) => ({ name, capital: 0, ratio: ratio[i], salary: 0, drawings: 0 }));
  const a = appropriate({ partners, netProfit: profit, iocRate: 0, iodRate: 0, commission: null, guarantee: { partner: 2, amount, by: 'firm' }, capitals: 'fluctuating' });
  const i = rng.int(0, 1);
  return {
    id: `guarantee-${n}`,
    kind: 'guarantee',
    label: 'A guarantee',
    facts: [`${list([...NAMES])} share profits ${ratioText(ratio)}. The firm guarantees ${NAMES[2]} a share of at least ${inr(amount)}. Profit to share ${inr(profit)}.`],
    prompt: `How much of the deficiency does ${NAMES[i]} bear?`,
    answer: { type: 'amount', value: -a.guaranteeMoves[i] },
    why: [
      `${NAMES[2]}'s share: ${inr(profit)} x ${ratio[2]}/${total} = ${inr(a.shares[2])}. Deficiency = ${inr(amount)} - ${inr(a.shares[2])} = ${inr(a.deficiency)}.`,
      `A guarantee by the firm is borne by the other partners in their own ratio, ${ratio[0]}:${ratio[1]}.`,
      `${NAMES[i]}: ${inr(a.deficiency)} x ${ratio[i]}/${ratio[0] + ratio[1]} = ${inr(-a.guaranteeMoves[i])}.`,
    ],
  };
}

function ratioQuestion(rng: Rng, n: number): TryQuestion {
  const pickKind = rng.int(0, 2);
  if (pickKind === 0) {
    // Admission: the new ratio.
    const ratio = rng.pick(RATIOS2);
    const share = rng.pick([fr(1, 4), fr(1, 5), fr(1, 6)]);
    const r = reconstitute({ names: [NAMES[0], NAMES[1]], ratio, goodwill: 0, event: { kind: 'admission', name: NEW_PARTNER, share, from: { kind: 'old-ratio' }, capital: 0, premium: 'cash' } });
    return {
      id: `ratio-${n}`,
      kind: 'ratio',
      label: 'The new ratio',
      facts: [`${NAMES[0]} and ${NAMES[1]} share profits ${ratioText(ratio)}. ${NEW_PARTNER} is admitted for ${frText(share)} of the profit, taken from them in their old ratio.`],
      prompt: `What is the new profit-sharing ratio of ${NAMES[0]}, ${NAMES[1]} and ${NEW_PARTNER}?`,
      answer: { type: 'ratio', terms: r.newRatio, of: r.names },
      why: [
        `${NEW_PARTNER} takes ${frText(share)}, leaving ${frText(fr(share.d - share.n, share.d))} for the old partners in ${ratioText(ratio)}.`,
        `${list(r.names.map((x, i) => `${x} ${frText(r.newShares[i])}`))}.`,
        `New ratio ${ratioText(r.newRatio)}.`,
      ],
    };
  }
  if (pickKind === 1) {
    // Admission: the sacrificing ratio, found from the old and the new ratio.
    const ratio = rng.pick(RATIOS2);
    const from = rng.pick([{ kind: 'equal' as const }, { kind: 'stated' as const, sacrifices: [fr(3, 20), fr(1, 20)] }, { kind: 'stated' as const, sacrifices: [fr(1, 20), fr(3, 20)] }]);
    const r = reconstitute({ names: [NAMES[0], NAMES[1]], ratio, goodwill: 0, event: { kind: 'admission', name: NEW_PARTNER, share: fr(1, 5), from, capital: 0, premium: 'cash' } });
    return {
      id: `ratio-${n}`,
      kind: 'ratio',
      label: 'The sacrificing ratio',
      facts: [`${NAMES[0]} and ${NAMES[1]} share profits ${ratioText(ratio)}. ${NEW_PARTNER} joins for 1/5, and the new ratio of ${NAMES[0]}, ${NAMES[1]} and ${NEW_PARTNER} is ${ratioText(r.newRatio)}.`],
      prompt: `In what ratio do ${NAMES[0]} and ${NAMES[1]} sacrifice?`,
      answer: { type: 'ratio', terms: r.sacrificingRatio, of: [NAMES[0], NAMES[1]] },
      why: [
        `Sacrifice = old share - new share: ${list([0, 1].map((i) => `${NAMES[i]} ${frText(r.oldShares[i])} - ${frText(r.newShares[i])} = ${frText(fr(-r.change[i].n, r.change[i].d))}`))}.`,
        `Sacrificing ratio ${ratioText(r.sacrificingRatio)}${ratioText(r.sacrificingRatio) === ratioText(ratio) ? ' (the old ratio, as the share was taken in it)' : ', not the old ratio'}.`,
      ],
    };
  }
  // Retirement: the gaining ratio, with a new ratio in which both remaining partners gain.
  for (;;) {
    const ratio = rng.pick(RATIOS3);
    const partner = rng.int(0, 2);
    const newRatio = rng.pick([[1, 1], [2, 1], [3, 2], [1, 2], [2, 3]]);
    const r = reconstitute({ names: [...NAMES], ratio, goodwill: 0, event: { kind: 'retirement', partner, newRatio } });
    if (r.gainers.length !== 2) continue;
    const ri = [0, 1, 2].filter((i) => i !== partner);
    const remaining = ri.map((i) => NAMES[i]);
    return {
      id: `ratio-${n}`,
      kind: 'ratio',
      label: 'The gaining ratio',
      facts: [`${list([...NAMES])} share profits ${ratioText(ratio)}. ${NAMES[partner]} retires; ${remaining.join(' and ')} will share ${ratioText(newRatio)}.`],
      prompt: `In what ratio do ${remaining.join(' and ')} gain?`,
      answer: { type: 'ratio', terms: r.gainingRatio, of: remaining },
      why: [
        `Gain = new share - old share: ${list(ri.map((i) => `${NAMES[i]} ${frText(r.newShares[i])} - ${frText(r.oldShares[i])} = ${frText(r.change[i])}`))}.`,
        `Gaining ratio ${ratioText(r.gainingRatio)}${ratioText(r.gainingRatio) === ratioText(newRatio) ? '' : ', which is not the new ratio'}.`,
      ],
    };
  }
}

function creditedQuestion(rng: Rng, n: number): TryQuestion {
  const three = rng.int(0, 1) === 0;
  let input: ReconIn;
  if (three) {
    const ratio = rng.pick(RATIOS3);
    input = { names: [...NAMES], ratio, goodwill: R(rng.step(60000, 180000, 60000)), event: { kind: 'admission', name: NEW_PARTNER, share: fr(1, 6), from: rng.pick([{ kind: 'one' as const, partner: rng.int(0, 1) }, { kind: 'stated' as const, sacrifices: [fr(1, 12), fr(0), fr(1, 12)] }]), capital: 0, premium: 'cash' } };
  } else {
    const ratio = rng.pick(RATIOS3);
    const shuffled = rng.shuffle(ratio);
    if (shuffled.every((t, i) => t === ratio[i])) shuffled.reverse();
    input = { names: [...NAMES], ratio, goodwill: R(rng.step(60000, 180000, 60000)), event: { kind: 'change', newRatio: shuffled } };
  }
  const r = reconstitute(input);
  const options = r.names.filter((_, i) => i < 3);
  const ev = input.event;
  return {
    id: `credited-${n}`,
    kind: 'credited',
    label: 'Who is credited with goodwill',
    facts:
      ev.kind === 'admission'
        ? [`${list([...NAMES])} share profits ${ratioText(input.ratio)}. ${NEW_PARTNER} is admitted for 1/6 and brings the premium for goodwill in cash. New ratio ${ratioText(r.newRatio)}.`]
        : [`${list([...NAMES])} change their ratio from ${ratioText(input.ratio)} to ${ev.kind === 'change' ? ratioText(ev.newRatio) : ''}.`],
    prompt: 'Whose capital accounts are credited with goodwill? Pick every one.',
    answer: { type: 'pick', options, correct: r.sacrificers, many: true },
    why: [
      `Change = new share - old share: ${list(options.map((x, i) => `${x} ${frText(r.oldShares[i])} → ${frText(r.newShares[i])}`))}.`,
      `Only the partners who sacrifice are credited (${list(r.sacrificers.map((i) => r.names[i]))}); ${ev.kind === 'admission' ? 'a partner whose share does not fall gets nothing' : 'a gaining partner is debited'}.`,
    ],
  };
}

/** A run of questions for a seed: each kind at least once, in an order that the seed decides. */
export function partnershipQuestions(seed: number, count = 6): TryQuestion[] {
  const rng = createRng(seed * 7919 + 17);
  const makers = [shareQuestion, ratioQuestion, creditedQuestion, shortQuestion, guaranteeQuestion];
  const order = [...makers, ...rng.shuffle(makers)].slice(0, Math.max(count, makers.length));
  return order.map((make, n) => make(rng, n));
}
