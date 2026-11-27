import { creditor, debtor } from '@/engine/accounts';
import { formatINR } from '@/engine/money';
import { createRng, type Rng } from '@/engine/rng';
import { possessive } from '../accounts';
import type { ErrorClass, MistakeCase, MistakeScenario } from '../scenes';
import type { JournalLine, Paise } from '../types';
import { cr, dr, r } from './build';

// ---------------------------------------------------------------------------------------------------------------
// Mistake mode: a transaction recorded wrongly, as a Class 11 student meets errors. The classes are those of the
// Rectification of Errors topic (CBSE, NCERT): an error of omission leaves a transaction out, wholly or partly; an
// error of commission is a slip in recording, posting or totalling (a wrong amount, a wrong account, a wrong side,
// a wrong book); an error of principle breaks a rule of accounting (capital treated as revenue, a personal item as a
// business one). Apart from its class, an error is one-sided or two-sided by its effect: a one-sided error leaves one
// account wrong, so the trial balance does not agree and the difference goes to Suspense A/c until the error is
// found; a two-sided error (or a transaction left out wholly) leaves the debits equal to the credits, and is rectified
// between the accounts concerned, with no Suspense A/c. Each case says what happened, how it was recorded, what went
// wrong (a question with four choices) and the rectifying entry with its narration.
// ---------------------------------------------------------------------------------------------------------------

const f = formatINR;
const PEOPLE = ['Mohan', 'Kiran', 'Sharma Bros', 'Anita Traders', 'Rao & Co.', 'Lakshmi Stores'];

/** A name at the end of a sentence: "Rao & Co." takes no second full stop. */
const end = (name: string): string => (name.endsWith('.') ? name : `${name}.`);

interface Option {
  text: string;
  why?: string;
}

type Parts = {
  happened: string;
  recorded: string;
  right: JournalLine[];
  wrong: JournalLine[];
  correction: JournalLine[];
  narration: string;
  setup?: JournalLine[];
  explanation: string[];
};

/** The case, with its four choices put in an order drawn from the seed. The first option given is the right one. */
function build(rng: Rng, id: string, scenarioId: string, errorClass: ErrorClass, oneSided: boolean, parts: Parts, options: [Option, Option, Option, Option]): MistakeCase {
  const order = rng.shuffle([0, 1, 2, 3]);
  const ids = ['a', 'b', 'c', 'd'];
  return {
    id,
    scenarioId,
    errorClass,
    oneSided,
    ...parts,
    question: 'What went wrong in recording it?',
    options: order.map((k, i) => ({ id: ids[i], text: options[k].text, ...(k === 0 ? {} : { why: options[k].why }) })),
    correct: ids[order.indexOf(0)],
  };
}

/** An amount in round thousands between the two, from the seed. */
const thousands = (rng: Rng, min: number, max: number): Paise => r(rng.int(min, max) * 1000);

const scenario = (id: string, title: string, errorClass: ErrorClass, oneSided: boolean, make: (rng: Rng, caseId: string) => MistakeCase): MistakeScenario => ({
  id,
  title,
  errorClass,
  oneSided,
  make: (seed) => make(createRng(seed * 7919 + id.length), `x.${id}.${seed}`),
});

