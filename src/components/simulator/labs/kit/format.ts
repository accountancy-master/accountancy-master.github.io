'use client';

import { useState } from 'react';
import { formatINR, type Paise } from '@/engine/money';

/** A rupee amount without the sign, as the amount columns of a book print it: "1,00,000". */
export const amountText = (p: Paise): string => formatINR(p).slice(1);

/** A seed for this visit: the one in the address (`?seed=`), or one drawn now. */
export function useVisitSeed(seed?: number): number {
  const [start] = useState(() => seed ?? 1 + Math.floor(Math.random() * 900_000));
  return start;
}
