'use client';

import Link from 'next/link';
import { useCourse } from '@/app-state/useCourse';
import { SheetIcon } from '@/components/ui/icons';
import { GroupLabel } from '@/components/ui/GroupLabel';
import { Shell } from '@/components/ui/Shell';
import { findCourse, topicSize } from '@/content/outline';

// Quick sheets: every rule and format of a topic on one printable page, one sheet for each topic of the course.
export default function SheetsPage() {
  return (
    <Shell width="wide">
      <Sheets />
    </Shell>
  );
}

function Sheets() {
  const { courseId, packs } = useCourse();
  const course = findCourse(courseId);
  if (!course) return null;
  const units: { unit: string; topics: { id: string; title: string }[] }[] = [];
  for (const topic of course.topics) {
    if (!packs.some((p) => p.topicId === topic.id)) continue;
    let unit = units.find((u) => u.unit === topic.unit);
    if (!unit) units.push((unit = { unit: topic.unit, topics: [] }));
    unit.topics.push(topic);
  }
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h1 className="text-3xl font-extrabold tracking-tight">Quick sheets</h1>
        <p className="text-base text-muted">Every rule and format of a topic on one page, ready to read or print.</p>
      </div>
      {units.map((u, i) => (
        <section key={u.unit} aria-labelledby={`sheets-unit-${i}`} className="flex flex-col gap-3">
          <GroupLabel as="h2" id={`sheets-unit-${i}`}>
            {u.unit}
          </GroupLabel>
          <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {u.topics.map((t) => (
              <li key={t.id} className="min-w-0">
                <Link href={`/sheet/${t.id}`} data-testid={`sheets-${t.id}`} className="flex h-full items-center gap-3 rounded-card border border-edge bg-surface p-4 shadow-card transition-shadow hover:shadow-card-hover">
                  <span aria-hidden="true" className="flex h-10 w-10 shrink-0 items-center justify-center rounded-control bg-hue-sky-soft text-hue-sky">
                    <SheetIcon />
                  </span>
                  <span className="flex min-w-0 flex-col">
                    <span className="font-extrabold">{t.title}</span>
                    <span className="text-sm text-muted">{topicSize(t.id).cards} rules and formats</span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
