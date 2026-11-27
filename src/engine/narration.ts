import { CLASS12_ACCOUNTS, resolveAccount } from './accounts';
import { accountLabel } from './books';
import type { JournalLine } from './journal';

// The narration of a journal entry, "(Being goods purchased on credit from Ravi)", which a CBSE answer writes under
// every entry and loses marks without. A question may give its own (`narration`); otherwise it is worked out from the
// entry itself, by the accounts it moves, with the words of the transaction (where they are at hand) to tell apart
// what the accounts alone cannot: a cheque from one paid straight into the bank, a rectifying entry from the
// transaction it puts right. An entry no rule knows is said by the accounts debited and credited, which is never wrong;
// a rule says an entry only where its accounts leave no doubt what it records.

const MONEY = new Set(['cash', 'bank', 'pettyCash']);
const GST = /^(input|output)[CSI]GST$/;
/** The accounts of a firm or a company, and the families of a partner's (and a vendor's, a debenture's) accounts. */
const CLASS12 = new Set(CLASS12_ACCOUNTS.map((a) => a.id));
const FAMILY = /^(capital|current|drawings|partnerLoan|loanTo|executor|vendor|debentures):/;

const isDebtor = (id: string) => id.startsWith('debtor:');
const isCreditor = (id: string) => id.startsWith('creditor:') || id.startsWith('vendor:');
const isVendor = (id: string) => id.startsWith('vendor:');
const isCapital = (id: string) => id.startsWith('capital:');
const isCurrent = (id: string) => id.startsWith('current:');
/** A partner's capital or current account. */
const isPartner = (id: string) => isCapital(id) || isCurrent(id);
const party = (id: string) => resolveAccount(id).name;
/** The name of the partner (or of the debentures' rate) an account of a family is kept for: "Asha" of "capital:Asha". */
const who = (id: string) => id.slice(id.indexOf(':') + 1);
/** "furniture", "office equipment": the name of an account as a common noun inside a sentence. */
const noun = (id: string) => resolveAccount(id).name.toLowerCase();
const type = (id: string) => resolveAccount(id).type;
const plainAsset = (id: string) =>
  type(id) === 'asset' &&
  !MONEY.has(id) &&
  !isDebtor(id) &&
  !FAMILY.test(id) &&
  !CLASS12.has(id) &&
  !resolveAccount(id).temporary &&
  !resolveAccount(id).contra &&
  !['prepaidExpenses', 'accruedIncome', 'insuranceClaimReceivable', 'billsReceivable', 'investments', 'stock'].includes(id);
/** An expense that is paid away (not a loss, a write-off or an allowance worked out in the books). */
const paidExpense = (id: string) =>
  type(id) === 'expense' &&
  !resolveAccount(id).contra &&
  !CLASS12.has(id) &&
  !['purchases', 'badDebts', 'depreciation', 'discountAllowed', 'lossOnSaleOfAsset', 'lossByFire', 'lossByTheft', 'interestOnCapital'].includes(id);
/** An income that is received in money (not one worked out in the books). */
const receivedIncome = (id: string) =>
  type(id) === 'income' &&
  !resolveAccount(id).contra &&
  !['discountReceived', 'profitOnSaleOfAsset', 'interestOnDrawings', 'badDebtsRecovered'].includes(id);

/** What an expense is called inside a sentence where its account name says it less well: "electricity charges". */
const EXPENSE_NOUN: Record<string, string> = {
  commissionPaid: 'commission',
  interestPaid: 'interest',
  electricity: 'electricity charges',
  telephone: 'telephone charges',
  insurance: 'insurance premium',
  advertisement: 'advertisement expenses',
  debentureInterest: 'interest on debentures',
};
const expenseNoun = (id: string) => EXPENSE_NOUN[id] ?? noun(id);
/** What an income account was received as: "commission", "rent", "interest". */
const incomeNoun = (id: string) => noun(id).replace(/ received$/, '');

/** "A, B and C". */
const list = (names: readonly string[]) => (names.length < 2 ? names.join('') : `${names.slice(0, -1).join(', ')} and ${names.at(-1)}`);

/** The entry a rule reads: the accounts on each side (GST left out), and the words of the transaction ('' when none). */
interface Entry {
  dr: string[];
  cr: string[];
  text: string;
}

/** How money moved: in cash, by cheque through the bank, or out of the petty cash. */
const how = (id: string) => (id === 'bank' ? 'by cheque' : id === 'pettyCash' ? 'out of petty cash' : 'in cash');
/** "<what> paid by cheque", or, where the bank paid it on its own, as the bank statement shows it. */
function paid(what: string, from: string, text: string): string {
  if (from === 'bank' && /standing instruction/i.test(text)) return `${what} paid by the bank under a standing instruction`;
  if (from === 'bank' && /\bbank (has )?debited|debited by the bank/i.test(text)) return `${what} debited by the bank`;
  return `${what} paid ${how(from)}`;
}
/** "<what> received by cheque", or, where it reached the bank without the business, as the bank statement shows it. */
function received(what: string, into: string, text: string): string {
  if (into === 'bank' && /directly into/i.test(text)) return `${what} received directly in the bank account`;
  if (into === 'bank' && /\bbank (has )?collected|collected by the bank/i.test(text)) return `${what} collected by the bank`;
  if (into === 'bank' && /\bbank (has )?credited|credited by the bank/i.test(text)) return `${what} credited by the bank`;
  return `${what} received ${how(into)}`;
}

/** The partners' accounts of an entry, as one: "the partners' capital accounts". */
const partnersPlural = (ids: readonly string[]) =>
  ids.every(isCapital) ? "the partners' capital accounts" : ids.every(isCurrent) ? "the partners' current accounts" : "the partners' accounts";
/** What a partner's accounts on one side are, inside a sentence: "the partners' capital accounts", "Asha's Capital A/c". */
const partnersAccounts = (ids: readonly string[]) => (ids.length === 1 ? accountLabel(ids[0]) : partnersPlural(ids));
const names = (ids: readonly string[]) => list(ids.map(who));

/** A rule: the narration of an entry (without "Being"), or null where the rule does not fit it. */
type Rule = (e: Entry) => string | null;
/** A rule for an entry of one debit and one credit. */
const one =
  (say: (d: string, c: string, text: string) => string | null): Rule =>
  ({ dr, cr, text }) =>
    dr.length === 1 && cr.length === 1 ? say(dr[0], cr[0], text) : null;
const all = (ids: readonly string[], test: (id: string) => boolean) => ids.length > 0 && ids.every(test);

// ---------------------------------------------------------------------------------------------------------------
// The words of a rectifying entry. The accounts of an entry that puts an error right are those of an ordinary
// transaction, often at twice its amount: only the words of the question tell it apart, and its narration says what
// it does, never the transaction it looks like.
// ---------------------------------------------------------------------------------------------------------------

/** A transaction left out of the books altogether, now recorded. */
const OMITTED = /not (been )?(recorded|entered|posted) in any book|left out of the books|\b(was|were|been) omitted\b|omitted to be recorded/i;
/** An error in the books, in words that say so: a wrong account, side, amount or book, a posting left out or made twice. */
const ERROR = new RegExp(
  [
    String.raw`recorded by (debiting|crediting)`,
    String.raw`\b(entered|recorded|posted)( it| them)? (in|on|to|into) (the|its|a) [\w'& ]{1,40}? as\b`,
    String.raw`\b(entered|recorded|posted) twice\b`,
    String.raw`\bentered on the (payments|receipts|debit|credit)`,
    String.raw`\bnot posted\b`,
    String.raw`\binstead of\b`,
    String.raw`\berror\b|\bwrongly\b|\bby mistake\b|\bundercast\b|\bovercast\b|\brectif`,
  ].join('|'),
  'i',
);
/**
 * Words that may tell of an error ("was debited to Wages A/c") as well as of an ordinary entry ("was debited to
 * Insurance A/c in full", to be adjusted at the year end): an entry with them is a rectifying one only where no rule
 * of the usual transactions knows it.
 */
