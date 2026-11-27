// ---------------------------------------------------------------------------------------------------------------
// The labs of the simulator: one picture for each part of the course, each the picture that explains that part
// best. The accounting equation is shown as tanks (the scene in ./equation); the others draw what the topic is
// really about: postings filling T-accounts, a book value falling year by year, two books of the same bank coming
// to agree, a trial balance tipping, a profit split between partners, a share passing through its calls, cash
// flowing in and out, ratios moving as the figures change.
//
// This file is plain data, read by the lab shelf of /simulator, by the search and by tests. A lab's screen is in
// components/simulator/labs, loaded only when the lab is opened (components/simulator/labs/index.ts). A lab that
// is not `ready` is not offered anywhere.
// ---------------------------------------------------------------------------------------------------------------

import { PART_B_LABEL, partBOfTopic } from '@/content/courseOptions';

export interface LabInfo {
  /** In the address: /simulator?lab=depreciation. */
  id: string;
  title: string;
  /** One line on the shelf. */
  blurb: string;
  /** What it lets a student do, for the search: "slide the rate and watch the book value fall". */
  keywords: string;
  classLevel: 11 | 12;
  /** The topics it pictures, by id, first the main one. */
  topicIds: string[];
  /** Offered to learners. */
  ready: boolean;
}

export const EQUATION_LAB = 'equation';

export const LABS: readonly LabInfo[] = [
  {
    id: EQUATION_LAB,
    title: 'The accounting equation',
    blurb: 'Watch every transaction move value between what the business owns, owes and holds for its owner.',
    keywords: 'assets liabilities capital tanks predict find the mistake suspense',
    classLevel: 11,
    topicIds: ['accounting-equation'],
    ready: true,
  },
  {
    id: 'posting',
    title: 'Journal to ledger to trial balance',
    blurb: 'Follow an entry from the journal into the T-accounts, balance them, and see the trial balance agree.',
    keywords: 'journal ledger t-account posting debit credit balance c/d b/d trial balance',
    classLevel: 11,
    topicIds: ['journal-entries', 'ledger', 'trial-balance'],
    ready: true,
  },
  {
    id: 'depreciation',
    title: 'Depreciation over the years',
    blurb: 'Change the method, the rate and the years, and watch the book value fall and the asset sold.',
    keywords: 'straight line written down value book value provision for depreciation sale of asset curve',
    classLevel: 11,
    topicIds: ['depreciation'],
    ready: true,
  },
  {
    id: 'bank-reconciliation',
    title: 'Cash book meets pass book',
    blurb: 'Two records of one bank account: find the items that differ and bring the balances together.',
    keywords: 'bank reconciliation statement pass book cash book cheques not presented not credited charges',
    classLevel: 11,
    topicIds: ['bank-reconciliation'],
    ready: true,
  },
  {
    id: 'trial-balance-scale',
    title: 'The trial balance scale',
    blurb: 'Errors land on the debit or credit pan: see which ones tip the balance, and how Suspense and rectification set it level.',
    keywords: 'trial balance errors suspense rectification one-sided two-sided scale',
    classLevel: 11,
    topicIds: ['rectification-of-errors', 'trial-balance'],
    ready: true,
  },
  {
    id: 'trial-balance-fix',
    title: "When the trial balance won't agree",
    blurb: 'Post a month of books with errors hidden in them, open Suspense A/c for the difference, then find each error, rectify it and watch Suspense close.',
    keywords: 'trial balance does not agree suspense account difference rectification of errors rectifying entry ledger rough work casting posting omission principle compensating corrected trial balance profit',
    classLevel: 11,
    topicIds: ['rectification-of-errors', 'trial-balance', 'ledger'],
    ready: true,
  },
  {
    id: 'final-accounts',
    title: 'From trial balance to final accounts',
    blurb: 'Sort every balance into the Trading Account, the Profit and Loss Account or the Balance Sheet, then make the adjustments.',
    keywords: 'trading account profit and loss balance sheet gross profit net profit adjustments outstanding prepaid',
    classLevel: 11,
    topicIds: ['final-accounts', 'final-accounts-adjustments'],
    ready: true,
  },
  {
    id: 'partnership',
    title: 'Sharing among partners',
    blurb: 'Split the profit after interest and salaries, then admit or retire a partner and watch the shares change.',
    keywords: 'partnership appropriation interest on capital salary ratio sacrificing gaining goodwill admission retirement',
    classLevel: 12,
    topicIds: ['partnership-fundamentals', 'change-in-profit-sharing-ratio', 'admission-of-a-partner', 'retirement-and-death-of-a-partner'],
    ready: true,
  },
  {
    id: 'shares',
    title: 'A share from application to forfeiture',
    blurb: 'Follow the money of a share issue through application, allotment and calls, then forfeit and reissue.',
    keywords: 'share capital application allotment calls premium arrears forfeiture reissue capital reserve',
    classLevel: 12,
    topicIds: ['share-capital'],
    ready: true,
  },
  {
    id: 'cash-flow',
    title: 'Where the cash came from and went',
    blurb: 'Cash at the start, cash at the end, and the operating, investing and financing flows between them.',
    keywords: 'cash flow statement operating investing financing indirect method non-cash adjustments',
    classLevel: 12,
    topicIds: ['cash-flow-statement'],
    ready: true,
  },
  {
    id: 'ratios',
    title: 'Ratios on the dials',
    blurb: 'Change a figure of the balance sheet or the statement of profit and loss and watch every ratio move.',
    keywords: 'ratio analysis current ratio quick ratio debt equity turnover gross profit ratio liquidity solvency',
    classLevel: 12,
    topicIds: ['accounting-ratios'],
    ready: true,
  },
  {
    id: 'books-of-entry',
    title: 'Which book does it go in?',
    blurb: 'Send each transaction to its book (cash book, purchases, sales, returns or journal proper) and watch the books fill and post.',
    keywords: 'subsidiary books cash book three column contra entry discount purchases book sales book returns journal proper posting',
    classLevel: 11,
    topicIds: ['subsidiary-books', 'cash-book'],
    ready: true,
  },
  {
    id: 'incomplete-records',
    title: 'Profit without full books',
    blurb: 'Build the statements of affairs at two dates and see the profit come out of the growth in capital.',
    keywords: 'incomplete records single entry statement of affairs opening closing capital drawings additional capital profit',
    classLevel: 11,
    topicIds: ['incomplete-records'],
    ready: true,
  },
  {
    id: 'goodwill',
    title: 'Putting a price on goodwill',
    blurb: 'Change the profits, the years and the normal rate, and watch average, super and capitalised profits value the goodwill.',
    keywords: 'goodwill valuation average profit weighted super profit capitalisation normal rate of return years purchase',
    classLevel: 12,
    topicIds: ['goodwill'],
    ready: true,
  },
  {
    id: 'dissolution',
    title: 'Closing a firm',
    blurb: 'Close the books of a firm: assets realised, liabilities paid, the profit or loss on realisation shared, and every account down to nothing.',
    keywords: 'dissolution realisation account assets realised liabilities paid partners capital cash final settlement',
    classLevel: 12,
    topicIds: ['dissolution-of-partnership'],
    ready: true,
  },
  {
    id: 'debentures',
    title: 'Borrowing through debentures',
    blurb: 'Issue debentures at par, a premium or a discount, redeemable at par or a premium, and follow the loss on issue and the interest.',
    keywords: 'debentures issue par premium discount redemption premium loss on issue interest collateral security',
    classLevel: 12,
    topicIds: ['debentures'],
    ready: true,
  },
  {
    id: 'company-statements',
    title: "A company's statements, read",
    blurb: 'Sort items into the Schedule III balance sheet, then compare two years and see each item as a share of the total.',
    keywords: 'schedule iii balance sheet heads sub heads notes comparative statement common size analysis financial statement analysis',
    classLevel: 12,
    topicIds: ['company-financial-statements', 'financial-statement-analysis'],
    ready: true,
  },
  {
    id: 'spreadsheet',
    title: 'Accounts in a spreadsheet',
    blurb: 'A working sheet: build a bank reconciliation, depreciation and loan schedules, ratios and a chart with formulas, and copy them down.',
    keywords: 'computerised accounting spreadsheet excel cell formula relative absolute reference copy sum average round if sln db pmt ipmt ppmt loan repayment schedule depreciation schedule chart pie bar #ref #div/0 #name',
    classLevel: 12,
    topicIds: ['computerised-accounting'],
    ready: true,
  },
];
export const findLab = (id: string | null | undefined): LabInfo | undefined => LABS.find((l) => l.id === id && l.ready);

