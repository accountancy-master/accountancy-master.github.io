import type { Paise } from '@/engine/money';

// Optional prefix, the number (plain digits, Indian grouping 12,34,567 or Western grouping 1,234,567),
// 1-2 decimal digits, optional "/-" suffix. Anything else is rejected rather than guessed at.
const RUPEE_INPUT =
  /^(?:₹|rs\.?)?\s*(\d+|\d{1,2}(?:,\d{2})*,\d{3}|\d{1,3}(?:,\d{3})+)(?:\.(\d{1,2}))?(?:\/-)?$/i;

/** Parses what a student types ("1,25,000", "₹ 980.50", "Rs. 5000/-") into paise using integer arithmetic only. */
export function parseRupees(input: string): Paise | null {
  const m = RUPEE_INPUT.exec(input.trim());
  if (!m) return null;
  const paise = Number(m[1].replace(/,/g, '')) * 100 + Number((m[2] ?? '').padEnd(2, '0'));
  return Number.isSafeInteger(paise) && paise > 0 ? paise : null;
}
