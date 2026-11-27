'use client';

import { useMemo, useState, type ReactNode } from 'react';
import { Button } from '@/components/ui/Button';
import { useMediaQuery } from '@/components/ui/useMediaQuery';
import { rupees } from '@/engine/money';
import { createRng } from '@/engine/rng';
import { appropriate, type Appropriation, type AppropriationIn, type CapitalMethod } from '@/simulator/partnership/appropriation';
import { EXAMPLES, NAMES, NEW_PARTNER, newFigures, RECON_EXAMPLES } from '@/simulator/partnership/examples';
import { fr, type Fr } from '@/simulator/partnership/fraction';
import { partnershipQuestions } from '@/simulator/partnership/questions';
import { reconProblem, reconstitute, type AdmissionFrom, type Recon, type ReconIn, type ReconKind } from '@/simulator/partnership/reconstitution';
import { useReducedMotion } from '../useReducedMotion';
import { AppropriationAccount, PartnerAccounts } from './partnership/Accounts';
import { ProfitFlow } from './partnership/ProfitFlow';
import { RatioPie, phaseOf } from './partnership/RatioPie';
import { SelectField, Toggle, type LabMode } from './kit/LabControls';
import { Card, Intro, LabShell } from './kit/LabShell';
import { NumberField } from './kit/MoneyField';
import { PlaybackBar, Stage, StepList, StepNow } from './kit/Playback';
import { QuestionRound } from './kit/QuestionRound';
import { Journal } from './kit/TAccount';
import { usePlayback, type Playback } from './kit/usePlayback';
import type { LabProps } from './types';

// ---------------------------------------------------------------------------------------------------------------
// The lab "partnership" (src/simulator/labs.ts): the year's profit poured out among the partners through the
// Profit and Loss Appropriation Account, and the profit as a circle whose wedges change hands when a partner joins,
// the ratio changes, or a partner retires or dies. All the figures come from src/simulator/partnership.
// ---------------------------------------------------------------------------------------------------------------

const ID = 'lab-partnership';

const CONVENTIONS = [
  'Year ended 31 March 2026.',
  'Interest on capital, salaries and commission are appropriations of profit (not charges): none with a loss, and when the profit falls short of them it is shared in proportion to the amounts due (the deed giving none of them priority).',
  'Capitals fluctuate unless stated as fixed.',
  'For a change in partners, capitals are fluctuating and no goodwill stands in the books, so the premium or the share of goodwill passes through the capital accounts (AS 26).',
];

export default function PartnershipLab({ seed }: LabProps) {
  const [mode, setMode] = useState<LabMode>('watch');
  return (
    <LabShell prefix={ID} mode={mode} onMode={setMode} conventions={CONVENTIONS}>
      {mode === 'watch' ? <Watch /> : null}
      {mode === 'play' ? <Play seed={seed} /> : null}
      {mode === 'try' ? <Try seed={seed} /> : null}
    </LabShell>
  );
}

/** A row of choices, as the kit draws them. Test ids `<id>-<option>`. */
function Choice<T extends string>({ id, label, value, options, onChange }: { id: string; label: string; value: T; options: { id: T; label: string }[]; onChange(v: T): void }) {
  return <Toggle prefix={id} label={label} value={value} options={options.map((o) => ({ value: o.id, label: o.label }))} onChange={onChange} small />;
}

// ---- Watch ----

function Watch() {
  const [pick, setPick] = useState(`app:${EXAMPLES[0].id}`);
  const [kind, exId] = pick.split(':');
  const app = useMemo(() => (kind === 'app' ? appropriate(EXAMPLES.find((e) => e.id === exId)!.input) : null), [kind, exId]);
  const recon = useMemo(() => (kind === 'recon' ? reconstitute(RECON_EXAMPLES.find((e) => e.id === exId)!.input) : null), [kind, exId]);
  return (
    <div className="flex min-w-0 flex-col gap-3">
      <SelectField
        label="Example to watch"
        value={pick}
        onChange={setPick}
        testId={`${ID}-example`}
        className="max-w-xl"
        groups={[
          { label: "Sharing the year's profit", options: EXAMPLES.map((e) => ({ id: `app:${e.id}`, label: e.title })) },
          { label: 'A change in the partners', options: RECON_EXAMPLES.map((e) => ({ id: `recon:${e.id}`, label: e.title })) },
        ]}
      />
      {app ? <ProfitWalk app={app} /> : null}
      {recon ? <ReconWalk recon={recon} /> : null}
    </div>
  );
}

