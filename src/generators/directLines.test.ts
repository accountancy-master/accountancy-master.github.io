import { describe, expect, it } from 'vitest';
import { CORE_ACCOUNTS } from '@/engine/accounts';
import type { JournalLine } from '@/engine/journal';
import { journalTemplate } from './authoring';
import { buildInstance } from './engine';
// The whole registry (every template and every stage of case studies) is imported with the file, not inside a test:
// imported there, its loading counted against the five seconds of that test, which a full run (every worker
// transforming modules at once) could exceed although the test passed alone.
import { generateQuestion } from './index';
import type { JournalParts } from './types';

const base = { topicId: 'rectification-of-errors', conceptId: 'x', difficulty: 'easy' } as const;

const lines = (a = 50000): JournalLine[] => [
  { accountId: 'rent', side: 'Dr', amount: a },
  { accountId: 'suspense', side: 'Cr', amount: a },
];

const direct = (parts: Partial<JournalParts> & { lines: JournalLine[] }) =>
  journalTemplate({
    id: 'test-direct',
    ...base,
    generate: () => ({ prompt: 'Rectify the error of ₹500.', explanation: ['Step one.'], ...parts }) as JournalParts,
  });

function question(parts: Partial<JournalParts> & { lines: JournalLine[] }) {
  const built = buildInstance(direct(parts), 1);
  if (!('question' in built) || built.question.type !== 'journal_entry') throw new Error(`expected a journal question, got ${JSON.stringify(built)}`);
  return built.question;
}

describe('journal templates that state their entry directly', () => {
  it('use the lines and the explanation as written', () => {
    const q = question({ lines: lines() });
    expect(q.expected).toEqual(lines());
    expect(q.explanation).toBe('Step one.');
    expect(q.id).toBe('gen:test-direct:1:1');
  });

  it('offer the entry, the distractors given, cash and bank, and enough others for six extras', () => {
    const choices = question({ lines: lines(), distractorAccounts: ['wages', 'debtor:Mohan'] }).accountChoices;
    expect(choices).toEqual([...choices].sort());
    expect(new Set(choices).size).toBe(choices.length);
    expect(choices).toEqual(expect.arrayContaining(['rent', 'suspense', 'wages', 'debtor:Mohan', 'cash', 'bank']));
    expect(choices).toHaveLength(2 + 6);
  });

  it('always offer cash and bank, and offer cash once when the entry has it', () => {
    const entry: JournalLine[] = [
      { accountId: 'cash', side: 'Dr', amount: 100 },
      { accountId: 'capital', side: 'Cr', amount: 100 },
    ];
    const choices = question({ lines: entry }).accountChoices;
    expect(choices.filter((id) => id === 'cash')).toHaveLength(1);
    expect(choices).toContain('bank');
  });

  it('keep every distractor the author gives, even beyond six', () => {
    const many = ['wages', 'rent', 'sales', 'purchases', 'land', 'building', 'freight'];
    const entry: JournalLine[] = [
      { accountId: 'cash', side: 'Dr', amount: 100 },
      { accountId: 'capital', side: 'Cr', amount: 100 },
    ];
    const choices = question({ lines: entry, distractorAccounts: many }).accountChoices;
    expect(choices).toHaveLength(2 + many.length + 1);
  });

  it('are refused when the lines do not balance, name an unknown account or have a bad amount', () => {
    const unbalanced = lines();
    unbalanced[1] = { ...unbalanced[1], amount: 40000 };
    expect(buildInstance(direct({ lines: unbalanced }), 1)).toEqual({ invalid: 'the lines do not balance' });
    expect(buildInstance(direct({ lines: [] }), 1)).toEqual({ invalid: 'the lines do not balance' });
    const unknown: JournalLine[] = [
      { accountId: 'rent', side: 'Dr', amount: 5 },
      { accountId: 'nowhere', side: 'Cr', amount: 5 },
    ];
    expect(buildInstance(direct({ lines: unknown }), 1)).toEqual({ invalid: 'unknown account nowhere' });
    expect(buildInstance(direct({ lines: lines(), distractorAccounts: ['nowhere'] }), 1)).toEqual({ invalid: 'unknown account nowhere' });
    for (const amount of [0, -5, 1.5]) {
      const bad: JournalLine[] = [
        { accountId: 'rent', side: 'Dr', amount },
        { accountId: 'suspense', side: 'Cr', amount },
      ];
      expect('invalid' in buildInstance(direct({ lines: bad }), 1), String(amount)).toBe(true);
    }
  });

  it('throw, naming the template and seed, for lines without an explanation or given together with tx', () => {
    expect(() => buildInstance(direct({ lines: lines(), explanation: [] }), 3)).toThrow(/test-direct seed 3: lines need an explanation/);
    const both = direct({ lines: lines(), tx: { kind: 'cashDeposited', amount: 100 } } as unknown as Partial<JournalParts> & { lines: JournalLine[] });
    expect(() => buildInstance(both, 3)).toThrow(/test-direct seed 3: give either tx or lines/);
  });

  it('keep transaction templates on the original pool: only the first twenty-four accounts are ever offered', () => {
    const core = new Set(CORE_ACCOUNTS.map((a) => a.id));
    for (let seed = 1; seed <= 50; seed++) {
      const q = generateQuestion('je-bank-contra', seed);
      if (q.type !== 'journal_entry') throw new Error('expected journal');
      for (const id of q.accountChoices) expect(core.has(id) || id.includes(':'), `${id} seed ${seed}`).toBe(true);
    }
  });
});
