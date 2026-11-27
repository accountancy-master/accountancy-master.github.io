import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { CASES, CASE_STAGES, TEMPLATES, casePartId } from '@/generators';
import { BEYOND_IGST_CROSS_SET_OFF, BEYOND_INTEREST_ON_DRAWINGS } from './beyondSyllabus';
import { OUTLINE_FILE, renderOutline } from './catalogueSource';
import {
  COURSES,
  OUTLINES,
  STAGES,
  TEMPLATE_OUTLINES,
  beyondSyllabusOf,
  caseOfQuestion,
  findCaseOutline,
  findOutline,
  findTemplateOutline,
  templatesForConcept,
  topicOfLevel,
  topicOfQuestion,
  topicSize,
  topicsOfQuestions,
} from './outline';
import { OUTLINE } from './outline.generated';
import { outlineOf } from './outlineOf';
import { COURSES as REGISTRY_COURSES, PACKS } from './registry';

describe('the generated outline (what the listing screens read instead of the packs and the generators)', () => {
  it('is up to date with the packs and the generators: run `npm run catalogue` when this fails', () => {
    const committed = fs.readFileSync(path.join(process.cwd(), OUTLINE_FILE), 'utf8').replace(/\r\n/g, '\n');
    expect(committed).toBe(renderOutline());
    // And the file, as the app imports it, holds the outline of exactly what there is.
    expect(OUTLINE).toEqual(outlineOf(PACKS, TEMPLATES, CASE_STAGES));
  });

  it('lists the playable topics in course order, each with what its pack lists', () => {
    expect(OUTLINES.map((o) => o.topicId)).toEqual(PACKS.map((p) => p.topicId));
    for (const pack of PACKS) {
      const outline = findOutline(pack.topicId)!;
      expect(outline.concepts, pack.topicId).toEqual(pack.concepts);
      expect(outline.cards, pack.topicId).toEqual(
        pack.cards.map(({ id, topicId, conceptId, beyondSyllabus }) => ({ id, topicId, conceptId, ...(beyondSyllabus !== undefined ? { beyondSyllabus } : {}) })),
      );
      expect(outline.questions, pack.topicId).toEqual(
        pack.questions.map(({ id, topicId, conceptId, difficulty, type, beyondSyllabus }) => ({ id, topicId, conceptId, difficulty, type, ...(beyondSyllabus !== undefined ? { beyondSyllabus } : {}) })),
      );
      expect(outline.levels, pack.topicId).toEqual(
        pack.levels.map((l) => {
          const checks = (l.lesson ?? []).filter((b) => b.type === 'check');
          return {
            id: l.id,
            topicId: l.topicId,
            order: l.order,
            type: l.type,
            title: l.title,
            ...(checks.length > 0 ? { lesson: checks } : {}),
            ...(l.questionIds ? { questionIds: l.questionIds } : {}),
            ...(l.generate ? { generate: l.generate } : {}),
            ...(l.cases ? { cases: l.cases } : {}),
          };
        }),
      );
    }
    expect(findOutline('no-such-topic')).toBeUndefined();
  });

  it('knows every template by what does not need its generator, in the order of the generator registry within a topic', () => {
    const outlineOfTemplate = ({ id, version, topicId, conceptId, difficulty, kind, beyondSyllabus }: (typeof TEMPLATES)[number]) => ({
      id,
      version,
      topicId,
      conceptId,
      difficulty,
      kind,
      ...(beyondSyllabus !== undefined ? { beyondSyllabus } : {}),
    });
    expect(TEMPLATE_OUTLINES).toEqual(PACKS.flatMap((p) => TEMPLATES.filter((t) => t.topicId === p.topicId)).map(outlineOfTemplate));
    expect(TEMPLATE_OUTLINES).toHaveLength(TEMPLATES.length);
    for (const t of TEMPLATES) expect(findTemplateOutline(t.id), t.id).toEqual(outlineOfTemplate(t));
    expect(findTemplateOutline('nope')).toBeUndefined();
    // The order a concept's templates come in decides which one a seed picks: it is the registry's.
    for (const conceptId of new Set(TEMPLATES.map((t) => t.conceptId))) {
      expect(templatesForConcept(conceptId).map((t) => t.id), conceptId).toEqual(TEMPLATES.filter((t) => t.conceptId === conceptId).map((t) => t.id));
    }
    expect(templatesForConcept('nope')).toEqual([]);
  });

  it('knows every stage and every case study, and the template of each question of a case', () => {
    expect(STAGES.map(({ cases, ...stage }) => ({ ...stage, cases: cases.map((c) => c.id) }))).toEqual(
      CASE_STAGES.map(({ cases, ...stage }) => ({ ...stage, cases: cases.map((c) => c.id) })),
    );
    for (const c of CASES) {
      const { id, version, topicId, conceptId, difficulty, title } = c;
      expect(findCaseOutline(c.id), c.id).toEqual({ id, version, topicId, conceptId, difficulty, title, parts: c.parts.map((p) => ({ kind: p.kind })) });
      c.parts.forEach((part, i) => {
        expect(part.id).toBe(casePartId(c.id, i));
        expect(findTemplateOutline(part.id), part.id).toEqual({ id: part.id, version: part.version, topicId: part.topicId, conceptId: part.conceptId, difficulty: part.difficulty, kind: part.kind });
      });
    }
    expect(findCaseOutline('nope')).toBeUndefined();
    // A part of a case is never among the templates practice chooses from.
    expect(TEMPLATE_OUTLINES.some((t) => t.id.includes('~'))).toBe(false);
  });

  it('counts the bank of a topic, knows the courses and which topic a level belongs to', () => {
    for (const pack of PACKS) {
      expect(topicSize(pack.topicId), pack.topicId).toEqual({
        generators: TEMPLATES.filter((t) => t.topicId === pack.topicId).length,
        cases: CASE_STAGES.filter((s) => s.topicId === pack.topicId).reduce((n, s) => n + s.cases.length, 0),
        questions: pack.questions.length,
        cards: pack.cards.length,
      });
      for (const level of pack.levels) expect(topicOfLevel(level.id), level.id).toBe(pack.topicId);
    }
    expect(topicSize('no-such-topic')).toEqual({ generators: 0, cases: 0, questions: 0, cards: 0 });
    expect(topicOfLevel('no-such-level')).toBeUndefined();
    expect(COURSES).toEqual(REGISTRY_COURSES);
  });
});

