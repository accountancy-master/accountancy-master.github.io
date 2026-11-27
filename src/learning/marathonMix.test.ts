import { describe, expect, it } from 'vitest';
import { getTopicPack } from '@/content/registry';
import { STAGES, findTemplateOutline } from '@/content/outline';
import type { Question, TopicPack } from '@/content/types';
import { parseCasePartId, parseGenId } from '@/generators';
import { isLongKind } from '@/generators/types';
import { CONFIG } from './config';
import { marathonPool, marathonSeed, type MarathonAnswer } from './marathon';
import {
  DEFAULT_MIX_KINDS,
  LEGACY_MIX_KINDS,
  MARATHON_MIX,
  accuracyBy,
  answerKindOf,
  casesOfTopics,
  mixBatch,
  mixHref,
  mixIsEmpty,
  mixSummaryLine,
  narrowByTopic,
  nextMixQuestions,
  recordScope,
  setupFromQuery,
  setupToQuery,
  withKinds,
  type MixInput,
  type MixPool,
} from './marathonMix';
import { availableForLearner, everythingIn } from './practice';

const SEED = marathonSeed(4);
const EVERY = CONFIG.marathon.caseEvery;
const packs = (...ids: string[]): TopicPack[] => ids.map((id) => getTopicPack(id)!);
const query = (s: string) => new URLSearchParams(s);

/** Everything the topics' levels list, as with "unlock all levels" on, and the cases of their stages. */
function poolOf(topicIds: string[], kinds = LEGACY_MIX_KINDS, withCases = true): MixPool {
  const list = packs(...topicIds);
  const pool = withKinds(marathonPool(list, availableForLearner(list, [], [], true)), kinds);
  return { ...pool, cases: withCases ? casesOfTopics(STAGES, topicIds) : [] };
}

const caseOf = (q: Pick<Question, 'id'>) => parseCasePartId(parseGenId(q.id)?.templateId ?? '')?.caseId;

/** Plays a run to `count` questions, answering every one right, and returns what was served. */
function play(pool: MixPool, count: number, difficulty: MixInput['difficulty'] = 'mixed'): Question[] {
  const served: Question[] = [];
  const answers: MarathonAnswer[] = [];
  while (served.length < count) {
    const batch = mixBatch({ pool, seed: SEED, difficulty, mastery: {}, served, answers });
    if (batch.length === 0) break;
    for (const q of batch) {
      served.push(q);
      answers.push({ conceptId: q.conceptId, correct: true });
    }
  }
  return served;
}

describe('the case studies of a run', () => {
  it('are those of every stage whose topic is among the chosen ones, and no others', () => {
    const tb = casesOfTopics(STAGES, ['trial-balance', 'ledger']);
    expect(tb.length).toBeGreaterThan(0);
    expect(tb.every((c) => c.topicId === 'trial-balance')).toBe(true);
    expect(casesOfTopics(STAGES, ['ledger', 'journal-entries'])).toEqual([]);
    const both = casesOfTopics(STAGES, ['trial-balance', 'depreciation']);
    expect(new Set(both.map((c) => c.topicId))).toEqual(new Set(['trial-balance', 'depreciation']));
    // Only the stages that are open, when it is asked which are.
    expect(casesOfTopics(STAGES, ['trial-balance', 'depreciation'], (s) => s.topicId === 'depreciation').every((c) => c.topicId === 'depreciation')).toBe(true);
  });
});

describe('what a marathon draws on', () => {
  it('is every pattern of its topics for a learner who has passed nothing, as in the Playground', () => {
    const list = packs('ledger', 'trial-balance');
    const pool = marathonPool(list, everythingIn(list));
    const ids = new Set(pool.templates.map((t) => t.id));
    for (const p of list) for (const l of p.levels) for (const id of l.generate?.templateIds ?? []) expect(ids.has(id), id).toBe(true);
    expect(pool.templates.length).toBeGreaterThan(0);
    // The ladder's own rule still opens nothing before a level is passed.
    expect(marathonPool(list, availableForLearner(list, [], [], false)).templates).toEqual([]);
  });
});

describe('the kinds of question a run mixes', () => {
  const all = poolOf(['final-accounts'], LEGACY_MIX_KINDS, false);

  it('quick questions alone: no set of entries and no format', () => {
    const quick = withKinds(all, ['quick']);
    expect(quick.templates.length).toBeGreaterThan(0);
    expect(quick.templates.some((t) => isLongKind(t.kind))).toBe(false);
    expect(quick.questions.some((q) => ['journal_set', 'account', 'statement'].includes(q.type))).toBe(false);
  });

  it('long questions alone: sets of entries and formats only', () => {
    const long = withKinds(all, ['long']);
    expect(long.templates.length).toBeGreaterThan(0);
    expect(long.templates.every((t) => isLongKind(t.kind))).toBe(true);
  });

  it('both: everything, as a run has always served', () => {
    expect(withKinds(all, ['quick', 'long']).templates).toEqual(all.templates);
    expect(withKinds(all, ['cases']).templates).toEqual([]);
  });
});

