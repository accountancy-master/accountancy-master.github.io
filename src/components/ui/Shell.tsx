'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { MouseEvent, ReactNode } from 'react';
import { useProgress } from '@/app-state/useProgress';
import { useStore } from '@/app-state/StoreProvider';
import { courseName } from '@/components/settings/CoursePicker';
import { CourseSwitch } from '@/components/shell/CourseSwitch';
import { ExamChip } from '@/components/shell/ExamChip';
import { Avatar, LearnerMenu } from '@/components/shell/LearnerMenu';
import { BOTTOM_NAV, NAV_GROUPS, activeItem, bottomItem, groupOf, type NavItem } from '@/components/shell/navigation';
import { ShellContext, type Crumb, type LeaveGuard, type ShellApi } from '@/components/shell/ShellContext';
import { ThemeToggle } from '@/components/shell/ThemeToggle';
import { findCourse } from '@/content/outline';
import { currentStreak, rankFor } from '@/learning/gamification';
import { GROUP_LABEL } from './GroupLabel';
import { BoltIcon, FlameIcon, SearchIcon } from './icons';
import { WIDE_QUERY, useMediaQuery } from './useMediaQuery';

// "Go to" is fetched the first time it is opened: no page pays for it until then.
const CommandPalette = lazy(() => import('@/components/search/CommandPalette'));

/**
 * Frame for every page after the profile gate. At 1024 px and wider: a fixed sidebar (the brand, the course, "Go to",
 * the navigation, the learner) and a top bar (where the learner is, the exam countdown, XP and streak, the theme, the
 * learner's menu). Narrower: the phone layout, a header with a search button and a bottom bar of five items. Only one
 * of the two is on the page at a time. Ctrl K (Cmd K) opens "Go to" from anywhere.
 *
 * `width` is how wide the content may grow on a wide screen: 'narrow' (a column for reading and forms) unless a
 * screen asks for 'wide' (grids of cards, tables).
 *
 * `mode="play"` is for a screen that plays something (a level, practice, a marathon run, a case study, a mock paper,
 * the playground's play): it brings its own focused header (its way out, its progress, its clock) and its own main
 * column. On a wide screen it sits beside the sidebar under the top bar, as every page does; on a phone it has the
 * whole screen, with no bottom bar under a question. Leaving it by the Shell asks the screen first (`useLeaveGuard`).
 *
 * Without a selected profile it sends the learner back to the gate and shows no page content.
 */
