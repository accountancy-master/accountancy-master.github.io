import { describe, expect, it } from 'vitest';
import { PACKS, getTopicPack } from '@/content/registry';
import type { Difficulty, Question } from '@/content/types';
import { CASE_STAGES, findTemplate, isValidSeed, parseCasePartId, parseGenId } from '@/generators';
import { levelSeed } from '@/play/seed';
import { CONFIG } from './config';
import {
  MARATHON_ALL,
  MARATHON_DIFFICULTIES,
  MARATHON_SEED_BASE,
  MAX_MARATHON_RUNS,
  SEEDS_PER_RUN,
  conceptWeight,
  isMarathonDifficulty,
  marathonBatch,
  marathonDifficulty,
  marathonPool,
  marathonSeed,
  nextMarathonQuestion,
  poolIsEmpty,
  type MarathonAnswer,
  type MarathonDifficulty,
  type MarathonInput,
  type MarathonPool,
} from './marathon';
import { MOCK_SEED_BASE, MAX_PAPER_NUMBER, paperSeed, theBank } from './mockPaper';
import { availableForLearner, dailySeed, practiceSeed } from './practice';

const BATCH = CONFIG.marathon.batch;
const EVERY = CONFIG.marathon.authoredEvery;
const SEED = marathonSeed(3);

/** Everything a topic's levels list, as with "unlock all levels" on. */
const poolOf = (topicId: string): MarathonPool => {
  const pack = getTopicPack(topicId)!;
  return marathonPool([pack], availableForLearner([pack], [], [], true));
};
const LEDGER = poolOf('ledger');
const templateOf = (q: Pick<Question, 'id'>) => parseGenId(q.id)?.templateId;
const isAuthored = (q: Pick<Question, 'id'>) => parseGenId(q.id) === null;

interface Run {
  served: Question[];
  answers: MarathonAnswer[];
  /** How many questions each batch held, in order. */
  batches: number[];
}

/**
 * A run as the app plays it: a batch is made at the start and again whenever the learner has answered the last
 * question made so far. `answer` says whether the learner gets a question right.
 */
function play(
  count: number,
  answer: (q: Question, position: number) => boolean,
  opts: { pool?: MarathonPool; seed?: number; difficulty?: MarathonDifficulty; mastery?: Record<string, number>; batch?: number } = {},
): Run {
  const base = { pool: opts.pool ?? LEDGER, seed: opts.seed ?? SEED, difficulty: opts.difficulty ?? 'mixed', mastery: opts.mastery ?? {} } as const;
  const run: Run = { served: [], answers: [], batches: [] };
  while (run.answers.length < count) {
    if (run.answers.length === run.served.length) {
      const batch = marathonBatch({ ...base, served: run.served, answers: run.answers }, opts.batch);
      if (batch.length === 0) break;
      run.batches.push(batch.length);
      run.served.push(...batch);
    }
    const q = run.served[run.answers.length];
    run.answers.push({ conceptId: q.conceptId, correct: answer(q, run.answers.length) });
  }
  return run;
}

const always = (correct: boolean) => () => correct;

