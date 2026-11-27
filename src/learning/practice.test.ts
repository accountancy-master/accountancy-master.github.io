import { describe, expect, it } from 'vitest';
import { STARTER_PACK } from '@/testing/starterPack';
import { templatesForConcept } from '@/content/registry';
import type { Question, TopicPack } from '@/content/types';
import { getTemplate, isValidSeed, parseGenId, TEMPLATES } from '@/generators';
import { levelSeed } from '@/play/seed';
import { SESSION_KINDS } from '@/storage/types';
import type { CardState } from './cardReview';
import { CONFIG } from './config';
import { DAY_MS } from './mastery';
import {
  availableForLearner,
  availableItems,
  type Available,
  buildCardSession,
  buildDailyChallenge,
  buildDailyMission,
  buildFreshQuestions,
  buildMistakeReview,
  buildSmartPractice,
  correctedCount,
  dailySeed,
  mergeAvailable,
  openMistakes,
  practiceCounts,
  practiceSeed,
} from './practice';
import { deriveProgress, type Progress, type QuestionRecord } from './progress';
import type { SessionItem } from './sessionBuilder';

const pack = STARTER_PACK;
const packs = [pack];
const NOW = new Date(2026, 9, 5, 10).getTime();
const levelId = (order: number) => pack.levels[order].id;
const passedUpTo = (order: number) => pack.levels.filter((l) => l.order <= order).map((l) => l.id);
const ALL: Available = availableItems(pack, pack.levels.map((l) => l.id));
const NONE: Available = { templateIds: new Set(), questionIds: new Set() };
/** Everything (templates and authored questions) that belongs to the given concepts. */
const only = (...conceptIds: string[]): Available => ({
  templateIds: new Set(TEMPLATES.filter((t) => ALL.templateIds.has(t.id) && conceptIds.includes(t.conceptId)).map((t) => t.id)),
  questionIds: new Set(pack.questions.filter((q) => conceptIds.includes(q.conceptId)).map((q) => q.id)),
});

const questionsOf = (items: SessionItem[]): Question[] =>
  items.flatMap((i) => (i.kind === 'question' ? [i.question] : []));
const ids = (items: SessionItem[]) => questionsOf(items).map((q) => q.id);
const cardIds = (items: SessionItem[]) => items.flatMap((i) => (i.kind === 'card' ? [i.card.id] : []));
const countBy = (qs: Question[], key: (q: Question) => string) => {
  const out: Record<string, number> = {};
  for (const q of qs) out[key(q)] = (out[key(q)] ?? 0) + 1;
  return out;
};
const byConcept = (items: SessionItem[]) => countBy(questionsOf(items), (q) => q.conceptId);
const noRepeats = (list: string[]) => new Set(list).size === list.length;
/** Ids an item list draws from outside the available set. */
const outside = (available: Available, items: SessionItem[]) =>
  ids(items).filter((id) => {
    const gen = parseGenId(id);
    return gen ? !available.templateIds.has(gen.templateId) : !available.questionIds.has(id);
  });
const smartSeed = (n: number) => practiceSeed('smart', n);

const empty = (): Progress => deriveProgress([], [], NOW);
/** Progress with the given concepts attempted: mastery, and when each is next due (default: far in the future). */
const withConcepts = (spec: Record<string, { mastery: number; dueAt?: number }>): Progress => ({
  ...empty(),
  concepts: Object.fromEntries(
    Object.entries(spec).map(([c, s]) => [
      c,
      { mastery: s.mastery, lastAt: NOW, review: { box: 1, dueAt: s.dueAt ?? NOW + 30 * DAY_MS } },
    ]),
  ),
});
const withMistakes = (rows: Record<string, Partial<QuestionRecord>>): Progress => ({
  ...empty(),
  questions: Object.fromEntries(
    Object.entries(rows).map(([id, r]) => [id, { attempts: 1, lastCorrect: false, mistakeOpen: true, ...r }]),
  ),
});
const cardState = (dueAt: number): CardState => ({ review: { box: 1, dueAt }, seen: 1, knownStreak: 1 });

