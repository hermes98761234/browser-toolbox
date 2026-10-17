import { useMemo, useState, type DragEvent } from 'react'
import { Area, Btn, CopyButton, CsvButton, JsonButtons, Note, Num, Panel, Row, Split, Stat, Stats, Txt, color, uid, useToolState } from '../kit'
import { aisle, formatQty, shoppingList, type Entry, type Plan, type Recipe } from './lib/meal-planner'

const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
const MEALS = ['Breakfast', 'Lunch', 'Dinner', 'Snack']

interface State { people: number; recipes: Recipe[]; plan: Plan; have: string[] }

const R = (id: string, name: string, servings: number, tags: string, ing: string[]): Recipe => ({ id, name, servings, tags, ingredients: ing.join('\n') })
const RECIPES: Recipe[] = [
  R('oats', 'Overnight oats', 1, 'breakfast, quick', ['50 g rolled oats', '150 ml milk', '80 g yogurt', '1 tsp honey', '60 g berries']),
  R('eggs', 'Scrambled eggs on toast', 1, 'breakfast', ['2 eggs', '1 slice bread', '10 g butter', '1 pinch salt']),
  R('bolo', 'Spaghetti bolognese', 4, 'dinner, family', ['400 g spaghetti', '500 g beef mince', '1 onion', '2 cloves garlic', '1 can chopped tomatoes', '2 tbsp tomato paste', '1 carrot', '40 g parmesan']),
  R('curry', 'Chickpea curry', 4, 'dinner, vegan', ['2 cans chickpeas', '1 can coconut milk', '1 onion', '3 cloves garlic', '20 g ginger', '2 tbsp curry paste', '200 g spinach', '300 g rice']),
  R('salad', 'Greek salad', 2, 'lunch, vegetarian', ['3 tomatoes', '1 cucumber', '1/2 red onion', '150 g feta', '60 g olives', '2 tbsp olive oil']),
  R('wrap', 'Chicken wraps', 2, 'lunch', ['300 g chicken breast', '4 tortillas', '1 avocado', '1 lettuce', '100 g yogurt', '1 lime']),
  R('salmon', 'Salmon, potatoes & greens', 2, 'dinner', ['2 salmon fillets', '500 g potatoes', '200 g broccoli', '1 lemon', '1 tbsp olive oil']),
  R('soup', 'Lentil soup', 4, 'lunch, vegan, batch', ['300 g red lentils', '1 onion', '2 carrots', '2 stalks celery', '1.5 l vegetable stock', '1 tsp cumin']),
  R('fruit', 'Fruit & nuts', 1, 'snack', ['1 apple', '30 g almonds']),
]
const P = (people: number, ...xs: [string, string][]): Plan => {
  const p: Plan = {}
  for (const [k, r] of xs) (p[k] ??= []).push({ recipe: r, servings: people })
  return p
}
const DEF: State = {
  people: 2, recipes: RECIPES, have: [],
  plan: P(2,
    ['0-0', 'oats'], ['1-0', 'eggs'], ['2-0', 'oats'], ['3-0', 'eggs'], ['4-0', 'oats'], ['5-0', 'eggs'], ['6-0', 'oats'],
    ['0-1', 'soup'], ['1-1', 'soup'], ['2-1', 'salad'], ['3-1', 'wrap'], ['4-1', 'salad'], ['5-1', 'wrap'],
    ['0-2', 'bolo'], ['1-2', 'curry'], ['2-2', 'salmon'], ['3-2', 'bolo'], ['4-2', 'curry'], ['5-2', 'salmon'],
    ['1-3', 'fruit'], ['3-3', 'fruit'], ['5-3', 'fruit'],
  ),
}

type Drag = { kind: 'recipe'; id: string } | { kind: 'entry'; from: string; i: number }

function monday(): Date {
  const d = new Date()
  d.setHours(0, 0, 0, 0)
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7))
  return d
}

