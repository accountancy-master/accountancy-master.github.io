import { describe, expect, it } from 'vitest';
import { COURSE_IDS } from '@/content/catalogue.generated';
import { isExamDate } from '@/storage/types';
import { EXAM_DATE_SUGGESTIONS, countdownText, daysToExam, examStage, formatDay, stageAdvice, suggestedExamDate } from './examCountdown';

describe('daysToExam', () => {
  it('counts whole days from today to the exam, across months and years', () => {
    expect(daysToExam('2026-10-22', '2026-10-22')).toBe(0);
    expect(daysToExam('2026-10-22', '2026-10-23')).toBe(1);
    expect(daysToExam('2026-10-22', '2027-02-15')).toBe(116);
    expect(daysToExam('2027-02-16', '2027-02-15')).toBe(-1);
    // A day lost to the clocks going forward is still a day.
    expect(daysToExam('2027-03-27', '2027-03-29')).toBe(2);
  });
});

describe('examStage', () => {
  it.each([
    [200, 'early'],
    [91, 'early'],
    [90, 'months'],
    [30, 'months'],
    [29, 'weeks'],
    [7, 'weeks'],
    [6, 'final'],
    [1, 'final'],
    [0, 'today'],
    [-1, 'past'],
  ] as const)('%i days is %s', (days, stage) => {
    expect(examStage(days)).toBe(stage);
  });

  it('suggests something different at every stage, closer to the exam more mock papers and weak topics', () => {
    const stages = ['early', 'months', 'weeks', 'final', 'today', 'past'] as const;
    const texts = stages.map((s) => stageAdvice(s).suggestion);
    expect(new Set(texts).size).toBe(stages.length);
    expect(stageAdvice('months').action.href).toBe('/mock');
    expect(stageAdvice('weeks').action.href).toBe('/mock');
    expect(stageAdvice('weeks').suggestion).toMatch(/weak/i);
    expect(stageAdvice('past').action.href).toBe('/settings#exam-dates');
  });
});

describe('countdownText', () => {
  it('says how many days are left to the exam of the course, in words for the last two', () => {
    expect(countdownText(116, 'Class 12 Accountancy')).toBe('116 days to your Class 12 Accountancy exam');
    expect(countdownText(1, 'Class 12 Accountancy')).toBe('1 day to your Class 12 Accountancy exam');
    expect(countdownText(0, 'Class 12 Accountancy')).toBe('Your Class 12 Accountancy exam is today');
    expect(countdownText(-3, 'Class 12 Accountancy')).toBe('Your Class 12 Accountancy exam date has passed');
  });
});

describe('formatDay', () => {
  it('writes a day as people read it, the same on every device', () => {
    expect(formatDay('2027-02-15')).toBe('Monday, 15 February 2027');
    expect(formatDay('2026-10-22')).toBe('Thursday, 22 October 2026');
  });
});

describe('the suggested exam dates', () => {
  it('has a real day for every course of the catalogue, and says where the date comes from', () => {
    for (const courseId of COURSE_IDS) {
      const s = EXAM_DATE_SUGGESTIONS[courseId];
      expect(s, courseId).toBeDefined();
      expect(isExamDate(s.date), courseId).toBe(true);
      expect(s.note.length, courseId).toBeGreaterThan(10);
    }
    expect(EXAM_DATE_SUGGESTIONS['cbse-12-accountancy'].note).toMatch(/date sheet/);
  });

  it('is offered only while it is still to come', () => {
    const { date } = EXAM_DATE_SUGGESTIONS['cbse-12-accountancy'];
    expect(suggestedExamDate('cbse-12-accountancy', '2026-10-22')?.date).toBe(date);
    expect(suggestedExamDate('cbse-12-accountancy', date)).toBeNull();
    expect(suggestedExamDate('no-such-course', '2026-10-22')).toBeNull();
  });
});
