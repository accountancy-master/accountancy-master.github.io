import { describe, expect, it } from 'vitest';
import { topicTitle } from '@/content/outline';
import { COURSES, packsOf } from '@/content/registry';
import { bankOf, buildPaper } from './mockPaper';
import { BLUEPRINTS, CLASS12_BLUEPRINTS } from './paperBlueprints';
import {
  MAX_PAPER_SEED,
  MAX_SHEET_SEED,
  SHEET_COUNTS,
  SHEET_KINDS,
  buildWorksheet,
  drawSeed,
  kindCounts,
  marksOf,
  parseWorksheetCode,
  sheetQuestions,
  sheetSources,
  sheetTopics,
  withSeed,
  worksheetCode,
  type SheetSpec,
  type Worksheet,
} from './worksheet';

const C11 = COURSES[0].id;
const C12 = COURSES[1].id;
const T11 = packsOf(C11).map((p) => p.topicId);
const T12 = packsOf(C12).map((p) => p.topicId);

const topics = (over: Partial<Extract<SheetSpec, { mode: 'topics' }>> = {}): Extract<SheetSpec, { mode: 'topics' }> => ({
  courseId: C11,
  mode: 'topics',
  topicIds: ['ledger', 'trial-balance'],
  kinds: [...SHEET_KINDS],
  difficulty: 'mixed',
  count: 10,
  seed: 4242,
  ...over,
});

const ids = (sheet: Worksheet) => sheetQuestions(sheet).map((q) => q.id);

