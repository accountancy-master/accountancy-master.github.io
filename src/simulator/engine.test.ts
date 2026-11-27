import { describe, expect, it } from 'vitest';
import { isBalanced } from '@/engine/journal';
import { rupees } from '@/engine/money';
import { createRng } from '@/engine/rng';
import { EQUATION_MOVES } from '@/generators/templates/accounting-equation';
import journalEntries from '@/generators/templates/journal-entries';
import { isKnownAccount } from './accounts';
import { equationMoveFor, journalTemplates, journalTransactionFrom, journaliseMove, moveTransaction } from './equation/fromGenerators';
import { booksFor, effectOfLines, fitsBooks, flowsOf, openingBalances, play, postLines, sameBooks, totalsOf } from './engine';
import { describeEffect, equationLine, explainPlayed } from './explain';
import { findScene } from './scenes';
import type { Balances, JournalLine, Played, SimTransaction } from './types';

const scene = findScene('ae')!;
const OPENING = openingBalances(scene.opening.lines);
const SEEDS = 300;

/** Every step leaves the equation true, and the whole play has the effect its entry has. */
function expectSound(played: Played) {
  for (const s of played.steps) {
    expect(s.totals.balanced, `${played.transaction.id}: ${s.text}`).toBe(true);
    expect(s.totals.suspense, played.transaction.id).toBeNull();
  }
  const tx = played.transaction;
  expect(played.effect, tx.id).toEqual(effectOfLines(scene, tx.lines, tx.costOfSale ?? 0));
  // What the steps post, apart from the equation's own step for the cost of a sale, is exactly the entry.
  const posted = postLines({}, played.steps.filter((s) => !s.equationOnly).flatMap((s) => s.lines));
  expect(posted, tx.id).toEqual(postLines({}, tx.lines));
  // And the books after are the books before with the entry (and the cost of the sale) posted.
  const cost: JournalLine[] = tx.costOfSale ? [{ accountId: 'costOfGoodsSold', side: 'Dr', amount: tx.costOfSale }, { accountId: 'stock', side: 'Cr', amount: tx.costOfSale }] : [];
  expect(sameBooks(played.after, postLines(played.before, [...tx.lines, ...cost])), tx.id).toBe(true);
}

/** Plays a transaction on the books it fits, as the screen does. */
function playFitting(books: Balances, tx: SimTransaction): Played {
  const start = booksFor(scene, books, tx).books;
  const played = play(scene, start, tx);
  expect(fitsBooks(scene, played), tx.id).toBe(true);
  return played;
}

describe('the books and the equation', () => {
  it('the opening books balance: assets ₹2,85,000 = liabilities ₹85,000 + capital ₹2,00,000', () => {
    const t = totalsOf(scene, OPENING);
    expect(t.containers).toMatchObject({ assets: rupees(285000), liabilities: rupees(85000), capital: rupees(200000), suspense: 0 });
    expect(t.balanced).toBe(true);
    expect(equationLine(scene, t)).toBe('Assets ₹2,85,000 = Liabilities ₹85,000 + Capital ₹2,00,000');
  });

  it('pairs the lines of an entry into movements, equal amounts first', () => {
    const lines: JournalLine[] = [
      { accountId: 'cash', side: 'Dr', amount: 950 },
      { accountId: 'discountAllowed', side: 'Dr', amount: 50 },
      { accountId: 'debtor:Mohan', side: 'Cr', amount: 1000 },
    ];
    expect(flowsOf(lines)).toEqual({
      flows: [
        { debit: 'cash', credit: 'debtor:Mohan', amount: 950 },
        { debit: 'discountAllowed', credit: 'debtor:Mohan', amount: 50 },
      ],
      unpaired: [],
    });
  });

  it('shows a sale whose cost is known as cash in at the price and stock out at cost: capital rises by the profit', () => {
    const tx = scene.transactions.find((t) => t.id === 's.sale-cash')!;
    const played = play(scene, OPENING, tx);
    expect(played.steps.map((s) => s.kind)).toEqual(['inflow', 'outflow']);
    expect(played.steps[1].equationOnly).toBe(true);
    expect(played.effect).toEqual({ assets: rupees(3000), liabilities: 0, capital: rupees(3000) });
    const words = explainPlayed(scene, played);
    expect(words.sides[0]).toBe('Assets rise by ₹3,000: Cash +₹15,000, Stock −₹12,000.');
    expect(words.costNote).toContain('profit of ₹3,000');
  });

  it('names each kind of movement: in, out, exchange and a claim that moves', () => {
    const kinds = (id: string) => play(scene, OPENING, scene.transactions.find((t) => t.id === id)!).steps.map((s) => s.kind);
    expect(kinds('s.capital-cash')).toEqual(['inflow']);
    expect(kinds('s.expense-cash')).toEqual(['outflow']);
    expect(kinds('s.asset-cash')).toEqual(['exchange']);
    expect(kinds('s.expense-outstanding')).toEqual(['shift']);
    expect(kinds('s.owner-pays-creditor')).toEqual(['shift']);
  });

  it('says what each side did, in words', () => {
    const played = play(scene, OPENING, scene.transactions.find((t) => t.id === 's.expense-outstanding')!);
    const words = explainPlayed(scene, played);
    expect(words.sides).toEqual([
      'Assets do not change.',
      'Liabilities rise by ₹12,000: Outstanding expenses +₹12,000.',
      'Capital falls by ₹12,000: Profit so far −₹12,000.',
    ]);
    expect(words.ledger[0]).toBe('Salaries A/c is an expense or a loss, which reduces the profit. It increases, so it is debited with ₹12,000.');
    expect(words.ledger[1]).toBe('Outstanding Salaries A/c is a liability. It increases, so it is credited with ₹12,000.');
    expect(describeEffect(played.effect)).toBe('Assets unchanged, liabilities increase by ₹12,000, capital decreases by ₹12,000');
  });
});

