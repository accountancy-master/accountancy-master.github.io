import { buildLadder, laterLevels } from '../ladder';
import type { Card, Concept, Difficulty, McqQuestion, NumericQuestion, Question, TopicPack, TrueFalseQuestion } from '../types';

const T = 'cash-flow-statement';

const concepts: Concept[] = [
  { id: 'cf-meaning', topicId: T, title: 'Meaning, objectives and cash and cash equivalents' },
  { id: 'cf-classify', topicId: T, title: 'Operating, investing and financing activities' },
  { id: 'cf-npbt', topicId: T, title: 'Net profit before tax and extraordinary items' },
  { id: 'cf-adjustments', topicId: T, title: 'Non-cash and non-operating adjustments' },
  { id: 'cf-working-capital', topicId: T, title: 'Working capital changes, cash from operations and tax paid' },
  { id: 'cf-investing', topicId: T, title: 'Investing activities from the asset accounts' },
  { id: 'cf-financing', topicId: T, title: 'Financing activities' },
  { id: 'cf-reconcile', topicId: T, title: 'Net change in cash and its reconciliation' },
  { id: 'cf-formats', topicId: T, title: 'Preparing the Cash Flow Statement, its sections and its workings' },
];

// ---------------------------------------------------------------------------------------------------------------
// Cards
// ---------------------------------------------------------------------------------------------------------------

const card = (
  n: number,
  conceptId: string,
  kind: Card['kind'],
  prompt: string,
  answer: string,
  explanation: string,
  example: string,
  commonMistake: string,
): Card => ({ id: `cf-card-${n}`, topicId: T, conceptId, kind, prompt, answer, explanation, example, commonMistake });

