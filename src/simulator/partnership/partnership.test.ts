import { describe, expect, it } from 'vitest';
import { rupees } from '@/engine/money';
import { appropriate, type AppropriationIn, type PartnerIn } from './appropriation';
import { eq, fr, parseRatio, ratioOf, sameRatio, sum } from './fraction';
import { reconstitute, reconProblem } from './reconstitution';
import { splitByRatio } from './split';
import { EXAMPLES, newFigures, RECON_EXAMPLES } from './examples';
import { partnershipQuestions } from './questions';
import { createRng } from '@/engine/rng';

const R = rupees;
const p = (name: string, capital: number, ratio: number, salary = 0, drawings = 0): PartnerIn => ({ name, capital: R(capital), ratio, salary: R(salary), drawings: R(drawings) });
const base = (over: Partial<AppropriationIn>): AppropriationIn => ({
  partners: [p('Asha', 400000, 3), p('Bimal', 300000, 2)],
  netProfit: R(300000),
  iocRate: 10,
  iodRate: 0,
  commission: null,
  guarantee: null,
  capitals: 'fixed',
  ...over,
});
const sumOf = (xs: number[]) => xs.reduce((s, x) => s + x, 0);

describe('splitByRatio', () => {
  it('shares exactly, giving the odd paise to the largest remainders', () => {
    expect(splitByRatio(R(100000), [1, 1, 1])).toEqual([3333334, 3333333, 3333333]);
    expect(splitByRatio(R(200000), [5, 3, 2])).toEqual([R(100000), R(60000), R(40000)]);
    expect(sumOf(splitByRatio(R(-19000), [3, 2]))).toBe(R(-19000));
    expect(splitByRatio(R(-19000), [3, 2])).toEqual([R(-11400), R(-7600)]);
  });
  it('handles large weights without losing a paisa', () => {
    const parts = splitByRatio(4500000, [2000000, 1000000, 0, 3000000]);
    expect(parts).toEqual([1500000, 750000, 0, 2250000]);
  });
});

describe('fractions and ratios', () => {
  it('reduces ratios to lowest terms', () => {
    expect(ratioOf([fr(3, 20), fr(2, 20)])).toEqual([3, 2]);
    expect(ratioOf([fr(1, 2), fr(3, 10), fr(1, 5)])).toEqual([5, 3, 2]);
    expect(ratioOf([fr(0), fr(1, 6)])).toEqual([0, 1]);
  });
  it('reads a typed ratio', () => {
    expect(parseRatio('3 : 2')).toEqual([3, 2]);
    expect(parseRatio('3/2')).toBeNull();
    expect(sameRatio([6, 4], [3, 2])).toBe(true);
    expect(sameRatio([2, 3], [3, 2])).toBe(false);
  });
});

