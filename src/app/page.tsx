'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import type { ChangeEvent, FormEvent } from 'react';
import { BACKUP_INVALID, restoreBackupFile } from '@/app-state/restoreBackup';
import { requestPersistence } from '@/app-state/persistence';
import { useStore } from '@/app-state/StoreProvider';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { CoursePicker, courseName } from '@/components/settings/CoursePicker';
import { DEFAULT_COURSE_ID } from '@/content/catalogue.generated';
import { PART_B_COURSE, PART_B_LABEL, PART_B_TOPICS } from '@/content/courseOptions';
import { findCourse, findOutline, playableCourses } from '@/content/outline';

const MAX_NAME = 24;

export default function Home() {
  const { store, profiles, selectProfile, createProfile, refreshProfiles } = useStore();
  const router = useRouter();
  const [name, setName] = useState('');
  // The course a new learner joins: the first one, unless there is a choice and they make another.
  const [courseId, setCourseId] = useState(DEFAULT_COURSE_ID);
  // A course is a choice only once there are two that can be played. Until then nothing about courses is shown.
  const courses = playableCourses();
  const choice = courses.length > 1;
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [restoreMessage, setRestoreMessage] = useState<string | null>(null);
  const [restoreOpen, setRestoreOpen] = useState(false);
  // Part B of Class 12, asked as a Class 12 learner is added (once the course has both choices to play).
  const [partB, setPartB] = useState<GatePartBValue>('analysis');
  const askPartB = choice && courseId === PART_B_COURSE && findOutline(PART_B_TOPICS.computerised[0]) !== undefined;

  function pick(id: string) {
    selectProfile(id);
    router.push('/home');
  }

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (busy) return;
    if (!name.trim()) {
      setError('Enter a name');
      return;
    }
    setError(null);
    setBusy(true);
    try {
      // "Not sure" keeps the usual choice (Analysis of Financial Statements) until it is changed in Settings.
      await createProfile(name, choice ? courseId : DEFAULT_COURSE_ID, askPartB && partB === 'computerised' ? { class12PartB: 'computerised' } : {});
      router.push('/home');
    } catch {
      setError("Couldn't add this learner. Please try again.");
      setBusy(false);
    }
  }

  async function onRestore(e: ChangeEvent<HTMLInputElement>) {
    const input = e.currentTarget;
    const file = input.files?.[0];
    if (!file || busy) return;
    setBusy(true);
    setRestoreMessage(null);
    let leaving = false;
    try {
      const outcome = await restoreBackupFile(file, store);
      if (!outcome.ok) setRestoreMessage(outcome.text);
      else {
        await refreshProfiles();
        selectProfile(outcome.profile.id);
        void requestPersistence();
        leaving = true;
        router.push('/home');
      }
    } catch {
      setRestoreMessage(BACKUP_INVALID);
    } finally {
      // Lets the same file be chosen again.
      input.value = '';
      if (!leaving) setBusy(false);
    }
  }

  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center gap-8 px-4 py-10">
      <header className="flex flex-col items-center gap-3 text-center">
        <span
          aria-hidden="true"
          className="flex h-16 w-16 items-center justify-center rounded-card border-b-4 border-primary-deep bg-primary text-4xl font-extrabold text-white"
        >
          ₹
        </span>
        <h1 data-testid="app-title" className="text-3xl font-extrabold tracking-tight text-primary-ink">
          Accountancy Master
        </h1>
        <p data-testid="app-tagline" className="text-base text-muted">
          {choice ? 'Learn Class 11 and Class 12 Accountancy by practising it.' : 'Learn Class 11 Accountancy by practising it.'}
        </p>
      </header>

      <section aria-labelledby="who-heading" className="flex flex-col gap-4">
        <h2 id="who-heading" className="text-2xl font-extrabold">
          Who&apos;s learning?
        </h2>

        {profiles.length > 0 && (
          <ul className="flex flex-col gap-3">
            {profiles.map((p) => (
              <li key={p.id}>
                <Button
                  variant="secondary"
                  size="lg"
                  data-testid={`profile-pick-${p.name}`}
                  onClick={() => pick(p.id)}
                  className="w-full justify-start gap-3"
                >
                  <span
                    aria-hidden="true"
                    className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary-soft text-base font-extrabold text-primary-ink"
                  >
                    {p.name.charAt(0).toUpperCase()}
                  </span>
                  <span className="flex min-w-0 flex-col items-start">
                    <span className="max-w-full truncate">{p.name}</span>
                    {/* Which course each learner is on, once there is more than one to be on. */}
                    {choice && findCourse(p.courseId) ? (
                      <span data-testid={`profile-course-${p.name}`} className="text-sm font-bold text-muted">
                        {courseName(findCourse(p.courseId)!)}
                      </span>
                    ) : null}
                  </span>
                </Button>
              </li>
            ))}
          </ul>
        )}

        <Card>
          <form onSubmit={onSubmit} noValidate className="flex flex-col gap-3">
            <label htmlFor="learner-name" className="text-base font-bold">
              {profiles.length > 0 ? 'Add a learner' : 'Your name'}
            </label>
            <input
              id="learner-name"
              data-testid="profile-name-input"
              type="text"
              value={name}
              maxLength={MAX_NAME}
              autoComplete="off"
              aria-invalid={error !== null}
              aria-describedby={error ? 'learner-error' : undefined}
              onChange={(e) => {
                setName(e.target.value);
                if (error) setError(null);
              }}
              placeholder="e.g. Varun"
              className="min-h-12 w-full rounded-control border-2 border-edge-deep bg-surface px-4 text-base placeholder:text-muted focus:border-primary"
            />
            {error && (
              <p
                id="learner-error"
                role="alert"
                data-testid="profile-error"
                className="rounded-control bg-danger-soft px-3 py-2 text-base font-semibold text-danger-deep"
              >
                {error}
              </p>
            )}
            {choice ? (
              <div data-testid="profile-course" className="flex flex-col gap-2">
                <p id="learner-course" className="text-base font-bold">
                  Course
                </p>
                <CoursePicker courses={courses} current={courseId} choose={setCourseId} labelledBy="learner-course" />
              </div>
            ) : null}
            {askPartB ? <GatePartB value={partB} choose={setPartB} /> : null}
            <Button type="submit" size="lg" data-testid="profile-create" disabled={busy}>
              Start learning
            </Button>
            <p data-testid="profile-no-account" className="text-center text-sm font-semibold text-muted">
              No account needed. Your progress stays on this device.
            </p>
          </form>
        </Card>

        {/* The other way in, for a learner who already has progress somewhere: quieter than starting. */}
        <div className="flex flex-col items-start gap-2">
          <details
            data-testid="gate-backup"
            open={restoreOpen || restoreMessage !== null}
            onToggle={(e) => setRestoreOpen(e.currentTarget.open)}
            className="w-full"
          >
            <summary className="-mx-2 inline-flex min-h-11 cursor-pointer items-center rounded-control px-2 text-base font-bold text-primary-ink hover:bg-primary-soft">
              Restore from a backup file
            </summary>
            <Card className="mt-2">
              <label className="flex flex-col gap-2 text-base font-bold">
                Choose the backup file
                <input
                  type="file"
                  accept=".json,application/json"
                  data-testid="gate-backup-import"
                  disabled={busy}
                  onChange={(e) => void onRestore(e)}
                  className="min-h-11 rounded-control border-2 border-edge-deep bg-surface p-2 text-base font-normal file:mr-3 file:min-h-9 file:rounded-control file:border-0 file:bg-primary-soft file:px-4 file:font-bold file:text-primary-ink"
                />
              </label>
              {restoreMessage && (
                <p role="status" data-testid="gate-backup-message" className="text-base font-bold text-danger-ink">
                  {restoreMessage}
                </p>
              )}
            </Card>
          </details>
        </div>
      </section>
    </main>
  );
}

