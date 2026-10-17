import { useMemo } from 'react'
import { BarChart, Btn, Check, CsvButton, fmt, JsonButtons, money, Note, Num, Panel, pct, Row, Select, Slider, Split, Stat, Stats, Table, uid, useToolState } from '../kit'
import { bestBlend, NUTRIENTS, PRODUCTS, supplied, type Nutrient, type Product } from './lib/fertilizer-blend-calculator'

const CROPS: [string, number, number, number, number][] = [
  ['Winter wheat (8 t/ha)', 180, 70, 60, 20],
  ['Maize (10 t/ha)', 160, 80, 90, 15],
  ['Potato (45 t/ha)', 160, 110, 220, 20],
  ['Rapeseed (4 t/ha)', 190, 70, 80, 40],
  ['Soybean (3 t/ha)', 20, 60, 80, 15],
  ['Lawn / turf (per season)', 150, 50, 100, 10],
  ['Tomato, field (60 t/ha)', 150, 100, 200, 30],
]
const LABEL: Record<Nutrient, string> = { n: 'N', p: 'P₂O₅', k: 'K₂O', s: 'S' }
const DEF = {
  crop: CROPS[0][0],
  target: { n: 180, p: 70, k: 60, s: 20 } as Record<Nutrient, number>,
  area: 25,
  areaUnit: 'ha' as 'ha' | 'ac',
  currency: '$',
  bag: 50,
  capOn: false,
  cap: 20,
  products: PRODUCTS,
}

