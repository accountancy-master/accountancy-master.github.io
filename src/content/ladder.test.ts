import { describe, expect, it } from 'vitest';
// Every generator is registered first: a pack builds its ladder from its topic's templates as it is imported.
import '@/generators';
import { JOURNAL_ENTRIES } from './cbse11/journalEntries';
import { CASE_STAGES, TEMPLATES, parseCasePartId, type CaseStage } from '@/generators';
import { outsidePapers } from '@/generators/outsidePapers';
import { FORMAT_PASS_MARK, SET_PASS_MARK, buildLadder, formatLevels, laterLevels, setLevels, type LadderSpec, withCaseStudyLevels, withLookBackLevels, withQuizLevels } from './ladder';
import { ALL_PACKS, COURSES, PACKS, packsOf } from './registry';
import type { TopicPack } from './types';
import { validatePack } from './validate';
import { topicsMeet } from './courseOptions';

// Journal Entries templates stand in for any topic's: easy (je-capital), medium (je-credit-purchase), complex (je-trade-discount).
const T = 'journal-entries';
const lesson = [{ type: 'text' as const, heading: 'H', body: 'B' }];
const full: LadderSpec = {
  concept: { title: 'Concept', description: 'd', lesson },
  cards: { title: 'Cards', description: 'd', cardIds: ['je-card-1'] },
  recognition: [
    { title: 'Rule', description: 'd', questionIds: ['je-q-002'] },
    { title: 'Method', description: 'd', questionIds: ['je-q-007'] },
  ],
  practice: [
    { title: 'Complex', description: 'd', templateIds: ['je-trade-discount'], count: 4 },
    { title: 'Medium', description: 'd', templateIds: ['je-credit-purchase', 'je-credit-sale'], count: 5 },
    { title: 'Guided', description: 'd', templateIds: ['je-credit-sale'], count: 3, guided: true },
    { title: 'Easy', description: 'd', templateIds: ['je-capital', 'je-drawings'], count: 6 },
  ],
  mixed: { title: 'Mixed', description: 'd', count: 8 },
  challenge: { title: 'Challenge', description: 'd', count: 5 },
};

