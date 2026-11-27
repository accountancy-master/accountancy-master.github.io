import { describe, expect, it } from 'vitest';
import { MISTAKE_TEXT, describeMistake } from './mistakeText';
import { REVEALED_HINTS } from './session';

describe('describeMistake', () => {
  it('words every known mistake code', () => {
    expect(describeMistake({ mistakeCode: 'sidesReversed', hintsUsed: 0 })).toBe('The debit and credit sides are swapped.');
    for (const code of Object.keys(MISTAKE_TEXT)) {
      expect(describeMistake({ mistakeCode: code, hintsUsed: 0 })).toBe(MISTAKE_TEXT[code]);
    }
  });

  it('says the answer was shown when it was revealed, whatever code is stored', () => {
    expect(describeMistake({ hintsUsed: REVEALED_HINTS })).toBe('Answer was shown');
    expect(describeMistake({ mistakeCode: 'wrongAmount', hintsUsed: REVEALED_HINTS })).toBe('Answer was shown');
  });

  it('falls back to a plain line for a wrong choice with no code, or an unknown code', () => {
    expect(describeMistake({ hintsUsed: 0 })).toBe('The answer was not right.');
    expect(describeMistake({ mistakeCode: 'nope', hintsUsed: 1 })).toBe('The answer was not right.');
    expect(describeMistake(undefined)).toBe('The answer was not right.');
  });
});
