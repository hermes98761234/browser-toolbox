import { BarChart, Btn, CopyButton, CsvButton, Note, Num, Panel, pct, Row, Seg, Select, Slider, Split, Stat, Stats, Table, useToolState } from '../kit'
import { hrrFraction, MAX_FORMULAS, maxHr, zoneOf, zones, type MaxFormula } from './lib/heart-rate-zones'

const DEF = { age: 35, rest: 58, formula: 'tanaka' as MaxFormula, measured: 188, method: 'karvonen' as 'karvonen' | 'percent', check: 148, weekly: 300 }

const PRESETS: [string, Partial<typeof DEF>][] = [
  ['Beginner, 45', { age: 45, rest: 72 }],
  ['Recreational, 35', { age: 35, rest: 58 }],
  ['Trained runner, 28', { age: 28, rest: 46 }],
  ['Masters athlete, 60', { age: 60, rest: 52 }],
]

// Polarised plan: ~80 % easy (Z1–Z2), small slice of tempo, ~15 % hard.
const PLAN = [0.1, 0.7, 0.05, 0.1, 0.05]

export default function HeartRateZones() {
  const [s, set, reset] = useToolState('heart-rate-zones', DEF)
  const max = Math.round(maxHr(s.formula, s.age, s.measured))
  const valid = s.age >= 10 && s.age <= 100 && s.rest >= 30 && s.rest < max - 20
  const zs = zones(max, s.rest, s.method)
  const reserve = max - s.rest
  const zi = zoneOf(zs, s.check)
  const lo = Math.min(s.rest, zs[0].bpmLo)
  const span = max - lo || 1
  const x = (b: number) => ((b - lo) / span) * 100

  return (
    <Split>
      <div>
        <Panel title="You">
          <Row>
            {PRESETS.map(([n, p]) => (
              <Btn key={n} kind="ghost" onClick={() => set(p)}>{n}</Btn>
            ))}
          </Row>
          <Row>
            <Num label="Age" value={s.age} onChange={(age) => set({ age })} unit="yr" min={10} max={100} step={1} />
            <Num label="Resting heart rate" value={s.rest} onChange={(rest) => set({ rest })} unit="bpm" min={30} max={110} step={1} />
          </Row>
          <Select label="Max heart rate estimate" value={s.formula} onChange={(formula) => set({ formula })} options={MAX_FORMULAS} />
          {s.formula === 'measured' && <Num label="Measured max HR" value={s.measured} onChange={(measured) => set({ measured })} unit="bpm" min={100} max={230} step={1} />}
          <div className="k-field">
            <span className="k-label">Zone method</span>
            <Seg value={s.method} onChange={(method) => set({ method })} options={[['karvonen', 'Karvonen (HRR)'], ['percent', '% of max HR']]} />
          </div>
          <p className="muted" style={{ fontSize: 13, margin: '4px 0' }}>Measure resting HR on waking, before getting up, for a few mornings and average.</p>
          {!valid && <Note tone="err">Check the inputs: resting HR must be well below max HR, age 10–100.</Note>}
        </Panel>
        <Panel title="Which zone is this?">
          <Slider label="Heart rate" value={s.check} onChange={(check) => set({ check })} min={40} max={Math.max(220, max)} unit=" bpm" show={(v) => String(v)} />
          {zi < 0 ? (
            <Note>Below Zone 1 — very light activity ({pct(hrrFraction(max, s.rest, s.check), 0)} of reserve).</Note>
          ) : zi >= zs.length ? (
            <Note tone="warn">Above your estimated max — either the estimate is low (use a measured max) or check the sensor.</Note>
          ) : (
            <Note tone="ok">
              <b>{zs[zi].name}</b> · {pct(hrrFraction(max, s.rest, s.check), 0)} of heart-rate reserve, {pct(s.check / max, 0)} of max. {zs[zi].purpose}.
            </Note>
          )}
        </Panel>
        <Panel title="Weekly time in zones">
          <Num label="Training time per week" value={s.weekly} onChange={(weekly) => set({ weekly })} unit="min" min={0} step={10} />
          <BarChart bars={zs.map((z, i) => ({ label: z.name.split(' ')[0], value: Math.round(s.weekly * PLAN[i]), color: z.color }))} height={180} fy={(v) => `${v}′`} />
          <p className="muted" style={{ fontSize: 13 }}>Polarised split (~80 % easy, ~15 % hard) used by most endurance coaches.</p>
        </Panel>
      </div>
      <div>
        <Stats>
          <Stat label="Max heart rate" value={`${max} bpm`} sub={MAX_FORMULAS.find((f) => f[0] === s.formula)?.[1]} tone="accent" />
          <Stat label="Resting" value={`${s.rest} bpm`} sub={s.rest < 60 ? 'athletic' : s.rest <= 80 ? 'typical' : 'elevated'} />
          <Stat label="Heart-rate reserve" value={`${reserve} bpm`} sub="max − rest" />
        </Stats>
        <Panel title="Zone bar">
          <div style={{ position: 'relative', height: 64, marginTop: 6 }}>
            <div style={{ position: 'absolute', inset: '0 0 24px 0', display: 'flex', borderRadius: 8, overflow: 'hidden', background: 'var(--line)' }}>
              <div style={{ width: `${x(zs[0].bpmLo)}%` }} />
              {zs.map((z) => (
                <div key={z.name} title={`${z.name}: ${z.bpmLo}–${z.bpmHi}`} style={{ width: `${x(z.bpmHi) - x(z.bpmLo)}%`, background: z.color, color: '#fff', fontSize: 12, fontWeight: 700, display: 'grid', placeItems: 'center' }}>
                  {z.name.split(' ')[0]}
                </div>
              ))}
            </div>
            {[lo, ...zs.map((z) => z.bpmLo), max].map((b, i) => (
              <span key={i} style={{ position: 'absolute', bottom: 0, left: `${x(b)}%`, transform: 'translateX(-50%)', fontSize: 11 }} className="muted">{b}</span>
            ))}
            {s.check >= lo && s.check <= max && <div style={{ position: 'absolute', top: -4, bottom: 20, left: `${x(s.check)}%`, width: 3, background: 'var(--fg)', borderRadius: 2 }} title={`${s.check} bpm`} />}
          </div>
        </Panel>
        <Panel
          title="Training zones"
          actions={
            <>
              <CopyButton text={() => zs.map((z) => `${z.name}: ${z.bpmLo}–${z.bpmHi} bpm`).join('\n')} />
              <CsvButton name="heart-rate-zones.csv" rows={() => [['Zone', 'Low bpm', 'High bpm', 'Intensity', 'Purpose'], ...zs.map((z) => [z.name, z.bpmLo, z.bpmHi, `${z.lo * 100}-${z.hi * 100}%`, z.purpose])]} />
              <Btn kind="ghost" onClick={reset}>Reset</Btn>
            </>
          }
        >
          <Table
            head={['Zone', 'Heart rate', 'Intensity', 'Feels like', 'Trains']}
            rows={zs.map((z, i) => [
              <b key="n" style={{ color: z.color }}>● {z.name}</b>,
              <b key="b" style={{ whiteSpace: 'nowrap', background: i === zi ? 'color-mix(in srgb, var(--accent) 18%, transparent)' : undefined, padding: '2px 6px', borderRadius: 6 }}>{z.bpmLo}–{z.bpmHi}</b>,
              `${z.lo * 100}–${z.hi * 100}% ${s.method === 'karvonen' ? 'HRR' : 'max'}`,
              z.feel,
              <span key="p" className="muted">{z.purpose}</span>,
            ])}
          />
        </Panel>
        <Panel title="Max HR by formula">
          <Table
            head={['Formula', 'Max HR', 'Z2 range (Karvonen)']}
            rows={MAX_FORMULAS.filter((f) => f[0] !== 'measured').map(([k, n]) => {
              const mx = Math.round(maxHr(k, s.age))
              const z2 = zones(mx, s.rest, 'karvonen')[1]
              return [<span key="n" style={{ fontWeight: k === s.formula ? 700 : 400 }}>{n}</span>, <b key="m">{mx} bpm</b>, `${z2.bpmLo}–${z2.bpmHi} bpm`]
            })}
          />
          <Note>
            Formulas are population averages with a spread of ±10–12 bpm. A field test (e.g. 3 × 3 min hard uphill, highest reading) or a lab test gives a far better max.
            Karvonen accounts for fitness via resting HR, so trained people get higher, more realistic zone floors. This is training information, not medical advice.
          </Note>
        </Panel>
      </div>
    </Split>
  )
}