const cards: Card[] = [
  card(1, 'cf-meaning', 'rule', 'What is a Cash Flow Statement and what is it for?',
    'A statement of the inflows and outflows of cash and cash equivalents during a year, grouped into operating, investing and financing activities. It is prepared under AS 3 (Revised); Class 12 uses the indirect method.',
    'Its objective is to show where cash came from and where it went, so that a reader can judge the ability of the company to generate cash and its need for cash. Profit is worked out on the accrual basis and does not tell this.',
    'A company earns a profit of ₹5,00,000 but its cash falls by ₹2,00,000, because it bought machinery for ₹4,00,000 and repaid a loan of ₹3,00,000: 5,00,000 - 4,00,000 - 3,00,000 = a fall of ₹2,00,000. The statement shows exactly this.',
    'Thinking the statement shows profit, or that it is a second balance sheet. It explains the change in cash between two balance sheet dates.'),
  card(2, 'cf-meaning', 'rule', 'What are the benefits of a Cash Flow Statement?',
    'It helps in short-term financial planning, shows liquidity and the ability to pay debts and dividends, explains why profit and cash differ, shows how much cash each kind of activity gave or used, and allows comparison between years and between companies.',
    'It has limits too: it leaves out non-cash transactions, it is based on the past, and it does not replace the Statement of Profit and Loss, because cash earned is not the same as profit earned.',
    'A bank deciding on a loan looks at net cash from operating activities to see whether the interest and instalments can be paid out of the business itself.',
    'Treating a rise in cash as proof of a good year: cash may have risen only because a large loan was taken.'),
  card(3, 'cf-meaning', 'rule', 'What are cash and cash equivalents?',
    'Cash in hand, balances with banks (demand deposits), cheques and drafts in hand, and cash equivalents: short-term, highly liquid investments that are readily convertible into a known amount of cash, carry an insignificant risk of change in value and mature within three months of being bought.',
    'Treasury bills, commercial paper and short-term bank deposits of three months or less are cash equivalents. Current investments are taken as marketable securities, that is cash equivalents, unless the question says otherwise.',
    'Cash ₹40,000 + bank ₹2,60,000 + marketable securities ₹1,00,000 = ₹4,00,000. A fixed deposit maturing after ten months is not included.',
    'Deducting bank overdraft from cash, or counting a deposit of more than three months. Bank overdraft is treated as a short-term borrowing. (AS 3 itself allows an overdraft repayable on demand to be counted in cash and cash equivalents; the CBSE syllabus treats it as a short-term borrowing, and so does this course.)'),
  card(4, 'cf-classify', 'rule', 'What are the three kinds of activity?',
    'Operating: the principal revenue-producing activities, and whatever is not investing or financing. Investing: buying and selling long-term assets and investments that are not cash equivalents, and the income from them. Financing: changes in share capital and borrowings, and the interest and dividend paid on them.',
    'Each cash flow of the year goes under exactly one of the three heads, and the three totals together give the net change in cash and cash equivalents.',
    'Cash from customers: operating. Machinery bought: investing. Shares issued for cash: financing.',
    'Putting an item under a head by where it appears in the Statement of Profit and Loss. Interest paid is an expense there, yet it is a financing outflow for a non-financing company.'),
  card(5, 'cf-classify', 'rule', 'Where do interest and dividend go, for a non-financing company and for a financing company?',
    'Non-financing company: interest and dividend received are investing inflows; interest paid and dividend paid are financing outflows. Financing company (its main business is lending or investing): interest paid, interest received and dividend received are operating items. Dividend paid is a financing outflow for every company.',
    'For a financing company, lending and borrowing money is the main revenue-producing activity, so the interest on both sides is operating. Dividend paid is always a payment to the providers of share capital.',
    'A cement company pays interest of ₹60,000 on debentures: financing outflow. A housing finance company pays interest of ₹60,000 on its borrowings: operating outflow.',
    'Showing dividend paid by a finance company under operating activities. Only interest changes its head; dividend paid never does.'),
  card(6, 'cf-classify', 'rule', 'Which transactions do not appear in the statement at all?',
    'Non-cash transactions (an asset bought by issue of shares or debentures, debentures converted into shares) and movements within cash and cash equivalents (cash deposited into bank, cash withdrawn from bank, purchase or sale of marketable securities that are cash equivalents).',
    'The statement explains the change in cash and cash equivalents. A transaction that leaves that total unchanged has nothing to explain.',
    'Machinery of ₹3,00,000 bought by issuing equity shares: no investing outflow and no financing inflow is shown.',
    'Showing both an outflow for the asset and an inflow for the shares. The two would cancel, but neither is a cash flow.'),
  card(7, 'cf-npbt', 'formula', 'How is net profit before tax and extraordinary items found from the balance sheets?',
    'Closing Surplus - Opening Surplus + transfer to reserves + proposed dividend of the previous year (paid this year) + interim dividend paid + provision for tax made during the year.',
    'The change in Surplus is what is left of the profit after tax, dividends and transfers. Adding these back gives the profit before tax, with which the indirect method begins. A fall in Surplus is taken as a minus figure.',
    'Surplus ₹2,00,000 to ₹3,20,000; transfer to General Reserve ₹50,000; previous year\'s proposed dividend ₹60,000; provision for tax made ₹90,000: 1,20,000 + 50,000 + 60,000 + 90,000 = ₹3,20,000.',
    'Starting from the closing balance of Surplus instead of the change in it, or forgetting the transfer to General Reserve.'),
  card(8, 'cf-npbt', 'rule', 'Which dividends are added back and shown as paid?',
    'The proposed dividend of the previous year, which is declared and paid in the current year, and any interim dividend paid in the current year. The dividend proposed for the current year is not accounted for until the shareholders declare it (AS 4).',
    'The same total is added back in finding net profit before tax and shown as an outflow under financing activities.',
    'Proposed dividend ₹80,000 for 2024-25 and ₹1,00,000 for 2025-26; interim dividend ₹30,000 paid in 2025-26. Dividend paid in 2025-26 = 80,000 + 30,000 = ₹1,10,000.',
    'Using the current year\'s proposed dividend, or adding the proposed dividends of both years.'),
  card(9, 'cf-adjustments', 'formula', 'How is operating profit before working capital changes found?',
    'Net profit before tax + depreciation + goodwill, patents and similar items written off + loss on sale of fixed assets or investments + interest paid on borrowings - profit on sale of fixed assets or investments - interest received - dividend received - rent received.',
    'Non-cash charges are added back because they used no cash. Items that belong to investing or financing are taken out of the profit and shown under their own head. (This is for a non-financing company.)',
    'Net profit before tax ₹4,00,000 + depreciation ₹50,000 + interest on debentures ₹30,000 - dividend received ₹20,000 = ₹4,60,000.',
    'Deducting depreciation or a loss on sale, which have already reduced the profit, or adding the profit on sale.'),
  card(10, 'cf-working-capital', 'rule', 'How does a change in a current asset or a current liability affect cash from operations?',
    'An increase in a current asset or a decrease in a current liability is deducted. A decrease in a current asset or an increase in a current liability is added. Left out: cash and bank, current investments that are cash equivalents, short-term borrowings (bank overdraft, cash credit) and provision for tax.',
    'More inventories or receivables means cash tied up. More payables means payment put off, so cash is saved.',
    'Operating profit before working capital changes ₹5,00,000; inventories up ₹40,000; trade payables up ₹25,000: 5,00,000 - 40,000 + 25,000 = ₹4,85,000 cash generated from operations.',
    'Adding every increase and deducting every decrease without asking whether the item is an asset or a liability.'),
  card(11, 'cf-working-capital', 'formula', 'How is the income tax paid found?',
    'Tax paid = Opening provision for tax + Provision made during the year - Closing provision for tax. With no other information: tax paid = opening provision, and provision made = closing provision.',
    'The provision made is added back in finding net profit before tax. The tax actually paid is deducted from cash generated from operations to give net cash from operating activities.',
    'Provision ₹60,000 at the start and ₹80,000 at the end; provision made ₹90,000: tax paid = 60,000 + 90,000 - 80,000 = ₹70,000.',
    'Deducting the provision made, or the closing provision, as if it were the tax paid.'),
  card(12, 'cf-working-capital', 'format', 'What is the order of the operating activities section under the indirect method?',
    'Net profit before tax and extraordinary items; add and deduct the non-cash and non-operating items = Operating profit before working capital changes; add and deduct the working capital changes = Cash generated from operations; less income tax paid = Net cash from (or used in) operating activities.',
    'Each sub-total has its own name, and the examiner looks for all three.',
    '₹4,00,000 + 80,000 - 20,000 = ₹4,60,000; - 30,000 + 10,000 = ₹4,40,000; less tax paid 70,000 = ₹3,70,000.',
    'Deducting tax before the working capital changes, or leaving out the line "Cash generated from operations".'),
  card(13, 'cf-investing', 'formula', 'How is the purchase of a fixed asset found when the asset is kept at cost?',
    'Purchases = Closing balance + Cost of the asset sold - Opening balance. Depreciation for the year = Closing accumulated depreciation + Accumulated depreciation on the asset sold - Opening accumulated depreciation.',
    'The asset account and the accumulated depreciation account are each written up, and the missing figure is the balancing figure.',
    'Machinery at cost ₹8,00,000 to ₹9,50,000; a machine costing ₹1,00,000 sold: purchases = 9,50,000 + 1,00,000 - 8,00,000 = ₹2,50,000.',
    'Taking the increase in the balance, ₹1,50,000, as the purchase and forgetting the machine that left the account.'),
  card(14, 'cf-investing', 'formula', 'How are the sale proceeds of a fixed asset found?',
    'Sale proceeds = Book value of the asset sold + Profit on sale, or - Loss on sale, where book value = cost - accumulated depreciation on it. When the asset is kept at written down value: Purchases = Closing balance + Depreciation + Book value of the asset sold - Opening balance.',
    'The whole sale proceeds are an investing inflow. The profit or loss is only an adjustment in the operating activities.',
    'Cost ₹1,00,000, accumulated depreciation ₹60,000, sold at a loss of ₹10,000: proceeds = 40,000 - 10,000 = ₹30,000.',
    'Showing the profit or loss on sale under investing activities instead of the sale proceeds.'),
  card(15, 'cf-investing', 'format', 'What goes under investing activities for a non-financing company?',
    'Outflows: purchase of fixed assets (tangible and intangible), purchase of non-current investments, loans given. Inflows: sale of fixed assets, sale of non-current investments, interest received, dividend received, rent received, repayment of loans given.',
    'When the outflows are larger, the total is "Net cash used in investing activities".',
    'Machinery bought ₹4,00,000; old machine sold ₹50,000; dividend received ₹20,000: net cash used = 4,00,000 - 50,000 - 20,000 = ₹3,30,000.',
    'Putting interest paid or dividend paid here. Those are financing outflows.'),
  card(16, 'cf-financing', 'format', 'What goes under financing activities?',
    'Inflows: proceeds from issue of shares (share capital and securities premium), proceeds from debentures and long-term loans, increase in bank overdraft or cash credit. Outflows: repayment of borrowings, decrease in bank overdraft or cash credit, interest paid, dividend paid.',
    'Only shares and debentures issued for cash count. Those issued for an asset, or on conversion, are non-cash.',
    'Share capital up ₹2,00,000 and securities premium up ₹40,000, all for cash: proceeds from issue of shares = ₹2,40,000.',
    'Leaving out the securities premium, or treating bank overdraft as a working capital item.'),
  card(17, 'cf-financing', 'rule', 'How are bank overdraft and cash credit treated?',
    'As short-term borrowings. An increase is an inflow and a decrease is an outflow under financing activities. They are not deducted from cash and cash equivalents and are not working capital changes.',
    'This is the treatment the CBSE syllabus lays down. AS 3 itself allows a bank overdraft that is repayable on demand and forms part of the cash management of the company to be counted in cash and cash equivalents; the CBSE note overrides that, so in this course an overdraft is always a short-term borrowing.',
    'Bank overdraft ₹50,000 at the start and ₹80,000 at the end: an inflow of ₹30,000 under financing activities.',
    'Adding the increase among the working capital changes as an increase in a current liability.'),
  card(18, 'cf-reconcile', 'formula', 'How does the statement end?',
    'Net cash from operating + investing + financing activities = Net increase (or decrease) in cash and cash equivalents. Add the cash and cash equivalents at the beginning of the year = Cash and cash equivalents at the end of the year.',
    'The closing figure must agree with cash, bank and cash equivalents in the closing balance sheet. That is the check on the whole statement.',
    'Operating + ₹3,00,000; investing - ₹4,00,000; financing + ₹1,50,000: net increase ₹50,000. Opening ₹70,000, so closing ₹1,20,000.',
    'Adding cash used in an activity instead of deducting it.'),
];

// ---------------------------------------------------------------------------------------------------------------
// Authored questions
// ---------------------------------------------------------------------------------------------------------------

const qid = (n: number): string => `cf-q-${String(n).padStart(3, '0')}`;

/**
 * The place of an Assertion-Reason option in the board's fixed order: (a) both true and R explains A, (b) both true
 * and R does not explain A, (c) A true and R false, (d) A false and R true. -1 for any other option.
 */
const arPlace = (text: string): number =>
  text.startsWith('Both A and R are true') ? (text.includes(' not ') ? 1 : 0) : text.startsWith('A is true') ? 2 : text.startsWith('A is false') ? 3 : -1;

/**
 * An mcq: the right option is put at a position that depends on n, so the answers are spread over a, b, c and d. The
 * options of an Assertion-Reason question stand in the board's order instead, whichever is right.
 */
function mcq(
  n: number,
  conceptId: string,
  difficulty: Difficulty,
  prompt: string,
  correct: string,
  wrong: [string, string][],
  explanation: string,
  hints: string[],
): McqQuestion {
  const pos = n % (wrong.length + 1);
  const all: { text: string; why?: string }[] = [...wrong.map(([text, why]) => ({ text, why }))];
  all.splice(pos, 0, { text: correct });
  if (all.length === 4 && all.every((o) => arPlace(o.text) >= 0)) all.sort((x, y) => arPlace(x.text) - arPlace(y.text));
  const options = all.map((o, i) => ({ id: 'abcdefgh'[i], text: o.text, ...(o.why === undefined ? {} : { why: o.why }) }));
  return {
    id: qid(n), topicId: T, conceptId, difficulty, type: 'mcq', prompt, options,
    correct: options.find((o) => o.text === correct)!.id, hints, explanation,
  };
}

