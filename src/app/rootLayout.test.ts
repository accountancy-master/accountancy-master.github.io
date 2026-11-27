import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

// The root layout is part of every page's first load. It must only need ids (src/content/catalogue.generated.ts), so
// that the weight of every page does not grow with the amount of content: no pack, no generator, no registry.
const SRC = path.join(process.cwd(), 'src');
// Written for either kind of path: a Windows machine writes them with backslashes.
const FORBIDDEN = [
  /[\\/]src[\\/]generators[\\/]/,
  /[\\/]src[\\/]content[\\/](registry|ladder|validate|report|cbse11|cbse12|courses)\b/,
];
// The test build (NEXT_PUBLIC_E2E) asks for a sample course while it starts (src/testing/e2eCourse.ts), which brings
// generators with it. A normal build leaves that branch out, so it is no part of the layout.
const TEST_BUILD_ONLY = /[\\/]src[\\/]testing[\\/]e2eCourse\.ts$/;

function resolve(from: string, spec: string): string | null {
  let base: string;
  if (spec.startsWith('@/')) base = path.join(SRC, spec.slice(2));
  else if (spec.startsWith('.')) base = path.resolve(path.dirname(from), spec);
  else return null; // a package
  for (const candidate of [base, `${base}.ts`, `${base}.tsx`, path.join(base, 'index.ts'), path.join(base, 'index.tsx')]) {
    if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) return candidate;
  }
  return null;
}

/**
 * Files a source file imports at run time (type-only imports are erased by the compiler and do not count). Without
 * `onDemand`, what it only loads when it asks (`import()`) is left out: that is no part of the page that imports it.
 */
