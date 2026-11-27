import { playgroundHref } from '@/components/shell/navigation';
import { findCourse, findOutline, outlinesOf, stagesOf, templatesForConcept, TEMPLATE_OUTLINES, STAGES, type StageOutline } from '@/content/outline';
import type { CourseChoice } from '@/content/courseOptions';
import { topicLinksOf } from '@/content/topicLinks';
import type { TopicOutline } from '@/content/types';
import { masteryWord } from '@/components/ui/MasteryRing';
import { PATTERN_KIND_LABEL, patternKindOf, patternTitle, type PatternKind } from './patterns';
import { topicMastery, type Progress } from './progress';

// ---------------------------------------------------------------------------------------------------------------
// Mind maps: a course (its units, then its topics) and a topic (its concepts, then under each its rule cards and its
// question patterns by kind, and the case studies it closes) as trees, with the learner's mastery on the nodes that
// have one. Everything is read from the generated outline, except the titles of the rule cards, which a topic map
// gets from the topic once it has been loaded. Where the nodes stand is worked out by mapLayout.ts.
// ---------------------------------------------------------------------------------------------------------------

export type MapNodeKind = 'course' | 'unit' | 'topic' | 'concept' | 'group' | 'card' | 'pattern' | 'cases' | 'stage' | 'case';

export interface MapNode {
  /** Unique within its map: `concept:<id>`, `card:<id>`, `group:<concept>:<kind>`... */
  id: string;
  kind: MapNodeKind;
  label: string;
  /** A second, smaller line: the mastery in words and figures, a count. */
  detail?: string;
  /** The learner's mastery, 0 to 100, on a node that has one; null while progress is not known. */
  mastery?: number | null;
  /** Where the node opens. A node without one folds and unfolds instead. */
  href?: string;
  /** Leave the link unfetched ahead (the Playground). */
  prefetch?: false;
  children: MapNode[];
}

/** What a node is, as a screen reader hears it before its name. */
export const NODE_KIND_NAME: Record<MapNodeKind, string> = {
  course: 'Course',
  unit: 'Unit',
  topic: 'Topic',
  concept: 'Concept',
  group: 'Group',
  card: 'Rule card',
  pattern: 'Question pattern',
  cases: 'Case studies',
  stage: 'Stage of case studies',
  case: 'Case study',
};

/** The kinds of pattern a concept's patterns are grouped by, in this order. */
const PATTERN_GROUPS: readonly Exclude<PatternKind, 'case'>[] = ['quick', 'journal', 'set', 'format'];

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/** A mastery percentage, rounded and kept between 0 and 100. */
export const masteryPercent = (value: number): number => Math.round(Number.isFinite(value) ? Math.min(100, Math.max(0, value)) : 0);

const masteryDetail = (percent: number | null): string | undefined => (percent === null ? undefined : `${masteryWord(percent)} · ${percent}%`);

const conceptMastery = (conceptId: string, progress: Pick<Progress, 'concepts'> | null): number | null =>
  progress ? masteryPercent(progress.concepts[conceptId]?.mastery ?? 0) : null;

/** A pattern's title under its concept: what its title says after the concept's name ("Standard calculation 2"). */
function shortPatternTitle(title: string, conceptTitle: string): string {
  const prefix = `${conceptTitle}: `;
  if (!title.startsWith(prefix)) return title;
  const rest = title.slice(prefix.length);
  return rest.charAt(0).toUpperCase() + rest.slice(1);
}

/** The rule cards and the patterns of a concept, in groups: cards first, then the patterns kind by kind. */
function conceptGroups(outline: TopicOutline, conceptId: string, conceptTitle: string, cardTitle: (id: string) => string): MapNode[] {
  const groups: MapNode[] = [];
  const cards = outline.cards.filter((c) => c.conceptId === conceptId);
  if (cards.length > 0) {
    groups.push({
      id: `group:${conceptId}:cards`,
      kind: 'group',
      label: 'Rule cards',
      detail: plural(cards.length, 'card', 'cards'),
      children: cards.map((c) => ({ id: `card:${c.id}`, kind: 'card', label: cardTitle(c.id), href: `/topics/${outline.topicId}#card-${c.id}`, children: [] })),
    });
  }
  const templates = TEMPLATE_OUTLINES.filter((t) => t.topicId === outline.topicId && t.conceptId === conceptId);
  const siblings = templatesForConcept(conceptId);
  for (const kind of PATTERN_GROUPS) {
    const ofKind = templates.filter((t) => patternKindOf(t.kind) === kind);
    if (ofKind.length === 0) continue;
    groups.push({
      id: `group:${conceptId}:${kind}`,
      kind: 'group',
      label: PATTERN_KIND_LABEL[kind],
      detail: plural(ofKind.length, 'pattern', 'patterns'),
      children: ofKind.map((t) => ({
        id: `pattern:${t.id}`,
        kind: 'pattern',
        label: shortPatternTitle(patternTitle(t, conceptTitle, siblings), conceptTitle),
        href: playgroundHref(outline.topicId, t.id),
        prefetch: false,
        children: [],
      })),
    });
  }
  return groups;
}

