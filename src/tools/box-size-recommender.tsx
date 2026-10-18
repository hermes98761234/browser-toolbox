import { useMemo, useState } from 'react'
import { Btn, color, CsvButton, JsonButtons, Note, Num, Panel, Row, Select, Seg, Split, Stat, Stats, Table, num, uid, useToolState } from '../kit'
import { evaluate, pillows, type Box, type Fit, type Item } from './lib/box-size-recommender'
import { CARRIERS, IN, LB, rate } from './lib/dimensional-weight-calculator'

const bx = (name: string, l: number, w: number, h: number, kg: number, cost: number, maxKg = 20): Box => ({ id: uid(), name, l, w, h, kg, cost, maxKg })
const itm = (name: string, l: number, w: number, h: number, kg: number, qty = 1, upright = false): Item => ({ id: uid(), name, l, w, h, kg, qty, upright })
const BOXES: Box[] = [
  bx('Small mailer', 22, 16, 8, 0.12, 0.45, 5), bx('Book box', 32, 24, 10, 0.2, 0.7, 10), bx('Shoebox', 33, 20, 12, 0.22, 0.75, 10),
  bx('Cube 25', 25, 25, 25, 0.3, 0.95), bx('Medium', 30, 30, 20, 0.32, 1.0), bx('Long', 60, 15, 15, 0.35, 1.2),
  bx('Large', 40, 30, 30, 0.45, 1.4, 25), bx('XL', 50, 40, 40, 0.7, 2.1, 30),
]
const ITEMS: Item[] = [itm('Mug (boxed)', 12, 12, 10, 0.4, 2, true), itm('Paperback', 20, 13, 3, 0.3, 3), itm('Tea tin', 8, 8, 15, 0.15, 2, true)]
const DEF = { units: 'metric' as 'metric' | 'imperial', boxes: BOXES, items: ITEMS, padding: 1, wall: 0.4, carrier: 'exp5000', rank: 'volume' as 'volume' | 'cost' | 'billed' }

const inp: React.CSSProperties = { width: '100%', minWidth: 52, padding: '4px 6px', border: '1px solid var(--line)', borderRadius: 6, background: 'var(--panel)', color: 'var(--fg)', font: 'inherit' }

function Iso({ fit }: { fit: Fit }) {
  const [L, W, H] = fit.inner
  const c = Math.cos(Math.PI / 6), sn = Math.sin(Math.PI / 6)
  const P = (x: number, y: number, z: number): [number, number] => [(x - y) * c, (x + y) * sn - z]
  const corners = [P(0, 0, 0), P(L, 0, 0), P(0, W, 0), P(L, W, 0), P(0, 0, H), P(L, W, H), P(L, 0, H), P(0, W, H)]
  const xs = corners.map((p) => p[0]), ys = corners.map((p) => p[1])
  const minX = Math.min(...xs), minY = Math.min(...ys), w = Math.max(...xs) - minX, h = Math.max(...ys) - minY
  const pts = (arr: [number, number][]) => arr.map(([x, y]) => `${(x - minX).toFixed(2)},${(y - minY).toFixed(2)}`).join(' ')
  const sorted = [...fit.placed].sort((a, b) => a.x + a.y + a.z - (b.x + b.y + b.z) || a.z - b.z)
  const sw = Math.max(w, h) / 300
  return (
    <svg viewBox={`${-w * 0.03} ${-h * 0.03} ${w * 1.06} ${h * 1.06}`} style={{ width: '100%', maxHeight: 340 }} role="img" aria-label="Packing diagram">
      {/* back walls */}
      <polygon points={pts([P(0, 0, 0), P(L, 0, 0), P(L, 0, H), P(0, 0, H)])} fill="var(--panel2)" stroke="var(--line)" strokeWidth={sw} />
      <polygon points={pts([P(0, 0, 0), P(0, W, 0), P(0, W, H), P(0, 0, H)])} fill="var(--panel2)" stroke="var(--line)" strokeWidth={sw} />
      <polygon points={pts([P(0, 0, 0), P(L, 0, 0), P(L, W, 0), P(0, W, 0)])} fill="color-mix(in srgb, var(--panel2) 70%, #a16207)" stroke="var(--line)" strokeWidth={sw} />
      {sorted.map((p, i) => {
        const col = color(p.item)
        const { x, y, z, l, w: ww, h: hh } = p
        return (
          <g key={i} stroke="#0f172a" strokeWidth={sw} strokeLinejoin="round">
            <polygon points={pts([P(x, y, z + hh), P(x + l, y, z + hh), P(x + l, y + ww, z + hh), P(x, y + ww, z + hh)])} fill={col} />
            <polygon points={pts([P(x + l, y, z), P(x + l, y + ww, z), P(x + l, y + ww, z + hh), P(x + l, y, z + hh)])} fill={col} style={{ filter: 'brightness(0.8)' }} />
            <polygon points={pts([P(x, y + ww, z), P(x + l, y + ww, z), P(x + l, y + ww, z + hh), P(x, y + ww, z + hh)])} fill={col} style={{ filter: 'brightness(0.62)' }} />
          </g>
        )
      })}
      {/* front edges of the box */}
      <polyline points={pts([P(L, 0, 0), P(L, W, 0), P(0, W, 0)])} fill="none" stroke="var(--muted)" strokeWidth={sw * 1.5} strokeDasharray={`${sw * 4} ${sw * 3}`} />
      <polyline points={pts([P(L, 0, H), P(L, W, H), P(0, W, H), P(0, 0, H), P(L, 0, H)])} fill="none" stroke="var(--muted)" strokeWidth={sw * 1.5} />
      <line x1={P(L, W, 0)[0] - minX} y1={P(L, W, 0)[1] - minY} x2={P(L, W, H)[0] - minX} y2={P(L, W, H)[1] - minY} stroke="var(--muted)" strokeWidth={sw * 1.5} strokeDasharray={`${sw * 4} ${sw * 3}`} />
    </svg>
  )
}

