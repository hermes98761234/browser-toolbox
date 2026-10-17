import { Btn, CsvButton, Donut, JsonButtons, money, Note, Num, Panel, Row, Select, Seg, Split, Stat, Stats, Table, uid, useToolState } from '../kit'
import { BF_M3, line, totals, type Piece } from './lib/board-foot-calculator'

const SPECIES: [string, number][] = [
  ['Walnut', 14], ['Cherry', 9], ['White oak', 8], ['Red oak', 6.5], ['Hard maple', 7], ['Ash', 6], ['Poplar', 4.5], ['Pine (SPF)', 2.5], ['Douglas fir', 3], ['Cedar', 5], ['Sapele', 11], ['Other', 5],
]
const PRICE = Object.fromEntries(SPECIES)

const P = (name: string, species: string, t: number, w: number, l: number, qty: number): Piece => ({ id: uid(), name, species, t, w, l, qty, price: PRICE[species] })

const DEF = {
  metric: false,
  cur: '$',
  waste: 15,
  quick: { t: 1, w: 6, l: 8, qty: 1, species: 'Red oak' },
  pieces: [
    P('Table top', 'Walnut', 2, 8, 7, 5),
    P('Legs', 'Walnut', 3, 3, 2.5, 4),
    P('Aprons', 'White oak', 1, 5, 6, 2),
    P('End aprons', 'White oak', 1, 5, 3, 2),
    P('Bench seat', 'Cherry', 1.75, 12, 6, 1),
    P('Shop jig stock', 'Poplar', 0.75, 6, 8, 3),
  ],
}

const THICK = [['4/4', 1], ['5/4', 1.25], ['6/4', 1.5], ['8/4', 2], ['12/4', 3], ['16/4', 4]] as const
const DIMS = [['2×4', 2, 4], ['2×6', 2, 6], ['2×8', 2, 8], ['2×10', 2, 10], ['4×4', 4, 4], ['1×6', 1, 6]] as const

