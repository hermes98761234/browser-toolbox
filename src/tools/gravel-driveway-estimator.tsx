import { Btn, Check, CsvButton, Donut, money, Note, num, Num, Panel, Row, Seg, Select, Split, Stat, Stats, Table, Txt, uid, useToolState } from '../kit'
import { FT, IN, layer, mat, MATERIALS, SHORT_TON, TRUCKS, trucks, YD3 } from './lib/gravel-driveway-estimator'

type Units = 'imp' | 'met'
interface Section { id: string; name: string; l: number; w: number }
interface Layer { id: string; mat: string; depth: number; price: number }
interface S { units: Units; sections: Section[]; layers: Layer[]; waste: number; truck: string; delivery: number; fabric: boolean; fabricPrice: number }

const DEF: S = {
  units: 'imp',
  sections: [
    { id: 'a', name: 'Driveway', l: 80, w: 12 },
    { id: 'b', name: 'Parking pad', l: 20, w: 18 },
  ],
  layers: [
    { id: 'l1', mat: 'n3', depth: 6, price: 38 },
    { id: 'l2', mat: 'cr', depth: 4, price: 32 },
    { id: 'l3', mat: 'n411', depth: 2, price: 42 },
  ],
  waste: 10,
  truck: 'tandem',
  delivery: 120,
  fabric: true,
  fabricPrice: 0.35,
}

const PRESETS: [string, [string, number][]][] = [
  ['Standard 3-layer', [['n3', 6], ['cr', 4], ['n411', 2]]],
  ['Budget (road base only)', [['cr', 6]]],
  ['Heavy vehicles / RV', [['n3', 8], ['cr', 6], ['n57', 3]]],
  ['Path / light use', [['cr', 3], ['pea', 2]]],
]
const GRID = { display: 'grid', gridTemplateColumns: 'minmax(0, 2fr) minmax(70px, 1fr) minmax(70px, 1fr) auto', gap: 8, alignItems: 'end' } as const
const STONE: Record<string, [number, string]> = { n3: [5, '#8b8f97'], n57: [3, '#a3a7ad'], cr: [1.6, '#b8a58a'], n411: [1.8, '#c2b8a3'], rca: [2.6, '#bdbdb6'], qp: [1.2, '#cfc6b2'], dg: [1.1, '#d6a76c'], pea: [2.2, '#d9c7a3'], river: [3.4, '#9aa5b1'] }

