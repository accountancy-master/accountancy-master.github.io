import { describe, expect, it } from 'vitest';
import { accountOptions } from './accounts';

describe('accountOptions', () => {
  it('labels fixed and party accounts and sorts by label', () => {
    expect(accountOptions(['sales', 'creditor:Rao & Co.', 'cash', 'inputCGST'])).toEqual([
      { id: 'cash', label: 'Cash' },
      { id: 'inputCGST', label: 'Input CGST' },
      { id: 'creditor:Rao & Co.', label: 'Rao & Co.' },
      { id: 'sales', label: 'Sales' },
    ]);
  });
  it('sorts case-insensitively so a lowercase party name is in alphabetical place', () => {
    expect(accountOptions(['sales', 'creditor:anita traders', 'cash']).map((o) => o.label)).toEqual([
      'anita traders',
      'Cash',
      'Sales',
    ]);
  });
  it('removes duplicates', () => {
    expect(accountOptions(['cash', 'cash'])).toHaveLength(1);
  });
});
