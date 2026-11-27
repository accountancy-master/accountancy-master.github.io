'use client';

import { formatINR, type Paise } from '@/engine/money';
import { count, potName, type PotId, type Story } from '@/simulator/debentures/issue';
import { Arrive } from '../kit/Arrive';

// ---------------------------------------------------------------------------------------------------------------
// The picture of an issue of debentures. Above, one debenture certificate and its three prices on one ruler: what
// the company receives for it, the face value the debentures account shows, and what it must pay on redemption. The
// gaps between them are the whole story: a premium on issue (kept in Securities Premium), a discount (money never
// received) and a premium on redemption (owed over the face value); the discount and the premium on redemption are
// the loss on issue. Below, the accounts of the whole issue as pots that fill and empty as the entries are made.
// Everything drawn is also said in text.
// ---------------------------------------------------------------------------------------------------------------

export const P = 'lab-debentures';
const inr = formatINR;
const pct = (part: number, whole: number) => (whole > 0 ? Math.max(0, Math.min(100, (part / whole) * 100)) : 0);

export function Picture({ s, shown, reduced }: { s: Story; shown: number; reduced: boolean }) {
  return (
    <div data-testid={`${P}-picture`} className="grid min-w-0 gap-3 lg:grid-cols-[minmax(0,5fr)_minmax(0,6fr)]">
      {s.input.route === 'collateral' ? <LoanAndSecurity s={s} shown={shown} reduced={reduced} /> : <Certificate s={s} shown={shown} reduced={reduced} />}
      <Pots s={s} shown={shown} reduced={reduced} />
    </div>
  );
}

/** One row of the ruler: a label, its bar of segments, and the figure. */
function RulerRow({ label, total, segments, max, reduced, testId, note }: { label: string; total: Paise; segments: { width: Paise; cls: string; text: string }[]; max: Paise; reduced: boolean; testId: string; note?: string }) {
  return (
    <div className="flex min-w-0 flex-col gap-0.5" data-testid={testId}>
      <p className="flex flex-wrap items-baseline justify-between gap-x-2 text-sm">
        <span className="font-bold">{label}</span>
        <span className="font-extrabold tabular-nums">{inr(total)}</span>
      </p>
      <div aria-hidden="true" className="flex h-7 w-full overflow-hidden rounded-md bg-sunken">
        {segments
          .filter((g) => g.width > 0)
          .map((g, i) => (
            <Arrive key={`${g.text}${i}`} reduced={reduced} from="scaleX(0)" className={`flex h-full origin-left items-center justify-center overflow-hidden border-r border-white/60 px-0.5 text-[0.65rem] font-extrabold ${g.cls}`} style={{ width: `${pct(g.width, max)}%` }}>
              <span className="truncate">{pct(g.width, max) >= 12 ? g.text : ''}</span>
            </Arrive>
          ))}
      </div>
      {note ? <p className="text-xs text-muted">{note}</p> : null}
    </div>
  );
}

const HATCH = 'sim-deduction text-danger-deep';

