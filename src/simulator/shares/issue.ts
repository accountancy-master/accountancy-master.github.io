import { formatINR, type Paise } from '@/engine/money';

// ---------------------------------------------------------------------------------------------------------------
// An issue of equity shares, from the applications to the reissue of forfeited shares, worked as NCERT Class 12
// works it (CBSE 2025-26):
//
// - Money is payable on application, on allotment (with the whole premium, if any) and on one or two calls.
//   The premium is credited to Securities Premium A/c when the allotment money falls due.
// - Over-subscription: some applications may be rejected (their money refunded); the rest are allotted pro rata.
//   The excess application money of a pro-rata applicant is set against the allotment money due from that
//   applicant; anything beyond the allotment money is refunded.
// - Money not received on allotment or a call is debited to Calls in Arrears A/c in the entry that records the
//   receipt. Money received before it is called is credited to Calls in Advance A/c and set against the call when
//   it is made. No interest on either (outside the 2025-26 syllabus).
// - Forfeiture: Share Capital A/c is debited with the amount called up on the forfeited shares; Securities Premium
//   A/c with the premium on them if it was not received; Calls in Arrears A/c is credited with what was unpaid and
//   Forfeited Shares A/c with what was received towards capital. A premium counts as received only as far as the
//   allotment money was paid beyond its capital part: the excess application money set against the allotment meets
//   the capital part first.
// - Reissue (always as fully paid here): Bank A/c with the price, Forfeited Shares A/c with any discount (never more
//   than was forfeited on those shares), Share Capital A/c with the face value, Securities Premium A/c with any price
//   above it. What was forfeited on the reissued shares, less the discount, is a capital profit: it goes to Capital
//   Reserve A/c. What was forfeited on shares not yet reissued stays in Forfeited Shares A/c.
// ---------------------------------------------------------------------------------------------------------------

export type Instalment = 'application' | 'allotment' | 'call1' | 'call2';

export interface IssueIn {
  company: string;
  /** Authorised capital, in shares. */
  authorised: number;
  /** Shares offered to the public (the issued capital). */
  offered: number;
  /** Face value of a share. */
  face: Paise;
  /** Premium on a share, payable with the allotment money. */
  premium: Paise;
  /** Capital payable a share on application, on allotment (without the premium), and on each call. */
  application: Paise;
  allotment: Paise;
  /** One call (first and final) or two (first, then second and final). */
  calls: Paise[];
  /** Shares applied for. */
  applied: number;
  /** Shares applied for whose applications are rejected and their money refunded. */
  rejected: number;
  /** A shareholder who stops paying: holds `shares` allotted shares and pays up to `paid`, nothing after. */
  defaulter: { shares: number; paid: Instalment } | null;
  /** Forfeit the defaulter's shares after the first call, before the final call is made (two calls only). */
  forfeitEarly: boolean;
  /** A shareholder who pays the final call with the instalment before it. */
  advance: { shares: number } | null;
  /** Some (or all) of the forfeited shares reissued as fully paid, at a price a share. */
  reissue: { shares: number; price: Paise } | null;
}

export type Pot = 'holders' | 'bank' | 'application' | 'due' | 'capital' | 'premium' | 'arrears' | 'advance' | 'forfeited' | 'reserve';

export interface Flow {
  from: Pot;
  to: Pot;
  amount: Paise;
  label: string;
}

export interface EntryLine {
  account: string;
  side: 'Dr' | 'Cr';
  amount: Paise;
}

export interface Entry {
  lines: EntryLine[];
  narration: string;
}

/** The state of one instalment of one share: how much of it is called, paid, paid ahead, or gone with forfeiture. */
export interface Segment {
  key: Instalment | 'premium';
  label: string;
  amount: Paise;
  called: boolean;
  /** Paid so far (a share); can be part of the amount (pro-rata excess set against allotment). */
  paid: Paise;
  /** Paid before it was called. */
  ahead: boolean;
  /** Called, its money asked for and not paid: in Calls in Arrears A/c. */
  arrears: boolean;
  forfeited: boolean;
}

export interface ShareRow {
  key: 'paying' | 'advance' | 'defaulter' | 'reissued';
  label: string;
  shares: number;
  segments: Segment[];
}

export interface NoteRow {
  text: string;
  amount: Paise | null;
  /** 'less' is shown in brackets, a 'total' row ruled. */
  style?: 'heading' | 'less' | 'add' | 'total';
}

