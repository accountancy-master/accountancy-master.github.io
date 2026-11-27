'use client';

import Link from 'next/link';
import { useMemo } from 'react';
import { layoutTree } from '@/learning/mapLayout';
import { initialFolded, topicMapTree, visibleTree, walk } from '@/learning/mindMap';
import type { Progress } from '@/learning/progress';
import type { TopicPack } from '@/content/types';
import { MapContent } from './MapSvg';

/**
 * On a topic's page: a small picture of the topic's mind map (the topic and its concepts, with the learner's mastery
 * rings) that opens the map itself.
 */
export function MapPreview({ title, pack, progress }: { title: string; pack: TopicPack; progress: Progress | null }) {
  const { root, layout, folded } = useMemo(() => {
    const titles = new Map(pack.cards.map((c) => [c.id, c.prompt]));
    const tree = topicMapTree(pack.topicId, title, (id) => titles.get(id) ?? id, progress);
    const start = initialFolded(tree);
    return { root: tree, folded: start, layout: layoutTree(visibleTree(tree, start), { mode: 'mindmap' }) };
  }, [pack, title, progress]);
  const all = useMemo(() => walk(root), [root]);
  const nodes = useMemo(() => new Map(all.map((n) => [n.id, n])), [all]);
  const count = (kind: string) => all.filter((n) => n.kind === kind).length;
  return (
    <Link
      href={`/maps/${pack.topicId}`}
      data-testid="topic-map-link"
      className="flex flex-col gap-2 rounded-card border border-edge bg-surface p-4 shadow-card transition-shadow hover:shadow-card-hover"
    >
      <span className="flex items-baseline justify-between gap-3">
        <span className="text-base font-extrabold text-primary-ink">Mind map</span>
        <span className="text-sm font-bold text-primary-ink">
          Open <span aria-hidden="true">→</span>
        </span>
      </span>
      <svg viewBox={`0 0 ${layout.width} ${layout.height}`} width="100%" height="168" aria-hidden="true" data-testid="topic-map-preview" className="rounded-control bg-sunken">
        <MapContent paint={{ layout, nodes, folded, idPrefix: `preview-${pack.topicId}` }} />
      </svg>
      <span className="text-sm text-muted">
        {count('concept')} concepts, {count('card')} rule cards and {count('pattern')} question types of {title} on one map.
      </span>
    </Link>
  );
}
