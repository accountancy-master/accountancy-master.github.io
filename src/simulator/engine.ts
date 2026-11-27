import { formatINR } from '@/engine/money';
import { groupOf, simAccount, simLabel, type AccountGroup } from './accounts';
import type { BandSpec, ContainerSpec, Scene } from './scenes';
import type { Balances, BandChange, Effect, JournalLine, Move, Paise, Played, SimStep, SimTransaction, Spot, StepKind, Totals } from './types';

// ---------------------------------------------------------------------------------------------------------------
// The simulation: books (ledger balances), a scene that places every account in a container, and transactions
// played on the books one step at a time. A step is one movement of value: where it comes from (outside the
// business, or an account) and where it goes, and what each container shows after it. The equation is checked after
// every step. Nothing here draws anything: components/simulator renders what this returns.
// ---------------------------------------------------------------------------------------------------------------

/** The books an entry (or several) gives on top of `opening`. */
export function postLines(opening: Balances, lines: readonly JournalLine[]): Balances {
  const out: Record<string, Paise> = { ...opening };
  for (const l of lines) {
    const next = (out[l.accountId] ?? 0) + (l.side === 'Dr' ? l.amount : -l.amount);
    if (next === 0) delete out[l.accountId];
    else out[l.accountId] = next;
  }
  return out;
}

/** The books an opening entry gives. */
export const openingBalances = (lines: readonly JournalLine[]): Balances => postLines({}, lines);

export interface Placement {
  container: ContainerSpec;
  band: BandSpec;
}

/** Where a scene puts an account. Throws for an account no band of the scene takes: a scene must place every account. */
export function place(scene: Scene, accountId: string): Placement {
  const group = groupOf(accountId);
  const band = scene.bands.find((b) => b.takes(accountId, group));
  if (!band) throw new Error(`Scene ${scene.id} has no place for ${accountId}`);
  const container = scene.containers.find((c) => c.id === band.container);
  if (!container) throw new Error(`Scene ${scene.id}: band ${band.id} is in no container`);
  return { container, band };
}

/**
 * The side of the equation an account stands on, given its balance: a container's own side, and for one that stands
 * on either (Suspense), the side of the balance it has (`net`, a debit positive) or, with none, of the posting.
 */
function sideOf(container: ContainerSpec, net: Paise, posting: 'Dr' | 'Cr'): 'left' | 'right' {
  if (container.side !== 'either') return container.side;
  if (net !== 0) return net > 0 ? 'left' : 'right';
  return posting === 'Dr' ? 'left' : 'right';
}

/** What a band shows for a balance: a debit as it is on the left, a credit as it is on the right. */
const shown = (side: 'left' | 'right', net: Paise): Paise => (side === 'left' ? net : -net);

/** What every band of the scene shows, by band id. A band with nothing in it shows 0. */
export function bandValues(scene: Scene, balances: Balances): Record<string, Paise> {
  const out: Record<string, Paise> = Object.fromEntries(scene.bands.map((b) => [b.id, 0]));
  for (const [id, net] of Object.entries(balances)) {
    const { container, band } = place(scene, id);
    // A container on either side shows its balance as it is, whichever side that is.
    out[band.id] += container.side === 'either' ? Math.abs(net) : shown(container.side, net);
  }
  return out;
}

/** The totals of the containers, the two sides of the equation, and whether they agree. */
export function totalsOf(scene: Scene, balances: Balances): Totals {
  const containers: Record<string, Paise> = Object.fromEntries(scene.containers.map((c) => [c.id, 0]));
  let left = 0;
  let right = 0;
  let suspenseNet = 0;
  for (const [id, net] of Object.entries(balances)) {
    const { container } = place(scene, id);
    if (container.side === 'either') {
      suspenseNet += net;
      containers[container.id] += Math.abs(net);
      continue;
    }
    containers[container.id] += shown(container.side, net);
    if (container.side === 'left') left += net;
    else right -= net;
  }
  if (suspenseNet > 0) left += suspenseNet;
  if (suspenseNet < 0) right -= suspenseNet;
  return {
    containers,
    left,
    right,
    balanced: left === right,
    suspense: suspenseNet === 0 ? null : { side: suspenseNet > 0 ? 'left' : 'right', amount: Math.abs(suspenseNet) },
  };
}

/** One movement of value: an amount debited to one account and credited to another. */
export interface Flow {
  debit: string;
  credit: string;
  amount: Paise;
}

