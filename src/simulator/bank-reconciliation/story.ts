import { formatINR, type Paise } from '@/engine/money';
import {
  amendedCashBookOf,
  balanceLabel,
  BOOK_NAME,
  cashBookOf,
  factsOf,
  otherBook,
  passBookOf,
  reconcile,
  ruleOf,
  statementOf,
  treatmentOf,
  type Book,
  type Scenario,
} from './books';

// ---------------------------------------------------------------------------------------------------------------
// The walk-through of a month: the two books side by side, then (if the cash book is amended first) the entries the
// firm passes, then every item left carried into the statement, until it reaches the other book's balance.
// ---------------------------------------------------------------------------------------------------------------

const inr = formatINR;

export interface BrsStep {
  kind: 'intro' | 'amend' | 'carry' | 'done';
  /** The item moved in this step. */
  item: string | null;
  text: string;
  /** Items entered in the amended cash book and items carried into the statement, once this step has played. */
  entered: string[];
  carried: string[];
  /** The balance the statement has reached (signed), in the terms of the book it starts from. */
  running: Paise;
}

export function stepsOf(s: Scenario, from: Book, amended: boolean): BrsStep[] {
  const cb = cashBookOf(s).balance;
  const pb = passBookOf(s).balance;
  const st = statementOf(s, from, amended);
  const out: BrsStep[] = [];
  const gap = Math.abs(pb - cb);
  out.push({
    kind: 'intro',
    item: null,
    text: `Two records of one bank account on ${s.lastDay} ${s.month}: the firm's Cash Book shows ${inr(Math.abs(cb))} ${cb >= 0 ? 'in the bank' : 'overdrawn'}, the bank's Pass Book ${inr(Math.abs(pb))} ${pb >= 0 ? 'in the bank' : 'overdrawn'}. ${gap === 0 ? 'They agree.' : `They are ${inr(gap)} apart, and every item that one book has and the other has not (or has at a different figure) explains a part of it.`}`,
    entered: [],
    carried: [],
    running: from === 'cb' ? cb : pb,
  });
  const entered: string[] = [];
  let book = cb;
  if (amended) {
    for (const i of s.items.filter((x) => factsOf(x, s).enter).sort((a, b) => a.day - b.day)) {
      const f = factsOf(i, s);
      book += f.sign * i.amount;
      entered.push(i.id);
      out.push({
        kind: 'amend',
        item: i.id,
        text: `${f.title}: ${f.cause === 'cbError' ? 'the firm corrects its own entry' : 'the firm learns of this from the pass book and enters it'}, ${f.sign > 0 ? 'on the debit side' : 'on the credit side'} of the cash book. The cash book balance becomes ${inr(Math.abs(book))} ${book >= 0 ? '(favourable)' : '(overdraft)'}.`,
        entered: [...entered],
        carried: [],
        running: from === 'cb' ? book : pb,
      });
    }
  }
  const amendedBalance = amended ? amendedCashBookOf(s).balance : cb;
  const start = from === 'cb' ? amendedBalance : pb;
  const carried: string[] = [];
  const left = [...st.adds, ...st.lesses].sort((a, b) => a.item.day - b.item.day);
  for (const l of left) {
    carried.push(l.item.id);
    const running = reconcile(from, start, s.items.filter((x) => carried.includes(x.id)), s);
    out.push({
      kind: 'carry',
      item: l.item.id,
      text: `${l.facts.why} ${ruleOf(from, start, l.item, s)} ${treatmentOf(from, start, l.item, s) === 'add' ? 'Add' : 'Less'} ${inr(l.item.amount)}: ${inr(Math.abs(running))} ${running >= 0 ? '(favourable)' : '(overdraft)'} so far.`,
      entered: [...entered],
      carried: [...carried],
      running,
    });
  }
  const target = from === 'cb' ? pb : amendedBalance;
  out.push({
    kind: 'done',
    item: null,
    text: `Every item is in the statement, and it ends on ${balanceLabel(otherBook(from), st.end)}, ${inr(Math.abs(st.end))}: exactly what the ${amended && from === 'pb' ? 'amended ' : ''}${BOOK_NAME[otherBook(from)]} shows. The two books agree once each difference is explained.`,
    entered: [...entered],
    carried: [...carried],
    running: target,
  });
  return out;
}
