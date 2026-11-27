# Authoring questions

Everything for one topic lives in two files you own, and nothing else changes: no screen, no registry, no test.

| What | File |
| --- | --- |
| Question templates (generated questions) | `src/generators/templates/<topic>.ts` |
| Concepts, cards, authored questions, ladder | `src/content/cbse11/<topic>.ts` (Class 11), `src/content/cbse12/<topic>.ts` (Class 12) |

`<topic>` is the topic id from `src/content/courses/cbse11.ts` (`ledger`, `cash-book`, ...) or
`src/content/courses/cbse12.ts` (`partnership-fundamentals`, `share-capital`, ...). Both files already exist for every
topic of both courses and are already registered. A topic becomes playable ("available") as soon as its pack has at
least one level; until then it keeps its "Coming soon" / "Planned" label and no screen, route or practice mode sees it.
What Class 12 adds (its accounts, a ratio and a "times" answer, accounts in columns, statements in parts) is in the
sections below where it belongs, and gathered under "Class 12" near the end.

Worked examples: `templates/accounting-equation.ts` (mcq and numeric), `templates/journal-entries.ts` (journal, and
sets of entries at its end), the ends of `templates/ledger.ts` and `templates/trial-balance.ts` (accounts and
statements the student prepares),
`cbse11/accounting-equation.ts` (a pack with a ladder). Helpers and their doc comments: `src/generators/authoring.ts`.

## A template is ~15 lines

Draw values from `rng`, return `null` to reject an awkward seed (the engine retries the same seed with another random
stream, up to 40 times, so the id keeps its seed), and make every wrong answer a **named real mistake**.
Amounts are paise (a rupee value times 100); `amount(rng, min, max, step)` picks a round one and `formatINR` prints it
with Indian grouping. Add the template to the array in your topic file.

**mcq**: the right option's text, 3+ distractors `{ text, why }`, an explanation. `why` is what the learner reads when
they pick that option, so it names the mistake ("Took rent paid as an income."), not the correction. The engine shuffles
the options from the seed and keeps three distractors, so list more than three where you can.

```ts
mcqTemplate({
  id: 'ae-effect', topicId: 'accounting-equation', conceptId: 'ae-effects', difficulty: 'easy',
  generate: (rng) => {
    const x = formatINR(amount(rng, 5000, 90000, 5000));
    return {
      prompt: `The owner withdraws ${x} in cash for personal use. What happens to the accounting equation?`,
      correct: `Assets and capital both decrease by ${x}`,
      distractors: [
        { text: `Assets and liabilities both decrease by ${x}`, why: 'Treated the withdrawal as repaying a debt.' },
        { text: `Assets and capital both increase by ${x}`, why: 'Read the withdrawal as money coming in.' },
        { text: `One asset increases and another decreases by ${x}`, why: 'Thought only the form of the assets changes.' },
      ],
      explanation: 'Drawings reduce capital and cash goes out: assets and capital fall together.',
    };
  },
});
```

**numeric**: `unit` is `'rupees'` (answer in paise), `'number'` (a plain integer), `'percent'` (hundredths: 12.5% is
1250), `'times'` or `'ratio'` (the last two are below, under "A ratio and a number of times"). Give
`commonErrors: [{ value, why }]` (at least two; a learner who types one is told its `why`) and the working as
an array of lines. Return `null` if the answer would not be a clean positive integer.

```ts
numericTemplate({
  id: 'ae-capital', topicId: 'accounting-equation', conceptId: 'ae-equation', difficulty: 'easy', unit: 'rupees',
  generate: (rng) => {
    const assets = amount(rng, 200000, 900000, 10000), liabilities = amount(rng, 50000, 150000, 10000);
    return {
      prompt: `Assets are ${formatINR(assets)} and liabilities are ${formatINR(liabilities)}. What is the capital?`,
      answer: assets - liabilities,
      commonErrors: [
        { value: assets + liabilities, why: 'Added the liabilities instead of deducting them.' },
        { value: assets, why: 'Forgot to deduct the liabilities.' },
      ],
      explanation: ['Capital = Assets - Liabilities.', `${formatINR(assets)} - ${formatINR(liabilities)} = ${formatINR(assets - liabilities)}.`],
    };
  },
});
```

### A ratio and a number of times

**`unit: 'ratio'`** asks for a ratio of two to four partners. The answer, and every common error, is the ratio as its
terms, **in the order the prompt names the partners** and **in lowest terms**: `answer: [5, 3, 2]` is 5:3:2. It is
never one number. The student gets a box for each term (the colons are on the screen, so a phone's number pad is
enough), and 10:6:4 is as right as 5:3:2; 3:5:2 is wrong. The prompt must name the partners in the order wanted
("Find the new ratio of Asha, Bimal and Chitra."). `lowestTerms([20, 12, 8])` (from `authoring.ts`) reduces a ratio,
and the engine refuses an answer that is not reduced. A common error with another number of terms, or one that
reduces to the answer, is dropped like any other repeat, so give three or four.

```ts
numericTemplate({
  id: 'adm-new-ratio', topicId: 'admission-of-a-partner', conceptId: 'adm-ratios', difficulty: 'medium', unit: 'ratio',
  generate: (rng) => {
    const [x, y] = rng.pick([[3, 2], [5, 3], [2, 1]]), n = rng.pick([4, 5, 6]);
    const answer = lowestTerms([x * (n - 1), y * (n - 1), x + y]);
    return {
      prompt: `Asha and Bimal share profits in the ratio ${x}:${y}. Chitra is admitted for a 1/${n} share, taken from them in their old ratio. Find the new ratio of Asha, Bimal and Chitra.`,
      answer,
      commonErrors: [
        { value: [x, y, 1], why: 'Kept the old ratio and gave the new partner one share, without reducing the old shares.' },
        { value: lowestTerms([y * (n - 1), x * (n - 1), x + y]), why: 'Wrote the shares of the two old partners the wrong way round.' },
        { value: [1, 1, 1], why: 'Shared the profit equally among the three.' },
      ],
      explanation: [`Asha and Bimal keep ${n - 1}/${n} between them, in the ratio ${x}:${y}.`, `New ratio = ${answer.join(':')}.`],
    };
  },
});
```

**`unit: 'times'`** is for "x : 1" and "times" answers: a current ratio of 2.5 : 1, an inventory turnover of 4.8 times.
The answer is in **hundredths**, like a percent: 2.5 is `250`, 4.8 is `480`, 0.75 is `75`. The student types 2.5 (a
"times" or ": 1" after it is taken as read). **It is exact: nothing near the answer is right.** So choose figures that
come out exact to two decimal places (current liabilities of ₹2,00,000 and a ratio of 2.5), and reject the seed
otherwise; where a question cannot avoid rounding, say "to two decimal places" in the prompt and round the answer
yourself. Common errors are hundredths too.

```ts
numericTemplate({
  id: 'ar-current-ratio', topicId: 'accounting-ratios', conceptId: 'ar-liquidity', difficulty: 'easy', unit: 'times',
  generate: (rng) => {
    const liabilities = amount(rng, 100000, 400000, 20000), ratio = rng.pick([125, 200, 250, 400]);
    const assets = (liabilities * ratio) / 100;
    return {
      prompt: `Current assets are ${formatINR(assets)} and current liabilities are ${formatINR(liabilities)}. Find the current ratio. (For 2.5 : 1 type 2.5.)`,
      answer: ratio,
      commonErrors: [
        { value: 10000 / ratio, why: 'Divided the current liabilities by the current assets.' },
        { value: ratio - 100, why: 'Deducted the current liabilities from the current assets before dividing.' },
      ],
      explanation: ['Current ratio = Current assets ÷ Current liabilities.', `${formatINR(assets)} ÷ ${formatINR(liabilities)} = ${ratio / 100} : 1.`],
    };
  },
});
```

An authored question is written the same way: `{ type: 'numeric', unit: 'ratio', answer: [3, 2, 1], commonErrors: [{ value: [2, 3, 1], why }], ... }`
or `{ type: 'numeric', unit: 'times', answer: 480, ... }`. In a mock paper both are worked questions of 3 or 4 marks, as
any numeric template is.