/**
 * The entry as movements from the account credited to the account debited. Lines of equal amounts are paired first
 * (so that "Cash Dr 9,500, Discount Allowed Dr 500, To Mohan 10,000" is Mohan to Cash 9,500 and Mohan to Discount
 * 500), then what is left in the order the lines come. A balanced entry leaves nothing over; an entry posted on one
 * side only leaves the lines it has, which `unpaired` returns.
 */
export function flowsOf(lines: readonly JournalLine[]): { flows: Flow[]; unpaired: JournalLine[] } {
  const dr = lines.filter((l) => l.side === 'Dr').map((l) => ({ ...l }));
  const cr = lines.filter((l) => l.side === 'Cr').map((l) => ({ ...l }));
  const flows: Flow[] = [];
  for (const d of dr) {
    const c = cr.find((x) => x.amount > 0 && x.amount === d.amount);
    if (!c) continue;
    flows.push({ debit: d.accountId, credit: c.accountId, amount: d.amount });
    d.amount = 0;
    c.amount = 0;
  }
  for (const d of dr) {
    for (const c of cr) {
      if (d.amount === 0) break;
      if (c.amount === 0) continue;
      const amount = Math.min(d.amount, c.amount);
      flows.push({ debit: d.accountId, credit: c.accountId, amount });
      d.amount -= amount;
      c.amount -= amount;
    }
  }
  return { flows, unpaired: [...dr, ...cr].filter((l) => l.amount > 0) };
}

/** The name of an account where it stands: its band's label, with the account's own name where the band gathers others. */
export function nameIn(scene: Scene, accountId: string): string {
  const { band } = place(scene, accountId);
  const own = simAccount(accountId).name;
  if (own === band.label || simLabel(accountId) === band.label) return band.label;
  return `${band.label} (${simLabel(accountId)})`;
}

const spotOf = (scene: Scene, accountId: string): Spot => {
  const { container, band } = place(scene, accountId);
  return { container: container.id, band: band.id };
};

const f = formatINR;

/** What a claim (an account on the right) rising means, in words. */
function claimRises(scene: Scene, id: string, x: string): string {
  const name = nameIn(scene, id);
  switch (groupOf(id)) {
    case 'capital':
      return `${name} rises by ${x}: the proprietor's claim on the business grows.`;
    case 'income':
      return `${simLabel(id)} is an income: it adds ${x} to the profit so far, so capital rises.`;
    case 'liability':
      return `${name} rises by ${x}: the business now owes this to an outsider.`;
    case 'expense':
      return `${simLabel(id)} is credited: ${x} comes off this expense, so the profit so far rises and capital rises.`;
    case 'drawings':
      return `Drawings fall by ${x}, so capital rises.`;
    default:
      return `${name} rises by ${x}.`;
  }
}

/** What a claim (an account on the right) falling means, in words. */
function claimFalls(scene: Scene, id: string, x: string): string {
  const name = nameIn(scene, id);
  switch (groupOf(id)) {
    case 'expense':
      return id === 'costOfGoodsSold'
        ? `The cost of the goods sold, ${x}, comes off the profit so far, so capital falls.`
        : `${simLabel(id)} is an expense or a loss: it takes ${x} off the profit so far, so capital falls.`;
    case 'drawings':
      return `Drawings take ${x} out of the proprietor's capital.`;
    case 'liability':
      return `${name} falls by ${x}: the business owes that much less.`;
    case 'income':
      return `${simLabel(id)} is debited: ${x} comes off the income, so the profit so far falls and capital falls.`;
    case 'capital':
      return `${name} falls by ${x}.`;
    default:
      return `${name} falls by ${x}.`;
  }
}

/** The kind of a movement from the sides of the two accounts. */
function kindOf(debitSide: 'left' | 'right', creditSide: 'left' | 'right', sameContainer: boolean): StepKind {
  if (debitSide === 'left' && creditSide === 'right') return 'inflow';
  if (debitSide === 'right' && creditSide === 'left') return 'outflow';
  if (debitSide === 'right' && creditSide === 'right' && !sameContainer) return 'shift';
  return 'exchange';
}

/** What a debit or a credit does to an account where it stands, in words: "Debtors (Mohan) falls by ₹2,000." */
function changeWords(scene: Scene, id: string, side: 'Dr' | 'Cr', x: string): string {
  const { container } = place(scene, id);
  const grows = (container.side === 'left') === (side === 'Dr');
  if (container.side === 'left') return `${nameIn(scene, id)} ${grows ? 'rises' : 'falls'} by ${x}.`;
  return grows ? claimRises(scene, id, x) : claimFalls(scene, id, x);
}