describe('buildLadder', () => {
  const levels = buildLadder(T, full);

  it('makes the standard shape, easy to hard, with ids by position', () => {
    expect(levels.map((l) => l.type)).toEqual([
      'concept',
      'card_revision',
      'rule_recognition',
      'method_recognition',
      'easy_practice',
      'guided_practice',
      'medium_practice',
      'complex_practice',
      'mixed_practice',
      'challenge',
    ]);
    expect(levels.map((l) => l.id)).toEqual(levels.map((_, n) => `${T}-level-${n}`));
    expect(levels.map((l) => l.order)).toEqual(levels.map((_, n) => n));
    expect(levels.every((l) => l.topicId === T)).toBe(true);
  });

  it('puts the lesson, cards and questions on their levels, and the templates on the practice levels', () => {
    expect(levels[0].lesson).toEqual(lesson);
    expect(levels[1].cardIds).toEqual(['je-card-1']);
    expect(levels[2].questionIds).toEqual(['je-q-002']);
    expect(levels[4].generate).toEqual({ templateIds: ['je-capital', 'je-drawings'], count: 6 });
  });

  it('mixes every practice template, and challenges with the hardest ones, timed', () => {
    const mixed = levels.find((l) => l.type === 'mixed_practice')!;
    expect([...(mixed.generate?.templateIds ?? [])].sort()).toEqual(
      ['je-capital', 'je-credit-purchase', 'je-credit-sale', 'je-drawings', 'je-trade-discount'].sort(),
    );
    const challenge = levels.find((l) => l.type === 'challenge')!;
    expect(challenge.generate).toEqual({ templateIds: ['je-trade-discount'], count: 5 });
    expect(challenge.timerSecondsPerQuestion).toBe(90);
  });

  it('skips levels with nothing in them and renumbers the rest', () => {
    const ladder = buildLadder('ledger', {
      concept: { title: 'C', description: 'd', lesson: [] },
      cards: { title: 'K', description: 'd', cardIds: [] },
      recognition: [{ title: 'R', description: 'd', questionIds: [] }],
      practice: [
        { title: 'Empty', description: 'd', templateIds: [], count: 3 },
        { title: 'Easy', description: 'd', templateIds: ['je-capital'], count: 3 },
      ],
      mixed: { title: 'M', description: 'd', count: 4, templateIds: [] },
      challenge: { title: 'X', description: 'd', count: 4 },
    });
    expect(ladder.map((l) => [l.id, l.type])).toEqual([
      ['ledger-level-0', 'easy_practice'],
      ['ledger-level-1', 'challenge'],
    ]);
  });

  it('is empty for an empty spec, and a lone lesson is a one-level ladder', () => {
    expect(buildLadder('ledger', {})).toEqual([]);
    expect(buildLadder('ledger', { concept: { title: 'C', description: 'd', lesson } })).toHaveLength(1);
  });

  it('throws for a template that does not exist', () => {
    expect(() => buildLadder('ledger', { practice: [{ title: 'P', description: 'd', templateIds: ['nope'], count: 1 }] })).toThrow(
      'Unknown template: nope',
    );
  });

  it('adds later levels after every level, with ids of their own, and refuses an empty one, a twin name or a beyond-syllabus template', () => {
    const before = [{ order: 0 }, { order: 7 }, { order: 3 }];
    const later = laterLevels('final-accounts-adjustments', before, [
      { name: 'a', type: 'rule_recognition', title: 'A', description: 'd', questionIds: ['faa-q-001'] },
      { name: 'b', type: 'medium_practice', title: 'B', description: 'd', generate: { templateIds: ['faa-int-capital'], count: 4 } },
    ]);
    expect(later.map((l) => [l.id, l.order])).toEqual([['final-accounts-adjustments-a', 8], ['final-accounts-adjustments-b', 9]]);
    expect(() => laterLevels('x', before, [{ name: 'a', type: 'easy_practice', title: 'A', description: 'd' }])).toThrow('has nothing in it');
    const twice = { name: 'a', type: 'easy_practice' as const, title: 'A', description: 'd', questionIds: ['q'] };
    expect(() => laterLevels('x', before, [twice, twice])).toThrow('named a');
    expect(() => laterLevels('x', before, [{ ...twice, generate: { templateIds: ['faa-int-drawings'], count: 2 } }])).toThrow('beyond the syllabus');
  });

  it('throws for a template beyond the syllabus, which stands on no level', () => {
    const spec = { practice: [{ title: 'P', description: 'd', templateIds: ['faa-int-capital', 'faa-int-drawings'], count: 4 }] };
    expect(() => buildLadder('final-accounts-adjustments', spec)).toThrow('Template faa-int-drawings is beyond the syllabus');
  });

  it('makes levels that validatePack accepts', () => {
    const pack: TopicPack = {
      topicId: T,
      concepts: JOURNAL_ENTRIES.concepts,
      cards: [
        { id: 'je-card-1', topicId: T, conceptId: 'je-rules', kind: 'rule', prompt: 'p', answer: 'a', explanation: 'e', example: 'x', commonMistake: 'm' },
      ],
      levels,
      questions: ['je-q-002', 'je-q-007'].map((id) => ({
        id,
        topicId: T,
        conceptId: 'je-rules',
        difficulty: 'easy' as const,
        type: 'true_false' as const,
        prompt: 'p',
        hints: [],
        explanation: '',
        correct: true,
      })),
    };
    expect(validatePack(pack)).toEqual([]);
  });
});