export default function MealPlanner() {
  const [s, set, reset] = useToolState('meal-planner', DEF)
  const [sel, setSel] = useState<string>(s.recipes[2]?.id ?? '')
  const [pick, setPick] = useState<string | null>(null)
  const [over, setOver] = useState<string | null>(null)
  const [q, setQ] = useState('')
  const [mon] = useState(monday)
  const byId = useMemo(() => new Map(s.recipes.map((r, i) => [r.id, { r, c: color(i) }])), [s.recipes])
  const list = useMemo(() => shoppingList(s.plan, s.recipes), [s.plan, s.recipes])
  const recipe = s.recipes.find((r) => r.id === sel)

  const setCell = (plan: Plan, key: string, entries: Entry[]) => {
    const next = { ...plan }
    if (entries.length) next[key] = entries
    else delete next[key]
    return next
  }
  const add = (key: string, id: string) => set((x) => ({ ...x, plan: setCell(x.plan, key, [...(x.plan[key] ?? []), { recipe: id, servings: x.people }]) }))
  const editEntry = (key: string, i: number, e: Entry | null) =>
    set((x) => ({ ...x, plan: setCell(x.plan, key, (x.plan[key] ?? []).flatMap((y, j) => (j === i ? (e ? [e] : []) : [y]))) }))

  const onDrop = (key: string, ev: DragEvent) => {
    ev.preventDefault()
    setOver(null)
    let d: Drag
    try {
      d = JSON.parse(ev.dataTransfer.getData('text/plain')) as Drag
    } catch {
      return
    }
    if (d.kind === 'recipe') return add(key, d.id)
    if (d.from === key) return
    const copy = ev.ctrlKey || ev.altKey || ev.metaKey
    set((x) => {
      const moved = x.plan[d.from]?.[d.i]
      if (!moved) return x
      let plan = setCell(x.plan, key, [...(x.plan[key] ?? []), { ...moved }])
      if (!copy) plan = setCell(plan, d.from, (plan[d.from] ?? []).filter((_, j) => j !== d.i))
      return { ...x, plan }
    })
  }
  const drag = (d: Drag) => (ev: DragEvent) => {
    ev.dataTransfer.setData('text/plain', JSON.stringify(d))
    ev.dataTransfer.effectAllowed = 'copyMove'
  }

  const planned = Object.values(s.plan).reduce((a, e) => a + e.length, 0)
  const groups = useMemo(() => {
    const g = new Map<string, typeof list>()
    for (const it of list) g.set(aisle(it.item), [...(g.get(aisle(it.item)) ?? []), it])
    return [...g.entries()].sort((a, b) => (a[0] === 'Other' ? 1 : b[0] === 'Other' ? -1 : a[0].localeCompare(b[0])))
  }, [list])
  const keyOf = (it: (typeof list)[number]) => `${it.item}|${it.unit}`
  const toBuy = list.filter((it) => !s.have.includes(keyOf(it)))
  const asText = () => groups.map(([g, items]) => `${g}\n` + items.filter((it) => !s.have.includes(keyOf(it))).map((it) => `- ${it.item}: ${formatQty(it)}`).join('\n')).join('\n\n')
  const shown = s.recipes.filter((r) => !q || (r.name + ' ' + r.tags).toLowerCase().includes(q.toLowerCase()))

  return (
    <div>
      <Stats>
        <Stat label="Meals planned" value={planned} sub={`in ${Object.keys(s.plan).length} of ${DAYS.length * MEALS.length} slots`} />
        <Stat label="Recipes used" value={new Set(Object.values(s.plan).flat().map((e) => e.recipe)).size} />
        <Stat label="Servings" value={Object.values(s.plan).flat().reduce((a, e) => a + e.servings, 0)} />
        <Stat label="To buy" value={toBuy.length} sub={`${list.length - toBuy.length} already at home`} tone="accent" />
      </Stats>
      <Panel title={`Week of ${mon.toLocaleDateString([], { month: 'short', day: 'numeric' })}`} actions={<>
        <Num label="" value={s.people} min={1} step={1} unit="servings" onChange={(v) => set({ people: Math.max(1, Math.round(v)) })} />
        <Btn kind="ghost" onClick={() => set({ plan: {}, have: [] })}>Clear week</Btn>
      </>}>
        <p className="muted" style={{ marginTop: 0 }}>
          Drag recipes from the library into a slot; drag a planned meal to move it (hold Ctrl/Alt to copy). On touch screens tap a recipe, then tap <b>+</b> in a slot.
        </p>
        <div style={{ overflowX: 'auto' }}>
          <div style={{ display: 'grid', gridTemplateColumns: `84px repeat(7, minmax(108px, 1fr))`, gap: 4, minWidth: 840 }}>
            <div />
            {DAYS.map((d, i) => {
              const date = new Date(mon)
              date.setDate(mon.getDate() + i)
              return <div key={d} style={{ fontWeight: 700, textAlign: 'center' }}>{d} <span className="muted" style={{ fontWeight: 400 }}>{date.getDate()}</span></div>
            })}
            {MEALS.map((m, mi) => (
              <div key={m} style={{ display: 'contents' }}>
                <div style={{ fontWeight: 700, fontSize: 13, alignSelf: 'center' }}>{m}</div>
                {DAYS.map((_, di) => {
                  const key = `${di}-${mi}`
                  return (
                    <div key={key}
                      onDragOver={(e) => { e.preventDefault(); setOver(key) }}
                      onDragLeave={() => setOver((o) => (o === key ? null : o))}
                      onDrop={(e) => onDrop(key, e)}
                      style={{ minHeight: 62, border: `1px ${over === key ? 'solid var(--accent)' : 'dashed var(--line)'}`, borderRadius: 8, padding: 3, background: over === key ? 'var(--panel2)' : undefined, display: 'flex', flexDirection: 'column', gap: 3 }}>
                      {(s.plan[key] ?? []).map((e, i) => {
                        const hit = byId.get(e.recipe)
                        return (
                          <div key={i} draggable onDragStart={drag({ kind: 'entry', from: key, i })} title={hit?.r.name}
                            style={{ background: hit?.c ?? '#64748b', color: '#fff', borderRadius: 6, padding: '3px 5px', fontSize: 12, cursor: 'grab', lineHeight: 1.25 }}>
                            <div style={{ fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{hit?.r.name ?? 'Missing recipe'}</div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                              <button type="button" style={chipBtn} onClick={() => editEntry(key, i, { ...e, servings: Math.max(1, e.servings - 1) })} aria-label="Fewer servings">−</button>
                              <span>{e.servings}</span>
                              <button type="button" style={chipBtn} onClick={() => editEntry(key, i, { ...e, servings: e.servings + 1 })} aria-label="More servings">+</button>
                              <button type="button" style={{ ...chipBtn, marginLeft: 'auto' }} onClick={() => editEntry(key, i, null)} aria-label="Remove">✕</button>
                            </div>
                          </div>
                        )
                      })}
                      {pick && <button type="button" className="k-btn ghost" style={{ padding: '0 4px', minHeight: 22 }} onClick={() => add(key, pick)}>+</button>}
                    </div>
                  )
                })}
              </div>
            ))}
          </div>
        </div>
      </Panel>
      <Split>
        <div>
          <Panel title="Recipe library" actions={<Btn onClick={() => {
            const id = uid()
            set({ recipes: [...s.recipes, { id, name: 'New recipe', servings: 2, tags: '', ingredients: '' }] })
            setSel(id)
          }}>+ Recipe</Btn>}>
            <Txt label="" value={q} onChange={setQ} placeholder="Search name or tag…" />
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, margin: '8px 0' }}>
              {shown.map((r) => {
                const c = byId.get(r.id)?.c
                const on = pick === r.id
                return (
                  <button key={r.id} type="button" draggable onDragStart={drag({ kind: 'recipe', id: r.id })}
                    onClick={() => { setSel(r.id); setPick(on ? null : r.id) }}
                    style={{ border: `2px solid ${c}`, background: on ? c : 'var(--panel)', color: on ? '#fff' : 'var(--fg)', borderRadius: 999, padding: '4px 10px', cursor: 'grab', fontWeight: 600, fontSize: 13 }}>
                    {r.name}
                  </button>
                )
              })}
            </div>
            {pick && <Note>Tap <b>+</b> in any slot to add “{byId.get(pick)?.r.name}”. Tap the chip again to stop.</Note>}
            {recipe && (
              <div style={{ borderTop: '1px solid var(--line)', paddingTop: 10, marginTop: 6 }}>
                <Row>
                  <Txt label="Name" value={recipe.name} onChange={(name) => set({ recipes: s.recipes.map((r) => (r.id === recipe.id ? { ...r, name } : r)) })} />
                  <Num label="Makes" unit="servings" min={1} step={1} value={recipe.servings} onChange={(v) => set({ recipes: s.recipes.map((r) => (r.id === recipe.id ? { ...r, servings: Math.max(1, Math.round(v)) } : r)) })} />
                </Row>
                <Txt label="Tags" value={recipe.tags} onChange={(tags) => set({ recipes: s.recipes.map((r) => (r.id === recipe.id ? { ...r, tags } : r)) })} />
                <Area label="Ingredients (one per line: “200 g pasta”, “1/2 cup milk”, “3 eggs”)" mono rows={7} value={recipe.ingredients}
                  onChange={(ingredients) => set({ recipes: s.recipes.map((r) => (r.id === recipe.id ? { ...r, ingredients } : r)) })} />
                <Row>
                  <Btn kind="danger" onClick={() => {
                    const plan: Plan = {}
                    for (const [k, es] of Object.entries(s.plan)) {
                      const keep = es.filter((e) => e.recipe !== recipe.id)
                      if (keep.length) plan[k] = keep
                    }
                    set({ recipes: s.recipes.filter((r) => r.id !== recipe.id), plan })
                    setSel('')
                    setPick(null)
                  }}>Delete recipe</Btn>
                  <JsonButtons name="meal-planner.json" data={s} onLoad={(d) => set(d)} />
                  <Btn kind="ghost" onClick={reset}>Reset sample</Btn>
                </Row>
              </div>
            )}
          </Panel>
        </div>
        <div>
          <Panel title="Shopping list" actions={<>
            <CopyButton text={asText} />
            <CsvButton name="shopping-list.csv" rows={() => [['Aisle', 'Item', 'Quantity', 'Have', 'Used in'], ...list.map((it) => [aisle(it.item), it.item, formatQty(it), s.have.includes(keyOf(it)) ? 'yes' : '', it.recipes.join('; ')])]} />
          </>}>
            {!list.length && <Note>Plan some meals to build the list.</Note>}
            {groups.map(([g, items]) => (
              <div key={g} style={{ marginBottom: 10 }}>
                <div style={{ fontWeight: 800, fontSize: 13, textTransform: 'uppercase', color: 'var(--muted)', letterSpacing: '0.05em', margin: '6px 0' }}>{g}</div>
                {items.map((it) => {
                  const k = keyOf(it)
                  const have = s.have.includes(k)
                  return (
                    <label key={k} style={{ display: 'flex', gap: 8, alignItems: 'baseline', padding: '3px 0', borderBottom: '1px solid var(--line)', opacity: have ? 0.5 : 1 }}>
                      <input type="checkbox" checked={have} onChange={() => set({ have: have ? s.have.filter((x) => x !== k) : [...s.have, k] })} />
                      <span style={{ flex: 1, textDecoration: have ? 'line-through' : undefined }}>
                        <b style={{ textTransform: 'capitalize' }}>{it.item}</b> <span className="muted" style={{ fontSize: 12 }}>· {it.recipes.join(', ')}</span>
                      </span>
                      <span style={{ fontVariantNumeric: 'tabular-nums', fontWeight: 600 }}>{formatQty(it)}</span>
                    </label>
                  )
                })}
              </div>
            ))}
            {list.length > 0 && <p className="muted">Quantities are scaled to the planned servings; grams/kg, ml/litres, spoons and cups are merged automatically. Tick what you already have.</p>}
          </Panel>
        </div>
      </Split>
    </div>
  )
}

const chipBtn = { border: 0, background: 'rgba(255,255,255,.25)', color: '#fff', borderRadius: 4, width: 18, height: 18, padding: 0, lineHeight: '18px', fontSize: 12, cursor: 'pointer' } as const
