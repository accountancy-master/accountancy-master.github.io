import { Suspense } from 'react';
import { Simulator } from '@/components/simulator/Simulator';
import { Shell } from '@/components/ui/Shell';

// The simulator of the accounting equation: watch, predict, free play and find the mistake. The mode is in the query
// string (`?mode=predict`), which is only known in the browser.
export default function SimulatorPage() {
  return (
    <Shell width="wide">
      <Suspense fallback={null}>
        <Simulator />
      </Suspense>
    </Shell>
  );
}