describe('levels of sets of journal entries', () => {
  const SETS = TEMPLATES.filter((t) => t.kind === 'journal_set' && t.topicId === T).map((t) => t.id);
  const sets = [
    { title: 'Sets', description: 'd', templateIds: SETS.slice(0, 2), count: 3 },
    { title: 'Nothing', description: 'd', templateIds: [], count: 2 },
    { title: 'Longer sets', description: 'd', templateIds: SETS.slice(1, 2), count: 2, passMark: 1 },
  ];

  it('come after every other level, with ids of their own that no other level changes', () => {
    const before = buildLadder(T, full);
    const levels = buildLadder(T, { ...full, sets });
    // Nothing above them moves.
    expect(levels.slice(0, before.length)).toEqual(before);
    expect(levels.slice(before.length)).toEqual([
      { id: `${T}-journal-sets-1`, topicId: T, order: before.length, type: 'set_practice', title: 'Sets', description: 'd', passMark: SET_PASS_MARK, generate: { templateIds: SETS.slice(0, 2), count: 3 } },
      { id: `${T}-journal-sets-2`, topicId: T, order: before.length + 1, type: 'set_practice', title: 'Longer sets', description: 'd', passMark: 1, generate: { templateIds: SETS.slice(1, 2), count: 2 } },
    ]);
    // A ladder that later loses a level above them keeps their ids.
    const shorter = buildLadder(T, { ...full, challenge: undefined, sets });
    expect(shorter.slice(-2).map((l) => [l.id, l.order])).toEqual([[`${T}-journal-sets-1`, before.length - 1], [`${T}-journal-sets-2`, before.length]]);
    expect(validatePack({ ...JOURNAL_ENTRIES, levels })).toEqual([]);
  });

  it('take only templates that make sets', () => {
    expect(() => setLevels(T, 5, [{ title: 'x', description: 'd', templateIds: ['je-capital'], count: 2 }])).toThrow('Template je-capital does not make sets');
    expect(setLevels(T, 5, [])).toEqual([]);
  });

  it('keep their ids when quiz levels are put in above them', () => {
    const pack: TopicPack = { ...JOURNAL_ENTRIES, levels: buildLadder(T, { ...full, sets }) };
    const out = withQuizLevels(pack);
    expect(out.levels.length).toBeGreaterThan(pack.levels.length);
    const moved = out.levels.filter((l) => l.type === 'set_practice');
    expect(moved.map((l) => l.id)).toEqual([`${T}-journal-sets-1`, `${T}-journal-sets-2`]);
    expect(out.levels.map((l) => l.order)).toEqual(out.levels.map((_, i) => i));
    expect(out.levels.filter((l) => l.type !== 'set_practice').map((l) => l.id)).toEqual(out.levels.filter((l) => l.type !== 'set_practice').map((l) => `${T}-level-${l.order}`));
  });

  it('are kept out of the Look back levels of later topics', () => {
    const setIds = new Set(TEMPLATES.filter((t) => t.kind === 'journal_set').map((t) => t.id));
    expect(setIds.size).toBeGreaterThan(0);
    for (const p of PACKS) {
      for (const l of p.levels.filter((x) => x.lookBack)) {
        expect([...l.lookBack!.templateIds, ...l.lookBack!.earlier.flatMap((t) => t.templateIds)].filter((id) => setIds.has(id)), l.id).toEqual([]);
      }
    }
  });
});