const MAYBE_ERROR = /(?<!already )\b(was|were|been|found|had) (debited|credited|posted) to [A-Z][\w'& ]{0,40}? A\/c/;

// ---------------------------------------------------------------------------------------------------------------
// Class 12 first: the accounts of a firm and of a company name what an entry records.
// ---------------------------------------------------------------------------------------------------------------

/** The words of an issue of debentures: at a premium, at a discount, redeemable at a premium. */
function debentureTerms(dr: readonly string[], cr: readonly string[]): string {
  const terms = [
    ...(cr.includes('securitiesPremium') ? ['issued at a premium'] : []),
    ...(dr.includes('discountOnIssueOfDebentures') ? ['issued at a discount'] : []),
    ...(cr.includes('premiumOnRedemptionOfDebentures') ? ['redeemable at a premium'] : []),
  ];
  return terms.length > 0 ? `, ${list(terms)}` : '';
}
const isDebentures = (id: string) => id.startsWith('debentures:');
const DEBENTURE_ISSUE_EXTRAS = new Set(['securitiesPremium', 'premiumOnRedemptionOfDebentures', 'discountOnIssueOfDebentures', 'lossOnIssueOfDebentures']);

/** The kind of shares an account of a share issue is kept for, and what it is. */
function shareAccount(id: string): { kind: 'equity' | 'preference'; part: string } | null {
  const m = /^(equity|preference)Share(Capital|Application|Allotment|FirstCall|SecondAndFinalCall|FirstAndFinalCall|ApplicationAndAllotment)$/.exec(id);
  return m ? { kind: m[1] as 'equity' | 'preference', part: m[2] } : null;
}
const isShare = (part: string) => (id: string) => shareAccount(id)?.part === part;
/** What the money due on a call or on allotment is called: "allotment", "first call". */
const CALL_NAME: Record<string, string> = {
  Allotment: 'allotment',
  FirstCall: 'first call',
  SecondAndFinalCall: 'second and final call',
  FirstAndFinalCall: 'first and final call',
  ApplicationAndAllotment: 'application and allotment',
  Application: 'application',
};
const callOf = (id: string) => CALL_NAME[shareAccount(id)?.part ?? ''] ?? null;

/** An asset or a liability the books have not shown so far, brought in on revaluation. */
const UNRECORDED = /not (been )?(recorded|shown)|unrecorded|to be recorded|to be brought in/i;
/**
 * What revaluation did to the accounts on the other side of Revaluation A/c, one phrase for each kind: "decrease in
 * the value of stock and machinery, and provision for doubtful debts raised". Null where an account is not an asset
 * or a liability.
 */
function revalued(ids: readonly string[], result: 'loss' | 'gain', text: string): string | null {
  const assets = ids.filter((id) => type(id) === 'asset' && !resolveAccount(id).contra && !resolveAccount(id).temporary && !MONEY.has(id));
  const liabilities = ids.filter((id) => type(id) === 'liability');
  const provision = ids.includes('provisionForDoubtfulDebts');
  if (assets.length + liabilities.length + (provision ? 1 : 0) !== ids.length) return null;
  const unrecorded = UNRECORDED.test(text) && ids.length === 1;
  const parts: string[] = [];
  const badDebts = result === 'loss' && assets.includes('debtors') && /\bbad\b/i.test(text);
  const valued = assets.filter((id) => !(badDebts && id === 'debtors'));
  if (badDebts) parts.push('bad debts written off');
  if (valued.length > 0) {
    if (unrecorded && result === 'gain') parts.push(`unrecorded ${list(valued.map(noun))} brought into the books`);
    else parts.push(`${result === 'loss' ? 'decrease' : 'increase'} in the value of ${list(valued.map(noun))}`);
  }
  if (provision) parts.push(`provision for doubtful debts ${result === 'loss' ? 'raised' : 'reduced'}`);
  if (liabilities.length > 0) {
    if (unrecorded && result === 'loss') parts.push(`unrecorded ${list(liabilities.map(noun))} brought into the books`);
    else parts.push(`${result === 'loss' ? 'increase' : 'decrease'} in ${list(liabilities.map(noun))}`);
  }
  return parts.length === 1 ? parts[0] : `${parts.slice(0, -1).join(', ')} and ${parts.at(-1)}`;
}
const RESERVES = new Set(['generalReserve', 'workmenCompensationReserve', 'investmentFluctuationReserve']);
const WRITTEN_OFF = new Set(['goodwill', 'advertisementSuspense', 'deferredRevenueExpenditure']);
/** "took over", "took them over", "agreed to take over". */
const TAKES_OVER = /\b(took|take|takes|taken|taking)\b[\w ]{0,20}?\bover\b/i;
/** When a partner leaves: "death" or "retirement", from the words of the question. */
const leaving = (text: string) => (/\b(death|died|dies|deceased)\b/i.test(text) ? 'death' : /\bretire/i.test(text) ? 'retirement' : null);

const CLASS12_RULES: [name: string, rule: Rule][] = [
  // A partnership: appropriations of profit.
  ['interest on capital allowed', ({ dr, cr }) => (dr.length === 1 && dr[0] === 'interestOnCapital' && all(cr, (id) => isPartner(id) || id === 'capital') ? 'interest on capital allowed' : null)],
  ['interest on drawings charged', ({ dr, cr }) => (cr.length === 1 && cr[0] === 'interestOnDrawings' && all(dr, (id) => isPartner(id) || id.startsWith('drawings')) ? 'interest on drawings charged' : null)],
  ['salary or commission allowed', ({ dr, cr }) => {
    if (dr.length !== 1 || !all(cr, isPartner)) return null;
    if (dr[0] === 'partnersSalary') return `salary allowed to ${names(cr)}`;
    if (dr[0] === 'partnersCommission') return `commission allowed to ${names(cr)}`;
    return null;
  }],
  ['interest on a partner\'s loan', one((d, c) => ((d === 'interestOnPartnersLoan' || d === 'interestOnLoan') && c.startsWith('partnerLoan:') ? `interest on ${who(c)}'s loan credited to ${who(c)}'s Loan A/c` : null))],
  ['appropriations closed', ({ dr, cr }) => {
    // The appropriations themselves (interest on capital, salary, commission) closed to Profit and Loss Appropriation A/c.
    const items = ['interestOnCapital', 'partnersSalary', 'partnersCommission'];
    if (dr.length === 1 && dr[0] === 'profitAndLossAppropriation' && all(cr, (id) => items.includes(id))) return `${list(cr.map(noun))} transferred to Profit and Loss Appropriation A/c`;
    if (cr.length === 1 && cr[0] === 'profitAndLossAppropriation' && all(dr, (id) => id === 'interestOnDrawings')) return 'interest on drawings transferred to Profit and Loss Appropriation A/c';
    return null;
  }],
  ['profit to appropriation', one((d, c) => (d === 'profitAndLoss' && c === 'profitAndLossAppropriation' ? 'net profit transferred to Profit and Loss Appropriation A/c' : d === 'profitAndLossAppropriation' && c === 'profitAndLoss' ? 'net loss transferred to Profit and Loss Appropriation A/c' : null))],
  ['appropriation to partners', ({ dr, cr, text }) => {
    if (dr.length !== 1 || dr[0] !== 'profitAndLossAppropriation' || !all(cr, isPartner)) return null;
    if (/\bsalary\b/i.test(text)) return `salary allowed to ${names(cr)}`;
    if (/\bcommission\b/i.test(text)) return `commission allowed to ${names(cr)}`;
    if (/interest on capital/i.test(text)) return 'interest on capital allowed';
    return cr.length > 1 ? `profit distributed among the partners` : null;
  }],
  ['partners debited through appropriation', ({ dr, cr, text }) => {
    if (cr.length !== 1 || cr[0] !== 'profitAndLossAppropriation' || !all(dr, isPartner)) return null;
    if (/interest on drawings/i.test(text)) return 'interest on drawings charged';
    return dr.length > 1 && !/drawings/i.test(text) ? `loss transferred to ${partnersPlural(dr)}` : null;
  }],
  // A partnership: reserves, accumulated profits and losses, and fictitious assets, shared out or written off.
  ['reserves distributed', ({ dr, cr }) => (all(dr, (id) => RESERVES.has(id)) && all(cr, isPartner) ? `${list(dr.map(noun))} distributed among the partners` : null)],
  ['reserve used', ({ dr, cr }) => {
    // A reserve set aside for a claim or a fall in value, used for it on reconstitution: the excess charged to
    // Revaluation A/c, the balance shared among the partners.
    const [reserve, ...extra] = dr;
    const what: Record<string, [string, string]> = {
      workmenCompensationReserve: ['workmenCompensationClaim', 'workmen compensation claim met out of the reserve'],
      investmentFluctuationReserve: ['investments', 'fall in the value of investments met out of the reserve'],
    };
    if (!what[reserve] || !extra.every((id) => id === 'revaluation')) return null;
    const [target, used] = what[reserve];
    if (!cr.includes(target) || !cr.every((id) => id === target || isPartner(id))) return null;
    const parts = [used];
    if (extra.length > 0) parts.push('the excess charged to Revaluation A/c');
    if (cr.some(isPartner)) parts.push('the balance distributed among the partners');
    return parts.length === 1 ? parts[0] : `${parts[0]}, ${list(parts.slice(1))}`;
  }],
  ['accumulated profit distributed', ({ dr, cr }) => (dr.length === 1 && dr[0] === 'profitAndLoss' && all(cr, isPartner) ? `credit balance of Profit and Loss A/c distributed among the partners` : null)],
  ['accumulated loss written off', ({ dr, cr }) => (cr.length === 1 && cr[0] === 'profitAndLoss' && all(dr, isPartner) ? `debit balance of Profit and Loss A/c written off among the partners` : null)],
  ['written off among the partners', ({ dr, cr }) => (all(dr, isPartner) && all(cr, (id) => WRITTEN_OFF.has(id)) ? `${list(cr.map(noun))} written off among the partners` : null)],
  // A partnership: revaluation.
  ['revaluation profit', ({ dr, cr }) => (dr.length === 1 && dr[0] === 'revaluation' && all(cr, isPartner) ? `profit on revaluation transferred to ${partnersAccounts(cr)}` : null)],
  ['revaluation loss', ({ dr, cr }) => (cr.length === 1 && cr[0] === 'revaluation' && all(dr, isPartner) ? `loss on revaluation transferred to ${partnersAccounts(dr)}` : null)],
  ['revaluation, a loss', ({ dr, cr, text }) => {
    if (dr.length !== 1 || dr[0] !== 'revaluation' || cr.some(isPartner)) return null;
    if (cr.length === 1 && MONEY.has(cr[0])) return `revaluation expenses paid ${how(cr[0])}`;
    const said = revalued(cr, 'loss', text);
    return said && `${said} on revaluation`;
  }],
  ['revaluation, a gain', ({ dr, cr, text }) => {
    if (cr.length !== 1 || cr[0] !== 'revaluation' || dr.some(isPartner)) return null;
    const said = revalued(dr, 'gain', text);
    return said && `${said} on revaluation`;
  }],
  // A partnership: goodwill.
  ['premium for goodwill brought in', ({ dr, cr }) => {
    if (dr.length !== 1 || !MONEY.has(dr[0]) || !cr.includes('premiumForGoodwill')) return null;
    const others = cr.filter((id) => id !== 'premiumForGoodwill');
    if (others.length === 0) return 'premium for goodwill brought in';
    return others.length === 1 && isCapital(others[0]) ? `capital and premium for goodwill brought in by ${who(others[0])}` : null;
  }],
  ['premium for goodwill shared', ({ dr, cr }) => {
    if (!dr.includes('premiumForGoodwill') || !all(cr, isPartner)) return null;
    const newcomer = dr.filter((id) => id !== 'premiumForGoodwill');
    if (!all(newcomer, isPartner) && newcomer.length > 0) return null;
    return newcomer.length === 0
      ? 'premium for goodwill credited to the sacrificing partners'
      : `${names(newcomer)}'s share of goodwill credited to the sacrificing partners`;
  }],
  // A partnership: the partners' own accounts, one against another.
  ['between the partners', ({ dr, cr, text }) => {
    if (!all(dr, isPartner) || !all(cr, isPartner)) return null;
    const side = (ids: string[]) => new Set(ids.map(who));
    const same = dr.length === 1 && cr.length === 1 && who(dr[0]) === who(cr[0]);
    if (same) return `amount transferred from ${accountLabel(dr[0])} to ${accountLabel(cr[0])}`;
    const alike = (a: Set<string>, b: Set<string>) => a.size === b.size && [...a].every((n) => b.has(n));
    if (alike(side(dr), side(cr)) && dr.every(isCapital) !== cr.every(isCapital)) return `amounts transferred from ${partnersPlural(dr)} to ${partnersPlural(cr)}`;
    if ([...side(dr)].some((n) => side(cr).has(n))) return null;
    if (/guarantee|deficiency/i.test(text)) return `deficiency in ${names(cr)}'s guaranteed share made good by ${names(dr)}`;
    if (/goodwill/i.test(text) && !/single|combined|one adjusting|book values|reserve|revaluation/i.test(text)) {
      return 'adjustment for goodwill made between the gaining and the sacrificing partners';
    }
    return `adjustment made through ${partnersPlural([...dr, ...cr])}`;
  }],
  ['drawings closed', one((d, c) => (isPartner(d) && c.startsWith('drawings:') && who(c) === who(d) ? `${who(d)}'s drawings transferred to ${accountLabel(d)}` : null))],
  ['loan to a partner closed', one((d, c) => (isPartner(d) && c.startsWith('loanTo:') && who(c) === who(d) ? `loan given to ${who(d)} transferred to ${accountLabel(d)}` : null))],
  // A partnership: a partner who leaves.
  ['share of profit to the date of leaving', one((d, c, text) => {
    if (d !== 'profitAndLossSuspense' || !isPartner(c)) return null;
    const when = leaving(text);
    return `${who(c)}'s share of profit up to the date of ${when ?? 'leaving the firm'}`;
  })],
  ['amount due transferred', ({ dr, cr }) => {
    if (dr.length !== 1 || !isCapital(dr[0])) return null;
    const n = who(dr[0]);
    const loan = cr.find((id) => id === `partnerLoan:${n}`);
    const executor = cr.find((id) => id === `executor:${n}`);
    const paidNow = cr.find((id) => MONEY.has(id));
    if (cr.length === 1 && loan) return `the amount due to ${n} transferred to ${n}'s Loan A/c`;
    if (cr.length === 1 && executor) return `the amount due to ${n} transferred to ${n}'s Executor's A/c`;
    if (cr.length === 2 && loan && paidNow) return `${n} paid ${how(paidNow)} in part, and the balance transferred to ${n}'s Loan A/c`;
    if (cr.length === 2 && executor && paidNow) return `${n}'s executor paid ${how(paidNow)} in part, and the balance transferred to ${n}'s Executor's A/c`;
    return null;
  }],
  ['loan of a partner repaid', one((d, c, text) => {
    if (!d.startsWith('partnerLoan:') || !MONEY.has(c)) return null;
    if (/instalment/i.test(text)) return `instalment paid to ${who(d)} on ${who(d)}'s Loan A/c${/interest/i.test(text) ? ', with interest' : ''}`;
    return `${who(d)}'s loan repaid`;
  })],
  ['executor paid', one((d, c) => (d.startsWith('executor:') && MONEY.has(c) ? `amount paid to ${who(d)}'s executor` : null))],
  // A partnership: money brought in or paid out.
  ['assets brought in by a partner', ({ dr, cr }) =>
    cr.length === 1 && isCapital(cr[0]) && all(dr, (id) => type(id) === 'asset' && !MONEY.has(id) && !resolveAccount(id).temporary && !resolveAccount(id).contra)
      ? `${list(dr.map(noun))} brought in by ${who(cr[0])} as capital`
      : null],
  ['brought in by a partner', ({ dr, cr, text }) => {
    if (dr.length !== 1 || !MONEY.has(dr[0]) || !all(cr, isPartner)) return null;
    if (/dissol|realisation|deficiency|settle/i.test(text)) {
      return cr.length === 1 ? `amount brought in by ${who(cr[0])} to settle ${who(cr[0])}'s account` : `amounts brought in by ${names(cr)} to settle their accounts`;
    }
    return `capital brought in by ${names(cr)}`;
  }],
  ['paid to partners', ({ dr, cr, text }) => {
    if (!all(dr, isPartner) || cr.length !== 1 || !MONEY.has(cr[0])) return null;
    if (/behalf/i.test(text)) return `expenses paid by the firm on behalf of ${names(dr)}`;
    if (/premium/i.test(text)) return `premium for goodwill withdrawn by ${names(dr)}`;
    return dr.length === 1 ? `amount paid to ${who(dr[0])}` : `amounts paid to the partners`;
  }],
  // A partnership: dissolution.
  ['assets realised', ({ dr, cr, text }) => (dr.length === 1 && MONEY.has(dr[0]) && cr.length === 1 && cr[0] === 'realisation' ? (/written off|unrecorded|recovered/i.test(text) ? 'unrecorded asset realised' : 'assets realised') : null)],
  ['liabilities or expenses paid', one((d, c, text) => {
    if (d !== 'realisation' || !MONEY.has(c)) return null;
    if (/realisation expenses|dissolution expenses/i.test(text)) return `realisation expenses paid ${how(c)}`;
    if (/not (been )?(provided|recorded)|unrecorded|claim/i.test(text)) return `unrecorded liability paid ${how(c)}`;
    if (/creditor|liabilit|loan|bill|outstanding/i.test(text)) return `liabilities paid ${how(c)}`;
    return null;
  })],
  ['transferred to realisation', ({ dr, cr }) => {
    const toClose = (id: string) => !MONEY.has(id) && !isPartner(id);
    if (dr.length === 1 && dr[0] === 'realisation' && cr.length > 1 && all(cr, (id) => toClose(id) && type(id) === 'asset' && !resolveAccount(id).contra)) {
      return 'assets transferred to Realisation A/c';
    }
    const liability = (id: string) => toClose(id) && (type(id) === 'liability' || id === 'provisionForDoubtfulDebts');
    if (cr.length === 1 && cr[0] === 'realisation' && all(dr, liability) && (dr.length > 1 || !dr[0].startsWith('partnerLoan:'))) {
      return 'liabilities transferred to Realisation A/c';
    }
    return null;
  }],
  ['realisation with a partner', ({ dr, cr, text }) => {
    if (dr.length === 1 && dr[0] === 'realisation' && all(cr, isPartner)) {
      if (cr.length > 1) return `profit on realisation transferred to ${partnersAccounts(cr)}`;
      const n = who(cr[0]);
      if (/remuneration/i.test(text)) return `remuneration allowed to ${n}`;
      if (/expenses/i.test(text)) return `realisation expenses paid by ${n}`;
      if (TAKES_OVER.test(text) || /pay off|pays off|agreed to pay|personally|liabilit|bill/i.test(text)) return `liability taken over by ${n}`;
      if (/profit|close|result/i.test(text)) return `profit on realisation transferred to ${accountLabel(cr[0])}`;
      return null;
    }
    if (cr.length === 1 && cr[0] === 'realisation' && all(dr, (id) => isPartner(id) || id.startsWith('partnerLoan:'))) {
      if (dr.length > 1) return `loss on realisation transferred to ${partnersAccounts(dr)}`;
      const n = who(dr[0]);
      // One partner debited alone takes an asset over (a loss on realisation is shared by all the partners).
      return `asset taken over by ${n}${dr[0].startsWith('partnerLoan:') ? ` in part payment of ${n}'s loan` : ''}`;
    }
    return null;
  }],
  // A company: shares.
  ['share money received', ({ dr, cr }) => {
    if (dr.length < 1 || !MONEY.has(dr[0]) || !dr.slice(1).every((id) => id === 'callsInArrears') || cr.length < 1) return null;
    const due = cr.filter((id) => id !== 'callsInAdvance');
    if (due.length !== 1 || !shareAccount(due[0]) || shareAccount(due[0])!.part === 'Capital') return null;
    const s = shareAccount(due[0])!;
    const arrears = dr.includes('callsInArrears') ? ', except on the shares in arrears' : '';
    const advance = cr.includes('callsInAdvance') ? ', with calls in advance' : '';
    return `${callOf(due[0])} money received on ${s.kind} shares${arrears}${advance}`;
  }],
  ['share money due', ({ dr, cr }) => {
    if (dr.length !== 1 || !shareAccount(dr[0]) || !['Allotment', 'FirstCall', 'SecondAndFinalCall', 'FirstAndFinalCall'].includes(shareAccount(dr[0])!.part)) return null;
    if (!cr.some(isShare('Capital')) || !cr.every((id) => isShare('Capital')(id) || id === 'securitiesPremium')) return null;
    return `${callOf(dr[0])} money due on ${shareAccount(dr[0])!.kind} shares${cr.includes('securitiesPremium') ? ', with the premium' : ''}`;
  }],
  ['application money transferred', ({ dr, cr }) => {
    if (dr.length !== 1 || !(isShare('Application')(dr[0]) || isShare('ApplicationAndAllotment')(dr[0]))) return null;
    const kind = shareAccount(dr[0])!.kind;
    const money = callOf(dr[0]);
    if (cr.length === 1 && MONEY.has(cr[0])) return `${money} money refunded on the applications rejected`;
    if (!cr.some(isShare('Capital'))) return null;
    const rest = cr.filter((id) => !isShare('Capital')(id) && id !== 'securitiesPremium');
    if (!rest.every((id) => isShare('Allotment')(id) || MONEY.has(id) || id === 'callsInAdvance')) return null;
    const parts = [`${money} money on ${kind} shares transferred to share capital${cr.includes('securitiesPremium') ? ' and securities premium' : ''}`];
    if (rest.some(isShare('Allotment'))) parts.push('the excess adjusted against allotment');
    const later = rest.some(isShare('Allotment')) ? 'the rest' : 'the excess';
    if (rest.includes('callsInAdvance')) parts.push(`${later} held as calls in advance`);
    if (rest.some((id) => MONEY.has(id))) parts.push(`${later} refunded`);
    return parts.length === 1 ? parts[0] : `${parts[0]}, ${list(parts.slice(1))}`;
  }],
  ['shares forfeited', ({ dr, cr }) => {
    if (!dr.some(isShare('Capital')) || !dr.every((id) => isShare('Capital')(id) || id === 'securitiesPremium') || !cr.includes('forfeitedShares')) return null;
    const unpaid = cr.filter((id) => id !== 'forfeitedShares');
    if (unpaid.length === 0 || !unpaid.every((id) => id === 'callsInArrears' || callOf(id) !== null)) return null;
    const kind = shareAccount(dr.find(isShare('Capital'))!)!.kind;
    if (unpaid.includes('callsInArrears')) return `${kind} shares forfeited for non-payment of the calls in arrears`;
    return `${kind} shares forfeited for non-payment of ${list(unpaid.map((id) => callOf(id)!))} money`;
  }],
  ['forfeited shares reissued', ({ dr, cr }) => {
    if (!dr.includes('forfeitedShares') || !dr.every((id) => id === 'forfeitedShares' || MONEY.has(id)) || !cr.some(isShare('Capital'))) return null;
    return `forfeited ${shareAccount(cr.find(isShare('Capital'))!)!.kind} shares reissued`;
  }],
  ['shares reissued', ({ dr, cr, text }) => {
    if (dr.length !== 1 || !MONEY.has(dr[0]) || !cr.some(isShare('Capital')) || !cr.every((id) => isShare('Capital')(id) || id === 'securitiesPremium')) return null;
    return /reissu/i.test(text) ? `forfeited ${shareAccount(cr.find(isShare('Capital'))!)!.kind} shares reissued` : null;
  }],
  ['calls in advance', ({ dr, cr }) => {
    if (dr.length === 1 && dr[0] === 'callsInAdvance' && cr.length === 1 && callOf(cr[0])) return `calls in advance adjusted against the ${callOf(cr[0])}`;
    if (dr.length === 1 && MONEY.has(dr[0]) && cr.length === 1 && cr[0] === 'callsInAdvance') return 'calls received in advance';
    return null;
  }],
  ['gain on reissue', one((d, c) => (d === 'forfeitedShares' && c === 'capitalReserve' ? 'gain on reissue of forfeited shares transferred to capital reserve' : null))],
  ['shares to a vendor', ({ dr, cr }) => {
    if (dr.length !== 1 || !isVendor(dr[0]) || !cr.some(isShare('Capital')) || !cr.every((id) => isShare('Capital')(id) || id === 'securitiesPremium')) return null;
    return `${shareAccount(cr.find(isShare('Capital'))!)!.kind} shares issued to ${party(dr[0])} in payment of the purchase consideration`;
  }],
  ['bought from a vendor', ({ dr, cr }) => {
    const vendors = cr.filter(isVendor);
    if (vendors.length !== 1) return null;
    const others = cr.filter((id) => !isVendor(id));
    if (!all(dr, (id) => type(id) === 'asset' && !MONEY.has(id) && !resolveAccount(id).temporary && !resolveAccount(id).contra)) return null;
    if (!others.every((id) => type(id) === 'liability' || id === 'capitalReserve')) return null;
    // Liabilities taken over, goodwill paid for, or stock and debtors taken over make it the purchase of a business.
    if (others.length > 0 || dr.some((id) => ['goodwill', 'stock', 'debtors'].includes(id))) {
      return `business purchased from ${party(vendors[0])}${cr.includes('capitalReserve') ? ', the excess of the net assets over the price credited to capital reserve' : ''}`;
    }
    return `${list(dr.map(noun))} purchased from ${party(vendors[0])}`;
  }],
  // A company: debentures.
  ['debenture money received', one((d, c) => (MONEY.has(d) && ['debentureApplication', 'debentureApplicationAndAllotment'].includes(c) ? `application money received on debentures` : MONEY.has(d) && c === 'debentureAllotment' ? 'allotment money received on debentures' : null))],
  ['debenture application money', ({ dr, cr }) => {
    if (dr.length !== 1 || !['debentureApplication', 'debentureApplicationAndAllotment'].includes(dr[0])) return null;
    if (cr.length === 1 && MONEY.has(cr[0])) return 'application money refunded on the applications rejected';
    const rest = cr.filter((id) => !isDebentures(id) && !DEBENTURE_ISSUE_EXTRAS.has(id));
    if (!cr.some(isDebentures) || rest.length === 0 || !rest.every((id) => id === 'debentureAllotment' || MONEY.has(id))) return null;
    const parts = ['application money transferred to debentures'];
    if (rest.includes('debentureAllotment')) parts.push('the excess adjusted against allotment');
    if (rest.some((id) => MONEY.has(id))) parts.push(rest.includes('debentureAllotment') ? 'the rest refunded' : 'the excess refunded');
    return `${parts[0]}, ${list(parts.slice(1))}`;
  }],
  ['debentures allotted', ({ dr, cr }) => {
    const [main, ...extra] = dr;
    if (!['debentureApplication', 'debentureApplicationAndAllotment', 'debentureAllotment'].includes(main) && !(main && isVendor(main))) return null;
    if (!extra.every((id) => DEBENTURE_ISSUE_EXTRAS.has(id)) || !cr.some(isDebentures) || !cr.every((id) => isDebentures(id) || DEBENTURE_ISSUE_EXTRAS.has(id))) return null;
    const terms = debentureTerms(dr, cr);
    if (isVendor(main)) return `debentures issued to ${party(main)} in payment of the purchase consideration${terms}`;
    return main === 'debentureAllotment' ? `allotment money due on debentures${terms}` : `debentures allotted${terms}`;
  }],
  ['debentures as collateral', one((d, c) => (d === 'debentureSuspense' && isDebentures(c) ? 'debentures issued as collateral security' : isDebentures(d) && c === 'debentureSuspense' ? 'debentures held as collateral security cancelled' : null))],
  ['debenture interest', ({ dr, cr }) => {
    if (dr.length === 1 && dr[0] === 'debentureInterest' && cr.includes('debentureholders')) return 'interest due on debentures';
    if (dr.length === 1 && dr[0] === 'debentureholders' && cr.length === 1 && MONEY.has(cr[0])) return `interest paid to the debentureholders ${how(cr[0])}`;
    if (dr.length === 1 && dr[0] === 'statementOfProfitAndLoss' && all(cr, (id) => id === 'debentureInterest')) return 'interest on debentures transferred to the Statement of Profit and Loss';
    return null;
  }],
  ['discount or loss written off', ({ dr, cr }) => {
    if (cr.length !== 1 || !['discountOnIssueOfDebentures', 'lossOnIssueOfDebentures'].includes(cr[0])) return null;
    if (!all(dr, (id) => ['statementOfProfitAndLoss', 'securitiesPremium'].includes(id))) return null;
    return `${noun(cr[0])} written off`;
  }],
];

// ---------------------------------------------------------------------------------------------------------------
// Class 11: the usual transactions of a business, each by the accounts on its two sides.
// ---------------------------------------------------------------------------------------------------------------

const CLASS11_RULES: [name: string, rule: Rule][] = [
  ['capital introduced', one((d, c) => (MONEY.has(d) && c === 'capital' ? `capital brought into the business ${d === 'bank' ? 'through the bank' : 'in cash'}` : null))],
  ['business started', ({ dr, cr }) => {
    if (cr.length !== 1 || cr[0] !== 'capital' || dr.length < 2) return null;
    if (!dr.every((id) => MONEY.has(id) || plainAsset(id) || id === 'stock')) return null;
    return `business started with ${list(dr.map((id) => (id === 'bank' ? 'money at the bank' : noun(id))))}`;
  }],
  ['opening entry', ({ dr, cr }) => {
    if (!cr.includes('capital') || cr.length < 2 || dr.length < 2) return null;
    if (!cr.every((id) => id === 'capital' || type(id) === 'liability') || !dr.every((id) => type(id) === 'asset' && !resolveAccount(id).temporary)) return null;
    return 'balances of the assets and liabilities brought forward';
  }],
  ['drawings in money', one((d, c, text) => {
    if (d !== 'drawings' || !MONEY.has(c)) return null;
    if (c === 'bank' && /standing instruction/i.test(text)) {
      return `${/life insurance/i.test(text) ? "the proprietor's life insurance premium paid" : "amount paid for the proprietor's personal use"} by the bank under a standing instruction`;
    }
    return c === 'bank' ? 'money withdrawn from the bank for personal use' : 'cash withdrawn for personal use';
  })],
  ['drawings of goods', one((d, c) => (d === 'drawings' && c === 'purchases' ? 'goods withdrawn for personal use' : null))],
  ['cash deposited', one((d, c, text) => (d === 'bank' && c === 'cash' ? (/cheque/i.test(text) ? 'cheque deposited into the bank' : 'cash deposited into the bank') : null))],
  ['cash withdrawn', one((d, c) => (d === 'cash' && c === 'bank' ? 'cash withdrawn from the bank for office use' : null))],
  ['petty cash', one((d, c) => (d === 'pettyCash' && (c === 'cash' || c === 'bank') ? `amount given to the petty cashier ${how(c)}` : null))],
  ['cash purchase', one((d, c) => (d === 'purchases' && MONEY.has(c) ? `goods purchased ${c === 'bank' ? 'and paid for by cheque' : 'for cash'}` : null))],
  ['credit purchase', one((d, c) => (d === 'purchases' && isCreditor(c) ? `goods purchased on credit from ${party(c)}` : null))],
  ['cash sale', one((d, c) => (MONEY.has(d) && c === 'sales' ? (d === 'bank' ? 'goods sold and payment received by cheque' : 'goods sold for cash') : null))],
  ['credit sale', one((d, c) => (isDebtor(d) && c === 'sales' ? `goods sold on credit to ${party(d)}` : null))],
  ['purchase with carriage', ({ dr, cr }) => {
    if (!dr.includes('purchases') || !dr.includes('carriageInwards') || dr.length !== 2) return null;
    const creditor = cr.find(isCreditor);
    if (!creditor) return null;
    if (cr.length === 1) return `goods purchased on credit from ${party(creditor)} and carriage charged on the invoice`;
    const money = cr.find((id) => MONEY.has(id));
    return cr.length === 2 && money ? `goods purchased on credit from ${party(creditor)}, and carriage on them paid ${how(money)}` : null;
  }],
  ['purchase partly for cash', ({ dr, cr }) => {
    if (dr.length !== 2 || !dr.includes('purchases') || cr.length !== 2) return null;
    const asset = dr.find((id) => id !== 'purchases')!;
    const creditor = cr.find(isCreditor);
    const money = cr.find((id) => MONEY.has(id));
    return plainAsset(asset) && creditor && money ? `goods and ${noun(asset)} purchased from ${party(creditor)}, partly paid ${how(money)} and the rest on credit` : null;
  }],
  ['sale partly for cash', ({ dr, cr }) => {
    if (cr.length !== 1 || cr[0] !== 'sales' || dr.length !== 2) return null;
    const money = dr.find((id) => MONEY.has(id));
    const debtor = dr.find(isDebtor);
    return money && debtor ? `goods sold to ${party(debtor)}, part of the price received ${how(money)}` : null;
  }],
  ['sales return', one((d, c) => (d === 'salesReturn' && isDebtor(c) ? `goods returned by ${party(c)}` : null))],
  ['purchases return', one((d, c) => (isCreditor(d) && c === 'purchasesReturn' ? `goods returned to ${party(d)}` : null))],
  ['goods given away', one((d, c) => {
    if (c !== 'purchases') return null;
    if (d === 'advertisement') return 'goods distributed as free samples';
    if (d === 'charity') return 'goods given away as charity';
    if (d === 'staffWelfare') return 'goods given to the staff for their welfare';
    return null;
  })],
  ['goods lost', one((d, c) => ((d === 'lossByFire' || d === 'lossByTheft') && c === 'purchases' ? (d === 'lossByFire' ? 'goods destroyed by fire' : 'goods lost by theft') : null))],
  ['goods lost and claim admitted', ({ dr, cr, text }) => {
    if (cr.length !== 1 || cr[0] !== 'purchases' || !dr.includes('insuranceClaimReceivable') || !dr.every((id) => ['insuranceClaimReceivable', 'lossByFire', 'lossByTheft'].includes(id))) return null;
    const theft = dr.includes('lossByTheft') || (!dr.includes('lossByFire') && /theft|stolen/i.test(text));
    const what = theft ? 'goods lost by theft' : 'goods destroyed by fire';
    return dr.length === 1 ? `${what}, and the claim admitted in full by the insurance company` : `${what}, and the claim admitted by the insurance company`;
  }],
  ['cash lost', one((d, c) => ((d === 'lossByFire' || d === 'lossByTheft') && MONEY.has(c) ? (d === 'lossByFire' ? 'cash destroyed by fire' : 'cash lost by theft') : null))],
  ['bad debt', one((d, c) => (d === 'badDebts' && isDebtor(c) ? `the amount due from ${party(c)} written off as bad debts` : null))],
  ['debtor paid in part', ({ dr, cr }) => {
    if (cr.length !== 1 || !isDebtor(cr[0]) || dr.length !== 2 || !dr.includes('badDebts')) return null;
    const money = dr.find((id) => MONEY.has(id));
    return money ? `${money === 'bank' ? 'cheque' : 'cash'} received from ${party(cr[0])}, and the balance written off as bad debts` : null;
  }],
  ['bad debts recovered', one((d, c) => (MONEY.has(d) && c === 'badDebtsRecovered' ? `bad debts recovered ${how(d)}` : null))],
  ['cheque dishonoured', ({ dr, cr }) => {
    if (cr.length !== 1 || cr[0] !== 'bank' || !dr.some(isDebtor) || !dr.every((id) => isDebtor(id) || id === 'bankCharges') || dr.filter(isDebtor).length !== 1) return null;
    const d = dr.find(isDebtor)!;
    return `cheque received from ${party(d)} dishonoured${dr.includes('bankCharges') ? ', and the bank charges borne by the business' : ''}`;
  }],
  ['bank charges', one((d, c) => (d === 'bankCharges' && c === 'bank' ? 'bank charges debited by the bank' : null))],
  ['depreciation', one((d, c) => (d === 'depreciation' && plainAsset(c) ? `depreciation charged on ${noun(c)}` : d === 'depreciation' && c === 'provisionForDepreciation' ? 'depreciation provided for the year' : null))],
  ['prepaid expense', one((d, c) => (d === 'prepaidExpenses' && paidExpense(c) ? `${expenseNoun(c)} paid in advance` : null))],
  ['outstanding expense', one((d, c) => (paidExpense(d) && c === 'outstandingExpenses' ? `${expenseNoun(d)} outstanding at the end of the year` : null))],
  ['accrued income', one((d, c) => (d === 'accruedIncome' && receivedIncome(c) ? `${incomeNoun(c)} earned but not yet received` : null))],
  ['income in advance', one((d, c) => (receivedIncome(d) && c === 'incomeReceivedInAdvance' ? `${incomeNoun(d)} received in advance` : null))],
  ['interest on capital', one((d, c) => (d === 'interestOnCapital' && c === 'capital' ? 'interest on capital allowed' : null))],
  ['interest on drawings', one((d, c) => (d === 'drawings' && c === 'interestOnDrawings' ? 'interest on drawings charged' : null))],
  ['paid a creditor', one((d, c, text) => (isCreditor(d) && MONEY.has(c) ? `${/advance/i.test(text) ? 'advance paid' : 'payment made'} to ${party(d)} ${how(c)}` : null))],
  ['received from a debtor', one((d, c, text) => {
    if (!MONEY.has(d) || !isDebtor(c)) return null;
    if (/advance/i.test(text)) return `advance received from ${party(c)} ${how(d)}`;
    if (d === 'bank' && /directly into/i.test(text)) return `amount paid by ${party(c)} directly into the bank`;
    return `${d === 'bank' || /cheque/i.test(text) ? 'cheque' : 'cash'} received from ${party(c)}`;
  })],
  ['discount', one((d, c) => (isCreditor(d) && c === 'discountReceived' ? `discount received from ${party(d)}` : d === 'discountAllowed' && isDebtor(c) ? `discount allowed to ${party(c)}` : null))],
  ['asset bought', one((d, c) => (plainAsset(d) && MONEY.has(c) ? `${noun(d)} purchased ${c === 'bank' ? 'and paid for by cheque' : 'for cash'}` : null))],
  ['asset bought on credit', one((d, c) => (plainAsset(d) && isCreditor(c) ? `${noun(d)} purchased ${isVendor(c) ? 'from' : 'on credit from'} ${party(c)}` : null))],
  ['asset bought and installed', ({ dr, cr }) => {
    if (dr.length !== 1 || !plainAsset(dr[0]) || cr.length !== 2) return null;
    const creditor = cr.find(isCreditor);
    const money = cr.find((id) => MONEY.has(id));
    return creditor && money ? `${noun(dr[0])} purchased on credit from ${party(creditor)}, and the carriage and installation charges paid ${how(money)}` : null;
  }],
  ['asset sold', ({ dr, cr }) => {
    const asset = cr.filter(plainAsset);
    if (asset.length !== 1) return null;
    const gain = cr.filter((id) => !plainAsset(id));
    const rest = dr.filter((id) => id !== 'lossOnSaleOfAsset' && id !== 'provisionForDepreciation');
    if (gain.some((id) => id !== 'profitOnSaleOfAsset') || rest.length !== 1) return null;
    const [buyer] = rest;
    const result = gain.length > 0 ? ' at a profit' : dr.includes('lossOnSaleOfAsset') ? ' at a loss' : '';
    if (buyer === 'bank') return `${noun(asset[0])} sold${result} and the price received by cheque`;
    if (MONEY.has(buyer)) return `${noun(asset[0])} sold for cash${result}`;
    return isDebtor(buyer) ? `${noun(asset[0])} sold on credit to ${party(buyer)}${result}` : null;
  }],
  ['profit or loss on sale', one((d, c) => (plainAsset(d) && c === 'profitOnSaleOfAsset' ? `profit on sale of ${noun(d)} transferred` : d === 'lossOnSaleOfAsset' && plainAsset(c) ? `loss on sale of ${noun(c)} transferred` : null))],
  ['asset disposal', one((d, c) => {
    if (d === 'assetDisposal' && plainAsset(c)) return `${noun(c)} transferred to Asset Disposal A/c on sale`;
    if (MONEY.has(d) && c === 'assetDisposal') return `sale price of the asset received ${how(d)}`;
    if (d === 'provisionForDepreciation' && c === 'assetDisposal') return 'depreciation provided on the asset sold transferred to Asset Disposal A/c';
    if (d === 'assetDisposal' && c === 'profitOnSaleOfAsset') return 'profit on sale of the asset transferred';
    if (d === 'lossOnSaleOfAsset' && c === 'assetDisposal') return 'loss on sale of the asset transferred';
    return null;
  })],
  ['loan', ({ dr, cr, text }) => {
    const loans = ['loan', 'bankLoan'];
    if (dr.length === 1 && MONEY.has(dr[0]) && cr.length === 1 && loans.includes(cr[0])) return cr[0] === 'bankLoan' ? 'loan taken from the bank' : `loan taken, received ${how(dr[0])}`;
    const interest = (id: string) => id === 'interestPaid' || id === 'interestOnLoan';
    if (cr.length === 1 && MONEY.has(cr[0]) && dr.some((id) => loans.includes(id)) && dr.every((id) => loans.includes(id) || interest(id))) {
      const loan = dr.includes('bankLoan') ? 'bank loan' : 'loan';
      if (cr[0] === 'bank' && /standing instruction/i.test(text)) {
        return `instalment of the ${loan}${dr.some(interest) ? ', with interest,' : ''} paid by the bank under a standing instruction`;
      }
      return `${loan} repaid ${how(cr[0])}${dr.some(interest) ? ', with interest' : ''}`;
    }
    return null;
  }],
  ['expense paid', one((d, c, text) => (paidExpense(d) && MONEY.has(c) ? paid(expenseNoun(d), c, text) : null))],
  ['income received', one((d, c, text) => (MONEY.has(d) && receivedIncome(c) ? received(incomeNoun(c), d, text) : null))],
  ['income received, part in advance', ({ dr, cr }) => {
    if (dr.length !== 1 || !MONEY.has(dr[0]) || cr.length !== 2 || !cr.includes('incomeReceivedInAdvance')) return null;
    const income = cr.find((id) => id !== 'incomeReceivedInAdvance')!;
    return receivedIncome(income) ? `${incomeNoun(income)} received ${how(dr[0])}, part of it for the next year` : null;
  }],
  ['paid with discount', ({ dr, cr }) => {
    const [d] = dr;
    if (dr.length !== 1 || cr.length !== 2 || !isCreditor(d) || !cr.includes('discountReceived')) return null;
    const paidBy = cr.find((id) => id !== 'discountReceived')!;
    return MONEY.has(paidBy) ? `payment made to ${party(d)} ${how(paidBy)} in full settlement, and discount received` : null;
  }],
  ['received with discount', ({ dr, cr, text }) => {
    const [c] = cr;
    if (dr.length !== 2 || cr.length !== 1 || !isDebtor(c) || !dr.includes('discountAllowed')) return null;
    const got = dr.find((id) => id !== 'discountAllowed')!;
    if (!MONEY.has(got)) return null;
    const what = got === 'bank' && /directly into/i.test(text) ? `amount paid by ${party(c)} directly into the bank` : `${got === 'bank' ? 'cheque' : 'cash'} received from ${party(c)}`;
    return `${what} in full settlement, and discount allowed`;
  }],
  ['outstanding paid', ({ dr, cr }) => {
    if (cr.length !== 1 || !MONEY.has(cr[0]) || dr.length !== 2 || !dr.includes('outstandingExpenses')) return null;
    const expense = dr.find((id) => id !== 'outstandingExpenses')!;
    return paidExpense(expense) ? `${expenseNoun(expense)} paid ${how(cr[0])}, with the amount outstanding from last year` : null;
  }],
  ['cash for the office and the owner', ({ dr, cr }) =>
    cr.length === 1 && cr[0] === 'bank' && dr.length === 2 && dr.includes('cash') && dr.includes('drawings') ? 'cash withdrawn from the bank, partly for office use and partly for personal use' : null],
  ['expenses paid', ({ dr, cr }) => (dr.length > 1 && cr.length === 1 && MONEY.has(cr[0]) && dr.every(paidExpense) ? `expenses paid ${how(cr[0])}` : null)],
  // Closing entries.
  ['incomes closed', ({ dr, cr }) => (cr.length === 1 && ['profitAndLoss', 'trading'].includes(cr[0]) && dr.every((id) => type(id) === 'income' && !resolveAccount(id).contra) ? `${dr.length === 1 ? noun(dr[0]) : 'incomes'} transferred to ${accountLabel(cr[0])}` : null)],
  ['expenses closed', ({ dr, cr }) => (dr.length === 1 && ['profitAndLoss', 'trading'].includes(dr[0]) && cr.every((id) => type(id) === 'expense' && !resolveAccount(id).contra) ? `${cr.length === 1 ? noun(cr[0]) : 'expenses'} transferred to ${accountLabel(dr[0])}` : null)],
  ['trading closed', ({ dr, cr }) => {
    if (dr.length === 1 && dr[0] === 'trading' && cr.includes('purchases') && cr.every((id) => id === 'stock' || (type(id) === 'expense' && !resolveAccount(id).contra))) {
      const items = cr.map((id) => (id === 'stock' ? 'opening stock' : noun(id)));
      return `${list(items)} transferred to Trading A/c`;
    }
    if (cr.length === 1 && cr[0] === 'trading' && dr.every((id) => id === 'stock' || (type(id) === 'income' && !resolveAccount(id).contra))) {
      if (dr.length === 1 && dr[0] === 'stock') return 'closing stock brought into the books';
      return `${list(dr.map((id) => (id === 'stock' ? 'closing stock' : noun(id))))} transferred to Trading A/c`;
    }
    if (dr.length === 1 && dr[0] === 'trading' && cr.length === 1 && cr[0] === 'profitAndLoss') return 'gross profit transferred to Profit and Loss A/c';
    if (dr.length === 1 && dr[0] === 'profitAndLoss' && cr.length === 1 && cr[0] === 'trading') return 'gross loss transferred to Profit and Loss A/c';
    return null;
  }],
  ['returns closed', one((d, c) => (d === 'purchasesReturn' && c === 'purchases' ? 'purchases return transferred to Purchases A/c' : d === 'sales' && c === 'salesReturn' ? 'sales return transferred to Sales A/c' : null))],
  ['provision for doubtful debts', one((d, c) => {
    if (d === 'profitAndLoss' && c === 'provisionForDoubtfulDebts') return 'provision for doubtful debts charged to Profit and Loss A/c';
    if (d === 'provisionForDoubtfulDebts' && c === 'profitAndLoss') return 'excess provision for doubtful debts written back';
    if (d === 'provisionForDoubtfulDebts' && c === 'badDebts') return 'bad debts written off against the provision for doubtful debts';
    return null;
  })],
  ['profit set aside', one((d, c) => ((d === 'profitAndLossAppropriation' || d === 'profitAndLoss') && RESERVES.has(c) ? `profit transferred to ${noun(c)}` : null))],
  ['result to capital', one((d, c) => (d === 'profitAndLoss' && c === 'capital' ? 'net profit transferred to Capital A/c' : d === 'capital' && c === 'profitAndLoss' ? 'net loss transferred to Capital A/c' : null))],
  ['drawings to capital', one((d, c) => (d === 'capital' && c === 'drawings' ? 'drawings transferred to Capital A/c' : null))],
];

/** The narration of an entry, without "Being", and the name of the rule that gave it ('given', 'error', or 'fallback'). */
function narrate(lines: readonly JournalLine[], given?: string, text = ''): { text: string; rule: string } {
  const own = given?.trim().replace(/^\(|\)$/g, '').trim();
  if (own) return { text: own.replace(/^being\s+/i, ''), rule: 'given' };
  const ids = (side: 'Dr' | 'Cr') => [...new Set(lines.filter((l) => l.side === side).map((l) => l.accountId))];
  const dr = ids('Dr');
  const cr = ids('Cr');
  const fallback = { text: `${list(dr.map(accountLabel))} debited and ${list(cr.map(accountLabel))} credited`, rule: 'fallback' };
  // GST rides along with the goods it is charged on: the entry is named by the rest of it.
  const withGst = [...dr, ...cr].some((id) => GST.test(id));
  const entry: Entry = { dr: dr.filter((id) => !GST.test(id)), cr: cr.filter((id) => !GST.test(id)), text };
  const say = (rules: [string, Rule][]) => {
    // An entry of GST alone (a GST posting put right) is no transaction of the rules.
    if (entry.dr.length === 0 || entry.cr.length === 0) return null;
    for (const [name, rule] of rules) {
      let said: string | null = null;
      try {
        said = rule(entry);
      } catch {
        said = null;
      }
      if (said) return { text: `${said}${withGst ? ', with GST' : ''}`, rule: name };
    }
    return null;
  };
  const class12 = [...dr, ...cr].some((id) => FAMILY.test(id) || CLASS12.has(id));
  if (class12) return say(CLASS12_RULES) ?? say(CLASS11_RULES) ?? fallback;
  // An entry of the books of a business that puts something right: what it does, not the transaction it looks like.
  const omitted = OMITTED.test(text) || (/no entry (was|has been) made/i.test(text) && /rectif/i.test(text));
  if (omitted || ERROR.test(text) || [...dr, ...cr].includes('suspense')) {
    const said = omitted ? say(CLASS11_RULES) : null;
    return said ? { text: `${said.text}, omitted earlier, now recorded`, rule: `omitted: ${said.rule}` } : { text: omitted ? 'omitted transaction now recorded' : 'error rectified', rule: 'error' };
  }
  const said = say(CLASS11_RULES);
  if (said) return said;
  return MAYBE_ERROR.test(text) ? { text: 'error rectified', rule: 'error' } : fallback;
}

/**
 * The narration of an entry, without its brackets: "Being goods purchased on credit from Ravi". A narration a question
 * gives is used as it is (with "Being" put before it where it does not have it). `text` is the transaction the entry
 * records, in the words of the question, where it is at hand: it tells a rectifying entry from the transaction it
 * looks like, and a payment the bank made on its own from one made by cheque.
 */
export function narrationFor(lines: readonly JournalLine[], given?: string, text?: string): string {
  return `Being ${narrate(lines, given, text).text}`;
}

/** The name of the rule that says the narration of an entry ('given', 'error', 'fallback', …): for checking the rules. */
export const narrationRule = (lines: readonly JournalLine[], given?: string, text?: string): string => narrate(lines, given, text).rule;
