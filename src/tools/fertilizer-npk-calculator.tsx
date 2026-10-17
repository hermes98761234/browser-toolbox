import { Btn, CopyButton, Note, num, Num, Panel, Row, Select, Seg, Split, Stat, Stats, Table, Txt, uid, useToolState } from '../kit'
import {
  AREA_UNITS, type AreaUnit, costPerKgNutrient, delivered, gramsPerLitre, K_FROM_K2O, type Nut, P_FROM_P2O5, parseLabel, type Product, productGrams, ratio, type RateUnit,
} from './lib/fertilizer-npk-calculator'

interface State {
  sys: 'imperial' | 'metric'
  area: number
  areaUnit: AreaUnit
  nut: Nut
  target: number
  rateUnit: RateUnit
  splits: number
  sel: string
  ppm: number
  tank: number
  currency: string
  products: Product[]
}

const P = (name: string, n: number, p: number, k: number, bag: number, price: number): Product => ({ id: name.toLowerCase().replace(/\W+/g, '-'), name, n, p, k, bag, price })
const DEF: State = {
  sys: 'imperial', area: 5000, areaUnit: 'ft2', nut: 'n', target: 1, rateUnit: 'lb/1000ft2', splits: 1, sel: 'lawn-food-29-0-4', ppm: 150, tank: 2, currency: '$',
  products: [
    P('Lawn food 29-0-4', 29, 0, 4, 5.44, 32), // 12 lb bag
    P('All-purpose 10-10-10', 10, 10, 10, 18.14, 21), // 40 lb
    P('Urea 46-0-0', 46, 0, 0, 22.68, 38), // 50 lb
    P('Starter 18-24-12', 18, 24, 12, 6.8, 26),
    P('Organic 5-3-4', 5, 3, 4, 11.34, 30),
    P('Soluble 20-20-20', 20, 20, 20, 2.27, 24),
  ],
}

const NUT_NAME: Record<Nut, string> = { n: 'Nitrogen (N)', p: 'Phosphate (P₂O₅)', k: 'Potash (K₂O)' }
const PRESETS: [string, Partial<State>][] = [
  ['Lawn feeding · 1 lb N / 1000 ft²', { nut: 'n', target: 1, rateUnit: 'lb/1000ft2', sys: 'imperial' }],
  ['Lawn (cool season, light) · 0.5 lb N', { nut: 'n', target: 0.5, rateUnit: 'lb/1000ft2', sys: 'imperial' }],
  ['Vegetable bed · 0.2 lb N / 100 ft² ≈ 2 lb / 1000', { nut: 'n', target: 2, rateUnit: 'lb/1000ft2', sys: 'imperial' }],
  ['New lawn starter · 1 lb P₂O₅ / 1000 ft²', { nut: 'p', target: 1, rateUnit: 'lb/1000ft2', sys: 'imperial' }],
  ['Corn · 150 lb N / acre', { nut: 'n', target: 150, rateUnit: 'lb/acre', sys: 'imperial', area: 2, areaUnit: 'acre' }],
  ['Wheat · 120 kg N / ha', { nut: 'n', target: 120, rateUnit: 'kg/ha', sys: 'metric', area: 1, areaUnit: 'ha' }],
  ['Garden · 10 g N / m²', { nut: 'n', target: 10, rateUnit: 'g/m2', sys: 'metric', area: 40, areaUnit: 'm2' }],
]

