'use client';

import { useId, useState } from 'react';
import type { Paise } from '@/engine/money';
import { parseRupees } from './answers';

/** Paise as the figure in a field: whole rupees without separators. */
const asText = (p: Paise) => String(p / 100);

/**
 * A field for an amount in rupees. It keeps what is typed while it is being typed and reports a figure whenever what
 * is typed is one, within `min` and `max` rupees.
 */
export function MoneyField({ label, value, onChange, testId, min = 0, max = 1e8, hint }: { label: string; value: Paise; onChange(p: Paise): void; testId: string; min?: number; max?: number; hint?: string }) {
  const id = useId();
  const [text, setText] = useState(asText(value));
  const [last, setLast] = useState(value);
  // A new figure from outside (a ready example, new figures) replaces what is typed.
  if (last !== value) {
    setLast(value);
    if (parseRupees(text) !== value) setText(asText(value));
  }
  const parsed = parseRupees(text);
  const bad = parsed === null || parsed < min * 100 || parsed > max * 100;
  return (
    <label htmlFor={id} className="flex min-w-0 flex-col gap-1 text-sm font-bold">
      {label}
      <span className="flex items-center rounded-control border-2 border-edge-deep bg-surface focus-within:border-primary">
        <span aria-hidden="true" className="pl-2 text-muted">
          ₹
        </span>
        <input
          id={id}
          data-testid={testId}
          inputMode="decimal"
          autoComplete="off"
          value={text}
          aria-invalid={bad}
          onChange={(e) => {
            setText(e.target.value);
            const p = parseRupees(e.target.value);
            if (p !== null && p >= min * 100 && p <= max * 100) {
              setLast(p);
              onChange(p);
            }
          }}
          className="min-h-11 w-full min-w-0 bg-transparent px-2 text-base tabular-nums outline-none"
        />
      </span>
      {bad ? <span className="text-xs font-semibold text-danger-deep">Type an amount from ₹{min.toLocaleString('en-IN')} to ₹{max.toLocaleString('en-IN')}.</span> : hint ? <span className="text-xs font-normal text-muted">{hint}</span> : null}
    </label>
  );
}

/** A whole number with a slider and a field side by side (a rate, a life in years). */
export function NumberSlider({ label, value, onChange, min, max, step = 1, unit, testId }: { label: string; value: number; onChange(n: number): void; min: number; max: number; step?: number; unit: string; testId: string }) {
  const id = useId();
  return (
    <div className="flex min-w-0 flex-col gap-1 text-sm font-bold">
      <label htmlFor={id}>
        {label}: <span className="tabular-nums">{value}</span> {unit}
      </label>
      <div className="flex items-center gap-2">
        <input
          id={id}
          type="range"
          min={min}
          max={max}
          step={step}
          value={value}
          data-testid={testId}
          onChange={(e) => onChange(Number(e.target.value))}
          className="h-11 min-w-0 flex-1 accent-[var(--color-primary)]"
        />
        <input
          type="number"
          aria-label={`${label} (${unit})`}
          min={min}
          max={max}
          step={step}
          value={value}
          data-testid={`${testId}-number`}
          onChange={(e) => {
            const n = Number(e.target.value);
            if (Number.isFinite(n) && n >= min && n <= max) onChange(n);
          }}
          className="min-h-11 w-16 rounded-control border-2 border-edge-deep bg-surface px-2 text-base tabular-nums"
        />
      </div>
    </div>
  );
}

/** A labelled number in a field (whole rupees, a ratio term, a rate), with what it is in after it. */
export function NumberField({
  id: given,
  label,
  value,
  onChange,
  min,
  max,
  step = 1,
  suffix,
  testId,
}: {
  /** The id of the field (one is made when it is not given). */
  id?: string;
  label: string;
  value: number;
  onChange(v: number): void;
  min?: number;
  max?: number;
  step?: number;
  suffix?: string;
  testId?: string;
}) {
  const made = useId();
  const id = given ?? made;
  return (
    <label htmlFor={id} className="flex min-w-0 flex-col gap-1 text-sm font-bold">
      <span>{label}</span>
      <span className="flex items-center gap-1">
        <input
          id={id}
          type="number"
          inputMode="numeric"
          data-testid={testId}
          value={Number.isFinite(value) ? value : ''}
          min={min}
          max={max}
          step={step}
          onChange={(e) => {
            const v = e.target.valueAsNumber;
            if (Number.isFinite(v)) onChange(v);
          }}
          className="min-h-11 w-full min-w-0 rounded-control border-2 border-edge-deep bg-surface px-2 text-base font-semibold tabular-nums text-ink"
        />
        {suffix ? <span className="shrink-0 text-muted">{suffix}</span> : null}
      </span>
    </label>
  );
}

/** A slider with its label and its value in words beside it ("₹40,000"). Test ids `<testId>` and `<testId>-value`. */
export function Slider({
  label,
  value,
  min,
  max,
  step,
  text,
  onChange,
  testId,
  note,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  /** The value as it is shown: "₹40,000". */
  text: string;
  onChange(v: number): void;
  testId?: string;
  note?: string;
}) {
  const id = useId();
  return (
    <div className="flex min-w-0 flex-col gap-0.5">
      <div className="flex flex-wrap items-baseline justify-between gap-x-2">
        <label htmlFor={id} className="text-sm font-bold">
          {label}
        </label>
        <output htmlFor={id} className="text-sm font-extrabold tabular-nums" data-testid={testId ? `${testId}-value` : undefined}>
          {text}
        </output>
      </div>
      <input
        id={id}
        type="range"
        min={min}
        max={max}
        step={step}
        value={Math.min(max, Math.max(min, value))}
        aria-valuetext={text}
        data-testid={testId}
        onChange={(e) => onChange(Number(e.target.value))}
        className="h-11 w-full cursor-pointer accent-[var(--color-primary)]"
      />
      {note ? <p className="text-xs text-muted">{note}</p> : null}
    </div>
  );
}
