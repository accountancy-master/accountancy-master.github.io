'use client';

import { useEffect, useSyncExternalStore } from 'react';
import { CATALOGUE_CASE_STAGES, CATALOGUE_TOPICS } from '@/content/catalogue.generated';
import { PRACTICE_MODES } from '@/play/practiceModes';

declare global {
  interface Window {
    __offlineReady?: boolean;
  }
}

const READY_EVENT = 'am:offline-ready';

// Set at build time (next.config.ts). The worker is registered as /sw.js?v=<id> and names its cache
// `am-<id>` from that parameter, so a new build installs a new worker with a new cache. Keep the
// fallback name in sync with public/sw.js.
const BUILD_ID = process.env.AM_BUILD_ID;
const CACHE_NAME = BUILD_ID ? `am-${BUILD_ID}` : 'am-unversioned';
const WORKER_URL = BUILD_ID ? `/sw.js?v=${BUILD_ID}` : '/sw.js';
// Written by the worker as the last step of a fully successful warm-up (see public/sw.js).
const WARMED_MARKER = '/_am/warmed';
// The page shown for a path that is not stored (public/offline.html). Keep in sync with public/sw.js.
const OFFLINE_PAGE = '/offline.html';

/**
 * Every page to store for offline use. Built from the generated catalogue (ids only), so the root layout imports no
 * topic pack and no generator: the app's weight in the first load does not grow with its content.
 */
export function appRoutes(): string[] {
  return [
    // The landing page, and the first screen of the app (who is learning).
    '/',
    '/start',
    '/topics',
    '/progress',
    '/settings',
    '/home',
    '/practice',
    ...PRACTICE_MODES.map((m) => `/practice/${m}`),
    '/practice/topic',
    '/practice/marathon',
    // 'all' is the run over every topic the learner has played (MARATHON_ALL in learning/marathon.ts), 'mix' the run
    // over the topics chosen (MARATHON_MIX in learning/marathonMix.ts).
    ...['all', 'mix', ...CATALOGUE_TOPICS.map((t) => t.id)].map((scope) => `/practice/marathon/${scope}`),
    // Every pattern and every mix: what is played is in the query string.
    '/playground',
    '/mistakes',
    '/cases',
    // 'mixed' is the page that takes a case from any open stage (MIXED_CASES in learning/caseStudies.ts).
    ...['mixed', ...CATALOGUE_CASE_STAGES].map((id) => `/cases/play/${id}`),
    '/mock',
    // One page for every mock paper: which paper comes in the query string, and pages are stored by path alone.
    '/mock/paper',
    // The revision tools and the simulator (which lab, and which mode, come in the query string).
    '/sheets',
    '/glossary',
    '/inside',
    '/maps',
    '/exam',
    '/practical',
    '/worksheets',
    '/worksheets/sheet',
    '/simulator',
    // Written answers, and a practice of each topic's and of every question to rewrite ('rewrite' is WRITTEN_REWRITE
    // in content/written/practice.ts).
    '/written',
    ...['rewrite', ...CATALOGUE_TOPICS.map((t) => t.id)].map((scope) => `/written/${scope}`),
    OFFLINE_PAGE,
    ...CATALOGUE_TOPICS.map((t) => `/topics/${t.id}`),
    ...CATALOGUE_TOPICS.map((t) => `/sheet/${t.id}`),
    ...CATALOGUE_TOPICS.map((t) => `/maps/${t.id}`),
    ...CATALOGUE_TOPICS.map((t) => `/practice/topic/${t.id}`),
    ...CATALOGUE_TOPICS.flatMap((t) => t.levelIds.map((id) => `/play/${id}`)),
  ];
}

function markReady() {
  window.__offlineReady = true;
  window.dispatchEvent(new Event(READY_EVENT));
}

/** True only if this build's cache exists, holds the home page, the offline page and build assets, and finished a warm-up. */
async function cacheIsWarm(): Promise<boolean> {
  try {
    if (!(await caches.has(CACHE_NAME))) return false;
    const cache = await caches.open(CACHE_NAME);
    const needed = [WARMED_MARKER, '/', OFFLINE_PAGE];
    for (const path of needed) if (!(await cache.match(path, { ignoreVary: true }))) return false;
    return (await cache.keys()).some((r) => new URL(r.url).pathname.startsWith('/_next/static/'));
  } catch {
    return false;
  }
}

/** Resolves with the worker once it is active, or null if it was replaced before getting there. */
async function activated(registration: ServiceWorkerRegistration): Promise<ServiceWorker | null> {
  const worker = registration.installing ?? registration.waiting ?? registration.active;
  if (!worker) return null;
  if (worker.state !== 'activated' && worker.state !== 'redundant') {
    await new Promise<void>((resolve) => {
      const onChange = () => {
        if (worker.state !== 'activated' && worker.state !== 'redundant') return;
        worker.removeEventListener('statechange', onChange);
        resolve();
      };
      worker.addEventListener('statechange', onChange);
    });
  }
  return worker.state === 'activated' ? worker : null;
}

/** True once every page and its assets are stored for offline use. */
export function useOfflineReady(): boolean {
  return useSyncExternalStore(
    (notify) => {
      window.addEventListener(READY_EVENT, notify);
      return () => window.removeEventListener(READY_EVENT, notify);
    },
    () => window.__offlineReady === true,
    () => false,
  );
}

/** Registers the service worker (production only) and asks it to store the whole app for offline use. */
export function ServiceWorker() {
  useEffect(() => {
    if (process.env.NODE_ENV !== 'production' || !('serviceWorker' in navigator)) return;
    const container = navigator.serviceWorker;

    const onMessage = (e: MessageEvent) => {
      // Only this build's own cache counts: an older worker still answering must not mark us ready.
      if (e.data?.type !== 'warmed' || e.data.ok !== true || e.data.cache !== CACHE_NAME) return;
      markReady();
    };
    container.addEventListener('message', onMessage);

    void (async () => {
      try {
        const registration = await container.register(WORKER_URL);
        const worker = await activated(registration);
        if (!worker) return;
        // This build's cache already finished a warm-up earlier: trust that only while it really is complete
        // (it may have been evicted, or a worker update may have started a new, empty one).
        if (await cacheIsWarm()) {
          markReady();
          return;
        }
        worker.postMessage({ type: 'warm', urls: appRoutes() });
      } catch {
        // No worker (blocked or unsupported): the app simply stays online-only.
      }
    })();

    return () => container.removeEventListener('message', onMessage);
  }, []);

  return null;
}
