import type { Metadata } from 'next';
import { Landing } from '@/components/landing/Landing';
import { LANDING_TOTALS } from '@/content/landing.generated';

const TITLE = 'Accountancy Master: see the accounts balance themselves';
const DESCRIPTION = `Free, open-source practice for CBSE Accountancy, Class 11 and Class 12: ${LANDING_TOTALS.topics} topics, lessons in steps, questions made fresh each time, simulator labs, written answers and mock papers. No sign-up, no ads, works offline.`;

export const metadata: Metadata = {
  title: { absolute: TITLE },
  description: DESCRIPTION,
  alternates: { canonical: '/' },
  openGraph: {
    type: 'website',
    url: '/',
    siteName: 'Accountancy Master',
    title: TITLE,
    description: DESCRIPTION,
    locale: 'en_IN',
  },
  twitter: { card: 'summary_large_image', title: TITLE, description: DESCRIPTION },
};

/** The landing page. The first screen of the app (who is learning) is /start. */
export default function LandingPage() {
  return <Landing />;
}
