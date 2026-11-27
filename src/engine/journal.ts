import { creditor, debtor, type Side } from './accounts';
import { percentOf, type Paise } from './money';

export type Mode = 'cash' | 'bank';
export interface Gst {
  rate: number;
  kind: 'intra' | 'inter';
}

export type Transaction =
  | { kind: 'capitalIntroduced'; amount: Paise; mode: Mode }
  | { kind: 'purchase'; amount: Paise; pay: Mode | { creditor: string }; gst?: Gst }
  | { kind: 'sale'; amount: Paise; receive: Mode | { debtor: string }; gst?: Gst }
  | { kind: 'assetPurchase'; asset: 'furniture' | 'machinery'; amount: Paise; mode: Mode }
  | { kind: 'expensePaid'; expense: 'rent' | 'salaries' | 'wages' | 'stationery'; amount: Paise; mode: Mode }
  | { kind: 'incomeReceived'; income: 'commissionReceived' | 'interestReceived'; amount: Paise; mode: Mode }
  | { kind: 'drawings'; amount: Paise; mode: Mode }
  | { kind: 'paymentToCreditor'; creditor: string; paid: Paise; discount: Paise; mode: Mode }
  | { kind: 'receiptFromDebtor'; debtor: string; received: Paise; discount: Paise; mode: Mode }
  | { kind: 'cashDeposited'; amount: Paise }
  | { kind: 'cashWithdrawn'; amount: Paise }
  | { kind: 'purchaseReturn'; creditor: string; amount: Paise }
  | { kind: 'salesReturn'; debtor: string; amount: Paise };

export interface JournalLine {
  accountId: string;
  side: Side;
  amount: Paise;
}

const dr = (accountId: string, amount: Paise): JournalLine => ({ accountId, side: 'Dr', amount });
const cr = (accountId: string, amount: Paise): JournalLine => ({ accountId, side: 'Cr', amount });

function gstParts(amount: Paise, gst: Gst | undefined, dir: 'input' | 'output'): [string, Paise][] {
  if (!gst) return [];
  const tax = percentOf(amount, gst.rate);
  if (gst.kind === 'inter') return [[`${dir}IGST`, tax]];
  const half = Math.round(tax / 2);
  return [
    [`${dir}CGST`, half],
    [`${dir}SGST`, tax - half],
  ];
}

function build(tx: Transaction): JournalLine[] {
  switch (tx.kind) {
    case 'capitalIntroduced':
      return [dr(tx.mode, tx.amount), cr('capital', tx.amount)];
    case 'purchase': {
      const taxes = gstParts(tx.amount, tx.gst, 'input');
      const total = tx.amount + taxes.reduce((s, [, a]) => s + a, 0);
      const payee = typeof tx.pay === 'string' ? tx.pay : creditor(tx.pay.creditor);
      return [dr('purchases', tx.amount), ...taxes.map(([id, a]) => dr(id, a)), cr(payee, total)];
    }
    case 'sale': {
      const taxes = gstParts(tx.amount, tx.gst, 'output');
      const total = tx.amount + taxes.reduce((s, [, a]) => s + a, 0);
      const payer = typeof tx.receive === 'string' ? tx.receive : debtor(tx.receive.debtor);
      return [dr(payer, total), cr('sales', tx.amount), ...taxes.map(([id, a]) => cr(id, a))];
    }
    case 'assetPurchase':
      return [dr(tx.asset, tx.amount), cr(tx.mode, tx.amount)];
    case 'expensePaid':
      return [dr(tx.expense, tx.amount), cr(tx.mode, tx.amount)];
    case 'incomeReceived':
      return [dr(tx.mode, tx.amount), cr(tx.income, tx.amount)];
    case 'drawings':
      return [dr('drawings', tx.amount), cr(tx.mode, tx.amount)];
    case 'paymentToCreditor':
      return [
        dr(creditor(tx.creditor), tx.paid + tx.discount),
        cr(tx.mode, tx.paid),
        cr('discountReceived', tx.discount),
      ];
    case 'receiptFromDebtor':
      return [
        dr(tx.mode, tx.received),
        dr('discountAllowed', tx.discount),
        cr(debtor(tx.debtor), tx.received + tx.discount),
      ];
    case 'cashDeposited':
      return [dr('bank', tx.amount), cr('cash', tx.amount)];
    case 'cashWithdrawn':
      return [dr('cash', tx.amount), cr('bank', tx.amount)];
    case 'purchaseReturn':
      return [dr(creditor(tx.creditor), tx.amount), cr('purchasesReturn', tx.amount)];
    case 'salesReturn':
      return [dr('salesReturn', tx.amount), cr(debtor(tx.debtor), tx.amount)];
  }
}

export function toJournal(tx: Transaction): JournalLine[] {
  return build(tx).filter((l) => l.amount !== 0);
}

export function isBalanced(lines: JournalLine[]): boolean {
  const sum = (side: Side) => lines.filter((l) => l.side === side).reduce((s, l) => s + l.amount, 0);
  return lines.length > 0 && sum('Dr') === sum('Cr');
}
