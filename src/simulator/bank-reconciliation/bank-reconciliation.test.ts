import { describe, expect, it } from 'vitest';
import { rupees } from '@/engine/money';
import { createRng } from '@/engine/rng';
import { amendedCashBookOf, balanceLabel, cashBookOf, factsOf, passBookOf, reconcile, statementOf, statementSoFar, treatmentOf, type Scenario } from './books';
import { EXAMPLES, randomScenario } from './examples';
import { stepsOf } from './story';
import { BRS_ASK_KINDS, brsAsk } from './tryit';

const r = rupees;
const ex = (id: string) => EXAMPLES.find((e) => e.id === id)!.scenario;
const sumOf = (rows: { amount: number }[]) => rows.reduce((t, x) => t + x.amount, 0);
const lines = (xs: { item: { amount: number }; facts: { line: string } }[]) => xs.map((l) => [l.facts.line, l.item.amount / 100]);

describe('the two books, worked by hand', () => {
  it('a favourable month: the cash book, the pass book and their balances', () => {
    const s = ex('favourable-cb');
    const cb = cashBookOf(s);
    expect(cb.balance).toBe(r(43500));
    expect(cb.dr.map((x) => [x.day, x.particulars, x.amount / 100])).toEqual([
      [1, 'To Balance b/d', 42000],
      [5, 'To Kumar & Co.', 18000],
      [10, 'To Joshi Stores', 3000],
      [30, 'To Sinha & Sons', 8000],
    ]);
    expect(cb.cr.map((x) => [x.particulars, x.amount / 100])).toEqual([
      ['By Gupta Suppliers', 15000],
      ['By Patel Traders', 12500],
      ['By Balance c/d', 43500],
    ]);
    expect(sumOf(cb.dr)).toBe(sumOf(cb.cr));
    const pb = passBookOf(s);
    expect(pb.balance).toBe(r(50250));
    expect(pb.rows.map((x) => x.particulars)).toEqual([
      'Opening balance', 'Cheque deposited: Kumar & Co.', 'Cheque deposited: Joshi Stores', 'Cheque paid: Gupta Suppliers',
      'Cheque returned unpaid: Joshi Stores', 'Direct deposit: Mehra Brothers', 'Bank charges', 'Interest',
    ]);
    expect(pb.rows.at(-1)!.balance).toBe(r(50250));
  });

  it('an overdraft with an error in each book', () => {
    const s = ex('overdraft-pb');
    expect(cashBookOf(s).balance).toBe(r(-8900));
    expect(passBookOf(s).balance).toBe(r(-14950));
    const cb = cashBookOf(s);
    expect(cb.cr[0]).toMatchObject({ particulars: 'By Balance b/d (overdraft)', amount: r(25000) });
    expect(cb.dr.at(-1)).toMatchObject({ particulars: 'To Balance c/d (overdraft)', amount: r(8900) });
    expect(cb.cr.find((x) => x.item === 'a')?.amount).toBe(r(5400));
    expect(sumOf(cb.dr)).toBe(sumOf(cb.cr));
    expect(factsOf(s.items[0], s).line).toBe('Cheque issued to Ramesh Tyres for ₹4,500, entered as ₹5,400');
  });
});

