import { notFound } from 'next/navigation';
import { Suspense } from 'react';
import { MarathonPlayer } from '@/components/marathon/MarathonPlayer';
import { ROUTE_TOPICS } from '@/content/routes';
import { MARATHON_ALL } from '@/learning/marathon';
import { MARATHON_MIX } from '@/learning/marathonMix';
import { Shell } from '@/components/ui/Shell';

// A marathon run, `/practice/marathon/<topicId>`: questions on that topic until the learner stops.
// `/practice/marathon/all` runs over every topic the learner has played, and `/practice/marathon/mix?topics=…` over
// the topics chosen on the Marathon screen. Anything else is a real 404.
export const dynamicParams = false;

const scopes = () => [MARATHON_ALL, MARATHON_MIX, ...ROUTE_TOPICS.map((topic) => topic.id)];

export function generateStaticParams() {
  return scopes().map((scope) => ({ scope }));
}

export default async function MarathonPage({ params }: { params: Promise<{ scope: string }> }) {
  const { scope } = await params;
  if (!scopes().includes(scope)) notFound();
  // The difficulty is read from the query string, which is only known in the browser.
  return (
    <Shell mode="play">
      <Suspense fallback={null}>
        <MarathonPlayer scope={scope} />
      </Suspense>
    </Shell>
  );
}
