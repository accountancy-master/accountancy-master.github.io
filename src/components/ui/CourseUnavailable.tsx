'use client';

import { useRouter } from 'next/navigation';
import { useStore } from '@/app-state/StoreProvider';
import { Button } from './Button';

/** Shown inside Shell when the selected learner belongs to a course this version of the app does not have. */
export function CourseUnavailable() {
  const { selectProfile } = useStore();
  const router = useRouter();
  return (
    <div className="flex flex-col items-start gap-4 rounded-card border-2 border-b-4 border-edge bg-surface p-5">
      <p data-testid="course-unavailable" className="text-base font-bold">
        This learner&apos;s course isn&apos;t available in this version of the app.
      </p>
      <Button
        variant="secondary"
        data-testid="course-unavailable-switch"
        onClick={() => {
          selectProfile(null);
          router.push('/start');
        }}
      >
        Switch learner
      </Button>
    </div>
  );
}
