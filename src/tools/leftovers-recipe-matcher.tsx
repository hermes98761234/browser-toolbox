import { useMemo, useState } from 'react'
import { Bar, Btn, CopyButton, Note, Panel, Row, Select, Slider, Split, Stat, Stats, Txt, useToolState } from '../kit'
import { normalize, parseRecipes, rankRecipes } from './lib/leftovers-recipe-matcher'

const RECIPES = parseRecipes()
const QUICK = ['eggs', 'cooked rice', 'pasta', 'potatoes', 'onion', 'garlic', 'cheese', 'bread', 'milk', 'chicken', 'canned tomatoes', 'carrots', 'bell pepper', 'spinach', 'banana', 'tortillas', 'beans', 'mushrooms']

interface Item { name: string; first: boolean }
interface State { items: Item[]; staples: string; diet: string; maxTime: number; maxMissing: number; query: string }
const DEF: State = {
  items: [
    { name: 'leftover rice', first: true }, { name: 'eggs', first: false }, { name: 'scallions', first: false }, { name: 'half an onion', first: false },
    { name: 'carrots', first: false }, { name: 'brocoli', first: true }, { name: 'cheddar', first: false }, { name: 'stale bread', first: true }, { name: 'milk', first: false },
  ],
  staples: 'salt, black pepper, olive oil, butter, soy sauce, garlic, flour, sugar',
  diet: 'any', maxTime: 60, maxMissing: 2, query: '',
}
const DIETS = [['any', 'Anything'], ['v', 'Vegetarian'], ['vg', 'Vegan'], ['gf', 'Gluten-free']] as const

const chip = (bg: string, fg = 'var(--fg)'): React.CSSProperties => ({ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '3px 9px', borderRadius: 999, background: bg, color: fg, fontSize: 13, margin: '2px 4px 2px 0' })

