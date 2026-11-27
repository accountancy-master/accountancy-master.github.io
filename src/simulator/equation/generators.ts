import type { SceneGenerator } from '../scenes';

// The endless supply of the accounting-equation scene: the transactions behind the topic's own effect questions, and
// the single entries of Journal Entries. Each is loaded the first time it is wanted (it brings a topic's generators),
// so the simulator's page does not pay for it until then.

export const EQUATION_GENERATORS: SceneGenerator[] = [
  {
    id: 'equation',
    label: 'Accounting equation patterns',
    prefix: 'm',
    load: () => import('./fromGenerators').then((m) => m.loadEquationMoves()),
  },
  {
    id: 'journal',
    label: 'Journal entry patterns',
    prefix: 'j',
    load: () => import('./fromGenerators').then((m) => m.loadJournalEntries()),
  },
];
