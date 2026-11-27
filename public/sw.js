// Hand-written service worker (plain JavaScript, no build step).
// Online behaviour stays network-first; the cache only answers when the network fails, except for
// content-hashed build assets, which never change under the same URL.
//
// Cache generations. Every build registers this script as /sw.js?v=<build id> (see next.config.ts),
// so a new build installs a new worker with its own cache, `am-<build id>`, with no manual version bump.
// Build ids are fixed-width base-36 timestamps, so sorting cache names sorts them by build age.
// On activate we keep the current cache and the newest other generation and delete the rest: a tab
// that is still running the previous build keeps finding its old pages and chunks. Lookups search the
// current cache first, then that previous one; writes only ever go to the current cache.
const ID = /^[0-9a-z]{9}$/;
const version = new URL(self.location.href).searchParams.get('v');
const CACHE = version && ID.test(version) ? `am-${version}` : 'am-unversioned';
const GENERATION = /^am-[0-9a-z]{9}$/;

// A page load that has had no answer from the network after this long is served from the cache instead, if the
// path is stored; the network request carries on and refreshes the stored copy when it completes.
const NAVIGATION_TIMEOUT_MS = 4000;

// A small self-contained page (public/offline.html), stored by the warm-up. When the network fails for a path
// that is not stored, this is shown instead of the browser's error page. Keep the name in sync with ServiceWorker.tsx.
const OFFLINE_PAGE = '/offline.html';

// Next.js adds a long Vary header to pages (RSC, router state); we key pages by path, so ignore it.
const MATCH = { ignoreVary: true };

// Every file of this build under /_next/static/, written down when the app was built (scripts/list-assets.mjs). The
// warm-up finds most build assets by reading the pages it stores, but the parts of the build that the app fetches
// only when it needs them (the content of a topic) are named by no page: they are taken from this list, so a topic
// that was never opened works offline too. The list lives in the folder Next.js names after the build id.
const ASSET_LIST = version && ID.test(version) ? `/_next/static/${version}/am-assets.json` : null;

// Written last by a fully successful warm-up. It lives inside the cache, so it vanishes with it; the page
// (ServiceWorker.tsx) checks for it before it trusts that the app is stored. Keep both names in sync.
const WARMED_MARKER = '/_am/warmed';

// Same-origin requests that are not navigations and not under /_next/static/ are only handled when they
// are listed here; everything else goes to the network untouched.
const ALLOWED_PATHS = new Set(['/manifest.webmanifest', '/icon.svg']);
const ALLOWED_PREFIXES = ['/icons/'];

self.addEventListener('install', () => {
  self.skipWaiting();
});

// The newest generation other than the current one (cache names are build ids, so they sort by age).
async function previousName() {
  const names = (await caches.keys()).filter((n) => n !== CACHE && GENERATION.test(n)).sort();
  return names.pop();
}

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const keep = new Set([CACHE, await previousName()]);
      const names = await caches.keys();
      // Only our own `am-` caches are touched; this also clears the unversioned cache of older workers.
      await Promise.all(names.filter((n) => n.startsWith('am-') && !keep.has(n)).map((n) => caches.delete(n)));
      await self.clients.claim();
    })(),
  );
});

// Pages are stored under their path alone, so a query string never creates a second copy.
function pageKey(url) {
  return new Request(new URL(url, self.location.origin).pathname);
}

// Current cache first, then the previous generation.
async function lookup(key) {
  const hit = await (await caches.open(CACHE)).match(key, MATCH);
  if (hit) return hit;
  const previous = await previousName();
  return previous ? (await caches.open(previous)).match(key, MATCH) : undefined;
}

// A lookup for the page-load path: any error from the cache (storage failing, a generation vanishing) counts as
// "not stored", so it can never fail a navigation that the network can serve.
async function lookupSafely(key) {
  try {
    return await lookup(key);
  } catch {
    return undefined;
  }
}

// Only complete, direct, same-origin responses are ever stored.
function storable(response) {
  return response.ok && response.type === 'basic' && !response.redirected;
}

// Hands the page its response straight away; the cache write finishes in the background.
function remember(event, key, response) {
  if (!storable(response)) return;
  const copy = response.clone();
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) => cache.put(key, copy))
      .catch(() => {}),
  );
}

async function navigate(event) {
  const { request } = event;
  const key = pageKey(request.url);
  // The request starts at once; looking in the cache happens while it is on its way.
  const network = fetch(request).then((res) => {
    remember(event, key, res);
    return res;
  });
  network.catch(() => {});
  const cached = await lookupSafely(key);

  if (!cached) {
    // Nothing stored for this path: wait for the network as long as it takes. If it fails, show the offline page.
    try {
      return await network;
    } catch (err) {
      // A failing lookup of the offline page must not hide the network error that got us here.
      const offline = await lookupSafely(pageKey(OFFLINE_PAGE));
      if (offline) return offline;
      throw err;
    }
  }

  let timer;
  const timeout = new Promise((resolve) => {
    timer = setTimeout(resolve, NAVIGATION_TIMEOUT_MS, null);
  });
  try {
    const res = await Promise.race([network, timeout]);
    if (res) return res;
    // Too slow: answer from the cache and keep the request alive so that it can refresh the stored copy.
    event.waitUntil(network.catch(() => {}));
    return cached;
  } catch {
    return cached;
  } finally {
    clearTimeout(timer);
  }
}

