import { notFound } from 'next/navigation';
import { PracticePlayer } from '@/components/play/PracticePlayer';
import { PRACTICE_MODES, isPracticeMode } from '@/play/practiceModes';
import { Shell } from '@/components/ui/Shell';

export const dynamicParams = false;

export function generateStaticParams() {
  return PRACTICE_MODES.map((mode) => ({ mode }));
}

export default async function PracticePage({ params }: { params: Promise<{ mode: string }> }) {
  const { mode } = await params;
  if (!isPracticeMode(mode)) notFound();
  return (
    <Shell mode="play">
      <PracticePlayer mode={mode} />
    </Shell>
  );
}
