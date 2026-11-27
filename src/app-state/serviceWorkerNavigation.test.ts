import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { describe, expect, it } from 'vitest';

// public/sw.js is plain JavaScript for the browser's worker scope. It is run here in a sandbox with a fake worker
// scope, so a navigation can be answered with the cache lookups made to throw.
const SOURCE = fs.readFileSync(path.join(process.cwd(), 'public', 'sw.js'), 'utf8');

interface FakeCaches {
  keys(): Promise<string[]>;
  open(name: string): Promise<{ match(): Promise<Response | undefined>; put(): Promise<void> }>;
}

// A worker scope resolves a bare path against its own origin; Node's Request needs the whole address.
class ScopeRequest extends Request {
  constructor(input: string, init?: RequestInit) {
    super(new URL(input, 'http://localhost'), init);
  }
}

function loadWorker(caches: FakeCaches, fetchImpl: () => Promise<Response>) {
  const handlers: Record<string, (event: unknown) => void> = {};
  const scope = {
    location: { href: 'http://localhost/sw.js?v=abcdefghi', origin: 'http://localhost' },
    addEventListener: (type: string, fn: (event: unknown) => void) => {
      handlers[type] = fn;
    },
    skipWaiting: () => {},
    clients: { claim: async () => {} },
  };
  vm.runInNewContext(SOURCE, {
    self: scope,
    caches,
    fetch: fetchImpl,
    URL,
    URLSearchParams,
    Request: ScopeRequest,
    Response,
    Promise,
    Set,
    Array,
    setTimeout,
    clearTimeout,
    console,
  });
  return (path: string): Promise<Response> =>
    new Promise((resolve, reject) => {
      const request = { method: 'GET', url: `http://localhost${path}`, mode: 'navigate', headers: new Headers() };
      let answered = false;
      handlers.fetch({
        request,
        respondWith: (p: Promise<Response>) => {
          answered = true;
          p.then(resolve, reject);
        },
        waitUntil: () => {},
      });
      if (!answered) reject(new Error('the worker did not answer the navigation'));
    });
}

const throwing: FakeCaches = {
  keys: async () => {
    throw new Error('cache storage failed');
  },
  open: async () => {
    throw new Error('cache storage failed');
  },
};

const empty: FakeCaches = {
  keys: async () => [],
  open: async () => ({ match: async () => undefined, put: async () => {} }),
};

describe('the service worker answers a page load the network can serve', () => {
  it('serves it from the network when every cache lookup throws', async () => {
    const load = loadWorker(throwing, async () => new Response('from network'));
    expect(await (await load('/home')).text()).toBe('from network');
  });

  it('serves it from the network when only listing the cache generations throws', async () => {
    const caches: FakeCaches = { ...empty, keys: throwing.keys };
    const load = loadWorker(caches, async () => new Response('from network'));
    expect(await (await load('/home')).text()).toBe('from network');
  });

  it('still serves a stored page when the network is slow to fail, and the network when it works', async () => {
    const caches: FakeCaches = {
      keys: async () => [],
      open: async () => ({ match: async () => new Response('stored'), put: async () => {} }),
    };
    const load = loadWorker(caches, async () => new Response('fresh'));
    expect(await (await load('/home')).text()).toBe('fresh');
  });

  it('reports the original network error when the offline page cannot be looked up either', async () => {
    const networkError = new TypeError('Failed to fetch');
    const load = loadWorker(throwing, async () => {
      throw networkError;
    });
    await expect(load('/home')).rejects.toBe(networkError);
  });

  it('shows the offline page for an unstored path when the network fails', async () => {
    const caches: FakeCaches = {
      keys: async () => [],
      open: async () => ({
        match: async (key?: unknown) =>
          String((key as Request | undefined)?.url).endsWith('/offline.html') ? new Response('offline page') : undefined,
        put: async () => {},
      }),
    };
    const load = loadWorker(caches, async () => {
      throw new TypeError('Failed to fetch');
    });
    expect(await (await load('/no-such-page')).text()).toBe('offline page');
  });
});

// ---------------------------------------------------------------------------------------------------------------
// The warm-up stores every page of the app (a couple of hundred), a few at a time.
// ---------------------------------------------------------------------------------------------------------------

/** A response the worker will accept for storing: complete, direct and same-origin. */
const stored = (body = '') => ({
  ok: true,
  type: 'basic',
  redirected: false,
  clone() {
    return this;
  },
  text: async () => body,
  json: async () => JSON.parse(body),
});

/** The list of its assets that the build of the worker under test (`?v=abcdefghi`) wrote (scripts/list-assets.mjs). */
const ASSET_LIST = '/_next/static/abcdefghi/am-assets.json';

/**
 * Runs a warm-up. `listed` is what the build's list of assets holds (nothing unless a test says so); with null the
 * request for the list goes to `fetchImpl` like any other.
 */
