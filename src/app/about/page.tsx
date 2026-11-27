import type { Metadata } from 'next';
import Link from 'next/link';
import { CONTRIBUTING_URL, DISCLAIMER, REPORT_URL, REPO_URL } from '@/content/disclaimer';

// About the app and its disclaimer. A plain page that needs no learner, so the landing page can link to it.

export const metadata: Metadata = {
  title: 'About and disclaimer',
  description: 'Accountancy Master is an independent, free and open-source practice aid, not affiliated with CBSE or NCERT. What that means, and how to report or fix a mistake.',
  alternates: { canonical: '/about' },
};

export default function AboutPage() {
  return (
    <main className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-4 py-8 sm:py-12" data-testid="about">
      <p>
        <Link href="/" className="font-bold text-primary-ink underline underline-offset-4">
          ← Accountancy Master
        </Link>
      </p>
      <h1 className="text-3xl font-extrabold tracking-tight text-primary-ink">About and disclaimer</h1>
      <p className="text-base text-muted">Please read this before relying on anything in the app.</p>

      {DISCLAIMER.map((part, i) => (
        <section key={part.heading} aria-labelledby={`about-${i}`} className="flex flex-col gap-3 rounded-card border border-edge bg-surface p-5 shadow-card">
          <h2 id={`about-${i}`} className="text-lg font-extrabold text-primary-ink">
            {part.heading}
          </h2>
          {part.paragraphs.map((p) => (
            <p key={p.slice(0, 40)} className="text-base">
              {p}
            </p>
          ))}
        </section>
      ))}

      <ul className="flex flex-col gap-2 text-base">
        <li>
          <a href={REPORT_URL} data-testid="about-report" className="font-bold text-primary-ink underline underline-offset-4">
            Report a mistake on GitHub
          </a>
        </li>
        <li>
          <a href={CONTRIBUTING_URL} data-testid="about-contributing" className="font-bold text-primary-ink underline underline-offset-4">
            How to correct it yourself (contributing guide)
          </a>
        </li>
        <li>
          <a href={REPO_URL} className="font-bold text-primary-ink underline underline-offset-4">
            The source code and its licences
          </a>
        </li>
      </ul>
    </main>
  );
}
