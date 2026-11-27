import pkg from '../../../package.json';
import { SettingsView } from '@/components/settings/SettingsView';
import { Shell } from '@/components/ui/Shell';

// Test-only tools. NEXT_PUBLIC_E2E is a build-time constant, so in a normal build this branch is dead code
// and the dynamic imports (the components and their text) are left out of the output entirely.
async function loadE2eTools() {
  if (process.env.NEXT_PUBLIC_E2E !== '1') return null;
  const [{ E2ePassLevels }, { E2eMultiline }, { E2eCase }, { E2eMockClock }, { E2eJournalSet }, { E2eFormats }, { E2eClass12 }, { E2eChallengeClock }] = await Promise.all([
    import('@/components/settings/E2ePassLevels'),
    import('@/components/settings/E2eMultiline'),
    import('@/components/settings/E2eCase'),
    import('@/components/settings/E2eMockClock'),
    import('@/components/settings/E2eJournalSet'),
    import('@/components/settings/E2eFormats'),
    import('@/components/settings/E2eClass12'),
    import('@/components/settings/E2eChallengeClock'),
  ]);
  return { E2ePassLevels, E2eMultiline, E2eCase, E2eMockClock, E2eJournalSet, E2eFormats, E2eClass12, E2eChallengeClock };
}

export default async function SettingsPage() {
  const tools = await loadE2eTools();
  return (
    <Shell>
      <SettingsView version={pkg.version} />
      {tools ? (
        <>
          <tools.E2ePassLevels />
          <tools.E2eMockClock />
          <tools.E2eChallengeClock />
          <tools.E2eMultiline />
          <tools.E2eCase />
          <tools.E2eJournalSet />
          <tools.E2eFormats />
          <tools.E2eClass12 />
        </>
      ) : null}
    </Shell>
  );
}
