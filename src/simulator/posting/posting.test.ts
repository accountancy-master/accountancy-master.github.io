import { describe, expect, it } from 'vitest';
import { rupees } from '@/engine/money';
import { ledgerOf, postingSteps, trialBalanceOf, viewAt, type TAccount } from './ledger';
import { EVENTS, findReady, nextDay, reasonFor, READY, storyFromSeed, storyProblem, type PostingStory } from './story';
import { checkBalance, checkColumn, checkSide, makeQuestion, TRY_KINDS, type BalanceQuestion, type ColumnQuestion, type SideQuestion } from './tryit';

const story = (id: string): PostingStory => findReady(id)!;
const account = (ledger: TAccount[], id: string): TAccount => ledger.find((a) => a.accountId === id)!;
const lines = (rows: { particulars: string; amount: number }[]) => rows.map((r) => `${r.particulars} ${r.amount / 100}`);

describe('posting: the first month, worked by hand', () => {
  const ledger = ledgerOf(story('first-month'));

  it('posts every line on its side with "To" or "By" and the other account', () => {
    expect(ledger.map((a) => `${a.folio} ${a.title}`)).toEqual(['1 Cash A/c', '2 Capital A/c', '3 Purchases A/c', '4 Rao & Co. A/c', '5 Sales A/c', '6 Rent A/c']);
    const cash = account(ledger, 'cash');
    expect(lines(cash.debit)).toEqual(['To Capital A/c 100000', 'To Sales A/c 25000']);
    expect(lines(cash.credit)).toEqual(['By Rent A/c 6000', 'By Rao & Co. A/c 18000']);
    expect(cash.debit[0].date).toBe('Apr 1');
    expect(cash.debit[0].jf).toBe('J1');
    const rao = account(ledger, 'creditor:Rao & Co.');
    expect(lines(rao.credit)).toEqual(['By Purchases A/c 30000']);
    expect(lines(rao.debit)).toEqual(['To Cash A/c 18000']);
  });

  it('balances each account on the shorter side and brings the balance down on the other', () => {
    const cash = account(ledger, 'cash');
    expect(cash.balance).toEqual({ side: 'Dr', amount: rupees(101000) });
    expect(cash.carriedDown).toMatchObject({ side: 'Cr', particulars: 'By Balance c/d', amount: rupees(101000), date: 'Apr 30' });
    expect(cash.total).toBe(rupees(125000));
    expect(cash.broughtDown).toMatchObject({ side: 'Dr', particulars: 'To Balance b/d', amount: rupees(101000), date: 'May 1' });
    const rao = account(ledger, 'creditor:Rao & Co.');
    expect(rao.balance).toEqual({ side: 'Cr', amount: rupees(12000) });
    expect(rao.carriedDown).toMatchObject({ side: 'Dr', particulars: 'To Balance c/d' });
    expect(rao.broughtDown).toMatchObject({ side: 'Cr', particulars: 'By Balance b/d' });
    // An account with one item: the balance is that item, carried down on the empty side.
    const capital = account(ledger, 'capital');
    expect(capital.carriedDown).toMatchObject({ side: 'Dr', particulars: 'To Balance c/d', amount: rupees(100000) });
    expect(capital.total).toBe(rupees(100000));
  });

  it('lists the balances in a trial balance that agrees', () => {
    const tb = trialBalanceOf(ledger);
    expect(tb.rows.map((r) => `${r.title} ${r.side} ${r.amount / 100}`)).toEqual([
      'Cash A/c Dr 101000',
      'Capital A/c Cr 100000',
      'Purchases A/c Dr 30000',
      'Rao & Co. A/c Cr 12000',
      'Sales A/c Cr 25000',
      'Rent A/c Dr 6000',
    ]);
    expect(tb.debit).toBe(rupees(137000));
    expect(tb.credit).toBe(rupees(137000));
  });

  it('plays as one step a line, then one an account, one a balance, and the totals', () => {
    const steps = postingSteps(story('first-month'));
    expect(steps).toHaveLength(10 + 6 + 6 + 1);
    expect(steps[0]).toMatchObject({ kind: 'post', accountId: 'cash', side: 'Dr' });
    expect(steps[0].text).toContain('"To Capital A/c" ₹1,00,000');
    expect(steps[0].kind === 'post' && steps[0].reason).toContain('Cash A/c is an asset. It increases');
    expect(steps[1].kind === 'post' && steps[1].reason).toContain('increase in capital is credited');
    expect(steps[10]).toMatchObject({ kind: 'balance', accountId: 'cash' });
    expect(steps[10].text).toContain('"By Balance c/d"');
    expect(steps[16]).toMatchObject({ kind: 'tb', accountId: 'cash', side: 'Dr', amount: rupees(101000) });
    expect(steps.at(-1)).toMatchObject({ kind: 'agree', debit: rupees(137000), credit: rupees(137000) });
    const half = viewAt(steps, 3);
    expect([...half.rows]).toEqual(['p0.0.0', 'p0.1.0', 'p1.0.0']);
    expect(half.posted.has('1.0')).toBe(true);
    expect(half.posted.has('1.1')).toBe(false);
    const all = viewAt(steps, steps.length);
    expect(all.balanced.size).toBe(6);
    expect(all.listed.size).toBe(6);
    expect(all.totals).toBe(true);
  });
});