export default function FertilizerNpkCalculator() {
  const [s, set, reset] = useToolState('fertilizer-npk-calculator', DEF)
  const prod = s.products.find((p) => p.id === s.sel) ?? s.products[0]
  const imp = s.sys === 'imperial'
  const mass = (g: number) => (!Number.isFinite(g) ? '—' : imp ? (g >= 453.59237 ? `${num(g / 453.59237, 2)} lb` : `${num(g / 28.3495, 1)} oz`) : g >= 1000 ? `${num(g / 1000, 2)} kg` : `${num(g, 0)} g`)
  const bagLabel = (kg: number) => (imp ? `${num(kg * 2.20462, 1)} lb` : `${num(kg, 1)} kg`)
  const cur = (x: number) => (Number.isFinite(x) ? `${s.currency}${num(x, 2)}` : '—')
  const need = (p: Product) => productGrams(s.target, s.rateUnit, s.area, s.areaUnit, p[s.nut])
  const g = prod ? need(prod) : Infinity
  const per = g / Math.max(1, s.splits)
  const del = prod && Number.isFinite(g) ? delivered(prod, g, s.rateUnit, s.area, s.areaUnit) : { n: 0, p: 0, k: 0 }
  const bags = prod && prod.bag > 0 ? g / 1000 / prod.bag : Infinity
  const cost = prod ? (g / 1000 / prod.bag) * prod.price : Infinity
  const editP = (id: string, p: Partial<Product>) => set({ products: s.products.map((x) => (x.id === id ? { ...x, ...p } : x)) })
  const rank = s.products.map((p) => ({ p, g: need(p), cost: (need(p) / 1000 / p.bag) * p.price })).sort((a, b) => a.cost - b.cost)

  const solLpg = gramsPerLitre(s.ppm, prod?.[s.nut] ?? 0)
  const tankL = imp ? s.tank * 3.785411784 : s.tank
  const steps = prod && Number.isFinite(g)
    ? [
        `Target: ${s.target} ${s.rateUnit.replace('ft2', 'ft²').replace('m2', 'm²')} of ${NUT_NAME[s.nut]} over ${num(s.area, 2)} ${s.areaUnit.replace('2', '²')}.`,
        `Weigh out ${mass(g)} of ${prod.name}${s.splits > 1 ? ` in total — ${mass(per)} per application, ${s.splits} applications 4–8 weeks apart` : ''}.`,
        `Set the spreader to a low setting and apply half the amount walking north–south, then the other half east–west for even coverage.`,
        `Water in with about ¼ inch (6 mm) of water unless the label says otherwise; sweep granules off paths and drives.`,
        `This also supplies ${num(del.n, 2)} N · ${num(del.p, 2)} P₂O₅ · ${num(del.k, 2)} K₂O (${s.rateUnit.replace('ft2', 'ft²').replace('m2', 'm²')}).`,
      ]
    : []

  return (
    <Split>
      <div>
        <Panel title="Area & target" actions={<Seg value={s.sys} onChange={(sys) => set(sys === 'imperial' ? { sys, rateUnit: 'lb/1000ft2', areaUnit: 'ft2', tank: 2 } : { sys, rateUnit: 'g/m2', areaUnit: 'm2', tank: 10 })} options={[['imperial', 'US'], ['metric', 'Metric']]} />}>
          <Select label="Preset" value={-1} onChange={(i) => i >= 0 && set(PRESETS[i][1])} options={[[-1, 'Choose a common target…'], ...PRESETS.map((p, i) => [i, p[0]] as [number, string])]} />
          <Row>
            <Num label="Area" value={s.area} min={0} onChange={(area) => set({ area })} />
            <Select label="Area unit" value={s.areaUnit} onChange={(areaUnit) => set({ areaUnit })} options={(Object.keys(AREA_UNITS) as AreaUnit[]).map((u) => [u, u.replace('2', '²')] as [AreaUnit, string])} />
          </Row>
          <Row>
            <Select label="Nutrient to target" value={s.nut} onChange={(nut) => set({ nut })} options={(['n', 'p', 'k'] as Nut[]).map((n) => [n, NUT_NAME[n]] as [Nut, string])} />
          </Row>
          <Row>
            <Num label="Rate" value={s.target} min={0} onChange={(target) => set({ target })} />
            <Select label="Rate unit" value={s.rateUnit} onChange={(rateUnit) => set({ rateUnit })} options={[['lb/1000ft2', 'lb / 1000 ft²'], ['lb/acre', 'lb / acre'], ['kg/ha', 'kg / ha'], ['g/m2', 'g / m²']] as [RateUnit, string][]} />
          </Row>
          <Num label="Split into applications" value={s.splits} min={1} max={12} step={1} onChange={(splits) => set({ splits: Math.max(1, Math.round(splits)) })} />
        </Panel>

        <Panel title="Products (label N-P-K)" actions={<><Btn onClick={() => set({ products: [...s.products, { id: uid(), name: 'New 15-15-15', n: 15, p: 15, k: 15, bag: 10, price: 20 }] })}>+ Product</Btn><Btn kind="ghost" onClick={reset}>Reset</Btn></>}>
          <Table
            head={['', 'Name', 'N-P-K', `Bag (${imp ? 'lb' : 'kg'})`, `Price`, '']}
            rows={s.products.map((p) => [
              <input key="r" type="radio" name="fert-sel" checked={p.id === prod?.id} onChange={() => set({ sel: p.id })} aria-label={`Use ${p.name}`} />,
              <input key="n" value={p.name} onChange={(e) => editP(p.id, { name: e.target.value })} aria-label="Name" style={{ width: 140 }} />,
              <LabelInput key="l" p={p} onChange={(v) => editP(p.id, { n: v[0], p: v[1], k: v[2] })} />,
              <input key="b" type="number" min={0} step="any" value={+(imp ? p.bag * 2.20462 : p.bag).toFixed(2)} onChange={(e) => editP(p.id, { bag: Math.max(0, (Number(e.target.value) || 0) / (imp ? 2.20462 : 1)) })} aria-label="Bag size" style={{ width: 64 }} />,
              <input key="c" type="number" min={0} step="any" value={p.price} onChange={(e) => editP(p.id, { price: Math.max(0, Number(e.target.value) || 0) })} aria-label="Price" style={{ width: 64 }} />,
              <Btn key="x" kind="ghost" title="Remove" onClick={() => set({ products: s.products.filter((x) => x.id !== p.id) })}>✕</Btn>,
            ])}
          />
          <Row><Txt label="Currency" value={s.currency} onChange={(currency) => set({ currency })} /></Row>
          <p className="muted" style={{ fontSize: 12.5, marginBottom: 0 }}>Labels list N, P₂O₅ and K₂O by weight. Elemental P = P₂O₅ × {P_FROM_P2O5}; K = K₂O × {K_FROM_K2O}.</p>
        </Panel>
      </div>

      <div>
        {prod && prod[s.nut] <= 0 && <Note tone="err">{prod.name} contains no {NUT_NAME[s.nut].toLowerCase()} — pick another product or nutrient.</Note>}
        <Stats>
          <Stat label="Product needed" value={mass(g)} sub={s.splits > 1 ? `${mass(per)} × ${s.splits}` : prod?.name} tone="accent" />
          <Stat label="Bags" value={Number.isFinite(bags) ? num(bags, 2) : '—'} sub={prod ? `buy ${Math.ceil(bags)} × ${bagLabel(prod.bag)}` : ''} />
          <Stat label="Cost" value={cur(cost)} sub={prod ? `${cur(costPerKgNutrient(prod, s.nut) / (imp ? 2.20462 : 1))} per ${imp ? 'lb' : 'kg'} of ${s.nut.toUpperCase()}` : ''} />
          <Stat label="Ratio" value={prod ? ratio(prod) : '—'} sub="N : P₂O₅ : K₂O" />
        </Stats>

        <Panel title="Nutrients delivered" >
          {(['n', 'p', 'k'] as Nut[]).map((n) => {
            const v = del[n]
            const max = Math.max(del.n, del.p, del.k, s.target) || 1
            return (
              <div key={n} style={{ marginBottom: 8 }}>
                <Row wrap={false}><b style={{ flex: 1 }}>{NUT_NAME[n]}</b><span>{num(v, 2)} <span className="muted">{s.rateUnit.replace('ft2', 'ft²').replace('m2', 'm²')}</span></span></Row>
                <div style={{ height: 10, background: 'var(--line)', borderRadius: 5, overflow: 'hidden' }}>
                  <div style={{ width: `${(v / max) * 100}%`, height: '100%', background: n === 'n' ? '#10b981' : n === 'p' ? '#6366f1' : '#f59e0b' }} />
                </div>
              </div>
            )
          })}
          {prod && <p className="muted" style={{ fontSize: 12.5, margin: 0 }}>Elemental: {num(del.p * P_FROM_P2O5, 2)} P and {num(del.k * K_FROM_K2O, 2)} K at the same rate unit. Soil-test before adding P — many soils already have plenty.</p>}
        </Panel>

        <Panel title="Product comparison" actions={<span className="muted" style={{ fontSize: 12.5 }}>to meet the {s.nut.toUpperCase()} target</span>}>
          <Table
            head={['Product', 'Amount', 'Bags', 'Cost', `Also gives`]}
            rows={rank.map(({ p, g: gg, cost: c }, i) => {
              const d = Number.isFinite(gg) ? delivered(p, gg, s.rateUnit, s.area, s.areaUnit) : null
              return [
                <button key="n" type="button" onClick={() => set({ sel: p.id })} style={{ background: 'none', border: 0, padding: 0, cursor: 'pointer', color: p.id === prod?.id ? 'var(--accent)' : 'inherit', fontWeight: 700, textAlign: 'left' }}>{i === 0 && Number.isFinite(c) ? '💰 ' : ''}{p.name}</button>,
                mass(gg),
                Number.isFinite(gg) && p.bag ? num(gg / 1000 / p.bag, 2) : '—',
                cur(c),
                d ? (['n', 'p', 'k'] as Nut[]).filter((n) => n !== s.nut && d[n] > 0).map((n) => `${num(d[n], 2)} ${n === 'n' ? 'N' : n === 'p' ? 'P₂O₅' : 'K₂O'}`).join(', ') || '—' : 'n/a',
              ]
            })}
          />
        </Panel>

        <Panel title="Mixing & application instructions" actions={<CopyButton text={() => steps.map((x, i) => `${i + 1}. ${x}`).join('\n')} />}>
          <ol style={{ margin: '0 0 10px', paddingLeft: 20, lineHeight: 1.55 }}>{steps.map((x) => <li key={x}>{x}</li>)}</ol>
          <h4 style={{ margin: '6px 0' }}>Water-soluble feeding</h4>
          <Row>
            <Num label={`Target ${s.nut.toUpperCase()} concentration`} value={s.ppm} min={1} max={2000} unit="ppm" onChange={(ppm) => set({ ppm })} />
            <Num label="Watering can / tank" value={s.tank} min={0} unit={imp ? 'gal' : 'L'} onChange={(tank) => set({ tank })} />
          </Row>
          {prod && Number.isFinite(solLpg) ? (
            <Note>Dissolve <b>{num(solLpg * tankL, 1)} g</b> of {prod.name} in {num(s.tank, 2)} {imp ? 'gal' : 'L'} ({num(solLpg, 2)} g/L ≈ {num(solLpg * tankL / 5, 1)} level tsp at ~5 g/tsp) for {s.ppm} ppm {s.nut.toUpperCase()}. Typical: 100–200 ppm N for containers, 50–100 ppm for seedlings.</Note>
          ) : <Note tone="warn">The selected product has no {s.nut.toUpperCase()}.</Note>}
        </Panel>
        <Note tone="warn">Always follow the product label and local rules (e.g. phosphorus bans, blackout dates near waterways). Over-application burns plants and pollutes water.</Note>
      </div>
    </Split>
  )
}

function LabelInput({ p, onChange }: { p: Product; onChange: (v: [number, number, number]) => void }) {
  const txt = `${p.n}-${p.p}-${p.k}`
  return (
    <input
      key={txt}
      defaultValue={txt}
      aria-label="N-P-K"
      style={{ width: 80 }}
      onBlur={(e) => { const v = parseLabel(e.target.value); if (v) onChange(v); else e.target.value = txt }}
      onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
    />
  )
}
