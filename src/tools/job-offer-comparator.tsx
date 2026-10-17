import { BarChart, Btn, color, CsvButton, JsonButtons, money, Note, Num, Panel, Row, Select, Stat, Stats, Table, uid, useToolState } from '../kit'
import { compute, horizonValue, type Offer } from './lib/job-offer-comparator'

const mk = (p: Partial<Offer>): Offer => ({
  id: uid(),
  name: 'New offer',
  base: 100000,
  bonusPct: 0,
  signing: 0,
  equity: 0,
  matchPct: 0,
  benefits: 0,
  premium: 150,
  ptoDays: 15,
  hoursWeek: 40,
  officeDays: 5,
  commuteMin: 25,
  commuteCost: 8,
  taxPct: 28,
  col: 100,
  ...p,
})

const DEF = {
  currency: '$',
  years: 4,
  raise: 3,
  holidays: 10,
  offers: [
    {
      ...mk({
        name: 'BigTech Inc.',
        base: 165000,
        bonusPct: 15,
        signing: 25000,
        equity: 40000,
        matchPct: 4,
        benefits: 1500,
        premium: 120,
        ptoDays: 20,
        hoursWeek: 45,
        officeDays: 3,
        commuteMin: 45,
        commuteCost: 18,
        taxPct: 32,
        col: 135,
      }),
      id: 'o1',
    },
    {
      ...mk({
        name: 'Startup Co.',
        base: 150000,
        bonusPct: 0,
        signing: 0,
        equity: 30000,
        matchPct: 0,
        benefits: 2400,
        premium: 250,
        ptoDays: 25,
        hoursWeek: 50,
        officeDays: 0,
        commuteMin: 0,
        commuteCost: 0,
        taxPct: 30,
        col: 100,
      }),
      id: 'o2',
    },
    {
      ...mk({
        name: 'Midsize Ltd.',
        base: 140000,
        bonusPct: 8,
        signing: 5000,
        equity: 5000,
        matchPct: 6,
        benefits: 1000,
        premium: 90,
        ptoDays: 22,
        hoursWeek: 40,
        officeDays: 2,
        commuteMin: 25,
        commuteCost: 6,
        taxPct: 28,
        col: 105,
      }),
      id: 'o3',
    },
  ] as Offer[],
}

const FIELDS: { k: keyof Offer; label: string; unit?: string; money?: boolean; group: string }[] = [
  { k: 'base', label: 'Base salary', money: true, group: 'Pay' },
  { k: 'bonusPct', label: 'Target bonus', unit: '%', group: 'Pay' },
  { k: 'signing', label: 'Signing bonus', money: true, group: 'Pay' },
  { k: 'equity', label: 'Equity / year', money: true, group: 'Pay' },
  { k: 'matchPct', label: 'Retirement match', unit: '% of base', group: 'Benefits' },
  { k: 'benefits', label: 'Other perks / year', money: true, group: 'Benefits' },
  { k: 'premium', label: 'Your health premium', unit: '/mo', money: true, group: 'Benefits' },
  { k: 'ptoDays', label: 'Paid time off', unit: 'days', group: 'Benefits' },
  { k: 'hoursWeek', label: 'Hours / week', unit: 'h', group: 'Time' },
  { k: 'officeDays', label: 'Office days / week', unit: 'days', group: 'Time' },
  { k: 'commuteMin', label: 'Commute one way', unit: 'min', group: 'Time' },
  { k: 'commuteCost', label: 'Commute cost / day', money: true, group: 'Time' },
  { k: 'taxPct', label: 'Effective tax rate', unit: '%', group: 'Location' },
  { k: 'col', label: 'Cost-of-living index', unit: '100 = here', group: 'Location' },
]

