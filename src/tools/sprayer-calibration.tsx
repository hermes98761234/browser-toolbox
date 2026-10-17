import { useEffect, useRef, useState } from 'react'
import { Bar, Btn, CsvButton, Note, Num, Panel, Row, Seg, Split, Stat, Stats, Table, uid, useToolState } from '../kit'
import { catchLpm, flowForRate, pressureFor, rateLha, speedKmh, tankPlan, uniformity } from './lib/sprayer-calibration'

type Sys = 'metric' | 'us'
interface Product { id: string; name: string; rate: number; unit: string }

// Everything is stored metric; US mode converts at the input/output edge.
const C = {
  vol: 3.785411784, // L per US gal
  speed: 1.609344, // km/h per mph
  len: 2.54, // cm per inch
  rate: 9.353958, // L/ha per GPA
  area: 0.40468564, // ha per acre
  dist: 0.3048, // m per ft
  ml: 29.5735296, // mL per fl oz
  pres: 1 / 14.5037738, // bar per psi
}

const DEF = {
  sys: 'metric' as Sys,
  spacing: 50, speed: 8, target: 150, pressure: 3, tank: 2000, field: 35, // cm, km/h, L/ha, bar, L, ha
  runDist: 100, runTime: 45, catchTime: 30,
  catches: [560, 575, 548, 590, 652, 566, 571, 558], // mL
  products: [
    { id: 'p1', name: 'Herbicide A', rate: 2.5, unit: 'L' },
    { id: 'p2', name: 'Adjuvant', rate: 0.5, unit: 'L' },
    { id: 'p3', name: 'Fungicide WG', rate: 0.3, unit: 'kg' },
  ] as Product[],
}

const f = (x: number, d = 2) => (Number.isFinite(x) ? x.toLocaleString('en-US', { maximumFractionDigits: d }) : '—')

