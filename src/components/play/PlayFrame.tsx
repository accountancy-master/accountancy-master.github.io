'use client';

import type { ReactNode } from 'react';
import { Button } from '@/components/ui/Button';

export const NOTICE = 'rounded-card border-2 border-dashed border-edge-deep bg-canvas p-5 font-bold text-muted';

/** Centred page frame for the notices shown before (or instead of) a session. */
export function Frame({ children }: { children: ReactNode }) {
  return <div className="mx-auto flex min-h-dvh w-full max-w-3xl flex-col justify-center px-4 py-8">{children}</div>;
}

export function LoadError({ onRetry }: { onRetry(): void }) {
  return (
    <Frame>
      <div role="alert" className="flex flex-col items-start gap-3 rounded-card border-2 border-danger bg-danger-soft p-5">
        <p className="font-bold text-danger-deep">Your progress could not be loaded.</p>
        <Button variant="secondary" onClick={onRetry}>
          Try again
        </Button>
      </div>
    </Frame>
  );
}

export function Loading({ children }: { children: ReactNode }) {
  return (
    <Frame>
      <p aria-busy="true" data-testid="player-loading" className={NOTICE}>
        {children}
      </p>
    </Frame>
  );
}