describe('seeds', () => {
  it('gives valid, repeatable seeds', () => {
    for (const kind of SESSION_KINDS.filter((k) => k !== 'level' && k !== 'mock' && k !== 'marathon')) {
      expect(isValidSeed(practiceSeed(kind, 3))).toBe(true);
      expect(practiceSeed(kind, 3)).toBe(practiceSeed(kind, 3));
      expect(practiceSeed(kind, 4)).not.toBe(practiceSeed(kind, 3));
    }
    expect(isValidSeed(dailySeed('2026-10-05'))).toBe(true);
    expect(dailySeed('2026-10-05')).toBe(dailySeed('2026-10-05'));
    expect(dailySeed('2026-10-06')).not.toBe(dailySeed('2026-10-05'));
  });

  it('never lets 100-wide blocks overlap, across practice, daily and level seeds', () => {
    const kinds = SESSION_KINDS.filter((k) => k !== 'level' && k !== 'mock' && k !== 'marathon');
    expect(kinds).toHaveLength(7);
    const starts: number[] = [];
    for (let order = 0; order < 1000; order += 83) for (let play = 0; play < 50; play++) starts.push(levelSeed(order, play));
    starts.push(levelSeed(999, 9999));
    for (const kind of kinds) for (let play = 0; play < 200; play++) starts.push(practiceSeed(kind, play));
    const day = new Date(Date.UTC(2026, 0, 1));
    for (let i = 0; i < 400; i++) {
      starts.push(dailySeed(new Date(day.getTime() + i * DAY_MS).toISOString().slice(0, 10)));
    }
    starts.sort((a, b) => a - b);
    for (let i = 1; i < starts.length; i++) expect(starts[i] - starts[i - 1]).toBeGreaterThanOrEqual(100);
    expect(starts.every(isValidSeed)).toBe(true);
  });

  it('keeps the seed of each kind fixed', () => {
    const expected = {
      smart: [1000000000, 1000000500],
      fresh: [1001000000, 1001000500],
      mistakes: [1002000000, 1002000500],
      cards: [1003000000, 1003000500],
      daily_challenge: [1004000000, 1004000500],
      daily_mission: [1005000000, 1005000500],
      case: [1006000000, 1006000500],
    } as const;
    for (const [kind, [at0, at5]] of Object.entries(expected)) {
      expect(practiceSeed(kind as keyof typeof expected, 0), kind).toBe(at0);
      expect(practiceSeed(kind as keyof typeof expected, 5), kind).toBe(at5);
    }
  });

  it('rejects bad input', () => {
    expect(() => practiceSeed('smart', -1)).toThrow();
    expect(() => practiceSeed('smart', 10_000)).toThrow();
    expect(() => practiceSeed('smart', 1.5)).toThrow();
    expect(() => practiceSeed('level' as never, 0)).toThrow();
    expect(() => practiceSeed('__proto__' as never, 0)).toThrow();
    for (const day of ['', '2026-2-3', '2026-02-31', 'today', '2026-10-05T00:00']) {
      expect(() => dailySeed(day), day).toThrow();
    }
  });
});

describe('availableItems', () => {
  const sorted = (set: Set<string>) => [...set].sort();
  const EASY = ['je-capital', 'je-drawings', 'je-cash-purchase', 'je-cash-sale', 'je-asset-purchase', 'je-expense-paid', 'je-income-received'];
  const range = (from: number, to: number) =>
    Array.from({ length: to - from + 1 }, (_, i) => `je-q-${String(from + i).padStart(3, '0')}`);

  it('is nothing when nothing is passed', () => {
    const a = availableItems(pack, []);
    expect(sorted(a.templateIds)).toEqual([]);
    expect(sorted(a.questionIds)).toEqual([]);
  });

  it('with levels 0-3 passed is the ten authored questions of levels 0, 2 and 3 and no template', () => {
    const a = availableItems(pack, passedUpTo(3));
    expect(sorted(a.templateIds)).toEqual([]);
    expect(sorted(a.questionIds)).toEqual(range(1, 10));
  });

  it('with levels 0-4 passed adds the seven easy templates of level 4', () => {
    const a = availableItems(pack, passedUpTo(4));
    expect(sorted(a.templateIds)).toEqual([...EASY].sort());
    expect(sorted(a.questionIds)).toEqual(range(1, 10));
    // The GST questions of level 3 are available, the GST generators are not.
    expect(a.templateIds.has('je-gst-purchase')).toBe(false);
  });

  it('with levels 0-7 passed adds the templates of levels 5-7 but not GST or trade discount', () => {
    const a = availableItems(pack, passedUpTo(7));
    const added = [
      'je-credit-purchase', 'je-credit-sale', 'je-payment-discount', 'je-receipt-discount',
      'je-bank-contra', 'je-returns',
    ];
    expect(sorted(a.templateIds)).toEqual([...EASY, ...added].sort());
    expect(a.templateIds.has('je-gst-purchase')).toBe(false);
    expect(a.templateIds.has('je-trade-discount')).toBe(false);
  });

  it('with everything passed is all sixteen templates and the ten authored questions', () => {
    const a = availableItems(pack, pack.levels.map((l) => l.id));
    expect(sorted(a.templateIds)).toEqual(sorted(new Set(pack.levels.flatMap((l) => l.generate?.templateIds ?? []))));
    expect(a.templateIds.size).toBe(16);
    expect(sorted(a.questionIds)).toEqual(range(1, 10));
  });

  it('adds nothing for a level that only has cards, and ignores ids it does not know', () => {
    expect(sorted(availableItems(pack, [levelId(0)]).questionIds)).toEqual(['je-q-001']);
    expect(availableItems(pack, [levelId(0), levelId(1)])).toEqual(availableItems(pack, [levelId(0)]));
    expect(availableItems(pack, ['nope'])).toEqual(availableItems(pack, []));
  });

  it('makes an attempted authored question available although its level is not passed', () => {
    const a = availableItems(pack, [], ['je-q-007']);
    expect(sorted(a.questionIds)).toEqual(['je-q-007']);
    expect(sorted(a.templateIds)).toEqual([]);
  });

  it('makes the template of an attempted generated question available although its level is not passed', () => {
    const a = availableItems(pack, passedUpTo(3), ['gen:je-credit-sale:1:7']);
    expect(sorted(a.templateIds)).toEqual(['je-credit-sale']);
    expect(sorted(a.questionIds)).toEqual(range(1, 10));
    // Only that template, not the rest of its level.
    expect(a.templateIds.has('je-credit-purchase')).toBe(false);
  });

  it('ignores attempted ids this topic does not list', () => {
    expect(availableItems(pack, [], ['gen:nope:1:7', 'other-q-1', 'je-q-999'])).toEqual(NONE);
  });

  it('merges several sets into their union', () => {
    const merged = mergeAvailable([availableItems(pack, []), availableItems(pack, passedUpTo(3))]);
    expect(merged).toEqual(availableItems(pack, passedUpTo(3)));
    expect(mergeAvailable([])).toEqual(NONE);
    const bank = only('je-bank');
    const both = mergeAvailable([bank, only('je-rules')]);
    expect(sorted(both.templateIds)).toEqual(sorted(bank.templateIds));
    expect(sorted(both.questionIds)).toEqual(['je-q-001', 'je-q-002']);
  });
});

