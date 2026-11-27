import { formatINR, type Paise } from '@/engine/money';
import { createRng, type Rng } from '@/engine/rng';
import { randomInput } from './examples';
import {
  allotDate,
  CASES,
  DAA,
  DISCOUNT,
  figures,
  HOLDERS,
  issueWords,
  LOSS,
  lotWords,
  PREM_RED,
  redeemWords,
  SP,
  story,
  yearEnd,
  type CaseId,
  type DebInput,
  type JLine,
} from './issue';

// ---------------------------------------------------------------------------------------------------------------
// "Try it": quick questions on the picture. While a question is open the picture stands at `shown` steps of the
// issue's story, just before the answer; once it is answered it moves on to `reveal`. Nothing is recorded.
// ---------------------------------------------------------------------------------------------------------------

const inr = formatINR;

export interface Choice {
  id: string;
  text: string;
  /** Why this option is wrong. */
  why?: string;
}
export type Answer = { type: 'number'; value: Paise; mistakes: { value: Paise; why: string }[] } | { type: 'choice'; options: Choice[]; correct: string };

export interface DebAsk {
  kind: DebAskKind;
  prompt: string;
  input: DebInput;
  shown: number;
  reveal: number;
  answer: Answer;
  /** The working, shown with the verdict. */
  reason: string;
}

export const DEB_ASK_KINDS = ['loss', 'premium', 'entry', 'interest'] as const;
export type DebAskKind = (typeof DEB_ASK_KINDS)[number];
export const DEB_ASK_LABEL: Record<DebAskKind, string> = {
  loss: 'The loss on issue',
  premium: 'Securities Premium',
  entry: 'The entry for a case',
  interest: 'Interest and finance costs',
};

/** Named wrong figures; those equal to the answer, to each other or not above nil are dropped. */
function mistakesOf(answer: Paise, list: [Paise, string][]): { value: Paise; why: string }[] {
  const seen = new Set([answer]);
  const out: { value: Paise; why: string }[] = [];
  for (const [value, why] of list) {
    if (value > 0 && Number.isInteger(value) && !seen.has(value)) {
      seen.add(value);
      out.push({ value, why });
    }
  }
  return out;
}

/** The step a story reaches at a step of this id: the number of steps shown once it has played. */
const after = (i: DebInput, id: string): number => story(i).steps.findIndex((s) => s.id === id) + 1;

const termsOf = (i: DebInput): string => `${i.company} allotted ${lotWords(i)} on ${allotDate(i)} ${issueWords(i)}, ${redeemWords(i)}, the whole amount payable with the application`;

/** The cases with a loss: a discount on issue or a premium on redemption. */
const LOSS_CASES: CaseId[] = ['discount-par', 'par-premium', 'discount-premium', 'premium-premium'];

export function debAsk(kind: DebAskKind, rng: Rng): DebAsk {
  switch (kind) {
    case 'loss':
      return lossAsk(rng);
    case 'premium':
      return premiumAsk(rng);
    case 'entry':
      return entryAsk(rng);
    case 'interest':
      return interestAsk(rng);
  }
}

