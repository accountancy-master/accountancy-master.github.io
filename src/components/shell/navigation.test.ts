import { describe, expect, it } from 'vitest';
import { BOTTOM_NAV, NAV_GROUPS, NAV_ITEMS, activeItem, bottomItem, groupOf, playgroundHref } from './navigation';

describe('the navigation', () => {
  it('has every item once, with a test id of its own', () => {
    expect(new Set(NAV_ITEMS.map((i) => i.href)).size).toBe(NAV_ITEMS.length);
    expect(new Set(NAV_ITEMS.map((i) => i.testId)).size).toBe(NAV_ITEMS.length);
    expect(NAV_GROUPS.map((g) => g.label)).toEqual([null, 'Learn', 'Practise', null, 'You']);
    expect(NAV_ITEMS.map((i) => i.label)).toEqual(['Home', 'Topics', 'Cards', 'Quick sheets', 'Glossary', "What's inside", 'Mind maps', 'Simulator', 'Practice', 'Playground', 'Marathon', 'Case studies', 'Written answers', 'Before the exam', 'Project and viva', 'Mock papers', 'Worksheets', 'Mistakes', 'Progress', 'Settings']);
  });

  it('gives a phone the five items it always had', () => {
    expect(BOTTOM_NAV.map((i) => i.testId)).toEqual(['nav-home', 'nav-topics', 'nav-practice', 'nav-progress', 'nav-settings']);
  });

  it('marks the item a page belongs to: the longest address the page starts with', () => {
    const at = (path: string) => activeItem(path)?.href;
    expect(at('/home')).toBe('/home');
    expect(at('/topics/ledger')).toBe('/topics');
    expect(at('/practice')).toBe('/practice');
    expect(at('/practice/topic/ledger')).toBe('/practice');
    expect(at('/practice/marathon')).toBe('/practice/marathon');
    expect(at('/practice/marathon/all')).toBe('/practice/marathon');
    expect(at('/practice/cards')).toBe('/practice/cards');
    expect(at('/sheet/ledger')).toBe('/sheets');
    expect(at('/playground')).toBe('/playground');
    expect(at('/maps')).toBe('/maps');
    expect(at('/maps/goodwill')).toBe('/maps');
    expect(at('/')).toBeUndefined();
    // Play screens come under the item they are played from.
    expect(at('/play/ledger-level-2')).toBe('/topics');
    expect(at('/practice/mistakes')).toBe('/mistakes');
    expect(at('/practice/smart')).toBe('/practice');
    expect(at('/cases/play/dissolution')).toBe('/cases');
    expect(at('/mock/paper')).toBe('/mock');
    expect(at('/worksheets/sheet')).toBe('/worksheets');
    expect(at('/practical')).toBe('/practical');
    expect(at('/written')).toBe('/written');
    expect(at('/written/goodwill')).toBe('/written');
    expect(at('/practice')).toBe('/practice');
    // A page whose address only begins with the same letters is no part of it.
    expect(at('/homework')).toBeUndefined();
    expect(groupOf(activeItem('/cases')!)).toBe('Practise');
    expect(groupOf(activeItem('/home')!)).toBeNull();
  });

  it('marks on the bottom bar of a phone the item a page comes under', () => {
    const bottom = (path: string) => bottomItem(path)?.href;
    expect(bottom('/home')).toBe('/home');
    expect(bottom('/topics/ledger')).toBe('/topics');
    expect(bottom('/sheet/ledger')).toBe('/topics');
    expect(bottom('/inside')).toBe('/topics');
    expect(bottom('/glossary')).toBe('/topics');
    expect(bottom('/exam')).toBe('/practice');
    expect(bottom('/practical')).toBe('/practice');
    expect(bottom('/written/rewrite')).toBe('/practice');
    expect(bottom('/maps/ledger')).toBe('/topics');
    expect(bottom('/simulator')).toBe('/topics');
    expect(bottom('/practice/cards')).toBe('/topics');
    expect(bottom('/cases')).toBe('/practice');
    expect(bottom('/mistakes')).toBe('/practice');
    expect(bottom('/settings')).toBe('/settings');
    expect(bottom('/')).toBeUndefined();
  });

  it('writes the address of the playground with a topic and a pattern chosen', () => {
    expect(playgroundHref()).toBe('/playground');
    expect(playgroundHref('ledger')).toBe('/playground?topic=ledger');
    expect(playgroundHref('journal-entries', 'je-cash-sale')).toBe('/playground?topic=journal-entries&pattern=je-cash-sale');
  });
});
