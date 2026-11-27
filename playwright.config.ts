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
  retries: 0,
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
  // Workers: 4 only when the tests run in an installed, signed browser (Edge or Chrome), 2 otherwise. The downloaded
  // Chromium stalled page loads more often the more browsers ran at once (4 workers failed 3 of 3 full runs, all
  // `page.goto` timeouts), while with the signed Edge 3 of 3 full runs passed at 4 workers, about 35% faster.
  // Later runs at 4 workers still showed an occasional stalled page load even with Edge (about 1 failure in 2
  // full runs), so the suite stays at 2, where Edge passed 5 of 5 full runs.
  workers: 2,
  use: {
    baseURL: `http://localhost:${port}`,
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
    url: `http://localhost:${port}`,
    reuseExistingServer: false,
    timeout: 180_000,
    // The test build has its own output folder and never touches the normal build in .next.
    env: exported ? { NEXT_PUBLIC_E2E: '1', AM_EXPORT: '1', AM_DIST_DIR: 'out-e2e' } : { NEXT_PUBLIC_E2E: '1', AM_DIST_DIR: '.next-e2e' },
  },
});
