import { describe, expect, it } from 'vitest';
import { amount, formatINR, interleave, journalSetTemplate, journalTemplate, mcqTemplate, numericTemplate, setHolds, storyHolds } from './authoring';
import { createRng } from '@/engine/rng';
import { DEFAULT_SET_HINTS, SET_TASK, attemptRng, buildInstance, generateFrom } from './engine';
import type { JournalSetParts, McqParts, NumericParts, SetTransaction } from './types';

const base = { topicId: 'accounting-equation', conceptId: 'ae-equation', difficulty: 'easy' } as const;

const goodMcq = (): McqParts => ({
  prompt: 'Which one is right?',
  correct: 'The right one',
  distractors: [
    { text: 'Wrong A', why: 'Mistake A' },
    { text: 'Wrong B', why: 'Mistake B' },
    { text: 'Wrong C', why: 'Mistake C' },
    { text: 'Wrong D', why: 'Mistake D' },
  ],
  explanation: 'Because.',
});

const goodNumeric = (): NumericParts => ({
  prompt: 'What is the amount?',
  answer: 12500,
  commonErrors: [
    { value: 1250, why: 'Slipped a decimal place.' },
    { value: 125000, why: 'Slipped a decimal place the other way.' },
  ],
  explanation: ['Step one.', 'Step two.'],
});

const mcq = (parts: (seed: number) => McqParts | null, extra: object = {}) => {
  let n = 0;
  return mcqTemplate({ id: 'test-mcq', ...base, generate: (rng) => (void rng, parts(n++)), ...extra });
};

describe('journalTemplate, mcqTemplate and numericTemplate', () => {
  it('default the version to 1 and set the kind', () => {
    expect(mcq(goodMcq).version).toBe(1);
    expect(mcq(goodMcq).kind).toBe('mcq');
    expect(mcqTemplate({ id: 'x', ...base, version: 3, generate: goodMcq }).version).toBe(3);
    expect(journalTemplate({ id: 'j', ...base, generate: () => null }).kind).toBe('journal');
    expect(numericTemplate({ id: 'n', ...base, unit: 'number', generate: () => null }).kind).toBe('numeric');
  });
});

describe('mcq instances', () => {
  const t = mcqTemplate({ id: 'test-mcq', ...base, generate: goodMcq });

  it('have four options, the right one marked, and a why on every wrong one', () => {
    const q = generateFrom(t, 7);
    if (q.type !== 'mcq') throw new Error('expected mcq');
    expect(q.options).toHaveLength(4);
    expect(q.options.map((o) => o.id)).toEqual(['a', 'b', 'c', 'd']);
    const right = q.options.find((o) => o.id === q.correct)!;
    expect(right.text).toBe('The right one');
    expect(right.why).toBeUndefined();
    for (const o of q.options.filter((x) => x !== right)) expect(o.why).toMatch(/^Mistake /);
    expect(q.hints.length).toBeGreaterThanOrEqual(2);
  });

  it('shuffle the same way for the same seed, and differently across seeds', () => {
    const order = (seed: number) => {
      const q = generateFrom(t, seed);
      return q.type === 'mcq' ? q.options.map((o) => o.text).join('|') : '';
    };
    expect(order(5)).toBe(order(5));
    expect(new Set(Array.from({ length: 30 }, (_, s) => order(s))).size).toBeGreaterThan(5);
  });

  it('drop distractors that repeat the answer or each other, and reject the seed when too few are left', () => {
    const dup = mcq(() => ({ ...goodMcq(), distractors: [{ text: 'The right one', why: 'x' }, { text: 'B', why: 'y' }, { text: 'B', why: 'z' }, { text: 'C', why: 'w' }] }));
    expect(buildInstance(dup, 1)).toEqual({ invalid: 'only 2 distinct distractors' });
  });

  it('throw, naming the template and seed, for a distractor with no why or a blank prompt', () => {
    const noWhy = mcq(() => ({ ...goodMcq(), distractors: [{ text: 'A', why: ' ' }, { text: 'B', why: 'b' }, { text: 'C', why: 'c' }] }));
    expect(() => buildInstance(noWhy, 4)).toThrow(/test-mcq seed 4: the "why" of distractor "A" is empty/);
    const noPrompt = mcq(() => ({ ...goodMcq(), prompt: '' }));
    expect(() => buildInstance(noPrompt, 9)).toThrow('test-mcq seed 9: the prompt is empty');
  });
});

