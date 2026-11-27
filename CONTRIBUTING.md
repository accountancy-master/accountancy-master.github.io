# Contributing to Accountancy Master

Thank you for helping students learn Accountancy. Every kind of help counts: reporting a wrong answer, suggesting a
question, fixing a typo, improving a screen or writing new content.

## Ways to help without writing code

- **Found a mistake in a question, an answer or a lesson?** Open an issue with the *Mistake in the content* form. Give
  the topic and, if you can, the page address, what is wrong and what it should say. Teachers' corrections are
  especially welcome.
- **Have an idea or a question?** Start a thread in [Discussions](https://github.com/accountancy-master/accountancy-master.github.io/discussions).
- **Something does not work?** Open an issue with the *Bug* form: what you did, what you saw, the device and browser.

## Working on the code

You need Node.js 22 and Git.

```bash
git clone https://github.com/<your-account>/accountancy-master.github.io.git
cd accountancy-master.github.io
npm ci
npm run dev        # http://localhost:3000
```

The app is a Next.js static export (React, TypeScript, Tailwind, Dexie for the learner's data in the browser). There
is no server and no login: everything a learner does stays in their own browser. Read [`AGENTS.md`](AGENTS.md) before
changing Next.js code: this version of Next.js differs from older guides.

1. Fork the repository and make a branch for your change.
2. Make the change, with tests. Content changes follow the authoring guides below.
3. Run the checks (next section) and fix what fails.
4. Open a pull request against `main` and fill in its checklist. The same checks run on GitHub; a maintainer reviews
   the change, and once it is merged the site is published by itself.

## Checks

```bash
npm run check          # lint, content validation, unit tests, production build
npm run test:e2e       # browser tests at phone and laptop size (Playwright)
npm run check:release  # everything, including the browser tests on both builds (about an hour)
```

For a small change, `npm run check` and the browser tests of the screens you touched are enough before you open the
pull request; GitHub runs the full set on it.

## Writing content

Questions are made by seeded generators (each checks its own answer with `verify`) and by authored items. Read
[`docs/authoring-questions.md`](docs/authoring-questions.md), [`docs/authoring-cases.md`](docs/authoring-cases.md) and
the house rules in [`docs/content-plan.md`](docs/content-plan.md). In short:

- **Original words only.** Never copy text, questions or figures from NCERT books, CBSE sample papers, marking schemes,
  guides or websites. Content that copies is not accepted.
- **The CBSE syllabus of the year** (2025-26) and the NCERT treatment. Anything beyond it is marked `beyondSyllabus`.
- **Indian context:** Indian names and businesses, ₹ with Indian digit grouping (₹1,25,000), GST where the topic needs it.
- **No gendered pronouns** in anything a learner reads: "the partner", "the owner", "they".
- **Exact answers:** choose figures so every answer is exact, and show the working in the format the board expects.
- **Questions a learner has played do not change silently.** Changing what an existing generator makes means raising
  its `version`; the content hash tests (`src/content/class11Unchanged.test.ts`, `class12Unchanged.test.ts`) tell you
  when. New generators go on new levels at the end of a topic and stay off mock papers (`src/generators/outsidePapers.ts`).

## Licences

By contributing you agree that your code is released under the MIT licence ([`LICENSE`](LICENSE)) and your content
under CC BY-SA 4.0 ([`LICENSE-CONTENT.md`](LICENSE-CONTENT.md)).

## Conduct

Be kind and patient: many people here are students or teachers, not programmers. See the
[Code of Conduct](CODE_OF_CONDUCT.md).