describe('posting: the edge cases', () => {
  it('a supplier paid in full has no balance and is left out of the trial balance', () => {
    const ledger = ledgerOf(story('supplier-cleared'));
    const rao = account(ledger, 'creditor:Rao & Co.');
    expect(lines(rao.debit)).toEqual(['To Purchases Return A/c 2000', 'To Cash A/c 30000']);
    expect(rao.balance).toBeNull();
    expect(rao.carriedDown).toBeNull();
    expect(rao.total).toBe(rupees(32000));
    const tb = trialBalanceOf(ledger);
    expect(tb.rows.some((r) => r.accountId === 'creditor:Rao & Co.')).toBe(false);
    expect(account(ledger, 'purchasesReturn').balance).toEqual({ side: 'Cr', amount: rupees(2000) });
    expect([tb.debit, tb.credit]).toEqual([rupees(109000), rupees(109000)]);
    const steps = postingSteps(story('supplier-cleared'));
    expect(steps.find((s) => s.kind === 'tb' && s.accountId === 'creditor:Rao & Co.')).toMatchObject({ side: null });
    expect(steps.find((s) => s.kind === 'balance' && s.accountId === 'creditor:Rao & Co.')!.text).toContain('no balance');
  });

  it('a compound entry: the account alone on its side shows one item for each account on the other', () => {
    const ledger = ledgerOf(story('settled-at-discount'));
    const mohan = account(ledger, 'debtor:Mohan');
    expect(lines(mohan.credit)).toEqual(['By Cash A/c 19500', 'By Discount Allowed A/c 500']);
    expect(mohan.balance).toBeNull();
    expect(lines(account(ledger, 'discountAllowed').debit)).toEqual(['To Mohan A/c 500']);
    expect(lines(account(ledger, 'cash').debit)).toEqual(['To Capital A/c 90000', 'To Mohan A/c 19500']);
    const tb = trialBalanceOf(ledger);
    expect([tb.debit, tb.credit]).toEqual([rupees(110000), rupees(110000)]);
    // One step for each of the three lines; the credit to Mohan makes two items in one step.
    const steps = postingSteps(story('settled-at-discount'));
    const settle = steps.filter((s) => s.kind === 'post' && s.txn === 2);
    expect(settle).toHaveLength(3);
    expect(settle[2].kind === 'post' && settle[2].rows).toHaveLength(2);
  });

  it('bank, returns and salaries: a contra entry and returns on the side opposite to their accounts', () => {
    const ledger = ledgerOf(story('credit-customer'));
    expect(lines(account(ledger, 'bank').debit)).toEqual(['To Cash A/c 60000', 'To Mohan A/c 25000']);
    expect(account(ledger, 'salesReturn').balance).toEqual({ side: 'Dr', amount: rupees(3000) });
    expect(account(ledger, 'debtor:Mohan').balance).toEqual({ side: 'Dr', amount: rupees(12000) });
    const tb = trialBalanceOf(ledger);
    expect([tb.debit, tb.credit]).toEqual([rupees(190000), rupees(190000)]);
  });

  it('gives the reason by the rules of debit and credit', () => {
    expect(reasonFor('drawings', 'Dr')).toBe('Drawings A/c reduces capital, and a decrease in capital is debited.');
    expect(reasonFor('salesReturn', 'Dr')).toBe('Sales Return A/c reduces sales, and a decrease in an income is debited.');
    expect(reasonFor('purchasesReturn', 'Cr')).toBe('Purchases Return A/c reduces purchases, and a decrease in an expense is credited.');
    expect(reasonFor('creditor:Rao & Co.', 'Dr')).toContain('owes Rao & Co. less');
    expect(reasonFor('rent', 'Dr')).toBe('Rent A/c is an expense. Expenses reduce capital, so they are debited.');
    expect(reasonFor('commissionReceived', 'Cr')).toBe('Commission Received A/c is an income. Incomes increase capital, so they are credited.');
  });

  it('dates an entry added in the sandbox after the last one, so that the journal stays in the order of dates', () => {
    expect(nextDay([])).toBe(1);
    expect(nextDay(story('first-month').txns)).toBe(22); // the last entry is of 20 April
    expect(nextDay(story('owner-and-income').txns)).toBe(27);
    const late = [...story('owner-and-income').txns, { ...story('owner-and-income').txns[4], day: 29 }];
    expect(nextDay(late)).toBeNull();
    const full = Array.from({ length: 12 }, (_, i) => ({ ...story('first-month').txns[2], day: i + 1 }));
    expect(nextDay(full)).toBeNull();
  });

  it('words the balancing of a one-sided account and the posting of a compound entry', () => {
    const steps = postingSteps(story('settled-at-discount'));
    const capital = steps.find((s) => s.kind === 'balance' && s.accountId === 'capital')!;
    expect(capital.text).toContain('the credit side adds up to ₹90,000 and the debit side is empty');
    const settle = steps.filter((s) => s.kind === 'post' && s.txn === 2)[2];
    expect(settle.text).toContain('naming each account on the other side of the entry');
    expect(steps.find((s) => s.kind === 'tb' && s.accountId === 'cash')!.text).toBe(
      'Cash A/c has a debit balance of ₹1,04,500 (it is an asset), so it goes in the debit column of the trial balance.',
    );
  });

  it('refuses a story that cannot happen', () => {
    const p = { owner: 'Asha', debtor: 'Mohan', creditor: 'Rao & Co.' };
    const ev = (id: string, a: number, day: number) => ({ day, ...EVENTS.find((e) => e.id === id)!.make(rupees(a), p) });
    expect(storyProblem([ev('capital', 10000, 1), ev('rent', 12000, 3)])).toBe('There is not enough cash in hand for this: only ₹10,000 is there.');
    expect(storyProblem([ev('capital', 10000, 1), ev('credit-purchase', 5000, 2), ev('pay-creditor', 6000, 3)])).toBe(
      'Only ₹5,000 is owed to Rao & Co., so no more than that can be paid or returned.',
    );
    expect(storyProblem([ev('capital', 10000, 1), ev('credit-sale', 5000, 2), ev('receipt-debtor', 5000, 3)])).toBeNull();
    expect(storyProblem([ev('capital', 10000, 1), ev('credit-sale', 5000, 2), ev('sales-return', 6000, 3)])).toBe('Mohan owes only ₹5,000, so cannot pay or return more than that.');
  });
});