describe('Profit and Loss Appropriation', () => {
  it('meets every appropriation and shares the rest (fixed capitals, interest on drawings)', () => {
    const a = appropriate(base({ partners: [p('Asha', 400000, 3, 0, 40000), p('Bimal', 300000, 2, 60000, 30000)], iodRate: 6 }));
    expect(a.case).toBe('full');
    expect(a.iod).toEqual([R(1200), R(900)]);
    expect(a.ioc).toEqual([R(40000), R(30000)]);
    expect(a.salary).toEqual([0, R(60000)]);
    expect(a.available).toBe(R(302100));
    expect(a.divisible).toBe(R(172100));
    expect(a.shares).toEqual([R(103260), R(68840)]);
    expect(a.account.total).toBe(R(302100));
    expect(sumOf(a.account.dr.map((r) => r.amount))).toBe(sumOf(a.account.cr.map((r) => r.amount)));
    // Fixed capitals: the capital accounts do not move; the current accounts take everything.
    const [capital, current] = a.partnerAccounts;
    expect(capital.totals).toEqual([R(400000), R(300000)]);
    const cd = current.dr.find((r) => r.text === 'To Balance c/d')!;
    expect(cd.amounts).toEqual([R(102060), R(127940)]);
    expect(current.totals).toEqual([R(143260), R(158840)]);
  });

  it('shares a short profit in proportion to the interest due (NCERT)', () => {
    const a = appropriate(base({ partners: [p('Asha', 300000, 1), p('Bimal', 200000, 1)], netProfit: R(40000) }));
    expect(a.case).toBe('short');
    expect(a.iocDue).toEqual([R(30000), R(20000)]);
    expect(a.ioc).toEqual([R(24000), R(16000)]);
    expect(a.divisible).toBe(0);
    expect(a.shares).toEqual([0, 0]);
    expect(a.account.total).toBe(R(40000));
  });

  it('cuts interest and salary in the same proportion when both are due', () => {
    const a = appropriate(base({ partners: [p('Asha', 200000, 1), p('Bimal', 100000, 1, 30000)], netProfit: R(45000) }));
    expect(a.case).toBe('short');
    expect(a.ioc).toEqual([R(15000), R(7500)]);
    expect(a.salary).toEqual([0, R(22500)]);
    expect(a.steps.find((s) => s.key === 'ioc')!.text).toContain('in proportion');
  });

  it('allows no appropriation with a loss, but still charges interest on drawings (fluctuating capitals)', () => {
    const a = appropriate(base({ partners: [p('Asha', 400000, 3, 0, 20000), p('Bimal', 300000, 2, 60000)], netProfit: R(-20000), iodRate: 10, capitals: 'fluctuating' }));
    expect(a.case).toBe('loss');
    expect(a.ioc).toEqual([0, 0]);
    expect(a.salary).toEqual([0, 0]);
    expect(a.iod).toEqual([R(1000), 0]);
    expect(a.divisible).toBe(R(-19000));
    expect(a.shares).toEqual([R(-11400), R(-7600)]);
    expect(a.account.dr[0]).toMatchObject({ text: 'To Profit and Loss A/c (Net Loss)', amount: R(20000) });
    expect(a.account.cr.map((r) => r.text)).toEqual(['By Interest on Drawings:', 'By Loss transferred to:']);
    expect(a.account.total).toBe(R(20000));
    const [capitals] = a.partnerAccounts;
    expect(capitals.title).toBe("Partners' Capital Accounts");
    // Asha: 4,00,000 - 20,000 - 1,000 - 11,400 = 3,67,600; Bimal: 3,00,000 - 7,600 = 2,92,400.
    expect(capitals.dr.find((r) => r.text === 'To Balance c/d')!.amounts).toEqual([R(367600), R(292400)]);
  });

  it('makes good a guaranteed share: by the firm, and by one partner', () => {
    const three = [p('Qadir', 0, 5), p('Rekha', 0, 3), p('Suresh', 0, 2)];
    const firm = appropriate(base({ partners: three, netProfit: R(200000), iocRate: 0, guarantee: { partner: 2, amount: R(50000), by: 'firm' } }));
    expect(firm.deficiency).toBe(R(10000));
    expect(firm.finalShares).toEqual([R(93750), R(56250), R(50000)]);
    const one = appropriate(base({ partners: three, netProfit: R(200000), iocRate: 0, guarantee: { partner: 2, amount: R(50000), by: 0 } }));
    expect(one.finalShares).toEqual([R(90000), R(60000), R(50000)]);
    const none = appropriate(base({ partners: three, netProfit: R(200000), iocRate: 0, guarantee: { partner: 2, amount: R(30000), by: 'firm' } }));
    expect(none.deficiency).toBe(0);
    expect(none.finalShares).toEqual([R(100000), R(60000), R(40000)]);
    expect(none.steps.find((s) => s.key === 'guarantee')!.text).toContain('nothing is made good');
  });

  it('works a commission before charging it', () => {
    const a = appropriate(base({ netProfit: R(220000), iocRate: 0, commission: { partner: 1, rate: 10 } }));
    expect(a.commission).toEqual([0, R(22000)]);
    expect(a.divisible).toBe(R(198000));
  });

  it('allows nothing with neither a profit nor a loss, and does not call it a loss', () => {
    const a = appropriate(base({ netProfit: 0 }));
    expect(a.case).toBe('loss');
    expect(a.ioc).toEqual([0, 0]);
    expect(a.steps[0].title).toBe('Neither profit nor loss');
    expect(a.steps[0].text).not.toContain('loss of');
    expect(a.account.total).toBe(0);
  });

  it('shares to the paisa when the ratio does not divide the profit', () => {
    const a = appropriate(base({ partners: [p('A', 0, 1), p('B', 0, 1), p('C', 0, 1)], netProfit: R(100000), iocRate: 0 }));
    expect(sumOf(a.shares)).toBe(R(100000));
  });

  it('keeps the pool and the partners in step through the walk-through', () => {
    for (const ex of EXAMPLES) {
      const a = appropriate(ex.input);
      const last = a.steps[a.steps.length - 1];
      expect(last.pool, ex.id).toBe(0);
      const credited = last.layers.map((ls) => sumOf(ls.map((l) => l.amount)));
      expect(credited, ex.id).toEqual(a.netCredit);
      expect(sumOf(a.account.dr.map((r) => r.amount)), ex.id).toBe(sumOf(a.account.cr.map((r) => r.amount)));
    }
  });
});

