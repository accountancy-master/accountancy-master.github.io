/**
 * The hues of tiles (see globals.css): the thin top edge of a tile, the tint behind its icon and the colour of the
 * icon say what kind of thing the tile is. Written out in full so that Tailwind finds every class.
 */
export type Hue = 'green' | 'teal' | 'blue' | 'violet' | 'rose' | 'amber' | 'orange' | 'sky';

export const HUES: readonly Hue[] = ['green', 'teal', 'blue', 'violet', 'rose', 'amber', 'orange', 'sky'];

/** The top edge of a tile in the hue. */
export const HUE_EDGE: Record<Hue, string> = {
  green: 'border-t-hue-green',
  teal: 'border-t-hue-teal',
  blue: 'border-t-hue-blue',
  violet: 'border-t-hue-violet',
  rose: 'border-t-hue-rose',
  amber: 'border-t-hue-amber',
  orange: 'border-t-hue-orange',
  sky: 'border-t-hue-sky',
};

/** An icon in the hue, on its soft tint. */
export const HUE_ICON: Record<Hue, string> = {
  green: 'bg-hue-green-soft text-hue-green',
  teal: 'bg-hue-teal-soft text-hue-teal',
  blue: 'bg-hue-blue-soft text-hue-blue',
  violet: 'bg-hue-violet-soft text-hue-violet',
  rose: 'bg-hue-rose-soft text-hue-rose',
  amber: 'bg-hue-amber-soft text-hue-amber',
  orange: 'bg-hue-orange-soft text-hue-orange',
  sky: 'bg-hue-sky-soft text-hue-sky',
};

/** A bar or a ring drawn in the hue. */
export const HUE_FILL: Record<Hue, string> = {
  green: 'bg-hue-green',
  teal: 'bg-hue-teal',
  blue: 'bg-hue-blue',
  violet: 'bg-hue-violet',
  rose: 'bg-hue-rose',
  amber: 'bg-hue-amber',
  orange: 'bg-hue-orange',
  sky: 'bg-hue-sky',
};

export const HUE_STROKE: Record<Hue, string> = {
  green: 'stroke-hue-green',
  teal: 'stroke-hue-teal',
  blue: 'stroke-hue-blue',
  violet: 'stroke-hue-violet',
  rose: 'stroke-hue-rose',
  amber: 'stroke-hue-amber',
  orange: 'stroke-hue-orange',
  sky: 'stroke-hue-sky',
};
