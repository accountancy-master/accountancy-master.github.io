import { describe, expect, it, vi } from 'vitest';
import { PACKS, getTopicPack } from '@/content/registry';
import { CASE_STAGES, generateCaseQuestions, parseCasePartId, parseGenId, type CaseStage } from '@/generators';
import { levelSeed, practicePlayCount, seedOrder } from '@/play/seed';
import { SAMPLE_CASE, SECOND_SAMPLE_CASE } from '@/testing/sampleCase';
import {
  buildCaseSession,
  casePlays,
  caseSeed,
  nextCase,
  nextMixedCase,
  stageRecord,
  stagesWithCases,
} from './caseStudies';
import { dailySeed, practiceSeed } from './practice';

// The first stage is given the two sample cases, so these run on registered cases whatever the real stages hold.
// The stand-in keeps the module's other exports: other stages import helpers from it.
vi.mock('@/generators/cases/accounting-cycle', async (importOriginal) => {
  const { SAMPLE_CASE, SECOND_SAMPLE_CASE } = await import('@/testing/sampleCase');
  return { ...(await importOriginal<object>()), default: [SAMPLE_CASE, SECOND_SAMPLE_CASE] };
});

const real = CASE_STAGES[0];
/** Two stages of one case each, and one with none, built on the registered samples. */
const first: CaseStage = { ...real, id: 'first', cases: [SAMPLE_CASE] };
const second: CaseStage = { ...real, id: 'second', cases: [SECOND_SAMPLE_CASE] };
const empty: CaseStage = { ...real, id: 'empty', cases: [] };

interface Attempt {
  questionId: string;
  sessionId: string;
  sessionKind?: string;
  correct: boolean;
}

/** The attempts of one play of a case: `right` of its questions answered correctly, `answered` of them answered at all. */
function playOf(caseId: string, sessionId: string, opts: { kind?: string; right?: number; answered?: number; seed?: number } = {}): Attempt[] {
  const questions = generateCaseQuestions(caseId, opts.seed ?? caseSeed(0));
  return questions
    .slice(0, opts.answered ?? questions.length)
    .map((q, i) => ({ questionId: q.id, sessionId, sessionKind: opts.kind ?? 'case', correct: i < (opts.right ?? questions.length) }));
}

describe('the seeds of cases played from the Case studies screen', () => {
  it('are valid, one per play, and never one a level uses (so never the one of the topic\'s own Case study level)', () => {
    const seeds = Array.from({ length: 300 }, (_, n) => caseSeed(n));
    expect(new Set(seeds).size).toBe(seeds.length);
    for (const stage of stagesWithCases()) {
      const pack = getTopicPack(stage.topicId)!;
      const level = pack.levels.find((l) => l.type === 'case_study' && l.cases?.caseIds.includes(stage.cases[0].id))!;
      const order = seedOrder(level, PACKS.indexOf(pack));
      // The highest seed any play of the level can take is below the lowest seed of this screen.
      expect(levelSeed(order, 9999) + 99, stage.id).toBeLessThan(caseSeed(0));
    }
    // Every level seed there can be lies below, and the other kinds of practice and the daily challenge elsewhere.
    expect(levelSeed(999, 9999) + 99).toBeLessThan(caseSeed(0));
    expect(caseSeed(9999) + 99).toBeLessThan(dailySeed('2020-01-01'));
    for (const kind of ['smart', 'fresh', 'mistakes', 'cards', 'daily_challenge', 'daily_mission'] as const) {
      expect(Math.abs(practiceSeed(kind, 0) - caseSeed(0)), kind).toBeGreaterThanOrEqual(10_000 * 100);
    }
    expect(() => caseSeed(-1)).toThrow();
  });

  it('give one whole case, in order, regenerated from its ids', () => {
    const seed = caseSeed(4);
    const items = buildCaseSession(SAMPLE_CASE.id, seed);
    expect(items).toHaveLength(SAMPLE_CASE.parts.length);
    expect(items.map((i) => (i.kind === 'question' ? i.question.id : ''))).toEqual(
      SAMPLE_CASE.parts.map((_, i) => `gen:${SAMPLE_CASE.id}~${i + 1}:${SAMPLE_CASE.version}:${seed}`),
    );
    expect(items.every((i) => i.kind === 'question' && !i.extra && i.question.context !== undefined)).toBe(true);
    expect(buildCaseSession(SAMPLE_CASE.id, seed)).toEqual(items);
    expect(() => buildCaseSession('case-nope', seed)).toThrow();
  });

  it('move on with every play started, finished or not', () => {
    const attempts = [...playOf(SAMPLE_CASE.id, 's1'), ...playOf(SECOND_SAMPLE_CASE.id, 's2', { answered: 1 })];
    expect(practicePlayCount('case', attempts, [])).toBe(2);
    // A play of the topic's own level is not one of this screen.
    expect(practicePlayCount('case', [...attempts, ...playOf(SAMPLE_CASE.id, 's3', { kind: 'level' })], [])).toBe(2);
  });
});