describe('levels of formats', () => {
  const SETS = TEMPLATES.filter((t) => t.kind === 'journal_set' && t.topicId === T).map((t) => t.id);
  // The formats of the Ledger stand in for any topic's.
  const FORMATS = TEMPLATES.filter((t) => (t.kind === 'account' || t.kind === 'statement') && t.topicId === 'ledger').map((t) => t.id);
  const sets = [{ title: 'Sets', description: 'd', templateIds: SETS.slice(0, 2), count: 3 }];
  const formats = [
    { title: 'Accounts', description: 'd', templateIds: FORMATS.slice(0, 2), count: 2 },
    { title: 'Nothing', description: 'd', templateIds: [], count: 2 },
    { title: 'Harder accounts', description: 'd', templateIds: FORMATS.slice(2), count: 2, passMark: 1 },
  ];

  it('come last, after the levels of sets, with ids of their own that no other level changes', () => {
    expect(FORMATS.length).toBeGreaterThanOrEqual(3);
    const before = buildLadder(T, { ...full, sets });
    const levels = buildLadder(T, { ...full, sets, formats });
    // Nothing above them moves, the levels of sets included.
    expect(levels.slice(0, before.length)).toEqual(before);
    expect(levels.slice(before.length)).toEqual([
      { id: `${T}-formats-1`, topicId: T, order: before.length, type: 'format_practice', title: 'Accounts', description: 'd', passMark: FORMAT_PASS_MARK, generate: { templateIds: FORMATS.slice(0, 2), count: 2 } },
      { id: `${T}-formats-2`, topicId: T, order: before.length + 1, type: 'format_practice', title: 'Harder accounts', description: 'd', passMark: 1, generate: { templateIds: FORMATS.slice(2), count: 2 } },
    ]);
    // An all-or-nothing answer: one format of two wholly right passes, as with sets.
    expect(FORMAT_PASS_MARK).toBe(0.5);
    // A ladder that has no sets, or loses a level above, keeps their ids.
    const shorter = buildLadder(T, { ...full, challenge: undefined, formats });
    expect(shorter.slice(-2).map((l) => l.id)).toEqual([`${T}-formats-1`, `${T}-formats-2`]);
    expect(shorter.map((l) => l.order)).toEqual(shorter.map((_, i) => i));
  });

  it('take only templates that make a format, and a format stands on no other level', () => {
    expect(() => formatLevels(T, 5, [{ title: 'x', description: 'd', templateIds: ['je-capital'], count: 2 }])).toThrow('Template je-capital does not make a format');
    expect(formatLevels(T, 5, [])).toEqual([]);
    const withFormat = (key: 'practice' | 'mixed' | 'challenge') =>
      buildLadder(T, {
        ...full,
        ...(key === 'practice' ? { practice: [{ title: 'Easy', description: 'd', templateIds: ['je-capital', FORMATS[0]], count: 6 }] } : { [key]: { title: 'x', description: 'd', count: 4, templateIds: ['je-capital', FORMATS[0]] } }),
      });
    for (const key of ['practice', 'mixed', 'challenge'] as const) expect(() => withFormat(key), key).toThrow(`Template ${FORMATS[0]} makes a format`);
  });

  it('keep their ids when quiz levels are put in above them', () => {
    const pack: TopicPack = { ...JOURNAL_ENTRIES, levels: buildLadder(T, { ...full, sets, formats }) };
    const out = withQuizLevels(pack);
    expect(out.levels.length).toBeGreaterThan(pack.levels.length);
    expect(out.levels.filter((l) => l.type === 'format_practice').map((l) => l.id)).toEqual([`${T}-formats-1`, `${T}-formats-2`]);
    expect(out.levels.map((l) => l.order)).toEqual(out.levels.map((_, i) => i));
  });

  it('are on the ladders of the Ledger and the Trial Balance, and are kept out of every other level and every Look back', () => {
    const formatIds = new Set(TEMPLATES.filter((t) => t.kind === 'account' || t.kind === 'statement').map((t) => t.id));
    for (const topicId of ['ledger', 'trial-balance']) {
      const pack = PACKS.find((p) => p.topicId === topicId)!;
      const own = pack.levels.filter((l) => l.type === 'format_practice');
      expect(own.map((l) => l.id), topicId).toEqual(own.map((_, i) => `${topicId}-formats-${i + 1}`));
      expect(own.length, topicId).toBeGreaterThanOrEqual(1);
      for (const l of own) expect(l.passMark, l.id).toBe(FORMAT_PASS_MARK);
    }
    for (const p of PACKS) {
      for (const l of p.levels) {
        const ids = [...(l.generate?.templateIds ?? []), ...(l.lookBack ? [...l.lookBack.templateIds, ...l.lookBack.earlier.flatMap((t) => t.templateIds)] : [])];
        if (l.type !== 'format_practice') expect(ids.filter((id) => formatIds.has(id)), l.id).toEqual([]);
        else expect(ids.every((id) => formatIds.has(id)), l.id).toBe(true);
      }
    }
    // Every format is on a level, so it can be reached.
    const listed = new Set(PACKS.flatMap((p) => p.levels.flatMap((l) => l.generate?.templateIds ?? [])));
    for (const id of formatIds) expect(listed.has(id), id).toBe(true);
  });
});