export default function BoxSizeRecommender() {
  const [s, set, reset] = useToolState('box-size-recommender', DEF)
  const [pick, setPick] = useState('')
  const imp = s.units === 'imperial'
  const L = (cm: number) => (imp ? cm / IN : cm)
  const fromL = (v: number) => (imp ? v * IN : v)
  const M = (kg: number) => (imp ? kg / LB : kg)
  const fromM = (v: number) => (imp ? v * LB : v)
  const lu = imp ? 'in' : 'cm', mu = imp ? 'lb' : 'kg'
  const carrier = CARRIERS.find((c) => c.id === s.carrier) ?? CARRIERS[0]

  const fits = useMemo(() => evaluate(s.boxes, s.items, s.padding), [s.boxes, s.items, s.padding])
  const withRate = fits.map((f) => ({ f, r: rate(carrier, [f.box.l + 2 * s.wall, f.box.w + 2 * s.wall, f.box.h + 2 * s.wall], f.totalKg) }))
  const ok = withRate.filter((x) => x.f.fits).sort((a, b) => (s.rank === 'cost' ? a.f.box.cost - b.f.box.cost : s.rank === 'billed' ? a.r.billedKg - b.r.billedKg || a.f.boxVol - b.f.boxVol : a.f.boxVol - b.f.boxVol))
  const best = ok[0]
  const shown = withRate.find((x) => x.f.box.id === pick) ?? best ?? withRate[0]
  const units = s.items.reduce((a, i) => a + i.qty, 0)
  const editItem = (id: string, p: Partial<Item>) => set({ items: s.items.map((i) => (i.id === id ? { ...i, ...p } : i)) })
  const editBox = (id: string, p: Partial<Box>) => set({ boxes: s.boxes.map((b) => (b.id === id ? { ...b, ...p } : b)) })
  const numIn = (v: number, on: (v: number) => void, label: string, d = 1) => (
    <input style={inp} type="number" min={0} step="any" aria-label={label} value={Math.round(v * 10 ** d) / 10 ** d} onChange={(e) => { const n = parseFloat(e.target.value); if (Number.isFinite(n) && n >= 0) on(n) }} />
  )
  const vol = (cm3: number) => (imp ? `${num(cm3 / IN ** 3, 0)} in³` : `${num(cm3 / 1000, 2)} L`)

  return (
    <Split wide="right">
      <div>
        <Panel title="Items to ship" actions={<Btn onClick={() => set({ items: [...s.items, { id: uid(), name: `Item ${s.items.length + 1}`, l: 10, w: 10, h: 10, kg: 0.5, qty: 1, upright: false }] })}>＋ Item</Btn>}>
          <Seg label="Units" value={s.units} onChange={(units) => set({ units })} options={[['metric', 'cm / kg'], ['imperial', 'in / lb']]} />
          <Table
            head={['Item', `L ${lu}`, `W ${lu}`, `H ${lu}`, `Wt ${mu}`, 'Qty', 'Upright', '']}
            rows={s.items.map((i, k) => [
              <span key="n" style={{ display: 'flex', alignItems: 'center', gap: 4 }}><span style={{ width: 10, height: 10, borderRadius: 3, background: color(k), flex: 'none' }} /><input style={{ ...inp, minWidth: 110 }} value={i.name} aria-label="Item name" onChange={(e) => editItem(i.id, { name: e.target.value })} /></span>,
              numIn(L(i.l), (v) => editItem(i.id, { l: fromL(v) }), 'Length'), numIn(L(i.w), (v) => editItem(i.id, { w: fromL(v) }), 'Width'), numIn(L(i.h), (v) => editItem(i.id, { h: fromL(v) }), 'Height'),
              numIn(M(i.kg), (v) => editItem(i.id, { kg: fromM(v) }), 'Weight', 2), numIn(i.qty, (v) => editItem(i.id, { qty: Math.round(v) }), 'Quantity', 0),
              <input key="u" type="checkbox" aria-label="Keep upright" checked={i.upright} onChange={(e) => editItem(i.id, { upright: e.target.checked })} />,
              <Btn key="x" kind="ghost" onClick={() => set({ items: s.items.filter((x) => x.id !== i.id) })}>✕</Btn>,
            ])}
          />
          <p className="k-hint">“Upright” items may only turn about the vertical axis (this-side-up). Others are tried in all 6 orientations.</p>
          <Row>
            <Num label="Cushioning per side" value={L(s.padding)} onChange={(v) => set({ padding: Math.max(0, fromL(v)) })} unit={lu} min={0} />
            <Num label="Box wall thickness" value={L(s.wall)} onChange={(v) => set({ wall: Math.max(0, fromL(v)) })} unit={lu} min={0} hint="added to inner size for the outer (billed) size" />
          </Row>
        </Panel>
        <Panel title="Box inventory (inner dimensions)" actions={<>
          <Btn onClick={() => set({ boxes: [...s.boxes, bx(`Box ${s.boxes.length + 1}`, 30, 20, 15, 0.3, 1)] })}>＋ Box</Btn>
          <JsonButtons name="boxes-and-items.json" data={s} onLoad={(d) => set({ ...DEF, ...d })} />
        </>}>
          <Table
            head={['Box', `L`, `W`, `H`, `Box ${mu}`, 'Cost', `Max ${mu}`, '']}
            rows={s.boxes.map((b) => [
              <input key="n" style={{ ...inp, minWidth: 110 }} value={b.name} aria-label="Box name" onChange={(e) => editBox(b.id, { name: e.target.value })} />,
              numIn(L(b.l), (v) => editBox(b.id, { l: fromL(v) }), 'Length'), numIn(L(b.w), (v) => editBox(b.id, { w: fromL(v) }), 'Width'), numIn(L(b.h), (v) => editBox(b.id, { h: fromL(v) }), 'Height'),
              numIn(M(b.kg), (v) => editBox(b.id, { kg: fromM(v) }), 'Box weight', 2), numIn(b.cost, (v) => editBox(b.id, { cost: v }), 'Cost', 2), numIn(M(b.maxKg), (v) => editBox(b.id, { maxKg: fromM(v) }), 'Max weight', 1),
              <Btn key="x" kind="ghost" onClick={() => set({ boxes: s.boxes.filter((x) => x.id !== b.id) })}>✕</Btn>,
            ])}
          />
          <Btn kind="ghost" onClick={reset}>Reset sample</Btn>
        </Panel>
      </div>
      <div>
        <Panel title="Recommendation">
          <Row>
            <Select label="Rank by" value={s.rank} onChange={(rank) => set({ rank })} options={[['volume', 'Smallest box'], ['cost', 'Cheapest box'], ['billed', 'Lowest billed weight']]} />
            <Select label="Carrier (DIM rules)" value={s.carrier} onChange={(carrier) => set({ carrier })} options={CARRIERS.map((c) => [c.id, c.name] as [string, string])} />
          </Row>
          {!units ? <Note tone="warn">Add at least one item.</Note> : best ? (
            <Stats>
              <Stat label="Best box" value={best.f.box.name} tone="good" sub={`${num(L(best.f.box.l), 1)} × ${num(L(best.f.box.w), 1)} × ${num(L(best.f.box.h), 1)} ${lu}`} />
              <Stat label="Void to fill" value={`${num(best.f.voidPct * 100, 0)}%`} sub={`${vol(best.f.voidVol)} ≈ ${pillows(best.f.voidVol)} air pillows`} tone={best.f.voidPct > 0.6 ? 'bad' : undefined} />
              <Stat label="Billed weight" value={`${num(best.r.billed, 1)} ${best.r.unit}`} sub={best.r.dimWins ? `DIM weight wins (actual ${num(best.r.actual, 2)})` : 'actual weight applies'} tone={best.r.dimWins ? 'bad' : 'accent'} />
            </Stats>
          ) : <Note tone="err">None of your boxes can hold all {units} items{s.padding > 0 ? ` with ${num(L(s.padding), 1)} ${lu} cushioning` : ''}. Add a bigger box, reduce cushioning or split the shipment.</Note>}
        </Panel>
        {shown && (
          <Panel title={`Packing view — ${shown.f.box.name}`} actions={<Select label="" value={shown.f.box.id} onChange={setPick} options={withRate.map((x) => [x.f.box.id, `${x.f.fits ? '✓' : '✕'} ${x.f.box.name}`] as [string, string])} />}>
            <Iso fit={shown.f} />
            <p className="k-hint">
              Usable space {num(L(shown.f.inner[0]), 1)} × {num(L(shown.f.inner[1]), 1)} × {num(L(shown.f.inner[2]), 1)} {lu} after cushioning · {shown.f.placed.length} of {units} items placed
              {shown.f.unplaced ? ` · ${shown.f.unplaced} don't fit` : ''}{shown.f.overweight ? ' · over the box weight limit' : ''}. Heuristic packing — a real packer may squeeze in slightly more.
            </p>
          </Panel>
        )}
        <Panel title="All boxes" actions={<CsvButton name="box-fit.csv" rows={() => [['Box', 'Fits', 'Void %', 'Total kg', 'Billed', 'Unit', 'Cost'], ...withRate.map((x) => [x.f.box.name, x.f.fits ? 'yes' : 'no', (x.f.voidPct * 100).toFixed(1), x.f.totalKg.toFixed(2), x.r.billed, x.r.unit, x.f.box.cost])]} />}>
          <Table
            head={['Box', 'Fits?', 'Void', 'Total wt', `Billed (${carrier.system === 'imperial' ? 'lb' : 'kg'})`, 'Cost']}
            rows={withRate.map((x) => [
              <button key="b" type="button" className="k-btn ghost" style={{ padding: '2px 6px', fontWeight: x === shown ? 700 : 500 }} onClick={() => setPick(x.f.box.id)}>{x.f.box.name}{x === best ? ' ★' : ''}</button>,
              <span key="f" style={{ color: x.f.fits ? 'var(--ok)' : 'var(--err)' }}>{x.f.fits ? '✓' : x.f.overweight ? 'too heavy' : `${x.f.unplaced} left over`}</span>,
              x.f.fits ? `${num(x.f.voidPct * 100, 0)}%` : '—',
              `${num(M(x.f.totalKg), 2)} ${mu}`,
              `${num(x.r.billed, 1)}${x.r.dimWins ? ' (DIM)' : ''}`,
              num(x.f.box.cost, 2),
            ])}
          />
          <Note>DIM weight uses the outer size (inner + 2 × wall) with {carrier.name} rules ({carrier.note}). Too much void? Over 40–50% empty usually means a smaller box or a padded mailer will save money and filler.</Note>
        </Panel>
      </div>
    </Split>
  )
}
