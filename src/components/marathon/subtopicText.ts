import type { MarathonSubtopic, SubtopicCount } from '@/learning/marathonSubtopics';

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/** "7 generators", or "3 of 7 generators" while some are still locked; nothing for a subtopic that has none at all. */
const counted = (count: SubtopicCount, one: string, many: string): string[] => {
  if (count.all === 0) return [];
  return [count.open === count.all ? plural(count.all, one, many) : `${count.open} of ${plural(count.all, one, many)}`];
};

/**
 * The line under a subtopic's title on the Marathon screen: what a marathon can serve of it ("7 generators · 5
 * questions", "3 of 7 generators · 5 questions"), or for one that cannot be ticked the reason why.
 */
export function describeSubtopic(subtopic: MarathonSubtopic): string {
  if (!subtopic.ready) return subtopic.generators.all + subtopic.questions.all === 0 ? 'No questions yet' : 'Locked. Pass more levels here first.';
  return [...counted(subtopic.generators, 'question type', 'question types'), ...counted(subtopic.questions, 'question', 'questions')].join(' · ');
}

/** How much of a topic a run covers: "3 of 7 subtopics". */
export const subtopicCoverage = (chosen: number, all: number): string => `${chosen} of ${plural(all, 'subtopic', 'subtopics')}`;

/** The same on the button that opens the list, where all of them is the usual case: "All 7 subtopics". */
export const subtopicChoiceLabel = (ticked: number, all: number): string =>
  ticked === all ? `All ${plural(all, 'subtopic', 'subtopics')}` : subtopicCoverage(ticked, all);