async function cacheFirst(event, key) {
  const hit = await lookup(key);
  if (hit) return hit;
  const res = await fetch(event.request);
  remember(event, key, res);
  return res;
}

async function networkFirst(event, key) {
  try {
    const res = await fetch(event.request);
    remember(event, key, res);
    return res;
  } catch (err) {
    const hit = await lookup(key);
    if (hit) return hit;
    throw err;
  }
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  // The worker script itself is never cached by this worker; the browser updates it directly.
  if (url.pathname === '/sw.js') return;

  // 1. Client-side navigation payloads: network only. Offline they fail and Next.js falls back to a
  //    full page load, which rule 2 answers from the cache.
  if (request.headers.has('RSC') || url.searchParams.has('_rsc')) return;

  // 2. Page loads.
  if (request.mode === 'navigate') {
    event.respondWith(navigate(event));
    return;
  }

  // 3. Content-hashed build output.
  if (url.pathname.startsWith('/_next/static/')) {
    event.respondWith(cacheFirst(event, request));
    return;
  }

  // 4. Allow-listed static files: icons never change under the same URL, the rest is network first.
  if (ALLOWED_PREFIXES.some((p) => url.pathname.startsWith(p))) {
    event.respondWith(cacheFirst(event, pageKey(request.url)));
    return;
  }
  if (ALLOWED_PATHS.has(url.pathname)) {
    event.respondWith(networkFirst(event, pageKey(request.url)));
  }
  // 5. Anything else is not ours: no respondWith, so the browser goes to the network untouched.
});

// Flight data in the HTML holds the paths inside escaped strings, so a backslash also ends a path.
const STATIC_URL = /\/_next\/static\/[^"'\\\s<>()]+/g;

function staticUrls(text) {
  return text.match(STATIC_URL) || [];
}

// Fetches every item with at most `limit` requests in flight at once.
async function runLimited(items, limit, task) {
  const queue = items.slice();
  const workers = Array.from({ length: Math.min(limit, queue.length) }, async () => {
    while (queue.length) await task(queue.shift());
  });
  await Promise.all(workers);
}

// How many pages (and then build assets) are fetched at once while warming up. The app has a couple of hundred
// pages; one after the other would take minutes, all at once would swamp the server with a burst.
const WARM_CONCURRENCY = 6;

// A page or asset that fails (network error, or an answer that must not be stored) is tried once more before the
// warm-up reports that the app is not fully stored.
const WARM_ATTEMPTS = 2;

async function withRetry(task) {
  for (let attempt = 0; attempt < WARM_ATTEMPTS; attempt++) {
    try {
      if (await task()) return true;
    } catch {
      // Same as a refused answer: try again, then give up.
    }
  }
  return false;
}

async function warm(urls) {
  const cache = await caches.open(CACHE);
  let ok = true;
  const assets = new Set();

  // Pages, a few at a time. `reload` bypasses the HTTP cache, so the stored copy is what the server serves now.
  await runLimited(urls, WARM_CONCURRENCY, async (url) => {
    const stored = await withRetry(async () => {
      const res = await fetch(url, { cache: 'reload' });
      if (!storable(res)) return false;
      await cache.put(pageKey(url), res.clone());
      for (const a of staticUrls(await res.text())) assets.add(a);
      return true;
    });
    if (!stored) ok = false;
  });

  // The build's own list of its assets. Without it the app is not fully stored: what a page does not name would be missing.
  if (ASSET_LIST) {
    const listed = await withRetry(async () => {
      const res = await fetch(ASSET_LIST, { cache: 'reload' });
      if (!storable(res)) return false;
      const list = await res.json();
      if (!Array.isArray(list)) return false;
      for (const a of list) if (typeof a === 'string' && a.startsWith('/_next/static/')) assets.add(a);
      return true;
    });
    if (!listed) ok = false;
  }

  // Build assets: skip what is already stored, and read stylesheets for the font files they name.
  const done = new Set();
  const pending = [...assets];
  while (pending.length) {
    const batch = pending.splice(0, pending.length).filter((a) => !done.has(a));
    const found = [];
    await runLimited(batch, WARM_CONCURRENCY, async (asset) => {
      done.add(asset);
      let res;
      const stored = await withRetry(async () => {
        res = await cache.match(asset, MATCH);
        if (!res) {
          res = await fetch(asset);
          if (!storable(res)) return false;
          await cache.put(asset, res.clone());
        }
        return true;
      });
      if (!stored) {
        ok = false;
        return;
      }
      try {
        if (asset.split('?')[0].endsWith('.css')) found.push(...staticUrls(await res.clone().text()));
      } catch {
        ok = false;
      }
    });
    pending.push(...found.filter((a) => !done.has(a)));
  }

  if (ok) await cache.put(WARMED_MARKER, new Response('ok', { headers: { 'Content-Type': 'text/plain' } }));
  return ok;
}

self.addEventListener('message', (event) => {
  const data = event.data;
  if (!data || data.type !== 'warm' || !Array.isArray(data.urls)) return;
  const source = event.source;
  event.waitUntil(
    warm(data.urls.filter((u) => typeof u === 'string' && u.startsWith('/'))).then((ok) => {
      if (source) source.postMessage({ type: 'warmed', ok, cache: CACHE });
    }),
  );
});
