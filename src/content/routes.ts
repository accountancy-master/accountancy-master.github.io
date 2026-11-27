import { E2E_SAMPLE_ROUTES } from '@/testing/e2eSampleRoutes';
import { CATALOGUE_TOPICS } from './catalogue.generated';

/**
 * The topics that have pages (a topic page, a quick sheet, a practice page, a marathon, and a page for each level):
 * the playable topics of every course. The test build of the app has the pages of the sample topic of Class 12 as
 * well, which a test switches on (testing/e2eCourse.ts); NEXT_PUBLIC_E2E is a build-time constant, so a normal build
 * has the catalogue alone.
 */
export const ROUTE_TOPICS: readonly { readonly id: string; readonly levelIds: readonly string[] }[] =
  process.env.NEXT_PUBLIC_E2E === '1' ? [...CATALOGUE_TOPICS, E2E_SAMPLE_ROUTES] : CATALOGUE_TOPICS;