type GatePartBValue = 'analysis' | 'computerised' | 'later';

const GATE_PART_B: { value: GatePartBValue; label: string; note: string }[] = [
  { value: 'analysis', label: PART_B_LABEL.analysis, note: 'What most schools teach' },
  { value: 'computerised', label: PART_B_LABEL.computerised, note: 'In place of the analysis, where the school teaches it' },
  { value: 'later', label: 'Not sure', note: 'Start with the analysis and choose later in Settings' },
];

/** Part B of Class 12 as the learner's school teaches it, asked once as a Class 12 learner is added. */
function GatePartB({ value, choose }: { value: GatePartBValue; choose(v: GatePartBValue): void }) {
  return (
    <div data-testid="gate-part-b" className="flex flex-col gap-2">
      <p id="gate-part-b-heading" className="text-base font-bold">
        Part B at your school
      </p>
      <p id="gate-part-b-help" className="text-sm text-muted">
        Class 12 has two Part Bs. Your topics, practice and mock papers follow the one you choose; you can change it in Settings at any time.
      </p>
      <div role="group" aria-labelledby="gate-part-b-heading" aria-describedby="gate-part-b-help" className="flex flex-col gap-2">
        {GATE_PART_B.map((o) => {
          const chosen = o.value === value;
          return (
            <button
              key={o.value}
              type="button"
              data-testid={`gate-part-b-${o.value}`}
              aria-pressed={chosen}
              onClick={() => choose(o.value)}
              className={[
                'flex min-h-12 flex-col items-start justify-center gap-0.5 rounded-control border-2 border-b-4 px-4 py-2 text-left text-base font-extrabold',
                chosen ? 'border-primary bg-primary-soft text-primary-ink' : 'border-edge-deep bg-surface text-ink hover:bg-canvas',
              ].join(' ')}
            >
              <span>
                {chosen ? '✓ ' : ''}
                {o.label}
              </span>
              <span className="text-sm font-semibold text-muted">{o.note}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
