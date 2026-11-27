import { describe, expect, it } from 'vitest';
import { buildLadder, simulationLevels } from '@/content/ladder';
import { ALL_PACKS, getTopicPack } from '@/content/registry';
import { validatePack } from '@/content/validate';
import { seedOrder } from '@/play/seed';

const AE = 'accounting-equation';

describe('simulation levels on the ladder', () => {
  const pack = getTopicPack(AE)!;

  it('the accounting equation has "See the equation move" and "Find the mistake" right after the lesson', () => {
    const levels = [...pack.levels].sort((a, b) => a.order - b.order);
    expect(levels.slice(0, 4).map((l) => [l.id, l.type])).toEqual([
      [`${AE}-level-0`, 'concept'],
      [`${AE}-simulation-1`, 'simulation'],
      [`${AE}-simulation-2`, 'simulation'],
      [`${AE}-level-1`, 'card_revision'],
    ]);
    expect(levels[1].simulation).toEqual({ sceneId: 'ae', mode: 'predict', watch: 2, count: 6 });
    expect(levels[2].simulation).toEqual({ sceneId: 'ae', mode: 'mistakes', count: 4 });
    expect(levels.map((l) => l.order)).toEqual(levels.map((_, i) => i));
    expect(validatePack(pack)).toEqual([]);
  });

  it('renumbers no level: every level keeps its id, and so its questions, and is only moved down', () => {
    const numbered = pack.levels.filter((l) => /-level-\d+$/.test(l.id));
    expect(numbered.map((l) => l.id)).toEqual(Array.from({ length: 12 }, (_, n) => `${AE}-level-${n}`));
    for (const l of numbered) {
      const n = Number(l.id.split('-').at(-1));
      expect(l.order, l.id).toBe(n === 0 ? 0 : n + 2);
      // The seeds a level serves follow its id, so a learner's next play of it is what it was before.
      expect(seedOrder(l, 1), l.id).toBe(n);
    }
  });

  it('on every other ladder a numbered level is seeded by its order, as before', () => {
    for (const p of ALL_PACKS) {
      if (p.topicId === AE) continue;
      for (const l of p.levels) if (l.type !== 'look_back') expect(seedOrder(l, 0), l.id).toBe(l.order);
    }
  });

  it('simulation levels are seeded apart from every other level', () => {
    const sims = pack.levels.filter((l) => l.type === 'simulation');
    expect(sims.map((l) => seedOrder(l, 1))).toEqual([901, 902]);
  });

  it('buildLadder puts simulation levels after the lesson without moving any id', () => {
    const lesson = { title: 'L', description: 'd', lesson: [{ type: 'text' as const, heading: 'h', body: 'b' }] };
    const plain = buildLadder('t', { concept: lesson, cards: { title: 'C', description: 'd', cardIds: ['c1'] } });
    const withSims = buildLadder('t', {
      concept: lesson,
      simulations: [{ title: 'S', description: 'd', sceneId: 'ae', mode: 'predict', count: 3 }],
      cards: { title: 'C', description: 'd', cardIds: ['c1'] },
    });
    expect(plain.map((l) => l.id)).toEqual(['t-level-0', 't-level-1']);
    expect(withSims.map((l) => [l.id, l.order])).toEqual([
      ['t-level-0', 0],
      ['t-simulation-1', 1],
      ['t-level-1', 2],
    ]);
    expect(simulationLevels('t', [{ title: 'S', description: 'd', sceneId: 'ae', mode: 'mistakes', count: 2, passMark: 0.5 }])[0]).toMatchObject({ passMark: 0.5, simulation: { mode: 'mistakes', count: 2 } });
  });

  it('a simulation level must name a scene of its own topic', () => {
    const broken = { ...pack, levels: pack.levels.map((l) => (l.type === 'simulation' ? { ...l, simulation: { ...l.simulation!, sceneId: 'nope' } } : l)) };
    expect(validatePack(broken)).toContain(`level ${AE}-simulation-1: unknown scene nope`);
  });
});
