'use client';

import { useState } from 'react';
import { useStore } from '@/app-state/StoreProvider';
import { courseName } from '@/components/settings/CoursePicker';
import { Chip } from '@/components/ui/Chip';
import { CalendarIcon } from '@/components/ui/icons';
import { findCourse } from '@/content/outline';
import { countdownText, daysToExam } from '@/learning/examCountdown';
import { dayKey } from '@/learning/gamification';
import { examDateOf } from '@/storage/types';

/** The countdown to the exam of the learner's course in the top bar, or a link to set its date. */
export function ExamChip() {
  const { profile } = useStore();
  // Read once per mount; the shell is only rendered in the browser.
  const [today] = useState(() => dayKey(Date.now()));
  if (!profile) return null;
  const course = findCourse(profile.courseId);
  const day = examDateOf(profile, profile.courseId);
  if (!course) return null;
  if (!day) {
    return (
      <Chip href="/settings#exam-dates" tone="outline" icon={<CalendarIcon />} data-testid="topbar-exam">
        Set exam date
      </Chip>
    );
  }
  const days = daysToExam(today, day);
  const text = countdownText(days, courseName(course));
  return (
    <Chip href="/home#exam-countdown" tone="primary" icon={<CalendarIcon />} data-testid="topbar-exam" title={text} aria-label={text}>
      {days > 0 ? `${days} ${days === 1 ? 'day' : 'days'}` : days === 0 ? 'Exam today' : 'Exam passed'}
    </Chip>
  );
}
