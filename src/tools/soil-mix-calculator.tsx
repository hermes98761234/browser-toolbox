import { Btn, CsvButton, Donut, Note, Panel, Row, Select, Seg, Slider, Split, Stat, Stats, Table, money, num, uid, useToolState } from '../kit'
import { L_PER_FT3, L_PER_GAL, L_PER_YD3, containerLitres, mixLines, soilNeeded, type BagUnit, type Component, type Container, type Shape } from './lib/soil-mix-calculator'

const SHAPES: [Shape, string][] = [['rect', 'Box / raised bed'], ['cyl', 'Round, straight sides'], ['roundTaper', 'Round, tapered pot'], ['squareTaper', 'Square, tapered pot'], ['gallon', 'Nursery pot (US gal)']]
const DIMS: Record<Shape, [keyof Container, string][]> = {
  rect: [['a', 'Length'], ['b', 'Width'], ['h', 'Depth']],
  cyl: [['a', 'Diameter'], ['h', 'Depth']],
  roundTaper: [['a', 'Top Ø'], ['b', 'Bottom Ø'], ['h', 'Depth']],
  squareTaper: [['a', 'Top side'], ['b', 'Bottom side'], ['h', 'Depth']],
  gallon: [['a', 'Gallons']],
}
const C = (name: string, parts: number, bag: number, unit: BagUnit, price: number): Component => ({ id: uid(), name, parts, bag, unit, price })
const MIXES: Record<string, { name: string; note: string; comps: () => Component[] }> = {
  mel: { name: 'Square-foot garden (Mel’s Mix)', note: 'Equal parts compost (ideally blended from several sources), coir or peat, and coarse vermiculite.', comps: () => [C('Compost', 1, 1, 'ft3', 8.5), C('Coco coir (expanded)', 1, 2, 'ft3', 16), C('Coarse vermiculite', 1, 4, 'ft3', 32)] },
  bed: { name: 'Raised bed 60/30/10', note: 'Screened topsoil for body, compost for fertility, and a little aeration.', comps: () => [C('Topsoil', 6, 0.75, 'ft3', 4.5), C('Compost', 3, 1, 'ft3', 8.5), C('Perlite or pine fines', 1, 2, 'ft3', 24)] },
  pot: { name: 'All-purpose container mix', note: 'Light and moisture-holding: good for most vegetables and annuals in pots.', comps: () => [C('Coco coir / peat', 4, 2, 'ft3', 16), C('Compost', 3, 1, 'ft3', 8.5), C('Perlite', 2, 2, 'ft3', 24), C('Worm castings', 1, 15, 'L', 14)] },
  fiveone: { name: '5-1-1 bark mix', note: 'Fast-draining mix for long-lived container plants: pine bark fines, peat, perlite.', comps: () => [C('Pine bark fines', 5, 2, 'ft3', 9), C('Peat moss', 1, 3, 'ft3', 15), C('Perlite', 1, 2, 'ft3', 24)] },
  cactus: { name: 'Cactus & succulent', note: 'Half mineral grit so roots never sit wet.', comps: () => [C('Potting soil', 2, 8, 'qt', 7), C('Pumice or perlite', 1, 8, 'qt', 9), C('Coarse sand / grit', 1, 20, 'L', 6)] },
  seed: { name: 'Seed starting', note: 'Fine, sterile and nutrient-poor; feed seedlings after the first true leaves.', comps: () => [C('Coco coir', 2, 10, 'L', 7), C('Fine vermiculite', 1, 8, 'qt', 8), C('Fine perlite', 1, 8, 'qt', 8)] },
  aroid: { name: 'Aroid / houseplant chunky', note: 'Monstera, philodendron, anthurium: airy and chunky.', comps: () => [C('Orchid bark', 4, 8, 'qt', 10), C('Coco coir', 2, 10, 'L', 7), C('Perlite', 3, 8, 'qt', 8), C('Horticultural charcoal', 1, 2, 'qt', 9)] },
}

interface State { imperial: boolean; containers: Container[]; mix: string; comps: Component[]; fill: number; settle: number; cur: string }
const DEF: State = {
  imperial: true,
  containers: [
    { id: 'b1', name: 'Raised bed 8×4', shape: 'rect', a: 96, b: 48, c: 0, h: 11, qty: 2 },
    { id: 'p1', name: 'Tomato pots', shape: 'gallon', a: 7, b: 0, c: 0, h: 0, qty: 4 },
    { id: 'p2', name: 'Herb planters', shape: 'roundTaper', a: 12, b: 9, c: 0, h: 10, qty: 3 },
  ],
  mix: 'mel', comps: MIXES.mel.comps(), fill: 95, settle: 10, cur: '$',
}

