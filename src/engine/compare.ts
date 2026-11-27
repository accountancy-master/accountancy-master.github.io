import type { JournalLine } from './journal';

export type MistakeCode =
  | 'gstOmitted'
  | 'sidesReversed'
  | 'wrongAccount'
  | 'extraLine'
  | 'wrongAmount'
  | 'missingLine';
export type LineStatus = 'correct' | 'sidesReversed' | 'wrongAmount' | 'wrongAccount' | 'extraLine';

export interface JournalComparison {
  correct: boolean;
  /**
   * Every line given, with what the check found. `expectedAmount` is set where the line's account stands in the
   * entry (on its side, or on the other one) with another amount: the amount it should have, in paise.
   */
  lines: { line: JournalLine; status: LineStatus; expectedAmount?: number }[];
  missing: JournalLine[];
  mistake?: MistakeCode;
  /** The mistakes found besides `mistake`, most specific first: a swapped line whose amount is wrong too, say. */
  others?: MistakeCode[];
}

const isGst = (id: string) => /^(input|output)[CSI]GST$/.test(id);

function merge(lines: JournalLine[]): JournalLine[] {
  const out = new Map<string, JournalLine>();
  for (const l of lines) {
    const key = `${l.accountId}|${l.side}`;
    const prev = out.get(key);
    out.set(key, prev ? { ...prev, amount: prev.amount + l.amount } : { ...l });
  }
  return [...out.values()];
}

// Most specific diagnosis first.
const PRIORITY: MistakeCode[] = ['gstOmitted', 'sidesReversed', 'wrongAccount', 'extraLine', 'wrongAmount', 'missingLine'];

export function compareJournal(expected: JournalLine[], given: JournalLine[]): JournalComparison {
  const exp = merge(expected);
  const giv = merge(given);
  const used = new Set<number>();
  let taken: JournalLine | null = null;
  const take = (pred: (e: JournalLine) => boolean) => {
    const i = exp.findIndex((e, idx) => !used.has(idx) && pred(e));
    if (i >= 0) used.add(i);
    taken = i >= 0 ? exp[i] : null;
    return i >= 0;
  };
  const expectAmount = (g: JournalLine) => {
    const e = taken as JournalLine | null;
    if (e && e.amount !== g.amount) groupExpected.set(keyOf(g), e.amount);
  };

  // Status per merged account+side group of the student's answer, and the amount the group should have where it differs.
  const groupStatus = new Map<string, LineStatus>();
  const groupExpected = new Map<string, number>();
  const keyOf = (l: JournalLine) => `${l.accountId}|${l.side}`;
  const open = () => giv.filter((g) => !groupStatus.has(keyOf(g)));

  // 1. exact matches
  for (const g of giv) {
    if (take((e) => e.accountId === g.accountId && e.side === g.side && e.amount === g.amount)) groupStatus.set(keyOf(g), 'correct');
  }
  // 2a. same account, same side, different amount
  for (const g of open()) {
    if (take((e) => e.accountId === g.accountId && e.side === g.side)) {
      groupStatus.set(keyOf(g), 'wrongAmount');
      expectAmount(g);
    }
  }
  // 2b. same account, opposite side (any amount)
  for (const g of open()) {
    if (take((e) => e.accountId === g.accountId && e.side !== g.side)) {
      groupStatus.set(keyOf(g), 'sidesReversed');
      expectAmount(g);
    }
  }
  // 2c. the rest: as many substitutions as there are expected groups left, then extras
  const missing = exp.filter((_, i) => !used.has(i));
  open().forEach((g, n) => groupStatus.set(keyOf(g), n < missing.length ? 'wrongAccount' : 'extraLine'));

  const lines = given.map((line) => {
    const expectedAmount = groupExpected.get(keyOf(line));
    return { line, status: groupStatus.get(keyOf(line))!, ...(expectedAmount !== undefined ? { expectedAmount } : {}) };
  });

  const found = new Set<MistakeCode>();
  for (const l of lines) {
    if (l.status !== 'correct') found.add(l.status);
    // A line on the wrong side with the wrong amount too: the amount is a mistake of its own.
    if (l.expectedAmount !== undefined) found.add('wrongAmount');
  }
  if (missing.length > 0) found.add('missingLine');
  if (missing.some((m) => isGst(m.accountId)) && !given.some((g) => isGst(g.accountId))) found.add('gstOmitted');

  const [mistake, ...others] = PRIORITY.filter((m) => found.has(m));
  return { correct: mistake === undefined, lines, missing, mistake, ...(others.length > 0 ? { others } : {}) };
}