describe('posting: every story', () => {
  const stories = [...READY, ...Array.from({ length: 150 }, (_, i) => storyFromSeed(i + 1))];

  it('can happen, balances every account and agrees in the trial balance', () => {
    for (const s of stories) {
      expect(storyProblem(s.txns), s.id).toBeNull();
      for (const t of s.txns) expect(t.text, s.id).toMatch(/[^.]\.$/);
      s.txns.forEach((t, i) => i > 0 && expect(t.day, s.id).toBeGreaterThanOrEqual(s.txns[i - 1].day));
      const ledger = ledgerOf(s);
      for (const a of ledger) {
        const dr = a.debitSum + (a.carriedDown?.side === 'Dr' ? a.carriedDown.amount : 0);
        const cr = a.creditSum + (a.carriedDown?.side === 'Cr' ? a.carriedDown.amount : 0);
        expect(dr, `${s.id} ${a.title}`).toBe(a.total);
        expect(cr, `${s.id} ${a.title}`).toBe(a.total);
        if (a.carriedDown) expect(a.broughtDown!.side).not.toBe(a.carriedDown.side);
      }
      const tb = trialBalanceOf(ledger);
      expect(tb.debit, s.id).toBe(tb.credit);
      expect(postingSteps(s).length).toBe(s.txns.reduce((n, t) => n + t.lines.length, 0) + 2 * ledger.length + 1);
    }
  });

  it('is the same for the same seed and varies with it', () => {
    expect(storyFromSeed(7)).toEqual(storyFromSeed(7));
    expect(stories.slice(READY.length).every((s) => s.id.startsWith('seed-'))).toBe(true);
    const shapes = new Set(stories.slice(READY.length).map((s) => s.txns.map((t) => t.narration.split(' ')[0]).join('|')));
    expect(shapes.size).toBeGreaterThan(20);
  });
});

