/**
 * Case studies of the company-accounts stage (Class 12): the issue of shares, its forfeiture and reissue, shares and
 * debentures given to a vendor, the issue of debentures with terms of redemption and as collateral security, and the
 * balance sheet extract with its notes. The stage opens after the topic `debentures`; only it and `share-capital`
 * (and the partnership topics before them, which a company case does not need) are used.
 *
 * Every case is told with the examined code of the two topics (`SC_CASE` in `templates/share-capital.ts`, `DEB_CASE`
 * in `templates/debentures.ts`): an issue of shares is a `Float` whose entries `stepsOf` writes the way a student
 * works them and whose books `books` keeps shareholder by shareholder; an issue of debentures is a lot whose
 * allotment entry is `allotmentLines` and whose write-off is `writeOffTx`. Each `verify` reaches the answer the other
 * way (the books against the formulas, the terms against the posted entries).
 *
 * The rulings of the two topics, each stated in the case text where a part relies on it:
 *  - Securities Premium is credited when the instalment that carries it falls due, and is debited on forfeiture only
 *    if it was not received; after a pro rata allotment the excess application money is kept towards the sum due on
 *    allotment and is taken to meet its capital part first;
 *  - every case says whether a Calls in Arrears A/c is kept; an issue is at least 90% subscribed; a pro rata issue is
 *    of 20,000 shares or more and no one holder has more than 5% of it; separate forfeitures are on separate dates;
 *    forfeited shares are reissued as fully paid, the discount never more than the amount forfeited on them, and the
 *    Capital Reserve on a reissue is the amount forfeited on the shares reissued less the discount on them;
 *  - a discount on debentures redeemable at par goes to Discount on Issue of Debentures A/c; once a premium is
 *    payable on redemption the whole loss goes to Loss on Issue of Debentures A/c, and the case says so; it is written
 *    off in the year of allotment, first from Securities Premium and then to the Statement of Profit and Loss as a
 *    finance cost; a premium payable on redemption is shown under Other long-term liabilities; a discount is 5% or
 *    10% and an issue price lies between ₹90 and ₹125 for every ₹100;
 *  - a line of an extract that comes to nil is left out, and the case says so; no interest on calls, no redemption
 *    entries, no tax deducted at source, no calls on debentures; "Sundries" is never offered as a wrong label.
 */
import type { JournalSetQuestion, McqQuestion, StatementQuestion } from '@/content/types';
import { debentures, vendor } from '@/engine/accounts';
import { accountOf, post, type DatedEntry } from '@/engine/books';
import type { JournalLine } from '@/engine/journal';
import { caseTemplate, keepFor, ledgerSides, rupees, setDays } from '../authoring';
import { DEB_CASE as D, type DebIssue, type DebIssueAt, type DebTakeover, type DebYearLot, type DebYearOfIssue } from '../templates/debentures';
import { SC_CASE as S, type ScDefaulter, type ScFloat, type ScStep } from '../templates/share-capital';
import type { CaseTemplate, FormatRowParts, SetTransaction, StatementLineParts } from '../types';

const TOPIC = 'debentures';
const CONCEPT = 'deb-case';

const { inr, cnt, sum, ac } = S;
const optionText = (q: McqQuestion): string | undefined => q.options.find((o) => o.id === q.correct)?.text;
/** Every figure of a text, in order, with its commas taken out. */
const figuresIn = (text: string, pattern: RegExp): number[] => {
  const m = pattern.exec(text);
  return m ? m.slice(1).map((x) => Number(x.replace(/,/g, ''))) : [];
};
/** The amount, in rupees, an entry posts to an account on a side. */
const postedIn = (lines: readonly JournalLine[], accountId: string, side: 'Dr' | 'Cr'): number =>
  lines.filter((l) => l.accountId === accountId && l.side === side).reduce((t, l) => t + l.amount, 0) / 100;

// ===============================================================================================================
// 1. case-ca-prorata-allotment: an over-subscribed issue allotted pro rata (short parts). Some applications are
//    refused outright and the money on them returned; the rest are allotted pro rata. One applicant's figures are
//    followed (shares allotted, the excess kept towards allotment, what is still paid on allotment), then the cash the
//    company receives on allotment, and the one entry that deals with all the application money. The issue is at par
//    or at a premium, payable in two to four instalments, and in half the seeds another allottee pays nothing on
//    allotment.
// ===============================================================================================================

interface ProCase {
  text: string;
  f: ScFloat;
  story: ScStep[];
  x: string;
  /** What the followed applicant applied for and was allotted. */
  ax: number;
  kx: number;
  /** The allottee who did not pay the allotment money, if any. */
  late?: ScDefaulter;
}
const proKept = keepFor<ProCase>();

/** The books of the followed applicant alone: every figure of that applicant, reached shareholder by shareholder. */
const applicantBooks = (c: ProCase) => S.books({ ...c.f.s, groups: [{ applied: c.ax, allotted: c.kx, paid: 2 }] });

const caseProrata = caseTemplate<ProCase>({
  id: 'case-ca-prorata-allotment',
  topicId: TOPIC,
  conceptId: CONCEPT,
  difficulty: 'medium',
  title: 'An issue allotted pro rata',
  setup: (rng) => {
    const count = rng.pick([2, 3, 3, 4] as const);
    const s = S.drawTerms(rng, count, rng.int(0, 2) > 0);
    // Only the application and the allotment are asked: no call has been made yet.
    s.called = 2;
    const pro = S.drawRatio(rng, s);
    if (!pro) return null;
    const n = S.proIssue(rng, pro);
    const lot = pro.b * 100;
    const refused = rng.step(2000, 20000, 1000);
    const [x, y] = rng.shuffle(S.HOLDERS);
    const kx = S.holding(rng, n, lot, 1, 9);
    const ky = S.holding(rng, n, lot, 1, 9);
    const bad: ScDefaulter[] = rng.int(0, 1) === 0 ? [{ who: y, k: ky, applied: (ky * pro.a) / pro.b, from: 1, forfeited: false }] : [];
    s.arrears = rng.int(0, 1) === 0;
    const f = S.seal({ co: rng.pick(S.COMPANIES), s, offered: n, n, refused, pro, bad, lots: [] });
    if (!f) return null;
    const ax = (kx * pro.a) / pro.b;
    const late = bad[0];
    const text = [
      S.offerOf(f),
      `Applications were received for ${cnt(S.allApplied(f))} shares. The directors refused the applications for ${cnt(refused)} shares and returned the money on them, and allotted the ${cnt(n)} shares pro rata to the other applicants.`,
      S.proRule(s),
      `${x} had applied for ${cnt(ax)} shares.`,
      late ? `${late.who}, who was allotted ${cnt(late.k)} shares, did not pay the allotment money; every other allottee paid it in full. ${S.arrearsRule(s)}` : 'Every allottee paid the allotment money in full.',
      ...(count > 2 ? ['No call has been made yet.'] : []),
      'All money is received and paid through the bank.',
    ].join('\n');
    const c: ProCase = { text, f, story: S.stepsOf(f), x, ax, kx, ...(late ? { late } : {}) };
    proKept.keep(text, c);
    return c;
  },
  context: (c) => c.text,
  parts: [
    {
      kind: 'numeric',
      unit: 'number',
      make: (c) => {
        const { f, x, ax, kx } = c;
        const pro = f.pro!;
        const prorata = S.appliedFor(f, f.n);
        const num = S.numeric(
          kx,
          [
            [ax, `Allotted ${x} every share applied for; in a pro rata allotment each applicant gets only a part of what was applied for.`],
            [(ax * pro.a) / pro.b, 'Turned the proportion upside down, so that the applicant got more shares than were applied for.'],
            [ax - kx, `Gave the shares ${x} applied for and did not get.`],
            [(ax * f.n) / S.allApplied(f), 'Worked the proportion on all the applications, the refused ones among them; the refused applicants get nothing and are left out.'],
          ],
          1,
        );
        return num && {
          prompt: `How many shares were allotted to ${x}?`,
          ...num,
          explanation: [
            `The applicants allotted pro rata applied for ${cnt(S.allApplied(f))} - ${cnt(f.refused)} = ${cnt(prorata)} shares and got ${cnt(f.n)}: ${pro.b} share${pro.b === 1 ? '' : 's'} for every ${pro.a} applied for.`,
            `${x} is allotted ${cnt(ax)} x ${pro.b}/${pro.a} = ${cnt(kx)} shares.`,
          ],
          hints: ['Leave the refused applications out: only the applicants allotted pro rata share the shares.', 'Shares allotted = shares applied for x shares allotted pro rata / shares applied for by those applicants.'],
        };
      },
      // From the printed case: the applications, the refusals, the shares allotted and the applicant's own application.
      verify: (q) => {
        const [all, refused, n] = figuresIn(q.context ?? '', /received for ([\d,]+) shares\. The directors refused the applications for ([\d,]+) shares .*? allotted the ([\d,]+) shares/);
        const [applied] = figuresIn(q.context ?? '', /had applied for ([\d,]+) shares\./);
        return all > 0 && applied > 0 && q.answer * (all - refused) === applied * n;
      },
    },
    {
      kind: 'numeric',
      unit: 'rupees',
      make: (c) => {
        const { f, x, ax, kx } = c;
        const s = f.s;
        const app = S.payable(s, 0);
        const num = S.numeric((ax - kx) * app, [
          [ax * app, `Gave all the application money ${x} paid; the part on the shares allotted becomes share capital.`],
          [kx * app, 'Gave the application money on the shares allotted, which is transferred to share capital; the excess is the money on the shares not allotted.'],
          [(ax - kx) * S.payable(s, 1), 'Worked the excess at the allotment rate; the applicant had paid only the application money on those shares.'],
        ]);
        return num && {
          prompt: `How much of ${x}'s application money is kept towards the allotment money?`,
          ...num,
          explanation: [`${x} applied for ${cnt(ax)} shares and was allotted ${cnt(kx)}.`, `Excess application money = (${cnt(ax)} - ${cnt(kx)}) x ${inr(app)} = ${inr((ax - kx) * app)}, kept towards the sum due on allotment.`],
          hints: S.H.prorata,
        };
      },
      verify: (q) => {
        const c = proKept.of(q.context ?? '');
        return !!c && q.answer === S.lineOf(applicantBooks(c).transfer, S.stageId(c.f.s.kind, 1, c.f.s.parts.length), 'Cr');
      },
    },
    {
      kind: 'numeric',
      unit: 'rupees',
      make: (c) => {
        const { f, x, ax, kx } = c;
        const s = f.s;
        const app = S.payable(s, 0);
        const rate = S.payable(s, 1);
        const excess = (ax - kx) * app;
        const num = S.numeric(kx * rate - excess, [
          [kx * rate, `Ignored ${x}'s excess application money, which the company already holds towards the allotment.`],
          [ax * rate - excess, `Worked the allotment money on the shares applied for; it is due only on the ${cnt(kx)} shares allotted.`],
          ...(s.premium > 0 ? [[kx * s.parts[1] - excess, 'Left out the premium, which is payable with the allotment money.'] as [number, string]] : []),
          [excess, 'Gave the excess application money set against the allotment, not what is still to be paid.'],
          [kx * rate + excess, 'Added the excess application money instead of deducting it.'],
        ]);
        return num && {
          prompt: `How much did ${x} pay on allotment?`,
          ...num,
          explanation: [
            `Due from ${x} on allotment = ${cnt(kx)} x ${inr(rate)} = ${inr(kx * rate)}${s.premium > 0 ? ', the premium with it' : ''}.`,
            `Less the excess application money already held, ${inr(excess)}: ${x} pays ${inr(kx * rate)} - ${inr(excess)} = ${inr(kx * rate - excess)}.`,
          ],
          hints: S.H.prorata,
        };
      },
      verify: (q) => {
        const c = proKept.of(q.context ?? '');
        return !!c && q.answer === S.lineOf(applicantBooks(c).received[1], 'bank', 'Dr');
      },
    },
    {
      kind: 'numeric',
      unit: 'rupees',
      make: (c) => {
        const { f, late } = c;
        const s = f.s;
        const app = S.payable(s, 0);
        const rate = S.payable(s, 1);
        const due = f.n * rate;
        const excess = S.excessOf(f);
        const unpaid = late ? S.unpaidOn(f, late, 1) : 0;
        const cash = due - excess - unpaid;
        const num = S.numeric(cash, [
          ...(late
            ? ([
                [due - excess, `Forgot that ${late.who} did not pay the allotment money.`],
                [due - excess - late.k * rate, `Took the whole of ${late.who}'s allotment money as unpaid, although ${late.who}'s own excess application money had already met part of it.`],
              ] as [number, string][])
            : []),
          [due - unpaid, 'Ignored the excess application money already held, which reduces what comes in on allotment.'],
          ...(s.premium > 0 ? [[f.n * s.parts[1] - excess - (late ? late.k * s.parts[1] - S.ownExcess(f, late) : 0), 'Left out the premium, which is payable with the allotment money.'] as [number, string]] : []),
          [cash - f.refused * app, 'Took the money returned on the refused applications off the allotment money too; it was paid back out of the application money.'],
        ]);
        return num && {
          prompt: 'How much money did the company receive on allotment?',
          ...num,
          explanation: [
            `Due on allotment = ${cnt(f.n)} x ${inr(rate)} = ${inr(due)}.`,
            `Excess application money of the applicants allotted pro rata = (${cnt(S.appliedFor(f, f.n))} - ${cnt(f.n)}) x ${inr(app)} = ${inr(excess)}, already held.`,
            ...(late
              ? [`${late.who} owed ${cnt(late.k)} x ${inr(rate)} = ${inr(late.k * rate)}, less ${late.who}'s own excess of ${cnt(late.applied - late.k)} x ${inr(app)} = ${inr(S.ownExcess(f, late))}: ${inr(unpaid)} was not received.`]
              : []),
            `Money received = ${inr(due)} - ${inr(excess)}${late ? ` - ${inr(unpaid)}` : ''} = ${inr(cash)}.`,
          ],
          hints: ['Start from the whole sum due on allotment, then take off what was already in hand and what did not come in.', S.H.prorata[1]],
        };
      },
      verify: (q) => {
        const c = proKept.of(q.context ?? '');
        return !!c && q.answer === S.lineOf(S.books(c.f.s).received[1], 'bank', 'Dr');
      },
    },
    {
      kind: 'journal',
      make: (c) => {
        const step = c.story.find((st) => st.kind === 'allotted')!;
        const s = c.f.s;
        return {
          prompt: 'Pass the one entry on allotment that deals with all the application money.',
          lines: step.lines,
          explanation: step.explanation,
          distractorAccounts: ['callsInAdvance', 'callsInArrears', 'securitiesPremium', s.parts.length > 2 ? S.stageId(s.kind, 2, s.parts.length) : 'forfeitedShares'],
          hints: S.H.prorata,
        };
      },
      verify: (q) => {
        const c = proKept.of(q.context ?? '');
        return !!c && S.sameEntry(q.expected, S.books(c.f.s).transfer);
      },
    },
  ],
});

// ===============================================================================================================
// 2. case-ca-forfeit-reissue: one holder's shares forfeited for non-payment and reissued as fully paid (short
//    parts). The holder stopped paying after the application money or after a later instalment; the issue is at par
//    or at a premium (cancelled on forfeiture only when it was never received); a Calls in Arrears A/c is kept or not.
//    All or some of the shares are reissued, at a discount within the amount forfeited or at their face value. Asked:
//    the amount forfeited, the forfeiture entry, the lowest price a share could be reissued at, the reissue entry and the Capital
//    Reserve.
// ===============================================================================================================

interface ForfeitCase {
  text: string;
  f: ScFloat;
  story: ScStep[];
  d: ScDefaulter;
  /** Shares reissued, the price of each, and what had been received a share towards capital on the shares forfeited. */
  j: number;
  price: number;
  per: number;
}
const forfeitKept = keepFor<ForfeitCase>();

