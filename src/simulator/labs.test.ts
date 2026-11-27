import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { topicShown } from '@/content/courseOptions';
import { courseOfTopic } from '@/content/outline';
import { EQUATION_LAB, findLab, labHref, labsOfTopic, LABS, shelfGroups, shelfOf } from './labs';

describe('the labs of the simulator', () => {
  it('have ids of their own, real topics and a screen each', () => {
    expect(new Set(LABS.map((l) => l.id)).size).toBe(LABS.length);
    const screens = readFileSync('src/components/simulator/labs/index.ts', 'utf8');
    for (const lab of LABS) {
      expect(lab.topicIds.length, lab.id).toBeGreaterThan(0);
      for (const t of lab.topicIds) expect(courseOfTopic(t), `${lab.id}: ${t}`).toBe(lab.classLevel === 11 ? 'cbse-11-accountancy' : 'cbse-12-accountancy');
      if (lab.id !== EQUATION_LAB) expect(screens, lab.id).toContain(`'${lab.id}': dynamic(`);
    }
  });

  it('offer only the ready ones, those of the learner first', () => {
    expect(findLab(EQUATION_LAB)?.id).toBe(EQUATION_LAB);
    for (const lab of LABS.filter((l) => !l.ready)) expect(findLab(lab.id)).toBeUndefined();
    expect(findLab('nothing')).toBeUndefined();
    const ready = LABS.filter((l) => l.ready);
    const class12 = shelfOf((t) => courseOfTopic(t) === 'cbse-12-accountancy');
    expect(class12.map((l) => l.id).sort()).toEqual(ready.map((l) => l.id).sort());
    const firstOther = class12.findIndex((l) => l.classLevel === 11);
    if (firstOther >= 0) expect(class12.slice(firstOther).every((l) => l.classLevel === 11)).toBe(true);
  });
});

describe('the labs of a topic', () => {
  it('are the ready labs that picture it, its own first', () => {
    for (const lab of LABS.filter((l) => l.ready)) {
      // Its own topic lists it among the labs whose main topic it is, and those come first (two labs may share one).
      const own = labsOfTopic(lab.topicIds[0]);
      const main = own.filter((l) => l.topicIds[0] === lab.topicIds[0]).length;
      expect(own.slice(0, main).map((l) => l.id), lab.id).toContain(lab.id);
      for (const t of lab.topicIds) expect(labsOfTopic(t).map((l) => l.id), `${lab.id}: ${t}`).toContain(lab.id);
    }
    expect(labsOfTopic('no-such-topic')).toEqual([]);
    expect(labHref(EQUATION_LAB)).toBe('/simulator');
    expect(labHref('ratios')).toBe('/simulator?lab=ratios');
  });
});

describe('the shelf and the choice of Part B', () => {
  // What useCourse says a learner meets: the topics of the course, but not those of the Part B not chosen.
  const learner = (courseId: string, partB?: 'computerised') => (t: string) => courseOfTopic(t) === courseId && topicShown(t, partB ? { class12PartB: partB } : {});
  const ids = (g: { labs: { id: string }[] }) => g.labs.map((l) => l.id);
  const ANALYSIS_LABS = ['cash-flow', 'ratios', 'company-statements'];

  it('keeps the spreadsheet out of the course of a learner of Analysis of Financial Statements, under its own option', () => {
    const groups = shelfGroups(learner('cbse-12-accountancy'));
    expect(groups[0]).toMatchObject({ classLevel: 12, mine: true });
    expect(ids(groups[0])).not.toContain('spreadsheet');
    for (const id of ANALYSIS_LABS) expect(ids(groups[0])).toContain(id);
    const option = groups.find((g) => g.option)!;
    expect(option).toMatchObject({ classLevel: 12, mine: false, option: 'Computerised Accounting' });
    expect(ids(option)).toEqual(['spreadsheet']);
    expect(groups.map((g) => g.option ?? (g.mine ? 'mine' : `class ${g.classLevel}`))).toEqual(['mine', 'Computerised Accounting', 'class 11']);
  });

  it('puts the spreadsheet in the course of a learner of Computerised Accounting, and the analysis labs after it', () => {
    const groups = shelfGroups(learner('cbse-12-accountancy', 'computerised'));
    expect(ids(groups[0])).toContain('spreadsheet');
    for (const id of ANALYSIS_LABS) expect(ids(groups[0])).not.toContain(id);
    expect(groups[1]).toMatchObject({ classLevel: 12, mine: false, option: 'Analysis of Financial Statements' });
    expect(ids(groups[1]).sort()).toEqual([...ANALYSIS_LABS].sort());
    expect(groups[2]).toMatchObject({ classLevel: 11, mine: false });
  });

  it('shows a Class 11 learner every Class 12 lab in one row, with no option named', () => {
    const groups = shelfGroups(learner('cbse-11-accountancy'));
    expect(groups.map((g) => [g.classLevel, g.mine, g.option])).toEqual([[11, true, undefined], [12, false, undefined]]);
    expect(groups.flatMap(ids).sort()).toEqual(LABS.filter((l) => l.ready).map((l) => l.id).sort());
  });
});