function lossAsk(rng: Rng): DebAsk {
  const input = randomInput(rng, 'cash', rng.pick(LOSS_CASES));
  const f = figures(input);
  const mistakes = mistakesOf(f.loss, [
    [f.discountTotal, 'Counted only the discount: the premium payable on redemption is a loss too, known on the day of issue.'],
    [f.onRedemptionTotal, 'Counted only the premium on redemption: the discount allowed on issue is a loss too.'],
    [f.loss - f.premiumTotal, 'Set the premium received on issue off against the loss: the premium on issue goes to Securities Premium in full, and the loss is recorded in full.'],
    [f.discount + f.onRedemption, `Gave the ${f.lossWord} on one debenture: the question is about the whole issue.`],
    [f.onRedemptionTotal > 0 ? f.n * (f.redemptionPrice - f.issuePrice) : 0, 'Took the gap between the redemption price and the issue price: a premium on issue is not deducted from the loss.'],
    [f.onRedemptionTotal > 0 ? f.nominal + f.onRedemptionTotal : 0, 'Gave the whole amount payable on redemption: only what is paid over the face value is a loss.'],
    [f.discountTotal > 0 && f.onRedemptionTotal > 0 ? Math.abs(f.onRedemptionTotal - f.discountTotal) : 0, 'Set the discount and the premium on redemption off against each other: both are losses to the company, so they are added.'],
    [f.money, `Gave the money received, which is what ${DAA} is debited with: the ${f.lossWord} is the gap between that and what the company owes.`],
  ]);
  return {
    kind: 'loss',
    prompt: `${termsOf(input)}. How much is debited to ${f.lossAccount} when the debentures are allotted?`,
    input,
    shown: after(input, 'money'),
    reveal: after(input, 'allot'),
    answer: { type: 'number', value: f.loss, mistakes },
    reason:
      f.onRedemptionTotal > 0
        ? `Loss on issue = discount ${inr(f.discountTotal)} + premium payable on redemption ${inr(f.onRedemptionTotal)} = ${inr(f.loss)}${f.discountTotal === 0 ? ' (no discount here)' : ''}. Once a premium is payable on redemption the whole loss goes to ${LOSS}.${f.premiumTotal > 0 ? ` The premium on issue, ${inr(f.premiumTotal)}, is credited to Securities Premium and not set off.` : ''}`
        : `Discount on issue = ${input.n.toLocaleString('en-IN')} × ${inr(f.discount)} = ${inr(f.loss)}. Redeemable at par, so it goes to ${DISCOUNT}.`,
  };
}

