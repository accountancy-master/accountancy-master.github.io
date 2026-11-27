import { describe, expect, it } from 'vitest';
import { TEMPLATES, generateQuestion } from '@/generators';
import { JOURNAL_ENTRIES } from './journalEntries';

describe('journal entries MCQs', () => {
  // The ten of the first block; the questions on vouchers, added later, are checked below.
  const mcqs = JOURNAL_ENTRIES.questions.slice(0, 35).flatMap((q) => (q.type === 'mcq' ? [q] : []));

  it('has all ten MCQs', () => {
    expect(mcqs).toHaveLength(10);
  });
  it('uses each of a, b, c and d as the correct key at least twice', () => {
    for (const key of ['a', 'b', 'c', 'd']) {
      expect(mcqs.filter((q) => q.correct === key).length).toBeGreaterThanOrEqual(2);
    }
  });
  it('keeps je-q-001 answer as "Two"', () => {
    const q = mcqs.find((m) => m.id === 'je-q-001');
    expect(q?.correct).toBe('b');
    expect(q?.options.find((o) => o.id === q.correct)?.text).toBe('Two');
  });
  it('keeps Drawings as the correct answer of je-q-006 and offers no Capital option', () => {
    const q = mcqs.find((m) => m.id === 'je-q-006');
    expect(q?.options.find((o) => o.id === q.correct)?.text).toBe('Drawings');
    expect(q?.options.map((o) => o.text)).not.toContain('Capital');
  });
});

describe('journal entries pack: original content is kept, new content is added', () => {
  const ORIGINAL_TEMPLATES = [
    'je-capital', 'je-drawings', 'je-cash-purchase', 'je-cash-sale', 'je-asset-purchase', 'je-expense-paid', 'je-income-received',
    'je-credit-purchase', 'je-credit-sale', 'je-payment-discount', 'je-receipt-discount', 'je-bank-contra', 'je-returns',
    'je-gst-purchase', 'je-gst-sale', 'je-trade-discount',
  ];
  const templates = TEMPLATES.filter((t) => t.topicId === 'journal-entries');
  const cardIds = (n: number) => Array.from({ length: n }, (_, i) => `je-card-${i + 1}`);

  it('keeps the 16 original generators in front, at version 1 but je-trade-discount (version 2: its working shown step by step)', () => {
    expect(templates.slice(0, 16).map((t) => t.id)).toEqual(ORIGINAL_TEMPLATES);
    expect(templates.slice(0, 16).filter((t) => t.version !== 1).map((t) => [t.id, t.version])).toEqual([['je-trade-discount', 2]]);
  });
  it('adds at least 30 generators with unique ids and the je- prefix', () => {
    const added = templates.slice(16);
    expect(added.length).toBeGreaterThanOrEqual(30);
    expect(new Set(templates.map((t) => t.id)).size).toBe(templates.length);
    expect(added.every((t) => t.id.startsWith('je-'))).toBe(true);
  });
  it('gives the rules of debit and credit choice and typed-amount generators', () => {
    const rules = templates.filter((t) => t.conceptId === 'je-rules');
    expect(rules.filter((t) => t.kind === 'mcq').length).toBeGreaterThanOrEqual(8);
    expect(rules.filter((t) => t.kind === 'numeric').length).toBeGreaterThanOrEqual(5);
  });
  it('keeps level 1 as exactly the 11 original cards, and adds more cards after them', () => {
    const level1 = JOURNAL_ENTRIES.levels.find((l) => l.order === 1);
    expect(level1?.cardIds).toEqual(cardIds(11));
    expect(JOURNAL_ENTRIES.cards.length).toBeGreaterThanOrEqual(21);
    expect(JOURNAL_ENTRIES.cards.slice(0, 11).map((c) => c.id)).toEqual(cardIds(11));
  });
  it('keeps levels 0 to 11 and appends the new ones with later orders', () => {
    const orders = JOURNAL_ENTRIES.levels.map((l) => l.order);
    expect(orders.slice(0, 12)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]);
    expect(orders.slice(12)).toEqual(Array.from({ length: orders.length - 12 }, (_, i) => 12 + i));
    expect(orders.length - 12).toBeGreaterThanOrEqual(8);
    // The levels of sets stand after the numbered ones and have ids of their own; every level before them keeps the id
    // of its position. The levels on vouchers, added after the syllabus check, and Assertion and Reason stand last, with
    // ids of their own too.
    // The levels added in the quality pass (GST set-off; discounts on one deal and assets with GST) stand before it.
    const later = ['journal-entries-vouchers', 'journal-entries-vouchers-practice', 'journal-entries-gst-set-off', 'journal-entries-discounts-and-gst-assets', 'journal-entries-assertion-reason'];
    expect(JOURNAL_ENTRIES.levels.slice(-later.length).map((l) => l.id)).toEqual(later);
    const numbered = JOURNAL_ENTRIES.levels.filter((l) => l.type !== 'set_practice' && !later.includes(l.id));
    expect(numbered.map((l) => l.id)).toEqual(numbered.map((l) => `journal-entries-level-${l.order}`));
    expect(numbered).toHaveLength(23);
    const sets = JOURNAL_ENTRIES.levels.slice(numbered.length, -later.length);
    expect(sets.length).toBeGreaterThanOrEqual(1);
    expect(sets.map((l) => l.id)).toEqual(sets.map((_, i) => `journal-entries-journal-sets-${i + 1}`));
    expect(sets.every((l) => l.type === 'set_practice')).toBe(true);
  });
  it('keeps the original ten authored questions and adds at least twenty, none of them multiple choice', () => {
    const ids = JOURNAL_ENTRIES.questions.map((q) => q.id);
    expect(ids.slice(0, 10)).toEqual(Array.from({ length: 10 }, (_, i) => `je-q-${String(i + 1).padStart(3, '0')}`));
    expect(JOURNAL_ENTRIES.questions.length - 10).toBeGreaterThanOrEqual(20);
    expect(JOURNAL_ENTRIES.questions.slice(10, 35).every((q) => q.type !== 'mcq')).toBe(true);
    // The questions on vouchers and on goods given to the staff, added after the syllabus check, follow them.
    expect(JOURNAL_ENTRIES.questions.slice(35).map((q) => q.id)).toEqual(Array.from({ length: 14 }, (_, i) => `je-q-${String(i + 36).padStart(3, '0')}`));
  });
  it('uses every new generator in some level, but those beyond the syllabus, which are on none', () => {
    const used = new Set(JOURNAL_ENTRIES.levels.flatMap((l) => l.generate?.templateIds ?? []));
    const unused = templates.slice(16).filter((t) => !used.has(t.id)).map((t) => t.id);
    expect(unused).toEqual(templates.slice(16).filter((t) => t.beyondSyllabus !== undefined).map((t) => t.id));
    expect(unused).toEqual(['je-interest-drawings', 'je-interest-drawings-amount']);
  });
  it('asks every new authored question in some level, so that it can be served, but those beyond the syllabus', () => {
    const asked = new Set(JOURNAL_ENTRIES.levels.flatMap((l) => l.questionIds ?? []));
    const unasked = JOURNAL_ENTRIES.questions.slice(10).filter((q) => !asked.has(q.id)).map((q) => q.id);
    expect(unasked).toEqual(['je-q-017', 'je-q-035']);
    expect(JOURNAL_ENTRIES.questions.filter((q) => q.beyondSyllabus !== undefined).map((q) => q.id)).toEqual(unasked);
  });
});

