'use client';

import { useState } from 'react';
import type { LabMode } from './kit/LabControls';
import { LabShell } from './kit/LabShell';
import { S } from './trial-balance-scale/Scale';
import { ScalePlay } from './trial-balance-scale/ScalePlay';
import { ScaleTry } from './trial-balance-scale/ScaleTry';
import { ScaleWatch } from './trial-balance-scale/ScaleWatch';
import type { LabProps } from './types';

const CONVENTIONS = [
  'Amounts are in rupees.',
  'The trial balance is prepared by the balance method; its difference goes to Suspense A/c on the shorter side.',
  'A one-sided error found before the trial balance is corrected in the account itself; found after, it is rectified through Suspense A/c.',
  'A two-sided error is always rectified by an entry between the accounts concerned, never through Suspense A/c.',
  'Two compensating errors of casting found before the trial balance are each corrected in their own account; found after, they make one entry between the two accounts.',
];

/**
 * The lab "trial-balance-scale" (src/simulator/labs.ts): the trial balance as a balance scale, the debit balances on
 * one pan and the credit balances on the other. An error card dropped on the books tips it or leaves it level; a
 * Suspense weight on the lighter pan levels a tipped one; the rectifying entry puts the weights back and takes
 * Suspense away. The logic is in src/simulator/trial-balance-scale.
 */
export default function TrialBalanceScaleLab({ seed }: LabProps) {
  const [mode, setMode] = useState<LabMode>('watch');
  return (
    <LabShell prefix={S} mode={mode} onMode={setMode} conventions={CONVENTIONS}>
      {mode === 'watch' ? <ScaleWatch /> : mode === 'play' ? <ScalePlay seed={seed} /> : <ScaleTry seed={seed} />}
    </LabShell>
  );
}
