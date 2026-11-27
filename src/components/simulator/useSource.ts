'use client';

import { useCallback, useRef, useState } from 'react';
import { createRng } from '@/engine/rng';
import type { Scene } from '@/simulator/scenes';
import type { SimTransaction } from '@/simulator/types';

/** Where the next transaction comes from: the scene's own list, or one of its generators by id. */
export type SourceId = 'starter' | string;

/**
 * The transactions of a scene one after another: its own list in an order drawn for this visit, or a generator's,
 * seed after seed from a starting seed drawn for this visit (each generator is fetched the first time it is wanted).
 */
export function useSource(scene: Scene, seed?: number) {
  const [start] = useState(() => seed ?? 1 + Math.floor(Math.random() * 900_000));
  const [order] = useState(() => createRng(start).shuffle(scene.transactions.map((_, i) => i)));
  const position = useRef(0);
  const seeds = useRef<Record<string, number>>({});
  const made = useRef<Record<string, (seed: number) => SimTransaction>>({});
  const [loading, setLoading] = useState(false);

  const next = useCallback(
    async (source: SourceId): Promise<SimTransaction> => {
      if (source === 'starter') return scene.transactions[order[position.current++ % order.length]];
      const generator = scene.generators.find((g) => g.id === source);
      if (!generator) throw new Error(`No generator ${source}`);
      let make = made.current[source];
      if (!make) {
        setLoading(true);
        try {
          make = made.current[source] = await generator.load();
        } finally {
          setLoading(false);
        }
      }
      const seed = (seeds.current[source] ??= start);
      seeds.current[source] = seed + 1;
      return make(seed);
    },
    [scene, order, start],
  );

  return { next, loading };
}

export const SOURCE_LABEL = (scene: Scene): { value: SourceId; label: string }[] => [
  { value: 'starter', label: 'Starter list' },
  ...scene.generators.map((g) => ({ value: g.id, label: g.label })),
];