describe('what a marathon may serve', () => {
  it('is every template the topic\'s levels list and its authored questions, with all levels unlocked', () => {
    const pack = getTopicPack('ledger')!;
    const listed = new Set(pack.levels.flatMap((l) => l.generate?.templateIds ?? []));
    expect(new Set(LEDGER.templates.map((t) => t.id))).toEqual(listed);
    expect(LEDGER.templates.every((t) => t.topicId === 'ledger')).toBe(true);
    const asked = new Set(pack.levels.flatMap((l) => [...(l.questionIds ?? []), ...(l.lesson ?? []).flatMap((b) => (b.type === 'check' ? [b.questionId] : []))]));
    expect(new Set(LEDGER.questions.map((q) => q.id))).toEqual(asked);
  });

  it('follows the availability rule of topic practice: only what the learner has reached while levels are locked', () => {
    const pack = getTopicPack('ledger')!;
    const nothing = marathonPool([pack], availableForLearner([pack], [], [], false));
    expect(nothing).toEqual({ templates: [], questions: [] });
    expect(poolIsEmpty(nothing, 'mixed')).toBe(true);
    const level = pack.levels.find((l) => l.generate)!;
    const some = marathonPool([pack], availableForLearner([pack], [level.id], [], false));
    expect(some.templates.map((t) => t.id).sort()).toEqual([...new Set(level.generate!.templateIds)].sort());
    expect(some.templates.length).toBeLessThan(LEDGER.templates.length);
    expect(poolIsEmpty(some, 'mixed')).toBe(false);
  });

  it('never holds a question of a case study, also for a topic that ends with one', () => {
    // The stages whose topic can be played: a stage of a topic without content has nothing to run on.
    for (const stage of CASE_STAGES.filter((s) => PACKS.some((p) => p.topicId === s.topicId))) {
      const pool = poolOf(stage.topicId);
      expect(pool.templates.some((t) => parseCasePartId(t.id) !== null || t.conceptId === stage.conceptId), stage.id).toBe(false);
      expect(pool.questions.some((q) => q.context !== undefined || q.conceptId === stage.conceptId), stage.id).toBe(false);
      const run = play(60, always(true), { pool });
      expect(run.served.some((q) => q.context !== undefined || parseCasePartId(templateOf(q) ?? '') !== null), stage.id).toBe(false);
    }
  });

  it('holds practice beyond the syllabus only when the learner turns it on, and then all of it, levels or none', () => {
    const pack = getTopicPack('final-accounts-adjustments')!;
    const beyondTemplates = ['faa-int-drawings', 'faa-int-drawings-regular', 'faa-closing-capital', 'faa-entry-int-drawings'];
    const beyondQuestions = ['faa-q-013', 'faa-q-017'];
    const off = marathonPool([pack], availableForLearner([pack], [], [], true));
    expect(off.templates.some((t) => t.beyondSyllabus !== undefined)).toBe(false);
    expect(off.questions.some((q) => q.beyondSyllabus !== undefined)).toBe(false);
    const on = marathonPool([pack], availableForLearner([pack], [], [], true), true);
    expect(on.templates.filter((t) => t.beyondSyllabus !== undefined).map((t) => t.id).sort()).toEqual([...beyondTemplates].sort());
    expect(on.questions.filter((q) => q.beyondSyllabus !== undefined).map((q) => q.id)).toEqual(beyondQuestions);
    expect(on.templates.length).toBe(off.templates.length + beyondTemplates.length);
    // It stands on no level, so no level has to be passed for it; the rest still follows the levels.
    const locked = marathonPool([pack], availableForLearner([pack], [], [], false), true);
    expect(locked.templates.map((t) => t.id).sort()).toEqual([...beyondTemplates].sort());
    const run = play(40, always(true), { pool: on, difficulty: 'easy' });
    expect(run.served.length).toBeGreaterThan(0);
  });

  it('is the active topics together for a run over all topics', () => {
    const packs = PACKS.slice(0, 3);
    const pool = marathonPool(packs, availableForLearner(packs, [], [], true));
    expect(new Set(pool.templates.map((t) => t.topicId))).toEqual(new Set(packs.map((p) => p.topicId)));
    expect(new Set(pool.templates.map((t) => t.id)).size).toBe(pool.templates.length);
    expect(MARATHON_ALL).toBe('all');
    expect(PACKS.some((p) => p.topicId === MARATHON_ALL)).toBe(false);
  });

  it('knows when one difficulty has nothing to ask', () => {
    const easyOnly: MarathonPool = { templates: LEDGER.templates.filter((t) => t.difficulty === 'easy'), questions: [] };
    expect(poolIsEmpty(easyOnly, 'easy')).toBe(false);
    expect(poolIsEmpty(easyOnly, 'complex')).toBe(true);
    expect(poolIsEmpty(easyOnly, 'mixed')).toBe(false);
    expect(nextMarathonQuestion({ pool: easyOnly, seed: SEED, difficulty: 'complex', mastery: {}, served: [], answers: [] })).toBeNull();
    expect(MARATHON_DIFFICULTIES).toEqual(['mixed', 'easy', 'medium', 'complex']);
    expect(['mixed', 'easy', 'hard', '', null, undefined].map(isMarathonDifficulty)).toEqual([true, true, false, false, false, false]);
  });
});

