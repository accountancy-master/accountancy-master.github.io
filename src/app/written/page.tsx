import { WrittenHome } from '@/components/written/WrittenHome';
import { Shell } from '@/components/ui/Shell';

// Written answers: the board-style written questions of the learner's course, topic by topic, with filters by form
// and marks. A practice of a topic is `/written/<topicId>`; of every question to rewrite, `/written/rewrite`.
export default function WrittenPage() {
  return (
    <Shell width="wide">
      <WrittenHome />
    </Shell>
  );
}
