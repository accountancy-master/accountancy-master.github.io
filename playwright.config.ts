import os from 'node:os';
import { defineConfig, devices } from '@playwright/test';

const channel = process.env.PW_CHANNEL ?? (process.platform === 'win32' ? 'msedge' : '');
// PW_EXPORT=1 runs the same tests against the static export (plain files, as deployed), served the way the
// production web server serves them. Without it they run against `next start`.
const exported = process.env.PW_EXPORT === '1';
// PW_PORT lets two runs share a machine (say, two checkouts); 3100 otherwise.
const port = process.env.PW_PORT ?? '3100';

export default defineConfig({
  testDir: 'e2e',
  fullyParallel: true,
  retries: 1,
  // Only the offline spec needs a real service worker. In every other spec it is blocked, so a test's fresh
  // browser context does not install the worker and run the full cache warm-up against the single server.
  //
  // Which browser: on this Windows machine the unsigned Chromium that Playwright downloads sometimes has a
  // page load stall for 10 s, 20 s or more while several browsers load at once (more often with more workers):
  // the server is idle and answers at once, but only sees the browser's requests after the stall. A bare Node
  // server and a Python server stall the same way, a Node client never does, and the signed Edge and Chrome
  // builds did not stall in the runs measured. So on Windows the tests run in the Edge that ships with the
  // system (it is a Chromium browser, so the same engine). On a Windows machine without Edge, set
  // PW_CHANNEL=chrome to use Chrome, or PW_CHANNEL= (empty) to use the downloaded Chromium.
  //
  // Workers: PW_WORKERS when given; else on GitHub the runner's cores (4), and on a desktop a quarter of its cores, at
  // least 2 and at most 8. Each worker runs its own browser against the one local server. The address is 127.0.0.1,
  // not localhost: on Windows the name can be looked up on IPv6 first, and page loads stalled at times while several
  // browsers ran at once. A test that still fails once is tried again once and reported as flaky, never hidden.
  workers: process.env.PW_WORKERS ? Number(process.env.PW_WORKERS) : process.env.CI ? 4 : Math.min(8, Math.max(2, Math.floor(os.cpus().length / 4))),
  use: {
    baseURL: `http://127.0.0.1:${port}`,
    trace: 'retain-on-failure',
    serviceWorkers: 'block',
    channel: channel || undefined,
  },
  projects: [
    { name: 'phone', testIgnore: /offline\.spec\.ts/, use: { ...devices['Pixel 7'] } },
    {
      name: 'laptop',
      testIgnore: /offline\.spec\.ts/,
      use: { ...devices['Desktop Chrome'], viewport: { width: 1280, height: 800 } },
    },
    {
      name: 'phone-offline',
      testMatch: /offline\.spec\.ts/,
      use: { ...devices['Pixel 7'], serviceWorkers: 'allow' },
    },
    {
      name: 'laptop-offline',
      testMatch: /offline\.spec\.ts/,
      use: { ...devices['Desktop Chrome'], viewport: { width: 1280, height: 800 }, serviceWorkers: 'allow' },
    },
  ],
  webServer: {
    command: exported ? `npm run build && node scripts/serve-export.mjs out-e2e ${port}` : `npm run build && npm run start -- -p ${port}`,
    url: `http://127.0.0.1:${port}`,
    reuseExistingServer: false,
    timeout: 180_000,
    // The test build has its own output folder and never touches the normal build in .next.
    env: exported ? { NEXT_PUBLIC_E2E: '1', AM_EXPORT: '1', AM_DIST_DIR: 'out-e2e' } : { NEXT_PUBLIC_E2E: '1', AM_DIST_DIR: '.next-e2e' },
  },
});
