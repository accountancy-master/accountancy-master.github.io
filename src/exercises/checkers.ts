import type { Question } from '@/content/types';
import { logicFor, type CheckResult, type Response } from './logic';

export type { CheckResult, Response };

export function checkAnswer(q: Question, r: Response): CheckResult {
  if (q.type !== r.type) throw new Error(`Response type ${r.type} does not match question type ${q.type}`);
  return logicFor(q).check(q, r);
}
