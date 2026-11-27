'use client';

import { useState } from 'react';
import { PART_B_CHOICES, PART_B_LABEL, type PartB } from '@/content/courseOptions';

const PART_B_FAILED = "Couldn't change Part B. Try again.";

/** What each choice of Part B covers, in a line under its name. */
const PART_B_NOTE: Record<PartB, string> = {
  analysis: 'Company statements, their analysis, ratios and the cash flow statement',
  computerised: 'The computerised accounting system, the spreadsheet and books kept on a package',
};

/**
 * Part B of Class 12 as the learner's school teaches it: Analysis of Financial Statements (the default) or Computerised
 * Accounting in its place (content/courseOptions.ts). One button each, the one chosen marked; a choice is saved at
 * once (`choose`), and the topics, practice and papers of the course change with it. Nothing done before is lost.
 */
export function PartBPicker({ current, choose, labelledBy, describedBy }: { current: PartB; choose(partB: PartB): Promise<unknown> | void; labelledBy: string; describedBy?: string }) {
  const [saving, setSaving] = useState(false);
  const [failed, setFailed] = useState(false);

  async function pick(partB: PartB) {
    if (saving || partB === current) return;
    setSaving(true);
    setFailed(false);
    try {
      await choose(partB);
    } catch {
      setFailed(true);
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <div role="group" aria-labelledby={labelledBy} aria-describedby={describedBy} className="grid gap-3 sm:grid-cols-2">
        {PART_B_CHOICES.map((partB) => {
          const chosen = partB === current;
          return (
            <button
              key={partB}
              type="button"
              data-testid={`part-b-${partB}`}
              aria-pressed={chosen}
              disabled={saving}
              onClick={() => void pick(partB)}
              className={[
                'flex min-h-14 flex-col items-start justify-center gap-0.5 rounded-control border-2 border-b-4 px-4 py-2 text-left text-base font-extrabold disabled:cursor-not-allowed',
                chosen ? 'border-primary bg-primary-soft text-primary-ink' : 'border-edge-deep bg-surface text-ink hover:bg-canvas',
              ].join(' ')}
            >
              <span>
                {PART_B_LABEL[partB]}
                {partB === 'analysis' ? <span className="font-bold text-muted"> (usual)</span> : null}
              </span>
              <span className="text-sm font-semibold text-muted">{PART_B_NOTE[partB]}</span>
              <span className="min-h-4 text-sm font-bold">{chosen ? '✓ Chosen' : ''}</span>
            </button>
          );
        })}
      </div>
      {failed && (
        <p role="alert" data-testid="part-b-error" className="text-base font-bold text-danger">
          {PART_B_FAILED}
        </p>
      )}
    </>
  );
}