function Certificate({ s, shown, reduced }: { s: Story; shown: number; reduced: boolean }) {
  const { input: i, f } = s;
  const max = Math.max(f.issuePrice, f.redemptionPrice, f.face);
  const at = (id: string) => s.steps.findIndex((x) => x.id === id) < shown;
  const allotted = at('allot');
  const writtenOff = at('writeOff');
  const perLoss = f.discount + f.onRedemption;
  return (
    <section aria-labelledby="deb-cert-title" data-testid={`${P}-certificate`} className="flex min-w-0 flex-col gap-3 rounded-card border border-edge bg-surface p-3 shadow-card">
      <h3 id="deb-cert-title" className="text-base font-extrabold">
        One debenture, three prices
      </h3>
      {/* The certificate itself. */}
      <div className="relative rounded-control border-4 border-double border-hue-blue bg-hue-blue-soft px-3 py-2 text-center">
        <p className="text-xs font-bold uppercase tracking-widest text-muted">{i.company}</p>
        <p className="text-lg font-extrabold">
          {i.rate}% Debenture of {inr(f.face)}
        </p>
        <p className="text-xs text-muted">
          Interest {i.rate}% a year on {inr(f.face)} · redeemable {f.onRedemption > 0 ? `at ${inr(f.redemptionPrice)}` : 'at par'} after {i.years} years
        </p>
        <span aria-hidden="true" className="absolute right-1 top-1 hidden rounded-full sm:inline border-2 border-hue-blue px-1.5 text-[0.6rem] font-extrabold text-hue-blue">
          × {count(f.n)}
        </span>
      </div>
      {shown === 0 ? (
        <p className="rounded-control border border-dashed border-edge-deep px-3 py-4 text-center text-sm text-muted">Press Play: the terms of the issue come first.</p>
      ) : (
        <div className="flex flex-col gap-2">
          <RulerRow
            label={i.route === 'vendor' ? `Settled by it (issue price)` : 'Received for it (issue price)'}
            total={f.issuePrice}
            max={max}
            reduced={reduced}
            testId={`${P}-ruler-issue`}
            segments={[
              { width: Math.min(f.issuePrice, f.face), cls: 'bg-hue-teal text-on-hue', text: inr(Math.min(f.issuePrice, f.face)) },
              { width: f.premium, cls: 'bg-hue-violet text-on-hue', text: `+${inr(f.premium)}` },
              { width: f.discount, cls: HATCH, text: `−${inr(f.discount)}` },
            ]}
            note={f.premium > 0 ? `${inr(f.premium)} above the face value: a premium on issue, credited to Securities Premium.` : f.discount > 0 ? `${inr(f.discount)} below the face value (hatched): a discount, money the company never receives.` : 'Issued at par: exactly the face value.'}
          />
          <RulerRow
            label="Face value (the debentures account)"
            total={f.face}
            max={max}
            reduced={reduced}
            testId={`${P}-ruler-face`}
            segments={[{ width: f.face, cls: 'bg-hue-blue text-on-hue', text: inr(f.face) }]}
            note="The debentures account is always credited with the face value, and interest is worked on it."
          />
          <RulerRow
            label="Paid on redemption"
            total={f.redemptionPrice}
            max={max}
            reduced={reduced}
            testId={`${P}-ruler-redemption`}
            segments={[
              { width: f.face, cls: 'bg-edge-deep text-ink', text: inr(f.face) },
              { width: f.onRedemption, cls: 'bg-hue-rose text-on-hue', text: `+${inr(f.onRedemption)}` },
            ]}
            note={f.onRedemption > 0 ? `${inr(f.onRedemption)} over the face value: owed from the day of issue, a liability (Premium on Redemption of Debentures A/c).` : 'Redeemable at par: the face value is repaid.'}
          />
          <p data-testid={`${P}-per-loss`} className={`rounded-control px-3 py-2 text-sm font-bold ${perLoss > 0 ? 'bg-danger-soft text-danger-deep' : 'bg-primary-soft text-primary-ink'}`}>
            {perLoss > 0
              ? f.onRedemption === 0
                ? `Discount on issue a debenture: ${inr(f.discount)}, a capital loss (redeemable at par, so it goes to Discount on Issue of Debentures A/c).`
                : `Loss on issue a debenture: ${[f.discount > 0 ? `discount ${inr(f.discount)}` : '', f.onRedemption > 0 ? `premium on redemption ${inr(f.onRedemption)}` : ''].filter(Boolean).join(' + ')} = ${inr(perLoss)}.${f.premium > 0 ? ` The premium on issue is not set off: it stays in Securities Premium.` : ''}`
              : `No loss on issue.${f.premium > 0 ? ` The premium of ${inr(f.premium)} a debenture is a capital gain.` : ''}`}
          </p>
          <div data-testid={`${P}-whole`} className="flex flex-col gap-0.5 rounded-control bg-sunken px-3 py-2 text-sm">
            <p className="text-xs font-extrabold uppercase tracking-wide text-muted">The whole issue: {count(f.n)} debentures</p>
            <dl className="grid grid-cols-1 gap-x-4 gap-y-0.5 sm:grid-cols-2">
            {[
              [i.route === 'vendor' ? 'Price settled' : 'Money received', f.money, true],
              ['Debentures (face value)', f.nominal, true],
              ['Securities Premium from the issue', f.premiumTotal, f.premiumTotal > 0],
              ['Premium on redemption', f.onRedemptionTotal, f.onRedemptionTotal > 0],
              [`${f.lossWord === 'loss' ? 'Loss' : 'Discount'} on issue`, f.loss, f.loss > 0],
            ]
              .filter(([, , on]) => on)
              .map(([label, value]) => (
                <div key={String(label)} className={`flex items-center justify-between gap-2 ${!allotted && label !== 'Money received' && label !== 'Price settled' ? 'text-muted' : ''}`}>
                  <dt>{label}</dt>
                  <dd className="font-extrabold tabular-nums">{inr(value as Paise)}</dd>
                </div>
              ))}
            </dl>
            {f.loss > 0 && writtenOff ? (
              <div data-testid={`${P}-write-off-split`} className="text-xs text-ink">
                Written off: {inr(f.fromSp)} from Securities Premium{f.fromPl > 0 ? `, ${inr(f.fromPl)} from the Statement of Profit and Loss` : ''}.
              </div>
            ) : null}
          </div>
        </div>
      )}
    </section>
  );
}