function premiumAsk(rng: Rng): DebAsk {
  const variant = rng.pick(['credited', 'left', 'left', 'charged'] as const);
  if (variant === 'credited') {
    const input = randomInput(rng, rng.pick(['cash', 'vendor'] as const), rng.pick(['premium-par', 'premium-premium'] as const));
    const f = figures(input);
    const mistakes = mistakesOf(f.premiumTotal, [
      [f.money, 'Gave the whole money received: only the premium goes to Securities Premium, the face value to the debentures.'],
      [f.onRedemptionTotal, 'Gave the premium payable on redemption: that goes to Premium on Redemption of Debentures A/c, a liability.'],
      [f.premium, 'Gave the premium on one debenture: the question is about the whole issue.'],
      [f.premiumTotal - f.onRedemptionTotal, 'Set the premium on redemption off against the premium on issue: each is recorded in full in its own account.'],
    ]);
    return {
      kind: 'premium',
      prompt: `${input.route === 'vendor' ? `${input.company} bought ${input.vendor.asset.toLowerCase()} for ${inr(input.vendor.price)} from ${input.vendor.name} and paid by allotting ${input.rate}% Debentures of ${inr(f.face)} each ${issueWords(input)}, ${redeemWords(input)}` : termsOf(input)}. How much is credited to ${SP} on allotment?`,
      input,
      shown: after(input, input.route === 'vendor' ? 'asset' : 'money'),
      reveal: after(input, 'allot'),
      answer: { type: 'number', value: f.premiumTotal, mistakes },
      reason: `${input.route === 'vendor' ? `Number of debentures = ${inr(input.vendor.price)} / ${inr(f.issuePrice)} = ${f.n.toLocaleString('en-IN')}. ` : ''}Premium on issue = ${f.n.toLocaleString('en-IN')} × ${inr(f.premium)} = ${inr(f.premiumTotal)}, credited to ${SP}.${f.onRedemptionTotal > 0 ? ` The premium payable on redemption, ${inr(f.onRedemptionTotal)}, goes to ${PREM_RED}.` : ''}`,
    };
  }
  // The balance left in Securities Premium, or what the Statement of Profit and Loss bears, after the write-off.
  let input = randomInput(rng, 'cash', rng.pick(LOSS_CASES));
  for (let k = 0; k < 40; k++) {
    const f = figures(input);
    if (variant === 'left' ? f.spLeft > 0 && f.fromSp > 0 : f.fromPl > 0 && f.fromSp > 0 && f.fromSp !== f.fromPl) break;
    input = randomInput(rng, 'cash', rng.pick(LOSS_CASES));
  }
  const f = figures(input);
  const before = input.spBefore > 0 ? `Securities Premium A/c had a balance of ${inr(input.spBefore)} before the issue` : 'Securities Premium A/c had no balance before the issue';
  const working = `${f.lossWord === 'loss' ? 'Loss' : 'Discount'} on issue = ${inr(f.loss)}. Securities Premium available = ${input.spBefore > 0 && f.premiumTotal > 0 ? `${inr(input.spBefore)} + ${inr(f.premiumTotal)} from this issue = ` : ''}${inr(f.available)}. It bears ${inr(f.fromSp)}${f.fromPl > 0 ? `, and the Statement of Profit and Loss the other ${inr(f.fromPl)}` : ''}.`;
  if (variant === 'left') {
    const mistakes = mistakesOf(f.spLeft, [
      [f.available, `Left the write-off out: the ${f.lossWord} is written off against Securities Premium first, in the year of allotment.`],
      [input.spBefore, `Gave the balance before the issue: the premium of this issue is added, and the ${f.lossWord} taken off.`],
      [f.available + f.loss, `Added the ${f.lossWord} instead of deducting it.`],
      [f.premiumTotal, `Gave only the premium of this issue: the balance before the issue is part of Securities Premium too, and the ${f.lossWord} comes off.`],
    ]);
    return {
      kind: 'premium',
      prompt: `${termsOf(input)}. ${before}. The ${f.lossWord} on issue is written off on ${yearEnd(input)}, as the rule says. What balance is left in ${SP}?`,
      input,
      shown: after(input, 'allot'),
      reveal: after(input, 'writeOff'),
      answer: { type: 'number', value: f.spLeft, mistakes },
      reason: `${working} Left: ${inr(f.available)} - ${inr(f.fromSp)} = ${inr(f.spLeft)}, shown under Reserves and surplus.`,
    };
  }
  const mistakes = mistakesOf(f.fromPl, [
    [f.loss, `Charged the whole ${f.lossWord} to the Statement of Profit and Loss: Securities Premium bears what it can first.`],
    [f.fromSp, 'Gave the part that Securities Premium bears.'],
    [f.loss - input.spBefore, `Forgot that the premium received on this very issue is in Securities Premium and bears the ${f.lossWord} too.`],
    [f.loss - f.premiumTotal, `Used only the premium of this issue: the balance before the issue bears the ${f.lossWord} too.`],
    [f.fromPl + f.interest, `Added the interest of the year: it is charged too, but the question is about the ${f.lossWord} alone.`],
  ]);
  return {
    kind: 'premium',
    prompt: `${termsOf(input)}. ${before}. The ${f.lossWord} on issue is written off on ${yearEnd(input)}, as the rule says. How much of it is charged to the Statement of Profit and Loss?`,
    input,
    shown: after(input, 'allot'),
    reveal: after(input, 'writeOff'),
    answer: { type: 'number', value: f.fromPl, mistakes },
    reason: `${working} The part charged to the Statement of Profit and Loss is a finance cost.`,
  };
}

/** An entry as one line of text: "Debenture Application and Allotment A/c Dr ₹95,000; To 9% Debentures A/c ₹1,00,000". */
export const entryText = (ls: JLine[]): string =>
  [...ls.filter((l) => l.side === 'Dr'), ...ls.filter((l) => l.side === 'Cr')].filter((l) => l.amount > 0).map((l) => (l.side === 'Dr' ? `${l.account} Dr ${inr(l.amount)}` : `To ${l.account} ${inr(l.amount)}`)).join('; ');

