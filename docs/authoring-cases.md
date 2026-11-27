# Writing case studies

A case study is one scenario (a business, with its transactions or balances) and four to eight questions on it,
asked in order (two to five when one of them is a set of entries or a format: see "Chained cases"). It is where
topics meet: the same figures are journalised, posted, balanced, corrected and carried to the final accounts. A case
generator makes a fresh case for every seed, so a student can play the same case study many times and never see the
same figures twice.

Read `docs/authoring-questions.md` first: everything there about amounts, wording, distractors and common errors
applies to the questions of a case.

## Where things are

| What | Where |
|---|---|
| Your cases | `src/generators/cases/<stage>.ts` (one file per stage of either course; default export `CaseTemplate[]`) |
| The stages and the topic each belongs to | `src/generators/cases/index.ts` (`CASE_STAGES`) |
| `caseTemplate` and the helpers | `src/generators/authoring.ts` |
| Posting entries, balances, trial balance | `src/engine/books.ts` (`post`, `balanceOf`, `trialBalance`, `listBalances`) |
| Accounts you may use | `src/engine/accounts.ts` |
| A complete worked example | the `sample` case in `src/generators/cases.test.ts` |

Adding a case is one `caseTemplate({...})` in your stage's file. Nothing else has to change. The stages of Class 12
(`partnership-accounts`, `reconstitution`, `dissolution`, `company-accounts`, `analysis`) are in `CASE_STAGES` with
their topics and concepts, and a stage belongs to the course of its topic: a learner meets the stages of their own
course only. A part of a case may be of any kind a template is: a ratio or a "times" answer
(`{ kind: 'numeric', unit: 'ratio', make: ... }`), partners' accounts in columns, a statement in parts.

A topic may close several stages: the integrated stages (`books-and-errors`, `whole-year`, `firm-life`,
`company-year`) close a topic that closes a stage already, and stand after it in `CASE_STAGES`. Each stage has its
own file, concept, level, card on the Case studies screen and page. To add a stage: write its file (default export
`CaseTemplate[]`, empty to begin with), register it in `CASE_STAGES` after the other stages of its topic with a
concept of its own, add its line to `CASES` in `src/content/loadTopics.ts` (a unit test fails while it is missing),
and run `npm run catalogue`. While a stage has no case it is nowhere to be seen: no level, no card, no count, and it
is not fetched with its topic.

## The shape of a case

```ts
caseTemplate({
  id: 'case-cycle-new-shop',            // unique; starts "case-" and a short stage prefix
  topicId: 'trial-balance',             // the stage's topic and concept, from CASE_STAGES
  conceptId: 'tb-case',
  difficulty: 'medium',
  title: 'The first month of a new shop', // unique within the stage, shown where cases are listed
  setup: (rng) => { ...; return scenario; },   // draw EVERYTHING random here; return null to reject
  context: (s) => '...',                 // the case as the student reads it
  parts: [                               // 4 to 8 questions, at least two kinds
    { kind: 'journal', make: (s) => ({ prompt, lines, explanation }) },
    { kind: 'numeric', unit: 'rupees', make: (s) => ({ prompt, answer, commonErrors, explanation }), verify: (q) => ... },
    { kind: 'mcq', make: (s) => ({ prompt, correct, distractors, explanation }) },
  ],
});
```

A part may also be `journal_set`, `account` or `statement`: the case is then a chained case, which has its own section below.

- **`setup(rng)`** builds the whole scenario: names, dates, amounts, which transactions or adjustments occur, and
  everything computed from them (entries, ledger, totals). It is run again for every question of the case with the
  same random stream, so it must depend on `rng` alone. Return `null` for a combination you do not want.
- **`context(s)`** is the case text: one or two lines that set the scene, then the data, one item per line, joined
  with `\n`. Every question shows it above its prompt, so a prompt never repeats the data.
- **`parts`** make one question each from the scenario. A part takes no `rng`: if a question needs a random choice,
  make the choice in `setup` and keep it in the scenario. A part may return `null` to reject the seed for the
  whole case.
- Journal questions state their entry directly (`lines` and `explanation`). The amounts need not appear in the
  prompt: they are in the case.
- Give a `verify` to the questions with real arithmetic, recomputing the answer another way.

Let the engine do the bookkeeping. Build the entries once in `setup`, `post` them, and read balances and totals
from the ledger instead of adding them by hand, so that every question of the case agrees with every other:

```ts
const entries = [[dr('cash', capital), cr('capital', capital)], ...];
const ledger = post(entries);
balanceOf(ledger, 'cash');            // { side: 'Dr', amount } or null
trialBalance(ledger).debitTotal;
```

## What makes a good case

- **It is one story.** Each question uses the same business and the same figures, and later questions build on
  earlier ones (entry, then balance, then total, then what it means).
- **The questions climb.** Start with something direct (an entry, a single balance), end with the figure the whole
  case leads to (a trial balance total, the pass book balance, the corrected profit, net profit).
