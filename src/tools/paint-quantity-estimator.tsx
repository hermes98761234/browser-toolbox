import { Btn, Check, CopyButton, CsvButton, Donut, money, Note, num, Panel, Row, Seg, Select, Slider, Split, Stat, Stats, Table, uid, useToolState } from '../kit'
import { DEFAULT_PRODUCTS, estimate, KIND_LABEL, TEXTURE, UNITS, type Kind, type Opening, type Product, type ProductId, type Surface, type Texture, type Units } from './lib/paint-quantity-estimator'

interface State { units: Units; currency: string; waste: number; colorChange: boolean; surfaces: Surface[]; openings: Opening[]; products: Record<ProductId | 'primer', Product> }

const DEF: State = {
  units: 'imperial', currency: '$', waste: 10, colorChange: false,
  surfaces: [
    { id: 'liv', name: 'Living room walls', kind: 'room', a: 16, b: 14, c: 8, qty: 1, product: 'wall', texture: 'smooth', primer: false },
    { id: 'livc', name: 'Living room ceiling', kind: 'ceiling', a: 16, b: 14, c: 0, qty: 1, product: 'ceiling', texture: 'light', primer: false },
    { id: 'bed', name: 'Bedroom walls', kind: 'room', a: 12, b: 11, c: 8, qty: 1, product: 'wall', texture: 'smooth', primer: false },
    { id: 'acc', name: 'Accent wall (new drywall)', kind: 'wall', a: 11, b: 8, c: 0, qty: 1, product: 'wall', texture: 'smooth', primer: true },
    { id: 'base', name: 'Baseboards', kind: 'trim', a: 106, b: 5, c: 0, qty: 1, product: 'trim', texture: 'smooth', primer: false },
    { id: 'doors', name: 'Interior doors', kind: 'door', a: 2.67, b: 6.67, c: 0, qty: 3, product: 'trim', texture: 'smooth', primer: false },
  ],
  openings: [
    { id: 'o1', name: 'Window', w: 4, h: 5, qty: 2, surface: 'liv' },
    { id: 'o2', name: 'Doorway', w: 3, h: 6.67, qty: 2, surface: 'liv' },
    { id: 'o3', name: 'Window', w: 3, h: 4, qty: 1, surface: 'bed' },
    { id: 'o4', name: 'Door', w: 2.67, h: 6.67, qty: 1, surface: 'bed' },
  ],
  products: DEFAULT_PRODUCTS.imperial,
}

const PCOL: Record<string, string> = { wall: '#6366f1', ceiling: '#0ea5e9', trim: '#f59e0b', primer: '#94a3b8' }