const tf = (n: number, conceptId: string, difficulty: Difficulty, prompt: string, correct: boolean, explanation: string, hints: string[]): TrueFalseQuestion => ({
  id: qid(n), topicId: T, conceptId, difficulty, type: 'true_false', prompt, correct, hints, explanation,
});

const rs = (n: number): number => n * 100;

const num = (
  n: number,
  conceptId: string,
  difficulty: Difficulty,
  prompt: string,
  answer: number,
  errors: [number, string][],
  working: string[],
  hints: string[],
): NumericQuestion => ({
  id: qid(n), topicId: T, conceptId, difficulty, type: 'numeric', unit: 'rupees', prompt, answer: rs(answer),
  commonErrors: errors.map(([value, why]) => ({ value: rs(value), why })), working, hints, explanation: working.join(' '),
});

const AR = 'Which is correct?';
const AR_BOTH = 'Both A and R are true, and R is the correct explanation of A';
const AR_NOT = 'Both A and R are true, but R is not the correct explanation of A';
const AR_A = 'A is true but R is false';
const AR_R = 'A is false but R is true';

const questions: Question[] = [
  // ---- Meaning, objectives, cash and cash equivalents ----
  mcq(1, 'cf-meaning', 'easy', 'What does a Cash Flow Statement show?',
    'The inflows and outflows of cash and cash equivalents during a period, under operating, investing and financing activities',
    [
      ['The assets, liabilities and equity of the company on a particular date', 'Described the balance sheet, which shows a position on a date and not the flows of a period.'],
      ['The revenue earned and the expenses incurred during a period, on the accrual basis', 'Described the Statement of Profit and Loss, which measures profit and not cash.'],
      ['The changes in every current asset and current liability during a period', 'Took the working capital changes, which are one step inside the statement, for the whole statement.'],
    ],
    'The statement explains how cash and cash equivalents changed during the year, activity by activity.',
    ['Its name says what it follows.', 'Is it about a date or about a period?']),
  tf(2, 'cf-meaning', 'easy', 'A Cash Flow Statement records an income when it is earned, even if the money has not yet been received.', false,
    'That is the accrual basis of the Statement of Profit and Loss. A Cash Flow Statement shows only cash actually received and paid.',
    ['Which statement follows the accrual basis?', 'What must happen before something is a cash flow?']),
  mcq(3, 'cf-meaning', 'easy', 'Under which accounting standard is a Cash Flow Statement prepared?',
    'AS 3 (Revised)',
    [
      ['AS 4', 'Picked the standard on events after the balance sheet date, which only settles how a proposed dividend is treated.'],
      ['AS 26', 'Picked the standard on intangible assets, which deals with goodwill.'],
      ['AS 10', 'Picked the standard on property, plant and equipment.'],
    ],
    'AS 3 (Revised) lays down how cash flows are classified and presented.',
    ['It is one of the earliest standards by number.', 'AS 4 is used in this topic only for proposed dividend.']),
  mcq(4, 'cf-meaning', 'medium', 'Which of these is NOT something a Cash Flow Statement helps a reader to do?',
    'To find the profit earned by the company on the accrual basis',
    [
      ['To judge whether the company can pay its debts as they fall due', 'Liquidity is exactly what the cash flows show.'],
      ['To see why the profit of the year and the change in cash differ', 'The indirect method starts from profit and explains the difference step by step.'],
      ['To plan the cash needs of the coming months', 'Short-term financial planning is a main use of the statement.'],
    ],
    'Profit on the accrual basis comes from the Statement of Profit and Loss. The Cash Flow Statement shows cash, which is not the same as profit.',
    ['Three of the options are about cash.', 'Which statement measures profit?']),
  mcq(5, 'cf-meaning', 'medium', 'When is a short-term investment a cash equivalent?',
    'When it is highly liquid, can be turned into a known amount of cash, carries an insignificant risk of change in value and matures within three months of being bought',
    [
      ['When it is shown under current assets in the balance sheet', 'Took every current asset for a cash equivalent; inventories and receivables are current assets too.'],
      ['When it matures within twelve months of the balance sheet date', 'Used the twelve-month test for a current asset in place of the three-month test for a cash equivalent.'],
      ['When it earns interest or dividend for the company', 'Took the earning of income for the test; a long-term investment earns income too.'],
    ],
    'All four conditions matter: liquid, convertible into a known amount, little risk, and a maturity of three months or less from the date of acquisition.',
    ['Think of a treasury bill maturing in two months.', 'Twelve months is the test for something else.']),
  tf(6, 'cf-meaning', 'medium', 'A fixed deposit with a bank that matures six months after it is made is a cash equivalent.', false,
    'A cash equivalent matures within three months of being acquired. A six-month deposit is outside that limit.',
    ['What is the limit on the maturity of a cash equivalent?', 'Count the months from the date the deposit is made.']),
  mcq(7, 'cf-meaning', 'medium', 'Shakti Tools Ltd. earned a good profit this year, yet it is finding it hard to pay its suppliers on time. Which statement will best explain why?',
    'The Cash Flow Statement',
    [
      ['The Statement of Profit and Loss', 'It shows that a profit was earned, which is already known, and not where the cash went.'],
      ['The Notes to Accounts on share capital', 'They show the kinds of shares issued and say nothing about the use of cash.'],
      ['A common size Statement of Profit and Loss', 'It expresses each item as a percentage of revenue from operations and does not follow cash.'],
    ],
    'Profit and cash are different. The Cash Flow Statement shows where the cash went: into receivables, inventories, fixed assets or repayments.',
    ['The puzzle is about cash, not about profit.', 'Which statement follows cash received and paid?']),
  tf(8, 'cf-meaning', 'easy', 'A company can earn a profit in a year and still end the year with less cash than it began with.', true,
    'Profit is worked out on the accrual basis. Cash may have gone into credit sales not yet collected, new fixed assets, loan repayments or dividends.',
    ['Is a credit sale a profit? Is it cash?', 'Think of a year in which a big machine is bought.']),

  // ---- The three activities ----
  mcq(9, 'cf-classify', 'easy', 'What are operating activities?',
    'The principal revenue-producing activities of the company, and other activities that are not investing or financing',
    [
      ['The buying and selling of long-term assets and of investments that are not cash equivalents', 'Gave the meaning of investing activities.'],
      ['The activities that change the size and make-up of share capital and borrowings', 'Gave the meaning of financing activities.'],
      ['Every activity that is recorded in the Statement of Profit and Loss', 'Went by where an item is recorded; interest paid is in that statement but is a financing item for a non-financing company.'],
    ],
    'Operating activities are the main revenue-earning work of the company, and anything that does not fall under the other two heads.',
    ['What does the company exist to do?', 'The other two heads are defined first; the rest is operating.']),
  mcq(10, 'cf-classify', 'medium', `Assertion (A): A manufacturing company shows interest paid on its debentures under financing activities. Reason (R): Interest is the cost of obtaining finance. ${AR}`,
    AR_BOTH,
    [
      [AR_NOT, 'Missed that interest is a financing outflow precisely because it is the cost of the finance raised.'],
      [AR_A, 'Denied that interest is the cost of borrowed money.'],
      [AR_R, 'Took interest paid for an operating outflow, which it is only for a financing company.'],
    ],
    'For a non-financing company, interest on borrowings is the cost of finance, and that is why it is shown under financing activities.',
    ['Is a manufacturer a financing company?', 'Why is interest paid at all?']),
  mcq(11, 'cf-classify', 'medium', 'For a finance company, whose main business is lending money, the interest received on the loans it has given is shown under:',
    'Operating activities',
    [
      ['Investing activities', 'Used the rule for a non-financing company, for which interest received is a return on an investment.'],
      ['Financing activities', 'Mixed up interest received with interest paid on borrowings by a non-financing company.'],
      ['No head, because it is not a cash flow', 'Thought interest income is only a book entry; it is received in cash.'],
    ],
    'Lending is the principal revenue-producing activity of a finance company, so the interest it earns is an operating inflow.',
    ['What is the main business of this company?', 'Interest is to a finance company what sales are to a trader.']),
  tf(12, 'cf-classify', 'medium', 'Dividend paid is shown under financing activities by a financing company as well as by a non-financing company.', true,
    'Dividend is paid to the providers of share capital, whatever the business of the company. Only interest and dividend received, and interest paid, change their head for a financing company.',
    ['Who receives the dividend?', 'Which items change their head for a financing company?']),
  mcq(13, 'cf-classify', 'medium', 'Vasudha Agro Ltd. bought machinery of ₹6,00,000 and paid for it by issuing 9% debentures to the supplier. How is this shown in its Cash Flow Statement?',
    'It is not shown, because no cash flowed',
    [
      ['An outflow of ₹6,00,000 under investing activities only', 'Counted the machinery as bought for cash.'],
      ['An outflow of ₹6,00,000 under investing and an inflow of ₹6,00,000 under financing activities', 'Showed both sides of a non-cash transaction as if cash had come in and gone out.'],
      ['An inflow of ₹6,00,000 under financing activities only', 'Counted the debentures as issued for cash.'],
    ],
    'The machinery was paid for in debentures. Cash and cash equivalents did not change, so the transaction stays out of the statement.',
    ['Did any cash change hands?', 'The statement explains only the change in cash and cash equivalents.']),
  mcq(14, 'cf-classify', 'medium', 'Which pair are both investing activities for a company that is not a financing company?',
    'Purchase of goodwill and dividend received on shares held',
    [
      ['Purchase of machinery and interest paid on a bank loan', 'Interest paid on a loan is a financing outflow.'],
      ['Sale of investments and issue of debentures', 'An issue of debentures is a financing inflow.'],
      ['Sale of an old vehicle and payment of income tax', 'Income tax paid is an operating outflow.'],
    ],
    'Goodwill is an intangible fixed asset, and dividend received is a return on an investment: both are investing items.',
    ['Check the second item of each pair first.', 'Investing covers long-term assets, investments and the income from them.']),
  tf(15, 'cf-classify', 'easy', 'Cash withdrawn from the bank for office use is an operating outflow.', false,
    'Cash only moves from bank to cash in hand. Both are parts of cash and cash equivalents, so there is no cash flow at all.',
    ['Does the total of cash and cash equivalents change?', 'Bank and cash in hand are counted together.']),
  mcq(16, 'cf-classify', 'complex', 'Nandi Traders Ltd., a trading company, sold an old delivery van for ₹90,000. Its book value was ₹1,10,000. How does the sale enter the Cash Flow Statement prepared by the indirect method?',
    '₹90,000 as an inflow under investing activities, and the loss of ₹20,000 added back under operating activities',
    [
      ['₹1,10,000 as an inflow under investing activities', 'Showed the book value; the cash received is the sale price.'],
      ['₹20,000 as an outflow under investing activities', 'Showed the loss as if it were cash paid; the loss is only the gap between book value and price.'],
      ['₹90,000 as an inflow under operating activities', 'Took the sale of a fixed asset for a sale of goods.'],
    ],
    'The cash received, ₹90,000, is an investing inflow. The loss of ₹20,000 reduced the profit without using cash and belongs to investing, so it is added back to the profit.',
    ['How much cash came in?', 'The loss has already reduced the profit you start from.']),
  mcq(17, 'cf-classify', 'easy', 'Which of these is a financing activity for a company that is not a financing company?',
    'Repayment of a long-term loan',
    [
      ['A loan given to another company', 'Mixed up a loan given, which is an investing outflow, with a loan taken.'],
      ['Sale of non-current investments', 'The sale of an investment is an investing inflow.'],
      ['Payment to trade payables', 'Paying suppliers of goods is an operating outflow.'],
    ],
    'Financing activities change the borrowings and share capital of the company. Repaying a loan reduces its borrowings.',
    ['Which item changes what the company owes to its lenders?', 'A loan given and a loan taken are not the same thing.']),

  // ---- Net profit before tax ----
  mcq(18, 'cf-npbt', 'medium', 'Why is the provision for tax made during the year added to the profit when the indirect method begins?',
    'Because the profit of the year was arrived at after deducting it, and the statement starts from the profit before tax',
    [
      ['Because tax is never paid in cash', 'Tax is paid in cash; the tax paid is deducted later, after cash generated from operations.'],
      ['Because the provision for tax is an income of the company', 'Took a charge against profit for an income.'],
      ['Because the provision for tax is a working capital change', 'Provision for tax is kept out of the working capital changes and is dealt with on its own.'],
    ],
    'The provision reduced the profit. It is added back to reach the profit before tax, and the tax actually paid is deducted separately at the end of the operating activities.',
    ['Is the profit in the balance sheet before or after tax?', 'What is deducted later instead?']),
  mcq(19, 'cf-npbt', 'medium', `Assertion (A): The dividend proposed for the current year is not added back in finding net profit before tax. Reason (R): Under AS 4 a proposed dividend is not a liability until the shareholders declare it, so it has not been taken out of the Surplus. ${AR}`,
    AR_BOTH,
    [
      [AR_NOT, 'Missed that the dividend is not added back exactly because it was never deducted from the Surplus.'],
      [AR_A, 'Denied the rule of AS 4, under which a dividend proposed after the year end is only disclosed in the notes.'],
      [AR_R, 'Thought the current year\'s proposed dividend has to be added back; it is the previous year\'s, paid this year, that is added back.'],
    ],
    'The current year\'s proposed dividend has not reduced the Surplus, so there is nothing to add back. The previous year\'s proposed dividend was declared and paid this year, and that is added back.',
    ['Has the current year\'s proposed dividend been deducted from Surplus yet?', 'Which dividend was actually paid this year?']),
  tf(20, 'cf-npbt', 'medium', 'A transfer to General Reserve made during the year is added to the change in Surplus in finding net profit before tax.', true,
    'The transfer took profit out of the Surplus without using it up. Adding it back restores the profit that was earned.',
    ['Where did the amount in General Reserve come from?', 'Did the transfer reduce the profit earned, or only move it?']),
  num(21, 'cf-npbt', 'medium', 'The Surplus of Trishul Fabrics Ltd. fell from ₹2,00,000 on 31 March 2025 to ₹1,60,000 on 31 March 2026. During 2025-26 a provision for tax of ₹90,000 was made, and the dividend of ₹70,000 proposed for 2024-25 was declared and paid. The dividend proposed for 2025-26 is ₹80,000. Find the net profit before tax and extraordinary items for 2025-26.', 120000,
    [
      [200000, 'Took the fall in Surplus of ₹40,000 as if it were a rise.'],
      [130000, 'Added the dividend proposed for 2025-26, which is not yet declared, in place of the one paid.'],
      [50000, 'Did not add back the dividend paid out of the Surplus.'],
      [30000, 'Did not add back the provision for tax.'],
    ],
    ['Change in Surplus = ₹1,60,000 - ₹2,00,000 = a fall of ₹40,000.', 'Add: provision for tax ₹90,000 and the dividend of 2024-25 paid ₹70,000.', 'Net profit before tax = - ₹40,000 + ₹90,000 + ₹70,000 = ₹1,20,000.'],
    ['A fall in Surplus is a minus figure to start from.', 'Only the dividend that was declared and paid is added back.']),

  // ---- Adjustments ----
  mcq(22, 'cf-adjustments', 'easy', 'Why is depreciation added back to the net profit before tax under the indirect method?',
    'Because it reduced the profit without any cash going out',
    [
      ['Because it is cash received by the company during the year', 'Took depreciation for a source of cash; it is only a book entry.'],
      ['Because it is a financing expense', 'Mixed up depreciation with interest on borrowings.'],
      ['Because it is paid to the suppliers of machinery', 'Mixed up depreciation with the price paid for the asset, which is an investing outflow when it is bought.'],
    ],
    'Depreciation is a non-cash expense. Adding it back cancels a deduction that used no cash.',
    ['Does anyone receive money when depreciation is charged?', 'The cash went out when the asset was bought.']),
  mcq(23, 'cf-adjustments', 'medium', 'Which of these is deducted from net profit before tax in arriving at operating profit before working capital changes, for a company that is not a financing company?',
    'Dividend received on investments',
    [
      ['Depreciation on machinery', 'Depreciation is a non-cash expense and is added back.'],
      ['Loss on sale of furniture', 'A loss on sale has reduced the profit and is added back.'],
      ['Interest paid on debentures', 'Interest paid is a financing cost and is added back.'],
    ],
    'Dividend received is income of an investing activity. It is taken out of the profit here and shown under investing activities.',
    ['Three of these reduced the profit; one increased it.', 'What is added to profit must be an expense or a loss.']),
  tf(24, 'cf-adjustments', 'medium', 'For a non-financing company, interest received on investments is deducted from net profit before tax under operating activities and shown as an inflow under investing activities.', true,
    'The interest is inside the profit but belongs to investing, so it is taken out of operating activities and shown under its own head.',
    ['Under which head does a return on an investment belong?', 'An item cannot stay in two places.']),
  mcq(25, 'cf-adjustments', 'complex', `Assertion (A): A loss on sale of machinery is added back to net profit before tax under operating activities. Reason (R): A loss on sale of machinery is a payment of cash to the buyer. ${AR}`,
    AR_A,
    [
      [AR_BOTH, 'Took the loss for cash paid; it is only the amount by which the price fell short of the book value.'],
      [AR_NOT, 'Accepted that the loss is a payment of cash; no cash is paid, and the sale proceeds are an inflow.'],
      [AR_R, 'Thought the loss is deducted again; it has already reduced the profit, so it is added back.'],
    ],
    'The loss reduced the profit but no cash went out: the sale brought cash in, shown under investing activities. So A is true and R is false.',
    ['Which way did cash move when the machine was sold?', 'What is a loss on sale measured against?']),

  // ---- Working capital and tax ----
  mcq(26, 'cf-working-capital', 'easy', 'Trade payables rose during the year. In working out cash generated from operations, the increase is:',
    'Added, because payment has been put off and cash is saved',
    [
      ['Deducted, because more is owed to suppliers', 'Took a rise in a liability for cash paid; nothing has been paid on it yet.'],
      ['Ignored, because trade payables are not cash', 'Left an operating current liability out of the working capital changes.'],
      ['Shown under financing activities as a borrowing', 'Took trade credit for a borrowing; trade payables arise from buying goods.'],
    ],
    'An increase in a current liability means expenses or purchases not yet paid for, so cash is higher than the profit suggests.',
    ['Has the company paid these suppliers yet?', 'An unpaid bill leaves cash in the bank.']),
  mcq(27, 'cf-working-capital', 'medium', 'Which of these changes is NOT adjusted among the working capital changes?',
    'An increase in bank overdraft',
    [
      ['A decrease in inventories', 'Inventories are an operating current asset; a decrease is added.'],
      ['An increase in outstanding expenses', 'Outstanding expenses are an operating current liability; an increase is added.'],
      ['An increase in trade receivables', 'Trade receivables are an operating current asset; an increase is deducted.'],
    ],
    'Bank overdraft is a short-term borrowing. Its change is shown under financing activities.',
    ['Which item is a borrowing from a bank?', 'Three of these arise from buying and selling goods.']),
  num(28, 'cf-working-capital', 'medium', 'The operating profit before working capital changes of Girnar Plastics Ltd. is ₹4,00,000. During the year trade receivables increased by ₹30,000, inventories decreased by ₹20,000 and trade payables decreased by ₹10,000. Find the cash generated from operations.', 380000,
    [
      [420000, 'Took all three changes the wrong way round.'],
      [400000, 'Added the increase and deducted the two decreases, without asking whether each item is an asset or a liability.'],
      [340000, 'Deducted all three changes.'],
    ],
    ['Trade receivables up: deduct ₹30,000. Inventories down: add ₹20,000. Trade payables down: deduct ₹10,000.', '₹4,00,000 - ₹30,000 + ₹20,000 - ₹10,000 = ₹3,80,000.'],
    ['Decide for each item: asset or liability, up or down.', 'A fall in a liability means it was paid.']),
  tf(29, 'cf-working-capital', 'medium', 'When nothing more is known about tax, the provision for tax of the previous year is taken as paid during the current year.', true,
    'With no other information the opening provision is taken as the tax paid, and the closing provision as the provision made during the current year.',
    ['Which provision relates to a year that is over?', 'The closing provision is for the current year\'s profit.']),
  mcq(30, 'cf-working-capital', 'medium', 'Provision for tax was ₹50,000 on 31 March 2025 and ₹70,000 on 31 March 2026. Tax of ₹45,000 was paid during 2025-26. How much provision for tax was made during the year?',
    '₹65,000',
    [
      ['₹45,000', 'Took the tax paid for the provision made.'],
      ['₹70,000', 'Took the closing provision as the provision made, which holds only when nothing else is known.'],
      ['₹25,000', 'Put the opening and closing balances the wrong way round: 50,000 + 45,000 - 70,000.'],
      ['₹20,000', 'Took the change in the provision and left out the tax paid.'],
    ],
    'Opening ₹50,000 + provision made - tax paid ₹45,000 = closing ₹70,000, so the provision made is ₹65,000.',
    ['Write up the Provision for tax account.', 'Opening + made - paid = closing.']),

  // ---- Investing ----
  num(31, 'cf-investing', 'medium', 'Machinery of Kalinga Castings Ltd., kept at cost, stood at ₹5,00,000 on 31 March 2025 and ₹6,50,000 on 31 March 2026. During the year a machine that had cost ₹80,000 was sold. Find the machinery purchased during the year.', 230000,
    [
      [150000, 'Took the increase in the balance as the purchase; the cost of the machine sold had left the account.'],
      [70000, 'Deducted the cost of the machine sold instead of adding it back.'],
    ],
    ['Machinery account at cost: opening + purchases - cost of machine sold = closing.', 'Purchases = ₹6,50,000 + ₹80,000 - ₹5,00,000 = ₹2,30,000.'],
    ['The machine sold took ₹80,000 out of the account.', 'The purchase is the balancing figure.']),
  num(32, 'cf-investing', 'medium', 'A machine that cost ₹1,00,000, on which depreciation of ₹60,000 had accumulated, was sold at a loss of ₹10,000. What sale proceeds are shown under investing activities?', 30000,
    [
      [50000, 'Added the loss to the book value; a loss means the price was below the book value.'],
      [90000, 'Deducted the loss from the original cost and ignored the accumulated depreciation.'],
      [40000, 'Gave the book value; the loss has still to be deducted.'],
    ],
    ['Book value = ₹1,00,000 - ₹60,000 = ₹40,000.', 'Sale proceeds = ₹40,000 - loss ₹10,000 = ₹30,000.'],
    ['Find the book value first.', 'A loss means it fetched less than the book value.']),
  tf(33, 'cf-investing', 'easy', 'It is the sale proceeds of a machine, and not the profit on its sale, that are shown under investing activities.', true,
    'The whole amount received is the cash inflow. The profit is only an adjustment to the net profit under operating activities.',
    ['How much cash came in?', 'Where is the profit on sale dealt with?']),

  // ---- Financing ----
  mcq(34, 'cf-financing', 'medium', 'Under the CBSE treatment, bank overdraft and cash credit are treated in a Cash Flow Statement as:',
    'Short-term borrowings, whose change is shown under financing activities',
    [
      ['Negative bank balances, deducted from cash and cash equivalents', 'Set the overdraft off against cash; the syllabus treats it as a borrowing.'],
      ['Current liabilities, adjusted among the working capital changes', 'Took a borrowing from a bank for an operating liability such as trade payables.'],
      ['Long-term loans, shown under investing activities', 'Borrowing is a financing activity, and an overdraft is short-term.'],
    ],
    'They are short-term borrowings: an increase is a financing inflow and a decrease a financing outflow.',
    ['Is money drawn on an overdraft borrowed money?', 'Which head covers borrowings?']),
  mcq(35, 'cf-financing', 'medium', 'Sarayu Foods Ltd. issued equity shares with a face value of ₹5,00,000 at a premium of 20%, all for cash. What inflow is shown under financing activities?',
    '₹6,00,000',
    [
      ['₹5,00,000', 'Left out the securities premium, which is also received in cash.'],
      ['₹1,00,000', 'Showed only the securities premium.'],
      ['₹4,00,000', 'Deducted the premium, as if the shares had been issued at a discount.'],
    ],
    'Face value ₹5,00,000 + securities premium ₹1,00,000 (20%) = ₹6,00,000 received in cash.',
    ['How much does the company receive in all?', 'The premium is paid over and above the face value.']),
  tf(36, 'cf-financing', 'medium', 'An interim dividend paid during the year is added back in finding net profit before tax and is shown as an outflow under financing activities.', true,
    'It was paid out of the profit of the year, so it is added back, and the payment itself goes to shareholders: a financing outflow.',
    ['Was the interim dividend paid in cash this year?', 'Who received it?']),
  mcq(37, 'cf-financing', 'medium', 'The notes of Dhruva Motors Ltd. show a proposed dividend of ₹80,000 for 2024-25 and ₹1,00,000 for 2025-26. No interim dividend was paid. What dividend is shown as paid in the Cash Flow Statement for 2025-26?',
    '₹80,000',
    [
      ['₹1,00,000', 'Took the dividend proposed for 2025-26, which the shareholders have not yet declared.'],
      ['₹1,80,000', 'Added the proposed dividends of both years.'],
      ['₹20,000', 'Took the difference between the two proposed dividends.'],
    ],
    'The dividend proposed for 2024-25 is declared and paid in 2025-26. The dividend proposed for 2025-26 will be paid in 2026-27.',
    ['Which dividend has been declared by the shareholders?', 'A dividend proposed for a year is paid in the next year.']),

  // ---- Reconciliation ----
  mcq(38, 'cf-reconcile', 'easy', 'How is the closing balance of cash and cash equivalents reached in the statement?',
    'Opening cash and cash equivalents plus the net increase, or minus the net decrease, of the year',
    [
      ['Net cash from operating activities minus income tax paid', 'That gives net cash from operating activities, one part of the statement.'],
      ['The total of the inflows of the three activities', 'Left out the outflows and the opening balance.'],
      ['Closing current assets minus closing current liabilities', 'That is working capital, not cash and cash equivalents.'],
    ],
    'The three activities together give the net change, which is applied to the opening balance to reach the closing balance.',
    ['What does the statement explain?', 'Start from the cash at the beginning of the year.']),
  num(39, 'cf-reconcile', 'easy', 'A Cash Flow Statement shows net cash from operating activities of ₹3,00,000, net cash used in investing activities of ₹4,50,000 and net cash from financing activities of ₹1,00,000. Cash and cash equivalents at the beginning of the year were ₹1,20,000. Find the cash and cash equivalents at the end of the year.', 70000,
    [
      [170000, 'Added the net decrease of ₹50,000 to the opening balance instead of deducting it.'],
      [970000, 'Added all three figures to the opening balance; cash used in an activity is deducted.'],
      [50000, 'Gave the net change of the year without the opening balance.'],
    ],
    ['Net change = ₹3,00,000 - ₹4,50,000 + ₹1,00,000 = a net decrease of ₹50,000.', 'Closing balance = ₹1,20,000 - ₹50,000 = ₹70,000.'],
    ['Cash "used in" an activity is an outflow.', 'Apply the net change to the opening balance.']),
  tf(40, 'cf-reconcile', 'easy', 'The closing cash and cash equivalents in a Cash Flow Statement must agree with cash, bank and cash equivalents in the closing balance sheet.', true,
    'The statement explains the change between the two balance sheet figures, so its closing figure is the balance sheet figure. This is the check on the statement.',
    ['Where do the opening and closing figures come from?', 'What is the statement explaining?']),
];