function LoanAndSecurity({ s, shown, reduced }: { s: Story; shown: number; reduced: boolean }) {
  const { input: i, f } = s;
  const max = Math.max(i.loan.amount, f.nominal);
  return (
    <section aria-labelledby="deb-loan-title" data-testid={`${P}-certificate`} className="flex min-w-0 flex-col gap-3 rounded-card border border-edge bg-surface p-3 shadow-card">
      <h3 id="deb-loan-title" className="text-base font-extrabold">
        A loan, and debentures behind it
      </h3>
      <div className="relative rounded-control border-4 border-double border-edge-deep bg-sunken px-3 py-2 text-center">
        <p className="text-xs font-bold uppercase tracking-widest text-muted">{i.company}</p>
        <p className="text-lg font-extrabold">
          {i.rate}% Debentures of {inr(f.nominal)}
        </p>
        <p className="text-xs font-bold text-muted">Held by the bank as collateral security: no money received, no interest</p>
      </div>
      {shown === 0 ? (
        <p className="rounded-control border border-dashed border-edge-deep px-3 py-4 text-center text-sm text-muted">Press Play: the loan comes first.</p>
      ) : (
        <div className="flex flex-col gap-2">
          <RulerRow label="Money borrowed: the only debt" total={i.loan.amount} max={max} reduced={reduced} testId={`${P}-ruler-loan`} segments={[{ width: i.loan.amount, cls: 'bg-hue-teal text-on-hue', text: inr(i.loan.amount) }]} note={`Interest at ${i.loan.rate}% is paid on this.`} />
          <RulerRow
            label="Debentures held as security"
            total={f.nominal}
            max={max}
            reduced={reduced}
            testId={`${P}-ruler-security`}
            segments={[{ width: f.nominal, cls: 'border-2 border-dashed border-hue-blue bg-hue-blue-soft text-ink', text: inr(f.nominal) }]}
            note="Used only if the company fails to repay: until then it adds nothing to what is owed."
          />
          <p data-testid={`${P}-per-loss`} className="rounded-control bg-primary-soft px-3 py-2 text-sm font-bold text-primary-ink">
            The debt is {inr(i.loan.amount)}, not {inr(i.loan.amount + f.nominal)}: the debentures only stand behind the loan.
          </p>
        </div>
      )}
    </section>
  );
}

/** How each pot looks: its hue and, for an account debited, a hatch. */
const LOOK: Record<PotId, { fill: string; edge: string }> = {
  bank: { fill: 'bg-hue-teal', edge: 'border-hue-teal' },
  daa: { fill: 'bg-hue-sky', edge: 'border-hue-sky' },
  vendor: { fill: 'bg-hue-sky', edge: 'border-hue-sky' },
  asset: { fill: 'bg-hue-green', edge: 'border-hue-green' },
  debentures: { fill: 'bg-hue-blue', edge: 'border-hue-blue' },
  sp: { fill: 'bg-hue-violet', edge: 'border-hue-violet' },
  premRed: { fill: 'bg-hue-rose', edge: 'border-hue-rose' },
  loss: { fill: 'sim-deduction', edge: 'border-danger' },
  interest: { fill: 'bg-hue-orange', edge: 'border-hue-orange' },
  spl: { fill: 'bg-hue-amber', edge: 'border-hue-amber' },
  loan: { fill: 'bg-hue-blue', edge: 'border-hue-blue' },
  suspense: { fill: 'sim-deduction', edge: 'border-danger' },
  interestPaid: { fill: 'bg-hue-orange', edge: 'border-hue-orange' },
};

