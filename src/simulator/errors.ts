import type { ErrorClass } from './scenes';

/** The classes of error as CBSE names them, for a heading. */
export const ERROR_CLASS_NAME: Record<ErrorClass, string> = {
  omission: 'Error of omission',
  commission: 'Error of commission',
  principle: 'Error of principle',
};

/** The class of an error inside a sentence: "it is an error of principle". */
export const ERROR_CLASS_PHRASE: Record<ErrorClass, string> = {
  omission: 'an error of omission',
  commission: 'an error of commission',
  principle: 'an error of principle',
};

/** An error's class and its effect, inside a sentence: "an error of commission, and a one-sided one". */
export const errorPhrase = (c: { errorClass: ErrorClass; oneSided: boolean }): string =>
  `${ERROR_CLASS_PHRASE[c.errorClass]}${c.oneSided ? ' that leaves one account wrong (a one-sided error), so the trial balance does not agree' : ''}`;