/** The kind of a transaction that is a rectifying entry: its steps are told as corrections, not as new events. */
export const RECTIFYING = 'Rectifying entry';

/** True for an account that is money: cash in hand or at the bank. */
const isMoney = (id: string) => id === 'cash' || id === 'bank' || id === 'pettyCash';

/** The words of a movement. */
function describeFlow(scene: Scene, kind: StepKind, flow: Flow, container: ContainerSpec, rectifying = false): string {
  const x = f(flow.amount);
  const debit = nameIn(scene, flow.debit);
  const credit = nameIn(scene, flow.credit);
  // A movement against Suspense A/c clears the difference it holds and makes the posting that was missing or wrong.
  if (groupOf(flow.debit) === 'temporary' || groupOf(flow.credit) === 'temporary') {
    const suspenseDebited = groupOf(flow.debit) === 'temporary';
    const suspense = suspenseDebited ? flow.debit : flow.credit;
    const other = suspenseDebited ? flow.credit : flow.debit;
    return `${x} of the difference in ${simLabel(suspense)} is cleared, and the posting it stood for is made: ${changeWords(scene, other, suspenseDebited ? 'Cr' : 'Dr', x)}`;
  }
  // A rectifying entry moves nothing into or out of the business: it puts two wrong figures right.
  if (rectifying) return `The rectifying entry moves ${x}. ${changeWords(scene, flow.debit, 'Dr', x)} ${changeWords(scene, flow.credit, 'Cr', x)}`;
  switch (kind) {
    case 'inflow':
      return `${x} comes into ${debit}. ${claimRises(scene, flow.credit, x)}`;
    case 'outflow':
      // An asset written down by a loss or an expense (depreciation, a bad debt, goods lost) is not paid to anyone.
      if (groupOf(flow.debit) === 'expense' && flow.debit !== 'costOfGoodsSold' && !isMoney(flow.credit)) {
        return `${x} comes off ${credit}: that much value is lost to the business, though no money is paid out. ${claimFalls(scene, flow.debit, x)}`;
      }
      // Goods returned by a customer: the customer owes less, and nothing is paid out.
      if (groupOf(flow.debit) === 'income' && !isMoney(flow.credit)) {
        return `${x} comes off ${credit}, though no money is paid out. ${claimFalls(scene, flow.debit, x)}`;
      }
      return `${x} leaves ${credit} and goes out of the business. ${claimFalls(scene, flow.debit, x)}`;
    case 'exchange':
      return container.side === 'right'
        ? `${x} moves within ${container.title}, from ${debit} to ${credit}: one claim replaces another, so the total of ${container.title} stays as it was.`
        : `${x} moves from ${credit} to ${debit}: one asset turns into another, so the total of ${container.title} does not change.`;
    case 'shift':
      return `${claimFalls(scene, flow.debit, x)} ${claimRises(scene, flow.credit, x)}`;
    default:
      return `${x} moves.`;
  }
}

/** The change of every band between two sets of books, the bands that moved only. */
function changesBetween(scene: Scene, before: Balances, after: Balances): BandChange[] {
  const a = bandValues(scene, before);
  const b = bandValues(scene, after);
  return scene.bands.filter((band) => a[band.id] !== b[band.id]).map((band) => ({ container: band.container, band: band.id, delta: b[band.id] - a[band.id] }));
}

function step(scene: Scene, books: Balances, kind: StepKind, lines: JournalLine[], moves: Move[], text: string, equationOnly = false): SimStep {
  const balances = postLines(books, lines);
  return {
    kind,
    amount: lines.reduce((s, l) => Math.max(s, l.amount), 0),
    lines,
    ...(equationOnly ? { equationOnly: true as const } : {}),
    moves,
    changes: changesBetween(scene, books, balances),
    text,
    balances,
    totals: totalsOf(scene, balances),
  };
}

