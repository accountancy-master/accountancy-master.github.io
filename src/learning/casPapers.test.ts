import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
// The registry first: it registers every real template and installs the outline of what there is.
import { COURSES, packsOf } from '@/content/registry';
import { CBSE12 } from '@/content/courses/cbse12';
import { STAGES, stagesOf } from '@/content/outline';
import { bankOf, bankOfPaper, buildPaper, paperKey, paperTopics, parsePaperKey, refOfBank, sectionTopics, type MockPaper } from './mockPaper';
import { CLASS12_BLUEPRINTS, CLASS12_CAS_BLUEPRINTS, MARK_VALUES, STAGES_OUTSIDE_PAPERS, blueprintsOf, questionCount, unitMarksOf, type MarkValue } from './paperBlueprints';
import { buildWorksheet, parseWorksheetCode, worksheetCode } from './worksheet';

// The mock papers of a Class 12 learner who takes Computerised Accounting as Part B (content/courseOptions.ts), and
// proof that those of every other learner are what they were.

const C12 = CBSE12.id;
const CAS = 'computerised-accounting';
const computerised = { class12PartB: 'computerised' } as const;
const marksOf = (questions: Record<MarkValue, number>) => MARK_VALUES.reduce((sum, value) => sum + value * questions[value], 0);
const ids = (paper: MockPaper, part: string) => paper.entries.filter((e) => e.part === part).map((e) => e.questions.map((q) => q.id).join('+'));