export default function BoardFootCalculator() {
  const [s, set, reset] = useToolState('board-foot-calculator', DEF)
  const met = s.metric
  const u = met ? { t: 'mm', w: 'mm', l: 'm', p: 'per m³' } : { t: 'in', w: 'in', l: 'ft', p: 'per BF' }
  const m = (x: number, d = 2) => money(x, s.cur, d)
  const q = { id: 'q', name: 'Quick', species: s.quick.species, t: s.quick.t, w: s.quick.w, l: s.quick.l, qty: s.quick.qty, price: met ? PRICE[s.quick.species] / BF_M3 : PRICE[s.quick.species] }
  const ql = line(q, met)
  const tot = totals(s.pieces, met, s.waste)
  const raw = totals(s.pieces, met, 0)
  const edit = (id: string, p: Partial<Piece>) => set({ pieces: s.pieces.map((x) => (x.id === id ? { ...x, ...p } : x)) })
  const setQ = (p: Partial<typeof s.quick>) => set({ quick: { ...s.quick, ...p } })

  const toggleUnits = (metric: boolean) => {
    if (metric === met) return
    const k = metric ? 25.4 : 1 / 25.4, kl = metric ? 0.3048 : 1 / 0.3048, kp = metric ? 1 / BF_M3 : BF_M3
    const r = (x: number, d: number) => +x.toFixed(d)
    set({
      metric,
      pieces: s.pieces.map((p) => ({ ...p, t: r(p.t * k, metric ? 1 : 3), w: r(p.w * k, metric ? 0 : 2), l: r(p.l * kl, metric ? 3 : 2), price: r(p.price * kp, 2) })),
      quick: { ...s.quick, t: r(s.quick.t * k, metric ? 1 : 3), w: r(s.quick.w * k, metric ? 0 : 2), l: r(s.quick.l * kl, metric ? 3 : 2) },
    })
  }
  const n = (v: number, on: (x: number) => void, w = 62) => <input type="number" min={0} step="any" value={v} onChange={(e) => on(Math.max(0, Number(e.target.value) || 0))} style={{ width: w }} />

  return (
    <div>
      <style>{`@media print { body * { visibility: hidden !important } .bf-print, .bf-print * { visibility: visible !important } .bf-print { position: absolute; inset: 0 auto auto 0; width: 100% } .bf-print input, .bf-print select { border: none !important; background: none !important } }`}</style>
      <Row>
        <Seg value={met ? 'm' : 'i'} onChange={(v) => toggleUnits(v === 'm')} options={[['i', 'Imperial (in, ft, per BF)'], ['m', 'Metric (mm, m, per m³)']]} />
        <div style={{ width: 110 }}>
          <Select label="Currency" value={s.cur} onChange={(cur) => set({ cur })} options={['$', '€', '£', 'C$', 'A$', '₴', 'zł']} />
        </div>
      </Row>
      <div style={{ height: 10 }} />
      <Split>
        <Panel title="Quick board">
          <Row>
            <Num label="Thickness" unit={u.t} value={s.quick.t} min={0} onChange={(t) => setQ({ t })} />
            <Num label="Width" unit={u.w} value={s.quick.w} min={0} onChange={(w) => setQ({ w })} />
            <Num label="Length" unit={u.l} value={s.quick.l} min={0} onChange={(l) => setQ({ l })} />
            <Num label="Pieces" value={s.quick.qty} min={1} step={1} onChange={(qty) => setQ({ qty: Math.max(1, Math.round(qty)) })} />
          </Row>
          {!met && (
            <>
              <Row>
                <span className="muted" style={{ fontSize: 13 }}>Hardwood:</span>
                {THICK.map(([l, t]) => <Btn key={l} kind={s.quick.t === t ? 'primary' : 'ghost'} onClick={() => setQ({ t })}>{l}</Btn>)}
              </Row>
              <Row>
                <span className="muted" style={{ fontSize: 13 }}>Dimensional (nominal):</span>
                {DIMS.map(([l, t, w]) => <Btn key={l} kind="ghost" onClick={() => setQ({ t, w })}>{l}</Btn>)}
              </Row>
            </>
          )}
          <Select label="Species" value={s.quick.species} onChange={(species) => setQ({ species })} options={SPECIES.map(([n2, p]) => [n2, `${n2} · ${s.cur}${met ? (p / BF_M3).toFixed(0) + '/m³' : p + '/BF'}`] as const)} />
          <Stats>
            <Stat label="Board feet" value={ql.bf.toFixed(2)} tone="accent" sub={`${(ql.bf / s.quick.qty).toFixed(3)} BF each`} />
            <Stat label="Volume" value={`${ql.m3.toFixed(4)} m³`} sub={`${(ql.m3 * 35.3147).toFixed(3)} ft³`} />
            <Stat label="Cost" value={m(ql.cost)} sub={`at ${s.cur}${met ? q.price.toFixed(0) + '/m³' : q.price + '/BF'}`} />
          </Stats>
          <Btn kind="primary" onClick={() => set({ pieces: [...s.pieces, { ...q, id: uid(), name: `Part ${s.pieces.length + 1}` }] })}>+ Add to project</Btn>
          <Note>
            Board feet = thickness (in) × width (in) × length (ft) ÷ 12. Use <b>nominal</b> sizes: rough hardwood is sold by its quarter thickness (4/4 = 1″) and a 2×4 counts as 2″ × 4″ even though it measures 1½″ × 3½″.
          </Note>
        </Panel>
        <div>
          <Stats>
            <Stat label="Project board feet" value={tot.all.bf.toFixed(1)} sub={`${raw.all.bf.toFixed(1)} net + ${s.waste}% waste`} tone="accent" />
            <Stat label="Volume" value={`${tot.all.m3.toFixed(3)} m³`} sub={`${(tot.all.m3 * 35.3147).toFixed(2)} ft³`} />
            <Stat label="Lumber cost" value={m(tot.all.cost)} sub={`${m(raw.all.cost)} before waste`} />
            <Stat label="Linear length" value={`${tot.all.linear.toFixed(1)} ${u.l}`} sub={`${s.pieces.reduce((a, p) => a + p.qty, 0)} pieces`} />
          </Stats>
          <Panel title="Cost by species">
            <Donut slices={tot.bySpecies.map(([k, v]) => ({ label: k, value: v.cost }))} fv={(v) => m(v, 0)} center={<span>{m(tot.all.cost, 0)}</span>} />
            <Table head={['Species', 'Board feet', 'm³', 'Cost']} rows={tot.bySpecies.map(([k, v]) => [k, v.bf.toFixed(1), v.m3.toFixed(3), m(v.cost)])} />
          </Panel>
        </div>
      </Split>
      <div className="bf-print">
        <Panel
          title="Project cut list"
          actions={
            <>
              <Num label="Waste" unit="%" value={s.waste} min={0} max={100} onChange={(waste) => set({ waste: Math.min(100, Math.max(0, waste)) })} />
              <Btn onClick={() => set({ pieces: [...s.pieces, { ...q, id: uid(), name: `Part ${s.pieces.length + 1}` }] })}>+ Row</Btn>
              <CsvButton name="board-feet.csv" rows={() => [['Part', 'Species', `T ${u.t}`, `W ${u.w}`, `L ${u.l}`, 'Qty', `Price ${u.p}`, 'BF (incl. waste)', 'm³', 'Cost'], ...s.pieces.map((p) => { const x = line(p, met, s.waste); return [p.name, p.species, p.t, p.w, p.l, p.qty, p.price, x.bf.toFixed(2), x.m3.toFixed(4), x.cost.toFixed(2)] })]} />
              <Btn onClick={() => window.print()}>🖨 Print</Btn>
              <JsonButtons name="board-feet.json" data={s} onLoad={(d) => set(d)} />
              <Btn kind="ghost" onClick={reset}>Reset</Btn>
            </>
          }
        >
          <Table
            head={['Part', 'Species', `T ${u.t}`, `W ${u.w}`, `L ${u.l}`, 'Qty', `${s.cur} ${u.p}`, 'BF', 'Cost', '']}
            rows={s.pieces.map((p) => {
              const x = line(p, met, s.waste)
              return [
                <input key="n" value={p.name} onChange={(e) => edit(p.id, { name: e.target.value })} style={{ width: 130 }} aria-label="Part" />,
                <select key="s" value={p.species} onChange={(e) => edit(p.id, { species: e.target.value, price: met ? +(PRICE[e.target.value] / BF_M3).toFixed(2) : PRICE[e.target.value] })} aria-label="Species">
                  {SPECIES.map(([n2]) => <option key={n2}>{n2}</option>)}
                </select>,
                n(p.t, (t) => edit(p.id, { t }), 58), n(p.w, (w) => edit(p.id, { w }), 58), n(p.l, (l) => edit(p.id, { l }), 58),
                n(p.qty, (qty) => edit(p.id, { qty: Math.max(1, Math.round(qty)) }), 48),
                n(p.price, (price) => edit(p.id, { price }), 70),
                <b key="b">{x.bf.toFixed(2)}</b>,
                m(x.cost),
                <Btn key="x" kind="ghost" title="Remove" onClick={() => set({ pieces: s.pieces.filter((y) => y.id !== p.id) })}>✕</Btn>,
              ]
            })}
            foot={['Total', '', '', '', '', String(s.pieces.reduce((a, p) => a + p.qty, 0)), '', tot.all.bf.toFixed(2), m(tot.all.cost), '']}
          />
          <p className="muted" style={{ fontSize: 13 }}>Board feet and cost include {s.waste}% waste for defects, planing and offcuts (15–30% is typical for rough hardwood). Prices are editable examples.</p>
        </Panel>
      </div>
    </div>
  )
}
