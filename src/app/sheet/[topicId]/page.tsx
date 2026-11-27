import { notFound } from 'next/navigation';
import { QuickSheet } from '@/components/sheet/QuickSheet';
import { ROUTE_TOPICS } from '@/content/routes';
import { Shell } from '@/components/ui/Shell';

// Only topics with a content pack have a sheet; anything else is a real 404.
export const dynamicParams = false;

export function generateStaticParams() {
  return ROUTE_TOPICS.map((topic) => ({ topicId: topic.id }));
}

export default async function SheetPage({ params }: { params: Promise<{ topicId: string }> }) {
  const { topicId } = await params;
  if (!ROUTE_TOPICS.some((topic) => topic.id === topicId)) notFound();
  return (
    <Shell>
      <QuickSheet topicId={topicId} />
    </Shell>
  );
}
