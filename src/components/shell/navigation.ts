import type { ComponentType } from 'react';
import {
  BookIcon,
  CardsIcon,
  CaseIcon,
  ChartIcon,
  ChecklistIcon,
  ClockIcon,
  GearIcon,
  GlossaryIcon,
  GridIcon,
  HomeIcon,
  LoopIcon,
  PenIcon,
  PlayIcon,
  ProjectIcon,
  RetryIcon,
  ScaleIcon,
  SheetIcon,
  TargetIcon,
} from '@/components/ui/icons';
import { MapIcon } from '@/components/maps/MapIcon';

// ---------------------------------------------------------------------------------------------------------------
// The navigation, in one place: the sidebar (1024 px and wider), the bottom bar of a phone, the title of the top bar
// and the pages "Go to" (Ctrl K) finds are all read from here. A new page is one more item in a group; nothing else
// has to change for it to appear everywhere.
// ---------------------------------------------------------------------------------------------------------------

export interface NavItem {
  href: string;
  label: string;
  /** The test id of its link, in the sidebar and in the bottom bar alike (only one of them is on the page). */
  testId: string;
  icon: ComponentType;
  /** Other addresses that belong to this item, as prefixes: `/sheet` for Quick sheets. */
  also?: readonly string[];
  /** What else "Go to" finds it by. */
  keywords?: string;
  /** One line about the page, shown by "Go to". */
  description: string;
  /**
   * False for a page whose link must not be fetched ahead (a page that a build may not have yet). Left out, Next.js
   * fetches ahead as it does for any link.
   */
  prefetch?: false;
}

export interface NavGroup {
  /** The small uppercase label over the group in the sidebar; none for a group of one at the top level. */
  label: string | null;
  items: readonly NavItem[];
}

export const NAV_GROUPS: readonly NavGroup[] = [
  {
    label: null,
    items: [{ href: '/home', label: 'Home', testId: 'nav-home', icon: HomeIcon, description: "Today's goal, your courses and what to do next", keywords: 'dashboard today start' }],
  },
  {
    label: 'Learn',
    items: [
      { href: '/topics', label: 'Topics', testId: 'nav-topics', icon: BookIcon, also: ['/play'], description: 'Every topic of your course, by unit', keywords: 'course learn levels ladder units chapters' },
      { href: '/practice/cards', label: 'Cards', testId: 'nav-cards', icon: CardsIcon, description: 'Revise the rule cards that are due', keywords: 'rules revise flashcards revision' },
      { href: '/sheets', label: 'Quick sheets', testId: 'nav-sheets', icon: SheetIcon, also: ['/sheet'], description: 'Every rule and format of a topic on one page', keywords: 'formats summary notes print' },
      { href: '/glossary', label: 'Glossary', testId: 'nav-glossary', icon: GlossaryIcon, description: 'Every term of your course, A to Z, in plain words', keywords: 'terms definitions meaning words dictionary' },
      { href: '/inside', label: "What's inside", testId: 'nav-inside', icon: GridIcon, description: 'Everything each course holds, and how much you have done', keywords: 'contents overview catalogue big picture' },
      { href: '/maps', label: 'Mind maps', testId: 'nav-maps', icon: MapIcon, description: 'Your course and each topic as a map, with your progress on it', keywords: 'mind map concept map overview links diagram revise' },
      { href: '/simulator', label: 'Simulator', testId: 'nav-simulator', icon: ScaleIcon, description: 'Watch the accounting equation move, predict it, and find the mistake', keywords: 'equation animation tanks assets liabilities capital watch predict suspense errors' },
    ],
  },
  {
    label: 'Practise',
    items: [
      { href: '/practice', label: 'Practice', testId: 'nav-practice', icon: TargetIcon, description: 'Smart practice, fresh questions, the mission and the challenge', keywords: 'smart fresh mission challenge daily' },
      { href: '/playground', label: 'Playground', testId: 'nav-playground', icon: PlayIcon, prefetch: false, description: 'Play any question type of any topic, as long as you like', keywords: 'question types patterns endless play sandbox free practice' },
      { href: '/practice/marathon', label: 'Marathon', testId: 'nav-marathon', icon: LoopIcon, description: 'Questions on the topics you choose, until you stop', keywords: 'endless mixed run streak' },
      { href: '/cases', label: 'Case studies', testId: 'nav-cases', icon: CaseIcon, description: 'One business, several linked questions', keywords: 'case study business' },
      { href: '/written', label: 'Written answers', testId: 'nav-written', icon: PenIcon, description: 'Board questions to answer in writing, marked point by point against the model answer', keywords: 'theory written answer distinguish between difference features reasons explain short note board marking scheme points rewrite' },
      { href: '/exam', label: 'Before the exam', testId: 'nav-exam', icon: ChecklistIcon, description: 'The paper, where the marks are, your weak spots, tips and a plan to the exam day', keywords: 'exam revision plan tips checklist countdown pattern' },
      { href: '/practical', label: 'Project and viva', testId: 'nav-practical', icon: ProjectIcon, description: 'The project work of your course: a guide and a worked example for each project, and viva questions to practise', keywords: 'project file viva voce practical part c vouchers source documents bank reconciliation comprehensive sole proprietor financial statement analysis ratios computerised accounting' },
      { href: '/mock', label: 'Mock papers', testId: 'nav-mock', icon: ClockIcon, description: 'A full paper against the clock, marked at the end', keywords: 'exam paper test timed board' },
      { href: '/worksheets', label: 'Worksheets', testId: 'nav-worksheets', icon: SheetIcon, description: 'Printable worksheets of any topics, with an answer key', keywords: 'print worksheet pdf paper teacher class test answer key code' },
    ],
  },
  {
    label: null,
    items: [{ href: '/mistakes', label: 'Mistakes', testId: 'nav-mistakes', icon: RetryIcon, also: ['/practice/mistakes'], description: 'Every question still wrong, to put right', keywords: 'wrong errors review fix' }],
  },
  {
    label: 'You',
    items: [
      { href: '/progress', label: 'Progress', testId: 'nav-progress', icon: ChartIcon, description: 'Your rank, your units and your weakest ideas', keywords: 'stats mastery rank bests' },
      { href: '/settings', label: 'Settings', testId: 'nav-settings', icon: GearIcon, description: 'Learner, course, exam dates, daily goal and backup', keywords: 'exam date goal course backup learner theme' },
    ],
  },
];

