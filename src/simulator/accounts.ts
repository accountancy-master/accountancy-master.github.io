import { isParty, normalSide, resolveAccount, type Account, type Side } from '@/engine/accounts';
import type { JournalLine } from '@/engine/journal';
import { formatINR } from '@/engine/money';

// ---------------------------------------------------------------------------------------------------------------
// The accounts the simulator places. Every account of the engine's chart (engine/accounts.ts) resolves as it does
// there; a few that a transaction of the simulator names in words of its own (a refrigerator, prepaid rent) are added
// here, so that the chart of the questions is left exactly as it is.
// ---------------------------------------------------------------------------------------------------------------

const extra = (id: string, name: string, type: Account['type']): Account => ({ id, name, type });

const EXTRA: ReadonlyMap<string, Account> = new Map(
  [
    extra('refrigerator', 'Refrigerator', 'asset'),
    extra('shopFittings', 'Shop Fittings', 'asset'),
    extra('prepaidRent', 'Prepaid Rent', 'asset'),
    extra('prepaidInsurance', 'Prepaid Insurance', 'asset'),
    extra('accruedCommission', 'Accrued Commission', 'asset'),
    extra('accruedInterest', 'Accrued Interest', 'asset'),
    extra('accruedRent', 'Accrued Rent', 'asset'),
    extra('outstandingRent', 'Outstanding Rent', 'liability'),
    extra('outstandingSalaries', 'Outstanding Salaries', 'liability'),
    extra('outstandingWages', 'Outstanding Wages', 'liability'),
    extra('outstandingElectricity', 'Outstanding Electricity Charges', 'liability'),
    extra('rentReceivedInAdvance', 'Rent Received in Advance', 'liability'),
    extra('feesReceived', 'Fees Received', 'income'),
    // Never journalised: the equation's view of goods that leave stock at cost when they are sold (see engine.ts).
    extra('costOfGoodsSold', 'Cost of goods sold', 'expense'),
  ].map((a) => [a.id, a]),
);

/** The account with this id, from the engine's chart or the simulator's few of its own. Throws for an unknown id. */
export function simAccount(id: string): Account {
  return EXTRA.get(id) ?? resolveAccount(id);
}

/** True for an id the simulator can place. */
export function isKnownAccount(id: string): boolean {
  try {
    simAccount(id);
    return true;
  } catch {
    return false;
  }
}

/** How an account is written in a journal: "Cash A/c", and a party (a debtor, a creditor) by its name alone. */
export function simLabel(id: string): string {
  const a = simAccount(id);
  return isParty(id) ? a.name : `${a.name} A/c`;
}

/**
 * What the account is in the equation, the group the simulator places it by when a scene says nothing more: an asset,
 * a liability, the owner's capital, an income or an expense (both of them part of the profit so far), drawings, an
 * account that reduces an asset (a provision), or a temporary account that can stand on either side (Suspense).
 */
export type AccountGroup = 'asset' | 'contraAsset' | 'liability' | 'capital' | 'income' | 'expense' | 'drawings' | 'temporary';

export function groupOf(id: string): AccountGroup {
  const a = simAccount(id);
  if (a.temporary) return 'temporary';
  if (a.type === 'asset') return a.contra ? 'contraAsset' : 'asset';
  if (a.type === 'capital') return a.contra ? 'drawings' : 'capital';
  if (a.type === 'income') return 'income';
  if (a.type === 'expense') return 'expense';
  return 'liability';
}

/** The side on which the account increases. */
export const increasesOn = (id: string): Side => normalSide(simAccount(id));

const NATURE: Record<Account['type'], string> = {
  asset: 'is an asset',
  liability: 'is a liability',
  capital: "is the proprietor's capital",
  income: 'is an income, which adds to the profit',
  expense: 'is an expense or a loss, which reduces the profit',
};

/** A name in the possessive: "Kiran's", "Lakshmi Stores'". */
export const possessive = (name: string): string => (/s$/.test(name) ? `${name}'` : `${name}'s`);

/**
 * Why a line of an entry is on its side, in the words the engine uses for every question ("Cash A/c is an asset. It
 * increases, so it is debited with ₹5,000.").
 */
export function explainSimLine(line: JournalLine): string {
  const a = simAccount(line.accountId);
  const verb = line.side === 'Dr' ? 'debited' : 'credited';
  const amount = formatINR(line.amount);
  if (a.temporary) return `${a.name} A/c is ${a.temporary}. It is ${verb} with ${amount}.`;
  const change = line.side === normalSide(a) ? 'increases' : 'decreases';
  if (line.accountId === 'purchases') {
    // The journal keeps goods bought for resale in Purchases A/c, which (like an expense) increases on the debit side;
    // the equation shows the same goods as stock, an asset, until they are sold.
    return line.side === 'Dr'
      ? `Purchases A/c records goods bought for resale and, like an expense, increases on the debit side. It increases, so it is debited with ${amount}. In the equation these goods are shown as stock, an asset, until they are sold.`
      : `Purchases A/c records goods bought for resale. Goods that will not be sold are taken out of it, so it is credited with ${amount}. In the equation the goods leave stock.`;
  }
  if (a.contra) return `${a.name} A/c reduces ${a.reduces ?? a.type}. It ${change}, so it is ${verb} with ${amount}.`;
  if (line.accountId.startsWith('debtor:')) {
    return `${a.name} is a debtor (an asset: ${a.name} owes the business). The amount owed ${change}, so ${possessive(a.name)} account is ${verb} with ${amount}.`;
  }
  if (line.accountId.startsWith('creditor:')) {
    return `${a.name} is a creditor (a liability: the business owes ${a.name}). The amount owed ${change}, so ${possessive(a.name)} account is ${verb} with ${amount}.`;
  }
  return `${a.name} A/c ${a.nature ?? NATURE[a.type]}. It ${change}, so it is ${verb} with ${amount}.`;
}