describe('posting: try it', () => {
  it('marks the side, the account and the particulars of a line, naming the slip', () => {
    for (let seed = 1; seed <= 40; seed++) {
      const q = makeQuestion(seed, 'side') as SideQuestion;
      const a = q.answer;
      expect(q.particulars).toContain(a.particulars);
      expect(checkSide(q, a.accountId, a.side, a.particulars).right).toBe(true);
      const wrongSide = checkSide(q, a.accountId, a.side === 'Dr' ? 'Cr' : 'Dr', a.particulars);
      expect(wrongSide.right).toBe(false);
      expect(wrongSide.message).toContain('Wrong side');
      const otherAccount = q.accounts.find((id) => id !== a.accountId)!;
      expect(checkSide(q, otherAccount, a.side, a.particulars).message).toContain('other line of this entry');
      for (const p of q.particulars.filter((x) => x !== a.particulars)) expect(checkSide(q, a.accountId, a.side, p).right).toBe(false);
    }
  });

  it('marks the balance c/d and its side', () => {
    const q: BalanceQuestion = { kind: 'balance', story: story('first-month'), account: account(ledgerOf(story('first-month')), 'cash') };
    expect(checkBalance(q, 'Cr', rupees(101000)).right).toBe(true);
    expect(checkBalance(q, 'Dr', rupees(101000)).message).toContain('shorter side');
    expect(checkBalance(q, 'Cr', rupees(125000)).message).toContain('total of the larger side');
    expect(checkBalance(q, 'Cr', rupees(24000)).message).toContain('total of the shorter side');
    expect(checkBalance(q, 'none', null).right).toBe(false);
    const cleared = story('supplier-cleared');
    const closed: BalanceQuestion = { kind: 'balance', story: cleared, account: account(ledgerOf(cleared), 'creditor:Rao & Co.') };
    expect(checkBalance(closed, 'none', null).right).toBe(true);
    expect(checkBalance(closed, 'Dr', rupees(2000)).right).toBe(false);
  });

  it('marks the column of the trial balance', () => {
    const cleared = story('supplier-cleared');
    const ledger = ledgerOf(cleared);
    const col = (id: string): ColumnQuestion => ({ kind: 'column', story: cleared, account: account(ledger, id) });
    expect(checkColumn(col('purchasesReturn'), 'Cr').right).toBe(true);
    expect(checkColumn(col('purchasesReturn'), 'Dr').message).toContain('Wrong column');
    expect(checkColumn(col('creditor:Rao & Co.'), 'none').right).toBe(true);
    expect(checkColumn(col('creditor:Rao & Co.'), 'Cr').right).toBe(false);
    expect(checkColumn(col('cash'), 'none').message).toContain('Every account with a balance is listed');
  });

  it('makes every kind from any seed', () => {
    for (let seed = 1; seed <= 60; seed++) for (const k of TRY_KINDS) expect(makeQuestion(seed, k).kind).toBe(k);
  });
});