export default function FertilizerBlendCalculator() {
  const [s, set, reset] = useToolState('fertilizer-blend-calculator', DEF)
  const ha = s.areaUnit === 'ha' ? s.area : s.area * 0.404686
  const m = (x: number) => money(x, s.currency, 0)
  const res = useMemo(() => bestBlend(s.products, s.target, s.capOn ? s.cap / 100 : undefined), [s.products, s.target, s.capOn, s.cap])
  const used = res.rates.filter((r) => r.kg > 1e-6)
  const got = supplied(res.rates)
  const totalKg = used.reduce((a, r) => a + r.kg, 0)

  const compare = useMemo(() => {
    const cap = s.capOn ? s.cap / 100 : undefined
    const rows: { name: string; cost: number; mix: string }[] = []
    const mix = (r: ReturnType<typeof bestBlend>) => r.rates.filter((x) => x.kg > 1e-6).map((x) => `${x.p.name} ${Math.round(x.kg)}`).join(' + ')
    rows.push({ name: 'Optimal blend', cost: res.cost, mix: mix(res) })
    const straights = bestBlend(s.products.map((p) => ({ ...p, on: p.on && [p.n, p.p, p.k].filter((v) => v > 0).length <= 1 })), s.target, cap)
    rows.push({ name: 'Straight fertilizers only', cost: straights.cost, mix: straights.status === 'optimal' ? mix(straights) : 'not possible' })
    for (const u of res.rates.filter((r) => r.kg > 1e-6)) {
      const alt = bestBlend(s.products.map((p) => (p.id === u.p.id ? { ...p, on: false } : p)), s.target, cap)
      rows.push({ name: `Without ${u.p.name}`, cost: alt.cost, mix: alt.status === 'optimal' ? mix(alt) : 'not possible' })
    }
    return rows
  }, [s.products, s.target, s.capOn, s.cap, res])

  const editP = (id: string, patch: Partial<Product>) => set({ products: s.products.map((p) => (p.id === id ? { ...p, ...patch } : p)) })
  const setT = (nu: Nutrient, v: number) => set({ target: { ...s.target, [nu]: Math.max(0, v) }, crop: '' })
  const pick = (name: string) => {
    const c = CROPS.find((x) => x[0] === name)
    if (c) set({ crop: name, target: { n: c[1], p: c[2], k: c[3], s: c[4] } })
  }

  return (
    <Split wide="right">
      <div>
        <Panel title="Nutrient targets (kg/ha)">
          <Select label="Crop preset" value={s.crop} onChange={pick} options={[['', 'Custom'] as const, ...CROPS.map((c) => [c[0], c[0]] as const)]} />
          <Row>
            {NUTRIENTS.map((nu) => <Num key={nu} label={LABEL[nu]} value={s.target[nu]} onChange={(v) => setT(nu, v)} min={0} unit="kg/ha" />)}
          </Row>
          <p className="muted" style={{ fontSize: 13, margin: 0 }}>Use your soil test recommendation. Phosphate and potash are given as oxides (P₂O₅, K₂O), as on fertilizer labels.</p>
        </Panel>
        <Panel title="Field">
          <Row>
            <Num label="Area" value={s.area} onChange={(area) => set({ area: Math.max(0, area) })} min={0} />
            <Select label="Unit" value={s.areaUnit} onChange={(areaUnit) => set({ areaUnit })} options={[['ha', 'hectares'], ['ac', 'acres']] as const} />
          </Row>
          <Row>
            <Num label="Bag size" value={s.bag} onChange={(bag) => set({ bag: Math.max(1, bag) })} unit="kg" min={1} />
            <Select label="Currency" value={s.currency} onChange={(currency) => set({ currency })} options={['$', '€', '£', '₴', 'zł', '₹', 'R$']} />
          </Row>
          <Check label="Limit over-application" value={s.capOn} onChange={(capOn) => set({ capOn })} />
          {s.capOn && <Slider label="Max above target" value={s.cap} onChange={(cap) => set({ cap })} min={0} max={100} unit="%" show={(v) => `${v}%`} />}
        </Panel>
      </div>
      <div>
        <Stats>
          <Stat label="Cost per hectare" value={res.status === 'optimal' ? m(res.cost) : '—'} tone="accent" sub={res.status === 'optimal' ? `${money(res.cost * 0.404686, s.currency, 0)} per acre` : ''} />
          <Stat label="Total cost" value={res.status === 'optimal' ? m(res.cost * ha) : '—'} sub={`${fmt(ha, 4)} ha`} />
          <Stat label="Product applied" value={`${Math.round(totalKg)} kg/ha`} sub={`${fmt((totalKg * ha) / 1000, 4)} t total`} />
          <Stat label="Bags needed" value={used.reduce((a, r) => a + Math.ceil((r.kg * ha) / s.bag), 0)} sub={`${s.bag} kg bags`} />
        </Stats>
        {res.status === 'infeasible' && <Note tone="err">No mix of the enabled products can meet these targets{s.capOn ? ' within the over-application limit. Raise the limit or enable more products' : '. Enable a product that supplies the missing nutrient'}.</Note>}
        {res.status === 'optimal' && (
          <>
            <Panel title="Least-cost blend" actions={<CsvButton name="fertilizer-plan.csv" rows={() => [['Product', 'kg/ha', 'kg field', 'Bags', 'Cost/ha'], ...used.map((r) => [r.p.name, r.kg.toFixed(1), (r.kg * ha).toFixed(0), Math.ceil((r.kg * ha) / s.bag), ((r.kg * r.p.price) / 1000).toFixed(2)])]} />}>
              <Table
                head={['Product', 'Analysis', 'kg/ha', 'Whole field', 'Bags', 'Cost/ha', 'Share']}
                rows={used.map((r) => [
                  <b key="n">{r.p.name}</b>,
                  `${r.p.n}-${r.p.p}-${r.p.k}${r.p.s ? ` +${r.p.s}S` : ''}`,
                  fmt(r.kg, 4),
                  `${fmt((r.kg * ha) / 1000, 4)} t`,
                  Math.ceil((r.kg * ha) / s.bag),
                  m((r.kg * r.p.price) / 1000),
                  pct((r.kg * r.p.price) / 1000 / (res.cost || 1), 0),
                ])}
                foot={['Total', '', fmt(totalKg, 4), `${fmt((totalKg * ha) / 1000, 4)} t`, '', m(res.cost), '']}
              />
            </Panel>
            <Panel title="Supplied vs target (kg/ha)">
              <BarChart
                height={220}
                bars={NUTRIENTS.flatMap((nu) => [
                  { label: `${LABEL[nu]} goal`, value: s.target[nu], color: '#94a3b8' },
                  { label: `${LABEL[nu]} got`, value: got[nu], color: got[nu] > s.target[nu] * 1.15 + 1 ? '#f59e0b' : '#22c55e' },
                ])}
              />
              <p className="muted" style={{ fontSize: 13 }}>
                {NUTRIENTS.filter((nu) => got[nu] > s.target[nu] + 0.5).map((nu) => `${LABEL[nu]} +${fmt(got[nu] - s.target[nu], 3)} kg`).join(', ') || 'Every target is met exactly.'}
                {NUTRIENTS.some((nu) => got[nu] > s.target[nu] + 0.5) && ' over target (a side effect of the cheapest mix; limit it with "Limit over-application").'}
              </p>
            </Panel>
          </>
        )}
        <Panel title="Cost per hectare comparison">
          <Table
            head={['Strategy', 'Cost/ha', 'vs optimal', 'Mix (kg/ha)']}
            rows={compare.map((r) => [
              r.name,
              Number.isFinite(r.cost) ? m(r.cost) : '—',
              Number.isFinite(r.cost) && Number.isFinite(res.cost) ? (r.cost - res.cost < 0.5 ? '—' : `+${m(r.cost - res.cost)}`) : '—',
              <span key="m" className="muted" style={{ fontSize: 13 }}>{r.mix}</span>,
            ])}
          />
          <Table
            head={['Product', 'Price per kg N', 'per kg P₂O₅', 'per kg K₂O']}
            rows={s.products.filter((p) => p.on).map((p) => [p.name, ...(['n', 'p', 'k'] as const).map((nu) => (p[nu] > 0 && [p.n, p.p, p.k].filter((v) => v > 0).length === 1 ? money(p.price / 10 / p[nu], s.currency, 2) : p[nu] > 0 ? <span key={nu} className="muted">mixed</span> : ''))])}
            max={8}
          />
        </Panel>
        <Panel title="Products & prices (per tonne)" actions={<Btn onClick={() => set({ products: [...s.products, { id: uid(), name: 'Custom blend', n: 20, p: 20, k: 0, s: 0, price: 500, on: true }] })}>+ Product</Btn>}>
          <Table
            head={['', 'Product', 'N', 'P₂O₅', 'K₂O', 'S', 'Price', '']}
            rows={s.products.map((p) => [
              <input key="on" type="checkbox" checked={p.on} onChange={(e) => editP(p.id, { on: e.target.checked })} aria-label="Available" />,
              <input key="n" value={p.name} onChange={(e) => editP(p.id, { name: e.target.value })} aria-label="Name" style={{ width: 130 }} />,
              ...NUTRIENTS.map((nu) => <input key={nu} type="number" min={0} max={100} value={p[nu]} onChange={(e) => editP(p.id, { [nu]: Math.max(0, Math.min(100, +e.target.value || 0)) })} aria-label={LABEL[nu]} style={{ width: 46 }} />),
              <input key="pr" type="number" min={0} value={p.price} onChange={(e) => editP(p.id, { price: Math.max(0, +e.target.value || 0) })} aria-label="Price per tonne" style={{ width: 66 }} />,
              <Btn key="x" kind="ghost" onClick={() => set({ products: s.products.filter((x) => x.id !== p.id) })} title="Remove">✕</Btn>,
            ])}
          />
          <Row>
            <JsonButtons name="fertilizer-blend.json" data={s} onLoad={(d) => set(d)} />
            <Btn kind="ghost" onClick={reset}>Reset</Btn>
          </Row>
        </Panel>
        <Note>Solved as a linear program: minimise Σ price × rate subject to each nutrient ≥ target. Check local regulations (e.g. nitrate limits) and split nitrogen into several applications.</Note>
      </div>
    </Split>
  )
}