const caseForfeitReissue = caseTemplate<ForfeitCase>({
  id: 'case-ca-forfeit-reissue',
  topicId: TOPIC,
  conceptId: CONCEPT,
  difficulty: 'medium',
  title: 'Forfeiture and reissue of shares',
  setup: (rng) => {
    const count = rng.pick([3, 3, 4] as const);
    const s = S.drawTerms(rng, count, rng.int(0, 2) > 0);
    s.arrears = rng.int(0, 1) === 0;
    const n = rng.step(20000, 150000, 10000);
    const k = S.holding(rng, n, 100, 2, 20);
    const from = rng.int(1, count - 1);
    const per = sum(s.parts.slice(0, from));
    const room = S.discountRoom(s, per);
    if (room < 1) return null;
    const j = rng.int(0, 2) === 0 ? k : S.partOf(rng, k);
    const price = rng.int(0, 3) === 0 ? s.face : s.face - (s.face / 10) * rng.int(1, room);
    const d: ScDefaulter = { who: rng.pick(S.HOLDERS), k, applied: k, from, forfeited: true };
    const f = S.seal({ co: rng.pick(S.COMPANIES), s, offered: n, n, refused: 0, pro: null, bad: [d], lots: [{ takes: [j], price }] });
    if (!f) return null;
    const text = [
      `${f.co} allotted ${cnt(n)} ${S.sharesOf(s)}, issued ${S.priced(s)} and payable ${S.terms(s)}. Every call has been made.`,
      `${S.lapse(s, d)}. Every other shareholder has paid in full.`,
      S.arrearsNote(s),
      `The directors forfeited ${d.who}'s shares. Later ${j === k ? 'all of them were' : `${cnt(j)} of them were`} reissued at ${inr(price)} a share, fully paid.`,
      'All money is received and paid through the bank.',
    ].join('\n');
    const c: ForfeitCase = { text, f, story: S.stepsOf(f), d, j, price, per };
    forfeitKept.keep(text, c);
    return c;
  },
  context: (c) => c.text,
  parts: [
    {
      kind: 'numeric',
      unit: 'rupees',
      make: (c) => {
        const { f, d, per } = c;
        const s = f.s;
        const lost = S.premiumLost(f, d);
        const num = S.numeric(d.k * per, [
          [d.k * s.face, `Gave the amount called up on the shares, which is debited to ${ac(S.capitalId(s.kind))}; Forfeited Shares A/c takes only what was received.`],
          [d.k * (s.face - per), 'Gave the amount left unpaid; Forfeited Shares A/c is credited with what the holder had paid towards capital.'],
          ...(s.premium > 0 && !lost ? [[d.k * (per + s.premium), 'Counted the premium received as forfeited; a premium that has been received stays in Securities Premium A/c.'] as [number, string]] : []),
          ...(lost ? [[d.k * (per + s.premium), 'Counted the premium as forfeited, although it was never received.'] as [number, string]] : []),
        ]);
        return num && {
          prompt: 'What amount is credited to Forfeited Shares A/c on the forfeiture?',
          ...num,
          explanation: [
            `${d.who} had paid ${S.PAID[d.from]} on ${cnt(d.k)} shares: ${inr(per)} a share towards capital.`,
            `Amount forfeited = ${cnt(d.k)} x ${inr(per)} = ${inr(d.k * per)}: Forfeited Shares A/c is credited with it.`,
            ...(s.premium > 0 ? [lost ? 'The premium was never received, so none of it is forfeited.' : 'The premium received is not part of it: it stays in Securities Premium A/c.'] : []),
          ],
          hints: S.H.forfeit,
        };
      },
      verify: (q) => {
        const c = forfeitKept.of(q.context ?? '');
        return !!c && q.answer === S.lineOf(S.books(c.f.s).forfeiture, 'forfeitedShares', 'Cr');
      },
    },
    {
      kind: 'journal',
      make: (c) => {
        const step = c.story.find((st) => st.kind === 'forfeited')!;
        const s = c.f.s;
        return {
          prompt: `Pass the entry for the forfeiture of ${c.d.who}'s shares.`,
          lines: step.lines,
          explanation: step.explanation,
          distractorAccounts: ['bank', 'capitalReserve', 'securitiesPremium', s.arrears ? S.stageId(s.kind, s.parts.length - 1, s.parts.length) : 'callsInArrears'],
          hints: S.H.forfeit,
        };
      },
      verify: (q) => {
        const c = forfeitKept.of(q.context ?? '');
        return !!c && S.sameEntry(q.expected, S.books(c.f.s).forfeiture);
      },
    },
    {
      kind: 'numeric',
      unit: 'rupees',
      // The lowest price, not the largest discount: the discount a share is the amount forfeited a share, which the
      // first question already gives, so this one asks for the rule applied to the price.
      make: (c) => {
        const { f, d, per, price } = c;
        const s = f.s;
        const num = S.numeric(s.face - per, [
          [per, 'Gave the largest discount allowed on a share, not the lowest price.'],
          [s.face, 'Took the face value as the lowest price; forfeited shares may be reissued at a discount, up to the amount forfeited on them.'],
          [d.k * (s.face - per), 'Gave the lowest price of all the forfeited shares together; the question asks for one share.'],
          [price, 'Gave the price at which the shares were actually reissued, not the lowest price the rule allows.'],
          ...(s.premium > 0 && !S.premiumLost(f, d) ? [[s.face - per - s.premium, 'Counted the premium received as part of the amount forfeited; it stays in Securities Premium A/c.'] as [number, string]] : []),
        ]);
        return num && {
          prompt: 'What is the lowest price per share at which the forfeited shares could have been reissued as fully paid?',
          ...num,
          explanation: [
            `The discount on reissue cannot be more than the amount forfeited on a share: ${inr(per)}.`,
            `So no share may be reissued below ${inr(s.face)} - ${inr(per)} = ${inr(s.face - per)}: with what was forfeited, the company still has the full face value.`,
          ],
          hints: S.H.reissue,
        };
      },
      verify: (q) => {
        const c = forfeitKept.of(q.context ?? '');
        return !!c && (c.f.s.face * 100 - q.answer) * c.d.k === S.lineOf(S.books(c.f.s).forfeiture, 'forfeitedShares', 'Cr');
      },
    },
    {
      kind: 'journal',
      make: (c) => {
        const step = c.story.find((st) => st.kind === 'reissued')!;
        return {
          prompt: 'Pass the entry for the reissue of the forfeited shares.',
          lines: step.lines,
          explanation: step.explanation,
          distractorAccounts: ['capitalReserve', 'forfeitedShares', 'securitiesPremium', 'callsInArrears'],
          hints: S.H.reissue,
        };
      },
      verify: (q) => {
        const c = forfeitKept.of(q.context ?? '');
        return !!c && S.sameEntry(q.expected, S.books(c.f.s).reissue);
      },
    },
    {
      kind: 'numeric',
      unit: 'rupees',
      make: (c) => {
        const { f, d, j, price, per } = c;
        const s = f.s;
        const off = s.face - price;
        const gain = j * per - j * off;
        const num = S.numeric(gain, [
          ...(j < d.k ? ([[d.k * per - j * off, `Transferred the gain on all the forfeited shares, although only ${cnt(j)} of the ${cnt(d.k)} were reissued.`], [(d.k - j) * per, 'Gave what stays in Forfeited Shares A/c on the shares not yet reissued.']] as [number, string][]) : []),
          ...(off > 0 ? ([[j * per, 'Forgot the discount allowed on reissue.'], [j * off, 'Gave the discount allowed on reissue, not the gain left after it.']] as [number, string][]) : []),
          [j * price, 'Gave the money received on reissue.'],
          [j * (s.face - per), 'Gave the capital that had been left unpaid on the shares reissued, not the amount forfeited on them.'],
        ]);
        return num && {
          prompt: 'What amount is transferred to Capital Reserve?',
          ...num,
          explanation: [
            `Forfeited on the ${cnt(j)} shares reissued = ${cnt(j)} x ${inr(per)} = ${inr(j * per)}${j < d.k ? `; the ${inr((d.k - j) * per)} on the other ${cnt(d.k - j)} shares stays in Forfeited Shares A/c` : ''}.`,
            off > 0 ? `Discount allowed on reissue = ${cnt(j)} x (${inr(s.face)} - ${inr(price)}) = ${inr(j * off)}.` : 'The shares were reissued at their face value: there is no discount.',
            `Capital Reserve = ${off > 0 ? `${inr(j * per)} - ${inr(j * off)} = ` : ''}${inr(gain)}.`,
          ],
          hints: S.H.reissue,
        };
      },
      verify: (q) => {
        const c = forfeitKept.of(q.context ?? '');
        return !!c && q.answer === -S.net(S.books(c.f.s).ledger, 'capitalReserve');
      },
    },
  ],
});

// ===============================================================================================================
// 3. case-ca-vendor-shares: a running business taken over and paid for in fully paid equity shares at a premium
//    (short parts). The assets and liabilities come in at agreed values, the consideration is above or below the net
//    assets (goodwill or a capital reserve), and the vendor takes shares for the whole of it or a cheque for a part
//    and shares for the rest. The premium is stated as a rate, as an amount a share or as the issue price.
// ===============================================================================================================

interface Item {
  id: string;
  name: string;
  value: number;
}
interface VendorCase {
  text: string;
  v: string;
  assets: Item[];
  liabilities: Item[];
  gross: number;
  owed: number;
  price: number;
  /** The face value, the premium and the issue price of a share, the shares allotted and the cheque (0 for none). */
  face: number;
  p: number;
  each: number;
  n: number;
  cheque: number;
}
const vendorKept = keepFor<VendorCase>();
const listed = (items: readonly Item[]): string => items.map((x) => `${x.name} ${inr(x.value)}`).join(', ');
/** "Goodwill of ₹40,000" for a price above the net assets, "Capital reserve of ₹40,000" for one below. */
const arising = (x: number): string => `${x > 0 ? 'Goodwill' : 'Capital reserve'} of ${inr(Math.abs(x))}`;

const caseVendorShares = caseTemplate<VendorCase>({
  id: 'case-ca-vendor-shares',
  topicId: TOPIC,
  conceptId: CONCEPT,
  difficulty: 'medium',
  title: 'A business bought for shares',
  setup: (rng) => {
    const b = S.drawBusiness(rng);
    if (!b) return null;
    const face = rng.pick([10, 10, 100]);
    const pct = rng.pick(face === 10 ? [10, 20, 50] : [10, 20, 25, 50]);
    const p = (face * pct) / 100;
    const each = face + p;
    const how = rng.pick([`at a premium of ${pct}%`, `at a premium of ${inr(p)} a share`, `at ${inr(each)} a share`]);
    const lot = face === 10 ? 1000 : 100;
    // Shares for the whole price where it divides, or a cheque for a part and shares for the rest.
    const whole = b.price % (each * lot) === 0 && rng.int(0, 1) === 0;
    const n = whole ? b.price / each : Math.floor((b.price * rng.pick([60, 70, 80])) / 100 / each / lot) * lot;
    const cheque = b.price - n * each;
    if (n <= 0 || (!whole && cheque <= 0)) return null;
    const text = [
      `${rng.pick(S.COMPANIES)} took over the running business of ${b.v} at these agreed values: assets: ${listed(b.assets)}; liabilities: ${listed(b.liabilities)}.`,
      `The purchase consideration was fixed at ${inr(b.price)}, and ${b.v} is credited with it until it is settled.`,
      whole
        ? `It was settled in full by allotting to ${b.v} equity shares of ${inr(face)} each as fully paid, ${how}.`
        : `${b.v} was paid ${inr(cheque)} by cheque, and the balance by allotting equity shares of ${inr(face)} each as fully paid, ${how}.`,
    ].join('\n');
    const c: VendorCase = { text, v: b.v, assets: b.assets, liabilities: b.liabilities, gross: b.gross, owed: b.owed, price: b.price, face, p, each, n, cheque };
    vendorKept.keep(text, c);
    return c;
  },
  context: (c) => c.text,
  parts: [
    {
      kind: 'mcq',
      make: (c) => {
        const { gross, owed, price } = c;
        const diff = price - (gross - owed);
        return S.choice(
          'What arises in the books of the company on the takeover?',
          arising(diff),
          [
            [arising(-diff), diff > 0 ? 'Read a price above the net assets as a gain; paying more than the net assets are worth is the cost of goodwill.' : 'Read a price below the net assets as goodwill; getting the net assets for less than they are worth is a capital profit.'],
            ...(price === gross ? [] : [[arising(price - gross), 'Compared the price with the total of the assets and forgot to deduct the liabilities taken over.'] as [string, string]]),
            ...(price === gross + owed ? [] : [[arising(price - gross - owed), 'Added the liabilities taken over to the assets instead of deducting them.'] as [string, string]]),
            [`Neither: the business simply comes into the books at ${inr(price)}`, 'Left the difference unrecorded; the assets and liabilities come in at their agreed values, and the difference is goodwill or a capital reserve.'],
          ],
          `Net assets = ${inr(gross)} - ${inr(owed)} = ${inr(gross - owed)}. The purchase consideration of ${inr(price)} is ${diff > 0 ? 'more' : 'less'} by ${inr(Math.abs(diff))}: ${diff > 0 ? 'the excess paid is goodwill, debited to Goodwill A/c' : 'the saving is a capital profit, credited to Capital Reserve A/c'}.`,
          ['Net assets = assets taken over - liabilities taken over.', 'A price above the net assets is goodwill; a price below them leaves a capital reserve.'],
        );
      },
      // The takeover entry itself: the side that is short names the difference.
      verify: (q) => {
        const c = vendorKept.of(q.context ?? '');
        if (!c) return false;
        const short = sum(c.assets.map((a) => a.value)) - sum(c.liabilities.map((l) => l.value)) - c.price;
        return optionText(q) === arising(-short);
      },
    },
    {
      kind: 'journal',
      make: (c) => {
        const diff = c.price - (c.gross - c.owed);
        return {
          prompt: 'Pass the entry for the takeover of the business.',
          lines: S.entry(
            ...c.assets.map((a) => S.dr(a.id, a.value)),
            S.dr('goodwill', Math.max(diff, 0)),
            ...c.liabilities.map((l) => S.cr(l.id, l.value)),
            S.cr(vendor(c.v), c.price),
            S.cr('capitalReserve', Math.max(-diff, 0)),
          ),
          explanation: [
            `Each asset taken over is debited at its agreed value (${inr(c.gross)} in all) and each liability is credited (${inr(c.owed)} in all).`,
            `${c.v} is credited with the purchase consideration, ${inr(c.price)}: it is owed until it is settled.`,
            `Net assets = ${inr(c.gross)} - ${inr(c.owed)} = ${inr(c.gross - c.owed)}. ${diff > 0 ? `The price is ${inr(diff)} more: Goodwill A/c is debited with ${inr(diff)}.` : `The price is ${inr(-diff)} less: Capital Reserve A/c is credited with ${inr(-diff)}.`}`,
          ],
          distractorAccounts: [diff > 0 ? 'capitalReserve' : 'goodwill', 'equityShareCapital', 'bank', 'securitiesPremium'],
          hints: ['Debit the assets, credit the liabilities and credit the vendor with the purchase consideration.', 'The difference that balances the entry is goodwill (a debit) or a capital reserve (a credit).'],
        };
      },
      verify: (q) => {
        const c = vendorKept.of(q.context ?? '');
        if (!c) return false;
        const net = sum(c.assets.map((a) => a.value)) - sum(c.liabilities.map((l) => l.value));
        return postedIn(q.expected, vendor(c.v), 'Cr') === c.price && postedIn(q.expected, 'goodwill', 'Dr') - postedIn(q.expected, 'capitalReserve', 'Cr') === c.price - net;
      },
    },
    {
      kind: 'numeric',
      unit: 'number',
      make: (c) => {
        const { face, p, each, n, cheque, price } = c;
        const settled = price - cheque;
        const num = S.numeric(
          n,
          [
            [settled / face, 'Divided by the face value; each share is issued above it, so fewer shares are needed.'],
            [settled / p, 'Divided by the premium alone, not by the whole issue price of a share.'],
            ...(cheque > 0 ? [[price / each, 'Issued shares for the whole purchase consideration and forgot the cheque.'] as [number, string]] : []),
            [settled / (face - p), 'Took the premium off the face value instead of adding it.'],
          ],
          1,
        );
        return num && {
          prompt: `How many shares were allotted to ${c.v}?`,
          ...num,
          explanation: [
            ...(cheque > 0 ? [`Amount settled in shares = ${inr(price)} - ${inr(cheque)} = ${inr(settled)}.`] : []),
            `Issue price of a share = ${inr(face)} + ${inr(p)} = ${inr(each)}, so shares allotted = ${inr(settled)} / ${inr(each)} = ${cnt(n)}.`,
          ],
          hints: S.H.vendor,
        };
      },
      verify: (q) => {
        const c = vendorKept.of(q.context ?? '');
        return !!c && q.answer * c.each === c.price - c.cheque;
      },
    },
    {
      kind: 'journal',
      make: (c) => {
        const { face, p, each, n, v } = c;
        return {
          prompt: `Pass the entry for the allotment of the shares to ${v}.`,
          lines: S.entry(S.dr(vendor(v), n * each), S.cr('equityShareCapital', n * face), S.cr('securitiesPremium', n * p)),
          explanation: [
            `${v} is debited with ${inr(n * each)}, the part of the consideration settled in shares: Bank A/c is not touched.`,
            `Equity Share Capital A/c is credited with the face value, ${cnt(n)} x ${inr(face)} = ${inr(n * face)}.`,
            `Securities Premium A/c is credited with the premium, ${cnt(n)} x ${inr(p)} = ${inr(n * p)}.`,
          ],
          distractorAccounts: ['bank', 'capitalReserve', 'equityShareAllotment', 'goodwill'],
          hints: S.H.vendor,
        };
      },
      verify: (q) => {
        const c = vendorKept.of(q.context ?? '');
        if (!c) return false;
        const shares = postedIn(q.expected, 'equityShareCapital', 'Cr') / c.face;
        return Number.isInteger(shares) && shares * c.each === c.price - c.cheque && postedIn(q.expected, 'securitiesPremium', 'Cr') === shares * c.p;
      },
    },
  ],
});

