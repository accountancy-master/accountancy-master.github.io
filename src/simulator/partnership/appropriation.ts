import { formatINR, type Paise } from '@/engine/money';
import { splitByRatio } from './split';

// ---------------------------------------------------------------------------------------------------------------
// Sharing a year's profit among the partners: the Profit and Loss Appropriation Account, worked as the board works
// it (NCERT Class 12, CBSE 2025-26).
//
// - The net profit comes from the Profit and Loss A/c after every charge (interest on a partner's loan, rent to a
//   partner). Interest on drawings is credited to the appropriation account and adds to what is shared.
// - Interest on capital, salaries and commission are appropriations: they come only out of profit. With a loss, none
//   is allowed. When the profit (with interest on drawings) is less than they come to, the whole of it is shared in
//   proportion to the amounts due (the deed giving none of them priority), and nothing is left for the ratio.
// - Interest on capital is on the capital at the start of the year, for the whole year. Interest on drawings is for
//   six months on the total drawn, the drawings being spread evenly over the year (no dates given). Commission is a
//   percentage of the net profit before charging it.
// - The divisible profit (or loss) is shared in the profit-sharing ratio. A partner guaranteed a minimum share is
//   made good by the other partners in their own ratio (a guarantee by the firm) or by one partner.
// - Fixed capitals: every item goes to the partners' current accounts (no opening balance on them here) and the
//   capital accounts stay as they were. Fluctuating capitals: every item goes to the capital accounts.
// Amounts are in paise; a share is exact to the paisa (see split.ts).
// ---------------------------------------------------------------------------------------------------------------

export type CapitalMethod = 'fixed' | 'fluctuating';

export interface PartnerIn {
  name: string;
  /** Capital at the start of the year. */
  capital: Paise;
  /** The partner's term of the profit-sharing ratio (3 of 3:2). */
  ratio: number;
  /** Salary for the year (nothing if none). */
  salary: Paise;
  /** Drawings during the year. */
  drawings: Paise;
}

export interface Guarantee {
  /** The partner guaranteed a minimum share of profit. */
  partner: number;
  /** The minimum share, for the year. */
  amount: Paise;
  /** Who makes good a deficiency: the firm (the other partners, in their own ratio) or one partner. */
  by: 'firm' | number;
}

export interface AppropriationIn {
  partners: PartnerIn[];
  /** Net profit from the Profit and Loss A/c; negative for a net loss. */
  netProfit: Paise;
  /** Interest on capital, % p.a. (0 for none). */
  iocRate: number;
  /** Interest on drawings, % p.a. (0 for none). */
  iodRate: number;
  /** A commission to one partner, as a % of the net profit before charging it. */
  commission: { partner: number; rate: number } | null;
  guarantee: Guarantee | null;
  capitals: CapitalMethod;
  /** "31 March 2026". */
  yearEnd?: string;
}

/** Where an amount moves: the appropriation account (the pool to share), a partner, or the Profit and Loss A/c. */
export type Spot = 'pool' | 'outside' | `p${number}`;
export const partnerSpot = (i: number): Spot => `p${i}`;

export interface Flow {
  from: Spot;
  to: Spot;
  amount: Paise;
  /** "Interest on capital ₹30,000 to Asha". */
  label: string;
}

export type LayerKind = 'ioc' | 'salary' | 'commission' | 'share' | 'guarantee' | 'iod';

export const LAYER_NAMES: Record<LayerKind, string> = {
  ioc: 'Interest on capital',
  salary: 'Salary',
  commission: 'Commission',
  share: 'Share of profit',
  guarantee: 'Guarantee made good',
  iod: 'Interest on drawings',
};

/** One kind of amount credited (or, for interest on drawings and a share of loss, debited) to a partner so far. */
export interface Layer {
  kind: LayerKind;
  /** Positive when credited to the partner, negative when debited. */
  amount: Paise;
}

export interface AppStep {
  key: 'profit' | 'iod' | 'ioc' | 'salary' | 'commission' | 'share' | 'guarantee' | 'accounts';
  title: string;
  /** What moves and why, in one or two sentences. */
  text: string;
  flows: Flow[];
  /** What is left in the appropriation account to share after this step. */
  pool: Paise;
  /** Each partner's layers after this step. */
  layers: Layer[][];
}

/** A row of an account in the board's format: an amount, or a heading with an amount for each partner under it. */
export interface AccRow {
  text: string;
  /** The amount in the outer column (the total of `sub` when there is one). */
  amount: Paise;
  sub?: { text: string; amount: Paise }[];
  /** The step of the walk-through that writes it. */
  step: number;
}