describe('availableForLearner', () => {
  const sorted = (set: Set<string>) => [...set].sort();

  it('follows what was passed or attempted when every level is not unlocked', () => {
    expect(availableForLearner(packs, [], [], false)).toEqual(NONE);
    expect(availableForLearner(packs, passedUpTo(3), [], false)).toEqual(availableItems(pack, passedUpTo(3)));
    const attempted = availableForLearner(packs, [], ['je-q-007'], false);
    expect(sorted(attempted.questionIds)).toEqual(['je-q-007']);
  });

  it('is everything the levels list, whatever was passed, when every level is unlocked', () => {
    expect(availableForLearner(packs, [], [], true)).toEqual(ALL);
    expect(availableForLearner(packs, passedUpTo(3), ['je-q-007'], true)).toEqual(ALL);
    expect(ALL.templateIds.size).toBe(16);
    expect(ALL.questionIds.size).toBe(10);
  });
});

describe('buildSmartPractice', () => {
  const run = (progress: Progress, available = ALL, seed = smartSeed(0)) =>
    buildSmartPractice(packs, progress, available, NOW, seed);

  it('is repeatable for a seed and differs between seeds', () => {
    const progress = empty();
    expect(ids(run(progress))).toEqual(ids(run(progress)));
    const seen = new Set([0, 1, 2, 3].map((n) => ids(run(progress, ALL, smartSeed(n))).join()));
    expect(seen.size).toBe(4);
  });

  it('with no progress is ten fresh-ground questions, easiest templates first', () => {
    const items = run(empty());
    const qs = questionsOf(items);
    expect(items).toHaveLength(10);
    expect(qs).toHaveLength(10);
    expect(noRepeats(ids(items))).toBe(true);
    for (const q of qs) {
      const templates = templatesForConcept(q.conceptId);
      if (templates.length === 0) continue; // authored only
      const easiest = templates.some((t) => t.difficulty === 'easy') ? 'easy' : 'medium';
      expect(q.difficulty, q.id).toBe(easiest);
    }
    // The first three concepts in pack order are the "fresh" ones.
    const counts = byConcept(items);
    for (const c of pack.concepts.slice(0, 3)) expect(counts[c.id]).toBeGreaterThanOrEqual(1);
  });

  it('with some weak and some due concepts takes weak, then due, then fresh, then tops up from weak', () => {
    const past = NOW - DAY_MS;
    const progress = withConcepts({
      'je-capital-drawings': { mastery: 10 },
      'je-goods': { mastery: 20 },
      'je-settlement': { mastery: 30 },
      'je-credit': { mastery: 50 },
      'je-bank': { mastery: 80, dueAt: past },
      'je-assets-expenses': { mastery: 90, dueAt: past - DAY_MS },
    });
    for (let n = 0; n < 5; n++) {
      const items = run(progress, ALL, smartSeed(n));
      const counts = byConcept(items);
      expect(items).toHaveLength(10);
      expect(noRepeats(ids(items))).toBe(true);
      // 4 weak + 2 due + 3 fresh (rules, returns, gst in pack order) + 1 top-up from the weakest.
      expect(counts).toEqual({
        'je-capital-drawings': 2,
        'je-goods': 1,
        'je-settlement': 1,
        'je-credit': 1,
        'je-bank': 1,
        'je-assets-expenses': 1,
        'je-rules': 1,
        'je-returns': 1,
        'je-gst': 1,
      });
    }
  });

  it('when everything is mastered and nothing is due, spends the session on the weakest concepts', () => {
    const order = pack.concepts.map((c) => c.id).reverse(); // rules ends up the most mastered
    const progress = withConcepts(Object.fromEntries(order.map((c, i) => [c, { mastery: 60 + i * 4 }])));
    const counts = byConcept(run(progress));
    expect(Object.values(counts).reduce((a, b) => a + b, 0)).toBe(10);
    // 4 weakest once, then the weakest again from the top: 4 concepts twice, the next two once.
    expect(Object.values(counts).sort()).toEqual([1, 1, 2, 2, 2, 2]);
    expect(counts['je-rules']).toBeUndefined();
    for (const c of order.slice(0, 4)) expect(counts[c]).toBe(2);
  });

  it('serves je-rules, which has no template, from its authored questions', () => {
    const qs = questionsOf(run(empty()));
    const rules = qs.filter((q) => q.conceptId === 'je-rules');
    expect(rules.length).toBeGreaterThan(0);
    for (const q of rules) expect(pack.questions.map((x) => x.id)).toContain(q.id);
  });

  it('uses only available concepts, and fewer items when little is unlocked', () => {
    const available = only('je-credit', 'je-goods');
    for (let n = 0; n < 5; n++) {
      const items = run(empty(), available, smartSeed(n));
      expect(items).toHaveLength(10);
      expect(Object.keys(byConcept(items)).sort()).toEqual(['je-credit', 'je-goods']);
    }
    // Only an authored-only concept: its two questions, never repeated, nothing padded in.
    const onlyRules = run(empty(), only('je-rules'));
    expect(ids(onlyRules).sort()).toEqual(['je-q-001', 'je-q-002']);
    expect(run(empty(), NONE)).toEqual([]);
  });

  it('ignores progress on concepts that are not available', () => {
    const progress = withConcepts({ 'je-gst': { mastery: 0, dueAt: NOW - DAY_MS } });
    const items = run(progress, only('je-goods'));
    expect(Object.keys(byConcept(items))).toEqual(['je-goods']);
  });

  it('uses only concepts of the given packs', () => {
    const small: TopicPack = { ...pack, concepts: pack.concepts.filter((c) => c.id === 'je-goods' || c.id === 'je-credit') };
    const counts = byConcept(buildSmartPractice([small], empty(), ALL, NOW, smartSeed(0)));
    expect(Object.keys(counts).sort()).toEqual(['je-credit', 'je-goods']);
    expect(buildSmartPractice([], empty(), ALL, NOW, smartSeed(0))).toEqual([]);
  });

  it('never repeats a question id, over many seeds', () => {
    const progress = withConcepts({ 'je-goods': { mastery: 10 }, 'je-rules': { mastery: 5 } });
    for (let n = 0; n < 40; n++) expect(noRepeats(ids(run(progress, ALL, smartSeed(n))))).toBe(true);
  });
});