export default function PaintQuantityEstimator() {
  const [s, set, reset] = useToolState('paint-quantity-estimator', DEF)
  const U = UNITS[s.units]
  const m = (x: number) => money(x, s.currency, 2)
  const { areas, products } = estimate(s.surfaces, s.openings, s.products, s.units, s.waste, s.colorChange)
  const total = products.reduce((t, p) => t + (p.plan?.cost ?? 0), 0)
  const totalVol = products.reduce((t, p) => t + p.volume, 0)
  const netArea = areas.reduce((t, a) => t + a.net, 0)
  const pname = (id: string) => (id === 'primer' ? s.products.primer.name : s.products[id as ProductId].name)
  const editS = (id: string, p: Partial<Surface>) => set({ surfaces: s.surfaces.map((x) => (x.id === id ? { ...x, ...p } : x)) })
  const editO = (id: string, p: Partial<Opening>) => set({ openings: s.openings.map((x) => (x.id === id ? { ...x, ...p } : x)) })
  const editP = (id: ProductId | 'primer', p: Partial<Product>) => set({ products: { ...s.products, [id]: { ...s.products[id], ...p } } })
  const nIn = (v: number, on: (v: number) => void, w = 58) => <input type="number" min={0} value={v} style={{ width: w }} onChange={(e) => e.target.value !== '' && Number.isFinite(+e.target.value) && on(Math.max(0, +e.target.value))} />
  const walls = s.surfaces.filter((x) => x.kind === 'room' || x.kind === 'wall')

  const switchUnits = (units: Units) => {
    if (units === s.units) return
    const k = units === 'metric' ? 0.3048 : 1 / 0.3048
    const ks = units === 'metric' ? 2.54 : 1 / 2.54
    const r = (v: number) => Math.round(v * 100) / 100
    set({
      units,
      products: DEFAULT_PRODUCTS[units],
      surfaces: s.surfaces.map((x) => ({ ...x, a: r(x.a * k), b: r(x.kind === 'trim' ? x.b * ks : x.b * k), c: r(x.c * k) })),
      openings: s.openings.map((o) => ({ ...o, w: r(o.w * k), h: r(o.h * k) })),
    })
  }
  const dims = (x: Surface) => {
    const L = U.len
    if (x.kind === 'room') return [['L', 'a', L], ['W', 'b', L], ['H', 'c', L]] as const
    if (x.kind === 'trim') return [['length', 'a', L], ['width', 'b', U.small]] as const
    if (x.kind === 'ceiling') return [['L', 'a', L], ['W', 'b', L]] as const
    return [['W', 'a', L], ['H', 'b', L]] as const
  }
  const shopping = () => products.filter((p) => p.plan && p.volume > 0).map((p) => `${pname(p.id)}: ${p.plan!.counts.map((c, k) => (c ? `${c} × ${U.canNames[k]}` : '')).filter(Boolean).join(' + ')} (${num(p.volume, 2)} ${U.vol} needed, ${m(p.plan!.cost)})`).join('\n') + `\nTotal: ${m(total)}`

  return (
    <Split wide="right">
      <div>
        <Panel title="Project settings" actions={<Btn kind="ghost" onClick={reset}>Reset</Btn>}>
          <Row>
            <Seg value={s.units} onChange={switchUnits} options={[['imperial', 'ft · gal'], ['metric', 'm · L']]} />
            <Select label="Currency" value={s.currency} onChange={(currency) => set({ currency })} options={['$', '€', '£', '₴', 'zł', 'CHF ']} />
          </Row>
          <Slider label="Waste & touch-up allowance" value={s.waste} onChange={(waste) => set({ waste })} min={0} max={30} unit="%" show={(v) => v.toFixed(0)} />
          <Check label="Big colour change (dark → light): +1 wall coat" value={s.colorChange} onChange={(colorChange) => set({ colorChange })} />
        </Panel>
        <Panel title="Paints & coverage">
          <Table head={['Paint', `${U.area}/${U.vol}`, 'Coats', ...U.canNames.map((c) => `${c} ${s.currency.trim()}`)]} rows={(['wall', 'ceiling', 'trim', 'primer'] as const).map((id) => {
            const p = s.products[id]
            return [
              <span key="n" style={{ display: 'flex', alignItems: 'center', gap: 6 }}><i style={{ width: 4, alignSelf: 'stretch', borderRadius: 2, background: PCOL[id] }} /><input value={p.name} onChange={(e) => editP(id, { name: e.target.value })} style={{ width: 100 }} aria-label="Paint name" /></span>,
              nIn(p.coverage, (coverage) => editP(id, { coverage }), 50),
              id === 'primer' ? '1' : nIn(p.coats, (coats) => editP(id, { coats: Math.max(1, Math.round(coats)) }), 40),
              ...U.canNames.map((cn, k) => <span key={cn}>{nIn(p.prices[k] ?? 0, (v) => editP(id, { prices: p.prices.map((x, j) => (j === k ? v : x)) }), 48)}</span>),
            ]
          })} />
          <p className="muted" style={{ fontSize: 12 }}>Check the label: most interior latex covers {s.units === 'imperial' ? '350–400 ft²/gal' : '9–12 m²/L'} per coat on smooth, sealed walls. Texture factors raise consumption (light ×1.1, heavy ×1.25, masonry ×1.5).</p>
        </Panel>
      </div>
      <div>
        <Stats>
          <Stat label="Paint to buy" value={`${num(totalVol, 2)} ${U.vol}`} sub="incl. coats, texture & waste" tone="accent" />
          <Stat label="Estimated cost" value={m(total)} sub="cheapest can mix" />
          <Stat label="Net paintable area" value={`${num(netArea, 0)} ${U.area}`} sub={`${num(areas.reduce((t, a) => t + a.deduct, 0), 0)} ${U.area} openings deducted`} />
        </Stats>
        <Panel title="Surfaces" actions={<>
          <Btn onClick={() => set({ surfaces: [...s.surfaces, { id: uid(), name: 'New wall', kind: 'wall', a: s.units === 'imperial' ? 12 : 3.6, b: s.units === 'imperial' ? 8 : 2.4, c: 0, qty: 1, product: 'wall', texture: 'smooth', primer: false }] })}>+ Surface</Btn>
          <CsvButton name="paint-surfaces.csv" rows={() => [['surface', 'kind', 'gross', 'openings', 'net', 'paint', 'texture', 'primer'], ...s.surfaces.map((x, i) => [x.name, x.kind, areas[i].gross.toFixed(1), areas[i].deduct.toFixed(1), areas[i].net.toFixed(1), pname(x.product), x.texture, x.primer ? 'yes' : 'no'])]} />
        </>}>
          <style>{'.pq-row input:not([type=checkbox]), .pq-row select { border: 1px solid var(--line); background: var(--panel); color: inherit; border-radius: 6px; padding: 5px 6px; font: inherit; }'}</style>
          {s.surfaces.map((x, i) => (
            <div key={x.id} className="pq-row" style={{ borderBottom: '1px solid var(--line)', padding: '8px 0', display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center', fontSize: 14 }}>
              <input value={x.name} style={{ flex: '1 1 170px', fontWeight: 600 }} onChange={(e) => editS(x.id, { name: e.target.value })} aria-label="Surface name" />
              <select value={x.kind} onChange={(e) => editS(x.id, { kind: e.target.value as Kind, product: e.target.value === 'ceiling' ? 'ceiling' : e.target.value === 'trim' || e.target.value === 'door' ? 'trim' : 'wall' })} aria-label="Type">
                {(Object.keys(KIND_LABEL) as Kind[]).map((k) => <option key={k} value={k}>{KIND_LABEL[k]}</option>)}
              </select>
              <span style={{ whiteSpace: 'nowrap' }}>{dims(x).map(([lb, f, u], j) => <span key={f} title={lb}>{j > 0 && ' × '}{nIn(x[f], (v) => editS(x.id, { [f]: v }), 56)}<span className="muted" style={{ fontSize: 11 }}> {u}</span></span>)}</span>
              <span style={{ whiteSpace: 'nowrap' }}>× {nIn(x.qty, (qty) => editS(x.id, { qty: Math.round(qty) }), 44)}</span>
              <select value={x.product} onChange={(e) => editS(x.id, { product: e.target.value as ProductId })} aria-label="Paint">
                {(['wall', 'ceiling', 'trim'] as const).map((p) => <option key={p} value={p}>{s.products[p].name}</option>)}
              </select>
              <select value={x.texture} onChange={(e) => editS(x.id, { texture: e.target.value as Texture })} aria-label="Texture">
                {(Object.keys(TEXTURE) as Texture[]).map((t) => <option key={t} value={t}>{TEXTURE[t][0]}</option>)}
              </select>
              <label style={{ whiteSpace: 'nowrap' }}><input type="checkbox" checked={x.primer} onChange={(e) => editS(x.id, { primer: e.target.checked })} /> primer</label>
              <b style={{ marginLeft: 'auto', whiteSpace: 'nowrap' }}>{num(areas[i].net, 1)} {U.area}</b>
              <Btn kind="ghost" onClick={() => set({ surfaces: s.surfaces.filter((y) => y.id !== x.id), openings: s.openings.filter((o) => o.surface !== x.id) })}>✕</Btn>
            </div>
          ))}
          <p className="muted" style={{ fontSize: 12 }}>Room walls use the perimeter 2·(L + W) × H. Doors count both faces. Trim width is in {U.small}. Tick “Primer” for new drywall, patched areas, stains or bare wood.</p>
        </Panel>
        <Panel title="Openings to deduct (windows, doors, built-ins)" actions={<Btn disabled={!walls.length} onClick={() => set({ openings: [...s.openings, { id: uid(), name: 'Window', w: s.units === 'imperial' ? 3 : 0.9, h: s.units === 'imperial' ? 4 : 1.2, qty: 1, surface: walls[0]?.id ?? '' }] })}>+ Opening</Btn>}>
          {s.openings.length ? (
            <Table head={['Opening', `W ${U.len}`, `H ${U.len}`, 'Qty', 'In surface', `Area ${U.area}`, '']} rows={s.openings.map((o) => [
              <input key="n" value={o.name} style={{ width: 110 }} onChange={(e) => editO(o.id, { name: e.target.value })} aria-label="Opening name" />,
              nIn(o.w, (w) => editO(o.id, { w })), nIn(o.h, (h) => editO(o.id, { h })), nIn(o.qty, (qty) => editO(o.id, { qty: Math.round(qty) }), 44),
              <select key="s" value={o.surface} onChange={(e) => editO(o.id, { surface: e.target.value })} aria-label="Surface">
                {walls.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
              </select>,
              num(o.w * o.h * o.qty, 1),
              <Btn key="x" kind="ghost" onClick={() => set({ openings: s.openings.filter((y) => y.id !== o.id) })}>✕</Btn>,
            ])} />
          ) : <Note>No openings. Add windows and doors so their area is not painted.</Note>}
          {areas.some((a) => a.gross > 0 && a.deduct >= a.gross) && <Note tone="warn">Openings exceed a surface's area; that surface is counted as zero.</Note>}
        </Panel>
        <Panel title="Shopping list" actions={<CopyButton text={shopping} label="Copy list" />}>
          <Table head={['Paint', 'Area', 'Coats', 'Needed', 'Buy', 'Cost']} rows={products.filter((p) => p.volume > 0).map((p) => [
            <span key="n"><i style={{ display: 'inline-block', width: 10, height: 10, borderRadius: 3, background: PCOL[p.id], marginRight: 6 }} />{pname(p.id)}</span>,
            `${num(p.area, 0)} ${U.area}`, p.coats, `${num(p.volume, 2)} ${U.vol}`,
            p.plan ? p.plan.counts.map((c, k) => (c ? `${c} × ${U.canNames[k]}` : '')).filter(Boolean).join(' + ') : '—',
            <b key="c">{p.plan ? m(p.plan.cost) : '—'}</b>,
          ])} foot={['Total', '', '', `${num(totalVol, 2)} ${U.vol}`, '', m(total)]} />
          <p className="muted" style={{ fontSize: 12 }}>Can mixes are the cheapest combination that holds at least the needed volume. Leftover: {num(products.reduce((t, p) => t + (p.plan ? p.plan.volume - p.volume : 0), 0), 2)} {U.vol} (keep it for touch-ups).</p>
        </Panel>
        <Panel title="Area by paint">
          <Donut slices={products.filter((p) => p.area > 0).map((p) => ({ label: pname(p.id), value: Math.round(p.area), color: PCOL[p.id] }))} fv={(v) => `${num(v, 0)} ${U.area}`} />
        </Panel>
      </div>
    </Split>
  )
}
