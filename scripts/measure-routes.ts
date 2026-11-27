// What a first visit downloads, route by route: builds the static export and prints, for each route, the scripts its
// HTML names and their size when compressed (gzip, as the web server sends them), and then what is loaded on demand:
// the content of each topic, which no page names.
//   npm run measure                    build into out/, then measure a sample of routes
//   npm run measure -- --no-build      measure the export that is already there
//   npm run measure -- --scripts       also list every script of every route
//   npm run measure -- /home /mock     measure these routes instead of the sample
// The folder is AM_DIST_DIR, or out/.
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { gzipSync } from 'node:zlib';
import { OUTLINE } from '@/content/outline.generated';

const args = process.argv.slice(2);
const flags = new Set(args.filter((a) => a.startsWith('--')));
const asked = args.filter((a) => !a.startsWith('--'));
const root = path.resolve(process.env.AM_DIST_DIR || 'out');

if (!flags.has('--no-build')) {
  const built = spawnSync('npm', ['run', 'build'], {
    stdio: ['ignore', 'ignore', 'inherit'],
    shell: true,
    env: { ...process.env, AM_EXPORT: '1', AM_DIST_DIR: path.basename(root) },
  });
  if (built.status !== 0) process.exit(built.status ?? 1);
}
if (!existsSync(path.join(root, 'index.html'))) {
  console.error(`No static export in ${root}. Run without --no-build.`);
  process.exit(1);
}

/** Every file under a folder, as paths relative to it with forward slashes. */
function filesUnder(dir: string, prefix = ''): string[] {
  return readdirSync(dir).flatMap((name) => {
    const file = path.join(dir, name);
    return statSync(file).isDirectory() ? filesUnder(file, `${prefix}${name}/`) : [`${prefix}${name}`];
  });
}

const texts = new Map<string, string>();
/** A build asset as text, by its URL path. */
function textOf(url: string): string {
  if (!texts.has(url)) texts.set(url, readFileSync(path.join(root, decodeURIComponent(url)), 'utf8'));
  return texts.get(url)!;
}

const sizes = new Map<string, number>();
/** The gzip size of a build asset, by its URL path. */
function gzipSize(url: string): number {
  if (!sizes.has(url)) sizes.set(url, gzipSync(readFileSync(path.join(root, decodeURIComponent(url)))).length);
  return sizes.get(url)!;
}

const htmlOf = (route: string) => (route === '/' ? 'index.html' : `${route.slice(1)}.html`);

