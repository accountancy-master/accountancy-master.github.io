'use client';

import type { ReactNode } from 'react';
import { useTopics } from '@/app-state/useTopics';
import { Frame, Loading } from '@/components/play/PlayFrame';
import { Button } from './Button';

const FAILED = "We couldn't load this. Check your connection, then try again.";

/**
 * Around whatever plays or shows the content of topics: says which topics are needed, and renders `children` once
 * they are loaded (see app-state/useTopics.ts). Until then it shows `loading`; when a topic could not be fetched, a
 * notice with a retry. `page` is for a screen that fills the page itself (a player); without it the notices are those
 * of a screen inside the Shell. Everything inside may look the topics up as if they had always been there.
 */
export function TopicsGate({
  topicIds,
  loading = 'Getting this topic ready…',
  page = false,
  children,
}: {
  topicIds: readonly string[];
  loading?: string;
  page?: boolean;
  children: () => ReactNode;
}) {
  const { status, retry } = useTopics(topicIds);
  if (status === 'ready') return <>{children()}</>;

  if (status === 'error') {
    const notice = (
      <div role="alert" data-testid="topics-error" className="flex flex-col items-start gap-3 rounded-card border-2 border-danger bg-surface p-5">
        <p className="text-base font-bold">{FAILED}</p>
        <Button variant="secondary" data-testid="topics-retry" onClick={retry}>
          Try again
        </Button>
      </div>
    );
    return page ? <Frame>{notice}</Frame> : notice;
  }

  if (page) return <Loading>{loading}</Loading>;
  return (
    <p role="status" aria-busy="true" data-testid="topics-loading" className="text-base text-muted">
      {loading}
    </p>
  );
}