describe('numeric instances', () => {
  it('carry the unit, the answer, the common errors and the working', () => {
    const t = numericTemplate({ id: 'test-num', ...base, unit: 'rupees', generate: goodNumeric });
    const q = generateFrom(t, 3);
    if (q.type !== 'numeric') throw new Error('expected numeric');
    expect(q).toMatchObject({ unit: 'rupees', answer: 12500, working: ['Step one.', 'Step two.'], explanation: 'Step one. Step two.' });
    expect(q.commonErrors).toHaveLength(2);
  });

  it('drop common errors equal to the answer or to each other, and need at least two to remain', () => {
    const t = numericTemplate({
      id: 'test-num', ...base, unit: 'number',
      generate: () => ({ ...goodNumeric(), commonErrors: [{ value: 12500, why: 'a' }, { value: 5, why: 'b' }, { value: 5, why: 'c' }] }),
    });
    expect(buildInstance(t, 1)).toEqual({ invalid: 'only 1 usable common errors' });
  });

  it('refuse an answer that is not a positive integer', () => {
    for (const answer of [0, -5, 12.5, NaN]) {
      const t = numericTemplate({ id: 'test-num', ...base, unit: 'number', generate: () => ({ ...goodNumeric(), answer }) });
      expect(buildInstance(t, 1), String(answer)).toEqual({ invalid: `answer ${answer} is not a positive integer` });
    }
  });
});

describe('rejection, verification and retrying inside a seed', () => {
  it('retries a rejected seed with another stream of the same seed, and the id keeps the seed', () => {
    const t = numericTemplate({
      id: 'test-num', ...base, unit: 'number',
      generate: (rng) => {
        const n = rng.int(1, 1000);
        return n % 2 === 0 ? null : { ...goodNumeric(), answer: n + 1 };
      },
    });
    let retried = 0;
    for (let seed = 0; seed < 40; seed++) {
      const q = generateFrom(t, seed);
      expect(q.id).toBe(`gen:test-num:1:${seed}`);
      if ('rejected' in buildInstance(t, seed)) retried++;
      // The id regenerates exactly the question it came with.
      expect(generateFrom(t, seed)).toEqual(q);
    }
    expect(retried).toBeGreaterThan(0);
  });

  it('uses the stream of createRng(seed) for attempt 0 and a stream of its own for each later attempt', () => {
    expect(attemptRng(42, 0).next()).toBe(createRng(42).next());
    expect(attemptRng(42, 1).next()).not.toBe(attemptRng(42, 0).next());
    expect(attemptRng(42, 1).next()).toBe(attemptRng(42, 1).next());
    expect(attemptRng(42, 1).next()).not.toBe(attemptRng(42, 2).next());
  });

  it('refuses an instance that fails verify, and retries it', () => {
    const t = numericTemplate({
      id: 'test-num', ...base, unit: 'number',
      generate: (rng) => ({ ...goodNumeric(), answer: rng.int(1, 100) }),
      verify: (q) => q.answer % 2 === 0,
    });
    for (let seed = 0; seed < 20; seed++) {
      const built = buildInstance(t, seed);
      if ('question' in built) expect(built.question.type === 'numeric' && built.question.unit !== 'ratio' && built.question.answer % 2).toBe(0);
      else expect(built).toEqual({ invalid: 'independent verification failed' });
      const q = generateFrom(t, seed);
      expect(q.id).toBe(`gen:test-num:1:${seed}`);
      expect(q.type === 'numeric' && q.unit !== 'ratio' && q.answer % 2).toBe(0);
    }
  });

  it('refuses text with undefined or NaN in it', () => {
    const t = mcq(() => ({ ...goodMcq(), prompt: `The amount is ${NaN}` }));
    expect(buildInstance(t, 1)).toEqual({ invalid: 'the question text contains undefined, NaN or null' });
  });

  it('fails for the seed, naming the template, when every attempt does', () => {
    const t = mcq(() => null);
    expect(() => generateFrom(t, 10)).toThrow('Template test-mcq gave no valid question for seed 10 in 40 attempts');
  });

  it('a journal template that returns null is rejected too', () => {
    const t = journalTemplate({ id: 'test-je', ...base, generate: () => null });
    expect(buildInstance(t, 1)).toEqual({ rejected: true });
  });
});

