import type { Difficulty } from '../types';

// Board-style written answers: "Distinguish between …", "State any three features of …", "Give two reasons …",
// "Explain …". The learner writes an answer, then sees the model answer laid out as the marking scheme credits it, and
// ticks the points it covered (the app suggests ticks from each point's key words). Marks are given point by point.
//
// The questions are plain data, one file per class (cbse11.ts, cbse12.ts), written by hand in original words.

/** The form of the question, as the board words it. */
export type WrittenForm = 'distinguish' | 'features' | 'explain' | 'reasons' | 'list' | 'short-note';

/** One point a marking scheme gives marks for. */
export interface WrittenPoint {
  /** The point as the model answer states it ("A provision is a charge against profit; a reserve is an appropriation of profit"). */
  text: string;
  /**
   * Words or short phrases (lower case) whose presence in the learner's answer suggests the point is covered
   * ("charge against profit", "appropriation"): at least one, used only to suggest a tick, never to mark on its own.
   */
  keywords: string[];
}

export interface WrittenQuestion {
  /** 'w11-<topic prefix>-001' (Class 11) or 'w12-<topic prefix>-001' (Class 12), unique. */
  id: string;
  topicId: string;
  /** A concept of the topic, as in its pack. */
  conceptId: string;
  difficulty: Difficulty;
  form: WrittenForm;
  /** The marks the board gives the question. */
  marks: 1 | 3 | 4 | 6;
  /** The question, as the board would set it. */
  prompt: string;
  /** How many points earn full marks ("any three"): each point is worth marks ÷ pointsNeeded. */
  pointsNeeded: number;
  /** The points the marking scheme accepts: at least `pointsNeeded`, often a few more. */
  points: WrittenPoint[];
  /**
   * For a "distinguish" question: the table the board expects, with a basis of distinction in the first column.
   * `headers` are ['Basis', <first term>, <second term>]; each row lines up with a point of `points`, in order.
   */
  table?: { headers: [string, string, string]; rows: [string, string, string][] };
  /** The model answer as a board examiner would accept it, for a question that is not a table. */
  answer?: string;
  /** How marks are given, as an examiner would say it ("½ mark for each basis and ½ for each side"), and what loses them. */
  markingTip: string;
  /** Two hints: a first nudge, then a stronger one. */
  hints: [string, string];
}
