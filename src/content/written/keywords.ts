import type { WrittenQuestion } from './types';

// Which points of a written answer the learner seems to have covered, from the key words of each point: a point is
// suggested when any one of its key words (a word, or a phrase of several) is in the answer. Only ever a suggestion:
// the learner ticks or unticks every point before the marks are worked out.
//
// Case, punctuation and spacing do not count. A key word matches whole words only ("cost" is not in "costly"), and a
// word of the answer may carry a simple ending the key word has not: a plural, -ing or -ed ("charge" is in "charged",
// "charges" and "charging"; "liability" in "liabilities"). An amount is one word, read without its grouping commas:
// "10,000" is in "₹10,000" and in "10000", but not in "1,10,000" or "40,000"; "12.5" keeps its decimal point.

/** Lower case, letters and digits only (an amount whole, without its commas), one space between words. */
export function normaliseText(text: string): string {
  return (
    text
      .toLowerCase()
      .replace(/['’]/g, '')
      // 1,10,000 → 110000: the grouping commas of an amount are not word breaks.
      .replace(/(\d),(?=\d)/g, '$1')
      .replace(/[^a-z0-9.]+/g, ' ')
      // A point is kept only between two digits (a decimal point); anywhere else it ends a sentence.
      .replace(/\.(?!\d)|(?<!\d)\./g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
  );
}

const words = (text: string): string[] => {
  const n = normaliseText(text);
  return n === '' ? [] : n.split(' ');
};

/** The forms of a key word that count as the word: itself, and the word with a simple ending. */
export function wordForms(word: string): Set<string> {
  const forms = new Set([word, `${word}s`, `${word}es`, `${word}ing`, `${word}ed`, `${word}d`]);
  // A key word given as a plural also matches the singular ("reserves" in "a reserve").
  if (word.length > 3 && word.endsWith('s') && !word.endsWith('ss')) forms.add(word.slice(0, -1));
  // make → making; reduce → reduced (above), reducing.
  if (word.endsWith('e') && word.length > 2) forms.add(`${word.slice(0, -1)}ing`);
  // liability → liabilities; apply → applied.
  if (/[^aeiou]y$/.test(word)) {
    forms.add(`${word.slice(0, -1)}ies`);
    forms.add(`${word.slice(0, -1)}ied`);
  }
  // A short word that ends consonant-vowel-consonant doubles its last letter: stop → stopped, stopping.
  if (/^[a-z]{0,3}[^aeiou][aeiou][^aeiouwxy]$/.test(word)) {
    const last = word[word.length - 1];
    forms.add(`${word}${last}ed`);
    forms.add(`${word}${last}ing`);
  }
  return forms;
}

/** True when the key word (one word or a phrase) is in the text, as whole words in that order. */
export function hasKeyword(text: string, keyword: string): boolean {
  return indexOfPhrase(words(text), keyword) >= 0;
}

function indexOfPhrase(textWords: readonly string[], keyword: string): number {
  const forms = words(keyword).map(wordForms);
  if (forms.length === 0) return -1;
  for (let i = 0; i + forms.length <= textWords.length; i++) {
    if (forms.every((f, j) => f.has(textWords[i + j]))) return i;
  }
  return -1;
}

/**
 * The points (by their place in `points`) whose key words are in the answer: the ticks suggested to the learner.
 * Nothing for an empty answer.
 */
export function suggestedPoints(question: Pick<WrittenQuestion, 'points'>, answer: string): number[] {
  const textWords = words(answer);
  if (textWords.length === 0) return [];
  return question.points.flatMap((p, i) => (p.keywords.some((k) => indexOfPhrase(textWords, k) >= 0) ? [i] : []));
}