/** The stages of case studies a topic closes that have cases, in the order a student meets them. */
export const stagesOfTopic = (topicId: string): StageOutline[] => STAGES.filter((s) => s.topicId === topicId && s.cases.length > 0);

/**
 * The map of a topic: the topic, its concepts, and under each concept its rule cards and its question patterns by
 * kind; then the case studies the topic closes, stage by stage, each with its cases. A stage of case studies is the
 * concept its cases count towards, so that concept is shown as the stage and not again among the others.
 * `cardTitle` names a rule card (the question on its front). `progress` null: mastery not known yet.
 */
export function topicMapTree(topicId: string, topicTitle: string, cardTitle: (id: string) => string, progress: Pick<Progress, 'concepts'> | null): MapNode {
  const outline = findOutline(topicId);
  if (!outline) throw new Error(`No topic ${topicId}`);
  const stages = stagesOfTopic(topicId);
  const stageConcepts = new Set(stages.map((s) => s.conceptId));
  const concepts: MapNode[] = outline.concepts
    .filter((c) => !stageConcepts.has(c.id))
    .map((c) => {
      const mastery = conceptMastery(c.id, progress);
      return {
        id: `concept:${c.id}`,
        kind: 'concept',
        label: c.title,
        detail: masteryDetail(mastery),
        mastery,
        href: playgroundHref(topicId),
        prefetch: false,
        children: conceptGroups(outline, c.id, c.title, cardTitle),
      };
    });
  const cases: MapNode[] =
    stages.length === 0
      ? []
      : [
          {
            id: 'cases',
            kind: 'cases',
            label: 'Case studies',
            detail: plural(stages.reduce((n, s) => n + s.cases.length, 0), 'case', 'cases'),
            children: stages.map((s): MapNode => {
              const mastery = conceptMastery(s.conceptId, progress);
              const concept = outline.concepts.find((c) => c.id === s.conceptId);
              return {
                id: `stage:${s.id}`,
                kind: 'stage',
                label: s.title,
                detail: masteryDetail(mastery) ?? plural(s.cases.length, 'case', 'cases'),
                mastery,
                href: `/cases/play/${s.id}`,
                children: [
                  ...s.cases.map((c): MapNode => ({ id: `case:${c.id}`, kind: 'case', label: c.title, href: `/cases/play/${s.id}?case=${encodeURIComponent(c.id)}`, children: [] })),
                  // Whatever else the stage's concept holds (none today), so that nothing of the topic is left out.
                  ...conceptGroups(outline, s.conceptId, concept?.title ?? s.title, cardTitle),
                ],
              };
            }),
          },
        ];
  const mastery = progress ? masteryPercent(topicMastery(outline, progress as Progress)) : null;
  return {
    id: `topic:${topicId}`,
    kind: 'topic',
    label: topicTitle,
    detail: mastery === null ? undefined : `${mastery}% mastery`,
    mastery,
    href: `/topics/${topicId}`,
    children: [...concepts, ...cases],
  };
}

/**
 * The map of a course: the course, its units, and the topics of each unit that can be played, each with the learner's
 * mastery of it and the levels passed, and opening the topic's own map. With a learner's `choice`, only the topics they
 * meet (Part B of Class 12: content/courseOptions.ts).
 */