**journal**: return the prompt and a `Transaction` (see `src/engine/journal.ts`); the engine builds the entry, the
account choices and the explanation. Wrap `journalTemplate` in a small local function as `journal-entries.ts` does.
When no `Transaction` fits (rectifications, adjustments, provisions), state the entry yourself: give `lines` and
`explanation` (one step per line) instead of `tx`. The engine rejects lines that do not balance, name an unknown
account or have a non-positive amount. `distractorAccounts` are accounts a student might wrongly pick; the choices
offered are the entry's accounts, those, always `cash` and `bank`, and others up to the usual count.

```ts
journalTemplate({
  id: 'rect-rent-salaries', topicId: 'rectification-of-errors', conceptId: 'rect-one-sided', difficulty: 'medium',
  generate: (rng) => {
    const a = amount(rng, 1000, 9000, 500);
    return {
      prompt: `Rent of ${formatINR(a)} paid in cash was wrongly debited to Salaries A/c. Pass the rectifying entry.`,
      lines: [{ accountId: 'rent', side: 'Dr', amount: a }, { accountId: 'salaries', side: 'Cr', amount: a }],
      explanation: ['Salaries A/c was debited by mistake, so it is credited.', 'Rent A/c should have been debited.'],
      distractorAccounts: ['wages'],
    };
  },
});
```

Party accounts are written `debtor(name)` / `creditor(name)` (from `src/engine/accounts.ts`, ids `debtor:Mohan`). A
partner's accounts, debentures of a rate and a vendor are written the same way: see "Chart of accounts".

**`computed: true`** (a field of the template next to `id`, `difficulty`, ...) says the student has to work the amount out:
the prompt gives the base figures (a cost, a rate, a year) but not an amount of the entry itself. Without it the harness
requires the prompt to show at least one amount of the entry, which catches a prompt that forgot the numbers; with it
that check is skipped. Use it for depreciation charges, provisions, adjustments and the like, and put the derivation
in `explanation`.

```ts
journalTemplate({
  id: 'dep-charge', topicId: 'depreciation', conceptId: 'dep-straight-line', difficulty: 'medium', computed: true,
  generate: (rng) => { /* prompt: cost and rate; lines: the depreciation charge, worked out here */ },
});
```

## A set of entries ("Journalise the following transactions")

`journalSetTemplate` makes one question that asks for several entries: one business, three to eight dated
transactions, one entry for each, written in one journal. Return the `opening` line and the `transactions` in date
order; each has its `date` ("5 April"; add the year only when a set runs past December), its `text`, its entry as
`lines` and its `explanation` steps. The engine checks every entry as it checks a single direct entry, and builds one
list of account choices for the whole set (`distractorAccounts` adds to it).

```ts
journalSetTemplate({
  id: 'je-set-first-week', topicId: 'journal-entries', conceptId: 'je-sets', difficulty: 'easy',
  generate: (rng) => {
    const capital = amount(rng, 200000, 600000, 50000), goods = amount(rng, 40000, 90000, 5000), rent = amount(rng, 3000, 9000, 500);
    const [d1, d2, d3] = setDays(rng, 3, 1, 7); // three different days from the 1st to the 7th, in order
    return {
      opening: 'Asha opened Asha Book House, a bookshop in Pune, in April. Every dealing of the first week was in cash.',
      transactions: [
        { date: `${d1} April`, text: `Asha started the business with cash of ${formatINR(capital)}.`,
          lines: [{ accountId: 'cash', side: 'Dr', amount: capital }, { accountId: 'capital', side: 'Cr', amount: capital }],
          explanation: ['Cash comes in: Cash A/c is debited.', 'It is capital: Capital A/c is credited.'] },
        { date: `${d2} April`, text: `Bought books for resale for ${formatINR(goods)}.`, lines: [/* ... */], explanation: [/* ... */] },
        { date: `${d3} April`, text: `Paid ${formatINR(rent)} as rent of the shop.`, lines: [/* ... */], explanation: [/* ... */] },
      ],
    };
  },
});
```

- **One story.** The same business and parties throughout; a creditor is paid after the purchase from that creditor, a
  return follows its sale, a settlement is for what is still owed, cash and bank do not run out. A name is a debtor or
  a creditor, never both (the picker shows a party by name). Reject a seed that breaks the story (`return null`), and
  give the template `verify: setHolds()`, which walks the finished entries again (`storyHolds` and `setHolds` in
  `authoring.ts`; pass `{ cash, bank }` when the set starts the business, so that cash and bank are followed too).
- **Vary the structure, not only the amounts**: which transactions occur, and in what order, must change with the seed.
  `interleave(rng, [threadA, threadB])` merges threads of a story in an order drawn from the seed, keeping each thread's own.
- **State every convention in the opening line**: "Every dealing was in cash.", "Cheques received are paid into the
  bank the same day.", whether GST is intra-state or inter-state. A transaction's text is shown beside its entry, so it
  must be complete without the others, apart from what the story carries ("Paid Mohan the amount due").
- **Only transactions.** An order received, a quotation or an appointment has no entry, so it is never one of the
  transactions; narrations are not asked for.
- **The difficulty decides the length**, because a mock paper gives a set its marks by it: `easy` 3 or 4 transactions
  (3 marks), `medium` 4 or 5 (4 marks), `complex` 6 to 8 (6 marks). The marks are shared among the entries: marks
  times entries right, divided by the entries, to the nearest half mark.
- Whole rupees in every line. The student is right only when every entry is right, and is told which were.

Two optional things for sets that are not a journal of dated transactions (rectifying, adjusting or closing entries):

- **`task`** (beside `opening`): the first line of the prompt, in place of "Journalise the following transactions.":
  `task: 'Pass the rectifying entries.'`. It is what the screen, the Mistakes list, a marked paper and the content
  report show as the question.
- **`label`** (on a transaction, in place of `date`): what an item without a date is called, shown wherever the date
  would be: `{ label: 'Error 1', text: '...', lines: [...], explanation: [...] }`, or `'(a)'`, `'(b)'`. Give `date` or
  `label`, never both. Only real dates are read as dates and kept in order; labelled items stand in the order you
  write them, and dated and labelled items may share a set. When every item falls on one day, plain dates work too:
  equal dates are in order. No two items may have the same `text`, whichever they carry.

Put sets on levels of their own with `sets` in `buildLadder` (or `setLevels(topicId, firstOrder, [...])` for a ladder
written by hand): `sets: [{ title: 'Journalise a set of transactions', description: '...', templateIds: [...], count: 3 }]`.
These levels come after every other one and have ids of their own (`<topicId>-journal-sets-<n>`), so adding them
renumbers nothing. Do not list a set in the practice, mixed or challenge levels. Practice and marathon serve the sets a
level lists like any other template of their concept.

**A bank of facts.** For the theory a syllabus names line by line (the features of depreciation, the kinds of voucher,
which entity follows Ind AS), `factsTemplate({ id, topicId, conceptId, difficulty, facts })` draws one whole mcq per
seed from `facts` (each a prompt, the right option, three or more named mistakes and the explanation) and comes with
its own `verify`, which finds the question again in the bank by its prompt and checks its options against it. Build
the facts from scenario lists where you can (`WRITE_OFF` in `templates/depreciation.ts`), so the bank is large.

**Assertion and Reason.** The one-mark format of the board is a bank of facts too, one template for a topic, with the id
`<prefix>-assertion-reason`, of medium difficulty: `assertionReasonTemplate({ prefix, topicId, conceptId, items })`
(`src/generators/assertionReason.ts`), or `factsTemplate` with `facts: assertionReasonFacts(items)` (`authoring.ts`).
Each item gives the two statements, which of the four answers is right, why A is true or false, why R is true or false
and, when both are true, how R makes A so or what the reason for A really is. The prompt, the board's four options in
the board's order, the mistake behind each wrong option and the explanation are made from these. Give at least 10 items,
about 4 / 2 / 2 / 2 across the answers, a third or more on a small situation or figures. Consecutive seeds serve
different items, so a level of one template does not repeat an item. It goes on a level `<topicId>-assertion-reason`
through `laterLevels`, last in the topic. The id keeps it out of the mock papers, the worksheets and the Look back levels
(`isAssertionReason`), so a bank can grow without moving any of them.

