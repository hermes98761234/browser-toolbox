import { useState } from 'react'
import { Btn, CsvButton, JsonButtons, LineChart, Note, Num, Panel, Ring, Row, Select, Split, Stats, Table, Txt, num, today, uid, useToolState } from '../kit'
import { cycleStage, freeAmmoniaFraction, RANGES, status, type Kind, type Param, type Test } from './lib/aquarium-water-log'

interface State { name: string; litres: number; kind: Kind; tests: Test[] }

const PARAMS: { k: Param; name: string; unit: string; color: string; step: number }[] = [
  { k: 'nh3', name: 'Ammonia', unit: 'ppm', color: '#f59e0b', step: 0.25 },
  { k: 'no2', name: 'Nitrite', unit: 'ppm', color: '#ef4444', step: 0.25 },
  { k: 'no3', name: 'Nitrate', unit: 'ppm', color: '#a855f7', step: 5 },
  { k: 'ph', name: 'pH', unit: '', color: '#0ea5e9', step: 0.1 },
  { k: 'temp', name: 'Temperature', unit: '°C', color: '#10b981', step: 0.5 },
]
const TONE = { ok: 'var(--ok)', warn: 'var(--warn)', bad: 'var(--err)', none: 'var(--muted)' }

const DAY = 86400000
const ago = (n: number) => new Date(Date.now() - n * DAY).toISOString().slice(0, 10)
function sample(): Test[] {
  // A typical fishless cycle over ~6 weeks, then weekly maintenance tests.
  const rows: [number, number, number, number, number, number, number?][] = [
    [56, 2, 0, 0, 7.6, 25.5], [52, 2, 0.25, 0, 7.6, 25.5], [48, 1.5, 1, 5, 7.5, 25.5], [45, 2, 2, 5, 7.4, 26], [42, 1, 4, 10, 7.4, 26],
    [38, 0.5, 5, 20, 7.2, 26], [35, 0.25, 3, 30, 7.2, 26], [31, 0, 1, 40, 7.0, 26, 50], [28, 0, 0.25, 25, 7.2, 26], [24, 0, 0, 30, 7.2, 25.5],
    [21, 0, 0, 35, 7.1, 25.5, 40], [14, 0, 0, 20, 7.2, 25.5, 30], [7, 0, 0, 25, 7.2, 25], [1, 0, 0, 32, 7.1, 25],
  ]
  return rows.map(([d, nh3, no2, no3, ph, temp, change]) => ({ id: uid(), date: ago(d), nh3, no2, no3, ph, temp, ...(change ? { change } : {}) }))
}
const DEF: State = { name: 'Living room 120 L', litres: 120, kind: 'fresh', tests: sample() }

function BandChart({ tests, p, kind }: { tests: Test[]; p: (typeof PARAMS)[number]; kind: Kind }) {
  const pts = tests.filter((t) => t[p.k] !== undefined).map((t) => [Date.parse(t.date), t[p.k]!] as [number, number])
  const [a, b, , d] = RANGES[kind][p.k]
  if (pts.length < 2) return <p className="muted" style={{ fontSize: 12 }}>Need 2+ readings.</p>
  const W = 300, H = 90, L = 30, R = 6, T = 6, B = 16
  const x0 = pts[0][0], x1 = pts[pts.length - 1][0]
  let y0 = Math.min(...pts.map((q) => q[1]), a), y1 = Math.max(...pts.map((q) => q[1]), b)
  if (p.k === 'ph' || p.k === 'temp') { y0 -= (y1 - y0) * 0.15; y1 += (y1 - y0) * 0.15 } else { y0 = 0; y1 = Math.max(y1 * 1.1, Math.min(d, b * 2)) }
  const sx = (x: number) => L + ((x - x0) / (x1 - x0 || 1)) * (W - L - R)
  const sy = (y: number) => T + (1 - (y - y0) / (y1 - y0 || 1)) * (H - T - B)
  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', height: 'auto', display: 'block' }} role="img" aria-label={`${p.name} chart`}>
      <rect x={L} width={W - L - R} y={sy(Math.min(b, y1))} height={Math.max(0, sy(Math.max(a, y0)) - sy(Math.min(b, y1)))} fill="var(--ok)" opacity={0.15} />
      <line x1={L} x2={W - R} y1={H - B} y2={H - B} stroke="var(--line)" />
      {[y0, y1].map((v) => <text key={v} x={L - 3} y={sy(v) + 3} fontSize={8} textAnchor="end" fill="var(--muted)">{num(v, 2)}</text>)}
      <polyline points={pts.map(([x, y]) => `${sx(x)},${sy(y)}`).join(' ')} fill="none" stroke={p.color} strokeWidth={2} />
      {pts.map(([x, y], i) => <circle key={i} cx={sx(x)} cy={sy(y)} r={2.5} fill={TONE[status(kind, p.k, y)]}><title>{`${new Date(x).toISOString().slice(0, 10)}: ${y}`}</title></circle>)}
      <text x={L} y={H - 4} fontSize={8} fill="var(--muted)">{new Date(x0).toISOString().slice(5, 10)}</text>
      <text x={W - R} y={H - 4} fontSize={8} fill="var(--muted)" textAnchor="end">{new Date(x1).toISOString().slice(5, 10)}</text>
    </svg>
  )
}

