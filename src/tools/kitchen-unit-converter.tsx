import { useMemo } from 'react'
import { Area, Btn, CopyButton, Note, Num, Panel, Row, Seg, Select, Split, Stat, Stats, Table, Txt, useToolState } from '../kit'
import { convert, CUP_ML, density, fraction, fuzzy, INGREDIENTS, matchIngredient, nice, parseLine, unit, UNITS } from './lib/kitchen-unit-converter'

type Target = 'grams' | 'cups' | 'metric'
interface State {
  amount: number
  from: string
  to: string
  ing: string
  q: string
  custom: number
  recipe: string
  target: Target
  temp: number
  tempUnit: 'F' | 'C'
}

const SAMPLE = `2 1/4 cups all-purpose flour
1 tsp baking soda
1 tsp table salt
1 cup butter, softened
3/4 cup granulated sugar
3/4 cup brown sugar, packed
2 eggs
1 tsp vanilla
2 cups chocolate chips
1 cup walnuts, chopped`

const DEF: State = { amount: 1, from: 'cup', to: 'g', ing: 'All-purpose flour', q: '', custom: 1, recipe: SAMPLE, target: 'grams', temp: 350, tempUnit: 'F' }
const CUSTOM = 'Custom density'
const OPTS = UNITS.map((u) => [u.id, `${u.name} (${u.aliases[0]})`] as const)
const OVEN: [number, number, string, string][] = [[250, 120, '½', 'Very slow'], [275, 140, '1', 'Very slow'], [300, 150, '2', 'Slow'], [325, 165, '3', 'Moderately slow'], [350, 180, '4', 'Moderate'], [375, 190, '5', 'Moderately hot'], [400, 200, '6', 'Hot'], [425, 220, '7', 'Hot'], [450, 230, '8', 'Very hot'], [475, 245, '9', 'Very hot']]