/** A balance in words: "₹9,50,000 Dr", "nil". The bank of a vendor's issue shows what it paid out. */
export function balanceWords(p: PotId, v: Paise): string {
  if (v === 0) return 'nil';
  if (p === 'bank' && v < 0) return `${inr(-v)} paid out`;
  return `${inr(Math.abs(v))} ${v > 0 ? 'Dr' : 'Cr'}`;
}

function Pots({ s, shown, reduced }: { s: Story; shown: number; reduced: boolean }) {
  const now = shown > 0 ? s.steps[Math.min(shown, s.steps.length) - 1] : null;
  const before = shown > 1 ? s.steps[Math.min(shown, s.steps.length) - 2].pots : s.input.route === 'collateral' ? {} : { sp: -s.input.spBefore };
  const pots = now ? now.pots : before;
  const max = Math.max(1, ...s.steps.flatMap((st) => s.potIds.map((p) => Math.abs(st.pots[p] ?? 0))));
  const sheet = now?.id === 'sheet' || now?.id === 'release';
  return (
    <section aria-labelledby="deb-pots-title" data-testid={`${P}-pots`} className="flex min-w-0 flex-col gap-2 rounded-card border border-edge bg-surface p-3 shadow-card">
      <h3 id="deb-pots-title" className="text-base font-extrabold">
        The accounts of the issue
      </h3>
      <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        {s.potIds.map((p) => {
          const v = pots[p] ?? 0;
          const was = before[p] ?? 0;
          const moved = now !== null && v !== was;
          const look = LOOK[p];
          const kept = sheet && v !== 0 && p !== 'bank' && p !== 'asset' && p !== 'spl' && p !== 'interestPaid';
          return (
            <li
              key={p}
              data-testid={`${P}-pot-${p}`}
              data-moved={moved ? 'true' : 'false'}
              // An empty pot is drawn dashed, in muted words (never faded, so that it can still be read).
              className={`relative flex min-w-0 flex-col gap-1 rounded-control border-2 px-2 py-1.5 ${moved || kept ? look.edge : 'border-edge'} ${v === 0 && !moved ? 'border-dashed bg-sunken text-muted' : 'bg-surface'}`}
            >
              <span className="text-xs font-extrabold leading-tight">{potName(s.input, p)}</span>
              <span className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5">
                <span data-testid={`${P}-pot-${p}-amount`} className="text-sm font-extrabold tabular-nums">
                  {balanceWords(p, v)}
                </span>
                {moved ? (
                  <Arrive key={`${shown}-${p}`} reduced={reduced} from="translateY(-1.25rem)" className="rounded-full border-2 border-accent-deep bg-accent px-1.5 text-[0.65rem] font-extrabold text-on-accent tabular-nums">
                    <span className="sr-only">this step: </span>
                    {v - was > 0 ? 'Dr' : 'Cr'} {inr(Math.abs(v - was))}
                  </Arrive>
                ) : null}
              </span>
              <div aria-hidden="true" className="h-2.5 overflow-hidden rounded-full bg-sunken">
                <div className={`h-full w-full origin-left ${look.fill} ${reduced ? '' : 'transition-transform duration-700 ease-out'}`} style={{ transform: `scaleX(${pct(Math.abs(v), max) / 100})` }} />
              </div>
            </li>
          );
        })}
      </ul>
      <p className="text-xs text-muted">
        Dr: a debit balance (an asset, a loss or an expense); Cr: a credit balance (a liability or a reserve). A tag shows what this step put in or took out.
        {s.input.route !== 'collateral' ? ' Debentureholders A/c is credited when interest falls due and cleared by the cheque the same day.' : ''}
      </p>
    </section>
  );
}