describe('the topic a question id names (the topic to load before the question can be looked up)', () => {
  it('is its own for an authored question', () => {
    for (const pack of PACKS) for (const q of pack.questions) expect(topicOfQuestion(q.id), q.id).toBe(pack.topicId);
  });

  it("is its generator's for a generated question, and its stage's topic for a question of a case", () => {
    for (const t of TEMPLATES) expect(topicOfQuestion(`gen:${t.id}:${t.version}:${7 + t.version}`), t.id).toBe(t.topicId);
    for (const stage of CASE_STAGES) {
      for (const c of stage.cases) {
        c.parts.forEach((part, i) => {
          const id = `gen:${casePartId(c.id, i)}:${part.version}:3000000100`;
          expect(topicOfQuestion(id), id).toBe(stage.topicId);
          expect(caseOfQuestion(id)?.id, id).toBe(c.id);
        });
      }
    }
    expect(caseOfQuestion(`gen:${TEMPLATES[0].id}:${TEMPLATES[0].version}:1`)).toBeUndefined();
    expect(caseOfQuestion(PACKS[0].questions[0].id)).toBeUndefined();
  });

  it('is none for an id this version cannot serve: unknown, malformed, of a retired version, or not written as the question carries it', () => {
    const t = TEMPLATES[0];
    for (const id of [
      'nope',
      '',
      'gen:nope:1:7',
      `gen:${t.id}:${t.version + 1}:7`,
      `gen:${t.id}:${t.version}:007`,
      `gen:${t.id}:${t.version}:-3`,
      `gen:${t.id}:${t.version}:99999999999999999999`,
      `gen:${t.id}:0${t.version}:7`,
      `gen:${t.id}:${t.version}`,
      'gen::::',
      '__proto__',
      'constructor',
    ]) {
      expect(topicOfQuestion(id), id).toBeUndefined();
    }
  });

  it('names the topics of a list of ids, each once, in course order', () => {
    const [first, second] = PACKS;
    const later = TEMPLATES.find((t) => t.topicId === second.topicId)!;
    const ids = [`gen:${later.id}:${later.version}:5`, first.questions[0].id, 'nope', `gen:${later.id}:${later.version}:6`, first.questions[1].id];
    expect(topicsOfQuestions(ids)).toEqual([first.topicId, second.topicId]);
    expect(topicsOfQuestions([])).toEqual([]);
    expect(topicsOfQuestions(['nope'])).toEqual([]);
  });
});

