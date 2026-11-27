import { describe, expect, it } from 'vitest';
import { rupees } from '@/engine/money';
import { ANANYA, KABIR, MEERA, newBusiness, READY } from './examples';
import { effectsOf, finalAccounts, ITEMS, partsOf, SPOTS, type Spot } from './model';
import { effectsWanted, markEffects, markFigure, markWhere, parseRupees, tryRound, type EffectsQuestion, type FigureQuestion, type WhereQuestion } from './tryit';
import { partOne, partTwo, stepWords } from './walk';

describe('the walk-through, part one', () => {
  it('places every balance once, in steps, and ends with the accounts closed and agreeing', () => {
    for (const b of [...READY, newBusiness(5)]) {
      const steps = partOne(b);
      expect(steps[0].state.placed.size).toBe(0);
      const last = steps.at(-1)!.state;
      expect(last.placed.size).toBe(b.tb.length);
      expect(last.closePL).toBe(true);
      const st = finalAccounts(b, last);
      expect(st.bs.liabilities.total).toBe(st.bs.assets.total);
      // Nothing is taken back: each step shows what the one before showed, and more.
      for (let i = 1; i < steps.length; i++) for (const id of steps[i - 1].state.placed) expect(steps[i].state.placed.has(id)).toBe(true);
      for (const s of steps) expect(s.text.length).toBeGreaterThan(40);
    }
  });

  it('tells the figures of Meera Textiles', () => {
    const steps = partOne(MEERA);
    expect(steps.map((s) => s.title)).toEqual([
      'The trial balance',
      'The cost of the goods',
      'What the goods brought in',
      'Closing stock: two places',
      'Gross profit',
      'The running costs',
      'Other incomes',
      'What the business owns',
      'What the business owes',
      'Net profit to capital',
    ]);
    expect(steps[0].text).toContain('₹5,98,000');
    expect(steps[1].text).toContain('Purchases ₹2,10,000 less Purchases Return ₹10,000');
    expect(steps[4].text).toContain('gross profit of ₹1,00,000');
    expect(steps[8].text).toContain('liabilities ₹2,21,000, assets ₹2,73,000');
    expect(steps[8].text).toContain('₹52,000');
    expect(steps[9].text).toContain('net profit of ₹52,000');
    expect(steps[9].text).toContain('₹2,28,000');
  });

  it('tells a loss on the other side', () => {
    const steps = partOne(KABIR);
    expect(steps.find((s) => s.title === 'Gross loss')?.text).toContain('gross loss of ₹5,000');
    expect(steps.at(-1)!.title).toBe('Net loss to capital');
    expect(steps.at(-1)!.text).toContain('net loss of ₹65,000');
  });
});

describe('the walk-through, part two', () => {
  it('makes one adjustment a step, and the Balance Sheet agrees after each', () => {
    const steps = partTwo(MEERA);
    expect(steps).toHaveLength(MEERA.adjustments.length + 1);
    for (const s of steps) {
      const st = finalAccounts(MEERA, s.state);
      expect(st.bs.liabilities.total).toBe(st.bs.assets.total);
    }
    expect(steps[1].effects).toEqual(['Profit and Loss Account, debit side: Salaries: add outstanding ₹4,000', 'Balance Sheet, liabilities side: Outstanding Salaries ₹4,000, a current liability']);
    expect(steps[1].result).toContain('Net profit falls from ₹52,000 to ₹48,000');
    expect(stepWords(steps[1])).toContain('Second effect: Balance Sheet, liabilities side: Outstanding Salaries ₹4,000');
    expect(steps.at(-1)!.text).toContain('net profit of ₹31,500');
    expect(steps.at(-1)!.text).toContain('₹2,71,650');
  });

  it('works the commission out last, on the profit after every other adjustment, and gives the fire three effects', () => {
    const steps = partTwo(MEERA);
    const commission = steps.find((s) => s.title === "Manager's commission")!;
    expect(steps.at(-2)).toBe(commission);
    expect(commission.text).toContain('The net profit before it is ₹34,650: ₹34,650 × 10/110 = ₹3,150.');
    expect(commission.result).toContain('Net profit falls from ₹34,650 to ₹31,500');
    const fire = steps.find((s) => s.title === 'Goods lost by fire')!;
    expect(fire.effects).toHaveLength(3);
    expect(stepWords(fire)).toContain('Third effect: Balance Sheet, assets side: Insurance Claim Receivable ₹4,000, a current asset.');
    // Goods given away move the gross result only.
    const samples = partTwo(KABIR).find((s) => s.title === 'Goods given as free samples')!;
    expect(samples.result).toContain('Gross loss shrinks from ₹5,000 to ₹3,500. The net loss does not change');
    expect(partTwo(ANANYA).find((s) => s.title === 'Goods lost by fire')!.text).toContain('the whole cost is a loss of the year');
    // No interest on drawings: it is not in the 2025-26 list.
    for (const b of READY) expect(b.adjustments.map((a) => a.type as string)).not.toContain('interestOnDrawings');
  });

  it('says when interest on capital leaves the capital where it was', () => {
    const step = partTwo(MEERA).find((s) => s.title === 'Interest on capital')!;
    expect(step.result).toContain('Capital stays at ₹2,15,650');
    expect(partTwo(MEERA).find((s) => s.title === 'Outstanding Salaries')!.result).toContain('the two effects cancel inside it');
    // A loss is told as a loss.
    expect(partTwo(KABIR)[1].result).toContain('Gross loss grows from ₹5,000 to ₹7,000');
  });
});

