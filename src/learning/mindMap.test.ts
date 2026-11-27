import { describe, expect, it } from 'vitest';
import { COURSES, PACKS } from '@/content/registry';
import { STAGES, TEMPLATE_OUTLINES, outlinesOf } from '@/content/outline';
import { TOPIC_LINKS } from '@/content/topicLinks';
import type { Progress } from './progress';
import { courseLinks, courseMapTree, descendants, initialFolded, topicMapTree, visibleTree, walk, type MapNode } from './mindMap';

const cardTitle = (id: string) => PACKS.flatMap((p) => p.cards).find((c) => c.id === id)?.prompt ?? id;
const ids = (root: MapNode, prefix: string) => walk(root).filter((n) => n.id.startsWith(prefix)).map((n) => n.id.slice(prefix.length));

const progress = (concepts: Record<string, number>, passedLevelIds: string[] = []): Progress =>
  ({ concepts: Object.fromEntries(Object.entries(concepts).map(([id, mastery]) => [id, { mastery, lastAt: 0, review: {} }])), passedLevelIds }) as unknown as Progress;

describe('the map of a topic', () => {
  for (const pack of PACKS) {
    it(`${pack.topicId}: every concept, card, pattern and case appears once`, () => {
      const root = topicMapTree(pack.topicId, pack.topicId, cardTitle, null);
      const all = walk(root).map((n) => n.id);
      expect(new Set(all).size).toBe(all.length);
      const stages = STAGES.filter((s) => s.topicId === pack.topicId && s.cases.length > 0);
      // A stage stands for the concept its cases count towards; every other concept is a concept node.
      const conceptIds = [...ids(root, 'concept:'), ...stages.map((s) => s.conceptId)].sort();
      expect(conceptIds).toEqual(pack.concepts.map((c) => c.id).sort());
      expect(ids(root, 'card:').sort()).toEqual(pack.cards.map((c) => c.id).sort());
      expect(ids(root, 'pattern:').sort()).toEqual(TEMPLATE_OUTLINES.filter((t) => t.topicId === pack.topicId).map((t) => t.id).sort());
      expect(ids(root, 'case:').sort()).toEqual(stages.flatMap((s) => s.cases.map((c) => c.id)).sort());
      // Every node a learner can open has somewhere to go; the others fold.
      for (const n of walk(root)) if (n.kind !== 'group' && n.kind !== 'cases') expect(n.href, n.id).toBeTruthy();
    });
  }

  it('opens a card on the topic page, a pattern and a concept in the Playground, and a case in its stage', () => {
    const root = topicMapTree('ledger', 'Ledger', cardTitle, null);
    const card = walk(root).find((n) => n.kind === 'card')!;
    expect(card.href).toMatch(/^\/topics\/ledger#card-/);
    expect(card.label).toBe(cardTitle(card.id.slice('card:'.length)));
    const pattern = walk(root).find((n) => n.kind === 'pattern')!;
    expect(pattern.href).toBe(`/playground?topic=ledger&pattern=${pattern.id.slice('pattern:'.length)}`);
    expect(walk(root).find((n) => n.kind === 'concept')!.href).toBe('/playground?topic=ledger');
    const tb = topicMapTree('trial-balance', 'Trial Balance', cardTitle, null);
    const kase = walk(tb).find((n) => n.kind === 'case')!;
    expect(kase.href).toMatch(/^\/cases\/play\/accounting-cycle\?case=/);
  });

  it('puts the learner’s mastery on the topic, its concepts and its stages, as a percentage too', () => {
    const pack = PACKS.find((p) => p.topicId === 'trial-balance')!;
    const [first] = pack.concepts;
    const root = topicMapTree(pack.topicId, 'Trial Balance', cardTitle, progress({ [first.id]: 64.6, 'tb-case': 95 }));
    const concept = walk(root).find((n) => n.id === `concept:${first.id}`)!;
    expect(concept.mastery).toBe(65);
    expect(concept.detail).toBe('Familiar · 65%');
    expect(walk(root).find((n) => n.id === 'stage:accounting-cycle')!.mastery).toBe(95);
    expect(root.mastery).toBe(Math.round((64.6 + 95) / pack.concepts.length));
    // Unknown progress: no figure at all, rather than a misleading 0.
    expect(topicMapTree(pack.topicId, 'Trial Balance', cardTitle, null).children[0].mastery).toBeNull();
  });

  it('opens on the concepts, folded; folding hides what is under a node', () => {
    const root = topicMapTree('journal-entries', 'Journal Entries', cardTitle, null);
    const folded = initialFolded(root);
    const shown = visibleTree(root, folded);
    expect(shown.children.map((c) => c.id)).toEqual(root.children.map((c) => c.id));
    expect(shown.children.every((c) => c.children.length === 0)).toBe(true);
    expect(descendants(root)).toBeGreaterThan(100);
  });
});

describe('the map of a course', () => {
  for (const course of COURSES) {
    it(`${course.id}: every unit and every playable topic, in course order, opening the topic's map`, () => {
      const root = courseMapTree(course.id, course.title, null);
      const playable = outlinesOf(course.id).map((o) => o.topicId);
      expect(ids(root, 'topic:')).toEqual(playable);
      const units = [...new Set(course.topics.filter((t) => playable.includes(t.id)).map((t) => t.unit))];
      expect(root.children.map((u) => u.label)).toEqual(units);
      for (const t of walk(root).filter((n) => n.kind === 'topic')) expect(t.href).toBe(`/maps/${t.id.slice('topic:'.length)}`);
      expect(initialFolded(root).size).toBe(0);
    });
  }

  it('shows each topic’s mastery and the levels passed', () => {
    const outline = outlinesOf('cbse-11-accountancy')[0];
    const root = courseMapTree('cbse-11-accountancy', 'Class 11', progress({ [outline.concepts[0].id]: 80 }, [outline.levels[0].id]));
    const topic = walk(root).find((n) => n.id === `topic:${outline.topicId}`)!;
    expect(topic.mastery).toBe(Math.round(80 / outline.concepts.length));
    expect(topic.detail).toBe(`${topic.mastery}% · 1 of ${outline.levels.length} levels`);
  });
});

describe('links between topics', () => {
  it('name real topics of their own course, and go forward in it', () => {
    for (const [courseId, links] of Object.entries(TOPIC_LINKS)) {
      const course = COURSES.find((c) => c.id === courseId);
      expect(course, courseId).toBeDefined();
      const order = course!.topics.map((t) => t.id);
      for (const l of links) {
        expect(order, `${l.from} → ${l.to}`).toContain(l.from);
        expect(order, `${l.from} → ${l.to}`).toContain(l.to);
        expect(order.indexOf(l.from), `${l.from} → ${l.to}`).toBeLessThan(order.indexOf(l.to));
        expect(l.reason.length).toBeGreaterThan(20);
      }
      expect(new Set(links.map((l) => `${l.from}>${l.to}`)).size).toBe(links.length);
    }
  });

  it('include the case studies that combine topics, from the stages', () => {
    const links = courseLinks('cbse-11-accountancy');
    const cases = links.filter((l) => l.kind === 'case');
    // The whole year of a business draws on the stages before it: the trial balance, the bank, errors, depreciation.
    for (const from of ['trial-balance', 'bank-reconciliation', 'rectification-of-errors', 'depreciation']) {
      expect(cases.some((l) => l.from === from && l.to === 'final-accounts-adjustments'), from).toBe(true);
    }
    expect(links.some((l) => l.kind === 'builds' && l.from === 'journal-entries' && l.to === 'ledger')).toBe(true);
    const c12 = courseLinks('cbse-12-accountancy');
    expect(c12.some((l) => l.kind === 'case' && l.from === 'partnership-fundamentals' && l.to === 'dissolution-of-partnership')).toBe(true);
    for (const courseId of ['cbse-11-accountancy', 'cbse-12-accountancy']) {
      const order = outlinesOf(courseId).map((o) => o.topicId);
      for (const l of courseLinks(courseId)) expect(order.indexOf(l.from)).toBeLessThan(order.indexOf(l.to));
    }
  });
});
