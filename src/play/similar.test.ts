import { describe, expect, it } from 'vitest';
// Every generator is registered first: a pack builds its ladder from its topic's templates as it is imported.
import '@/generators';
import { JOURNAL_ENTRIES } from '@/content/cbse11/journalEntries';
import { generateQuestion, isValidSeed, parseGenId } from '@/generators';
import type { SessionItem } from '@/learning/sessionBuilder';
import { similarTo } from './similar';

const item = (templateId: string, seed: number): SessionItem => ({
  kind: 'question',
  question: generateQuestion(templateId, seed),
});

describe('similarTo', () => {
  it('makes a question of the same template with a seed the session has not used', () => {
    const items = [item('je-capital', 400), item('je-drawings', 401), item('je-capital', 402)];
    const q = similarTo(items[0].kind === 'question' ? items[0].question : (undefined as never), items)!;
    const gen = parseGenId(q.id)!;
    expect(gen.templateId).toBe('je-capital');
    expect(isValidSeed(gen.seed)).toBe(true);
    expect([400, 401, 402]).not.toContain(gen.seed);
    expect(Math.floor(gen.seed / 100)).toBe(4);
  });
  it('keeps giving new ones as they are added to the session', () => {
    const items = [item('je-capital', 400)];
    const ids = new Set(items.map((i) => (i.kind === 'question' ? i.question.id : '')));
    for (let n = 0; n < 5; n++) {
      const first = items[0].kind === 'question' ? items[0].question : (undefined as never);
      const q = similarTo(first, items)!;
      expect(ids.has(q.id)).toBe(false);
      ids.add(q.id);
      items.push({ kind: 'question', question: q });
    }
  });
  it('has nothing similar for an authored question', () => {
    expect(similarTo(JOURNAL_ENTRIES.questions[0], [])).toBeNull();
  });
});
