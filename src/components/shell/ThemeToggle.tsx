'use client';

import { useTheme } from '@/app-state/theme';
import { MoonIcon, SunIcon } from '@/components/ui/icons';

/** Switches between the light and the dark theme; the choice is kept on this device. */
export function ThemeToggle({ className }: { className?: string }) {
  const { theme, toggle } = useTheme();
  const dark = theme === 'dark';
  return (
    <button
      type="button"
      onClick={toggle}
      data-testid="theme-toggle"
      aria-label={dark ? 'Switch to the light theme' : 'Switch to the dark theme'}
      title={dark ? 'Light theme' : 'Dark theme'}
      className={['inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-edge bg-surface text-ink hover:bg-sunken [&_svg]:h-5 [&_svg]:w-5', className]
        .filter(Boolean)
        .join(' ')}
    >
      {dark ? <SunIcon /> : <MoonIcon />}
    </button>
  );
}
