'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import type { ChangeEvent, FormEvent } from 'react';
import { useDeviceSettings } from '@/app-state/DeviceSettings';
import { useProgress } from '@/app-state/useProgress';
import { isStoragePersisted } from '@/app-state/persistence';
import { BACKUP_INVALID, restoreBackupFile } from '@/app-state/restoreBackup';
import { useOfflineReady } from '@/app-state/ServiceWorker';
import { useStore } from '@/app-state/StoreProvider';
import { Button } from '@/components/ui/Button';
import { PART_B_COURSE, PART_B_TOPICS, partBOf } from '@/content/courseOptions';
import { COURSES, findOutline, playableCourses } from '@/content/outline';
import { CONFIG } from '@/learning/config';
import { dayKey } from '@/learning/gamification';
import { challengeTimerOn } from '@/storage/types';
import { CoursePicker } from './CoursePicker';
import { PartBPicker } from './PartBPicker';
import { DeleteLearnerDialog } from './DeleteLearnerDialog';
import { ExamDates } from './ExamDates';

const EXPORT_FAILED = "Couldn't create the backup. Please try again.";

const MAX_NAME = 24;
const RENAME_FAILED = "Couldn't save the name. Try again.";
const GOAL_FAILED = "Couldn't save the goal. Try again.";
const TIMER_FAILED = "Couldn't save the setting. Try again.";

const SECTION = 'flex flex-col gap-3 rounded-card border border-edge bg-surface p-5 shadow-card';

