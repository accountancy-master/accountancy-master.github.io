# Accountancy Master

**Free, open-source practice for CBSE Accountancy, Class 11 and Class 12.** Open it at
**<https://accountancy-master.github.io>**: no sign-up, no ads, and it works offline once opened.

Every topic of both classes has a lesson worked in steps, questions made fresh each time with feedback that names the
mistake, simulator labs that show the accounts moving, case studies, board-style written answers marked point by
point, Assertion-Reason questions, the project and viva, and full mock papers. All of a learner's progress stays in
their own browser; a backup file moves it to another device (Settings, Backup).

Found a mistake, or want to help? See [CONTRIBUTING.md](CONTRIBUTING.md), report it in
[Issues](https://github.com/accountancy-master/accountancy-master.github.io/issues), or talk about it in
[Discussions](https://github.com/accountancy-master/accountancy-master.github.io/discussions). The code is under the
MIT licence and the learning content under CC BY-SA 4.0 ([LICENSE](LICENSE), [LICENSE-CONTENT.md](LICENSE-CONTENT.md)).

## Finding your way

On a laptop or desktop (1024 px and wider) the app uses the whole screen: a sidebar with the course switch, "Go to…" and every page by group (Learn, Practise, You), and a top bar with the exam countdown, XP, streak, the theme toggle and the learner's menu. On a phone it keeps the bottom bar of five items, with a search button in the header. The navigation is one list, in `src/components/shell/navigation.ts`.

- **Go to (Ctrl K or Cmd K, or the search button on a phone)** finds any page, any topic of either course (by its title, unit or concepts), any level, rule card, question type (one entry for the question types of a concept) or case study, and goes there; a word with one slip in it ("admisson") still finds what it means when nothing else matches. "/" focuses the search of a page that has one (Topics).
- **What's inside** (`/inside`) sets every topic of a course against every kind of content (levels, lessons, cards, set questions, question types by kind and difficulty, case studies) with the learner's progress, and every number opens where it is played.
- **Words.** What a learner sees says *question type* (a kind of question that makes a new question, with new figures, every time it is played; the code calls it a template or a pattern) and *set question* (a question written once). Neither "generator" nor "pattern" is shown to a learner.
- **Glossary** (`/glossary`) has every term of the course A to Z, one letter at a time (or "A to Z", a page of 30 at a time with "Show more"), with a letter index of 44 px buttons, a search ("/" focuses it) over the terms, their other names and their definitions, and filters by unit and topic. Each term shows its definition, an example, its topic (and where to practise its concept) and related terms; a term has its own address (`/glossary#goodwill`) and "Go to" finds it ("Goodwill (glossary)"). The terms and the exam tips are plain data in `src/content/glossary/` (format in `types.ts`, checked by `npm run validate-content`), loaded only when a page needs them.
- **Before the exam** (`/exam`) (its long parts fold on a phone, each under a heading that says what is inside; `/exam#plan` opens one) puts together what the app knows for the last stretch: the countdown, the paper's pattern from the blueprint with a time for each section (in proportion to its marks, after the 15 minutes of reading), the units by marks with the learner's mastery, the weakest ideas and the topics not started, the most frequent mistakes by topic, the course's exam tips as checklists (ticks kept on the device) and a simple day-by-day plan to the exam date (`examPlan` in `src/learning/examPack.ts`). Home links to it from the exam countdown and the quick actions.
- **Project and viva** (`/practical`) is Part C of the paper (20 marks: the project file 12, the viva voce 8) for the learner's course: each project the CBSE syllabus offers (Class 11: source documents and vouchers, a bank reconciliation statement, the comprehensive project of a sole proprietorship; Class 12: the financial statement analysis of a company, and the practical file of the Computerised Accounting option) with what its file holds in order, a plan by weeks, the mistakes that lose marks and a worked example whose figures are checked by tests (a guide prints on its own). The viva bank (over 200 questions a class, each with a short model answer, by topic, project and difficulty, with a search) can be practised one question at a time: think, see the model answer, mark "I knew it" or "Not yet"; the marks stay on the device for each learner, "Not yet" comes back first, and nothing is scored. A guide is at `/practical#option-brs`, a question at `/practical#viva-v11-004`, and "Go to" finds both. The content is plain data in `src/content/practical/` (format in `types.ts`, checked by `npm run validate-content`; the figures by `figures.test.ts`), loaded only when needed. Home's quick actions and "Before the exam" link to it.
- **Written answers** (`/written`) teach the board's written theory questions ("Distinguish between …", "State any three features …", "Give reasons …", "Explain …", short notes): over 200 of them, six to eight on every topic of both classes, with 1, 3, 4 and 6 marks. The learner writes an answer (or answers on paper), then sees the model answer laid out as a marking scheme credits it (a table with bases for a distinction), ticks the points it covered (points whose key words are in a typed answer are suggested), and gets marks point by point with the examiner's marking tip and the points to add next time. An answer below full marks goes to a list to rewrite, on the Mistakes screen and first next time. Each topic page links to its questions (`/written/<topic>`); results are kept per learner, backed up and synced, and earn no XP. The questions are plain data in `src/content/written/` (format in `types.ts`, checked by `validate.ts`), loaded per class only when needed, and kept off levels and mock papers.
- **Mind maps** (`/maps`, and `/maps/<topic>` for each topic) draw the course (units, topics with the learner's progress, and the links between topics: authored "builds on" links in `src/content/topicLinks.ts` and those case studies make) and each topic (concepts with mastery rings, then rule cards and question types by kind, and its case studies). Every node opens what it is; nodes fold, the map pans and zooms, is also an outline for the keyboard and screen readers, and can be saved as SVG or PNG or printed on one page. The layout is computed (`src/learning/mapLayout.ts`).
- **Simulator** (`/simulator`, a lab by `?lab=<id>`) shows the books moving: a shelf of labs, each the picture of one part of the course. The accounting equation is drawn as tanks (watch, predict, free play, find the mistake; its two levels of the type `simulation` stand on the Accounting Equation ladder); the other labs draw postings into T-accounts and the trial balance, a trial balance on a scale with Suspense, a month's books whose trial balance will not agree until the errors are found and rectified, depreciation over the years, the cash book against the pass book, the final accounts with their adjustments, books of original entry, incomplete records, partners sharing profit and changing ratios, goodwill, dissolution, a share issue, debentures, a company's statements and their analysis, cash flow and ratios. Each has a walk-through, a sandbox and "Try it" questions, and nothing is scored. Topic pages link to their labs and "Go to" finds them. How it is built, and how to add a lab: `docs/simulator.md`.
- **Part B of Class 12.** A school may teach Computerised Accounting as Part B in place of Analysis of Financial Statements. A Class 12 learner chooses which in Settings ("Part B of Class 12"; Analysis of Financial Statements unless changed). With Computerised Accounting chosen, its topic (the computerised accounting system, the spreadsheet at work, books kept on a package) stands in Topics, What's inside, Practice, Marathon, the maps, Go to, the glossary, the exam pack and the worksheets in place of the four topics of the analysis, and the full mock paper sets its Part B from it. Nothing done in either is lost by a change. How it works: `src/content/courseOptions.ts` and `docs/content-plan.md`.
- **Exam dates.** Each course has an exam date, set in Settings (a usual date is offered, from `EXAM_DATE_SUGGESTIONS` in `src/learning/examCountdown.ts`, to be updated every year). Home counts down to it and, as it comes closer, points to mock papers and weak topics.

## The daily loop

Opening the app lands on the **Dashboard**, which sets out a short routine for each day:

- **Daily goal.** A ring shows today's XP against a goal of 20, 50 or 100 XP (50 to start; change it in Settings). It turns solid and says "Goal met" once reached.
- **Today's mission.** A small set of rule cards, practice questions and a few harder ones, with a 50 XP bonus when finished. The bonus can be earned once a day.
- **Today's challenge.** Five harder questions, the same for everyone on the same day, with a 30 XP bonus once a day.
- **Start here / Continue.** Home's first card is the next level to play and why: the next level not passed of a topic the learner is part-way through on its ladder (the one played most recently), or else of the earliest unfinished topic in course order (`nextStep` in `src/learning/recommend.ts`). A case study, practice or the playground in another topic never moves it. Beside it, only when it is something else, a suggestion with its reason (mistakes waiting, cards due). The tiles of numbers (XP, streak, questions, accuracy, levels passed) appear once there is something to count; courses show levels passed, with mastery (how well the learner answers, idea by idea) said in words.
- **Practice hub.** Smart practice (a mix of weak ideas, due reviews and new ground), fresh questions made on the spot, card revision (a card marked "Need to revise" comes back sooner), and mistake review. A missed generated question can be followed by a similar one.
- **Practise a topic and Marathon.** Any topic can be practised or mixed into a marathon from the first day, whatever has been passed: pick one for ten fresh questions, or tick several topics (and quick questions, long ones and case studies) for a marathon, where questions keep coming until Stop. A mixed marathon starts easy, gets harder with correct answers and eases off after a miss; the best run of each topic is kept.
- **Mock papers.** A full paper in the CBSE pattern (80 marks, 3 hours, 34 questions of 1, 3, 4 and 6 marks), a half-yearly paper and a 20-mark topic test, each a new paper every time. They are sat against a clock that cannot be paused, with no hints and no answers until the end, then marked: marks by part, unit and topic, and the whole script with the working. A paper in progress survives closing the app, and marked papers stay in a history.
- **Mistakes.** Every question still wrong, in plain words, with the correct entry on request. A mistake is cleared by answering it correctly in a later session.
- **Quick sheet.** All the rules and formats of a topic on one printable page.
- **Worksheets** (`/worksheets`). A printable A4 sheet of the topics, kinds of question (quick questions, journal entries, sets, accounts and statements, case studies), difficulty and number of questions chosen, or a full or half-yearly paper in the board's pattern, with an answer key on pages of its own (or printed alone). Every sheet has a code (`W11-7K3QA-M2X9B`: the class, the choices, a seed and a check letter), printed on every page and kept in the address: the same code always makes the same sheet, and "New sheet" draws another seed. The code is worked out in `src/learning/worksheet.ts`, the layout of each kind on paper in `src/learning/worksheetLayout.ts`.
- **Look back.** Every topic but the first ends with a level that mixes it with questions from the topics before it, starting with the ones the learner is weakest in.
- **Case studies.** A topic that closes a stage of the accounting cycle ends with a case study once the stage has cases: one business and four to eight linked questions on it, a different case on every play. The Case studies screen lists every stage, plays a new case, a chosen one or a mixed one, and keeps the best score. Each stage is labelled by the topics its cases are about and each case tagged with them, and `/cases?topic=<id>` shows the cases of one topic (a topic's page links there): Admission cases sit in the stage that opens after Retirement, but are found under Admission. This is display only (`src/learning/caseTopics.ts`): no case's id, content, stage or marks change.
- **Shared links.** A link to a level or a topic of the other course (or of the Part B not chosen) says where it is and offers the switch; once switched, the level opens.
- **Lessons, a step at a time.** A lesson is read one block at a time (a short text goes with the worked example or table it leads into, see `src/play/lessonSteps.ts`), with "Step 2 of 7", a bar, Back and Next; the last step goes on to the lesson's check. A lesson level is passed by working through it: its check is practice, a missed check can be tried again at once after its explanation (the new answer is recorded as an extra and never changes the score, which still says how many checks were right first time).
- **Pass rules and partial XP.** A level is passed at its pass mark (70% unless the level says otherwise), and a long question (a set of entries, an account, a statement such as a trial balance) counts as right only when every row or entry is right. The parts that are right still earn XP: in proportion to them (9 of 10 rows: 90% of the question's XP, at least 1), once at least half are right, on the first answer to the question only (`CONFIG.xp.partial`, `xpForAttempt`). The feedback says "Almost" and how many rows were right. Partial XP is worked out from the stored mistake code, so nothing new is stored and older answers count the same way.
- **Replays.** Every play of a level draws its generated questions from a fresh block of seeds, and a replay asks the level's authored questions in an order of its own (the first play keeps the listed order).
- **Journal entries.** The entry shows its debit and credit totals and whether they match while it is typed; Check on an entry that does not balance asks once ("Press Check again"). After Check a line on the wrong side or with the wrong amount says the amount it should have, and the correct entry is shown with its narration ("(Being goods purchased on credit from Ravi)": a question's own `narration`, or worked out from the entry by `src/engine/narration.ts`).
- **Level locking.** The ladder of a topic is in order: each level opens when the one before it is passed (the first level of every topic is always open). The Playground, practising a topic and the Marathon play anything regardless. The "Unlock all levels" switch in Settings (stored on the device, off on a device that has never set it) opens every level; a device that has set it keeps its choice.
- **Challenge timer.** A challenge level gives each question a time of its own (a minute and a half, more where the topic needs it), shown as a countdown; a question that runs out of time counts as a miss, with the right answer shown. The clock waits while the app is out of sight. The "Challenge timer" switch in Settings (kept with the learner, so a backup carries it) turns it off.
- **Learner management.** Rename or delete a learner (after typing the name to confirm) and choose the daily goal, in Settings.

This week's XP is shown as a bar chart on the Dashboard. Progress is still derived from the stored answers, so nothing here needs a connection.

## Run it locally

You need Node.js 22 or newer.

```bash
npm ci
npm run dev                          # development server at http://localhost:3000
npm run build && npm run start       # production build, which is what the offline support needs
```

Open the address in a browser, type a name and press "Start learning" (no account is needed; restoring a backup is the quieter way in below it). A Class 12 learner is asked which Part B the school teaches, with "Not sure" to choose later in Settings. Progress is kept in that browser (IndexedDB), per name.

## Install it on a phone

The app is an installable web app that works offline after the first visit. On the phone:

1. Open <https://accountancy-master.github.io> in Chrome (Android) or Safari (iPhone).
2. Open the browser menu (or the Share button on iPhone) and choose "Add to Home screen" (Chrome may call it "Install app").
3. Open Accountancy Master from the new home-screen icon. After one visit with a connection, it opens without one. Settings shows "Ready to use offline" when everything is saved.

## Checks

```bash
npm run check         # lint, content validation, unit tests, production build
npm run test:e2e      # Playwright tests at phone size (Pixel 7) and laptop size (1280 x 800)
npm run check:full    # both of the above
npm run check:release # everything, on both builds (about an hour)
npm run measure       # builds the static export and prints what each page downloads, and each topic's content
```

GitHub runs the same checks on every pull request (`.github/workflows/ci.yml`: lint, content validation, unit tests,
build, type check, and the browser tests against the static export). When a pull request is merged into `main`,
`.github/workflows/pages.yml` builds the static export and publishes it on GitHub Pages; there is nothing else to
deploy and no server.

The browser tests run in the Edge browser that is installed with Windows (it is a Chromium browser). Set `PW_CHANNEL=chrome` to use Chrome instead, or `PW_CHANNEL=` (empty) to use the Chromium that Playwright downloads; on other systems the downloaded Chromium is used.

`e2e/walkthrough.spec.ts` plays levels 0 to 6 of Journal Entries through the real screens on a fresh profile, then completes the day's mission and challenge from the Dashboard. It checks the topic ladder, the XP total (worked out from the questions actually served), the rank, the mastery map, the goal ring, the empty Mistakes list, that every answer and result was stored exactly once, and an empty console.

To retake the screenshots below (they need the e2e production server, so this takes about a minute):

```bash
SHOTS=1 npx playwright test e2e/screenshots.spec.ts      # on Windows PowerShell: $env:SHOTS=1; npx playwright test e2e/screenshots.spec.ts
```

## Screens

Each screen has a phone view (`-phone.png`) and a laptop view (`-laptop.png`) in [docs/screenshots/](docs/screenshots/). The pictures below are the phone views.

| Screen | What it is | Phone view |
|---|---|---|
| Who's learning | First screen: choose or create a learner | <img src="docs/screenshots/profile-gate-phone.png" width="200" alt="Profile gate"> |
| Dashboard (new learner) | Daily goal, first mission, where to start | <img src="docs/screenshots/dashboard-new-phone.png" width="200" alt="Dashboard for a new learner"> |
| Dashboard | Goal met, mission, continue card and the week at a glance | <img src="docs/screenshots/dashboard-phone.png" width="200" alt="Dashboard"> |
| Practice | Mission, challenge, smart practice, fresh questions, cards and mistakes | <img src="docs/screenshots/practice-hub-phone.png" width="200" alt="Practice hub"> |
| Practice question | A practice session in progress | <img src="docs/screenshots/practice-question-phone.png" width="200" alt="Practice question"> |
| Practice results | XP gained, rank, and the daily challenge bonus | <img src="docs/screenshots/practice-results-phone.png" width="200" alt="Practice results"> |
| Mistakes | What went wrong, in words, with the correct entry on request | <img src="docs/screenshots/mistakes-phone.png" width="200" alt="Mistakes"> |
| Quick sheet | Every rule and format of a topic on one printable page | <img src="docs/screenshots/sheet-phone.png" width="200" alt="Quick sheet"> |
| Topics | The Class 11 topic list, with upcoming topics greyed out | <img src="docs/screenshots/topics-phone.png" width="200" alt="Topics"> |
| Topic | The level ladder, mastery map and all rules for one topic | <img src="docs/screenshots/topic-phone.png" width="200" alt="Topic page"> |
| Lesson | A short explanation with a worked example | <img src="docs/screenshots/lesson-phone.png" width="200" alt="Lesson"> |
| Revision card | A rule to recall, flip to see the answer | <img src="docs/screenshots/card-phone.png" width="200" alt="Revision card"> |
| Question feedback | Multiple choice with the explanation after checking | <img src="docs/screenshots/mcq-feedback-phone.png" width="200" alt="Question feedback"> |
| Journal entry, empty | Account pickers, Dr/Cr and amount per line | <img src="docs/screenshots/journal-empty-phone.png" width="200" alt="Journal entry, empty"> |
| Journal entry, filled | Running totals show whether debits and credits match | <img src="docs/screenshots/journal-filled-phone.png" width="200" alt="Journal entry, filled"> |
| Journal entry, checked wrong | Each line marked, the mistake named, the correct entry shown | <img src="docs/screenshots/journal-wrong-phone.png" width="200" alt="Journal entry, wrong"> |
| Journal entry, checked right | Every line correct, XP awarded | <img src="docs/screenshots/journal-right-phone.png" width="200" alt="Journal entry, right"> |
| Results | Pass or retry, XP gained, rank, next level | <img src="docs/screenshots/results-phone.png" width="200" alt="Results"> |
| Progress | Rank, streak, accuracy and mastery per topic | <img src="docs/screenshots/progress-phone.png" width="200" alt="Progress"> |
| Settings | Switch or rename the learner, daily goal, backup and restore, delete learner, offline status | <img src="docs/screenshots/settings-phone.png" width="200" alt="Settings"> |

### Simulator labs

Each lab has a phone view (`-phone.png`) and a laptop view (`-laptop.png`) in [docs/screenshots/labs/](docs/screenshots/labs/), taken by `e2e/screenshots-labs.spec.ts` (`SHOTS=1`). The accounting equation's own screens are in [docs/screenshots/simulator/](docs/screenshots/simulator/).

| Lab | Class | What it shows | Phone view |
|---|---|---|---|
| Journal to ledger to trial balance | Class 11 | Follow an entry from the journal into the T-accounts, balance them, and see the trial balance agree. | <img src="docs/screenshots/labs/posting-phone.png" width="200" alt="Journal to ledger to trial balance"> |
| Depreciation over the years | Class 11 | Change the method, the rate and the years, and watch the book value fall and the asset sold. | <img src="docs/screenshots/labs/depreciation-phone.png" width="200" alt="Depreciation over the years"> |
| Cash book meets pass book | Class 11 | Two records of one bank account: find the items that differ and bring the balances together. | <img src="docs/screenshots/labs/bank-reconciliation-phone.png" width="200" alt="Cash book meets pass book"> |
| The trial balance scale | Class 11 | Errors land on the debit or credit pan: see which ones tip the balance, and how Suspense and rectification set it level. | <img src="docs/screenshots/labs/trial-balance-scale-phone.png" width="200" alt="The trial balance scale"> |
| When the trial balance won't agree | Class 11 | Post a month of books with errors hidden in them, open Suspense A/c for the difference, then find each error, rectify it and watch Suspense close. | <img src="docs/screenshots/labs/trial-balance-fix-phone.png" width="200" alt="When the trial balance won't agree"> |
| From trial balance to final accounts | Class 11 | Sort every balance into the Trading Account, the Profit and Loss Account or the Balance Sheet, then make the adjustments. | <img src="docs/screenshots/labs/final-accounts-phone.png" width="200" alt="From trial balance to final accounts"> |
| Sharing among partners | Class 12 | Split the profit after interest and salaries, then admit or retire a partner and watch the shares change. | <img src="docs/screenshots/labs/partnership-phone.png" width="200" alt="Sharing among partners"> |
| A share from application to forfeiture | Class 12 | Follow the money of a share issue through application, allotment and calls, then forfeit and reissue. | <img src="docs/screenshots/labs/shares-phone.png" width="200" alt="A share from application to forfeiture"> |
| Where the cash came from and went | Class 12 | Cash at the start, cash at the end, and the operating, investing and financing flows between them. | <img src="docs/screenshots/labs/cash-flow-phone.png" width="200" alt="Where the cash came from and went"> |
| Ratios on the dials | Class 12 | Change a figure of the balance sheet or the statement of profit and loss and watch every ratio move. | <img src="docs/screenshots/labs/ratios-phone.png" width="200" alt="Ratios on the dials"> |
| Which book does it go in? | Class 11 | Send each transaction to its book (cash book, purchases, sales, returns or journal proper) and watch the books fill and post. | <img src="docs/screenshots/labs/books-of-entry-phone.png" width="200" alt="Which book does it go in?"> |
| Profit without full books | Class 11 | Build the statements of affairs at two dates and see the profit come out of the growth in capital. | <img src="docs/screenshots/labs/incomplete-records-phone.png" width="200" alt="Profit without full books"> |
| Putting a price on goodwill | Class 12 | Change the profits, the years and the normal rate, and watch average, super and capitalised profits value the goodwill. | <img src="docs/screenshots/labs/goodwill-phone.png" width="200" alt="Putting a price on goodwill"> |
| Closing a firm | Class 12 | Close the books of a firm: assets realised, liabilities paid, the profit or loss on realisation shared, and every account down to nothing. | <img src="docs/screenshots/labs/dissolution-phone.png" width="200" alt="Closing a firm"> |
| Borrowing through debentures | Class 12 | Issue debentures at par, a premium or a discount, redeemable at par or a premium, and follow the loss on issue and the interest. | <img src="docs/screenshots/labs/debentures-phone.png" width="200" alt="Borrowing through debentures"> |
| A company's statements, read | Class 12 | Sort items into the Schedule III balance sheet, then compare two years and see each item as a share of the total. | <img src="docs/screenshots/labs/company-statements-phone.png" width="200" alt="A company's statements, read"> |
| Accounts in a spreadsheet | Class 12 | A working sheet: build a bank reconciliation, depreciation and loan schedules, ratios and a chart with formulas, and copy them down. | <img src="docs/screenshots/labs/spreadsheet-phone.png" width="200" alt="Accounts in a spreadsheet"> |

## Design and plans

- How content is written: [docs/authoring-questions.md](docs/authoring-questions.md), [docs/authoring-cases.md](docs/authoring-cases.md), [docs/content-plan.md](docs/content-plan.md)
- What the syllabus asks and where the app covers it: [docs/syllabus-coverage.md](docs/syllabus-coverage.md)
- The simulator labs: [docs/simulator.md](docs/simulator.md)
