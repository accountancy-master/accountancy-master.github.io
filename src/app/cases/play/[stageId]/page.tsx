import { notFound } from 'next/navigation';
import { Suspense } from 'react';
import { CasePlayer } from '@/components/cases/CasePlayer';
import { CATALOGUE_CASE_STAGES } from '@/content/catalogue.generated';
import { MIXED_CASES } from '@/learning/caseStudies';
import { Shell } from '@/components/ui/Shell';

// A case played from the Case studies screen, `/cases/play/<stageId>`: the stage's next case, or with `?case=<id>`
// the one chosen; `/cases/play/mixed` takes a case from any open stage. Only stages that have cases exist as pages.
export const dynamicParams = false;

const stageIds = () => [MIXED_CASES, ...CATALOGUE_CASE_STAGES];

export function generateStaticParams() {
  return stageIds().map((stageId) => ({ stageId }));
}

export default async function CasePlayPage({ params }: { params: Promise<{ stageId: string }> }) {
  const { stageId } = await params;
  if (!stageIds().includes(stageId)) notFound();
  // The chosen case is read from the query string, which is only known in the browser.
  return (
    <Shell mode="play">
      <Suspense fallback={null}>
        <CasePlayer stageId={stageId} />
      </Suspense>
    </Shell>
  );
}
