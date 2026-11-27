// Everything a change must pass, on this machine: the checks GitHub runs on a pull request (.github/workflows/ci.yml),
// with the browser tests on the regular build as well. Stops at the first step that fails. PW_PORT sets the port of the browser tests, as in playwright.config.ts.
import { spawnSync } from 'node:child_process';

const STEPS = [
  ['Lint', 'npm run lint'],
  ['Content validation', 'npm run validate-content'],
  ['Unit tests', 'npm test'],
  ['Production build', 'npm run build'],
  ['Type check', 'npx tsc --noEmit -p .'],
  ['Browser tests, regular build', 'npx playwright test'],
  ['Browser tests, static export', 'npx playwright test', { PW_EXPORT: '1' }],
];

const started = Date.now();
for (const [name, command, env] of STEPS) {
  console.log(`\n=== ${name} ===`);
  const run = spawnSync(command, { stdio: 'inherit', shell: true, env: { ...process.env, ...env } });
  if (run.status !== 0) {
    console.error(`\nFailed: ${name}. Not ready to release.`);
    process.exit(run.status ?? 1);
  }
}
const commit = spawnSync('git rev-parse --short HEAD', { shell: true, encoding: 'utf8' }).stdout.trim();
console.log(`\nAll checks passed on ${commit} in ${Math.round((Date.now() - started) / 60000)} minutes. Ready for a pull request.`);
