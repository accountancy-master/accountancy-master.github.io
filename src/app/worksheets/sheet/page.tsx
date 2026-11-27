import { Suspense } from 'react';
import { Shell } from '@/components/ui/Shell';
import { WorksheetView } from '@/components/worksheets/WorksheetView';

// One worksheet, `/worksheets/sheet?code=W11-7K3QA-M2X9B`: one page serves every sheet, which the code in the query
// string names (it is only known in the browser).
export default function WorksheetSheetPage() {
  return (
    <Shell width="wide">
      <Suspense fallback={null}>
        <WorksheetView />
      </Suspense>
    </Shell>
  );
}
