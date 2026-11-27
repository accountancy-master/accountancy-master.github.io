import { Suspense } from 'react';
import { MockPaperPlayer } from '@/components/mock/MockPaperPlayer';
import { Shell } from '@/components/ui/Shell';

// One mock paper, `/mock/paper?paper=<key>` (the key names its kind, topic and number: "full.3", "topic.ledger.2").
// One page serves every paper: which paper is read from the query string, which is only known in the browser.
export default function MockPaperPage() {
  return (
    <Shell mode="play">
      <Suspense fallback={null}>
        <MockPaperPlayer />
      </Suspense>
    </Shell>
  );
}