export function Shell({ children, width = 'narrow', mode = 'page' }: { children: ReactNode; width?: 'narrow' | 'wide'; mode?: 'page' | 'play' }) {
  const { profile, persistent } = useStore();
  const router = useRouter();
  const wide = useMediaQuery(WIDE_QUERY);
  const [searching, setSearching] = useState(false);
  const [trail, setTrail] = useState<Crumb[] | null>(null);
  const guard = useRef<LeaveGuard | null>(null);
  // Where focus was when "Go to" opened, to give it back when it closes.
  const opener = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!profile) router.replace('/start');
  }, [profile, router]);

  const api = useMemo<ShellApi>(
    () => ({
      setTrail,
      setGuard: (g) => {
        guard.current = g;
      },
      guarded: () => guard.current !== null,
      leave: (target) => {
        if (guard.current?.(target)) return;
        void Promise.resolve(target.before?.()).then(() => router.push(target.href));
      },
    }),
    [router],
  );

  const openSearch = useCallback(() => {
    opener.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    setSearching(true);
  }, []);
  const closeSearch = useCallback(() => {
    setSearching(false);
    // After the dialog has gone, so that focus does not land on something it hides.
    requestAnimationFrame(() => opener.current?.focus());
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && !e.altKey && !e.shiftKey && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        if (searching) return;
        openSearch();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [openSearch, searching]);

  // A link of the sidebar or the top bar, followed while the screen guards its work: the screen is asked first.
  const onChromeClick = (e: MouseEvent<HTMLElement>) => {
    if (!guard.current || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    const link = (e.target as HTMLElement).closest('a[href]');
    const href = link?.getAttribute('href');
    if (!link || !href || !href.startsWith('/')) return;
    e.preventDefault();
    e.stopPropagation();
    api.leave({ href });
  };

  if (!profile) {
    return <div aria-busy="true" data-testid="shell-redirecting" className="min-h-dvh" />;
  }

  const palette = searching ? (
    <Suspense fallback={null}>
      <CommandPalette onClose={closeSearch} onGo={(href) => api.leave({ href })} />
    </Suspense>
  ) : null;

  return (
    <ShellContext.Provider value={api}>
      {/* The room for the sidebar is made by CSS, so that it goes the moment the window narrows, before the sidebar does. */}
      <div className="min-h-dvh lg:pl-64 print:pl-0">
        {mode === 'page' ? (
          <a href="#main" className="sr-only z-50 rounded-control bg-surface px-4 py-2 font-bold focus:not-sr-only focus:fixed focus:left-3 focus:top-3">
            Skip to content
          </a>
        ) : null}
        {wide ? (
          <div onClickCapture={onChromeClick} className="print:hidden">
            <Sidebar onSearch={openSearch} play={mode === 'play'} />
          </div>
        ) : null}
        <div className="flex min-h-dvh min-w-0 flex-col">
          {wide ? (
            <div onClickCapture={onChromeClick} className={mode === 'page' ? 'sticky top-0 z-10 print:hidden' : 'print:hidden'}>
              <TopBar trail={trail} />
            </div>
          ) : mode === 'page' ? (
            <PhoneHeader onSearch={openSearch} />
          ) : null}
          {!persistent && mode === 'page' && (
            <p role="status" data-testid="storage-warning" className="border-b border-accent bg-accent-soft px-4 py-3 text-base font-semibold text-accent-ink">
              Progress can&apos;t be saved on this device right now. You can still practise.
            </p>
          )}
          {mode === 'play' ? (
            // The play screen's own header and main column; under the top bar, its full-height frame is the height
            // left. The tree is the same whatever the width, so that turning a tablet never starts a session again.
            <div data-testid="play-column" className={`flex min-w-0 flex-1 flex-col ${wide ? '[&_.min-h-dvh]:min-h-[calc(100dvh-4.05rem)]' : ''}`}>
              {children}
            </div>
          ) : (
            <main
              id="main"
              tabIndex={-1}
              className={[
                'mx-auto w-full flex-1 px-4 pt-6 outline-none',
                wide ? 'px-6 pb-12 xl:px-8' : 'pb-28',
                wide ? (width === 'wide' ? 'max-w-[1400px]' : 'max-w-4xl') : 'max-w-3xl',
              ].join(' ')}
            >
              {children}
            </main>
          )}
        </div>
        {/* On a phone a play screen has the whole screen and its own way out: no bottom bar under a question. */}
        {wide || mode === 'play' ? null : <BottomNav />}
        {palette}
      </div>
    </ShellContext.Provider>
  );
}

function NavLink({ item, active, compact }: { item: NavItem; active: boolean; compact?: boolean }) {
  const Icon = item.icon;
  if (compact) {
    return (
      <Link
        href={item.href}
        prefetch={item.prefetch}
        data-testid={item.testId}
        aria-current={active ? 'page' : undefined}
        className={[
          'flex min-h-14 min-w-0 flex-1 flex-col items-center justify-center gap-0.5 px-1 text-sm font-bold',
          active ? 'bg-primary-soft text-primary-ink' : 'text-muted hover:bg-sunken',
        ].join(' ')}
      >
        <Icon />
        {item.label}
      </Link>
    );
  }
  return (
    <Link
      href={item.href}
      prefetch={item.prefetch}
      data-testid={item.testId}
      aria-current={active ? 'page' : undefined}
      className={[
        'flex min-h-9 items-center gap-3 rounded-control px-3 text-[0.95rem] font-bold transition-colors [&_svg]:h-5 [&_svg]:w-5',
        active ? 'bg-primary-soft text-primary-ink' : 'text-muted hover:bg-sunken hover:text-ink',
      ].join(' ')}
    >
      <Icon />
      {item.label}
    </Link>
  );
}

function Brand() {
  return (
    <Link href="/home" className="flex items-center gap-3 rounded-control">
      <span aria-hidden="true" className="flex h-10 w-10 shrink-0 items-center justify-center rounded-control border-b-4 border-primary-deep bg-primary text-xl font-extrabold text-white">
        ₹
      </span>
      <span className="flex min-w-0 flex-col leading-tight">
        <span className="text-base font-extrabold text-primary-ink">Accountancy Master</span>
        <span className="text-xs font-semibold text-muted">CBSE Accountancy, by practice</span>
      </span>
    </Link>
  );
}

function Sidebar({ onSearch, play }: { onSearch(): void; play: boolean }) {
  const pathname = usePathname();
  const active = activeItem(pathname);
  return (
    <aside aria-label="Sidebar" className="fixed inset-y-0 left-0 z-20 flex w-64 flex-col gap-4 overflow-y-auto border-r border-edge bg-surface px-4 py-5">
      <Brand />
      <CourseSwitch leaveTo={play ? '/home' : undefined} />
      <button
        type="button"
        onClick={onSearch}
        data-testid="goto-open"
        aria-keyshortcuts="Control+K Meta+K"
        className="flex min-h-10 items-center gap-2 rounded-control border border-edge-deep bg-sunken px-3 text-left text-sm font-bold text-muted hover:text-ink [&_svg]:h-4 [&_svg]:w-4"
      >
        <SearchIcon />
        <span className="flex-1">Go to…</span>
        <kbd className="rounded-md border border-edge-deep bg-surface px-1.5 text-xs font-bold">Ctrl K</kbd>
      </button>
      <nav aria-label="Main" className="flex flex-col gap-2.5">
        {NAV_GROUPS.map((group, i) => (
          <div key={group.label ?? `group-${i}`} className="flex flex-col gap-0.5">
            {group.label ? <p className={`${GROUP_LABEL} px-3 pb-1`}>{group.label}</p> : null}
            {group.items.map((item) => (
              <NavLink key={item.href} item={item} active={item === active} />
            ))}
          </div>
        ))}
      </nav>
      <LearnerCard />
    </aside>
  );
}

/** At the foot of the sidebar: who is learning, their rank, XP and streak. */
function LearnerCard() {
  const { profile } = useStore();
  const { progress, today } = useProgress();
  if (!profile) return null;
  const streak = progress && today ? currentStreak(progress.streak, today) : null;
  const rank = progress ? rankFor(progress.xp) : null;
  return (
    <Link href="/progress" data-testid="sidebar-learner" className="mt-auto flex items-center gap-3 rounded-card border border-edge bg-sunken p-3 hover:border-edge-deep">
      <Avatar name={profile.name} />
      <span className="flex min-w-0 flex-col leading-tight">
        <span className="truncate font-extrabold">{profile.name}</span>
        <span className="truncate text-xs font-bold text-muted">
          {rank ? rank.name : '–'} · {progress ? progress.xp : '–'} XP · {streak ?? '–'} {streak === 1 ? 'day' : 'days'}
        </span>
      </span>
    </Link>
  );
}

function XpChips() {
  const { progress, today } = useProgress();
  const streak = progress && today ? currentStreak(progress.streak, today) : null;
  return (
    <>
      <span data-testid="xp-total" title="Experience points" className="inline-flex min-h-8 items-center gap-1 rounded-full bg-accent-soft px-3 text-sm font-extrabold text-accent-ink">
        <BoltIcon />
        <span>{progress ? progress.xp : '–'}</span>
        <span className="font-bold">XP</span>
      </span>
      <span data-testid="streak" title="Days in a row" className="inline-flex min-h-8 items-center gap-1 rounded-full bg-accent-soft px-3 text-sm font-extrabold text-accent-ink">
        <FlameIcon />
        <span>{streak ?? '–'}</span>
        <span className="sr-only">day streak</span>
      </span>
    </>
  );
}

function TopBar({ trail }: { trail: Crumb[] | null }) {
  const { profile } = useStore();
  const pathname = usePathname();
  const item = activeItem(pathname);
  const course = profile ? findCourse(profile.courseId) : undefined;
  // Where the learner is: the course, then what the screen says (the item and what is in it), else the item and its
  // group. The last step is the title.
  const steps: Crumb[] = trail && trail.length > 0 ? trail : item ? [...(groupOf(item) ? [{ label: groupOf(item)! }] : []), { label: item.label }] : [{ label: 'Accountancy Master' }];
  const before: Crumb[] = [...(course ? [{ label: courseName(course), href: '/topics' }] : []), ...steps.slice(0, -1)];
  const title = steps[steps.length - 1].label;
  return (
    <header className="flex min-h-16 items-center justify-between gap-4 overflow-x-clip border-b border-edge bg-surface/90 px-6 py-2 backdrop-blur xl:px-8">
      <nav aria-label="Breadcrumb" className="flex min-w-0 flex-col">
        <ol data-testid="topbar-crumbs" className={`${GROUP_LABEL} flex min-w-0 items-center gap-1.5 truncate`}>
          {before.map((c, i) => (
            <li key={`${c.label}-${i}`} className="flex min-w-0 items-center gap-1.5 truncate">
              {i > 0 ? <span aria-hidden="true">·</span> : null}
              {c.href ? (
                <Link href={c.href} className="truncate hover:text-ink hover:underline">
                  {c.label}
                </Link>
              ) : (
                <span className="truncate">{c.label}</span>
              )}
            </li>
          ))}
        </ol>
        <p data-testid="topbar-title" aria-current="page" className="truncate text-lg font-extrabold leading-tight">
          {title}
        </p>
      </nav>
      <div className="flex shrink-0 items-center gap-2">
        <ExamChip />
        <XpChips />
        <ThemeToggle />
        <LearnerMenu />
      </div>
    </header>
  );
}

function PhoneHeader({ onSearch }: { onSearch(): void }) {
  const { profile } = useStore();
  if (!profile) return null;
  return (
    <header className="sticky top-0 z-10 flex items-center justify-between gap-2 border-b border-edge bg-surface px-4 py-2 print:hidden">
      <Link href="/settings" className="flex min-w-0 items-center gap-2 font-bold">
        <Avatar name={profile.name} />
        <span data-testid="profile-name" className="truncate">
          {profile.name}
        </span>
      </Link>
      <div className="flex shrink-0 items-center gap-1.5">
        <button
          type="button"
          onClick={onSearch}
          data-testid="goto-open"
          aria-label="Go to: search pages, topics, levels and cards"
          className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-edge bg-surface text-ink hover:bg-sunken [&_svg]:h-[18px] [&_svg]:w-[18px]"
        >
          <SearchIcon />
        </button>
        <XpChips />
      </div>
    </header>
  );
}

function BottomNav() {
  const pathname = usePathname();
  // Of the five items, the one the page comes under: a page of Learn marks Topics, one of Practise marks Practice.
  const active = bottomItem(pathname);
  return (
    <nav aria-label="Main" className="fixed inset-x-0 bottom-0 z-20 flex border-t border-edge bg-surface pb-[env(safe-area-inset-bottom)] print:hidden">
      {BOTTOM_NAV.map((item) => (
        <NavLink key={item.href} item={item} active={item === active} compact />
      ))}
    </nav>
  );
}
