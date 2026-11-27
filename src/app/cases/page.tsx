import { Suspense } from 'react';
import { CasesView } from '@/components/cases/CasesView';
import { Shell } from '@/components/ui/Shell';

// The case studies; `?topic=<id>` shows those about one topic (a topic's page links there), known only in the browser.
export default function CasesPage() {
  return (
    <Shell width="wide">
      <Suspense fallback={null}>
        <CasesView />
      </Suspense>
    </Shell>
  );
}
