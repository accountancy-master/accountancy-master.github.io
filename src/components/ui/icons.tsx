import type { ReactNode } from 'react';

/** Small line icons shared by every screen (the navigation, Home, the Practice hub). All decorative (hidden from screen readers). */
function Icon({ children }: { children: ReactNode }) {
  return (
    <svg
      width="22"
      height="22"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className="shrink-0"
    >
      {children}
    </svg>
  );
}

export function TickIcon() {
  return (
    <Icon>
      <path d="m5 12 5 5 9-10" />
    </Icon>
  );
}

export function CardsIcon() {
  return (
    <Icon>
      <rect x="3" y="6" width="14" height="14" rx="2" />
      <path d="M7 3h12a2 2 0 0 1 2 2v12" />
    </Icon>
  );
}

export function RetryIcon() {
  return (
    <Icon>
      <path d="M4 12a8 8 0 1 0 2.5-5.8" />
      <path d="M4 4v5h5" />
    </Icon>
  );
}

export function SheetIcon() {
  return (
    <Icon>
      <path d="M6 3h9l4 4v14H6z" />
      <path d="M9 12h7M9 16h7" />
    </Icon>
  );
}

export function SparkIcon() {
  return (
    <Icon>
      <path d="M12 3v4M12 17v4M3 12h4M17 12h4" />
      <path d="m6.5 6.5 2 2M15.5 15.5l2 2M17.5 6.5l-2 2M8.5 15.5l-2 2" />
    </Icon>
  );
}

export function QuestionIcon() {
  return (
    <Icon>
      <circle cx="12" cy="12" r="9" />
      <path d="M9.5 9.5a2.5 2.5 0 1 1 3.5 2.3c-.7.4-1 .9-1 1.7" />
      <path d="M12 17h.01" />
    </Icon>
  );
}

export function TrophyIcon() {
  return (
    <Icon>
      <path d="M8 4h8v5a4 4 0 0 1-8 0z" />
      <path d="M8 6H5a3 3 0 0 0 3 4M16 6h3a3 3 0 0 1-3 4" />
      <path d="M12 13v4M9 20h6M12 17v3" />
    </Icon>
  );
}

export function FlagIcon() {
  return (
    <Icon>
      <path d="M5 21V4" />
      <path d="M5 4h12l-2 4 2 4H5" />
    </Icon>
  );
}

export function ListIcon() {
  return (
    <Icon>
      <path d="M9 6h11M9 12h11M9 18h11" />
      <path d="M4.5 6h.01M4.5 12h.01M4.5 18h.01" />
    </Icon>
  );
}

export function CaseIcon() {
  return (
    <Icon>
      <rect x="3" y="7" width="18" height="13" rx="2" />
      <path d="M9 7V5a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2" />
      <path d="M3 13h18" />
    </Icon>
  );
}

export function ClockIcon() {
  return (
    <Icon>
      <circle cx="12" cy="13" r="8" />
      <path d="M12 9v4l2.5 2M9 2h6" />
    </Icon>
  );
}

export function LoopIcon() {
  return (
    <Icon>
      <path d="M7 8h9a4 4 0 0 1 0 8H8a4 4 0 0 1 0-8" />
      <path d="m13 5 3 3-3 3" />
    </Icon>
  );
}

export function BoltIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M13 2 4 14h6l-1 8 9-12h-6z" />
    </svg>
  );
}

export function FlameIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M12 2c1 4-3 5-3 9a3 3 0 0 0 6 0c0-1-.4-1.8-1-2.5 3 1.5 5 4 5 7.5a7 7 0 0 1-14 0c0-6 5-8 7-14z" />
    </svg>
  );
}

export function HomeIcon() {
  return (
    <Icon>
      <path d="M3 11.5 12 4l9 7.5" />
      <path d="M5.5 10v10h13V10" />
      <path d="M10 20v-6h4v6" />
    </Icon>
  );
}

export function BookIcon() {
  return (
    <Icon>
      <path d="M4 5.5A2.5 2.5 0 0 1 6.5 3H20v16H6.5A2.5 2.5 0 0 0 4 21.5z" />
      <path d="M4 21.5V5.5" />
      <path d="M9 8h7" />
    </Icon>
  );
}

export function TargetIcon() {
  return (
    <Icon>
      <circle cx="12" cy="12" r="9" />
      <circle cx="12" cy="12" r="4.5" />
      <path d="M12 12h.01" />
    </Icon>
  );
}