/** Every item, in the order of the sidebar. */
export const NAV_ITEMS: readonly NavItem[] = NAV_GROUPS.flatMap((g) => g.items);

/** The five items of a phone's bottom bar. Everything else is a search (the header's button) or a tap away. */
export const BOTTOM_NAV: readonly NavItem[] = ['/home', '/topics', '/practice', '/progress', '/settings'].map((href) => NAV_ITEMS.find((i) => i.href === href)!);

const under = (pathname: string, prefix: string) => pathname === prefix || pathname.startsWith(`${prefix}/`);

/**
 * The item a page belongs to: the one whose address (or one of its `also`) is the longest that the page's address
 * starts with. `/practice/marathon/all` is Marathon, `/practice/topic` is Practice, `/topics/ledger` is Topics.
 * Undefined for a page of no item.
 */
export function activeItem(pathname: string, items: readonly NavItem[] = NAV_ITEMS): NavItem | undefined {
  let best: { item: NavItem; length: number } | undefined;
  for (const item of items) {
    for (const prefix of [item.href, ...(item.also ?? [])]) {
      if (under(pathname, prefix) && (!best || prefix.length > best.length)) best = { item, length: prefix.length };
    }
  }
  return best?.item;
}

/** The item of the bottom bar a page comes under, where its own item is not on the bar: by the group of that item. */
const BOTTOM_OF_GROUP: Record<string, string> = { Learn: '/topics', Practise: '/practice', You: '/progress' };

/**
 * The item of a phone's bottom bar to mark on a page: its own item when the bar has it, otherwise the item its group
 * comes under (a quick sheet is under Topics, a mock paper under Practice). Mistakes is under Practice.
 */
export function bottomItem(pathname: string): NavItem | undefined {
  const item = activeItem(pathname);
  if (!item) return undefined;
  if (BOTTOM_NAV.includes(item)) return item;
  const href = BOTTOM_OF_GROUP[groupOf(item) ?? ''] ?? '/practice';
  return BOTTOM_NAV.find((i) => i.href === href);
}

/** The group label of an item ('Learn', 'Practise', 'You'), or null for one at the top level. */
export const groupOf = (item: NavItem): string | null => NAV_GROUPS.find((g) => g.items.includes(item))?.label ?? null;

/** The playground with a topic, and a pattern of it, chosen: `/playground?topic=<topicId>&pattern=<templateId>`. */
export function playgroundHref(topicId?: string, templateId?: string): string {
  const params = new URLSearchParams();
  if (topicId) params.set('topic', topicId);
  if (templateId) params.set('pattern', templateId);
  const query = params.toString();
  return query ? `/playground?${query}` : '/playground';
}
