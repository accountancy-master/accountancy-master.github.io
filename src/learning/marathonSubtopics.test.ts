import { describe, expect, it } from 'vitest';
import { PACKS, getTopicPack, templatesForConcept } from '@/content/registry';
import type { Question } from '@/content/types';
import { CASE_STAGES, parseGenId } from '@/generators';
import { marathonBatch, marathonPool, marathonSeed, nextMarathonQuestion, poolIsEmpty, type MarathonAnswer, type MarathonPool } from './marathon';
import {
  MARATHON_SUBTOPICS_KEY,
  SUBTOPICS_PARAM,
  chosenSubtopics,
  marathonSubtopics,
  narrowPool,
  subtopicChoicesFromStored,
  subtopicChoicesToStored,
  subtopicsFromQuery,
  subtopicsOff,
  subtopicsToQuery,
  tickedSubtopics,
  withSubtopicChoice,
  type MarathonSubtopic,
} from './marathonSubtopics';
import { availableForLearner } from './practice';

const SEED = marathonSeed(3);
const TOPIC = 'ledger';
const PACK = getTopicPack(TOPIC)!;
/** With "unlock all levels" on: everything the topic's levels list. */
const OPEN = availableForLearner([PACK], [], [], true);
const LOCKED = availableForLearner([PACK], [], [], false);
const POOL = marathonPool([PACK], OPEN);
const SUBTOPICS = marathonSubtopics(PACK, OPEN);
const IDS = SUBTOPICS.map((s) => s.id);

/** A run as the app plays it (see marathon.test.ts): a batch at the start and whenever the last question made is answered. */
function play(count: number, pool: MarathonPool, answer: (q: Question, position: number) => boolean = () => true, mastery: Record<string, number> = {}) {
  const served: Question[] = [];
  const answers: MarathonAnswer[] = [];
  while (answers.length < count) {
    if (answers.length === served.length) {
      const batch = marathonBatch({ pool, seed: SEED, difficulty: 'mixed', mastery, served, answers });
      if (batch.length === 0) break;
      served.push(...batch);
    }
    const q = served[answers.length];
    answers.push({ conceptId: q.conceptId, correct: answer(q, answers.length) });
  }
  return served;
}

describe('the subtopics a marathon offers', () => {
  it('are the concepts of the topic in pack order, with their titles', () => {
    expect(SUBTOPICS.map((s) => [s.id, s.title])).toEqual(PACK.concepts.map((c) => [c.id, c.title]));
    expect(SUBTOPICS.length).toBeGreaterThan(2);
  });

  it('count the generators and authored questions a run is made from', () => {
    for (const s of SUBTOPICS) {
      const generators = POOL.templates.filter((t) => t.conceptId === s.id).length;
      const questions = POOL.questions.filter((q) => q.conceptId === s.id).length;
      expect(s.generators, s.id).toEqual({ open: generators, all: generators });
      expect(s.questions, s.id).toEqual({ open: questions, all: questions });
      expect(s.ready, s.id).toBe(generators + questions > 0);
    }
    // Together they are the whole pool: nothing a run serves is outside the subtopics offered.
    expect(SUBTOPICS.reduce((n, s) => n + s.generators.open, 0)).toBe(POOL.templates.length);
    expect(SUBTOPICS.reduce((n, s) => n + s.questions.open, 0)).toBe(POOL.questions.length);
    // A generator is counted only when a level lists it, never just because the concept has it.
    for (const s of SUBTOPICS) expect(s.generators.all, s.id).toBeLessThanOrEqual(templatesForConcept(s.id).length);
  });

  it('follow the availability rule: with levels locked a subtopic is shown, counted in full, and cannot be ticked', () => {
    const locked = marathonSubtopics(PACK, LOCKED);
    expect(locked.map((s) => s.id)).toEqual(IDS);
    expect(locked.every((s) => !s.ready && s.generators.open === 0 && s.questions.open === 0)).toBe(true);
    expect(locked.map((s) => [s.generators.all, s.questions.all])).toEqual(SUBTOPICS.map((s) => [s.generators.all, s.questions.all]));
    expect(tickedSubtopics(locked, [])).toEqual([]);

    // One level passed opens what that level lists, and only the subtopics it belongs to.
    const level = PACK.levels.find((l) => l.generate)!;
    const some = marathonSubtopics(PACK, availableForLearner([PACK], [level.id], [], false));
    const opened = new Set(marathonPool([PACK], availableForLearner([PACK], [level.id], [], false)).templates.map((t) => t.conceptId));
    expect(some.filter((s) => s.generators.open > 0).map((s) => s.id)).toEqual(IDS.filter((id) => opened.has(id)));
    expect(some.some((s) => s.ready)).toBe(true);
    expect(some.some((s) => !s.ready)).toBe(true);
    for (const s of some) expect(s.generators.open, s.id).toBeLessThanOrEqual(s.generators.all);
    // "Unlock all levels" opens every one of them.
    expect(SUBTOPICS.every((s) => s.ready)).toBe(true);
  });

  it('never include the concept of a case study', () => {
    // A stage adds its concept to its topic once it has cases.
    const stages = CASE_STAGES.filter((s) => s.cases.length > 0);
    expect(stages.length).toBeGreaterThan(0);
    for (const stage of stages) {
      const pack = getTopicPack(stage.topicId)!;
      expect(pack.concepts.some((c) => c.id === stage.conceptId), stage.id).toBe(true);
      const offered = marathonSubtopics(pack, availableForLearner([pack], [], [], true));
      expect(offered.some((s) => s.id === stage.conceptId), stage.id).toBe(false);
      // Every concept of the pack but those of the stages that have cases: one for each stage the topic closes.
      const ofStages = stages.filter((s) => s.topicId === stage.topicId).length;
      expect(offered).toHaveLength(pack.concepts.length - ofStages);
    }
  });
});

