import { afterEach, describe, expect, it, vi } from 'vitest';
import { newId } from './ids';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

describe('newId', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('returns distinct uuids', () => {
    const a = newId();
    expect(a).toMatch(UUID);
    expect(newId()).not.toBe(a);
  });

  it('works where crypto.randomUUID is unavailable (plain http on a phone)', () => {
    const real = globalThis.crypto;
    vi.stubGlobal('crypto', { getRandomValues: real.getRandomValues.bind(real) });
    expect(newId()).toMatch(UUID);
  });
});
