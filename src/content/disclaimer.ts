// The disclaimer, in one place: the About page shows it in full, and the landing page, Settings and the mock papers
// show its short form with a link to it. README.md and CONTRIBUTING.md carry the same words.

export const REPO_URL = 'https://github.com/accountancy-master/accountancy-master.github.io';
export const REPORT_URL = `${REPO_URL}/issues/new/choose`;
export const CONTRIBUTING_URL = `${REPO_URL}/blob/main/CONTRIBUTING.md`;

/** One line, for the places that link to the About page. */
export const DISCLAIMER_SHORT =
  'An independent, free practice aid, not affiliated with CBSE or NCERT. The content may contain mistakes: check it against your NCERT textbook and your teacher.';

/** The mock papers' own line. */
export const MOCK_PAPER_NOTE =
  'A practice paper written for this app on the CBSE pattern. It is not an official CBSE paper, and its marks do not predict your board result.';

export interface DisclaimerPart {
  heading: string;
  paragraphs: string[];
}

/** The full disclaimer, in the order the About page shows it. */
export const DISCLAIMER: DisclaimerPart[] = [
  {
    heading: 'Not an official source',
    paragraphs: [
      'Accountancy Master is an independent, free and open-source practice aid for students of Accountancy. It is not affiliated with, endorsed by or connected to the Central Board of Secondary Education (CBSE), the National Council of Educational Research and Training (NCERT) or any school or board. "CBSE" and "NCERT" are named only to say which syllabus the practice follows.',
      'The mock papers, sample answers, marking points and case studies are written for this app on the pattern of the board examination. They are not official papers or marking schemes, and a score here does not predict a board result.',
    ],
  },
  {
    heading: 'Mistakes are possible',
    paragraphs: [
      'The lessons, questions, answers and explanations are prepared with care, much of them with the help of AI tools, and are checked by automated tests and reviews. Even so, they may contain errors or may differ from the latest syllabus, textbook or circular.',
      'Always treat the current NCERT textbook, the CBSE syllabus and circulars of the year, and your teacher as the final word. Where this app differs from them, follow them.',
    ],
  },
  {
    heading: 'No warranty, no liability',
    paragraphs: [
      'Everything here is provided "as is", without any warranty of accuracy, completeness or fitness for a purpose, as its licences also state (MIT for the code, CC BY-SA 4.0 for the content). By using it you agree that the maintainers and contributors are not responsible for any loss or harm that may come from using it or relying on it, including marks lost in an examination.',
    ],
  },
  {
    heading: 'Found a mistake? Help fix it',
    paragraphs: [
      'Report it on GitHub with the "Mistake in the content" form: the page address or question, what is wrong, and what it should say. Evidence helps it get fixed quickly: the NCERT chapter and page, the CBSE circular or marking scheme, or a worked check of the figures.',
      'You can also correct it yourself: change the content in a fork of the repository and open a pull request with the same evidence. The maintainers review every change before it is merged, and the automated checks must pass. The contributing guide explains how.',
    ],
  },
  {
    heading: 'Your data',
    paragraphs: [
      'There is no account and no server: everything a learner does stays in their own browser, on their own device. Clearing the browser\'s data for this site removes it; a backup file (Settings, Backup) keeps a copy you control.',
    ],
  },
];
