import { CBSE11 } from '@/content/courses/cbse11';
import { CASES, TEMPLATES } from '@/generators';
import { contentHash } from '@/testing/contentHash';

// Prints the hash of everything the Class 11 generators and cases make (see testing/contentHash.ts). A unit test
// (content/class11Unchanged.test.ts) holds the value: run this after a change to Class 11 content that was meant.
// `npm run content:hash -- 300 100` covers more seeds of every template and case than the test does.
const topics = new Set(CBSE11.topics.map((t) => t.id));
const [templates, cases] = process.argv.slice(2).map(Number);
const seeds = templates > 0 && cases > 0 ? { templates, cases } : undefined;
console.log(contentHash(TEMPLATES.filter((t) => topics.has(t.topicId)), CASES.filter((c) => topics.has(c.topicId)), seeds));
