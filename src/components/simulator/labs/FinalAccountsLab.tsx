'use client';

import { useState } from 'react';
import { useReducedMotion } from '../useReducedMotion';
import { T } from './final-accounts/Board';
import { PlayPanel } from './final-accounts/PlayPanel';
import { TryPanel } from './final-accounts/TryPanel';
import { WatchPanel } from './final-accounts/WatchPanel';
import type { LabMode } from './kit/LabControls';
import { LabShell } from './kit/LabShell';
import type { LabProps } from './types';

// ---------------------------------------------------------------------------------------------------------------
// The lab "final-accounts" (src/simulator/labs.ts): from a sole proprietor's trial balance to the Trading Account,
// the Profit and Loss Account and the Balance Sheet, and then the year-end adjustments, each with its two effects.
// The accounting is in src/simulator/final-accounts; this screen only draws it.
// ---------------------------------------------------------------------------------------------------------------

const CONVENTIONS = [
  'A sole proprietor, year ended 31 March 2026. The Trading Account, the Profit and Loss Account and the Balance Sheet in the horizontal form, the Balance Sheet in the order of permanence.',
  'Closing stock is given outside the trial balance: it is credited in the Trading Account and shown as an asset.',
  'Depreciation is on the balance of the asset in the trial balance, for the months it was in use (an asset bought during the year is shown at its cost), and is written off the asset. Interest on capital is on the capital in the trial balance (no capital was brought in during the year).',
  'Further bad debts are written off first; the provision for doubtful debts is made on the debtors that remain, and the provision for discount on the debtors left after both. Bad debts and the change in the provision are one charge, "Bad Debts"; an old provision larger than needed is written back on the credit side.',
  'Goods taken by the proprietor, given away (free samples, staff welfare) or lost by fire leave Purchases at cost. Goods taken are drawings; samples are advertisement; goods lost by fire are a loss, less the insurance claim admitted, which is an asset. (Some books show the goods lost on the credit side of the Trading Account instead: the gross profit is the same.)',
  "The manager's commission is worked out last, on the net profit after every other adjustment, and is unpaid on 31 March. Amounts worked out by a rate are rounded to the nearest rupee.",
  'Interest on drawings is not in the CBSE 2025-26 list of adjustments for Class 11, so it is not used here.',
];

export default function FinalAccountsLab({ seed }: LabProps) {
  const reduced = useReducedMotion();
  const [mode, setMode] = useState<LabMode>('watch');
  return (
    <LabShell prefix={T} mode={mode} onMode={setMode} conventions={CONVENTIONS}>
      {mode === 'watch' ? <WatchPanel reduced={reduced} /> : null}
      {mode === 'play' ? <PlayPanel reduced={reduced} seed={seed} /> : null}
      {mode === 'try' ? <TryPanel reduced={reduced} seed={seed} /> : null}
    </LabShell>
  );
}
