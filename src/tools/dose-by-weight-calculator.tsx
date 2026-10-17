import { Check, CopyButton, Btn, Note, Num, Panel, Row, Select, Seg, Split, Stat, Stats, Table, Txt, num, useToolState } from '../kit'
import { calcDose, LB, matches, type DoseInput } from './lib/dose-by-weight-calculator'

interface State extends Omit<DoseInput, 'weight'> {
  drug: string
  weightVal: number
  weightUnit: 'kg' | 'lb'
  chkWeight: number
  chkConc: number
  chkAmount: number
  checker: string
  ticks: boolean[]
}

const PRESETS: [string, Partial<State>][] = [
  ['Paracetamol oral suspension 120 mg/5 mL', { drug: 'Paracetamol', dosePerKg: 15, unit: 'mg', basis: 'dose', freq: 4, maxSingle: 1000, maxDaily: 4000, form: 'liquid', concAmount: 120, concVolume: 5, round: 0.1 }],
  ['Ibuprofen oral suspension 100 mg/5 mL', { drug: 'Ibuprofen', dosePerKg: 10, unit: 'mg', basis: 'dose', freq: 3, maxSingle: 400, maxDaily: 1200, form: 'liquid', concAmount: 100, concVolume: 5, round: 0.1 }],
  ['Amoxicillin 400 mg/5 mL, 45 mg/kg/day ÷ 2', { drug: 'Amoxicillin', dosePerKg: 45, unit: 'mg', basis: 'day', freq: 2, maxSingle: 0, maxDaily: 0, form: 'liquid', concAmount: 400, concVolume: 5, round: 0.5 }],
  ['Ondansetron 4 mg/5 mL, 0.15 mg/kg', { drug: 'Ondansetron', dosePerKg: 0.15, unit: 'mg', basis: 'dose', freq: 3, maxSingle: 4, maxDaily: 0, form: 'liquid', concAmount: 4, concVolume: 5, round: 0.1 }],
  ['Prednisolone 5 mg tablets, 1 mg/kg/day', { drug: 'Prednisolone', dosePerKg: 1, unit: 'mg', basis: 'day', freq: 1, maxSingle: 40, maxDaily: 0, form: 'tablet', concAmount: 5, concVolume: 1, round: 0.5 }],
  ['Custom (mcg/kg)', { drug: 'Custom drug', dosePerKg: 5, unit: 'mcg', basis: 'dose', freq: 1, maxSingle: 0, maxDaily: 0, form: 'liquid', concAmount: 0.05, concVolume: 1, round: 0.01 }],
]

const CHECKS = ['Right patient (two identifiers)', 'Weight is current and was measured, not estimated', 'Dose per kg matches the prescription / formulary', 'Concentration matches the product label in hand', 'Units checked (mg vs mcg, mL vs tablets)']

const DEF: State = {
  drug: 'Paracetamol', weightVal: 18.4, weightUnit: 'kg', dosePerKg: 15, unit: 'mg', basis: 'dose', freq: 4, maxSingle: 1000, maxDaily: 4000,
  form: 'liquid', concAmount: 120, concVolume: 5, round: 0.1, chkWeight: 0, chkConc: 0, chkAmount: 0, checker: '', ticks: CHECKS.map(() => false),
}

const ROUND_LIQ: [number, string][] = [[0, 'No rounding'], [0.01, '0.01 mL (1 mL syringe)'], [0.1, '0.1 mL (oral syringe)'], [0.2, '0.2 mL'], [0.5, '0.5 mL (5–10 mL syringe)'], [1, '1 mL'], [2.5, '2.5 mL (½ teaspoon)'], [5, '5 mL (spoon)']]
const ROUND_TAB: [number, string][] = [[1, 'Whole tablets'], [0.5, 'Half tablets (scored)'], [0.25, 'Quarter tablets']]

