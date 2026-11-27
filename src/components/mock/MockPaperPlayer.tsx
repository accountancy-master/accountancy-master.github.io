'use client';

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { useMockPapers } from '@/app-state/mockPapers';
import { useStore } from '@/app-state/StoreProvider';
import { useProgress } from '@/app-state/useProgress';
import { Frame, LoadError, Loading } from '@/components/play/PlayFrame';
import { useShellTrail } from '@/components/shell/ShellContext';
import { Button, buttonClasses } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { TopicsGate } from '@/components/ui/TopicsGate';
import { bankOfPaper, buildPaper, paperSteps, paperTitle, paperTopics, parsePaperKey, sectionTopics, type MockPaper, type PaperBank } from '@/learning/mockPaper';
import { MARK_VALUES } from '@/learning/paperBlueprints';
import type { Progress } from '@/learning/progress';
import { newId } from '@/lib/ids';
import { formatDuration, hasLongPart, nextPaperNumber, paperInProgress, startSitting } from '@/play/mockSitting';
import type { MockPaperRecord, Profile } from '@/storage/types';
import { e2eAllowedMs } from './e2eClock';
import { MockSitting } from './MockSitting';
import { PaperResult } from './PaperResult';

const HUB_HREF = '/mock';
const LOADING = 'Getting your paper ready…';

/**
 * One mock paper, `/mock/paper?paper=<key>`: its instructions and Start for a new paper, the sitting for a paper in
 * progress (a reload comes back here), and the result with the marked script for a paper that has been handed in.
 */
export function MockPaperPlayer() {
  const { profile } = useStore();
  const router = useRouter();
  const key = useSearchParams().get('paper') ?? '';
  const { progress, status, reload } = useProgress();
  // Where the learner is: Mock papers, then the paper.
  const known = parsePaperKey(key);
  useShellTrail([{ label: 'Mock papers', href: HUB_HREF }, { label: known && profile ? paperTitle(known, bankOfPaper(profile.courseId, known)) : 'Mock paper' }]);

  useEffect(() => {
    if (!profile) router.replace('/start');
  }, [profile, router]);

  if (!profile) return <div aria-busy="true" data-testid="player-redirecting" className="min-h-dvh" />;
  if (status === 'error') return <LoadError onRetry={() => void reload()} />;
  if (status !== 'ready' || progress === null) return <Loading>{LOADING}</Loading>;

  const ref = parsePaperKey(key);
  if (!ref) return <UnknownPaper />;
  // A paper is one of the learner's course, built on the device from the topics it draws on: a topic test from one,
  // a full paper from all.
  return (
    <TopicsGate page topicIds={paperTopics(ref, bankOfPaper(profile.courseId, ref))} loading={LOADING}>
      {() => <Paper key={key} paperKey={key} profile={profile} progress={progress} />}
    </TopicsGate>
  );
}

function Notice({ testId, title, children }: { testId: string; title: string; children: ReactNode }) {
  return (
    <Frame>
      <div data-testid={testId} className="flex flex-col items-start gap-4 rounded-card border-2 border-dashed border-edge-deep bg-canvas p-5">
        <h1 className="text-2xl font-extrabold">{title}</h1>
        {children}
      </div>
    </Frame>
  );
}

const BackToHub = () => (
  <Link href={HUB_HREF} className={buttonClasses('primary')}>
    Back to mock papers
  </Link>
);

const UnknownPaper = () => (
  <Notice testId="mock-unknown" title="This paper does not exist">
    <BackToHub />
  </Notice>
);

function Paper({ paperKey, profile, progress }: { paperKey: string; profile: Profile; progress: Progress }) {
  const { store } = useStore();
  const { records, failed, refresh } = useMockPapers();
  // Read once for this visit: what the learner had before the paper was handed in.
  const [xpBefore] = useState(progress.xp);
  // The paper started on this visit, and the paper handed in on this visit.
  const [started, setStarted] = useState<MockPaperRecord | null>(null);
  const [done, setDone] = useState<{ record: MockPaperRecord; byClock: boolean } | null>(null);
  const [starting, setStarting] = useState(false);

  const paper = useMemo((): MockPaper | null => {
    const ref = parsePaperKey(paperKey);
    if (!ref) return null;
    try {
      return buildPaper(ref, bankOfPaper(profile.courseId, ref));
    } catch {
      return null;
    }
  }, [paperKey, profile.courseId]);

  if (!paper) return <UnknownPaper />;
  if (failed) return <LoadError onRetry={() => void refresh()} />;
  if (records === null) return <Loading>{LOADING}</Loading>;

  if (done) {
    return (
      <Page>
        <PaperResult paper={paper} record={done.record} justNow={{ xpBefore, byClock: done.byClock }} />
      </Page>
    );
  }

  const stored = started ?? records.find((r) => r.paper === paperKey);
  if (stored?.submittedAt !== undefined) {
    return (
      <Page>
        <PaperResult paper={paper} record={stored} />
      </Page>
    );
  }
  if (stored) {
    return (
      <MockSitting
        paper={paper}
        initial={stored}
        onSubmitted={(record, byClock) => {
          setDone({ record, byClock });
          void refresh();
        }}
      />
    );
  }

  const other = paperInProgress(records);
  if (other) {
    return (
      <Notice testId="mock-busy" title="Another paper is in progress">
        <p className="text-base">Finish the paper you have started before you begin a new one. Its clock is still running.</p>
        <Link href={`/mock/paper?paper=${encodeURIComponent(other.paper)}`} data-testid="mock-busy-resume" className={buttonClasses('primary')}>
          Go to that paper
        </Link>
      </Notice>
    );
  }
  if (paper.ref.number !== nextPaperNumber(paper.ref.kind, records)) {
    return (
      <Notice testId="mock-closed" title="This paper is not open">
        <p className="text-base">Start a new paper from the Mock papers screen.</p>
        <BackToHub />
      </Notice>
    );
  }

  const start = async () => {
    if (starting) return;
    setStarting(true);
    const record = startSitting({ id: newId(), sessionId: newId(), profile, paper, now: Date.now(), allowedMs: e2eAllowedMs() });
    try {
      await store.putMockPaper(record);
    } catch {
      // Storage refused: the paper can still be sat, the sitting itself warns that it is not being saved.
    }
    setStarted(record);
  };

  return (
    <Page>
      <Instructions paper={paper} bank={bankOfPaper(profile.courseId, paper.ref)} starting={starting} onStart={() => void start()} />
    </Page>
  );
}