Optional on every kind: `hints` (two; sensible defaults exist), `version` (default 1) and
`verify(question)`: an **independent** check that recomputes or re-reads the answer another way (e.g. the two amounts in
the prompt and the answer satisfy the equation). A question that fails `verify` is never served. Change what a seed
makes only by raising `version`; ids are `gen:<id>:<version>:<seed>` and stored attempts point at them.

## An account to prepare ("Prepare Rao & Co.'s account and balance it")

`accountTemplate` makes a question in which the student fills in a two-sided account, row by row: a ledger account, a
cash book, an asset or provision account, a Trading and Profit and Loss Account, a Balance Sheet. It is one format,
set up by what you return:

- **`task`**: one line, the whole prompt. Say in it everything the rows rely on: the date the account is balanced
  on, whether the balance is brought down, "Show purchases net of returns."
- **`data`**: what the student works from, the business and the period and then one transaction or balance to a line.
  It is shown in a panel that stays on screen beside the rows, not in the prompt, so it may be long.
- **`title`**: what heads the account, "Rao & Co. A/c".
- **`left`** and **`right`**: the two sides, each `{ title, prefix, rows, below }`. `drSide(rows, below)` and
  `crSide(rows, below)` give "Dr" with "To" and "Cr" with "By"; a Balance Sheet gives
  `{ title: 'Liabilities', rows }` and `{ title: 'Assets', rows }` with no prefix. The student never types "To" or "By".
- **a row**: `{ date, label, amount }`. `label` is the particulars without "To" or "By" ("Sales A/c", "Balance c/d").
  The date is shown in the solution only: the student does not type dates. `details` are lines shown under the
  particulars in the solution ("Less: Returns ₹2,000"); the student enters the net figure, and the task must say so.
- **closing rows** (balance c/d, gross profit c/d, net profit transferred) are rows like any other with
  `closing: true`. The student enters them; the screen never fills them in or says what they should be.
- **`below`**: the rows under the totals of an account that is continued, the balance brought down.
- **`broughtDown: true`**: the task asks for the balance to be brought down. The place for it is then shown under the
  totals whether or not the answer has a balance, so the screen does not give away that none is left (a Suspense
  account that is cleared). `ledgerSides` and `cashBookSides` set it whenever they are given `reopenOn`; without it
  the place is shown only when there are `below` rows.
- **`ref`** (on a row): what the row refers to in the data, shown beside it in the solution and never typed: `ref: '(a)'`
  for the row of a Suspense account that puts error (a) right. Keep `date` for dates.
- **`also`** (on a row): other wordings of the particulars that are just as right, `also: ['Balance b/d']` on the
  "Difference in trial balance" a Suspense account opens with. They are offered among the particulars, the row is
  right under any of them (with its amounts, in its own list), the review ticks it under the name the student chose,
  and the solution shows `label`. Use it only where an examiner would accept the second wording as it stands; a
  wording that is a mistake stays a distractor. The engine refuses an alternative that is the label, or an
  alternative, of another row of the same list with the same amounts (nothing would tell the two apart), and an
  alternative is not a distractor: two labels that no row accepts are still needed. The rows below the totals are a
  list of their own, so "Balance b/d" may be other wording for a row above the totals and the name of the balance
  brought down below them. `verify` should say which rows have one.
- **`later`**: for an account kept over several periods ("Prepare Machinery A/c for the first three years"), the
  periods after the first, each `{ title, left, right }`; `left` and `right` of the account are then its first period
  (`periodTitle` names it). Every period has its own closing row and must agree on its own; a later period opens with
  "Balance b/d" as an ordinary row, which the student enters. Rows are matched within their period, so each year may
  have the same "By Depreciation A/c". The screen shows the periods one under another, each with its totals. At
  most 4 periods and 24 rows in all. `ledgerPeriods(entries, accountId, closings, opening)` builds all of it from
  dated entries (dates with their year) and the balancing dates:
  `...ledgerPeriods(entries, 'machinery', [{ closeOn: '31 March 2025', reopenOn: '1 April 2025', title: 'Year ended 31 March 2025' }, { closeOn: '31 March 2026' }])`.
- **`columns`**: leave it out for one amount column. A cash book with cash and bank columns gives
  `columns: CASH_BOOK_COLUMNS` and every row `amounts: [cash, bank]` (0 where a column is blank), with
  `contra: true` on a contra entry (the solution marks it "C"). An account may have up to four amount columns:
  partners' capital accounts are written in columns, one for each partner (next section).
- **`distractors`**: particulars a student might wrongly pick, offered beside those of the rows. At least two that no
  row uses: the account itself, "Balance b/d" where c/d is meant, the account of a transaction that does not belong.
- **`explanation`**: the working, one step per line, shown under the correct account.

Derive the rows from journal entries instead of adding figures by hand (`src/engine/books.ts`):
`accountOf(entries, accountId, opening)` writes one account up from dated entries (each posting with its date, the
opposite account as its particulars, the split of a compound entry, and the balance), and `ledgerSides(view,
{ closeOn, reopenOn })` turns it into the two sides, balanced, and brought down when `reopenOn` is given.
`cashBook(entries, opening)` with `cashBookSides` does the same for a cash book. Entries that do not name the account
give nothing, so "these are the month's transactions; the question is Purchases A/c" is a few lines:

```ts
accountTemplate({
  id: 'led-fmt-supplier', topicId: 'ledger', conceptId: 'led-formats', difficulty: 'easy',
  generate: (rng) => {
    const bought = amount(rng, 20000, 60000, 1000), paid = amount(rng, 5000, 15000, 1000);
    const rao = creditor('Rao & Co.');
    const entries = [
      { date: '4 April', lines: [{ accountId: 'purchases', side: 'Dr', amount: bought }, { accountId: rao, side: 'Cr', amount: bought }] },
      { date: '18 April', lines: [{ accountId: rao, side: 'Dr', amount: paid }, { accountId: 'cash', side: 'Cr', amount: paid }] },
    ];
    const data = `Asha Traders buys from Rao & Co. on credit.\n4 April: Bought goods for ${formatINR(bought)}.\n18 April: Paid ${formatINR(paid)} in cash.`;
    kept.keep(data, entries); // const kept = keepFor<DatedEntry[]>() beside the template, for verify
    return {
      task: "Prepare Rao & Co.'s account in the books of Asha Traders for April and balance it on 30 April.",
      data,
      title: 'Rao & Co. A/c',
      ...ledgerSides(accountOf(entries, rao), { closeOn: '30 April' }),
      distractors: ['Rao & Co. A/c', 'Balance b/d', 'Bank A/c'],
      explanation: ['The purchase is credited: Rao & Co. is owed more.', 'The payment is debited.', 'The credit side is larger, so the balance is carried down on the debit side.'],
    };
  },
  verify: (q) => { /* kept.of(q.data), then post(...) and balanceOf(...): the closing row is that balance */ },
});
```

- **Marking.** The rows of a side are matched as a collection, by particulars and amounts: their order is not marked.
  The answer is right only when every expected row is there with its amounts on its side and there is no other row.
  The student is told how many rows were right, which were missing, wrong or on the wrong side, and which should not
  be there, and is shown the account as an examiner expects it.
- **No two rows of one side may have the same particulars and the same amounts**, since nothing would tell them apart
  (dates are not typed): use each account once on a side, or reject the seed. An `also` of a row counts as its
  particulars here. The engine also refuses sides that do
  not agree column by column, an amount that is not a positive whole number of rupees, a row without particulars,
  fewer than three rows and fewer than two spare distractors.
- **Vary the structure**: which transactions occur, in what order, with or without an opening balance, which account
  is asked for. Reject a story that cannot happen (a payment of more than is owed, cash that runs out).
- **`verify` works the format out another way.** `keepFor` keeps the entries `generate` used; `verify` reads them back
  and re-derives the balance with `post` and `balanceOf` (or `trialBalance`), where `generate` used `accountOf`.
- **The difficulty decides the marks** in a mock paper: easy and medium formats are 4-mark questions, complex ones
  6-mark questions. The marks are shared among the expected rows: marks times the rows that count, divided by the
  rows expected, to the nearest half mark. The rows that count are the right rows less one for every extra row.

