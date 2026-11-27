import { notFound } from 'next/navigation';
import { PracticePlayer } from '@/components/play/PracticePlayer';
import { ROUTE_TOPICS } from '@/content/routes';
import { Shell } from '@/components/ui/Shell';

// Practice of one topic, `/practice/topic/<topicId>`: fresh generated questions from that topic only. Only topics with
// a content pack exist as pages; anything else is a real 404.
export const dynamicParams = false;

export function generateStaticParams() {
  return ROUTE_TOPICS.map((topic) => ({ topicId: topic.id }));
}

export default async function TopicPracticePage({ params }: { params: Promise<{ topicId: string }> }) {
  const { topicId } = await params;
  if (!ROUTE_TOPICS.some((topic) => topic.id === topicId)) notFound();
  return (
    <Shell mode="play">
      <PracticePlayer mode="fresh" topicId={topicId} />
    </Shell>
  );
}