// ===============================================================================================================
// 4. case-ca-debenture-issue: debentures issued in one of the cases with a loss (short parts): at par and
//    redeemable at a premium, at a discount and redeemable at par or at a premium, or at a premium and redeemable at
//    a higher premium. The loss on issue, the allotment entry, how the loss is written off (Securities Premium first,
//    the premium received on the issue included, then the Statement of Profit and Loss) and the interest for the
//    months the debentures were outstanding in the year of allotment.
// ===============================================================================================================

interface DebCase {
  text: string;
  i: DebIssue;
  years: number;
  /** The accounting year runs from 1 April of `y`; the debentures were allotted on the 1st of `month`, `months` before 31 March. */
  y: number;
  month: string;
  months: number;
  /** Securities Premium before the issue. */
  sp: number;
}
const debKept = keepFor<DebCase>();
const LOSS_CASES: [DebIssueAt, boolean][] = [['par', true], ['discount', false], ['discount', false], ['discount', true], ['discount', true], ['premium', true]];
/** What a lot comes to: the money received, the loss, the premium on issue, and how the loss is borne. */
function debFigures(i: DebIssue, sp: number) {
  const money = i.n * D.priceOf(i);
  const loss = i.n * (i.disc + i.red);
  const own = i.n * i.prem;
  const fromSp = Math.min(loss, sp + own);
  return { money, loss, own, fromSp, fromPl: loss - fromSp, nominal: D.nominalOf(i) };
}

const caseDebentureIssue = caseTemplate<DebCase>({
  id: 'case-ca-debenture-issue',
  topicId: TOPIC,
  conceptId: CONCEPT,
  difficulty: 'medium',
  title: 'Debentures with terms of redemption',
  setup: (rng) => {
    const [at, redeemAtPremium] = rng.pick(LOSS_CASES);
    const base = D.drawLot(rng, at, redeemAtPremium);
    const when = rng.int(0, 3) === 0 ? { month: 'April', months: 12, nextYear: undefined } : rng.pick(D.ISSUE_DATES);
    const rate = D.wholeRate(rng, D.nominalOf(base), [when.months]);
    if (rate === null) return null;
    const i: DebIssue = { ...base, rate };
    const y = rng.int(2023, 2025);
    const years = rng.int(4, 8);
    const { loss } = debFigures(i, 0);
    // An issue at a premium brings its own Securities Premium: an opening balance is there in a third of the seeds.
    const sp = at === 'premium' ? rng.pick([0, 0, 1]) * rng.step(10000, 60000, 10000) : D.drawPremiumBalance(rng, loss);
    const what = i.red > 0 ? 'loss' : 'discount';
    const text = [
      `On 1 ${when.month} ${when.nextYear ? y + 1 : y}, ${rng.pick(D.COMPANIES)} allotted ${D.lot(i)} ${D.issueTerms(rng, i)}, ${D.redTerms(i, years)}. The whole issue price had been received with the applications and stood in Debenture Application and Allotment A/c.`,
      i.red > 0
        ? `The premium payable on redemption is provided for on allotment, and the whole loss on the issue (${i.disc > 0 ? 'the discount and that premium' : 'that premium'}) is debited to ${D.LOSS_AC}.`
        : `The discount on the issue is debited to ${D.DISCOUNT_AC}.`,
      `The ${what} is written off on 31 March ${y + 1}, at the end of the year of allotment: first from Securities Premium${i.prem > 0 ? ' (the premium received on this issue included)' : ''}, then from the Statement of Profit and Loss as a finance cost. Before this issue Securities Premium A/c ${sp > 0 ? `had a balance of ${inr(sp)}` : 'had no balance'}.`,
      'Interest is payable half-yearly on 30 September and 31 March, and the accounting year ends on 31 March.',
    ].join('\n');
    const c: DebCase = { text, i, years, y, month: when.month, months: when.months, sp };
    debKept.keep(text, c);
    return c;
  },
  context: (c) => c.text,
  parts: [
    {
      kind: 'numeric',
      unit: 'rupees',
      make: (c) => {
        const { i, years } = c;
        const { loss, money, nominal } = debFigures(i, c.sp);
        const name = i.red > 0 ? D.LOSS_AC : D.DISCOUNT_AC;
        const errs: [number, string][] =
          i.red === 0
            ? [
                [money, 'Gave the money received on the issue; the discount is the part of the nominal value that was not received.'],
                [i.disc, 'Gave the discount on one debenture; multiply it by the number of debentures.'],
                [nominal, 'Gave the nominal value, which is credited to the debentures account.'],
                [loss / years, `Recorded one year's share of the discount; the whole discount is debited when the debentures are allotted.`],
              ]
            : i.disc > 0
              ? [
                  [i.n * i.disc, 'Counted only the discount; the premium payable on redemption is also a loss on the issue.'],
                  [i.n * i.red, 'Counted only the premium payable on redemption; the discount allowed on issue is also a loss.'],
                  [i.n * Math.abs(i.red - i.disc), 'Set the discount off against the premium on redemption; the two are added.'],
                ]
              : i.prem > 0
                ? [
                    [i.n * (i.red - i.prem), 'Set the premium received on issue against the premium on redemption; the premium on issue goes to Securities Premium A/c and the loss is recorded in full.'],
                    [i.n * (i.red + i.prem), 'Added the premium received on issue, which is a gain, to the loss.'],
                    [i.n * i.prem, 'Gave the premium received on issue, which is credited to Securities Premium A/c.'],
                    [i.n * (i.face + i.red), 'Gave the whole amount payable on redemption; the loss is only the premium.'],
                  ]
                : [
                    [nominal + loss, 'Gave the whole amount payable on redemption; the loss is only the premium.'],
                    [i.red, 'Gave the premium on one debenture; multiply it by the number of debentures.'],
                    [loss * years, 'Multiplied the premium by the number of years; it is payable once, on redemption.'],
                  ];
        const num = D.numeric(loss, errs);
        return num && {
          prompt: `What amount is debited to ${name} on the allotment?`,
          ...num,
          explanation:
            i.red === 0
              ? [`Discount = ${D.pctOf(i, i.disc)}% of ${inr(i.face)} = ${inr(i.disc)} a debenture; ${D.count(i.n)} x ${inr(i.disc)} = ${inr(loss)}.`, `It is debited to ${D.DISCOUNT_AC} when the debentures are allotted.`]
              : [
                  ...(i.disc > 0 ? [`Discount on issue = ${D.count(i.n)} x ${inr(i.disc)} = ${inr(i.n * i.disc)}.`] : []),
                  `Premium payable on redemption = ${D.count(i.n)} x ${inr(i.red)} = ${inr(i.n * i.red)}.`,
                  i.disc > 0 ? `Loss on issue = ${inr(i.n * i.disc)} + ${inr(i.n * i.red)} = ${inr(loss)}.` : `Loss on issue = the premium payable on redemption, ${inr(loss)}.`,
                  ...(i.prem > 0 ? [`The premium received on issue, ${inr(i.n * i.prem)}, is credited to Securities Premium A/c; it is not deducted from the loss.`] : []),
                ],
          hints: D.H.cases,
        };
      },
      // The loss another way: the nominal value less the money received, plus the premium received and the premium payable on redemption.
      verify: (q) => {
        const c = debKept.of(q.context ?? '');
        if (!c) return false;
        const { i } = c;
        return q.answer === rupees(D.nominalOf(i) - i.n * D.priceOf(i) + i.n * i.prem + i.n * i.red);
      },
    },
    {
      kind: 'journal',
      make: (c) => {
        const { i } = c;
        const { money } = debFigures(i, c.sp);
        return {
          prompt: 'Pass the entry for the allotment of the debentures.',
          lines: D.allotmentLines(i, D.DAA, money),
          explanation: [`The money received, ${D.count(i.n)} x ${inr(D.priceOf(i))} = ${inr(money)}, stops being application money: Debenture Application and Allotment A/c is debited and so closed.`, ...D.allotmentSteps(i)],
          distractorAccounts: [D.lossIdOf(i.red === 0), 'bank', 'debentureholders', 'debentureApplication', D.PREM_RED, D.SP],
          hints: D.H.issue,
        };
      },
      // The entry posted: the debentures at their nominal value, the money held cleared, and the books still balanced.
      verify: (q) => {
        const c = debKept.of(q.context ?? '');
        if (!c) return false;
        const { i } = c;
        const { loss, money, nominal, own } = debFigures(i, c.sp);
        return (
          postedIn(q.expected, debentures(i.rate), 'Cr') === nominal &&
          postedIn(q.expected, D.DAA, 'Dr') === money &&
          postedIn(q.expected, D.lossIdOf(i.red > 0), 'Dr') === loss &&
          postedIn(q.expected, D.SP, 'Cr') === own &&
          postedIn(q.expected, D.PREM_RED, 'Cr') === i.n * i.red
        );
      },
    },
    {
      kind: 'mcq',
      make: (c) => {
        const { i, years, sp } = c;
        const { loss, own, fromSp, fromPl } = debFigures(i, sp);
        const what = i.red > 0 ? 'loss' : 'discount';
        const both = (a: number, b: number): string => `${inr(a)} from Securities Premium and ${inr(b)} charged to the Statement of Profit and Loss, both in this year`;
        const allSp = `The whole ${inr(loss)} from Securities Premium, in this year`;
        const allPl = `The whole ${inr(loss)} charged to the Statement of Profit and Loss in this year, as a finance cost`;
        const told = (a: number): string => (a === 0 ? allPl : a === loss ? allSp : both(a, loss - a));
        const correct = told(fromSp);
        // Without the premium received on this issue, Securities Premium would bear only what it had before.
        const withoutOwn = told(Math.min(loss, sp));
        return S.choice(
          `How is the ${what} on the issue written off?`,
          correct,
          [
            [`${inr(loss)} spread over the ${years} years of the debentures, a part each year`, `Spread the ${what} over the life of the debentures; it is written off in full in the year of allotment.`],
            ...(correct !== allPl ? [[allPl, 'Charged it all to the Statement of Profit and Loss and left Securities Premium untouched; Securities Premium is used first.'] as [string, string]] : []),
            ...(correct === allPl ? [[allSp, 'Wrote it off against Securities Premium, which has no balance to bear it.'] as [string, string]] : []),
            ...(own > 0 && withoutOwn !== correct ? [[withoutOwn, 'Left out the premium received on this very issue; it is in Securities Premium and is used first.'] as [string, string]] : []),
            [`The whole ${inr(loss)} written off against General Reserve`, 'Used General Reserve, a revenue reserve; the rule is Securities Premium first, then the Statement of Profit and Loss.'],
            [`Shown as an asset until the debentures are redeemed after ${years} years`, `Carried the ${what} forward; it is written off in full in the year of allotment.`],
          ],
          `The whole ${inr(loss)} is written off in the year of allotment. ${sp + own === 0 ? 'Securities Premium A/c has no balance.' : `Securities Premium available = ${sp > 0 && own > 0 ? `${inr(sp)} + ${inr(own)} received on this issue = ${inr(sp + own)}` : own > 0 ? `the ${inr(own)} received on this issue` : inr(sp)}.`} ${fromPl === 0 ? `It bears the whole ${what}.` : fromSp === 0 ? `Nothing can be borne by it, so the whole ${inr(loss)} is a finance cost in the Statement of Profit and Loss.` : `It bears ${inr(fromSp)}; the rest, ${inr(fromPl)}, is a finance cost in the Statement of Profit and Loss.`}`,
          D.H.writeOff,
        );
      },
      verify: (q) => {
        const c = debKept.of(q.context ?? '');
        if (!c) return false;
        const { i, sp } = c;
        const loss = i.n * (i.disc + i.red);
        const fromSp = Math.min(loss, sp + i.n * i.prem);
        const text = optionText(q) ?? '';
        return fromSp === 0 ? text.includes('charged to the Statement') && !text.includes('from Securities Premium') : text.startsWith(fromSp === loss ? `The whole ${inr(loss)} from Securities Premium` : `${inr(fromSp)} from Securities Premium and ${inr(loss - fromSp)} charged`);
      },
    },
    {
      kind: 'numeric',
      unit: 'rupees',
      make: (c) => {
        const { i, months, month } = c;
        const { nominal, money } = debFigures(i, c.sp);
        const annual = (nominal * i.rate) / 100;
        const interest = (annual * months) / 12;
        const num = D.numeric(interest, [
          ...(months < 12 ? ([[annual, `Charged a full year although the debentures were outstanding for ${months} months.`], [(annual * (12 - months)) / 12, 'Counted the months before the allotment instead of the months after it.']] as [number, string][]) : []),
          ...(money !== nominal ? [[(money * i.rate * months) / 1200, 'Worked the interest on the issue price; interest is on the nominal value.'] as [number, string]] : []),
          ...(i.red > 0 ? [[((nominal + i.n * i.red) * i.rate * months) / 1200, 'Worked the interest on the amount payable on redemption; interest is on the nominal value.'] as [number, string]] : []),
          [(annual * (months - 1)) / 12, 'Left out the month of allotment when counting the months.'],
          [annual / 2, 'Took the interest of one half-year only.'],
        ]);
        return num && {
          prompt: `What is the interest on the debentures for the year ended 31 March ${c.y + 1}?`,
          ...num,
          explanation: [
            `Nominal value = ${D.count(i.n)} x ${inr(i.face)} = ${inr(nominal)}; interest for a full year at ${i.rate}% = ${inr(annual)}.`,
            months < 12 ? `From 1 ${month} to 31 March is ${months} months: ${inr(annual)} x ${months}/12 = ${inr(interest)}.` : `The debentures were outstanding for the whole year: ${inr(interest)}.`,
          ],
          hints: D.H.interest,
        };
      },
      verify: (q) => {
        const c = debKept.of(q.context ?? '');
        return !!c && q.answer * 12 === c.i.n * c.i.face * c.i.rate * c.months;
      },
    },
  ],
});

// ===============================================================================================================
// 5. case-ca-collateral: debentures given to a bank as collateral security for a long-term loan (short parts). The
//    company passes no entry for them, or records them through Debenture Suspense A/c: the case says which. The
//    loan is taken during the year or at its start; in two seeds of three the company also has debentures issued to
//    the public earlier. Asked: how the debentures are recorded, the interest of the year, what stands under
//    Long-term borrowings, and how the loan and the debentures are disclosed.
// ===============================================================================================================

interface CollateralCase {
  text: string;
  /** 1: no entry for the debentures; 2: through Debenture Suspense A/c. */
  method: 1 | 2;
  loan: number;
  loanRate: number;
  rate: number;
  nominal: number;
  month: string;
  months: number;
  y: number;
  other: { rate: number; amount: number } | null;
}
const collateralKept = keepFor<CollateralCase>();