### Partners' accounts in columns

The capital accounts of the partners of a firm (and their current accounts) are written side by side, a column for
each partner: `columns: partnerColumns(['Asha', 'Bimal', 'Chitra'])` gives "Asha (₹)", "Bimal (₹)", "Chitra (₹)", and
every row `amounts` with one figure for each partner, 0 where the row has none for that partner. Two to four
partners. Every column agrees on its own, and each has its own balance c/d and b/d: the closing row carries the
balance of every partner whose account has a credit balance, and a partner with a debit balance (a current account
that is overdrawn) gets a closing row on the other side. The student sees one side at a time at every width, with
the amounts of a row under its particulars, each under the partner's name.

Build it from the entries, as `cashBookSides` does for cash and bank: `columnarAccount(entries, accountIds, opening)`
(in `src/engine/books.ts`) posts each entry to the column of the account it names, and `columnarSides(view, closing)`
(in `authoring.ts`) balances every column. In the particulars a partner's own account loses the partner's name, so the
drawings of all the partners are one row, "To Drawings A/c" (`columnLabel`; pass your own `labelOf` to name accounts
otherwise). Postings of one day under one name share a row; a second posting of the same partner under the same
name on the same day starts a row of its own.

```ts
accountTemplate({
  id: 'pf-fmt-capitals', topicId: 'partnership-fundamentals', conceptId: 'pf-formats', difficulty: 'medium',
  generate: (rng) => {
    const names = ['Asha', 'Bimal', 'Chitra'], capitals = names.map(partnerCapital);   // ids capital:Asha, ...
    const opening = names.map(() => amount(rng, 200000, 600000, 50000)), drawn = names.map(() => amount(rng, 20000, 60000, 5000));
    const share = [5, 3, 2].map((s) => s * amount(rng, 10000, 30000, 2000));            // reject or fix so the shares fit the ratio
    const entries: DatedEntry[] = [
      ...names.map((name, i) => ({ date: '31 March 2026', lines: [{ accountId: capitals[i], side: 'Dr', amount: drawn[i] }, { accountId: partnerDrawings(name), side: 'Cr', amount: drawn[i] }] })),
      { date: '31 March 2026', lines: [{ accountId: 'profitAndLossAppropriation', side: 'Dr', amount: share[0] + share[1] + share[2] }, ...capitals.map((accountId, i) => ({ accountId, side: 'Cr', amount: share[i] }))] },
    ];
    const view = columnarAccount(entries, capitals, { date: '1 April 2025', balances: opening.map((amount) => ({ side: 'Cr', amount })) });
    return {
      task: "Prepare the partners' capital accounts in columns for the year ended 31 March 2026 and bring the balances down on 1 April 2026.",
      data: '...the firm, that capitals are fluctuating, the ratio, the opening capitals, the drawings, the profit...',
      title: "Partners' Capital Accounts",
      columns: partnerColumns(names),
      ...columnarSides(view, { closeOn: '31 March 2026', reopenOn: '1 April 2026' }),
      distractors: ['Current A/c', 'Interest on Capital A/c', 'Cash A/c'],
      explanation: ['Each partner has a column.', 'Drawings are debited; the share of profit is credited.', 'The balance of each column is carried down on the debit side.'],
    };
  },
  verify: (q) => { /* each partner's closing balance, worked out from the figures another way */ },
});
```

Everything else about an account applies: no two rows of one side with the same particulars and the same figures in
every column, closing rows entered by the student, `broughtDown`, `later` for several years. A figure typed in the
wrong partner's column is told as "Wrong column". The marks are shared among the rows, as for any account.

## A statement to prepare (a Trial Balance, a Bank Reconciliation Statement)

`statementTemplate` makes one list of rows with one or two named amount columns and their totals: a Trial Balance
(`columns: ['Debit (₹)', 'Credit (₹)']`, `totalsAgree: true`), a Bank Reconciliation Statement (plus and minus
columns and a `final` figure), a Purchases Book or a statement of capital. `task`, `data`, `title`, `distractors`
and `explanation` are as for an account; `heading` heads the particulars column ("Name of account"). A row of a
statement with two columns gives `amounts`, one for each column and 0 where the column is blank; the student types
each amount in the column it belongs in. A row may have `also`, as in an account.

```ts
statementTemplate({
  id: 'tb-fmt-balances', topicId: 'trial-balance', conceptId: 'tb-formats', difficulty: 'easy',
  generate: (rng) => {
    const cash = amount(rng, 5000, 30000, 1000), rent = amount(rng, 2000, 9000, 500);
    return {
      task: 'Prepare the Trial Balance of Ravi Textiles as on 31 March 2026.',
      data: `These balances were taken from the ledger of Ravi Textiles:\nCash in hand: ${formatINR(cash)}\nRent paid: ${formatINR(rent)}\nCapital: ${formatINR(cash + rent)}`,
      title: 'Trial Balance of Ravi Textiles as on 31 March 2026', heading: 'Name of account',
      columns: ['Debit (₹)', 'Credit (₹)'], totalsAgree: true,
      rows: [{ label: 'Cash in hand', amounts: [cash, 0] }, { label: 'Rent paid', amounts: [rent, 0] }, { label: 'Capital', amounts: [0, cash + rent] }],
      distractors: ['Closing stock', 'Suspense A/c'],
      explanation: ['Cash is an asset and rent an expense: both are debit balances.', 'Capital is a credit balance.'],
    };
  },
});
```

- **`totalsAgree: true`**: the two columns must come to the same total, and the engine refuses a statement in which
  they do not. The screen tells the student whether the columns agree, which is arithmetic and not a hint.
- **`final: { label, amount }`**: the figure the statement ends on, which the student works out and types
  ("Balance as per Pass Book"). It counts as one more row. With two columns it must be the difference of their
  totals. A statement has `totalsAgree` or `final`, never both.
- **`final.alternatives`**: other names the final figure might have. When what the statement ends on is part of the
  answer (a balance or an overdraft), give them: `final: { label: 'Overdraft as per Pass Book', amount, alternatives:
  ['Balance as per Pass Book'] }`. The label is then not shown; the student picks it among them as well as typing
  the amount, and the right amount under the wrong name is not right.
- **Up to four amount columns** (an account has at most two): a Purchases Book with `columns: ['Taxable value (₹)',
  'CGST (₹)', 'SGST (₹)', 'Total (₹)']`. On a phone the amounts of a row stand under its particulars, each under the
  name of its column. `totalsAgree` is for two columns only.
- Marking, the rule about twin rows, `verify` and the marks are as for an account. An amount typed in the wrong column
  is told as such.

### A statement in parts: other kinds of column, negative figures, sub-headings, sub-totals, note numbers

A comparative statement, a common size statement, a cash flow statement, a balance sheet and a Statement of Profit
and Loss in the Schedule III form are statements too. Five things, each optional and each leaving an older statement
exactly as it was:

- **A column of another kind.** A name alone (`'2025-26 (₹)'`) is a column of whole rupees that are never negative and
  add up. Give an object for anything else: `{ name: 'Absolute change (₹)', signed: true }` takes negative figures;
  `{ name: 'Percentage change (%)', unit: 'percent', signed: true }` is in percent, **in hundredths** (12.5% is `1250`,
  a fall of 16.67% is `-1667`); `{ name: 'Number of shares', unit: 'number' }` is a plain whole number. `adds` says
  whether the figures of the column add up to a total: left out, it is yes for rupees and numbers and no for a
  percent (give `adds: true` for the percentages of a common size statement, which add up to 100). A percentage is
  exact to two decimal places: choose figures that give that, or say "Give every percentage to two decimal places"
  in the task and round (reject a seed whose third decimal is exactly 5).
