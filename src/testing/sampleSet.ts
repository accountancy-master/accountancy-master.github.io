import type { JournalSetQuestion } from '@/content/types';
import type { JournalLine } from '@/engine/journal';
import type { JournalRow } from '@/play/journalRows';

const dr = (accountId: string, rupees: number): JournalLine => ({ accountId, side: 'Dr', amount: rupees * 100 });
const cr = (accountId: string, rupees: number): JournalLine => ({ accountId, side: 'Cr', amount: rupees * 100 });

/** A set of four entries with known answers, for tests: a first week in cash, and a purchase on credit. */
export const SAMPLE_SET: JournalSetQuestion = {
  id: 'sample-set',
  type: 'journal_set',
  topicId: 'journal-entries',
  conceptId: 'je-sets',
  difficulty: 'easy',
  prompt: 'Journalise the following transactions.\nAsha opened a bookshop in Pune in April.',
  hints: ['One.', 'Two.'],
  explanation: 'Each transaction has its own entry.',
  entries: [
    { date: '1 April', text: 'Asha started the business with cash of ₹2,00,000.', expected: [dr('cash', 200000), cr('capital', 200000)], explanation: ['Cash comes in.', 'It is capital.'] },
    { date: '3 April', text: 'Bought books for ₹40,000 from Kiran on credit.', expected: [dr('purchases', 40000), cr('creditor:Kiran', 40000)], explanation: ['Goods are bought.', 'Kiran is owed.'] },
    { date: '5 April', text: 'Paid ₹6,000 as rent of the shop.', expected: [dr('rent', 6000), cr('cash', 6000)], explanation: ['Rent is an expense.', 'Cash goes out.'] },
    { date: '6 April', text: 'Paid ₹39,200 to Kiran in full settlement.', expected: [dr('creditor:Kiran', 40000), cr('cash', 39200), cr('discountReceived', 800)], explanation: ['Kiran is cleared.', 'Cash goes out.', 'The rest is a discount.'] },
  ],
  accountChoices: ['bank', 'capital', 'cash', 'creditor:Kiran', 'discountAllowed', 'discountReceived', 'purchases', 'rent', 'sales'],
};

/** The rows a student would type for an entry. */
export const rowsOf = (lines: JournalLine[]): JournalRow[] => lines.map((l) => ({ accountId: l.accountId, side: l.side, amount: String(l.amount / 100) }));

/** An entry with its debits and credits the wrong way round. */
export const reversed = (lines: JournalLine[]): JournalLine[] => lines.map((l) => ({ ...l, side: l.side === 'Dr' ? 'Cr' : 'Dr' }));