describe('the code of a worksheet', () => {
  it('is W, the class and ten characters in two groups', () => {
    expect(worksheetCode(topics())).toMatch(/^W11-[0-9A-HJKMNP-TV-Z]{5}-[0-9A-HJKMNP-TV-Z]{5}$/);
    expect(worksheetCode(topics({ courseId: C12, topicIds: [T12[0]] }))).toMatch(/^W12-/);
    expect(worksheetCode({ courseId: C11, mode: 'paper', paper: 'full', seed: 37 })).toMatch(/^W11-/);
  });

  it('reads back every choice it was made from', () => {
    const specs: SheetSpec[] = [
      topics(),
      topics({ topicIds: T11, kinds: ['quick'], difficulty: 'easy', count: 50, seed: 1 }),
      topics({ topicIds: [T11[T11.length - 1]], kinds: ['set', 'case'], difficulty: 'complex', count: 30, seed: MAX_SHEET_SEED }),
      topics({ courseId: C12, topicIds: T12, kinds: ['format'], difficulty: 'medium', count: 20, seed: 777 }),
      { courseId: C11, mode: 'paper', paper: 'full', seed: 1 },
      { courseId: C12, mode: 'paper', paper: 'half', seed: MAX_PAPER_SEED },
    ];
    for (const spec of specs) {
      const code = worksheetCode(spec);
      const parsed = parseWorksheetCode(code);
      expect(parsed, code).toEqual({ ok: true, spec, code });
    }
  });

  it('does not care for small letters, spaces, missing dashes, or O, I and L for 0, 1 and 1', () => {
    const code = worksheetCode(topics());
    const parsed = parseWorksheetCode(code);
    for (const typed of [code.toLowerCase(), code.replace(/-/g, ''), ` ${code.replace(/-/g, ' ')} `, code.replace(/0/g, 'O').replace(/1/g, 'l')]) {
      expect(parseWorksheetCode(typed), typed).toEqual(parsed);
    }
  });

  it('refuses what is not a code, a letter copied wrong, two letters swapped and choices it cannot make', () => {
    const code = worksheetCode(topics());
    for (const bad of ['', 'W11', 'hello', 'W11-ABCDE', 'W11-ABCDE-FGHJKM', 'X11-ABCDE-FGHJK', 'W11-ABCDE-FGHJU']) {
      expect(parseWorksheetCode(bad).ok, bad).toBe(false);
    }
    const chars = code.replace(/-/g, '').slice(3).split('');
    const alphabet = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
    for (let i = 0; i < chars.length; i++) {
      // Every other character in every place.
      for (const ch of alphabet) {
        if (ch === chars[i]) continue;
        const typed = [...chars];
        typed[i] = ch;
        const v = alphabet.indexOf(ch) - alphabet.indexOf(chars[i]);
        if (Math.abs(v) === 31) continue; // 0 for Z: the one change a check modulo 31 cannot see.
        expect(parseWorksheetCode(`W11${typed.join('')}`).ok, `${i} ${ch}`).toBe(false);
      }
      if (i + 1 < chars.length && chars[i] !== chars[i + 1] && Math.abs(alphabet.indexOf(chars[i]) - alphabet.indexOf(chars[i + 1])) !== 31) {
        const swapped = [...chars];
        [swapped[i], swapped[i + 1]] = [swapped[i + 1], swapped[i]];
        expect(parseWorksheetCode(`W11${swapped.join('')}`).ok, `swap ${i}`).toBe(false);
      }
    }
    // A class the app does not have.
    expect(parseWorksheetCode(code.replace('W11', 'W13')).ok).toBe(false);
    const reasons = [parseWorksheetCode('nonsense'), parseWorksheetCode(`W11${chars.reverse().join('')}`)];
    for (const r of reasons) if (!r.ok) expect(r.reason).toMatch(/code/);
  });

  it('is refused for choices no sheet can have', () => {
    expect(() => worksheetCode(topics({ topicIds: [] }))).toThrow();
    expect(() => worksheetCode(topics({ kinds: [] }))).toThrow();
    expect(() => worksheetCode(topics({ topicIds: ['mock-exams'] }))).toThrow();
    expect(() => worksheetCode(topics({ topicIds: [T12[0]] }))).toThrow();
    expect(() => worksheetCode(topics({ seed: 0 }))).toThrow();
    expect(() => worksheetCode(topics({ count: 12 as 10 }))).toThrow();
    expect(() => worksheetCode({ courseId: C11, mode: 'paper', paper: 'full', seed: MAX_PAPER_SEED + 1 })).toThrow();
  });

  it('draws a new seed in range for "New sheet"', () => {
    expect(drawSeed({ mode: 'topics' }, () => 0)).toBe(1);
    expect(drawSeed({ mode: 'topics' }, () => 0.999999)).toBe(MAX_SHEET_SEED);
    expect(drawSeed({ mode: 'paper' }, () => 0.999999)).toBe(MAX_PAPER_SEED);
    expect(worksheetCode(withSeed(topics(), 5))).not.toBe(worksheetCode(topics()));
  });
});