describe('the questions of a run', () => {
  it('never repeat: no question id comes twice, however long the run', () => {
    for (const answer of [always(true), always(false), (_q: Question, i: number) => i % 3 !== 0]) {
      const run = play(400, answer);
      expect(run.served.length).toBeGreaterThanOrEqual(400);
      expect(new Set(run.served.map((q) => q.id)).size).toBe(run.served.length);
    }
  });

  it('never come from the same template twice in a row', () => {
    for (const difficulty of MARATHON_DIFFICULTIES) {
      const run = play(300, (_q, i) => i % 4 !== 0, { difficulty });
      for (let i = 1; i < run.served.length; i++) {
        const [before, now] = [templateOf(run.served[i - 1]), templateOf(run.served[i])];
        if (before !== undefined && now !== undefined) expect(now, `${difficulty} position ${i}`).not.toBe(before);
      }
    }
  });

  it('may only repeat a template when the topic has no other', () => {
    const one: MarathonPool = { templates: LEDGER.templates.slice(0, 1), questions: [] };
    const run = play(30, always(true), { pool: one });
    expect(new Set(run.served.map(templateOf))).toEqual(new Set([one.templates[0].id]));
    expect(new Set(run.served.map((q) => q.id)).size).toBe(30);
    // With two, they alternate.
    const two: MarathonPool = { templates: LEDGER.templates.filter((t) => t.difficulty === 'easy').slice(0, 2), questions: [] };
    const alternating = play(20, always(false), { pool: two }).served.map(templateOf);
    for (let i = 1; i < alternating.length; i++) expect(alternating[i]).not.toBe(alternating[i - 1]);
  });

  it('take the seed of their position in the run, so they are remade from their ids', () => {
    const run = play(40, always(true));
    run.served.forEach((q, position) => {
      const gen = parseGenId(q.id);
      if (gen) expect(gen.seed, `position ${position}`).toBe(SEED + position);
    });
  });

  it('mix an authored question in now and then, each at most once in a run', () => {
    const run = play(600, always(true));
    const authored = run.served.filter(isAuthored);
    expect(new Set(authored.map((q) => q.id)).size).toBe(authored.length);
    expect(authored.every((q) => LEDGER.questions.includes(q))).toBe(true);
    // While the topic has one left, every fifth question is authored; the others are generated.
    const left = Math.min(LEDGER.questions.length, Math.floor(run.served.length / EVERY));
    expect(authored).toHaveLength(left);
    run.served.slice(0, left * EVERY).forEach((q, position) => {
      expect(isAuthored(q), `position ${position}`).toBe((position + 1) % EVERY === 0);
    });
    // Once they have all been asked, the run goes on with generated questions alone.
    expect(run.served.slice(LEDGER.questions.length * EVERY).every((q) => !isAuthored(q))).toBe(true);
    expect(LEDGER.questions.length * EVERY).toBeLessThan(run.served.length);
  });

  it('ask authored questions only, each once, when a topic has no template, and then end', () => {
    const pool: MarathonPool = { templates: [], questions: LEDGER.questions.slice(0, 7) };
    const run = play(50, always(true), { pool });
    expect(run.served.map((q) => q.id).sort()).toEqual(pool.questions.map((q) => q.id).sort());
    expect(marathonBatch({ pool, seed: SEED, difficulty: 'mixed', mastery: {}, served: run.served, answers: run.answers })).toEqual([]);
  });

  it('are the same for the same seed, position and answers, and others for another seed', () => {
    const input: MarathonInput = { pool: LEDGER, seed: SEED, difficulty: 'mixed', mastery: { [LEDGER.templates[0].conceptId]: 40 }, served: [], answers: [] };
    expect(marathonBatch(input)).toEqual(marathonBatch({ ...input }));
    expect(play(60, (_q, i) => i % 2 === 0)).toEqual(play(60, (_q, i) => i % 2 === 0));
    expect(marathonBatch({ ...input, seed: marathonSeed(4) }).map((q) => q.id)).not.toEqual(marathonBatch(input).map((q) => q.id));
    // What was answered changes what comes next: the same position after other answers is another question.
    const first = marathonBatch(input);
    const answersOf = (correct: boolean): MarathonAnswer[] => first.map((q) => ({ conceptId: q.conceptId, correct }));
    const afterRight = nextMarathonQuestion({ ...input, served: first, answers: answersOf(true) })!;
    const afterWrong = nextMarathonQuestion({ ...input, served: first, answers: answersOf(false) })!;
    expect(afterRight.difficulty).not.toBe(afterWrong.difficulty);
  });
});