function Facts({ items }: { items: string[] }) {
  return <Intro prefix={ID} testId={`${ID}-facts`} facts={items} />;
}

const inr = (p: number) => new Intl.NumberFormat('en-IN').format(p / 100);

function appFacts(x: AppropriationIn): string[] {
  const names = x.partners.map((p) => p.name);
  const out = [
    `${names.join(', ')} share profits ${x.partners.map((p) => p.ratio).join(':')}; capitals ${x.capitals} (${x.partners.map((p) => `₹${inr(p.capital)}`).join(', ')}).`,
    `Net ${x.netProfit < 0 ? 'loss' : 'profit'} ₹${inr(Math.abs(x.netProfit))}; interest on capital ${x.iocRate}% p.a.${x.iodRate > 0 ? `; interest on drawings ${x.iodRate}% p.a.` : '; no interest on drawings'}.`,
  ];
  const sal = x.partners.filter((p) => p.salary > 0).map((p) => `${p.name} ₹${inr(p.salary)} a year`);
  if (sal.length) out.push(`Salary: ${sal.join(', ')}.`);
  if (x.commission) out.push(`Commission to ${names[x.commission.partner]}: ${x.commission.rate}% of the net profit before charging it.`);
  const dr = x.partners.filter((p) => p.drawings > 0).map((p) => `${p.name} ₹${inr(p.drawings)}`);
  if (dr.length) out.push(`Drawings: ${dr.join(', ')}.`);
  if (x.guarantee) out.push(`${names[x.guarantee.partner]} is guaranteed at least ₹${inr(x.guarantee.amount)}, by ${x.guarantee.by === 'firm' ? 'the firm' : names[x.guarantee.by]}.`);
  return out;
}

function reconFacts(r: Recon): string[] {
  const x = r.input;
  const e = x.event;
  const out = [`${x.names.join(', ')} share profits ${x.ratio.join(':')}. Goodwill of the firm: ₹${inr(x.goodwill)}.`];
  if (e.kind === 'admission') {
    out.push(`${e.name} is admitted for ${e.share.n}/${e.share.d} of the profit, bringing ₹${inr(e.capital)} as capital; the premium for goodwill is ${e.premium === 'cash' ? 'brought in cash' : 'not brought in cash (adjusted through capital accounts)'}.`);
  } else if (e.kind === 'change') {
    out.push(`From now on they will share ${e.newRatio.join(':')}.`);
  } else {
    out.push(`${x.names[e.partner]} ${e.kind === 'death' ? 'dies' : 'retires'}; ${e.newRatio === 'old-ratio' ? 'the others carry on in their old ratio' : `the others will share ${e.newRatio.join(':')}`}.`);
  }
  return out;
}

/** A walk-through as the kit plays it: the controls, the step told, the picture, and every step in a list. */
function Walk({ player, steps, label, idle, children }: { player: Playback; steps: { title: string; text: string }[]; label: string; idle: string; children: ReactNode }) {
  const last = player.shown > 0 ? steps[player.shown - 1] : null;
  return (
    <>
      <PlaybackBar playback={player} prefix={ID} announce={last ? `Step ${player.shown} of ${steps.length}, ${last.title}. ${last.text}` : ''} />
      <StepNow prefix={ID} at={player.shown} count={steps.length} title={last?.title} idle={idle}>
        {last?.text}
      </StepNow>
      <Stage prefix={ID} label={label} playback={player}>
        {children}
      </Stage>
      <StepList steps={steps} shown={player.shown} prefix={ID} onPick={(i) => player.seek(i + 1)} />
    </>
  );
}

