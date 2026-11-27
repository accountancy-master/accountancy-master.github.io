import { ALL_PACKS, COURSES } from '@/content/registry';
import { validatePack } from '@/content/validate';
import GLOSSARY_11 from '@/content/glossary/cbse11';
import GLOSSARY_12 from '@/content/glossary/cbse12';
import TIPS_11 from '@/content/glossary/tips11';
import TIPS_12 from '@/content/glossary/tips12';
import { glossaryCourseOf, validateGlossary, validateTips } from '@/content/glossary/validate';
import { TEMPLATES } from '@/generators';
import PRACTICAL_11 from '@/content/practical/cbse11';
import PRACTICAL_12 from '@/content/practical/cbse12';
import { practicalCourseOf, validatePractical } from '@/content/practical/validate';

let failed = false;
const fail = (heading: string, errors: string[]) => {
  failed = true;
  console.error(`${heading}:`);
  for (const e of errors) console.error(`  ${e}`);
};

for (const pack of ALL_PACKS) {
  const errors = validatePack(pack);
  const topic = COURSES.flatMap((c) => c.topics).find((t) => t.id === pack.topicId);
  if (!topic) errors.push(`pack ${pack.topicId} is not a topic of any course`);
  if (errors.length) fail(pack.topicId, errors);
  else console.log(`${pack.topicId}: ${pack.levels.length > 0 ? 'ok' : 'ok (no levels yet, not playable)'}`);
}

// A template for a topic that has no pack could never be reached.
const packTopics = new Set(ALL_PACKS.map((p) => p.topicId));
const orphans = TEMPLATES.filter((t) => !packTopics.has(t.topicId)).map((t) => `template ${t.id}: no pack for topic ${t.topicId}`);
if (orphans.length) fail('templates', orphans);

// The glossary and the exam tips of every course (src/content/glossary).
for (const [entries, tips] of [[GLOSSARY_11, TIPS_11], [GLOSSARY_12, TIPS_12]] as const) {
  const course = glossaryCourseOf(tips.courseId);
  const errors = course ? [...validateGlossary(entries, course), ...validateTips(tips, course)] : ['not a course'];
  const count = tips.general.length + tips.sections.reduce((n, s) => n + s.tips.length, 0) + tips.mistakes.length;
  if (errors.length) fail(`glossary and tips of ${tips.courseId}`, errors);
  else console.log(`glossary ${tips.courseId}: ok (${entries.length} terms, ${count} tips)`);
}

// The project work and the viva bank of every course (src/content/practical); its figures are checked by unit tests.
for (const practical of [PRACTICAL_11, PRACTICAL_12]) {
  const course = practicalCourseOf(practical.courseId);
  const errors = course ? validatePractical(practical, course) : ['not a course'];
  if (errors.length) fail(`project work of ${practical.courseId}`, errors);
  else console.log(`project work ${practical.courseId}: ok (${practical.options.length} options, ${practical.viva.length} viva questions)`);
}

process.exit(failed ? 1 : 0);
