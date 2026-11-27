import type { WrittenQuestion } from './types';

// Board-style written answers of Class 11 Accountancy (CBSE 2025-26). Format in types.ts.
const WRITTEN_11: WrittenQuestion[] = [
  // Theory Base of Accounting -------------------------------------------------------------------------------------
  {
    id: 'w11-thb-001',
    topicId: 'theory-base',
    conceptId: 'thb-bases',
    difficulty: 'easy',
    form: 'distinguish',
    marks: 3,
    prompt: 'Distinguish between the cash basis and the accrual basis of accounting on any three bases.',
    pointsNeeded: 3,
    points: [
      { text: 'Time of recording: the cash basis records an item when cash is received or paid; the accrual basis records it when it is earned or incurred.', keywords: ['when cash', 'received or paid', 'earned or incurred', 'time of recording'] },
      { text: 'Outstanding and prepaid items: the cash basis has none; the accrual basis shows outstanding and prepaid expenses and accrued and advance incomes.', keywords: ['outstanding', 'prepaid', 'accrued', 'advance'] },
      { text: 'Profit shown: the cash basis does not match income with the expenses of the same period, so its profit is less true; the accrual basis matches them and shows a truer profit.', keywords: ['true profit', 'correct profit', 'matching', 'accurate'] },
      { text: 'Recognition by law: the cash basis is not accepted for companies; the Companies Act, 2013 requires companies to keep their books on the accrual basis.', keywords: ['companies act', 'law', 'legal', 'not accepted'] },
      { text: 'Simplicity: the cash basis is simple and suits small concerns and professionals; the accrual basis needs adjustments and is more involved.', keywords: ['simple', 'small', 'professionals', 'complicated'] },
    ],
    table: {
      headers: ['Basis', 'Cash basis', 'Accrual basis'],
      rows: [
        ['Time of recording', 'When cash is received or paid', 'When income is earned or the expense is incurred'],
        ['Outstanding and prepaid items', 'Not shown at all', 'Outstanding and prepaid expenses, accrued and advance incomes are shown'],
        ['Profit shown', 'Less true, as income and expenses of a period are not matched', 'Truer, as income is matched with the expenses of the same period'],
        ['Recognition by law', 'Not accepted for companies', 'Required for companies by the Companies Act, 2013'],
        ['Simplicity', 'Simple; suits small concerns and professionals', 'Needs adjustments; more involved'],
      ],
    },
    markingTip: '1 mark for each basis with both sides stated; a pair of sides with no basis earns half. Writing only the meaning of the two bases is one point, not three.',
    hints: ['Ask when each basis puts an income or expense in the books: at the cash, or at the earning.', 'Bases to use: time of recording, outstanding and prepaid items, profit shown, recognition by law.'],
  },
  {
    id: 'w11-thb-002',
    topicId: 'theory-base',
    conceptId: 'thb-systems',
    difficulty: 'medium',
    form: 'distinguish',
    marks: 4,
    prompt: 'Distinguish between the double entry system and the single entry system of accounting on any four bases.',
    pointsNeeded: 4,
    points: [
      { text: 'Recording of aspects: double entry records both aspects of every transaction; single entry records some in two accounts, some in one and some not at all.', keywords: ['both aspects', 'two aspects', 'one aspect', 'some not at all'] },
      { text: 'Accounts kept: double entry keeps personal, real and nominal accounts; single entry keeps mainly personal accounts and a cash book.', keywords: ['personal', 'real and nominal', 'nominal', 'only personal'] },
      { text: 'Trial balance: it can be prepared under double entry to check arithmetical accuracy; it cannot be prepared under single entry.', keywords: ['trial balance', 'arithmetical accuracy'] },
      { text: 'Profit: double entry finds the true profit through a Profit and Loss Account; single entry gives only an estimate through a statement of affairs.', keywords: ['statement of affairs', 'estimate', 'profit and loss account', 'rough'] },
      { text: 'Errors and frauds: they are easier to detect under double entry and hard to detect under single entry.', keywords: ['fraud', 'detect', 'errors'] },
      { text: 'Acceptance: double entry is scientific and accepted by law and tax authorities; single entry is unscientific and not accepted for companies.', keywords: ['scientific', 'unscientific', 'accepted', 'tax authorities'] },
    ],
    table: {
      headers: ['Basis', 'Double entry system', 'Single entry system'],
      rows: [
        ['Recording of aspects', 'Both aspects of every transaction', 'Some in two accounts, some in one, some not at all'],
        ['Accounts kept', 'Personal, real and nominal accounts', 'Mainly personal accounts and a cash book'],
        ['Trial balance', 'Can be prepared', 'Cannot be prepared'],
        ['Ascertaining profit', 'True profit through a Profit and Loss Account', 'An estimate through a statement of affairs'],
        ['Errors and frauds', 'Easy to detect', 'Hard to detect'],
        ['Acceptance', 'Scientific; accepted by law and tax authorities', 'Unscientific; not accepted for companies'],
      ],
    },
    markingTip: '1 mark for each basis with both systems stated; a basis written for one system only earns half. "Double entry means writing a transaction twice" is wrong and earns nothing.',
    hints: ['Think of what a small trader who keeps only a cash book and a list of debtors cannot do.', 'Start with the recording of aspects, then the trial balance and the way profit is found.'],
  },
  {
    id: 'w11-thb-003',
    topicId: 'theory-base',
    conceptId: 'thb-assumptions',
    difficulty: 'easy',
    form: 'explain',
    marks: 3,
    prompt: 'Explain the three fundamental accounting assumptions.',
    pointsNeeded: 3,
    points: [
      { text: 'Going concern: the business is taken to carry on for the foreseeable future, so fixed assets are shown at cost less depreciation and not at forced-sale value.', keywords: ['going concern', 'foreseeable future', 'continue', 'carry on'] },
      { text: 'Consistency: the same accounting policies are followed from year to year so that results can be compared; a change is made only for good reason and disclosed.', keywords: ['consistency', 'same method', 'same policies', 'year to year'] },
      { text: 'Accrual: income and expenses are recorded in the period in which they are earned or incurred, whether or not cash moves in that period.', keywords: ['accrual', 'earned or incurred', 'not when cash'] },
    ],
    answer:
      'Accounting Standard 1 names three fundamental accounting assumptions. When they are followed, nothing need be said; when one is not followed, the fact is disclosed.\n' +
      '1. Going concern: The business is taken to carry on for the foreseeable future, with no need or intention to close. So fixed assets are shown at cost less depreciation, not at what a forced sale would fetch.\n' +
      '2. Consistency: The same accounting policies and methods are followed from one year to the next, so that the results of different years can be compared. A method is changed only for a good reason, and the change is disclosed.\n' +
      '3. Accrual: Income and expenses are recorded in the period in which they are earned or incurred, whether or not cash is received or paid in that period.',
    markingTip: '1 mark for each assumption named and explained; a name without its meaning earns half. Business entity, prudence or matching written as a fundamental assumption earns nothing.',
    hints: ['AS-1 names exactly three assumptions; the rest are principles.', 'One is about the life of the business, one about methods year after year, one about when income is recorded.'],
  },
  {
    id: 'w11-thb-004',
    topicId: 'theory-base',
    conceptId: 'thb-principles',
    difficulty: 'medium',
    form: 'explain',
    marks: 4,
    prompt: 'Explain the prudence (conservatism) principle and the matching principle, giving one example of each.',
    pointsNeeded: 2,
    points: [
      { text: 'Prudence: provide for all likely losses but do not anticipate profits; for example, stock costing ₹80,000 that would now sell for ₹72,000 is shown at ₹72,000, the lower of cost and net realisable value.', keywords: ['prudence', 'conservatism', 'anticipate', 'likely losses', 'lower of cost'] },
      { text: 'Matching: the expenses of a period are set against the revenue of the same period; for example, commission on March sales paid in April is still an expense of the year ending 31 March.', keywords: ['matching', 'same period', 'set against', 'match'] },
    ],
    answer:
      '1. Prudence (conservatism): The accountant provides for every loss that is likely, but does not record a profit until it is earned. Example: stock costing ₹80,000 that would now sell for only ₹72,000 is valued at ₹72,000, the lower of cost and net realisable value; if it would sell for ₹95,000 it still stays at ₹80,000. A provision for doubtful debts rests on the same idea.\n' +
      '2. Matching: The expenses of an accounting period are set against the revenue earned in that period, so that the profit of the period is correctly measured. Example: a salesperson earns commission of ₹6,000 on sales made in March, but it is paid in April. It is still an expense of the year ending 31 March, the year of those sales, and is shown as outstanding.',
    markingTip: '1 mark for the meaning and 1 mark for a correct example, for each principle; an example that illustrates a different principle earns nothing for that half.',
    hints: ['One principle is about losses and profits not yet certain; the other is about which year an expense belongs to.', 'For prudence, think of the value of closing stock; for matching, think of an expense of this year paid next year.'],
  },
  {
    id: 'w11-thb-005',
    topicId: 'theory-base',
    conceptId: 'thb-standards',
    difficulty: 'easy',
    form: 'list',
    marks: 3,
    prompt: 'State any three objectives of accounting standards.',
    pointsNeeded: 3,
    points: [
      { text: 'Uniformity: to bring the same treatment of similar items into the accounts of different firms.', keywords: ['uniformity', 'uniform', 'same treatment'] },
      { text: 'Fewer alternatives: to reduce or remove the choice among alternative accounting treatments.', keywords: ['alternative', 'choice', 'reduce'] },
      { text: 'Comparability: to make the statements of different firms, and of the same firm over years, comparable.', keywords: ['comparable', 'comparability', 'compare'] },
      { text: 'Reliability: to make the financial statements credible and reliable for their users.', keywords: ['reliable', 'credible', 'credibility', 'trust'] },
      { text: 'Disclosure: to lay down what must be disclosed, so that users get the facts they need.', keywords: ['disclosure', 'disclose', 'notes'] },
    ],
    answer:
      'Accounting standards are written statements that set out how particular items are to be recorded, valued and reported. Their objectives are:\n' +
      '1. Uniformity: Similar items are treated in the same way in the accounts of different firms.\n' +
      '2. Fewer alternatives: The choice among different accounting treatments is reduced or removed.\n' +
      '3. Comparability: The statements of different firms, and of one firm over several years, can be compared.\n' +
      '4. Reliability: Users can place trust in the statements because they follow known rules.\n' +
      '5. Disclosure: The standards lay down what must be disclosed, so that users get the facts they need for decisions.',
    markingTip: '1 mark for each objective with a line of explanation; a bare word ("uniformity") earns half. Uniformity and comparability count as two points only when each is explained.',
    hints: ['Ask what goes wrong when every firm chooses its own way of recording the same item.', 'Start with uniformity, then think of comparing two firms\' statements.'],
  },
  {
    id: 'w11-thb-006',
    topicId: 'theory-base',
    conceptId: 'thb-gst',
    difficulty: 'medium',
    form: 'features',
    marks: 4,
    prompt: 'State any four characteristics of the Goods and Services Tax (GST).',
    pointsNeeded: 4,
    points: [
      { text: 'One nation, one tax: GST replaced many central and state indirect taxes with a single tax across India.', keywords: ['one nation', 'one tax', 'replaced', 'single tax'] },
      { text: 'Destination-based: the tax goes to the state where the goods or services are consumed.', keywords: ['destination', 'consumed', 'consumption'] },
      { text: 'Input tax credit: tax is charged at every stage, but credit for tax paid on purchases avoids tax on tax (no cascading).', keywords: ['input tax credit', 'cascading', 'tax on tax', 'every stage'] },
      { text: 'Dual tax: CGST and SGST are charged on a supply within a state, and IGST on a supply from one state to another.', keywords: ['dual', 'cgst', 'sgst', 'igst'] },
      { text: 'Borne by the consumer: it is an indirect tax collected at each stage and finally borne by the final consumer.', keywords: ['indirect', 'final consumer', 'borne by'] },
      { text: 'Supply as the taxable event: it is levied on the supply of goods and of services alike.', keywords: ['supply', 'goods and services', 'taxable event'] },
    ],
    answer:
      'GST is an indirect tax on the supply of goods and services. Its characteristics are:\n' +
      '1. One nation, one tax: It replaced many central and state indirect taxes with a single tax across the country.\n' +
      '2. Destination-based: The tax goes to the state in which the goods or services are finally consumed.\n' +
      '3. Input tax credit: Tax is charged at every stage, but a dealer gets credit for the tax paid on purchases, so tax is not charged on tax.\n' +
      '4. Dual tax: On a supply within a state, CGST goes to the Centre and SGST to the State; on a supply to another state, IGST is charged.\n' +
      '5. Borne by the consumer: Dealers collect it at each stage, but the final consumer bears it.\n' +
      '6. Supply as the taxable event: It is charged on the supply of goods and of services alike.',
    markingTip: '1 mark for each characteristic with its short explanation; a heading with no explanation earns half. Rates of tax are not characteristics and earn nothing.',
    hints: ['Think of what GST replaced, and of how a dealer avoids paying tax on tax.', 'Start with "one nation, one tax" and input tax credit, then the split into CGST, SGST and IGST.'],
  },
  {
    id: 'w11-thb-007',
    topicId: 'theory-base',
    conceptId: 'thb-gaap',
    difficulty: 'easy',
    form: 'explain',
    marks: 1,
    prompt: 'What is meant by Generally Accepted Accounting Principles (GAAP)?',
    pointsNeeded: 1,
    points: [
      { text: 'GAAP are the rules, conventions and practices that the accounting profession and users generally accept for recording and reporting transactions, so that accounts are uniform and comparable.', keywords: ['rules', 'conventions', 'generally accepted', 'uniform', 'comparable'] },
    ],
    answer: 'GAAP are the rules, conventions and practices that the accounting profession and the users of accounts generally accept for recording and reporting transactions, so that similar events are recorded in similar ways and accounts can be compared.',
    markingTip: 'The full mark needs the idea of rules that are generally accepted for recording and reporting; expanding the abbreviation alone earns nothing.',
    hints: ['Expand the letters, then say what the rules are for.', 'Rules accepted by the profession, so that two firms record the same event the same way.'],
  },
  {
    id: 'w11-thb-008',
    topicId: 'theory-base',
    conceptId: 'thb-principles',
    difficulty: 'complex',
    form: 'explain',
    marks: 6,
    prompt:
      'Name the accounting principle or assumption that each of the following follows or breaks, and explain it in a line: (i) The owner pays the family\'s electricity bill of ₹4,500 from the shop\'s cash and debits it to Electricity Expenses. (ii) Land bought for ₹30,00,000 is still shown at ₹30,00,000 though it would now sell for ₹45,00,000. (iii) A claim of ₹8,00,000 against the firm, pending in court, is mentioned in a note to the accounts. (iv) A stapler costing ₹120 is charged to expenses though it will last for years. (v) The method of valuing stock is changed every year to show a higher profit. (vi) An advance of ₹25,000 received for goods to be delivered next year is shown as sales of this year.',
    pointsNeeded: 6,
    points: [
      { text: '(i) Business entity is broken: the owner\'s household bill is drawings, not an expense of the business.', keywords: ['business entity', 'entity', 'drawings', 'separate'] },
      { text: '(ii) Historical cost is followed: an asset stays at the price paid for it, and a rise in market price is not recorded.', keywords: ['historical cost', 'cost concept', 'cost principle', 'price paid'] },
      { text: '(iii) Full disclosure is followed: a fact that may affect a reader\'s decision is told in the notes.', keywords: ['full disclosure', 'disclosure', 'note'] },
      { text: '(iv) Materiality is followed: an item too small to matter is treated in the simplest way.', keywords: ['materiality', 'material', 'trivial', 'too small'] },
      { text: '(v) Consistency is broken: the same method must be used year after year unless there is a good reason, which is then disclosed.', keywords: ['consistency', 'same method', 'every year'] },
      { text: '(vi) Revenue recognition is broken: revenue is earned when the goods are delivered, so the advance is a liability until then.', keywords: ['revenue recognition', 'delivered', 'realisation', 'liability'] },
    ],
    answer:
      '(i) Business entity concept, broken: The business is separate from its owner. The household bill of ₹4,500 is drawings, not an expense of the shop.\n' +
      '(ii) Historical cost concept, followed: An asset is recorded at the price paid for it, and a later rise in its market price is not recorded.\n' +
      '(iii) Full disclosure principle, followed: Every fact that could affect a reader\'s decision, such as a pending claim, is disclosed, here in a note.\n' +
      '(iv) Materiality principle, followed: An item too small to affect anyone\'s decision may be dealt with in the simplest way, so the stapler is written off at once.\n' +
      '(v) Consistency assumption, broken: The same method of valuing stock should be used year after year; it may be changed only for a good reason, and the change is disclosed.\n' +
      '(vi) Revenue recognition principle, broken: Revenue is earned when the goods are delivered. The ₹25,000 is an advance, a liability, until delivery next year.',
    markingTip: '½ mark for naming the right principle and ½ for saying whether it is followed or broken, with the reason, in each part; a name with no verdict earns half.',
    hints: ['For each part, ask what the decision is really about: whose money, what value, what is told, how big, which method, or when revenue is earned.', 'Part (i) is about the owner and the business being separate; part (vi) is about when revenue is earned.'],
  },

  // Introduction to Accounting ------------------------------------------------------------------------------------
  {
    id: 'w11-ia-001',
    topicId: 'introduction-to-accounting',
    conceptId: 'ia-meaning',
    difficulty: 'easy',
    form: 'distinguish',
    marks: 3,
    prompt: 'Distinguish between book-keeping and accounting on any three bases.',
    pointsNeeded: 3,
    points: [
      { text: 'Scope: book-keeping is limited to recording and classifying transactions; accounting also summarises, analyses, interprets and communicates them.', keywords: ['recording', 'analyses', 'interprets', 'communicates', 'scope'] },
      { text: 'Stage: book-keeping is the first stage; accounting begins where book-keeping ends.', keywords: ['first stage', 'primary', 'secondary', 'begins where'] },
      { text: 'Objective: book-keeping keeps a systematic record; accounting finds the results and the position and informs users.', keywords: ['systematic record', 'results', 'financial position', 'objective'] },
      { text: 'Analytical skill: book-keeping needs little; accounting needs a good deal of judgement.', keywords: ['analytical', 'skill', 'judgement'] },
      { text: 'Done by: book-keeping is done by junior staff (book-keepers); accounting by accountants.', keywords: ['junior', 'book-keeper', 'accountant'] },
    ],
    table: {
      headers: ['Basis', 'Book-keeping', 'Accounting'],
      rows: [
        ['Scope', 'Recording and classifying transactions', 'Also summarising, analysing, interpreting and communicating them'],
        ['Stage', 'The first stage', 'Begins where book-keeping ends'],
        ['Objective', 'A systematic record of transactions', 'The results and position, conveyed to users'],
        ['Analytical skill', 'Little needed', 'Much judgement needed'],
        ['Done by', 'Junior staff (book-keepers)', 'Accountants'],
      ],
    },
    markingTip: '1 mark for each basis with both sides; "book-keeping is a part of accounting" alone is one side of one point. Defining both terms is not a difference.',
    hints: ['Book-keeping stops at the books; ask what accounting does after that.', 'Bases: scope, stage, objective.'],
  },
  {
    id: 'w11-ia-002',
    topicId: 'introduction-to-accounting',
    conceptId: 'ia-income-expense',
    difficulty: 'medium',
    form: 'distinguish',
    marks: 4,
    prompt: 'Distinguish between capital expenditure and revenue expenditure on any four bases.',
    pointsNeeded: 4,
    points: [
      { text: 'Purpose: capital expenditure buys or improves a fixed asset or adds to earning capacity; revenue expenditure keeps the business running day to day.', keywords: ['fixed asset', 'earning capacity', 'day to day', 'running'] },
      { text: 'Period of benefit: capital expenditure benefits several years; revenue expenditure benefits the current year only.', keywords: ['several years', 'long period', 'current year', 'one year'] },
      { text: 'Recurrence: capital expenditure is non-recurring; revenue expenditure recurs year after year.', keywords: ['non-recurring', 'recurring', 'regular'] },
      { text: 'Shown in: capital expenditure appears in the Balance Sheet as an asset; revenue expenditure is charged to the Trading or Profit and Loss Account.', keywords: ['balance sheet', 'trading', 'profit and loss account', 'charged'] },
      { text: 'Effect on profit: capital expenditure does not reduce the profit of the year except through depreciation; revenue expenditure reduces it in full.', keywords: ['depreciation', 'reduces profit', 'effect on profit'] },
    ],
    table: {
      headers: ['Basis', 'Capital expenditure', 'Revenue expenditure'],
      rows: [
        ['Purpose', 'Buys or improves a fixed asset, or adds to earning capacity', 'Maintains the business day to day'],
        ['Period of benefit', 'Several years', 'The current year only'],
        ['Recurrence', 'Non-recurring', 'Recurring'],
        ['Shown in', 'The Balance Sheet, as an asset', 'The Trading or Profit and Loss Account'],
        ['Effect on profit', 'Reduces it only through depreciation over the years', 'Reduces the profit of the year in full'],
      ],
    },
    markingTip: '1 mark for each basis with both kinds stated; an example by itself is not a basis. Writing "capital expenditure is large" is not accepted: size does not decide the class.',
    hints: ['Ask how long the benefit of the spending lasts.', 'Bases: purpose, period of benefit, recurrence, where it is shown.'],
  },
  {
    id: 'w11-ia-003',
    topicId: 'introduction-to-accounting',
    conceptId: 'ia-meaning',
    difficulty: 'easy',
    form: 'list',
    marks: 3,
    prompt: 'State any three objectives of accounting.',
    pointsNeeded: 3,
    points: [
      { text: 'Systematic records: to keep a complete and orderly record of every business transaction, so that nothing depends on memory.', keywords: ['systematic', 'orderly', 'memory', 'complete record'] },
      { text: 'Profit or loss: to find the profit earned or loss suffered in a period.', keywords: ['profit or loss', 'results', 'income statement'] },
      { text: 'Financial position: to show what the business owns and owes on a date.', keywords: ['financial position', 'owns and owes', 'balance sheet', 'assets and liabilities'] },
      { text: 'Information to users: to give owners, managers, lenders and others the information they need for decisions.', keywords: ['users', 'information', 'decisions', 'communicate'] },
      { text: 'Control and checks: to guard the assets and help detect errors and frauds.', keywords: ['fraud', 'errors', 'control', 'safeguard'] },
    ],
    answer:
      '1. Systematic records: To keep a complete and orderly record of every transaction, so that nothing depends on memory.\n' +
      '2. Profit or loss: To find the profit earned or the loss suffered during a period.\n' +
      '3. Financial position: To show what the business owns and what it owes on a given date.\n' +
      '4. Information to users: To give owners, managers, lenders and other users the information they need for their decisions.\n' +
      '5. Control: To guard the assets of the business and help detect errors and frauds.',
    markingTip: '1 mark for each objective with its explanation; listing the steps of the accounting process instead of objectives earns nothing.',
    hints: ['Ask what an owner wants to know at the end of a year.', 'Start with keeping records, then profit, then position.'],
  },
  {
    id: 'w11-ia-004',
    topicId: 'introduction-to-accounting',
    conceptId: 'ia-users',
    difficulty: 'medium',
    form: 'explain',
    marks: 4,
    prompt: 'Explain the information needs of any four external users of accounting information.',
    pointsNeeded: 4,
    points: [
      { text: 'Investors want to know how profitable the business is and how safe their money is.', keywords: ['investor', 'safety', 'return'] },
      { text: 'Lenders and banks want to know whether interest will be paid and the loan repaid on time.', keywords: ['lender', 'bank', 'repay', 'interest'] },
      { text: 'Suppliers (trade creditors) want to know whether they will be paid for goods sold on credit.', keywords: ['supplier', 'creditor', 'credit'] },
      { text: 'Customers want to know that the business is stable and will go on supplying goods.', keywords: ['customer', 'stable', 'continued supply'] },
      { text: 'Tax authorities want to know that income is correctly stated and tax correctly paid.', keywords: ['tax', 'income tax', 'gst'] },
      { text: 'Government and researchers want figures for policy, regulation and study.', keywords: ['government', 'researcher', 'policy', 'statistics'] },
    ],
    answer:
      'External users are those outside the business who deal with it but do not run it.\n' +
      '1. Investors: They want to know how profitable the business is and how safe their money is in it.\n' +
      '2. Lenders and banks: They want to know whether the business can pay interest and repay the loan on time.\n' +
      '3. Suppliers: They want to know whether they will be paid for the goods they sell on credit.\n' +
      '4. Customers: They want to know that the business is stable and will go on supplying goods.\n' +
      '5. Tax authorities: They want to know that the income is correctly stated and the right tax is paid.\n' +
      '6. Government and researchers: They want figures for policy, regulation and study.',
    markingTip: '1 mark for each user with the information that user needs; a user named without a need earns half. Owners and managers are internal users and earn nothing here.',
    hints: ['External users stand outside the business: think of who lends to it, sells to it or buys from it.', 'Start with the bank: what does a lender want to know before lending?'],
  },
  {
    id: 'w11-ia-005',
    topicId: 'introduction-to-accounting',
    conceptId: 'ia-qualities',
    difficulty: 'medium',
    form: 'explain',
    marks: 4,
    prompt: 'Explain the qualitative characteristics of accounting information.',
    pointsNeeded: 4,
    points: [
      { text: 'Reliability: the information is free from error and bias and can be checked against evidence.', keywords: ['reliability', 'reliable', 'free from error', 'bias', 'verifiable'] },
      { text: 'Relevance: the information can make a difference to a decision and is available in time.', keywords: ['relevance', 'relevant', 'in time', 'timely'] },
      { text: 'Understandability: the information is presented so that users can follow its meaning.', keywords: ['understandability', 'understandable', 'understand', 'clear'] },
      { text: 'Comparability: the information can be compared over years and with other firms.', keywords: ['comparability', 'comparable', 'compare'] },
    ],
    answer:
      'Qualitative characteristics are the qualities that make accounting information useful to its users.\n' +
      '1. Reliability: The information is free from error and bias, faithfully shows what happened, and can be checked against evidence.\n' +
      '2. Relevance: The information can make a difference to a user\'s decision and is available in time to be used.\n' +
      '3. Understandability: The information is presented so that users with a reasonable knowledge of business can follow its meaning.\n' +
      '4. Comparability: The information can be compared over different periods of the same firm and with other firms, which needs uniform methods.',
    markingTip: '1 mark for each characteristic with its meaning; the name alone earns half. All four are needed for full marks.',
    hints: ['There are four: think of what makes figures trustworthy, useful, clear and comparable.', 'Reliability and relevance come first; the other two are about following the figures and setting them side by side.'],
  },
  {
    id: 'w11-ia-006',
    topicId: 'introduction-to-accounting',
    conceptId: 'ia-advantages',
    difficulty: 'easy',
    form: 'list',
    marks: 3,
    prompt: 'State any three limitations of accounting.',
    pointsNeeded: 3,
    points: [
      { text: 'Money measurement only: events that cannot be stated in money, such as the skill of staff, are left out.', keywords: ['money measurement', 'non-monetary', 'qualitative', 'cannot be measured', 'skill'] },
      { text: 'Historical cost: assets are shown at cost, so changes in prices are not reflected.', keywords: ['historical cost', 'price changes', 'inflation', 'current value'] },
      { text: 'Estimates: depreciation, provisions and stock values rest on estimates and judgement.', keywords: ['estimate', 'judgement', 'depreciation'] },
      { text: 'Bias: the figures may be affected by personal bias or window dressing.', keywords: ['bias', 'window dressing', 'manipulated'] },
      { text: 'Past-oriented: accounts record what has happened and do not by themselves show the future.', keywords: ['past', 'historical in nature', 'future'] },
    ],
    answer:
      '1. Money measurement only: Events that cannot be stated in money, such as the skill of the staff or good relations with customers, are not recorded.\n' +
      '2. Historical cost: Assets are shown at what they cost, so changes in prices and in the value of money are not reflected.\n' +
      '3. Estimates: Depreciation, provisions and the value of stock rest on estimates and judgement, so the profit is not exact.\n' +
      '4. Bias: The figures may be affected by personal bias or deliberately dressed up.\n' +
      '5. Past-oriented: Accounts record what has already happened; they do not by themselves show the future.',
    markingTip: '1 mark for each limitation with its explanation; a limitation of a particular firm\'s staff (carelessness) is not a limitation of accounting.',
    hints: ['Think of what the accounts cannot show, though it matters to a business.', 'Start with what money cannot measure, then with assets shown at cost.'],
  },
  {
    id: 'w11-ia-007',
    topicId: 'introduction-to-accounting',
    conceptId: 'ia-process',
    difficulty: 'complex',
    form: 'explain',
    marks: 6,
    prompt: 'Accounting is a process that begins with identifying a transaction and ends with communicating information. Explain any six steps of this process.',
    pointsNeeded: 6,
    points: [
      { text: 'Identifying: picking out the transactions and events of a financial nature that belong to the business.', keywords: ['identifying', 'identify', 'financial nature'] },
      { text: 'Measuring: expressing each transaction in money.', keywords: ['measuring', 'measure', 'in money', 'money value'] },
      { text: 'Recording: writing the transactions in the books of original entry in order of date.', keywords: ['recording', 'journal', 'books of original entry', 'order of date'] },
      { text: 'Classifying: grouping transactions of a similar kind in ledger accounts.', keywords: ['classifying', 'classify', 'ledger', 'grouping'] },
      { text: 'Summarising: presenting the classified data as a trial balance and the financial statements.', keywords: ['summarising', 'summarise', 'trial balance', 'financial statements'] },
      { text: 'Analysing: breaking the summarised figures into parts and setting them against each other.', keywords: ['analysing', 'analyse', 'relationship'] },
      { text: 'Interpreting: explaining what the figures mean for profitability and soundness.', keywords: ['interpreting', 'interpret', 'significance'] },
      { text: 'Communicating: passing the information to its users in time, through reports and statements.', keywords: ['communicating', 'communicate', 'reports', 'conveying'] },
    ],
    answer:
      '1. Identifying: Picking out the transactions and events of a financial nature that belong to the business.\n' +
      '2. Measuring: Stating each transaction in money, the common unit of accounting.\n' +
      '3. Recording: Writing each transaction in the books of original entry (the journal and subsidiary books) in order of date.\n' +
      '4. Classifying: Grouping transactions of a similar nature in separate accounts in the ledger.\n' +
      '5. Summarising: Presenting the classified data in a form users can read: the trial balance and the financial statements.\n' +
      '6. Analysing: Breaking the summarised figures into parts and setting related figures against each other.\n' +
      '7. Interpreting: Explaining what the analysed figures mean for the profitability and soundness of the business.\n' +
      '8. Communicating: Passing the information to its users, in time, through reports and statements.',
    markingTip: '1 mark for each step in its proper order with its explanation; steps named in a list without explanation earn half each.',
    hints: ['Follow one transaction from the day it happens to the report a user reads.', 'It begins with identifying and measuring and ends with communicating: fill in what lies between.'],
  },
  {
    id: 'w11-ia-008',
    topicId: 'introduction-to-accounting',
    conceptId: 'ia-assets-liabilities',
    difficulty: 'easy',
    form: 'explain',
    marks: 1,
    prompt: 'What are drawings?',
    pointsNeeded: 1,
    points: [
      { text: 'Drawings are cash, goods or other assets taken out of the business by the owner for personal use; they reduce capital.', keywords: ['personal use', 'owner', 'reduce capital', 'withdrawn'] },
    ],
    answer: 'Drawings are cash, goods or any other asset taken out of the business by the owner for personal use. They reduce the owner\'s capital and are not an expense of the business.',
    markingTip: 'The mark needs both the owner taking value out and the personal use; "money taken from the business" alone earns nothing.',
    hints: ['Who takes it, and for whose use?', 'Think of the owner taking cash from the till for household needs.'],
  },

  // Accounting Equation -------------------------------------------------------------------------------------------
  {
    id: 'w11-ae-001',
    topicId: 'accounting-equation',
    conceptId: 'ae-equation',
    difficulty: 'easy',
    form: 'distinguish',
    marks: 3,
    prompt: 'Distinguish between capital and liabilities on any three bases.',
    pointsNeeded: 3,
    points: [
      { text: 'Owed to: capital is owed to the owner; liabilities are owed to outsiders.', keywords: ['owner', 'outsiders', 'internal', 'external'] },
      { text: 'Time of repayment: capital is returned only when the business closes; a liability is repaid on its due date.', keywords: ['closes', 'due date', 'repaid', 'repayment'] },
      { text: 'Return: capital earns a share of profit; a loan liability earns interest whether or not there is profit.', keywords: ['share of profit', 'interest', 'reward'] },
      { text: 'Effect of profit and loss: profit raises and loss lowers capital; liabilities do not change with the result.', keywords: ['profit raises', 'loss lowers', 'rises with profit', 'changes with profit'] },
      { text: 'Order of payment on closure: outsiders\' liabilities are paid first; capital is returned out of what is left.', keywords: ['paid first', 'what is left', 'returned last', 'closure'] },
    ],
    table: {
      headers: ['Basis', 'Capital', 'Liabilities'],
      rows: [
        ['Owed to', 'The owner (an internal liability)', 'Outsiders (external liabilities)'],
        ['Time of repayment', 'Only when the business closes', 'On the due date'],
        ['Return', 'A share of profit, if any', 'Interest on a loan, payable even in a loss'],
        ['Effect of profit and loss', 'Rises with profit, falls with loss', 'Not affected by the result'],
        ['Order of payment on closure', 'Returned last, out of what is left', 'Paid first'],
      ],
    },
    markingTip: '1 mark for each basis with both sides; calling capital "an asset of the owner" is not a difference and earns nothing.',
    hints: ['Both are claims on the assets of the business: ask whose claim each is.', 'Bases: owed to, time of repayment, return.'],
  },
  {
    id: 'w11-ae-002',
    topicId: 'accounting-equation',
    conceptId: 'ae-expenses-incomes',
    difficulty: 'medium',
    form: 'distinguish',
    marks: 3,
    prompt: 'Drawings and expenses both reduce the capital in the accounting equation. Distinguish between them on any three bases.',
    pointsNeeded: 3,
    points: [
      { text: 'Purpose: drawings are for the owner\'s personal use; expenses are incurred to run the business and earn revenue.', keywords: ['personal use', 'run the business', 'earn revenue', 'purpose'] },
      { text: 'Effect on profit: drawings do not reduce the profit; expenses reduce the profit.', keywords: ['do not reduce profit', 'reduce profit', 'effect on profit'] },
      { text: 'Shown in: drawings are deducted from capital in the Balance Sheet; expenses are charged to the Trading or Profit and Loss Account.', keywords: ['deducted from capital', 'balance sheet', 'profit and loss account'] },
      { text: 'Benefit: drawings benefit the owner; expenses benefit the business.', keywords: ['benefit', 'owner benefits', 'business benefits'] },
    ],
    table: {
      headers: ['Basis', 'Drawings', 'Expenses'],
      rows: [
        ['Purpose', 'The owner\'s personal use', 'Running the business and earning revenue'],
        ['Effect on profit', 'Profit is not reduced', 'Profit is reduced'],
        ['Shown in', 'Deducted from capital in the Balance Sheet', 'Charged to the Trading or Profit and Loss Account'],
        ['Benefit to', 'The owner', 'The business'],
      ],
    },
    markingTip: '1 mark for each basis with both sides; saying that both reduce capital is the likeness in the question, not a difference.',
    hints: ['Both lower capital: ask which one lowers the profit on the way.', 'Bases: purpose, effect on profit, where each is shown.'],
  },
  {
    id: 'w11-ae-003',
    topicId: 'accounting-equation',
    conceptId: 'ae-equation',
    difficulty: 'easy',
    form: 'explain',
    marks: 3,
    prompt: 'What is the accounting equation? Explain why it holds after every transaction.',
    pointsNeeded: 3,
    points: [
      { text: 'The equation: Assets = Liabilities + Capital; the resources of a business equal the claims of outsiders and of the owner on them.', keywords: ['assets = liabilities + capital', 'assets equal', 'claims'] },
      { text: 'Dual aspect: every transaction has two equal effects, so it changes at least two items by the same amount.', keywords: ['dual aspect', 'two effects', 'two aspects', 'equal effects'] },
      { text: 'Balance kept: the two effects are either on both sides (both rise or both fall) or on one side (one rises, one falls), so the two sides stay equal.', keywords: ['both sides', 'stay equal', 'remain equal', 'one rises'] },
    ],
    answer:
      '1. The equation: Assets = Liabilities + Capital. What a business owns is financed either by outsiders (liabilities) or by the owner (capital), so the assets always equal the two claims together.\n' +
      '2. Dual aspect: Every transaction has two equal effects, so it changes at least two items by the same amount.\n' +
      '3. Balance kept: Either both sides rise or fall by the same amount (goods bought on credit raise assets and liabilities), or one item on a side rises while another on the same side falls (furniture bought for cash). Either way the two sides stay equal.',
    markingTip: '1 mark for the equation with its meaning, 1 for the dual aspect, 1 for showing how the balance is kept; the equation written alone earns 1 mark only.',
    hints: ['Write the equation first, then name the concept that keeps it true.', 'Every transaction has two equal effects: show the two ways they can fall on the equation.'],
  },
  {
    id: 'w11-ae-004',
    topicId: 'accounting-equation',
    conceptId: 'ae-effects',
    difficulty: 'medium',
    form: 'explain',
    marks: 4,
    prompt: 'Explain, with an example of each, any four ways in which a transaction can affect the accounting equation.',
    pointsNeeded: 4,
    points: [
      { text: 'Assets and liabilities rise together: goods bought on credit for ₹30,000 raise stock and creditors by ₹30,000.', keywords: ['assets and liabilities rise', 'bought on credit', 'loan taken'] },
      { text: 'Assets and liabilities fall together: paying a creditor ₹10,000 lowers cash and creditors by ₹10,000.', keywords: ['assets and liabilities fall', 'paid a creditor', 'repaid'] },
      { text: 'Assets and capital rise together: the owner brings in ₹50,000, or an income is received.', keywords: ['assets and capital rise', 'capital introduced', 'income received'] },
      { text: 'Assets and capital fall together: rent of ₹5,000 paid, or drawings, lower cash and capital.', keywords: ['assets and capital fall', 'expense paid', 'drawings'] },
      { text: 'One asset replaces another: furniture bought for cash ₹8,000; the totals do not change.', keywords: ['one asset replaces', 'asset for asset', 'furniture bought for cash'] },
      { text: 'One liability replaces another: a bill accepted for a creditor; the totals do not change.', keywords: ['liability replaces', 'bill accepted', 'bills payable'] },
    ],
    answer:
      'Every transaction changes at least two items, and Assets = Liabilities + Capital still holds afterwards.\n' +
      '1. Assets and liabilities rise together: Goods bought on credit for ₹30,000 raise stock and creditors by ₹30,000.\n' +
      '2. Assets and liabilities fall together: ₹10,000 paid to a creditor lowers cash and creditors by ₹10,000.\n' +
      '3. Assets and capital rise together: The owner brings in ₹50,000 in cash, or commission of ₹2,000 is received.\n' +
      '4. Assets and capital fall together: Rent of ₹5,000 paid, or ₹3,000 drawn by the owner, lowers cash and capital.\n' +
      '5. One asset replaces another: Furniture bought for ₹8,000 in cash; furniture rises and cash falls, and the totals do not change.\n' +
      '6. One liability replaces another: A bill of ₹12,000 accepted for a creditor; bills payable rise and creditors fall, and the totals do not change.',
    markingTip: '½ mark for each effect stated and ½ for a correct example of it; an example that changes only one item is wrong and earns nothing.',
    hints: ['Think of the two sides of the equation: both can move, or only one side can move inside itself.', 'Start with a credit purchase (both sides rise) and a cash purchase of furniture (one asset for another).'],
  },
  {
    id: 'w11-ae-005',
    topicId: 'accounting-equation',
    conceptId: 'ae-unchanged',
    difficulty: 'easy',
    form: 'list',
    marks: 1,
    prompt: 'Give one example of a transaction that does not change the total of the accounting equation.',
    pointsNeeded: 1,
    points: [
      { text: 'Furniture, machinery or goods bought for cash: one asset replaces another.', keywords: ['bought for cash', 'cash purchase', 'furniture'] },
      { text: 'Cash deposited in the bank or withdrawn for office use.', keywords: ['deposited', 'bank', 'withdrawn for office'] },
      { text: 'Cash received from a debtor.', keywords: ['received from a debtor', 'debtor paid', 'collected'] },
      { text: 'A bill of exchange accepted for the amount owed to a creditor.', keywords: ['bill accepted', 'bills payable'] },
    ],
    answer: 'Furniture bought for ₹8,000 in cash: furniture rises by ₹8,000 and cash falls by ₹8,000, so total assets, and so the equation, stay the same. (Cash deposited in the bank, or cash received from a debtor, are other examples.)',
    markingTip: 'Any transaction in which one asset replaces another, or one liability another, earns the mark; a credit purchase changes the totals and earns nothing.',
    hints: ['Look for a transaction that swaps one asset for another.', 'Think of buying furniture for cash.'],
  },
  {
    id: 'w11-ae-006',
    topicId: 'accounting-equation',
    conceptId: 'ae-adjustments',
    difficulty: 'complex',
    form: 'explain',
    marks: 3,
    prompt: 'Explain the effect of each of the following on the accounting equation: (i) Goods costing ₹20,000 sold on credit for ₹26,000. (ii) Salary of ₹8,000 for March remains unpaid on 31 March. (iii) Depreciation of ₹5,000 charged on machinery.',
    pointsNeeded: 3,
    points: [
      { text: '(i) Stock falls by ₹20,000 and debtors rise by ₹26,000, so assets rise by ₹6,000; capital rises by the profit of ₹6,000; liabilities do not change.', keywords: ['6,000', 'debtors rise', 'stock falls', 'profit of'] },
      { text: '(ii) Outstanding salary, a liability, rises by ₹8,000 and capital falls by ₹8,000 (an expense); assets do not change.', keywords: ['outstanding salary', '8,000', 'liabilities rise'] },
      { text: '(iii) Machinery, an asset, falls by ₹5,000 and capital falls by ₹5,000; liabilities do not change and no cash moves.', keywords: ['machinery falls', '5,000', 'no cash'] },
    ],
    answer:
      '(i) Assets: stock falls by ₹20,000 and debtors rise by ₹26,000, a net rise of ₹6,000. Capital rises by ₹6,000, the profit on the sale. Liabilities: no change. ₹6,000 = ₹0 + ₹6,000.\n' +
      '(ii) Liabilities: outstanding salary rises by ₹8,000. Capital falls by ₹8,000, because the salary is an expense of March though unpaid. Assets: no change. ₹0 = ₹8,000 - ₹8,000.\n' +
      '(iii) Assets: machinery falls by ₹5,000. Capital falls by ₹5,000, because depreciation is an expense. Liabilities: no change, and no cash is paid. -₹5,000 = ₹0 - ₹5,000.',
    markingTip: '1 mark for each part, given only when all the items it changes are stated with their amounts and the equation still balances; in (i), taking ₹26,000 as the rise in capital earns nothing.',
    hints: ['In (i), stock leaves at cost and debtors come in at selling price: only the difference reaches capital.', 'Unpaid salary is still an expense of March; depreciation is an expense on which no cash is paid.'],
  },
  {
    id: 'w11-ae-007',
    topicId: 'accounting-equation',
    conceptId: 'ae-closing-capital',
    difficulty: 'medium',
    form: 'explain',
    marks: 4,
    prompt: 'Explain how the closing capital of a sole proprietor is found, and how the profit of the year is found from the opening and closing capital.',
    pointsNeeded: 2,
    points: [
      { text: 'Closing capital = Opening capital + Additional capital + Profit - Drawings (a loss is deducted instead of profit added).', keywords: ['opening capital + additional', 'closing capital =', 'add profit', 'less drawings'] },
      { text: 'Profit = Closing capital - Opening capital + Drawings - Additional capital; drawings are added back because they reduced capital without being a loss, and additional capital is taken out because it raised capital without being a profit.', keywords: ['add back drawings', 'added back', 'deduct additional capital', 'profit = closing'] },
    ],
    answer:
      '1. Closing capital: Closing capital = Opening capital + Additional capital + Profit - Drawings. Capital rises with fresh capital brought in and with the profit of the year, and falls with what the owner withdraws. With a loss, the loss is deducted instead of the profit added.\n' +
      '2. Profit from the two capitals: Profit = Closing capital - Opening capital + Drawings - Additional capital. The rise in capital is not all profit: drawings lowered capital without being a loss, so they are added back; additional capital raised it without being a profit, so it is taken out. A negative answer is a loss.',
    markingTip: '1 mark for each formula and 1 for the reason behind its terms; a formula with drawings and additional capital on the wrong sides earns nothing.',
    hints: ['Start from the opening capital and list everything that raised or lowered it during the year.', 'For the profit, turn the first formula round: drawings are added back, additional capital is deducted.'],
  },

  // Journal -------------------------------------------------------------------------------------------------------
  {
    id: 'w11-je-001',
    topicId: 'journal-entries',
    conceptId: 'je-settlement',
    difficulty: 'medium',
    form: 'distinguish',
    marks: 4,
    prompt: 'Distinguish between trade discount and cash discount on any four bases.',
    pointsNeeded: 4,
    points: [
      { text: 'Purpose: trade discount is given to encourage buying in larger quantity or to traders who resell; cash discount is given for prompt payment.', keywords: ['quantity', 'prompt payment', 'pay early', 'resell'] },
      { text: 'Recording: trade discount is not recorded in the books; cash discount is recorded.', keywords: ['not recorded', 'recorded in the books', 'discount allowed', 'discount received'] },
      { text: 'Time allowed: trade discount is allowed at the time of sale; cash discount at the time of payment.', keywords: ['time of sale', 'time of payment'] },
      { text: 'Deducted from: trade discount is deducted from the list price on the invoice; cash discount from the amount due after trade discount.', keywords: ['list price', 'invoice', 'amount due', 'net amount'] },
      { text: 'Shown on the invoice: trade discount is shown on the invoice; cash discount is not.', keywords: ['shown on the invoice', 'not shown'] },
      { text: 'Given on: trade discount on cash and credit sales alike; cash discount only when money is paid within the time allowed.', keywords: ['cash and credit', 'within the time', 'when paid'] },
    ],
    table: {
      headers: ['Basis', 'Trade discount', 'Cash discount'],
      rows: [
        ['Purpose', 'Encourages larger purchases; given to traders who resell', 'Encourages prompt payment'],
        ['Recording', 'Not recorded in the books', 'Recorded as discount allowed or received'],
        ['Time allowed', 'At the time of sale', 'At the time of payment'],
        ['Deducted from', 'The list price', 'The amount due after trade discount'],
        ['Shown on the invoice', 'Yes, deducted on its face', 'No'],
        ['Given on', 'Cash and credit sales', 'Only when payment is made within the time allowed'],
      ],
    },
    markingTip: '1 mark for each basis with both sides; "trade discount is bigger" is not a difference. The recording basis is the one examiners look for first.',
    hints: ['One discount is given at the counter, the other when the money comes in.', 'Bases: purpose, recording in the books, time allowed, deducted from.'],
  },
  {
    id: 'w11-je-002',
    topicId: 'journal-entries',
    conceptId: 'je-vouchers',
    difficulty: 'medium',
    form: 'distinguish',
    marks: 3,
    prompt: 'Distinguish between a source document and an accounting voucher on any three bases.',
    pointsNeeded: 3,
    points: [
      { text: 'Meaning: a source document is the original written evidence of a transaction; an accounting voucher is prepared from it to show the entry to be made.', keywords: ['original evidence', 'prepared from', 'evidence'] },
      { text: 'Prepared by: a source document usually comes from the party dealt with or the counter; a voucher is prepared by the firm\'s accountant.', keywords: ['accountant', 'party', 'prepared by'] },
      { text: 'Accounts named: a source document names no account; a voucher names the accounts debited and credited.', keywords: ['debited and credited', 'names the accounts', 'no account'] },
      { text: 'Examples: cash memo, invoice, receipt, pay-in slip; debit voucher, credit voucher, transfer voucher.', keywords: ['cash memo', 'invoice', 'debit voucher', 'transfer voucher'] },
      { text: 'Authorisation: a source document is signed or stamped by the party issuing it; a voucher is signed by the person who prepared it and by the officer who authorised it.', keywords: ['authorised', 'signature', 'authorisation'] },
    ],
    table: {
      headers: ['Basis', 'Source document', 'Accounting voucher'],
      rows: [
        ['Meaning', 'Original written evidence of a transaction', 'A document prepared from the evidence, showing the entry'],
        ['Prepared by', 'Usually the other party, or at the counter', 'The firm\'s accountant'],
        ['Accounts named', 'None', 'The accounts debited and credited, with amounts'],
        ['Examples', 'Cash memo, invoice, receipt, pay-in slip', 'Debit, credit and transfer vouchers'],
        ['Authorisation', 'Signed or stamped by the party issuing it', 'Signed by the preparer and by the authorising officer of the firm'],
      ],
    },
    markingTip: '1 mark for each basis with both sides; giving examples on one side only earns half.',
    hints: ['One is the evidence, the other is made from the evidence.', 'Bases: meaning, prepared by, accounts named.'],
  },
  {
    id: 'w11-je-003',
    topicId: 'journal-entries',
    conceptId: 'je-rules',
    difficulty: 'easy',
    form: 'list',
    marks: 4,
    prompt: 'State the rules of debit and credit under the accounting equation approach for any four types of accounts.',
    pointsNeeded: 4,
    points: [
      { text: 'Assets: an increase is debited and a decrease is credited.', keywords: ['assets', 'increase in assets'] },
      { text: 'Liabilities: an increase is credited and a decrease is debited.', keywords: ['liabilities', 'increase in liabilities'] },
      { text: 'Capital: an increase is credited and a decrease (including drawings) is debited.', keywords: ['capital', 'drawings'] },
      { text: 'Revenues and gains: an increase is credited and a decrease is debited.', keywords: ['revenue', 'income', 'gain'] },
      { text: 'Expenses and losses: an increase is debited and a decrease is credited.', keywords: ['expense', 'loss'] },
    ],
    answer:
      '1. Assets: An increase is debited; a decrease is credited.\n' +
      '2. Liabilities: An increase is credited; a decrease is debited.\n' +
      '3. Capital: An increase is credited; a decrease, such as drawings, is debited.\n' +
      '4. Revenues and gains: An increase is credited; a decrease is debited.\n' +
      '5. Expenses and losses: An increase is debited; a decrease is credited.',
    markingTip: '1 mark for each type with both its increase and decrease stated; a rule for the increase only earns half.',
    hints: ['Assets and expenses behave one way; liabilities, capital and revenues the other.', 'Assets: increase debit, decrease credit. Now do the same for the others.'],
  },
  {
    id: 'w11-je-004',
    topicId: 'journal-entries',
    conceptId: 'je-sets',
    difficulty: 'easy',
    form: 'features',
    marks: 3,
    prompt: 'State any three features of a journal.',
    pointsNeeded: 3,
    points: [
      { text: 'Book of original entry: a transaction is first recorded in the journal.', keywords: ['original entry', 'first recorded', 'prime entry'] },
      { text: 'Chronological order: transactions are recorded day by day in the order in which they happen.', keywords: ['chronological', 'order of date', 'day by day'] },
      { text: 'Both aspects together: each entry shows the account debited and the account credited, with equal amounts.', keywords: ['both aspects', 'debited and credited', 'equal amounts'] },
      { text: 'Narration: each entry carries a short explanation of the transaction.', keywords: ['narration', 'explanation'] },
      { text: 'Ledger folio: an L.F. column links each entry to the ledger page where it is posted.', keywords: ['ledger folio', 'l.f.', 'posted'] },
    ],
    answer:
      'The journal is the book in which transactions are first recorded. Its features are:\n' +
      '1. Book of original entry: Every transaction is first recorded in it, before it reaches the ledger.\n' +
      '2. Chronological order: Transactions are written day by day in the order in which they happen.\n' +
      '3. Both aspects together: Each entry shows the account debited and the account credited, with equal amounts.\n' +
      '4. Narration: Each entry carries a short explanation of the transaction.\n' +
      '5. Ledger folio: The L.F. column shows the page of the ledger to which the entry is posted.',
    markingTip: '1 mark for each feature with a line of explanation; the five columns of the journal listed as one point earn 1 mark at most.',
    hints: ['Think of where and in what order a transaction is first written down.', 'Start with "book of original entry" and "chronological order".'],
  },
  {
    id: 'w11-je-005',
    topicId: 'journal-entries',
    conceptId: 'je-compound',
    difficulty: 'medium',
    form: 'explain',
    marks: 3,
    prompt: 'What is a compound journal entry? When is it passed? Give an example.',
    pointsNeeded: 3,
    points: [
      { text: 'Meaning: an entry with more than one account debited, or more than one credited, or both.', keywords: ['more than one', 'several debits', 'several credits'] },
      { text: 'When passed: when two or more transactions of the same nature take place on the same date, or one transaction affects more than two accounts.', keywords: ['same date', 'same nature', 'more than two accounts'] },
      { text: 'Example: cash ₹19,600 received from Mohan in full settlement of ₹20,000: Cash A/c Dr ₹19,600, Discount Allowed A/c Dr ₹400, To Mohan ₹20,000.', keywords: ['discount allowed', 'full settlement', 'example'] },
    ],
    answer:
      '1. Meaning: A compound journal entry is one in which more than one account is debited, or more than one is credited, or both; the total of the debits still equals the total of the credits.\n' +
      '2. When passed: When two or more transactions of the same nature happen on the same date, or when one transaction affects more than two accounts. It saves time and space.\n' +
      '3. Example: Cash ₹19,600 received from Mohan in full settlement of ₹20,000:\n' +
      '   Cash A/c Dr ₹19,600\n' +
      '   Discount Allowed A/c Dr ₹400\n' +
      '      To Mohan ₹20,000\n' +
      '   (Cash received and discount allowed in full settlement)',
    markingTip: '1 mark each for the meaning, the occasion and a correct example; an example whose debits and credits do not total the same earns nothing.',
    hints: ['A simple entry has one debit and one credit; this one has more.', 'Settling a debtor\'s account with a discount gives two debits and one credit.'],
  },
  {
    id: 'w11-je-006',
    topicId: 'journal-entries',
    conceptId: 'je-gst-settlement',
    difficulty: 'complex',
    form: 'short-note',
    marks: 4,
    prompt: 'Write a short note on input tax credit under GST and how it is set off against output tax.',
    pointsNeeded: 4,
    points: [
      { text: 'Meaning: input tax credit is the GST a dealer has paid on purchases, which can be used to pay the GST collected on sales.', keywords: ['paid on purchases', 'input tax', 'tax paid on'] },
      { text: 'Nature: input GST is an asset (debit balance); output GST is a liability (credit balance).', keywords: ['asset', 'liability', 'debit balance', 'credit balance'] },
      { text: 'Head by head: input CGST is set off against output CGST and input SGST against output SGST, never CGST against SGST.', keywords: ['head by head', 'cgst against', 'sgst against', 'same head'] },
      { text: 'Balance: the output tax left after set-off is paid to the government; a credit left over is carried forward.', keywords: ['paid to the government', 'carried forward', 'balance left'] },
      { text: 'Benefit: it removes tax on tax, so only the value added at each stage is taxed.', keywords: ['tax on tax', 'cascading', 'value added'] },
    ],
    answer:
      '1. Meaning: Input tax credit is the GST a registered dealer has paid on purchases of goods and services for the business. It can be used to pay the GST the dealer collects on sales (output tax).\n' +
      '2. Nature of the accounts: Input CGST, SGST and IGST are assets with debit balances; Output CGST, SGST and IGST are liabilities with credit balances.\n' +
      '3. Set-off head by head: Input CGST is set off against output CGST, and input SGST against output SGST. CGST credit is never used against SGST, nor SGST credit against CGST; on supplies between states, input IGST is set off against output IGST. Entry: Output CGST A/c Dr, Output SGST A/c Dr; To Input CGST A/c, To Input SGST A/c.\n' +
      '4. Balance: The output tax left after the set-off is paid to the government (Output CGST A/c Dr, Output SGST A/c Dr; To Bank A/c). If the credit is larger than the output tax under a head, the balance is carried forward.\n' +
      '5. Benefit: Tax is not charged on tax; in effect only the value added at each stage is taxed.',
    markingTip: '1 mark for each point with its explanation; setting off CGST credit against SGST, or calling input GST an expense, costs the mark for that point.',
    hints: ['Start by saying what "input" tax is and where it comes from.', 'Then the rule of set-off: same head against same head, and what happens to the balance.'],
  },
  {
    id: 'w11-je-007',
    topicId: 'journal-entries',
    conceptId: 'je-rules',
    difficulty: 'easy',
    form: 'reasons',
    marks: 1,
    prompt: 'Why is a narration written below every journal entry?',
    pointsNeeded: 1,
    points: [
      { text: 'A narration is a short explanation of the transaction recorded, so that anyone reading the entry later understands what it was for.', keywords: ['explanation', 'explains', 'understand', 'brief'] },
    ],
    answer: 'A narration briefly explains the transaction recorded by the entry, so that anyone reading the books later, including the auditor, understands what the entry was for.',
    markingTip: 'The mark needs the idea of explaining the transaction; "because it is the rule" earns nothing.',
    hints: ['Read an entry a year later without it: what would be missing?', 'It explains the transaction in a line.'],
  },

  // Ledger --------------------------------------------------------------------------------------------------------
  {
    id: 'w11-led-001',
    topicId: 'ledger',
    conceptId: 'led-posting',
    difficulty: 'medium',
    form: 'distinguish',
    marks: 4,
    prompt: 'Distinguish between a journal and a ledger on any four bases.',
    pointsNeeded: 4,
    points: [
      { text: 'Nature of the book: the journal is the book of original entry; the ledger is the book of final (principal) entry.', keywords: ['original entry', 'final entry', 'principal'] },
      { text: 'Order of recording: the journal records in chronological order; the ledger records analytically, account by account.', keywords: ['chronological', 'analytical', 'account by account'] },
      { text: 'Process: recording in the journal is journalising; recording in the ledger is posting.', keywords: ['journalising', 'posting'] },
      { text: 'Narration: each journal entry has a narration; a ledger account has none.', keywords: ['narration'] },
      { text: 'Folio column: the journal has an L.F. column; the ledger has a J.F. column.', keywords: ['l.f.', 'j.f.', 'folio'] },
      { text: 'Position of an account and trial balance: the journal does not show the balance of an account; the ledger shows it, and a trial balance is drawn from the ledger.', keywords: ['balance of an account', 'trial balance', 'net position'] },
    ],
    table: {
      headers: ['Basis', 'Journal', 'Ledger'],
      rows: [
        ['Nature of the book', 'Book of original entry', 'Book of final (principal) entry'],
        ['Order of recording', 'Chronological, date by date', 'Analytical, account by account'],
        ['Process', 'Journalising', 'Posting'],
        ['Narration', 'Given with each entry', 'Not given'],
        ['Folio column', 'L.F. (ledger folio)', 'J.F. (journal folio)'],
        ['Balance of an account', 'Not shown; no trial balance can be drawn', 'Shown; the trial balance is drawn from it'],
      ],
    },
    markingTip: '1 mark for each basis with both sides; a basis written with one side only earns half. "Journal comes first" alone is not a basis.',
    hints: ['One book records the day\'s events in order; the other gathers each item in its own account.', 'Bases: nature of the book, order of recording, process, narration.'],
  },
  {
    id: 'w11-led-002',
    topicId: 'ledger',
    conceptId: 'led-closing',
    difficulty: 'complex',
    form: 'distinguish',
    marks: 3,
    prompt: 'Distinguish between closing a nominal account and balancing a real or personal account at the end of the year, on any three bases.',
    pointsNeeded: 3,
    points: [
      { text: 'Accounts concerned: closing applies to expenses, incomes, purchases and sales; balancing to assets, liabilities, capital, debtors and creditors.', keywords: ['expenses and incomes', 'assets', 'debtors', 'accounts concerned'] },
      { text: 'How it ends: a nominal account is closed by transfer to the Trading or Profit and Loss Account; a real or personal account is balanced by Balance c/d.', keywords: ['transfer', 'trading', 'balance c/d', 'carried down'] },
      { text: 'Next year: a closed account starts the new year empty; a balanced account opens with Balance b/d.', keywords: ['empty', 'balance b/d', 'brought down', 'opening balance'] },
      { text: 'Where the figure goes: the closed balance reaches the profit or loss; the carried-down balance appears in the Balance Sheet.', keywords: ['balance sheet', 'profit or loss', 'where it goes'] },
    ],
    table: {
      headers: ['Basis', 'Closing a nominal account', 'Balancing a real or personal account'],
      rows: [
        ['Accounts concerned', 'Expenses, incomes, purchases, sales and returns', 'Assets, liabilities, capital, debtors and creditors'],
        ['How it ends', 'Transferred to the Trading or Profit and Loss Account', 'Balance c/d written on the shorter side'],
        ['Next year', 'Starts empty', 'Opens with Balance b/d'],
        ['Where the figure goes', 'Into the profit or loss of the year', 'Into the Balance Sheet'],
      ],
    },
    markingTip: '1 mark for each basis with both sides; writing "Balance c/d" in a nominal account is the error examiners penalise.',
    hints: ['Ask which accounts are carried into the next year and which are not.', 'Bases: accounts concerned, how it ends, what happens next year.'],
  },
  {
    id: 'w11-led-003',
    topicId: 'ledger',
    conceptId: 'led-balances',
    difficulty: 'easy',
    form: 'list',
    marks: 3,
    prompt: 'State any three uses (utilities) of the ledger.',
    pointsNeeded: 3,
    points: [
      { text: 'Balance of each account: it shows the net position of every item, such as the cash in hand.', keywords: ['net position', 'balance of each', 'each account'] },
      { text: 'Amounts due: it shows what each debtor owes and what is owed to each creditor.', keywords: ['debtor owes', 'creditor', 'amounts due', 'owed'] },
      { text: 'Trial balance: the balances of the ledger are listed to check arithmetical accuracy.', keywords: ['trial balance', 'arithmetical'] },
      { text: 'Final accounts: the ledger balances are used to prepare the Trading and Profit and Loss Account and the Balance Sheet.', keywords: ['final accounts', 'balance sheet', 'profit and loss'] },
      { text: 'Analysis: it shows the total of each income and expense, which helps in comparison and control.', keywords: ['analysis', 'total of each', 'control', 'comparison'] },
    ],
    answer:
      '1. Balance of each account: The ledger shows the net position of every item, for example the cash in hand or the total of machinery.\n' +
      '2. Amounts due: It shows how much each debtor owes the business and how much the business owes each creditor.\n' +
      '3. Trial balance: Its balances are listed in a trial balance to check the arithmetical accuracy of the books.\n' +
      '4. Final accounts: Its balances are used to prepare the Trading and Profit and Loss Account and the Balance Sheet.\n' +
      '5. Analysis: It gives the total of each income and expense for the period, which helps in comparison and control.',
    markingTip: '1 mark for each use with its explanation; "it is the principal book" is a feature, not a use, and earns nothing.',
    hints: ['Ask what the owner can find out from the ledger that the journal does not tell.', 'Start with the balance of each account, then the trial balance.'],
  },
  {
    id: 'w11-led-004',
    topicId: 'ledger',
    conceptId: 'led-balancing',
    difficulty: 'medium',
    form: 'explain',
    marks: 4,
    prompt: 'Explain the steps followed in balancing a ledger account.',
    pointsNeeded: 4,
    points: [
      { text: 'Total each side: add up the debit side and the credit side separately.', keywords: ['total each side', 'add up', 'totalled'] },
      { text: 'Find the difference: write it on the shorter side as "To Balance c/d" or "By Balance c/d".', keywords: ['difference', 'shorter side', 'balance c/d'] },
      { text: 'Total both sides: the two totals are now equal and are written on the same line and ruled off.', keywords: ['equal', 'same line', 'ruled off'] },
      { text: 'Bring down: on the first day of the next period, write the balance on the opposite side as Balance b/d.', keywords: ['balance b/d', 'brought down', 'opposite side', 'next period'] },
    ],
    answer:
      '1. Total each side: Add up the debit side and the credit side of the account separately, in pencil or on a rough note.\n' +
      '2. Write the difference: Enter the difference on the shorter side as "To Balance c/d" (debit side) or "By Balance c/d" (credit side), dated the last day of the period.\n' +
      '3. Total both sides: The two sides now total the same; write the totals on the same line and rule them off.\n' +
      '4. Bring the balance down: On the first day of the next period, write the balance on the opposite side as "To Balance b/d" or "By Balance b/d". A larger debit side gives a debit balance; a larger credit side, a credit balance.',
    markingTip: '1 mark for each step in its order; writing Balance c/d on the larger side reverses the balance and loses the marks for steps 2 and 4.',
    hints: ['Think of what is done first with the two sides, and what happens on the first day of the next period.', 'The difference goes on the shorter side as c/d; it comes back on the other side as b/d.'],
  },
  {
    id: 'w11-led-005',
    topicId: 'ledger',
    conceptId: 'led-posting',
    difficulty: 'easy',
    form: 'explain',
    marks: 1,
    prompt: 'What is meant by posting?',
    pointsNeeded: 1,
    points: [
      { text: 'Posting is transferring each debit and credit of a journal entry to the same side of the account it names in the ledger.', keywords: ['transfer', 'journal to the ledger', 'copying', 'from the journal'] },
    ],
    answer: 'Posting is the process of transferring each debit and credit of the journal (or a subsidiary book) to the same side of the account it names in the ledger.',
    markingTip: 'The mark needs the idea of transfer from the journal to the ledger accounts; "entering in the ledger" without the source earns half.',
    hints: ['From which book, to which book?', 'Each debit goes to the debit side of its own account.'],
  },
  {
    id: 'w11-led-006',
    topicId: 'ledger',
    conceptId: 'led-normal',
    difficulty: 'complex',
    form: 'reasons',
    marks: 3,
    prompt: 'State, with a reason, the balance (debit or credit) normally shown by each of the following accounts: (i) Drawings A/c (ii) Purchases Return A/c (iii) Provision for Depreciation A/c.',
    pointsNeeded: 3,
    points: [
      { text: '(i) Drawings: a debit balance, because drawings reduce capital, which is a credit balance.', keywords: ['drawings', 'debit balance', 'reduce capital'] },
      { text: '(ii) Purchases Return: a credit balance, because it reduces purchases, which is a debit balance.', keywords: ['purchases return', 'reduces purchases'] },
      { text: '(iii) Provision for Depreciation: a credit balance, because it is set against the asset, which is a debit balance.', keywords: ['provision for depreciation', 'against the asset', 'deducted from'] },
    ],
    answer:
      'Each of these accounts reduces another account, so its balance is on the side opposite to that account.\n' +
      '(i) Drawings A/c: Debit balance. Drawings reduce the owner\'s capital, which has a credit balance.\n' +
      '(ii) Purchases Return A/c: Credit balance. Returns reduce purchases, which have a debit balance.\n' +
      '(iii) Provision for Depreciation A/c: Credit balance. It is deducted from the fixed asset, which has a debit balance.',
    markingTip: '½ mark for the right side and ½ for the reason in each part; a side with no reason earns half.',
    hints: ['Each of these accounts reduces another account: find that account first.', 'An account that reduces a credit balance has a debit balance, and the other way round.'],
  },
  {
    id: 'w11-led-007',
    topicId: 'ledger',
    conceptId: 'led-to-by',
    difficulty: 'easy',
    form: 'explain',
    marks: 3,
    prompt: 'Explain the use of the words "To" and "By" in a ledger account.',
    pointsNeeded: 3,
    points: [
      { text: '"To" begins every entry on the debit side of an account.', keywords: ['debit side', 'to begins', 'word to'] },
      { text: '"By" begins every entry on the credit side of an account.', keywords: ['credit side', 'by begins', 'word by'] },
      { text: 'After To or By, the name of the other account of the entry is written, never the account in which the entry is made.', keywords: ['other account', 'opposite account', 'never the account'] },
    ],
    answer:
      '1. "To": Every item on the debit side of an account begins with the word "To".\n' +
      '2. "By": Every item on the credit side begins with the word "By".\n' +
      '3. What follows them: After To or By, the name of the other account of the journal entry is written, never the account in which the item is posted. For example, cash sales are posted in Cash A/c as "To Sales A/c" and in Sales A/c as "By Cash A/c".',
    markingTip: '1 mark for each point; writing the name of the account itself after To or By is the error examiners look for.',
    hints: ['One word belongs to the debit side, the other to the credit side.', 'Ask whose name comes after the word: the account itself, or the other account of the entry?'],
  },

  // Special Purpose Books: subsidiary books -----------------------------------------------------------------------
  {
    id: 'w11-sb-001',
    topicId: 'subsidiary-books',
    conceptId: 'sb-documents',
    difficulty: 'medium',
    form: 'distinguish',
    marks: 3,
    prompt: 'Distinguish between a debit note and a credit note on any three bases.',
    pointsNeeded: 3,
    points: [
      { text: 'Prepared by: a debit note is prepared by the buyer who returns goods; a credit note by the seller who takes them back.', keywords: ['buyer', 'seller', 'prepared by'] },
      { text: 'Sent to: a debit note is sent to the supplier; a credit note is sent to the customer.', keywords: ['sent to the supplier', 'sent to the customer', 'sent to'] },
      { text: 'Message: a debit note says the supplier\'s account has been debited; a credit note says the customer\'s account has been credited.', keywords: ['supplier\'s account debited', 'customer\'s account credited', 'account has been'] },
      { text: 'Book written from it: a debit note is the source of the Purchases Return Book; a credit note of the Sales Return Book.', keywords: ['purchases return book', 'sales return book', 'returns outward', 'returns inward'] },
    ],
    table: {
      headers: ['Basis', 'Debit note', 'Credit note'],
      rows: [
        ['Prepared by', 'The buyer who returns the goods', 'The seller who receives them back'],
        ['Sent to', 'The supplier', 'The customer'],
        ['Message', 'The supplier\'s account has been debited', 'The customer\'s account has been credited'],
        ['Book written from it', 'Purchases Return Book', 'Sales Return Book'],
      ],
    },
    markingTip: '1 mark for each basis with both sides; mixing up which party prepares which note loses that row and usually the next.',
    hints: ['Both are made when goods are returned: ask who makes each one.', 'Bases: prepared by, sent to, the book written from it.'],
  },
  {
    id: 'w11-sb-002',
    topicId: 'subsidiary-books',
    conceptId: 'sb-returns',
    difficulty: 'medium',
    form: 'distinguish',
    marks: 4,
    prompt: 'Distinguish between the Purchases Book and the Purchases Return Book on any four bases.',
    pointsNeeded: 4,
    points: [
      { text: 'What is recorded: the Purchases Book records credit purchases of goods for resale; the Purchases Return Book records goods returned to suppliers.', keywords: ['credit purchases', 'returned to suppliers', 'goods returned'] },
      { text: 'Source document: the Purchases Book is written from suppliers\' invoices; the Purchases Return Book from debit notes.', keywords: ['invoice', 'debit note', 'source'] },
      { text: 'Posting to the supplier: each supplier is credited from the Purchases Book and debited from the Purchases Return Book.', keywords: ['supplier credited', 'supplier debited', 'personal account'] },
      { text: 'Posting the total: the total of the Purchases Book is debited to Purchases A/c; that of the return book is credited to Purchases Return A/c.', keywords: ['purchases a/c debited', 'purchases return a/c credited', 'total posted'] },
      { text: 'Other name: the Purchases Return Book is also called the Returns Outward Book; the Purchases Book is also called the Invoice Book or Bought Book.', keywords: ['returns outward', 'bought book', 'invoice book'] },
    ],
    table: {
      headers: ['Basis', 'Purchases Book', 'Purchases Return Book'],
      rows: [
        ['What is recorded', 'Credit purchases of goods for resale', 'Goods returned to suppliers'],
        ['Source document', 'Suppliers\' invoices', 'Debit notes'],
        ['Posting to the supplier', 'Each supplier credited', 'Each supplier debited'],
        ['Posting the total', 'Debited to Purchases A/c', 'Credited to Purchases Return A/c'],
        ['Other name', 'Bought Book or Invoice Book', 'Returns Outward Book'],
      ],
    },
    markingTip: '1 mark for each basis with both books; the posting rows are lost if the sides are reversed.',
    hints: ['One book brings goods in on credit, the other sends some back.', 'Bases: what is recorded, source document, posting to the supplier, posting the total.'],
  },
  {
    id: 'w11-sb-003',
    topicId: 'subsidiary-books',
    conceptId: 'sb-which-book',
    difficulty: 'easy',
    form: 'list',
    marks: 4,
    prompt: 'State any four advantages of maintaining subsidiary books.',
    pointsNeeded: 4,
    points: [
      { text: 'Division of work: different clerks can keep different books at the same time.', keywords: ['division of work', 'different clerks', 'same time'] },
      { text: 'Specialisation and efficiency: a clerk who keeps one book becomes skilled at it.', keywords: ['specialisation', 'efficiency', 'skilled'] },
      { text: 'Saving of time: only the period totals are posted to the impersonal accounts, so posting is much less.', keywords: ['saves time', 'totals are posted', 'less posting'] },
      { text: 'Easy reference: all transactions of one kind are found in one place.', keywords: ['reference', 'one place', 'easy to find'] },
      { text: 'Fewer errors and frauds: separate books and their totals make errors easier to find and fraud harder.', keywords: ['errors', 'fraud', 'check'] },
      { text: 'A ledger less crowded: Purchases A/c and Sales A/c receive one total a period instead of many entries.', keywords: ['less crowded', 'fewer entries', 'one total'] },
    ],
    answer:
      '1. Division of work: Different clerks can write up different books at the same time.\n' +
      '2. Specialisation: A clerk who keeps one kind of book becomes skilled at it and works faster.\n' +
      '3. Saving of time: Only the period totals are posted to Purchases, Sales and the return accounts, which saves posting.\n' +
      '4. Easy reference: All transactions of one kind, such as credit sales, are found in one book.\n' +
      '5. Fewer errors and frauds: Separate books and their totals help locate errors and make fraud harder.\n' +
      '6. A ledger less crowded: Purchases A/c and Sales A/c receive one total a period instead of many entries.',
    markingTip: '1 mark for each advantage with a line of explanation; division of work and specialisation count as two points only when both are explained.',
    hints: ['Think of a busy shop recording every credit sale in the journal: what goes wrong?', 'Start with division of work and saving of time.'],
  },
  {
    id: 'w11-sb-004',
    topicId: 'subsidiary-books',
    conceptId: 'sb-journal-proper',
    difficulty: 'easy',
    form: 'list',
    marks: 3,
    prompt: 'Name any three kinds of transactions recorded in the Journal Proper.',
    pointsNeeded: 3,
    points: [
      { text: 'Opening entries at the start of the year.', keywords: ['opening entry', 'opening entries'] },
      { text: 'Closing and transfer entries at the end of the year.', keywords: ['closing entries', 'transfer entries', 'closing entry'] },
      { text: 'Adjusting entries, such as outstanding expenses and depreciation.', keywords: ['adjusting', 'adjustment', 'outstanding', 'depreciation'] },
      { text: 'Rectifying entries that correct errors.', keywords: ['rectifying', 'rectification', 'correct errors'] },
      { text: 'Credit purchase or sale of assets, which are not goods for resale.', keywords: ['credit purchase of', 'assets on credit', 'sale of assets'] },
      { text: 'Goods withdrawn by the owner or given as charity, and bad debts written off.', keywords: ['withdrawn', 'charity', 'bad debts'] },
    ],
    answer:
      'The Journal Proper records every transaction that no other subsidiary book takes. For example:\n' +
      '1. Opening entries at the start of the year.\n' +
      '2. Closing and transfer entries at the end of the year.\n' +
      '3. Adjusting entries, such as outstanding expenses and depreciation.\n' +
      '4. Rectifying entries that correct errors.\n' +
      '5. Credit purchase or sale of assets, which are not goods for resale.\n' +
      '6. Goods withdrawn by the owner or given as charity, and bad debts written off.',
    markingTip: '1 mark for each kind correctly named; a credit purchase of goods for resale belongs to the Purchases Book and earns nothing.',
    hints: ['The Journal Proper takes what the cash book and the four goods books do not.', 'Think of entries passed at the start and the end of the year.'],
  },
  {
    id: 'w11-sb-005',
    topicId: 'subsidiary-books',
    conceptId: 'sb-which-book',
    difficulty: 'medium',
    form: 'reasons',
    marks: 3,
    prompt: 'Give three kinds of purchases that are not recorded in the Purchases Book, with the reason in each case.',
    pointsNeeded: 3,
    points: [
      { text: 'Cash purchases of goods: they go in the Cash Book, because money is paid at once.', keywords: ['cash purchases', 'cash book', 'paid at once'] },
      { text: 'Credit purchases of assets such as furniture or machinery: they go in the Journal Proper, because they are not goods for resale.', keywords: ['assets', 'furniture', 'machinery', 'not for resale'] },
      { text: 'Credit purchases of items for use, such as stationery for the office: they are not goods in which the business deals, so they go in the Journal Proper.', keywords: ['stationery', 'for use', 'not goods in which'] },
      { text: 'Goods returned to suppliers: they go in the Purchases Return Book.', keywords: ['returned', 'purchases return book'] },
    ],
    answer:
      'The Purchases Book records only credit purchases of goods in which the business deals. So it does not record:\n' +
      '1. Cash purchases of goods: Money is paid at once, so they are entered in the Cash Book.\n' +
      '2. Credit purchases of assets, such as furniture or machinery: They are not bought for resale, so they are entered in the Journal Proper.\n' +
      '3. Credit purchases of items for use, such as stationery for the office: They are not goods in which the business deals, so they also go in the Journal Proper.\n' +
      '4. Goods returned to suppliers: They are entered in the Purchases Return Book.',
    markingTip: '½ mark for each kind and ½ for its reason or right book; a kind with no reason earns half.',
    hints: ['The Purchases Book has two conditions: credit, and goods for resale. Break each in turn.', 'A cash purchase breaks the first; furniture on credit breaks the second.'],
  },
  {
    id: 'w11-sb-006',
    topicId: 'subsidiary-books',
    conceptId: 'sb-posting',
    difficulty: 'complex',
    form: 'explain',
    marks: 4,
    prompt: 'A trader keeps a Sales Book with GST columns for sales within the state. Explain how this book is posted to the ledger.',
    pointsNeeded: 4,
    points: [
      { text: 'Each customer: the account of each customer is debited, invoice by invoice, with the invoice total including GST.', keywords: ['each customer', 'customer debited', 'invoice total', 'individually'] },
      { text: 'Sales A/c: the period total of the value of goods (after trade discount, before GST) is credited to Sales A/c.', keywords: ['sales a/c', 'before gst', 'goods column', 'period total'] },
      { text: 'Output tax: the totals of the CGST and SGST columns are credited to Output CGST A/c and Output SGST A/c.', keywords: ['output cgst', 'output sgst', 'output tax'] },
      { text: 'Check: the customers\' debits together equal the credits to Sales and the two output tax accounts, so double entry is complete.', keywords: ['double entry', 'debits equal', 'agree'] },
      { text: 'Trade discount is not posted anywhere: only the net amount is in the book.', keywords: ['trade discount', 'not posted', 'net amount'] },
    ],
    answer:
      '1. Each customer: Each invoice is posted to the debit of the customer\'s account with the invoice total, including GST, usually day by day.\n' +
      '2. Sales A/c: At the end of the period, the total of the goods column (the value after trade discount, before GST) is credited to Sales A/c.\n' +
      '3. Output tax: The totals of the CGST and SGST columns are credited to Output CGST A/c and Output SGST A/c.\n' +
      '4. Check: The debits to the customers together equal the credits to Sales A/c and the two output tax accounts, so the double entry is complete.\n' +
      '5. Trade discount: It is not posted anywhere; only the amount after it appears in the book.',
    markingTip: '1 mark for each step with the right side and account; crediting Sales A/c with the invoice total including GST costs the marks for both the Sales and the output tax steps.',
    hints: ['Two kinds of posting happen: one per invoice, one per period total.', 'Customers are posted one by one; ask what is done with each column total at the end of the period.'],
  },
  {
    id: 'w11-sb-007',
    topicId: 'subsidiary-books',
    conceptId: 'sb-documents',
    difficulty: 'easy',
    form: 'explain',
    marks: 1,
    prompt: 'What is an invoice?',
    pointsNeeded: 1,
    points: [
      { text: 'An invoice is a document prepared by the seller and sent to the buyer, giving the details of goods sold on credit: quantity, rate, trade discount, GST and the amount payable.', keywords: ['seller', 'goods sold', 'details', 'amount payable', 'bill'] },
    ],
    answer: 'An invoice (bill) is a document prepared by the seller and sent to the buyer when goods are sold, giving the quantity, rate, trade discount, GST and the total amount payable. It is the source of entries in the Purchases Book and the Sales Book.',
    markingTip: 'The mark needs who prepares it and what it shows; "a receipt for cash" is wrong and earns nothing.',
    hints: ['Who makes it out, and what does it list?', 'The seller sends it with the goods sold on credit.'],
  },

  // Cash Book -----------------------------------------------------------------------------------------------------
  {
    id: 'w11-cb-001',
    topicId: 'cash-book',
    conceptId: 'cb-petty',
    difficulty: 'medium',
    form: 'distinguish',
    marks: 4,
    prompt: 'Distinguish between the cash book and the petty cash book on any four bases.',
    pointsNeeded: 4,
    points: [
      { text: 'Payments recorded: the cash book records all receipts and payments, large and small; the petty cash book only small, routine payments.', keywords: ['all receipts', 'small payments', 'routine'] },
      { text: 'Kept by: the cash book is kept by the head cashier; the petty cash book by the petty cashier.', keywords: ['head cashier', 'petty cashier'] },
      { text: 'Receipts: the cash book records receipts from many sources; the petty cash book receives money only from the head cashier.', keywords: ['many sources', 'only from the head cashier', 'from the head cashier'] },
      { text: 'Analysis columns: the petty cash book has columns for each kind of small expense; the cash book has none.', keywords: ['analysis columns', 'analytical', 'columns for each'] },
      { text: 'Balance held: the cash book has no fixed balance; the petty cash book works on a fixed imprest, made up again at the end of each period.', keywords: ['imprest', 'fixed sum', 'made up again', 'fixed balance'] },
    ],
    table: {
      headers: ['Basis', 'Cash book', 'Petty cash book'],
      rows: [
        ['Payments recorded', 'All receipts and payments, large and small', 'Only small, routine payments'],
        ['Kept by', 'The head cashier', 'The petty cashier'],
        ['Receipts', 'From many sources', 'Only from the head cashier'],
        ['Analysis columns', 'None', 'One column for each kind of small expense'],
        ['Balance held', 'No fixed balance', 'A fixed imprest, made up again each period'],
      ],
    },
    markingTip: '1 mark for each basis with both books; "petty cash book is smaller" with no basis earns nothing.',
    hints: ['Who keeps each book, and what kind of payments does each take?', 'Bases: payments recorded, kept by, receipts, analysis columns.'],
  },
  {
    id: 'w11-cb-002',
    topicId: 'cash-book',
    conceptId: 'cb-double',
    difficulty: 'easy',
    form: 'distinguish',
    marks: 3,
    prompt: 'Distinguish between a single column cash book and a double column cash book on any three bases.',
    pointsNeeded: 3,
    points: [
      { text: 'Amount columns: a single column cash book has one amount column (cash) on each side; a double column cash book has two (cash and bank).', keywords: ['one amount column', 'two columns', 'cash and bank'] },
      { text: 'Transactions recorded: the single column book records cash dealings only; the double column book records cash and bank dealings.', keywords: ['cash only', 'bank dealings', 'cheques'] },
      { text: 'Contra entries: there are none in a single column cash book; a double column cash book records them.', keywords: ['contra'] },
      { text: 'Ledger accounts replaced: the single column book replaces Cash A/c; the double column book replaces both Cash A/c and Bank A/c.', keywords: ['replaces', 'cash a/c and bank a/c', 'bank account'] },
      { text: 'Credit balance: a single column cash book never shows one; the bank column of a double column cash book may show an overdraft.', keywords: ['overdraft', 'credit balance'] },
    ],
    table: {
      headers: ['Basis', 'Single column cash book', 'Double column cash book'],
      rows: [
        ['Amount columns', 'One, for cash, on each side', 'Two, for cash and bank, on each side'],
        ['Transactions recorded', 'Cash receipts and payments only', 'Cash and bank receipts and payments'],
        ['Contra entries', 'None', 'Recorded, marked "C"'],
        ['Ledger accounts replaced', 'Cash A/c', 'Cash A/c and Bank A/c'],
        ['Credit balance', 'Never', 'The bank column may show an overdraft'],
      ],
    },
    markingTip: '1 mark for each basis with both sides; a discount column is not part of the double column cash book in the current syllabus and earns nothing.',
    hints: ['Count the amount columns on each side, and ask what the extra one is for.', 'Bases: amount columns, transactions recorded, contra entries.'],
  },
  {
    id: 'w11-cb-003',
    topicId: 'cash-book',
    conceptId: 'cb-contra',
    difficulty: 'easy',
    form: 'explain',
    marks: 3,
    prompt: 'What is a contra entry? Give two examples of it.',
    pointsNeeded: 3,
    points: [
      { text: 'Meaning: a contra entry is one whose debit and credit are both in the cash book, because it affects both the cash and the bank columns.', keywords: ['both sides', 'cash and bank columns', 'both in the cash book'] },
      { text: 'Cash deposited into the bank: debit the bank column, credit the cash column.', keywords: ['deposited', 'paid into the bank'] },
      { text: 'Cash withdrawn from the bank for office use: debit the cash column, credit the bank column.', keywords: ['withdrawn', 'drawn from the bank', 'office use'] },
      { text: 'It is marked "C" in the L.F. column and is not posted to the ledger.', keywords: ['marked c', 'not posted', 'l.f. column'] },
    ],
    answer:
      '1. Meaning: A contra entry is a transaction that affects both the cash and the bank columns of a double column cash book, so its debit and its credit are both recorded in the cash book. It is marked "C" in the L.F. column and is not posted to the ledger.\n' +
      '2. Cash deposited into the bank: Bank column debited, cash column credited.\n' +
      '3. Cash withdrawn from the bank for office use: Cash column debited, bank column credited.',
    markingTip: '1 mark for the meaning and 1 for each example with its sides; cash withdrawn for the owner\'s personal use is drawings, not a contra entry, and earns nothing.',
    hints: ['Look for a transaction that moves money between the two columns only.', 'Paying cash into the bank is the first example; think of the reverse.'],
  },
  {
    id: 'w11-cb-004',
    topicId: 'cash-book',
    conceptId: 'cb-petty',
    difficulty: 'medium',
    form: 'list',
    marks: 3,
    prompt: 'State any three advantages of the imprest system of petty cash.',
    pointsNeeded: 3,
    points: [
      { text: 'Control over small payments: the petty cashier can never spend more than the fixed imprest.', keywords: ['control', 'fixed sum', 'never spend more'] },
      { text: 'Saves the head cashier\'s time: small payments are left to the petty cashier.', keywords: ['saves time', 'head cashier', 'relieved'] },
      { text: 'Regular check: the head cashier checks the vouchers before each reimbursement.', keywords: ['vouchers', 'reimbursement', 'reimbursed'] },
      { text: 'Fraud is limited: the cash in the petty cashier\'s hands is small and checked often.', keywords: ['fraud', 'misuse', 'small amount'] },
      { text: 'Easy posting: the totals of the analysis columns are posted to the expense accounts once a period.', keywords: ['analysis columns', 'totals posted', 'posting'] },
    ],
    answer:
      'Under the imprest system the petty cashier is given a fixed sum, and at the end of each period is paid exactly what was spent. Its advantages are:\n' +
      '1. Control: The petty cashier can never spend more than the fixed imprest.\n' +
      '2. Saves the head cashier\'s time: Small, routine payments are left to the petty cashier.\n' +
      '3. Regular check: The head cashier checks the petty cash vouchers before each reimbursement.\n' +
      '4. Fraud is limited: The cash in the petty cashier\'s hands is small and checked often.\n' +
      '5. Easy posting: Only the totals of the analysis columns are posted to the expense accounts each period.',
    markingTip: '1 mark for each advantage with a line of explanation; describing the system without an advantage earns nothing.',
    hints: ['The imprest is a fixed sum, topped up by exactly what was spent: what does that make easy?', 'Start with control over small payments and saving the head cashier\'s time.'],
  },
  {
    id: 'w11-cb-005',
    topicId: 'cash-book',
    conceptId: 'cb-single',
    difficulty: 'complex',
    form: 'reasons',
    marks: 3,
    prompt: 'The cash book is called both a book of original entry and a ledger. Give three reasons for this.',
    pointsNeeded: 3,
    points: [
      { text: 'Original entry: cash transactions are first recorded in the cash book, in order of date, straight from the vouchers.', keywords: ['first recorded', 'original entry', 'order of date', 'vouchers'] },
      { text: 'No Cash A/c in the ledger: the cash book itself serves as the Cash Account (and Bank Account), so no separate account is opened.', keywords: ['no cash account', 'serves as', 'separate account'] },
      { text: 'Ledger form: it has debit and credit sides with "To" and "By", and is balanced like any ledger account.', keywords: ['to and by', 'balanced', 'debit and credit sides', 'ledger form'] },
      { text: 'Posting: only the other account of each entry is posted to the ledger.', keywords: ['other account', 'only the other'] },
    ],
    answer:
      '1. Original entry: Cash and bank transactions are first recorded in the cash book, in order of date, straight from the vouchers; they are not journalised first.\n' +
      '2. Replaces the ledger account: No Cash Account (or Bank Account) is opened in the ledger; the cash book serves as that account.\n' +
      '3. Ledger form: It has a debit and a credit side, uses "To" and "By", and is balanced like any ledger account.\n' +
      '4. Posting: From the cash book, only the other account of each entry is posted to the ledger.',
    markingTip: '1 mark for each reason; reasons 1 and 2 are the ones expected, and a reason that only repeats the question earns nothing.',
    hints: ['Ask where a cash transaction is first written, and whether a Cash Account is then opened in the ledger.', 'It records in date order like a journal, and is balanced like a ledger account.'],
  },
  {
    id: 'w11-cb-006',
    topicId: 'cash-book',
    conceptId: 'cb-sides',
    difficulty: 'complex',
    form: 'explain',
    marks: 3,
    prompt: 'Explain how a cheque received from a customer is entered in a double column cash book when (i) it is deposited in the bank on the same day, (ii) it is deposited a few days later, and (iii) the bank later returns it dishonoured.',
    pointsNeeded: 3,
    points: [
      { text: '(i) Same day: it is entered on the debit side in the bank column.', keywords: ['same day', 'bank column', 'debit side'] },
      { text: '(ii) Later: on receipt it is entered on the debit side in the cash column; on deposit, a contra entry debits the bank column and credits the cash column.', keywords: ['cash column', 'contra', 'treated as cash'] },
      { text: '(iii) Dishonoured: it is entered on the credit side in the bank column, and the customer\'s account is debited again.', keywords: ['dishonoured', 'credit side', 'customer debited'] },
    ],
    answer:
      '(i) Deposited the same day: Entered on the debit side in the bank column, "To <Customer>".\n' +
      '(ii) Deposited later: On the day of receipt it is treated as cash and entered on the debit side in the cash column. On the day it is deposited, a contra entry is made: bank column debited, cash column credited.\n' +
      '(iii) Dishonoured: The bank takes the amount back, so it is entered on the credit side in the bank column, "By <Customer>", and the customer again owes the amount.',
    markingTip: '1 mark for each case with the right side and the right column; a case with the side right but the column wrong earns half.',
    hints: ['A cheque in hand is treated as cash until it reaches the bank.', 'A dishonoured cheque reverses the bank receipt: which side of the bank column is that?'],
  },
  {
    id: 'w11-cb-007',
    topicId: 'cash-book',
    conceptId: 'cb-balancing',
    difficulty: 'easy',
    form: 'reasons',
    marks: 1,
    prompt: 'Why can the cash column of a cash book never show a credit balance?',
    pointsNeeded: 1,
    points: [
      { text: 'Payments of cash can never be more than the cash available, so the credit side of the cash column can never exceed the debit side.', keywords: ['more than', 'cash available', 'cannot pay', 'exceed'] },
    ],
    answer: 'A business cannot pay out more cash than it has. So the payments (credit side) of the cash column can never be more than the receipts and opening balance (debit side), and the cash column always shows a debit balance or none.',
    markingTip: 'The mark needs the reason that payments cannot exceed the cash available; "because cash is an asset" alone earns nothing.',
    hints: ['Can you hand over more notes than you have?', 'Only the bank column can go into overdraft.'],
  },

  // Bank Reconciliation Statement ---------------------------------------------------------------------------------
  {
    id: 'w11-brs-001',
    topicId: 'bank-reconciliation',
    conceptId: 'brs-why',
    difficulty: 'medium',
    form: 'distinguish',
    marks: 4,
    prompt: 'Distinguish between a cash book (bank column) and a pass book on any four bases.',
    pointsNeeded: 4,
    points: [
      { text: 'Kept by: the cash book is written by the firm; the pass book by the bank.', keywords: ['written by the firm', 'by the bank', 'kept by'] },
      { text: 'What it is: the cash book is the firm\'s own record of its bank dealings; the pass book is a copy of the firm\'s account in the bank\'s books.', keywords: ['copy', 'bank\'s books', 'own record'] },
      { text: 'Favourable balance: a debit balance in the cash book; a credit balance in the pass book.', keywords: ['favourable', 'debit balance', 'credit balance'] },
      { text: 'Overdraft: a credit balance in the cash book; a debit balance in the pass book.', keywords: ['overdraft'] },
      { text: 'Deposits: entered on the debit side of the cash book; shown in the credit (deposit) column of the pass book.', keywords: ['deposit', 'deposits', 'debit side'] },
      { text: 'Withdrawals: entered on the credit side of the cash book; shown in the debit (withdrawal) column of the pass book.', keywords: ['withdrawal', 'withdrawals', 'cheques issued'] },
    ],
    table: {
      headers: ['Basis', 'Cash book (bank column)', 'Pass book'],
      rows: [
        ['Kept by', 'The firm', 'The bank'],
        ['What it is', 'The firm\'s own record of its bank dealings', 'A copy of the firm\'s account in the bank\'s books'],
        ['Favourable balance', 'Debit balance', 'Credit balance'],
        ['Overdraft', 'Credit balance', 'Debit balance'],
        ['Deposits', 'Debit side', 'Credit (deposit) column'],
        ['Withdrawals', 'Credit side', 'Debit (withdrawal) column'],
      ],
    },
    markingTip: '1 mark for each basis with both books; the favourable balance and overdraft rows are the ones most often reversed, and a reversed row earns nothing.',
    hints: ['Both record one bank account, from two sides of the counter.', 'Bases: kept by, favourable balance, overdraft, deposits.'],
  },
  {
    id: 'w11-brs-002',
    topicId: 'bank-reconciliation',
    conceptId: 'brs-overdraft',
    difficulty: 'easy',
    form: 'distinguish',
    marks: 3,
    prompt: 'Distinguish between a favourable bank balance and a bank overdraft on any three bases.',
    pointsNeeded: 3,
    points: [
      { text: 'Meaning: a favourable balance is money the firm has in the bank; an overdraft is money the firm has drawn beyond its deposit and owes the bank.', keywords: ['money in the bank', 'owes the bank', 'beyond'] },
      { text: 'In the cash book: a favourable balance is a debit balance; an overdraft is a credit balance.', keywords: ['cash book', 'debit balance in the cash book', 'credit balance in the cash book'] },
      { text: 'In the pass book: a favourable balance is a credit balance; an overdraft is a debit balance.', keywords: ['pass book', 'credit balance in the pass book', 'debit balance in the pass book'] },
      { text: 'Shown in the Balance Sheet: a favourable balance as a current asset; an overdraft as a current liability.', keywords: ['current asset', 'current liability', 'balance sheet'] },
      { text: 'Interest: the bank may pay interest on a favourable balance; the firm pays interest on an overdraft.', keywords: ['interest'] },
    ],
    table: {
      headers: ['Basis', 'Favourable balance', 'Bank overdraft'],
      rows: [
        ['Meaning', 'Money the firm has in the bank', 'Money drawn beyond the deposit, owed to the bank'],
        ['In the cash book', 'Debit balance', 'Credit balance'],
        ['In the pass book', 'Credit balance', 'Debit balance'],
        ['In the Balance Sheet', 'A current asset', 'A current liability'],
        ['Interest', 'May be earned from the bank', 'Paid to the bank'],
      ],
    },
    markingTip: '1 mark for each basis with both sides; the cash book and pass book rows must not be swapped.',
    hints: ['Ask who owes whom in each case.', 'Bases: meaning, balance in the cash book, balance in the pass book.'],
  },
  {
    id: 'w11-brs-003',
    topicId: 'bank-reconciliation',
    conceptId: 'brs-why',
    difficulty: 'easy',
    form: 'reasons',
    marks: 4,
    prompt: 'Give any four reasons why the balance shown by the cash book may differ from the balance shown by the pass book.',
    pointsNeeded: 4,
    points: [
      { text: 'Cheques issued but not yet presented for payment: entered in the cash book, not yet paid by the bank.', keywords: ['not yet presented', 'not presented', 'issued'] },
      { text: 'Cheques deposited but not yet cleared: entered in the cash book, not yet credited by the bank.', keywords: ['not yet cleared', 'not cleared', 'not credited', 'deposited'] },
      { text: 'Bank charges or interest debited by the bank, not yet entered in the cash book.', keywords: ['bank charges', 'interest debited', 'charged by the bank'] },
      { text: 'Interest or dividend credited by the bank, not yet entered in the cash book.', keywords: ['interest credited', 'dividend', 'collected by the bank'] },
      { text: 'Amounts deposited directly into the bank by customers.', keywords: ['direct deposit', 'directly', 'customer deposited'] },
      { text: 'Payments made by the bank on standing instructions, such as insurance premium.', keywords: ['standing instruction', 'premium', 'on instructions'] },
      { text: 'Cheques dishonoured, and errors made in either book.', keywords: ['dishonoured', 'error', 'mistake'] },
    ],
    answer:
      'The cash book and the pass book record the same account, but at different times and by different people. The balances differ because of:\n' +
      '1. Cheques issued but not yet presented: The cash book has reduced the balance; the bank has not yet paid them.\n' +
      '2. Cheques deposited but not yet cleared: The cash book has raised the balance; the bank has not yet credited them.\n' +
      '3. Bank charges or interest debited by the bank: The bank has entered them; the firm learns of them only from the pass book.\n' +
      '4. Interest or dividend credited by the bank: Entered by the bank first.\n' +
      '5. Direct deposits by customers: The bank has credited them; the firm does not yet know.\n' +
      '6. Payments on standing instructions: Such as an insurance premium paid by the bank for the firm.\n' +
      '7. Dishonoured cheques and errors: A cheque returned unpaid, or a mistake in either book.',
    markingTip: '1 mark for each reason with a line saying which book has the item; "timing differences" written once with no example is one point at most.',
    hints: ['Think of items the firm records first, items the bank records first, and mistakes.', 'Start with cheques issued but not yet presented, and cheques deposited but not yet cleared.'],
  },
  {
    id: 'w11-brs-004',
    topicId: 'bank-reconciliation',
    conceptId: 'brs-from-cb',
    difficulty: 'medium',
    form: 'list',
    marks: 3,
    prompt: 'State any three advantages of preparing a bank reconciliation statement.',
    pointsNeeded: 3,
    points: [
      { text: 'Explains the difference: it shows the causes of the difference between the two balances.', keywords: ['causes', 'explains the difference', 'reasons'] },
      { text: 'Detects errors: it brings to light mistakes made in the cash book or by the bank.', keywords: ['errors', 'mistakes', 'detect'] },
      { text: 'Checks fraud: regular reconciliation discourages misuse of bank money by staff.', keywords: ['fraud', 'misappropriation', 'misuse'] },
      { text: 'Correct balance: it helps find the true bank balance and update the cash book for items the bank recorded first.', keywords: ['true balance', 'correct balance', 'update', 'amended'] },
      { text: 'Delays shown: it shows cheques that customers or the bank have been slow to clear or present.', keywords: ['delay', 'uncleared', 'slow'] },
    ],
    answer:
      'A bank reconciliation statement is prepared on a date to explain the difference between the bank balance in the cash book and in the pass book. Its advantages are:\n' +
      '1. Explains the difference: It lists the causes, so the two balances can be agreed.\n' +
      '2. Detects errors: Mistakes in the cash book or by the bank come to light.\n' +
      '3. Checks fraud: Regular reconciliation discourages misuse of bank money by staff.\n' +
      '4. Correct balance: It helps find the true bank balance and bring the cash book up to date.\n' +
      '5. Delays shown: Cheques that have stayed uncleared or unpresented for long are noticed and followed up.',
    markingTip: '1 mark for each advantage with its explanation; the meaning of the statement is not an advantage.',
    hints: ['Ask what a firm would miss if it never compared its cash book with the pass book.', 'Start with explaining the difference and detecting errors.'],
  },
  {
    id: 'w11-brs-005',
    topicId: 'bank-reconciliation',
    conceptId: 'brs-timing',
    difficulty: 'complex',
    form: 'explain',
    marks: 4,
    prompt: 'A bank reconciliation statement starts from a favourable balance as per the cash book. Explain, with reasons, the treatment of (i) cheques issued but not yet presented for payment and (ii) cheques deposited but not yet cleared.',
    pointsNeeded: 2,
    points: [
      { text: '(i) Added: the cash book balance was reduced when the cheques were issued, but the bank has not yet paid them, so the pass book balance is higher.', keywords: ['added', 'add', 'pass book is higher', 'not yet paid'] },
      { text: '(ii) Deducted: the cash book balance was raised when the cheques were deposited, but the bank has not yet credited them, so the pass book balance is lower.', keywords: ['deducted', 'deduct', 'not yet credited', 'pass book is lower'] },
    ],
    answer:
      '(i) Cheques issued but not yet presented: Added. When a cheque is issued, the firm credits the bank column at once, so the cash book balance falls. The bank pays the cheque only when it is presented, so until then the pass book still shows the money. The pass book balance is higher by the amount of these cheques, so they are added to the cash book balance.\n' +
      '(ii) Cheques deposited but not yet cleared: Deducted. When a cheque is deposited, the firm debits the bank column at once, so the cash book balance rises. The bank credits the account only after collecting the amount, so the pass book does not yet show it. The pass book balance is lower by the amount of these cheques, so they are deducted.',
    markingTip: '1 mark for the right treatment and 1 for the reason, in each part; a treatment with no reason earns half, and a reversed treatment earns nothing.',
    hints: ['For each item, ask which book has already recorded it and which has not.', 'An issued cheque has already lowered the cash book balance: has the bank paid it out yet?'],
  },
  {
    id: 'w11-brs-006',
    topicId: 'bank-reconciliation',
    conceptId: 'brs-amended',
    difficulty: 'complex',
    form: 'explain',
    marks: 4,
    prompt: 'What is an amended cash book? Explain which items are entered in it and which are left for the bank reconciliation statement.',
    pointsNeeded: 4,
    points: [
      { text: 'Meaning: the cash book (bank column) brought up to date and corrected before a reconciliation statement is prepared, so that it shows the true balance.', keywords: ['brought up to date', 'corrected', 'true balance', 'updated'] },
      { text: 'Items recorded first by the bank are entered: bank charges, interest, dividend collected, direct deposits, standing instruction payments and dishonoured cheques.', keywords: ['bank charges', 'direct deposits', 'dishonoured', 'recorded first by the bank'] },
      { text: 'Errors made in the cash book are corrected in it.', keywords: ['errors in the cash book', 'corrected in it', 'wrong casting'] },
      { text: 'Left for the statement: cheques issued but not presented, cheques deposited but not cleared, and errors made by the bank.', keywords: ['not presented', 'not cleared', 'errors by the bank', 'left for the statement'] },
    ],
    answer:
      '1. Meaning: An amended cash book is the bank column of the cash book brought up to date and corrected before the reconciliation statement is prepared, so that it shows the true bank balance.\n' +
      '2. Items the bank recorded first: Bank charges, interest debited or credited, dividend collected, direct deposits by customers, payments on standing instructions and dishonoured cheques are entered in it.\n' +
      '3. Errors in the cash book: Mistakes such as a wrong total or a cheque entered at a wrong amount are corrected in it.\n' +
      '4. Left for the statement: Cheques issued but not presented, cheques deposited but not cleared, and errors made by the bank need no entry in the cash book; they are shown in the reconciliation statement, which then starts from the amended balance.',
    markingTip: '1 mark for each point; putting the unpresented or uncleared cheques into the amended cash book costs the fourth mark.',
    hints: ['The amended cash book takes everything the firm should have recorded but had not yet.', 'Timing differences and the bank\'s own errors stay out of it.'],
  },
  {
    id: 'w11-brs-007',
    topicId: 'bank-reconciliation',
    conceptId: 'brs-why',
    difficulty: 'easy',
    form: 'explain',
    marks: 1,
    prompt: 'What is a pass book?',
    pointsNeeded: 1,
    points: [
      { text: 'A pass book (bank statement) is a copy of the customer\'s account in the books of the bank, showing deposits, withdrawals and the balance.', keywords: ['copy', 'account in the books of the bank', 'bank statement'] },
    ],
    answer: 'A pass book, or bank statement, is a copy of the customer\'s account as it stands in the books of the bank, showing every deposit, every withdrawal and the balance after each.',
    markingTip: 'The mark needs the idea that it is the bank\'s record of the customer\'s account; "a book of the firm" is wrong.',
    hints: ['Who writes it up: the firm or the bank?', 'It is the bank\'s copy of the customer\'s account.'],
  },

  // Trial Balance -------------------------------------------------------------------------------------------------
  {
    id: 'w11-tb-001',
    topicId: 'trial-balance',
    conceptId: 'tb-purpose',
    difficulty: 'medium',
    form: 'distinguish',
    marks: 4,
    prompt: 'Distinguish between a trial balance and a balance sheet on any four bases.',
    pointsNeeded: 4,
    points: [
      { text: 'Purpose: a trial balance checks the arithmetical accuracy of the books; a balance sheet shows the financial position.', keywords: ['arithmetical accuracy', 'financial position', 'purpose'] },
      { text: 'Balances included: a trial balance lists the balances of all ledger accounts; a balance sheet shows only assets, liabilities and capital.', keywords: ['all ledger accounts', 'only assets', 'real and personal'] },
      { text: 'Form: a trial balance has a debit and a credit column; a balance sheet has an assets side and a liabilities side.', keywords: ['debit and credit columns', 'assets side', 'liabilities side'] },
      { text: 'Time of preparation: a trial balance is prepared before the final accounts, and at any time; a balance sheet after the Trading and Profit and Loss Account, at the end of the period.', keywords: ['before the final accounts', 'end of the period', 'any time'] },
      { text: 'Closing stock: usually not in a trial balance; always shown in a balance sheet.', keywords: ['closing stock'] },
      { text: 'Requirement: a trial balance is a working statement for the firm\'s own use; a balance sheet is a final statement given to users and required by law for companies.', keywords: ['working statement', 'required by law', 'users'] },
    ],
    table: {
      headers: ['Basis', 'Trial balance', 'Balance sheet'],
      rows: [
        ['Purpose', 'Checks the arithmetical accuracy of the books', 'Shows the financial position'],
        ['Balances included', 'All ledger accounts', 'Only assets, liabilities and capital'],
        ['Form', 'Debit and credit columns', 'Assets and liabilities sides'],
        ['Time of preparation', 'Before the final accounts; at any time', 'After the Trading and Profit and Loss Account, at the end of the period'],
        ['Closing stock', 'Usually not included', 'Always shown'],
        ['Requirement', 'A working statement for the firm\'s own use', 'A final statement for users; required by law for companies'],
      ],
    },
    markingTip: '1 mark for each basis with both statements; "both are prepared on a date" is a likeness, not a difference.',
    hints: ['One statement checks the books; the other reports to users.', 'Bases: purpose, balances included, form, time of preparation.'],
  },
  {
    id: 'w11-tb-002',
    topicId: 'trial-balance',
    conceptId: 'tb-errors',
    difficulty: 'medium',
    form: 'list',
    marks: 4,
    prompt: 'A trial balance agrees, yet the books may still contain errors. State any four errors that a trial balance does not disclose, with an example of each.',
    pointsNeeded: 4,
    points: [
      { text: 'Complete omission: a transaction left out of the books altogether; for example, a credit purchase of ₹7,000 from Gupta Traders not recorded at all.', keywords: ['complete omission', 'not recorded at all', 'left out altogether'] },
      { text: 'Error of principle: a rule of accounting broken; for example, machinery bought for ₹50,000 debited to Purchases A/c.', keywords: ['error of principle', 'principle', 'capital as revenue'] },
      { text: 'Compensating errors: two errors of equal amount that cancel each other; for example, Wages A/c over-cast by ₹1,000 and Commission Received A/c over-cast by ₹1,000.', keywords: ['compensating', 'cancel', 'offset'] },
      { text: 'Posting to a wrong account on the correct side: for example, rent paid ₹4,000 debited to Salaries A/c instead of Rent A/c.', keywords: ['wrong account', 'correct side', 'right side'] },
      { text: 'Wrong amount in the book of original entry: for example, a sale of ₹5,400 entered in the Sales Book as ₹4,500 and posted to both accounts at that amount.', keywords: ['book of original entry', 'wrong amount', 'both accounts'] },
    ],
    answer:
      'The agreement of a trial balance proves only that the total debits equal the total credits. Errors that leave the two equal are not disclosed:\n' +
      '1. Complete omission: A transaction is left out of the books altogether. Example: a credit purchase of ₹7,000 from Gupta Traders is not recorded at all.\n' +
      '2. Error of principle: A rule of accounting is broken, such as a capital item treated as revenue. Example: machinery bought for ₹50,000 is debited to Purchases A/c.\n' +
      '3. Compensating errors: Two errors of equal amount cancel each other. Example: Wages A/c is over-cast by ₹1,000 and Commission Received A/c is over-cast by ₹1,000.\n' +
      '4. Posting to a wrong account on the correct side: Example: rent paid ₹4,000 is debited to Salaries A/c instead of Rent A/c.\n' +
      '5. Wrong amount in the book of original entry: Example: a sale of ₹5,400 is entered in the Sales Book as ₹4,500, so both accounts are posted with ₹4,500.',
    markingTip: '½ mark for each error named and ½ for a correct example of it; a posting on the wrong side or a wrong casting does upset the trial balance and earns nothing.',
    hints: ['Look for errors in which the amount is still debited once and credited once.', 'Start with a transaction never recorded at all, and furniture debited to Purchases A/c.'],
  },
  {
    id: 'w11-tb-003',
    topicId: 'trial-balance',
    conceptId: 'tb-purpose',
    difficulty: 'easy',
    form: 'list',
    marks: 3,
    prompt: 'State any three objectives of preparing a trial balance.',
    pointsNeeded: 3,
    points: [
      { text: 'Arithmetical accuracy: to check that the debits and credits in the ledger are equal.', keywords: ['arithmetical accuracy', 'arithmetical', 'debits equal credits'] },
      { text: 'Summary of balances: to bring the balances of all ledger accounts together in one statement.', keywords: ['summary', 'one statement', 'all balances'] },
      { text: 'Base for final accounts: to provide the figures from which the final accounts are prepared.', keywords: ['final accounts', 'base', 'basis'] },
      { text: 'Locating errors: to signal that an error exists when the totals differ, and help trace it.', keywords: ['locate errors', 'signal', 'detect errors'] },
    ],
    answer:
      '1. Arithmetical accuracy: To check that the total of the debit balances equals the total of the credit balances in the ledger.\n' +
      '2. Summary of balances: To bring the balances of all ledger accounts together in one statement.\n' +
      '3. Base for final accounts: To provide the figures from which the Trading and Profit and Loss Account and the Balance Sheet are prepared.\n' +
      '4. Locating errors: To signal that an error exists when the totals differ, and to help trace it.',
    markingTip: '1 mark for each objective with its explanation; "to find profit" is not an objective of the trial balance.',
    hints: ['What does a trial balance check, and what is it used for afterwards?', 'Start with arithmetical accuracy.'],
  },
  {
    id: 'w11-tb-004',
    topicId: 'trial-balance',
    conceptId: 'tb-difference',
    difficulty: 'complex',
    form: 'explain',
    marks: 4,
    prompt: 'The two columns of a trial balance do not agree. Explain any four steps an accountant takes to locate the errors.',
    pointsNeeded: 4,
    points: [
      { text: 'Re-add both columns of the trial balance.', keywords: ['re-add', 'totalled again', 'columns again'] },
      { text: 'Check that every ledger balance is copied correctly, at the right amount and in the right column, and none is left out.', keywords: ['right column', 'copied', 'left out', 'omitted'] },
      { text: 'Compare the difference with the balances: equal to one balance suggests an omission; twice a balance suggests a balance in the wrong column; half the difference may show a posting on the wrong side.', keywords: ['half the difference', 'twice', 'equal to a balance'] },
      { text: 'Check the balancing of each ledger account and the totals of the subsidiary books.', keywords: ['balancing', 'subsidiary books', 'casting'] },
      { text: 'Check the postings from the books of original entry to the ledger.', keywords: ['postings', 'posting', 'original entry'] },
      { text: 'If the error is still not found, open a Suspense account with the difference so that the final accounts can be prepared.', keywords: ['suspense'] },
    ],
    answer:
      '1. Re-add the columns: Both columns of the trial balance are totalled again.\n' +
      '2. Check the list of balances: Each ledger balance is checked for its amount and its column, and to see that none is left out.\n' +
      '3. Study the difference: If it equals one balance, that balance may be omitted; if it is twice a balance, that balance may be in the wrong column; if it is even, a posting of half the difference may be on the wrong side.\n' +
      '4. Check the ledger and the books: The balancing of each account and the totals of the subsidiary books are checked.\n' +
      '5. Check the postings: Postings from the journal and subsidiary books to the ledger are checked.\n' +
      '6. Suspense account: If the error is still not found, the difference is put to a Suspense account so that the final accounts can be prepared.',
    markingTip: '1 mark for each step with its purpose; opening a Suspense account counts only as the last step, not the first.',
    hints: ['Begin with the trial balance itself, then go back into the ledger and the books.', 'The size of the difference is a clue: compare it with single balances and with twice a balance.'],
  },
  {
    id: 'w11-tb-005',
    topicId: 'trial-balance',
    conceptId: 'tb-suspense',
    difficulty: 'medium',
    form: 'short-note',
    marks: 3,
    prompt: 'Write a short note on the Suspense account.',
    pointsNeeded: 3,
    points: [
      { text: 'Meaning: a temporary account opened with the difference in the trial balance when the errors cannot be found at once.', keywords: ['temporary', 'difference', 'cannot be found'] },
      { text: 'Side: it is placed in the shorter column: credit side if the debits are larger, debit side if the credits are larger.', keywords: ['shorter column', 'shorter side', 'debits are larger'] },
      { text: 'Closing: as one-sided errors are found, the rectifying entries pass through it, and it closes when all are corrected.', keywords: ['one-sided', 'closes', 'rectifying'] },
      { text: 'In the Balance Sheet: a balance still left at the year end is shown, a debit balance on the assets side and a credit balance on the liabilities side.', keywords: ['balance sheet', 'assets side', 'liabilities side'] },
    ],
    answer:
      '1. Meaning: A Suspense account is a temporary account opened with the difference in the trial balance when the errors cannot be traced at once, so that the final accounts can still be prepared.\n' +
      '2. Side: It is put in the shorter column: on the credit side if the debit total is larger, on the debit side if the credit total is larger.\n' +
      '3. Closing: When a one-sided error is found, its rectifying entry passes through the Suspense account; once every such error is corrected, the account closes by itself.\n' +
      '4. In the Balance Sheet: A balance still left at the year end is shown there, a debit balance as an asset and a credit balance as a liability, until the errors are found.',
    markingTip: '1 mark for each point; the meaning must include "temporary" and "difference in the trial balance" to earn its mark.',
    hints: ['Why open an account for an amount whose cause is not yet known?', 'Say where it goes in the trial balance, and how it is closed.'],
  },
  {
    id: 'w11-tb-006',
    topicId: 'trial-balance',
    conceptId: 'tb-purpose',
    difficulty: 'easy',
    form: 'explain',
    marks: 1,
    prompt: 'What is a trial balance?',
    pointsNeeded: 1,
    points: [
      { text: 'A trial balance is a statement of the balances of all ledger accounts on a given date, arranged in debit and credit columns, prepared to check arithmetical accuracy.', keywords: ['statement', 'ledger balances', 'balances of all', 'given date'] },
    ],
    answer: 'A trial balance is a statement of the debit and credit balances of all ledger accounts on a given date, prepared to check the arithmetical accuracy of the books.',
    markingTip: 'The mark needs "statement", "balances of ledger accounts" and a date; calling it an account earns nothing.',
    hints: ['Is it an account or a statement?', 'It lists ledger balances on one date in two columns.'],
  },
  {
    id: 'w11-tb-007',
    topicId: 'trial-balance',
    conceptId: 'tb-formats',
    difficulty: 'easy',
    form: 'explain',
    marks: 3,
    prompt: 'Explain how a trial balance is prepared by the balance method.',
    pointsNeeded: 3,
    points: [
      { text: 'Balance every ledger account first.', keywords: ['balance every', 'balanced first', 'balance each'] },
      { text: 'List each account once at its balance: a debit balance in the debit column, a credit balance in the credit column; an account with no balance is left out.', keywords: ['debit column', 'credit column', 'once', 'left out'] },
      { text: 'Total the two columns: if they agree, the books are arithmetically accurate.', keywords: ['total', 'agree', 'two columns'] },
    ],
    answer:
      '1. Balance the accounts: Every ledger account is balanced first.\n' +
      '2. List the balances: Each account is written once, at its balance: a debit balance in the debit column and a credit balance in the credit column. An account whose two sides are equal has no balance and is left out.\n' +
      '3. Total and compare: The two columns are totalled. If they agree, the books are taken to be arithmetically accurate; if not, the errors are looked for.',
    markingTip: '1 mark for each step; listing the totals of both sides of every account is not the balance method and earns nothing.',
    hints: ['The method is named after what is listed for each account.', 'Start by balancing every account; then ask in which column each balance is written.'],
  },

  // Rectification of Errors ---------------------------------------------------------------------------------------
  {
    id: 'w11-roe-001',
    topicId: 'rectification-of-errors',
    conceptId: 'roe-tb-effect',
    difficulty: 'medium',
    form: 'distinguish',
    marks: 3,
    prompt: 'Distinguish between one-sided errors and two-sided errors on any three bases.',
    pointsNeeded: 3,
    points: [
      { text: 'Accounts affected: a one-sided error affects one account only; a two-sided error affects two or more accounts.', keywords: ['one account', 'two or more accounts', 'accounts affected'] },
      { text: 'Effect on the trial balance: a one-sided error makes it disagree; a two-sided error leaves it in agreement.', keywords: ['disagree', 'agreement', 'still agrees'] },
      { text: 'Rectification after the trial balance: a one-sided error is rectified through a Suspense account; a two-sided error by a journal entry between the accounts concerned.', keywords: ['suspense', 'journal entry between', 'rectified'] },
      { text: 'Rectification before the trial balance: a one-sided error is corrected in the account itself, without a journal entry; a two-sided error still needs a journal entry.', keywords: ['in the account itself', 'without a journal', 'before the trial balance'] },
      { text: 'Examples: a wrong casting of the Sales Book, or a posting on the wrong side; a credit sale posted to the wrong customer, or an error of principle.', keywords: ['casting', 'wrong side', 'wrong customer', 'principle'] },
    ],
    table: {
      headers: ['Basis', 'One-sided errors', 'Two-sided errors'],
      rows: [
        ['Accounts affected', 'One account only', 'Two or more accounts'],
        ['Effect on the trial balance', 'It disagrees', 'It still agrees'],
        ['Rectification after the trial balance', 'Through a Suspense account', 'By a journal entry between the accounts concerned'],
        ['Rectification before the trial balance', 'In the account itself, without a journal entry', 'By a journal entry'],
        ['Examples', 'Wrong casting of a book; posting on the wrong side', 'Credit sale posted to the wrong customer; error of principle'],
      ],
    },
    markingTip: '1 mark for each basis with both sides; using Suspense A/c for a two-sided error costs the rectification row.',
    hints: ['Count how many accounts each kind of error leaves wrong.', 'Bases: accounts affected, effect on the trial balance, rectification.'],
  },
  {
    id: 'w11-roe-002',
    topicId: 'rectification-of-errors',
    conceptId: 'roe-classes',
    difficulty: 'medium',
    form: 'distinguish',
    marks: 4,
    prompt: 'Distinguish between an error of omission and an error of commission on any four bases.',
    pointsNeeded: 4,
    points: [
      { text: 'Meaning: an error of omission is a transaction left out wholly or partly; an error of commission is a transaction recorded or posted wrongly.', keywords: ['left out', 'recorded wrongly', 'meaning'] },
      { text: 'Kinds: omission may be complete or partial; commission may be a wrong amount, a wrong account, a wrong side or a wrong total.', keywords: ['complete or partial', 'wrong amount', 'wrong account', 'kinds'] },
      { text: 'Effect on the trial balance: a complete omission does not affect it, a partial omission does; an error of commission may or may not affect it.', keywords: ['complete omission', 'partial omission', 'may or may not'] },
      { text: 'Example: a credit purchase from Rohan not entered in the books at all; a credit sale to Rina posted to Rita\'s account.', keywords: ['not entered at all', 'posted to', 'example'] },
      { text: 'Rectification: an omission is rectified by passing or posting what was left out; a commission by reversing the wrong part and recording the right one.', keywords: ['passing what was left out', 'reversing', 'rectified by'] },
    ],
    table: {
      headers: ['Basis', 'Error of omission', 'Error of commission'],
      rows: [
        ['Meaning', 'A transaction left out of the books, wholly or partly', 'A transaction recorded, posted or totalled wrongly'],
        ['Kinds', 'Complete or partial', 'Wrong amount, wrong account, wrong side or wrong total'],
        ['Effect on the trial balance', 'Complete: none; partial: it disagrees', 'May or may not make it disagree'],
        ['Example', 'A credit purchase from Rohan not entered at all', 'A credit sale to Rina posted to Rita\'s account'],
        ['Rectification', 'The missing entry or posting is made', 'The wrong part is reversed and the right one recorded'],
      ],
    },
    markingTip: '1 mark for each basis with both sides; an example of an error of principle written as commission earns nothing.',
    hints: ['One error leaves something out; the other puts something in wrongly.', 'Bases: meaning, kinds, effect on the trial balance, example.'],
  },
  {
    id: 'w11-roe-003',
    topicId: 'rectification-of-errors',
    conceptId: 'roe-classes',
    difficulty: 'easy',
    form: 'explain',
    marks: 4,
    prompt: 'Explain the four classes of errors, giving one example of each.',
    pointsNeeded: 4,
    points: [
      { text: 'Errors of omission: a transaction left out wholly or partly; for example, a credit purchase not recorded at all.', keywords: ['omission', 'left out', 'not recorded'] },
      { text: 'Errors of commission: a slip in recording, posting, totalling or balancing; for example, a sale to Mohan posted to Sohan\'s account.', keywords: ['commission', 'wrong account', 'slip', 'wrong amount'] },
      { text: 'Errors of principle: a rule of accounting broken; for example, the purchase of furniture debited to Purchases A/c.', keywords: ['principle', 'capital as revenue', 'revenue as capital', 'furniture debited to purchases'] },
      { text: 'Compensating errors: two or more errors that cancel each other; for example, Rent A/c under-cast by ₹500 and Sales A/c under-cast by ₹500.', keywords: ['compensating', 'cancel', 'offset'] },
    ],
    answer:
      '1. Errors of omission: A transaction is left out of the books, wholly or partly. Example: a credit purchase of ₹6,000 is not recorded at all.\n' +
      '2. Errors of commission: A slip is made in recording, posting, totalling or balancing. Example: a credit sale to Mohan is posted to Sohan\'s account.\n' +
      '3. Errors of principle: A rule of accounting is broken, such as treating a capital item as revenue. Example: furniture bought for the office is debited to Purchases A/c.\n' +
      '4. Compensating errors: Two or more errors cancel each other\'s effect. Example: Rent A/c is under-cast by ₹500 and Sales A/c is under-cast by ₹500.',
    markingTip: '½ mark for each class explained and ½ for a correct example of it; an example that belongs to another class earns nothing for that half.',
    hints: ['There are four: something left out, something done wrongly, a rule broken, and errors that cancel.', 'For the rule broken, think of furniture debited to Purchases A/c; find an example like it for each of the others.'],
  },
  {
    id: 'w11-roe-004',
    topicId: 'rectification-of-errors',
    conceptId: 'roe-before-tb',
    difficulty: 'complex',
    form: 'explain',
    marks: 4,
    prompt: 'Explain how errors are rectified (i) before the trial balance is prepared and (ii) after it is prepared.',
    pointsNeeded: 4,
    points: [
      { text: 'Before, one-sided error: corrected in the account itself by an entry on the proper side, with no journal entry and no Suspense account.', keywords: ['in the account itself', 'no journal entry', 'directly'] },
      { text: 'Before, two-sided error: corrected by a journal entry between the accounts concerned.', keywords: ['journal entry between', 'two-sided', 'accounts concerned'] },
      { text: 'After, one-sided error: rectified through the Suspense account, which takes the other side of the entry.', keywords: ['through the suspense', 'suspense a/c', 'through suspense'] },
      { text: 'After, two-sided error: rectified by a journal entry between the accounts concerned, as before; Suspense is not touched.', keywords: ['not touched', 'no suspense', 'between the accounts'] },
    ],
    answer:
      '(i) Before the trial balance is prepared:\n' +
      '1. A one-sided error is corrected in the account itself by an entry on its proper side, such as "By Error in casting"; no journal entry is passed, because no Suspense account exists yet.\n' +
      '2. A two-sided error is corrected by a journal entry between the accounts concerned.\n' +
      '(ii) After the trial balance is prepared:\n' +
      '3. A one-sided error is rectified through the Suspense account, which takes the other side of the rectifying entry.\n' +
      '4. A two-sided error is rectified by a journal entry between the accounts concerned, exactly as before; the Suspense account is not used.',
    markingTip: '1 mark for each case; a two-sided error rectified through Suspense A/c costs that mark.',
    hints: ['The stage matters only for one-sided errors.', 'Before the trial balance there is no Suspense account; after it, a one-sided error needs one.'],
  },
  {
    id: 'w11-roe-005',
    topicId: 'rectification-of-errors',
    conceptId: 'roe-profit',
    difficulty: 'complex',
    form: 'explain',
    marks: 3,
    prompt: 'State, with reasons, the effect of each of the following errors on the net profit: (i) Machinery bought for ₹40,000 debited to Purchases A/c. (ii) Commission received ₹2,000 credited to Interest Received A/c. (iii) Rent paid ₹4,000 not recorded at all.',
    pointsNeeded: 3,
    points: [
      { text: '(i) Net profit is understated by ₹40,000: a capital item was charged as an expense (purchases), raising the cost of goods sold.', keywords: ['understated', '40,000', 'capital item'] },
      { text: '(ii) No effect on net profit: one income was credited in place of another, and both reach the Profit and Loss Account.', keywords: ['no effect', 'two incomes', 'both incomes'] },
      { text: '(iii) Net profit is overstated by ₹4,000: an expense of the year was left out.', keywords: ['overstated', 'rent omitted', 'expense left out'] },
    ],
    answer:
      '(i) Understated by ₹40,000: Machinery is a capital item, but it was charged to Purchases, which is an expense in the Trading Account. Expenses are too high, so profit is too low.\n' +
      '(ii) No effect: Commission received and interest received are both incomes credited to the Profit and Loss Account. One has been credited in place of the other, so the total of incomes, and the profit, are unchanged.\n' +
      '(iii) Overstated by ₹4,000: Rent is an expense of the year. Leaving it out makes the expenses too low, so profit is too high.',
    markingTip: '½ mark for the right effect with the amount and ½ for the reason, in each part; "profit is affected" without the direction earns nothing.',
    hints: ['Ask in each case whether an expense or an income ends up too high or too low.', 'In (ii), ask whether both accounts end up in the same place.'],
  },
  {
    id: 'w11-roe-006',
    topicId: 'rectification-of-errors',
    conceptId: 'roe-classes',
    difficulty: 'easy',
    form: 'explain',
    marks: 1,
    prompt: 'What is a compensating error?',
    pointsNeeded: 1,
    points: [
      { text: 'Compensating errors are two or more errors whose effects cancel each other, so that the trial balance still agrees.', keywords: ['cancel', 'offset', 'counterbalance', 'still agrees'] },
    ],
    answer: 'Compensating errors are two or more errors whose effects cancel each other, so that the trial balance still agrees though the accounts are wrong.',
    markingTip: 'The mark needs the idea of errors cancelling each other out.',
    hints: ['Think of one error that makes the debits too high and another that makes the credits too high by the same amount.', 'They cancel out.'],
  },
  {
    id: 'w11-roe-007',
    topicId: 'rectification-of-errors',
    conceptId: 'roe-two-sided',
    difficulty: 'easy',
    form: 'explain',
    marks: 3,
    prompt: 'What is an error of principle? Give two examples, and state whether it affects the agreement of the trial balance.',
    pointsNeeded: 3,
    points: [
      { text: 'Meaning: an error made by breaking an accepted principle of accounting, such as treating a capital item as revenue or the other way round.', keywords: ['principle', 'capital as revenue', 'accepted rule'] },
      { text: 'Examples: furniture bought debited to Purchases A/c; repairs to machinery debited to Machinery A/c; the owner\'s personal expense debited to an expense account.', keywords: ['furniture', 'repairs', 'personal expense', 'machinery'] },
      { text: 'Effect: it does not affect the agreement of the trial balance, because the debit and the credit are of equal amount.', keywords: ['does not affect', 'agrees', 'equal amount'] },
    ],
    answer:
      '1. Meaning: An error of principle is made when an accepted principle of accounting is broken, for example when a capital item is treated as revenue, or revenue as capital.\n' +
      '2. Examples: Furniture bought for the office debited to Purchases A/c; wages paid for repairs to a machine debited to Machinery A/c.\n' +
      '3. Effect on the trial balance: None. The debit and the credit are of equal amounts, though one of them is in the wrong kind of account, so the trial balance still agrees.',
    markingTip: '1 mark for the meaning, 1 for two correct examples (½ each), 1 for the effect with its reason.',
    hints: ['The error is in the kind of account chosen, not in the arithmetic.', 'An asset charged as an expense is the usual example.'],
  },

  // Depreciation --------------------------------------------------------------------------------------------------
  {
    id: 'w11-dep-001',
    topicId: 'depreciation',
    conceptId: 'dep-compare',
    difficulty: 'medium',
    form: 'distinguish',
    marks: 6,
    prompt: 'Distinguish between the straight line method and the written down value method of depreciation on any six bases.',
    pointsNeeded: 6,
    points: [
      { text: 'Basis of calculation: straight line on the original cost; written down value on the book value at the start of each year.', keywords: ['original cost', 'opening book value', 'reducing balance'] },
      { text: 'Amount of depreciation: the same every year under straight line; falling year after year under written down value.', keywords: ['same every year', 'fixed amount', 'decreasing', 'falling'] },
      { text: 'Book value at the end of the life: it can be brought down to zero or the scrap value under straight line; it never becomes zero under written down value.', keywords: ['zero', 'scrap value', 'never becomes zero'] },
      { text: 'Depreciation plus repairs: rises over the years under straight line, as repairs grow; stays fairly even under written down value.', keywords: ['repairs', 'even', 'total charge'] },
      { text: 'Suitability: straight line suits assets with few repairs or a fixed life, such as leases and patents; written down value suits plant and machinery and vehicles.', keywords: ['suitable', 'lease', 'patent', 'plant and machinery'] },
      { text: 'Calculation: straight line is simple; written down value needs a fresh figure each year.', keywords: ['simple', 'easy to calculate', 'difficult'] },
      { text: 'Recognition by income tax law: straight line is not generally used for income tax; written down value is the method income tax law recognises.', keywords: ['income tax', 'tax law', 'recognised'] },
    ],
    table: {
      headers: ['Basis', 'Straight line method', 'Written down value method'],
      rows: [
        ['Basis of calculation', 'Original cost', 'Book value at the start of each year'],
        ['Amount of depreciation', 'The same every year', 'Falls year after year'],
        ['Book value at the end of the life', 'Can be brought to zero or scrap value', 'Never becomes zero'],
        ['Depreciation plus repairs', 'Rises over the years as repairs grow', 'Stays fairly even'],
        ['Suitability', 'Assets with few repairs or a fixed life: leases, patents', 'Plant and machinery, vehicles'],
        ['Calculation', 'Simple', 'Comparatively harder'],
        ['Recognition by income tax law', 'Not generally used for income tax', 'Recognised by income tax law'],
      ],
    },
    markingTip: '1 mark for each basis with both methods stated; a basis with one method only earns half. "Straight line is better" is not a difference.',
    hints: ['Start from what each method applies its rate to.', 'Bases: basis of calculation, amount each year, book value at the end, depreciation plus repairs, suitability, calculation.'],
  },
  {
    id: 'w11-dep-002',
    topicId: 'depreciation',
    conceptId: 'dep-meaning',
    difficulty: 'medium',
    form: 'distinguish',
    marks: 3,
    prompt: 'Distinguish between depreciation and depletion on any three bases.',
    pointsNeeded: 3,
    points: [
      { text: 'Assets concerned: depreciation is charged on tangible fixed assets such as machinery; depletion on natural resources (wasting assets) such as mines and quarries.', keywords: ['tangible', 'natural resources', 'mines', 'wasting assets'] },
      { text: 'Cause: depreciation arises from use, time or obsolescence; depletion from the extraction of the resource.', keywords: ['wear and tear', 'obsolescence', 'extraction', 'extracted'] },
      { text: 'Basis of computation: depreciation is worked on cost over the useful life; depletion on the quantity extracted out of the total quantity.', keywords: ['quantity extracted', 'useful life', 'basis of computation'] },
      { text: 'Nature of the decline: in depreciation the asset wears out but keeps its form; in depletion the asset is used up physically.', keywords: ['used up physically', 'wears out', 'reduces in quantity'] },
    ],
    table: {
      headers: ['Basis', 'Depreciation', 'Depletion'],
      rows: [
        ['Assets concerned', 'Tangible fixed assets: machinery, buildings', 'Natural resources: mines, quarries, oil wells'],
        ['Cause', 'Use, passage of time, obsolescence', 'Extraction of the resource'],
        ['Basis of computation', 'Cost spread over the useful life', 'Quantity extracted out of the total quantity'],
        ['Nature of the decline', 'The asset wears out but keeps its form', 'The asset is physically used up'],
      ],
    },
    markingTip: '1 mark for each basis with both sides; amortisation is a third term and is not an answer here.',
    hints: ['Depletion is the word for a mine or an oil well.', 'Bases: assets concerned, cause, basis of computation.'],
  },
  {
    id: 'w11-dep-003',
    topicId: 'depreciation',
    conceptId: 'dep-meaning',
    difficulty: 'easy',
    form: 'explain',
    marks: 4,
    prompt: 'Explain any four causes of depreciation.',
    pointsNeeded: 4,
    points: [
      { text: 'Wear and tear: an asset loses value as it is used in the business.', keywords: ['wear and tear', 'usage', 'physical'] },
      { text: 'Obsolescence: a newer or better asset, or a change in demand, makes the old asset out of date before it is worn out.', keywords: ['obsolescence', 'out of date', 'newer', 'better technology'] },
      { text: 'Passage of time and expiry of legal rights: a lease, patent or copyright loses value as its term runs out.', keywords: ['passage of time', 'expiry', 'lease', 'patent'] },
      { text: 'Exhaustion: a natural resource such as a mine is used up as it is worked.', keywords: ['exhaustion', 'depletion', 'mine', 'used up'] },
      { text: 'Abnormal factors: an asset damaged by an accident, fire or flood loses value.', keywords: ['accident', 'abnormal', 'fire', 'flood'] },
    ],
    answer:
      'Depreciation is the fall in the value of a fixed asset over its useful life. Its causes are:\n' +
      '1. Wear and tear: An asset loses value as it is used in the business.\n' +
      '2. Obsolescence: A newer or better asset, or a change in demand, makes the old asset out of date before it wears out.\n' +
      '3. Passage of time: A lease, patent or copyright loses value as its term runs out, whether it is used or not.\n' +
      '4. Exhaustion: A natural resource such as a mine or quarry is used up as it is worked.\n' +
      '5. Abnormal factors: An accident, fire or flood can cause a permanent loss in the value of an asset.',
    markingTip: '1 mark for each cause with its explanation; a fall in market price is not a cause of depreciation and earns nothing.',
    hints: ['Think of why a machine bought five years ago is worth less today.', 'Start with wear and tear and obsolescence.'],
  },
  {
    id: 'w11-dep-004',
    topicId: 'depreciation',
    conceptId: 'dep-meaning',
    difficulty: 'easy',
    form: 'reasons',
    marks: 3,
    prompt: 'Give any three reasons why depreciation must be provided.',
    pointsNeeded: 3,
    points: [
      { text: 'Matching: the cost of the asset used up in a year is set against the revenue it helped earn that year.', keywords: ['matching', 'set against', 'cost used up'] },
      { text: 'True profit: without depreciation, expenses are understated and profit overstated.', keywords: ['true profit', 'correct profit', 'overstated'] },
      { text: 'True financial position: assets are shown at a fair book value, not overstated, in the Balance Sheet.', keywords: ['financial position', 'balance sheet', 'not overstated'] },
      { text: 'Tax: depreciation is an allowed deduction, so taxable profit is correctly found.', keywords: ['tax', 'deduction', 'taxable'] },
      { text: 'Law: companies are required by law to provide depreciation.', keywords: ['law', 'companies act', 'legal'] },
      { text: 'Replacement: profit kept back by charging depreciation helps provide funds to replace the asset.', keywords: ['replacement', 'funds', 'retained'] },
    ],
    answer:
      '1. Matching: The part of the asset\'s cost used up in a year is set against the revenue it helped to earn in that year.\n' +
      '2. True profit: Without depreciation, expenses are too low and the profit is overstated.\n' +
      '3. True financial position: Fixed assets are shown at a fair book value instead of being overstated in the Balance Sheet.\n' +
      '4. Tax: Depreciation is allowed as a deduction, so the taxable profit is correctly found.\n' +
      '5. Law: Companies are required by law to provide depreciation.\n' +
      '6. Replacement: Profit kept back by charging depreciation helps provide funds to replace the asset.',
    markingTip: '1 mark for each reason with its explanation; "because the asset gets old" is a cause, not a reason for providing depreciation.',
    hints: ['Ask what would be wrong with the profit and the balance sheet if no depreciation were charged.', 'Start with matching and true profit.'],
  },
  {
    id: 'w11-dep-005',
    topicId: 'depreciation',
    conceptId: 'dep-meaning',
    difficulty: 'medium',
    form: 'features',
    marks: 3,
    prompt: 'State any three features of depreciation.',
    pointsNeeded: 3,
    points: [
      { text: 'It is a fall in the book value of a fixed asset.', keywords: ['fall in book value', 'decline', 'reduction in value'] },
      { text: 'It is gradual and continuing, over the useful life of the asset.', keywords: ['gradual', 'continuing', 'continuous', 'useful life'] },
      { text: 'It is a non-cash expense, a charge against profit.', keywords: ['non-cash', 'charge against profit', 'no cash'] },
      { text: 'It arises from use, time or obsolescence, not from a fall in market value.', keywords: ['not market', 'market value', 'fluctuation'] },
      { text: 'It applies to tangible fixed assets, not to current assets such as stock.', keywords: ['tangible', 'not current assets', 'not stock'] },
    ],
    answer:
      'Depreciation is the fall in the value of a fixed asset over its useful life. Its features are:\n' +
      '1. A fall in book value: It is a decline in the book value of a fixed asset.\n' +
      '2. Gradual and continuing: It goes on over the useful life of the asset.\n' +
      '3. A non-cash expense: It is a charge against profit, but no cash is paid out.\n' +
      '4. Not market fluctuation: It arises from use, time or obsolescence, not from a change in market price.\n' +
      '5. Fixed assets only: It is charged on tangible fixed assets, not on current assets such as stock.',
    markingTip: '1 mark for each feature; a cause of depreciation (wear and tear) is not a feature and earns nothing.',
    hints: ['Think of what kind of fall it is, and whether cash leaves the business.', 'Start with "a fall in the book value of a fixed asset" and "non-cash expense".'],
  },
  {
    id: 'w11-dep-006',
    topicId: 'depreciation',
    conceptId: 'dep-meaning',
    difficulty: 'medium',
    form: 'explain',
    marks: 4,
    prompt: 'Explain the factors that determine the amount of depreciation to be charged.',
    pointsNeeded: 4,
    points: [
      { text: 'Cost of the asset: the price paid plus all costs of bringing it into use, such as freight and installation.', keywords: ['cost of the asset', 'installation', 'freight'] },
      { text: 'Estimated useful life: the number of years the business expects to use the asset.', keywords: ['useful life', 'working life', 'estimated life'] },
      { text: 'Estimated scrap (salvage) value: what the asset is expected to fetch at the end of its life.', keywords: ['scrap', 'salvage', 'residual'] },
      { text: 'Depreciable cost: cost less scrap value, the amount to be spread over the life.', keywords: ['depreciable cost', 'cost less scrap'] },
    ],
    answer:
      '1. Cost of the asset: The purchase price plus every cost of bringing the asset into use, such as freight, installation and erection.\n' +
      '2. Estimated useful life: The number of years (or hours, or units) over which the business expects to use the asset.\n' +
      '3. Estimated scrap value: The amount the asset is expected to fetch when it is discarded at the end of its life.\n' +
      '4. Depreciable cost: Cost less scrap value; it is the amount spread over the useful life. For example, a machine costing ₹1,20,000 with a scrap value of ₹20,000 and a life of 5 years is depreciated by ₹20,000 a year under the straight line method.',
    markingTip: '1 mark for each factor with its meaning; the market value of the asset is not a factor.',
    hints: ['The straight line formula holds the answer: (cost - scrap value) / life.', 'Each part of that formula is a factor; the fourth factor is what the top line of the formula is called.'],
  },
  {
    id: 'w11-dep-007',
    topicId: 'depreciation',
    conceptId: 'dep-meaning',
    difficulty: 'easy',
    form: 'reasons',
    marks: 1,
    prompt: 'Why is land generally not depreciated?',
    pointsNeeded: 1,
    points: [
      { text: 'Land does not wear out with use or time and has an unlimited useful life, so there is no cost used up to spread.', keywords: ['does not wear out', 'unlimited life', 'infinite', 'not used up'] },
    ],
    answer: 'Land does not wear out with use or with the passing of time; its useful life is unlimited, so no part of its cost is used up in a year.',
    markingTip: 'The mark needs the unlimited life or the absence of wear; "because its price rises" is not the reason and earns nothing.',
    hints: ['Does land wear out like a machine?', 'Its useful life has no end.'],
  },
  {
    id: 'w11-dep-008',
    topicId: 'depreciation',
    conceptId: 'dep-accounting',
    difficulty: 'complex',
    form: 'distinguish',
    marks: 4,
    prompt: 'Distinguish between charging depreciation to the asset account and accumulating it in a Provision for Depreciation account, on any four bases.',
    pointsNeeded: 4,
    points: [
      { text: 'Entry: Depreciation A/c Dr, To Asset A/c; against Depreciation A/c Dr, To Provision for Depreciation A/c.', keywords: ['to asset a/c', 'to provision for depreciation', 'entry'] },
      { text: 'Asset account: it falls every year and shows the book value; it stays at original cost.', keywords: ['original cost', 'stays at cost', 'falls every year'] },
      { text: 'Total depreciation to date: not seen at a glance; seen at once in the provision account.', keywords: ['total depreciation', 'accumulated', 'at a glance'] },
      { text: 'Balance Sheet: the asset is shown at book value only; it is shown at cost less the provision.', keywords: ['cost less provision', 'book value only', 'balance sheet'] },
      { text: 'On sale: the asset account is closed with its book value; an Asset Disposal account usually brings together the cost and the provision.', keywords: ['asset disposal', 'on sale', 'disposal'] },
    ],
    table: {
      headers: ['Basis', 'Charged to the asset account', 'Provision for Depreciation account'],
      rows: [
        ['Entry', 'Depreciation A/c Dr; To Asset A/c', 'Depreciation A/c Dr; To Provision for Depreciation A/c'],
        ['Asset account', 'Falls every year; shows the book value', 'Stays at original cost'],
        ['Total depreciation to date', 'Not seen at a glance', 'Seen at once in the provision account'],
        ['Balance Sheet', 'Asset at book value only', 'Asset at cost less the provision'],
        ['On sale of the asset', 'Asset account closed at its book value', 'Cost and provision brought together, usually in an Asset Disposal account'],
      ],
    },
    markingTip: '1 mark for each basis with both methods; the entry row is credited only if both entries are right.',
    hints: ['Ask what happens to the asset account under each method.', 'Bases: entry, asset account, total depreciation to date, Balance Sheet.'],
  },

  // Provisions and Reserves ---------------------------------------------------------------------------------------
  {
    id: 'w11-pr-001',
    topicId: 'provisions-and-reserves',
    conceptId: 'pr-difference',
    difficulty: 'medium',
    form: 'distinguish',
    marks: 6,
    prompt: 'Distinguish between a provision and a reserve on any six bases.',
    pointsNeeded: 6,
    points: [
      { text: 'Nature: a provision is a charge against profit; a reserve is an appropriation of profit.', keywords: ['charge against profit', 'appropriation'] },
      { text: 'Purpose: a provision meets a known liability or a likely loss; a reserve strengthens the financial position or meets future needs.', keywords: ['known liability', 'likely loss', 'strengthen', 'future needs'] },
      { text: 'Effect on net profit: a provision reduces the net profit; a reserve does not, as it is made after the net profit is found.', keywords: ['reduces net profit', 'after the net profit', 'does not reduce'] },
      { text: 'When made: a provision is made even when there is a loss; a reserve only when there is profit.', keywords: ['even in a loss', 'even when there is a loss', 'only when there is profit', 'only out of profit'] },
      { text: 'Compulsion: a provision must be made; a reserve is generally at the owner\'s choice.', keywords: ['compulsory', 'must be made', 'choice', 'discretion'] },
      { text: 'Shown in the Balance Sheet: a provision is deducted from the asset or shown as a liability; a reserve is shown on the liabilities side, with capital.', keywords: ['deducted from the asset', 'with capital', 'liabilities side'] },
      { text: 'Use for distribution: a provision cannot be distributed to the owners; a reserve can be, when needed.', keywords: ['distribution', 'distributed', 'dividend'] },
    ],
    table: {
      headers: ['Basis', 'Provision', 'Reserve'],
      rows: [
        ['Nature', 'A charge against profit', 'An appropriation of profit'],
        ['Purpose', 'Meets a known liability or a likely loss', 'Strengthens the financial position; meets future needs'],
        ['Effect on net profit', 'Reduces it', 'Does not reduce it; made after it is found'],
        ['When made', 'Even when there is a loss', 'Only when there is profit'],
        ['Compulsion', 'Must be made', 'Generally at the owner\'s choice'],
        ['Shown in the Balance Sheet', 'Deducted from the asset, or as a liability', 'On the liabilities side, with capital'],
        ['Use for distribution', 'Cannot be distributed', 'Can be distributed when needed'],
      ],
    },
    markingTip: '1 mark for each basis with both sides; a pair of sides without its basis earns half. Writing the meaning of each term is not a difference.',
    hints: ['Ask whether the amount is deducted before the net profit is found or taken out of it afterwards.', 'Bases: nature, purpose, effect on net profit, when made, compulsion, Balance Sheet.'],
  },
  {
    id: 'w11-pr-002',
    topicId: 'provisions-and-reserves',
    conceptId: 'pr-revenue-capital',
    difficulty: 'medium',
    form: 'distinguish',
    marks: 4,
    prompt: 'Distinguish between a revenue reserve and a capital reserve on any four bases.',
    pointsNeeded: 4,
    points: [
      { text: 'Source: a revenue reserve is made out of the profit of normal business operations; a capital reserve out of capital profits.', keywords: ['normal operations', 'capital profits', 'source'] },
      { text: 'Examples: general reserve or a reserve for a named revenue purpose; a gain on the sale or revaluation of a fixed asset.', keywords: ['general reserve', 'sale of a fixed asset', 'revaluation'] },
      { text: 'Purpose: a revenue reserve strengthens the business and meets future needs; a capital reserve is kept for capital losses or for strengthening the capital base.', keywords: ['capital losses', 'future needs', 'purpose'] },
      { text: 'Distribution: a revenue reserve can be distributed as profit; a capital reserve is generally not distributed.', keywords: ['distributed', 'not distributed', 'distribution'] },
      { text: 'Dependence on trading profit: a revenue reserve can be made only in a year with a revenue profit; a capital reserve can arise even in a year of trading loss, from a capital gain.', keywords: ['trading loss', 'only in a year', 'even in a year'] },
    ],
    table: {
      headers: ['Basis', 'Revenue reserve', 'Capital reserve'],
      rows: [
        ['Source', 'Profit of normal business operations', 'Capital profits'],
        ['Examples', 'General reserve; a reserve for a named revenue purpose', 'Gain on the sale or revaluation of a fixed asset'],
        ['Purpose', 'Strengthens the business; meets future needs', 'Meets capital losses; strengthens the capital base'],
        ['Distribution', 'Can be distributed as profit', 'Generally not distributed'],
        ['Dependence on trading profit', 'Made only in a year with a revenue profit', 'Can arise even in a year of trading loss, from a capital gain'],
      ],
    },
    markingTip: '1 mark for each basis with both sides; the source row is the one examiners look for first, and an example placed under the wrong kind costs that row.',
    hints: ['The difference starts with where the profit came from.', 'Bases: source, examples, purpose, distribution.'],
  },
  {
    id: 'w11-pr-003',
    topicId: 'provisions-and-reserves',
    conceptId: 'pr-general-specific',
    difficulty: 'easy',
    form: 'distinguish',
    marks: 3,
    prompt: 'Distinguish between a general reserve and a specific reserve on any three bases.',
    pointsNeeded: 3,
    points: [
      { text: 'Purpose: a general reserve is kept for no particular purpose; a specific reserve for a named purpose.', keywords: ['no particular purpose', 'named purpose', 'specific purpose'] },
      { text: 'Use: a general reserve can be used for any need; a specific reserve only for its own purpose.', keywords: ['any need', 'any purpose', 'only for'] },
      { text: 'Examples: general reserve; a dividend equalisation reserve or a reserve for the replacement of an asset.', keywords: ['dividend equalisation', 'replacement', 'example'] },
      { text: 'Other name: a general reserve is also called a free reserve; a specific reserve is not free for other uses.', keywords: ['free reserve', 'not free'] },
    ],
    table: {
      headers: ['Basis', 'General reserve', 'Specific reserve'],
      rows: [
        ['Purpose', 'No particular purpose', 'A named purpose'],
        ['Use', 'Any need of the business', 'Only the purpose for which it is made'],
        ['Examples', 'General reserve', 'Dividend equalisation reserve; reserve for replacement of an asset'],
        ['Other name', 'A free reserve', 'Not free for other uses'],
      ],
    },
    markingTip: '1 mark for each basis with both sides; "general reserve is bigger" is not a difference.',
    hints: ['The names give the answer: one is general, the other is tied to a purpose.', 'Bases: purpose, use, examples.'],
  },
  {
    id: 'w11-pr-004',
    topicId: 'provisions-and-reserves',
    conceptId: 'pr-secret',
    difficulty: 'complex',
    form: 'short-note',
    marks: 4,
    prompt: 'Write a short note on a secret reserve.',
    pointsNeeded: 4,
    points: [
      { text: 'Meaning: a reserve that does not appear in the Balance Sheet, so the real position is stronger than the one shown.', keywords: ['not shown', 'does not appear', 'hidden'] },
      { text: 'How created: by undervaluing assets, overvaluing liabilities, charging excessive depreciation or provisions, or treating capital expenditure as revenue.', keywords: ['undervaluing', 'excessive depreciation', 'overvaluing liabilities', 'capital as revenue'] },
      { text: 'Purpose: to meet hard times, keep results steady, and keep the real strength hidden from competitors.', keywords: ['competitors', 'hard times', 'steady', 'purpose'] },
      { text: 'Drawback: it makes the accounts show less than the truth, so it breaks full disclosure and can mislead users; it is not allowed for most companies.', keywords: ['mislead', 'full disclosure', 'not allowed', 'drawback'] },
    ],
    answer:
      '1. Meaning: A secret reserve is a reserve that does not appear in the Balance Sheet; the business is in fact stronger than its Balance Sheet shows.\n' +
      '2. How it is created: By showing assets below their real value, showing liabilities above their real amount, charging excessive depreciation or provisions, or treating capital expenditure as revenue expenditure.\n' +
      '3. Purpose: To meet losses in hard times, to keep the results steady from year to year, and to keep the real strength of the business hidden from competitors.\n' +
      '4. Drawback: The accounts show less than the truth, which goes against full disclosure and can mislead owners and other users; companies in general are not allowed to keep one.',
    markingTip: '1 mark for each point; a point on how it is created needs at least one correct method, and "a reserve kept in a locker" earns nothing.',
    hints: ['A secret reserve is not shown: ask how a business could have more than its Balance Sheet says.', 'Cover its meaning, how it is created, why, and what is wrong with it.'],
  },
  {
    id: 'w11-pr-005',
    topicId: 'provisions-and-reserves',
    conceptId: 'pr-reserve-meaning',
    difficulty: 'easy',
    form: 'reasons',
    marks: 3,
    prompt: 'Give any three reasons why a business creates reserves.',
    pointsNeeded: 3,
    points: [
      { text: 'To strengthen the financial position of the business.', keywords: ['strengthen', 'financial position'] },
      { text: 'To meet future losses or contingencies.', keywords: ['future losses', 'contingencies', 'unforeseen'] },
      { text: 'To finance expansion from its own funds, without borrowing.', keywords: ['expansion', 'own funds', 'without borrowing'] },
      { text: 'To keep payouts to the owners steady in lean years.', keywords: ['steady', 'lean years', 'equalise'] },
      { text: 'To repay long-term liabilities, or to add to working capital.', keywords: ['repay', 'working capital', 'long-term liabilities'] },
    ],
    answer:
      'A reserve is a part of profit kept back in the business. It is created:\n' +
      '1. To strengthen the financial position of the business.\n' +
      '2. To meet future losses or contingencies that cannot be foreseen.\n' +
      '3. To finance expansion from the business\'s own funds, without borrowing.\n' +
      '4. To keep the payouts to the owners steady in lean years.\n' +
      '5. To repay long-term liabilities, or to add to working capital.',
    markingTip: '1 mark for each reason; "to meet a known liability" describes a provision, not a reserve, and earns nothing.',
    hints: ['A reserve is profit kept back: ask what a business could use it for later.', 'Start with strengthening the financial position.'],
  },
  {
    id: 'w11-pr-006',
    topicId: 'provisions-and-reserves',
    conceptId: 'pr-provision-meaning',
    difficulty: 'easy',
    form: 'explain',
    marks: 4,
    prompt: 'What is a provision? Give any three examples of provisions.',
    pointsNeeded: 4,
    points: [
      { text: 'Meaning: an amount charged against profit to meet a known liability or a likely loss whose exact amount is not known.', keywords: ['charged against profit', 'known liability', 'exact amount'] },
      { text: 'Provision for doubtful debts.', keywords: ['doubtful debts'] },
      { text: 'Provision for depreciation.', keywords: ['provision for depreciation'] },
      { text: 'Provision for discount on debtors.', keywords: ['discount on debtors'] },
      { text: 'Provision for repairs and renewals.', keywords: ['repairs and renewals', 'repairs'] },
      { text: 'Provision for taxation (in a company).', keywords: ['taxation', 'tax'] },
    ],
    answer:
      '1. Meaning: A provision is an amount charged against the profit of a year to meet a known liability, or a likely loss, whose exact amount cannot yet be determined. It is made whether there is a profit or not.\n' +
      'Examples:\n' +
      '2. Provision for doubtful debts.\n' +
      '3. Provision for depreciation.\n' +
      '4. Provision for discount on debtors.\n' +
      '5. Provision for repairs and renewals.\n' +
      '6. Provision for taxation, in a company.',
    markingTip: '1 mark for the meaning and 1 for each correct example; a reserve given as an example of a provision earns nothing.',
    hints: ['A provision is charged before the net profit is found: for what kind of amount?', 'Think of debtors who may not pay, and machines wearing out.'],
  },
  {
    id: 'w11-pr-007',
    topicId: 'provisions-and-reserves',
    conceptId: 'pr-reserve-meaning',
    difficulty: 'easy',
    form: 'explain',
    marks: 1,
    prompt: 'What is a reserve fund?',
    pointsNeeded: 1,
    points: [
      { text: 'A reserve fund is a reserve whose amount is invested outside the business in earmarked securities, so that the money is ready when the purpose arises.', keywords: ['invested outside', 'earmarked', 'securities'] },
    ],
    answer: 'A reserve fund is a reserve whose amount is invested outside the business, in securities earmarked for it, so that the money is ready when the purpose arises.',
    markingTip: 'The mark needs the investment outside the business; a reserve whose money stays in the business is not a reserve fund.',
    hints: ['How does it differ from a reserve kept inside the business?', 'Its money is invested outside.'],
  },
  {
    id: 'w11-pr-008',
    topicId: 'provisions-and-reserves',
    conceptId: 'pr-difference',
    difficulty: 'complex',
    form: 'reasons',
    marks: 3,
    prompt: 'State, with a reason, whether each of the following is a provision or a reserve: (i) 5% of debtors set aside because some customers may not pay. (ii) 10% of the net profit kept in the business to finance a new branch. (iii) The gain on selling an old building, kept aside and not paid out to the owner.',
    pointsNeeded: 3,
    points: [
      { text: '(i) A provision (for doubtful debts): it meets a likely loss and is charged against profit.', keywords: ['provision for doubtful debts', 'likely loss', 'charge against profit'] },
      { text: '(ii) A reserve (a revenue reserve): it is taken out of profit already found, by choice, to strengthen the business.', keywords: ['revenue reserve', 'out of profit', 'appropriation'] },
      { text: '(iii) A reserve (a capital reserve): it comes from a capital profit, the gain on a fixed asset.', keywords: ['capital reserve', 'capital profit', 'sale of a fixed asset'] },
    ],
    answer:
      '(i) Provision: An amount set aside for debtors who may not pay meets a likely loss whose exact amount is not known. It is charged against profit: a provision for doubtful debts.\n' +
      '(ii) Reserve: It is taken out of the net profit already found, by choice, to strengthen the business and finance expansion. It is a revenue reserve.\n' +
      '(iii) Reserve: The gain on selling a fixed asset is a capital profit; kept aside, it is a capital reserve.',
    markingTip: '½ mark for the right answer and ½ for the reason, in each part; an answer with no reason earns half.',
    hints: ['Ask in each case: is it charged before the net profit is found, or kept back out of profit?', 'Part (iii) comes from a capital profit, not from trading.'],
  },

  // Financial Statements (without adjustments) --------------------------------------------------------------------
  {
    id: 'w11-fa-001',
    topicId: 'final-accounts',
    conceptId: 'fa-pl',
    difficulty: 'medium',
    form: 'distinguish',
    marks: 4,
    prompt: 'Distinguish between the Trading Account and the Profit and Loss Account on any four bases.',
    pointsNeeded: 4,
    points: [
      { text: 'Purpose: the Trading Account finds the gross profit or gross loss; the Profit and Loss Account the net profit or net loss.', keywords: ['gross profit', 'net profit', 'purpose'] },
      { text: 'Expenses shown: the Trading Account takes direct expenses; the Profit and Loss Account indirect expenses.', keywords: ['direct expenses', 'indirect expenses'] },
      { text: 'Stock: opening and closing stock appear in the Trading Account; neither appears in the Profit and Loss Account.', keywords: ['opening stock', 'closing stock', 'no stock'] },
      { text: 'Result transferred to: the gross profit goes to the Profit and Loss Account; the net profit goes to the Capital Account.', keywords: ['transferred to capital', 'capital account', 'net profit goes'] },
      { text: 'Order: the Trading Account is prepared first; the Profit and Loss Account after it, starting from the gross profit.', keywords: ['prepared first', 'order of preparation', 'prepared after'] },
    ],
    table: {
      headers: ['Basis', 'Trading Account', 'Profit and Loss Account'],
      rows: [
        ['Purpose', 'Finds the gross profit or loss', 'Finds the net profit or loss'],
        ['Expenses shown', 'Direct expenses', 'Indirect expenses'],
        ['Stock', 'Opening and closing stock appear', 'No stock appears'],
        ['Result transferred to', 'The Profit and Loss Account', 'The Capital Account'],
        ['Order of preparation', 'Prepared first', 'Prepared after the Trading Account, starting from its gross profit'],
      ],
    },
    markingTip: '1 mark for each basis with both accounts; listing items of each account without a basis earns half at most.',
    hints: ['One account is about the goods; the other about running the business.', 'Bases: purpose, expenses shown, stock, where the result goes.'],
  },
  {
    id: 'w11-fa-002',
    topicId: 'final-accounts',
    conceptId: 'fa-capital-revenue',
    difficulty: 'easy',
    form: 'distinguish',
    marks: 3,
    prompt: 'Distinguish between a capital receipt and a revenue receipt on any three bases.',
    pointsNeeded: 3,
    points: [
      { text: 'Source: a capital receipt comes from the owner, a loan or the sale of a fixed asset; a revenue receipt from the normal activity of the business.', keywords: ['loan', 'sale of a fixed asset', 'normal activity', 'source'] },
      { text: 'Recurrence: a capital receipt is non-recurring; a revenue receipt recurs.', keywords: ['non-recurring', 'recurring', 'regular'] },
      { text: 'Shown in: a capital receipt affects the Balance Sheet; a revenue receipt is credited to the Trading or Profit and Loss Account.', keywords: ['balance sheet', 'profit and loss'] },
      { text: 'Effect on profit: a capital receipt does not add to profit; a revenue receipt does.', keywords: ['does not add', 'adds to profit', 'effect on profit'] },
      { text: 'Examples: capital brought in, a loan taken, a machine sold; sales, commission received, rent received.', keywords: ['capital brought in', 'commission received', 'rent received'] },
    ],
    table: {
      headers: ['Basis', 'Capital receipt', 'Revenue receipt'],
      rows: [
        ['Source', 'The owner, a loan, or the sale of a fixed asset', 'The normal activity of the business'],
        ['Recurrence', 'Non-recurring', 'Recurring'],
        ['Shown in', 'The Balance Sheet', 'The Trading or Profit and Loss Account'],
        ['Effect on profit', 'Does not add to profit', 'Adds to profit'],
        ['Examples', 'Capital brought in; a loan; a machine sold', 'Sales; commission received; rent received'],
      ],
    },
    markingTip: '1 mark for each basis with both sides; the sale of goods is a revenue receipt, and calling it capital costs the row.',
    hints: ['Ask whether the money comes from the regular work of the business.', 'Bases: source, recurrence, where shown.'],
  },
  {
    id: 'w11-fa-003',
    topicId: 'final-accounts',
    conceptId: 'fa-balance-sheet',
    difficulty: 'medium',
    form: 'explain',
    marks: 4,
    prompt: 'Explain the terms grouping and marshalling of assets and liabilities, and the two orders in which marshalling is done.',
    pointsNeeded: 4,
    points: [
      { text: 'Grouping: putting items of a like kind under one head, such as fixed assets, current assets, long-term liabilities and current liabilities.', keywords: ['grouping', 'like kind', 'one head'] },
      { text: 'Marshalling: arranging the groups, and the items within them, in a fixed order in the Balance Sheet.', keywords: ['marshalling', 'arranging', 'fixed order'] },
      { text: 'Order of liquidity: assets start with the most liquid (cash) and end with the least (land and building); liabilities start with those due first.', keywords: ['liquidity', 'cash first', 'most liquid'] },
      { text: 'Order of permanence: assets start with the most permanent (land and building) and end with cash; liabilities start with capital and long-term liabilities.', keywords: ['permanence', 'land and building first', 'most permanent'] },
    ],
    answer:
      '1. Grouping: Putting items of a like kind under one head, such as fixed assets, current assets, long-term liabilities and current liabilities, so that the Balance Sheet is easy to read.\n' +
      '2. Marshalling: Arranging these groups, and the items in each, in a fixed order in the Balance Sheet.\n' +
      '3. Order of liquidity: Assets begin with the most liquid (cash in hand, cash at bank) and end with the least liquid (land and building); liabilities begin with those payable first (current liabilities).\n' +
      '4. Order of permanence: Assets begin with the most permanent (land and building) and end with cash; liabilities begin with capital and long-term liabilities and end with current liabilities.',
    markingTip: '1 mark for each point; describing the two orders with the assets the wrong way round costs both of their marks.',
    hints: ['Grouping decides the heads; marshalling decides their order.', 'One order begins with cash, the other with land and building.'],
  },
  {
    id: 'w11-fa-004',
    topicId: 'final-accounts',
    conceptId: 'fa-capital-revenue',
    difficulty: 'complex',
    form: 'explain',
    marks: 3,
    prompt: 'What is deferred revenue expenditure? Explain how it is treated in the final accounts, with an example.',
    pointsNeeded: 3,
    points: [
      { text: 'Meaning: revenue expenditure of an unusually large amount whose benefit lasts for more than one year.', keywords: ['unusually large', 'more than one year', 'benefit lasts'] },
      { text: 'Treatment: it is written off to the Profit and Loss Account over the years that benefit, and the part not yet written off is shown on the assets side of the Balance Sheet.', keywords: ['written off over', 'not yet written off', 'assets side'] },
      { text: 'Example: ₹6,00,000 spent on an advertising campaign to launch a product, written off over three years at ₹2,00,000 a year.', keywords: ['advertising', 'campaign', 'launch'] },
    ],
    answer:
      '1. Meaning: Deferred revenue expenditure is expenditure of a revenue nature, but so large and with a benefit lasting more than one year that charging it all to one year would distort that year\'s profit.\n' +
      '2. Treatment: It is written off to the Profit and Loss Account over the years that benefit from it. The part not yet written off is shown on the assets side of the Balance Sheet.\n' +
      '3. Example: ₹6,00,000 spent on an advertising campaign to launch a new product, expected to benefit three years, is written off at ₹2,00,000 a year; at the end of the first year, ₹4,00,000 is shown on the assets side.',
    markingTip: '1 mark each for the meaning, the treatment and a correct example; calling it capital expenditure costs the meaning mark.',
    hints: ['It is revenue in nature, but its benefit goes beyond one year.', 'A heavy advertising campaign is the usual example: how much is charged each year?'],
  },
  {
    id: 'w11-fa-005',
    topicId: 'final-accounts',
    conceptId: 'fa-pl',
    difficulty: 'medium',
    form: 'explain',
    marks: 3,
    prompt: 'What is operating profit? Explain how it is found from the net profit.',
    pointsNeeded: 3,
    points: [
      { text: 'Meaning: the profit earned from the normal operations of the business, before non-operating items.', keywords: ['normal operations', 'operating activities', 'core'] },
      { text: 'Add non-operating expenses and losses to net profit: interest on loans, loss on sale of a fixed asset, loss by fire.', keywords: ['add non-operating expenses', 'interest on loans', 'loss on sale', 'loss by fire'] },
      { text: 'Deduct non-operating incomes and gains from net profit: interest and dividend received, rent received, profit on sale of a fixed asset.', keywords: ['deduct non-operating incomes', 'dividend received', 'profit on sale'] },
    ],
    answer:
      '1. Meaning: Operating profit is the profit earned from the normal operations of the business: the buying, making and selling it exists to do.\n' +
      '2. Add non-operating expenses: To the net profit are added expenses and losses that are not part of normal operations, such as interest on loans, a loss on the sale of a fixed asset and a loss by fire.\n' +
      '3. Deduct non-operating incomes: From the net profit are deducted incomes and gains from outside normal operations, such as interest and dividend received, rent received and a profit on the sale of a fixed asset.\n' +
      'Operating profit = Net profit + Non-operating expenses - Non-operating incomes.',
    markingTip: '1 mark for the meaning and 1 for each adjustment with an example; adding the non-operating incomes reverses the formula and loses both adjustment marks.',
    hints: ['Strip out everything that is not part of the normal trade.', 'Add back the non-operating expenses; take out the non-operating incomes.'],
  },
  {
    id: 'w11-fa-006',
    topicId: 'final-accounts',
    conceptId: 'fa-trading',
    difficulty: 'easy',
    form: 'explain',
    marks: 1,
    prompt: 'What is meant by the cost of goods sold?',
    pointsNeeded: 1,
    points: [
      { text: 'Cost of goods sold is the cost of the goods actually sold in the period: Opening stock + Net purchases + Direct expenses - Closing stock.', keywords: ['opening stock', 'net purchases', 'direct expenses', 'closing stock'] },
    ],
    answer: 'Cost of goods sold is the cost of the goods actually sold during the period: Opening stock + Net purchases + Direct expenses - Closing stock.',
    markingTip: 'The mark needs the meaning or the correct formula; leaving out closing stock earns nothing.',
    hints: ['Start with the stock at the beginning; what is added, and what is taken away?', 'Begin with the opening stock, add what was bought and what it cost to bring it in, then take away what is left.'],
  },
  {
    id: 'w11-fa-007',
    topicId: 'final-accounts',
    conceptId: 'fa-trading',
    difficulty: 'easy',
    form: 'list',
    marks: 3,
    prompt: 'State any three advantages of preparing a Trading Account.',
    pointsNeeded: 3,
    points: [
      { text: 'It shows the gross profit or gross loss on the buying and selling of goods.', keywords: ['gross profit', 'gross loss'] },
      { text: 'Gross profit can be compared with sales (gross profit ratio) and with earlier years.', keywords: ['gross profit ratio', 'compared', 'earlier years'] },
      { text: 'It shows the cost of goods sold and the direct expenses, so they can be controlled.', keywords: ['cost of goods sold', 'direct expenses', 'control'] },
      { text: 'It helps in fixing selling prices that cover cost and leave a margin.', keywords: ['selling price', 'pricing', 'margin'] },
      { text: 'It shows the movement of stock, helping to keep stock at the right level.', keywords: ['stock level', 'closing stock', 'movement of stock'] },
    ],
    answer:
      '1. Gross profit: It shows the gross profit or gross loss on the buying and selling of goods.\n' +
      '2. Comparison: Gross profit can be compared with sales (the gross profit ratio) and with earlier years.\n' +
      '3. Control of direct costs: It sets out the cost of goods sold and the direct expenses, so that they can be controlled.\n' +
      '4. Pricing: It helps fix selling prices that cover cost and leave a fair margin.\n' +
      '5. Stock: It shows the opening and closing stock, which helps keep stock at the right level.',
    markingTip: '1 mark for each advantage; "it shows the net profit" belongs to the Profit and Loss Account and earns nothing.',
    hints: ['The Trading Account is the story of the goods: what can the owner learn from it?', 'Start with the gross profit and its comparison with sales.'],
  },

  // Financial Statements with Adjustments -------------------------------------------------------------------------
  {
    id: 'w11-faa-001',
    topicId: 'final-accounts-adjustments',
    conceptId: 'faa-outstanding-prepaid',
    difficulty: 'easy',
    form: 'distinguish',
    marks: 3,
    prompt: 'Distinguish between an outstanding expense and a prepaid expense on any three bases.',
    pointsNeeded: 3,
    points: [
      { text: 'Meaning: an outstanding expense belongs to the current year but is not yet paid; a prepaid expense is paid in the current year but belongs to the next.', keywords: ['not yet paid', 'paid in advance', 'belongs to the next', 'unpaid'] },
      { text: 'Nature: an outstanding expense is a liability; a prepaid expense is an asset.', keywords: ['is a liability', 'is an asset', 'nature'] },
      { text: 'Treatment in the Profit and Loss Account: an outstanding expense is added to the expense; a prepaid expense is deducted from it.', keywords: ['added to the expense', 'deducted from the expense', 'added to expense', 'deducted from expense'] },
      { text: 'Shown in the Balance Sheet: an outstanding expense among current liabilities; a prepaid expense among current assets.', keywords: ['current liabilities', 'current assets'] },
      { text: 'Adjusting entry: Expense A/c Dr, To Outstanding Expenses A/c; Prepaid Expenses A/c Dr, To Expense A/c.', keywords: ['to outstanding expenses', 'prepaid expenses a/c dr', 'entry'] },
    ],
    table: {
      headers: ['Basis', 'Outstanding expense', 'Prepaid expense'],
      rows: [
        ['Meaning', 'Belongs to this year; not yet paid', 'Paid this year; belongs to the next'],
        ['Nature', 'A liability', 'An asset'],
        ['In the Profit and Loss Account', 'Added to the expense', 'Deducted from the expense'],
        ['In the Balance Sheet', 'Current liabilities', 'Current assets'],
        ['Adjusting entry', 'Expense A/c Dr; To Outstanding Expenses A/c', 'Prepaid Expenses A/c Dr; To Expense A/c'],
      ],
    },
    markingTip: '1 mark for each basis with both sides; showing only one effect of either adjustment loses the row it belongs to.',
    hints: ['One expense is owed at the year end, the other is paid ahead.', 'Bases: meaning, nature, treatment in the Profit and Loss Account, Balance Sheet.'],
  },
  {
    id: 'w11-faa-002',
    topicId: 'final-accounts-adjustments',
    conceptId: 'faa-accrued-advance',
    difficulty: 'medium',
    form: 'distinguish',
    marks: 3,
    prompt: 'Distinguish between accrued income and income received in advance on any three bases.',
    pointsNeeded: 3,
    points: [
      { text: 'Meaning: accrued income is earned in the current year but not yet received; income received in advance is received in the current year but belongs to the next.', keywords: ['earned but not received', 'not yet received', 'received in advance', 'belongs to the next'] },
      { text: 'Nature: accrued income is an asset; income received in advance is a liability.', keywords: ['is an asset', 'is a liability', 'nature'] },
      { text: 'Treatment in the Profit and Loss Account: accrued income is added to the income; income received in advance is deducted from it.', keywords: ['added to the income', 'deducted from the income', 'added to income', 'deducted from income'] },
      { text: 'Shown in the Balance Sheet: accrued income among current assets; income received in advance among current liabilities.', keywords: ['current assets', 'current liabilities'] },
      { text: 'Adjusting entry: Accrued Income A/c Dr, To Income A/c; Income A/c Dr, To Income Received in Advance A/c.', keywords: ['accrued income a/c dr', 'to income received in advance', 'entry'] },
    ],
    table: {
      headers: ['Basis', 'Accrued income', 'Income received in advance'],
      rows: [
        ['Meaning', 'Earned this year; not yet received', 'Received this year; belongs to the next'],
        ['Nature', 'An asset', 'A liability'],
        ['In the Profit and Loss Account', 'Added to the income', 'Deducted from the income'],
        ['In the Balance Sheet', 'Current assets', 'Current liabilities'],
        ['Adjusting entry', 'Accrued Income A/c Dr; To Income A/c', 'Income A/c Dr; To Income Received in Advance A/c'],
      ],
    },
    markingTip: '1 mark for each basis with both sides; calling income received in advance an asset costs both the nature and the Balance Sheet rows.',
    hints: ['One income is due to the business; for the other, the business owes the service.', 'Bases: meaning, nature, treatment in the Profit and Loss Account.'],
  },
  {
    id: 'w11-faa-003',
    topicId: 'final-accounts-adjustments',
    conceptId: 'faa-two-effects',
    difficulty: 'easy',
    form: 'reasons',
    marks: 4,
    prompt: 'Give any four reasons why adjustments are needed before the financial statements are prepared.',
    pointsNeeded: 4,
    points: [
      { text: 'Correct profit: to bring into the year all the income earned and expenses incurred in it, and nothing else.', keywords: ['correct profit', 'true profit', 'earned and incurred'] },
      { text: 'True financial position: so that the Balance Sheet shows every asset and liability, such as amounts owing and paid in advance.', keywords: ['financial position', 'balance sheet', 'true and fair'] },
      { text: 'Accrual and matching: to follow the accrual basis and match the expenses of a year with its revenue.', keywords: ['accrual', 'matching'] },
      { text: 'Items not yet recorded: to record year-end items such as closing stock and depreciation that the trial balance does not hold.', keywords: ['closing stock', 'depreciation', 'not recorded'] },
      { text: 'Prudence: to provide for likely losses, such as bad and doubtful debts.', keywords: ['prudence', 'doubtful debts', 'likely losses'] },
      { text: 'Errors and omissions: to correct errors and record transactions left out.', keywords: ['errors', 'omissions', 'left out'] },
    ],
    answer:
      '1. Correct profit: To bring into the year all the income earned and the expenses incurred in it, whether received or paid or not.\n' +
      '2. True financial position: So that the Balance Sheet shows every asset and liability, including amounts owing and amounts paid in advance.\n' +
      '3. Accrual and matching: To follow the accrual basis and match the expenses of the year with its revenue.\n' +
      '4. Year-end items: To record items such as closing stock and depreciation, which are not in the trial balance.\n' +
      '5. Prudence: To provide for likely losses, such as bad and doubtful debts.\n' +
      '6. Errors and omissions: To correct errors found and record transactions left out.',
    markingTip: '1 mark for each reason with its explanation; a list of adjustments (outstanding rent, prepaid insurance) without the reason earns 1 mark at most.',
    hints: ['A trial balance shows cash paid and received: what does it miss?', 'Think of the correct profit, the true position, and items never recorded during the year.'],
  },
  {
    id: 'w11-faa-004',
    topicId: 'final-accounts-adjustments',
    conceptId: 'faa-two-effects',
    difficulty: 'complex',
    form: 'explain',
    marks: 4,
    prompt: 'Every adjustment has two effects in the financial statements. Explain the two effects of each of the following adjustments given outside the trial balance: (i) closing stock, (ii) depreciation on machinery, (iii) a new provision for doubtful debts, (iv) interest on capital.',
    pointsNeeded: 4,
    points: [
      { text: '(i) Closing stock: credited to the Trading Account; shown as a current asset in the Balance Sheet.', keywords: ['credit side of the trading', 'credited to trading', 'current asset'] },
      { text: '(ii) Depreciation: debited to the Profit and Loss Account; deducted from machinery in the Balance Sheet.', keywords: ['deducted from machinery', 'debited to profit and loss', 'depreciation'] },
      { text: '(iii) Provision for doubtful debts: the new provision, less any old provision, is debited to the Profit and Loss Account; the new provision is deducted from debtors in the Balance Sheet.', keywords: ['deducted from debtors', 'new provision', 'old provision'] },
      { text: '(iv) Interest on capital: debited to the Profit and Loss Account as an expense; added to capital in the Balance Sheet.', keywords: ['added to capital', 'interest on capital'] },
    ],
    answer:
      '(i) Closing stock: Shown on the credit side of the Trading Account, which lowers the cost of goods sold; and as a current asset in the Balance Sheet.\n' +
      '(ii) Depreciation on machinery: Debited to the Profit and Loss Account as an expense; and deducted from machinery on the assets side of the Balance Sheet.\n' +
      '(iii) New provision for doubtful debts: The new provision, less the old provision (if any), is debited to the Profit and Loss Account, along with bad debts; the new provision is deducted from debtors in the Balance Sheet.\n' +
      '(iv) Interest on capital: Debited to the Profit and Loss Account as an expense of the business; and added to the capital on the liabilities side of the Balance Sheet.',
    markingTip: '½ mark for each effect; an adjustment shown in one place only earns half, and closing stock shown in the Profit and Loss Account earns nothing.',
    hints: ['For each item, find one place in the Trading or Profit and Loss Account and one in the Balance Sheet.', 'Closing stock goes to the Trading Account; the other three to the Profit and Loss Account first.'],
  },
  {
    id: 'w11-faa-005',
    topicId: 'final-accounts-adjustments',
    conceptId: 'faa-commission',
    difficulty: 'medium',
    form: 'explain',
    marks: 3,
    prompt: 'The net profit of a business before charging the manager\'s commission is ₹1,10,000 and the manager is entitled to a commission of 10%. Explain how the commission is calculated when it is (i) on the net profit before charging it and (ii) on the net profit after charging it, and how it is shown in the financial statements.',
    pointsNeeded: 3,
    points: [
      { text: '(i) Before charging: commission = ₹1,10,000 × 10/100 = ₹11,000.', keywords: ['11,000', '10/100', 'before charging'] },
      { text: '(ii) After charging: commission = ₹1,10,000 × 10/110 = ₹10,000.', keywords: ['10/110', 'after charging', '100 + rate'] },
      { text: 'Shown: debited to the Profit and Loss Account; if unpaid, shown as outstanding commission among current liabilities.', keywords: ['outstanding commission', 'current liabilities', 'debited to profit and loss'] },
    ],
    answer:
      '(i) On the net profit before charging the commission: Commission = Net profit × Rate / 100 = ₹1,10,000 × 10/100 = ₹11,000.\n' +
      '(ii) On the net profit after charging the commission: Commission = Net profit before commission × Rate / (100 + Rate) = ₹1,10,000 × 10/110 = ₹10,000. Check: 10% of the profit left, ₹1,00,000, is ₹10,000.\n' +
      '(iii) Treatment: The commission is debited to the Profit and Loss Account as an expense. If it is unpaid at the year end, it is shown as outstanding manager\'s commission under current liabilities. Entry: Manager\'s Commission A/c Dr; To Outstanding Manager\'s Commission A/c.',
    markingTip: '1 mark for each part; taking 10% of ₹1,10,000 in part (ii) is the usual slip and earns nothing for that part.',
    hints: ['In part (ii), the commission is 10% of what is left after it, so it is 10 parts out of 110.', 'Part (i) is plain 10% of ₹1,10,000; check part (ii) by taking 10% of the profit left after it.'],
  },
  {
    id: 'w11-faa-006',
    topicId: 'final-accounts-adjustments',
    conceptId: 'faa-goods-loss',
    difficulty: 'complex',
    form: 'explain',
    marks: 3,
    prompt: 'Goods costing ₹50,000 were destroyed by fire, and the insurance company admitted a claim of ₹35,000, which is still to be received. Explain the treatment of this adjustment in the financial statements.',
    pointsNeeded: 3,
    points: [
      { text: 'Trading Account: the cost of the goods lost, ₹50,000, is shown on the credit side (or deducted from purchases).', keywords: ['credit side of the trading', 'deducted from purchases', '50,000'] },
      { text: 'Profit and Loss Account: the loss not covered by insurance, ₹15,000, is debited.', keywords: ['15,000', 'loss not covered', 'debited to profit and loss'] },
      { text: 'Balance Sheet: the claim of ₹35,000 still to be received is shown as a current asset.', keywords: ['35,000', 'insurance claim', 'current asset'] },
    ],
    answer:
      '1. Trading Account: The goods lost, at cost ₹50,000, are shown on the credit side (Loss by Fire A/c Dr; To Trading A/c), because they were bought but neither sold nor in stock.\n' +
      '2. Profit and Loss Account: The part of the loss the insurer does not bear, ₹50,000 - ₹35,000 = ₹15,000, is debited as a loss.\n' +
      '3. Balance Sheet: The claim of ₹35,000 admitted but not yet received is shown as a current asset (Insurance Claim Receivable).',
    markingTip: '1 mark for each of the three places; debiting the whole ₹50,000 to the Profit and Loss Account costs the second mark.',
    hints: ['Three places are affected: the Trading Account, the Profit and Loss Account and the Balance Sheet.', 'Only the part the insurer does not pay is a loss to the business.'],
  },
  {
    id: 'w11-faa-007',
    topicId: 'final-accounts-adjustments',
    conceptId: 'faa-stock-depreciation',
    difficulty: 'easy',
    form: 'reasons',
    marks: 1,
    prompt: 'Why is closing stock usually given outside the trial balance, as an adjustment?',
    pointsNeeded: 1,
    points: [
      { text: 'Closing stock is found by counting and valuing the goods after the books are closed, so no ledger account holds it when the trial balance is drawn up.', keywords: ['after the books', 'counting', 'stock-taking', 'no ledger account'] },
    ],
    answer: 'Closing stock is found by counting and valuing the unsold goods at the end of the year, after the books are closed. No ledger account holds it when the trial balance is drawn up, so it is given as an adjustment.',
    markingTip: 'The mark needs the idea that it is found by stock-taking at the year end and is not yet in the ledger.',
    hints: ['When is closing stock counted?', 'No account in the ledger holds it yet.'],
  },

  // Incomplete Records --------------------------------------------------------------------------------------------
  {
    id: 'w11-ir-001',
    topicId: 'incomplete-records',
    conceptId: 'ir-statement',
    difficulty: 'medium',
    form: 'distinguish',
    marks: 4,
    prompt: 'Distinguish between a statement of affairs and a balance sheet on any four bases.',
    pointsNeeded: 4,
    points: [
      { text: 'Records used: a statement of affairs is drawn up from incomplete records and estimates; a balance sheet from the ledger balances of double entry books.', keywords: ['incomplete records', 'estimates', 'ledger balances', 'double entry'] },
      { text: 'Capital: in a statement of affairs it is the balancing figure; in a balance sheet it is taken from the Capital Account.', keywords: ['balancing figure', 'capital account'] },
      { text: 'Reliability: a statement of affairs is less reliable; a balance sheet is more reliable.', keywords: ['less reliable', 'more reliable', 'reliability'] },
      { text: 'Omissions: they are hard to detect in a statement of affairs; in a balance sheet they show up because the two sides do not agree.', keywords: ['omissions', 'hard to detect', 'do not agree'] },
      { text: 'Purpose: a statement of affairs is prepared mainly to find the capital; a balance sheet to show the financial position.', keywords: ['find the capital', 'financial position', 'purpose'] },
    ],
    table: {
      headers: ['Basis', 'Statement of affairs', 'Balance sheet'],
      rows: [
        ['Records used', 'Incomplete records and estimates', 'Ledger balances of double entry books'],
        ['Capital', 'The balancing figure', 'Taken from the Capital Account'],
        ['Reliability', 'Less reliable', 'More reliable'],
        ['Omissions', 'Hard to detect', 'Show up, as the sides do not agree'],
        ['Purpose', 'Mainly to find the capital', 'To show the financial position'],
      ],
    },
    markingTip: '1 mark for each basis with both statements; the capital row is the one examiners look for first.',
    hints: ['Ask where each statement gets its figures from, and how the capital is found.', 'Bases: records used, capital, reliability, omissions.'],
  },
  {
    id: 'w11-ir-002',
    topicId: 'incomplete-records',
    conceptId: 'ir-profit',
    difficulty: 'complex',
    form: 'distinguish',
    marks: 3,
    prompt: 'In finding profit by the statement of affairs method, distinguish between drawings and additional capital introduced on any three bases.',
    pointsNeeded: 3,
    points: [
      { text: 'Meaning: drawings are cash or goods taken out by the owner for personal use; additional capital is money or assets brought in by the owner from private sources.', keywords: ['taken out', 'brought in', 'private sources', 'personal use'] },
      { text: 'Effect on closing capital: drawings reduce it; additional capital increases it.', keywords: ['reduce closing capital', 'increase closing capital', 'effect on closing capital'] },
      { text: 'Treatment in finding profit: drawings are added back to the closing capital; additional capital is deducted from it.', keywords: ['added back', 'deducted from closing capital', 'adjusted capital'] },
      { text: 'Examples: goods taken at cost, the owner\'s private bills paid by the business; a private sum paid into the business, or a business expense paid from private money.', keywords: ['goods taken', 'private bills', 'paid from private money'] },
    ],
    table: {
      headers: ['Basis', 'Drawings', 'Additional capital'],
      rows: [
        ['Meaning', 'Cash or goods taken out by the owner for personal use', 'Money or assets brought in by the owner from private sources'],
        ['Effect on closing capital', 'Reduces it', 'Increases it'],
        ['Treatment in finding profit', 'Added back to the closing capital', 'Deducted from the closing capital'],
        ['Examples', 'Goods taken at cost; private bills paid by the business', 'Private savings paid in; a business expense paid from private money'],
      ],
    },
    markingTip: '1 mark for each basis with both sides; reversing the treatment in finding profit costs that row, and a loan to the business is neither.',
    hints: ['One moves value out of the business to the owner, the other moves it in.', 'Bases: meaning, effect on closing capital, treatment in finding profit.'],
  },
  {
    id: 'w11-ir-003',
    topicId: 'incomplete-records',
    conceptId: 'ir-meaning',
    difficulty: 'easy',
    form: 'features',
    marks: 4,
    prompt: 'State any four features of incomplete records.',
    pointsNeeded: 4,
    points: [
      { text: 'Only cash and personal accounts: usually a cash book and the accounts of debtors and creditors are kept.', keywords: ['cash book', 'personal accounts', 'debtors and creditors'] },
      { text: 'No nominal accounts: accounts of expenses and incomes are generally not kept.', keywords: ['nominal accounts', 'expenses and incomes'] },
      { text: 'No trial balance: the arithmetical accuracy of the books cannot be checked.', keywords: ['trial balance', 'arithmetical'] },
      { text: 'Profit only estimated: profit is found by comparing capital at two dates.', keywords: ['estimated', 'comparing capital', 'two dates'] },
      { text: 'No uniformity: the method of keeping records differs from one business to another.', keywords: ['uniformity', 'differs', 'varies'] },
      { text: 'Private and business dealings mixed: the owner\'s private transactions are often recorded with the business ones.', keywords: ['private', 'mixed'] },
      { text: 'Suited to small concerns: used by sole proprietors and small firms.', keywords: ['small concerns', 'small traders', 'sole proprietor'] },
    ],
    answer:
      'Incomplete records are accounts kept without following double entry fully. Their features are:\n' +
      '1. Cash and personal accounts only: Usually a cash book and the accounts of debtors and creditors are kept.\n' +
      '2. No nominal accounts: Accounts of expenses and incomes are generally not kept.\n' +
      '3. No trial balance: The arithmetical accuracy of the books cannot be checked.\n' +
      '4. Profit only estimated: It is found by comparing the capital at two dates.\n' +
      '5. No uniformity: The way records are kept differs from one business to another.\n' +
      '6. Private and business dealings mixed: The owner\'s private transactions are often recorded with the business ones.\n' +
      '7. Small concerns: The system is used by sole proprietors and small firms.',
    markingTip: '1 mark for each feature with its explanation; a limitation phrased as a feature counts only if it describes the records themselves.',
    hints: ['Think of a small shopkeeper with a cash book and a list of debtors: what is missing?', 'Start with the accounts kept, then the trial balance and the way profit is found.'],
  },
  {
    id: 'w11-ir-004',
    topicId: 'incomplete-records',
    conceptId: 'ir-reasons',
    difficulty: 'easy',
    form: 'reasons',
    marks: 3,
    prompt: 'Give any three reasons why small traders keep incomplete records.',
    pointsNeeded: 3,
    points: [
      { text: 'Simple: no knowledge of the principles of double entry is needed.', keywords: ['simple', 'no knowledge', 'double entry'] },
      { text: 'Cheap: no trained accountant has to be employed.', keywords: ['cheap', 'economical', 'less costly', 'accountant'] },
      { text: 'Quick: it takes little time to keep the records.', keywords: ['quick', 'little time', 'saves time'] },
      { text: 'Enough for a small business: with few transactions, a cash book and personal accounts meet the owner\'s needs.', keywords: ['few transactions', 'small business', 'enough'] },
      { text: 'Profit can still be estimated by the statement of affairs method.', keywords: ['statement of affairs', 'estimate'] },
    ],
    answer:
      '1. Simple: No knowledge of the principles of double entry is needed.\n' +
      '2. Cheap: The trader does not have to employ a trained accountant.\n' +
      '3. Quick: Keeping the records takes little time.\n' +
      '4. Enough for a small business: With few transactions, a cash book and the personal accounts meet the owner\'s needs.\n' +
      '5. Profit can still be found: An estimate of profit is possible by comparing the capital at two dates.',
    markingTip: '1 mark for each reason; "to hide income from tax" is not an accepted reason.',
    hints: ['Think of what double entry demands that a small trader may not have.', 'Start with simplicity and cost.'],
  },
  {
    id: 'w11-ir-005',
    topicId: 'incomplete-records',
    conceptId: 'ir-reasons',
    difficulty: 'medium',
    form: 'list',
    marks: 3,
    prompt: 'State any three limitations of incomplete records.',
    pointsNeeded: 3,
    points: [
      { text: 'Arithmetical accuracy cannot be proved, because no trial balance can be prepared.', keywords: ['trial balance', 'arithmetical accuracy'] },
      { text: 'True profit cannot be found; it can only be estimated.', keywords: ['true profit', 'only estimated'] },
      { text: 'The true financial position cannot be shown, as a proper balance sheet cannot be drawn up.', keywords: ['financial position', 'balance sheet'] },
      { text: 'Errors and frauds are hard to detect.', keywords: ['fraud', 'errors', 'detect'] },
      { text: 'The figures are hard to support before the tax authorities.', keywords: ['tax authorities', 'income tax', 'not accepted'] },
      { text: 'Results are hard to compare and to plan with.', keywords: ['compare', 'planning', 'analysis'] },
    ],
    answer:
      '1. No check on arithmetic: A trial balance cannot be prepared, so the arithmetical accuracy of the books cannot be proved.\n' +
      '2. Profit only estimated: The true profit cannot be found, because nominal accounts are not kept.\n' +
      '3. Financial position unclear: A proper balance sheet cannot be drawn up.\n' +
      '4. Errors and frauds: They are hard to detect.\n' +
      '5. Tax: The figures are hard to support before the tax authorities.\n' +
      '6. Comparison and planning: Results of different years are hard to compare or to plan with.',
    markingTip: '1 mark for each limitation with its explanation; a feature restated (only a cash book is kept) is not a limitation.',
    hints: ['Ask what an owner cannot learn or prove from such records.', 'Start with the trial balance and the true profit.'],
  },
  {
    id: 'w11-ir-006',
    topicId: 'incomplete-records',
    conceptId: 'ir-profit',
    difficulty: 'complex',
    form: 'explain',
    marks: 4,
    prompt: 'Explain the steps followed to find the profit or loss of a year by the statement of affairs method.',
    pointsNeeded: 4,
    points: [
      { text: 'Opening capital: prepare a statement of affairs at the beginning of the year; capital = assets - liabilities.', keywords: ['opening capital', 'beginning of the year', 'opening statement'] },
      { text: 'Closing capital: prepare a statement of affairs at the end of the year in the same way.', keywords: ['closing capital', 'end of the year', 'closing statement'] },
      { text: 'Adjusted closing capital: add drawings and deduct additional capital introduced during the year.', keywords: ['add drawings', 'deduct additional capital', 'adjusted capital'] },
      { text: 'Profit or loss: adjusted closing capital less opening capital; a negative figure is a loss.', keywords: ['less opening capital', 'negative', 'profit or loss ='] },
      { text: 'Further adjustments: deduct interest on capital, depreciation, provisions and outstanding expenses not yet allowed; add prepaid expenses and accrued income, to reach the net profit.', keywords: ['interest on capital', 'depreciation', 'further adjustments', 'net profit'] },
    ],
    answer:
      '1. Capital at the beginning: Prepare a statement of affairs on the first day of the year. Capital = Total business assets - Total business liabilities.\n' +
      '2. Capital at the end: Prepare a statement of affairs on the last day of the year in the same way, leaving out the owner\'s private assets and debts.\n' +
      '3. Adjusted closing capital: Add the drawings of the year to the closing capital and deduct the additional capital introduced.\n' +
      '4. Profit or loss: Deduct the opening capital from the adjusted closing capital. A positive figure is a profit; a negative figure is a loss.\n' +
      '5. Further adjustments: Deduct interest on capital, and any depreciation, provision or outstanding expense not yet allowed; add any prepaid expense or accrued income left out. The result is the net profit or loss.\n' +
      'Profit = Closing capital + Drawings - Additional capital - Opening capital.',
    markingTip: '1 mark for each step in order; deducting drawings or adding additional capital reverses step 3 and costs its mark and the next.',
    hints: ['The method compares the capital at two dates: how is each capital found?', 'Remember to add back drawings and take out fresh capital before comparing.'],
  },
  {
    id: 'w11-ir-007',
    topicId: 'incomplete-records',
    conceptId: 'ir-statement',
    difficulty: 'easy',
    form: 'explain',
    marks: 1,
    prompt: 'What is a statement of affairs?',
    pointsNeeded: 1,
    points: [
      { text: 'A statement of the assets and liabilities of a business on a date, prepared from incomplete records to find the capital as the balancing figure.', keywords: ['assets and liabilities', 'find the capital', 'balancing figure', 'incomplete records'] },
    ],
    answer: 'A statement of affairs is a statement of the assets and liabilities of a business on a given date, prepared from incomplete records, in which the capital is found as the balancing figure.',
    markingTip: 'The mark needs assets and liabilities on a date and the capital as the balancing figure.',
    hints: ['It looks like a balance sheet, but how is the capital found?', 'Capital is the balancing figure.'],
  },
];

export default WRITTEN_11;
