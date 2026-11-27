import { describe, expect, it } from 'vitest';
import { rupees } from '@/engine/money';
import { createRng } from '@/engine/rng';
import { mark, parseAmount } from '../tryit';
import { ISSUE_EXAMPLES, newIssue } from './examples';
import { issueProblem, issueShares, type IssueIn } from './issue';
import { describeIssue, sharesQuestions } from './questions';

const R = rupees;
const ex = (id: string) => ISSUE_EXAMPLES.find((e) => e.id === id)!.input;
const entryOf = (x: IssueIn, key: string, nth = 0) => issueShares(x).steps.filter((s) => s.key === key)[nth].entry.lines;

describe('an issue at a premium, forfeited and reissued', () => {
  const issue = issueShares(ex('premium'));
  const f = issue.figures;
  it('collects the instalments, with the unpaid ones in Calls in Arrears', () => {
    expect(f.applicationMoney).toBe(R(150000));
    expect(f.allotmentDue).toBe(R(250000));
    expect(f.allotmentReceived).toBe(R(247500));
    expect(entryOf(ex('premium'), 'allot-due')).toEqual([
      { account: 'Share Allotment A/c', side: 'Dr', amount: R(250000) },
      { account: 'Share Capital A/c', side: 'Cr', amount: R(150000) },
      { account: 'Securities Premium A/c', side: 'Cr', amount: R(100000) },
    ]);
    expect(entryOf(ex('premium'), 'allot-received')).toEqual([
      { account: 'Bank A/c', side: 'Dr', amount: R(247500) },
      { account: 'Calls in Arrears A/c', side: 'Dr', amount: R(2500) },
      { account: 'Share Allotment A/c', side: 'Cr', amount: R(250000) },
    ]);
    expect(entryOf(ex('premium'), 'call-received', 1)[0]).toEqual({ account: 'Bank A/c', side: 'Dr', amount: R(99000) });
  });
  it('forfeits at the amount called up, taking back the premium not received', () => {
    expect(entryOf(ex('premium'), 'forfeit')).toEqual([
      { account: 'Share Capital A/c', side: 'Dr', amount: R(5000) },
      { account: 'Securities Premium A/c', side: 'Dr', amount: R(1000) },
      { account: 'Forfeited Shares A/c', side: 'Cr', amount: R(1500) },
      { account: 'Calls in Arrears A/c', side: 'Cr', amount: R(4500) },
    ]);
    expect(issue.steps.find((s) => s.key === 'forfeit')!.entry.narration).toBe('500 shares forfeited for non-payment of allotment money, first call and second and final call');
  });
  it('reissues at a discount and moves the gain on the reissued shares only to Capital Reserve', () => {
    expect(entryOf(ex('premium'), 'reissue')).toEqual([
      { account: 'Bank A/c', side: 'Dr', amount: R(3200) },
      { account: 'Forfeited Shares A/c', side: 'Dr', amount: R(800) },
      { account: 'Share Capital A/c', side: 'Cr', amount: R(4000) },
    ]);
    expect(f.capitalReserve).toBe(R(400));
    expect(f.forfeitedLeft).toBe(R(300));
    expect(f.bank).toBe(R(598700));
  });
  it('tells money called and due from money in arrears, a share at a time', () => {
    const at = (key: string) => issue.steps.find((s) => s.key === key)!;
    const seg = (key: string, row: string, part: string) => at(key).rows.find((r) => r.key === row)!.segments.find((s) => s.key === part)!;
    expect(seg('allot-due', 'defaulter', 'allotment')).toMatchObject({ called: true, paid: 0, arrears: false });
    expect(seg('allot-received', 'defaulter', 'allotment')).toMatchObject({ called: true, paid: 0, arrears: true });
    expect(seg('allot-received', 'defaulter', 'premium')).toMatchObject({ arrears: true });
    expect(seg('allot-received', 'paying', 'allotment')).toMatchObject({ paid: R(3), arrears: false });
    expect(seg('forfeit', 'defaulter', 'application')).toMatchObject({ forfeited: true, paid: R(3) });
  });
  it('shows share capital in the note at the end', () => {
    const note = issue.steps[issue.steps.length - 1].note;
    expect(note.map((r) => r.text)).toContain('Subscribed and fully paid: 49,900 equity shares of ₹10 each');
    expect(note.find((r) => r.style === 'add')!.amount).toBe(R(300));
    expect(note.find((r) => r.style === 'total')!.amount).toBe(R(499300));
  });
  it('shows calls in arrears deducted from the shares not fully paid before forfeiture', () => {
    const beforeForfeit = issue.steps[issue.steps.findIndex((s) => s.key === 'forfeit') - 1].note;
    expect(beforeForfeit.map((r) => r.text)).toContain('Subscribed but not fully paid: 500 equity shares of ₹10 each, fully called up');
    expect(beforeForfeit.find((r) => r.style === 'less')!.amount).toBe(R(4500));
    expect(beforeForfeit.find((r) => r.style === 'total')!.amount).toBe(R(495500));
  });
});