export default function DoseByWeightCalculator() {
  const [s, set, reset] = useToolState('dose-by-weight-calculator', DEF)
  const weight = s.weightUnit === 'lb' ? s.weightVal * LB : s.weightVal
  const r = calcDose({ ...s, weight })
  const u = s.form === 'liquid' ? 'mL' : 'tablet(s)'
  const valid = weight > 0 && s.dosePerKg > 0 && s.concAmount > 0 && (s.form === 'tablet' || s.concVolume > 0)
  const chkW = s.weightUnit === 'lb' ? s.chkWeight * LB : s.chkWeight
  const okW = s.chkWeight > 0 && Math.abs(chkW - weight) < 0.05
  const okC = s.chkConc > 0 && Math.abs(s.chkConc - s.concAmount) < 1e-9
  const okA = s.chkAmount > 0 && matches(s.chkAmount, r.amount, s.round)
  const allTicks = s.ticks.every(Boolean)
  const verified = valid && okW && okC && okA && allTicks && s.checker.trim() !== ''
  const step = s.round
  const concLabel = s.form === 'liquid' ? `${num(s.concAmount, 4)} mg / ${num(s.concVolume, 3)} mL` : `${num(s.concAmount, 4)} mg per tablet`
  const summary = () =>
    [
      `${s.drug} — weight-based dose`,
      `Weight: ${num(weight, 2)} kg${s.weightUnit === 'lb' ? ` (${s.weightVal} lb)` : ''}`,
      `Order: ${s.dosePerKg} ${s.unit}/kg per ${s.basis === 'day' ? `day ÷ ${s.freq}` : 'dose'}, ${s.freq}×/day`,
      `Dose: ${num(r.mgPerDose, 3)} mg per dose${r.capped ? ` (capped, ${r.capped} max)` : ''}`,
      `Product: ${concLabel}`,
      `Give: ${num(r.amount, 3)} ${u} = ${num(r.deliveredMg, 3)} mg (${num(r.deliveredPerKg, 3)} ${s.unit}/kg)`,
      `Daily total: ${num(r.deliveredMg * s.freq, 3)} mg`,
      verified ? `Independently double-checked by ${s.checker}` : 'NOT yet double-checked',
    ].join('\n')

  return (
    <Split>
      <div>
        <Note tone="warn">For <b>verification only</b>. It does not replace a prescriber, pharmacist or your local formulary. Example presets are illustrative — always check doses against current references.</Note>
        <Panel title="1 · Patient & order">
          <Select label="Example preset" value="" onChange={(k) => { const p = PRESETS.find(([n]) => n === k); if (p) set({ ...p[1], chkAmount: 0, chkConc: 0 }) }} options={[['', 'Choose an example…'], ...PRESETS.map(([n]) => [n, n] as [string, string])]} />
          <Txt label="Drug" value={s.drug} onChange={(drug) => set({ drug })} />
          <Row>
            <Num label="Body weight" value={s.weightVal} onChange={(weightVal) => set({ weightVal })} unit={s.weightUnit} min={0} />
            <div className="k-field"><span className="k-label">Unit</span><Seg value={s.weightUnit} onChange={(weightUnit) => set({ weightUnit })} options={[['kg', 'kg'], ['lb', 'lb']]} /></div>
          </Row>
          <Row>
            <Num label="Dose" value={s.dosePerKg} onChange={(dosePerKg) => set({ dosePerKg })} unit={`${s.unit}/kg`} min={0} />
            <div className="k-field"><span className="k-label">Dose unit</span><Seg value={s.unit} onChange={(unit) => set({ unit })} options={[['mg', 'mg'], ['mcg', 'mcg']]} /></div>
          </Row>
          <Row>
            <div className="k-field"><span className="k-label">Dose is per</span><Seg value={s.basis} onChange={(basis) => set({ basis })} options={[['dose', 'Single dose'], ['day', 'Day (divided)']]} /></div>
            <Num label="Doses per day" value={s.freq} onChange={(freq) => set({ freq: Math.max(1, Math.round(freq)) })} min={1} max={24} step={1} hint={`every ${num(24 / Math.max(1, s.freq), 1)} h`} />
          </Row>
          <Row>
            <Num label="Max single dose" value={s.maxSingle} onChange={(maxSingle) => set({ maxSingle })} unit="mg" min={0} hint="0 = no cap" />
            <Num label="Max daily dose" value={s.maxDaily} onChange={(maxDaily) => set({ maxDaily })} unit="mg" min={0} hint="0 = no cap" />
          </Row>
        </Panel>
        <Panel title="2 · Product & rounding">
          <Seg value={s.form} onChange={(form) => set({ form, round: form === 'tablet' ? 0.5 : 0.1 })} options={[['liquid', 'Liquid / injection'], ['tablet', 'Tablets']]} />
          <Row>
            <Num label={s.form === 'liquid' ? 'Strength' : 'Tablet strength'} value={s.concAmount} onChange={(concAmount) => set({ concAmount })} unit="mg" min={0} />
            {s.form === 'liquid' && <Num label="per volume" value={s.concVolume} onChange={(concVolume) => set({ concVolume })} unit="mL" min={0} />}
          </Row>
          <Select label="Round to" value={s.round} onChange={(round) => set({ round })} options={s.form === 'liquid' ? ROUND_LIQ : ROUND_TAB} />
        </Panel>
      </div>
      <div>
        {!valid ? (
          <Note tone="err">Enter a positive weight, dose and concentration.</Note>
        ) : (
          <>
            <Panel title={`${s.drug} — give per dose`}>
              <div style={{ textAlign: 'center', padding: '6px 0 10px' }}>
                <div style={{ fontSize: 52, fontWeight: 800, lineHeight: 1.1 }}>{num(r.amount, 3)} <span style={{ fontSize: 26 }}>{u}</span></div>
                <div className="muted">= {num(r.deliveredMg, 3)} mg · {s.freq}× daily · {concLabel}</div>
                {verified ? <div style={{ color: 'var(--ok)', fontWeight: 800, marginTop: 6 }}>✓ Double-checked by {s.checker}</div> : <div style={{ color: 'var(--warn)', fontWeight: 700, marginTop: 6 }}>⚠ Not yet double-checked</div>}
              </div>
              <Stats>
                <Stat label="Weight" value={`${num(weight, 2)} kg`} sub={s.weightUnit === 'lb' ? `${s.weightVal} lb` : `${num(weight / LB, 1)} lb`} />
                <Stat label="Dose" value={`${num(r.mgPerDose, 3)} mg`} sub={r.capped ? `capped from ${num(r.mgPerDoseRaw, 3)} mg` : 'per dose'} tone={r.capped ? 'bad' : undefined} />
                <Stat label="Delivered" value={`${num(r.deliveredPerKg, 3)} ${s.unit}/kg`} sub={`${r.deviation >= 0 ? '+' : ''}${(r.deviation * 100).toFixed(1)}% from rounding`} />
                <Stat label="Daily total" value={`${num(r.deliveredMg * s.freq, 4)} mg`} sub={s.maxDaily ? `max ${s.maxDaily} mg` : undefined} />
              </Stats>
              {r.warnings.map((w) => <Note key={w} tone="warn">{w}</Note>)}
            </Panel>
            <Panel title="Show the working">
              <Table
                head={['Step', 'Calculation', 'Result']}
                rows={[
                  ['Weight', s.weightUnit === 'lb' ? `${s.weightVal} lb × 0.4536` : 'as entered', `${num(weight, 3)} kg`],
                  ['Dose', `${num(weight, 3)} kg × ${s.dosePerKg} ${s.unit}/kg${s.unit === 'mcg' ? ' ÷ 1000' : ''}${s.basis === 'day' ? ` ÷ ${s.freq} doses` : ''}`, `${num(r.mgPerDoseRaw, 4)} mg`],
                  ['Cap', r.capped ? (r.capped === 'single' ? `max single ${s.maxSingle} mg` : `max daily ${s.maxDaily} mg ÷ ${s.freq}`) : 'within limits', `${num(r.mgPerDose, 4)} mg`],
                  ['Concentration', s.form === 'liquid' ? `${s.concAmount} mg ÷ ${s.concVolume} mL` : 'per tablet', `${num(r.conc, 4)} mg/${s.form === 'liquid' ? 'mL' : 'tab'}`],
                  ['Amount', `${num(r.mgPerDose, 4)} mg ÷ ${num(r.conc, 4)}`, `${num(r.amountRaw, 4)} ${u}`],
                  ['Rounded', step ? `to nearest ${step} ${u}` : 'not rounded', <b key="a">{num(r.amount, 4)} {u}</b>],
                ]}
              />
            </Panel>
          </>
        )}
        <Panel title="3 · Independent double-check" actions={<CopyButton text={summary} label="Copy record" />}>
          <p className="muted" style={{ marginTop: 0 }}>A second person reads the weight and label themselves and calculates the amount without looking at the result above.</p>
          <Row>
            <Num label={`Weight read (${s.weightUnit})`} value={s.chkWeight} onChange={(chkWeight) => set({ chkWeight })} min={0} hint={s.chkWeight ? (okW ? '✓ matches' : '✗ differs') : undefined} />
            <Num label="Strength on label (mg)" value={s.chkConc} onChange={(chkConc) => set({ chkConc })} min={0} hint={s.chkConc ? (okC ? '✓ matches' : '✗ differs') : undefined} />
            <Num label={`Checker's amount (${u})`} value={s.chkAmount} onChange={(chkAmount) => set({ chkAmount })} min={0} hint={s.chkAmount ? (okA ? '✓ matches' : '✗ differs') : undefined} />
          </Row>
          {CHECKS.map((c, i) => (
            <Check key={c} label={c} value={s.ticks[i] ?? false} onChange={(v) => set({ ticks: CHECKS.map((_, j) => (j === i ? v : (s.ticks[j] ?? false))) })} />
          ))}
          <Txt label="Checker's name / initials" value={s.checker} onChange={(checker) => set({ checker })} />
          {verified ? (
            <Note tone="ok">Verified: both calculations agree and all checks are confirmed.</Note>
          ) : (s.chkAmount > 0 && !okA) || (s.chkWeight > 0 && !okW) || (s.chkConc > 0 && !okC) ? (
            <Note tone="err">Mismatch — stop and recalculate together before giving the dose.</Note>
          ) : (
            <Note>Fill in the checker's values, tick every item and sign to confirm.</Note>
          )}
          <Row>
            <Btn kind="ghost" onClick={() => set({ chkWeight: 0, chkConc: 0, chkAmount: 0, checker: '', ticks: CHECKS.map(() => false) })}>Clear check</Btn>
            <Btn kind="ghost" onClick={reset}>Reset all</Btn>
          </Row>
        </Panel>
      </div>
    </Split>
  )
}