function entryAsk(rng: Rng): DebAsk {
  const input = randomInput(rng, 'cash');
  const f = figures(input);
  const deb = `${input.rate}% Debentures A/c`;
  const dr = (account: string, amount: Paise): JLine => ({ account, side: 'Dr', amount });
  const cr = (account: string, amount: Paise): JLine => ({ account, side: 'Cr', amount });
  const right = story(input).steps.find((s) => s.id === 'allot')!.entries[0].lines;
  const wrong: [JLine[], string][] = [];
  if (f.onRedemptionTotal > 0 && f.discountTotal > 0) wrong.push([[dr(DAA, f.money), dr(DISCOUNT, f.discountTotal), dr(LOSS, f.onRedemptionTotal), cr(deb, f.nominal), cr(PREM_RED, f.onRedemptionTotal)], `Kept the discount apart: once a premium is payable on redemption, the whole loss goes to ${LOSS}.`]);
  if (f.onRedemptionTotal > 0 && f.premiumTotal > 0) wrong.push([[dr(DAA, f.money), dr(LOSS, f.onRedemptionTotal - f.premiumTotal), cr(deb, f.nominal), cr(PREM_RED, f.onRedemptionTotal)], 'Set the premium on issue off against the premium on redemption: each is recorded in full, the one in Securities Premium, the other as a loss and a liability.']);
  if (f.onRedemptionTotal > 0) wrong.push([[dr(DAA, f.money), dr(DISCOUNT, f.discountTotal), cr(deb, f.nominal), cr(SP, f.premiumTotal)], 'Left out the premium payable on redemption: it is owed from the day of issue, so it is provided for in this entry.']);
  if (f.onRedemptionTotal > 0 && f.premiumTotal === 0) wrong.push([[dr(DAA, f.money), dr(SP, f.loss), cr(deb, f.nominal), cr(PREM_RED, f.onRedemptionTotal)], 'Debited Securities Premium in the entry of allotment: the loss is debited to Loss on Issue of Debentures A/c now, and written off against Securities Premium at the year end.']);
  if (f.onRedemptionTotal === 0 && f.discountTotal > 0) wrong.push([[dr(DAA, f.money), dr(LOSS, f.discountTotal), cr(deb, f.nominal)], `Used ${LOSS}: a discount alone, with redemption at par, goes to ${DISCOUNT}.`]);
  if (f.onRedemptionTotal === 0 && f.premiumTotal > 0) wrong.push([[dr(DAA, f.money), cr(deb, f.nominal), cr(PREM_RED, f.premiumTotal)], `Credited the premium on issue to ${PREM_RED}: a premium received on issue goes to ${SP}.`]);
  if (f.money !== f.nominal) wrong.push([[dr(DAA, f.money), cr(deb, f.money)], 'Credited the debentures with the money received: the debentures account always shows the face value, and the difference goes to its own account.']);
  wrong.push([[dr('Bank A/c', f.money), ...right.filter((l) => l.side === 'Dr' && l.account !== DAA), ...right.filter((l) => l.side === 'Cr')], `Debited Bank again: the money was banked when it came in, and was credited to ${DAA}, which is debited now to close it.`]);
  wrong.push([right.map((l) => ({ ...l, side: l.side === 'Dr' ? 'Cr' : 'Dr' }) as JLine), 'Turned the entry round: the debentures are a liability, so they are credited.']);
  wrong.push([[dr(DAA, f.money), cr(HOLDERS, f.money)], `Credited ${HOLDERS}: that account is for interest due; the loan itself goes to the debentures account.`]);
  const options: Choice[] = [{ id: 'right', text: entryText(right) }];
  for (const [ls, why] of wrong) {
    const text = entryText(ls);
    if (options.length < 4 && !options.some((o) => o.text === text)) options.push({ id: `w${options.length}`, text, why });
  }
  const c = CASES.find((x) => x.issueAt === input.issueAt && x.redeemAt === input.redeemAt)!;
  return {
    kind: 'entry',
    prompt: `${termsOf(input)}: ${c.label.toLowerCase()}. The money, ${inr(f.money)}, is in ${DAA}. Which is the entry for the allotment?`,
    input,
    shown: after(input, 'money'),
    reveal: after(input, 'allot'),
    answer: { type: 'choice', options: rng.shuffle(options), correct: 'right' },
    reason: story(input).steps.find((s) => s.id === 'allot')!.text,
  };
}