const caseCollateral = caseTemplate<CollateralCase>({
  id: 'case-ca-collateral',
  topicId: TOPIC,
  conceptId: CONCEPT,
  difficulty: 'easy',
  title: 'Debentures as collateral security',
  setup: (rng) => {
    const y = rng.int(2023, 2025);
    const rate = rng.pick(D.RATES);
    const loan = rng.step(500000, 4000000, 100000);
    const nominal = (loan * rng.pick([120, 125, 130, 150])) / 100;
    const when = rng.int(0, 2) === 0 ? { month: 'April', months: 12, nextYear: undefined } : rng.pick(D.ISSUE_DATES);
    // A loan rate at which the interest for the months of the year is in whole rupees.
    const rates = [8, 9, 10, 11, 12, 13].filter((r) => r !== rate && (loan * r * when.months) % 1200 === 0);
    if (rates.length === 0) return null;
    const loanRate = rng.pick(rates);
    const method = rng.int(0, 1) === 0 ? 1 : 2;
    const other = rng.int(0, 2) > 0 ? { rate: rng.pick(D.RATES.filter((r) => r !== rate)), amount: rng.step(200000, 1500000, 100000) } : null;
    const text = [
      `On 1 ${when.month} ${when.nextYear ? y + 1 : y}, ${rng.pick(D.COMPANIES)} took a loan of ${inr(loan)} from its bank at ${loanRate}% a year, repayable in one sum after ${rng.int(3, 6)} years. As collateral security for the loan it gave the bank its own ${rate}% Debentures of ${inr(nominal)}.`,
      method === 1 ? 'The company passes no entry in its books for debentures issued as collateral security.' : 'The company records debentures issued as collateral security in its books, through Debenture Suspense A/c.',
      ...(other ? [`It also has ${other.rate}% Debentures of ${inr(other.amount)}, issued to the public at par in an earlier year and redeemable in ${y + 4}.`] : []),
      `The interest on the loan for the year was paid on 31 March ${y + 1}, and the company has kept to the terms of the loan. Its accounting year ends on 31 March.`,
    ].join('\n');
    const c: CollateralCase = { text, method, loan, loanRate, rate, nominal, month: when.month, months: when.months, y, other };
    collateralKept.keep(text, c);
    return c;
  },
  context: (c) => c.text,
  parts: [
    {
      kind: 'mcq',
      make: (c) => {
        const { rate, nominal, loan } = c;
        // How the loan is then shown is the last question: this one asks only for the entry, or that there is none.
        const none = 'No entry is passed for them in the books of the company';
        const suspense = `Debenture Suspense A/c Dr; To ${rate}% Debentures A/c, with ${inr(nominal)}`;
        return S.choice(
          'How does the company record the debentures given to the bank?',
          c.method === 1 ? none : suspense,
          [
            c.method === 1 ? [suspense, 'Passed the entry of the second method; this company passes no entry for such debentures.'] : [none, 'Passed no entry; this company records such debentures through Debenture Suspense A/c.'],
            [`Bank A/c Dr; To ${rate}% Debentures A/c, with ${inr(nominal)}`, 'Treated the debentures as an issue for cash; no money is received for them.'],
            [`Bank A/c Dr; To ${rate}% Debentures A/c, with ${inr(loan)}`, 'Recorded the money borrowed as an issue of debentures; it is a bank loan, and the debentures only secure it.'],
            [`Loss on Issue of Debentures A/c Dr; To ${rate}% Debentures A/c, with ${inr(nominal)}`, 'Treated the debentures given as a loss; they are only a security, and nothing is lost on them.'],
          ],
          c.method === 1
            ? `Under the method this company follows no entry is passed: the debentures create a liability only if the company fails to repay the loan. Only the loan of ${inr(loan)} is recorded.`
            : `Under the second method the debentures are recorded, but against a suspense account: Debenture Suspense A/c Dr; To ${rate}% Debentures A/c, ${inr(nominal)}. No money is received, so Bank A/c is not touched.`,
          D.H.collateral,
        );
      },
      verify: (q) => {
        const c = collateralKept.of(q.context ?? '');
        if (!c) return false;
        const text = optionText(q) ?? '';
        return c.method === 1 ? text.startsWith('No entry') : text.startsWith('Debenture Suspense A/c Dr') && text.endsWith(inr(c.nominal));
      },
    },
    {
      kind: 'numeric',
      unit: 'rupees',
      make: (c) => {
        const { loan, loanRate, rate, nominal, months, month } = c;
        const of = (base: number, r: number, m = months): number => (base * r * m) / 1200;
        const interest = of(loan, loanRate);
        const num = D.numeric(interest, [
          [of(nominal, rate), 'Worked interest on the debentures given as collateral security; no interest is payable on them.'],
          [interest + of(nominal, rate), 'Added interest on the collateral debentures to the interest on the loan; only the loan carries interest.'],
          [of(nominal, loanRate), 'Applied the loan rate to the debentures; interest is on the amount borrowed.'],
          [of(loan, rate), 'Applied the debenture rate to the loan; the loan carries its own rate.'],
          ...(months < 12 ? [[of(loan, loanRate, 12), `Charged a full year although the loan was taken on 1 ${month}.`] as [number, string]] : []),
        ]);
        return num && {
          prompt: `How much interest does the company pay the bank for the year ended 31 March ${c.y + 1}?`,
          ...num,
          explanation: [
            'Debentures given as collateral security carry no interest: the bank earns interest on the loan alone.',
            `Interest = ${inr(loan)} x ${loanRate}% x ${months}/12 = ${inr(interest)}${months < 12 ? `, for the ${months} months from 1 ${month}` : ''}.`,
          ],
          hints: D.H.collateral,
        };
      },
      verify: (q) => {
        const c = collateralKept.of(q.context ?? '');
        const [loan, rate] = figuresIn(q.context ?? '', /took a loan of ₹([\d,]+) from its bank at (\d+)% a year/);
        return !!c && loan === c.loan && q.answer * 1200 === rupees(loan * rate * c.months);
      },
    },
    {
      kind: 'numeric',
      unit: 'rupees',
      make: (c) => {
        const { loan, nominal, other } = c;
        const rest = other ? other.amount : 0;
        const num = D.numeric(loan + rest, [
          [loan + rest + nominal, 'Counted the collateral debentures as a debt beside the loan; they only secure it.'],
          [nominal + rest, 'Showed the debentures in place of the loan; the company owes the bank what it borrowed.'],
          ...(other ? ([[loan, `Left out the ${other.rate}% Debentures issued to the public, which are a long-term borrowing too.`], [rest, 'Left out the bank loan.']] as [number, string][]) : []),
          [nominal - loan, 'Gave the margin by which the debentures exceed the loan.'],
        ]);
        return num && {
          prompt: `What amount does the company show under Long-term borrowings in its Balance Sheet as at 31 March ${c.y + 1}?`,
          ...num,
          explanation: [
            `The bank loan, ${inr(loan)}, is repayable after more than a year: it is a long-term borrowing.`,
            c.method === 1
              ? `No entry was passed for the ${c.rate}% Debentures of ${inr(nominal)}, so they add nothing.`
              : `The ${c.rate}% Debentures of ${inr(nominal)} are shown, but Debenture Suspense A/c of ${inr(nominal)} is deducted from them: together they add nothing.`,
            ...(other ? [`The ${other.rate}% Debentures issued to the public, ${inr(other.amount)}, are a long-term borrowing as well.`] : []),
            `Long-term borrowings = ${other ? `${inr(loan)} + ${inr(other.amount)} = ` : ''}${inr(loan + rest)}.`,
          ],
          hints: ['Count what the company actually owes: the money borrowed and the debentures sold to the public.', 'Collateral debentures add nothing to the borrowings: either no entry is passed, or Debenture Suspense is deducted from them.'],
        };
      },
      // From the printed case: the loan, and the debentures issued to the public, if any.
      verify: (q) => {
        const [loan] = figuresIn(q.context ?? '', /took a loan of ₹([\d,]+)/);
        const [other] = figuresIn(q.context ?? '', /% Debentures of ₹([\d,]+), issued to the public/);
        return loan > 0 && q.answer === rupees(loan + (other ?? 0));
      },
    },
    {
      kind: 'mcq',
      make: (c) => {
        const { rate, nominal, loan } = c;
        const noted = `Bank loan ${inr(loan)}, described as secured by ${rate}% Debentures of ${inr(nominal)} issued as collateral security; the debentures are not shown as a debt`;
        const deducted = `${rate}% Debentures ${inr(nominal)} less Debenture Suspense ${inr(nominal)}, and the bank loan ${inr(loan)}, described as secured by those debentures`;
        return S.choice(
          'How are the loan and these debentures shown in the note on Long-term borrowings?',
          c.method === 1 ? noted : deducted,
          [
            c.method === 1
              ? [deducted, 'Showed the debentures and a suspense account; this company passed no entry for them, so neither has a balance.']
              : [noted, 'Left the debentures out of the note; this company recorded them, so their balance is shown with Debenture Suspense deducted from it.'],
            [`${rate}% Debentures ${inr(nominal)} and the bank loan ${inr(loan)}, together ${inr(loan + nominal)}`, 'Counted the security as a second debt beside the loan.'],
            [`Bank loan ${inr(loan)} alone, with no mention of the debentures`, 'Left out the disclosure; the note must say that the loan is secured by the debentures.'],
            [`${rate}% Debentures ${inr(nominal)} under Long-term borrowings, and Debenture Suspense ${inr(nominal)} among the assets`, 'Showed the suspense account as an asset; it is deducted from the debentures, and the loan must be shown too.'],
          ],
          c.method === 1
            ? `No entry was passed for the debentures, so only the loan of ${inr(loan)} is shown, with the fact that it is secured by ${rate}% Debentures of ${inr(nominal)} given as collateral security.`
            : `The debentures were recorded against Debenture Suspense A/c. The note shows the debentures of ${inr(nominal)} less Debenture Suspense of ${inr(nominal)}, which comes to nothing, and the loan of ${inr(loan)} secured by them.`,
          ['A note to the loan must say how it is secured.', 'Under the second method the debentures appear, with Debenture Suspense deducted from them, so that no extra liability is shown.'],
        );
      },
      verify: (q) => {
        const c = collateralKept.of(q.context ?? '');
        if (!c) return false;
        const text = optionText(q) ?? '';
        return c.method === 1 ? text.startsWith('Bank loan') && text.includes('secured by') && !text.includes('alone') : text.includes('less Debenture Suspense') && text.includes(`bank loan ${inr(c.loan)}`);
      },
    },
  ],
});

// ===============================================================================================================
// CHAINED CASES
// ===============================================================================================================

/** "To Bank A/c ₹50,000": a row as the working of a format quotes it. */
const quoted = (prefix: 'To' | 'By', label: string, n: number): string => `"${prefix} ${label} ${inr(n)}"`;
const shareWord = (s: { kind: string; face: number }, x: number): string => `${cnt(x)} ${s.kind} shares of ${inr(s.face)} each`;
/** The figure of a row of a statement by its particulars, in paise (the last column); 0 when there is no such row. */
const figureOf = (q: StatementQuestion, label: string): number => q.rows.find((r) => r.label === label)?.amounts.at(-1) ?? 0;
/** The figures of the sub-totals of a statement, in order (the last column). */
const subtotalsOf = (q: StatementQuestion): number[] => (q.lines ?? []).flatMap((line) => ('subtotal' in line ? [line.amounts.at(-1) ?? 0] : []));
/** The entries of a set are these lines, one for one and in order. */
const entriesAre = (q: JournalSetQuestion, lines: readonly JournalLine[][]): boolean => q.entries.length === lines.length && q.entries.every((e, i) => S.sameEntry(e.expected, lines[i]));

// ===============================================================================================================
// 6. case-ca-chain-issue: an issue of shares from the applications to the last call, with one holder who does not
//    pay a call (chained). The set of its entries, then its Bank A/c, then the Note to Accounts on Share Capital. The
//    issue is exactly subscribed, under-subscribed (90% at least), over-subscribed with applications refused, or
//    allotted pro rata (with or without refusals); at par or at a premium on allotment; in three or four
//    instalments; a Calls in Arrears A/c is kept or not; in some seeds another holder pays the last call in advance.
//    The holder in arrears fails a call only, so that the arrears are capital alone and the note deducts them from
//    the shares not fully paid. Nothing is forfeited.
// ===============================================================================================================

interface IssueChain {
  text: string;
  f: ScFloat;
  story: ScStep[];
  dates: string[];
  y: number;
  registered: number;
}
const issueKept = keepFor<IssueChain>();

/** What a set names each entry of a story by: short, and without its figures (the case text has them). */
function stepTitle(f: ScFloat, st: ScStep): string {
  const s = f.s;
  const count = s.parts.length;
  const last = count - 1;
  switch (st.kind) {
    case 'applied':
      return 'Application money received.';
    case 'allotted':
      return f.pro || f.refused > 0 ? 'Shares allotted; all the application money dealt with.' : 'Shares allotted; the application money transferred.';
    case 'due':
      return st.i === 1 ? 'Allotment money due.' : `${S.cap(S.stageName(st.i, count))} made.`;
    case 'received': {
      const late = f.bad.filter((d) => S.unpaidOn(f, d, st.i) > 0);
      const name = st.i === 1 ? 'Allotment money' : `${S.cap(S.stageName(st.i, count))} money`;
      return late.length > 0 ? `${name} received, except from ${late.map((d) => d.who).join(' and ')}.` : `${name} received.`;
    }
    case 'advance':
      return `${f.ahead!.who} paid ${S.stage(last, count)} in advance.`;
    case 'adjusted':
      return `${f.ahead!.who}'s advance set against ${S.stage(last, count)}.`;
    case 'forfeited':
      return `${f.bad[st.x].who}'s shares forfeited.`;
    case 'reissued':
      return f.lots.length === 1 ? 'Forfeited shares reissued.' : st.x === 0 ? 'First reissue of forfeited shares.' : 'Second reissue of forfeited shares.';
    case 'reserve':
      return f.lots.length === 1 ? 'Gain on the reissue transferred to Capital Reserve.' : st.x === 0 ? 'Gain on the first reissue transferred to Capital Reserve.' : 'Gain on the second reissue transferred to Capital Reserve.';
  }
}

/** How an issue was taken up, for the case text: exactly, under-subscribed, with applications refused, or pro rata. */
function subscribedLine(f: ScFloat): string {
  if (f.pro) {
    return `Applications were received for ${cnt(S.allApplied(f))} shares. ${f.refused > 0 ? `The applications for ${cnt(f.refused)} shares were refused and the money on them returned; the` : 'The'} ${cnt(f.n)} shares were allotted pro rata to the ${f.refused > 0 ? 'other ' : ''}applicants. ${S.proRule(f.s)}`;
  }
  if (f.refused > 0) return `Applications were received for ${cnt(S.allApplied(f))} shares: the applications for ${cnt(f.refused)} shares were refused and the money on them returned, and the other applicants were allotted the ${cnt(f.n)} shares in full.`;
  return f.n < f.offered ? `Applications were received for ${cnt(f.n)} shares only, and all of them were allotted.` : 'The issue was fully subscribed and every share was allotted.';
}

