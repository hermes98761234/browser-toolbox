import { useState } from 'react'
import { Btn, Check, CopyButton, CsvButton, JsonButtons, Note, Num, Panel, Ring, Row, Seg, Split, Stat, Stats, Txt, uid, useToolState } from '../kit'
import { ACTIVITIES, CATS, generate, type Settings } from './lib/packing-list-builder'

interface Item { id: string; cat: string; name: string; qty: number; packed: boolean; custom?: boolean }
interface List { id: string; name: string; settings: Settings; items: Item[]; removed: string[] }
interface State { lists: List[]; cur: string; hidePacked: boolean }

/** Merges a freshly generated list with the user's packed flags, custom items and removals. */
function rebuild(l: List, settings: Settings): List {
  const old = new Map(l.items.map((i) => [i.name, i]))
  const gen = generate(settings)
    .filter((g) => !l.removed.includes(g.name))
    .map((g) => ({ id: old.get(g.name)?.id ?? uid(), cat: g.cat, name: g.name, qty: g.qty, packed: old.get(g.name)?.packed ?? false }))
  return { ...l, settings, items: [...gen, ...l.items.filter((i) => i.custom)] }
}

function newList(name: string, settings: Settings, packedSome = false): List {
  const l = rebuild({ id: uid(), name, settings, items: [], removed: [] }, settings)
  if (packedSome) l.items = l.items.map((i) => ({ ...i, packed: i.cat === 'Documents' }))
  return l
}

const SAMPLE = newList('Barcelona long weekend', { days: 5, activities: ['city', 'beach'], climate: 'hot', laundry: false, laundryEvery: 4, international: true }, true)
const DEF: State = { lists: [SAMPLE], cur: SAMPLE.id, hidePacked: false }

const PRESETS: [string, Settings][] = [
  ['Weekend city break', { days: 2, activities: ['city'], climate: 'mild', laundry: false, laundryEvery: 4, international: false }],
  ['Two-week beach holiday', { days: 14, activities: ['beach'], climate: 'hot', laundry: true, laundryEvery: 7, international: true }],
  ['Business trip', { days: 3, activities: ['business', 'city'], climate: 'mild', laundry: false, laundryEvery: 4, international: false }],
  ['Camping week', { days: 6, activities: ['hiking'], climate: 'mild', laundry: false, laundryEvery: 4, international: false }],
  ['Ski week', { days: 7, activities: ['ski'], climate: 'cold', laundry: true, laundryEvery: 4, international: true }],
]