/** The scripts a page loads: the `src` of every script tag of its HTML, each once. */
function scriptsOf(route: string): string[] {
  const html = readFileSync(path.join(root, htmlOf(route)), 'utf8');
  return [...new Set([...html.matchAll(/<script\b[^>]*\bsrc="([^"]+)"/g)].map((m) => m[1].split('?')[0]))];
}

const kb = (bytes: number) => `${(bytes / 1000).toFixed(1)} KB`;
const total = (urls: Iterable<string>) => [...urls].reduce((sum, url) => sum + gzipSize(url), 0);

// One page of each kind: the first topic, level and case stage stand for the others.
const pages = filesUnder(root).filter((f) => f.endsWith('.html')).map((f) => `/${f.slice(0, -'.html'.length)}`);
const firstOf = (prefix: string) => pages.filter((p) => p.startsWith(prefix)).sort()[0];
const SAMPLE = [
  '/',
  '/home',
  '/topics',
  '/practice',
  '/progress',
  '/settings',
  '/cases',
  '/mock',
  '/mistakes',
  '/practice/topic',
  '/practice/marathon',
  firstOf('/topics/'),
  firstOf('/sheet/'),
  firstOf('/play/'),
  pages.find((p) => p.startsWith('/play/') && p.endsWith('-look-back')),
  '/practice/smart',
  firstOf('/practice/topic/'),
  '/practice/marathon/all',
  '/practice/marathon/mix',
  '/playground',
  firstOf('/cases/play/'),
  '/mock/paper',
].filter((route): route is string => route !== undefined);

const routes = asked.length > 0 ? asked : SAMPLE;
const opening = total(scriptsOf('/'));
console.log(`Scripts named by each page of ${path.basename(root)}/, gzip:`);
for (const route of routes) {
  if (!existsSync(path.join(root, htmlOf(route)))) {
    console.log(`  ${route.padEnd(44)} no such page`);
    continue;
  }
  const scripts = scriptsOf(route);
  const size = total(scripts);
  const more = route === '/' ? '' : `  (opening screen ${size >= opening ? '+' : '-'}${kb(Math.abs(size - opening))})`;
  console.log(`  ${route.padEnd(44)} ${String(scripts.length).padStart(3)} scripts ${kb(size).padStart(10)}${more}`);
  if (flags.has('--scripts')) for (const url of scripts) console.log(`      ${kb(gzipSize(url)).padStart(10)}  ${url}`);
}

// Scripts no page names are fetched only when the app asks for them (`import()`): the content of the topics.
const named = new Set(pages.flatMap(scriptsOf));
const everyScript = filesUnder(path.join(root, '_next', 'static'))
  .filter((f) => f.endsWith('.js'))
  .map((f) => `/_next/static/${f}`)
  .filter((url) => !/\/_[A-Za-z]+Manifest\.js$/.test(url));
const onDemand = everyScript.filter((url) => !named.has(url));

// What is fetched together: for each `import()` the bundler writes the scripts it needs and the module it gives.
// The script that holds that module is the one the `import()` is for; the others are what that one needs.
const IMPORT = /Promise\.all\(\[((?:"static\/chunks\/[^"]+",?)+)\]\.map\([^)]*\)\)\)\.then\(\(\)=>\w+\((\d+)\)\)/g;
const holds = (url: string, moduleId: string) => new RegExp(`[\\[,]${moduleId},(?:\\(|[A-Za-z_$])`).test(textOf(url));
const imports = new Map<string, { entry: string | undefined; scripts: string[] }>();
for (const url of everyScript) {
  for (const m of textOf(url).matchAll(IMPORT)) {
    if (imports.has(m[2])) continue;
    const scripts = [...m[1].matchAll(/"(static\/chunks\/[^"]+)"/g)].map((x) => `/_next/${x[1]}`);
    imports.set(m[2], { entry: scripts.find((script) => holds(script, m[2])), scripts });
  }
}

// A script holds the content of a topic when it names ids of that topic's templates or cases, and of no other's.
const says = (url: string, id: string) => textOf(url).includes(`"${id}"`);
const idsOf = (topicId: string): string[] => [
  ...(OUTLINE.topics.find((t) => t.id === topicId)?.templates.slice(0, 5).map((t) => t[0]) ?? []),
  ...OUTLINE.stages.filter((s) => s.topicId === topicId).flatMap((s) => s.cases.slice(0, 2).map((c) => c[0])),
];
const topicIds = OUTLINE.topics.map((t) => t.id);
const topicsOf = (url: string) => topicIds.filter((topicId) => idsOf(topicId).some((id) => says(url, id)));
const ownerOf = new Map(onDemand.flatMap((url) => {
  const topics = topicsOf(url);
  return topics.length === 1 ? [[url, topics[0]] as const] : [];
}));

console.log(`\nLoaded on demand (named by no page), gzip: ${onDemand.length} scripts, ${kb(total(onDemand))} in all`);
const topicPage = total(scriptsOf(firstOf('/topics/')));
const shared = new Map<string, number>();
for (const topicId of topicIds) {
  const own = onDemand.filter((url) => ownerOf.get(url) === topicId);
  // With its own scripts come the ones their `import()` lists beside them: code that several topics share, and for
  // a stage whose cases are made with another topic's generators, those.
  const fetched = new Set([...own, ...[...imports.values()].filter((i) => i.entry !== undefined && own.includes(i.entry)).flatMap((i) => i.scripts)]);
  const others = [...fetched].filter((url) => !own.includes(url));
  for (const url of others) shared.set(url, (shared.get(url) ?? 0) + 1);
  const foreign = others.filter((url) => ownerOf.has(url)).map((url) => ownerOf.get(url));
  console.log(
    `  ${topicId.padEnd(28)} ${String(own.length).padStart(2)} scripts ${kb(total(own)).padStart(9)}` +
      `  with what they share ${kb(total(fetched)).padStart(9)}  topic page and content ${kb(topicPage + total(fetched)).padStart(9)}` +
      (foreign.length > 0 ? `  (also loads scripts of ${[...new Set(foreign)].join(', ')})` : ''),
  );
  if (flags.has('--scripts')) for (const url of fetched) console.log(`      ${kb(gzipSize(url)).padStart(10)}  ${url}${own.includes(url) ? '' : '  (shared)'}`);
}
const unowned = onDemand.filter((url) => !ownerOf.has(url));
console.log(`  shared by topics, or not content: ${unowned.length} scripts, ${kb(total(unowned))}`);
if (flags.has('--scripts')) for (const url of unowned) console.log(`      ${kb(gzipSize(url)).padStart(10)}  ${url}  (fetched with ${shared.get(url) ?? 0} topics)`);
console.log(`Every script of the build: ${kb(total(everyScript))}`);
