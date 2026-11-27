'use client';

import { useState } from 'react';
import { useReducedMotion } from '../useReducedMotion';
import { Play } from './cash-flow/Play';
import { TryIt } from './cash-flow/TryIt';
import { Watch } from './cash-flow/Watch';
import type { LabMode } from './kit/LabControls';
import { LabShell } from './kit/LabShell';
import type { LabProps } from './types';

const PREFIX = 'lab-cash-flow';

const CONVENTIONS = [
  'As CBSE prepares it: AS 3 (Revised), the indirect method, for a company that is not a financing company.',
  'Interest and dividend received are investing inflows; interest and dividend paid are financing outflows; bank overdraft is a short-term borrowing (financing), not deducted from cash.',
  'Each year gives the net profit before tax directly (from a change in Surplus, the provision for tax made, the dividend paid and the transfer to reserves would first be added back to reach it); the income tax actually paid comes off after cash generated from operations.',
  'Figures in ₹.',
];

/**
 * The lab "cash-flow" (src/simulator/labs.ts): a reservoir of cash and cash equivalents fed and drained by three
 * pipes, and the Cash Flow Statement written beside it, each figure a step from profit to cash.
 */
export default function CashFlowLab({ seed }: LabProps) {
  const [mode, setMode] = useState<LabMode>('watch');
  const reduced = useReducedMotion();
  return (
    <LabShell prefix={PREFIX} mode={mode} onMode={setMode} conventions={CONVENTIONS}>
      {mode === 'watch' ? <Watch reduced={reduced} prefix={PREFIX} /> : null}
      {mode === 'play' ? <Play seed={seed} reduced={reduced} prefix={PREFIX} /> : null}
      {mode === 'try' ? <TryIt seed={seed} prefix={PREFIX} /> : null}
    </LabShell>
  );
}
