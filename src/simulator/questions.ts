import type { McqQuestion } from '@/content/types';
import { formatINR } from '@/engine/money';
import { createRng } from '@/engine/rng';
import { effectOfLines } from './engine';
import { describeEffect, entryWords } from './explain';
import { simQuestionId } from './ids';
import type { MistakeCase, Scene } from './scenes';
import type { Effect, SimTransaction } from './types';

// ---------------------------------------------------------------------------------------------------------------
// The questions behind the simulator's records. A prediction is recorded against "What does this transaction do to
// the accounting equation?" and a found mistake against "What went wrong in recording it?"; when one is wrong it
// waits in Mistakes as that question (four choices, each wrong one with its mistake), and a review asks it again.
// ---------------------------------------------------------------------------------------------------------------

const balanced = (e: Effect) => e.assets === e.liabilities + e.capital;
const zero: Effect = { assets: 0, liabilities: 0, capital: 0 };

/** Three wrong effects for a transaction: its own traps first, then mistakes students make with any transaction. */
export function wrongEffects(tx: SimTransaction, effect: Effect): { effect: Effect; why: string }[] {
  const x = Math.max(...tx.lines.map((l) => l.amount));
  const { assets: a, liabilities: l, capital: c } = effect;
  const general =
    a === 0 && l === 0 && c === 0
      ? [
          { effect: { assets: x, liabilities: x, capital: 0 }, why: 'Thought a new amount is owed, as if the business had bought on credit.' },
          { effect: { assets: x, liabilities: 0, capital: x }, why: "Took it as new value coming in and adding to the proprietor's capital." },
          { effect: { assets: -x, liabilities: 0, capital: -x }, why: 'Treated it as an expense or drawings, as if the value was lost.' },
        ]
      : [
          ...(l === 0 && c !== 0 ? [{ effect: { assets: a, liabilities: c, capital: 0 }, why: 'Put the change on the liabilities side instead of capital.' }] : []),
          ...(c === 0 && l !== 0 ? [{ effect: { assets: a, liabilities: 0, capital: l }, why: 'Put the change in capital instead of liabilities.' }] : []),
          { effect: zero, why: 'Thought one item only replaces another, so that no total changes.' },
          { effect: { assets: -a, liabilities: -l, capital: -c }, why: 'Reversed the direction of every change.' },
          { effect: { assets: x, liabilities: 0, capital: x }, why: "Took it as new value coming in and adding to the proprietor's capital." },
        ];
  const seen = new Set([describeEffect(effect)]);
  return [...(tx.traps ?? []), ...general].filter((w) => balanced(w.effect) && !seen.has(describeEffect(w.effect)) && seen.add(describeEffect(w.effect))).slice(0, 3);
}

/** A number from a string, to draw the order of the choices from. */
function hash(s: string): number {
  let h = 2166136261;
  for (const ch of s) h = Math.imul(h ^ ch.charCodeAt(0), 16777619) >>> 0;
  return h;
}

const ids = ['a', 'b', 'c', 'd'];

/** "What does this transaction do to the accounting equation?" for a transaction of a scene. */
export function predictionQuestion(scene: Scene, tx: SimTransaction): McqQuestion {
  const effect = effectOfLines(scene, tx.lines, tx.costOfSale ?? 0);
  const right = describeEffect(effect);
  const wrongs = wrongEffects(tx, effect);
  const options = [{ text: right }, ...wrongs.map((w) => ({ text: describeEffect(w.effect), why: w.why }))];
  const order = createRng(hash(tx.id)).shuffle(options.map((_, i) => i));
  const check = `Check: change in assets (${formatINR(Math.abs(effect.assets))}${effect.assets < 0 ? ' down' : effect.assets > 0 ? ' up' : ''}) = change in liabilities plus change in capital.`;
  const explanation = [tx.why ?? '', `${right}.`, `The entry: ${entryWords(tx.lines).join('; ')}.`, check].filter(Boolean).join(' ');
  return {
    id: simQuestionId(scene.id, tx.id),
    topicId: scene.topicId,
    conceptId: scene.concepts.predict,
    difficulty: 'medium',
    type: 'mcq',
    prompt: `${tx.text} What does this transaction do to the accounting equation?`,
    options: order.map((k, i) => ({ id: ids[i], text: options[k].text, ...(k === 0 ? {} : { why: (options[k] as { why: string }).why }) })),
    correct: ids[order.indexOf(0)],
    explanation,
    hints: ['Decide whether each of assets, liabilities and capital goes up, goes down or stays the same.', 'The change in assets must equal the change in liabilities plus the change in capital.'],
  };
}

/** "What went wrong in recording it?" for a mistake case of a scene. */
export function mistakeQuestion(scene: Scene, c: MistakeCase): McqQuestion {
  return {
    id: simQuestionId(scene.id, c.id),
    topicId: scene.topicId,
    conceptId: scene.concepts.mistake,
    difficulty: 'complex',
    type: 'mcq',
    prompt: `What happened: ${c.happened}\nHow it was recorded: ${c.recorded}\n${c.question}`,
    options: c.options,
    correct: c.correct,
    explanation: [...c.explanation, `Rectifying entry: ${entryWords(c.correction).join('; ')} (Being ${c.narration}).`].join(' '),
    hints: ['Was anything left out, was the amount or the account wrong, or was a rule of accounting broken?', 'An error that affects one account only stops the trial balance agreeing.'],
  };
}