export default function JobOfferComparator() {
  const [s, set, reset] = useToolState('job-offer-comparator', DEF)
  const m = (x: number) => money(x, s.currency, 0)
  const edit = (id: string, p: Partial<Offer>) => set({ offers: s.offers.map((o) => (o.id === id ? { ...o, ...p } : o)) })
  const res = s.offers.map((o) => ({ o, b: compute(o, s.years, s.holidays), h: horizonValue(o, s.years, s.raise, s.holidays) }))
  const best = (f: (r: (typeof res)[number]) => number): (typeof res)[number] => res.reduce((a, r) => (f(r) > f(a) ? r : a), res[0])
  const bestTotal = res.length ? best((r) => r.b.totalComp) : null
  const bestReal = res.length ? best((r) => r.h) : null
  const bestHourly = res.length ? best((r) => r.b.hourly) : null

  type R = (typeof res)[number]
  const hrs = (v: number) => `${Math.round(v)} h`
  const hourly = (v: number) => money(v, s.currency, 2)
  // label, value, format, highlight best (higher is better)
  const ROWS: [string, (r: R) => number, (v: number) => string, boolean?][] = [
    ['Base salary', (r) => r.b.base, m],
    ['Bonus (target)', (r) => r.b.bonus, m],
    [`Signing (÷ ${s.years} yr)`, (r) => r.b.signing, m],
    ['Equity', (r) => r.b.equity, m],
    ['Retirement match', (r) => r.b.match, m],
    ['Other perks', (r) => r.b.benefits, m],
    ['Total compensation', (r) => r.b.totalComp, m, true],
    ['− Premiums & commuting', (r) => -r.b.costs, m],
    ['After tax & costs', (r) => r.b.afterTax, m, true],
    ['Cost-of-living adjusted', (r) => r.b.colAdjusted, m, true],
    [`${s.years}-year value (with raises)`, (r) => r.h, m, true],
    ['Commute time / year', (r) => r.b.commuteHours, hrs],
    ['Value per hour (work + commute)', (r) => r.b.hourly, hourly, true],
    ['PTO worth', (r) => r.b.ptoValue, m],
  ]

  return (
    <div>
      <Panel
        title="Assumptions"
        actions={
          <>
            <Btn disabled={s.offers.length >= 4} onClick={() => set({ offers: [...s.offers, mk({ name: `Offer ${s.offers.length + 1}` })] })}>
              + Offer
            </Btn>
            <CsvButton name="job-offers.csv" rows={() => [['Metric', ...s.offers.map((o) => o.name)], ...ROWS.map(([l, f]) => [l, ...res.map((r) => Math.round(f(r) * 100) / 100)])]} />
            <JsonButtons name="job-offers.json" data={s} onLoad={(d) => set(d)} />
            <Btn kind="ghost" onClick={reset}>
              Reset
            </Btn>
          </>
        }
      >
        <Row>
          <Num label="Horizon" value={s.years} onChange={(years) => set({ years: Math.max(1, Math.round(years)) })} unit="years" min={1} max={10} />
          <Num label="Expected yearly raise" value={s.raise} onChange={(raise) => set({ raise })} unit="%" />
          <Num label="Public holidays" value={s.holidays} onChange={(holidays) => set({ holidays })} unit="days" min={0} />
          <Select label="Currency" value={s.currency} onChange={(currency) => set({ currency })} options={['$', '€', '£', '₴', 'zł', 'CHF ', '₹', 'C$', 'A$']} />
        </Row>
      </Panel>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: 14, margin: '14px 0' }}>
        {s.offers.map((o, i) => (
          <div key={o.id}>
            <Panel
              title={
                <input
                  value={o.name}
                  onChange={(e) => edit(o.id, { name: e.target.value })}
                  aria-label="Offer name"
                  style={{ font: 'inherit', fontWeight: 700, border: 'none', borderBottom: `3px solid ${color(i)}`, background: 'transparent', color: 'inherit', width: '100%' }}
                />
              }
              actions={
                s.offers.length > 1 && (
                  <Btn kind="ghost" title="Remove offer" onClick={() => set({ offers: s.offers.filter((x) => x.id !== o.id) })}>
                    ✕
                  </Btn>
                )
              }
            >
              {['Pay', 'Benefits', 'Time', 'Location'].map((g) => (
                <div key={g}>
                  <div className="muted" style={{ fontSize: 12, fontWeight: 700, textTransform: 'uppercase', margin: '8px 0 2px' }}>
                    {g}
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 10px' }}>
                    {FIELDS.filter((f) => f.group === g).map((f) => (
                      <Num key={f.k} label={f.label} value={o[f.k] as number} onChange={(v) => edit(o.id, { [f.k]: v })} unit={f.money ? `${s.currency.trim()}${f.unit ?? ''}` : f.unit} min={0} />
                    ))}
                  </div>
                </div>
              ))}
            </Panel>
          </div>
        ))}
      </div>

      {bestTotal && bestReal && bestHourly && (
        <Stats>
          <Stat label="Highest total comp" value={bestTotal.o.name} sub={m(bestTotal.b.totalComp) + ' / yr'} />
          <Stat label={`Best real value over ${s.years} yr`} value={bestReal.o.name} sub={`${m(bestReal.h)} after tax, costs & cost of living`} tone="good" />
          <Stat label="Best value per hour" value={bestHourly.o.name} sub={`${money(bestHourly.b.hourly, s.currency, 2)} per hour incl. commute`} tone="accent" />
        </Stats>
      )}

      <Panel title="Side-by-side">
        <Table
          head={[
            '',
            ...s.offers.map((o, i) => (
              <span key={o.id} style={{ borderBottom: `3px solid ${color(i)}` }}>
                {o.name}
              </span>
            )),
          ]}
          rows={ROWS.map(([label, f, show, strong]) => {
            const top = strong && res.length > 1 ? best(f) : null
            return [
              strong ? <b key="l">{label}</b> : label,
              ...res.map((r) => (
                <span key={r.o.id} style={{ fontWeight: strong ? 700 : undefined, color: r === top ? 'var(--ok)' : undefined }}>
                  {show(f(r))}
                  {r === top ? ' ★' : ''}
                </span>
              )),
            ]
          })}
        />
      </Panel>

      <Panel title="What each offer is made of (per year)">
        <BarChart
          height={280}
          fy={(v) => m(v)}
          bars={res.map((r) => ({ label: r.o.name, value: [r.b.base, r.b.bonus, r.b.signing, r.b.equity, r.b.match + r.b.benefits] }))}
          stacks={[{ name: 'Base' }, { name: 'Bonus' }, { name: 'Signing (amortised)' }, { name: 'Equity' }, { name: 'Match & perks' }]}
        />
      </Panel>
      <Note>
        Equity is valued at what you expect to vest each year; discount startup equity heavily (many grants end up worth little). The effective tax rate is your total income tax ÷ gross income, not
        the top bracket. Cost-of-living index: 100 = where you live now; 135 means 35% pricier.
      </Note>
    </div>
  )
}