export default function PackingListBuilder() {
  const [s, set, reset] = useToolState('packing-list-builder', DEF)
  const [newItem, setNewItem] = useState('')
  const [newCat, setNewCat] = useState('Misc')
  const list = s.lists.find((l) => l.id === s.cur) ?? s.lists[0]
  if (!list) {
    return <Note>No lists. <Btn onClick={reset}>Start again</Btn></Note>
  }
  const st = list.settings
  const upd = (fn: (l: List) => List) => set((x) => ({ ...x, lists: x.lists.map((l) => (l.id === list.id ? fn(l) : l)) }))
  const setSettings = (p: Partial<Settings>) => upd((l) => rebuild(l, { ...l.settings, ...p }))
  const editItem = (id: string, p: Partial<Item>) => upd((l) => ({ ...l, items: l.items.map((i) => (i.id === id ? { ...i, ...p } : i)) }))
  const packed = list.items.filter((i) => i.packed).length
  const units = list.items.reduce((a, i) => a + i.qty, 0)
  const clothes = list.items.filter((i) => i.cat === 'Clothes').reduce((a, i) => a + i.qty, 0)
  const cats = [...CATS, ...new Set(list.items.map((i) => i.cat).filter((c) => !CATS.includes(c)))]
  const asText = () =>
    `${list.name} — ${st.days} days\n` +
    cats
      .map((c) => {
        const its = list.items.filter((i) => i.cat === c)
        return its.length ? `\n${c}\n${its.map((i) => `[${i.packed ? 'x' : ' '}] ${i.qty > 1 ? `${i.qty} × ` : ''}${i.name}`).join('\n')}` : ''
      })
      .join('\n')
  const addList = (name: string, settings: Settings) => {
    const l = newList(name, settings)
    set((x) => ({ ...x, lists: [...x.lists, l], cur: l.id }))
  }

  return (
    <Split>
      <div>
        <Panel title="Saved lists" actions={<Btn kind="ghost" onClick={reset}>Reset</Btn>}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 10 }}>
            {s.lists.map((l) => {
              const p = l.items.filter((i) => i.packed).length
              return (
                <button key={l.id} type="button" className={`k-btn ${l.id === list.id ? 'primary' : ''}`} style={{ justifyContent: 'space-between', display: 'flex', textAlign: 'left' }} onClick={() => set({ cur: l.id })}>
                  <span>{l.name}</span>
                  <span style={{ opacity: 0.8 }}>{p}/{l.items.length}</span>
                </button>
              )
            })}
          </div>
          <Row>
            <Btn onClick={() => addList('New trip', { days: 4, activities: ['city'], climate: 'mild', laundry: false, laundryEvery: 4, international: false })}>+ New list</Btn>
            <Btn onClick={() => {
              const c = { ...list, id: uid(), name: `${list.name} (copy)`, items: list.items.map((i) => ({ ...i, id: uid(), packed: false })) }
              set((x) => ({ ...x, lists: [...x.lists, c], cur: c.id }))
            }}>Duplicate</Btn>
            <Btn kind="danger" disabled={s.lists.length < 2} onClick={() => set((x) => ({ ...x, lists: x.lists.filter((l) => l.id !== list.id), cur: x.lists.find((l) => l.id !== list.id)?.id ?? '' }))}>Delete</Btn>
          </Row>
          <div className="k-label" style={{ margin: '6px 0' }}>Start from a template</div>
          <Row>
            {PRESETS.map(([n, p]) => (
              <Btn key={n} onClick={() => addList(n, p)}>{n}</Btn>
            ))}
          </Row>
        </Panel>
        <Panel title="Trip details">
          <Txt label="List name" value={list.name} onChange={(name) => upd((l) => ({ ...l, name }))} />
          <Num label="Trip length" value={st.days} onChange={(days) => setSettings({ days: Math.max(1, Math.min(90, Math.round(days))) })} unit="days" min={1} max={90} step={1} />
          <div className="k-label" style={{ marginBottom: 6 }}>Activities</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 10 }}>
            {ACTIVITIES.map(([k, n]) => {
              const on = st.activities.includes(k)
              return (
                <Btn key={k} kind={on ? 'primary' : 'normal'} onClick={() => setSettings({ activities: on ? st.activities.filter((a) => a !== k) : [...st.activities, k] })}>{n}</Btn>
              )
            })}
          </div>
          <div className="k-label" style={{ marginBottom: 6 }}>Weather</div>
          <Seg value={st.climate} onChange={(climate) => setSettings({ climate })} options={[['hot', '☀ Hot'], ['mild', '⛅ Mild'], ['cold', '❄ Cold']]} />
          <div>
            <Check label="Going abroad" value={st.international} onChange={(international) => setSettings({ international })} />
            <Check label="Can do laundry" value={st.laundry} onChange={(laundry) => setSettings({ laundry })} />
          </div>
          {st.laundry && <Num label="Wash every" value={st.laundryEvery} onChange={(laundryEvery) => setSettings({ laundryEvery: Math.max(1, Math.round(laundryEvery)) })} unit="days" min={1} step={1} />}
          <p className="muted" style={{ fontSize: 12.5, margin: 0 }}>Quantities follow the trip length (e.g. underwear = days + 1). Laundry caps clothing at one wash cycle. Your ticks and custom items are kept when you change details.</p>
        </Panel>
      </div>

      <div>
        <Stats>
          <div className="k-stat" style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <Ring value={list.items.length ? packed / list.items.length : 0} size={74} />
            <div>
              <span className="k-stat-label">Packed</span>
              <b className="k-stat-value">{packed} / {list.items.length}</b>
            </div>
          </div>
          <Stat label="Things to pack" value={units} sub={`${list.items.length} lines`} />
          <Stat label="Clothing pieces" value={clothes} sub={clothes > 30 ? 'Consider laundry' : 'Fits a carry-on?'} />
        </Stats>
        <Panel
          title={`${list.name} · ${st.days} day${st.days > 1 ? 's' : ''}`}
          actions={
            <>
              <Btn onClick={() => upd((l) => ({ ...l, items: l.items.map((i) => ({ ...i, packed: false })) }))}>Untick all</Btn>
              <CopyButton text={asText} label="Copy" />
              <CsvButton name="packing-list.csv" rows={() => [['Category', 'Item', 'Qty', 'Packed'], ...list.items.map((i) => [i.cat, i.name, i.qty, i.packed ? 'yes' : 'no'])]} />
              <Btn onClick={() => window.print()}>🖨 Print</Btn>
              <JsonButtons name="packing-lists.json" data={s} onLoad={(d) => {
                if (d && Array.isArray(d.lists) && d.lists.length) set({ ...DEF, ...d, cur: d.lists[0].id })
              }} />
            </>
          }
        >
          <Check label="Hide packed items" value={s.hidePacked} onChange={(hidePacked) => set({ hidePacked })} />
          {packed === list.items.length && list.items.length > 0 && <Note tone="ok">Everything is packed. Have a great trip! ✈</Note>}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 14 }}>
            {cats.map((c) => {
              const all = list.items.filter((i) => i.cat === c)
              const its = s.hidePacked ? all.filter((i) => !i.packed) : all
              if (!all.length) return null
              return (
                <div key={c} style={{ border: '1px solid var(--line)', borderRadius: 10, padding: '8px 10px', background: 'var(--panel)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 800, marginBottom: 4 }}>
                    <span>{c}</span>
                    <span className="muted" style={{ fontWeight: 600, fontSize: 12.5 }}>{all.filter((i) => i.packed).length}/{all.length}</span>
                  </div>
                  {its.map((i) => (
                    <div key={i.id} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '3px 0', borderTop: '1px solid var(--line)' }}>
                      <input type="checkbox" checked={i.packed} onChange={(e) => editItem(i.id, { packed: e.target.checked })} aria-label={i.name} style={{ width: 18, height: 18 }} />
                      <span style={{ flex: 1, minWidth: 0, textDecoration: i.packed ? 'line-through' : undefined, opacity: i.packed ? 0.55 : 1, fontSize: 14 }}>{i.name}</span>
                      <input type="number" min={1} value={i.qty} onChange={(e) => editItem(i.id, { qty: Math.max(1, Math.round(Number(e.target.value) || 1)) })} aria-label="Quantity" style={{ width: 52, padding: '2px 4px', border: '1px solid var(--line)', borderRadius: 6, background: 'var(--panel2)' }} />
                      <button type="button" className="k-btn ghost" style={{ padding: '2px 6px' }} title="Remove" onClick={() => upd((l) => ({ ...l, items: l.items.filter((x) => x.id !== i.id), removed: i.custom ? l.removed : [...l.removed, i.name] }))}>✕</button>
                    </div>
                  ))}
                </div>
              )
            })}
          </div>
        </Panel>
        <Panel title="Add your own item">
          <Row>
            <Txt label="Item" value={newItem} onChange={setNewItem} placeholder="e.g. Camera" />
            <label className="k-field">
              <span className="k-label">Category</span>
              <select className="k-select" value={newCat} onChange={(e) => setNewCat(e.target.value)}>
                {CATS.map((c) => (
                  <option key={c}>{c}</option>
                ))}
              </select>
            </label>
            <div style={{ marginBottom: 10 }}>
              <Btn kind="primary" disabled={!newItem.trim()} onClick={() => {
                upd((l) => ({ ...l, items: [...l.items, { id: uid(), cat: newCat, name: newItem.trim(), qty: 1, packed: false, custom: true }], removed: l.removed.filter((r) => r !== newItem.trim()) }))
                setNewItem('')
              }}>Add</Btn>
            </div>
          </Row>
          {list.removed.length > 0 && (
            <p className="muted" style={{ fontSize: 13, margin: 0 }}>
              {list.removed.length} suggested item{list.removed.length > 1 ? 's' : ''} hidden.{' '}
              <button type="button" className="k-btn ghost" style={{ padding: '2px 6px' }} onClick={() => upd((l) => rebuild({ ...l, removed: [] }, l.settings))}>Restore suggestions</button>
            </p>
          )}
        </Panel>
      </div>
    </Split>
  )
}