describe('the starter transactions', () => {
  it('cover every effect the topic teaches', () => {
    const kinds = new Set(scene.transactions.map((t) => t.kind));
    for (const k of [
      'Capital introduced',
      'Asset bought for cash',
      'Asset bought on credit',
      'Liability paid',
      'Income earned in cash',
      'Income earned, not yet received',
      'Expense paid',
      'Expense outstanding',
      'Drawings in cash',
      'Drawings in goods',
      'Loan taken',
      'Debtor pays',
      'Goods returned to a supplier',
      'Depreciation',
      'Bad debts',
    ]) {
      expect(kinds.has(k), k).toBe(true);
    }
    expect(new Set(scene.transactions.map((t) => t.id)).size).toBe(scene.transactions.length);
  });

  it.each(scene.transactions.map((t) => [t.id, t] as const))('%s balances after every step, with the effect of its entry', (_, tx) => {
    expect(isBalanced(tx.lines)).toBe(true);
    const played = playFitting(OPENING, tx);
    expectSound(played);
    // Each trap is a wrong effect that still keeps the equation, and is not the right one.
    for (const t of tx.traps ?? []) {
      expect(t.effect.assets, tx.id).toBe(t.effect.liabilities + t.effect.capital);
      expect(t.effect, tx.id).not.toEqual(played.effect);
    }
  });

  it('every story plays from its opening without topping anything up, and balances at every step', () => {
    for (const story of scene.stories) {
      let books = openingBalances(story.opening);
      for (const tx of story.transactions) {
        expect(isBalanced(tx.lines), tx.id).toBe(true);
        const played = play(scene, books, tx);
        expect(fitsBooks(scene, played), tx.id).toBe(true);
        expectSound(played);
        books = played.after;
      }
    }
  });

  it('every free-play event makes a balanced transaction from its defaults, for every option', () => {
    for (const event of scene.events) {
      const combos = event.choices.reduce<Record<string, string>[]>((all, c) => all.flatMap((a) => c.options.map((o) => ({ ...a, [c.id]: o.id }))), [{}]);
      for (const choice of combos) {
        const amounts = Object.fromEntries(event.amounts.map((a) => [a.id, rupees(a.defaultRupees)]));
        const made = event.make(choice, amounts);
        expect('problem' in made, `${event.id} ${JSON.stringify(choice)}`).toBe(false);
        const tx = made as SimTransaction;
        expect(isBalanced(tx.lines), event.id).toBe(true);
        expectSound(playFitting(OPENING, tx));
      }
      // An amount of nothing is refused with a reason.
      const none = event.make(Object.fromEntries(event.choices.map((c) => [c.id, c.options[0].id])), Object.fromEntries(event.amounts.map((a) => [a.id, 0])));
      expect(none, event.id).toHaveProperty('problem');
    }
  });
});

