'use client';

import { useState } from 'react';
import type { LabMode } from './kit/LabControls';
import { LabShell } from './kit/LabShell';
import { P } from './posting/parts';
import { PostingPlay } from './posting/PostingPlay';
import { PostingTry } from './posting/PostingTry';
import { PostingWatch } from './posting/PostingWatch';
import type { LabProps } from './types';

const CONVENTIONS = [
  'Amounts are in rupees.',
  'The reason for each side is the rule of debit and credit for the kind of account (an asset, a liability, capital, an income or an expense), as NCERT gives it; the trial balance is prepared by the balance method, and an account with no balance is left out of it.',
  'The accounts of incomes and expenses are balanced here only to carry their balances to the trial balance; at the year end they are closed to the Trading and Profit and Loss Account instead.',
];

/**
 * The lab "posting" (src/simulator/labs.ts): an entry lifts off the journal, line by line, into the debit or credit
 * side of its T-account, with "To" or "By" and the other account written in; the accounts are balanced (Balance c/d
 * on the shorter side, both sides equal, Balance b/d brought down), and the balances drop into a trial balance whose
 * two columns agree. The logic is in src/simulator/posting.
 */
export default function PostingLab({ seed }: LabProps) {
  const [mode, setMode] = useState<LabMode>('watch');
  return (
    <LabShell prefix={P} mode={mode} onMode={setMode} conventions={CONVENTIONS}>
      {mode === 'watch' ? <PostingWatch /> : mode === 'play' ? <PostingPlay seed={seed} /> : <PostingTry seed={seed} />}
    </LabShell>
  );
}