describe('smart practice due selection by local day', () => {
  const at = (day: number, hour: number) => new Date(2026, 9, day, hour).getTime();
  // Four weak concepts, and one strong concept that is scheduled for the evening of 6 October.
  const progress = withConcepts({
    'je-capital-drawings': { mastery: 10 },
    'je-goods': { mastery: 20 },
    'je-settlement': { mastery: 30 },
    'je-credit': { mastery: 40 },
    'je-bank': { mastery: 90, dueAt: at(6, 19) },
  });
  const bankQuestions = (now: number) =>
    byConcept(buildSmartPractice(packs, progress, ALL, now, smartSeed(0)))['je-bank'] ?? 0;

  it('takes a concept scheduled for later today as due, and not the evening before', () => {
    expect(bankQuestions(at(6, 8))).toBe(1);
    expect(bankQuestions(at(5, 23))).toBe(0);
  });
});

describe('buildFreshQuestions', () => {
  const run = (progress: Progress, available = ALL, seed = practiceSeed('fresh', 0)) =>
    buildFreshQuestions(pack, progress, available, seed);

  it('is repeatable for a seed and differs between seeds', () => {
    expect(ids(run(empty()))).toEqual(ids(run(empty())));
    expect(ids(run(empty(), ALL, practiceSeed('fresh', 1)))).not.toEqual(ids(run(empty())));
  });

  it('is freshCount generated questions with no repeats, and never from a concept without templates', () => {
    for (let n = 0; n < 10; n++) {
      const items = run(empty(), ALL, practiceSeed('fresh', n));
      expect(items).toHaveLength(CONFIG.practice.freshCount);
      expect(noRepeats(ids(items))).toBe(true);
      for (const q of questionsOf(items)) {
        expect(q.id.startsWith('gen:')).toBe(true);
        expect(q.conceptId).not.toBe('je-rules');
      }
    }
  });

  it('leans towards the concepts with the lowest mastery', () => {
    const spec = Object.fromEntries(pack.concepts.map((c) => [c.id, { mastery: 100 }]));
    spec['je-bank'] = { mastery: 0 };
    const progress = withConcepts(spec);
    let bank = 0;
    let total = 0;
    for (let n = 0; n < 30; n++) {
      const counts = byConcept(run(progress, ALL, practiceSeed('fresh', n)));
      bank += counts['je-bank'] ?? 0;
      total += CONFIG.practice.freshCount;
    }
    expect(bank / total).toBeGreaterThan(0.5);
  });

  it('uses only available concepts', () => {
    const available = only('je-returns', 'je-rules');
    for (let n = 0; n < 5; n++) {
      expect(Object.keys(byConcept(run(empty(), available, practiceSeed('fresh', n))))).toEqual(['je-returns']);
    }
    expect(run(empty(), only('je-rules'))).toEqual([]);
    expect(run(empty(), NONE)).toEqual([]);
  });
});

