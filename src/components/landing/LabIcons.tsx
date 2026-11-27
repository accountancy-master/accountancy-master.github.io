import type { ReactNode } from 'react';

// A small object from the accountant's desk for each lab of the simulator, drawn in two inks: the strokes in the
// current colour (navy), the accents in mustard and green. A lab without its own object gets the ledger.

const A = 'var(--lp-mustard)';
const G = 'var(--lp-green)';
const P = 'var(--lp-sheet)';

const ICONS: Record<string, ReactNode> = {
  // Three tanks: what the business owns, owes and holds for its owner.
  equation: (
    <>
      <rect x="4" y="14" width="11" height="26" rx="2" fill={P} />
      <rect x="4" y="22" width="11" height="18" rx="2" fill={G} stroke="none" opacity=".85" />
      <rect x="4" y="14" width="11" height="26" rx="2" />
      <rect x="19" y="20" width="11" height="20" rx="2" fill={A} stroke="none" opacity=".9" />
      <rect x="19" y="14" width="11" height="26" rx="2" />
      <rect x="34" y="27" width="11" height="13" rx="2" fill={G} stroke="none" opacity=".55" />
      <rect x="34" y="14" width="11" height="26" rx="2" />
      <path d="M16.5 27h1M31.5 25h1" strokeWidth="3" />
    </>
  ),
  // A T-account with entries on both sides.
  posting: (
    <>
      <rect x="5" y="7" width="38" height="34" rx="3" fill={P} />
      <path d="M5 15h38M24 15v26" />
      <path d="M9 21h10M9 27h8M28 21h11" stroke={G} />
      <path d="M14 11h20" strokeWidth="2.5" />
    </>
  ),
  // The book value falling, year by year.
  depreciation: (
    <>
      <path d="M6 6v36h36" />
      <rect x="10" y="12" width="6" height="30" fill={A} stroke="none" />
      <rect x="19" y="20" width="6" height="22" fill={A} stroke="none" opacity=".8" />
      <rect x="28" y="27" width="6" height="15" fill={A} stroke="none" opacity=".65" />
      <rect x="37" y="32" width="5" height="10" fill={A} stroke="none" opacity=".5" />
      <path d="M11 10c8 4 16 12 30 20" stroke={G} />
    </>
  ),
  // A cheque.
  'bank-reconciliation': (
    <>
      <rect x="3" y="12" width="42" height="24" rx="2" fill={P} />
      <path d="M8 19h16M8 25h22" />
      <path d="M33 30c2-3 3 1 5-1s2-2 4 0" stroke={G} />
      <rect x="32" y="16" width="9" height="6" rx="1" fill={A} stroke="none" />
      <path d="M8 31h14" strokeDasharray="2 2" />
    </>
  ),
  // A balance with Dr and Cr pans.
  'trial-balance-scale': (
    <>
      <path d="M24 8v30M14 42h20M8 14h32" />
      <path d="M8 14l-5 12h10zM40 14l-5 12h10z" fill={A} />
      <circle cx="24" cy="8" r="2.5" fill={G} />
    </>
  ),
  // A ledger page under a magnifying glass.
  'trial-balance-fix': (
    <>
      <rect x="5" y="5" width="26" height="34" rx="2" fill={P} />
      <path d="M10 12h16M10 18h16M10 24h10" />
      <circle cx="30" cy="29" r="8" fill={P} />
      <path d="M36 35l7 7" strokeWidth="3.5" />
      <path d="M27 29h6" stroke="var(--lp-pen)" strokeWidth="2.5" />
    </>
  ),
  // Three statements, one on another.
  'final-accounts': (
    <>
      <rect x="13" y="4" width="26" height="30" rx="2" fill={P} />
      <rect x="9" y="9" width="26" height="30" rx="2" fill={P} />
      <rect x="5" y="14" width="26" height="30" rx="2" fill={P} />
      <path d="M18 18v22M9 22h18" />
      <path d="M9 37h7M20 37h7" stroke={G} strokeWidth="2.5" />
    </>
  ),
  // A profit shared out.
  partnership: (
    <>
      <circle cx="24" cy="24" r="17" fill={P} />
      <path d="M24 24V7a17 17 0 0 1 14.7 25.5z" fill={A} />
      <path d="M24 24l14.7 8.5A17 17 0 0 1 10 34z" fill={G} opacity=".7" />
      <circle cx="24" cy="24" r="17" />
    </>
  ),
  // A share certificate with a seal.
  shares: (
    <>
      <rect x="4" y="8" width="40" height="30" rx="2" fill={P} />
      <rect x="8" y="12" width="32" height="22" rx="1" strokeDasharray="2 2" />
      <path d="M13 19h16M13 24h12" />
      <circle cx="33" cy="30" r="5" fill={A} />
      <path d="M31 35l-1 6 3-2 3 2-1-6" fill={A} />
    </>
  ),
  // A tank with cash flowing in and out.
  'cash-flow': (
    <>
      <path d="M2 12h10v6" stroke={G} strokeWidth="3" />
      <rect x="10" y="16" width="28" height="24" rx="3" fill={P} />
      <path d="M10 28c5-2 9 2 14 0s9-2 14 0v9a3 3 0 0 1-3 3H13a3 3 0 0 1-3-3z" fill="#5aa9e6" stroke="none" opacity=".75" />
      <rect x="10" y="16" width="28" height="24" rx="3" />
      <path d="M38 34h8v6" stroke="var(--lp-pen)" strokeWidth="3" />
    </>
  ),
  // A dial gauge.
  ratios: (
    <>
      <path d="M6 32a18 18 0 0 1 36 0" fill={P} />
      <path d="M6 32a18 18 0 0 1 36 0z" />
      <path d="M10 26l3 1.5M24 14v3.5M38 26l-3 1.5" />
      <path d="M24 32l9-11" stroke="var(--lp-pen)" strokeWidth="3" />
      <circle cx="24" cy="32" r="3" fill={A} />
      <path d="M8 38h32" />
    </>
  ),
  // A row of books of original entry.
  'books-of-entry': (
    <>
      <path d="M5 42h38" />
      <rect x="7" y="12" width="8" height="30" rx="1" fill={G} opacity=".8" />
      <rect x="16" y="8" width="8" height="34" rx="1" fill={A} />
      <rect x="25" y="14" width="8" height="28" rx="1" fill={P} />
      <path d="M34 16l7-2 4 27-7 1z" fill={P} />
      <path d="M9 18h4M18 14h4M27 20h4" />
    </>
  ),
  // A torn page: books not kept in full.
  'incomplete-records': (
    <>
      <path d="M8 5h24l8 8v14l-4 3 3 4-4 3 3 4-3 3H8z" fill={P} />
      <path d="M32 5v8h8" />
      <path d="M13 15h14M13 21h18M13 27h10" />
      <path d="M13 33h8" stroke={G} strokeWidth="2.5" />
    </>
  ),
  // A shop's front, its name worth something.
  goodwill: (
    <>
      <path d="M6 20h36v22H6z" fill={P} />
      <path d="M4 20l4-12h32l4 12z" fill={A} />
      <path d="M4 20c2 4 6 4 8 0 2 4 6 4 8 0 2 4 6 4 8 0 2 4 6 4 8 0 2 4 6 4 8 0" />
      <rect x="20" y="29" width="8" height="13" fill={G} opacity=".75" />
      <path d="M24 2l1.5 3 3.3.4-2.4 2.3.6 3.3L24 9.4 21 11l.6-3.3-2.4-2.3 3.3-.4z" fill={A} />
    </>
  ),
  // A shutter coming down.
  dissolution: (
    <>
      <rect x="6" y="8" width="36" height="34" rx="2" fill={P} />
      <path d="M6 14h36M6 19h36M6 24h36M6 29h36" />
      <rect x="20" y="31" width="8" height="6" rx="1" fill={A} />
      <path d="M22 31v-2a2 2 0 0 1 4 0v2" />
      <path d="M2 42h44" strokeWidth="3" />
    </>
  ),
  // A bond with coupons to tear off.
  debentures: (
    <>
      <rect x="4" y="10" width="28" height="28" rx="2" fill={P} />
      <path d="M9 17h18M9 22h14" />
      <path d="M32 10h12v28H32" fill={A} />
      <path d="M32 19h12M32 28h12" strokeDasharray="2 2" />
      <path d="M9 31h10" stroke={G} strokeWidth="2.5" />
    </>
  ),
  // A company's office, with its statement.
  'company-statements': (
    <>
      <path d="M6 42V14l14-8v36" fill={P} />
      <path d="M20 42V18h16v24" fill={P} />
      <path d="M10 18h5M10 24h5M10 30h5M24 24h8M24 30h8" />
      <path d="M2 42h44" />
      <rect x="33" y="8" width="11" height="14" rx="1" fill={A} />
      <path d="M36 12h5M36 16h5" />
    </>
  ),
  // A grid of cells with a formula.
  spreadsheet: (
    <>
      <rect x="4" y="8" width="40" height="32" rx="2" fill={P} />
      <path d="M4 16h40M4 24h40M4 32h40M16 8v32M30 8v32" />
      <rect x="30" y="32" width="14" height="8" fill={A} stroke="none" opacity=".9" />
      <path d="M7 12.5h5" stroke={G} strokeWidth="2.5" />
    </>
  ),
};

const LEDGER = (
  <>
    <rect x="8" y="5" width="32" height="38" rx="2" fill={P} />
    <path d="M14 5v38M18 13h17M18 19h17M18 25h12" />
  </>
);

/** The object of a lab. */
export function LabIcon({ id }: { id: string }) {
  return (
    <svg className="lp-labicon" viewBox="0 0 48 48" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {ICONS[id] ?? LEDGER}
    </svg>
  );
}