export interface TAccount {
  title: string;
  dr: AccRow[];
  cr: AccRow[];
  total: Paise;
}

/** A row of the partners' accounts in columns: one figure per partner (0 where the row has none for that partner). */
export interface ColRow {
  text: string;
  amounts: Paise[];
}

export interface ColAccount {
  title: string;
  dr: ColRow[];
  cr: ColRow[];
  totals: Paise[];
}

export interface Appropriation {
  input: AppropriationIn;
  /** 'full': every appropriation is met; 'short': the profit falls short of them; 'loss': a net loss. */
  case: 'full' | 'short' | 'loss';
  iod: Paise[];
  /** What is due by the deed: interest on capital, salary and commission. */
  iocDue: Paise[];
  salaryDue: Paise[];
  commissionDue: Paise[];
  /** What is allowed (less than what is due when the profit falls short; nothing with a loss). */
  ioc: Paise[];
  salary: Paise[];
  commission: Paise[];
  /** Net profit + interest on drawings. */
  available: Paise;
  /** Interest on capital + salaries + commission due. */
  due: Paise;
  /** What is shared in the profit-sharing ratio (negative for a loss). */
  divisible: Paise;
  /** Each partner's share of the divisible profit in the ratio, before any guarantee. */
  shares: Paise[];
  deficiency: Paise;
  /** What the guarantee moves: negative for a partner who bears it, positive for the partner guaranteed. */
  guaranteeMoves: Paise[];
  /** Shares after the guarantee. */
  finalShares: Paise[];
  /** Everything credited to each partner (appropriations and share) less interest on drawings. */
  netCredit: Paise[];
  steps: AppStep[];
  account: TAccount;
  /** The capital accounts (fluctuating) or the capital accounts and the current accounts (fixed). */
  partnerAccounts: ColAccount[];
}

const inr = formatINR;
const sumOf = (xs: readonly Paise[]): Paise => xs.reduce((s, x) => s + x, 0);
const list = (xs: readonly string[]): string => (xs.length <= 1 ? (xs[0] ?? '') : `${xs.slice(0, -1).join(', ')} and ${xs[xs.length - 1]}`);

/** The account a partner's share and appropriations go to. */
export const partnerAccount = (name: string, method: CapitalMethod): string => `${name}'s ${method === 'fixed' ? 'Current' : 'Capital'} A/c`;

/** Interest for a whole year on an amount at a rate % p.a., to the paisa. */
export const interestForYear = (amount: Paise, rate: number): Paise => Math.round((amount * rate) / 100);
/** Interest on drawings spread evenly over the year: six months on the total. */
export const interestOnDrawings = (drawings: Paise, rate: number): Paise => Math.round((drawings * rate) / 200);

