import { BarChart, Btn, Donut, Note, Num, Panel, Row, Seg, Select, Slider, Split, Stat, Stats, Table, Txt, num, useToolState } from '../kit'
import { idealFromBcs, plan, rer, STAGES, weeksToTarget } from './lib/dog-food-calculator'

const DEF = {
  name: 'Buddy', weight: 28, unit: 'kg' as 'kg' | 'lb', bcs: 6, stage: 'neutered', factorAdj: 0,
  kcalPerKg: 3650, kcalPerCup: 385, wetPct: 0, kcalPerCan: 390, treatPct: 10, meals: 2,
}
const FOODS: [string, number, number][] = [
  ['Standard adult kibble', 3650, 385], ['Puppy kibble', 4000, 420], ['Light / weight control', 3200, 310],
  ['Senior kibble', 3400, 340], ['High-performance', 4400, 480],
]
const BCS = ['', 'Emaciated', 'Very thin', 'Thin', 'Ideal (lean)', 'Ideal', 'Slightly overweight', 'Overweight', 'Obese', 'Severely obese']
const LB = 2.20462
const SHORT: Record<string, string> = { neutered: 'Neutered', intact: 'Intact', inactive: 'Inactive', senior: 'Senior', loss: 'Lose wt', gain: 'Gain wt', light: 'Active', moderate: 'Mod. work', heavy: 'Heavy', puppy4: 'Pup <4m', puppy: 'Pup 4m+' }