- **It reads like an exam problem.** Dates in order, Indian names and trades, round figures, whole rupees.
- **It fits a phone.** Keep the case text to about 14 lines, each line short ("5 April: Sold goods to Kiran on
  credit ₹18,000."). A trial balance is a list, one account per line, with `listBalances`.
- **It changes from seed to seed in more than the numbers.** Vary which transactions, errors or adjustments are in
  the case, the kind of business, the unknown asked for. The harness fails a case whose text hardly changes.
- **Every convention is stated in the case text** (the accounting year, how depreciation is charged for part of a
  year, the rate of GST, whether a provision is on debtors after bad debts).
- **Each question stands alone once the case is read.** Do not write "using your answer to the last question".
  A student who got an earlier question wrong must still be able to answer this one from the case. (The long parts
  of a chained case are the one exception, and a narrow one: see "A later part may start from..." below.)
- **Answers are positive.** Ask for the amount and, separately where it matters, for the side or the direction
  (a choice question: "debit or credit balance?", "profit or loss?").

## Chained cases

The long question of the examination is one trial balance from which the student prepares the Trading Account, then
the Profit and Loss Account, then the Balance Sheet. A chained case is that: a case one or more of whose parts is a
long question, all on the one scenario. The long kinds are the three of `docs/authoring-questions.md`: `journal_set`
(a set of entries), `account` (a two-sided account) and `statement`. `case-fa-chain-trading-pl-bs` in
`src/generators/cases/final-accounts.ts` is the worked example, and `SAMPLE_CHAIN` in `src/testing/sampleCase.ts` a
small one that chains a set, an account and a statement.

```ts
parts: [
  // A set of entries: what `journalSetTemplate` returns. `opening` may be left out: the case text has the business.
  { kind: 'journal_set', make: (s) => ({ task: 'Journalise the transactions of the week.', transactions: [{ date: '2 April', text: 'Goods bought for cash.', lines, explanation }, ...] }) },
  // An account: what `accountTemplate` returns, without `data`.
  { kind: 'account', make: (s) => ({ task: 'Prepare Cash A/c for the week and balance it on 7 April.', title: 'Cash A/c', ...ledgerSides(accountOf(s.dated, 'cash'), { closeOn: '7 April' }), distractors, explanation }), verify: (q) => ... },
  // A statement: what `statementTemplate` returns, without `data`.
  { kind: 'statement', make: (s) => ({ task: 'Prepare the Trial Balance on 7 April.', title, heading: 'Name of account', columns: ['Debit (₹)', 'Credit (₹)'], totalsAgree: true, rows, distractors, explanation }) },
],
```

- **`make(scenario)` returns what that kind's `generate` returns**, and the engine builds and checks the part exactly
  as it does a set or a format that stands alone (sides that agree, rows that can be told apart, two spare labels,
  balanced entries, and so on). Everything in `docs/authoring-questions.md` about rows, `details`, closing rows,
  `later` and `ledgerPeriods`, `columns`, `final`, `label` and `task` of a set applies unchanged.
- **A format gives no `data`.** The case text is what the student works from, and the screen shows it once, in the
  place a format shows its data. `data` in a part does not compile, and the case is refused if one is given anyway.
  The question that is built has the case text as both its `data` and its `context`, so a `verify` reads `q.data`.
- **A set may leave `opening` out**; its prompt is then the task alone. Give each transaction a short `text` that
  names it ("Goods bought on credit from Rao & Co.") and leave the amounts to the case text, so nothing is printed
  twice. A set of a case may have 3 to 8 transactions whatever the difficulty of the case.
- **How many parts, and of which kinds.** A case with a long part has 2 to 5 parts (a case of short questions keeps
  4 to 8). A case still needs two kinds of question, except that a case of formats alone is allowed: three accounts,
  or accounts and statements. Short questions may stand beside long ones ("which side does the balance fall on?"
  before "prepare the account"). `casePartsProblem` in `src/generators/engine.ts` is the rule, and the harness applies it.
- **The task line is the whole prompt of a format**, one line, with no figure of the case in it: the statement, the
  business and the date, and what the rows rely on ("enter each item at its net figure", "in the order of
  liquidity"). The student sees "Question 2 of 3 in this case" above it, so do not number the parts yourself.
- **A later part may start from what an earlier part ends on**, and only from that: the Profit and Loss Account
  starts from the gross profit, the Balance Sheet from the net profit. Say so in the task ("starting from the gross
  profit of the Trading Account") and do **not** print that figure in the case text. In a level the student has just
  seen the earlier part marked and the correct account under it; in a mock paper nothing is checked between the
  parts, as in the examination. Everything else a part needs is in the case text: state every convention there
  ("There is no other adjustment.", "No capital was brought in during the year.").
- **The case text may be longer** than the 14 lines of an ordinary case (a whole trial balance is about 20): while a
  long part is answered the case stays at the top of the screen and scrolls inside its panel. Keep each line short.
- **Give every long part a `verify`** that works it out another way, from the printed case (`q.data`): read the
  balances back from the text and rebuild the rows; for a Balance Sheet, total the other side too.
- **Marks.** In a level each part is one scored question, right only when every row (or entry) is right, and the
  student sees the review and the correct format before the next part. In a mock paper the case is still a 6-mark
  question, and each part earns a credit from 0 to 1: a format, its rows right less its extra rows (never below
  none), over the rows expected; a set, its entries right over its entries; a short question, 1 or 0. The marks are
  6 times the average credit, to the nearest half mark, so the parts weigh the same however many rows they have
  (`creditMarks` in `src/learning/mockPaper.ts`, `partCredit` in `src/play/mockSitting.ts`). The marked paper states
  the rule under the case and says what each long part earned. A case of short questions is marked as it always was.
- **Time.** A chained case takes 20 to 30 minutes. Nothing timed serves one (see below), and a mock paper gives it
  the minutes of any 6-mark question, so keep a chain to what an examiner would set for six marks.
- **Add a chained case at the end of its stage's list.** The cases of a stage take turns in that order, in the Case
  study level and from paper to paper, so the shorter cases come first and nothing a student has met moves.

## How a case reaches the student

Nothing to wire. A stage that has at least one case gets a level "Case study: <stage title>" at the end of its topic,
after the Look back level (a topic that closes several stages has one such level for each, in the order of
`CASE_STAGES`), and its concept is added to the topic's concepts (so the answers count towards mastery and a
missed question appears on the Mistakes screen). Each play of the level serves one whole case, its questions in order
and all of them scored; the next play serves the next case of the stage, with a new seed. The case text is shown above
every question in a panel the student can fold away. While a format or a set of a chained case is answered that panel
stays at the top of the screen and scrolls inside itself, as the Data panel of a format does: it is the one panel, and
a format of a case has no Data panel. Once the part is checked its review and the correct format are shown, as for a
format that stands alone, before the next part. Nothing else serves a question of a case: not practice, not the
daily challenge or mission, not a Look back level, and no level that lists cases is timed. Only mistake review shows
one again, with its case.

The stage also appears on the **Case studies** screen (`/cases`, reached from Practice and Home), with its title, its
description, how many cases it has, how many the student has finished and their best score. "New case" plays the next
case of the stage (the cases take turns), a case can be chosen by its title, and "Mixed cases" takes one from any
stage. Every stage can be played there from the first day, whatever the learner has passed. Cases played
there are sessions of kind `case` and take their seeds from the practice range (`caseSeed` in
`src/learning/caseStudies.ts`), never from the range of the topic's own Case study level.

A **mock paper** (`/mock`) asks a whole case as its 6-mark question, from a stage whose topic is in that part of the
paper; the 6 marks are shared equally among the questions of the case, to the nearest half mark (a long part of a
chained case earns its share by its rows or entries: see "Chained cases"). The stages of the part that have cases take
the 6-mark turns, every stage of a topic that closes several; the full paper favours the integrated stages
(`favouredStages`), whose case comes first on two papers of three. A stage with no case is never drawn; when no
stage of the part has a case to give, the paper sets a long set of entries or two 3-mark questions instead
(`src/learning/paperBlueprints.ts`, `src/learning/mockPaper.ts`).
A paper is rebuilt from its reference, so a new stage of a topic that a section already draws on would change every
paper of that section. A stage listed in `STAGES_OUTSIDE_PAPERS` (`src/learning/paperBlueprints.ts`) is left out of the
bank papers are set from and is played everywhere else: `incomplete-records-cases` and `computerised-accounting-cases`
are the two. The list stands beside the blueprints and not in one, because a paper carries its blueprint: a new field
there would change every paper too. A unit test pins the hash of the default papers.
Keep titles short: they head the case in the list of a stage and on a marked paper.

A new level changes `src/content/catalogue.generated.ts` (it also lists the stages that have cases, for the pages under
`/cases/play`), and every new case changes `src/content/outline.generated.ts` (the cases of every stage by id and
title, for the Case studies screen): run `npm run catalogue` (or `npm test`) and commit them with your cases.

## What the harness checks

`npx vitest run src/generators/cases.test.ts` runs every case over 100 seeds and names the case, seed and question
that fails. A case must: have 4 to 8 questions of at least two kinds (2 to 5 with a set or a format among them;
formats alone may make a case); give the same questions for the same seed; carry the same case text on every
question; reject fewer than half the seeds on the first attempt; change its text across seeds; and pass the checks
of each kind of question (a balanced entry in known accounts, four options with a reason on each wrong one, a
positive answer with two usable common errors and its working; for a set or a format every check
`docs/authoring-questions.md` lists for that kind, and the case text as the data of a format).

`npm run content:report` prints two whole samples of every case at the end. Read them as an examiner would.

A stage's file may export helpers that other stages import (the integrated stages do). A unit test that puts stand-in
cases in a stage's file keeps its other exports (`vi.mock(path, async (importOriginal) => ({ ...(await
importOriginal<object>()), default: [...] }))`), and a test that needs a stage with no case registers one of its own
(`src/multiStage.integration.test.ts`) rather than counting on a real stage to stay empty.