describe('an over-subscribed issue allotted pro rata', () => {
  const x = ex('pro-rata');
  const f = issueShares(x).figures;
  it('refunds the rejected applications and sets the excess against allotment', () => {
    expect(entryOf(x, 'app-transfer')).toEqual([
      { account: 'Share Application A/c', side: 'Dr', amount: R(320000) },
      { account: 'Share Capital A/c', side: 'Cr', amount: R(200000) },
      { account: 'Share Allotment A/c', side: 'Cr', amount: R(100000) },
      { account: 'Bank A/c', side: 'Cr', amount: R(20000) },
    ]);
    expect(f.allotmentToReceive).toBe(R(200000));
  });
  it('takes the call in advance with the allotment money, and sets it against the call', () => {
    expect(entryOf(x, 'allot-received')).toEqual([
      { account: 'Bank A/c', side: 'Dr', amount: R(203800) },
      { account: 'Calls in Arrears A/c', side: 'Dr', amount: R(1200) },
      { account: 'Share Allotment A/c', side: 'Cr', amount: R(200000) },
      { account: 'Calls in Advance A/c', side: 'Cr', amount: R(5000) },
    ]);
    expect(entryOf(x, 'call-received')).toEqual([
      { account: 'Bank A/c', side: 'Dr', amount: R(492000) },
      { account: 'Calls in Advance A/c', side: 'Dr', amount: R(5000) },
      { account: 'Calls in Arrears A/c', side: 'Dr', amount: R(3000) },
      { account: 'Share First and Final Call A/c', side: 'Cr', amount: R(500000) },
    ]);
  });
  it('forfeits what the holder paid on all the shares applied for', () => {
    expect(f.defaulterApplied).toBe(900);
    expect(f.forfeited).toBe(R(1800));
    expect(f.capitalReserve).toBe(R(1200));
    expect(f.bank).toBe(R(1001200));
  });
  it('refunds excess application money beyond the allotment money', () => {
    const y: IssueIn = { ...x, offered: 10000, applied: 20000, rejected: 0, application: R(5), allotment: R(2), calls: [R(3)], defaulter: null, advance: null, reissue: null, authorised: 10000 };
    const issue = issueShares(y);
    expect(issue.figures.excessAdjusted).toBe(R(20000));
    expect(issue.figures.excessRefunded).toBe(R(30000));
    expect(issue.steps.some((s) => s.key === 'allot-received')).toBe(false);
    expect(issue.steps.find((s) => s.key === 'app-transfer')!.pots.bank).toBe(R(70000));
  });
  it('takes the excess against the capital part of the allotment first, leaving the premium unpaid', () => {
    const y: IssueIn = { ...x, offered: 1000, applied: 1500, rejected: 0, application: R(4), allotment: R(2), premium: R(2), calls: [R(4)], defaulter: { shares: 200, paid: 'application' }, advance: null, reissue: null, authorised: 1000 };
    expect(entryOf(y, 'forfeit')).toEqual([
      { account: 'Share Capital A/c', side: 'Dr', amount: R(2000) },
      { account: 'Securities Premium A/c', side: 'Dr', amount: R(400) },
      { account: 'Forfeited Shares A/c', side: 'Cr', amount: R(1200) },
      { account: 'Calls in Arrears A/c', side: 'Cr', amount: R(1200) },
    ]);
  });
});