describe('a run over several topics, with case studies', () => {
  const pool = poolOf(['ledger', 'trial-balance'], DEFAULT_MIX_KINDS);
  const served = play(pool, 40);

  it('mixes the topics', () => {
    const topics = new Set(served.filter((q) => !caseOf(q)).map((q) => q.topicId));
    expect(topics).toEqual(new Set(['ledger', 'trial-balance']));
  });

  it(`asks a whole case, its questions in order, after every ${EVERY} other questions`, () => {
    let since = 0;
    for (let i = 0; i < served.length; i++) {
      const id = caseOf(served[i]);
      if (!id) {
        since++;
        expect(since, `position ${i}`).toBeLessThanOrEqual(EVERY);
        continue;
      }
      expect(since, `position ${i}`).toBe(EVERY);
      let parts = 0;
      while (i + parts < served.length && caseOf(served[i + parts]) === id) parts++;
      const whole = served.slice(i, i + parts);
      whole.forEach((q, k) => {
        expect(caseOf(q)).toBe(id);
        expect(parseCasePartId(parseGenId(q.id)!.templateId)!.index).toBe(k);
      });
      // Every question of the case was served (unless the run was cut short in it).
      if (i + parts < served.length) expect(parts).toBe(pool.cases.find((c) => c.id === id)!.parts.length);
      i += parts - 1;
      since = 0;
    }
    expect(served.some((q) => caseOf(q))).toBe(true);
  });

  it('serves quick questions only besides the cases, never the same id twice', () => {
    for (const q of served.filter((x) => !caseOf(x))) expect(['journal_set', 'account', 'statement']).not.toContain(q.type);
    expect(new Set(served.map((q) => q.id)).size).toBe(served.length);
  });

  it('is the same run for the same seed', () => {
    expect(play(pool, 40).map((q) => q.id)).toEqual(served.map((q) => q.id));
  });
});

describe('a run of case studies alone', () => {
  const pool = poolOf(['trial-balance', 'depreciation'], []);
  const served = play(pool, 60);

  it('is case after case, each a new seed, the cases taking turns', () => {
    expect(mixIsEmpty(pool, 'mixed')).toBe(false);
    expect(served.every((q) => caseOf(q))).toBe(true);
    const order: string[] = [];
    for (const q of served) if (parseCasePartId(parseGenId(q.id)!.templateId)!.index === 0) order.push(caseOf(q)!);
    for (let i = 1; i < order.length; i++) expect(order[i]).not.toBe(order[i - 1]);
    // Before any case comes twice, every case has come once.
    const first = order.slice(0, pool.cases.length);
    if (order.length >= pool.cases.length) expect(new Set(first).size).toBe(pool.cases.length);
  });

  it('has nothing to serve without cases or questions', () => {
    expect(mixIsEmpty({ templates: [], questions: [], cases: [] }, 'mixed')).toBe(true);
    expect(nextMixQuestions({ pool: { templates: [], questions: [], cases: [] }, seed: SEED, difficulty: 'mixed', mastery: {}, served: [], answers: [] })).toEqual([]);
  });

  it('keeps to one difficulty when one is chosen', () => {
    const easy = play(pool, 30, 'easy');
    const difficulties = new Set(easy.map((q) => q.difficulty));
    expect(difficulties.size).toBeLessThanOrEqual(1);
  });
});

describe('subtopics in a run over several topics', () => {
  const ledger = getTopicPack('ledger')!;
  const pool = poolOf(['ledger', 'trial-balance'], LEGACY_MIX_KINDS, false);
  const one = ledger.concepts.find((c) => pool.templates.some((t) => t.conceptId === c.id))!.id;

  it('keep a topic to the subtopics named for it, and leave a topic none was named for whole', () => {
    const narrowed = narrowByTopic(pool, [one], packs('ledger', 'trial-balance'));
    const ofLedger = narrowed.templates.filter((t) => t.topicId === 'ledger');
    expect(ofLedger.length).toBeGreaterThan(0);
    expect(ofLedger.every((t) => t.conceptId === one)).toBe(true);
    expect(narrowed.templates.filter((t) => t.topicId === 'trial-balance')).toEqual(pool.templates.filter((t) => t.topicId === 'trial-balance'));
    expect(narrowByTopic(pool, null, packs('ledger'))).toBe(pool);
  });
});

