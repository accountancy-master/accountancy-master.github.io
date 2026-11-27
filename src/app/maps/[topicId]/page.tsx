import { notFound } from 'next/navigation';
import { TopicMapView } from '@/components/maps/TopicMapView';
import { Shell } from '@/components/ui/Shell';
import { ROUTE_TOPICS } from '@/content/routes';

// Only topics with a content pack have a map; anything else is a real 404.
export const dynamicParams = false;

export function generateStaticParams() {
  return ROUTE_TOPICS.map((topic) => ({ topicId: topic.id }));
}

export default async function TopicMapPage({ params }: { params: Promise<{ topicId: string }> }) {
  const { topicId } = await params;
  if (!ROUTE_TOPICS.some((topic) => topic.id === topicId)) notFound();
  return (
    <Shell width="wide">
      <TopicMapView topicId={topicId} />
    </Shell>
  );
}
