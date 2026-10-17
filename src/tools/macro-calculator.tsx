import { Bar, Btn, CopyButton, Donut, Note, num, Num, Panel, Row, Seg, Select, Slider, Split, Stat, Stats, Table, useToolState } from '../kit'
import { ACTIVITY, inToCm, katch, KCAL, lbToKg, mifflin, split, weeklyDelta, type Sex } from './lib/macro-calculator'

const PRESETS: [string, string, number, number][] = [
  ['balanced', 'Balanced 30/30/40', 30, 30],
  ['highp', 'High protein 40/30/30', 40, 30],
  ['med', 'Mediterranean 20/35/45', 20, 35],
  ['lowcarb', 'Low carb 35/45/20', 35, 45],
  ['keto', 'Keto 25/70/5', 25, 70],
  ['endurance', 'Endurance 20/25/55', 20, 25],
]
const GOALS: [string, string, number][] = [
  ['-0.75', 'Lose 0.75 kg/wk', -0.75],
  ['-0.5', 'Lose 0.5 kg/wk', -0.5],
  ['-0.25', 'Lose 0.25 kg/wk', -0.25],
  ['0', 'Maintain', 0],
  ['0.25', 'Gain 0.25 kg/wk', 0.25],
  ['0.5', 'Gain 0.5 kg/wk', 0.5],
]
const COL = { protein: '#ef4444', carbs: '#0ea5e9', fat: '#f59e0b' }

const DEF = {
  units: 'metric' as 'metric' | 'imperial',
  sex: 'female' as Sex,
  age: 32,
  kg: 68,
  cm: 168,
  lb: 150,
  ft: 5,
  inch: 6,
  bf: 0,
  activity: 1.55,
  goal: '-0.5',
  preset: 'balanced',
  pPct: 30,
  fPct: 30,
  meals: 3,
}

