import { CsvButton, LineChart, Note, Num, Panel, Row, Seg, Slider, Split, Stat, Stats, Table, Txt, num, useToolState } from '../kit'
import { fmtTime, KM_PER_MI, parseTime, riegel, speed, splits } from './lib/running-pace-calculator'

type Unit = 'km' | 'mi'
type Solve = 'pace' | 'time' | 'dist'

interface State {
  unit: Unit
  solve: Solve
  dist: number
  time: string
  pace: string
  splitEvery: number
  neg: number
  k: number
}

const DEF: State = { unit: 'km', solve: 'pace', dist: 10, time: '50:00', pace: '5:00', splitEvery: 1, neg: 0, k: 1.06 }

/** Standard races in km. */
const RACES: [string, number][] = [
  ['1 mile', KM_PER_MI],
  ['5K', 5],
  ['10K', 10],
  ['15K', 15],
  ['10 miles', 10 * KM_PER_MI],
  ['Half marathon', 21.0975],
  ['Marathon', 42.195],
  ['50K', 50],
]

export default function RunningPaceCalculator() {
  const [s, set, reset] = useToolState('running-pace-calculator', DEF)
  const u = s.unit
  const toUnit = (km: number) => (u === 'km' ? km : km / KM_PER_MI)
  const tIn = parseTime(s.time)
  const pIn = parseTime(s.pace)

  let dist = s.dist, time = tIn, pace = pIn
  if (s.solve === 'pace') pace = time / dist
  else if (s.solve === 'time') time = pace * dist
  else dist = time / pace
  const ok = dist > 0 && time > 0 && pace > 0 && Number.isFinite(dist + time + pace)
  const distKm = u === 'km' ? dist : dist * KM_PER_MI
  const paceKm = time / distKm
  const paceMi = paceKm * KM_PER_MI

  const sp = ok ? splits(dist, time, s.splitEvery, s.neg / 100) : []
  const curve: [number, number][] = ok ? Array.from({ length: 50 }, (_, i) => [toUnit(1 + i), riegel(time, distKm, 1 + i, s.k) / toUnit(1 + i)]) : []
  const preds = ok ? RACES.map(([name, km]) => ({ name, km, t: riegel(time, distKm, km, s.k) })) : []

  const setUnit = (unit: Unit) => {
    if (unit === u) return
    const f = unit === 'km' ? KM_PER_MI : 1 / KM_PER_MI
    set({ unit, dist: Math.round(s.dist * f * 1000) / 1000, pace: Number.isFinite(pIn) ? fmtTime(pIn / f, true).replace(/\.0$/, '') : s.pace })
  }
  const field = (which: Solve) => s.solve === which

  return (
    <Split>
      <div>
        <Panel title="Calculator" actions={<button className="k-btn ghost" onClick={reset}>Reset</button>}>
          <Row>
            <Seg label="Units" value={u} onChange={setUnit} options={[['km', 'Kilometres'], ['mi', 'Miles']]} />
          </Row>
          <p className="muted" style={{ margin: '10px 0 4px' }}>Solve for:</p>
          <Seg label="Solve for" value={s.solve} onChange={(solve) => set({ solve, ...(ok ? { dist: Math.round(dist * 1000) / 1000, time: fmtTime(time), pace: fmtTime(pace, true).replace(/\.0$/, '') } : {}) })} options={[['pace', 'Pace'], ['time', 'Finish time'], ['dist', 'Distance']]} />
          <div style={{ marginTop: 12 }}>
            {field('dist') ? (
              <Stat label={`Distance (${u})`} value={ok ? num(dist, 2) : '—'} tone="accent" />
            ) : (
              <>
                <Num label="Distance" value={s.dist} onChange={(d) => set({ dist: d })} unit={u} min={0.01} />
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, margin: '6px 0 12px' }}>
                  {RACES.map(([n, km]) => (
                    <button key={n} className="k-btn ghost" style={{ padding: '2px 8px', fontSize: 12 }} onClick={() => set({ dist: Math.round(toUnit(km) * 1000) / 1000 })}>
                      {n}
                    </button>
                  ))}
                </div>
              </>
            )}
            {field('time') ? (
              <Stat label="Finish time" value={ok ? fmtTime(time) : '—'} tone="accent" />
            ) : (
              <Txt label="Finish time" value={s.time} onChange={(time) => set({ time })} placeholder="h:mm:ss" hint={Number.isFinite(tIn) ? `= ${num(tIn / 60, 1)} minutes` : 'Use h:mm:ss, mm:ss or 3h20m'} />
            )}
            {field('pace') ? (
              <Stat label={`Pace (per ${u})`} value={ok ? fmtTime(pace, true) : '—'} tone="accent" />
            ) : (
              <Txt label={`Pace (min per ${u})`} value={s.pace} onChange={(pace) => set({ pace })} placeholder="m:ss" hint={Number.isFinite(pIn) ? `${fmtTime(pIn, true)} per ${u}` : 'Use m:ss'} />
            )}
          </div>
          {!ok && <Note tone="err">Enter a positive distance and valid times (e.g. 52:30 or 1:45:00).</Note>}
        </Panel>
        <Panel title="Split options">
          <Row>
            <Num label="Split every" value={s.splitEvery} onChange={(splitEvery) => set({ splitEvery })} unit={u} min={0.1} />
          </Row>
          <Slider label="Negative split (first half slower)" value={s.neg} onChange={(neg) => set({ neg })} min={-6} max={10} step={0.5} unit="%" />
          <p className="muted" style={{ fontSize: 13 }}>0 % = even pacing. Positive values start slower and finish faster, keeping the same total time.</p>
        </Panel>
        <Panel title="Predictor settings">
          <Slider label="Riegel fatigue exponent" value={s.k} onChange={(k) => set({ k })} min={1.01} max={1.15} step={0.01} />
          <p className="muted" style={{ fontSize: 13 }}>T₂ = T₁ × (D₂ / D₁)<sup>k</sup>. 1.06 is Riegel's classic value; use ~1.08 if you lack endurance base, ~1.04 for well-trained marathoners.</p>
        </Panel>
      </div>

      <div>
        <Stats>
          <Stat label="Pace / km" value={ok ? fmtTime(paceKm, true) : '—'} />
          <Stat label="Pace / mile" value={ok ? fmtTime(paceMi, true) : '—'} />
          <Stat label="Speed" value={ok ? `${num(speed(pace), 2)} ${u === 'km' ? 'km/h' : 'mph'}` : '—'} sub={ok ? `${num(u === 'km' ? speed(pace) / KM_PER_MI : speed(pace) * KM_PER_MI, 2)} ${u === 'km' ? 'mph' : 'km/h'}` : undefined} />
          <Stat label="400 m lap" value={ok ? fmtTime(paceKm * 0.4, true) : '—'} sub="track lap time" tone="accent" />
        </Stats>

        <Panel title="Race predictor (Riegel)">
          {ok && (
            <>
              <Table
                head={['Race', 'Predicted time', `Pace /${u}`, 'vs. your pace']}
                rows={preds.map((p) => {
                  const pp = p.t / toUnit(p.km)
                  const d = pp - pace
                  return [
                    <b key="n" style={{ color: Math.abs(p.km - distKm) < 0.05 ? 'var(--accent)' : undefined }}>{p.name}</b>,
                    fmtTime(p.t),
                    fmtTime(pp, true),
                    <span key="d" className="muted">{Math.abs(d) < 0.5 ? '—' : `${d > 0 ? '+' : '−'}${fmtTime(Math.abs(d), true)}`}</span>,
                  ]
                })}
              />
              <LineChart
                height={200}
                xLabel={`Distance (${u})`}
                yLabel={`Pace (min/${u})`}
                fx={(v) => num(v, 0)}
                fy={(v) => fmtTime(v)}
                yMin={ok ? Math.floor(curve[0][1] / 15) * 15 - 15 : undefined}
                series={[{ name: 'Predicted pace', points: curve, area: true }]}
                markers={[{ x: dist, label: 'you' }]}
              />
            </>
          )}
        </Panel>

        <Panel title={`Splits every ${num(s.splitEvery, 2)} ${u}`} actions={<CsvButton name="splits.csv" rows={() => [['#', `Distance (${u})`, `Pace /${u}`, 'Split', 'Elapsed'], ...sp.map((x) => [x.n, num(x.dist, 3), fmtTime(x.pace, true), fmtTime(x.split, true), fmtTime(x.cum)])]} />}>
          <Table
            max={60}
            head={['#', `Distance`, `Pace /${u}`, 'Split', 'Elapsed']}
            rows={sp.map((x) => [x.n, `${num(x.dist, 2)} ${u}`, fmtTime(x.pace, true), fmtTime(x.split, true), <b key="c">{fmtTime(x.cum)}</b>])}
          />
        </Panel>
      </div>
    </Split>
  )
}
