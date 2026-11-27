import type { TopicSize } from '@/content/outline';

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/**
 * "35 question types · 6 case studies · 62 set questions · 21 rule cards", in a learner's words: a question type makes
 * a new question every time it is played, a set question is written once. Case studies are named only for a topic
 * that has some.
 */
export function describeTopicSize(size: TopicSize): string {
  return [
    plural(size.generators, 'question type', 'question types'),
    ...(size.cases > 0 ? [plural(size.cases, 'case study', 'case studies')] : []),
    plural(size.questions, 'set question', 'set questions'),
    plural(size.cards, 'rule card', 'rule cards'),
  ].join(' · ');
}
