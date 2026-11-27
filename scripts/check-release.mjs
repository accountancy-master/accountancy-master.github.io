// Everything a change must pass, on this machine: the checks GitHub runs on a pull request (.github/workflows/ci.yml).
// The quick checks run at once, side by side; then the browser tests run against the static export, which is what
// GitHub Pages serves (Playwright makes that build itself, so there is no separate build step). Stops when a step
// fails. PW_PORT sets the port of the browser tests and PW_WORKERS how many run at once, as in playwright.config.ts.
import { spawn } from 'node:child_process';

const QUICK = [
  ['Lint', 'npm run lint'],
  ['Content validation', 'npm run validate-content'],
  ['Unit tests', 'npm test'],
  ['Type check', 'npx next typegen && npx tsc --noEmit -p .'],
];
const BROWSER = ['Browser tests, static export', 'npx playwright test', { PW_EXPORT: '1' }];

/** Runs a command. Side by side, its output is shown only if it fails, so the lines of different steps do not mix. */
function run([name, command, env], { live = false } = {}) {
  return new Promise((resolve) => {
    const started = Date.now();
    const child = spawn(command, { shell: true, env: { ...process.env, ...env }, stdio: live ? 'inherit' : 'pipe' });
    let output = '';
    if (!live) for (const stream of [child.stdout, child.stderr]) stream.on('data', (d) => (output += d));
    child.on('close', (code) => {
      if (!live && code !== 0) process.stdout.write(`\n=== ${name}: output ===\n${output}\n`);
      console.log(`${code === 0 ? 'passed' : 'FAILED'}  ${name} (${Math.round((Date.now() - started) / 1000)} s)`);
      resolve(code ?? 1);
    });
  });
}

const started = Date.now();
console.log(`=== Quick checks, side by side: ${QUICK.map(([name]) => name).join(', ')} ===`);
const codes = await Promise.all(QUICK.map((step) => run(step)));
if (codes.some((code) => code !== 0)) {
  console.error('\nA quick check failed (its output is above). Not ready.');
  process.exit(1);
}
console.log(`\n=== ${BROWSER[0]} ===`);
if ((await run(BROWSER, { live: true })) !== 0) {
  console.error(`\nFailed: ${BROWSER[0]}. Not ready.`);
  process.exit(1);
}
console.log(`\nAll checks passed in ${Math.round((Date.now() - started) / 60000)} minutes. Ready for a pull request.`);
