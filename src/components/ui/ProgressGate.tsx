'use client';

import type { ReactNode } from 'react';
import { useProgress } from '@/app-state/useProgress';
import { useStore } from '@/app-state/StoreProvider';
import type { Progress } from '@/learning/progress';
import { findCourse } from '@/content/outline';
import type { Profile } from '@/storage/types';
import { Button } from './Button';
import { CourseUnavailable } from './CourseUnavailable';

/**
 * Inside Shell: shows what the selected learner's progress needs before a screen can use it. A course this version
 * does not have, a failed load (with a retry) and loading each get a notice; once progress is present it renders
 * `children`. `id` prefixes the test ids of the notices (`<id>-loading`, `<id>-retry`).
 */
export function ProgressGate({
  id,
  loading,
  children,
}: {
  id: string;
  loading: string;
  children: (ready: { profile: Profile; progress: Progress; today: string }) => ReactNode;
}) {
  const { profile } = useStore();
  const { progress, today, status, reload } = useProgress();
  // Rendered by Shell only once a profile is selected.
  if (!profile) return null;
  if (!findCourse(profile.courseId)) return <CourseUnavailable />;

  if (status === 'error') {
    return (
      <div role="alert" className="flex flex-col items-start gap-3 rounded-card border-2 border-danger bg-surface p-5">
        <p className="text-base font-bold">We couldn&apos;t load your progress.</p>
        <Button variant="secondary" data-testid={`${id}-retry`} onClick={() => void reload()}>
          Try again
        </Button>
      </div>
    );
  }
  if (progress === null || today === null) {
    return (
      <p role="status" aria-busy="true" data-testid={`${id}-loading`} className="text-base text-muted">
        {loading}
      </p>
    );
  }
  return <>{children({ profile, progress, today })}</>;
}
