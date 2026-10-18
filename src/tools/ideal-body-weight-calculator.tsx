import { Note, Num, Panel, Row, Seg, Split, Stat, Stats, Table, num, useToolState } from '../kit'
import { adjustedBW, bmiWeights, cmToFtIn, FORMULAS, ftInToCm, ibw, inchesOver5ft, LB, leanBW, type Sex } from './lib/ideal-body-weight-calculator'

const DEF = { sex: 'male' as Sex, units: 'metric' as 'metric' | 'imperial', cm: 178, kg: 96, frame: 'medium' as 'small' | 'medium' | 'large', factor: 0.4 }

export default function IdealBodyWeightCalculator() {
  const [s, set] = useToolState('ideal-body-weight-calculator', DEF)
  const imp = s.units === 'imperial'
  const [ft, inch] = cmToFtIn(s.cm)
  const w = (kg: number, d = 1) => (imp ? `${num(kg / LB, d)} lb` : `${num(kg, d)} kg`)
  const frameMul = s.frame === 'small' ? 0.9 : s.frame === 'large' ? 1.1 : 1
  const rows = FORMULAS.map((f) => ({ f, v: ibw(f, s.sex, s.cm) * (f.id === 'hamwi' ? frameMul : 1) }))
  const devine = rows[0].v
  const avg = rows.reduce((a, r) => a + r.v, 0) / rows.length
  const bmi = bmiWeights(s.cm)
  const pctIbw = (s.kg / devine) * 100
  const abw = adjustedBW(devine, s.kg, s.factor)
  const lbw = leanBW(s.sex, s.kg, s.cm)
  const curBmi = s.kg / (s.cm / 100) ** 2
  const short = inchesOver5ft(s.cm) < 0
  const valid = s.cm >= 120 && s.cm <= 230 && s.kg >= 25 && s.kg <= 350

  // chart range
  const vals = [...rows.map((r) => r.v), bmi.low, bmi.high, s.kg]
  const lo = Math.floor(Math.min(...vals) * 0.9), hi = Math.ceil(Math.max(...vals) * 1.05)
  const X = (v: number) => 120 + ((v - lo) / (hi - lo)) * 380

  return (
    <Split>
      <div>
        <Panel title="Your measurements">
          <Seg label="Sex (formulas differ by sex at birth)" value={s.sex} onChange={(sex) => set({ sex })} options={[['male', 'Male'], ['female', 'Female']]} />
          <Seg label="Units" value={s.units} onChange={(units) => set({ units })} options={[['metric', 'cm / kg'], ['imperial', 'ft·in / lb']]} />
          {imp ? (
            <Row>
              <Num label="Height (ft)" value={ft} onChange={(v) => set({ cm: ftInToCm(v, inch) })} unit="ft" min={3} max={7} />
              <Num label="Height (in)" value={inch} onChange={(v) => set({ cm: ftInToCm(ft, v) })} unit="in" min={0} max={11.9} />
              <Num label="Actual weight" value={Math.round((s.kg / LB) * 10) / 10} onChange={(v) => set({ kg: v * LB })} unit="lb" min={50} />
            </Row>
          ) : (
            <Row>
              <Num label="Height" value={s.cm} onChange={(cm) => set({ cm })} unit="cm" min={120} max={230} />
              <Num label="Actual weight" value={Math.round(s.kg * 10) / 10} onChange={(kg) => set({ kg })} unit="kg" min={25} max={350} />
            </Row>
          )}
          <Seg label="Frame size (Hamwi only)" value={s.frame} onChange={(frame) => set({ frame })} options={[['small', 'Small −10%'], ['medium', 'Medium'], ['large', 'Large +10%']]} />
          <Num label="Adjusted-weight factor" value={s.factor} onChange={(factor) => set({ factor })} min={0} max={1} hint="0.4 is the common convention (some protocols use 0.3–0.5)" />
          {!valid && <Note tone="err">Enter a height between 120 and 230 cm and a weight between 25 and 350 kg.</Note>}
          {short && valid && <Note tone="warn">These formulas were built for adults 5 ft (152.4 cm) and taller. Below that they are extrapolated and become unreliable.</Note>}
        </Panel>
        <Panel title="About the formulas">
          <Table head={['Formula', 'Male', 'Female', '']} rows={FORMULAS.map((f) => [`${f.name} (${f.year})`, `${f.male[0]} + ${f.male[1]}·in`, `${f.female[0]} + ${f.female[1]}·in`, <span key="n" className="k-hint">{f.note}</span>])} />
          <p className="k-hint">“in” = inches of height over 5 ft; results in kg. Adjusted body weight ABW = IBW + {s.factor} × (actual − IBW), commonly used for dosing when actual weight exceeds ~120–130% of IBW. Lean body weight uses Janmahasatian et al. (2005).</p>
        </Panel>
      </div>
      <div>
        <Panel title={`Results for ${imp ? `${ft} ft ${inch} in` : `${s.cm} cm`}, ${s.sex}`}>
          <Stats>
            <Stat label="Ideal weight (Devine)" value={w(devine)} tone="accent" sub="clinical standard" />
            <Stat label="Average of 4 formulas" value={w(avg)} sub={`range ${w(Math.min(...rows.map((r) => r.v)))} – ${w(Math.max(...rows.map((r) => r.v)))}`} />
            <Stat label="Actual vs IBW" value={`${num(pctIbw, 0)}%`} tone={pctIbw > 120 ? 'bad' : pctIbw < 90 ? 'bad' : 'good'} sub={pctIbw > 130 ? 'obese range for dosing' : pctIbw > 120 ? 'overweight vs IBW' : pctIbw < 90 ? 'below IBW' : 'within ±20% of IBW'} />
            <Stat label="Adjusted body weight" value={w(abw)} sub={pctIbw > 120 ? 'relevant: actual > 120% IBW' : 'usually only used if > 120% IBW'} />
          </Stats>
          <Table
            head={['Method', 'Weight', 'BMI at that weight']}
            rows={[
              ...rows.map((r) => [`${r.f.name}${r.f.id === 'hamwi' && s.frame !== 'medium' ? ` (${s.frame} frame)` : ''}`, <b key="v">{w(r.v)}</b>, num(r.v / (s.cm / 100) ** 2, 1)]),
              ['BMI 22 reference', w(bmi.bmi22), '22.0'],
              ['Healthy BMI range (18.5–24.9)', `${w(bmi.low, 0)} – ${w(bmi.high, 0)}`, '18.5–24.9'],
              ['Lean body weight (Janmahasatian)', w(lbw), '—'],
              ['Your actual weight', w(s.kg), num(curBmi, 1)],
            ]}
          />
        </Panel>
        <Panel title="Comparison">
          <svg viewBox="0 0 520 230" style={{ width: '100%', height: 'auto' }} role="img" aria-label="Ideal weight comparison">
            <rect x={X(bmi.low)} y={6} width={X(bmi.high) - X(bmi.low)} height={190} fill="var(--ok)" opacity={0.12} />
            <text x={(X(bmi.low) + X(bmi.high)) / 2} y={20} fontSize={10} textAnchor="middle" fill="var(--ok)">healthy BMI range</text>
            {rows.map((r, i) => (
              <g key={r.f.id}>
                <text x={4} y={48 + i * 34} fontSize={12} fill="var(--fg)">{r.f.name}</text>
                <rect x={120} y={36 + i * 34} width={Math.max(2, X(r.v) - 120)} height={18} rx={4} fill="var(--accent)" opacity={0.85} />
                <text x={X(r.v) + 4} y={49 + i * 34} fontSize={11} fill="var(--fg)">{w(r.v)}</text>
              </g>
            ))}
            <line x1={X(s.kg)} x2={X(s.kg)} y1={28} y2={180} stroke="var(--err)" strokeWidth={2} strokeDasharray="5 3" />
            <text x={Math.min(X(s.kg), 470)} y={194} fontSize={11} textAnchor="middle" fill="var(--err)">you: {w(s.kg)}</text>
            <text x={120} y={222} fontSize={10} fill="var(--muted)">{w(lo, 0)}</text>
            <text x={500} y={222} fontSize={10} fill="var(--muted)" textAnchor="end">{w(hi, 0)}</text>
          </svg>
        </Panel>
        <Note tone="warn">
          <b>Informational only — not medical advice.</b> These formulas are population estimates developed mainly for medication dosing; they ignore muscle mass, age, body composition and ethnicity. Talk to a healthcare professional before setting weight goals or dosing.
        </Note>
      </div>
    </Split>
  )
}