function imports(file: string, onDemand: boolean): string[] {
  const text = fs.readFileSync(file, 'utf8');
  const found: string[] = [];
  for (const m of text.matchAll(/^\s*(?:import|export)\s+(?!type\b)[^;'"]*?from\s+['"]([^'"]+)['"]/gm)) found.push(m[1]);
  for (const m of text.matchAll(/^\s*import\s+['"]([^'"]+)['"]/gm)) found.push(m[1]);
  if (onDemand) for (const m of text.matchAll(/\bimport\(\s*['"]([^'"]+)['"]\s*\)/g)) found.push(m[1]);
  return found.flatMap((spec) => (resolve(file, spec) ?? []));
}

function reachable(entry: string, onDemand = true, leaveOut?: RegExp): string[] {
  const seen = new Set<string>();
  const queue = [entry];
  while (queue.length) {
    const file = queue.pop()!;
    if (seen.has(file) || !/\.(ts|tsx)$/.test(file) || leaveOut?.test(file)) continue;
    seen.add(file);
    queue.push(...imports(file, onDemand));
  }
  return [...seen];
}

describe('the root layout', () => {
  const files = reachable(path.join(SRC, 'app', 'layout.tsx'), true, TEST_BUILD_ONLY);

  it('is traced through its providers and the service worker registration', () => {
    const names = files.map((f) => path.basename(f));
    expect(names).toContain('ServiceWorker.tsx');
    expect(names).toContain('StoreProvider.tsx');
    expect(names).toContain('catalogue.generated.ts');
  });

  it('imports no registry, pack, ladder or generator', () => {
    const bad = files.filter((f) => FORBIDDEN.some((re) => re.test(f))).map((f) => path.relative(process.cwd(), f));
    expect(bad).toEqual([]);
    // The rule is a real one on this machine too: it does find a generator where there is one.
    expect(FORBIDDEN.some((re) => re.test(path.join(SRC, 'generators', 'engine.ts')))).toBe(true);
    expect(FORBIDDEN.some((re) => re.test(path.join(SRC, 'content', 'courses', 'cbse12.ts')))).toBe(true);
  });

  it('asks for the sample course of the test build on demand only, behind the flag of the test build', () => {
    const provider = path.join(SRC, 'app-state', 'StoreProvider.tsx');
    expect(imports(provider, false).some((f) => TEST_BUILD_ONLY.test(f))).toBe(false);
    expect(imports(provider, true).some((f) => TEST_BUILD_ONLY.test(f))).toBe(true);
    expect(fs.readFileSync(provider, 'utf8')).toMatch(/if \(process\.env\.NEXT_PUBLIC_E2E !== '1'\) return;\s+try \{\s+\(await import\('@\/testing\/e2eCourse'\)\)/);
    // Nothing else the layout needs asks for it.
    const others = files.filter((f) => f !== provider && imports(f, true).some((g) => TEST_BUILD_ONLY.test(g)));
    expect(others).toEqual([]);
  });
});

// ---------------------------------------------------------------------------------------------------------------
// The content of a topic (its pack, its generators, the cases of its stage) is loaded when something plays it. So
// no page may import any of it: a page has it only through content/loadTopics.ts, which asks for it with `import()`.
// ---------------------------------------------------------------------------------------------------------------

/** The packs, the generators, and the files that hold all of them at once (for unit tests and scripts). */
const CONTENT = [
  /[\\/]src[\\/]generators[\\/](index\.ts$|templates[\\/]|cases[\\/])/,
  /[\\/]src[\\/]content[\\/](registry|validate|report|catalogueSource|cbse11|cbse12)\b/,
];
const isContent = (file: string) => CONTENT.some((re) => re.test(file));
const relative = (file: string) => path.relative(process.cwd(), file).replace(/\\/g, '/');

function pagesUnder(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const file = path.join(dir, entry.name);
    return entry.isDirectory() ? pagesUnder(file) : entry.name === 'page.tsx' ? [file] : [];
  });
}

describe('the screens that list things without playing them', () => {
  // Home, Topics, Practice (and its two pickers), Progress, Settings, Case studies, Mock papers, What's inside, Quick sheets.
  const LISTING = ['home', 'topics', 'practice', 'practice/topic', 'practice/marathon', 'progress', 'settings', 'cases', 'mock', 'inside', 'sheets'];

  it.each(LISTING)('/%s imports no pack and no generator: what it lists comes from the generated outline', (route) => {
    const files = reachable(path.join(SRC, 'app', ...route.split('/'), 'page.tsx'), false);
    expect(files.filter(isContent).map(relative)).toEqual([]);
    if (route !== 'settings') expect(files.map(relative)).toContain('src/content/outline.generated.ts');
  });

  it('holds for the tools the test build adds to Settings too', () => {
    const tools = fs.readdirSync(path.join(SRC, 'components', 'settings')).filter((name) => /^E2e.*\.tsx$/.test(name));
    expect(tools.length).toBeGreaterThan(0);
    for (const tool of tools) expect(reachable(path.join(SRC, 'components', 'settings', tool), false).filter(isContent).map(relative), tool).toEqual([]);
  });
});

describe('every page', () => {
  const pages = pagesUnder(path.join(SRC, 'app'));

  it('imports no pack and no generator itself', () => {
    expect(pages.length).toBeGreaterThan(15);
    for (const page of pages) expect(reachable(page, false).filter(isContent).map(relative), relative(page)).toEqual([]);
  });

  // It follows every import of every page, which takes seconds on a busy machine.
  it('gets the content of a topic only through the loader, which asks for it when it is needed', { timeout: 30_000 }, () => {
    // Followed through what is loaded on demand, the pages do reach the packs, the generators and the cases ...
    const everything = [...new Set(pages.flatMap((page) => reachable(page, true)))];
    const content = everything.filter(isContent).map(relative);
    for (const folder of ['src/content/cbse11/', 'src/generators/templates/', 'src/generators/cases/']) {
      expect(content.some((f) => f.startsWith(folder)), folder).toBe(true);
    }
    // ... never the files that hold all of them at once ...
    expect(content.filter((f) => /\/(registry|index|validate|report|catalogueSource)\.ts$/.test(f))).toEqual([]);
    // ... and the one file that asks for them is the loader.
    const asking = everything.filter((file) => !isContent(file) && imports(file, true).some(isContent) && !imports(file, false).some(isContent));
    expect(asking.map(relative)).toEqual(['src/content/loadTopics.ts']);
  });

  it('may use the function that makes an outline: it holds no content, and all it imports are types', () => {
    // The test build makes the outline of its sample topic with it (src/testing/e2eCourse.ts).
    expect(imports(path.join(SRC, 'content', 'outlineOf.ts'), true)).toEqual([]);
  });
});
