'use client';

import Link from 'next/link';
import { useMemo } from 'react';
import { useCourse } from '@/app-state/useCourse';
import { useProgress } from '@/app-state/useProgress';
import { useShellTrail } from '@/components/shell/ShellContext';
import { OtherCourse } from '@/components/topic/TopicView';
import { GroupLabel } from '@/components/ui/GroupLabel';
import { TopicsGate } from '@/components/ui/TopicsGate';
import { getTopicPack } from '@/content/loaded';
import { COURSES, findOutline } from '@/content/outline';
import type { TopicMeta } from '@/content/types';
import { topicMapTree } from '@/learning/mindMap';
import { MindMap } from './MindMap';

/** The map of one topic, once its content is loaded (the titles of its rule cards are in it). */
export function TopicMapView({ topicId }: { topicId: string }) {
  const course = useCourse();
  const topic = COURSES.flatMap((c) => c.topics).find((t) => t.id === topicId);
  useShellTrail([{ label: 'Mind maps', href: '/maps' }, { label: topic?.title ?? 'Topic' }]);
  if (!topic || !findOutline(topicId)) return null;
  if (!course.has(topicId)) return <OtherCourse topic={topic} />;
  return (
    <TopicsGate topicIds={[topicId]} loading="Getting this map ready…">
      {() => <TopicMap topic={topic} />}
    </TopicsGate>
  );
}

function TopicMap({ topic }: { topic: TopicMeta }) {
  const { progress, status } = useProgress();
  const ready = status === 'ready' ? progress : null;
  const pack = getTopicPack(topic.id)!;
  const root = useMemo(() => {
    const titles = new Map(pack.cards.map((c) => [c.id, c.prompt]));
    return topicMapTree(topic.id, topic.title, (id) => titles.get(id) ?? id, ready);
  }, [pack, topic, ready]);
  return (
    <div className="flex flex-col gap-4">
      <header className="flex flex-col gap-1">
        <GroupLabel>{topic.unit}</GroupLabel>
        <h1 className="text-3xl font-extrabold tracking-tight">Mind map: {topic.title}</h1>
        <p className="text-base text-muted">
          Its concepts with your mastery of each, and under them the rule cards and the question types. Tap a node to open it, its round button to fold or unfold it.{' '}
          <Link href={`/topics/${topic.id}`} className="font-bold text-primary-ink underline">
            The topic
          </Link>
          {' · '}
          <Link href="/maps" className="font-bold text-primary-ink underline">
            The course map
          </Link>
        </p>
      </header>
      <MindMap key={topic.id} root={root} title={topic.title} wide="mindmap" />
    </div>
  );
}