describe('a worksheet of topics', () => {
  it('is made again exactly from its code', () => {
    const spec = topics();
    const sheet = buildWorksheet(spec);
    const parsed = parseWorksheetCode(sheet.code);
    if (!parsed.ok) throw new Error(parsed.reason);
    const again = buildWorksheet(parsed.spec);
    expect(again).toEqual(sheet);
    expect(ids(again)).toEqual(ids(sheet));
    // The order the topics and kinds were listed in changes nothing.
    expect(ids(buildWorksheet({ ...spec, topicIds: [...spec.topicIds].reverse(), kinds: [...spec.kinds].reverse() }))).toEqual(ids(sheet));
    // Another seed is another sheet.
    expect(ids(buildWorksheet(withSeed(spec, spec.seed + 1)))).not.toEqual(ids(sheet));
  });

  it('asks as many questions as chosen, numbered from 1, of the topics and kinds chosen', () => {
    for (const count of SHEET_COUNTS) {
      const sheet = buildWorksheet(topics({ count, seed: count }));
      expect(sheet.items).toHaveLength(count);
      expect(sheet.items.map((i) => i.number)).toEqual(Array.from({ length: count }, (_, i) => i + 1));
      for (const item of sheet.items) expect(['ledger', 'trial-balance']).toContain(item.topicId);
      expect(sheet.marks).toBe(sheet.items.reduce((s, i) => s + i.marks, 0));
    }
  });

  it('shares the questions out among the kinds chosen, and sets them kind by kind', () => {
    const sheet = buildWorksheet(topics({ topicIds: T11, count: 20, seed: 99 }));
    const counts = Object.fromEntries(SHEET_KINDS.map((k) => [k, sheet.items.filter((i) => i.kind === k).length]));
    for (const k of SHEET_KINDS) expect(counts[k], k).toBe(4);
    const order = sheet.items.map((i) => SHEET_KINDS.indexOf(i.kind));
    expect(order).toEqual([...order].sort((a, b) => a - b));
    // A question of each kind is what the kind says.
    for (const item of sheet.items) {
      const types = item.questions.map((q) => q.type);
      if (item.kind === 'case') expect(item.questions.length).toBeGreaterThan(1);
      else expect(types).toHaveLength(1);
      if (item.kind === 'quick') expect(['mcq', 'true_false', 'numeric']).toContain(types[0]);
      if (item.kind === 'journal') expect(types[0]).toBe('journal_entry');
      if (item.kind === 'set') expect(types[0]).toBe('journal_set');
      if (item.kind === 'format') expect(['account', 'statement']).toContain(types[0]);
    }
  });

  it('takes only the kinds chosen, spread over the topics chosen', () => {
    const sheet = buildWorksheet(topics({ topicIds: ['journal-entries', 'ledger', 'cash-book'], kinds: ['journal'], count: 30, seed: 3 }));
    expect(sheet.items.every((i) => i.kind === 'journal')).toBe(true);
    const per = (t: string) => sheet.items.filter((i) => i.topicId === t).length;
    // Each topic gives its share while it has something to give: a topic of two authored entries gives both, and
    // the topics with templates share the rest as evenly as they can.
    const sources = (t: string) => sheetSources(C11, [t], 'mixed').filter((s) => s.kind === 'journal');
    const authoredOnly = ['journal-entries', 'ledger', 'cash-book'].filter((t) => sources(t).length > 0 && sources(t).every((s) => 'authored' in s));
    for (const t of authoredOnly) expect(per(t), t).toBe(Math.min(sources(t).length, 10));
    const shares = ['journal-entries', 'ledger', 'cash-book'].filter((t) => sources(t).some((s) => 'template' in s)).map(per);
    expect(Math.max(...shares) - Math.min(...shares)).toBeLessThanOrEqual(1);
  });

  it('keeps to the difficulty chosen', () => {
    for (const difficulty of ['easy', 'medium', 'complex'] as const) {
      const sheet = buildWorksheet(topics({ topicIds: T11, difficulty, count: 30, seed: 11 }));
      expect(sheet.items.length).toBe(30);
      for (const q of sheetQuestions(sheet)) expect(q.difficulty, q.id).toBe(difficulty);
    }
  });

  it('gives the marks the mock papers give', () => {
    expect(marksOf('quick', 'easy', 'mcq')).toBe(1);
    expect(marksOf('quick', 'complex', 'true_false')).toBe(1);
    expect(marksOf('quick', 'easy', 'numeric')).toBe(3);
    expect(marksOf('quick', 'complex', 'numeric')).toBe(4);
    expect(marksOf('journal', 'medium')).toBe(3);
    expect(marksOf('journal', 'complex')).toBe(4);
    expect(marksOf('set', 'easy')).toBe(3);
    expect(marksOf('set', 'medium')).toBe(4);
    expect(marksOf('set', 'complex')).toBe(6);
    expect(marksOf('format', 'easy')).toBe(4);
    expect(marksOf('format', 'complex')).toBe(6);
    expect(marksOf('case', 'easy')).toBe(6);
    const sheet = buildWorksheet(topics({ topicIds: T11, count: 50, seed: 5 }));
    for (const item of sheet.items) {
      if (item.kind !== 'case') expect(item.marks).toBe(marksOf(item.kind, item.questions[0].difficulty, item.questions[0].type));
      else expect(item.marks).toBe(6);
    }
  });

  it('never asks an authored question twice, and draws a template again only with another seed', () => {
    const sheet = buildWorksheet(topics({ topicIds: ['journal-entries'], kinds: ['quick', 'journal'], count: 50, seed: 8 }));
    const all = ids(sheet);
    expect(new Set(all).size).toBe(all.length);
  });

  it('says what each kind has for the topics and difficulty', () => {
    const counts = kindCounts(C11, ['accounting-equation'], 'mixed');
    expect(counts.quick).toBeGreaterThan(0);
    expect(counts.case).toBe(0);
    expect(kindCounts(C11, ['introduction-to-accounting'], 'mixed').case).toBe(3);
    expect(kindCounts(C11, T11, 'mixed').case).toBeGreaterThan(0);
    expect(kindCounts(C11, [], 'mixed')).toEqual({ quick: 0, journal: 0, set: 0, format: 0, case: 0 });
  });

  it('makes a sheet of Class 12 topics of every kind', () => {
    const sheet = buildWorksheet(topics({ courseId: C12, topicIds: T12, count: 10, seed: 12 }));
    expect(sheet.items).toHaveLength(10);
    expect(new Set(sheet.items.map((i) => i.kind))).toEqual(new Set(SHEET_KINDS));
    expect(sheet.code).toMatch(/^W12-/);
  });

  it('is titled by its topics, or its units when they are whole', () => {
    expect(buildWorksheet(topics({ topicIds: T11 })).title).toBe('All topics');
    expect(buildWorksheet(topics({ topicIds: ['ledger', 'trial-balance'] })).title).toBe(`${topicTitle('ledger')} and ${topicTitle('trial-balance')}`);
    expect(buildWorksheet(topics({ topicIds: T11.slice(2, 7) })).title).toBe(`${topicTitle(T11[2])}, ${topicTitle(T11[3])} and 3 more`);
    expect(buildWorksheet(topics({ topicIds: ['introduction-to-accounting', 'theory-base'] })).title).toBe('Theoretical Framework');
    expect(buildWorksheet(topics()).subtitle).toMatch(/10 questions$/);
  });
});

