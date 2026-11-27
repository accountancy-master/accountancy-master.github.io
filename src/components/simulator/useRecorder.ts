'use client';

import { useCallback, useRef, useState } from 'react';
import { useStore } from '@/app-state/StoreProvider';
import { useProgress } from '@/app-state/useProgress';
import { newId } from '@/lib/ids';
import type { SessionKind } from '@/storage/types';
import { simAttempt, simXp, type SimAnswer } from './record';

/**
 * Records the answers of one sitting of the simulator (a run of predictions, a level), one after another, and says
 * what each earned. Every screen sees them once they are stored.
 */
export function useRecorder(kind: SessionKind, levelId?: string) {
  const { store, profile } = useStore();
  const { attempts, reload } = useProgress();
  const [sessionId] = useState(() => newId());
  const [rightBefore] = useState(() => new Set(attempts.filter((a) => a.correct).map((a) => a.questionId)));
  const queue = useRef<Promise<void>>(Promise.resolve());
  const [failed, setFailed] = useState(false);

  const record = useCallback(
    (answer: SimAnswer): number => {
      if (!profile) return 0;
      const xp = simXp(answer, rightBefore.has(answer.question.id));
      if (answer.correct) rightBefore.add(answer.question.id);
      const event = simAttempt(profile, answer, { sessionId, sessionKind: kind, levelId });
      queue.current = queue.current
        .then(() => store.appendAttempt(event))
        .then(() => reload())
        .catch(() => setFailed(true));
      return xp;
    },
    [profile, rightBefore, sessionId, kind, levelId, store, reload],
  );

  /** Resolves once everything recorded so far has been stored. */
  const settled = useCallback(() => queue.current, []);

  return { record, settled, sessionId, failed };
}
