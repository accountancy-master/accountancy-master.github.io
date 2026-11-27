'use client';

import { useState } from 'react';
import type { Course } from '@/content/types';

const COURSE_FAILED = "Couldn't change the course. Try again.";

/** A line under each course's name where a course is chosen: what it covers, in a few words. */
const COURSE_NOTE: Readonly<Record<string, string>> = {
  'cbse-11-accountancy': 'Journal entries, the ledger and the trial balance, up to the final accounts',
  'cbse-12-accountancy': 'Partnership firms, company accounts and the analysis of financial statements',
};

/** "Class 11 Accountancy (CBSE)" as a choice names it: "Class 11 Accountancy". */
export const courseName = (course: Pick<Course, 'title'>): string => course.title.replace(/\s*\(CBSE\)\s*$/, '');

/**
 * The courses to choose from, one button each, the one chosen marked. Where a learner is made it sets the course
 * they will join; in Settings it changes the course of the learner at once (`choose` then saves it).
 */
export function CoursePicker({
  courses,
  current,
  choose,
  labelledBy,
  describedBy,
}: {
  courses: readonly Course[];
  current: string;
  /** Takes the choice. A promise that rejects says the choice could not be saved. */
  choose(courseId: string): Promise<unknown> | void;
  labelledBy: string;
  describedBy?: string;
}) {
  const [saving, setSaving] = useState(false);
  const [failed, setFailed] = useState(false);

  async function pick(courseId: string) {
    if (saving || courseId === current) return;
    setSaving(true);
    setFailed(false);
    try {
      await choose(courseId);
    } catch {
      setFailed(true);
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <div role="group" aria-labelledby={labelledBy} aria-describedby={describedBy} className="grid gap-3 sm:grid-cols-2">
        {courses.map((course) => {
          const chosen = course.id === current;
          return (
            <button
              key={course.id}
              type="button"
              data-testid={`course-${course.id}`}
              aria-pressed={chosen}
              disabled={saving}
              onClick={() => void pick(course.id)}
              className={[
                'flex min-h-14 flex-col items-start justify-center gap-0.5 rounded-control border-2 border-b-4 px-4 py-2 text-left text-base font-extrabold disabled:cursor-not-allowed',
                chosen ? 'border-primary bg-primary-soft text-primary-ink' : 'border-edge-deep bg-surface text-ink hover:bg-canvas',
              ].join(' ')}
            >
              <span>{courseName(course)}</span>
              {COURSE_NOTE[course.id] ? <span className="text-sm font-semibold text-muted">{COURSE_NOTE[course.id]}</span> : null}
              <span className="min-h-4 text-sm font-bold">{chosen ? '✓ Chosen' : ''}</span>
            </button>
          );
        })}
      </div>
      {failed && (
        <p role="alert" data-testid="course-error" className="text-base font-bold text-danger-ink">
          {COURSE_FAILED}
        </p>
      )}
    </>
  );
}
