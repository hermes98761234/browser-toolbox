import { Btn, CsvButton, LineChart, Note, Num, Panel, Row, Seg, Select, Split, Stat, Stats, Table, num, useToolState } from '../kit'
import { ATM, byId, cToF, fromKpa, fToC, psat, REFRIGERANTS, table, toKpa, tsat, type PUnit } from './lib/refrigerant-pt-chart'

type TU = 'C' | 'F'
interface State {
  ref: string
  pu: PUnit
  gauge: boolean
  tu: TU
  atm: number
  lookT: number
  lookP: number
  shP: number
  shT: number
  scP: number
  scT: number
  from: number
  to: number
  step: number
}

const DEF: State = { ref: 'R410A', pu: 'kPa', gauge: true, tu: 'C', atm: ATM, lookT: 5, lookP: 900, shP: 820, shT: 12, scP: 2600, scT: 38, from: -40, to: 60, step: 5 }

const PDIG: Record<PUnit, number> = { kPa: 1, bar: 3, psi: 1, MPa: 4 }

export default function RefrigerantPtChart() {
  const [s, set, reset] = useToolState('refrigerant-pt-chart', DEF)
  const r = byId(s.ref)
  const zeo = r.type !== 'pure'
  const tShow = (c: number) => (s.tu === 'C' ? c : cToF(c))
  const tIn = (v: number) => (s.tu === 'C' ? v : fToC(v))
  const tU = s.tu === 'C' ? '°C' : '°F'
  const dU = s.tu === 'C' ? 'K' : '°F'
  const dT = (k: number) => (s.tu === 'C' ? k : (k * 9) / 5)
  const pShow = (kpa: number) => fromKpa(kpa, s.pu, s.gauge, s.atm)
  const pIn = (v: number) => toKpa(v, s.pu, s.gauge, s.atm)
  const pU = `${s.pu}${s.gauge ? (s.pu === 'psi' ? 'g' : ' (g)') : s.pu === 'psi' ? 'a' : ' (abs)'}`
  const P = (kpa: number) => (Number.isFinite(kpa) ? pShow(kpa).toFixed(PDIG[s.pu]) : '—')
  const T = (c: number) => (Number.isFinite(c) ? `${num(tShow(c), 1)} ${tU}` : 'out of range')

  const lt = tIn(s.lookT)
  const lp = pIn(s.lookP)
  const shSat = tsat(r, pIn(s.shP), 'dew')
  const sh = tIn(s.shT) - shSat
  const scSat = tsat(r, pIn(s.scP), 'bubble')
  const sc = scSat - tIn(s.scT)

  const rows = table(r, tIn(s.from), tIn(s.to), s.tu === 'C' ? s.step : (s.step * 5) / 9)
  const curve = table(r, r.tmin, r.tmax, (r.tmax - r.tmin) / 120)
  const series = [
    { name: zeo ? 'Bubble (liquid)' : 'Saturation', points: curve.map((x) => [tShow(x.t), pShow(x.bubble)] as [number, number]), color: '#0ea5e9' },
    ...(zeo ? [{ name: 'Dew (vapour)', points: curve.map((x) => [tShow(x.t), pShow(x.dew)] as [number, number]), color: '#f97316', dashed: true }] : []),
  ]

  const shTone = !Number.isFinite(sh) ? undefined : sh < 2 ? 'bad' : sh > 20 ? 'bad' : 'good'
  const scTone = !Number.isFinite(sc) ? undefined : sc < 1 ? 'bad' : sc > 20 ? 'bad' : 'good'

  return (
    <Split>
      <div>
        <Panel title="Refrigerant & units" actions={<Btn kind="ghost" onClick={reset}>Reset</Btn>}>
          <Select label="Refrigerant" value={s.ref} onChange={(ref) => set({ ref })} options={REFRIGERANTS.map((x) => [x.id, `${x.name} — ${x.type}`] as const)} />
          <Note>
            <b>{r.name}</b> · safety {r.safety} · GWP {r.gwp} · valid {num(tShow(r.tmin), 0)} to {num(tShow(r.tmax), 0)} {tU}. {r.note}
          </Note>
          <Row>
            <Seg value={s.pu} onChange={(pu) => set({ pu })} options={[['kPa', 'kPa'], ['bar', 'bar'], ['psi', 'psi'], ['MPa', 'MPa']]} />
            <Seg value={s.gauge ? 'g' : 'a'} onChange={(v) => set({ gauge: v === 'g' })} options={[['g', 'Gauge'], ['a', 'Absolute']]} />
            <Seg value={s.tu} onChange={(tu) => set({ tu })} options={[['C', '°C'], ['F', '°F']]} />
          </Row>
          {s.gauge && <Num label="Local atmospheric pressure" value={s.atm} onChange={(atm) => set({ atm })} unit="kPa" min={50} max={110} hint="101.325 kPa at sea level; lower at altitude (≈ 89.9 kPa at 1000 m)." />}
        </Panel>
        <Panel title="Quick lookup">
          <Row>
            <Num label={`Temperature (${tU})`} value={s.lookT} onChange={(lookT) => set({ lookT })} />
            <Num label={`Pressure (${pU})`} value={s.lookP} onChange={(lookP) => set({ lookP })} />
          </Row>
          <Table
            head={['', zeo ? 'Bubble' : 'Saturation', ...(zeo ? ['Dew'] : [])]}
            rows={[
              [`P at ${num(s.lookT, 1)} ${tU}`, `${P(psat(r, lt, 'bubble'))} ${pU}`, ...(zeo ? [`${P(psat(r, lt, 'dew'))} ${pU}`] : [])],
              [`T at ${num(s.lookP, 2)} ${pU}`, T(tsat(r, lp, 'bubble')), ...(zeo ? [T(tsat(r, lp, 'dew'))] : [])],
            ]}
          />
          {zeo && Number.isFinite(tsat(r, lp, 'dew')) && <p className="muted" style={{ margin: '6px 0 0', fontSize: 13 }}>Temperature glide at this pressure: {num(dT(tsat(r, lp, 'dew') - tsat(r, lp, 'bubble')), 2)} {dU}</p>}
        </Panel>
        <Panel title="Superheat (suction line)">
          <Row>
            <Num label={`Suction pressure (${pU})`} value={s.shP} onChange={(shP) => set({ shP })} />
            <Num label={`Suction line temp (${tU})`} value={s.shT} onChange={(shT) => set({ shT })} />
          </Row>
          <p className="muted" style={{ margin: 0, fontSize: 13 }}>Evaporating (dew) temperature: <b>{T(shSat)}</b></p>
        </Panel>
        <Panel title="Subcooling (liquid line)">
          <Row>
            <Num label={`Liquid pressure (${pU})`} value={s.scP} onChange={(scP) => set({ scP })} />
            <Num label={`Liquid line temp (${tU})`} value={s.scT} onChange={(scT) => set({ scT })} />
          </Row>
          <p className="muted" style={{ margin: 0, fontSize: 13 }}>Condensing (bubble) temperature: <b>{T(scSat)}</b></p>
        </Panel>
      </div>
      <div>
        <Stats>
          <Stat label="Superheat" value={Number.isFinite(sh) ? `${num(dT(sh), 1)} ${dU}` : '—'} sub={sh < 0 ? 'below saturation: liquid present?' : 'suction temp − dew temp'} tone={shTone as 'good' | 'bad' | undefined} />
          <Stat label="Subcooling" value={Number.isFinite(sc) ? `${num(dT(sc), 1)} ${dU}` : '—'} sub={sc < 0 ? 'flash gas in liquid line?' : 'bubble temp − liquid temp'} tone={scTone as 'good' | 'bad' | undefined} />
          <Stat label={`P at 0 ${tU}`} value={`${P(psat(r, tIn(0), 'dew'))}`} sub={pU} />
          <Stat label="Normal boiling point" value={T(tsat(r, 101.325, 'bubble'))} sub="at 101.325 kPa" />
        </Stats>
        <Panel title={`${r.name} pressure–temperature curve`}>
          <LineChart series={series} xLabel={`Temperature (${tU})`} yLabel={pU} fx={(v) => num(v, 0)} fy={(v) => num(v, s.pu === 'kPa' || s.pu === 'psi' ? 0 : 2)} height={280} markers={Number.isFinite(lt) ? [{ x: s.lookT, label: `${num(s.lookT, 1)}${tU}` }] : []} />
        </Panel>
        <Panel
          title="PT table"
          actions={<CsvButton name={`${r.id}-pt-table.csv`} rows={() => [[`T (${tU})`, ...(zeo ? [`Bubble (${pU})`, `Dew (${pU})`] : [`P (${pU})`])], ...rows.map((x) => [num(tShow(x.t), 2), pShow(x.bubble).toFixed(PDIG[s.pu]), ...(zeo ? [pShow(x.dew).toFixed(PDIG[s.pu])] : [])])]} />}
        >
          <Row>
            <Num label={`From (${tU})`} value={s.from} onChange={(from) => set({ from })} />
            <Num label={`To (${tU})`} value={s.to} onChange={(to) => set({ to })} />
            <Num label={`Step (${dU})`} value={s.step} onChange={(step) => set({ step })} min={0.1} />
          </Row>
          <Table
            head={[`T (${tU})`, ...(zeo ? [`Bubble (${pU})`, `Dew (${pU})`] : [`Pressure (${pU})`])]}
            rows={rows.map((x) => [num(tShow(x.t), 1), P(x.bubble), ...(zeo ? [P(x.dew)] : [])])}
            max={60}
          />
          {s.gauge && rows.some((x) => pShow(x.dew) < 0) && <Note>Negative gauge values mean the system is below atmospheric pressure (vacuum).</Note>}
        </Panel>
        <Note tone="warn">
          Values come from saturation curves fitted to NIST REFPROP-based reference data (within about 0.1 % over the stated range). Always <b>verify against the manufacturer’s PT chart</b> for your exact refrigerant and use calibrated gauges before charging or diagnosing a system.
        </Note>
      </div>
    </Split>
  )
}
