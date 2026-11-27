import Link from 'next/link';
import type { CSSProperties, ReactNode } from 'react';
import { PART_B_LABEL } from '@/content/courseOptions';
import { LANDING_COURSES, LANDING_FULL_PAPER, LANDING_TOTALS } from '@/content/landing.generated';
import { LABS, labHref } from '@/simulator/labs';
import { AddingTape, type TapeLine } from './AddingTape';
import { amount } from './figures';
import { FollowTransaction } from './FollowTransaction';
import { HeroScale } from './HeroScale';
import { LabDesk } from './LabDesk';
import { LabIcon } from './LabIcons';
import { LandingCta } from './LandingCta';
import { LandingMotion } from './LandingMotion';
import './landing.css';

export const REPO = 'https://github.com/accountancy-master/accountancy-master.github.io';

const LABS_SHOWN = LABS.filter((l) => l.ready);
const T = LANDING_TOTALS;

/** What the hero counts, in the order it lists them. */
const COUNTS: { id: string; n: number; label: string }[] = [
  { id: 'topics', n: T.topics, label: 'topics, Class 11 and 12' },
  { id: 'patterns', n: T.patterns, label: 'question types, new figures every time' },
  { id: 'labs', n: LABS_SHOWN.length, label: 'simulator labs' },
  { id: 'written', n: T.written, label: 'board-style written answers' },
  { id: 'cases', n: T.cases, label: 'case studies' },
  { id: 'papers', n: T.paperKinds, label: 'kinds of mock paper' },
];

/** The tape at the side prints these as their part of the page is reached; the slip at the end adds them up. */
const TAPE: TapeLine[] = [
  { part: 'hero', label: 'Topics', n: T.topics },
  { part: 'follow', label: 'Question types', n: T.patterns },
  { part: 'follow', label: 'Set questions', n: T.questions },
  { part: 'books', label: 'Rule cards', n: T.cards },
  { part: 'labs', label: 'Labs', n: LABS_SHOWN.length },
  { part: 'exam', label: 'Written answers', n: T.written },
  { part: 'exam', label: 'Case studies', n: T.cases },
  { part: 'exam', label: 'Viva questions', n: T.viva },
  { part: 'exam', label: 'Kinds of mock paper', n: T.paperKinds },
  { part: 'how', label: 'Lessons in steps', n: T.lessons },
  { part: 'open', label: 'Fee, in rupees', n: 0 },
];
const TAPE_TOTAL = TAPE.reduce((n, l) => n + l.n, 0);

const vars = (v: Record<string, number>): CSSProperties => v as CSSProperties;

/** Digits that roll into place one after another (landing.css), read as the whole number. */
function Digits({ text, c }: { text: string; c: number }) {
  return (
    <>
      <span className="lp-sr">{text}</span>
      <span className="lp-digits" aria-hidden="true">
        {[...text].map((ch, i) => (
          <span key={i} style={vars({ '--i': i, '--c': c })}>
            {ch}
          </span>
        ))}
      </span>
    </>
  );
}

function Kicker({ folio, children }: { folio: string; children: ReactNode }) {
  return (
    <p className="lp-kicker" data-folio={folio}>
      {children}
    </p>
  );
}

function GitHubIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" fill="currentColor">
      <path d="M12 .5a11.5 11.5 0 0 0-3.64 22.41c.58.1.79-.25.79-.56v-2c-3.2.7-3.88-1.37-3.88-1.37-.53-1.33-1.28-1.69-1.28-1.69-1.05-.72.08-.7.08-.7 1.16.08 1.77 1.19 1.77 1.19 1.03 1.77 2.7 1.26 3.36.96.1-.75.4-1.26.73-1.55-2.56-.29-5.25-1.28-5.25-5.69 0-1.26.45-2.29 1.19-3.1-.12-.29-.52-1.46.11-3.05 0 0 .97-.31 3.17 1.18a11 11 0 0 1 5.78 0c2.2-1.49 3.17-1.18 3.17-1.18.63 1.59.23 2.76.11 3.05.74.81 1.19 1.84 1.19 3.1 0 4.42-2.7 5.4-5.27 5.68.41.36.78 1.06.78 2.14v3.17c0 .31.21.67.8.56A11.5 11.5 0 0 0 12 .5z" />
    </svg>
  );
}

