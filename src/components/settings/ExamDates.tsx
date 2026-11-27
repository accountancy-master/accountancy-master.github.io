'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/Button';
import type { Course } from '@/content/types';
import { formatDay, suggestedExamDate } from '@/learning/examCountdown';
import { dayKey } from '@/learning/gamification';
import { examDateOf, isExamDate, type Profile } from '@/storage/types';
import { courseName } from './CoursePicker';

const SAVE_FAILED = "Couldn't save the date. Try again.";

/**
 * The day of the learner's exam in each course, kept with the learner (a backup carries it). Where the date is
 * usually known, it is offered, with where to check it.
 */
export function ExamDates({
  profile,
  courses,
  save,
}: {
  profile: Profile;
  courses: readonly Course[];
  save(examDates: Record<string, string>): Promise<unknown>;
}) {
  const [saving, setSaving] = useState(false);
  const [failed, setFailed] = useState(false);
  // Read once per visit.
  const [today] = useState(() => dayKey(Date.now()));

  async function set(courseId: string, day: string | null) {
    if (saving) return;
    const next = { ...(profile.examDates ?? {}) };
    if (day === null) delete next[courseId];
    else next[courseId] = day;
    setSaving(true);
    setFailed(false);
    try {
      await save(next);
    } catch {
      setFailed(true);
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <p id="exam-help" className="text-base">
        Home counts down to your exam and, as it comes closer, points you to mock papers and your weak topics.
      </p>
      <ul className="flex flex-col gap-4">
        {courses.map((course) => {
          const day = examDateOf(profile, course.id);
          const suggestion = suggestedExamDate(course.id, today);
          const inputId = `exam-date-input-${course.id}`;
          return (
            <li key={course.id} data-testid={`exam-row-${course.id}`} className="flex flex-col gap-2 rounded-control border border-edge bg-sunken p-3">
              <label htmlFor={inputId} className="text-base font-extrabold">
                {courseName(course)}
              </label>
              <div className="flex flex-wrap items-center gap-2">
                <input
                  id={inputId}
                  type="date"
                  data-testid={`exam-date-${course.id}`}
                  // Keyed by the stored day, so that a day stored meanwhile (a restored backup) shows at once.
                  key={day ?? 'none'}
                  defaultValue={day ?? ''}
                  min={today}
                  disabled={saving}
                  aria-describedby="exam-help"
                  onChange={(e) => {
                    const value = e.target.value;
                    if (value === '') void set(course.id, null);
                    else if (isExamDate(value) && value !== day) void set(course.id, value);
                  }}
                  className="min-h-11 rounded-control border border-edge-deep bg-surface px-3 text-base"
                />
                {day ? (
                  <Button variant="ghost" data-testid={`exam-clear-${course.id}`} disabled={saving} onClick={() => void set(course.id, null)}>
                    Clear
                  </Button>
                ) : null}
              </div>
              <p data-testid={`exam-saved-${course.id}`} className="text-sm font-bold text-muted">
                {day ? `Set for ${formatDay(day)}.` : 'No date set.'}
              </p>
              {suggestion && suggestion.date !== day ? (
                <div className="flex flex-col items-start gap-1">
                  <Button variant="secondary" data-testid={`exam-suggest-${course.id}`} disabled={saving} onClick={() => void set(course.id, suggestion.date)}>
                    Use {formatDay(suggestion.date)}
                  </Button>
                  <p className="text-sm text-muted">{suggestion.note}</p>
                </div>
              ) : null}
            </li>
          );
        })}
      </ul>
      {failed && (
        <p role="alert" data-testid="exam-error" className="text-base font-bold text-danger-ink">
          {SAVE_FAILED}
        </p>
      )}
    </>
  );
}
