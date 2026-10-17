import { Btn, CopyButton, Note, Num, num, Panel, Row, Seg, Split, Stat, Stats, Table, useToolState } from '../kit'
import { ASIAN, bmi, category, healthyRange, IN, LB, newBmi, ponderal, WHO } from './lib/bmi-reference-calculator'

const DEF = { units: 'metric' as 'metric' | 'imperial', cm: 178, kg: 74, ft: 5, inch: 10, lb: 163, table: 'who' as 'who' | 'asian' }

const PRINT_CSS = `@media print{body *{visibility:hidden!important}.bmi-print,.bmi-print *{visibility:visible!important}.bmi-print{position:absolute;left:0;top:0;width:100%}.bmi-noprint{display:none!important}}`
const LO = 14, HI = 42
const PRINTED = new Date().toLocaleDateString()

export default function BmiReferenceCalculator() {
  const [s, set, reset] = useToolState('bmi-reference-calculator', DEF)
  const imp = s.units === 'imperial'
  const m = imp ? (s.ft * 12 + s.inch) * IN : s.cm / 100
  const kg = imp ? s.lb * LB : s.kg
  const b = bmi(kg, m)
  const table = s.table === 'asian' ? ASIAN : WHO
  const cat = Number.isFinite(b) ? category(b, table) : null
  const [lo, hi] = healthyRange(m, table)
  const w = (x: number) => (imp ? `${num(x / LB, 1)} lb` : `${num(x, 1)} kg`)
  const valid = m >= 0.5 && m <= 2.6 && kg >= 10 && kg <= 400
  const toNormal = kg < lo ? lo - kg : kg >= hi ? kg - hi : 0

  const switchUnits = (u: 'metric' | 'imperial') => {
    if (u === s.units) return
    if (u === 'imperial') {
      const totalIn = Math.round(s.cm / 2.54)
      set({ units: u, ft: Math.floor(totalIn / 12), inch: totalIn % 12, lb: Math.round(s.kg / LB) })
    } else set({ units: u, cm: Math.round(((s.ft * 12 + s.inch) * IN) * 100), kg: Math.round(s.lb * LB * 10) / 10 })
  }

  const formula = imp
    ? `BMI = 703.07 × ${num(s.lb, 1)} lb ÷ (${num(s.ft * 12 + s.inch, 1)} in)² = 703.07 × ${num(s.lb, 1)} ÷ ${num((s.ft * 12 + s.inch) ** 2, 1)} = ${num(b, 1)}`
    : `BMI = ${num(kg, 1)} kg ÷ (${num(m, 2)} m)² = ${num(kg, 1)} ÷ ${num(m * m, 4)} = ${num(b, 1)}`
  const pos = (v: number) => `${((Math.min(HI, Math.max(LO, v)) - LO) / (HI - LO)) * 100}%`
  const summary = `BMI ${num(b, 1)} kg/m² — ${cat?.name ?? '—'} (${s.table === 'asian' ? 'WHO Asian' : 'WHO'} cut-offs). Height ${imp ? `${s.ft}′${s.inch}″` : `${s.cm} cm`}, weight ${w(kg)}. Healthy range for this height: ${w(lo)} – ${w(hi)}.`

  return (
    <>
      <style>{PRINT_CSS}</style>
      <Split>
        <div className="bmi-noprint">
          <Panel title="Your measurements">
            <Seg value={s.units} onChange={switchUnits} options={[['metric', 'Metric'], ['imperial', 'Imperial']]} />
            {imp ? (
              <>
                <Row>
                  <Num label="Height" value={s.ft} onChange={(ft) => set({ ft })} unit="ft" min={1} max={8} step={1} />
                  <Num label="&nbsp;" value={s.inch} onChange={(inch) => set({ inch })} unit="in" min={0} max={11.99} />
                </Row>
                <Num label="Weight" value={s.lb} onChange={(lb) => set({ lb })} unit="lb" min={20} max={900} />
              </>
            ) : (
              <Row>
                <Num label="Height" value={s.cm} onChange={(cm) => set({ cm })} unit="cm" min={50} max={260} />
                <Num label="Weight" value={s.kg} onChange={(kg) => set({ kg })} unit="kg" min={10} max={400} />
              </Row>
            )}
            {!valid && <Note tone="err">Please enter a realistic height (50–260 cm) and weight (10–400 kg).</Note>}
            <p className="k-label" style={{ marginTop: 10 }}>Reference cut-offs</p>
            <Seg value={s.table} onChange={(table) => set({ table })} options={[['who', 'WHO standard'], ['asian', 'WHO Asian']]} />
            <Row>
              <Btn kind="primary" onClick={() => print()}>🖨 Print result</Btn>
              <CopyButton label="Copy summary" text={summary} />
              <Btn kind="ghost" onClick={reset}>Reset</Btn>
            </Row>
          </Panel>
          <Note tone="warn">BMI is a screening measure, not a diagnosis. It does not distinguish muscle from fat and is not valid for children and teens (use BMI-for-age percentiles), pregnancy, or very muscular people. Discuss results with a health professional.</Note>
        </div>
        <div className="bmi-print">
          <Panel title="Result">
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 14, flexWrap: 'wrap' }}>
              <span style={{ fontSize: 56, fontWeight: 800, lineHeight: 1, color: cat?.color }}>{valid ? num(b, 1) : '—'}</span>
              <span style={{ fontSize: 15 }} className="muted">kg/m²</span>
              <b style={{ fontSize: 22, color: cat?.color }}>{valid ? cat?.name : ''}</b>
            </div>
            <div style={{ position: 'relative', margin: '26px 0 6px' }}>
              <div style={{ height: 18, borderRadius: 9, overflow: 'hidden', display: 'flex' }}>
                {table.map((c) => {
                  const a = Math.max(LO, c.min), z = Math.min(HI, c.max)
                  return z > a ? <div key={c.name} title={c.name} style={{ width: `${((z - a) / (HI - LO)) * 100}%`, background: c.color }} /> : null
                })}
              </div>
              {valid && <div style={{ position: 'absolute', left: pos(b), top: -6, width: 4, height: 30, marginLeft: -2, borderRadius: 2, background: 'var(--fg)', boxShadow: '0 0 0 2px var(--panel)' }} title={`BMI ${num(b, 1)}`} />}
            </div>
            <div style={{ position: 'relative', height: 16, fontSize: 11 }} className="muted">
              {[...new Set(table.flatMap((c) => [c.min, c.max]))].filter((v) => v > LO && v < HI).map((v) => (
                <span key={v} style={{ position: 'absolute', left: pos(v), transform: 'translateX(-50%)' }}>{v}</span>
              ))}
            </div>
            <p className="mono" style={{ fontSize: 13, background: 'color-mix(in srgb, var(--accent) 8%, transparent)', padding: '8px 10px', borderRadius: 8, overflowWrap: 'anywhere' }}>{valid ? formula : 'BMI = weight (kg) ÷ height (m)²'}</p>
          </Panel>
          <Stats>
            <Stat label="Healthy weight" value={valid ? `${w(lo).replace(/ \w+$/, '')}–${w(hi)}` : '—'} sub={`BMI ${table.find((c) => c.name === 'Normal weight')!.min}–${(table.find((c) => c.name === 'Normal weight')!.max - 0.1).toFixed(1)} for your height`} tone="good" />
            <Stat label={kg < lo ? 'To gain' : 'To lose'} value={valid ? (toNormal ? w(toNormal) : '0 — in range') : '—'} sub="to reach the normal range" tone={toNormal ? 'bad' : 'good'} />
            <Stat label="BMI Prime" value={valid ? num(b / 25, 2) : '—'} sub="BMI ÷ 25 (1.00 = upper normal)" />
            <Stat label="Ponderal index" value={valid ? num(ponderal(kg, m), 1) : '—'} sub={`kg/m³ · new BMI ${num(newBmi(kg, m), 1)}`} />
          </Stats>
          <Panel title={`Reference categories — ${s.table === 'asian' ? 'WHO Asian' : 'WHO'}`}>
            <Table
              head={['Category', 'BMI range', `Weight at ${imp ? `${s.ft}′${s.inch}″` : `${s.cm} cm`}`, 'Health risk']}
              rows={table.map((c) => {
                const on = c === cat
                const style = on ? { fontWeight: 800 } : undefined
                return [
                  <span key="n" style={style}><i style={{ display: 'inline-block', width: 10, height: 10, borderRadius: 3, background: c.color, marginRight: 8 }} />{c.name}{on ? ' ◀ you' : ''}</span>,
                  <span key="r" style={style}>{c.min === 0 ? `< ${c.max}` : c.max === Infinity ? `≥ ${c.min}` : `${c.min} – ${(c.max - 0.1).toFixed(1)}`}</span>,
                  <span key="w" style={style}>{c.min === 0 ? `< ${w(c.max * m * m)}` : c.max === Infinity ? `≥ ${w(c.min * m * m)}` : `${w(c.min * m * m)} – ${w(c.max * m * m)}`}</span>,
                  <span key="k" style={style}>{c.risk}</span>,
                ]
              })}
            />
            <p className="muted" style={{ fontSize: 12, margin: '8px 0 0' }}>Source: WHO Technical Report Series 894 (2000); WHO expert consultation on BMI in Asian populations, Lancet 2004. Printed {PRINTED}.</p>
          </Panel>
        </div>
      </Split>
    </>
  )
}