describe('a run over the ticked subtopics', () => {
  it('serves questions of the ticked subtopics only, generated and authored', () => {
    for (const ticked of [IDS.slice(0, 1), IDS.slice(1, 4), IDS.filter((_, i) => i % 2 === 0), IDS.slice(1)]) {
      const chosen = chosenSubtopics(SUBTOPICS, ticked);
      expect(chosen).toEqual(ticked);
      const pool = narrowPool(POOL, chosen);
      expect(pool.templates.length).toBeGreaterThan(0);
      expect(pool.templates.every((t) => ticked.includes(t.conceptId))).toBe(true);
      expect(pool.questions.every((q) => ticked.includes(q.conceptId))).toBe(true);
      const served = play(250, pool, (_q, i) => i % 3 !== 0);
      expect(served.length).toBeGreaterThanOrEqual(250);
      expect(served.filter((q) => !ticked.includes(q.conceptId))).toEqual([]);
      expect(served.some((q) => parseGenId(q.id) === null)).toBe(true);
      expect(served.some((q) => parseGenId(q.id) !== null)).toBe(true);
      // Every ticked subtopic gets its turn.
      expect(new Set(served.map((q) => q.conceptId))).toEqual(new Set(ticked));
    }
  });

  it('is the run of today when every subtopic is ticked: the same pool, so the same questions for the same seed', () => {
    for (const asked of [null, IDS, [...IDS].reverse(), [...IDS, 'no-such-subtopic']]) {
      const chosen = chosenSubtopics(SUBTOPICS, asked);
      expect(chosen).toBeNull();
      expect(narrowPool(POOL, chosen)).toBe(POOL);
    }
    // Narrowing to every concept by name changes nothing either.
    const named = narrowPool(POOL, IDS);
    expect(named).toEqual(POOL);
    const answer = (_q: Question, i: number) => i % 4 !== 0;
    expect(play(120, named, answer).map((q) => q.id)).toEqual(play(120, POOL, answer).map((q) => q.id));
  });

  it('is the whole topic for every topic there is, when nothing is left out', () => {
    for (const pack of PACKS) {
      const available = availableForLearner([pack], [], [], true);
      const pool = marathonPool([pack], available);
      const offered = marathonSubtopics(pack, available);
      const ticked = tickedSubtopics(offered, []);
      expect(subtopicsToQuery(offered, ticked), pack.topicId).toBeNull();
      // The subtopics offered hold everything the pool does: a run over all of them leaves nothing out.
      expect(narrowPool(pool, ticked), pack.topicId).toEqual(pool);
    }
  });

  it('still leans towards the subtopic the learner knows least, among the ticked ones', () => {
    const ticked = IDS.slice(0, 4);
    const [weak] = ticked;
    const pool = narrowPool(POOL, chosenSubtopics(SUBTOPICS, ticked));
    // The first question of many runs: how often it is on that subtopic.
    const share = (mastery: Record<string, number>) => {
      let hits = 0;
      const RUNS = 400;
      for (let n = 0; n < RUNS; n++) {
        const q = nextMarathonQuestion({ pool, seed: marathonSeed(n), difficulty: 'mixed', mastery, served: [], answers: [] })!;
        expect(ticked).toContain(q.conceptId);
        if (q.conceptId === weak) hits++;
      }
      return hits / RUNS;
    };
    const even = share({});
    // Mastery of an unticked subtopic, however low, pulls nothing: only the ticked ones are weighed.
    const leaning = share(Object.fromEntries(IDS.map((id) => [id, id === weak || !ticked.includes(id) ? 0 : 95])));
    expect(even).toBeGreaterThan(0);
    expect(leaning).toBeGreaterThan(2 * even);
    expect(leaning).toBeGreaterThan(0.6);
    // And a miss in the run brings its subtopic back more often than answering everything right.
    const count = (answer: (q: Question) => boolean) => play(300, pool, answer).filter((q) => q.conceptId === weak).length;
    expect(count((q) => q.conceptId !== weak)).toBeGreaterThan(1.2 * count(() => true));
  });

  it('never has an empty pool: a choice that names nothing the learner can be served is the whole topic', () => {
    for (const asked of [[], ['no-such-subtopic'], ['', ' '], CASE_STAGES.map((s) => s.conceptId)]) {
      expect(chosenSubtopics(SUBTOPICS, asked), JSON.stringify(asked)).toBeNull();
    }
    // Subtopics that are locked for this learner are dropped from what was asked for.
    const level = PACK.levels.find((l) => l.generate)!;
    const available = availableForLearner([PACK], [level.id], [], false);
    const offered = marathonSubtopics(PACK, available);
    const pool = marathonPool([PACK], available);
    const ready = offered.filter((s) => s.ready).map((s) => s.id);
    const locked = offered.filter((s) => !s.ready).map((s) => s.id);
    expect(chosenSubtopics(offered, locked)).toBeNull();
    expect(chosenSubtopics(offered, [...locked, ...ready])).toBeNull();
    if (ready.length > 1) expect(chosenSubtopics(offered, [...locked, ready[0]])).toEqual([ready[0]]);
    // Whatever is asked for, of any topic, locked or open: when the topic has something to serve, so has the run.
    const subsets = (ids: string[]) => [[], ids, ...ids.map((id) => [id]), ...ids.map((id) => ids.filter((x) => x !== id)), ['no-such-subtopic', ...ids.slice(0, 1)]];
    for (const pack of PACKS) {
      for (const unlockAll of [true, false]) {
        const passed = unlockAll ? [] : pack.levels.slice(0, 3).map((l) => l.id);
        const forLearner = availableForLearner([pack], passed, [], unlockAll);
        const whole = marathonPool([pack], forLearner);
        const list = marathonSubtopics(pack, forLearner);
        for (const asked of subsets(pack.concepts.map((c) => c.id))) {
          const narrowed = narrowPool(whole, chosenSubtopics(list, asked));
          expect(poolIsEmpty(narrowed, 'mixed'), `${pack.topicId} ${asked.join(',')}`).toBe(poolIsEmpty(whole, 'mixed'));
        }
      }
    }
    expect(poolIsEmpty(narrowPool(pool, chosenSubtopics(offered, [])), 'mixed')).toBe(false);
  });
});

