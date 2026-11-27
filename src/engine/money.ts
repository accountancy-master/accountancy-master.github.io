export type Paise = number;

export const rupees = (n: number): Paise => Math.round(n * 100);

export const percentOf = (amount: Paise, rate: number): Paise =>
  Math.round((amount * rate) / 100);

// A number formatter is costly to make and a question formats many amounts, so the two that are needed are kept.
const WHOLE = new Intl.NumberFormat('en-IN', { minimumFractionDigits: 0, maximumFractionDigits: 2 });
const WITH_PAISE = new Intl.NumberFormat('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export function formatINR(p: Paise): string {
  const r = p / 100;
  return '₹' + (Number.isInteger(r) ? WHOLE : WITH_PAISE).format(r);
}