function ProfitWalk({ app, atEnd = false }: { app: Appropriation; atEnd?: boolean }) {
  const reduced = useReducedMotion();
  const compact = !useMediaQuery('(min-width: 640px)', true);
  const player = usePlayback(app.steps.length, { story: app, stepMs: 2600, start: atEnd ? app.steps.length : 0 });
  const n = app.steps.length;
  return (
    <div className="grid min-w-0 gap-4 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)]">
      <div className="flex min-w-0 flex-col gap-3">
        <Facts items={appFacts(app.input)} />
        <Walk player={player} steps={app.steps} label="The year's profit shared among the partners" idle="Press Play, or Step, to share out the year's profit one step at a time.">
          <ProfitFlow app={app} shown={player.shown} advanced={player.advanced} reduced={reduced} compact={compact} />
        </Walk>
      </div>
      <div className="flex min-w-0 flex-col gap-3">
        <Card title="In the exam: the appropriation account">
          <AppropriationAccount account={app.account} shown={player.shown} total={n} />
          {app.case === 'short' ? (
            <p className="rounded-control bg-accent-soft px-3 py-2 text-sm text-accent-ink">
              The profit falls short of the appropriations: it is shared in proportion to the amounts due, ₹{inr(app.available)} out of ₹{inr(app.due)}.
            </p>
          ) : null}
        </Card>
        {player.shown >= n ? (
          <Card title="The partners' accounts" testId={`${ID}-partner-accounts`}>
            <PartnerAccounts accounts={app.partnerAccounts} names={app.input.partners.map((p) => p.name)} />
          </Card>
        ) : (
          <p className="text-sm text-muted">The partners&apos; accounts appear when the walk-through ends.</p>
        )}
      </div>
    </div>
  );
}

function ReconWalk({ recon, atEnd = false }: { recon: Recon; atEnd?: boolean }) {
  const reduced = useReducedMotion();
  const player = usePlayback(recon.steps.length, { story: recon, stepMs: 2600, start: atEnd ? recon.steps.length : 0 });
  const { entries } = phaseOf(recon, player.shown);
  return (
    <div className="grid min-w-0 gap-4 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)]">
      <div className="flex min-w-0 flex-col gap-3">
        <Facts items={reconFacts(recon)} />
        <Walk player={player} steps={recon.steps} label="The profit-sharing ratio as a circle" idle="Press Play, or Step, to follow the change in the partners one step at a time.">
          <RatioPie recon={recon} shown={player.shown} advanced={player.advanced} reduced={reduced} />
        </Walk>
      </div>
      <Card title="In the exam: the journal entries">
        {entries === 0 ? <p className="text-sm text-muted">The entries are written when goodwill is dealt with.</p> : null}
        <Journal entries={recon.entries.slice(0, entries)} testId={`${ID}-journal`} highlight={entries - 1} being />
        <p className="text-xs text-muted">
          Goodwill is not raised in the books (AS 26): only the premium, or the share of goodwill, passes between the capital accounts.
        </p>
      </Card>
    </div>
  );
}

// ---- Play ----

interface PartnerForm {
  capital: number;
  ratio: number;
  salary: number;
  drawings: number;
}

interface FirmForm {
  count: 2 | 3;
  capitals: CapitalMethod;
  partners: PartnerForm[];
  netProfit: number;
  iocRate: number;
  iodRate: number;
  commissionTo: string;
  commissionRate: number;
  guaranteeTo: string;
  guaranteeAmount: number;
  guaranteeBy: string;
}

interface ReconForm {
  kind: ReconKind;
  goodwill: number;
  share: string;
  from: string;
  capital: number;
  premium: 'cash' | 'capital';
  newRatio: number[];
  leaver: number;
  retireRatio: 'old-ratio' | 'stated';
  stated: number[];
}

const firmFrom = (x: AppropriationIn): FirmForm => ({
  count: x.partners.length === 3 ? 3 : 2,
  capitals: x.capitals,
  partners: [0, 1, 2].map((i) => {
    const p = x.partners[i];
    return p ? { capital: p.capital / 100, ratio: p.ratio, salary: p.salary / 100, drawings: p.drawings / 100 } : { capital: 200000, ratio: 1, salary: 0, drawings: 0 };
  }),
  netProfit: x.netProfit / 100,
  iocRate: x.iocRate,
  iodRate: x.iodRate,
  commissionTo: x.commission ? String(x.commission.partner) : 'none',
  commissionRate: x.commission?.rate ?? 5,
  guaranteeTo: x.guarantee ? String(x.guarantee.partner) : 'none',
  guaranteeAmount: x.guarantee ? x.guarantee.amount / 100 : 50000,
  guaranteeBy: x.guarantee ? String(x.guarantee.by) : 'firm',
});

