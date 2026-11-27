import { CONFIG } from './config';

/** localStorage key of the device-level "unlock all levels" setting. */
export const UNLOCK_ALL_KEY = 'am.unlockAll';

/** The setting from what is stored: '1' is on, '0' is off, anything else (nothing stored) is the configured default. */
export function unlockAllFromStored(raw: string | null | undefined): boolean {
  if (raw === '1') return true;
  if (raw === '0') return false;
  return CONFIG.ladder.unlockAllByDefault;
}

export const unlockAllToStored = (on: boolean): '1' | '0' => (on ? '1' : '0');
