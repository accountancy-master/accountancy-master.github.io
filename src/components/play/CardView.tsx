'use client';

import { useState } from 'react';
import { BeyondSyllabus } from '@/components/ui/BeyondSyllabus';
import { Button } from '@/components/ui/Button';
import type { Card } from '@/content/types';

/** One revision card: the prompt first, then the answer, example and common mistake, then how well it was known. */
export function CardView({ card, onRate }: { card: Card; onRate(known: boolean): void }) {
  const [flipped, setFlipped] = useState(false);

  return (
    <div data-testid="card" data-card-id={card.id} className="flex flex-col gap-5">
      <p className="text-sm font-extrabold uppercase tracking-wide text-primary-ink">Revision card</p>
      <h2 className="text-2xl font-extrabold tracking-tight">{card.prompt}</h2>
      {card.beyondSyllabus !== undefined ? <BeyondSyllabus reason={card.beyondSyllabus} testId="card-beyond" /> : null}

      {flipped ? (
        <div
          data-testid="card-answer"
          className="flex flex-col gap-3 rounded-card border-2 border-b-4 border-primary bg-primary-soft p-4"
        >
          <p className="text-lg font-bold text-primary-ink">{card.answer}</p>
          <p className="text-base">{card.explanation}</p>
          <p className="text-base">
            <span className="font-extrabold text-primary-ink">Example: </span>
            {card.example}
          </p>
          <p className="text-base">
            <span className="font-extrabold text-danger-deep">Common mistake: </span>
            {card.commonMistake}
          </p>
        </div>
      ) : null}

      {flipped ? (
        <div className="flex flex-col gap-3 sm:flex-row">
          <Button size="lg" data-testid="card-got-it" onClick={() => onRate(true)} className="w-full sm:flex-1">
            Got it
          </Button>
          <Button
            size="lg"
            variant="secondary"
            data-testid="card-again"
            onClick={() => onRate(false)}
            className="w-full sm:flex-1"
          >
            Need to revise
          </Button>
        </div>
      ) : (
        <Button size="lg" data-testid="card-flip" onClick={() => setFlipped(true)} className="w-full">
          Show answer
        </Button>
      )}
    </div>
  );
}
