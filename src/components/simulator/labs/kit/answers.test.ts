import { describe, expect, it } from 'vitest';
import { answerText, judge, parsePercentText, parseRatioText, parseRupees, readyToMark, sameRatio, type AnyAnswer } from './answers';

describe('the answers of a quick question', () => {
  it('reads a figure as a learner types it', () => {
    expect(parseRupees('1,20,000')).toBe(12000000);
    expect(parseRupees('₹ 4500')).toBe(450000);
    expect(parseRupees('4500.5')).toBe(450050);
    expect(parseRupees('Rs. 300')).toBe(30000);
    expect(parseRupees('')).toBeNull();
    expect(parseRupees('-300')).toBeNull();
    expect(parseRupees('abc')).toBeNull();
  });

  it('marks a figure, names a known mistake, and checks the word with it', () => {
    const a: AnyAnswer = {
      type: 'number', value: 500000, mistakes: [{ value: 700000, why: 'Added everything.' }],
      tag: { label: 'Favourable or overdraft?', options: [{ id: 'fav', text: 'Favourable' }, { id: 'od', text: 'Overdraft', why: 'It stays above nothing.' }], correct: 'fav' },
    };
    expect(judge(a, { figure: 500000, tag: 'fav' })).toEqual({ right: true, why: null });
    expect(judge(a, { figure: 700000, tag: 'fav' })).toEqual({ right: false, why: 'Added everything.' });
    expect(judge(a, { figure: 100, tag: 'fav' }).why).toBe('₹1 is not it.');
    expect(judge(a, { figure: 500000, tag: 'od' })).toEqual({ right: false, why: 'The figure is right, but not the word with it. It stays above nothing.' });
  });

  it('marks an option', () => {
    const a: AnyAnswer = { type: 'choice', correct: 'add', options: [{ id: 'add', text: 'Add' }, { id: 'less', text: 'Less', why: 'Other way.' }] };
    expect(judge(a, { choice: 'add' }).right).toBe(true);
    expect(judge(a, { choice: 'less' })).toEqual({ right: false, why: 'Other way.' });
  });

  it('reads and marks a figure typed in rupees', () => {
    const a: AnyAnswer = { type: 'number', value: 450000, mistakes: [] };
    expect(judge(a, { typed: '4,500' }).right).toBe(true);
    expect(judge(a, { typed: 'four' })).toEqual({ right: false, why: 'That is not a figure.' });
    expect(readyToMark(a, { typed: ' ' })).toBe(false);
    expect(answerText(a)).toBe('₹4,500');
  });

  it('reads and marks a percentage, with the word with it', () => {
    expect(parsePercentText('12.5 %')).toBe(1250);
    expect(parsePercentText('-3')).toBeNull();
    const a: AnyAnswer = {
      type: 'percent', value: 1667, mistakes: [{ value: 2000, why: 'On the later figure.' }],
      tag: { label: 'Increase or decrease?', options: [{ id: 'up', text: 'Increase' }, { id: 'down', text: 'Decrease' }], correct: 'up' },
    };
    expect(judge(a, { typed: '16.67', tag: 'up' }).right).toBe(true);
    expect(judge(a, { typed: '20', tag: 'up' })).toEqual({ right: false, why: 'On the later figure.' });
    expect(judge(a, { typed: '16', tag: 'up' }).why).toBe('16% is not it.');
    expect(judge(a, { typed: '16.67', tag: 'down' }).right).toBe(false);
    expect(readyToMark(a, { typed: '16.67', tag: null })).toBe(false);
    expect(answerText(a)).toBe('16.67% (increase)');
  });

  it('marks a ratio in any terms that reduce to it', () => {
    expect(parseRatioText('3 : 2')).toEqual([3, 2]);
    expect(parseRatioText('3')).toBeNull();
    expect(sameRatio([6, 4], [3, 2])).toBe(true);
    const a: AnyAnswer = { type: 'ratio', terms: [3, 2], mistakes: [{ terms: [2, 3], why: 'Turned round.' }] };
    expect(judge(a, { typed: '6:4' }).right).toBe(true);
    expect(judge(a, { typed: '2:3' })).toEqual({ right: false, why: 'Turned round.' });
    expect(judge(a, { typed: '3:2:1' }).right).toBe(false);
    expect(readyToMark(a, { typed: '3:' })).toBe(false);
    expect(answerText(a)).toBe('3:2');
  });

  it('marks every option that applies', () => {
    const a: AnyAnswer = {
      type: 'multi', correct: ['a', 'b'],
      options: [{ id: 'a', text: 'Debit Trading A/c' }, { id: 'b', text: 'Show as an asset' }, { id: 'c', text: 'Credit Capital A/c', why: 'Stock is not capital.' }],
    };
    expect(judge(a, { picked: ['b', 'a'] }).right).toBe(true);
    expect(judge(a, { picked: ['a', 'c'] })).toEqual({ right: false, why: 'Stock is not capital.' });
    expect(judge(a, { picked: ['a'] })).toEqual({ right: false, why: 'Some that apply are not picked.' });
    expect(answerText(a)).toBe('Debit Trading A/c; Show as an asset');
  });
});
