'use client';

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useMemo, useState } from 'react';
import { courseName } from '@/components/settings/CoursePicker';
import { useShellTrail } from '@/components/shell/ShellContext';
import { Button, buttonClasses } from '@/components/ui/Button';
import { Pills } from '@/components/ui/Pills';
import { TopicsGate } from '@/components/ui/TopicsGate';
import { findCourse } from '@/content/outline';
import { buildWorksheet, drawSeed, parseWorksheetCode, sheetHref, sheetTopics, withSeed, worksheetCode, type SheetSpec, type Worksheet } from '@/learning/worksheet';
import { KeyItem, SheetQuestionItem } from './SheetItems';

/** What is shown and printed: the sheet with its key on pages of their own after it, the sheet alone, or the key alone. */
export type PrintChoice = 'both' | 'sheet' | 'key';

const PRINT_CHOICES: readonly { value: PrintChoice; label: string }[] = [
  { value: 'both', label: 'Sheet and answer key' },
  { value: 'sheet', label: 'Sheet only' },
  { value: 'key', label: 'Answer key only' },
];

/**
 * The page rules of the print: A4, and in the margin at the foot of every page the code of the sheet (so a page that
 * goes astray can still be matched to its sheet) and the page number. The navigation of the app is never printed.
 */
const printStyle = (code: string) => `
@page {
  size: A4;
  margin: 14mm 14mm 16mm;
  @bottom-left { content: "Worksheet ${code} \\00B7  Accountancy Master"; font: 8pt sans-serif; color: #000; }
  @bottom-right { content: "Page " counter(page) " of " counter(pages); font: 8pt sans-serif; color: #000; }
}
@media print {
  html, body { background: #fff !important; }
  #main { padding: 0 !important; margin: 0 !important; max-width: none !important; }
  .ws-root { gap: 0 !important; }
  .ws-paper { box-shadow: none !important; border: 0 !important; padding: 0 !important; margin: 0 !important; max-width: none !important; border-radius: 0 !important; font-size: 10.5pt; }
  .ws-paper .ws-table { font-size: 9pt; }
  .ws-key-pages { break-before: page; }
  .ws-item, .ws-part, .ws-table tr, .ws-keep { break-inside: avoid; }
  .ws-keep { break-after: avoid; }
  .ws-wide { overflow: visible !important; }
  .ws-wide > div { min-width: 0 !important; }
  .ws-table thead { display: table-header-group; }
}
`;

/** The worksheet a code in the address names, made and laid out for reading and printing. */
export function WorksheetView() {
  const query = useSearchParams();
  const raw = query.get('code') ?? '';
  const parsed = useMemo(() => parseWorksheetCode(raw), [raw]);
  useShellTrail([{ label: 'Worksheets', href: '/worksheets' }, { label: parsed.ok ? parsed.code : 'Worksheet' }]);
  if (!parsed.ok) {
    return (
      <div className="flex flex-col items-start gap-3">
        <h1 className="text-3xl font-extrabold tracking-tight">Worksheet</h1>
        <p role="alert" data-testid="ws-bad-code" className="rounded-card border-2 border-danger bg-surface p-4 text-base font-bold">
          {raw === '' ? 'No worksheet is named here.' : parsed.reason}
        </p>
        <Link href="/worksheets" data-testid="ws-back" className={buttonClasses('secondary')}>
          Make a worksheet
        </Link>
      </div>
    );
  }
  return (
    <TopicsGate topicIds={sheetTopics(parsed.spec)} loading="Making the worksheet…">
      {() => <Ready spec={parsed.spec} />}
    </TopicsGate>
  );
}

function Ready({ spec }: { spec: SheetSpec }) {
  const sheet = useMemo(() => {
    try {
      return buildWorksheet(spec);
    } catch {
      return null;
    }
  }, [spec]);
  if (!sheet || sheet.items.length === 0) {
    return (
      <p role="alert" data-testid="ws-empty" className="rounded-card border-2 border-danger bg-surface p-4 text-base font-bold">
        These choices make no questions. <Link href="/worksheets" className="underline">Choose again</Link>.
      </p>
    );
  }
  return <SheetPages sheet={sheet} />;
}