export function courseMapTree(courseId: string, courseTitle: string, progress: Pick<Progress, 'concepts' | 'passedLevelIds'> | null, choice?: CourseChoice | null): MapNode {
  const course = findCourse(courseId);
  const outlines = outlinesOf(courseId, choice);
  const units: MapNode[] = [];
  for (const topic of course?.topics ?? []) {
    const outline = outlines.find((o) => o.topicId === topic.id);
    if (!outline) continue;
    let unit = units.find((u) => u.label === topic.unit);
    if (!unit) units.push((unit = { id: `unit:${units.length + 1}`, kind: 'unit', label: topic.unit, children: [] }));
    const mastery = progress ? masteryPercent(topicMastery(outline, progress as Progress)) : null;
    const passed = progress ? outline.levels.filter((l) => progress.passedLevelIds.includes(l.id)).length : null;
    unit.children.push({
      id: `topic:${topic.id}`,
      kind: 'topic',
      label: topic.title,
      detail: mastery === null || passed === null ? undefined : `${mastery}% · ${passed} of ${outline.levels.length} levels`,
      mastery,
      href: `/maps/${topic.id}`,
      children: [],
    });
  }
  for (const u of units) u.detail = plural(u.children.length, 'topic', 'topics');
  return { id: `course:${courseId}`, kind: 'course', label: courseTitle, detail: plural(units.length, 'unit', 'units'), children: units };
}

// ---------------------------------------------------------------------------------------------------------------
// Links between the topics of a course.
// ---------------------------------------------------------------------------------------------------------------

export interface MapLink {
  /** The earlier topic. */
  from: string;
  /** The later topic, which builds on it or is combined with it in a case study. */
  to: string;
  /** 'builds': authored in topicLinks.ts. 'case': an integrated case study draws on both. */
  kind: 'builds' | 'case';
  reason: string;
}

/**
 * The links between the topics of a course that can be played, in course order of their later topic: the authored
 * "builds on" links, and those that case studies make. A stage that is not the first its topic closes is an
 * integrated one (its case combines the stages before it): its topic is linked with the topic of every stage that
 * comes before it in the course. The stages name the topics they draw on only in their prose, so this is what can be
 * known of them. With a learner's `choice`, only the links between topics they meet.
 */
export function courseLinks(courseId: string, choice?: CourseChoice | null): MapLink[] {
  const order = outlinesOf(courseId, choice).map((o) => o.topicId);
  const at = (topicId: string) => order.indexOf(topicId);
  const links: MapLink[] = topicLinksOf(courseId)
    .filter((l) => at(l.from) >= 0 && at(l.to) >= 0)
    .map((l) => ({ from: l.from, to: l.to, kind: 'builds', reason: l.reason }));
  const stages = stagesOf(courseId, choice).filter((s) => s.cases.length > 0 && at(s.topicId) >= 0);
  stages.forEach((stage, i) => {
    const before = stages.slice(0, i);
    if (!before.some((s) => s.topicId === stage.topicId)) return;
    const seen = new Set<string>();
    for (const earlier of before) {
      if (earlier.topicId === stage.topicId || seen.has(earlier.topicId)) continue;
      seen.add(earlier.topicId);
      const [from, to] = at(earlier.topicId) < at(stage.topicId) ? [earlier.topicId, stage.topicId] : [stage.topicId, earlier.topicId];
      if (links.some((l) => l.kind === 'case' && l.from === from && l.to === to)) continue;
      links.push({ from, to, kind: 'case', reason: `Combined in the case study "${stage.title}".` });
    }
  });
  return links.sort((a, b) => at(a.to) - at(b.to) || at(a.from) - at(b.from) || (a.kind === b.kind ? 0 : a.kind === 'builds' ? -1 : 1));
}

// ---------------------------------------------------------------------------------------------------------------
// Walking a tree, and folding.
// ---------------------------------------------------------------------------------------------------------------

/** Every node, parents before their children, in the order of the map. */
export function walk(root: MapNode): MapNode[] {
  const out: MapNode[] = [];
  const visit = (n: MapNode) => {
    out.push(n);
    n.children.forEach(visit);
  };
  visit(root);
  return out;
}

/** The tree as it is shown: the children of a folded node left out. */
export function visibleTree(root: MapNode, folded: ReadonlySet<string>): MapNode {
  return { ...root, children: folded.has(root.id) ? [] : root.children.map((c) => visibleTree(c, folded)) };
}

/** How many nodes a node holds, at every depth below it. */
export const descendants = (node: MapNode): number => node.children.reduce((n, c) => n + 1 + descendants(c), 0);

/**
 * What is folded when a map opens: on a topic's map every node under the topic that has something in it, so the map
 * opens on the topic's concepts and its case studies; on a course's map nothing.
 */
export function initialFolded(root: MapNode): Set<string> {
  if (root.kind === 'course') return new Set();
  return new Set(walk(root).filter((n) => n !== root && n.children.length > 0).map((n) => n.id));
}
