// The pages the sample topic of Class 12 needs in the test build of the app (NEXT_PUBLIC_E2E): its id and the ids of
// its levels, written out so that the pages which list routes need none of the sample's code. A unit test holds them
// to the pack (testing/class12Topic.ts).

export const E2E_SAMPLE_TOPIC = 'class-12-sample';

export const E2E_SAMPLE_ROUTES: { readonly id: string; readonly levelIds: readonly string[] } = {
  id: E2E_SAMPLE_TOPIC,
  levelIds: [
    'class-12-sample-level-0',
    'class-12-sample-level-1',
    'class-12-sample-level-2',
    'class-12-sample-level-3',
    'class-12-sample-level-4',
    'class-12-sample-formats-1',
    'class-12-sample-formats-2',
  ],
};

/** The key under which the test build remembers, on a device, that the sample topic is switched on. */
export const E2E_CLASS12_KEY = 'am.e2e.class12';
