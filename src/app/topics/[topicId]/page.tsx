import { notFound } from 'next/navigation';
import { TopicView } from '@/components/topic/TopicView';
import { ROUTE_TOPICS } from '@/content/routes';

// Only topics with a content pack exist as pages; anything else is a real 404.
export const dynamicParams = false;

export function generateStaticParams() {
  return ROUTE_TOPICS.map((topic) => ({ topicId: topic.id }));
}

export default async function TopicPage({ params }: { params: Promise<{ topicId: string }> }) {
  const { topicId } = await params;
  if (!ROUTE_TOPICS.some((topic) => topic.id === topicId)) notFound();
  return <TopicView topicId={topicId} />;
}
