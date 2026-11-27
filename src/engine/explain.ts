import { normalSide, resolveAccount, type AccountType } from './accounts';
import type { JournalLine } from './journal';
import { formatINR } from './money';

const NATURE: Record<AccountType, string> = {
  asset: 'is an asset',
  liability: 'is a liability',
  capital: "is the owner's stake in the business",
  income: 'is an income',
  expense: 'is an expense',
};

export function explainLine(line: JournalLine): string {
  const account = resolveAccount(line.accountId);
  const increases = line.side === normalSide(account);
  const verb = line.side === 'Dr' ? 'debited' : 'credited';
  const amount = formatINR(line.amount);

  if (account.temporary) return `${account.name} A/c is ${account.temporary}. It is ${verb} with ${amount}.`;

  const change = increases ? 'increases' : 'decreases';
  if (account.contra) {
    return `${account.name} A/c reduces ${account.reduces ?? account.type}. ${account.name} A/c ${change}, so it is ${verb} with ${amount}.`;
  }

  if (line.accountId.startsWith('debtor:')) {
    return `${account.name} is a debtor (an asset: ${account.name} owes the business). The amount owed ${change}, so ${account.name}'s account is ${verb} with ${amount}.`;
  }
  if (line.accountId.startsWith('creditor:')) {
    return `${account.name} is a creditor (a liability: the business owes ${account.name}). The amount owed ${change}, so ${account.name}'s account is ${verb} with ${amount}.`;
  }
  if (line.accountId.startsWith('vendor:')) {
    return `${account.name} is the vendor (a liability: the company owes ${account.name} for what it bought). The amount owed ${change}, so ${account.name}'s account is ${verb} with ${amount}.`;
  }
  return `${account.name} A/c ${account.nature ?? NATURE[account.type]}. It ${change}, so it is ${verb} with ${amount}.`;
}

export const explainEntry = (lines: JournalLine[]): string[] => lines.map(explainLine);
