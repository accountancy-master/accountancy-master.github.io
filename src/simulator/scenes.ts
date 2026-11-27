import type { AccountGroup } from './accounts';
import { EQUATION_SCENE } from './equation/scene';
import type { JournalLine, Paise, SimTransaction } from './types';

// ---------------------------------------------------------------------------------------------------------------
// The plug-in shape of the simulator. A scene is one topic's view of the books: the containers it draws, how the
// accounts of an entry are placed in them, the books a play starts from, and what it plays (its own transactions,
// generators that make endless more, stories, the events of free play and the mistakes to find). The engine
// (engine.ts) and the screen (components/simulator) know nothing of any topic: everything topical is here.
//
// A scene is plain data and functions, so another renderer (a 3D one, a printed worksheet) could draw the same
// scene. docs/simulator.md says how to add one and lists the scenes planned.
// ---------------------------------------------------------------------------------------------------------------

/** The colour family of a container, from the app's hues (components/ui/hues.ts). Never the only signal: every container is labelled. */
export type SceneHue = 'blue' | 'rose' | 'green' | 'amber' | 'violet' | 'teal' | 'orange' | 'sky';

export interface ContainerSpec {
  id: string;
  /** What heads it: "Assets". */
  title: string;
  /** One line under the title: "What the business owns". */
  caption: string;
  /**
   * The side of the equation it stands on. 'either' is for a temporary container (Suspense), which stands on the
   * side of its balance: a debit balance with the assets, a credit balance with the claims.
   */
  side: 'left' | 'right' | 'either';
  hue: SceneHue;
  /** A container that is drawn only while it holds something: Suspense, a provision. */
  transient?: true;
}

export interface BandSpec {
  id: string;
  container: string;
  /** What the band is called in its container: "Cash", "Profit so far". */
  label: string;
  /** True for the accounts this band gathers. The first band that takes an account is where it goes. */
  takes(accountId: string, group: AccountGroup): boolean;
  /**
   * A band whose figure may be below nothing: a loss so far, drawings (shown as a deduction), a provision. Every
   * other band must stay at or above nothing, which is what decides whether a transaction fits the books.
   */
  mayBeNegative?: true;
  /** Said of the band where it is a deduction: "Less: Drawings". */
  deduction?: true;
}

/** One event of free play: what happens, in plain words, the choices it offers and the transaction they make. */
export interface FreePlayEvent {
  id: string;
  /** "The proprietor brings in money". */
  title: string;
  /** The choices, each a list of options: "Into" cash or bank, "Paid by" cash, bank or on credit. */
  choices: { id: string; label: string; options: { id: string; label: string }[] }[];
  /** The amount fields, by id, with their labels: most events have one ("Amount"); a sale has cost and price. */
  amounts: { id: string; label: string; defaultRupees: number }[];
  /** The transaction for the choices and amounts (in paise), or a message that says why it cannot be made. */
  make(choice: Record<string, string>, amounts: Record<string, Paise>): SimTransaction | { problem: string };
}

/** A story: one business, transactions one after another from the start. */
export interface Story {
  id: string;
  title: string;
  /** One line about it. */
  blurb: string;
  /** The books it starts from: empty for a new business. */
  opening: JournalLine[];
  transactions: SimTransaction[];
}

/**
 * The class of an error a Class 11 student meets, as CBSE and NCERT name it. (Compensating errors need two errors at
 * once, so a single transaction cannot show one.) Whether the error is one-sided is a separate matter, its effect.
 */
export type ErrorClass = 'omission' | 'commission' | 'principle';

/** A transaction recorded wrongly, what it did, the question about it, and the entry that puts it right. */
export interface MistakeCase {
  /** `x.<scenario>.<seed>`. */
  id: string;
  scenarioId: string;
  errorClass: ErrorClass;
  /**
   * By its effect: true when the error leaves one account wrong, so the trial balance does not agree and the difference
   * goes to Suspense A/c; false when the debits still equal the credits (a two-sided error, or one left out wholly).
   */
  oneSided: boolean;
  /** The narration of the rectifying entry, without "Being" and the brackets. */
  narration: string;
  /** What really happened. */
  happened: string;
  /** How it was recorded, in words. */
  recorded: string;
  /** Balances the case needs before it starts (a debtor who owes something), posted on the scene's opening books. */
  setup?: JournalLine[];
  /** The entry as it should have been. */
  right: JournalLine[];
  /** What was posted: possibly one side only, or nothing at all. */
  wrong: JournalLine[];
  /** The rectifying entry. With a one-sided error it uses Suspense A/c. */
  correction: JournalLine[];
  /** The question and its choices: one right, the others each a mistake. */
  question: string;
  options: { id: string; text: string; why?: string }[];
  correct: string;
  /** Why the right choice is right, and how the correction works. */
  explanation: string[];
}

export interface MistakeScenario {
  id: string;
  title: string;
  errorClass: ErrorClass;
  /** Whether its error is one-sided (see MistakeCase). */
  oneSided: boolean;
  /** The case for a seed: amounts and names vary, the error does not. */
  make(seed: number): MistakeCase;
}

/** A generator of endless transactions: one for every seed. Loaded when first wanted, since it brings a topic's data. */
export interface SceneGenerator {
  id: string;
  /** "Accounting equation patterns". */
  label: string;
  /** The prefix of the ids of its transactions: `m` gives `m.<seed>`. */
  prefix: string;
  load(): Promise<(seed: number) => SimTransaction>;
}

export interface Scene {
  /** Short and stable: it is part of the ids of what the scene records ("ae"). */
  id: string;
  title: string;
  /** The topic it belongs to: its levels play it, and its mistakes are this topic's. */
  topicId: string;
  /** The concept a prediction is recorded under, and the one a found mistake is. */
  concepts: { predict: string; mistake: string };
  containers: ContainerSpec[];
  bands: BandSpec[];
  /** How the equation is read: the containers on its left, then those on its right ("Assets = Liabilities + Capital"). */
  equation: { left: string[]; right: string[] };
  /** The books a play starts from, as an opening entry, and what they are called. */
  opening: { title: string; lines: JournalLine[] };
  /** The scene's own transactions, which cover every kind it teaches. */
  transactions: SimTransaction[];
  generators: SceneGenerator[];
  stories: Story[];
  events: FreePlayEvent[];
  mistakes: MistakeScenario[];
}

// The scenes there are. Each is a file of its own; this is the one list.
export const SCENES: readonly Scene[] = [EQUATION_SCENE];

export const findScene = (id: string): Scene | undefined => SCENES.find((s) => s.id === id);

/** The scene of a topic, if the topic has one. */
export const sceneOfTopic = (topicId: string): Scene | undefined => SCENES.find((s) => s.topicId === topicId);