describe('the choice in the address of a run', () => {
  it('names the ticked subtopics, and is left out when all of them are ticked or none is', () => {
    expect(SUBTOPICS_PARAM).toBe('subtopics');
    expect(subtopicsToQuery(SUBTOPICS, IDS)).toBeNull();
    expect(subtopicsToQuery(SUBTOPICS, [])).toBeNull();
    expect(subtopicsToQuery(SUBTOPICS, [IDS[2], IDS[0]])).toBe(`${IDS[0]},${IDS[2]}`);
    // A subtopic that cannot be ticked is never named, and does not count as one left out.
    const some: MarathonSubtopic[] = SUBTOPICS.map((s, i) => (i === 0 ? { ...s, ready: false } : s));
    expect(subtopicsToQuery(some, IDS)).toBeNull();
    expect(subtopicsToQuery(some, IDS.slice(1))).toBeNull();
    expect(subtopicsToQuery(some, IDS.slice(0, 3))).toBe(`${IDS[1]},${IDS[2]}`);
  });

  it('is read back as it was written', () => {
    expect(subtopicsFromQuery(null)).toBeNull();
    expect(subtopicsFromQuery(undefined)).toBeNull();
    expect(subtopicsFromQuery('')).toEqual([]);
    expect(subtopicsFromQuery('a,,b,')).toEqual(['a', 'b']);
    for (const ticked of [IDS.slice(0, 1), IDS.slice(2, 5), IDS.slice(1)]) {
      const value = subtopicsToQuery(SUBTOPICS, ticked)!;
      // What the browser hands back for `?subtopics=<value>`.
      const read = new URLSearchParams(`${SUBTOPICS_PARAM}=${value}`).get(SUBTOPICS_PARAM);
      expect(chosenSubtopics(SUBTOPICS, subtopicsFromQuery(read))).toEqual(ticked);
    }
  });
});