const caseChainIssue = caseTemplate<IssueChain>({
  id: 'case-ca-chain-issue',
  topicId: TOPIC,
  conceptId: CONCEPT,
  difficulty: 'complex',
  title: 'An issue of shares with calls in arrears',
  setup: (rng) => {
    const count = rng.pick([3, 3, 4] as const);
    const s = S.drawTerms(rng, count, rng.int(0, 2) > 0);
    s.arrears = rng.int(0, 1) === 0;
    const sub = rng.pick(['exact', 'under', 'refused', 'pro', 'pro'] as const);
    const pro = sub === 'pro' ? S.drawRatio(rng, s) : null;
    if (sub === 'pro' && !pro) return null;
    const lot = pro ? pro.b * 100 : 100;
    const offered = pro ? S.proIssue(rng, pro) : rng.step(20000, 150000, 10000);
    const n = sub === 'under' ? offered - (offered * rng.pick([2, 4, 5, 8, 10])) / 100 : offered;
    const refused = sub === 'refused' || (sub === 'pro' && rng.int(0, 1) === 0) ? rng.step(2000, 20000, 1000) : 0;
    const [w1, w2] = rng.shuffle(S.HOLDERS);
    const k = S.holding(rng, n, lot, 1, 9);
    // A call only: the arrears are then capital alone, and the premium (with the allotment money) was received.
    const from = count === 4 ? rng.pick([2, 3]) : 2;
    // A holder paying the last call early, where the set stays within eight entries.
    const ahead = count === 3 && rng.int(0, 2) === 0 ? { who: w2, m: S.holding(rng, n, lot, 1, 9) } : undefined;
    const d: ScDefaulter = { who: w1, k, applied: pro ? (k * pro.a) / pro.b : k, from, forfeited: false };
    const f = S.seal({ co: rng.pick(S.COMPANIES), s, offered, n, refused, pro, bad: [d], lots: [], ...(ahead ? { ahead } : {}) });
    if (!f) return null;
    const story = S.stepsOf(f);
    const y = rng.int(2022, 2025);
    const dates = S.datesFor(rng, story, 3, y);
    const registered = offered * rng.pick([2, 3, 4, 5]);
    const last = count - 1;
    const text = [
      `${f.co} was formed in April ${y}, registered with a capital of ${inr(registered * s.face)} divided into ${shareWord(s, registered)}.`,
      S.offerOf(f, 'It'),
      subscribedLine(f),
      ...(ahead ? [`${ahead.who}, who ${pro ? 'was allotted' : 'holds'} ${cnt(ahead.m)} shares, paid ${S.stage(last, count)} together with the allotment money.`] : []),
      `${d.who}, who ${pro ? 'was allotted' : 'holds'} ${cnt(k)} shares, did not pay ${S.dues(s, from)}. Every other amount called was received.`,
      `Every call was made before 31 March ${y + 1}. ${S.arrearsRule(s)}`,
      `All money is received and paid through the bank, and up to 31 March ${y + 1} the company had no other dealings with the bank.`,
    ].join('\n');
    const c: IssueChain = { text, f, story, dates, y, registered };
    issueKept.keep(text, c);
    return c;
  },
  context: (c) => c.text,
  parts: [
    {
      kind: 'journal_set',
      make: (c) => ({
        task: 'Pass the journal entries for the issue, from the applications to the last call.',
        transactions: c.story.map((st, i) => ({ date: c.dates[i], text: stepTitle(c.f, st), lines: st.lines, explanation: st.explanation })),
        hints: [S.H.issue[1], 'The money received on a call is what was called less what the holder in arrears did not pay; the arrears stay unpaid as the case says.'],
        distractorAccounts: ['forfeitedShares', 'capitalReserve', 'securitiesPremium', c.f.s.arrears ? 'callsInAdvance' : 'callsInArrears', 'callsInAdvance'],
      }),
      // The entries are the story, one for one, and the story is what the books of the issue give holder by holder.
      verify: (q) => {
        const c = issueKept.of(q.context ?? '');
        return !!c && entriesAre(q, c.story.map((st) => st.lines)) && S.storyHolds(c.f, c.story);
      },
    },
    {
      kind: 'account',
      make: (c) => {
        const { f, story, dates, y } = c;
        const s = f.s;
        const count = s.parts.length;
        const end = `31 March ${y + 1}`;
        const reopen = `1 April ${y + 1}`;
        const d = f.bad[0];
        const arrears = S.unpaidAll(f, d);
        const balance = f.n * (s.face + s.premium) - arrears;
        const explanation: string[] = [];
        for (const st of story) {
          const amount = (st.lines.find((l) => l.accountId === 'bank')?.amount ?? 0) / 100;
          const opposite = ac(S.stageId(s.kind, st.i, count));
          if (st.kind === 'applied') explanation.push(`${st.explanation[0]} Row: ${quoted('To', opposite, amount)}.`);
          else if (st.kind === 'allotted')
            explanation.push(
              f.refused > 0
                ? `On allotment the money on the ${cnt(f.refused)} shares refused is paid back: ${cnt(f.refused)} x ${inr(S.payable(s, 0))} = ${inr(amount)}. Row: ${quoted('By', opposite, amount)}. The rest of the application money stays in the bank${f.pro ? ', the excess of the pro rata allotment with it' : ''}: it is only moved between accounts.`
                : `The allotment entry only moves the application money between accounts${f.pro ? ', the excess of the pro rata allotment with it' : ''}: no money passes through the bank, so it has no row.`,
            );
          else if (st.kind === 'received') explanation.push(`${st.explanation.slice(0, -1).join(' ')} Row: ${quoted('To', opposite, amount)}.`);
          else if (st.kind === 'advance') explanation.push(`${st.explanation[0]} Row: ${quoted('To', 'Calls in Advance A/c', amount)}. It is money received, though it is not capital until the call is made.`);
          else if (st.kind === 'adjusted') explanation.push(`When ${S.stage(count - 1, count)} is made, ${f.ahead!.who}'s advance is set against it by a transfer from Calls in Advance A/c. No money moves, so the Bank A/c has no row for it.`);
        }
        explanation.push(
          'An instalment falling due brings in no money: only its receipt is entered in the Bank A/c.',
          `The debit side is larger by ${inr(balance)}: ${quoted('By', 'Balance c/d', balance)} on ${end}, brought down as ${quoted('To', 'Balance b/d', balance)} on ${reopen}.`,
          `Check: ${cnt(f.n)} shares at the issue price of ${inr(s.face + s.premium)} = ${inr(f.n * (s.face + s.premium))}, less the ${inr(arrears)} that ${d.who} has not paid = ${inr(balance)}.`,
        );
        return {
          task: `Prepare the Bank A/c of ${f.co} for the year ended ${end}, balance it and bring the balance down on ${reopen}.`,
          title: 'Bank A/c',
          ...ledgerSides(accountOf(story.map((st, i): DatedEntry => ({ date: dates[i], lines: st.lines })), 'bank'), { closeOn: end, reopenOn: reopen }),
          distractors: ['Bank A/c', ac(S.capitalId(s.kind)), 'Securities Premium A/c', 'Calls in Arrears A/c', 'Calls in Advance A/c'],
          explanation,
          hints: ['Enter only what passes through the bank: money received on each instalment and money paid back. An instalment falling due is not a receipt.', 'Money received on allotment = allotment money due - excess application money already held.'],
        };
      },
      // The balance another way: every share allotted at its issue price, less what is in arrears; it is what the
      // books of the issue leave in the bank, what the rows leave, and what is carried down and brought down.
      verify: (q) => {
        const c = issueKept.of(q.context ?? '');
        if (!c) return false;
        const { f } = c;
        const paidIn = rupees(f.n * (f.s.face + f.s.premium) - S.unpaidAll(f, f.bad[0]));
        const [left, right] = q.sides;
        const closing = right.rows.filter((r) => r.closing);
        const total = (rows: typeof left.rows): number => sum(rows.map((r) => r.amounts[0] ?? 0));
        return (
          S.net(S.books(f.s).ledger, 'bank') === paidIn &&
          closing.length === 1 &&
          closing[0].amounts[0] === paidIn &&
          total(left.rows) - total(right.rows.filter((r) => !r.closing)) === paidIn &&
          left.below.length === 1 &&
          left.below[0].amounts[0] === paidIn &&
          right.below.length === 0
        );
      },
    },
    {
      kind: 'statement',
      make: (c) => {
        const { f, registered, y } = c;
        const s = f.s;
        const d = f.bad[0];
        const end = `31 March ${y + 1}`;
        const shares = `Equity shares of ${inr(s.face)} each`;
        const arrears = S.unpaidAll(f, d);
        const fully = f.n - d.k;
        const partly = d.k * s.face - arrears;
        const total = fully * s.face + partly;
        const count = s.parts.length;
        const owed = s.parts.flatMap((_, i) => (S.unpaidOn(f, d, i) > 0 ? [`${i === 1 ? 'allotment money' : S.stageName(i, count)} ${cnt(d.k)} x ${inr(s.parts[i])}`] : []));
        return {
          task: `Prepare the Note to Accounts on Share Capital of ${f.co} as at ${end}. Enter a number of shares only in the rows for shares, and show a deduction with a minus sign.`,
          title: `Note to Accounts: Share Capital of ${f.co} as at ${end}`,
          columns: [{ name: 'Number of shares', unit: 'number', adds: false }, { name: 'Amount (₹)', signed: true }],
          rows: [
            { heading: 'Authorised capital' },
            { label: shares, amounts: [registered, rupees(registered * s.face)] },
            { heading: 'Issued capital' },
            { label: shares, amounts: [f.offered, rupees(f.offered * s.face)] },
            { heading: 'Subscribed capital' },
            { heading: 'Subscribed and fully paid' },
            { label: shares, amounts: [fully, rupees(fully * s.face)] },
            { heading: 'Subscribed but not fully paid' },
            { label: shares, amounts: [d.k, rupees(d.k * s.face)], details: [`${inr(s.face)} a share called up`] },
            { label: 'Calls in arrears', amounts: [0, -rupees(arrears)] },
            { subtotal: 'Subscribed but not fully paid, less calls in arrears', amounts: [0, rupees(partly)], sum: 'section' },
            { subtotal: 'Total share capital', amounts: [0, rupees(total)] },
          ],
          distractors: ['Calls in advance', 'Amount originally paid up', 'Securities premium', 'Capital reserve', 'Reserve capital', 'Preference shares of ₹100 each'],
          explanation: [
            `Authorised capital is what the company is registered with: ${cnt(registered)} shares, ${inr(registered * s.face)}.`,
            `Issued capital is the face value of the shares offered: ${cnt(f.offered)} shares, ${inr(f.offered * s.face)}${f.n < f.offered ? `, although only ${cnt(f.n)} were taken up` : ''}. Neither figure is added into the total.`,
            `Every call has been made, so a share is fully paid unless something on it is unpaid: ${cnt(f.n)} allotted - ${cnt(d.k)} in arrears = ${cnt(fully)} shares x ${inr(s.face)} = ${inr(fully * s.face)}.`,
            `${d.who}'s ${cnt(d.k)} shares are subscribed but not fully paid: called up ${cnt(d.k)} x ${inr(s.face)} = ${inr(d.k * s.face)}, less calls in arrears (${owed.join(', ')}) = ${inr(arrears)}, is ${inr(partly)}.${s.arrears ? '' : ' The company keeps no Calls in Arrears A/c, but the unpaid calls are deducted in the note all the same.'}`,
            `Total share capital = ${inr(fully * s.face)} + ${inr(partly)} = ${inr(total)}.${s.premium > 0 ? ' Securities premium is shown under Reserves and Surplus, not here.' : ''}${f.ahead ? ` ${f.ahead.who}'s advance was set against the call when it was made, so no calls in advance are left.` : ''}`,
          ],
          hints: S.H.note,
        };
      },
      // The total another way, from the accounting equation: the bank holds the share capital and the premium. And the
      // shares counted in the parts of the note are the shares allotted.
      verify: (q) => {
        const c = issueKept.of(q.context ?? '');
        if (!c) return false;
        const { ledger } = S.books(c.f.s);
        const total = subtotalsOf(q).at(-1);
        const counted = sum(q.rows.slice(2).map((r) => r.amounts[0] ?? 0));
        return total === S.net(ledger, 'bank') + S.net(ledger, 'securitiesPremium') && counted === c.f.n && q.rows[1].amounts[0] === c.f.offered;
      },
    },
  ],
});

// ===============================================================================================================
// 7. case-ca-chain-forfeiture: shares forfeited and reissued (chained). The set of the forfeiture and reissue
//    entries, then Forfeited Shares A/c, then the share capital and reserves in the balance sheet with their two
//    notes. Either one holder's shares, reissued in two lots at two prices, or the shares of two holders forfeited
//    on separate dates and reissued one holder at a time; what was received on shares not yet reissued is left in
//    Forfeited Shares A/c, and in some seeds none is left. Where the issue carried a premium every forfeited holder
//    had paid the allotment money, so the premium was received on every share and stays in Securities Premium.
// ===============================================================================================================

interface ForfeitChain {
  text: string;
  f: ScFloat;
  story: ScStep[];
  tail: ScStep[];
  dates: string[];
  y: number;
  registered: number;
}
const forfeitChainKept = keepFor<ForfeitChain>();
const FORFEITED_ROW = 'Forfeited shares (amount originally paid up)';

