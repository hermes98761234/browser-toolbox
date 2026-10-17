import { Btn, color, CopyButton, LineChart, Note, Num, Panel, Row, Seg, Split, Stat, Stats, Table, useToolState } from '../kit'
import { bmi, FORMULAS, IN, LB, type Sex } from './lib/body-surface-area-calculator'

const DEF = { units: 'metric' as 'metric' | 'imperial', weight: 70, height: 170, sex: 'female' as Sex, primary: 'mosteller', dosePerM2: 75, doseUnit: 'mg' }

const PRESETS: [string, number, number, Sex][] = [
  ['Newborn', 3.5, 50, 'female'],
  ['5-year-old', 18, 110, 'male'],
  ['Adult woman', 64, 163, 'female'],
  ['Adult man', 80, 177, 'male'],
  ['Tall athlete', 95, 195, 'male'],
  ['Obesity', 130, 170, 'female'],
]

export default function BodySurfaceAreaCalculator() {
  const [s, set, reset] = useToolState('body-surface-area-calculator', DEF)
  const imp = s.units === 'imperial'
  const w = s.weight, h = s.height // always stored metric
  const valid = w > 0 && h > 0 && w < 500 && h < 280
  const res = FORMULAS.map((f) => ({ ...f, v: valid ? f.f(w, h, s.sex) : NaN }))
  const vals = res.map((r) => r.v)
  const mean = vals.reduce((a, b) => a + b, 0) / vals.length
  const min = Math.min(...vals), max = Math.max(...vals)
  const prim = res.find((r) => r.id === s.primary) ?? res[0]
  const b = valid ? bmi(w, h) : NaN
  const m2 = (v: number) => (Number.isFinite(v) ? v.toFixed(2) : '—')

  // BSA across weights at the current height (each formula).
  const ws = Array.from({ length: 30 }, (_, i) => Math.max(2, (w * (0.4 + i * 0.05))))
  const series = FORMULAS.map((f, i) => ({ name: f.name, color: color(i), points: ws.map((x) => [imp ? x / LB : x, f.f(x, h, s.sex)] as [number, number]) }))

  return (
    <Split>
      <div>
        <Panel title="Patient" actions={<Btn kind="ghost" onClick={reset}>Reset</Btn>}>
          <Row>
            <Seg value={s.units} onChange={(units) => set({ units })} options={[['metric', 'kg / cm'], ['imperial', 'lb / in']]} label="Units" />
            <Seg value={s.sex} onChange={(sex) => set({ sex })} options={[['female', 'Female'], ['male', 'Male']]} label="Sex" />
          </Row>
          <Row>
            <Num label="Weight" value={+(imp ? w / LB : w).toFixed(2)} onChange={(v) => set({ weight: imp ? v * LB : v })} unit={imp ? 'lb' : 'kg'} min={0.5} />
            <Num label="Height" value={+(imp ? h / IN : h).toFixed(2)} onChange={(v) => set({ height: imp ? v * IN : v })} unit={imp ? 'in' : 'cm'} min={20} />
          </Row>
          {!valid && <Note tone="err">Enter a weight up to 500 kg and a height up to 280 cm.</Note>}
          <div className="k-label" style={{ margin: '8px 0 4px' }}>Examples</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {PRESETS.map(([n, pw, ph, sx]) => <Btn key={n} kind="ghost" onClick={() => set({ weight: pw, height: ph, sex: sx })}>{n}</Btn>)}
          </div>
          <p className="muted" style={{ fontSize: 13 }}>Sex only affects the Schlich formula.</p>
        </Panel>
        <Panel title="Dose by BSA">
          <Row>
            <Num label="Dose per m²" value={s.dosePerM2} onChange={(dosePerM2) => set({ dosePerM2 })} unit={`${s.doseUnit}/m²`} min={0} />
            <Seg value={s.doseUnit} onChange={(doseUnit) => set({ doseUnit })} options={[['mg', 'mg'], ['mcg', 'mcg'], ['g', 'g'], ['units', 'units']]} label="Dose unit" />
          </Row>
          <Stat label={`Total dose (${prim.name})`} value={`${Number.isFinite(prim.v) ? (s.dosePerM2 * prim.v).toFixed(1) : '—'} ${s.doseUnit}`} sub={`range across formulas ${(s.dosePerM2 * min).toFixed(1)}–${(s.dosePerM2 * max).toFixed(1)} ${s.doseUnit}`} tone="accent" />
          <Note tone="warn">Educational tool. Always verify doses against your institution's protocol; many protocols cap BSA (e.g. 2.0–2.2 m²).</Note>
        </Panel>
      </div>
      <div>
        <Stats>
          <Stat label={`BSA · ${prim.name}`} value={`${m2(prim.v)} m²`} sub={`${Number.isFinite(prim.v) ? (prim.v * 10.7639).toFixed(1) : '—'} ft²`} tone="accent" />
          <Stat label="Mean of all formulas" value={`${m2(mean)} m²`} sub={`range ${m2(min)}–${m2(max)}`} />
          <Stat label="Spread" value={Number.isFinite(mean) ? `${(((max - min) / mean) * 100).toFixed(1)}%` : '—'} sub="max − min vs mean" />
          <Stat label="BMI" value={Number.isFinite(b) ? b.toFixed(1) : '—'} sub={b < 18.5 ? 'underweight' : b < 25 ? 'normal' : b < 30 ? 'overweight' : 'obese'} />
        </Stats>
        <Panel title="Side-by-side results" actions={<CopyButton label="Copy" text={() => res.map((r) => `${r.name}: ${m2(r.v)} m²`).join('\n')} />}>
          <Table
            head={['', 'Formula', 'BSA (m²)', 'vs mean', 'Expression']}
            rows={res.map((r) => [
              <input key="r" type="radio" name="bsa-primary" checked={r.id === s.primary} onChange={() => set({ primary: r.id })} aria-label={`Use ${r.name}`} />,
              <b key="n">{r.name} <span className="muted">({r.year})</span></b>,
              <b key="v" style={{ fontSize: 16 }}>{m2(r.v)}</b>,
              Number.isFinite(r.v) ? `${r.v >= mean ? '+' : ''}${(((r.v - mean) / mean) * 100).toFixed(1)}%` : '—',
              <code key="e" style={{ fontSize: 12 }}>{r.expr}</code>,
            ])}
          />
          <p className="muted" style={{ fontSize: 13 }}>W = weight in kg, H = height in cm. Pick the radio button to choose the formula used for dosing.</p>
        </Panel>
        <Panel title={`BSA vs weight at ${imp ? (h / IN).toFixed(1) + ' in' : h.toFixed(0) + ' cm'}`}>
          <LineChart series={series} height={240} xLabel={imp ? 'Weight (lb)' : 'Weight (kg)'} yLabel="m²" fx={(v) => v.toFixed(0)} fy={(v) => v.toFixed(2)} markers={[{ x: imp ? w / LB : w, label: 'now' }]} />
        </Panel>
        <Panel title="Citations">
          {FORMULAS.map((f) => (
            <p key={f.id} style={{ fontSize: 13, margin: '0 0 8px' }}>
              <b>{f.name}</b> — {f.note}<br />
              <span className="muted">{f.cite}</span>
            </p>
          ))}
        </Panel>
      </div>
    </Split>
  )
}
