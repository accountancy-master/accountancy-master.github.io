import fs from 'node:fs';
import path from 'node:path';
import { CARD_TITLES_FILE, CATALOGUE_FILE, LANDING_FILE, OUTLINE_FILE, SAMPLES_FILE, renderCardTitles, renderCatalogue, renderLanding, renderOutline, renderSamples } from '@/content/catalogueSource';

// Writes src/content/catalogue.generated.ts, src/content/outline.generated.ts, src/content/cardTitles.generated.ts,
// src/content/samples.generated.ts and src/content/landing.generated.ts when they are out of date. Runs before `npm run dev`, `npm run build` and `npm test`.
function write(name: string, relative: string, next: string) {
  const file = path.join(process.cwd(), relative);
  const current = fs.existsSync(file) ? fs.readFileSync(file, 'utf8').replace(/\r\n/g, '\n') : null;
  if (current === next) {
    console.log(`${name}: up to date`);
  } else {
    fs.writeFileSync(file, next);
    console.log(`${name}: written (${next.split('\n').length} lines)`);
  }
}

write('catalogue', CATALOGUE_FILE, renderCatalogue());
write('outline', OUTLINE_FILE, renderOutline());
write('card titles', CARD_TITLES_FILE, renderCardTitles());
write('samples', SAMPLES_FILE, renderSamples());
write('landing', LANDING_FILE, renderLanding());