function Tick({ d, half = false }: { d: number; half?: boolean }) {
  return (
    <>
      <svg className="lp-tick" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path className="lp-draw" pathLength={1} d="M3.5 13.5l5.5 5.5L21 5" style={vars({ '--d': d })} />
      </svg>
      {half ? (
        <span className="lp-tick-half" aria-hidden="true" style={vars({ '--d': d })}>
          ½
        </span>
      ) : null}
    </>
  );
}

// ---------------------------------------------------------------------------------------------------------------

function Hero() {
  return (
    <section className="lp-hero" data-tape="hero" aria-labelledby="hero-title">
      <div className="lp-wrap lp-hero-grid">
        <div>
          <ul className="lp-eyebrow" aria-label="In short">
            <li>CBSE</li>
            <li>Class 11 &amp; 12</li>
            <li>Free &amp; open source</li>
          </ul>
          <h1 id="hero-title" className="lp-h1" data-testid="landing-title">
            See the accounts <mark className="lp-mark lp-mark-sweep">balance</mark> themselves
          </h1>
          <p className="lp-sub">
            <strong>Free, open-source practice for CBSE Accountancy, Class 11 and Class 12.</strong> No sign-up, no ads, and it works offline.
          </p>
          <LandingCta where="hero" follow />
          <dl className="lp-counts" data-testid="landing-counts">
            {COUNTS.map((c, i) => (
              <div key={c.id} className="lp-count">
                <dt>{c.label}</dt>
                <dd data-testid={`landing-count-${c.id}`}>
                  <Digits text={amount(c.n)} c={i} />
                </dd>
              </div>
            ))}
          </dl>
        </div>
        <HeroScale />
      </div>
    </section>
  );
}

function Follow() {
  return (
    <section id="follow" className="lp-section lp-follow" data-tape="follow" aria-labelledby="follow-title" data-testid="landing-follow-section">
      <div className="lp-wrap">
        <Kicker folio="Folio 2">Follow one transaction</Kicker>
        <h2 id="follow-title" className="lp-h2">
          One sale, from the bill to the <span className="lp-mark">balance sheet</span>
        </h2>
        <p className="lp-lede">
          Scroll, and a credit sale with GST travels through the books the way the board expects: the bill, the journal, the ledger, the trial
          balance and the final accounts. Every figure adds up. Each step opens the lab that lets you try it yourself.
        </p>
        <FollowTransaction />
      </div>
    </section>
  );
}

function TwoBooks() {
  return (
    <section className="lp-section lp-books" data-tape="books" aria-labelledby="books-title" data-testid="landing-books">
      <div className="lp-wrap">
        <Kicker folio="Folio 3">Two books</Kicker>
        <h2 id="books-title" className="lp-h2">
          Every topic of both classes, in the order you meet them
        </h2>
        <p className="lp-lede">
          Each topic has a lesson in steps, rule cards, questions made fresh each time, written answers and its own ladder of levels. Open one to
          see.
        </p>
        <div className="lp-book" data-reveal>
          {LANDING_COURSES.map((course, k) => {
            const main = course.topics.filter((t) => !t.option);
            const options = (['analysis', 'computerised'] as const)
              .map((o) => ({ option: o, topics: course.topics.filter((t) => t.option === o) }))
              .filter((g) => g.topics.length > 0);
            let no = 0;
            const row = (t: (typeof course.topics)[number], i: number) => {
              no += 1;
              return (
                <li key={t.id} className="lp-rise" style={vars({ '--i': i })}>
                  <Link href={`/topics/${t.id}`} prefetch={false} data-testid={`landing-topic-${t.id}`}>
                    <span className="lp-index-no">{String(no).padStart(2, '0')}</span>
                    <span className="lp-index-title">{t.title}</span>
                    <span className="lp-index-unit">{t.unit}</span>
                  </Link>
                </li>
              );
            };
            return (
              <article key={course.id} className={`lp-page${k === 0 ? '' : ' lp-page-green'}`} aria-labelledby={`book-${course.id}`} data-testid={`landing-book-${course.id}`}>
                <span className="lp-ribbon" aria-hidden="true" />
                <h3 id={`book-${course.id}`}>{course.label}</h3>
                <p className="lp-page-sub">Index · Accountancy</p>
                <ul className="lp-index">{main.map(row)}</ul>
                {options.length > 0 ? (
                  <>
                    <p className="lp-index-group">Part B: your school teaches one</p>
                    {options.map((g) => (
                      <div key={g.option}>
                        <p className="lp-index-group" style={{ color: 'var(--lp-navy)', marginTop: 6 }}>
                          {PART_B_LABEL[g.option]}
                        </p>
                        <ul className="lp-index">{g.topics.map((t, i) => row(t, main.length + i))}</ul>
                      </div>
                    ))}
                  </>
                ) : null}
                <p className="lp-page-foot">
                  <strong>{amount(course.counts.topics)}</strong> topics · <strong>{amount(course.counts.patterns)}</strong> question types ·{' '}
                  <strong>{amount(course.counts.questions)}</strong> set questions · <strong>{amount(course.counts.written)}</strong> written answers
                </p>
              </article>
            );
          })}
        </div>
      </div>
    </section>
  );
}

