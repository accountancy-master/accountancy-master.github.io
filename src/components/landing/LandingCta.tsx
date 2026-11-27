'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useStore } from '@/app-state/StoreProvider';
import type { Profile } from '@/storage/types';

/** The learner to continue as: the one chosen last on this device, or else the first. Null when there is none. */
function returning(profiles: readonly Profile[], profile: Profile | null): Profile | null {
  return profile ?? profiles[0] ?? null;
}

/**
 * The way in. A new visitor is asked to start (the first screen, /start, where a learner is made); on a device that
 * already has a learner, the main button continues as that learner (selected, then Home, as the first screen does),
 * with the first screen one link away for anyone else. Until the store has opened it says "Start learning".
 */
export function LandingCta({ size = 'lg', where, follow = false }: { size?: 'lg' | 'sm'; where: string; follow?: boolean }) {
  const { ready, profiles, profile, selectProfile } = useStore();
  const router = useRouter();
  const learner = ready ? returning(profiles, profile) : null;
  const small = size === 'sm';

  const main = learner ? (
    <button
      type="button"
      data-testid={`landing-continue-${where}`}
      className={`lp-btn lp-btn-primary${small ? ' lp-btn-sm' : ''}`}
      onClick={() => {
        selectProfile(learner.id);
        router.push('/home');
      }}
    >
      Continue as <span className="lp-cta-name">{learner.name}</span>
      <Arrow />
    </button>
  ) : (
    <Link href="/start" data-testid={`landing-start-${where}`} className={`lp-btn lp-btn-primary${small ? ' lp-btn-sm' : ''}`}>
      {small ? 'Start' : 'Start learning'}
      <Arrow />
    </Link>
  );

  if (small) return main;
  return (
    <div className="lp-cta">
      {main}
      {follow ? (
        <a href="#follow" data-testid="landing-follow" className="lp-btn lp-btn-ghost">
          Follow a transaction
          <svg aria-hidden="true" viewBox="0 0 20 20" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M10 3v13M4.5 10.5 10 16l5.5-5.5" />
          </svg>
        </a>
      ) : null}
      {learner ? (
        <p className="lp-cta-other">
          Someone else?{' '}
          <Link href="/start" data-testid={`landing-choose-${where}`}>
            Choose or add a learner
          </Link>
        </p>
      ) : (
        <p className="lp-cta-other">Type a name and begin: your progress stays on this device.</p>
      )}
    </div>
  );
}

function Arrow() {
  return (
    <svg aria-hidden="true" viewBox="0 0 20 20" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3.5 10h13M11 4.5l5.5 5.5-5.5 5.5" />
    </svg>
  );
}