function warmUp(urls: string[], fetchImpl: (url: string) => Promise<unknown>, listed: string[] | null = []) {
  const handlers: Record<string, (event: unknown) => void> = {};
  const cached: string[] = [];
  const fakeCache = {
    match: async () => undefined,
    put: async (key: Request | string) => {
      cached.push(typeof key === 'string' ? key : new URL(key.url).pathname);
    },
    keys: async () => [],
  };
  vm.runInNewContext(SOURCE, {
    self: {
      location: { href: 'http://localhost/sw.js?v=abcdefghi', origin: 'http://localhost' },
      addEventListener: (type: string, fn: (event: unknown) => void) => {
        handlers[type] = fn;
      },
    },
    caches: { keys: async () => [], open: async () => fakeCache },
    fetch: (url: string) => (url === ASSET_LIST && listed !== null ? Promise.resolve(stored(JSON.stringify(listed))) : fetchImpl(url)),
    URL,
    URLSearchParams,
    Request: ScopeRequest,
    Response,
    Promise,
    Set,
    Array,
    setTimeout,
    clearTimeout,
    console,
  });
  return new Promise<{ ok: boolean; cached: string[] }>((resolve) => {
    handlers.message({
      data: { type: 'warm', urls },
      source: { postMessage: (m: { ok: boolean }) => resolve({ ok: m.ok, cached }) },
      waitUntil: () => {},
    });
  });
}

const routes = (n: number) => Array.from({ length: n }, (_, i) => `/page-${i}`);

describe('the warm-up', () => {
  it('stores every page with no more than six requests in flight, and reports ready', async () => {
    let inFlight = 0;
    let peak = 0;
    const result = await warmUp(routes(60), async () => {
      inFlight++;
      peak = Math.max(peak, inFlight);
      await new Promise((r) => setTimeout(r, 2));
      inFlight--;
      return stored();
    });
    expect(result.ok).toBe(true);
    expect(result.cached.filter((p) => p.startsWith('/page-'))).toHaveLength(60);
    expect(result.cached).toContain('/_am/warmed');
    expect(peak).toBeGreaterThan(1);
    expect(peak).toBeLessThanOrEqual(6);
  });

  it('retries a page that fails once and still reports ready', async () => {
    const calls: Record<string, number> = {};
    const result = await warmUp(routes(10), async (url) => {
      calls[url] = (calls[url] ?? 0) + 1;
      if (url === '/page-3' && calls[url] === 1) throw new TypeError('Failed to fetch');
      if (url === '/page-4' && calls[url] === 1) return { ...stored(), ok: false };
      return stored();
    });
    expect(result.ok).toBe(true);
    expect(calls['/page-3']).toBe(2);
    expect(calls['/page-4']).toBe(2);
    expect(result.cached).toContain('/page-3');
    expect(result.cached).toContain('/_am/warmed');
  });

  it('reports not ready, without the marker, when a page fails twice, and still stores the others', async () => {
    const calls: Record<string, number> = {};
    const result = await warmUp(routes(10), async (url) => {
      calls[url] = (calls[url] ?? 0) + 1;
      if (url === '/page-7') throw new TypeError('Failed to fetch');
      return stored();
    });
    expect(result.ok).toBe(false);
    expect(calls['/page-7']).toBe(2);
    expect(result.cached).not.toContain('/_am/warmed');
    expect(result.cached.filter((p) => p.startsWith('/page-'))).toHaveLength(9);
  });

  it('fetches the build assets a page names, once each', async () => {
    const fetched: string[] = [];
    const result = await warmUp(['/a', '/b'], async (url) => {
      fetched.push(url);
      return stored(url.startsWith('/_next/') ? '' : '<script src="/_next/static/chunks/x.js"></script>');
    });
    expect(result.ok).toBe(true);
    expect(fetched.filter((u) => u === '/_next/static/chunks/x.js')).toHaveLength(1);
  });

  it('stores every asset the build lists, also one that no page names (a part loaded on demand), once each', async () => {
    const fetched: string[] = [];
    const result = await warmUp(
      ['/a'],
      async (url) => {
        fetched.push(url);
        return stored(url.startsWith('/_next/') ? '' : '<script src="/_next/static/chunks/x.js"></script>');
      },
      ['/_next/static/chunks/x.js', '/_next/static/chunks/topic.js', '/somewhere/else.js', 7 as unknown as string],
    );
    expect(result.ok).toBe(true);
    expect(fetched.filter((u) => u.startsWith('/_next/')).sort()).toEqual(['/_next/static/chunks/topic.js', '/_next/static/chunks/x.js']);
    expect(result.cached).toContain('/_next/static/chunks/topic.js');
    expect(result.cached).not.toContain('/somewhere/else.js');
    expect(result.cached).toContain('/_am/warmed');
  });

  it('reports not ready, without the marker, when the list of assets cannot be had', async () => {
    const calls: Record<string, number> = {};
    const answer = async (url: string) => {
      calls[url] = (calls[url] ?? 0) + 1;
      return url === ASSET_LIST ? { ...stored(), ok: false } : stored();
    };
    const result = await warmUp(routes(3), answer, null);
    expect(result.ok).toBe(false);
    expect(calls[ASSET_LIST]).toBe(2);
    expect(result.cached).not.toContain('/_am/warmed');
    expect(result.cached.filter((p) => p.startsWith('/page-'))).toHaveLength(3);

    // What is there but is no list counts the same.
    const notAList = await warmUp(routes(1), async (url) => stored(url === ASSET_LIST ? '{"chunks":[]}' : ''), null);
    expect(notAList.ok).toBe(false);
  });
});