const caseChainForfeiture = caseTemplate<ForfeitChain>({
  id: 'case-ca-chain-forfeiture',
  topicId: TOPIC,
  conceptId: CONCEPT,
  difficulty: 'complex',
  title: 'Forfeited shares reissued in lots',
  setup: (rng) => {
    const shape = rng.pick(['lots', 'holders'] as const);
    const count = rng.pick([3, 3, 4] as const);
    const s = S.drawTerms(rng, count, rng.int(0, 2) > 0);
    const last = count - 1;
    const unit = s.face / 10;
    s.arrears = rng.int(0, 1) === 0;
    const offered = rng.step(20000, 150000, 10000);
    const n = rng.int(0, 2) === 0 ? offered - (offered * rng.pick([2, 4, 5, 8, 10])) / 100 : offered;
    const [w1, w2] = rng.shuffle(S.HOLDERS);
    const lowest = s.premium > 0 ? 2 : 1;
    const per = (from: number): number => sum(s.parts.slice(0, from));
    const holder = (who: string, k: number, from: number): ScDefaulter => ({ who, k, applied: k, from, forfeited: true });
    /** Two prices for two lots: a discount within `room`, then the face value or another discount within `other`. */
    const prices = (room: number, other: number): number[] => {
      const first = rng.int(1, room);
      const second = rng.int(0, 3) === 0 ? 0 : rng.int(1, other);
      return [s.face - unit * first, s.face - unit * (second === first && other === room ? 0 : second)];
    };
    let bad: ScDefaulter[];
    let lots: { takes: number[]; price: number }[];
    if (shape === 'lots') {
      const from = rng.int(lowest, last);
      const k = S.holding(rng, n, 100, 4, 20);
      const j = S.partOf(rng, k);
      const [p1, p2] = prices(S.discountRoom(s, per(from)), S.discountRoom(s, per(from)));
      bad = [holder(w1, k, from)];
      lots = [{ takes: [j], price: p1 }, { takes: [rng.int(0, 1) === 0 ? k - j : S.partOf(rng, k - j)], price: p2 }];
    } else {
      // Where the terms allow, the first holder stopped paying earlier than the second, who failed the last call only.
      const from = rng.int(lowest, Math.max(lowest, last - 1));
      const k1 = S.holding(rng, n, 100, 2, 15);
      const k2 = S.holding(rng, n, 100, 2, 15);
      const [p1, p2] = prices(S.discountRoom(s, per(from)), S.discountRoom(s, per(last)));
      bad = [holder(w1, k1, from), holder(w2, k2, last)];
      lots = [{ takes: [k1, 0], price: p1 }, { takes: [0, rng.int(0, 1) === 0 ? k2 : S.partOf(rng, k2)], price: p2 }];
    }
    const f = S.seal({ co: rng.pick(S.COMPANIES), s, offered, n, refused: 0, pro: null, bad, lots });
    if (!f) return null;
    const story = S.stepsOf(f);
    const tail = story.filter((st) => st.kind === 'forfeited' || st.kind === 'reissued' || st.kind === 'reserve');
    const y = rng.int(2022, 2025);
    // Each holder's shares are forfeited on a day of their own.
    const dates = S.datesFor(rng, tail, rng.int(6, 9), y, (st) => st.kind === 'forfeited');
    const view = accountOf(tail.map((st, i): DatedEntry => ({ date: dates[i], lines: st.lines })), 'forfeitedShares');
    // Rows are matched by their particulars and amounts: no two of a side may be alike.
    for (const side of [view.debit, view.credit]) if (new Set(side.map((p) => `${p.label}|${p.amount}`)).size !== side.length) return null;
    const registered = offered * rng.pick([2, 3, 4, 5]);
    const reissueLine = (x: number): string => `${x === 0 ? 'Later' : 'After that'} ${S.lotShares(f, x)} were reissued at ${inr(lots[x].price)} a share, fully paid.`;
    const text = [
      `${f.co} is registered with a capital of ${inr(registered * s.face)} divided into ${shareWord(s, registered)}.`,
      `In April ${y} it offered ${cnt(offered)} of these shares to the public ${S.priced(s)}, payable ${S.terms(s)}. ${n < offered ? `Applications were received for ${cnt(n)} shares only, and all of them were allotted.` : 'The issue was fully subscribed and every share was allotted.'}`,
      `By June ${y} every call had been made. ${bad.map((d) => S.lapse(s, d)).join('; ')}. Every other shareholder paid in full. ${S.arrearsNote(s)}`,
      bad.length > 1 ? `The directors forfeited the shares of ${w1} and of ${w2}, on separate dates.` : `The directors forfeited ${w1}'s shares.`,
      reissueLine(0),
      reissueLine(1),
      `No other forfeited share was reissued up to 31 March ${y + 1}. The gain on each reissue was transferred to Capital Reserve on the day of the reissue.`,
      'The company has no other share capital and no other reserve or surplus, and its accounting year ends on 31 March. A line of the balance sheet or its notes that comes to nil is left out.',
    ].join('\n');
    const c: ForfeitChain = { text, f, story, tail, dates, y, registered };
    forfeitChainKept.keep(text, c);
    return c;
  },
  context: (c) => c.text,
  parts: [
    {
      kind: 'journal_set',
      make: (c) => ({
        task: 'Pass the journal entries for the forfeiture of the shares, their reissue and the transfers to Capital Reserve.',
        transactions: c.tail.map((st, i) => ({ date: c.dates[i], text: stepTitle(c.f, st), lines: st.lines, explanation: st.explanation })),
        hints: [S.H.forfeit[1], S.H.reissue[1]],
        distractorAccounts: ['securitiesPremium', 'capitalReserve', 'bank', c.f.s.arrears ? S.stageId(c.f.s.kind, c.f.s.parts.length - 1, c.f.s.parts.length) : 'callsInArrears', 'generalReserve', 'statementOfProfitAndLoss'],
      }),
      verify: (q) => {
        const c = forfeitChainKept.of(q.context ?? '');
        return !!c && entriesAre(q, c.tail.map((st) => st.lines)) && S.storyHolds(c.f, c.story);
      },
    },
    {
      kind: 'account',
      make: (c) => {
        const { f, tail, dates, y } = c;
        const s = f.s;
        const end = `31 March ${y + 1}`;
        const reopen = `1 April ${y + 1}`;
        const capital = ac(S.capitalId(s.kind));
        const per = (from: number): number => sum(s.parts.slice(0, from));
        const left = f.bad.map((d, x) => d.k - sum(f.lots.map((l) => l.takes[x])));
        const balance = sum(f.bad.map((d, x) => left[x] * per(d.from)));
        const view = accountOf(tail.map((st, i): DatedEntry => ({ date: dates[i], lines: st.lines })), 'forfeitedShares');
        // An account of fewer than four rows asks too little of a chained case.
        if (view.debit.length + view.credit.length + (balance > 0 ? 1 : 0) < 4) return null;
        const explanation: string[] = [];
        for (const st of tail) {
          if (st.kind === 'forfeited') {
            const d = f.bad[st.x];
            explanation.push(
              `${d.who} had paid ${inr(per(d.from))} a share towards capital on ${cnt(d.k)} shares: ${cnt(d.k)} x ${inr(per(d.from))} = ${inr(S.forfeitedOn(f, d))}, which the company keeps. Row: ${quoted('By', capital, S.forfeitedOn(f, d))}.${s.premium > 0 ? ' The premium received on the shares is no part of it: it stays in Securities Premium A/c.' : ''}`,
            );
          } else if (st.kind === 'reissued') {
            const lot = f.lots[st.x];
            const shares = sum(lot.takes);
            const off = (s.face - lot.price) * shares;
            explanation.push(
              off > 0
                ? `${S.cap(S.lotShares(f, st.x))} are reissued at ${inr(lot.price)}: the discount, ${cnt(shares)} x ${inr(s.face - lot.price)} = ${inr(off)}, is met from this account. Row: ${quoted('To', capital, off)}.`
                : `${S.cap(S.lotShares(f, st.x))} are reissued at their face value: there is no discount, and this account has no row for the reissue.`,
            );
          } else {
            const gain = st.lines[0].amount / 100;
            explanation.push(`${st.explanation.slice(0, 2).join(' ')} Row: ${quoted('To', 'Capital Reserve A/c', gain)}.`);
          }
        }
        explanation.push(
          balance > 0
            ? `Left in the account is what was received on the shares not yet reissued: ${f.bad.flatMap((d, x) => (left[x] > 0 ? [`${cnt(left[x])} x ${inr(per(d.from))}`] : [])).join(' + ')} = ${inr(balance)}. It is a credit balance: ${quoted('To', 'Balance c/d', balance)} on ${end}, brought down as ${quoted('By', 'Balance b/d', balance)} on ${reopen}.`
            : 'Every forfeited share has been reissued, so nothing is left in the account: the two sides agree and there is no balance to bring down.',
        );
        return {
          task: `Prepare Forfeited Shares A/c of ${f.co} for the year ended ${end}; balance it and bring down the balance, if any, on ${reopen}.`,
          title: 'Forfeited Shares A/c',
          ...ledgerSides(view, { closeOn: end, reopenOn: reopen }),
          distractors: ['Forfeited Shares A/c', 'Bank A/c', 'Securities Premium A/c', s.arrears ? 'Calls in Arrears A/c' : ac(S.stageId(s.kind, s.parts.length - 1, s.parts.length)), 'Statement of Profit and Loss', 'Balance c/d', 'Balance b/d'],
          explanation,
          hints: ['The account is credited with what the holders had paid towards capital, and debited with each discount on reissue and each gain transferred to Capital Reserve.', S.H.reissue[1]],
        };
      },
      // The balance another way: what the holders had paid, a share, on the shares not yet reissued; and the gains are
      // the capital reserve the books of the issue show.
      verify: (q) => {
        const c = forfeitChainKept.of(q.context ?? '');
        if (!c) return false;
        const { f } = c;
        const stays = rupees(sum(f.bad.map((d, x) => (S.forfeitedOn(f, d) / d.k) * (d.k - sum(f.lots.map((l) => l.takes[x]))))));
        const b = S.books(f.s);
        const [left, right] = q.sides;
        const closing = left.rows.filter((r) => r.closing);
        const gains = sum(left.rows.filter((r) => r.label === 'Capital Reserve A/c').map((r) => r.amounts[0] ?? 0));
        return (
          -S.net(b.ledger, 'forfeitedShares') === stays &&
          gains === -S.net(b.ledger, 'capitalReserve') &&
          (stays === 0 ? closing.length === 0 && right.below.length === 0 : closing.length === 1 && closing[0].amounts[0] === stays && right.below.length === 1 && right.below[0].amounts[0] === stays) &&
          sum(right.rows.map((r) => r.amounts[0] ?? 0)) === rupees(sum(f.bad.map((d) => S.forfeitedOn(f, d))))
        );
      },
    },
    {
      kind: 'statement',
      make: (c) => {
        const { f, story, registered, y } = c;
        const s = f.s;
        const end = `31 March ${y + 1}`;
        const ledger = post(story.map((st) => st.lines));
        // What the entries leave, in rupees.
        const paidUp = -S.net(ledger, S.capitalId(s.kind)) / 100;
        const held = -S.net(ledger, 'forfeitedShares') / 100;
        const premium = -S.net(ledger, 'securitiesPremium') / 100;
        const reserve = -S.net(ledger, 'capitalReserve') / 100;
        const reissued = sum(f.lots.map((l) => sum(l.takes)));
        const forfeited = sum(f.bad.map((d) => d.k));
        const inIssue = f.n - forfeited + reissued;
        const per = (from: number): number => sum(s.parts.slice(0, from));
        const left = f.bad.map((d, x) => d.k - sum(f.lots.map((l) => l.takes[x])));
        const gains = f.lots.map((lot) => sum(lot.takes.map((t, x) => t * per(f.bad[x].from))) - sum(lot.takes) * (s.face - lot.price));
        return {
          task: `Show the share capital and the reserves of ${f.co} in its Balance Sheet as at ${end}, and prepare Note 1 (Share capital) and Note 2 (Reserves and surplus).`,
          title: `Balance Sheet of ${f.co} as at ${end} (extract), with its Notes to Accounts`,
          noteHeading: 'Note No.',
          rows: [
            { heading: 'I. EQUITY AND LIABILITIES' },
            { heading: "1. Shareholders' funds" },
            { label: 'Share capital', amount: rupees(paidUp + held), note: '1' },
            { label: 'Reserves and surplus', amount: rupees(premium + reserve), note: '2' },
            { heading: 'Note 1: Share capital' },
            { label: 'Authorised capital', amount: rupees(registered * s.face), details: [shareWord(s, registered)] },
            { label: 'Issued capital', amount: rupees(f.offered * s.face), details: [shareWord(s, f.offered)] },
            { heading: 'Subscribed capital' },
            { label: 'Subscribed and fully paid', amount: rupees(paidUp), details: [shareWord(s, inIssue)] },
            ...(held > 0 ? [{ label: FORFEITED_ROW, amount: rupees(held), details: [`On ${cnt(sum(left))} shares not yet reissued`] }] : []),
            { subtotal: 'Total share capital', amount: rupees(paidUp + held), sum: 'section' },
            { heading: 'Note 2: Reserves and surplus' },
            { label: 'Capital reserve', amount: rupees(reserve) },
            ...(premium > 0 ? [{ label: 'Securities premium', amount: rupees(premium) }] : []),
            { subtotal: 'Total reserves and surplus', amount: rupees(reserve + premium), sum: 'section' },
          ],
          distractors: ['Calls in arrears', 'Calls in advance', 'Subscribed but not fully paid', 'General reserve', 'Reserve capital', 'Other current liabilities', ...(held > 0 ? [] : [FORFEITED_ROW]), ...(premium > 0 ? [] : ['Securities premium'])],
          explanation: [
            `Note 1. Authorised capital is what the company is registered with, ${inr(registered * s.face)}; issued capital is the face value of the shares offered, ${cnt(f.offered)} x ${inr(s.face)} = ${inr(f.offered * s.face)}${f.n < f.offered ? `, although only ${cnt(f.n)} were taken up` : ''}. Both are shown for information: neither is added into the total.`,
            `Shares now in issue = ${cnt(f.n)} allotted - ${cnt(forfeited)} forfeited + ${cnt(reissued)} reissued = ${cnt(inIssue)}, every one fully paid: ${cnt(inIssue)} x ${inr(s.face)} = ${inr(paidUp)}.`,
            held > 0
              ? `Forfeited shares: on the ${cnt(sum(left))} shares not yet reissued, ${f.bad.flatMap((d, x) => (left[x] > 0 ? [`${cnt(left[x])} x ${inr(per(d.from))}`] : [])).join(' + ')} = ${inr(held)} is still in Forfeited Shares A/c and is added to the share capital.`
              : 'Every forfeited share has been reissued, so nothing is left in Forfeited Shares A/c and the note has no line for it.',
            `Share capital = ${held > 0 ? `${inr(paidUp)} + ${inr(held)} = ` : ''}${inr(paidUp + held)}, the figure on the face of the balance sheet.`,
            `Note 2. Capital reserve is the gain on the shares reissued: ${gains.map((g) => inr(g)).join(' + ')} = ${inr(reserve)}.`,
            premium > 0
              ? `Securities premium was credited when the allotment money fell due, ${cnt(f.n)} x ${inr(s.premium)} = ${inr(premium)}. Every forfeited holder had paid the allotment money, and a premium that has been received is not taken back on forfeiture.`
              : 'The shares were issued at par, so there is no securities premium and the note has no line for it.',
            `Reserves and surplus = ${premium > 0 ? `${inr(reserve)} + ${inr(premium)} = ` : ''}${inr(reserve + premium)}.`,
            `Check: the two lines together, ${inr(paidUp + held + premium + reserve)}, are exactly the money the issue and the reissues have left in the bank.`,
          ],
          hints: S.H.note,
        };
      },
      // The accounting equation of a company whose only asset is the money of its shares: share capital and reserves
      // together are what the books of the issue leave in the bank, with no other balance left open.
      verify: (q) => {
        const c = forfeitChainKept.of(q.context ?? '');
        if (!c) return false;
        const { f } = c;
        const b = S.books(f.s);
        const open = [...b.ledger.keys()].filter((id) => S.net(b.ledger, id) !== 0);
        const [capital, reserves] = subtotalsOf(q);
        return (
          open.every((id) => ['bank', S.capitalId(f.s.kind), 'forfeitedShares', 'securitiesPremium', 'capitalReserve'].includes(id)) &&
          figureOf(q, 'Share capital') + figureOf(q, 'Reserves and surplus') === S.net(b.ledger, 'bank') &&
          figureOf(q, 'Share capital') === capital &&
          figureOf(q, 'Reserves and surplus') === reserves &&
          figureOf(q, FORFEITED_ROW) === -S.net(b.ledger, 'forfeitedShares') &&
          figureOf(q, 'Capital reserve') === -S.net(b.ledger, 'capitalReserve')
        );
      },
    },
  ],
});

/** What the posted entries of a set leave in each account, in rupees: debits less credits. */
const leftAfter = (lines: readonly JournalLine[][], opening?: Map<string, number>): ((accountId: string) => number) => {
  const ledger = post([...lines], opening);
  return (accountId) => (ledger.get(accountId) ?? 0) / 100;
};

// ===============================================================================================================
// 8. case-ca-chain-debentures: a year in which a company issues debentures redeemable at a premium (chained). The
//    company already has debentures of another rate from an earlier year. It allots a lot to the public (the whole
//    price with the application, over-subscribed in half the seeds) and, in two seeds of three, a lot to a vendor for
//    an asset. The set of the entries of the year with the write-off of the loss, then Loss on Issue of Debentures
//    A/c, then the balance sheet extract: Reserves and surplus (what is left of Securities Premium, if anything),
//    Long-term borrowings with its note (both classes of debentures) and Other long-term liabilities (the premium
//    payable on redemption). A lone lot is always issued at a discount, so that the loss account has three rows.
// ===============================================================================================================

interface DebChain {
  text: string;
  s: DebYearOfIssue;
  oldRate: number;
  /** The nominal value of the debentures of the earlier year. */
  old: number;
  pub: DebYearLot;
  /** Debentures applied for in the public lot (more than were allotted when it was over-subscribed). */
  applied: number;
  transactions: SetTransaction[];
}
const debChainKept = keepFor<DebChain>();
/** A lot of ₹100 debentures of a year of issue as one issue, for the entries of its allotment. */
const asIssue = (s: DebYearOfIssue, l: DebYearLot): DebIssue => ({ n: l.n, rate: s.rate, face: 100, prem: l.prem, disc: l.disc, red: s.red });