describe('withQuizLevels', () => {
  const base = (questionCount: number): TopicPack => ({
    ...JOURNAL_ENTRIES,
    cards: JOURNAL_ENTRIES.cards.filter((c) => c.id === 'je-card-1'),
    levels: buildLadder(T, full),
    // The questions beyond the syllabus stand on no level, and are left out here (see the test about them below).
    questions: JOURNAL_ENTRIES.questions.filter((q) => q.beyondSyllabus === undefined).slice(0, questionCount),
  });
  const listedIn = (p: TopicPack) => p.levels.flatMap((l) => l.questionIds ?? []);

  it('leaves a pack alone when it has no levels or every question is listed', () => {
    const none = { ...base(5), levels: [] };
    expect(withQuizLevels(none)).toBe(none);
    const all = base(30);
    all.levels[2] = { ...all.levels[2], questionIds: all.questions.map((q) => q.id) };
    expect(withQuizLevels(all)).toBe(all);
  });

  it('adds a few leftover questions to the last question level', () => {
    const p = base(30);
    p.questions = p.questions.filter((q) => ['je-q-002', 'je-q-007'].includes(q.id)).concat(p.questions.slice(10, 13));
    const out = withQuizLevels(p);
    expect(out.levels.map((l) => l.id)).toEqual(p.levels.map((l) => l.id));
    expect(out.levels[3].questionIds).toEqual(['je-q-007', ...p.questions.slice(2).map((q) => q.id)]);
  });

  it('puts many leftover questions on even quiz levels before the mixed level, with ids by position', () => {
    const p = base(30);
    const out = withQuizLevels(p);
    expect(out.levels.map((l) => l.type).slice(7)).toEqual([
      'complex_practice',
      'method_recognition',
      'method_recognition',
      'method_recognition',
      'mixed_practice',
      'challenge',
    ]);
    expect(out.levels.slice(8, 11).map((l) => l.questionIds?.length)).toEqual([9, 10, 9]);
    expect(out.levels.map((l) => l.id)).toEqual(out.levels.map((_, n) => `${T}-level-${n}`));
    expect(out.levels.map((l) => l.order)).toEqual(out.levels.map((_, n) => n));
    expect([...listedIn(out)].sort()).toEqual(p.questions.map((q) => q.id).sort());
    expect(validatePack(out)).toEqual([]);
  });

  it('means every authored question of every playable topic is on a level, once, but those beyond the syllabus, which are on none', () => {
    for (const p of PACKS) {
      const ids = [...listedIn(p), ...p.levels.flatMap((l) => (l.lesson ?? []).flatMap((b) => (b.type === 'check' ? [b.questionId] : [])))];
      expect(new Set(ids), p.topicId).toEqual(new Set(p.questions.filter((q) => q.beyondSyllabus === undefined).map((q) => q.id)));
    }
  });

  it('leaves a question beyond the syllabus off every level, quiz levels included', () => {
    const p = base(30);
    const beyond = { ...p.questions[29], beyondSyllabus: 'Goes further than the syllabus.' };
    const out = withQuizLevels({ ...p, questions: [...p.questions.slice(0, 29), beyond] });
    expect(listedIn(out)).not.toContain(beyond.id);
    expect(out.levels.slice(8, 11).map((l) => l.questionIds?.length)).toEqual([9, 9, 9]);
    expect(validatePack(out)).toEqual([]);
    // Listing it on a level is refused.
    const listed = { ...out, levels: out.levels.map((l, i) => (i === 8 ? { ...l, questionIds: [...(l.questionIds ?? []), beyond.id] } : l)) };
    expect(validatePack(listed)).toContain(`level ${listed.levels[8].id}: question ${beyond.id} is beyond the syllabus and stands on no level`);
  });
});

describe('withLookBackLevels', () => {
  const pack = (topicId: string, levels: TopicPack['levels']): TopicPack => ({ topicId, concepts: [], cards: [], questions: [], levels });
  const practice = (topicId: string, order: number, type: 'easy_practice' | 'mixed_practice', templateIds: string[]) => ({
    id: `${topicId}-level-${order}`, topicId, order, type, title: 't', description: 'd', generate: { templateIds, count: 3 },
  });
  const a = pack('a', [practice('a', 0, 'easy_practice', ['je-capital', 'je-drawings']), practice('a', 1, 'easy_practice', ['je-drawings', 'je-credit-sale'])]);
  const empty = pack('empty', []);
  const b = pack('b', [practice('b', 0, 'easy_practice', ['je-returns']), practice('b', 1, 'mixed_practice', ['je-trade-discount'])]);
  const c = pack('c', [{ id: 'c-level-4', topicId: 'c', order: 4, type: 'card_revision', title: 't', description: 'd', cardIds: [] }]);
  const out = withLookBackLevels([a, empty, b, c]);
  const lookBack = (p: TopicPack) => p.levels.find((l) => l.type === 'look_back');

  it('leaves the first topic and a pack without levels as they are', () => {
    expect(out[0]).toBe(a);
    expect(out[1]).toBe(empty);
  });

  it('adds the level after the last one, with an id that does not follow its position', () => {
    expect(out[2].levels.slice(0, 2)).toEqual(b.levels);
    expect(out[2].levels.map((l) => l.type)).toEqual(['easy_practice', 'mixed_practice', 'look_back']);
    expect(lookBack(out[2])).toMatchObject({ id: 'b-look-back', topicId: 'b', order: 2, title: 'Look back' });
    expect(lookBack(out[2])!.description).toMatch(/topics before it/);
    // It takes the order after the highest there is, whatever the orders are.
    expect(lookBack(out[3])).toMatchObject({ id: 'c-look-back', order: 5 });
  });

  it("takes the topic's own templates from its mixed level, or failing that from every level", () => {
    expect(lookBack(out[2])!.lookBack!.templateIds).toEqual(['je-trade-discount']);
    const d = pack('d', [practice('d', 0, 'easy_practice', ['je-returns', 'je-capital']), practice('d', 1, 'easy_practice', ['je-capital'])]);
    expect(lookBack(withLookBackLevels([a, d])[1])!.lookBack!.templateIds).toEqual(['je-returns', 'je-capital']);
    // A topic with no template of its own looks back only.
    expect(lookBack(out[3])!.lookBack!.templateIds).toEqual([]);
  });

  it('lists every earlier topic that has templates, in course order, with what its levels generate', () => {
    expect(lookBack(out[2])!.lookBack!.earlier).toEqual([{ topicId: 'a', templateIds: ['je-capital', 'je-drawings', 'je-credit-sale'] }]);
    expect(lookBack(out[3])!.lookBack!.earlier).toEqual([
      { topicId: 'a', templateIds: ['je-capital', 'je-drawings', 'je-credit-sale'] },
      { topicId: 'b', templateIds: ['je-returns', 'je-trade-discount'] },
    ]);
  });

  it("keeps what a look-back asks out of `generate`, where practice would take it as the topic's own", () => {
    for (const p of out) expect(lookBack(p)?.generate).toBeUndefined();
  });
});