function LabCard({ lab, copy }: { lab: (typeof LABS_SHOWN)[number]; copy: boolean }) {
  return (
    <li>
      <Link
        href={labHref(lab.id)}
        prefetch={false}
        className="lp-labcard"
        tabIndex={copy ? -1 : undefined}
        data-testid={copy ? undefined : `landing-lab-${lab.id}`}
      >
        <span className="lp-labcard-top">
          <LabIcon id={lab.id} />
          <span className={`lp-labclass${lab.classLevel === 12 ? ' lp-labclass-12' : ''}`}>Class {lab.classLevel}</span>
        </span>
        <h3>{lab.title}</h3>
        <p>{lab.blurb}</p>
        <span className="lp-labgo">Open the lab →</span>
      </Link>
    </li>
  );
}

function LabDeskSection() {
  return (
    <section className="lp-section lp-labs" data-tape="labs" aria-labelledby="labs-title" data-testid="landing-labs">
      <div className="lp-wrap">
        <div className="lp-desk-head">
          <div>
            <Kicker folio="Folio 4">The lab desk</Kicker>
            <h2 id="labs-title" className="lp-h2">
              {LABS_SHOWN.length} labs that show the books moving
            </h2>
            <p className="lp-lede">
              Each lab is the picture of one part of the course: tanks for the equation, a scale for the trial balance, dials for ratios, a cheque
              for the bank. Change a figure and watch. Nothing is scored.
            </p>
          </div>
        </div>
      </div>
      <LabDesk cards={LABS_SHOWN.length}>
        <ul className="lp-labset" aria-label="Simulator labs">
          {LABS_SHOWN.map((lab) => (
            <LabCard key={lab.id} lab={lab} copy={false} />
          ))}
        </ul>
        <ul className="lp-labset" aria-hidden="true" inert>
          {LABS_SHOWN.map((lab) => (
            <LabCard key={lab.id} lab={lab} copy />
          ))}
        </ul>
      </LabDesk>
      <div className="lp-wrap">
        <p className="lp-lede" style={{ marginTop: 28 }}>
          <Link href="/simulator" prefetch={false} className="ft-lab" data-testid="landing-simulator">
            See every lab on the shelf →
          </Link>
        </p>
      </div>
    </section>
  );
}

