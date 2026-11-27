import { describe, expect, it } from 'vitest';
import { hasKeyword, normaliseText, suggestedPoints } from './keywords';

describe('normaliseText', () => {
  it('drops case, punctuation and extra spaces', () => {
    expect(normaliseText('  A Provision,  is a CHARGE—against profit!  ')).toBe('a provision is a charge against profit');
    expect(normaliseText("Owner's capital")).toBe('owners capital');
    expect(normaliseText('...')).toBe('');
  });

  it('keeps an amount as one word, without its grouping commas, and a decimal point in a number', () => {
    expect(normaliseText('Capital ₹1,10,000. Rent Rs. 4,000/-')).toBe('capital 110000 rent rs 4000');
    expect(normaliseText('A rate of 12.5% p.a., i.e. 10,000.50.')).toBe('a rate of 12.5 p a i e 10000.50');
  });
});

describe('hasKeyword', () => {
  it('matches whole words only', () => {
    expect(hasKeyword('The cost of goods', 'cost')).toBe(true);
    expect(hasKeyword('A costly mistake', 'cost')).toBe(false);
    expect(hasKeyword('It is accounting', 'account')).toBe(true);
    expect(hasKeyword('The accountant', 'account')).toBe(false);
  });

  it('allows a plural, -ing or -ed ending', () => {
    expect(hasKeyword('Two costs were met', 'cost')).toBe(true);
    expect(hasKeyword('It is charged to profit', 'charge')).toBe(true);
    expect(hasKeyword('Charging it to profit', 'charge')).toBe(true);
    expect(hasKeyword('Current liabilities', 'liability')).toBe(true);
    expect(hasKeyword('The rules were applied', 'apply')).toBe(true);
    expect(hasKeyword('Depreciation stopped', 'stop')).toBe(true);
    expect(hasKeyword('Boxes of goods', 'box')).toBe(true);
    // A key word given as a plural also matches the singular.
    expect(hasKeyword('A general reserve', 'reserves')).toBe(true);
  });

  it('matches a phrase as words in order, whatever the case, punctuation and spacing', () => {
    expect(hasKeyword('It is a CHARGE,   against profit.', 'charge against profit')).toBe(true);
    expect(hasKeyword('Charged against profits', 'charge against profit')).toBe(true);
    expect(hasKeyword('Against profit, a charge', 'charge against profit')).toBe(false);
    expect(hasKeyword('A charge made against the profit', 'charge against profit')).toBe(false);
  });

  it('matches an amount as a whole, with or without its commas', () => {
    expect(hasKeyword('Goodwill of ₹10,000 was raised.', '10,000')).toBe(true);
    expect(hasKeyword('Goodwill of 10000 was raised.', '10,000')).toBe(true);
    expect(hasKeyword('Goodwill of ₹10,000 was raised.', '10000')).toBe(true);
    expect(hasKeyword('Capital of ₹1,10,000', '10,000')).toBe(false);
    expect(hasKeyword('A loss of ₹40,000', '4,000')).toBe(false);
    expect(hasKeyword('A loss of ₹14,000', '4,000')).toBe(false);
    expect(hasKeyword('A loss of 4,000.', '4,000')).toBe(true);
    expect(hasKeyword('Interest at 12.5%', '12.5')).toBe(true);
    expect(hasKeyword('Interest at 12.5%', '2.5')).toBe(false);
    expect(hasKeyword('Interest at 12.5%', '12')).toBe(false);
  });

  it('finds nothing in an empty answer, and an empty key word nowhere', () => {
    expect(hasKeyword('', 'cost')).toBe(false);
    expect(hasKeyword('cost', '  ')).toBe(false);
  });
});

describe('suggestedPoints', () => {
  const q = {
    points: [
      { text: 'A provision is a charge against profit; a reserve is an appropriation of profit.', keywords: ['charge against profit', 'appropriation'] },
      { text: 'A provision meets a known liability; a reserve strengthens the financial position.', keywords: ['known liability', 'strengthen'] },
      { text: 'A provision is made even when there is a loss.', keywords: ['even when', 'only out of profit'] },
    ],
  };

  it('suggests a point when any one of its key words is in the answer', () => {
    expect(suggestedPoints(q, 'A reserve is an appropriation. Reserves strengthen the business.')).toEqual([0, 1]);
    expect(suggestedPoints(q, 'Provisions are made even when there is a loss; they meet known liabilities.')).toEqual([1, 2]);
  });

  it('suggests nothing for an empty answer or one without the key words', () => {
    expect(suggestedPoints(q, '')).toEqual([]);
    expect(suggestedPoints(q, '   ')).toEqual([]);
    expect(suggestedPoints(q, 'Both are kept in the books.')).toEqual([]);
  });
});
