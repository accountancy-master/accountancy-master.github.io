import { formatINR, type Paise } from '@/engine/money';
import { add, cmp, div, fr, frText, isZero, mul, ratioOf, sharesOf, sub, sum, ZERO, ONE, type Fr } from './fraction';
import { splitByRatio } from './split';

// ---------------------------------------------------------------------------------------------------------------
// A change in who shares the profit: a new partner admitted, a new ratio among the same partners, a partner who
// retires or dies. Worked as NCERT Class 12 works it (CBSE 2025-26):
//
// - Each partner's change = new share - old share. A fall is a sacrifice, a rise a gain. Sacrificing ratio = the
//   ratio of the sacrifices; gaining ratio = the ratio of the gains.
// - Admission: the new partner's share comes from the old partners in their old ratio (unless stated), equally, from
//   one partner, or as stated sacrifices. The premium for goodwill (the firm's goodwill x the new partner's share),
//   brought in cash, is credited to the sacrificing partners in their sacrificing ratio through Premium for Goodwill
//   A/c (AS 26: goodwill itself is not raised in the books). If it is not brought in cash, the new partner's capital
//   account is debited with it instead.
// - Change in ratio: the gaining partners' capital accounts are debited and the sacrificing partners' credited,
//   each with the firm's goodwill x the change in share.
// - Retirement or death: the remaining partners take the leaving partner's share in their old ratio (unless a new
//   ratio is stated). The leaving partner's share of goodwill (the firm's goodwill x that share) is credited to the
//   leaving partner's capital account and debited to the gaining partners in their gaining ratio.
// Capitals are fluctuating and no goodwill stands in the books (so none is written off first).
// ---------------------------------------------------------------------------------------------------------------

export type ReconKind = 'admission' | 'change' | 'retirement' | 'death';

export type AdmissionFrom = { kind: 'old-ratio' } | { kind: 'equal' } | { kind: 'one'; partner: number } | { kind: 'stated'; sacrifices: Fr[] };

export type ReconEvent =
  | { kind: 'admission'; name: string; share: Fr; from: AdmissionFrom; capital: Paise; premium: 'cash' | 'capital' }
  | { kind: 'change'; newRatio: number[] }
  | { kind: 'retirement' | 'death'; partner: number; newRatio: 'old-ratio' | number[] };

export interface ReconIn {
  names: string[];
  /** The old profit-sharing ratio. */
  ratio: number[];
  /** The goodwill of the firm, valued at the date of the change. */
  goodwill: Paise;
  event: ReconEvent;
}

/** A wedge of the profit: who held it in the old ratio, and who holds it in the new. */
export interface Piece {
  from: number;
  to: number;
  size: Fr;
  /** Where it starts on the circle, as a part of the whole, in the old ratio and in the new. */
  oldStart: Fr;
  newStart: Fr;
  /** A piece that changes hands (not one that a partner keeps). */
  moves: boolean;
}

export interface EntryLine {
  account: string;
  side: 'Dr' | 'Cr';
  amount: Paise;
}

export interface Entry {
  lines: EntryLine[];
  narration: string;
}

export interface ReconFlow {
  /** A partner by index, or the bank. */
  from: number | 'bank';
  to: number | 'bank';
  amount: Paise;
  label: string;
}

export interface ReconStep {
  key: 'old' | 'split' | 'new' | 'goodwill' | 'premium';
  title: string;
  text: string;
  flows: ReconFlow[];
  /** The entries written by the end of this step. */
  entries: number;
}

export interface Recon {
  input: ReconIn;
  /** Every partner involved: the old ones, then a new one. */
  names: string[];
  oldShares: Fr[];
  newShares: Fr[];
  /** New share - old share: negative for a sacrifice. */
  change: Fr[];
  oldRatio: number[];
  /** Terms of the new ratio, 0 for a partner who has left. */
  newRatio: number[];
  sacrificers: number[];
  gainers: number[];
  /** The ratio of the sacrifices, over `sacrificers`. */
  sacrificingRatio: number[];
  /** The ratio of the gains, over `gainers`. */
  gainingRatio: number[];
  pieces: Piece[];
  /** The goodwill each partner's capital account is credited (positive) or debited (negative) with. */
  goodwillShares: Paise[];
  /** The premium for goodwill (admission) or the leaving partner's share of goodwill. */
  goodwillAmount: Paise;
  entries: Entry[];
  steps: ReconStep[];
  /** The partner who leaves, or the one who joins. */
  subject: number | null;
}