describe('the Look back level of every topic', () => {
  const lookBackOf = (p: TopicPack) => p.levels.filter((l) => l.type === 'look_back');
  const ownLevels = (p: TopicPack) => p.levels.filter((l) => l.type !== 'look_back' && l.type !== 'case_study');
  // What the levels of a topic generate, but for its levels of sets and of formats (too long a question for a look-back)
  // and the templates outside the papers (`outsidePapers`), which no Look back level draws on.
  const LONG = ['set_practice', 'format_practice'];
  const generated = (p: TopicPack) => new Set(p.levels.filter((l) => !LONG.includes(l.type)).flatMap((l) => l.generate?.templateIds ?? []).filter((id) => !outsidePapers(id)));

  // A topic looks back on the topics before it in its own course. So every course is taken on its own: each of its
  // playable topics with the ones before it that have something to give (a template on a level that is not long).
  const placed = COURSES.flatMap((course) => {
    const packs = packsOf(course.id);
    // The topics before it that a learner of it also meets: not those of the other choice of Part B (courseOptions.ts).
    return packs.map((p, i) => ({ p, first: i === 0, before: packs.slice(0, i).filter((x) => generated(x).size > 0 && topicsMeet(x.topicId, p.topicId)) }));
  });
  const looking = placed.filter((x) => x.before.length > 0);

  it('covers every playable topic of every course', () => {
    expect(placed.map((x) => x.p)).toEqual(PACKS);
    expect(looking.length).toBeGreaterThan(5);
  });

  it('ends the ladder of every playable topic but the first of its course, straight after the levels the topic wrote', () => {
    for (const { p } of placed.filter((x) => x.first)) expect(lookBackOf(p), p.topicId).toEqual([]);
    // A topic with nothing before it to ask about has none either.
    for (const { p, before } of placed) expect(lookBackOf(p), p.topicId).toHaveLength(before.length > 0 ? 1 : 0);
    for (const { p } of looking) {
      const all = ownLevels(p);
      // Levels added after the syllabus check (`laterLevels`) stand last, after the sets and formats, with ids of
      // their own; the checks below are of the ladder before them.
      const isLater = (l: { id: string }) => !new RegExp(`^${p.topicId}-(level-\\d+|simulation-\\d+|journal-sets-\\d+|formats-\\d+)$`).test(l.id);
      const own = all.filter((l) => !isLater(l));
      expect(all.slice(own.length).every(isLater), p.topicId).toBe(true);
      expect(lookBackOf(p), p.topicId).toHaveLength(1);
      expect(p.levels.indexOf(lookBackOf(p)[0]), p.topicId).toBe(all.length);
      expect(lookBackOf(p)[0], p.topicId).toMatchObject({ id: `${p.topicId}-look-back`, order: all.length, title: 'Look back' });
      // A topic that has a challenge ends its own levels with one (levels of sets, and then of formats, may follow
      // it), so the look-back comes after the challenge.
      const numbered = own.filter((l) => !LONG.includes(l.type));
      if (own.some((l) => l.type === 'challenge')) expect(numbered.at(-1)!.type, p.topicId).toBe('challenge');
      const long = own.slice(numbered.length).map((l) => l.type);
      expect(long, p.topicId).toEqual([...long.filter((t) => t === 'set_practice'), ...long.filter((t) => t === 'format_practice')]);
    }
    for (const p of ALL_PACKS.filter((x) => x.levels.length === 0)) expect(lookBackOf(p)).toEqual([]);
  });

  it("mixes the topic's own mixed-level templates with those of every earlier topic, and with nothing else", () => {
    looking.forEach(({ p, before }) => {
      const { templateIds, earlier } = lookBackOf(p)[0].lookBack!;
      const mixed = new Set(p.levels.filter((l) => l.type === 'mixed_practice').flatMap((l) => l.generate!.templateIds));
      expect(new Set(templateIds), p.topicId).toEqual(mixed.size > 0 ? mixed : generated(p));
      expect(templateIds.length, p.topicId).toBeGreaterThan(0);
      // The topics before it in its course, and none of another course.
      expect(earlier.map((t) => t.topicId), p.topicId).toEqual(before.map((x) => x.topicId));
      for (const t of earlier) {
        expect(new Set(t.templateIds), `${p.topicId} from ${t.topicId}`).toEqual(generated(PACKS.find((x) => x.topicId === t.topicId)!));
      }
    });
  });

  it('asks only for real templates of the topic it names, never for a question of a case study', () => {
    const topicOf = new Map(TEMPLATES.map((t) => [t.id, t.topicId]));
    for (const { p } of looking) {
      const { templateIds, earlier } = lookBackOf(p)[0].lookBack!;
      for (const id of templateIds) expect(topicOf.get(id), id).toBe(p.topicId);
      for (const t of earlier) for (const id of t.templateIds) expect(topicOf.get(id), id).toBe(t.topicId);
      for (const id of [...templateIds, ...earlier.flatMap((t) => t.templateIds)]) expect(parseCasePartId(id), id).toBeNull();
    }
  });

  it('leaves every pack valid', () => {
    for (const p of ALL_PACKS) expect(validatePack(p), p.topicId).toEqual([]);
  });
});

