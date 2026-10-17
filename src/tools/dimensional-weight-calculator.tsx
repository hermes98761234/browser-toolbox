import { useState } from 'react'
import { Area, BarChart, Btn, CsvButton, Note, Num, Panel, Row, Seg, Select, Split, Stat, Stats, Table, uid, useToolState } from '../kit'
import { breakEvenSide, CARRIERS, IN, LB, parseBatch, rate, type Carrier, type Pkg } from './lib/dimensional-weight-calculator'

type Units = 'metric' | 'imperial'

const BOXES: [string, number, number, number][] = [
  ['Envelope box', 30, 22, 5],
  ['Shoebox', 35, 22, 13],
  ['Small 30×20×15', 30, 20, 15],
  ['Medium 40×30×20', 40, 30, 20],
  ['Large 60×40×40', 60, 40, 40],
  ['Euro pallet 120×80×100', 120, 80, 100],
]

const DEF = {
  mode: 'single' as 'single' | 'batch',
  units: 'metric' as Units,
  l: 40, w: 30, h: 20, kg: 3.2, // stored metric
  carrier: 'exp5000',
  customDiv: 5000,
  customSys: 'metric' as Units,
  batch: [
    { id: 'a', name: 'Pillow', l: 50, w: 40, h: 20, wt: 1.1, qty: 4 },
    { id: 'b', name: 'Book set', l: 30, w: 22, h: 15, wt: 4.5, qty: 2 },
    { id: 'c', name: 'Desk lamp', l: 55, w: 30, h: 30, wt: 2.6, qty: 1 },
    { id: 'd', name: 'Tool kit', l: 45, w: 30, h: 12, wt: 7.8, qty: 1 },
    { id: 'e', name: 'Mug (gift box)', l: 15, w: 15, h: 15, wt: 0.6, qty: 6 },
  ] as Pkg[],
}