describe('the statement', () => {
  it('from a favourable cash book balance: add and less, ending on the pass book balance', () => {
    const st = statementOf(ex('favourable-cb'), 'cb');
    expect(st.startLabel).toBe('Balance as per Cash Book');
    expect(lines(st.adds)).toEqual([
      ['Amount deposited directly by Mehra Brothers', 5000],
      ['Cheque issued to Patel Traders, not yet presented', 12500],
      ['Interest credited by the bank', 600],
    ]);
    expect(lines(st.lesses)).toEqual([
      ['Cheque from Joshi Stores deposited and dishonoured', 3000],
      ['Cheque from Sinha & Sons deposited, not yet credited', 8000],
      ['Bank charges debited by the bank', 350],
    ]);
    expect(st.afterAdds).toBe(r(61600));
    expect(st.end).toBe(r(50250));
    expect(st.endLabel).toBe('Balance as per Pass Book');
    expect(st.plusTotal - st.minusTotal).toBe(st.end);
  });

  it('from the pass book every item turns round', () => {
    const st = statementOf(ex('favourable-cb'), 'pb');
    expect(st.start).toBe(r(50250));
    expect(st.adds.map((l) => l.item.id).sort()).toEqual(['a', 'd', 'e']);
    expect(st.end).toBe(r(43500));
  });

  it('from an overdraft as per pass book: the rule turns round again', () => {
    const s = ex('overdraft-pb');
    const st = statementOf(s, 'pb');
    expect(st.startLabel).toBe('Overdraft as per Pass Book');
    // Issued but not presented: from a favourable pass book it is deducted, so from an overdraft it is added.
    expect(lines(st.adds)).toEqual([
      ['Cheque issued to Ramesh Tyres for ₹4,500, entered as ₹5,400', 900],
      ['Cheque issued to Deccan Lubricants, not yet presented', 6000],
    ]);
    expect(lines(st.lesses)).toEqual([
      ['Cheque of another customer wrongly debited by the bank', 2000],
      ['Insurance premium paid by the bank on standing instruction', 1200],
      ['Cheque from Sharma Garage deposited, not yet credited', 9500],
      ['Bank charges debited by the bank', 250],
    ]);
    expect(st.afterAdds).toBe(r(21850));
    expect(st.end).toBe(r(-8900));
    expect(st.endLabel).toBe('Overdraft as per Cash Book');
    expect([st.plusTotal / 100, st.minusTotal / 100]).toEqual([12950, 21850]);
  });

  it('a favourable balance can turn into an overdraft', () => {
    const s: Scenario = { ...ex('favourable-cb'), opening: r(2000), common: [], items: [{ id: 'x', kind: 'charges', day: 31, amount: r(500), party: '' }, { id: 'y', kind: 'deposited', day: 30, amount: r(4000), party: 'Bose Brothers' }] };
    const st = statementOf(s, 'cb');
    expect(st.start).toBe(r(6000));
    expect(st.end).toBe(r(1500));
    const tight = { ...s, items: [{ id: 'y', kind: 'deposited' as const, day: 30, amount: r(9000), party: 'Bose Brothers' }] };
    const t = statementOf(tight, 'cb');
    expect(t.start).toBe(r(11000));
    expect(t.end).toBe(r(2000));
    const turned = statementOf({ ...tight, opening: r(-1000) }, 'cb');
    expect(turned.start).toBe(r(8000));
    expect(turned.end).toBe(r(-1000));
    expect(turned.endLabel).toBe('Overdraft as per Pass Book');
    expect(balanceLabel('cb', 0)).toBe('Balance as per Cash Book');
  });

  it('the amended cash book takes in what the bank recorded first and the firm\'s own errors', () => {
    const s = ex('favourable-cb');
    const a = amendedCashBookOf(s);
    expect(a.balance).toBe(r(45750));
    expect(a.dr.map((x) => [x.particulars, x.amount / 100])).toEqual([
      ['To Balance b/d (as per the cash book)', 43500],
      ['To Mehra Brothers', 5000],
      ['To Interest A/c', 600],
    ]);
    expect(a.cr.map((x) => [x.particulars, x.amount / 100])).toEqual([
      ['By Joshi Stores (cheque dishonoured)', 3000],
      ['By Bank Charges A/c', 350],
      ['By Balance c/d (amended)', 45750],
    ]);
    const st = statementOf(s, 'cb', true);
    expect(st.startLabel).toBe('Balance as per Amended Cash Book');
    expect(lines(st.adds)).toEqual([['Cheque issued to Patel Traders, not yet presented', 12500]]);
    expect(lines(st.lesses)).toEqual([['Cheque from Sinha & Sons deposited, not yet credited', 8000]]);
    expect(st.end).toBe(r(50250));
    const o = amendedCashBookOf(ex('overdraft-pb'));
    // -8,900 + 900 (error) - 1,200 (premium) - 250 (charges) = -9,450: the bank's error stays out.
    expect(o.balance).toBe(r(-9450));
    const fromPb = statementOf(ex('overdraft-pb'), 'pb', true);
    expect(fromPb.end).toBe(r(-9450));
    expect(fromPb.endLabel).toBe('Overdraft as per Amended Cash Book');
  });

  it('on an overdrawn account interest is charged by the bank, not credited', () => {
    const base = ex('overdraft-pb');
    const s: Scenario = { ...base, items: [...base.items, { id: 'g', kind: 'interest', day: 31, amount: r(400), party: '' }] };
    const g = s.items.at(-1)!;
    expect(factsOf(g, s)).toMatchObject({ sign: -1, line: 'Interest on overdraft debited by the bank', enter: true });
    expect(passBookOf(s).balance).toBe(r(-15350));
    expect(passBookOf(s).rows.at(-1)).toMatchObject({ particulars: 'Interest on overdraft', withdrawal: r(400) });
    expect(amendedCashBookOf(s).cr.map((x) => x.particulars)).toContain('By Interest on Overdraft A/c');
    expect(amendedCashBookOf(s).balance).toBe(r(-9850));
    // From the overdraft as per cash book the pass book overdraft is bigger: Add.
    expect(treatmentOf('cb', cashBookOf(s).balance, g, s)).toBe('add');
    expect(statementOf(s, 'cb').end).toBe(r(-15350));
    // On a favourable account it is credited.
    expect(factsOf({ ...g }, ex('favourable-cb')).sign).toBe(1);
  });

  it('agrees with the books, from either book and amended or not, for made-up months', () => {
    const rng = createRng(9);
    for (let n = 0; n < 300; n++) {
      const s = randomScenario(rng);
      const cb = cashBookOf(s);
      const pb = passBookOf(s);
      expect(sumOf(cb.dr)).toBe(sumOf(cb.cr));
      expect(statementOf(s, 'cb').end).toBe(pb.balance);
      expect(statementOf(s, 'pb').end).toBe(cb.balance);
      const a = amendedCashBookOf(s);
      expect(sumOf(a.dr)).toBe(sumOf(a.cr));
      expect(statementOf(s, 'cb', true).end).toBe(pb.balance);
      expect(statementOf(s, 'pb', true).end).toBe(a.balance);
      for (const st of [statementOf(s, 'cb'), statementOf(s, 'pb')]) {
        expect(st.plusTotal - st.minusTotal).toBe(st.end);
        // The textbook way: running total in the starting balance's own terms.
        let m = Math.abs(st.start);
        for (const l of st.adds) m += l.item.amount;
        for (const l of st.lesses) m -= l.item.amount;
        expect(st.start >= 0 ? m : -m).toBe(st.end);
      }
      for (const i of s.items) expect(reconcile('pb', reconcile('cb', 0, [i], s), [i], s)).toBe(0);
    }
  });

  it('the rule for each kind, from a favourable cash book balance, is the textbook one', () => {
    const s = ex('favourable-cb');
    const add = s.items.filter((i) => treatmentOf('cb', r(1), i, s) === 'add').map((i) => i.kind).sort();
    expect(add).toEqual(['direct', 'interest', 'issued']);
    const fromOverdraft = s.items.filter((i) => treatmentOf('cb', r(-1), i, s) === 'add').map((i) => i.kind).sort();
    expect(fromOverdraft).toEqual(['charges', 'deposited', 'dishonoured']);
  });
});