describe('the difficulty of a mixed run', () => {
  const answers = (pattern: string) => [...pattern].map((c) => ({ correct: c === '1' }));

  it('starts easy, goes up a step for every two right in a row, and down a step for every miss', () => {
    expect(CONFIG.marathon.stepUpAfter).toBe(2);
    const steps: [string, Difficulty][] = [
      ['', 'easy'],
      ['1', 'easy'],
      ['11', 'medium'],
      ['111', 'medium'],
      ['1111', 'complex'],
      ['111111', 'complex'],
      ['11110', 'medium'],
      ['111100', 'easy'],
      ['1111000', 'easy'],
      ['0', 'easy'],
      ['101010', 'easy'],
      ['110', 'easy'],
      ['11011', 'medium'],
      ['1111011', 'complex'],
    ];
    for (const [pattern, expected] of steps) expect(marathonDifficulty(answers(pattern)), pattern || 'no answers').toBe(expected);
  });

  it('moves both ways in a run: harder as the answers come right, easier again after misses', () => {
    // Twenty right, then twenty wrong. A batch is made from the answers before it, so the questions follow a batch behind.
    const run = play(40, (_q, i) => i < 20, { batch: 1 });
    const generated = (from: number, to: number) => run.served.slice(from, to).filter((q) => !isAuthored(q));
    expect(run.served[0].difficulty).toBe('easy');
    expect(run.served[1].difficulty).toBe('easy');
    expect(run.served[2].difficulty).toBe('medium');
    expect(run.served[4].difficulty === 'complex' || isAuthored(run.served[4])).toBe(true);
    expect(generated(5, 21).every((q) => q.difficulty === 'complex')).toBe(true);
    expect(run.served[21].difficulty).toBe('medium');
    expect(generated(22, 40).every((q) => q.difficulty === 'easy')).toBe(true);
    // The difficulty of every generated question is the one its answers so far call for.
    run.served.forEach((q, i) => {
      if (!isAuthored(q)) expect(q.difficulty, `position ${i}`).toBe(marathonDifficulty(run.answers.slice(0, i)));
    });
  });

  it('adapts a batch at a time when batches are longer', () => {
    const run = play(BATCH * 3, always(true));
    expect(run.batches).toEqual([BATCH, BATCH, BATCH]);
    // The first batch is made before any answer: all easy. The second after five right: complex.
    expect(run.served.slice(0, BATCH).filter((q) => !isAuthored(q)).every((q) => q.difficulty === 'easy')).toBe(true);
    expect(run.served.slice(BATCH, 2 * BATCH).filter((q) => !isAuthored(q)).every((q) => q.difficulty === 'complex')).toBe(true);
  });

  it('is not used when one difficulty was chosen: every question is of it', () => {
    for (const difficulty of ['easy', 'medium', 'complex'] as const) {
      const run = play(80, (_q, i) => i % 2 === 0, { difficulty });
      expect(new Set(run.served.map((q) => q.difficulty)), difficulty).toEqual(new Set([difficulty]));
    }
  });

  it('takes the nearest difficulty the topic has when it has none of the one called for', () => {
    const noMedium: MarathonPool = { templates: LEDGER.templates.filter((t) => t.difficulty !== 'medium'), questions: [] };
    const run = play(30, always(true), { pool: noMedium, batch: 1 });
    // Two right call for medium: the easier neighbour stands in, and complex follows when it is called for.
    expect(run.served[2].difficulty).toBe('easy');
    expect(run.served[4].difficulty).toBe('complex');
  });
});

