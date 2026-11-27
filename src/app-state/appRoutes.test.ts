import { readdirSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { describe, expect, it } from 'vitest';
import { appRoutes } from './ServiceWorker';

// Every page of the app is stored for offline use: each page under src/app is in the warm-up list (a page with a
// segment in brackets, such as /maps/[topicId], by at least one address of its family).

const APP = join(__dirname, '..', 'app');

function pages(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) out.push(...pages(path));
    else if (name === 'page.tsx') {
      const route = relative(APP, dir).split(sep).filter(Boolean).join('/');
      out.push(`/${route}`);
    }
  }
  return out;
}

describe('appRoutes', () => {
  const routes = appRoutes();
  it('has every page of the app', () => {
    const all = pages(APP);
    expect(all).toContain('/practical');
    for (const page of all) {
      const pattern = new RegExp(`^${page.replace(/\[[^\]]+\]/g, '[^/]+')}$`);
      expect(routes.some((r) => pattern.test(r)), page).toBe(true);
    }
  });
  it('lists each address once', () => {
    expect(new Set(routes).size).toBe(routes.length);
  });
});