/** The labs offered, those of the learner's own course first (`mine` is true for a topic of that course). */
export function shelfOf(mine: (topicId: string) => boolean): LabInfo[] {
  const ready = LABS.filter((l) => l.ready);
  const own = (l: LabInfo) => mine(l.topicIds[0]);
  return [...ready.filter(own), ...ready.filter((l) => !own(l))];
}

/** A row of the shelf: the labs of one class, those of the learner's own course, or those of the other choice of Part B. */
export interface ShelfGroup {
  classLevel: 11 | 12;
  /** The labs of the learner's own course. */
  mine: boolean;
  /** For labs of a choice of the course the learner did not make: its name ("Computerised Accounting"). */
  option?: string;
  labs: LabInfo[];
}

/**
 * The shelf in rows, as the course is: the labs of the learner's own course first; then those of the other choice of
 * Part B of that class (a learner of Analysis of Financial Statements finds the spreadsheet there, one of Computerised
 * Accounting the ratios, the cash flow and the company's statements), labelled with that choice; then the other class.
 */
export function shelfGroups(mine: (topicId: string) => boolean): ShelfGroup[] {
  const shelf = shelfOf(mine);
  const own = (l: LabInfo) => mine(l.topicIds[0]);
  const ownClasses = new Set(shelf.filter(own).map((l) => l.classLevel));
  const optionOf = (l: LabInfo): string | undefined => {
    const choice = partBOfTopic(l.topicIds[0]);
    return !own(l) && choice && ownClasses.has(l.classLevel) ? PART_B_LABEL[choice] : undefined;
  };
  const groups: ShelfGroup[] = [];
  for (const l of shelf) {
    const g = { classLevel: l.classLevel, mine: own(l), option: optionOf(l) };
    const found = groups.find((x) => x.classLevel === g.classLevel && x.mine === g.mine && x.option === g.option);
    if (found) found.labs.push(l);
    else groups.push({ ...g, labs: [l] });
  }
  const rank = (g: ShelfGroup) => (g.mine ? 0 : g.option ? 1 : 2);
  return groups.map((g, i) => ({ g, i })).sort((a, b) => rank(a.g) - rank(b.g) || a.i - b.i).map((x) => x.g);
}

/** The labs offered that picture a topic, the one that pictures it first before those it is one of several topics of. */
export function labsOfTopic(topicId: string): LabInfo[] {
  const ready = LABS.filter((l) => l.ready && l.topicIds.includes(topicId));
  return [...ready.filter((l) => l.topicIds[0] === topicId), ...ready.filter((l) => l.topicIds[0] !== topicId)];
}

/** The address of a lab. */
export const labHref = (id: string): string => (id === EQUATION_LAB ? '/simulator' : `/simulator?lab=${id}`);
