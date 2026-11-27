'use client';

import { useContext } from 'react';
import { ProgressContext, type ProgressContextValue } from './ProgressProvider';

/**
 * Progress of the selected profile, derived from its stored events and shared by every screen.
 * Call `reload()` after writing events; all consumers update. Must be used inside ProgressProvider.
 */
export function useProgress(): ProgressContextValue {
  const ctx = useContext(ProgressContext);
  if (!ctx) throw new Error('useProgress must be used inside ProgressProvider');
  return ctx;
}
