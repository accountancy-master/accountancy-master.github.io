'use client';

import { useState } from 'react';
import type { LabMode } from './kit/LabControls';
import { LabShell } from './kit/LabShell';
import { Play } from './ratios/Play';
import { TryIt } from './ratios/TryIt';
import { Watch } from './ratios/Watch';
import type { LabProps } from './types';

const PREFIX = 'lab-ratios';

const CONVENTIONS = [
  "As CBSE 2025-26 defines them: quick assets = current assets − inventories − prepaid expenses; debt = long-term borrowings + long-term provisions; equity = shareholders' funds; proprietary ratio on total assets; capital employed = shareholders' funds + non-current liabilities; turnover ratios on averages of the opening and closing balances, except working capital turnover on the closing working capital; return on investment and interest coverage on the profit before interest and tax; the net profit ratio on the profit after tax.",
  'Figures in ₹, ratios to two decimal places (half away from nil).',
];

/**
 * The lab "ratios" (src/simulator/labs.ts): a balance sheet and a statement of profit and loss in brief, and every
 * ratio of the syllabus on a dial whose needle swings when a figure changes or a transaction is played.
 */
export default function RatiosLab({ seed }: LabProps) {
  const [mode, setMode] = useState<LabMode>('watch');
  return (
    <LabShell prefix={PREFIX} mode={mode} onMode={setMode} conventions={CONVENTIONS}>
      {mode === 'watch' ? <Watch prefix={PREFIX} /> : null}
      {mode === 'play' ? <Play seed={seed} prefix={PREFIX} /> : null}
      {mode === 'try' ? <TryIt seed={seed} prefix={PREFIX} /> : null}
    </LabShell>
  );
}