describe('Try it', () => {
  const round = tryRound(MEERA, 7);

  it('serves two questions of each kind', () => {
    expect(round).toHaveLength(6);
    expect(round.filter((q) => q.kind === 'where')).toHaveLength(2);
    expect(round.filter((q) => q.kind === 'effects')).toHaveLength(2);
    expect(round.filter((q) => q.kind === 'figure')).toHaveLength(2);
    expect(tryRound(MEERA, 7)).toEqual(round);
  });

  it('marks where a balance goes, with the trap named', () => {
    const q = tryRound(MEERA, 1).find((x): x is WhereQuestion => x.kind === 'where')!;
    expect(markWhere(q, q.answer).right).toBe(true);
    const wrong = SPOTS.find((s) => s !== q.answer) as Spot;
    expect(markWhere(q, wrong).right).toBe(false);
    expect(q.before.placed.has(q.item)).toBe(false);
    expect(q.after.placed.has(q.item)).toBe(true);
    // Every balance has a place: drawings to capital, a purchases return to the debit side.
    for (const l of MEERA.tb) {
      const w = tryRound({ ...MEERA, tb: [l, ...MEERA.tb.filter((x) => x !== l)] }, 1);
      expect(w.length).toBeGreaterThan(0);
    }
    const drawings: WhereQuestion = { ...q, item: 'drawings', answer: 'bs-liabilities', reason: ITEMS.drawings.why };
    expect(markWhere(drawings, 'pl-dr').why).toContain('not an expense');
  });

  it('marks the effects: all right, or the mistake named', () => {
    for (let seed = 1; seed <= 40; seed++) {
      for (const q of [...tryRound(MEERA, seed), ...tryRound(ANANYA, seed)].filter((x): x is EffectsQuestion => x.kind === 'effects')) {
        expect(effectsWanted(q)).toBe(effectsOf(MEERA.adjustments.includes(q.adjustment) ? MEERA : ANANYA, q.adjustment, q.after.adjustments).length);
        expect(q.prompt).toContain(`Choose its ${effectsWanted(q) === 3 ? 'three' : 'two'} effects.`);
        expect(q.options.length).toBeGreaterThanOrEqual(5);
        const right = q.options.filter((o) => o.right).map((o) => o.id);
        expect(markEffects(q, right).right).toBe(true);
        const oneWrong = [right[0], q.options.find((o) => !o.right)!.id];
        const marked = markEffects(q, oneWrong);
        expect(marked.right).toBe(false);
        expect(marked.why[0]).toContain(q.options.find((o) => !o.right)!.text);
        for (const o of q.options.filter((x) => !x.right)) expect(o.why, o.text).toBeTruthy();
      }
    }
  });

  it('marks a figure, and names a likely wrong one', () => {
    for (let seed = 1; seed <= 40; seed++) {
      for (const q of tryRound(MEERA, seed).filter((x): x is FigureQuestion => x.kind === 'figure')) {
        const shown = finalAccounts(MEERA, q.after);
        expect(q.answer).toBe(q.level === 'gross' ? shown.gross : shown.net);
        expect(markFigure(q, q.answer).right).toBe(true);
        for (const m of q.mistakes) {
          expect(m.value).not.toBe(q.answer);
          const marked = markFigure(q, m.value);
          expect(marked.right).toBe(false);
          expect(marked.why).toContain(m.why);
        }
        // While it is asked, the figure is not on the picture.
        const asked = finalAccounts(MEERA, q.before);
        expect(q.level === 'gross' ? asked.gross : asked.net).toBeNull();
      }
    }
  });

  it('asks about the gross profit after a new closing stock', () => {
    const q = tryRound(MEERA, 3).find((x): x is FigureQuestion => x.kind === 'figure' && x.id.startsWith('gross-stock'))!;
    const cs = q.after.adjustments[0];
    expect(cs.type).toBe('closingStock');
    // Gross profit moves with the closing stock, rupee for rupee.
    expect(q.answer - rupees(100000)).toBe((cs.type === 'closingStock' ? cs.amount : 0) - rupees(50000));
  });

  it('works on new businesses too', () => {
    for (let seed = 1; seed <= 30; seed++) {
      const b = newBusiness(seed);
      const r = tryRound(b, seed);
      expect(r).toHaveLength(6);
      for (const q of r) {
        if (q.kind !== 'where') continue;
        expect(partsOf(finalAccounts(b, q.after)).size).toBeGreaterThan(partsOf(finalAccounts(b, q.before)).size);
      }
    }
  });

  it('reads an amount as a student types it', () => {
    expect(parseRupees('1,03,000')).toBe(rupees(103000));
    expect(parseRupees('₹ 52000')).toBe(rupees(52000));
    expect(parseRupees('-5,000')).toBe(rupees(-5000));
    expect(parseRupees('−5000')).toBe(rupees(-5000));
    expect(parseRupees('(5,000)')).toBe(rupees(-5000));
    expect(parseRupees('5,000.50')).toBeNull();
    expect(parseRupees('')).toBeNull();
  });
});