- **A column that is given.** A board question prints the figures of the two years of a comparative statement; the
  student works out the totals and the changes. `{ name: '2024-25 (₹)', given: true }` (with `signed`, `unit` or
  `adds` as for any column) prints the figure of every row in that column as soon as the student chooses the row's
  particulars, as text and not in a box: it is not typed, cannot be wrong and earns nothing. A row is right when
  its particulars and its typed figures are, and a row all of whose figures are printed is right when its
  particulars are. `given: false` on a row has its figures worked out in every column all the same (the tax, a line
  the data gives only indirectly). A sub-total is typed in every column, a given one too (the student adds it up),
  unless it says `given: true`; one that is printed whole does not count as a row. A printed figure follows the
  particulars wherever the row is entered, so it says nothing about where the row belongs, and it counts with its
  printed value wherever the engine or the screen adds a column up. The engine refuses `given` on a row or a
  sub-total of a statement that gives no column, two rows of one name that would print different figures, a
  statement in which every figure of every row and sub-total is given, and a given column (or a row that says
  `given`) in an account: only a statement prints figures. Say in the task what is printed. The review report puts
  every printed figure in square brackets and marks a given column "(given)", so the examiner sees what is typed.

  ```ts
  columns: [{ name: '2024-25 (₹)', given: true }, { name: '2025-26 (₹)', given: true }, { name: 'Absolute change (₹)', signed: true }, { name: 'Percentage change (%)', unit: 'percent', signed: true }],
  rows: [
    { label: 'Revenue from operations', amounts: revenue },              // the two years printed, the change typed
    { subtotal: 'Profit before tax', amounts: profit },                  // typed in all four columns
    { label: 'Tax', amounts: tax, given: false },                        // "Tax is 30% of the profit": worked out
    { subtotal: 'Profit after tax', amounts: after },
  ],
  ```

  The whole of such a statement, which passes the harness, is `s12-comparative-given` in `src/testing/class12Topic.ts`.
