import { describe, expect, it } from 'vitest';
import { partsOfCode } from './codes';

describe('partsOfCode', () => {
  it('reads the rows of a format, less one for every extra row', () => {
    expect(partsOfCode('rows:ooooooooom')).toEqual({ right: 9, total: 10 });
    expect(partsOfCode('rows:oooac;3.5')).toEqual({ right: 1, total: 5 });
    expect(partsOfCode('rows:mm;1.2.3')).toEqual({ right: 0, total: 2 });
  });
  it('reads the entries of a set', () => {
    expect(partsOfCode('set:ok,sidesReversed,ok,empty')).toEqual({ right: 2, total: 4 });
  });
  it('reads nothing else', () => {
    expect(partsOfCode(undefined)).toBeNull();
    expect(partsOfCode('wrongAmount')).toBeNull();
    expect(partsOfCode('option:b')).toBeNull();
    expect(partsOfCode('rows:')).toBeNull();
  });
});
