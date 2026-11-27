import { ExamView } from '@/components/exam/ExamView';
import { Shell } from '@/components/ui/Shell';

// Before the exam: the paper, where the marks are, the learner's weak spots and mistakes, the exam tips and a plan.
export default function ExamPage() {
  return (
    <Shell width="wide">
      <ExamView />
    </Shell>
  );
}
