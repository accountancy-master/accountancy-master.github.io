// ---------------------------------------------------------------------------------------------------------------
// How the topics of a course lean on each other: the "builds on" links a mind map of the course draws between its
// topics. Each link goes from a topic to a later one in the same course that cannot be done well without it, with a
// line saying why. They are authored here, by course; a unit test checks that every topic is a real one of the
// course and that every link points forward in the course order. The links that case studies make (an integrated
// case that draws on the stages before it) are not written here: they are derived from the stages themselves
// (learning/mindMap.ts).
// ---------------------------------------------------------------------------------------------------------------

export interface TopicLink {
  /** The earlier topic, the one built on. */
  from: string;
  /** The later topic, which builds on it. */
  to: string;
  /** Why, in one line. */
  reason: string;
}

export const TOPIC_LINKS: Readonly<Record<string, readonly TopicLink[]>> = {
  'cbse-11-accountancy': [
    { from: 'introduction-to-accounting', to: 'accounting-equation', reason: 'Assets, liabilities and capital are the terms the equation is written in.' },
    { from: 'accounting-equation', to: 'journal-entries', reason: 'An entry records both sides of a change that the equation keeps in balance.' },
    { from: 'journal-entries', to: 'ledger', reason: 'Every posting carries a journal entry to the accounts it names.' },
    { from: 'journal-entries', to: 'subsidiary-books', reason: 'Day books group the credit entries you would otherwise journalise one by one.' },
    { from: 'cash-book', to: 'bank-reconciliation', reason: 'The bank column of the cash book is what is matched with the pass book.' },
    { from: 'ledger', to: 'trial-balance', reason: 'The trial balance lists the balances the ledger accounts close with.' },
    { from: 'trial-balance', to: 'rectification-of-errors', reason: 'A trial balance that does not agree is where the search for errors starts.' },
    { from: 'theory-base', to: 'depreciation', reason: 'Matching and prudence explain why the cost of an asset is spread over its life.' },
    { from: 'trial-balance', to: 'final-accounts', reason: 'The final accounts are drawn up from the balances of the trial balance.' },
    { from: 'final-accounts', to: 'final-accounts-adjustments', reason: 'Adjustments change the same three statements, one item at a time.' },
    { from: 'depreciation', to: 'final-accounts-adjustments', reason: 'Depreciation is one of the adjustments made before profit is found.' },
    { from: 'provisions-and-reserves', to: 'final-accounts-adjustments', reason: 'Provisions for doubtful debts and reserves are adjusted in the final accounts.' },
  ],
  'cbse-12-accountancy': [
    { from: 'partnership-fundamentals', to: 'goodwill', reason: 'Goodwill is valued from the profits of the firm and the shares the partners take of them.' },
    { from: 'partnership-fundamentals', to: 'change-in-profit-sharing-ratio', reason: 'A change of ratio rewrites the sharing the deed first agreed.' },
    { from: 'goodwill', to: 'change-in-profit-sharing-ratio', reason: 'The gaining partner makes good the sacrificing partner through goodwill.' },
    { from: 'goodwill', to: 'admission-of-a-partner', reason: 'A new partner brings a premium for the share of goodwill they take.' },
    { from: 'change-in-profit-sharing-ratio', to: 'admission-of-a-partner', reason: 'Sacrifice, revaluation and reserves are treated as in a change of ratio.' },
    { from: 'goodwill', to: 'retirement-and-death-of-a-partner', reason: 'The partner who leaves is paid for their share of goodwill.' },
    { from: 'admission-of-a-partner', to: 'retirement-and-death-of-a-partner', reason: 'Retirement mirrors admission: a gaining ratio where there was a sacrificing one.' },
    { from: 'partnership-fundamentals', to: 'dissolution-of-partnership', reason: 'The capital accounts kept from the start are closed when the firm is dissolved.' },
    { from: 'share-capital', to: 'debentures', reason: 'Debentures are issued and recorded much as shares are: at par, at a premium or at a discount.' },
    { from: 'share-capital', to: 'company-financial-statements', reason: 'Share capital and its note head the equity side of the balance sheet.' },
    { from: 'debentures', to: 'company-financial-statements', reason: 'Debentures are shown as long-term borrowings in the balance sheet.' },
    { from: 'company-financial-statements', to: 'financial-statement-analysis', reason: 'Comparative and common size statements are laid out in the Schedule III form.' },
    { from: 'company-financial-statements', to: 'accounting-ratios', reason: 'Every ratio takes its figures from the heads of the statements.' },
    { from: 'company-financial-statements', to: 'cash-flow-statement', reason: 'Cash flows are worked out from two balance sheets and the statement of profit.' },
  ],
};

/** The authored links of a course; none for a course that has none. */
export const topicLinksOf = (courseId: string): readonly TopicLink[] => TOPIC_LINKS[courseId] ?? [];