- **A negative figure** (a decrease, an outflow of cash) is a negative amount in a column that is `signed`:
  `{ label: 'Purchase of machinery', amount: -machinery }`. The student types a minus sign (the box has a "−" button,
  because a phone's number pad has no minus key; brackets are read too) and the solution prints it in brackets, as an
  examination paper does. A nil figure is 0, typed or left blank. Say in the task how a fall is shown ("Show an
  outflow with a minus sign."). `final.amount` may be negative when the first column is signed.
- **Sub-headings and sub-totals** stand among the rows, in the order of the statement: `{ heading: 'A. Cash flows from
  operating activities' }` and `{ subtotal: 'Net cash from operating activities', amount }` (`amounts` with several
  columns). Both are **printed on the screen**: the student enters the rows under each sub-heading and types the
  figure of each sub-total, which counts as a row in the marks; the screen never says what it comes to. The rows
  between two such lines are entered together and matched as a collection (two headings that stand together head
  one list), so **a row entered under the wrong sub-heading is not right** ("Wrong part of the statement"), and the
  same particulars may stand in two parts. Give a sub-total `sum` to have the engine check it in every column that
  adds up: `'section'` (the rows above it back to the last sub-heading: a running total such as "Cash generated from
  operations"), `'block'` (back to the last sub-total: the "Total" of each half of a balance sheet), `'all'` (every
  row above: "Net increase in cash"). Without `sum` it is not checked ("Profit before tax", which is a difference):
  `verify` must work it out. A statement that has a sub-total shows no total of the whole, and `totalsAgree` is for
  a statement of two plain rupee columns without sub-totals.
- **Note numbers.** `noteHeading: 'Note No.'` and `note: '1'` on a row (or a sub-total) give the solution a "Note No."
  column between the particulars and the amounts (with three or four amount columns the note stands beside the
  particulars). It is shown and never typed.

```ts
statementTemplate({
  id: 'fsa-fmt-comparative', topicId: 'financial-statement-analysis', conceptId: 'fsa-formats', difficulty: 'medium',
  generate: (rng) => {
    /* figures of two years for each line, every percentage worked out to two decimal places: [first, second, second - first, percent] */
    return {
      task: 'Prepare the Comparative Statement of Profit and Loss of Sagar Mills Ltd. Give every percentage to two decimal places and show a decrease with a minus sign.',
      data: '...the figures of the two years, one line to a line...',
      title: 'Comparative Statement of Profit and Loss of Sagar Mills Ltd.',
      columns: ['2024-25 (₹)', '2025-26 (₹)', { name: 'Absolute change (₹)', signed: true }, { name: 'Percentage change (%)', unit: 'percent', signed: true }],
      rows: [
        { label: 'Revenue from operations', amounts: revenue },
        { label: 'Other income', amounts: other },                          // fell: [5000000, 4000000, -1000000, -2000]
        { subtotal: 'Total revenue', amounts: income, sum: 'block' },       // checked in the three rupee columns
        { heading: 'Expenses' },
        { label: 'Employee benefits expense', amounts: staff },
        { label: 'Other expenses', amounts: rest },
        { subtotal: 'Total expenses', amounts: expenses, sum: 'section' },
        { subtotal: 'Profit before tax', amounts: profit },                 // a difference: verify works it out
      ],
      distractors: ['Cost of materials consumed', 'Finance costs', 'Depreciation and amortisation expense'],
      explanation: ['Absolute change = figure of 2025-26 less figure of 2024-25.', 'Percentage change = absolute change ÷ figure of 2024-25 × 100.'],
    };
  },
  verify: (q) => { /* every row and sub-total: change = second - first, and the percentage from them */ },
});
```

A cash flow statement is one signed column (`columns: [{ name: 'Amount (₹)', signed: true }]`), three sub-headings, the
sub-totals of each part, "Net increase or decrease in cash and cash equivalents" (`sum: 'all'`), the opening cash as a
row, and `final` for the closing cash. A balance sheet in the Schedule III form is one plain column with
`noteHeading`, the major heads and sub-heads as sub-headings, the line items as rows and "Total" twice as sub-totals
(`sum: 'all'` and then `sum: 'block'`). Worked examples of all three, which pass the harness, are in
`src/testing/class12Topic.ts` (`s12-comparative`, `s12-cash-flow`, `s12-balance-sheet`). Keep a statement to 30 rows,
and remember that it takes a student longer than an account of the same length. The difficulty decides the marks as
for any format (easy or medium 4, complex 6), shared among the rows and the sub-totals.

A set of entries, an account or a statement can also be one question of a case study, prepared from the case text
with no data of its own: the long question of the examination, Trading Account then Profit and Loss Account then
Balance Sheet from one trial balance, is such a case. See "Chained cases" in `docs/authoring-cases.md`.

Put formats on levels of their own with `formats` in `buildLadder` (or `formatLevels(topicId, firstOrder, [...])` for a
ladder written by hand): `formats: [{ title: 'Prepare an Account', description: '...', templateIds: [...], count: 2 }]`.
These levels come after the levels of sets and have ids of their own (`<topicId>-formats-<n>`), so adding them
renumbers nothing; they pass at one format of two wholly right. A format takes about ten minutes: `buildLadder`
refuses one in a practice, mixed or challenge level, and Look back never asks one. Give the formats a concept of their
own in the pack ("Preparing a ledger account"). Once a level of formats is passed, smart practice, fresh questions,
topic practice, marathon and the review of mistakes serve its formats like any other template; the daily challenge and
the daily mission never do.

## Chart of accounts

Use these ids in `lines` and `distractorAccounts` (`src/engine/accounts.ts`; a name in the entry shows as "<name> A/c").
Contra accounts (marked *) increase on the opposite side and say what they `reduces`.

- Assets (Dr): cash, bank, furniture, machinery, inputCGST, inputSGST, inputIGST, land, building, vehicles, computers,
  officeEquipment, investments, stock, billsReceivable, prepaidExpenses, accruedIncome, pettyCash, looseTools, goodwill,
  patents, insuranceClaimReceivable; contra-assets (Cr): provisionForDepreciation*, provisionForDoubtfulDebts*.
- Liabilities (Cr): outputCGST, outputSGST, outputIGST, bankLoan, loan, billsPayable, outstandingExpenses,
  incomeReceivedInAdvance, bankOverdraft.
- Capital (Cr): capital, generalReserve; drawings* (Dr).
- Incomes (Cr): sales, discountReceived, commissionReceived, interestReceived, rentReceived, dividendReceived,
  badDebtsRecovered, profitOnSaleOfAsset, miscellaneousIncome, interestOnDrawings; salesReturn* (Dr).
- Added to Class 11 later, in `LATER_CLASS11_ACCOUNTS`: staffWelfare ("Staff Welfare Expenses A/c", an expense:
  goods given to the staff, `Staff Welfare Expenses A/c Dr; To Purchases A/c`). Like the late accounts of Class 12 it
  is named by an entry and never offered as a filler choice or drawn from the chart by a generator (name it in
  `distractorAccounts` where it is a likely slip), so adding it moved no question. Added the same way for the final
  accounts with adjustments: managersCommission ("Manager's Commission A/c", an expense) and
  outstandingManagersCommission ("Outstanding Manager's Commission A/c", a liability), the board's form of an unpaid
  commission, and provisionForDiscountOnDebtors* ("Provision for Discount on Debtors A/c", reduces the debtors:
  `Profit and Loss A/c Dr; To Provision for Discount on Debtors A/c`).
- Expenses (Dr): purchases, rent, salaries, wages, stationery, discountAllowed, carriageInwards, carriageOutwards, freight,
  powerAndFuel, manufacturingExpenses, insurance, electricity, telephone, advertisement, repairs, postage,
  travellingExpenses, bankCharges, interestPaid, commissionPaid, badDebts, depreciation, lossByFire, lossByTheft,
  lossOnSaleOfAsset, charity, generalExpenses, tradeExpenses, legalCharges, auditFees, interestOnCapital;
  purchasesReturn* (Cr).
- Temporary, either side: suspense, assetDisposal, profitAndLoss ("Profit and Loss A/c"), trading ("Trading A/c")
  (asset-type; explained without saying which way they move).

### The accounts of Class 12

They are in lists of their own (`PARTNERSHIP_ACCOUNTS`, `COMPANY_ACCOUNTS`), so a Class 11 entry is never offered one.
A Class 12 entry may use any Class 11 account as well (cash, bank, machinery, stock, investments, goodwill,
generalReserve, profitAndLoss, bankLoan, interestOnCapital, interestOnDrawings, provisionForDoubtfulDebts, ...). The
filler choices of an entry come from the chart of its unit: a partnership topic is offered partnership accounts, a
company topic company accounts, each with a few general ones; name the likely slips in `distractorAccounts` as always.

- **A partner's own accounts** are made from the partner's name, as a debtor's is (import the helpers from
  `@/engine/accounts`): `partnerCapital('Asha')` is "Asha's Capital A/c" (id `capital:Asha`), `partnerCurrent('Asha')`
  "Asha's Current A/c" (`current:Asha`), `partnerDrawings('Asha')` "Asha's Drawings A/c" (`drawings:Asha`),
  `partnerLoan('Asha')` "Asha's Loan A/c" (`partnerLoan:Asha`: a loan to the firm, a liability; use it for a loan from a
  partner's relative too), `loanToPartner('Asha')` "Loan to Asha A/c" (`loanTo:Asha`: an asset), `executor('Asha')`
  "Asha's Executor's A/c" (`executor:Asha`). Use the name exactly as the prompt writes it.
- **Partnership, one name in every firm**: profitAndLossAppropriation, revaluation, realisation, premiumForGoodwill (all
  four temporary: either side), workmenCompensationReserve, investmentFluctuationReserve (reserves, Cr), partnersSalary,
  partnersCommission (appropriations, Dr), interestOnPartnersLoan (a charge, Dr), advertisementSuspense,
  deferredRevenueExpenditure (fictitious assets, Dr), debtors ("Debtors A/c"), creditors ("Creditors A/c"),
  providentFund ("Employees' Provident Fund A/c"), workmenCompensationClaim (liabilities).
- **For a partner who retires or dies**: profitAndLossSuspense ("Profit and Loss Suspense A/c", temporary: debited
  with the partner's share of profit from the last balance sheet to the date of death or retirement, and closed to
  Profit and Loss Appropriation A/c at the year end), and interestOnLoan ("Interest on Loan A/c", an expense) for
  the interest on the loan of a retired partner or of a deceased partner's executor
  (`Interest on Loan A/c Dr, To Asha's Loan A/c` or `To Asha's Executor's A/c`). interestOnPartnersLoan stays the
  account for a partner who is still in the firm; Class 11's interestPaid ("Interest Paid A/c") says the interest
  was paid, which it has not been when it is credited to the loan. These two were added after the topic banks were
  begun: an entry names them like any account, and they are never offered as filler choices (name them in
  `distractorAccounts` where they are a likely slip), so adding them moved no question.
- **Companies**: equityShareCapital, preferenceShareCapital; equityShareApplication, equityShareAllotment,
  equityShareFirstCall, equityShareSecondAndFinalCall, equityShareFirstAndFinalCall, equityShareApplicationAndAllotment
  and the same six with `preference` (temporary); callsInArrears* (Dr, reduces paid-up capital), callsInAdvance,
  securitiesPremium, forfeitedShares, capitalReserve; debentureApplication, debentureAllotment,
  debentureApplicationAndAllotment (temporary), discountOnIssueOfDebentures, lossOnIssueOfDebentures (Dr),
  premiumOnRedemptionOfDebentures (Cr), debentureInterest (expense), debentureholders (liability),
  statementOfProfitAndLoss (temporary).
- **Added for companies later** (named by an entry like any account, never offered as filler choices, so adding
  them moved no question): preferenceShareApplicationAndAllotment ("Preference Share Application and Allotment
  A/c", temporary) and debentureSuspense ("Debenture Suspense A/c", temporary: debited when debentures are given as
  collateral security, `Debenture Suspense A/c Dr, To 9% Debentures A/c`, and credited when the loan is repaid).
- **Debentures of a rate**: `debentures(9)` is "9% Debentures A/c" (id `debentures:9`); **a vendor**: `vendor('Sharma Ltd.')`
  is written by name alone, like a creditor (id `vendor:Sharma Ltd.`). Assets and liabilities taken over are named
  one by one (machinery, stock, creditors): there is no "Sundry Assets A/c".

## Cards, authored questions, concepts

In the pack: `concepts` (every template's `conceptId` must be one; practice picks questions by concept), `cards`
(`kind` rule / formula / format / shortcut, each with an example and the common mistake) and `questions` (authored
mcq / true_false / numeric / journal_entry, ids like `ae-q-001`; mcq options may carry a `why`). Authored questions suit
recognition ("which side?") where a generator adds nothing.

## The ladder

`buildLadder(topicId, spec)` (`src/content/ladder.ts`) makes the standard ladder: concept, cards, recognition, easy,
guided, medium, complex, mixed, challenge. You give titles and say which templates go in which practice level; empty
levels are skipped, ids are `<topicId>-level-<n>`. Practice levels are ordered by the difficulty of their templates
(`guided: true` puts one between easy and medium). `mixed` and `challenge` appear only if you give them; they default to
every practice template and to the hardest ones. Ids follow position, so add levels at the end once learners have played.
A challenge level is played against the clock: each question has `timerSecondsPerQuestion` seconds (90 unless you give
another number, which a topic of longer questions should) and is closed as a miss when they run out. A learner can
switch the clock off in Settings ("Challenge timer").

```ts
const levels = buildLadder(T, {
  concept: { title: '...', description: '...', lesson: [{ type: 'text', heading: '...', body: '...' }] },
  cards: { title: '...', description: '...', cardIds: cards.map((c) => c.id) },
  recognition: [{ title: '...', description: '...', questionIds: ['ae-q-001', 'ae-q-002'] }],
  practice: [{ title: '...', description: '...', templateIds: ['ae-capital', 'ae-effect'], count: 6 }],
});
```

A lesson is a list of blocks: `{ type: 'text', heading, body }`; `{ type: 'example', title, lines, note }`, an example
that is a journal entry (`lines` are journal lines, which must balance); `{ type: 'working', title, lines, note? }`, a
worked example that is not an entry (a valuation of goodwill, a ratio worked out, an amount found step by step), its
`lines` one step of working each, numbered on the screen; `{ type: 'table', title, rows, note? }`, a small table (a
statement in short, figures beside what they are): each row is `{ label, amount?, total? }`, the `amount` a string
written as it is to be read (`'₹1,20,000'`, `'(40,000)'`, `'12.5%'`), a row with no amount a sub-heading and a
`total` row ruled off and bold; and `{ type: 'check', questionId }`, an authored question asked straight after the
lesson.

```ts
{ type: 'working', title: 'Goodwill at two years\' purchase of super profit',
  lines: ['Normal profit = ₹5,00,000 × 10% = ₹50,000.', 'Super profit = ₹80,000 − ₹50,000 = ₹30,000.', 'Goodwill = ₹30,000 × 2 = ₹60,000.'],
  note: 'Super profit is what the firm earns above the normal return on its capital.' }
{ type: 'table', title: 'Cash from operating activities, in short',
  rows: [{ label: 'Net profit before tax', amount: '₹2,00,000' }, { label: 'Add: Depreciation', amount: '₹40,000' },
         { label: 'Less: Increase in inventories', amount: '(30,000)' }, { label: 'Cash from operations', amount: '₹2,10,000', total: true }] }
```

**Adding levels to a topic that has been played.** `laterLevels(topicId, levelsSoFar, [{ name, type, title,
description, questionIds?, generate? }])` makes levels that stand after every level the topic has (its sets and
formats too), with ids of their own (`<topicId>-<name>`), so nothing a learner has passed is renumbered. Use it, and
not a new entry in `buildLadder`, for practice added later (the syllabus gaps were added so). List every new authored
question on such a level: a question no level lists is put on a quiz level, which renumbers the levels by position.

Two levels are added after yours, in the registry, and you do not write them. Every topic but the first in the course
ends with a **Look back** level: questions from the topic (the templates of its mixed level) shuffled with questions
from the topics before it, each from a different topic, the ones the learner is weakest in first. A topic that closes a
stage of case studies then has a **Case study** level (`docs/authoring-cases.md`). Their ids do not follow position
(`<topicId>-look-back`, `<topicId>-case-study-<stage>`), so a level you add later does not disturb them. Levels of
sets (`sets`) and of formats (`formats`) stand after your other levels, before these two.

## What happens when a topic gets content

Nothing to wire. A topic whose pack has a level becomes available, in the order of the catalogue of its course
(`src/content/courses/cbse11.ts`, `cbse12.ts`). Two files are generated from the packs and the generators:
`src/content/catalogue.generated.ts` (ids only: the courses, the topics of each, and the playable topics with their
levels; used by the service worker, the profile gate and the root layout, which may import nothing heavier) and
`src/content/outline.generated.ts` (what the screens that list things need of every topic: its concepts, its levels and
the ids of its templates, questions and cards, so that Home, Topics and Practice load no topic's content). Both are
regenerated by `npm run catalogue`, which `npm run dev`, `npm test` and `npm run build` run first; the outline changes
with every template, question or card you add, so commit both with your work. Practice draws from the topics a learner has started (an attempt or a level result), or from the first
topic for a new learner; `/practice/topic/<topicId>` practises one topic. A prompt may hold line breaks: the first line is
the question and the lines after it (a dated list, "Name: ₹amount" per line) are shown one to a line.

A learner is on one course at a time. It is chosen when the learner is made (once more than one course has a topic
to play; before that everyone is on Class 11) and changed in Settings, at once and without losing anything. What a
learner sees is the course's own: topics and levels passed, mastery, mistakes, questions answered and accuracy,
continue learning, the daily mission and challenge, the state of the cards, personal bests, the history of sessions
and the mock papers. Two things are the learner's, whatever the course: XP (so the daily goal counts everything done
that day) and the streak. A topic of one course never looks back on, practises with or sets a paper from the other.

Two more places use what you write, again with nothing to wire:

- **Mock papers** (`/mock`) are assembled from the whole bank by `buildPaper` (`src/learning/mockPaper.ts`) after the
  blueprints in `src/learning/paperBlueprints.ts`: a 1-mark question is an `mcq` template or an authored `mcq` /
  `true_false` question, a 3-mark question a `numeric` or `journal` template of medium difficulty (easy if the topic
  has none), a 4-mark question one of complex difficulty (medium if it has none). So a topic needs templates at each
  difficulty to give a balanced paper, and the difficulty you give a template decides the marks it is asked for. A
  set of entries is a 3-mark question when it is easy, a 4-mark one when medium and a 6-mark one when complex (the
  last 6-mark question of a section that has several is a set, the others are case studies), and its marks are
  shared among its entries. A format (an account or a statement) is a 4-mark question when it is easy or medium and
  a 6-mark question when it is complex, dealt as a set of the same marks is, and its marks are shared among its rows.
  A paper is a pure function of its kind, topic and number: changing what a template makes (a new `version`) changes the
  papers it is on, and a paper sat before then reopens with a note that it has changed.
**Assertion and Reason.** The one-mark format of the board is a bank of facts too, one template for a topic, with the id
`<prefix>-assertion-reason`, of medium difficulty: `assertionReasonTemplate({ prefix, topicId, conceptId, items })`
(`src/generators/assertionReason.ts`), or `factsTemplate` with `facts: assertionReasonFacts(items)` (`authoring.ts`).
Each item gives the two statements, which of the four answers is right, why A is true or false, why R is true or false
and, when both are true, how R makes A so or what the reason for A really is. The prompt, the board's four options in
the board's order, the mistake behind each wrong option and the explanation are made from these. Give at least 10 items,
about 4 / 2 / 2 / 2 across the answers, a third or more on a small situation or figures. Consecutive seeds serve
different items, so a level of one template does not repeat an item. It goes on a level `<topicId>-assertion-reason`
through `laterLevels`, last in the topic. The id keeps it out of the mock papers, the worksheets and the Look back levels
(`isAssertionReason`), so a bank can grow without moving any of them.
- **Marathon** (`/practice/marathon/<topicId>`) serves the templates the topic's levels list, by the same rule as topic
  practice, and mixes the topic's authored questions in (every fifth question, each once in a run). In its Mixed
  setting it takes the difficulty from the template, so mark difficulties honestly.

## Beyond the syllabus

A template or an authored question that teaches more than the syllabus of its course asks carries
`beyondSyllabus: '<one line saying why>'`. For a template, wrap it: `beyondSyllabus(template, reason)` (from
`authoring.ts`); for an authored question, `beyondQuestion(question, reason)` (from `content/beyondSyllabus.ts`, which
also holds the reasons, one for each family, so that every item of a family says the same). What it makes does not
change, and neither does its id. Such an item:

- stands on **no level**: `buildLadder` and `laterLevels` refuse it, `validate-content` fails a level that lists it,
  and `withQuizLevels` leaves such a question off the quiz levels. So practice, the daily challenge and mission, Look
  back and the case-study levels never serve it either;
- is **never set in a mock paper**, which follows the board's pattern (`courseBank` leaves it out of the bank);
- is listed in the **Playground** with a "Beyond the syllabus" chip and its reason (the search finds it by those words);
- is served by a **Marathon** only when the learner turns on "Include beyond-syllabus practice" (`beyond=1` in the
  address, off by default), and then whatever levels have been passed;
- shows the chip and its reason above the question wherever it is played (`beyondSyllabusOf` in `outline.ts`: an
  authored question's own reason, a generated one's template's).

A **rule card** that teaches nothing but such a thing is marked the same way: `beyondCard(card, reason)` (from
`content/beyondSyllabus.ts`) sets `Card.beyondSyllabus`. Its pack leaves it off the card revision level (list
`cards.filter((c) => c.beyondSyllabus === undefined)`), `validate-content` fails a level that lists it, the daily card
revision never hands it out (`isRevisable` in `learning/cardReview.ts`, even a card revised before it was marked), and
the topic page's "Rules and formats" and the quick sheet show it with the chip and the reason. A card that teaches an
in-syllabus point beside it is rewritten to teach that point alone instead.

The families marked so far: interest on drawings of a sole proprietor in Class 11 (`faa-int-drawings`,
`faa-int-drawings-regular`, `faa-closing-capital`, `faa-entry-int-drawings`, `je-interest-drawings`,
`je-interest-drawings-amount`; questions faa-q-013, faa-q-017, je-q-017, je-q-035) and the order of using IGST credit
across heads (`thb-gst-cross-set-off`); cards faa-card-13 and faa-card-14 (interest on drawings, its average period).
Templates that only sometimes draw an item of such a family (a set of adjusting entries, a Profit and Loss Account with
several adjustments, a case) are not marked: they are rewritten without it, with their `version` raised. So the Final
Accounts with Adjustments templates that drew interest on drawings (`faa-fmt-pl-provisions`, `faa-fmt-balance-sheet`,
`faa-set-proprietor-goods`, `faa-set-year-end`, `faa-commission-combined`, `faa-profit-one`, `faa-profit-multi`,
`faa-bs-placement`, `faa-effects-where`, and `faa-fmt-pl-accruals`, whose hint named it) and the cases
`case-fa-full-problem`, `case-fa-chain-proprietor`, `case-fa-chain-full` and
`case-wy-chain-adjusting-entries-final-accounts` are at version 2 with a provision for discount on debtors, interest
on a loan or insurance paid ahead in its place. The chained cases `case-fa-chain-accruals`, `case-fa-chain-debtors`,
`case-fa-chain-loss`, `case-wy-chain-pass-book-final-accounts` and `case-wy-chain-errors-final-accounts` never drew
it, but their hints of the Profit and Loss Account and the Balance Sheet named it: they are at version 2 too.

A case study has no such field. A case that always asks about such a thing is rewritten to ask the same things without
it, with its `version` raised (its other questions keep their figures' logic; the seeds of every other case stay as
they were, which the Class 11 content hash proves). So the three Class 11 cases that always charged interest on
drawings, `case-fa-interest-income` (interest on capital, income due and income in advance), `case-wy-proprietor-capital`
and `case-wy-chain-capital-account`, are at version 2 without it, and stay on their case-study levels and in the mock
papers. Cards faa-card-18 and je-card-19, which set interest on drawings beside interest on capital, now teach interest
on capital alone, and faa-card-19 no longer lists it among the adjustments that raise the profit. Incomplete Records,
a sole proprietor topic too, adjusts the profit found for interest on capital only (its templates that drew interest on
drawings or named it in a hint are at version 2); a new Class 11 item that charges a sole proprietor interest on
drawings is marked beyond the syllabus, or written without it.

## What the harness enforces

`npm test` runs **every** template over 300 seeds and fails with the template id and seed.

- All kinds: deterministic; prompt non-empty with no "undefined"/"NaN"; `verify` passes; the id keeps the seed and
  round-trips through `findQuestion`; fewer than half the seeds rejected on the first attempt, none after 40 retries; the template's topic exists and its concept is in the pack.
- journal (with `tx` or direct `lines`): balanced, positive integer amounts, accounts resolve, the prompt shows an amount
  (not required when the template is `computed: true`).
- journal_set: the number of transactions its difficulty calls for; every entry balanced, in whole rupees, with
  accounts that resolve; a date or a label on every item, and the dates in order; no two transactions with the same
  text; no two account choices with the same name.
- account, statement: one to four amount columns; three to thirty rows, each with a label
  that is on offer (and so is every `also` of it) and whole rupees in every column; no two rows of one list alike
  under any wording they accept; at least two labels on offer that no row accepts; the sides of an account agreeing column by column in every period (at most four periods and 24 rows
  when there are several), the columns of a statement agreeing where it says they do, a final figure that is the
  difference of two columns and whose right name is among those on offer; a one-line task, the data in its own
  field; and its own rows, entered as the answer, marked wholly right. Of a statement in parts: a figure its column
  can hold in every row and sub-total (whole rupees in a rupee column, negative only in a signed one), its
  sub-headings and sub-totals in order with a name each, and a heading for the note numbers where a row has one.
- mcq: 4+ options, unique texts, exactly one correct, every distractor has a non-empty `why` and differs from the answer.
- numeric: positive safe integer answer, 2+ common errors, all distinct from the answer and each other, working lines;
  of unit `ratio`, an answer of two to four whole numbers in lowest terms and common errors that are such ratios of as
  many terms. For every unit: the answer and each common error, typed as a student would type them, read back as
  themselves, the answer is marked right and each common error is told as the mistake it names.

`npm run validate-content` checks packs (ids, levels, authored questions). `npm run check` runs lint, validate-content, the tests and the build.

## Review report

`npm run content:report` prints per topic the templates by kind and difficulty, authored questions, cards, levels, and
three samples per template with the answers, options with their mistakes, and the working. A human reads this to check
the accounting is right; do it before you hand a topic over.

## House rules

- Original wording only. Never copy or closely paraphrase textbook text, past papers or other apps.
- Indian context: ₹, Indian digit grouping (`formatINR`), Indian names, GST (CGST/SGST/IGST) where it is relevant.
- Choose amounts and steps so answers come out as clean whole numbers; reject a seed rather than print an odd figure.
- Every distractor and common error is a real mistake students make, named in `why`. No random nearby numbers.
- Keep to the scope of the course the topic belongs to: no partnership, company or other Class 12 material in a
  Class 11 topic. The scope and the house rules of Class 12 are in `docs/content-plan.md`.
- Ids: lower-case words joined by hyphens, prefixed by the topic (`ae-`, `led-`), never containing `:`. They are unique
  across both courses: every topic, concept, card, question, template and case id.

## Class 12

The second course, `cbse-12-accountancy`, is authored exactly as Class 11 is: two files per topic, nothing to wire.

| Topic id | Suggested id prefix | Unit |
| --- | --- | --- |
| `partnership-fundamentals` | `pf-` | Accounting for Partnership Firms |
| `goodwill` | `gw-` | Accounting for Partnership Firms |
| `change-in-profit-sharing-ratio` | `cpr-` | Accounting for Partnership Firms |
| `admission-of-a-partner` | `adm-` | Accounting for Partnership Firms |
| `retirement-and-death-of-a-partner` | `ret-` | Accounting for Partnership Firms |
| `dissolution-of-partnership` | `dis-` | Accounting for Partnership Firms |
| `share-capital` | `sc-` | Accounting for Companies |
| `debentures` | `deb-` | Accounting for Companies |
| `company-financial-statements` | `fs-` | Analysis of Financial Statements |
| `financial-statement-analysis` | `fsa-` | Analysis of Financial Statements |
| `accounting-ratios` | `ar-` | Analysis of Financial Statements |
| `cash-flow-statement` | `cf-` | Cash Flow Statement |
| `computerised-accounting` | `cas-` | Computerised Accounting (the option of Part B, shown only to a learner who chooses it: `src/content/courseOptions.ts`) |

- Files: `src/generators/templates/<topicId>.ts` (default export: the array of templates) and
  `src/content/cbse12/<topicId>.ts` (default export: the pack, with that `topicId`). Both exist, empty, and are
  registered. Case stages: `src/generators/cases/<stage>.ts` for `partnership-accounts` (topic
  `partnership-fundamentals`, concept `pf-case`), `reconstitution` (`retirement-and-death-of-a-partner`, `ret-case`),
  `dissolution` (`dissolution-of-partnership`, `dis-case`), `company-accounts` (`debentures`, `deb-case`) and
  `analysis` (`cash-flow-statement`, `cf-case`). Do not use a stage's concept id for anything else.
- A learner is on one course at a time. The Look back level of a Class 12 topic draws on the Class 12 topics before
  it and never on Class 11; the first Class 12 topic with levels has none.
- The course is offered to learners as soon as one Class 12 topic has a level, so a topic that is committed with
  levels is live: commit a topic when it is fit to be played.
- Mock papers of Class 12 follow its own blueprints (`src/learning/paperBlueprints.ts`): 1 mark from mcq templates and
  authored mcq / true-false questions, 3 and 4 marks from numeric (ratio and "times" among them) and journal
  templates and from sets and formats, 6 marks from the case stages, a long set or a complex format. So give every
  topic templates at each difficulty, as in Class 11.
- What is new and where it is described: the Class 12 accounts ("Chart of accounts"), a ratio and a number of times
  ("A ratio and a number of times"), partners' accounts in columns, and statements in parts. A sample of each, which
  passes the harness, is in `src/testing/class12Topic.ts`.
- `npm run content:hash` prints a hash of everything the Class 11 generators make; a unit test holds it, so a change
  that alters a Class 11 question fails the tests. Class 12 content does not touch it.