describe('sets of journal entries', () => {
  const dr = (accountId: string, rupees: number) => ({ accountId, side: 'Dr' as const, amount: rupees * 100 });
  const cr = (accountId: string, rupees: number) => ({ accountId, side: 'Cr' as const, amount: rupees * 100 });
  type Dated = Extract<SetTransaction, { date: string }>;
  type Labelled = Extract<SetTransaction, { label: string }>;
  const tx = (date: string, text: string, lines: SetTransaction['lines']): Dated => ({ date, text, lines, explanation: [`Why ${text}`, 'And so on.'] });
  const good = (): Omit<JournalSetParts, 'transactions'> & { transactions: Dated[] } => ({
    opening: 'Asha opened a bookshop in Pune in April.',
    transactions: [
      tx('1 April', 'Started with cash of ₹2,00,000.', [dr('cash', 200000), cr('capital', 200000)]),
      tx('3 April', 'Bought books for ₹40,000 from Kiran on credit.', [dr('purchases', 40000), cr('creditor:Kiran', 40000)]),
      tx('3 April', 'Paid rent of ₹6,000.', [dr('rent', 6000), cr('cash', 6000)]),
      tx('9 April', 'Paid Kiran ₹39,200 in full settlement.', [dr('creditor:Kiran', 40000), cr('cash', 39200), cr('discountReceived', 800)]),
    ],
  });
  const set = (parts: () => JournalSetParts | null, extra: object = {}) =>
    journalSetTemplate({ id: 'test-set', topicId: 'journal-entries', conceptId: 'je-sets', difficulty: 'easy', generate: () => parts(), ...extra });
  const built = (change: (parts: ReturnType<typeof good>) => void) =>
    buildInstance(
      set(() => {
        const parts = good();
        change(parts);
        return parts;
      }),
      1,
    );

  it('defaults the version to 1 and sets the kind', () => {
    expect(set(good)).toMatchObject({ kind: 'journal_set', version: 1, id: 'test-set' });
  });

  it('become one question: the task and the opening line, then every transaction with its entry and its steps', () => {
    const q = generateFrom(set(good), 5);
    if (q.type !== 'journal_set') throw new Error('not a set');
    expect(q.id).toBe('gen:test-set:1:5');
    expect(q.prompt).toBe(`${SET_TASK}\nAsha opened a bookshop in Pune in April.`);
    expect(q.hints).toEqual(DEFAULT_SET_HINTS);
    expect(q.entries).toEqual(good().transactions.map((t) => ({ date: t.date, text: t.text, expected: t.lines, explanation: t.explanation })));
    // The explanation is every entry's steps, a line for each transaction.
    expect(q.explanation.split('\n')).toHaveLength(4);
    expect(q.explanation).toContain('1 April: Why Started with cash of ₹2,00,000. And so on.');
    expect(generateFrom(set(good), 5)).toEqual(q);
  });

  it('say what is to be done in a task of their own, in place of the usual first line', () => {
    const q = generateFrom(set(() => ({ ...good(), task: 'Pass the rectifying entries.' })), 5);
    expect(q.prompt).toBe('Pass the rectifying entries.\nAsha opened a bookshop in Pune in April.');
    // Nothing else changes: the same set without a task differs in its first line alone.
    const usual = generateFrom(set(good), 5);
    expect(usual.prompt.split('\n')[0]).toBe(SET_TASK);
    expect({ ...q, prompt: usual.prompt }).toEqual(usual);
    expect(() => buildInstance(set(() => ({ ...good(), task: ' ' })), 1)).toThrow('test-set seed 1: the task is empty');
  });

  it('may label an item instead of dating it: labels need no order, and stand where the date would', () => {
    const [capital, purchase, rent] = good().transactions;
    const { explanation } = purchase;
    const labelled = (): Omit<JournalSetParts, 'transactions'> & { transactions: Labelled[] } => ({
      opening: 'These errors were found in the books of Asha on 31 March.',
      transactions: [
        { label: 'Error 2', text: purchase.text, lines: purchase.lines, explanation },
        { label: 'Error 1', text: rent.text, lines: rent.lines, explanation },
        { label: 'Error 1', text: capital.text, lines: capital.lines, explanation },
      ],
    });
    const q = generateFrom(set(labelled), 5);
    if (q.type !== 'journal_set') throw new Error('not a set');
    // In the order written, whatever the labels say, and with no date.
    expect(q.entries.map((e) => e.label)).toEqual(['Error 2', 'Error 1', 'Error 1']);
    expect(q.entries.every((e) => !('date' in e))).toBe(true);
    expect(q.explanation.split('\n')[0]).toBe(`Error 2: ${explanation.join(' ')}`);
    // A dated transaction has no label, as before.
    const dated = generateFrom(set(good), 5);
    if (dated.type !== 'journal_set') throw new Error('not a set');
    expect(dated.entries.every((e) => !('label' in e) && typeof e.date === 'string')).toBe(true);

    // Dated and labelled items may stand in one set: only the dates are kept in order among themselves.
    const mixed = (first: string, last: string) =>
      buildInstance(set(() => ({ ...good(), transactions: [{ ...capital, date: first }, { label: 'Note', text: purchase.text, lines: purchase.lines, explanation }, { ...rent, date: last }] })), 1);
    expect('question' in mixed('1 April', '3 April')).toBe(true);
    expect('question' in mixed('3 April', '3 April')).toBe(true);
    expect(mixed('3 April', '1 April')).toEqual({ invalid: 'transaction 3: 1 April comes before the transaction above it' });
    // A label is free text: it is never read as a date.
    const backwards = labelled().transactions.map((t, i) => ({ ...t, label: `${3 - i} April` }));
    expect('question' in buildInstance(set(() => ({ ...labelled(), transactions: backwards })), 1)).toBe(true);

    // The same text twice is still refused, and so are an empty label and an item with both.
    const repeated = labelled().transactions.map((t) => ({ ...t, text: purchase.text }));
    expect(buildInstance(set(() => ({ ...labelled(), transactions: repeated })), 1)).toEqual({ invalid: 'transaction 2 repeats the text of another transaction' });
    const unnamed = labelled().transactions.map((t) => ({ ...t, label: '' }));
    expect(() => buildInstance(set(() => ({ ...labelled(), transactions: unnamed })), 1)).toThrow('test-set seed 1: the label of transaction 1 is empty');
    const both = { ...capital, label: 'Error 1' } as unknown as SetTransaction;
    expect(() => buildInstance(set(() => ({ ...good(), transactions: [both, purchase, rent] })), 1)).toThrow(
      'test-set seed 1: transaction 1 has a date and a label; give one of them',
    );
  });

  it('share one list of account choices: the accounts of every entry, the distractors, cash and bank, and others', () => {
    const plain = generateFrom(set(() => ({ ...good(), transactions: good().transactions.slice(1, 4).map((t) => ({ ...t, lines: t.lines.map((l) => (l.accountId === 'cash' ? { ...l, accountId: 'pettyCash' } : l)) })) })), 3);
    const withDistractors = generateFrom(set(() => ({ ...good(), distractorAccounts: ['discountAllowed', 'sales', 'cash'] })), 3);
    if (plain.type !== 'journal_set' || withDistractors.type !== 'journal_set') throw new Error('not a set');
    for (const q of [plain, withDistractors]) {
      expect(q.accountChoices).toEqual([...q.accountChoices].sort());
      expect(new Set(q.accountChoices).size).toBe(q.accountChoices.length);
      for (const e of q.entries) for (const l of e.expected) expect(q.accountChoices).toContain(l.accountId);
      expect(q.accountChoices).toEqual(expect.arrayContaining(['cash', 'bank']));
    }
    expect(withDistractors.accountChoices).toEqual(expect.arrayContaining(['discountAllowed', 'sales']));
    // Six choices beyond the entries' own: the author's, cash and bank where they are not used already, then others.
    const own = (q: typeof plain) => new Set(q.entries.flatMap((e) => e.expected.map((l) => l.accountId))).size;
    expect(plain.accountChoices).toHaveLength(own(plain) + 6);
    expect(withDistractors.accountChoices).toHaveLength(own(withDistractors) + 6);
    // The same seed gives the same choices; another seed gives others.
    expect(generateFrom(set(good), 3)).toEqual(generateFrom(set(good), 3));
    const lists = new Set([1, 2, 3, 4, 5, 6].map((seed) => JSON.stringify((generateFrom(set(good), seed) as typeof plain).accountChoices)));
    expect(lists.size).toBeGreaterThan(1);
  });

  it('are refused with fewer than three transactions or more than eight', () => {
    expect(built((p) => p.transactions.splice(2))).toEqual({ invalid: '2 transactions, not 3 to 8' });
    const nine = built((p) => {
      for (let i = 0; i < 5; i++) p.transactions.push(tx(`${10 + i} April`, `Sold books for ₹${i + 1},000.`, [dr('cash', 1000 * (i + 1)), cr('sales', 1000 * (i + 1))]));
    });
    expect(nine).toEqual({ invalid: '9 transactions, not 3 to 8' });
    const eight = built((p) => {
      for (let i = 0; i < 4; i++) p.transactions.push(tx(`${10 + i} April`, `Sold books for ₹${i + 1},000.`, [dr('cash', 1000 * (i + 1)), cr('sales', 1000 * (i + 1))]));
    });
    expect('question' in eight).toBe(true);
  });

  it('are refused when an entry would be refused on its own: unbalanced, an unknown account, an amount that is not a positive integer', () => {
    expect(built((p) => (p.transactions[1].lines[1] = cr('creditor:Kiran', 39000)))).toEqual({ invalid: 'transaction 2: the lines do not balance' });
    expect(built((p) => (p.transactions[2].lines[0] = dr('rental', 6000)))).toEqual({ invalid: 'transaction 3: unknown account rental' });
    expect(built((p) => (p.transactions[2].lines = [dr('rent', 0.004), cr('cash', 0.004)]))).toEqual({
      invalid: 'transaction 3: line for rent has amount 0.4, not a positive integer',
    });
    expect(built((p) => (p.distractorAccounts = ['nowhere']))).toEqual({ invalid: 'transaction 1: unknown account nowhere' });
  });

  it('are refused when the journal would not read as one: dates out of order or not dates, a transaction told twice, a name on both sides', () => {
    expect(built((p) => (p.transactions[3].date = '2 April'))).toEqual({ invalid: 'transaction 4: 2 April comes before the transaction above it' });
    expect(built((p) => (p.transactions[1].date = 'April 3'))).toEqual({ invalid: 'transaction 2: "April 3" is not a date like "5 April"' });
    expect(built((p) => (p.transactions[2].text = p.transactions[1].text))).toEqual({ invalid: 'transaction 3 repeats the text of another transaction' });
    expect(built((p) => p.transactions.push(tx('12 April', 'Sold books for ₹5,000 to Kiran on credit.', [dr('debtor:Kiran', 5000), cr('sales', 5000)])))).toEqual({
      invalid: 'Kiran is the name of two accounts of the set',
    });
    // Two transactions on one day are in order.
    expect('question' in built(() => {})).toBe(true);
  });

  it('throw, naming the template and seed, for a text, a date or an explanation left out', () => {
    expect(() => built((p) => (p.transactions[1].text = ' '))).toThrow('test-set seed 1: the text of transaction 2 is empty');
    expect(() => built((p) => (p.transactions[0].date = ''))).toThrow('test-set seed 1: the date of transaction 1 is empty');
    expect(() => built((p) => (p.transactions[2].explanation = []))).toThrow('test-set seed 1: transaction 3 needs an explanation, one step per line');
    expect(() => built((p) => (p.opening = ''))).toThrow('test-set seed 1: the prompt is empty');
  });

  it('are retried when rejected, and never served when they fail verify', () => {
    let calls = 0;
    const q = generateFrom(set(() => (calls++ < 2 ? null : good())), 9);
    expect(q.id).toBe('gen:test-set:1:9');
    expect(buildInstance(set(good, { verify: () => false }), 1)).toEqual({ invalid: 'independent verification failed' });
    expect('question' in buildInstance(set(good, { verify: setHolds({ cash: 0, bank: 0 }) }), 1)).toBe(true);
  });

  it('have a story that can be checked: nobody paid more than is owed, cash and bank never short', () => {
    const entries = good().transactions;
    expect(storyHolds(entries)).toBe(true);
    expect(storyHolds(entries, { cash: 0, bank: 0 })).toBe(true);
    // The payment before the purchase: Kiran is paid while nothing is owed.
    expect(storyHolds([entries[0], entries[3], entries[1]])).toBe(false);
    // Rent before any cash has come in: fine for a business already running, not for one that starts in the set.
    expect(storyHolds([entries[2], entries[0]])).toBe(true);
    expect(storyHolds([entries[2], entries[0]], { cash: 0, bank: 0 })).toBe(false);
    expect(storyHolds([entries[2], entries[0]], { cash: 600000, bank: 0 })).toBe(true);
    // A customer who is credited with more than was sold.
    const sale = tx('2 April', 'Sold on credit.', [dr('debtor:Mohan', 5000), cr('sales', 5000)]);
    const back = tx('4 April', 'Returned.', [dr('salesReturn', 6000), cr('debtor:Mohan', 6000)]);
    expect(storyHolds([sale, back])).toBe(false);
  });

  it('can be merged from threads that keep their own order', () => {
    const orders = new Set<string>();
    for (let seed = 1; seed <= 200; seed++) {
      const merged = interleave(createRng(seed), [['a1', 'a2', 'a3'], ['b1', 'b2'], [], ['c1']]);
      expect([...merged].sort()).toEqual(['a1', 'a2', 'a3', 'b1', 'b2', 'c1']);
      expect(merged.filter((x) => x.startsWith('a'))).toEqual(['a1', 'a2', 'a3']);
      expect(merged.filter((x) => x.startsWith('b'))).toEqual(['b1', 'b2']);
      orders.add(merged.join(' '));
    }
    // 6! / (3! 2! 1!) = 60 orders are possible; most of them turn up.
    expect(orders.size).toBeGreaterThan(40);
  });
});

describe('authoring helpers', () => {
  it('amount picks a round rupee amount in paise', () => {
    const rng = { step: (min: number, _max: number, step: number) => min + step * 2 } as Parameters<typeof amount>[0];
    expect(amount(rng, 5000, 80000, 1000)).toBe(700000);
    expect(formatINR(700000)).toBe('₹7,000');
  });
});
