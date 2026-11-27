import { notFound } from 'next/navigation';
import { Suspense } from 'react';
import { WrittenPractice } from '@/components/written/WrittenPractice';
import { Shell } from '@/components/ui/Shell';
import { ROUTE_TOPICS } from '@/content/routes';
import { WRITTEN_REWRITE } from '@/content/written/practice';

// A practice of written answers: `/written/<topicId>` takes that topic's questions, `/written/rewrite` every question
// still to rewrite. The form, the marks and the question to start on (`?form=`, `?marks=`, `?q=`) are read from the
// query string, which is only known in the browser. Anything else is a real 404.
export const dynamicParams = false;

const scopes = () => [WRITTEN_REWRITE, ...ROUTE_TOPICS.map((topic) => topic.id)];

export function generateStaticParams() {
  return scopes().map((scope) => ({ scope }));
}

export default async function WrittenPracticePage({ params }: { params: Promise<{ scope: string }> }) {
  const { scope } = await params;
  if (!scopes().includes(scope)) notFound();
  return (
    <Shell width="wide">
      <Suspense fallback={null}>
        <WrittenPractice scope={scope} />
      </Suspense>
    </Shell>
  );
}
