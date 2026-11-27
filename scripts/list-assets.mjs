// Lists the build's static assets for the service worker. Runs after every `npm run build` (the `postbuild` script).
//
// The worker stores the whole app for offline use (public/sw.js). It finds most build assets by reading the pages it
// stores, but the parts that are fetched only when the app asks for them (the content of a topic, loaded when the
// topic is opened) are named by no page. So the build writes down every file it put under /_next/static/, and the
// worker stores them all. The list goes into the folder Next.js names after the build id, which is part of the
// address: a new build has a new list, and the old one may be cached for ever like the rest of /_next/static/.
//
// The folder is the one the build wrote: AM_DIST_DIR, or out/ for a static export (AM_EXPORT=1), or .next/.
import { existsSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';

/** Keep the name in sync with public/sw.js. */
const LIST_NAME = 'am-assets.json';

const exported = process.env.AM_EXPORT === '1';
const dist = path.resolve(process.env.AM_DIST_DIR || (exported ? 'out' : '.next'));
// An export holds the files as they are served; the build for `next start` serves <dist>/static as /_next/static.
const root = exported ? path.join(dist, '_next', 'static') : path.join(dist, 'static');

if (!existsSync(root)) {
  console.error(`assets: no build in ${root}`);
  process.exit(1);
}

/** Every file under a folder, as paths relative to it with forward slashes (whatever the system writes). */
function filesUnder(dir, prefix = '') {
  return readdirSync(dir).flatMap((name) => {
    const file = path.join(dir, name);
    return statSync(file).isDirectory() ? filesUnder(file, `${prefix}${name}/`) : [`${prefix}${name}`];
  });
}

// The build id is the name of the folder that holds the build manifest.
const buildIds = readdirSync(root).filter((name) => existsSync(path.join(root, name, '_buildManifest.js')));
if (buildIds.length !== 1) {
  console.error(`assets: expected one build in ${root}, found ${buildIds.length}`);
  process.exit(1);
}

const assets = filesUnder(root)
  .filter((file) => path.posix.basename(file) !== LIST_NAME && !file.endsWith('.map'))
  .map((file) => `/_next/static/${file.split('/').map(encodeURIComponent).join('/')}`)
  .sort();
writeFileSync(path.join(root, buildIds[0], LIST_NAME), JSON.stringify(assets));
console.log(`assets: ${assets.length} listed for the service worker`);
