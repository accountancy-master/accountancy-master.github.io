'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { loadTopics } from '@/content/loadTopics';
import { bankOfPaper, buildPaper, paperTopics, parsePaperKey, type MockPaper } from '@/learning/mockPaper';
import { markPaper, sittingEvents, submitSitting, timeUp } from '@/play/mockSitting';
import type { MockPaperRecord, ProgressStore } from '@/storage/types';
import { useStore } from './StoreProvider';
import { useProgress } from './useProgress';

/**
 * The paper a record is a sitting of, rebuilt from its course and its key; null when this version cannot build it
 * any more. The topics the paper draws on must have been loaded.
 */
export function paperOf(record: Pick<MockPaperRecord, 'paper' | 'courseId'>): MockPaper | null {
  const ref = parsePaperKey(record.paper);
  if (!ref) return null;
  try {
    return buildPaper(ref, bankOfPaper(record.courseId, ref));
  } catch {
    return null;
  }
}

/**
 * Hands a paper in and records it, in an order that survives being cut short: first the paper itself is stored as
 * submitted (from then on its answers are final), then one attempt for every answered question and the session
 * result go into the event log, and last the paper is marked as recorded. The events have ids that follow from the
 * paper, so doing this again for a paper that was cut short adds nothing twice. Returns the paper as stored.
 */
export async function recordSitting(store: ProgressStore, record: MockPaperRecord, now: number): Promise<MockPaperRecord> {
  if (record.recorded) return record;
  // The paper may be one the app was closed on: the topics it draws on are loaded before it is rebuilt and marked.
  const ref = parsePaperKey(record.paper);
  if (ref) await loadTopics(paperTopics(ref, bankOfPaper(record.courseId, ref)));
  const paper = paperOf(record);
  // A paper that can no longer be rebuilt cannot be marked: it is closed with no marks and nothing in the log.
  if (!paper) {
    const closed: MockPaperRecord = { ...record, submittedAt: record.submittedAt ?? now, recorded: true };
    await store.putMockPaper(closed);
    return closed;
  }
  const marking = markPaper(paper, record.answers);
  const submitted = submitSitting(record, marking, now);
  await store.putMockPaper(submitted);
  const { attempts, result } = sittingEvents(submitted, marking, now);
  for (const attempt of attempts) await store.appendAttempt(attempt);
  await store.appendSessionResult(result);
  const done: MockPaperRecord = { ...submitted, recorded: true };
  await store.putMockPaper(done);
  return done;
}

/**
 * Puts right what happened while the app was closed: a paper whose time ran out is handed in as it stood, and a
 * paper that was handed in but not yet fully recorded is recorded. Returns the papers as they are now, and whether
 * anything was added to the event log.
 */
export async function settleMockPapers(
  store: ProgressStore,
  records: readonly MockPaperRecord[],
  now: number,
): Promise<{ records: MockPaperRecord[]; changed: boolean }> {
  let changed = false;
  const out: MockPaperRecord[] = [];
  for (const record of records) {
    const due = record.submittedAt === undefined ? timeUp(record, now) : !record.recorded;
    if (due) changed = true;
    out.push(due ? await recordSitting(store, record, now) : record);
  }
  return { records: out, changed };
}

export interface MockPapers {
  /** The learner's papers of the course they are on, oldest first; null until they have been read. */
  records: MockPaperRecord[] | null;
  failed: boolean;
  /** Reads the papers again (after one was started or handed in). */
  refresh(): Promise<void>;
}

/**
 * The selected learner's mock papers, read from the device and settled (see `settleMockPapers`) on every read. Every
 * paper is settled, whatever course it was sat in (the clock of a paper does not stop when the learner changes
 * course); the papers given are those of the course the learner is on.
 */
export function useMockPapers(): MockPapers {
  const { store, profile } = useStore();
  const { reload } = useProgress();
  const profileId = profile?.id ?? null;
  const courseId = profile?.courseId ?? null;
  const [state, setState] = useState<{ profileId: string; records: MockPaperRecord[] } | null>(null);
  const [failed, setFailed] = useState(false);
  // Only the newest read may answer: an older one that finishes late is dropped.
  const ticket = useRef(0);

  const refresh = useCallback((): Promise<void> => {
    if (profileId === null) return Promise.resolve();
    const mine = ++ticket.current;
    // A throw while starting the read is a failed read too, so the chain starts from a promise.
    return Promise.resolve()
      .then(() => store.listMockPapers(profileId))
      .then((list) => settleMockPapers(store, list, Date.now()))
      .then(async (settled) => {
        // What was handed in while the app was closed is in the event log now: every screen must see it.
        if (settled.changed) await reload();
        if (mine !== ticket.current) return;
        setState({ profileId, records: settled.records });
        setFailed(false);
      })
      .catch(() => {
        if (mine === ticket.current) setFailed(true);
      });
  }, [store, profileId, reload]);

  useEffect(() => {
    // refresh() records failures itself and does not reject; the catch only satisfies the effect lint rule.
    refresh().catch(() => undefined);
  }, [refresh]);

  const all = state !== null && state.profileId === profileId ? state.records : null;
  const records = useMemo(() => (all === null ? null : all.filter((r) => r.courseId === courseId)), [all, courseId]);
  return { records, failed, refresh };
}
