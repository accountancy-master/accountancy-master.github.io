'use client';

import Link from 'next/link';
import { useState } from 'react';
import { useStore } from '@/app-state/StoreProvider';
import { courseName } from '@/components/settings/CoursePicker';
import { Button, buttonClasses } from '@/components/ui/Button';
import { PART_B_LABEL, partBOfTopic, type PartB } from '@/content/courseOptions';
import { courseOfTopic, findCourse } from '@/content/outline';
import type { TopicMeta } from '@/content/types';

/**
 * A topic of the other course ("Go to" finds both, and a shared link may lead to one): it says so, and offers the
 * switch (nothing is lost by it), after which the page opens what was asked for. A topic of the learner's own course
 * that belongs to the choice of Part B they have not made (content/courseOptions.ts) says that instead, and offers
 * that choice. `level` is the title of a level of the topic when a level was asked for (a link to `/play/<level>`).
 */
export function OtherCourse({ topic, level, testId = 'topic-other-course' }: { topic: TopicMeta; level?: string; testId?: string }) {
  const { profile, updateProfile } = useStore();
  const other = findCourse(courseOfTopic(topic.id) ?? '');
  const [failed, setFailed] = useState(false);
  const partB = partBOfTopic(topic.id);
  if (other && profile && other.id === profile.courseId && partB !== undefined) return <OtherPartB topic={topic} partB={partB} level={level} />;
  return (
    <div data-testid={testId} className="flex flex-col items-start gap-4 rounded-card border border-dashed border-edge-deep bg-sunken p-5">
      {level ? (
        <>
          <h1 className="text-2xl font-extrabold">This level is in {other ? courseName(other) : 'another course'}</h1>
          <p className="text-base font-bold">
            &ldquo;{level}&rdquo; is a level of {topic.title}, in {other ? courseName(other) : 'another course'}. Switch to it to open the level; what you have done in your
            course is kept, and you can switch back at any time.
          </p>
        </>
      ) : (
        <p className="text-base font-bold">
          {topic.title} belongs to {other ? courseName(other) : 'another course'}. You can switch to it here or in Settings; what you have done in your
          course is kept.
        </p>
      )}
      <div className="flex flex-wrap gap-3">
        {other ? (
          <Button data-testid="topic-switch-course" onClick={() => void updateProfile({ courseId: other.id }).catch(() => setFailed(true))}>
            {level ? `Switch to ${courseName(other)} and open it` : `Switch to ${courseName(other)}`}
          </Button>
        ) : null}
        <Link href="/topics" className={buttonClasses('secondary')}>
          Back to topics
        </Link>
      </div>
      {failed ? (
        <p role="alert" className="font-bold text-danger-ink">
          Couldn&apos;t change the course. Try again.
        </p>
      ) : null}
    </div>
  );
}

/** A topic of the choice of Part B the learner has not made: it says so, and offers that choice (nothing is lost by it). */
function OtherPartB({ topic, partB, level }: { topic: TopicMeta; partB: PartB; level?: string }) {
  const { updateProfile } = useStore();
  const [failed, setFailed] = useState(false);
  const label = PART_B_LABEL[partB];
  return (
    <div data-testid="topic-other-part-b" className="flex flex-col items-start gap-4 rounded-card border border-dashed border-edge-deep bg-sunken p-5">
      <p className="text-base font-bold">
        {level ? <>&ldquo;{level}&rdquo; is a level of {topic.title}. </> : null}
        {topic.title} is part of {label}, which a school may teach as Part B of the course in place of {PART_B_LABEL[partB === 'computerised' ? 'analysis' : 'computerised']}. You can take {label} as Part B here or in Settings; what you have done is kept.
      </p>
      <div className="flex flex-wrap gap-3">
        <Button data-testid="topic-switch-part-b" onClick={() => void updateProfile({ class12PartB: partB }).catch(() => setFailed(true))}>
          Take {label} as Part B
        </Button>
        <Link href="/topics" className={buttonClasses('secondary')}>
          Back to topics
        </Link>
      </div>
      {failed ? (
        <p role="alert" className="font-bold text-danger">
          Couldn&apos;t change Part B. Try again.
        </p>
      ) : null}
    </div>
  );
}
