import { TopicPractice } from '@/components/practice/TopicPicker';
import { Shell } from '@/components/ui/Shell';

// "Practise a topic": the list to choose from. The practice itself is `/practice/topic/<topicId>`.
export default function TopicPracticePickerPage() {
  return (
    <Shell>
      <TopicPractice />
    </Shell>
  );
}
