import { Chip } from './Chip';

/**
 * The "Beyond the syllabus" chip with the reason beside it: shown on a pattern of the Playground, above a question
 * and on a rule card that teaches more than the syllabus of its course asks (see `TemplateBase.beyondSyllabus`,
 * `Card.beyondSyllabus`).
 */
export function BeyondSyllabus({ reason, testId = 'beyond-syllabus', className }: { reason: string; testId?: string; className?: string }) {
  return (
    <p data-testid={testId} className={['flex flex-wrap items-center gap-x-2 gap-y-1 text-sm', className].filter(Boolean).join(' ')}>
      <Chip tone="accent" className="min-h-7! px-2.5! text-xs!">
        Beyond the syllabus
      </Chip>
      <span data-testid={`${testId}-reason`} className="min-w-0 font-semibold text-muted [overflow-wrap:anywhere]">
        {reason}
      </span>
    </p>
  );
}
