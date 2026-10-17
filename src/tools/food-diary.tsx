import { useMemo, useState } from 'react'
import { Bar, BarChart, Btn, CsvButton, Donut, JsonButtons, Note, Num, Panel, Row, Seg, Split, Stat, Stats, Table, Txt, num, uid, useToolState } from '../kit'
import { energySplit, FOODS, type Food, type Nutrients, NUTRIENTS, scale, searchFoods, sum } from './lib/food-diary'

type Meal = 'Breakfast' | 'Lunch' | 'Dinner' | 'Snacks'
const MEALS: Meal[] = ['Breakfast', 'Lunch', 'Dinner', 'Snacks']
interface Entry extends Nutrients { id: string; date: string; meal: Meal; name: string; grams: number }

const day = (offset = 0, from?: string) => {
  const d = from ? new Date(from + 'T12:00') : new Date()
  d.setDate(d.getDate() + offset)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
const food = (n: string) => FOODS.find((f) => f.name === n)!
const entry = (date: string, meal: Meal, name: string, grams: number): Entry => ({ id: uid(), date, meal, name, grams, ...scale(food(name), grams) })

function sampleLog(): Entry[] {
  const plan: [Meal, string, number][][] = [
    [['Breakfast', 'Oats, dry', 50], ['Breakfast', 'Banana', 118], ['Breakfast', 'Milk, skim', 200], ['Lunch', 'Chicken breast, grilled', 140], ['Lunch', 'Brown rice, cooked', 180], ['Lunch', 'Broccoli, cooked', 120], ['Snacks', 'Almonds', 28], ['Dinner', 'Salmon, baked', 150], ['Dinner', 'Potato, baked', 173], ['Dinner', 'Caesar salad', 150]],
    [['Breakfast', 'Greek yogurt, plain', 170], ['Breakfast', 'Blueberries', 100], ['Breakfast', 'Granola', 40], ['Lunch', 'Burrito, bean', 220], ['Snacks', 'Apple', 182], ['Dinner', 'Spaghetti bolognese', 350], ['Dinner', 'Red wine', 150]],
    [['Breakfast', 'Egg, fried', 92], ['Breakfast', 'Whole wheat bread', 64], ['Breakfast', 'Latte', 360], ['Lunch', 'Sushi, salmon roll', 180], ['Snacks', 'Protein bar', 60], ['Dinner', 'Pizza, cheese', 214], ['Dinner', 'Cola', 330]],
  ]
  const out: Entry[] = []
  for (let i = 6; i >= 0; i--) for (const [m, n, g] of plan[i % 3]) out.push(entry(day(-i), m, n, i === 0 && m === 'Dinner' ? 0 : g))
  return out.filter((e) => e.grams > 0)
}

const DEF = {
  goals: { kcal: 2200, protein: 120, carbs: 250, fat: 75, fiber: 30 } as Nutrients,
  entries: sampleLog(),
  custom: [] as Food[],
}
const LABEL: Record<keyof Nutrients, string> = { kcal: 'Energy', protein: 'Protein', carbs: 'Carbs', fat: 'Fat', fiber: 'Fiber' }
const UNIT: Record<keyof Nutrients, string> = { kcal: 'kcal', protein: 'g', carbs: 'g', fat: 'g', fiber: 'g' }
const COL = { protein: '#10b981', carbs: '#0ea5e9', fat: '#f59e0b' }

export default function FoodDiary() {
  const [s, set, reset] = useToolState('food-diary', DEF)
  const [date, setDate] = useState(day())
  const [q, setQ] = useState('')
  const [pick, setPick] = useState<Food | null>(food('Salmon, baked'))
  const [grams, setGrams] = useState(150)
  const [meal, setMeal] = useState<Meal>('Dinner')
  const [cf, setCf] = useState({ name: '', kcal: 0, protein: 0, carbs: 0, fat: 0, fiber: 0, serving: 100 })
  const all = useMemo(() => [...s.custom, ...FOODS], [s.custom])
  const hits = q.trim() ? searchFoods(q, all, 8) : []
  const todays = s.entries.filter((e) => e.date === date)
  const tot = sum(todays)
  const split = energySplit(tot)
  const week = Array.from({ length: 7 }, (_, i) => day(i - 6, date))
  const weekTot = week.map((d) => ({ d, n: sum(s.entries.filter((e) => e.date === d)) }))
  const logged = weekTot.filter((w) => w.n.kcal > 0)
  const avg = logged.length ? logged.reduce((a, w) => a + w.n.kcal, 0) / logged.length : 0

  const add = () => {
    if (!pick || !(grams > 0)) return
    set({ entries: [...s.entries, { id: uid(), date, meal, name: pick.name, grams, ...scale(pick, grams) }] })
  }
  const choose = (f: Food) => {
    setPick(f)
    setGrams(f.serving)
    setQ('')
  }
  const preview = pick ? scale(pick, grams || 0) : null

  return (
    <Split>
      <div>
        <Panel title="Day">
          <Row wrap={false}>
            <Btn onClick={() => setDate(day(-1, date))}>‹</Btn>
            <input type="date" className="k-text" value={date} onChange={(e) => e.target.value && setDate(e.target.value)} style={{ flex: 1 }} />
            <Btn onClick={() => setDate(day(1, date))}>›</Btn>
            <Btn kind="ghost" onClick={() => setDate(day())}>Today</Btn>
          </Row>
        </Panel>
        <Panel title="Add food">
          <Txt label="Search foods" value={q} onChange={setQ} placeholder="e.g. chicken, oats, greek yog…" hint={`${all.length} foods, typo-tolerant search`} />
          {hits.length > 0 && (
            <div style={{ display: 'grid', gap: 4, marginBottom: 10 }}>
              {hits.map((f) => (
                <button key={f.name} type="button" className="k-btn ghost" style={{ justifyContent: 'space-between', display: 'flex', textAlign: 'left' }} onClick={() => choose(f)}>
                  <span>{f.name}</span>
                  <span className="muted">{f.kcal} kcal/100 g</span>
                </button>
              ))}
            </div>
          )}
          {q.trim() && !hits.length && <Note tone="warn">No match. Add it as a custom food below.</Note>}
          {pick && preview && (
            <>
              <p style={{ margin: '6px 0' }}>
                <b>{pick.name}</b> <span className="muted">· serving {pick.unit} = {pick.serving} g</span>
              </p>
              <Row>
                <Num label="Amount" value={grams} onChange={setGrams} unit="g" min={1} />
              </Row>
              <Row>
                {[0.5, 1, 1.5, 2].map((k) => (
                  <Btn key={k} kind="ghost" onClick={() => setGrams(Math.round(pick.serving * k))}>{k}× serving</Btn>
                ))}
              </Row>
              <div style={{ margin: '8px 0' }}>
                <Seg value={meal} onChange={setMeal} options={MEALS.map((m) => [m, m] as const)} />
              </div>
              <p className="muted" style={{ margin: '6px 0' }}>
                {num(preview.kcal, 0)} kcal · P {num(preview.protein, 1)} g · C {num(preview.carbs, 1)} g · F {num(preview.fat, 1)} g · fiber {num(preview.fiber, 1)} g
              </p>
              <Btn kind="primary" onClick={add} disabled={!(grams > 0)}>+ Add to {meal}</Btn>
            </>
          )}
        </Panel>
        <Panel title="Custom food (per 100 g)">
          <Txt label="Name" value={cf.name} onChange={(name) => setCf({ ...cf, name })} placeholder="Grandma's lasagna" />
          <Row>
            {NUTRIENTS.map((k) => (
              <Num key={k} label={LABEL[k]} value={cf[k]} unit={UNIT[k]} min={0} onChange={(v) => setCf({ ...cf, [k]: v })} />
            ))}
            <Num label="Serving" value={cf.serving} unit="g" min={1} onChange={(serving) => setCf({ ...cf, serving })} />
          </Row>
          <Btn
            disabled={!cf.name.trim() || all.some((f) => f.name === cf.name.trim())}
            onClick={() => {
              const f: Food = { ...cf, name: cf.name.trim(), unit: '1 serving' }
              set({ custom: [f, ...s.custom] })
              choose(f)
              setCf({ ...cf, name: '' })
            }}
          >
            Save custom food
          </Btn>
        </Panel>
        <Panel title="Daily goals">
          <Row>
            {NUTRIENTS.map((k) => (
              <Num key={k} label={LABEL[k]} value={s.goals[k]} unit={UNIT[k]} min={0} onChange={(v) => set({ goals: { ...s.goals, [k]: v } })} />
            ))}
          </Row>
        </Panel>
      </div>
      <div>
        <Stats>
          <Stat label="Energy" value={`${num(tot.kcal, 0)} kcal`} sub={tot.kcal <= s.goals.kcal ? `${num(s.goals.kcal - tot.kcal, 0)} kcal left` : `${num(tot.kcal - s.goals.kcal, 0)} kcal over`} tone={tot.kcal > s.goals.kcal * 1.05 ? 'bad' : 'accent'} />
          <Stat label="Protein" value={`${num(tot.protein, 0)} g`} sub={`${num((split.protein || 0) * 100, 0)}% of energy`} />
          <Stat label="7-day average" value={`${num(avg, 0)} kcal`} sub={`${logged.length} days logged`} />
        </Stats>
        <Panel title="Goal progress">
          {NUTRIENTS.map((k) => {
            const r = s.goals[k] ? tot[k] / s.goals[k] : 0
            return (
              <div key={k} style={{ marginBottom: 8 }}>
                <Row wrap={false}>
                  <b style={{ flex: 1 }}>{LABEL[k]}</b>
                  <span>{num(tot[k], k === 'kcal' ? 0 : 1)} / {num(s.goals[k], 0)} {UNIT[k]}</span>
                </Row>
                <Bar value={r} max={1} color={r > 1.05 && k !== 'fiber' && k !== 'protein' ? 'var(--err)' : r >= 0.9 ? 'var(--ok)' : 'var(--accent)'} />
              </div>
            )
          })}
        </Panel>
        <Panel
          title={`Log for ${new Date(date + 'T12:00').toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' })}`}
          actions={
            <>
              <CsvButton name="food-diary.csv" rows={() => [['Date', 'Meal', 'Food', 'Grams', ...NUTRIENTS], ...s.entries.map((e) => [e.date, e.meal, e.name, e.grams, ...NUTRIENTS.map((k) => +e[k].toFixed(1))])]} />
              <JsonButtons name="food-diary.json" data={s} onLoad={(d) => d && Array.isArray(d.entries) && set(d)} />
              <Btn kind="ghost" onClick={reset}>Reset</Btn>
            </>
          }
        >
          {todays.length === 0 && <p className="muted">Nothing logged for this day yet.</p>}
          {MEALS.map((m) => {
            const rows = todays.filter((e) => e.meal === m)
            if (!rows.length) return null
            const mt = sum(rows)
            return (
              <div key={m} style={{ marginBottom: 12 }}>
                <h4 style={{ margin: '6px 0' }}>{m} <span className="muted" style={{ fontWeight: 400 }}>· {num(mt.kcal, 0)} kcal</span></h4>
                <Table
                  head={['Food', 'Amount', 'kcal', 'P', 'C', 'F', '']}
                  rows={rows.map((e) => [
                    e.name,
                    `${num(e.grams, 0)} g`,
                    num(e.kcal, 0),
                    num(e.protein, 1),
                    num(e.carbs, 1),
                    num(e.fat, 1),
                    <Btn key="x" kind="ghost" onClick={() => set({ entries: s.entries.filter((x) => x.id !== e.id) })} title="Remove">✕</Btn>,
                  ])}
                />
              </div>
            )
          })}
        </Panel>
        <Panel title="Energy from macros">
          <Donut
            slices={[
              { label: 'Protein', value: tot.protein * 4, color: COL.protein },
              { label: 'Carbs', value: tot.carbs * 4, color: COL.carbs },
              { label: 'Fat', value: tot.fat * 9, color: COL.fat },
            ]}
            fv={(v) => `${num(v, 0)} kcal`}
            center={<span>{num(tot.kcal, 0)}<br /><small className="muted">kcal</small></span>}
          />
        </Panel>
        <Panel title="Last 7 days (kcal by macro)">
          <BarChart
            bars={weekTot.map((w) => ({ label: new Date(w.d + 'T12:00').toLocaleDateString('en-US', { weekday: 'short' }), value: [w.n.protein * 4, w.n.carbs * 4, w.n.fat * 9] }))}
            stacks={[{ name: 'Protein', color: COL.protein }, { name: 'Carbs', color: COL.carbs }, { name: 'Fat', color: COL.fat }]}
            fy={(v) => num(v, 0)}
          />
          <Note>Values per 100 g are approximations from USDA FoodData Central. Bar heights use 4/4/9 kcal per gram, so they can differ slightly from label energy.</Note>
        </Panel>
      </div>
    </Split>
  )
}
