import { Suspense } from 'react';
import { Shell } from '@/components/ui/Shell';
import { WorksheetBuilder } from '@/components/worksheets/WorksheetBuilder';

// Worksheets: choose what a printable sheet asks. `?topic=<id>` starts from one topic, `?code=<code>` from the
// choices of a sheet; both are read in the browser.
export default function WorksheetsPage() {
  return (
    <Shell width="wide">
      <Suspense fallback={null}>
        <WorksheetBuilder />
      </Suspense>
    </Shell>
  );
}
