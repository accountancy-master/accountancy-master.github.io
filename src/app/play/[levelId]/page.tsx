import { notFound } from 'next/navigation';
import { Player } from '@/components/play/Player';
import { ROUTE_TOPICS } from '@/content/routes';
import { Shell } from '@/components/ui/Shell';

export const dynamicParams = false;

export function generateStaticParams() {
  return ROUTE_TOPICS.flatMap((topic) => topic.levelIds.map((levelId) => ({ levelId })));
}

export default async function PlayPage({ params }: { params: Promise<{ levelId: string }> }) {
  const { levelId } = await params;
  if (!ROUTE_TOPICS.some((topic) => topic.levelIds.includes(levelId))) notFound();
  return (
    <Shell mode="play">
      <Player levelId={levelId} />
    </Shell>
  );
}
