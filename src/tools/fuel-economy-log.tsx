import { useState } from 'react'
import { BarChart, Btn, Check, CsvButton, JsonButtons, LineChart, money, Note, num, Num, Panel, Row, Seg, Select, Split, Stat, Stats, Table, today, Txt, uid, useToolState } from '../kit'
import { economy, KM_PER_MI, L_PER_USGAL, lowerIsBetter, METRICS, segments, type Fill, type Metric } from './lib/fuel-economy-log'

interface State { vehicle: string; dist: 'km' | 'mi'; vol: 'L' | 'gal'; metric: Metric; cur: string; fills: Fill[] }

const ago = (d: number) => new Date(Date.now() - d * 86400000).toISOString().slice(0, 10)
const RAW: [number, number, number, number, boolean?][] = [
  // days ago, odometer km, litres, price per litre, full?
  [160, 41250, 38.2, 1.72], [146, 41810, 41.0, 1.69], [133, 42335, 37.9, 1.74], [121, 42790, 20.0, 1.79, false], [112, 43120, 34.6, 1.77],
  [98, 43690, 40.3, 1.71], [84, 44270, 41.8, 1.68], [70, 44820, 38.6, 1.66], [57, 45400, 39.9, 1.70], [43, 45985, 41.2, 1.73],
  [30, 46510, 37.0, 1.75], [16, 47080, 40.6, 1.71], [3, 47640, 39.4, 1.69],
]
const DEF: State = {
  vehicle: 'Family hatchback',
  dist: 'km', vol: 'L', metric: 'l100', cur: '€',
  fills: RAW.map(([d, odo, vol, p, full = true]) => ({ id: uid(), date: ago(d), odo, vol, cost: Math.round(vol * p * 100) / 100, full })),
}