export function ChartIcon() {
  return (
    <Icon>
      <path d="M4 20V10" />
      <path d="M10 20V4" />
      <path d="M16 20v-7" />
      <path d="M22 20H2" />
    </Icon>
  );
}

export function GearIcon() {
  return (
    <Icon>
      <circle cx="12" cy="12" r="3" />
      <path d="M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M4.9 19.1 7 17M17 7l2.1-2.1" />
    </Icon>
  );
}

/** The Playground: a game pad. */
export function PlayIcon() {
  return (
    <Icon>
      <rect x="2.5" y="7" width="19" height="11" rx="5.5" />
      <path d="M7.5 10.5v4M5.5 12.5h4" />
      <path d="M15.5 11.5h.01M18 13.5h.01" />
    </Icon>
  );
}

/** The glossary: an "A" over the lines of a definition. */
export function GlossaryIcon() {
  return (
    <Icon>
      <path d="m4 13 4-10 4 10M5.6 9.5h4.8" />
      <path d="M15 6h6M15 10h6M4 17h17M4 21h12" />
    </Icon>
  );
}

/** Before the exam: a checklist. */
export function ChecklistIcon() {
  return (
    <Icon>
      <path d="m3.5 6 1.8 1.8L8.5 4.5M3.5 13l1.8 1.8 3.2-3.3" />
      <path d="M12 6.5h8.5M12 13.5h8.5M4.5 20h16" />
    </Icon>
  );
}

/** Project and viva: a bound project file with a speech mark for the viva. */
export function ProjectIcon() {
  return (
    <Icon>
      <path d="M5 3.5h10.5a2 2 0 0 1 2 2V12M5 3.5v17h7M5 3.5a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2" />
      <path d="M8.5 8h5.5M8.5 11.5h4" />
      <path d="M14.5 15.5h6.5v4.5h-3.5l-2 1.5V20h-1z" />
    </Icon>
  );
}

/** Written answers: a pen writing lines on a page. */
export function PenIcon() {
  return (
    <Icon>
      <path d="M4 20h7" />
      <path d="M15.5 4.5a2.1 2.1 0 0 1 3 3L9 17l-4 1 1-4z" />
    </Icon>
  );
}

export function CalendarIcon() {
  return (
    <Icon>
      <rect x="3.5" y="5" width="17" height="16" rx="2.5" />
      <path d="M3.5 10h17M8 3v4M16 3v4" />
    </Icon>
  );
}

export function SunIcon() {
  return (
    <Icon>
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2M12 20v2M2 12h2M20 12h2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
    </Icon>
  );
}

export function MoonIcon() {
  return (
    <Icon>
      <path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z" />
    </Icon>
  );
}

/** What's inside: a grid of squares. */
export function GridIcon() {
  return (
    <Icon>
      <rect x="3.5" y="3.5" width="7" height="7" rx="1.5" />
      <rect x="13.5" y="3.5" width="7" height="7" rx="1.5" />
      <rect x="3.5" y="13.5" width="7" height="7" rx="1.5" />
      <rect x="13.5" y="13.5" width="7" height="7" rx="1.5" />
    </Icon>
  );
}

export function SearchIcon() {
  return (
    <Icon>
      <circle cx="11" cy="11" r="7" />
      <path d="m20 20-3.5-3.5" />
    </Icon>
  );
}

export function ChevronDownIcon() {
  return (
    <Icon>
      <path d="m6 9 6 6 6-6" />
    </Icon>
  );
}

export function ArrowLeftIcon() {
  return (
    <Icon>
      <path d="M19 12H5M11 6l-6 6 6 6" />
    </Icon>
  );
}

export function UserIcon() {
  return (
    <Icon>
      <circle cx="12" cy="8" r="4" />
      <path d="M4 21a8 8 0 0 1 16 0" />
    </Icon>
  );
}

export function SwitchIcon() {
  return (
    <Icon>
      <path d="M7 4 3 8l4 4M3 8h14M17 20l4-4-4-4M21 16H7" />
    </Icon>
  );
}

/** A balance on its stand: the simulator of the accounting equation. */
export function ScaleIcon() {
  return (
    <Icon>
      <path d="M12 3v17M7 20h10M5 7h14" />
      <path d="M5 7l-3 6a3 3 0 0 0 6 0zM19 7l-3 6a3 3 0 0 0 6 0z" />
    </Icon>
  );
}