export default function GravelDrivewayEstimator() {
  const [s, set, reset] = useToolState<S>('gravel-driveway-estimator', DEF)
  const imp = s.units === 'imp'
  const cur = (x: number) => money(x, '$', 0)
  const L = imp ? FT : 1 // length unit → m
  const D = imp ? IN : 0.01 // depth unit → m
  const truck = TRUCKS.find((t) => t.id === s.truck) ?? TRUCKS[2]

  const area = s.sections.reduce((a, x) => a + Math.max(0, x.l) * Math.max(0, x.w), 0) * L * L // m²
  const perim = s.sections.reduce((a, x) => a + 2 * (x.l + x.w), 0) * L
  const res = s.layers.map((ly) => {
    const m = mat(ly.mat)
    const r = layer(area, ly.depth * D, m, s.waste / 100)
    const tons = imp ? r.kg / SHORT_TON : r.kg / 1000
    return { ly, m, ...r, tons, vol: imp ? r.loose / YD3 : r.loose, loads: trucks(r.kg, r.loose, truck), cost: tons * ly.price }
  })
  const totTons = res.reduce((a, r) => a + r.tons, 0)
  const totVol = res.reduce((a, r) => a + r.vol, 0)
  const totLoads = res.reduce((a, r) => a + r.loads, 0)
  const fabricArea = area * 1.1 / (imp ? FT * FT : 1)
  const totCost = res.reduce((a, r) => a + r.cost, 0) + totLoads * s.delivery + (s.fabric ? fabricArea * s.fabricPrice : 0)
  const depth = s.layers.reduce((a, l) => a + l.depth, 0)

  const switchUnits = (units: Units) => {
    if (units === s.units) return
    const toMet = units === 'met'
    const r = (x: number, d = 1) => Math.round(x * 10 ** d) / 10 ** d
    set({
      units,
      sections: s.sections.map((x) => ({ ...x, l: r(toMet ? x.l * FT : x.l / FT), w: r(toMet ? x.w * FT : x.w / FT) })),
      layers: s.layers.map((l) => ({ ...l, depth: r(toMet ? l.depth * 2.54 : l.depth / 2.54, 0), price: r(toMet ? l.price / 0.907185 : l.price * 0.907185, 0) })),
      fabricPrice: r(toMet ? s.fabricPrice / (FT * FT) : s.fabricPrice * FT * FT, 2),
    })
  }
  const editSec = (id: string, p: Partial<Section>) => set({ sections: s.sections.map((x) => (x.id === id ? { ...x, ...p } : x)) })
  const editLy = (id: string, p: Partial<Layer>) => set({ layers: s.layers.map((x) => (x.id === id ? { ...x, ...p } : x)) })
  const preset = (i: number) => set({ layers: PRESETS[i][1].map(([m, d], j) => ({ id: uid(), mat: m, depth: imp ? d : Math.round(d * 2.54), price: s.layers[j]?.price ?? (imp ? 35 : 39) })) })

  const lu = imp ? 'ft' : 'm', du = imp ? 'in' : 'cm', tu = imp ? 'tons' : 't', vu = imp ? 'yd³' : 'm³'

  // cross-section drawing
  const W = 560, H = 190, top = 34, scale = Math.min(18, 130 / Math.max(1, depth))
  const hs = [...s.layers].reverse().map((ly) => Math.max(6, ly.depth * scale))
  const bands = [...s.layers].reverse().map((ly, i) => ({ ly, h: hs[i], y: top + hs.slice(0, i).reduce((a, b) => a + b, 0) }))
  const y = top + hs.reduce((a, b) => a + b, 0)

  return (
    <Split>
      <div>
        <Panel title="Driveway area" actions={<Seg value={s.units} onChange={switchUnits} options={[['imp', 'ft / in'], ['met', 'm / cm']]} />}>
          {s.sections.map((x) => (
            <div key={x.id} style={GRID}>
              <Txt label="Section" value={x.name} onChange={(name) => editSec(x.id, { name })} />
              <Num label="Length" value={x.l} onChange={(l) => editSec(x.id, { l })} unit={lu} min={0} />
              <Num label="Width" value={x.w} onChange={(w) => editSec(x.id, { w })} unit={lu} min={0} />
              <Btn kind="ghost" onClick={() => set({ sections: s.sections.filter((z) => z.id !== x.id) })} title="Remove">✕</Btn>
            </div>
          ))}
          <Row>
            <Btn onClick={() => set({ sections: [...s.sections, { id: uid(), name: 'Turnaround', l: imp ? 20 : 6, w: imp ? 12 : 4 }] })}>+ Section</Btn>
            <span className="muted">Total {num(area / (L * L), 0)} {lu}² · perimeter ≈ {num(perim / L, 0)} {lu}</span>
          </Row>
        </Panel>
        <Panel title="Layer stack (bottom → top)" actions={<Btn kind="ghost" onClick={reset}>Reset</Btn>}>
          <Row>
            {PRESETS.map(([n], i) => <Btn key={n} onClick={() => preset(i)}>{n}</Btn>)}
          </Row>
          {s.layers.map((ly, i) => (
            <div key={ly.id} style={{ borderTop: '1px solid var(--line)', paddingTop: 8, marginTop: 8 }}>
              <Select label={`Layer ${i + 1} — ${mat(ly.mat).use}`} value={ly.mat} onChange={(m) => editLy(ly.id, { mat: m })} options={MATERIALS.map((m) => [m.id, m.name] as [string, string])} />
              <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr) auto', gap: 8, alignItems: 'end' }}>
                <Num label="Compacted depth" value={ly.depth} onChange={(depth) => editLy(ly.id, { depth })} unit={du} min={0} />
                <Num label="Price" value={ly.price} onChange={(price) => editLy(ly.id, { price })} unit={`$/${imp ? 'ton' : 't'}`} min={0} />
                <Btn kind="ghost" onClick={() => set({ layers: s.layers.filter((z) => z.id !== ly.id) })} title="Remove layer">✕</Btn>
              </div>
            </div>
          ))}
          <Btn onClick={() => set({ layers: [...s.layers, { id: uid(), mat: 'n57', depth: imp ? 2 : 5, price: imp ? 40 : 44 }] })}>+ Layer</Btn>
          {depth < (imp ? 6 : 15) && <Note tone="warn">Under {imp ? '6 in' : '15 cm'} of total stone usually ruts under car traffic — 8–12 in is typical.</Note>}
        </Panel>
        <Panel title="Ordering">
          <Row>
            <Num label="Waste / spillage" value={s.waste} onChange={(waste) => set({ waste })} unit="%" min={0} max={50} />
            <Select label="Truck" value={s.truck} onChange={(truck) => set({ truck })} options={TRUCKS.map((t) => [t.id, `${t.name} (${t.tons} tons / ${t.yd3} yd³)`] as [string, string])} />
            <Num label="Delivery fee / load" value={s.delivery} onChange={(delivery) => set({ delivery })} unit="$" min={0} />
          </Row>
          <Check label="Geotextile fabric under the base (+10% overlap)" value={s.fabric} onChange={(fabric) => set({ fabric })} />
          {s.fabric && <Num label="Fabric price" value={s.fabricPrice} onChange={(fabricPrice) => set({ fabricPrice })} unit={`$/${lu}²`} min={0} />}
        </Panel>
      </div>
      <div>
        <Stats>
          <Stat label="Total stone" value={`${num(totTons, 1)} ${tu}`} sub={`${num(totVol, 1)} ${vu} loose`} tone="accent" />
          <Stat label="Truckloads" value={totLoads} sub={truck.name} />
          <Stat label="Estimated cost" value={cur(totCost)} sub={`${money(totCost / Math.max(1e-9, area / (L * L)), '$', 2)} per ${lu}²`} />
          <Stat label="Total depth" value={`${num(depth, 1)} ${du}`} sub={`${num(area / (L * L), 0)} ${lu}²`} />
        </Stats>
        <Panel title="Cross-section">
          <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', height: 'auto', display: 'block' }} role="img" aria-label="layer cross-section">
            <text x={40} y={24} fontSize={12} fill="var(--muted)">surface</text>
            {bands.map(({ ly, y: by, h }) => {
              const [r, c] = STONE[ly.mat] ?? [2, '#aaa']
              const dots = []
              for (let yy = by + r; yy < by + h - r * 0.5; yy += r * 2.4) for (let xx = 42 + ((yy * 7) % (r * 3)); xx < W - 192; xx += r * 3) dots.push(<circle key={`${xx}-${yy}`} cx={xx} cy={yy} r={r} fill="rgba(0,0,0,.18)" />)
              return (
                <g key={ly.id}>
                  <rect x={40} y={by} width={W - 230} height={h} fill={c} />
                  {dots}
                  <text x={W - 182} y={by + h / 2 + 4} fontSize={12} fill="var(--fg)">{num(ly.depth, 1)} {du} · {mat(ly.mat).name.split(/ \(| \//)[0]}</text>
                </g>
              )
            })}
            {s.fabric && <line x1={40} x2={W - 190} y1={y + 1} y2={y + 1} stroke="#1e293b" strokeWidth={3} strokeDasharray="10 4" />}
            <rect x={40} y={y + 3} width={W - 230} height={Math.max(10, H - y - 3)} fill="#7c5a3a" opacity={0.7} />
            <text x={46} y={Math.min(H - 4, y + 18)} fontSize={11} fill="#fff">compacted subgrade{s.fabric ? ' + geotextile' : ''}</text>
          </svg>
        </Panel>
        <Panel title="Order list" actions={<CsvButton name="gravel-order.csv" rows={() => [['Layer', 'Material', `Depth ${du}`, `Compacted ${vu}`, `Loose ${vu}`, `Weight ${tu}`, 'Loads', 'Cost $'], ...res.map((r, i) => [i + 1, r.m.name, r.ly.depth, +(imp ? r.compacted / YD3 : r.compacted).toFixed(2), +r.vol.toFixed(2), +r.tons.toFixed(2), r.loads, Math.round(r.cost)])]} />}>
          <Table
            head={['Material', 'Depth', `Loose ${vu}`, `Weight`, 'Loads', 'Cost']}
            rows={res.map((r) => [
              <span key="m">{r.m.name}<br /><span className="muted" style={{ fontSize: 12 }}>{num(r.m.density * (imp ? 2.20462 / 35.3147 : 1), 0)} {imp ? 'lb/ft³' : 'kg/m³'} · ×{r.m.compaction} compaction</span></span>,
              `${num(r.ly.depth, 1)} ${du}`, num(r.vol, 1), `${num(r.tons, 1)} ${tu}`, r.loads, cur(r.cost),
            ])}
            foot={['Total', `${num(depth, 1)} ${du}`, num(totVol, 1), `${num(totTons, 1)} ${tu}`, totLoads, cur(res.reduce((a, r) => a + r.cost, 0))]}
          />
          <p className="muted" style={{ fontSize: 13 }}>
            Plus delivery {cur(totLoads * s.delivery)}{s.fabric && <> and {num(fabricArea, 0)} {lu}² of fabric {cur(fabricArea * s.fabricPrice)}</>}. Each layer is ordered separately, so loads are rounded per layer.
          </p>
        </Panel>
        <Panel title="Cost breakdown">
          <Donut slices={[...res.map((r) => ({ label: r.m.name.split(' (')[0], value: r.cost })), { label: 'Delivery', value: totLoads * s.delivery }, ...(s.fabric ? [{ label: 'Fabric', value: fabricArea * s.fabricPrice }] : [])]} fv={cur} center={<b>{cur(totCost)}</b>} />
        </Panel>
        <Note>Tips: crown the surface 2–4% so water sheds to the sides, compact each layer in 2–3 {du === 'in' ? 'inch' : '5–8 cm'} lifts with a plate compactor, and keep the top layer angular (crushed) so it locks together.</Note>
      </div>
    </Split>
  )
}