export default function SoilMixCalculator() {
  const [s, set, reset] = useToolState('soil-mix-calculator', DEF)
  const lu = s.imperial ? 'in' : 'cm'
  const editC = (id: string, p: Partial<Container>) => set({ containers: s.containers.map((c) => (c.id === id ? { ...c, ...p } : c)) })
  const editM = (id: string, p: Partial<Component>) => set({ comps: s.comps.map((c) => (c.id === id ? { ...c, ...p } : c)) })
  const vols = s.containers.map((c) => containerLitres(c, s.imperial) * Math.max(0, c.qty))
  const boxL = vols.reduce((a, v) => a + v, 0)
  const need = soilNeeded(boxL, s.fill, s.settle)
  const lines = mixLines(need, s.comps)
  const cost = lines.reduce((a, l) => a + l.cost, 0)
  const bags = lines.reduce((a, l) => a + l.bags, 0)
  const m = (x: number) => money(x, s.cur)
  const vol = (l: number) => (s.imperial ? `${num(l / L_PER_FT3, 2)} ft³` : `${num(l, 1)} L`)
  const toggleUnits = (imperial: boolean) => {
    if (imperial === s.imperial) return
    const k = imperial ? 1 / 2.54 : 2.54
    const r = (x: number) => Math.round(x * k * 10) / 10
    set({ imperial, containers: s.containers.map((c) => (c.shape === 'gallon' ? c : { ...c, a: r(c.a), b: r(c.b), h: r(c.h) })) })
  }
  const addPreset = (name: string, shape: Shape, a: number, b: number, h: number) => {
    const k = s.imperial || shape === 'gallon' ? 1 : 2.54
    set({ containers: [...s.containers, { id: uid(), name, shape, a: Math.round(a * k), b: Math.round(b * k), c: 0, h: Math.round(h * k), qty: 1 }] })
  }
  const inp = (v: number, on: (n: number) => void, label: string, w = 64) => (
    <input type="number" min={0} step="any" value={v} aria-label={label} style={{ width: w }} onChange={(e) => on(Math.max(0, Number(e.target.value) || 0))} />
  )

  return (
    <Split wide="left">
      <div>
        <Panel title="Containers" actions={<><Seg value={s.imperial ? 'imp' : 'met'} onChange={(v) => toggleUnits(v === 'imp')} options={[['imp', 'in / ft³'], ['met', 'cm / L']]} /><Btn kind="ghost" onClick={reset}>Reset</Btn></>}>
          <Table
            head={['Name', 'Shape', 'Size', 'Qty', 'Volume', '']}
            rows={s.containers.map((c, i) => [
              <input key="n" value={c.name} aria-label="Name" onChange={(e) => editC(c.id, { name: e.target.value })} style={{ width: 130 }} />,
              <select key="s" value={c.shape} aria-label="Shape" onChange={(e) => editC(c.id, { shape: e.target.value as Shape })}>{SHAPES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select>,
              <span key="d" style={{ display: 'inline-flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
                {DIMS[c.shape].map(([k, l]) => <label key={k} style={{ display: 'inline-flex', flexDirection: 'column', fontSize: 11 }} className="muted">{l}{inp(c[k] as number, (n) => editC(c.id, { [k]: n }), l)}</label>)}
                <span className="muted" style={{ fontSize: 12 }}>{c.shape === 'gallon' ? 'gal' : lu}</span>
              </span>,
              inp(c.qty, (qty) => editC(c.id, { qty: Math.round(qty) }), 'Quantity', 52),
              <b key="v">{vol(vols[i])}</b>,
              <Btn key="x" kind="ghost" title="Remove" onClick={() => set({ containers: s.containers.filter((x) => x.id !== c.id) })}>✕</Btn>,
            ])}
            foot={['Total', '', '', s.containers.reduce((a, c) => a + c.qty, 0), vol(boxL), '']}
          />
          <Row>
            <Btn onClick={() => addPreset('Raised bed 4×4', 'rect', 48, 48, 11)}>+ Bed 4×4 ft</Btn>
            <Btn onClick={() => addPreset('5-gallon bucket', 'roundTaper', 11.9, 10.3, 14.5)}>+ 5-gal bucket</Btn>
            <Btn onClick={() => addPreset('12″ pot', 'roundTaper', 12, 9, 10)}>+ 12″ pot</Btn>
            <Btn onClick={() => addPreset('Window box', 'rect', 30, 8, 7)}>+ Window box</Btn>
            <Btn onClick={() => addPreset('Half barrel', 'roundTaper', 26, 21, 16)}>+ Half barrel</Btn>
            <Btn onClick={() => addPreset('Grow bag', 'gallon', 10, 0, 0)}>+ 10-gal grow bag</Btn>
          </Row>
        </Panel>
        <Panel title="Mix recipe">
          <Select label="Preset" value={s.mix} onChange={(mix) => set({ mix, comps: MIXES[mix].comps() })} options={Object.entries(MIXES).map(([k, v]) => [k, v.name] as const)} />
          <Note>{MIXES[s.mix]?.note}</Note>
          <Table
            head={['Component', 'Parts', 'Bag size', `Price / bag`, '']}
            rows={s.comps.map((c) => [
              <input key="n" value={c.name} aria-label="Component" onChange={(e) => editM(c.id, { name: e.target.value })} style={{ width: 170 }} />,
              inp(c.parts, (parts) => editM(c.id, { parts }), 'Parts', 56),
              <span key="b" style={{ display: 'inline-flex', gap: 4 }}>{inp(c.bag, (bag) => editM(c.id, { bag }), 'Bag size', 60)}<select value={c.unit} aria-label="Bag unit" onChange={(e) => editM(c.id, { unit: e.target.value as BagUnit })}><option value="L">L</option><option value="ft3">ft³</option><option value="qt">dry qt</option></select></span>,
              inp(c.price, (price) => editM(c.id, { price }), 'Price', 70),
              <Btn key="x" kind="ghost" title="Remove" onClick={() => set({ comps: s.comps.filter((x) => x.id !== c.id) })}>✕</Btn>,
            ])}
          />
          <Row>
            <Btn onClick={() => set({ comps: [...s.comps, C('New component', 1, 50, 'L', 10)] })}>+ Component</Btn>
            <Select label="Currency" value={s.cur} onChange={(cur) => set({ cur })} options={['$', '€', '£', '₴', 'zł', 'CHF ']} />
          </Row>
          <Slider label="Fill level" value={s.fill} min={50} max={100} unit="%" onChange={(fill) => set({ fill })} />
          <Slider label="Settling allowance" value={s.settle} min={0} max={30} unit="%" onChange={(settle) => set({ settle })} />
          <p className="muted" style={{ fontSize: 13 }}>Fresh mixes settle 10–20 % after the first waterings, and pots are filled about 2–3 cm (1″) below the rim.</p>
        </Panel>
      </div>
      <div>
        <Stats>
          <Stat label="Soil to buy" value={vol(need)} tone="accent" sub={s.imperial ? `${num(need / L_PER_YD3, 2)} yd³ · ${num(need, 0)} L` : `${num(need / 1000, 3)} m³ · ${num(need / L_PER_FT3, 1)} ft³`} />
          <Stat label="Bags" value={bags} sub={`${num(need / L_PER_GAL, 0)} US gal`} />
          <Stat label="Total cost" value={m(cost)} sub={need > 0 ? `${m(cost / (s.imperial ? need / L_PER_FT3 : need))} per ${s.imperial ? 'ft³' : 'L'}` : undefined} />
        </Stats>
        <Panel title="Shopping list" actions={<CsvButton name="soil-mix.csv" rows={() => [['Component', 'Share %', 'Litres', 'ft3', 'Bags', 'Bag size', 'Cost'], ...lines.map((l) => [l.c.name, Math.round(l.share * 1000) / 10, Math.round(l.litres * 10) / 10, Math.round((l.litres / L_PER_FT3) * 100) / 100, l.bags, `${l.c.bag} ${l.c.unit}`, Math.round(l.cost * 100) / 100])]} />}>
          <Table
            head={['Component', 'Share', 'Amount', 'Bags', 'Left over', 'Cost']}
            rows={lines.map((l) => [l.c.name, `${num(l.share * 100, 0)}%`, vol(l.litres), <b key="b">{l.bags} × {l.c.bag} {l.c.unit === 'ft3' ? 'ft³' : l.c.unit === 'qt' ? 'qt' : 'L'}</b>, vol(l.leftover), m(l.cost)])}
            foot={['Total', '100%', vol(need), bags, vol(lines.reduce((a, l) => a + l.leftover, 0)), m(cost)]}
          />
          {need > L_PER_YD3 * 1.5 && <Note>Over {num(need / L_PER_YD3, 1)} cubic yards: bulk delivery from a landscape yard is usually much cheaper than bags.</Note>}
        </Panel>
        <Panel title="Mix by volume">
          <Donut slices={lines.map((l) => ({ label: l.c.name, value: Math.round(l.litres * 10) / 10 }))} fv={(v) => vol(v)} center={<b>{vol(need)}</b>} />
        </Panel>
      </div>
    </Split>
  )
}