const SHARE_OPTIONS = ['1/3', '1/4', '1/5', '1/6', '1/8', '1/10'];
const reconFrom = (x: ReconIn): ReconForm => {
  const e = x.event;
  const base: ReconForm = { kind: e.kind, goodwill: x.goodwill / 100, share: '1/5', from: 'old-ratio', capital: 100000, premium: 'cash', newRatio: [...x.ratio, 1, 1].slice(0, 3), leaver: 2, retireRatio: 'old-ratio', stated: [1, 1] };
  if (e.kind === 'admission') {
    const share = `${e.share.n}/${e.share.d}`;
    return { ...base, share: SHARE_OPTIONS.includes(share) ? share : '1/5', from: e.from.kind === 'one' ? `one:${e.from.partner}` : e.from.kind === 'equal' ? 'equal' : 'old-ratio', capital: e.capital / 100, premium: e.premium };
  }
  if (e.kind === 'change') return { ...base, newRatio: [...e.newRatio, 1].slice(0, 3) };
  return { ...base, leaver: e.partner, retireRatio: e.newRatio === 'old-ratio' ? 'old-ratio' : 'stated', stated: e.newRatio === 'old-ratio' ? [1, 1] : [...e.newRatio] };
};

function appInput(f: FirmForm): AppropriationIn | string {
  const parts = f.partners.slice(0, f.count);
  if (parts.some((p) => !Number.isInteger(p.ratio) || p.ratio < 1 || p.ratio > 20)) return 'Give each partner a whole-number term of the ratio, from 1 to 20.';
  if (parts.some((p) => p.capital < 0 || p.salary < 0 || p.drawings < 0)) return 'Capitals, salaries and drawings cannot be below nothing.';
  if (f.iocRate < 0 || f.iocRate > 30 || f.iodRate < 0 || f.iodRate > 30) return 'Take rates from 0% to 30% p.a.';
  const names = NAMES.slice(0, f.count);
  const gTo = f.guaranteeTo === 'none' ? -1 : Number(f.guaranteeTo);
  const gBy = f.guaranteeBy === 'firm' ? 'firm' : Number(f.guaranteeBy);
  if (gTo >= f.count) return 'Pick a partner of the firm for the guarantee.';
  if (gTo >= 0 && gBy === gTo) return 'A partner cannot guarantee their own share: pick the firm or another partner.';
  const cTo = f.commissionTo === 'none' ? -1 : Number(f.commissionTo);
  return {
    partners: parts.map((p, i) => ({ name: names[i], capital: rupees(p.capital), ratio: p.ratio, salary: rupees(p.salary), drawings: rupees(p.drawings) })),
    netProfit: rupees(f.netProfit),
    iocRate: f.iocRate,
    iodRate: f.iodRate,
    commission: cTo >= 0 && cTo < f.count ? { partner: cTo, rate: f.commissionRate } : null,
    guarantee: gTo >= 0 ? { partner: gTo, amount: rupees(f.guaranteeAmount), by: typeof gBy === 'number' && gBy >= f.count ? 'firm' : gBy } : null,
    capitals: f.capitals,
  };
}

function reconInput(f: FirmForm, r: ReconForm): ReconIn {
  const names = NAMES.slice(0, f.count) as string[];
  const ratio = f.partners.slice(0, f.count).map((p) => p.ratio);
  const goodwill = rupees(r.goodwill);
  // A firm of two has no retirement or death to show here (the form offers none): read it as an admission, as shown.
  const kind = f.count < 3 && (r.kind === 'retirement' || r.kind === 'death') ? 'admission' : r.kind;
  if (kind === 'admission') {
    const [n, d] = r.share.split('/').map(Number);
    const from: AdmissionFrom = r.from === 'equal' ? { kind: 'equal' } : r.from.startsWith('one:') ? { kind: 'one', partner: Math.min(Number(r.from.slice(4)), f.count - 1) } : { kind: 'old-ratio' };
    return { names, ratio, goodwill, event: { kind: 'admission', name: NEW_PARTNER, share: fr(n, d) as Fr, from, capital: rupees(r.capital), premium: r.premium } };
  }
  if (kind === 'change') return { names, ratio, goodwill, event: { kind: 'change', newRatio: r.newRatio.slice(0, f.count) } };
  return { names, ratio, goodwill, event: { kind, partner: Math.min(r.leaver, f.count - 1), newRatio: r.retireRatio === 'old-ratio' ? 'old-ratio' : r.stated.slice(0, f.count - 1) } };
}