function ExamReady() {
  const folders: { tab: string; colour: string; title: string; count: string; text: string; href: string; id: string }[] = [
    {
      id: 'mock',
      tab: 'Mock papers',
      colour: 'var(--lp-mustard)',
      title: 'Full papers in the CBSE pattern',
      count: `${LANDING_FULL_PAPER.marks} marks`,
      text: `${LANDING_FULL_PAPER.questions} questions in ${LANDING_FULL_PAPER.minutes / 60} hours against a clock that cannot be paused, a half-yearly paper and a 20-mark topic test: a new paper every time, marked part by part.`,
      href: '/mock',
    },
    {
      id: 'written',
      tab: 'Written answers',
      colour: '#f4b7a8',
      title: 'Theory, marked point by point',
      count: amount(T.written),
      text: '“Distinguish between”, “state the features”, “give reasons”: write, then see the model answer as the marking scheme credits it.',
      href: '/written',
    },
    {
      id: 'ar',
      tab: 'Assertion-Reason',
      colour: '#bcd3f5',
      title: 'Assertion and Reason, in every topic',
      count: amount(T.assertionReason),
      text: 'A level of Assertion-Reason questions on each topic, the kind the paper now sets, with why each choice is right or wrong.',
      href: '/topics',
    },
    {
      id: 'cases',
      tab: 'Case studies',
      colour: '#c6e8d4',
      title: 'One business, linked questions',
      count: amount(T.cases),
      text: 'Case studies that follow a business through several questions, a different case on every play.',
      href: '/cases',
    },
    {
      id: 'viva',
      tab: 'Project and viva',
      colour: '#e9d5f5',
      title: 'Part C, the project and the viva',
      count: amount(T.viva),
      text: 'Viva questions with short model answers, and a guide to each project the syllabus offers.',
      href: '/practical',
    },
  ];
  return (
    <section className="lp-section lp-exam" data-tape="exam" aria-labelledby="exam-title" data-testid="landing-exam">
      <div className="lp-wrap">
        <Kicker folio="Folio 5">Exam ready</Kicker>
        <h2 id="exam-title" className="lp-h2">
          Written the way the <span className="lp-mark">examiner marks</span> it
        </h2>
        <div className="lp-exam-grid">
          <figure className="lp-answer lp-carbon" data-reveal style={{ margin: 0 }} aria-labelledby="answer-q" data-testid="landing-answer">
            <p id="answer-q" className="lp-answer-q">
              Q. Distinguish between a provision and a reserve on any three bases. <span>(3 marks)</span>
            </p>
            <div className="lp-score" data-testid="landing-answer-score">
              <svg viewBox="0 0 92 64" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" aria-hidden="true">
                <path className="lp-draw" pathLength={1} style={vars({ '--d': 1700 })} d="M70 9C55 1 21 3 9 18-2 32 13 55 44 58c28 3 46-12 43-30C85 14 71 6 56 5" />
              </svg>
              <span className="lp-score-text">2½ / 3</span>
            </div>
            <table className="lp-table">
              <caption className="lp-sr">A learner’s answer, marked: two bases right, half of the third.</caption>
              <thead>
                <tr>
                  <th scope="col">Basis</th>
                  <th scope="col">Provision</th>
                  <th scope="col">Reserve</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <th scope="row">Nature</th>
                  <td className="lp-hand" data-side="Provision">
                    A charge against profit
                    <Tick d={200} half />
                  </td>
                  <td className="lp-hand" data-side="Reserve">
                    An appropriation of profit
                    <Tick d={500} half />
                  </td>
                </tr>
                <tr>
                  <th scope="row">Purpose</th>
                  <td className="lp-hand" data-side="Provision">
                    To meet a known liability whose amount is not certain
                    <Tick d={800} half />
                  </td>
                  <td className="lp-hand" data-side="Reserve">
                    To make the business stronger and meet what cannot be foreseen
                    <Tick d={1100} half />
                  </td>
                </tr>
                <tr>
                  <th scope="row">When made</th>
                  <td className="lp-hand" data-side="Provision">
                    Must be made whether there is a profit or not
                    <Tick d={1400} half />
                  </td>
                  <td className="lp-hand" data-side="Reserve">
                    <span className="lp-wrong">Can be made even in a year of loss</span>
                    <span className="lp-sr"> (not credited)</span>
                  </td>
                </tr>
              </tbody>
            </table>
            <p className="lp-examiner">
              <strong>Examiner’s tip.</strong> Each basis earns ½ for each side, and only when both sides answer the same basis. Rewrite: a reserve
              is made only out of profit.
            </p>
            <figcaption className="lp-sr">Marks: 2 and a half out of 3.</figcaption>
          </figure>
          <ul className="lp-folders">
            {folders.map((f, i) => (
              <li key={f.id}>
                <Link href={f.href} prefetch={false} className="lp-folder" style={{ ['--lp-tab' as string]: f.colour, marginTop: i === 0 ? 24 : 14 }} data-testid={`landing-exam-${f.id}`}>
                  <span className="lp-folder-tab">{f.tab}</span>
                  <h3>
                    {f.title} <b>{f.count}</b>
                  </h3>
                  <p>{f.text}</p>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
}

function HowItWorks() {
  const steps: { verb: string; text: string; quote?: string; href: string; go: string }[] = [
    { verb: 'Learn', text: 'A lesson a step at a time: one idea, then its worked example.', href: '/topics', go: 'The topics' },
    {
      verb: 'Practise',
      text: 'Fresh figures every time, and feedback that names the mistake.',
      quote: 'Sales A/c is credited, not debited: the goods went out of the business.',
      href: '/practice',
      go: 'Practice',
    },
    { verb: 'Simulate', text: 'Labs that move the books while you change the figures.', href: '/simulator', go: 'The simulator' },
    { verb: 'Write', text: 'Board-style theory answers, marked point by point.', href: '/written', go: 'Written answers' },
    { verb: 'Test', text: 'Timed mock papers in the CBSE pattern, then the marks part by part.', href: '/mock', go: 'Mock papers' },
  ];
  return (
    <section className="lp-section lp-how" data-tape="how" aria-labelledby="how-title" data-testid="landing-how">
      <div className="lp-wrap">
        <Kicker folio="Folio 6">How it works</Kicker>
        <h2 id="how-title" className="lp-h2">
          Learn, practise, simulate, write, test
        </h2>
        <ol className="lp-steps" data-reveal>
          {steps.map((s, i) => (
            <li key={s.verb} className="lp-rise" style={vars({ '--i': i })}>
              <Link href={s.href} prefetch={false} className="lp-ticket lp-carbon" data-testid={`landing-how-${s.verb.toLowerCase()}`}>
                <span className="lp-ticket-no" aria-hidden="true">
                  {i + 1}
                </span>
                <h3>{s.verb}</h3>
                <p>{s.text}</p>
                {s.quote ? <q>{s.quote}</q> : null}
                <span className="lp-ticket-go">{s.go} →</span>
              </Link>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}

function MadeInTheOpen() {
  return (
    <section className="lp-section lp-open" data-tape="open" aria-labelledby="open-title" data-testid="landing-open">
      <div className="lp-wrap lp-open-grid">
        <div>
          <Kicker folio="Folio 7">Made in the open</Kicker>
          <h2 id="open-title" className="lp-h2">
            Free, with nothing to sign up for
          </h2>
          <p className="lp-lede">
            No account, no ads and no fee. What you do stays in your own browser, on your own device; a backup file carries it to another. The code
            and the content are open: anyone can read them, point out a mistake or suggest a question.
          </p>
          <ul className="lp-links">
            <li>
              <a href={`${REPO}/issues/new/choose`} data-testid="landing-report">
                <svg aria-hidden="true" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                  <circle cx="10" cy="10" r="7.5" />
                  <path d="M10 6v5M10 14h.01" />
                </svg>
                Report a mistake
              </a>
            </li>
            <li>
              <a href={`${REPO}/discussions`} data-testid="landing-discussions">
                <svg aria-hidden="true" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round">
                  <path d="M3 4h10v7H8l-3 3v-3H3z" />
                  <path d="M13 7h4v7h-2v3l-3-3H9" />
                </svg>
                Discussions
              </a>
            </li>
            <li>
              <a href={REPO} data-testid="landing-source">
                <GitHubIcon />
                Source code
              </a>
            </li>
          </ul>
          <p className="lp-licence">The code is under the MIT licence and the learning content under CC BY-SA 4.0.</p>
        </div>
        <div className="lp-memo" data-reveal>
          <p id="memo-title" className="lp-memo-head">
            Cash memo
            <small>Accountancy Master · every learner</small>
          </p>
          <dl>
            <div className="lp-memo-row">
              <dt>Fee</dt>
              <dd>₹0.00</dd>
            </div>
            <div className="lp-memo-row">
              <dt>Account to make</dt>
              <dd>None</dd>
            </div>
            <div className="lp-memo-row">
              <dt>Advertisements</dt>
              <dd>None</dd>
            </div>
            <div className="lp-memo-row">
              <dt>Where your progress is kept</dt>
              <dd>Your browser</dd>
            </div>
            <div className="lp-memo-row">
              <dt>Works offline</dt>
              <dd>Yes</dd>
            </div>
            <div className="lp-memo-row lp-memo-total">
              <dt>Total to pay</dt>
              <dd>₹0.00</dd>
            </div>
          </dl>
          <span className="lp-stamp lp-stamp-due" aria-hidden="true">
            Nothing due
          </span>
        </div>
      </div>
    </section>
  );
}

function Closing() {
  return (
    <section className="lp-section lp-close" data-tape="close" aria-labelledby="close-title" data-testid="landing-close">
      <div className="lp-wrap">
        <div data-reveal>
          <div className="lp-slip" data-testid="landing-slip">
            {TAPE.map((l) => (
              <div key={l.label} className="lp-slip-line">
                <span>{l.label}</span>
                <span className="lp-slip-num">{amount(l.n)}</span>
                <span className="lp-slip-sym" aria-hidden="true">
                  +
                </span>
              </div>
            ))}
            <div className="lp-slip-line lp-slip-total">
              <span>Total</span>
              <span className="lp-slip-num" data-testid="landing-slip-total">
                {amount(TAPE_TOTAL)}
              </span>
              <span className="lp-slip-sym" aria-hidden="true">
                *
              </span>
            </div>
            <h2 id="close-title">Everything you need for the board exam</h2>
            <span className="lp-stamp lp-stamp-due" style={{ ['--lp-stamp-delay' as string]: '700ms' }} aria-hidden="true" data-testid="landing-stamp">
              Balanced <span className="lp-stamp-tick">✓</span>
            </span>
          </div>
        </div>
        <LandingCta where="close" />
      </div>
    </section>
  );
}

/** The landing page: what the app is, told as an account book that balances itself. */
export function Landing() {
  return (
    <div className="lp" data-testid="landing">
      <LandingMotion />
      <a className="lp-skip" href="#lp-main">
        Skip to content
      </a>
      <header className="lp-bar">
        <div className="lp-wrap lp-bar-inner">
          <Link href="/" className="lp-brand" aria-label="Accountancy Master, home">
            <span className="lp-logo" aria-hidden="true">
              ₹
            </span>
            <span className="lp-brand-name">Accountancy Master</span>
          </Link>
          <a href={REPO} className="lp-iconlink" data-testid="landing-github">
            <GitHubIcon />
            <span className="lp-iconlink-text">GitHub</span>
            <span className="lp-sr"> (source code)</span>
          </a>
          <LandingCta where="bar" size="sm" />
        </div>
      </header>
      <AddingTape lines={TAPE} tearAt="close" />
      <main id="lp-main">
        <Hero />
        <Follow />
        <TwoBooks />
        <LabDeskSection />
        <ExamReady />
        <HowItWorks />
        <MadeInTheOpen />
        <Closing />
      </main>
      <footer className="lp-foot">
        <div className="lp-wrap lp-foot-inner">
          <p style={{ margin: 0, alignSelf: 'center' }}>Accountancy Master: free practice for CBSE Accountancy, Class 11 and Class 12.</p>
          <nav aria-label="More">
            <ul>
              <li>
                <Link href="/start">Start</Link>
              </li>
              <li>
                <a href={`${REPO}/issues/new/choose`}>Report a mistake</a>
              </li>
              <li>
                <a href={REPO}>Source code</a>
              </li>
            </ul>
          </nav>
        </div>
      </footer>
    </div>
  );
}
