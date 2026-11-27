import type { CaseStage } from '@/generators/cases';
import type { Template } from '@/generators/types';
import type { OutlineData } from './outline';
import type { TopicPack } from './types';

/**
 * The outline of these packs, templates and case stages (see outline.ts for what it is for): `packs` are the playable
 * packs in course order. Written into outline.generated.ts by `npm run catalogue`, and used as it is by the registry.
 */
export function outlineOf(packs: readonly TopicPack[], templates: readonly Template[], stages: readonly CaseStage[]): OutlineData {
  return {
    topics: packs.map((p) => ({
      id: p.topicId,
      concepts: p.concepts.map((c) => [c.id, c.title]),
      cards: p.cards.map((c) => (c.beyondSyllabus === undefined ? [c.id, c.conceptId] : [c.id, c.conceptId, c.beyondSyllabus])),
      questions: p.questions.map((q) =>
        q.beyondSyllabus !== undefined
          ? [q.id, q.conceptId, q.difficulty, q.type, q.context !== undefined, q.beyondSyllabus]
          : q.context === undefined
            ? [q.id, q.conceptId, q.difficulty, q.type]
            : [q.id, q.conceptId, q.difficulty, q.type, true],
      ),
      templates: templates
        .filter((t) => t.topicId === p.topicId)
        .map((t) => (t.beyondSyllabus === undefined ? [t.id, t.version, t.conceptId, t.difficulty, t.kind] : [t.id, t.version, t.conceptId, t.difficulty, t.kind, t.beyondSyllabus])),
      levels: p.levels.map((l) => {
        const checks = (l.lesson ?? []).flatMap((b) => (b.type === 'check' ? [b.questionId] : []));
        return {
          id: l.id,
          order: l.order,
          type: l.type,
          title: l.title,
          ...(checks.length > 0 ? { checks } : {}),
          ...(l.questionIds ? { questionIds: l.questionIds } : {}),
          ...(l.generate ? { generate: l.generate } : {}),
          ...(l.cases ? { cases: l.cases } : {}),
        };
      }),
    })),
    stages: stages.map((s) => ({
      id: s.id,
      topicId: s.topicId,
      conceptId: s.conceptId,
      title: s.title,
      description: s.description,
      cases: s.cases.map((c) => [c.id, c.version, c.difficulty, c.title, c.parts.map((part) => part.kind)]),
    })),
  };
}