describe('reconstitution', () => {
  const g = R(100000);
  it('admits a partner who takes a share from the old partners in their old ratio', () => {
    const r = reconstitute({ names: ['Asha', 'Bimal'], ratio: [3, 2], goodwill: g, event: { kind: 'admission', name: 'Chitra', share: fr(1, 5), from: { kind: 'old-ratio' }, capital: R(80000), premium: 'cash' } });
    expect(r.newRatio).toEqual([12, 8, 5]);
    expect(r.sacrificingRatio).toEqual([3, 2]);
    expect(r.goodwillAmount).toBe(R(20000));
    expect(r.goodwillShares).toEqual([R(12000), R(8000), R(-20000)]);
    expect(r.entries[0].lines).toEqual([
      { account: 'Bank A/c', side: 'Dr', amount: R(100000) },
      { account: "Chitra's Capital A/c", side: 'Cr', amount: R(80000) },
      { account: 'Premium for Goodwill A/c', side: 'Cr', amount: R(20000) },
    ]);
    expect(r.entries[1].lines.map((l) => l.account)).toEqual(['Premium for Goodwill A/c', "Asha's Capital A/c", "Bimal's Capital A/c"]);
  });

  it('admits a partner who takes the share equally, or from one partner', () => {
    const eqly = reconstitute({ names: ['Asha', 'Bimal'], ratio: [3, 2], goodwill: g, event: { kind: 'admission', name: 'Chitra', share: fr(1, 5), from: { kind: 'equal' }, capital: 0, premium: 'capital' } });
    expect(eqly.newRatio).toEqual([5, 3, 2]);
    expect(eqly.sacrificingRatio).toEqual([1, 1]);
    expect(eqly.entries[0].lines[0]).toEqual({ account: "Chitra's Capital A/c", side: 'Dr', amount: R(20000) });
    const one = reconstitute({ names: ['Asha', 'Bimal'], ratio: [3, 2], goodwill: g, event: { kind: 'admission', name: 'Chitra', share: fr(1, 5), from: { kind: 'one', partner: 0 }, capital: 0, premium: 'cash' } });
    expect(one.newRatio).toEqual([2, 2, 1]);
    expect(one.sacrificers).toEqual([0]);
    expect(one.goodwillShares).toEqual([R(20000), 0, R(-20000)]);
  });

  it('changes the ratio among the same partners', () => {
    const r = reconstitute({ names: ['Asha', 'Bimal', 'Chitra'], ratio: [3, 2, 1], goodwill: R(60000), event: { kind: 'change', newRatio: [1, 2, 3] } });
    expect(r.sacrificers).toEqual([0]);
    expect(r.gainers).toEqual([2]);
    expect(r.goodwillShares).toEqual([R(20000), 0, R(-20000)]);
    expect(r.entries[0].lines).toEqual([
      { account: "Chitra's Capital A/c", side: 'Dr', amount: R(20000) },
      { account: "Asha's Capital A/c", side: 'Cr', amount: R(20000) },
    ]);
  });

  it('retires a partner: the others gain in their old ratio and pay for the goodwill', () => {
    const r = reconstitute({ names: ['Asha', 'Bimal', 'Chitra'], ratio: [3, 2, 1], goodwill: R(120000), event: { kind: 'retirement', partner: 2, newRatio: 'old-ratio' } });
    expect(r.newRatio).toEqual([3, 2, 0]);
    expect(r.gainingRatio).toEqual([3, 2]);
    expect(r.goodwillShares).toEqual([R(-12000), R(-8000), R(20000)]);
  });

  it('retires a partner with a stated new ratio, a remaining partner sacrificing too', () => {
    const r = reconstitute({ names: ['Asha', 'Bimal', 'Chitra'], ratio: [1, 1, 1], goodwill: R(120000), event: { kind: 'death', partner: 2, newRatio: [3, 1] } });
    expect(r.gainers).toEqual([0]);
    expect(r.sacrificers).toEqual([1, 2]);
    expect(r.sacrificingRatio).toEqual([1, 4]);
    expect(r.goodwillShares).toEqual([R(-50000), R(10000), R(40000)]);
    const s = reconstitute({ names: ['Asha', 'Bimal', 'Chitra'], ratio: [2, 2, 1], goodwill: R(50000), event: { kind: 'retirement', partner: 1, newRatio: [1, 1] } });
    expect(s.gainingRatio).toEqual([1, 3]);
    expect(s.goodwillShares).toEqual([R(-5000), R(20000), R(-15000)]);
    // The words name the remaining partner's sacrifice too, and the narration does not hide it.
    const t = reconstitute({ names: ['Asha', 'Bimal', 'Chitra'], ratio: [2, 2, 1], goodwill: R(100000), event: { kind: 'retirement', partner: 1, newRatio: [1, 3] } });
    expect(t.goodwillShares).toEqual([R(15000), R(40000), R(-55000)]);
    expect(t.steps.find((x) => x.key === 'split')!.text).toContain('Asha gives up 3/20');
    expect(t.steps.find((x) => x.key === 'goodwill')!.text).toContain('Chitra, the only gaining partner, is debited with the whole ₹55,000');
    expect(t.entries[0].narration).toBe("Bimal's share of goodwill and Asha's sacrifice debited to Chitra, the gaining partner, on Bimal's retirement");
  });

  it('lays the wedges so that the old and the new circles are both whole', () => {
    for (const ex of RECON_EXAMPLES) {
      const r = reconstitute(ex.input);
      expect(eq(sum(r.pieces.map((x) => x.size)), fr(1)), ex.id).toBe(true);
      r.names.forEach((_, i) => {
        expect(eq(sum(r.pieces.filter((x) => x.to === i).map((x) => x.size)), r.newShares[i]), `${ex.id} new ${i}`).toBe(true);
        expect(eq(sum(r.pieces.filter((x) => x.from === i).map((x) => x.size)), r.oldShares[i]), `${ex.id} old ${i}`).toBe(true);
      });
      for (const e of r.entries) {
        const dr = sumOf(e.lines.filter((l) => l.side === 'Dr').map((l) => l.amount));
        const cr = sumOf(e.lines.filter((l) => l.side === 'Cr').map((l) => l.amount));
        expect(dr, ex.id).toBe(cr);
      }
    }
  });

  it('refuses figures that cannot be worked', () => {
    expect(reconProblem({ names: ['A', 'B'], ratio: [1, 1], goodwill: 0, event: { kind: 'retirement', partner: 0, newRatio: 'old-ratio' } })).toMatch(/three partners/);
    expect(reconProblem({ names: ['A', 'B'], ratio: [3, 1], goodwill: 0, event: { kind: 'admission', name: 'C', share: fr(1, 3), from: { kind: 'one', partner: 1 }, capital: 0, premium: 'cash' } })).toMatch(/enough/);
    expect(reconProblem({ names: ['A', 'B'], ratio: [3, 2], goodwill: 0, event: { kind: 'change', newRatio: [6, 4] } })).toMatch(/same as the old/);
    expect(reconProblem({ names: ['A', 'B', 'C'], ratio: [3, 2, 1], goodwill: 0, event: { kind: 'change', newRatio: [3, 0, 1] } })).toMatch(/at least 1/);
  });
});