export default function DogFoodCalculator() {
  const [s, set, reset] = useToolState('dog-food-calculator', DEF)
  const kg = s.unit === 'lb' ? s.weight / LB : s.weight
  const w = (k: number) => (s.unit === 'lb' ? `${num(k * LB, 1)} lb` : `${num(k, 1)} kg`)
  const stage = STAGES.find((x) => x.id === s.stage) ?? STAGES[0]
  const ideal = idealFromBcs(kg, s.bcs)
  const basisKg = stage.useIdeal ? ideal : kg
  const R = rer(basisKg)
  const factor = Math.max(0.5, stage.factor + s.factorAdj)
  const mer = R * factor
  const p = plan(mer, s)
  const gPerCup = s.kcalPerKg > 0 ? (s.kcalPerCup / s.kcalPerKg) * 1000 : 0
  const valid = kg > 0.5 && kg < 120
  const meal = ['Breakfast', 'Lunch', 'Afternoon', 'Dinner', 'Late']
  const mealNames = s.meals === 1 ? ['Daily'] : s.meals === 2 ? ['Morning', 'Evening'] : s.meals === 3 ? ['Morning', 'Midday', 'Evening'] : meal.slice(0, s.meals)
  const fmtCups = (c: number) => {
    const q = Math.round(c * 8) / 8
    const whole = Math.floor(q)
    const frac = ['', '⅛', '¼', '⅜', '½', '⅝', '¾', '⅞'][Math.round((q - whole) * 8)]
    return `${whole || !frac ? whole : ''}${frac} cup${q > 1 ? 's' : ''}`
  }

  return (
    <div>
      <Stats>
        <Stat label="Daily energy (MER)" value={valid ? `${Math.round(mer)} kcal` : '—'} sub={`RER ${Math.round(R)} × ${factor.toFixed(1)}`} tone="accent" />
        <Stat label="Dry food per day" value={valid ? `${Math.round(p.dryGrams)} g` : '—'} sub={valid ? `≈ ${fmtCups(p.dryCups)}` : ''} />
        <Stat label="Per meal" value={valid ? `${Math.round(p.perMeal.grams)} g` : '—'} sub={`${s.meals} meal${s.meals > 1 ? 's' : ''} · ${fmtCups(p.perMeal.cups)}`} />
        <Stat label="Treat budget" value={`${Math.round(p.treats)} kcal`} sub={`${s.treatPct}% of the day`} />
      </Stats>
      <Split>
        <div>
          <Panel title="Your dog" actions={<Btn kind="ghost" onClick={reset}>Reset</Btn>}>
            <Txt label="Name" value={s.name} onChange={(name) => set({ name })} />
            <Row>
              <Num label="Current weight" value={s.weight} min={0.5} unit={s.unit} onChange={(weight) => set({ weight })} />
              <Seg value={s.unit} onChange={(unit) => set({ unit, weight: Math.round((unit === 'lb' ? s.weight * LB : s.weight / LB) * 10) / 10 })} options={[['kg', 'kg'], ['lb', 'lb']]} />
            </Row>
            {!valid && <Note tone="err">Enter a weight between 0.5 and 120 kg.</Note>}
            <Select label="Life stage / activity" value={s.stage} onChange={(stage) => set({ stage })} options={STAGES.map((x) => [x.id, `${x.label} (×${x.factor})`] as const)} />
            <p className="muted" style={{ margin: '0 0 8px' }}>{stage.note}</p>
            <Slider label="Fine-tune factor" min={-0.4} max={0.4} step={0.1} value={s.factorAdj} onChange={(factorAdj) => set({ factorAdj })} show={(v) => (v > 0 ? '+' : '') + v.toFixed(1)} />
            <Slider label="Body condition score" min={1} max={9} value={s.bcs} onChange={(bcs) => set({ bcs })} show={(v) => `${v}/9 · ${BCS[v]}`} />
          </Panel>
          <Panel title="Food">
            <Row>{FOODS.map(([n, a, b]) => <Btn key={n} kind={s.kcalPerKg === a && s.kcalPerCup === b ? 'primary' : 'normal'} onClick={() => set({ kcalPerKg: a, kcalPerCup: b })}>{n}</Btn>)}</Row>
            <Row>
              <Num label="Dry food energy" unit="kcal/kg" min={1} value={s.kcalPerKg} onChange={(kcalPerKg) => set({ kcalPerKg })} hint="On the bag as kcal ME/kg" />
              <Num label="Per cup" unit="kcal/cup" min={1} value={s.kcalPerCup} onChange={(kcalPerCup) => set({ kcalPerCup })} hint={`≈ ${Math.round(gPerCup)} g per 8 oz cup`} />
            </Row>
            <Slider label="Wet food share" min={0} max={100} step={5} value={s.wetPct} onChange={(wetPct) => set({ wetPct })} unit="%" />
            {s.wetPct > 0 && <Num label="Wet food energy" unit="kcal/can" min={1} value={s.kcalPerCan} onChange={(kcalPerCan) => set({ kcalPerCan })} />}
            <Row>
              <Slider label="Treats" min={0} max={20} value={s.treatPct} onChange={(treatPct) => set({ treatPct })} unit="%" />
              <Slider label="Meals per day" min={1} max={5} value={s.meals} onChange={(meals) => set({ meals })} />
            </Row>
          </Panel>
        </div>
        <div>
          <Panel title={`${s.name || 'Your dog'}’s daily menu`}>
            <Table head={['Meal', 'Dry food', 'Cups', ...(s.wetPct > 0 ? ['Wet food'] : []), 'kcal']}
              rows={mealNames.map((n) => [n, `${Math.round(p.perMeal.grams)} g`, fmtCups(p.perMeal.cups), ...(s.wetPct > 0 ? [`${num(p.perMeal.wet, 2)} can`] : []), Math.round(p.food / s.meals)])}
              foot={['Total', `${Math.round(p.dryGrams)} g`, fmtCups(p.dryCups), ...(s.wetPct > 0 ? [`${num(p.wetUnits, 2)} cans`] : []), Math.round(p.food)]} />
            <Donut size={180} fv={(v) => `${Math.round(v)} kcal`} center={<span>{Math.round(mer)}<br /><small className="muted">kcal</small></span>}
              slices={[{ label: 'Dry food', value: p.dryKcal, color: '#f59e0b' }, { label: 'Wet food', value: p.wetKcal, color: '#0ea5e9' }, { label: 'Treats', value: p.treats, color: '#ec4899' }].filter((x) => x.value > 0)} />
          </Panel>
          {s.bcs !== 5 && s.bcs !== 4 && valid && (
            <Panel title={s.bcs > 5 ? 'Weight-loss plan' : 'Weight-gain plan'}>
              <Table head={['', '']} rows={[
                ['Estimated ideal weight', w(ideal)],
                ['Difference', w(Math.abs(kg - ideal))],
                [s.bcs > 5 ? 'Calories for loss (1.0 × RER at ideal)' : 'Calories for gain (1.4 × RER at ideal)', `${Math.round(rer(ideal) * (s.bcs > 5 ? 1 : 1.4))} kcal/day`],
                ...(s.bcs > 5 ? [['Time at 1 % body weight per week', `≈ ${weeksToTarget(kg, ideal, 1)} weeks`], ['Time at 2 % per week (max safe)', `≈ ${weeksToTarget(kg, ideal, 2)} weeks`]] : []),
              ]} />
              {s.bcs > 5 && s.stage !== 'loss' && <Btn kind="primary" onClick={() => set({ stage: 'loss', factorAdj: 0 })}>Use weight-loss feeding</Btn>}
              <p className="muted">Ideal weight assumes each body-condition point above 5 adds ≈ 10 % body weight. Weigh every 2 weeks and adjust portions by 5–10 %.</p>
            </Panel>
          )}
          <Panel title="Calories by life stage">
            <BarChart height={220} fy={(v) => num(v, 0)} bars={STAGES.filter((x) => !x.id.startsWith('preg') && x.id !== 'lact').map((x) => ({
              label: SHORT[x.id] ?? x.label,
              value: Math.round(rer(x.useIdeal ? ideal : kg) * x.factor), color: x.id === s.stage ? '#6366f1' : '#94a3b8',
            }))} />
          </Panel>
          <Note>
            RER = 70 × (body weight in kg)^0.75; MER = RER × life-stage factor. These are starting points: individual dogs vary by ±20 %. Check with your vet, especially for puppies, pregnancy and weight loss.
          </Note>
        </div>
      </Split>
    </div>
  )
}
