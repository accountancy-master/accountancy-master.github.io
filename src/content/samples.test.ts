import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { CASES, TEMPLATES } from '@/generators';
import { SAMPLE_LENGTH, SAMPLES_FILE, renderSamples, sampleLine } from './catalogueSource';
import { SAMPLES } from './samples.generated';

describe('the generated samples (a line of every pattern, for the Playground)', () => {
  it('are up to date with the generators: run `npm run catalogue` when this fails', () => {
    const committed = fs.readFileSync(path.join(process.cwd(), SAMPLES_FILE), 'utf8').replace(/\r\n/g, '\n');
    expect(committed).toBe(renderSamples());
  });

  it('have a line for every template and every case study, none of them empty or too long', () => {
    expect(Object.keys(SAMPLES)).toEqual([...TEMPLATES.map((t) => t.id), ...CASES.map((c) => c.id)]);
    for (const [id, sample] of Object.entries(SAMPLES)) {
      expect(sample.length, id).toBeGreaterThan(10);
      expect(sample.length, id).toBeLessThanOrEqual(SAMPLE_LENGTH);
      expect(sample, id).not.toContain('\n');
    }
  });

  it('keep the first line of a text, cut at a word', () => {
    expect(sampleLine('\n  Pass the entry:  cash ₹5,000.\nMore')).toBe('Pass the entry: cash ₹5,000.');
    const long = sampleLine(`${'word '.repeat(40)}end`);
    expect(long.length).toBeLessThanOrEqual(SAMPLE_LENGTH);
    expect(long.endsWith('word…')).toBe(true);
  });
});