export default function MacroCalculator() {
  const [s, set, reset] = useToolState('macro-calculator', DEF)
  const kg = s.units === 'metric' ? s.kg : lbToKg(s.lb)
  const cm = s.units === 'metric' ? s.cm : inToCm(s.ft * 12 + s.inch)
  const valid = kg > 20 && kg < 400 && cm > 100 && cm < 250 && s.age >= 15 && s.age <= 100
  const bmrM = mifflin(s.sex, kg, cm, s.age)
  const useKatch = s.bf > 3 && s.bf < 60
  const bmr = useKatch ? katch(kg, s.bf) : bmrM
  const tdee = bmr * s.activity
  const goal = GOALS.find((g) => g[0] === s.goal) ?? GOALS[3]
  const floor = s.sex === 'male' ? 1500 : 1200
  const raw = tdee + weeklyDelta(goal[2])
  const target = Math.round(Math.max(raw, Math.min(floor, tdee)) / 10) * 10
  const m = split(target, s.pPct, s.fPct)
  const cPct = Math.max(0, 100 - s.pPct - s.fPct)
  const pPerKg = m.protein / kg
  const realDelta = ((target - tdee) * 7) / 7700
  const bmi = kg / (cm / 100) ** 2
  const wt = (x: number) => (s.units === 'metric' ? `${num(x, 2)} kg` : `${num(x / 0.45359237, 2)} lb`)

  const summary = () => `Daily target: ${target} kcal\nProtein ${Math.round(m.protein)} g · Carbs ${Math.round(m.carbs)} g · Fat ${Math.round(m.fat)} g\nPer meal (${s.meals}): P ${Math.round(m.protein / s.meals)} g · C ${Math.round(m.carbs / s.meals)} g · F ${Math.round(m.fat / s.meals)} g`

  return (
    <Split>
      <div>
        <Panel title="About you" actions={<Btn kind="ghost" onClick={reset}>Reset</Btn>}>
          <Row>
            <Seg value={s.units} onChange={(units) => set({ units })} options={[['metric', 'Metric'], ['imperial', 'Imperial']]} label="Units" />
            <Seg value={s.sex} onChange={(sex) => set({ sex })} options={[['female', 'Female'], ['male', 'Male']]} label="Sex" />
          </Row>
          <Row>
            <Num label="Age" value={s.age} onChange={(age) => set({ age })} unit="yr" min={15} max={100} />
            {s.units === 'metric' ? (
              <>
                <Num label="Weight" value={s.kg} onChange={(v) => set({ kg: v })} unit="kg" min={20} max={400} />
                <Num label="Height" value={s.cm} onChange={(v) => set({ cm: v })} unit="cm" min={100} max={250} />
              </>
            ) : (
              <>
                <Num label="Weight" value={s.lb} onChange={(lb) => set({ lb })} unit="lb" min={45} max={880} />
                <Num label="Height" value={s.ft} onChange={(ft) => set({ ft })} unit="ft" min={3} max={8} />
                <Num label="" value={s.inch} onChange={(inch) => set({ inch })} unit="in" min={0} max={11.9} />
              </>
            )}
          </Row>
          <Num label="Body fat (optional)" value={s.bf} onChange={(bf) => set({ bf })} unit="%" min={0} max={60} hint="If set, uses Katch-McArdle (lean-mass based) instead of Mifflin-St Jeor." />
          {!valid && <Note tone="err">Check age (15–100), weight and height: the formulas are not valid for these values.</Note>}
        </Panel>
        <Panel title="Activity & goal">
          <Select label="Activity level" value={s.activity} onChange={(activity) => set({ activity })} options={ACTIVITY.map(([f, n, d]) => [f, `${n} (×${f}) · ${d}`] as const)} />
          <Select label="Goal" value={s.goal} onChange={(g) => set({ goal: g })} options={GOALS.map(([k, l]) => [k, l] as const)} />
          {raw < floor && raw < tdee && <Note tone="warn">The full deficit would put you below {floor} kcal, so the target is held at {Math.round(Math.min(floor, tdee))} kcal. Expect slower progress ({wt(realDelta)}/week).</Note>}
        </Panel>
        <Panel title="Macro split">
          <Select label="Preset (protein / fat / carbs %)" value={s.preset} onChange={(preset) => { const p = PRESETS.find((x) => x[0] === preset); set(p ? { preset, pPct: p[2], fPct: p[3] } : { preset }) }} options={[...PRESETS.map(([k, l]) => [k, l] as const), ['custom', 'Custom'] as const]} />
          <Slider label="Protein" value={s.pPct} onChange={(pPct) => set({ pPct, fPct: Math.min(s.fPct, 100 - pPct), preset: 'custom' })} min={10} max={50} unit="%" />
          <Slider label="Fat" value={s.fPct} onChange={(fPct) => set({ fPct, pPct: Math.min(s.pPct, 100 - fPct), preset: 'custom' })} min={10} max={75} unit="%" />
          <p className="muted">Carbs take the rest: <b>{cPct}%</b></p>
          {pPerKg < 1.2 && goal[2] < 0 && <Note tone="warn">Protein is {num(pPerKg, 1)} g/kg. While dieting, 1.6–2.2 g/kg helps keep muscle.</Note>}
          {pPerKg > 3 && <Note tone="warn">Protein is {num(pPerKg, 1)} g/kg, more than most people need (≈1.6–2.2 g/kg for active people).</Note>}
          {s.fPct < 20 && <Note tone="warn">Below 20% fat makes it hard to get essential fatty acids and fat-soluble vitamins.</Note>}
        </Panel>
      </div>
      <div>
        <Stats>
          <Stat label="BMR" value={`${Math.round(bmr)} kcal`} sub={useKatch ? 'Katch-McArdle' : 'Mifflin-St Jeor'} />
          <Stat label="Maintenance (TDEE)" value={`${Math.round(tdee)} kcal`} sub={`BMR × ${s.activity}`} />
          <Stat label="Daily target" value={`${target} kcal`} tone="accent" sub={`${target - Math.round(tdee) >= 0 ? '+' : ''}${target - Math.round(tdee)} kcal/day`} />
          <Stat label="Expected change" value={`${realDelta > 0 ? '+' : ''}${wt(realDelta)}`} sub="per week (7700 kcal ≈ 1 kg)" />
        </Stats>
        <Panel title="Daily macros" actions={<CopyButton text={summary} label="Copy summary" />}>
          <Row>
            <Donut
              slices={[
                { label: 'Protein', value: m.protein * KCAL.protein, color: COL.protein },
                { label: 'Carbs', value: m.carbs * KCAL.carbs, color: COL.carbs },
                { label: 'Fat', value: m.fat * KCAL.fat, color: COL.fat },
              ]}
              fv={(v) => `${Math.round(v)} kcal`}
              center={<span><b>{target}</b><br /><small className="muted">kcal</small></span>}
            />
            <div style={{ flex: 1, minWidth: 220 }}>
              {([['Protein', m.protein, COL.protein, `${num(pPerKg, 1)} g per kg`], ['Carbs', m.carbs, COL.carbs, `${cPct}% of energy`], ['Fat', m.fat, COL.fat, `${s.fPct}% of energy`]] as const).map(([n, g, c, sub]) => (
                <div key={n} style={{ marginBottom: 14 }}>
                  <Row wrap={false}>
                    <b style={{ flex: 1, color: c }}>{n}</b>
                    <b style={{ fontSize: 22 }}>{Math.round(g)} g</b>
                  </Row>
                  <Bar value={g} max={Math.max(m.protein, m.carbs, m.fat)} color={c} />
                  <small className="muted">{sub}</small>
                </div>
              ))}
            </div>
          </Row>
        </Panel>
        <Panel title="Per meal" actions={<Seg value={String(s.meals)} onChange={(v) => set({ meals: Number(v) })} options={[['2', '2'], ['3', '3'], ['4', '4'], ['5', '5'], ['6', '6 meals']]} label="Meals" />}>
          <Table
            head={['', 'kcal', 'Protein', 'Carbs', 'Fat']}
            rows={[
              ['Each meal', Math.round(target / s.meals), `${Math.round(m.protein / s.meals)} g`, `${Math.round(m.carbs / s.meals)} g`, `${Math.round(m.fat / s.meals)} g`],
              ['Per day', target, `${Math.round(m.protein)} g`, `${Math.round(m.carbs)} g`, `${Math.round(m.fat)} g`],
              ['Per week', target * 7, `${Math.round(m.protein * 7)} g`, `${Math.round(m.carbs * 7)} g`, `${Math.round(m.fat * 7)} g`],
            ]}
          />
        </Panel>
        <Panel title="All goals at a glance">
          <Table
            head={['Goal', 'kcal/day', 'Protein', 'Carbs', 'Fat']}
            rows={GOALS.map(([k, l, d]) => {
              const t = Math.round(Math.max(tdee + weeklyDelta(d), Math.min(floor, tdee)) / 10) * 10
              const x = split(t, s.pPct, s.fPct)
              return [k === s.goal ? <b key="g">▶ {l}</b> : l, t, `${Math.round(x.protein)} g`, `${Math.round(x.carbs)} g`, `${Math.round(x.fat)} g`]
            })}
          />
          <p className="muted" style={{ fontSize: 13 }}>BMI {num(bmi, 1)}. Estimates are a starting point: track your weight for 2–3 weeks and adjust by ~100–200 kcal if the trend differs from the plan. Not medical advice.</p>
        </Panel>
      </div>
    </Split>
  )
}