export type Stage = 'application' | 'allotment' | 'call1' | 'call2' | 'forfeiture' | 'reissue';

export interface IssueStep {
  key: 'app-received' | 'app-transfer' | 'allot-due' | 'allot-received' | 'call-due' | 'call-received' | 'forfeit' | 'reissue' | 'reserve';
  stage: Stage;
  title: string;
  text: string;
  entry: Entry;
  flows: Flow[];
  /** Balances after this step: positive as the pot is shown (Bank and Calls in Arrears debit, the rest credit). */
  pots: Record<Exclude<Pot, 'holders'>, Paise>;
  /** The account of the instalment now due, as the "due" pot is named. */
  dueAccount: string;
  rows: ShareRow[];
  note: NoteRow[];
}

export interface Issue {
  input: IssueIn;
  steps: IssueStep[];
  stages: { stage: Stage; label: string }[];
  /** Key figures for the "Try it" questions and the tests. */
  figures: {
    applicationMoney: Paise;
    refundRejected: Paise;
    excess: Paise;
    excessAdjusted: Paise;
    excessRefunded: Paise;
    allotmentDue: Paise;
    /** Allotment money still to be received after the excess is set against it. */
    allotmentToReceive: Paise;
    allotmentReceived: Paise;
    defaulterApplied: number;
    calledUpOnForfeited: Paise;
    premiumUnpaidOnForfeited: Paise;
    unpaidOnForfeited: Paise;
    forfeited: Paise;
    discountOnReissue: Paise;
    capitalReserve: Paise;
    forfeitedLeft: Paise;
    bank: Paise;
  };
}

const inr = formatINR;
const sumOf = (xs: readonly Paise[]): Paise => xs.reduce((s, x) => s + x, 0);
const qty = (n: number) => new Intl.NumberFormat('en-IN').format(n);

export const callLabel = (calls: number, i: number): string => (calls === 1 ? 'First and Final Call' : i === 0 ? 'First Call' : 'Second and Final Call');
export const callAccount = (calls: number, i: number): string => `Share ${callLabel(calls, i)} A/c`;

const INSTALMENT_ORDER: Instalment[] = ['application', 'allotment', 'call1', 'call2'];
const before = (a: Instalment, b: Instalment) => INSTALMENT_ORDER.indexOf(a) < INSTALMENT_ORDER.indexOf(b);

/** What is wrong with the figures of an issue, or null when they can be worked. */
export function issueProblem(x: IssueIn): string | null {
  const whole = (n: number) => Number.isInteger(n) && n >= 0;
  if (![x.offered, x.applied, x.rejected, x.authorised].every(whole) || x.offered <= 0) return 'The numbers of shares must be whole numbers.';
  if (x.calls.length < 1 || x.calls.length > 2) return 'Take one call or two.';
  if (x.application <= 0 || x.allotment <= 0 || x.calls.some((c) => c <= 0)) return 'Every instalment must be more than nothing.';
  if (x.application + x.allotment + sumOf(x.calls) !== x.face) return `The instalments must add up to the face value of ${inr(x.face)}.`;
  if (x.premium < 0) return 'The premium cannot be below nothing.';
  if (x.authorised < x.offered) return 'The company cannot issue more shares than it is authorised to.';
  if (x.applied < x.offered) return 'Take an issue that is fully subscribed: at least as many shares applied for as offered.';
  if (x.applied - x.rejected < x.offered) return 'After the rejections, enough applications must be left to allot every share.';
  const pool = x.applied - x.rejected;
  if (x.defaulter) {
    const d = x.defaulter;
    if (!whole(d.shares) || d.shares <= 0 || d.shares > x.offered) return 'The shareholder who stops paying must hold some of the allotted shares.';
    const last: Instalment = x.calls.length === 1 ? 'call1' : 'call2';
    if (!before(d.paid, last)) return 'The shareholder who stops paying must miss at least the final call.';
    if ((d.shares * pool) % x.offered !== 0) return `With ${qty(pool)} shares allotted ${qty(x.offered)}, the shares of the one who stops paying must have come from a whole number of shares applied for.`;
    if (x.forfeitEarly && (x.calls.length !== 2 || d.paid === 'call1')) return 'Shares can be forfeited before the final call only when two calls are made and something was missed before it.';
  } else if (x.reissue || x.forfeitEarly) return 'Only shares that were forfeited can be reissued.';
  if (x.advance) {
    if (!whole(x.advance.shares) || x.advance.shares <= 0 || x.advance.shares + (x.defaulter?.shares ?? 0) > x.offered) return 'The shareholder who pays in advance must hold some of the other allotted shares.';
  }
  if (x.reissue) {
    const r = x.reissue;
    if (!whole(r.shares) || r.shares <= 0 || r.shares > x.defaulter!.shares) return 'Reissue some of the forfeited shares, no more than were forfeited.';
    if (r.price <= 0) return 'The reissue price must be more than nothing.';
  }
  return null;
}