function Page({ children }: { children: ReactNode }) {
  return <div className="mx-auto flex min-h-dvh w-full max-w-3xl flex-col px-4 py-6">{children}</div>;
}

/** Which numbers on the paper carry how many marks: "Questions 1 to 20: 1 mark each". */
function markRanges(paper: MockPaper): { marks: number; from: number; to: number; cases: boolean; part?: string }[] {
  const out: { marks: number; from: number; to: number; cases: boolean; part?: string }[] = [];
  for (const e of paper.entries) {
    const last = out.at(-1);
    if (last && last.marks === e.marks && last.part === e.part) last.to = e.number;
    else out.push({ marks: e.marks, from: e.number, to: e.number, cases: e.caseId !== undefined, part: e.part });
  }
  return out;
}

/** Before a paper: what it holds and how it is sat. Nothing is on the clock until Start. */
function Instructions({ paper, bank, starting, onStart }: { paper: MockPaper; bank: PaperBank; starting: boolean; onStart(): void }) {
  const parts = [...new Set(paper.blueprint.sections.map((s) => s.part))];
  const hasCases = paper.entries.some((e) => e.caseId !== undefined);
  const steps = paperSteps(paper).length;
  const caseMarks = MARK_VALUES[MARK_VALUES.length - 1];
  return (
    <section data-testid="mock-instructions" aria-labelledby="mock-instructions-heading" className="flex flex-col gap-5">
      <header className="flex flex-col gap-1">
        <h1 id="mock-instructions-heading" className="text-3xl font-extrabold tracking-tight">
          {paper.title}
        </h1>
        <p data-testid="mock-instructions-summary" className="text-lg font-bold text-primary-ink">
          {paper.marks} marks · {formatDuration(paper.minutes * 60_000)} · {paper.entries.length} questions
        </p>
      </header>

      <Card className="flex flex-col gap-3 p-4!">
        <h2 className="text-lg font-extrabold text-primary-ink">The paper</h2>
        <ul className="flex flex-col gap-2 text-base">
          {parts.map((part) => (
            <li key={part ?? 'all'} data-testid={`mock-part-${part ?? 'all'}`}>
              {part !== undefined ? <span className="font-extrabold">Part {part}: </span> : null}
              {paper.blueprint.sections
                .filter((s) => s.part === part)
                .map((s) => {
                  const topics = sectionTopics(s, bank, paper.ref);
                  const name = 'chosen' in s.topics ? (topics[0]?.title ?? s.title) : 'first' in s.topics ? `${topics[0]?.title} to ${topics.at(-1)?.title}` : s.title;
                  return `${name} (${s.marks} marks)`;
                })
                .join(', ')}
            </li>
          ))}
        </ul>
        <ul className="flex flex-col gap-1 text-base">
          {markRanges(paper).map((r) => (
            <li key={r.from} className="tabular-nums">
              {r.from === r.to ? `Question ${r.from}` : `Questions ${r.from} to ${r.to}`}: {r.marks} {r.marks === 1 ? 'mark' : 'marks'}
              {r.from === r.to ? '' : ' each'}
              {r.cases ? (r.from === r.to ? ' (a case study)' : ' (case studies)') : ''}
            </li>
          ))}
        </ul>
      </Card>

      <Card className="flex flex-col gap-3 p-4!">
        <h2 className="text-lg font-extrabold text-primary-ink">The rules</h2>
        <ul data-testid="mock-rules" className="flex list-disc flex-col gap-2 pl-5 text-base">
          <li>
            The clock starts when you press Start and cannot be paused. It keeps running even if you close the app.
          </li>
          <li>At zero the paper is submitted as it stands. You can submit earlier.</li>
          <li>There are no hints, and no answer is shown until the paper is submitted.</li>
          <li>Move as you like with Next, Previous and the question list. You can change any answer until you submit.</li>
          <li>Mark a question for review to find it again in the question list.</li>
          {hasCases ? (
            <li>
              A case study is one question with several parts. Its {caseMarks} marks are shared equally among the parts, so the paper has {steps} things
              to answer in all.
            </li>
          ) : null}
          {paper.entries.some(hasLongPart) ? (
            <li data-testid="mock-rule-chained">
              Where a part of a case study is an account, a statement or a set of entries, the part earns its share for the rows or entries that are
              right.
            </li>
          ) : null}
          <li>A question you leave unanswered earns no marks. It is not counted as a mistake.</li>
        </ul>
      </Card>

      <div className="flex flex-col gap-3 sm:flex-row-reverse sm:justify-end">
        <Button size="lg" data-testid="mock-start" disabled={starting} onClick={onStart} className="w-full sm:w-auto">
          Start the paper
        </Button>
        <Link href={HUB_HREF} data-testid="mock-not-now" className={buttonClasses('secondary', 'lg', 'w-full sm:w-auto')}>
          Not now
        </Link>
      </div>
    </section>
  );
}