describe('openMistakes and buildMistakeReview', () => {
  it('lists open mistakes oldest first, with their code, skipping closed and unresolvable ones', () => {
    const progress = withMistakes({
      'gen:je-capital:1:5': { mistakeAt: 300, mistakeCode: 'sidesReversed' },
      'je-q-003': { mistakeAt: 100 },
      'gen:je-capital:99:1': { mistakeAt: 50 },
      'gen:nope:1:1': { mistakeAt: 10 },
      'gen:je-capital:1:007': { mistakeAt: 5 },
      'je-q-004': { mistakeAt: 200, mistakeOpen: false, lastCorrect: true },
      'je-q-005': { mistakeAt: 200 },
    });
    const open = openMistakes(progress);
    expect(open.map((m) => m.questionId)).toEqual(['je-q-003', 'je-q-005', 'gen:je-capital:1:5']);
    expect(open[2].mistakeCode).toBe('sidesReversed');
    expect(open[0].mistakeCode).toBeUndefined();
    expect(open.every((m) => m.question.id === m.questionId)).toBe(true);
  });

  it('serves them again by their exact ids, up to the maximum', () => {
    const rows = Object.fromEntries(Array.from({ length: 12 }, (_, i) => [`gen:je-capital:1:${i + 1}`, { mistakeAt: 1000 - i }]));
    const review = buildMistakeReview(withMistakes({ ...rows, 'gen:je-capital:99:1': { mistakeAt: 1 } }));
    expect(review).toHaveLength(CONFIG.practice.mistakesMax);
    expect(ids(review)).toEqual(Array.from({ length: 10 }, (_, i) => `gen:je-capital:1:${12 - i}`));
  });

  it('is empty when there are no mistakes, and orders by derived mistake time', () => {
    expect(buildMistakeReview(empty())).toEqual([]);
    const at = (n: number) => NOW + n;
    const wrong = (questionId: string, n: number) => ({
      id: `a${n}`, profileId: 'p', courseId: 'c', topicId: 'journal-entries', conceptId: 'je-goods', questionId,
      difficulty: 'easy' as const, correct: false, hintsUsed: 0, timeMs: 1, at: at(n), sessionId: `s${n}`,
    });
    const progress = deriveProgress([wrong('je-q-005', 3), wrong('je-q-003', 1), wrong('je-q-004', 2)], [], at(10));
    expect(buildMistakeReview(progress).map((i) => (i.kind === 'question' ? i.question.id : ''))).toEqual([
      'je-q-003', 'je-q-004', 'je-q-005',
    ]);
  });
});