describe('journal entries: amounts that depend on the months of the year', () => {
  const amounts = (text: string) => Array.from(text.matchAll(/₹(\d[\d,]*)/g), (m) => Number(m[1].replace(/,/g, '')) * 100);
  const numeric = (id: string, seed: number) => {
    const q = generateQuestion(id, seed);
    if (q.type !== 'numeric') throw new Error(`${id} is not numeric`);
    return q;
  };
  // A year ending 31 March: months from the first of the named month to the year end, counted by hand.
  const TO_YEAR_END: Record<string, number> = { July: 9, October: 6, December: 4, January: 3 };

  it('prepaid insurance is the part of a 12-month cover that runs after 31 March', () => {
    for (let seed = 0; seed < 200; seed++) {
      const q = numeric('je-prepaid-amount', seed);
      const month = /On 1 (\w+)/.exec(q.prompt)![1];
      expect(q.answer).toBe((amounts(q.prompt)[0] / 12) * (12 - TO_YEAR_END[month]));
    }
  });
  it('interest on drawings is charged on one dated withdrawal for the months it is out, with no average period', () => {
    for (let seed = 0; seed < 200; seed++) {
      const q = numeric('je-interest-drawings-amount', seed);
      const month = /On 1 (\w+)/.exec(q.prompt)![1];
      const rate = Number(/(\d+)% a year/.exec(q.prompt)![1]);
      expect(q.prompt).not.toMatch(/every month|average/i);
      expect(q.working.join(' ')).not.toMatch(/average|6\.5/i);
      expect(q.answer).toBe((amounts(q.prompt)[0] * rate * TO_YEAR_END[month]) / 1200);
    }
  });
  it('first-year depreciation is charged for the months from the purchase to 31 March', () => {
    for (let seed = 0; seed < 200; seed++) {
      const q = numeric('je-depreciation-amount', seed);
      const month = /bought on 1 (\w+)/.exec(q.prompt)![1];
      const rate = Number(/(\d+)% a year/.exec(q.prompt)![1]);
      expect(q.answer).toBe((amounts(q.prompt)[0] * rate * TO_YEAR_END[month]) / 1200);
    }
  });
  it('interest on capital is a full year on the opening capital and the months left on capital brought in later', () => {
    for (let seed = 0; seed < 200; seed++) {
      const q = numeric('je-interest-capital-months', seed);
      const month = /On 1 (\w+)/.exec(q.prompt)![1];
      const rate = Number(/(\d+)% a year/.exec(q.prompt)![1]);
      const [opening, extra] = amounts(q.prompt);
      expect(q.answer).toBe((opening * rate) / 100 + (extra * rate * TO_YEAR_END[month]) / 1200);
    }
  });
});

describe('journal entries: goods lost by fire or theft', () => {
  it('credits Purchases with the whole cost and offers Stock and the loss accounts as choices', () => {
    for (const id of ['je-loss-fire', 'je-loss-theft', 'je-loss-claim-full', 'je-loss-claim-partial']) {
      for (let seed = 0; seed < 100; seed++) {
        const q = generateQuestion(id, seed);
        if (q.type !== 'journal_entry') throw new Error(`${id} is not a journal entry`);
        if (!q.prompt.startsWith('Goods costing')) continue; // cash stolen from the cash box
        const cost = Number(/₹([\d,]+)/.exec(q.prompt)![1].replace(/,/g, '')) * 100;
        expect(q.expected.filter((l) => l.side === 'Cr')).toEqual([{ accountId: 'purchases', side: 'Cr', amount: cost }]);
        expect(q.prompt).toContain('bought during the year');
        expect(q.accountChoices).toEqual(expect.arrayContaining(['stock', 'purchases']));
      }
    }
  });
});