// A topic is loaded by itself, so nothing of a topic may live in another topic's files: what follows is what the
// loader relies on (loadTopics.ts), checked on the content as it is.
describe('what loading topic by topic relies on', () => {
  it("files every template under a playable topic and under a concept of that topic's pack", () => {
    for (const t of TEMPLATES) {
      const pack = PACKS.find((p) => p.topicId === t.topicId);
      expect(pack, t.id).toBeDefined();
      expect(pack!.concepts.some((c) => c.id === t.conceptId), t.id).toBe(true);
    }
  });

  it('keeps every concept, authored question and card in one topic, with ids no other topic uses', () => {
    const count = (ids: string[]) => new Set(ids).size;
    const concepts = PACKS.flatMap((p) => p.concepts);
    const questions = PACKS.flatMap((p) => p.questions);
    const cards = PACKS.flatMap((p) => p.cards);
    expect(count(concepts.map((c) => c.id))).toBe(concepts.length);
    expect(count(questions.map((q) => q.id))).toBe(questions.length);
    expect(count(cards.map((c) => c.id))).toBe(cards.length);
    for (const pack of PACKS) {
      const own = new Set(pack.concepts.map((c) => c.id));
      for (const c of pack.concepts) expect(c.topicId, c.id).toBe(pack.topicId);
      for (const q of pack.questions) expect({ topicId: q.topicId, own: own.has(q.conceptId) }, q.id).toEqual({ topicId: pack.topicId, own: true });
      for (const c of pack.cards) expect({ topicId: c.topicId, own: own.has(c.conceptId) }, c.id).toEqual({ topicId: pack.topicId, own: true });
    }
  });

  it("lets a level generate from its own topic's templates only (a look-back names the earlier topics it draws on)", () => {
    const topicOf = new Map(TEMPLATES.map((t) => [t.id, t.topicId]));
    for (const pack of PACKS) {
      for (const level of pack.levels) {
        for (const id of [...(level.generate?.templateIds ?? []), ...(level.lookBack?.templateIds ?? [])]) expect(topicOf.get(id), `${level.id} ${id}`).toBe(pack.topicId);
        for (const earlier of level.lookBack?.earlier ?? []) {
          for (const id of earlier.templateIds) expect(topicOf.get(id), `${level.id} ${id}`).toBe(earlier.topicId);
        }
      }
    }
  });

  it('says which questions teach beyond the syllabus, and why: an authored one by itself, a generated one by its template', () => {
    expect(beyondSyllabusOf({ id: 'gen:faa-int-drawings:1:7' })).toBe(BEYOND_INTEREST_ON_DRAWINGS);
    expect(beyondSyllabusOf({ id: 'gen:thb-gst-cross-set-off:1:3' })).toBe(BEYOND_IGST_CROSS_SET_OFF);
    expect(beyondSyllabusOf({ id: 'gen:faa-int-capital:1:7' })).toBeUndefined();
    expect(beyondSyllabusOf({ id: 'faa-q-013', beyondSyllabus: BEYOND_INTEREST_ON_DRAWINGS })).toBe(BEYOND_INTEREST_ON_DRAWINGS);
    expect(beyondSyllabusOf({ id: 'faa-q-014' })).toBeUndefined();
    // The outline carries the reason of every authored question and template that has one.
    const beyond = PACKS.flatMap((p) => p.questions).filter((q) => q.beyondSyllabus !== undefined);
    expect(beyond.map((q) => q.id).sort()).toEqual(['faa-q-013', 'faa-q-017', 'je-q-017', 'je-q-035']);
    for (const q of beyond) expect(OUTLINES.flatMap((o) => o.questions).find((x) => x.id === q.id)?.beyondSyllabus, q.id).toBe(q.beyondSyllabus);
    expect(TEMPLATE_OUTLINES.filter((t) => t.beyondSyllabus !== undefined).map((t) => t.id).sort()).toEqual([
      'faa-closing-capital',
      'faa-entry-int-drawings',
      'faa-int-drawings',
      'faa-int-drawings-regular',
      'je-interest-drawings',
      'je-interest-drawings-amount',
      'thb-gst-cross-set-off',
    ]);
  });
});
