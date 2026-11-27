import { describe, expect, it } from 'vitest';
import type { MarathonSubtopic } from '@/learning/marathonSubtopics';
import { describeSubtopic, subtopicChoiceLabel, subtopicCoverage } from './subtopicText';

const subtopic = (generators: [number, number], questions: [number, number]): MarathonSubtopic => ({
  id: 's',
  title: 'A subtopic',
  generators: { open: generators[0], all: generators[1] },
  questions: { open: questions[0], all: questions[1] },
  ready: generators[0] + questions[0] > 0,
});

describe('what the Marathon screen says about a subtopic', () => {
  it('counts its question types and its questions, each in the singular for one', () => {
    expect(describeSubtopic(subtopic([7, 7], [5, 5]))).toBe('7 question types · 5 questions');
    expect(describeSubtopic(subtopic([1, 1], [1, 1]))).toBe('1 question type · 1 question');
  });

  it('leaves out the kind it has none of', () => {
    expect(describeSubtopic(subtopic([4, 4], [0, 0]))).toBe('4 question types');
    expect(describeSubtopic(subtopic([0, 0], [9, 9]))).toBe('9 questions');
  });

  it('says how many are open while some are still locked', () => {
    expect(describeSubtopic(subtopic([3, 7], [5, 5]))).toBe('3 of 7 question types · 5 questions');
    expect(describeSubtopic(subtopic([3, 7], [0, 5]))).toBe('3 of 7 question types · 0 of 5 questions');
    expect(describeSubtopic(subtopic([0, 1], [1, 2]))).toBe('0 of 1 question type · 1 of 2 questions');
  });

  it('gives the reason for one that cannot be ticked', () => {
    expect(describeSubtopic(subtopic([0, 7], [0, 5]))).toBe('Locked. Pass more levels here first.');
    expect(describeSubtopic(subtopic([0, 0], [0, 0]))).toBe('No questions yet');
  });
});

describe('how much of a topic a run covers', () => {
  it('is said as so many of the subtopics', () => {
    expect(subtopicCoverage(3, 7)).toBe('3 of 7 subtopics');
    expect(subtopicCoverage(1, 9)).toBe('1 of 9 subtopics');
    expect(subtopicCoverage(1, 1)).toBe('1 of 1 subtopic');
  });

  it('is "All" on the button of the list when every subtopic is ticked', () => {
    expect(subtopicChoiceLabel(8, 8)).toBe('All 8 subtopics');
    expect(subtopicChoiceLabel(3, 8)).toBe('3 of 8 subtopics');
    expect(subtopicChoiceLabel(0, 8)).toBe('0 of 8 subtopics');
  });
});
