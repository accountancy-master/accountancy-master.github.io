'use client';

import { useState } from 'react';
import { useProgress } from '@/app-state/useProgress';
import { useStore } from '@/app-state/StoreProvider';
import { Button } from '@/components/ui/Button';
import { choiceOf } from '@/content/courseOptions';
import { findOutline, outlinesOf } from '@/content/outline';
import { newId } from '@/lib/ids';
import type { LevelResult } from '@/storage/types';

/**
 * Test-only helper (rendered only in E2E builds): marks the levels of one topic (the id typed in the first field) up
 * to a given order as passed, or with "all" every level of every topic of the learner's course, so a test can start
 * from a finished course whatever topics are added.
 */
export function E2ePassLevels() {
  const { store, profile } = useStore();
  const { progress, reload } = useProgress();
  const [upTo, setUpTo] = useState('');
  const [topicId, setTopicId] = useState('');
  const [done, setDone] = useState(false);

  const apply = async () => {
    const topic = findOutline(topicId.trim());
    const all = upTo.trim() === 'all';
    // "all" with no topic id is every level of every topic; with a topic id, every level of that topic.
    const every = all && topicId.trim() === '';
    if (!profile || (!topic && !every)) return;
    const limit = all ? Infinity : Number(upTo);
    const already = new Set(progress?.passedLevelIds ?? []);
    // Every topic is every topic of the learner's course: another course's levels are not theirs to pass.
    for (const level of (every ? outlinesOf(profile.courseId, choiceOf(profile)) : [topic!]).flatMap((p) => p.levels)) {
      if (level.order > limit || already.has(level.id)) continue;
      const result: LevelResult = {
        id: newId(),
        profileId: profile.id,
        topicId: level.topicId,
        levelId: level.id,
        score: 1,
        passed: true,
        at: Date.now(),
      };
      await store.appendLevelResult(result);
    }
    await reload();
    setDone(true);
  };

  return (
    <section className="mt-6 flex flex-col gap-3 rounded-card border-2 border-dashed border-edge-deep bg-canvas p-4">
      <h2 className="text-lg font-extrabold">Test tools</h2>
      <label className="flex flex-col gap-1 text-base font-bold">
        Topic id (empty with all: every topic)
        <input
          type="text"
          data-testid="e2e-pass-topic"
          value={topicId}
          onChange={(e) => {
            setTopicId(e.target.value);
            setDone(false);
          }}
          className="min-h-11 rounded-control border-2 border-edge-deep bg-surface px-3 text-base"
        />
      </label>
      <label className="flex flex-col gap-1 text-base font-bold">
        Pass its levels up to (or all)
        <input
          type="text"
          inputMode="numeric"
          data-testid="e2e-pass-levels"
          value={upTo}
          onChange={(e) => {
            setUpTo(e.target.value);
            setDone(false);
          }}
          className="min-h-11 rounded-control border-2 border-edge-deep bg-surface px-3 text-base"
        />
      </label>
      <Button variant="secondary" data-testid="e2e-pass-levels-apply" onClick={() => void apply()} className="self-start">
        Apply
      </Button>
      {done ? (
        <p data-testid="e2e-pass-levels-done" role="status" className="font-bold text-primary-ink">
          Levels marked as passed.
        </p>
      ) : null}
    </section>
  );
}