describe('the papers of a learner who takes Computerised Accounting as Part B', () => {
  it('keep Part A and set Part B from Computerised Accounting, in the pattern of the sample paper', () => {
    expect(blueprintsOf(C12)).toBe(CLASS12_BLUEPRINTS);
    expect(blueprintsOf(C12, {})).toBe(CLASS12_BLUEPRINTS);
    expect(blueprintsOf(C12, computerised)).toBe(CLASS12_CAS_BLUEPRINTS);
    // The option is of Class 12 alone.
    expect(blueprintsOf('cbse-11-accountancy', computerised)).toBe(blueprintsOf('cbse-11-accountancy'));
    const { full } = CLASS12_CAS_BLUEPRINTS;
    expect(full.sections.filter((s) => s.part === 'A')).toEqual(CLASS12_BLUEPRINTS.full.sections.filter((s) => s.part === 'A'));
    expect(full.sections.filter((s) => s.part === 'B').map((s) => [s.title, s.topics, s.marks, s.questions])).toEqual([
      ['Computerised Accounting', { unit: 'Computerised Accounting' }, 20, { 1: 4, 3: 2, 4: 1, 6: 1 }],
    ]);
    for (const s of full.sections) expect(marksOf(s.questions), s.title).toBe(s.marks);
    expect([full.marks, full.minutes, questionCount(full)]).toEqual([80, 180, 34]);
    expect(CLASS12_CAS_BLUEPRINTS.half).toBe(CLASS12_BLUEPRINTS.half);
    expect(CLASS12_CAS_BLUEPRINTS.topic).toBe(CLASS12_BLUEPRINTS.topic);
    expect(unitMarksOf(C12, computerised)).toEqual({ 'Accounting for Partnership Firms': 36, 'Accounting for Companies': 24, 'Computerised Accounting': 20 });
    expect(unitMarksOf(C12)).toEqual({ 'Accounting for Partnership Firms': 36, 'Accounting for Companies': 24, 'Analysis of Financial Statements': 12, 'Cash Flow Statement': 8 });
  });

  it('come from a bank of their own: Part A and Computerised Accounting, each topic at its place in the catalogue', () => {
    const bank = bankOf(C12, computerised);
    expect(bankOf(C12, computerised)).toBe(bank);
    expect(bank.topics.map((t) => t.id)).toEqual([...packsOf(C12).map((p) => p.topicId).filter((id) => !['company-financial-statements', 'financial-statement-analysis', 'accounting-ratios', 'cash-flow-statement'].includes(id))]);
    expect(bank.topics.find((t) => t.id === CAS)!.courseIndex).toBe(CBSE12.topics.length - 1);
    expect(bank.templates.every((t) => t.topicId !== 'accounting-ratios')).toBe(true);
    expect(bank.stages.map((s) => s.id)).not.toContain('analysis');
    // The default bank is the one it always was: no Computerised Accounting in it.
    expect(bankOf(C12)).toBe(bankOf(C12, {}));
    expect(bankOf(C12).topics.map((t) => t.id)).not.toContain(CAS);
  });

  it('are named with "cas." before the key, so that a paper is rebuilt from its own bank whatever the learner chooses later', () => {
    const bank = bankOf(C12, computerised);
    const ref = refOfBank(bank, { kind: 'full', number: 3 });
    expect(ref).toEqual({ kind: 'full', number: 3, partB: 'computerised' });
    expect(paperKey(ref)).toBe('cas.full.3');
    expect(parsePaperKey('cas.full.3')).toEqual(ref);
    expect(parsePaperKey('cas.topic.goodwill.2')).toEqual({ kind: 'topic', topicId: 'goodwill', number: 2, partB: 'computerised' });
    expect(parsePaperKey('full.3')).toEqual({ kind: 'full', number: 3 });
    expect(parsePaperKey('cas.cas.full.3')).toBeNull();
    expect(refOfBank(bankOf(C12), { kind: 'full', number: 3 })).toEqual({ kind: 'full', number: 3 });
    expect(bankOfPaper(C12, ref)).toBe(bank);
    expect(bankOfPaper(C12, { partB: undefined })).toBe(bankOf(C12));
    // A paper is never built from the bank of the other choice.
    expect(() => buildPaper(ref, bankOf(C12))).toThrow('not of this bank');
    expect(() => buildPaper({ kind: 'full', number: 3 }, bank)).toThrow('not of this bank');
  });

  it('build a full paper of 80 marks: Part A as the same paper of the default choice, Part B all Computerised Accounting', () => {
    for (const number of [1, 2, 3, 4, 5, 6]) {
      const ref = { kind: 'full' as const, number, partB: 'computerised' as const };
      const bank = bankOfPaper(C12, ref);
      const paper = buildPaper(ref, bank);
      const usual = buildPaper({ kind: 'full', number }, bankOf(C12));
      expect(paper.key).toBe(`cas.full.${number}`);
      expect(paper.entries).toHaveLength(34);
      expect(paper.entries.reduce((sum, e) => sum + e.marks, 0)).toBe(80);
      expect(ids(paper, 'A'), `paper ${number}`).toEqual(ids(usual, 'A'));
      const partB = paper.entries.filter((e) => e.part === 'B');
      expect(partB.map((e) => e.marks)).toEqual([1, 1, 1, 1, 3, 3, 4, 6]);
      expect(partB.every((e) => e.topicId === CAS)).toBe(true);
      // The 6-mark question is a schedule prepared as a sheet sets it out.
      expect(partB.at(-1)!.questions.map((q) => [q.type, q.difficulty])).toEqual([['statement', 'complex']]);
      expect(paperTopics(ref, bank)).toEqual([...sectionTopics(bank.blueprints.full.sections[0], bank, {}), ...sectionTopics(bank.blueprints.full.sections[1], bank, {}), ...sectionTopics(bank.blueprints.full.sections[2], bank, {})].map((t) => t.id));
    }
  }, 60_000);

  it('set a topic test of Computerised Accounting, and one of a topic of Part A that is the same paper under either choice', () => {
    const bank = bankOf(C12, computerised);
    const cas = buildPaper({ kind: 'topic', topicId: CAS, number: 1, partB: 'computerised' }, bank);
    expect(cas.entries.reduce((sum, e) => sum + e.marks, 0)).toBe(20);
    expect(cas.entries.every((e) => e.topicId === CAS)).toBe(true);
    const goodwill = buildPaper({ kind: 'topic', topicId: 'goodwill', number: 2, partB: 'computerised' }, bank);
    const usual = buildPaper({ kind: 'topic', topicId: 'goodwill', number: 2 }, bankOf(C12));
    expect(goodwill.entries.map((e) => e.questions.map((q) => q.id))).toEqual(usual.entries.map((e) => e.questions.map((q) => q.id)));
    // A topic of the other choice is not in the bank.
    expect(() => buildPaper({ kind: 'topic', topicId: 'accounting-ratios', number: 1, partB: 'computerised' }, bank)).toThrow();
  });

  it('give a worksheet of the paper a code of its own, which makes the same paper again', () => {
    const spec = { courseId: C12, mode: 'paper' as const, paper: 'full' as const, seed: 4, partB: 'computerised' as const };
    const code = worksheetCode(spec);
    const parsed = parseWorksheetCode(code);
    expect(parsed).toEqual({ ok: true, spec, code });
    // The default paper of the same number has the code it always had, and another sheet.
    const usual = worksheetCode({ courseId: C12, mode: 'paper', paper: 'full', seed: 4 });
    expect(usual).not.toBe(code);
    expect(parseWorksheetCode(usual)).toMatchObject({ ok: true, spec: { courseId: C12, mode: 'paper', paper: 'full', seed: 4 } });
    expect((parseWorksheetCode(usual) as { spec: object }).spec).not.toHaveProperty('partB');
    const sheet = buildWorksheet(spec);
    expect(sheet.items.filter((i) => i.part === 'B').every((i) => i.topicId === CAS)).toBe(true);
    expect(sheet.marks).toBe(80);
    // A sheet of topics names Computerised Accounting by its place in the catalogue, as any topic.
    const topics = { courseId: C12, mode: 'topics' as const, topicIds: ['goodwill', CAS], kinds: ['quick' as const], difficulty: 'mixed' as const, count: 10 as const, seed: 77 };
    expect(parseWorksheetCode(worksheetCode(topics))).toMatchObject({ ok: true, spec: topics });
    // The code of Class 11 has no choice of Part B.
    expect(() => worksheetCode({ courseId: 'cbse-11-accountancy', mode: 'paper', paper: 'full', seed: 4, partB: 'computerised' })).toThrow();
  });
});