function Play({ seed }: { seed?: number }) {
  const [part, setPart] = useState<'profit' | 'partners'>('profit');
  const [firm, setFirm] = useState<FirmForm>(() => firmFrom(EXAMPLES[0].input));
  const [change, setChange] = useState<ReconForm>(() => reconFrom(RECON_EXAMPLES[0].input));
  const [round, setRound] = useState(0);

  const appIn = useMemo(() => appInput(firm), [firm]);
  const app = useMemo(() => (typeof appIn === 'string' ? null : appropriate(appIn)), [appIn]);
  const reconIn = useMemo(() => reconInput(firm, change), [firm, change]);
  const problem = reconProblem(reconIn);
  const recon = useMemo(() => (problem ? null : reconstitute(reconIn)), [reconIn, problem]);

  const fresh = () => {
    const f = newFigures(createRng((seed ?? 1) * 1009 + round));
    setRound(round + 1);
    setFirm(firmFrom(f.appropriation));
    setChange(reconFrom(f.recon));
  };
  const setPartner = (i: number, k: keyof PartnerForm, v: number) => setFirm({ ...firm, partners: firm.partners.map((p, j) => (j === i ? { ...p, [k]: v } : p)) });
  const names = NAMES.slice(0, firm.count) as string[];
  const partnerOptions = names.map((n, i) => ({ id: String(i), label: n }));

  return (
    <div className="flex min-w-0 flex-col gap-3">
      <Choice<'profit' | 'partners'>
        id={`${ID}-part`}
        label="What to play with"
        value={part}
        options={[
          { id: 'profit', label: "The year's profit" },
          { id: 'partners', label: 'A change in the partners' },
        ]}
        onChange={setPart}
      />
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm font-bold text-muted">Ready examples:</span>
        {part === 'profit'
          ? EXAMPLES.map((e) => (
              <Button key={e.id} variant="ghost" data-testid={`${ID}-example-${e.id}`} onClick={() => setFirm(firmFrom(e.input))}>
                {e.title}
              </Button>
            ))
          : RECON_EXAMPLES.map((e) => (
              <Button
                key={e.id}
                variant="ghost"
                data-testid={`${ID}-example-${e.id}`}
                onClick={() => {
                  const f = firmFrom(EXAMPLES[0].input);
                  const count = e.input.names.length === 3 ? 3 : 2;
                  setFirm({ ...firm, count, partners: firm.partners.map((p, i) => ({ ...p, ratio: e.input.ratio[i] ?? f.partners[i].ratio })) });
                  setChange(reconFrom(e.input));
                }}
              >
                {e.title}
              </Button>
            ))}
        <Button variant="secondary" data-testid={`${ID}-new-figures`} onClick={fresh}>
          New figures
        </Button>
      </div>

      <Card title="The firm">
        <div className="flex flex-wrap gap-4">
          <Choice
            id={`${ID}-count`}
            label="Partners"
            value={String(firm.count) as '2' | '3'}
            options={[
              { id: '2', label: 'Two partners' },
              { id: '3', label: 'Three partners' },
            ]}
            onChange={(v) => setFirm({ ...firm, count: v === '3' ? 3 : 2 })}
          />
          {part === 'profit' ? (
            <Choice
              id={`${ID}-capitals`}
              label="Capitals"
              value={firm.capitals}
              options={[
                { id: 'fixed', label: 'Fixed capitals' },
                { id: 'fluctuating', label: 'Fluctuating capitals' },
              ]}
              onChange={(v) => setFirm({ ...firm, capitals: v })}
            />
          ) : null}
        </div>
        <div className="grid gap-3 sm:grid-cols-3">
          {names.map((n, i) => (
            <fieldset key={n} className="grid min-w-0 grid-cols-2 gap-2 rounded-control border border-edge p-2">
              <legend className="px-1 text-sm font-extrabold">{n}</legend>
              <NumberField id={`${ID}-ratio-${i}`} testId={`${ID}-ratio-${i}`} label="Ratio term" value={firm.partners[i].ratio} min={1} max={20} onChange={(v) => setPartner(i, 'ratio', Math.round(v))} />
              {part === 'profit' ? (
                <>
                  <NumberField id={`${ID}-capital-${i}`} testId={`${ID}-capital-${i}`} label="Capital ₹" value={firm.partners[i].capital} min={0} step={10000} onChange={(v) => setPartner(i, 'capital', v)} />
                  <NumberField id={`${ID}-salary-${i}`} testId={`${ID}-salary-${i}`} label="Salary ₹ a year" value={firm.partners[i].salary} min={0} step={6000} onChange={(v) => setPartner(i, 'salary', v)} />
                  <NumberField id={`${ID}-drawings-${i}`} testId={`${ID}-drawings-${i}`} label="Drawings ₹" value={firm.partners[i].drawings} min={0} step={5000} onChange={(v) => setPartner(i, 'drawings', v)} />
                </>
              ) : null}
            </fieldset>
          ))}
        </div>
        {part === 'profit' ? (
          <div className="grid gap-3 sm:grid-cols-3">
            <NumberField id={`${ID}-profit`} testId={`${ID}-profit`} label="Net profit ₹ (a minus for a loss)" value={firm.netProfit} step={10000} onChange={(v) => setFirm({ ...firm, netProfit: v })} />
            <NumberField id={`${ID}-ioc`} testId={`${ID}-ioc`} label="Interest on capital" suffix="% p.a." value={firm.iocRate} min={0} max={30} onChange={(v) => setFirm({ ...firm, iocRate: v })} />
            <NumberField id={`${ID}-iod`} testId={`${ID}-iod`} label="Interest on drawings" suffix="% p.a." value={firm.iodRate} min={0} max={30} onChange={(v) => setFirm({ ...firm, iodRate: v })} />
            <SelectField id={`${ID}-commission-to`} label="Commission to" value={firm.commissionTo} options={[{ id: 'none', label: 'Nobody' }, ...partnerOptions]} onChange={(v) => setFirm({ ...firm, commissionTo: v })} />
            {firm.commissionTo !== 'none' ? (
              <NumberField id={`${ID}-commission-rate`} label="Commission, % of net profit" suffix="%" value={firm.commissionRate} min={0} max={30} onChange={(v) => setFirm({ ...firm, commissionRate: v })} />
            ) : null}
            <SelectField id={`${ID}-guarantee-to`} testId={`${ID}-guarantee-to`} label="Guaranteed minimum profit to" value={firm.guaranteeTo} options={[{ id: 'none', label: 'Nobody' }, ...partnerOptions]} onChange={(v) => setFirm({ ...firm, guaranteeTo: v })} />
            {firm.guaranteeTo !== 'none' ? (
              <>
                <NumberField id={`${ID}-guarantee-amount`} label="Guaranteed at least ₹" value={firm.guaranteeAmount} min={0} step={5000} onChange={(v) => setFirm({ ...firm, guaranteeAmount: v })} />
                <SelectField
                  id={`${ID}-guarantee-by`}
                  label="Guaranteed by"
                  value={firm.guaranteeBy}
                  options={[{ id: 'firm', label: 'The firm (the others, in their ratio)' }, ...partnerOptions.filter((o) => o.id !== firm.guaranteeTo)]}
                  onChange={(v) => setFirm({ ...firm, guaranteeBy: v })}
                />
              </>
            ) : null}
          </div>
        ) : (
          <ChangeForm firm={firm} change={change} onChange={setChange} />
        )}
      </Card>

      {part === 'profit' ? (
        typeof appIn === 'string' ? (
          <p role="alert" className="rounded-control bg-danger-soft px-3 py-2 text-base font-bold text-danger-deep">
            {appIn}
          </p>
        ) : app ? (
          <ProfitWalk app={app} atEnd />
        ) : null
      ) : problem ? (
        <p role="alert" data-testid={`${ID}-problem`} className="rounded-control bg-danger-soft px-3 py-2 text-base font-bold text-danger-deep">
          {problem}
        </p>
      ) : recon ? (
        <ReconWalk recon={recon} atEnd />
      ) : null}
    </div>
  );
}