export default function SprayerCalibration() {
  const [s, set, reset] = useToolState('sprayer-calibration', DEF)
  const us = s.sys === 'us'
  // unit helpers: k = factor metric-per-us; show converts metric → display, take converts display → metric
  const show = (v: number, k: number) => (us ? v / k : v)
  const take = (v: number, k: number) => (us ? v * k : v)
  const u = us
    ? { vol: 'gal', speed: 'mph', len: 'in', rate: 'GPA', area: 'ac', dist: 'ft', ml: 'fl oz', pres: 'psi', flow: 'GPM' }
    : { vol: 'L', speed: 'km/h', len: 'cm', rate: 'L/ha', area: 'ha', dist: 'm', ml: 'mL', pres: 'bar', flow: 'L/min' }
  const r2 = (x: number) => Math.round(x * 1000) / 1000

  // Stopwatch
  const [t0, setT0] = useState<number | null>(null)
  const [elapsed, setElapsed] = useState(0)
  const raf = useRef(0)
  useEffect(() => {
    if (t0 === null) return
    const tick = () => { setElapsed((Date.now() - t0) / 1000); raf.current = requestAnimationFrame(tick) }
    raf.current = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf.current)
  }, [t0])
  const sw = Math.round(elapsed * 10) / 10

  const needFlow = flowForRate(s.target, s.speed, s.spacing)
  const uni = uniformity(s.catches)
  const flow = s.catchTime > 0 ? catchLpm(uni.mean, s.catchTime) : NaN
  const actual = rateLha(flow, s.speed, s.spacing)
  const err = actual / s.target - 1
  const fixP = pressureFor(s.pressure, flow, needFlow)
  const measuredSpeed = s.runTime > 0 ? speedKmh(s.runDist, s.runTime) : NaN
  const plan = tankPlan(s.tank, s.target, s.field)
  const haPerTankArea = plan.haPerTank // ha
  const fl = (lpm: number) => show(lpm, C.vol)

  const setCatch = (i: number, v: number) => set({ catches: s.catches.map((x, j) => (j === i ? v : x)) })
  const ok = s.spacing > 0 && s.speed > 0 && s.target > 0 && s.tank > 0

  return (
    <div>
      <Stats>
        <Stat label="Required nozzle flow" value={`${f(fl(needFlow), 3)} ${u.flow}`} sub={`for ${f(show(s.target, C.rate), 1)} ${u.rate}`} tone="accent" />
        <Stat label="Measured nozzle flow" value={`${f(fl(flow), 3)} ${u.flow}`} sub={`avg of ${s.catches.length} nozzles · CV ${f(uni.cv * 100, 1)}%`} />
        <Stat label="Actual application rate" value={`${f(show(actual, C.rate), 1)} ${u.rate}`} sub={`${err >= 0 ? '+' : ''}${f(err * 100, 1)}% vs target`} tone={Math.abs(err) <= 0.05 ? 'good' : 'bad'} />
        <Stat label="Area per tank" value={`${f(show(haPerTankArea, C.area), 2)} ${u.area}`} sub={`${f(plan.tanks, 2)} tanks for the field`} />
      </Stats>
      <Split>
        <div>
          <Panel title="Sprayer setup" actions={<><Seg value={s.sys} onChange={(sys) => set({ sys })} options={[['metric', 'Metric'], ['us', 'US']]} /><Btn kind="ghost" onClick={reset}>Reset</Btn></>}>
            <Row>
              <Num label="Nozzle spacing" value={r2(show(s.spacing, C.len))} unit={u.len} min={1} onChange={(v) => set({ spacing: take(v, C.len) })} />
              <Num label="Travel speed" value={r2(show(s.speed, C.speed))} unit={u.speed} min={0.1} step={0.1} onChange={(v) => set({ speed: take(v, C.speed) })} />
            </Row>
            <Row>
              <Num label="Target rate" value={r2(show(s.target, C.rate))} unit={u.rate} min={1} onChange={(v) => set({ target: take(v, C.rate) })} />
              <Num label="Pressure at test" value={r2(show(s.pressure, C.pres))} unit={u.pres} min={0.1} step={0.1} onChange={(v) => set({ pressure: take(v, C.pres) })} />
            </Row>
            <Row>
              <Num label="Tank size" value={r2(show(s.tank, C.vol))} unit={u.vol} min={1} onChange={(v) => set({ tank: take(v, C.vol) })} />
              <Num label="Field area" value={r2(show(s.field, C.area))} unit={u.area} min={0} onChange={(v) => set({ field: take(v, C.area) })} />
            </Row>
            {!ok && <Note tone="err">Spacing, speed, target rate and tank size must be positive.</Note>}
            <p className="muted" style={{ fontSize: 12 }}>{us ? 'GPA = 5940 × GPM ÷ (MPH × spacing in)' : 'L/ha = 60 000 × L/min ÷ (km/h × spacing cm)'}</p>
          </Panel>

          <Panel title="⏱ Stopwatch">
            <div style={{ fontSize: 56, fontWeight: 800, fontVariantNumeric: 'tabular-nums', textAlign: 'center', lineHeight: 1.1 }}>{elapsed.toFixed(1)}<span style={{ fontSize: 22 }}> s</span></div>
            <Row>
              {t0 === null ? <Btn kind="primary" onClick={() => setT0(Date.now() - elapsed * 1000)}>▶ {elapsed ? 'Resume' : 'Start'}</Btn> : <Btn kind="primary" onClick={() => setT0(null)}>⏸ Stop</Btn>}
              <Btn onClick={() => { setT0(null); setElapsed(0) }}>↺ Reset</Btn>
              <Btn disabled={!sw || t0 !== null} onClick={() => set({ runTime: sw })}>Use as run time</Btn>
              <Btn disabled={!sw || t0 !== null} onClick={() => set({ catchTime: sw })}>Use as catch time</Btn>
            </Row>
          </Panel>

          <Panel title="Speed check (timed run)">
            <Row>
              <Num label="Distance driven" value={r2(show(s.runDist, C.dist))} unit={u.dist} min={1} onChange={(v) => set({ runDist: take(v, C.dist) })} />
              <Num label="Time" value={s.runTime} unit="s" min={0.1} onChange={(runTime) => set({ runTime })} />
            </Row>
            <Row>
              <span>Measured speed: <b>{f(show(measuredSpeed, C.speed), 2)} {u.speed}</b></span>
              <Btn disabled={!Number.isFinite(measuredSpeed)} onClick={() => set({ speed: measuredSpeed })}>Use as travel speed</Btn>
            </Row>
            <p className="muted" style={{ fontSize: 12 }}>Drive a measured course ({us ? '300 ft' : '100 m'} is typical) in the field, at the gear and RPM you will spray with, with a half-full tank.</p>
          </Panel>
        </div>

        <div>
          <Panel
            title="Nozzle catch test"
            actions={<><Btn onClick={() => set({ catches: [...s.catches, Math.round(uni.mean) || 500] })}>+ Nozzle</Btn><CsvButton name="catch-test.csv" rows={() => [['Nozzle', `Catch (${u.ml})`, `Flow (${u.flow})`, 'Deviation %'], ...s.catches.map((c, i) => [i + 1, r2(show(c, C.ml)), r2(fl(catchLpm(c, s.catchTime))), r2((c / uni.mean - 1) * 100)])]} /></>}
          >
            <Num label="Catch time" value={s.catchTime} unit="s" min={1} onChange={(catchTime) => set({ catchTime })} hint="Collect each nozzle for the same time (30–60 s)." />
            <Table
              head={['#', `Catch (${u.ml})`, u.flow, 'vs mean', '']}
              rows={s.catches.map((c, i) => {
                const dev = c / uni.mean - 1
                const bad = uni.flagged.includes(i)
                return [
                  i + 1,
                  <input key="c" type="number" min={0} value={r2(show(c, C.ml))} onChange={(e) => setCatch(i, take(Math.max(0, Number(e.target.value) || 0), C.ml))} style={{ width: 80 }} aria-label={`Nozzle ${i + 1} catch`} />,
                  f(fl(catchLpm(c, s.catchTime)), 3),
                  <div key="d" style={{ minWidth: 110 }}>
                    <b style={{ color: bad ? 'var(--err)' : 'var(--ok)' }}>{dev >= 0 ? '+' : ''}{f(dev * 100, 1)}%</b>
                    <Bar value={c} max={uni.max * 1.05} color={bad ? 'var(--err)' : 'var(--ok)'} />
                  </div>,
                  <Btn key="x" kind="ghost" disabled={s.catches.length <= 1} onClick={() => set({ catches: s.catches.filter((_, j) => j !== i) })} title="Remove">✕</Btn>,
                ]
              })}
            />
            {uni.flagged.length > 0 ? (
              <Note tone="warn">Nozzle{uni.flagged.length > 1 ? 's' : ''} {uni.flagged.map((i) => i + 1).join(', ')} {uni.flagged.length > 1 ? 'deviate' : 'deviates'} more than 10% from the mean: clean or replace before calibrating.</Note>
            ) : <Note tone="ok">All nozzles are within ±10% of the mean.</Note>}
            {Number.isFinite(actual) && Math.abs(err) > 0.05 && (
              <Note tone="info">
                Rate is {f(Math.abs(err) * 100, 1)}% {err > 0 ? 'high' : 'low'}. Fix it by changing pressure to <b>{f(show(fixP, C.pres), 2)} {u.pres}</b> (flow ∝ √pressure)
                {fixP > s.pressure * 2 || fixP < s.pressure / 2 ? ', but that is a big jump — change nozzle size instead' : ''}, or by driving at <b>{f(show(s.speed * (actual / s.target), C.speed), 2)} {u.speed}</b>.
              </Note>
            )}
          </Panel>

          <Panel title="Tank mix" actions={<Btn onClick={() => set({ products: [...s.products, { id: uid(), name: 'Product', rate: 1, unit: 'L' }] })}>+ Product</Btn>}>
            <p style={{ fontSize: 13, marginTop: 0 }}>
              Field needs <b>{f(show(plan.totalWater, C.vol), 0)} {u.vol}</b> of spray: <b>{plan.fullTanks}</b> full tank{plan.fullTanks === 1 ? '' : 's'}
              {plan.lastTankL > 0.5 ? <> + a last tank of <b>{f(show(plan.lastTankL, C.vol), 0)} {u.vol}</b></> : ''}.
            </p>
            <Table
              head={['Product', `Rate / ${u.area}`, 'Unit', 'Per full tank', plan.lastTankL > 0.5 ? 'Last tank' : '', 'Whole field', '']}
              rows={s.products.map((p) => {
                const ed = (patch: Partial<Product>) => set({ products: s.products.map((x) => (x.id === p.id ? { ...x, ...patch } : x)) })
                const perArea = us ? p.rate / C.area : p.rate // rate per ha (metric) regardless of display
                return [
                  <input key="n" value={p.name} onChange={(e) => ed({ name: e.target.value })} aria-label="Product name" style={{ width: 120 }} />,
                  <input key="r" type="number" min={0} step="any" value={p.rate} onChange={(e) => ed({ rate: Math.max(0, Number(e.target.value) || 0) })} aria-label="Rate" style={{ width: 70 }} />,
                  <input key="u" value={p.unit} onChange={(e) => ed({ unit: e.target.value })} aria-label="Unit" style={{ width: 50 }} />,
                  <b key="t">{f(perArea * plan.haPerTank, 2)} {p.unit}</b>,
                  plan.lastTankL > 0.5 ? `${f((perArea * plan.lastTankL) / s.target, 2)} ${p.unit}` : '',
                  `${f(perArea * s.field, 1)} ${p.unit}`,
                  <Btn key="x" kind="ghost" onClick={() => set({ products: s.products.filter((x) => x.id !== p.id) })} title="Remove">✕</Btn>,
                ]
              })}
            />
            <p className="muted" style={{ fontSize: 12 }}>Fill the tank half with water, add products in label order (WG/WP → SC → EC → adjuvants), agitate, then top up. Always follow the product label.</p>
          </Panel>
        </div>
      </Split>
    </div>
  )
}