describe('the concepts of a run', () => {
  const concepts = [...new Set(LEDGER.templates.filter((t) => t.difficulty === 'easy').map((t) => t.conceptId))];

  it('are weighted by mastery, by the misses of the run and by its correct answers, never down to nothing', () => {
    const { missBoost, correctRelief, floor } = CONFIG.marathon.weight;
    expect(conceptWeight('c', {}, [])).toBe(101);
    expect(conceptWeight('c', { c: 100 }, [])).toBe(1 < floor ? floor : 1);
    expect(conceptWeight('c', { c: 60 }, [])).toBe(41);
    expect(conceptWeight('c', { c: 60 }, [{ conceptId: 'c', correct: false }, { conceptId: 'd', correct: false }])).toBe(41 + missBoost);
    expect(conceptWeight('c', { c: 60 }, [{ conceptId: 'c', correct: true }])).toBe(41 - correctRelief);
    expect(conceptWeight('c', { c: 100 }, Array.from({ length: 20 }, () => ({ conceptId: 'c', correct: true })))).toBe(floor);
    expect(floor).toBeGreaterThan(0);
  });

  it('lean towards the concept the learner knows least', () => {
    expect(concepts.length).toBeGreaterThan(2);
    const [weak] = concepts;
    const pool: MarathonPool = { templates: LEDGER.templates, questions: [] };
    // The first question of many runs (so nothing of the run itself weighs in yet): how often it is on that concept.
    const share = (mastery: Record<string, number>) => {
      let hits = 0;
      const RUNS = 400;
      for (let n = 0; n < RUNS; n++) {
        const q = nextMarathonQuestion({ pool, seed: marathonSeed(n), difficulty: 'mixed', mastery, served: [], answers: [] })!;
        if (q.conceptId === weak) hits++;
      }
      return hits / RUNS;
    };
    // Every concept mastered but one, against nothing known of any.
    const mastered = Object.fromEntries(LEDGER.templates.map((t) => [t.conceptId, t.conceptId === weak ? 0 : 95]));
    const even = share({});
    const leaning = share(mastered);
    expect(even).toBeGreaterThan(0);
    expect(even).toBeLessThan(0.5);
    expect(leaning).toBeGreaterThan(2 * even);
    expect(leaning).toBeGreaterThan(0.6);
    // And the other way round: a concept the learner has mastered comes up less than the others, but still comes up.
    const known = share(Object.fromEntries(LEDGER.templates.map((t) => [t.conceptId, t.conceptId === weak ? 95 : 0])));
    expect(known).toBeLessThan(even);
    expect(play(300, always(false), { mastery: mastered, pool }).served.some((q) => q.conceptId !== weak)).toBe(true);
  });

  it('lean towards a concept missed in the run itself', () => {
    const [target] = concepts;
    const pool: MarathonPool = { templates: LEDGER.templates, questions: [] };
    const count = (answer: (q: Question) => boolean) => play(300, answer, { pool, difficulty: 'easy' }).served.filter((q) => q.conceptId === target).length;
    // Missing only that concept brings it back more often than getting everything right.
    expect(count((q) => q.conceptId !== target)).toBeGreaterThan(1.5 * count(() => true));
  });
});