export default function DimensionalWeightCalculator() {
  const [s, set, reset] = useToolState('dimensional-weight-calculator', DEF)
  const [paste, setPaste] = useState('')
  const imp = s.units === 'imperial'
  const lu = imp ? 'in' : 'cm', wu = imp ? 'lb' : 'kg'
  const toU = (cm: number) => +(imp ? cm / IN : cm).toFixed(2)
  const fromU = (v: number) => (imp ? v * IN : v)
  const toW = (kg: number) => +(imp ? kg / LB : kg).toFixed(3)
  const fromW = (v: number) => (imp ? v * LB : v)
  const custom: Carrier = { id: 'custom', name: 'Custom divisor', system: s.customSys, divisor: s.customDiv, weightStep: s.customSys === 'imperial' ? 1 : 0.5, note: `${s.customDiv} ${s.customSys === 'imperial' ? 'in³/lb' : 'cm³/kg'}` }
  const carriers = [...CARRIERS, custom]
  const car = carriers.find((c) => c.id === s.carrier) ?? carriers[0]
  const dims: [number, number, number] = [s.l, s.w, s.h]
  const valid = dims.every((d) => d > 0) && s.kg > 0
  const r = rate(car, dims, s.kg)
  const cm3PerKg = car.system === 'imperial' ? (car.divisor * IN ** 3) / LB : car.divisor
  const hBreak = (s.kg * cm3PerKg) / (s.l * s.w)
  const showW = (x: number, unit: string) => `${x.toFixed(unit === 'kg' ? 2 : 1)} ${unit}`

  const editB = (id: string, p: Partial<Pkg>) => set({ batch: s.batch.map((b) => (b.id === id ? { ...b, ...p } : b)) })
  const rows = s.batch.map((b) => ({ b, r: rate(car, [b.l, b.w, b.h], b.wt) }))
  const tot = rows.reduce((a, { b, r: x }) => ({ actual: a.actual + x.actual * b.qty, billed: a.billed + x.billed * b.qty, pieces: a.pieces + b.qty, dimHits: a.dimHits + (x.dimWins ? b.qty : 0) }), { actual: 0, billed: 0, pieces: 0, dimHits: 0 })
  const num = (v: number, on: (n: number) => void, w = 64) => (
    <input type="number" min={0} step="any" value={v} onChange={(e) => on(Math.max(0, Number(e.target.value) || 0))} style={{ width: w }} />
  )

  return (
    <div>
      <Row>
        <Seg value={s.mode} onChange={(mode) => set({ mode })} options={[['single', 'Single parcel'], ['batch', 'Batch table']]} />
        <Seg value={s.units} onChange={(units) => set({ units })} options={[['metric', 'cm / kg'], ['imperial', 'in / lb']]} />
        <Btn kind="ghost" onClick={reset}>Reset</Btn>
      </Row>
      <div style={{ height: 12 }} />
      <Split>
        <div>
          <Panel title="Carrier">
            <Select label="Divisor preset" value={s.carrier} onChange={(carrier) => set({ carrier })} options={carriers.map((c) => [c.id, `${c.name} · ${c.system === 'imperial' ? `${c.divisor} in³/lb` : `${c.divisor} cm³/kg`}`] as const)} />
            {s.carrier === 'custom' && (
              <Row>
                <Num label="Divisor" value={s.customDiv} min={1} onChange={(customDiv) => set({ customDiv: Math.max(1, customDiv) })} />
                <Select label="Divisor units" value={s.customSys} onChange={(customSys) => set({ customSys })} options={[['metric', 'cm³ per kg'], ['imperial', 'in³ per lb']]} />
              </Row>
            )}
            <p className="muted" style={{ fontSize: 13 }}>{car.note}. Sides are rounded to whole {car.system === 'imperial' ? 'inches' : 'cm'}; billed weight rounds up to the next {car.weightStep} {car.system === 'imperial' ? 'lb' : 'kg'}.</p>
          </Panel>
          {s.mode === 'single' ? (
            <Panel title="Parcel">
              <Row>
                <Num label="Length" unit={lu} value={toU(s.l)} min={0} onChange={(v) => set({ l: fromU(v) })} />
                <Num label="Width" unit={lu} value={toU(s.w)} min={0} onChange={(v) => set({ w: fromU(v) })} />
                <Num label="Height" unit={lu} value={toU(s.h)} min={0} onChange={(v) => set({ h: fromU(v) })} />
              </Row>
              <Num label="Actual weight (packed)" unit={wu} value={toW(s.kg)} min={0} onChange={(v) => set({ kg: fromW(v) })} />
              <Row>
                {BOXES.map(([n, l, w, h]) => (
                  <Btn key={n} kind="ghost" onClick={() => set({ l, w, h })}>{n}</Btn>
                ))}
              </Row>
            </Panel>
          ) : (
            <Panel title="Import rows">
              <Area value={paste} onChange={setPaste} rows={5} mono placeholder={`name, L, W, H, weight, qty  (in ${lu} / ${wu})\nPillow, 50, 40, 20, 1.1, 4`} />
              <Row>
                <Btn
                  kind="primary"
                  disabled={!parseBatch(paste).length}
                  onClick={() => {
                    const add = parseBatch(paste).map((p) => ({ ...p, id: uid(), l: fromU(p.l), w: fromU(p.w), h: fromU(p.h), wt: fromW(p.wt) }))
                    set({ batch: [...s.batch, ...add] })
                    setPaste('')
                  }}
                >
                  Add {parseBatch(paste).length || ''} rows
                </Btn>
                <Btn kind="danger" onClick={() => set({ batch: [] })}>Clear table</Btn>
              </Row>
            </Panel>
          )}
          <Note>
            Dimensional weight = L × W × H ÷ divisor. Carriers bill the <b>greater</b> of actual and dimensional weight, so light, bulky parcels are charged for the space they take.
          </Note>
        </div>
        <div>
          {s.mode === 'single' ? (
            valid ? (
              <>
                <Stats>
                  <Stat label="Actual" value={showW(r.actual, r.unit)} />
                  <Stat label="Dimensional" value={r.applies ? showW(r.dim, r.unit) : 'n/a'} sub={r.applies ? `${r.dims.join('×')} ${car.system === 'imperial' ? 'in' : 'cm'} ÷ ${car.divisor}` : 'below size threshold'} />
                  <Stat label="Chargeable" value={`${r.billed} ${r.unit}`} tone={r.dimWins ? 'bad' : 'good'} sub={r.dimWins ? 'billed on volume' : 'billed on actual weight'} />
                </Stats>
                {r.dimWins ? (
                  <Note tone="warn">
                    You pay for {(r.billed - Math.ceil(r.actual / car.weightStep) * car.weightStep).toFixed(1)} {r.unit} of air. Keeping L×W, a height of <b>{toU(hBreak).toFixed(1)} {lu}</b> or less would bill on actual weight
                    {hBreak < s.h * 0.5 ? ' (probably not realistic: consider a smaller footprint)' : ''}. A cube of {toU(breakEvenSide(s.kg, cm3PerKg)).toFixed(1)} {lu} is the break-even size.
                  </Note>
                ) : (
                  <Note tone="ok">Dense enough: this parcel is billed on its real weight. Volume headroom before dim weight kicks in: {Math.max(0, (s.kg * cm3PerKg - s.l * s.w * s.h) / 1000).toFixed(1)} litres.</Note>
                )}
                <Panel title="All carriers compared">
                  <Table
                    head={['Carrier', 'Sides', 'Actual', 'Dim weight', 'Chargeable', '']}
                    rows={carriers.map((c) => {
                      const x = rate(c, dims, s.kg)
                      return [
                        <span key="n" style={{ fontWeight: c.id === car.id ? 700 : undefined }}>{c.name}</span>,
                        `${x.dims.join('×')} ${c.system === 'imperial' ? 'in' : 'cm'}`,
                        showW(x.actual, x.unit),
                        x.applies ? showW(x.dim, x.unit) : 'n/a',
                        <b key="b">{x.billed} {x.unit}</b>,
                        x.dimWins ? <span key="t" style={{ color: 'var(--err)' }}>dim</span> : <span key="t" style={{ color: 'var(--ok)' }}>actual</span>,
                      ]
                    })}
                  />
                  <BarChart bars={carriers.map((c) => ({ label: c.name.split(' (')[0], value: rate(c, dims, s.kg).billedKg, color: rate(c, dims, s.kg).dimWins ? 'var(--err)' : 'var(--ok)' }))} fy={(v) => `${v.toFixed(1)} kg`} height={200} />
                  <p className="muted" style={{ fontSize: 13 }}>Bars show chargeable weight in kg (red = dimensional weight applies).</p>
                </Panel>
              </>
            ) : (
              <Note tone="err">Enter positive dimensions and weight.</Note>
            )
          ) : (
            <>
              <Stats>
                <Stat label="Pieces" value={tot.pieces} sub={`${s.batch.length} lines`} />
                <Stat label="Actual total" value={showW(tot.actual, r.unit)} />
                <Stat label="Chargeable total" value={`${+tot.billed.toFixed(2)} ${r.unit}`} tone="accent" sub={`+${(((tot.billed - tot.actual) / (tot.actual || 1)) * 100).toFixed(0)}% vs actual`} />
                <Stat label="Billed on volume" value={`${tot.dimHits} / ${tot.pieces}`} tone={tot.dimHits ? 'bad' : 'good'} />
              </Stats>
              <Panel title={`Batch · ${car.name}`} actions={<>
                <Btn onClick={() => set({ batch: [...s.batch, { id: uid(), name: `Box ${s.batch.length + 1}`, l: 30, w: 20, h: 15, wt: 1, qty: 1 }] })}>+ Row</Btn>
                <CsvButton name="dim-weight-batch.csv" rows={() => [['Item', `L ${lu}`, `W ${lu}`, `H ${lu}`, `Weight ${wu}`, 'Qty', `Dim weight ${r.unit}`, `Chargeable each ${r.unit}`, `Chargeable total ${r.unit}`, 'Basis'], ...rows.map(({ b, r: x }) => [b.name, toU(b.l), toU(b.w), toU(b.h), toW(b.wt), b.qty, x.dim.toFixed(2), x.billed, x.billed * b.qty, x.dimWins ? 'dimensional' : 'actual'])]} />
              </>}>
                <Table
                  head={['Item', `L ${lu}`, `W ${lu}`, `H ${lu}`, `Wt ${wu}`, 'Qty', 'Dim', 'Bill each', 'Bill total', '']}
                  rows={rows.map(({ b, r: x }) => [
                    <input key="n" value={b.name} onChange={(e) => editB(b.id, { name: e.target.value })} style={{ width: 120 }} aria-label="Item" />,
                    num(toU(b.l), (v) => editB(b.id, { l: fromU(v) }), 56),
                    num(toU(b.w), (v) => editB(b.id, { w: fromU(v) }), 56),
                    num(toU(b.h), (v) => editB(b.id, { h: fromU(v) }), 56),
                    num(toW(b.wt), (v) => editB(b.id, { wt: fromW(v) }), 60),
                    num(b.qty, (v) => editB(b.id, { qty: Math.max(1, Math.round(v)) }), 48),
                    x.applies ? x.dim.toFixed(2) : 'n/a',
                    <b key="e" style={{ color: x.dimWins ? 'var(--err)' : undefined }}>{x.billed}</b>,
                    +(x.billed * b.qty).toFixed(2),
                    <Btn key="x" kind="ghost" onClick={() => set({ batch: s.batch.filter((y) => y.id !== b.id) })} title="Remove">✕</Btn>,
                  ])}
                  foot={['Total', '', '', '', +tot.actual.toFixed(2), tot.pieces, '', '', +tot.billed.toFixed(2), '']}
                />
                <p className="muted" style={{ fontSize: 13 }}>Billed figures use {r.unit} per the selected carrier; red = dimensional weight applies.</p>
              </Panel>
            </>
          )}
        </div>
      </Split>
    </div>
  )
}