const inr = formatINR;
const list = (xs: readonly string[]): string => (xs.length <= 1 ? (xs[0] ?? '') : `${xs.slice(0, -1).join(', ')} and ${xs[xs.length - 1]}`);
const cap = (name: string) => `${name}'s Capital A/c`;
const ratioText = (t: readonly number[]) => t.join(':');
/** "in their sacrificing ratio 3:2", or "alone" when one partner is all there is. */
const inRatio = (who: string[], terms: readonly number[], kind: string) => (who.length === 1 ? `${who[0]} alone` : `in their ${kind} ratio ${ratioText(terms)}`);

/** The problem with an event's figures, or null when it can be worked. */
export function reconProblem(input: ReconIn): string | null {
  const { names, ratio, event } = input;
  if (names.length !== ratio.length || ratio.some((t) => !Number.isInteger(t) || t <= 0)) return 'Give every partner a whole-number term of the ratio.';
  if (event.kind === 'admission') {
    if (cmp(event.share, ZERO) <= 0 || cmp(event.share, ONE) >= 0) return "The new partner's share must be more than nothing and less than the whole.";
    if (event.from.kind === 'one' && cmp(sharesOf(ratio)[event.from.partner], event.share) < 0) return 'That partner does not have enough share to give.';
    if (event.from.kind === 'equal') {
      const each = div(event.share, fr(names.length));
      if (sharesOf(ratio).some((s) => cmp(s, each) < 0)) return 'A partner does not have enough share to give an equal part.';
    }
    if (event.from.kind === 'stated') {
      const s = event.from.sacrifices;
      if (s.length !== names.length || cmp(sum(s), event.share) !== 0) return "The sacrifices must add up to the new partner's share.";
      if (s.some((x, i) => cmp(x, ZERO) < 0 || cmp(x, sharesOf(ratio)[i]) > 0)) return 'A sacrifice cannot be more than the partner\'s share.';
    }
  }
  if (event.kind === 'change') {
    if (event.newRatio.length !== names.length || event.newRatio.some((t) => !Number.isInteger(t) || t <= 0)) return 'Give every partner a whole-number term of the new ratio, at least 1.';
    const a = sharesOf(ratio);
    const b = sharesOf(event.newRatio);
    if (a.every((x, i) => cmp(x, b[i]) === 0)) return 'The new ratio is the same as the old one: nothing changes hands.';
  }
  if (event.kind === 'retirement' || event.kind === 'death') {
    if (names.length < 3) return 'A firm of two partners is dissolved, not continued, when one leaves: take three partners.';
    if (event.newRatio !== 'old-ratio' && (event.newRatio.length !== names.length - 1 || event.newRatio.some((t) => !Number.isInteger(t) || t <= 0))) return 'Give each remaining partner a term of the new ratio.';
  }
  return null;
}