export default function AquariumWaterLog() {
  const [s, set] = useToolState('aquarium-water-log', DEF)
  const blank: Test = { id: '', date: today(), nh3: 0, no2: 0, no3: 10, ph: 7.2, temp: 25 }
  const [f, setF] = useState<Test>(() => ({ ...(s.tests.at(-1) ?? blank), id: '', date: today(), change: undefined, note: '' }))
  const [targetNo3, setTargetNo3] = useState(10)

  const tests = [...s.tests].sort((a, b) => a.date.localeCompare(b.date))
  const latest = (k: Param) => [...tests].reverse().find((t) => t[k] !== undefined)?.[k]
  const cyc = cycleStage(tests)
  const ph = latest('ph') ?? 7, temp = latest('temp') ?? 25, nh3 = latest('nh3') ?? 0
  const freeNH3 = nh3 * freeAmmoniaFraction(ph, temp)
  const no3 = latest('no3') ?? 0
  const changePct = no3 > targetNo3 ? 1 - targetNo3 / no3 : 0
  const t0 = tests.length ? Date.parse(tests[0].date) : 0
  const dayOf = (d: string) => (Date.parse(d) - t0) / DAY
  const add = () => {
    set({ tests: [...s.tests, { ...f, id: uid() }] })
    setF({ ...f, note: '', change: undefined })
  }
  const field = (k: Param | 'change', label: string, unit: string, step: number) => (
    <Num label={label} value={(f[k] as number | undefined) ?? 0} onChange={(v) => setF({ ...f, [k]: v })} unit={unit} min={0} step={step} />
  )

  return (
    <Split wide="right">
      <div>
        <Panel title="Tank">
          <Txt label="Name" value={s.name} onChange={(name) => set({ name })} />
          <Row>
            <Num label="Volume" value={s.litres} onChange={(litres) => set({ litres })} unit="L" min={1} />
            <Select label="Type" value={s.kind} onChange={(kind) => set({ kind })} options={[['fresh', 'Freshwater community'], ['planted', 'Planted / soft water'], ['reef', 'Marine reef']]} />
          </Row>
        </Panel>
        <Panel title="Log a test">
          <Txt label="Date" type="date" value={f.date} onChange={(date) => setF({ ...f, date })} />
          <Row>
            {field('nh3', 'Ammonia NH₃/NH₄', 'ppm', 0.25)}
            {field('no2', 'Nitrite NO₂', 'ppm', 0.25)}
          </Row>
          <Row>
            {field('no3', 'Nitrate NO₃', 'ppm', 5)}
            {field('ph', 'pH', '', 0.1)}
          </Row>
          <Row>
            {field('temp', 'Temperature', '°C', 0.5)}
            {field('change', 'Water changed', '%', 5)}
          </Row>
          <Txt label="Note" value={f.note ?? ''} onChange={(note) => setF({ ...f, note })} placeholder="dosed ammonia, added plants…" />
          <Btn kind="primary" onClick={add} disabled={!f.date}>+ Save test</Btn>
        </Panel>
        <Panel title="Nitrate water-change helper">
          <Num label="Target nitrate" value={targetNo3} onChange={setTargetNo3} unit="ppm" min={0} />
          {changePct > 0 ? (
            <Note>Change about <b>{Math.ceil(changePct * 100)}%</b> ({num(changePct * s.litres, 0)} L) to bring {no3} ppm down to {targetNo3} ppm (tap water assumed nitrate-free).</Note>
          ) : (
            <Note tone="ok">Nitrate ({no3} ppm) is already at or below target.</Note>
          )}
        </Panel>
      </div>

      <div>
        <Stats>
          {PARAMS.map((p) => {
            const v = latest(p.k)
            const st = status(s.kind, p.k, v)
            const [a, b] = RANGES[s.kind][p.k]
            return (
              <div key={p.k} className="k-stat" style={{ borderLeft: `4px solid ${TONE[st]}` }}>
                <span className="k-stat-label">{p.name}</span>
                <b className="k-stat-value" style={{ color: TONE[st] }}>{v === undefined ? '—' : `${v}${p.unit ? ' ' + p.unit : ''}`}</b>
                <span className="k-stat-sub">ideal {a}–{b}</span>
              </div>
            )
          })}
        </Stats>
        <Panel title="Nitrogen cycle">
          <div style={{ display: 'flex', gap: 16, alignItems: 'center', flexWrap: 'wrap' }}>
            <Ring value={cyc.progress} size={110} color={cyc.stage === 4 ? 'var(--ok)' : 'var(--accent)'} label={<b>{Math.round(cyc.progress * 100)}%</b>} />
            <div style={{ flex: 1, minWidth: 220 }}>
              <div style={{ display: 'flex', gap: 4, marginBottom: 8 }}>
                {['Ammonia', 'Nitrite', 'Nitrate', 'Cycled'].map((n, i) => (
                  <span key={n} style={{ flex: 1, textAlign: 'center', fontSize: 12, padding: '4px 0', borderRadius: 6, background: cyc.stage > i ? (cyc.stage === 4 ? 'var(--ok)' : 'var(--accent)') : 'var(--panel2)', color: cyc.stage > i ? '#fff' : 'var(--muted)', fontWeight: 700 }}>{n}</span>
                ))}
              </div>
              <b>{cyc.label}</b>
              <p className="muted" style={{ margin: '4px 0 0', fontSize: 13 }}>{cyc.hint}</p>
            </div>
          </div>
          {tests.length > 1 && (
            <LineChart
              height={220}
              xLabel="days since first test"
              fx={(v) => num(v, 0)}
              series={PARAMS.slice(0, 3).map((p) => ({ name: `${p.name} (ppm)`, color: p.color, points: tests.filter((t) => t[p.k] !== undefined).map((t) => [dayOf(t.date), t[p.k]!] as [number, number]) }))}
              markers={tests.filter((t) => t.change).slice(-3).map((t) => ({ x: dayOf(t.date), label: `💧${t.change}%` }))}
            />
          )}
        </Panel>
        <Panel title="Toxic free ammonia">
          <p style={{ margin: 0 }}>
            At pH {ph} and {temp} °C, <b>{num(freeAmmoniaFraction(ph, temp) * 100, 2)}%</b> of total ammonia is un-ionised NH₃ → <b style={{ color: freeNH3 > 0.02 ? 'var(--err)' : freeNH3 > 0.005 ? 'var(--warn)' : 'var(--ok)' }}>{num(freeNH3, 4)} ppm</b> free NH₃.
            <span className="muted"> Chronic stress starts around 0.02 ppm. Higher pH and temperature make the same reading far more toxic.</span>
          </p>
        </Panel>
        <Panel title="Parameters vs. safe range">
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 12 }}>
            {PARAMS.map((p) => (
              <div key={p.k}>
                <b style={{ fontSize: 13, color: p.color }}>{p.name}</b>
                <BandChart tests={tests} p={p} kind={s.kind} />
              </div>
            ))}
          </div>
          <p className="muted" style={{ fontSize: 12 }}>Green band = ideal range for a {s.kind === 'reef' ? 'reef' : s.kind === 'planted' ? 'planted' : 'community'} tank. Dot colour = status of each reading.</p>
        </Panel>
        <Panel
          title={`Test history (${tests.length})`}
          actions={
            <>
              <CsvButton name="water-tests.csv" rows={() => [['Date', 'NH3', 'NO2', 'NO3', 'pH', 'Temp C', 'Water change %', 'Note'], ...tests.map((t) => [t.date, t.nh3 ?? '', t.no2 ?? '', t.no3 ?? '', t.ph ?? '', t.temp ?? '', t.change ?? '', t.note ?? ''])]} />
              <JsonButtons name="aquarium-log.json" data={s} onLoad={(d) => d && Array.isArray(d.tests) && set(d)} />
              <Btn kind="ghost" onClick={() => set({ tests: sample() })}>Sample</Btn>
            </>
          }
        >
          <Table
            max={25}
            head={['Date', 'NH₃', 'NO₂', 'NO₃', 'pH', '°C', 'WC', '']}
            rows={[...tests].reverse().map((t) => [
              t.date,
              ...PARAMS.map((p) => <span key={p.k} style={{ color: TONE[status(s.kind, p.k, t[p.k])], fontWeight: 600 }}>{t[p.k] ?? '—'}</span>),
              t.change ? `${t.change}%` : '',
              <Btn key="x" kind="ghost" title="Delete" onClick={() => set({ tests: s.tests.filter((x) => x.id !== t.id) })}>✕</Btn>,
            ])}
          />
        </Panel>
      </div>
    </Split>
  )
}