describe('the address of a run', () => {
  it('reads topics, kinds, difficulty, subtopics and whether practice beyond the syllabus is in', () => {
    expect(setupFromQuery(query('topics=ledger,cash-book&kinds=quick,cases&level=easy&subtopics=led-a,led-b'))).toEqual({
      topics: ['ledger', 'cash-book'],
      kinds: ['quick', 'cases'],
      difficulty: 'easy',
      subtopics: ['led-a', 'led-b'],
      beyond: false,
    });
    expect(setupFromQuery(query(''))).toEqual({ topics: null, kinds: DEFAULT_MIX_KINDS, difficulty: 'mixed', subtopics: null, beyond: false });
    // A run at a topic's own address mixes what it always did.
    expect(setupFromQuery(query('level=nonsense'), LEGACY_MIX_KINDS)).toEqual({ topics: null, kinds: LEGACY_MIX_KINDS, difficulty: 'mixed', subtopics: null, beyond: false });
    // Practice beyond the syllabus is in only when the address says so in so many words.
    expect(setupFromQuery(query('beyond=1')).beyond).toBe(true);
    expect(setupFromQuery(query('beyond=yes')).beyond).toBe(false);
    expect(setupFromQuery(query('kinds=nothing')).kinds).toEqual([]);
  });

  it('writes them back, and the run is at its own address', () => {
    const setup = { topics: ['ledger', 'cash-book'], kinds: ['cases', 'quick'] as const, difficulty: 'complex' as const, subtopics: ['led-a'] };
    expect(setupToQuery({ ...setup, kinds: [...setup.kinds] })).toBe('topics=ledger,cash-book&kinds=quick,cases&level=complex&subtopics=led-a');
    expect(setupToQuery({ topics: ['ledger'], kinds: [...DEFAULT_MIX_KINDS], difficulty: 'mixed', subtopics: null })).toBe('topics=ledger');
    expect(mixHref({ topics: ['ledger'], kinds: ['quick'], difficulty: 'mixed', subtopics: null })).toBe(`/practice/marathon/${MARATHON_MIX}?topics=ledger`);
    const round = setupFromQuery(query(setupToQuery({ ...setup, kinds: [...setup.kinds] })));
    expect(round).toEqual({ ...setup, kinds: ['quick', 'cases'], beyond: false });
    // Practice beyond the syllabus goes into the address only when it is in.
    expect(setupToQuery({ topics: ['ledger'], kinds: [...DEFAULT_MIX_KINDS], difficulty: 'mixed', subtopics: null, beyond: true })).toBe('topics=ledger&beyond=1');
    expect(setupFromQuery(query(setupToQuery({ ...setup, kinds: [...setup.kinds], beyond: true })))).toEqual({ ...setup, kinds: ['quick', 'cases'], beyond: true });
  });

  it('records a run over one topic under the topic, and any other under all the topics', () => {
    expect(recordScope(['ledger'])).toBe('ledger');
    expect(recordScope(['ledger', 'cash-book'])).toBe('all');
  });
});

describe('the summary of a choice and of a run', () => {
  it('says what was chosen', () => {
    expect(mixSummaryLine({ topics: 12, patterns: 340, cases: 18 })).toBe('12 topics · 340 question types · 18 case studies');
    expect(mixSummaryLine({ topics: 1, patterns: 1, cases: 0 })).toBe('1 topic · 1 question type');
    expect(mixSummaryLine({ topics: 0, patterns: 0, cases: 0 })).toBe('No topic chosen');
  });

  it('sorts the answers by kind', () => {
    const t = findTemplateOutline('je-capital');
    expect(t).toBeDefined();
    expect(answerKindOf({ type: 'mcq' })).toBe('quick');
    expect(answerKindOf({ type: 'journal_entry' })).toBe('quick');
    expect(answerKindOf({ type: 'statement' })).toBe('long');
    expect(answerKindOf({ type: 'mcq', context: 'A shop.' })).toBe('case');
  });

  it('counts the answers by a key, in the order the keys first came up', () => {
    const answers = [
      { questionId: 'a', correct: true },
      { questionId: 'b', correct: false },
      { questionId: 'c', correct: true },
      { questionId: 'x', correct: true },
    ];
    const keys: Record<string, string> = { a: 'ledger', b: 'cash-book', c: 'ledger' };
    expect(accuracyBy(answers, (id) => keys[id])).toEqual([
      { key: 'ledger', answered: 2, correct: 2 },
      { key: 'cash-book', answered: 1, correct: 0 },
    ]);
  });
});