// ---------------------------------------------------------------------------------------------------------------
// Levels
// ---------------------------------------------------------------------------------------------------------------

const levels = buildLadder(T, {
  concept: {
    title: 'Where Did the Cash Go?',
    description: 'See why profit is not cash, what counts as cash, and how the indirect method walks from profit back to cash.',
    lesson: [
      {
        type: 'text',
        heading: 'Profit is not cash',
        body: 'A company can report a profit of ₹5,00,000 and still be short of money to pay salaries. Profit is worked out on the accrual basis: a credit sale counts as income before a rupee is collected, and depreciation counts as an expense though nothing is paid. Meanwhile cash goes out on things that are not expenses at all, such as a new machine or the repayment of a loan. A Cash Flow Statement, prepared under AS 3 (Revised), shows where cash came from and where it went during the year. It helps a reader to judge liquidity, to plan for the short term and to see why profit and cash differ.',
      },
      {
        type: 'text',
        heading: 'What counts as cash',
        body: 'The statement follows cash and cash equivalents: cash in hand, balances with banks, and short-term, highly liquid investments that can be turned into a known amount of cash and mature within three months of being bought, such as treasury bills. Current investments are taken as marketable securities, and so as cash equivalents, unless a question says otherwise. Moving money within this group (depositing cash into the bank) is not a cash flow. Bank overdraft is not deducted from cash: it is treated as a short-term borrowing.',
      },
      {
        type: 'text',
        heading: 'Three kinds of activity',
        body: 'Every cash flow is put under one of three heads. Operating activities are the main revenue-earning work: cash from customers, cash paid to suppliers and employees, income tax paid. Investing activities are the buying and selling of long-term assets and investments, with the interest, dividend and rent they bring in. Financing activities are the raising and repaying of share capital and borrowings, with the interest and dividend paid on them. A financing company, whose business is lending money, is different: its interest paid and its interest and dividend received are operating items. Dividend paid is a financing outflow for every company. A transaction with no cash in it, such as machinery bought by issuing shares, is left out altogether.',
      },
      {
        type: 'text',
        heading: 'The indirect method: from profit back to cash',
        body: 'Step 1: find the net profit before tax. Take the change in Surplus and add back what was taken out of the profit: the provision for tax made, the previous year\'s proposed dividend (paid this year), any interim dividend and any transfer to reserves. Step 2: add back expenses that used no cash or belong elsewhere (depreciation, goodwill written off, loss on sale, interest paid) and deduct incomes that belong to investing (profit on sale, and interest, dividend and rent received). This gives operating profit before working capital changes. Step 3: adjust the working capital changes. An increase in a current asset or a decrease in a current liability uses cash; the opposite releases it. This gives cash generated from operations. Step 4: deduct the income tax actually paid. Then come the investing and the financing flows, read from the asset, loan and share capital accounts.',
      },
      {
        type: 'text',
        heading: 'Worked example',
        body: 'The Surplus of a company rose by ₹1,20,000 during the year, after a provision for tax of ₹60,000 and after paying the proposed dividend of the previous year, ₹80,000. Net profit before tax is 1,20,000 + 60,000 + 80,000 = ₹2,60,000. Add depreciation ₹40,000 and deduct interest received ₹10,000: operating profit before working capital changes is ₹2,90,000. Trade receivables rose by ₹30,000 (deduct) and trade payables rose by ₹20,000 (add): cash generated from operations is ₹2,80,000. Tax paid was ₹50,000, so net cash from operating activities is ₹2,30,000. The company bought machinery for ₹1,60,000 and received the interest of ₹10,000: net cash used in investing activities is ₹1,50,000. It issued shares for ₹1,00,000 and paid a dividend of ₹80,000: net cash from financing activities is ₹20,000. Net increase in cash = 2,30,000 - 1,50,000 + 20,000 = ₹1,00,000. Cash and cash equivalents were ₹50,000 at the start, so they are ₹1,50,000 at the end, which is the figure in the closing balance sheet.',
      },
      {
        type: 'working',
        title: 'Example 1. Net profit before tax from the Surplus: Vindhya Cements Ltd., a cement manufacturer',
        lines: [
          'Surplus (balance in the Statement of Profit and Loss) was ₹2,40,000 on 31 March 2025 and ₹3,60,000 on 31 March 2026: it rose by ₹1,20,000. That is what was left of the profit after tax, dividend and transfers.',
          'During the year ₹50,000 was transferred to General Reserve: it came out of the profit, so it is added back.',
          'The dividend proposed for 2024-25, ₹1,20,000, was declared and paid in 2025-26: it too came out of the Surplus, so it is added back.',
          'Provision for tax was ₹90,000 at the start and ₹1,10,000 at the end, and tax of ₹90,000 was paid. Provision for tax account: 90,000 + provision made - 90,000 paid = 1,10,000, so the provision made is ₹1,10,000. Add it back.',
          'Net profit before tax = 1,20,000 + 50,000 + 1,20,000 + 1,10,000 = ₹4,00,000.',
        ],
        note: 'Watch out: the dividend proposed for 2025-26 (say ₹1,50,000) is not added back; under AS 4 it is not accounted for until the shareholders declare it. And always start from the change in Surplus, never from its closing balance.',
      },
      {
        type: 'table',
        title: 'Example 2. The working accounts of the same company: Accumulated Depreciation A/c',
        rows: [
          { label: 'Data: machinery at cost ₹12,00,000 and ₹15,00,000; accumulated depreciation ₹3,00,000 and ₹3,60,000. A machine that had cost ₹1,50,000, with ₹90,000 of depreciation on it, was sold for ₹50,000.' },
          { label: 'Debit side' },
          { label: 'To Machinery A/c (depreciation on the machine sold)', amount: '₹90,000' },
          { label: 'To Balance c/d', amount: '₹3,60,000' },
          { label: 'Total', amount: '₹4,50,000', total: true },
          { label: 'Credit side' },
          { label: 'By Balance b/d', amount: '₹3,00,000' },
          { label: 'By Statement of Profit and Loss (depreciation for the year: the balancing figure)', amount: '₹1,50,000' },
          { label: 'Total', amount: '₹4,50,000', total: true },
        ],
        note: 'Depreciation of the year = 3,60,000 + 90,000 - 3,00,000 = ₹1,50,000, not the rise of ₹60,000 in the balance.',
      },
      {
        type: 'table',
        title: 'Example 2 (continued). Machinery A/c, kept at cost',
        rows: [
          { label: 'Debit side' },
          { label: 'To Balance b/d', amount: '₹12,00,000' },
          { label: 'To Bank A/c (machinery bought: the balancing figure)', amount: '₹4,50,000' },
          { label: 'Total', amount: '₹16,50,000', total: true },
          { label: 'Credit side' },
          { label: 'By Accumulated Depreciation A/c', amount: '₹90,000' },
          { label: 'By Bank A/c (sale)', amount: '₹50,000' },
          { label: 'By Statement of Profit and Loss (loss on sale: book value ₹60,000 less price ₹50,000)', amount: '₹10,000' },
          { label: 'By Balance c/d', amount: '₹15,00,000' },
          { label: 'Total', amount: '₹16,50,000', total: true },
        ],
        note: 'The statement takes four figures from these accounts: depreciation ₹1,50,000 and the loss ₹10,000 are added back under operating activities; machinery bought, ₹4,50,000, is an investing outflow and the sale price, ₹50,000, an investing inflow. Watch out: the rise in machinery, ₹3,00,000, is not the purchase, because a machine of ₹1,50,000 left the account.',
      },
      {
        type: 'working',
        title: 'Example 3. Two items boards like to set: Deccan Tools Ltd., a maker of hand tools',
        lines: [
          'Interest outstanding. Interest on its 10% Debentures of ₹6,00,000 for the year is ₹60,000. Interest accrued and due on them, shown under other current liabilities, was ₹10,000 on 31 March 2025 and ₹25,000 on 31 March 2026.',
          'Interest paid = interest of the year + opening outstanding - closing outstanding = 60,000 + 10,000 - 25,000 = ₹45,000. Under operating activities the charge, ₹60,000, is added back; under financing activities the payment, ₹45,000, is shown as an outflow.',
          'Current maturities. Long-term borrowings (term loans) were ₹8,00,000 at both dates, and the current maturities of those loans, shown under short-term borrowings, rose from ₹2,00,000 to ₹3,00,000. A new term loan of ₹3,00,000 was taken during the year.',
          'The current maturities are still a part of the loans, so add the two places together: ₹10,00,000 at the start and ₹11,00,000 at the end.',
          'Loans repaid = 10,00,000 + new loan 3,00,000 - 11,00,000 = ₹2,00,000. Financing activities show the new loan, ₹3,00,000, as an inflow and the repayment, ₹2,00,000, as an outflow.',
        ],
        note: 'Watch out: long-term borrowings alone did not move at all, and the rise in current maturities is not a working capital change. Debentures redeemed are read the same way: the fall in the debentures is an outflow, and interest on them runs only up to the date of redemption.',
      },
      {
        type: 'table',
        title: 'Example 4. The whole statement: Cash Flow Statement of Vindhya Cements Ltd. for the year ended 31 March 2026',
        rows: [
          { label: 'A. Cash flows from operating activities' },
          { label: 'Net profit before tax and extraordinary items (Example 1)', amount: '₹4,00,000' },
          { label: 'Add: Depreciation on machinery (Example 2)', amount: '1,50,000' },
          { label: 'Add: Loss on sale of machinery', amount: '10,000' },
          { label: 'Add: Interest on debentures', amount: '44,000' },
          { label: 'Less: Dividend received', amount: '(20,000)' },
          { label: 'Operating profit before working capital changes', amount: '₹5,84,000', total: true },
          { label: 'Less: Increase in inventories', amount: '(60,000)' },
          { label: 'Add: Decrease in trade receivables', amount: '25,000' },
          { label: 'Add: Increase in trade payables', amount: '45,000' },
          { label: 'Cash generated from operations', amount: '₹5,94,000', total: true },
          { label: 'Less: Income tax paid', amount: '(90,000)' },
          { label: 'Net cash from operating activities', amount: '₹5,04,000', total: true },
          { label: 'B. Cash flows from investing activities' },
          { label: 'Purchase of machinery', amount: '(4,50,000)' },
          { label: 'Sale of machinery', amount: '50,000' },
          { label: 'Dividend received', amount: '20,000' },
          { label: 'Net cash used in investing activities', amount: '(3,80,000)', total: true },
          { label: 'C. Cash flows from financing activities' },
          { label: 'Proceeds from issue of equity shares (₹2,00,000 at a premium of 20%)', amount: '2,40,000' },
          { label: 'Redemption of 8% debentures', amount: '(1,00,000)' },
          { label: 'Interest paid on debentures', amount: '(44,000)' },
          { label: 'Dividend paid', amount: '(1,20,000)' },
          { label: 'Net cash used in financing activities', amount: '(24,000)', total: true },
          { label: 'Net increase in cash and cash equivalents (A + B + C)', amount: '₹1,00,000', total: true },
          { label: 'Add: Cash and cash equivalents at the beginning of the year', amount: '₹1,30,000' },
          { label: 'Cash and cash equivalents at the end of the year', amount: '₹2,30,000', total: true },
        ],
        note: 'The 8% Debentures of ₹6,00,000 were reduced by ₹1,00,000 redeemed at par on 30 September 2025, so interest = 8% of ₹5,00,000 for the year + 8% of ₹1,00,000 for six months = 40,000 + 4,000 = ₹44,000, all of it paid. Watch out: dividend received is taken out of the profit in A and shown again in B, and the closing figure, ₹2,30,000, must agree with the cash and cash equivalents of the closing balance sheet.',
      },
      { type: 'check', questionId: qid(8) },
      { type: 'check', questionId: qid(39) },
    ],
  },
  cards: {
    title: 'Cash Flow Rules and Formats',
    description: 'Recall what counts as cash, the three heads, the steps of the indirect method and the account formulas.',
    cardIds: cards.map((c) => c.id),
  },
  recognition: [
    {
      title: 'What the Statement Is, and What Counts as Cash',
      description: 'The meaning, objectives and benefits of the statement, and cash and cash equivalents.',
      questionIds: [1, 2, 3, 4, 5, 6, 7, 8, 38, 40].map(qid),
    },
    {
      title: 'Operating, Investing or Financing?',
      description: 'Put each kind of item under its head, for a non-financing company and for a financing company.',
      questionIds: [9, 10, 11, 12, 13, 14, 15, 16, 17].map(qid),
    },
    {
      title: 'From Profit to Cash from Operations',
      description: 'Net profit before tax, the items added back and deducted, working capital changes and tax.',
      questionIds: [18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30].map(qid),
    },
    {
      title: 'Investing, Financing and the Closing Cash',
      description: 'Purchases and sale proceeds from the asset account, shares, overdraft, dividend and the closing balance.',
      questionIds: [31, 32, 33, 34, 35, 36, 37, 39].map(qid),
    },
  ],
  practice: [
    {
      title: 'Cash, Cash Equivalents and the Three Activities',
      description: 'Classify items, spot what is not a cash flow, total cash and cash equivalents and reach the closing cash.',
      templateIds: ['cf-classify-activity', 'cf-cash-equivalent', 'cf-cash-equivalents-total', 'cf-non-cash-effect', 'cf-net-change-direction', 'cf-closing-cash'],
      count: 8,
    },
    {
      title: 'First Steps of the Indirect Method',
      description: 'Net profit before tax, items added back and deducted, working capital changes and tax paid, one step at a time.',
      templateIds: ['cf-npbt-simple', 'cf-adjust-direction', 'cf-op-profit-simple', 'cf-wc-direction', 'cf-cash-from-ops-simple', 'cf-tax-paid'],
      count: 8,
    },
    {
      title: 'Simple Investing and Financing Flows',
      description: 'A purchase from the asset account, proceeds of shares, a loan raised or repaid, and dividend paid.',
      templateIds: ['cf-machinery-purchase-simple', 'cf-shares-proceeds', 'cf-loan-flow', 'cf-dividend-paid'],
      count: 6,
    },
    {
      title: 'Profit Before Tax, Then Operating Profit (Guided)',
      description: 'Add back tax, dividends and transfers to reach net profit before tax; then adjust five items, one of which needs no adjustment.',
      templateIds: ['cf-npbt-full', 'cf-op-profit-full'],
      count: 6,
      guided: true,
    },
    {
      title: 'Working Capital, Tax and the Kind of Company',
      description: 'Cash generated from operations from balances, net cash after tax, and interest and dividend for financing and non-financing companies.',
      templateIds: ['cf-cash-from-ops-full', 'cf-operating-after-tax', 'cf-classify-by-company', 'cf-interest-dividend-heads'],
      count: 8,
    },
    {
      title: 'Investing Activities from the Accounts',
      description: 'Purchases as the balancing figure, sale proceeds, depreciation of the year, investments and the net cash used.',
      templateIds: ['cf-asset-purchase-cost', 'cf-sale-proceeds', 'cf-dep-charged', 'cf-investments-flow', 'cf-investing-net'],
      count: 8,
    },
    {
      title: 'Financing Activities and the Reconciliation',
      description: 'Shares issued for cash and otherwise, bank overdraft, interest paid, net cash from financing and a missing activity.',
      templateIds: ['cf-financing-net', 'cf-shares-non-cash', 'cf-overdraft-treatment', 'cf-interest-paid', 'cf-missing-activity'],
      count: 8,
    },
    {
      title: 'Board-Standard Cash Flow Problems',
      description: 'A fixed asset account with a sale part-way, the whole operating section, and the investing and financing sections from balances.',
      templateIds: [
        'cf-fixed-asset-account', 'cf-fixed-asset-wdv', 'cf-operating-section', 'cf-op-profit-indirect', 'cf-financing-full', 'cf-investing-full',
        'cf-npbt-indirect', 'cf-closing-cash-full',
      ],
      count: 8,
    },
  ],
  mixed: { title: 'Mixed Cash Flow Practice', description: 'Everything in this topic, shuffled the way an examination serves it.', count: 12 },
  challenge: { title: 'Challenge: Cash Flow Mastery', description: 'The hardest questions in the topic, against the clock.', count: 8, timerSecondsPerQuestion: 180 },
  // Statements and accounts the student prepares: the workings first, then each section, then the whole statement.
  formats: [
    {
      title: 'Prepare the Workings',
      description: 'The working of net profit before tax and extraordinary items, the note of cash and cash equivalents at the two dates, and the two working accounts: Machinery A/c at cost and Accumulated Depreciation A/c, each with its balancing figure.',
      templateIds: ['cf-fmt-npbt', 'cf-fmt-cash-equivalents', 'cf-fmt-machinery-account', 'cf-fmt-accumulated-depreciation'],
      // Four, so that every working is met on each visit.
      count: 4,
    },
    {
      title: 'Prepare a Section of the Statement',
      description: 'Cash flow from operating activities by the indirect method from an extract, then from investing activities and from financing activities, each from the balances at the two dates and additional information.',
      templateIds: ['cf-fmt-operating', 'cf-fmt-investing', 'cf-fmt-financing'],
      count: 2,
    },
    {
      title: 'Prepare the Cash Flow Statement',
      description: 'The whole statement from two balance sheets and additional information: the three sections with their sub-totals, the net increase or decrease, and the opening and closing cash and cash equivalents, which must agree with the balance sheets.',
      templateIds: ['cf-fmt-statement'],
      count: 2,
    },
    // Added later (each formats level has an id of its own, so nothing before moves): the board items of the financing
    // section, and whole statements from balance sheets with notes to accounts.
    {
      title: 'Financing Activities: Board Items',
      description: 'Cash Flow from Financing Activities with debentures redeemed during the year, interest accrued on debentures, term loans with their current maturities, a new loan, shares and the dividend.',
      templateIds: ['cf-fmt-financing-board'],
      count: 2,
    },
    {
      title: 'The Whole Statement, Board Patterns',
      description: 'Four whole statements: balance sheets with notes to accounts, debentures redeemed and interest accrued; goodwill bought and current investments that are not cash equivalents; a year with a loss; and the statement from two plain balance sheets.',
      templateIds: ['cf-fmt-statement-notes', 'cf-fmt-statement-investments', 'cf-fmt-statement-loss', 'cf-fmt-statement'],
      count: 4,
    },
  ],
});

const pack: TopicPack = {
  topicId: T,
  concepts,
  cards,
  levels: [
    ...levels,
    ...laterLevels(T, levels, [
      {
        name: 'board-items',
        type: 'complex_practice',
        title: 'Debentures Redeemed, Interest Accrued, Current Maturities',
        description: 'The financing items boards set: cash paid on debentures redeemed during the year, interest paid when some is accrued at the year ends, term loans repaid when part of them is shown as current maturities, and the whole financing section with all of them.',
        generate: { templateIds: ['cf-fin-debentures-redeemed', 'cf-interest-paid-outstanding', 'cf-loan-current-maturities', 'cf-financing-board'], count: 8 },
      },
      {
        name: 'assertion-reason',
        type: 'medium_practice',
        title: 'Assertion and Reason',
        description: 'The one-mark question of the board: judge the Assertion, judge the Reason, and say whether the Reason explains the Assertion.',
        generate: { templateIds: ['cf-assertion-reason'], count: 6 },
      },
    ]),
  ],
  questions,
};

export default pack;
