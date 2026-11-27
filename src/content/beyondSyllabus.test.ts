import { describe, expect, it } from 'vitest';
import { TEMPLATES, findCase } from '@/generators';
import { generateCase, generateFrom } from '@/generators/engine';
import { BEYOND_IGST_CROSS_SET_OFF, BEYOND_INTEREST_ON_DRAWINGS } from './beyondSyllabus';
import TIPS11 from './glossary/tips11';
import { PACKS, getTopicPack } from './registry';
import { validatePack } from './validate';

// Interest on drawings of a sole proprietor is beyond the Class 11 syllabus. The case studies that always asked about
// it ask the same things without it now (version 2), and the rule cards that teach nothing else are marked and stand
// on no revision level; the cards that taught it beside interest on capital teach interest on capital alone.
// Incomplete Records, a sole proprietor topic too, adjusts the profit found for interest on capital only.

const DRAWINGS_INTEREST = /interest on (the )?(cash )?drawings|interestOnDrawings|Interest on Drawings/i;

describe('the case studies that asked about interest on drawings', () => {
  it.each(['case-fa-interest-income', 'case-wy-proprietor-capital', 'case-wy-chain-capital-account'])('%s asks the same things without it', (id) => {
    const c = findCase(id)!;
    expect(c.version).toBe(2);
    for (let seed = 1; seed <= 20; seed++) {
      const questions = generateCase(c, seed);
      expect(questions.length, `${id} seed ${seed}`).toBeGreaterThan(0);
      // The account choices of an entry are left out: the engine fills them from the whole Class 11 chart, which has
      // Interest on Drawings A/c, as it does for every entry of the course.
      const asked = questions.map((q) => ('accountChoices' in q ? { ...q, accountChoices: [] } : q));
      expect(JSON.stringify(asked), `${id} seed ${seed}`).not.toMatch(DRAWINGS_INTEREST);
    }
  });
});

describe('rule cards beyond the syllabus', () => {
  const faa = getTopicPack('final-accounts-adjustments')!;
  const revision = (pack: (typeof PACKS)[number]) => pack.levels.filter((l) => l.type === 'card_revision').flatMap((l) => l.cardIds ?? []);

  it('are the two cards of interest on drawings alone and the card of the IGST order, marked with the reason of the family', () => {
    const marked = PACKS.flatMap((p) => p.cards).filter((c) => c.beyondSyllabus !== undefined);
    expect(marked.map((c) => c.id)).toEqual(['thb-card-27', 'faa-card-13', 'faa-card-14']);
    for (const c of marked) expect(c.beyondSyllabus).toBe(c.id === 'thb-card-27' ? BEYOND_IGST_CROSS_SET_OFF : BEYOND_INTEREST_ON_DRAWINGS);
  });

  it('stand on no level, while every other card of the topic stays on its revision level', () => {
    for (const p of PACKS) {
      const listed = new Set(p.levels.flatMap((l) => l.cardIds ?? []));
      for (const c of p.cards) if (c.beyondSyllabus !== undefined) expect(listed.has(c.id), c.id).toBe(false);
    }
    expect(revision(faa)).toEqual(faa.cards.filter((c) => c.beyondSyllabus === undefined).map((c) => c.id));
  });

  it('are refused on a level by validate-content', () => {
    expect(validatePack(faa)).toEqual([]);
    const at = faa.levels.findIndex((l) => l.type === 'card_revision');
    const listed = { ...faa, levels: faa.levels.map((l, i) => (i === at ? { ...l, cardIds: [...(l.cardIds ?? []), 'faa-card-13'] } : l)) };
    expect(validatePack(listed)).toContain(`level ${faa.levels[at].id}: card faa-card-13 is beyond the syllabus and stands on no level`);
  });

  it('leaves the cards on the levels free of interest on drawings', () => {
    const je = getTopicPack('journal-entries')!;
    for (const pack of [faa, je]) {
      const onLevels = new Set(revision(pack));
      for (const c of pack.cards.filter((x) => onLevels.has(x.id))) {
        expect(JSON.stringify(c), c.id).not.toMatch(DRAWINGS_INTEREST);
      }
    }
  });
});

describe('Incomplete Records, a sole proprietor topic, and the Class 11 exam tips', () => {
  it('charge no interest on drawings in any template of the topic', () => {
    const templates = TEMPLATES.filter((t) => t.topicId === 'incomplete-records');
    expect(templates.length).toBeGreaterThan(30);
    for (const t of templates) {
      for (let seed = 1; seed <= 40; seed++) expect(JSON.stringify(generateFrom(t, seed)), `${t.id} seed ${seed}`).not.toMatch(DRAWINGS_INTEREST);
    }
  });

  it('teach none in its cards, questions, lesson or levels, so nothing of the topic needs marking', () => {
    const ir = getTopicPack('incomplete-records')!;
    expect(JSON.stringify({ cards: ir.cards, questions: ir.questions, levels: ir.levels })).not.toMatch(DRAWINGS_INTEREST);
    expect([...ir.cards, ...ir.questions].filter((x) => x.beyondSyllabus !== undefined)).toEqual([]);
  });

  it('leave it out of the exam tips', () => {
    expect(JSON.stringify(TIPS11)).not.toMatch(DRAWINGS_INTEREST);
  });
});
