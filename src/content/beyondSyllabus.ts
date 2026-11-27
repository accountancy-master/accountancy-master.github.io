import type { Card, Question } from './types';

// ---------------------------------------------------------------------------------------------------------------
// Practice that goes further than the CBSE 2025-26 syllabus of its course (see `TemplateBase.beyondSyllabus`): the
// reasons shown with the "Beyond the syllabus" chip, one for each family, so that every template and authored question
// of a family says the same.
// ---------------------------------------------------------------------------------------------------------------

/** Class 11: interest on drawings of a sole proprietor. */
export const BEYOND_INTEREST_ON_DRAWINGS =
  'The Class 11 syllabus lists interest on capital among the adjustments, not interest on drawings; partners meet it in Class 12.';

/** Class 11: the order in which IGST credit is used across the heads of GST. */
export const BEYOND_IGST_CROSS_SET_OFF = 'The syllabus asks for simple GST sums; the order of using IGST credit across heads goes further.';

/** An authored question, marked as teaching beyond the syllabus of its course for `reason`. */
export const beyondQuestion = <Q extends Question>(question: Q, reason: string): Q => ({ ...question, beyondSyllabus: reason });

/** A rule card, marked as teaching beyond the syllabus of its course for `reason` (see `Card.beyondSyllabus`). */
export const beyondCard = (card: Card, reason: string): Card => ({ ...card, beyondSyllabus: reason });