export const EQUATION_MISTAKES: MistakeScenario[] = [
  scenario('omitted-purchase', 'A purchase left out', 'omission', false, (rng, id) => {
    const x = thousands(rng, 8, 30);
    const who = rng.pick(['Sharma Bros', 'Rao & Co.', 'Kiran']);
    const lines = [dr('furniture', x), cr(creditor(who), x)];
    return build(
      rng,
      id,
      'omitted-purchase',
      'omission',
      false,
      {
        happened: `Bought furniture for ${f(x)} on credit from ${end(who)}`,
        recorded: 'The transaction was not recorded in the books at all.',
        right: lines,
        wrong: [],
        correction: lines,
        narration: `credit purchase of furniture from ${who}, left out of the books, now recorded`,
        explanation: [
          `Nothing was recorded, so the furniture and the ${f(x)} owed to ${who} are both missing from the books. Neither side was posted, so the trial balance still agrees: a complete omission does not show in it.`,
          `It is put right by passing the entry that was left out: Furniture A/c Dr ${f(x)}, To ${who} ${f(x)}. No Suspense A/c is used.`,
        ],
      },
      [
        { text: 'Error of omission: the transaction was left out completely, so the trial balance still agrees.' },
        { text: 'Error of commission: it was recorded with a wrong amount.', why: 'Nothing was recorded at all, so there is no amount to be wrong.' },
        { text: 'Error of principle: the furniture was treated as an expense.', why: 'Nothing was recorded, so the furniture was not treated as anything.' },
        { text: 'Error of omission (partial): only one side was posted, so the trial balance does not agree.', why: 'Neither side was posted, so the two sides of the trial balance still agree.' },
      ],
    );
  }),
  scenario('wrong-amount', 'A purchase recorded at a wrong amount', 'commission', false, (rng, id) => {
    const [a, b] = rng.shuffle([2, 3, 4, 5, 6, 7, 8, 9]).slice(0, 2);
    const right = r(a * 1000 + b * 100);
    const wrong = r(b * 1000 + a * 100);
    const diff = Math.abs(right - wrong);
    const who = rng.pick(['Rao & Co.', 'Kiran', 'Sharma Bros']);
    const supplier = creditor(who);
    const correction = right > wrong ? [dr('purchases', diff), cr(supplier, diff)] : [dr(supplier, diff), cr('purchases', diff)];
    return build(
      rng,
      id,
      'wrong-amount',
      'commission',
      false,
      {
        happened: `Bought goods for ${f(right)} on credit from ${end(who)}`,
        recorded: `Entered in the Purchases Book as ${f(wrong)}, the figures swapped, and posted from there to both accounts.`,
        right: [dr('purchases', right), cr(supplier, right)],
        wrong: [dr('purchases', wrong), cr(supplier, wrong)],
        correction,
        narration: `credit purchase from ${who} entered as ${f(wrong)} instead of ${f(right)}, now rectified`,
        explanation: [
          `The right accounts were used, but with ${f(wrong)} instead of ${f(right)}: a wrong amount in the book of original entry, which is an error of commission. It was posted from there to both accounts, so the two sides are equally wrong and the trial balance still agrees.`,
          right > wrong
            ? `Purchases (shown in the equation as stock) and the amount owed to ${who} are both ${f(diff)} too low. The rectifying entry adds the difference: Purchases A/c Dr ${f(diff)}, To ${who} ${f(diff)}. No Suspense A/c is used.`
            : `Purchases (shown in the equation as stock) and the amount owed to ${who} are both ${f(diff)} too high. The rectifying entry takes the difference off: ${who} Dr ${f(diff)}, To Purchases A/c ${f(diff)}. No Suspense A/c is used.`,
        ],
      },
      [
        { text: 'Error of commission: the right accounts, but a wrong amount on both sides, so the trial balance still agrees.' },
        { text: 'Error of omission: the purchase was not recorded.', why: 'The purchase was recorded; only its amount is wrong.' },
        { text: 'Error of principle: goods for resale were treated as a fixed asset.', why: 'Goods for resale were rightly debited to Purchases A/c; only the amount is wrong.' },
        { text: 'One-sided error of commission: only one account is wrong, so the difference goes to Suspense A/c.', why: 'Both accounts carry the same wrong amount, so the trial balance agrees and no Suspense A/c is needed.' },
      ],
    );
  }),
  scenario('credit-as-cash', 'A credit purchase recorded as a cash purchase', 'commission', false, (rng, id) => {
    const x = thousands(rng, 6, 25);
    const who = rng.pick(['Kiran', 'Rao & Co.', 'Sharma Bros']);
    const supplier = creditor(who);
    return build(
      rng,
      id,
      'credit-as-cash',
      'commission',
      false,
      {
        happened: `Bought goods for ${f(x)} on credit from ${end(who)}`,
        recorded: 'Recorded in the Cash Book as a cash purchase: Purchases A/c was debited and Cash A/c credited.',
        right: [dr('purchases', x), cr(supplier, x)],
        wrong: [dr('purchases', x), cr('cash', x)],
        correction: [dr('cash', x), cr(supplier, x)],
        narration: `credit purchase from ${who} wrongly recorded as a cash purchase, now rectified`,
        explanation: [
          `Nothing was paid, yet Cash A/c was credited instead of ${possessive(who)} account. Posting to a wrong account (here, through a wrong book) is an error of commission. No rule of accounting was broken: the goods were rightly debited to Purchases A/c, and no capital item was treated as revenue or a personal item as a business one, so it is not an error of principle. Both sides carry the same amount, so the trial balance still agrees.`,
          `Cash is shown ${f(x)} too low and the amount owed to ${who} is missing. The rectifying entry puts both right: Cash A/c Dr ${f(x)}, To ${who} ${f(x)}. No Suspense A/c is used.`,
        ],
      },
      [
        { text: `Error of commission: Cash A/c was credited instead of ${possessive(who)} account; the trial balance still agrees.` },
        { text: 'Error of principle: goods for resale were treated as a fixed asset.', why: 'Purchases A/c was rightly debited; the mistake is the account credited, which is a slip, not a broken rule.' },
        { text: 'Error of omission: the purchase was left out of the books.', why: 'The purchase was recorded, though against the wrong account.' },
        { text: 'Error of omission (partial): only Purchases A/c was posted.', why: 'Both sides were posted, one of them to the wrong account, so the trial balance agrees.' },
      ],
    );
  }),
  scenario('drawings-as-salary', 'Drawings recorded as salary', 'principle', false, (rng, id) => {
    const x = thousands(rng, 3, 15);
    return build(
      rng,
      id,
      'drawings-as-salary',
      'principle',
      false,
      {
        happened: `The proprietor took ${f(x)} in cash from the business for personal use.`,
        recorded: 'Debited to Salaries A/c, as if it were a salary paid to the staff.',
        right: [dr('drawings', x), cr('cash', x)],
        wrong: [dr('salaries', x), cr('cash', x)],
        correction: [dr('drawings', x), cr('salaries', x)],
        narration: 'cash withdrawn by the proprietor wrongly debited to Salaries A/c, now rectified',
        explanation: [
          'A personal withdrawal was treated as an expense of the business. That breaks the rule that the business and its proprietor are kept apart (the business entity concept): an error of principle. The amount and the sides are right, so the trial balance agrees.',
          `Capital as a whole is right, but the expenses are ${f(x)} too high (so the profit so far is ${f(x)} too low) and drawings are ${f(x)} too low. The rectifying entry moves the amount: Drawings A/c Dr ${f(x)}, To Salaries A/c ${f(x)}. Cash was right and is not touched.`,
        ],
      },
      [
        { text: 'Error of principle: a personal withdrawal was treated as a business expense.' },
        { text: 'Error of commission: a wrong amount of salary was recorded.', why: 'The amount is right; the account is of the wrong kind.' },
        { text: 'Error of omission: the withdrawal was not recorded.', why: 'It was recorded, only in the wrong kind of account.' },
        { text: 'Error of omission (partial): only Cash A/c was posted.', why: 'Both sides were posted: Salaries A/c and Cash A/c.' },
      ],
    );
  }),
  scenario('machine-as-repairs', 'A machine debited to Repairs', 'principle', false, (rng, id) => {
    const x = thousands(rng, 20, 60);
    return build(
      rng,
      id,
      'machine-as-repairs',
      'principle',
      false,
      {
        happened: `Bought a new machine for ${f(x)} and paid by cheque.`,
        recorded: 'Debited to Repairs A/c.',
        right: [dr('machinery', x), cr('bank', x)],
        wrong: [dr('repairs', x), cr('bank', x)],
        correction: [dr('machinery', x), cr('repairs', x)],
        narration: 'purchase of a machine wrongly debited to Repairs A/c, now rectified',
        explanation: [
          'A new machine is capital expenditure: an asset the business keeps. Debiting it to Repairs A/c treats it as revenue expenditure, an expense of the year: an error of principle. The amount and the sides are right, so the trial balance still agrees.',
          `Assets are ${f(x)} too low and the profit so far ${f(x)} too low. The rectifying entry brings the machine into the books and takes it out of the expenses: Machinery A/c Dr ${f(x)}, To Repairs A/c ${f(x)}.`,
        ],
      },
      [
        { text: 'Error of principle: capital expenditure was treated as revenue expenditure.' },
        { text: 'Error of commission: a wrong amount was debited to Repairs A/c.', why: 'The amount is right; it went to the wrong kind of account.' },
        { text: 'Error of omission: the machine was not recorded.', why: 'The payment was recorded, though as an expense.' },
        { text: 'Error of omission (partial): only Bank A/c was posted.', why: 'Both sides were posted: Repairs A/c and Bank A/c.' },
      ],
    );
  }),
  scenario('furniture-as-purchases', 'Furniture debited to Purchases', 'principle', false, (rng, id) => {
    const x = thousands(rng, 8, 30);
    const who = rng.pick(['Sharma Bros', 'Anita Traders', 'Rao & Co.']);
    const supplier = creditor(who);
    return build(
      rng,
      id,
      'furniture-as-purchases',
      'principle',
      false,
      {
        happened: `Bought furniture for the shop for ${f(x)} on credit from ${end(who)}`,
        recorded: 'Debited to Purchases A/c, as if the furniture were goods to be sold.',
        right: [dr('furniture', x), cr(supplier, x)],
        wrong: [dr('purchases', x), cr(supplier, x)],
        correction: [dr('furniture', x), cr('purchases', x)],
        narration: 'furniture bought wrongly debited to Purchases A/c, now rectified',
        explanation: [
          'Furniture for use in the shop is a fixed asset (capital expenditure), not goods for resale. Recording it in Purchases A/c treats it as revenue: an error of principle. The amount and the sides are right, so the trial balance still agrees.',
          `Purchases (shown in the equation as stock) are ${f(x)} too high and furniture ${f(x)} too low. The rectifying entry moves the amount: Furniture A/c Dr ${f(x)}, To Purchases A/c ${f(x)}. ${possessive(who)} account was right and is not touched.`,
        ],
      },
      [
        { text: 'Error of principle: a fixed asset was recorded as goods for resale.' },
        { text: `Error of commission: ${possessive(who)} account was credited instead of Cash A/c.`, why: `The furniture was bought on credit, so crediting ${who} is right.` },
        { text: 'Error of omission: the furniture was not recorded.', why: 'The purchase was recorded, though in the wrong account.' },
        { text: 'One-sided error: the difference goes to Suspense A/c.', why: 'Both sides were posted with the same amount, so the trial balance agrees.' },
      ],
    );
  }),
  scenario('credit-not-posted', 'An income posted on one side only', 'omission', true, (rng, id) => {
    const x = thousands(rng, 2, 9);
    return build(
      rng,
      id,
      'credit-not-posted',
      'omission',
      true,
      {
        happened: `Received commission of ${f(x)} in cash.`,
        recorded: 'Entered in the Cash Book (so Cash A/c is debited), but never posted to Commission Received A/c.',
        right: [dr('cash', x), cr('commissionReceived', x)],
        wrong: [dr('cash', x)],
        correction: [dr('suspense', x), cr('commissionReceived', x)],
        narration: 'commission received not posted to Commission Received A/c, now posted',
        explanation: [
          `Half of the transaction was left out: a partial error of omission. It leaves one account wrong, so it is one-sided: the debit side of the trial balance is ${f(x)} more than the credit side. The difference is put in Suspense A/c (a credit balance) so that the trial balance can be drawn up.`,
          `When the error is found, the missing credit is posted, with Suspense A/c as the other side: Suspense A/c Dr ${f(x)}, To Commission Received A/c ${f(x)}. Suspense A/c is closed, and the commission now adds to the profit so far.`,
        ],
      },
      [
        { text: 'Error of omission (partial): the credit to Commission Received A/c was not posted. It is one-sided, so the trial balance does not agree.' },
        { text: 'Error of omission (complete): the whole transaction was left out, so the trial balance still agrees.', why: 'Cash A/c was debited; only the credit is missing, so the trial balance does not agree.' },
        { text: 'Error of principle: commission was treated as capital.', why: 'Nothing was posted to Capital A/c; the credit was not posted at all.' },
        { text: 'Error of commission: the wrong amount was posted to both accounts.', why: 'Only one account was posted, so the two sides differ.' },
      ],
    );
  }),
  scenario('short-posting', 'An expense posted short', 'commission', true, (rng, id) => {
    const k = rng.int(2, 9);
    const x = r(k * 1000);
    const posted = r(k * 100);
    const diff = x - posted;
    return build(
      rng,
      id,
      'short-posting',
      'commission',
      true,
      {
        happened: `Paid rent of ${f(x)} in cash.`,
        recorded: `Entered correctly in the Cash Book (Cash A/c is credited with ${f(x)}), but posted to Rent A/c as ${f(posted)}.`,
        right: [dr('rent', x), cr('cash', x)],
        wrong: [dr('rent', posted), cr('cash', x)],
        correction: [dr('rent', diff), cr('suspense', diff)],
        narration: `rent posted as ${f(posted)} instead of ${f(x)}, now rectified`,
        explanation: [
          `A wrong amount was posted to one account: an error of commission. Rent A/c carries ${f(posted)} where it should carry ${f(x)}, and only that account is wrong, so the error is one-sided: the debit side of the trial balance is ${f(diff)} short. The difference is put in Suspense A/c (a debit balance).`,
          `The rectifying entry debits Rent A/c with what is missing and closes Suspense A/c: Rent A/c Dr ${f(diff)}, To Suspense A/c ${f(diff)}.`,
        ],
      },
      [
        { text: `Error of commission: Rent A/c was debited with ${f(diff)} too little. Only that account is wrong, so the trial balance does not agree.` },
        { text: 'Error of omission: the rent was not recorded.', why: `The payment was recorded; Cash A/c was credited with the full ${f(x)}.` },
        { text: 'Error of principle: rent was treated as an asset.', why: 'Rent was debited to Rent A/c, an expense, which is right in principle.' },
        { text: `Error of commission on both sides: both accounts carry ${f(posted)}, so the trial balance agrees.`, why: `Cash A/c carries the full ${f(x)}; only Rent A/c is short, so the totals differ.` },
      ],
    );
  }),
  scenario('wrong-side', 'A receipt posted to the wrong side', 'commission', true, (rng, id) => {
    const x = thousands(rng, 3, 12);
    const who = rng.pick(PEOPLE.filter((p) => p !== 'Kiran' && p !== 'Rao & Co.'));
    const customer = debtor(who);
    return build(
      rng,
      id,
      'wrong-side',
      'commission',
      true,
      {
        happened: `Received ${f(x)} in cash from ${who}, a debtor.`,
        recorded: `Entered correctly in the Cash Book (Cash A/c is debited), but posted to the debit of ${possessive(who)} account instead of its credit.`,
        // Some of the debtors of the opening books are this customer's.
        setup: [dr(customer, x + r(10000)), cr('debtors', x + r(10000))],
        right: [dr('cash', x), cr(customer, x)],
        wrong: [dr('cash', x), dr(customer, x)],
        correction: [dr('suspense', 2 * x), cr(customer, 2 * x)],
        narration: `cash received from ${who} wrongly posted to the debit of ${possessive(who)} account, now rectified`,
        explanation: [
          `Posting to the wrong side of an account is an error of commission. Only ${possessive(who)} account is wrong, so the error is one-sided, and it counts twice: the debit side of the trial balance is ${f(2 * x)} more than the credit side (the ${f(x)} that should have been credited, and the ${f(x)} wrongly debited). The difference is put in Suspense A/c as a credit balance.`,
          `The rectifying entry credits ${who} with twice the amount, cancelling the wrong debit and making the credit: Suspense A/c Dr ${f(2 * x)}, To ${who} ${f(2 * x)}.`,
        ],
      },
      [
        { text: `Error of commission: ${possessive(who)} account was posted on the wrong side. Only that account is wrong, so the trial balance is out by twice the amount.` },
        { text: 'Error of omission: the receipt was not recorded.', why: 'Cash A/c was debited, so the receipt was recorded.' },
        { text: 'Error of principle: the receipt was treated as an income.', why: 'No income account was used; the debtor was posted on the wrong side.' },
        { text: `Error of commission: the wrong debtor was credited, so the trial balance still agrees.`, why: `${who} was debited, not credited, so the two sides of the trial balance differ.` },
      ],
    );
  }),
];

export const findMistakeScenario = (id: string): MistakeScenario | undefined => EQUATION_MISTAKES.find((m) => m.id === id);
