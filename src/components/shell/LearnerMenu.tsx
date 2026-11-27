'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useContext, useEffect, useId, useRef, useState } from 'react';
import { useStore } from '@/app-state/StoreProvider';
import { ChevronDownIcon, GearIcon, SwitchIcon } from '@/components/ui/icons';
import { ShellContext } from './ShellContext';

/** The learner's initial in a round badge. */
export function Avatar({ name, size = 'md' }: { name: string; size?: 'sm' | 'md' }) {
  return (
    <span
      aria-hidden="true"
      className={[
        'flex shrink-0 items-center justify-center rounded-full bg-primary-soft font-extrabold text-primary-ink',
        size === 'sm' ? 'h-7 w-7 text-sm' : 'h-8 w-8 text-base',
      ].join(' ')}
    >
      {name.charAt(0).toUpperCase()}
    </span>
  );
}

/**
 * The learner's name in the top bar, opening a small menu: switch learner, settings. Escape or a click elsewhere
 * closes it, and focus goes back to the button.
 */
export function LearnerMenu() {
  const { profile, selectProfile } = useStore();
  const router = useRouter();
  const shell = useContext(ShellContext);
  const [open, setOpen] = useState(false);
  const button = useRef<HTMLButtonElement>(null);
  const menu = useRef<HTMLDivElement>(null);
  const id = useId();

  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (!menu.current?.contains(e.target as Node) && !button.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      setOpen(false);
      button.current?.focus();
    };
    document.addEventListener('pointerdown', onDown);
    document.addEventListener('keydown', onKey);
    menu.current?.querySelector<HTMLElement>('a,button')?.focus();
    return () => {
      document.removeEventListener('pointerdown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  if (!profile) return null;

  function switchLearner() {
    setOpen(false);
    // A play screen is asked first; nothing else changes until the learner leaves it.
    if (shell) shell.leave({ href: '/start', before: () => selectProfile(null) });
    else {
      selectProfile(null);
      router.push('/start');
    }
  }

  const item = 'flex min-h-11 w-full items-center gap-3 rounded-control px-3 text-left text-base font-bold hover:bg-sunken [&_svg]:h-5 [&_svg]:w-5 text-ink';
  return (
    <div className="relative">
      <button
        ref={button}
        type="button"
        data-testid="learner-menu"
        aria-expanded={open}
        aria-controls={id}
        aria-label={`${profile.name}: learner menu`}
        onClick={() => setOpen((o) => !o)}
        className="inline-flex min-h-10 max-w-56 items-center gap-2 rounded-full border border-edge bg-surface py-1 pl-1 pr-3 font-bold hover:bg-sunken [&_svg]:h-4 [&_svg]:w-4"
      >
        <Avatar name={profile.name} />
        <span data-testid="profile-name" className="truncate">
          {profile.name}
        </span>
        <ChevronDownIcon />
      </button>
      {open ? (
        <div ref={menu} id={id} className="absolute right-0 top-12 z-40 flex w-56 flex-col gap-1 rounded-card border border-edge bg-surface p-2 shadow-pop">
          <button type="button" data-testid="menu-switch-learner" onClick={switchLearner} className={item}>
            <SwitchIcon />
            Switch learner
          </button>
          <Link href="/settings" data-testid="menu-settings" onClick={() => setOpen(false)} className={item}>
            <GearIcon />
            Settings
          </Link>
        </div>
      ) : null}
    </div>
  );
}