// Rendered inside Shell, which guarantees a selected profile; the version is read on the server page.
export function SettingsView({ version }: { version: string }) {
  const { store, profile, persistent, selectProfile, refreshProfiles, updateProfile, deleteProfile } = useStore();
  const { reload } = useProgress();
  const router = useRouter();
  const offlineReady = useOfflineReady();
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [persisted, setPersisted] = useState<boolean | null>(null);
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void isStoragePersisted().then((yes) => {
      if (!cancelled) setPersisted(yes);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  // A link to a section (`/settings#exam-dates`, from Home and the top bar) lands on it: the page is drawn after the
  // browser looked for it.
  useEffect(() => {
    const hash = window.location.hash.slice(1);
    if (hash) document.getElementById(hash)?.scrollIntoView({ block: 'start' });
  }, []);

  if (!profile) return null;
  const { id, name } = profile;
  // A course is a choice only once there are two that can be played. A learner who is on a course with nothing to
  // play (its content was taken back) is still offered the way out of it.
  const playable = playableCourses();
  const courses = COURSES.filter((c) => playable.includes(c) || c.id === profile.courseId);

  async function exportBackup() {
    if (busy) return;
    setBusy(true);
    try {
      const backup = await store.exportProfile(id);
      const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `accountancy-master-${name}-${dayKey(Date.now())}.json`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
      setMessage(null);
    } catch {
      setMessage({ ok: false, text: EXPORT_FAILED });
    } finally {
      setBusy(false);
    }
  }

  async function importBackup(e: ChangeEvent<HTMLInputElement>) {
    const input = e.currentTarget;
    const file = input.files?.[0];
    if (!file || busy) return;
    setBusy(true);
    try {
      const outcome = await restoreBackupFile(file, store);
      if (outcome.ok) {
        await refreshProfiles();
        // The restored learner becomes the selected one; for the current learner only the numbers reload.
        if (outcome.profile.id === id) await reload();
        else selectProfile(outcome.profile.id);
      }
      setMessage({ ok: outcome.ok, text: outcome.text });
    } catch {
      setMessage({ ok: false, text: BACKUP_INVALID });
    } finally {
      // Lets the same file be chosen again.
      input.value = '';
      setBusy(false);
    }
  }

  function switchLearner() {
    selectProfile(null);
    router.push('/start');
  }

  async function removeLearner() {
    // Rejects on failure so the dialog can say so and stay open.
    await deleteProfile(id);
    router.push('/start');
  }

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-3xl font-extrabold tracking-tight">Settings</h1>

      {!persistent && (
        <p
          role="status"
          data-testid="settings-storage-warning"
          className="rounded-card border-2 border-accent bg-accent-soft px-4 py-3 text-base font-semibold text-accent-ink"
        >
          Progress can&apos;t be saved on this device right now. You can still practise.
        </p>
      )}

      <section aria-labelledby="learner-heading" className={SECTION}>
        <h2 id="learner-heading" className="text-lg font-extrabold text-primary-ink">
          Learner
        </h2>
        <p className="text-base">
          Learning as{' '}
          <span data-testid="settings-profile-name" className="font-extrabold">
            {name}
          </span>
        </p>
        <Button
          variant="secondary"
          data-testid="switch-profile"
          disabled={busy}
          onClick={switchLearner}
          className="self-start"
        >
          Switch learner
        </Button>
        <RenameForm key={id} name={name} disabled={busy} save={(next) => updateProfile({ name: next })} />
      </section>

      {courses.length > 1 && (
        <section aria-labelledby="course-heading" data-testid="course-section" className={SECTION}>
          <h2 id="course-heading" className="text-lg font-extrabold text-primary-ink">
            Course
          </h2>
          <p id="course-help" className="text-base">
            You learn one course at a time. What you have done in the other course is kept, and it is all there when you
            switch back.
          </p>
          <CoursePicker key={id} courses={courses} current={profile.courseId} choose={(courseId) => updateProfile({ courseId })} labelledBy="course-heading" describedBy="course-help" />
        </section>
      )}

      {profile.courseId === PART_B_COURSE && findOutline(PART_B_TOPICS.computerised[0]) ? (
        <section id="part-b" aria-labelledby="part-b-heading" data-testid="part-b-section" className={`${SECTION} scroll-mt-24`}>
          <h2 id="part-b-heading" className="text-lg font-extrabold text-primary-ink">
            Part B of Class 12
          </h2>
          <p id="part-b-help" className="text-base">
            Schools teach Part B in one of two ways. Choose the one your school teaches: your topics, practice, mock papers and worksheets follow it. What
            you have done in either is kept, and it is all there if you change back.
          </p>
          <PartBPicker key={id} current={partBOf(profile)} choose={(class12PartB) => updateProfile({ class12PartB })} labelledBy="part-b-heading" describedBy="part-b-help" />
        </section>
      ) : null}

      <section id="exam-dates" aria-labelledby="exam-heading" data-testid="exam-section" className={`${SECTION} scroll-mt-24`}>
        <h2 id="exam-heading" className="text-lg font-extrabold text-primary-ink">
          Exam dates
        </h2>
        <ExamDates key={id} profile={profile} courses={courses} save={(examDates) => updateProfile({ examDates })} />
      </section>

      <section aria-labelledby="goal-heading" className={SECTION}>
        <h2 id="goal-heading" className="text-lg font-extrabold text-primary-ink">
          Daily goal
        </h2>
        <GoalPicker
          key={id}
          current={profile.dailyGoalXp ?? CONFIG.dailyGoal.default}
          save={(dailyGoalXp) => updateProfile({ dailyGoalXp })}
        />
      </section>

      <section aria-labelledby="locking-heading" className={SECTION}>
        <h2 id="locking-heading" className="text-lg font-extrabold text-primary-ink">
          Level locking
        </h2>
        <UnlockAllSwitch />
      </section>

      <section aria-labelledby="challenge-heading" className={SECTION}>
        <h2 id="challenge-heading" className="text-lg font-extrabold text-primary-ink">
          Challenge levels
        </h2>
        <ChallengeTimerSwitch key={id} on={challengeTimerOn(profile)} save={(challengeTimer) => updateProfile({ challengeTimer })} />
      </section>

      <section aria-labelledby="backup-heading" className={SECTION}>
        <h2 id="backup-heading" className="text-lg font-extrabold text-primary-ink">
          Backup
        </h2>
        <p className="text-base">
          Save your progress as a file, or bring it back on this or another device: this is how your progress moves to a
          new phone or laptop. Restoring never removes anything you already have.
        </p>
        <Button data-testid="backup-export" disabled={busy} onClick={() => void exportBackup()} className="self-start">
          Download backup
        </Button>
        <label className="flex flex-col gap-2 text-base font-bold">
          Restore from backup
          <input
            type="file"
            accept=".json,application/json"
            data-testid="backup-import"
            disabled={busy}
            onChange={(e) => void importBackup(e)}
            className="min-h-11 rounded-control border-2 border-edge-deep bg-surface p-2 text-base font-normal file:mr-3 file:min-h-9 file:rounded-control file:border-0 file:bg-primary-soft file:px-4 file:font-bold file:text-primary-ink"
          />
        </label>
        {message && (
          <p
            role="status"
            data-testid="backup-message"
            className={['text-base font-bold', message.ok ? 'text-primary-ink' : 'text-danger-ink'].join(' ')}
          >
            {message.text}
          </p>
        )}
      </section>

      {persisted !== null && (
        <p data-testid="storage-persisted" role="status" className="text-base">
          {persisted
            ? 'Your progress is kept safely on this device: the browser will not clear it to make space.'
            : 'This browser may clear your progress if space runs low. Download a backup now and then.'}
        </p>
      )}

      {offlineReady && (
        <p data-testid="offline-ready" role="status" className="text-base font-bold text-primary-ink">
          Ready to use offline. Everything you need is saved on this device.
        </p>
      )}

      <section aria-labelledby="delete-heading" className={SECTION}>
        <h2 id="delete-heading" className="text-lg font-extrabold text-danger-deep">
          Delete learner
        </h2>
        <p className="text-base">Remove {name} and all of their progress from this device.</p>
        <Button
          id="delete-learner-button"
          variant="danger"
          data-testid="delete-learner"
          disabled={busy}
          onClick={() => setConfirmingDelete(true)}
          className="self-start"
        >
          Delete learner
        </Button>
      </section>

      <p data-testid="app-version" className="text-sm text-muted">
        Accountancy Master version {version}
      </p>

      {confirmingDelete && (
        <DeleteLearnerDialog
          name={name}
          returnFocusTo={() => document.getElementById('delete-learner-button')}
          onConfirm={removeLearner}
          onClose={() => setConfirmingDelete(false)}
        />
      )}
    </div>
  );
}

/** A setting that is on or off: its name, a line about it, and the switch. `id` starts its test ids and its labels. */
function SettingSwitch({ id, label, help, on, onChange }: { id: string; label: string; help: string; on: boolean; onChange(on: boolean): void }) {
  return (
    <div className="flex items-start justify-between gap-4">
      <div className="flex min-w-0 flex-col gap-1">
        <p id={`${id}-label`} className="text-base font-extrabold">
          {label}
        </p>
        <p id={`${id}-help`} className="text-base">
          {help}
        </p>
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={on}
        aria-labelledby={`${id}-label`}
        aria-describedby={`${id}-help`}
        data-testid={`${id}-toggle`}
        onClick={() => onChange(!on)}
        className="flex min-h-11 min-w-20 shrink-0 items-center gap-2 rounded-full border-2 border-edge-deep bg-surface px-2 hover:bg-canvas"
      >
        <span
          aria-hidden="true"
          className={['flex h-6 w-11 shrink-0 items-center rounded-full border-2 p-0.5', on ? 'justify-end border-primary-deep bg-primary' : 'justify-start border-edge-deep bg-edge'].join(' ')}
        >
          <span className="h-4 w-4 rounded-full bg-surface shadow-sm" />
        </span>
        <span data-testid={`${id}-state`} className="min-w-7 text-base font-extrabold">
          {on ? 'On' : 'Off'}
        </span>
      </button>
    </div>
  );
}

/** The device-level switch that opens every level and all practice. It applies at once, on every screen. */
function UnlockAllSwitch() {
  const { unlockAll, setUnlockAll } = useDeviceSettings();
  return (
    <SettingSwitch
      id="unlock-all"
      label="Unlock all levels"
      help="Open every level and all practice without passing the earlier levels. Off, each level opens when you pass the one before; the Playground and the Marathon play anything either way."
      on={unlockAll}
      onChange={setUnlockAll}
    />
  );
}

/**
 * The learner's own switch for the clock of the challenge levels, on unless they have switched it off. It is kept
 * with their name and daily goal, so it follows them (backup), and applies from the next level they start.
 */
function ChallengeTimerSwitch({ on, save }: { on: boolean; save(on: boolean): Promise<unknown> }) {
  const [saving, setSaving] = useState(false);
  const [failed, setFailed] = useState(false);

  async function change(next: boolean) {
    if (saving) return;
    setSaving(true);
    setFailed(false);
    try {
      await save(next);
    } catch {
      setFailed(true);
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <SettingSwitch
        id="challenge-timer"
        label="Challenge timer"
        help="Challenge levels give each question a time limit. Turn this off to play them without the clock."
        on={on}
        onChange={(next) => void change(next)}
      />
      {failed && (
        <p role="alert" data-testid="challenge-timer-error" className="text-base font-bold text-danger-ink">
          {TIMER_FAILED}
        </p>
      )}
    </>
  );
}

function RenameForm({ name, disabled, save }: { name: string; disabled: boolean; save(name: string): Promise<unknown> }) {
  const [draft, setDraft] = useState(name);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (saving) return;
    const next = draft.trim();
    if (!next) {
      setError('Enter a name');
      return;
    }
    setError(null);
    // Nothing to save: show the name as it is stored.
    if (next === name) {
      setDraft(next);
      return;
    }
    setSaving(true);
    try {
      await save(next);
      setDraft(next);
    } catch {
      setError(RENAME_FAILED);
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={(e) => void onSubmit(e)} noValidate className="flex flex-col gap-3">
      <label htmlFor="rename-input" className="text-base font-bold">
        Change name
      </label>
      <input
        id="rename-input"
        data-testid="rename-input"
        type="text"
        value={draft}
        maxLength={MAX_NAME}
        autoComplete="off"
        aria-invalid={error !== null}
        aria-describedby={error ? 'rename-error' : undefined}
        onChange={(e) => {
          setDraft(e.target.value);
          if (error) setError(null);
        }}
        className="min-h-12 w-full rounded-control border-2 border-edge-deep bg-surface px-4 text-base placeholder:text-muted focus:border-primary"
      />
      {error && (
        <p
          id="rename-error"
          role="alert"
          data-testid="rename-error"
          className="rounded-control bg-danger-soft px-3 py-2 text-base font-semibold text-danger-deep"
        >
          {error}
        </p>
      )}
      <Button type="submit" data-testid="rename-save" disabled={disabled || saving} className="self-start">
        Save name
      </Button>
    </form>
  );
}

function GoalPicker({ current, save }: { current: number; save(goal: number): Promise<unknown> }) {
  const [saving, setSaving] = useState(false);
  const [failed, setFailed] = useState(false);

  async function choose(goal: number) {
    if (saving || goal === current) return;
    setSaving(true);
    setFailed(false);
    try {
      await save(goal);
    } catch {
      setFailed(true);
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <p id="goal-help" className="text-base">
        How much XP you aim to earn each day.
      </p>
      <div role="group" aria-labelledby="goal-heading" aria-describedby="goal-help" className="grid grid-cols-3 gap-3">
        {CONFIG.dailyGoal.options.map((goal) => {
          const chosen = goal === current;
          return (
            <button
              key={goal}
              type="button"
              data-testid={`goal-${goal}`}
              aria-pressed={chosen}
              disabled={saving}
              onClick={() => void choose(goal)}
              className={[
                'flex min-h-14 flex-col items-center justify-center rounded-control border-2 border-b-4 px-2 py-2 text-lg font-extrabold disabled:cursor-not-allowed',
                chosen
                  ? 'border-primary bg-primary-soft text-primary-ink'
                  : 'border-edge-deep bg-surface text-ink hover:bg-canvas',
              ].join(' ')}
            >
              <span>{goal} XP</span>
              <span className="min-h-4 text-sm font-bold">{chosen ? '✓ Chosen' : ''}</span>
            </button>
          );
        })}
      </div>
      {failed && (
        <p role="alert" data-testid="goal-error" className="text-base font-bold text-danger-ink">
          {GOAL_FAILED}
        </p>
      )}
    </>
  );
}