describe('the remembered choice', () => {
  it('is kept under its own key, by topic, as the subtopics left out', () => {
    expect(MARATHON_SUBTOPICS_KEY).toBe('am.marathonSubtopics');
    let choices = subtopicChoicesFromStored(null);
    expect(subtopicsOff(choices, TOPIC)).toEqual([]);
    choices = withSubtopicChoice(choices, TOPIC, [IDS[1], IDS[3]]);
    choices = withSubtopicChoice(choices, 'cash-book', ['cb-petty']);
    const stored = subtopicChoicesToStored(choices);
    expect(JSON.parse(stored)).toEqual({ [TOPIC]: [IDS[1], IDS[3]], 'cash-book': ['cb-petty'] });
    const back = subtopicChoicesFromStored(stored);
    expect(subtopicsOff(back, TOPIC)).toEqual([IDS[1], IDS[3]]);
    expect(subtopicsOff(back, 'cash-book')).toEqual(['cb-petty']);
    expect(subtopicsOff(back, 'depreciation')).toEqual([]);
    expect(tickedSubtopics(SUBTOPICS, subtopicsOff(back, TOPIC))).toEqual(IDS.filter((id) => id !== IDS[1] && id !== IDS[3]));
  });

  it('is per topic: setting one topic leaves the others, and leaving nothing out forgets the topic', () => {
    const two = withSubtopicChoice(withSubtopicChoice({}, TOPIC, [IDS[0]]), 'cash-book', ['cb-petty', 'cb-petty']);
    expect(subtopicsOff(two, 'cash-book')).toEqual(['cb-petty']);
    const changed = withSubtopicChoice(two, TOPIC, [IDS[2]]);
    expect(subtopicsOff(changed, TOPIC)).toEqual([IDS[2]]);
    expect(subtopicsOff(changed, 'cash-book')).toEqual(['cb-petty']);
    expect(subtopicsOff(two, TOPIC)).toEqual([IDS[0]]);
    const cleared = withSubtopicChoice(changed, TOPIC, []);
    expect(subtopicChoicesToStored(cleared)).toBe('{"cash-book":["cb-petty"]}');
  });

  it('starts with everything ticked, and a subtopic that is new since the choice was saved starts ticked', () => {
    expect(tickedSubtopics(SUBTOPICS, [])).toEqual(IDS);
    const stored = subtopicChoicesToStored(withSubtopicChoice({}, TOPIC, [IDS[0], 'a-subtopic-since-removed']));
    const added: MarathonSubtopic = { id: 'led-new', title: 'A new subtopic', generators: { open: 2, all: 2 }, questions: { open: 0, all: 0 }, ready: true };
    const ticked = tickedSubtopics([...SUBTOPICS, added], subtopicsOff(subtopicChoicesFromStored(stored), TOPIC));
    expect(ticked).toEqual([...IDS.slice(1), 'led-new']);
    // One that cannot be ticked is never ticked, whatever was saved.
    const locked: MarathonSubtopic = { ...added, id: 'led-locked', generators: { open: 0, all: 2 }, ready: false };
    expect(tickedSubtopics([...SUBTOPICS, locked], [])).toEqual(IDS);
  });

  it('reads anything that is not a saved choice as no choice', () => {
    for (const raw of [null, undefined, '', 'yes', '{', '[]', '"x"', '3', 'null', '{"ledger":"led-posting"}', '{"ledger":[1,null,""]}', '{"ledger":{}}']) {
      expect(subtopicsOff(subtopicChoicesFromStored(raw), TOPIC), String(raw)).toEqual([]);
    }
    const mixed = subtopicChoicesFromStored('{"ledger":["a",2,"a","b"],"cash-book":7,"__proto__":["x"]}');
    expect(subtopicsOff(mixed, TOPIC)).toEqual(['a', 'b']);
    expect(subtopicsOff(mixed, 'cash-book')).toEqual([]);
    expect(subtopicsOff(mixed, 'toString')).toEqual([]);
    expect(subtopicsOff(subtopicChoicesFromStored('{}'), 'constructor')).toEqual([]);
  });
});