export function appropriate(input: AppropriationIn): Appropriation {
  const { partners, netProfit, iocRate, iodRate, commission, guarantee, capitals } = input;
  const n = partners.length;
  const names = partners.map((p) => p.name);
  const zero = () => partners.map(() => 0);

  const iod = partners.map((p) => interestOnDrawings(p.drawings, iodRate));
  const loss = netProfit <= 0;
  const iocDue = partners.map((p) => (loss ? 0 : interestForYear(p.capital, iocRate)));
  const salaryDue = partners.map((p) => (loss ? 0 : p.salary));
  const commissionDue = zero();
  if (commission && !loss) commissionDue[commission.partner] = Math.round((netProfit * commission.rate) / 100);

  const available = netProfit + sumOf(iod);
  const due = sumOf(iocDue) + sumOf(salaryDue) + sumOf(commissionDue);
  const kase: Appropriation['case'] = loss ? 'loss' : available >= due ? 'full' : 'short';

  let ioc = iocDue;
  let salary = salaryDue;
  let comm = commissionDue;
  if (kase === 'short') {
    // The whole profit, in proportion to what is due: one split over every item, so the parts add up exactly.
    const parts = splitByRatio(available, [...iocDue, ...salaryDue, ...commissionDue]);
    ioc = parts.slice(0, n);
    salary = parts.slice(n, 2 * n);
    comm = parts.slice(2 * n);
  }
  const divisible = kase === 'short' ? 0 : available - due;
  const shares = splitByRatio(divisible, partners.map((p) => p.ratio));

  // The guarantee: the shortfall in the guaranteed partner's share, made good by whoever gave it.
  const guaranteeMoves = zero();
  let deficiency = 0;
  if (guarantee) {
    deficiency = Math.max(0, guarantee.amount - shares[guarantee.partner]);
    if (deficiency > 0) {
      if (guarantee.by === 'firm') {
        const others = partners.map((_, i) => i).filter((i) => i !== guarantee.partner);
        const parts = splitByRatio(deficiency, others.map((i) => partners[i].ratio));
        others.forEach((i, k) => (guaranteeMoves[i] = -parts[k]));
      } else {
        guaranteeMoves[guarantee.by] = -deficiency;
      }
      guaranteeMoves[guarantee.partner] = deficiency;
    }
  }
  const finalShares = shares.map((s, i) => s + guaranteeMoves[i]);
  const netCredit = partners.map((_, i) => ioc[i] + salary[i] + comm[i] + finalShares[i] - iod[i]);

  // ---- The walk-through ----
  const steps: AppStep[] = [];
  const layers: Layer[][] = partners.map(() => []);
  const snapshot = () => layers.map((ls) => ls.map((l) => ({ ...l })));
  const setLayer = (i: number, kind: LayerKind, amount: Paise) => {
    const ls = layers[i];
    const at = ls.findIndex((l) => l.kind === kind);
    if (amount === 0) {
      if (at >= 0) ls.splice(at, 1);
    } else if (at >= 0) ls[at] = { kind, amount };
    else ls.push({ kind, amount });
  };
  let pool = netProfit;
  const push = (key: AppStep['key'], title: string, text: string, flows: Flow[]) => steps.push({ key, title, text, flows, pool, layers: snapshot() });
  const acc = (i: number) => partnerAccount(names[i], capitals);

  if (netProfit === 0) {
    push(
      'profit',
      'Neither profit nor loss',
      'The Profit and Loss A/c shows neither a profit nor a loss. With no profit there is nothing to appropriate, so no interest on capital, salary or commission is allowed.',
      [],
    );
  } else if (loss) {
    push(
      'profit',
      'A net loss',
      `The net loss of ${inr(-netProfit)} comes from the Profit and Loss A/c to the debit of the Profit and Loss Appropriation A/c. With a loss there is no profit to appropriate, so no interest on capital, salary or commission is allowed.`,
      [{ from: 'outside', to: 'pool', amount: -netProfit, label: `Net loss ${inr(-netProfit)}` }],
    );
  } else {
    push(
      'profit',
      'The net profit',
      `The net profit of ${inr(netProfit)} comes from the Profit and Loss A/c to the credit of the Profit and Loss Appropriation A/c. Every charge, such as interest on a partner's loan, has already been met: what is here belongs to the partners.`,
      [{ from: 'outside', to: 'pool', amount: netProfit, label: `Net profit ${inr(netProfit)}` }],
    );
  }

  if (sumOf(iod) > 0) {
    iod.forEach((a, i) => setLayer(i, 'iod', -a));
    pool += sumOf(iod);
    const who = partners.map((p, i) => (iod[i] > 0 ? `${inr(iod[i])} from ${p.name}` : null)).filter((x): x is string => x !== null);
    push(
      'iod',
      'Interest on drawings',
      `Interest on drawings at ${iodRate}% p.a. for six months on what each partner drew (${list(who)}) is debited to the partners and credited to the appropriation account, so it adds to the profit to be shared.`,
      partners.map((p, i) => ({ from: partnerSpot(i), to: 'pool' as Spot, amount: iod[i], label: `Interest on drawings ${inr(iod[i])} from ${p.name}` })).filter((f) => f.amount > 0),
    );
  }

  const appropriationStep = (key: 'ioc' | 'salary' | 'commission', kind: LayerKind, allowed: Paise[], dueNow: Paise[], title: string, full: string) => {
    if (sumOf(dueNow) === 0) return;
    allowed.forEach((a, i) => setLayer(i, kind, a));
    pool -= sumOf(allowed);
    const each = partners.map((p, i) => (allowed[i] > 0 ? `${inr(allowed[i])} to ${p.name}` : null)).filter((x): x is string => x !== null);
    const firstCut = kase === 'short' && !steps.some((s) => s.key === 'ioc' || s.key === 'salary' || s.key === 'commission');
    const text =
      kase === 'short'
        ? `${firstCut ? `The profit to appropriate (${inr(available)}) is less than the interest, salaries and commission due (${inr(due)}). They are appropriations, so they come only out of profit: the whole ${inr(available)} is given in proportion to what is due. ` : ''}${title}: ${inr(sumOf(dueNow))} due, ${inr(sumOf(allowed))} allowed (${list(each)}).`
        : `${full} (${list(each)}).`;
    push(key, title, text, partners.map((p, i) => ({ from: 'pool' as Spot, to: partnerSpot(i), amount: allowed[i], label: `${title} ${inr(allowed[i])} to ${p.name}` })).filter((f) => f.amount > 0));
  };

  if (!loss) {
    appropriationStep('ioc', 'ioc', ioc, iocDue, 'Interest on capital', `Interest on capital at ${iocRate}% p.a. on each partner's capital is an appropriation of profit, credited to the partners`);
    appropriationStep('salary', 'salary', salary, salaryDue, 'Salary', `Partners' salaries are appropriations too, credited to the partners`);
    if (commission) {
      appropriationStep('commission', 'commission', comm, commissionDue, 'Commission', `${names[commission.partner]}'s commission is ${commission.rate}% of the net profit of ${inr(netProfit)} before charging it`);
    }
  }

  shares.forEach((s, i) => setLayer(i, 'share', s));
  pool -= sumOf(shares);
  const ratio = partners.map((p) => p.ratio).join(':');
  const shareList = list(partners.map((p, i) => `${inr(Math.abs(shares[i]))} to ${p.name}`));
  push(
    'share',
    divisible < 0 ? 'Sharing the loss' : 'Sharing the divisible profit',
    kase === 'short'
      ? 'Nothing is left after the appropriations, so there is no profit to share in the profit-sharing ratio.'
      : divisible === 0
        ? 'Nothing is left, so there is neither a profit nor a loss to share in the profit-sharing ratio.'
        : divisible < 0
        ? `The loss of ${inr(-divisible)} left after interest on drawings is shared in the profit-sharing ratio ${ratio}: ${shareList}. It is debited to the partners.`
        : `What is left, the divisible profit of ${inr(divisible)}, is shared in the profit-sharing ratio ${ratio}: ${shareList}.`,
    partners.map((p, i) => ({ from: 'pool' as Spot, to: partnerSpot(i), amount: Math.abs(shares[i]), label: `${divisible < 0 ? 'Share of loss' : 'Share of profit'} ${inr(Math.abs(shares[i]))} ${divisible < 0 ? 'debited to' : 'to'} ${p.name}` })).filter((f) => f.amount > 0),
  );

  if (guarantee) {
    const g = guarantee.partner;
    if (deficiency > 0) {
      partners.forEach((_, i) => {
        if (i === g) setLayer(i, 'guarantee', deficiency);
        else if (guaranteeMoves[i] !== 0) setLayer(i, 'share', shares[i] + guaranteeMoves[i]);
      });
      const bearers = partners.map((p, i) => (i !== g && guaranteeMoves[i] < 0 ? `${p.name} ${inr(-guaranteeMoves[i])}` : null)).filter((x): x is string => x !== null);
      const by =
        guarantee.by === 'firm'
          ? `The guarantee is given by the firm, so the other partners bear the ${inr(deficiency)} in their own ratio (${list(bearers)})`
          : `The guarantee is given by ${names[guarantee.by]}, who alone bears the ${inr(deficiency)}`;
      push(
        'guarantee',
        'The guarantee',
        `${names[g]} is guaranteed at least ${inr(guarantee.amount)} but has a share of ${shares[g] < 0 ? `a loss of ${inr(-shares[g])}` : inr(shares[g])}: a deficiency of ${inr(deficiency)}. ${by}.`,
        partners.map((p, i) => ({ from: partnerSpot(i), to: partnerSpot(g), amount: -guaranteeMoves[i], label: `${inr(-guaranteeMoves[i])} from ${p.name} to ${names[g]}` })).filter((f) => f.amount > 0),
      );
    } else {
      push('guarantee', 'The guarantee', `${names[g]} is guaranteed at least ${inr(guarantee.amount)} and has a share of ${inr(shares[g])}, which is more: the guarantee sets only a minimum, so nothing is made good.`, []);
    }
  }

  push(
    'accounts',
    'Into the partners\' accounts',
    capitals === 'fixed'
      ? `Capitals are fixed, so everything above (and the drawings) is posted to the partners' current accounts; the capital accounts stay at their opening balances.`
      : `Capitals are fluctuating, so everything above (and the drawings) is posted to the partners' capital accounts, which close at their new balances.`,
    [],
  );

  // ---- The Profit and Loss Appropriation Account ----
  const stepOf = (key: AppStep['key']) => steps.findIndex((s) => s.key === key);
  const subRows = (amounts: Paise[]) => partners.map((_, i) => ({ text: acc(i), amount: amounts[i] })).filter((r) => r.amount !== 0);
  const dr: AccRow[] = [];
  const cr: AccRow[] = [];
  if (loss) {
    if (netProfit < 0) dr.push({ text: 'To Profit and Loss A/c (Net Loss)', amount: -netProfit, step: stepOf('profit') });
  } else {
    cr.push({ text: 'By Profit and Loss A/c (Net Profit)', amount: netProfit, step: stepOf('profit') });
  }
  if (sumOf(iod) > 0) cr.push({ text: 'By Interest on Drawings:', amount: sumOf(iod), sub: subRows(iod), step: stepOf('iod') });
  if (sumOf(ioc) > 0) dr.push({ text: 'To Interest on Capital:', amount: sumOf(ioc), sub: subRows(ioc), step: stepOf('ioc') });
  if (sumOf(salary) > 0) dr.push({ text: "To Partner's Salary:", amount: sumOf(salary), sub: subRows(salary), step: stepOf('salary') });
  if (sumOf(comm) > 0) dr.push({ text: "To Partner's Commission:", amount: sumOf(comm), sub: subRows(comm), step: stepOf('commission') });
  const shareStep = guarantee && deficiency > 0 ? stepOf('guarantee') : stepOf('share');
  if (divisible > 0) dr.push({ text: 'To Profit transferred to:', amount: divisible, sub: subRows(finalShares), step: shareStep });
  if (divisible < 0) cr.push({ text: 'By Loss transferred to:', amount: -divisible, sub: subRows(finalShares.map((s) => -s)), step: shareStep });
  const total = Math.max(sumOf(dr.map((r) => r.amount)), sumOf(cr.map((r) => r.amount)));
  const yearEnd = input.yearEnd ?? '31 March 2026';
  const account: TAccount = { title: `Profit and Loss Appropriation Account for the year ended ${yearEnd}`, dr, cr, total };

  // ---- The partners' accounts, in columns ----
  const balanced = (title: string, drRows: ColRow[], crRows: ColRow[]): ColAccount => {
    const keep = (rows: ColRow[]) => rows.filter((r) => r.amounts.some((a) => a !== 0));
    const d = keep(drRows);
    const c = keep(crRows);
    const drSum = partners.map((_, i) => sumOf(d.map((r) => r.amounts[i])));
    const crSum = partners.map((_, i) => sumOf(c.map((r) => r.amounts[i])));
    const toCd = partners.map((_, i) => Math.max(0, crSum[i] - drSum[i]));
    const byCd = partners.map((_, i) => Math.max(0, drSum[i] - crSum[i]));
    if (toCd.some((a) => a > 0)) d.push({ text: 'To Balance c/d', amounts: toCd });
    if (byCd.some((a) => a > 0)) c.push({ text: 'By Balance c/d', amounts: byCd });
    return { title, dr: d, cr: c, totals: partners.map((_, i) => Math.max(drSum[i], crSum[i])) };
  };
  const positive = (xs: Paise[]) => xs.map((x) => Math.max(0, x));
  const negative = (xs: Paise[]) => xs.map((x) => Math.max(0, -x));
  const items = (opening: boolean) => {
    const drRows: ColRow[] = [
      { text: 'To Drawings A/c', amounts: partners.map((p) => p.drawings) },
      { text: 'To Interest on Drawings A/c', amounts: iod },
      { text: 'To Profit and Loss Appropriation A/c', amounts: negative(finalShares) },
    ];
    const crRows: ColRow[] = [
      ...(opening ? [{ text: 'By Balance b/d', amounts: partners.map((p) => p.capital) }] : []),
      { text: 'By Interest on Capital A/c', amounts: ioc },
      { text: "By Partner's Salary A/c", amounts: salary },
      { text: "By Partner's Commission A/c", amounts: comm },
      { text: 'By Profit and Loss Appropriation A/c', amounts: positive(finalShares) },
    ];
    return { drRows, crRows };
  };
  const partnerAccounts: ColAccount[] = [];
  if (capitals === 'fixed') {
    partnerAccounts.push(balanced("Partners' Capital Accounts", [], [{ text: 'By Balance b/d', amounts: partners.map((p) => p.capital) }]));
    const it = items(false);
    partnerAccounts.push(balanced("Partners' Current Accounts", it.drRows, it.crRows));
  } else {
    const it = items(true);
    partnerAccounts.push(balanced("Partners' Capital Accounts", it.drRows, it.crRows));
  }

  return {
    input,
    case: kase,
    iod,
    iocDue,
    salaryDue,
    commissionDue,
    ioc,
    salary,
    commission: comm,
    available,
    due,
    divisible,
    shares,
    deficiency,
    guaranteeMoves,
    finalShares,
    netCredit,
    steps,
    account,
    partnerAccounts,
  };
}
