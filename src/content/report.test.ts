import { describe, expect, it } from 'vitest';
import { SAMPLE_ACCOUNT, SAMPLE_BRS } from '@/testing/sampleFormats';
import { TEMPLATES, generateCaseQuestions, generateQuestion } from '@/generators';
import { ALL_PACKS, COURSES } from './registry';
import { buildCaseReport, buildReport, countByKind, formatSample } from './report';

describe('content report', () => {
  const text = buildReport().join('\n');
  const topics = COURSES.flatMap((c) => c.topics);

  it('lists each topic that has content, with counts by kind and difficulty, and no topic without', () => {
    for (const topic of topics) {
      const pack = ALL_PACKS.find((p) => p.topicId === topic.id);
      const templates = TEMPLATES.filter((t) => t.topicId === topic.id);
      const hasContent = pack && (templates.length > 0 || pack.levels.length > 0 || pack.cards.length > 0 || pack.questions.length > 0);
      if (!hasContent) {
        expect(text, topic.id).not.toContain(`(${topic.id})`);
        continue;
      }
      expect(text, topic.id).toContain(`=== ${topic.title} (${topic.id}) [${topic.status}] ===`);
      if (templates.length > 0) for (const part of countByKind(templates)) expect(text, `${topic.id}: ${part}`).toContain(part);
    }
  });

  // Thousands of searches through the whole report: it can pass 5 s when the full suite runs in parallel.
  it('shows three samples with answers for every template', () => {
    // The headings and sample ids are gathered once: searching the whole report (millions of characters) four times
    // for each of a thousand templates took longer than the 5 s a test is given once the report grew.
    const lines = new Set(text.split('\n').flatMap((l) => [l, ...(l.match(/\[gen:[^\]]+\]/g) ?? [])]));
    const headed = new Set([...lines].filter((l) => l.startsWith('--- ')).map((l) => l.split(' (')[0]));
    for (const { id, version } of TEMPLATES) {
      expect(headed.has(`--- ${id} v${version}`), id).toBe(true);
      for (const seed of [1, 2, 3]) expect(lines.has(`[gen:${id}:${version}:${seed}]`), `${id} ${seed}`).toBe(true);
    }
    // Several thousand searches of an 86,000-line report: over 5 s under the load of the full suite.
  }, 30_000);

  it('writes an entry, the options with their mistakes, and the working with common errors', () => {
    const sample = (kind: string) => {
      const t = TEMPLATES.find((x) => x.kind === kind);
      return t ? formatSample(generateQuestion(t.id, 1)).join('\n') : null;
    };
    expect(sample('journal')).toMatch(/\n {3}Dr {2}.+ {2}₹[\d,]+\n(?: {3}.*\n)* {3}Cr {2}.+₹[\d,]+/);
    const mcq = sample('mcq');
    if (mcq) {
      expect(mcq).toContain('<- correct');
      expect(mcq).toMatch(/\[[^\]]+\]/);
    }
    const numeric = sample('numeric');
    if (numeric) {
      expect(numeric).toMatch(/\nA: \S+/);
      expect(numeric).toContain('wrong ');
    }
  });

  it('counts templates by kind', () => {
    expect(countByKind([])).toEqual([]);
  });

  it('lays a format out for the reviewer: the data, each side with its rows and total, what is offered, and the working', () => {
    expect(formatSample(SAMPLE_ACCOUNT)).toEqual([
      `Q: ${SAMPLE_ACCOUNT.prompt}`,
      ...SAMPLE_ACCOUNT.data.split('\n').map((line) => `   | ${line}`),
      ' Rao & Co. A/c  [Amount (₹)]',
      '   Dr',
      '     9 Apr: To Purchases Return A/c  ₹2,000',
      '     18 Apr: To Cash A/c  ₹15,000',
      '     30 Apr: To Balance c/d [closing]  ₹33,000',
      '     Total  ₹50,000',
      '   Cr',
      '     1 Apr: By Balance b/d  ₹10,000',
      '     4 Apr: By Purchases A/c  ₹40,000',
      '     Total  ₹50,000',
      '     (below the totals)',
      '     1 May: By Balance b/d  ₹33,000',
      `   offered: ${SAMPLE_ACCOUNT.labels.join('; ')}`,
      '     - The credit side is larger.',
      '     - The balance is carried down on the debit side.',
    ]);
    const lines = formatSample(SAMPLE_BRS);
    expect(lines).toContain('     Cheques deposited but not credited  - | ₹4,000');
    expect(lines).toContain('     Total  ₹26,000 | ₹4,000');
    expect(lines).toContain('     Balance as per Pass Book  ₹22,000');
    // Every format of the bank is in the report, with its kind.
    for (const t of TEMPLATES.filter((x) => x.kind === 'account' || x.kind === 'statement')) expect(text, t.id).toContain(`--- ${t.id} v${t.version} (${t.kind}, `);
  });

  it('prints the data of a format of a case study once, as the case, not again under the format', () => {
    const asPart = { ...SAMPLE_ACCOUNT, context: SAMPLE_ACCOUNT.data };
    expect(formatSample(asPart)).toEqual(formatSample(SAMPLE_ACCOUNT).filter((line) => !line.startsWith('   | ')));
    // The chained case of the final accounts: for each of its two samples the case stands once, above the three accounts.
    const id = 'case-fa-chain-trading-pl-bs';
    const report = buildCaseReport();
    const from = report.findIndex((line) => line.startsWith(`--- ${id} `));
    const own = report.slice(from + 1, report.findIndex((line, i) => i > from && (line.startsWith('--- ') || line.startsWith('=== '))));
    const printed = [1, 2].reduce((n, seed) => n + generateCaseQuestions(id, seed)[0].context!.split('\n').length, 0);
    expect(from).toBeGreaterThan(0);
    expect(own.filter((line) => line.startsWith('   | '))).toHaveLength(printed);
    expect(own.filter((line) => line.startsWith(' Balance Sheet of '))).toHaveLength(2);
  });
});
