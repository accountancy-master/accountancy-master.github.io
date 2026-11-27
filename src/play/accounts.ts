import { resolveAccount } from '@/engine/accounts';

export function accountOptions(ids: string[]): { id: string; label: string }[] {
  return [...new Set(ids)]
    .map((id) => ({ id, label: resolveAccount(id).name }))
    .sort((a, b) => a.label.localeCompare(b.label, 'en', { sensitivity: 'base' }));
}