describe('the walk-through', () => {
  it('carries every item in date order until the other balance is reached', () => {
    const steps = stepsOf(ex('favourable-cb'), 'cb', false);
    expect(steps.map((x) => x.kind)).toEqual(['intro', 'carry', 'carry', 'carry', 'carry', 'carry', 'carry', 'done']);
    expect(steps[0].text).toContain('₹43,500 in the bank');
    expect(steps[0].text).toContain('₹6,750 apart');
    expect(steps[1].text).toContain('Less ₹3,000: ₹40,500 (favourable) so far');
    expect(steps.at(-2)!.running).toBe(r(50250));
    expect(steps.at(-1)!.text).toContain('Balance as per Pass Book, ₹50,250');
  });

  it('amends the cash book first when asked', () => {
    const steps = stepsOf(ex('amended-cb'), 'cb', true);
    expect(steps.map((x) => x.kind)).toEqual(['intro', 'amend', 'amend', 'amend', 'amend', 'carry', 'carry', 'done']);
    expect(steps[4].running).toBe(r(45750));
    expect(steps.at(-1)!.running).toBe(r(50250));
  });

  it('from an overdraft as per pass book', () => {
    const steps = stepsOf(ex('overdraft-pb'), 'pb', false);
    expect(steps[0].running).toBe(r(-14950));
    expect(steps.at(-2)!.running).toBe(r(-8900));
    expect(steps[1].text).toContain('From an overdraft the rule turns round');
  });
});

describe('try it', () => {
  it('asks every kind with one right answer', () => {
    for (let seed = 1; seed <= 80; seed++) {
      const rng = createRng(seed);
      for (const kind of BRS_ASK_KINDS) {
        const q = brsAsk(kind, rng);
        expect(q.items.length).toBeGreaterThan(0);
        if (q.answer.type === 'choice') {
          expect(q.answer.options.filter((o) => o.id === (q.answer as { correct: string }).correct)).toHaveLength(1);
          for (const o of q.answer.options) if (o.id !== q.answer.correct) expect(o.why).toBeTruthy();
        } else {
          for (const m of q.answer.mistakes) expect(m.value).not.toBe(q.answer.value);
          expect(new Set(q.answer.mistakes.map((m) => m.value)).size).toBe(q.answer.mistakes.length);
          const end = statementOf(q.scenario, q.from).end;
          expect(q.answer.value).toBe(Math.abs(end));
          expect(q.answer.tag?.correct).toBe(end >= 0 ? 'fav' : 'od');
        }
      }
    }
  });
});

describe('the statement so far', () => {
  it('adds up only what has been carried in, and is complete with everything', () => {
    const s = ex('favourable-cb');
    const part = statementSoFar(s, 'cb', false, ['c', 'e']);
    expect(lines(part.adds)).toEqual([['Cheque issued to Patel Traders, not yet presented', 12500]]);
    expect(lines(part.lesses)).toEqual([['Bank charges debited by the bank', 350]]);
    expect(part.end).toBe(r(55650));
    expect(part.complete).toBe(false);
    expect(part.endLabel).toBe('So far (favourable)');
    const all = statementSoFar(s, 'cb', false, s.items.map((i) => i.id));
    expect(all.complete).toBe(true);
    expect(all.end).toBe(r(50250));
    expect(all.endLabel).toBe('Balance as per Pass Book');
    const amended = statementSoFar(s, 'cb', true, ['c', 'd']);
    expect(amended.complete).toBe(true);
    expect(amended.end).toBe(r(50250));
  });
});
