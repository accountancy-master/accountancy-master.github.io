import fs from 'node:fs';
import path from 'node:path';
import type { APIRequestContext } from '@playwright/test';
import { PACKS } from '../src/content/registry';
import { CASE_STAGES, TEMPLATES } from '../src/generators';

// Which scripts of the build hold the content of which topic. The build names its scripts by hash, so they are
// recognised by what is in them: the build lists its assets for the service worker (scripts/list-assets.mjs), and a
// script that holds the templates, the pack or the cases of a topic names their ids. The scripts every page loads
// name the ids of all topics (the generated outline and catalogue); the content of a topic names its own alone.

/**
 * A few ids that only the content of a topic (and the outline of all of them) names: of its templates, which its
 * pack lists too, and of the cases of every stage it closes.
 */
function idsOf(topicId: string): string[] {
  return [
    ...TEMPLATES.filter((t) => t.topicId === topicId).slice(0, 5).map((t) => t.id),
    ...CASE_STAGES.filter((s) => s.topicId === topicId).flatMap((s) => s.cases.slice(0, 2).map((c) => c.id)),
  ];
}

/** Where the build under test keeps what it serves as /_next/static (see playwright.config.ts): its build id names a folder there. */
const STATIC = process.env.PW_EXPORT === '1' ? path.join('out-e2e', '_next', 'static') : path.join('.next-e2e', 'static');

const names = (script: string, id: string) => script.includes(`"${id}"`) || script.includes(`'${id}'`) || script.includes(`\`${id}\``);

export interface ContentChunks {
  /** Every script of the build, by address. */
  all: string[];
  /** The scripts that hold content of one topic, by topic: its templates, its pack, the cases of each stage it closes. */
  byTopic: Map<string, string[]>;
  /** Every script that holds the content of some topic. */
  content: Set<string>;
  /** The topic whose content a script holds, when it holds any. */
  topicOf(url: string): string | undefined;
}

let found: Promise<ContentChunks> | undefined;

/** Reads the build's list of assets and every script on it, once per test worker. */
export function contentChunks(request: APIRequestContext): Promise<ContentChunks> {
  found ??= (async () => {
    const [buildId] = fs.readdirSync(STATIC).filter((name) => fs.existsSync(path.join(STATIC, name, '_buildManifest.js')));
    if (!buildId) throw new Error(`no build in ${STATIC}`);
    const listed = await request.get(`/_next/static/${buildId}/am-assets.json`);
    if (!listed.ok()) throw new Error('the build has no list of its assets (scripts/list-assets.mjs)');
    const all = ((await listed.json()) as string[]).filter((url) => url.endsWith('.js'));
    const scripts = new Map(await Promise.all(all.map(async (url) => [url, await (await request.get(url)).text()] as const)));

    const topics = PACKS.map((p) => ({ topicId: p.topicId, ids: idsOf(p.topicId) }));
    const topicsNamed = (script: string) => topics.filter((t) => t.ids.some((id) => names(script, id))).map((t) => t.topicId);
    const byTopic = new Map(topics.map((t) => [t.topicId, [] as string[]]));
    const owner = new Map<string, string>();
    // A glossary (src/content/glossary) names topics and concepts, and a concept may share its id with a template: it
    // is not the content of a topic. Its entries are objects with a term and a definition.
    const glossary = (script: string) => /[{,]term:["'`]/.test(script) && /[{,]definition:["'`]/.test(script);
    // So do the board-style written answers (src/content/written), loaded per class, not per topic: their questions
    // have a marking tip and the points they need.
    const written = (script: string) => /[{,]markingTip:["'`]/.test(script) && /[{,]pointsNeeded:\d/.test(script);
    for (const [url, script] of scripts) {
      if (glossary(script) || written(script)) continue;
      const named = topicsNamed(script);
      // No topic: code. Most topics: the outline or the catalogue, which every page has.
      if (named.length === 0 || named.length > topics.length / 2) continue;
      if (named.length > 1) throw new Error(`${url} holds content of several topics (${named.join(', ')}): a topic can no longer be loaded by itself`);
      owner.set(url, named[0]);
      byTopic.get(named[0])!.push(url);
    }
    return { all, byTopic, content: new Set(owner.keys()), topicOf: (url: string) => owner.get(url) };
  })();
  return found;
}
