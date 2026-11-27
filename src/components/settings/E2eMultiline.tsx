'use client';

import { FeedbackPanel } from '@/components/play/FeedbackPanel';
import { MistakeCard } from '@/components/mistakes/MistakesView';
import { Prompt } from '@/components/ui/Prompt';
import { MULTILINE_MCQ, MULTILINE_SAMPLE } from './multilineSample';

/**
 * Test-only fixture (rendered only in E2E builds, on the Settings page): the real prompt, feedback and Mistakes
 * components with a question that has line breaks, so a test can check that lists stay lists at 360 px.
 */
export function E2eMultiline() {
  return (
    <section data-testid="e2e-multiline" className="mt-6 flex flex-col gap-4 rounded-card border-2 border-dashed border-edge-deep bg-canvas p-4">
      <h2 className="text-lg font-extrabold">Multi-line sample</h2>
      <div data-testid="e2e-multiline-question">
        <Prompt text={MULTILINE_SAMPLE.prompt} />
      </div>
      <div data-testid="e2e-multiline-working">
        <FeedbackPanel
          question={MULTILINE_SAMPLE}
          correct={false}
          revealed={false}
          mistakeCode={undefined}
          xp={0}
          onContinue={() => {}}
        />
      </div>
      <div data-testid="e2e-multiline-explained">
        <FeedbackPanel
          question={MULTILINE_MCQ}
          correct={false}
          revealed={false}
          mistakeCode={undefined}
          xp={0}
          onContinue={() => {}}
        />
      </div>
      <div data-testid="e2e-multiline-mistake">
        <MistakeCard question={MULTILINE_SAMPLE} tries={1} miss={{ hintsUsed: 0 }} />
      </div>
    </section>
  );
}
