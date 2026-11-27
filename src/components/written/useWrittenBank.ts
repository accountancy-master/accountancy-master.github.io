'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useCourse } from '@/app-state/useCourse';
import { useProgress } from '@/app-state/useProgress';
import { topicShown } from '@/content/courseOptions';
import { loadWritten, type WrittenQuestion } from '@/content/written';
import { latestOutcomes } from '@/content/written/practice';
import type { WrittenResult } from '@/storage/types';

export interface WrittenBank {
  /** The written questions of the learner's course, of the topics they meet; null while they are fetched. */
  questions: readonly WrittenQuestion[] | null;
  failed: boolean;
  retry(): void;
  /** The latest result of each question the learner has written (in the course they are on). */
  latest: ReadonlyMap<string, WrittenResult>;
}

/**
 * The written questions of the learner's course, fetched when a screen first needs them (they are in no page's code),
 * with the learner's latest result on each. `wanted` false fetches nothing (a screen with nothing to show from them).
 */
export function useWrittenBank(wanted = true): WrittenBank {
  const course = useCourse();
  const { writtenResults } = useProgress();
  const [loaded, setLoaded] = useState<{ courseId: string; questions: readonly WrittenQuestion[] } | null>(null);
  const [failedFor, setFailedFor] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const { courseId } = course;

  useEffect(() => {
    if (!wanted || courseId === '') return;
    let current = true;
    loadWritten(courseId).then(
      (questions) => {
        if (!current) return;
        setLoaded({ courseId, questions });
        setFailedFor(null);
      },
      () => current && setFailedFor(courseId),
    );
    return () => {
      current = false;
    };
  }, [wanted, courseId, attempt]);

  // Only the topics the learner meets: none of the other choice of Part B of Class 12.
  const { choice } = course;
  const all = loaded && loaded.courseId === courseId ? loaded.questions : null;
  const questions = useMemo(() => (all ? all.filter((q) => topicShown(q.topicId, choice)) : null), [all, choice]);
  const latest = useMemo(() => latestOutcomes(writtenResults), [writtenResults]);
  const retry = useCallback(() => {
    setFailedFor(null);
    setAttempt((n) => n + 1);
  }, []);
  return { questions, failed: failedFor === courseId, retry, latest };
}
