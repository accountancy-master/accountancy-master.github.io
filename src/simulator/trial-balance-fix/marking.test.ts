import { describe, expect, it } from 'vitest';
import { judge } from '@/components/simulator/labs/kit/answers';
import { ASHA, caseFromSeed, FARHAN, KIRAN, MEERA, READY_CASES } from './cases';
import { checksOf, foundByTicking, judgeEntry, narrationChoices, rightOf, slipsOf } from './marking';
import { buildCase, errorsWhen, findError, rupees as R } from './model';
import { askRng, tfAsk, TF_ASK_KINDS } from './tryit';
import { walkOf } from './walk';

describe('the rectifying entry, marked', () => {
  const c = buildCase(ASHA);
  const b = findError(c, 'b'); // Mohan's posting left out: Mohan A/c Dr; To Suspense A/c ₹8,000
  const a = findError(c, 'a'); // furniture debited to Purchases: Furniture A/c Dr; To Purchases A/c ₹12,000
  it('takes the right entry with its narration', () => {
    expect(judgeEntry(c, b, { dr: 'debtor:Mohan', cr: 'suspense', amount: R(8000), narration: b.narration })).toEqual({ right: true, why: null });
  });
  it('names each slip', () => {
    expect(judgeEntry(c, b, { dr: 'suspense', cr: 'debtor:Mohan', amount: R(8000), narration: b.narration }).why).toMatch(/wrong way round/);
    expect(judgeEntry(c, b, { dr: 'debtor:Mohan', cr: 'sales', amount: R(8000), narration: b.narration }).why).toMatch(/other side of the entry is Suspense A\/c\. Sales A\/c was right already/);
    expect(judgeEntry(c, a, { dr: 'furniture', cr: 'suspense', amount: R(12000), narration: a.narration }).why).toMatch(/none of the difference in Suspense A\/c is due to it/);
    expect(judgeEntry(c, a, { dr: 'furniture', cr: 'cash', amount: R(12000), narration: a.narration }).why).toMatch(/Cash A\/c was recorded correctly/);
    expect(judgeEntry(c, b, { dr: 'debtor:Mohan', cr: 'suspense', amount: R(8000), narration: a.narration }).why).toMatch(/narration/);
    const rent = findError(c, 'c');
    expect(judgeEntry(c, rent, { dr: 'rent', cr: 'suspense', amount: R(4000), narration: rent.narration }).why).toMatch(/Only the difference/);
    const kiran = buildCase(KIRAN);
    const side = findError(kiran, 'a');
    expect(judgeEntry(kiran, side, { dr: 'suspense', cr: 'debtor:Priya', amount: R(10000), narration: side.narration }).why).toMatch(/twice its amount/);
  });
  it('offers three wrong entries for every error of every case, each marked wrong, and the right narration among the choices', () => {
    for (const data of [...READY_CASES, ...Array.from({ length: 40 }, (_, i) => caseFromSeed(i + 1))]) {
      const c = buildCase(data);
      for (const e of errorsWhen(c, 'after')) {
        const r = rightOf(e);
        expect(judgeEntry(c, e, { ...r, narration: e.narration }).right, `${data.id} ${e.tag}`).toBe(true);
        const slips = slipsOf(c, e);
        expect(slips.length, `${data.id} ${e.tag}`).toBe(3);
        for (const s of slips) {
          expect(s.why, `${data.id} ${e.tag}`).not.toBe('');
          expect(judgeEntry(c, e, { dr: s.lines[0].accountId, cr: s.lines[1].accountId, amount: s.lines[0].amount, narration: e.narration }).right).toBe(false);
        }
        expect(narrationChoices(c, e)).toContain(e.narration);
      }
    }
  });
});

describe("the detective's checks", () => {
  it('uncover exactly the posting, casting and balancing errors of Farhan Book House', () => {
    const c = buildCase(FARHAN);
    const checks = checksOf(c);
    // 10 transactions, one left out of the books: 18 postings; and 12 accounts with a balance as recorded.
    expect(checks.filter((k) => k.kind === 'posting')).toHaveLength(18);
    expect([...foundByTicking(checks)].sort()).toEqual(['a', 'b', 'c', 'd', 'e']);
    expect(checks.find((k) => k.letter === 'a')!.shows).toBe('Nothing in Sales A/c for Apr 4, and the L.F. is blank.');
    expect(checks.find((k) => k.letter === 'd')!.shows).toBe('Not in Ravi A/c: posted to Imran A/c instead.');
  });
  it('do not find an error of principle or a complete omission, and skip a posting corrected before the trial balance', () => {
    const asha = buildCase(ASHA);
    expect([...foundByTicking(checksOf(asha))].sort()).toEqual(['b', 'c']);
    const kiran = buildCase(KIRAN);
    expect([...foundByTicking(checksOf(kiran))].sort()).toEqual(['a', 'b', 'e']);
    const meera = buildCase(MEERA);
    expect([...foundByTicking(checksOf(meera))].sort()).toEqual(['a', 'c', 'd']);
  });
});

describe('the walk through a case', () => {
  it('ends with Suspense closed, the corrected trial balance and the profit, for every ready case', () => {
    for (const data of READY_CASES) {
      const c = buildCase(data);
      const w = walkOf(c);
      const last = w[w.length - 1].state;
      expect(last.rectified.size).toBe(errorsWhen(c, 'after').length);
      expect([last.corrected, last.profit, last.suspense, last.tb]).toEqual([true, true, true, 'checked']);
      expect(w.map((s) => s.id)).toContain('suspense-close');
      for (const s of w) expect(s.text.length).toBeGreaterThan(40);
    }
    const asha = walkOf(buildCase(ASHA));
    expect(asha.find((s) => s.id === 'tb')!.text).toContain('₹1,46,400');
    expect(asha.find((s) => s.id === 'suspense-close')!.text).toContain('(a) never touched it');
    expect(asha[asha.length - 1].text).toContain('a profit of ₹15,500');
  });
});

describe('the quick questions', () => {
  it('make every kind for many seeds, each with a right answer that the marking takes', () => {
    for (const kind of TF_ASK_KINDS) {
      for (let n = 0; n < 25; n++) {
        const q = tfAsk(kind, askRng(3, kind, n));
        expect(q.prompt.length, kind).toBeGreaterThan(20);
        const a = q.answer;
        if (a.type === 'choice') {
          expect(new Set(a.options.map((o) => o.id)).size).toBe(a.options.length);
          expect(judge(a, { choice: a.correct }).right).toBe(true);
          for (const o of a.options) if (o.id !== a.correct) expect(o.why, `${kind} ${o.text}`).toBeTruthy();
        } else {
          expect(judge(a, { typed: String(a.value / 100), tag: a.tag?.correct }).right, kind).toBe(true);
          for (const m of a.mistakes) expect(m.value).not.toBe(a.value);
        }
      }
    }
  });
  it('the same seed asks the same question', () => {
    expect(tfAsk('entry', askRng(9, 'entry', 2)).prompt).toBe(tfAsk('entry', askRng(9, 'entry', 2)).prompt);
  });
});