export function reconstitute(input: ReconIn): Recon {
  const problem = reconProblem(input);
  if (problem) throw new Error(problem);
  const { ratio, goodwill, event } = input;
  const old = sharesOf(ratio);
  let names = [...input.names];
  let oldShares = old;
  let newShares: Fr[];
  let subject: number | null = null;

  if (event.kind === 'admission') {
    names = [...names, event.name];
    oldShares = [...old, ZERO];
    subject = names.length - 1;
    const s = event.share;
    let sacrifices: Fr[];
    if (event.from.kind === 'old-ratio') sacrifices = old.map((o) => mul(o, s));
    else if (event.from.kind === 'equal') sacrifices = old.map(() => div(s, fr(old.length)));
    else if (event.from.kind === 'one') {
      const p = event.from.partner;
      sacrifices = old.map((_, i) => (i === p ? s : ZERO));
    } else sacrifices = event.from.sacrifices;
    newShares = [...old.map((o, i) => sub(o, sacrifices[i])), s];
  } else if (event.kind === 'change') {
    newShares = sharesOf(event.newRatio);
  } else {
    subject = event.partner;
    const leaving = old[event.partner];
    if (event.newRatio === 'old-ratio') {
      const rest = sub(ONE, leaving);
      newShares = old.map((o, i) => (i === event.partner ? ZERO : div(o, rest)));
    } else {
      const remaining = sharesOf(event.newRatio);
      let k = 0;
      newShares = old.map((_, i) => (i === event.partner ? ZERO : remaining[k++]));
    }
  }

  const change = newShares.map((n, i) => sub(n, oldShares[i]));
  const sacrificers = change.map((c, i) => (cmp(c, ZERO) < 0 ? i : -1)).filter((i) => i >= 0);
  const gainers = change.map((c, i) => (cmp(c, ZERO) > 0 ? i : -1)).filter((i) => i >= 0);
  const sacrificingRatio = ratioOf(sacrificers.map((i) => mul(change[i], fr(-1))));
  const gainingRatio = ratioOf(gainers.map((i) => change[i]));
  const totalGain = sum(gainers.map((i) => change[i]));

  // The wedges. A sacrificer's sacrifice is shared among the gainers in proportion to their gains.
  const pieces: Piece[] = [];
  const kept = names.map((_, i) => (cmp(oldShares[i], newShares[i]) < 0 ? oldShares[i] : newShares[i]));
  const transfer = (i: number, j: number): Fr => (isZero(totalGain) ? ZERO : div(mul(mul(change[i], fr(-1)), change[j]), totalGain));
  let at = ZERO;
  const oldStart = new Map<string, Fr>();
  names.forEach((_, i) => {
    if (!isZero(kept[i])) {
      oldStart.set(`${i}>${i}`, at);
      at = add(at, kept[i]);
    }
    if (sacrificers.includes(i)) {
      for (const j of gainers) {
        oldStart.set(`${i}>${j}`, at);
        at = add(at, transfer(i, j));
      }
    }
  });
  at = ZERO;
  names.forEach((_, j) => {
    if (!isZero(kept[j])) {
      pieces.push({ from: j, to: j, size: kept[j], oldStart: oldStart.get(`${j}>${j}`)!, newStart: at, moves: false });
      at = add(at, kept[j]);
    }
    if (gainers.includes(j)) {
      for (const i of sacrificers) {
        const size = transfer(i, j);
        pieces.push({ from: i, to: j, size, oldStart: oldStart.get(`${i}>${j}`)!, newStart: at, moves: true });
        at = add(at, size);
      }
    }
  });

  // Goodwill: the total that changes hands, credited to the sacrificers and debited to the gainers in their ratios.
  const goodwillAmount = Math.round((goodwill * totalGain.n) / totalGain.d);
  const goodwillShares = names.map(() => 0);
  const credits = splitByRatio(goodwillAmount, sacrificingRatio);
  sacrificers.forEach((i, k) => (goodwillShares[i] = credits[k]));
  const debits = splitByRatio(goodwillAmount, gainingRatio);
  gainers.forEach((j, k) => (goodwillShares[j] = -debits[k]));

  const newRatio = ratioOf(newShares);
  const oldRatio = event.kind === 'admission' ? [...ratio, 0] : [...ratio];
  const nm = (i: number) => names[i];
  const shareText = (i: number) => `${nm(i)} ${frText(oldShares[i])} → ${frText(newShares[i])}`;
  const sacText = sacrificers.map((i) => `${nm(i)} gives up ${frText(mul(change[i], fr(-1)))}`);
  const gainText = gainers.map((j) => `${nm(j)} gains ${frText(change[j])}`);
  const newRatioText = ratioText(newRatio.filter((_, i) => !(event.kind === 'retirement' || event.kind === 'death') || i !== subject));
  const presentNames = names.filter((_, i) => !((event.kind === 'retirement' || event.kind === 'death') && i === subject));

  const entries: Entry[] = [];
  const steps: ReconStep[] = [];
  const oldNames = input.names;
  steps.push({
    key: 'old',
    title: 'The old ratio',
    text: `${list(oldNames)} share profits in the ratio ${ratioText(ratio)}: ${list(oldNames.map((n, i) => `${n} ${frText(old[i])}`))} of every rupee of profit.`,
    flows: [],
    entries: 0,
  });

  if (event.kind === 'admission') {
    const howFrom =
      event.from.kind === 'old-ratio'
        ? `taken from the old partners in their old ratio ${ratioText(ratio)}`
        : event.from.kind === 'equal'
          ? 'taken from the old partners equally'
          : event.from.kind === 'one'
            ? `taken from ${nm(event.from.partner)} alone`
            : 'taken from the old partners as agreed';
    steps.push({
      key: 'split',
      title: 'The sacrifice',
      text: `${nm(subject!)} joins for ${frText(event.share)} of the profit, ${howFrom}: ${list(sacText)}. ${sacrificers.length === 1 ? `Only ${nm(sacrificers[0])} sacrifices.` : `Sacrificing ratio = ${ratioText(sacrificingRatio)}.`}`,
      flows: [],
      entries: 0,
    });
    steps.push({
      key: 'new',
      title: 'The new ratio',
      text: `New share = old share - sacrifice: ${list(names.map((_, i) => `${nm(i)} ${frText(newShares[i])}`))}. New ratio ${presentNames.join(' : ')} = ${newRatioText}.`,
      flows: [],
      entries: 0,
    });
    const premium = goodwillAmount;
    const c = subject!;
    if (event.premium === 'cash') {
      entries.push({
        lines: [
          { account: 'Bank A/c', side: 'Dr', amount: event.capital + premium },
          { account: cap(nm(c)), side: 'Cr', amount: event.capital },
          { account: 'Premium for Goodwill A/c', side: 'Cr', amount: premium },
        ].filter((l) => l.amount > 0) as EntryLine[],
        narration: `capital and premium for goodwill brought in by ${nm(c)}`,
      });
      steps.push({
        key: 'premium',
        title: 'Capital and premium brought in',
        text: `The goodwill of the firm is ${inr(goodwill)}, so ${nm(c)}'s premium for goodwill is ${inr(goodwill)} x ${frText(event.share)} = ${inr(premium)}. ${nm(c)} brings it in cash with capital of ${inr(event.capital)}.`,
        flows: [{ from: c, to: 'bank', amount: event.capital + premium, label: `${inr(event.capital + premium)} into the bank from ${nm(c)}` }],
        entries: entries.length,
      });
      entries.push({
        lines: [{ account: 'Premium for Goodwill A/c', side: 'Dr', amount: premium }, ...sacrificers.map((i) => ({ account: cap(nm(i)), side: 'Cr' as const, amount: goodwillShares[i] }))],
        narration: sacrificers.length === 1 ? `premium for goodwill credited to ${nm(sacrificers[0])}, the sacrificing partner` : `premium for goodwill credited to the sacrificing partners in their sacrificing ratio ${ratioText(sacrificingRatio)}`,
      });
      steps.push({
        key: 'goodwill',
        title: 'The premium to the sacrificing partners',
        text: `The premium belongs to the partners who gave up the share, ${inRatio(sacrificers.map(nm), sacrificingRatio, 'sacrificing')}: ${list(sacrificers.map((i) => `${inr(goodwillShares[i])} to ${nm(i)}`))}.`,
        flows: sacrificers.map((i) => ({ from: 'bank' as const, to: i, amount: goodwillShares[i], label: `Premium ${inr(goodwillShares[i])} to ${nm(i)}` })),
        entries: entries.length,
      });
    } else {
      if (event.capital > 0) entries.push({ lines: [{ account: 'Bank A/c', side: 'Dr', amount: event.capital }, { account: cap(nm(c)), side: 'Cr', amount: event.capital }], narration: `capital brought in by ${nm(c)}` });
      entries.push({
        lines: [{ account: cap(nm(c)), side: 'Dr', amount: premium }, ...sacrificers.map((i) => ({ account: cap(nm(i)), side: 'Cr' as const, amount: goodwillShares[i] }))],
        narration: `${nm(c)}'s share of goodwill adjusted through the capital accounts, the premium not being brought in cash`,
      });
      steps.push({
        key: 'goodwill',
        title: 'Goodwill through the capital accounts',
        text: `${event.capital > 0 ? `${nm(c)} brings ${inr(event.capital)} as capital (Bank A/c Dr, ${nm(c)}'s Capital A/c Cr). ` : ''}${nm(c)}'s share of goodwill is ${inr(goodwill)} x ${frText(event.share)} = ${inr(premium)}. It is not brought in cash, so ${nm(c)}'s capital account is debited and the sacrificing partners are credited, ${inRatio(sacrificers.map(nm), sacrificingRatio, 'sacrificing')}: ${list(sacrificers.map((i) => `${inr(goodwillShares[i])} to ${nm(i)}`))}.`,
        flows: sacrificers.map((i) => ({ from: c, to: i, amount: goodwillShares[i], label: `Goodwill ${inr(goodwillShares[i])} from ${nm(c)} to ${nm(i)}` })),
        entries: entries.length,
      });
    }
  } else {
    const leaving = event.kind === 'change' ? null : subject!;
    const remainingSacrificers = leaving === null ? [] : sacrificers.filter((i) => i !== leaving);
    const verb = event.kind === 'death' ? 'dies' : 'retires';
    steps.push({
      key: 'split',
      title: event.kind === 'change' ? 'Who gives, who gains' : 'The share left behind',
      text:
        event.kind === 'change'
          ? `The new ratio is ${ratioText(event.newRatio)}. Change = new share - old share: ${list(names.map((_, i) => shareText(i)))}. ${list([...sacText, ...gainText])}. ${sacrificers.length === 1 ? `${nm(sacrificers[0])} alone sacrifices` : `Sacrificing ratio ${ratioText(sacrificingRatio)}`}; ${gainers.length === 1 ? `${nm(gainers[0])} alone gains` : `gaining ratio ${ratioText(gainingRatio)}`}.`
          : `${nm(leaving!)} ${verb}, leaving a share of ${frText(oldShares[leaving!])}. ${event.newRatio === 'old-ratio' ? `The others take it in their old ratio, so the gaining ratio is their old ratio` : `The others agree a new ratio of ${ratioText(event.newRatio)}. Change = new share - old share`}: ${list([...gainText, ...sacrificers.filter((i) => i !== leaving).map((i) => `${nm(i)} gives up ${frText(mul(change[i], fr(-1)))}`)])}. ${gainers.length === 1 ? `${nm(gainers[0])} alone gains.` : `Gaining ratio = ${ratioText(gainingRatio)}.`}`,
      flows: [],
      entries: 0,
    });
    steps.push({
      key: 'new',
      title: 'The new ratio',
      text: `${list(presentNames)} now share in the ratio ${newRatioText} (${list(presentNames.map((n) => `${n} ${frText(newShares[names.indexOf(n)])}`))}).`,
      flows: [],
      entries: 0,
    });
    if (goodwillAmount > 0) {
      entries.push({
        lines: [...gainers.map((j) => ({ account: cap(nm(j)), side: 'Dr' as const, amount: -goodwillShares[j] })), ...sacrificers.map((i) => ({ account: cap(nm(i)), side: 'Cr' as const, amount: goodwillShares[i] }))],
        narration:
          event.kind === 'change'
            ? `adjustment for goodwill on the change in the profit-sharing ratio`
            : `${nm(leaving!)}'s share of goodwill${remainingSacrificers.length ? ` and ${list(remainingSacrificers.map((i) => `${nm(i)}'s sacrifice`))}` : ''} debited to ${gainers.length === 1 ? `${nm(gainers[0])}, the gaining partner,` : `the gaining partners in their gaining ratio ${ratioText(gainingRatio)}`} on ${nm(leaving!)}'s ${event.kind === 'death' ? 'death' : 'retirement'}`,
      });
    }
    const flows: ReconFlow[] = [];
    for (const j of gainers) for (const i of sacrificers) {
      const amount = Math.round((goodwillAmount * value2(transfer(i, j))) / value2(totalGain));
      if (amount > 0) flows.push({ from: j, to: i, amount, label: `Goodwill from ${nm(j)} to ${nm(i)}` });
    }
    steps.push({
      key: 'goodwill',
      title: 'Goodwill',
      text:
        event.kind === 'change'
          ? `The goodwill of ${inr(goodwill)} was earned in the old ratio. Each gaining partner pays for the share gained, ${inr(goodwill)} x gain, to the partners who gave it up: ${list(gainers.map((j) => `${nm(j)} is debited ${inr(-goodwillShares[j])}`))}; ${list(sacrificers.map((i) => `${nm(i)} is credited ${inr(goodwillShares[i])}`))}.`
          : `${nm(leaving!)}'s share of goodwill is ${inr(goodwill)} x ${frText(oldShares[leaving!])} = ${inr(goodwillShares[leaving!])}, credited to ${nm(leaving!)}'s capital account.${remainingSacrificers.map((i) => ` ${nm(i)}'s share falls too, so ${nm(i)} is credited ${inr(goodwill)} x ${frText(mul(change[i], fr(-1)))} = ${inr(goodwillShares[i])}.`).join('')} ${gainers.length === 1 ? `${nm(gainers[0])}, the only gaining partner, is debited with the whole ${inr(goodwillAmount)}` : `The gaining partners are debited ${inr(goodwillAmount)} in their gaining ratio ${ratioText(gainingRatio)}: ${list(gainers.map((j) => `${nm(j)} ${inr(-goodwillShares[j])}`))}`}.`,
      flows: flows.map((f) => ({ ...f, label: `${f.label} ${inr(f.amount)}` })),
      entries: entries.length,
    });
  }

  return {
    input,
    names,
    oldShares,
    newShares,
    change,
    oldRatio,
    newRatio,
    sacrificers,
    gainers,
    sacrificingRatio,
    gainingRatio,
    pieces,
    goodwillShares,
    goodwillAmount,
    entries,
    steps,
    subject,
  };
}

const value2 = (f: Fr) => f.n / f.d;