function ChangeForm({ firm, change, onChange }: { firm: FirmForm; change: ReconForm; onChange(r: ReconForm): void }) {
  const names = NAMES.slice(0, firm.count) as string[];
  const kinds: { id: ReconKind; label: string }[] = [
    { id: 'admission', label: `${NEW_PARTNER} is admitted` },
    { id: 'change', label: 'A new ratio' },
    ...(firm.count === 3
      ? [
          { id: 'retirement' as const, label: 'A partner retires' },
          { id: 'death' as const, label: 'A partner dies' },
        ]
      : []),
  ];
  const kind = kinds.some((k) => k.id === change.kind) ? change.kind : 'admission';
  return (
    <div className="flex flex-col gap-3">
      <Choice id={`${ID}-event`} label="What happens" value={kind} options={kinds} onChange={(v) => onChange({ ...change, kind: v })} />
      <div className="grid gap-3 sm:grid-cols-3">
        <NumberField id={`${ID}-goodwill`} testId={`${ID}-goodwill`} label="Goodwill of the firm ₹" value={change.goodwill} min={0} step={10000} onChange={(v) => onChange({ ...change, goodwill: v })} />
        {kind === 'admission' ? (
          <>
            <SelectField id={`${ID}-share`} testId={`${ID}-share`} label={`${NEW_PARTNER}'s share`} value={change.share} options={SHARE_OPTIONS.map((s) => ({ id: s, label: s }))} onChange={(v) => onChange({ ...change, share: v })} />
            <SelectField
              id={`${ID}-from`}
              testId={`${ID}-from`}
              label="Taken from"
              value={change.from}
              options={[{ id: 'old-ratio', label: 'The old partners, in their old ratio' }, { id: 'equal', label: 'The old partners, equally' }, ...names.map((n, i) => ({ id: `one:${i}`, label: `${n} alone` }))]}
              onChange={(v) => onChange({ ...change, from: v })}
            />
            <NumberField id={`${ID}-new-capital`} label={`Capital ${NEW_PARTNER} brings ₹`} value={change.capital} min={0} step={10000} onChange={(v) => onChange({ ...change, capital: v })} />
            <SelectField
              id={`${ID}-premium`}
              label="Premium for goodwill"
              value={change.premium}
              options={[
                { id: 'cash', label: 'Brought in cash' },
                { id: 'capital', label: 'Not brought (through capital)' },
              ]}
              onChange={(v) => onChange({ ...change, premium: v })}
            />
          </>
        ) : null}
        {kind === 'change' ? (
          <fieldset className="col-span-full grid grid-cols-3 gap-2">
            <legend className="text-sm font-bold">New ratio</legend>
            {names.map((n, i) => (
              <NumberField key={n} id={`${ID}-new-ratio-${i}`} testId={`${ID}-new-ratio-${i}`} label={n} value={change.newRatio[i] ?? 1} min={1} max={20} onChange={(v) => onChange({ ...change, newRatio: change.newRatio.map((t, j) => (j === i ? Math.round(v) : t)) })} />
            ))}
          </fieldset>
        ) : null}
        {kind === 'retirement' || kind === 'death' ? (
          <>
            <SelectField id={`${ID}-leaver`} label={kind === 'death' ? 'Who dies' : 'Who retires'} value={String(change.leaver)} options={names.map((n, i) => ({ id: String(i), label: n }))} onChange={(v) => onChange({ ...change, leaver: Number(v) })} />
            <SelectField
              id={`${ID}-retire-ratio`}
              label="The others then share"
              value={change.retireRatio}
              options={[
                { id: 'old-ratio', label: 'In their old ratio' },
                { id: 'stated', label: 'In a new ratio' },
              ]}
              onChange={(v) => onChange({ ...change, retireRatio: v })}
            />
            {change.retireRatio === 'stated' ? (
              <fieldset className="col-span-full grid grid-cols-2 gap-2">
                <legend className="text-sm font-bold">New ratio of the others</legend>
                {names
                  .filter((_, i) => i !== change.leaver)
                  .map((n, k) => (
                    <NumberField key={n} id={`${ID}-stated-${k}`} label={n} value={change.stated[k] ?? 1} min={1} max={20} onChange={(v) => onChange({ ...change, stated: change.stated.map((t, j) => (j === k ? Math.round(v) : t)) })} />
                  ))}
              </fieldset>
            ) : null}
          </>
        ) : null}
      </div>
    </div>
  );
}

// ---- Try it ----

function Try({ seed }: { seed?: number }) {
  const [base] = useState(() => seed ?? 1 + Math.floor(Math.random() * 100000));
  const [round, setRound] = useState(0);
  const questions = useMemo(() => partnershipQuestions(base + round * 7), [base, round]);
  return <QuestionRound prefix={ID} questions={questions} onMore={() => setRound((r) => r + 1)} />;
}
