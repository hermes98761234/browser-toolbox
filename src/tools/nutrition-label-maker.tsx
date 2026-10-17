import { useRef, type ReactNode } from 'react'
import { Btn, CopyButton, CsvButton, download, JsonButtons, Note, Num, Panel, Row, Split, Stat, Stats, Table, Txt, uid, useToolState } from '../kit'
import { dv, FOODS, KEYS, LABELS, round, scale, sum, UNITS, type Nutr } from './lib/nutrition-label-maker'

interface Line { id: string; food: string; grams: number }
interface State { title: string; servings: number; unitName: string; lines: Line[] }

const DEF: State = {
  title: 'Banana Oat Muffins',
  servings: 12,
  unitName: '1 muffin',
  lines: [
    ['All-purpose flour', 180], ['Rolled oats', 90], ['Banana', 350], ['Brown sugar', 100], ['Egg (whole)', 100], ['Whole milk', 120],
    ['Butter (salted)', 85], ['Walnuts', 60], ['Baking powder', 8], ['Salt', 3], ['Vanilla extract', 5],
  ].map(([food, grams]) => ({ id: uid(), food: food as string, grams: grams as number })),
}

const food = (name: string) => FOODS.find((f) => f.name === name) ?? FOODS[0]

const W = 300
const FONT = 'Helvetica, Arial, sans-serif'

/** Builds the FDA-style label as SVG elements, top to bottom. */
function buildLabel(per: Nutr, servings: number, serving: string): { els: ReactNode[]; h: number } {
  const els: ReactNode[] = []
  let y = 8
  const P = 8
  let k = 0
  const text = (x: number, yy: number, s: string, size: number, bold = false, anchor: 'start' | 'end' = 'start') =>
    els.push(<text key={k++} x={x} y={yy} fontSize={size} fontWeight={bold ? 800 : 400} textAnchor={anchor} fontFamily={FONT} fill="#000">{s}</text>)
  const bar = (h: number) => {
    els.push(<rect key={k++} x={P} y={y} width={W - 2 * P} height={h} fill="#000" />)
    y += h
  }
  const hair = (x = P) => els.push(<line key={k++} x1={x} x2={W - P} y1={y} y2={y} stroke="#000" strokeWidth={0.8} />)
  y += 30
  text(P, y, 'Nutrition Facts', 32, true)
  y += 6
  hair()
  y += 18
  text(P, y, `${servings} servings per container`, 14)
  y += 20
  text(P, y, 'Serving size', 16, true)
  text(W - P, y, serving, 16, true, 'end')
  y += 6
  bar(10)
  y += 14
  text(P, y, 'Amount per serving', 11, true)
  y += 28
  text(P, y, 'Calories', 26, true)
  text(W - P, y, round('kcal', per.kcal), 34, true, 'end')
  y += 6
  bar(5)
  y += 14
  text(W - P, y, '% Daily Value*', 11, true, 'end')
  y += 4
  const row = (key: (typeof KEYS)[number], indent: number, bold: boolean, label?: string) => {
    hair(indent ? P + 14 : P)
    y += 16
    const amt = `${round(key, per[key])}${UNITS[key]}`
    const d = dv(key, per[key])
    if (label) text(P + indent, y, label, 13)
    else {
      els.push(
        <text key={k++} x={P + indent} y={y} fontSize={13} fontFamily={FONT} fill="#000">
          <tspan fontWeight={bold ? 800 : 400}>{LABELS[key]}</tspan> {amt}
        </text>,
      )
    }
    if (d !== null) text(W - P, y, `${d}%`, 13, true, 'end')
    y += 5
  }
  row('fat', 0, true)
  row('sat', 14, false)
  hair(P + 14)
  y += 16
  els.push(<text key={k++} x={P + 14} y={y} fontSize={13} fontFamily={FONT} fill="#000"><tspan fontStyle="italic">Trans</tspan> Fat {round('trans', per.trans)}g</text>)
  y += 5
  row('chol', 0, true)
  row('sodium', 0, true)
  row('carb', 0, true)
  row('fiber', 14, false)
  row('sugar', 14, false)
  row('added', 28, false, `Includes ${round('added', per.added)}g Added Sugars`)
  row('protein', 0, true)
  bar(10)
  y -= 5
  for (const key of ['vitD', 'ca', 'fe', 'k'] as const) {
    y += 5
    if (key !== 'vitD') hair()
    y += 16
    text(P, y, `${LABELS[key]} ${round(key, per[key])}${UNITS[key]}`, 13)
    text(W - P, y, `${dv(key, per[key])}%`, 13, false, 'end')
  }
  y += 6
  bar(5)
  const foot = ['* The % Daily Value (DV) tells you how much a nutrient', 'in a serving of food contributes to a daily diet.', '2,000 calories a day is used for general nutrition advice.']
  for (const l of foot) {
    y += 13
    text(P, y, l, 10.5)
  }
  y += 10
  return { els, h: y }
}