/** The step of one movement on these books. */
function flowStep(scene: Scene, books: Balances, flow: Flow, equationOnly = false, rectifying = false): SimStep {
  const d = place(scene, flow.debit);
  const c = place(scene, flow.credit);
  const dSide = sideOf(d.container, books[flow.debit] ?? 0, 'Dr');
  const cSide = sideOf(c.container, books[flow.credit] ?? 0, 'Cr');
  const kind = kindOf(dSide, cSide, d.container.id === c.container.id);
  const from = spotOf(scene, flow.credit);
  const to = spotOf(scene, flow.debit);
  const moves: Move[] =
    kind === 'inflow'
      ? [{ from: 'outside', to }, { from: 'outside', to: from }]
      : kind === 'outflow'
        ? [{ from, to: 'outside' }, { from: to, to: 'outside' }]
        : kind === 'shift'
          ? [{ from: to, to: from }]
          : [{ from, to }];
  const lines: JournalLine[] = [
    { accountId: flow.debit, side: 'Dr', amount: flow.amount },
    { accountId: flow.credit, side: 'Cr', amount: flow.amount },
  ];
  return step(scene, books, kind, lines, moves, describeFlow(scene, kind, flow, d.container.id === c.container.id ? d.container : c.container, rectifying), equationOnly);
}

/** The step of a line posted with nothing on the other side. */
function oneSidedStep(scene: Scene, books: Balances, line: JournalLine): SimStep {
  const { container } = place(scene, line.accountId);
  const side = sideOf(container, books[line.accountId] ?? 0, line.side);
  const spot = spotOf(scene, line.accountId);
  // A debit to the left side, or a credit to the right, makes the account grow.
  const grows = (side === 'left') === (line.side === 'Dr');
  const name = nameIn(scene, line.accountId);
  const sideWord = line.side === 'Dr' ? 'debit' : 'credit';
  const text = `A ${sideWord} of ${f(line.amount)} to ${simLabel(line.accountId)} is posted with no matching ${line.side === 'Dr' ? 'credit' : 'debit'}: ${name} ${grows ? 'rises' : 'falls'} by ${f(line.amount)}, and nothing moves on the other side. The equation no longer holds.`;
  return step(scene, books, 'oneSided', [line], [grows ? { from: 'outside', to: spot } : { from: spot, to: 'outside' }], text);
}

/** The step that puts the difference of the books in Suspense A/c, or none when they agree. */
export function suspenseStep(scene: Scene, books: Balances): SimStep | null {
  const totals = totalsOf(scene, books);
  const diff = totals.left - totals.right;
  if (diff === 0) return null;
  // The right side is short: Suspense takes a credit balance, and so stands with the claims; and the other way round.
  const line: JournalLine = { accountId: 'suspense', side: diff > 0 ? 'Cr' : 'Dr', amount: Math.abs(diff) };
  const spot = spotOf(scene, 'suspense');
  const short = diff > 0 ? 'credit' : 'debit';
  const text = `The trial balance does not agree: the ${short} side is ${f(Math.abs(diff))} short. The difference is put in Suspense A/c (a ${short} balance) until the error is found.`;
  return step(scene, books, 'suspense', [line], [{ from: 'outside', to: spot }], text);
}

/** The flows an entry is played as: those of the lines, then (for a sale whose cost is known) the goods leaving stock at cost. */
function flowsToPlay(tx: SimTransaction): { flows: { flow: Flow; equationOnly: boolean }[]; unpaired: JournalLine[] } {
  const { flows, unpaired } = flowsOf(tx.lines);
  const out = flows.map((flow) => ({ flow, equationOnly: false }));
  if (tx.costOfSale) out.push({ flow: { debit: 'costOfGoodsSold', credit: 'stock', amount: tx.costOfSale }, equationOnly: true });
  return { flows: out, unpaired };
}

/** The change of each container between two sets of books, by id. */
function containerChangesBetween(scene: Scene, before: Balances, after: Balances): Record<string, Paise> {
  const a = totalsOf(scene, before).containers;
  const b = totalsOf(scene, after).containers;
  return Object.fromEntries(scene.containers.map((c) => [c.id, b[c.id] - a[c.id]]));
}

/** The change in assets, liabilities and capital, from the changes of the containers of those ids. */
export const effectFrom = (changes: Record<string, Paise>): Effect => ({
  assets: changes.assets ?? 0,
  liabilities: changes.liabilities ?? 0,
  capital: changes.capital ?? 0,
});

/**
 * A transaction played on a set of books: a step for every movement, a one-sided step for every line left without
 * its other side, and (when `withSuspense`) the step that puts any difference left in Suspense A/c.
 */
