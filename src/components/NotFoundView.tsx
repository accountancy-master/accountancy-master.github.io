'use client';

import Link from 'next/link';
import { useEffect, useSyncExternalStore } from 'react';
import { withoutTrailingSlash } from '@/app-state/trailingSlash';
import { buttonClasses } from '@/components/ui/Button';

/** Before the browser is known (the page as built) the address is not yet read: nothing is said until it is. */
const PENDING = 'pending';
const noSubscription = () => () => {};
const targetHere = () => withoutTrailingSlash(window.location.pathname, window.location.search, window.location.hash);

/**
 * The page for an address the site does not have. An address that only differs by a slash at the end (`/home/`) is
 * sent on to the page it means; anything else says so plainly and offers the way home.
 */
export function NotFoundView() {
  const target = useSyncExternalStore(noSubscription, targetHere, () => PENDING);
  useEffect(() => {
    if (target !== null && target !== PENDING) window.location.replace(target);
  }, [target]);

  return (
    <main id="main" className="mx-auto flex w-full max-w-md flex-1 flex-col items-center justify-center gap-4 px-4 py-16 text-center">
      {target !== null ? (
        <p data-testid="not-found-moving" className="text-muted">
          Opening the page…
        </p>
      ) : (
        <>
          <h1 className="text-2xl font-extrabold">This page does not exist</h1>
          <p className="text-muted">The address may be mistyped, or the page may have moved.</p>
          <Link href="/home" className={buttonClasses('primary', 'lg')}>
            Go to Home
          </Link>
        </>
      )}
    </main>
  );
}
