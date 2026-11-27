import { Suspense } from 'react';
import { PracticalView } from '@/components/practical/PracticalView';
import { Shell } from '@/components/ui/Shell';

// Project and viva: the project work of the course (Part C of the paper), a guide and a worked example for each
// option, and the viva bank to browse and practise. A guide is at `/practical#option-<id>` and a question at
// `/practical#viva-<id>`; `?course=` shows the other course's (found by "Go to"), which is only known in the browser.
export default function PracticalPage() {
  return (
    <Shell width="wide">
      <Suspense fallback={null}>
        <PracticalView />
      </Suspense>
    </Shell>
  );
}