describe('forfeiture before the final call', () => {
  const x = ex('early');
  const issue = issueShares(x);
  it('debits share capital with the amount called up so far, and calls the rest on the other shares only', () => {
    expect(entryOf(x, 'forfeit')).toEqual([
      { account: 'Share Capital A/c', side: 'Dr', amount: R(2400) },
      { account: 'Forfeited Shares A/c', side: 'Cr', amount: R(1800) },
      { account: 'Calls in Arrears A/c', side: 'Cr', amount: R(600) },
    ]);
    expect(entryOf(x, 'call-due', 1)).toEqual([
      { account: 'Share Second and Final Call A/c', side: 'Dr', amount: R(39400) },
      { account: 'Share Capital A/c', side: 'Cr', amount: R(39400) },
    ]);
    expect(issue.stages.map((s) => s.stage)).toEqual(['application', 'allotment', 'call1', 'forfeiture', 'call2', 'reissue']);
  });
  it('shows the remaining shares as partly called up in the note', () => {
    const note = issue.steps.find((s) => s.key === 'forfeit')!.note;
    expect(note.map((r) => r.text)).toContain('Subscribed but not fully paid: 19,700 equity shares of ₹10 each, ₹8 called up');
    expect(note.find((r) => r.style === 'total')!.amount).toBe(R(159400));
  });
  it('ends with the books in balance', () => {
    expect(issue.figures.capitalReserve).toBe(R(900));
    expect(issue.figures.bank).toBe(R(220900));
  });
});

describe('every issue', () => {
  it('balances, closes every instalment account, and keeps Bank = the credits less the arrears', () => {
    const issues = [...ISSUE_EXAMPLES.map((e) => e.input), ...Array.from({ length: 80 }, (_, i) => newIssue(createRng(i + 1)))];
    for (const x of issues) {
      expect(issueProblem(x)).toBeNull();
      const issue = issueShares(x);
      const last = issue.steps[issue.steps.length - 1].pots;
      expect(last.application).toBe(0);
      expect(last.due).toBe(0);
      expect(last.arrears).toBe(0);
      expect(last.bank).toBe(last.capital + last.premium + last.forfeited + last.reserve + last.advance - last.arrears);
      const r = x.reissue?.shares ?? 0;
      const d = x.defaulter?.shares ?? 0;
      expect(last.capital).toBe((x.offered - d + r) * x.face);
    }
  });
  it('refuses figures that do not work', () => {
    const x = ex('premium');
    expect(issueProblem({ ...x, calls: [R(2), R(1)] })).toMatch(/add up/);
    expect(issueProblem({ ...x, defaulter: { shares: 500, paid: 'call2' } })).toMatch(/final call/);
    expect(() => issueShares({ ...x, reissue: { shares: 400, price: R(6) } })).toThrow(/discount/);
  });
});

describe('the Try it questions', () => {
  it('reads amounts and marks answers', () => {
    expect(parseAmount('₹1,23,456.50')).toBe(12345650);
    expect(parseAmount('12,000')).toBe(R(12000));
    expect(parseAmount('twelve')).toBeNull();
    const qs = sharesQuestions(5);
    const q = qs[0];
    expect(q.answer.type).toBe('amount');
    if (q.answer.type !== 'amount') return;
    expect(mark(q, { text: String(q.answer.value / 100) }).right).toBe(true);
    expect(mark(q, { text: String(q.answer.value / 100 + 1) }).right).toBe(false);
  });
  it('states the terms as they happened: the first call only when forfeited before the final call, and a refund of excess', () => {
    expect(describeIssue(ex('early'))[2]).toContain('paid the allotment money but not the first call.');
    const refund = describeIssue({ ...ex('pro-rata'), application: R(4), allotment: R(1), applied: 210000, rejected: 10000, defaulter: null, advance: null, reissue: null });
    expect(refund[1]).toContain('and the rest of it refunded');
  });
  it('never has a holder "not pay" an allotment the excess application money already met', () => {
    for (let seed = 1; seed <= 300; seed++) {
      const x = newIssue(createRng(seed));
      if (x.defaulter?.paid !== 'application') continue;
      const pool = x.applied - x.rejected;
      expect((pool - x.offered) * x.application, `seed ${seed}`).toBeLessThan(x.offered * (x.allotment + x.premium));
    }
  });
  it('asks at least three kinds, each with a reason', () => {
    for (let seed = 1; seed <= 30; seed++) {
      const qs = sharesQuestions(seed);
      expect(new Set(qs.map((q) => q.kind)).size).toBeGreaterThanOrEqual(3);
      for (const q of qs) {
        expect(q.why.length).toBeGreaterThan(0);
        if (q.answer.type === 'amount') expect(q.answer.value).toBeGreaterThan(0);
      }
    }
  });
});