describe('buildCardSession', () => {
  it('is due cards earliest first, then unseen cards in pack order, capped, and skips cards not yet due', () => {
    const states = {
      'je-card-5': cardState(NOW - 2 * DAY_MS),
      'je-card-2': cardState(NOW - DAY_MS),
      'je-card-3': cardState(NOW + DAY_MS),
    };
    const session = buildCardSession(packs, states, NOW);
    expect(session.every((i) => i.kind === 'card')).toBe(true);
    const got = cardIds(session);
    expect(got).toHaveLength(CONFIG.practice.cardsPerSession);
    expect(got.slice(0, 2)).toEqual(['je-card-5', 'je-card-2']);
    expect(got).not.toContain('je-card-3');
    expect(got.slice(2)).toEqual(pack.cards.map((c) => c.id).filter((id) => !(id in states)).slice(0, 8));
  });

  it('is empty when every card has been seen and none is due', () => {
    const states = Object.fromEntries(pack.cards.map((c) => [c.id, cardState(NOW + DAY_MS)]));
    expect(buildCardSession(packs, states, NOW)).toEqual([]);
  });
});

describe('buildDailyChallenge', () => {
  const day = '2026-10-05';
  const difficulties = (items: SessionItem[]) => questionsOf(items).map((q) => q.difficulty);

  it('is five medium or complex generated questions, identical for the same day', () => {
    const a = buildDailyChallenge(packs, ALL, day);
    expect(a).toHaveLength(CONFIG.practice.dailyChallengeCount);
    expect(ids(a)).toEqual(ids(buildDailyChallenge(packs, ALL, day)));
    expect(noRepeats(ids(a))).toBe(true);
    for (const d of difficulties(a)) expect(['medium', 'complex']).toContain(d);
    for (const q of questionsOf(a)) expect(q.id.startsWith('gen:')).toBe(true);
  });

  it('differs on the next day', () => {
    expect(ids(buildDailyChallenge(packs, ALL, '2026-10-06'))).not.toEqual(ids(buildDailyChallenge(packs, ALL, day)));
  });

  it('uses only available concepts, and is identical for the same available set', () => {
    const available = only('je-bank', 'je-goods', 'je-rules');
    const a = buildDailyChallenge(packs, available, day);
    expect(Object.keys(byConcept(a))).toEqual(['je-bank']);
    const reversed = {
      templateIds: new Set([...available.templateIds].reverse()),
      questionIds: new Set([...available.questionIds].reverse()),
    };
    expect(ids(a)).toEqual(ids(buildDailyChallenge(packs, reversed, day)));
  });

  it('falls back to easy templates when no medium or complex one is available', () => {
    const easy = buildDailyChallenge(packs, only('je-goods', 'je-rules'), day);
    expect(easy).toHaveLength(5);
    expect(Object.keys(byConcept(easy))).toEqual(['je-goods']);
    expect(new Set(difficulties(easy))).toEqual(new Set(['easy']));
  });

  it('falls back to available authored questions when no template is available, and to nothing', () => {
    const authored = buildDailyChallenge(packs, only('je-rules'), day);
    expect(ids(authored).sort()).toEqual(['je-q-001', 'je-q-002']);
    expect(ids(authored)).toEqual(ids(buildDailyChallenge(packs, only('je-rules'), day)));
    expect(buildDailyChallenge(packs, NONE, day)).toEqual([]);
  });
});

describe('buildDailyMission', () => {
  const seed = practiceSeed('daily_mission', 0);
  const mission = (progress: Progress, states: Record<string, CardState>, available = ALL, s = seed) =>
    buildDailyMission(packs, progress, states, available, NOW, s);
  const { cards, questions, challenge } = CONFIG.practice.mission;

  it('is cards, then smart-practice questions, then complex challenge questions', () => {
    const items = mission(empty(), {});
    expect(items).toHaveLength(cards + questions + challenge);
    expect(items.slice(0, cards).every((i) => i.kind === 'card')).toBe(true);
    expect(cardIds(items)).toEqual(pack.cards.slice(0, cards).map((c) => c.id));
    const qs = questionsOf(items);
    expect(qs).toHaveLength(questions + challenge);
    expect(noRepeats(ids(items))).toBe(true);
    const tail = qs.slice(questions);
    expect(tail.map((q) => q.difficulty)).toEqual(['complex', 'complex']);
  });

  it('has fewer cards when fewer are due', () => {
    const states = Object.fromEntries(pack.cards.map((c) => [c.id, cardState(NOW + DAY_MS)]));
    states['je-card-4'] = cardState(NOW - DAY_MS);
    states['je-card-9'] = cardState(NOW - 2 * DAY_MS);
    const items = mission(empty(), states);
    expect(cardIds(items)).toEqual(['je-card-9', 'je-card-4']);
    expect(items).toHaveLength(2 + questions + challenge);
  });

  it('has no cards when none are due, and still has its questions', () => {
    const states = Object.fromEntries(pack.cards.map((c) => [c.id, cardState(NOW + DAY_MS)]));
    const items = mission(empty(), states);
    expect(cardIds(items)).toEqual([]);
    expect(questionsOf(items)).toHaveLength(questions + challenge);
  });

  it('is repeatable for a seed and differs between seeds', () => {
    const a = mission(empty(), {});
    expect(JSON.stringify(a)).toBe(JSON.stringify(mission(empty(), {})));
    const b = mission(empty(), {}, ALL, practiceSeed('daily_mission', 1));
    expect(ids(b)).not.toEqual(ids(a));
  });

  it('uses medium challenge questions when no complex template is available, and only available concepts', () => {
    const available = only('je-goods', 'je-bank', 'je-returns');
    const items = mission(empty(), {}, available);
    const qs = questionsOf(items);
    expect(outside(available, items)).toEqual([]);
    expect(qs.slice(-challenge).map((q) => q.difficulty)).toEqual(['medium', 'medium']);
    expect(noRepeats(ids(items))).toBe(true);
  });

  it('is empty when no question is available: a mission never consists of cards alone', () => {
    expect(mission(empty(), {}, NONE)).toEqual([]);
    expect(mission(empty(), {}, only('je-capital-drawings'))).not.toEqual([]);
  });
});