const caseChainDebentures = caseTemplate<DebChain>({
  id: 'case-ca-chain-debentures',
  topicId: TOPIC,
  conceptId: CONCEPT,
  difficulty: 'complex',
  title: 'Debentures redeemable at a premium',
  setup: (rng) => {
    const y = rng.int(2023, 2025);
    const co = rng.pick(D.COMPANIES);
    const rate = rng.pick(D.RATES);
    const oldRate = rng.pick(D.RATES.filter((r) => r !== rate));
    const old = rng.step(200000, 1000000, 100000);
    const red = rng.pick([5, 10]);
    const years = rng.int(4, 8);
    const terms = (choices: readonly DebIssueAt[]): { prem: number; disc: number } => {
      const at = rng.pick(choices);
      return { prem: at === 'premium' ? rng.pick([5, 10, 20, 25]) : 0, disc: at === 'discount' ? rng.pick([5, 10]) : 0 };
    };
    const two = rng.int(0, 2) > 0;
    const pub: DebYearLot = { date: '', n: rng.step(2000, 12000, 1000), ...terms(two ? ['discount', 'discount', 'premium', 'par'] : ['discount']) };
    const toVendor: DebYearLot | null = two ? { date: '', n: rng.step(1000, 8000, 500), ...terms(['discount', 'premium', 'par']), vendor: rng.pick(D.VENDORS), asset: rng.pick(D.BOUGHT_PAIR) } : null;
    const lots = toVendor ? rng.shuffle([pub, toVendor]) : [pub];
    const months = setDays(rng, lots.length, 0, 10);
    const days = lots.map(() => rng.pick([5, 10, 15, 20]));
    lots.forEach((l, k) => {
      l.date = `${days[k]} ${D.monthIn(y, months[k])}`;
    });
    const s: DebYearOfIssue = { co, y, rate, years, red, old: 0, sp: 0, lots };
    s.sp = D.drawPremiumBalance(rng, D.yearLoss(s));
    const over = rng.int(0, 1) === 0;
    const applied = over ? pub.n + pub.n * rng.pick([0.1, 0.2, 0.25, 0.5]) : pub.n;
    // The entries of the year, in the journal's form: one compound entry for each allotment.
    const transactions: SetTransaction[] = [];
    for (const [k, l] of lots.entries()) {
      const i = asIssue(s, l);
      const price = D.priceOf(i);
      const money = D.lotMoney(l);
      if (l.vendor && l.asset) {
        const seller = l.vendor;
        transactions.push(
          D.on(l.date, `${S.cap(l.asset.text)} bought from ${seller}.`, [S.dr(l.asset.id, money), S.cr(vendor(seller), money)], [
            `The asset comes in at its price: ${ac(l.asset.id)} is debited with ${inr(money)}.`,
            `${seller} is credited: the price is owed until it is settled. No money is paid.`,
          ]),
          D.on(l.date, `Debentures allotted to ${seller} in settlement of the price.`, D.allotmentLines(i, vendor(seller), money), [
            `${seller} takes each debenture at its issue price of ${inr(price)}, so ${inr(money)} / ${inr(price)} = ${D.count(l.n)} debentures are allotted. ${seller} is debited with ${inr(money)} and so settled.`,
            ...D.allotmentSteps(i),
          ]),
        );
      } else {
        const received = applied * price;
        transactions.push(
          D.on(`${days[k] - 3} ${D.monthIn(y, months[k])}`, 'Applications received with the full issue price.', [S.dr('bank', received), S.cr(D.DAA, received)], [
            `${price === 100 ? '' : `Issue price = ₹100 ${l.prem > 0 ? '+' : '-'} ${inr(l.prem + l.disc)} = ${inr(price)} a debenture. `}Money received = ${D.count(applied)} x ${inr(price)} = ${inr(received)}: Bank A/c is debited. The premium payable on redemption is paid by the company later; it is no part of the money received.`,
            'Until the debentures are allotted it is only application money: Debenture Application and Allotment A/c is credited.',
          ]),
          D.on(l.date, 'Debentures allotted to the public.', D.allotmentLines(i, D.DAA, money), [
            `The money on the ${D.count(l.n)} debentures allotted, ${D.count(l.n)} x ${inr(price)} = ${inr(money)}, stops being application money: Debenture Application and Allotment A/c is debited.`,
            ...D.allotmentSteps(i),
          ]),
          ...(over
            ? [
                D.on(l.date, 'Money refunded on the rejected applications.', [S.dr(D.DAA, received - money), S.cr('bank', received - money)], [
                  `Money on the rejected applications = ${D.count(applied - l.n)} x ${inr(price)} = ${inr(received - money)}: Debenture Application and Allotment A/c is debited and so closed.`,
                  'The money goes back to the applicants: Bank A/c is credited.',
                ]),
              ]
            : []),
        );
      }
    }
    const discount = sum(lots.map((l) => l.n * l.disc));
    const premium = sum(lots.map((l) => l.n * red));
    transactions.push(D.writeOffTx(`31 March ${y + 1}`, discount, premium, s.sp, D.yearPremium(s)));
    const lotLine = (l: DebYearLot): string =>
      l.vendor && l.asset
        ? `${l.date}: Bought ${l.asset.text} from ${l.vendor} for ${inr(D.lotMoney(l))}, and settled the price the same day by allotting debentures to ${l.vendor} ${D.lotTerms(l)}.`
        : `${l.date}: Allotted ${D.count(l.n)} of them to the public ${D.lotTerms(l)}. ${over ? `Applications had come in for ${D.count(applied)} debentures with the full issue price; those for the other ${D.count(applied - l.n)} were rejected and the money refunded.` : 'Applications for exactly these debentures had come in with the full issue price.'}`;
    const text = [
      `${co} closes its books on 31 March. On 1 April ${y} its Securities Premium A/c ${s.sp > 0 ? `had a balance of ${inr(s.sp)}` : 'had no balance'}, and its only debentures were ${D.count(old / 100)}, ${oldRate}% Debentures of ₹100 each, issued at par in an earlier year and redeemable at par in ${y + 4}.`,
      `During the year ended 31 March ${y + 1} it issued ${rate}% Debentures of ₹100 each, redeemable at a premium of ${red}% after ${years} years:`,
      ...lots.map(lotLine),
      'Money received is banked the same day and held in Debenture Application and Allotment A/c until allotment; a vendor is credited with the price until it is settled.',
      `The premium payable on redemption is provided for on allotment, and the whole loss on an issue (any discount, and that premium) is debited to ${D.LOSS_AC}. On 31 March ${y + 1} the loss was written off, first from Securities Premium (any premium received during the year included) and then from the Statement of Profit and Loss.`,
      'Interest on the debentures and the surplus in the Statement of Profit and Loss are outside this question, so Reserves and surplus shows Securities Premium alone. A line of the balance sheet that comes to nil is left out, with its note.',
    ].join('\n');
    const c: DebChain = { text, s, oldRate, old, pub, applied, transactions };
    debChainKept.keep(text, c);
    return c;
  },
  context: (c) => c.text,
  parts: [
    {
      kind: 'journal_set',
      make: (c) => ({
        task: 'Pass the journal entries for the debentures issued during the year and for the write-off of the loss on their issue.',
        transactions: c.transactions,
        hints: D.SET_HINTS.issue,
        distractorAccounts: ['discountOnIssueOfDebentures', 'debentureApplication', 'debentureholders', 'generalReserve', debentures(c.oldRate)],
      }),
      // From the terms alone: the new debentures at their nominal value, the money held and the vendor cleared, the
      // premium on redemption provided for, the loss closed, and Securities Premium bearing what it can.
      verify: (q) => {
        const c = debChainKept.of(q.context ?? '');
        if (!c) return false;
        const { s, pub } = c;
        const left = leftAfter(q.entries.map((e) => e.expected));
        const loss = D.yearLoss(s);
        const own = D.yearPremium(s);
        const fromSp = Math.min(loss, s.sp + own);
        const lossDebited = sum(q.entries.flatMap((e) => e.expected).filter((l) => l.accountId === 'lossOnIssueOfDebentures' && l.side === 'Dr').map((l) => l.amount)) / 100;
        return (
          left(debentures(s.rate)) === -D.yearNominal(s) &&
          left(D.DAA) === 0 &&
          s.lots.every((l) => !l.vendor || left(vendor(l.vendor)) === 0) &&
          left('lossOnIssueOfDebentures') === 0 &&
          lossDebited === loss &&
          left(D.PREM_RED) === -sum(s.lots.map((l) => l.n * s.red)) &&
          left(D.SP) === fromSp - own &&
          left(D.SPL) === loss - fromSp &&
          left('bank') === D.lotMoney(pub)
        );
      },
    },
    {
      kind: 'account',
      make: (c) => {
        const { s } = c;
        const end = `31 March ${s.y + 1}`;
        const loss = D.yearLoss(s);
        const sides = ledgerSides(accountOf(D.ledgerEntries(s), 'lossOnIssueOfDebentures', null, D.particulars), { closeOn: end });
        if (sides.left.rows.length + sides.right.rows.length < 3 || D.hasTwins(sides.left.rows)) return null;
        const own = D.yearPremium(s);
        const available = s.sp + own;
        const fromSp = Math.min(loss, available);
        const fromPl = loss - fromSp;
        const explanation: string[] = [`${D.LOSS_AC} gathers the whole loss on the debentures allotted in the year: the discount allowed on issue and the premium payable on redemption. It is debited as each lot is allotted.`];
        for (const l of s.lots) {
          const steps = [l.vendor ? `${l.date}: ${l.vendor} takes each debenture at ${inr(100 + l.prem - l.disc)}, so ${inr(D.lotMoney(l))} / ${inr(100 + l.prem - l.disc)} = ${D.count(l.n)} debentures are allotted.` : `${l.date}: ${D.count(l.n)} debentures are allotted to the public.`];
          if (l.disc > 0) steps.push(`Discount = ${D.count(l.n)} x ${inr(l.disc)} = ${inr(l.n * l.disc)}: To ${s.rate}% Debentures A/c, because that account is credited with the full nominal value.`);
          steps.push(`Premium payable on redemption = ${D.count(l.n)} x ${inr(s.red)} = ${inr(l.n * s.red)}: To Premium on Redemption of Debentures A/c.`);
          if (l.prem > 0) steps.push(`The premium of ${inr(l.n * l.prem)} on this lot is credited to Securities Premium A/c; it is not set off here.`);
          explanation.push(steps.join(' '));
        }
        explanation.push(
          `The debit side comes to ${inr(loss)}, the loss to be written off in the year of allotment.`,
          available === 0
            ? `Securities Premium A/c has no balance, so the whole loss is charged to the Statement of Profit and Loss as a finance cost: By Statement of Profit and Loss ${inr(loss)}.`
            : `Securities Premium available on ${end} = ${own > 0 && s.sp > 0 ? `${inr(s.sp)} + ${inr(own)} received during the year = ${inr(available)}` : own > 0 ? `the ${inr(own)} received during the year` : inr(available)}. ${
                fromPl === 0 ? `It bears the whole loss: By Securities Premium A/c ${inr(loss)}.` : `It is used first: By Securities Premium A/c ${inr(fromSp)}. The rest, ${inr(loss)} - ${inr(fromSp)} = ${inr(fromPl)}, is a finance cost: By Statement of Profit and Loss ${inr(fromPl)}.`
              }`,
          `The two sides agree at ${inr(loss)}: the account is closed, and nothing is carried to the next year.`,
        );
        return {
          task: `Prepare ${D.LOSS_AC} of ${s.co} for the year ended ${end} and close it, posting each discount against the debentures account and each premium payable on redemption against its own account.`,
          title: D.LOSS_AC,
          ...sides,
          distractors: ['Securities Premium A/c', 'Statement of Profit and Loss', `${s.rate}% Debentures A/c`, 'Premium on Redemption of Debentures A/c', 'Balance c/d', D.DISCOUNT_AC, D.LOSS_AC, 'Debenture Application and Allotment A/c', 'General Reserve A/c', 'Bank A/c'],
          explanation,
          hints: [
            'For each lot: discount on issue (if any) + premium payable on redemption. A premium received on issue is not deducted here.',
            'The account is closed in the year of allotment: Securities Premium bears what it can, and the Statement of Profit and Loss the rest.',
          ],
        };
      },
      // From the terms alone and from the journal form of the year posted: the loss of the year, what Securities
      // Premium bears of it and what is left for the Statement, with the account closed.
      verify: (q) => {
        const c = debChainKept.of(q.context ?? '');
        if (!c) return false;
        const { s } = c;
        const loss = rupees(D.yearLoss(s));
        const available = rupees(s.sp + D.yearPremium(s));
        const { entries, opening } = D.journalEntries(s);
        const ledger = post(entries, opening);
        const [left, right] = q.sides;
        const total = (rows: typeof left.rows, label?: string): number => rows.filter((r) => label === undefined || r.label === label).reduce((t, r) => t + (r.amounts[0] ?? 0), 0);
        return (
          loss > 0 &&
          (ledger.get('lossOnIssueOfDebentures') ?? 0) === 0 &&
          total(left.rows) === loss &&
          total(right.rows) === loss &&
          total(right.rows, 'Securities Premium A/c') === Math.min(loss, available) &&
          total(right.rows, 'Statement of Profit and Loss') === Math.max(0, loss - available) &&
          [...left.rows, ...right.rows].every((r) => !r.closing)
        );
      },
    },
    {
      kind: 'statement',
      make: (c) => {
        const { s, old, oldRate } = c;
        const end = `31 March ${s.y + 1}`;
        const loss = D.yearLoss(s);
        const own = D.yearPremium(s);
        const fromSp = Math.min(loss, s.sp + own);
        const reserve = s.sp + own - fromSp;
        const nominal = D.yearNominal(s);
        const n = nominal / 100;
        const onRedemption = sum(s.lots.map((l) => l.n * s.red));
        const seller = s.lots.find((l) => l.vendor);
        const face: (FormatRowParts | StatementLineParts)[] = [{ heading: `Balance Sheet of ${s.co} as at ${end} (extract)` }, { heading: 'I. EQUITY AND LIABILITIES' }];
        const notes: (FormatRowParts | StatementLineParts)[] = [{ heading: 'Notes to Accounts' }];
        let noteNo = 0;
        if (reserve > 0) {
          const k = String(++noteNo);
          face.push({ heading: "Shareholders' funds" }, { label: 'Reserves and surplus', amount: rupees(reserve), note: k });
          notes.push(
            { heading: `Note ${k}: Reserves and surplus` },
            ...(s.sp > 0 ? [{ label: `Securities premium on 1 April ${s.y}`, amount: rupees(s.sp) }] : []),
            ...(own > 0 ? [{ label: 'Premium received on issue of debentures', amount: rupees(own) }] : []),
            // The minus sign says that the amount is deducted, so the wording without "Less:" is as right in this note.
            { label: 'Less: Loss on issue of debentures written off', amount: -rupees(fromSp), also: ['Loss on issue of debentures written off'] },
            { subtotal: `Securities premium on ${end}`, amount: rupees(reserve), sum: 'section' },
          );
        }
        const borrowed = String(++noteNo);
        const other = String(++noteNo);
        face.push(
          { heading: 'Non-current liabilities' },
          { label: 'Long-term borrowings', amount: rupees(old + nominal), note: borrowed },
          { label: 'Other long-term liabilities', amount: rupees(onRedemption), note: other },
        );
        notes.push(
          { heading: `Note ${borrowed}: Long-term borrowings` },
          { label: `${D.count(old / 100)}, ${oldRate}% Debentures of ₹100 each`, amount: rupees(old), details: [`Redeemable at par in ${s.y + 4}`] },
          {
            label: `${D.count(n)}, ${s.rate}% Debentures of ₹100 each`,
            amount: rupees(nominal),
            details: [`Redeemable at a premium of ${s.red}% after ${s.years} years`, ...(seller ? [`${D.count(seller.n)} of them allotted to ${seller.vendor} for consideration other than cash`] : [])],
          },
          { subtotal: 'Total long-term borrowings', amount: rupees(old + nominal), sum: 'section' },
          { heading: `Note ${other}: Other long-term liabilities` },
          { label: 'Premium on redemption of debentures', amount: rupees(onRedemption) },
        );
        const availableLine = own > 0 && s.sp > 0 ? `${inr(s.sp)} + ${inr(own)} received during the year = ${inr(s.sp + own)}` : own > 0 ? `the ${inr(own)} received during the year` : inr(s.sp);
        return {
          task: `Show the reserves and the non-current liabilities of ${s.co} that arise from its debentures and its Securities Premium in its Balance Sheet as at ${end}, with the notes to accounts. Show an amount that is deducted with a minus sign.`,
          title: `Balance Sheet of ${s.co} as at ${end} (extract), with the notes to accounts`,
          columns: [{ name: 'Amount (₹)', signed: true }],
          noteHeading: 'Note No.',
          rows: [...face, ...notes],
          // The lines a year of issue may or may not have are always on offer, with the heads a student wrongly reaches for.
          distractors: [
            'Reserves and surplus', 'Premium received on issue of debentures', `Securities premium on 1 April ${s.y}`, 'Less: Loss on issue of debentures written off',
            'Short-term borrowings', 'Other current liabilities', 'Trade payables', 'Share capital', 'Debenture application and allotment',
          ],
          explanation: [
            `Long-term borrowings: every debenture stands at its nominal value, whatever was received for it. The ${oldRate}% Debentures of the earlier year, ${inr(old)}, and the ${s.rate}% Debentures of this year, ${D.count(n)} x ₹100 = ${inr(nominal)}${seller ? `, those allotted to ${seller.vendor} among them` : ''}: ${inr(old)} + ${inr(nominal)} = ${inr(old + nominal)}. They fall due after more than a year, so they are non-current.`,
            `Other long-term liabilities: the premium payable on redemption, ${s.red}% of ${inr(nominal)} = ${inr(onRedemption)}. It is owed from the day of allotment and falls due with the debentures; it is not money borrowed, so it is shown apart from them.`,
            reserve > 0
              ? `Reserves and surplus: Securities Premium available = ${availableLine}; the loss of ${inr(loss)} written off against it leaves ${inr(reserve)}.`
              : s.sp + own > 0
                ? `Securities Premium available = ${availableLine}. All of it went to write off the loss of ${inr(loss)}, so nothing is left to show under Reserves and surplus, and the line and its note are left out.`
                : `Securities Premium A/c had no balance and received nothing during the year, so there is nothing to show under Reserves and surplus: the whole loss of ${inr(loss)} was charged to the Statement of Profit and Loss.`,
            'Each note repeats the figure of its line in the balance sheet and shows what it is made of.',
          ],
          hints: [
            'The debentures stand at their nominal value under Long-term borrowings, old and new together. A premium payable on redemption is a liability of its own.',
            'What is left of Securities Premium after the write-off is a reserve; if nothing is left, the line is left out.',
          ],
        };
      },
      // From the terms of the year alone, without the rows: the nominal value of both classes, the premium payable on
      // redemption, and what is left of Securities Premium; checked against the journal of the year posted.
      verify: (q) => {
        const c = debChainKept.of(q.context ?? '');
        if (!c) return false;
        const { s, old } = c;
        const { entries, opening } = D.journalEntries(s);
        const ledger = post(entries, opening);
        const figure = (test: (label: string) => boolean): number => q.rows.filter((r) => test(r.label)).reduce((t, r) => t + (r.amounts[0] ?? 0), 0);
        const left = Math.max(0, -(ledger.get(D.SP) ?? 0));
        const nominal = -(ledger.get(debentures(s.rate)) ?? 0);
        return (
          figure((x) => x === 'Long-term borrowings') === rupees(old) + nominal &&
          figure((x) => x.endsWith('Debentures of ₹100 each')) === rupees(old) + nominal &&
          figure((x) => x === 'Other long-term liabilities') === -(ledger.get(D.PREM_RED) ?? 0) &&
          figure((x) => x === 'Premium on redemption of debentures') === -(ledger.get(D.PREM_RED) ?? 0) &&
          figure((x) => x === 'Reserves and surplus') === left &&
          figure((x) => x.startsWith('Securities premium on') || x.startsWith('Premium received') || x.startsWith('Less:')) === left
        );
      },
    },
  ],
});

// ===============================================================================================================
// 9. case-ca-chain-vendor: a running business bought and paid for in shares and debentures (chained). The company
//    already has equity shares in issue for cash, and Securities Premium in some seeds. The consideration is above
//    or below the net assets (goodwill or a capital reserve); it is settled by a cheque for a part in half the seeds,
//    by fully paid equity shares at par or at a premium, and by debentures for the balance, issued at par, at a
//    premium or at a discount and redeemable at par or at a premium. The set of entries (with the write-off of any
//    discount or loss on the debentures), then the share capital, reserves and non-current liabilities in the balance
//    sheet with their notes.
// ===============================================================================================================

interface MixedChain {
  text: string;
  co: string;
  v: string;
  y: number;
  date: string;
  tk: DebTakeover;
  cheque: number;
  /** The premium a share of ₹10 and the shares allotted to the vendor; the shares in issue before, and the premium then. */
  p: number;
  nsh: number;
  existing: number;
  sp0: number;
  registered: number;
  i: DebIssue;
  years: number;
  transactions: SetTransaction[];
}
const mixedKept = keepFor<MixedChain>();
const MIXED_TERMS: [DebIssueAt, boolean][] = [['par', false], ['premium', false], ['discount', false], ['discount', false], ['par', true], ['discount', true], ['premium', true]];
/** What the debentures of a mixed settlement come to: their issue price, the money they settle, the loss and how it is borne. */
function mixedFigures(c: Pick<MixedChain, 'i' | 'sp0' | 'p' | 'nsh'>) {
  const { i } = c;
  const loss = i.n * (i.disc + i.red);
  const available = c.sp0 + c.nsh * c.p + i.n * i.prem;
  const fromSp = Math.min(loss, available);
  return { price: D.priceOf(i), settled: i.n * D.priceOf(i), loss, available, fromSp, fromPl: loss - fromSp, left: available - fromSp, nominal: D.nominalOf(i) };
}