describe('a worksheet in the board pattern', () => {
  it('is the mock paper of the same kind and number, with its marks', () => {
    for (const [courseId, blueprints] of [
      [C11, BLUEPRINTS],
      [C12, CLASS12_BLUEPRINTS],
    ] as const) {
      for (const paper of ['full', 'half'] as const) {
        const spec: SheetSpec = { courseId, mode: 'paper', paper, seed: 37 };
        const sheet = buildWorksheet(spec);
        const mock = buildPaper({ kind: paper, number: 37 }, bankOf(courseId));
        expect(sheet.marks).toBe(blueprints[paper].marks);
        expect(sheet.items.reduce((s, i) => s + i.marks, 0)).toBe(blueprints[paper].marks);
        expect(sheet.items.map((i) => i.marks)).toEqual(mock.entries.map((e) => e.marks));
        expect(ids(sheet)).toEqual(mock.entries.flatMap((e) => e.questions.map((q) => q.id)));
        expect(sheet.title).toBe(`${blueprints[paper].title} 37`);
        expect(sheetTopics(spec)).toEqual(expect.arrayContaining([...new Set(sheet.items.map((i) => i.topicId))]));
        // Rebuilt from its code.
        const parsed = parseWorksheetCode(sheet.code);
        expect(parsed.ok && ids(buildWorksheet(parsed.spec))).toEqual(ids(sheet));
      }
    }
  });

  it('has the parts of the paper', () => {
    const sheet = buildWorksheet({ courseId: C11, mode: 'paper', paper: 'full', seed: 2 });
    expect([...new Set(sheet.items.map((i) => i.part))]).toEqual(['A', 'B']);
    expect(sheet.items.some((i) => i.kind === 'case')).toBe(true);
  });
});
