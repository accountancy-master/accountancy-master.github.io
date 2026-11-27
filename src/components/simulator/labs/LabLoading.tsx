'use client';

/** Shown while a lab's screen is fetched. */
export function LabLoading() {
  return (
    <p role="status" data-testid="lab-loading" className="text-base text-muted">
      Getting the lab ready…
    </p>
  );
}
