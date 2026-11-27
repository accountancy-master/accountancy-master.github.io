import { describe, expect, it } from 'vitest';
import { CASE_STAGES, TEMPLATES, generateQuestion } from '@/generators';
import { PACKS, findCourse, findQuestion, getCourse, getQuestion, getTopicPack, templatesForConcept, topicSize } from './registry';

// What these tests look up is taken from the packs, so they hold however many topics and templates there are.
const authored = PACKS.flatMap((p) => p.questions)[0];
const template = TEMPLATES[0];
const sameConcept = TEMPLATES.filter((t) => t.conceptId === template.conceptId).map((t) => t.id);

describe('registry', () => {
  it('finds the course and pack', () => {
    expect(getCourse('cbse-11-accountancy').title).toMatch(/Class 11/);
    expect(getTopicPack(PACKS[0].topicId)).toBe(PACKS[0]);
    expect(getTopicPack('no-such-topic')).toBeUndefined();
  });
  it('looks a course up without throwing', () => {
    expect(findCourse('cbse-11-accountancy')).toBe(getCourse('cbse-11-accountancy'));
    expect(findCourse('cbse-99-unknown')).toBeUndefined();
    expect(findCourse('')).toBeUndefined();
  });
  it('returns authored and generated questions by id', () => {
    expect(getQuestion(authored.id).type).toBe(authored.type);
    const g = getQuestion(`gen:${template.id}:${template.version}:7`);
    expect(g.type).toBe(template.kind === 'journal' ? 'journal_entry' : template.kind);
    expect(g.id).toBe(`gen:${template.id}:${template.version}:7`);
  });
  it('throws for an unknown question', () => {
    expect(() => getQuestion('nope')).toThrow('Unknown question: nope');
  });

  it('round-trips a generated id with a large seed', () => {
    const q = generateQuestion(template.id, 1791130894135);
    expect(getQuestion(q.id)).toEqual(q);
  });
  it('throws for a generated id with a stale version or unknown template', () => {
    expect(() => getQuestion(`gen:${template.id}:${template.version + 1}:7`)).toThrow('Unknown question: gen:je-capital:2:7');
    expect(() => getQuestion('gen:nope:1:7')).toThrow('Unknown question: gen:nope:1:7');
  });

  describe('findQuestion', () => {
    it('finds authored and generated questions', () => {
      expect(findQuestion(authored.id)).toBe(getQuestion(authored.id));
      expect(findQuestion(`gen:${template.id}:${template.version}:7`)).toEqual(getQuestion(`gen:${template.id}:${template.version}:7`));
    });
    it('answers only to the exact id of the question it generates', () => {
      expect(findQuestion(`gen:${template.id}:${template.version}:007`)).toBeUndefined();
      expect(findQuestion(`gen:${template.id}:${template.version}:7`)?.id).toBe(`gen:${template.id}:${template.version}:7`);
    });
    it('returns undefined for unknown, retired-version and malformed ids', () => {
      for (const id of [
        'nope',
        '',
        `gen:${template.id}:${template.version + 1}:7`,
        'gen:nope:1:7',
        `gen:${template.id}:${template.version + 98}:1`,
        `gen:${template.id}:${template.version}:-3`,
        `gen:${template.id}:${template.version}:99999999999999999999`,
        `gen:${template.id}:${template.version}`,
        'gen::::',
        '__proto__',
        'constructor',
      ]) {
        expect(findQuestion(id), id).toBeUndefined();
      }
    });
  });

  describe('templatesForConcept', () => {
    it('lists the templates of a concept', () => {
      expect(templatesForConcept(template.conceptId).map((t) => t.id)).toEqual(sameConcept);
    });
    it('is empty for a concept with no template, and for an unknown concept', () => {
      const templated = new Set(TEMPLATES.map((t) => t.conceptId));
      const bare = PACKS.flatMap((p) => p.concepts).find((c) => !templated.has(c.id));
      if (bare) expect(templatesForConcept(bare.id)).toEqual([]);
      expect(templatesForConcept('nope')).toEqual([]);
    });
    it('hands out a copy, so a caller cannot change the index', () => {
      templatesForConcept(template.conceptId).pop();
      expect(templatesForConcept(template.conceptId).map((t) => t.id)).toEqual(sameConcept);
    });
  });
});

describe('topicSize', () => {
  it('counts generators, case studies, authored questions and cards of a topic, and is zero for an unknown one', () => {
    for (const p of PACKS) {
      expect(topicSize(p.topicId), p.topicId).toEqual({
        generators: TEMPLATES.filter((t) => t.topicId === p.topicId).length,
        cases: CASE_STAGES.filter((s) => s.topicId === p.topicId).reduce((n, s) => n + s.cases.length, 0),
        questions: p.questions.length,
        cards: p.cards.length,
      });
    }
    expect(topicSize('nope')).toEqual({ generators: 0, cases: 0, questions: 0, cards: 0 });
  });
});