describe('the stages that stay outside the papers', () => {
  const C11 = 'cbse-11-accountancy';
  const outside = new Set(STAGES_OUTSIDE_PAPERS);
  const banks = [bankOf(C11), bankOf(C12), bankOf(C12, computerised)];

  it('are stages that have cases, played like any other, and in no bank a paper is set from', () => {
    expect([...outside]).toEqual(['incomplete-records-cases', 'computerised-accounting-cases', 'accounting-basics', 'concepts-in-practice', 'provisions-reserves-cases']);
    // The stages of the theory topics that open Class 11 hold a few cases each, Provisions and Reserves three or more;
    // the others ten or more.
    const fewest: Record<string, number> = { 'accounting-basics': 2, 'concepts-in-practice': 2, 'provisions-reserves-cases': 3 };
    for (const id of outside) expect(STAGES.find((s) => s.id === id)?.cases.length, id).toBeGreaterThanOrEqual(fewest[id] ?? 10);
    expect(stagesOf(C11).map((s) => s.id)).toContain('incomplete-records-cases');
    expect(stagesOf(C11).map((s) => s.id)).toContain('provisions-reserves-cases');
    expect(stagesOf(C12, computerised).map((s) => s.id)).toContain('computerised-accounting-cases');
    for (const bank of banks) expect(bank.stages.filter((s) => outside.has(s.id))).toEqual([]);
  });

  it('are never set: the 6-mark questions of the papers come from the stages that were always in them', () => {
    const ofOutside = new Set(STAGES.filter((s) => outside.has(s.id)).flatMap((s) => s.cases.map((c) => c.id)));
    for (const bank of banks) {
      for (let number = 1; number <= 6; number++) {
        for (const kind of ['full', 'half'] as const) {
          const entries = buildPaper(refOfBank(bank, { kind, number }), bank).entries;
          expect(entries.filter((e) => e.caseId !== undefined && ofOutside.has(e.caseId))).toEqual([]);
        }
      }
    }
  }, 60_000);
});

