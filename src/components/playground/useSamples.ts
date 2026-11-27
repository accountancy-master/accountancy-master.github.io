'use client';

import { useEffect, useState } from 'react';

// The sample line of every pattern (samples.generated.ts) is a part of the build of its own, fetched the first time a
// screen that shows samples is opened, and kept for as long as the app stays open.
let loaded: Readonly<Record<string, string>> | null = null;

/** The samples by pattern id; null until they have been fetched (or when they could not be). */
export function useSamples(): Readonly<Record<string, string>> | null {
  const [samples, setSamples] = useState(loaded);
  useEffect(() => {
    if (loaded) return;
    let current = true;
    import('@/content/samples.generated')
      .then((m) => {
        loaded = m.SAMPLES;
        if (current) setSamples(m.SAMPLES);
      })
      .catch(() => undefined);
    return () => {
      current = false;
    };
  }, []);
  return samples;
}
