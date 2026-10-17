import { Btn, CopyButton, Note, Num, Panel, Row, Seg, Split, Stat, Stats, Table, num, useToolState } from '../kit'
import {
  bandOf, bmi, bmiBodyFat, BMI_BANDS, devineIbw, fatBands, IN, katchBmr, LB, mifflinBmr, navyBodyFat, type Band, type Sex,
} from './lib/body-composition-calculator'

type Units = 'metric' | 'imperial'

interface State {
  units: Units
  sex: Sex
  age: number
  heightCm: number
  weightKg: number
  neckCm: number
  waistCm: number
  hipCm: number
}

const DEF: State = { units: 'metric', sex: 'male', age: 35, heightCm: 178, weightKg: 82, neckCm: 39, waistCm: 90, hipCm: 100 }

const PRESETS: [string, Partial<State>][] = [
  ['Average man', { sex: 'male', age: 35, heightCm: 178, weightKg: 82, neckCm: 39, waistCm: 90, hipCm: 100 }],
  ['Average woman', { sex: 'female', age: 32, heightCm: 164, weightKg: 64, neckCm: 33, waistCm: 76, hipCm: 99 }],
  ['Lean athlete', { sex: 'male', age: 26, heightCm: 182, weightKg: 80, neckCm: 40, waistCm: 79, hipCm: 96 }],
]

/** Horizontal category strip with a marker at `value`. */
function RangeBar({ bands, value, unit }: { bands: Band[]; value: number; unit: string }) {
  const lo = bands[0].from
  const hi = bands[bands.length - 1].to
  const x = (v: number) => ((Math.min(hi, Math.max(lo, v)) - lo) / (hi - lo)) * 100
  const ok = Number.isFinite(value)
  return (
    <div style={{ position: 'relative', padding: '26px 0 4px' }}>
      {ok && (
        <div style={{ position: 'absolute', left: `${x(value)}%`, top: 0, transform: 'translateX(-50%)', textAlign: 'center', fontWeight: 800, fontSize: 13, whiteSpace: 'nowrap' }}>
          {num(value, 1)}{unit}
          <div style={{ width: 0, height: 0, margin: '0 auto', borderLeft: '6px solid transparent', borderRight: '6px solid transparent', borderTop: '7px solid var(--fg)' }} />
        </div>
      )}
      <div style={{ display: 'flex', height: 16, borderRadius: 99, overflow: 'hidden' }}>
        {bands.map((b) => (
          <div key={b.label} title={`${b.label}: ${b.from}–${b.to}${unit}`} style={{ flex: b.to - b.from, background: b.color, opacity: bandOf(bands, value) === b ? 1 : 0.45 }} />
        ))}
      </div>
      <div style={{ display: 'flex', fontSize: 11.5, marginTop: 4 }}>
        {bands.map((b) => (
          <div key={b.label} style={{ flex: b.to - b.from, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: 'var(--muted)', fontWeight: bandOf(bands, value) === b ? 800 : 500 }}>
            {b.label}
            <div>{b.from}</div>
          </div>
        ))}
      </div>
    </div>
  )
}

