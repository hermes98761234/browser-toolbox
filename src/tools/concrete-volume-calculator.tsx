import { Btn, CsvButton, Donut, money, Note, num, Num, Panel, Row, Seg, Select, Split, Stat, Stats, Table, uid, useToolState } from '../kit'
import { BAGS, bagsNeeded, convert, roundUp, SHAPES, shapeById, toFt3, toYd3, unitOf, volume, weightKg, withWaste, type ShapeId, type Sys } from './lib/concrete-volume-calculator'

interface El { id: string; name: string; shape: ShapeId; dims: Record<string, number> }
const DEF = {
  sys: 'imperial' as Sys,
  waste: 10,
  bag: '80lb',
  bagPrice: 6.5,
  mixPrice: 165,
  els: [
    { id: 'a', name: 'Patio slab', shape: 'slab', dims: { l: 12, w: 10, t: 4 } },
    { id: 'b', name: 'Shed footing', shape: 'footing', dims: { l: 40, w: 16, d: 8 } },
    { id: 'c', name: 'Deck piers', shape: 'column', dims: { dia: 12, h: 4, n: 4 } },
  ] as El[],
}
const DEFAULTS: Record<ShapeId, Record<string, number>> = {
  slab: { l: 10, w: 10, t: 4 }, footing: { l: 20, w: 16, d: 8 }, column: { dia: 12, h: 4, n: 1 }, pier: { a: 16, b: 16, h: 3, n: 1 },
  tube: { od: 16, id: 10, h: 4, n: 1 }, circle: { dia: 8, t: 4 }, stairs: { w: 4, rise: 7, run: 11, n: 3, land: 36 },
}

/** Small pictogram for each shape. */
function Icon({ shape }: { shape: ShapeId }) {
  const p = { fill: 'color-mix(in srgb, var(--accent) 22%, transparent)', stroke: 'var(--accent)', strokeWidth: 1.6, strokeLinejoin: 'round' as const }
  const body: Record<ShapeId, React.ReactNode> = {
    slab: <path d="M4 26 L22 18 L44 24 L26 32 Z M4 26 v4 L26 36 v-4 M26 36 L44 28 v-4" {...p} />,
    footing: <path d="M4 22 L30 12 L44 16 L18 26 Z M4 22 v8 L18 34 v-8 M18 34 L44 24 v-8" {...p} />,
    column: <><ellipse cx="24" cy="8" rx="8" ry="3" {...p} /><path d="M16 8 v28 a8 3 0 0 0 16 0 v-28" {...p} /></>,
    pier: <path d="M14 10 L24 6 L34 10 L24 14 Z M14 10 v24 L24 38 v-24 M24 38 L34 34 v-24" {...p} />,
    tube: <><ellipse cx="24" cy="8" rx="10" ry="3.5" {...p} /><ellipse cx="24" cy="8" rx="5" ry="1.7" fill="var(--panel)" stroke="var(--accent)" /><path d="M14 8 v26 a10 3.5 0 0 0 20 0 v-26" {...p} /></>,
    circle: <><ellipse cx="24" cy="22" rx="19" ry="7" {...p} /><path d="M5 22 v5 a19 7 0 0 0 38 0 v-5" {...p} /></>,
    stairs: <path d="M4 36 h12 v-8 h10 v-8 h10 v-8 h8 v24 Z" {...p} />,
  }
  return <svg width={48} height={42} viewBox="0 0 48 42" aria-hidden>{body[shape]}</svg>
}

