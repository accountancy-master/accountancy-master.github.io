'use client';

import Link from 'next/link';
import { useStore } from '@/app-state/StoreProvider';
import { useShellTrail } from '@/components/shell/ShellContext';
import { OtherCourse } from '@/components/topic/TopicView';
import { BeyondSyllabus } from '@/components/ui/BeyondSyllabus';
import { Button, buttonClasses } from '@/components/ui/Button';
import { TopicsGate } from '@/components/ui/TopicsGate';
import { getTopicPack } from '@/content/loaded';
import { topicShown } from '@/content/courseOptions';
import { COURSES, findOutline } from '@/content/outline';
import type { TopicMeta, TopicPack } from '@/content/types';

/**
 * Every card of a topic on one page, grouped by concept, for reading or printing (the navigation is left off the
 * print). Inside the Shell, which sees to a selected learner. Reading it records nothing.
 */
export function QuickSheet({ topicId }: { topicId: string }) {
  const { profile } = useStore();
  const topic = COURSES.flatMap((c) => c.topics).find((t) => t.id === topicId);
  useShellTrail([{ label: 'Quick sheets', href: '/sheets' }, { label: topic?.title ?? 'Quick sheet' }]);
  if (!profile || !topic || !findOutline(topicId)) return null;
  // A topic of another course is not this learner's to read: it says so, and offers the switch.
  if (topic.courseId !== profile.courseId || !topicShown(topic.id, profile)) return <OtherCourse topic={topic} />;

  return (
    <TopicsGate topicIds={[topicId]}>
      {() => <Sheet topic={topic} pack={getTopicPack(topicId)!} />}
    </TopicsGate>
  );
}

function Sheet({ topic, pack }: { topic: TopicMeta; pack: TopicPack }) {
  const topicId = topic.id;
  const groups = pack.concepts
    .map((concept) => ({ concept, cards: pack.cards.filter((card) => card.conceptId === concept.id) }))
    .filter((g) => g.cards.length > 0);

  return (
    <div data-testid="sheet" className="print-plain flex w-full flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3 print:hidden">
        <Link href={`/topics/${topicId}`} data-testid="sheet-back" className={buttonClasses('ghost', 'md', '-ml-3')}>
          <span aria-hidden="true">←</span>
          {topic.title}
        </Link>
        <div className="flex flex-wrap gap-2">
          <Link href={`/worksheets?topic=${topicId}`} data-testid="sheet-worksheet" className={buttonClasses('ghost')}>
            Print a worksheet of this topic
          </Link>
          <Button variant="secondary" data-testid="sheet-print" onClick={() => window.print()}>
            Print
          </Button>
        </div>
      </div>

      <header className="flex flex-col gap-1">
        <h1 className="text-3xl font-extrabold tracking-tight">Quick sheet: {topic.title}</h1>
        <p className="text-base text-muted">
          {pack.cards.length} rules and formats, with an example and the usual slip for each.
        </p>
      </header>

      {groups.map(({ concept, cards }) => (
        <section
          key={concept.id}
          data-testid="sheet-concept"
          data-concept-id={concept.id}
          className="flex flex-col gap-3"
        >
          <h2 className="text-lg font-extrabold text-primary-ink">{concept.title}</h2>
          <ul className="flex flex-col gap-3">
            {cards.map((card) => (
              <li key={card.id}>
                <article
                  data-testid="sheet-card"
                  data-card-id={card.id}
                  className="avoid-break flex flex-col gap-2 rounded-card border-2 border-b-4 border-edge bg-surface p-4"
                >
                  <h3 className="text-base font-extrabold leading-snug">{card.prompt}</h3>
                  {card.beyondSyllabus !== undefined ? <BeyondSyllabus reason={card.beyondSyllabus} testId={`sheet-card-${card.id}-beyond`} /> : null}
                  <p className="text-base">{card.answer}</p>
                  <p className="text-base">
                    <span className="font-extrabold text-primary-ink">Example: </span>
                    {card.example}
                  </p>
                  <p data-testid="sheet-watch-out" className="text-base">
                    <span className="font-extrabold text-danger-deep">Watch out: </span>
                    {card.commonMistake}
                  </p>
                </article>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