describe('batches', () => {
  it('hold the next few questions and no more: a run is never built ahead of the learner', () => {
    expect(BATCH).toBeGreaterThan(1);
    const input: MarathonInput = { pool: LEDGER, seed: SEED, difficulty: 'mixed', mastery: {}, served: [], answers: [] };
    expect(marathonBatch(input)).toHaveLength(BATCH);
    expect(marathonBatch(input, 3)).toHaveLength(3);
    expect(marathonBatch(input, 0)).toEqual([]);
    // After 23 answers the run has made 25 questions: five batches, the last made at the 20th answer.
    const run = play(23, always(true));
    expect(run.batches).toEqual([BATCH, BATCH, BATCH, BATCH, BATCH]);
    expect(run.served).toHaveLength(25);
  });

  it('are the questions one by one: each chosen with the ones before it in the batch already served', () => {
    const input: MarathonInput = { pool: LEDGER, seed: SEED, difficulty: 'mixed', mastery: {}, served: [], answers: [] };
    const batch = marathonBatch(input);
    const single: Question[] = [];
    for (let i = 0; i < BATCH; i++) single.push(nextMarathonQuestion({ ...input, served: single })!);
    expect(batch).toEqual(single);
    // A following batch continues from what was served, at the next positions.
    const answers = batch.map((q) => ({ conceptId: q.conceptId, correct: true }));
    const second = marathonBatch({ ...input, served: batch, answers });
    expect(second.flatMap((q) => (parseGenId(q.id) ? [parseGenId(q.id)!.seed - SEED] : []))).toEqual(
      second.flatMap((q, i) => (parseGenId(q.id) ? [BATCH + i] : [])),
    );
    expect(second.some((q) => batch.some((b) => b.id === q.id))).toBe(false);
  });

  it('come out short, then empty, when the scope runs out', () => {
    const pool: MarathonPool = { templates: [], questions: LEDGER.questions.slice(0, BATCH + 2) };
    const input: MarathonInput = { pool, seed: SEED, difficulty: 'mixed', mastery: {}, served: [], answers: [] };
    const first = marathonBatch(input);
    expect(first).toHaveLength(BATCH);
    const second = marathonBatch({ ...input, served: first });
    expect(second).toHaveLength(2);
    expect(marathonBatch({ ...input, served: [...first, ...second] })).toEqual([]);
  });
});

describe('the seeds of a run', () => {
  it('lie above every other kind of session, inside 32 bits', () => {
    expect(marathonSeed(0)).toBe(MARATHON_SEED_BASE);
    expect(levelSeed(999, 9999) + 99).toBeLessThan(MARATHON_SEED_BASE);
    for (const kind of ['smart', 'fresh', 'mistakes', 'cards', 'daily_challenge', 'daily_mission', 'case'] as const) {
      expect(practiceSeed(kind, 9999) + 99, kind).toBeLessThan(MARATHON_SEED_BASE);
    }
    expect(dailySeed('3999-12-31') + 99).toBeLessThan(MARATHON_SEED_BASE);
    expect(MOCK_SEED_BASE).toBeLessThan(MARATHON_SEED_BASE);
    expect(paperSeed({ kind: 'topic', topicId: theBank().topics.at(-1)!.id, number: MAX_PAPER_NUMBER }) + 99).toBeLessThan(MARATHON_SEED_BASE);
    const last = marathonSeed(MAX_MARATHON_RUNS - 1) + SEEDS_PER_RUN - 1;
    expect(last).toBeLessThan(2 ** 32);
    expect(isValidSeed(last)).toBe(true);
  });

  it('give each run a block of its own', () => {
    expect(marathonSeed(1) - marathonSeed(0)).toBe(SEEDS_PER_RUN);
    expect(new Set(Array.from({ length: 500 }, (_, n) => marathonSeed(n))).size).toBe(500);
    for (const bad of [-1, 1.5, MAX_MARATHON_RUNS, Number.NaN]) expect(() => marathonSeed(bad), String(bad)).toThrow();
    // Two runs never share a question.
    const a = play(100, always(true), { seed: marathonSeed(0) }).served.filter((q) => !isAuthored(q)).map((q) => q.id);
    const b = play(100, always(true), { seed: marathonSeed(1) }).served.filter((q) => !isAuthored(q)).map((q) => q.id);
    expect(a.filter((id) => b.includes(id))).toEqual([]);
  });

  it('make questions of templates that exist', () => {
    for (const q of play(50, always(true)).served) {
      const id = templateOf(q);
      if (id !== undefined) expect(findTemplate(id), q.id).toBeDefined();
    }
  });
});
