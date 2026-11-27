'use client';

import Link from 'next/link';
import { useMemo } from 'react';
import type { ReactNode } from 'react';
import { buttonClasses } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { MasteryRing, masteryWord } from '@/components/ui/MasteryRing';
import { ProgressGate } from '@/components/ui/ProgressGate';
import { choiceOf } from '@/content/courseOptions';
import { courseFor, findOutline } from '@/content/outline';
import type { TopicMeta, TopicOutline } from '@/content/types';
import { everythingIn } from '@/learning/practice';
import { topicMastery, type Progress } from '@/learning/progress';
import type { Profile } from '@/storage/types';

/** One playable topic of the learner's course, with how well it is known and whether practice has anything to serve. */
export interface PickableTopic {
  topic: TopicMeta;
  /** The topic's pack in outline: a list of topics loads none of them. */
  pack: TopicOutline;
  mastery: number;
  /** False only for a topic with nothing written to ask yet. */
  ready: boolean;
}

/** The playable topics of a course in course order, grouped by unit, units in the order they first appear. */
export function groupTopicsByUnit<T extends { topic: Pick<TopicMeta, 'unit'> }>(topics: T[]): { unit: string; topics: T[] }[] {
  const groups: { unit: string; topics: T[] }[] = [];
  for (const t of topics) {
    const group = groups.find((g) => g.unit === t.topic.unit);
    if (group) group.topics.push(t);
    else groups.push({ unit: t.topic.unit, topics: [t] });
  }
  return groups;
}

/**
 * The playable topics of the learner's course, in course order, as the pickers show them. Every topic with something
 * to ask is ready, whatever the learner has passed: choosing a topic to practise, or to mix into a marathon, unlocks
 * nothing and needs nothing unlocked.
 */
export function usePickableTopics(profile: Profile, progress: Progress): PickableTopic[] {
  return useMemo(
    () =>
      // The topics the learner meets (Part B of Class 12 as chosen: content/courseOptions.ts).
      (courseFor(profile.courseId, choiceOf(profile))?.topics ?? []).flatMap((topic) => {
        const pack = findOutline(topic.id);
        if (!pack) return [];
        const open = everythingIn([pack]);
        const ready = open.templateIds.size + open.questionIds.size > 0;
        return [{ topic, pack, mastery: topicMastery(pack, progress), ready }];
      }),
    [profile, progress],
  );
}

/**
 * A list of the playable topics to choose one from: course order, under their units, each with its mastery. What a
 * choice opens (`hrefFor`) and anything more to say about a topic (`detailFor`) are the caller's.
 */
export function TopicList({
  topics,
  hrefFor,
  detailFor,
  idPrefix,
}: {
  topics: PickableTopic[];
  hrefFor(topicId: string): string;
  detailFor?(topic: PickableTopic): ReactNode;
  /** Prefixes the test ids of the rows (`<idPrefix>-<topicId>`). */
  idPrefix: string;
}) {
  return (
    <div className="flex flex-col gap-6">
      {groupTopicsByUnit(topics).map((group, i) => (
        <section key={group.unit} aria-labelledby={`${idPrefix}-unit-${i}`} className="flex flex-col gap-3">
          <h2 id={`${idPrefix}-unit-${i}`} className="text-lg font-extrabold text-primary-ink">
            {group.unit}
          </h2>
          <ul className="grid gap-3 sm:grid-cols-2">
            {group.topics.map((t) => (
              <li key={t.topic.id}>
                <Card href={hrefFor(t.topic.id)} data-testid={`${idPrefix}-${t.topic.id}`} className="flex h-full items-center gap-3 p-4!">
                  <MasteryRing value={t.mastery} size={48} label={`${t.topic.title} mastery`} />
                  <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                    <span className="text-base font-extrabold leading-snug">{t.topic.title}</span>
                    <span data-testid={`${idPrefix}-${t.topic.id}-hint`} className="text-sm font-bold text-muted">
                      {t.ready ? masteryWord(t.mastery) : 'No questions yet'}
                    </span>
                    {detailFor?.(t)}
                  </span>
                </Card>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}

/** The back link above a screen reached from the Practice screen. */
export function BackToPractice() {
  return (
    <Link href="/practice" data-testid="back-to-practice" className={buttonClasses('ghost', 'md', '-ml-3 self-start')}>
      <span aria-hidden="true">←</span>
      Practice
    </Link>
  );
}

/** "Practise a topic": choose any playable topic and get fresh questions from it alone. */
export function TopicPractice() {
  return (
    <ProgressGate id="topic-picker" loading="Loading your topics…">
      {({ profile, progress }) => <Picker profile={profile} progress={progress} />}
    </ProgressGate>
  );
}

function Picker({ profile, progress }: { profile: Profile; progress: Progress }) {
  const topics = usePickableTopics(profile, progress);
  return (
    <div className="flex flex-col gap-5">
      <header className="flex flex-col gap-1">
        <BackToPractice />
        <h1 className="text-3xl font-extrabold tracking-tight">Practise a topic</h1>
        <p className="text-base">Pick a topic. You get fresh questions from it, leaning towards what you know least.</p>
      </header>
      <TopicList topics={topics} hrefFor={(id) => `/practice/topic/${id}`} idPrefix="pick-topic" />
    </div>
  );
}