export default function LeftoversRecipeMatcher() {
  const [s, set, reset] = useToolState('leftovers-recipe-matcher', DEF)
  const [draft, setDraft] = useState('')
  const [open, setOpen] = useState<string | null>(null)
  const staples = useMemo(() => s.staples.split(',').map((x) => x.trim()).filter(Boolean), [s.staples])

  const add = (text: string) => {
    const names = text.split(/[,;\n]/).map((x) => x.trim()).filter(Boolean)
    const have = new Set(s.items.map((i) => normalize(i.name)))
    const fresh = names.filter((n) => !have.has(normalize(n)))
    if (fresh.length) set({ items: [...s.items, ...fresh.map((name) => ({ name, first: false }))] })
    setDraft('')
  }

  const ranked = useMemo(
    () => rankRecipes(RECIPES, s.items.map((i) => i.name), staples, s.items.filter((i) => i.first).map((i) => i.name)),
    [s.items, staples],
  )
  const q = s.query.trim().toLowerCase()
  const shown = ranked.filter((m) => {
    const r = m.recipe
    if (s.diet !== 'any' && !(r.tags.includes(s.diet) || (s.diet === 'v' && r.tags.includes('vg')))) return false
    if (r.minutes > s.maxTime) return false
    if (q && !(`${r.name} ${r.need.join(' ')} ${r.optional.join(' ')}`.toLowerCase().includes(q))) return false
    return m.missing.length <= s.maxMissing && m.have.some((h) => h.by !== 'staple')
  })
  const ready = shown.filter((m) => m.missing.length === 0).length

  // what single purchase unlocks the most near-miss recipes
  const unlock = new Map<string, string[]>()
  for (const m of ranked) if (m.missing.length > 0 && m.missing.length <= 2 && m.recipe.minutes <= s.maxTime) for (const x of m.missing) unlock.set(x, [...(unlock.get(x) ?? []), m.recipe.name])
  const buys = [...unlock.entries()].sort((a, b) => b[1].length - a[1].length).slice(0, 8)
  const usedTop = new Set(shown.slice(0, 10).flatMap((m) => m.used))
  const unused = s.items.filter((i) => !usedTop.has(i.name))

  return (
    <Split>
      <div>
        <Panel title="What's in your fridge?" actions={<Btn kind="ghost" onClick={reset}>Reset</Btn>}>
          <form onSubmit={(e) => { e.preventDefault(); add(draft) }}>
            <Txt label="Add ingredients (comma-separated, typos are fine)" value={draft} onChange={setDraft} placeholder="e.g. tomatos, spinach, feta" />
          </form>
          <Row><Btn kind="primary" onClick={() => add(draft)} disabled={!draft.trim()}>+ Add</Btn><Btn kind="ghost" onClick={() => set({ items: [] })}>Clear all</Btn></Row>
          <div style={{ margin: '10px 0' }}>
            {s.items.map((it, i) => (
              <span key={it.name + i} style={chip(it.first ? 'color-mix(in srgb, var(--warn) 25%, transparent)' : 'var(--panel2)')}>
                <button type="button" className="k-btn ghost" style={{ padding: '0 2px', minHeight: 0 }} title={it.first ? 'Use first (expiring)' : 'Mark as use-first'} onClick={() => set({ items: s.items.map((x, j) => (j === i ? { ...x, first: !x.first } : x)) })}>{it.first ? '⏰' : '☆'}</button>
                {it.name}
                <span className="muted" style={{ fontSize: 11 }}>→ {normalize(it.name)}</span>
                <button type="button" className="k-btn ghost" style={{ padding: '0 2px', minHeight: 0 }} aria-label={`Remove ${it.name}`} onClick={() => set({ items: s.items.filter((_, j) => j !== i) })}>✕</button>
              </span>
            ))}
            {!s.items.length && <p className="muted">Nothing yet. Tap a quick-add item below.</p>}
          </div>
          <p className="muted" style={{ fontSize: 13, margin: '4px 0' }}>⏰ = use first (about to go off); recipes using them rank higher. Outlined green chips are pantry staples.</p>
          <div>
            {QUICK.filter((x) => !s.items.some((i) => normalize(i.name) === normalize(x))).map((x) => (
              <button key={x} type="button" className="k-btn ghost" style={{ ...chip('transparent'), border: '1px dashed var(--line)' }} onClick={() => add(x)}>+ {x}</button>
            ))}
          </div>
        </Panel>
        <Panel title="Filters">
          <Txt label="Pantry staples you always have" value={s.staples} onChange={(staples) => set({ staples })} hint="Counted as available but never as 'using up' leftovers." />
          <Row>
            <Select label="Diet" value={s.diet} onChange={(diet) => set({ diet })} options={DIETS} />
            <Txt label="Search recipes" value={s.query} onChange={(query) => set({ query })} placeholder="soup, pasta…" />
          </Row>
          <Slider label="Max cooking time" value={s.maxTime} min={5} max={90} step={5} unit=" min" onChange={(maxTime) => set({ maxTime })} />
          <Slider label="Allow missing ingredients" value={s.maxMissing} min={0} max={4} show={(v) => String(v)} onChange={(maxMissing) => set({ maxMissing })} />
        </Panel>
        {buys.length > 0 && (
          <Panel title="Smart shopping" actions={<CopyButton label="Copy list" text={() => buys.map(([x]) => `- ${x}`).join('\n')} />}>
            <p className="muted" style={{ marginTop: 0 }}>Buying one of these unlocks the most near-miss recipes:</p>
            {buys.map(([x, rs]) => (
              <div key={x} style={{ marginBottom: 6 }}>
                <b>{x}</b> <span className="muted">unlocks {rs.length}: {rs.slice(0, 3).join(', ')}{rs.length > 3 ? '…' : ''}</span>
              </div>
            ))}
          </Panel>
        )}
      </div>
      <div>
        <Stats>
          <Stat label="Cook now" value={ready} tone={ready ? 'good' : undefined} sub="nothing missing" />
          <Stat label="Almost there" value={shown.length - ready} sub={`≤ ${s.maxMissing} missing`} />
          <Stat label="Recipes searched" value={RECIPES.length} />
        </Stats>
        {unused.length > 0 && s.items.length > 0 && <Note>Not used by your top 10: {unused.map((u) => u.name).join(', ')}. Try the search box or allow more missing items.</Note>}
        <Panel title={`Suggestions (${shown.length})`}>
          {!shown.length && <Note tone="warn">No recipe fits these filters. Add more ingredients, raise the time limit or allow more missing items.</Note>}
          {shown.slice(0, 30).map((m) => {
            const r = m.recipe
            const isOpen = open === r.name
            return (
              <div key={r.name} style={{ borderBottom: '1px solid var(--line)', padding: '10px 0' }}>
                <Row wrap={false}>
                  <button type="button" className="k-btn ghost" style={{ flex: 1, textAlign: 'left', fontWeight: 700, fontSize: 16, justifyContent: 'flex-start' }} onClick={() => setOpen(isOpen ? null : r.name)} aria-expanded={isOpen}>
                    {isOpen ? '▾' : '▸'} {r.name}
                  </button>
                  <span className="muted" style={{ whiteSpace: 'nowrap' }}>⏱ {r.minutes} min {r.tags.includes('vg') ? '· 🌱 vegan' : r.tags.includes('v') ? '· 🥕 veg' : ''}</span>
                </Row>
                <Row wrap={false}>
                  <div style={{ flex: 1 }}><Bar value={m.coverage} color={m.missing.length ? 'var(--warn)' : 'var(--ok)'} /></div>
                  <b style={{ minWidth: 48, textAlign: 'right' }}>{Math.round(m.coverage * 100)}%</b>
                </Row>
                <div style={{ marginTop: 4 }}>
                  {m.have.map((h) => <span key={h.ing} style={h.by === 'staple' ? { ...chip('transparent'), border: '1px solid color-mix(in srgb, var(--ok) 45%, transparent)' } : chip('color-mix(in srgb, var(--ok) 20%, transparent)')} title={h.by === 'staple' ? 'pantry staple' : `from “${h.by}”`}>✓ {h.ing}</span>)}
                  {m.optHave.map((h) => <span key={h} style={chip('color-mix(in srgb, var(--ok) 10%, transparent)')}>+ {h}</span>)}
                  {m.missing.map((x) => <span key={x} style={chip('color-mix(in srgb, var(--err) 20%, transparent)')}>✗ {x}</span>)}
                  {m.usesFirst > 0 && <span style={chip('color-mix(in srgb, var(--warn) 25%, transparent)')}>⏰ uses {m.usesFirst} use-first</span>}
                </div>
                {isOpen && (
                  <div style={{ marginTop: 8 }}>
                    <p style={{ margin: '4px 0' }}>{r.method}</p>
                    {m.optMissing.length > 0 && <p className="muted" style={{ margin: 0 }}>Optional extras: {m.optMissing.join(', ')}</p>}
                  </div>
                )}
              </div>
            )
          })}
        </Panel>
      </div>
    </Split>
  )
}
