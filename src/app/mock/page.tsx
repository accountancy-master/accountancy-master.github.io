import { MockHub } from '@/components/mock/MockHub';
import { Shell } from '@/components/ui/Shell';

export default function MockPage() {
  return (
    <Shell width="wide">
      <MockHub />
    </Shell>
  );
}