describe('withCaseStudyLevels', () => {
  const tb = PACKS.find((p) => p.topicId === 'trial-balance')!;
  const stage = (over: Partial<CaseStage>): CaseStage => ({ ...CASE_STAGES.find((s) => s.topicId === tb.topicId)!, ...over });
  const someCase = { id: 'case-x', version: 1, topicId: tb.topicId, conceptId: 'x-case', difficulty: 'easy' as const, title: 'X', parts: [] };

  it("adds nothing for a stage without cases, for another topic's stage, or to a pack without levels", () => {
    expect(withCaseStudyLevels([tb], [stage({ cases: [] })])[0]).toBe(tb);
    expect(withCaseStudyLevels([tb], [stage({ topicId: 'elsewhere', cases: [someCase] })])[0]).toBe(tb);
    const unplayable = { ...tb, levels: [] };
    expect(withCaseStudyLevels([unplayable], [stage({ cases: [someCase] })])[0]).toBe(unplayable);
  });

  it("adds the level after the last one, and the stage's concept to the pack", () => {
    const books = stage({ id: 'st', conceptId: 'x-case', title: 'Books of a month', description: 'One business.', cases: [someCase, { ...someCase, id: 'case-y' }] });
    const [out] = withCaseStudyLevels([tb], [books]);
    expect(out.levels.slice(0, -1)).toEqual(tb.levels);
    expect(out.levels.at(-1)).toEqual({
      id: 'trial-balance-case-study-st',
      topicId: 'trial-balance',
      order: tb.levels.at(-1)!.order + 1,
      type: 'case_study',
      title: 'Case study: Books of a month',
      description: 'One business.',
      cases: { caseIds: ['case-x', 'case-y'] },
    });
    expect(out.concepts).toEqual([...tb.concepts, { id: 'x-case', topicId: 'trial-balance', title: 'Case study: Books of a month' }]);
    // The rest of the pack is untouched.
    expect(out.cards).toBe(tb.cards);
    expect(out.questions).toBe(tb.questions);
  });

  it('does not add a concept the pack already has', () => {
    const [out] = withCaseStudyLevels([tb], [stage({ conceptId: tb.concepts[0].id, cases: [someCase] })]);
    expect(out.concepts).toEqual(tb.concepts);
  });
});
