import { Suspense } from 'react';
import { Playground } from '@/components/playground/Playground';

// The Playground: every question pattern of the course and every case study, to play at once. What is shown and what
// is played are in the query string (`?topic=…&pattern=…`, `?topics=…&kinds=…`, `?mix=…`), which is only known in the
// browser.
export default function PlaygroundPage() {
  return (
    <Suspense fallback={null}>
      <Playground />
    </Suspense>
  );
}