describe('figures and questions', () => {
  it('makes new figures that always work, every one in whole rupees as a board question has them', () => {
    const whole = (xs: number[]) => xs.every((x) => x % 100 === 0);
    for (let seed = 1; seed <= 200; seed++) {
      const f = newFigures(createRng(seed));
      const a = appropriate(f.appropriation);
      expect(whole([...a.iod, ...a.ioc, ...a.salary, ...a.commission, ...a.shares, ...a.finalShares]), `seed ${seed}`).toBe(true);
      if (a.divisible > 0) expect(a.finalShares.every((x) => x >= 0), `seed ${seed}`).toBe(true);
      expect(reconProblem(f.recon)).toBeNull();
      const r = reconstitute(f.recon);
      expect(whole([r.goodwillAmount, ...r.goodwillShares]), `seed ${seed}`).toBe(true);
    }
  });
  it('asks questions whose answers follow from the logic', () => {
    for (let seed = 1; seed <= 40; seed++) {
      const qs = partnershipQuestions(seed);
      expect(qs.length).toBeGreaterThanOrEqual(3);
      expect(new Set(qs.map((q) => q.kind)).size).toBeGreaterThanOrEqual(3);
      for (const q of qs) expect(q.why.length).toBeGreaterThan(0);
    }
  });
});
