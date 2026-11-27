import { dayDiff } from './gamification';

// ---------------------------------------------------------------------------------------------------------------
// The exam countdown: how many days are left to the exam date the learner set for their course (Settings), and what
// to do with them. The closer the exam, the more Home points to mock papers and weak topics.
// ---------------------------------------------------------------------------------------------------------------

/**
 * A date to offer a learner who has not set one, for each course, with where it comes from. Nothing is fetched: these
 * are written here by hand.
 *
 * TO BE UPDATED EVERY YEAR, once the board publishes its date sheet (usually in December): CBSE board exams usually
 * begin in mid-February, and the day of each paper is in the date sheet on cbse.gov.in. Class 11 is examined by the
 * school, so its date is only a usual time of year.
 */
export const EXAM_DATE_SUGGESTIONS: Readonly<Record<string, { date: string; note: string }>> = {
  'cbse-11-accountancy': {
    date: '2027-03-01',
    note: 'Class 11 exams are set by your school, usually in late February or March. Check the date with your school.',
  },
  'cbse-12-accountancy': {
    date: '2027-02-15',
    note: 'CBSE board exams usually begin in mid-February. Check the board’s date sheet for the day of the Accountancy paper.',
  },
};

/** The suggestion for a course while its day is still to come; null when there is none, or it has gone by. */
export function suggestedExamDate(courseId: string, today: string): { date: string; note: string } | null {
  const s = Object.hasOwn(EXAM_DATE_SUGGESTIONS, courseId) ? EXAM_DATE_SUGGESTIONS[courseId] : undefined;
  return s && daysToExam(today, s.date) > 0 ? s : null;
}

/** Whole days from today to the exam (both local days, YYYY-MM-DD): 0 on the day, negative after it. */
export const daysToExam = (today: string, examDay: string): number => dayDiff(today, examDay);

/**
 * Where the learner stands: early (more than 90 days), months (30 to 90), weeks (7 to 29), final (1 to 6), the day
 * itself, or past.
 */
export type ExamStage = 'early' | 'months' | 'weeks' | 'final' | 'today' | 'past';

export function examStage(days: number): ExamStage {
  if (days < 0) return 'past';
  if (days === 0) return 'today';
  if (days < 7) return 'final';
  if (days < 30) return 'weeks';
  if (days <= 90) return 'months';
  return 'early';
}

export interface StageAdvice {
  /** One sentence on how to use the time left. */
  suggestion: string;
  /** The one thing to do about it. */
  action: { label: string; href: string };
}

const ADVICE: Record<ExamStage, StageAdvice> = {
  early: {
    suggestion: 'Plenty of time. Work through the topics in order and keep a daily streak: little and often beats cramming.',
    action: { label: 'Go to topics', href: '/topics' },
  },
  months: {
    suggestion: 'Finish the topics you have left, and sit a mock paper every week or two to see where the marks are.',
    action: { label: 'Mock papers', href: '/mock' },
  },
  weeks: {
    suggestion: 'Time for full mock papers against the clock, and for your weak topics: fix what the papers show up.',
    action: { label: 'Sit a mock paper', href: '/mock' },
  },
  final: {
    suggestion: 'The last few days: revise the quick sheets and rule cards, and put your open mistakes right.',
    action: { label: 'Revise cards', href: '/practice/cards' },
  },
  today: {
    suggestion: 'Exam day. Read each question twice, show your working, and keep an eye on the clock. All the best!',
    action: { label: 'Quick sheets', href: '/sheets' },
  },
  past: {
    suggestion: 'Your exam date has gone by. Set the date of your next exam to count down to it.',
    action: { label: 'Set the date', href: '/settings#exam-dates' },
  },
};

export const stageAdvice = (stage: ExamStage): StageAdvice => ADVICE[stage];

/** "116 days to your Class 12 Accountancy exam", with the day itself and a past date said in words. */
export function countdownText(days: number, courseName: string): string {
  if (days < 0) return `Your ${courseName} exam date has passed`;
  if (days === 0) return `Your ${courseName} exam is today`;
  return `${days} ${days === 1 ? 'day' : 'days'} to your ${courseName} exam`;
}

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

/** "Monday, 15 February 2027": written out by hand, so a prerendered page and the browser say the same. */
export function formatDay(day: string): string {
  const [y, m, d] = day.split('-').map(Number);
  const weekday = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  return `${WEEKDAYS[weekday]}, ${d} ${MONTHS[m - 1]} ${y}`;
}
