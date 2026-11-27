import type { JournalLine } from '@/engine/journal';
import { accountLabel } from '@/engine/books';
import { formatINR } from '@/engine/money';
import { narrationFor } from '@/engine/narration';

/** Party accounts (debtors, creditors, a vendor) are written with the name only, without "A/c". */
const particulars = accountLabel;

/**
 * A journal entry in the exam layout: debit lines first, then credit lines indented with "To". It never grows wider
 * than the place it is put in (the block of one transaction of a set, inside a card, on a phone 360 px wide): on a
 * phone "Dr" follows the account name without the dotted leader, the columns are set closer, and the particulars
 * wrap, breaking inside a word only where even the longest word has no room.
 */
export function SolutionEntry({
  lines,
  narration,
  transaction,
  'data-testid': testId = 'solution',
}: {
  lines: JournalLine[];
  /**
   * The narration under the entry, as an answer writes it: a string the question gives, `true` to work it out from the
   * entry (see `narrationFor`), or left out for none (an example of a lesson, which has a note of its own).
   */
  narration?: string | true;
  /**
   * The transaction the entry records, in the words of the question: a narration worked out from the entry reads it
   * to tell a rectifying entry from the transaction it looks like (see `narrationFor`).
   */
  transaction?: string;
  'data-testid'?: string;
}) {
  // Debit lines first whatever the order in the data; the order within each side is kept.
  const ordered = [...lines.filter((l) => l.side === 'Dr'), ...lines.filter((l) => l.side === 'Cr')];

  return (
    <table
      data-testid={testId}
      className="w-full border-collapse overflow-hidden rounded-control border-2 border-edge bg-surface text-left text-sm sm:text-base"
    >
      <caption className="sr-only">Journal entry</caption>
      <thead>
        <tr className="bg-canvas text-sm font-bold text-muted">
          <th scope="col" className="px-2 py-2 font-bold [overflow-wrap:anywhere] sm:px-3">
            Particulars
          </th>
          <th scope="col" className="w-[4.5rem] px-1.5 py-2 text-right font-bold sm:w-[5.5rem] sm:px-2">
            Debit
          </th>
          <th scope="col" className="w-[4.5rem] px-1.5 py-2 text-right font-bold sm:w-[5.5rem] sm:px-2">
            Credit
          </th>
        </tr>
      </thead>
      <tbody>
        {ordered.map((line, i) => {
          const debit = line.side === 'Dr';
          return (
            <tr key={i} data-side={line.side} className="border-t-2 border-edge align-top">
              <td className="px-2 py-2 font-semibold [overflow-wrap:anywhere] sm:px-3">
                {debit ? (
                  <span className="sm:flex sm:items-end sm:gap-2">
                    <span>{particulars(line.accountId)}</span>{' '}
                    <span aria-hidden="true" className="mb-1 hidden min-w-3 flex-1 border-b-2 border-dotted border-edge-deep sm:block" />
                    <span className="shrink-0">Dr</span>
                  </span>
                ) : (
                  <span className="block pl-5">To {particulars(line.accountId)}</span>
                )}
              </td>
              <td className="px-1.5 py-2 text-right font-bold tabular-nums sm:px-2">{debit ? formatINR(line.amount) : ''}</td>
              <td className="px-1.5 py-2 text-right font-bold tabular-nums sm:px-2">{debit ? '' : formatINR(line.amount)}</td>
            </tr>
          );
        })}
        {narration !== undefined ? (
          <tr className="border-t-2 border-edge">
            <td colSpan={3} data-testid={`narration-${testId}`} className="px-2 py-1.5 pl-5 text-sm italic text-muted sm:px-3 sm:pl-8 sm:text-base">
              ({narrationFor(lines, narration === true ? undefined : narration, transaction)})
            </td>
          </tr>
        ) : null}
      </tbody>
    </table>
  );
}
