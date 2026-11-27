'use client';

import { useMediaQuery } from '@/components/ui/useMediaQuery';

/** True when the learner's system asks for less motion: the simulator then fades between states instead of moving. */
export const useReducedMotion = (): boolean => useMediaQuery('(prefers-reduced-motion: reduce)');
