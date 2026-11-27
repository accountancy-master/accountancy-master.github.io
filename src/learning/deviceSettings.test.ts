import { describe, expect, it } from 'vitest';
import { CONFIG } from './config';
import { UNLOCK_ALL_KEY, unlockAllFromStored, unlockAllToStored } from './deviceSettings';

describe('the unlock-all device setting', () => {
  it('is off for a device that has never chosen: the ladder is in order', () => {
    expect(CONFIG.ladder.unlockAllByDefault).toBe(false);
    expect(unlockAllFromStored(null)).toBe(false);
    expect(unlockAllFromStored(undefined)).toBe(false);
    expect(unlockAllFromStored('')).toBe(false);
    expect(unlockAllFromStored('yes')).toBe(false);
  });

  it('follows what was stored: a device that chose keeps its choice', () => {
    expect(unlockAllFromStored('1')).toBe(true);
    expect(unlockAllFromStored('0')).toBe(false);
  });

  it('round-trips through its stored form under the agreed key', () => {
    expect(UNLOCK_ALL_KEY).toBe('am.unlockAll');
    for (const on of [true, false]) expect(unlockAllFromStored(unlockAllToStored(on))).toBe(on);
  });
});