describe('the papers of every other learner', () => {
  // Every full and half-yearly paper 1 to 8 of each course, and topic tests 1 and 2 of every topic of its default bank,
  // whole. The hash was taken on the code before Computerised Accounting was added, which did not move it
  // (6b15bdb06fe39b3d8707f4c2c4066217d67bf7766eb459ecf45aff4e31cf6ee5). It moved with the quality pass of the first five
  // Class 11 topics, and only through what that pass corrected: 55 entries of the Class 11 papers whose question is a
  // template raised to version 2 for an audit fix (ia-info-need, ia-term-trade, ia-define-trade, ia-classify-two,
  // thb-gst-net-payable, thb-gst-invoice-discount, thb-asset-cost, ae-totals-5, je-asset-sale-gain-loss,
  // je-trade-discount, je-voucher-total, je-voucher-count, je-rules-type-adjusted, je-cheque-dishonoured-charges,
  // led-cd-wording, led-creditor-balance, led-debtor-balance, led-normal-contra, led-personal-transactions,
  // led-balance-transactions; and, worded without "he" or "his" by its examiner, ia-goods-or-asset, ia-two-discounts,
  // ia-closing-stock-flow, ia-financial-transaction) or an authored question corrected in place (ia-q-077, ia-q-081;
  // ae-q-021, 022, 024 in the board's Assertion-Reason wording; thb-q-004, 011, 026, 047, 069, 075 with the "True or
  // false:" lead-in, and 075's explanation without the IGST order; ia-q-046, ia-q-053 and je-q-005 without a gendered
  // pronoun). Every other entry, and every Class 12 paper, is as it was.
  //
  // Moved by the Class 11 quality pass of depreciation, provisions-and-reserves, final-accounts,
  // final-accounts-adjustments and incomplete-records (it was 6b15bdb06fe39b3d8707f4c2c4066217d67bf7766eb459ecf45aff4e31cf6ee5).
  // 17 of the 86 papers changed, and each only where it sets a question that the pass changed, at the same place: a
  // template raised to version 2 (interest on drawings taken out of faa-fmt-balance-sheet and case-fa-full-problem; the
  // rest for the hints of their own that replaced the two general ones, or for a fix: fa-cogs-returns and
  // fa-direct-indirect now fit the business, fa-fmt-balance-sheet no longer claims to mark the order), or an authored
  // question put right (fa-q-007, 017, 018, 032, pr-q-044, ir-q-011, 016: longer explanations, the board's order of the
  // Assertion-Reason options). No other question of any paper moved: the new templates, authored questions and the case
  // stage of the pass are outside the papers (`outsidePapers`, `STAGES_OUTSIDE_PAPERS`), and dep-q-030 kept its id,
  // type and difficulty.
  //
  // It moved (from 6b15bdb06fe39b3d8707f4c2c4066217d67bf7766eb459ecf45aff4e31cf6ee5) with the quality pass of the first
  // four Class 12 topics, and only where an item it fixed stands in a paper: the authored Assertion-Reason questions
  // put in the board's option order (pf-q-017, gw-q-009, gw-q-025, cpr-q-021, cpr-q-022, adm-q-007, adm-q-009), and
  // the templates raised to version 2 for an error (pf-ioc-opening-from-closing and pf-current-balance, hints that did
  // not fit; cpr-who-changes, cpr-rev-result, cpr-single-direction, cpr-cap-complex and cpr-bs-total, working shown
  // over unlike denominators or as "₹0" and "₹-", and a direction never drilled). 16 papers of Class 12 hold one of
  // them; every other entry of every paper is what it was, and no new template is in any paper (outsidePapers.ts).
  //
  // Moved from 6b15bdb06fe39b3d8707f4c2c4066217d67bf7766eb459ecf45aff4e31cf6ee5 by the quality pass of retirement,
  // dissolution, share capital and debentures, only where a fixed item is in a paper: authored Assertion-Reason items
  // now in the board's option order (ret-q-029, dis-q-011, dis-q-021, sc-q-013, deb-q-006: Class 12 half 1, full 2,
  // half 4, full 6, full 8 and the retirement topic test 2); the debentures ledger formats that now state the posting
  // rule (full 8, debentures topic tests 1 and 2); the company templates with hints of their own in place of the
  // generic ones (full 3, full 8, share capital topic test 1). No other paper moved, and no new template is in any.
  //
  // Moved by the quality pass after the Class 12 audit (6b15bdb06fe39b3d8707f4c2c4066217d67bf7766eb459ecf45aff4e31cf6ee5
  // before it). Every paper draws the same questions from the same templates and seeds as before; only the wording of
  // questions whose templates were fixed (version 2) or whose authored text was fixed changed, in these papers:
  // Class 12 full 1 (fs-fmt-spl: bank charges for collecting cheques), full 2 (fs-fmt-bs-equity-liabilities: Debenture
  // Redemption Reserve for Share Options Outstanding, a trade and city), full 4 (fs-cnc-split-amount) and full 5
  // (fs-cnc-loan-instalments; both real hints in place of the generic pair, a trade and city), full 6 (fs-fmt-note;
  // fsa-objective-or-not: forecasting no longer an objective), the topic tests of company-financial-statements 1 and 2
  // (also fs-form-facts, fs-contingent-total, fs-total-current-liabilities, fs-total-reserves-surplus,
  // fs-total-short-term-borrowings: real hints; fs-q-056: bank charges) and of financial-statement-analysis 1
  // (fsa-limitation-spot: real hints). No Class 11 paper moved.
  // Then by the examiner's review of that pass (1bfeb8311a9a574bc6199912173a378d3b2c63a43d5a69b66733bd517699de96
  // before it), again with the same questions in the same places: the authored Assertion-Reason questions now show
  // their options in the board's order, (a) to (d) (Class 12 full 1: cf-q-025; full 7: cf-q-019; the topic tests of
  // financial-statement-analysis 2: fsa-q-013, and of cash-flow-statement 1: cf-q-010), and the authored questions of
  // company-financial-statements that had the general pair of hints have hints of their concept (full 6: fs-q-010;
  // full 7: fs-q-074; full 8: fs-q-047; its topic tests 1: fs-q-023, 030, 036, 056 and 2: fs-q-002, 006, 037, 041,
  // 047, 049). No Class 11 paper moved.
  //
  // It moved (from 6b15bdb06fe39b3d8707f4c2c4066217d67bf7766eb459ecf45aff4e31cf6ee5) with the quality pass of
  // cash-book, subsidiary-books, bank-reconciliation, trial-balance and rectification-of-errors, and only there: 24 of
  // the 86 papers (Class 11 full 1-6 and 8, half 1-3 and 5-8, and topic tests 1 and 2 of those five topics) hold a
  // template of those topics whose version was raised (to fix an error the audit found or to give it hints of its own),
  // so the same template and seed stand in the same place under the new version; and five authored questions they hold
  // were reworded (sb-q-002, 014, 017 and 031 given full explanations; tb-q-024, a duplicate, rewritten in place). No
  // question entered or left any paper: every slot keeps its template, seed or question id. The 23 new templates are
  // outside the papers (`outsidePapers`). Class 12 papers are unchanged.
  //
  // With every group of the quality pass together the hash was
  // 65c3d6c0f6a4fea6561d4c1498b12556171dceb5b72240ace9d4f22ec488c2ca. The value below adds the release's pronoun fixes
  // (no gendered pronoun in anything a student reads), which moved 8 Class 11 papers, each only in the slot of an item
  // they reworded, with the same template, seed or id there: the templates raised one version (faa-commission-after
  // in full 5; sb-which-document, pr-provision-or-reserve and faa-loss-classify in topic tests of their topics) and the
  // authored questions changed in place (cb-q-021 in full 1 and half 1; sb-q-009 in full 8; roe-q-021 in a topic test).
  // The other templates raised (tb-method, faa-entry-int-capital, faa-entry-int-drawings, faa-commission-before,
  // faa-effects-where, faa-bs-placement) stand in no paper of this pin. Class 12 papers are unchanged.
  const PAPERS_BEFORE = 'f51c50bae061c867fe0a6ebb5fe26b69bf330653473ca9f7d1630be9a2073565';

  it('are exactly what they were before Computerised Accounting was added', () => {
    const hash = createHash('sha256');
    let papers = 0;
    for (const course of COURSES) {
      const bank = bankOf(course.id);
      for (let number = 1; number <= 8; number++) {
        for (const kind of ['full', 'half'] as const) {
          try {
            hash.update(JSON.stringify(buildPaper({ kind, number }, bank)));
            papers++;
          } catch (e) {
            hash.update(`${course.id}:${kind}:${number}:${(e as Error).message}`);
          }
        }
      }
      for (const pack of packsOf(course.id)) {
        if (!bank.topics.some((t) => t.id === pack.topicId)) continue;
        for (let number = 1; number <= 2; number++) {
          hash.update(JSON.stringify(buildPaper({ kind: 'topic', topicId: pack.topicId, number }, bank)));
          papers++;
        }
      }
    }
    expect(papers).toBe(86);
    expect(hash.digest('hex')).toBe(PAPERS_BEFORE);
  }, 120_000);
});
