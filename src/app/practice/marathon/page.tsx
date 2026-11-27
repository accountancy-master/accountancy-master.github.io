import { Suspense } from 'react';
import { MarathonPicker } from '@/components/marathon/MarathonPicker';
import { Shell } from '@/components/ui/Shell';

// Marathon: the topics, kinds of question and difficulty to choose. A setup can be bookmarked: it is in the query
// string (`?topics=…&kinds=…&level=…`), which is only known in the browser. The run itself is
// `/practice/marathon/mix?…` (or `/practice/marathon/<topicId>`, `/all`).
export default function MarathonPickerPage() {
  return (
    <Shell width="wide">
      <Suspense fallback={null}>
        <MarathonPicker />
      </Suspense>
    </Shell>
  );
}
