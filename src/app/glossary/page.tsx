import { Suspense } from 'react';
import { GlossaryView } from '@/components/glossary/GlossaryView';
import { Shell } from '@/components/ui/Shell';

// The glossary: every term of the course, A to Z. A term is at `/glossary#<id>`; `?course=` shows the glossary of the
// other course (a term "Go to" found there), which is only known in the browser.
export default function GlossaryPage() {
  return (
    <Shell width="wide">
      <Suspense fallback={null}>
        <GlossaryView />
      </Suspense>
    </Shell>
  );
}