export function play(scene: Scene, before: Balances, tx: SimTransaction, opts: { withSuspense?: boolean } = {}): Played {
  const { flows, unpaired } = flowsToPlay(tx);
  const steps: SimStep[] = [];
  let books = before;
  for (const { flow, equationOnly } of flows) {
    const s = flowStep(scene, books, flow, equationOnly, tx.kind === RECTIFYING);
    steps.push(s);
    books = s.balances;
  }
  for (const line of unpaired) {
    const s = oneSidedStep(scene, books, line);
    steps.push(s);
    books = s.balances;
  }
  if (opts.withSuspense) {
    const s = suspenseStep(scene, books);
    if (s) {
      steps.push(s);
      books = s.balances;
    }
  }
  const containerChanges = containerChangesBetween(scene, before, books);
  return { transaction: tx, before, after: books, steps, effect: effectFrom(containerChanges), containerChanges };
}

/** True when no band that must stay at or above nothing falls below it at any step. */
export function fitsBooks(scene: Scene, played: Played): boolean {
  const strict = scene.bands.filter((b) => !b.mayBeNegative);
  return played.steps.every((s) => {
    const values = bandValues(scene, s.balances);
    return strict.every((b) => values[b.id] >= 0);
  });
}

const ROUND = 1_000_000; // ₹10,000 in paise

/**
 * The books a transaction is played on: these, when it fits them; otherwise the scene's opening books with every
 * account it would take below nothing raised (in round ₹10,000s, against capital) so that it fits. `fresh` says
 * which it was.
 */
export function booksFor(scene: Scene, books: Balances, tx: SimTransaction): { books: Balances; fresh: boolean } {
  if (fitsBooks(scene, play(scene, books, tx))) return { books, fresh: false };
  let start = openingBalances(scene.opening.lines);
  for (let round = 0; round < 6; round++) {
    const played = play(scene, start, tx);
    if (fitsBooks(scene, played)) return { books: start, fresh: true };
    const lowest = new Map<string, Paise>();
    for (const s of played.steps) {
      const values = bandValues(scene, s.balances);
      for (const b of scene.bands) if (!b.mayBeNegative && values[b.id] < 0) lowest.set(b.id, Math.min(lowest.get(b.id) ?? 0, values[b.id]));
    }
    const top: JournalLine[] = [];
    for (const [bandId, low] of lowest) {
      // Raise the account of the transaction that sits in this band (or the band's first account in the books).
      const accountId = [...tx.lines.map((l) => l.accountId), 'stock'].find((id) => place(scene, id).band.id === bandId);
      if (!accountId) continue;
      const amount = Math.ceil(-low / ROUND) * ROUND + ROUND;
      const { container } = place(scene, accountId);
      top.push({ accountId, side: container.side === 'right' ? 'Cr' : 'Dr', amount });
      top.push({ accountId: 'capital', side: container.side === 'right' ? 'Dr' : 'Cr', amount });
    }
    if (top.length === 0) break;
    start = postLines(start, top);
  }
  return { books: start, fresh: true };
}

/** What a transaction does to each side, from its entry alone (and the cost of goods sold, where it has one). */
export function effectOfLines(scene: Scene, lines: readonly JournalLine[], costOfSale = 0): Effect {
  const changes: Record<string, Paise> = {};
  const add = (id: string, side: 'Dr' | 'Cr', amount: Paise) => {
    const { container } = place(scene, id);
    if (container.side === 'either') return;
    const signed = side === 'Dr' ? amount : -amount;
    changes[container.id] = (changes[container.id] ?? 0) + (container.side === 'left' ? signed : -signed);
  };
  for (const l of lines) add(l.accountId, l.side, l.amount);
  if (costOfSale) {
    add('costOfGoodsSold', 'Dr', costOfSale);
    add('stock', 'Cr', costOfSale);
  }
  return effectFrom(changes);
}

/** The group of each account of an entry, for the words of an explanation. */
export const groupsOf = (lines: readonly JournalLine[]): Record<string, AccountGroup> => Object.fromEntries(lines.map((l) => [l.accountId, groupOf(l.accountId)]));

/** True when two sets of books hold the same balances. */
export function sameBooks(a: Balances, b: Balances): boolean {
  const ids = new Set([...Object.keys(a), ...Object.keys(b)]);
  for (const id of ids) if ((a[id] ?? 0) !== (b[id] ?? 0)) return false;
  return true;
}

/** Every container that holds something, or that is always drawn. */
export function visibleContainers(scene: Scene, totals: Totals): ContainerSpec[] {
  return scene.containers.filter((c) => !c.transient || totals.containers[c.id] !== 0);
}