export default function BodyCompositionCalculator() {
  const [s, set, reset] = useToolState('body-composition-calculator', DEF)
  const imp = s.units === 'imperial'
  const L = (cm: number) => (imp ? Math.round((cm / IN) * 10) / 10 : Math.round(cm * 10) / 10)
  const fromL = (v: number) => (imp ? v * IN : v)
  const W = (kg: number) => (imp ? Math.round((kg / LB) * 10) / 10 : Math.round(kg * 10) / 10)
  const lu = imp ? 'in' : 'cm'
  const wu = imp ? 'lb' : 'kg'
  const wFmt = (kg: number) => `${num(imp ? kg / LB : kg, 1)} ${wu}`

  const b = bmi(s.weightKg, s.heightCm)
  const navy = navyBodyFat(s.sex, s.heightCm, s.neckCm, s.waistCm, s.hipCm)
  const deur = bmiBodyFat(s.sex, b, s.age)
  const bf = Number.isFinite(navy) && navy > 0 ? navy : deur
  const fatKg = (s.weightKg * bf) / 100
  const leanKg = s.weightKg - fatKg
  const whtr = s.waistCm / s.heightCm
  const whr = s.waistCm / s.hipCm
  const h2 = (s.heightCm / 100) ** 2
  const fb = fatBands(s.sex)
  const bmiBand = bandOf(BMI_BANDS, b)
  const fatBand = bandOf(fb, bf)
  const ffmi = leanKg / h2
  const valid = s.heightCm >= 100 && s.heightCm <= 250 && s.weightKg >= 25 && s.weightKg <= 350 && s.age >= 2
  const navyBad = !Number.isFinite(navy) || navy <= 0

  const summary = [
    `BMI ${num(b, 1)} (${bmiBand?.label})`,
    `Body fat (Navy) ${Number.isFinite(navy) ? num(navy, 1) + '%' : 'n/a'}`,
    `Body fat (BMI-based) ${num(deur, 1)}%`,
    `Fat mass ${wFmt(fatKg)}, lean mass ${wFmt(leanKg)}`,
    `Waist-to-height ${num(whtr, 2)}`,
  ].join('\n')

  return (
    <Split>
      <div>
        <Panel title="Your measurements" actions={<Btn kind="ghost" onClick={reset}>Reset</Btn>}>
          <Row>
            <Seg label="Units" value={s.units} onChange={(units) => set({ units })} options={[['metric', 'Metric (cm, kg)'], ['imperial', 'Imperial (in, lb)']]} />
            <Seg label="Sex" value={s.sex} onChange={(sex) => set({ sex })} options={[['male', 'Male'], ['female', 'Female']]} />
          </Row>
          <Row>
            <Num label="Age" value={s.age} onChange={(age) => set({ age })} unit="years" min={2} max={120} step={1} />
            <Num label="Height" value={L(s.heightCm)} onChange={(v) => set({ heightCm: fromL(v) })} unit={lu} min={0} />
            <Num label="Weight" value={W(s.weightKg)} onChange={(v) => set({ weightKg: imp ? v * LB : v })} unit={wu} min={0} />
          </Row>
          <Row>
            <Num label="Neck" value={L(s.neckCm)} onChange={(v) => set({ neckCm: fromL(v) })} unit={lu} min={0} hint="Just below the larynx" />
            <Num label="Waist" value={L(s.waistCm)} onChange={(v) => set({ waistCm: fromL(v) })} unit={lu} min={0} hint={s.sex === 'male' ? 'At the navel' : 'Narrowest point'} />
            <Num label="Hip" value={L(s.hipCm)} onChange={(v) => set({ hipCm: fromL(v) })} unit={lu} min={0} hint="Widest point" />
          </Row>
          <div className="k-label" style={{ marginBottom: 6 }}>Examples</div>
          <Row>
            {PRESETS.map(([n, p]) => (
              <Btn key={n} onClick={() => set(p)}>{n}</Btn>
            ))}
          </Row>
          {!valid && <Note tone="warn">Check height, weight and age: the values look outside the range these formulas were built for.</Note>}
          {navyBad && <Note tone="warn">The Navy formula needs waist {s.sex === 'female' ? '+ hip ' : ''}larger than neck. Showing the BMI-based estimate instead.</Note>}
        </Panel>
        <Panel title="How to measure">
          <ul style={{ margin: 0, paddingLeft: 18, lineHeight: 1.6, fontSize: 14 }}>
            <li>Use a flexible tape, snug but not compressing the skin.</li>
            <li>Measure in the morning, relaxed, after breathing out normally.</li>
            <li>Take each measurement twice and use the average.</li>
            <li>Track the trend over weeks rather than a single number.</li>
          </ul>
        </Panel>
        <Note tone="warn">
          <b>Not medical advice.</b> These are population formulas with typical errors of ±3–4 % body fat. BMI does not distinguish muscle from fat and is not
          designed for children, pregnancy or very muscular people. Talk to a health professional for an assessment.
        </Note>
      </div>

      <div>
        <Stats>
          <Stat label="BMI" value={num(b, 1)} sub={bmiBand?.label} tone="accent" />
          <Stat label="Body fat" value={`${num(bf, 1)}%`} sub={`${fatBand?.label} · ${navyBad ? 'BMI-based' : 'Navy method'}`} />
          <Stat label="Fat mass" value={wFmt(fatKg)} />
          <Stat label="Lean mass" value={wFmt(leanKg)} sub={`FFMI ${num(ffmi, 1)}`} />
        </Stats>
        <Panel title="BMI range">
          <RangeBar bands={BMI_BANDS} value={b} unit="" />
          <p className="muted" style={{ fontSize: 13, margin: '8px 0 0' }}>
            Healthy BMI range for your height: <b>{wFmt(18.5 * h2)} – {wFmt(24.9 * h2)}</b>
          </p>
        </Panel>
        <Panel title={`Body fat categories (${s.sex})`}>
          <RangeBar bands={fb} value={bf} unit="%" />
          <p className="muted" style={{ fontSize: 13, margin: '8px 0 0' }}>Categories from the American Council on Exercise.</p>
        </Panel>
        <Panel title="All estimates" actions={<CopyButton text={summary} label="Copy summary" />}>
          <Table
            head={['Metric', 'Value', 'Notes']}
            rows={[
              ['BMI', num(b, 1), bmiBand?.label ?? '—'],
              ['Body fat — US Navy', Number.isFinite(navy) ? `${num(navy, 1)}%` : 'n/a', 'Neck, waist' + (s.sex === 'female' ? ', hip' : '') + ', height'],
              ['Body fat — BMI (Deurenberg)', `${num(deur, 1)}%`, 'BMI, age, sex'],
              ['Waist-to-height ratio', num(whtr, 2), whtr < 0.5 ? 'Below 0.5: lower risk' : whtr < 0.6 ? '0.5–0.6: increased risk' : 'Above 0.6: high risk'],
              ['Waist-to-hip ratio', num(whr, 2), (s.sex === 'male' ? whr > 0.9 : whr > 0.85) ? 'Above WHO cut-off' : 'Within WHO cut-off'],
              ['Fat-free mass index', num(ffmi, 1), 'Lean kg / m²'],
              ['Ideal weight (Devine)', wFmt(devineIbw(s.sex, s.heightCm)), 'Clinical dosing formula'],
              ['Resting energy — Mifflin', `${num(mifflinBmr(s.sex, s.weightKg, s.heightCm, s.age), 0)} kcal/day`, 'Weight, height, age'],
              ['Resting energy — Katch', `${num(katchBmr(leanKg), 0)} kcal/day`, 'From lean mass'],
            ]}
          />
        </Panel>
      </div>
    </Split>
  )
}