describe('goods, advances and losses in words', () => {
  it('explains Purchases A/c in the journal beside stock in the equation', () => {
    const words = explainPlayed(scene, play(scene, OPENING, scene.transactions.find((t) => t.id === 's.goods-credit')!));
    expect(words.sides[0]).toBe('Assets rise by ₹30,000: Stock +₹30,000.');
    expect(words.ledger[0]).toContain('In the equation these goods are shown as stock');
  });

  it('a sale at a loss says that capital falls by the loss', () => {
    const tx: SimTransaction = { id: 's.x', text: 'x', lines: [{ accountId: 'cash', side: 'Dr', amount: rupees(9000) }, { accountId: 'sales', side: 'Cr', amount: rupees(9000) }], costOfSale: rupees(10000) };
    expect(explainPlayed(scene, play(scene, OPENING, tx)).costNote).toContain('capital falls by the loss of ₹1,000');
  });

  it('an advance from a customer is a liability, and one paid to a supplier an asset, though the entry names the same person', () => {
    const list = journalTemplates(journalEntries);
    const of = (id: string) => journalTransactionFrom(list.find((t) => t.id === id)!, 1)!;
    expect(effectOfLines(scene, of('je-advance-received').lines)).toMatchObject({ liabilities: expect.any(Number), capital: 0 });
    expect(effectOfLines(scene, of('je-advance-received').lines).liabilities).toBeGreaterThan(0);
    expect(effectOfLines(scene, of('je-advance-paid').lines)).toEqual({ assets: 0, liabilities: 0, capital: 0 });
    const adjusted = of('je-advance-adjusted');
    expect(effectOfLines(scene, adjusted.lines).liabilities).toBeLessThan(0);
    expect(adjusted.why).toContain('The cost of these goods is not given');
  });
});

describe('transactions of the generators', () => {
  it(`the equation generators: for ${SEEDS} seeds, the entry has exactly the effect the generator states, and balances at every step`, () => {
    const seen = new Set<string>();
    for (let seed = 1; seed <= SEEDS; seed++) {
      const { id, move } = equationMoveFor(EQUATION_MOVES, seed);
      seen.add(id);
      const tx = moveTransaction(seed, id, move);
      expect(isBalanced(tx.lines), `${seed} ${id}`).toBe(true);
      expect(tx.lines.every((l) => isKnownAccount(l.accountId) && l.amount > 0), `${seed} ${id}`).toBe(true);
      expect(effectOfLines(scene, tx.lines, tx.costOfSale ?? 0), `${seed} ${id}: ${tx.text}`).toEqual({ assets: move.e.a, liabilities: move.e.l, capital: move.e.c });
      expectSound(playFitting(OPENING, tx));
    }
    // Every kind of move comes up within these seeds.
    expect(seen.size).toBe(EQUATION_MOVES.length);
  });

  it('every move the equation generators make can be journalised', () => {
    for (const def of EQUATION_MOVES) {
      for (let seed = 1; seed <= 20; seed++) {
        const move = def.make(createRng(seed));
        expect(() => journaliseMove(def.id, move), def.id).not.toThrow();
      }
    }
  });

  it(`the journal-entry templates: for ${SEEDS} seeds, every entry balances at every step and has the effect of its lines`, () => {
    const list = journalTemplates(journalEntries);
    expect(list.length).toBeGreaterThan(30);
    for (let seed = 0; seed < SEEDS; seed++) {
      const t = list[seed % list.length];
      const tx = journalTransactionFrom(t, Math.floor(seed / list.length) + 1)!;
      expect(tx, t.id).not.toBeNull();
      expectSound(playFitting(OPENING, tx));
    }
  });

  it('a transaction that does not fit the books is played on fresh opening books, topped up just enough', () => {
    const big: SimTransaction = { id: 's.big', text: 'Paid a creditor ₹4,00,000 by cheque.', lines: [{ accountId: 'creditor:Kiran', side: 'Dr', amount: rupees(400000) }, { accountId: 'bank', side: 'Cr', amount: rupees(400000) }] };
    const { books, fresh } = booksFor(scene, OPENING, big);
    expect(fresh).toBe(true);
    expect(totalsOf(scene, books).balanced).toBe(true);
    expect(fitsBooks(scene, play(scene, books, big))).toBe(true);
  });
});