function SheetPages({ sheet }: { sheet: Worksheet }) {
  const router = useRouter();
  const [print, setPrint] = useState<PrintChoice>('both');
  const course = findCourse(sheet.spec.courseId);
  const className = course ? courseName(course) : '';
  const another = () => router.push(sheetHref(worksheetCode(withSeed(sheet.spec, drawSeed(sheet.spec)))));
  return (
    <div data-testid="worksheet" data-code={sheet.code} data-print={print} className="ws-root flex flex-col gap-5">
      <style>{printStyle(sheet.code)}</style>

      <div data-testid="ws-toolbar" className="flex flex-col gap-3 rounded-card border border-edge bg-surface p-4 shadow-card print:hidden">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Link href="/worksheets" data-testid="ws-back" className={buttonClasses('ghost', 'md', '-ml-3')}>
            <span aria-hidden="true">←</span>
            Worksheets
          </Link>
          <p className="text-sm font-bold text-muted">
            Code <span data-testid="ws-code" className="font-mono text-base font-extrabold text-ink">{sheet.code}</span>
          </p>
        </div>
        <Pills<PrintChoice> options={PRINT_CHOICES} value={print} onChange={(choice) => setPrint(choice)} label="What to print" testIdPrefix="ws-print" />
        <div className="flex flex-wrap gap-2">
          <Button data-testid="ws-print" onClick={() => window.print()}>
            Print
          </Button>
          <Button variant="secondary" data-testid="ws-pdf" onClick={() => window.print()}>
            Save as PDF
          </Button>
          <Button variant="secondary" data-testid="ws-new" onClick={another}>
            New sheet
          </Button>
          <Link href={`/worksheets?code=${encodeURIComponent(sheet.code)}`} data-testid="ws-change" className={buttonClasses('ghost')}>
            Change the choices
          </Link>
        </div>
        <p className="text-sm text-muted">
          For a PDF, press Save as PDF and choose &ldquo;Save as PDF&rdquo; as the printer. The code is printed on every page: type it in on Worksheets to make the same sheet again.
        </p>
      </div>

      <article
        data-testid="ws-sheet"
        aria-label="Worksheet"
        className={`ws-paper mx-auto w-full max-w-[210mm] rounded-card bg-white p-4 text-[14px] leading-normal text-black shadow-card sm:p-8 ${print === 'key' ? 'hidden' : ''}`}
      >
        <header className="ws-keep flex flex-col gap-3 border-b-2 border-black pb-3">
          <p className="flex items-end gap-2 font-bold">
            School
            <span className="inline-block flex-1 border-b border-black">&nbsp;</span>
          </p>
          <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
            <p className="text-[13px] font-bold uppercase tracking-wide">{className} · Worksheet</p>
            <p className="text-[13px] font-bold">
              Code <span data-testid="ws-sheet-code" className="font-mono">{sheet.code}</span>
            </p>
          </div>
          <div>
            <h1 data-testid="ws-title" className="text-[22px] font-extrabold leading-tight">
              {sheet.title}
            </h1>
            <p data-testid="ws-subtitle" className="text-[13px]">
              {sheet.subtitle}
            </p>
          </div>
          <div className="grid grid-cols-1 gap-x-4 gap-y-2 text-[13px] font-bold sm:grid-cols-[1fr_auto]">
            <div className="grid grid-cols-2 gap-x-4 gap-y-2">
              <Field label="Name" />
              <Field label="Class & section" />
              <Field label="Roll no." />
              <Field label="Date" />
            </div>
            <div className="flex items-center gap-2">
              Marks
              <span data-testid="ws-marks-box" className="inline-flex h-10 w-24 items-center justify-end border-2 border-black px-2 text-[15px]">
                / {sheet.marks}
              </span>
            </div>
          </div>
          <p className="text-[12px]">
            {sheet.minutes ? `Time allowed: ${sheet.minutes >= 60 && sheet.minutes % 60 === 0 ? `${sheet.minutes / 60} hours` : `${sheet.minutes} minutes`}. Maximum marks: ${sheet.marks}. ` : ''}
            Answer every question. The marks of each question are shown against it. Show your working.
          </p>
        </header>

        <ol className="mt-4 flex flex-col gap-6" aria-label="Questions">
          {sheet.items.map((item, i) => {
            // A paper in parts says where each part begins.
            const heading = item.part !== undefined && item.part !== sheet.items[i - 1]?.part ? item.part : undefined;
            return (
              <li key={item.number} className="flex flex-col gap-3">
                {heading ? (
                  <h2 data-testid="ws-part-heading" className="ws-keep border-b border-black text-center text-[15px] font-extrabold">
                    Part {heading}
                  </h2>
                ) : null}
                <SheetQuestionItem item={item} />
              </li>
            );
          })}
        </ol>
        <p className="mt-6 text-center text-[11px] print:hidden">
          Worksheet {sheet.code} · Accountancy Master
        </p>
      </article>

      <article
        data-testid="ws-key"
        aria-label="Answer key"
        className={`ws-paper ws-key-pages mx-auto w-full max-w-[210mm] rounded-card bg-white p-4 text-[14px] leading-normal text-black shadow-card sm:p-8 ${print === 'sheet' ? 'hidden' : ''}`}
      >
        <header className="ws-keep flex flex-col gap-1 border-b-2 border-black pb-3">
          <div className="flex flex-wrap items-baseline justify-between gap-x-4">
            <p className="text-[13px] font-bold uppercase tracking-wide">{className} · Answer key</p>
            <p className="text-[13px] font-bold">
              Code <span className="font-mono">{sheet.code}</span>
            </p>
          </div>
          <h2 className="text-[20px] font-extrabold leading-tight">Answer key: {sheet.title}</h2>
          <p className="text-[12px]">
            {sheet.items.length} questions, {sheet.marks} marks. Each answer as the board expects it, with the working.
          </p>
        </header>
        <ol className="mt-4 flex flex-col gap-5" aria-label="Answers">
          {sheet.items.map((item) => (
            <li key={item.number}>
              <KeyItem item={item} />
            </li>
          ))}
        </ol>
      </article>
    </div>
  );
}

function Field({ label }: { label: string }) {
  return (
    <p className="flex min-w-0 items-end gap-2">
      <span className="shrink-0">{label}</span>
      <span className="inline-block min-w-0 flex-1 border-b border-black">&nbsp;</span>
    </p>
  );
}