export default function KitchenUnitConverter() {
  const [s, set, reset] = useToolState('kitchen-unit-converter', DEF)
  const ingRow = INGREDIENTS.find((i) => i[0] === s.ing)
  const gPerMl = s.ing === CUSTOM ? s.custom : ingRow ? density(ingRow[1]) : undefined
  const result = convert(s.amount, s.from, s.to, gPerMl)
  const fu = unit(s.from), tu = unit(s.to)
  const needsDensity = fu.kind !== tu.kind

  const matches = useMemo(
    () => INGREDIENTS.map((i) => [i, fuzzy(s.q, i[0] + ' ' + i[2])] as const).filter(([, sc]) => sc > 0).sort((a, b) => (s.q ? b[1] - a[1] : 0)).map(([i]) => i),
    [s.q],
  )

  const lines = useMemo(
    () =>
      s.recipe.split('\n').filter((l) => l.trim()).map((line) => {
        const p = parseLine(line)
        if (!p) return { line, out: '', note: 'no quantity' }
        const ing = matchIngredient(p.rest)
        if (!p.unit) return { line, out: '', note: 'count: kept as is', ing: ing?.[0] }
        const u = unit(p.unit)
        const g = ing ? density(ing[1]) : undefined
        let out = ''
        if (s.target === 'grams') {
          const v = u.kind === 'weight' ? convert(p.qty, p.unit, 'g') : convert(p.qty, p.unit, 'g', g)
          out = Number.isFinite(v) ? `${nice(v)} g ${p.rest}` : ''
        } else if (s.target === 'metric') {
          const v = u.kind === 'weight' ? convert(p.qty, p.unit, 'g') : convert(p.qty, p.unit, 'ml')
          out = `${nice(v)} ${u.kind === 'weight' ? 'g' : 'ml'} ${p.rest}`
        } else {
          const ml = u.kind === 'volume' ? convert(p.qty, p.unit, 'ml') : convert(p.qty, p.unit, 'ml', g)
          if (Number.isFinite(ml)) {
            const [uu, f] = ml >= 59 ? ['cup', 'cup'] : ml >= 14.7 ? ['tbsp', 'tbsp'] : ['tsp', 'tsp']
            out = `${fraction(convert(ml, 'ml', uu))} ${f} ${p.rest}`
          }
        }
        return { line, out, ing: ing?.[0], note: out ? '' : 'unknown ingredient' }
      }),
    [s.recipe, s.target],
  )

  const tempOther = s.tempUnit === 'F' ? ((s.temp - 32) * 5) / 9 : (s.temp * 9) / 5 + 32

  return (
    <Split>
      <div>
        <Panel title="Convert" actions={<Btn kind="ghost" onClick={reset}>Reset</Btn>}>
          <Num label="Amount" value={s.amount} min={0} onChange={(amount) => set({ amount })} />
          <Row>
            <Select label="From" value={s.from} onChange={(from) => set({ from })} options={OPTS} />
            <div style={{ marginBottom: 10 }}><Btn title="Swap units" onClick={() => set({ from: s.to, to: s.from })}>⇄</Btn></div>
            <Select label="To" value={s.to} onChange={(to) => set({ to })} options={OPTS} />
          </Row>
          <Txt label="Ingredient (fuzzy search)" value={s.q} placeholder="e.g. flr, brown sug, oats…" onChange={(q) => set({ q })} />
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, maxHeight: 176, overflowY: 'auto', marginBottom: 10, padding: 6, border: '1px solid var(--line)', borderRadius: 10, background: 'var(--panel)' }}>
            {[...matches.map((m) => m[0]), CUSTOM].map((n) => (
              <button key={n} type="button" className={`k-btn ${n === s.ing ? 'primary' : ''}`} style={{ padding: '4px 10px', fontSize: 12.5 }} onClick={() => set({ ing: n })}>
                {n}
              </button>
            ))}
          </div>
          {s.ing === CUSTOM ? (
            <Num label="Density" unit="g/mL" value={s.custom} min={0.01} onChange={(custom) => set({ custom })} hint="Water is 1.0; honey ≈ 1.42; flour ≈ 0.51" />
          ) : ingRow ? (
            <p className="muted" style={{ fontSize: 13, margin: 0 }}>
              <b>{ingRow[0]}</b>: {ingRow[1]} g per US cup · {nice(density(ingRow[1]))} g/mL · {nice(ingRow[1] / 16)} g per tbsp
            </p>
          ) : null}
        </Panel>

        <Panel title="Oven temperature">
          <Row>
            <Num label="Temperature" value={s.temp} onChange={(temp) => set({ temp })} unit={`°${s.tempUnit}`} />
            <Seg value={s.tempUnit} onChange={(tempUnit) => set({ tempUnit, temp: Math.round(tempUnit === s.tempUnit ? s.temp : tempOther) })} options={[['F', '°F'], ['C', '°C']]} />
          </Row>
          <p style={{ margin: '0 0 8px' }}>= <b style={{ fontSize: 20 }}>{Math.round(tempOther)}°{s.tempUnit === 'F' ? 'C' : 'F'}</b></p>
          <Table head={['°F', '°C', 'Gas mark', '']} rows={OVEN.map(([f, c, g, d]) => [f, c, g, <span key="d" className="muted">{d}</span>])} />
        </Panel>
      </div>

      <div>
        <Stats>
          <Stat
            label={`${nice(s.amount)} ${fu.name}${needsDensity ? ` of ${s.ing.toLowerCase()}` : ''}`}
            value={Number.isFinite(result) ? `${nice(result)} ${tu.aliases[0]}` : '—'}
            sub={['cup', 'tbsp', 'tsp', 'mcup'].includes(s.to) && Number.isFinite(result) ? `≈ ${fraction(result)} ${tu.name}` : tu.name}
            tone="accent"
          />
          <Stat label="In grams" value={`${nice(convert(s.amount, s.from, 'g', gPerMl))} g`} sub={gPerMl ? `density ${nice(gPerMl)} g/mL` : 'pick an ingredient'} />
          <Stat label="In millilitres" value={`${nice(convert(s.amount, s.from, 'ml', gPerMl))} ml`} sub={`${nice(convert(s.amount, s.from, 'ml', gPerMl) / CUP_ML)} US cups`} />
        </Stats>
        {needsDensity && !gPerMl && <Note tone="warn">Volume ⇄ weight needs an ingredient. Pick one from the list.</Note>}

        <Panel title={`${nice(s.amount)} ${fu.name} in every unit`}>
          <Table
            head={['Unit', 'Amount', 'Kitchen fraction']}
            rows={UNITS.map((u) => {
              const v = convert(s.amount, s.from, u.id, gPerMl)
              return [<span key="u" style={{ fontWeight: u.id === s.to ? 800 : 400 }}>{u.name}</span>, Number.isFinite(v) ? `${nice(v)} ${u.aliases[0]}` : '—', u.kind === 'volume' && ['cup', 'tbsp', 'tsp', 'mcup'].includes(u.id) ? fraction(v) : '']
            })}
          />
        </Panel>

        <Panel title="Recipe converter" actions={<CopyButton text={() => lines.map((l) => l.out || l.line).join('\n')} label="Copy result" />}>
          <Seg value={s.target} onChange={(target) => set({ target })} options={[['grams', 'Everything to grams'], ['metric', 'Metric (g / ml)'], ['cups', 'To cups & spoons']]} />
          <Area value={s.recipe} onChange={(recipe) => set({ recipe })} rows={7} placeholder="One ingredient per line, e.g. 1 1/2 cups flour" />
          <div style={{ height: 10 }} />
          <Table
            head={['Original', 'Converted', 'Matched as']}
            rows={lines.map((l) => [l.line, l.out ? <b key="o">{l.out}</b> : <span key="o" className="muted">{l.note}</span>, <span key="m" className="muted">{l.ing ?? '—'}</span>])}
          />
          <Note>Weights use typical densities for spooned-and-levelled ingredients; a packed cup of flour can weigh 20% more. For baking, weighing is always more accurate.</Note>
        </Panel>
      </div>
    </Split>
  )
}