export function issueShares(x: IssueIn): Issue {
  const problem = issueProblem(x);
  if (problem) throw new Error(problem);
  const N = x.offered;
  const F = x.face;
  const P = x.premium;
  const a = x.application;
  const b = x.allotment;
  const nCalls = x.calls.length;
  const pool = x.applied - x.rejected;
  const d = x.defaulter?.shares ?? 0;
  const k = x.advance?.shares ?? 0;
  const lastCall = x.calls[nCalls - 1];
  const finalKey: Instalment = nCalls === 1 ? 'call1' : 'call2';
  const pays = (i: Instalment) => !x.defaulter || !before(x.defaulter.paid, i);
  const early = x.forfeitEarly;

  // ---- Figures ----
  const applicationMoney = x.applied * a;
  const refundRejected = x.rejected * a;
  const excess = (pool - N) * a;
  const allotmentDue = N * (b + P);
  const excessAdjusted = Math.min(excess, allotmentDue);
  const excessRefunded = excess - excessAdjusted;
  const defaulterApplied = (d * pool) / N;
  const defExcess = (defaulterApplied - d) * a;
  const defAdjusted = Math.min(defExcess, d * (b + P));
  const defUnpaidAllotment = x.defaulter && !pays('allotment') ? d * (b + P) - defAdjusted : 0;
  const allotmentToReceive = allotmentDue - excessAdjusted;

  // ---- The ledger ----
  const bal = new Map<string, Paise>(); // debit positive
  const post = (e: Entry) => {
    const dr = sumOf(e.lines.filter((l) => l.side === 'Dr').map((l) => l.amount));
    const cr = sumOf(e.lines.filter((l) => l.side === 'Cr').map((l) => l.amount));
    if (dr !== cr) throw new Error(`An entry that does not balance: ${e.narration}`);
    for (const l of e.lines) bal.set(l.account, (bal.get(l.account) ?? 0) + (l.side === 'Dr' ? l.amount : -l.amount));
  };
  const B = (acct: string) => bal.get(acct) ?? 0;
  const BANK = 'Bank A/c';
  const APP = 'Share Application A/c';
  const ALLOT = 'Share Allotment A/c';
  const CAP = 'Share Capital A/c';
  const SP = 'Securities Premium A/c';
  const CIA = 'Calls in Arrears A/c';
  const CIADV = 'Calls in Advance A/c';
  const FS = 'Forfeited Shares A/c';
  const CR = 'Capital Reserve A/c';
  const line = (account: string, side: 'Dr' | 'Cr', amount: Paise): EntryLine[] => (amount > 0 ? [{ account, side, amount }] : []);

  // ---- The shares, a share at a time ----
  const seg = (key: Segment['key'], label: string, amount: Paise): Segment => ({ key, label, amount, called: false, paid: 0, ahead: false, arrears: false, forfeited: false });
  const makeSegments = () => [
    seg('application', 'Application', a),
    seg('allotment', 'Allotment', b),
    ...x.calls.map((c, i) => seg(i === 0 ? 'call1' : 'call2', callLabel(nCalls, i), c)),
    ...(P > 0 ? [seg('premium', 'Premium', P)] : []),
  ];
  const rows: ShareRow[] = [];
  const paying: ShareRow = { key: 'paying', label: 'A share of a holder who pays every instalment', shares: N - d - k, segments: makeSegments() };
  rows.push(paying);
  const adv: ShareRow | null = k > 0 ? { key: 'advance', label: 'A share of the holder who pays the final call in advance', shares: k, segments: makeSegments() } : null;
  if (adv) rows.push(adv);
  const def: ShareRow | null = d > 0 ? { key: 'defaulter', label: 'A share of the holder who stops paying', shares: d, segments: makeSegments() } : null;
  if (def) rows.push(def);
  let reissued: ShareRow | null = null;
  const segOf = (r: ShareRow, key: Segment['key']) => r.segments.find((s) => s.key === key);
  const allRows = () => [paying, adv, def].filter((r): r is ShareRow => r !== null);

  // ---- Groups of shares for the note ----
  let defForfeited = false;
  let calledUpRegular: Paise = 0;
  let calledUpDef: Paise = 0;
  const note = (): NoteRow[] => {
    const out: NoteRow[] = [
      { text: 'Share Capital', amount: null, style: 'heading' },
      { text: `Authorised capital: ${qty(x.authorised)} equity shares of ${inr(F)} each`, amount: x.authorised * F },
      { text: `Issued capital: ${qty(N)} equity shares of ${inr(F)} each`, amount: N * F },
    ];
    const capital = cr(CAP);
    if (capital === 0) {
      out.push({ text: 'Subscribed capital: none yet (no shares allotted)', amount: 0 });
      return out;
    }
    out.push({ text: 'Subscribed capital:', amount: null, style: 'heading' });
    const groups: { shares: number; calledUp: Paise; arrears: Paise }[] = [];
    const arrears = B(CIA);
    const regular = N - d;
    const addGroup = (shares: number, calledUp: Paise, ar: Paise) => {
      if (shares <= 0) return;
      const same = groups.find((g) => g.calledUp === calledUp && g.arrears === 0 && ar === 0);
      if (same) same.shares += shares;
      else groups.push({ shares, calledUp, arrears: ar });
    };
    addGroup(regular, calledUpRegular, 0);
    if (d > 0 && !defForfeited) addGroup(d, calledUpDef, arrears);
    if (reissued) addGroup(reissued.shares, F, 0);
    let total = 0;
    for (const g of groups) {
      const full = g.calledUp === F && g.arrears === 0;
      const calledText = g.calledUp === F ? 'fully called up' : `${inr(g.calledUp)} called up`;
      out.push({ text: `Subscribed ${full ? 'and fully paid' : 'but not fully paid'}: ${qty(g.shares)} equity shares of ${inr(F)} each${full ? '' : `, ${calledText}`}`, amount: g.shares * g.calledUp });
      total += g.shares * g.calledUp;
      if (g.arrears > 0) {
        out.push({ text: 'Less: Calls in arrears', amount: g.arrears, style: 'less' });
        total -= g.arrears;
      }
    }
    const fs = cr(FS);
    if (fs > 0) {
      out.push({ text: 'Add: Forfeited Shares A/c', amount: fs, style: 'add' });
      total += fs;
    }
    out.push({ text: 'Total share capital', amount: total, style: 'total' });
    return out;
  };

  const steps: IssueStep[] = [];
  let dueAccount = ALLOT;
  const cr = (acct: string) => 0 - B(acct) || 0;
  const snapshot = () => ({
    bank: B(BANK),
    application: cr(APP),
    due: B(dueAccount),
    capital: cr(CAP),
    premium: cr(SP),
    arrears: B(CIA),
    advance: cr(CIADV),
    forfeited: cr(FS),
    reserve: cr(CR),
  });
  const cloneRows = (): ShareRow[] => [...rows, ...(reissued && !rows.includes(reissued) ? [reissued] : [])].map((r) => ({ ...r, segments: r.segments.map((s) => ({ ...s })) }));
  const step = (key: IssueStep['key'], stage: Stage, title: string, text: string, entry: Entry, flows: Flow[]) => {
    if (entry.lines.length === 0) return;
    post(entry);
    steps.push({ key, stage, title, text, entry, flows: flows.filter((f) => f.amount > 0), pots: snapshot(), dueAccount, rows: cloneRows(), note: note() });
  };

  // 1. Application money received.
  allRows().forEach((r) => {
    const s = segOf(r, 'application')!;
    s.called = true;
    s.paid = a;
  });
  step(
    'app-received',
    'application',
    'Applications come in',
    `Applications for ${qty(x.applied)} shares arrive with ${inr(a)} a share: ${inr(applicationMoney)} goes into the bank. It is held in Share Application A/c, because no share has been allotted yet.`,
    { lines: [...line(BANK, 'Dr', applicationMoney), ...line(APP, 'Cr', applicationMoney)], narration: `application money received on ${qty(x.applied)} shares at ${inr(a)} a share` },
    [{ from: 'holders', to: 'bank', amount: applicationMoney, label: `Application money ${inr(applicationMoney)} into the bank` }],
  );

  // 2. Application money transferred on allotment: to capital, against allotment, and refunded.
  dueAccount = ALLOT;
  const refund = refundRejected + excessRefunded;
  const rejectedText = x.rejected > 0 ? `Applications for ${qty(x.rejected)} shares are rejected and their ${inr(refundRejected)} refunded. ` : '';
  const excessText =
    excess === 0
      ? `${rejectedText}There is no excess application money.`
      : `${rejectedText}${qty(pool)} shares applied for get ${qty(N)} pro rata (${qty(pool)} : ${qty(N)}), so their excess application money of ${inr(excess)} is set against the allotment money${excessRefunded > 0 ? `, as far as it goes; ${inr(excessRefunded)} more than the allotment money is refunded` : ''}.`;
  const appTransferText =
    excess === 0 && x.rejected === 0
      ? `All ${qty(N)} shares are allotted. Their application money of ${inr(N * a)} becomes share capital: Share Capital A/c is credited with ${inr(a)} a share.`
      : `${qty(N)} shares are allotted, so ${inr(N * a)} of the application money becomes share capital. ${excessText}`;
  if (def) {
    // The defaulter's excess application money already counts towards the allotment.
    const s = segOf(def, 'allotment')!;
    s.paid = Math.min(b, defAdjusted / d);
    const pr = segOf(def, 'premium');
    if (pr) pr.paid = Math.max(0, defAdjusted / d - b);
  }
  for (const r of [paying, adv].filter((r): r is ShareRow => r !== null)) {
    const per = excessAdjusted / N;
    segOf(r, 'allotment')!.paid = Math.min(b, per);
    const pr = segOf(r, 'premium');
    if (pr) pr.paid = Math.max(0, per - b);
  }
  calledUpRegular = a;
  calledUpDef = a;
  step(
    'app-transfer',
    'allotment',
    'Shares allotted',
    appTransferText,
    {
      lines: [...line(APP, 'Dr', applicationMoney), ...line(CAP, 'Cr', N * a), ...line(ALLOT, 'Cr', excessAdjusted), ...line(BANK, 'Cr', refund)],
      narration: `application money on ${qty(N)} shares transferred to share capital${excessAdjusted > 0 ? ', the excess set against allotment' : ''}${refund > 0 ? ' and the rest refunded' : ''}`,
    },
    [
      { from: 'application', to: 'capital', amount: N * a, label: `${inr(N * a)} to share capital` },
      { from: 'application', to: 'due', amount: excessAdjusted, label: `${inr(excessAdjusted)} set against allotment` },
      { from: 'bank', to: 'holders', amount: refund, label: `${inr(refund)} refunded` },
    ],
  );

  // 3. Allotment money due.
  allRows().forEach((r) => {
    segOf(r, 'allotment')!.called = true;
    const pr = segOf(r, 'premium');
    if (pr) pr.called = true;
  });
  calledUpRegular += b;
  calledUpDef += b;
  step(
    'allot-due',
    'allotment',
    'Allotment money due',
    `Allotment money of ${inr(b)} a share${P > 0 ? ` and the premium of ${inr(P)}` : ''} ${P > 0 ? 'fall' : 'falls'} due on ${qty(N)} shares: ${inr(allotmentDue)}. Share capital fills by ${inr(N * b)}${P > 0 ? `; the premium of ${inr(N * P)} is not share capital, it goes to Securities Premium A/c` : ''}.`,
    { lines: [...line(ALLOT, 'Dr', allotmentDue), ...line(CAP, 'Cr', N * b), ...line(SP, 'Cr', N * P)], narration: `allotment money due on ${qty(N)} shares at ${inr(b + P)} a share${P > 0 ? `, including a premium of ${inr(P)}` : ''}` },
    [
      { from: 'due', to: 'capital', amount: N * b, label: `${inr(N * b)} called up to share capital` },
      { from: 'due', to: 'premium', amount: N * P, label: `Premium ${inr(N * P)}` },
    ],
  );

  // 4. Allotment money received (and the final call in advance, when there is only one call).
  const advanceWith = (i: Instalment) => k > 0 && ((nCalls === 1 && i === 'allotment') || (nCalls === 2 && i === 'call1'));
  const advanceAmount = k * lastCall;
  const allotmentReceived = allotmentToReceive - defUnpaidAllotment;
  if (def && !pays('allotment')) {
    segOf(def, 'allotment')!.arrears = true;
    const pr = segOf(def, 'premium');
    if (pr) pr.arrears = pr.paid < pr.amount;
  }
  allRows().forEach((r) => {
    if (r === def && !pays('allotment')) return;
    segOf(r, 'allotment')!.paid = b;
    const pr = segOf(r, 'premium');
    if (pr) pr.paid = P;
  });
  if (advanceWith('allotment') && adv) {
    const s = segOf(adv, finalKey)!;
    s.paid = lastCall;
    s.ahead = true;
  }
  step(
    'allot-received',
    'allotment',
    'Allotment money received',
    `${inr(allotmentReceived)} is received on allotment (${inr(allotmentDue)} due${excessAdjusted > 0 ? `, less ${inr(excessAdjusted)} already paid as excess application money` : ''}${defUnpaidAllotment > 0 ? `, less ${inr(defUnpaidAllotment)} not paid by the holder of ${qty(d)} shares, which goes to Calls in Arrears A/c` : ''}).${advanceWith('allotment') ? ` The holder of ${qty(k)} shares also pays the call of ${inr(lastCall)} a share now: ${inr(advanceAmount)} to Calls in Advance A/c.` : ''}`,
    {
      lines: [
        ...line(BANK, 'Dr', allotmentReceived + (advanceWith('allotment') ? advanceAmount : 0)),
        ...line(CIA, 'Dr', defUnpaidAllotment),
        ...line(ALLOT, 'Cr', allotmentToReceive),
        ...line(CIADV, 'Cr', advanceWith('allotment') ? advanceAmount : 0),
      ],
      narration: `allotment money received${defUnpaidAllotment > 0 ? `, except on ${qty(d)} shares` : ''}${advanceWith('allotment') ? `, with the call in advance on ${qty(k)} shares` : ''}`,
    },
    [
      { from: 'holders', to: 'bank', amount: allotmentReceived + (advanceWith('allotment') ? advanceAmount : 0), label: `${inr(allotmentReceived + (advanceWith('allotment') ? advanceAmount : 0))} into the bank` },
      { from: 'due', to: 'arrears', amount: defUnpaidAllotment, label: `${inr(defUnpaidAllotment)} unpaid, to Calls in Arrears` },
      { from: 'holders', to: 'advance', amount: advanceWith('allotment') ? advanceAmount : 0, label: `${inr(advanceAmount)} paid in advance` },
    ],
  );

  // Forfeiture, reissue and capital reserve, as a function: they come after the last call, or between the calls.
  let forfeitedAmount = 0;
  let calledUpOnForfeited = 0;
  let premiumUnpaid = 0;
  let unpaidOnForfeited = 0;
  const forfeit = () => {
    if (!def) return;
    calledUpOnForfeited = d * calledUpDef;
    unpaidOnForfeited = B(CIA);
    // The premium was received only as far as the allotment money paid went beyond its capital part.
    premiumUnpaid = !pays('allotment') ? Math.min(d * P, defUnpaidAllotment) : 0;
    forfeitedAmount = calledUpOnForfeited + premiumUnpaid - unpaidOnForfeited;
    const missed = def.segments.filter((s) => s.key !== 'premium' && s.called && s.paid < s.amount).map((s) => (s.key === 'allotment' ? 'allotment money' : s.label.toLowerCase()));
    def.segments.forEach((s) => {
      s.forfeited = s.called;
      s.arrears = false;
    });
    defForfeited = true;
    step(
      'forfeit',
      'forfeiture',
      'The shares are forfeited',
      `The ${qty(d)} shares are forfeited. Share Capital A/c is debited with the ${inr(calledUpDef)} a share called up on them (${inr(calledUpOnForfeited)}), not the face value${premiumUnpaid > 0 ? `, and Securities Premium A/c with the ${inr(premiumUnpaid)} of premium never received` : ''}. The ${inr(unpaidOnForfeited)} unpaid leaves Calls in Arrears A/c, and the ${inr(forfeitedAmount)} the holder paid towards capital stays with the company in Forfeited Shares A/c.`,
      {
        lines: [...line(CAP, 'Dr', calledUpOnForfeited), ...line(SP, 'Dr', premiumUnpaid), ...line(FS, 'Cr', forfeitedAmount), ...line(CIA, 'Cr', unpaidOnForfeited)],
        narration: `${qty(d)} shares forfeited for non-payment of ${missed.length > 1 ? `${missed.slice(0, -1).join(', ')} and ${missed[missed.length - 1]}` : missed[0]}`,
      },
      [
        { from: 'capital', to: 'forfeited', amount: forfeitedAmount, label: `${inr(forfeitedAmount)} forfeited` },
        { from: 'capital', to: 'arrears', amount: unpaidOnForfeited - premiumUnpaid, label: `${inr(unpaidOnForfeited - premiumUnpaid)} unpaid capital cancelled` },
        { from: 'premium', to: 'arrears', amount: premiumUnpaid, label: `${inr(premiumUnpaid)} premium cancelled` },
      ],
    );
  };

  let discount = 0;
  let capitalReserve = 0;
  const reissue = () => {
    if (!x.reissue || !def) return;
    const r = x.reissue.shares;
    const price = x.reissue.price;
    discount = Math.max(0, F - price) * r;
    const premiumOnReissue = Math.max(0, price - F) * r;
    const forfeitedOnThese = (forfeitedAmount * r) / d;
    if (!Number.isInteger(forfeitedOnThese)) throw new Error('The amount forfeited on the reissued shares is not a whole number of paise.');
    if (discount > forfeitedOnThese) throw new Error(`The discount on reissue (${inr(discount)}) cannot be more than was forfeited on those shares (${inr(forfeitedOnThese)}).`);
    reissued = { key: 'reissued', label: 'A forfeited share, reissued as fully paid', shares: r, segments: [{ key: 'application', label: price < F ? 'Paid by the new holder' : 'Face value', amount: Math.min(price, F), called: true, paid: Math.min(price, F), ahead: false, arrears: false, forfeited: false }, ...(price < F ? [{ key: 'allotment' as const, label: 'Discount, met from the forfeited amount', amount: F - price, called: true, paid: F - price, ahead: false, arrears: false, forfeited: true }] : []), ...(price > F ? [{ key: 'premium' as const, label: 'Premium', amount: price - F, called: true, paid: price - F, ahead: false, arrears: false, forfeited: false }] : [])] };
    rows.push(reissued);
    step(
      'reissue',
      'reissue',
      'Forfeited shares reissued',
      `${qty(r)} of the forfeited shares are reissued as fully paid at ${inr(price)} a share. Share capital is credited with the full ${inr(F)} a share (${inr(r * F)})${discount > 0 ? `; the discount of ${inr(discount)} is met out of Forfeited Shares A/c, never more than the ${inr(forfeitedOnThese)} forfeited on these shares` : ''}${premiumOnReissue > 0 ? `; the ${inr(premiumOnReissue)} above the face value is a premium` : ''}.`,
      {
        lines: [...line(BANK, 'Dr', r * price), ...line(FS, 'Dr', discount), ...line(CAP, 'Cr', r * F), ...line(SP, 'Cr', premiumOnReissue)],
        narration: `${qty(r)} forfeited shares reissued as fully paid at ${inr(price)} a share`,
      },
      [
        { from: 'holders', to: 'bank', amount: r * price, label: `${inr(r * price)} from the new holder` },
        { from: 'forfeited', to: 'capital', amount: discount, label: `Discount ${inr(discount)} from the forfeited amount` },
      ],
    );
    capitalReserve = forfeitedOnThese - discount;
    if (capitalReserve > 0) {
      step(
        'reserve',
        'reissue',
        'The gain to Capital Reserve',
        `On the ${qty(r)} reissued shares the company kept ${inr(forfeitedOnThese)} and gave up ${inr(discount)} as discount: a capital profit of ${inr(capitalReserve)}, transferred to Capital Reserve A/c.${r < d ? ` The ${inr(cr(FS) - capitalReserve)} forfeited on the ${qty(d - r)} shares not reissued stays in Forfeited Shares A/c.` : ''}`,
        { lines: [...line(FS, 'Dr', capitalReserve), ...line(CR, 'Cr', capitalReserve)], narration: `gain on reissue of ${qty(r)} forfeited shares transferred to capital reserve` },
        [{ from: 'forfeited', to: 'reserve', amount: capitalReserve, label: `${inr(capitalReserve)} to Capital Reserve` }],
      );
    }
  };

  // 5. The calls.
  x.calls.forEach((c, i) => {
    const key: Instalment = i === 0 ? 'call1' : 'call2';
    const acct = callAccount(nCalls, i);
    const name = callLabel(nCalls, i);
    const isFinal = i === nCalls - 1;
    const on = early && isFinal ? N - d : N;
    dueAccount = acct;
    allRows().forEach((r) => {
      if (r === def && early && isFinal) return;
      segOf(r, key)!.called = true;
    });
    calledUpRegular += c;
    if (!(early && isFinal)) calledUpDef += c;
    step(
      'call-due',
      i === 0 ? 'call1' : 'call2',
      `${name} made`,
      `The ${name.toLowerCase()} of ${inr(c)} a share is made on ${qty(on)} shares: ${inr(on * c)} falls due, and share capital fills by the same amount.${early && isFinal ? ` The ${qty(d)} forfeited shares are no longer anyone's, so no call is made on them.` : ''}`,
      { lines: [...line(acct, 'Dr', on * c), ...line(CAP, 'Cr', on * c)], narration: `${name.toLowerCase()} due on ${qty(on)} shares at ${inr(c)} a share` },
      [{ from: 'due', to: 'capital', amount: on * c, label: `${inr(on * c)} called up to share capital` }],
    );

    const defOwes = def && !(early && isFinal) && !pays(key) ? d * c : 0;
    const advAdjust = isFinal && k > 0 ? advanceAmount : 0;
    const received = on * c - defOwes - advAdjust;
    const advNow = advanceWith(key) ? advanceAmount : 0;
    allRows().forEach((r) => {
      if (r === def && (early && isFinal ? true : !pays(key))) return;
      const s = segOf(r, key)!;
      s.paid = c;
      s.ahead = false;
    });
    if (def && defOwes > 0) segOf(def, key)!.arrears = true;
    if (advNow && adv) {
      const s = segOf(adv, finalKey)!;
      s.paid = lastCall;
      s.ahead = true;
    }
    step(
      'call-received',
      i === 0 ? 'call1' : 'call2',
      `${name} money received`,
      `${inr(received)} is received on the ${name.toLowerCase()}${advAdjust > 0 ? `; ${inr(advAdjust)} was paid in advance and is now set against it, out of Calls in Advance A/c` : ''}${defOwes > 0 ? `; ${inr(defOwes)} is not paid by the holder of ${qty(d)} shares and goes to Calls in Arrears A/c` : ''}.${advNow ? ` The holder of ${qty(k)} shares also pays the final call of ${inr(lastCall)} a share now: ${inr(advanceAmount)} to Calls in Advance A/c, a liability until the call is made.` : ''}`,
      {
        lines: [...line(BANK, 'Dr', received + advNow), ...line(CIADV, 'Dr', advAdjust), ...line(CIA, 'Dr', defOwes), ...line(acct, 'Cr', on * c), ...line(CIADV, 'Cr', advNow)],
        narration: `${name.toLowerCase()} money received${defOwes > 0 ? `, except on ${qty(d)} shares` : ''}${advAdjust > 0 ? ', calls in advance adjusted' : ''}${advNow ? `, with the final call in advance on ${qty(k)} shares` : ''}`,
      },
      [
        { from: 'holders', to: 'bank', amount: received + advNow, label: `${inr(received + advNow)} into the bank` },
        { from: 'advance', to: 'due', amount: advAdjust, label: `${inr(advAdjust)} paid in advance, now used` },
        { from: 'due', to: 'arrears', amount: defOwes, label: `${inr(defOwes)} unpaid, to Calls in Arrears` },
        { from: 'holders', to: 'advance', amount: advNow, label: `${inr(advNow)} paid in advance` },
      ],
    );
    if (early && i === 0) forfeit();
  });
  if (!early) forfeit();
  reissue();

  const stages: { stage: Stage; label: string }[] = [
    { stage: 'application', label: 'Application' },
    { stage: 'allotment', label: 'Allotment' },
    ...x.calls.map((_, i) => ({ stage: (i === 0 ? 'call1' : 'call2') as Stage, label: callLabel(nCalls, i) })),
    ...(def ? [{ stage: 'forfeiture' as Stage, label: 'Forfeiture' }] : []),
    ...(x.reissue ? [{ stage: 'reissue' as Stage, label: 'Reissue' }] : []),
  ];
  // Put the stages in the order they happen.
  const order = [...new Set(steps.map((s) => s.stage))];
  stages.sort((p, q) => order.indexOf(p.stage) - order.indexOf(q.stage));

  return {
    input: x,
    steps,
    stages,
    figures: {
      applicationMoney,
      refundRejected,
      excess,
      excessAdjusted,
      excessRefunded,
      allotmentDue,
      allotmentToReceive,
      allotmentReceived,
      defaulterApplied,
      calledUpOnForfeited,
      premiumUnpaidOnForfeited: premiumUnpaid,
      unpaidOnForfeited,
      forfeited: forfeitedAmount,
      discountOnReissue: discount,
      capitalReserve,
      forfeitedLeft: cr(FS),
      bank: B(BANK),
    },
  };
}