describe('every builder honours the available set', () => {
  const sets: Available[] = [
    only('je-rules'),
    only('je-goods'),
    only('je-rules', 'je-capital-drawings', 'je-bank'),
    availableItems(pack, passedUpTo(3)),
    availableItems(pack, []),
  ];

  it('never serves a template or authored question outside the set', () => {
    const progress = withConcepts({
      'je-gst': { mastery: 0, dueAt: NOW - DAY_MS },
      'je-returns': { mastery: 1 },
      'je-goods': { mastery: 40 },
    });
    for (const available of sets) {
      for (let n = 0; n < 8; n++) {
        expect(outside(available, buildSmartPractice(packs, progress, available, NOW, smartSeed(n)))).toEqual([]);
        expect(outside(available, buildFreshQuestions(pack, progress, available, practiceSeed('fresh', n)))).toEqual([]);
        expect(
          outside(available, buildDailyMission(packs, progress, {}, available, NOW, practiceSeed('daily_mission', n))),
        ).toEqual([]);
        expect(outside(available, buildDailyChallenge(packs, available, `2026-10-${String(10 + n)}`))).toEqual([]);
      }
    }
  });

  it('never exceeds the configured counts or repeats an id', () => {
    for (const available of sets) {
      const smart = buildSmartPractice(packs, empty(), available, NOW, smartSeed(0));
      expect(smart.length).toBeLessThanOrEqual(10);
      expect(noRepeats(ids(smart))).toBe(true);
      const mission = buildDailyMission(packs, empty(), {}, available, NOW, practiceSeed('daily_mission', 0));
      expect(noRepeats(ids(mission))).toBe(true);
    }
  });
});

describe('the ladder decides what practice may ask', () => {
  const FORBIDDEN = ['je-gst-purchase', 'je-gst-sale', 'je-trade-discount'];
  const days = (n: number) => new Date(Date.UTC(2026, 0, 1) + n * DAY_MS).toISOString().slice(0, 10);
  const progresses = (): Progress[] => [
    empty(),
    withConcepts({ 'je-gst': { mastery: 0, dueAt: NOW - DAY_MS }, 'je-goods': { mastery: 30 }, 'je-credit': { mastery: 90 } }),
  ];
  /** Template ids behind the generated questions of the items. */
  const templatesUsed = (items: SessionItem[]) => ids(items).flatMap((id) => parseGenId(id)?.templateId ?? []);

  it('with levels 0-4 passed, never serves GST, trade discount or a medium or complex template', () => {
    const available = availableItems(pack, passedUpTo(4));
    for (let n = 0; n < 200; n++) {
      const sessions: SessionItem[][] = [
        ...progresses().flatMap((progress) => [
          buildSmartPractice(packs, progress, available, NOW, smartSeed(n)),
          buildFreshQuestions(pack, progress, available, practiceSeed('fresh', n)),
          buildDailyMission(packs, progress, {}, available, NOW, practiceSeed('daily_mission', n)),
        ]),
        buildDailyChallenge(packs, available, days(n)),
      ];
      for (const items of sessions) {
        for (const templateId of templatesUsed(items)) {
          expect(FORBIDDEN, templateId).not.toContain(templateId);
          expect(getTemplate(templateId).difficulty, templateId).toBe('easy');
        }
        expect(outside(available, items)).toEqual([]);
      }
    }
  });

  it('with levels 0-4 passed, the daily challenge is made of easy templates', () => {
    const available = availableItems(pack, passedUpTo(4));
    for (let n = 0; n < 20; n++) {
      const challenge = buildDailyChallenge(packs, available, days(n));
      expect(challenge).toHaveLength(CONFIG.practice.dailyChallengeCount);
      expect(templatesUsed(challenge)).toHaveLength(challenge.length);
      expect(new Set(questionsOf(challenge).map((q) => q.difficulty))).toEqual(new Set(['easy']));
    }
  });

  it('with levels 0-3 passed, still offers the authored GST questions the ladder has introduced', () => {
    const available = availableItems(pack, passedUpTo(3));
    const progress = withConcepts({ 'je-gst': { mastery: 0 } });
    const served = new Set<string>();
    for (let n = 0; n < 40; n++) {
      for (const id of ids(buildSmartPractice(packs, progress, available, NOW, smartSeed(n)))) served.add(id);
    }
    expect(['je-q-008', 'je-q-009'].some((id) => served.has(id))).toBe(true);
  });

  it('with nothing passed, no practice and no mission or challenge is offered', () => {
    const available = availableItems(pack, []);
    for (let n = 0; n < 20; n++) {
      expect(buildSmartPractice(packs, empty(), available, NOW, smartSeed(n))).toEqual([]);
      expect(buildDailyChallenge(packs, available, days(n))).toEqual([]);
      expect(buildFreshQuestions(pack, empty(), available, practiceSeed('fresh', n))).toEqual([]);
      expect(buildDailyMission(packs, empty(), {}, available, NOW, practiceSeed('daily_mission', n))).toEqual([]);
    }
  });

  it('with only level 0 passed, the mission is rule cards plus the one first question, never cards alone', () => {
    const available = availableItems(pack, passedUpTo(0));
    const items = buildDailyMission(packs, empty(), {}, available, NOW, practiceSeed('daily_mission', 0));
    expect(ids(items)).toEqual(['je-q-001']);
    expect(cardIds(items)).toHaveLength(CONFIG.practice.mission.cards);
    expect(ids(buildDailyChallenge(packs, available, days(0)))).toEqual(['je-q-001']);
  });

  it('with everything passed, the daily challenge has no easy question', () => {
    const challenge = buildDailyChallenge(packs, ALL, '2026-10-05');
    expect(questionsOf(challenge).some((q) => q.difficulty === 'easy')).toBe(false);
  });
});