export default function ConcreteVolumeCalculator() {
  const [s, set, reset] = useToolState('concrete-volume-calculator', DEF)
  const imp = s.sys === 'imperial'
  const vols = s.els.map((e) => volume(e.shape, e.dims, s.sys))
  const net = vols.reduce((a, v) => a + v, 0)
  const gross = withWaste(net, s.waste)
  const bag = BAGS.find((b) => b.id === s.bag) ?? BAGS[3]
  const nBags = bagsNeeded(gross, bag.yieldM3)
  const mixUnit = imp ? 'yd³' : 'm³'
  const order = imp ? roundUp(toYd3(gross), 0.25) : roundUp(gross, 0.25)
  const bagCost = nBags * s.bagPrice
  const mixCost = order * s.mixPrice
  const vol = (m3: number) => (imp ? `${num(toYd3(m3), 2)} yd³` : `${num(m3, 2)} m³`)
  const vol2 = (m3: number) => (imp ? `${num(toFt3(m3), 1)} ft³` : `${num(m3 * 1000, 0)} L`)
  const edit = (id: string, p: Partial<El>) => set({ els: s.els.map((e) => (e.id === id ? { ...e, ...p } : e)) })
  const switchSys = (sys: Sys) => {
    if (sys === s.sys) return
    set({
      sys,
      bag: sys === 'imperial' ? '80lb' : '25kg',
      els: s.els.map((e) => ({ ...e, dims: Object.fromEntries(shapeById(e.shape).fields.map((f) => [f.k, +convert(e.dims[f.k] ?? 0, f.kind, s.sys, sys).toFixed(f.kind === 'long' ? 2 : 1)])) })),
    })
  }

  return (
    <Split>
      <div>
        <Panel title="Settings">
          <Seg value={s.sys} onChange={switchSys} options={[['imperial', 'Imperial (ft, in, yd³)'], ['metric', 'Metric (m, cm, m³)']]} />
          <Row>
            <Num label="Waste / spillage" value={s.waste} onChange={(waste) => set({ waste: Math.max(0, waste) })} unit="%" min={0} max={50} hint="5–10% typical, more for uneven ground" />
            <Select label="Bag size" value={s.bag} onChange={(bag) => set({ bag })} options={BAGS.filter((b) => b.sys === s.sys).map((b) => [b.id, b.label] as [string, string])} />
          </Row>
          <Row>
            <Num label="Price per bag" value={s.bagPrice} onChange={(bagPrice) => set({ bagPrice: Math.max(0, bagPrice) })} unit="$" min={0} />
            <Num label={`Ready-mix per ${mixUnit}`} value={s.mixPrice} onChange={(mixPrice) => set({ mixPrice: Math.max(0, mixPrice) })} unit="$" min={0} />
          </Row>
        </Panel>
        {s.els.map((e, i) => {
          const sh = shapeById(e.shape)
          return (
            <Panel key={e.id} title={<span style={{ display: 'flex', alignItems: 'center', gap: 8 }}><Icon shape={e.shape} /><input value={e.name} onChange={(ev) => edit(e.id, { name: ev.target.value })} aria-label="Element name" style={{ font: 'inherit', fontWeight: 700, border: 'none', background: 'transparent', color: 'inherit', width: 160 }} /></span>} actions={<><b>{vol(vols[i])}</b><Btn kind="ghost" onClick={() => set({ els: s.els.filter((x) => x.id !== e.id) })} title="Remove">✕</Btn></>}>
              <Select label="Shape" value={e.shape} onChange={(shape) => edit(e.id, { shape, dims: Object.fromEntries(shapeById(shape).fields.map((f) => [f.k, convert(DEFAULTS[shape][f.k], f.kind, 'imperial', s.sys)])) })} options={SHAPES.map((x) => [x.id, x.name] as [ShapeId, string])} />
              <Row>
                {sh.fields.map((f) => (
                  <Num key={f.k} label={f.label} value={e.dims[f.k] ?? 0} unit={unitOf(f.kind, s.sys)} min={0} step={f.kind === 'n' ? 1 : 'any'} onChange={(v) => edit(e.id, { dims: { ...e.dims, [f.k]: Math.max(0, f.kind === 'n' ? Math.round(v) : v) } })} />
                ))}
              </Row>
              {e.shape === 'tube' && (e.dims.id ?? 0) >= (e.dims.od ?? 0) && <Note tone="err">Inner diameter must be smaller than the outer diameter.</Note>}
              {(e.shape === 'slab' || e.shape === 'circle') && (e.dims.t ?? 0) > 0 && (imp ? e.dims.t < 3.5 : e.dims.t < 9) && <Note tone="warn">Slabs thinner than 4 in (10 cm) crack easily; 4 in for walkways, 5–6 in for driveways.</Note>}
            </Panel>
          )
        })}
        <Btn kind="primary" onClick={() => set({ els: [...s.els, { id: uid(), name: `Pour ${s.els.length + 1}`, shape: 'slab', dims: Object.fromEntries(SHAPES[0].fields.map((f) => [f.k, convert(DEFAULTS.slab[f.k], f.kind, 'imperial', s.sys)])) }] })}>+ Add element</Btn>
      </div>
      <div>
        <Stats>
          <Stat label="Concrete to order" value={vol(gross)} sub={`${vol(net)} net + ${s.waste}% waste`} tone="accent" />
          <Stat label={imp ? 'Cubic feet' : 'Litres'} value={vol2(gross)} sub={imp ? `${num(gross, 2)} m³` : `${num(toYd3(gross), 2)} yd³`} />
          <Stat label={`${bag.label} bags`} value={num(nBags, 0)} sub={`${money(bagCost, '$', 0)} at ${money(s.bagPrice)}`} />
          <Stat label="Weight (approx.)" value={imp ? `${num(weightKg(gross) * 2.20462 / 2000, 2)} tons` : `${num(weightKg(gross) / 1000, 2)} t`} sub="2400 kg/m³ normal concrete" />
        </Stats>
        <Panel title="Bags vs ready-mix truck">
          <Table
            head={['Option', 'Quantity', 'Cost', 'Notes']}
            rows={[
              [`Premix ${bag.label} bags`, `${num(nBags, 0)} bags`, money(bagCost, '$', 0), `${num(nBags * (bag.sys === 'imperial' ? +bag.label.split(' ')[0] : +bag.label.split(' ')[0] * 2.20462) / 2000, 1)} tons of bags to lift and mix`],
              ['Ready-mix truck', `${num(order, 2)} ${mixUnit}`, money(mixCost, '$', 0), imp ? 'Ordered in ¼ yd³ steps; short-load fees often apply under 3–4 yd³' : 'Ordered in 0.25 m³ steps; small loads may carry a surcharge'],
            ]}
          />
          <Note tone={nBags > 80 ? 'warn' : 'info'}>
            {nBags > 80 ? `More than 80 bags is a long day of mixing: ready-mix (or a mixer rental) is usually the better choice above about 1 ${imp ? 'yd³' : 'm³'}.` : `Up to about 1 ${imp ? 'yd³' : 'm³'} bagged premix is practical with a wheelbarrow or small mixer.`} Cheaper option here: <b>{bagCost <= mixCost ? 'bags' : 'ready-mix'}</b>.
          </Note>
        </Panel>
        <Panel title="All bag sizes">
          <Table head={['Bag', 'Yield each', 'Bags needed', 'Cost (same price/bag)']} rows={BAGS.filter((b) => b.sys === s.sys).map((b) => [b.label, imp ? `${num(toFt3(b.yieldM3), 2)} ft³` : `${num(b.yieldM3 * 1000, 1)} L`, num(bagsNeeded(gross, b.yieldM3), 0), money(bagsNeeded(gross, b.yieldM3) * s.bagPrice, '$', 0)])} />
        </Panel>
        <Panel title="Breakdown" actions={<><CsvButton name="concrete.csv" rows={() => [['Element', 'Shape', 'Net m³', 'Net yd³', 'With waste m³'], ...s.els.map((e, i) => [e.name, shapeById(e.shape).name, +vols[i].toFixed(4), +toYd3(vols[i]).toFixed(4), +withWaste(vols[i], s.waste).toFixed(4)]), ['Total', '', +net.toFixed(4), +toYd3(net).toFixed(4), +gross.toFixed(4)]]} /><Btn kind="ghost" onClick={reset}>Reset</Btn></>}>
          <Table head={['Element', 'Shape', 'Volume', imp ? 'ft³' : 'L']} rows={s.els.map((e, i) => [e.name, shapeById(e.shape).name, vol(vols[i]), vol2(vols[i])])} foot={['Total (net)', '', vol(net), vol2(net)]} />
          {net > 0 && <Donut slices={s.els.map((e, i) => ({ label: e.name, value: imp ? toYd3(vols[i]) : vols[i] }))} fv={(v) => `${num(v, 2)} ${mixUnit}`} size={180} />}
        </Panel>
        <Note>Bag yields are typical for premixed concrete (e.g. 80 lb ≈ 0.6 ft³). Check your product label: yields vary by brand. Volumes assume a flat, level subgrade.</Note>
      </div>
    </Split>
  )
}
