'use client';

import { useMemo, useState } from 'react';
import { MEERA, newBusiness } from '@/simulator/final-accounts/examples';
import { adjKey, finalAccounts, SPOT_NAMES, SPOTS, type Business, type Spot } from '@/simulator/final-accounts/model';
import { countWord, effectsWanted, markEffects, markFigure, markWhere, parseRupees, tryRound, type TryQuestion } from '@/simulator/final-accounts/tryit';
import { Stage } from '../kit/Playback';
import { AnswerField, ChoiceButton, ChoiceGroup, TryCard, useScore } from '../kit/TryIt';
import { Board, T } from './Board';

// ---------------------------------------------------------------------------------------------------------------
// Try it: six quick questions on the picture, two of each kind (where a balance goes, the effects of an
// adjustment, the gross or net profit after a change), each marked at once with the reason. Once answered, the
// picture shows the answer: the balance flies to its place, the effects land, the profit appears. Nothing is
// recorded.
// ---------------------------------------------------------------------------------------------------------------

interface Round {
  business: Business;
  questions: TryQuestion[];
}

const roundOf = (business: Business, seed: number): Round => ({ business, questions: tryRound(business, seed) });

interface Verdict {
  right: boolean;
  why: string[];
  /** What was chosen: a spot, option ids, or the figure typed. */
  chosen: string[];
}

const KIND_TITLE = { where: 'Where does it go?', effects: 'The effects of an adjustment' } as const;

export function TryPanel({ reduced, seed }: { reduced: boolean; seed?: number }) {
  const [round, setRound] = useState<Round>(() => roundOf(MEERA, seed ?? 1));
  const [at, setAt] = useState(0);
  const [verdict, setVerdict] = useState<Verdict | null>(null);
  const [picked, setPicked] = useState<string[]>([]);
  const [typed, setTyped] = useState('');
  const [score, count] = useScore();
  const [nextSeed, setNextSeed] = useState<number | null>(seed === undefined ? null : seed + 1);

  const { business, questions } = round;
  const q = questions[at];
  const answered = verdict !== null;
  const wanted = q.kind === 'effects' ? effectsWanted(q) : 0;
  const shown = answered ? q.after : q.before;
  const statements = useMemo(() => finalAccounts(business, shown), [business, shown]);
  const before = useMemo(() => (answered ? finalAccounts(business, q.before) : null), [answered, business, q]);

  const settle = (v: Verdict) => {
    setVerdict(v);
    count(v.right);
  };
  const next = () => {
    setVerdict(null);
    setPicked([]);
    setTyped('');
    if (at + 1 < questions.length) {
      setAt(at + 1);
      return;
    }
    const s = nextSeed ?? 1 + Math.floor(Math.random() * 1_000_000);
    setNextSeed(s + 1);
    setRound(roundOf(newBusiness(s), s));
    setAt(0);
  };
  const check = () => {
    if (answered) return;
    if (q.kind === 'effects') {
      if (picked.length === wanted) settle({ ...markEffects(q, picked), chosen: picked });
    } else if (q.kind === 'figure') {
      const v = parseRupees(typed);
      if (v === null) return;
      const m = markFigure(q, v);
      settle({ right: m.right, why: [m.why], chosen: [typed] });
    }
  };

  const cards =
    q.kind === 'effects'
      ? business.adjustments
          .filter((a) => a.type === 'closingStock' || adjKey(a) === adjKey(q.adjustment))
          .map((a) => ({ adjustment: a, made: shown.adjustments.some((x) => adjKey(x) === adjKey(a)) }))
      : business.adjustments.filter((a) => shown.adjustments.some((x) => adjKey(x) === adjKey(a))).map((a) => ({ adjustment: shown.adjustments.find((x) => adjKey(x) === adjKey(a)) ?? a, made: true }));

  return (
    <div className="flex flex-col gap-3">
      <TryCard
        prefix={T}
        kind={q.kind}
        question={q.id}
        title={q.kind === 'figure' ? (q.level === 'gross' ? 'The gross profit now' : 'The net profit now') : KIND_TITLE[q.kind]}
        progress={`Question ${at + 1} of ${questions.length} · ${business.name}`}
        score={score}
        prompt={q.prompt}
        verdict={verdict ? { right: verdict.right, reason: verdict.why.map((w, i) => <p key={i}>{w}</p>), note: 'The picture below now shows the answer.' } : null}
        onCheck={q.kind === 'where' ? undefined : check}
        canCheck={q.kind === 'effects' ? picked.length === wanted : parseRupees(typed) !== null}
        onNext={next}
        nextLabel={at + 1 < questions.length ? 'Next question' : 'New questions'}
      >
        {q.kind === 'where' ? (
          <ChoiceGroup label="Where it goes" className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {SPOTS.map((s: Spot) => (
              <ChoiceButton
                key={s}
                testId={`${T}-try-spot-${s}`}
                chosen={verdict?.chosen.includes(s) ?? false}
                mark={answered ? (s === q.answer ? 'right' : verdict.chosen.includes(s) ? 'wrong' : null) : null}
                disabled={answered}
                onClick={() => settle({ ...markWhere(q, s), why: [markWhere(q, s).why], chosen: [s] })}
                className="text-sm"
              >
                {SPOT_NAMES[s]}
              </ChoiceButton>
            ))}
          </ChoiceGroup>
        ) : null}

        {q.kind === 'effects' ? (
          <div className="flex flex-col gap-2">
            <p className="text-sm font-bold text-muted">Choose {countWord(wanted)}.</p>
            <ChoiceGroup label={`Choose ${countWord(wanted)}`} className="flex flex-col gap-2">
              {q.options.map((o) => {
                const on = picked.includes(o.id);
                return (
                  <ChoiceButton
                    key={o.id}
                    testId={`${T}-try-option-${o.id}`}
                    chosen={on}
                    mark={answered ? (o.right ? 'right' : on ? 'wrong' : null) : null}
                    disabled={answered || (!on && picked.length >= wanted)}
                    onClick={() => setPicked(on ? picked.filter((x) => x !== o.id) : [...picked, o.id])}
                    className="text-sm font-semibold"
                  >
                    {o.text}
                  </ChoiceButton>
                );
              })}
            </ChoiceGroup>
          </div>
        ) : null}

        {q.kind === 'figure' ? (
          <AnswerField
            unit="rupee"
            label={q.level === 'gross' ? 'Gross profit' : 'Net profit'}
            value={typed}
            onChange={setTyped}
            testId={`${T}-try-answer`}
            disabled={answered}
            onEnter={check}
            problem={!answered && typed.trim() !== '' && parseRupees(typed) === null ? 'Type an amount in rupees, such as 12,500.' : null}
          />
        ) : null}
      </TryCard>

      <Stage prefix={T} label="The picture" shown={answered ? 1 : 0}>
        <Board business={business} state={shown} statements={statements} before={before} cards={cards} asking={q.kind === 'where' && !answered ? q.item : null} reduced={reduced} speed={1} />
      </Stage>
    </div>
  );
}
