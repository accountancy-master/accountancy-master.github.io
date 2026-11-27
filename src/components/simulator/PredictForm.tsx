'use client';

import { parseRupees } from '@/lib/money-input';
import { formatINR } from '@/engine/money';
import { simLabel } from '@/simulator/accounts';
import { SIDES, type Direction, type Marked, type PredictLevel, type Prediction, type SideKey } from '@/simulator/predict';

const SIDE_TITLE: Record<SideKey, string> = { assets: 'Assets', liabilities: 'Liabilities', capital: 'Capital' };
const CHOICES: { id: Direction; label: string; mark: string }[] = [
  { id: 'up', label: 'Up', mark: '▲' },
  { id: 'down', label: 'Down', mark: '▼' },
  { id: 'same', label: 'No change', mark: '=' },
];

/**
 * The prediction: for each side of the equation, up, down or no change (radio buttons, so arrow keys move between
 * them); at the middle level the amount of each change; at the top level the accounts debited and credited.
 */
export function PredictForm({
  level,
  value,
  onChange,
  accounts,
  marked,
  amountsText,
  onAmountText,
}: {
  level: PredictLevel;
  value: Prediction;
  onChange(p: Prediction): void;
  /** The accounts offered at the top level. */
  accounts: string[];
  /** Once checked: the marks, shown beside each answer. The form is then read only. */
  marked: Marked | null;
  amountsText: Partial<Record<SideKey, string>>;
  onAmountText(side: SideKey, text: string): void;
}) {
  const locked = marked !== null;
  const setDirection = (side: SideKey, d: Direction) => onChange({ ...value, directions: { ...value.directions, [side]: d } });
  const toggle = (which: 'debited' | 'credited', id: string) => {
    const list = value[which] ?? [];
    onChange({ ...value, [which]: list.includes(id) ? list.filter((x) => x !== id) : [...list, id] });
  };

  return (
    <div className="flex flex-col gap-3">
      <div className="grid gap-3 sm:grid-cols-3">
        {SIDES.map((side) => {
          const mark = marked?.sides.find((s) => s.side === side);
          return (
            <fieldset key={side} data-testid={`predict-${side}`} className={`flex flex-col gap-2 rounded-card border p-3 ${mark ? (mark.right ? 'border-primary bg-primary-soft' : 'border-danger bg-danger-soft') : 'border-edge bg-surface'}`}>
              <legend className="px-1 text-base font-extrabold">{SIDE_TITLE[side]}</legend>
              <div className="flex flex-wrap gap-1.5">
                {CHOICES.map((c) => (
                  <label key={c.id} className="relative">
                    <input
                      type="radio"
                      name={`predict-${side}`}
                      value={c.id}
                      checked={value.directions[side] === c.id}
                      onChange={() => setDirection(side, c.id)}
                      disabled={locked}
                      data-testid={`predict-${side}-${c.id}`}
                      className="peer sr-only"
                    />
                    <span className="inline-flex min-h-10 cursor-pointer items-center gap-1 rounded-full border border-edge-deep bg-surface px-3 text-sm font-extrabold peer-checked:border-primary peer-checked:bg-primary peer-checked:text-white peer-focus-visible:ring-4 peer-focus-visible:ring-focus peer-disabled:cursor-default">
                      <span aria-hidden="true">{c.mark}</span>
                      {c.label}
                    </span>
                  </label>
                ))}
              </div>
              {level !== 'directions' && value.directions[side] !== 'same' ? (
                <label className="flex flex-col gap-1 text-sm font-bold">
                  By how much (₹)
                  <input
                    type="text"
                    inputMode="decimal"
                    autoComplete="off"
                    data-testid={`predict-${side}-amount`}
                    value={amountsText[side] ?? ''}
                    onChange={(e) => onAmountText(side, e.target.value)}
                    disabled={locked}
                    className="min-h-10 rounded-control border-2 border-edge-deep bg-surface px-3 text-base tabular-nums"
                  />
                </label>
              ) : null}
              {mark ? (
                <p className="text-sm font-bold" data-testid={`predict-${side}-mark`}>
                  {mark.right ? '✓ Right' : `✗ ${mark.expected === 'same' ? 'No change' : `${mark.expected === 'up' ? 'Up' : 'Down'} by ${formatINR(mark.expectedAmount)}`}`}
                </p>
              ) : null}
            </fieldset>
          );
        })}
      </div>
      {level === 'accounts' ? (
        <div className="grid gap-3 sm:grid-cols-2">
          {(['debited', 'credited'] as const).map((which) => (
            <fieldset key={which} data-testid={`predict-${which}`} className="flex flex-col gap-2 rounded-card border border-edge bg-surface p-3">
              <legend className="px-1 text-base font-extrabold">{which === 'debited' ? 'Accounts debited' : 'Accounts credited'}</legend>
              <div className="flex flex-wrap gap-1.5">
                {accounts.map((id) => (
                  <label key={id} className="relative">
                    <input
                      type="checkbox"
                      checked={(value[which] ?? []).includes(id)}
                      onChange={() => toggle(which, id)}
                      disabled={locked}
                      data-testid={`predict-${which}-${id}`}
                      className="peer sr-only"
                    />
                    <span className="inline-flex min-h-9 cursor-pointer items-center rounded-full border border-edge-deep bg-surface px-3 text-sm font-bold peer-checked:border-primary peer-checked:bg-primary-soft peer-checked:text-primary-ink peer-focus-visible:ring-4 peer-focus-visible:ring-focus">
                      {simLabel(id)}
                    </span>
                  </label>
                ))}
              </div>
              {marked?.accounts ? (
                <p className="text-sm font-bold">
                  {marked.accounts.right ? '✓ ' : '✗ Should be: '}
                  {marked.accounts.right ? 'Right' : marked.accounts[which].map(simLabel).join(', ')}
                </p>
              ) : null}
            </fieldset>
          ))}
        </div>
      ) : null}
    </div>
  );
}

/** The amounts typed, in paise: a blank or unreadable one is null. */
export function amountsFrom(text: Partial<Record<SideKey, string>>): Partial<Record<SideKey, number | null>> {
  return Object.fromEntries(SIDES.map((s) => [s, text[s] ? parseRupees(text[s]!) : null]));
}
