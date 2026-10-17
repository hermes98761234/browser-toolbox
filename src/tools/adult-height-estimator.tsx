import { Btn, Check, LineChart, Note, Num, Panel, Row, Seg, Split, Stat, Stats, Table, num, useToolState } from '../kit'
import { cmToFtIn, fromCurrent, ftInToCm, midParental, PCT, pctAt, TARGET_RANGE, type Sex } from './lib/adult-height-estimator'

interface State { unit: 'cm' | 'ft'; sex: Sex; father: number; mother: number; useChild: boolean; age: number; child: number }
const DEF: State = { unit: 'cm', sex: 'girl', father: 181, mother: 166, useChild: true, age: 8, child: 129 }

function HeightInput({ label, cm, unit, onChange }: { label: string; cm: number; unit: State['unit']; onChange: (cm: number) => void }) {
  if (unit === 'cm') return <Num label={label} value={+cm.toFixed(1)} onChange={onChange} unit="cm" min={30} max={250} />
  const [ft, inch] = cmToFtIn(cm)
  return (
    <Row wrap={false}>
      <Num key={`${label}f`} label={`${label} (ft)`} value={ft} onChange={(v) => onChange(ftInToCm(v, inch))} unit="ft" min={1} max={8} step={1} />
      <Num key={`${label}i`} label="in" value={inch} onChange={(v) => onChange(ftInToCm(ft, v))} unit="in" min={0} max={11.9} />
    </Row>
  )
}

export default function AdultHeightEstimator() {
  const [s, set, reset] = useToolState('adult-height-estimator', DEF)
  const H = (cm: number) => {
    if (!Number.isFinite(cm)) return '—'
    if (s.unit === 'cm') return `${num(cm, 1)} cm`
    const [f, i] = cmToFtIn(cm)
    return `${f}′ ${num(i, 1)}″`
  }
  const mph = midParental(s.father, s.mother, s.sex)
  const lo = mph - TARGET_RANGE, hi = mph + TARGET_RANGE
  const childOk = s.useChild && s.age >= 2 && s.age < 18 && s.child > 40
  const cur = childOk ? fromCurrent(s.child, s.age, s.sex) : NaN
  const combined = childOk ? (mph + cur) / 2 : mph
  const outside = childOk && (cur < lo || cur > hi)

  const ages = PCT[s.sex].map(([a]) => a).filter((a) => a <= 20)
  const curve = (adult: number) => ages.map((a) => [a, (adult * pctAt(a, s.sex)) / 100] as [number, number])
  const conv = (pts: [number, number][]) => (s.unit === 'cm' ? pts : pts.map(([a, v]) => [a, v / 2.54] as [number, number]))
  const series = [
    { name: 'Upper target', points: conv(curve(hi)), dashed: true, color: '#94a3b8' },
    { name: 'Mid-parental curve', points: conv(curve(mph)), color: 'var(--accent)' },
    { name: 'Lower target', points: conv(curve(lo)), dashed: true, color: '#94a3b8' },
    ...(childOk ? [{ name: 'Child’s own track', points: conv(curve(cur)), color: '#f59e0b' }] : []),
  ]

  return (
    <Split>
      <div>
        <Panel title="Parents" actions={<><Seg value={s.unit} onChange={(unit) => set({ unit })} options={[['cm', 'cm'], ['ft', 'ft / in']]} /><Btn kind="ghost" onClick={reset}>Reset</Btn></>}>
          <Seg value={s.sex} onChange={(sex) => set({ sex })} options={[['girl', '👧 Girl'], ['boy', '👦 Boy']]} />
          <HeightInput label="Father’s height" cm={s.father} unit={s.unit} onChange={(father) => set({ father })} />
          <HeightInput label="Mother’s height" cm={s.mother} unit={s.unit} onChange={(mother) => set({ mother })} />
        </Panel>
        <Panel title="Child’s current height (optional)">
          <Check label="Also use the child’s current height and age" value={s.useChild} onChange={(useChild) => set({ useChild })} />
          {s.useChild && (
            <>
              <Num label="Age" value={s.age} onChange={(age) => set({ age })} unit="years" min={2} max={17.9} step={0.5} hint="Between 2 and 18. Decimals allowed (8.5 = 8 years 6 months)." />
              <HeightInput label="Current height" cm={s.child} unit={s.unit} onChange={(child) => set({ child })} />
              {!childOk && <Note tone="warn">Enter an age between 2 and 18 to use this method.</Note>}
            </>
          )}
        </Panel>
        <Panel title="How it works">
          <Table
            head={['Method', 'Formula']}
            rows={[
              ['Mid-parental (Tanner)', s.sex === 'boy' ? '(father + mother + 13 cm) ÷ 2' : '(father + mother − 13 cm) ÷ 2'],
              ['Target range', `± ${TARGET_RANGE} cm (≈ 95% of children)`],
              ['Percent of adult height', `current height ÷ ${num(pctAt(s.age, s.sex), 1)}% (average reached at ${num(s.age, 1)} y)`],
            ]}
          />
          <p className="muted" style={{ fontSize: 13 }}>The ±6.5 cm adjustment reflects the average 13 cm height difference between adult men and women.</p>
        </Panel>
      </div>
      <div>
        <Stats>
          <Stat label="Mid-parental target" value={H(mph)} tone="accent" sub={`range ${H(lo)} – ${H(hi)}`} />
          {childOk && <Stat label="From current height" value={H(cur)} sub={`${num(pctAt(s.age, s.sex), 1)}% of adult height now`} />}
          {childOk && <Stat label="Blended estimate" value={H(combined)} sub="average of both methods" />}
        </Stats>
        <Note tone="warn">
          <b>Informational only.</b> Both methods are population averages: actual adult height can fall outside the range, and the timing of puberty shifts the percent-of-height estimate a lot. They do not diagnose anything. If you are worried about growth, see a paediatrician, who can plot measurements on growth charts and, if needed, assess bone age.
        </Note>
        {outside && <Note>The child is currently tracking {cur > hi ? 'above' : 'below'} the parental target range. That is common (early/late puberty, nutrition, measurement error) but a persistent gap is worth mentioning at a check-up.</Note>}
        <Panel title="Projected growth curve">
          <LineChart series={series} xLabel="Age (years)" yLabel={s.unit === 'cm' ? 'cm' : 'inches'} fx={(v) => num(v, 0)} fy={(v) => num(v, 0)} markers={childOk ? [{ x: s.age, label: `now ${H(s.child)}` }] : []} />
          <p className="muted" style={{ fontSize: 13 }}>Curves scale the adult height by the average share of adult height reached at each age. Real children rarely follow a smooth curve — growth spurts come at different ages.</p>
        </Panel>
        <Panel title="Milestones on the mid-parental curve">
          <Table head={['Age', 'Expected height', '% of adult']} rows={[2, 4, 6, 8, 10, 12, 14, 16].map((a) => [`${a} y`, H((mph * pctAt(a, s.sex)) / 100), `${num(pctAt(a, s.sex), 1)}%`])} />
          <p className="muted" style={{ fontSize: 13 }}>Rule of thumb: around age 2 a {s.sex} has reached about {num(pctAt(2, s.sex), 0)}% of adult height — hence the old “double the height at 2” saying.</p>
        </Panel>
      </div>
    </Split>
  )
}