const caseChainVendor = caseTemplate<MixedChain>({
  id: 'case-ca-chain-vendor',
  topicId: TOPIC,
  conceptId: CONCEPT,
  difficulty: 'complex',
  title: 'A business bought for shares and debentures',
  setup: (rng) => {
    const y = rng.int(2023, 2025);
    const co = rng.pick(D.COMPANIES);
    const v = rng.pick(D.VENDORS);
    const existing = rng.step(50000, 300000, 10000);
    const sp0 = rng.int(0, 2) === 0 ? rng.step(20000, 200000, 10000) : 0;
    const p = rng.pick([0, 2, 2, 5]);
    const nsh = 1000 * rng.int(10, 60);
    const [at, redeemAtPremium] = rng.pick(MIXED_TERMS);
    const i: DebIssue = {
      n: rng.step(1000, 8000, 1000),
      rate: rng.pick(D.RATES),
      face: 100,
      prem: at === 'premium' ? rng.pick([5, 10, 20]) : 0,
      disc: at === 'discount' ? rng.pick([5, 10]) : 0,
      red: redeemAtPremium ? rng.pick([5, 10]) : 0,
    };
    const cheque = rng.int(0, 1) === 0 ? 0 : rng.step(50000, 200000, 10000);
    const years = rng.int(4, 8);
    const date = `${rng.pick([1, 5, 10, 15, 20])} ${D.monthIn(y, rng.int(0, 9))}`;
    const registered = Math.ceil(((existing + nsh) * rng.pick([2, 3, 4])) / 100000) * 100000;
    const shares = nsh * (10 + p);
    const f = mixedFigures({ i, sp0, p, nsh });
    const pc = cheque + shares + f.settled;
    const tk = D.drawTakeover(rng, pc);
    if (!tk) return null;
    const net = D.netAssets(tk);
    const what = i.red > 0 ? 'loss' : 'discount';
    const words = i.prem > 0 ? `at a premium of ${i.prem}%` : i.disc > 0 ? `at a discount of ${i.disc}%` : 'at par';
    const transactions: SetTransaction[] = [
      D.on(date, `Business of ${v} taken over.`, S.entry(...tk.assets.map((a) => S.dr(a.id, a.value)), S.dr('goodwill', Math.max(0, tk.diff)), S.cr('creditors', tk.creditors), S.cr(vendor(v), pc), S.cr('capitalReserve', Math.max(0, -tk.diff))), [
        'Each asset taken over is debited at its agreed value, and the creditors taken over are credited.',
        `${v} is credited with the purchase consideration, ${inr(pc)}, until it is settled.`,
        D.netWorking(tk),
        tk.diff > 0 ? `The consideration is more than the net assets by ${inr(pc)} - ${inr(net)} = ${inr(tk.diff)}: Goodwill A/c is debited.` : `The consideration is less than the net assets by ${inr(net)} - ${inr(pc)} = ${inr(-tk.diff)}: Capital Reserve A/c is credited.`,
      ]),
      ...(cheque > 0
        ? [D.on(date, `Part of the price paid to ${v} by cheque.`, [S.dr(vendor(v), cheque), S.cr('bank', cheque)], [`Part of what is owed to ${v} is paid: ${v} is debited with ${inr(cheque)}.`, 'The cheque is paid out of the bank: Bank A/c is credited.'])]
        : []),
      D.on(date, `Equity shares allotted to ${v}.`, S.entry(S.dr(vendor(v), shares), S.cr('equityShareCapital', nsh * 10), S.cr('securitiesPremium', nsh * p)), [
        `${cnt(nsh)} shares at ${inr(10 + p)} each settle ${cnt(nsh)} x ${inr(10 + p)} = ${inr(shares)} of the price: ${v} is debited with it.`,
        `Equity Share Capital A/c is credited with their face value, ${cnt(nsh)} x ₹10 = ${inr(nsh * 10)}.`,
        ...(p > 0 ? [`Securities Premium A/c is credited with the premium, ${cnt(nsh)} x ${inr(p)} = ${inr(nsh * p)}.`] : ['They are allotted at par, so there is no premium.']),
      ]),
      D.on(date, `Debentures issued to ${v} for the balance.`, D.allotmentLines(i, vendor(v), f.settled), [
        `Balance due to ${v} = ${inr(pc)}${cheque > 0 ? ` - ${inr(cheque)}` : ''} - ${inr(shares)} = ${inr(f.settled)}. ${v} takes each debenture at its issue price of ${inr(f.price)}, so ${inr(f.settled)} / ${inr(f.price)} = ${D.count(i.n)} debentures are issued, and ${v} is settled.`,
        ...D.allotmentSteps(i),
      ]),
    ];
    if (f.loss > 0) {
      const lossName = i.red > 0 ? D.LOSS_AC : D.DISCOUNT_AC;
      const parts = [...(sp0 > 0 ? [`${inr(sp0)} at the start of the year`] : []), ...(nsh * p > 0 ? [`${inr(nsh * p)} on the shares`] : []), ...(i.n * i.prem > 0 ? [`${inr(i.n * i.prem)} on the debentures`] : [])];
      transactions.push(
        D.on(`31 March ${y + 1}`, `${S.cap(what)} on the issue of the debentures written off.`, S.entry(S.dr(D.SP, f.fromSp), S.dr(D.SPL, f.fromPl), S.cr(D.lossIdOf(i.red > 0), f.loss)), [
          `${i.red > 0 ? (i.disc > 0 ? `Loss on issue = discount ${inr(i.n * i.disc)} + premium payable on redemption ${inr(i.n * i.red)} = ${inr(f.loss)}` : `Loss on issue = the premium payable on redemption, ${inr(f.loss)}`) : `Discount on issue = ${D.count(i.n)} x ${inr(i.disc)} = ${inr(f.loss)}`}. It is written off in full in the year of allotment: ${lossName} is credited and so closed.`,
          f.available === 0
            ? `Securities Premium A/c has no balance, so the whole ${inr(f.loss)} is charged to the Statement of Profit and Loss, as a finance cost.`
            : `Securities Premium available = ${parts.join(' + ')}${parts.length > 1 ? ` = ${inr(f.available)}` : ''}. ${f.fromPl === 0 ? `It bears the whole amount: Securities Premium A/c is debited with ${inr(f.loss)}.` : `It is used first: Securities Premium A/c is debited with ${inr(f.fromSp)}. The rest, ${inr(f.fromPl)}, is charged to the Statement of Profit and Loss as a finance cost.`}`,
        ]),
      );
    }
    const text = [
      `${co} is registered with a capital of ${inr(registered * 10)} divided into ${cnt(registered)} equity shares of ₹10 each. On 1 April ${y} it had ${cnt(existing)} of these shares in issue, all fully paid and issued for cash, and its Securities Premium A/c ${sp0 > 0 ? `had a balance of ${inr(sp0)}` : 'had no balance'}.`,
      `On ${date} it ${D.tookOver(tk, v)}, for a purchase consideration of ${inr(pc)}. ${v} is credited with the price until it is settled.`,
      `The consideration was settled the same day: ${cheque > 0 ? `${inr(cheque)} by cheque; ` : ''}${cnt(nsh)} equity shares of ₹10 each allotted to ${v} as fully paid ${p > 0 ? `at a premium of ${inr(p)} a share` : 'at par'}; and the balance by issuing to ${v} ${i.rate}% Debentures of ₹100 each ${words}, redeemable ${i.red > 0 ? `at a premium of ${i.red}%` : 'at par'} after ${years} years.`,
      ...(i.red > 0
        ? [`The premium payable on redemption is provided for on issue, and the whole loss on the issue (${i.disc > 0 ? 'the discount and that premium' : 'that premium'}) is debited to ${D.LOSS_AC}.`]
        : i.disc > 0
          ? [`The discount on the issue of the debentures is debited to ${D.DISCOUNT_AC}.`]
          : []),
      ...(f.loss > 0 ? [`The ${what} is written off on 31 March ${y + 1}, first from Securities Premium (the premiums received during the year included) and then from the Statement of Profit and Loss.`] : []),
      'The accounting year ends on 31 March. Interest on the debentures and the surplus in the Statement of Profit and Loss are outside this question, so Reserves and surplus shows only a capital reserve, if any, and Securities Premium. A line of the balance sheet that comes to nil is left out, with its note.',
    ].join('\n');
    const c: MixedChain = { text, co, v, y, date, tk, cheque, p, nsh, existing, sp0, registered, i, years, transactions };
    mixedKept.keep(text, c);
    return c;
  },
  context: (c) => c.text,
  parts: [
    {
      kind: 'journal_set',
      make: (c) => ({
        task: 'Pass the journal entries for the purchase of the business, its settlement and the write-off of any discount or loss on the debentures.',
        transactions: c.transactions,
        hints: [
          'The vendor is credited with the purchase consideration and then debited with each part of its settlement: the cheque, the shares at their issue price, the debentures at theirs.',
          'Debentures for the balance: number = balance / issue price of a debenture. A discount or loss on them is written off first from Securities Premium.',
        ],
        distractorAccounts: [c.tk.diff > 0 ? 'capitalReserve' : 'goodwill', D.lossIdOf(c.i.red === 0), 'equityShareAllotment', D.DAA, 'generalReserve'],
      }),
      // From the terms alone: the vendor settled to the rupee, the shares and the debentures at their face values,
      // the goodwill or capital reserve, and Securities Premium bearing what it can of any discount or loss.
      verify: (q) => {
        const c = mixedKept.of(q.context ?? '');
        if (!c) return false;
        const f = mixedFigures(c);
        const left = leftAfter(q.entries.map((e) => e.expected));
        const pc = c.cheque + c.nsh * (10 + c.p) + f.settled;
        const net = sum(c.tk.assets.map((a) => a.value)) - c.tk.creditors;
        return (
          left(vendor(c.v)) === 0 &&
          left('equityShareCapital') === -c.nsh * 10 &&
          left(debentures(c.i.rate)) === -f.nominal &&
          left('goodwill') + left('capitalReserve') === pc - net &&
          left(D.lossIdOf(c.i.red > 0)) === 0 &&
          left(D.PREM_RED) === -c.i.n * c.i.red &&
          left(D.SP) === f.fromSp - c.nsh * c.p - c.i.n * c.i.prem &&
          left(D.SPL) === f.fromPl &&
          left('bank') === -c.cheque
        );
      },
    },
    {
      kind: 'statement',
      make: (c) => {
        const { i, v, y, nsh, existing, registered } = c;
        const f = mixedFigures(c);
        const end = `31 March ${y + 1}`;
        const inIssue = existing + nsh;
        const capRes = Math.max(0, -c.tk.diff);
        const reserves = capRes + f.left;
        const onRedemption = i.n * i.red;
        const shares = (x: number): string => `${cnt(x)} equity shares of ₹10 each`;
        const face: (FormatRowParts | StatementLineParts)[] = [{ heading: 'I. EQUITY AND LIABILITIES' }, { heading: "Shareholders' funds" }, { label: 'Share capital', amount: rupees(inIssue * 10), note: '1' }];
        const notes: (FormatRowParts | StatementLineParts)[] = [
          { heading: 'Note 1: Share capital' },
          { label: 'Authorised capital', amount: rupees(registered * 10), details: [shares(registered)] },
          { label: 'Issued capital', amount: rupees(inIssue * 10), details: [shares(inIssue)] },
          { heading: 'Subscribed capital' },
          { label: 'Subscribed and fully paid', amount: rupees(inIssue * 10), details: [shares(inIssue), `${cnt(nsh)} of them allotted as fully paid to ${v} for consideration other than cash`] },
          { subtotal: 'Total share capital', amount: rupees(inIssue * 10), sum: 'section' },
        ];
        let noteNo = 1;
        if (reserves > 0) {
          const k = String(++noteNo);
          face.push({ label: 'Reserves and surplus', amount: rupees(reserves), note: k });
          notes.push(
            { heading: `Note ${k}: Reserves and surplus` },
            ...(capRes > 0 ? [{ label: 'Capital reserve', amount: rupees(capRes) }] : []),
            ...(f.left > 0 ? [{ label: 'Securities premium', amount: rupees(f.left) }] : []),
            { subtotal: 'Total reserves and surplus', amount: rupees(reserves), sum: 'section' },
          );
        }
        const borrowed = String(++noteNo);
        face.push({ heading: 'Non-current liabilities' }, { label: 'Long-term borrowings', amount: rupees(f.nominal), note: borrowed });
        notes.push(
          { heading: `Note ${borrowed}: Long-term borrowings` },
          { label: `${D.count(i.n)}, ${i.rate}% Debentures of ₹100 each`, amount: rupees(f.nominal), details: [`Allotted to ${v} for consideration other than cash`, `Redeemable ${i.red > 0 ? `at a premium of ${i.red}%` : 'at par'} after ${c.years} years`] },
        );
        if (onRedemption > 0) {
          const k = String(++noteNo);
          face.push({ label: 'Other long-term liabilities', amount: rupees(onRedemption), note: k });
          notes.push({ heading: `Note ${k}: Other long-term liabilities` }, { label: 'Premium on redemption of debentures', amount: rupees(onRedemption) });
        }
        const premiumParts = [...(c.sp0 > 0 ? [`${inr(c.sp0)} at the start of the year`] : []), ...(nsh * c.p > 0 ? [`${inr(nsh * c.p)} on the shares`] : []), ...(i.n * i.prem > 0 ? [`${inr(i.n * i.prem)} on the debentures`] : [])];
        return {
          task: `Show the share capital, the reserves and the non-current liabilities of ${c.co} in its Balance Sheet as at ${end}, with the notes to accounts.`,
          title: `Balance Sheet of ${c.co} as at ${end} (extract), with the notes to accounts`,
          noteHeading: 'Note No.',
          rows: [...face, ...notes],
          distractors: [
            'Calls in arrears', 'Subscribed but not fully paid', 'Forfeited shares (amount originally paid up)', 'General reserve', 'Short-term borrowings', 'Trade payables', 'Goodwill',
            ...(capRes > 0 ? [] : ['Capital reserve']), ...(f.left > 0 ? [] : ['Securities premium']), ...(reserves > 0 ? [] : ['Reserves and surplus']),
            ...(onRedemption > 0 ? [] : ['Other long-term liabilities', 'Premium on redemption of debentures']),
          ],
          explanation: [
            `Note 1. Authorised capital is what the company is registered with, ${inr(registered * 10)}. Shares in issue = ${cnt(existing)} for cash + ${cnt(nsh)} allotted to ${v} = ${cnt(inIssue)}, every one fully paid: ${cnt(inIssue)} x ₹10 = ${inr(inIssue * 10)}. The note says that ${cnt(nsh)} of them were allotted for consideration other than cash.`,
            capRes > 0 ? `Capital reserve: the business was bought for ${inr(-c.tk.diff)} less than its net assets, a capital profit.` : `The business cost more than its net assets: the ${inr(c.tk.diff)} is goodwill, an asset, and adds nothing to the reserves.`,
            f.available === 0
              ? 'Securities premium: none was there and none was received, so there is no line for it.'
              : `Securities premium = ${premiumParts.join(' + ')}${premiumParts.length > 1 ? ` = ${inr(f.available)}` : ''}${f.loss > 0 ? `, less the ${inr(f.fromSp)} used to write off the ${i.red > 0 ? 'loss' : 'discount'} on the debentures` : ''} = ${inr(f.left)}.${f.left === 0 ? ' Nothing is left, so the line is left out.' : ''}`,
            reserves > 0 ? `Reserves and surplus = ${capRes > 0 && f.left > 0 ? `${inr(capRes)} + ${inr(f.left)} = ` : ''}${inr(reserves)}.` : 'Nothing is left under Reserves and surplus, so the line and its note are left out.',
            `Long-term borrowings: the debentures at their nominal value, ${D.count(i.n)} x ₹100 = ${inr(f.nominal)}, whatever ${v} took them at.`,
            ...(onRedemption > 0 ? [`Other long-term liabilities: the premium payable on redemption, ${i.red}% of ${inr(f.nominal)} = ${inr(onRedemption)}.`] : []),
          ],
          hints: [
            'Shares allotted to a vendor are fully paid share capital at their face value; the premium on them is a reserve.',
            'Debentures stand at their nominal value under Long-term borrowings, whatever the price the vendor took them at.',
          ],
        };
      },
      // The entries of the case posted on top of the opening balances: each line of the extract is a balance they leave.
      verify: (q) => {
        const c = mixedKept.of(q.context ?? '');
        if (!c) return false;
        const left = leftAfter(
          c.transactions.map((t) => t.lines),
          new Map([['equityShareCapital', -rupees(c.existing * 10)], ...(c.sp0 > 0 ? ([[D.SP, -rupees(c.sp0)]] as [string, number][]) : [])]),
        );
        return (
          figureOf(q, 'Share capital') === rupees(-left('equityShareCapital')) &&
          figureOf(q, 'Reserves and surplus') === rupees(-left('capitalReserve') - left(D.SP)) &&
          figureOf(q, 'Long-term borrowings') === rupees(-left(debentures(c.i.rate))) &&
          figureOf(q, 'Other long-term liabilities') === rupees(-left(D.PREM_RED))
        );
      },
    },
  ],
});

const cases: CaseTemplate[] = [
  caseProrata, caseForfeitReissue, caseVendorShares, caseDebentureIssue, caseCollateral,
  caseChainIssue, caseChainForfeiture, caseChainDebentures, caseChainVendor,
];

export default cases;