describe('practiceCounts', () => {
  it('counts nothing due, every card new and no mistakes for a new learner', () => {
    expect(pack.cards).toHaveLength(11);
    expect(practiceCounts(packs, empty(), {}, NOW)).toEqual({ due: 0, fresh: 11, mistakes: 0 });
  });

  it('counts due cards, never-seen cards and open mistakes that can still be served', () => {
    const [a, b] = pack.cards;
    const states = { [a.id]: cardState(NOW - DAY_MS), [b.id]: cardState(NOW + DAY_MS) };
    const progress = withMistakes({
      'je-q-003': {},
      'gen:je-capital:1:5': {},
      'gen:je-capital:99:1': {},
      'je-q-004': { mistakeOpen: false, lastCorrect: true },
    });
    expect(practiceCounts(packs, progress, states, NOW)).toEqual({ due: 1, fresh: 9, mistakes: 2 });
  });
});

describe('correctedCount', () => {
  it('counts every correction made, so one question corrected twice counts twice', () => {
    const progress = withMistakes({ 'je-q-003': { mistakeOpen: false, lastCorrect: true, corrected: 2 } });
    expect(correctedCount(progress)).toBe(2);
    expect(correctedCount(empty())).toBe(0);
  });

  it('ignores questions never corrected, and corrections of questions that can no longer be served', () => {
    const rows = {
      'je-q-003': { mistakeOpen: false, lastCorrect: true, corrected: 0 },
      'je-q-004': { mistakeOpen: true, lastCorrect: false },
      'gen:je-capital:99:1': { mistakeOpen: false, lastCorrect: true, corrected: 3 },
      'je-q-005': { mistakeOpen: false, lastCorrect: true, corrected: 1 },
    };
    expect(correctedCount(withMistakes(rows))).toBe(1);
  });

  it('does not go down when a corrected question is missed again', () => {
    const rows = {
      'je-q-003': { mistakeOpen: false, lastCorrect: true, corrected: 1 },
      'je-q-004': { mistakeOpen: false, lastCorrect: true, corrected: 1 },
    };
    expect(correctedCount(withMistakes(rows))).toBe(2);
    const missedAgain = { ...rows, 'je-q-004': { mistakeOpen: true, lastCorrect: false, corrected: 1 } };
    expect(correctedCount(withMistakes(missedAgain))).toBe(2);
  });

  it('does not count a question that can no longer be served', () => {
    const progress = withMistakes({
      'je-q-003': { mistakeOpen: false, lastCorrect: true, corrected: 1 },
      'gen:je-capital:99:1': { mistakeOpen: false, lastCorrect: true, corrected: 4 },
    });
    expect(correctedCount(progress)).toBe(1);
  });
});
