'use client';

import { useContext, useState } from 'react';
import { useStore } from '@/app-state/StoreProvider';
import { courseName } from '@/components/settings/CoursePicker';
import { GROUP_LABEL } from '@/components/ui/GroupLabel';
import { findCourse, playableCourses } from '@/content/outline';
import { ShellContext } from './ShellContext';

/** "Class 11 Accountancy" as the switch writes it: "Class 11". */
export const shortCourseName = (title: string): string => courseName({ title }).replace(/\s*Accountancy$/, '');

/**
 * The course the learner is on, in the sidebar: a switch between the courses once there are two to be on, the same
 * change as the one in Settings (nothing done in the other course is lost). With one course, its name.
 */
export function CourseSwitch({ leaveTo }: { /** Set on a play screen: where to go once the course has changed. */ leaveTo?: string }) {
  const { profile, updateProfile } = useStore();
  const shell = useContext(ShellContext);
  const [saving, setSaving] = useState(false);
  const [failed, setFailed] = useState(false);
  if (!profile) return null;
  const courses = playableCourses();
  const current = findCourse(profile.courseId);

  async function choose(courseId: string) {
    if (saving || courseId === profile?.courseId) return;
    // On a play screen the course changes on the way out: the screen is asked first, and the learner lands on Home.
    if (leaveTo && shell) {
      shell.leave({ href: leaveTo, before: () => updateProfile({ courseId }).catch(() => setFailed(true)) });
      return;
    }
    setSaving(true);
    setFailed(false);
    try {
      await updateProfile({ courseId });
    } catch {
      setFailed(true);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex flex-col gap-1.5">
      <p id="sidebar-course-label" className={GROUP_LABEL}>
        Course
      </p>
      {courses.length > 1 ? (
        <div role="group" aria-labelledby="sidebar-course-label" className="grid grid-cols-2 gap-1 rounded-control border border-edge bg-sunken p-1">
          {courses.map((c) => {
            const on = c.id === profile.courseId;
            return (
              <button
                key={c.id}
                type="button"
                data-testid={`sidebar-course-${c.id}`}
                aria-pressed={on}
                disabled={saving}
                onClick={() => void choose(c.id)}
                title={courseName(c)}
                className={[
                  'min-h-9 rounded-lg px-2 text-sm font-extrabold transition-colors disabled:cursor-wait',
                  on ? 'bg-surface text-primary-ink shadow-card' : 'text-muted hover:text-ink',
                ].join(' ')}
              >
                {shortCourseName(c.title)}
              </button>
            );
          })}
        </div>
      ) : (
        <p className="text-base font-extrabold">{current ? courseName(current) : ''}</p>
      )}
      {failed ? (
        <p role="alert" className="text-sm font-bold text-danger-ink">
          Couldn&apos;t change the course. Try again.
        </p>
      ) : null}
    </div>
  );
}