describe('what the learner has played', () => {
  const PARTS = SAMPLE_CASE.parts.length;

  it('is read from the plays of this screen and of the Case study levels, a case counting once it is finished', () => {
    const attempts = [
      ...playOf(SAMPLE_CASE.id, 's1', { right: PARTS - 2 }),
      ...playOf(SAMPLE_CASE.id, 's2', { kind: 'level', right: PARTS - 1, seed: 700 }),
      ...playOf(SECOND_SAMPLE_CASE.id, 's3', { answered: 2 }),
      // Mistake review asks single questions of a case again: not a play of the case.
      ...playOf(SECOND_SAMPLE_CASE.id, 's4', { kind: 'mistakes' }),
    ];
    const plays = casePlays(attempts);
    expect(plays.map((p) => [p.sessionId, p.caseId, p.fromSection, p.correct, p.total, p.complete])).toEqual([
      ['s1', SAMPLE_CASE.id, true, PARTS - 2, PARTS, true],
      ['s2', SAMPLE_CASE.id, false, PARTS - 1, PARTS, true],
      ['s3', SECOND_SAMPLE_CASE.id, true, 2, SECOND_SAMPLE_CASE.parts.length, false],
    ]);
    expect(stageRecord(real, plays)).toEqual({
      playedCaseIds: [SAMPLE_CASE.id],
      best: (PARTS - 1) / PARTS,
      bestByCase: { [SAMPLE_CASE.id]: (PARTS - 1) / PARTS },
    });
    expect(stageRecord(second, plays)).toEqual({ playedCaseIds: [], best: null, bestByCase: {} });
    expect(stageRecord(empty, plays)).toEqual({ playedCaseIds: [], best: null, bestByCase: {} });
  });

  it('ignores everything that is not a question of a known case', () => {
    expect(casePlays([])).toEqual([]);
    expect(
      casePlays([
        { questionId: 'je-q1', sessionId: 's', sessionKind: 'case', correct: true },
        { questionId: 'gen:case-nope~1:1:5', sessionId: 's', sessionKind: 'case', correct: true },
        { questionId: 'gen:je-cash-sale:1:5', sessionId: 's', sessionKind: 'level', correct: true },
      ]),
    ).toEqual([]);
  });
});

describe('New case and Mixed cases', () => {
  const stage: CaseStage = { ...real, id: 'both', cases: [SAMPLE_CASE, SECOND_SAMPLE_CASE] };

  it('lets the cases of a stage take turns, one step for every case started from this screen', () => {
    let attempts: Attempt[] = [];
    const served: string[] = [];
    for (let n = 0; n < 6; n++) {
      const next = nextCase(stage, casePlays(attempts))!;
      served.push(next.id);
      // Even an abandoned play moves the turn on.
      attempts = [...attempts, ...playOf(next.id, `s${n}`, { answered: n % 2 === 0 ? 1 : undefined, seed: caseSeed(n) })];
    }
    expect(served).toEqual([SAMPLE_CASE.id, SECOND_SAMPLE_CASE.id, SAMPLE_CASE.id, SECOND_SAMPLE_CASE.id, SAMPLE_CASE.id, SECOND_SAMPLE_CASE.id]);
    // Plays of the topic's own level do not move it.
    expect(nextCase(stage, casePlays(playOf(SAMPLE_CASE.id, 'l1', { kind: 'level' })))).toBe(SAMPLE_CASE);
    expect(nextCase(empty, [])).toBeUndefined();
  });

  it('gives a different seed and so a different case text each time the same case comes round', () => {
    const texts = new Set<string>();
    const ids = new Set<string>();
    for (let n = 0; n < 12; n++) {
      const [q] = generateCaseQuestions(SAMPLE_CASE.id, caseSeed(n));
      texts.add(q.context!);
      ids.add(q.id);
      expect(parseGenId(q.id)!.seed).toBe(caseSeed(n));
      expect(parseCasePartId(parseGenId(q.id)!.templateId)!.caseId).toBe(SAMPLE_CASE.id);
    }
    expect(ids.size).toBe(12);
    expect(texts.size).toBeGreaterThan(6);
  });

  it('takes a mixed case from the open stage played least, the earlier one first, and from open stages only', () => {
    let attempts: Attempt[] = [];
    const served: string[] = [];
    for (let n = 0; n < 4; n++) {
      const next = nextMixedCase([first, empty, second], casePlays(attempts))!;
      served.push(next.stage.id);
      expect(next.stage.cases).toContain(next.template);
      attempts = [...attempts, ...playOf(next.template.id, `s${n}`, { seed: caseSeed(n) })];
    }
    expect(served).toEqual(['first', 'second', 'first', 'second']);
    expect(nextMixedCase([second], [])?.stage).toBe(second);
    expect(nextMixedCase([empty], [])).toBeUndefined();
    expect(nextMixedCase([], [])).toBeUndefined();
  });
});