export default function NutritionLabelMaker() {
  const [s, set, reset] = useToolState('nutrition-label-maker', DEF)
  const svgRef = useRef<SVGSVGElement>(null)
  const servings = Math.max(1, Math.round(s.servings))
  const items = s.lines.map((l) => ({ grams: Math.max(0, l.grams), n: food(l.food).n }))
  const total = sum(items)
  const weight = items.reduce((a, i) => a + i.grams, 0)
  const per = scale(total, 1 / servings)
  const servingG = Math.round(weight / servings)
  const servingTxt = `${s.unitName || 'Serving'} (${servingG}g)`
  const { els, h } = buildLabel(per, servings, servingTxt)
  const edit = (id: string, p: Partial<Line>) => set({ lines: s.lines.map((l) => (l.id === id ? { ...l, ...p } : l)) })

  const sorted = [...s.lines].sort((a, b) => b.grams - a.grams)
  const ingredients = `INGREDIENTS: ${[...new Set(sorted.filter((l) => l.grams > 0).map((l) => food(l.food).label))].join(', ')}.`
  const allergens = [...new Set(s.lines.filter((l) => l.grams > 0).map((l) => food(l.food).allergen).filter(Boolean))]
  const kcalSplit = { fat: per.fat * 9, carb: per.carb * 4, protein: per.protein * 4 }
  const kcalSum = kcalSplit.fat + kcalSplit.carb + kcalSplit.protein || 1

  const svgText = () => new XMLSerializer().serializeToString(svgRef.current!)
  const png = () => {
    const img = new Image()
    const url = URL.createObjectURL(new Blob([svgText()], { type: 'image/svg+xml' }))
    img.onload = () => {
      const c = document.createElement('canvas')
      const z = 3
      c.width = W * z
      c.height = h * z
      const ctx = c.getContext('2d')!
      ctx.fillStyle = '#fff'
      ctx.fillRect(0, 0, c.width, c.height)
      ctx.drawImage(img, 0, 0, c.width, c.height)
      URL.revokeObjectURL(url)
      c.toBlob((b) => b && download(`${s.title || 'nutrition'}-label.png`, b))
    }
    img.src = url
  }

  return (
    <Split wide="left">
      <div>
        <Panel title="Recipe">
          <Row>
            <Txt label="Recipe name" value={s.title} onChange={(title) => set({ title })} />
            <Num label="Servings per recipe" value={s.servings} onChange={(v) => set({ servings: v })} min={1} step={1} />
            <Txt label="Serving name" value={s.unitName} onChange={(unitName) => set({ unitName })} placeholder="1 cup, 2 cookies…" />
          </Row>
        </Panel>
        <Panel
          title="Ingredients"
          actions={
            <>
              <Btn onClick={() => set({ lines: [...s.lines, { id: uid(), food: 'Granulated sugar', grams: 50 }] })}>+ Ingredient</Btn>
              <JsonButtons name="recipe.json" data={s} onLoad={(d) => set(d)} />
              <Btn kind="ghost" onClick={reset}>Reset</Btn>
            </>
          }
        >
          <Table
            head={['Ingredient', 'Weight', 'kcal', 'Fat', 'Carbs', 'Protein', '']}
            rows={s.lines.map((l) => {
              const f = food(l.food)
              const q = Math.max(0, l.grams) / 100
              return [
                <select key="f" value={l.food} onChange={(e) => edit(l.id, { food: e.target.value })} aria-label="Ingredient">
                  {FOODS.map((x) => <option key={x.name}>{x.name}</option>)}
                </select>,
                <span key="g" style={{ whiteSpace: 'nowrap' }}>
                  <input type="number" min={0} value={l.grams} onChange={(e) => edit(l.id, { grams: Math.max(0, Number(e.target.value) || 0) })} style={{ width: 72 }} aria-label="Grams" /> g
                </span>,
                Math.round(f.n.kcal * q),
                `${(f.n.fat * q).toFixed(1)} g`,
                `${(f.n.carb * q).toFixed(1)} g`,
                `${(f.n.protein * q).toFixed(1)} g`,
                <Btn key="x" kind="ghost" title="Remove" onClick={() => set({ lines: s.lines.filter((x) => x.id !== l.id) })}>✕</Btn>,
              ]
            })}
            foot={['Whole recipe', `${Math.round(weight)} g`, Math.round(total.kcal), `${total.fat.toFixed(0)} g`, `${total.carb.toFixed(0)} g`, `${total.protein.toFixed(0)} g`, '']}
          />
          <p className="muted" style={{ fontSize: 13 }}>Values per 100 g are based on USDA FoodData Central averages. Weigh raw ingredients; use grams for accuracy.</p>
        </Panel>
        <Panel title="Per serving, unrounded" actions={<CsvButton name="nutrition.csv" rows={() => [['Nutrient', 'Per serving', 'Unit', 'Label value', '%DV', 'Whole recipe'], ...KEYS.map((k) => [LABELS[k], per[k].toFixed(2), UNITS[k], round(k, per[k]), dv(k, per[k]) ?? '', total[k].toFixed(1)])]} />}>
          <Stats>
            <Stat label="Calories" value={Math.round(per.kcal)} sub={`${servingG} g serving`} tone="accent" />
            <Stat label="From fat" value={`${Math.round((kcalSplit.fat / kcalSum) * 100)}%`} />
            <Stat label="From carbs" value={`${Math.round((kcalSplit.carb / kcalSum) * 100)}%`} />
            <Stat label="From protein" value={`${Math.round((kcalSplit.protein / kcalSum) * 100)}%`} />
          </Stats>
          <Table head={['Nutrient', 'Exact', 'Label', '%DV']} rows={KEYS.map((k) => [LABELS[k], `${per[k].toFixed(2)} ${UNITS[k]}`, `${round(k, per[k])}${k === 'kcal' ? '' : UNITS[k]}`, dv(k, per[k]) === null ? '—' : `${dv(k, per[k])}%`])} />
        </Panel>
      </div>
      <div>
        <Panel
          title="Label"
          actions={
            <>
              <Btn kind="primary" onClick={png}>⬇ PNG</Btn>
              <Btn onClick={() => download(`${s.title || 'nutrition'}-label.svg`, svgText(), 'image/svg+xml')}>⬇ SVG</Btn>
            </>
          }
        >
          <div style={{ display: 'flex', justifyContent: 'center', background: '#fff', padding: 10, borderRadius: 8 }}>
            <svg ref={svgRef} xmlns="http://www.w3.org/2000/svg" width={W} height={h} viewBox={`0 0 ${W} ${h}`} style={{ maxWidth: '100%', height: 'auto' }}>
              <rect x={0.5} y={0.5} width={W - 1} height={h - 1} fill="#fff" stroke="#000" strokeWidth={1.5} />
              {els}
            </svg>
          </div>
        </Panel>
        <Panel title="Ingredient & allergen statement" actions={<CopyButton text={() => `${ingredients}${allergens.length ? `\nCONTAINS: ${allergens.join(', ')}.` : ''}`} />}>
          <p style={{ fontSize: 13, margin: 0 }}>{ingredients}</p>
          {allergens.length > 0 && <p style={{ fontSize: 13 }}><b>CONTAINS: {allergens.join(', ')}.</b></p>}
          <Note>Ingredients are listed by weight, heaviest first. Rounding follows FDA 21 CFR 101.9. Check local rules before using on products for sale.</Note>
        </Panel>
      </div>
    </Split>
  )
}