export default function FuelEconomyLog() {
  const [s, set, reset] = useToolState('fuel-economy-log', DEF)
  const sorted = [...s.fills].sort((a, b) => a.odo - b.odo)
  const last = sorted[sorted.length - 1]
  const [f, setF] = useState({ date: today(), odo: 0, vol: 0, cost: 0, full: true, missed: false, note: '' })
  const odoIn = f.odo || (last ? last.odo + (s.dist === 'km' ? 500 : 300) : 0)
  const km = (d: number) => (s.dist === 'mi' ? d * KM_PER_MI : d)
  const lit = (v: number) => (s.vol === 'gal' ? v * L_PER_USGAL : v)
  const segs = segments(s.fills)
  const eco = (sg: { distance: number; fuel: number }) => economy(km(sg.distance), lit(sg.fuel), s.metric)
  const totDist = segs.reduce((a, x) => a + x.distance, 0)
  const totFuel = segs.reduce((a, x) => a + x.fuel, 0)
  const avg = economy(km(totDist), lit(totFuel), s.metric)
  const vals = segs.map(eco)
  const better = (a: number, b: number) => (lowerIsBetter(s.metric) ? a < b : a > b)
  const best = vals.reduce((a, v) => (Number.isNaN(a) || better(v, a) ? v : a), NaN)
  const worst = vals.reduce((a, v) => (Number.isNaN(a) || better(a, v) ? v : a), NaN)
  const lastV = vals[vals.length - 1]
  const spent = s.fills.reduce((a, x) => a + x.cost, 0)
  const span = sorted.length > 1 ? last.odo - sorted[0].odo : 0
  const costPerDist = segs.length ? segs.reduce((a, x) => a + x.cost, 0) / totDist : NaN
  const mu = METRICS.find((m) => m[0] === s.metric)![1]
  const m = (x: number, d = 2) => money(x, s.cur, d)
  const months = new Map<string, number>()
  for (const x of s.fills) months.set(x.date.slice(0, 7), (months.get(x.date.slice(0, 7)) ?? 0) + x.cost)

  const add = () => {
    if (!(f.vol > 0) || !(odoIn > 0)) return
    set({ fills: [...s.fills, { id: uid(), date: f.date, odo: odoIn, vol: f.vol, cost: f.cost, full: f.full, missed: f.missed || undefined, note: f.note.trim() || undefined }] })
    setF({ ...f, odo: 0, vol: 0, cost: 0, missed: false, note: '' })
  }
  const lastPrice = last && last.vol ? last.cost / last.vol : 0

  return (
    <Split>
      <div>
        <Panel title="Add fill-up">
          <Row>
            <Txt label="Date" type="date" value={f.date} onChange={(date) => setF({ ...f, date })} />
            <Num label="Odometer" unit={s.dist} value={odoIn} min={0} onChange={(odo) => setF({ ...f, odo })} />
          </Row>
          <Row>
            <Num label="Fuel added" unit={s.vol} value={f.vol} min={0} onChange={(vol) => setF({ ...f, vol, cost: f.cost || Math.round(vol * lastPrice * 100) / 100 })} />
            <Num label="Total cost" unit={s.cur} value={f.cost} min={0} onChange={(cost) => setF({ ...f, cost })} hint={f.vol > 0 && f.cost > 0 ? `${m(f.cost / f.vol, 3)} per ${s.vol}` : undefined} />
          </Row>
          <Check label="Filled the tank completely" value={f.full} onChange={(full) => setF({ ...f, full })} />
          <Check label="I missed logging the previous fill-up" value={f.missed} onChange={(missed) => setF({ ...f, missed })} />
          <Txt label="Note" value={f.note} placeholder="e.g. road trip, winter tyres" onChange={(note) => setF({ ...f, note })} />
          {last && odoIn <= last.odo && <Note tone="warn">Odometer should be higher than the last reading ({num(last.odo, 0)} {s.dist}).</Note>}
          <Btn kind="primary" disabled={!(f.vol > 0) || !(odoIn > 0)} onClick={add}>Save fill-up</Btn>
        </Panel>
        <Panel title="Settings" actions={<Btn kind="ghost" onClick={reset}>Sample</Btn>}>
          <Txt label="Vehicle" value={s.vehicle} onChange={(vehicle) => set({ vehicle })} />
          <Row>
            <Select label="Distance in" value={s.dist} onChange={(dist) => set({ dist })} options={[['km', 'kilometres'], ['mi', 'miles']]} />
            <Select label="Fuel in" value={s.vol} onChange={(vol) => set({ vol })} options={[['L', 'litres'], ['gal', 'US gallons']]} />
            <Select label="Currency" value={s.cur} onChange={(cur) => set({ cur })} options={['€', '$', '£', '₴', 'zł', '¥', 'CHF ']} />
          </Row>
          <p className="muted" style={{ fontSize: 12.5, margin: 0 }}>Units describe how you record readings; they don't convert existing entries.</p>
        </Panel>
        <Note>
          <span><b>Full-tank method:</b> fill to the click each time. Economy for a stretch = distance between two full fills ÷ all fuel added after the first one. Partial fills are added in; a missed entry voids that stretch so it can't skew the average.</span>
        </Note>
      </div>

      <div>
        <Seg value={s.metric} onChange={(metric) => set({ metric })} options={METRICS} />
        <Stats>
          <Stat label="Average" value={`${num(avg, 1)} ${mu}`} sub={`${segs.length} full-tank stretches`} tone="accent" />
          <Stat label="Last tank" value={`${num(lastV, 1)}`} sub={Number.isFinite(lastV) && Number.isFinite(avg) ? `${better(lastV, avg) ? 'better' : 'worse'} than average` : mu} tone={Number.isFinite(lastV) && better(lastV, avg) ? 'good' : undefined} />
          <Stat label="Best / worst" value={`${num(best, 1)} / ${num(worst, 1)}`} sub={mu} />
          <Stat label={`Cost per 100 ${s.dist}`} value={m(costPerDist * 100)} sub={`${m(spent, 0)} spent in total`} />
        </Stats>

        <Panel title={`Economy trend · ${s.vehicle}`}>
          <LineChart
            series={[
              { name: mu, points: segs.map((x, i) => [Date.parse(x.date), vals[i]]) },
              { name: 'Average', points: segs.length ? [[Date.parse(segs[0].date), avg], [Date.parse(segs[segs.length - 1].date), avg]] : [], dashed: true, color: '#94a3b8' },
            ]}
            fx={(v) => new Date(v).toISOString().slice(5, 10)}
            fy={(v) => num(v, 1)}
            yMin={vals.length ? Math.floor(Math.min(...vals) * 0.9) : 0}
          />
        </Panel>

        <Panel title="Fuel spending by month">
          <BarChart bars={[...months.entries()].sort().map(([k, v]) => ({ label: k, value: Math.round(v * 100) / 100, color: '#f59e0b' }))} fy={(v) => m(v, 0)} height={200} />
          <p className="muted" style={{ fontSize: 12.5, margin: 0 }}>{num(span, 0)} {s.dist} driven over {s.fills.length} fill-ups · {num(s.fills.reduce((a, x) => a + x.vol, 0), 1)} {s.vol} bought</p>
        </Panel>

        <Panel title="Fill-ups" actions={<>
          <CsvButton name="fuel-log.csv" rows={() => [['Date', `Odometer (${s.dist})`, `Fuel (${s.vol})`, 'Cost', 'Full', 'Missed', mu, 'Note'], ...sorted.map((x) => { const sg = segs.find((g) => g.to === x.odo); return [x.date, x.odo, x.vol, x.cost, x.full ? 'yes' : 'no', x.missed ? 'yes' : '', sg ? eco(sg).toFixed(2) : '', x.note ?? ''] })]} />
          <JsonButtons name="fuel-log.json" data={s} onLoad={(d) => d && Array.isArray(d.fills) && set(d)} />
        </>}>
          <Table
            max={30}
            head={['Date', 'Odometer', 'Fuel', 'Cost', 'Price', 'Tank', mu, '']}
            rows={[...sorted].reverse().map((x) => {
              const sg = segs.find((g) => g.to === x.odo)
              return [
                x.date, num(x.odo, 0), `${num(x.vol, 2)} ${s.vol}`, m(x.cost), m(x.vol ? x.cost / x.vol : 0, 3),
                <span key="t" className={x.full ? '' : 'muted'}>{x.full ? 'full' : 'partial'}{x.missed ? ' ⚠' : ''}</span>,
                sg ? <b key="e">{num(eco(sg), 1)}</b> : <span key="e" className="muted">—</span>,
                <Btn key="x" kind="ghost" title="Delete" onClick={() => set({ fills: s.fills.filter((y) => y.id !== x.id) })}>✕</Btn>,
              ]
            })}
          />
        </Panel>
      </div>
    </Split>
  )
}
