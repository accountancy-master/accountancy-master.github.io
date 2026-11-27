'use client';

import { useCallback, useEffect, useState, useSyncExternalStore } from 'react';
import { loadTopics, topicsLoaded } from '@/content/loadTopics';
import { onTopicLoaded } from '@/content/loaded';

export type TopicsStatus = 'loading' | 'ready' | 'error';

const SEPARATOR = '\n';
const idsOf = (key: string): string[] => (key === '' ? [] : key.split(SEPARATOR));

/**
 * The content of the topics a screen needs (their packs, generators and case studies), fetched when the screen asks
 * (see content/loadTopics.ts). `ready` once every one of them can be looked up, and it then stays so: a topic that
 * has been loaded is there for as long as the app stays open, and is not fetched again. `error` when one could not be
 * fetched (no network, and the topic not yet stored for offline use); `retry` tries again.
 */
export function useTopics(topicIds: readonly string[]): { status: TopicsStatus; retry(): void } {
  // Compared by what it names, so a caller may hand in a new list on every render.
  const key = topicIds.join(SEPARATOR);
  // Nothing is loaded while a page is prerendered, and the first render in the browser must agree with that.
  const ready = useSyncExternalStore(
    onTopicLoaded,
    () => topicsLoaded(idsOf(key)),
    () => key === '',
  );
  const [attempt, setAttempt] = useState(0);
  const [failed, setFailed] = useState<{ key: string; attempt: number } | null>(null);

  useEffect(() => {
    if (ready) return;
    let current = true;
    loadTopics(idsOf(key)).catch(() => {
      if (current) setFailed({ key, attempt });
    });
    return () => {
      current = false;
    };
  }, [key, ready, attempt]);

  const retry = useCallback(() => setAttempt((n) => n + 1), []);
  const error = failed !== null && failed.key === key && failed.attempt === attempt;
  return { status: ready ? 'ready' : error ? 'error' : 'loading', retry };
}