function interestAsk(rng: Rng): DebAsk {
  const input = randomInput(rng, rng.pick(['cash', 'cash', 'vendor'] as const));
  if (input.month === 'April') input.month = rng.pick(['July', 'October', 'January'] as const);
  const f = figures(input);
  const finance = rng.int(0, 2) === 0 && f.fromPl > 0;
  const full = (f.nominal * input.rate) / 100;
  const onPrice = (f.money * input.rate * f.months) / 1200;
  const onRedemption = ((f.nominal + f.onRedemptionTotal) * input.rate * f.months) / 1200;
  const when = input.route === 'vendor' ? `${input.company} allotted ${lotWords(input)} ${issueWords(input)} to ${input.vendor.name} on ${allotDate(input)}, ${redeemWords(input)}` : termsOf(input);
  const working = `Interest = ${inr(f.nominal)} × ${input.rate}% × ${f.months}/12 = ${inr(f.interest)}: on the face value, for the ${f.months} months from ${allotDate(input)} to ${yearEnd(input)}.`;
  if (finance) {
    const mistakes = mistakesOf(f.financeCosts, [
      [f.interest, `Gave the interest alone: the part of the ${f.lossWord} that Securities Premium could not bear is a finance cost too.`],
      [f.interest + f.loss, `Charged the whole ${f.lossWord}: Securities Premium bears what it can first.`],
      [full + f.fromPl, 'Charged a full year of interest: the debentures were outstanding only from the date of allotment.'],
      [f.fromPl, 'Left out the interest.'],
    ]);
    return {
      kind: 'interest',
      prompt: `${when}. Securities Premium A/c had ${input.spBefore > 0 ? `a balance of ${inr(input.spBefore)}` : 'no balance'} before the issue. Interest is paid half-yearly on 30 September and 31 March, and the ${f.lossWord} is written off on ${yearEnd(input)}. What are the finance costs of the year from these debentures?`,
      input,
      shown: after(input, 'allot'),
      reveal: after(input, 'close'),
      answer: { type: 'number', value: f.financeCosts, mistakes },
      reason: `${working} The ${f.lossWord} of ${inr(f.loss)} is written off: Securities Premium bears ${inr(f.fromSp)}, the Statement of Profit and Loss ${inr(f.fromPl)}. Finance costs = ${inr(f.interest)} + ${inr(f.fromPl)} = ${inr(f.financeCosts)}.`,
    };
  }
  const mistakes = mistakesOf(f.interest, [
    [full, 'Charged a full year: the debentures were outstanding only from the date of allotment.'],
    [onPrice, 'Worked the interest on the issue price: interest is on the face value.'],
    [onRedemption, 'Worked the interest on the amount payable on redemption: interest is on the face value.'],
    [f.halves[1] !== f.interest ? f.halves[1] : 0, 'Counted only the half-year to 31 March: the interest to 30 September is an expense of the year too.'],
    [f.months !== 6 ? full / 2 : 0, `Took a half-year: the debentures were outstanding for ${f.months} months of this year.`],
    [(f.face * input.rate * f.months) / 1200, 'Gave the interest on one debenture: the question is about the whole issue.'],
    [(f.nominal * input.rate * (12 - f.months)) / 1200, `Counted the months before the allotment: interest runs from ${allotDate(input)} to ${yearEnd(input)}.`],
  ]);
  return {
    kind: 'interest',
    prompt: `${when}. Interest is paid half-yearly on 30 September and 31 March. What is the interest on these debentures for the year ended ${yearEnd(input)}?`,
    input,
    shown: after(input, 'allot'),
    reveal: after(input, 'close'),
    answer: { type: 'number', value: f.interest, mistakes },
    reason: `${working}${f.halves[0] > 0 ? ` Paid as ${inr(f.halves[0])} on 30 September and ${inr(f.halves[1])} on 31 March.` : ''}`,
  };
}

/** The made-up figures of the `n`th question of a kind, from a seed: the screen and the tests draw the same. */
export const askRng = (seed: number, kind: DebAskKind, n: number): Rng => createRng(seed * 1013 + DEB_ASK_KINDS.indexOf(kind) * 137 + n);
