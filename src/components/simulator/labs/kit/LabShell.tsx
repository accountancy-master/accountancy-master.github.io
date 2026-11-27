'use client';

import type { ReactNode } from 'react';
import { LAB_MODES, ModeSwitch, type LabMode } from './LabControls';

// ---------------------------------------------------------------------------------------------------------------
// The body of every lab, under the heading the simulator gives it: the three modes, the conventions the lab
// follows (folded away until asked for), any setting that holds in every mode, and the panel of the mode chosen
// (test id <prefix>-panel-<mode>). Also the blocks a lab's panels are built of: the example's intro and a card.
// ---------------------------------------------------------------------------------------------------------------

export function LabShell({
  prefix,
  mode,
  onMode,
  conventions,
  settings,
  children,
}: {
  prefix: string;
  mode: LabMode;
  onMode(m: LabMode): void;
  /** The conventions, one item each. */
  conventions: readonly ReactNode[];
  /** A setting that holds in every mode (the layout of a statement). */
  settings?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="flex min-w-0 flex-col gap-4">
      <ModeSwitch mode={mode} onChange={onMode} prefix={prefix} />
      <Conventions prefix={prefix} items={conventions} />
      {settings}
      <section aria-label={LAB_MODES.find((m) => m.id === mode)!.label} data-testid={`${prefix}-panel-${mode}`} className="flex min-w-0 flex-col gap-3">
        {children}
      </section>
    </div>
  );
}

/** "The conventions this lab follows", folded away until opened. */
export function Conventions({ prefix, items }: { prefix: string; items: readonly ReactNode[] }) {
  return (
    <details data-testid={`${prefix}-conventions`} className="group rounded-card border border-edge bg-surface text-sm">
      <summary className="flex min-h-11 cursor-pointer list-none items-center gap-2 rounded-card px-3 py-2 font-extrabold [&::-webkit-details-marker]:hidden">
        <span aria-hidden="true" className="inline-block transition-transform group-open:rotate-90 motion-reduce:transition-none">
          ▸
        </span>
        The conventions this lab follows
      </summary>
      <ul className="flex list-disc flex-col gap-1 pb-3 pl-9 pr-3 text-muted">
        {items.map((item, i) => (
          <li key={i}>{item}</li>
        ))}
      </ul>
    </details>
  );
}

/**
 * What the example on the picture is: a line or two, or a list of its facts. Test id `<prefix>-about` (or `testId`).
 */
export function Intro({ prefix, testId, facts, children }: { prefix: string; testId?: string; facts?: readonly ReactNode[]; children?: ReactNode }) {
  return (
    <div data-testid={testId ?? `${prefix}-about`} className="flex min-w-0 flex-col gap-1 rounded-control border-l-4 border-primary bg-surface px-3 py-2 text-base">
      {children ? <div>{children}</div> : null}
      {facts ? (
        <ul className="flex flex-col gap-0.5 text-sm">
          {facts.map((f, i) => (
            <li key={i}>{f}</li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

/** A part of the picture with a title: an account, a statement, the journal. */
export function Card({ title, children, testId, aside }: { title: ReactNode; children: ReactNode; testId?: string; aside?: ReactNode }) {
  return (
    <section data-testid={testId} className="flex min-w-0 flex-col gap-2 rounded-card border border-edge bg-surface p-3 shadow-card sm:p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="text-base font-extrabold">{title}</h3>
        {aside}
      </div>
      {children}
    </section>
  );
}
